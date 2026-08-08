import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "expect-and-matchers",
  title: "expect() and the Matcher Vocabulary",
  part: "Vitest Fundamentals",
  estMinutes: 12,
  summary:
    "toBe is identity, toEqual is structure — the classic interview trap — plus the matcher vocabulary (toContain, toMatchObject, toThrow, toBeCloseTo, expect.any) that makes failures readable.",

  concept: `
An assertion has two jobs: fail when the code is wrong, and *explain the
failure*. Matchers exist for the second job. \`assertTrue($x === $y)\` and
\`expect(x === y).toBe(true)\` both fail correctly — and both report only
"expected true, got false". A specific matcher reports what was expected, what
arrived, and for objects, a diff of exactly which fields differ.

### toBe vs toEqual — the trap every interviewer knows

- **\`toBe\`** compares with \`Object.is\` — effectively \`===\`. For primitives
  that is what you want. For objects and arrays it demands *the same
  reference*.
- **\`toEqual\`** compares *structure*, recursively. Two different objects with
  the same fields and values are equal.

\`\`\`ts
const a = { id: 1, tags: ['new'] };
const b = { id: 1, tags: ['new'] };

expect(a).toEqual(b);   // passes — same shape and values
expect(a).toBe(b);      // FAILS — different references
expect(a).toBe(a);      // passes — same reference
\`\`\`

You already know this distinction from PHPUnit: **\`toBe\` is \`assertSame\`,
\`toEqual\` is \`assertEquals\`**. Same trap, same answer: identity for
primitives and "is it literally the same object", structure for comparing
data. (There is also \`toStrictEqual\`, which additionally cares about
\`undefined\` properties and class prototypes — mention it and interviewers
nod.)

### The everyday vocabulary

\`\`\`ts
expect(items).toContain('espresso');          // array/string membership
expect(user).toMatchObject({ role: 'admin' }); // subset of fields matches
expect(total).toBeCloseTo(0.3, 5);             // floats: NEVER toBe(0.1 + 0.2)
expect(() => parse('{bad')).toThrow('Unexpected token');
expect(response.status).not.toBe(500);         // .not negates any matcher
\`\`\`

- \`toContain\` works on arrays and strings.
- \`toMatchObject\` checks that the received object *contains at least* the
  given fields — ideal when you care about three fields of a twenty-field API
  response.
- \`toBeCloseTo\` exists because \`0.1 + 0.2 !== 0.3\` in IEEE floats — PHP has
  the same issue and \`assertEqualsWithDelta\` for it.
- \`toThrow\` takes the *function itself* (\`() => ...\`), not its result — the
  matcher has to run it inside a try/catch. Passing an already-thrown call is
  the classic mistake.

### Asymmetric matchers: assert the shape, not the noise

Sometimes part of a value is unknowable — a generated id, a timestamp.
Asymmetric matchers stand in for "anything of this kind":

\`\`\`ts
expect(order).toEqual({
  id: expect.any(String),
  createdAt: expect.any(Date),
  items: expect.arrayContaining([expect.objectContaining({ sku: 'A1' })]),
  total: 5000,
});
\`\`\`

This pins down what matters (\`total\`) while tolerating what does not (the
exact id). The alternative — deleting fields before comparing, or asserting
field by field — is noisier and loses the single readable diff.

### Why this beats assertTrue

When \`toEqual\` fails on two objects, the runner prints a coloured diff with
the exact differing keys. When \`assertTrue($a == $b)\` fails, you get "failed
asserting that false is true" and a debugging session. Choosing the most
specific matcher is not style — it converts every future failure from an
investigation into a sentence.
`,

  comparisons: [
    {
      label: "Identity vs structure: assertSame/assertEquals → toBe/toEqual",
      intro:
        "Both suites check a value object built by a factory. The identity assertion fails in both languages for the same reason: equal contents, different instances.",
      php: `<?php
public function testMoneyFactory(): void
{
    $a = Money::fromCents(1999);
    $b = Money::fromCents(1999);

    // Structure: passes — equal fields
    $this->assertEquals($a, $b);

    // Identity: FAILS — two instances
    $this->assertSame($a, $b);

    // Primitives: assertSame is right
    $this->assertSame(1999, $a->cents());
}`,
      ts: `// money.test.ts
it('builds equal Money values', () => {
  const a = moneyFromCents(1999);
  const b = moneyFromCents(1999);

  // Structure: passes — deep, recursive comparison
  expect(a).toEqual(b);

  // Identity: FAILS — Object.is on two references
  expect(a).toBe(b);

  // Primitives: toBe is right
  expect(a.cents).toBe(1999);
});`,
      note: "toBe = assertSame (identity via Object.is), toEqual = assertEquals (structure). Use toBe for primitives and same-reference checks, toEqual for data.",
    },
    {
      label: "Generic boolean assert vs a real matcher",
      intro:
        "The same failing test, written lazily and written well. Compare what each failure message gives you to debug with.",
      php: `<?php
public function testDiscountedTotal(): void
{
    $cart = $this->cartWithItems();

    // Fails with:
    // "Failed asserting that false is true."
    // Which field is wrong? No idea. Add var_dump,
    // re-run, remove var_dump...
    $this->assertTrue(
        $cart->summary() == ['total' => 90, 'items' => 2]
    );
}`,
      ts: `// cart.test.ts
it('summarises the discounted total', () => {
  const cart = cartWithItems();

  // Fails with a diff:
  //  - Expected  { total: 90, items: 2 }
  //  + Received  { total: 100, items: 2 }
  // The bug (discount not applied) is named
  // in the failure itself.
  expect(cart.summary()).toEqual({ total: 90, items: 2 });
});`,
      note: "Both tests catch the bug. Only one tells you what it is. Matcher choice is about the quality of the failure, not the pass.",
    },
    {
      label: "Expecting exceptions",
      intro:
        "Assert that invalid input is rejected. Note that toThrow receives a function to call, mirroring how expectException must be declared before the throwing line.",
      php: `<?php
public function testRejectsNegativeAmounts(): void
{
    $this->expectException(InvalidArgumentException::class);
    $this->expectExceptionMessage('amount must be positive');

    Money::fromCents(-5);
}`,
      ts: `// money.test.ts
it('rejects negative amounts', () => {
  // Pass the function — the matcher calls it in a try/catch.
  expect(() => moneyFromCents(-5))
    .toThrow('amount must be positive');

  // WRONG: this throws before expect() ever runs:
  // expect(moneyFromCents(-5)).toThrow(...)
});`,
      note: "toThrow needs the deferred function () => ..., not the result — calling it yourself throws past the matcher and fails the test with an unhandled error.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The mini harness grows two matchers: toEqual (a ~10-line deep equal — the actual algorithm) and toThrow. Predict which of the four tests fail before running: the point is watching toBe reject what toEqual accepts.",
    code: `// ── Mini harness: expect with toBe, toEqual, toThrow ─────────
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (!Object.is(actual, expected)) {
        throw new Error(
          \`expected \${JSON.stringify(actual)} to BE \${JSON.stringify(expected)} (identity)\`,
        );
      }
    },
    toEqual(expected: unknown) {
      if (!deepEqual(actual, expected)) {
        throw new Error(
          \`expected \${JSON.stringify(actual)} to EQUAL \${JSON.stringify(expected)} (structure)\`,
        );
      }
    },
    toThrow(message: string) {
      if (typeof actual !== 'function') throw new Error('pass a function to toThrow');
      try {
        actual();
      } catch (e) {
        const got = (e as Error).message;
        if (got.includes(message)) return;
        throw new Error(\`threw "\${got}", expected message containing "\${message}"\`);
      }
      throw new Error('expected function to throw, but it returned normally');
    },
  };
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(\`PASS  \${name}\`);
  } catch (e) {
    console.log(\`FAIL  \${name} — \${(e as Error).message}\`);
  }
}

// ── Code under test ──────────────────────────────────────────
function makeOrder(sku: string, qty: number) {
  if (qty < 1) throw new Error('qty must be positive');
  return { sku, qty, lines: [{ sku, qty }] };
}

// ── The suite ─────────────────────────────────────────────────
test('toBe works for primitives', () => {
  expect(makeOrder('A1', 2).qty).toBe(2);
});

test('toBe on structurally-equal objects (the trap)', () => {
  expect(makeOrder('A1', 2)).toBe(makeOrder('A1', 2)); // two references!
});

test('toEqual compares structure recursively', () => {
  expect(makeOrder('A1', 2)).toEqual({ sku: 'A1', qty: 2, lines: [{ sku: 'A1', qty: 2 }] });
});

test('toThrow catches the rejection', () => {
  expect(() => makeOrder('A1', 0)).toThrow('qty must be positive');
});`,
  },

  keyPoints: [
    "`toBe` is identity (`Object.is`, effectively ===) — PHPUnit's assertSame; `toEqual` is recursive structural equality — assertEquals. Primitives → toBe, data → toEqual.",
    "Two separately-built objects with identical contents pass `toEqual` and fail `toBe` — the single most common testing interview trap.",
    "Reach for the most specific matcher — `toContain`, `toMatchObject`, `toBeCloseTo` for floats — because specific matchers produce diffs, while `expect(x === y).toBe(true)` reports nothing useful.",
    "`toThrow` takes a function (`expect(() => f()).toThrow(...)`) so the matcher can run it in a try/catch — calling f() yourself throws before expect executes.",
    "Asymmetric matchers (`expect.any(Number)`, `expect.objectContaining`, `expect.arrayContaining`) pin down the fields that matter while tolerating generated ids and timestamps.",
    "`.not` negates any matcher; `toStrictEqual` is toEqual plus undefined-property and class-prototype checks.",
  ],

  interview: [
    {
      q: "What's the difference between toBe and toEqual in Vitest or Jest?",
      a: "toBe compares with Object.is — essentially strict identity, like PHPUnit's assertSame. It's correct for primitives, and for objects it only passes when both sides are literally the same reference. toEqual does a recursive structural comparison, like assertEquals: two different objects with the same fields and values are equal. So expect({a:1}).toEqual({a:1}) passes while toBe fails. The practical rule: toBe for primitives and same-instance checks, toEqual for comparing data. There's also toStrictEqual, which additionally distinguishes undefined properties and class instances from plain objects.",
    },
    {
      q: "Why do matchers matter — isn't expect(x === y).toBe(true) equivalent?",
      a: "It fails at the same times but tells you nothing when it does — 'expected true, received false' is PHPUnit's 'failed asserting that false is true' all over again. A specific matcher knows what you meant, so its failure message includes the expected value, the received value, and for toEqual a diff of exactly which keys differ. Over a suite's lifetime failures vastly outnumber first-time passes, so matcher choice is really about optimising debugging time. It also reads better: expect(items).toContain('espresso') is the specification in one line.",
    },
    {
      q: "How do you assert on an object that contains generated values like ids or timestamps?",
      a: "Asymmetric matchers. Inside a toEqual I use expect.any(String) or expect.any(Date) for the generated fields and literal values for the fields the test actually specifies — or toMatchObject / expect.objectContaining to assert a subset and ignore the rest entirely. That keeps one readable assertion with a proper diff instead of five field-by-field asserts or test code that strips fields before comparing. It also documents intent: 'the id exists and is a string, but its value is not this test's business.'",
    },
  ],

  quiz: [
    {
      question:
        "const a = { n: 1 }; const b = { n: 1 }; — which assertions pass?",
      options: [
        "expect(a).toBe(b) and expect(a).toEqual(b)",
        "expect(a).toEqual(b) only",
        "expect(a).toBe(b) only",
        "Neither — the objects must be the same instance for both",
      ],
      answerIndex: 1,
      explain:
        "toEqual compares structure recursively, so equal shapes pass. toBe uses Object.is, and a and b are two different references — it fails. This is exactly PHPUnit's assertEquals vs assertSame distinction.",
    },
    {
      question: "What is wrong with expect(parse('{bad')).toThrow()?",
      options: [
        "toThrow needs the exact error class as an argument",
        "parse('{bad') throws before expect() runs, so the matcher never executes",
        "toThrow only works with async functions",
        "Nothing — this is the documented form",
      ],
      answerIndex: 1,
      explain:
        "The argument to expect is evaluated first, so the exception escapes immediately as an unhandled error. Pass the function itself — expect(() => parse('{bad')).toThrow() — so the matcher can invoke it inside a try/catch.",
    },
    {
      question: "Which assertion is correct for expect(0.1 + 0.2)?",
      options: [
        ".toBe(0.3)",
        ".toEqual(0.3)",
        ".toBeCloseTo(0.3)",
        ".toMatchObject(0.3)",
      ],
      answerIndex: 2,
      explain:
        "IEEE floating point makes 0.1 + 0.2 equal 0.30000000000000004, so both toBe and toEqual fail. toBeCloseTo compares within a precision. PHP has the same problem — assertEqualsWithDelta is the analogue.",
    },
    {
      question:
        "You need to assert an API response has role: 'admin' and an id that is some string, ignoring ten other fields. Best tool?",
      options: [
        "expect(res).toBe({ role: 'admin' })",
        "expect(res).toMatchObject({ role: 'admin', id: expect.any(String) })",
        "expect(JSON.stringify(res)).toContain('admin')",
        "Delete the other ten fields, then use toEqual",
      ],
      answerIndex: 1,
      explain:
        "toMatchObject checks a subset of fields, and expect.any(String) accepts any string id — precise about what matters, silent about what doesn't, and it still yields a real diff on failure. String-matching JSON is brittle and diff-less.",
    },
  ],
};

export default lesson;
