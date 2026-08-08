import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "playwright-patterns",
  title: "Playwright Patterns: Assertions, Fixtures & Traces",
  part: "Integration & E2E",
  estMinutes: 12,
  summary:
    "Production Playwright: web-first assertions that retry, storageState to log in once, custom fixtures for shared setup, and traces that give you a time-travel debugger for failed runs.",

  concept: `
A first Playwright test is easy. Keeping fifty of them fast and non-flaky is a
craft — and these four patterns are most of it.

### Web-first assertions: retry until true

Playwright's \`expect\` has two very different behaviours depending on what
you hand it:

\`\`\`ts
// Web-first: takes a LOCATOR, retries until it passes or times out
await expect(page.getByText('Welcome')).toBeVisible();

// Anti-pattern: takes a VALUE, checks exactly once
expect(await page.getByText('Welcome').isVisible()).toBe(true);
\`\`\`

The second form awaits \`isVisible()\` *now*, gets \`false\` because the app is
mid-render, and fails — even though the text appears 200ms later. The first
form holds the locator and re-queries the page until the condition is met or
the timeout (5s by default) expires. This is the Playwright best-practices
rule: **assert on locators, not on extracted values.** Same for
\`toHaveText\`, \`toHaveURL\`, \`toBeEnabled\`, \`toHaveCount\` — all
auto-retrying.

### Isolation: a fresh context per test

Each test gets its own **browser context** — an incognito-style profile with
separate cookies, localStorage, and cache. Contexts are cheap to create
(unlike launching a browser), so Playwright gives every test a clean one. No
test can be logged in because a previous test logged in.

### storageState: log in once, reuse everywhere

Full isolation has an obvious cost: does every test now click through the
login form? No — you log in once in a **setup project**, save the cookies and
localStorage to disk, and every test starts pre-authenticated:

\`\`\`ts
// auth.setup.ts — runs once before the suite
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill(process.env.QA_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/dashboard');
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
\`\`\`

\`\`\`ts
// playwright.config.ts
projects: [
  { name: 'setup', testMatch: /.*\\.setup\\.ts/ },
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'],
           storageState: 'playwright/.auth/user.json' },
    dependencies: ['setup'],
  },
],
\`\`\`

One login for the whole run instead of one per test — often the single
biggest speed win in an e2e suite.

### Custom fixtures: setUp() done right

Repeated setup belongs in a **fixture** created with \`test.extend\`. Think
PHPUnit's \`setUp()\`, but composable and per-test opt-in: a test asks for
\`adminPage\` or \`cartWithItems\` in its arguments and Playwright builds it,
runs the test, and tears it down.

### Traces: time-travel debugging for CI failures

The eternal e2e question — "it failed on CI, now what?" — is answered by
tracing:

\`\`\`ts
use: { trace: 'on-first-retry' },  // record when a test retries
\`\`\`

\`\`\`bash
npx playwright show-trace trace.zip
\`\`\`

The trace viewer shows every action with a before/after DOM snapshot you can
inspect live, plus network requests, console output, and timings. It is a
time-travel debugger for the failed run — no more re-running locally and
hoping the flake reproduces.
`,

  comparisons: [
    {
      label: "One-shot assertion vs web-first assertion",
      intro:
        "Both lines want to verify the welcome banner appears after login. The app renders it ~300ms after the redirect. One assertion tolerates that reality; the other races it.",
      php: `// ONE-SHOT: extract a value, check it once
test('welcome banner shows', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign in' }).click();

  // isVisible() answers RIGHT NOW — mid-render: false.
  const visible = await page.getByText('Welcome back').isVisible();
  expect(visible).toBe(true);
  // Flaky: passes on a fast laptop, fails on busy CI.
  // Zero retry — the answer was frozen at extraction time.
});`,
      ts: `// WEB-FIRST: hand expect the locator itself
test('welcome banner shows', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Re-queries the page until visible (or 5s timeout):
  await expect(page.getByText('Welcome back')).toBeVisible();

  // Same family — all auto-retrying:
  await expect(page).toHaveURL(/\\/dashboard/);
  await expect(page.getByTestId('cart-count')).toHaveText('0');
});`,
      note:
        "The rule from Playwright's own best-practices guide: expect(locator).toBeVisible() retries; expect(await locator.isVisible()).toBe(true) checks once and races the render. If you type 'await' inside expect(...), stop.",
      leftLang: "ts",
    },
    {
      label: "Login in beforeEach vs storageState",
      intro:
        "Forty tests need an authenticated user. The left suite drives the login form forty times; the right logs in once in a setup project and shares the saved session.",
      php: `// Every test pays the login tax — ~4s x 40 tests
test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('qa@example.com');
    await page.getByLabel('Password').fill('secret!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('/dashboard');
  });

  test('shows recent orders', async ({ page }) => { /* ... */ });
  test('renames a project', async ({ page }) => { /* ... */ });
  // ~160s of the suite is JUST logging in — and 40 extra
  // chances for the login flow to flake unrelated tests.
});`,
      ts: `// auth.setup.ts — the login happens ONCE per run
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill(process.env.QA_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/dashboard');
  await page.context().storageState({
    path: 'playwright/.auth/user.json',
  });
});

// playwright.config.ts — every chromium test starts signed in
// projects: [
//   { name: 'setup', testMatch: /.*\\.setup\\.ts/ },
//   { name: 'chromium',
//     use: { storageState: 'playwright/.auth/user.json' },
//     dependencies: ['setup'] },
// ]`,
      note:
        "storageState saves the context's cookies and localStorage to JSON; the dependent project loads it into every fresh context. Tests keep full isolation — each still gets its own context — they just start it pre-authenticated.",
      leftLang: "ts",
    },
    {
      label: "Debugging a CI failure: screenshots vs traces",
      intro:
        "A test fails only on CI, roughly one run in five. The left workflow guesses from a screenshot; the right replays the entire failed run.",
      php: `// The old loop: add logging, push, pray
test('checkout applies the coupon', async ({ page }) => {
  await page.getByLabel('Coupon').fill('SAVE10');
  await page.getByRole('button', { name: 'Apply' }).click();

  // Failed on CI. Locally it passes. So you add:
  await page.screenshot({ path: 'debug-1.png' });
  console.log(await page.content()); // 4000 lines of HTML
  // ...push, wait 12 minutes, still can't see WHEN the
  // total changed or WHAT the failed request returned.
});`,
      ts: `// playwright.config.ts
export default defineConfig({
  use: {
    trace: 'on-first-retry',   // record the retry of a failed test
  },
  retries: process.env.CI ? 1 : 0,
});

// After a CI failure, download the artifact and:
//   npx playwright show-trace trace.zip
//
// The trace viewer gives you, for EVERY action:
//   - a live DOM snapshot before/after (inspectable, not a PNG)
//   - the network log — see the 500 the coupon endpoint returned
//   - console output and step timings
// A time-travel debugger for the run that actually failed.`,
      note:
        "trace: 'on-first-retry' costs nothing on green runs — it records only when a failed test retries. The snapshot is a real DOM you can inspect with devtools, which is why it beats any screenshot.",
      leftLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Web-first assertions simulated in plain TypeScript: expectEventually polls a condition the way expect(locator).toBeVisible() re-queries the page. The fake page updates its heading 150ms after 'load'. Predict the one-shot result and both retry outcomes, then run it.",
    code: `// Playwright's web-first assertions, simulated: poll until the
// condition holds or the retry budget runs out.

// The "page": a heading that updates 150ms after load, like a
// dashboard rendering once its fetch resolves.
const page = { heading: 'Loading…' };
setTimeout(() => { page.heading = 'Dashboard'; }, 150);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function expectEventually(
  name: string,
  check: () => boolean,
  timeout = 500,
  interval = 100,
) {
  const maxAttempts = Math.ceil(timeout / interval);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (check()) {
      console.log(\`  attempt \${attempt}: condition met\`);
      console.log(\`PASS  \${name}\`);
      return;
    }
    console.log(\`  attempt \${attempt}: not yet — retry in \${interval}ms\`);
    await sleep(interval);
  }
  console.log(\`FAIL  \${name}: timed out after \${timeout}ms\`);
}

// 1. The anti-pattern: a one-shot check, evaluated immediately.
//    This is expect(await locator.isVisible()).toBe(true).
console.log(\`one-shot check right now: \${page.heading === 'Dashboard'}\`);

// 2. The web-first way: await expect(locator).toHaveText('Dashboard')
await expectEventually(
  'heading becomes "Dashboard"',
  () => page.heading === 'Dashboard',
);

// 3. A condition that never comes true fails — but only after
//    the full retry budget, never on the first look.
await expectEventually(
  'heading becomes "Signed out"',
  () => page.heading === 'Signed out',
  300,
);`,
  },

  keyPoints: [
    "Assert on locators, not extracted values: `await expect(locator).toBeVisible()` retries until it passes; `expect(await locator.isVisible()).toBe(true)` checks once and races the render.",
    "The whole family retries: `toHaveText`, `toHaveURL`, `toBeEnabled`, `toHaveCount` — flake resistance is built into the assertion, not bolted on with sleeps.",
    "Every test gets a fresh browser context (isolated cookies/storage) — cheap, unlike launching a browser, so isolation costs almost nothing.",
    "Use a setup project + `storageState` to log in once per run and start every test pre-authenticated — usually the biggest speed win in an e2e suite.",
    "Repeated setup belongs in custom fixtures via `test.extend` — PHPUnit's setUp(), but composable and requested per-test.",
    "Configure `trace: 'on-first-retry'` and debug CI failures with `npx playwright show-trace`: live DOM snapshots, network, and console for every action of the failed run.",
  ],

  interview: [
    {
      q: "What is the difference between expect(await locator.isVisible()).toBe(true) and await expect(locator).toBeVisible()?",
      a: "The first extracts a boolean immediately — `isVisible()` answers 'is it visible right now?' — and then asserts on that frozen value, so if the app is 200ms from rendering the element, the test fails. The second is a web-first assertion: `expect` receives the locator itself and re-queries the page until the condition is met or the timeout expires. Playwright's best-practices guide is explicit that the first form is an anti-pattern. In review, my heuristic is: an `await` inside the `expect(...)` parentheses on a locator method is a flake waiting for a slow CI box.",
    },
    {
      q: "How do you avoid logging in through the UI in every single e2e test?",
      a: "With `storageState`. A setup project performs the login once — through the UI or even a direct API request — and saves the context's cookies and localStorage to a JSON file with `page.context().storageState({ path })`. The real test projects declare `dependencies: ['setup']` and set `use.storageState` to that file, so every test's fresh browser context starts already authenticated. Isolation is preserved — each test still gets its own context — but a 40-test suite pays the login cost once instead of forty times, and the login form stops being a flake source for unrelated tests.",
    },
    {
      q: "A Playwright test fails intermittently on CI but never locally. How do you debug it?",
      a: "Traces. I set `trace: 'on-first-retry'` with `retries: 1` on CI, so when a test fails and retries, Playwright records the retry: every action with before/after DOM snapshots, the full network log, console output, and timings. I download the trace artifact and open it with `npx playwright show-trace trace.zip` — the snapshots are live DOM, so I can inspect elements at the exact moment the assertion failed and usually spot the cause immediately: a slow API response, a race with an animation, or an element covered by a toast. It turns 'cannot reproduce' into a recording of the actual failure.",
    },
  ],

  quiz: [
    {
      question:
        "Why is expect(await page.getByText('Saved').isVisible()).toBe(true) considered an anti-pattern?",
      options: [
        "isVisible() is deprecated in Playwright 1.x",
        "It evaluates visibility once at extraction time, with no retry — so it races the app's rendering",
        "It only works in Chromium",
        "Boolean assertions are slower than locator assertions",
      ],
      answerIndex: 1,
      explain:
        "isVisible() answers immediately and expect() then asserts on a frozen boolean. The web-first form — await expect(locator).toBeVisible() — keeps the locator and re-queries the page until the condition holds or times out, which absorbs render delays instead of flaking on them.",
    },
    {
      question: "What does storageState give you in a Playwright suite?",
      options: [
        "A shared browser context so tests can pass variables to each other",
        "Persistent test data in the application database",
        "Saved cookies/localStorage from one login, loaded into each test's fresh context so tests start authenticated",
        "Automatic retries for failed tests",
      ],
      answerIndex: 2,
      explain:
        "A setup project logs in once and writes the context's storage to JSON; test projects load that file into every new context via use.storageState. Tests remain fully isolated — they just skip the login form. It does not share live state between tests.",
    },
    {
      question:
        "With trace: 'on-first-retry' configured, when is a trace recorded and how do you view it?",
      options: [
        "On every test run; view it in the HTML report only",
        "Only when a failed test retries; open it with npx playwright show-trace",
        "Only in headed mode; view it with --debug",
        "On the first run of each test; view it with console.log",
      ],
      answerIndex: 1,
      explain:
        "'on-first-retry' records tracing only for the retry of a failed test, so green runs pay no overhead. npx playwright show-trace opens the viewer with per-action DOM snapshots, network, and console — a time-travel view of the failed run.",
    },
  ],
};

export default lesson;
