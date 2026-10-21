"""The tracker: every change to your problems, plan marks and settings goes through here.

A problem is identified by its LeetCode slug ("two-sum"), the same key the plan uses,
so a plan tick and a logged problem refer to the same thing.

Each action loads the data, checks the input, saves, and returns the new view
(what GET /api/state sends). Bad input raises ValueError; an unknown slug raises NotFound.
"""
import re
import threading
from datetime import date

from .scheduling import (ATTEMPT_FIELDS, DEFAULT_SETTINGS, DIFFICULTIES, SCORE_FIELDS, clean_settings, interval_table,
                         max_priority, parse_date, score)

VERSION = 3
FIELDS = ("lc", "name", "difficulty", "pattern", "lastAttempted", "attempts", "help", "confidence", "time", "notes")
SLUG = r"[a-z0-9]+(?:-[a-z0-9]+)*"
LC_URL = re.compile(r"(?:https?://)?(?:www\.)?leetcode\.com/problems/(" + SLUG + r")")


class NotFound(Exception):
    pass


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")


def to_slug(text):
    """A LeetCode problem URL, a slug, or a title -> the slug."""
    text = str(text).strip()
    match = LC_URL.match(text.lower())
    if match:
        return match.group(1)
    if "/" in text:
        raise ValueError("Use a leetcode.com/problems/... link or just the slug, like two-sum.")
    slug = slugify(text)
    if not slug:
        raise ValueError("The LeetCode slug can't be empty.")
    return slug


def link(slug):
    return f"https://leetcode.com/problems/{slug}/"


def snapshot(problem):
    """One history entry: when the attempt was and how it went."""
    return {k: problem.get(k) for k in ("lastAttempted",) + ATTEMPT_FIELDS}


def migrate(data):
    """Bring saved data up to the current shape. Version 1 keyed problems by a random id and kept a link."""
    data.setdefault("problems", [])
    if data.get("version", 1) < 2:
        seen = set()
        for problem in data["problems"]:
            match = LC_URL.match(str(problem.get("link") or "").lower())
            slug = match.group(1) if match else slugify(problem["name"])
            base, n = slug, 2
            while slug in seen:   # two entries for one problem: keep both rather than lose one
                slug, n = f"{base}-{n}", n + 1
            seen.add(slug)
            problem["slug"] = slug
            problem.pop("id", None)
            problem.pop("link", None)
        data["version"] = 2
    data.setdefault("plan", {"quiz": []})
    if data["version"] < 3:
        # Version 2 kept Solved marks; a plan tick now means the problem is logged.
        # Marks for problems that were never logged become Quiz marks rather than vanish.
        logged = {p["slug"] for p in data["problems"]}
        plan = data["plan"]
        quiz = plan.get("quiz", [])
        plan["quiz"] = list(dict.fromkeys(quiz + [s for s in plan.pop("done", []) if s not in logged]))
        data["version"] = 3
    data["settings"] = dict(DEFAULT_SETTINGS, **data.get("settings", {}))
    return data


def clean_plan(body):
    """Plan marks: the slugs done via the NeetCode quiz. Solved plan problems are the logged ones, so aren't stored here."""
    quiz = body.get("quiz", [])
    if not isinstance(quiz, list) or not all(isinstance(x, str) and re.fullmatch(SLUG, x) for x in quiz):
        raise ValueError("quiz must be a list of problem slugs.")
    return {"quiz": list(dict.fromkeys(quiz))}


