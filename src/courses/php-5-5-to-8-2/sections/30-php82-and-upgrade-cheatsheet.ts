import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "php82-and-upgrade-cheatsheet",
  title: "PHP 8.2 & the 5.5 → 8.2 Cheat Sheet",
  part: "PHP 8.1–8.2: Modern PHP",
  estMinutes: 25,
  summary:
    "The last 8.2 features (readonly classes, DNF types, standalone null/false/true, trait constants, #[\\SensitiveParameter]) plus a complete old-vs-modern reference and upgrade checklist for the whole 5.5 → 8.2 journey.",

  concept: `
This is the capstone. First the final batch of PHP **8.2** features, then a
single **cheat sheet** mapping every 5.5 idiom you know to its modern spelling,
the breaking changes to watch, and a checklist for the upgrade itself.

### What 8.2 added

- **\`readonly\` classes** — mark the whole class \`readonly\` and every property
  is implicitly readonly. No more repeating the keyword per property.

\`\`\`php
final readonly class Money {
    public function __construct(
        public int $amount,
        public string $currency,
    ) {}
}
\`\`\`

- **DNF (disjunctive normal form) types** — combine intersections and unions:
  \`(Countable&Traversable)|null\`. Each \`&\`-group must be parenthesised.
- **Standalone \`null\`, \`false\`, \`true\`** types — previously only usable inside a
  union (\`string|false\`); now legal on their own as a return/param type.
- **Dynamic properties are DEPRECATED** — \`$obj->whatever = 1\` on an undeclared
  property warns in 8.2 and will throw in 9.0. Either **declare the property**,
  or opt in per class with **\`#[\\AllowDynamicProperties]\`**. (\`stdClass\` and
  \`__set\` are unaffected.)
- **Constants in traits** — a trait may now declare \`const\`; the using class
  inherits it.
- **\`#[\\SensitiveParameter]\`** — mark a parameter (e.g. a password) so its value
  is **redacted from stack traces** instead of leaking into logs.

\`\`\`php
function login(string $user, #[\\SensitiveParameter] string $password): void { /* ... */ }
\`\`\`

### 5.5 → 8.2 cheat sheet — old idiom → modern idiom

**Types & null**

| PHP 5.5 | Modern | Since |
| --- | --- | --- |
| \`@param int $x\` docblock | \`function f(int $x): int\` | 7.0 |
| no nullable hint | \`?string $x\` / \`string|null\` | 7.1 / 8.0 |
| \`private $x;\` | \`private int $x;\` (typed property) | 7.4 |
| \`mixed\` via no hint | \`mixed\` type | 8.0 |
| union by docblock | \`int|string\` union type | 8.0 |
| intersection by docblock | \`A&B\` / \`(A&B)|null\` (DNF) | 8.1 / 8.2 |

**OOP**

| PHP 5.5 | Modern | Since |
| --- | --- | --- |
| declare + assign in ctor | constructor promotion | 8.0 |
| no immutability | \`readonly\` property / \`readonly class\` | 8.1 / 8.2 |
| class constants as enums | \`enum\` / backed \`enum\` | 8.1 |
| metadata via docblock | native **attributes** \`#[Attr]\` | 8.0 |

**Operators & control flow**

| PHP 5.5 | Modern | Since |
| --- | --- | --- |
| \`isset($a)?$a:$b\` | \`$a ?? $b\` | 7.0 |
| \`$a = $a ?? $b\` | \`$a ??= $b\` | 7.4 |
| \`if/elseif\` ladder | \`match (...)\` (strict, returns value) | 8.0 |
| \`$x && $x->m()\` guard | \`$x?->m()\` (nullsafe) | 8.0 |
| \`'strlen'\` callable string | \`strlen(...)\` first-class callable | 8.1 |

**Strings & arrays**

| PHP 5.5 | Modern | Since |
| --- | --- | --- |
| \`strpos($h,$n)!==false\` | \`str_contains($h,$n)\` | 8.0 |
| manual prefix/suffix check | \`str_starts_with\` / \`str_ends_with\` | 8.0 |
| \`array('a'=>1)\` | \`['a'=>1]\` short syntax | 5.4 |
| \`call_user_func_array\` spread | \`...$args\` unpacking | 5.6 |

### Breaking changes to watch

| Change | Version | Impact |
| --- | --- | --- |
| Stricter type juggling; many warnings → \`TypeError\` | 7.0/8.0 | Sloppy coercions now throw |
| Number ↔ non-numeric string comparison changed | 8.0 | \`0 == "foo"\` is now \`false\`; numeric strings like \`"1" == "01"\` are unchanged |
| Most internal warnings promoted to \`Error\` | 8.0 | Undefined-method etc. throw |
| Dynamic properties deprecated | 8.2 | Declare props or add attribute |
| \`utf8_encode\`/\`decode\` deprecated, \`\${}\` interpolation deprecated | 8.2 | Migrate string syntax |

### Upgrade checklist

1. Get on PHP 7.4 first, **one major at a time** (5.5→7.x→8.x).
2. Add **\`declare(strict_types=1)\`** to new files; fix the \`TypeError\`s.
3. Run **PHPCompatibility** (PHP_CodeSniffer ruleset) and **Rector** to find/auto-fix dated patterns.
4. Lean on your test suite and \`error_reporting(E_ALL)\` to surface promoted errors.
5. Declare dynamic properties before 8.2; adopt enums/readonly where they sharpen intent.
`,

  comparisons: [
    {
      label: "An immutable value object",
      intro:
        "We want a Money type whose amount and currency are fixed once it's built, so passing it around can never accidentally change it. Both versions model the same value, but only one actually enforces that nothing can mutate it after construction.",
      php: `<?php
// PHP 5.5 — privates + getters, nothing actually stops mutation internally
class Money {
    private $amount;
    private $currency;
    public function __construct($amount, $currency) {
        $this->amount = $amount;
        $this->currency = $currency;
    }
    public function getAmount() { return $this->amount; }
    public function getCurrency() { return $this->currency; }
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 8.2 — readonly class: promoted, typed, immutable after construction
final readonly class Money {
    public function __construct(
        public int $amount,
        public string $currency,
    ) {}
}`,
      note:
        "readonly classes (8.2) make every promoted property (8.0) immutable after construction; assigning again throws Error.",
    },
    {
      label: "A nullable intersection type",
      intro:
        "A size helper accepts something that is both Countable and Traversable, or nothing at all, and returns its count (0 when given null). The goal is to state that exact contract in the signature so the engine rejects bad arguments instead of trusting a comment.",
      php: `<?php
// PHP 5.5 — express the contract only in a docblock
/**
 * @param Countable&Traversable|null $items
 */
function size($items) {
    return $items === null ? 0 : count($items);
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 8.2 — DNF type enforced by the engine
function size((\\Countable&\\Traversable)|null $items): int {
    return $items === null ? 0 : count($items);
}`,
      note:
        "DNF types (8.2) let you mix intersection and union: each &-group is parenthesised, here OR-ed with null.",
    },
    {
      label: "Constants shared by a trait",
      intro:
        "A reusable trait checks whether a record is active by comparing its status to the 'active' value. We'd like that magic number to live in one place with the logic that uses it, rather than being copied into every class that adopts the trait.",
      php: `<?php
// PHP 5.5 — traits can't hold constants, so you duplicate them per class
trait HasStatus {
    public function isActive() {
        return $this->status === 1; // magic number, repeated everywhere
    }
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 8.2 — the trait owns the constant
trait HasStatus {
    const ACTIVE = 1;
    public function isActive(): bool {
        return $this->status === self::ACTIVE;
    }
}`,
      note:
        "Constants in traits (8.2) keep the constant with the behaviour that uses it, instead of redeclaring it in every consumer.",
    },
    {
      label: "Keeping secrets out of stack traces",
      intro:
        "A login function takes a username and a plaintext password and hands them to an authenticator. If anything in that call throws, we don't want the password ending up in the exception's stack trace and then in the logs.",
      php: `<?php
// PHP 5.5 — the raw password sits in every stack trace this frame appears in
function login($user, $password) {
    // if this throws, $password shows up in the trace / logs
    return authenticate($user, $password);
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 8.2 — value redacted in stack traces
function login(string $user, #[\\SensitiveParameter] string $password): bool {
    return authenticate($user, $password);
}`,
      note:
        "#[\\SensitiveParameter] (8.2) replaces the argument with 'Object(SensitiveParameterValue)' in stack traces, so secrets don't leak into logs.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A small modern-PHP showcase: a backed enum, a readonly class, match, and named arguments together. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

enum Plan: string {
    case Free = 'free';
    case Pro  = 'pro';

    public function monthlyPrice(): int {
        return match ($this) {
            Plan::Free => 0,
            Plan::Pro  => 20,
        };
    }
}

final readonly class Subscription {
    public function __construct(
        public string $account,
        public Plan $plan,
        public int $seats = 1,
    ) {}

    public function total(): int {
        return $this->plan->monthlyPrice() * $this->seats;
    }
}

// Named arguments (8.0) — order-independent, self-documenting:
$sub = new Subscription(
    account: 'acme',
    plan: Plan::Pro,
    seats: 3,
);

echo "{$sub->account}: {$sub->plan->name} x{$sub->seats} = \\$" . $sub->total() . "/mo\\n";
echo Plan::from('free')->monthlyPrice() === 0 ? "free is free\\n" : "??\\n";`,
    output: `acme: Pro x3 = $60/mo
free is free`,
  },

  keyPoints: [
    "**8.2** adds `readonly` classes, DNF types `(A&B)|null`, standalone `null`/`false`/`true`, trait constants, and `#[\\SensitiveParameter]`.",
    "Dynamic properties are **deprecated in 8.2** — declare the property or opt in with `#[\\AllowDynamicProperties]`.",
    "The 5.5 → 8.2 arc: real types (7.0/7.4), `??`/`match`/named args/promotion (7.0/8.0), enums + readonly (8.1), readonly classes (8.2).",
    "Biggest breaking changes: stricter type errors and warnings-promoted-to-`Error` (7.0/8.0), and changed string-to-number comparison (8.0).",
    "Upgrade one major version at a time; use **PHPCompatibility** and **Rector** plus your tests to find and fix dated patterns.",
  ],

  interview: [
    {
      q: "What's the difference between a `readonly` property and a `readonly` class?",
      a: "A `readonly` **property** (8.1) can be written exactly once, from inside the declaring class's scope (typically the constructor), then becomes immutable. A `readonly` **class** (8.2) is sugar that makes **every** declared property readonly — you don't repeat the keyword. A readonly class also forbids dynamic and untyped properties. Reassigning a readonly property throws an `Error`.",
    },
    {
      q: "What is a DNF type and why was it added in 8.2?",
      a: "DNF (disjunctive normal form) types let you combine **intersection** and **union** types, e.g. `(Countable&Traversable)|null`. Before 8.2 you could write a pure intersection (`A&B`, since 8.1) or a pure union (`A|B`, since 8.0) but not mix them. DNF requires each `&`-group to be parenthesised, then OR-ed together — so you can finally type 'something that is both Countable and Traversable, or null'.",
    },
    {
      q: "Dynamic properties are deprecated in 8.2 — what are your options?",
      a: "Three: (1) **declare the property** explicitly on the class — the cleanest fix; (2) add **`#[\\AllowDynamicProperties]`** to the class if you genuinely need arbitrary properties; or (3) implement **`__get`/`__set`** to manage them yourself. `stdClass` and classes with `__set` are exempt. The deprecation warns in 8.2 and becomes an `Error` in 9.0, so fix it during the upgrade.",
    },
    {
      q: "Before 8.2, how did you express a standalone `false` return type, and what changed?",
      a: "Before 8.2 `false` (and `null`) were only valid **inside a union**, e.g. `string|false` for functions like `strpos`. You couldn't write `function f(): false`. PHP 8.2 made **`null`, `false`, and `true`** legal as **standalone** types, which is handy for stubs and functions that, by contract, only ever return one of those literals.",
    },
    {
      q: "What does `#[\\SensitiveParameter]` do, and why is it more than cosmetic?",
      a: "It marks a parameter so that, in any **stack trace**, its value is replaced by a `SensitiveParameterValue` wrapper instead of the real value. Stack traces routinely end up in logs and error trackers, so a thrown exception in a `login($user, $password)` call used to leak the password. The attribute (8.2) plugs that leak with zero runtime cost to normal calls.",
    },
    {
      q: "Walk me through the type-system milestones from 5.5 to 8.2.",
      a: "**7.0** scalar + return types (enforced under `strict_types`). **7.1** nullable `?T`, `void`, `iterable`. **7.4** typed properties. **8.0** union types and `mixed`. **8.1** pure intersection types `A&B` and `never`. **8.2** DNF types and standalone `null`/`false`/`true`. In one line: PHP went from docblock-only types to a real, enforceable type system across these releases.",
    },
    {
      q: "What's the upgrade path and tooling you'd use going from 5.5 to 8.2?",
      a: "Go **one major version at a time** (5.5 → 7.x → 8.x), never skip a major blindly. Add `declare(strict_types=1)` to new code, crank `error_reporting` to `E_ALL`, and run **PHPCompatibility** (a PHP_CodeSniffer ruleset) to flag version issues and **Rector** to auto-migrate dated patterns. Then rely on your test suite to catch the behavioural breaks (promoted errors, comparison changes).",
    },
    {
      q: "What changed about string-to-number comparison in 8.0, and why does it matter for old code?",
      a: "In 5.5/7.x, `0 == \"foo\"` was **true** because the string was coerced to `0`. PHP 8.0 changed it: when comparing a number to a **non-numeric string**, the number is cast to a string instead, so `0 == \"foo\"` is now **false**. This silently changes branching in old code that relied on the loose behaviour — a classic upgrade gotcha you find by testing, not by the compiler.",
    },
    {
      q: "When would you reach for `match` instead of `switch`?",
      a: "Almost always, when you're mapping a value to a result. `match` (8.0) is an **expression** (it returns a value), uses **strict `===`** comparison (no `0 == 'foo'` surprises), needs **no `break`** (no fall-through bugs), and **throws `UnhandledMatchError`** if nothing matches and there's no `default`. `switch` is still fine when each arm runs several statements for side effects.",
    },
    {
      q: "How do enums in 8.1 improve on the 5.5 'class constants' pattern?",
      a: "In 5.5 you used `const STATUS_ACTIVE = 1;` — bare ints/strings with no type safety; any int could sneak in. An 8.1 **enum** is a real type: `function setStatus(Status $s)` only accepts genuine cases. **Backed** enums map each case to a scalar (`case Active = 1;`) with `->value`, `from()`, and `tryFrom()`. Enums can also hold methods and implement interfaces, so behaviour lives with the values.",
    },
    {
      q: "What does constructor property promotion buy you, and any caveats?",
      a: "Promotion (8.0) lets you declare and assign a property right in the constructor signature: `public function __construct(private int $x) {}` replaces the declare-then-`$this->x = $x` boilerplate. Caveats: it only works for **constructor** parameters, you still need a constructor body for any extra logic, and you can't promote `callable` types or use `var`. It pairs naturally with `readonly`.",
    },
    {
      q: "Name the modern string/array helpers that replace common 5.5 idioms.",
      a: "**`str_contains`**, **`str_starts_with`**, **`str_ends_with`** (all 8.0) replace error-prone `strpos(...) !== false` / `substr` comparisons. Array unpacking with **`...`** (5.6 for args, 7.4+ for arrays, 8.1 for string keys) replaces `call_user_func_array` and `array_merge` gymnastics. Short array syntax `[]` (5.4) replaces `array()`.",
    },
    {
      q: "What's the difference between the nullsafe operator and `??`?",
      a: "`??` (7.0) deals with a **missing/null value**: `$a ?? $b`. The **nullsafe** operator `?->` (8.0) deals with a **possibly-null object in a chain**: `$user?->profile?->avatar` short-circuits to `null` the moment any link is null, instead of fataling on a method/property access. They compose: `$user?->profile?->name ?? 'Anonymous'`.",
    },
    {
      q: "Why can't dynamic properties just keep working — what's the rationale for deprecating them?",
      a: "Dynamic properties hide bugs: a typo like `$user->emial = '...'` silently creates a new property instead of erroring, and they defeat IDE/static-analysis tooling and the type system. Deprecating them (8.2) pushes you to **declare your shape**, which makes objects predictable and analyzable. The escape hatch `#[\\AllowDynamicProperties]` exists for the genuine cases (e.g. some ORM/magic-bag patterns).",
    },
  ],

  quiz: [
    {
      question: "In PHP 8.2, what does marking a class `readonly` do?",
      options: [
        "Prevents the class from being extended",
        "Makes every declared property implicitly readonly",
        "Makes all methods static",
        "Caches the class's return values",
      ],
      answerIndex: 1,
      explain:
        "A readonly class (8.2) makes every declared property readonly without repeating the keyword, and it forbids untyped and dynamic properties. It does not affect inheritance (use `final` for that).",
    },
    {
      question: "Which type declaration is newly valid only from PHP 8.2?",
      options: [
        "`?string`",
        "`int|string`",
        "`(Countable&Traversable)|null`",
        "`A&B`",
      ],
      answerIndex: 2,
      explain:
        "DNF types — mixing an intersection group with a union, like `(Countable&Traversable)|null` — arrived in 8.2. Nullable `?T` is 7.1, unions 8.0, and pure intersections `A&B` are 8.1.",
    },
    {
      question: "How do you keep assigning an undeclared property on an object without a deprecation notice in 8.2?",
      options: [
        "Nothing is needed; dynamic properties are unchanged",
        "Add `#[\\SensitiveParameter]` to the class",
        "Declare the property or add `#[\\AllowDynamicProperties]` to the class",
        "Wrap the assignment in `try/catch`",
      ],
      answerIndex: 2,
      explain:
        "Dynamic properties are deprecated in 8.2. Declare the property explicitly, or opt the class in with `#[\\AllowDynamicProperties]`. `#[\\SensitiveParameter]` is unrelated (it redacts arguments from stack traces).",
    },
    {
      question: "Why is `match` generally safer than `switch` for mapping a value to a result?",
      options: [
        "It allows fall-through between cases",
        "It uses loose `==` comparison",
        "It is an expression, uses strict `===`, needs no `break`, and throws if nothing matches",
        "It is faster at runtime in all cases",
      ],
      answerIndex: 2,
      explain:
        "`match` (8.0) returns a value, compares with strict `===`, has no fall-through (so no missing-`break` bugs), and throws `UnhandledMatchError` when no arm matches and there's no `default`.",
    },
  ],
};

export default lesson;
