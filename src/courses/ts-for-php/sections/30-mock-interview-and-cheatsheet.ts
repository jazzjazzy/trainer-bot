import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "mock-interview-and-cheatsheet",
  title: "Mock Interview & PHP→TS Cheat Sheet",
  part: "Ecosystem & Interview",
  estMinutes: 30,
  summary:
    "The capstone: a dense PHP→TS translation cheat sheet, a typical interview coding warm-up, and the framing a 20-year PHP veteran should bring into the room.",

  concept: `
This is the capstone. Everything from the previous 29 sections, compressed into a
reference you can scan the night before an interview. Keep one idea front of mind:
**you are not a beginner.** You have 20 years of typed, object-oriented,
production-grade experience. TypeScript is a new dialect, not a new craft.

### Syntax mapping

| Concept | PHP | TypeScript |
| --- | --- | --- |
| Typed variable | \`$n = 5;\` (locals can't be typed) | \`const n: number = 5;\` |
| Typed function | \`function f(int $a): int\` | \`function f(a: number): number\` |
| Nullable | \`?string\` | \`string \| null\` (or \`string \| undefined\`) |
| Union | \`int\|string\` | \`number \| string\` |
| String interp | \`"Hi $name"\` | \`\` \`Hi \${name}\` \`\` (backticks) |
| Array of T | \`/** @var int[] */\` | \`number[]\` or \`Array<number>\` |
| Map / dict | \`['a' => 1]\` | \`Record<string, number>\` |
| Constant | \`const FOO = 1;\` | \`const FOO = 1;\` (already infers literal \`1\`) |

### Type system

| PHP | TypeScript | Note |
| --- | --- | --- |
| Nominal typing | Structural typing | Shape matches, not the name |
| \`mixed\` | \`unknown\` (safe) / \`any\` (unsafe) | Prefer \`unknown\` |
| \`void\` | \`void\` | Same idea |
| \`never\` (8.1) | \`never\` | Unreachable / exhaustive |
| Enum (8.1) | \`enum\` or union of literals | Unions are usually better |
| Generics (docblock only) | First-class \`<T>\` | Real, checked generics |

### Tooling

| PHP | TypeScript |
| --- | --- |
| Composer | npm / pnpm / yarn |
| \`composer.json\` | \`package.json\` |
| PSR-4 autoload | ES modules (\`import\`/\`export\`) |
| PHPStan / Psalm | \`tsc --strict\` (built in) |
| PHP-CS-Fixer | Prettier + ESLint |
| PHPUnit | Vitest / Jest |

### OOP

| PHP | TypeScript | Note |
| --- | --- | --- |
| \`class\`, \`extends\` | Same keywords | Single inheritance |
| \`interface\`, \`implements\` | Same, but structural | No explicit \`implements\` needed to fit a shape |
| \`abstract\` | \`abstract\` | Same |
| \`private\`/\`protected\`/\`public\` | Same modifiers + \`#field\` | \`#\` is true runtime-private |
| Traits | Mixins (no native keyword) | Composition via functions |

### Top gotchas

| Gotcha | What bites you |
| --- | --- |
| Types are erased | No runtime type checks — validate external data yourself |
| \`==\` vs \`===\` | Always use \`===\`; \`==\` coerces like PHP's loose \`==\` |
| \`null\` vs \`undefined\` | Two empty values, not one |
| Structural typing | Extra properties can slip through |
| \`this\` binding | Arrow functions capture \`this\`; regular ones don't |

### Framing the transition

Lead with what transfers: typed contracts, OOP, dependency injection, testing
discipline. Then show you grasp the **two real differences** — compile-time
erasure (so you still validate at the edges) and structural typing. That story
signals seniority, not retraining.
`,

  comparisons: [
    {
      label: "Null-safe property access",
      intro:
        "You want a user's city, but the user, their address, or the city itself might be missing. The goal is to safely reach for the nested value and fall back to 'Unknown' instead of crashing on a null.",
      php: `<?php
$city = $user?->address?->city ?? 'Unknown';`,
      ts: `const city = user?.address?.city ?? "Unknown";`,
      note:
        "Optional chaining and nullish coalescing are nearly identical — but `??` in TS only triggers on null/undefined, never on 0 or ''.",
    },
    {
      label: "Mapping over a collection",
      intro:
        "Given a list of user objects, you want just their names pulled out into a new list. The result is an array of strings, one per user.",
      php: `<?php
$names = array_map(fn($u) => $u->name, $users);`,
      ts: `const names = users.map((u) => u.name);`,
      note:
        "TS `.map` is a method on the array, and the result type is inferred as `string[]` — no docblock needed.",
    },
    {
      label: "Shape contracts",
      intro:
        "You define a HasId contract and want a User value to count as satisfying it. The point is to show how each language decides whether a value fulfils that contract.",
      php: `<?php
interface HasId { public function getId(): int; }
class User implements HasId {
    public function getId(): int { return $this->id; }
}`,
      ts: `interface HasId { id: number }
// No "implements" required — any object with an
// id: number structurally satisfies HasId:
const user: HasId = { id: 1 };`,
      note:
        "PHP is nominal (must declare `implements`). TS is structural — the right shape just fits.",
    },
    {
      label: "Exhaustive switch",
      intro:
        "You have a Status that is either open or done, and you want to turn it into a human-readable label. The aim is to handle every possible status and produce the matching text.",
      php: `<?php
enum Status: string { case Open = 'open'; case Done = 'done'; }
$label = match($status) {
    Status::Open => 'Open',
    Status::Done => 'Done',
};`,
      ts: `type Status = "open" | "done";
function label(s: Status): string {
  switch (s) {
    case "open": return "Open";
    case "done": return "Done";
    default: { const _x: never = s; return _x; }
  }
}`,
      note:
        "Assigning the leftover case to `never` makes TS fail the build if you add a status and forget to handle it.",
    },
    {
      label: "Validating external data",
      intro:
        "A raw JSON request body arrives and you need a numeric age out of it. The goal is to safely extract that age, defaulting to 0 when the data doesn't actually contain a valid number.",
      php: `<?php
$data = json_decode($body, true);
$age = (int) ($data['age'] ?? 0);`,
      ts: `const data: unknown = JSON.parse(body);
function isUser(d: unknown): d is { age: number } {
  return typeof d === "object" && d !== null &&
    "age" in d && typeof (d as any).age === "number";
}
const age = isUser(data) ? data.age : 0;`,
      note:
        "TS types are erased at runtime, so parsed JSON is `unknown` — narrow it with a type guard before trusting it.",
    },
  ],

  playground: {
    intro:
      "A typical interview warm-up: implement a generic groupBy. The interviewer wants to see you reach for generics and a constrained key type, not `any`. Run it.",
    code: `// Generic groupBy: K is constrained to valid object-key types.
function groupBy<T, K extends string | number>(
  items: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  // Start from an empty object; we'll build it up.
  const result = {} as Record<K, T[]>;
  for (const item of items) {
    const key = keyFn(item);
    // First time we see this key, create the bucket.
    (result[key] ??= []).push(item);
  }
  return result;
}

// Sample data — note 'role' is a literal union, great as a key.
interface Person {
  name: string;
  role: "dev" | "designer" | "pm";
  age: number;
}

const people: Person[] = [
  { name: "Ada", role: "dev", age: 36 },
  { name: "Linus", role: "dev", age: 41 },
  { name: "Don", role: "designer", age: 29 },
  { name: "Grace", role: "pm", age: 52 },
];

// Group by role:
const byRole = groupBy(people, (p) => p.role);
console.log("By role:");
for (const role of Object.keys(byRole)) {
  const names = byRole[role as Person["role"]].map((p) => p.name);
  console.log("  " + role + ": " + names.join(", "));
}

// Group by a derived numeric key (decade of age):
const byDecade = groupBy(people, (p) => Math.floor(p.age / 10) * 10);
console.log("By decade:");
for (const decade of Object.keys(byDecade)) {
  console.log("  " + decade + "s: " + byDecade[Number(decade)].length);
}`,
  },

  keyPoints: [
    "You're a senior engineer learning a dialect — **lead with what transfers**: typed contracts, OOP, DI, tests.",
    "The two differences that matter most: **types are erased** (validate at the edges) and **typing is structural** (shape, not name).",
    "Prefer `unknown` over `any`, `===` over `==`, and **literal unions** over enums.",
    "Reach for **generics** on collection helpers (`groupBy`, `map`) — interviewers look for it.",
    "Tooling maps cleanly: Composer→npm, PHPUnit→Vitest, PHPStan→`tsc --strict`, PHP-CS-Fixer→Prettier/ESLint.",
    "Handle `null` **and** `undefined`, and use `??`/`?.` to do it concisely.",
  ],

  interview: [
    {
      q: "Sell me on your transition: why should we hire a PHP developer for a TypeScript role?",
      a: "Twenty years of PHP means twenty years of typed contracts, OOP design, dependency injection, and testing discipline — all of which transfer directly. Modern PHP already has scalar types, union types, enums, and `declare(strict_types=1)`, so static typing isn't new to me; TypeScript just moves the check **earlier** (compile time) and makes it **structural**. The genuinely new parts — type erasure and structural typing — I already understand and account for. I'm not retraining; I'm switching dialects.",
    },
    {
      q: "What's the single biggest conceptual difference between PHP's type system and TypeScript's?",
      a: "**Nominal vs structural.** PHP is nominal: a class must explicitly `implements SomeInterface` to satisfy it. TypeScript is structural — any value with the right *shape* fits the type, no declaration required. So `{ id: 1 }` satisfies `interface HasId { id: number }` automatically. It's more flexible but means extra/unexpected properties can slip through, so I lean on `as const`, exact-shape factory functions, and validation at boundaries.",
    },
    {
      q: "Types are erased at compile time. What does that mean for production code?",
      a: "It means TypeScript gives me **zero runtime guarantees**. The types vanish in the compiled JavaScript, so anything crossing a boundary — API responses, form input, `JSON.parse`, env vars — arrives as `unknown` and could be anything. I validate it explicitly with type guards or a schema library like Zod, then let the inferred types flow inward. It's the same instinct as never trusting `$_POST` in PHP.",
    },
    {
      q: "When would you use `unknown` instead of `any`?",
      a: "Almost always. `any` switches off the type checker entirely — it propagates and silently defeats the whole point. `unknown` is the *safe* top type: I can hold any value, but I must **narrow** it (with `typeof`, `in`, or a type guard) before I use it. It's PHP's `mixed` done right. `any` is an escape hatch for genuine emergencies; `unknown` is the default for untrusted data.",
    },
    {
      q: "How do enums in PHP compare to TypeScript, and which would you reach for?",
      a: "PHP 8.1 enums are first-class objects. TypeScript has an `enum` keyword too, but it emits runtime code and has surprising edge cases (numeric enums are bidirectional, `const enum` has bundling caveats). For most cases I prefer a **union of string literals** — `type Status = \"open\" | \"done\"` — because it's erased to nothing, narrows cleanly in a `switch`, and pairs with a `never` check for exhaustiveness. I use `enum` only when I need a real runtime object to iterate.",
    },
    {
      q: "Walk me through making a switch statement exhaustive.",
      a: "I type the discriminant as a literal union, handle each case, and in the `default` assign the value to a `never`:\n\n\`\`\`ts\nfunction f(s: \"a\" | \"b\"): string {\n  switch (s) {\n    case \"a\": return \"A\";\n    case \"b\": return \"B\";\n    default: { const _x: never = s; return _x; }\n  }\n}\n\`\`\`\n\nIf someone adds `\"c\"` to the union later, `s` is no longer assignable to `never` and the build fails — the compiler forces me to handle the new case. PHP's `match` throws at runtime for an unhandled case; this catches it at compile time.",
    },
    {
      q: "Explain generics with a concrete example.",
      a: "Generics are type parameters — like PHP's docblock generics (`@template T`) but real and checked. A function like `groupBy<T, K extends string | number>(items: T[], keyFn: (item: T) => K): Record<K, T[]>` works for any element type while preserving it: pass `Person[]` and you get back `Record<..., Person[]>`, with full autocomplete. The `extends string | number` *constrains* K to types that can actually be object keys. Generics let me write reusable, type-safe utilities instead of falling back to `any`.",
    },
    {
      q: "What's the difference between `interface` and `type` in TypeScript?",
      a: "Both describe shapes. `interface` can be **declaration-merged** (re-opened and extended) and reads naturally for object/class contracts — closest to PHP's `interface`. `type` aliases can do everything interfaces can for objects, **plus** unions, intersections, tuples, mapped and conditional types. My rule of thumb: `interface` for public object/class contracts, `type` for unions and anything computed. The difference rarely matters day to day.",
    },
    {
      q: "How do `null` and `undefined` differ, and how do you handle them?",
      a: "PHP has one `null`; TypeScript has two empty values. `undefined` means \"never set / missing\" (uninitialized variable, absent property, no return). `null` means \"intentionally empty.\" With `strictNullChecks` on, both must be handled explicitly. I use optional chaining `?.` to short-circuit and nullish coalescing `??` to supply defaults — and I remember `??` only fires on `null`/`undefined`, not on `0` or `\"\"`, unlike `||`.",
    },
    {
      q: "What is `as const` and when do you use it?",
      a: "`as const` marks the properties of an object literal (and elements of an array literal) as `readonly` — recursively for nested literals — and infers the narrowest **literal** types instead of widened ones. Without it, `const x = { role: \"dev\" }` infers `role: string`; with `as const` it infers `role: \"dev\"`. Note it's a compile-time-only `readonly`, not a deep freeze: it doesn't lock down values reached through shared references — `const foo = { contents: arr } as const` still lets `foo.contents.push(5)`. I use it for configuration objects, lookup tables, and to derive union types from a single source of truth — e.g. `const ROLES = [\"dev\", \"pm\"] as const; type Role = typeof ROLES[number];`. It keeps runtime data and compile-time types in sync.",
    },
    {
      q: "How does asynchronous code in TypeScript compare to PHP?",
      a: "PHP is mostly synchronous and request-scoped; you rarely deal with concurrency in app code. JavaScript is single-threaded with an **event loop**, so I/O is asynchronous by default. I use `async`/`await` over Promises — which reads almost exactly like synchronous code — and an `async` function always returns `Promise<T>`. The mental shift is that nothing blocks: a database call yields control back to the loop, and I `await` the result. `Promise.all` runs independent async work in parallel.",
    },
    {
      q: "How do you handle errors in TypeScript versus PHP?",
      a: "Both use `try`/`catch`/`finally` and throwable exceptions, so the mechanics feel familiar. The key TS difference: in a `catch` the error is typed `unknown` (you can technically `throw` anything in JS), so I narrow with `if (e instanceof Error)` before reading `e.message`. There are no checked exceptions and no typed `throws` clause, so for predictable failures I often return a result union like `{ ok: true; value: T } | { ok: false; error: string }` instead of throwing.",
    },
    {
      q: "What is structural typing's downside, and how do you mitigate it?",
      a: "Because any matching shape fits, **excess or accidentally-compatible properties** can pass type-checking when you didn't intend them to, and two unrelated types that happen to share a shape are interchangeable. Mitigations: use object literals directly (TS applies *excess property checks* on literals), brand types with a unique tag for nominal-like safety (`type UserId = string & { __brand: \"UserId\" }`), and validate external data at runtime so shape assumptions are actually enforced.",
    },
    {
      q: "How does the TypeScript module system compare to PHP autoloading?",
      a: "PHP uses PSR-4 autoloading via Composer — namespaces map to file paths and classes load on demand. TypeScript uses **ES modules**: every file is its own module, you explicitly `export` what's public and `import` what you need, and the bundler resolves and tree-shakes. There's no global autoload magic — imports are explicit, which makes dependencies and dead code obvious. `npm` plays Composer's role for third-party packages.",
    },
    {
      q: "If `tsc` passes, is your code correct?",
      a: "No — only **type-consistent**, not correct. `tsc` proves the types line up; it doesn't prove the logic is right, that external data matches its declared type, or that there are no runtime errors from things like array bounds or division by zero. I still need unit tests (Vitest/Jest) for behavior and runtime validation for boundaries. A green build is necessary, not sufficient — same as PHPStan passing doesn't mean PHPUnit will.",
    },
    {
      q: "What tooling would you set up on a new TypeScript project?",
      a: "`tsconfig.json` with `\"strict\": true` from day one (non-negotiable), a bundler/dev server like Vite, **Prettier** for formatting and **ESLint** with the typescript-eslint plugin for lint rules, and **Vitest** for tests. That maps almost one-to-one onto a modern PHP stack: Composer→npm, PHP-CS-Fixer→Prettier, PHPStan→`tsc --strict` + ESLint, PHPUnit→Vitest. I'd wire them into CI so the build, lint, and tests all gate merges.",
    },
  ],

  quiz: [
    {
      question:
        "An interviewer asks for the safest type to hold a value parsed from an untrusted API. What do you pick?",
      options: ["any", "unknown", "object", "mixed"],
      answerIndex: 1,
      explain:
        "`unknown` is the safe top type: it can hold anything, but forces you to narrow before use. `any` disables checking, `mixed` is PHP not TS, and `object` excludes primitives.",
    },
    {
      question:
        "Why do TypeScript types provide no runtime guarantees about an API response?",
      options: [
        "Because the API is always trusted",
        "Because types are erased at compile time and don't exist at runtime",
        "Because TypeScript validates every response automatically",
        "Because JSON.parse returns the declared type",
      ],
      answerIndex: 1,
      explain:
        "TypeScript erases all types during compilation, so the running JavaScript has no type information and cannot enforce anything at runtime — you must validate boundary data yourself.",
    },
    {
      question:
        "What is the main practical difference between PHP interfaces and TypeScript interfaces?",
      options: [
        "TypeScript interfaces are checked at runtime",
        "PHP interfaces support generics but TypeScript ones don't",
        "PHP is nominal (must declare `implements`); TypeScript is structural (shape matches automatically)",
        "There is no difference",
      ],
      answerIndex: 2,
      explain:
        "PHP requires an explicit `implements` (nominal typing). In TypeScript any value with the right shape satisfies an interface automatically (structural typing).",
    },
    {
      question:
        "In the generic signature `groupBy<T, K extends string | number>`, what does `K extends string | number` do?",
      options: [
        "Forces every item to be a string or number",
        "Constrains the key type to values usable as object keys",
        "Makes the function return only strings and numbers",
        "Prevents the use of generics entirely",
      ],
      answerIndex: 1,
      explain:
        "The `extends` clause is a generic constraint: it restricts K to `string | number`, which are valid object-key types, so `Record<K, T[]>` is well-formed.",
    },
  ],
};

export default lesson;
