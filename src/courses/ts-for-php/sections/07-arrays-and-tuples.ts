import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "arrays-and-tuples",
  title: "Arrays & Tuples",
  part: "The Type System",
  estMinutes: 13,
  summary:
    "How TypeScript splits PHP's one all-purpose array into distinct, typed shapes: ordered arrays, fixed-length tuples, and readonly variants.",

  concept: `
Here is the single biggest adjustment coming from PHP. In PHP, \`array\` is **one
type that does everything** — it's a list, a map, a stack, a queue, a record, and
a config bag all at once. \`[1, 2, 3]\` and \`['name' => 'Sam', 'age' => 40]\` are the
*same type*. TypeScript refuses to blur those roles. It gives you **arrays** for
ordered collections of one element type, **tuples** for fixed-length, mixed-type
slots, and **objects** for string-keyed records (covered in their own section).

### Typed arrays

An array holds many values of **the same type**. There are two equivalent syntaxes:

\`\`\`typescript
const ids: number[] = [1, 2, 3];          // shorthand — preferred
const names: Array<string> = ["a", "b"];  // generic form — identical meaning
\`\`\`

Unlike a PHP \`array\`, you can't quietly mix types: \`ids.push("four")\` is a
compile error. For a deliberately mixed bag you'd use a union element type,
\`(number | string)[]\`.

### readonly arrays

Mark an array as \`readonly\` and the mutating methods (\`push\`, \`pop\`, \`splice\`,
index assignment) **disappear from its type**:

\`\`\`typescript
const config: readonly string[] = ["--strict"];
config.push("--noEmit"); // ❌ Property 'push' does not exist on readonly...
\`\`\`

PHP arrays are copy-on-write value types, so passing one into a function can't
mutate the caller's copy. JavaScript arrays are **references**, so \`readonly\` is
how you get a similar "you can look but not touch" guarantee.

### Tuples

A **tuple** is a fixed-length array where each position has its own type. This is
the idiomatic TS home for the PHP "list-style" array you'd return from a function:

\`\`\`typescript
let pair: [string, number] = ["age", 40];
\`\`\`

### Named elements and rest

Tuple slots can be **named** (labels only — they're documentation, erased at
runtime) and can end with a **rest element** for a variable tail:

\`\`\`typescript
type Point = [x: number, y: number];
type Row = [id: number, ...cells: string[]];
\`\`\`

> Rule of thumb: same type, any length → array. Different types, fixed positions
> → tuple. String keys → object.
`,

  comparisons: [
    {
      label: "A plain list of numbers",
      intro:
        "We build a list of numbers and then try to append a string to it. The point is to see what each language does when that mismatched value sneaks in.",
      php: `<?php
declare(strict_types=1);

// PHP: an array, untyped elements, freely mixable
$x = [1, 2, 3];
$x[] = "oops"; // perfectly legal — now mixed`,
      ts: `const x: number[] = [1, 2, 3];
x.push("oops"); // ❌ Argument of type 'string' is
                //    not assignable to 'number'`,
      note:
        "PHP arrays hold anything. A TS `number[]` is locked to one element type, checked at compile time.",
    },
    {
      label: "Fixed-shape 'list' return → tuple",
      intro:
        "A divmod function returns both the quotient and remainder as one positional pair, which the caller then destructures. We want the caller to know each slot's type up front.",
      php: `<?php
// Classic PHP: return a positional list, destructure it
function divmod(int $a, int $b): array {
    return [intdiv($a, $b), $a % $b];
}
[$q, $r] = divmod(17, 5); // $q = 3, $r = 2`,
      ts: `function divmod(a: number, b: number): [number, number] {
  return [Math.floor(a / b), a % b];
}
const [q, r] = divmod(17, 5); // q: number, r: number`,
      note:
        "PHP returns a loose `array`; TS pins it to a 2-element tuple so the call site knows exactly what each slot is.",
    },
    {
      label: "Heterogeneous fixed record",
      intro:
        "We store a user as three values of different types in a fixed order: name, age, and an active flag. The goal is a structure where the position, count, and type of each slot are all guaranteed.",
      php: `<?php
// PHP uses one array for everything
$user = ["Sam", 40, true]; // name, age, active?`,
      ts: `// TS names each slot for self-documenting code
const user: [name: string, age: number, active: boolean] =
  ["Sam", 40, true];`,
      note:
        "Same data; TS encodes position, count, AND per-slot type. Wrong order or arity won't compile.",
    },
    {
      label: "Immutability guarantee",
      intro:
        "A function receives a list and tries to append to it. We want to be sure the caller's original list is left untouched no matter what the function does.",
      php: `<?php
// PHP arrays are value types — callee can't mutate caller's copy
function show(array $items): void {
    $items[] = "x"; // local copy only
}`,
      ts: `// JS arrays are references; 'readonly' restores the guarantee
function show(items: readonly string[]): void {
  items.push("x"); // ❌ push doesn't exist on readonly arrays
}`,
      note:
        "PHP gives you copy-on-write for free. In TS you opt into protection with `readonly`.",
    },
  ],

  playground: {
    intro:
      "A typed array, a tuple, a readonly array, and tuple destructuring. Uncomment the marked lines to watch the type checker push back.",
    code: `// 1) A typed array — same element type throughout.
const scores: number[] = [88, 92, 79];
scores.push(100); // fine — it's a number
console.log("scores:", scores);
// scores.push("A+"); // ❌ string is not assignable to number

// 2) A tuple — fixed length, each slot its own type.
const person: [name: string, age: number] = ["Sam", 40];
console.log("person:", person);
// const bad: [string, number] = [40, "Sam"]; // ❌ wrong order

// 3) A readonly array — look but don't touch.
const flags: readonly string[] = ["--strict", "--noEmit"];
console.log("flags:", flags.join(" "));
// flags.push("--watch"); // ❌ push does not exist on readonly arrays

// 4) Tuple destructuring — each binding keeps its precise type.
function minMax(nums: number[]): [min: number, max: number] {
  return [Math.min(...nums), Math.max(...nums)];
}
const [lo, hi] = minMax(scores);
console.log(\`min=\${lo} max=\${hi}\`);`,
  },

  keyPoints: [
    "PHP's single `array` is split in TS into **array** (ordered, one type), **tuple** (fixed length, per-slot types), and **object** (string keys).",
    "`number[]` and `Array<number>` are identical — the bracket form is idiomatic.",
    "Arrays are homogeneous: use a union element type like `(string | number)[]` for a deliberately mixed list.",
    "Tuples encode **length and the type at each position** — ideal for positional return values you'd destructure.",
    "Tuple slots can be **named** (docs only, erased at runtime) and end in a **rest element** like `[number, ...string[]]`.",
    "`readonly` strips mutating methods from the type, restoring the can't-mutate-the-caller guarantee PHP gives arrays for free.",
  ],

  interview: [
    {
      q: "Coming from PHP, what's the conceptual difference between a PHP array and TypeScript's array/tuple/object split?",
      a: "A PHP `array` is a single ordered hash map that serves as list, map, record, and stack simultaneously — `[1,2,3]` and `['a'=>1]` are the same type. TypeScript deliberately separates those roles: `number[]` for a homogeneous ordered list, `[string, number]` (a **tuple**) for a fixed-length, mixed-type sequence, and an object type like `{ name: string }` for string-keyed records. The payoff is that each shape carries precise, compile-checked guarantees about length, keys, and per-slot types.",
    },
    {
      q: "What is a tuple and when would you reach for one instead of an array?",
      a: "A tuple is an array type with a **fixed length** where each position has its own type, e.g. `[string, number]`. Use it for positional, heterogeneous data — most often a function returning multiple values you'll destructure, like `[value, error]` or `[min, max]`. Use a plain array when you have an arbitrary number of items that share one type. If you find yourself reaching for index `[3]` and expecting a specific type, that's a tuple smell.",
    },
    {
      q: "What does `readonly` do to an array type, and why does it matter more in TS than in PHP?",
      a: "`readonly string[]` (or `ReadonlyArray<string>`) removes the mutating methods — `push`, `pop`, `splice`, sort-in-place, and index assignment — from the type, so attempts to mutate fail at compile time. It matters because JavaScript arrays are **reference types**: passing one into a function lets the callee mutate the caller's data. PHP arrays are copy-on-write value types, so you got that protection for free; in TS you opt into it with `readonly`.",
    },
    {
      q: "What are named tuple elements and do they exist at runtime?",
      a: "Named tuple elements let you label positions for readability — `type Point = [x: number, y: number]`. The labels are purely a **type-level / editor feature**: they show up in tooltips and signatures but are completely erased during compilation. At runtime a tuple is just a plain JavaScript array, so you still access elements by index (`point[0]`), not by name.",
    },
  ],

  quiz: [
    {
      question: "Which type best models a function returning a fixed `[status, message]` pair?",
      options: [
        "string[]",
        "[number, string]",
        "Array<number | string>",
        "{ status: number; message: string }",
      ],
      answerIndex: 1,
      explain:
        "A tuple `[number, string]` captures exactly two positional slots with distinct types — the right tool for fixed-length, heterogeneous return values you'll destructure.",
    },
    {
      question: "What happens when you call `.push()` on a value typed `readonly number[]`?",
      options: [
        "It works but logs a warning at runtime",
        "It's a compile-time error — `push` isn't on the readonly type",
        "It silently creates a copy",
        "It throws a TypeError when the code runs",
      ],
      answerIndex: 1,
      explain:
        "`readonly` removes mutating methods from the type, so `push` doesn't exist and the error is caught at compile time, before the code ever runs.",
    },
    {
      question: "Which statement about `number[]` and `Array<number>` is true?",
      options: [
        "They are completely different types",
        "`Array<number>` allows mixed types but `number[]` does not",
        "They are exactly equivalent — two syntaxes for the same type",
        "Only `Array<number>` can be marked readonly",
      ],
      answerIndex: 2,
      explain:
        "The bracket shorthand `number[]` and the generic form `Array<number>` describe the identical type; the bracket form is the idiomatic choice.",
    },
  ],
};

export default lesson;
