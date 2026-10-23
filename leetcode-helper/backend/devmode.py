"""Dev mode (python3 -m backend --dev): restart when backend/ changes, reload open pages when backend/, static/ or ../design/ changes.

The page asks GET /api/dev/version (served by web.py in dev mode only) and reloads when the answer changes.
"""
import os
import sys
import time

from .web import APP_DIR, DESIGN_DIR, STATIC_DIR

BACKEND_DIR = os.path.join(APP_DIR, "backend")


def _files(folder, ext=""):
    return [os.path.join(d, f) for d, _, files in os.walk(folder) for f in files if f.endswith(ext)]


def code_version():
    """Newest mtime across backend/, static/ and ../design/. The page reloads when this changes."""
    return max(os.path.getmtime(f) for f in _files(BACKEND_DIR, ".py") + _files(STATIC_DIR) + _files(DESIGN_DIR) if os.path.isfile(f))


def restart_on_change():
    """Restart the server when a .py file anywhere in backend/ changes. Skips edits that don't compile yet."""
    def mtimes():
        return {f: os.path.getmtime(f) for f in _files(BACKEND_DIR, ".py") if os.path.isfile(f)}
    seen = mtimes()
    while True:
        time.sleep(0.5)
        now = mtimes()
        if now == seen:
            continue
        seen = now
        try:
            for f in now:
                with open(f, encoding="utf-8") as src:
                    compile(src.read(), f, "exec")
        except SyntaxError as e:
            print(f"Syntax error, not restarting: {e}")
            continue
        print("Code changed, restarting...")
        # Start again the way we were started: python3 -m backend, with the same options
        os.execv(sys.executable, [sys.executable, "-m", "backend"] + sys.argv[1:])
