import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "tdd-red-green-refactor",
  title: "TDD: Red, Green, Refactor",
  part: "Discipline & Delivery",
  estMinutes: 12,
  summary:
    "Test-driven development is a working rhythm — failing test, minimum code, refactor under a green net — that pays off brilliantly for logic and bug fixes and poorly for exploratory spikes.",

  concept: `
TDD is less a testing technique than a **design rhythm**. You never write more
than a few minutes of code without a test proving it works, and you never
clean code up without a net underneath you. The loop has three steps and each
one has a discipline attached.

### Red — and failing for the *right* reason

Write one small test for behaviour that doesn't exist yet, run it, and **watch
it fail**. This step is not ceremonial. A test you've never seen fail proves
nothing: maybe it asserts nothing, maybe it calls the wrong function, maybe a
default value satisfies it by accident. Read the failure message too — if you
expected \`expected 20, got 0\` and instead got \`fn is not a function\`, the
test is broken, not the code. Red is where you verify the *test*.

### Green — the minimum honest code

Write the least code that makes the suite pass. If the only test says
"returns 0 below $100", then \`return 0\` is a legitimate implementation —
the next test will force the generalisation. This feels absurd until you see
what it buys: every line of production code exists because a test demanded
it, so nothing is untested and nothing is speculative.

### Refactor — with the net on

On green, improve the code: rename, extract, collapse duplication. The tests
don't change during this step — that's the whole point. If a refactor breaks
a test, you changed behaviour, not structure, and you revert. This is the step
PHP veterans were denied for years: refactoring a 400-line function with no
tests is gambling; refactoring on green is routine.

### A kata: growing a price-rule engine

One rule per cycle:

1. **Red:** \`applyDiscount(99)\` should be \`0\`. Fails — the function doesn't exist.
   **Green:** \`const applyDiscount = () => 0\`.
2. **Red:** \`applyDiscount(200)\` should be \`20\` (10% at $100+). Fails: got 0.
   **Green:** \`subtotal >= 100 ? subtotal * 0.1 : 0\`.
3. **Red:** \`applyDiscount(1000)\` should be \`50\` (cap). Fails: got 100.
   **Green:** add the cap. **Refactor:** collapse to
   \`Math.min(subtotal * 0.1, 50)\` behind the threshold check — suite still green.

Three cycles, and every rule in the engine has a test that once failed. That
is a different kind of confidence from "I wrote tests afterwards and they pass."

### When TDD pays — and when it doesn't

Be honest about this in interviews; nuance beats dogma. TDD shines for
**well-understood logic**: parsers, calculators, pricing and validation rules,
anything with clear inputs and outputs. It is *mandatory* for **bug fixes** —
reproduce the bug as a failing test first, or you cannot prove you fixed it
and it will regress. It's a poor fit for **exploratory spikes** where you
don't yet know what you're building (spike test-free, throw the spike away,
then TDD the real thing) and for **visual/UI polish**, where the feedback you
need is your eyes, not an assertion. Tests written *after* code still have
value — most teams live there — but they tend to assert what the code does
rather than what it should do.
`,

  comparisons: [
    {
      label: "Code-first with a test bolted on vs test-first",
      intro:
        "Both files end with a tested discount function. One test was written by reading the finished code; the other three tests each existed before the code that passes them.",
      php: `// discount.test.ts — written AFTER the implementation
// The author ran applyDiscount(250), saw 25, and asserted it.
// If the 10% rule was supposed to be 15%, this test now
// certifies the bug instead of catching it.
test('discount works', () => {
  expect(applyDiscount(250)).toBe(25); // copied from output
});

// One vague test, named after the function, asserting
// whatever the code happened to produce.`,
      ts: `// discount.test.ts — grown test-first, one rule per cycle
test('no discount below $100', () => {
  expect(applyDiscount(99)).toBe(0);   // RED first: fn didn't exist
});

test('10% off at $100 and above', () => {
  expect(applyDiscount(200)).toBe(20); // RED first: got 0
});

test('discount is capped at $50', () => {
  expect(applyDiscount(1000)).toBe(50); // RED first: got 100
});
// Each expectation came from the REQUIREMENT, not from
// running the code and copying what it printed.`,
      note: "Test-after tends to assert what the code does; test-first asserts what the code should do — the expected values come from the spec, before any implementation exists to copy from.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Fixing a bug: patch-and-pray vs reproduce-first",
      intro:
        "A rounding bug in an invoice total. The old workflow edits the code and re-checks by hand; the TDD workflow makes the bug a failing test before touching the fix.",
      php: `<?php
// The 2005 workflow: edit, upload, click around.
function invoiceTotal(array $lines): float {
    $total = 0;
    foreach ($lines as $line) {
        // "fixed" the rounding bug... probably?
        $total += round($line['price'] * $line['qty'], 2);
    }
    return $total;
}
// Verified by loading /invoice.php?id=123 in the browser
// and eyeballing the number. Regression protection: none.`,
      ts: `// invoice.test.ts — step 1: reproduce the bug as a RED test
test('bug #4812: three items at $0.10 total $0.30, not $0.29', () => {
  const lines = [{ price: 0.1, qty: 3 }];
  expect(invoiceTotal(lines)).toBe(0.3);
});
// Run it. Watch it FAIL with 0.29 — bug confirmed, in code.

// step 2: fix invoiceTotal (round once at the end, in cents).
// step 3: test goes GREEN and stays in the suite forever —
// this bug can never silently return.`,
      note: "Reproduce-first turns 'I think I fixed it' into 'the failing test now passes' — and the test remains as a permanent regression guard for exactly that bug.",
    },
    {
      label: "A red that lies vs a red you can trust",
      intro:
        "Two brand-new tests for a validatePromo() that isn't implemented yet. One passes immediately — which should terrify you — and one fails with exactly the message you predicted.",
      php: `// promo.test.ts
// New test whose target is only a STUB... and it passes?
test('rejects expired promo codes', () => {
  // validatePromo exists but is empty: const validatePromo = () => {};
  const result = validatePromo('XMAS2019');
  // result is undefined, so expect(undefined).not.toBe(true)
  // passes vacuously. (If the function were truly absent this
  // would throw a ReferenceError and FAIL — a red you CAN trust.)
  expect(result).not.toBe(true);
});
// Green on first run = the test proves nothing.`,
      ts: `// promo.test.ts
test('rejects expired promo codes', () => {
  expect(validatePromo('XMAS2019')).toEqual({
    valid: false,
    reason: 'expired',
  });
});
// First run: FAIL — validatePromo is not defined. Good.
// After a stub returning { valid: true }: FAIL —
//   expected { valid: false, ... }, got { valid: true }. Good.
// Only after the real expiry check does it go GREEN.
// This test has demonstrated it can catch the bug it exists for.`,
      note: "A test that has never failed is unverified code. Watching red — and reading the failure message — is how you test the test.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A TDD replay: three progressively stricter suites run against three versions of applyDiscount(). Predict where the REDs appear, then run it and watch the rhythm.",
    code: `// A TDD replay: three test suites of increasing strictness run against
// three versions of applyDiscount(). Watch the red/green rhythm scroll by.

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(\`expected \${expected}, got \${actual}\`);
      }
    },
  };
}

type Impl = (subtotal: number) => number;
type Case = [name: string, assert: (fn: Impl) => void];

function runSuite(label: string, impl: Impl, cases: Case[]): void {
  console.log(label);
  for (const [name, assert] of cases) {
    try {
      assert(impl);
      console.log(\`  PASS \${name}\`);
    } catch (e) {
      console.log(\`  FAIL \${name} — \${(e as Error).message}\`);
    }
  }
}

// ── Cycle 1: write the first test, then the minimum code ──────────
const suite1: Case[] = [
  ["no discount below $100", (fn) => expect(fn(99)).toBe(0)],
];
const v1: Impl = () => 0; // the least code that can pass — and that's fine
runSuite("cycle 1 · GREEN with v1:", v1, suite1);

// ── Cycle 2: a new failing test drives the next rule ───────────────
const suite2: Case[] = [
  ...suite1,
  ["10% off at $100 and above", (fn) => expect(fn(200)).toBe(20)],
];
runSuite("cycle 2 · RED — v1 meets the new test:", v1, suite2);

const v2: Impl = (subtotal) => (subtotal >= 100 ? subtotal * 0.1 : 0);
runSuite("cycle 2 · GREEN with v2:", v2, suite2);

// ── Cycle 3: cap the discount, then refactor on green ─────────────
const suite3: Case[] = [
  ...suite2,
  ["discount is capped at $50", (fn) => expect(fn(1000)).toBe(50)],
];
runSuite("cycle 3 · RED — v2 meets the cap test:", v2, suite3);

const v3: Impl = (subtotal) =>
  subtotal >= 100 ? Math.min(subtotal * 0.1, 50) : 0; // refactor: one readable line
runSuite("cycle 3 · GREEN, refactored, with v3:", v3, suite3);

console.log("rhythm: red, green, refactor — one rule at a time");`,
  },

  keyPoints: [
    "The cycle: write a small failing test (red), write the minimum code to pass (green), then refactor with the suite as a safety net.",
    "Watch every new test fail before making it pass — a test that has never failed may be passing vacuously and proves nothing.",
    "Check the failure *message* at red: `expected 20, got 0` means the test works; `fn is not a function` means the test itself is broken.",
    "Bug fixes are non-negotiable TDD: reproduce the bug as a failing test first, so the fix is proven and the regression is guarded forever.",
    "TDD pays for parsers, calculators, pricing/validation rules — clear inputs and outputs; it's a poor fit for exploratory spikes and visual polish.",
    "Refactoring never changes tests — if a 'refactor' breaks the suite, it changed behaviour and should be reverted.",
  ],

  interview: [
    {
      q: "Walk me through your TDD workflow.",
      a: "I write one small test for behaviour that doesn't exist yet and run it to watch it fail — and I check it fails for the right reason, with the failure message I predicted, because a test that passes on first run proves nothing. Then I write the minimum code to go green, even if that's embarrassingly simple, because the next test will force the generalisation. On green I refactor — rename, extract, remove duplication — without touching the tests; if a test breaks during refactoring I've changed behaviour and I revert. The rhythm keeps me minutes away from working code at all times, and it means every line of production code exists because a test demanded it.",
    },
    {
      q: "Is TDD always the right approach? When would you not use it?",
      a: "No, and I'm suspicious of anyone who says otherwise. TDD is excellent where behaviour is well understood — business rules, parsers, calculators, anything with clear inputs and outputs — and it's mandatory for bug fixes: reproduce the bug as a failing test before fixing it. It's a poor fit for exploratory spikes where I don't yet know what I'm building — there I spike freely, throw the spike away, and TDD the real implementation. It's also weak for visual polish, where the feedback loop is my eyes, not an assertion. The discipline I keep regardless of approach is that untested logic doesn't merge.",
    },
    {
      q: "What's the point of watching a test fail? Isn't that a waste of a run?",
      a: "It's the only time the test itself gets tested. A new test can pass for bad reasons: it asserts on `undefined` vacuously, it calls a function that already handles the case by accident, or a typo means it never executes the code under test. Watching it fail — with the specific message I expected, like `expected 20, got 0` rather than a TypeError — demonstrates the test can detect the absence of the behaviour it exists to protect. In PHPUnit terms: I'd never trust a data provider I hadn't seen produce at least one red row. Red is verification of the net before I lean on it.",
    },
  ],

  quiz: [
    {
      question:
        "You write a test for behaviour that isn't implemented yet, run it, and it passes. What does TDD say you should do?",
      options: [
        "Celebrate — the behaviour is already covered",
        "Delete the test since it's redundant",
        "Distrust the test: it's passing vacuously, so fix the test until it fails for the right reason",
        "Skip to the refactor step",
      ],
      answerIndex: 2,
      explain:
        "A test that passes against unimplemented code is asserting nothing useful — often it's comparing against the undefined a stub returns, or never reaching the code under test. Red exists to verify the test can actually detect the missing behaviour; without a genuine failure the net has holes.",
    },
    {
      question:
        "In the green step, the only test so far says applyDiscount(99) returns 0. What is the TDD-correct implementation?",
      options: [
        "Implement the full discount specification while you're there",
        "return 0 — the minimum code that passes; the next test forces the general rule",
        "Throw NotImplementedError until all tests are written",
        "Copy a discount implementation from a previous project",
      ],
      answerIndex: 1,
      explain:
        "Green means the least code that satisfies the current suite — literally `return 0` here. It feels absurd, but it guarantees no untested speculative code exists; the 10%-rule only appears when a test demands it, and is therefore covered from birth.",
    },
    {
      question: "During the refactor step, one of your tests starts failing. What happened?",
      options: [
        "Normal — tests are expected to be rewritten during refactoring",
        "The test was flaky and should be retried",
        "You changed observable behaviour, not just structure — revert and refactor again",
        "The suite needs to be regenerated from the new code",
      ],
      answerIndex: 2,
      explain:
        "Refactoring is by definition behaviour-preserving, and the tests pin the behaviour. If the suite goes red mid-refactor, the change wasn't a refactor — undo it and find a transformation that keeps green. (Renaming things tests reference is the one legitimate exception, done as its own mechanical step.)",
    },
  ],
};

export default lesson;
