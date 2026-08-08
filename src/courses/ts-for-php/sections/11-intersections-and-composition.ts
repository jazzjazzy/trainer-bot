import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "intersections-and-composition",
  title: "Intersections & Composition",
  part: "The Type System",
  estMinutes: 12,
  summary:
    "How the & operator merges several shapes into one type, why TypeScript favours composing types over deep inheritance, and how this maps to the traits and multiple interfaces you already use in PHP.",

  concept: `
A union (\`A | B\`) means **one of these**. An intersection (\`A & B\`) means
**all of these at once**. If unions are an *either/or*, intersections are an
*and-also*. The value must satisfy **every** member type simultaneously.

### Combining shapes with &

\`\`\`typescript
type HasId = { id: string };
type Timestamps = { createdAt: Date; updatedAt: Date };

type Entity = HasId & Timestamps;
// Entity now requires id, createdAt AND updatedAt
\`\`\`

An \`Entity\` value must carry **all three** properties. This is exactly how you
build up records in a real app: a small \`HasId\`, a reusable \`Timestamps\`, and a
domain shape, all \`&\`-ed together. No copy-paste, no inheritance chain.

### Combining interfaces

You can intersect interfaces too, and \`interface\` has its own merge keyword,
\`extends\`, which can pull in several parents at once:

\`\`\`typescript
interface Named { name: string }
interface Aged { age: number }

interface Person extends Named, Aged {} // composition via extends
type PersonT = Named & Aged;            // composition via intersection
\`\`\`

### Intersection vs inheritance

Coming from PHP you reach for \`class B extends A\` to share fields. TypeScript
nudges you toward **composition** instead:

- Inheritance is a rigid *is-a* chain — one parent, deep hierarchies.
- Intersection is flexible *has-the-shape-of* — combine as many pieces as you like.
- There is no diamond problem: \`A & B & C\` just merges all their members.

If two members share a property with **incompatible** types, the result is
\`never\` for that property (it can never be satisfied), so keep your pieces
disjoint.

### Mixing with unions

Intersections and unions combine. \`&\` binds tighter conceptually, so use
parentheses to be explicit:

\`\`\`typescript
type Clickable = { onClick: () => void };
type Button = Clickable & ({ label: string } | { icon: string });
// always clickable, AND has either a label or an icon
\`\`\`

This is the bread and butter of typing flexible component props.
`,

  comparisons: [
    {
      label: "Traits vs intersection types",
      intro:
        "We want an Article that reuses a shared id field and a reusable created/updated timestamp pair plus its own title. Both sides build that same Article shape from smaller pieces instead of repeating the fields.",
      php: `<?php
trait HasId {
    public string $id;
}
trait Timestamps {
    public \\DateTimeImmutable $createdAt;
    public \\DateTimeImmutable $updatedAt;
}

class Article {
    use HasId, Timestamps;
    public string $title;
}`,
      ts: `type HasId = { id: string };
type Timestamps = {
  createdAt: Date;
  updatedAt: Date;
};

type Article = HasId & Timestamps & {
  title: string;
};`,
      note:
        "PHP traits compose behaviour/state into a class at definition time; TS intersections compose shapes into a type — no class required.",
    },
    {
      label: "Implementing multiple interfaces",
      intro:
        "Here a Money type needs to fulfil two contracts at once: it can serialize itself and it can be compared to another object. The goal is a single type that satisfies both interfaces.",
      php: `<?php
interface Arrayable {
    public function toArray(): array;
}
interface Comparable {
    public function compareTo(object $o): int;
}

class Money implements Arrayable, Comparable {
    public function toArray(): array { return []; }
    public function compareTo(object $o): int { return 0; }
}`,
      ts: `interface Serializable {
  toArray(): Record<string, unknown>;
}
interface Comparable {
  compareTo(o: object): number;
}

type Money = Serializable & Comparable;
// or: interface Money extends Serializable, Comparable {}`,
      note:
        "PHP must explicitly 'implements' both (nominal). In TS any object with the right shape satisfies the intersection (structural).",
    },
    {
      label: "Inheritance chain vs composition",
      intro:
        "A User needs an id, a createdAt timestamp, and an email. We are showing two ways to assemble those fields: stacking up a chain of parent classes versus merging a few flat shapes into one type.",
      php: `<?php
class Model {
    public string $id;
}
class TimestampedModel extends Model {
    public \\DateTimeImmutable $createdAt;
}
class User extends TimestampedModel {
    public string $email;
}`,
      ts: `type Model = { id: string };
type Timestamped = { createdAt: Date };

// Flat composition instead of a 3-level chain:
type User = Model & Timestamped & {
  email: string;
};`,
      note:
        "PHP shares fields by walking a single-parent chain; TS flattens it into one merged shape, dodging deep hierarchies.",
    },
    {
      label: "Conflicting members",
      intro:
        "What happens when two combined pieces define the same member with clashing types, such as an id that is an int in one and a string in the other? This example shows how each language reacts to that conflict.",
      php: `<?php
// PHP raises a fatal error on conflicting trait members
// unless you resolve them with 'insteadof' / 'as'.
trait A { public function id(): int { return 1; } }
trait B { public function id(): int { return 2; } }
// class C { use A, B; } // Fatal: conflict on id()`,
      ts: `type A = { id: number };
type B = { id: string };

// No error at definition — but id becomes number & string = never,
// so no value can ever satisfy it:
type C = A & B;`,
      note:
        "PHP fails loudly at the conflict; TS quietly reduces the clashing property to 'never', which only bites when you try to assign.",
    },
  ],

  playground: {
    intro:
      "Two interfaces combined with &. The object below must satisfy BOTH at once — try deleting a property and watch the editor flag it before you run.",
    code: `interface Identifiable {
  id: string;
}

interface Auditable {
  createdAt: Date;
  createdBy: string;
}

// The & means: must satisfy Identifiable AND Auditable.
type AuditedRecord = Identifiable & Auditable & {
  payload: string;
};

const record: AuditedRecord = {
  id: "rec_001",
  createdAt: new Date("2026-06-22T10:00:00Z"),
  createdBy: "jason",
  payload: "hello composition",
};

console.log("id:", record.id);
console.log("createdBy:", record.createdBy);
console.log("createdAt (ISO):", record.createdAt.toISOString());
console.log("payload:", record.payload);

// Composition lets a function ask only for the slice it needs:
function describe(item: Identifiable & { payload: string }): string {
  return \`#\${item.id} -> \${item.payload}\`;
}

console.log(describe(record));`,
  },

  keyPoints: [
    "`A & B` is an **intersection**: a value must satisfy **every** member type at once — the *and* to a union's *or*.",
    "Intersections **compose shapes**, the type-level analogue of PHP **traits** and `implements`-ing multiple interfaces.",
    "TypeScript favours **flat composition** (`A & B & C`) over deep `extends` inheritance chains — and there's no diamond problem.",
    "`interface X extends A, B {}` and `type X = A & B` both compose; use `extends` for interfaces, `&` for type aliases and ad-hoc merges.",
    "Conflicting properties collapse to **`never`** rather than erroring at the declaration — keep the merged pieces disjoint.",
    "Combine with unions for flexible props: `Clickable & ({ label } | { icon })`.",
  ],

  interview: [
    {
      q: "What's the difference between a union and an intersection type?",
      a: "A **union** `A | B` means the value is **one of** the members — you only know the properties common to all of them until you narrow. An **intersection** `A & B` means the value is **all of** the members at once — it has the combined set of every property. Mnemonic: union = *or*, intersection = *and*. In PHP terms, a union is like a parameter typed `Foo|Bar`, whereas an intersection is closer to a class that `use`s several traits or `implements` several interfaces simultaneously.",
    },
    {
      q: "Coming from PHP, when would you use intersection over class inheritance?",
      a: "Most of the time. PHP's single-inheritance chain (`class C extends B extends A`) gets rigid fast, and you only get one parent. With intersections you **compose** as many independent shapes as you need — `HasId & Timestamps & SoftDeletable` — without a hierarchy. It's the type-system version of preferring **traits/composition over inheritance**. Reserve `extends`/inheritance for genuine *is-a* relationships with shared runtime behaviour; use `&` for *has-the-shape-of* data assembly.",
    },
    {
      q: "What happens if two intersected types declare the same property with incompatible types?",
      a: "TypeScript intersects the property types too. For objects, `{ id: number } & { id: string }` makes `id` have type `number & string`, which is `never` — no value is both a number and a string. The declaration itself doesn't error; the problem only surfaces when you try to **assign** a value, because nothing can satisfy `never`. This differs from PHP, which raises a fatal error at the trait-conflict site unless you resolve it with `insteadof`/`as`.",
    },
    {
      q: "Is there any difference between `interface X extends A, B {}` and `type X = A & B`?",
      a: "For combining object shapes they're largely equivalent. Key differences: `interface` supports **declaration merging** and `extends` will **error early** if you try to extend incompatible parents, giving a clearer message; `type` with `&` silently produces `never` on a conflict. Interfaces also tend to give nicer tooltips and better error messages, while type aliases with `&` are more flexible (they can intersect non-object types, unions, primitives, etc.). A common rule: use `interface` for public object contracts, `&` for ad-hoc local composition.",
    },
  ],

  quiz: [
    {
      question: "What does the type `A & B` require of a value?",
      options: [
        "It must satisfy either A or B",
        "It must satisfy both A and B at the same time",
        "It must be a subclass of both A and B",
        "It must satisfy A but not B",
      ],
      answerIndex: 1,
      explain:
        "An intersection means 'and': the value must satisfy every member type simultaneously, so it has the combined set of all their members.",
    },
    {
      question:
        "Given `type T = { id: number } & { id: string }`, what is the type of `T['id']`?",
      options: [
        "number",
        "string",
        "number | string",
        "never",
      ],
      answerIndex: 3,
      explain:
        "Intersecting incompatible property types gives `number & string`, which reduces to `never` — no value can be both, so the property is effectively unsatisfiable.",
    },
    {
      question:
        "Which PHP feature is the closest conceptual match to composing shapes with a TypeScript intersection?",
      options: [
        "A single `class B extends A` chain",
        "Composing behaviour into a class with traits / implementing multiple interfaces",
        "Using `declare(strict_types=1)`",
        "Type juggling between strings and ints",
      ],
      answerIndex: 1,
      explain:
        "Traits compose behaviour and state into a class, and a class can implement many interfaces — both mirror how intersections merge multiple shapes into one type.",
    },
  ],
};

export default lesson;
