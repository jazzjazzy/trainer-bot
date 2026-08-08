import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "constructor-promotion",
  title: "Constructor Property Promotion: Kill the Boilerplate",
  part: "PHP 8.0: The Big Leap",
  estMinutes: 11,

  summary:
    "PHP 8.0 lets you declare and assign object properties straight from the constructor signature, collapsing the classic declare-then-assign ritual into a single line.",

  concept: `
Writing a value object in PHP 5.5 means saying everything **three times**: you
name each property in the class body, name it again as a constructor parameter,
and then wire \`\$this->x = \$x\` for every single field. For a four-field DTO that's
a dozen lines of pure ceremony — and a magnet for typos like assigning \`\$y\` to
\`\$this->x\`.

### The old ritual

\`\`\`php
class Money {
    private $amount;
    private $currency;
    public function __construct($amount, $currency) {
        $this->amount = $amount;
        $this->currency = $currency;
    }
}
\`\`\`

### Promotion: declare + assign in the signature

PHP **8.0** introduced **constructor property promotion**. Put a visibility
modifier (\`public\`, \`private\`, or \`protected\`) in front of a constructor
parameter and PHP automatically:

1. declares a property of that name and visibility, and
2. assigns the argument to it before the body runs.

\`\`\`php
class Money {
    public function __construct(
        private int $amount,
        private string $currency,
    ) {}
}
\`\`\`

Both classes are equivalent. The promoted version keeps the type, supports
default values, and you can still add a constructor body — promotion happens
first, so \`\$this->amount\` is already set by the time your code runs.

### Combine with readonly

From PHP **8.1** you can add \`readonly\` to a promoted parameter to get an
immutable property in one stroke — the idiomatic modern value object:

\`\`\`php
final class Point {
    public function __construct(
        public readonly int $x = 0,
        public readonly int $y = 0,
    ) {}
}
\`\`\`

### The rules and gotchas

- Promotion works **only** in \`__construct\` — not in other methods.
- You can **mix** promoted and ordinary parameters in the same signature.
- A promoted param **cannot** be \`callable\`, and \`var\` is not allowed — use a real
  visibility keyword.
- Promotion needs an **explicit visibility** modifier; a bare typed parameter is
  still just a parameter.
- The **trailing comma** after the last parameter (legal in parameter lists
  since PHP 8.0) keeps diffs clean as you add fields.
`,

  comparisons: [
    {
      label: "A two-field value object",
      intro:
        "Modeling a Money type that just holds an amount and a currency. Both versions build the same class with two private fields wired up from the constructor.",
      php: `<?php
// PHP 5.5 — name each property three times
class Money {
    private $amount;
    private $currency;

    public function __construct($amount, $currency) {
        $this->amount = $amount;
        $this->currency = $currency;
    }
}`,
      ts: `<?php
// PHP 8.0 — declared + assigned from the signature
class Money {
    public function __construct(
        private int $amount,
        private string $currency,
    ) {}
}`,
      note:
        "Constructor property promotion (PHP 8.0) replaces the declare-then-assign boilerplate; the property is set before the constructor body runs.",
    },
    {
      label: "An immutable point",
      intro:
        "Building a Point with x and y coordinates that should never change after it is created. The goal is a value object whose fields are fixed once constructed.",
      php: `<?php
// PHP 5.5 — manual properties, no immutability
class Point {
    private $x;
    private $y;

    public function __construct($x, $y) {
        $this->x = $x;
        $this->y = $y;
    }
}`,
      ts: `<?php
// PHP 8.1 — promotion + readonly = immutable VO
final class Point {
    public function __construct(
        public readonly int $x,
        public readonly int $y,
    ) {}
}`,
      note:
        "readonly on a promoted property (PHP 8.1) locks it after construction, so any later $point->x = ... throws an Error.",
    },
    {
      label: "Mixing promoted and plain params",
      intro:
        "A User class that stores a name as-is but normalizes the email to lowercase first. One field passes straight through while the other needs a transform before it is saved.",
      php: `<?php
// PHP 5.5 — everything explicit, body does the work
class User {
    private $name;
    private $email;

    public function __construct($name, $email) {
        $this->name = $name;
        $this->email = strtolower($email);
    }
}`,
      ts: `<?php
// PHP 8.0 — promote one, keep a plain param for logic
class User {
    private string $email;

    public function __construct(
        private string $name,
        string $email,
    ) {
        $this->email = strtolower($email);
    }
}`,
      note:
        "You can mix promoted and ordinary parameters (PHP 8.0); a plain param lets you transform the value before assigning it in the body.",
    },
    {
      label: "Defaults on promoted properties",
      intro:
        "A Config object with an optional retries setting that falls back to 3 when no value is passed. The aim is to show that a promoted property can still carry a default.",
      php: `<?php
// PHP 5.5 — default lives on the parameter
class Config {
    private $retries;

    public function __construct($retries = 3) {
        $this->retries = $retries;
    }
}`,
      ts: `<?php
// PHP 8.0 — default stays on the promoted param
class Config {
    public function __construct(
        private int $retries = 3,
    ) {}
}`,
      note:
        "Promoted parameters keep parameter defaults (PHP 8.0), so optional constructor arguments work exactly as before.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A promoted, readonly value object. Read it, predict what it prints, then reveal the output.",
    code: `<?php
declare(strict_types=1);

final class Money {
    public function __construct(
        public readonly int $amount,
        public readonly string $currency = 'USD',
    ) {}

    public function format(): string {
        return number_format($this->amount / 100, 2) . ' ' . $this->currency;
    }
}

$price = new Money(1999);
echo $price->format() . "\\n";
echo $price->currency . "\\n";

$eur = new Money(amount: 2500, currency: 'EUR');
echo $eur->format() . "\\n";

try {
    $price->amount = 5000;
} catch (Error $e) {
    echo "blocked: " . $e->getMessage() . "\\n";
}`,
    output: `19.99 USD
USD
25.00 EUR
blocked: Cannot modify readonly property Money::$amount`,
  },

  keyPoints: [
    "Constructor property promotion (PHP **8.0**) declares and assigns a property from a constructor parameter when you give it a visibility modifier.",
    "It works **only** in `__construct`; the property is set before the constructor body runs.",
    "Add `readonly` (PHP **8.1**) to a promoted param for a one-line immutable value object.",
    "You can freely **mix** promoted and plain parameters, and promoted params keep their defaults.",
    "A promoted param needs an explicit `public`/`private`/`protected` — `var` and `callable` types are not allowed.",
  ],

  interview: [
    {
      q: "What exactly does constructor property promotion do, and when was it added?",
      a: "Added in **PHP 8.0**, it lets you put a visibility modifier (`public`/`private`/`protected`) on a constructor parameter. PHP then automatically declares a property of that name and visibility and assigns the argument to it **before** the constructor body executes. It removes the classic `private $x; ... $this->x = $x;` triple-naming, turning a value object into just its constructor signature.",
    },
    {
      q: "Can you still run logic in a constructor that uses promotion?",
      a: "Yes. Promotion only changes how the parameters are declared and assigned — you can still have a full constructor body. The promoted assignments happen first, so `$this->amount` is already populated when your body runs. You can also **mix** promoted parameters with ordinary ones: promote the fields that map straight through, and keep a plain parameter when you need to transform a value (e.g. `strtolower($email)`) before assigning it yourself.",
    },
    {
      q: "How do promotion and readonly fit together?",
      a: "`readonly` properties arrived in **PHP 8.1** and combine cleanly with promotion: `public readonly int $x` in the constructor signature gives you a property that's declared, assigned, and immutable after construction — all in one line. Attempting to reassign it later throws an `Error`. This pairing is the modern idiom for immutable value objects / DTOs.",
    },
    {
      q: "What are the restrictions on a promoted parameter?",
      a: "It must appear in `__construct` (nowhere else); it needs an explicit visibility keyword (a bare typed param is *not* promoted, and `var` isn't allowed); and its type **cannot** be `callable`. It can have a default value and can be combined with `readonly`. Abstract constructors and interface method signatures can't use promotion either.",
    },
  ],

  quiz: [
    {
      question: "Which PHP version introduced constructor property promotion?",
      options: ["PHP 7.4", "PHP 8.0", "PHP 8.1", "PHP 8.2"],
      answerIndex: 1,
      explain:
        "Constructor property promotion was introduced in PHP 8.0. (readonly, which often accompanies it, came one version later in 8.1.)",
    },
    {
      question: "What makes a constructor parameter get promoted to a property?",
      options: [
        "Having a type declaration",
        "Having a default value",
        "Having an explicit visibility modifier (public/private/protected)",
        "Being the first parameter in the constructor",
      ],
      answerIndex: 2,
      explain:
        "Only a visibility modifier triggers promotion. A bare `int $x` is just a parameter; `private int $x` declares and assigns a `$x` property.",
    },
    {
      question:
        "Given `public function __construct(public readonly int $x) {}`, what happens at `$obj->x = 5;` after construction?",
      options: [
        "It silently updates the property",
        "It throws an Error because the property is readonly",
        "It is a fatal parse error",
        "It creates a dynamic property",
      ],
      answerIndex: 1,
      explain:
        "readonly (PHP 8.1) makes the promoted property immutable after initialization, so any later write throws `Error: Cannot modify readonly property`.",
    },
  ],
};

export default lesson;
