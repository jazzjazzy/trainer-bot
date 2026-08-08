import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-upgrade",
  title: "Why Upgrade & the 5.5 → 8.2 Timeline",
  part: "Getting Current",
  estMinutes: 10,
  summary:
    "What changed between PHP 5.5 and 8.2, why it's worth catching up, and how to read the rest of this course.",

  concept: `
If your mental model of PHP is the **5.5 era** (2013), the language has moved a
long way — and almost all of it in your favour. PHP 7 made code **two to three
times faster** for free, and PHP 7–8 turned PHP into a genuinely type-safe,
modern language. Meanwhile 5.5 has been **end-of-life since 2016**: no security
fixes, and a growing list of libraries that won't install on it.

### The shift in one sentence

You're moving from *"types are docblock comments and everything is an array"* to
*"typed properties, enums, readonly value objects, and \`match\`"* — without
giving up the PHP you already know.

### The timeline you skipped

- **5.6** (2014) — variadics (\`...\$args\`), argument unpacking, constant expressions.
- **7.0** (2015) — the big one: **scalar type hints**, **return types**, the
  null coalescing operator \`??\`, the spaceship \`<=>\`, \`Throwable\`, and the
  ~2× speed-up.
- **7.1–7.4** — nullable types \`?string\`, \`void\`/\`iterable\`, **typed
  properties**, **arrow functions** \`fn() =>\`, \`??=\`.
- **8.0** (2020) — **named arguments**, **union types**, **constructor property
  promotion**, the **\`match\`** expression, the nullsafe operator \`?->\`,
  **attributes**, and saner string-to-number comparisons.
- **8.1** — **enums**, **readonly properties**, fibers, \`never\`, first-class
  callable syntax \`strlen(...)\`.
- **8.2** — **readonly classes**, DNF types, \`null\`/\`false\`/\`true\` as standalone
  types, and dynamic properties deprecated.

### How to read this course

Every section shows **the PHP 5.5 way beside the modern way**, with the
difference called out — plus the deprecations and breaking changes to watch for
as you upgrade. You already know the concepts; you're learning the new spelling.
`,

  comparisons: [
    {
      label: "Typing a function",
      intro:
        "A tiny add function that takes two integers and returns their sum. The goal is to make the engine guarantee callers pass ints and that an int comes back.",
      php: `<?php
// PHP 5.5 — types live in a docblock the engine ignores
/**
 * @param int $a
 * @param int $b
 * @return int
 */
function add($a, $b) {
    return $a + $b;
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 8.2 — real, enforced types
function add(int $a, int $b): int {
    return $a + $b;
}`,
      note:
        "Scalar parameter and return types arrived in PHP 7.0; with declare(strict_types=1) they're enforced at call time instead of being hints in a comment.",
    },
    {
      label: "A fallback value",
      intro:
        "Pulling a user's role out of an array, but defaulting to 'guest' when the key is missing. The result is the role if present, otherwise 'guest'.",
      php: `<?php
// PHP 5.5 — nested isset() ternary
$role = isset($user['role']) ? $user['role'] : 'guest';`,
      ts: `<?php
// PHP 7.0 — null coalescing operator
$role = $user['role'] ?? 'guest';`,
      note:
        "?? returns the right-hand side when the left is null OR undefined, with no notice — replacing the classic isset()-ternary.",
    },
    {
      label: "A small value object",
      intro:
        "Defining an immutable Point that holds an x and a y passed into its constructor. Each version produces a class whose two coordinates are set once at construction time.",
      php: `<?php
// PHP 5.5 — declare, then assign, every property
class Point {
    private $x;
    private $y;
    public function __construct($x, $y) {
        $this->x = $x;
        $this->y = $y;
    }
}`,
      ts: `<?php
// PHP 8.2 — promotion + readonly in one line each
class Point {
    public function __construct(
        public readonly int $x,
        public readonly int $y,
    ) {}
}`,
      note:
        "Constructor property promotion (8.0) and readonly (8.1) collapse the declare-and-assign boilerplate into the constructor signature.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Modern PHP in a few lines. Read it, predict what it prints, then reveal the output.",
    code: `<?php
declare(strict_types=1);

$user = ['name' => 'Ada', 'role' => null];

// Null coalescing (7.0) instead of an isset() ternary:
$role = $user['role'] ?? 'guest';

// Arrow function (7.4) + match expression (8.0):
$label = fn(string $r): string => match ($r) {
    'admin' => 'Administrator',
    'guest' => 'Guest user',
    default => ucfirst($r),
};

echo "{$user['name']} is a {$label($role)}\\n";
echo str_contains($user['name'], 'd') ? "name has a 'd'\\n" : "no 'd'\\n";`,
    output: `Ada is a Guest user
name has a 'd'`,
  },

  keyPoints: [
    "PHP 5.5 is end-of-life (since 2016) — no security patches, and modern packages won't install.",
    "PHP 7.0 alone made typical code ~2× faster and added enforced scalar/return types and `??`.",
    "PHP 8.0–8.2 added named args, union types, constructor promotion, `match`, enums, and readonly.",
    "Everything is incremental: your 5.5 code mostly still runs — you adopt the new spellings where they help.",
    "Each lesson pairs the old way with the modern way and flags the breaking changes to watch for.",
  ],

  interview: [
    {
      q: "Why move off PHP 5.5 — what's the headline argument?",
      a: "Two things: **support** and **speed/safety**. 5.5 has had no security fixes since 2016 and modern libraries (and Composer itself) increasingly refuse to run on it. On top of that, PHP 7.0 delivered a roughly **2× performance** jump for free, and PHP 7–8 added a real type system (scalar/return/typed properties/union types), enums, and readonly value objects — so you catch whole classes of bugs at the boundary instead of at runtime.",
    },
    {
      q: "What's the single biggest leap in that range, and why?",
      a: "**PHP 7.0.** It rewrote the engine (the ~2× speed-up) and introduced scalar type declarations, return types, `Throwable`, the null coalescing operator, and the spaceship operator. Almost everything that makes PHP feel modern is either in 7.0 or builds directly on it.",
    },
    {
      q: "Is upgrading from 5.5 to 8.2 risky for an existing app?",
      a: "There are real breaking changes across 7.0 and 8.0 (notably stricter type errors, many warnings promoted to `TypeError`/`Error`, and changed string-to-number comparison rules in 8.0), but the path is well-trodden. You upgrade one major version at a time, lean on tools like **PHPCompatibility** (a PHP_CodeSniffer ruleset) and **Rector** to find and auto-fix dated patterns, and rely on your test suite. Most 5.5 code runs on 8.2 with modest changes.",
    },
  ],

  quiz: [
    {
      question: "Which PHP version first added enforced scalar type declarations and return types?",
      options: ["PHP 5.6", "PHP 7.0", "PHP 8.0", "PHP 8.1"],
      answerIndex: 1,
      explain:
        "Scalar type declarations and return type declarations were introduced in PHP 7.0 (with strict mode via declare(strict_types=1)).",
    },
    {
      question: "What does `$user['role'] ?? 'guest'` do?",
      options: [
        "Throws if 'role' is undefined",
        "Returns 'guest' only if 'role' is exactly false",
        "Returns 'guest' when 'role' is null or undefined, with no notice",
        "Is a syntax error before PHP 8.0",
      ],
      answerIndex: 2,
      explain:
        "The null coalescing operator (PHP 7.0) yields the right operand when the left is null or not set, without emitting a notice — unlike a bare isset() ternary you'd write in 5.5.",
    },
    {
      question: "Which two features let you replace a declare-and-assign constructor with one-liners?",
      options: [
        "Named arguments and match",
        "Constructor property promotion and readonly",
        "Enums and fibers",
        "Union types and attributes",
      ],
      answerIndex: 1,
      explain:
        "Constructor property promotion (8.0) declares and assigns properties from the constructor signature; readonly (8.1) makes them immutable after construction.",
    },
  ],
};

export default lesson;
