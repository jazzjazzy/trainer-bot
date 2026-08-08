import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "two-pointers",
  title: "Two Pointers and Fast/Slow",
  part: "Live Coding & Take-Homes",
  estMinutes: 12,
  summary:
    "Converging pointers on sorted data and a read/write pointer for in-place work turn nested-loop O(n²) scans into a single O(n) walk — the same index juggling you did in PHP before array_filter existed.",

  concept: `
Two pointers is the trick that turns a nested-loop O(n²) scan into a single
O(n) walk by moving **two indices through the array at once** instead of
restarting an inner loop every time. It shows up constantly on screens, and
it's the same index juggling you did in PHP before \`array_filter\` and
\`array_unique\` existed — a \`for\` loop with an \`$i\` and a \`$j\` you advanced
by hand.

### The two shapes worth memorising

**Converging pointers** start at both ends and move toward each other. Use
them on **sorted** data: pair-sum ("find two numbers that add to target"),
three-sum, palindrome checks, container-with-most-water. Because the array is
sorted, each comparison lets you *provably* discard one end, so you never
inspect the same pair twice.

**Read/write pointers** (also called slow/fast, or the "in-place" pattern)
walk the array in the same direction at different speeds. One pointer reads
every element; the other advances only when it has something worth keeping.
Use them for in-place dedup, moving zeros, partitioning, and "remove all X" —
anything phrased **"do it in place, O(1) extra space"**.

### The recognition triggers

Say these out loud when you spot them, because naming the trigger is half the
grade:

- **"sorted array"** + "find a pair / triple" → converging pointers, O(n).
- **"in place"** / "O(1) extra space" → read/write pointer.
- **"is it a palindrome"** → converging pointers from both ends.

### The trade-off to state

If the array **isn't** already sorted and the question lets you sort it, you
can sort first (O(n log n)) and then run converging pointers (O(n)). That's
often the right call — O(n log n) total still beats the O(n²) brute force —
but say it explicitly: "I'll sort, which costs n log n and destroys the
original order; if the caller needs the order or the original indices, I'd use
a hash map instead." That one sentence shows you know *why* you're sorting,
not just that sorting helps.

### Fast/slow for cycles

A special same-direction variant: send one pointer one step at a time and
another two steps at a time (Floyd's tortoise and hare). On a linked list
with a cycle they eventually land on the same node; with no cycle the fast one
runs off the end. It detects a loop in **O(1) extra space**, where the obvious
solution stores every node in a \`Set\` (O(n) space). You won't need it often,
but knowing it exists — and that it's the memory-free alternative to a visited
set — is worth a sentence in the right question.
`,

  comparisons: [
    {
      label: "Pair-sum on a sorted array: brute force vs converging",
      intro:
        "Decide whether two elements of a sorted array add up to a target. Both are correct; only one uses the fact that the array is sorted.",
      php: `// brute force: check every pair, sorted or not
function hasPairSum(nums: number[], target: number): boolean {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) return true;
    }
  }
  return false;
}
// O(n^2) time. Throws away the fact that nums is SORTED.`,
      ts: `// converging pointers: exploit the sort
function hasPairSum(nums: number[], target: number): boolean {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const sum = nums[lo] + nums[hi];
    if (sum === target) return true;
    if (sum < target) lo++;   // too small -> raise the low end
    else hi--;                // too big  -> lower the high end
  }
  return false;
}
// O(n) time, O(1) space. Each step provably rules out one candidate.`,
      note:
        "On a sorted array, if the sum is too small the smallest element can never help, so lo++ discards it safely; symmetrically for hi--. That guarantee is what collapses O(n²) to O(n).",
    },
    {
      label: "Dedup a sorted array: new array vs write pointer",
      intro:
        "Remove duplicates from a sorted array. The left builds a fresh array; the right does it in place with a write pointer and returns the new length.",
      php: `// build a brand-new array - O(n) EXTRA memory
function dedup(nums: number[]): number[] {
  const out: number[] = [];
  for (const n of nums) {
    if (out.length === 0 || out[out.length - 1] !== n) {
      out.push(n);
    }
  }
  return out;
}
// Fails the "in place, O(1) space" version of the question.`,
      ts: `// in place with a write pointer - O(1) EXTRA memory
function dedup(nums: number[]): number {
  if (nums.length === 0) return 0;
  let write = 1; // first element is always kept
  for (let read = 1; read < nums.length; read++) {
    if (nums[read] !== nums[write - 1]) {
      nums[write++] = nums[read]; // overwrite the next slot
    }
  }
  return write; // nums[0..write) now holds the unique values
}`,
      note:
        "read touches every element; write only advances when a new value appears. Because the array is sorted, duplicates are adjacent, so comparing against nums[write - 1] is enough.",
    },
    {
      label: "Cycle detection: visited Set vs fast/slow",
      intro:
        "Detect whether a linked list loops back on itself. Both are correct; one stores every node, the other uses two pointers and constant memory.",
      php: `interface Node { val: number; next: Node | null; }

// remember every node we have seen - O(n) memory
function hasCycle(head: Node | null): boolean {
  const seen = new Set<Node>();
  let cur = head;
  while (cur) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = cur.next;
  }
  return false;
}`,
      ts: `interface Node { val: number; next: Node | null; }

// Floyd's fast/slow: two pointers, O(1) memory
function hasCycle(head: Node | null): boolean {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow!.next;      // 1 step
    fast = fast.next.next;  // 2 steps
    if (slow === fast) return true; // they meet iff a cycle exists
  }
  return false; // fast ran off the end -> no cycle
}`,
      note:
        "If there's a cycle, the fast pointer laps the slow one and they collide; if not, fast reaches null first. Same O(n) time as the Set, but O(1) space instead of O(n).",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Two pointer shapes: isPalindrome (converging from both ends, traced step by step) and removeDuplicatesSorted (a read/write pointer). Predict the palindrome trace and the two returned lengths, then run it.",
    code: `// Shape A: converging pointers -> isPalindrome
function isPalindrome(s: string): boolean {
  let lo = 0, hi = s.length - 1;
  while (lo < hi) {
    console.log(\`  lo=\${lo}(\${s[lo]})  hi=\${hi}(\${s[hi]})\`);
    if (s[lo] !== s[hi]) return false;
    lo++;
    hi--;
  }
  return true;
}

console.log('isPalindrome("racecar") step by step:');
console.log("result:", isPalindrome("racecar"));
console.log('isPalindrome("hello"):', isPalindrome("hello"));

// Shape B: read/write pointer -> dedup a SORTED array in place
function removeDuplicatesSorted(nums: number[]): number {
  if (nums.length === 0) return 0;
  let write = 1;
  for (let read = 1; read < nums.length; read++) {
    if (nums[read] !== nums[write - 1]) {
      nums[write++] = nums[read];
    }
  }
  return write; // new logical length
}

const a = [1, 1, 2, 3, 3, 3, 4];
const lenA = removeDuplicatesSorted(a);
console.log(\`\\ndedup [1,1,2,3,3,3,4] -> length \${lenA}, front: \${a.slice(0, lenA).join(",")}\`);

const b = [5, 5, 5, 5];
const lenB = removeDuplicatesSorted(b);
console.log(\`dedup [5,5,5,5] -> length \${lenB}, front: \${b.slice(0, lenB).join(",")}\`);

const c = [1, 2, 3];
const lenC = removeDuplicatesSorted(c);
console.log(\`dedup [1,2,3] -> length \${lenC}, front: \${c.slice(0, lenC).join(",")}\`);
`,
  },

  keyPoints: [
    "Two pointers replaces a nested loop with a single O(n) walk by moving two indices through the array at once — the manual index juggling you did in PHP before array_filter.",
    "Converging pointers (both ends, moving inward) work on sorted data — pair-sum, palindrome, container-with-most-water — because each step provably discards one candidate.",
    "Read/write pointers walk the same direction at different speeds for in-place work — dedup, move-zeros, partition — triggered by the phrase 'O(1) extra space'.",
    "Recognition triggers to say aloud: 'sorted array' + 'find a pair' → converging; 'in place' → read/write; 'palindrome' → converging from the ends.",
    "If the input isn't sorted, state the trade: sort first (O(n log n), loses the original order and indices) then converge, versus a hash map that stays O(n) and keeps the indices.",
    "Fast/slow (Floyd's tortoise and hare) detects a linked-list cycle in O(1) space — the memory-free alternative to storing every node in a Set.",
  ],

  interview: [
    {
      q: "When do you reach for two pointers instead of a hash map?",
      a: "It comes down to trigger words and constraints. If the array is already sorted, or I'm allowed to sort it and don't need the original indices, converging pointers give me O(n) time and O(1) space — no extra memory at all. If I need the original positions, or the data is unsorted and sorting would cost more than it buys, a hash map is better: O(n) time but O(n) space, and it preserves indices. And for anything phrased 'in place, O(1) extra space' — dedup, partition, move zeros — it's a read/write pointer, because that's the only way to hit the space bound. I'll name which one and why before I write a line.",
    },
    {
      q: "Check whether a string is a palindrome — walk me through it.",
      a: "Two pointers from both ends: lo at 0, hi at length minus one. I compare the characters; the moment they differ it's not a palindrome, otherwise I step lo forward and hi back until they cross. O(n) time, O(1) space — I never build a reversed copy. I'd clarify the rules first: is this the 'valid palindrome' variant where we ignore case and non-alphanumeric characters? If so I skip non-letters as the pointers move. Empty string and a single character are palindromes by definition, and the loop handles both for free because it simply never executes.",
    },
    {
      q: "Remove duplicates from a sorted array in place. What's your approach?",
      a: "A read/write pointer. The array is sorted, so duplicates are adjacent. write starts at 1 because the first element is always kept, and read scans from 1 to the end. Whenever nums[read] differs from nums[write - 1] — the last unique value I've kept — I copy it into nums[write] and advance write. At the end, write is the count of unique elements and nums[0..write) holds them. O(n) time, O(1) extra space, and I return the new length rather than allocating a new array, which is the whole point of the 'in place' ask.",
    },
  ],

  quiz: [
    {
      question:
        "Converging pointers require what precondition to correctly solve a pair-sum problem?",
      options: [
        "The array must contain only positive numbers",
        "The array must be sorted",
        "The target must be even",
        "The array must contain no duplicates",
      ],
      answerIndex: 1,
      explain:
        "The whole technique relies on order: if the current sum is too small, the smallest element can't be part of any answer, so advancing lo is provably safe (and symmetrically for hi). Without a sort, moving a pointer could skip the real solution.",
    },
    {
      question:
        "A problem says 'remove duplicates in place with O(1) extra space'. Which technique fits?",
      options: [
        "Converging pointers from both ends",
        "A read/write (slow/fast) pointer moving in one direction",
        "Sort, then binary search",
        "A hash Set of values already seen",
      ],
      answerIndex: 1,
      explain:
        "A Set would cost O(n) extra memory, violating the constraint. A single read pointer scanning every element with a write pointer that only advances on new values does it in place — O(n) time, O(1) space.",
    },
    {
      question:
        "What does Floyd's fast/slow cycle detection give you over storing every node in a visited Set?",
      options: [
        "Better asymptotic time complexity",
        "O(1) extra space instead of O(n)",
        "It also returns the length of the shortest cycle for free",
        "It works on unsorted arrays where the Set doesn't",
      ],
      answerIndex: 1,
      explain:
        "Both are O(n) time. The advantage of the two-pointer approach is memory: fast/slow uses two pointers and constant space, while the Set stores up to every node. That O(1)-space property is exactly why interviewers ask for it.",
    },
    {
      question:
        "You're given an UNSORTED array and asked for two indices that sum to a target, and the original indices matter. Best tool?",
      options: [
        "Sort the array, then use converging pointers",
        "A hash map from value to index, in one pass",
        "Converging pointers without sorting",
        "Nested loops — it's unavoidable here",
      ],
      answerIndex: 1,
      explain:
        "Sorting would destroy the original indices the question asks for, and converging pointers need sorted input. A one-pass hash map from value to index keeps the positions and runs in O(n) time — the right call whenever indices matter.",
    },
  ],
};

export default lesson;
