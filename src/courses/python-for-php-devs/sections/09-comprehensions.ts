import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "comprehensions",
  title: "Comprehensions: array_map & array_filter, Built In",
  part: "Control Flow & Functions",
  estMinutes: 12,
  summary:
    "List/dict/set comprehensions fold array_map and array_filter into one readable expression — plus lazy generator expressions PHP can't match.",

  concept: `
Every day of your PHP life you've written some flavour of this:

\`\`\`php
\$evens = array_filter(\$nums, fn(\$n) => \$n % 2 === 0);
\$squares = array_map(fn(\$n) => \$n * \$n, \$evens);
\`\`\`

Two calls, two callbacks, an intermediate array — or a foreach building a
result by hand. Python bakes the whole pattern into the language as
**comprehensions**, and they are *the* idiomatic way to build collections.

### List comprehension = map (+ filter)

\`\`\`python
squares = [n * n for n in nums]                    # array_map
evens   = [n for n in nums if n % 2 == 0]          # array_filter
both    = [n * n for n in nums if n % 2 == 0]      # map + filter, ONE pass
\`\`\`

The reading order is fixed and worth memorising: **expression, loop,
condition** — "*n squared*, for each n in nums, if n is even". It's the
foreach you'd write, flipped so the result leads. What PHP needs two function
calls (and an intermediate array) for, Python does in one expression, one pass.

### Dict and set comprehensions

The same syntax builds the other collection types — change the brackets:

\`\`\`python
by_id   = {u["id"]: u["name"] for u in users}      # dict: key: value
lengths = {w: len(w) for w in words}
letters = {w[0].lower() for w in words}            # set: dedupes as it builds
\`\`\`

The dict version replaces PHP's \`array_column(\$users, 'name', 'id')\` and every
foreach-into-\`\$result[\$key]\` loop you've ever written.

### Nested loops — flattening

Comprehensions accept multiple \`for\` clauses, which nest left-to-right in the
same order you'd write the foreach loops:

\`\`\`python
matrix = [[1, 2], [3, 4], [5, 6]]
flat = [n for row in matrix for n in row]          # [1, 2, 3, 4, 5, 6]
\`\`\`

Read it as \`for row in matrix:\` *then* \`for n in row:\` — the PHP equivalent
is a nested foreach appending to \`\$flat\` (or \`array_merge(...\$matrix)\`).

### Generator expressions — the lazy sibling

Swap the square brackets for parentheses and nothing is built at all: a
**generator expression** yields values one at a time, on demand.

\`\`\`python
total = sum(n * n for n in nums)       # no list ever materialises
has_admin = any(u.is_admin for u in users)   # stops at the first hit
\`\`\`

For a million-row iterable this is the difference between constant and linear
memory. PHP has nothing this cheap short of hand-writing a generator function
with \`yield\`. When a comprehension feeds directly into \`sum\`/\`any\`/\`all\`/
\`max\`, drop the brackets and it's lazy for free.

### When NOT to use a comprehension

Comprehensions are for **building a collection from an expression**. Reach for
a plain loop when:

- you want **side effects** (printing, DB writes) — \`[save(u) for u in users]\`
  builds a pointless list of return values and reviewers will flag it;
- it needs **more than two clauses** or a nested comprehension inside another —
  if you have to squint, write the foreach-shaped loop;
- the transform needs multiple statements — comprehensions take one expression.

### A scoping bonus PHP doesn't give you

A comprehension runs in its **own scope**: the loop variable doesn't leak.

\`\`\`python
n = "untouched"
doubled = [n * 2 for n in nums]
print(n)                               # still "untouched"
\`\`\`

In PHP, \`foreach (\$nums as \$n)\` leaves \`\$n\` (and its last value) alive after
the loop — a documented footgun, especially with \`foreach ... as &\$ref\`.
Python comprehensions are leak-free by design.
`,

  comparisons: [
    {
      label: "map + filter in one expression",
      intro:
        "Square only the even numbers. PHP chains array_filter into array_map (building an intermediate array); Python does both in a single pass.",
      php: `<?php
$nums = [1, 2, 3, 4, 5, 6];

$evenSquares = array_map(
    fn($n) => $n * $n,
    array_filter($nums, fn($n) => $n % 2 === 0)
);
// [4, 16, 36] - with an intermediate array in between`,
      ts: `nums = [1, 2, 3, 4, 5, 6]

even_squares = [n * n for n in nums if n % 2 == 0]
# [4, 16, 36] - one expression, one pass

# reading order: expression, loop, condition`,
      note:
        "One comprehension replaces the map-over-filter chain: no callbacks, no intermediate array, and the transform and test sit in the same expression.",
    },
    {
      label: "Building a keyed map",
      intro:
        "Index users' names by their id. PHP's array_column (or a foreach into $result[$key]) becomes a dict comprehension.",
      php: `<?php
$users = [
    ['id' => 7,  'name' => 'Ada'],
    ['id' => 12, 'name' => 'Linus'],
];

$byId = array_column($users, 'name', 'id');
// [7 => 'Ada', 12 => 'Linus']`,
      ts: `users = [
    {"id": 7,  "name": "Ada"},
    {"id": 12, "name": "Linus"},
]

by_id = {u["id"]: u["name"] for u in users}
# {7: 'Ada', 12: 'Linus'}`,
      note:
        "The dict comprehension {key: value for ...} generalises array_column — the key and value can be any expression, not just column names.",
    },
    {
      label: "Lazy aggregation with a generator expression",
      intro:
        "Sum the squares of a large sequence without materialising a second array. PHP builds the mapped array first; a Python generator expression never does.",
      php: `<?php
$nums = range(1, 1_000_000);

// array_map allocates a second million-element array
$total = array_sum(array_map(fn($n) => $n * $n, $nums));

// avoiding that means a manual foreach + accumulator`,
      ts: `nums = range(1, 1_000_001)

# parentheses instead of brackets = lazy generator:
total = sum(n * n for n in nums)
# values stream one at a time - no list is built

# any()/all() even short-circuit:
found = any(n > 999_998 for n in nums)`,
      note:
        "Brackets build the whole list in memory; parentheses yield values on demand. Feeding sum/any/all/max a generator expression is constant-memory — PHP needs a hand-written yield generator to match it.",
    },
    {
      label: "Loop-variable leakage",
      intro:
        "Use a throwaway loop variable that collides with an existing name. PHP's foreach clobbers it; a Python comprehension can't touch it.",
      php: `<?php
$n = 'untouched';
$nums = [1, 2, 3];

$doubled = [];
foreach ($nums as $n) {
    $doubled[] = $n * 2;
}

echo $n;   // 3 - foreach leaked into the function scope`,
      ts: `n = "untouched"
nums = [1, 2, 3]

doubled = [n * 2 for n in nums]

print(n)   # 'untouched' - comprehensions
           # run in their own scope`,
      note:
        "A comprehension's loop variable lives and dies inside the expression; PHP's foreach variable survives the loop with its last value (worse still as a &reference).",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "All four comprehension shapes plus a generator expression. Predict each printed collection — and what the final print(n) shows after the comprehension reuses the name.",
    code: `nums = [1, 2, 3, 4, 5, 6]

# array_map: transform every element
squares = [n * n for n in nums]
print(squares)

# array_filter: keep some elements
evens = [n for n in nums if n % 2 == 0]
print(evens)

# map + filter in ONE expression (PHP needs two calls)
even_squares = [n * n for n in nums if n % 2 == 0]
print(even_squares)

# dict comprehension
users = ["Ada", "Linus", "Guido"]
lengths = {name: len(name) for name in users}
print(lengths)

# set comprehension (dedupes as it goes)
initials = {name[0].lower() for name in users}
print(sorted(initials))

# nested loops flatten - reads left to right like the foreachs
matrix = [[1, 2], [3, 4], [5, 6]]
flat = [n for row in matrix for n in row]
print(flat)

# generator expression: lazy, never builds a list
total = sum(n * n for n in nums)
print(total)

# the loop variable does NOT leak (unlike PHP foreach)
n = "untouched"
doubled = [n * 2 for n in nums]
print(n)`,
    output: `[1, 4, 9, 16, 25, 36]
[2, 4, 6]
[4, 16, 36]
{'Ada': 3, 'Linus': 5, 'Guido': 5}
['a', 'g', 'l']
[1, 2, 3, 4, 5, 6]
91
untouched`,
  },

  keyPoints: [
    "`[f(x) for x in xs]` is `array_map`; add `if cond` for `array_filter`; together they do map+filter in one pass, one expression.",
    "Fixed reading order: **expression, loop, condition** — the foreach you'd write, with the result first.",
    "`{k: v for ...}` builds dicts (generalising `array_column`); `{expr for ...}` builds sets, deduping as it goes.",
    "Multiple `for` clauses nest left-to-right: `[n for row in matrix for n in row]` flattens like nested foreachs.",
    "Parentheses make it a lazy generator expression — `sum(n * n for n in nums)` never builds a list; `any`/`all` even short-circuit.",
    "Skip comprehensions for side effects or 3+ clauses — write the loop; and unlike PHP's `foreach`, the loop variable never leaks out.",
  ],

  interview: [
    {
      q: "You know array_map and array_filter from PHP. What do Python comprehensions add beyond replacing them?",
      a: "Three things. First, fusion: `[n * n for n in nums if n % 2 == 0]` does map *and* filter in one pass with no callbacks and no intermediate array, where PHP composes two function calls. Second, they generalise across collection types — the same syntax with `{k: v ...}` builds dicts (replacing array_column and the foreach-into-`$result[$key]` pattern) and `{...}` builds sets. Third, swapping brackets for parentheses gives a lazy generator expression, so `sum(x * x for x in huge)` runs in constant memory — PHP needs an explicit `yield` generator to get that. They're also expressions, so they slot into arguments and returns directly, and their loop variable is scoped to the comprehension rather than leaking like `foreach`'s.",
    },
    {
      q: "When would you deliberately not use a comprehension?",
      a: "When I'm not actually building a collection. If the body exists for side effects — sending emails, DB writes, printing — `[send(u) for u in users]` allocates a junk list of return values and obscures intent; that's a plain for loop. I also bail out on complexity: more than two clauses, or a comprehension nested inside another comprehension's expression, is usually harder to read than the equivalent loop, and a multi-statement transform can't fit at all since the leading slot takes a single expression. The rule of thumb I use: if I can read it aloud as one English sentence — 'the square of n, for each n in nums, if n is even' — it's a comprehension; otherwise it's a loop.",
    },
    {
      q: "What's the difference between [x for x in xs] and (x for x in xs)?",
      a: "Brackets build the entire list in memory immediately; parentheses create a generator expression that yields items one at a time as something consumes it. The generator is constant-memory and can short-circuit — `any(u.is_admin for u in users)` stops at the first hit — but it's single-use (exhausted after one pass), has no `len()`, and can't be indexed. Practically: if the result is consumed once by an aggregator like `sum`, `max`, `any`, `all` or a `for` loop, use the generator; if you need to iterate it twice, index it, or inspect it, build the list. Nice detail: as a sole function argument the extra parentheses drop, so `sum(n * n for n in nums)` is the idiomatic spelling.",
    },
  ],

  quiz: [
    {
      question: "Which comprehension is equivalent to array_map over array_filter — squaring only the odd numbers?",
      options: [
        "[n * n for n in nums if n % 2 == 1]",
        "[n * n if n % 2 == 1 for n in nums]",
        "[for n in nums: n * n if n % 2 == 1]",
        "[n % 2 == 1 for n in nums if n * n]",
      ],
      answerIndex: 0,
      explain:
        "The grammar is fixed: expression (`n * n`), then the loop (`for n in nums`), then the filter (`if n % 2 == 1`). Option 2 misplaces the filter — a leading `x if cond else y` is only legal with an else, as a conditional expression.",
    },
    {
      question: "What does `sum(n * n for n in range(1_000_000))` build in memory?",
      options: [
        "A million-element list of squares, then sums it",
        "Two lists — the range and the squares",
        "No list at all — a generator yields each square to sum() on demand",
        "It's a SyntaxError: sum() needs square brackets",
      ],
      answerIndex: 2,
      explain:
        "Without square brackets this is a generator expression: values stream into sum() one at a time, constant memory. As the sole argument to a function, the generator's own parentheses can be omitted.",
    },
    {
      question: "After running `x = 10` then `squares = [x * x for x in range(5)]`, what is `x`?",
      options: ["4", "16", "10", "Undefined — a NameError"],
      answerIndex: 2,
      explain:
        "Comprehensions execute in their own scope, so the inner `x` never touches the outer one — `x` is still 10. PHP's foreach is the opposite: `$x` would hold the last iteration's value after the loop.",
    },
    {
      question: "Which task is a poor fit for a comprehension?",
      options: [
        "Building a dict of id => user from a list",
        "Sending an email to every user in a list",
        "Flattening a two-level list",
        "Collecting the unique first letters of some words",
      ],
      answerIndex: 1,
      explain:
        "Comprehensions are for constructing collections. Using one to fire side effects builds a throwaway list of return values and hides the intent — a plain for loop is the idiomatic choice there.",
    },
  ],
};

export default lesson;
