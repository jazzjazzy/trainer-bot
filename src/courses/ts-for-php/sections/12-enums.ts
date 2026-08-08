import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "enums",
  title: "Enums",
  part: "The Type System",
  estMinutes: 12,
  summary:
    "TypeScript enums give you named constant sets like PHP 8.1 enums — but they behave very differently at runtime, and often a plain union of string literals is the better choice.",

  concept: `
PHP got first-class enums in 8.1, and you probably reach for them constantly:
\`enum Status { case Active; case Banned; }\`. TypeScript has had \`enum\` since
the beginning — but here's the twist that trips up every PHP developer: a regular
TypeScript enum is one of the *very few* TS features that **survives compilation**
and exists at runtime. Almost everything else in the type system is erased.

### Numeric enums

The default. Members auto-number from 0 unless you assign values.

\`\`\`typescript
enum Direction {
  Up,      // 0
  Down,    // 1
  Left,    // 2
  Right,   // 3
}
const d: Direction = Direction.Up; // 0
\`\`\`

Numeric enums even build a **reverse map** (\`Direction[0] === "Up"\`), which is
occasionally handy and frequently surprising.

### String enums

Usually what you actually want — readable, debuggable values with no reverse map.

\`\`\`typescript
enum Status {
  Active = "ACTIVE",
  Banned = "BANNED",
}
console.log(Status.Active); // "ACTIVE"
\`\`\`

This is the closest analogue to a PHP **backed enum** (\`enum Status: string\`).

### const enum

Add \`const\` and the enum is **fully inlined and erased** — no runtime object is
emitted at all. \`Status.Active\` becomes the literal \`"ACTIVE"\` in the output.

\`\`\`typescript
const enum Color { Red = "RED", Blue = "BLUE" }
const c = Color.Red; // compiles to: const c = "RED";
\`\`\`

Smaller output, but you lose the runtime object (you can't iterate it), and it
behaves badly under isolated/per-file compilation (Babel, some bundlers).

### The union-of-literals alternative

You often don't need \`enum\` at all. A union of string literals gives you the
same compile-time safety with **zero runtime footprint**:

\`\`\`typescript
type Status = "ACTIVE" | "BANNED";
const s: Status = "ACTIVE"; // "BADGER" is a compile error
\`\`\`

**Prefer the union** when you only need the values and type-checking. **Reach for
a real enum** when you need a runtime object to iterate, a namespace of grouped
constants, or a reverse map.
`,

  comparisons: [
    {
      label: "Pure enum (no values) vs numeric enum",
      intro:
        "Defining the four card suits as an enum and grabbing one member. The point is to see what value that member actually holds when you didn't assign one.",
      php: `<?php
enum Suit {
    case Hearts;
    case Spades;
    case Clubs;
    case Diamonds;
}

$s = Suit::Hearts;`,
      ts: `enum Suit {
  Hearts,   // 0
  Spades,   // 1
  Clubs,    // 2
  Diamonds, // 3
}

const s: Suit = Suit.Hearts;`,
      note:
        "A PHP pure enum case has no scalar value; a TS numeric enum member silently *is* a number (0, 1, 2...).",
    },
    {
      label: "Backed enum vs string enum",
      intro:
        "Modelling an account status with explicit string values, then reading the value of the Active case. The result is the string \"ACTIVE\" in both languages.",
      php: `<?php
enum Status: string {
    case Active = 'ACTIVE';
    case Banned = 'BANNED';
}

echo Status::Active->value; // "ACTIVE"`,
      ts: `enum Status {
  Active = "ACTIVE",
  Banned = "BANNED",
}

console.log(Status.Active); // "ACTIVE"`,
      note:
        "PHP separates the case (Status::Active) from its backing value (->value). A TS string enum member IS the value directly.",
    },
    {
      label: "Resolving a value back to a case",
      intro:
        "Taking a raw string (say, from a request body) and turning it into a valid Status, returning nothing when the string isn't a real member. Here \"ACTIVE\" resolves and \"NOPE\" does not.",
      php: `<?php
// from() throws if invalid; tryFrom() returns null
$case = Status::from('ACTIVE');      // Status::Active
$maybe = Status::tryFrom('NOPE');    // null`,
      ts: `// No built-in from()/tryFrom(). You guard manually:
function toStatus(v: string): Status | undefined {
  return (Object.values(Status) as string[]).includes(v)
    ? (v as Status)
    : undefined;
}`,
      note:
        "PHP gives you from()/tryFrom() out of the box. In TS you validate against Object.values() yourself.",
    },
    {
      label: "Enumerating cases",
      intro:
        "Looping over every member of the Status enum to print its value — the kind of thing you'd do to build a dropdown or validate against all options.",
      php: `<?php
foreach (Status::cases() as $c) {
    echo $c->value, "\\n";
}`,
      ts: `for (const v of Object.values(Status)) {
  console.log(v);
}`,
      note:
        "PHP has a clean cases() method. TS uses Object.values() — and for a *numeric* enum that also returns the reverse-map keys, so string enums iterate more cleanly.",
    },
    {
      label: "const enum erasure",
      intro:
        "Reading a single enum member into a variable, then looking at what each language leaves in the compiled output. In TS with const enum, the variable is just assigned the literal string and no enum object survives.",
      php: `<?php
// PHP enums always exist at runtime —
// there is no "erased" enum.
$x = Status::Active->value;`,
      ts: `const enum Status { Active = "ACTIVE" }
const x = Status.Active;
// Compiles to:  const x = "ACTIVE";
// No Status object exists at runtime at all.`,
      note:
        "A TS const enum is inlined and disappears from the output — there is no PHP equivalent; PHP enums are always real runtime objects.",
    },
  ],

  playground: {
    intro:
      "A string enum used in a function, then the exact same logic with a literal-union type. Run it and compare — both type-check, but only the enum exists as a runtime object.",
    code: `// --- Approach 1: a string enum (real runtime object) ---
enum Level {
  Info = "INFO",
  Warn = "WARN",
  Error = "ERROR",
}

function log(level: Level, msg: string): string {
  return \`[\${level}] \${msg}\`;
}

console.log(log(Level.Warn, "disk almost full"));

// Because the enum is a real object, we can iterate it:
console.log("All levels:", Object.values(Level).join(", "));

// --- Approach 2: a literal union (zero runtime footprint) ---
type ULevel = "INFO" | "WARN" | "ERROR";

function ulog(level: ULevel, msg: string): string {
  return \`[\${level}] \${msg}\`;
}

console.log(ulog("ERROR", "out of memory"));

// Same compile-time safety. Uncommenting this is a type error in both:
// log("DEBUG", "x");   // not a Level
// ulog("DEBUG", "x");  // not a ULevel

// The union has no runtime object to list — you'd keep the values
// in a plain array if you needed them:
const allULevels: ULevel[] = ["INFO", "WARN", "ERROR"];
console.log("All ULevels:", allULevels.join(", "));`,
  },

  keyPoints: [
    "A regular `enum` is one of the few TS features that **emits real runtime code** — most types are erased.",
    "**Numeric enums** auto-number from 0 and build a reverse map; **string enums** map members to readable strings (closest to a PHP backed enum).",
    "`const enum` is **fully inlined and erased** — smaller output, but no iterable runtime object and poor support under isolated compilation.",
    "TS has no built-in `from()`/`tryFrom()`/`cases()` — use `Object.values(Enum)` and validate manually.",
    "Prefer a **union of string literals** (`type X = \"a\" | \"b\"`) for plain value-and-safety needs; use a real enum only when you need the runtime object.",
  ],

  interview: [
    {
      q: "How does a TypeScript enum differ from a PHP 8.1 backed enum at runtime?",
      a: "Both exist at runtime, but the shape differs. A PHP backed enum is a set of singleton case *objects*, each with a `->value`, plus methods like `cases()`, `from()`, and `tryFrom()`. A TS string enum compiles to a plain JavaScript **object** mapping member names to their values (`{ Active: \"ACTIVE\" }`), with no methods. So in TS, `Status.Active` *is* the string `\"ACTIVE\"` directly, whereas in PHP `Status::Active` is a case object and you call `->value` to get the string.",
    },
    {
      q: "When would you choose a union of string literals over an enum?",
      a: "Most of the time. A union like `type Status = \"ACTIVE\" | \"BANNED\"` gives identical compile-time checking, autocomplete, and exhaustiveness — but is **fully erased**, so it adds zero bytes and no runtime object. Reach for a real `enum` only when you genuinely need the runtime artifact: iterating all members with `Object.values()`, a namespaced group of constants, or a numeric reverse map. As an ex-PHP dev, think of the union as 'I just want the type' and the enum as 'I want a real `Status` thing I can loop over'.",
    },
    {
      q: "What does `const enum` do, and what's the catch?",
      a: "`const enum` tells the compiler to **inline** every usage and emit **no runtime object** at all — `Color.Red` becomes the literal `\"RED\"` in the output. The upside is smaller, faster code. The catch: there's no object to iterate at runtime, and it breaks under `isolatedModules` / single-file transpilers like Babel and some bundlers because they can't see the enum's definition when compiling another file. Many teams ban `const enum` for that reason and use unions instead.",
    },
    {
      q: "Why are numeric enums sometimes considered unsafe?",
      a: "A numeric enum builds a **reverse map**. In *older* TypeScript versions it was also loosely assignable from `number` — `let d: Direction = 99` was wrongly accepted even though 99 isn't a real member. That was a compiler-*version* issue, not a config one: since TS 5.0 (building on 4.3) all enums are treated as unions of their members, so out-of-range numeric literals like `99` are now correctly errors regardless of strictness flags. The remaining footgun is the reverse map: `Object.values()` on a numeric enum yields the reverse-map name strings *and* the numeric values together, so iteration is unreliable. String enums iterate cleanly, which is why they (or unions) are the usual recommendation.",
    },
  ],

  quiz: [
    {
      question:
        "Which of these is true of a regular (non-const) TypeScript enum, unlike most other TS types?",
      options: [
        "It is erased at compile time and has no runtime presence",
        "It compiles to a real JavaScript object that exists at runtime",
        "It can only hold numbers, never strings",
        "It is enforced by the runtime like PHP's strict_types",
      ],
      answerIndex: 1,
      explain:
        "A regular enum emits a real runtime JavaScript object (e.g. { Active: \"ACTIVE\" }). This makes it one of the few TS features not erased during compilation.",
    },
    {
      question:
        "What is the runtime value of `Status.Active` given `enum Status { Active = \"ACTIVE\" }`?",
      options: [
        "A case object; you must call .value to get \"ACTIVE\"",
        "The number 0",
        "The string \"ACTIVE\" directly",
        "undefined, because string enums are erased",
      ],
      answerIndex: 2,
      explain:
        "Unlike PHP where Status::Active is a case object needing ->value, a TS string enum member IS the value — Status.Active is the string \"ACTIVE\".",
    },
    {
      question:
        "Why do many teams prefer `type Status = \"ACTIVE\" | \"BANNED\"` over an enum?",
      options: [
        "Unions are checked at runtime, enums are not",
        "Unions give the same type safety but are fully erased — zero runtime footprint",
        "Enums cannot be used as function parameters",
        "Unions automatically provide from() and tryFrom() methods",
      ],
      answerIndex: 1,
      explain:
        "A literal union offers the same compile-time checking and autocomplete as an enum, but is erased entirely — adding no runtime object or bytes. Enums are reserved for when you need the runtime artifact.",
    },
  ],
};

export default lesson;
