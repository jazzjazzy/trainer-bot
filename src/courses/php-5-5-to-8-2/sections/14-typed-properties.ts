import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "typed-properties",
  title: "Typed Properties: Real Types on Your Objects",
  part: "PHP 7.1–7.4: Refinements",
  estMinutes: 13,

  summary:
    "PHP 7.4 lets you declare the type of a class property — enforced at assignment — replacing the docblock-and-hope approach of 5.5, but it introduces a brand-new 'uninitialized' state you must understand.",

  concept: `
In PHP 5.5, a property had **no type**. You wrote a docblock, the engine ignored
it, and any value could land in any property at any time. PHP 7.0–7.3 gave you
typed *parameters* and *return types*, but properties stayed untyped — the one
remaining hole in the type system. **PHP 7.4 closed it with typed properties.**

### 5.5: types were a comment

\`\`\`php
class User {
    /** @var int */
    private $id;      // engine enforces nothing
    /** @var string */
    private $name;    // you could assign an array here
}
\`\`\`

The \`@var\` lines help your IDE and a static analyzer like PHPStan, but at runtime
\`$this->id = 'oops'\` is perfectly legal.

### 7.4: types the engine enforces

\`\`\`php
class User {
    private int $id;
    private string $name;
    private ?string $nickname = null;   // nullable, defaults to null
}
\`\`\`

Now \`$this->id = 'oops'\` throws a \`TypeError\`. Assignment is checked and, in
coercive mode, coerced (\`'42'\` into an \`int\` property becomes \`42\`); under
\`declare(strict_types=1)\` it must match exactly.

### The new "uninitialized" state — the big gotcha

A typed property **without a default** is not \`null\`. It is **uninitialized**,
a distinct state that did not exist before 7.4. Reading it before it is assigned
throws an **\`Error\`**, not a warning:

\`\`\`php
$u = new User();
echo $u->id; // Error: Typed property User::$id must not be
             // accessed before initialization
\`\`\`

- You **cannot** give a non-nullable typed property a default of \`null\`. Write
  \`private int $id;\` (no default) or \`private ?int $id = null;\` — not \`private int $id = null;\`.
- \`isset($u->id)\` returns \`false\` while uninitialized, so \`isset()\`/\`??\` are the
  safe way to probe a property that may not be set yet.
- Properties typed with a class/interface, plus \`array\`, \`bool\`, \`int\`,
  \`float\`, \`string\`, \`iterable\`, \`object\`, \`self\`, \`parent\`, and nullable
  versions are allowed. \`void\`, \`callable\`, and (until 8.2) \`null\`/\`false\` as
  standalone types are not.

### Upgrade gotcha

Code that relied on reading an unset property as \`null\` will now throw once you
add a type. Either give the property a sensible default, make it nullable, or
ensure the constructor always assigns it.
`,

  comparisons: [
    {
      label: "Declaring properties",
      intro:
        "A Money class needs an integer amount and a string currency. The goal is to declare those properties so the language itself knows their intended types, not just the reader.",
      php: `<?php
// PHP 5.5 — untyped, documented in a comment
class Money {
    /** @var int */
    private $amount;
    /** @var string */
    private $currency;
}`,
      ts: `<?php
// PHP 7.4 — real, enforced property types
class Money {
    private int $amount;
    private string $currency;
}`,
      note:
        "Typed properties arrived in PHP 7.4; the @var docblock the engine ignored becomes a type it enforces on every assignment.",
    },
    {
      label: "Catching a bad assignment",
      intro:
        "A Counter stores an integer count via a setter. We want to see what happens when a caller passes the string 'five' instead of a number.",
      php: `<?php
// PHP 5.5 — anything goes, fails silently later
class Counter {
    /** @var int */
    private $count = 0;
    public function set($v) {
        $this->count = $v; // 'five' is accepted
    }
}`,
      ts: `<?php
// PHP 7.4 — wrong type is rejected at the assignment
class Counter {
    private int $count = 0;
    public function set(int $v): void {
        $this->count = $v; // 'five' => TypeError here
    }
}`,
      note:
        "Since PHP 7.4 an out-of-type assignment throws a TypeError at the point of the bug, not as a mystery further downstream.",
    },
    {
      label: "Nullable / optional properties",
      intro:
        "A Profile has an optional bio that may legitimately be absent. The goal is to model 'no bio yet' as null while still typing the property as a string.",
      php: `<?php
// PHP 5.5 — null was the universal 'not set' value
class Profile {
    /** @var string|null */
    private $bio = null;
}`,
      ts: `<?php
// PHP 7.4 — be explicit: nullable type with a null default
class Profile {
    private ?string $bio = null;
}`,
      note:
        "In 7.4 a non-nullable typed property cannot default to null; mark it ?string and default to null when 'absent' is a valid state.",
    },
    {
      label: "Detecting 'not yet set'",
      intro:
        "A Lazy object holds a resource handle that is only created on demand, and its ready() method must report whether that handle exists yet. The goal is to check 'has this been set?' safely.",
      php: `<?php
// PHP 5.5 — undefined property reads as null (with a notice)
class Lazy {
    private $handle;
    public function ready() {
        return $this->handle !== null;
    }
}`,
      ts: `<?php
// PHP 7.4 — reading uninitialized throws; probe with isset()
class Lazy {
    private \\Closure $handle; // no default => uninitialized
    public function ready(): bool {
        return isset($this->handle);
    }
}`,
      note:
        "From PHP 7.4 reading an uninitialized typed property is an Error; isset() returns false for it, so isset()/?? are the safe checks.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Typed properties, the uninitialized state, and isset() probing. Read it, predict the output, then reveal.",
    code: `<?php
declare(strict_types=1);

class Account {
    public int $id;            // no default => uninitialized
    public string $owner = ''; // has a default => initialized
    public ?string $note = null;

    public function open(int $id, string $owner): void {
        $this->id = $id;
        $this->owner = $owner;
    }
}

$a = new Account();

// Probe before anything is assigned:
var_dump(isset($a->id));    // uninitialized -> false
var_dump(isset($a->owner)); // '' is set     -> true
echo $a->owner === '' ? "owner is empty string\\n" : "owner set\\n";

$a->open(7, 'Ada');
var_dump(isset($a->id));

// Coercion is off under strict_types, but matching types are fine:
$a->note = 'vip';
echo "Account {$a->id} owned by {$a->owner} ({$a->note})\\n";`,
    output: `bool(false)
bool(true)
owner is empty string
bool(true)
Account 7 owned by Ada (vip)`,
  },

  keyPoints: [
    "Typed properties (`private int $x;`) arrived in **PHP 7.4** and are enforced on every assignment — `@var` docblocks were ignored at runtime.",
    "A typed property with no default is **uninitialized**, a new state distinct from `null`; reading it throws an `Error`.",
    "A non-nullable typed property **can't** default to `null` — use `private int $id;` or `private ?int $id = null;`.",
    "`isset($obj->prop)` returns `false` while uninitialized, so `isset()`/`??` are the safe way to probe a maybe-unset property.",
    "Under `declare(strict_types=1)` an assignment must match the type exactly; in coercive mode scalars are coerced where possible.",
    "Upgrade gotcha: adding a type to a property that code used to read as `null` will now throw — give it a default, make it nullable, or always assign it.",
  ],

  interview: [
    {
      q: "What did PHP 7.4 add for properties, and why did it matter coming from 5.5?",
      a: "**Typed properties.** In 5.5 a property's type lived only in a `@var` docblock the engine ignored, so a `User::$id` could silently hold a string. PHP 7.4 lets you write `private int $id;` and the engine enforces it on every assignment — a wrong type throws a `TypeError` at the exact line of the bug. It closed the last gap in PHP's type system: parameters and return types had been typed since 7.0, but properties hadn't.",
    },
    {
      q: "What is the 'uninitialized' state and how is it different from null?",
      a: "A typed property declared without a default — e.g. `private int $id;` — starts **uninitialized**, a state that didn't exist before 7.4. It is *not* `null`: reading it throws `Error: Typed property ... must not be accessed before initialization`. `null` is a real value a nullable property can hold; uninitialized means no value has ever been assigned. You detect it with `isset()`, which returns `false` for an uninitialized property.",
    },
    {
      q: "Why does `private int $id = null;` fail, and what should you write instead?",
      a: "Because `int` is non-nullable, so `null` isn't a member of its type — PHP rejects the default at compile time with a fatal error. If `null` is a legitimate value, declare it nullable: `private ?int $id = null;`. If `null` is *not* valid, omit the default entirely (`private int $id;`) and make sure the constructor or a setter always assigns it before any read.",
    },
    {
      q: "You're adding types to an old 5.5 class. What breaks and how do you check?",
      a: "Two things. First, code that read an unset property and treated the resulting `null` as 'not set' will now throw once the property is typed without a default — fix it by giving a default, making it nullable, or always initializing it. Second, any assignment that was sloppy about types (assigning `'42'` to what's now an `int` under `strict_types`) will throw. Lean on your test suite plus static analysis (**PHPStan**/**Psalm**), and use `isset()` rather than `=== null` to probe properties that may be uninitialized.",
    },
  ],

  quiz: [
    {
      question: "In which PHP version were typed properties introduced?",
      options: ["PHP 7.0", "PHP 7.1", "PHP 7.4", "PHP 8.0"],
      answerIndex: 2,
      explain:
        "Typed properties (e.g. `private int $x;`) were added in PHP 7.4. Typed parameters and return types came earlier (7.0), but properties stayed untyped until 7.4.",
    },
    {
      question:
        "Given `class A { public int $n; }` and `$a = new A();`, what happens at `echo $a->n;`?",
      options: [
        "It prints 0",
        "It prints nothing (null)",
        "It throws an Error: must not be accessed before initialization",
        "It emits a notice and prints an empty string",
      ],
      answerIndex: 2,
      explain:
        "A typed property with no default is uninitialized, not null. Reading it before assignment throws an Error in PHP 7.4+, unlike a 5.5 untyped property which read as null with a notice.",
    },
    {
      question: "Which property declaration is invalid in PHP 7.4?",
      options: [
        "private int $id;",
        "private ?string $name = null;",
        "private int $count = 0;",
        "private string $title = null;",
      ],
      answerIndex: 3,
      explain:
        "`private string $title = null;` is a fatal error: a non-nullable type can't have a null default. Use `private ?string $title = null;` if null is a valid value, or omit the default.",
    },
  ],
};

export default lesson;
