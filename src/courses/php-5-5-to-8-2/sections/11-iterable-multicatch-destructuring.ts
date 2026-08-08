import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "iterable-multicatch-destructuring",
  title: "PHP 7.1 Quality-of-Life: iterable, Multi-Catch & [] Destructuring",
  part: "PHP 7.1–7.4: Refinements",
  estMinutes: 12,

  summary:
    "PHP 7.1 sands off four rough edges at once: the iterable pseudo-type, multi-catch blocks, class-constant visibility, and symmetric array destructuring with [] — including by key.",

  concept: `
PHP 7.0 was the headline release; **7.1** is the one that makes day-to-day code
read better. None of these features change *what* you can do — they remove
boilerplate and ceremony you've been writing since 5.5.

### \`iterable\` — accept arrays AND Generators

Before 7.1 a function that walked a sequence had to choose: type-hint \`array\`
(and reject Generators), or hint nothing (and lose all type safety). The
\`iterable\` pseudo-type accepts **anything you can \`foreach\`** — an \`array\` or
any \`Traversable\` (including a \`Generator\`).

\`\`\`php
function sum(iterable $numbers): int {     // PHP 7.1+
    $total = 0;
    foreach ($numbers as $n) { $total += $n; }
    return $total;
}
sum([1, 2, 3]);            // array — ok
sum(gen());                // Generator — also ok
\`\`\`

### Multi-catch — one block, several exception types

In 5.5 you either duplicated the \`catch\` body or caught a common base class
(and lost specificity). PHP 7.1 lets you list types with \`|\`:

\`\`\`php
try {
    risky();
} catch (LogicException | RuntimeException $e) {   // 7.1+
    log($e);
}
\`\`\`

### Class-constant visibility

Class constants were *always* public in 5.5. PHP 7.1 added \`private\` /
\`protected\` / \`public const\`, so internal constants stop leaking into your API.

\`\`\`php
class Config {
    private const SECRET = 'xyz';   // 7.1+ — not visible outside
    public  const VERSION = '2.0';
}
\`\`\`

### Symmetric array destructuring with \`[]\`

5.5 unpacked arrays only with \`list()\`. PHP 7.1 added \`[]\` on the **left** of
\`=\`, and — crucially — **keyed** destructuring, which \`list()\` couldn't do:

- \`[$a, $b] = [1, 2];\` — positional, mirrors how you'd *write* the array.
- \`['id' => $id, 'name' => $name] = $row;\` — pull values by key, any order.
- Works in \`foreach\`: \`foreach ($rows as ['id' => $id]) { ... }\`.

\`\`\`php
['x' => $x, 'y' => $y] = ['y' => 2, 'x' => 1];  // $x = 1, $y = 2
\`\`\`

The old \`list()\` still works; \`[]\` is just the symmetric, key-aware upgrade.
`,

  comparisons: [
    {
      label: "Accepting arrays or Generators",
      intro:
        "We want a sum() function that adds up a sequence of numbers, whether the caller passes a plain array or a lazy Generator. The goal is to keep a meaningful type hint while still accepting both.",
      php: `<?php
// PHP 5.5 — hint "array" rejects Generators,
// so you drop the type hint and lose safety
function sum($numbers) {
    $total = 0;
    foreach ($numbers as $n) {
        $total += $n;
    }
    return $total;
}`,
      ts: `<?php
// PHP 7.1 — iterable accepts arrays AND any Traversable
function sum(iterable $numbers): int {
    $total = 0;
    foreach ($numbers as $n) {
        $total += $n;
    }
    return $total;
}`,
      note:
        "The iterable pseudo-type (PHP 7.1) matches array or any Traversable (e.g. a Generator), so you keep a type hint without rejecting lazy sequences.",
    },
    {
      label: "Catching several exception types",
      intro:
        "A risky() call can throw either a LogicException or a RuntimeException, and we want to log both the same way. The aim is a single handler that runs identical recovery code for either type.",
      php: `<?php
// PHP 5.5 — duplicate the body, or catch a base class
try {
    risky();
} catch (LogicException $e) {
    logError($e);
} catch (RuntimeException $e) {
    logError($e);
}`,
      ts: `<?php
// PHP 7.1 — one block, types joined with |
try {
    risky();
} catch (LogicException | RuntimeException $e) {
    logError($e);
}`,
      note:
        "Multi-catch (PHP 7.1) lists exception types with | so one handler covers several unrelated classes without duplication or over-broad base catches.",
    },
    {
      label: "Hiding an internal class constant",
      intro:
        "A Config class holds a secret value that should stay internal alongside a version string that is fine to expose. We want SECRET to be unreachable from outside the class while VERSION remains public.",
      php: `<?php
// PHP 5.5 — every class constant is public
class Config {
    const SECRET  = 'xyz';   // leaks into the API
    const VERSION = '2.0';
}
// Config::SECRET is readable from anywhere`,
      ts: `<?php
// PHP 7.1 — constants can be private/protected
class Config {
    private const SECRET  = 'xyz'; // hidden
    public  const VERSION = '2.0';
}
// Config::SECRET => Error: cannot access private const`,
      note:
        "Class-constant visibility (private/protected/public const) arrived in PHP 7.1; before that all constants were implicitly public.",
    },
    {
      label: "Unpacking a row by key",
      intro:
        "We have an associative row like ['id' => 7, 'name' => 'Ada'] and want to pull its id and name into separate variables in one step, regardless of key order. The goal is concise extraction by key rather than repeated index lookups.",
      php: `<?php
// PHP 5.5 — list() is positional only; keys are awkward
$row = ['id' => 7, 'name' => 'Ada'];
$id   = $row['id'];
$name = $row['name'];

// list() needs values in declared order, no keys
list($a, $b) = [1, 2];`,
      ts: `<?php
// PHP 7.1 — [] on the left, including by key, any order
$row = ['id' => 7, 'name' => 'Ada'];
['name' => $name, 'id' => $id] = $row;

// positional still works, now with [] too
[$a, $b] = [1, 2];`,
      note:
        "Symmetric array destructuring with [] (PHP 7.1) added keyed unpacking (['key' => $var] = ...), something list() never supported.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Four 7.1 features in one snippet — predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

function numbers(): iterable {        // 7.1 pseudo-type + Generator
    yield 1;
    yield 2;
    yield 3;
}

function total(iterable $xs): int {
    $sum = 0;
    foreach ($xs as $x) { $sum += $x; }
    return $sum;
}

// Works for a Generator and a plain array:
echo total(numbers()) + total([10, 20]), "\\n";

// Keyed destructuring, keys out of order:
$row = ['id' => 7, 'name' => 'Ada'];
['name' => $name, 'id' => $id] = $row;
echo "{$id}:{$name}\\n";

// Destructuring inside foreach:
$pairs = [[1, 'a'], [2, 'b']];
foreach ($pairs as [$num, $letter]) {
    echo "{$num}{$letter} ";
}
echo "\\n";

// Multi-catch:
try {
    throw new RuntimeException('boom');
} catch (LogicException | RuntimeException $e) {
    echo 'caught: ' . $e->getMessage() . "\\n";
}`,
    output: `36
7:Ada
1a 2b 
caught: boom`,
  },

  keyPoints: [
    "`iterable` (7.1) = `array | Traversable` — type-hint sequences without rejecting Generators.",
    "Multi-catch `catch (A | B $e)` (7.1) replaces duplicated catch bodies and over-broad base catches.",
    "Class constants can now be `private`/`protected`/`public const` (7.1); before, all were implicitly public.",
    "`[]` array destructuring (7.1) is symmetric with array *creation* and supports **keyed** unpacking — `list()` can't.",
    "`['key' => $var] = $arr` pulls by key in any order, and works directly in `foreach`.",
    "`list()` still works; `[]` is the modern, key-aware spelling — no upgrade pressure, just nicer code.",
  ],

  interview: [
    {
      q: "What does the `iterable` type accept, and why prefer it over `array`?",
      a: "`iterable` (PHP 7.1) is a pseudo-type matching **`array` or any `Traversable`** — most importantly **Generators**. Hinting `array` forces a caller to materialize a whole list in memory; `iterable` lets them pass a lazy `Generator` instead, so you keep type safety *and* streaming. It's the right hint for any function that just `foreach`es its argument.",
    },
    {
      q: "How do you catch two unrelated exception types with one handler, and when is that better than catching a base class?",
      a: "Use multi-catch: `catch (LogicException | RuntimeException $e)` (PHP 7.1). It's better than catching a common base when the two types have **no useful shared ancestor** (or when their nearest ancestor would also swallow exceptions you *don't* want to handle). Multi-catch keeps the handler narrow and explicit instead of catching `Exception` and hoping for the best.",
    },
    {
      q: "What's the difference between `list()` and `[]` destructuring?",
      a: "Both unpack an array into variables. `list()` exists since forever but is **positional only**. The `[]` form (PHP 7.1) is *symmetric* with array literals and, crucially, supports **keyed** destructuring: `['id' => $id, 'name' => $name] = $row;` pulls values by key in any order — something `list()` can't express. `[]` also reads cleanly inside `foreach`: `foreach ($rows as ['id' => $id]) {}`.",
    },
    {
      q: "Before 7.1, how would you stop a class constant from being part of your public API?",
      a: "You couldn't — in PHP 5.5 every `const` on a class was **implicitly public**, so internal magic numbers and strings leaked out. Conventions like a leading-underscore name were the only signal. PHP 7.1 added real **constant visibility** (`private const` / `protected const`), so `Config::SECRET` can be genuinely inaccessible from outside, enforced by the engine.",
    },
  ],

  quiz: [
    {
      question: "Which values satisfy an `iterable` type hint?",
      options: [
        "Only arrays",
        "Only Generators",
        "Arrays and any Traversable (including Generators)",
        "Any value that is not null",
      ],
      answerIndex: 2,
      explain:
        "`iterable` (PHP 7.1) is a pseudo-type meaning `array` OR any object implementing `Traversable`, which includes Generators — anything you can `foreach`.",
    },
    {
      question: "What can `[]` destructuring do that `list()` cannot?",
      options: [
        "Unpack into more than two variables",
        "Destructure by key, e.g. `['id' => $id] = $row`",
        "Be used on the right-hand side of `=`",
        "Skip elements with empty slots",
      ],
      answerIndex: 1,
      explain:
        "Both forms are positional, but only the `[]` form (PHP 7.1) supports keyed destructuring like `['id' => $id] = $row`. `list()` is positional only. (Both can skip slots and unpack many variables.)",
    },
    {
      question: "In PHP 5.5, what is the visibility of a class constant declared with `const FOO = 1;`?",
      options: [
        "Private to the declaring class",
        "Protected (class and subclasses)",
        "Always public",
        "Depends on the surrounding namespace",
      ],
      answerIndex: 2,
      explain:
        "Before PHP 7.1, class constants were always implicitly public. The `private`/`protected`/`public const` modifiers were introduced in 7.1.",
    },
  ],
};

export default lesson;
