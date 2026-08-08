import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "utility-and-advanced-types",
  title: "Utility & Advanced Types",
  part: "The Type System",
  estMinutes: 16,
  summary:
    "Stop hand-copying shapes: derive new types from existing ones with keyof, typeof, indexed access, and the built-in utility types like Partial, Pick, Omit, and Record.",

  concept: `
In PHP, if you have a \`User\` class and you need a "User but every field optional"
shape for an update endpoint, you write a *second* class (or array shape) by hand
and keep the two in sync forever. TypeScript's superpower is that types are
**programmable**: you derive one type from another, so there is a single source of
truth. Rename a field once and every derived type follows.

### keyof — the keys of a type as a union

\`keyof T\` gives you a **union of the property names** of \`T\` as literal types
(string literals for string keys, plus numeric/symbol literals for numeric or
symbol keys).

\`\`\`typescript
interface User { id: number; name: string; email: string; }
type UserKey = keyof User; // "id" | "name" | "email"
\`\`\`

### typeof — turn a value into a type

The **type-level** \`typeof\` (not the runtime one) reads the type of an existing
*value*. Great for config objects you already wrote in plain JS.

\`\`\`typescript
const config = { host: "localhost", port: 5432 };
type Config = typeof config; // { host: string; port: number }
\`\`\`

### Indexed access — T[K]

Look up the type of a property, the way you'd index an array:

\`\`\`typescript
type Email = User["email"]; // string
type Values = User[keyof User]; // number | string
\`\`\`

### Mapped & conditional types (the engine room)

A **mapped type** walks over keys and transforms each one —
\`{ [K in keyof T]: ... }\`. A **conditional type** picks a branch based on a type
test — \`T extends U ? X : Y\`. You rarely write these by hand, but they are what
the utility types below are built from.

### The built-in utility types

| Utility | What it does | Use case |
| --- | --- | --- |
| \`Partial<T>\` | all props optional | PATCH/update payloads |
| \`Required<T>\` | all props required | strip \`?\` after validation |
| \`Readonly<T>\` | all props \`readonly\` | immutable config |
| \`Pick<T, K>\` | keep only keys \`K\` | a slim DTO |
| \`Omit<T, K>\` | drop keys \`K\` | "User without password" |
| \`Record<K, V>\` | object with keys \`K\`, values \`V\` | maps/dictionaries |
| \`ReturnType<F>\` | the return type of function \`F\` | reuse a function's output shape |

\`\`\`typescript
type NewUser = Omit<User, "id">;        // no id yet
type UserPatch = Partial<User>;          // every field optional
type UsersById = Record<number, User>;   // { [id: number]: User }
\`\`\`

There is no PHP equivalent for any of this — in PHP you'd duplicate the shape and
hope you remember to update both copies.
`,

  comparisons: [
    {
      label: "An update/PATCH shape (all fields optional)",
      intro:
        "You have a User entity and an update endpoint that should accept any subset of its editable fields. The goal is a type where name and email are optional and id is gone entirely.",
      php: `<?php
declare(strict_types=1);

class User {
    public int $id;
    public string $name;
    public string $email;
}

// No way to "derive" optional version — hand-write another shape:
class UserPatch {
    public ?string $name = null;
    public ?string $email = null;
}`,
      ts: `interface User {
  id: number;
  name: string;
  email: string;
}

// Derived — never drifts from User:
type UserPatch = Partial<Omit<User, "id">>;
// { name?: string; email?: string }`,
      note:
        "PHP forces a parallel class you must keep in sync. TS derives it, so renaming a field updates the patch type automatically.",
    },
    {
      label: "A slim DTO (subset of fields)",
      intro:
        "A list view only needs a user's id and name, not the full record. The aim is a trimmed type that exposes just those two fields.",
      php: `<?php
declare(strict_types=1);

// Hand-pick the fields again in a new class:
class UserSummary {
    public int $id;
    public string $name;
}`,
      ts: `interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
}

type UserSummary = Pick<User, "id" | "name">;
// { id: number; name: string }`,
      note:
        "Pick selects keys from the source of truth. Add a field to User and your DTO stays exactly as narrow as you declared.",
    },
    {
      label: "Hiding a sensitive field",
      intro:
        "You want to return a user from an API but must never leak the password hash. The result is a public-facing type identical to User minus that one field.",
      php: `<?php
declare(strict_types=1);

// Manually re-list everything EXCEPT the password:
class PublicUser {
    public int $id;
    public string $name;
    public string $email;
}`,
      ts: `interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
}

type PublicUser = Omit<User, "passwordHash">;`,
      note:
        "Omit says what to remove, not what to keep — so new fields are public by default unless you omit them too.",
    },
    {
      label: "A keyed dictionary / map",
      intro:
        "You are tracking stock counts for a fixed set of fruits. The goal is a dictionary that maps each fruit name to a number and guarantees no fruit is forgotten.",
      php: `<?php
declare(strict_types=1);

/** @var array<string, int> $stock */
$stock = [
    "apple"  => 12,
    "banana" => 7,
];`,
      ts: `type Fruit = "apple" | "banana" | "cherry";

// Record forces EVERY key in the union to be present:
const stock: Record<Fruit, number> = {
  apple: 12,
  banana: 7,
  cherry: 0,
};`,
      note:
        "PHP's array<string,int> is a loose hint. Record<Fruit, number> with a literal key union makes a missing key a compile error.",
    },
    {
      label: "Reusing a function's return shape",
      intro:
        "A factory function builds a user object and you want a named type matching exactly what it returns. The goal is to capture that shape without redeclaring its fields by hand.",
      php: `<?php
declare(strict_types=1);

function makeUser(): array {
    return ["id" => 1, "name" => "Ada"];
}
// No way to reference "whatever makeUser returns" as a type.`,
      ts: `function makeUser() {
  return { id: 1, name: "Ada" };
}

type User = ReturnType<typeof makeUser>;
// { id: number; name: string }`,
      note:
        "ReturnType + typeof lets the function be the source of truth — change the return value and the type follows.",
    },
  ],

  playground: {
    intro:
      "One base interface, four derived types. Notice you never re-type a field name — Partial, Pick, Omit, and Record all read from Product.",
    code: `interface Product {
  id: number;
  name: string;
  price: number;
  inStock: boolean;
}

// Partial<T>: everything optional — perfect for an update payload.
const priceDrop: Partial<Product> = { price: 9.99 };
console.log("patch:", priceDrop);

// Pick<T, K>: keep only the fields a list view needs.
type ProductCard = Pick<Product, "id" | "name" | "price">;
const card: ProductCard = { id: 1, name: "Mug", price: 12 };
console.log("card:", card);

// Omit<T, K>: a "to create" shape with no id yet.
type NewProduct = Omit<Product, "id">;
const draft: NewProduct = { name: "Hat", price: 20, inStock: true };
console.log("draft:", draft);

// Record<K, V>: an inventory keyed by product id.
const inventory: Record<number, Product> = {
  1: { id: 1, name: "Mug", price: 12, inStock: true },
  2: { id: 2, name: "Hat", price: 20, inStock: false },
};
console.log("ids in stock:");
for (const p of Object.values(inventory)) {
  console.log(\` \${p.name} -> \${p.inStock ? "yes" : "no"}\`);
}

// Try it: add 'rating: 5' to 'card'? Error — ProductCard only has id, name,
// and price, so any extra field is rejected.`,
  },

  keyPoints: [
    "Types are **programmable**: derive new shapes from a single source of truth instead of hand-copying like you must in PHP.",
    "`keyof T` is a union of T's keys; `typeof value` lifts a value into a type; `T[K]` looks up a property's type.",
    "**Mapped** (`{ [K in keyof T]: ... }`) and **conditional** (`T extends U ? X : Y`) types are the engine behind the utilities.",
    "`Partial`/`Required`/`Readonly` flip modifiers; `Pick`/`Omit` slice keys; `Record<K, V>` builds typed dictionaries.",
    "`Omit` lists what to **remove** (new fields stay in), while `Pick` lists what to **keep** (new fields stay out) — choose by intent.",
    "`ReturnType<typeof fn>` reuses a function's output type so it can't drift from the implementation.",
  ],

  interview: [
    {
      q: "What's the difference between `Pick` and `Omit`, and when would you reach for each?",
      a: "Both produce a subset of an object type from a source of truth. `Pick<T, K>` **keeps** the listed keys; `Omit<T, K>` **removes** them. The practical difference is what happens when the base type grows: with `Pick` a new field is *excluded* by default (good for a deliberately minimal DTO), while with `Omit` a new field is *included* by default (good for 'everything except the password'). Coming from PHP, both replace the chore of writing a parallel class and keeping it in sync.",
    },
    {
      q: "What does `keyof` give you, and how is it used with indexed access types?",
      a: "`keyof T` produces a **union of the property names** of `T` as string/number literal types — e.g. `keyof { id: number; name: string }` is `\"id\" | \"name\"`. Combined with an **indexed access type** `T[K]`, you can read property types generically. The classic pattern is a type-safe getter:\n\n\`\`\`typescript\nfunction get<T, K extends keyof T>(obj: T, key: K): T[K] {\n  return obj[key];\n}\n\`\`\`\n\nThe return type is exactly the type of the requested property, and passing a key that doesn't exist is a compile error.",
    },
    {
      q: "There's a runtime `typeof` and a type-level `typeof`. What's the difference?",
      a: "The runtime `typeof x` is plain JavaScript that returns a string like `\"number\"` or `\"object\"` while the code runs. The **type-level** `typeof` appears in a *type position* and lifts the static type of a value into the type system: `type T = typeof config`. They share a keyword but live in different worlds — one runs, one is erased at compile time. PHP has no type-level `typeof`; you can't say 'the type of this existing variable'.",
    },
    {
      q: "How would you build a type for an HTTP PATCH body from an existing entity type?",
      a: "Compose utilities. You usually want every field optional but **not** the immutable identifier:\n\n\`\`\`typescript\ntype UserPatch = Partial<Omit<User, \"id\">>;\n\`\`\`\n\n`Omit` drops `id`, then `Partial` makes the rest optional. Because it's derived, renaming or adding a field on `User` updates `UserPatch` for free — exactly the duplication problem you'd hit maintaining a separate PHP DTO class.",
    },
    {
      q: "What is `Record<K, V>` for, and why is it better than a plain index signature?",
      a: "`Record<K, V>` describes an object whose keys are of type `K` and values of type `V` — a typed dictionary. With a **literal union** key like `Record<\"dev\" | \"prod\", Config>`, TypeScript enforces that *every* key is present and rejects unknown keys, which a loose `{ [k: string]: Config }` index signature cannot do. It's the strongly-typed version of a PHP associative array, where `array<string, Config>` is only a docblock hint.",
    },
  ],

  quiz: [
    {
      question:
        "Given `interface User { id: number; name: string; email: string }`, what is `keyof User`?",
      options: [
        "`string`",
        '`"id" | "name" | "email"`',
        "`number | string`",
        '`{ id: number; name: string; email: string }`',
      ],
      answerIndex: 1,
      explain:
        '`keyof T` produces a union of the property *names* as literal types, so `keyof User` is `"id" | "name" | "email"`. (Indexing with `User[keyof User]` would give the union of value types, `number | string`.)',
    },
    {
      question:
        "You need 'a User type with every field optional, but without the id'. Which is correct?",
      options: [
        "`Partial<Pick<User, \"id\">>`",
        "`Required<Omit<User, \"id\">>`",
        "`Partial<Omit<User, \"id\">>`",
        "`Omit<Partial<User>, \"name\">`",
      ],
      answerIndex: 2,
      explain:
        "`Omit<User, \"id\">` removes the id, then `Partial<...>` makes the remaining fields optional, giving `{ name?: string; email?: string }`. The other options are wrong: `Partial<Pick<User, \"id\">>` keeps only id, `Required<Omit<User, \"id\">>` forces the fields required, and `Omit<Partial<User>, \"name\">` drops the wrong key.",
    },
    {
      question:
        "Why does `Record<\"a\" | \"b\", number>` catch more bugs than `{ [k: string]: number }`?",
      options: [
        "It runs a runtime check on every key access",
        "It requires every key in the union to be present and rejects unknown keys",
        "It makes all the values readonly",
        "There is no difference; they compile to the same type",
      ],
      answerIndex: 1,
      explain:
        "With a literal union key, `Record` demands all listed keys exist and disallows others. A `string` index signature accepts any string key and never warns about a missing one.",
    },
  ],
};

export default lesson;
