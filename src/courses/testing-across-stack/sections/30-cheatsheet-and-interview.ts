import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-and-interview",
  title: "Cheatsheet & Interview Prep",
  part: "Discipline & Delivery",
  estMinutes: 14,
  summary:
    "The whole course on one page — the pyramid and its tools, the matcher and query vocabularies, the fixture/parametrize/monkeypatch trio, the mock-vs-DI rule, and the flaky triage list — plus model answers to the testing questions interviewers actually ask.",

  concept: `
This is the capstone: a single reference you can skim the night before an
interview, then the questions to rehearse out loud. Your story isn't "junior
learning to test" — it's "veteran who shipped production for 25 years,
modernising the discipline." Answer from that seat.

### The pyramid and its tools

Many fast unit tests at the base, fewer integration tests in the middle, a
handful of end-to-end tests at the top. Push every assertion as far *down* as
it will go — the layer where the thing under test actually lives.

| Layer | Scope | Tools (this course) |
| --- | --- | --- |
| Unit | One function/module, no I/O | Vitest 4 (JS/TS), pytest 9 (Python) |
| Integration | Modules + a real boundary (DB, HTTP) | supertest, FastAPI \`TestClient\`, a test database |
| E2E | The whole app in a real browser | Playwright 1.x |

### Matcher & query vocabulary

Vitest / pytest assertions you reach for daily:

- **Value:** \`expect(x).toBe(y)\` (identity), \`.toEqual(y)\` (deep), \`.toContain(item)\`.
- **Errors & async:** \`expect(fn).toThrow()\`, \`await expect(p).rejects.toThrow()\`, \`.resolves.toBe()\`.
- **Spies:** \`expect(spy).toHaveBeenCalledWith(args)\`, \`.toHaveBeenCalledTimes(n)\`.
- **pytest:** plain \`assert x == y\`; \`with pytest.raises(ValueError):\` for errors.

Testing Library queries (identical API across the Svelte, React, and framework-neutral
\`@testing-library/dom\` wrappers — the query layer is shared):

- **Prefer roles:** \`getByRole('button', { name: 'Sign in' })\`, \`findByRole\` for async.
- **Then labels/text:** \`getByLabelText\`, \`getByText\`; \`getByTestId\` is the last resort.
- **jest-dom matchers:** \`toBeInTheDocument()\`, \`toHaveTextContent()\`, \`toBeDisabled()\`.
- **user-event 14:** \`const user = userEvent.setup()\` once, then \`await user.click(...)\`.

### The pytest trio (map it to PHPUnit)

| pytest | Does | PHPUnit analogue |
| --- | --- | --- |
| fixture | Setup/teardown via a \`yield\` generator, injected by name | \`setUp()\` / \`tearDown()\`, done right |
| \`@pytest.mark.parametrize\` | Same test over many input rows | \`@dataProvider\` |
| \`monkeypatch\` | Swap attributes/env for one test | Mockery / partial mocks |

### The one decision rule: mock vs DI

Mock what you **don't own or can't control** — the network, the database, the
clock, third-party SDKs. Run the code you *do* own for real. If you're mocking
your own pure logic, the test is asserting the mock's return value, not your
code. The cleaner shape is dependency injection: pass the boundary in as a
parameter (a \`clock\`, a \`repo\`, a \`fetch\`), so tests supply fakes and no
module-patching is needed at all.

### Flaky-test triage (say this list from memory)

Causes: real time, unseeded randomness, shared state / test-order dependence,
un-awaited async, real network calls, sleeps instead of condition-waits.
Playbook: **reproduce** (loop the test), **quarantine** with a ticket, then
**fix or delete** — never retry-until-green as a policy.

### Coverage, in one sentence

Coverage is a map of what code *ran*, not what was *checked* — chase uncovered
branches, not a 100% number, and enforce a threshold as a ratchet so it can't
silently regress.
`,

  comparisons: [
    {
      label: "\"How do you know your code is well tested?\"",
      intro:
        "The coverage-number trap. The weak answer equates a green 100% with quality; the strong answer treats coverage as a map and puts the weight on assertions.",
      php: `// Weak answer, expressed as the code it produces:
// "We enforce 100% coverage — every line runs under test."
const sum = (a, b) => a + b;

test('sum', () => {
  sum(2, 2);          // the line runs, so it counts as "covered"...
});
// ...and there is NO assertion. Coverage report: 100%.
// This test proves absolutely nothing about correctness.`,
      ts: `// Strong answer: coverage shows what RAN, not what was CHECKED.
const sum = (a: number, b: number) => a + b;

test('sum adds its two operands', () => {
  expect(sum(2, 2)).toBe(4);     // a real assertion
  expect(sum(-1, 1)).toBe(0);    // and an edge case
});
// "I read coverage as a map of untested code, not a target. I aim
//  assertions at behaviour and edges; a covered line with no
//  expectation is a lie the report tells you."`,
      note: "Line coverage counts execution, not verification. The interview signal is knowing that a 100%-covered suite can still assert nothing — behaviour and edge cases are what matter.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "\"How do you decide what to mock?\"",
      intro:
        "The over-mocking trap. Stubbing everything — including your own logic — produces tests that pass no matter how broken the code is.",
      php: `// Weak: "I mock everything so tests are isolated."
// Here the app's OWN tax calculation is mocked out:
const calc = { taxOf: vi.fn().mockReturnValue(10) };

test('checkout adds tax', () => {
  expect(calc.taxOf(100)).toBe(10);   // asserts the mock, not the code
});
// taxOf could compute tax completely wrong and this stays green —
// the test only proves you configured the stub correctly.`,
      ts: `// Strong: mock BOUNDARIES, run your own logic for real.
import { taxOf } from './tax';                 // real pure function
const repo = { find: vi.fn().mockReturnValue({ total: 100 }) }; // boundary

test('checkout applies real tax to the fetched order', () => {
  const order = repo.find(1);       // DB is faked — can't control it
  expect(taxOf(order.total)).toBe(10);  // logic is REAL — that's the point
});
// "I mock what I don't own or can't control — DB, HTTP, time. Pure
//  logic I exercise for real, or I'm just testing my own stub."`,
      note: "The rule an interviewer wants to hear: mock the boundaries (network, DB, clock, third-party SDKs), never your own domain logic. DI is the cleaner form — pass the boundary in rather than patching a module.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "\"Unit, integration, or e2e — which do you write?\"",
      intro:
        "The everything-through-the-UI trap. Pushing pure logic up to a browser test is slow, flaky, and hides which layer actually broke.",
      php: `// Weak: "We run everything through the UI, it's the most realistic."
// A full browser run to check arithmetic:
test('tax is 10%', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByLabel('Subtotal').fill('100');
  await page.getByRole('button', { name: 'Calc' }).click();
  await expect(page.getByTestId('tax')).toHaveText('10');
});
// Three seconds and a real browser to verify a 1-millisecond sum.`,
      ts: `// Strong: push logic DOWN the pyramid; reserve e2e for real journeys.
test('tax is 10% of the subtotal', () => {
  expect(taxOf(100)).toBe(10);     // unit: no browser, milliseconds
});

// ...and ONE e2e for the flow where the whole stack IS the subject:
//   test('user completes checkout and sees a confirmation', ...)
//
// "Most of my assertions are fast unit tests. Integration covers a
//  real boundary; e2e is reserved for the few journeys where the
//  integration of the entire stack is the thing under test."`,
      note: "Same behaviour, right altitude: arithmetic belongs in a millisecond-fast unit test; e2e is expensive and flaky, so it's spent only on critical end-to-end journeys.",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The victory lap: one green check from every part of the course — behaviour over implementation (Foundations), a table-driven Vitest run, query-by-role plus parametrize (Components & Python), an injected clock for determinism (Integration & E2E), and a characterization test surviving a refactor (Discipline). Predict the tally, then run it.",
    code: `// One test per part of the course — a fitting last run. All should pass.

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(\`expected \${expected}, got \${actual}\`);
      }
    },
  };
}

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(\`PASS \${name}\`);
  } catch (e) {
    failed++;
    console.log(\`FAIL \${name} — \${(e as Error).message}\`);
  }
}

// ── Foundations: assert observable behaviour, not internals ──────────
function fullName(u: { first: string; last: string }): string {
  return \`\${u.first} \${u.last}\`.trim();
}
test("Foundations · behaviour over implementation", () => {
  expect(fullName({ first: "Ada", last: "Lovelace" })).toBe("Ada Lovelace");
});

// ── Vitest Fundamentals: one table, many rows (it.each in spirit) ────
function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}
test("Vitest · table-driven cases", () => {
  const rows: [number, boolean][] = [[2, true], [3, true], [4, false], [9, false]];
  for (const [n, want] of rows) expect(isPrime(n)).toBe(want);
});

// ── Components & Python: query by role + parametrize as a loop ───────
const tree = [
  { role: "button", name: "Sign in" },
  { role: "heading", name: "Welcome" },
];
function getByRole(role: string, name: string): { role: string; name: string } {
  const el = tree.find((n) => n.role === role && n.name === name);
  if (!el) throw new Error(\`no \${role} named "\${name}"\`);
  return el;
}
test("Components/Python · getByRole + parametrize loop", () => {
  expect(getByRole("button", "Sign in").name).toBe("Sign in");
  const rows: [number, number, number][] = [[1, 1, 2], [2, 3, 5]];
  for (const [a, b, sum] of rows) expect(a + b).toBe(sum);
});

// ── Integration & E2E: inject the clock → deterministic result ───────
function greeting(now: () => Date): string {
  return now().getUTCHours() < 12 ? "Good morning" : "Good afternoon";
}
test("Integration/E2E · determinism via an injected clock", () => {
  const nineAm = () => new Date("2026-07-08T09:00:00Z");
  expect(greeting(nineAm)).toBe("Good morning");
});

// ── Discipline & Delivery: characterization survives a refactor ──────
const discountV1 = (sub: number) => (sub > 50 ? Math.min(sub * 0.1, 50) : 0);
const discountV2 = (sub: number) => {
  if (sub <= 50) return 0; // same rule, restructured
  return Math.min(sub * 0.1, 50);
};
test("Discipline · characterization pins behaviour across refactor", () => {
  for (const sub of [50, 60, 1000]) expect(discountV2(sub)).toBe(discountV1(sub));
});

console.log(\`\\n\${passed} passed, \${failed} failed — a green check from every part\`);`,
  },

  keyPoints: [
    "The pyramid maps to tools: Vitest 4 / pytest 9 at the unit base, supertest & FastAPI `TestClient` at integration, Playwright 1.x for e2e — push every assertion to the lowest layer that can hold it.",
    "Query vocabulary is shared across Testing Library wrappers: `getByRole` first, then `getByLabelText`/`getByText`, `getByTestId` last; drive with `const user = userEvent.setup()`.",
    "The pytest trio maps to PHPUnit: fixtures are `setUp()` done right, `parametrize` is a data provider, `monkeypatch` is Mockery-style swapping.",
    "Mock-vs-DI rule: mock only what you don't own or can't control (network, DB, clock); run your own logic for real, ideally injecting boundaries as parameters.",
    "Flaky triage from memory: causes are time, randomness, shared state, un-awaited async, real networks, sleeps; playbook is reproduce → quarantine → fix or delete, never retry-as-policy.",
    "Interview framing: you're a 25-year veteran modernising the discipline — lead with judgment (what to test, what to mock, what to skip), not tool trivia.",
  ],

  interview: [
    {
      q: "How do you decide what to test?",
      a: "I test behaviour that matters and would hurt if it broke, and I let risk set the priority: business rules, money and tax calculations, auth and permissions, and anything with tricky edge cases go first. I test through the public interface — inputs and observable outputs — not private internals, so the tests survive refactoring. I don't chase 100% coverage; I read coverage as a map of what's unexercised and aim assertions at branches and edge cases instead. And I skip tests that only restate the framework or assert trivially true things — a test that can't fail for a real bug is just maintenance cost.",
    },
    {
      q: "What's the difference between unit, integration, and e2e tests, and how do you balance them?",
      a: "A unit test exercises one function or module with no I/O — milliseconds, run in the thousands. An integration test brings in a real boundary: a database, or an HTTP layer via supertest or FastAPI's TestClient, to prove the pieces actually talk to each other. An e2e test drives the whole app in a real browser with Playwright, the modern automation of the manual clicking I did by hand for years. I follow the pyramid: many unit tests, fewer integration, a handful of e2e — because higher tests are slower and flakier, so I push each assertion to the lowest layer that can hold it and spend e2e only on critical journeys like checkout.",
    },
    {
      q: "You inherit a suite that fails randomly about one run in twenty. What do you do?",
      a: "First I stop the bleeding — quarantine the known flakes with tickets so people stop reflexively re-running red builds, because a suite you re-run on failure gives zero signal. Then I reproduce each one deliberately, looping it until I catch a failure to study. The cause is nearly always on a short list: real time, unseeded randomness, shared state between tests, a missing await, a real network call, or a sleep instead of a condition-wait — and the fix is to remove the nondeterminism, usually by injecting the clock or random source, isolating state per test, or switching to auto-retrying assertions. If a test can't be made deterministic and guards nothing important, I delete it. What I won't do is set a blanket retry policy — retries are fine to *find* flakes, but as policy they just hide real races until users hit them.",
    },
    {
      q: "Walk me through test-driven development.",
      a: "Red, green, refactor. I write one small test for behaviour that doesn't exist yet and run it to watch it fail — checking it fails for the right reason, with the message I predicted, because a test that passes on first run proves nothing. Then I write the minimum code to go green, even if it's embarrassingly simple, and let the next test force the generalisation. On green I refactor freely — rename, extract, dedupe — without touching the tests; if a test breaks, I changed behaviour, not structure, and I revert. I'm honest in interviews that TDD shines for well-understood logic and is mandatory for bug fixes — reproduce the bug as a failing test first — but I'll spike exploratory work test-free and throw the spike away.",
    },
    {
      q: "How would you introduce tests to a large legacy codebase with none?",
      a: "Incrementally, starting where change is actually happening, not with a big-bang rewrite. I get the area of the next feature or bug fix under test first using characterization tests: run the existing code, observe what it really does — quirks and all — and assert exactly that, so I have a tripwire before I touch anything. Where the code is too tangled to test I introduce seams by extracting dependencies like the database and the clock into parameters, making the smallest safe edits. New behaviour I sprout as fresh tested functions called from a single line in the old code, so the untested surface never grows. Honestly, this is where my 25 years pay off — I've lived inside systems like this, and now I have the vocabulary to make the moves deliberately instead of by feel.",
    },
  ],

  quiz: [
    {
      question:
        "An interviewer asks how you decide what to mock. Which answer signals seniority?",
      options: [
        "Mock everything so each test is fully isolated from the rest of the system",
        "Mock only what you don't own or can't control — network, DB, clock — and run your own logic for real",
        "Never mock; always use the real dependencies for maximum realism",
        "Mock whatever is slow, including your own pure calculation functions",
      ],
      answerIndex: 1,
      explain:
        "Mocking your own logic means the test asserts the stub's return value, not your code. The senior rule is to mock boundaries (network, DB, clock, third-party SDKs) and exercise domain logic for real — ideally by injecting those boundaries rather than patching modules.",
    },
    {
      question:
        "Why does a tax calculation belong in a unit test rather than a Playwright e2e test?",
      options: [
        "Playwright can't assert on numbers",
        "E2e tests don't support pure functions",
        "It's pure logic — a unit test verifies it in milliseconds without a browser, while e2e is slow, flakier, and reserved for whole-stack journeys",
        "Unit tests give higher coverage percentages than e2e tests",
      ],
      answerIndex: 2,
      explain:
        "The pyramid says push each assertion to the lowest layer that can hold it. Arithmetic is pure logic, so a fast unit test is the right home; e2e is expensive and flaky and should be spent only where the integration of the whole stack is the actual subject, like completing checkout.",
    },
    {
      question:
        "Which sequence is the correct flaky-test triage?",
      options: [
        "Add retry: 3 globally, then move on once the build is green",
        "Reproduce by looping the test, quarantine it with a ticket, then fix the nondeterminism or delete it",
        "Delete every intermittently-failing test immediately",
        "Increase every timeout until the failures stop appearing",
      ],
      answerIndex: 1,
      explain:
        "Reproduce (loop it to catch a failure), quarantine with a ticket so the suite stays trustworthy, then fix the root cause — time, randomness, shared state, un-awaited async, real networks, or sleeps — or delete a test that can't be made deterministic. Blanket retries hide real races rather than fixing them.",
    },
  ],
};

export default lesson;
