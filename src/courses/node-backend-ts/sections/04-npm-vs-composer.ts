import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "npm-vs-composer",
  title: "npm vs Composer",
  part: "The Runtime Shift",
  estMinutes: 10,
  summary:
    "package.json is composer.json, package-lock.json is composer.lock, node_modules is vendor/ — plus three ideas Composer never gave you: the scripts task runner, dev vs prod dependency splits, and npm ci for byte-reproducible installs.",

  concept: `
This is the section where 25 years of PHP pays off directly: you already
understand dependency management — you just need the name translations, plus
the handful of npm ideas that have no Composer equivalent.

### The direct mapping

| Composer world | npm world |
| --- | --- |
| \`composer.json\` | \`package.json\` |
| \`composer.lock\` | \`package-lock.json\` |
| \`vendor/\` | \`node_modules/\` |
| \`composer install\` | \`npm install\` (or \`npm ci\` — see below) |
| \`composer require foo/bar\` | \`npm install bar\` |
| \`composer require --dev foo\` | \`npm install -D foo\` |
| \`vendor/bin/phpunit\` | \`npx vitest\` |
| \`composer dump-autoload\` | (nothing — no autoloader, see section 05) |

Same philosophy everywhere: the manifest declares *ranges*, the lockfile pins
*exact resolved versions*, the install directory is disposable and **never
committed** — \`node_modules/\` is your \`vendor/\`, only bigger.

### semver ranges: ^ and ~

npm ranges are terser than Composer's but mean the same things:

- \`"express": "^5.2.0"\` — any \`5.x\` from 5.2.0 up, never 6. (Composer:
  \`^5.2\`.) This is the default \`npm install\` writes.
- \`"pino": "~10.1.0"\` — patch releases only: \`10.1.x\`. (Composer: \`~10.1.0\`.)

The lockfile is what makes ranges safe: teammates and CI don't re-resolve
ranges, they install the locked graph. Commit \`package-lock.json\` always —
same rule as \`composer.lock\`.

### What Composer never gave you

**The \`scripts\` block is a task runner.** Where a PHP project accretes a
Makefile or bash scripts, an npm project centralizes its verbs:

\`\`\`json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
\`\`\`

\`npm run dev\` runs the entry with \`node_modules/.bin\` on the PATH — that's
why bare \`tsx\` works there, just like \`vendor/bin\` juggling but automatic.

**\`dependencies\` vs \`devDependencies\`.** Runtime needs (express, pg, zod)
vs build/dev tooling (typescript, tsx, vitest). Production installs use
\`npm ci --omit=dev\` — the analogue of \`composer install --no-dev\`.

**\`npm ci\`** — the CI/deploy installer. It deletes \`node_modules\`, installs
*exactly* the lockfile, and **fails** if lockfile and \`package.json\`
disagree, instead of quietly "fixing" things like \`npm install\` would.
Reproducible builds, guaranteed.

### Two fields to set on day one

\`\`\`json
{
  "type": "module",
  "engines": { "node": ">=22" }
}
\`\`\`

\`"type": "module"\` makes \`.js\`/\`.ts\` files ESM (\`import\`/\`export\`) —
required for everything in section 05. \`engines\` documents the Node version
floor, like Composer's \`"php": ">=8.2"\` platform requirement.
`,

  comparisons: [
    {
      label: "The manifest: composer.json vs package.json",
      intro:
        "The same small API project declared in each ecosystem: a web framework and a DB driver at runtime, a test runner and type tooling for dev only, a version floor for the runtime.",
      php: `{
  "name": "acme/invoice-api",
  "require": {
    "php": ">=8.2",
    "slim/slim": "^4.12",
    "ext-pdo": "*"
  },
  "require-dev": {
    "phpunit/phpunit": "^11.0"
  },
  "autoload": {
    "psr-4": { "Acme\\\\": "src/" }
  },
  "scripts": {
    "test": "phpunit"
  }
}`,
      ts: `{
  "name": "invoice-api",
  "type": "module",
  "engines": { "node": ">=22" },
  "dependencies": {
    "express": "^5.2.0",
    "pg": "^8.16.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "tsx": "^4.20.0",
    "vitest": "^3.2.0"
  },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}`,
      note:
        "require/require-dev map to dependencies/devDependencies; engines maps to the php platform requirement. Two things have no Composer twin: \"type\": \"module\" selects the module system, and there's no autoload block — imports use explicit paths instead.",
      leftLang: "json",
      rightLang: "json",
    },
    {
      label: "Daily commands, translated",
      intro:
        "The everyday dependency workflow, side by side. Every Composer verb has an npm twin; the flags differ more than the ideas.",
      php: `# fresh clone → install locked deps
composer install

# add a runtime package (updates json + lock)
composer require guzzlehttp/guzzle

# add a dev-only package
composer require --dev phpunit/phpunit

# update within declared ranges (rewrites lock)
composer update

# run a vendored binary
vendor/bin/phpunit

# production install
composer install --no-dev --optimize-autoloader`,
      ts: `# fresh clone → install locked deps
npm install

# add a runtime package (updates json + lock)
npm install got

# add a dev-only package
npm install -D vitest

# update within declared ranges (rewrites lock)
npm update

# run a vendored binary (looks in node_modules/.bin)
npx vitest

# production / CI install: exact lockfile or fail
npm ci --omit=dev`,
      note:
        "The one habit to change: on CI and deploys use npm ci, not npm install — it installs the lockfile verbatim and errors on any manifest/lockfile drift, where npm install would silently re-resolve and rewrite the lock.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "What gets committed",
      intro:
        "Same discipline, new names: manifest and lockfile in git, the installed tree ignored and rebuilt anywhere from the lock.",
      php: `# .gitignore (PHP)
/vendor/

# committed:
#   composer.json   — declared ranges
#   composer.lock   — exact resolved versions
# vendor/ is disposable: composer install
# rebuilds it identically from the lock.`,
      ts: `# .gitignore (Node)
/node_modules/
/dist/

# committed:
#   package.json        — declared ranges + scripts
#   package-lock.json   — exact resolved graph
# node_modules/ is disposable: npm ci rebuilds it
# identically from the lock (dist/ is build output).`,
      note:
        "node_modules is famously huge because npm nests transitive deps rather than flattening like Composer — all the more reason it's never committed. The lockfile IS committed; it's the reproducibility contract.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "A fresh-clone workflow: install, run the dev script, then a CI-style install after the lockfile was hand-edited out of sync. Predict each result — especially what npm ci does that npm install would not.",
    code: `# 1) fresh clone of invoice-api
npm install

# 2) start the dev server via the scripts block
npm run dev

# 3) later, in CI: package.json was edited to express ^5.3.0
#    but package-lock.json was NOT regenerated. Then:
npm ci`,
    output: `$ npm install
added 87 packages, and audited 88 packages in 3s
found 0 vulnerabilities

$ npm run dev

> invoice-api@1.0.0 dev
> tsx watch src/server.ts

API listening on http://localhost:3000
# npm run put node_modules/.bin on PATH — bare "tsx" resolved,
# exactly like vendor/bin without typing vendor/bin.

$ npm ci
npm error code EUSAGE
npm error
npm error \`npm ci\` can only install packages when your
npm error package.json and package-lock.json or npm-shrinkwrap.json
npm error are in sync. Please update your lock file with
npm error \`npm install\` before continuing.
npm error
npm error Invalid: lock file's express@5.2.0 does not
npm error satisfy express@5.3.0
# npm install would have silently re-resolved and rewritten
# the lock. npm ci refuses — drift fails the build instead
# of shipping surprise versions.`,
  },

  keyPoints: [
    "Direct mapping: package.json ≈ composer.json, package-lock.json ≈ composer.lock, node_modules/ ≈ vendor/, `npm install` ≈ `composer install`, npx ≈ vendor/bin.",
    "Commit the lockfile, never node_modules — the manifest declares ranges, the lock pins the exact resolved graph so every machine installs identically.",
    "semver ranges: `^5.2.0` allows any 5.x ≥ 5.2.0 (minor+patch); `~10.1.0` allows patches only (10.1.x).",
    "The `scripts` block is the project task runner — `npm run x` executes with node_modules/.bin on PATH, replacing the Makefile a PHP project would grow.",
    "`dependencies` vs `devDependencies` mirrors require vs require-dev; production installs use `npm ci --omit=dev` like `composer install --no-dev`.",
    "`npm ci` is for CI/deploys: installs the lockfile exactly and FAILS on manifest/lockfile drift, where `npm install` would silently re-resolve; set `\"type\": \"module\"` and `engines` on day one.",
  ],

  interview: [
    {
      q: "What is package-lock.json for, and why is node_modules never committed?",
      a: "package.json declares version ranges — express ^5.2.0 means any compatible 5.x — so two installs at different times could resolve different versions. package-lock.json records the exact version, resolved URL, and integrity hash of every package in the full transitive graph, so every developer and every CI run installs an identical tree; it's committed for the same reason composer.lock is. node_modules is the opposite: it's the disposable materialization of the lockfile — hundreds of megabytes of third-party code that npm ci can rebuild identically anywhere in seconds. Committing it would bloat the repo, generate unreviewable diffs, and can even break across platforms because some packages compile native binaries per OS.",
    },
    {
      q: "When do you use npm ci instead of npm install?",
      a: "npm install is for development machines: it resolves ranges, installs, and updates package-lock.json when you add or change dependencies — like composer require/update. npm ci is for CI and deployments: it deletes node_modules, installs exactly what the lockfile specifies, never writes to the lockfile, and hard-fails if package.json and the lock disagree. That failure mode is the feature — if someone edits a dependency range without regenerating the lock, npm install would quietly re-resolve and paper over it, while npm ci turns the drift into a red build. So: humans run npm install, machines run npm ci, and production adds --omit=dev to skip devDependencies, the analogue of composer install --no-dev.",
    },
    {
      q: "How does npm's scripts block compare to how PHP projects run project tasks?",
      a: "PHP projects usually spread tasks across a Makefile, bash scripts, and composer scripts; npm projects conventionally centralize everything in the scripts block — dev, build, test, typecheck, lint become npm run dev, npm run build, and so on. Two things make it more than string aliases: npm run prepends node_modules/.bin to PATH, so locally installed binaries like tsx or vitest run without a vendor/bin-style path, meaning the project's toolchain is versioned with the project rather than installed globally; and the names are ecosystem-standard, so any Node developer or CI template knows npm test and npm run build will do the right thing on an unfamiliar repo. Composer's scripts section is the closest analogue, but in Node it's the primary interface to the project, not an afterthought.",
    },
  ],

  quiz: [
    {
      question:
        "With \"express\": \"^5.2.0\" in package.json, which versions can a fresh resolution install?",
      options: [
        "Exactly 5.2.0 only",
        "5.2.0 up to (but not including) 6.0.0",
        "Any 5.2.x patch release only",
        "Anything 5.2.0 or newer, including 6.x",
      ],
      answerIndex: 1,
      explain:
        "Caret ranges accept minor and patch updates within the same major version — semver's compatible-changes promise, same as Composer's ^. Patch-only pinning is tilde (~5.2.0), and nothing crosses a major boundary automatically. Day to day the lockfile pins the exact version anyway.",
    },
    {
      question:
        "package.json was edited to bump a dependency, but package-lock.json wasn't regenerated. What happens in CI with npm ci vs npm install?",
      options: [
        "Both install the package.json version",
        "Both install the lockfile version",
        "npm ci fails with a sync error; npm install would silently re-resolve and rewrite the lockfile",
        "npm ci regenerates the lockfile; npm install fails",
      ],
      answerIndex: 2,
      explain:
        "npm ci treats the lockfile as the contract: any disagreement with package.json is an error, never something to fix silently. npm install would re-resolve the range and update the lock — convenient locally, but in CI it means shipping versions nobody reviewed. That's why pipelines standardize on npm ci.",
    },
    {
      question:
        "Where do typescript, tsx, and vitest belong, and how are they excluded from a production install?",
      options: [
        "dependencies — everything must ship to production",
        "devDependencies — excluded with npm ci --omit=dev",
        "A separate tools.json manifest",
        "Installed globally so they never touch package.json",
      ],
      answerIndex: 1,
      explain:
        "Build and test tooling goes in devDependencies (composer's require-dev); runtime needs like express and pg go in dependencies. Production and CI deploy steps run npm ci --omit=dev, mirroring composer install --no-dev. Global installs are avoided precisely so the toolchain versions travel with the repo.",
    },
  ],
};

export default lesson;
