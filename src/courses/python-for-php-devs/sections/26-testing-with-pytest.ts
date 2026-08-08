import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "testing-with-pytest",
  title: "Testing with pytest",
  part: "Real-World Python",
  estMinutes: 12,
  summary:
    "pytest is PHPUnit with the ceremony removed: plain functions, plain asserts, and composable fixtures instead of setUp/tearDown.",

  concept: `
Python ships a testing module called \`unittest\` in the standard library — and
it looks exactly like PHPUnit, because both descend from JUnit: test classes
extending a base class, \`assertEqual\`, \`setUp\`/\`tearDown\`. You *can* use it.
Almost nobody does. The community default is **pytest** (\`pip install pytest\`),
and its whole pitch is deleting the xUnit ceremony you've been typing for
twenty years.

### Tests are plain functions, asserts are plain asserts

A pytest test is any function named \`test_*\` in a file named \`test_*.py\`.
No class, no inheritance, no \`$this\`. And instead of memorising the PHPUnit
assertion zoo (\`assertEquals\`, \`assertContains\`, \`assertCount\`, ...) you
write the language's own \`assert\` keyword:

\`\`\`python
def test_slugify():
    assert slugify("Hello World") == "hello-world"
\`\`\`

The trick is **assertion rewriting**: pytest rewrites the bytecode of your test
modules so a failing \`assert a == b\` reports both values, diffs of lists and
dicts, and which key differed — the rich output you'd expect from
\`assertSame()\`, without the method. You can still group related tests in a
\`class TestSlugify:\` (no base class needed) purely for organisation.

### Fixtures replace setUp/tearDown — and beat them

In PHPUnit, shared state lives in \`setUp()\` and every test in the class gets
all of it, needed or not. pytest inverts this: a **fixture** is a function
decorated with \`@pytest.fixture\`, and a test *asks* for it by naming it as a
parameter. Only tests that declare the parameter pay the setup cost, fixtures
can depend on other fixtures, and each has a **scope** — \`function\` (default,
fresh per test), \`class\`, \`module\`, \`package\`, or \`session\` (built once per
run, e.g. a database container).

Teardown is a \`yield\`:

\`\`\`python
@pytest.fixture
def tmp_user(db):          # fixtures can require other fixtures
    user = db.create_user("ada")
    yield user             # test runs here
    db.delete_user(user)   # teardown, even if the test failed
\`\`\`

Fixtures shared across files go in \`conftest.py\` — pytest auto-discovers it
per directory; there's no registration step, roughly where you'd reach for a
PHPUnit base TestCase or a bootstrap file.

### The rest of the PHPUnit mapping

- \`@dataProvider\` → \`@pytest.mark.parametrize("a,b", [(1, 2), (3, 4)])\` —
  cases live right above the test, and each renders as a separate test result.
- \`$this->expectException(ValueError::class)\` → a context manager:
  \`with pytest.raises(ValueError):\` around the failing call.
- Mocks/test doubles → stdlib \`unittest.mock\` (\`Mock\`, \`patch\`), the built-in
  \`monkeypatch\` fixture for env vars and attributes, or the \`pytest-mock\`
  plugin's \`mocker.patch(...)\`. Same golden rule as PHP: patch where the name
  is *used*, not where it's defined.
- Running: \`pytest\` discovers everything; \`pytest -k "slug"\` filters by name
  (≈ \`phpunit --filter\`); \`pytest -x\` stops on first failure; coverage comes
  from the \`pytest-cov\` plugin: \`pytest --cov=myapp\`.
`,

  comparisons: [
    {
      label: "A basic test",
      intro:
        "The same test of a slugify() helper: assert the output equals the expected string, with a useful message when it fails.",
      php: `<?php
// tests/SlugifyTest.php — PHPUnit
use PHPUnit\\Framework\\TestCase;

final class SlugifyTest extends TestCase
{
    public function testSlugify(): void
    {
        $this->assertSame(
            'hello-world',
            slugify('Hello World')
        );
    }
}`,
      ts: `# tests/test_slugify.py — pytest
from myapp.text import slugify

def test_slugify():
    assert slugify("Hello World") == "hello-world"

# on failure, pytest's assertion rewriting prints:
#   AssertionError: assert 'hello_world' == 'hello-world'`,
      note:
        "No class, no base class, no assertSame — pytest rewrites plain `assert` so failures show both sides with a diff.",
    },
    {
      label: "Shared setup: setUp() vs fixtures",
      intro:
        "Both give tests a ready-made repository backed by a fresh connection, and clean it up afterwards.",
      php: `<?php
// PHPUnit — every test in the class gets this
final class UserRepoTest extends TestCase
{
    private Connection $conn;
    private UserRepo $repo;

    protected function setUp(): void
    {
        $this->conn = Db::connect(':memory:');
        $this->repo = new UserRepo($this->conn);
    }

    protected function tearDown(): void
    {
        $this->conn->close();
    }

    public function testFindsUser(): void
    {
        $this->assertNull($this->repo->find(1));
    }
}`,
      ts: `# conftest.py — available to every test file in this dir
import pytest
from myapp.db import connect, UserRepo

@pytest.fixture
def repo():
    conn = connect(":memory:")
    yield UserRepo(conn)   # test runs at the yield
    conn.close()           # teardown, pass or fail

# test_user_repo.py — opt in by naming the fixture
def test_finds_user(repo):
    assert repo.find(1) is None`,
      note:
        "Tests opt in to fixtures by parameter name; scopes (function/class/module/package/session) control how often setup reruns — setUp() is always per-test, all-or-nothing.",
    },
    {
      label: "Data providers and expected exceptions",
      intro:
        "Run one test body over several input/output pairs, and assert that bad input raises.",
      php: `<?php
// PHPUnit
final class PriceTest extends TestCase
{
    #[DataProvider('prices')]
    public function testFormat(int $cents, string $out): void
    {
        $this->assertSame($out, formatPrice($cents));
    }

    public static function prices(): array
    {
        return [[100, '$1.00'], [995, '$9.95']];
    }

    public function testNegativeThrows(): void
    {
        $this->expectException(InvalidArgumentException::class);
        formatPrice(-1);
    }
}`,
      ts: `# pytest
import pytest
from myapp.money import format_price

@pytest.mark.parametrize("cents,expected", [
    (100, "$1.00"),
    (995, "$9.95"),
])
def test_format(cents, expected):
    assert format_price(cents) == expected

def test_negative_raises():
    with pytest.raises(ValueError):
        format_price(-1)`,
      note:
        "parametrize keeps the cases beside the test and reports each as its own result; pytest.raises is a context manager, so only the code inside the with-block may raise.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A toy 'test runner' that shows the pytest model without installing anything: discover test_* functions, run them, count plain-assert failures. Predict which test fails and the final tally.",
    code: `# mini_pytest.py — how pytest thinks: tests are plain functions, asserts are plain asserts.
# This script fakes a tiny test runner so you can see the model without installing pytest.

def slugify(title: str) -> str:
    return title.strip().lower().replace(" ", "-")

def test_slugify_basic():
    assert slugify("Hello World") == "hello-world"

def test_slugify_strips_whitespace():
    assert slugify("  PHP to Python  ") == "php-to-python"

def test_slugify_is_wrong_on_purpose():
    assert slugify("One Two") == "one_two"  # pytest would show both values

# pytest discovers test_* functions by name; we do the same crudely:
results = []
for name, fn in sorted(globals().items()):
    if name.startswith("test_") and callable(fn):
        try:
            fn()
            results.append((name, "PASSED"))
        except AssertionError:
            results.append((name, "FAILED"))

for name, status in results:
    print(f"{name}: {status}")

passed = sum(1 for _, s in results if s == "PASSED")
print(f"{passed} passed, {len(results) - passed} failed")`,
    output: `test_slugify_basic: PASSED
test_slugify_is_wrong_on_purpose: FAILED
test_slugify_strips_whitespace: PASSED
2 passed, 1 failed`,
  },

  keyPoints: [
    "pytest tests are plain `test_*` functions using the plain `assert` keyword — assertion rewriting gives rich failure diffs with no assertEquals zoo.",
    "Fixtures (`@pytest.fixture`) replace setUp/tearDown: tests request them by parameter name, they compose, and scopes run setup per function, class, module, package, or session.",
    "Teardown lives after `yield` inside a fixture and runs even when the test fails; shared fixtures go in `conftest.py` with zero registration.",
    "`@pytest.mark.parametrize` ≈ `@dataProvider`; `with pytest.raises(ValueError):` ≈ `expectException()`.",
    "Mocking uses stdlib `unittest.mock` / the `monkeypatch` fixture / `pytest-mock` — and you patch where the name is used, not defined.",
    "Run with `pytest`; filter with `-k name`, stop on first failure with `-x`, coverage via the `pytest-cov` plugin. stdlib `unittest` is the PHPUnit-lookalike, but pytest is the community default.",
  ],

  interview: [
    {
      q: "You've used PHPUnit for years. How is pytest different?",
      a: "Structurally it drops the xUnit ceremony: tests are plain `test_*` functions rather than methods on a TestCase subclass, and you assert with the language's own `assert` statement — pytest rewrites assertions so failures still show both operands and diffs, which is what the PHPUnit assertion methods existed to do. The bigger design difference is fixtures: instead of one `setUp()` that every test in a class inherits, each test declares exactly the fixtures it needs as parameters, fixtures can build on each other, and scoping lets an expensive resource like a database live for the whole session while cheap ones stay per-test. Parametrize replaces data providers and `pytest.raises` replaces expectException. Python also ships `unittest` in the stdlib, which is essentially PHPUnit, but pytest can run those tests too and is the de facto standard.",
    },
    {
      q: "How do you share test setup across many test files in pytest?",
      a: "Put fixtures in a `conftest.py` — pytest automatically discovers it and makes its fixtures available to every test in that directory tree, no imports or registration required. That's roughly where a PHPUnit project uses an abstract base TestCase or a bootstrap file, but it stays opt-in: a test only receives a fixture if it names it as a parameter. For expensive resources you widen the fixture's scope, e.g. `@pytest.fixture(scope=\"session\")` for a Docker database that's built once, with function-scoped fixtures layered on top to reset state between tests.",
    },
    {
      q: "How do you test that code raises an exception, and how do you mock in Python?",
      a: "Exceptions use a context manager: `with pytest.raises(ValueError):` wrapped around just the call that should fail — the test fails if nothing raises, and you can inspect the exception via the `as exc_info` handle. For test doubles the stdlib provides `unittest.mock` with `Mock` objects and `patch()` to swap out attributes, and pytest adds the `monkeypatch` fixture for env vars and attributes plus the `pytest-mock` plugin's `mocker.patch()`. The rule that trips everyone (same as Mockery aliasing in PHP): patch the name where the code under test *looks it up*, i.e. `myapp.service.requests`, not the module where it was defined.",
    },
  ],

  quiz: [
    {
      question: "Why can pytest use plain `assert x == y` and still show rich failure output?",
      options: [
        "Python's assert statement always prints both operands on failure",
        "pytest rewrites the assertions in test modules to report operand values and diffs",
        "pytest only supports asserting on strings, which print naturally",
        "It can't — you must use pytest.assert_equal for readable failures",
      ],
      answerIndex: 1,
      explain:
        "pytest performs assertion rewriting on test modules at import time, so a failing plain assert reports both sides of the comparison with diffs — that's why the assertEquals-style method zoo isn't needed.",
    },
    {
      question: "How does a pytest test get access to a fixture?",
      options: [
        "It inherits it from the TestCase base class",
        "It calls pytest.get_fixture('name') inside the test body",
        "It declares a parameter whose name matches the fixture function",
        "All fixtures in conftest.py are injected as globals automatically",
      ],
      answerIndex: 2,
      explain:
        "Fixtures are dependency-injected by parameter name: a test (or another fixture) that lists `repo` as a parameter receives the result of the `repo` fixture. Unlike setUp(), only tests that ask for a fixture pay for its setup.",
    },
    {
      question: "What is the pytest equivalent of PHPUnit's @dataProvider?",
      options: [
        "@pytest.fixture(params=...) on the test function itself",
        "@pytest.mark.parametrize with the cases listed above the test",
        "Writing a for-loop over cases inside one test function",
        "pytest -k with a comma-separated list of inputs",
      ],
      answerIndex: 1,
      explain:
        "@pytest.mark.parametrize(\"a,b\", [(1, 2), ...]) runs the test once per tuple and reports each case as its own test — the same job as a data provider, but with the data adjacent to the test.",
    },
    {
      question: "Where does teardown code go in a modern pytest fixture?",
      options: [
        "In a tearDown() method of the fixture's class",
        "In a finally block inside every test that uses it",
        "Registered with pytest.teardown(fn)",
        "After the yield statement inside the fixture function",
      ],
      answerIndex: 3,
      explain:
        "A yield fixture runs its setup, hands the value to the test at `yield`, and everything after the yield executes as teardown once the test finishes — including when the test fails.",
    },
  ],
};

export default lesson;
