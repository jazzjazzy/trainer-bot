import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "sliding-window",
  title: "Sliding Window",
  part: "Live Coding & Take-Homes",
  estMinutes: 12,
  summary:
    "Fixed- and variable-size windows answer 'contiguous subarray/substring' questions in one O(n) pass by moving the window's edges instead of re-scanning — the substr loop you'd have written, minus the re-reading.",

  concept: `
A sliding window answers questions about a **contiguous** subarray or
substring — "longest", "shortest", "maximum sum", "at most K distinct" — in
one pass, by moving the window's edges instead of re-computing from scratch.
The tell is right in the wording: **"contiguous subarray"** or **"substring"**
almost always means sliding window. It's the loop you'd have written over
\`substr\` in PHP, minus the part where you re-read the same characters on every
iteration.

### Two variants

**Fixed-size window** (the size k is given): "maximum sum of k consecutive
elements", "average of every k-length window". Compute the first window once,
then slide — **add the element entering on the right, subtract the one leaving
on the left**. Each step is O(1), so the whole scan is O(n) instead of the
O(n·k) you get by re-summing every window from scratch.

**Variable-size window** (you have to find the size): "longest substring
without repeating characters", "smallest subarray with sum ≥ target", "longest
substring with at most K distinct". Here the window grows and shrinks to
maintain an **invariant**.

### The variable-window template

Four moves, every time:

1. **Expand right** — extend the window by one element.
2. **Maintain the invariant** — update whatever you track: a running sum, a
   \`Map\` of counts, a distinct-count.
3. **Shrink left** — while the window is invalid (or, for a minimum-length
   answer, while it's still valid), advance the left edge and undo its
   contribution.
4. **Record the best** — update the answer at the right moment.

The \`Map\`-of-counts step is exactly the frequency-counting pattern from the
hash-map section, running inside the window — sliding window *composes* with
it rather than replacing it.

### Why it's O(n), not O(n²)

The insight that makes an interviewer nod: **the right pointer advances n
times total, and the left pointer only ever moves forward, so it also advances
at most n times.** Two pointers each crossing the array once is O(n) — even
though there's a nested \`while\` for the shrink, that inner loop can't run more
than n times *in total* across the whole outer loop. Saying that out loud is
what separates "I memorised the template" from "I understand the bound".

### The naive version to name and reject

The brute force enumerates every start and end, or re-scans every window
position: O(n²) or O(n·k). Name it, then say "but each window shares all but
one element with the previous one, so I'll update the edges instead of
recomputing" — and write the O(n) version.
`,

  comparisons: [
    {
      label: "Max sum of k elements: recompute vs slide",
      intro:
        "Find the maximum sum of any k consecutive elements. The left re-sums each window from scratch; the right slides the edges.",
      php: `// re-sum every window - O(n * k)
function maxSumK(nums: number[], k: number): number {
  let best = -Infinity;
  for (let i = 0; i + k <= nums.length; i++) {
    let sum = 0;
    for (let j = i; j < i + k; j++) sum += nums[j]; // re-add k each time
    best = Math.max(best, sum);
  }
  return best;
}`,
      ts: `// slide: add the entering element, drop the leaving one - O(n)
function maxSumK(nums: number[], k: number): number {
  let sum = 0;
  for (let i = 0; i < k; i++) sum += nums[i]; // seed the first window
  let best = sum;
  for (let r = k; r < nums.length; r++) {
    sum += nums[r] - nums[r - k]; // +entering  -leaving
    best = Math.max(best, sum);
  }
  return best;
}`,
      note:
        "Consecutive windows differ by only their two edges, so one add and one subtract updates the sum in O(1). The brute force redoes k additions per window for no reason.",
    },
    {
      label: "Longest substring without repeats: nested loop vs window",
      intro:
        "Find the length of the longest substring with all-distinct characters. The left restarts a scan from every index; the right keeps one window and a Map of last-seen positions.",
      php: `// check every substring - O(n^2)
function longestUnique(s: string): number {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const seen = new Set<string>();
    for (let j = i; j < s.length; j++) {
      if (seen.has(s[j])) break;      // repeat -> this start is done
      seen.add(s[j]);
      best = Math.max(best, j - i + 1);
    }
  }
  return best;
}`,
      ts: `// one window, left jumps past the last copy of a repeat - O(n)
function longestUnique(s: string): number {
  const last = new Map<string, number>(); // char -> last index seen
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    const prev = last.get(s[right]);
    if (prev !== undefined && prev >= left) left = prev + 1; // shrink
    last.set(s[right], right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}`,
      note:
        "The Map is the hash-map pattern from the previous section, living inside the window. right advances n times; left only moves forward — so it's O(n), not the nested loop's O(n²).",
    },
    {
      label: "Smallest subarray with sum ≥ target: brute force vs shrink",
      intro:
        "Find the length of the shortest contiguous subarray whose sum is at least the target (0 if none). The right shows the canonical expand-then-shrink template.",
      php: `// try every start, extend until valid - O(n^2)
function minWindowSum(nums: number[], target: number): number {
  let best = Infinity;
  for (let i = 0; i < nums.length; i++) {
    let sum = 0;
    for (let j = i; j < nums.length; j++) {
      sum += nums[j];
      if (sum >= target) { best = Math.min(best, j - i + 1); break; }
    }
  }
  return best === Infinity ? 0 : best;
}`,
      ts: `// expand right, shrink left while still valid - O(n)
function minWindowSum(nums: number[], target: number): number {
  let left = 0, sum = 0, best = Infinity;
  for (let right = 0; right < nums.length; right++) {
    sum += nums[right];              // 1. expand right
    while (sum >= target) {          // 3. shrink while valid
      best = Math.min(best, right - left + 1); // 4. record best
      sum -= nums[left++];           // undo the left edge
    }
  }
  return best === Infinity ? 0 : best;
}`,
      note:
        "The inner while looks quadratic but left never resets, so it advances at most n times across the whole run — the amortised argument that keeps the total O(n).",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "longestUniqueSubstring with an optional trace: watch the window slide across \"abcabcbb\", then predict the answers for two more inputs. Note how left only ever jumps forward.",
    code: `// Variable-size window: longest substring without repeating characters.
function longestUniqueSubstring(s: string, trace = false): number {
  const last = new Map<string, number>(); // char -> last index seen
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    const prev = last.get(ch);
    if (prev !== undefined && prev >= left) {
      left = prev + 1; // repeat inside window -> jump left past it
    }
    last.set(ch, right);
    const windowLen = right - left + 1;
    if (windowLen > best) best = windowLen;
    if (trace) {
      console.log(
        \`  right=\${right}(\${ch})  window="\${s.slice(left, right + 1)}"  len=\${windowLen}  best=\${best}\`
      );
    }
  }
  return best;
}

console.log('longestUniqueSubstring("abcabcbb"), window as it slides:');
console.log("answer:", longestUniqueSubstring("abcabcbb", true));

console.log('\\nlongestUniqueSubstring("pwwkew"):', longestUniqueSubstring("pwwkew"));
console.log('longestUniqueSubstring("bbbbb"):', longestUniqueSubstring("bbbbb"));
`,
  },

  keyPoints: [
    "A sliding window solves 'contiguous subarray/substring' questions in one O(n) pass by moving edges instead of re-scanning — the substr loop, minus the re-reading.",
    "Fixed-size window: seed the first window, then slide by adding the entering element and subtracting the leaving one — O(n), not the O(n·k) of re-summing each window.",
    "Variable-size window follows one template: expand right, maintain the invariant, shrink left while it's violated (or while still valid for a minimum), record the best.",
    "The window's contents are often a Map of counts — the same frequency-counting pattern from the hash-map section, running inside the window.",
    "It's O(n) because the right pointer advances n times and the left only moves forward, so the inner shrink loop runs at most n times in total — an amortised bound worth stating aloud.",
    "The trigger words are 'contiguous', 'subarray', and 'substring'; name the O(n²)/O(n·k) brute force before improving on it.",
  ],

  interview: [
    {
      q: "How do you recognise a sliding-window problem, and what's the template?",
      a: "The trigger is 'contiguous subarray' or 'substring' paired with an optimisation — longest, shortest, maximum sum, at most K distinct. The template is four moves: expand the right edge by one, update whatever I track for the window, shrink the left edge while the window violates the invariant, and record the best answer. For a fixed size k I skip the shrink and just slide — add the entering element, subtract the leaving one. I always state the cost: O(n), because the right pointer moves n times and the left only moves forward.",
    },
    {
      q: "Why is longest-substring-without-repeats O(n) and not O(n²), given it has a nested loop?",
      a: "Because the inner loop's total work is bounded across the whole run, not per outer iteration. The right pointer advances exactly n times. The left pointer only ever moves forward and never resets, so across the entire scan it advances at most n times too. Two pointers each traversing the array once is O(n). The nested while for shrinking looks quadratic, but it can't execute more than n times in total — that's the amortised argument, and it's exactly what an interviewer wants to hear instead of a hand-wave.",
    },
    {
      q: "Solve maximum sum of k consecutive elements.",
      a: "I sum the first k elements to seed the window and remember that as the best. Then for each new right index from k onward I slide: add nums[right] and subtract nums[right - k] — the element that just fell off the left edge — and compare against the best. That's one addition and one subtraction per step, O(n) time and O(1) space. The brute force re-sums each window for O(n·k); the entire trick is that consecutive windows differ only by their two edges, so I update instead of recompute.",
    },
  ],

  quiz: [
    {
      question:
        "Which phrasing most reliably signals a sliding-window solution?",
      options: [
        "'sorted array' plus 'find a pair'",
        "'contiguous subarray' or 'substring' plus an optimisation",
        "'in place, O(1) extra space'",
        "'shortest path in a graph'",
      ],
      answerIndex: 1,
      explain:
        "Sliding window is specifically about a contiguous run whose edges you move. 'sorted array' + 'pair' is two pointers, 'in place' is a read/write pointer, and shortest path is BFS — each has its own tell.",
    },
    {
      question:
        "For 'maximum sum of k consecutive elements', how do you get O(n) instead of O(n·k)?",
      options: [
        "Sort the array first, then take the last k",
        "Seed the first window, then each slide add the entering element and subtract the leaving one",
        "Use recursion with memoisation over start indices",
        "Precompute the product of every k-length window",
      ],
      answerIndex: 1,
      explain:
        "Consecutive windows overlap in all but their two edges, so the sum updates in O(1) with one add and one subtract. Re-summing each window from scratch is the O(n·k) brute force you're improving on.",
    },
    {
      question:
        "Why is a variable-size window O(n) despite its inner shrink loop?",
      options: [
        "The shrink loop always runs a constant number of times per step",
        "The left pointer only moves forward, so it advances at most n times across the whole scan",
        "The array is sorted, making each shrink O(log n)",
        "It isn't — it's genuinely O(n²)",
      ],
      answerIndex: 1,
      explain:
        "This is the amortised argument. The right pointer moves n times; the left pointer never resets and only advances, so its total movement is also bounded by n. Two forward passes over the array is O(n), not O(n²).",
    },
    {
      question:
        "In the Map-backed longest-substring-without-repeats window, what does the Map store?",
      options: [
        "Each character's last-seen index, so left can jump past an earlier copy",
        "The running sum of character codes in the window",
        "Every distinct substring seen so far",
        "The count of vowels in the current window",
      ],
      answerIndex: 0,
      explain:
        "Mapping each character to its last index lets the left edge leap directly to just past the previous occurrence when a repeat enters the window, keeping the window valid in O(1) — the frequency/index-tracking pattern applied inside the window.",
    },
  ],
};

export default lesson;
