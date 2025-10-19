import socket
import os
import sys
import mimetypes
import urllib.parse
import threading
import time
from collections import defaultdict, deque

request_counts = defaultdict(int)  # path -> number of requests
counts_lock = threading.Lock()     # used to fix race condition
rate_limits = defaultdict(deque)   # ip -> timestamps of recent requests
rate_lock = threading.Lock()

RATE_LIMIT = 5     # requests per second per IP
WORK_DELAY = 1.0   # artificial delay (seconds) for concurrency test

def generate_directory_listing(path, url_path):
    items = os.listdir(path)
    items.sort()
    html_items = []

    if url_path != "/":
        parent_href = urllib.parse.urljoin(url_path + "/", "..")
        html_items.append(f'<li><a href="{parent_href}">.. (parent)</a></li>')

    for item in items:
        item_path = os.path.join(path, item)
        href = urllib.parse.urljoin(url_path + "/", item)
        if os.path.isdir(item_path):
            href += "/"
            html_items.append(f'<li>[DIR] <a href="{href}">{item}/</a></li>')
        else:
            count = request_counts[item_path]
            html_items.append(f'<li><a href="{href}">{item}</a> '
                              f'(requests: {count})</li>')

    html = f"""
    <html>
    <head>
        <title>Directory listing for {url_path}</title>
        <meta charset="UTF-8">
    </head>
    <body>
        <h2>Index of {url_path}</h2>
        <ul>
            {''.join(html_items)}
        </ul>
    </body>
    </html>
    """
    return html.encode("utf-8")

def check_rate_limit(ip):
    now = time.monotonic()
    with rate_lock:
        q = rate_limits[ip]
        while q and now - q[0] > 1:
            q.popleft() # Remove requests older than 1 second
        if len(q) >= RATE_LIMIT:
            return False
        q.append(now)
        return True

def handle_request(conn, addr, base_dir):
    ip = addr[0]
    try:
        request = conn.recv(1024).decode("utf-8")
        if not request:
            return

        if not check_rate_limit(ip):
            response = "HTTP/1.1 429 Too Many Requests\r\n\r\nRate limit exceeded"
            conn.sendall(response.encode())
            return

        request_line = request.splitlines()[0]
        method, path, _ = request_line.split()

        if method != "GET":
            response = "HTTP/1.1 405 Method Not Allowed\r\n\r\nMethod Not Allowed"
            conn.sendall(response.encode())
            return

        filepath = urllib.parse.unquote(path.lstrip("/"))
        full_path = os.path.join(base_dir, filepath)

        if not os.path.exists(full_path):
            response = "HTTP/1.1 404 Not Found\r\n\r\nFile not found"
            conn.sendall(response.encode())
            return

        time.sleep(WORK_DELAY) #here we simulate some work being done




        # Increassing counter
        # old_value = request_counts[full_path]
        # time.sleep(0.001)
        # request_counts[full_path] = old_value + 1 
        with counts_lock:
            request_counts[full_path] += 1



        if os.path.isdir(full_path):
            body = generate_directory_listing(full_path, path)
            headers = [
                "HTTP/1.1 200 OK",
                "Content-Type: text/html; charset=UTF-8",
                f"Content-Length: {len(body)}",
                "Connection: close"
            ]
            conn.sendall("\r\n".join(headers).encode() + b"\r\n\r\n" + body)
        else:
            mime_type, _ = mimetypes.guess_type(full_path)
            if mime_type is None:
                mime_type = "application/octet-stream"

            with open(full_path, "rb") as f:
                body = f.read()

            headers = [
                "HTTP/1.1 200 OK",
                f"Content-Type: {mime_type}",
                f"Content-Length: {len(body)}",
                "Connection: close"
            ]
            conn.sendall("\r\n".join(headers).encode() + b"\r\n\r\n" + body)

    except Exception as e:
        error_msg = f"HTTP/1.1 500 Internal Server Error\r\n\r\nError: {str(e)}"
        conn.sendall(error_msg.encode())
    finally:
        conn.close()


def run_server(port, base_dir):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("0.0.0.0", port))
        s.listen()
        print(f"Serving {base_dir} on port {port}...")
        print(f"Open in browser: http://http://localhost/:{port}/")

        try:
            while True: 
                conn, addr = s.accept()   #addr - (addr ip, addr port); conn - socket object
                print(f"Connection from {addr}")
                thread = threading.Thread(target=handle_request, args=(conn, addr, base_dir))
                thread.daemon = True #will not wait
                thread.start()
        except KeyboardInterrupt:
            print("\nServer stopped by user")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python server.py <directory>")
        sys.exit(1)

    port = 8080
    base_dir = sys.argv[1]
    run_server(port, base_dir)
