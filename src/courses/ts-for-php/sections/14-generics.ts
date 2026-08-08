import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "generics",
  title: "Generics",
  part: "The Type System",
  estMinutes: 16,
  summary:
    "Generics let you write reusable functions, classes, and types that work over many types while preserving the exact type that flows through them — something PHP can only fake with docblocks.",

  concept: `
This is the single biggest brand-new idea coming from PHP. In PHP, when you want
one function to work with "any type", you reach for \`mixed\`, \`object\`, or no
hint at all — and the moment you do, the engine **forgets** what you put in. The
caller gets back something untyped and has to guess. TypeScript generics solve
exactly this: write the code once, and the **caller's** concrete type is carried
all the way through, end to end.

### A generic function

A generic introduces a **type parameter** — a placeholder type, by convention
\`T\` — written in angle brackets after the function name. Think of it as an
*argument*, but for types instead of values.

\`\`\`typescript
function identity<T>(value: T): T {
  return value;
}

const a = identity("hello"); // T = string  -> a is string
const b = identity(42);      // T = number  -> b is number
\`\`\`

You almost never pass \`<T>\` explicitly — TypeScript **infers** it from the
argument. The return type \`T\` means "whatever came in comes back out", so \`a\`
is a \`string\`, not \`mixed\`.

### Constraints with \`extends\`

Sometimes \`T\` can be *anything*, but other times you need it to have a certain
shape. \`extends\` constrains the type parameter:

\`\`\`typescript
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}

longest("abc", "ab");     // ok — strings have .length
longest([1, 2], [1]);     // ok — arrays have .length
longest(1, 2);            // error — numbers have no .length
\`\`\`

Here \`T extends { length: number }\` reads as "\`T\` can be any type, **as long
as** it has a \`length\` property". You keep the flexibility *and* get safe
access to \`.length\`.

### Generic interfaces, classes, and defaults

Types can be generic too — this is how \`Array<T>\`, \`Map<K, V>\`, and
\`Promise<T>\` work under the hood.

\`\`\`typescript
interface Box<T> {
  value: T;
}

class Stack<T> {
  private items: T[] = [];
  push(item: T): void { this.items.push(item); }
  pop(): T | undefined { return this.items.pop(); }
}

// Default type parameter — used when none can be inferred:
interface ApiResponse<T = unknown> {
  ok: boolean;
  data: T;
}
\`\`\`

### Why generics exist

Reuse **without losing type information**. The alternative — \`any\`/\`mixed\` —
gives you reuse but throws away every guarantee. Generics are the bridge: one
implementation, many types, full type safety at every call site.
`,

  comparisons: [
    {
      label: "A reusable identity function",
      intro:
        "We want one function that returns whatever value it is given, then call it with a string and use a string method on the result. The goal is for the language to remember it was a string so a typo like a bad method name is caught before running.",
      php: `<?php
declare(strict_types=1);

/**
 * @template T
 * @param T $value
 * @return T
 */
function identity(mixed $value): mixed {
    return $value;
}

$a = identity("hello"); // engine sees: mixed
$a->nope();             // no static error — blows up only at runtime`,
      ts: `function identity<T>(value: T): T {
  return value;
}

const a = identity("hello"); // a is string
a.nope();                    // compile error: no such method`,
      note:
        "PHP's @template is a docblock comment the engine ignores; the real signature is mixed. TS carries T through for real.",
    },
    {
      label: "First element of a list",
      intro:
        "A helper grabs the first item from a list, and we call it with an array of numbers. We want the returned value to be known as a number (possibly absent) rather than some untyped blob.",
      php: `<?php
declare(strict_types=1);

/**
 * @template T
 * @param list<T> $items
 * @return T|null
 */
function first(array $items): mixed {
    return $items[0] ?? null;
}

$n = first([1, 2, 3]); // engine sees: mixed, not int`,
      ts: `function first<T>(items: T[]): T | undefined {
  return items[0];
}

const n = first([1, 2, 3]); // n is number | undefined`,
      note:
        "Same goal, but TS infers T = number from the array, so the result is genuinely typed as number | undefined.",
    },
    {
      label: "A constrained type parameter",
      intro:
        "We write a function that returns the longer of two values by comparing their length, so it should work for strings and arrays but reject things that have no length, like plain numbers. The aim is to keep it generic while still safely using the length property inside.",
      php: `<?php
declare(strict_types=1);

/**
 * @template T of \\Countable|array
 * @param T $a
 * @param T $b
 * @return T
 */
function longest(mixed $a, mixed $b): mixed {
    return count($a) >= count($b) ? $a : $b;
}`,
      ts: `function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}

longest("abc", "ab"); // T = string
longest(1, 2);        // compile error: number has no length`,
      note:
        "extends is a real compile-time constraint; PHP's `@template T of ...` only helps static analysers like PHPStan, never the runtime.",
    },
    {
      label: "A generic container type",
      intro:
        "We build a small wrapper class that holds a single value, create one around the number 123, then read that value back. The goal is for the stored value to come back out as a number rather than an untyped field.",
      php: `<?php
declare(strict_types=1);

/** @template T */
class Box {
    /** @param T $value */
    public function __construct(public mixed $value) {}
}

$b = new Box(123);
$v = $b->value; // engine sees: mixed`,
      ts: `class Box<T> {
  constructor(public value: T) {}
}

const b = new Box(123); // Box<number>
const v = b.value;      // v is number`,
      note:
        "TS classes/interfaces take type parameters that the type checker tracks; PHP classes can only annotate them in comments.",
    },
  ],

  playground: {
    intro:
      "Generics in action. Hover over a, n, and longest's result — the editor shows the precise inferred type, not 'any'. Try calling first([]) or longest(1, 2) and watch the types react.",
    code: `// 1) Generic identity: whatever goes in comes back out, fully typed.
function identity<T>(value: T): T {
  return value;
}

const a = identity("hello"); // T = string
const b = identity(42);      // T = number
console.log("identity:", a.toUpperCase(), b.toFixed(2));

// 2) Generic first(): element type is preserved as T | undefined.
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const n = first([10, 20, 30]); // number | undefined
const s = first(["x", "y"]);   // string | undefined
const empty = first<number>([]); // undefined
console.log("first:", n, s, empty);

// Guard the undefined case, just like handling null in PHP:
if (n !== undefined) {
  console.log("first squared:", n * n);
}

// 3) Constrained generic: T must have a .length property.
function longest<T extends { length: number }>(x: T, y: T): T {
  return x.length >= y.length ? x : y;
}

console.log("longest string:", longest("abcd", "ab"));
console.log("longest array:", longest([1, 2, 3], [9]));

// Uncomment to see the constraint reject numbers (no .length):
// console.log(longest(1, 2));`,
  },

  keyPoints: [
    "A generic is a **type parameter** (\`<T>\`) — an argument for types — that lets one implementation serve many types.",
    "TypeScript usually **infers** \`T\` from the arguments, so you rarely write \`<T>\` at the call site.",
    "Generics preserve type info end to end; \`any\`/\`mixed\` reuse code but **throw the types away**.",
    "\`T extends Shape\` constrains a parameter so you can safely use that shape inside.",
    "Interfaces and classes can be generic too — that's how \`Array<T>\`, \`Map<K, V>\`, and \`Promise<T>\` work.",
    "Default type parameters (\`<T = unknown>\`) supply a fallback when none can be inferred.",
  ],

  interview: [
    {
      q: "What problem do generics solve, and why can't you just use `any`?",
      a: "Generics give you **reuse without losing type information**. With `any` (the TS equivalent of PHP's `mixed`) a function works for every type, but the return value is untyped — the caller gets no autocomplete, no checking, nothing. A generic like `identity<T>(value: T): T` instead **captures** the caller's type in `T` and threads it through to the return, so `identity(42)` is statically known to be a `number`. One implementation, full type safety at every call site.",
    },
    {
      q: "Coming from PHP, how do TypeScript generics differ from PHPDoc `@template`?",
      a: "They look similar but live in different worlds. PHP's `@template` is a **docblock comment** — the runtime ignores it entirely, and the actual signature is usually `mixed`. Only static analysers (Psalm, PHPStan) read it, and they can't stop the program running. TypeScript generics are part of the **language**: the compiler enforces them and fails the build on a violation. Same intent, but in TS the type parameter is real and end-to-end.",
    },
    {
      q: "What does `extends` mean in a generic, e.g. `<T extends { length: number }>`?",
      a: "It's a **constraint**: `T` can still be many types, but only types that are assignable to `{ length: number }` — i.e. that have a numeric `length`. This buys you two things: callers passing something without `.length` get a compile error, and inside the function you can safely read `value.length`. It's the same idea as PHPStan's `@template T of SomeType`, except the TS version is enforced by the compiler rather than an optional tool.",
    },
    {
      q: "Why does `function first<T>(arr: T[]): T | undefined` return `T | undefined`?",
      a: "Because an array might be empty. Indexing `arr[0]` on an empty array yields `undefined` at runtime, so the honest return type is `T | undefined` — the element type *or* nothing. This forces the caller to handle the empty case (a narrowing check) before using the value, the same way you'd guard against `null` from `$items[0] ?? null` in PHP. It's a small example of TypeScript pushing you to handle the absent case at compile time.",
    },
    {
      q: "Can interfaces and classes be generic, and where have you already used that?",
      a: "Yes. `interface Box<T> { value: T }` and `class Stack<T> { ... }` both parameterise over a type. You've used generic types since day one without thinking about it: `Array<T>` (`number[]` is sugar for `Array<number>`), `Map<K, V>`, `Set<T>`, `Promise<T>`, and `Record<K, V>` are all generic. Writing your own is just the same mechanism applied to your own containers and responses, e.g. `ApiResponse<User>`.",
    },
  ],

  quiz: [
    {
      question:
        "Given `function identity<T>(value: T): T`, what is the type of `identity(\"hi\")`?",
      options: ["any", "string", "unknown", "T"],
      answerIndex: 1,
      explain:
        "TypeScript infers T = string from the argument, and the return type is T, so the result is string — fully typed, not any.",
    },
    {
      question:
        "What does the constraint in `function f<T extends { id: number }>(x: T)` enforce?",
      options: [
        "T must be exactly the type { id: number }",
        "T can be any type that has a numeric `id` property",
        "T must be a class that extends a base class named id",
        "Nothing — `extends` in generics is only documentation",
      ],
      answerIndex: 1,
      explain:
        "`T extends { id: number }` constrains T to any type assignable to that shape — it must have a numeric `id` — while still allowing many different concrete types.",
    },
    {
      question:
        "How do TypeScript generics differ from PHP's `@template` docblock annotations?",
      options: [
        "They are identical; both are ignored at runtime and by the compiler",
        "PHP enforces @template at runtime; TypeScript does not check generics",
        "TypeScript generics are enforced by the compiler; @template is a comment only static analysers read",
        "Generics only work on classes in TypeScript, never on functions",
      ],
      answerIndex: 2,
      explain:
        "TS generics are a real, compiler-enforced language feature. PHP's @template is a docblock that the engine ignores and only tools like PHPStan/Psalm interpret.",
    },
  ],
};

export default lesson;
