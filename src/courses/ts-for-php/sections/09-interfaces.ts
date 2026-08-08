import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "interfaces",
  title: "Interfaces",
  part: "The Type System",
  estMinutes: 14,
  summary:
    "How TypeScript interfaces describe the shape of data structurally — a familiar word from PHP, but used in a much broader, name-blind way.",

  concept: `
You already use \`interface\` in PHP, so the keyword feels like home. But TypeScript
stretches the idea in two directions that will surprise you: interfaces describe
**plain object shapes** (not just class contracts), and they are matched
**structurally** (by shape, not by name).

### Declaring an interface

An interface is a named description of the properties an object must have.

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

const u: User = { id: 1, name: "Ada", email: "ada@x.com" };
\`\`\`

In PHP an interface traditionally lists **method** signatures and constants (and,
since PHP 8.4, property accessor requirements). In TypeScript it mostly lists
**data** — fields with their types. That alone is a big shift.

### Optional and readonly members

- \`name?: string\` — the property may be omitted (like a nullable/defaulted field).
- \`readonly id: number\` — can be set once at creation, then never reassigned.
  Think of it as PHP 8.1's \`readonly\` property, but enforced by the compiler.

\`\`\`typescript
interface Config {
  readonly host: string;
  port?: number;        // optional
}
\`\`\`

### Method signatures

Interfaces can also describe methods and callable members:

\`\`\`typescript
interface Repo {
  find(id: number): User | undefined;
  save(user: User): void;
}
\`\`\`

### Extending interfaces

Use \`extends\` to compose — and unlike PHP, you can extend **multiple** interfaces
at once:

\`\`\`typescript
interface Timestamped { createdAt: Date; }
interface Audited { editedBy: string; }
interface Post extends Timestamped, Audited {
  title: string;
}
\`\`\`

### Structural typing — the big one

PHP is **nominal**: a class fits an interface only if it literally writes
\`implements Foo\`. TypeScript is **structural**: if an object *has the right shape*,
it *is* that type — no \`implements\` needed.

A plain object literal, a class instance, or a value from JSON all satisfy \`User\`
the moment their properties line up. The name on the box doesn't matter; the
contents do.

### Declaration merging

A quirk with no PHP equivalent: declare the same interface twice and TypeScript
**merges** them into one. This is how libraries let you augment built-in types —
rarely needed day to day, but worth recognising.
`,

  comparisons: [
    {
      label: "Interfaces describe data, not just methods",
      intro:
        "Here we model a user with three pieces of information: an id, a name, and an email. The goal is to capture what a user looks like, and you will see each language reach for a different mental model to do it.",
      php: `<?php
// PHP interfaces traditionally declare methods and constants (and, since PHP 8.4, property accessor requirements).
interface UserContract {
    public function getName(): string;
    public function getEmail(): string;
}`,
      ts: `// TS interfaces describe the shape of plain data directly.
interface User {
  id: number;
  name: string;
  email: string;
}`,
      note:
        "PHP interfaces list method signatures; TS interfaces most often list typed fields.",
    },
    {
      label: "Structural vs nominal matching",
      intro:
        "We want a value that can serialize itself via a toArray method to count as Serializable. The question is what it takes for an object to qualify as that type — and the two languages answer very differently.",
      php: `<?php
interface JsonSerializable2 {
    public function toArray(): array;
}

// Must explicitly opt in with "implements":
class Money implements JsonSerializable2 {
    public function toArray(): array { return ['cents' => 100]; }
}`,
      ts: `interface Serializable {
  toArray(): unknown[];
}

// No "implements" needed — the shape alone qualifies:
const money = { toArray: () => [100] };
const s: Serializable = money; // fits, purely by shape`,
      note:
        "PHP requires an explicit `implements`; TS accepts anything whose shape matches.",
    },
    {
      label: "Optional and readonly members",
      intro:
        "We are describing a config object with a host that must never change once set and a port that callers may leave out. The aim is to express both write-once and truly-optional in the type itself.",
      php: `<?php
class Config {
    public function __construct(
        public readonly string $host,
        public ?int $port = null, // optional-ish via nullable + default
    ) {}
}`,
      ts: `interface Config {
  readonly host: string;
  port?: number; // genuinely optional: key may be absent
}`,
      note:
        "TS `?` means the key can be missing entirely, not just null; `readonly` is compile-time enforced.",
    },
    {
      label: "Extending multiple interfaces",
      intro:
        "Here a Post needs to combine timestamp tracking and audit tracking on top of its own title field. The goal is to build one richer type by pulling together two smaller ones at once.",
      php: `<?php
interface Timestamped { public function createdAt(): DateTimeImmutable; }
interface Audited { public function editedBy(): string; }

// Interfaces can extend many; classes implement many:
interface PostContract extends Timestamped, Audited {
    public function title(): string;
}`,
      ts: `interface Timestamped { createdAt: Date; }
interface Audited { editedBy: string; }

interface Post extends Timestamped, Audited {
  title: string;
}`,
      note:
        "Both languages allow multiple extension, but TS composes data shapes, not method lists.",
    },
  ],

  playground: {
    intro:
      "Define an interface, take it as a function parameter, then pass a plain object literal that structurally matches — notice there is no `implements` keyword anywhere.",
    code: `interface User {
  readonly id: number;
  name: string;
  email?: string; // optional
}

function describe(user: User): string {
  const contact = user.email ?? "no email on file";
  return \`#\${user.id} \${user.name} (\${contact})\`;
}

// A plain object literal that matches the shape — no class, no "implements".
const ada = { id: 1, name: "Ada Lovelace", email: "ada@x.com" };
console.log(describe(ada));

// email is optional, so this still fits the User shape:
const grace = { id: 2, name: "Grace Hopper" };
console.log(describe(grace));

// Structural typing in action: extra properties on a variable are fine.
const withRole = { id: 3, name: "Linus", email: "l@x.com", role: "admin" };
console.log(describe(withRole));

// Try it: remove "name" from grace and the editor flags it before you run.`,
  },

  keyPoints: [
    "TS interfaces describe **data shapes** directly, whereas PHP interfaces center on method contracts (plus constants, and property accessors since PHP 8.4).",
    "Matching is **structural**: if the shape fits, the value fits — no `implements` for plain objects.",
    "Use `?` for **optional** members and `readonly` for write-once fields (compile-time enforced).",
    "Interfaces can declare **method signatures** too, and can `extends` **multiple** other interfaces.",
    "**Declaration merging** combines same-named interfaces — a TS-only feature for augmenting types.",
    "An interface adds **zero runtime cost**: it is erased at compile time, like all TS types.",
  ],

  interview: [
    {
      q: "How does a TypeScript interface differ from a PHP interface?",
      a: "A PHP interface is a **nominal method contract**: it declares method signatures and constants (and, since PHP 8.4, property accessor requirements), and a class only satisfies it by explicitly writing `implements`. A TypeScript interface primarily describes the **shape of data** — typed fields, optional and `readonly` members, plus optional method signatures — and it is matched **structurally**. Any value whose shape lines up satisfies the interface automatically, whether it is a class instance, a plain object literal, or parsed JSON. No `implements` is required for plain objects.",
    },
    {
      q: "What is structural typing, and why does it matter coming from PHP?",
      a: "Structural typing means a type is defined by its **shape**, not its **name**. If an object has all the properties an interface requires (with compatible types), it *is* that type. Coming from PHP's nominal model — where you must declare `implements Foo` — this feels loose, but it is powerful: you can type third-party objects, API responses, and ad-hoc literals without owning or modifying their classes. The flip side is that two unrelated things with the same shape are interchangeable, which is usually a feature, occasionally a footgun.",
    },
    {
      q: "When would you use `readonly` and `?` on interface members?",
      a: "Use `readonly` for fields that should be set once and never reassigned — IDs, configuration hosts, value-object internals. It is the compile-time cousin of PHP 8.1's `readonly` property. Use `?` for genuinely **optional** members: the key may be absent entirely (not merely `null`). That distinction matters — `port?: number` allows the property to be missing, whereas `port: number | null` requires the key to exist but permits a `null` value.",
    },
    {
      q: "What is declaration merging?",
      a: "If you declare the same interface name more than once, TypeScript **merges** the declarations into a single interface containing the union of all members. PHP has no equivalent. It is mostly used to **augment** existing types — for example, adding a property to `Window` in the global scope, or extending a library's interface from your own code. You rarely write it yourself, but you will see it in type declaration files (`.d.ts`).",
    },
  ],

  quiz: [
    {
      question:
        "What must a plain object do to satisfy a TypeScript interface?",
      options: [
        "Explicitly declare `implements` like a PHP class",
        "Simply have a matching shape (the required properties and types)",
        "Be created from a class that extends the interface",
        "Register itself with the interface at runtime",
      ],
      answerIndex: 1,
      explain:
        "TypeScript is structurally typed. If the object's shape matches the interface's required members, it satisfies the interface — no `implements` keyword needed.",
    },
    {
      question:
        "What does `port?: number` mean on an interface member?",
      options: [
        "The property must exist but may be `null`",
        "The property is read-only after creation",
        "The property is optional — the key may be omitted entirely",
        "The property defaults to 0 if not provided",
      ],
      answerIndex: 2,
      explain:
        "The `?` marks the member as optional, meaning the key can be absent. That is different from `number | null`, which requires the key to be present but allows a null value.",
    },
    {
      question:
        "Which capability do TypeScript interfaces have that PHP interfaces do not?",
      options: [
        "Extending more than one interface at once",
        "Declaring method signatures",
        "Describing plain data shapes and merging same-named declarations",
        "Being implemented by a class",
      ],
      answerIndex: 2,
      explain:
        "Both languages support multiple extension, method signatures, and class implementation. TS interfaces additionally describe plain data shapes and support declaration merging, neither of which PHP offers.",
    },
  ],
};

export default lesson;
