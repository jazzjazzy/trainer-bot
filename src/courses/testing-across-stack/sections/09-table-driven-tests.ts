import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "table-driven-tests",
  title: "Table-Driven Tests with it.each",
  part: "Vitest Fundamentals",
  estMinutes: 11,
  summary:
    "it.each runs one test body over a table of cases with per-row names — PHPUnit's @dataProvider, modernised — and knowing when a table clarifies versus when it hides intent.",

  concept: `
Validation rules, parsers, formatters, tax brackets: code where the logic is
one function and the interesting part is *the inputs*. Copy-pasting a test per
input buries the pattern in boilerplate. \`it.each\` (alias \`test.each\`) runs
one test body over a table of cases — and this is the strongest PHP bridge in
the whole course, because **it is exactly PHPUnit's \`@dataProvider\`**. If you
have written data providers, you already think in tables; only the syntax is
new.

### Array-of-tuples: the workhorse

\`\`\`ts
it.each([
  ['user@example.com', true],
  ['no-at-sign', false],
  ['@nobody', false],
  ['trailing@dot.', false],
])('isValidEmail(%s) -> %s', (input, expected) => {
  expect(isValidEmail(input)).toBe(expected);
});
\`\`\`

Each row becomes its own test, and the name template uses **printf-style
placeholders** filled from the row, in order: \`%s\` string, \`%i\` integer,
\`%f\` float, \`%j\` JSON, \`%#\` the row index. So the runner reports:

\`\`\`
✓ isValidEmail(user@example.com) -> true
✓ isValidEmail(no-at-sign) -> false
\`\`\`

Every row passes or fails *individually*, with a name that tells you which
input broke — precisely what \`@dataProvider\` gives you with named dataset
keys, minus the separate provider method.

### Object rows: named fields, $property names

Tuples get cryptic past three columns. Objects name the fields, and the test
name can reference them with \`$property\`:

\`\`\`ts
it.each([
  { cents: 0,       expected: '$0.00' },
  { cents: 5,       expected: '$0.05' },
  { cents: 123456,  expected: '$1,234.56' },
])('formats $cents as $expected', ({ cents, expected }) => {
  expect(formatPrice(cents)).toBe(expected);
});
\`\`\`

There is also a template-literal table syntax with pipe-separated headers,
which reads like a markdown table:

\`\`\`ts
it.each\`
  cents     | expected
  \${0}      | \${'$0.00'}
  \${123456} | \${'$1,234.56'}
\`('formats $cents as $expected', ({ cents, expected }) => {
  expect(formatPrice(cents)).toBe(expected);
});
\`\`\`

Teams either love it or ban it; recognise it, but the object form is easier
to type and to grep.

### When tables win — and when they lie

Tables shine when **every case runs the same assertions** and only data
varies: boundary values around a limit, all the ways an email can be
malformed, one row per tax bracket. The table *is* the specification, and
adding a regression case is a one-line diff.

Tables hide intent when cases *differ in behaviour*, not just data. If one row
needs \`toThrow\`, another checks a returned object, and a third needs a mock —
forcing them into one body produces flag parameters and \`if\` branches inside
the test, and now the test needs a test. The smell to watch for: columns like
\`shouldThrow: boolean\`. Split those into individually-named \`it()\` blocks.
Same judgment call as an overgrown data provider in PHPUnit.
`,

  comparisons: [
    {
      label: "@dataProvider → it.each, the direct translation",
      intro:
        "Email validation with four cases. The PHPUnit version needs a separate provider method wired by annotation; the Vitest version inlines the table.",
      php: `<?php
final class EmailValidatorTest extends TestCase
{
    /**
     * @dataProvider emailProvider
     */
    public function testValidatesEmails(
        string $input,
        bool $expected
    ): void {
        $this->assertSame(
            $expected,
            isValidEmail($input)
        );
    }

    public static function emailProvider(): array
    {
        return [
            'plain address'  => ['user@example.com', true],
            'missing at'     => ['no-at-sign', false],
            'missing local'  => ['@nobody', false],
            'trailing dot'   => ['trailing@dot.', false],
        ];
    }
}`,
      ts: `// email.test.ts
import { it, expect } from 'vitest';
import { isValidEmail } from './email';

it.each([
  ['user@example.com', true],
  ['no-at-sign', false],
  ['@nobody', false],
  ['trailing@dot.', false],
])('isValidEmail(%s) -> %s', (input, expected) => {
  expect(isValidEmail(input)).toBe(expected);
});

// Reports one named result per row:
// ✓ isValidEmail(user@example.com) -> true
// ✓ isValidEmail(no-at-sign) -> false
// ...`,
      note: "Identical idea: one test body, many datasets, individual pass/fail per row. PHPUnit names rows with array keys; it.each names them with %s placeholders filled from the row.",
    },
    {
      label: "Copy-paste tests vs an object-row table",
      intro:
        "The same coverage of a price formatter, first as five pasted tests, then as a table with $property names. Count what you'd have to touch to add a sixth case.",
      php: `// price.test.js — the copy-paste habit
it('formats zero', () => {
  expect(formatPrice(0)).toBe('$0.00');
});
it('formats cents', () => {
  expect(formatPrice(5)).toBe('$0.05');
});
it('formats dollars', () => {
  expect(formatPrice(1999)).toBe('$19.99');
});
it('formats thousands', () => {
  expect(formatPrice(123456)).toBe('$1,234.56');
});
it('formats exactly one dollar', () => {
  expect(formatPrice(100)).toBe('$1.00');
});`,
      ts: `// price.test.ts — the table
it.each([
  { cents: 0,      expected: '$0.00' },
  { cents: 5,      expected: '$0.05' },
  { cents: 1999,   expected: '$19.99' },
  { cents: 123456, expected: '$1,234.56' },
  { cents: 100,    expected: '$1.00' },
])('formats $cents as $expected', ({ cents, expected }) => {
  expect(formatPrice(cents)).toBe(expected);
});

// Regression found in prod? Add one row.`,
      note: "Five bodies collapse to one; $cents and $expected pull row values into each test's name. The moment cases need DIFFERENT assertions, though, split them back out.",
      leftLang: "js",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The mini harness gains a 5-line testEach — a table runner that fills %s placeholders from each row, exactly what it.each does. Six cases hit a slug generator; predict which rows fail before you run.",
    code: `// ── Mini harness ─────────────────────────────────────────────
function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (!Object.is(actual, expected)) {
        throw new Error(\`expected \${JSON.stringify(actual)} to be \${JSON.stringify(expected)}\`);
      }
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

// it.each in ~5 lines: for each row, fill %s slots from the row
// (in order), register one named test, spread the row into the body.
function testEach<T extends unknown[]>(cases: T[]) {
  return (nameTemplate: string, fn: (...args: T) => void) => {
    for (const row of cases) {
      let i = 0;
      const name = nameTemplate.replace(/%s/g, () => JSON.stringify(row[i++]));
      test(name, () => fn(...row));
    }
  };
}

// ── Code under test ──────────────────────────────────────────
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── The table: six cases, one body ───────────────────────────
testEach<[string, string]>([
  ['Hello World', 'hello-world'],
  ['  padded  ', 'padded'],
  ['PHP -> TypeScript!', 'php-typescript'],
  ['already-a-slug', 'already-a-slug'],
  ['crème brûlée', 'creme-brulee'],
  ['100% coverage', '100-coverage'],
])('slugify(%s) -> %s', (input, expected) => {
  expect(slugify(input)).toBe(expected);
});

// Only ONE row fails — and its name tells you exactly which
// input needs work (hint: the regex strips accents entirely).`,
  },

  keyPoints: [
    "`it.each(table)('name', fn)` runs one test body per row, each reported as its own named pass/fail — PHPUnit's @dataProvider without the separate provider method.",
    "Tuple rows fill printf placeholders in the name (`%s`, `%i`, `%j`, `%#` for row index); object rows use `$property` names — prefer objects past two or three columns.",
    "A template-literal table syntax (pipe-separated headers) also exists; recognise it in codebases even if your team prefers the object form.",
    "Tables win when every case runs identical assertions and only data varies: validation rules, parsers, formatters, boundary values, tax brackets.",
    "A `shouldThrow`-style boolean column is the smell that a table is hiding divergent behaviour — split those cases into individually-named it() blocks.",
    "Adding a production regression to a table is a one-line diff, which is exactly why parsers and validators should be table-driven from day one.",
  ],

  interview: [
    {
      q: "How do you avoid duplicating test code when you have many input/output cases for one function?",
      a: "Table-driven tests: it.each in Vitest or Jest, which is the direct descendant of PHPUnit's @dataProvider — I've used data providers for years, so this is home turf. You pass an array of tuples or objects and one test body; each row becomes an individually-named, individually-failing test, with %s placeholders or $property names pulling the row's values into the test name. The table reads as the specification, and a regression case from production is a one-line addition. In pytest the same idea is @pytest.mark.parametrize.",
    },
    {
      q: "When would you NOT use a table-driven test?",
      a: "When the cases differ in behaviour rather than data. If one case expects a return value, another expects a throw, and a third needs a mock configured differently, forcing them into one body means flag columns like shouldThrow and if-branches inside the test — at which point the test itself has logic that can be wrong. I split those into separate it() blocks with descriptive names and keep tables for genuinely uniform cases: same act, same assertion shape, different values. The tell in code review is a boolean column steering the assertion.",
    },
    {
      q: "In it.each, how do the individual tests get their names?",
      a: "From a template you provide. With tuple rows it's printf-style: %s for strings, %i for integers, %j for JSON, %# for the zero-based row index, filled positionally from the row. With object rows you reference fields directly — 'formats $cents as $expected'. That per-row naming is the point of the feature: when row four fails in CI you read 'isValidEmail(@nobody) -> false' and know the failing input without opening the file. It's the equivalent of naming your PHPUnit dataset keys instead of leaving them numeric.",
    },
  ],

  quiz: [
    {
      question: "What is the PHPUnit feature that it.each most directly maps to?",
      options: [
        "setUp() / tearDown()",
        "@dataProvider",
        "@depends",
        "assertSame with a loop inside one test method",
      ],
      answerIndex: 1,
      explain:
        "Both run one test body over many datasets with per-dataset pass/fail reporting. A loop inside a single test is the anti-pattern both features exist to replace: the first failing iteration aborts and masks the rest.",
    },
    {
      question:
        "Your it.each table has a shouldThrow: boolean column and the test body branches on it. What's the right move?",
      options: [
        "Add a comment explaining the branch",
        "Use %j so the name shows the whole row",
        "Split the throwing cases into their own it() blocks — the table is hiding two different behaviours",
        "Wrap both branches in try/catch so the body stays linear",
      ],
      answerIndex: 2,
      explain:
        "Tables are for cases that share one act and one assertion shape. A boolean steering the assertion means two behaviours share one body — logic in the test that can itself be wrong. Separate, named tests state each behaviour plainly.",
    },
    {
      question:
        "With object rows like { cents: 100, expected: '$1.00' }, how do you show the values in each test's name?",
      options: [
        "Placeholders %cents and %expected",
        "$property references: 'formats $cents as $expected'",
        "String concatenation inside it.each's first argument",
        "You can't — object rows get numbered names",
      ],
      answerIndex: 1,
      explain:
        "Object rows use $-prefixed property names (including nested paths like $user.id); printf placeholders (%s, %i, %#) are for tuple rows, filled positionally. Both produce a distinct name per row.",
    },
  ],
};

export default lesson;
