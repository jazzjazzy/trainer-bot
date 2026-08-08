import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "coverage-useful-vs-vanity",
  title: "Coverage: Useful Metric or Vanity Number?",
  part: "Discipline & Delivery",
  estMinutes: 12,
  summary:
    "Coverage measures which lines and branches your tests execute — not whether they assert anything — so read it to find untested branches, ratchet it against regression, and never chase 100% as a goal in itself.",

  concept: `
"What's your test coverage?" is the question every interviewer asks and almost
everyone answers badly. Coverage is a genuinely useful tool and a genuinely
dangerous target, and knowing the difference is the whole point of this section.

### What coverage actually measures

A coverage tool instruments your code, runs your tests, and records **which
lines and branches actually executed**. That is *all* it measures. It does not
know whether a test asserted anything. A test that calls your function and
checks nothing still marks every line it touched as "covered" — the number goes
green while proving nothing. Coverage answers "did this code run during the
suite?", never "is this code correct?". Treat it as a map of what you *haven't*
tested, not a certificate of what you have.

### Running it in Vitest 4

Coverage isn't built into the runner — you add a provider. The default is
V8-based:

\`\`\`bash
npm i -D @vitest/coverage-v8
npx vitest run --coverage
\`\`\`

You get a terminal table plus an HTML report (\`coverage/index.html\`) you can
click into, file by file, to see the exact red lines and the branches that
never ran.

### Vitest 4 specifics worth knowing

Two config options that older tutorials still teach were **removed in
Vitest 4**:

- \`coverage.all\` and \`coverage.extensions\` are gone. You now scope the report
  with \`coverage.include\` / \`coverage.exclude\` globs instead.
- **AST-aware remapping is the default** (and only) behaviour — the V8 provider
  maps raw coverage back to your real source through the AST, so reported lines
  and branches line up with the code you wrote rather than the transpiled
  output.

\`\`\`ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],        // what counts toward the report
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      reporter: ['text', 'html'],
    },
  },
});
\`\`\`

### Line coverage vs branch coverage

Line coverage asks "did this line run?"; **branch coverage** asks "did each
side of every decision run?". Branch coverage is the stronger metric because a
line like \`return a ? f() : g()\` counts as one covered line the moment either
side runs — yet the untested branch is exactly where the bug hides. When you
report or gate on coverage, prefer branches over lines.

### Thresholds: a ratchet, not a trophy

The good use of the number is a **regression ratchet**. Set a threshold at
roughly your current level and let CI fail if a change drops below it, so new
code arrives with tests:

\`\`\`ts
coverage: {
  thresholds: { branches: 80, functions: 85, lines: 85 },
},
\`\`\`

The bad use is the **100% cargo cult** — mandating total coverage produces
assertion-free tests written only to paint lines green, trivial getters tested
for the metric, and a team that games a number instead of protecting behaviour.
The senior position: coverage finds the branches you forgot; behaviour, not the
percentage, is what you actually test.
`,

  comparisons: [
    {
      label: "100% coverage, zero assertions vs lower coverage that asserts",
      intro:
        "Both suites target the same discount function. The left one hits 100% coverage; the right one covers less but actually checks the results. Which would you rather ship behind?",
      php: `// discount.test.ts — 100% line coverage, proves NOTHING
import { test } from 'vitest';
import { discountRate } from '../src/discount';

test('discountRate runs for a vip', () => {
  discountRate('vip', 1);        // called... and that's it
});

test('discountRate runs for bulk', () => {
  discountRate('regular', 100);  // no expect() anywhere
});

test('discountRate runs for a normal order', () => {
  discountRate('regular', 1);
});
// Every line executed => coverage report says 100%.
// discountRate could 'return 999' and this suite stays green.`,
      ts: `// discount.test.ts — 67% coverage, but every case is CHECKED
import { test, expect } from 'vitest';
import { discountRate } from '../src/discount';

test('vip customers get 20% off', () => {
  expect(discountRate('vip', 1)).toBe(0.2);
});

test('bulk orders (100+) get 10% off', () => {
  expect(discountRate('regular', 100)).toBe(0.1);
});
// The 'no discount' branch is deliberately left untested here —
// coverage will FLAG it (a real gap), instead of hiding it behind
// a green line an assertion-free test would have painted.`,
      note:
        "Coverage counts executed lines, not assertions — so the left suite scores higher while testing nothing. The right suite's lower number is honest: it points straight at the branch that still needs a test.",
      leftLang: "ts",
    },
    {
      label: "Line coverage vs branch coverage on the same line",
      intro:
        "A single ternary line and one test. Line coverage calls it done; branch coverage sees the half that never ran.",
      php: `// fee.ts
export const fee = (isMember: boolean) =>
  isMember ? 0 : 5;

// fee.test.ts — one test, exercises only the member path
test('members pay no fee', () => {
  expect(fee(true)).toBe(0);
});

// LINE coverage: 100% — the return line executed.
// The isMember === false branch (fee = 5) was NEVER run,
// yet line coverage happily reports the file as fully covered.`,
      ts: `// fee.test.ts — cover BOTH sides of the decision
test('members pay no fee', () => {
  expect(fee(true)).toBe(0);
});

test('non-members pay 5', () => {
  expect(fee(false)).toBe(5);   // the branch line coverage missed
});

// BRANCH coverage would have reported 50% after the first test
// alone — pointing you straight at the untested else-path.
// That is why branch coverage beats line coverage as a gate.`,
      note:
        "One line can hold two branches. Line coverage flips to 100% as soon as the line runs once; branch coverage stays at 50% until both outcomes are exercised — which is the gap that matters.",
      leftLang: "ts",
    },
    {
      label: "Legacy coverage config vs Vitest 4",
      intro:
        "Migrating a coverage config to Vitest 4. The removed keys don't error loudly in every setup — they just silently stop doing what you think, so know the current form.",
      php: `// vitest.config.ts — options REMOVED in Vitest 4
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      all: true,               // ❌ removed in v4
      extensions: ['.ts'],     // ❌ removed in v4
      // (older versions also exposed experimentalAstAwareRemapping —
      //  in v4 AST-aware remapping is simply the default.)
    },
  },
});`,
      ts: `// vitest.config.ts — the Vitest 4 way
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],          // replaces all/extensions
      exclude: ['**/*.test.ts', 'src/main.ts'],
      reporter: ['text', 'html'],
      thresholds: { branches: 80, lines: 85 },  // the ratchet
      // AST-aware remapping is on by default — no flag needed.
    },
  },
});`,
      note:
        "coverage.all and coverage.extensions are gone in v4 — scope the report with include/exclude globs. AST-aware remapping is the default, so reported lines match your source, not the transpiled bundle.",
      leftLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Toy branch coverage, hand-rolled — exactly what a coverage provider does under the hood: count which branches execute while the tests run. Two tests PASS and every line is green, yet one branch never fires. Predict the report before you run it.",
    code: `// A coverage provider, in miniature: instrument each branch with a
// hit-counter, run the suite, then report which branches never fired.

const hits: Record<string, number> = {
  'discount:vip': 0,
  'discount:bulk': 0,
  'discount:none': 0,
};
const cover = (branch: string) => { hits[branch] += 1; };

// The code under test: three branches, one per discount tier.
function discountRate(customer: string, qty: number): number {
  if (customer === 'vip') { cover('discount:vip'); return 0.2; }
  if (qty >= 100) { cover('discount:bulk'); return 0.1; }
  cover('discount:none'); return 0;
}

// ── Mini test harness (what Vitest gives you, in miniature) ───────
function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(\`expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`);
      }
    },
  };
}
const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void) { tests.push([name, fn]); }

