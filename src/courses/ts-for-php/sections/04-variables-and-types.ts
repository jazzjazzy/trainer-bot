import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "variables-and-types",
  title: "Variables & Primitive Types",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "The handful of primitive types TypeScript actually has, how const/let inference works, and the template literals and typeof that replace your PHP string and gettype habits.",

  concept: `
PHP gives you a small zoo of scalar types — \`int\`, \`float\`, \`string\`, \`bool\` —
plus \`null\`. TypeScript's set of **primitives** is similar in spirit but with one
surprise that trips up every PHP developer on day one: there is **no \`int\` vs
\`float\`**. Just one numeric type.

### The seven primitives

- \`string\` — text. Same idea as PHP's \`string\`.
- \`number\` — **every** number: \`42\`, \`-7\`, \`3.14\`, \`0xff\`. PHP's \`int\` *and*
  \`float\` collapse into this one type. Under the hood it's an IEEE-754 double.
- \`boolean\` — \`true\` / \`false\`. (Note the full word — not \`bool\`.)
- \`null\` — the intentional "no value", like PHP's \`null\`.
- \`undefined\` — a variable that was declared but never assigned. PHP has no
  direct equivalent; think of it as "uninitialized".
- \`bigint\` — for integers beyond \`number\`'s safe range, written \`123n\`. Reach
  for it like PHP's GMP/BCMath, only when \`number\` isn't precise enough.
- \`symbol\` — unique, unforgeable keys. Niche; you'll rarely hand-write one.

### const, let, and inference

You almost never write the type for a primitive. TypeScript **infers** it from
the value, just like PHP figures out \`$x = 5\` is an int.

\`\`\`ts
const name = "Ada";   // inferred: string
let count = 0;        // inferred: number
count = 5;            // fine
count = "five";       // compile error — count is number
\`\`\`

Prefer \`const\` (the variable can't be reassigned) and fall back to \`let\` only
when you must reassign. PHP has no such distinction — every \`$var\` is mutable.

### Literal types & typeof

Annotate a \`const\` with a value and you get a **literal type** — the type *is*
that exact value, not just "some string":

\`\`\`ts
const dir = "north";        // type is the literal "north"
let mode: "on" | "off" = "on";  // only these two strings allowed
\`\`\`

### Template literals

Backtick strings with \`\${...}\` interpolation replace PHP's \`"Hi $name"\` and
heredocs — and they span multiple lines for free.

### Checking a type at runtime

\`typeof x\` returns a string like \`"number"\` or \`"string"\` — the runtime cousin
of PHP's \`gettype()\`.
`,

  comparisons: [
    {
      label: "Numbers: one type, not two",
      intro:
        "Add a whole number to a decimal and store the result. The takeaway is that both values, and the sum, are the same numeric type.",
      php: `<?php
declare(strict_types=1);

$count = 42;            // int   (PHP can't annotate locals,
$price = 9.99;          //  float  but int and float are distinct)
$total = $count + $price; // float`,
      ts: `const count = 42;     // number
const price = 9.99;   // number
const total = count + price; // number

// There is no int / float — just number.`,
      note:
        "PHP splits whole vs decimal into int/float. TypeScript has one number type covering both.",
    },
    {
      label: "Booleans and null",
      intro:
        "Declare a true/false flag and a value that is deliberately empty. The goal is to see how each of those everyday values is typed.",
      php: `<?php
$active = true;   // bool
$missing = null;  // null`,
      ts: `const active: boolean = true;  // not "bool"
const missing: null = null;
let maybe: string | null = null; // explicit "can be null"`,
      note:
        "TypeScript spells it boolean in full, and null is its own type you opt into via a union.",
    },
    {
      label: "Interpolation: heredoc vs template literal",
      intro:
        "Build a one-line greeting and a multi-line block of text that both drop a name into the middle. The result is the same interpolated output produced two different ways.",
      php: `<?php
$name = "Ada";
$greet = "Hi $name!";          // double-quote interpolation
$block = <<<TXT
Dear $name,
Welcome aboard.
TXT;`,
      ts: `const name = "Ada";
const greet = \`Hi \${name}!\`;   // backticks + \${ }
const block = \`Dear \${name},
Welcome aboard.\`;             // multi-line, no heredoc needed`,
      note:
        "Backticks replace heredoc/nowdoc; \${expr} interpolates any expression, not just variables.",
    },
    {
      label: "Inspecting a type at runtime",
      intro:
        "Ask the language what type a few values are while the program is running. The interesting part is comparing what each ecosystem reports back for the same values.",
      php: `<?php
$x = 3.14;
echo gettype($x);   // "double"
echo gettype("hi"); // "string"
echo gettype(true); // "boolean"`,
      ts: `const x = 3.14;
console.log(typeof x);    // "number"
console.log(typeof "hi"); // "string"
console.log(typeof true); // "boolean"`,
      note:
        "typeof is the gettype() of JS — but note floats report as \"number\", and typeof null is the famous \"object\".",
    },
  ],

  playground: {
    intro:
      "Run this to see the single number type cover integers and decimals, a template literal in action, and what typeof reports. Then try changing isReady to a number and watch the editor complain.",
    code: `// One numeric type covers whole numbers AND decimals:
const whole: number = 42;
const decimal: number = 9.99;
const total = whole + decimal;
console.log("total:", total); // 51.99

// Booleans use the full word "boolean":
const isReady: boolean = true;
console.log("ready?", isReady);

// Template literal: backticks + \${ } interpolation, multi-line for free:
const name = "Ada";
const report = \`User \${name} has \${whole + 1} credits.
Status: \${isReady ? "active" : "inactive"}\`;
console.log(report);

// typeof is the runtime cousin of PHP's gettype():
console.log(typeof whole);   // "number"
console.log(typeof decimal); // "number" (no "double"!)
console.log(typeof name);    // "string"
console.log(typeof isReady); // "boolean"

// Try it: change the next assignment and watch the editor flag it.
let count = 0;     // inferred as number
count = 5;         // fine
// count = "five"; // uncomment -> compile error`,
  },

  keyPoints: [
    "TypeScript has **one** numeric type, `number` — PHP's `int` and `float` both map to it.",
    "The primitives are `string`, `number`, `boolean`, `null`, `undefined`, `bigint`, `symbol`. Note `boolean` is spelled in full.",
    "`undefined` (declared, never assigned) has no real PHP equivalent; `null` is the deliberate empty value.",
    "Prefer `const`; use `let` only when you must reassign. PHP has no const/let distinction for locals.",
    "Template literals use backticks and `${expr}` — they replace `\"$x\"` interpolation and heredocs, and are multi-line.",
    "`typeof x` is the runtime check, like `gettype()` — but `typeof null` is the famous `\"object\"` quirk.",
  ],

  interview: [
    {
      q: "Coming from PHP, what's the most important thing to know about numbers in TypeScript?",
      a: "There is **no `int`/`float` distinction** — everything is the single `number` type, an IEEE-754 double. So `7 / 2` is `3.5`, not `3`; use `Math.trunc()` or `Math.floor()` if you want integer division. Because doubles can't represent every large integer exactly, integers beyond `Number.MAX_SAFE_INTEGER` (2^53 − 1) need the separate **`bigint`** type, written with an `n` suffix like `9007199254740993n` — roughly the role GMP/BCMath play in PHP.",
    },
    {
      q: "What's the difference between `null` and `undefined`?",
      a: "`null` is an **intentional** empty value you assign on purpose — same as PHP's `null`. `undefined` means a variable was declared but **never given a value** (or a missing object property / a function with no `return`). PHP has no real `undefined`; accessing an unset variable just warns and yields `null`. In strict TypeScript both are distinct types you must explicitly allow, e.g. `string | null` or `string | undefined`.",
    },
    {
      q: "How do template literals improve on PHP string handling?",
      a: "A template literal uses backticks and `${...}` to embed **any expression**, not just a variable — `` `Total: ${price * qty}` `` works, whereas PHP's `\"$x\"` only interpolates simple variables (you'd need `{$obj->method()}`). They're also inherently **multi-line**, so they replace heredoc/nowdoc with no terminator boilerplate. Tagged template literals add a function hook for escaping/i18n, going beyond what PHP strings offer.",
    },
    {
      q: "What is a literal type, and why is it useful?",
      a: "A literal type is a type whose only allowed value is one **specific** literal — `const dir = \"north\"` has the type `\"north\"`, not just `string`. Combined with unions, this gives you `type Mode = \"on\" | \"off\"`, a lightweight, string-based alternative to an enum that the compiler enforces. It's how TypeScript models 'this field can only be one of these exact strings' — something PHP only got close to with backed enums.",
    },
    {
      q: "Is `typeof` enough to safely narrow types?",
      a: "For primitives, mostly yes — `typeof x === \"string\"` reliably narrows `x` to `string`, and TypeScript uses it as a **type guard** inside the branch. But watch two traps inherited from JavaScript: `typeof null` is `\"object\"` (not `\"null\"`), and `typeof []` is also `\"object\"` — use `Array.isArray()` for arrays. For class instances you'd use `instanceof`, the closer cousin to PHP's `instanceof`.",
    },
  ],

  quiz: [
    {
      question: "What does `typeof 3.14` evaluate to in TypeScript/JavaScript?",
      options: [`"float"`, `"double"`, `"number"`, `"decimal"`],
      answerIndex: 2,
      explain:
        "TypeScript has a single numeric type. Both integers and decimals are `number`, so `typeof 3.14` is `\"number\"` — unlike PHP's gettype(), which returns \"double\".",
    },
    {
      question:
        "Which declaration creates a literal type that only allows the exact string \"on\" or \"off\"?",
      options: [
        `let mode: string = "on";`,
        `let mode: "on" | "off" = "on";`,
        `const mode = "on" || "off";`,
        `let mode: boolean = true;`,
      ],
      answerIndex: 1,
      explain:
        "`\"on\" | \"off\"` is a union of two string literal types, so only those exact values compile. The plain `string` annotation would allow any string.",
    },
    {
      question:
        "How do you embed an expression inside a string in modern TypeScript?",
      options: [
        `"Total: $total"`,
        `"Total: " . $total`,
        "`Total: ${price * qty}`",
        `'Total: {price * qty}'`,
      ],
      answerIndex: 2,
      explain:
        "Template literals use backticks with `${...}`, and the braces can hold any expression. PHP-style `\"$x\"` interpolation and `.` concatenation are not how TypeScript does it.",
    },
  ],
};

export default lesson;
