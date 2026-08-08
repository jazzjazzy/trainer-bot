import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "npm-ecosystem",
  title: "npm, @types & the Package Ecosystem",
  part: "Ecosystem & Interview",
  estMinutes: 13,
  summary:
    "How npm, semver ranges, the lockfile, and @types packages map onto the Composer/Packagist world you already navigate every day.",

  concept: `
You already run \`composer require\`, read \`composer.json\`, commit \`composer.lock\`,
and trust PSR-4 autoloading to find your classes. The JavaScript world has the
exact same machinery under different names — plus one extra wrinkle that has no
PHP equivalent: **type packages**.

### The registry: npmjs vs Packagist

PHP packages live on **Packagist** and are installed by **Composer**. JavaScript
packages live on the **npm registry** (npmjs.com) and are installed by the **npm**
CLI (or \`pnpm\` / \`yarn\`, which talk to the same registry). Same concept: a public
index of versioned packages you pull into your project.

\`\`\`bash
composer require guzzlehttp/guzzle   # PHP
npm install axios                    # JS/TS
\`\`\`

### dependencies vs devDependencies

\`package.json\` splits packages just like Composer's \`require\` / \`require-dev\`:

- **\`dependencies\`** — needed at runtime (e.g. \`react\`, \`axios\`).
- **\`devDependencies\`** — only needed to build/test (e.g. \`typescript\`, \`vitest\`,
  and crucially **all \`@types/*\` packages**, since types are erased at build time).

\`\`\`bash
npm install react          # -> dependencies
npm install -D typescript  # -> devDependencies (-D == --save-dev)
\`\`\`

### Semver ranges: ^, ~, exact

npm uses the same **semver** scheme Composer does (\`MAJOR.MINOR.PATCH\`):

| Range     | Meaning                          | Allows           |
|-----------|----------------------------------|------------------|
| \`^1.2.3\`  | compatible (no major bump)       | \`>=1.2.3 <2.0.0\` |
| \`~1.2.3\`  | patch-level only                 | \`>=1.2.3 <1.3.0\` |
| \`1.2.3\`   | exact pin                        | only \`1.2.3\`     |

\`^\` is npm's default and matches Composer's \`^\` exactly.

### The lockfile

\`package-lock.json\` is the twin of \`composer.lock\`: it records the **exact**
resolved version of every package and transitive dependency so installs are
reproducible. **Commit it.** \`npm ci\` installs strictly from the lock, the way
\`composer install\` does.

### @types/* and DefinitelyTyped — the PHP-less part

Many JS libraries are written in plain JavaScript and ship **no type information**.
The community publishes types separately on **DefinitelyTyped**, exposed as
\`@types/<package>\` (e.g. \`@types/lodash\`). Modern libraries (axios, React) bundle
their own \`.d.ts\` declarations, so no \`@types\` package is needed. PHP has no real
equivalent — a library either carries enough type hints in its source or it
doesn't; there's no separate "types-only" companion package.

### npx — run without installing

\`npx\` downloads and runs a package's binary on demand, no global install:

\`\`\`bash
npx create-vite my-app   # fetch + run, then it's gone
\`\`\`
`,

  comparisons: [
    {
      label: "The registry & install command",
      intro:
        "You want to pull a logging library into your project. Here's the one command that fetches it from the public index and records it in your manifest — once in each ecosystem.",
      php: `# Packagist + Composer
composer require monolog/monolog`,
      ts: `# npm registry + npm CLI
npm install pino`,
      note:
        "Same idea, different index: Packagist for PHP, npmjs.com for JS/TS. Both resolve semver and write a manifest.",
    },
    {
      label: "The manifest file",
      intro:
        "A project that needs an HTTP client at runtime plus a test/build toolchain only developers use. Here's how each ecosystem declares those two groups of dependencies in its manifest.",
      php: `// composer.json
{
  "require": {
    "guzzlehttp/guzzle": "^7.8"
  },
  "require-dev": {
    "phpunit/phpunit": "^11.0"
  }
}`,
      ts: `// package.json
{
  "dependencies": {
    "axios": "^1.7.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}`,
      note:
        "require/require-dev map directly to dependencies/devDependencies. Note @types/* always live in devDependencies.",
    },
    {
      label: "The lockfile",
      intro:
        "You're installing dependencies in CI and need every machine to get the exact same versions. Here's the committed lockfile and the install command that obeys it precisely.",
      php: `// composer.lock (committed, machine-generated)
composer install   // honours the lock exactly`,
      ts: `// package-lock.json (committed, machine-generated)
npm ci   // installs strictly from the lock`,
      note:
        "Both pin exact resolved versions for reproducible builds. composer install ≈ npm ci.",
    },
    {
      label: "Finding code: autoload vs resolution",
      intro:
        "Your code refers to a class or module by name — how does the runtime know which file that name points to? Here's how each ecosystem turns an import into an actual file on disk.",
      php: `// PSR-4 in composer.json maps namespaces to dirs
{
  "autoload": {
    "psr-4": { "App\\\\": "src/" }
  }
}
// then: use App\\Service\\Mailer;`,
      ts: `// node resolution: import by package or path
import axios from "axios";          // node_modules
import { Mailer } from "./service"; // relative path`,
      note:
        "PSR-4 maps namespaces to folders via a config rule; Node resolves bare names from node_modules and paths relatively — no central map needed.",
    },
    {
      label: "Where do the types come from?",
      intro:
        "You install a third-party library and want the editor to know its shapes. This shows where those type definitions actually live, and when you need to install an extra package to get them.",
      php: `# PHP: types are inline in the source.
# A library either has type hints or it doesn't —
# there is no separate types-only package.
composer require nesbot/carbon`,
      ts: `# JS lib with no built-in types -> add @types
npm install lodash
npm install -D @types/lodash

# Modern lib that bundles its own .d.ts -> nothing extra
npm install axios`,
      note:
        "This is the one concept with no PHP analogue: @types/* from DefinitelyTyped patch types onto untyped JS libraries.",
    },
  ],

  playground: {
    intro:
      "No real packages here — just a typed semver parser, the scheme both Composer and npm use. Run it, then try feeding it a malformed string.",
    code: `// A typed representation of a parsed semantic version.
interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(version: string): SemVer {
  // Strip a leading range operator like ^ or ~ if present.
  const cleaned = version.replace(/^[\\^~]/, "");
  const parts = cleaned.split(".");

  if (parts.length !== 3) {
    throw new Error(\`Not a valid semver: "\${version}"\`);
  }

  const [major, minor, patch] = parts.map((p) => {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(\`Bad version segment: "\${p}"\`);
    }
    return n;
  });

  return { major, minor, patch };
}

const examples = ["^1.7.0", "~5.6.3", "22.0.0"];
for (const v of examples) {
  const parsed = parseSemver(v);
  console.log(\`\${v} -> major \${parsed.major}, minor \${parsed.minor}, patch \${parsed.patch}\`);
}

// Uncomment to see the typed error path:
// console.log(parseSemver("not.a.version"));`,
  },

  keyPoints: [
    "**npm registry** ↔ Packagist, **npm CLI** ↔ Composer — same job, different names.",
    "`dependencies` / `devDependencies` map to Composer's `require` / `require-dev`; **all `@types/*` go in devDependencies**.",
    "Semver ranges match Composer: `^` = no major bump, `~` = patch only, bare = exact pin.",
    "`package-lock.json` ↔ `composer.lock` — commit it; `npm ci` ≈ `composer install`.",
    "`@types/*` from **DefinitelyTyped** add types to untyped JS libs — a concept PHP has no equivalent for.",
    "`npx` runs a package binary on demand without a permanent install (great for scaffolding tools).",
  ],

  interview: [
    {
      q: "Coming from Composer, how would you explain npm and package.json?",
      a: "npm is to JavaScript what Composer is to PHP. `package.json` is the equivalent of `composer.json` — it declares `dependencies` (runtime, like `require`) and `devDependencies` (build/test only, like `require-dev`). `package-lock.json` is the twin of `composer.lock`: a machine-generated file pinning exact resolved versions for reproducible installs, which you **commit**. In CI you run `npm ci` (strict, lockfile-only) rather than `npm install`, just as you'd run `composer install`.",
    },
    {
      q: "What are @types packages and why do they exist?",
      a: "Many JS libraries are plain JavaScript with **no type information**. To use them safely in TypeScript, the community maintains **DefinitelyTyped**, a repo of hand-written declaration files published as `@types/<package>` (e.g. `@types/lodash`). You install them as **devDependencies** because types are erased at build time. Modern libraries (React, axios) **bundle their own `.d.ts`** files, so they need no separate `@types` package. PHP has no analogue — a library's type hints live in its own source.",
    },
    {
      q: "Explain the difference between ^, ~, and an exact version.",
      a: "These are semver ranges, identical to Composer's. `^1.2.3` allows anything up to (but not including) the next **major** — `>=1.2.3 <2.0.0` — trusting semver's promise that minors/patches are backward compatible. `~1.2.3` is stricter: patch updates only, `>=1.2.3 <1.3.0`. A bare `1.2.3` pins that **exact** version. `^` is npm's default. The lockfile then records the single concrete version actually installed within whatever range you allowed.",
    },
    {
      q: "What does npx do, and when would you use it?",
      a: "`npx` fetches and executes a package's binary on demand without installing it into your project or globally. It's ideal for one-off or scaffolding commands — `npx create-vite my-app`, `npx tsc --init`. It saves you from polluting global installs with tools you run once. The closest PHP feeling is running a one-off via `composer create-project`, but `npx` is more general: it can run any package that exposes a bin.",
    },
  ],

  quiz: [
    {
      question: "Where should a `@types/lodash` package be installed?",
      options: [
        "In dependencies, alongside lodash",
        "In devDependencies",
        "Globally with npm install -g",
        "It doesn't need installing; types are automatic",
      ],
      answerIndex: 1,
      explain:
        "Type declarations are only used at build time and erased from the output, so @types/* packages belong in devDependencies.",
    },
    {
      question: "What does the range `^2.3.4` allow npm to install?",
      options: [
        "Only exactly 2.3.4",
        ">=2.3.4 and <2.4.0 (patches only)",
        ">=2.3.4 and <3.0.0 (no major bump)",
        "Any 2.x or 3.x version",
      ],
      answerIndex: 2,
      explain:
        "^ permits updates that don't change the major version: >=2.3.4 <3.0.0. ~ would be the patch-only range.",
    },
    {
      question:
        "Which Composer file is `package-lock.json` most analogous to?",
      options: [
        "composer.json",
        "composer.lock",
        "the autoload.php file",
        "the vendor/ directory",
      ],
      answerIndex: 1,
      explain:
        "package-lock.json pins exact resolved versions for reproducible installs, exactly like composer.lock. composer.json maps to package.json.",
    },
  ],
};

export default lesson;
