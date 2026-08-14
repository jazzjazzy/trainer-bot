import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "tsconfig-deep-dive",
  title: "tsconfig & Strict Mode",
  part: "Ecosystem & Interview",
  estMinutes: 14,
  summary:
    "How tsconfig.json configures the compiler, what strict mode actually turns on, and why flipping that one switch is the single highest-leverage decision in a TypeScript project.",

  concept: `
A PHP project's behaviour is steered by \`php.ini\`, \`composer.json\`, and the
occasional \`declare(strict_types=1)\` at the top of each file. A TypeScript
project has one file that does the equivalent job for the compiler:
\`tsconfig.json\`. It controls what the type checker enforces, what JavaScript the
compiler emits, and how modules are resolved.

### The compilerOptions that matter

\`\`\`json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./src/*"] },
    "baseUrl": "."
  }
}
\`\`\`

- **\`strict\`** — the master switch. One \`true\` enables a whole family of flags
  (see below). This is the line that makes TypeScript *actually* type-safe.
- **\`target\`** — which JavaScript version to compile *down to* (e.g. \`ES2022\`).
  Like choosing your minimum PHP version: it decides which syntax is emitted.
- **\`module\`** — the module system of the *output* (\`ESNext\`, \`CommonJS\`). Roughly
  "should this emit \`import\`/\`export\` or \`require()\`?".
- **\`moduleResolution\`** — *how* the compiler finds a file behind an import. Use
  \`Bundler\` for Vite/webpack projects, \`NodeNext\` for raw Node.
- **\`lib\`** — which built-in type definitions are available (\`DOM\` for browser
  APIs, \`ES2022\` for \`Array.at\`, etc.). It is PHP's loaded extensions, but for types.
- **\`esModuleInterop\`** — lets \`import express from "express"\` work cleanly with
  CommonJS packages. Almost always \`true\`.
- **\`paths\`** — import aliases, so \`@/utils\` maps to \`./src/utils\`. The TS
  answer to a PSR-4 autoload prefix.

### What \`strict\` actually enables

\`strict: true\` is shorthand for turning on, among others:

- **\`strictNullChecks\`** — \`null\` and \`undefined\` are no longer assignable to
  every type. You must handle them explicitly. *This is the big one.*
- **\`noImplicitAny\`** — a parameter with no inferable type errors instead of
  silently becoming \`any\`.
- **\`strictFunctionTypes\`**, **\`strictPropertyInitialization\`**,
  **\`alwaysStrict\`**, and more.

### Why strict mode matters

Without \`strictNullChecks\`, \`string\` secretly means "string, or \`null\`, or
\`undefined\`" — exactly the loosey-goosey world you left behind in old PHP.
Turning \`strict\` on **from day one** is far cheaper than retrofitting it onto a
mature codebase. Treat the recommended baseline above as your starting point.
`,

  comparisons: [
    {
      label: "Opting into strictness: per-file vs project-wide",
      intro:
        "Both snippets ask for strict type behaviour on a simple area function. The point is where you flip that switch: at the top of every file, or once in a config the whole project reads.",
      php: `<?php
// Must be the FIRST statement of EACH file,
// and it only affects this one file:
declare(strict_types=1);

function area(int $w, int $h): int {
    return $w * $h;
}`,
      ts: `// tsconfig.json — written ONCE, applies to every file:
{
  "compilerOptions": { "strict": true }
}

// area.ts — no per-file declaration needed
function area(w: number, h: number): number {
  return w * h;
}`,
      note:
        "PHP enforces strictness per file, at runtime. tsconfig enforces it project-wide, at compile time — you can't forget it on one file.",
    },
    {
      label: "noImplicitAny vs PHP's untyped parameter",
      intro:
        "Here we write a function that takes a single argument with no declared type. The question is whether the compiler will let that argument quietly default to 'any', or stop you and demand a real annotation.",
      php: `<?php
declare(strict_types=1);

// Legal PHP: $thing has no declared type, anything goes.
function describe($thing): string {
    return gettype($thing);
}`,
      ts: `// With "noImplicitAny" (part of strict), this is an ERROR:
function describe(thing): string { // 'thing' implicitly has an 'any' type
  return typeof thing;
}

// You must annotate it:
function describeOk(thing: unknown): string {
  return typeof thing;
}`,
      note:
        "PHP happily accepts an untyped parameter. strict mode refuses to let a parameter silently become 'any'.",
    },
    {
      label: "strictNullChecks: null must be handled, not assumed away",
      intro:
        "We want a function that turns a possibly-missing name into an uppercase initial. The interesting case is what happens when the name is actually null: does the code limp along, or is the null forced out into the open before use?",
      php: `<?php
declare(strict_types=1);

function initial(?string $name): string {
    // Nothing stops this at compile time. If $name is null, $name[0]
    // warns ("Trying to access array offset on null") and yields null,
    // and under strict_types strtoupper(null) then throws a TypeError.
    // (In coercive mode it's an 8.1 deprecation that returns "".)
    return strtoupper($name[0]);
}`,
      ts: `// With strictNullChecks, the compiler forces the guard:
function initial(name: string | null): string {
  if (name === null) return "?";
  return name[0].toUpperCase(); // safe: narrowed to string here
}`,
      note:
        "PHP's '?string' lets null through and only complains once it runs — a warning, then a TypeError under strict_types (an empty string in coercive mode). strictNullChecks makes the guard mandatory — at compile time.",
    },
    {
      label: "Import aliases: PSR-4 vs paths",
      intro:
        "We want to import a Money helper from the source tree using a short prefix instead of a long relative path. Each side configures that alias in its respective project file so the import reads cleanly.",
      php: `<?php
// composer.json
{
  "autoload": {
    "psr-4": { "App\\\\": "src/" }
  }
}
// then: use App\\Utils\\Money;`,
      ts: `// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
// then: import { Money } from "@/utils/money";`,
      note:
        "Both map a short prefix to a directory. PSR-4 drives the runtime autoloader; tsconfig 'paths' only informs the type checker (your bundler must mirror it).",
    },
  ],

  playground: {
    intro:
      "This snippet is only safe BECAUSE strictNullChecks is on. The early-return guard lets the compiler narrow the type, so the property access after it can't blow up. Try deleting the guard and watch the editor complain.",
    code: `// findUser may return null — strictNullChecks forces us to deal with it.
function findUser(id: number): { name: string } | null {
  const db: Record<number, { name: string }> = {
    1: { name: "ada" },
    2: { name: "linus" },
  };
  return db[id] ?? null;
}

function greet(id: number): string {
  const user = findUser(id);

  // GUARD: without strictNullChecks, TS would let us skip this and
  // 'user.name' could throw "Cannot read properties of null" at runtime.
  if (user === null) {
    return "Unknown user";
  }

  // After the guard, TS has NARROWED 'user' from
  // '{ name: string } | null' down to '{ name: string }'.
  // This access is now provably safe.
  return "Hello, " + user.name.toUpperCase();
}

console.log(greet(1)); // Hello, ADA
console.log(greet(99)); // Unknown user

// Try this: delete the 'if (user === null)' block above. With
// strictNullChecks on, the editor flags 'user.name' as possibly-null
// BEFORE you ever run the code — exactly the bug it's designed to stop.`,
  },

  keyPoints: [
    "`tsconfig.json` is the project's compiler control panel — it decides what's checked and what JS gets emitted.",
    "`strict: true` is one switch that enables a family of flags (`strictNullChecks`, `noImplicitAny`, and more). Turn it on day one.",
    "`strictNullChecks` is the headline: `null`/`undefined` stop being assignable to everything, so you must handle them explicitly.",
    "`target` picks the output JS version; `module`/`moduleResolution` decide how imports are emitted and resolved.",
    "`lib` exposes built-in type definitions (e.g. `DOM`); `esModuleInterop` smooths CommonJS imports; `paths` gives you import aliases.",
    "Unlike PHP's per-file `declare(strict_types=1)`, tsconfig is set once and enforced project-wide at compile time.",
  ],

  interview: [
    {
      q: "What does `strict: true` in tsconfig actually do?",
      a: "It's a convenience flag that enables a whole bundle of stricter checks at once, rather than you toggling each individually. The most important members are **`strictNullChecks`** (you must handle `null`/`undefined` instead of them being assignable everywhere) and **`noImplicitAny`** (a value the compiler can't infer a type for now errors instead of silently becoming `any`). It also turns on `strictFunctionTypes`, `strictPropertyInitialization`, `alwaysStrict`, and others. Coming from PHP, think of it as `declare(strict_types=1)` — but applied to the entire project, once, and enforced at compile time instead of runtime.",
    },
    {
      q: "Why is `strictNullChecks` such a big deal?",
      a: "Without it, `null` and `undefined` are assignable to *every* type — so a variable typed `string` might actually be `null` at runtime, and the compiler won't warn you. That's the source of the classic 'Cannot read properties of null' crash. With it on, `null` must be part of the type explicitly (`string | null`), and the compiler forces you to narrow it — via a guard, `?.`, or `??` — before you use the value. It's how TypeScript takes null-handling seriously, much like PHP's nullable `?string` types but with mandatory compile-time enforcement of the check.",
    },
    {
      q: "What's the difference between `target`, `module`, and `moduleResolution`?",
      a: "**`target`** is the JavaScript *language version* the compiler emits — set it to `ES2022` and your `async`/optional-chaining is left as-is rather than down-levelled to ancient syntax. It's like picking your minimum PHP version. **`module`** controls the *module syntax* of the output: `ESNext` keeps `import`/`export`, `CommonJS` rewrites to `require()`. **`moduleResolution`** is the algorithm the compiler uses to *find* the file an import points to: use `Bundler` for Vite/webpack apps, `NodeNext` for code run directly by Node. They answer three separate questions: which syntax, which module format, and how to locate files.",
    },
    {
      q: "What does `esModuleInterop` fix, and why is it almost always on?",
      a: "Many npm packages are CommonJS (they `module.exports = ...`). Without `esModuleInterop`, importing them as `import express from \"express\"` doesn't behave the way you'd expect — you'd be forced into `import * as express` and the default would be wrong. `esModuleInterop` makes the compiler emit helper code so default-importing a CommonJS module works intuitively. It's a small compatibility setting that removes a class of confusing import errors, which is why nearly every modern config enables it.",
    },
    {
      q: "How do `paths` compare to PHP's PSR-4 autoloading?",
      a: "Both map a short prefix to a directory so you can write clean imports instead of `../../../utils`. In PHP, the PSR-4 entry in `composer.json` (`\"App\\\\\": \"src/\"`) drives the *runtime autoloader* — it's what actually loads the class. In TypeScript, `paths` only teaches the *type checker* how to resolve `@/utils`; it does **not** rewrite the emitted JavaScript. That means your bundler (Vite/webpack) or runtime must be configured with the matching alias, or the build will resolve the import but the runtime won't find the file.",
    },
  ],

  quiz: [
    {
      question: "Which check is enabled by `strict: true` and is most responsible for forcing you to handle `null`?",
      options: [
        "esModuleInterop",
        "strictNullChecks",
        "moduleResolution",
        "skipLibCheck",
      ],
      answerIndex: 1,
      explain:
        "`strictNullChecks` removes `null`/`undefined` from being assignable to every type, so the compiler forces you to narrow or guard them before use. It's enabled as part of `strict: true`.",
    },
    {
      question: "What does the `target` compilerOption control?",
      options: [
        "How the compiler locates files behind an import",
        "Which directory import aliases point to",
        "The JavaScript language version the compiler emits",
        "Whether null checks are enforced",
      ],
      answerIndex: 2,
      explain:
        "`target` sets the JavaScript version of the emitted output (e.g. `ES2022`), deciding which syntax is kept or down-levelled. Locating files is `moduleResolution`; aliases are `paths`; null checks are `strictNullChecks`.",
    },
    {
      question: "Compared to PHP's `declare(strict_types=1)`, how does tsconfig's `strict` apply?",
      options: [
        "Per file, and checked at runtime",
        "Per file, and checked at compile time",
        "Once for the whole project, and checked at compile time",
        "Once for the whole project, and checked at runtime",
      ],
      answerIndex: 2,
      explain:
        "`declare(strict_types=1)` is per-file and enforced at runtime. tsconfig's `strict` is set once for the entire project and enforced at compile time, so it can't be forgotten on an individual file.",
    },
  ],
};

export default lesson;
