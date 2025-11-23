import requests
import time
import random
import statistics
import concurrent.futures
import matplotlib.pyplot as plt
from collections import defaultdict

LEADER = "http://localhost:5000"
FOLLOWERS = ["http://localhost:5001", "http://localhost:5002", "http://localhost:5003", "http://localhost:5004", "http://localhost:5005"]

TOTAL_WRITES = 10000
CONCURRENCY = 20   # nr of concurrent threads
KEY_SPACE = 100

def wait_for_services(timeout=30):
    print("Here I check if all services are ready to avoid connection refused")
    start = time.time()
    
    while time.time() - start < timeout:
        try:
            requests.get(f"{LEADER}/admin/get_quorum", timeout=2)
            print("All services ready!")
            return
        except:
            time.sleep(0.5)
    
    raise Exception("Services did not start in time")

def set_quorum(q):
    r = requests.post(f"{LEADER}/admin/set_quorum", json={"quorum": q}, timeout=5)
    if r.status_code == 200:
        print(f"Set write quorum to {q}")
    else:
        print(f"Failed to set quorum: {r.text}")
    return r

def single_write(key, value):
    t0 = time.time()
    try:
        r = requests.post(f"{LEADER}/put/{key}", json={"value": value}, timeout=10)
        t1 = time.time()
        return (r.status_code, r.text, (t1 - t0))
    except Exception as e:
        t1 = time.time()
        return (500, str(e), (t1 - t0))

def run_for_quorum(q):
    print(f"\n{'='*60}")
    print(f"Running workload for QUORUM = {q}")
    print(f"{'='*60}")
    
    set_quorum(q)
    time.sleep(0.5)  # Let quorum change propagate
    
    keys = [f"key-{i % KEY_SPACE}" for i in range(TOTAL_WRITES)]
    random.shuffle(keys) # To make it look like real workload
    
    latencies = []
    errors = 0
    success = 0
    
    print(f"Starting {TOTAL_WRITES} writes with {CONCURRENCY} concurrent threads...")
    start_time = time.time()
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = [executor.submit(single_write, k, f"val-{i}-q{q}") for i, k in enumerate(keys)] # To simulate simultaneous writes
        
        completed = 0
        for fut in concurrent.futures.as_completed(futures):
            completed += 1
            if completed % 1000 == 0:
                print(f"  Progress: {completed}/{TOTAL_WRITES} writes completed...")
            
            try:
                status, text, lat = fut.result()
                latencies.append(lat)
                if status == 200:
                    success += 1
                else:
                    errors += 1
            except Exception as e:
                errors += 1
    
    end_time = time.time()
    total_time = end_time - start_time
    
    if latencies:
        avg = statistics.mean(latencies)
        p50 = statistics.median(latencies)
        p95 = statistics.quantiles(latencies, n=100)[94] if len(latencies) >= 100 else max(latencies)
        p99 = statistics.quantiles(latencies, n=100)[98] if len(latencies) >= 100 else max(latencies)
        min_lat = min(latencies)
        max_lat = max(latencies)
    else:
        avg = p50 = p95 = p99 = min_lat = max_lat = 0
    
    throughput = TOTAL_WRITES / total_time
    
    print(f"\n{'='*60}")
    print(f"Results for QUORUM = {q}:")
    print(f"  Total time:      {total_time:.2f}s")
    print(f"  Throughput:      {throughput:.2f} writes/sec")
    print(f"  Success:         {success}/{TOTAL_WRITES}")
    print(f"  Errors:          {errors}/{TOTAL_WRITES}")
    print(f"  Avg latency:     {avg*1000:.2f}ms")
    print(f"  P50 latency:     {p50*1000:.2f}ms")
    print(f"  P95 latency:     {p95*1000:.2f}ms")
    print(f"  P99 latency:     {p99*1000:.2f}ms")
    print(f"  Min latency:     {min_lat*1000:.2f}ms")
    print(f"  Max latency:     {max_lat*1000:.2f}ms")
    print(f"{'='*60}\n")
    
    return {
        "quorum": q,
        "avg": avg,
        "p50": p50,
        "p95": p95,
        "p99": p99,
        "min": min_lat,
        "max": max_lat,
        "errors": errors,
        "success": success,
        "throughput": throughput,
        "latencies": latencies
    }

