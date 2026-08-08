import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "collection-methods",
  title: "Array & Collection Methods",
  part: "Modern Runtime & Async",
  estMinutes: 14,
  summary:
    "The JavaScript array toolkit — map, filter, reduce, find and friends — is the PHP array_* family you know, but called as fluent, chainable methods with a value-first callback.",

  concept: `
In PHP you reach for \`array_map\`, \`array_filter\`, \`array_reduce\` and \`usort\`
constantly. JavaScript has the exact same toolbox — but instead of standalone
functions where the array is an argument, these are **methods on the array
itself**, so they **chain**.

### The core methods

Each takes a callback. In TypeScript the callback's parameters are **inferred
from the array's element type**, so you get autocomplete inside it for free.

- \`map(fn)\` — transform each element, returns a **new** array of the same length.
- \`filter(fn)\` — keep elements where \`fn\` returns truthy, returns a **new**, possibly shorter array.
- \`reduce(fn, initial)\` — fold the array down to a single value (sum, object, string...).
- \`find(fn)\` — first matching element, or \`undefined\`.
- \`some(fn)\` / \`every(fn)\` — booleans: "any match?" / "all match?".
- \`sort(fn)\` — orders the array. **Warning: \`sort\` mutates in place** and returns the same array.

\`\`\`typescript
const nums = [1, 2, 3, 4];
const doubledEvens = nums
  .filter((n) => n % 2 === 0) // [2, 4]
  .map((n) => n * 2);         // [4, 8]
\`\`\`

### Two differences from PHP that bite

**1. Argument order is value-first.** PHP's \`array_map(fn, $arr)\` and
\`array_filter($arr, fn)\` disagree with each other on order. JavaScript is
consistent: the callback always receives \`(value, index, array)\`, value first.

**2. There are no string keys.** PHP arrays are ordered maps; these methods
operate on **positional arrays only**. For key/value work you use objects, a
\`Map\`, or \`Object.entries(obj)\` to get \`[key, value]\` pairs you can map over.

### Typed callbacks

Because the element type flows in, the compiler checks your callback body:

\`\`\`typescript
const users = [{ name: "Ada", age: 36 }];
users.map((u) => u.nam); // ✗ compile error: 'nam' does not exist
\`\`\`

\`map\` and \`filter\` **never mutate** — they return fresh arrays, which is why
chaining is safe. \`sort\` and \`reverse\` are the exceptions that **do** mutate;
copy first with \`[...arr].sort(...)\` if you need to preserve the original.

> The \`sort\` comparator returns a **number**, not a bool: negative = a before b,
> positive = a after b, zero = leave as-is. Same contract as PHP's \`usort\`.
`,

  comparisons: [
    {
      label: "Transform every element (map)",
      intro:
        "Take a list of numbers and produce a new list where each one is doubled. The result should be a fresh three-element array of the doubled values.",
      php: `<?php
$nums = [1, 2, 3];
$doubled = array_map(fn($n) => $n * 2, $nums);
// [2, 4, 6]`,
      ts: `const nums = [1, 2, 3];
const doubled = nums.map((n) => n * 2);
// [2, 4, 6]`,
      note:
        "PHP: array_map(fn, $arr). TS: $arr.map(fn) — the array comes first as the receiver, the callback is value-first.",
    },
    {
      label: "Keep matching elements (filter)",
      intro:
        "From a list of four numbers, keep only the even ones. The goal is a shorter list containing just 2 and 4.",
      php: `<?php
$nums = [1, 2, 3, 4];
$evens = array_filter($nums, fn($n) => $n % 2 === 0);
// [1 => 2, 3 => 4]  (keys preserved!)`,
      ts: `const nums = [1, 2, 3, 4];
const evens = nums.filter((n) => n % 2 === 0);
// [2, 4]  (re-indexed, no gaps)`,
      note:
        "array_filter keeps the original keys (you often need array_values after). JS filter returns a clean, re-indexed array.",
    },
    {
      label: "Fold to one value (reduce)",
      intro:
        "Add up all the numbers in a list to get a single running total. Starting from 0, summing 1 through 4 should yield 10.",
      php: `<?php
$nums = [1, 2, 3, 4];
$sum = array_reduce(
    $nums,
    fn($carry, $n) => $carry + $n,
    0
);
// 10`,
      ts: `const nums = [1, 2, 3, 4];
const sum = nums.reduce((carry, n) => carry + n, 0);
// 10`,
      note:
        "Same idea. In PHP the carry is first; in JS the accumulator is also first: (acc, value). Initial value is the last arg in both.",
    },
    {
      label: "Sort with a comparator",
      intro:
        "Put an out-of-order list of numbers into ascending order using a comparator function. Afterward the same array holds 1, 2, 3.",
      php: `<?php
$nums = [3, 1, 2];
usort($nums, fn($a, $b) => $a <=> $b);
// $nums is now [1, 2, 3] (sorted in place)`,
      ts: `const nums = [3, 1, 2];
nums.sort((a, b) => a - b);
// nums is now [1, 2, 3] (sorted in place)`,
      note:
        "Both mutate in place. PHP's <=> spaceship returns -1/0/1; in JS you return any negative/zero/positive number — a - b does the trick.",
    },
    {
      label: "Chaining vs nesting",
      intro:
        "From a list of users, get the names of just the active ones — a filter followed by a transform. The result is an array of name strings.",
      php: `<?php
$names = array_map(
    fn($u) => $u['name'],
    array_filter($users, fn($u) => $u['active'])
);`,
      ts: `const names = users
  .filter((u) => u.active)
  .map((u) => u.name);`,
      note:
        "PHP nests calls inside-out (read it backwards). JS chains left-to-right in execution order — far easier to read.",
    },
  ],

  playground: {
    intro:
      "A typed array of orders, filtered to the paid ones, mapped to their totals, then reduced to a grand total — the classic filter -> map -> reduce pipeline.",
    code: `interface Order {
  id: number;
  customer: string;
  total: number;
  paid: boolean;
}

const orders: Order[] = [
  { id: 1, customer: "Ada", total: 120, paid: true },
  { id: 2, customer: "Linus", total: 75, paid: false },
  { id: 3, customer: "Grace", total: 200, paid: true },
  { id: 4, customer: "Alan", total: 50, paid: true },
];

// filter -> map -> reduce. Each callback is typed: hover 'o' and it's an Order.
const revenue = orders
  .filter((o) => o.paid)        // only paid orders
  .map((o) => o.total)          // Order[] -> number[]
  .reduce((sum, total) => sum + total, 0);

console.log("Paid orders revenue:", revenue); // 370

// some / every / find work on the original typed array:
console.log("Any unpaid?", orders.some((o) => !o.paid));     // true
console.log("All under 500?", orders.every((o) => o.total < 500)); // true

const biggest = orders.find((o) => o.total === 200);
console.log("Found:", biggest?.customer); // Grace

// map/filter did NOT mutate the source — proof:
console.log("Original count still:", orders.length); // 4`,
  },

  keyPoints: [
    "Array methods are the `array_*` family as **fluent, chainable methods** on the array — `arr.map(fn)`, not `array_map(fn, arr)`.",
    "Callback order is **value-first and consistent**: `(value, index, array)`. PHP's array_map/array_filter disagree on order; JS never does.",
    "`map` and `filter` are **immutable** — they return brand-new arrays, which is why chaining is safe.",
    "`sort` and `reverse` **mutate in place** and return the same array — copy with `[...arr]` first if you need the original.",
    "JS `filter` **re-indexes** the result; PHP `array_filter` **preserves keys** (often needing `array_values`).",
    "Callbacks are **typed from the element type**, so you get autocomplete and compile-time checks inside them.",
  ],

  interview: [
    {
      q: "How do JavaScript's array methods differ from PHP's array_* functions?",
      a: "They do the same jobs but the **calling convention** differs. In PHP the array is an argument to a free function (`array_map($fn, $arr)`); in JS the method lives on the array (`arr.map($fn)`), so calls **chain** left-to-right instead of nesting inside-out. The callback signature is also **consistent and value-first** — `(value, index, array)` — whereas PHP's `array_map` and `array_filter` famously take their array in different positions. Finally, JS `filter` returns a clean re-indexed array, while PHP `array_filter` preserves the original keys.",
    },
    {
      q: "Which array methods mutate the array and which return a new one? Why does it matter?",
      a: "`map`, `filter`, `reduce`, `find`, `some`, `every` are **non-mutating** — they return new values and leave the source untouched. `sort`, `reverse`, `splice`, `push`, `pop` **mutate in place**. It matters because mutation causes subtle bugs, especially with shared state or React props/state where mutating an array won't trigger a re-render. The safe pattern is to copy first: `const sorted = [...arr].sort((a, b) => a - b);`.",
    },
    {
      q: "Explain reduce to someone who knows array_reduce.",
      a: "It's identical in spirit: you **fold** a collection down to a single accumulated value. The callback receives `(accumulator, currentValue)` and returns the next accumulator; the second argument to `reduce` is the **initial** accumulator. PHP: `array_reduce($arr, fn($carry, $item) => ..., $initial)`. JS: `arr.reduce((acc, item) => ..., initial)`. The accumulator doesn't have to be a number — reduce can build an object, a string, or group items into buckets, making it the most general of all the array methods.",
    },
    {
      q: "How does TypeScript type the callbacks, and what does that buy you?",
      a: "TypeScript **infers the element type** from the array, so inside `users.map(u => ...)`, `u` is fully typed as the user object — you get autocomplete and the compiler rejects typos like `u.nam`. It also tracks transformations through a chain: `Order[]` after `.map(o => o.total)` becomes `number[]`, so the `reduce` after it knows it's summing numbers. You rarely annotate callback parameters yourself; the types flow through automatically.",
    },
  ],

  quiz: [
    {
      question:
        "What is the result of `[1, 2, 3, 4].filter(n => n % 2 === 0).map(n => n * 10)`?",
      options: ["[20, 40]", "[10, 20, 30, 40]", "[2, 4]", "[20, 40, 0, 0]"],
      answerIndex: 0,
      explain:
        "filter keeps the evens [2, 4], then map multiplies each by 10 giving [20, 40]. Both return new arrays, so chaining works.",
    },
    {
      question:
        "Which of these methods MUTATES the array it is called on?",
      options: ["map", "filter", "sort", "reduce"],
      answerIndex: 2,
      explain:
        "sort orders the array in place and returns the same array. map, filter and reduce never mutate the source — they return new values.",
    },
    {
      question:
        "In `arr.reduce((acc, value) => acc + value, 0)`, what does the final `0` represent?",
      options: [
        "The index to start reducing from",
        "The initial value of the accumulator",
        "The number of elements to process",
        "The value returned if the array is empty error",
      ],
      answerIndex: 1,
      explain:
        "The second argument to reduce is the initial accumulator value — equivalent to the last argument of PHP's array_reduce.",
    },
  ],
};

export default lesson;
