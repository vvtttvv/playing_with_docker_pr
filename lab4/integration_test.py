import requests
import time

LEADER = "http://localhost:5000"
FOLLOWERS = ["http://localhost:5001", "http://localhost:5002", "http://localhost:5003", "http://localhost:5004", "http://localhost:5005"]

def wait_for_services(timeout=30):
    print("Here I check if all services are ready to avoid connection refused")
    start = time.time()
    all_ready = False
    
    while time.time() - start < timeout and not all_ready:
        try:
            requests.get(f"{LEADER}/admin/get_quorum", timeout=2)
            for f in FOLLOWERS:
                requests.get(f"{f}/admin/store", timeout=2)
            all_ready = True
            print("All services ready!")
        except:
            time.sleep(0.5)
    
    if not all_ready:
        raise Exception("Services did not start in time")

def test_basic_write_and_read():
    print("\n=== Test 1: Basic Write and Read ===")
    
    key = "test-key-1"
    value = "test-value-1"
    
    print(f"Writing key={key}, value={value} to leader...")
    r = requests.post(f"{LEADER}/put/{key}", json={"value": value}, timeout=5)
    print(f"Leader response: {r.status_code} - {r.json()}")
    
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert r.json()["status"] == "ok", "Write should succeed"
    
    # Wait a bit for replication
    time.sleep(1)
    
    # Check leader
    r = requests.get(f"{LEADER}/get/{key}", timeout=3)
    assert r.status_code == 200
    assert r.json()["value"] == value
    print(f"Leader has correct value")
    
    # Check all followers
    for i, follower in enumerate(FOLLOWERS, 1):
        try:
            r = requests.get(f"{follower}/get/{key}", timeout=3)
            if r.status_code == 200:
                assert r.json()["value"] == value
                print(f"Follower {i} has correct value")
            else:
                print(f"Follower {i} missing key (status: {r.status_code})")
        except Exception as e:
            print(f"Follower {i} error: {e}")

def test_quorum_behavior():
    print("\n=== Test 2: Quorum Behavior ===")
    
    r = requests.post(f"{LEADER}/admin/set_quorum", json={"quorum": 3}, timeout=5)
    assert r.status_code == 200
    print("Set write quorum to 3")
    
    # Write multiple keys
    for i in range(5):
        key = f"quorum-test-{i}"
        value = f"value-{i}"
        r = requests.post(f"{LEADER}/put/{key}", json={"value": value}, timeout=5)
        if r.status_code == 200:
            replicas = r.json().get("replicas_confirmed", 0)
            print(f"Write {i+1}: confirmed on {replicas} replicas (quorum=3)")
            assert replicas >= 3, f"Expected at least 3 confirmations, got {replicas}"
        else:
            print(f"Write {i+1} failed: {r.json()}")

def test_concurrent_writes():
    print("\n=== Test 3: Concurrent Writes ===")
    
    import concurrent.futures
    
    def write_key(i):
        key = f"concurrent-{i}"
        value = f"value-{i}"
        r = requests.post(f"{LEADER}/put/{key}", json={"value": value}, timeout=10)
        return r.status_code == 200
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(write_key, i) for i in range(50)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]
    
    success_count = sum(results)
    print(f"{success_count}/50 concurrent writes succeeded")
    assert success_count >= 45, "Most writes should succeed"

def test_missing_key():
    print("\n=== Test 4: Missing Key Behavior ===")
    
    r = requests.get(f"{LEADER}/get/nonexistent-key", timeout=3)
    assert r.status_code == 404
    assert r.json()["found"] == False
    print("Correctly returns 404 for missing key")

def main():
    try:
        wait_for_services()
        
        test_basic_write_and_read()
        test_quorum_behavior()
        test_concurrent_writes()
        test_missing_key()
        
        print("\n" + "="*50)
        print("ALL TESTS PASSED!")
        print("="*50)
        
    except Exception as e:
        print(f"\nTEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        exit(1)

if __name__ == "__main__":
    main()