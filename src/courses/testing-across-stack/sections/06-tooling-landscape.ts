import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "tooling-landscape",
  title: "The Modern Testing Toolbox",
  part: "Foundations",
  estMinutes: 10,
  summary:
    "A map of the tools you are about to learn — Vitest 4, Testing Library, Playwright 1.x, pytest 9 — where Jest fits, and how directly your PHPUnit experience transfers.",

  concept: `
Job listings rarely say "testing". They say **Vitest**, **Jest**, **Playwright**,
**pytest**, **Testing Library** — and you need to know which is which, which layer
of the pyramid each covers, and which versions are current. This section is the
map; the rest of the course walks the territory.

### One tool per layer

- **Vitest 4** — the unit and integration test runner for TypeScript/JavaScript,
  and the modern default. It is built on Vite, so it runs TS and ES modules
  natively with zero transpiler config, and its watch mode re-runs only affected
  tests, near-instantly. Its API is deliberately Jest-compatible:
  \`describe\` / \`it\` / \`expect\`.
- **Jest** — the incumbent runner you will meet in older codebases, especially
  React shops. Same API surface as Vitest, but it grew up in the CommonJS era,
  so TypeScript and ESM need transform configuration (\`ts-jest\` or Babel).
  Knowing one means knowing ~95% of the other.
- **Testing Library** — not a runner at all. It is a family of query helpers
  (\`getByRole\`, \`getByLabelText\`, \`userEvent\`) that sit *on top of* Vitest or
  Jest and make component tests interact with the UI the way a user does. The
  API is identical across the framework wrappers — \`@testing-library/svelte\`,
  \`@testing-library/react\`, plain \`@testing-library/dom\` — so the skill is
  framework-portable.
- **Playwright 1.x** — end-to-end testing. It drives real Chromium, Firefox and
  WebKit browsers, ships its own runner, and its modern style is user-facing
  locators (\`page.getByRole('button', { name: 'Sign in' })\`) with auto-retrying
  assertions. Think of it as the manual browser-clicking you have done for
  decades — automated and running in CI.
- **pytest 9** — Python's standard test framework. No classes required: plain
  functions plus the bare \`assert\` statement, with fixtures and parametrize as
  its superpowers. If a role touches Python, pytest is assumed.

### Where your PHPUnit years go

You are not starting from zero. **PHPUnit** is the same species as Jest/Vitest:
test classes become \`describe\` blocks, test methods become \`it()\` calls,
\`setUp()\` becomes \`beforeEach()\`, data providers become \`it.each\`. **Pest** —
PHP's modern runner — already borrowed the \`it()/expect()\` style from this
ecosystem, so if you have seen Pest, Vitest will feel like home. On the browser
side, **Laravel Dusk** or **Symfony Panther** map to Playwright.

### The Jest-vs-Vitest interview question, answered honestly

This comes up constantly. The honest answer: **the test-writing API is the
same** — \`describe\`, \`it\`, \`expect\`, mock functions (\`vi.fn()\` vs
\`jest.fn()\`). The difference is the engine. Vitest is Vite-native: ESM and
TypeScript work out of the box, config lives in \`vitest.config.ts\`, and watch
mode uses Vite's module graph to re-run only what changed. Jest predates ESM,
so real-world TS setups carry transform config and can feel slower on large
suites. Migration between them is mostly find-and-replace. Don't trash Jest in
an interview — it still runs an enormous share of the world's test suites; say
you would pick Vitest for a new TS project and work happily in Jest where it is
established.

### Quote current versions

Interviewers notice currency. As of now: **Vitest 4**, **Playwright 1.x**
(there is no Playwright 2 — it has stayed on major 1 for years), **pytest 9**
(requires Python 3.10+). Saying "Vitest 4's \`test.projects\`" or "pytest 9"
signals you actually work with these tools rather than having skimmed a
2020 tutorial.
`,

  comparisons: [
    {
      label: "The same test, PHPUnit vs Vitest",
      intro:
        "A price-formatting test written in PHPUnit and again in Vitest. Read both: the structure — arrange, act, assert with a descriptive name — is identical.",
      php: `<?php
// tests/PriceFormatterTest.php
use PHPUnit\\Framework\\TestCase;

final class PriceFormatterTest extends TestCase
{
    public function testFormatsCentsAsDollars(): void
    {
        $formatter = new PriceFormatter();

        $result = $formatter->format(1999);

        $this->assertSame('$19.99', $result);
    }
}`,
      ts: `// src/lib/price-formatter.test.ts
import { describe, it, expect } from 'vitest';
import { formatPrice } from './price-formatter';

describe('formatPrice', () => {
  it('formats cents as dollars', () => {
    const result = formatPrice(1999);

    expect(result).toBe('$19.99');
  });
});`,
      note: "Class → describe, method → it, assertSame → toBe. Twenty years of PHPUnit instinct transfers almost line for line.",
    },
    {
      label: "Jest setup vs Vitest setup for a TypeScript project",
      intro:
        "What it takes to get a TypeScript test suite running in each runner. The test files themselves would be interchangeable.",
      php: `// jest.config.cjs — the incumbent needs a transform layer
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\\\.ts$': ['ts-jest', { useESM: true }],
  },
};
// ...plus ts-jest and its peer deps in package.json`,
      ts: `// vitest.config.ts — TS and ESM work out of the box
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
// npm install -D vitest — that's the whole setup`,
      note: "Same describe/it/expect on top; the difference is the engine underneath. Vitest is Vite-native, so there is no transpiler wiring to maintain.",
      leftLang: "js",
    },
    {
      label: "Pest already taught you the modern style",
      intro:
        "PHP's own ecosystem converged on the same shape. A Pest test and a Vitest test are near-dialects of each other.",
      php: `<?php
// tests/Unit/SlugTest.php — Pest (modern PHP)
it('slugifies a title', function () {
    expect(slugify('Hello World'))
        ->toBe('hello-world');
});`,
      ts: `// src/lib/slug.test.ts — Vitest
import { it, expect } from 'vitest';
import { slugify } from './slug';

it('slugifies a title', () => {
  expect(slugify('Hello World'))
    .toBe('hello-world');
});`,
      note: "The whole industry converged on it()/expect() — if you have written any Pest, Vitest is not a new language, just a new runtime.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Three commands you will type hundreds of times in a TS/Python shop. Read the transcript-to-be and predict: which suite fails, and how does each runner report it?",
    code: `# 1. TypeScript unit tests, one-shot (CI mode — no watch):
npx vitest run

# 2. Python suite, quiet mode:
pytest -q

# 3. End-to-end browser tests:
npx playwright test`,
    output: `$ npx vitest run

 RUN  v4.1.6 /home/dev/shop

 ✓ src/lib/money.test.ts (6 tests) 5ms
 ✓ src/lib/cart.test.ts (9 tests) 12ms
 ❯ src/lib/discount.test.ts (4 tests | 1 failed) 8ms
   × applies the loyalty discount once
     → expected 90 to be 81 // Object.is equality

 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 18 passed (19)
   Duration  420ms

$ pytest -q
..........                                                    [100%]
10 passed in 0.12s

$ npx playwright test

Running 3 tests using 2 workers
  3 passed (6.2s)

To open last HTML report run:

  npx playwright show-report`,
  },

  keyPoints: [
    "One tool per pyramid layer: Vitest 4 for TS unit/integration, Testing Library for component queries, Playwright 1.x for e2e, pytest 9 for Python.",
    "Vitest and Jest share the same describe/it/expect API — Vitest is the Vite-native modern default; Jest is the incumbent you will meet in older codebases.",
    "Testing Library is not a runner: it is a query layer (getByRole, userEvent) that runs on top of Vitest or Jest, and its API is identical across framework wrappers.",
    "PHPUnit maps almost 1:1 — classes → describe, methods → it, setUp() → beforeEach, data providers → it.each; Pest already uses this exact style.",
    "Quote current majors in interviews: Vitest 4, Playwright 1.x (no v2 exists), pytest 9 (Python 3.10+).",
  ],

  interview: [
    {
      q: "What's the difference between Jest and Vitest, and which would you choose?",
      a: "The test-writing API is essentially identical — describe, it, expect, mock functions — so tests are nearly copy-paste portable between them. The difference is the engine: Vitest is built on Vite, so TypeScript and ES modules work with zero transform config, and its watch mode uses Vite's module graph to re-run only affected tests almost instantly. Jest predates ESM, so real TS setups need ts-jest or Babel transforms. For a new TypeScript project I'd choose Vitest 4; in an established Jest codebase I'd work with Jest happily rather than campaign for a migration that buys little, because the skills are the same.",
    },
    {
      q: "You've spent years with PHPUnit. How does that experience transfer to the JS/Python testing world?",
      a: "Almost directly, because the tools are all descendants of the same xUnit family. A PHPUnit test class is a describe block, a test method is an it() call, setUp() is beforeEach() in Vitest or a fixture in pytest, a @dataProvider is it.each or pytest.mark.parametrize, and a Mockery mock is vi.fn(). What I'm actually learning is the ecosystem specifics — Vitest's Vite integration, Playwright's locators, pytest fixtures — not the discipline of testing, which I already have. Pest in the PHP world even copied the it()/expect() style, so the convergence goes both ways.",
    },
    {
      q: "Where does Testing Library fit — is it an alternative to Vitest?",
      a: "No, it's a layer on top. Vitest (or Jest) is the runner: it finds test files, executes them, and reports results. Testing Library provides the queries and user-interaction helpers for component tests — getByRole, getByLabelText, userEvent — so tests interact with the rendered UI the way a user would instead of poking at component internals. You run Testing Library tests with Vitest. And because the query API is identical across @testing-library/svelte, @testing-library/react and @testing-library/dom, learning it once covers every framework.",
    },
  ],

  quiz: [
    {
      question:
        "A job listing asks for 'Vitest or Jest'. What is the honest relationship between the two?",
      options: [
        "They are unrelated tools with completely different APIs",
        "Vitest is Jest's official successor, maintained by the same team",
        "Same describe/it/expect API surface; Vitest is Vite-native with zero-config TS/ESM, Jest is the older incumbent needing transform config",
        "Jest is for unit tests, Vitest is only for browser end-to-end tests",
      ],
      answerIndex: 2,
      explain:
        "Vitest deliberately mirrors Jest's API, so tests port almost unchanged. The difference is the engine: Vitest runs on Vite with native TS/ESM support and fast watch mode; Jest needs ts-jest/Babel transforms. Different teams, same layer of the pyramid.",
    },
    {
      question: "Which pairing of tool to pyramid layer is correct?",
      options: [
        "Playwright for unit tests, Vitest for e2e",
        "Vitest for unit/integration, Testing Library for component queries, Playwright for e2e, pytest for Python",
        "Testing Library is the test runner; Vitest supplies the queries",
        "pytest runs TypeScript tests through a transpiler",
      ],
      answerIndex: 1,
      explain:
        "Vitest 4 runs TS unit and integration tests, Testing Library provides behaviour-first queries on top of a runner, Playwright 1.x drives real browsers for e2e, and pytest 9 is Python's standard. Testing Library is never the runner.",
    },
    {
      question:
        "What is the PHPUnit equivalent of a Vitest describe block and an it() call?",
      options: [
        "A phpunit.xml suite and a bootstrap file",
        "A test class and a test method",
        "A data provider and an assertion",
        "setUp() and tearDown()",
      ],
      answerIndex: 1,
      explain:
        "describe groups related tests the way a PHPUnit test class does, and each it() is one test method. setUp() maps to beforeEach, and data providers map to it.each — the xUnit heritage is shared.",
    },
  ],
};

export default lesson;
