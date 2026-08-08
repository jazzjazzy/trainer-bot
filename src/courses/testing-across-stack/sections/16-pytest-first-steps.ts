import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "pytest-first-steps",
  title: "pytest: Python Testing, First Steps",
  part: "Components & Python",
  estMinutes: 11,
  summary:
    "pytest 9 throws away the test-class ceremony: plain test_ functions in test_*.py files, discovered automatically, asserting with bare assert — and pytest's assertion rewriting prints the rich diff for you.",

  concept: `
Time to switch tracks. Everything you have learned about testing — arrange/act/assert,
behaviour over implementation, the pyramid — carries straight over to Python. What changes
is the tool, and the change is refreshing: **pytest** is the de facto standard test runner
for Python (Django shops, FastAPI shops, data teams — everyone), and it needs roughly a
tenth of the ceremony PHPUnit taught you to expect.

### No base class, no vocabulary — just functions and assert

A PHPUnit test is a class extending \`TestCase\` with methods calling \`$this->assertSame()\`,
\`$this->assertCount()\`, \`$this->assertStringContainsString()\`… a vocabulary you memorise.
A pytest test is a plain function whose name starts with \`test_\`, using Python's built-in
\`assert\` statement:

\`\`\`python
# tests/test_slugify.py
from app.text import slugify

def test_basic_title():
    assert slugify("Hello World") == "hello-world"
\`\`\`

That is the entire file. No imports of the framework, no class, no runner boilerplate.

The trick that makes bare \`assert\` viable is **assertion rewriting**: pytest re-compiles
your test files so a failing assert reports both sides of the comparison, with a diff for
collections:

\`\`\`text
    def test_basic_title():
>       assert slugify("Hello World") == "hello_world"
E       AssertionError: assert 'hello-world' == 'hello_world'
E         - hello_world
E         + hello-world
\`\`\`

In plain Python a failed \`assert\` says nothing useful; under pytest it says everything.
So there is no \`assertEquals\`-style API to learn — you already know the whole assertion
language: \`==\`, \`in\`, \`is None\`, \`<\`.

### Discovery: convention over registration

Run \`pytest\` with no arguments and it walks the project collecting:

- files named \`test_*.py\` or \`*_test.py\`,
- \`test_\`-prefixed **functions** inside them,
- and \`Test\`-prefixed classes (no \`__init__\`) if you want grouping — most teams don't bother.

There is no \`phpunit.xml\` test-suite registration, no autoload mapping. Name things by
convention and they run.

### Testing exceptions: pytest.raises

The one framework import you need early is \`pytest.raises\`, a context manager that fails
the test unless the block raises:

\`\`\`python
import pytest

def test_rejects_empty_title():
    with pytest.raises(ValueError, match="empty"):
        slugify("")
\`\`\`

\`match\` is a regex checked against the exception message — tighter than PHPUnit's
\`expectException\` + \`expectExceptionMessage\` pair, in one line.

### Running it

\`\`\`bash
pytest            # discover and run everything
pytest -q         # quiet: one dot per test, summary at the end
pytest -x         # stop at the first failure (great mid-refactor)
pytest -k "slug"  # only tests whose name matches the expression
\`\`\`

\`-k\` accepts boolean expressions too: \`-k "slug and not unicode"\`.

### Configuration: pyproject.toml

pytest 9 reads a native TOML table, \`[tool.pytest]\`, straight from \`pyproject.toml\`:

\`\`\`toml
[tool.pytest]
testpaths = ["tests"]
addopts = ["-q"]
\`\`\`

The older \`[tool.pytest.ini_options]\` table (INI-style strings) still works — you will see
it in most existing codebases — but the native table is the pytest 9 way; the two cannot be
mixed. Two more pytest 9 facts worth knowing for interviews: it requires **Python 3.10+**,
and everything that warned \`PytestRemovedIn9Warning\` under pytest 8 is now a hard error.
`,

  comparisons: [
    {
      label: "A test file, PHPUnit vs pytest",
      intro:
        "The same two behaviours — slugify a title, count the words — tested in both frameworks. Compare how much of each file is scaffolding versus test.",
      php: `<?php
// tests/SlugifyTest.php
use PHPUnit\\Framework\\TestCase;

final class SlugifyTest extends TestCase
{
    public function testBasicTitle(): void
    {
        $this->assertSame(
            'hello-world',
            slugify('Hello World')
        );
    }

    public function testCountsWords(): void
    {
        $this->assertCount(3, wordList('one two three'));
    }
}`,
      ts: `# tests/test_slugify.py
from app.text import slugify, word_list

def test_basic_title():
    assert slugify("Hello World") == "hello-world"

def test_counts_words():
    assert len(word_list("one two three")) == 3`,
      note: "No base class, no assertion vocabulary — assertion rewriting means a failing bare assert prints both sides and a diff, so `==` and `len()` replace assertSame and assertCount.",
      rightLang: "python",
    },
    {
      label: "Expecting an exception",
      intro:
        "Both tests demand that an empty title is rejected with a meaningful error. PHPUnit declares expectations before the act; pytest scopes the expectation to a block.",
      php: `<?php
// tests/SlugifyTest.php (excerpt)
public function testRejectsEmptyTitle(): void
{
    $this->expectException(InvalidArgumentException::class);
    $this->expectExceptionMessage('empty');

    slugify('');
}`,
      ts: `# tests/test_slugify.py (excerpt)
import pytest
from app.text import slugify

def test_rejects_empty_title():
    with pytest.raises(ValueError, match="empty"):
        slugify("")`,
      note: "pytest.raises is a context manager: only the code inside the with-block may raise, and match= regex-checks the message — PHPUnit's two expect calls apply to everything that follows.",
      rightLang: "python",
    },
    {
      label: "Configuring the runner",
      intro:
        "Where the runner learns where tests live and which defaults to apply: PHPUnit's XML file versus a TOML table inside the pyproject.toml you already have.",
      php: `<!-- phpunit.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="vendor/autoload.php"
         colors="true"
         stopOnFailure="false">
  <testsuites>
    <testsuite name="unit">
      <directory>tests</directory>
    </testsuite>
  </testsuites>
</phpunit>`,
      ts: `# pyproject.toml
[tool.pytest]        # native TOML table, pytest 9+
testpaths = ["tests"]
addopts = ["-q"]

# Older projects use the INI-compatibility table
# instead (never both at once):
# [tool.pytest.ini_options]
# addopts = "-q"`,
      note: "pytest 9 added the native [tool.pytest] table with real TOML types (lists, booleans); [tool.pytest.ini_options] is the pre-9 form you will still meet in the wild.",
      leftLang: "xml",
      rightLang: "toml",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "pytest with the covers off: a list of test_ functions run in a loop, try/except AssertionError deciding PASS or FAIL. This is what discovery and the run loop automate — note the last test carries its failure message by hand, because assertion rewriting (which writes that message for you) is pytest's half of the deal.",
    code: `# What pytest automates: discovery + a run loop + failure reporting.
# Plain functions, bare assert — no base class, no assertEquals.

def slugify(title):
    return title.strip().lower().replace(" ", "-")

def parse_price(raw):
    value = float(raw)
    if value < 0:
        raise ValueError("price cannot be negative")
    return value

# --- the "tests": flat test_ functions ---

def test_slugify_basic():
    assert slugify("Hello World") == "hello-world"

def test_slugify_strips_whitespace():
    assert slugify("  PHP to Python  ") == "php-to-python"

def test_parse_price_rejects_negative():
    # hand-rolled pytest.raises(ValueError)
    try:
        parse_price("-3.50")
    except ValueError:
        return
    raise AssertionError("expected ValueError, nothing raised")

def test_slugify_collapses_spaces():
    got = slugify("Data  Providers")
    # pytest's assertion rewriting would build this message for us:
    assert got == "data-providers", f"expected 'data-providers', got '{got}'"

# --- the "runner": what \`pytest -q\` does for you ---

tests = [
    test_slugify_basic,
    test_slugify_strips_whitespace,
    test_parse_price_rejects_negative,
    test_slugify_collapses_spaces,
]

passed = failed = 0
for t in tests:
    try:
        t()
        passed += 1
        print(f"PASS {t.__name__}")
    except AssertionError as e:
        failed += 1
        print(f"FAIL {t.__name__}: {e}")

print(f"{passed} passed, {failed} failed")`,
    output: `PASS test_slugify_basic
PASS test_slugify_strips_whitespace
PASS test_parse_price_rejects_negative
FAIL test_slugify_collapses_spaces: expected 'data-providers', got 'data--providers'
3 passed, 1 failed`,
  },

  keyPoints: [
    "pytest tests are plain `test_`-prefixed functions in `test_*.py` files — discovered by convention, no base class, no registration.",
    "Bare `assert` is the whole assertion API: pytest's assertion rewriting prints both sides and a diff on failure, so there is no assertSame/assertCount vocabulary to memorise.",
    "`with pytest.raises(ValueError, match=\"...\")` fails the test unless the block raises, and regex-checks the message in the same line.",
    "Daily flags: `-q` for quiet output, `-x` to stop on first failure, `-k \"expr\"` to filter by test name.",
    "Configure in `pyproject.toml`: pytest 9 supports a native `[tool.pytest]` TOML table; the older `[tool.pytest.ini_options]` still exists but the two cannot be combined.",
    "pytest 9 requires Python 3.10+ and turned all PytestRemovedIn9Warning deprecations into hard errors.",
  ],

  interview: [
    {
      q: "You've used PHPUnit for years. What's structurally different about pytest?",
      a: "Almost everything ceremonial is gone. PHPUnit organises tests as classes extending `TestCase` with a large assertion API; pytest organises them as plain `test_` functions in `test_*.py` files, discovered by naming convention, asserting with Python's bare `assert`. The magic making that work is assertion rewriting — pytest recompiles test modules so a failing `assert a == b` reports both values with a diff, which is what `assertSame` existed to provide. Exception expectations become a scoped context manager, `with pytest.raises(ValueError, match=\"...\")`, instead of `expectException` calls that apply to the rest of the method. The mental model transfers completely; the boilerplate doesn't come with it.",
    },
    {
      q: "How does pytest know which tests to run, and how do you run just a subset?",
      a: "Discovery is purely conventional: from the configured `testpaths` (or the current directory) it collects files matching `test_*.py` or `*_test.py`, then `test_`-prefixed functions and `Test`-prefixed classes inside them. For subsets I reach for `-k`, which filters by name with boolean expressions — `pytest -k \"slugify and not unicode\"` — or I pass a specific file or `file.py::test_name` node id. During a refactor I add `-x` so the run stops at the first failure instead of burying it under fifty consequential ones.",
    },
    {
      q: "Where does pytest configuration live in a modern project?",
      a: "In `pyproject.toml`, alongside the rest of the project's tooling config. Since pytest 9 there's a native `[tool.pytest]` table using real TOML types — lists for `addopts` and `testpaths`, actual booleans — which is the current recommended form. The older `[tool.pytest.ini_options]` table is the INI-compatibility mode from pytest 6 and is still what you'll see in most existing repos; a project must pick one, as pytest refuses to read both. Standalone `pytest.ini` files also still work, but consolidating in pyproject.toml is the norm now.",
    },
  ],

  quiz: [
    {
      question:
        "Why can pytest get away with bare `assert` instead of an assertEquals-style API?",
      options: [
        "Python's built-in assert already prints a diff of both sides",
        "pytest rewrites the assert statements in test files so failures report both values and a diff",
        "pytest wraps every test in a debugger session and inspects variables on failure",
        "It cannot — bare assert is only for quick scripts, real suites need pytest.assert_equal",
      ],
      answerIndex: 1,
      explain:
        "Plain Python gives a bare AssertionError with no context. pytest's assertion rewriting recompiles test modules so a failing `assert a == b` shows both values and a diff for collections — that is what replaces the entire assertSame/assertCount vocabulary.",
    },
    {
      question:
        "Which file will pytest discover and run automatically with default settings?",
      options: [
        "tests/SlugifyTest.php-style tests/SlugifyTest.py registered in pyproject.toml",
        "tests/test_slugify.py containing a function test_basic_title()",
        "tests/slugify.py containing a function check_basic_title()",
        "Any .py file, as long as it imports pytest",
      ],
      answerIndex: 1,
      explain:
        "Discovery is by naming convention: files matching test_*.py or *_test.py, containing test_-prefixed functions (or Test-prefixed classes). No registration, no framework import required for plain asserts.",
    },
    {
      question:
        "What is true of pytest configuration in pytest 9?",
      options: [
        "Configuration must live in a pytest.ini file",
        "A native [tool.pytest] TOML table is supported in pyproject.toml, but cannot be combined with [tool.pytest.ini_options]",
        "[tool.pytest.ini_options] was removed in 9.0",
        "pytest reads phpunit.xml-style XML suites",
      ],
      answerIndex: 1,
      explain:
        "pytest 9.0 added the native [tool.pytest] table with real TOML types. The older [tool.pytest.ini_options] form still works for existing projects, but pytest errors if both tables are present.",
    },
  ],
};

export default lesson;
