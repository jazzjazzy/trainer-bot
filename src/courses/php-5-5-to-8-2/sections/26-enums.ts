import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "enums",
  title: "Enums: First-Class Enumerations Replace Class Constants",
  part: "PHP 8.1–8.2: Modern PHP",
  estMinutes: 14,
  summary:
    "PHP 8.1 enums give you a real, type-safe set of named values — with cases(), from()/tryFrom(), methods, constants, and interfaces — retiring the hand-rolled class-constant pattern from 5.5.",

  concept: `
For years the "enum" in PHP was a convention, not a language feature: a class
full of \`const\`s plus a pile of validation. PHP 8.1 made enums **first-class
types**, so a "status" is no longer a loose \`string\` that *might* be valid —
it's a value the engine guarantees is one of your declared cases.

### The 5.5 way: a class of constants

\`\`\`php
class Suit {
    const HEARTS = 'H';
    const SPADES = 'S';
    // ...and a static array + a validate() method you must remember to call
}
\`\`\`

Nothing stops \`Suit::HEARTS . 'oops'\` from flowing through your code. You can't
type-hint "a suit", you can't list the cases without a hand-maintained array,
and converting a stored \`'H'\` back to a constant means writing a lookup.

### Pure enums (PHP 8.1)

\`\`\`php
enum Suit {
    case Hearts;
    case Spades;
}
\`\`\`

Each case is a **singleton object** of type \`Suit\`. You can type-hint
\`function play(Suit \$s)\` and compare with \`===\`. \`Suit::cases()\` returns every
case in declaration order — no manual array.

### Backed enums (PHP 8.1)

When a case must map to a scalar (a DB column, a JSON value), give the enum a
backing type — \`: string\` or \`: int\` — and a value per case:

\`\`\`php
enum Suit: string {
    case Hearts = 'H';
    case Spades = 'S';
}
\`\`\`

Now \`Suit::Hearts->value === 'H'\`. Two converters come built in:

- \`Suit::from('H')\` returns the case, or throws \`\\ValueError\` if unknown.
- \`Suit::tryFrom('H')\` returns the case or \`null\` — your safe parse.

### Methods, constants, and interfaces

Enums are classes underneath, so they can hold **methods** and **constants**, and
\`\$this\` refers to the current case:

\`\`\`php
enum Suit: string {
    case Hearts = 'H';
    case Spades = 'S';
    const Wild = self::Hearts;
    public function color(): string {
        return match (\$this) {
            Suit::Hearts => 'Red',
            Suit::Spades => 'Black',
        };
    }
}
\`\`\`

They can also **implement an interface**, so \`Suit\` can satisfy a contract like
\`HasLabel\` and be used polymorphically.

### What enums can't do

They have no instance state and no constructor you call — cases are fixed
singletons. \`new Suit()\` is an error, and you can't add mutable properties. If
you need per-instance data, you want a regular (often \`readonly\`) class instead.
`,

  comparisons: [
    {
      label: "Declaring the set of values",
      intro:
        "We want to define a fixed set of order statuses and accept one in a publish() function. The goal is a signature that can only ever receive a valid status.",
      php: `<?php
// PHP 5.5 — a class of constants, no type to hint
class Status {
    const Draft     = 'draft';
    const Published = 'published';
    const Archived  = 'archived';
}

// "A status" is just a string anywhere it's used:
function publish($status) {
    // $status could be ANY string
}`,
      ts: `<?php
// PHP 8.1 — a real type with a fixed set of cases
enum Status: string {
    case Draft     = 'draft';
    case Published = 'published';
    case Archived  = 'archived';
}

// The signature now guarantees a valid Status:
function publish(Status $status): void {
    // $status is always one of the three cases
}`,
      note:
        "Enums arrived in PHP 8.1; unlike class constants they create a genuine type you can type-hint and that the engine guarantees.",
    },
    {
      label: "Listing all the values",
      intro:
        "Here we need to loop over every possible status, for example to render a dropdown. The result should be the complete, in-order list of values without any extra bookkeeping.",
      php: `<?php
// PHP 5.5 — keep a parallel array by hand
class Status {
    const Draft     = 'draft';
    const Published = 'published';
    const Archived  = 'archived';

    public static function all() {
        // easy to forget to update when a const is added
        return array(self::Draft, self::Published, self::Archived);
    }
}`,
      ts: `<?php
// PHP 8.1 — cases() is generated for you, in order
foreach (Status::cases() as $case) {
    echo $case->name, ' = ', $case->value, "\\n";
}`,
      note:
        "Status::cases() (PHP 8.1) returns every case in declaration order, so there is no hand-maintained array to drift out of sync.",
    },
    {
      label: "Validating / parsing an incoming value",
      intro:
        "A raw string arrives from outside (a request or a database row) and we need to turn it into a known status. Valid input should produce the matching value; bad input should be rejected predictably.",
      php: `<?php
// PHP 5.5 — validate by hand against the known list
function toStatus($raw) {
    $valid = array('draft', 'published', 'archived');
    if (!in_array($raw, $valid, true)) {
        throw new InvalidArgumentException("Bad status: $raw");
    }
    return $raw; // still just a string
}`,
      ts: `<?php
// PHP 8.1 — built-in converters on a backed enum
$status = Status::from('published');      // throws \\ValueError if unknown
$maybe  = Status::tryFrom($_GET['s']);    // Status|null, no exception

if ($maybe === null) {
    // handle the bad input
}`,
      note:
        "Backed enums (PHP 8.1) give from() — which throws \\ValueError on an unknown value — and tryFrom(), which returns null instead.",
    },
    {
      label: "Attaching behaviour to a value",
      intro:
        "We want to ask a status a question about itself, such as whether it should be visible. The aim is for that logic to live alongside the value so calling it reads naturally.",
      php: `<?php
// PHP 5.5 — behaviour lives in a separate switch/helper
class Status {
    const Draft     = 'draft';
    const Published = 'published';
    const Archived  = 'archived';
}

function isVisible($status) {
    switch ($status) {
        case Status::Published: return true;
        default:                return false;
    }
}`,
      ts: `<?php
// PHP 8.1 — methods live on the enum, $this is the case
enum Status: string {
    case Draft     = 'draft';
    case Published = 'published';
    case Archived  = 'archived';

    public function isVisible(): bool {
        return $this === Status::Published;
    }
}

$visible = Status::Published->isVisible(); // true`,
      note:
        "Enums are classes under the hood (PHP 8.1), so methods and constants live with the cases and $this is the current case.",
    },
    {
      label: "Satisfying a contract",
      intro:
        "We have a HasLabel interface and want a status to count as something that can produce a label. The goal is to pass a status anywhere code expects that contract.",
      php: `<?php
// PHP 5.5 — constants can't implement an interface;
// you'd wrap them in objects or pass strings around
interface HasLabel {
    public function label();
}
// Status (a bag of consts) cannot satisfy this.`,
      ts: `<?php
// PHP 8.1 — an enum can implement an interface
interface HasLabel {
    public function label(): string;
}

enum Status: string implements HasLabel {
    case Draft     = 'draft';
    case Published = 'published';

    public function label(): string {
        return ucfirst($this->value);
    }
}`,
      note:
        "Enums (PHP 8.1) can implement interfaces, so a case can be passed anywhere the interface is expected — impossible with class constants.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A backed enum with a method, cases(), and tryFrom(). Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

enum Suit: string {
    case Hearts   = 'H';
    case Diamonds = 'D';
    case Spades   = 'S';
    case Clubs    = 'C';

    public function color(): string {
        return match ($this) {
            Suit::Hearts, Suit::Diamonds => 'Red',
            Suit::Spades, Suit::Clubs    => 'Black',
        };
    }
}

// cases() lists every case in declaration order:
foreach (Suit::cases() as $suit) {
    echo $suit->name, '(', $suit->value, ')=', $suit->color(), "\\n";
}

// from() resolves a stored value to a case:
$s = Suit::from('S');
echo "from('S') -> ", $s->name, "\\n";

// tryFrom() returns null instead of throwing:
var_dump(Suit::tryFrom('Z'));

// cases are singletons, compared with ===:
var_dump(Suit::from('H') === Suit::Hearts);`,
    output: `Hearts(H)=Red
Diamonds(D)=Red
Spades(S)=Black
Clubs(C)=Black
from('S') -> Spades
NULL
bool(true)`,
  },

  keyPoints: [
    "Enums (PHP 8.1) replace the 5.5 `class` + `const` + validate() pattern with a real, engine-guaranteed type you can type-hint.",
    "**Pure enums** have only `case` names; **backed enums** add `: string`/`: int` and a value per case, read via `->value`.",
    "`Cases::cases()` returns all cases in order; `from()` throws `\\ValueError` on an unknown value, `tryFrom()` returns `null`.",
    "Each case is a **singleton object** of the enum type — compare with `===`, never re-instantiate (`new` is an error).",
    "Enums are classes underneath: they can carry **methods** (where `$this` is the case), **constants**, and **implement interfaces**.",
    "No instance state — if cases need per-object mutable data, reach for a regular (often `readonly`) class instead.",
  ],

  interview: [
    {
      q: "How did you represent an enumeration in PHP 5.5, and what does 8.1 fix?",
      a: "In 5.5 the idiom was a class full of `const`s, often with a static `all()` array and a `validate()`/`in_array()` helper. The values were still plain strings or ints, so nothing stopped an invalid value from flowing through the code and you couldn't type-hint 'a status'. PHP 8.1 enums make it a **first-class type**: `function publish(Status $s)` is guaranteed by the engine to receive a real case, `Status::cases()` is generated for you, and backed enums give built-in `from()`/`tryFrom()` converters. You delete the parallel array and the validation helper.",
    },
    {
      q: "What's the difference between a pure enum and a backed enum?",
      a: "A **pure enum** declares only case names (`case Hearts;`) — each case is a singleton with no scalar value, useful when the cases only need identity. A **backed enum** declares a backing type (`enum Suit: string` or `: int`) and a literal value per case (`case Hearts = 'H';`), so it can serialize to and from a database column or JSON. Only backed enums have a `->value` property and the `from()`/`tryFrom()` methods; both have `->name` and `cases()`.",
    },
    {
      q: "When would you use `from()` versus `tryFrom()`?",
      a: "`from($value)` returns the matching case or throws `\\ValueError` if no case has that value — use it when an invalid value is a bug that should fail loudly (e.g. reading a column you control). `tryFrom($value)` returns the case or `null` — use it for untrusted input like query params or request bodies, where you want to branch on the bad case rather than catch an exception. A common pattern is `Status::tryFrom($_GET['s']) ?? Status::Draft`.",
    },
    {
      q: "Can a PHP enum hold methods, constants, or implement an interface?",
      a: "Yes — enums are classes under the hood. They can define **methods** (inside one, `$this` is the current case, which pairs naturally with a `match ($this)`), declare **constants** (including `const Wild = self::Hearts;`), use **traits**, and **implement interfaces** so a case can be passed wherever the interface is expected. What they can't have is instance state: no per-case mutable properties and no public constructor — cases are fixed singletons, so `new Suit()` is an error.",
    },
    {
      q: "Are two references to the same enum case equal, and how should you compare them?",
      a: "Each case is a **singleton**, so every reference to `Suit::Hearts` is the exact same object instance. That means `===` (identity) is the correct, fast comparison and it works perfectly in a `match` expression. You don't compare the `->value` unless you're specifically dealing with the underlying scalar (say, after pulling a string from the database, in which case you'd `from()`/`tryFrom()` it back to a case first).",
    },
  ],

  quiz: [
    {
      question: "In a backed enum, what does `tryFrom()` do when given a value that matches no case?",
      options: [
        "Throws a \\ValueError",
        "Returns null",
        "Returns the first case",
        "Emits a notice and returns the raw value",
      ],
      answerIndex: 1,
      explain:
        "tryFrom() returns null for an unknown value (it's the safe parser for untrusted input). It's from() that throws \\ValueError on an unknown value. Both arrived in PHP 8.1.",
    },
    {
      question: "Which is true about pure enums versus backed enums in PHP 8.1?",
      options: [
        "Both have a ->value property",
        "Only backed enums have ->value, from(), and tryFrom()",
        "Only pure enums can have methods",
        "Backed enums cannot implement interfaces",
      ],
      answerIndex: 1,
      explain:
        "A backing type (`: string`/`: int`) gives each case a scalar `->value` plus the `from()`/`tryFrom()` converters. Pure enums have only `->name` and `cases()`. Both kinds can have methods, constants, and implement interfaces.",
    },
    {
      question: "How should you compare an enum case to a known case, e.g. `$suit` to `Suit::Hearts`?",
      options: [
        "With `==` only, never `===`",
        "By comparing `$suit->value` to a string literal",
        "With `===`, because each case is a singleton instance",
        "With `instanceof Suit`",
      ],
      answerIndex: 2,
      explain:
        "Every reference to a given case is the same singleton object, so `===` is the correct identity check and works inside `match ($this)`. Comparing `->value` only makes sense when you're handling the raw scalar.",
    },
  ],
};

export default lesson;
