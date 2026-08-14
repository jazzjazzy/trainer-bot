import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "throwables-and-errors",
  title: "Throwable & Catchable Errors: Goodbye Unrecoverable Fatals",
  part: "PHP 7.0: Types & the Engine",
  estMinutes: 13,

  summary:
    "PHP 7.0 made fatal-ish engine failures into catchable Error objects under a shared Throwable interface, so a TypeError or a divide-by-zero no longer has to take your whole request down.",

  concept: `
In **PHP 5.5**, the engine had two completely separate failure channels. There
were **exceptions** — objects you \`throw\` and \`catch\` — and there were **errors**,
the \`E_WARNING\` / \`E_FATAL\` family the engine raised on its own. The painful part:
a *fatal* error (calling a method on a non-object, passing the wrong type to a
typed-by-docblock function, an uncaught engine condition) **could not be caught
with \`try/catch\` at all**. It printed \`Fatal error: ...\` and killed the script,
mid-request, with no chance to clean up or respond gracefully.

### The new \`Throwable\` hierarchy (PHP 7.0)

PHP 7.0 unified the two channels under a single interface, **\`Throwable\`**:

\`\`\`
Throwable (interface)
├── Exception        ← your domain/application errors (unchanged)
│   └── ...
└── Error            ← engine-level problems, now catchable
    ├── TypeError
    ├── ArgumentCountError   (7.1)
    ├── ArithmeticError
    │   └── DivisionByZeroError
    ├── AssertionError
    └── ...
\`\`\`

The key rules:

- **Both** \`Exception\` **and** \`Error\` **implement** \`Throwable\`. They do **not**
  extend each other.
- Former fatals — wrong argument types under \`strict_types\`, calling an undefined
  method, etc. — are now thrown as **\`Error\`** subclasses you *can* catch.
- You **cannot** \`implements Throwable\` on your own classes directly; you extend
  \`Exception\` or \`Error\`.

### Catchable engine failures

\`\`\`php
try {
    $n = intdiv(1, 0);              // throws DivisionByZeroError (7.0)
} catch (DivisionByZeroError $e) {
    echo $e->getMessage();          // "Division by zero"
}
\`\`\`

In **PHP 7.0**, both \`intdiv(1, 0)\` *and* the modulo operator \`1 % 0\` throw
\`DivisionByZeroError\` (with messages \`"Division by zero"\` and \`"Modulo by zero"\`
respectively). The plain division operator \`/\` was the laggard: in **7.x**,
\`1 / 0\` only raised an \`E_WARNING\` and evaluated to \`INF\`/\`NAN\`; it did not throw
\`DivisionByZeroError\` until **8.0**.

### Catching everything safely

To catch *anything* that can be thrown — exceptions and engine errors alike —
type-hint the shared interface:

\`\`\`php
try {
    risky();
} catch (\\Throwable $e) {     // catches Exception AND Error
    log_it($e);
}
\`\`\`

This is the modern top-level handler: one \`catch (\\Throwable $e)\` replaces the
5.5 combination of a \`catch (\\Exception $e)\` *plus* a \`set_error_handler\` hack
that still couldn't stop true fatals.
`,

  comparisons: [
    {
      label: "Reacting to a fatal engine error",
      intro:
        "We pass a value of the wrong type into a function that does arithmetic and try to recover from the failure with a try/catch. The goal is to keep running after a bad call instead of crashing the whole request.",
      php: `<?php
// PHP 5.5 — a type/engine fatal is UNCATCHABLE.
// This prints "Fatal error: ..." and the script dies here.
function half($n) {
    return $n / 2;
}

try {
    echo half([1, 2]); // fatal: Unsupported operand types
} catch (Exception $e) {
    // never reached — fatals aren't Exceptions in 5.5
    echo "handled";
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 7.0 — the same mistake is now a catchable TypeError.
function half(int $n): int {
    return intdiv($n, 2);
}

try {
    echo half("not a number");
} catch (\\TypeError $e) {
    echo "handled: " . $e->getMessage();
}`,
      note:
        "PHP 7.0 turns former fatals into Error subclasses (here TypeError) that try/catch can intercept — in 5.5 the script just died.",
    },
    {
      label: "Catching exceptions AND engine errors",
      intro:
        "Here we want a single catch block around some work that could fail either with a thrown application exception or with a low-level engine error, logging whichever one occurs. The aim is one handler that misses nothing.",
      php: `<?php
// PHP 5.5 — Exception is the most general thing you can catch.
// Engine errors slip past it entirely.
try {
    doWork();
} catch (Exception $e) {
    logError($e);
}`,
      ts: `<?php
// PHP 7.0 — Throwable is the common supertype of both
// Exception and Error, so one catch handles everything.
try {
    doWork();
} catch (\\Throwable $e) {
    logError($e);
}`,
      note:
        "Throwable (7.0) is implemented by both Exception and Error; catching it covers domain exceptions and engine-level errors in one block.",
    },
    {
      label: "Dividing by zero",
      intro:
        "This computes one modulo zero and inspects what the language hands back. The point is to see how a clearly invalid math operation is reported.",
      php: `<?php
// PHP 5.5 — division by zero emits a warning
// and the expression evaluates to false.
$result = 1 % 0;      // Warning + false
var_dump($result);    // bool(false)`,
      ts: `<?php
// PHP 7.0 — the modulo operator now throws DivisionByZeroError.
try {
    $result = 1 % 0;
} catch (\\DivisionByZeroError $e) {
    echo $e->getMessage(); // "Modulo by zero"
}`,
      note:
        "intdiv(1, 0) and the % operator both throw DivisionByZeroError from 7.0 (\"Division by zero\" / \"Modulo by zero\"). The / operator was slower: 1 / 0 only warned and returned INF in 7.x, and did not throw until 8.0.",
    },
    {
      label: "A top-level safety net",
      intro:
        "We wrap the whole program's entry point so that any failure anywhere underneath gets logged rather than crashing silently. The goal is the outermost guard that nothing can slip past.",
      php: `<?php
// PHP 5.5 — needs both a try/catch AND an error handler,
// and STILL can't trap real fatals.
set_error_handler(function ($no, $str) {
    error_log($str);
});
try {
    run();
} catch (Exception $e) {
    error_log($e->getMessage());
}`,
      ts: `<?php
// PHP 7.0 — one Throwable catch covers exceptions
// and the (formerly fatal) engine errors.
try {
    run();
} catch (\\Throwable $e) {
    error_log($e->getMessage());
}`,
      note:
        "Because true fatals are now catchable Errors implementing Throwable (7.0), a single catch replaces the 5.5 try/catch + set_error_handler workaround.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Three former fatals, all caught. Predict each line of output, then reveal it.",
    code: `<?php
declare(strict_types=1);

function needsInt(int $n): int {
    return $n;
}

// 1) A type mismatch is a catchable TypeError (7.0)
try {
    needsInt("oops");
} catch (\\TypeError $e) {
    echo "TypeError caught\\n";
}

// 2) intdiv by zero throws DivisionByZeroError (7.0)
try {
    intdiv(10, 0);
} catch (\\DivisionByZeroError $e) {
    echo $e->getMessage() . "\\n";
}

// 3) Throwable is the common supertype of Exception and Error
$err = new \\TypeError("boom");
var_dump($err instanceof \\Throwable);
var_dump($err instanceof \\Exception);

// 4) One Throwable catch handles a plain Exception too
try {
    throw new \\RuntimeException("domain problem");
} catch (\\Throwable $e) {
    echo get_class($e) . ": " . $e->getMessage() . "\\n";
}`,
    output: `TypeError caught
Division by zero
bool(true)
bool(false)
RuntimeException: domain problem`,
  },

  keyPoints: [
    "PHP 7.0 added the `Throwable` interface, implemented by **both** `Exception` and `Error`.",
    "Former unrecoverable fatals (wrong types, undefined methods) are now catchable `Error` subclasses like `TypeError`.",
    "In PHP 5.5 those fatals could **not** be caught with `try/catch` — the script just died.",
    "`intdiv(1, 0)` and `1 % 0` both throw `DivisionByZeroError` from **7.0**; the `/` operator only throws it from **8.0** (in 7.x `1 / 0` warned and returned `INF`).",
    "Catch `\\Throwable` for a top-level safety net that covers exceptions and engine errors in one block.",
    "You can't `implements Throwable` directly — extend `Exception` or `Error` instead.",
  ],

  interview: [
    {
      q: "In PHP 5.5 you couldn't catch a fatal error. What changed in 7.0?",
      a: "PHP 7.0 introduced the **`Throwable`** interface and a parallel **`Error`** hierarchy. Conditions that used to be unrecoverable fatals — passing the wrong type to a typed function, calling a method on a non-object, an arithmetic problem — are now thrown as `Error` subclasses (`TypeError`, `ArithmeticError`, etc.) that `try/catch` can intercept. In 5.5 those printed `Fatal error: ...` and terminated the script with no chance to recover.",
    },
    {
      q: "What's the relationship between `Exception`, `Error`, and `Throwable`?",
      a: "`Throwable` is an **interface**; both `Exception` and `Error` implement it. They are siblings — neither extends the other. So `catch (\\Exception $e)` still only catches application/domain exceptions, while `catch (\\Throwable $e)` catches *everything that can be thrown*, including engine `Error`s. A common upgrade gotcha: code that wraps everything in `catch (\\Exception $e)` will **silently miss** the new `Error`s, so for a true catch-all you must switch to `\\Throwable`.",
    },
    {
      q: "Can you create your own class that implements `Throwable` directly?",
      a: "No. The engine forbids userland classes from implementing `Throwable` directly — if you try, you get a fatal error telling you to extend `Exception` or `Error` instead. So your custom exceptions extend `Exception` (or a built-in subclass like `RuntimeException`), and they're `Throwable` transitively.",
    },
    {
      q: "When does dividing by zero throw versus warn?",
      a: "It depends on the operation and version. **`intdiv($a, 0)` and the modulo operator `$a % 0` both throw `DivisionByZeroError` from PHP 7.0** (messages `\"Division by zero\"` and `\"Modulo by zero\"`). The plain division operator **`$a / 0`** lagged behind: in 7.x it emitted an `E_WARNING` and evaluated to `INF`/`NAN`, and only started throwing `DivisionByZeroError` in **8.0**. In 5.5, all of these merely warned and returned `false`. `DivisionByZeroError` extends `ArithmeticError`, which extends `Error`.",
    },
    {
      q: "What's the modern replacement for a 5.5 top-level error strategy?",
      a: "In 5.5 you often combined a `try { } catch (\\Exception $e)` with `set_error_handler()` and `register_shutdown_function()` to scrape fatals out of the last error — and it still couldn't truly recover. From 7.0, a single `try { } catch (\\Throwable $e)` (plus optionally `set_exception_handler()` for uncaught ones) cleanly intercepts both domain exceptions and the now-catchable engine errors.",
    },
  ],

  quiz: [
    {
      question: "Which interface is implemented by both `Exception` and `Error` in PHP 7.0+?",
      options: ["`Stringable`", "`Throwable`", "`Catchable`", "`Serializable`"],
      answerIndex: 1,
      explain:
        "PHP 7.0 added `Throwable`, the common supertype of `Exception` and `Error`. Catching `\\Throwable` intercepts both domain exceptions and engine errors.",
    },
    {
      question: "What happens with `catch (\\Exception $e)` when a `TypeError` is thrown?",
      options: [
        "It catches it — `TypeError` extends `Exception`",
        "It does NOT catch it — `TypeError` is an `Error`, not an `Exception`",
        "It catches it only under `declare(strict_types=1)`",
        "It is a syntax error",
      ],
      answerIndex: 1,
      explain:
        "`TypeError` extends `Error`, which is a sibling of `Exception` (both implement `Throwable`). A `catch (\\Exception $e)` will miss it; you need `\\Throwable` or `\\TypeError`/`\\Error`.",
    },
    {
      question: "When did the modulo operator `1 % 0` start throwing `DivisionByZeroError`?",
      options: [
        "PHP 5.5 — it always threw",
        "PHP 7.0, the same time as `intdiv()`",
        "PHP 8.0 — before that it warned and returned `false`",
        "It still only emits a warning in 8.2",
      ],
      answerIndex: 1,
      explain:
        "The `%` operator throws `DivisionByZeroError` from PHP 7.0, the same release that added `intdiv()` (which also throws). The laggard is the `/` operator: `1 / 0` only warned and returned `INF` in 7.x and didn't throw `DivisionByZeroError` until 8.0.",
    },
  ],
};

export default lesson;
