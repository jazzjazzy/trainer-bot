import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "functions",
  title: "Functions",
  part: "Foundations",
  estMinutes: 14,
  summary:
    "How to type parameters and return values, plus the small but important ways TS handles optional, default, rest, and callback functions differently from PHP.",

  concept: `
Functions are where PHP and TypeScript feel most alike — and where a handful of
quiet differences will bite you if you don't notice them. The syntax is nearly
the same: types go after the name with a colon.

### Parameter and return types

\`\`\`typescript
function add(a: number, b: number): number {
  return a + b;
}
\`\`\`

TypeScript will usually **infer** the return type, so the \`: number\` after the
parentheses is optional — but writing it is a good habit: it documents intent and
catches the day you accidentally return the wrong thing.

### Optional and default parameters

In PHP you signal "this can be skipped" by giving a default value. TypeScript has
**two** separate tools:

- \`name?: string\` — the argument is **optional**; if omitted its value is
  \`undefined\`.
- \`name: string = "Guest"\` — the argument has a **default**; if omitted it
  becomes \`"Guest"\`.

A parameter with a default is automatically optional, so you rarely combine
\`?\` and \`=\`. Note the order rule (same as PHP): optional/defaulted params come
**after** required ones.

### Rest parameters

PHP's \`...$args\` becomes \`...args: number[]\` — a typed array that collects the
extra arguments:

\`\`\`typescript
function sum(...nums: number[]): number {
  return nums.reduce((total, n) => total + n, 0);
}
\`\`\`

### Function type expressions (callbacks)

You can describe the **shape of a function** as a type — essential when you pass
callbacks around (and you will, constantly, in JS):

\`\`\`typescript
type Transformer = (input: string) => string;
const shout: Transformer = (s) => s.toUpperCase();
\`\`\`

That \`(input: string) => string\` is a *function type expression*. PHP's nearest
equivalent is the \`callable\` type or \`Closure\`, but those can't describe the
parameter and return types — TypeScript can.

### Arrow functions vs closures

In PHP a classic closure must **explicitly import** outer variables with
\`use ($x)\`. Arrow functions \`fn() => ...\` capture automatically. **All**
TypeScript arrow functions capture surrounding scope automatically — there is no
\`use\`. They're also the idiomatic way to write short callbacks.

### void returns

A function that returns nothing has the return type \`void\` (PHP has \`: void\`
too). It's the same idea: "I'm called for a side effect, not a value."

> **Overloads** (briefly): when one function legitimately accepts several
> different argument shapes, you can declare multiple signatures above a single
> implementation. It's rare in app code — reach for unions first — but you'll see
> it in libraries.
`,

  comparisons: [
    {
      label: "Default parameter values",
      intro:
        "A greeting function where the salutation can be left out and falls back to a standard word. Calling it with just a name should produce 'Hello, Sam', while passing a second argument overrides that fallback.",
      php: `<?php
declare(strict_types=1);

function greet(string $name, string $greeting = "Hello"): string {
    return "$greeting, $name";
}

echo greet("Sam");            // Hello, Sam
echo greet("Sam", "Hi");      // Hi, Sam`,
      ts: `function greet(name: string, greeting: string = "Hello"): string {
  return \`\${greeting}, \${name}\`;
}

console.log(greet("Sam"));        // Hello, Sam
console.log(greet("Sam", "Hi"));  // Hi, Sam`,
      note:
        "Nearly identical. A defaulted param is automatically optional in TS; its type is inferred from the default.",
    },
    {
      label: "Optional (nullable) parameter",
      intro:
        "Building a label string from an optional suffix, so 'Item' on its own or 'ItemX' when a suffix is supplied. The goal is to handle the missing-suffix case gracefully without a crash.",
      php: `<?php
declare(strict_types=1);

// ?string means "string or null"
function label(?string $suffix): string {
    return "Item" . ($suffix ?? "");
}`,
      ts: `// suffix?: means the arg may be omitted (then it is undefined)
function label(suffix?: string): string {
  return "Item" + (suffix ?? "");
}`,
      note:
        "PHP's ?string = string|null. TS's suffix? = string|undefined (omittable). Different default 'empty' value: null vs undefined.",
    },
    {
      label: "Variadic / rest parameters",
      intro:
        "Adding up however many numbers the caller passes in a single function call. Summing 1, 2, and 3 should return 6, no matter how many arguments are given.",
      php: `<?php
declare(strict_types=1);

function sum(int ...$nums): int {
    return array_sum($nums);
}

echo sum(1, 2, 3); // 6`,
      ts: `function sum(...nums: number[]): number {
  return nums.reduce((total, n) => total + n, 0);
}

console.log(sum(1, 2, 3)); // 6`,
      note:
        "Same ... syntax. In TS the rest param is typed as an array (number[]) and must be the last parameter.",
    },
    {
      label: "Closures capturing scope",
      intro:
        "Making a function that multiplies its input by a 'factor' variable defined outside the function. Calling it with 5 should yield 15, since the function remembers the surrounding factor of 3.",
      php: `<?php
$factor = 3;

// Classic closure: must import $factor with use()
$triple = function (int $n) use ($factor): int {
    return $n * $factor;
};

// Arrow fn captures automatically (PHP 7.4+)
$triple2 = fn (int $n): int => $n * $factor;

echo $triple(5); // 15`,
      ts: `const factor = 3;

// Arrow function captures 'factor' automatically — no 'use'
const triple = (n: number): number => n * factor;

console.log(triple(5)); // 15`,
      note:
        "Every TS arrow/closure captures the surrounding scope automatically. There is no 'use' clause to maintain.",
    },
    {
      label: "Function type / callback parameter",
      intro:
        "A helper that takes a value plus a function and applies that function to the value twice. Starting with 2 and a callback that adds 10 should give 22 (2 -> 12 -> 22).",
      php: `<?php
declare(strict_types=1);

// callable can't describe the in/out types
function applyTwice(int $x, callable $fn): int {
    return $fn($fn($x));
}

echo applyTwice(2, fn ($n) => $n + 10); // 22`,
      ts: `// The callback's shape is fully typed: (n: number) => number
function applyTwice(x: number, fn: (n: number) => number): number {
  return fn(fn(x));
}

console.log(applyTwice(2, (n) => n + 10)); // 22`,
      note:
        "TS describes the callback's parameter and return types precisely; PHP's 'callable' is opaque.",
    },
  ],

  playground: {
    intro:
      "One function using an optional param, a default param, AND a rest param — plus a typed callback passed as an arrow function. Run it, then try changing a type to see the editor complain.",
    code: `// optional (greeting?), default (excited = false), rest (...names)
function welcome(
  greeting?: string,
  excited: boolean = false,
  ...names: string[]
): string {
  const hello = greeting ?? "Hello";
  const punct = excited ? "!" : ".";
  return \`\${hello}, \${names.join(" & ")}\${punct}\`;
}

console.log(welcome());                       // "Hello, ."
console.log(welcome("Hi", true, "Sam"));      // "Hi, Sam!"
console.log(welcome(undefined, false, "A", "B")); // "Hello, A & B."

// A typed callback: (n: number) => number
type Mapper = (n: number) => number;

function mapNumbers(values: number[], fn: Mapper): number[] {
  return values.map(fn);
}

// Pass an arrow function — it captures 'step' from outer scope, no 'use' needed
const step = 100;
const result = mapNumbers([1, 2, 3], (n) => n * step);
console.log("mapped:", result); // [100, 200, 300]`,
  },

  keyPoints: [
    "Types go after the name: `function f(a: number): string`. Return types are usually inferred but worth writing.",
    "`name?: T` makes a param **optional** (becomes `undefined`); `name: T = default` gives it a **default**. Both must come after required params.",
    "Rest params use PHP-style `...` but are typed as an array: `...args: number[]`, and must be last.",
    "Function types like `(n: number) => number` describe callbacks precisely — far richer than PHP's `callable`.",
    "Arrow functions capture outer scope **automatically** — there is no `use ($x)` clause to maintain.",
    "`void` is the return type for side-effect-only functions. Overloads exist for multi-signature functions but are rarely needed in app code.",
  ],

  interview: [
    {
      q: "What's the difference between an optional parameter and a parameter with a default value in TypeScript?",
      a: "An **optional** parameter (`name?: string`) may be omitted; if it is, its value is `undefined`. A **defaulted** parameter (`name: string = \"Guest\"`) also may be omitted, but then it takes the default value instead of `undefined`. A defaulted parameter is automatically optional, so you almost never write both `?` and `=` together. Coming from PHP, the defaulted version is exactly what you're used to — the standalone `?` (yielding `undefined`) is the new one to watch.",
    },
    {
      q: "How do you type a callback parameter, and why is that better than PHP's `callable`?",
      a: "You use a **function type expression**: `fn: (n: number) => number`. This pins down both the parameter types and the return type, so the compiler checks that whatever you pass actually matches — and your editor autocompletes inside the callback. PHP's `callable` (and `Closure`) only says \"some invocable thing\"; it can't describe what goes in or comes out, so mistakes surface at runtime.",
    },
    {
      q: "Coming from PHP closures, what changes about capturing variables in TypeScript?",
      a: "In PHP, a classic `function () { }` closure must explicitly import outer variables with `use ($x)` (and `use (&$x)` for by-reference). In TypeScript — and JavaScript generally — **every** function, arrow or not, automatically closes over the variables in its surrounding scope. There is no `use` clause. PHP's short arrow `fn () => ...` behaves the same way (auto-capture), so a TS arrow function is closest to that.",
    },
    {
      q: "What does a `void` return type mean, and when would you use it?",
      a: "`void` means the function isn't expected to return a usable value — it's called for its side effect (logging, mutating state, firing an event). It mirrors PHP's `: void`. One TypeScript subtlety: a `void` *callback type* will still accept a function that returns something — the return value is just ignored — which makes patterns like `arr.forEach(x => results.push(x))` type-check cleanly.",
    },
    {
      q: "What are function overloads and when would you reach for them?",
      a: "Overloads let you declare several call signatures for one function whose behavior depends on the argument shapes, e.g. `function parse(x: string): object;` and `function parse(x: number): number[];` above a single implementation. They're useful in libraries where return type genuinely depends on input type. In everyday application code you should usually prefer **union types** or separate functions — overloads are harder to maintain and easy to get subtly wrong.",
    },
  ],

  quiz: [
    {
      question:
        "Given `function f(a: number, b?: number) {}`, what is the type of `b` inside the function when `f(5)` is called?",
      options: [
        "number",
        "number | undefined (it is undefined)",
        "null",
        "It's a compile error to call f(5)",
      ],
      answerIndex: 1,
      explain:
        "An optional parameter that is omitted is `undefined`. Its type inside the function is `number | undefined`, so you must handle the undefined case.",
    },
    {
      question:
        "Which is the correct, idiomatic way to type a callback that takes a string and returns a boolean?",
      options: [
        "fn: callable",
        "fn: Closure<string, boolean>",
        "fn: (s: string) => boolean",
        "fn: function(string): boolean",
      ],
      answerIndex: 2,
      explain:
        "A function type expression `(s: string) => boolean` precisely describes the parameter and return types. `callable`/`Closure` are PHP, not TS.",
    },
    {
      question:
        "How does an arrow function in TypeScript capture a variable from the surrounding scope?",
      options: [
        "You must list it with a `use (...)` clause",
        "Automatically — no explicit import is needed",
        "Only if it is declared with `var`",
        "You must pass it explicitly as a parameter",
      ],
      answerIndex: 1,
      explain:
        "Unlike PHP's classic closures, TS/JS functions automatically close over surrounding variables. There is no `use` clause.",
    },
  ],
};

export default lesson;
