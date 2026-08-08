import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "designing-testable-code",
  title: "Designing Testable Code",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "Testability is a design property: pure functions, dependencies passed in, and decisions separated from side effects make tests trivial — no mocking framework required.",

  concept: `
Some code takes five minutes to test; the same logic written differently
takes an afternoon of mocking gymnastics. The difference is never the test
framework — it's the **design of the code under test**. Testability is a
design property, and the three habits below are what "testable" means in
practice.

### Pure functions test themselves

A pure function — same inputs, same output, no side effects — is the
easiest thing in software to test: call it, compare, done. No setup, no
teardown, no fakes. Every piece of logic you can express as a pure function
is a test you'll never struggle to write. The design skill is *pushing*
logic toward purity: a calculation that currently reads a global can almost
always take that value as a parameter instead.

### Hidden dependencies make code untestable

Consider a function every PHP veteran has written:

\`\`\`php
function applyLateFee(int $orderId): float {
    global $db;                        // hidden dependency #1
    $order = $db->fetchOrder($orderId);
    $daysLate = (time() - $order->dueAt) / 86400;   // hidden #2: the real clock
    // ... the actual fee logic, trapped in the middle ...
}
\`\`\`

To test the fee logic you need a real database *and* you need today to be
the right day. The logic isn't wrong — it's **imprisoned**. It grabs its
dependencies from the environment (\`global\`, \`time()\`, \`new PDO\`)
instead of declaring them.

### Dependency injection is just "pass it in"

Strip the enterprise mystique from DI: **a function should receive what it
needs as parameters instead of reaching out and grabbing it**. Pass the
repository. Pass the clock. In TypeScript an interface names the shape:

\`\`\`ts
interface Clock { now(): Date; }

function lateFee(order: Order, clock: Clock): number { ... }
\`\`\`

Now the test passes a **fake**: \`{ now: () => new Date('2026-03-11') }\` —
a plain object literal, one line, no library. Time becomes an ordinary
input, and "three days late" is testable forever instead of for one
72-hour window. This idea carries the whole course: when mocking appears
later, injecting a hand-written fake is usually the cleaner alternative
to reaching for a mocking framework — you can only inject a fake where
the design left a seam, which is why this is a design section, not a
tooling one.

### Functional core, imperative shell

The pattern that organises all of this: separate **decisions** from
**effects**.

- The **functional core** is pure logic: given this order and this date,
  the fee is $10. Given this cart, the order total is $220. Dense with
  business rules, trivially unit-testable, no I/O anywhere.
- The **imperative shell** is a thin layer that does I/O: read the order
  from the database, call the core, write the result back, send the email.
  Almost no logic — so almost nothing to unit-test; the integration layer
  of the pyramid covers it.

Most "hard to test" code is hard because decisions and effects are
interleaved: a loop that computes *and* saves *and* emails. Untangle it —
compute the list of emails to send (pure, heavily tested), then a
three-line shell that sends them (covered by one integration test).

### The interview framing

"How do you make code testable?" is really "do you design for seams?" The
strong answer: keep business logic in pure functions, inject dependencies
— especially clocks, randomness, and I/O clients — and keep side effects
in a thin shell. Then testing needs no cleverness: fakes are object
literals and most tests are call-and-compare.
`,

  comparisons: [
    {
      label: "Hard-wired dependencies vs injected dependencies",
      intro:
        "The same late-fee rule twice. The left grabs a global connection and the real clock; the right declares what it needs. Only one can be tested without a database and a time machine.",
      php: `<?php
// Untestable: dependencies grabbed from the environment.
function applyLateFee(int $orderId): float {
    global $db;                       // needs a real DB
    $order = $db->fetchOrder($orderId);

    $daysLate = ceil((time() - $order->dueAt) / 86400);
    if ($daysLate <= 0) {
        return 0.0;                   // "not late" is only
    }                                 // testable before the
                                      // due date — literally.
    $fee = min($daysLate * 5, $order->amount * 0.25);
    $db->saveFee($orderId, $fee);     // and it writes, too
    return $fee;
}`,
      ts: `// Testable: everything the logic needs arrives as a parameter.
interface Clock {
  now(): Date;
}

interface Order {
  dueDate: Date;
  amount: number;
}

// Pure decision — no DB, no real clock, no writes.
export function lateFee(order: Order, clock: Clock): number {
  const msLate = clock.now().getTime() - order.dueDate.getTime();
  if (msLate <= 0) return 0;
  const daysLate = Math.ceil(msLate / 86_400_000);
  return Math.min(daysLate * 5, order.amount * 0.25);
}

// The shell (elsewhere) fetches the order, calls lateFee,
// and saves the result — three lines, no decisions.`,
      note:
        "Same rule, opposite testability: the left needs a seeded database and the right calendar date; the right needs a fake clock — a one-line object literal. DI is just 'pass it in'.",
    },
    {
      label: "Decisions tangled with effects vs functional core, imperative shell",
      intro:
        "Send payment reminders for overdue orders. The left computes, saves, and emails in one loop; the right computes a plan (pure) and lets a thin shell execute it.",
      php: `<?php
// Decide + save + email, interleaved in one loop.
// Testing ANY of the logic sends real email.
function sendReminders(): void {
    global $db, $mailer;
    foreach ($db->overdueOrders() as $order) {
        $days = ceil((time() - $order->dueAt) / 86400);
        if ($days < 3 || $order->remindedAt !== null) {
            continue;   // business rules, trapped
        }
        $mailer->send(
            $order->email,
            "Order #{$order->id} is {$days} days overdue"
        );
        $db->markReminded($order->id);
    }
}`,
      ts: `// Functional core: decide WHO gets WHAT. Pure, heavily tested.
export function remindersDue(
  orders: OverdueOrder[],
  today: Date
): Reminder[] {
  return orders
    .filter((o) => !o.remindedAt)
    .map((o) => ({
      orderId: o.id,
      email: o.email,
      daysLate: daysBetween(o.dueDate, today),
    }))
    .filter((r) => r.daysLate >= 3);
}

// Imperative shell: three lines of I/O, no decisions.
export async function sendReminders(db: Db, mailer: Mailer, clock: Clock) {
  const due = remindersDue(await db.overdueOrders(), clock.now());
  for (const r of due) await mailer.send(r.email, reminderText(r));
  for (const r of due) await db.markReminded(r.orderId);
}`,
      note:
        "The rules (3-day threshold, don't remind twice) now live in a pure function tested with plain arrays — no mailer, no DB. The shell is so thin one integration test covers it.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The lateFee logic under test with an injected fake clock — a one-line object literal, no mocking framework. Note how 'one day late' and 'capped at 25%' are testable on any day of any year. Predict all five results, then try changing the cap to 0.5 and see which test speaks up.",
    code: `// Dependency injection without a mocking framework: the "fake" is a
// plain object literal that satisfies the Clock interface.

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

// The seam: time is a dependency, so it is passed in, never grabbed.
interface Clock {
  now(): Date;
}

interface Order {
  id: number;
  dueDate: Date;
  amount: number;
}

// Pure decision logic: same inputs, same answer, forever.
function lateFee(order: Order, clock: Clock): number {
  const msLate = clock.now().getTime() - order.dueDate.getTime();
  if (msLate <= 0) return 0;
  const daysLate = Math.ceil(msLate / 86_400_000);
  return Math.min(daysLate * 5, order.amount * 0.25); // $5/day, capped at 25%
}

// A fake clock: one line, no library, totally deterministic.
const frozen = (iso: string): Clock => ({ now: () => new Date(iso) });

const order: Order = {
  id: 7,
  dueDate: new Date("2026-03-10T00:00:00Z"),
  amount: 200,
};

test("no fee before the due date", () => {
  expect(lateFee(order, frozen("2026-03-09T12:00:00Z"))).toBe(0);
});

test("no fee at the exact due moment", () => {
  expect(lateFee(order, frozen("2026-03-10T00:00:00Z"))).toBe(0);
});

test("one day late charges $5", () => {
  expect(lateFee(order, frozen("2026-03-11T00:00:00Z"))).toBe(5);
});

test("a partial day rounds up to a full day", () => {
  expect(lateFee(order, frozen("2026-03-11T00:00:01Z"))).toBe(10);
});

test("fee is capped at 25% of the order", () => {
  expect(lateFee(order, frozen("2026-06-01T00:00:00Z"))).toBe(50);
});

// Had lateFee called new Date() internally, "one day late" would only be
// testable for 24 hours. The injected clock makes time an ordinary input.`,
  },

  keyPoints: [
    "Testability is a design property — the same logic is a five-minute test or an afternoon of mocking depending on how it's structured.",
    "Pure functions (same inputs, same output, no side effects) are trivially testable: call and compare, no setup, no fakes.",
    "Hidden dependencies — global $db, time(), new PDO inside a function — imprison the logic; DI is simply 'receive what you need as parameters'.",
    "Inject clocks, randomness, and I/O clients especially: a fake clock is a one-line object literal, and time becomes an ordinary input.",
    "Functional core, imperative shell: dense pure logic (unit-tested heavily) wrapped by a thin I/O layer (covered by a few integration tests).",
    "This is the seed for the mocking sections later: hand-written fakes beat mocking frameworks, but only designs with seams allow them.",
  ],

  interview: [
    {
      q: "What makes code testable, in your view?",
      a: "Three design habits. First, keep business logic in pure functions — same inputs, same outputs, no side effects — because those test with a call and a comparison, no setup. Second, dependency injection, meaning nothing grander than 'receive what you need as parameters': pass the repository and the clock in rather than reaching for a global or calling the system time internally. A function that news up its own PDO connection and calls date() is untestable not because the logic is wrong but because its dependencies are hidden. Third, functional core, imperative shell: concentrate decisions in pure code and keep I/O in a thin outer layer, so unit tests cover the dense logic and a few integration tests cover the plumbing.",
    },
    {
      q: "How would you test logic that depends on the current date — say, a late-fee calculation?",
      a: "By making time an explicit dependency. The function takes a clock — in TypeScript, a one-method interface like Clock with now(): Date — and production passes the real clock while tests pass a frozen one: an object literal returning a fixed date. Then 'one day late charges $5' and 'the fee caps at 25%' are deterministic tests that pass on any machine on any day, rather than assertions that are only true during a particular 24-hour window. The same treatment applies to any ambient nondeterminism — randomness, UUID generation, environment variables. If I inherit code that calls the system clock internally, that's the first refactor: hoist the call to a parameter and the logic becomes pure.",
    },
    {
      q: "Explain 'functional core, imperative shell' and why it changes how much mocking you need.",
      a: "You split the code into a pure decision layer and a thin effect layer. The core answers questions — given these overdue orders and today's date, these three reminders are due — using only its inputs, so it's unit-tested with plain data structures: arrays in, expected array out, zero mocks. The shell performs the effects the core decided on — fetch orders, send the emails, mark them reminded — and contains almost no logic, so it needs no unit tests, just an integration test or two proving the wiring. Most heavy mocking exists because decisions and effects are interleaved: to reach the logic you must stub the mailer and the database around it. Untangle them and the mocks mostly evaporate — which is why I treat a mock-heavy suite as a design smell before a tooling problem.",
    },
  ],

  quiz: [
    {
      question:
        "A function calls time() internally to decide if an order is late. Why is this a testability problem?",
      options: [
        "time() is too slow for unit tests",
        "The test's outcome depends on when it runs — 'three days late' is only true during one real 72-hour window",
        "PHP's time() is deprecated in favour of DateTime",
        "Unit tests are not allowed to touch system functions",
      ],
      answerIndex: 1,
      explain:
        "The hidden clock makes the function nondeterministic from the test's point of view: the same call gives different answers on different days. Injecting a clock (interface with now()) turns time into an ordinary input, so a frozen fake makes every date scenario testable forever.",
    },
    {
      question: "In 'functional core, imperative shell', where should business rules live and why?",
      options: [
        "In the shell, so they sit close to the data they operate on",
        "Split evenly between core and shell for balance",
        "In the pure core, so they're unit-testable with plain data and no mocks; the thin shell just performs the decided effects",
        "In database stored procedures, so both layers can share them",
      ],
      answerIndex: 2,
      explain:
        "The core makes decisions from its inputs alone — trivially tested with arrays and objects. The shell fetches, calls the core, and executes the results, holding so little logic that a couple of integration tests cover it. Interleaving rules with I/O is what forces mock-heavy tests.",
    },
    {
      question: "What is dependency injection, stripped to its essence?",
      options: [
        "A framework feature that autowires services from a container",
        "A function or class receives what it needs as parameters instead of grabbing globals or constructing dependencies internally",
        "Replacing all classes with interfaces",
        "A technique for lazy-loading heavy objects",
      ],
      answerIndex: 1,
      explain:
        "Containers and autowiring are optional conveniences built on top; the core idea is just 'pass it in'. Once dependencies arrive as parameters, a test can pass a hand-written fake — like a frozen clock object literal — with no mocking framework at all.",
    },
  ],
};

export default lesson;
