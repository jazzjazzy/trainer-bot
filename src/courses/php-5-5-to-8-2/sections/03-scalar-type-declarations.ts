import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "scalar-type-declarations",
  title: "Scalar Type Declarations: From Docblocks to Enforced Types",
  part: "PHP 7.0: Types & the Engine",
  estMinutes: 12,

  summary:
    "PHP 7.0 turned int/float/string/bool into real, engine-checked parameter types — replacing the docblock-and-is_int() dance you wrote in 5.5.",

  concept: `
In PHP 5.5 the engine knew nothing about scalar types. You documented them in a
docblock for your IDE, then — if you actually cared at runtime — wrote manual
guard clauses with \`is_int()\`, \`is_string()\`, and friends. Nothing was enforced;
a typo'd caller could pass a string where you expected an int and you'd find out
three stack frames later.

### What PHP 7.0 added

**PHP 7.0** introduced **scalar type declarations** for parameters:
\`int\`, \`float\`, \`string\`, and \`bool\` (joining the \`array\`, \`callable\`, and
class/interface hints that already existed). Now the type is part of the
signature and the engine checks it on every call.

\`\`\`php
function repeat(string $text, int $times): string {
    return str_repeat($text, $times);
}
\`\`\`

### Coercive mode (the default)

By default PHP runs in **coercive mode**: if a value isn't the declared type but
can be losslessly-ish converted, the engine converts it for you.

- \`"42"\` passed to an \`int\` param becomes \`42\`.
- \`3\` passed to a \`float\` param becomes \`3.0\`.
- \`true\` passed to an \`int\` param becomes \`1\`.

What it will **not** do is accept nonsense: a non-numeric string for an \`int\`,
or an \`array\` for a \`string\`, throws a **\`TypeError\`**.

\`\`\`php
repeat("ab", "3");   // "3" coerced to 3 → "ababab"
repeat("ab", "x");   // TypeError: must be of type int, string given
\`\`\`

### The 5.5 way it replaces

Before 7.0, the same safety meant hand-rolled checks:

\`\`\`php
function repeat($text, $times) {
    if (!is_string($text) || !is_int($times)) {
        throw new InvalidArgumentException('bad args');
    }
    return str_repeat($text, $times);
}
\`\`\`

### Upgrade gotcha

Coercion is **looser** than strict mode but **stricter** than 5.5's "anything
goes." Code that quietly passed an array or an object-without-\`__toString\` into
a function that now declares \`string\` will start throwing \`TypeError\` after the
upgrade. The next lesson covers \`declare(strict_types=1)\`, which turns coercion
off entirely.
`,

  comparisons: [
    {
      label: "Declaring scalar parameter types",
      intro:
        "A small repeat() helper takes a string and a count and returns the string repeated that many times. The goal is to state the parameter types on the function so callers and the engine both know what's expected.",
      php: `<?php
// PHP 5.5 — types only in the docblock; engine ignores them
/**
 * @param string $text
 * @param int    $times
 * @return string
 */
function repeat($text, $times) {
    return str_repeat($text, $times);
}`,
      ts: `<?php
// PHP 7.0 — int/float/string/bool are enforced by the engine
function repeat(string $text, int $times): string {
    return str_repeat($text, $times);
}`,
      note:
        "Scalar parameter type declarations arrived in PHP 7.0; before that, scalar types lived only in docblocks the engine never read.",
    },
    {
      label: "Validating an argument",
      intro:
        "A setAge() function must reject anything that isn't an integer before using the value. The aim is to guarantee a bad argument fails loudly rather than slipping through.",
      php: `<?php
// PHP 5.5 — manual type guards on every entry point
function setAge($age) {
    if (!is_int($age)) {
        throw new InvalidArgumentException('age must be int');
    }
    return $age;
}`,
      ts: `<?php
// PHP 7.0 — the declaration IS the guard
function setAge(int $age): int {
    return $age;
}`,
      note:
        "A scalar type declaration (7.0) replaces hand-written is_int()/is_string() checks — the engine raises a TypeError for you.",
    },
    {
      label: "Numeric-string input (coercive mode)",
      intro:
        "A price() function receives a cents amount that often arrives as a numeric string (say from form input) and returns the dollar value. The goal is to work with it as a real integer without tripping over the string form.",
      php: `<?php
// PHP 5.5 — you cast defensively because nothing is checked
function price($cents) {
    $cents = (int) $cents;      // "150" -> 150
    return $cents / 100;
}`,
      ts: `<?php
// PHP 7.0 — coercive mode converts "150" to 150 at the boundary
function price(int $cents): float {
    return $cents / 100;
}`,
      note:
        "In PHP 7.0's default coercive mode a numeric string like \"150\" is auto-converted to int at the call, so you can drop the manual cast.",
    },
    {
      label: "Rejecting truly wrong types",
      intro:
        "An area() function multiplies a width and height that should both be numbers. Here a caller passes genuinely wrong values (an array and a non-numeric string), and the question is whether that mistake surfaces as a clear error or quietly produces nonsense.",
      php: `<?php
// PHP 5.5 — no exception either way: silent garbage, or a hard fatal
function area($w, $h) {
    return $w * $h;   // area(2, 'x') -> 0 silently ('x' becomes 0);
                      // area([], 'x') -> uncatchable fatal:
                      // Unsupported operand types
}`,
      ts: `<?php
// PHP 7.0 — non-coercible input throws a catchable TypeError
function area(float $w, float $h): float {
    return $w * $h;   // area([], 'x') -> TypeError
}`,
      note:
        "TypeError (a Throwable) is thrown in 7.0 when an argument can't be coerced to the declared scalar type — catchable, unlike 5.5's silent fallback or uncatchable fatal.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Coercive mode in action: numeric strings and bools get converted, but the type still shapes the result. Predict the output, then reveal it.",
    code: `<?php
// No declare(strict_types=1) here, so we are in COERCIVE mode (PHP 7.0+).

function repeat(string $text, int $times): string {
    return str_repeat($text, $times);
}

function half(float $n): float {
    return $n / 2;
}

// "3" is coerced to the int 3:
echo repeat("ab", "3"), "\\n";

// true is coerced to int 1; the int param then prints as a string:
echo repeat("x", true), "\\n";

// "7" coerced to float 7.0:
var_dump(half("7"));

// 4 (int) coerced to float 4.0, so division yields a float:
var_dump(half(4));`,
    output: `ababab
x
float(3.5)
float(2)`,
  },

  keyPoints: [
    "PHP **7.0** added scalar type declarations: `int`, `float`, `string`, `bool` on parameters.",
    "The **default is coercive mode** — `\"42\"` → `42`, `3` → `3.0`, `true` → `1` at the call boundary.",
    "Values that **can't** be coerced (non-numeric string for `int`, an array for `string`) throw a catchable **`TypeError`**.",
    "Scalar declarations replace 5.5's `is_int()`/`is_string()` guard clauses and docblock-only `@param` hints.",
    "Upgrade gotcha: 5.5 code that passed arrays/objects into now-typed params will start throwing `TypeError`.",
    "`array`, `callable`, and class/interface type hints predate 7.0; only the **scalar** ones are new in 7.0.",
  ],

  interview: [
    {
      q: "How did you express and enforce a parameter's scalar type in PHP 5.5, and what changed in 7.0?",
      a: "In **5.5** the engine had no scalar type hints, so the type lived in a `@param` docblock (for the IDE only) and any real enforcement was a manual `is_int()` / `is_string()` guard that threw an `InvalidArgumentException`. **PHP 7.0** added `int`, `float`, `string`, and `bool` as actual parameter declarations the engine checks on every call, throwing a `TypeError` automatically — so the declaration replaces both the docblock and the guard clause.",
    },
    {
      q: "What is coercive mode and how does it treat a numeric string passed to an `int` parameter?",
      a: "Coercive mode is PHP 7.0's **default** behaviour when you haven't declared `strict_types=1`. If an argument isn't the declared type but can be sensibly converted, the engine converts it: a numeric string like `\"42\"` becomes the int `42`, `3` becomes `3.0` for a `float` param, and `true` becomes `1`. It's looser than strict mode but far stricter than 5.5 — a **non-numeric** string for an `int` still throws a `TypeError`.",
    },
    {
      q: "After upgrading a 5.5 codebase, where would adding scalar types most likely break things at runtime?",
      a: "At call sites that previously relied on PHP 5.5's anything-goes behaviour. If you add `string $x` to a function and some caller passes an **array** or an **object without `__toString`**, that call now throws a `TypeError` instead of silently producing a warning-laden string. The fix is to type the boundaries first, run your test suite, and clean up the callers — tools like **Rector** and **PHPCompatibility** help find them.",
    },
    {
      q: "Is `TypeError` catchable, and how does that differ from 5.5 failure modes?",
      a: "Yes. `TypeError` implements **`Throwable`** (also new in 7.0), so you can `try`/`catch` it like any exception. In 5.5, passing the wrong scalar usually meant a silent coercion or an `E_WARNING` you couldn't catch with `try`/`catch` — you'd get garbage output instead of a clear, handleable error at the boundary.",
    },
  ],

  quiz: [
    {
      question:
        "In the default (coercive) mode of PHP 7.0, what happens when you pass the string \"5\" to a function parameter declared `int $n`?",
      options: [
        "A TypeError is thrown immediately",
        "It is silently coerced to the integer 5",
        "It stays the string \"5\" and is used as-is",
        "An E_WARNING is emitted and null is passed",
      ],
      answerIndex: 1,
      explain:
        "In coercive mode a numeric string is losslessly converted to the declared scalar type, so \"5\" becomes the int 5. Only a non-numeric string would throw a TypeError.",
    },
    {
      question:
        "Which of these type declarations was NOT newly introduced in PHP 7.0?",
      options: ["int", "array", "float", "bool"],
      answerIndex: 1,
      explain:
        "`array` (along with `callable` and class/interface hints) already existed before 7.0. PHP 7.0's new additions were the scalar types int, float, string, and bool.",
    },
    {
      question:
        "What is the modern (PHP 7.0+) replacement for a 5.5 `if (!is_int($x)) throw new InvalidArgumentException(...)` guard at the top of a function?",
      options: [
        "A `@param int $x` docblock above the function",
        "Wrapping the body in a try/catch",
        "An `int $x` parameter type declaration in the signature",
        "Calling `settype($x, 'integer')` first",
      ],
      answerIndex: 2,
      explain:
        "Declaring `int $x` in the signature makes the engine enforce the type and throw a catchable TypeError automatically, replacing the manual is_int() guard clause used in 5.5.",
    },
  ],
};

export default lesson;
