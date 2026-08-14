import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "spaceship-and-sorting",
  title: "The Spaceship Operator: Sorting Without the Boilerplate",
  part: "PHP 7.0: Types & the Engine",
  estMinutes: 11,
  summary:
    "How the <=> operator collapses three-way comparison logic into one symbol, and makes single- and multi-key sorts read like the intent behind them.",

  concept: `
In 5.5, every \`usort\` comparator was a tiny ritual: figure out whether the left
value is less than, equal to, or greater than the right, and hand back a
negative, zero, or positive integer. PHP 7.0 turned that whole ritual into a
single operator — the **spaceship**, \`<=>\`.

### What \`<=>\` actually does

\`$a <=> $b\` evaluates to:

- **\`-1\`** when \`$a < $b\`,
- **\`0\`** when they're equal,
- **\`1\`** when \`$a > $b\`.

That is *exactly* the contract \`usort\` wants from a comparator — a number whose
**sign** decides the order. So the comparator body shrinks to one line. It works
for ints, floats, strings (lexicographic), and even arrays compared element by
element, using PHP's standard comparison rules.

### The 5.5 way, by hand

\`\`\`php
usort($users, function ($a, $b) {
    if ($a['age'] == $b['age']) return 0;
    return ($a['age'] < $b['age']) ? -1 : 1;
});
\`\`\`

Correct, but noisy — and a magnet for the classic \`$a - $b\` bug, which overflows
or mis-sorts floats and breaks on strings.

### The 7.0 way

\`\`\`php
usort($users, fn($a, $b) => $a['age'] <=> $b['age']);
\`\`\`

(The arrow function \`fn\` is itself 7.4; on 7.0 use a normal \`function\`.)

### Multi-key sorts: the real payoff

Spaceship shines when you sort by more than one field. Because \`<=>\` returns
\`0\` on a tie, you chain with the **Elvis operator** \`?:\` — "if this comparison
is a tie (0, falsy), fall through to the next":

\`\`\`php
usort($people, fn($a, $b) =>
    $a['lastName']  <=> $b['lastName']
    ?: $a['firstName'] <=> $b['firstName']
    ?: $a['age']       <=> $b['age']
);
\`\`\`

Sort by last name; break ties by first name; break remaining ties by age. The
5.5 equivalent is a staircase of nested \`if\`s.

### Reversing

To flip a key's direction, swap the operands — \`$b <=> $a\` — or negate the
result. No special-casing required.
`,

  comparisons: [
    {
      label: "A single-key comparator",
      intro:
        "We want to sort a list of users by their age, youngest first. Both versions feed usort a comparator that returns negative/zero/positive to order each pair, producing the same sorted result.",
      php: `<?php
// PHP 5.5 — three-way result written by hand
usort($users, function ($a, $b) {
    if ($a['age'] == $b['age']) {
        return 0;
    }
    return ($a['age'] < $b['age']) ? -1 : 1;
});`,
      ts: `<?php
// PHP 7.0 — the spaceship returns -1/0/1 for you
usort($users, function ($a, $b) {
    return $a['age'] <=> $b['age'];
});`,
      note:
        "The combined comparison (spaceship) operator <=> arrived in PHP 7.0 and yields exactly the -1/0/1 a comparator needs.",
    },
    {
      label: "The tempting-but-broken shortcut",
      intro:
        "Here we just want to sort an array of numbers ascending. A popular one-liner subtracts the two values, but it misbehaves on large ints, floats, and strings; the goal is a comparator that sorts correctly for any of those.",
      php: `<?php
// PHP 5.5 — '$a - $b' looks clever but is buggy:
// it overflows on big ints, truncates floats, and
// silently treats non-numeric strings as 0
// (on PHP 8 that subtraction throws a TypeError).
usort($nums, function ($a, $b) {
    return $a - $b;
});`,
      ts: `<?php
// PHP 7.0 — spaceship is safe for ints, floats, strings
usort($nums, function ($a, $b) {
    return $a <=> $b;
});`,
      note:
        "Subtraction-as-comparator was always fragile; <=> (7.0) is the correct, type-aware replacement.",
    },
    {
      label: "Multi-key sort",
      intro:
        "We want people ordered by last name, and within the same last name, by first name. This needs tie-breaking: when the primary key matches, the sort falls through to a secondary key.",
      php: `<?php
// PHP 5.5 — nested ifs for tie-breaking
usort($people, function ($a, $b) {
    $cmp = strcmp($a['lastName'], $b['lastName']);
    if ($cmp !== 0) {
        return $cmp;
    }
    return strcmp($a['firstName'], $b['firstName']);
});`,
      ts: `<?php
// PHP 7.0 — chain comparisons with the Elvis operator
usort($people, function ($a, $b) {
    return $a['lastName']  <=> $b['lastName']
        ?: $a['firstName'] <=> $b['firstName'];
});`,
      note:
        "<=> returns 0 on a tie, so ?: (the short ternary, available since 5.3) cleanly falls through to the next key.",
    },
    {
      label: "Reversing a sort direction",
      intro:
        "Here we rank users by score from highest to lowest. Sorting descending means inverting the usual comparison, so the top scorer ends up first.",
      php: `<?php
// PHP 5.5 — flip the branches to sort descending
usort($users, function ($a, $b) {
    if ($a['score'] == $b['score']) {
        return 0;
    }
    return ($a['score'] > $b['score']) ? -1 : 1;
});`,
      ts: `<?php
// PHP 7.0 — just swap the operands
usort($users, function ($a, $b) {
    return $b['score'] <=> $a['score'];
});`,
      note:
        "Descending order is a one-character change with <=> (7.0): put $b on the left.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A two-key sort with the spaceship operator. Predict the order, then reveal the output.",
    code: `<?php
$people = [
    ['last' => 'Lovelace', 'first' => 'Ada',   'age' => 36],
    ['last' => 'Turing',   'first' => 'Alan',  'age' => 41],
    ['last' => 'Lovelace', 'first' => 'Augusta', 'age' => 28],
];

// Sort by last name, then break ties by age (descending):
usort($people, function ($a, $b) {
    return $a['last'] <=> $b['last']
        ?: $b['age']  <=> $a['age'];
});

foreach ($people as $p) {
    echo "{$p['last']}, {$p['first']} ({$p['age']})\\n";
}

// The operator itself just returns -1/0/1:
var_dump(1 <=> 2, 2 <=> 2, 3 <=> 2);`,
    output: `Lovelace, Ada (36)
Lovelace, Augusta (28)
Turing, Alan (41)
int(-1)
int(0)
int(1)`,
  },

  keyPoints: [
    "`<=>` (PHP 7.0) returns `-1`, `0`, or `1` — precisely the three-way result `usort`/`uasort`/`uksort` expect.",
    "It replaces the hand-written `if/return -1/0/1` comparator you wrote in 5.5.",
    "Never use `$a - $b` as a comparator: it overflows, mishandles floats, and breaks on strings. `<=>` is the safe fix.",
    "Chain `<=>` with `?:` for multi-key sorts — a tie returns `0` (falsy) and falls through to the next key.",
    "Reverse a key by swapping the operands: `$b <=> $a` sorts that field descending.",
    "It compares ints, floats, strings (lexicographically), and arrays element-by-element using PHP's standard rules.",
  ],

  interview: [
    {
      q: "What does the spaceship operator return, and which sorting functions does that suit?",
      a: "`$a <=> $b` returns an integer: `-1` if `$a < $b`, `0` if they're equal, and `1` if `$a > $b`. That's exactly the contract user-defined comparators must satisfy — `usort`, `uasort`, and `uksort` only care about the **sign** of the returned value — so the comparator body becomes a single `return $a <=> $b;`. It arrived in PHP 7.0.",
    },
    {
      q: "How would you sort by last name, then first name, then age in modern PHP?",
      a: "Chain spaceship comparisons with the Elvis operator `?:`:\n\n```php\nusort($people, fn($a, $b) =>\n    $a['last']  <=> $b['last']\n    ?: $a['first'] <=> $b['first']\n    ?: $a['age']   <=> $b['age']\n);\n```\n\nEach `<=>` returns `0` on a tie, which is falsy, so `?:` moves on to the next key. In 5.5 this was a staircase of nested `if`s.",
    },
    {
      q: "Why is `return $a - $b;` a bad comparator, and what should you use instead?",
      a: "Subtraction only works for small integers. It can **overflow** for large values (wrapping to the wrong sign), it **truncates floats** to ints so close values compare as equal, and it **fatals** on non-numeric strings under modern PHP. The correct, type-aware replacement is `return $a <=> $b;`, which handles ints, floats, and strings properly.",
    },
    {
      q: "How do you reverse the direction of one key in a multi-key sort?",
      a: "Swap the operands for just that key: `$b <=> $a` sorts it descending while the other keys stay ascending. For example `$a['last'] <=> $b['last'] ?: $b['age'] <=> $a['age']` sorts by last name ascending, then by age descending within each name.",
    },
  ],

  quiz: [
    {
      question: "What does `5 <=> 3` evaluate to?",
      options: ["`2`", "`1`", "`true`", "`-1`"],
      answerIndex: 1,
      explain:
        "The spaceship operator returns `1` when the left operand is greater than the right (and `-1` when less, `0` when equal) — not the arithmetic difference, so it's `1`, not `2`.",
    },
    {
      question: "In `$a['x'] <=> $b['x'] ?: $a['y'] <=> $b['y']`, when is the `$a['y'] <=> $b['y']` part used?",
      options: [
        "Always — both comparisons are summed",
        "Only when the first comparison returns `0` (a tie on `x`)",
        "Only when the first comparison returns `1`",
        "Never — `?:` short-circuits on the first non-null value",
      ],
      answerIndex: 1,
      explain:
        "`?:` returns its left side if that side is truthy, otherwise the right. `<=>` returns `0` (falsy) only on a tie, so the `y` comparison is the tie-breaker used exactly when `x` values are equal.",
    },
    {
      question: "Which PHP version introduced the `<=>` operator?",
      options: ["PHP 5.6", "PHP 7.0", "PHP 7.4", "PHP 8.0"],
      answerIndex: 1,
      explain:
        "The combined comparison (spaceship) operator was added in PHP 7.0. The arrow-function syntax often used alongside it (`fn`) came later, in PHP 7.4.",
    },
  ],
};

export default lesson;
