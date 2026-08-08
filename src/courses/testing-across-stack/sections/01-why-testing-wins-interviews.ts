import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-testing-wins-interviews",
  title: "Why Testing Wins Interviews",
  part: "Foundations",
  estMinutes: 10,
  summary:
    "Automated testing is the skill nearly every listing demands — and the fastest way for a 25-year PHP veteran to read as senior rather than legacy.",

  concept: `
Scan ten job listings for the roles you want and count how many say some
variant of *"experience with automated testing"*. It will be eight or nine.
Hiring panels use testing as a proxy for a bigger question: **does this person
build software the modern way, or the 2005 way?** Twenty-five years of shipped
PHP is a huge asset — but only if you can pair it with fluency in how teams
verify code today. A veteran who can discuss test strategy confidently reads
as *senior*. One who says "we tested by hand and it worked fine" reads as
*legacy*, no matter how good the code was.

### The loop you already know

Be honest about the workflow: edit the file, alt-tab to the browser, hit
refresh, log in again because the session expired, fill in the form, squint
at the result. Repeat for the second scenario. Skip the third because you're
sure it still works. That loop has three fatal properties:

- **It's slow** — minutes per check, so you check less as deadlines approach.
- **It forgets** — nobody re-clicks all forty scenarios after a "small" change.
- **It leaves nothing behind** — the knowledge of what to check lives in your
  head and walks out the door with you.

### One command instead

An automated suite is the same checking, written down as code:

\`\`\`bash
npx vitest run
# ✓ orders.test.ts (14 tests) 21ms
# Test Files  1 passed (1)
#      Tests  14 passed (14)
\`\`\`

Fourteen scenarios re-proved in 21 milliseconds, identically, every time,
by anyone on the team, forever. That's the entire pitch. Everything else in
this course — Vitest 4, Testing Library, Playwright 1.x, pytest 9 — is
machinery for making that command cover more of your stack.

### A test is just a function that throws

Strip away the tooling and a test is nothing magic: a function that calls
your code and **throws if the result is wrong**. A test *runner* is a loop
that calls each of those functions, catches what they throw, and prints
PASS or FAIL. The playground below builds that runner in ~15 lines — the
same \`test\`/\`expect\` shape Vitest gives you — and later sections of this
course reuse the pattern. Once you've hand-rolled it, no test framework will
ever look like magic again.

### What interviewers actually probe

Interviewers rarely ask you to recite an API. They probe judgment:

- **"How do you decide what to test?"** — they want risk-based thinking,
  not "everything" or "whatever hits 100% coverage".
- **"How do tests change how you work?"** — the strong answer: they make
  refactoring safe (the suite proves behaviour survived) and code review
  faster (the tests document intent and prove the claim).
- **"How was quality handled at your last job?"** — *"we tested manually"*
  with no reflection is a red flag; *"manually — and here's what that cost
  us, and what I'd automate first"* turns your history into an asset.

You have decades of debugging instinct and production scar tissue. This
course bolts a vocabulary and a toolchain onto judgment you already own.
`,

  comparisons: [
    {
      label: "Verifying a discount rule: by hand vs by suite",
      intro:
        "The business rule: orders of 10+ units get 10% off. Both sides verify it — one survives past lunchtime.",
      php: `<?php
// The manual-QA "test plan" — a comment and a browser.
// 1. Edit OrderController.php
// 2. Alt-tab, refresh /cart?items=10
// 3. Squint: is the total 90.00 or 100.00?
// 4. Try 9 items too... if there's time.
function orderTotal(float $price, int $qty): float {
    $subtotal = $price * $qty;
    $discount = $qty >= 10 ? 0.1 : 0.0;
    return round($subtotal * (1 - $discount), 2);
}
// var_dump(orderTotal(10, 10)); // temporary — delete before commit!`,
      ts: `// order.test.ts — run with: npx vitest run
import { describe, expect, test } from 'vitest';
import { orderTotal } from './order';

describe('orderTotal', () => {
  test('applies 10% discount at 10 units', () => {
    expect(orderTotal(10, 10)).toBe(90);
  });

  test('charges full price at 9 units', () => {
    expect(orderTotal(10, 9)).toBe(90); // 9 × 10, no discount
  });
});`,
      note:
        "The var_dump is deleted after one use; the test file is committed and re-runs on every change forever. Note the boundary pair — 9 and 10 units — pinning the threshold from both sides.",
    },
    {
      label: "Proving a bug fix",
      intro:
        "A customer hit a bug: a 0-quantity order charged a negative total. Both sides fix it; only one proves the fix and keeps it proved.",
      php: `<?php
// The fix, verified by refreshing the browser once:
function orderTotal(float $price, int $qty): float {
    if ($qty <= 0) {
        throw new InvalidArgumentException('qty must be positive');
    }
    return round($price * $qty, 2);
}
// "Tested it, works now." — until the next refactor
// quietly removes the guard and nobody re-checks.`,
      ts: `// order.test.ts — the regression test outlives the memory of the bug
import { expect, test } from 'vitest';
import { orderTotal } from './order';

// Named after the incident, so a future failure explains itself:
test('rejects zero quantity (bug #481: negative totals)', () => {
  expect(() => orderTotal(19.99, 0))
    .toThrow('qty must be positive');
});`,
      note:
        "A regression test is a bug that can never come back silently. Interviewers love the habit: 'every bug fix ships with the test that would have caught it'.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The course's mini harness: expect() throws on mismatch, test() catches and reports. Read it top to bottom — this ~15-line runner is the core of what Vitest does, and later playgrounds reuse the pattern. Then break a test on purpose: change 0.1 to 0.15 in orderTotal and rerun.",
    code: `// A test runner, hand-rolled in ~15 lines. This is the core of what
// Vitest does: expect() throws on a mismatch, test() catches and reports.

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(\`expected \${expected} but got \${actual}\`);
      }
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

// The code under test: a price calculation with a bulk discount.
function orderTotal(unitPrice: number, qty: number): number {
  const subtotal = unitPrice * qty;
  const discount = qty >= 10 ? 0.1 : 0;
  return Math.round(subtotal * (1 - discount) * 100) / 100;
}

// Each test is a permanent, executable claim about behaviour.
test("charges full price below 10 units", () => {
  expect(orderTotal(19.99, 2)).toBe(39.98);
});

test("applies the 10% bulk discount at exactly 10 units", () => {
  expect(orderTotal(10, 10)).toBe(90);
});

test("rounds to whole cents", () => {
  expect(orderTotal(0.1, 3)).toBe(0.3);
});

// Manual QA would re-click all three scenarios after every change.
// This re-proves them in milliseconds — change 0.1 to 0.15 above
// and watch a test fail with a message that names the broken claim.`,
  },

  keyPoints: [
    "Nearly every job listing demands testing experience — fluency in test strategy is the fastest way for a PHP veteran to read as senior rather than legacy.",
    "The manual loop (edit, alt-tab, refresh, click) is slow, forgets cases, and leaves nothing behind; a suite re-proves every scenario in milliseconds, forever.",
    "A test is just a function that throws when the result is wrong; a runner is a loop that catches and reports — hand-rolling one demystifies Vitest completely.",
    "Interviewers probe judgment, not APIs: how you decide what to test, and how tests enable safe refactoring and faster code review.",
    "'We tested manually' with no reflection is a red flag; 'manually — and here's what I'd automate first' turns your history into an asset.",
    "Every bug fix should ship with the regression test that would have caught it — a bug that can never silently return.",
  ],

  interview: [
    {
      q: "Your CV shows 25 years of PHP but your projects weren't covered by automated tests. How do you address that in an interview?",
      a: "Head-on, and as experience rather than a gap. I say: those codebases were verified manually, and I lived the cost of that — release-day checklists, regressions in features nobody re-clicked, fear of touching old code. That's exactly why I take testing seriously now. Then I show current fluency: I'd talk about the pyramid, Vitest for unit tests, Playwright for the critical journeys, and the habit of shipping every bug fix with a regression test. The framing matters — I'm not a developer who never learned testing, I'm one who has seen precisely what its absence costs in production.",
    },
    {
      q: "Why do teams invest in automated tests when manual QA already catches bugs?",
      a: "Because manual QA doesn't scale along the axis that matters: repetition. A human can check a scenario once; a suite re-checks a thousand scenarios on every commit, identically, in seconds. That changes behaviour, not just bug counts — developers refactor aggressively because the suite proves behaviour survived, reviewers trust changes because the tests state and prove intent, and CI blocks regressions before users see them. Manual QA still has a role for exploratory testing — finding the cases nobody scripted — but using humans as regression robots is the most expensive possible way to get the least reliable answer.",
    },
    {
      q: "What does a test runner like Vitest actually do under the hood?",
      a: "At its core, surprisingly little: `test(name, fn)` registers a function, `expect(actual)` returns matchers that throw an error with a descriptive message when an assertion fails, and the runner executes each registered function, catching throws and reporting pass or fail per name. Everything else is ergonomics layered on top — file discovery and watch mode, parallel workers, rich diffs between expected and actual values, mocking utilities, and coverage instrumentation. I've hand-rolled the core loop in about fifteen lines; knowing that keeps the framework from ever feeling like magic and makes debugging weird test behaviour much easier.",
    },
  ],

  quiz: [
    {
      question:
        "An interviewer asks how quality was handled at your last job, where testing was manual. What's the strongest answer?",
      options: [
        "Claim the projects had automated tests to avoid the red flag",
        "Say 'we tested manually and it worked fine' — results speak for themselves",
        "Describe the manual process honestly, what it cost, and what you would automate first",
        "Explain that testing was the QA department's responsibility, not yours",
      ],
      answerIndex: 2,
      explain:
        "Honesty plus reflection reads as senior: you understand the cost of manual QA from experience and have a concrete automation strategy. Claiming untrue coverage unravels under follow-up questions, 'it worked fine' signals you haven't understood the problem, and deflecting to QA signals you don't own quality.",
    },
    {
      question: "Strip away the tooling — what is an automated test, fundamentally?",
      options: [
        "A configuration file that describes expected application behaviour",
        "A function that calls your code and throws an error if the result is wrong",
        "A recording of a manual browser session that can be replayed",
        "A static-analysis pass that detects type errors before runtime",
      ],
      answerIndex: 1,
      explain:
        "A test is executable code: call the thing, compare the result, throw with a message on mismatch. The runner is a loop that catches those throws and prints PASS/FAIL. Recordings and static analysis are other tools; the throw-on-wrong function is the atom of testing.",
    },
    {
      question:
        "What is the key advantage of a committed regression test over fixing a bug and verifying it once in the browser?",
      options: [
        "The test makes the fix run faster in production",
        "The test proves the fix on every future change, so the bug can never return silently",
        "The test documents the bug for the project manager",
        "The test removes the need for code review of the fix",
      ],
      answerIndex: 1,
      explain:
        "A one-off browser check proves the fix today; the regression test re-proves it on every commit forever. When a future refactor reintroduces the bug, the named test fails immediately and explains what broke. Speed, documentation, and review are side benefits at best.",
    },
  ],
};

export default lesson;
