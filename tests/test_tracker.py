import unittest
from datetime import date

from backend.storage import MemoryStore
from backend.tracker import NotFound, Tracker, to_slug

TODAY = date(2026, 10, 20)


def tracker(data=None):
    store = MemoryStore(data)
    return Tracker(store, today=lambda: TODAY), store


def two_sum(**kw):
    body = {"name": "Two Sum", "difficulty": "Easy", "help": 2, "confidence": 8, "time": 15}
    body.update(kw)
    return body


class SlugTest(unittest.TestCase):
    def test_accepts_links_slugs_and_titles(self):
        self.assertEqual(to_slug("https://leetcode.com/problems/move-zeroes/submissions/2177260881/"), "move-zeroes")
        self.assertEqual(to_slug("leetcode.com/problems/two-sum/description/?envType=x"), "two-sum")
        self.assertEqual(to_slug("two-sum"), "two-sum")
        self.assertEqual(to_slug("Pow(x, n)"), "pow-x-n")

    def test_rejects_other_links(self):
        with self.assertRaises(ValueError):
            to_slug("https://neetcode.io/problems/two-sum")


class ProblemTest(unittest.TestCase):
    def test_add_builds_slug_link_and_first_history_entry(self):
        t, store = tracker()
        view = t.add(two_sum())
        p = view["problems"][0]
        self.assertEqual((p["slug"], p["link"]), ("two-sum", "https://leetcode.com/problems/two-sum/"))
        self.assertEqual(p["lastAttempted"], "2026-10-20")
        self.assertEqual(p["history"], [{"lastAttempted": "2026-10-20", "help": 2.0, "confidence": 8.0, "time": 15.0}])
        self.assertNotIn("link", store.data["problems"][0])  # derived, not stored

    def test_add_rejects_a_problem_already_logged(self):
        t, _ = tracker()
        t.add(two_sum())
        with self.assertRaisesRegex(ValueError, "already logged"):
            t.add(two_sum(slug="https://leetcode.com/problems/two-sum/"))

    def test_add_validates_input(self):
        t, _ = tracker()
        for bad in (two_sum(name=" "), two_sum(difficulty="Brutal"), two_sum(help=11), two_sum(confidence=None),
                    two_sum(time=-1), two_sum(lastAttempted="20/10/2026")):
            with self.assertRaises(ValueError, msg=bad):
                t.add(bad)

    def test_retry_adds_an_attempt_and_history(self):
        t, _ = tracker()
        t.add(two_sum())
        p = t.retry("two-sum", {"help": 0, "confidence": 10, "date": "2026-10-25"})["problems"][0]
        self.assertEqual((p["attempts"], p["lastAttempted"], p["time"]), (2, "2026-10-25", None))
        self.assertEqual(len(p["history"]), 2)
        self.assertEqual(p["history"][-1]["help"], 0.0)

    def test_retry_keeps_notes_unless_new_ones_given(self):
        t, _ = tracker()
        t.add(two_sum(notes="hash map"))
        self.assertEqual(t.retry("two-sum", {"help": 0, "confidence": 10, "notes": ""})["problems"][0]["notes"], "hash map")
        self.assertEqual(t.retry("two-sum", {"help": 0, "confidence": 10, "notes": "one pass"})["problems"][0]["notes"], "one pass")

    def test_edit_corrects_the_latest_history_entry(self):
        t, _ = tracker()
        t.add(two_sum())
        t.retry("two-sum", {"help": 3, "confidence": 7})
        p = t.edit("two-sum", {"help": 4})["problems"][0]
        self.assertEqual([h["help"] for h in p["history"]], [2.0, 4.0])

    def test_edit_can_change_the_slug_but_not_onto_another_problem(self):
        t, _ = tracker()
        t.add(two_sum())
        t.add(two_sum(name="3Sum", slug="3sum"))
        with self.assertRaisesRegex(ValueError, "already logged"):
            t.edit("two-sum", {"slug": "3sum"})
        view = t.edit("two-sum", {"slug": "two-sum-ii-input-array-is-sorted"})
        self.assertEqual([p["slug"] for p in view["problems"]], ["two-sum-ii-input-array-is-sorted", "3sum"])

    def test_unknown_slug(self):
        t, _ = tracker()
        for call in (lambda: t.edit("nope", {}), lambda: t.retry("nope", {}), lambda: t.delete("nope")):
            with self.assertRaises(NotFound):
                call()

    def test_delete(self):
        t, _ = tracker()
        t.add(two_sum())
        self.assertEqual(t.delete("two-sum")["problems"], [])

    def test_upsert_adds_then_updates_keeping_history(self):
        t, store = tracker()
        self.assertEqual(t.upsert(two_sum()), "added")
        t.retry("two-sum", {"help": 0, "confidence": 10})
        self.assertEqual(t.upsert(two_sum(help=1)), "updated")
        p = store.data["problems"][0]
        self.assertEqual((p["help"], len(p["history"])), (1.0, 2))

    def test_preview_scores_without_saving(self):
        t, store = tracker()
        r = t.preview({"difficulty": "Medium", "attempts": "2", "help": "0", "confidence": "10", "time": ""})
        self.assertEqual(r, {"timeScore": None, "struggle": 0.0, "interval": 32, "mastered": True})
        self.assertIsNone(store.data)


