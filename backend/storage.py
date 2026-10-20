"""Where the tracker's data lives. Two adapters: the JSON file the app uses, and memory for tests.

Both hold one JSON-shaped dict. load() returns None when nothing has been saved yet.
"""
import copy
import json
import os


class JsonFileStore:
    def __init__(self, path):
        self.path = path

    def load(self):
        if not os.path.exists(self.path):
            return None
        with open(self.path, encoding="utf-8") as f:
            return json.load(f)

    def save(self, data):
        # Write a temp file and rename it, so a crash mid-save never leaves half a file
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, self.path)


class MemoryStore:
    def __init__(self, data=None):
        self.data = copy.deepcopy(data)

    def load(self):
        return copy.deepcopy(self.data)

    def save(self, data):
        self.data = copy.deepcopy(data)
