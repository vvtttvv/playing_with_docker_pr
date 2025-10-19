import requests
import threading
import time

URL = "http://127.0.0.1:8080/index.html"
N = 20 # number of concurrent requests to make

def make_request(i):
    r = requests.get(URL)
    print(f"Thread {i}: {r.status_code}")

def main():
    print("Testing concurrency...")
    start = time.time()

    threads = []
    for i in range(N):
        t = threading.Thread(target=make_request, args=(i,)) # target is the function to run in the thread; args is a tuple of arguments to pass to the function
        t.start()
        threads.append(t)

    for t in threads:
        t.join() # wait for all threads to complete

    end = time.time()
    duration = end - start
    print(f"\nHandled {N} concurrent requests in {duration:.2f} seconds.")

if __name__ == "__main__":
    main()
