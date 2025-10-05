import socket
import os
import sys
import mimetypes
import urllib.parse

def generate_directory_listing(path, url_path):
    """
    Generates an HTML directory listing for the given path.
    """
    items = os.listdir(path)
    items.sort()
    html_items = []

    # Url for parent directory
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
            html_items.append(f'<li><a href="{href}">{item}</a></li>')

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

def handle_request(conn, base_dir):
    try:
        request = conn.recv(1024).decode("utf-8")
        if not request:
            return

        request_line = request.splitlines()[0]
        method, path, _ = request_line.split()

        if method != "GET":
            response = "HTTP/1.1 405 Method Not Allowed\r\n\r\nMethod Not Allowed"
            conn.sendall(response.encode())
            return

        # This part solves a trouble with %20 in URLs
        filepath = urllib.parse.unquote(path.lstrip("/"))
        full_path = os.path.join(base_dir, filepath)

        if not os.path.exists(full_path):
            response = "HTTP/1.1 404 Not Found\r\n\r\nFile not found"
            conn.sendall(response.encode())
            return

        if os.path.isdir(full_path):
            body = generate_directory_listing(full_path, path)
            headers = [
                "HTTP/1.1 200 OK",
                "Content-Type: text/html; charset=UTF-8",
                f"Content-Length: {len(body)}",
                "Connection: close"
            ]
            header_data = ("\r\n".join(headers) + "\r\n\r\n").encode("utf-8")
            conn.sendall(header_data + body)

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
            header_data = ("\r\n".join(headers) + "\r\n\r\n").encode("utf-8")
            conn.sendall(header_data + body)

    except Exception as e:
        error_msg = f"HTTP/1.1 500 Internal Server Error\r\n\r\nError: {str(e)}"
        conn.sendall(error_msg.encode())

def run_server(port, base_dir):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("0.0.0.0", port))
        s.listen(1)
        print(f"Serving {base_dir} on port {port}...")
        print(f"Open in browser: http://127.0.0.1:{port}/")

        try:
            while True:
                conn, addr = s.accept()
                with conn:
                    print(f"Connection from {addr}")
                    handle_request(conn, base_dir)
        except KeyboardInterrupt:
            #This shit doesn't work :(
            print("\nServer stopped by user")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python server.py <directory>")
        sys.exit(1)

    port = 8080
    base_dir = sys.argv[1]
    run_server(port, base_dir)
