import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "strict-vs-coercive-types",
  title: "strict_types: Coercive vs Strict Typing",
  part: "PHP 7.0: Types & the Engine",
  estMinutes: 12,
  summary:
    "How declare(strict_types=1) flips PHP from quietly coercing \"5\" into 5 to throwing a TypeError — and why you want it on in every file.",

  concept: `
PHP 7.0 added enforced scalar type declarations, but it shipped with a switch
that decides *how strictly* they're enforced. By default the engine is
**coercive**: pass \`"5"\` to an \`int\` parameter and PHP silently converts it to
\`5\` for you. Add one line — \`declare(strict_types=1)\` — and the same call throws
a \`TypeError\` instead. Understanding this switch is the difference between "types
caught my bug" and "types quietly hid it."

### Coercive mode (the default)

With no \`declare\` line, scalar type declarations behave like lenient casts. A
"numeric string", a float that fits, or an int passed to a \`string\` parameter is
coerced to the declared type:

\`\`\`php
function makeId(int $id): string { return "user-$id"; }
makeId("42");   // coerced → "user-42"   (no error)
makeId(42.0);   // coerced → "user-42"   (no error)
\`\`\`

The catch: coercion can hide real mistakes. A well-formed numeric string like
\`"42"\` (or \`"42 "\` with trailing whitespace) silently becomes \`42\`, and \`true\`
becomes \`1\`. You lose the signal that something upstream was the wrong type. (Note:
since PHP 8.0 a *non*-well-formed string like \`"42abc"\` is no longer coerced even
in coercive mode — it throws a \`TypeError\` — but a clean numeric string still slips
through silently.)

### Strict mode

Put this as the **very first statement** of the file (before any other code, not
even a blank line of output):

\`\`\`php
<?php
declare(strict_types=1);
\`\`\`

Now an argument's type must *match exactly* — no silent conversion. \`makeId("42")\`
throws \`TypeError\`. The one deliberate exception: an \`int\` is still accepted where
a \`float\` is declared (widening), because that's always lossless.

### It's per-file, and it follows the *caller*

This is the part that trips people up. \`strict_types\` is **not** global and **not**
inherited. It applies only to function/method calls made **from inside the file
that declares it**. If file A is strict and calls a function defined in coercive
file B, the call is checked strictly — because A is the caller. The callee's file
doesn't matter for argument checks.

### Why turn it on

- It turns a whole class of "wrong type slipped through" bugs into loud,
  early \`TypeError\`s at the boundary.
- It makes types mean what they say — \`int\` means \`int\`, not "anything intish".
- It's free to adopt incrementally: add the line file by file.
`,

  comparisons: [
    {
      label: "Catching a wrong-typed argument",
      intro:
        "Someone calls setAge with the string \"30\" instead of a real integer. We want that mistake rejected, and here we see who does the rejecting — your hand-written check, or the engine.",
      php: `<?php
// PHP 5.5 — no scalar type hints at all.
// You hand-roll validation or just hope.
function setAge($age) {
    if (!is_int($age)) {
        throw new InvalidArgumentException('int expected');
    }
    return $age;
}
setAge("30"); // throws — but only because we coded the check`,
      ts: `<?php
declare(strict_types=1);

// PHP 7.0 — the engine enforces it for you.
function setAge(int $age): int {
    return $age;
}
setAge("30"); // TypeError: must be of type int, string given`,
      note:
        "Scalar type declarations arrived in PHP 7.0; with strict_types=1 the engine rejects a wrong type instead of you writing is_int() guards.",
    },
    {
      label: "A numeric string at the boundary",
      intro:
        "makeId expects an int but receives the well-formed numeric string \"5\" — a common case when ids come from request params or a database. The question is whether that string quietly becomes 5 or is refused.",
      php: `<?php
// PHP 7.0 default (coercive) — "5" is silently cast to 5
function makeId(int $id): string {
    return "user-$id";
}
echo makeId("5"); // "user-5", no error`,
      ts: `<?php
declare(strict_types=1);

// PHP 7.0 strict — the cast no longer happens
function makeId(int $id): string {
    return "user-$id";
}
echo makeId("5"); // TypeError thrown`,
      note:
        "The behaviour difference is entirely the declare line (PHP 7.0): coercive casts the numeric string, strict throws.",
    },
    {
      label: "int → float is still allowed in strict mode",
      intro:
        "A halving function declares a float parameter, but we pass the integer 7. Even with strict mode on, this should work and return 3.5, because widening an int to a float loses nothing.",
      php: `<?php
// PHP 5.5 — untyped, anything goes
function half($n) {
    return $n / 2;
}
echo half(7); // 3.5`,
      ts: `<?php
declare(strict_types=1);

// PHP 7.0 strict — int widening to float is the ONE exception
function half(float $n): float {
    return $n / 2;
}
echo half(7); // 3.5 — int 7 accepted as float, lossless`,
      note:
        "Even in strict mode (PHP 7.0) an int is accepted where a float is declared; it's the only implicit conversion strict mode permits.",
    },
    {
      label: "strict_types must be the first statement",
      intro:
        "Here we focus on where the declare line goes in a file that already echoes output. Placement matters: get it wrong and the file won't even run.",
      php: `<?php
// PHP 5.5 — no such directive exists; this is just a normal file
echo "starting\\n";
function go() { /* ... */ }`,
      ts: `<?php
declare(strict_types=1); // MUST be line 1, before any output or code

echo "starting\\n";
function go(int $x): void { /* ... */ }`,
      note:
        "declare(strict_types=1) (PHP 7.0) only works as the very first statement; anything before it — even whitespace output — is a fatal error.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "strict_types is on. Read each call, predict whether it works or throws, then reveal the output.",
    code: `<?php
declare(strict_types=1);

function makeId(int $id): string {
    return "user-$id";
}

function half(float $n): float {
    return $n / 2;
}

// int → float widening is allowed, even in strict mode:
echo half(7), "\\n";

// A real int is fine:
echo makeId(42), "\\n";

// A numeric string is NOT coerced in strict mode — it throws:
try {
    echo makeId("99"), "\\n";
} catch (TypeError $e) {
    echo "TypeError caught\\n";
}`,
    output: `3.5
user-42
TypeError caught`,
  },

  keyPoints: [
    "`declare(strict_types=1)` (PHP 7.0) must be the **first statement** in the file, or it's a fatal error.",
    "Coercive mode (the default) silently casts e.g. the string `\"5\"` to int `5`; strict mode throws a `TypeError`.",
    "strict_types is **per-file** and applies to calls made **from** that file — it follows the caller, not the callee.",
    "The one conversion strict mode still allows is **int → float** (lossless widening).",
    "Internal/built-in functions follow the file's mode too, so strict mode also tightens calls to core functions.",
    "Recommended default: turn it on everywhere so wrong types fail loudly at the boundary instead of corrupting data.",
  ],

  interview: [
    {
      q: "What does declare(strict_types=1) actually change, and where do you put it?",
      a: "It switches that file from **coercive** to **strict** scalar type checking. In coercive mode (the default) PHP casts compatible scalars — `\"5\"` becomes `int 5`, `42.0` becomes `int 42` — when calling a typed function. In strict mode, the argument type must match exactly or you get a `TypeError`. It must be the **very first statement** in the file (PHP 7.0); even whitespace echoed before it causes a fatal error.",
    },
    {
      q: "Is strict_types global? If file A is strict and calls a function in coercive file B, which mode wins?",
      a: "It's **per-file** and follows the **caller**. The check uses the mode of the file where the *call* is written, not where the function is *defined*. So if strict file A calls a function declared in coercive file B, the arguments are checked **strictly**, because A is the caller. There's no global setting and no inheritance — you opt in file by file.",
    },
    {
      q: "Are there any implicit conversions strict mode still permits?",
      a: "Yes — exactly one: an `int` is accepted where a `float` parameter is declared, because widening int to float is lossless. Everything else (numeric strings, bool-to-int, float-to-int) is rejected. So `function f(float $x)` happily takes `f(7)`, but `function g(int $x)` rejects `g(\"7\")` and `g(7.0)`.",
    },
    {
      q: "Why is strict mode usually recommended over the coercive default?",
      a: "Because coercion hides bugs. A numeric string like `\"42\"` silently becomes `42`, `42.0` becomes `42`, `true` becomes `1`, and a stray value that should never have been there sails through. Strict mode turns those into loud `TypeError`s at the boundary, so you fix the source of the bad value instead of debugging corrupted data three layers down. It also makes a function signature an honest contract.",
    },
  ],

  quiz: [
    {
      question:
        "With declare(strict_types=1) at the top of the file, what happens when you call a function `f(int $x)` as `f(\"5\")`?",
      options: [
        "It runs; \"5\" is coerced to int 5",
        "It throws a TypeError",
        "It emits a warning but returns the result",
        "It's a fatal compile error",
      ],
      answerIndex: 1,
      explain:
        "In strict mode the numeric string is not coerced — passing a string to an int parameter throws a TypeError. (In coercive mode it would silently become 5.)",
    },
    {
      question:
        "strict_types is declared in file A. File A calls a function defined in file B, which has no declare line. How is the argument type checked?",
      options: [
        "Coercively — the callee's file (B) decides",
        "Strictly — the caller's file (A) decides",
        "It's a fatal error to mix modes",
        "It depends on a php.ini global setting",
      ],
      answerIndex: 1,
      explain:
        "strict_types applies to calls made FROM the file that declares it. The caller is file A (strict), so the call is checked strictly regardless of B's mode.",
    },
    {
      question:
        "In strict mode, which call is still allowed without a TypeError?",
      options: [
        "Passing int 7 to a `float $n` parameter",
        "Passing string \"7\" to an `int $n` parameter",
        "Passing float 7.0 to an `int $n` parameter",
        "Passing bool true to an `int $n` parameter",
      ],
      answerIndex: 0,
      explain:
        "The one implicit conversion strict mode permits is int → float (lossless widening). String, float-to-int, and bool-to-int conversions all throw a TypeError.",
    },
  ],
};

export default lesson;
