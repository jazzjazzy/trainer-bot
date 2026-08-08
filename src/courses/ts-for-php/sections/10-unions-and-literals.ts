import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "unions-and-literals",
  title: "Type Aliases, Unions & Literal Types",
  part: "The Type System",
  estMinutes: 14,
  summary:
    "How to name your own types, build values that can be one of several things, and pin a type down to exact constant values — the everyday backbone of practical TypeScript.",

  concept: `
PHP 8 gave you union types (\`int|string\`) and enums. TypeScript takes both ideas
much further and makes them the workhorses of day-to-day modelling.

### Type aliases — naming a shape

A **type alias** gives a name to any type. Think of it as \`define()\` for types,
or a lightweight \`enum\`/\`class\` that exists only at compile time.

\`\`\`ts
type UserId = number;
type Point = { x: number; y: number };

const origin: Point = { x: 0, y: 0 };
\`\`\`

The alias is erased at compile time — it is pure documentation plus checking.

### Union types — "one of these"

A **union** says a value may be any one of several types, written with \`|\`. This
is exactly PHP 8's \`int|string\`, but it composes far more freely — you can union
objects, arrays, functions, literals, anything.

\`\`\`ts
type Id = number | string;

function format(id: Id): string {
  return \`ID-\${id}\`;
}
\`\`\`

### Literal types — pinning to exact values

A **literal type** is a type whose only allowed value is one specific constant.
A union of literals is TypeScript's idiomatic answer to a string-backed enum.

\`\`\`ts
type Direction = "north" | "south" | "east" | "west";
type Dice = 1 | 2 | 3 | 4 | 5 | 6;

let heading: Direction = "north"; // "up" would be a compile error
\`\`\`

Unlike a PHP enum, these are just strings/numbers at runtime — no class, no
import, no \`Direction::North\` ceremony. The safety lives entirely in the checker.

### null as a union

There is no \`?Type\` shorthand. Nullability is **just another union member**:

\`\`\`ts
type MaybeName = string | null;
\`\`\`

Under \`strict\`, TypeScript forces you to handle the \`null\` case before using the
value — the compile-time cousin of PHP's null-safe operator \`?->\`.

### type vs interface

- Use **\`interface\`** for object shapes you expect to extend or implement
  (classes, public APIs) — it is closest to PHP's \`interface\`.
- Use **\`type\`** for everything else: unions, literals, tuples, function types,
  and aliases of primitives. Only \`type\` can express \`A | B\`.
`,

  comparisons: [
    {
      label: "Union types: int|string",
      intro:
        "We want one format function that accepts an id which might be a number or a string, and returns a label like \"ID-42\". Both versions print the same output for either input type.",
      php: `<?php
declare(strict_types=1);

function format(int|string $id): string {
    return "ID-" . $id;
}

echo format(42);
echo format("abc");`,
      ts: `type Id = number | string;

function format(id: Id): string {
  return \`ID-\${id}\`;
}

console.log(format(42));
console.log(format("abc"));`,
      note:
        "Same idea, but TS unions compose freely (objects, literals, functions) and can be named with a type alias.",
    },
    {
      label: "Enum vs literal-union strings",
      intro:
        "Goal: restrict a status value to exactly \"active\" or \"disabled\" so setStatus can only ever receive one of those. Passing any other string should be rejected by the compiler.",
      php: `<?php
enum Status: string {
    case Active   = 'active';
    case Disabled = 'disabled';
}

function setStatus(Status $s): void { /* ... */ }
setStatus(Status::Active);`,
      ts: `type Status = "active" | "disabled";

function setStatus(s: Status): void { /* ... */ }
setStatus("active"); // "paused" -> compile error`,
      note:
        "TS literal unions are plain strings at runtime — no class, no import, no Status::Active ceremony.",
    },
    {
      label: "Nullable: ?Type vs T | null",
      intro:
        "Here a find function takes a name that may be missing, and uppercases it with a fallback of \"anon\" when nothing is supplied. Both versions return an uppercased name or \"ANON\".",
      php: `<?php
declare(strict_types=1);

function find(?string $name): string {
    // ?? supplies a fallback when null
    return strtoupper($name ?? 'anon');
}`,
      ts: `function find(name: string | null): string {
  // strict mode forces you to handle null first
  return (name ?? "anon").toUpperCase();
}`,
      note:
        "TS has no ?Type shorthand: null is just another union member, and strict mode makes you handle it.",
    },
    {
      label: "Naming a type",
      intro:
        "We want a reusable name for a value type, such as a numeric user id or a retry count limited to 1, 2, or 3. This shows how each language tries to give a primitive a meaningful name.",
      php: `<?php
// PHP has no alias for a primitive type;
// the closest is a class wrapper or a const.
const MAX_RETRIES = 3;`,
      ts: `type UserId = number;
type Retries = 1 | 2 | 3;

const id: UserId = 7;
const attempts: Retries = 2;`,
      note:
        "A type alias names any type at compile time only; PHP has no equivalent for aliasing a bare primitive.",
    },
  ],

  playground: {
    intro:
      "A union parameter, a literal-union status type, and narrowing with typeof. Run it, then try passing a value that isn't allowed and watch the editor complain.",
    code: `// A literal-union type: only these three strings are valid.
type Status = "active" | "pending" | "banned";

function describe(status: Status): string {
  return \`Account is \${status}\`;
}

console.log(describe("active"));
console.log(describe("pending"));
// describe("frozen"); // <- uncomment: compile error, "frozen" isn't a Status

// A union parameter narrowed with typeof.
type Id = number | string;

function normalize(id: Id): string {
  if (typeof id === "number") {
    // Here TS KNOWS id is a number.
    return \`#\${id.toFixed(0)}\`;
  }
  // And here it KNOWS id is a string.
  return id.trim().toUpperCase();
}

console.log(normalize(42));
console.log(normalize("  abc123  "));

// null as a union member — strict mode forces the guard.
function greet(name: string | null): string {
  return \`Hi \${name ?? "stranger"}\`;
}

console.log(greet("Jason"));
console.log(greet(null));`,
  },

  keyPoints: [
    "`type X = ...` names any type at compile time — primitives, objects, unions, functions. It is erased at runtime.",
    "A union `A | B` means *one of* — the direct descendant of PHP 8's `int|string`, but it composes with anything.",
    "Literal types (`'a' | 'b'`, `1 | 2`) are TypeScript's idiomatic, zero-runtime alternative to string-backed enums.",
    "Nullability is just a union: `string | null`. There is no `?Type` shorthand, and **strict** mode forces you to handle the `null`.",
    "Use `interface` for object shapes you extend/implement; use `type` for unions, literals, tuples, and aliases.",
    "**Narrowing** (e.g. `typeof x === 'number'`) lets the compiler treat a union as one specific member inside a branch.",
  ],

  interview: [
    {
      q: "How do TypeScript union types compare to PHP 8 union types?",
      a: "Both let a value be *one of several types* (`int|string` in PHP, `number | string` in TS). The difference is reach: PHP unions are limited and checked at runtime, while TS unions compose freely — you can union object shapes, function signatures, literal values, even other unions — and they are checked at **compile time** then erased. TS also lets you `type Id = number | string` to name and reuse the union.",
    },
    {
      q: "When would you use a literal-union type instead of a TypeScript enum?",
      a: "Most of the time. A literal union like `type Status = 'active' | 'banned'` is just plain strings at runtime — no generated object, no import, smaller output, and it serialises naturally to/from JSON. A TS `enum` emits real runtime code and can be surprising (numeric enums are bidirectional). Coming from PHP, the instinct is to reach for an enum, but idiomatic TS prefers literal unions unless you specifically need a runtime enum object to iterate over.",
    },
    {
      q: "How does TypeScript handle nullable values compared to PHP's ?Type?",
      a: "There is no `?Type` shorthand. You model it as a union: `string | null` (or `string | undefined`). Under `strict` / `strictNullChecks`, the compiler will not let you use the value until you've eliminated `null` — typically with a guard (`if (x !== null)`) or the nullish-coalescing operator `x ?? fallback`. It's the compile-time equivalent of PHP's `?->` and `??`, but enforced before the code ever runs.",
    },
    {
      q: "What is type narrowing, and why does it matter for unions?",
      a: "Narrowing is the compiler reducing a union to a more specific type based on control flow. After `if (typeof id === 'number')`, TypeScript knows that inside the branch `id` is a `number`, so number methods autocomplete and the other branch is treated as the remaining members. This is what makes unions ergonomic: you write one function for `number | string` and the checker keeps each branch honest.",
    },
    {
      q: "When should you choose `type` over `interface`?",
      a: "Use `interface` for object shapes that participate in inheritance — things classes `implement` or that you `extend` — since that's its sweet spot and it mirrors PHP's `interface`. Use `type` for anything a union/literal/tuple/function type can express, because only `type` can say `A | B`. A common rule of thumb: `interface` for public object contracts, `type` for everything else.",
    },
  ],

  quiz: [
    {
      question:
        "Which TypeScript declaration is the idiomatic equivalent of a PHP string-backed enum with cases 'active' and 'banned'?",
      options: [
        "type Status = string;",
        'type Status = "active" | "banned";',
        "type Status = { active: boolean; banned: boolean };",
        "type Status = active | banned;",
      ],
      answerIndex: 1,
      explain:
        'A union of string literals constrains the value to exactly those strings at compile time, with zero runtime cost — the idiomatic TS alternative to an enum. The last option fails because `active`/`banned` without quotes refer to (nonexistent) types, not string values.',
    },
    {
      question:
        "Under strict mode, what must you do before using a parameter typed `string | null`?",
      options: [
        "Nothing — TypeScript auto-converts null to an empty string",
        "Cast it to string with `as string` every time",
        "Narrow away the null (e.g. an `if` guard or `?? fallback`) before using string methods",
        "Wrap the whole function in a try/catch",
      ],
      answerIndex: 2,
      explain:
        "With strictNullChecks on, `null` is a real member of the union. The compiler refuses string operations until you've eliminated `null` via a guard or nullish coalescing.",
    },
    {
      question:
        "Inside `if (typeof id === 'number') { ... }`, where `id: number | string`, what type does TypeScript give `id` within the block?",
      options: [
        "number | string — unions are never narrowed",
        "number — the union is narrowed by the typeof check",
        "string — the else branch type",
        "any — typeof erases type information",
      ],
      answerIndex: 1,
      explain:
        "This is narrowing: the `typeof` check tells the compiler `id` is a `number` inside that branch, so number methods are available and type-safe.",
    },
  ],
};

export default lesson;
