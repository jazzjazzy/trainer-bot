import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "modules",
  title: "Modules: import / export",
  part: "Object-Oriented TypeScript",
  estMinutes: 13,
  summary:
    "How TypeScript splits code across files with explicit ES module imports and exports — and why there is no PSR-4 autoloading doing it for you.",

  concept: `
In PHP, code is spread across files and **Composer's PSR-4 autoloader** silently
pulls in a class the moment you reference it — \`new App\\Service\\Mailer()\` just
works, no \`require\` needed. TypeScript has **no autoloading**. Every dependency a
file uses must be **explicitly imported** at the top. The upside: you can always
see exactly what a file depends on, and the bundler can tree-shake away anything
you don't import.

### Named exports

A file can export **many** things — functions, classes, types, constants:

\`\`\`typescript
// math.ts
export function add(a: number, b: number): number {
  return a + b;
}
export const PI = 3.14159;
export type Point = { x: number; y: number };
\`\`\`

Import them by name with curly braces:

\`\`\`typescript
import { add, PI, type Point } from "./math";
\`\`\`

### Default export

A file may also have **one** default export — handy for "the main thing" a module
provides:

\`\`\`typescript
// logger.ts
export default class Logger { /* ... */ }

// elsewhere — you pick the name, no braces:
import Logger from "./logger";
\`\`\`

### Import forms

- \`import { a, b } from "./mod"\` — named imports.
- \`import Thing from "./mod"\` — the default.
- \`import * as mod from "./mod"\` — everything as a namespace object.
- \`import { thing as renamed } from "./mod"\` — rename on import.

### export type and re-exports

Use \`export type\` / \`import type\` for type-only symbols — the compiler erases them
completely, emitting zero runtime code. A **barrel file** re-exports many modules
through one entry point, so consumers import from a single tidy path:

\`\`\`typescript
// index.ts (a barrel)
export * from "./math";
export { default as Logger } from "./logger";
\`\`\`

### Project structure & CommonJS

Paths are **relative to the file** (\`./\`, \`../\`) or bare specifiers resolved by the
bundler/\`node_modules\`. Older Node code used **CommonJS** — \`const x = require("x")\`
and \`module.exports\` — which loads synchronously at runtime. Modern TypeScript uses
**ES modules** (\`import\`/\`export\`), which are statically analysable. You'll still
meet \`require\` in legacy code, but write \`import\`.
`,

  comparisons: [
    {
      label: "Pulling in a dependency",
      intro:
        "A controller needs to create a Mailer that lives in another file. The goal is simply to get a usable Mailer instance — the question is what it takes to make that class available.",
      php: `<?php
// Composer PSR-4 autoloads it — no explicit include needed.
namespace App\\Controller;

use App\\Service\\Mailer;

$mailer = new Mailer();`,
      ts: `// No autoloading — you MUST import it explicitly.
import { Mailer } from "./service/Mailer";

const mailer = new Mailer();`,
      note: "PHP autoloads on first reference; TS requires an explicit import line for every dependency.",
    },
    {
      label: "Exporting many things from one file",
      intro:
        "We want a math module that bundles an add function, a PI constant, and an Adder class together. The point is to see how each language packages several related pieces for others to use.",
      php: `<?php
namespace App\\Math;

// Each public class lives in its own file under PSR-4.
class Adder { /* Adder.php */ }
// PI would need its own construct/file or a class constant.`,
      ts: `// math.ts — one file can export several symbols.
export function add(a: number, b: number) { return a + b; }
export const PI = 3.14159;
export class Adder {}`,
      note: "PSR-4 maps one class per file; a single TS module can export functions, consts, types, and classes together.",
    },
    {
      label: "Importing by name",
      intro:
        "Here we reach into that math module to grab specific things — the add function and the Adder class — and call add(2, 3). The goal is to bring named pieces into the current file by their exact names.",
      php: `<?php
use App\\Math\\Adder;
use function App\\Math\\add;

$sum = add(2, 3);`,
      ts: `import { add, Adder } from "./math";

const sum = add(2, 3);`,
      note: "PHP's `use` aliases a fully-qualified name; TS's import binds a name to a path resolved by the bundler.",
    },
    {
      label: "Renaming on import",
      intro:
        "We import the Mailer class but want to refer to it locally as MailService — perhaps to avoid a name clash or read more clearly. The result is a renamed local binding pointing at the same class.",
      php: `<?php
use App\\Service\\Mailer as MailService;

$m = new MailService();`,
      ts: `import { Mailer as MailService } from "./service/Mailer";

const m = new MailService();`,
      note: "Both languages alias on import; TS uses `as` inside the braces, PHP uses `as` after the FQN.",
    },
    {
      label: "Type-only import (no runtime cost)",
      intro:
        "A save function needs the UserDto only to annotate its parameter, never as a runtime value. The aim is to pull in that type purely for type-checking, with the compiled output ideally carrying no trace of it.",
      php: `<?php
// PHP has no notion of a type-only use — a type IS a class/interface.
use App\\Dto\\UserDto;

function save(UserDto $u): void {}`,
      ts: `// import type is fully erased at compile time.
import type { UserDto } from "./dto/UserDto";

function save(u: UserDto): void {}`,
      note: "`import type` emits zero JavaScript — there's no PHP equivalent because PHP types are real runtime classes.",
    },
  ],

  playground: {
    intro:
      "The playground can't use real imports, so here's the pattern you'd reach for when grouping related helpers: an object acting as a module/namespace. In a real project this would live in its own file behind `export const MathUtils`.",
    code: `// An object can act like a tiny module / namespace.
// In a real project this would be its own file:
//   export const MathUtils = { ... }  // math.ts
// then:  import { MathUtils } from "./math";

const MathUtils = {
  PI: 3.14159,
  add(a: number, b: number): number {
    return a + b;
  },
  circleArea(r: number): number {
    return this.PI * r * r;
  },
};

console.log("add:", MathUtils.add(2, 3));
console.log("area of r=2:", MathUtils.circleArea(2).toFixed(2));

// You can also pull pieces out by name, like a named import:
const { add } = MathUtils;
console.log("destructured add:", add(10, 5));`,
  },

  keyPoints: [
    "**No autoloading.** Every dependency a file uses must be explicitly `import`ed at the top.",
    "A single module can have **many named exports** but at most **one** `default` export.",
    "Import forms: `import { a }`, `import Thing` (default), `import * as ns`, and `as` to rename.",
    "Use `import type` / `export type` for type-only symbols — they're erased and add zero runtime code.",
    "**Barrel files** (`index.ts`) re-export many modules through one tidy entry point.",
    "Prefer ES modules (`import`/`export`); legacy `require`/`module.exports` is CommonJS.",
  ],

  interview: [
    {
      q: "Coming from PHP's PSR-4 autoloading, what changes about how dependencies are loaded in TypeScript?",
      a: "PHP's Composer autoloader resolves a class the instant you reference its fully-qualified name — you rarely write a `require`. TypeScript (ES modules) has **no autoloading**: if a file uses something, it must `import` it explicitly at the top. The benefit is that a module's dependencies are always visible at a glance, imports are statically analysable, and bundlers can **tree-shake** unused exports out of the final bundle.",
    },
    {
      q: "What is the difference between a named export and a default export?",
      a: "A module can have **any number of named exports** (`export function add() {}`), imported by their exact name in braces: `import { add } from \"./math\"`. A module can have **at most one default export** (`export default class Logger {}`), imported without braces under any name you choose: `import Log from \"./logger\"`. Named exports give better autocomplete and refactor safety, so many teams prefer them and avoid defaults.",
    },
    {
      q: "When and why would you use `import type` instead of a plain `import`?",
      a: "Use `import type` when you only need a symbol for its **type**, not its runtime value — e.g. an interface or a type alias used in an annotation. The compiler guarantees it's erased entirely, so it never appears in the emitted JavaScript and can't accidentally cause a runtime dependency or a circular-import side effect. There's no PHP analogue, because in PHP a 'type' is a real class/interface loaded at runtime.",
    },
    {
      q: "What is a barrel file and what is the trade-off?",
      a: "A barrel is an `index.ts` that **re-exports** other modules (`export * from \"./math\"`), so consumers import everything from one path (`import { add, Logger } from \"./lib\"`) instead of many. It's a bit like a single `use` namespace prefix. The trade-off: barrels can hurt tree-shaking and create circular imports if overused, so keep them at clear package boundaries rather than wrapping every folder.",
    },
    {
      q: "What's the difference between ES modules and CommonJS?",
      a: "**CommonJS** is the older Node format: `const x = require(\"x\")` and `module.exports = ...`. It loads modules **synchronously at runtime** and isn't statically analysable. **ES modules** use `import`/`export`, are resolved statically (enabling tree-shaking and better tooling), and are the modern default. You'll still encounter `require` in legacy Node code, but new TypeScript should use `import`.",
    },
  ],

  quiz: [
    {
      question: "How many default exports can a single module have?",
      options: [
        "As many as you like",
        "Exactly one, or none",
        "Exactly one, always required",
        "None — TypeScript removed default exports",
      ],
      answerIndex: 1,
      explain:
        "A module may have at most one default export (it can have zero), but unlimited named exports.",
    },
    {
      question:
        "In TypeScript, what loads a module's dependencies when you reference them?",
      options: [
        "A PSR-4-style autoloader configured in tsconfig",
        "Nothing automatic — you must explicitly import each dependency",
        "The garbage collector resolves them lazily",
        "The browser fetches any class by its name on demand",
      ],
      answerIndex: 1,
      explain:
        "There is no autoloading. Unlike PHP's Composer autoloader, every dependency must be explicitly imported at the top of the file.",
    },
    {
      question: "What does `import type { User } from \"./user\"` guarantee?",
      options: [
        "It loads User faster than a normal import",
        "It is erased at compile time and emits no JavaScript",
        "It makes User available as both a value and a type",
        "It re-exports User from a barrel file",
      ],
      answerIndex: 1,
      explain:
        "`import type` is type-only: the compiler erases it entirely, so it produces no runtime JavaScript and no runtime dependency.",
    },
  ],
};

export default lesson;
