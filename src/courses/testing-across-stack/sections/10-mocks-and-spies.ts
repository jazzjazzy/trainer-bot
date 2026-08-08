import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "mocks-and-spies",
  title: "Mocks, Spies & Fakes",
  part: "Vitest Fundamentals",
  estMinutes: 12,
  summary:
    "The test-double taxonomy — stub, spy, mock, fake — and Vitest's vi.fn() / vi.spyOn() toolkit, plus the discipline of asserting interactions only at boundaries that matter.",

  concept: `
Real dependencies — payment gateways, mailers, clocks — make tests slow,
flaky, or dangerous. Test doubles stand in for them. The vocabulary matters in
interviews, because "mock" gets used loosely for all of these:

- **Stub** — returns canned data. Exists so the code under test has something
  to work with. No assertions about it.
- **Spy** — records how it was called (arguments, call count) so the test can
  assert on the *interaction* afterwards.
- **Mock** — a spy with expectations: the test's point IS the interaction
  ("the mailer was called once, with this payload").
- **Fake** — a working lightweight substitute with real behaviour: an
  in-memory repository instead of MySQL.

Vitest doesn't make you pick a class per role. \`vi.fn()\` creates one object
that can play stub, spy, and mock — what you *do with it* determines which it
is. Mockery and PHPUnit's \`createMock\` blur the roles the same way.

### vi.fn(): a function that remembers

\`\`\`ts
import { vi, it, expect } from 'vitest';

const notify = vi.fn();                       // spy: records calls
const charge = vi.fn().mockReturnValue('rcpt_42');   // stub: canned return
const fetchUser = vi.fn().mockResolvedValue({ id: 1 }); // async stub

charge(1999);
expect(charge).toHaveBeenCalledTimes(1);
expect(charge).toHaveBeenCalledWith(1999);
expect(charge.mock.calls).toEqual([[1999]]);  // the raw call log
\`\`\`

Every \`vi.fn()\` carries a \`.mock.calls\` array — one entry per call, each an
array of that call's arguments. The matchers \`toHaveBeenCalledWith\` /
\`toHaveBeenCalledTimes\` are sugar over that array. \`mockReturnValue\` sets a
canned return; \`mockResolvedValue\` is the promise version (there are
\`mockRejectedValue\` and \`mockImplementation\` for errors and custom logic).

### vi.spyOn(): wrap a real method

\`vi.fn()\` builds a double from nothing; \`vi.spyOn(object, 'method')\` wraps an
*existing* method in place, recording calls while (by default) still running
the original:

\`\`\`ts
const spy = vi.spyOn(logger, 'warn');           // real warn still runs
vi.spyOn(gateway, 'charge').mockResolvedValue('rcpt_1'); // now also stubbed

// later:
spy.mockRestore();      // put the original back
\`\`\`

Restore matters: a spy left in place leaks into the next test. Call
\`mockRestore()\`, or set \`restoreMocks: true\` in \`vitest.config.ts\` and let
the runner do it between tests. This is Mockery's \`shouldReceive\` territory —
and \`mockRestore\` is the equivalent of \`Mockery::close()\` hygiene.

### Inject the double, don't reach into modules (yet)

The cleanest seam is the one you designed: if \`createOrderService({ charge,
notify })\` takes its dependencies as parameters, the test passes \`vi.fn()\`s
and no magic is needed. Replacing whole imported modules (\`vi.mock\`) exists
for code without such seams — that is the next section's topic.

### The over-mocking trap

Spies tempt you to assert *everything*: called once, in this order, with
exactly these arguments, and never that other method. Now the test encodes the
implementation, and any refactor — batching the two calls, renaming an
internal step — fails tests while behaviour is unchanged. The discipline:
**assert interactions only when the interaction IS the requirement** (an email
must be sent exactly once; a payment must not be charged twice). For
everything else, assert on returned values and state, and let the internals
move.
`,

  comparisons: [
    {
      label: "createMock + expects(once()) → vi.fn() + toHaveBeenCalledWith",
      intro:
        "An order service must charge the gateway and email a receipt exactly once. Both tests stub the gateway's return and assert the interaction with the mailer.",
      php: `<?php
public function testPlacingAnOrderSendsOneReceipt(): void
{
    $gateway = $this->createMock(Gateway::class);
    $gateway->method('charge')
            ->willReturn('rcpt_42');

    $mailer = $this->createMock(Mailer::class);
    $mailer->expects($this->once())
           ->method('send')
           ->with('jo@example.com', 'rcpt_42');

    $service = new OrderService($gateway, $mailer);
    $service->place('jo@example.com', 1999);
}`,
      ts: `// order-service.test.ts
import { vi, it, expect } from 'vitest';
import { createOrderService } from './order-service';

it('placing an order sends one receipt', async () => {
  const charge = vi.fn().mockResolvedValue('rcpt_42');
  const send = vi.fn();

  const service = createOrderService({ charge, send });
  await service.place('jo@example.com', 1999);

  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith('jo@example.com', 'rcpt_42');
});`,
      note: "Same shape: stub the gateway (willReturn → mockResolvedValue), assert the mailer interaction (expects(once())->with(...) → toHaveBeenCalledTimes/With). Vitest asserts AFTER the act; PHPUnit declares expectations before.",
    },
    {
      label: "Partial mocking a real object: Mockery vs vi.spyOn",
      intro:
        "Keep the real object but intercept one method — here, stubbing the clock a report depends on, then restoring it.",
      php: `<?php
public function testReportUsesCurrentQuarter(): void
{
    $clock = Mockery::mock(Clock::class)
        ->makePartial();
    $clock->shouldReceive('now')
          ->andReturn(new DateTimeImmutable('2026-02-01'));

    $report = new Report($clock);

    $this->assertSame('Q1 2026', $report->title());
    // teardown: Mockery::close();
}`,
      ts: `// report.test.ts
it('report uses the current quarter', () => {
  const spy = vi.spyOn(clock, 'now')
    .mockReturnValue(new Date('2026-02-01'));

  const report = createReport(clock);

  expect(report.title()).toBe('Q1 2026');
  expect(spy).toHaveBeenCalledTimes(1);

  spy.mockRestore(); // or restoreMocks: true in config
});`,
      note: "vi.spyOn wraps the method in place and can stub it; mockRestore() puts the original back — skip it and the stub leaks into the next test, the JS version of forgetting Mockery::close().",
    },
    {
      label: "Over-asserted interactions vs asserting the requirement",
      intro:
        "Two tests of the same discount logic. The left one pins every internal call; the right one pins the behaviour. Now imagine refactoring the service to fetch prices in one batched call.",
      php: `// discount.test.ts — coupled to implementation
it('applies the discount', async () => {
  const getPrice = vi.fn().mockResolvedValue(50);
  const svc = createCart({ getPrice });

  await svc.addItem('A1');
  await svc.addItem('B2');

  // Every internal move is pinned:
  expect(getPrice).toHaveBeenCalledTimes(2);
  expect(getPrice).toHaveBeenNthCalledWith(1, 'A1');
  expect(getPrice).toHaveBeenNthCalledWith(2, 'B2');
  expect(await svc.total()).toBe(90);
});
// Batch the lookups -> test breaks,
// behaviour unchanged.`,
      ts: `// discount.test.ts — coupled to behaviour
it('applies the 10% two-item discount', async () => {
  const getPrice = vi.fn().mockResolvedValue(50);
  const svc = createCart({ getPrice });

  await svc.addItem('A1');
  await svc.addItem('B2');

  // The requirement: two 50s cost 90.
  expect(await svc.total()).toBe(90);
});
// Batch the lookups -> still green.
// Interaction asserts are reserved for
// requirements ("charge exactly once").`,
      note: "Both catch a broken discount; only the left one also breaks on harmless refactors. Assert calls only when the call IS the requirement — payments, emails, audit logs.",
      leftLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "vi.fn() hand-rolled in ~15 lines: a factory whose product records every call in mock.calls and returns a settable value. Then it plays stub AND spy to test an order service. Predict all four results.",
    code: `// ── fn(): a mock-function factory, like vi.fn() ──────────────
interface MockFn {
  (...args: unknown[]): unknown;
  mock: { calls: unknown[][] };
  mockReturnValue(value: unknown): MockFn;
}

function fn(): MockFn {
  let returnValue: unknown;
  const mock = ((...args: unknown[]) => {
    mock.mock.calls.push(args);   // the spy part: record every call
    return returnValue;           // the stub part: canned return
  }) as MockFn;
  mock.mock = { calls: [] };
  mock.mockReturnValue = (v) => {
    returnValue = v;
    return mock;
  };
  return mock;
}

// ── Tiny assertions (deep-equal via JSON — fine for this demo) ──
function test(name: string, fnBody: () => void) {
  try {
    fnBody();
    console.log(\`PASS  \${name}\`);
  } catch (e) {
    console.log(\`FAIL  \${name} — \${(e as Error).message}\`);
  }
}
function expectEqual(actual: unknown, expected: unknown) {
  const [a, b] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== b) throw new Error(\`expected \${a} to equal \${b}\`);
}

// ── Code under test: depends on a gateway and a notifier ─────
function createOrderService(deps: { charge: MockFn; notify: MockFn }) {
  return {
    place(email: string, amountCents: number) {
      const receipt = deps.charge(amountCents);
      deps.notify(email, { amountCents, receipt });
      return receipt;
    },
  };
}

// ── The suite ─────────────────────────────────────────────────
const charge = fn().mockReturnValue('rcpt_42'); // stub
const notify = fn();                            // spy
const service = createOrderService({ charge, notify });

const receipt = service.place('jo@example.com', 1999);

test('returns the gateway receipt', () => {
  expectEqual(receipt, 'rcpt_42');
});

test('charges exactly once', () => {
  expectEqual(charge.mock.calls.length, 1);   // toHaveBeenCalledTimes(1)
});

test('charges the right amount', () => {
  expectEqual(charge.mock.calls[0], [1999]);  // toHaveBeenCalledWith(1999)
});

test('notifies with the right payload', () => {
  expectEqual(notify.mock.calls, [
    ['jo@example.com', { amountCents: 1999, receipt: 'rcpt_42' }],
  ]);
});

// Vitest's toHaveBeenCalledWith is exactly this: a deep-equal
// against entries of mock.calls.`,
  },

  keyPoints: [
    "Taxonomy: a stub returns canned data, a spy records calls, a mock is a spy whose interaction is the assertion, a fake is a working substitute (in-memory repo).",
    "`vi.fn()` builds a standalone double: `.mock.calls` logs every call's arguments, `mockReturnValue` / `mockResolvedValue` / `mockRejectedValue` set canned results.",
    "`toHaveBeenCalledTimes` / `toHaveBeenCalledWith` / `toHaveBeenNthCalledWith` are sugar over the `mock.calls` array — PHPUnit's expects(\$this->once())->with(...), asserted after the act instead of declared before.",
    "`vi.spyOn(obj, 'method')` wraps an existing method in place (optionally stubbing it); always restore via `mockRestore()` or `restoreMocks: true` in config — a leaked spy is the JS Mockery::close() bug.",
    "Prefer injecting doubles through constructor/factory parameters; module-level replacement (vi.mock) is for code without seams.",
    "Assert interactions only when the interaction IS the requirement (charge once, email once); otherwise assert returned values and state so refactors stay green.",
  ],

  interview: [
    {
      q: "Explain the difference between a stub, a spy, a mock, and a fake.",
      a: "A stub supplies canned data so the code under test can proceed — no assertions on it. A spy records its calls (arguments, count) so the test can assert on the interaction afterwards. A mock is a spy where that interaction is the point of the test — 'the mailer was called exactly once with this payload'. A fake is a genuinely working substitute, like an in-memory repository standing in for the database. In Vitest one vi.fn() can play stub, spy or mock depending on whether you set a return value, read mock.calls, or assert with toHaveBeenCalledWith — same blurring as PHPUnit's createMock or Mockery.",
    },
    {
      q: "When do you use vi.fn() versus vi.spyOn()?",
      a: "vi.fn() creates a double from scratch — ideal when the test injects dependencies itself, say passing { charge: vi.fn().mockResolvedValue('rcpt_1') } into a factory. vi.spyOn(object, 'method') wraps a method that already exists on a real object, recording calls and optionally stubbing with mockReturnValue — right when you want mostly-real behaviour with one method intercepted, like freezing a clock. The trade-off with spyOn is cleanup: you must mockRestore() or enable restoreMocks in config, or the patched method leaks into other tests — the same hygiene as Mockery::close() in PHP.",
    },
    {
      q: "What is over-mocking, and how do you avoid it?",
      a: "Asserting every interaction — call counts, exact orders, exact arguments for every collaborator — so the test becomes a mirror of the implementation. Then a harmless refactor, like batching two lookups into one, fails tests even though behaviour is identical, and people learn to distrust the suite. I avoid it by defaulting to state-based assertions on return values and observable outcomes, and reserving toHaveBeenCalledWith for interactions that are themselves requirements: a card must be charged exactly once, an email must go to the right address. Rule of thumb: if a user or auditor couldn't tell the difference, the test shouldn't either.",
    },
  ],

  quiz: [
    {
      question:
        "A test passes vi.fn().mockResolvedValue({ id: 1 }) as fetchUser and never asserts on it. In the taxonomy, that double is a...",
      options: ["Mock", "Spy", "Stub", "Fake"],
      answerIndex: 2,
      explain:
        "It exists only to return canned data so the code under test can run; nobody inspects its calls. Reading mock.calls would make it a spy; asserting the interaction would make it a mock; real working logic would make it a fake.",
    },
    {
      question:
        "What does vi.spyOn(logger, 'warn') do by default, and what must you remember afterwards?",
      options: [
        "Replaces warn with a no-op forever; nothing to clean up",
        "Wraps the real method, recording calls while still running the original; restore it with mockRestore() or restoreMocks: true",
        "Creates a detached copy of warn that must be re-attached manually",
        "Throws unless a mockReturnValue is provided",
      ],
      answerIndex: 1,
      explain:
        "spyOn patches the method in place — the original still runs unless you stub it with mockReturnValue/mockImplementation. Without mockRestore() (or restoreMocks in config) the patch persists into later tests, causing spooky cross-test failures.",
    },
    {
      question:
        "Which assertion is the equivalent of PHPUnit's expects($this->once())->method('send')->with('jo@example.com')?",
      options: [
        "expect(send.mock.calls).toBe([['jo@example.com']])",
        "expect(send).toHaveBeenCalledTimes(1) plus expect(send).toHaveBeenCalledWith('jo@example.com')",
        "expect(send).toReturnWith('jo@example.com')",
        "expect(vi.mocked(send)).toBeTruthy()",
      ],
      answerIndex: 1,
      explain:
        "toHaveBeenCalledTimes(1) covers the once() expectation and toHaveBeenCalledWith the with() arguments — asserted after acting, whereas PHPUnit declares them before. Option A also fails because toBe demands reference identity, not structural equality.",
    },
  ],
};

export default lesson;
