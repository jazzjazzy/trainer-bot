import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "objects-and-object-types",
  title: "Objects & Object Types",
  part: "The Type System",
  estMinutes: 13,
  summary:
    "How to describe the shape of an object with type literals — optional, readonly, and index-signature properties — replacing PHP's untyped associative arrays with shapes the compiler actually checks.",

  concept: `
In PHP you reach for an **associative array** the moment you need to group named
values: \`['name' => 'Ada', 'age' => 36]\`. It's quick, but the engine has no idea
what keys exist or what types they hold — a typo like \`$user['naem']\` sails
straight through to a runtime \`null\`. TypeScript replaces that array-as-a-bag-of-stuff
habit with an **object type**: a description of exactly which keys exist and what
type each one is. The compiler then checks every access against it.

### Object type literals

You describe a shape inline with \`{ key: type }\`:

\`\`\`typescript
let user: { name: string; age: number };
user = { name: "Ada", age: 36 }; // ok
user = { name: "Ada" };          // error: 'age' is missing
\`\`\`

Object literals are also **exact about extra keys**: assigning a literal with a
property the type doesn't declare is an error ("excess property check").

### Optional properties with \`?\`

A trailing \`?\` marks a key as allowed-but-not-required. Its type becomes
\`T | undefined\`:

\`\`\`typescript
let p: { name: string; nickname?: string };
p = { name: "Ada" };                  // fine — nickname omitted
console.log(p.nickname?.toUpperCase()); // safely optional
\`\`\`

### Readonly properties

\`readonly\` blocks reassignment after construction — the compile-time cousin of a
PHP \`readonly\` property:

\`\`\`typescript
let cfg: { readonly id: number };
cfg = { id: 1 };
cfg.id = 2; // error: Cannot assign to 'id'
\`\`\`

### Index signatures — typed dictionaries

When keys are dynamic (a map/dictionary) rather than fixed, use an **index
signature**: \`[key: string]: T\`. This is the typed version of using an
associative array as a lookup table:

\`\`\`typescript
let scores: { [player: string]: number };
scores = { ada: 10, alan: 7 };
scores.grace = 12;          // ok — any string key, number value
scores.ada = "lots";        // error: value must be number
\`\`\`

### Nested object types

Shapes nest freely, just like arrays of arrays in PHP — but every level is
checked:

\`\`\`typescript
let order: { id: number; customer: { name: string; vip: boolean } };
\`\`\`

> The big win: a misspelled key, a missing field, or a wrong value type is a red
> squiggle in your editor, not a \`Notice: Undefined index\` (or silent \`null\`) at
> runtime.
`,

  comparisons: [
    {
      label: "Associative array vs. typed object shape",
      intro:
        "We store a user's name and age, then accidentally read a misspelled key. The goal is to see when each language notices the typo.",
      php: `<?php
declare(strict_types=1);

// Just an array — keys/types are unchecked.
$user = [
    'name' => 'Ada',
    'age'  => 36,
];

echo $user['naem']; // Warning: Undefined array key "naem"`,
      ts: `type User = { name: string; age: number };

const user: User = {
  name: "Ada",
  age: 36,
};

console.log(user.naem); // error: Property 'naem' does not exist on type 'User'`,
      note:
        "PHP's array is a free-form bag; the typo is found at runtime. The TS object shape catches the typo at compile time.",
    },
    {
      label: "stdClass vs. checked object",
      intro:
        "We build a config object with a timeout and a retry count, but assign a string where a number belongs. The point is whether the wrong value type is rejected.",
      php: `<?php
$config = new stdClass();
$config->timeout = 30;
$config->retries = 'three'; // no complaint — any prop, any type`,
      ts: `type Config = { timeout: number; retries: number };

const config: Config = {
  timeout: 30,
  retries: "three", // error: Type 'string' is not assignable to type 'number'
};`,
      note:
        "stdClass accepts any property of any type silently; a TS object type pins down both the keys and their value types.",
    },
    {
      label: "Associative array as a map vs. index signature",
      intro:
        "We use an object as a player-to-score lookup table and add a new entry on the fly. The aim is to type a dictionary with arbitrary keys but a fixed value type.",
      php: `<?php
declare(strict_types=1);

// Used as a string -> int lookup, by convention only.
$scores = [
    'ada'  => 10,
    'alan' => 7,
];
$scores['grace'] = 12;`,
      ts: `type Scores = { [player: string]: number };

const scores: Scores = {
  ada: 10,
  alan: 7,
};
scores.grace = 12; // ok: any string key, but the value MUST be a number`,
      note:
        "PHP only enforces the 'string keys -> int values' rule by discipline; an index signature makes the compiler enforce the value type.",
    },
    {
      label: "Unknown shape vs. known, optional shape",
      intro:
        "A format function greets a user by nickname, falling back to their name when no nickname is present. The goal is to express that 'nickname is optional' in the function's signature.",
      php: `<?php
declare(strict_types=1);

function format(array $u): string {
    // Is 'nickname' set? You must guess and guard.
    $nick = $u['nickname'] ?? $u['name'];
    return "Hello $nick";
}`,
      ts: `function format(u: { name: string; nickname?: string }): string {
  // The '?' makes nickname's optionality part of the type; '??' is checked.
  const nick = u.nickname ?? u.name;
  return \`Hello \${nick}\`;
}`,
      note:
        "PHP's `array` says nothing about which keys exist. The TS signature documents exactly what's required vs. optional, and the compiler enforces it.",
    },
  ],

  playground: {
    intro:
      "A typed object with an optional property, plus an index-signature dictionary. Run it, then try setting inventory.apples = 'lots' and watch the editor flag the wrong value type.",
    code: `// A fixed shape with one optional property:
type Product = {
  readonly sku: string;
  name: string;
  discount?: number; // optional: number | undefined
};

const widget: Product = {
  sku: "W-100",
  name: "Widget",
};

// Optional chaining + nullish coalescing handle the maybe-missing field:
const off = widget.discount ?? 0;
console.log(widget.name, "discount:", off);

// widget.sku = "W-200"; // would error: sku is readonly

// An index-signature dictionary: any string key, number value.
type Inventory = { [item: string]: number };

const inventory: Inventory = {
  apples: 12,
  pears: 4,
};
inventory.bananas = 7; // dynamic key, allowed

for (const item in inventory) {
  console.log(item, "=>", inventory[item]);
}

const total = Object.values(inventory).reduce((a, b) => a + b, 0);
console.log("total items:", total);`,
  },

  keyPoints: [
    "An **object type literal** `{ name: string }` describes exactly which keys exist and their types — the typed replacement for an associative array.",
    "A trailing **`?`** marks a property optional; its type becomes `T | undefined`, so reach it with `?.` and `??`.",
    "**`readonly`** forbids reassignment after construction — the compile-time analogue of a PHP `readonly` property.",
    "An **index signature** `[key: string]: T` types a dictionary/map: any key of that key-type, every value of type `T`.",
    "Object literals get an **excess-property check** — assigning an undeclared key is an error, catching typos PHP would silently ignore.",
    "Shapes **nest**, and every level is checked, unlike PHP's nested arrays that are opaque to the type system.",
  ],

  interview: [
    {
      q: "How does a TypeScript object type improve on a PHP associative array?",
      a: "A PHP associative array is an untyped bag: the engine doesn't know which keys exist or what types they hold, so typos and wrong types only surface at runtime (an `Undefined array key` warning, or a silent `null`). A TypeScript **object type** declares the exact set of keys and the type of each value, and the compiler checks every read and write against it. Missing keys, misspelled keys, and wrong value types all become **compile-time errors** in the editor — before the code ever runs.",
    },
    {
      q: "What does the `?` modifier do on a property, and how is it different from a property whose type includes `undefined`?",
      a: "`{ nickname?: string }` makes the property **optional** — you can omit it entirely when constructing the object, and its type is effectively `string | undefined`. `{ nickname: string | undefined }` requires you to **explicitly provide** the key (even if you set it to `undefined`). So `?` controls *presence*; a union with `undefined` only controls the *value* of a key that must still be present. In practice `?` is what you usually want for optional config-style fields.",
    },
    {
      q: "When would you use an index signature instead of listing properties?",
      a: "When the keys are **dynamic** rather than a known fixed set — i.e. when you're using the object as a **map/dictionary**. `{ [player: string]: number }` says 'any string key, every value is a number,' which is the typed version of using a PHP associative array as a lookup table. If you instead know the exact keys ahead of time, list them explicitly so the compiler can catch missing or misspelled ones — an index signature deliberately allows *any* key, so it can't catch typos.",
    },
    {
      q: "Does `readonly` give you runtime immutability?",
      a: "No. `readonly` is a **compile-time** check only — it stops *you* from reassigning the property in TypeScript source, but the emitted JavaScript has no such guard, so code that bypasses the type system (or plain JS) can still mutate it. It's like PHP's `readonly` in intent, but PHP enforces it at runtime whereas TypeScript's is erased along with all other types. For genuine runtime immutability you'd use `Object.freeze`.",
    },
  ],

  quiz: [
    {
      question:
        "Given `type User = { name: string; age?: number }`, which assignment is valid?",
      options: [
        "const u: User = { name: \"Ada\", age: \"36\" };",
        "const u: User = { age: 36 };",
        "const u: User = { name: \"Ada\" };",
        "const u: User = { name: \"Ada\", role: \"admin\" };",
      ],
      answerIndex: 2,
      explain:
        "`age` is optional (`?`), so it can be omitted, but `name` is required. The first uses a string for a number, the second omits required `name`, and the fourth adds an undeclared `role` (excess-property error).",
    },
    {
      question:
        "What does the type `{ [key: string]: number }` describe?",
      options: [
        "An object with exactly one property named 'key'",
        "An object where any string key maps to a number value",
        "An array of numbers indexed by integers",
        "An object whose keys must all be numbers",
      ],
      answerIndex: 1,
      explain:
        "That's an index signature: it permits any string key, but constrains every value to be a number — the typed form of an associative array used as a string→number map.",
    },
    {
      question:
        "On a property declared `readonly id: number`, attempting `obj.id = 5` after construction will:",
      options: [
        "Throw a TypeError when the JavaScript runs",
        "Be a compile-time error caught by TypeScript",
        "Silently succeed and change the value",
        "Only fail if `strict` mode is off",
      ],
      answerIndex: 1,
      explain:
        "`readonly` is enforced at compile time — the assignment is flagged as an error in the editor/build. It is erased from the emitted JavaScript, so it provides no runtime guard.",
    },
  ],
};

export default lesson;
