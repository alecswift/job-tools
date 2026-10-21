"""Scheduling: the spreadsheet's formulas and the settings that tune them.

The only place Time Score, Struggle, Interval, Due Date, Retry Priority and Status
are worked out. The server, the dialog preview and the "How it works" table all ask here.
"""
import math
from datetime import date, datetime

DIFFICULTIES = ("Easy", "Medium", "Hard")
DEFAULT_DIFFICULTY = "Medium"
RETRY_NOW, NOT_YET, MASTERED = "Retry now", "Not yet", "Mastered"

# What one attempt records, and what a problem needs to be scored
ATTEMPT_FIELDS = ("help", "confidence", "time")
SCORE_FIELDS = ("difficulty", "attempts") + ATTEMPT_FIELDS
ATTEMPT_DEFAULTS = {"help": 0, "confidence": 10}  # solved solo, fully confident

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


def parse_date(text):
    return datetime.strptime(text, "%Y-%m-%d").date() if text else None


def _interval(struggle, attempts, settings):
    return xround((1 + (10 - struggle) * settings["spacingFactor"]) * 2 ** (attempts - 1))


def score(problem, settings, today):
    """The calculated columns for one problem's latest attempt.

    problem needs SCORE_FIELDS: difficulty, attempts, help, confidence and time (minutes, or None
    if not tracked). lastAttempted is optional: without it there's no due date, priority or status,
    which is what the dialog preview wants.
    """
    help_ = ATTEMPT_DEFAULTS["help"] if problem.get("help") is None else float(problem["help"])
    conf = ATTEMPT_DEFAULTS["confidence"] if problem.get("confidence") is None else float(problem["confidence"])
    minutes = problem.get("time")
    difficulty = problem.get("difficulty")
    target = settings["target" + (difficulty if difficulty in DIFFICULTIES else DEFAULT_DIFFICULTY)]

    time_score = None
    if minutes not in (None, ""):
        time_score = min(10.0, 5 * float(minutes) / target)

    wh, wc, wt = settings["weightHelp"], settings["weightConfidence"], settings["weightTime"]
    if time_score is None:
        # No time tracked: Struggle uses only Help and Confidence, rescaled to 0-10
        denom = (wh + wc) or 1
        struggle = (wh * help_ + wc * (10 - conf)) / denom
    else:
        struggle = wh * help_ + wc * (10 - conf) + wt * time_score
    struggle = xround(struggle, 1)

    attempts = max(1, int(problem.get("attempts") or 1))
    interval = _interval(struggle, attempts, settings)

    last = parse_date(problem.get("lastAttempted"))
    due = date.fromordinal(last.toordinal() + interval) if last else None
    mastered = struggle < settings["masteredBelow"] and attempts >= settings["masteredMinAttempts"]

    if last is None or mastered:
        priority = 0.0
    else:
        days_since = (today - last).days
        priority = xround(struggle * min(settings["overdueCap"], days_since / max(1, interval)), 1)

    if mastered:
        status = MASTERED
    elif last is None:
        status = ""
    elif today >= due:
        status = RETRY_NOW
    else:
        status = NOT_YET

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


def max_priority(settings):
    """The highest Retry Priority can go: Struggle 10, as overdue as the cap allows. Scales the queue's priority bars."""
    return 10 * settings["overdueCap"]


def interval_table(settings):
    """Days until the next retry for Struggle 0-10 on attempts 1-4, for the "How it works" page."""
    return [{"struggle": struggle, "intervals": [_interval(struggle, a, settings) for a in (1, 2, 3, 4)]}
            for struggle in range(0, 11)]


def clean_settings(body, current):
    """Apply a partial settings update. Raises ValueError on bad input."""
    settings = dict(current)
    for key in NUM_SETTINGS:
        if key in body:
            value = float(body[key])
            if value < 0:
                raise ValueError(f"{key} can't be negative.")
            settings[key] = value
    for difficulty in DIFFICULTIES:
        if settings["target" + difficulty] <= 0:
            raise ValueError("Target times must be above 0.")
    if "patterns" in body:
        if not isinstance(body["patterns"], list):
            raise ValueError("patterns must be a list.")
        pats = [str(x).strip() for x in body["patterns"] if str(x).strip()]
        settings["patterns"] = list(dict.fromkeys(pats))
    return settings
