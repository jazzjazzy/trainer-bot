import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "migration-mindset",
  title: "The Migration Mindset: Upgrading Safely 5.5 → 8.2",
  part: "Getting Current",
  estMinutes: 12,

  summary:
    "A practical, low-risk playbook for crossing two major versions: deprecations vs breaking changes, strict_types, the error-level shifts in 7 and 8, and the tooling that does the heavy lifting.",

  concept: `
Jumping from PHP 5.5 to 8.2 means crossing **two major versions** (7.0 and 8.0)
and a pile of minors. Done blindly that's terrifying; done methodically it's a
sequence of small, testable steps. The mindset: **one major version at a time,
green tests at every stop.**

### Deprecations vs breaking changes

Learn to tell these two apart — they need different responses.

- A **deprecation** still *works*; it just emits an \`E_DEPRECATED\` notice
  warning you it'll be removed later (e.g. \`each()\`, dynamic properties in 8.2).
  Fix at your leisure, but fix before the version that actually removes it.
- A **breaking change** changes behaviour *now*: removed functions, stricter
  type coercion, warnings promoted to \`Error\`/\`TypeError\`. These break code on
  the spot, so they're what your test suite must catch.

### Turn on strict types — per file

Add this as the **first line** of each new or migrated file:

\`\`\`php
<?php
declare(strict_types=1);
\`\`\`

It's per-file and opt-in (PHP 7.0), so you can adopt it gradually. In strict
mode \`add(int $a)\` rejects \`add("3")\` with a \`TypeError\` instead of silently
coercing — surfacing exactly the boundary bugs an upgrade tends to expose.

### Errors got louder across 7 and 8

- **7.0** introduced \`Throwable\`; fatal engine errors became catchable \`Error\`
  objects, and many were thrown where 5.5 simply died.
- **8.0** promoted a long list of \`E_WARNING\`/\`E_NOTICE\` to \`Error\`/\`TypeError\`
  — writing to a property of a non-object, passing too few arguments to an
  *internal* function, and reading an undefined array key all got stricter or
  noisier. (Calling a *method* on \`null\` already threw an \`Error\` from 7.0.)

So code that "worked" on 5.5 by ignoring warnings can now *throw*. That's a
feature: it converts silent corruption into a loud, traceable failure.

### Let the tools do the grunt work

- **PHPCompatibility** — a PHP_CodeSniffer ruleset that scans your code and
  reports exactly which constructs break on a target version.
- **Rector** — automated, rule-based refactoring; it rewrites dated syntax
  (e.g. to constructor promotion or \`??\`) for whole versions at once.
- **PHPStan / Psalm** — static analysers that find type and null bugs *without
  running the code*, invaluable before and after each hop.

Sequence it: \`5.5 → 7.4 → 8.2\`, run PHPCompatibility for the next target, let
Rector auto-fix, keep tests green, then move on.
`,

  comparisons: [
    {
      label: "Reading an array (deprecation → removal)",
      intro:
        "The goal is to loop over an associative array and print each key/value pair. Both versions produce the same output; the point is which iteration construct survives the upgrade.",
      php: `<?php
// PHP 5.5 — each() to walk an array
while (list($key, $val) = each($array)) {
    echo "$key => $val\\n";
}`,
      ts: `<?php
// PHP 7.2+ — each() is deprecated; foreach replaces it
foreach ($array as $key => $val) {
    echo "$key => $val\\n";
}`,
      note:
        "each() was deprecated in PHP 7.2 (E_DEPRECATED) and removed entirely in 8.0 — a classic deprecation-then-breaking-change you must fix before crossing 8.0.",
    },
    {
      label: "Calling a method that might be null",
      intro:
        "We want a user's profile name, but getProfile() may return null. The aim is to read name safely and fall back to a default when the profile is missing.",
      php: `<?php
// PHP 5.5 — silent: warning, then NULL, execution continues
$name = $user->getProfile()->name; // if getProfile() is null...
echo $name; // 5.5: notice/warning, $name is NULL`,
      ts: `<?php
// PHP 8.0 — that read still only warns and yields null; be explicit
$name = $user->getProfile()?->name; // nullsafe stops the chain
echo $name ?? 'unknown';`,
      note:
        "Calling a method on null has been a catchable Error since 7.0, while reading a property on null is still only a warning (E_NOTICE in 5.5, E_WARNING since 8.0); the nullsafe operator ?-> (8.0) short-circuits the whole chain to null instead of warning.",
    },
    {
      label: "Enforcing argument types",
      intro:
        "A small repeat() helper takes a string and a count and repeats the text. The scenario passes the count as the string '3' to show how each version treats a type mismatch at the call site.",
      php: `<?php
// PHP 5.5 — string is silently coerced to int
function repeat($text, $times) {
    return str_repeat($text, $times);
}
echo repeat('ab', '3'); // works: '3' coerced to 3`,
      ts: `<?php
declare(strict_types=1);
// PHP 7.0 strict mode — coercion is rejected
function repeat(string $text, int $times): string {
    return str_repeat($text, $times);
}
echo repeat('ab', 3); // pass a real int; '3' would TypeError`,
      note:
        "declare(strict_types=1) (PHP 7.0) turns silent string→int coercion at call boundaries into a TypeError, catching the bug at the edge instead of deep inside.",
    },
    {
      label: "Finding what breaks before you ship",
      intro:
        "The task is splitting a CSV string into parts, but the old code uses split(), a function removed in PHP 7.0. This contrasts discovering the breakage in production versus catching it ahead of time with tooling.",
      php: `<?php
// PHP 5.5 era — you upgrade and find out at runtime,
// in production, when a page 500s.
$parts = split(',', $csv); // removed in PHP 7.0!`,
      ts: `<?php
// Modern — let tooling tell you first (shell, not PHP):
// vendor/bin/phpcs -p . --standard=PHPCompatibility \\
//     --runtime-set testVersion 8.2
// vendor/bin/rector process src
// vendor/bin/phpstan analyse src --level=6
$parts = explode(',', $csv); // explode() is the replacement`,
      note:
        "PHPCompatibility (a PHP_CodeSniffer ruleset) flags removed functions like split() (gone in 7.0) statically; Rector and PHPStan automate fixes and catch type/null bugs before runtime.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A tiny migration in action: strict types catch a bad value, nullsafe + ?? handle a missing one. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

function tax(float $amount, float $rate): float {
    return round($amount * $rate, 2);
}

// In strict mode you must pass real floats/ints, not "20":
echo tax(100, 0.2), "\\n";

// Nullsafe (8.0) + null coalescing (7.0) for a missing chain:
class Order {
    public ?Customer $customer = null;
}
class Customer {
    public string $name = 'Ada';
}

$order = new Order();
echo ($order->customer?->name ?? 'guest'), "\\n";

$order->customer = new Customer();
echo ($order->customer?->name ?? 'guest'), "\\n";

// Since 7.0 this is a catchable Error (in 5.5 it was an uncatchable fatal):
try {
    $n = null;
    $n->charge();
} catch (\\Error $e) {
    echo 'caught: ', $e->getMessage(), "\\n";
}`,
    output: `20
guest
Ada
caught: Call to a member function charge() on null`,
  },

  keyPoints: [
    "**Deprecations** still run (with an `E_DEPRECATED` notice); **breaking changes** alter behaviour now — your tests must catch the latter.",
    "Add `declare(strict_types=1)` as the first line per file (PHP 7.0); it's opt-in, so adopt it gradually.",
    "PHP 7.0 made fatal errors catchable `Throwable`/`Error`; PHP 8.0 promoted many warnings/notices to `Error`/`TypeError`.",
    "Upgrade **one major version at a time** (5.5 → 7.4 → 8.2) and keep the test suite green at each stop.",
    "Lean on tooling: **PHPCompatibility** (a PHP_CodeSniffer ruleset) to detect, **Rector** to auto-fix, **PHPStan/Psalm** to catch type and null bugs statically.",
  ],

  interview: [
    {
      q: "What's the difference between a deprecation and a breaking change, and how does each affect your upgrade plan?",
      a: "A **deprecation** still works — the feature runs but emits an `E_DEPRECATED` notice signalling future removal (e.g. `each()` in 7.2, dynamic properties in 8.2). You can schedule those fixes. A **breaking change** alters behaviour immediately: removed functions, stricter coercion, warnings promoted to `Error`/`TypeError`. Breaking changes are what your **test suite and CI must catch** before you cut over; deprecations are a backlog to clear before the version that actually removes them.",
    },
    {
      q: "Why upgrade one major version at a time rather than jumping straight from 5.5 to 8.2?",
      a: "Each major version has its own migration guide, deprecations, and breaking changes. Hopping `5.5 → 7.4 → 8.2` lets you isolate failures to one set of changes, run **PHPCompatibility** against a single target, and keep the diff (and the blame surface) small. Jumping straight means any breakage could come from 7.0 *or* 8.0 changes at once, which is far harder to diagnose. At every stop you require green tests before moving on.",
    },
    {
      q: "What does `declare(strict_types=1)` do, and why add it per file during a migration?",
      a: "Introduced in **PHP 7.0**, it switches that file from coercive to strict typing: `int $x` will reject `\"3\"` with a `TypeError` instead of silently coercing it. It's **per-file and opt-in**, declared on the first line, so during a migration you can turn it on file-by-file as you harden each one — surfacing exactly the boundary bugs an upgrade tends to expose, without forcing a big-bang change across the whole codebase.",
    },
    {
      q: "How did error and exception handling change across PHP 7 and 8 in ways that affect old code?",
      a: "**7.0** added the `Throwable` hierarchy: many fatal engine errors became catchable `Error` objects, so things that killed a 5.5 script can now be caught. **8.0** promoted a long list of warnings/notices to `Error`/`TypeError` — writing to a property of a non-object, passing too few arguments to an internal function — and turned many notices into warnings, such as reading an undefined array key. (Calling a *method* on `null` had already become a catchable `Error` back in 7.0.) The practical upshot: 5.5 code that limped along by ignoring warnings may now *throw*. That's beneficial — silent corruption becomes a loud, traceable exception — but you must handle or fix those paths.",
    },
    {
      q: "Which tools would you reach for during the upgrade, and what does each do?",
      a: "**PHPCompatibility** — a PHP_CodeSniffer ruleset that statically reports which constructs break on a target version (run with `--runtime-set testVersion 8.2`). **Rector** — automated, rule-based refactoring that rewrites dated syntax for whole versions at once (e.g. to `??`, constructor promotion). **PHPStan / Psalm** — static analysers that catch type and null-safety bugs without running the code. Together they detect, auto-fix, and verify, while your tests confirm behaviour is unchanged.",
    },
  ],

  quiz: [
    {
      question:
        "Code uses `each()` and emits an `E_DEPRECATED` notice on PHP 7.2 but still runs. What is this, and when does it actually break?",
      options: [
        "A breaking change; it already fails to run",
        "A deprecation; it keeps working until removed in PHP 8.0",
        "A fatal Error; the script halts immediately",
        "A syntax error; it never parsed in the first place",
      ],
      answerIndex: 1,
      explain:
        "An E_DEPRECATED notice means the feature still works but is slated for removal. each() was deprecated in 7.2 and removed in 8.0, where calling it becomes a fatal error.",
    },
    {
      question:
        "In a file beginning with `declare(strict_types=1);`, what happens when you call `repeat(string $t, int $n)` as `repeat('ab', '3')`?",
      options: [
        "'3' is coerced to int 3 and it works",
        "It returns null with a warning",
        "It throws a TypeError because '3' is a string, not an int",
        "It's a parse error",
      ],
      answerIndex: 2,
      explain:
        "Strict types (PHP 7.0) disables scalar coercion at call boundaries, so passing the string '3' where an int is declared throws a TypeError. Without strict_types it would coerce to 3.",
    },
    {
      question:
        "Which change in PHP 8.0 most often turns previously 'working' 5.5 code into a thrown exception?",
      options: [
        "Arrow functions replacing closures",
        "Promotion of many warnings/notices (e.g. writing to a property of a non-object) to Error/TypeError",
        "Enums replacing class constants",
        "Readonly properties replacing getters",
      ],
      answerIndex: 1,
      explain:
        "PHP 8.0 promoted numerous warnings and notices — such as writing to a property of a non-object or passing too few arguments to an internal function — to Error/TypeError, so code that previously emitted a warning and continued now throws.",
    },
  ],
};

export default lesson;
