"""The tracker: every change to your problems, plan marks and settings goes through here.

A problem is identified by its LeetCode slug ("two-sum"), the same key the plan uses,
so a plan tick and a logged problem refer to the same thing.

Each action loads the data, checks the input, saves, and returns the new view
(what GET /api/state sends). Bad input raises ValueError; an unknown slug raises NotFound.
"""
import re
import threading
from datetime import date

from .scheduling import DEFAULT_SETTINGS, clean_settings, interval_table, parse_date, score

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
    m = LC_URL.match(text.lower())
    if m:
        return m.group(1)
    if "/" in text:
        raise ValueError("Use a leetcode.com/problems/... link or just the slug, like two-sum.")
    slug = slugify(text)
    if not slug:
        raise ValueError("The LeetCode slug can't be empty.")
    return slug


def link(slug):
    return f"https://leetcode.com/problems/{slug}/"


def snapshot(p):
    return {k: p.get(k) for k in ("lastAttempted", "help", "confidence", "time")}


def migrate(data):
    """Bring saved data up to the current shape. Version 1 keyed problems by a random id and kept a link."""
    data.setdefault("problems", [])
    if data.get("version", 1) < 2:
        seen = set()
        for p in data["problems"]:
            m = LC_URL.match(str(p.get("link") or "").lower())
            slug = m.group(1) if m else slugify(p["name"])
            base, n = slug, 2
            while slug in seen:   # two entries for one problem: keep both rather than lose one
                slug, n = f"{base}-{n}", n + 1
            seen.add(slug)
            p["slug"] = slug
            p.pop("id", None)
            p.pop("link", None)
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
    v = body.get("quiz", [])
    if not isinstance(v, list) or not all(isinstance(x, str) and re.fullmatch(SLUG, x) for x in v):
        raise ValueError("quiz must be a list of problem slugs.")
    return {"quiz": list(dict.fromkeys(v))}


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
            s = self._load()["settings"]
        p = {k: fields.get(k) for k in ("difficulty", "attempts", "help", "confidence", "time")}
        if p["difficulty"] not in ("Easy", "Medium", "Hard"):
            p["difficulty"] = "Medium"
        r = score(p, s, self.today())
        return {k: r[k] for k in ("timeScore", "struggle", "interval", "mastered")}

    # ---------- problems ----------

    def add(self, fields):
        def change(data):
            p = self._clean(fields)
            if self._find(data, p["slug"]) is not None:
                raise ValueError(f"“{p['name']}” is already logged. Use Log retry when you redo it.")
            p["history"] = [snapshot(p)]
            data["problems"].append(p)
        return self._change(change)

    def edit(self, slug, fields):
        """Correct a problem's details. The latest history entry follows the edit."""
        def change(data):
            i = self._index(data, slug)
            cur = data["problems"][i]
            p = self._clean(fields, cur)
            j = self._find(data, p["slug"])
            if j is not None and j != i:
                raise ValueError(f"{p['slug']} is already logged as “{data['problems'][j]['name']}”.")
            history = list(cur.get("history") or [])
            p["history"] = history[:-1] + [snapshot(p)]
            data["problems"][i] = p
        return self._change(change)

    def retry(self, slug, fields):
        """Log a new attempt: the given (or today's) date, one more attempt, fresh scores."""
        def change(data):
            i = self._index(data, slug)
            cur = data["problems"][i]
            upd = {k: fields.get(k) for k in ("help", "confidence", "time")}
            upd["lastAttempted"] = fields.get("date") or self.today().isoformat()
            upd["attempts"] = int(cur.get("attempts") or 1) + 1
            if fields.get("notes"):
                upd["notes"] = fields["notes"]
            p = self._clean(upd, cur)
            p["history"] = list(cur.get("history") or []) + [snapshot(p)]
            data["problems"][i] = p
        return self._change(change)

    def delete(self, slug):
        def change(data):
            data["problems"].pop(self._index(data, slug))
        return self._change(change)

    def upsert(self, fields):
        """Add the problem, or replace one with the same slug and keep its history. Returns "added" or "updated"."""
        result = []

        def change(data):
            p = self._clean(fields)
            i = self._find(data, p["slug"])
            if i is None:
                p["history"] = [snapshot(p)]
                data["problems"].append(p)
                result.append("added")
            else:
                p["history"] = data["problems"][i].get("history") or [snapshot(p)]
                data["problems"][i] = p
                result.append("updated")
        self._change(change)
        return result[0]

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
        today, s = self.today(), data["settings"]
        problems = [dict(p, link=link(p["slug"]), **score(p, s, today)) for p in data["problems"]]
        return {"today": today.isoformat(), "settings": s, "problems": problems,
                "intervalTable": interval_table(s), "plan": data["plan"]}

    @staticmethod
    def _find(data, slug):
        return next((i for i, p in enumerate(data["problems"]) if p["slug"] == slug), None)

    def _index(self, data, slug):
        i = self._find(data, slug)
        if i is None:
            raise NotFound(f"{slug} isn't in your log.")
        return i

    def _clean(self, body, existing=None):
        p = dict(existing or {})
        for key in FIELDS:
            if key in body:
                p[key] = body[key]
        if not str(p.get("name") or "").strip():
            raise ValueError("Problem name is required.")
        p["name"] = str(p["name"]).strip()
        if body.get("slug"):
            p["slug"] = to_slug(body["slug"])
        elif not p.get("slug"):
            p["slug"] = to_slug(p["name"])
        if p.get("difficulty") not in ("Easy", "Medium", "Hard"):
            raise ValueError("Difficulty must be Easy, Medium or Hard.")
        for key in ("help", "confidence"):
            v = p.get(key)
            if v in (None, ""):
                raise ValueError(f"{key.capitalize()} is required (0-10).")
            v = float(v)
            if not 0 <= v <= 10:
                raise ValueError(f"{key.capitalize()} must be between 0 and 10.")
            p[key] = v
        p["time"] = None if p.get("time") in (None, "") else float(p["time"])
        if p["time"] is not None and p["time"] < 0:
            raise ValueError("Time can't be negative.")
        p["attempts"] = max(1, int(p.get("attempts") or 1))
        p["lc"] = None if p.get("lc") in (None, "") else int(p["lc"])
        p["lastAttempted"] = p.get("lastAttempted") or self.today().isoformat()
        parse_date(p["lastAttempted"])  # raises if malformed
        p["notes"] = p.get("notes") or ""
        p["pattern"] = p.get("pattern") or ""
        p.setdefault("history", [])
        return p
