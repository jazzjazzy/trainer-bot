import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "the-testing-pyramid",
  title: "The Testing Pyramid",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "Unit, integration, and end-to-end tests each verify something different at a different cost — the pyramid shape puts breadth where iteration is cheap.",

  concept: `
Not all tests are the same kind of thing. The classic mental model is a
**pyramid** with three layers, and the shape is the point: **many** fast unit
tests at the base, **fewer** integration tests in the middle, a **handful**
of end-to-end tests at the top.

### The three layers

**Unit tests** verify one piece of logic in isolation — a function, a class,
a module — with no network, no database, no browser. They run in about a
millisecond each, so you can have thousands and still get an answer in
seconds. When one fails, the broken code is usually in the file named in the
failure. In this course: **Vitest 4** for TypeScript, **pytest 9** for Python.

**Integration tests** verify that your pieces work *together*: an HTTP
request through your real router, validation, and handler, often against a
real (test) database. Slower — tens to hundreds of milliseconds — and a
failure needs some diagnosis, but they catch the wiring bugs unit tests
can't. In this course: supertest-style HTTP tests in Node and FastAPI's
\`TestClient\` in Python.

**End-to-end (e2e) tests** drive a real browser against the running system:
click, type, assert what a user would see. Maximum confidence per test —
and maximum cost: seconds each, a whole running stack, and the most
maintenance when the UI changes. In this course: **Playwright 1.x**, kept
for a handful of critical journeys (sign up, log in, check out).

### Why the shape matters

Each step up the pyramid buys realism and pays for it three times over:

- **Speed** — 1ms → ~100ms → several seconds. Multiply by count: 500 unit
  tests finish before one e2e test has launched its browser.
- **Precision** — a unit failure names the broken function; an e2e failure
  says "the checkout page is wrong, somewhere, for some reason".
- **Maintenance** — e2e tests break when *anything* on the path changes,
  including things that aren't bugs.

So you want the bulk of your confidence coming from the cheap, precise
base, and the expensive top reserved for proving the layers are glued
together on the journeys that pay the bills.

### The ice-cream cone

Invert the pyramid and you get the **ice-cream cone**: almost no unit
tests, a few automated UI scripts, and a giant blob of manual QA on top.
That is precisely the traditional PHP-shop workflow — every release
verified by hand, slowest checks run most often, feedback in days instead
of milliseconds. It's worth naming in interviews: recognising the
anti-pattern you used to live in is strong evidence you understand why the
pyramid is shaped the way it is.

### The map for this course

\`\`\`text
        /  e2e  \\        Playwright 1.x          (Part 4)
       / integr. \\       supertest, TestClient    (Part 4)
      /   unit    \\      Vitest 4, pytest 9       (Parts 2–3)
\`\`\`

One behaviour — "a user can register" — can be verified at all three
levels, and the comparisons below show what that actually looks like. The
levels aren't rivals; they answer different questions. The unit test asks
*is the password rule right?* The integration test asks *does POST
/register wire validation to storage?* The e2e test asks *can a human
actually sign up in a browser?*
`,

  comparisons: [
    {
      label: "'User can register' — release checklist vs unit test",
      intro:
        "The base of the pyramid replaces the manual checklist item with a millisecond-fast check of the core rule.",
      php: `<?php
// RELEASE-CHECKLIST.txt (the ice-cream cone's base layer)
// [ ] Open /register in the browser
// [ ] Try password "abc" -> should show error
// [ ] Try password "correct horse battery" -> should pass
// [ ] Try existing email -> should show error
// ... 37 more items, ~2 hours, every release,
//     skipped when the release is running late.
function isStrongPassword(string $pw): bool {
    return strlen($pw) >= 12;
}`,
      ts: `// password.test.ts — unit level: pure logic, ~1ms, thousands can run per second
import { expect, test } from 'vitest';
import { isStrongPassword } from './password';

test('accepts a 12-character password', () => {
  expect(isStrongPassword('abcdefghijkl')).toBe(true);
});

test('rejects 11 characters (boundary)', () => {
  expect(isStrongPassword('abcdefghijk')).toBe(false);
});`,
      note:
        "Same rule, but the unit test runs on every commit in a millisecond and tests the boundary exactly — the checklist ran per release and only when there was time.",
    },
    {
      label: "The middle layer: is the endpoint wired correctly?",
      intro:
        "The password rule can be perfect while POST /register is broken — wrong route, validation never called, nothing saved. The integration test exercises the real HTTP path.",
      php: `// register.test.ts — unit level only
import { expect, test } from 'vitest';
import { isStrongPassword } from './password';

// Passes even if:
//  - the route is registered as /signup, not /register
//  - the handler forgets to CALL isStrongPassword
//  - the user is validated but never saved
test('rejects a weak password', () => {
  expect(isStrongPassword('abc')).toBe(false);
});`,
      ts: `// register.int.test.ts — integration: real router + handler + test DB
import { expect, test } from 'vitest';
import request from 'supertest';
import { app } from './app';

test('POST /register rejects a weak password with 422', async () => {
  const res = await request(app)
    .post('/register')
    .send({ email: 'ada@example.com', password: 'abc' });

  expect(res.status).toBe(422);
  expect(res.body.errors.password).toMatch(/at least 12/);
});`,
      note:
        "Integration tests catch wiring bugs — routing, middleware order, serialisation, persistence — that no amount of unit testing can see. Cost: ~50–200ms each instead of ~1ms.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "The top: a real browser, a real user journey",
      intro:
        "One Playwright test proves the whole stack — rendered form, client validation, HTTP, backend, database — from the user's side of the glass.",
      php: `// register.int.test.ts — integration level only
// Proves the API contract, but NOT that:
//  - the form actually renders and submits
//  - client-side code sends the right payload
//  - the success page appears to a human
import request from 'supertest';
import { app } from './app';
import { expect, test } from 'vitest';

test('POST /register creates a user', async () => {
  const res = await request(app)
    .post('/register')
    .send({ email: 'ada@example.com', password: 'correct horse battery' });
  expect(res.status).toBe(201);
});`,
      ts: `// register.e2e.ts — Playwright: seconds per test, so only critical journeys
import { expect, test } from '@playwright/test';

test('a visitor can register', async ({ page }) => {
  await page.goto('/register');

  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Web-first assertion: auto-retries until the heading appears.
  await expect(
    page.getByRole('heading', { name: 'Welcome, ada@example.com' })
  ).toBeVisible();
});`,
      note:
        "Maximum realism, maximum cost: seconds per test and a running stack. That's why the pyramid keeps e2e to a handful of journeys — this one test plus dozens of unit tests beats forty fragile browser scripts.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The pyramid's economics as a simulation: 50 unit tests at ~1ms each versus 3 e2e tests at ~4000ms each, tallied on a virtual clock. Predict the two summary lines before you run — then try making unit tests 10x slower and see how little it changes the verdict.",
    code: `// The pyramid's economics, simulated. Each fake test carries the cost
// profile of its layer; the runner tallies a virtual clock.

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(\`expected \${expected} but got \${actual}\`);
      }
    },
  };
}

interface SimTest {
  name: string;
  costMs: number; // what this layer typically costs per test
  fn: () => void;
}

function runLayer(layer: string, tests: SimTest[]) {
  let clock = 0;
  let passed = 0;
  for (const t of tests) {
    clock += t.costMs;
    try {
      t.fn();
      passed++;
    } catch (e) {
      console.log(\`  FAIL \${t.name}: \${(e as Error).message}\`);
    }
  }
  console.log(\`\${layer}: \${passed}/\${tests.length} passed in ~\${clock}ms\`);
}

// 50 unit tests at ~1ms each: pure functions, no I/O.
const priceAfterDiscount = (p: number, pct: number) =>
  Math.round(p * (1 - pct) * 100) / 100;

const unitTests: SimTest[] = [];
for (let i = 1; i <= 50; i++) {
  unitTests.push({
    name: \`discount case \${i}\`,
    costMs: 1,
    fn: () => expect(priceAfterDiscount(i * 10, 0.1)).toBe(i * 9),
  });
}

// 3 e2e tests at ~4000ms each: browser boot, navigation, real backend.
const e2eTests: SimTest[] = [
  { name: "user can register", costMs: 4000, fn: () => expect(true).toBe(true) },
  { name: "user can log in", costMs: 4000, fn: () => expect(true).toBe(true) },
  { name: "user can check out", costMs: 4000, fn: () => expect(true).toBe(true) },
];

runLayer("unit (50 tests)", unitTests);
runLayer("e2e  (3 tests)", e2eTests);

// 50 unit tests cost less than 2% of ONE e2e test. That ratio is the
// entire argument for the pyramid: put breadth where iteration is free,
// and spend the expensive layer only on whole-system journeys.`,
  },

  keyPoints: [
    "Unit tests verify isolated logic in ~1ms (Vitest 4, pytest 9); integration tests verify wiring through real HTTP/DB paths (supertest, TestClient); e2e tests drive a real browser (Playwright 1.x).",
    "The shape is the point: thousands of cheap precise tests at the base, a handful of expensive realistic ones at the top.",
    "Each step up buys realism and pays in speed, failure precision, and maintenance — an e2e failure says 'something broke somewhere'; a unit failure names the function.",
    "The ice-cream cone — all manual QA and UI scripts, no unit base — is the traditional PHP-shop workflow, and naming it as an anti-pattern is strong interview material.",
    "The levels answer different questions: is the rule right (unit), is it wired in (integration), can a human actually do it (e2e) — they complement, not compete.",
    "Reserve e2e for the journeys that pay the bills: sign up, log in, check out.",
  ],

  interview: [
    {
      q: "Explain the testing pyramid and why it's shaped that way.",
      a: "Three layers: a wide base of unit tests verifying isolated logic in about a millisecond each; a middle of integration tests proving components are wired together correctly — real HTTP routes, real test database; and a narrow top of end-to-end tests driving a browser through complete user journeys. The shape follows from cost: each layer up is slower, less precise about what broke, and more expensive to maintain. A unit failure names the broken function; an e2e failure just says the page is wrong. So you extract most of your confidence from the cheap, precise base and spend the expensive top only on critical journeys like registration and checkout. In my stack that's Vitest and pytest at the base, supertest and FastAPI's TestClient in the middle, and Playwright on top.",
    },
    {
      q: "What is the ice-cream cone anti-pattern, and have you seen it?",
      a: "It's the pyramid inverted: a huge amount of manual QA on top, some fragile UI automation, and almost no unit tests underneath. I've lived it — traditional PHP shops verify releases with a human and a checklist, which means the slowest, least repeatable checks run most often and feedback arrives in days rather than milliseconds. The failure mode is predictable: releases slow down, the checklist gets skipped under deadline pressure, and regressions ship in features nobody re-clicked. The fix isn't 'automate the checklist in a browser' — forty Selenium scripts are still a cone — it's pushing verification down: unit-test the rules, integration-test the wiring, and keep only a handful of browser journeys.",
    },
    {
      q: "If unit tests are so much cheaper, why not test everything at the unit level and skip the rest?",
      a: "Because unit tests can't see wiring. Every unit can be individually correct while the system is broken: the route registered under the wrong path, validation never invoked by the handler, a serialisation mismatch between layers, a transaction that never commits. Integration tests exist precisely to catch that class of bug, and e2e tests catch the final class — the browser-side reality of forms, scripts, and rendering. The pyramid isn't 'unit tests are best'; it's 'buy each kind of confidence at the cheapest layer that can deliver it'. Rules at the bottom, glue in the middle, a few whole journeys on top.",
    },
  ],

  quiz: [
    {
      question:
        "Why does the pyramid recommend many unit tests but only a handful of e2e tests?",
      options: [
        "E2e tests are less trustworthy than unit tests",
        "Each layer up costs more in speed, failure precision, and maintenance, so breadth belongs at the cheap base",
        "Browsers can only run a limited number of tests per session",
        "Unit tests cover the UI as well, making e2e mostly redundant",
      ],
      answerIndex: 1,
      explain:
        "E2e tests are highly trustworthy — that's their appeal — but they cost seconds each, fail imprecisely, and break when anything on the path changes. The pyramid allocates volume by cost: thousands of ~1ms precise checks at the base, a few expensive whole-journey proofs on top.",
    },
    {
      question:
        "The password rule has perfect unit tests, yet users can't register because the handler never calls the validator. Which layer catches this?",
      options: [
        "More unit tests on the password rule",
        "A static type check",
        "An integration test posting to /register through the real router and handler",
        "A code-coverage report",
      ],
      answerIndex: 2,
      explain:
        "This is a wiring bug — every unit is correct in isolation, but they aren't connected. An integration test exercising the real HTTP path (supertest, TestClient) fails immediately. Unit tests, types, and coverage all look green because each piece individually works.",
    },
    {
      question: "What is the ice-cream cone anti-pattern?",
      options: [
        "Writing tests only after the code is complete",
        "Testing the same behaviour at every layer of the pyramid",
        "An inverted pyramid: mostly manual QA and UI scripts, with almost no unit test base",
        "Running e2e tests before unit tests in CI",
      ],
      answerIndex: 2,
      explain:
        "The cone inverts the pyramid: the slowest, least repeatable verification (manual QA, fragile browser scripts) carries most of the load, with little or no fast unit base — the classic manual-release workflow. The fix is pushing verification down to the cheapest layer that can provide it.",
    },
  ],
};

export default lesson;
