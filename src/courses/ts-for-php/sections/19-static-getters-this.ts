import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "static-getters-this",
  title: "Static Members, Accessors & this",
  part: "Object-Oriented TypeScript",
  estMinutes: 13,
  summary:
    "Class-level static members, get/set accessors, and the one genuinely surprising thing for a PHP developer: in JavaScript, `this` is decided by how a method is called, not where it's defined.",

  concept: `
You already think in classes from PHP, so most of this maps cleanly. The twist is
\`this\`: PHP guarantees \`$this\` is the object the method lives on. JavaScript does
**not** — \`this\` is bound at the **call-site**.

### Static fields & methods

Static members belong to the **class**, not to an instance — exactly like PHP's
\`static\` / \`self::\`.

\`\`\`typescript
class Counter {
  static total = 0;            // one value shared by the whole class
  static reset(): void {       // called as Counter.reset()
    Counter.total = 0;
  }
}
Counter.total++;               // no instance needed
\`\`\`

### A static factory method

A static method is the idiomatic way to build "named constructors" — the same
trick you use in PHP with \`public static function fromArray(...)\`.

\`\`\`typescript
class User {
  private constructor(public readonly name: string) {}
  static fromJson(raw: string): User {
    return new User(JSON.parse(raw).name);
  }
}
const u = User.fromJson(\`{"name":"Ada"}\`);
\`\`\`

### get / set accessors

TypeScript has **real** accessors built into the language — no \`__get\`/\`__set\`
magic. They look like properties to callers but run code.

\`\`\`typescript
class Temp {
  private _c = 0;
  get fahrenheit(): number { return this._c * 9 / 5 + 32; }
  set fahrenheit(f: number) { this._c = (f - 32) * 5 / 9; }
}
const t = new Temp();
t.fahrenheit = 212;            // calls the setter
console.log(t.fahrenheit);     // calls the getter -> 212
\`\`\`

### How \`this\` works — and breaks

Inside a normal method, \`this\` is the object **only when called as** \`obj.method()\`.
Pull the method out and pass it as a callback and \`this\` is lost:

\`\`\`typescript
class Bell {
  sound = "ding";
  ring() { console.log(this.sound); }
}
const b = new Bell();
setTimeout(b.ring, 0);         // 💥 logs undefined: the host supplies its own
                               // receiver (window in browsers, the Timeout
                               // object in Node) — never the Bell instance
\`\`\`

The fix is an **arrow method**, which captures \`this\` from where it was defined
(lexically), so it can never be detached:

\`\`\`typescript
class Bell {
  sound = "ding";
  ring = () => { console.log(this.sound); };  // bound for life
}
setTimeout(new Bell().ring, 0); // "ding"
\`\`\`

Coming from PHP, treat regular methods as "callable only via the object" and arrow
properties as "safe to hand to anyone." The catch: an arrow property is a separate
function per instance (more memory than a shared prototype method) and can't be
reached via \`super.method\` in a subclass — so reach for it only when you actually
need the auto-binding.
`,

  comparisons: [
    {
      label: "Static members & static factory",
      intro:
        "We want a class-level counter that tracks how many User objects were built through a named-constructor method. After creating one user via the factory, the shared count should read 1.",
      php: `<?php
declare(strict_types=1);

class User {
    public static int $count = 0;

    private function __construct(public readonly string $name) {}

    public static function fromName(string $n): static {
        self::$count++;            // self:: or static::
        return new static($n);
    }
}

$u = User::fromName("Ada");
echo User::$count;                 // 1`,
      ts: `class User {
  static count = 0;

  private constructor(public readonly name: string) {}

  static fromName(n: string): User {
    User.count++;                  // refer to the class by name
    return new User(n);
  }
}

const u = User.fromName("Ada");
console.log(User.count);           // 1`,
      note:
        "PHP uses self::/static:: and ::; TypeScript uses ClassName. and .. There's no `static::` keyword, but inside a static method `this` *is* the class it was called on, so `new this()` gives you PHP's late static binding.",
    },
    {
      label: "Magic accessors vs real accessors",
      intro:
        "We want a Temp class that exposes a computed fahrenheit value backed by a private Celsius field, so reading or assigning fahrenheit transparently converts. The goal is property-style access that actually runs conversion code.",
      php: `<?php
class Temp {
    private float $c = 0.0;

    // Catch-all magic methods, untyped per-property:
    public function __get(string $name): mixed {
        if ($name === 'fahrenheit') return $this->c * 9 / 5 + 32;
        throw new \\Exception("no $name");
    }
    public function __set(string $name, $value): void {
        if ($name === 'fahrenheit') { $this->c = ($value - 32) * 5 / 9; return; }
        throw new \\Exception("no $name");
    }
}`,
      ts: `class Temp {
  private c = 0;

  get fahrenheit(): number {
    return this.c * 9 / 5 + 32;
  }
  set fahrenheit(value: number) {
    this.c = (value - 32) * 5 / 9;
  }
}`,
      note:
        "PHP's __get/__set are dynamic, string-keyed fallbacks with no per-property types. TS accessors are named, strongly typed, and visible to autocomplete.",
    },
    {
      label: "$this is always bound vs this depends on the call",
      intro:
        "Here we take a method off an object, store it in a variable, and call it on its own to see whether it still knows which object it belongs to. PHP prints the sound fine, while the detached JS method blows up.",
      php: `<?php
class Bell {
    public string $sound = "ding";
    public function ring(): void {
        echo $this->sound;         // $this is ALWAYS this object
    }
}
$fn = [new Bell(), 'ring'];        // a callable
$fn();                             // "ding" — binding never lost`,
      ts: `class Bell {
  sound = "ding";
  ring() {
    console.log(this.sound);       // depends on how it's CALLED
  }
}
const fn = new Bell().ring;        // detached method
fn();                              // 💥 this is undefined`,
      note:
        "In PHP $this is fixed by the object. In JS `this` is set by the call-site, so a detached method loses it.",
    },
    {
      label: "Fixing this: arrow method (auto-bound)",
      intro:
        "Same detached-method scenario as before, but now we want the call to succeed. Declaring ring as an arrow property makes it print the sound even after being pulled off the instance.",
      php: `<?php
// In PHP there's no problem to fix — a callable keeps its $this.
$fn = (new Bell())->ring(...);     // first-class callable, still bound
$fn();                             // "ding"`,
      ts: `class Bell {
  sound = "ding";
  // Arrow property captures this lexically, once, forever:
  ring = () => {
    console.log(this.sound);
  };
}
const fn = new Bell().ring;
fn();                              // "ding" — safe to detach`,
      note:
        "An arrow class property binds `this` at construction time, so it survives being passed as a callback (e.g. to setTimeout or an event handler). Trade-offs (per the TS handbook): each instance gets its own copy of the function (more memory than a shared prototype method), and you can't call it via `super.method` from a derived class. It's not a free win over regular methods.",
    },
  ],

  playground: {
    intro:
      "A class with a static counter, a get/set accessor pair, a normal method, and an arrow method. Watch how the normal method loses `this` when detached, while the arrow method keeps it.",
    code: `class BankAccount {
  // Static: shared across every instance (like PHP's static $count).
  static openedAccounts = 0;

  private _balance = 0;

  constructor(public readonly owner: string) {
    BankAccount.openedAccounts++;
  }

  // Accessors: look like a property, run code underneath.
  get balance(): number {
    return this._balance;
  }
  set balance(amount: number) {
    if (amount < 0) throw new Error("Balance cannot be negative");
    this._balance = amount;
  }

  // Normal method: this works ONLY when called as account.describe().
  describe(): string {
    return \`\${this.owner} has $\${this._balance}\`;
  }

  // Arrow method: this is bound at construction, safe to detach.
  describeArrow = (): string => {
    return \`\${this.owner} has $\${this._balance}\`;
  };
}

const acc = new BankAccount("Ada");
acc.balance = 100;                 // setter
console.log(acc.balance);          // getter -> 100
console.log(acc.describe());       // "Ada has $100"

new BankAccount("Bob");
console.log("Accounts opened:", BankAccount.openedAccounts); // 2

// Detach both methods and call them with no object in front:
const detachedNormal = acc.describe;
const detachedArrow = acc.describeArrow;

try {
  console.log(detachedNormal());   // this is undefined -> throws
} catch (e) {
  console.log("describe() failed:", (e as Error).message);
}

console.log("describeArrow() works:", detachedArrow()); // still "Ada has $100"`,
  },

  keyPoints: [
    "`static` members belong to the class, accessed as `ClassName.member` — PHP's `static`/`self::` with `.` instead of `::`.",
    "Static methods are the idiomatic **factory / named-constructor** pattern (like PHP's `static function fromX`).",
    "`get`/`set` accessors are real language features — typed and autocompletable, unlike PHP's dynamic `__get`/`__set` magic.",
    "In JS, `this` is set by the **call-site**: `obj.method()` binds it, a detached `const f = obj.method` does not.",
    "Under `strict`, a lost `this` is `undefined` and accessing a property on it throws at runtime.",
    "Use an **arrow class property** (`m = () => {}`) when a method must keep its `this` after being passed as a callback.",
  ],

  interview: [
    {
      q: "Coming from PHP, what's the biggest gotcha with `this` in JavaScript classes?",
      a: "In PHP, `$this` is always the object the method belongs to — it can never be lost. In JavaScript, `this` is determined by **how the method is called**, not where it's defined. `account.describe()` binds `this` to `account`, but if you detach it — `const f = account.describe; f();` — `this` is `undefined` (in strict mode), and reading a property off it throws. This bites hardest when passing a method as a callback to `setTimeout`, an array method, or an event handler.",
    },
    {
      q: "How do you keep `this` bound when passing a method as a callback?",
      a: "Three common fixes:\n\n- **Arrow class property**: `ring = () => { ... }`. It captures `this` lexically at construction, so it's permanently bound and safe to detach. This is the most common modern choice.\n- **`.bind(this)`**: `this.ring = this.ring.bind(this)` in the constructor — the classic approach.\n- **Wrap at the call-site**: `setTimeout(() => obj.ring(), 0)`, which calls it as `obj.ring()` so `this` stays correct.\n\nFor an ex-PHP dev: PHP needs none of this because callables retain their `$this`; in JS you opt into binding explicitly.",
    },
    {
      q: "How do TypeScript's `get`/`set` accessors differ from PHP's `__get`/`__set`?",
      a: "PHP's `__get`/`__set` are **dynamic catch-all magic methods**: one method handles *any* undefined property by string name, they're untyped per-property, and they're invisible to tooling. TypeScript accessors are **named and per-property** (`get fahrenheit()`), strongly typed, show up in autocomplete, and the getter/setter types must agree. From the caller's side both look like plain property access, but TS accessors are explicit and type-safe rather than a runtime fallback.",
    },
    {
      q: "Why use a static factory method instead of just calling `new`?",
      a: "Same reasons as PHP's `static function fromArray()`: you can give the constructor a **meaningful name** (`User.fromJson`, `User.guest`), do async or validation work and return a ready object, make the real constructor `private` to force construction through your factory, and return cached or subclass instances. It centralizes object creation, which is exactly the named-constructor pattern you already use in PHP.",
    },
    {
      q: "When does a static property's value get shared, and what's the risk?",
      a: "A `static` field is a single slot on the class itself, shared by every instance and every piece of code that touches the class — just like a PHP `static $count`. That's perfect for counters, caches, or registries, but it's effectively **global mutable state**: it persists for the life of the module, makes tests order-dependent if you mutate it, and isn't reset between instances. Reach for it deliberately, not as a convenience.",
    },
  ],

  quiz: [
    {
      question:
        "What happens when you run `const f = account.describe; f();` for a normal (non-arrow) method under `strict`?",
      options: [
        "`this` is still `account`, exactly like PHP",
        "`this` is `undefined`, so accessing a property on it throws",
        "TypeScript refuses to compile detached methods",
        "`this` automatically points to the global object",
      ],
      answerIndex: 1,
      explain:
        "`this` is set by the call-site. Calling `f()` with nothing before the dot means there's no receiver, so in strict mode `this` is `undefined` and reading a property on it throws at runtime.",
    },
    {
      question:
        "Which declaration makes a method safe to pass directly to `setTimeout` without losing `this`?",
      options: [
        "`describe(): string { ... }`",
        "`static describe(): string { ... }`",
        "`describe = (): string => { ... }`",
        "`get describe(): string { ... }`",
      ],
      answerIndex: 2,
      explain:
        "An arrow class property captures `this` lexically when the instance is constructed, so it stays bound even when detached and passed as a callback.",
    },
    {
      question:
        "How are TypeScript `get`/`set` accessors different from PHP's `__get`/`__set`?",
      options: [
        "They are identical dynamic catch-alls",
        "They are named, per-property, and strongly typed rather than a dynamic string-keyed fallback",
        "They only work on static members",
        "They require calling them like methods, e.g. `obj.balance()`",
      ],
      answerIndex: 1,
      explain:
        "TS accessors are declared per property with real types and full tooling support, whereas PHP's magic methods are dynamic catch-alls keyed by string name with no per-property typing.",
    },
  ],
};

export default lesson;
