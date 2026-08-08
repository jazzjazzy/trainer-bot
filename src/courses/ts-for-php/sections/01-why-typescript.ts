import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-typescript",
  title: "Why TypeScript & the Compile Step",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "What TypeScript actually is, why it exists, and how it relates to the strict typing you already use in modern PHP.",

  concept: `
You already know more of this story than you think. Over the last decade PHP went
from "types are optional comments" to **scalar type hints**, **return types**,
**union types**, **enums**, and \`declare(strict_types=1)\`. TypeScript is the same
idea taken all the way: a **typed layer on top of JavaScript**.

### The one big mental shift

TypeScript is **JavaScript + a static type checker + a compile step**.

- Every valid JavaScript file is already valid TypeScript. You are not learning a
  brand-new language — you are learning JavaScript *plus a type system*.
- The types are checked **before your code runs** (at compile time), then
  **erased**. The browser and Node.js never see your types — they run plain JS.

In PHP, \`declare(strict_types=1)\` still checks types **at runtime** — your code
runs, hits a bad call, and *then* throws a \`TypeError\`. TypeScript moves that
check **earlier**: a wrong type is a red squiggle in your editor and a failed
build, long before a user ever hits it.

\`\`\`
your .ts file ──[ tsc / vite ]──> plain .js ──> runs in browser / Node
       │                              │
   types checked here            types are gone
\`\`\`

### Why teams adopt it

- **Catch bugs at compile time** instead of in production.
- **Autocomplete & refactoring that actually works** — the editor knows the
  shape of everything.
- **Types are living documentation** — a function signature tells you exactly
  what goes in and what comes out.
- **Structural typing** (more on this later): if it has the right shape, it fits.
  PHP is *nominal* — a class must explicitly \`implements\` an interface.
  TypeScript mostly cares about shape, not name.

> You don't run \`.ts\` files directly the way you run \`.php\` files. They compile
> to \`.js\` first. That compile step is the price of admission — and it's where
> all the safety comes from.
`,

  comparisons: [
    {
      label: "A typed function",
      intro:
        "A tiny function that adds two whole numbers and prints the result. The goal is to see how you declare the parameter and return types in each language; calling it with 2 and 3 prints 5.",
      php: `<?php
declare(strict_types=1);

function add(int $a, int $b): int {
    return $a + $b;
}

echo add(2, 3); // 5`,
      ts: `function add(a: number, b: number): number {
  return a + b;
}

console.log(add(2, 3)); // 5`,
      note:
        "Almost identical. Types go after the name with a colon. There is one number type, not int/float/etc.",
    },
    {
      label: "Turning on strictness",
      intro:
        "Here we want the strictest type checking the language offers. The example shows where you flip that switch on, so that loose or mismatched types are rejected rather than quietly allowed.",
      php: `<?php
// Per-file, must be the first statement:
declare(strict_types=1);`,
      ts: `// tsconfig.json — project-wide:
{
  "compilerOptions": { "strict": true }
}`,
      note:
        "PHP opts in per file at runtime. TypeScript opts in once for the whole project and enforces it at compile time.",
    },
    {
      label: "When a type error is caught",
      intro:
        "A greet function expects a string name, but we deliberately pass it the number 42. The point is to see at what moment that obvious mistake gets flagged in each language.",
      php: `<?php
declare(strict_types=1);
function greet(string $name): string {
    return "Hi $name";
}
greet(42); // Runs, THEN throws TypeError at runtime`,
      ts: `function greet(name: string): string {
  return \`Hi \${name}\`;
}
greet(42); // Won't even compile — error shown in editor`,
      note:
        "PHP discovers the mistake while running. TypeScript discovers it before the code ever runs.",
    },
  ],

  playground: {
    intro:
      "This is real TypeScript. Run it, then try breaking it: change add(2, 3) to add('2', 3) and watch the editor flag a type error before you even run.",
    code: `// Hover over things — the editor knows their types.
function add(a: number, b: number): number {
  return a + b;
}

const sum = add(2, 3);
console.log("2 + 3 =", sum);

// TypeScript infers types too — no annotation needed here:
const message = "TypeScript is JavaScript with a safety net";
console.log(message.toUpperCase());

// Try uncommenting the next line. The editor will complain BEFORE you run:
// console.log(add("2", 3));`,
  },

  keyPoints: [
    "TypeScript = JavaScript + static types + a compile step. All JS is valid TS.",
    "Types are checked at **compile time**, then **erased** — the runtime only ever sees plain JavaScript.",
    "This is `declare(strict_types=1)` taken further: errors surface in your editor/build, not at runtime.",
    "`strict: true` in `tsconfig.json` is the project-wide switch worth turning on from day one.",
    "TypeScript is mostly **structural** (shape-based), where PHP is **nominal** (name-based).",
  ],

  interview: [
    {
      q: "What is TypeScript, and how does it relate to JavaScript?",
      a: "TypeScript is a **superset of JavaScript** that adds an optional static type system. Any valid JavaScript is valid TypeScript. A compiler (`tsc`, or a bundler like Vite/esbuild) type-checks the code and then strips the types, emitting plain JavaScript that runs in browsers or Node. The types exist purely at development/build time — there is **no runtime type enforcement** from TypeScript itself.",
    },
    {
      q: "If types are erased at compile time, what value do they add?",
      a: "They catch a whole class of bugs *before* the code runs — passing the wrong argument, accessing a property that doesn't exist, forgetting to handle `null`. They also power editor tooling (autocomplete, go-to-definition, safe refactors) and act as always-accurate documentation. The trade-off: because types are erased, you still need **runtime validation** (e.g. validating API responses) for data coming from outside your program.",
    },
    {
      q: "Coming from PHP, what's the biggest difference in how type errors are caught?",
      a: "In PHP, even with `declare(strict_types=1)`, type checks happen **at runtime** — the code runs until it hits the bad call and throws a `TypeError`. In TypeScript the check happens **at compile time**, so a type mismatch fails the build (and shows in your editor) before the program is ever executed.",
    },
  ],

  quiz: [
    {
      question: "When does TypeScript check your types?",
      options: [
        "At runtime, like PHP with strict_types",
        "At compile time, before the code runs",
        "Never — types are only comments",
        "Only when you call a special validate() function",
      ],
      answerIndex: 1,
      explain:
        "TypeScript checks types at compile time and then erases them. The running JavaScript has no type information.",
    },
    {
      question: "What does the JavaScript engine (browser/Node) receive?",
      options: [
        "The .ts file with types intact",
        "Plain JavaScript with the types stripped out",
        "A binary compiled format",
        "Both the types and the JS at runtime",
      ],
      answerIndex: 1,
      explain:
        "Types are erased during compilation. The runtime only ever sees ordinary JavaScript.",
    },
    {
      question:
        "Which statement about TypeScript and JavaScript is correct?",
      options: [
        "They are unrelated languages",
        "JavaScript is a superset of TypeScript",
        "TypeScript is a superset of JavaScript",
        "TypeScript replaces JavaScript entirely at runtime",
      ],
      answerIndex: 2,
      explain:
        "TypeScript is a superset: every valid JavaScript program is also a valid TypeScript program.",
    },
  ],
};

export default lesson;
