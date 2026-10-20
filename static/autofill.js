// Turn a pasted LeetCode link into Log dialog fields: number, title and difficulty from LeetCode,
// and a Pattern from the plan's topic for that problem or, failing that, LeetCode's tags.
import { PLAN, TOPIC_PATTERN } from "./plan.js";
import { lookup } from "./store.js";

// LeetCode tag -> tracker pattern, most telling first (tree problems are also tagged DFS, most things Array)
const TAG_PATTERNS = [
  ["Trie", "Tries"], ["Heap (Priority Queue)", "Heap / Priority Queue"], ["Backtracking", "Backtracking"],
  ["Sliding Window", "Sliding Window"], ["Linked List", "Linked List"], ["Union Find", "Graphs"], ["Graph", "Graphs"],
  ["Topological Sort", "Graphs"], ["Shortest Path", "Graphs"], ["Binary Tree", "Trees"], ["Binary Search Tree", "Trees"],
  ["Tree", "Trees"], ["Dynamic Programming", "Dynamic Programming"], ["Binary Search", "Binary Search"],
  ["Monotonic Stack", "Stack"], ["Stack", "Stack"], ["Two Pointers", "Two Pointers"], ["Depth-First Search", "Graphs"],
  ["Breadth-First Search", "Graphs"], ["Bit Manipulation", "Bit Manipulation"], ["Greedy", "Greedy"],
  ["Geometry", "Math & Geometry"], ["Math", "Math & Geometry"], ["Hash Table", "Arrays & Hashing"],
  ["Array", "Arrays & Hashing"], ["String", "Arrays & Hashing"],
];
const PLAN_BY_SLUG = Object.fromEntries(PLAN.problems.map(p => [p.slug, p]));

// patterns: the Pattern dropdown's choices. Returns { slug, lc, name, difficulty, premium, pattern } ("" if no good guess).
export async function lookupFields(text, patterns) {
  const info = await lookup(text);
  const inPlan = PLAN_BY_SLUG[info.slug];
  const guess = inPlan ? TOPIC_PATTERN[inPlan.topic] : TAG_PATTERNS.find(([tag, pat]) => info.tags.includes(tag) && patterns.includes(pat))?.[1];
  return { ...info, pattern: patterns.includes(guess) ? guess : "" };
}
