import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "javascript-underneath",
  title: "The JavaScript Underneath",
  part: "Foundations",
  estMinutes: 14,
  summary:
    "TypeScript is JavaScript with types bolted on top, so every classic JavaScript gotcha — coercion, truthiness, scope, and null vs undefined — still bites you at runtime.",

  concept: `
The type checker is gone by the time your code runs. Underneath every \`.ts\`
file is plain JavaScript, and JavaScript has a personality. Some of its habits
will feel familiar from PHP; a few will quietly ruin your afternoon. This
section is about the runtime that survives compilation.

### let, const, var & block scope

Use \`const\` by default, \`let\` when you must reassign, and **never** \`var\`.

\`\`\`ts
const limit = 10;      // can't be reassigned
let count = 0;         // can be reassigned
count = count + 1;
\`\`\`

\`const\` and \`let\` are **block-scoped** — they live and die inside the nearest
\`{ }\`. PHP variables, by contrast, are **function-scoped**: a variable created
inside an \`if\` block is still visible after the block ends. \`var\` is the old
JS keyword that behaves the PHP way (function-scoped). It also **hoists**:

\`\`\`ts
console.log(x); // undefined, NOT an error — var is hoisted
var x = 5;
\`\`\`

\`let\`/\`const\` hoist too, but sit in a "temporal dead zone" — touching them
before declaration throws. That's the safer behaviour, which is why \`var\` is dead.

### == vs === (coercion)

PHP's loose \`==\` is famous for surprises; JavaScript's is worse. \`==\` coerces
types before comparing, producing gems like \`0 == ""\` and \`null == undefined\`
being \`true\`. The rule is simple: **always use \`===\`** (and \`!==\`). It compares
value *and* type with no coercion — the equivalent of always thinking in PHP's
\`===\`.

### Truthiness & falsy values

There are exactly **six falsy values** in JavaScript:

\`\`\`
false   0   ""   null   undefined   NaN
\`\`\`

Everything else is truthy. The trap for a PHP dev: the string \`"0"\` is
**truthy** in JavaScript but **falsy** in PHP. Empty arrays and \`"0.0"\` are
truthy in JS too.

### null vs undefined

PHP has one "nothing": \`null\`. JavaScript has **two**. \`undefined\` means "never
assigned" (a missing property, an unset variable, a function with no return).
\`null\` means "deliberately empty" — you set it on purpose. You'll handle both.

### this

\`this\` in JavaScript depends on **how a function is called**, not where it's
defined — unlike PHP's \`$this\`, which is always the current object. Regular
functions get a \`this\` decided at call time; **arrow functions** capture \`this\`
from their surrounding scope, which is usually what you want.
`,

  comparisons: [
    {
      label: "Falsy rules: the \"0\" trap",
      intro:
        "We test how an if-condition treats the string \"0\" in each language. The same code prints opposite words, which is exactly the kind of porting bug to watch for.",
      php: `<?php
// PHP falsy: false, 0, 0.0, "", "0", null, [], unset
if ("0") {
    echo "truthy";
} else {
    echo "falsy"; // PHP prints "falsy" — "0" is falsy!
}`,
      ts: `// JS falsy: false, 0, "", null, undefined, NaN
if ("0") {
  console.log("truthy"); // JS prints "truthy" — "0" is a non-empty string
} else {
  console.log("falsy");
}`,
      note:
        'The string "0" is FALSY in PHP but TRUTHY in JS. Empty arrays are also falsy in PHP, truthy in JS.',
    },
    {
      label: "Loose equality juggling",
      intro:
        "We compare a few mismatched values with loose equality to see what each language reports. Expect several surprising trues from coercion, and a reliable false once strict comparison is used.",
      php: `<?php
var_dump(0 == "");      // bool(false) in PHP 8+
var_dump("1" == 1);     // bool(true)
var_dump(null == false);// bool(true)
// Even PHP 8 still juggles — prefer ===
var_dump("1" === 1);    // bool(false)`,
      ts: `console.log(0 == "");        // true  ("" coerces to 0)
console.log("1" == 1);       // true  (string coerced to number)
console.log(null == undefined); // true (special case)
// Always use === — no coercion:
console.log("1" === 1);      // false`,
      note:
        "Both languages coerce with ==, but the rules differ. The fix is the same in both: always use === / !==.",
    },
    {
      label: "Scope of a block variable",
      intro:
        "We assign a variable inside an if block and then try to read it afterwards. PHP happily prints the value, while the TypeScript version cannot even see the variable outside the block.",
      php: `<?php
if (true) {
    $msg = "hello";
}
echo $msg; // "hello" — PHP vars are function-scoped`,
      ts: `if (true) {
  const msg = "hello";
}
console.log(msg); // Error: 'msg' is not defined — block-scoped`,
      note:
        "PHP variables leak out of if/for blocks; const/let do not. This is usually a safety win.",
    },
    {
      label: "null vs undefined",
      intro:
        "We represent an empty value and supply a fallback default for a missing one. PHP has a single empty value to juggle, whereas TypeScript must account for two distinct kinds of nothing.",
      php: `<?php
$user = null;          // PHP has one "nothing"
$name = $data["name"] ?? "guest"; // ?? handles null / unset`,
      ts: `let user = null;            // deliberately empty
let name: string | undefined;  // declared but never assigned -> undefined
const display = name ?? "guest"; // ?? handles BOTH null and undefined`,
      note:
        "JS distinguishes null (set on purpose) from undefined (never set). The ?? operator treats both as empty, like PHP's ??.",
    },
  ],

  playground: {
    intro:
      "Run this to feel the runtime that survives compilation: coercion, the falsy set, and reassignment. Try changing a const to see the editor complain before you run.",
    code: `// 1. == vs === — coercion surprises
console.log('0 == ""      ->', 0 == "");          // true ("" coerces to 0)
console.log('"1" == 1     ->', "1" == 1);          // true (string -> number)
console.log('null == undefined ->', null == undefined); // true
console.log('"1" === 1    ->', "1" === 1);          // false — use === always

// 2. The six falsy values
const falsyValues = [false, 0, "", null, undefined, NaN];
for (const v of falsyValues) {
  console.log("falsy:", JSON.stringify(v), "->", Boolean(v));
}

// 3. The classic PHP-dev trap: "0" is TRUTHY in JS
console.log('Boolean("0") ->', Boolean("0")); // true!
console.log("Boolean([]) ->", Boolean([]));   // true (empty array is truthy)

// 4. const vs let
let counter = 0;
counter = counter + 1; // fine — let can be reassigned
console.log("counter:", counter);

const PI = 3.14159;
// PI = 3; // Uncomment: editor flags "Cannot assign to 'PI'" before running
console.log("PI:", PI);

// 5. null vs undefined, and the ?? operator
let assigned;            // never set -> undefined
const chosen = null;     // set on purpose -> null
console.log("assigned is", assigned);              // undefined
console.log("chosen is", chosen);                  // null
console.log("?? fallback:", assigned ?? "default"); // "default"`,
  },

  keyPoints: [
    "TypeScript erases to plain JavaScript, so **every JS runtime gotcha still applies** — types don't change behaviour.",
    "Use `const` by default, `let` when reassigning, **never `var`**. `const`/`let` are block-scoped; PHP vars and `var` are function-scoped.",
    "There are exactly **six falsy values**: `false`, `0`, `\"\"`, `null`, `undefined`, `NaN`. Everything else (including `\"0\"` and `[]`) is truthy.",
    "`\"0\"` is **truthy** in JS but **falsy** in PHP — a real bug magnet when porting logic.",
    "**Always use `===`/`!==`** to avoid coercion, exactly like preferring PHP's `===`.",
    "JS has two empties: `undefined` (never assigned) and `null` (deliberately empty). `??` treats both as missing, like PHP's `??`.",
  ],

  interview: [
    {
      q: "What's the difference between let, const, and var, and which should you use?",
      a: "Use **`const`** by default and **`let`** only when you need to reassign; avoid **`var`** entirely. `const` and `let` are **block-scoped** (they exist only inside the nearest `{ }`), while `var` is **function-scoped** and **hoisted** — accessible (as `undefined`) before its declaration line. Coming from PHP, note that PHP variables are function-scoped like `var`, so the block scoping of `const`/`let` is the new behaviour to internalise. `const` prevents reassignment of the binding (though object contents can still mutate).",
    },
    {
      q: "Why should you always use === instead of ==?",
      a: "`==` performs **type coercion** before comparing, which produces surprising results: `0 == \"\"`, `\"1\" == 1`, and `null == undefined` are all `true`. `===` (strict equality) compares **value and type with no coercion**, so its results are predictable. It's the same instinct you already have in modern PHP, where `===` is preferred over `==`. The only common exception is `x == null`, sometimes used deliberately to catch both `null` and `undefined` in one check.",
    },
    {
      q: "List the falsy values in JavaScript. What trips up a PHP developer?",
      a: "JavaScript has exactly six falsy values: **`false`, `0`, `\"\"` (empty string), `null`, `undefined`, and `NaN`**. Everything else is truthy. The classic PHP trap is the string **`\"0\"`**: it is **falsy in PHP** but **truthy in JS** (it's a non-empty string). Likewise an **empty array `[]` is falsy in PHP but truthy in JS**. So a guard like `if (!$value)` ported straight across can behave differently.",
    },
    {
      q: "What's the difference between null and undefined?",
      a: "PHP has one concept of nothing (`null`); JavaScript has two. **`undefined`** means a value was never assigned — a missing object property, an uninitialised variable, or a function with no `return`. **`null`** means *deliberately* empty, something you assign on purpose. Both are falsy, and the nullish coalescing operator **`??`** treats both as 'missing' (`value ?? fallback`), mirroring PHP's `??`. In practice you check for both, often via `value == null` or `value ?? ...`.",
    },
    {
      q: "How does `this` work in JavaScript compared to PHP's `$this`?",
      a: "PHP's `$this` is always the current object instance. JavaScript's `this` is **dynamic** — it depends on **how the function is called**, not where it's written. A method called as `obj.method()` has `this === obj`, but pull that same function out and call it bare and `this` changes (often `undefined` in strict mode). **Arrow functions** don't have their own `this`; they capture it from the enclosing scope, which is why they're the safe choice for callbacks. The rule: regular functions get `this` at call time, arrow functions inherit it lexically.",
    },
  ],

  quiz: [
    {
      question: "Which of these is TRUTHY in JavaScript but FALSY in PHP?",
      options: [
        "The number 0",
        "The empty string \"\"",
        "The string \"0\"",
        "null",
      ],
      answerIndex: 2,
      explain:
        'The string "0" is a non-empty string, so it is truthy in JavaScript. PHP treats "0" as a special falsy case. The other three are falsy in both languages.',
    },
    {
      question: "What does `0 == \"\"` evaluate to in JavaScript?",
      options: [
        "true, because == coerces both to 0",
        "false, because they are different types",
        "It throws a TypeError",
        "true, but only in non-strict mode",
      ],
      answerIndex: 0,
      explain:
        'With ==, the empty string is coerced to the number 0, so 0 == "" is true. Using === (strict equality) it would be false because the types differ. This is why you should always use ===.',
    },
    {
      question:
        "A variable is declared with `let name;` but never assigned. What is its value?",
      options: [
        "null",
        "undefined",
        "An empty string \"\"",
        "It throws because it has no value",
      ],
      answerIndex: 1,
      explain:
        "A declared-but-unassigned variable holds `undefined` — JavaScript's 'never assigned' value. `null` is the value you set deliberately; it is never the default.",
    },
  ],
};

export default lesson;
