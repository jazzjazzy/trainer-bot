import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "inheritance-and-abstract",
  title: "Inheritance & Abstract Classes",
  part: "Object-Oriented TypeScript",
  estMinutes: 14,
  summary:
    "How TypeScript does class inheritance, super calls, method overriding, abstract base classes, and protected members — almost all of it the same shape as PHP, plus one new safety keyword.",

  concept: `
If you've written PHP classes, you already know this chapter. TypeScript inherits
its OO model from the same family tree, so \`extends\`, \`abstract\`, and visibility
modifiers all line up with what you do every day. There's one genuinely new tool —
the \`override\` keyword — and it exists to catch a bug PHP can't.

### extends and super()

A subclass uses \`extends\` exactly like PHP. The difference is the constructor:
where PHP calls \`parent::__construct(...)\`, TypeScript calls \`super(...)\`. If the
subclass declares its own constructor, you **must** call \`super()\` before touching
\`this\` — the compiler enforces it.

\`\`\`ts
class Animal {
  constructor(protected name: string) {}
  describe(): string {
    return \`\${this.name} is an animal\`;
  }
}

class Dog extends Animal {
  constructor(name: string, private breed: string) {
    super(name); // PHP: parent::__construct($name)
  }
}
\`\`\`

### Overriding methods and the override keyword

To override, you just redeclare the method — same as PHP. Call the parent version
with \`super.method()\` (PHP: \`parent::method()\`).

The new part: marking the method \`override\`. It tells the compiler "this is
*meant* to replace a parent method." If you typo the name, or the parent method
gets renamed later, the build fails instead of silently creating a brand-new
method. Turn on \`noImplicitOverride\` in \`tsconfig.json\` to make \`override\`
mandatory.

\`\`\`ts
class Dog extends Animal {
  override describe(): string {
    return \`\${super.describe()} (a dog)\`;
  }
}
\`\`\`

### Abstract classes and methods

\`abstract\` works just like PHP: you can't instantiate an abstract class, and an
\`abstract\` method has no body — subclasses must implement it.

\`\`\`ts
abstract class Shape {
  abstract area(): number;        // no body, must be implemented
  describe(): string {            // concrete, shared by all shapes
    return \`area = \${this.area()}\`;
  }
}
\`\`\`

### protected members

\`protected\` means "visible to this class and its subclasses, but not outside" —
identical semantics to PHP. TypeScript also adds \`private\` and the default
\`public\`. These are **compile-time** checks (with a runtime-enforced \`#private\`
variant available too), whereas PHP enforces visibility at runtime.
`,

  comparisons: [
    {
      label: "extends + constructor / super()",
      intro:
        "A Dog subclass extends Animal and needs to add its own breed field while still letting the parent set up name. The goal is to wire the child constructor to the parent's so both fields get initialized.",
      php: `<?php
class Animal {
    public function __construct(protected string $name) {}
}

class Dog extends Animal {
    public function __construct(string $name, private string $breed) {
        parent::__construct($name);
    }
}`,
      ts: `class Animal {
  constructor(protected name: string) {}
}

class Dog extends Animal {
  constructor(name: string, private breed: string) {
    super(name);
  }
}`,
      note:
        "Same shape. PHP's parent::__construct() becomes super(); TS requires super() before any use of this.",
    },
    {
      label: "Overriding + calling the parent",
      intro:
        "Dog wants its describe() to reuse the parent's description and then append its own detail. The result is a method that builds on the base output rather than replacing it entirely.",
      php: `<?php
class Dog extends Animal {
    public function describe(): string {
        return parent::describe() . " (a dog)";
    }
}`,
      ts: `class Dog extends Animal {
  override describe(): string {
    return \`\${super.describe()} (a dog)\`;
  }
}`,
      note:
        "parent::method() becomes super.method(). The override keyword is new — it has no PHP equivalent.",
    },
    {
      label: "The override safety net (new in TS)",
      intro:
        "A developer means to override describe() but accidentally types describ(). The example shows what each language does with that typo — silently in one, loudly in the other.",
      php: `<?php
// PHP has no 'override' keyword. A typo silently
// creates a NEW method instead of overriding:
class Dog extends Animal {
    public function describ(): string { // typo: should be describe()
        return "oops";
    }
}`,
      ts: `class Dog extends Animal {
  // With override, this FAILS to compile:
  // "describ" overrides nothing in the base class.
  override describ(): string {
    return "oops";
  }
}`,
      note:
        "override lets the compiler verify a real parent method exists — catching typos and renamed-parent bugs PHP can't.",
    },
    {
      label: "Abstract class + abstract method",
      intro:
        "A Shape base class defines a shared describe() but leaves area() unimplemented because each shape computes area differently. The aim is a reusable base that forces subclasses to fill in the missing piece.",
      php: `<?php
abstract class Shape {
    abstract public function area(): float;
    public function describe(): string {
        return "area = " . $this->area();
    }
}`,
      ts: `abstract class Shape {
  abstract area(): number;
  describe(): string {
    return \`area = \${this.area()}\`;
  }
}`,
      note:
        "Nearly identical. Abstract classes can't be instantiated; abstract methods have no body and must be implemented.",
    },
    {
      label: "protected members",
      intro:
        "An Account hides its balance from outside code but a Savings subclass still needs to adjust it. The example confirms a subclass can reach a protected field that external callers cannot.",
      php: `<?php
class Account {
    protected float $balance = 0;
}
class Savings extends Account {
    public function add(float $n): void {
        $this->balance += $n; // ok: subclass
    }
}`,
      ts: `class Account {
  protected balance = 0;
}
class Savings extends Account {
  add(n: number): void {
    this.balance += n; // ok: subclass
  }
}`,
      note:
        "Same visibility rules. TS checks protected/private at compile time; PHP enforces them at runtime.",
    },
  ],

  playground: {
    intro:
      "An abstract base class with an abstract method, plus a concrete subclass that implements it. Try removing the area() method from Circle — the editor will flag that Circle no longer satisfies the abstract contract.",
    code: `abstract class Shape {
  constructor(protected label: string) {}

  // No body — every concrete subclass MUST implement this.
  abstract area(): number;

  // Concrete method shared by all shapes; uses the abstract one.
  describe(): string {
    return \`\${this.label}: area = \${this.area().toFixed(2)}\`;
  }
}

class Circle extends Shape {
  constructor(private radius: number) {
    super("Circle"); // must call super() before using this
  }

  override area(): number {
    return Math.PI * this.radius ** 2;
  }
}

class Rectangle extends Shape {
  constructor(private width: number, private height: number) {
    super("Rectangle");
  }

  override area(): number {
    return this.width * this.height;
  }
}

const shapes: Shape[] = [new Circle(2), new Rectangle(3, 4)];

for (const shape of shapes) {
  console.log(shape.describe());
}

// You cannot do: new Shape("x") — abstract classes aren't instantiable.`,
  },

  keyPoints: [
    "`extends` works like PHP; in a subclass constructor call `super(...)` (PHP's `parent::__construct`) **before** using `this`.",
    "Override a method by redeclaring it; reach the parent version with `super.method()` (PHP's `parent::method()`).",
    "The `override` keyword is **new in TS** — it makes the compiler verify a parent method actually exists, catching typos and renames.",
    "`abstract class` can't be instantiated; `abstract` methods have no body and must be implemented by subclasses — same as PHP.",
    "`protected` is visible to the class and its subclasses; TS checks visibility at **compile time**, PHP at runtime.",
    "Enable `noImplicitOverride` in `tsconfig.json` to require `override` on every overriding method.",
  ],

  interview: [
    {
      q: "What does the `override` keyword do, and why doesn't PHP need one?",
      a: "`override` marks a method as intentionally replacing a method from the base class. The compiler then checks that a matching parent method really exists — so a typo (`describ` instead of `describe`) or a later rename of the parent method becomes a **build error** instead of a silent new method. PHP has no equivalent: an override is just a redeclaration, and a typo silently creates a brand-new method that never gets called as you expect. With `noImplicitOverride` on, TypeScript makes `override` mandatory, turning a whole class of subtle inheritance bugs into compile-time failures.",
    },
    {
      q: "How is `super()` in TypeScript different from `parent::__construct()` in PHP?",
      a: "Functionally they do the same job — run the parent constructor. Two differences matter. First, syntax: TS uses `super(args)` inside the child constructor (and `super.method()` for parent methods), versus PHP's `parent::__construct(...)` / `parent::method(...)`. Second, enforcement: in TypeScript, if a subclass declares its own constructor you **must** call `super()` before referencing `this`, and the compiler will reject the code otherwise. PHP is more lenient about when (or whether) you call the parent constructor.",
    },
    {
      q: "When would you reach for an abstract class instead of an interface?",
      a: "Use an **abstract class** when subclasses share real implementation, not just a contract — e.g. a base `Shape` that provides a concrete `describe()` while leaving `area()` abstract. You get shared code, protected helpers, and constructor logic in one place. Use an **interface** when you only need to describe a shape/contract with no implementation, or when a type needs to satisfy multiple contracts (TS interfaces, like PHP, allow a class to implement many). Coming from PHP this is the same `abstract class` vs `interface` decision you already make.",
    },
    {
      q: "What's the difference between `protected`, `private`, and `#private` in TypeScript?",
      a: "`protected` and `private` are **compile-time** access modifiers, mirroring PHP: `protected` is visible to the class and its subclasses, `private` only within the declaring class. Because they're erased at compile time, they don't restrict access at runtime. TypeScript also supports JavaScript's `#field` syntax, which is **truly private at runtime** — it survives compilation and can't be accessed from outside the class even via bracket notation. For straightforward OO code that mirrors PHP, `protected`/`private` are the common choice.",
    },
  ],

  quiz: [
    {
      question:
        "In a TypeScript subclass constructor that needs the parent's setup, what must you call, and when?",
      options: [
        "`parent::__construct()`, anywhere in the constructor",
        "`super()`, and it must run before you use `this`",
        "`this.parent()`, after setting your own fields",
        "Nothing — the parent constructor runs automatically",
      ],
      answerIndex: 1,
      explain:
        "TypeScript uses super() (not PHP's parent::__construct), and the compiler requires it to be called before any use of this in the subclass constructor.",
    },
    {
      question: "What problem does the `override` keyword solve?",
      options: [
        "It makes a method run faster at runtime",
        "It lets you call the parent method without `super`",
        "It makes the compiler verify a matching parent method exists, catching typos and renames",
        "It prevents the method from ever being overridden again",
      ],
      answerIndex: 2,
      explain:
        "override tells the compiler the method is meant to replace a parent method. If no such method exists (a typo, or the parent was renamed), the build fails — something PHP cannot catch.",
    },
    {
      question:
        "Which statement about an `abstract` method in TypeScript is correct?",
      options: [
        "It must include a default body that subclasses can reuse",
        "It has no body and every concrete subclass must implement it",
        "It can be called directly via `new` on the abstract class",
        "It is automatically `private`",
      ],
      answerIndex: 1,
      explain:
        "An abstract method has no implementation; concrete subclasses must provide one. The abstract class itself cannot be instantiated with new — exactly like PHP.",
    },
  ],
};

export default lesson;
