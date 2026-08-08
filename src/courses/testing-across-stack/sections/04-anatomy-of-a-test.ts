import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "anatomy-of-a-test",
  title: "Anatomy of a Good Test",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "Arrange-Act-Assert, one behaviour per test, and names that read as specifications — so a red build tells you what broke without a debugger.",

  concept: `
A test suite is only as useful as its worst failure message. The structural
habits in this section exist for one moment: 2pm on a Tuesday, the build
goes red, and the output either tells you exactly which business rule broke
— or hands you a debugging session.

### Arrange, Act, Assert

Every good test has three phases, in order, usually separated by blank
lines:

\`\`\`ts
test('rejects an expired coupon', () => {
  // Arrange — build the world this behaviour needs
  const coupon = makeCoupon({ expires: '2026-01-01' });
  const cart = makeCart({ total: 100 });

  // Act — do the ONE thing under test
  const result = applyCoupon(cart, coupon, { today: '2026-02-01' });

  // Assert — state what must now be true
  expect(result.total).toBe(100);
});
\`\`\`

PHPUnit veterans already know this shape — it's the same discipline, minus
the class boilerplate. The rule that keeps tests readable: **one act per
test**. If you're acting twice, you're testing two behaviours; split them.

### Names are specifications

A test's name is its failure message's first line. \`test3\` tells you
nothing; \`rejects an expired coupon\` is a bug report that wrote itself.
Good names state a behaviour as a present-tense claim about the subject:
*"charges full price below 10 units"*, *"caps the late fee at 25%"*. A
useful thought experiment: could a product manager read your test names as
the feature's spec? With \`describe\` blocks providing the subject, the
runner's output literally becomes documentation:

\`\`\`text
applyCoupon
  ✓ applies the discount before expiry
  ✓ ignores an expired coupon
  ✗ still honours the coupon on its expiry day
\`\`\`

The failing line names the rule in dispute. Nobody opens a debugger to find
out what "test3 failed" means.

### One behaviour per test

A test that asserts five unrelated things has two problems. First, it stops
at the first failed assertion — the other four are unknowns until you fix
the first, so one red build can hide four bugs. Second, its name has to be
vague ("test coupon stuff"), so the failure tells you nothing. Five small
named tests fail *independently* and *name* what broke. Multiple assertions
are fine when they verify facets of the same behaviour — status *and* body
of one response — the sin is bundling unrelated behaviours.

### FIRST: the qualities interviewers listen for

- **Fast** — milliseconds, or people stop running them.
- **Isolated** — no test depends on another's leftovers. Each test builds
  its own Arrange; suites that only pass in order are unmaintainable.
  (Your PHPUnit \`setUp()\` instinct is right: fresh state per test.)
- **Repeatable** — same result on every machine, every time. The enemies
  are hidden dependencies: real clocks, network, shared databases, test
  order.
- **Self-verifying** — the test itself says pass or fail. If a human has to
  read output and judge, it's a script, not a test.
- **Timely** — written alongside (or before) the code they cover, while the
  behaviour is fresh, not bolted on months later.

### Failure output is a feature

Write assertions so their failures explain themselves. \`expect(result.total)
.toBe(100)\` fails with *expected 100, got 80* — good. \`expect(ok).toBe(true)\`
fails with *expected true, got false* — useless. Assert on the most specific
value available, and prefer matchers that show diffs over boolean checks.
`,

  comparisons: [
    {
      label: "One bloated test vs three specifications",
      intro:
        "The same coupon rules, tested twice. The left is one method asserting five unrelated things; the right is three named behaviours. Both go red when expiry breaks — only one says so.",
      php: `<?php
class CouponTest extends TestCase {
    // Name says nothing; asserts five unrelated things.
    public function testCoupon(): void {
        $c = new Coupon('SAVE20', 20, '2026-06-30');
        $this->assertSame('SAVE20', $c->code());
        $this->assertSame(80.0, $c->apply(100.0, '2026-06-01'));
        // Fails HERE on an expiry bug — everything
        // below is unknown until this is fixed:
        $this->assertSame(100.0, $c->apply(100.0, '2026-07-01'));
        $this->assertSame(0.0, $c->apply(0.0, '2026-06-01'));
        $this->assertTrue($c->isStackable());
    }
}
// Red build says: "testCoupon failed". Which rule? Open the debugger.`,
      ts: `// coupon.test.ts — each rule fails independently, by name
import { describe, expect, test } from 'vitest';
import { makeCoupon } from './coupon';

describe('coupon', () => {
  test('applies 20% before expiry', () => {
    const c = makeCoupon('SAVE20', 20, '2026-06-30');
    expect(c.apply(100, '2026-06-01')).toBe(80);
  });

  test('has no effect after expiry', () => {
    const c = makeCoupon('SAVE20', 20, '2026-06-30');
    expect(c.apply(100, '2026-07-01')).toBe(100);
  });

  test('applies cleanly to a zero total', () => {
    const c = makeCoupon('SAVE20', 20, '2026-06-30');
    expect(c.apply(0, '2026-06-01')).toBe(0);
  });
});
// Red build says: "has no effect after expiry". Done — you know the bug.`,
      note:
        "Splitting isn't ceremony: the bloated test stops at its first failure and hides the rest, and its vague name forces a debugging session. Three tests fail independently and name the broken rule.",
    },
    {
      label: "Order-dependent tests vs isolated tests",
      intro:
        "A shared object reused across tests versus a fresh Arrange in each. Run the left suite in any other order — or delete one test — and watch unrelated tests fail.",
      php: `<?php
class CartTest extends TestCase {
    // Shared, mutated state — tests only pass in order.
    private static Cart $cart;

    public static function setUpBeforeClass(): void {
        self::$cart = new Cart();
    }
    public function testAddItem(): void {
        self::$cart->add('book', 25.0);
        $this->assertSame(25.0, self::$cart->total());
    }
    public function testAddSecondItem(): void {
        // Silently DEPENDS on testAddItem running first!
        self::$cart->add('pen', 5.0);
        $this->assertSame(30.0, self::$cart->total());
    }
}`,
      ts: `// cart.test.ts — every test builds its own world
import { expect, test } from 'vitest';
import { Cart } from './cart';

test('totals a single item', () => {
  const cart = new Cart();          // fresh Arrange
  cart.add('book', 25);
  expect(cart.total()).toBe(25);
});

test('totals two items', () => {
  const cart = new Cart();          // fresh Arrange
  cart.add('book', 25);
  cart.add('pen', 5);
  expect(cart.total()).toBe(30);
});

// Run in any order, in parallel, or alone — same result.`,
      note:
        "Isolated tests can run in any order, in parallel workers, and individually from the editor. The two lines of duplicated Arrange are the price, and they're worth it — helpers like a makeCart() factory keep it cheap.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The mini harness grows describe() for grouping, and the suite follows Arrange-Act-Assert. One test fails on purpose — read its output and notice you know exactly which rule is in dispute without touching a debugger. Then fix the expectation (80) and rerun.",
    code: `// The harness grows a describe() for grouping — mirroring Vitest's
// describe/test/expect. One test below fails ON PURPOSE: notice how
// its name alone tells you which behaviour broke.

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(\`expected \${expected} but got \${actual}\`);
      }
    },
  };
}

let indent = "";
function describe(name: string, fn: () => void) {
  console.log(indent + name);
  indent += "  ";
  fn();
  indent = indent.slice(2);
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(indent + "PASS " + name);
  } catch (e) {
    console.log(indent + "FAIL " + name + " -> " + (e as Error).message);
  }
}

// Code under test: coupon validation.
interface Coupon {
  code: string;
  expiresDay: number; // day number, e.g. 200 = 200th day of the year
  percentOff: number;
}

function applyCoupon(price: number, coupon: Coupon, today: number): number {
  if (today > coupon.expiresDay) return price; // expired: no effect
  return Math.round(price * (1 - coupon.percentOff / 100) * 100) / 100;
}

describe("applyCoupon", () => {
  test("applies the discount before expiry", () => {
    // Arrange
    const coupon = { code: "SAVE20", expiresDay: 200, percentOff: 20 };
    // Act
    const total = applyCoupon(100, coupon, 150);
    // Assert
    expect(total).toBe(80);
  });

  test("ignores an expired coupon", () => {
    const coupon = { code: "SAVE20", expiresDay: 200, percentOff: 20 };
    const total = applyCoupon(100, coupon, 201);
    expect(total).toBe(100);
  });

  test("still honours the coupon on its expiry day", () => {
    const coupon = { code: "SAVE20", expiresDay: 200, percentOff: 20 };
    const total = applyCoupon(100, coupon, 200);
    expect(total).toBe(100); // WRONG on purpose: the rule says day 200 is valid
  });
});

// The failing line reads like a bug report: "still honours the coupon on
// its expiry day -> expected 100 but got 80". You know exactly which rule
// is in dispute without opening a debugger. (The fix: expect 80.)`,
  },

  keyPoints: [
    "Arrange-Act-Assert: build the world, do the one thing under test, state what must be true — one act per test.",
    "Names are specifications: 'rejects an expired coupon' is a self-writing bug report; 'test3' is a debugging session.",
    "One behaviour per test — a bloated multi-assert test stops at its first failure, hiding the rest, and its vague name explains nothing.",
    "FIRST: Fast (milliseconds), Isolated (fresh state per test, no order dependence), Repeatable (no hidden clocks/network/shared DBs), Self-verifying (the test says pass or fail, not a human), Timely (written alongside the code).",
    "Multiple assertions are fine on facets of ONE behaviour (status and body of one response); the sin is bundling unrelated behaviours.",
    "Assert specific values so failures explain themselves: 'expected 100, got 80' beats 'expected true, got false'.",
  ],

  interview: [
    {
      q: "What makes a good unit test? Walk me through your standards.",
      a: "Structurally, Arrange-Act-Assert with exactly one act: build the state, perform the behaviour, assert the outcome. The name states the behaviour as a claim — 'rejects an expired coupon' — so the runner's output reads as a specification and a failure is a self-explanatory bug report. Then the FIRS qualities: fast, so the suite runs on every save; isolated, meaning each test arranges its own state and passes in any order or in parallel; repeatable, so no dependence on real time, network, or a shared database; and self-verifying, so pass/fail needs no human judgment. Finally I assert the most specific value available — 'expected 100, got 80' points at the bug, 'expected true, got false' points at a debugger.",
    },
    {
      q: "Is having multiple assertions in a single test a problem?",
      a: "It depends what they assert. Several assertions verifying facets of one behaviour are fine — checking both the status code and the body of a single response is one behaviour observed from two angles. The anti-pattern is one test acting several times and asserting unrelated behaviours: it stops at the first failed assertion so the remaining behaviours become unknowns, one red build can mask several distinct bugs, and the test's name necessarily goes vague. My working rule is one act per test; if I find a second act creeping in, that's two tests wanting to be split, each with a name that specifies its behaviour.",
    },
    {
      q: "A suite passes when run in full but individual tests fail when run alone. What's happening and how do you fix it?",
      a: "That's order dependence — some tests are consuming state that earlier tests created: a shared object mutated across tests, rows left in a database, a module-level cache. It's a serious smell because it blocks running a single test from the editor, breaks under parallel workers, and makes every failure suspect. The fix is isolation: each test arranges its own world, with setup/teardown hooks or factory helpers keeping that cheap — the same discipline as a clean setUp() in PHPUnit, where fresh fixtures are built per test rather than shared statically. A good smoke check is running the suite in random order and in parallel; a healthy suite doesn't notice.",
    },
  ],

  quiz: [
    {
      question: "In Arrange-Act-Assert, what does the 'one act per test' rule guard against?",
      options: [
        "Tests that run too slowly",
        "Testing multiple behaviours in one test, which hides failures and forces vague names",
        "Using more than one assertion per test",
        "Arranging more state than the test needs",
      ],
      answerIndex: 1,
      explain:
        "Two acts means two behaviours under test: the test stops at its first failed assertion (hiding the second behaviour's status) and its name has to blur over both. Multiple assertions on ONE act's outcome are fine — the rule is about acts, not assertion count.",
    },
    {
      question:
        "Which test name gives the most useful failure output?",
      options: [
        "testCoupon2",
        "test coupon apply function works correctly",
        "rejects an expired coupon",
        "couponApplyTest_final",
      ],
      answerIndex: 2,
      explain:
        "A name stating the behaviour as a claim turns the failure line into a bug report: you know the expiry rule broke before opening any file. The others force you to read the test body (or debug) just to learn what was being verified.",
    },
    {
      question: "The 'Isolated' quality in FIRST means:",
      options: [
        "Each test runs in a separate process",
        "Tests never share mutable state or depend on execution order — each arranges its own world",
        "Tests must not use helper functions",
        "Only one assertion is allowed per test",
      ],
      answerIndex: 1,
      explain:
        "Isolation is about state, not processes: every test builds what it needs and leaves nothing behind, so the suite passes in any order, in parallel, or as a single test run from the editor. Shared mutated fixtures — like a static cart grown across tests — are the classic violation.",
    },
  ],
};

export default lesson;
