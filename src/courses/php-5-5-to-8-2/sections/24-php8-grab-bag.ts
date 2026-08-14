import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "php8-grab-bag",
  title: "The PHP 8.0 Grab-Bag: Small Wins That Add Up",
  part: "PHP 8.0: The Big Leap",
  estMinutes: 12,
  summary:
    "The lesser-known PHP 8.0 quality-of-life features — throw as an expression, the string helper trio, mixed, static returns, WeakMap, non-capturing catch, and trailing commas in parameter lists.",

  concept: `
Named arguments, union types, and \`match\` get the headlines, but PHP 8.0
shipped a pile of smaller features that quietly remove boilerplate you've been
writing since 5.5. Here's the grab-bag.

### \`throw\` is now an expression

In 5.5, \`throw\` was a *statement* — it couldn't appear inside \`??\`, \`?:\`, or
an arrow function. Now it can:

\`\`\`php
$id = $request['id'] ?? throw new InvalidArgumentException('id required');
$fn = fn($x) => $x > 0 ? $x : throw new RangeException('must be positive');
\`\`\`

### The string-search trio

No more \`strpos(...) !== false\` dance:

- \`str_contains($haystack, $needle)\`
- \`str_starts_with($haystack, $needle)\`
- \`str_ends_with($haystack, $needle)\`

All three return a clean \`bool\` and avoid the classic *"0 is falsy"* bug.

### The \`mixed\` type

\`mixed\` is now a real type hint meaning *"any value, including null"*. It
**documents intent** — an untyped parameter might just be un-migrated, but
\`mixed\` says "any type is genuinely expected here". It's equivalent to
\`object|resource|array|string|float|int|bool|null\`.

### \`static\` as a return type

A method can now declare it returns \`static\` (the *late-bound* class), which is
exactly what fluent setters and named constructors want:

\`\`\`php
public function withName(string $n): static { /* ... */ return $clone; }
\`\`\`

\`self\` would lock the type to the declaring class; \`static\` resolves to the
called subclass.

### \`WeakMap\`

A map keyed by objects that **does not** prevent those objects from being
garbage-collected. Perfect for caches and metadata attached to objects without
creating memory leaks.

### Non-capturing catches

If you don't use the exception variable, you can now omit it:

\`\`\`php
try { risky(); }
catch (JsonException) { /* don't need $e */ }
\`\`\`

### Trailing comma in parameter lists

7.3 allowed trailing commas in *calls*; 8.0 finally allows them in function and
method **parameter lists** too — tidier multi-line signatures and cleaner diffs.
`,

  comparisons: [
    {
      label: "Throw on a missing value",
      intro:
        "A function pulls an 'id' out of a request array, but must reject the request when that key is absent. Both versions return the id on success and raise an InvalidArgumentException otherwise.",
      php: `<?php
// PHP 5.5 — throw is a statement, so you need an if
function getId(array $req) {
    if (!isset($req['id'])) {
        throw new InvalidArgumentException('id required');
    }
    return $req['id'];
}`,
      ts: `<?php
// PHP 8.0 — throw is an expression, inline with ??
function getId(array $req): int {
    return $req['id'] ?? throw new InvalidArgumentException('id required');
}`,
      note:
        "throw became an expression in PHP 8.0, so it can sit inside ??, ?:, arrow functions, and match arms.",
    },
    {
      label: "Substring check",
      intro:
        "We want to test whether an email contains an '@' and whether a filename ends in '.php'. Both checks should evaluate to true here, but the old approach has a hidden gotcha when a match sits at position 0.",
      php: `<?php
// PHP 5.5 — strpos with the !== false trap
if (strpos($email, '@') !== false) {
    // contains '@'
}
if (substr($file, -4) === '.php') {
    // ends with '.php'
}`,
      ts: `<?php
// PHP 8.0 — intent-revealing helpers, real bools
if (str_contains($email, '@')) {
    // contains '@'
}
if (str_ends_with($file, '.php')) {
    // ends with '.php'
}`,
      note:
        "str_contains/str_starts_with/str_ends_with arrived in PHP 8.0 and avoid the strpos '=== false' / '!== false' footgun.",
    },
    {
      label: "Fluent / named-constructor return type",
      intro:
        "A Money class has an immutable setter that clones itself with new cents and returns the copy. The goal is to type that return value so a subclass calling it gets its own class back, not the parent.",
      php: `<?php
// PHP 5.5 — no return-type hint at all; self is the best you can document
class Money {
    /** @return Money */
    public function withCents($c) {
        $clone = clone $this;
        $clone->cents = $c;
        return $clone;
    }
}`,
      ts: `<?php
// PHP 8.0 — 'static' return type respects late static binding
class Money {
    public function __construct(private int $cents = 0) {}

    public function withCents(int $c): static {
        $clone = clone $this;
        $clone->cents = $c;
        return $clone;
    }
}`,
      note:
        "static as a return type (PHP 8.0) resolves to the called subclass, so a UsdMoney subclass's withCents() is typed as UsdMoney, not Money.",
    },
    {
      label: "Catching an exception you don't use",
      intro:
        "We try to decode JSON and simply fall back to null on failure, without ever inspecting the error. The result is the same either way; the question is whether we still have to name an exception variable we never touch.",
      php: `<?php
// PHP 5.5 — you must name the variable even if unused
try {
    $data = json_decode($raw);
} catch (Exception $e) {
    $data = null;
}`,
      ts: `<?php
// PHP 8.0 — non-capturing catch omits the variable
try {
    $data = json_decode($raw, flags: JSON_THROW_ON_ERROR);
} catch (JsonException) {
    $data = null;
}`,
      note:
        "Non-capturing catch (PHP 8.0) lets you drop the unused $e, signalling that the exception object is intentionally ignored.",
    },
    {
      label: "Multi-line parameter list",
      intro:
        "Here a function declares its parameters one per line for readability. The aim is to leave a comma after the final parameter so adding a new one later touches only one line.",
      php: `<?php
// PHP 5.5 — trailing comma after the last param is a parse error
function makeUser(
    $name,
    $email,
    $role
) {
    // ...
}`,
      ts: `<?php
// PHP 8.0 — trailing comma in the parameter list is allowed
function makeUser(
    string $name,
    string $email,
    string $role,
) {
    // ...
}`,
      note:
        "Trailing commas in parameter lists landed in PHP 8.0 (calls got them in 7.3) — cleaner diffs when you add an argument.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Several PHP 8.0 grab-bag features in one script. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

// throw as an expression inside ??
function need(array $cfg, string $key): string {
    return $cfg[$key] ?? throw new RuntimeException("missing {$key}");
}

$cfg = ['env' => 'prod'];
echo need($cfg, 'env') . "\\n";

// The string-search trio (all return real bools)
$file = 'report.csv';
var_dump(str_starts_with($file, 'report'));
var_dump(str_ends_with($file, '.php'));
var_dump(str_contains($file, 'port'));

// WeakMap: object keys that don't block GC
$cache = new WeakMap();
$obj = new stdClass();
$cache[$obj] = 'cached!';
echo $cache[$obj] . "\\n";
echo count($cache) . "\\n";

// Non-capturing catch
try {
    throw new LogicException('boom');
} catch (LogicException) {
    echo "caught, ignored the object\\n";
}`,
    output: `prod
bool(true)
bool(false)
bool(true)
cached!
1
caught, ignored the object`,
  },

  keyPoints: [
    "`throw` is an **expression** in PHP 8.0 — use it inside `??`, `?:`, arrow functions, and `match` arms.",
    "`str_contains`, `str_starts_with`, `str_ends_with` (8.0) replace the `strpos(...) !== false` trap and return real bools.",
    "`mixed` (8.0) is a real type meaning *any value including null* — it documents intent that an untyped param can't.",
    "`static` as a return type (8.0) honours late static binding, so subclasses get their own type back — use it for fluent setters and named constructors.",
    "`WeakMap` (8.0) keys by object without preventing garbage collection — ideal for caches/metadata.",
    "Non-capturing `catch (Exception)` (8.0) and trailing commas in parameter lists (8.0) trim everyday boilerplate.",
  ],

  interview: [
    {
      q: "Why is `throw` becoming an expression useful, and where can you now use it?",
      a: "Because it removes an entire `if`/guard block for the common *\"value or bust\"* pattern. As an expression (PHP 8.0) `throw` can appear anywhere an expression is allowed: the right side of `??` (`$x = $v ?? throw new ...`), a ternary branch, an arrow function body, and `match` arms. The code reads as a single statement and keeps the happy path on the left.",
    },
    {
      q: "What was wrong with `strpos()` that the new string helpers fix?",
      a: "`strpos()` returns the **integer index** of the match or `false` if not found. Because index `0` is falsy, a naive `if (strpos($s, $n))` is buggy when the needle is at the start — you must write `!== false`. `str_contains()` (PHP 8.0) returns a clean `bool`, eliminating the footgun, and `str_starts_with`/`str_ends_with` express intent directly instead of `substr()` slicing.",
    },
    {
      q: "When would you use `static` instead of `self` as a return type?",
      a: "Use `static` when the method returns *the same class as the object it was called on* and you want subclasses to keep their own type — fluent setters, `clone`-and-modify methods, and named constructors. `self` is bound to the **declaring** class, so a subclass's fluent call would be typed as the parent. `static` uses late static binding to resolve to the actual runtime class.",
    },
    {
      q: "What problem does `WeakMap` solve that a normal array or SplObjectStorage doesn't?",
      a: "It lets you attach data to objects *without* keeping them alive. A normal array can't use objects as keys at all, and `SplObjectStorage` (or any structure holding a reference) **prevents** the object from being garbage-collected, causing leaks in long-running processes. A `WeakMap` (PHP 8.0) holds its object keys weakly: when the last *other* reference to the object disappears, the entry is removed automatically. Great for per-object caches and computed-metadata.",
    },
    {
      q: "What's the difference between `mixed` and simply leaving a parameter untyped?",
      a: "At runtime they behave the same — any value is accepted. The difference is **intent and tooling**. An untyped parameter is ambiguous: it might just be code that predates the type system. `mixed` (PHP 8.0) is an explicit declaration that *any* type is genuinely expected, which static analysers and readers can trust. Note `mixed` already includes `null`, so you can't write `?mixed` — that's a fatal error.",
    },
  ],

  quiz: [
    {
      question: "In which PHP version did `throw` become usable as an expression (e.g. `$x = $v ?? throw new Ex;`)?",
      options: ["PHP 5.6", "PHP 7.1", "PHP 7.4", "PHP 8.0"],
      answerIndex: 3,
      explain:
        "throw was promoted from a statement to an expression in PHP 8.0, so it can appear inside ??, ternaries, arrow functions, and match arms.",
    },
    {
      question: "Why is `if (str_contains($s, $n))` safer than `if (strpos($s, $n))`?",
      options: [
        "str_contains is faster on long strings",
        "strpos returns 0 (falsy) when the needle is at the start, so the bare test fails",
        "strpos was removed in PHP 8.0",
        "str_contains is case-insensitive",
      ],
      answerIndex: 1,
      explain:
        "strpos returns the integer offset, and offset 0 is falsy — so a needle at position 0 evaluates as 'not found'. str_contains (PHP 8.0) returns a real bool and avoids this.",
    },
    {
      question: "What is the key property of a `WeakMap`?",
      options: [
        "It can only hold up to 8 entries",
        "Its keys are strings hashed weakly to save memory",
        "It keys by objects but does not stop them from being garbage-collected",
        "It is an immutable, readonly map",
      ],
      answerIndex: 2,
      explain:
        "A WeakMap (PHP 8.0) uses objects as keys but holds them weakly: once no other reference to a key object remains, the entry is removed automatically and the object can be collected.",
    },
  ],
};

export default lesson;
