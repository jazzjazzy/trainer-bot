import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "modern-syntax",
  title: "Modern Syntax & Operators",
  part: "Modern Runtime & Async",
  estMinutes: 14,
  summary:
    "The everyday ergonomic syntax — destructuring, spread/rest, template literals, optional chaining and nullish coalescing — that makes modern TypeScript far terser than the PHP you're used to.",

  concept: `
Most of what makes day-to-day TypeScript feel different from PHP isn't the type
system — it's a handful of small syntax features you'll use in nearly every
function. Modern PHP has picked up several of these too (\`??\`, \`?->\`, spread),
so a lot of this will feel like coming home.

### Destructuring

Pull values out of arrays and objects into variables in one move. Array
destructuring is positional (like PHP's \`list()\`/\`[$a, $b] = ...\`). Object
destructuring is by **key**, with optional **renaming** and **defaults**.

\`\`\`ts
const [first, second] = [10, 20];           // first=10, second=20
const { id, name: userName, role = "guest" } = user;
// userName is the renamed "name"; role falls back to "guest" if undefined
\`\`\`

### Spread and rest (\`...\`)

The same three dots do two opposite jobs:

- **Spread** — *expand* an array/object into another: \`[...a, ...b]\`,
  \`{ ...defaults, ...overrides }\`. Later keys win, so it's perfect for merging
  config.
- **Rest** — *collect* leftovers: \`function log(first, ...others)\` gathers the
  remaining arguments into a real array (no \`func_get_args()\` needed).

### Template literals

Backtick strings with \`\${expression}\` interpolation and real multi-line
support — PHP's \`"Hello $name"\` taken further.

\`\`\`ts
const msg = \`Hi \${name}, you have \${count + 1} messages\`;
\`\`\`

### Optional chaining (\`?.\`)

Safely read down a chain that might hit \`null\`/\`undefined\`. If any link is
nullish, the whole expression short-circuits to \`undefined\` instead of throwing.
This is PHP 8's nullsafe \`?->\`.

\`\`\`ts
const city = user?.address?.city; // undefined if user or address is missing
\`\`\`

### Nullish coalescing (\`??\`)

Provide a fallback **only** when the left side is \`null\` or \`undefined\` — *not*
for every falsy value. This is the exact same operator (and semantics) as PHP's
\`??\`. Pair it with \`?.\`: \`user?.name ?? "Anonymous"\`.

### Short-circuit evaluation

\`&&\` returns the first falsy operand (or the last value); \`||\` returns the first
truthy one. This is **not** PHP: there \`&&\`/\`||\` always return a plain \`bool\`
(\`0 || 'x'\` is \`true\`, not \`'x'\`) — PHP's value-returning equivalent is \`?:\`.
The key gotcha: \`||\` treats \`0\`, \`""\` and
\`false\` as "missing", whereas \`??\` does not — reach for \`??\` when \`0\` or \`""\`
are legitimate values.
`,

  comparisons: [
    {
      label: "Destructuring",
      intro:
        "We have a coordinate pair and a user record, and we want to unpack their parts into named variables in one statement. Expect first/second to hold 10 and 20, and the user's name and role pulled out directly (role falling back to 'guest' if absent).",
      php: `<?php
// Array, positional:
[$first, $second] = [10, 20];

// By key — the target variable can be renamed, but no defaults:
['name' => $userName, 'role' => $role] = $user;`,
      ts: `// Array, positional:
const [first, second] = [10, 20];

// Object: by key, with rename + default:
const { name: userName, role = "guest" } = user;`,
      note:
        "TS object destructuring supports renaming (name: userName) and per-field defaults; PHP's keyed destructuring can rename ('name' => $userName) but has no defaults.",
    },
    {
      label: "Spread / rest with ...",
      intro:
        "We want a sum() that accepts any number of arguments, plus a way to combine two arrays and merge two config objects. The result is one flexible function and merged collections where overrides take precedence.",
      php: `<?php
function sum(...$nums) {        // rest: collect args
    return array_sum($nums);
}
$all = [...$a, ...$b];          // spread arrays (PHP 7.4+)
$merged = [...$defaults, ...$overrides]; // string keys: 8.1+`,
      ts: `function sum(...nums: number[]): number {  // rest
  return nums.reduce((t, n) => t + n, 0);
}
const all = [...a, ...b];                    // spread arrays
const merged = { ...defaults, ...overrides }; // spread objects`,
      note:
        "Same ... syntax and semantics. In TS, object spread is everyday; PHP only gained string-keyed array spread in 8.1.",
    },
    {
      label: "String interpolation",
      intro:
        "We're building a greeting that embeds a name and a computed value (count plus one) directly inside a string. The outcome is a single readable message line without manual concatenation.",
      php: `<?php
$msg = "Hi $name, you have " . ($count + 1) . " messages";
// or:
$msg = "Hi {$name}, total: {$obj->total}";`,
      ts: `const msg = \`Hi \${name}, you have \${count + 1} messages\`;`,
      note:
        "TS uses backticks and \\${ ... } which can hold any expression; PHP's double-quote interpolation needs {$...} for anything beyond a bare variable.",
    },
    {
      label: "Nullsafe access (?-> vs ?.)",
      intro:
        "We want to read a city deep inside a user object where the user or their address might be missing. The expected result is the city when present, and a safe nullish value (rather than a crash) when any link in the chain is absent.",
      php: `<?php
// PHP 8.0+ nullsafe operator:
$city = $user?->address?->city; // null if any link is null`,
      ts: `const city = user?.address?.city; // undefined if any link is nullish`,
      note:
        "Essentially identical. PHP yields null on a null link; TS yields undefined. JS ?. also works for calls (fn?.()) and indexes (arr?.[i]).",
    },
    {
      label: "Nullish coalescing (the SAME operator)",
      intro:
        "We want sensible fallbacks for a role and a name that may not be set on the user. Expect 'guest' and 'Anonymous' to appear only when those values are genuinely null or undefined.",
      php: `<?php
$role = $user['role'] ?? 'guest';   // PHP 7+
// also works with chains:
$name = $user?->name ?? 'Anonymous';`,
      ts: `const role = user.role ?? "guest";
const name = user?.name ?? "Anonymous";`,
      note:
        "?? behaves identically in both: it falls back only on null/undefined, NOT on 0, '' or false. Use ?? instead of || when 0 or '' are valid.",
    },
  ],

  playground: {
    intro:
      "Object destructuring with rename + default, an object spread merge, and ?. with ?? for a value that might be missing. Run it, then try setting nickname to '' to see why ?? differs from ||.",
    code: `type User = {
  name: string;
  nickname?: string;
  address?: { city: string };
};

const user: User = { name: "Ada", address: { city: "London" } };

// Destructure with rename + default:
const { name: fullName, nickname = "(none)" } = user;
console.log("name:", fullName, "| nickname:", nickname);

// Spread merge — later keys win:
const defaults = { theme: "light", fontSize: 14 };
const overrides = { fontSize: 18 };
const settings = { ...defaults, ...overrides };
console.log("settings:", settings); // fontSize is 18

// Optional chaining + nullish coalescing on a possibly-missing value:
const city = user?.address?.city ?? "Unknown";
console.log("city:", city);

const missing: User = { name: "Grace" };
console.log("missing city:", missing?.address?.city ?? "Unknown");

// Why ?? beats || : 0 is a real value, not "missing"
const count = 0;
console.log("with ?? :", count ?? 99); // 0
console.log("with || :", count || 99); // 99`,
  },

  keyPoints: [
    "Destructuring unpacks arrays (positional) and objects (by key) — objects support **renaming** (`name: x`) and **defaults** (`role = 'guest'`).",
    "`...` does double duty: **spread** to expand/merge (`{ ...a, ...b }`, later keys win) and **rest** to collect (`(...args)`).",
    "Template literals use backticks with `${expr}` and are multi-line — the upgrade of PHP's `\"$name\"` interpolation.",
    "`?.` (optional chaining) short-circuits to `undefined` on a nullish link instead of throwing — JS's version of PHP's `?->`.",
    "`??` is the **same operator as PHP's `??`**: it falls back only on `null`/`undefined`, never on `0`, `''` or `false`.",
    "Prefer `??` over `||` whenever `0`, `''`, or `false` are legitimate values you want to keep.",
  ],

  interview: [
    {
      q: "What's the difference between `??` and `||`, and when does it bite you?",
      a: "`||` returns the right side whenever the left is **falsy** — that includes `0`, `''`, `false`, and `NaN`. `??` returns the right side only when the left is `null` or `undefined`. The classic bug: `const port = config.port || 3000` silently rewrites a configured port of `0` to `3000`. Using `?? 3000` keeps the legitimate `0`. PHP developers already know `??` — it behaves exactly the same there.",
    },
    {
      q: "How does optional chaining (`?.`) compare to PHP's nullsafe operator?",
      a: "Both let you read down a chain that might contain a null link without an exception. `$user?->address?->city` in PHP and `user?.address?.city` in TS short-circuit the moment a link is null/undefined. Two notes: PHP returns `null`, TS returns `undefined`; and JS's `?.` is more flexible — it also guards calls (`callback?.()`) and dynamic indexes (`arr?.[i]`), which PHP's `?->` does not.",
    },
    {
      q: "Explain spread vs rest, given they use the same `...` token.",
      a: "Context decides. In a **value position** (building an array/object or passing arguments), `...` is **spread** — it expands a collection: `[...a, ...b]` or `fn(...args)`. In a **binding position** (function parameters or the tail of a destructuring pattern), `...` is **rest** — it collects leftovers into a new array: `function log(first, ...others)`. Spread expands; rest gathers. PHP has both too (`...$args` for variadics, `[...$a, ...$b]` for array spread).",
    },
    {
      q: "Can you give a default while destructuring, and when does it apply?",
      a: "Yes: `const { role = 'guest' } = user`. The default applies **only when the value is `undefined`** — a missing key, or an explicit `undefined`. It does **not** apply for `null`, `0`, or `''`. You can combine renaming and defaults: `const { name: userName = 'Anon' } = user`. This mirrors PHP function-parameter defaults, which also only kick in when the argument is absent.",
    },
  ],

  quiz: [
    {
      question: "What does `const count = 0; const result = count ?? 10;` assign to `result`?",
      options: ["10", "0", "undefined", "null"],
      answerIndex: 1,
      explain:
        "`??` only falls back when the left side is null or undefined. `0` is neither, so it is kept. (With `||` you'd get 10, because 0 is falsy.)",
    },
    {
      question:
        "Given `const merged = { ...{ a: 1, b: 2 }, ...{ b: 9 } };`, what is `merged`?",
      options: [
        "{ a: 1, b: 2 }",
        "{ a: 1, b: 9 }",
        "{ a: 1, b: 2, b: 9 }",
        "An error — duplicate key b",
      ],
      answerIndex: 1,
      explain:
        "Object spread merges left to right and later keys overwrite earlier ones, so b becomes 9. Duplicate keys are not an error.",
    },
    {
      question:
        "What does `user?.address?.city` evaluate to when `user` is `{ name: 'Ada' }` (no address)?",
      options: [
        "It throws a TypeError",
        "An empty string",
        "undefined",
        "null",
      ],
      answerIndex: 2,
      explain:
        "Optional chaining short-circuits at the nullish link (address is undefined) and the whole expression evaluates to undefined rather than throwing.",
    },
  ],
};

export default lesson;
