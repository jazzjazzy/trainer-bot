import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "php72-improvements",
  title: "PHP 7.2: The `object` Type & Trailing Commas",
  part: "PHP 7.1–7.4: Refinements",
  estMinutes: 10,

  summary:
    "PHP 7.2 added the `object` pseudo-type, contravariant parameter type widening, trailing commas in grouped use, and Argon2 password hashing.",

  concept: `
PHP 7.2 (2017) is a "fill in the gaps" release. The big type-system features
landed in 7.0–7.1; 7.2 rounds them out with the **\`object\`** type, a small but
useful inheritance relaxation, and some quality-of-life syntax.

### The \`object\` type declaration

Before 7.2 there was no way to say "any object" in a signature. You either left
the parameter untyped (and documented \`@param object\` in a docblock the engine
ignored) or wrote a permissive interface. PHP 7.2 added \`object\` as a real
parameter, return, and property type that matches **any** instance of any class:

\`\`\`php
function dump(object $o): object {
    var_dump(get_class($o));
    return $o;
}
\`\`\`

It accepts \`new stdClass\`, a closure, an \`ArrayObject\` — anything that is an
object. It does **not** accept scalars or arrays. Use it for generic factories,
serializers, and middleware where you genuinely don't care about the concrete
class.

### Trailing commas in grouped \`use\`

Grouped \`use\` arrived in 7.0; 7.2 lets the **last** item carry a trailing comma,
so adding an import is a clean one-line diff:

\`\`\`php
use App\\Model\\{
    User,
    Post,
    Comment,   // <- trailing comma, legal in 7.2+
};
\`\`\`

(Trailing commas spread further later: function **calls** in 7.3, **parameter
lists** in 8.0.)

### Parameter type widening

A child method may now **omit** a type its parent declared, broadening the
accepted types. This is contravariant and therefore type-safe — a method that
accepts *more* is still a valid substitute:

\`\`\`php
interface Json { public function set(string $value); }
class Lenient implements Json {
    public function set($value) {}   // type omitted — allowed in 7.2+
}
\`\`\`

### Argon2 password hashing

\`password_hash()\` gained the \`PASSWORD_ARGON2I\` algorithm (and \`ARGON2ID\` in
7.3), the modern memory-hard alternative to bcrypt. \`password_verify()\` and the
\`PASSWORD_DEFAULT\` constant continue to just work — code that hashed with
\`PASSWORD_DEFAULT\` in 5.5 keeps verifying old hashes unchanged.
`,

  comparisons: [
    {
      label: "Accepting any object",
      intro:
        "You want a helper that takes in any object at all and logs its class. The goal is to express 'any object' in the signature itself rather than in a comment.",
      php: `<?php
// PHP 5.5 — no "object" type; document it and hope
/**
 * @param object $o
 * @return object
 */
function dump($o) {
    var_dump(get_class($o));
    return $o;
}`,
      ts: `<?php
// PHP 7.2 — "object" is a real, enforced type
function dump(object $o): object {
    var_dump(get_class($o));
    return $o;
}`,
      note:
        "The object pseudo-type (PHP 7.2) matches any class instance as a parameter, return, or property type — replacing the @param object docblock.",
    },
    {
      label: "Grouped imports you keep editing",
      intro:
        "You are importing three related classes from the same namespace and expect to add more over time. The aim is to keep the import block tidy so adding the next class is a clean, minimal change.",
      php: `<?php
// PHP 5.5 — one use statement per class, no grouping at all
use App\\Model\\User;
use App\\Model\\Post;
use App\\Model\\Comment;`,
      ts: `<?php
// PHP 7.2 — grouped use with a trailing comma on the last item
use App\\Model\\{
    User,
    Post,
    Comment,
};`,
      note:
        "Grouped use arrived in 7.0; the trailing comma on the final item is new in 7.2, making added imports a single-line diff.",
    },
    {
      label: "Overriding with a looser type",
      intro:
        "An interface declares a set method, and a class implementing it wants to accept a broader range of values than the interface specifies. The aim is to have the implementation legally accept more than the contract requires.",
      php: `<?php
// PHP 5.5 — no scalar types at all, so nothing to widen
interface Setter {
    public function set($value);
}
class Box implements Setter {
    public function set($value) { /* ... */ }
}`,
      ts: `<?php
// PHP 7.2 — parent declares a type, child may omit it (widening)
interface Setter {
    public function set(string $value);
}
class Box implements Setter {
    public function set($value) { /* accepts anything */ }
}`,
      note:
        "Parameter type widening (PHP 7.2): a child may drop a parameter type the parent declared. It's contravariant and type-safe — accepting more is a valid substitute.",
    },
    {
      label: "Hashing a password",
      intro:
        "You are hashing a user's password before storing it. The goal is to use the strongest hashing algorithm your PHP version offers, tuning its cost so the resulting hash is hard to crack.",
      php: `<?php
// PHP 5.5 — bcrypt via PASSWORD_DEFAULT (the only modern option then)
$hash = password_hash($password, PASSWORD_DEFAULT);`,
      ts: `<?php
// PHP 7.2 — memory-hard Argon2i is now available
$hash = password_hash($password, PASSWORD_ARGON2I, [
    'memory_cost' => 1 << 16,
    'time_cost'   => 4,
    'threads'     => 2,
]);`,
      note:
        "PASSWORD_ARGON2I landed in 7.2 (ARGON2ID in 7.3). password_verify() and PASSWORD_DEFAULT are unchanged, so existing bcrypt hashes keep verifying.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The object type accepts any class instance but rejects scalars. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

function describe(object $o): string {
    return get_class($o);
}

echo describe(new stdClass()), "\\n";
echo describe(new ArrayObject([1, 2, 3])), "\\n";
echo describe(function () {}), "\\n";

// object also works as a return type for a generic factory:
function make(string $class): object {
    return new $class();
}

var_dump(make('stdClass') instanceof stdClass);

// Scalars are NOT objects — guard before passing them in:
$value = 42;
echo is_object($value) ? "object\\n" : "not an object\\n";`,
    output: `stdClass
ArrayObject
Closure
bool(true)
not an object`,
  },

  keyPoints: [
    "`object` (PHP 7.2) is a real type matching **any** class instance — as a parameter, return, or property type — but it rejects scalars and arrays.",
    "Trailing commas became legal on the last item of a **grouped `use`** in 7.2 (function calls 7.3, parameter lists 8.0).",
    "**Parameter type widening** (7.2) lets a child method omit a type the parent declared — contravariant and type-safe.",
    "`password_hash()` gained **Argon2i** in 7.2 (`PASSWORD_ARGON2I`); Argon2id followed in 7.3.",
    "All of these are additive — your 5.5 untyped code still runs; you opt into the new spellings.",
  ],

  interview: [
    {
      q: "What does the `object` type declaration do, and what doesn't it accept?",
      a: "Introduced in **PHP 7.2**, `object` is a pseudo-type usable for parameters, return values, and (from 7.4) typed properties. It matches **any** instance of any class — `stdClass`, closures, `ArrayObject`, your own classes. It does **not** match scalars (`int`, `string`, `bool`, `float`) or arrays, so `describe(42)` throws a `TypeError` under `strict_types`. It's the type to reach for in generic factories, serializers, and middleware where the concrete class is irrelevant.",
    },
    {
      q: "Explain parameter type widening. Why is it safe?",
      a: "Since **7.2**, a child method may **omit** a parameter type that its parent declared, broadening what it accepts. It's safe because of **contravariance**: a subtype must be substitutable for its parent, and a method that accepts *more* inputs can always stand in for one that accepts fewer. Note the asymmetry — you can widen (drop a type) but you can't *narrow* a parameter type, since that would reject inputs the parent promised to handle.",
    },
    {
      q: "Where are trailing commas allowed, and how has that changed since 5.5?",
      a: "In 5.5, trailing commas were only allowed in **array literals**. PHP 7.2 added them to the last item of a **grouped `use`** declaration. PHP 7.3 added them to **function and method calls**, and PHP 8.0 added them to **parameter lists** (and closure `use` lists). By 8.0 trailing commas are nearly universal — the few places they still aren't accepted are empty lists (`foo(,)`) and `list()`/array-destructuring targets.",
    },
    {
      q: "You're on 5.5 hashing passwords with `PASSWORD_DEFAULT`. What changes when you move to 7.2 and want Argon2?",
      a: "Nothing breaks: `PASSWORD_DEFAULT` is still bcrypt in 7.2, and `password_verify()` reads the algorithm out of the stored hash, so your **old hashes keep verifying**. To opt into Argon2 you pass `PASSWORD_ARGON2I` (7.2) or `PASSWORD_ARGON2ID` (7.3) with `memory_cost`/`time_cost`/`threads` options. A good pattern is to call `password_needs_rehash()` on successful login and transparently upgrade old bcrypt hashes to Argon2.",
    },
  ],

  quiz: [
    {
      question: "Which of these will a parameter typed `object` (PHP 7.2) reject under `strict_types`?",
      options: [
        "A closure created with `function () {}`",
        "`new stdClass()`",
        "The integer `42`",
        "An `ArrayObject` instance",
      ],
      answerIndex: 2,
      explain:
        "The object type matches any class instance — closures, stdClass, and ArrayObject all qualify. Scalars like the integer 42 are not objects, so passing one throws a TypeError.",
    },
    {
      question: "In PHP 7.2, where does a trailing comma newly become legal?",
      options: [
        "In function parameter lists",
        "In the last item of a grouped `use` declaration",
        "In function and method call argument lists",
        "Anywhere a comma already appears",
      ],
      answerIndex: 1,
      explain:
        "7.2 added the trailing comma to grouped use declarations. Call argument lists came in 7.3 and parameter lists in 8.0; arrays already allowed it before 5.5.",
    },
    {
      question: "Parameter type widening in 7.2 means a child method may…",
      options: [
        "Narrow a parameter type the parent declared, to be stricter",
        "Omit a parameter type the parent declared, accepting more types",
        "Change a parameter's name freely",
        "Add new required parameters not in the parent",
      ],
      answerIndex: 1,
      explain:
        "Widening lets a child omit (broaden) a parameter type the parent declared. It's contravariant and safe; narrowing a parameter type is not allowed because it would reject inputs the parent accepted.",
    },
  ],
};

export default lesson;
