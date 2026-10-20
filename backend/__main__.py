"""Start LeetCode Helper:  python3 -m backend   then open http://localhost:8001

Standard library only. Data is saved to data.json in the retry-tracker folder.
Add --dev to restart on backend/ edits and reload the browser on any code edit.
Options: PORT, HOST (default 127.0.0.1) and TRACKER_DATA (path to the data file).
"""
import os
import threading

from .storage import JsonFileStore
from .tracker import Tracker
from .web import APP_DIR, DEV, make_server, restart_on_change

data_file = os.environ.get("TRACKER_DATA", os.path.join(APP_DIR, "data.json"))
host, port = os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8001"))
server = make_server(Tracker(JsonFileStore(data_file)), host, port)
print(f"LeetCode Helper running at http://localhost:{port}  (data: {data_file})" + ("  [dev]" if DEV else ""))
if DEV:
    threading.Thread(target=restart_on_change, daemon=True).start()
server.serve_forever()
