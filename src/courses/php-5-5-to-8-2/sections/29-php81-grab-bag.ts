import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "php81-grab-bag",
  title: "The 8.1 Grab Bag: Intersection Types, `new` in Initializers & Final Constants",
  part: "PHP 8.1–8.2: Modern PHP",
  estMinutes: 11,
  summary:
    "A tour of the smaller-but-sharp PHP 8.1 additions — pure intersection types, `new` in default values, string-keyed array unpacking, and finally-sealable class & enum constants.",

  concept: `
PHP 8.1 is best known for enums and readonly properties, but it shipped a cluster
of smaller features that quietly remove old workarounds. Here are the ones worth
keeping in your pocket.

### Pure intersection types: \`A&B\`

8.0 gave you *union* types (\`A|B\` = "either"). 8.1 adds *intersection* types
(\`A&B\` = "both at once"): a value must satisfy **every** listed class-type.

\`\`\`php
function persist(Countable&Traversable $collection): void { /* ... */ }
\`\`\`

In 5.5 you'd accept \`mixed\`/no type and hope, or invent a marker interface that
extends both. Now the engine enforces it. Any class-type may be a member (classes as well as
interfaces), but 8.1 allows *pure* intersections only — mixing \`&\` with \`|\`, as in
\`(A&B)|null\`, had to wait for **DNF types in 8.2**.

### \`new\` in initializers

Before 8.1, a default value had to be a constant expression — so you couldn't
default a parameter to an object and fell back to the nullable-then-assign dance:

\`\`\`php
public function __construct(?Logger $log = null) {
    $this->log = $log ?? new NullLogger();
}
\`\`\`

8.1 lets \`new\` appear directly in default parameter values, static variables,
global constant initializers, and attribute arguments (plain property defaults and
class constant initializers are still constant-expression only):

\`\`\`php
public function __construct(private Logger $log = new NullLogger()) {}
\`\`\`

### Array unpacking with string keys

The spread operator could unpack arrays since 7.4, but only integer keys. 8.1
allows **string keys**, so \`...\` finally works as a clean array merge:

\`\`\`php
$base    = ['theme' => 'dark', 'lang' => 'en'];
$merged  = [...$base, 'lang' => 'fr'];   // later keys win
\`\`\`

### Final class constants

5.5 class constants couldn't be marked \`final\`, so a child class could silently
redefine \`const STATUS = ...\` and break assumptions. 8.1 adds \`final const\`:

\`\`\`php
class Config { final public const VERSION = '1.0'; }
\`\`\`

### Enum constants

Enums (8.1) are classes, so they can carry their own constants — handy for a
sensible default member without a separate global:

\`\`\`php
enum Suit { case Hearts; case Spades; const Default = self::Hearts; }
\`\`\`

Each one erases a 5.5-era workaround; reach for them when the old pattern shows up.
`,

  comparisons: [
    {
      label: "Requiring two interfaces at once",
      intro:
        "We want a function that only accepts collections that are both countable and iterable. The goal is to let the type system reject anything missing either capability, instead of trusting the caller.",
      php: `<?php
// PHP 5.5 — no intersection types; invent a marker interface
// (extend IteratorAggregate, not Traversable directly — Traversable
//  can't be implemented/extended by userland code)
interface CountableTraversable
    extends Countable, IteratorAggregate {}

function persist(CountableTraversable $c) {
    // ...and every collection must now implement the marker
}`,
      ts: `<?php
// PHP 8.1 — pure intersection type, enforced by the engine
function persist(Countable&Traversable $c): void {
    // any value implementing BOTH interfaces is accepted
}`,
      note:
        "Pure intersection types (A&B) arrived in PHP 8.1; before that you faked them with a marker interface extending both.",
    },
    {
      label: "An object as a default value",
      intro:
        "A Service should fall back to a NullLogger when no logger is passed in. We want that default object baked right into the constructor signature, so a plain new Service() still ends up with a working logger.",
      php: `<?php
// PHP 5.5 — defaults must be constants, so null + assign inside
class Service {
    private $log;
    public function __construct($log = null) {
        $this->log = $log ?: new NullLogger();
    }
}`,
      ts: `<?php
// PHP 8.1 — new is allowed directly in the default
class Service {
    public function __construct(
        private Logger $log = new NullLogger(),
    ) {}
}`,
      note:
        "`new` in initializers (PHP 8.1) lets default parameter values construct objects, removing the nullable-then-coalesce pattern.",
    },
    {
      label: "Merging two associative arrays",
      intro:
        "We start with a base config of theme and language, then override the language to French. The result should keep the theme but show lang set to fr.",
      php: `<?php
// PHP 5.5 — array_merge for string keys
$base   = ['theme' => 'dark', 'lang' => 'en'];
$merged = array_merge($base, ['lang' => 'fr']);`,
      ts: `<?php
// PHP 8.1 — spread now accepts string keys
$base   = ['theme' => 'dark', 'lang' => 'en'];
$merged = [...$base, 'lang' => 'fr'];`,
      note:
        "Array unpacking with string keys arrived in PHP 8.1 (integer-key spread was 7.4); later duplicate keys overwrite earlier ones, like array_merge.",
    },
    {
      label: "Sealing a class constant",
      intro:
        "Config defines a VERSION constant that the rest of the code relies on. We want to stop a subclass like Beta from quietly changing that value out from under the parent.",
      php: `<?php
// PHP 5.5 — a child can silently override the constant
class Config {
    const VERSION = '1.0';
}
class Beta extends Config {
    const VERSION = '2.0'; // allowed, no error
}`,
      ts: `<?php
// PHP 8.1 — final const forbids redefinition
class Config {
    final public const VERSION = '1.0';
}
class Beta extends Config {
    const VERSION = '2.0'; // Fatal error: cannot override final
}`,
      note:
        "`final` on class constants arrived in PHP 8.1, preventing subclasses from redefining a constant the parent relies on.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Three 8.1 features in one script: new in a default, string-keyed unpacking, and an enum constant. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

interface Logger { public function log(string $m): string; }

class NullLogger implements Logger {
    public function log(string $m): string { return "[noop] {$m}"; }
}

class Service {
    // new in an initializer (8.1): default to a NullLogger
    public function __construct(public Logger $log = new NullLogger()) {}
}

$svc = new Service();
echo $svc->log->log('boot') . "\\n";

// Array unpacking with string keys (8.1); later keys win
$base   = ['theme' => 'dark', 'lang' => 'en'];
$merged = [...$base, 'lang' => 'fr'];
echo "{$merged['theme']}/{$merged['lang']}\\n";

// Enum with a constant default (8.1)
enum Suit {
    case Hearts;
    case Spades;
    const Default = self::Hearts;
}
echo Suit::Default->name . "\\n";`,
    output: `[noop] boot
dark/fr
Hearts`,
  },

  keyPoints: [
    "Intersection types `A&B` (8.1) require a value to satisfy **all** listed class-types — the opposite of 8.0 unions `A|B`.",
    "`new` in initializers (8.1) lets default parameter values construct objects, killing the `?Type $x = null` then `?? new` pattern.",
    "Spread `...` accepts **string keys** in 8.1 (integer-only in 7.4), giving a literal-friendly `array_merge`.",
    "`final const` (8.1) stops subclasses from silently redefining a constant the parent depends on.",
    "Enums are classes, so they can hold `const` members — a clean place for a default case.",
    "8.1 intersections are **pure** — any class-type may be a member (classes and interfaces), but mixing `&` with `|` as in `(A&B)|null` needed DNF types in 8.2.",
  ],

  interview: [
    {
      q: "What's the difference between a union type and an intersection type, and when did each land?",
      a: "A **union** (`A|B`, PHP 8.0) means the value is *one of* the listed types — either an `A` or a `B`. An **intersection** (`A&B`, PHP 8.1) means the value is *all of them at once* — it must implement both `A` and `B`. Unions widen what you accept; intersections narrow it. In 5.5 you had neither: you'd type-hint loosely and check at runtime, or invent a marker interface extending both to fake an intersection.",
    },
    {
      q: "Before 8.1, why couldn't you write `function f($log = new Logger())`, and what did you do instead?",
      a: "Default values had to be **constant expressions** evaluated at compile time — literals, constants, `const` arrays — and `new` isn't one of those. The standard workaround was to default the parameter to `null` and construct inside the body: `public function __construct(?Logger $log = null) { $this->log = $log ?? new NullLogger(); }`. PHP 8.1 added **`new` in initializers**, so you can put the object straight in the signature: `__construct(private Logger $log = new NullLogger())`. It's also lazy — the default object is only constructed when the argument is actually omitted.",
    },
    {
      q: "What changed about array unpacking in 8.1, and is `[...$a]` now a drop-in for `array_merge`?",
      a: "7.4 introduced the spread operator for arrays but only for **integer keys**; unpacking a string-keyed array was a fatal error. 8.1 lifted that, so `[...$base, 'lang' => 'fr']` works. It mirrors `array_merge` semantics — later duplicate **string** keys overwrite earlier ones. The one gotcha is **integer** keys: `array_merge` renumbers them, whereas spread also renumbers numeric keys (it doesn't preserve them), so for purely string-keyed config it's a clean swap, but verify behaviour if you rely on specific numeric indices.",
    },
    {
      q: "Why would you mark a class constant `final`, and what problem does it solve from the 5.5 era?",
      a: "In 5.5 a subclass could redefine any inherited `const`, silently changing a value the parent's logic assumed — a subtle source of bugs. **`final const`** (8.1) forbids that override, so the constant is guaranteed identical down the hierarchy. It's the constant-level equivalent of `final` on a method: you're declaring this value is part of the contract and must not be reinterpreted by children.",
    },
  ],

  quiz: [
    {
      question: "What does the parameter type `Countable&Traversable` require?",
      options: [
        "A value that is either Countable or Traversable",
        "A value that implements both Countable and Traversable",
        "A value that extends a class named CountableTraversable",
        "Nothing — `&` in a type is a syntax error",
      ],
      answerIndex: 1,
      explain:
        "An intersection type (PHP 8.1) requires the value to satisfy ALL listed types simultaneously — here it must implement both Countable and Traversable. `|` would mean 'either'.",
    },
    {
      question:
        "When is the `new NullLogger()` default in `__construct(Logger $log = new NullLogger())` evaluated?",
      options: [
        "Once at class-definition time, then shared by every instance",
        "Never — `new` in a default is still a syntax error in 8.1",
        "Each time the constructor is called without supplying that argument",
        "Only if you also mark the parameter readonly",
      ],
      answerIndex: 2,
      explain:
        "`new` in initializers (PHP 8.1) is evaluated lazily: a fresh object is constructed each time the call omits the argument, not once at definition time.",
    },
    {
      question:
        "Given `$base = ['lang' => 'en']`, what is `[...$base, 'lang' => 'fr']`?",
      options: [
        "A fatal error — string keys can't be unpacked",
        "['lang' => 'en'] — the original key wins",
        "['lang' => 'fr'] — the later key overwrites",
        "['lang' => 'en', 'lang' => 'fr'] — both kept",
      ],
      answerIndex: 2,
      explain:
        "String-keyed array unpacking (PHP 8.1) follows array_merge semantics: when keys collide, the later occurrence overwrites the earlier, so 'lang' becomes 'fr'.",
    },
  ],
};

export default lesson;