class Tracker:
    def __init__(self, store, today=date.today):
        self.store = store
        self.today = today
        self.lock = threading.Lock()

    # ---------- reading ----------

    def view(self):
        with self.lock:
            return self._view(self._load())

    def preview(self, fields):
        """Scores for a problem that isn't saved, for the dialogs: struggle, interval, mastered."""
        with self.lock:
            settings = self._load()["settings"]
        scores = score({k: fields.get(k) for k in SCORE_FIELDS}, settings, self.today())
        return {k: scores[k] for k in ("timeScore", "struggle", "interval", "mastered")}

    # ---------- problems ----------

    def add(self, fields):
        def change(data):
            problem = self._clean(fields)
            if self._find(data, problem["slug"]) is not None:
                raise ValueError(f"“{problem['name']}” is already logged. Use Log retry when you redo it.")
            problem["history"] = [snapshot(problem)]
            data["problems"].append(problem)
        return self._change(change)

    def edit(self, slug, fields):
        """Correct a problem's details. The latest history entry follows the edit."""
        def change(data):
            i = self._index(data, slug)
            current = data["problems"][i]
            problem = self._clean(fields, current)
            j = self._find(data, problem["slug"])
            if j is not None and j != i:
                raise ValueError(f"{problem['slug']} is already logged as “{data['problems'][j]['name']}”.")
            history = list(current.get("history") or [])
            problem["history"] = history[:-1] + [snapshot(problem)]
            data["problems"][i] = problem
        return self._change(change)

    def retry(self, slug, fields):
        """Log a new attempt: the given (or today's) date, one more attempt, fresh scores. Blank notes keep the old ones."""
        def change(data):
            i = self._index(data, slug)
            current = data["problems"][i]
            attempt = {k: fields.get(k) for k in ATTEMPT_FIELDS}
            attempt["lastAttempted"] = fields.get("date") or self.today().isoformat()
            attempt["attempts"] = int(current.get("attempts") or 1) + 1
            if fields.get("notes"):
                attempt["notes"] = fields["notes"]
            problem = self._clean(attempt, current)
            problem["history"] = list(current.get("history") or []) + [snapshot(problem)]
            data["problems"][i] = problem
        return self._change(change)

    def delete(self, slug):
        def change(data):
            data["problems"].pop(self._index(data, slug))
        return self._change(change)

    # ---------- plan and settings ----------

    def set_plan(self, marks):
        def change(data):
            data["plan"] = clean_plan(marks)
        return self._change(change)

    def update_settings(self, body):
        def change(data):
            data["settings"] = clean_settings(body, data["settings"])
        return self._change(change)

    def reset_settings(self):
        """Restore the default numbers and keep the pattern list."""
        def change(data):
            data["settings"] = dict(DEFAULT_SETTINGS, patterns=data["settings"]["patterns"])
        return self._change(change)

    # ---------- internals ----------

    def _load(self):
        raw = self.store.load()
        if raw is None:
            raw = {"version": VERSION, "settings": dict(DEFAULT_SETTINGS), "problems": [], "plan": {"quiz": []}}
        return migrate(raw)

    def _change(self, change):
        with self.lock:
            data = self._load()
            change(data)
            self.store.save(data)
            return self._view(data)

    def _view(self, data):
        today, settings = self.today(), data["settings"]
        problems = [dict(p, link=link(p["slug"]), **score(p, settings, today)) for p in data["problems"]]
        return {"today": today.isoformat(), "settings": settings, "problems": problems,
                "intervalTable": interval_table(settings), "maxPriority": max_priority(settings), "plan": data["plan"]}

    @staticmethod
    def _find(data, slug):
        return next((i for i, p in enumerate(data["problems"]) if p["slug"] == slug), None)

    def _index(self, data, slug):
        i = self._find(data, slug)
        if i is None:
            raise NotFound(f"{slug} isn't in your log.")
        return i

    def _clean(self, body, existing=None):
        problem = dict(existing or {})
        for key in FIELDS:
            if key in body:
                problem[key] = body[key]
        if not str(problem.get("name") or "").strip():
            raise ValueError("Problem name is required.")
        problem["name"] = str(problem["name"]).strip()
        if body.get("slug"):
            problem["slug"] = to_slug(body["slug"])
        elif not problem.get("slug"):
            problem["slug"] = to_slug(problem["name"])
        if problem.get("difficulty") not in DIFFICULTIES:
            raise ValueError(f"Difficulty must be {', '.join(DIFFICULTIES[:-1])} or {DIFFICULTIES[-1]}.")
        for key in ("help", "confidence"):
            value = problem.get(key)
            if value in (None, ""):
                raise ValueError(f"{key.capitalize()} is required (0-10).")
            value = float(value)
            if not 0 <= value <= 10:
                raise ValueError(f"{key.capitalize()} must be between 0 and 10.")
            problem[key] = value
        problem["time"] = None if problem.get("time") in (None, "") else float(problem["time"])
        if problem["time"] is not None and problem["time"] < 0:
            raise ValueError("Time can't be negative.")
        problem["attempts"] = max(1, int(problem.get("attempts") or 1))
        problem["lc"] = None if problem.get("lc") in (None, "") else int(problem["lc"])
        problem["lastAttempted"] = problem.get("lastAttempted") or self.today().isoformat()
        parse_date(problem["lastAttempted"])  # raises if malformed
        problem["notes"] = problem.get("notes") or ""
        problem["pattern"] = problem.get("pattern") or ""
        problem.setdefault("history", [])
        return problem
