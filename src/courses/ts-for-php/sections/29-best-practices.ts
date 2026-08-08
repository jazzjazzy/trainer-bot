import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "best-practices",
  title: "Best Practices, Patterns & Pitfalls",
  part: "Ecosystem & Interview",
  estMinutes: 14,
  summary:
    "The handful of habits that separate idiomatic, maintainable TypeScript from the any-riddled mess — framed as the interview talking points you'll actually be graded on.",

  concept: `
Most of these rules are just the modern-PHP discipline you already have — \`declare(strict_types=1)\`,
typed properties, programming to interfaces, avoiding \`mixed\` — carried over to a checker that runs
*before* the code does. Here's the short list that comes up in every code review and every interview.

### type vs interface

Both describe object shapes and are mostly interchangeable. The rule of thumb:

- Use **\`interface\`** for object/class contracts you might \`extends\` or \`implements\` — it's the
  closest thing to a PHP \`interface\`, and it supports declaration merging.
- Use **\`type\`** when you need a union, an intersection, a tuple, a mapped type, or to alias a
  primitive — things \`interface\` simply can't express.

\`\`\`ts
interface User { id: number; name: string; }      // extendable contract
type Status = "active" | "banned" | "pending";    // union — must be a type
\`\`\`

### Avoid \`any\`, prefer \`unknown\`

\`any\` switches the type checker **off** for that value — it's PHP's \`mixed\`, but worse, because it
silently *spreads*. \`unknown\` is the safe sibling: you can hold anything, but you must **narrow**
before you use it.

\`\`\`ts
function parse(raw: unknown) {
  if (typeof raw === "string") return raw.trim(); // narrowed → safe
}
\`\`\`

### A few more that always come up

- **Turn on \`strict\`.** It's the project-wide \`declare(strict_types=1)\`, plus \`null\` safety.
- **Prefer \`readonly\` / immutability.** Mark fields and arrays \`readonly\` unless you truly mutate.
- **Discriminated unions over boolean flags.** A \`kind\` tag the compiler can switch on beats three
  optional booleans that can contradict each other.
- **Narrow early.** Validate and narrow at the edges so the core of your code works with clean types.
- **Let inference do the work.** Don't annotate \`const n: number = 5\`. Annotate function *parameters*
  and *public* return types; let the rest be inferred.
- **Don't over-engineer types.** A page of conditional/mapped-type wizardry that nobody can read is a
  liability, not a flex.

### The classic pitfalls

- **any-creep** — one \`any\` at an API boundary infects every value downstream.
- **Abusing \`as\`** — a type assertion is you overruling the compiler; if you're wrong, it lies.
  It's the equivalent of suppressing a PHP error to make it shut up.
- **Ignoring \`null\`** — \`strictNullChecks\` exists so \`undefined is not a function\` never ships.
`,

  comparisons: [
    {
      label: "Strictness as the default",
      intro:
        "We want a halving function that flatly rejects loose, untyped inputs. Both versions express the same goal; the question is how you switch strict checking on.",
      php: `<?php
declare(strict_types=1); // per file, runtime-enforced

function half(int $n): float {
    return $n / 2;
}`,
      ts: `// tsconfig.json — once, for the whole project:
{ "compilerOptions": { "strict": true } }

function half(n: number): number {
  return n / 2;
}`,
      note:
        "Same intent — refuse loose types. TS enforces it project-wide at compile time and adds null safety on top.",
    },
    {
      label: "Avoid the escape hatch (mixed / any)",
      intro:
        "Here we take a value of no known type and try to measure its length. The aim is a function that stays safe even when the input could be anything.",
      php: `<?php
declare(strict_types=1);

// 'mixed' turns off meaningful checking:
function len(mixed $value): int {
    return strlen((string) $value);
}`,
      ts: `// 'unknown' forces you to prove the shape first:
function len(value: unknown): number {
  if (typeof value === "string") return value.length;
  return 0;
}`,
      note:
        "PHP's mixed ~ TS's any (checking off). unknown has no PHP equal — it accepts anything but blocks use until narrowed.",
    },
    {
      label: "Program to an interface",
      intro:
        "We load a user by id through a repository abstraction rather than a concrete class. The goal is code that depends on a contract, so any matching repository can be swapped in.",
      php: `<?php
interface Repository {
    public function find(int $id): ?User;
}

function load(Repository $repo, int $id): ?User {
    return $repo->find($id);
}`,
      ts: `interface Repository {
  find(id: number): User | undefined;
}

function load(repo: Repository, id: number): User | undefined {
  return repo.find(id);
}`,
      note:
        "Identical principle. TS is structural: any object with a matching find() satisfies it — no explicit 'implements' required.",
    },
    {
      label: "Discriminated union over boolean flags",
      intro:
        "We are modelling the state of an async request that can be loading, succeeded, or failed. The aim is a representation where only one state is possible at a time and its data travels with it.",
      php: `<?php
// Booleans that can silently contradict each other:
final class Result {
    public bool $isLoading = false;
    public bool $isError = false;
    public ?string $data = null;
    public ?string $error = null;
}`,
      ts: `// A tagged union the compiler can switch on:
type Result =
  | { kind: "loading" }
  | { kind: "ok"; data: string }
  | { kind: "error"; error: string };`,
      note:
        "The union makes impossible states unrepresentable — you can't be 'loading' and 'error' at once, and 'data' only exists on 'ok'.",
    },
  ],

  playground: {
    intro:
      "Two implementations, identical console output — but the first is any-laden and unsafe, the second is fully typed. Hover the values to see what the compiler now knows.",
    code: `// BEFORE: any everywhere — compiles, but the checker is asleep.
function totalBefore(items: any): any {
  let sum = 0;
  for (const it of items) sum += it.price * it.qty;
  return sum;
}

// AFTER: a real type + inference. Same behaviour, now type-safe.
interface LineItem {
  readonly price: number;
  readonly qty: number;
}

function totalAfter(items: readonly LineItem[]): number {
  let sum = 0;
  for (const it of items) sum += it.price * it.qty;
  return sum;
}

const cart: LineItem[] = [
  { price: 9.5, qty: 2 },
  { price: 4.0, qty: 1 },
];

console.log("before:", totalBefore(cart)); // 23
console.log("after: ", totalAfter(cart));  // 23

// Try it: add { prce: 1, qty: 1 } (typo) to 'cart'.
// totalBefore would happily produce NaN; totalAfter won't compile.`,
  },

  keyPoints: [
    "`interface` for extendable object/class contracts; `type` when you need unions, tuples, or mapped types.",
    "`any` is `mixed` with the checker off **and** it spreads — reach for `unknown` and narrow instead.",
    "Turn on `strict` from day one: it's project-wide `declare(strict_types=1)` plus `null` safety.",
    "Prefer `readonly` and discriminated unions to make **impossible states unrepresentable**.",
    "Let inference work — annotate parameters and public return types, not every local `const`.",
    "Watch the classics: any-creep at boundaries, abusing `as`, and ignoring `null`.",
  ],

  interview: [
    {
      q: "When do you reach for `type` versus `interface`?",
      a: "I default to **`interface`** for object and class contracts I might `extends` or `implements` — it reads like a PHP `interface` and supports declaration merging. I use **`type`** the moment I need something an interface can't express: a **union** (`type Status = \"a\" | \"b\"`), an intersection, a tuple, a mapped/conditional type, or an alias for a primitive. The two overlap heavily for plain object shapes, so the honest answer is 'pick one and be consistent' — but unions are the clear dividing line.",
    },
    {
      q: "Why is `unknown` better than `any`, coming from PHP's `mixed`?",
      a: "`any` is like `mixed` but worse: it doesn't just accept anything, it **turns off checking on everything that touches it** and spreads silently through your code. `unknown` accepts any value too, but the compiler **refuses to let you use it** until you've narrowed it with `typeof`, an `in` check, or a type guard. So `unknown` keeps the flexibility of `mixed` while forcing the validation you'd write by hand in PHP anyway — it's the right type for JSON, API responses, and `catch` clauses.",
    },
    {
      q: "What's wrong with sprinkling `as` to fix type errors?",
      a: "A type assertion (`as`) is you telling the compiler 'trust me, I know better' — it **doesn't change the runtime value**, it just silences the check. If you're wrong, the error simply moves to runtime, which is exactly what TypeScript was meant to prevent. It's the moral equivalent of `@` error-suppression in PHP. Legitimate uses are narrow (e.g. `as const`, or asserting after you've genuinely validated). The fix for most `as` is a proper type guard or narrowing.",
    },
    {
      q: "How do discriminated unions improve on boolean flags?",
      a: "Boolean flags let you represent **impossible states** — `isLoading` and `isError` both `true`, or `data` set while `isError` is `true`. A discriminated union gives each state a literal tag (`kind: \"loading\" | \"ok\" | \"error\"`) and attaches only the fields valid for that state. The compiler then **narrows** inside a `switch (result.kind)` so `result.data` is only reachable in the `\"ok\"` branch. You make the bad states unrepresentable rather than hoping nobody sets the flags wrong.",
    },
    {
      q: "Can you over-use types? How do you keep them maintainable?",
      a: "Absolutely. Two failure modes: under-typing (any-creep) and over-typing — towers of conditional and mapped types that no teammate can read or modify. My rules: **let inference do the work** (don't annotate obvious locals), annotate the **boundaries** (function params, public return types, external data) rather than the internals, and if a type needs a paragraph of comments to explain, simplify it. Clear, slightly-less-clever types beat clever ones that block the next person.",
    },
  ],

  quiz: [
    {
      question: "You need to model `\"draft\" | \"published\" | \"archived\"`. What do you use?",
      options: [
        "`interface`, because it's the modern default",
        "`type`, because `interface` can't express a union",
        "`enum`, because string literals aren't allowed in `type`",
        "`any`, then validate at runtime",
      ],
      answerIndex: 1,
      explain:
        "Unions of string literals can only be expressed with `type`. An `interface` describes object shapes and cannot be a union.",
    },
    {
      question: "Why prefer `unknown` over `any` for an unvalidated API response?",
      options: [
        "`unknown` is faster at runtime",
        "`any` is deprecated and will be removed",
        "`unknown` forces you to narrow the value before using it; `any` disables checking entirely",
        "They are identical — it's purely stylistic",
      ],
      answerIndex: 2,
      explain:
        "`unknown` accepts any value but blocks use until you narrow it. `any` turns off type checking and spreads silently — the opposite of what you want at a trust boundary.",
    },
    {
      question: "What does a type assertion (`value as Foo`) actually do at runtime?",
      options: [
        "Converts/casts the value to `Foo`, like `(string)` in PHP",
        "Nothing — it only silences the compile-time check; the runtime value is unchanged",
        "Throws if the value isn't really a `Foo`",
        "Deep-clones the value into a new `Foo`",
      ],
      answerIndex: 1,
      explain:
        "`as` is a compile-time-only assertion. It performs no conversion and no runtime check — if you assert the wrong type, the error simply resurfaces at runtime.",
    },
  ],
};

export default lesson;
