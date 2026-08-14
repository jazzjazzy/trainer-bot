import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "classes",
  title: "Classes",
  part: "Object-Oriented TypeScript",
  estMinutes: 14,
  summary:
    "TypeScript classes are PHP 8 classes with the same vocabulary — typed fields, constructors, visibility keywords, readonly, and constructor promotion — plus one genuinely new runtime feature: true #private fields.",

  concept: `
If you've written PHP 8, you already know about 90% of TypeScript classes. Same
keyword, same \`new\`, same \`$this\`-but-spelled-\`this\`, same visibility modifiers,
same constructor promotion. The mental model transfers almost perfectly. The two
things worth slowing down for are how **TS \`private\` differs from JS \`#private\`**,
and how **field types** are declared.

### Typed fields and the constructor

Fields are declared at the top of the class body with a type annotation, much
like typed properties in PHP. Under \`strict\`, every field must be initialised —
either inline, or in the constructor — or TypeScript complains it has no value.

\`\`\`typescript
class Account {
  balance: number;          // declared, typed
  owner: string;

  constructor(owner: string) {
    this.owner = owner;
    this.balance = 0;       // initialised here
  }
}
\`\`\`

### Access modifiers

\`public\`, \`private\`, and \`protected\` mean exactly what they mean in PHP. Members
are \`public\` by default (PHP defaults to public too). \`protected\` is visible to
subclasses; \`private\` is visible only inside the declaring class.

### readonly

\`readonly\` marks a field as assignable only in its declaration or constructor —
the direct analogue of PHP 8.1's \`readonly\` properties. It's a **compile-time**
guarantee; nothing stops a plain-JS caller from mutating it at runtime.

### Parameter properties (constructor promotion)

This is identical in spirit to PHP 8's constructor property promotion. Put a
modifier on a constructor parameter and TypeScript declares **and** assigns the
field for you:

\`\`\`typescript
class Point {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}   // no body needed — x and y are set automatically
}
\`\`\`

### TS \`private\` vs JS \`#private\` — the one real gotcha

\`private\` is a **TypeScript-only**, compile-time rule. It vanishes when types are
erased, so at runtime the field is just an ordinary public property — reachable
from plain JavaScript callers or via an \`(obj as any)\` cast. Note that
\`obj["secret"]\` is a deliberate escape hatch: TypeScript **allows** bracket-notation
access to a \`private\` member, which is why the handbook calls it *soft* private.

The \`#name\` syntax is a **real JavaScript language feature**. It's genuinely
inaccessible outside the class, even at runtime, even from JS. If you need true
encapsulation (not just an editor warning), reach for \`#\`.
`,

  comparisons: [
    {
      label: "A basic class — nearly identical",
      intro:
        "Define a User class that stores a name and exposes a greet method. Constructing one with a name and calling greet should return a friendly hello string.",
      php: `<?php
declare(strict_types=1);

class User {
    public string $name;

    public function __construct(string $name) {
        $this->name = $name;
    }

    public function greet(): string {
        return "Hi {$this->name}";
    }
}`,
      ts: `class User {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  greet(): string {
    return \`Hi \${this.name}\`;
  }
}`,
      note:
        "Same shape. No `function` keyword on methods, `this` instead of `$this`, and types go after the name.",
    },
    {
      label: "Constructor promotion vs parameter properties",
      intro:
        "Build an immutable Point with x and y coordinates using the shorthand that declares and assigns both fields straight from the constructor signature. The result is a class with two readonly fields and no constructor body.",
      php: `<?php
declare(strict_types=1);

class Point {
    public function __construct(
        public readonly int $x,
        public readonly int $y,
    ) {}
}`,
      ts: `class Point {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}`,
      note:
        "Almost line-for-line the same feature: a modifier on the parameter declares and assigns the field.",
    },
    {
      label: "Visibility keywords match",
      intro:
        "Model a Wallet whose balance is hidden from the outside and a currency that subclasses can see, with a public deposit method to change the balance. Only deposit should be callable from outside the class.",
      php: `<?php
declare(strict_types=1);

class Wallet {
    private int $balance = 0;
    protected string $currency = "USD";

    public function deposit(int $n): void {
        $this->balance += $n;
    }
}`,
      ts: `class Wallet {
  private balance = 0;
  protected currency = "USD";

  deposit(n: number): void {
    this.balance += n;
  }
}`,
      note:
        "public/private/protected behave the same. Both languages default members to public.",
    },
    {
      label: "readonly properties",
      intro:
        "Store an apiKey on a Config object that can be set once at construction but never changed afterwards. Creating the config works, but trying to reassign the key should be rejected.",
      php: `<?php
declare(strict_types=1);

class Config {
    public function __construct(
        public readonly string $apiKey,
    ) {}
}

$c = new Config("abc");
// $c->apiKey = "x"; // Error: cannot modify readonly`,
      ts: `class Config {
  constructor(public readonly apiKey: string) {}
}

const c = new Config("abc");
// c.apiKey = "x"; // Error: cannot assign to readonly`,
      note:
        "Same intent. PHP enforces readonly at runtime; TS enforces it only at compile time.",
    },
    {
      label: "TS private vs real #private",
      intro:
        "Hide a secret value inside a Box class and ask how strongly it is actually protected. The goal is to see which approach keeps the value unreachable once the code is running, not just while type-checking.",
      php: `<?php
declare(strict_types=1);

class Box {
    private string $secret = "hidden";
}
// PHP enforces private at runtime — always a real error.`,
      ts: `class Box {
  private tsSecret = "soft";   // compile-time only
  #realSecret = "hard";        // true runtime privacy
}
// (new Box() as any).tsSecret  // reachable at runtime
// (new Box()).#realSecret      // syntax error anywhere outside`,
      note:
        "TS `private` is erased and bypassable at runtime; `#field` is enforced by the JS engine itself.",
    },
  ],

  playground: {
    intro:
      "A class with promoted constructor params, a true #private field, and a method. Run it, then try logging account.#pin — it won't even parse.",
    code: `class BankAccount {
  // Promoted params: declared AND assigned automatically.
  constructor(
    public readonly owner: string,
    private balance: number,
  ) {}

  // True runtime-private field:
  #pin = "0000";

  deposit(amount: number): void {
    this.balance += amount;
  }

  describe(): string {
    return \`\${this.owner} has $\${this.balance} (pin set: \${this.#pin !== ""})\`;
  }
}

const account = new BankAccount("Ada", 100);
account.deposit(50);

console.log(account.describe());   // Ada has $150 (pin set: true)
console.log("Owner:", account.owner);

// account.owner = "Bob";   // readonly — compile error if uncommented
// console.log(account.#pin);  // # field is unreachable from out here`,
  },

  keyPoints: [
    "TS classes mirror PHP 8: `class`, `new`, `this`, and `public`/`private`/`protected` all carry over.",
    "Fields are declared with a type and, under `strict`, **must be initialised** inline or in the constructor.",
    "Parameter properties = PHP 8 **constructor promotion**: a modifier on a ctor param declares and assigns the field.",
    "`readonly` mirrors PHP 8.1 readonly — but TS enforces it only at **compile time**.",
    "TS `private` is a compile-time-only rule that is **erased** and bypassable at runtime.",
    "`#field` is a real JavaScript feature giving **true runtime privacy** — use it when you need real encapsulation.",
  ],

  interview: [
    {
      q: "What is a parameter property in TypeScript, and what PHP feature does it map to?",
      a: "A **parameter property** is a constructor parameter with an access modifier (`public`, `private`, `protected`) and/or `readonly` on it. TypeScript then automatically declares a field of the same name and assigns the argument to it — so an empty constructor body still produces fully-initialised fields. It's the direct equivalent of **PHP 8 constructor property promotion**:\n\n```typescript\nclass Point {\n  constructor(public readonly x: number, public readonly y: number) {}\n}\n```\n\nBoth languages added this to kill the boilerplate of declaring a field, then re-typing it in the constructor just to assign it.",
    },
    {
      q: "Explain the difference between TypeScript's `private` and JavaScript's `#private`.",
      a: "`private` is a **TypeScript-only**, compile-time concept. The checker stops you from accessing the member from outside the class, but the keyword is **erased** during compilation — at runtime the field is an ordinary public property, reachable from plain JavaScript or via an `(obj as any)` cast (bracket notation is an intentional escape hatch — `obj[\"secret\"]` type-checks fine, so `private` is only *soft* private). `#name` is a **native JavaScript** feature: the field is truly inaccessible outside its class at runtime, enforced by the engine, even from JS that never saw your types. Coming from PHP — where `private` is enforced at runtime — TS `private` is weaker than you'd expect, while `#` matches the strength you're used to.",
    },
    {
      q: "Does `readonly` in TypeScript protect a field at runtime?",
      a: "No. `readonly` is a **compile-time** guarantee only. TypeScript will refuse to compile code that reassigns the field after construction, but the emitted JavaScript has no such protection — a plain-JS caller (or a `(obj as any)` cast) can still mutate it. This contrasts with PHP 8.1 `readonly`, which throws an `Error` at runtime on reassignment. If you need runtime immutability in TS you'd combine `#private` fields with getters, or freeze the object with `Object.freeze`.",
    },
    {
      q: "Under `strict`, why might TypeScript complain that a class field is not definitely assigned?",
      a: "With `strictPropertyInitialization` (part of `strict`), every declared field must be guaranteed a value by the end of the constructor — either initialised inline (`balance = 0`) or assigned in the constructor body. If neither happens, TS errors because the field could be `undefined` despite its type. Fixes include initialising it, assigning it in the constructor, marking it optional (`balance?: number`), or — if you know better than the checker — using the definite-assignment assertion `balance!: number`.",
    },
  ],

  quiz: [
    {
      question:
        "What does putting `public readonly` on a constructor parameter do?",
      options: [
        "Nothing — modifiers aren't allowed on parameters",
        "Declares a public readonly field and assigns the argument to it automatically",
        "Makes the whole constructor read-only",
        "Creates a static property shared across all instances",
      ],
      answerIndex: 1,
      explain:
        "That's a parameter property (constructor promotion): TS declares a field of the same name, marks it public + readonly, and assigns the argument — no constructor body needed.",
    },
    {
      question:
        "Which truly prevents access from plain JavaScript at runtime?",
      options: [
        "private balance",
        "protected balance",
        "#balance",
        "readonly balance",
      ],
      answerIndex: 2,
      explain:
        "`#balance` is a native JavaScript private field, enforced by the engine. `private`/`protected`/`readonly` are TypeScript compile-time concepts that are erased and bypassable at runtime.",
    },
    {
      question:
        "Under `strict`, a declared field `balance: number` is never assigned. What happens?",
      options: [
        "It silently defaults to 0",
        "It compiles fine because the type allows undefined",
        "TypeScript errors that the field is not definitely assigned",
        "It throws a TypeError when the class is defined",
      ],
      answerIndex: 2,
      explain:
        "strictPropertyInitialization requires every field to be assigned inline or in the constructor; otherwise TS reports it as not definitely assigned.",
    },
  ],
};

export default lesson;
