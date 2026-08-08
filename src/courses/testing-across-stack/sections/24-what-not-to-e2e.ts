import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "what-not-to-e2e",
  title: "What NOT to E2E",
  part: "Integration & E2E",
  estMinutes: 10,
  summary:
    "E2E tests are the slowest, flakiest, most expensive layer — reserve them for a handful of critical user journeys and push every permutation down to unit tests.",

  concept: `
Once Playwright clicks its first button for you, there is a powerful
temptation: test *everything* this way. It looks so thorough — a real browser,
the real app, exactly what a user does. Resist it. Knowing what **not** to
end-to-end test is the judgment call that this whole layer turns on, and it is
a question interviewers love because it has no syntax to memorise.

### The economics of the top layer

An e2e test costs more than any other kind, on three axes:

- **Speed** — seconds per test (browser, network, real backend) versus
  milliseconds for a unit test. A 300-test e2e suite is a 30-minute CI wait.
- **Flakiness** — every real dependency (network, timing, animations, test
  data, third-party scripts) is a new way to fail for reasons other than a
  bug. Flake probability compounds per test.
- **Diagnosis** — a red unit test names a function and a line; a red e2e test
  hands you a trace and a mystery that could live anywhere in the stack.

None of that makes e2e bad. It makes it *expensive*, and expensive things are
rationed.

### What e2e is actually for

E2E verifies **wiring**: that the frontend really talks to the API, the API
really hits the database, the session really survives the redirect. Reserve it
for the critical user journeys — the flows where a breakage costs money or
trust *and* that no lower layer can prove end to end:

- sign-up and login
- checkout / payment — the money path
- the one workflow your product exists for

A handful of smoke journeys — commonly a dozen or two, not hundreds — each
walking one realistic happy path (plus perhaps one high-value failure path,
like a declined card).

### The smell: permutations through the browser

The classic mistake is validating every form-field combination through the
browser: empty email, bad email, short password, no digit, no uppercase... 12
permutations at ~7 seconds each. Every one of those rules is a pure function
decision that a unit test proves in a millisecond. The browser adds nothing to
rule 7 that it didn't already prove with rule 1 — by then you know the field
wires to the validator and errors render. The remaining permutations belong in
a table-driven unit test (\`it.each\` — your PHPUnit data providers).

### The heuristic to say out loud

> **Test the flow once end-to-end; test the logic exhaustively below.**

One e2e journey proves the pieces are connected. The unit layer proves each
piece is correct, in every case, at a price where "every case" is affordable.
When someone proposes a new e2e test, ask: *does this prove a connection no
existing test proves?* If it only proves logic, it belongs lower. That single
question keeps an e2e suite at 20 tests instead of 300 — and keeps the team
actually trusting it.
`,

  comparisons: [
    {
      label: "12 permutations in the browser vs one journey + a unit table",
      intro:
        "Both suites verify the same signup validation rules. The left one drives every permutation through Chromium; the right proves the wiring once and the rules exhaustively below.",
      php: `// signup.spec.ts — 12 browser round-trips, ~80 seconds
test('rejects empty email', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Password').fill('Str0ngAndL0ng!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('email: invalid')).toBeVisible();
});

test('rejects email without @', async ({ page }) => { /* 7s */ });
test('rejects short password', async ({ page }) => { /* 7s */ });
test('rejects password without digit', async ({ page }) => { /* 7s */ });
test('rejects password without uppercase', async ({ page }) => { /* 7s */ });
// ...7 more near-identical tests. Rule #12 proves nothing
// about the WIRING that rule #1 didn't already prove.`,
      ts: `// signup.spec.ts — ONE journey proves the wiring (~7s)
test('signup: happy path', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Email').fill('jo@example.com');
  await page.getByLabel('Password').fill('Str0ngAndL0ng!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome' }))
    .toBeVisible();
});

// signup-rules.test.ts — EVERY rule, milliseconds (Vitest)
it.each([
  ['no-at-sign', 'Str0ngAndL0ng!', ['email: invalid']],
  ['a@b.dev',    'Sh0rt!',         ['password: too short']],
  ['a@b.dev',    'nodigitshere!',  ['password: needs a digit',
                                    'password: needs uppercase']],
  // ...all 12 cases — adding one costs a LINE, not 7 seconds
])('signupErrors(%s, %s) -> %j', (email, pw, want) => {
  expect(signupErrors(email, pw)).toEqual(want);
});`,
      note:
        "it.each is your PHPUnit data provider. The e2e test proves field → validator → error rendering is connected; the table proves every rule. Total: ~7 seconds plus milliseconds, instead of ~80 flaky seconds.",
      leftLang: "ts",
    },
    {
      label: "Asserting business logic through the UI vs at its own layer",
      intro:
        "The requirement: orders over 100 euros ship free. One test proves it by clicking through checkout; the other tests the pricing module directly and lets e2e prove only that a total renders.",
      php: `// checkout.spec.ts — business rule held hostage by the UI
test('free shipping over 100', async ({ page }) => {
  await page.goto('/products/keyboard');       // 89.00
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/products/mouse');          // 15.00
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/checkout');

  await expect(page.getByTestId('shipping')).toHaveText('Free');
});
// Breaks when: prices change, layout changes, cart animation
// changes, seed data changes... none of which is the rule.
// And you'd need MORE of these for 99.99, 100.00, 100.01.`,
      ts: `// pricing.test.ts — the rule, exhaustively, in milliseconds
it.each([
  [99.99, 4.95],   // just under the line
  [100.0, 0],      // exactly on it — the case that finds bugs
  [100.01, 0],
])('shipping for subtotal %f is %f', (subtotal, want) => {
  expect(shippingCost(subtotal)).toBe(want);
});

// checkout.spec.ts — e2e only proves a total RENDERS
test('checkout shows a shipping line', async ({ page }) => {
  await addItemsTotalling(page, 120);
  await page.goto('/checkout');
  await expect(page.getByTestId('shipping')).toBeVisible();
});`,
      note:
        "Boundary cases (99.99 / 100.00 / 100.01) are where the bugs are, and only the unit layer can afford to test all of them. The e2e keeps one job: the pricing module's answer actually reaches the screen.",
      leftLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A cost simulation: the same 12 validation rules priced at the e2e layer versus the unit layer. The table of unit cases actually runs; the totals compare the strategies. Predict the ratio before you run it.",
    code: `// The same 12 validation rules, priced at two layers of the pyramid.

// The logic — a pure function, trivially unit-testable:
function signupErrors(email: string, password: string): string[] {
  const errors: string[] = [];
  if (!email.includes('@')) errors.push('email: invalid');
  if (email.length > 254) errors.push('email: too long');
  if (password.length < 12) errors.push('password: too short');
  if (!/[0-9]/.test(password)) errors.push('password: needs a digit');
  if (!/[A-Z]/.test(password)) errors.push('password: needs uppercase');
  if (password.toLowerCase().includes('password')) errors.push('password: too common');
  return errors;
}

// Table-driven unit tests — every rule, both directions:
const cases: Array<[string, string, string[]]> = [
  ['a@b.dev', 'Str0ngAndL0ng!', []],
  ['no-at-sign', 'Str0ngAndL0ng!', ['email: invalid']],
  ['a@b.dev', 'Sh0rt!', ['password: too short']],
  ['a@b.dev', 'NoDigitsHereAtAll!', ['password: needs a digit']],
  ['a@b.dev', 'nouppercase111!', ['password: needs uppercase']],
  ['a@b.dev', 'MyPassword12345', ['password: too common']],
  ['no-at-sign', 'sh0rt', ['email: invalid', 'password: too short', 'password: needs uppercase']],
  ['a@b.dev', 'PASSWORD12345678', ['password: too common']],
  ['a@b.dev', 'Abcdefghijk1', []],
  ['x'.repeat(255) + '@b.dev', 'Str0ngAndL0ng!', ['email: too long']],
  ['no-at' + 'x'.repeat(255), 'Str0ngAndL0ng!', ['email: invalid', 'email: too long']],
  ['a@b.dev', '', ['password: too short', 'password: needs a digit', 'password: needs uppercase']],
];

let passed = 0;
for (const [email, pw, want] of cases) {
  const got = signupErrors(email, pw);
  if (JSON.stringify(got) === JSON.stringify(want)) passed++;
  else console.log(\`FAIL  \${email} / \${pw}: got \${JSON.stringify(got)}\`);
}
console.log(\`unit layer: \${passed}/\${cases.length} cases passed\`);
console.log('');

// Now price the two strategies. Realistic per-test costs:
const E2E_MS = 6500;   // launch context, load page, fill form, submit, assert
const UNIT_MS = 3;     // call a function

const allThroughBrowser = cases.length * E2E_MS;
const pyramid = 1 * E2E_MS + cases.length * UNIT_MS;

const fmt = (ms: number) => (ms / 1000).toFixed(1).padStart(6) + 's';
console.log('strategy                        tests        total');
console.log('----------------------------------------------------');
console.log(\`all 12 rules via the browser    12 e2e      \${fmt(allThroughBrowser)}\`);
console.log(\`1 happy path + unit table       1 e2e + 12  \${fmt(pyramid)}\`);
console.log('');
console.log(\`same rules covered, \${(allThroughBrowser / pyramid).toFixed(0)}x faster — and the unit\`);
console.log('failures name the exact rule instead of a screenshot.');`,
  },

  keyPoints: [
    "E2E tests are the most expensive layer on three axes: seconds per test, compounding flake probability, and slow diagnosis when red.",
    "Reserve e2e for critical user journeys — signup, login, the money path — as a handful of smoke flows, not hundreds of permutation tests.",
    "The smell: validating every form-field combination through the browser when each rule is a pure-function decision a unit test proves in a millisecond.",
    "E2E verifies the pieces are *wired* (field → validator → rendered error); unit tests verify the *logic* of each piece, exhaustively.",
    "The interview-ready heuristic: test the flow once end-to-end, test the logic exhaustively below.",
    "Gatekeeping question for any proposed e2e test: does it prove a connection no existing test proves? If it only proves logic, push it down.",
  ],

  interview: [
    {
      q: "How do you decide what belongs in the e2e suite versus lower layers?",
      a: "My heuristic is: test the flow once end-to-end, test the logic exhaustively below. E2E is the only layer that proves the stack is wired together — browser to API to database — so it earns a small set of critical journeys: signup, login, checkout, the workflow the product exists for. Everything that is a logic decision — validation rules, pricing boundaries, permission checks — goes into unit or integration tests where each case costs milliseconds instead of seconds. When a new e2e test is proposed, I ask whether it proves a *connection* no existing test proves; if it only re-proves logic through a browser, it moves down the pyramid.",
    },
    {
      q: "Why is a large e2e suite a liability rather than extra safety?",
      a: "Because its costs compound in ways that eventually make the team ignore it. Speed: at several seconds per test, hundreds of e2e tests turn CI into a half-hour queue, so people stop running them before merging. Flakiness: every test rides the network, timing, animations, and test data, so failure-for-no-bug probability grows with suite size — and once a suite cries wolf, red stops meaning anything. Diagnosis: an e2e failure could be anywhere in the stack, so each red test costs real investigation time. Twenty trusted journeys that always mean 'the product is broken' are worth more than three hundred that are red for weather.",
    },
    {
      q: "Your team's Playwright suite tests 12 signup validation permutations. What would you change?",
      a: "Keep one, move eleven. One e2e happy path — and perhaps one failure path — proves the field wires to the validator and errors actually render. The twelfth browser permutation proves nothing about wiring that the first didn't. The rules themselves become a table-driven Vitest suite with `it.each` — the same idea as a PHPUnit data provider — where adding a case costs one line and a millisecond, so we can afford boundary cases like exactly-100.00 that browser tests never get around to. Net effect: coverage goes up, the suite drops from ~80 seconds to ~7, and failures name the exact rule that broke.",
    },
  ],

  quiz: [
    {
      question:
        "Which of these is the best candidate for an end-to-end test?",
      options: [
        "Every combination of invalid signup inputs",
        "The checkout flow from cart to order confirmation",
        "A price-rounding function's behaviour at 0.005",
        "The error message copy for a too-short password",
      ],
      answerIndex: 1,
      explain:
        "Checkout is a critical user journey — the money path — and only an e2e test proves that browser, API, payment integration, and database are wired together. The other three are logic or copy decisions that unit tests cover exhaustively at a fraction of the cost.",
    },
    {
      question:
        "What does an e2e test prove that a unit test cannot, in the phrase 'e2e verifies wiring, units verify logic'?",
      options: [
        "That the code has no bugs anywhere",
        "That each validation rule returns the right message",
        "That the real pieces are connected — the form actually reaches the validator and the result actually renders in a browser",
        "That the code is fast enough for production",
      ],
      answerIndex: 2,
      explain:
        "Unit tests exercise a piece in isolation, so they can never prove the pieces talk to each other in the running app. That integration proof is e2e's unique job — which is also why one journey per flow is enough, and permutations add cost without adding proof.",
    },
    {
      question:
        "A 12-permutation e2e validation suite (~7s each) is replaced by 1 e2e happy path plus a 12-case it.each unit table (~3ms per case). Roughly what happens to runtime and coverage?",
      options: [
        "Runtime drops ~12x and rule coverage stays the same or improves",
        "Runtime drops but coverage is halved",
        "Runtime is unchanged; only flakiness improves",
        "Runtime drops but the wiring is no longer tested",
      ],
      answerIndex: 0,
      explain:
        "~78s of browser tests becomes ~6.5s plus a few milliseconds — about 12x faster — while every rule is still tested, now cheaply enough to add boundary cases. The single happy path still proves the wiring, so nothing is lost at the top.",
    },
  ],
};

export default lesson;
