import unittest

from backend import leetcode


def fake(answers):
    calls = []

    def fetch(slug):
        calls.append(slug)
        return answers.get(slug)
    return fetch, calls


GROUP_ANAGRAMS = {"questionFrontendId": "49", "title": "Group Anagrams", "difficulty": "Medium", "isPaidOnly": False,
                  "topicTags": [{"name": "Array"}, {"name": "Hash Table"}]}


class LookupTest(unittest.TestCase):
    def setUp(self):
        leetcode._cache.clear()

    def test_shapes_leetcodes_answer(self):
        fetch, _ = fake({"group-anagrams": GROUP_ANAGRAMS})
        self.assertEqual(leetcode.lookup("group-anagrams", fetch), {
            "slug": "group-anagrams", "lc": 49, "name": "Group Anagrams", "difficulty": "Medium",
            "premium": False, "tags": ["Array", "Hash Table"]})

    def test_unknown_problem_is_none_and_not_cached(self):
        fetch, calls = fake({})
        self.assertIsNone(leetcode.lookup("nope", fetch))
        self.assertIsNone(leetcode.lookup("nope", fetch))
        self.assertEqual(calls, ["nope", "nope"])

    def test_answers_are_cached(self):
        fetch, calls = fake({"group-anagrams": GROUP_ANAGRAMS})
        leetcode.lookup("group-anagrams", fetch)
        leetcode.lookup("group-anagrams", fetch)
        self.assertEqual(calls, ["group-anagrams"])


if __name__ == "__main__":
    unittest.main()
