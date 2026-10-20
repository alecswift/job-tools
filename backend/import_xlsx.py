"""Import rows and settings from LeetCode_Retry_Tracker.xlsx into data.json.

Usage:  pip install openpyxl
        python3 -m backend.import_xlsx path/to/LeetCode_Retry_Tracker.xlsx   (from the retry-tracker folder)

Problems are matched by LeetCode slug (from the Link column, or else the name):
existing ones are updated and keep their history; new ones are added.
"""
import os
import sys
from datetime import datetime

import openpyxl

from .storage import JsonFileStore
from .tracker import Tracker

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTING_CELLS = {"weightHelp": "B3", "weightConfidence": "B4", "weightTime": "B5", "spacingFactor": "B6",
                 "overdueCap": "B7", "masteredBelow": "B8", "targetEasy": "B11", "targetMedium": "B12",
                 "targetHard": "B13"}


def num(v):
    return None if v in (None, "") else float(v)


def main(path):
    wb = openpyxl.load_workbook(path, data_only=False)
    tracker = Tracker(JsonFileStore(os.environ.get("TRACKER_DATA", os.path.join(APP_DIR, "data.json"))))

    if "Settings" in wb.sheetnames:
        s = wb["Settings"]
        settings = {key: float(s[ref].value) for key, ref in SETTING_CELLS.items() if isinstance(s[ref].value, (int, float))}
        pats = [s.cell(r, 1).value for r in range(16, 41)]
        pats = [p.strip() for p in pats if isinstance(p, str) and p.strip()]
        if pats:
            settings["patterns"] = pats
        tracker.update_settings(settings)

    counts = {"added": 0, "updated": 0}
    for row in wb["Log"].iter_rows(min_row=2, values_only=True):
        lc, name, link, diff, pattern, last, attempts, help_, conf, time_, notes = (list(row) + [None] * 11)[:11]
        if not name:
            continue
        if isinstance(last, datetime):
            last = last.date().isoformat()
        counts[tracker.upsert({
            "lc": int(lc) if lc else None, "name": name, "slug": link, "difficulty": diff or "Medium",
            "pattern": pattern, "lastAttempted": last, "attempts": attempts or 1,
            "help": num(help_) or 0, "confidence": 10 if conf is None else num(conf), "time": num(time_),
            "notes": notes,
        })] += 1
    print(f"Imported {counts['added']} new, updated {counts['updated']}. Settings and patterns copied from the sheet.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
