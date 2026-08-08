import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "arrow-functions",
  title: "Arrow Functions: Closures Without the `use` Boilerplate",
  part: "PHP 7.1–7.4: Refinements",
  estMinutes: 11,
  summary:
    "PHP 7.4 arrow functions (`fn() =>`) give you single-expression closures that capture the enclosing scope automatically by value — no more verbose `use (...)` lists.",

  concept: `
In PHP 5.5 the only anonymous function you had was the classic closure:
\`function () { ... }\`. It's powerful, but for the small one-liners you pass to
\`array_map\`, \`array_filter\`, and \`usort\` it's noisy — and it can't *see* the
variables around it unless you list each one in a \`use\` clause.

PHP **7.4** (2019) added **arrow functions** to fix exactly that.

### The shape

\`\`\`php
$fn = fn($x) => $x * 2;   // PHP 7.4
\`\`\`

Three things to internalise:

- The body is a **single expression**, and its value is **returned implicitly**.
  There is no \`{ ... }\` block and no \`return\` keyword.
- Variables from the **enclosing scope are captured automatically, by value** —
  whatever they hold at the moment the arrow function is *defined*.
- It's still a real \`Closure\` object, so type hints, default values, variadics,
  and a return type all work: \`fn(int $x): int => $x + 1\`.

### Auto-capture is the whole point

A classic closure can only reach outer variables you explicitly import:

\`\`\`php
$factor = 3;
$f = function ($x) use ($factor) { return $x * $factor; }; // 5.5
$g = fn($x) => $x * $factor;                                // 7.4
\`\`\`

Both read \`$factor\`, but the arrow function grabs it for you. This shines when
mapping over data inside a method, where you'd otherwise \`use ($this->rate)\`
or copy properties into locals first.

### By value, always — and gotchas

- Capture is **by value**, like \`use ($x)\` *without* the \`&\`. Arrow functions
  **cannot capture by reference**; if you need to mutate an outer variable, use
  a classic closure with \`use (&$x)\`.
- Because it's auto-capture, there's no way to *not* capture something — the
  expression simply pulls in whatever names it references.
- One expression only. Need multiple statements or a loop body? Reach back for
  \`function () use (...) { ... }\`. Arrow functions don't replace closures; they
  cover the common single-expression case.
- Nested arrow functions compose naturally: the inner \`fn\` can see the outer
  \`fn\`'s parameters and captured variables, all by value.

### Versioning note

\`fn\` became a reserved keyword in 7.4. If you have a function or method literally
named \`fn\`, that's the one upgrade gotcha — rename it.
`,

  comparisons: [
    {
      label: "Doubling a list",
      intro:
        "The goal is to turn [1, 2, 3] into [2, 4, 6] by mapping a multiply-by-two function over the array. Both versions produce the same doubled list.",
      php: `<?php
// PHP 5.5 — closure, explicit return
$nums = [1, 2, 3];
$doubled = array_map(function ($n) {
    return $n * 2;
}, $nums);`,
      ts: `<?php
// PHP 7.4 — arrow function, implicit return
$nums = [1, 2, 3];
$doubled = array_map(fn($n) => $n * 2, $nums);`,
      note: "Arrow functions (7.4) drop the braces and the `return`; the single expression is returned automatically.",
    },
    {
      label: "Capturing an outer variable",
      intro:
        "Here we scale every number by a factor defined outside the callback, so the mapper needs to read the local $factor of 10. Both versions return [10, 20, 30].",
      php: `<?php
// PHP 5.5 — must import $factor via use()
$factor = 10;
$scaled = array_map(function ($n) use ($factor) {
    return $n * $factor;
}, [1, 2, 3]);`,
      ts: `<?php
// PHP 7.4 — $factor is captured automatically, by value
$factor = 10;
$scaled = array_map(fn($n) => $n * $factor, [1, 2, 3]);`,
      note: "Arrow functions auto-capture the enclosing scope by value (7.4), so the `use ($factor)` list disappears.",
    },
    {
      label: "Reaching $this inside a method",
      intro:
        "A Pricer method multiplies each price by a rate stored as an object property, so the callback inside the method needs access to $this->rate. Both versions return the marked-up prices.",
      php: `<?php
// PHP 5.5 — copy the property into a local, then import it
class Pricer {
    private $rate = 1.1;
    public function applyAll($prices) {
        $rate = $this->rate;
        return array_map(function ($p) use ($rate) {
            return $p * $rate;
        }, $prices);
    }
}`,
      ts: `<?php
// PHP 7.4 — read $this->rate directly inside the arrow fn
class Pricer {
    private $rate = 1.1;
    public function applyAll($prices) {
        return array_map(fn($p) => $p * $this->rate, $prices);
    }
}`,
      note: "Auto-capture (7.4) binds `$this` too, so you skip the copy-into-local dance closures forced in 5.5.",
    },
    {
      label: "Typed arrow function",
      intro:
        "This defines a small halving function and shows how to annotate it with an integer parameter and a float return type. The point is the type signatures, not the simple division itself.",
      php: `<?php
// PHP 5.5 — closures support type hints, but no scalar/return types yet
$half = function ($x) {
    return $x / 2;
};`,
      ts: `<?php
// PHP 7.4 — full scalar param + return type on a one-liner
$half = fn(int $x): float => $x / 2;`,
      note: "Arrow functions accept the same scalar types and return types (added in 7.0) as any function, on a single line.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Watch auto-capture in action, and note that capture is by value — frozen at definition time.",
    code: `<?php
$factor = 3;

// Arrow function captures $factor automatically, by value (PHP 7.4):
$triple = fn(int $n): int => $n * $factor;

// Changing $factor AFTER definition does not affect the captured value:
$factor = 99;

echo $triple(5), "\\n";          // uses the captured 3, not 99

$nums = [1, 2, 3, 4];
$evens = array_filter($nums, fn($n) => $n % 2 === 0);
echo implode(',', $evens), "\\n";

// Nested arrow functions compose; inner sees outer's parameter:
$adder = fn(int $a) => fn(int $b) => $a + $b;
echo $adder(10)(5), "\\n";`,
    output: `15
2,4
15`,
  },

  keyPoints: [
    "Arrow functions (`fn() => expr`) landed in **PHP 7.4** for single-expression closures.",
    "The body is one expression with an **implicit return** — no braces, no `return`.",
    "They **auto-capture the enclosing scope by value**, eliminating most `use (...)` clauses.",
    "Capture is by value only: there's **no by-reference capture** — use a classic closure with `use (&$x)` if you must mutate.",
    "They're still real `Closure` objects: type hints, defaults, variadics, return types, and `$this` all work.",
    "`fn` became a **reserved keyword** in 7.4 — rename any function literally called `fn`.",
  ],

  interview: [
    {
      q: "What does an arrow function give you over a classic closure, and when would you still use the closure?",
      a: "An arrow function (`fn($x) => $expr`, PHP 7.4) is a closure for the **single-expression** case: implicit return and **automatic by-value capture** of the enclosing scope, so no `use (...)` list. You reach for a **classic closure** when you need multiple statements, a loop, or **capture by reference** (`use (&$x)`) — arrow functions can't do any of those.",
    },
    {
      q: "How does variable capture differ between `fn` and `function () use (...)`?",
      a: "Both capture **by value** by default. The difference is that the arrow function captures **automatically** — any variable named in the expression is pulled in from the surrounding scope at definition time — whereas a classic closure captures **nothing unless you list it** in `use`. The classic closure can also capture **by reference** with `use (&$x)`; an arrow function has no by-reference form.",
    },
    {
      q: "Does an arrow function bind `$this`?",
      a: "Yes. Like a classic closure defined in a method, an arrow function (7.4) binds `$this`, so you can read `$this->rate` or call `$this->helper()` directly inside it. That removes the common 5.5 pattern of copying a property into a local just to `use` it.",
    },
    {
      q: "If `$x` changes after you define `fn() => $x`, does the function see the new value?",
      a: "No. Capture is **by value at definition time**, so the arrow function holds a snapshot. If `$x` is reassigned afterward, the function still uses the value it captured. (This matches `use ($x)`; only `use (&$x)` would track later changes — and arrow functions don't support that.)",
    },
  ],

  quiz: [
    {
      question: "In which PHP version were arrow functions (`fn() =>`) introduced?",
      options: ["PHP 5.6", "PHP 7.0", "PHP 7.4", "PHP 8.0"],
      answerIndex: 2,
      explain:
        "Arrow functions arrived in PHP 7.4 (2019). Classic closures with `use (...)` existed since PHP 5.3.",
    },
    {
      question: "How does `fn($n) => $n * $factor` get access to `$factor`?",
      options: [
        "You must add `use ($factor)` like a closure",
        "It is captured automatically from the enclosing scope, by value",
        "It is captured automatically, by reference",
        "It can't — `$factor` would be undefined inside the arrow function",
      ],
      answerIndex: 1,
      explain:
        "Arrow functions auto-capture any referenced outer variable by value at definition time, so no `use` list is needed and there is no by-reference capture.",
    },
    {
      question: "Which task can a classic closure do that an arrow function cannot?",
      options: [
        "Accept typed parameters",
        "Declare a return type",
        "Capture a variable by reference and run multiple statements",
        "Bind `$this`",
      ],
      answerIndex: 2,
      explain:
        "Arrow functions are limited to a single expression and capture only by value. By-reference capture (`use (&$x)`) and multi-statement bodies require a classic closure. Type hints, return types, and `$this` binding work in both.",
    },
  ],
};

export default lesson;
