import socket
import sys
import os

def save_file(directory, filename, content):
    """Save a binary file into the specified directory."""
    os.makedirs(directory, exist_ok=True)
    filepath = os.path.join(directory, filename)
    with open(filepath, "wb") as f:
        f.write(content)
    print(f"Saved file: {filepath} ({len(content)} bytes)")


def http_get(host, port, resource):
    """Send an HTTP GET request and return the full response."""
    request = f"GET /{resource} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.connect((host, port))
        s.sendall(request.encode("utf-8"))

        response = b""
        while True:
            data = s.recv(4096)
            if not data:
                break
            response += data

    return response


def parse_response(response):
    """Split HTTP response into headers and body."""
    header_data, _, body = response.partition(b"\r\n\r\n")
    headers = header_data.decode("utf-8", errors="ignore").split("\r\n")
    return headers, body


def run_client(host, port, resource, save_dir="client_savings"):
    response = http_get(host, port, resource)
    headers, body = parse_response(response)

    content_type = None
    for h in headers:
        if h.lower().startswith("content-type"):
            content_type = h.split(":", 1)[1].strip().lower()
            break

    print("=== Response Headers ===")
    for h in headers:
        print(h)
    print("=========================\n")

    # HTML → print to console
    if content_type and "text/html" in content_type:
        print(body.decode("utf-8", errors="ignore"))
    else:
        # For binary files (PNG, PDF, etc.)-> save to directory
        filename = os.path.basename(resource)
        if not filename:
            filename = "index.html"
        save_file(save_dir, filename, body)


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python client.py <host> <port> <resource>")
        print("Example: python client.py localhost 8080 index.html")
        sys.exit(1)

    host = sys.argv[1]
    port = int(sys.argv[2])
    resource = sys.argv[3]

    run_client(host, port, resource)
