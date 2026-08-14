import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "union-types",
  title: "Union Types: Saying \"int or string\" for Real",
  part: "PHP 8.0: The Big Leap",
  estMinutes: 12,

  summary:
    "PHP 8.0 lets you declare a parameter or return as int|string in the signature itself, turning docblock unions and `mixed` guesses into engine-enforced types.",

  concept: `
In 5.5 a function that accepted *either* an \`int\` or a \`string\` had exactly two
choices: type-hint nothing (and hope), or write the union in a **docblock** that
the engine completely ignores. PHP 8.0 made unions a **first-class part of the
type system**: \`int|string\`, \`Order|null\`, \`Response|false\` — all enforced at
call time.

### The new spelling

A union type is two or more types joined with \`|\`. It's legal anywhere a single
type is: parameters, return types, and (since 7.4) typed properties.

\`\`\`php
function format(int|string $id): string { /* ... */ }
\`\`\`

Under \`declare(strict_types=1)\`, pass a \`float\` and you get a \`TypeError\` — the same
enforcement you'd get from a single scalar hint, now spanning several accepted types.
(In the default coercive mode the float is coerced instead, following the
int → float → string → bool preference order, so \`42.1\` arrives as \`int(42)\`.)

### \`Foo|null\` and \`?Foo\` are the same thing

Nullable types \`?Foo\` (7.1) are really just sugar for the two-member union
\`Foo|null\`. In 8.0 you can write either:

- \`?Order\` — the classic nullable shorthand.
- \`Order|null\` — the explicit union (and the **only** form once a *third*
  member appears, e.g. \`Order|Cart|null\`).

You can't mix them: \`?Order|Cart\` is a parse error. Pick the union form when
there's more than one non-null type.

### The \`false\` pseudo-type

Many old PHP functions return a value *or* \`false\` on failure
(\`strpos\`, \`file_get_contents\`, …). PHP 8.0 lets you model that exactly with
\`false\` as a union member:

\`\`\`php
function find(string $needle): int|false { /* like strpos */ }
\`\`\`

\`false\` (and \`null\`) may only appear **as part of a union** in 8.0 — \`true\`,
\`false\`, and \`null\` only became standalone types in **8.2**.

### Narrowing at runtime

A union tells the *caller* what's allowed; inside the function you still have to
disambiguate before using a value. Reach for the tools you already know —
\`is_int()\`/\`is_string()\`, \`instanceof\`, or a \`match (true)\` ladder:

\`\`\`php
$label = match (true) {
    is_int($id)    => "#\$id",
    is_string($id) => $id,
};
\`\`\`

The win over 5.5: the union is checked **at the boundary**, so by the time you're
narrowing you already know the value is one of the declared types — not "literally
anything someone passed in".
`,

  comparisons: [
    {
      label: "Accepting int OR string",
      intro:
        "A format helper that should accept an ID given as either a number or a string. The goal is to reject anything that isn't one of those two types, ideally the moment it's passed.",
      php: `<?php
// PHP 5.5 — the union lives in a docblock the engine ignores
/**
 * @param int|string $id
 * @return string
 */
function format($id) {
    return (string) $id;
}

// Nothing stops a caller passing an array:
format([1, 2, 3]); // runs, then explodes later`,
      ts: `<?php
declare(strict_types=1);

// PHP 8.0 — the union is part of the signature and enforced
function format(int|string $id): string {
    return (string) $id;
}

format([1, 2, 3]); // TypeError at the call, immediately`,
      note:
        "Union types in a real signature arrived in PHP 8.0; the docblock @param int|string was never checked by the engine.",
    },
    {
      label: "Nullable return",
      intro:
        "A lookup that returns a User for a valid id but null when nothing matches. We want the signature itself to advertise that the result may be null.",
      php: `<?php
// PHP 5.5 — no nullable syntax at all; document it and hope
/**
 * @return User|null
 */
function findUser($id) {
    return $id > 0 ? new User($id) : null;
}`,
      ts: `<?php
// PHP 8.0 — ?User and User|null are identical
function findUser(int $id): ?User {
    return $id > 0 ? new User($id) : null;
}
// equivalently: function findUser(int $id): User|null`,
      note:
        "Nullable shorthand ?User came in 7.1; writing it as the union User|null was added in 8.0. Use the union form when there's more than one non-null type.",
    },
    {
      label: "Modelling \"value or false\"",
      intro:
        "Wrapping strpos to find a substring's position, which returns an integer index or false when the substring isn't there. The aim is for the return type to state that false-on-failure behaviour precisely.",
      php: `<?php
// PHP 5.5 — return type can't be expressed; caller guesses
/**
 * @return int|bool   (really int|false)
 */
function indexOf($haystack, $needle) {
    return strpos($haystack, $needle);
}`,
      ts: `<?php
// PHP 8.0 — the false pseudo-type says exactly what happens
function indexOf(string $haystack, string $needle): int|false {
    return strpos($haystack, $needle);
}`,
      note:
        "The false pseudo-type as a union member arrived in PHP 8.0; standalone true/false/null types only landed in PHP 8.2.",
    },
    {
      label: "Narrowing the union inside the body",
      intro:
        "Rendering a label from an id that may be an int or a string, formatting each case differently. Inside the body we need to tell the two cases apart and produce the right string.",
      php: `<?php
// PHP 5.5 — defensive checks because $id could be anything
function render($id) {
    if (is_int($id)) {
        return '#' . $id;
    }
    if (is_string($id)) {
        return $id;
    }
    throw new InvalidArgumentException('bad id');
}`,
      ts: `<?php
// PHP 8.0 — union guarantees the type; match(true) narrows cleanly
function render(int|string $id): string {
    return match (true) {
        is_int($id)    => '#' . $id,
        is_string($id) => $id,
    };
}`,
      note:
        "match (true) (PHP 8.0) replaces the if-ladder; because the union is enforced at the boundary, no 'bad id' fallback is needed.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A union-typed parameter narrowed with match(true), plus a function that returns int|false. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

function label(int|string $id): string {
    return match (true) {
        is_int($id)    => "int #{$id}",
        is_string($id) => "string '{$id}'",
    };
}

// strpos-style: an int position, or false when not found
function indexOf(string $haystack, string $needle): int|false {
    return strpos($haystack, $needle);
}

echo label(42), "\\n";
echo label('A7'), "\\n";

$pos = indexOf('hello', 'l');
var_dump($pos);

$miss = indexOf('hello', 'z');
var_dump($miss);

// ?User is the same as User|null — here just on a scalar union
$role = null;
echo ($role ?? 'guest'), "\\n";`,
    output: `int #42
string 'A7'
int(2)
bool(false)
guest`,
  },

  keyPoints: [
    "Union types (`int|string`, `Foo|null`) arrived in **PHP 8.0** and are enforced at call time — no more ignored docblock `@param` unions.",
    "`?Foo` and `Foo|null` mean the same thing; use the explicit union once there's a second non-null member (`Foo|Bar|null`).",
    "You can't mix the two notations: `?Foo|Bar` is a parse error — write `Foo|Bar|null`.",
    "`false` (and `null`) may appear as **union members** in 8.0; standalone `true`/`false`/`null` types only came in **8.2**.",
    "A union constrains the caller; inside the body you still narrow with `is_*()`, `instanceof`, or `match (true)`.",
    "Redundant or contradictory unions are rejected (`int|int`, `bool|false`), and `void`/`never` can't be union members.",
  ],

  interview: [
    {
      q: "What's the difference between a docblock `@param int|string` in PHP 5.5 and a real `int|string` union in 8.0?",
      a: "The docblock is **documentation only** — the engine never reads it, so a caller can pass anything and you find out at runtime (or never). The 8.0 union is part of the **type system**: passing a value that's neither `int` nor `string` raises a `TypeError` at the call boundary, exactly like a single scalar hint would. IDEs and static analysers used the docblock for 5.5 code, but only the real union is enforced by PHP itself.",
    },
    {
      q: "How does `Foo|null` relate to `?Foo`? When would you prefer one?",
      a: "They're **identical** — `?Foo` is shorthand for the two-member union `Foo|null`, which is why nullable types (7.1) predate general unions (8.0). Prefer `?Foo` for the common single-type-or-null case because it's terse. Switch to the explicit `Foo|Bar|null` union the moment you have **more than one** non-null type, since the `?` shorthand only covers a single type. Note you can't combine them: `?Foo|Bar` is a parse error.",
    },
    {
      q: "What is the `false` pseudo-type and why does PHP have it?",
      a: "`false` lets a union say a function returns a real value *or* the literal `false` on failure — e.g. `int|false` for a `strpos`-style function. It exists because huge swathes of the standard library return `false` to signal failure, and `int|bool` would wrongly imply `true` is also possible. In **8.0**, `false` (and `null`) are only valid **inside a union**; **8.2** later allowed `false`, `true`, and `null` as standalone types.",
    },
    {
      q: "Once a parameter is `int|string`, how do you safely use it inside the function?",
      a: "You **narrow** it first, because the union only guarantees it's one of those types, not which one. Use `is_int()`/`is_string()` (or `instanceof` for class unions), commonly as a `match (true)` ladder or `if`/`elseif`. The upside over 5.5 is that the union is enforced at the boundary, so you don't need a defensive 'else throw' for unexpected types — the engine already rejected those before your code ran.",
    },
    {
      q: "Are there union combinations PHP rejects?",
      a: "Yes. The compiler rejects **redundant** or **contradictory** unions: `int|int`, `bool|false` (since `false` is already part of `bool`), and duplicate class names. `void` and `never` can't be union members because they describe the *absence* of a return, not a value. And you can't mix nullable shorthand with `|`, so `?int|string` won't parse — write `int|string|null`.",
    },
  ],

  quiz: [
    {
      question: "In PHP 8.0, which of these is equivalent to the parameter type `?User`?",
      options: ["`User|void`", "`User|null`", "`User|false`", "`User|mixed`"],
      answerIndex: 1,
      explain:
        "`?User` is just shorthand for the two-member union `User|null`. `void` can't be a union member, `false` is a different pseudo-type, and `mixed` already includes everything.",
    },
    {
      question: "Which statement about the `false` type is correct?",
      options: [
        "`false` could be used as a standalone return type starting in PHP 8.0.",
        "`false` may appear as a union member in PHP 8.0, but became a standalone type only in PHP 8.2.",
        "`false` is the same as `bool` and the two can be unioned together.",
        "`false` has never been a valid type in PHP.",
      ],
      answerIndex: 1,
      explain:
        "PHP 8.0 allowed `false` (and `null`) only as part of a union, e.g. `int|false`. Standalone `false`/`true`/`null` types arrived in PHP 8.2. `bool|false` is rejected as redundant.",
    },
    {
      question: "You have `function f(int|string $x)`. What's the idiomatic way to handle `$x` inside the body?",
      options: [
        "Nothing — the union auto-converts `$x` to a single type.",
        "Cast it with `(array) $x` to be safe.",
        "Narrow with `is_int($x)` / `is_string($x)` (e.g. in a `match (true)`) before using it.",
        "Re-declare the type inside the function with `int $x`.",
      ],
      answerIndex: 2,
      explain:
        "A union enforces the type at the boundary but doesn't pick one for you. You narrow at runtime with `is_*()`/`instanceof`, commonly via a `match (true)` ladder, before treating `$x` as a specific type.",
    },
  ],
};

export default lesson;
