import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "hash-map-patterns",
  title: "Hash Maps: The Pattern That Covers 40%",
  part: "Live Coding & Take-Homes",
  estMinutes: 13,
  summary:
    "Frequency counting, grouping, seen-sets, and complement lookup with Map and Set cover a huge share of coding screens — and you've been doing all of it in PHP associative arrays for 25 years.",

  concept: `
If you learn one live-coding pattern deeply, make it this one. Frequency
counting, grouping, membership checks, and complement lookup — all backed by
a hash map — cover somewhere around 40% of screen-level questions. And here
is the good news: **you have been writing this pattern in PHP for 25 years.**
\`Map\` is an associative array, \`Set\` is \`isset($seen[$x])\`, and
\`array_count_values\` is a frequency counter. The interview just wants it in
TypeScript, with the complexity reasoning said out loud.

### The core move: trade memory for a lookup

Every question in this family has the same shape: a naive version scans the
data repeatedly (O(n²)), and the strong version makes **one pass**, storing
what it has seen in a \`Map\` or \`Set\` so every lookup is O(1). The sentence
an interviewer wants to hear is:

> "The brute force is nested loops, O(n²). I'll trade O(n) memory for a
> hash lookup and do it in one pass, O(n) time."

Say that *before* you type. It's worth more than the code.

### Pattern 1 — frequency counting

Count occurrences, then interrogate the counts:

\`\`\`ts
const counts = new Map<string, number>();
for (const word of words) {
  counts.set(word, (counts.get(word) ?? 0) + 1);
}
\`\`\`

That \`(counts.get(k) ?? 0) + 1\` line is the TS spelling of
\`$counts[$w] = ($counts[$w] ?? 0) + 1;\` — identical idiom, identical
reasoning. First-unique-character is this plus a second pass: count all
characters, then walk the string again and return the first with count 1.
Two passes is still O(n).

### Pattern 2 — grouping by a derived key

Group-anagrams is the classic: two words are anagrams if their sorted
letters match, so the sorted letters are the **group key**:

\`\`\`ts
const groups = new Map<string, string[]>();
for (const w of words) {
  const key = [...w].sort().join("");
  const bucket = groups.get(key) ?? [];
  bucket.push(w);
  groups.set(key, bucket);
}
\`\`\`

Any "group Xs that share property Y" question is this template — derive the
key, push into the bucket. In PHP you did it as \`$groups[$key][] = $w;\`.

### Pattern 3 — seen-sets and complement lookup

"Has this appeared before?" is a \`Set\`. Two-sum is the elegant twist: for
each number, ask whether its **complement** (\`target - num\`) has already
been seen. One pass, one Map from value to index. The naive version checks
every pair — name it, reject it, then write the Map version.

### Why Map and not a plain object

A plain \`{}\` almost works as a map, and interviewers notice the pitfalls:
keys are coerced to strings (so \`obj[1]\` and \`obj["1"]\` collide), inherited
properties like \`constructor\` and \`toString\` are phantom "hits" with \`in\`,
and there's no cheap size. \`Map\` keeps key types (numbers, even objects),
has \`.size\`, \`.has()\`, and iterates in insertion order. Using \`Map\` in an
interview is itself a small signal that you know the platform, not just the
syntax. Reach for a plain object only when you genuinely want a record-like
shape with known string keys.
`,

  comparisons: [
    {
      label: "Two-sum: nested loops vs one-pass Map",
      intro:
        "Find the indices of two numbers that add to a target. Both versions are correct; only one survives the follow-up question 'what if the array has a million elements?'.",
      php: `// two-sum, brute force: check every pair
function twoSum(nums: number[], target: number) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) {
        return [i, j];
      }
    }
  }
  return null;
}
// O(n^2) time, O(1) space. At n = 1e6 that's
// ~5e11 comparisons — minutes, not milliseconds.`,
      ts: `// two-sum, one pass: look up the complement
function twoSum(nums: number[], target: number) {
  const seen = new Map<number, number>(); // value -> index
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    const j = seen.get(need);
    if (j !== undefined) return [j, i];
    seen.set(nums[i], i);
  }
  return null;
}
// O(n) time, O(n) space. Say the trade aloud:
// "I'm spending memory to buy O(1) lookups."`,
      note:
        "Insert AFTER checking, and the same element can never pair with itself — that ordering also handles duplicates (e.g. [3,3] with target 6) for free. Narrate that; it's the edge case interviewers probe.",
    },
    {
      label: "Frequency counting: PHP instinct, TS spelling",
      intro:
        "Count word occurrences. The left is the PHP you've written a thousand times; the right is the identical idea in TypeScript — the interview only wants the translation.",
      php: `<?php
// One built-in call...
$counts = array_count_values($words);

// ...or the hand-rolled loop behind it:
$counts = [];
foreach ($words as $w) {
    $counts[$w] = ($counts[$w] ?? 0) + 1;
}
arsort($counts);
$topWord = array_key_first($counts);`,
      ts: `// No array_count_values in JS - write the loop:
const counts = new Map<string, number>();
for (const w of words) {
  counts.set(w, (counts.get(w) ?? 0) + 1);
}

// Top word: sort the entries by count, descending
const [topWord] = [...counts.entries()]
  .sort((a, b) => b[1] - a[1])[0];`,
      note:
        "Same idiom, same ?? 0 default, same O(n). The only new vocabulary is Map's get/set and spreading .entries() to sort — your 25 years of associative-array instinct transfers directly.",
      leftLang: "php",
      rightLang: "ts",
    },
    {
      label: "Plain object as a map vs Map",
      intro:
        "Count how often each user ID (a number) appears, then check membership. The plain-object version has two quiet bugs an interviewer will ask about.",
      php: `// Plain object as a hash map
const counts: Record<string, number> = {};
for (const id of userIds) {
  // number keys silently become strings:
  counts[id] = (counts[id] ?? 0) + 1;
}

// Phantom membership hits from the prototype:
"toString" in counts;      // true - never stored!
Object.keys(counts).length; // size costs O(n)`,
      ts: `// Map keeps key types and has real membership
const counts = new Map<number, number>();
for (const id of userIds) {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

counts.has(42);        // true only if stored
counts.size;           // O(1), no key scan
// Keys stay numbers; objects work as keys too.
// Iterates in insertion order - stable output.`,
      note:
        "Object keys are coerced to strings and the prototype chain pollutes `in` checks; Map has typed keys, .has(), .size, and insertion-order iteration. Choosing Map unprompted is quiet senior signal.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Two of the patterns end to end: frequency counting (with first-unique-char built on top) and one-pass two-sum with a trace of the Map as it fills. Predict the two-sum trace before you run it.",
    code: `// Pattern 1: frequency counting -> first unique character
function firstUniqueChar(s: string): string | null {
  const counts = new Map<string, number>();
  for (const ch of s) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);   // pass 1: count
  }
  for (const ch of s) {
    if (counts.get(ch) === 1) return ch;          // pass 2: first with count 1
  }
  return null;
}

const word = "interview";
const freq = new Map<string, number>();
for (const ch of word) freq.set(ch, (freq.get(ch) ?? 0) + 1);
console.log(\`counts for "\${word}":\`,
  [...freq.entries()].map(([c, n]) => \`\${c}=\${n}\`).join(" "));
console.log(\`first unique in "\${word}": \${firstUniqueChar(word)}\`);
console.log(\`first unique in "aabbcc": \${firstUniqueChar("aabbcc")}\`);

// Pattern 3: two-sum, one pass with complement lookup
function twoSum(nums: number[], target: number): [number, number] | null {
  const seen = new Map<number, number>(); // value -> index
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    const j = seen.get(need);
    if (j !== undefined) return [j, i];
    seen.set(nums[i], i);
    console.log(\`  i=\${i} num=\${nums[i]} need=\${need} -> not seen, store it\`);
  }
  return null;
}

console.log("\\ntwoSum([2, 7, 11, 15], 18):");
console.log("result:", twoSum([2, 7, 11, 15], 18)); // 7 + 11
console.log("\\ntwoSum([3, 3], 6):");
console.log("result:", twoSum([3, 3], 6)); // duplicate values, distinct indices
`,
  },

  keyPoints: [
    "One family — frequency counts, grouping, seen-sets, complement lookup — covers roughly 40% of coding screens, and it's all the associative-array work you've done in PHP for decades.",
    "The core move is trading O(n) memory for O(1) lookups to turn a nested-loop O(n²) scan into one O(n) pass — say that sentence before you write code.",
    "Frequency counting is `counts.set(k, (counts.get(k) ?? 0) + 1)` — the exact TS spelling of `$counts[$k] = ($counts[$k] ?? 0) + 1`.",
    "Grouping means deriving a key (sorted letters for anagrams) and pushing into a Map<string, T[]> bucket — PHP's `$groups[$key][] = $item`.",
    "Two-sum: for each element look up its complement (target − num) in a Map of what you've already seen; insert after checking so an element never pairs with itself.",
    "Prefer Map over a plain object: typed keys (no string coercion), real `.has()` without prototype pollution, O(1) `.size`, insertion-order iteration.",
  ],

  interview: [
    {
      q: "Solve two-sum. Talk me through your approach before you code.",
      a: "First the brute force so we both know the baseline: check every pair with nested loops, O(n²) time, O(1) space — fine for tiny inputs, unacceptable at scale. I'll trade memory for lookups instead: one pass with a Map from value to index. For each element I compute its complement, target minus the current value, and check the Map; if the complement's there I return both indices, otherwise I store the current value and move on. Inserting after the check means an element can't pair with itself, and it makes duplicates like [3,3] with target 6 work naturally. O(n) time, O(n) space, and I'd confirm with you whether there's always exactly one solution or whether I should handle none or many.",
    },
    {
      q: "You've spent most of your career in PHP. How does that background map to these hash-map questions?",
      a: "Almost one to one — PHP's associative array is a hash map, so I've been using this pattern in production for 25 years: frequency counting with array_count_values, grouping with $groups[$key][] = $item, dedup and membership with isset($seen[$x]). The TypeScript differences are vocabulary, not concept: Map with get/set/has instead of bracket access, Set for membership, and the ?? 0 default reads the same in both languages. The part interviews actually grade — recognising that a hash lookup turns O(n²) into O(n) and saying so — is language-independent, and it's instinct at this point.",
    },
    {
      q: "Why would you use a Map instead of a plain object in JavaScript, and when is the object fine?",
      a: "Three concrete reasons. Object keys are coerced to strings, so numeric keys 1 and \"1\" collide, while Map preserves key types and even allows object keys. Objects inherit from a prototype, so 'toString' in obj is true even though you never stored it — Map's .has() only reports what you put in. And Map gives O(1) .size plus guaranteed insertion-order iteration. A plain object — usually typed as Record — is fine when it's really a record: a fixed, known set of string keys, like a config shape or a JSON payload. For dynamic keys accumulated in a loop, which is what these interview patterns are, Map is the right tool.",
    },
  ],

  quiz: [
    {
      question:
        "What is the core complexity trade behind the one-pass Map solution to two-sum?",
      options: [
        "Trading O(n) time for O(1) space",
        "Trading O(n) extra space for O(1) lookups, reducing O(n²) time to O(n)",
        "Sorting first so binary search applies",
        "Caching results between calls to amortise cost",
      ],
      answerIndex: 1,
      explain:
        "The brute force re-scans the array for every element (O(n²)). Storing seen values in a Map costs O(n) memory but makes each complement check O(1), so the whole thing becomes one O(n) pass. Stating this trade aloud is exactly what the interviewer is grading.",
    },
    {
      question:
        "In one-pass two-sum, why do you insert the current element into the Map only AFTER checking for its complement?",
      options: [
        "It's a micro-optimisation to save one Map write",
        "So an element can't match itself as its own complement, while duplicate values at different indices still pair correctly",
        "Map throws if you overwrite an existing key",
        "Insertion order would otherwise break the result",
      ],
      answerIndex: 1,
      explain:
        "Check-then-insert means the Map only ever contains earlier elements, so nums[i] can never 'find' itself (e.g. [5] with target 10), yet [3,3] with target 6 works because the second 3 finds the first. It's the edge case interviewers probe on this question.",
    },
    {
      question: "What is the standard group-anagrams technique?",
      options: [
        "Compare every pair of words character by character",
        "Hash each word with a cryptographic hash and bucket by hash",
        "Use each word's sorted letters as a Map key and push words into that bucket",
        "Build a trie of all words and walk it depth-first",
      ],
      answerIndex: 2,
      explain:
        "Anagrams share exactly the same letters, so sorting the letters produces an identical key for every member of the group — 'eat', 'tea', 'ate' all become 'aet'. Derive key, push into Map<string, string[]> bucket: the universal grouping template.",
    },
    {
      question:
        "Which of these is a real pitfall of using a plain object {} as a hash map?",
      options: [
        "Objects can't store more than 1000 keys",
        "Numeric keys are coerced to strings, and inherited prototype properties can appear as phantom members",
        "Object property access is O(n)",
        "Objects can't be iterated at all",
      ],
      answerIndex: 1,
      explain:
        "obj[1] and obj[\"1\"] are the same slot because keys become strings, and checks like 'toString' in obj return true via the prototype chain. Map avoids both, adds O(1) .size, and iterates in insertion order — which is why it's the default for dynamic keys.",
    },
  ],
};

export default lesson;
