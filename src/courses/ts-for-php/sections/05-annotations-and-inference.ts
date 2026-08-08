import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "annotations-and-inference",
  title: "Type Annotations & Inference",
  part: "Foundations",
  estMinutes: 13,
  summary:
    "When to write types and when to let the compiler figure them out, plus the escape hatches (any, unknown, never, assertions) and how not to shoot yourself in the foot with them.",

  concept: `
In PHP you type things because you *must* declare them — a parameter has a type or
it doesn't. TypeScript flips the default: it watches what your code does and
**infers** types for you. Most of the time the best annotation is *no annotation*.

### Annotate vs infer

If the value is obvious from the right-hand side, let inference do the work.

\`\`\`ts
let count = 0;          // inferred: number
const name = "Ada";     // inferred: "Ada" (a literal type, because const)
const ids = [1, 2, 3];  // inferred: number[]
\`\`\`

Where you **should** annotate:

- **Function parameters** — there's no value to infer from, so you must say.
- **Public function return types** — optional, but they lock the contract and
  catch mistakes *inside* the function instead of at the call site.
- **Empty containers** — \`const items = []\` infers \`any[]\`, which is useless.
  Write \`const items: string[] = []\`.

### any vs unknown vs never

These three are the "I'm stepping outside the type system" zone.

- \`any\` — turns checking **off** for that value. It's contagious and silent.
  Treat it like \`@\` error-suppression in PHP: avoid it.
- \`unknown\` — the **safe** \`any\`. You can hold anything in it, but you can't
  *use* it until you **narrow** it (with \`typeof\`, \`instanceof\`, a check).
- \`never\` — the type with **no** values. It's what a function that always throws
  returns, and what's left after you've exhausted every case in a union.

\`\`\`ts
let a: any = "hi";
a.foo.bar.baz();        // compiles, explodes at runtime

let u: unknown = "hi";
// u.toUpperCase();     // ERROR: must check first
if (typeof u === "string") u.toUpperCase(); // OK now
\`\`\`

### void, assertions, and the ! operator

- \`void\` — the return type of a function that returns nothing meaningful.
- **Type assertion** \`x as T\` — "trust me, this is a T." No runtime check; it's a
  compile-time override. Like casting in PHP, but it does **nothing** at runtime.
- **Non-null assertion** \`x!\` — "I promise this isn't \`null\`/\`undefined\`." Also
  unchecked. Handy, dangerous; prefer a real check when you can.

> Rule of thumb: reach for \`unknown\` over \`any\`, and treat \`as\` / \`!\` as a
> last resort you can justify out loud.
`,

  comparisons: [
    {
      label: "mixed vs any (both unsafe)",
      intro:
        "A function takes a value of completely open type and immediately calls a method on it. The point is to see that neither version stops you, so a bad call survives compilation and only fails when the code actually runs.",
      php: `<?php
declare(strict_types=1);

function handle(mixed $value): void {
    // PHP lets you do anything with mixed;
    // a wrong call blows up at runtime.
    $value->run();
}`,
      ts: `function handle(value: any): void {
  // any disables checking entirely —
  // no error here, explodes at runtime.
  value.run();
}`,
      note: "PHP's mixed and TS's any are equally permissive: neither protects you. any is the one to avoid.",
    },
    {
      label: "mixed vs unknown (the safe one)",
      intro:
        "The same open-typed function, but this time it checks the value is a Runner before calling run on it. The result is code that only touches the value once it has proven what the value is.",
      php: `<?php
declare(strict_types=1);

function handle(mixed $value): void {
    if ($value instanceof Runner) {
        $value->run(); // checked first
    }
}`,
      ts: `function handle(value: unknown): void {
  if (value instanceof Runner) {
    value.run(); // narrowed, now safe
  }
}`,
      note: "unknown is mixed with a seatbelt: the compiler forces you to narrow before you touch it.",
    },
    {
      label: "PHP has no inference",
      intro:
        "We assign a couple of simple values, a number and an array of strings, with no type annotations at all. The goal is to compare what each language knows about those variables afterward.",
      php: `<?php
declare(strict_types=1);

// You must spell out every type:
$count = 0;          // no type info
$names = ['Ada'];    // array, untyped contents`,
      ts: `// TypeScript infers from the value:
const count = 0;        // number
const names = ["Ada"];  // string[]
// no annotations needed`,
      note: "PHP variables carry no static type; TS infers a precise type from the initializer.",
    },
    {
      label: "Type juggling vs explicit types",
      intro:
        "We combine a string and a number with arithmetic-looking operators to see how each language resolves the mismatch. The aim is to predict the result and notice where one language guesses and the other refuses.",
      php: `<?php
// PHP coerces silently:
$x = "5" + 3;     // int(8)
$y = "5" . 3;     // string("53")
var_dump(0 == "a"); // false (PHP 8), true (PHP 7)`,
      ts: `// TS refuses the ambiguous case:
const x = "5" + 3;   // "53" (string) — + is concat
// const y = "5" - 3; // ERROR: '-' needs numbers
console.log(Number("5") + 3); // 8, explicit`,
      note: "PHP juggles types implicitly; TS makes you convert on purpose, so results aren't a surprise.",
    },
    {
      label: "Casting vs assertion",
      intro:
        "We take an incoming value and try to treat it as a number. The goal is to see whether the value is actually converted at runtime, or just relabeled for the type checker while staying unchanged.",
      php: `<?php
$id = (int) $request->get('id'); // real runtime cast`,
      ts: `const id = input as number; // compile-time only, NO runtime cast
const real = Number(input);  // actual conversion`,
      note: "PHP's (int) actually converts at runtime; TS's 'as' only silences the checker — use Number()/String() to truly convert.",
    },
  ],

  playground: {
    intro:
      "Inference, the any-vs-unknown difference, and a void function. Try uncommenting the lines marked ERROR and watch the editor flag them.",
    code: `// 1. Inference — no annotations, but these are fully typed.
const total = 10 + 5;          // inferred: number
const label = "items: " + total; // inferred: string
console.log(label, "=>", total);

// 2. any vs unknown.
let loose: any = "hello";
console.log("any lets anything through:", loose.toUpperCase());
// loose.nope.deep(); // compiles but would crash — that's the danger of any

let safe: unknown = "world";
// console.log(safe.toUpperCase()); // ERROR: must narrow unknown first
if (typeof safe === "string") {
  console.log("unknown after a check:", safe.toUpperCase());
}

// 3. A void function — returns nothing meaningful.
function logTwice(msg: string): void {
  console.log(msg);
  console.log(msg);
}
logTwice("ping");

// Bonus: assertion vs real conversion.
const fromApi: unknown = "42";
const asserted = fromApi as string; // compile-time only
const converted = Number(asserted); // actual runtime conversion
console.log("converted + 8 =", converted + 8);`,
  },

  keyPoints: [
    "Prefer **inference**: if the value makes the type obvious, don't annotate it.",
    "Always annotate **function parameters** (nothing to infer) and consider annotating **return types** to lock the contract.",
    "`any` switches off type checking and is contagious — avoid it like PHP's `@` suppression.",
    "`unknown` is the **safe `any`**: you must narrow with `typeof`/`instanceof`/a check before using it.",
    "`never` = no possible value (a function that always throws, or an exhausted union); `void` = returns nothing useful.",
    "`as` and `!` are **compile-time only** — they override the checker but do **no** runtime conversion or check. Prefer `Number()`/`String()` and real guards.",
  ],

  interview: [
    {
      q: "When should you write an explicit annotation versus relying on inference?",
      a: "Let inference handle locals and constants whose type is obvious from the initializer (`const n = 5` is clearly `number`). **Annotate** the things inference can't see or that you want to pin down: **function parameters** (there's no value to infer from), **public return types** (so a mistake fails inside the function, not at every call site), and **empty containers** (`const xs: string[] = []`, since `[]` alone infers the useless `any[]`). Over-annotating obvious values just adds noise — coming from PHP the instinct is to type everything, but here less is often better.",
    },
    {
      q: "What's the difference between `any` and `unknown`?",
      a: "Both can hold any value, but `any` **turns off** type checking for that value — you can call anything on it and the compiler stays silent, so errors surface at runtime. `unknown` is the **type-safe** counterpart: you can assign anything *into* it, but you can't *use* it until you **narrow** it (e.g. `typeof x === 'string'`). Think of `unknown` as PHP's `mixed` with a mandatory `instanceof`/`is_*` check before you do anything. Rule: accept untrusted input as `unknown`, never `any`.",
    },
    {
      q: "What is `never` and where does it show up?",
      a: "`never` is the type with **no values at all**. A function that always throws or never returns is typed `() => never`. It also appears in **exhaustiveness checks**: after a `switch` handles every member of a union, the `default` branch's variable narrows to `never` — assigning it to a `never`-typed variable makes the compiler error if you later add a new union member and forget a case. It's the type system's way of proving you've covered everything.",
    },
    {
      q: "What does `x as T` actually do at runtime, and how is it different from a PHP cast?",
      a: "Nothing. A type assertion (`as`) is a **compile-time** instruction that tells the checker 'treat this as `T`' — it's erased along with all other types and performs **no** conversion or validation. A PHP cast like `(int) $x` genuinely converts the value at runtime. So `'5' as number` does not turn a string into a number; you'd use `Number('5')` for that. Because `as` is unchecked, it's an escape hatch to use sparingly — a wrong assertion fails silently later.",
    },
    {
      q: "When is the non-null assertion `!` appropriate, and what's the risk?",
      a: "`x!` tells the compiler 'this is not `null`/`undefined`, trust me,' removing those from the type. It's appropriate when **you** know something the compiler can't prove — e.g. `document.getElementById('app')!` for an element you're certain exists. The risk: it's **unchecked**, so if you're wrong you get a runtime `TypeError` with no compile-time warning. Whenever practical, prefer a real guard (`if (x) { ... }`) or optional chaining (`x?.foo`) so the safety is actually enforced.",
    },
  ],

  quiz: [
    {
      question:
        "Which type lets you hold any value but forces you to check it before use?",
      options: ["any", "unknown", "never", "void"],
      answerIndex: 1,
      explain:
        "`unknown` accepts any value but the compiler won't let you use it until you narrow it (e.g. with `typeof`). `any` accepts anything AND skips all checks.",
    },
    {
      question: "What does `value as number` do at runtime?",
      options: [
        "Converts the value to a number, like PHP's (int)",
        "Throws if the value isn't a number",
        "Nothing — it's a compile-time-only assertion that gets erased",
        "Rounds the value to the nearest integer",
      ],
      answerIndex: 2,
      explain:
        "`as` is a compile-time assertion with no runtime effect. To actually convert, use `Number(value)`.",
    },
    {
      question:
        "You write `const count = 0;` with no annotation. What type does TypeScript give `count`?",
      options: [
        "any, because it has no annotation",
        "number, inferred from the initializer",
        "unknown, until you assign again",
        "It's an error — annotations are required",
      ],
      answerIndex: 1,
      explain:
        "TypeScript infers types from the initializer. `0` is a number, so `count` is `number` — no annotation needed.",
    },
  ],
};

export default lesson;
