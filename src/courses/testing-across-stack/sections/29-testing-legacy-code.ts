import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "testing-legacy-code",
  title: "Testing Legacy Code",
  part: "Discipline & Delivery",
  estMinutes: 13,
  summary:
    "A working system with zero tests is the interview scenario you already know cold — pin current behaviour with characterization tests, find seams to break dependencies, sprout new tested code beside the old, and never refactor without a net.",

  concept: `
Michael Feathers gave the field its working definition: **legacy code is code
without tests**. Not old code, not bad code — untested code, because you can't
change it safely. By that definition a function written this morning with no
test is already legacy. This is the situation every employer has somewhere and
every 25-year veteran has lived inside for years: a system that *works*, that
the business depends on, that nobody dares touch. Your instinct for how these
systems behave is real expertise — this section gives it modern vocabulary so
you can name the moves in an interview.

### The catch-22, and the way out

You want tests before you change the code, but the code is shaped so it can't
be tested — it reaches for globals, hits the database, echoes output, reads the
clock. The escape is to change the code *just enough to test it*, but that
change is itself unprotected. You break the loop with the smallest, safest
possible edits (extract a method, introduce a parameter) and lean on the
compiler and tooling, not on cleverness.

### Characterization tests: pin behaviour, don't judge it

A **characterization test** documents what the code *actually does today* —
bugs, quirks, and all — not what it *should* do. You run the function, observe
the output, and assert exactly that output, even when it's clearly wrong. The
point isn't correctness; it's a **tripwire**: once the current behaviour is
pinned, any change you make that alters it lights up red. You fix the quirks
*later*, deliberately, each as its own change with its own updated test. First
you get the system under test; then you improve it.

### Seams: where you change behaviour without editing in place

A **seam** is a place where you can swap behaviour without editing the code
there. The untestable version calls \`new Db()\` and \`date()\` directly — no
seam, nothing to swap. Extract those into a parameter or a dependency (the
extract-and-inject move: pass a \`clock\` and a \`repo\` in) and you've created a
seam: tests pass fakes, production passes the real thing. Every hard-to-test
tangle is really a missing seam.

### The sprout method: new code, born tested

When you must add a feature to an untested tangle, don't weave the new logic
into the old mess. **Sprout** it: write the new behaviour as a fresh,
fully-tested function, then call that function from the one line you add to the
legacy code. The old code stays uncovered but untouched; the new code is clean
and tested from birth. Its sibling is the **wrap method** — wrap the old
function in a new one that adds behaviour around it. Both keep the risky,
untested surface from growing.

### The discipline: no refactor without a net

Tie it together with one rule you can state in an interview: **do not refactor
without a net.** Refactoring a 400-line function with no tests is gambling with
production; the professional move is to pin its behaviour with characterization
tests *first*, create seams so it's testable, and only then start improving —
running the green suite after every small step. That is exactly the confidence
PHP veterans were denied for years, made routine.
`,

  comparisons: [
    {
      label: "An untestable tangle vs a seam-extracted, tested version",
      intro:
        "A function that emails a receipt. The legacy version reaches for a global DB, the real clock, and echoes straight to output — nothing can be asserted. The modern version pulls those out as seams.",
      php: `<?php
// legacy: nothing here can be tested in isolation
function sendReceipt($orderId) {
    global $db;                       // global state
    $order = $db->query(             // real database call
        "SELECT * FROM orders WHERE id = $orderId"
    )->fetch();

    $when = date('Y-m-d');            // real clock — output changes daily
    $total = $order['total'] * 1.1;   // tax rule buried in the middle

    echo "Receipt for #{$orderId}: \\$$total on $when";  // writes to output
    mail($order['email'], 'Receipt', "Total: $total");   // sends a real email
}
// To test this you'd need a live DB, today's date baked in,
// and an inbox to check. So nobody tests it.`,
      ts: `// modern: dependencies are parameters — every one is a seam
interface OrderRepo { find(id: number): { total: number; email: string }; }
interface Clock { today(): string; }
interface Mailer { send(to: string, subject: string, body: string): void; }

// Pure rule extracted so it can be tested on its own:
export function receiptTotal(subtotal: number): number {
  return Math.round(subtotal * 1.1 * 100) / 100; // tax, now testable alone
}

export function sendReceipt(
  orderId: number,
  repo: OrderRepo, clock: Clock, mailer: Mailer,
): string {
  const order = repo.find(orderId);
  const total = receiptTotal(order.total);
  const line = \`Receipt for #\${orderId}: $\${total} on \${clock.today()}\`;
  mailer.send(order.email, 'Receipt', \`Total: \${total}\`);
  return line;                        // return instead of echo — assertable
}
// Tests pass a fake repo, a frozen clock, and a spy mailer.`,
      note: "The DB, clock, mailer, and output were all hard-wired — no seams. Extracting them as parameters (and returning instead of echoing) makes each one swappable in a test; the tax rule becomes a pure function you can pin directly.",
      leftLang: "php",
      rightLang: "ts",
    },
    {
      label: "Characterization test: pin the quirk, don't fix it",
      intro:
        "Legacy calculateShipping has a live quirk — an order of exactly $50 is NOT free, only strictly above. The characterization test asserts that surprising-but-real behaviour on purpose.",
      php: `// A junior "fixes" the >50 quirk they spotted, ships it,
// and three downstream reports that relied on the old numbers
// break — with no test to warn anyone it changed.
function calculateShipping(subtotal, weight, country) {
  let cost = weight * 1.5;
  if (country !== 'US') cost += 10;
  if (subtotal > 50) cost = 0;   // exactly 50 still pays — surprising!
  if (cost < 0) cost = 0;
  return Math.round(cost * 100) / 100;
}`,
      ts: `// characterization.test.ts — lock TODAY's behaviour, quirks included
test('free shipping strictly ABOVE $50', () => {
  expect(calculateShipping(60, 2, 'US')).toBe(0);
});

test('EXACTLY $50 is not free — pinning the live quirk', () => {
  // We are NOT asserting what it should be; we assert what it IS,
  // so a "fix" can't slip out silently. 2 * 1.5 = 3.
  expect(calculateShipping(50, 2, 'US')).toBe(3);
});

test('non-US adds a $10 surcharge', () => {
  expect(calculateShipping(40, 2, 'CA')).toBe(13);
});
// Now the quirk has a tripwire. Fixing it becomes a deliberate
// change to THIS test — never an accident.`,
      note: "A characterization test records behaviour, it doesn't validate it. Asserting the surprising $50 result turns an invisible quirk into a documented, guarded fact — you can refactor freely, and change the quirk only on purpose.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Weaving new logic in vs sprouting it beside the old",
      intro:
        "You must add loyalty points when an order is placed. One approach edits the untested legacy function directly; the other sprouts a tested function and calls it from a single new line.",
      php: `<?php
// grow the untested tangle: new logic woven into old,
// still with zero tests around any of it
function placeOrder($cart) {
    global $db;
    // ...80 lines of untested order handling...
    $points = 0;                       // NEW, untested, inline
    foreach ($cart as $item) {
        $points += floor($item['price']); // rule now trapped in the mess
    }
    $db->save('points', $points);
    // ...40 more untested lines...
}`,
      ts: `// sprout: the new rule is a clean, tested function of its own
export function loyaltyPoints(cart: { price: number }[]): number {
  return cart.reduce((sum, item) => sum + Math.floor(item.price), 0);
}

// loyalty.test.ts
test('one point per whole dollar across the cart', () => {
  expect(loyaltyPoints([{ price: 9.99 }, { price: 5.5 }])).toBe(14);
});

// The legacy function gains ONE line calling the tested sprout:
//   const points = loyaltyPoints(cart);
// The old code stays untouched; the new code is covered from birth.`,
      note: "The sprout method keeps the untested surface from growing: new behaviour lives in a fully-tested function, and the legacy code only gains a single call site — the risky part isn't enlarged.",
      leftLang: "php",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Characterization in action: pin the odd-but-live behaviour of calculateShipping (including the $50 quirk and a negative-weight case), then run the SAME pinned suite against an extract-method refactor. Predict whether the refactor stays green.",
    code: `// Legacy code = code without tests. Step 1: pin what it does TODAY,
// quirks and all. Step 2: refactor under that net and stay green.

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(\`expected \${expected}, got \${actual}\`);
      }
    },
  };
}

type Shipping = (subtotal: number, weight: number, country: string) => number;

function characterize(label: string, fn: Shipping): void {
  console.log(label);
  const cases: [string, () => void][] = [
    ["free strictly ABOVE $50", () => expect(fn(60, 2, "US")).toBe(0)],
    ["EXACTLY $50 still pays (quirk!)", () => expect(fn(50, 2, "US")).toBe(3)],
    ["non-US adds $10 surcharge", () => expect(fn(40, 2, "CA")).toBe(13)],
    ["negative weight clamps to 0", () => expect(fn(40, -5, "US")).toBe(0)],
  ];
  for (const [name, assert] of cases) {
    try {
      assert();
      console.log(\`  PASS \${name}\`);
    } catch (e) {
      console.log(\`  FAIL \${name} — \${(e as Error).message}\`);
    }
  }
}

// The original legacy tangle — one long function, quirks baked in.
const legacy: Shipping = (subtotal, weight, country) => {
  let cost = weight * 1.5;
  if (country !== "US") cost += 10;
  if (subtotal > 50) cost = 0; // > not >=, so exactly 50 is not free
  if (cost < 0) cost = 0;
  return Math.round(cost * 100) / 100;
};

characterize("pinning the legacy behaviour:", legacy);

// Extract-method refactor — SAME order of operations, so SAME behaviour.
const base = (weight: number) => weight * 1.5;
const surcharge = (country: string) => (country === "US" ? 0 : 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

const refactored: Shipping = (subtotal, weight, country) => {
  let cost = base(weight) + surcharge(country);
  if (subtotal > 50) cost = 0;
  if (cost < 0) cost = 0;
  return round2(cost);
};

characterize("same suite, after refactor:", refactored);

console.log("net held: the quirk is guarded, so refactoring is safe");

// Try it: change '> 50' to '>= 50' in refactored — the $50 test goes
// RED. That's the tripwire catching a behaviour change, exactly as designed.`,
  },

  keyPoints: [
    "Feathers' definition: legacy code is code *without tests* — untested code can't be changed safely, regardless of its age.",
    "Characterization tests pin what the code does *today* — bugs and quirks included — as a tripwire; you assert the surprising output on purpose, then fix quirks later as deliberate changes.",
    "A seam is a place to swap behaviour without editing in place; extract globals, the DB, the clock, and output into parameters to create seams tests can control.",
    "The sprout method adds new behaviour as a fresh, fully-tested function called from one new line in the legacy code — the untested surface never grows.",
    "The rule to state in interviews: never refactor without a net — pin behaviour first, then improve in small steps with a green suite after each.",
    "A veteran's instinct for how untested systems behave is real expertise; this vocabulary — characterization, seams, sprout — lets you name the moves to a panel.",
  ],

  interview: [
    {
      q: "You join a team with a large, business-critical codebase and no tests. Where do you start?",
      a: "Not with a rewrite and not by adding tests everywhere at once. I start where change is actually needed — the next feature or bug fix — and I get *that* area under test first. The technique is characterization tests: I run the existing code, observe what it really does, and assert exactly that, quirks included, so I have a tripwire before I touch anything. Where the code is too tangled to test, I introduce seams by extracting dependencies — the database, the clock, output — into parameters, making the smallest safe edits and leaning on the compiler. For new behaviour I sprout tested functions beside the old code rather than weaving logic into the mess. It's incremental: the system gets safer exactly where the work is happening, instead of a big-bang effort that never finishes.",
    },
    {
      q: "What's a characterization test, and why would you assert behaviour you know is wrong?",
      a: "A characterization test documents what the code *currently does*, not what it should do. I run the function, see it returns — say — 3 when I'd expect 0, and I assert 3 anyway. That feels backwards until you see the purpose: it's a tripwire. Once today's behaviour is pinned, any change that alters it turns the suite red, so I can refactor a gnarly function with confidence that I haven't silently changed an output some downstream report quietly depends on. The wrong behaviour gets fixed later, deliberately, as its own change with its own updated assertion. First get it under test, then make it correct — never both at once.",
    },
    {
      q: "What is a seam, and how do you create one in tangled code?",
      a: "A seam is a place where you can change behaviour without editing the code at that spot. Untestable code has none — it calls `new Db()` or `date()` directly, so a test can't substitute anything. I create a seam with extract-and-inject: pull the hard-wired dependency out into a parameter or an injected object — pass in a `clock`, a `repo`, a `mailer` — so production wires the real thing and tests pass fakes. In PHP terms it's the same reason you'd inject a PDO instance instead of calling `new PDO()` inside a method. Almost every 'this can't be tested' complaint is really 'this has no seam yet'.",
    },
    {
      q: "How do you add a feature to untested legacy code without making things worse?",
      a: "The sprout method. Instead of threading new logic through the untested tangle — which grows the risky, uncovered surface — I write the new behaviour as a fresh function that's fully test-driven on its own, then add a single line to the legacy code that calls it. The old code stays untouched (so I haven't risked breaking it), and the new code is clean and covered from birth. If I need to add behaviour around an existing call rather than inside it, the wrap method does the same job by wrapping the old function in a new one. Either way the principle holds: don't enlarge the untested part, and never let 'just a quick change' go in without a test.",
    },
  ],

  quiz: [
    {
      question: "By Michael Feathers' definition, what makes code 'legacy'?",
      options: [
        "It was written more than five years ago",
        "It has no tests, so it can't be changed safely",
        "It uses an outdated framework or language version",
        "It has poor formatting and no documentation",
      ],
      answerIndex: 1,
      explain:
        "Feathers defines legacy code as code without tests — the age, style, or framework is irrelevant. The absence of a safety net is what makes it dangerous to change, so a function written this morning with no test already qualifies.",
    },
    {
      question:
        "A legacy function returns a value you're fairly sure is a bug. What does a characterization test assert?",
      options: [
        "The correct value, so the test documents the intended behaviour",
        "Nothing — you should fix the bug before writing any test",
        "The actual current (buggy) value, to pin today's behaviour as a tripwire",
        "A range that covers both the buggy and the correct value",
      ],
      answerIndex: 2,
      explain:
        "Characterization tests record what the code does *now*, quirks included, so any change that alters it fails loudly. You get the code under test first; correcting the bug comes later as a deliberate change to that pinned assertion.",
    },
    {
      question:
        "You must add loyalty-points logic to an 80-line untested legacy function. What's the sprout method?",
      options: [
        "Rewrite the whole function test-first before adding the feature",
        "Write the new logic inline where it's needed and add tests around the whole function",
        "Write the new logic as a fresh tested function and call it from one new line in the legacy code",
        "Copy the legacy function, add the feature to the copy, and switch callers over",
      ],
      answerIndex: 2,
      explain:
        "Sprouting keeps the untested surface from growing: the new behaviour lives in its own fully-tested function, and the legacy code only gains a single call site. The old tangle stays untouched while the new code is covered from birth.",
    },
  ],
};

export default lesson;
