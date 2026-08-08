import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "what-to-test",
  title: "What to Test (and What to Skip)",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "Test behaviour and contracts — business logic, boundaries, and past bugs — and skip framework internals, trivial code, and other people's libraries.",

  concept: `
"What do you test?" is the judgment question interviewers care about most,
because the wrong answers are so common: *"everything"* (you'll drown in
brittle tests), *"whatever gets coverage to 100%"* (coverage measures
execution, not verification), or *"the happy path"* (the bugs live
elsewhere). The strong answer is a priority list.

### Test behaviour, not implementation

A good test asserts the **contract**: given these inputs, this observable
output or effect. It should keep passing when you refactor the internals —
rename private helpers, swap an algorithm, reorder calls — because none of
that changes behaviour. A test that asserts *how* the code works (which
internal methods were called, in what order, what a private variable holds)
is a brittle test: it fails on harmless refactors, teaching the team to
ignore red builds. If a refactor breaks half your suite while the app still
works, the suite was testing implementation.

### What to prioritise

- **Business logic** — pricing, permissions, validation, state transitions.
  This is where wrong answers cost money.
- **Edge cases and boundaries** — zero, empty, exactly-at-threshold, one
  past it, negative, missing. Off-by-one bugs live *at* the boundary, so
  test at it, not near it.
- **Bug regressions** — every production bug becomes a test named after it.
  Your suite grows into a map of everything that has ever actually broken.
- **Anything that scares you to change** — fear is a signal: complexity or
  hidden coupling lives there. Pin it with tests until the fear goes away.

### What to skip

- **Framework and language internals.** In 25 years of PHP you never wrote
  a test proving PDO executes SQL or that \`array_map\` maps. Same instinct
  here: don't test that Svelte renders an \`{#if}\` block or that Vitest's
  \`expect\` compares. Test *your* rules, not the platform's.
- **Third-party libraries.** They ship their own suites. Test your *use* of
  them at the integration seam if the wiring worries you — not their logic.
- **Trivial code.** A getter that returns a field, a constructor that
  assigns arguments. If it can't meaningfully be wrong, a test adds
  maintenance without confidence.
- **Private methods, directly.** Test through the public surface. If a
  private helper is complex enough to demand its own tests, that's a design
  hint: extract it into its own module with a public contract.

### Coverage is a flashlight, not a target

Coverage tells you what your tests *never executed* — genuinely useful for
spotting a forgotten branch. But 100% coverage proves nothing about
assertions: you can execute every line while asserting nothing. Chasing the
number produces tests that exist to touch lines. Use coverage to find dark
corners; use judgment to decide which corners matter.

### The one-question filter

Before writing any test, ask: **"if this fails, did something a user or
teammate cares about actually break?"** If yes, write it. If the honest
answer is "no, I just refactored", you're about to write a brittle test —
assert the behaviour instead.
`,

  comparisons: [
    {
      label: "Brittle implementation test vs behavioural test",
      intro:
        "Both test a cart total. One asserts how the code works internally; the other asserts what it answers. Watch which one survives a refactor.",
      php: `// cart.test.js — welded to the implementation
test('total() calls the right internals', () => {
  const cart = new Cart();
  const spySum = vi.spyOn(cart, '_sumLines');
  const spyTax = vi.spyOn(cart, '_applyTax');

  cart.add({ price: 100, qty: 2 });
  cart.total();

  // Breaks if _sumLines is renamed, inlined, or
  // reordered — even though total() still answers 220.
  expect(spySum).toHaveBeenCalledBefore(spyTax);
  expect(cart._lines.length).toBe(1); // private state!
});`,
      ts: `// cart.test.ts — welded to the contract
import { expect, test } from 'vitest';
import { Cart } from './cart';

test('total is line sum plus 10% tax', () => {
  const cart = new Cart();
  cart.add({ price: 100, qty: 2 });

  expect(cart.total()).toBe(220);
});

test('empty cart totals zero', () => {
  expect(new Cart().total()).toBe(0);
});

// Rename _sumLines, inline _applyTax, rewrite the whole
// class — these tests only fail if the ANSWER changes.`,
      note:
        "The left test fails on every harmless refactor and passes even if total() returns the wrong number (it never checks!). The right test is the contract: inputs in, answer out.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Testing the platform vs testing your rules",
      intro:
        "You never wrote PHPUnit tests proving PDO works. Apply the same instinct to the new stack: skip the framework, test the rule you wrote.",
      php: `<?php
// pdo.test.php — testing someone else's code
class PdoTest extends TestCase {
    // Proves PDO can execute SQL. PHP's own test
    // suite already proves this thousands of times.
    public function testPdoFetchesRows(): void {
        $pdo = new PDO('sqlite::memory:');
        $pdo->exec('CREATE TABLE t (id INT)');
        $pdo->exec('INSERT INTO t VALUES (1)');
        $rows = $pdo->query('SELECT * FROM t')->fetchAll();
        $this->assertCount(1, $rows);
    }
}`,
      ts: `// pricing.test.ts — testing the rule YOU wrote
import { expect, test } from 'vitest';
import { shippingCost } from './pricing';

// The business rule: free shipping from $75, else $9.95.
test('charges $9.95 below the free-shipping threshold', () => {
  expect(shippingCost(74.99)).toBe(9.95);
});

test('ships free at exactly $75', () => {
  expect(shippingCost(75)).toBe(0);
});

// Nobody tests that Svelte renders, that fetch fetches,
// or that Vitest asserts. Platform code has its own suite.`,
      note:
        "Same discipline you already had in PHP: PDO, array_map, and Svelte's renderer are the platform's job to test. Your suite exists for the rules only you wrote.",
    },
    {
      label: "Coverage-driven vs risk-driven",
      intro:
        "Two suites for the same function. One exists to make a number go up; the other exists to catch the bugs this function could actually have.",
      php: `// fee.test.js — written to hit 100% coverage
test('covers the function', () => {
  fee(10);    // line executed ✓
  fee(-1);    // branch executed ✓
  fee(0);     // branch executed ✓
  // Zero assertions. Coverage: 100%.
  // Bugs caught, now or ever: none.
  expect(true).toBe(true);
});`,
      ts: `// fee.test.ts — written against the ways it could be wrong
import { expect, test } from 'vitest';
import { fee } from './fee';

test('charges 2% on positive amounts', () => {
  expect(fee(100)).toBe(2);
});

test('boundary: zero amount is zero fee', () => {
  expect(fee(0)).toBe(0);
});

test('rejects negative amounts', () => {
  expect(() => fee(-1)).toThrow('amount must be >= 0');
});`,
      note:
        "Both suites report similar coverage — only one verifies anything. Coverage shows what was executed, never what was asserted. Use it to find untested branches, not as a goal.",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Risk-driven test selection on a discount rule: every test targets a boundary or a failure mode — 0, just-under, exactly-at, just-under-again, exactly-at, and two invalid inputs. Predict all seven results, then move a boundary bug in: change >= 100 to > 100 and see exactly which test names the break.",
    code: `// Edge-case-driven test selection: every test below exists because a
// boundary or failure mode exists — not to inflate a coverage number.

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(\`expected \${expected} but got \${actual}\`);
      }
    },
    toThrow(message: string) {
      if (typeof actual !== "function") throw new Error("pass a function");
      try {
        (actual as () => void)();
      } catch (e) {
        if ((e as Error).message === message) return;
        throw new Error(\`threw "\${(e as Error).message}", wanted "\${message}"\`);
      }
      throw new Error("expected it to throw, but it returned");
    },
  };
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log("PASS " + name);
  } catch (e) {
    console.log("FAIL " + name + ": " + (e as Error).message);
  }
}

// Business rule: 5% off from $50, 15% off from $100. Invalid spend rejects.
function discountRate(spend: number): number {
  if (!Number.isFinite(spend) || spend < 0) {
    throw new Error("invalid spend");
  }
  if (spend >= 100) return 0.15;
  if (spend >= 50) return 0.05;
  return 0;
}

// The boundaries are where the bugs live — test AT them, not near them.
test("no discount at zero", () => expect(discountRate(0)).toBe(0));
test("no discount just under the first threshold", () =>
  expect(discountRate(49.99)).toBe(0));
test("5% at exactly 50", () => expect(discountRate(50)).toBe(0.05));
test("still 5% just under 100", () => expect(discountRate(99.99)).toBe(0.05));
test("15% at exactly 100", () => expect(discountRate(100)).toBe(0.15));
test("rejects negative spend", () =>
  expect(() => discountRate(-1)).toThrow("invalid spend"));
test("rejects NaN", () =>
  expect(() => discountRate(Number.NaN)).toThrow("invalid spend"));

// Note what is NOT tested: that >= works, that numbers add up, or the
// function's internals. Seven behavioural claims cover every branch.`,
  },

  keyPoints: [
    "Test the contract — inputs to observable outputs/effects — so tests survive refactors; a suite that breaks when internals are renamed was testing implementation.",
    "Priorities: business logic, boundary values (at the threshold, not near it), regression tests for every real bug, and anything you're afraid to change.",
    "Skip framework internals and third-party libraries — you never unit-tested PDO; don't test that Svelte renders.",
    "Skip trivial code and never test private methods directly — test through the public surface, and extract the helper if it truly needs its own tests.",
    "Coverage is a flashlight for unexecuted branches, not a target — 100% coverage with no assertions verifies nothing.",
    "The filter: if this test fails, did something a user or teammate cares about actually break?",
  ],

  interview: [
    {
      q: "How do you decide what to test?",
      a: "Risk first. I prioritise business logic — pricing, permissions, validation — because that's where wrong answers cost money; boundary values, because off-by-one bugs live exactly at thresholds; a regression test for every production bug, so the suite becomes a map of what has actually broken; and anything the team is afraid to change, because fear marks hidden coupling. I deliberately skip framework internals, third-party libraries, and trivial getters — in PHP I never wrote a test proving PDO executes SQL, and the same instinct applies to not testing that Svelte renders. My filter for any test: if it fails, did something a user cares about actually break? If the answer is 'no, I just refactored', the test is asserting implementation and I rewrite it against behaviour.",
    },
    {
      q: "What's wrong with asserting that specific internal methods were called in a specific order?",
      a: "It welds the test to one implementation. Rename a private helper, inline it, or reorder two independent calls and the test fails while the application still works perfectly — and worse, that style often passes when the actual answer is wrong, because it checks the choreography instead of the result. Teams living with such suites learn to ignore red builds, which defeats the point of having tests. The fix is asserting the contract: given this cart, total() returns 220. Interaction assertions are occasionally legitimate at a boundary where the call *is* the behaviour — 'we charged the payment gateway exactly once' — but they're the exception, used at seams, not the default style.",
    },
    {
      q: "Should teams aim for 100% code coverage?",
      a: "No — coverage measures execution, not verification. You can execute every line while asserting nothing and get a perfect score from a worthless suite; chasing the number generates exactly those tests. Coverage is genuinely useful as a flashlight: it shows the branch nobody ever exercised, which is often an unhandled error path worth a real test. So I read coverage reports to find dark corners, and I'd rather have 70% coverage of risk-driven behavioural tests than 100% of line-touching. If a team wants a metric, trend direction on critical modules is defensible; a global 100% mandate actively degrades suite quality.",
    },
  ],

  quiz: [
    {
      question:
        "After a pure refactor (no behaviour change), a third of the test suite fails. What does this most likely indicate?",
      options: [
        "The refactor secretly broke the application",
        "The tests were asserting implementation details rather than behaviour",
        "The suite needs more mocking to isolate the units",
        "The team should refactor less often",
      ],
      answerIndex: 1,
      explain:
        "Behavioural tests assert inputs against observable outputs, which a pure refactor doesn't change. Mass failures on a harmless refactor mean the tests were welded to internals — call order, private state, helper names. More mocking usually deepens that coupling rather than fixing it.",
    },
    {
      question: "Which of these most deserves a test?",
      options: [
        "That Svelte correctly renders an {#if} block",
        "A getter that returns a private field unchanged",
        "The tier-boundary of your pricing rule (exactly at the threshold)",
        "That the axios library sends HTTP requests",
      ],
      answerIndex: 2,
      explain:
        "Boundary values of business rules are prime test targets — off-by-one mistakes live exactly there, and only your suite checks them. Svelte and axios ship their own test suites, and a trivial getter can't meaningfully be wrong.",
    },
    {
      question: "A complex private method feels like it needs its own tests. What's the recommended move?",
      options: [
        "Use reflection to invoke the private method from the test",
        "Make it public so the test can reach it",
        "Test it through the public surface, or extract it into its own module with a public contract",
        "Skip testing it, since private methods are implementation details",
      ],
      answerIndex: 2,
      explain:
        "Private methods are exercised through the public behaviour they serve — test that. When a helper is genuinely complex enough to warrant direct tests, that's a design signal: extract it into its own module where the contract is public. Reflection and blanket-publicising both cement implementation details into the suite.",
    },
    {
      question: "What does a code-coverage report actually tell you?",
      options: [
        "Which lines and branches your tests executed",
        "Which behaviours your tests verified",
        "How many assertions your suite contains",
        "Whether your tests would catch a regression",
      ],
      answerIndex: 0,
      explain:
        "Coverage counts execution only. A test can run every line while asserting nothing, so coverage says nothing about verification or regression safety. Use it to find never-executed branches worth real tests — not as a quality score.",
    },
  ],
};

export default lesson;
