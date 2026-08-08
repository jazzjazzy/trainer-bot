import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "setup-and-tooling",
  title: "Setup & Tooling",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "How the TypeScript toolchain — Node, npm, tsc, tsconfig.json and runners like Vite and tsx — maps onto the PHP interpreter and Composer workflow you already know.",

  concept: `
You already have a mental model for all of this; the names are just different.
In PHP you have the **\`php\` interpreter** that runs a file directly, and
**Composer** that manages dependencies. In the TypeScript world the runtime is
**Node.js**, the package manager is **npm**, and there is an extra **compile
step**, because types aren't valid JavaScript — they have to be stripped out
before the code can run.

### Node.js & npm vs the PHP interpreter & Composer

- **Node.js** is the JavaScript runtime — the rough equivalent of the \`php\`
  binary. It executes JavaScript, not TypeScript.
- **npm** ships with Node and plays the role of **Composer**: it reads a
  manifest, downloads packages, and records exact versions in a lock file.

\`\`\`
PHP world:  php (interpreter)  +  composer (packages)
TS world:   node (runtime)     +  npm (packages)  +  tsc (compiler)
\`\`\`

### package.json vs composer.json

\`package.json\` is your \`composer.json\`: it lists dependencies, dev
dependencies, metadata, and **scripts**. \`npm install\` writes
\`package-lock.json\` (your \`composer.lock\`) pinning the exact dependency tree.

### The tsc compiler and tsconfig.json

\`tsc\` is the TypeScript compiler. It reads **\`tsconfig.json\`** — a project-wide
config with no PHP equivalent — to know which files to compile and how strict to
be:

\`\`\`json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
\`\`\`

### How you actually run TypeScript

Recent Node (v22.18+ / v23.6+) **can** strip types and run \`node app.ts\`
directly — but it only **erases** types without checking them, and rejects
non-erasable syntax (enums, namespaces with runtime code, parameter
properties). For convenience and real type-checking you still typically reach
for a runner. Your options:

- **\`tsx\` / \`ts-node\`** — run a file directly for scripts: \`npx tsx app.ts\`.
  They compile in memory, then execute.
- **Vite** — the standard for front-end apps. \`npm run dev\` gives a
  hot-reloading dev server; \`npm run build\` emits optimized JS.

### node_modules vs vendor, and npm scripts

\`node_modules/\` is \`vendor/\`: the installed-packages folder, git-ignored and
rebuilt from the lock file. **npm scripts** are \`composer\`'s \`scripts\` block —
named commands you run with \`npm run <name>\`.
`,

  comparisons: [
    {
      label: "The manifest file",
      intro:
        "Here we declare a project's dependencies and a test script in its manifest. The goal is to see that a package.json carries the same information a composer.json does.",
      php: `// composer.json
{
  "require": {
    "monolog/monolog": "^3.0"
  },
  "require-dev": {
    "phpunit/phpunit": "^11.0"
  },
  "scripts": {
    "test": "phpunit"
  }
}`,
      ts: `// package.json
{
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "scripts": {
    "test": "vitest"
  }
}`,
      note:
        "Same idea: runtime deps, dev-only deps, and named scripts. TypeScript itself is just a devDependency.",
    },
    {
      label: "Installing dependencies",
      intro:
        "We run the one command that turns a manifest into an actual on-disk set of packages. Expect each tool to resolve versions, write a lock file, and populate its install folder.",
      php: `# Reads composer.json, writes composer.lock,
# downloads into vendor/
composer install`,
      ts: `# Reads package.json, writes package-lock.json,
# downloads into node_modules/
npm install`,
      note:
        "Both resolve and pin versions in a lock file. Commit the lock file; never commit the install folder.",
    },
    {
      label: "The installed-packages folder",
      intro:
        "This shows where installed code actually lives and how you pull a package into your own file. The takeaway is what the folder is called and how loading it works in each ecosystem.",
      php: `vendor/
# Git-ignored. Rebuilt with:
#   composer install
require __DIR__ . '/vendor/autoload.php';`,
      ts: `node_modules/
# Git-ignored. Rebuilt with:
#   npm install
import { z } from "zod";`,
      note:
        "vendor/ needs an explicit autoload require; node_modules resolution is automatic via import/require.",
    },
    {
      label: "Running a single script file",
      intro:
        "We just want to execute one standalone script from the terminal. In PHP that is a single direct command, while in TypeScript you reach for a runner that compiles the file before it runs.",
      php: `# Recent Node can strip types and run .ts, but
# without type-checking — so PHP's direct execution
# maps most closely to a TS runner:
php script.php`,
      ts: `# tsx compiles in memory then runs it:
npx tsx script.ts`,
      note:
        "Recent Node (v22.18+/v23.6+) can run node script.ts by stripping types, but it doesn't type-check and only handles erasable syntax — so tsx (or ts-node) is still preferred for ergonomics and checking.",
    },
    {
      label: "Named project commands",
      intro:
        "Here we invoke a reusable command, like the test script, that the manifest defines by name. The result is the same task run through each tool's script runner.",
      php: `# composer.json -> "scripts"
composer run-script test
# or the shorthand:
composer test`,
      ts: `# package.json -> "scripts"
npm run test
# a few names get a shorthand:
npm test`,
      note:
        "Both define reusable commands in the manifest. npm run <name> is the general form; test/start are shortcuts.",
    },
  ],

  playground: {
    intro:
      "A typed config object — the kind of thing you'd model from a tsconfig or app settings. Run it, then try setting strict to the string \"yes\" and watch the editor flag it before you run.",
    code: `// A strongly-typed project configuration.
interface ProjectConfig {
  name: string;
  target: "ES2020" | "ES2022" | "ESNext";
  strict: boolean;
  outDir: string;
  dependencies: string[];
}

const config: ProjectConfig = {
  name: "react-trainer",
  target: "ES2022",
  strict: true,
  outDir: "dist",
  dependencies: ["zod", "vitest", "typescript"],
};

// Derive values from the typed config — autocomplete works on every field.
console.log(\`Project: \${config.name}\`);
console.log(\`Compiling \${config.dependencies.length} deps to ./\${config.outDir}\`);
console.log(\`Strict mode is \${config.strict ? "ON" : "off"} (target \${config.target})\`);

// Try uncommenting — TypeScript rejects an unknown target before you run:
// config.target = "ES1999";`,
  },

  keyPoints: [
    "**Node.js** is the runtime (like the `php` binary); **npm** is the package manager (like Composer).",
    "`package.json` ≈ `composer.json`; `package-lock.json` ≈ `composer.lock`; `node_modules/` ≈ `vendor/`.",
    "`tsc` is the compiler and `tsconfig.json` is its project-wide config — there is no PHP equivalent for the config file.",
    "You can't run `.ts` files directly. Use **`tsx`/`ts-node`** for scripts or **Vite** for apps.",
    "**npm scripts** are Composer's `scripts` block: `npm run <name>` runs a named command.",
    "Commit the lock file; git-ignore `node_modules/` and rebuild it with `npm install`.",
  ],

  interview: [
    {
      q: "Coming from Composer, how does npm and package.json compare?",
      a: "They map almost one-to-one. `package.json` is `composer.json` — it declares `dependencies` and `devDependencies` and a `scripts` block. `npm install` is `composer install`: it resolves the tree, downloads into `node_modules/` (the `vendor/` equivalent), and writes `package-lock.json` (the `composer.lock` equivalent) pinning exact versions. The convention is identical: commit the lock file, git-ignore the install folder.",
    },
    {
      q: "Why can't you run a .ts file the way you run a .php file?",
      a: "Because at the runtime level Node.js only understands JavaScript — types aren't valid JS, so they must be erased before the code runs. Recent Node (v22.18+/v23.6+) can do this itself: `node app.ts` strips the types and runs it, but only for erasable syntax and **without** type-checking. To actually catch type errors you still run a tool that compiles-then-runs (`npx tsx app.ts` or `ts-node`), or compile ahead of time with `tsc` and run the emitted `.js`. Either way, the conceptual point holds: types get erased and it's JavaScript that executes. PHP has no such step because the interpreter parses the typed source directly.",
    },
    {
      q: "What is tsconfig.json and what goes in it?",
      a: "It's the project-wide compiler configuration — TypeScript's most important file, with no direct PHP analogue. Key `compilerOptions` include `target` (which JS version to emit), `module` (the module system), `outDir` (where compiled JS goes), and `strict` (turn on all the strict checks). It also has `include`/`exclude` to say which files to compile. Compare it to `declare(strict_types=1)`, except it's set once for the whole project instead of per file.",
    },
    {
      q: "What's the difference between dependencies and devDependencies?",
      a: "It mirrors `require` vs `require-dev` in Composer. `dependencies` are needed at runtime (e.g. a validation library shipped with your app); `devDependencies` are only needed during development or the build (e.g. `typescript` itself, test runners, linters). `npm install` grabs both locally; a production install (`npm install --omit=dev`) skips dev deps to keep the deployed footprint small.",
    },
    {
      q: "How does Vite fit in, and how is it different from tsx?",
      a: "Both spare you from running `tsc` by hand, but for different jobs. **`tsx`/`ts-node`** are for one-off scripts or back-end Node code — run a single `.ts` file and exit. **Vite** is a dev server and bundler for front-end apps: `npm run dev` gives hot module reloading while you code, and `npm run build` produces optimized, minified JS for production. Vite uses esbuild for fast transpiling and typically leaves full type-checking to `tsc --noEmit` in CI.",
    },
  ],

  quiz: [
    {
      question: "Which command is the TypeScript-world equivalent of `composer install`?",
      options: ["tsc install", "npm install", "node install", "npx setup"],
      answerIndex: 1,
      explain:
        "npm install reads package.json, downloads into node_modules/, and writes package-lock.json — exactly mirroring composer install / vendor / composer.lock.",
    },
    {
      question: "Why historically couldn't you run `node app.ts` the way you run `php app.php`, and what does modern Node do?",
      options: [
        "Node only runs files ending in .js, never any other extension",
        "Node understands only JavaScript, so TypeScript must be compiled first",
        "You must run `composer install` before Node will accept TypeScript",
        "TypeScript files have to be encoded in UTF-16 for Node",
      ],
      answerIndex: 1,
      explain:
        "Node.js executes JavaScript, not TypeScript, so the types have to be removed first. Recent Node (v22.18+/v23.6+) now does this itself by stripping types (no type-checking, erasable syntax only); ahead-of-time `tsc` or on-the-fly tsx/ts-node still do the full job.",
    },
    {
      question: "Which file configures the TypeScript compiler for a project?",
      options: ["package.json", "composer.json", "tsconfig.json", "node_modules.json"],
      answerIndex: 2,
      explain:
        "tsconfig.json holds compilerOptions like target, module, outDir and strict, plus include/exclude. package.json manages dependencies and scripts, not compiler behavior.",
    },
  ],
};

export default lesson;
