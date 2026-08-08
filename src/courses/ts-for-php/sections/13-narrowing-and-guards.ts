import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "narrowing-and-guards",
  title: "Narrowing & Type Guards",
  part: "The Type System",
  estMinutes: 15,
  summary:
    "How TypeScript turns a wide union into a single precise type inside a branch — using typeof, instanceof, in, discriminated unions, custom guards, and never-based exhaustiveness checks.",

  concept: `
A union type like \`string | number\` says "this is one of these". **Narrowing**
is how you convince the compiler *which one* you're holding inside a given branch
of code. In PHP you do this every day with \`is_string()\`, \`instanceof\`, and
\`match()\` — you just never get rewarded for it. TypeScript watches your control
flow and *changes the type of the variable* as you check it.

### Narrowing with the operators you already know

\`\`\`typescript
function format(value: string | number): string {
  if (typeof value === "number") {
    // value is 'number' here — .toFixed() is allowed
    return value.toFixed(2);
  }
  // value is 'string' here — TS removed 'number' from the union
  return value.trim();
}
\`\`\`

The same flow-based narrowing works with several checks:

- **\`typeof\`** — for primitives: \`"string"\`, \`"number"\`, \`"boolean"\`, \`"object"\`, \`"undefined"\`, \`"function"\`, \`"bigint"\`, \`"symbol"\`.
- **\`instanceof\`** — for class instances, exactly like PHP's \`instanceof\`.
- **the \`in\` operator** — narrows by *property presence*: \`if ("wheels" in vehicle)\`.
- **truthiness** — \`if (value)\` removes \`null\` and \`undefined\` (and falsy *literal* members like a literal \`0\`, \`""\`, or \`false\`) from a union. It does *not* strip \`0\`/\`""\` from a plain \`number\`/\`string\` — that type is unchanged inside the branch, since TS can't express "number except 0".
- **equality** — \`if (x === "admin")\` narrows \`x\` to the literal \`"admin"\`.

### Discriminated unions: the killer feature

Give every member of a union a shared **literal "tag"** field. TypeScript uses
that tag to narrow the whole object in one check — this is the TS answer to a
PHP \`match()\` on a \`$shape->type\` string.

\`\`\`typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };
\`\`\`

Switch on \`shape.kind\` and inside each \`case\` the other fields are fully typed.

### User-defined type guards

When a check is too clever for the compiler, write a function whose return type
is \`param is Type\`. A \`true\` return *teaches* TS the narrowed type:

\`\`\`typescript
function isString(x: unknown): x is string {
  return typeof x === "string";
}
\`\`\`

### Exhaustiveness with \`never\`

\`never\` is the type with **no values**. In a \`switch\`'s \`default\`, assign the
variable to a \`never\`. If you later add a new union member and forget a \`case\`,
that assignment stops compiling — a compile-time "you missed one". PHP's
\`match()\` throws \`UnhandledMatchError\` at *runtime*; TypeScript catches it before
you ship.
`,

  comparisons: [
    {
      label: "Checking a primitive type",
      intro:
        "A describe function receives a value that's either a string or a number and returns a different message for each. The goal is to safely call string-only methods in one branch and treat it as a number in the other.",
      php: `<?php
function describe(mixed $v): string {
    if (is_string($v)) {
        return "string of length " . strlen($v);
    }
    if (is_int($v)) {
        return "int " . $v;
    }
    return gettype($v);
}`,
      ts: `function describe(v: string | number): string {
  if (typeof v === "string") {
    return \`string of length \${v.length}\`;
  }
  // v is narrowed to number here automatically
  return \`number \${v}\`;
}`,
      note:
        "PHP's is_string/is_int return a bool you act on; TS's typeof check actually changes the variable's static type inside the branch.",
    },
    {
      label: "Narrowing a class instance",
      intro:
        "Here we compute the area of a shape that is either a Circle or a Square, using a different formula for each. We check which class the instance is so we can reach into the right property (radius or side).",
      php: `<?php
function area(object $s): float {
    if ($s instanceof Circle) {
        return M_PI * $s->radius ** 2;
    }
    if ($s instanceof Square) {
        return $s->side ** 2;
    }
    throw new InvalidArgumentException();
}`,
      ts: `function area(s: Circle | Square): number {
  if (s instanceof Circle) {
    return Math.PI * s.radius ** 2; // s: Circle
  }
  return s.side ** 2;               // s: Square
}`,
      note:
        "instanceof works the same in both, but TS knows the second branch must be Square — no manual throw needed when the union is exhausted.",
    },
    {
      label: "Narrowing by property presence",
      intro:
        "A move function gets either a Car or a Boat, which are plain object shapes with no shared class. We tell them apart by which property exists so we can return the right action: drive for the one with wheels, sail for the other.",
      php: `<?php
// No built-in operator — you test the property/key yourself:
function move(object $v): string {
    if (property_exists($v, 'wheels')) {
        return "drive";
    }
    return "sail";
}`,
      ts: `type Car = { wheels: number };
type Boat = { sails: number };

function move(v: Car | Boat): string {
  if ("wheels" in v) return "drive"; // v: Car
  return "sail";                     // v: Boat
}`,
      note:
        "TS's `in` operator both tests the key AND narrows the type; PHP's property_exists only returns a bool.",
    },
    {
      label: "match() vs exhaustive switch with never",
      intro:
        "We map each variant of a tagged shape to a label word. The point is to make sure every possible variant is handled, so that adding a new shape later forces us to handle it too.",
      php: `<?php
// Runtime safety: throws UnhandledMatchError if a case is missing.
$label = match ($shape->kind) {
    'circle' => 'round',
    'square' => 'boxy',
};`,
      ts: `function label(shape: Shape): string {
  switch (shape.kind) {
    case "circle": return "round";
    case "square": return "boxy";
    default:
      // Compile error if a Shape variant is unhandled:
      const _exhaustive: never = shape;
      return _exhaustive;
  }
}`,
      note:
        "PHP catches a missing case at runtime; the `never` assignment catches it at compile time, before the code ever runs.",
    },
  ],

  playground: {
    intro:
      "A discriminated union of shapes. The switch narrows each case fully, and the never-typed default proves you handled them all. Try adding a new shape to the union without adding a case — the default line will refuse to compile.",
    code: `// Each member carries a literal "kind" tag — the discriminant.
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number }
  | { kind: "rectangle"; width: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      // shape is { kind: "circle"; radius: number } here
      return Math.PI * shape.radius ** 2;
    case "square":
      return shape.side ** 2;
    case "rectangle":
      return shape.width * shape.height;
    default: {
      // If you add a 4th shape and forget its case,
      // 'shape' won't be 'never' and this line stops compiling.
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}

const shapes: Shape[] = [
  { kind: "circle", radius: 2 },
  { kind: "square", side: 3 },
  { kind: "rectangle", width: 4, height: 5 },
];

for (const shape of shapes) {
  console.log(\`\${shape.kind} area = \${area(shape).toFixed(2)}\`);
}`,
  },

  keyPoints: [
    "**Narrowing** = the compiler refining a wide type to a precise one inside a branch, based on your control flow.",
    "Use `typeof` for primitives, `instanceof` for classes, `in` for property presence, plus truthiness and equality checks.",
    "**Discriminated unions** — a shared literal tag field (`kind`, `type`, `status`) — make `switch` narrowing clean and reliable.",
    "A **user-defined type guard** returns `param is Type` to teach the compiler about checks it can't infer itself.",
    "Assigning to a `never` in a `switch` default gives you **compile-time exhaustiveness** — the safety PHP's `match()` only provides at runtime.",
    "Narrowing is free documentation: each branch's type tells the next reader exactly what's possible there.",
  ],

  interview: [
    {
      q: "What is type narrowing, and how is it different from the type checks you'd write in PHP?",
      a: "Narrowing is TypeScript's **flow analysis**: as you check a value, the compiler reduces its type within that branch. In PHP, `is_string($v)` returns a `bool` you branch on, but `$v`'s type is the same everywhere. In TS, after `if (typeof v === \"string\")` the variable *is* `string` inside the `if` and has `string` removed from the union outside it. The check and the type refinement are the same act.",
    },
    {
      q: "What's a discriminated union, and why is it the idiomatic way to model variants?",
      a: "It's a union where every member shares a **literal tag field** — e.g. `{ kind: \"circle\"; radius: number } | { kind: \"square\"; side: number }`. Switching on `kind` narrows the whole object: in the `\"circle\"` case, `radius` is available and `side` is not. It's the typed equivalent of a PHP `match` on `$obj->type`, but the compiler knows each branch's shape and can verify you handled every variant.",
    },
    {
      q: "How do you write a custom type guard, and when do you need one?",
      a: "Write a function returning `param is Type`:\n```typescript\nfunction isUser(x: unknown): x is User {\n  return typeof x === \"object\" && x !== null && \"id\" in x;\n}\n```\nA `true` return narrows the argument to `User` at the call site. You need them when validation logic is too involved for the built-in `typeof`/`instanceof`/`in` checks — typically when validating `unknown` data from an API, a bit like writing your own `is_valid_user()` helper in PHP, except this one feeds the type system.",
    },
    {
      q: "How do you guarantee a switch handles every case, and how does that compare to PHP's match()?",
      a: "Add a `default` branch that assigns the switched value to a variable typed `never`: `const _exhaustive: never = shape;`. Because `never` accepts no values, this only compiles if every union member was already handled — so adding a new variant and forgetting a `case` becomes a **build error**. PHP's `match()` throws `UnhandledMatchError`, but only **at runtime** when that path actually executes. TypeScript moves the guarantee to compile time.",
    },
    {
      q: "Why does `in` sometimes work where `typeof` can't?",
      a: "`typeof` only distinguishes JavaScript's primitive type tags (and lumps every object, array, and `null` together as `\"object\"`). To tell two object *shapes* apart you check for a distinguishing property: `if (\"wheels\" in vehicle)` narrows to the member that has `wheels`. For class instances you'd use `instanceof` instead, but plain object types have no class, so `in` (or a discriminant tag) is the tool.",
    },
  ],

  quiz: [
    {
      question:
        "Inside `if (typeof v === \"string\") { ... }` where `v: string | number`, what is the type of `v` in the else branch?",
      options: ["string | number", "string", "number", "unknown"],
      answerIndex: 2,
      explain:
        "The if-branch narrows v to string, so flow analysis removes string from the union in the else branch, leaving number.",
    },
    {
      question: "What does a user-defined type guard's return type look like?",
      options: [
        "boolean",
        "param is Type",
        "asserts param",
        "Type | undefined",
      ],
      answerIndex: 1,
      explain:
        "A type predicate has the form `param is Type`. Returning true tells the compiler the argument can be narrowed to Type. (`asserts param` is a related but different assertion-style guard.)",
    },
    {
      question:
        "Why assign the switched value to a `never`-typed variable in the default case?",
      options: [
        "It throws a runtime error like PHP's UnhandledMatchError",
        "It makes the switch run faster",
        "It causes a compile error if any union member was left unhandled",
        "It converts the value to null for safety",
      ],
      answerIndex: 2,
      explain:
        "If every case is handled, the value's type is reduced to never and the assignment compiles. If a variant is missing, the value isn't never and the assignment fails to compile — giving you compile-time exhaustiveness checking.",
    },
  ],
};

export default lesson;
