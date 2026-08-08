import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "nullable-and-void-types",
  title: "Nullable Types & void: Saying What You Mean",
  part: "PHP 7.1–7.4: Refinements",
  estMinutes: 11,

  summary:
    "PHP 7.1 added the `?Type` nullable syntax and the `void` return type, letting a signature finally state \"this may be null\" or \"this returns nothing\" instead of leaving you to guess.",

  concept: `
PHP 7.0 gave you scalar and return types, but it had two awkward gaps. There was
no way to say *"this parameter is an \`int\`, **or** \`null\`"*, and no way to say
*"this function returns **nothing**"*. PHP **7.1** closed both gaps with the
nullable \`?\` prefix and the \`void\` return type.

### Nullable types: \`?Type\`

Prefix any type with \`?\` to allow \`null\` in addition to that type. It works on
parameters, return types, and (from 7.4) typed properties.

\`\`\`php
function find(?int $id): ?User { /* ... */ }   // PHP 7.1+
\`\`\`

\`?int\` is exactly shorthand for the union \`int|null\` (which you couldn't write
literally until union types in 8.0). In **5.5** there was no nullable *syntax* at
all — the closest move was giving a parameter a default of \`null\`:

\`\`\`php
function find($id = null) { /* ... */ }   // PHP 5.5
\`\`\`

But that does something different: it makes the argument **optional**. A
nullable type keeps the argument **required** while *also* permitting \`null\` as a
value — two distinct ideas that 5.5 conflated.

### The default-null gotcha

Because of history, a 7.1+ parameter written \`int $id = null\` is *implicitly*
nullable — PHP treats it as \`?int\`. This is convenient but fuzzy, and it's
**deprecated in 8.4**. Be explicit: write \`?int $id = null\`.

### \`void\`: a function that returns nothing

\`void\` declares that a function returns no usable value. The body may use a bare
\`return;\` to exit early, but **\`return $x;\` is a fatal error**, and so is
\`return null;\`. Calling code that reads the result gets \`null\`, but the type
documents intent: this is called for its side effect.

\`\`\`php
function log_it(string $msg): void {
    file_put_contents('app.log', $msg, FILE_APPEND);
    // no return value allowed
}
\`\`\`

- \`void\` is a **return-only** type — you cannot type a parameter \`void\`.
- It is *not* nullable: \`?void\` is illegal.
- In 5.5 you simply omitted a return type and hoped the reader understood.

Together these let signatures finally carry the full truth: what may be absent,
and what comes back.
`,

  comparisons: [
    {
      label: "A parameter that may be null",
      intro:
        "A setAvatar function needs to accept a URL string but also handle the case where the caller passes null to clear the avatar. The goal is a signature that demands an argument yet still permits null as a valid value.",
      php: `<?php
// PHP 5.5 — no nullable syntax; a null default fakes it,
// but that also makes the argument optional.
function setAvatar($url = null) {
    if ($url === null) {
        // clear the avatar
    }
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 7.1 — required argument that explicitly accepts null
function setAvatar(?string $url): void {
    if ($url === null) {
        // clear the avatar
    }
}`,
      note:
        "The ?string nullable type arrived in PHP 7.1; unlike a null default it keeps the argument required while still permitting null.",
    },
    {
      label: "A lookup that might find nothing",
      intro:
        "A findUser function looks up a name by id and returns either the name or null when there is no match. We want the signature itself to advertise that a null result is possible.",
      php: `<?php
// PHP 5.5 — return type is invisible; callers must read the body
// (or a docblock) to learn it can return null.
function findUser($id) {
    return $id === 1 ? 'Ada' : null;
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 7.1 — the signature states "string or null"
function findUser(int $id): ?string {
    return $id === 1 ? 'Ada' : null;
}`,
      note:
        "Nullable return types (?string) landed in PHP 7.1; before that a return type couldn't be null at all, so you had to omit it.",
    },
    {
      label: "A side-effect function",
      intro:
        "An audit function writes an event to a log and hands nothing back to the caller. The aim is to make that no-return-value intent an explicit part of the contract rather than something the reader has to infer.",
      php: `<?php
// PHP 5.5 — no return type; intent ("returns nothing") is implicit.
function audit($event) {
    // write to a log...
    return;
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 7.1 — void makes "no return value" part of the contract
function audit(string $event): void {
    // write to a log...
    return; // bare return is fine; "return $x;" would be fatal
}`,
      note:
        "The void return type was added in PHP 7.1; it forbids returning a value and documents that the function exists for its side effect.",
    },
    {
      label: "Nullable on a property",
      intro:
        "A Profile class holds a bio that is sometimes a string and sometimes absent. We want the property declaration to spell out that it is a string-or-null value instead of leaving its type unstated.",
      php: `<?php
// PHP 5.5 — properties are untyped; null vs string is a runtime guess.
class Profile {
    public $bio; // could be a string, could be null — who knows
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 7.4 — typed property, explicitly nullable
class Profile {
    public ?string $bio = null;
}`,
      note:
        "Typed properties came in PHP 7.4, and the ?string nullable prefix works there too — an untyped property in 5.5 carried no such guarantee.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Nullable parameters, a nullable return, and a void function together. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

function findRole(int $id): ?string {
    $roles = [1 => 'admin', 2 => 'editor'];
    return $roles[$id] ?? null;   // may be a string or null
}

function describe(?string $role): void {
    // void: called for its echo side effect, returns nothing usable
    echo ($role ?? 'guest') . "\\n";
}

describe(findRole(1));   // 'admin'
describe(findRole(2));   // 'editor'
describe(findRole(99));  // null -> 'guest'

// A void function evaluates to null when you read its result:
var_dump(describe(findRole(99)));`,
    output: `admin
editor
guest
guest
NULL`,
  },

  keyPoints: [
    "Prefix any type with `?` to allow `null` too: `?string` is shorthand for `string|null` (PHP **7.1**).",
    "A nullable type keeps an argument **required** while permitting `null` — different from a `= null` default, which makes it **optional**.",
    "`void` (PHP **7.1**) means \"returns no value\": a bare `return;` is fine, but `return $x;` or `return null;` is a fatal error.",
    "`void` is return-only — you can't type a parameter `void`, and `?void` is illegal.",
    "`int $id = null` is implicitly nullable for backward compatibility, but it's **deprecated in 8.4** — write `?int $id = null` instead.",
    "Nullable also works on **typed properties** from PHP **7.4**: `public ?string $bio = null;`.",
  ],

  interview: [
    {
      q: "In PHP 5.5 you'd write `function f($x = null)`. How is that different from `function f(?string $x)` in 7.1?",
      a: "They solve different problems. `$x = null` gives the parameter a **default**, which makes it **optional** — you can call `f()` with no argument. `?string $x` is a **nullable type**: the argument is still **required** (you must pass something), but that something is allowed to be `null` as well as a string. 5.5 had no nullable syntax, so people overloaded the default-null trick to express \"can be null\", which conflated the two ideas. In modern code, if you want both — optional *and* nullable — you write `?string $x = null`.",
    },
    {
      q: "What exactly does a `void` return type guarantee, and what's illegal inside such a function?",
      a: "`void` (PHP 7.1) declares the function returns no usable value — it's called for its side effects. Inside, a **bare `return;`** is allowed (to bail out early), but **`return $value;` is a fatal error**, and so is `return null;` — even though `null` feels like \"nothing\", the engine rejects it. `void` is return-only: you can't annotate a parameter with it, and `?void` doesn't exist. If you actually read the call's result, you get `null`, but the type makes the intent explicit at the signature level.",
    },
    {
      q: "Is `?int` the same as `int|null`? Could you write `int|null` in PHP 7.1?",
      a: "Semantically yes — `?int` allows an `int` or `null`, which is exactly the union `int|null`. But you **could not** write `int|null` literally in 7.1; arbitrary **union types** didn't arrive until **PHP 8.0**. So from 7.1 to 7.4, `?Type` was the *only* way to express nullability, and it's limited to a single base type plus null. In 8.0+, `?int` and `int|null` are interchangeable, and you'd reach for full union syntax when you need more than one non-null type (e.g. `int|string|null`).",
    },
    {
      q: "Upgrading 5.5 code to 7.1+, you see `function g(int $n = null)`. Any concern?",
      a: "It works — when a typed parameter has a `null` default, PHP *implicitly* treats the type as nullable, so `g(null)` is accepted as if it were `?int`. But it's fuzzy and easy to misread, and PHP **8.4 deprecates** this implicit-nullable behavior. The clean fix is to make it explicit: `function g(?int $n = null)`. It's a safe, mechanical change and a good one to sweep with Rector during an upgrade.",
    },
  ],

  quiz: [
    {
      question: "What does the `?` in `function find(?int $id): ?User` mean?",
      options: [
        "The parameter and return are optional and can be omitted",
        "Both `$id` and the return value may be the given type or `null`",
        "It's the null coalescing operator applied to types",
        "`$id` defaults to null if not passed",
      ],
      answerIndex: 1,
      explain:
        "The `?` prefix (PHP 7.1) makes a type nullable: `?int` means `int|null` and `?User` means `User|null`. It does not change whether the argument is required, and it isn't a default.",
    },
    {
      question: "Which statement inside a function declared `: void` is allowed?",
      options: [
        "`return 0;`",
        "`return null;`",
        "`return;`",
        "`return false;`",
      ],
      answerIndex: 2,
      explain:
        "A `void` function (PHP 7.1) may use a bare `return;` to exit early, but returning any value — including `null` or `false` — is a fatal error.",
    },
    {
      question:
        "In PHP 5.5, how did developers most commonly express \"this argument may be null\"?",
      options: [
        "By writing `?string $x` before the type",
        "By giving the parameter a default of `null`, e.g. `$x = null`",
        "By declaring the return type `void`",
        "By writing the union `string|null`",
      ],
      answerIndex: 1,
      explain:
        "PHP 5.5 had no nullable syntax and no union types, so a `= null` default was the common stand-in — even though it really makes the argument optional. Explicit `?string` arrived in 7.1 and `string|null` unions in 8.0.",
    },
  ],
};

export default lesson;
