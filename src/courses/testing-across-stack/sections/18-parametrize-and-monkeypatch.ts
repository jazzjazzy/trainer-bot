import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "parametrize-and-monkeypatch",
  title: "parametrize & monkeypatch",
  part: "Components & Python",
  estMinutes: 12,
  summary:
    "Two pytest workhorses: @pytest.mark.parametrize turns one test body into a table of cases (PHPUnit data providers, perfected), and the monkeypatch fixture swaps functions and env vars with guaranteed restoration.",

  concept: `
### parametrize: one body, many cases

You already know this pattern twice over: PHPUnit's \`@dataProvider\` and Vitest's
\`it.each\`. pytest's version is a decorator that carries its data inline:

\`\`\`python
import pytest

@pytest.mark.parametrize("raw, expected", [
    ("hello world", "hello-world"),
    ("  padded  ", "padded"),
    ("MixedCase", "mixedcase"),
])
def test_slugify(raw, expected):
    assert slugify(raw) == expected
\`\`\`

The string names the parameters; the list supplies one tuple per case; pytest generates one
**separate test** per row — each passing or failing independently, exactly like a data
provider. The three-way map is worth stating in an interview: *data provider, \`it.each\`,
\`parametrize\` — same tool, three syntaxes.*

Two refinements the PHP version never had built in:

**ids** make failures readable. By default pytest names cases after their values
(\`test_slugify[hello world-hello-world]\`); pass \`ids=["basic", "padded", "case"]\` and the
report reads \`test_slugify[padded]\`.

**Stacking** produces a cartesian product. Two decorators, one test per combination:

\`\`\`python
@pytest.mark.parametrize("currency", ["AUD", "USD", "EUR"])
@pytest.mark.parametrize("amount", [0, 999, 100_000])
def test_format_money(currency, amount): ...
# 3 x 3 = 9 generated tests
\`\`\`

### monkeypatch: swap it, and the swap-back is guaranteed

Sometimes the code under test reads something you must control: the clock, an environment
variable, a module-level function. In PHP you might have called \`putenv()\` in the test and
hoped to remember to reset it — and one forgotten reset poisons every test that runs after.

\`monkeypatch\` is a built-in fixture (request it as a parameter, like any fixture) whose
whole job is *undoable patching*:

\`\`\`python
def test_greeting_on_new_years_day(monkeypatch):
    monkeypatch.setattr(clock, "today", lambda: date(2026, 1, 1))
    assert greeting() == "Happy New Year!"

def test_uses_sandbox_api(monkeypatch):
    monkeypatch.setenv("PAYMENT_API_URL", "https://sandbox.example.com")
    assert payment_client().base_url.startswith("https://sandbox")

def test_fails_loudly_without_config(monkeypatch):
    monkeypatch.delenv("PAYMENT_API_URL", raising=False)
    with pytest.raises(ConfigError):
        payment_client()
\`\`\`

- \`setattr(obj, "name", value)\` — replace a function, method, or attribute.
- \`setenv\` / \`delenv\` — control environment variables.
- Every change is recorded and **automatically undone when the test ends**, pass or fail.

That guarantee is the point. Hand-patching (\`clock.today = fake\` and restoring at the end)
breaks the moment an assertion fails before the restore line runs; monkeypatch is a
function-scoped fixture, so its teardown — the undo — always runs. It is pytest's answer
to \`vi.spyOn(...).mockReturnValue(...)\` with the \`mockRestore\` built in.

### When you outgrow it

monkeypatch replaces values; it does not record calls or arguments. When you need
call-assertion mocks — "was this called once, with what?" — the \`pytest-mock\` plugin adds
a \`mocker\` fixture wrapping Python's \`unittest.mock\` with the same auto-undo behaviour:
\`mocker.patch("app.mailer.send")\` returns a Mock you can assert on. Know it exists; reach
for it when spying, not just swapping.
`,

  comparisons: [
    {
      label: "Data provider vs parametrize",
      intro:
        "Table-driven tax tests in both frameworks. PHPUnit binds the data through a named provider method; pytest carries the table on the test itself.",
      php: `<?php
// tests/TaxTest.php
final class TaxTest extends TestCase
{
    /**
     * @dataProvider taxCases
     */
    public function testTax(int $income, float $expected): void
    {
        $this->assertSame($expected, tax($income));
    }

    public static function taxCases(): array
    {
        return [
            'tax free' => [10000, 0.0],
            'mid band' => [30000, 5000.0],
            'top band' => [60000, 15000.0],
        ];
    }
}`,
      ts: `# tests/test_tax.py
import pytest

@pytest.mark.parametrize(
    "income, expected",
    [
        (10_000, 0.0),
        (30_000, 5000.0),
        (60_000, 15000.0),
    ],
    ids=["tax-free", "mid-band", "top-band"],
)
def test_tax(income, expected):
    assert tax(income) == expected`,
      note: "Same idea, less indirection: the table sits on the test instead of in a separate provider method, ids name the cases, and each row still reports as its own test — test_tax[mid-band].",
      rightLang: "python",
    },
    {
      label: "The same table in Vitest — the three-way map",
      intro:
        "For completeness, the identical test in the Vitest you already know. If an interviewer asks about any one of these, describe it as the same pattern in all three ecosystems.",
      php: `// tests/tax.test.ts (Vitest)
import { it, expect } from "vitest";
import { tax } from "../src/tax";

it.each([
  [10_000, 0.0],
  [30_000, 5000.0],
  [60_000, 15000.0],
])("tax(%i) is %f", (income, expected) => {
  expect(tax(income)).toBe(expected);
});`,
      ts: `# tests/test_tax.py (pytest)
import pytest
from app.tax import tax

@pytest.mark.parametrize("income, expected", [
    (10_000, 0.0),
    (30_000, 5000.0),
    (60_000, 15000.0),
])
def test_tax(income, expected):
    assert tax(income) == expected`,
      note: "PHPUnit @dataProvider, Vitest it.each, pytest parametrize: one test body, a table of cases, one reported result per row. Learn the pattern once, name it in any interview.",
      leftLang: "ts",
      rightLang: "python",
    },
    {
      label: "putenv-and-hope vs monkeypatch.setenv",
      intro:
        "Both tests point the payment client at a sandbox URL via an environment variable. Watch what happens to the cleanup when an assertion fails.",
      php: `<?php
// tests/PaymentClientTest.php
public function testUsesSandboxUrl(): void
{
    putenv('PAYMENT_API_URL=https://sandbox.example.com');

    $client = PaymentClient::fromEnv();
    // If this assertion throws, the putenv below never
    // runs — the sandbox URL leaks into every later test.
    $this->assertSame(
        'https://sandbox.example.com',
        $client->baseUrl()
    );

    putenv('PAYMENT_API_URL');  // manual reset, easily forgotten
}`,
      ts: `# tests/test_payment_client.py
def test_uses_sandbox_url(monkeypatch):
    monkeypatch.setenv(
        "PAYMENT_API_URL",
        "https://sandbox.example.com",
    )

    client = PaymentClient.from_env()
    assert client.base_url == "https://sandbox.example.com"

    # No reset code. monkeypatch records the change and
    # undoes it when the test ends — pass OR fail.`,
      note: "monkeypatch is a fixture, so its undo is teardown: restoration is guaranteed even when the assert raises, which is exactly when hand-rolled cleanup silently skips.",
      rightLang: "python",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Both mechanics, hand-rolled. Part 1: parametrize is a loop over (id, input, expected) rows, each reported separately. Part 2: a mini monkeypatch — setattr that records the original and restores it in finally, faking the clock for one test.",
    code: `# --- Part 1: parametrize = one test body run over a table of cases ---

def tax(income):
    if income <= 10_000:
        return 0.0
    if income <= 50_000:
        return (income - 10_000) * 0.25
    return 40_000 * 0.25 + (income - 50_000) * 0.50

cases = [
    ("tax-free", 10_000, 0.0),
    ("mid-band", 30_000, 5000.0),
    ("boundary", 50_000, 10_000.0),
    ("top-band", 60_000, 15_000.0),
]

for case_id, income, expected in cases:
    try:
        got = tax(income)
        assert got == expected, f"expected {expected}, got {got}"
        print(f"PASS test_tax[{case_id}]")     # ids= makes reports readable
    except AssertionError as e:
        print(f"FAIL test_tax[{case_id}]: {e}")

# --- Part 2: monkeypatch = setattr with restoration you cannot forget ---

class Clock:
    def today(self):
        return "2026-07-07"        # imagine datetime.date.today()

clock = Clock()

def greeting():
    if clock.today().endswith("-01-01"):
        return "Happy New Year!"
    return "Just another day."

class MiniMonkeypatch:
    def __init__(self):
        self._saved = []

    def setattr(self, obj, name, value):
        self._saved.append((obj, name, getattr(obj, name)))
        setattr(obj, name, value)

    def undo(self):                # pytest runs this as fixture teardown
        while self._saved:
            obj, name, original = self._saved.pop()
            setattr(obj, name, original)

mp = MiniMonkeypatch()
try:
    mp.setattr(Clock, "today", lambda self: "2026-01-01")
    assert greeting() == "Happy New Year!"
    print("PASS test_new_years_greeting (clock patched)")
finally:
    mp.undo()                      # guaranteed, even if the assert failed

assert greeting() == "Just another day."
print("PASS clock restored after the test")`,
    output: `PASS test_tax[tax-free]
PASS test_tax[mid-band]
PASS test_tax[boundary]
PASS test_tax[top-band]
PASS test_new_years_greeting (clock patched)
PASS clock restored after the test`,
  },

  keyPoints: [
    "`@pytest.mark.parametrize(\"a, b, expected\", [...])` generates one independent test per tuple — the direct descendant of PHPUnit's @dataProvider and the twin of Vitest's it.each.",
    "Pass `ids=[...]` for readable case names in reports (`test_tax[mid-band]`), and stack parametrize decorators to generate a cartesian product of combinations.",
    "`monkeypatch` is a built-in fixture: `setattr` swaps functions/methods/attributes, `setenv`/`delenv` control environment variables.",
    "Every monkeypatch change is automatically undone when the test ends, pass or fail — safer than hand-patching, where a failed assert skips your restore code.",
    "monkeypatch swaps values but records nothing; for call-asserting mocks (\"was it called, with what?\"), the pytest-mock plugin's `mocker` fixture wraps unittest.mock with the same auto-undo.",
    "Three-way interview map: data provider ↔ it.each ↔ parametrize; vi.spyOn + mockRestore ↔ monkeypatch.setattr.",
  ],

  interview: [
    {
      q: "How does @pytest.mark.parametrize compare to PHPUnit data providers?",
      a: "Same concept, tightened up. A data provider is a separate method returning arrays that PHPUnit feeds to the test; parametrize is a decorator carrying the parameter names and the case table right on the test function, so there's no indirection to a provider method. Both generate one independently-reported test per row. pytest adds two conveniences: `ids` to give cases human-readable names in the report, and stacking — put two parametrize decorators on one test and you get the cartesian product of both tables. And it's the same pattern as Vitest's it.each, so I'd tell an interviewer: one idea, three ecosystems.",
    },
    {
      q: "What does the monkeypatch fixture do, and why use it over patching attributes by hand?",
      a: "It performs temporary, automatically-reverted patches: `monkeypatch.setattr` to swap a function, method, or attribute, and `setenv`/`delenv` for environment variables. Every change is recorded, and because monkeypatch is a function-scoped fixture, its teardown undoes them all when the test finishes — pass or fail. That guarantee is the whole argument against hand-patching: if you write `clock.today = fake` and restore at the end of the test, a failing assertion raises before the restore line, and the fake leaks into every subsequent test — the classic source of 'passes alone, fails in the suite'. It maps to vi.spyOn with mockRestore, or to PHP's putenv, except the cleanup cannot be forgotten.",
    },
    {
      q: "When would you reach for pytest-mock's mocker instead of monkeypatch?",
      a: "When I need to observe calls, not just replace behaviour. monkeypatch swaps a value in and out; it doesn't record whether the replacement was called or with which arguments. mocker.patch replaces the target with a unittest.mock Mock object, so I can assert `mailer.send` was called exactly once with the right recipient — the spy side of Mockery, in PHP terms. It keeps the same per-test auto-undo semantics as monkeypatch, so there's no cleanup burden either way; the choice is simply substitution versus observation.",
    },
  ],

  quiz: [
    {
      question:
        "A test has two stacked decorators: parametrize(\"currency\", [\"AUD\", \"USD\"]) and parametrize(\"amount\", [0, 999, 100000]). How many tests run?",
      options: [
        "2 — the second decorator overrides the first",
        "5 — one per listed value",
        "6 — the cartesian product of both tables",
        "1 — with both parameter lists passed as arrays",
      ],
      answerIndex: 2,
      explain:
        "Stacked parametrize decorators multiply: every currency is combined with every amount, so 2 × 3 = 6 independently-reported tests. It's the concise way to cover a combination grid.",
    },
    {
      question:
        "Why is monkeypatch.setenv safer than calling putenv/os.environ directly in a test?",
      options: [
        "It validates that the variable exists before setting it",
        "Its changes are recorded and automatically reverted at test teardown, even if the test fails",
        "It sets the variable only for subprocesses, not the current process",
        "It is faster because it batches environment writes",
      ],
      answerIndex: 1,
      explain:
        "monkeypatch is a fixture, so undoing its patches is teardown — guaranteed to run whether the test passes or throws. Manual mutation plus a restore line at the end of the test skips the restore exactly when an assertion fails, leaking state into later tests.",
    },
    {
      question:
        "You need to assert that a patched mailer.send was called once with a specific recipient. What's the right tool?",
      options: [
        "monkeypatch.setattr — it records all calls to patched attributes",
        "pytest.raises — wrap the send call and inspect the exception",
        "The mocker fixture from pytest-mock, whose patch() installs an assertable Mock",
        "A session-scoped fixture holding a call log",
      ],
      answerIndex: 2,
      explain:
        "monkeypatch only substitutes values; it has no call recording. pytest-mock's mocker.patch replaces the target with a unittest.mock Mock supporting assert_called_once_with(...), while keeping the same automatic per-test undo.",
    },
  ],
};

export default lesson;
