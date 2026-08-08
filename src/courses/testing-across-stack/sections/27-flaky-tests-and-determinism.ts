import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "flaky-tests-and-determinism",
  title: "Flaky Tests & Determinism",
  part: "Discipline & Delivery",
  estMinutes: 11,
  summary:
    "A flaky test fails sometimes for the same code — catalogue the causes (time, randomness, shared state, un-awaited async, real networks, sleeps) and triage with reproduce → quarantine → fix or delete, never retry-as-policy.",

  concept: `
A **flaky test** passes and fails on different runs of the *same code*. One is
worse than none: the first time the team sees a red build and mutters "just
re-run it", the suite has stopped meaning anything. Green must mean safe and
red must mean broken, or nobody acts on either.

### The usual suspects

Flakiness is not bad luck; it is almost always one of six causes:

- **Real time.** \`new Date()\`, \`Date.now()\`, "expires in 30 days" logic —
  tests that pass all month and fail on the 31st, or at 23:59. Fix: fake
  timers (\`vi.useFakeTimers()\` + \`vi.setSystemTime()\`) or an injected
  \`now()\` dependency.
- **Unseeded randomness.** \`Math.random()\`, shuffled fixtures, UUID-based
  ordering. Fix: inject the random source and seed it in tests.
- **Shared state & order dependence.** A module-level array or a reused DB row
  mutated by one test and read by another — passes alone, fails in the suite
  (or only when run in parallel). Fix: fresh state in \`beforeEach\`, isolated
  fixtures, transactions rolled back per test.
- **Un-awaited async.** A missing \`await\` means the assertion runs before the
  work finishes — sometimes. Fix: await everything; lint rules like
  \`@typescript-eslint/no-floating-promises\` catch these mechanically.
- **Real networks and services.** A third-party API's latency or rate limit
  becomes your test result. Fix: stub the boundary; hit real services only in
  designated integration jobs.
- **Sleeps instead of condition-waits.** \`sleep(3000)\` is a race you
  scheduled: too short on a slow CI runner, wasted time everywhere else. Fix:
  wait on *conditions* — Playwright's web-first assertions
  (\`await expect(locator).toBeVisible()\`) and Vitest's \`expect.poll\` retry
  until true or timeout.

### The triage playbook

1. **Reproduce.** Run the suspect in a tight loop: Vitest's \`repeats\` test
   option runs a test extra times even when it passes; Playwright has
   \`--repeat-each\`. If it fails 3 times in 200 runs, you've confirmed a flake
   and have a failure to study.
2. **Quarantine.** Mark it \`.skip\` (or move it to a non-blocking job) *with a
   ticket*, so the rest of the suite stays trustworthy while it's under
   investigation. Quarantine is a holding cell, not a graveyard.
3. **Fix or delete.** Find the nondeterminism and remove it. If the test can't
   be made deterministic and guards nothing important, delete it — an
   untrustworthy test has negative value.

What is **never** the policy: retry-until-green. Vitest 4 has a \`retry\`
option (\`test('...', { retry: 3 }, fn)\`) and Playwright has \`retries\` —
they're legitimate as *instrumentation* (a retried-then-passed test is flagged
as flaky in reports, giving you a hit list) and as a temporary dam in e2e
suites, but a blanket retry policy just hides real races until they ship.
One more sharp edge worth knowing: pytest 9 now **dedupes duplicate path
arguments**, so \`pytest tests/ tests/\` no longer runs files twice — if your
suite's pass depended on repeated collection order, that's a flake pytest just
surfaced for you (\`--keep-duplicates\` restores the old behaviour).

### Determinism is a design property

The deep fix is never in the test file alone: code that *reaches out* for time,
randomness, or the network is untestable by construction. Inject those as
dependencies — a \`now()\` function, a \`random()\` source, a fetch client — and
the test controls the world completely. Same inputs, same outputs, every run,
forever. That's the whole definition of a trustworthy suite.
`,

  comparisons: [
    {
      label: "Real time & Math.random() vs injected clock & seeded RNG",
      intro:
        "A loyalty bonus doubles on weekends and picks a random reward. The left test's verdict depends on what day CI runs; the right test nails both sources of chaos to the floor.",
      php: `// bonus.test.js — flaky by construction
test('weekend bonus doubles points', () => {
  // Passes on Saturdays and Sundays. Fails Monday–Friday.
  const bonus = calcBonus(100, new Date(), Math.random());
  if ([0, 6].includes(new Date().getDay())) {
    expect(bonus.points).toBe(200);
  }
  // And bonus.reward is whatever Math.random() felt like.
  expect(['mug', 'sticker']).toContain(bonus.reward);
});`,
      ts: `// bonus.test.ts — deterministic: the test owns time and chance
test('weekend bonus doubles points and picks the seeded reward', () => {
  const saturday = new Date('2026-07-04T12:00:00Z');
  const seededRandom = () => 0.9; // or a real seeded PRNG

  const bonus = calcBonus(100, saturday, seededRandom);

  expect(bonus.points).toBe(200);     // always a Saturday here
  expect(bonus.reward).toBe('mug');   // 0.9 always maps to 'mug'
});
// calcBonus(amount, now, random) takes its chaos as parameters —
// production passes new Date() and Math.random(); tests pass fakes.`,
      note: "The left test has a hidden input: the machine's clock and entropy. Making time and randomness parameters turns them into controlled inputs — same idiom as vi.setSystemTime(), just via DI.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Shared state between tests vs fresh state per test",
      intro:
        "Two tests over a cart module. On the left they share one module-level cart, so the second test's result depends on whether the first ran before it — the classic 'passes alone, fails in the suite'.",
      php: `// cart.test.js — order-dependent
import { cart } from './cart'; // module-level singleton!

test('adding an item increases the count', () => {
  cart.add('book');
  expect(cart.count()).toBe(1);
});

test('a new cart is empty', () => {
  // Passes with .only, fails in the full suite:
  // the 'book' from the previous test is still there.
  expect(cart.count()).toBe(0);
});`,
      ts: `// cart.test.ts — every test builds its own world
import { createCart, type Cart } from './cart';

let cart: Cart;
beforeEach(() => {
  cart = createCart(); // fresh instance, no leftovers
});

test('adding an item increases the count', () => {
  cart.add('book');
  expect(cart.count()).toBe(1);
});

test('a new cart is empty', () => {
  expect(cart.count()).toBe(0); // true in any order, any parallelism
});`,
      note: "PHPUnit's setUp() taught this decades ago: build fixtures per test. Vitest runs files in parallel by default, so shared module state is a flake factory — factory functions plus beforeEach keep every test order-independent.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Sleep-and-hope vs condition-waiting in e2e",
      intro:
        "After clicking Save, a toast appears whenever the server responds. The left test bets 3 seconds is always enough; the right test waits on the condition itself.",
      php: `// save.spec.js — a race you scheduled yourself
test('shows a toast after saving', async ({ page }) => {
  await page.getByRole('button', { name: 'Save' }).click();

  // Too short on a cold CI runner -> flaky failure.
  // Long enough locally -> 3 wasted seconds per run.
  await page.waitForTimeout(3000);

  expect(await page.locator('.toast').isVisible()).toBe(true);
});`,
      ts: `// save.spec.ts — web-first assertion retries until true or timeout
test('shows a toast after saving', async ({ page }) => {
  await page.getByRole('button', { name: 'Save' }).click();

  // Polls the page; passes the instant the toast exists,
  // fails only after the timeout budget is truly exhausted.
  await expect(page.getByRole('status')).toHaveText('Saved');
});`,
      note: "Playwright's await expect(locator) assertions auto-retry — that's why the locator goes INSIDE expect. The left version also snapshots isVisible() once, so it can't recover even if the toast appears 10ms later.",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A 'random discount picker' made fully deterministic with a seeded PRNG and a frozen clock. It runs the same test three times — predict whether the three lines can ever differ, then run it.",
    code: `// Determinism kit: a seeded PRNG + a fixed clock make a "random" feature
// perfectly repeatable. The same test runs three times — identical output.

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(\`expected \${expected}, got \${actual}\`);
      }
    },
  };
}

// A tiny seeded PRNG (mulberry32). Same seed → same sequence, every run.
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The unit under test depends on time and randomness — but only via deps.
interface Deps {
  now: () => Date;
  random: () => number;
}

function pickDiscount(deps: Deps): string {
  const codes = ["SAVE5", "SAVE10", "SAVE15", "FREESHIP"];
  const code = codes[Math.floor(deps.random() * codes.length)];
  const day = deps.now().getUTCDay();
  const weekend = day === 0 || day === 6;
  return weekend ? \`\${code}-WEEKEND\` : code;
}

// Deterministic test doubles: a frozen Saturday + seed 42.
function makeDeps(): Deps {
  return {
    now: () => new Date("2026-07-04T12:00:00Z"), // a Saturday, forever
    random: seededRandom(42),
  };
}

for (let run = 1; run <= 3; run++) {
  const deps = makeDeps();
  const first = pickDiscount(deps);
  const second = pickDiscount(deps);
  try {
    expect(first).toBe("SAVE15-WEEKEND");
    expect(second).toBe("SAVE10-WEEKEND");
    console.log(\`run \${run}: PASS picks \${first} then \${second}\`);
  } catch (e) {
    console.log(\`run \${run}: FAIL \${(e as Error).message}\`);
  }
}

console.log("three runs, zero flakes — the inputs never vary");

// Try it: swap seededRandom(42) for Math.random and the expected
// values become guesses — that's exactly what a flaky test is.`,
  },

  keyPoints: [
    "A flaky test fails intermittently on unchanged code; once the team habitually re-runs red builds, the whole suite has lost its meaning.",
    "Six causes cover nearly all flakes: real time, unseeded randomness, shared state/order dependence, un-awaited async, real network calls, and sleeps instead of condition-waits.",
    "Triage: reproduce (Vitest `repeats`, Playwright `--repeat-each`), quarantine with a ticket, then fix the nondeterminism or delete the test.",
    "`retry` (Vitest 4) and `retries` (Playwright) are instrumentation that flags flaky tests in reports — retry-until-green as *policy* just hides races until production finds them.",
    "Replace sleeps with condition-waits: `await expect(locator).toBeVisible()` in Playwright and `expect.poll` in Vitest retry until true or timeout.",
    "Determinism is a design property: inject `now()`, `random()`, and network clients so tests control every input — same inputs, same output, every run.",
  ],

  interview: [
    {
      q: "Your CI suite has a handful of tests that fail maybe one run in twenty. How do you handle it?",
      a: "First I stop the bleeding: quarantine the known flakes — skip them or move them to a non-blocking job, each with a ticket — because a suite people re-run on red is providing zero signal. Then I reproduce each one deliberately: run it in a loop with Vitest's `repeats` option or Playwright's `--repeat-each` until I have a captured failure to study. The cause is almost always on a short list — real time, unseeded randomness, shared state between tests, a missing await, a real network call, or a sleep instead of a condition-wait — and the fix is to remove the nondeterminism, usually by injecting the clock or random source, isolating state per test, or switching to auto-retrying assertions. If a test can't be made deterministic and doesn't guard anything critical, I delete it. What I won't do is set a global retry policy; retries are fine as instrumentation to *find* flakes, but as a policy they hide real race conditions until users hit them.",
    },
    {
      q: "Why is `await page.waitForTimeout(3000)` considered a bug in an e2e test?",
      a: "Because it encodes a guess about performance, not a fact about the application. On a slow CI runner 3 seconds may not be enough — flaky failure; on a fast machine it's pure wasted time on every run, and those seconds multiply across hundreds of tests. The correct tool waits on the *condition* you actually care about: Playwright's web-first assertions like `await expect(page.getByRole('status')).toHaveText('Saved')` poll until the condition holds and pass the instant it does, failing only when the timeout budget is genuinely exhausted. Same idea as replacing sleep(3) in a shell script with a proper wait-for loop — except the framework has already written the loop for you.",
    },
    {
      q: "A test passes when run alone but fails in the full suite. What's your diagnosis?",
      a: "That signature is shared state — some test that runs earlier is mutating something this test reads: a module-level singleton, a reused database row, a global config, an environment variable. I'd confirm by running the file in isolation versus the suite, and try reordering or disabling neighbouring tests to find the polluter. The fix is per-test isolation: build fresh fixtures in beforeEach — PHPUnit's setUp() got this right twenty years ago — use factory functions instead of module-level instances, and wrap DB tests in transactions that roll back. It matters more in Vitest because files run in parallel by default, so order isn't just unspecified, it's genuinely concurrent.",
    },
  ],

  quiz: [
    {
      question:
        "A test asserts that a promo 'expires in 30 days' and started failing on May 31st. What is the root cause and durable fix?",
      options: [
        "The assertion library has a date bug — pin an older version",
        "The code adds 30 days to the real current date; fix by faking or injecting the clock so the test controls 'now'",
        "CI runs in a different timezone — set TZ=UTC and move on",
        "Add retry: 3 so month-end failures re-run automatically",
      ],
      answerIndex: 1,
      explain:
        "Date arithmetic against the real clock makes the test's verdict depend on when it runs — month-end is the classic trigger. Faking time (vi.setSystemTime) or injecting a now() dependency makes 'today' a controlled input. TZ tweaks and retries just move or mask the nondeterminism.",
    },
    {
      question: "What is the legitimate role of Vitest's retry / Playwright's retries options?",
      options: [
        "A permanent policy so the pipeline stays green despite flakes",
        "Instrumentation: retried-then-passed tests get flagged as flaky, giving you a list to fix — plus a temporary dam while you do",
        "A performance optimisation that parallelises failing tests",
        "They replace the need for deterministic test design",
      ],
      answerIndex: 1,
      explain:
        "Both runners mark a test that failed then passed as 'flaky' in reports, which is exactly the hit list you need for triage. Used as blanket policy, though, retries teach the team to ignore intermittent failures — which include real race conditions your users will eventually lose.",
    },
    {
      question:
        "In pytest 9, running `pytest tests/ tests/` behaves differently than in pytest 8. How?",
      options: [
        "It raises an error about conflicting arguments",
        "It runs everything twice, in parallel",
        "Duplicate/overlapping path args are deduped, so each file collects once; --keep-duplicates restores the old double run",
        "The second path is treated as a marker expression",
      ],
      answerIndex: 2,
      explain:
        "pytest 9 dedupes overlapping path arguments by default. If a suite behaved differently when files were collected twice, that was hidden order/state dependence — a flake — which the new default surfaces; --keep-duplicates opts back into the old behaviour.",
    },
  ],
};

export default lesson;
