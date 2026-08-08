import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "readonly-properties-and-classes",
  title: "Readonly Properties & Classes: Real Immutability",
  part: "PHP 8.1–8.2: Modern PHP",
  estMinutes: 13,
  summary:
    "How PHP 8.1's readonly properties and PHP 8.2's readonly classes give you enforced, engine-level immutability — replacing the private-property-plus-getter dance from 5.5.",

  concept: `
In PHP 5.5 the only way to make a value object "immutable" was a convention: mark
every property **private**, expose **getters**, and trust that nobody adds a
setter later. The engine never stopped a write — \`$this->x = 9\` inside any method
just worked. PHP 8.1 made immutability a real, enforced thing.

### Readonly properties (PHP 8.1)

A \`readonly\` property can be **initialized exactly once**, from inside the
declaring class's scope, and is **frozen forever after**. A second write — even
from inside the same object — throws an \`Error\`.

\`\`\`php
class Point {
    public readonly int $x;
    public function __construct(int $x) {
        $this->x = $x;   // first write: OK
    }
}
$p = new Point(3);
$p->x = 9;               // Error: Cannot modify readonly property
\`\`\`

Rules worth memorising:

- It must be **typed** (\`readonly\` alone, with no type, is a parse error).
- It pairs perfectly with **constructor property promotion**.
- It cannot have a **default value** at declaration — set it once in the constructor.
- It must be an **instance** property; \`static readonly\` is not allowed.

### Readonly classes (PHP 8.2)

Marking every property \`readonly\` by hand is repetitive. PHP 8.2 lets you mark
the **whole class** \`readonly\` — every declared property becomes readonly
automatically, and the class also **blocks dynamic properties**.

\`\`\`php
readonly class Money {
    public function __construct(
        public int $amount,
        public string $currency,
    ) {}
}
\`\`\`

### The with-er pattern

Because you can't mutate, you produce a **changed copy**. \`clone\` makes a shallow
copy, and a \`withX()\` method returns a fresh instance with one field replaced:

\`\`\`php
public function withCurrency(string $c): self {
    return new self($this->amount, $c);
}
\`\`\`

This is the same pattern you may know from \`DateTimeImmutable\`. The result:
value objects that are safe to share, cache, and pass around without defensive
copying — guaranteed by the engine, not by discipline.
`,

  comparisons: [
    {
      label: "An immutable value object",
      intro:
        "We want a Point whose x and y can be read but never changed after it's built. Both sides reach that goal, but only one actually stops a future write.",
      php: `<?php
// PHP 5.5 — "immutable" by convention: private + getters only
class Point {
    private $x;
    private $y;
    public function __construct($x, $y) {
        $this->x = $x;
        $this->y = $y;
    }
    public function getX() { return $this->x; }
    public function getY() { return $this->y; }
    // Nothing stops a future setter being added.
}`,
      ts: `<?php
// PHP 8.1 — enforced: readonly + promotion, no getters needed
class Point {
    public function __construct(
        public readonly int $x,
        public readonly int $y,
    ) {}
}
// $p->x is public to read, but a write throws Error.`,
      note:
        "readonly (PHP 8.1) lets properties be public for reading yet immutable after construction — the engine enforces it, so getters become optional.",
    },
    {
      label: "Marking the whole class immutable",
      intro:
        "A Money object has two fields that should both be frozen. The aim is to make the whole class immutable without repeating yourself per property.",
      php: `<?php
// PHP 5.5 — repeat the discipline for every property
class Money {
    private $amount;
    private $currency;
    public function __construct($amount, $currency) {
        $this->amount = $amount;
        $this->currency = $currency;
    }
    public function getAmount()   { return $this->amount; }
    public function getCurrency() { return $this->currency; }
}`,
      ts: `<?php
// PHP 8.2 — one keyword makes every property readonly
readonly class Money {
    public function __construct(
        public int $amount,
        public string $currency,
    ) {}
}`,
      note:
        "readonly class (PHP 8.2) applies readonly to every declared property at once and also forbids dynamic properties.",
    },
    {
      label: "Changing one field (the with-er)",
      intro:
        "Say you have a Money in USD and want the same amount in EUR. The challenge is producing that variant without altering the original, which any aliases might still be holding.",
      php: `<?php
// PHP 5.5 — a setter mutates the original in place
class Money {
    private $amount;
    private $currency;
    public function __construct($amount, $currency) {
        $this->amount = $amount;
        $this->currency = $currency;
    }
    public function setCurrency($c) {
        $this->currency = $c;     // mutation: aliases see the change
    }
}`,
      ts: `<?php
// PHP 8.2 — return a modified copy instead of mutating
readonly class Money {
    public function __construct(
        public int $amount,
        public string $currency,
    ) {}
    public function withCurrency(string $c): self {
        return new self($this->amount, $c);
    }
}`,
      note:
        "With readonly you can't mutate, so you clone/rebuild: withX() returns a fresh instance — the same pattern as DateTimeImmutable.",
    },
    {
      label: "What happens on a second write",
      intro:
        "This sets a property once and then assigns it again, to see how each version reacts. With a plain property the value just changes; with readonly the second assignment is rejected.",
      php: `<?php
// PHP 5.5 — nothing stops the write; the field just changes
class Counter {
    public $n = 0;
}
$c = new Counter();
$c->n = 1;
$c->n = 2;   // fine — fully mutable
echo $c->n;  // 2`,
      ts: `<?php
// PHP 8.1 — the second write is a hard Error
class Counter {
    public function __construct(public readonly int $n) {}
}
$c = new Counter(1);
$c->n = 2;   // Error: Cannot modify readonly property Counter::$n`,
      note:
        "Re-assigning a readonly property (PHP 8.1) throws an Error at runtime, even from inside the class — initialization is one-shot.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A readonly value object with a with-er. Predict the output — note that the original is untouched and the illegal write is caught.",
    code: `<?php
declare(strict_types=1);

readonly class Money {
    public function __construct(
        public int $amount,
        public string $currency,
    ) {}

    public function withCurrency(string $c): self {
        return new self($this->amount, $c);
    }
}

$usd = new Money(100, 'USD');
$eur = $usd->withCurrency('EUR');

echo "{$usd->amount} {$usd->currency}\\n";   // original unchanged
echo "{$eur->amount} {$eur->currency}\\n";

try {
    $usd->amount = 200;                      // illegal: readonly
} catch (\\Error $e) {
    echo "Caught: " . $e->getMessage() . "\\n";
}

var_dump($usd === $eur);`,
    output: `100 USD
100 EUR
Caught: Cannot modify readonly property Money::$amount
bool(false)`,
  },

  keyPoints: [
    "`readonly` (PHP 8.1) lets a typed property be written **once**, from the declaring class's scope, then freezes it — a second write throws `Error`.",
    "A readonly property must be **typed** and cannot have a declaration-time **default**; set it in the constructor (great with promotion).",
    "`readonly class` (PHP 8.2) makes **every** property readonly in one keyword and also blocks dynamic (undeclared) properties.",
    "Immutable objects change by **copying**: a `withX()` method returns a new instance — the `DateTimeImmutable` pattern.",
    "In 5.5 immutability was only a convention (private + getters); now it's enforced by the engine, so objects are safe to share without defensive copying.",
    "`readonly` blocks reassignment, not deep mutation: a readonly property holding an array is frozen, but a readonly property holding a mutable object can still have *that object's* internals changed.",
  ],

  interview: [
    {
      q: "How did you make a value object immutable in PHP 5.5, and what's different now?",
      a: "In 5.5 it was a **convention**, not a guarantee: I'd make every property `private` and expose only getters, trusting that no one later adds a setter or mutates from inside a method — the engine never enforced it. From **PHP 8.1** I mark the properties `readonly`, so they can be initialized once and the engine throws an `Error` on any later write. In **PHP 8.2** I can mark the whole class `readonly` and drop the per-property repetition entirely.",
    },
    {
      q: "What exactly are the rules for a `readonly` property?",
      a: "It must be a **typed instance property**; it can be written **once** and only from **inside the scope of the declaring class** (typically the constructor); any later write — even from within the same object — throws an `Error`. It **can't have a default value** at declaration and **can't be `static`**. `readonly` without a type is a parse error, and you can't add `readonly` to an already-initialized property by reassigning it.",
    },
    {
      q: "If I can't mutate a readonly object, how do I get a changed version?",
      a: "You return a **copy with the field replaced** — the with-er pattern. Either rebuild via the constructor (`return new self($this->amount, $newCurrency);`) or `clone` and adjust. This mirrors `DateTimeImmutable`, where `modify()`/`add()` return new instances. It costs an allocation but makes the objects safe to share and cache without defensive copying.",
    },
    {
      q: "Does `readonly` make the object deeply immutable?",
      a: "No — it only prevents **reassigning the property itself**. If a readonly property holds a mutable object, you can still mutate *that* object's internals; the reference is frozen, not the target. Arrays are an exception in practice: because PHP arrays are value types, you can't even modify an element of a readonly array property (that would be an implicit write), so it behaves as frozen.",
    },
    {
      q: "What does `readonly class` add over marking each property in PHP 8.2?",
      a: "Two things. It applies `readonly` to **every declared property** so you don't repeat the keyword, and it **forbids dynamic properties** on instances of that class. Note that a readonly class can only declare typed properties, and a readonly class can't extend a non-readonly class (and vice versa) — readonly-ness must be consistent down the hierarchy.",
    },
  ],

  quiz: [
    {
      question:
        "In which PHP versions did readonly **properties** and readonly **classes** arrive, respectively?",
      options: [
        "8.0 and 8.1",
        "8.1 and 8.2",
        "7.4 and 8.0",
        "8.2 and 8.3",
      ],
      answerIndex: 1,
      explain:
        "Readonly properties were introduced in PHP 8.1; the ability to mark an entire class readonly (making all its properties readonly) followed in PHP 8.2.",
    },
    {
      question:
        "What happens when you assign to a readonly property a second time, from inside the same class?",
      options: [
        "It silently overwrites the value",
        "It emits a deprecation notice but works",
        "It throws an `Error` — initialization is one-shot",
        "It only fails if the write comes from outside the class",
      ],
      answerIndex: 2,
      explain:
        "A readonly property may be initialized once from the declaring class's scope; any subsequent write — even from inside the same object — throws Error: Cannot modify readonly property.",
    },
    {
      question:
        "Which statement about readonly properties is correct?",
      options: [
        "`readonly` can be used without a type declaration",
        "A readonly property may declare a default value, e.g. `public readonly int $x = 0;`",
        "A readonly property must be typed and cannot have a declaration-time default",
        "`static readonly` properties are the recommended way to define constants",
      ],
      answerIndex: 2,
      explain:
        "A readonly property must be typed (untyped readonly is a parse error) and cannot have a default at declaration — it is set exactly once, typically in the constructor. static readonly is not allowed.",
    },
  ],
};

export default lesson;
