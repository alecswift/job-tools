"""The HTTP layer: turns requests into Tracker calls, serves static/ and the shared ../design/ at /design/.

Started by __main__.py (python3 -m backend). In dev mode it also answers GET /api/dev/version,
so open pages know when to reload (see devmode.py).
"""
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, urlparse

from . import leetcode
from .tracker import SLUG, NotFound, to_slug

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(APP_DIR, "static")
DESIGN_DIR = os.path.join(os.path.dirname(APP_DIR), "design")


def apps(query):
    """GET /api/apps: where each job-tools app runs, for the app switcher. Only the ones set in
    LEETCODE_URL / LOG_URL: design/ui.js has the defaults."""
    urls = {"leetcode": os.environ.get("LEETCODE_URL"), "log": os.environ.get("LOG_URL")}
    return {app: url for app, url in urls.items() if url}


def lookup(query):
    """GET /api/lookup?q=<LeetCode link or slug>: the problem's details from LeetCode, for the Log dialog."""
    slug = to_slug(query.get("q", ""))
    info = leetcode.lookup(slug)
    if info is None:
        raise NotFound(f"LeetCode has no problem called {slug}.")
    return info


PROBLEM = r"/api/problems/(" + SLUG + ")"
# (method, path pattern, call). call gets the tracker, the input (JSON body, or the query string
# for GET) and the path's slug if any.
ROUTES = [
    ("GET", r"/api/state", lambda tracker, body: tracker.view()),
    ("GET", r"/api/lookup", lambda tracker, query: lookup(query)),
    ("GET", r"/api/apps", lambda tracker, query: apps(query)),
    ("POST", r"/api/preview", lambda tracker, body: tracker.preview(body)),
    ("POST", r"/api/problems", lambda tracker, body: tracker.add(body)),
    ("PUT", PROBLEM, lambda tracker, body, slug: tracker.edit(slug, body)),
    ("POST", PROBLEM + r"/retry", lambda tracker, body, slug: tracker.retry(slug, body)),
    ("DELETE", PROBLEM, lambda tracker, body, slug: tracker.delete(slug)),
    ("PUT", r"/api/plan", lambda tracker, body: tracker.set_plan(body)),
    ("PUT", r"/api/settings", lambda tracker, body: tracker.update_settings(body)),
    ("POST", r"/api/settings/reset", lambda tracker, body: tracker.reset_settings()),
]
CONTENT_TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
                 ".json": "application/json", ".svg": "image/svg+xml"}


class Handler(BaseHTTPRequestHandler):
    tracker = None  # set by make_server
    dev_version = None  # dev mode only: devmode.code_version, for GET /api/dev/version

    def log_message(self, fmt, *args):
        pass

    def send_body(self, body, ctype, status=200):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, obj, status=200):
        self.send_body(json.dumps(obj).encode(), "application/json", status)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length)) if length else {}
        if not isinstance(body, dict):
            raise ValueError("Send a JSON object.")
        return body

    def route(self, method):
        url = urlparse(self.path)
        path = url.path
        if self.dev_version and path == "/api/dev/version":
            return self.send_json({"version": self.dev_version()})
        if not path.startswith("/api/"):
            return self.serve_static(path) if method == "GET" else self.send_json({"error": "Not found"}, 404)
        for route_method, pattern, call in ROUTES:
            match = re.fullmatch(pattern, path)
            if route_method == method and match:
                try:
                    given = dict(parse_qsl(url.query)) if method == "GET" else self.read_body()
                    return self.send_json(call(self.tracker, given, *match.groups()))
                except NotFound as e:
                    return self.send_json({"error": str(e)}, 404)
                except leetcode.Unavailable as e:
                    return self.send_json({"error": str(e)}, 502)
                except (ValueError, TypeError) as e:  # json.JSONDecodeError is a ValueError
                    return self.send_json({"error": str(e)}, 400)
        self.send_json({"error": "Not found"}, 404)

    def serve_static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        root = STATIC_DIR
        if path.startswith("/design/"):
            root, path = DESIGN_DIR, path[len("/design"):]
        full = os.path.normpath(os.path.join(root, path.lstrip("/")))
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            if os.path.splitext(path)[1] or root == DESIGN_DIR:
                return self.send_body(b"Not found", "text/plain", 404)
            full = os.path.join(STATIC_DIR, "index.html")
        with open(full, "rb") as f:
            body = f.read()
        self.send_body(body, CONTENT_TYPES.get(os.path.splitext(full)[1], "application/octet-stream"))

    def do_GET(self): self.route("GET")
    def do_POST(self): self.route("POST")
    def do_PUT(self): self.route("PUT")
    def do_DELETE(self): self.route("DELETE")


def make_server(tracker, host, port, dev_version=None):
    handler = type("BoundHandler", (Handler,), {"tracker": tracker, "dev_version": staticmethod(dev_version)})
    return ThreadingHTTPServer((host, port), handler)
