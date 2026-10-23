import json
import threading
import unittest
import urllib.error
import urllib.request
from datetime import date
from unittest import mock

from backend import leetcode
from backend.storage import MemoryStore
from backend.tracker import Tracker
from backend.web import make_server


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = make_server(Tracker(MemoryStore(), today=lambda: date(2026, 10, 20)), "127.0.0.1", 0)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def call(self, method, path, body=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read(), r.headers.get("Content-Type")
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers.get("Content-Type")

    def json(self, method, path, body=None):
        status, out, _ = self.call(method, path, body)
        return status, json.loads(out)

    def test_problem_lifecycle(self):
        status, view = self.json("POST", "/api/problems", {"name": "Valid Anagram", "difficulty": "Easy", "help": 0, "confidence": 10})
        self.assertEqual(status, 200)
        self.assertIn("valid-anagram", [p["slug"] for p in view["problems"]])
        status, view = self.json("POST", "/api/problems/valid-anagram/retry", {"help": 0, "confidence": 10})
        self.assertEqual(next(p for p in view["problems"] if p["slug"] == "valid-anagram")["attempts"], 2)
        status, view = self.json("DELETE", "/api/problems/valid-anagram")
        self.assertNotIn("valid-anagram", [p["slug"] for p in view["problems"]])

    def test_errors(self):
        self.assertEqual(self.json("POST", "/api/problems", {"name": ""})[0], 400)
        self.assertEqual(self.json("PUT", "/api/problems/nope", {})[0], 404)
        self.assertEqual(self.json("POST", "/api/state")[0], 404)
        self.assertEqual(self.call("PUT", "/api/plan", raw=b"[1]")[0], 400)
        self.assertEqual(self.call("PUT", "/api/plan", raw=b"{not json")[0], 400)

    def test_preview(self):
        status, r = self.json("POST", "/api/preview", {"difficulty": "Easy", "help": 0, "confidence": 10, "attempts": 1})
        self.assertEqual((status, r["struggle"], r["interval"]), (200, 0.0, 16))

    def test_state_has_max_priority(self):
        self.assertEqual(self.json("GET", "/api/state")[1]["maxPriority"], 20.0)

    def test_dev_version_only_in_dev_mode(self):
        self.assertEqual(self.json("GET", "/api/dev/version")[0], 404)
        dev = make_server(Tracker(MemoryStore()), "127.0.0.1", 0, dev_version=lambda: 123.0)
        threading.Thread(target=dev.serve_forever, daemon=True).start()
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{dev.server_address[1]}/api/dev/version") as r:
                self.assertEqual(json.load(r), {"version": 123.0})
        finally:
            dev.shutdown()
            dev.server_close()

    def test_lookup(self):
        leetcode._cache.clear()
        answer = {"questionFrontendId": "1", "title": "Two Sum", "difficulty": "Easy", "isPaidOnly": False, "topicTags": []}
        with mock.patch("backend.leetcode.ask_leetcode", side_effect=lambda slug: answer if slug == "two-sum" else None):
            status, info = self.json("GET", "/api/lookup?q=" + "https%3A%2F%2Fleetcode.com%2Fproblems%2Ftwo-sum%2Fdescription%2F")
            self.assertEqual((status, info["lc"], info["slug"]), (200, 1, "two-sum"))
            status, info = self.json("GET", "/api/lookup?q=not-real")
            self.assertEqual((status, info["error"]), (404, "LeetCode has no problem called not-real."))
            self.assertEqual(self.json("GET", "/api/lookup?q=")[0], 400)
        with mock.patch("backend.leetcode.ask_leetcode", side_effect=leetcode.Unavailable("Couldn't reach LeetCode.")):
            self.assertEqual(self.json("GET", "/api/lookup?q=three-sum"), (502, {"error": "Couldn't reach LeetCode."}))

    def test_static_files(self):
        status, body, ctype = self.call("GET", "/")
        self.assertEqual((status, ctype), (200, "text/html; charset=utf-8"))
        self.assertIn(b'src="main.js"', body)
        self.assertEqual(self.call("GET", "/main.js")[2], "text/javascript")
        self.assertEqual(self.call("GET", "/missing.js")[0], 404)
        self.assertEqual(self.call("GET", "/../backend/web.py")[0], 404)
        self.assertEqual(self.call("GET", "/some/page")[0], 200)  # unknown pages get the app

    def test_shared_design_files(self):
        status, body, ctype = self.call("GET", "/design/tokens.css")
        self.assertEqual((status, ctype), (200, "text/css"))
        self.assertIn(b"--accent", body)
        self.assertEqual(self.call("GET", "/design/ui.js")[2], "text/javascript")
        self.assertEqual(self.call("GET", "/design/missing.css")[0], 404)
        self.assertEqual(self.call("GET", "/design/../leetcode-helper/backend/web.py")[0], 404)

    def test_app_addresses(self):
        with mock.patch.dict("os.environ", {"LEETCODE_URL": "", "LOG_URL": ""}):
            self.assertEqual(self.json("GET", "/api/apps"), (200, {}))  # design/ui.js fills in the defaults
        with mock.patch.dict("os.environ", {"LEETCODE_URL": "", "LOG_URL": "http://example.test:9002"}):
            self.assertEqual(self.json("GET", "/api/apps")[1], {"log": "http://example.test:9002"})


if __name__ == "__main__":
    unittest.main()
