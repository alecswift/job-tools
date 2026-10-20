import unittest
from datetime import date

from backend.scheduling import DEFAULT_SETTINGS, clean_settings, interval_table, score, xround

S = dict(DEFAULT_SETTINGS)


def p(**kw):
    base = {"difficulty": "Medium", "attempts": 1, "help": 5, "confidence": 5, "time": None, "lastAttempted": "2026-10-01"}
    base.update(kw)
    return base


class XroundTest(unittest.TestCase):
    def test_rounds_half_away_from_zero_like_excel(self):
        self.assertEqual(xround(0.5), 1)
        self.assertEqual(xround(2.5), 3)
        self.assertEqual(xround(2.25, 1), 2.3)
        self.assertEqual(xround(-2.5), -3)


class ScoreTest(unittest.TestCase):
    def test_without_time_struggle_uses_help_and_confidence_rescaled(self):
        r = score(p(), S, date(2026, 10, 1))
        self.assertEqual(r["timeScore"], None)
        self.assertEqual(r["struggle"], 5.0)        # (0.45*5 + 0.35*5) / 0.8
        self.assertEqual(r["interval"], 9)          # 1 + 5*1.5 = 8.5, rounded up

    def test_with_time_all_three_weights_apply(self):
        r = score(p(time=40), S, date(2026, 10, 1))
        self.assertEqual(r["timeScore"], 5.0)       # on target
        self.assertEqual(r["struggle"], 5.0)        # 2.25 + 1.75 + 0.2*5

    def test_time_score_caps_at_10(self):
        self.assertEqual(score(p(time=500), S, date(2026, 10, 1))["timeScore"], 10.0)

    def test_each_attempt_doubles_the_interval(self):
        self.assertEqual(score(p(help=0, confidence=10, attempts=1), S, date(2026, 10, 1))["interval"], 16)
        self.assertEqual(score(p(help=0, confidence=10, attempts=3), S, date(2026, 10, 1))["interval"], 64)

    def test_status_and_priority_over_time(self):
        before = score(p(), S, date(2026, 10, 9))
        self.assertEqual((before["status"], before["daysUntilDue"]), ("Not yet", 1))
        due = score(p(), S, date(2026, 10, 10))
        self.assertEqual((due["status"], due["dueDate"], due["priority"]), ("Retry now", "2026-10-10", 5.0))
        late = score(p(), S, date(2026, 10, 28))
        self.assertEqual(late["priority"], 10.0)    # overdue multiplier capped at 2

    def test_mastered_needs_low_struggle_and_enough_attempts(self):
        one = score(p(help=0, confidence=10), S, date(2026, 12, 1))
        self.assertFalse(one["mastered"])
        two = score(p(help=0, confidence=10, attempts=2), S, date(2026, 12, 1))
        self.assertEqual((two["mastered"], two["status"], two["priority"]), (True, "Mastered", 0.0))

    def test_without_a_date_there_is_no_schedule(self):
        r = score(p(lastAttempted=None), S, date(2026, 10, 1))
        self.assertEqual((r["dueDate"], r["status"], r["priority"]), (None, "", 0.0))

    def test_interval_table_matches_score(self):
        row = interval_table(S)[5]
        self.assertEqual(row, {"struggle": 5, "intervals": [9, 17, 34, 68]})


class SettingsTest(unittest.TestCase):
    def test_partial_update(self):
        s = clean_settings({"spacingFactor": "2", "patterns": [" Trees ", "", "Trees", "Graphs"]}, S)
        self.assertEqual(s["spacingFactor"], 2.0)
        self.assertEqual(s["patterns"], ["Trees", "Graphs"])
        self.assertEqual(s["weightHelp"], S["weightHelp"])

    def test_rejects_bad_values(self):
        for body in ({"weightHelp": -1}, {"targetEasy": 0}, {"patterns": "Trees"}, {"overdueCap": "x"}):
            with self.assertRaises(ValueError, msg=body):
                clean_settings(body, S)


if __name__ == "__main__":
    unittest.main()