def plot_results(results):
    qs = [r["quorum"] for r in results]
    avgs = [r["avg"] * 1000 for r in results]  # Convert to ms
    p50s = [r["p50"] * 1000 for r in results]
    p95s = [r["p95"] * 1000 for r in results]
    p99s = [r["p99"] * 1000 for r in results]
    throughputs = [r["throughput"] for r in results]
    
    # Plot 1: Latency metrics
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
    
    ax1.plot(qs, avgs, marker='o', label='Average', linewidth=2)
    ax1.plot(qs, p50s, marker='s', label='P50', linewidth=2)
    ax1.plot(qs, p95s, marker='^', label='P95', linewidth=2)
    ax1.plot(qs, p99s, marker='d', label='P99', linewidth=2)
    ax1.set_xlabel("Write Quorum (# follower confirmations)", fontsize=11)
    ax1.set_ylabel("Latency (ms)", fontsize=11)
    ax1.set_title("Write Quorum vs Latency", fontsize=12, fontweight='bold')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    ax1.set_xticks(qs)
    
    # Plot 2: Throughput
    ax2.plot(qs, throughputs, marker='o', color='green', linewidth=2)
    ax2.set_xlabel("Write Quorum (# follower confirmations)", fontsize=11)
    ax2.set_ylabel("Throughput (writes/sec)", fontsize=11)
    ax2.set_title("Write Quorum vs Throughput", fontsize=12, fontweight='bold')
    ax2.grid(True, alpha=0.3)
    ax2.set_xticks(qs)
    
    plt.tight_layout()
    plt.savefig("performance_analysis.png", dpi=300)
    print("Plot saved to performance_analysis.png")

def consistency_check():
    print(f"\n{'='*60}")
    print("CONSISTENCY CHECK")
    print(f"{'='*60}")
    
    try:
        # Fetch leader store
        r = requests.get(f"{LEADER}/admin/store", timeout=10)
        leader_store = r.json().get("store", {})
        leader_keys = set(leader_store.keys())
        print(f"Leader has {len(leader_keys)} keys")
        
        # Check each follower
        all_consistent = True
        for i, follower in enumerate(FOLLOWERS, 1):
            try:
                r = requests.get(f"{follower}/admin/store", timeout=10)
                follower_store = r.json().get("store", {})
                follower_keys = set(follower_store.keys())
                
                # Find differences
                missing_keys = leader_keys - follower_keys
                extra_keys = follower_keys - leader_keys
                value_mismatches = []
                
                for key in leader_keys & follower_keys:
                    if leader_store[key] != follower_store[key]:
                        value_mismatches.append(key)
                
                print(f"\nFollower {i}:")
                print(f"  Total keys:        {len(follower_keys)}")
                print(f"  Missing keys:      {len(missing_keys)}")
                print(f"  Extra keys:        {len(extra_keys)}")
                print(f"  Value mismatches:  {len(value_mismatches)}")
                
                if missing_keys or extra_keys or value_mismatches:
                    all_consistent = False
                    if missing_keys:
                        print(f"  Sample missing: {list(missing_keys)[:5]}")
                    if value_mismatches:
                        print(f"  Sample mismatches: {value_mismatches[:5]}")
                else:
                    print(f"  CONSISTENT with leader")
                    
            except Exception as e:
                print(f"\nFollower {i}:  ERROR - {e}")
                all_consistent = False
        
        print(f"\n{'='*60}")
        if all_consistent:
            print(" ALL REPLICAS CONSISTENT WITH LEADER")
        else:
            print(" INCONSISTENCIES DETECTED")
            print("\nPossible reasons:")
            print("  - Some writes failed to reach quorum but succeeded on some followers")
            print("  - Network delays caused some replications to be incomplete")
            print("  - This is expected in semi-synchronous replication!")
        print(f"{'='*60}\n")
        
    except Exception as e:
        print(f" Consistency check failed: {e}")

def main():
    try:
        wait_for_services()
        
        results = []
        for q in range(1, 6):
            result = run_for_quorum(q)
            results.append(result)
            # Small break between runs
            time.sleep(1)
        
        plot_results(results)
        
        # Wait a bit for all async replications to complete
        print("\nWaiting 5 seconds for all replications to complete...")
        time.sleep(5)
        
        consistency_check()
        
        # Print analysis summary
        print(f"\n{'='*60}")
        print("ANALYSIS SUMMARY")
        print(f"{'='*60}")
        print("\nExpected behavior:")
        print("1. Latency should INCREASE with quorum size")
        print("   - Higher quorum = wait for more followers = higher latency")
        print("2. Throughput should DECREASE with quorum size")
        print("   - More confirmations needed = slower writes")
        print("3. Consistency may vary:")
        print("   - Lower quorum = faster but less consistent")
        print("   - Higher quorum = slower but more consistent")
        print(f"{'='*60}\n")
        
    except Exception as e:
        print(f"\n✗ Performance test failed: {e}")
        import traceback
        traceback.print_exc()
        exit(1)

if __name__ == "__main__":
    main()