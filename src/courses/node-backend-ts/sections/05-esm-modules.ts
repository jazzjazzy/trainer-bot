import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "esm-modules",
  title: "ESM Imports vs require and Autoloading",
  part: "The Runtime Shift",
  estMinutes: 12,
  summary:
    "ESM imports are explicit file paths resolved once at process start — no autoloader, no lazy per-request loading — and because each module is evaluated exactly once, a module-level const is a free singleton.",

  concept: `
PHP solved code loading with **autoloading by convention**: you write
\`use App\\Service\\Mailer;\` and PSR-4 maps the namespace to a file path,
which is included lazily — per request — the first time the class is touched.
Node's ESM is the opposite on every axis: **explicit paths, static imports,
loaded once per process**.

### Imports are explicit, static, and hoisted

\`\`\`ts
// src/routes/users.ts
import { readFile } from "node:fs/promises"; // builtin — note the node: prefix
import express from "express";               // bare specifier → node_modules
import { createUser } from "./service.ts";   // relative path, explicit
\`\`\`

Three resolution rules replace PSR-4: \`node:*\` names a builtin, a bare name
resolves into \`node_modules\`, and your own code is imported by **relative
path** — there is no convention mapping \`App\\Service\` to \`src/Service\`;
the path *is* the address. Imports are also **static and hoisted**: they're
processed before any code in the module runs, must sit at top level (no
\`import\` inside an \`if\`), and that static shape is what lets \`tsc\` and
bundlers see the whole dependency graph. Dynamic loading exists as
\`await import("./plugin.ts")\` when you genuinely need it.

### Loaded once — the module cache is your service container

When the process starts, Node walks the import graph from your entrypoint,
evaluates each module **exactly once**, and caches its exports. Every other
importer gets the *same exports object* from the cache. Combine that with the
long-running process from section 1 and you get the pattern Node backends are
built on:

\`\`\`ts
// src/db.ts — evaluated once per process
import { Pool } from "pg";

export const pool = new Pool({ max: 10 }); // a singleton. That's it.
\`\`\`

Every file that imports \`pool\` shares the one instance for the life of the
process. In PHP you'd reach for a DI container with shared services to fake
this within a single request; in Node the module system *is* the container
for anything that has no per-request state.

### Named exports, default exports

\`\`\`ts
export function createUser() {}        // named — import { createUser }
export const MAX_PAGE_SIZE = 100;      // named
export default router;                 // default — import anything from "./x"
\`\`\`

Prefer named exports: they're checkable (typo → compile error) and rename-safe
across a codebase. Defaults are conventional for a module whose whole point is
one thing (an Express router, a config object).

### The CJS legacy you'll meet in interviews

Before ESM, Node had **CommonJS**: \`const x = require("./x")\` and
\`module.exports = {...}\`. It's synchronous, dynamic (call \`require\`
anywhere), and still what a lot of older code and interview questions assume.
Modern projects opt into ESM with \`"type": "module"\` in package.json and
never look back — and interop has mellowed: Node 22+ can even \`require()\`
ESM modules in many cases, so the two worlds coexist. Write ESM; *read* CJS.
`,

  comparisons: [
    {
      label: "PSR-4 autoloading vs explicit ESM imports",
      intro:
        "A controller pulls in a service class. PHP resolves the namespace to a file by convention and loads it lazily mid-request; Node loads the explicit path once at process start.",
      php: `<?php
// src/Controller/UserController.php
namespace App\\Controller;

// PSR-4 CONVENTION resolves this to src/Service/Mailer.php.
// The file is include()d lazily, per request, the first
// time Mailer is actually touched.
use App\\Service\\Mailer;

class UserController
{
    public function store(): void
    {
        $mailer = new Mailer(); // ← file loads HERE, at runtime
        $mailer->sendWelcome();
    }
}`,
      ts: `// src/controllers/user.ts

// The PATH is the address — no namespace convention,
// no autoloader, no composer dump-autoload.
// Static + hoisted: resolved and evaluated at process
// start, before any of this module's code runs.
import { Mailer } from "../services/mailer.ts";

export function store(): void {
  const mailer = new Mailer(); // module was already loaded
  mailer.sendWelcome();
}`,
      note:
        "PHP loads code lazily per request because each request rebuilds the world; Node front-loads the whole import graph once because the process lives on. A typo'd path fails at startup (or in tsc) — not on the first unlucky request.",
    },
    {
      label: "CJS require vs ESM import",
      intro:
        "The same module written both ways: legacy CommonJS as you'll see it in older codebases and interview questions, and the modern ESM you should write.",
      php: `// CommonJS (legacy) — logger.js
const pino = require("pino");

const logger = pino();

function logRequest(url) {
  logger.info({ url }, "request");
}

// export by assigning to module.exports
module.exports = { logger, logRequest };

// consumer:
// const { logRequest } = require("./logger");
// require is a normal function call — dynamic,
// synchronous, callable inside an if().`,
      ts: `// ESM (modern) — logger.ts, with "type": "module"
import { pino } from "pino";

export const logger = pino();

export function logRequest(url: string): void {
  logger.info({ url }, "request");
}

// consumer:
// import { logRequest } from "./logger.ts";
// Static and hoisted — analyzable by tsc/bundlers;
// dynamic cases use: await import("./logger.ts").
// Node 22+ can even require() ESM in many cases,
// so the two worlds interoperate.`,
      note:
        "Same module cache and singleton semantics in both systems — the differences are syntax and static analyzability. Opt into ESM with \"type\": \"module\" in package.json; write ESM, but be able to read CJS cold in interviews.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Shared services: DI container vs module cache",
      intro:
        "Making one database connection pool available everywhere. PHP wires a shared service into a container (rebuilt each request); Node exports a module-level const (built once per process).",
      php: `<?php
// PHP: the container fakes 'shared' WITHIN one request.
// Next request: container rebuilt, service re-created
// (persistent connections aside).
$container->set('db', function () {
    return new PDO(getenv('DSN'));
}, shared: true);

// consumers pull from the container:
$db = $container->get('db');`,
      ts: `// src/db.ts — Node: the module system IS the container.
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

// EVERY importer, in every file, for the process's whole
// life, receives this exact object from the module cache:
//   import { pool } from "./db.ts";
// One pool, warm connections, zero wiring.`,
      note:
        "Evaluated once + cached exports = singleton for free. The footgun from section 1 applies: this is perfect for stateless/shared infrastructure (pools, loggers, config), and exactly wrong for per-request state like the current user.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Module-cache semantics in miniature: the IIFE plays the role of db.ts, evaluated exactly once, with both 'importers' handed the same exports object. Predict all five lines — how many times does the evaluation message print, and what does the identity check say?",
    code: `// A module is evaluated ONCE per process, then cached. Simulate that:
// the IIFE below is "db.ts" — it runs a single time, and every import
// afterwards hands back the SAME exports object from the module cache.

const dbModule = (() => {
  console.log('evaluating db.ts (you see this once — not once per import)');
  const pool = { name: 'pg-pool', connections: 10, queries: 0 };
  const query = (sql: string): string => {
    pool.queries++;
    return \`[\${pool.name}] ran: \${sql}\`;
  };
  return { pool, query };
})();

// users.ts does:    import { query, pool } from './db.ts'
const usersModule = dbModule;
// orders.ts does:   import { query, pool } from './db.ts'
const ordersModule = dbModule;

console.log(usersModule.query('SELECT * FROM users'));
console.log(ordersModule.query('SELECT * FROM orders'));

// Both importers hold the exact same pool — a singleton with zero ceremony:
console.log('same pool object?', usersModule.pool === ordersModule.pool);
console.log('queries counted by the ONE pool:', dbModule.pool.queries);`,
  },

  keyPoints: [
    "ESM resolves by explicit address, not convention: `node:*` for builtins, bare names into node_modules, relative paths for your own files — no PSR-4, no autoloader.",
    "Imports are static and hoisted: top-level only, processed before the module's code runs, which is what makes the whole graph analyzable by tsc; `await import()` covers dynamic cases.",
    "The import graph loads ONCE at process start and each module's exports are cached — every importer shares the same objects, unlike PHP's lazy per-request includes.",
    "A module-level `export const pool = new Pool(...)` is a process-wide singleton for free — the module cache replaces the DI container for shared, stateless infrastructure.",
    "Prefer named exports (typo-checkable, rename-safe); default exports fit modules that ARE one thing, like an Express router.",
    "CJS (`require`/`module.exports`) is the legacy you must read fluently; `\"type\": \"module\"` opts your project into ESM, and Node 22+ can even `require()` ESM in many cases.",
  ],

  interview: [
    {
      q: "How does module loading in Node differ from PHP's autoloading?",
      a: "PHP loads code lazily by convention: PSR-4 maps a namespace like App\\Service\\Mailer to a file path, and the autoloader includes that file mid-request the first time the class is touched — then the whole world is discarded when the request ends. Node's ESM is the mirror image: imports are explicit paths rather than a convention, they're static and hoisted so the entire dependency graph is known before any code runs, and Node walks that graph once at process start, evaluating each module a single time and caching its exports for the process's lifetime. The practical consequences: a bad import fails at startup instead of on some unlucky request, tooling can analyze the full graph, and module-level state persists — which makes a module-level constant a deliberate design surface, not a throwaway.",
    },
    {
      q: "Why don't Node backends need a dependency-injection container for things like a database pool?",
      a: "Because the module cache already provides singleton semantics. A module is evaluated exactly once per process, so `export const pool = new Pool(...)` in db.ts creates one pool at startup, and every file that imports it receives the identical object from the cache for as long as the process lives. In PHP a container with shared services exists largely to simulate that within a request — everything is rebuilt on the next request anyway. The discipline that replaces the container is knowing what belongs at module scope: shared, stateless infrastructure like pools, loggers, and parsed config, yes; anything per-request like the current user, never — that's the cross-request bleed footgun. Teams still inject dependencies as function parameters for testability, but that's a design choice, not a framework requirement.",
    },
    {
      q: "What's the difference between CommonJS and ESM, and which should a new project use?",
      a: "CommonJS is Node's original system: require() is a normal synchronous function you can call anywhere, and you export by assigning to module.exports. ESM is the JavaScript-standard system: import/export statements that are static and hoisted, top-level only, resolved before execution — which enables type checking of the graph, tree-shaking, and top-level await. Both share the same evaluate-once module cache. A new project should set \"type\": \"module\" and write pure ESM; that's where the ecosystem and tooling are. But CJS fluency still matters: older codebases and plenty of interview snippets use require, and interop is a solved problem — ESM can import most CJS packages directly, and Node 22+ can even require() ESM modules in many cases.",
    },
  ],

  quiz: [
    {
      question:
        "Five different files import `pool` from db.ts, which contains `export const pool = new Pool(...)`. How many pools exist in the process?",
      options: [
        "Five — one per importing file",
        "One — the module is evaluated once and its cached exports are shared by every importer",
        "One per request, like PHP's container",
        "It depends on the order the files are imported",
      ],
      answerIndex: 1,
      explain:
        "Node evaluates each module a single time when first reached in the import graph, caches the exports object, and hands that same object to every importer. Combined with the long-running process, a module-level const is a process-wide singleton — the pattern Node backends use for pools, loggers, and config.",
    },
    {
      question: "Which statement about ESM imports is true?",
      options: [
        "They can be placed inside an if-block to load code conditionally",
        "They are resolved lazily, the first time the imported value is used",
        "They are static and hoisted — processed before the module's code runs, top-level only",
        "They resolve namespaces to file paths using PSR-4-style conventions",
      ],
      answerIndex: 2,
      explain:
        "Static, hoisted, top-level-only imports are what make the module graph analyzable by tsc and bundlers, and they load at process start — not lazily like PHP's autoloader. Conditional and lazy loading is spelled `await import(...)`. Resolution uses explicit paths and node_modules, never a namespace convention.",
    },
    {
      question:
        "In a modern Node codebase you encounter `const { readFile } = require('fs')`. What does this tell you?",
      options: [
        "The file is broken — require no longer exists in Node",
        "It's CommonJS, the legacy module system — modern ESM would be `import { readFile } from \"node:fs/promises\"`",
        "require is the only way to load Node builtins",
        "This file must be TypeScript, since require is a TS feature",
      ],
      answerIndex: 1,
      explain:
        "require/module.exports is CommonJS — still fully supported and common in older code, but new projects set \"type\": \"module\" and use import/export. The modern line also adds the node: prefix for builtins and prefers the promise-based fs API. Reading CJS fluently remains an interview expectation.",
    },
  ],
};

export default lesson;
