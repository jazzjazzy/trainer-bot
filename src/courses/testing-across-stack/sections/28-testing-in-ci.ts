import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "testing-in-ci",
  title: "Wiring Tests into CI",
  part: "Discipline & Delivery",
  estMinutes: 11,
  summary:
    "Tests only count when they gate merges: a GitHub Actions workflow runs Vitest, pytest, and Playwright on every pull request, uploads failure artifacts, and blocks the merge button until everything is green.",

  concept: `
A test suite that runs only when someone remembers to run it is a suggestion.
The moment it runs automatically on every pull request — and a red run locks
the merge button — it becomes a **contract**. That wiring is continuous
integration, and for most of the industry it means a YAML file in
\`.github/workflows/\`.

### Anatomy of a test workflow

A workflow is triggered by an event (\`on: pull_request\`), runs one or more
**jobs** on fresh virtual machines, and each job is a list of **steps**:

\`\`\`yaml
# .github/workflows/tests.yml
name: tests
on: [pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7          # get the code
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - run: npm ci                         # exact lockfile install
      - run: npx vitest run --coverage
\`\`\`

\`uses:\` steps pull reusable actions (checkout, language setup); \`run:\` steps
are shell commands. Because every job starts on a clean machine, the workflow
is also living documentation of how to build your project from nothing.

### The CI mindset shift

Commands that are lovely locally are wrong in CI:

- **Non-interactive, single-shot.** \`vitest\` starts watch mode and never
  exits — CI needs \`vitest run\`. Same instinct everywhere: no watchers, no
  prompts, no "press q to quit".
- **\`npm ci\`, not \`npm install\`** — installs exactly the lockfile and fails
  if it's out of sync, instead of quietly "fixing" it.
- **Cache the dependencies, not the results.** \`setup-node\`'s \`cache: npm\`
  and \`setup-python\`'s \`cache: pip\` keep installs fast without ever caching
  test outcomes.
- **CI detection.** Runners set \`CI=true\`, and tools change behaviour on it —
  Playwright configs typically set \`retries: process.env.CI ? 2 : 0\` and
  \`forbidOnly: !!process.env.CI\` (a stray \`test.only\` fails the build
  instead of silently skipping the suite). Note pytest 9's sharpened rule: CI
  mode activates only when \`$CI\` (or \`$BUILD_NUMBER\`) is **non-empty**, so
  \`CI=\` no longer counts as being on CI.

### Browsers, artifacts, and the Playwright job

E2E needs real browsers, which a fresh VM doesn't have:

\`\`\`yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps   # browsers + OS libs
      - run: npx playwright test
      - uses: actions/upload-artifact@v7
        if: failure()                              # only on red runs
        with:
          name: playwright-report
          path: playwright-report/
\`\`\`

The \`if: failure()\` upload is the difference between "e2e failed on CI,
can't reproduce" and downloading the HTML report + trace, opening it with
\`npx playwright show-trace\`, and watching the failure frame by frame.

### Coverage as a ratchet, and the actual gate

With \`coverage.thresholds\` set in \`vitest.config.ts\` (lines, branches,
functions, statements), \`vitest run --coverage\` **exits non-zero** when
coverage drops below the bar — a coverage regression fails the build like any
other failure. Keep thresholds slightly below reality and ratchet them up;
100%-or-bust invites gaming.

Finally, the part that makes it all real: **branch protection**. In the repo
settings, protect \`main\`, require the test jobs as *required status checks*,
and require branches to be up to date. Now the merge button is physically
disabled until CI is green. That's the modern deploy gate — the distance
travelled from FTP-ing files onto a live server and clicking around to see if
the site still works.
`,

  comparisons: [
    {
      label: "The manual release checklist vs the workflow file",
      intro:
        "Same intent — 'don't ship broken code' — expressed as a wiki checklist humans follow (sometimes) versus a workflow machines follow (always).",
      php: `#!/bin/bash
# RELEASE-CHECKLIST.txt  (last updated 2019, allegedly)
#
# 1. Run the tests locally (if time permits):
vitest            # oops: watch mode, waits forever
# 2. Click through checkout on staging "the usual paths"
# 3. FTP the changed files to production:
ftp -u prod.example.com ./src/*.php
# 4. Load the homepage. Looks fine? Ship it.
# 5. If anything breaks, FTP yesterday's backup back.
#
# Enforced by: memory, guilt, and the one dev who cares.`,
      ts: `# .github/workflows/tests.yml — enforced by the merge button
name: tests
on: [pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx vitest run --coverage

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v7
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }`,
      note: "The checklist depends on discipline under deadline pressure — the workflow runs identically on every PR, and with branch protection its jobs become required checks that physically lock the merge.",
      leftLang: "bash",
      rightLang: "yaml",
    },
    {
      label: "Local habits vs CI-safe commands",
      intro:
        "The commands you type at your desk and the ones CI should run differ in small ways that all matter: watch modes hang, npm install drifts, and empty CI vars lie.",
      php: `# What you run at your desk
vitest                 # watch mode: re-runs on save, never exits
npm install            # may rewrite package-lock.json to "fix" it
pytest                 # colours, local plugins, your shell's env
npx playwright test --ui   # interactive UI mode`,
      ts: `# What the workflow should run
npx vitest run --coverage   # single pass, exit code = verdict
npm ci                      # exact lockfile or hard failure
pytest -q                   # terse output built for logs
npx playwright test         # headless; retries/forbidOnly via
                            #   process.env.CI in the config

# CI=true is set by the runner. pytest 9: CI mode needs
# $CI to be NON-EMPTY — 'CI=' no longer counts.`,
      note: "Every CI command must be non-interactive and single-shot with a meaningful exit code — the pipeline's only language is 'zero or not zero'.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Coverage reported vs coverage enforced",
      intro:
        "Both configs collect coverage. Only one makes a coverage drop fail the pull request.",
      php: `// vitest.config.ts — coverage as decoration
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Numbers get printed, admired, and ignored.
      // Coverage can halve and the build stays green.
    },
  },
});`,
      ts: `// vitest.config.ts — coverage as a ratchet
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],       // v4: include/exclude,
      exclude: ['src/**/*.test.ts'],  //   coverage.all is gone
      thresholds: {
        lines: 85, branches: 75, functions: 85, statements: 85,
      },
    },
  },
});
// vitest run --coverage now EXITS NON-ZERO below the bar.`,
      note: "Thresholds turn the metric into a gate: set them just under current reality and ratchet upward. Note the Vitest 4 change — coverage.all/extensions were removed; scope coverage with include/exclude.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "Read this complete workflow and predict the run: how many jobs does the matrix expand to, what runs in each, and what does the PR's checks panel show at the end?",
    code: `# .github/workflows/tests.yml
name: tests
on: [pull_request]

jobs:
  node:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: \${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npx vitest run --coverage

  python:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python: ["3.11", "3.12"]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-python@v6
        with:
          python-version: \${{ matrix.python }}
          cache: pip
      - run: pip install -r requirements.txt
      - run: pytest -q`,
    output: `tests · run #214 · triggered by pull_request

node (20)                                  ubuntu-latest
  ✓ actions/checkout@v7
  ✓ actions/setup-node@v7 — node 20, npm cache restored
  ✓ npm ci
  ✓ npx vitest run --coverage
      Test Files  12 passed (12)
           Tests  87 passed (87)
      Coverage report: all thresholds met

node (22)                                  ubuntu-latest
  ✓ same steps on node 22 — 87 passed

python (3.11)                              ubuntu-latest
  ✓ actions/checkout@v7
  ✓ actions/setup-python@v6 — 3.11, pip cache restored
  ✓ pip install -r requirements.txt
  ✓ pytest -q
      53 passed in 1.84s

python (3.12)                              ubuntu-latest
  ✓ same steps on 3.12 — 53 passed in 1.79s

All 4 checks have passed — required checks green,
merge button unlocked.`,
  },

  keyPoints: [
    "Tests become a contract only when wired to `on: [pull_request]` and made *required status checks* under branch protection — red physically locks the merge button.",
    "CI commands are non-interactive single shots: `vitest run --coverage` (never watch mode), `npm ci` (never `npm install`), `pytest -q`, headless `npx playwright test`.",
    "The Playwright job needs `npx playwright install --with-deps` for browsers, and `actions/upload-artifact@v7` with `if: failure()` to preserve reports and traces from red runs.",
    "Cache dependencies, never results: `cache: npm` on setup-node and `cache: pip` on setup-python keep installs fast.",
    "`coverage.thresholds` in vitest.config.ts makes a coverage regression exit non-zero — a gate, not a decoration; Vitest 4 removed `coverage.all`/`extensions`, so scope with `include`/`exclude`.",
    "pytest 9 activates CI mode only when `$CI` (or `$BUILD_NUMBER`) is non-empty; a matrix `strategy` fans one job definition out across versions.",
  ],

  interview: [
    {
      q: "How would you set up CI for a project with Vitest unit tests, pytest API tests, and Playwright e2e?",
      a: "A GitHub Actions workflow triggered on pull_request with three jobs, so they run in parallel and fail independently. The unit job: checkout, setup-node with npm caching, `npm ci`, then `vitest run --coverage` with thresholds configured so a coverage regression fails the build. The Python job: setup-python with pip caching, install requirements, `pytest -q`. The e2e job additionally runs `npx playwright install --with-deps` to get browsers onto the fresh runner, and uploads the Playwright report and traces as artifacts with `if: failure()` so red runs are debuggable with `show-trace` instead of 'works on my machine'. Then the part people forget: branch protection on main with all three jobs as required status checks — without that, the pipeline is advisory and someone will merge over a red build the first Friday deadline.",
    },
    {
      q: "Why do CI commands differ from what you run locally?",
      a: "CI is non-interactive and disposable, so every command must run once, produce a verdict as an exit code, and terminate. Locally I want `vitest` in watch mode; in CI that never exits and the job hangs until timeout — it has to be `vitest run`. `npm install` may rewrite the lockfile to make things work, which is exactly wrong in CI; `npm ci` installs the lockfile verbatim or fails loudly. Tools also self-adjust on the `CI` env var — Playwright configs typically enable retries and `forbidOnly` there, so a stray `test.only` fails the build rather than silently shrinking the suite — and pytest 9 tightened that contract: CI mode requires `$CI` to be non-empty, not merely defined.",
    },
    {
      q: "A Playwright test failed in CI but passes locally. What does your pipeline give you to debug it?",
      a: "Artifacts. The e2e job uploads the HTML report and traces on failure — `actions/upload-artifact@v7` guarded by `if: failure()` — and the Playwright config records traces with `trace: 'on-first-retry'`. I download the artifact and open the trace with `npx playwright show-trace`: it's a full recording of the failed run — DOM snapshots before and after every action, console output, and network calls — so I can see exactly what the page looked like when the locator missed. That usually reveals the classic CI-only causes: a slower runner exposing a race, a missing await, or an animation the local machine finishes faster. Without artifacts, a CI-only e2e failure is close to undebuggable.",
    },
  ],

  quiz: [
    {
      question: "Why must the CI job run `vitest run` instead of `vitest`?",
      options: [
        "vitest run is faster because it skips type-checking",
        "Bare vitest starts watch mode, which never exits — the CI job would hang until its timeout",
        "vitest run enables coverage collection, bare vitest cannot",
        "Bare vitest requires a TTY and immediately crashes in CI",
      ],
      answerIndex: 1,
      explain:
        "Locally, bare `vitest` starts the file-watching dev loop — great at a desk, fatal in a pipeline that needs a single pass and an exit code. `vitest run` executes once and exits zero or non-zero; coverage works in both modes.",
    },
    {
      question:
        "What makes a coverage regression actually fail a pull request?",
      options: [
        "Adding 'lcov' to coverage.reporter",
        "Setting coverage.thresholds in vitest.config.ts — vitest run --coverage exits non-zero below them — and requiring that job as a status check",
        "Uploading the coverage report as an artifact",
        "Enabling coverage.all so every file is counted",
      ],
      answerIndex: 1,
      explain:
        "Reporters and artifacts only display numbers. Thresholds make the run's exit code depend on them, and branch protection turns that exit code into a locked merge button. (coverage.all was removed in Vitest 4 — scope with include/exclude.)",
    },
    {
      question:
        "Why does the e2e job run `npx playwright install --with-deps` when local machines never need it per-run?",
      options: [
        "It updates Playwright to the latest version before testing",
        "CI runners are fresh VMs with no browsers installed; the flag also installs the OS libraries the browsers need",
        "It is required to enable headless mode",
        "It warms the browser cache so tests run faster",
      ],
      answerIndex: 1,
      explain:
        "Every job starts on a clean virtual machine — your locally-installed browsers don't exist there. `playwright install` downloads the browser binaries and `--with-deps` adds the system packages they depend on; without it the job dies at browser launch.",
    },
  ],
};

export default lesson;
