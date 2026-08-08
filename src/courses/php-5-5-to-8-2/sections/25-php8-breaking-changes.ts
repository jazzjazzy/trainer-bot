import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "php8-breaking-changes",
  title: "PHP 8.0 Breaking Changes: What Will Bite You",
  part: "PHP 8.0: The Big Leap",
  estMinutes: 13,
  summary:
    "The PHP 8.0 breaking changes a 5.5 upgrader must test for: saner comparisons, warnings promoted to TypeError/ValueError, @ no longer hiding fatals, stricter defaults, and removed legacy functions.",

  concept: `
PHP 8.0 is the most rewarding upgrade in this whole range — and the one most
likely to surface latent bugs. Most "breaks" are the engine finally refusing to
paper over mistakes your 5.5 code has been getting away with for years. Here's
what to grep for and test before you ship.

### Saner string ↔ number comparison

The single most impactful change. In 5.5, comparing a number to a non-numeric
string cast the **string to 0**, so \`0 == "foo"\` was *true* — a classic source
of auth bypasses. In 8.0 the **number is cast to a string** instead when the
other side is a non-numeric string:

\`\`\`php
0 == "foo"     // 5.5: true   →  8.0: false
0 == ""        // 5.5: true   →  8.0: false
"1" == "01"    // both: true  (two numeric strings, compared as numbers)
"10" == "1e1"  // both: true  (numeric strings)
100 == "1e2"   // both: true
"abc" == 0     // 5.5: true   →  8.0: false
\`\`\`

Audit every loose \`==\` that compares user input to a number or literal.

### Warnings promoted to TypeError / ValueError

Many things that emitted a *warning* and limped on in 5.5 now **throw**:

- Passing the wrong type to an internal function → \`TypeError\`.
- An invalid argument value (e.g. a negative width, an empty needle in some
  funcs) → \`ValueError\` (a new 8.0 exception type).
- Calling a method on a non-object → \`Error\`, not a fatal you can't catch.

### @ no longer silences fatal errors

The \`@\` operator still suppresses warnings/notices, but in 8.0 it **no longer
hides errors that halt execution**. Code that quietly relied on \`@\` hiding a
fatal will now actually fail.

### Stricter default error reporting

8.0 reports more by default. Undefined variables and undefined array keys, which
were silent or mere notices, are now **warnings** (\`E_WARNING\`). Code that runs
clean isn't affected, but noisy logs will reveal real bugs.

### Removed legacy functions

Gone for good — replace before upgrading:

- \`each()\` — removed (deprecated in 7.2). Use \`foreach\`.
- \`create_function()\` — removed. Use a real closure / arrow function.
- The legacy \`mysql_*\` extension was already gone in 7.0; \`mysqli\`/PDO only.

**How to test:** run with \`error_reporting(E_ALL)\`, exercise loose comparisons
against user input, and lean on **Rector** and **PHPCompatibility** to flag the
removed functions automatically.
`,

  comparisons: [
    {
      label: "Loose comparison with a non-numeric string",
      intro:
        "We check user input that holds the word 'foo' against the number 0 with a loose ==, the kind of guard that creeps into auth or routing code. The goal is for that branch to run only on a real zero, never on arbitrary text.",
      php: `<?php
// PHP 5.5 — the string is cast to 0, so this is TRUE.
// A nasty bug: any non-numeric input "equals" 0.
$input = 'foo';
if ($input == 0) {
    echo "matched zero\\n"; // prints in 5.5
}`,
      ts: `<?php
// PHP 8.0 — the number is cast to a string instead,
// so a non-numeric string no longer equals 0.
$input = 'foo';
if ($input == 0) {
    echo "matched zero\\n"; // does NOT print in 8.0
}`,
      note: "Changed in PHP 8.0: when comparing a number to a non-numeric string, the number is now cast to string, so 0 == 'foo' is false instead of true.",
    },
    {
      label: "Wrong type to an internal function",
      intro:
        "Here we accidentally hand an array to strlen(), which expects a string. We want to know what the engine does with that mistake and whether we get a usable length back.",
      php: `<?php
// PHP 5.5 — emits a warning and returns null/false,
// execution continues with a bad value.
$len = strlen([]); // Warning, returns null in 5.5`,
      ts: `<?php
// PHP 8.0 — throws TypeError you can catch.
try {
    $len = strlen([]);
} catch (\\TypeError $e) {
    echo $e->getMessage(), "\\n";
}`,
      note: "Changed in PHP 8.0: passing an invalid type to an internal function throws TypeError instead of emitting a warning and returning null.",
    },
    {
      label: "Invalid argument value",
      intro:
        "We call base_convert() with a base of 99, which is well outside the legal 2-36 range. The argument is the right type (a number) but a nonsensical value, and we want to see how PHP signals that.",
      php: `<?php
// PHP 5.5 — an out-of-range base just emits a warning
// and returns an empty string, execution continues.
$base = base_convert('ff', 99, 10); // Warning in 5.5`,
      ts: `<?php
// PHP 8.0 — out-of-range/invalid values throw ValueError,
// a new exception type introduced in 8.0.
try {
    $base = base_convert('ff', 99, 10); // invalid base
} catch (\\ValueError $e) {
    echo $e->getMessage(), "\\n";
}`,
      note: "Added in PHP 8.0: ValueError is thrown when an argument has the right type but an invalid value (e.g. an out-of-range numeric base).",
    },
    {
      label: "Building a callback dynamically",
      intro:
        "We need a small function that doubles a number and store it in a variable to call later. Both versions should print 42 from doubling 21; the question is how the callable is created.",
      php: `<?php
// PHP 5.5 — create_function() builds a callable from
// strings (slow, evals, can't be optimized).
$double = create_function('$n', 'return $n * 2;');
echo $double(21), "\\n";`,
      ts: `<?php
// PHP 8.0 — create_function() is REMOVED. Use a closure
// or arrow function instead.
$double = fn(int $n): int => $n * 2;
echo $double(21), "\\n";`,
      note: "Removed in PHP 8.0 (deprecated since 7.2): create_function() is gone — use closures or arrow functions (fn, added in 7.4).",
    },
    {
      label: "Iterating with the internal pointer",
      intro:
        "We loop over an associative array of colors and print each key and value. Both versions aim to output the same key=value lines; only the looping mechanism differs.",
      php: `<?php
// PHP 5.5 — each() walks the array via its internal pointer.
$colors = ['r' => 'red', 'g' => 'green'];
while (list($k, $v) = each($colors)) {
    echo "{$k}={$v}\\n";
}`,
      ts: `<?php
// PHP 8.0 — each() is REMOVED. Use foreach.
$colors = ['r' => 'red', 'g' => 'green'];
foreach ($colors as $k => $v) {
    echo "{$k}={$v}\\n";
}`,
      note: "Removed in PHP 8.0 (deprecated since 7.2): each() is gone — foreach is the replacement.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "These comparisons behave differently on 8.0 than they did on 5.5. Predict each line, then reveal.",
    code: `<?php
// PHP 8.0 comparison semantics:
var_dump(0 == "foo");    // 5.5: true
var_dump(0 == "");       // 5.5: true
var_dump("abc" == 0);    // 5.5: true
var_dump("1" == "01");   // numeric strings
var_dump("10" == "1e1"); // numeric strings
var_dump(100 == "1e2");  // number vs numeric string
var_dump("foo" == "0");  // two strings, not equal`,
    output: `bool(false)
bool(false)
bool(false)
bool(true)
bool(true)
bool(true)
bool(false)`,
  },

  keyPoints: [
    "PHP 8.0 changed `==` so a **non-numeric string no longer becomes 0**: `0 == \"foo\"` is now `false`. Audit every loose compare against user input.",
    "Two **numeric** strings still compare as numbers, so `\"1\" == \"01\"` and `100 == \"1e2\"` stay `true`.",
    "Many warnings became throwables: wrong type → `TypeError`, invalid value → the new `ValueError`, method-on-non-object → `Error`.",
    "The `@` operator **no longer suppresses fatal errors** — only warnings/notices.",
    "Default error reporting is stricter: undefined variables and undefined array keys now emit `E_WARNING`.",
    "`each()` and `create_function()` are **removed** — use `foreach` and closures/arrow functions.",
  ],

  interview: [
    {
      q: "What exactly changed about `==` in PHP 8.0, and why does it matter for security?",
      a: "In 5.5, comparing a number to a non-numeric string cast the **string to a number** (effectively 0), so `0 == \"foo\"` was `true`. That caused real **auth bypasses** — e.g. comparing a secret token `0` to arbitrary input. PHP 8.0 flips the rule: when one side is a non-numeric string, the **number is cast to a string** and they're compared as strings, so `0 == \"foo\"` is now `false`. Crucially, **numeric** strings are unaffected — `\"1\" == \"01\"` and `100 == \"1e2\"` are still `true` because both sides parse as numbers. The fix is to audit loose comparisons against user input and prefer strict `===` where types should match.",
    },
    {
      q: "Several functions that used to warn now throw in 8.0. Which exceptions, and how do you prepare?",
      a: "Passing the **wrong type** to an internal function throws `TypeError`; passing the **right type but an invalid value** (e.g. an out-of-range numeric base) throws `ValueError`, a **new exception class introduced in 8.0**. Calling a method on a non-object throws `Error`. To prepare, run your suite with `error_reporting(E_ALL)` on 7.4 first to surface the warnings, then fix them — because on 8.0 those same call sites will throw instead of limping on with a `null`/`false` return.",
    },
    {
      q: "Your legacy code uses `@` liberally. What's the gotcha in 8.0?",
      a: "The `@` error-suppression operator still hides warnings and notices, but in 8.0 it **no longer suppresses errors that halt execution** (fatals). Any code path that quietly depended on `@` swallowing a fatal — say `@$obj->method()` where `$obj` is null — will now actually crash with an uncatchable-looking `Error` unless you handle it. Treat every `@` as a code smell and remove it.",
    },
    {
      q: "What removed functions should you grep for before upgrading from 5.5?",
      a: "Two big ones removed in 8.0 (both deprecated back in 7.2): **`each()`** — replace with `foreach` — and **`create_function()`** — replace with a closure or arrow function (`fn`). The legacy **`mysql_*`** extension was already removed in 7.0, so it must be `mysqli` or PDO. Tools like **PHPCompatibility** (a PHP_CodeSniffer ruleset) and **Rector** will flag and often auto-fix all of these.",
    },
  ],

  quiz: [
    {
      question: "On PHP 8.0, what does `var_dump(0 == \"foo\")` print?",
      options: ["bool(true)", "bool(false)", "int(0)", "A TypeError is thrown"],
      answerIndex: 1,
      explain:
        "In PHP 8.0, comparing a number to a non-numeric string casts the number to a string, so 0 == \"foo\" is false. In 5.5 the string became 0 and it was true.",
    },
    {
      question: "Which of these loose comparisons is still `true` on PHP 8.0?",
      options: ['"abc" == 0', '0 == ""', '"1" == "01"', '"foo" == "0"'],
      answerIndex: 2,
      explain:
        'Both "1" and "01" are numeric strings, so they are compared as numbers (1 == 1) and the result is true. The others involve a non-numeric string and are false in 8.0.',
    },
    {
      question:
        "You pass an array to a built-in like `strlen()` on PHP 8.0. What happens?",
      options: [
        "It returns null with a warning, as in 5.5",
        "It throws a TypeError",
        "It throws a ValueError",
        "It silently returns 0",
      ],
      answerIndex: 1,
      explain:
        "Passing the wrong type to an internal function throws TypeError in 8.0. ValueError is for a correct type with an invalid value; in 5.5 this only emitted a warning and returned null.",
    },
  ],
};

export default lesson;
