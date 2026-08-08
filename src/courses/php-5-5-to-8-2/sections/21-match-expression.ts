import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "match-expression",
  title: "match: the switch That Returns a Value",
  part: "PHP 8.0: The Big Leap",
  estMinutes: 12,
  summary:
    "PHP 8.0's match is an expression that returns a value, compares with strict ===, never falls through, and throws when nothing matches — everything switch should have been.",

  concept: `
You've written a thousand \`switch\` statements, and you've been bitten by every
one of \`switch\`'s sharp edges: a forgotten \`break\` that falls through, loose
\`==\` matching \`0\` against the string \`"a"\`, and the fact that it's a
*statement* so you have to assign a variable inside each \`case\`. PHP 8.0's
**\`match\`** fixes all of it.

### What changed

\`match\` is an **expression** — it evaluates to a value you can assign or
return directly:

\`\`\`php
$label = match ($status) {
    'draft', 'pending' => 'Not live',   // multiple conditions per arm
    'published'        => 'Live',
    default            => 'Unknown',
};
\`\`\`

Four things to internalise versus \`switch\`:

- **It returns a value.** No more declaring a variable and assigning it in every branch.
- **It uses strict \`===\` comparison.** \`match (0)\` will *not* match the arm
  \`"a"\` the way \`switch (0)\` does. No type juggling, no surprises.
- **No fall-through, no \`break\`.** Each arm is self-contained; exactly one runs.
- **It's exhaustive.** If no arm matches and there's no \`default\`, it throws
  \`\\UnhandledMatchError\` instead of silently doing nothing.

### match vs switch at a glance

| | \`switch\` | \`match\` (8.0) |
|---|---|---|
| Kind | statement | expression (returns a value) |
| Comparison | loose \`==\` | strict \`===\` |
| Fall-through | yes (needs \`break\`) | no — one arm only |
| Multiple labels | stacked \`case\`s | comma-separated in one arm |
| No match | silently continues | throws \`UnhandledMatchError\` |

### Upgrade gotchas

- \`match\` is a **reserved keyword** in 8.0. If you had a function or method
  named \`match()\`, it still works as a *method* call (\`$x->match()\`), but a
  plain function named \`match\` must be renamed.
- Because comparison is strict, porting a \`switch\` that *relied* on \`==\`
  (e.g. matching \`"1"\` against integer \`1\`) will change behaviour — cast
  deliberately or keep the \`switch\`.
- Every \`match\` arm is a single expression. If a branch needs several
  statements, call a function from the arm or stick with \`switch\`.
`,

  comparisons: [
    {
      label: "Mapping a value",
      intro:
        "We want to turn a status string into a human-readable label. The result should be 'Live' for a published post and 'Unknown' for anything unexpected.",
      php: `<?php
// PHP 5.5 — switch is a statement: declare, then assign in each case
switch ($status) {
    case 'draft':
        $label = 'Not live';
        break;
    case 'published':
        $label = 'Live';
        break;
    default:
        $label = 'Unknown';
}`,
      ts: `<?php
// PHP 8.0 — match is an expression that returns a value
$label = match ($status) {
    'draft'     => 'Not live',
    'published' => 'Live',
    default     => 'Unknown',
};`,
      note:
        "match (PHP 8.0) returns a value you assign directly, removing the per-case variable assignment switch forces on you.",
    },
    {
      label: "Multiple conditions per branch",
      intro:
        "Several HTTP status codes (200, 201, 204) should all be classified the same way. The goal is to map any of those codes to 'success' and everything else to 'other'.",
      php: `<?php
// PHP 5.5 — stacked, empty case labels fall through to one body
switch ($code) {
    case 200:
    case 201:
    case 204:
        $kind = 'success';
        break;
    default:
        $kind = 'other';
}`,
      ts: `<?php
// PHP 8.0 — comma-separated conditions in a single arm
$kind = match ($code) {
    200, 201, 204 => 'success',
    default       => 'other',
};`,
      note:
        "match (PHP 8.0) lists several conditions in one arm with commas instead of relying on switch's deliberate fall-through.",
    },
    {
      label: "Strict comparison",
      intro:
        "Here the input is the integer 0 and we check whether it equals the string 'admin' to grant access. Since 0 is clearly not an admin, the access level should come out as 'none'.",
      php: `<?php
// PHP 5.5 — switch uses loose ==, so 0 matches the string 'admin'!
switch ($input) {        // $input = 0
    case 'admin':
        $access = 'full';
        break;
    default:
        $access = 'none';
}
// $access === 'full'  — surprise bug from 0 == 'admin'`,
      ts: `<?php
// PHP 8.0 — match uses strict ===, so 0 never equals 'admin'
$access = match ($input) {  // $input = 0
    'admin' => 'full',
    default => 'none',
};
// $access === 'none'  — no type juggling`,
      note:
        "match (PHP 8.0) compares with ===, eliminating the loose-comparison bugs switch inherits from ==.",
    },
    {
      label: "Catching the unhandled case",
      intro:
        "We map a user role to a home page, but the incoming role is 'banned', which no branch handles. We want that unhandled case to be obvious rather than quietly leaving the home page unset.",
      php: `<?php
// PHP 5.5 — no default means a missing case silently does nothing
switch ($role) {         // $role = 'banned'
    case 'user':
        $home = '/dashboard';
        break;
    case 'admin':
        $home = '/admin';
        break;
}
// $home is now undefined — a notice waiting to happen`,
      ts: `<?php
// PHP 8.0 — no matching arm and no default throws UnhandledMatchError
$home = match ($role) {   // $role = 'banned'
    'user'  => '/dashboard',
    'admin' => '/admin',
};
// throws \\UnhandledMatchError: fail loudly, not silently`,
      note:
        "match (PHP 8.0) is exhaustive: an unmatched value with no default throws UnhandledMatchError instead of leaving a variable unset.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Read the match expressions, predict each line of output, then reveal it.",
    code: `<?php
declare(strict_types=1);

function httpKind(int $code): string {
    return match (true) {
        $code >= 200 && $code < 300 => 'success',
        $code >= 400 && $code < 500 => 'client error',
        $code >= 500               => 'server error',
        default                    => 'other',
    };
}

// match (true) lets each arm be a boolean condition:
echo httpKind(204) . "\\n";
echo httpKind(404) . "\\n";
echo httpKind(503) . "\\n";

// Strict comparison: the string '1' does NOT match integer 1.
$value = '1';
$matched = match ($value) {
    1       => 'int one',
    '1'     => 'string one',
    default => 'neither',
};
echo $matched . "\\n";

// Exhaustiveness: catch the throw when nothing matches.
try {
    echo match (99) {
        1 => 'one',
        2 => 'two',
    };
} catch (\\UnhandledMatchError $e) {
    echo "no arm matched 99\\n";
}`,
    output: `success
client error
server error
string one
no arm matched 99`,
  },

  keyPoints: [
    "`match` (PHP 8.0) is an **expression**: it returns a value you assign or return, unlike the statement-only `switch`.",
    "Comparison is **strict (`===`)** — no loose-`==` surprises like `0 == 'admin'`.",
    "**No fall-through, no `break`** — exactly one arm runs, so a forgotten `break` can't bite you.",
    "One arm can list **multiple comma-separated conditions** instead of stacked empty `case`s.",
    "It's **exhaustive**: an unmatched value with no `default` throws `\\UnhandledMatchError` rather than silently continuing.",
    "`match (true)` lets each arm be a boolean condition — a clean replacement for if/elseif chains.",
  ],

  interview: [
    {
      q: "What are the core differences between `match` and `switch`?",
      a: "`match` (PHP 8.0) is an **expression** that returns a value, while `switch` is a statement. `match` uses **strict `===`** comparison; `switch` uses loose `==`. `match` has **no fall-through** (no `break` needed — exactly one arm runs) and is **exhaustive**: if nothing matches and there's no `default`, it throws `\\UnhandledMatchError` instead of silently doing nothing. `match` also allows **multiple conditions per arm** via commas.",
    },
    {
      q: "When would you still reach for `switch` over `match`?",
      a: "When a branch needs **several statements** rather than a single expression — `match` arms are expressions, so you can't run a multi-line block directly (you'd have to extract a function). `switch` is also the right tool if you genuinely **want loose `==` comparison** or deliberate **fall-through** behaviour. For value mapping, classification, and returning a result, `match` is almost always cleaner.",
    },
    {
      q: "What is `match (true)` and why is it useful?",
      a: "Because `match` compares the subject strictly against each arm's condition, using `true` as the subject means each arm is itself a **boolean expression**, and the first arm that evaluates to `true` wins. It's an idiomatic replacement for a long `if`/`elseif` chain — for example classifying an HTTP status code by range: `match (true) { $code < 300 => 'ok', $code < 500 => 'client error', ... }`.",
    },
    {
      q: "What's the upgrade risk when converting a `switch` to a `match`?",
      a: "The big one is the **strict comparison**. A `switch` that quietly relied on `==` — matching integer `1` against string `'1'`, or `0` against a non-numeric string — will behave differently under `match`'s `===`. You must cast deliberately or leave that `switch` alone. Also, `match` is a **reserved keyword** in 8.0, so a plain function named `match` must be renamed (methods named `match` are still fine).",
    },
    {
      q: "What happens if no arm matches and there's no `default`?",
      a: "`match` throws `\\UnhandledMatchError` (which extends `\\Error`). This is a feature, not a bug: it surfaces an unhandled case loudly at the point of failure, whereas a `switch` without a `default` would simply fall through and leave your result variable unset — a silent bug that often only shows up later as an 'undefined variable' notice.",
    },
  ],

  quiz: [
    {
      question: "What does `match` use to compare the subject against each arm's condition?",
      options: [
        "Loose comparison (`==`)",
        "Strict comparison (`===`)",
        "Type coercion identical to `switch`",
        "The spaceship operator (`<=>`)",
      ],
      answerIndex: 1,
      explain:
        "`match` (PHP 8.0) uses strict `===` comparison, so `0` won't match a non-numeric string and `'1'` won't match integer `1` — unlike `switch`, which uses loose `==`.",
    },
    {
      question: "A `match` expression has no matching arm and no `default`. What happens?",
      options: [
        "It returns `null`",
        "It falls through to the next statement, leaving the result unset",
        "It throws `\\UnhandledMatchError`",
        "It is a fatal parse error",
      ],
      answerIndex: 2,
      explain:
        "`match` is exhaustive: with no matching arm and no `default`, it throws `\\UnhandledMatchError` (a subclass of `\\Error`) at runtime, surfacing the unhandled case loudly.",
    },
    {
      question: "Which of these is true of `match` but NOT of `switch`?",
      options: [
        "It can have a `default` branch",
        "It is an expression that returns a value, with no fall-through",
        "It can compare strings",
        "It requires a `break` after each branch",
      ],
      answerIndex: 1,
      explain:
        "`match` (PHP 8.0) is an expression that evaluates to a value and runs exactly one arm with no fall-through, so no `break` is needed. `switch` is a statement that falls through unless you `break`.",
    },
  ],
};

export default lesson;