// The suite exercises the vip and bulk paths — but NEVER 'none'.
test('vip customers get 20% off', () => {
  expect(discountRate('vip', 1)).toBe(0.2);
});
test('bulk orders get 10% off', () => {
  expect(discountRate('regular', 100)).toBe(0.1);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(\`PASS  \${name}\`); }
  catch (e) { console.log(\`FAIL  \${name}: \${(e as Error).message}\`); }
}

// ── The coverage report ───────────────────────────────────────────
console.log('');
console.log('branch coverage report');
console.log('------------------------------------');
const branches = Object.keys(hits);
let covered = 0;
for (const branch of branches) {
  const ran = hits[branch] > 0;
  if (ran) covered += 1;
  console.log(\`  \${ran ? 'HIT ' : 'MISS'}  \${branch}  (\${hits[branch]}x)\`);
}
const pct = Math.round((covered / branches.length) * 100);
console.log('------------------------------------');
console.log(\`branches covered: \${covered}/\${branches.length} = \${pct}%\`);
console.log('');
console.log('Both tests PASS and every line ran green — but the');
console.log('discount:none branch never executed. That MISS is the');
console.log('untested else-path a coverage report exists to expose.');`,
  },

  keyPoints: [
    "Coverage measures which lines/branches executed during the suite — not whether anything was asserted. An assertion-free test still 'covers' the lines it runs.",
    "Run it with `npx vitest run --coverage` after installing `@vitest/coverage-v8`; read the HTML report to find the branches that never ran.",
    "Vitest 4 removed `coverage.all` and `coverage.extensions` — scope reports with `coverage.include` / `coverage.exclude` instead. AST-aware remapping is now the default, so reported lines match your source.",
    "Branch coverage beats line coverage: one line can hold two branches, and the untested branch is exactly where bugs hide.",
    "Use thresholds as a regression ratchet (fail CI if coverage drops), not as a 100% target — mandating total coverage breeds assertion-free tests that game the number.",
    "The senior framing: coverage tells you what you forgot to test; behaviour, not the percentage, is what you actually test.",
  ],

  interview: [
    {
      q: "Is 100% test coverage a good goal? Why or why not?",
      a: "No — coverage is a useful diagnostic and a poor target. It only measures which lines and branches executed, not whether any assertion checked them, so a test that calls a function and asserts nothing still counts as full coverage while proving nothing. Chasing 100% pushes people to write those empty tests and to cover trivial getters just to move the number, which is effort that protects no behaviour. What I actually do is read the report to find genuinely untested branches, and set a threshold near the current level as a ratchet so coverage can't silently regress. The goal is tested behaviour; the percentage is a hint about where I haven't looked yet.",
    },
    {
      q: "What's the difference between line and branch coverage, and which do you gate on?",
      a: "Line coverage records whether each line executed; branch coverage records whether each side of every decision executed. They diverge on any line with a conditional — `return isMember ? 0 : 5` shows as a fully covered line the instant either outcome runs, even though the other branch was never tested. Since the untested branch is precisely where defects survive, I gate on branch coverage: it's the stricter, more honest signal. Line coverage flatters you; branch coverage tells you which decisions you actually exercised.",
    },
    {
      q: "How would you set up coverage in a Vitest 4 project, and has anything changed recently?",
      a: "I install `@vitest/coverage-v8` and run `vitest run --coverage`, configuring the `coverage` block with `provider: 'v8'`, `include`/`exclude` globs to scope what counts, and a `text` plus `html` reporter so I get both a CI summary and a clickable report. Two things changed in Vitest 4 worth mentioning: `coverage.all` and `coverage.extensions` were removed, so you scope reports with `include`/`exclude` instead of those; and AST-aware remapping is now the default, so reported lines and branches map back to my real source rather than the transpiled output. I add a `thresholds` block as a regression ratchet, favouring the branches number.",
    },
  ],

  quiz: [
    {
      question:
        "A test calls a function but contains no expect() call. What does coverage report for the lines it executed?",
      options: [
        "0% — coverage requires at least one assertion per line",
        "They count as covered — coverage measures execution, not assertions",
        "The run errors because the test has no assertions",
        "They count as covered only if the function returns a value",
      ],
      answerIndex: 1,
      explain:
        "Coverage instruments the code and records which lines/branches ran, full stop. An assertion-free test still executes lines, so they show as covered — which is exactly why a high coverage number is not evidence of correctness.",
    },
    {
      question:
        "Which coverage options were removed in Vitest 4, and what replaces them?",
      options: [
        "`provider` was removed; use `engine` instead",
        "`coverage.all` and `coverage.extensions` were removed; use `coverage.include` / `coverage.exclude`",
        "`reporter` was removed; use `output` instead",
        "Nothing was removed; the config is unchanged from Vitest 2",
      ],
      answerIndex: 1,
      explain:
        "Vitest 4 dropped `coverage.all` and `coverage.extensions`; you now scope the report with `include`/`exclude` globs. AST-aware remapping also became the default rather than an experimental flag.",
    },
    {
      question:
        "For the line `return isMember ? 0 : 5`, one test calls it with `true`. What do line and branch coverage report?",
      options: [
        "Line 100%, branch 100% — the line ran",
        "Line 50%, branch 50%",
        "Line 100%, branch 50% — only one side of the decision ran",
        "Line 0%, branch 0% — a ternary can't be covered",
      ],
      answerIndex: 2,
      explain:
        "The line executed, so line coverage is 100%, but only the `true` branch ran, so branch coverage is 50%. That gap is why branch coverage is the stronger metric — it exposes the untested `else` path a line count hides.",
    },
  ],
};

export default lesson;
