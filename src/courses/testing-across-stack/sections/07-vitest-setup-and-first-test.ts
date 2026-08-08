import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "vitest-setup-and-first-test",
  title: "Vitest Setup & Your First Test",
  part: "Vitest Fundamentals",
  estMinutes: 11,
  summary:
    "Install Vitest 4, write a vitest.config.ts, learn the *.test.ts convention and describe/it/expect, and run in watch mode versus one-shot CI mode.",

  concept: `
Getting Vitest running takes about two minutes, which is itself an interview
point: modern TS tooling has almost no ceremony. One dev dependency, one small
config file, and a naming convention.

### Install and configure

\`\`\`bash
npm install -D vitest
\`\`\`

Configuration lives in \`vitest.config.ts\` at the project root (or inside an
existing \`vite.config.ts\` under a \`test\` key — Vitest reads Vite config
natively):

\`\`\`ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // 'jsdom' later, for component tests
  },
});
\`\`\`

Think of this file as your \`phpunit.xml\` — but it is TypeScript, so it is
type-checked and can compute values. Two Vitest 4 details worth quoting:

- **Multi-config setups use \`test.projects\`.** One repo can define several
  projects (say, \`unit\` in a node environment and \`components\` in jsdom) that
  run together. The old \`test.workspace\` key was deprecated and renamed to
  \`projects\` — if a tutorial says "workspace", it is out of date.
- **Globals are opt-in.** By default you import \`describe\`/\`it\`/\`expect\` from
  \`'vitest'\` explicitly. Setting \`globals: true\` (plus
  \`"types": ["vitest/globals"]\` in tsconfig) makes them ambient, Jest-style.
  Explicit imports are the cleaner default: no magic, and your editor knows
  exactly where everything comes from.

### The file convention

Tests live next to the code they test, named \`*.test.ts\` (or \`*.spec.ts\` —
pick one and be consistent):

\`\`\`
src/lib/slug.ts
src/lib/slug.test.ts   ← Vitest finds this automatically
\`\`\`

Colocation is the norm in the JS world, unlike PHP's separate \`tests/\` tree.
The test file is a plain TS module — no base class to extend.

### describe, it, expect

\`\`\`ts
// src/lib/slug.test.ts
import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
});
\`\`\`

Map it to what you know: **\`describe\` is the test class** (a named group),
**\`it\` is the test method** (one behaviour, named in plain English — \`test\` is
an exact alias), and \`beforeEach\` inside a describe is \`setUp()\`. Nesting
\`describe\` blocks is idiomatic where PHPUnit would need separate classes.

### Two ways to run

\`\`\`bash
npx vitest        # watch mode: stays alive, re-runs affected tests on save
npx vitest run    # one shot: run everything once, exit with a status code
\`\`\`

**Watch mode is the default** and it is the workflow: leave it running in a
terminal while you edit, and failures appear the moment you save — Vitest uses
Vite's module graph to re-run only the tests affected by the changed file.
\`vitest run\` is for CI and pre-push checks: it exits non-zero on failure so
the pipeline fails. (In CI environments Vitest detects non-interactive mode
and falls back to a single run automatically, but scripting \`vitest run\`
explicitly is the clear-intent habit.)
`,

  comparisons: [
    {
      label: "Runner configuration: phpunit.xml vs vitest.config.ts",
      intro:
        "The minimum configuration each runner needs to find and execute a suite. Both say 'here is where the tests are and how to run them'.",
      php: `<?xml version="1.0" encoding="UTF-8"?>
<!-- phpunit.xml -->
<phpunit bootstrap="vendor/autoload.php"
         colors="true">
  <testsuites>
    <testsuite name="unit">
      <directory>tests</directory>
    </testsuite>
  </testsuites>
</phpunit>`,
      ts: `// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // multi-suite setups (Vitest 4): test.projects
    // globals: true would make describe/it ambient
  },
});
// No bootstrap needed — Vite resolves TS/ESM natively.`,
      note: "Same job, but the Vitest config is executable, type-checked TypeScript rather than XML — and defaults are good enough that most projects barely touch it.",
      leftLang: "xml",
    },
    {
      label: "A test class vs a test file",
      intro:
        "One tested behaviour in each world: a cart that totals line items. Note what the Vitest version does NOT need — no base class, no naming rules on methods, no separate tests/ tree.",
      php: `<?php
// tests/CartTest.php
use PHPUnit\\Framework\\TestCase;

final class CartTest extends TestCase
{
    private Cart $cart;

    protected function setUp(): void
    {
        $this->cart = new Cart();
    }

    public function testTotalsLineItems(): void
    {
        $this->cart->add('book', 2500, 2);

        $this->assertSame(5000, $this->cart->total());
    }
}`,
      ts: `// src/lib/cart.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Cart } from './cart';

describe('Cart', () => {
  let cart: Cart;

  beforeEach(() => {
    cart = new Cart();
  });

  it('totals line items', () => {
    cart.add('book', 2500, 2);

    expect(cart.total()).toBe(5000);
  });
});`,
      note: "describe = the class, it = the method, beforeEach = setUp(). The test name is a plain string, so failures read as sentences: 'Cart > totals line items'.",
    },
    {
      label: "Running one test while you work",
      intro:
        "You are deep in one failing behaviour and want fast feedback on just that test. Both runners can filter; only one re-runs on every save.",
      php: `# PHPUnit: filter by method name, re-run by hand
./vendor/bin/phpunit --filter testTotalsLineItems

# ...edit code...
# press Up, Enter. Again. And again.`,
      ts: `# Vitest: filter by test-name pattern, in watch mode
npx vitest -t "totals line items"

# stays alive — every save re-runs the matching
# tests in milliseconds. CI uses the one-shot form:
npx vitest run`,
      note: "Watch mode is the real workflow upgrade: the feedback loop drops from 'switch window, rerun, wait' to 'save, glance at the terminal'.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "This is essentially what Vitest does under the hood: a ~25-line describe/it/expect, then a real suite for a string helper. One test fails on purpose — read the code and predict which, then run it.",
    code: `// ── A miniature Vitest: describe / it / expect ────────────────
let failures = 0;

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (!Object.is(actual, expected)) {
        throw new Error(
          \`expected \${JSON.stringify(actual)} to be \${JSON.stringify(expected)}\`,
        );
      }
    },
    toContain(needle: string) {
      if (typeof actual !== 'string' || !actual.includes(needle)) {
        throw new Error(\`expected \${JSON.stringify(actual)} to contain "\${needle}"\`);
      }
    },
  };
}

function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(\`  PASS  \${name}\`);
  } catch (e) {
    failures++;
    console.log(\`  FAIL  \${name} — \${(e as Error).message}\`);
  }
}

function describe(name: string, fn: () => void) {
  console.log(name);
  fn();
}

// ── The code under test ──────────────────────────────────────
function titleCase(input: string): string {
  return input
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ── The suite ─────────────────────────────────────────────────
describe('titleCase', () => {
  it('capitalises each word', () => {
    expect(titleCase('clean code')).toBe('Clean Code');
  });

  it('lowercases the rest of each word', () => {
    expect(titleCase('PHP VETERAN')).toBe('Php Veteran');
  });

  it('keeps single words intact', () => {
    expect(titleCase('vitest')).toContain('Vitest');
  });

  it('capitalises hyphenated words', () => {
    // split(' ') never sees the hyphen — will this pass?
    expect(titleCase('front-end dev')).toBe('Front-End Dev');
  });
});

console.log(failures === 0 ? '\\nAll tests passed' : \`\\n\${failures} test(s) failed\`);
// Real Vitest adds: file discovery (*.test.ts), watch mode,
// parallel workers, diffs — but the core loop is exactly this.`,
  },

  keyPoints: [
    "Setup is one dev dependency (`npm install -D vitest`) plus a small `vitest.config.ts` using `defineConfig` from 'vitest/config' — your phpunit.xml, but type-checked.",
    "Tests are colocated `*.test.ts` files; `describe` is the test class, `it` (alias `test`) is the test method, `beforeEach` is setUp().",
    "`npx vitest` is watch mode — the default and the workflow; `npx vitest run` is the one-shot CI mode that exits non-zero on failure.",
    "Vitest 4 multi-config setups use `test.projects`; the old `workspace` key was deprecated and renamed, so tutorials teaching it are stale.",
    "Globals are opt-in: import describe/it/expect from 'vitest' by default, or set `globals: true` plus tsconfig `\"types\": [\"vitest/globals\"]` for Jest-style ambient functions.",
  ],

  interview: [
    {
      q: "Walk me through setting up Vitest on a fresh TypeScript project.",
      a: "npm install -D vitest, then a vitest.config.ts exporting defineConfig from 'vitest/config' with a test block — usually just environment: 'node' to start, switching to jsdom later for component tests. Tests are *.test.ts files colocated with the source, importing describe, it and expect from 'vitest'. npx vitest starts watch mode for development; vitest run does a single pass for CI. There is no transpiler wiring because Vitest runs on Vite, which handles TS and ESM natively — that zero-config story is the main reason it displaced Jest as the default for new projects.",
    },
    {
      q: "What is the difference between vitest and vitest run, and when do you use each?",
      a: "Plain vitest starts watch mode: the process stays alive and re-runs affected tests whenever a file changes, using Vite's module graph so only relevant tests re-execute. That is the development workflow — leave it running while you code. vitest run executes the suite once and exits with a status code, which is what CI pipelines and pre-push hooks need so a red suite fails the build. Vitest does fall back to single-run mode when it detects a non-interactive CI environment, but writing vitest run in scripts makes the intent explicit.",
    },
    {
      q: "How would you organise multiple test configurations — say node-environment unit tests and jsdom component tests — in one repo?",
      a: "With Vitest 4's test.projects: inside one vitest.config.ts you define an array of named projects, each with its own include pattern and environment — for example a 'unit' project running src/**/*.test.ts in node, and a 'components' project running component tests in jsdom. One vitest command runs them all, and you can target one with --project. Worth knowing the history: this was called test.workspace until it was deprecated and renamed to projects, so older blog posts show the stale key.",
    },
  ],

  quiz: [
    {
      question:
        "In Vitest 4, how do you configure two suites — unit tests in node and component tests in jsdom — in one repo?",
      options: [
        "Two separate package.json files, one per suite",
        "The test.projects array in vitest.config.ts",
        "The test.workspace key in vitest.workspace.ts",
        "You must run two separate Vitest installations",
      ],
      answerIndex: 1,
      explain:
        "Vitest 4 uses test.projects — an array of per-project configs (name, include, environment) in one config file. test.workspace is the old name: deprecated in 3.2 and renamed, so it is the classic stale-tutorial trap.",
    },
    {
      question:
        "What is the PHPUnit analogue of beforeEach() inside a describe block?",
      options: [
        "The class constructor",
        "setUpBeforeClass()",
        "setUp()",
        "A @dataProvider method",
      ],
      answerIndex: 2,
      explain:
        "beforeEach runs before every it() in its describe block, exactly like PHPUnit's setUp() runs before each test method. setUpBeforeClass() maps to beforeAll, which runs once per group.",
    },
    {
      question: "By default (no config changes), which statement is true?",
      options: [
        "describe/it/expect are global, like in Jest",
        "You must import describe/it/expect from 'vitest'; globals require opting in with globals: true",
        "Vitest only discovers tests in a top-level tests/ directory",
        "npx vitest runs the suite once and exits",
      ],
      answerIndex: 1,
      explain:
        "Vitest's defaults: explicit imports from 'vitest' (globals are opt-in via globals: true plus the vitest/globals tsconfig types), *.test.ts / *.spec.ts discovery anywhere in the project, and watch mode — not single-run — as the default command.",
    },
  ],
};

export default lesson;
