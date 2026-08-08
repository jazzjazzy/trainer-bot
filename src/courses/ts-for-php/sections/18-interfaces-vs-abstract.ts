import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "interfaces-vs-abstract",
  title: "Interfaces vs Abstract Classes & implements",
  part: "Object-Oriented TypeScript",
  estMinutes: 13,
  summary:
    "When to reach for an interface, when for an abstract class, and how `implements` and structural typing change the rules you learned in PHP.",

  concept: `
This is one place where your PHP instincts transfer almost perfectly — and then
one place where they quietly mislead you. The keywords (\`interface\`,
\`abstract\`, \`implements\`, \`extends\`) mean the same things. The twist is that
TypeScript is **structural**, so an interface isn't only satisfied by classes.

### \`implements\`: a contract a class promises to honour

\`implements\` says "this class will provide everything this interface
describes." The compiler checks it for you — exactly like PHP.

\`\`\`typescript
interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string): void {
    console.log(\`[log] \${message}\`);
  }
}
\`\`\`

If \`ConsoleLogger\` forgot \`log\`, or got its signature wrong, the build fails.

### Implementing multiple interfaces

A class can implement as many interfaces as you like — same as PHP. Just
comma-separate them:

\`\`\`typescript
interface Readable { read(): string; }
interface Writable { write(data: string): void; }

class File implements Readable, Writable {
  read(): string { return "contents"; }
  write(data: string): void { /* ... */ }
}
\`\`\`

### Abstract class vs interface — the decision map

- An **interface** is a pure shape contract. It has **no implementation**, no
  fields with values, no constructor. It is **erased** at compile time (zero
  runtime cost).
- An **abstract class** is a real class you can't instantiate. It can ship
  **shared method bodies, fields, and a constructor**, plus \`abstract\` members
  subclasses must fill in. It **exists at runtime**.

Choose an **interface** when you only need to describe a shape, or when a type
needs many implementers. Choose an **abstract class** when you want to share
concrete code and state across subclasses — a base class with default behaviour.

### The structural twist PHP doesn't have

Because TypeScript is structural, a **plain object literal** can satisfy an
interface — no \`implements\`, no class, nothing nominal:

\`\`\`typescript
const stubLogger: Logger = {
  log: (message) => console.log(message),
};
\`\`\`

That object *is a* \`Logger\` simply because it has the right shape. But an
**abstract class can only be satisfied by \`extends\`** — there is no way for a
loose object to "be" an abstract class. That is the practical reason interfaces
dominate for typing dependencies, and abstract classes are reserved for genuine
code-sharing hierarchies.
`,

  comparisons: [
    {
      label: "A class implementing an interface",
      intro:
        "Define a Logger contract with a single log method, then build a ConsoleLogger that fulfils it. The class is forced by the compiler to provide a matching log method.",
      php: `<?php
declare(strict_types=1);

interface Logger {
    public function log(string $message): void;
}

class ConsoleLogger implements Logger {
    public function log(string $message): void {
        echo "[log] $message\\n";
    }
}`,
      ts: `interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string): void {
    console.log(\`[log] \${message}\`);
  }
}`,
      note:
        "Structurally identical. TS interface members have no visibility keyword — they are always public.",
    },
    {
      label: "Implementing multiple interfaces",
      intro:
        "Model a File that is both readable and writable by having it satisfy two separate interfaces at once. The result is a single class that provides every method from both contracts.",
      php: `<?php
interface Readable { public function read(): string; }
interface Writable { public function write(string $data): void; }

class File implements Readable, Writable {
    public function read(): string { return "contents"; }
    public function write(string $data): void { /* ... */ }
}`,
      ts: `interface Readable { read(): string; }
interface Writable { write(data: string): void; }

class File implements Readable, Writable {
  read(): string { return "contents"; }
  write(data: string): void { /* ... */ }
}`,
      note:
        "Same comma-separated list in both languages. A class can implement many interfaces but extend only one (abstract) class.",
    },
    {
      label: "Abstract class with shared code",
      intro:
        "Build a Shape base class that leaves area undefined but supplies a ready-made describe method, then have Circle fill in the area calculation. Circle inherits describe for free while only writing the area-specific logic.",
      php: `<?php
abstract class Shape {
    abstract public function area(): float;

    // Shared, concrete behaviour:
    public function describe(): string {
        return "Area is " . $this->area();
    }
}

class Circle extends Shape {
    public function __construct(private float $r) {}
    public function area(): float { return 3.14159 * $this->r ** 2; }
}`,
      ts: `abstract class Shape {
  abstract area(): number;

  // Shared, concrete behaviour:
  describe(): string {
    return \`Area is \${this.area()}\`;
  }
}

class Circle extends Shape {
  constructor(private r: number) { super(); }
  area(): number { return 3.14159 * this.r ** 2; }
}`,
      note:
        "Both use `extends`, and the subclass must call the parent constructor (`parent::__construct()` / `super()`) when one exists.",
    },
    {
      label: "Interface satisfied without a class",
      intro:
        "Produce a stand-in Logger for use in a quick test or stub. The goal is the lightest possible value that still counts as a Logger.",
      php: `<?php
// Not possible in PHP. To be a Logger you MUST be a class
// that explicitly "implements Logger" (nominal typing).
class StubLogger implements Logger {
    public function log(string $m): void {}
}`,
      ts: `// A plain object satisfies the interface by SHAPE alone —
// no class, no "implements" keyword needed (structural typing).
const stubLogger: Logger = {
  log: (message) => console.log(message),
};`,
      note:
        "The headline difference: PHP is nominal (name must match), TS is structural (shape is enough).",
    },
  ],

  playground: {
    intro:
      "One interface, satisfied two completely different ways: by a class via `implements`, and by a bare object via structural typing. Both are valid `Notifier` values.",
    code: `interface Notifier {
  channel: string;
  send(message: string): void;
}

// 1) A class that explicitly implements the interface.
class EmailNotifier implements Notifier {
  channel = "email";
  send(message: string): void {
    console.log(\`[\${this.channel}] \${message}\`);
  }
}

// 2) A plain object that satisfies the SAME interface structurally —
//    no class, no "implements", just the right shape.
const smsNotifier: Notifier = {
  channel: "sms",
  send(message: string) {
    console.log(\`[\${this.channel}] \${message}\`);
  },
};

// A function that accepts ANY Notifier doesn't care how it was made:
function alert(n: Notifier, text: string): void {
  n.send(text.toUpperCase());
}

alert(new EmailNotifier(), "server is down");
alert(smsNotifier, "server is back up");

console.log("smsNotifier is a class instance?", smsNotifier instanceof EmailNotifier);`,
  },

  keyPoints: [
    "`implements` is a compiler-checked contract — same keyword, same meaning as PHP.",
    "A class can `implements` **many** interfaces but `extends` only **one** (abstract) class.",
    "**Interface** = pure shape, no implementation, erased at runtime. **Abstract class** = shareable concrete code + state, exists at runtime.",
    "Choose an interface to describe a shape with many implementers; choose an abstract class to share real code across a hierarchy.",
    "TS is **structural**: a plain object can satisfy an interface by shape alone — no `implements` required.",
    "An abstract class can only be satisfied by `extends` — a loose object can never stand in for it.",
  ],

  interview: [
    {
      q: "Coming from PHP, when would you pick an interface over an abstract class in TypeScript?",
      a: "Same rule of thumb as PHP, just sharper because TS interfaces are **erased at compile time**. Use an **interface** when you only need to define a contract/shape — especially when many unrelated types will satisfy it, or when consumers might pass a plain object. Use an **abstract class** when you want to share **concrete method bodies and state** across subclasses (a base class with defaults). A class can implement multiple interfaces but extend only one class, so interfaces also win when you need to mix several contracts together.",
    },
    {
      q: "Can something satisfy an interface without using `implements`? What about an abstract class?",
      a: "Yes for interfaces — that is the big departure from PHP. TypeScript is **structural**, so any value with the right shape satisfies the interface, including a plain object literal or an instance of an unrelated class. The `implements` keyword is just an explicit, helpful assertion that triggers a check; it is not required. An **abstract class** is different: it exists at runtime and can only be satisfied by a class that `extends` it. There is no structural shortcut for an abstract class.",
    },
    {
      q: "What can an abstract class do that an interface cannot?",
      a: "An abstract class can carry **implementation**: concrete method bodies, initialised fields, a constructor, and `private`/`protected` members. It can mix `abstract` members (subclasses must implement) with concrete ones (subclasses inherit). It also exists at runtime, so you can use it with `instanceof`. An interface has none of that — no bodies, no constructor, no runtime presence. It is purely a compile-time shape.",
    },
    {
      q: "How does implementing multiple interfaces differ from extending classes?",
      a: "`implements` lists as many interfaces as you want, comma-separated — exactly like PHP — and you must provide every member from all of them. `extends` for classes is **single inheritance**: one parent only. So the common pattern is to extend one (abstract) base for shared code and implement several interfaces for the contracts. (Interfaces themselves can `extends` multiple other interfaces to compose larger shapes.)",
    },
  ],

  quiz: [
    {
      question:
        "Which is true about satisfying an interface vs an abstract class in TypeScript?",
      options: [
        "Both require the `implements` keyword",
        "A plain object can satisfy an interface by shape, but an abstract class can only be satisfied via `extends`",
        "Neither can be satisfied without a class",
        "An abstract class can be satisfied by any object with the right shape",
      ],
      answerIndex: 1,
      explain:
        "TypeScript is structural, so an object with the right shape satisfies an interface without `implements`. An abstract class exists at runtime and can only be satisfied by a subclass that `extends` it.",
    },
    {
      question:
        "What is the key difference between a TypeScript interface and an abstract class?",
      options: [
        "Interfaces can hold concrete method bodies; abstract classes cannot",
        "Abstract classes are erased at compile time; interfaces exist at runtime",
        "An interface is a pure shape with no implementation and is erased at runtime; an abstract class can hold concrete code and state and exists at runtime",
        "There is no difference — they compile to the same thing",
      ],
      answerIndex: 2,
      explain:
        "Interfaces are compile-time-only shape contracts with no implementation. Abstract classes can ship concrete methods, fields, and a constructor, and they exist at runtime (usable with `instanceof`).",
    },
    {
      question:
        "How many interfaces and classes can a single class combine?",
      options: [
        "Many interfaces (comma-separated) but only one class via `extends`",
        "One interface and many classes",
        "Many of both interfaces and classes",
        "Exactly one interface and one class",
      ],
      answerIndex: 0,
      explain:
        "A class may `implements` any number of interfaces but `extends` only a single class — single inheritance for classes, multiple contracts for interfaces, just like PHP.",
    },
  ],
};

export default lesson;
