import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "playwright-first-e2e",
  title: "Playwright: Your First E2E Test",
  part: "Integration & E2E",
  estMinutes: 11,
  summary:
    "Playwright drives real Chromium, Firefox, and WebKit browsers through your app — with user-facing locators and auto-waiting that replace the sleep()-riddled scripts of the Selenium era.",

  concept: `
You have been doing end-to-end testing for twenty-five years — by hand. Open
the browser, log in, click through the flow, squint at the result. Playwright
is that exact activity, automated: it launches a **real browser** (Chromium,
Firefox, or WebKit), performs the clicks and keystrokes, and asserts on what a
user would actually see. It sits at the very top of the pyramid: the slowest,
most expensive tests you own — and the only ones that prove the whole stack is
wired together.

Playwright is still on major version 1 (1.x) — no v2 exists; it ships
improvements continuously on the 1.x line.

### Setup in one command

\`\`\`bash
npm init playwright@latest
\`\`\`

That scaffolds \`playwright.config.ts\`, a \`tests/\` folder with an example
spec, optionally a CI workflow, and downloads the browser binaries. Then
\`npx playwright test\` runs every spec headlessly, in parallel, across the
browsers configured in \`playwright.config.ts\`.

### The anatomy of a test

\`\`\`ts
// tests/login.spec.ts
import { test, expect } from '@playwright/test';

test('user can sign in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('jo@example.com');
  await page.getByLabel('Password').fill('hunter2!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
\`\`\`

\`test\` and \`expect\` come from \`@playwright/test\` — not from Vitest; a
Playwright project is its own runner. The \`{ page }\` argument is a
**fixture**: Playwright hands each test a fresh page in an isolated browser
context, so tests can't leak cookies or storage into each other.

### Locators: find things the way a user does

\`page.getByRole('button', { name: 'Sign in' })\` reads like a user's
intention, not like DOM plumbing. That is deliberate — Playwright's
recommended locators are **user-facing**: \`getByRole\` (accessibility role +
accessible name), \`getByLabel\` (form fields by their label), \`getByText\`,
\`getByPlaceholder\`. If Testing Library's query priority felt familiar here,
it should: both tools converged on the same philosophy. A CSS selector like
\`.btn-primary > span\` breaks when a designer renames a class; "the button
named Sign in" breaks only when the feature does. As a bonus, if
\`getByRole\` can't find your button, that's often an accessibility bug too.

### Auto-waiting: the death of sleep(2)

The single biggest upgrade over Selenium-era habits: **actions wait for
elements to be actionable**. Before clicking, Playwright automatically waits
for the element to be attached, visible, stable (not mid-animation), enabled,
and unobscured — retrying until a timeout. There is no \`sleep(2)\` in a
Playwright test, ever. Old browser suites were pincushioned with sleeps: too
short and the test flakes on a slow CI box; too long and a 40-test suite takes
20 minutes standing still. Auto-waiting waits *exactly as long as needed* —
and the same applies to assertions like \`toBeVisible()\`, which retry until
the condition holds or the timeout expires.
`,

  comparisons: [
    {
      label: "Selenium-with-sleeps vs Playwright",
      intro:
        "The same login flow, automated twice. The left script is the Selenium-era style: locate by CSS, pray, and pad every step with sleeps. The right one is a Playwright test.",
      php: `// login-check.js — Selenium-era WebDriver script
const driver = await new Builder().forBrowser('chrome').build();

await driver.get('http://localhost:3000/login');
await driver.sleep(2000); // "wait for page load"... hopefully

await driver.findElement(By.css('#email')).sendKeys('jo@example.com');
await driver.findElement(By.css('#pw')).sendKeys('hunter2!');
await driver.findElement(By.css('.btn-primary')).click();

await driver.sleep(3000); // dashboard "should" be there by now

const h1 = await driver.findElement(By.css('h1')).getText();
if (h1 !== 'Dashboard') throw new Error('login broken?');
// 5 seconds of dead sleep per run — and it STILL flakes on slow CI.`,
      ts: `// tests/login.spec.ts
import { test, expect } from '@playwright/test';

test('user can sign in', async ({ page }) => {
  await page.goto('/login');

  // No sleeps: every action waits for its element to be
  // visible, enabled, stable — then acts.
  await page.getByLabel('Email').fill('jo@example.com');
  await page.getByLabel('Password').fill('hunter2!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Retries until the heading appears (or times out):
  await expect(
    page.getByRole('heading', { name: 'Dashboard' })
  ).toBeVisible();
});`,
      note:
        "The sleeps are gone because Playwright auto-waits for actionability on every action and retries every assertion — the test takes exactly as long as the app does, no more, and doesn't flake when CI is slow.",
      leftLang: "js",
    },
    {
      label: "Regex-scraping the HTML vs driving the real UI",
      intro:
        "How you'd have smoke-tested a login in a PHP shop: curl the page and grep the response. Playwright instead runs the JavaScript, renders the page, and checks what a user sees.",
      php: `<?php
// smoke-test.php — asserts on raw HTML, not behaviour
$html = file_get_contents('http://localhost/login');

if (!str_contains($html, '<form')) {
    exit("FAIL: no form markup\\n");
}

// POST like a browser... except nothing client-side runs:
// no JS validation, no fetch(), no redirect handling, no
// rendered dashboard. A blank white screen still "passes".
$ctx = stream_context_create(['http' => [
    'method'  => 'POST',
    'content' => http_build_query([
        'email' => 'jo@example.com', 'pw' => 'hunter2!',
    ]),
]]);
$res = file_get_contents('http://localhost/login', false, $ctx);
echo str_contains($res, 'Dashboard') ? "OK\\n" : "FAIL\\n";`,
      ts: `// tests/login.spec.ts — a real browser, the real app
import { test, expect } from '@playwright/test';

test('user can sign in', async ({ page }) => {
  // Real Chromium: JS runs, CSS applies, fetch() fires.
  await page.goto('/login');

  await page.getByLabel('Email').fill('jo@example.com');
  await page.getByLabel('Password').fill('hunter2!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Asserts what the USER sees after client-side routing:
  await expect(
    page.getByRole('heading', { name: 'Dashboard' })
  ).toBeVisible();
});
// One test, three engines: npx playwright test runs it in
// Chromium, Firefox and WebKit per your config.`,
      note:
        "The curl-and-grep script proves the server emits bytes; Playwright proves the application works — JavaScript executed, page rendered, flow completed — in every engine you configure.",
    },
    {
      label: "CSS selectors vs user-facing locators",
      intro:
        "Two ways to point at the same button. One is coupled to the DOM's private structure; the other to what the user perceives.",
      php: `// Locating by implementation detail:
await page.click('#app > div.card > form button.btn-primary');

// Breaks when:
//  - a designer renames btn-primary
//  - the form gains a wrapper div
//  - the CSS framework is swapped
// None of those are user-visible changes.`,
      ts: `// Locating by what the user perceives:
await page.getByRole('button', { name: 'Sign in' }).click();

// Breaks when:
//  - the button stops being a button
//  - its visible name changes
// Both of those ARE user-visible changes — a test
// failure you actually want. And if getByRole can't
// find it, your markup may have an accessibility bug.`,
      note:
        "Same philosophy as Testing Library's query priority — role and accessible name first. Playwright and Testing Library converged on this independently, which is a good sign it's right.",
      leftLang: "ts",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "A read-and-predict transcript. First run: the suite passes. Then the app's dashboard heading is renamed to 'Overview' while the test still expects 'Dashboard' — predict what the failing output pinpoints before revealing it.",
    code: `# Scaffold once: config, tests/, browser binaries
npm init playwright@latest

# Run the whole suite — headless, parallel, no server of sleeps:
npx playwright test

# Someone renames the dashboard <h1> to "Overview".
# The test still expects "Dashboard". Run just that spec:
npx playwright test tests/login.spec.ts`,
    output: `$ npx playwright test

Running 4 tests using 2 workers
  4 passed (6.8s)

To open last HTML report run:

  npx playwright show-report

$ npx playwright test tests/login.spec.ts

Running 1 test using 1 worker

  1) [chromium] › tests/login.spec.ts:4:5 › user can sign in ─────────────

    Error: expect(locator).toBeVisible() failed

    Locator:  getByRole('heading', { name: 'Dashboard' })
    Expected: visible
    Received: <element(s) not found>
    Timeout:  5000ms

    Call log:
      - Expect "toBeVisible" with timeout 5000ms
      - waiting for getByRole('heading', { name: 'Dashboard' })

       9 |   await page.getByRole('button', { name: 'Sign in' }).click();
      10 |
    > 11 |   await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
         |                                                                   ^
      12 | });

    1 failed
      [chromium] › tests/login.spec.ts:4:5 › user can sign in`,
  },

  keyPoints: [
    "Playwright (major version 1.x) drives real Chromium, Firefox, and WebKit — it is your decades of manual browser-clicking, automated.",
    "`npm init playwright@latest` scaffolds config, an example spec, and the browser binaries; `npx playwright test` runs everything headlessly and in parallel.",
    "`test` and `expect` come from `@playwright/test` — its own runner, not Vitest — and the `{ page }` fixture gives each test a fresh, isolated browser context.",
    "Prefer user-facing locators: `getByRole('button', { name: 'Sign in' })`, `getByLabel`, `getByText` — the same philosophy as Testing Library, and far more change-resistant than CSS selectors.",
    "Auto-waiting kills `sleep(2)`: every action waits until its element is visible, stable, and enabled, and assertions like `toBeVisible()` retry until they pass or time out.",
    "E2E tests are the slowest, most expensive layer — they exist to prove the stack is wired together, not to test every rule.",
  ],

  interview: [
    {
      q: "What does Playwright's auto-waiting do, and why does it matter compared to Selenium-era tests?",
      a: "Before performing any action, Playwright waits for the target element to be actionable — attached to the DOM, visible, stable (not animating), enabled, and not covered by another element — retrying until a timeout. Assertions like `toBeVisible()` retry the same way. That eliminates the manual `sleep(2)` calls that plagued Selenium-era suites, which were both too slow (fixed padding on every step) and too flaky (any CI slowdown blew past the padding). A Playwright test takes exactly as long as the app takes, and a genuine failure surfaces as a clear timeout with the locator named, not a random NoSuchElementException.",
    },
    {
      q: "Why does Playwright recommend getByRole over CSS selectors?",
      a: "Because it locates elements the way users perceive them — by accessibility role and accessible name — instead of by the DOM's private structure. `.card > form .btn-primary` breaks on any refactor or class rename even when the UI is unchanged; `getByRole('button', { name: 'Sign in' })` only breaks when something user-visible changes, which is precisely when I want a failure. It's the same query-priority philosophy Testing Library uses for component tests, so the whole suite tests behaviour at every layer. It also doubles as an accessibility check: if the role query can't find the button, screen readers probably can't either.",
    },
    {
      q: "Where do end-to-end tests fit in your overall testing strategy?",
      a: "At the top of the pyramid, and deliberately few. They're the only tests that prove the full stack — browser, frontend, API, database — is wired together, so I keep a small set covering the critical user journeys: sign-up, login, the money path. But they're the slowest and most expensive tests to run and maintain, so anything that can be verified lower down — validation rules, business logic, API contracts — is tested there instead. E2E answers 'is it connected?'; units and integration tests answer 'is it correct?'.",
    },
  ],

  quiz: [
    {
      question:
        "What does Playwright do automatically before clicking an element?",
      options: [
        "Takes a screenshot for the report",
        "Waits for the element to be attached, visible, stable, enabled, and unobscured — retrying until a timeout",
        "Scrolls the page to the top and clears cookies",
        "Sleeps for a configurable default of 2 seconds",
      ],
      answerIndex: 1,
      explain:
        "That set of checks is 'actionability'. Playwright retries them until they all pass or the timeout expires, then acts — which is exactly why hand-written sleeps are unnecessary. It never inserts fixed sleeps itself.",
    },
    {
      question:
        "Which locator best matches Playwright's recommended style for clicking a submit button labelled 'Create account'?",
      options: [
        "page.locator('#root > form > div:nth-child(3) > button')",
        "page.locator('.btn.btn-primary')",
        "page.getByRole('button', { name: 'Create account' })",
        "page.locator('//button[@class=\"btn-primary\"]')",
      ],
      answerIndex: 2,
      explain:
        "User-facing locators — role plus accessible name — survive refactors and class renames, and fail only when something the user would notice changes. CSS and XPath selectors couple the test to the DOM's implementation details.",
    },
    {
      question: "Where do `test` and `expect` come from in a Playwright spec?",
      options: [
        "From 'vitest' — Playwright reuses the Vitest runner",
        "From '@playwright/test' — Playwright ships its own runner and assertions",
        "They are global — no import needed",
        "From '@testing-library/dom'",
      ],
      answerIndex: 1,
      explain:
        "A Playwright project is a separate runner: `import { test, expect } from '@playwright/test'`. Its `expect` includes web-first assertions like toBeVisible that retry against live locators — behaviour Vitest's expect doesn't have.",
    },
  ],
};

export default lesson;
