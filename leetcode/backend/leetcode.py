"""Look up a LeetCode problem by slug: its number, title, difficulty and topic tags.

Uses LeetCode's public GraphQL endpoint (no sign-in needed). Answers are kept for as long as
the server runs, since a problem's details don't change.
"""
import json
import urllib.request

URL = "https://leetcode.com/graphql"
QUERY = "query q($s: String!) { question(titleSlug: $s) { questionFrontendId title difficulty isPaidOnly topicTags { name } } }"


class Unavailable(Exception):
    """LeetCode couldn't be reached or sent something unexpected."""


def ask_leetcode(slug):
    """Ask LeetCode about one slug. Returns the GraphQL `question` object, or None if there's no such problem."""
    body = json.dumps({"query": QUERY, "variables": {"s": slug}}).encode()
    # LeetCode refuses Python's default User-Agent, so send our own
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json", "Referer": "https://leetcode.com", "User-Agent": "leetcode-helper/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.load(r)["data"]["question"]
    except (OSError, ValueError, KeyError, TypeError) as e:
        raise Unavailable("Couldn't reach LeetCode.") from e


_cache = {}


def lookup(slug, fetch=None):
    """The problem's details, or None if LeetCode has no problem with that slug. Raises Unavailable.

    fetch replaces the call to LeetCode (tests pass a fake).
    """
    if slug not in _cache:
        q = (fetch or ask_leetcode)(slug)
        if q is None:
            return None
        _cache[slug] = {
            "slug": slug,
            "lc": int(q["questionFrontendId"]) if str(q.get("questionFrontendId") or "").isdigit() else None,
            "name": q["title"],
            "difficulty": q["difficulty"],
            "premium": bool(q.get("isPaidOnly")),
            "tags": [t["name"] for t in q.get("topicTags") or []],
        }
    return _cache[slug]
