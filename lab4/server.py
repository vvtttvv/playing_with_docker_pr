import os
import asyncio
import random
from aiohttp import web, ClientSession, ClientTimeout

# In-memory key-value store
store = {}
store_lock = asyncio.Lock()

# Role configuration
ROLE = os.environ.get("ROLE", "follower")
PORT = int(os.environ.get("PORT", "5000"))

# Leader-specific config
FOLLOWERS = os.environ.get("FOLLOWERS", "")
FOLLOWERS = [f.strip() for f in FOLLOWERS.split(",") if f.strip()]

MIN_DELAY_MS = float(os.environ.get("MIN_DELAY", "0.1"))
MAX_DELAY_MS = float(os.environ.get("MAX_DELAY", "1.0"))

# Write quorum
WRITE_QUORUM = int(os.environ.get("WRITE_QUORUM", "1"))

# Replication timeout per follower (seconds)
REPL_TIMEOUT = float(os.environ.get("REPL_TIMEOUT", "2.0"))

async def write_local(key, value):
    async with store_lock:
        store[key] = value

async def read_local(key):
    async with store_lock:
        return store.get(key)

async def get_key(request):
    key = request.match_info['key']
    val = await read_local(key)
    if val is None:
        return web.json_response({"found": False}, status=404)
    return web.json_response({"found": True, "value": val}, status=200)

async def replicate(request):
    try:
        body = await request.json()
    except:
        return web.json_response({"error": "bad request"}, status=400)
    
    if "key" not in body or "value" not in body:
        return web.json_response({"error": "bad request"}, status=400)
    
    key = body["key"]
    value = body["value"]
    await write_local(key, value)
    return web.json_response({"status": "ok"}, status=200)

async def replicate_to_follower(session, follower_addr, key, value):
    try:
        # Simulate variable network delay
        delay_ms = random.uniform(MIN_DELAY_MS, MAX_DELAY_MS)
        await asyncio.sleep(delay_ms / 1000.0)
        
        payload = {"key": key, "value": value}
        url = f"http://{follower_addr}/replicate"
        
        timeout = ClientTimeout(total=REPL_TIMEOUT)
        async with session.post(url, json=payload, timeout=timeout) as resp:
            if resp.status == 200:
                return True
    except Exception as e:
        print(f"Replication to {follower_addr} failed: {e}")
    return False

async def put_key(request):
    if ROLE != "leader":
        return web.json_response({"error": "not leader"}, status=403)
    
    key = request.match_info['key']
    
    try:
        body = await request.json()
    except:
        return web.json_response({"error": "bad request"}, status=400)
    
    if "value" not in body:
        return web.json_response({"error": "bad request"}, status=400)
    
    value = body["value"]
    
    # 1) Write locally synchronously
    await write_local(key, value)
    
    # 2) Replicate to followers
    required = WRITE_QUORUM
    
    if len(FOLLOWERS) == 0:
        if required <= 0:
            return web.json_response({"status": "ok", "replicas_confirmed": 0}, status=200)
        else:
            return web.json_response({"status": "error", "reason": "no followers"}, status=500)
    
    # Create tasks for all followers
    timeout = ClientTimeout(total=REPL_TIMEOUT)
    async with ClientSession(timeout=timeout) as session:
        tasks = [replicate_to_follower(session, f, key, value) for f in FOLLOWERS]
        
        confirmations = 0
        # Wait for tasks and count confirmations
        for coro in asyncio.as_completed(tasks):
            try:
                success = await coro
                if success:
                    confirmations += 1
                    # Early return if quorum reached
                    if confirmations >= required:
                        return web.json_response({
                            "status": "ok",
                            "replicas_confirmed": confirmations
                        }, status=200)
            except Exception:
                pass
        
        # Check final quorum
        if confirmations >= required:
            return web.json_response({
                "status": "ok",
                "replicas_confirmed": confirmations
            }, status=200)
        else:
            return web.json_response({
                "status": "error",
                "replicas_confirmed": confirmations,
                "reason": "quorum not reached"
            }, status=500)

async def admin_set_quorum(request):
    global WRITE_QUORUM
    if ROLE != "leader":
        return web.json_response({"error": "not leader"}, status=403)
    
    try:
        body = await request.json()
    except:
        return web.json_response({"error": "bad request"}, status=400)
    
    if "quorum" not in body:
        return web.json_response({"error": "bad request"}, status=400)
    
    WRITE_QUORUM = int(body["quorum"])
    return web.json_response({"status": "ok", "write_quorum": WRITE_QUORUM}, status=200)

async def admin_get_quorum(request):
    return web.json_response({"write_quorum": WRITE_QUORUM}, status=200)

async def admin_store_dump(request):
    async with store_lock:
        return web.json_response({"store": dict(store)}, status=200)

def create_app():
    app = web.Application()
    app.router.add_get('/get/{key}', get_key)
    app.router.add_post('/replicate', replicate)
    app.router.add_post('/put/{key}', put_key)
    app.router.add_post('/admin/set_quorum', admin_set_quorum)
    app.router.add_get('/admin/get_quorum', admin_get_quorum)
    app.router.add_get('/admin/store', admin_store_dump)
    return app

if __name__ == "__main__":
    app = create_app()
    print(f"Starting {ROLE} on port {PORT}")
    web.run_app(app, host="0.0.0.0", port=PORT)