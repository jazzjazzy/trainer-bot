import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "testing-async-code",
  title: "Testing Async Code & Fake Timers",
  part: "Vitest Fundamentals",
  estMinutes: 12,
  summary:
    "Await every promise assertion — an un-awaited test passes without running — and use Vitest's fake timers so debounce, retry, and expiry logic runs instantly and deterministically.",

  concept: `
PHP spoiled you in one specific way: it's (mostly) synchronous. A PHPUnit
test calls a method, the method finishes, you assert. In JavaScript, half of
everything returns a promise — and a test that forgets to wait for one
doesn't fail. It **passes while asserting nothing**. Interviewers for JS
roles probe async testing precisely because developers from synchronous
languages get bitten here.

### The classic bug: the test that always passes

\`\`\`ts
it("rejects for an unknown user", () => {
  fetchUser(999).then((user) => {
    expect(user).toBe(null); // never runs — test already passed
  });
});
\`\`\`

The test function returns immediately; Vitest sees no error and marks it
green. The \`.then\` callback fires later, into the void. The fix is
mechanical: **make the test \`async\` and \`await\` everything**.

### \`resolves\` and \`rejects\`

For asserting on promises directly, \`expect()\` has two async chains:

\`\`\`ts
it("resolves with the profile", async () => {
  await expect(fetchUser(1)).resolves.toEqual({ id: 1, name: "Ada" });
});

it("rejects for an unknown user", async () => {
  await expect(fetchUser(999)).rejects.toThrow("user 999 not found");
});
\`\`\`

Note the \`await\` in front of \`expect\` — \`rejects.toThrow\` returns a
promise, and an un-awaited one is the same silent-pass bug wearing a nicer
outfit. \`rejects\` is also the *only* correct way to test an error path:
wrapping in \`try/catch\` yourself risks a test that passes when the function
doesn't throw at all.

### Fake timers: don't sleep, time-travel

Now the second half: code that *waits*. Debounce, retry with backoff, session
expiry, cache TTLs. The naive test really waits — \`setTimeout\` for 2 seconds
— which makes the suite slow and flaky. Vitest can replace the clock:

\`\`\`ts
it("debounces rapid calls", () => {
  vi.useFakeTimers();
  const spy = vi.fn();
  const save = debounce(spy, 2000);

  save(); save(); save();
  vi.advanceTimersByTime(2000); // instant time travel

  expect(spy).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
\`\`\`

- \`vi.useFakeTimers()\` swaps \`setTimeout\`/\`setInterval\` (and friends) for
  a controlled clock; \`vi.useRealTimers()\` — typically in \`afterEach\` —
  restores it.
- \`vi.advanceTimersByTime(ms)\` fires everything scheduled within that
  window, in order, instantly.
- \`vi.runAllTimersAsync()\` is the awaitable variant for timers that resolve
  promises.
- \`vi.setSystemTime(date)\` pins \`new Date()\` / \`Date.now()\` — the
  equivalent of Carbon's \`setTestNow()\` from your PHP years — so
  date-dependent logic stops depending on when CI happens to run.

A test that controls time is **deterministic**: it can't flake because the
runner was slow that day. Hold that thought — flaky tests get a whole
section of their own later in the course, and fake timers are the number-one
cure.
`,

  comparisons: [
    {
      label: "The un-awaited test that always passes",
      intro:
        "Both tests want to prove fetchUser(999) rejects. The left one passes even if fetchUser resolves happily — the assertion runs after the test has already been marked green.",
      php: `// always green, asserts nothing
it("rejects for an unknown user", () => {
  expect(fetchUser(999)).rejects.toThrow("not found");
  // ^ rejects returns a promise nobody awaits.
  // The test function returns, vitest sees no
  // error, and the result is a false PASS.
});`,
      ts: `// the awaited version actually tests something
it("rejects for an unknown user", async () => {
  await expect(fetchUser(999))
    .rejects.toThrow("user 999 not found");
});

it("resolves with the profile", async () => {
  await expect(fetchUser(1))
    .resolves.toEqual({ id: 1, name: "Ada" });
});`,
      note: "rejects.toThrow returns a promise — without the await, a failing assertion surfaces (at best) as an unhandled rejection after the suite moved on.",
      leftLang: "js",
    },
    {
      label: "Sleeping vs time-travelling",
      intro:
        "Testing a 2-second debounce. The left test really waits 2.1 seconds of wall-clock time per run; the right one finishes in milliseconds and can't flake on a slow CI box.",
      php: `// 2.1 real seconds, every single run
it("fires after the quiet period", async () => {
  const spy = vi.fn();
  const save = debounce(spy, 2000);

  save();
  await new Promise((r) => setTimeout(r, 2100));

  expect(spy).toHaveBeenCalledTimes(1);
});`,
      ts: `// instant and deterministic
it("fires once after the quiet period", () => {
  vi.useFakeTimers();
  const spy = vi.fn();
  const save = debounce(spy, 2000);

  save(); save(); save(); // rapid calls collapse
  vi.advanceTimersByTime(1999);
  expect(spy).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(spy).toHaveBeenCalledTimes(1);

  vi.useRealTimers();
});`,
      note: "advanceTimersByTime lets you assert on both sides of the threshold — at 1999ms nothing, at 2000ms exactly one call — something a real sleep can never do reliably.",
      leftLang: "js",
    },
    {
      label: "Date-dependent logic: pin the clock",
      intro:
        "A discount applies during happy hour. The PHP-era test calls the real clock, so it passes at the office and fails in the 7pm CI run; the modern test pins the time.",
      php: `<?php
// PricerTest.php — passes before 18:00, fails after
public function testHappyHourDiscount(): void
{
    // quote() calls date('H') internally…
    $price = (new Pricer())->quote(100);

    $this->assertSame(90.0, $price);
}`,
      ts: `// pricer.test.ts — the clock is part of the test
it("applies the discount at 17:30", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-07T17:30:00"));

  expect(quote(100)).toBe(90);

  vi.useRealTimers();
});`,
      note: "vi.setSystemTime is Carbon::setTestNow() for JavaScript — new Date() and Date.now() return your pinned moment until useRealTimers restores the clock.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "retryWithBackoff takes its sleep function as a parameter, so the test injects a fake that resolves instantly while recording the requested delays — three simulated attempts complete in microseconds. Predict the attempt logs, then run it.",
    code: `// ── mini test harness ──────────────────────────────────────
function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(
          \`expected \${JSON.stringify(expected)} but got \${JSON.stringify(actual)}\`,
        );
      }
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(\`expected \${b} but got \${a}\`);
    },
  };
}
const tests: Array<[string, () => Promise<void>]> = [];
function test(name: string, fn: () => Promise<void>) {
  tests.push([name, fn]);
}
async function run() {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log("PASS " + name);
    } catch (e) {
      console.log("FAIL " + name + ": " + (e as Error).message);
    }
  }
}

// ── production code: the clock is INJECTED ─────────────────
type Sleep = (ms: number) => Promise<void>;

async function retryWithBackoff<T>(
  op: () => Promise<T>,
  retries: number,
  baseMs: number,
  sleep: Sleep,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await op();
    } catch (e) {
      if (attempt > retries) throw e;
      const delay = baseMs * 2 ** (attempt - 1);
      console.log(\`attempt \${attempt} failed — retrying in \${delay}ms\`);
      await sleep(delay);
    }
  }
}

// ── the tests: a fake clock that never actually waits ──────
const waits: number[] = [];
const fakeSleep: Sleep = async (ms) => {
  waits.push(ms); // record the delay, resolve instantly
};

let failuresLeft = 2;
async function flakyFetch(): Promise<string> {
  if (failuresLeft-- > 0) throw new Error("ECONNRESET");
  return "200 OK";
}

test("succeeds on the third attempt", async () => {
  const result = await retryWithBackoff(flakyFetch, 5, 100, fakeSleep);
  expect(result).toBe("200 OK");
});

test("backs off exponentially: 100ms then 200ms", async () => {
  expect(waits).toEqual([100, 200]);
});

test("gives up when retries are exhausted", async () => {
  failuresLeft = 99;
  let message = "no error";
  try {
    await retryWithBackoff(flakyFetch, 2, 100, fakeSleep);
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toBe("ECONNRESET");
});

await run();

// Try it: drop the 'await' before retryWithBackoff in the first
// test — it turns into the always-passing lie from the lesson.`,
  },

  keyPoints: [
    "A test that doesn't await its promise passes without running its assertions — the number-one async testing bug.",
    "Make test functions `async` and `await expect(promise).resolves...` / `.rejects.toThrow(...)` — the await in front of expect is mandatory.",
    "`rejects.toThrow` is the correct way to test error paths; hand-rolled try/catch can silently pass when nothing throws.",
    "`vi.useFakeTimers()` + `vi.advanceTimersByTime(ms)` runs debounce/retry/expiry logic instantly — never real-sleep in a test.",
    "`vi.setSystemTime(date)` pins new Date()/Date.now() — Carbon::setTestNow for JS; restore with `vi.useRealTimers()` in afterEach.",
    "Tests that control time are deterministic — fake timers are the primary cure for flaky suites.",
  ],

  interview: [
    {
      q: "What's the most common mistake when testing async JavaScript, and why is it dangerous?",
      a: "Forgetting to await. If a test kicks off a promise and returns without awaiting it, the runner marks the test green before any assertion runs — you get a permanently passing test that verifies nothing, which is worse than no test because it manufactures false confidence. It shows up in two forms: assertions inside a `.then()` callback, and `expect(promise).rejects.toThrow()` without the leading `await` (the whole chain returns a promise). The discipline is mechanical: every test touching a promise is `async`, and every promise-producing expression inside it gets an `await`. Coming from PHP, where execution is synchronous and this class of bug barely exists, it's the first thing I'd flag in a JS code review.",
    },
    {
      q: "How would you test a debounce function or retry-with-backoff without slowing the suite down?",
      a: "Never with real sleeps — a test that waits 2 seconds is slow forever and flaky on loaded CI machines. Two options. If the code uses global timers, `vi.useFakeTimers()` replaces setTimeout/setInterval with a controlled clock, and `vi.advanceTimersByTime(2000)` fires everything scheduled in that window instantly — I can even assert nothing fired at 1999ms and exactly one call fired at 2000ms, which a real sleep can't do. Alternatively, and often better, design the code to accept its sleep or clock function as a parameter and inject a fake in tests — same dependency-injection argument as with data access. Either way the test becomes deterministic: it asserts on logical time, not on how fast the runner happened to be.",
    },
    {
      q: "How do you test code whose behaviour depends on the current date or time of day?",
      a: "Pin the clock. With Vitest, `vi.useFakeTimers()` followed by `vi.setSystemTime(new Date('2026-07-07T17:30:00'))` makes `new Date()` and `Date.now()` return exactly that moment, and `vi.useRealTimers()` in an afterEach restores reality. It's the same idea as Carbon::setTestNow() in PHP. Without it you get tests that pass during business hours and fail in the overnight CI run — a textbook flaky test. The general principle is that time is an input: either inject it explicitly or mock it at the runtime boundary, but never let a test's outcome depend on when it executes.",
    },
  ],

  quiz: [
    {
      question:
        "A test calls expect(fetchUser(999)).rejects.toThrow('not found') without await and fetchUser actually resolves. What happens?",
      options: [
        "The test fails with a clear assertion error",
        "The test passes — the assertion promise is never awaited, so its failure never reaches the test",
        "Vitest refuses to run the test and reports a syntax error",
        "The test times out waiting for the rejection",
      ],
      answerIndex: 1,
      explain:
        "rejects.toThrow returns a promise. Without await, the test function returns immediately and is marked green; the assertion's failure surfaces later (at best as an unhandled rejection warning). Always `await expect(...).rejects...`.",
    },
    {
      question:
        "What does vi.advanceTimersByTime(3500) do with fake timers active and a setInterval(fn, 1000) pending?",
      options: [
        "Waits 3.5 real seconds, letting the interval fire naturally",
        "Fires fn once, because only the first scheduled timer runs",
        "Instantly fires fn three times — every tick that falls within the 3500ms window",
        "Throws unless vi.runAllTimers() is called first",
      ],
      answerIndex: 2,
      explain:
        "advanceTimersByTime moves the fake clock forward instantly and fires every timer scheduled within the window, in order — a 1000ms interval ticks at 1000, 2000, and 3000ms. No wall-clock time passes.",
    },
    {
      question:
        "Which Vitest call is the closest equivalent of Carbon::setTestNow() in PHP?",
      options: [
        "vi.advanceTimersByTime(new Date().getTime())",
        "vi.useFakeTimers() + vi.setSystemTime(date)",
        "vi.mock('Date')",
        "vi.spyOn(global, 'setTimeout')",
      ],
      answerIndex: 1,
      explain:
        "vi.setSystemTime pins what new Date() and Date.now() return (with fake timers enabled it also affects performance.now and friends), exactly like Carbon's setTestNow freezes 'now' for date logic. Restore with vi.useRealTimers().",
    },
  ],
};

export default lesson;
