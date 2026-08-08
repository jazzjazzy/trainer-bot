import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "coalesce-assign-and-spread",
  title: "??=, Array Spread & Numeric Separators",
  part: "PHP 7.1–7.4: Refinements",
  estMinutes: 10,
  summary:
    "Three small PHP 7.4 quality-of-life wins: the ??= assignment operator, spreading arrays inside literals, and underscores in numeric literals.",

  concept: `
PHP 7.4 shipped a cluster of *small* syntax refinements that quietly delete a lot
of boilerplate. None of them changes how your program behaves — they change how
much typing it takes to express the same intent, and how readable the result is.

### Null coalescing assignment \`??=\`

You already met \`??\` (PHP 7.0). Its sibling \`??=\` (PHP 7.4) **assigns only when
the left side is null or undefined** — the "set a default if missing" pattern.

\`\`\`php
// 5.5: check, then assign
if (!isset($config['timeout'])) {
    $config['timeout'] = 30;
}

// 7.4: one operator, no notice if the key is missing
$config['timeout'] ??= 30;
\`\`\`

Crucially, the right-hand side is **only evaluated when needed** — so
\`$cache[$id] ??= expensiveLookup($id);\` skips the lookup on a cache hit.

### Array spread in literals \`[...$a, ...$b]\`

PHP 5.6 let you unpack into *function calls* (\`f(...$args)\`). PHP 7.4 extended
\`...\` to **array literals**, so you can merge or prepend inline:

\`\`\`php
$base  = [1, 2, 3];
$more  = [4, 5];

// 5.5
$all = array_merge($base, $more);

// 7.4
$all = [...$base, ...$more, 6];  // [1, 2, 3, 4, 5, 6]
\`\`\`

Two gotchas:

- In 7.4 spread only works on **integer-keyed** arrays; spreading a
  **string-keyed** array throws a fatal error. (PHP **8.1** lifted that — string
  keys are allowed and later keys win, just like \`array_merge\`.)
- Numeric keys are **renumbered** from 0, exactly like \`array_merge\` —
  *unlike* the \`+\` union operator, which keeps the first value for a key.

### Numeric literal separator \`_\`

PHP 7.4 lets you put underscores between digits purely for readability. The
engine strips them — the value is identical.

\`\`\`php
$bytes  = 1_073_741_824;   // 1024 * 1024 * 1024
$price  = 19_99;           // still just 1999
$hex    = 0xCA_FE_F0_0D;
\`\`\`

They're cosmetic: \`1_000_000 === 1000000\` is \`true\`.
`,

  comparisons: [
    {
      label: "Default a missing value",
      intro:
        "An options array might not have a 'retries' key, and we want it to fall back to 3 when absent. After this runs, retries is 3 if it was missing and untouched otherwise.",
      php: `<?php
// PHP 5.5 — isset() guard around the assignment
if (!isset($options['retries'])) {
    $options['retries'] = 3;
}`,
      ts: `<?php
// PHP 7.4 — null coalescing assignment
$options['retries'] ??= 3;`,
      note:
        "??= (PHP 7.4) assigns only when the left side is null/undefined, evaluating the right side lazily — replacing the isset() guard.",
    },
    {
      label: "Merge two lists",
      intro:
        "We have two numeric lists and want a single combined list containing all of their values in order. The result is the array [1, 2, 3, 4, 5].",
      php: `<?php
// PHP 5.5 — array_merge for numeric lists
$base = [1, 2, 3];
$extra = [4, 5];
$all = array_merge($base, $extra);`,
      ts: `<?php
// PHP 7.4 — spread inside an array literal
$base = [1, 2, 3];
$extra = [4, 5];
$all = [...$base, ...$extra];`,
      note:
        "Array spread in literals arrived in PHP 7.4 (integer keys only; string keys allowed from 8.1) and renumbers keys like array_merge.",
    },
    {
      label: "Lazy cache-or-compute default",
      intro:
        "We want to return a cached value for an id, computing it with the costly lookup function only on a cache miss. The goal is to avoid calling lookup when the value is already cached.",
      php: `<?php
// PHP 5.5 — guard so the lookup only runs on a miss
if (!isset($cache[$id])) {
    $cache[$id] = lookup($id);
}
$value = $cache[$id];`,
      ts: `<?php
// PHP 7.4 — ??= evaluates lookup() only on a miss
$value = $cache[$id] ??= lookup($id);`,
      note:
        "The right operand of ??= (PHP 7.4) is evaluated only when the left side is null/undefined, so lookup() is skipped on a cache hit.",
    },
    {
      label: "A big, readable number",
      intro:
        "We are writing large integer constants like the max 32-bit int and a gibibyte, and want them to be easy to read at a glance. Both versions store the exact same numbers.",
      php: `<?php
// PHP 5.5 — count the zeros yourself
$maxInt = 2147483647;
$gib = 1024 * 1024 * 1024;`,
      ts: `<?php
// PHP 7.4 — underscores group the digits
$maxInt = 2_147_483_647;
$gib = 1_073_741_824;`,
      note:
        "Numeric literal separators (PHP 7.4) are purely visual; the engine strips the underscores so the value is identical.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "All three 7.4 refinements in one snippet. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

// Numeric separator — purely cosmetic
$limit = 1_000_000;
echo ($limit === 1000000 ? 'same' : 'diff'), "\\n";

// ??= sets a default only when the key is missing
$config = ['timeout' => 30];
$config['timeout'] ??= 99;   // already set -> untouched
$config['retries'] ??= 3;    // missing      -> assigned
echo "timeout={$config['timeout']} retries={$config['retries']}\\n";

// Array spread merges and renumbers integer keys
$base  = [1, 2, 3];
$extra = [4, 5];
$all   = [...$base, ...$extra, 6];
print_r($all);`,
    output: `same
timeout=30 retries=3
Array
(
    [0] => 1
    [1] => 2
    [2] => 3
    [3] => 4
    [4] => 5
    [5] => 6
)
`,
  },

  keyPoints: [
    "`??=` (PHP 7.4) assigns the right side **only** when the left is `null` or undefined — and evaluates it lazily.",
    "`[...$a, ...$b]` (PHP 7.4) spreads arrays inside literals, replacing many `array_merge` calls.",
    "In 7.4 array spread is **integer-keyed only**; PHP **8.1** added string-key support (later keys win).",
    "Spread renumbers integer keys from 0 like `array_merge` — not like the `+` union operator.",
    "Numeric separators (`1_000_000`) are cosmetic: the engine strips the `_`, so the value is unchanged.",
  ],

  interview: [
    {
      q: "How does `??=` differ from `=` and from a plain `??`?",
      a: "`$a ??= $b` is shorthand for `$a = $a ?? $b`, so it assigns **only when `$a` is null or undefined** — an existing non-null value is left alone. Unlike a plain `??` (which is an expression that just *returns* a value), `??=` *mutates* the left side. And unlike `||=`-style tricks people fake with `?:`, it checks for null/unset specifically (so `0`, `''`, and `false` are all kept). It also short-circuits: the right operand is evaluated only when the assignment actually happens, which matters if it's an expensive call. Added in PHP 7.4.",
    },
    {
      q: "When would you reach for `[...$a, ...$b]` instead of `array_merge`?",
      a: "For **numeric/list** arrays it's the same result with cleaner syntax, and it composes nicely inside a literal (`[$first, ...$rest, $last]`). Watch the key rules: in PHP 7.4 spread only accepts **integer keys** — spreading a string-keyed array is a fatal error — and integer keys are renumbered from 0. PHP **8.1** lifted the restriction so string keys work too, with later keys overriding earlier ones, matching `array_merge`. If you need string-key merging on 7.4, stick with `array_merge`.",
    },
    {
      q: "Is `1_000_000` a new number type or special parsing?",
      a: "Neither — it's the **same integer** `1000000`. Numeric literal separators (PHP 7.4) just let you place underscores **between digits** for readability; the lexer strips them. `1_000_000 === 1000000` is `true`. The only rules are that an underscore must sit between two digits — you can't lead, trail, or double them, and you can't put one next to the `.`, `x`, `e`, or sign. They work in decimal, hex, octal, binary, and floats.",
    },
    {
      q: "What's the difference between array spread and the `+` array union operator?",
      a: "Both combine arrays, but they handle keys differently. The `+` operator keeps the value from the **left** operand for any duplicate key and **preserves** keys. Spread (and `array_merge`) **renumber integer keys** from 0, so `[...$a, ...$b]` appends `$b`'s values after `$a`'s rather than colliding on shared integer keys. For string keys (8.1+), spread lets the **later** value win — the opposite of `+`. So `[0=>'a'] + [0=>'b']` is `['a']`, but `[...[0=>'a'], ...[0=>'b']]` is `['a','b']`.",
    },
  ],

  quiz: [
    {
      question: "What does `$x['k'] ??= compute();` do when `$x['k']` is already `0`?",
      options: [
        "Reassigns `$x['k']` to the result of `compute()`",
        "Leaves `$x['k']` as `0` and never calls `compute()`",
        "Throws because the key exists",
        "Leaves `$x['k']` as `0` but still calls `compute()`",
      ],
      answerIndex: 1,
      explain:
        "`??=` only assigns when the left side is null or undefined. `0` is a set, non-null value, so the assignment is skipped and the right-hand `compute()` is never evaluated.",
    },
    {
      question: "In PHP 7.4, what happens with `[...['a' => 1], ...['b' => 2]]`?",
      options: [
        "Returns `['a' => 1, 'b' => 2]`",
        "Returns `[1, 2]` with renumbered keys",
        "Throws a fatal error — string keys aren't allowed",
        "Returns `['a' => 1]` only",
      ],
      answerIndex: 2,
      explain:
        "Array spread in 7.4 supports integer keys only; spreading a string-keyed array is a fatal error. String-key spread was added in PHP 8.1.",
    },
    {
      question: "What is the value of `0xCA_FE === 0xCAFE`?",
      options: [
        "`false` — the underscore changes the value",
        "`true` — separators are stripped and the values are identical",
        "A parse error — underscores aren't allowed in hex",
        "`true`, but only on PHP 8.0+",
      ],
      answerIndex: 1,
      explain:
        "Numeric literal separators (PHP 7.4) are cosmetic and work in hex, octal, binary, decimal, and floats. The engine strips the underscores, so `0xCA_FE` and `0xCAFE` are the same integer.",
    },
  ],
};

export default lesson;