class PlanAndSettingsTest(unittest.TestCase):
    def test_plan_marks(self):
        t, _ = tracker()
        view = t.set_plan({"quiz": ["two-sum", "two-sum"]})
        self.assertEqual(view["plan"], {"quiz": ["two-sum"]})
        with self.assertRaises(ValueError):
            t.set_plan({"quiz": ["Two Sum"]})

    def test_reset_keeps_patterns(self):
        t, _ = tracker()
        t.update_settings({"spacingFactor": 3, "patterns": ["Trees"]})
        s = t.reset_settings()["settings"]
        self.assertEqual((s["spacingFactor"], s["patterns"]), (1.5, ["Trees"]))

    def test_empty_store_gives_defaults(self):
        t, _ = tracker()
        v = t.view()
        self.assertEqual((v["today"], v["problems"], v["plan"]), ("2026-10-20", [], {"quiz": []}))
        self.assertEqual(len(v["intervalTable"]), 11)


class MigrationTest(unittest.TestCase):
    V1 = {
        "settings": {"spacingFactor": 2.0},
        "problems": [
            {"id": "a1", "name": "Move Zeros", "link": "https://leetcode.com/problems/move-zeroes/submissions/1/",
             "difficulty": "Easy", "lastAttempted": "2026-10-20", "attempts": 1, "help": 8.0, "confidence": 9.0,
             "time": 25.0, "notes": "", "pattern": "", "lc": 283, "history": []},
            {"id": "b2", "name": "Move Zeroes again", "link": "https://leetcode.com/problems/move-zeroes/",
             "difficulty": "Easy", "lastAttempted": "2026-10-20", "attempts": 1, "help": 0.0, "confidence": 10.0,
             "time": None, "notes": "", "pattern": "", "lc": None, "history": []},
            {"id": "c3", "name": "Custom Thing", "link": "", "difficulty": "Easy", "lastAttempted": "2026-10-20",
             "attempts": 1, "help": 0.0, "confidence": 10.0, "time": None, "notes": "", "pattern": "", "lc": None, "history": []},
        ],
    }

    def test_v1_problems_are_keyed_by_slug_without_losing_any(self):
        t, store = tracker(self.V1)
        view = t.view()
        self.assertEqual([p["slug"] for p in view["problems"]], ["move-zeroes", "move-zeroes-2", "custom-thing"])
        self.assertEqual(view["settings"]["spacingFactor"], 2.0)
        self.assertEqual(view["settings"]["weightHelp"], 0.45)
        self.assertEqual(view["plan"], {"quiz": []})
        t.set_plan({"quiz": []})  # any save writes the new shape
        self.assertEqual(store.data["version"], 3)
        self.assertNotIn("id", store.data["problems"][0])
        self.assertNotIn("link", store.data["problems"][0])

    def test_v2_solved_marks_for_unlogged_problems_become_quiz_marks(self):
        problem = {"slug": "valid-anagram", "name": "Valid Anagram", "difficulty": "Easy", "lastAttempted": "2026-10-20",
                   "attempts": 1, "help": 0.0, "confidence": 10.0, "time": None, "notes": "", "pattern": "", "lc": 242, "history": []}
        v2 = {"version": 2, "problems": [problem],
              "plan": {"done": ["two-sum", "valid-anagram", "contains-duplicate"], "quiz": ["contains-duplicate"]}}
        t, store = tracker(v2)
        self.assertEqual(t.view()["plan"], {"quiz": ["contains-duplicate", "two-sum"]})
        t.set_plan(t.view()["plan"])
        self.assertEqual((store.data["version"], store.data["plan"]), (3, {"quiz": ["contains-duplicate", "two-sum"]}))


if __name__ == "__main__":
    unittest.main()
