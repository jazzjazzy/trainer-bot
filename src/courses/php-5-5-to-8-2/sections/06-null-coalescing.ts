import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "null-coalescing",
  title: "Null Coalescing: ?? Kills the isset() Ternary",
  part: "PHP 7.0: Types & the Engine",
  estMinutes: 10,
  summary:
    "How the ?? operator (PHP 7.0) replaces the noisy isset()-ternary for fallbacks, chains cleanly, and pairs with ??= (PHP 7.4).",

  concept: `
In the 5.5 era, "use this value, but fall back if it's missing" meant writing the
key **twice** inside an \`isset()\` ternary. PHP 7.0 introduced the **null
coalescing operator** \`??\` to do exactly that in one expression — and it's one
of the modern features you'll reach for every single day.

### What ?? actually does

\`\$a ?? \$b\` evaluates to **\`\$a\` when it exists and is not \`null\`**, otherwise to
\`\$b\`. The crucial part: the left operand may be an **undefined** variable or a
**missing array key**, and \`??\` will *not* emit an \`E_NOTICE\` (or, in PHP 8,
\`E_WARNING\`). It is essentially \`isset(\$a) ? \$a : \$b\` collapsed into an operator
— without repeating \`\$a\`.

### The 5.5 way it replaces

\`\`\`php
// PHP 5.5 — the key appears twice, and you must remember isset()
\$role = isset(\$user['role']) ? \$user['role'] : 'guest';
\`\`\`

A plain ternary (\`\$user['role'] ?: 'guest'\`) was *not* a safe substitute: it
still triggers a notice on a missing key, and it treats falsy-but-present values
like \`0\` or \`''\` as "missing". \`??\` only cares about \`null\`/undefined.

### Chaining: a ?? b ?? c

\`??\` is right-associative, so you can walk a list of fallbacks left to right and
take the **first defined, non-null** one:

\`\`\`php
\$timezone = \$_GET['tz'] ?? \$user->tz ?? \$config['tz'] ?? 'UTC';
\`\`\`

### ??= — the assignment shortcut (PHP 7.4)

PHP 7.4 added the **null coalescing assignment** operator \`??=\`. \`\$a ??= \$b\`
means "assign \$b to \$a only if \$a is currently null or unset" — perfect for
lazy defaults and memoization:

\`\`\`php
\$cache[\$key] ??= expensiveLookup(\$key); // computed once, reused after
\`\`\`

### Gotchas when upgrading

- \`??\` short-circuits: the right side is only evaluated if the left is null/unset.
- It suppresses the *missing*-key notice, but **not** other errors — \`\$a->b ?? 'x'\`
  still fatals if \`\$a\` isn't an object. (The nullsafe \`?->\` in 8.0 handles that.)
- \`??\` cannot be combined with assignment by reference, and \`\$a ?? \$b = ...\` needs
  parentheses — precedence is lower than you might expect.
`,

  comparisons: [
    {
      label: "Array key with a default",
      intro:
        "Read a user's role from an array, but the 'role' key might not be set at all. We want the stored role if present, otherwise the string 'guest'.",
      php: `<?php
// PHP 5.5 — isset() ternary, key written twice
$role = isset($user['role']) ? $user['role'] : 'guest';`,
      ts: `<?php
// PHP 7.0 — null coalescing operator
$role = $user['role'] ?? 'guest';`,
      note:
        "?? (PHP 7.0) returns the right side when the left is null or undefined, with no notice — and you write the key once.",
    },
    {
      label: "First-defined of several sources",
      intro:
        "Pick a timezone from whichever source provides one first: the query string, then the user's profile, and finally a hardcoded 'UTC'. The result is the first of those that actually exists.",
      php: `<?php
// PHP 5.5 — nested isset() ternaries get ugly fast
$tz = isset($_GET['tz'])
    ? $_GET['tz']
    : (isset($user['tz']) ? $user['tz'] : 'UTC');`,
      ts: `<?php
// PHP 7.0 — chain ?? left to right
$tz = $_GET['tz'] ?? $user['tz'] ?? 'UTC';`,
      note:
        "Chained ?? (PHP 7.0) is right-associative and yields the first defined, non-null operand — replacing nested ternaries.",
    },
    {
      label: "Set a default only if missing",
      intro:
        "Make sure an options array has a 'limit' setting, defaulting it to 50 only when the caller didn't provide one. Any value the caller already passed must be left untouched.",
      php: `<?php
// PHP 5.5 — guard, then assign
if (!isset($options['limit'])) {
    $options['limit'] = 50;
}`,
      ts: `<?php
// PHP 7.4 — null coalescing assignment
$options['limit'] ??= 50;`,
      note:
        "??= (PHP 7.4) assigns the right side only when the left is null/unset — the right side isn't even evaluated otherwise.",
    },
    {
      label: "Falsy-but-present values",
      intro:
        "Read a cart quantity that could legitimately be 0, falling back to 1 only when no quantity was supplied. A real quantity of 0 must survive rather than be mistaken for missing.",
      php: `<?php
// PHP 5.5 — the ?: shortcut wrongly treats 0 / '' as 'missing'
$qty = $cart['qty'] ?: 1; // 0 becomes 1!`,
      ts: `<?php
// PHP 7.0 — ?? only falls back on null/undefined
$qty = $cart['qty'] ?? 1; // 0 stays 0`,
      note:
        "Unlike the Elvis operator ?:, ?? (PHP 7.0) checks isset-ness, not truthiness — so 0, '', and '0' are preserved.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Predict each line before revealing. Watch how ?? treats 0 and '' differently from ?:.",
    code: `<?php
declare(strict_types=1);

$cart = ['qty' => 0, 'coupon' => null];

// ?? keeps a present-but-falsy 0; ?: would replace it with the fallback:
echo 'coalesce qty: ' . ($cart['qty'] ?? 9) . "\\n";
echo 'elvis qty:    ' . ($cart['qty'] ?: 9) . "\\n";

// null value falls through ?? to the default:
echo 'coupon: ' . ($cart['coupon'] ?? 'NONE') . "\\n";

// Chained ?? takes the first defined, non-null operand:
$tz = $cart['tz'] ?? $cart['region'] ?? 'UTC';
echo 'tz: ' . $tz . "\\n";

// ??= (7.4) only assigns when the key is missing/null:
$cart['qty'] ??= 5;       // qty is 0 (not null) -> unchanged
$cart['shipping'] ??= 'standard'; // missing -> assigned
echo 'qty after ??=: ' . $cart['qty'] . "\\n";
echo 'shipping: ' . $cart['shipping'] . "\\n";`,
    output: `coalesce qty: 0
elvis qty:    9
coupon: NONE
tz: UTC
qty after ??=: 0
shipping: standard`,
  },

  keyPoints: [
    "`??` (PHP 7.0) returns the right operand when the left is `null` **or** undefined — no notice/warning.",
    "It replaces `isset($x) ? $x : $y`, so you write the expression **once**.",
    "Chain it: `$a ?? $b ?? $c` yields the first defined, non-null value (right-associative).",
    "Not the same as `?:` — `??` checks isset-ness, so falsy-but-present values like `0` and `''` are kept.",
    "`??=` (PHP 7.4) assigns a default only when the target is null/unset, and skips evaluating the right side otherwise.",
    "`??` suppresses the *missing*-key notice, not real errors — use the nullsafe `?->` (8.0) for null objects.",
  ],

  interview: [
    {
      q: "What's the difference between `??` and `?:` in PHP?",
      a: "`?:` (the Elvis operator) tests **truthiness**: `$a ?: $b` returns `$a` when `$a` is truthy, else `$b`. `??` (PHP 7.0) tests **isset-ness**: `$a ?? $b` returns `$a` when `$a` is set and not `null`, else `$b`. So for `0`, `''`, `'0'`, or `[]`, `?:` falls back to `$b` while `??` keeps the present value. Also, `?:` on a missing array key or undefined variable raises a notice/warning; `??` is silent on that.",
    },
    {
      q: "Is `$user['role'] ?? 'guest'` equivalent to `isset($user['role']) ? $user['role'] : 'guest'`?",
      a: "Yes — that's exactly the desugaring. `??` was introduced in **PHP 7.0** precisely to collapse that pattern so you don't repeat the key. The key behaviour to remember is that it also suppresses the notice/warning you'd otherwise get from reading an undefined key, just like wrapping it in `isset()`.",
    },
    {
      q: "What does `??=` do and when did it arrive?",
      a: "`??=` is the **null coalescing assignment** operator, added in **PHP 7.4**. `$a ??= $b` is shorthand for `$a = $a ?? $b` — it assigns `$b` to `$a` only when `$a` is `null` or unset. Importantly it **short-circuits**: if `$a` is already set, the right side is never evaluated, which makes it ideal for lazy defaults and simple memoization like `$cache[$k] ??= compute($k)`.",
    },
    {
      q: "Does `??` protect you from every kind of error on the left side?",
      a: "No. It only suppresses the notice/warning for an **undefined variable or missing array key** and the `null` value. It does **not** save you from, say, calling a method on a non-object: `$a->b ?? 'x'` still throws if `$a` isn't an object. For safely traversing possibly-null objects, use the nullsafe operator `?->` introduced in **PHP 8.0**, often together with `??`.",
    },
  ],

  quiz: [
    {
      question: "What does `$cart['qty'] ?? 1` return when `$cart['qty']` is `0`?",
      options: [
        "1, because 0 is falsy",
        "0, because the key is set and not null",
        "null",
        "A notice, then 1",
      ],
      answerIndex: 1,
      explain:
        "?? only falls back when the left operand is null or undefined. Here the key exists and holds 0 (not null), so 0 is returned. (The Elvis operator ?: would have returned 1.)",
    },
    {
      question: "In which PHP versions were `??` and `??=` introduced, respectively?",
      options: [
        "5.6 and 7.0",
        "7.0 and 7.4",
        "7.0 and 8.0",
        "7.4 and 8.0",
      ],
      answerIndex: 1,
      explain:
        "The null coalescing operator ?? arrived in PHP 7.0; the null coalescing assignment operator ??= was added later, in PHP 7.4.",
    },
    {
      question: "What is `$a ?? $b ?? $c` equivalent to?",
      options: [
        "The first of $a, $b, $c that is truthy",
        "The first of $a, $b, $c that is set and not null",
        "The last operand, $c, always",
        "A syntax error — ?? cannot be chained",
      ],
      answerIndex: 1,
      explain:
        "?? is right-associative and chainable; the expression yields the first operand that is defined and not null, evaluating left to right. It checks isset-ness, not truthiness.",
    },
  ],
};

export default lesson;
