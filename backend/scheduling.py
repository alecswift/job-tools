"""Scheduling: the spreadsheet's formulas and the settings that tune them.

The only place Time Score, Struggle, Interval, Due Date, Retry Priority and Status
are worked out. The server, the dialog preview and the "How it works" table all ask here.
"""
import math
from datetime import date, datetime

DEFAULT_SETTINGS = {
    "weightHelp": 0.45,         # share of Struggle from Help Needed
    "weightConfidence": 0.35,   # share from (10 - Confidence)
    "weightTime": 0.20,         # share from Time Score
    "spacingFactor": 1.5,       # days added to first interval per point of mastery
    "overdueCap": 2.0,          # max multiplier for how overdue a problem is
    "masteredBelow": 2.0,       # Struggle below this with 2+ attempts = Mastered
    "masteredMinAttempts": 2,
    "targetEasy": 20,
    "targetMedium": 40,
    "targetHard": 60,
    "patterns": [
        "Arrays & Hashing", "Two Pointers", "Sliding Window", "Stack", "Binary Search",
        "Linked List", "Trees", "Tries", "Heap / Priority Queue", "Backtracking", "Graphs",
        "Dynamic Programming", "Greedy", "Intervals", "Math & Geometry", "Bit Manipulation",
    ],
}

NUM_SETTINGS = [k for k, v in DEFAULT_SETTINGS.items() if isinstance(v, (int, float))]


def xround(x, n=0):
    """Round half away from zero, like Excel's ROUND (Python's round() rounds half to even)."""
    q = 10 ** n
    v = math.floor(abs(x) * q + 0.5 + 1e-9) / q
    v = math.copysign(v, x)
    return int(v) if n == 0 else v


def parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date() if s else None


def _interval(struggle, attempts, s):
    return xround((1 + (10 - struggle) * s["spacingFactor"]) * 2 ** (attempts - 1))


def score(p, s, today):
    """The calculated columns for one problem's latest attempt.

    p needs difficulty, attempts, help, confidence and time (minutes, or None if not tracked).
    lastAttempted is optional: without it there's no due date, priority or status, which is
    what the dialog preview wants.
    """
    help_, conf, t = p.get("help"), p.get("confidence"), p.get("time")
    help_ = 0 if help_ is None else float(help_)
    conf = 10 if conf is None else float(conf)
    target = s.get("target" + (p.get("difficulty") or "Medium"), 40) or 40

    time_score = None
    if t not in (None, ""):
        time_score = min(10.0, 5 * float(t) / target)

    wh, wc, wt = s["weightHelp"], s["weightConfidence"], s["weightTime"]
    if time_score is None:
        # No time tracked: Struggle uses only Help and Confidence, rescaled to 0-10
        denom = (wh + wc) or 1
        struggle = (wh * help_ + wc * (10 - conf)) / denom
    else:
        struggle = wh * help_ + wc * (10 - conf) + wt * time_score
    struggle = xround(struggle, 1)

    attempts = max(1, int(p.get("attempts") or 1))
    interval = _interval(struggle, attempts, s)

    last = parse_date(p.get("lastAttempted"))
    due = date.fromordinal(last.toordinal() + interval) if last else None
    mastered = struggle < s["masteredBelow"] and attempts >= s["masteredMinAttempts"]

    if last is None or mastered:
        priority = 0.0
    else:
        days_since = (today - last).days
        priority = xround(struggle * min(s["overdueCap"], days_since / max(1, interval)), 1)

    if mastered:
        status = "Mastered"
    elif last is None:
        status = ""
    elif today >= due:
        status = "Retry now"
    else:
        status = "Not yet"

    return {
        "timeScore": None if time_score is None else xround(time_score, 1),
        "struggle": struggle,
        "interval": interval,
        "dueDate": due.isoformat() if due else None,
        "daysUntilDue": (due - today).days if due else None,
        "priority": priority,
        "mastered": mastered,
        "status": status,
    }


def interval_table(s):
    """Days until the next retry for Struggle 0-10 on attempts 1-4, for the "How it works" page."""
    return [{"struggle": st, "intervals": [_interval(st, a, s) for a in (1, 2, 3, 4)]} for st in range(0, 11)]


def clean_settings(body, current):
    """Apply a partial settings update. Raises ValueError on bad input."""
    s = dict(current)
    for key in NUM_SETTINGS:
        if key in body:
            v = float(body[key])
            if v < 0:
                raise ValueError(f"{key} can't be negative.")
            s[key] = v
    for key in ("targetEasy", "targetMedium", "targetHard"):
        if s[key] <= 0:
            raise ValueError("Target times must be above 0.")
    if "patterns" in body:
        if not isinstance(body["patterns"], list):
            raise ValueError("patterns must be a list.")
        pats = [str(x).strip() for x in body["patterns"] if str(x).strip()]
        s["patterns"] = list(dict.fromkeys(pats))
    return s
