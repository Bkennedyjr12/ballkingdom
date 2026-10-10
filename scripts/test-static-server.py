"""Loopback-only static server for browser verification.

A larger listen backlog accommodates the existing workout module import graph
when multiple fresh browser contexts load concurrently.
"""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class BrowserTestServer(ThreadingHTTPServer):
    request_queue_size = 128


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("port", type=int)
    args = parser.parse_args()
    with BrowserTestServer(("127.0.0.1", args.port), SimpleHTTPRequestHandler) as server:
        server.serve_forever()
