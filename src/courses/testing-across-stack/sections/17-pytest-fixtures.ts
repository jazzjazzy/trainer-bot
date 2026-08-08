import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "pytest-fixtures",
  title: "pytest Fixtures",
  part: "Components & Python",
  estMinutes: 12,
  summary:
    "Fixtures are setUp()/tearDown() done right: named, injectable setup functions with yield-based teardown, scopes, and composition — the single most-asked pytest interview topic.",

  concept: `
If pytest has one idea worth mastering for interviews, it is **fixtures**. They replace
PHPUnit's \`setUp()\`/\`tearDown()\` with something genuinely better designed — and "explain
why fixtures beat setUp()" is a real interview question.

### A fixture is a named, injectable piece of setup

Decorate a function with \`@pytest.fixture\` and any test can receive its return value —
**by naming a parameter after it**:

\`\`\`python
# tests/test_orders.py
import pytest

@pytest.fixture
def cart():
    return Cart(currency="AUD")

def test_empty_cart_totals_zero(cart):
    assert cart.total() == 0

def test_adding_updates_total(cart):
    cart.add("book", 20)
    assert cart.total() == 20
\`\`\`

pytest sees the parameter \`cart\`, finds the fixture with that name, calls it, and injects
the result. Each test gets a **fresh** cart. There is no shared \`$this->cart\` mutated
across the class — the isolation you had to be disciplined about in PHPUnit is the default.

### yield: setup and teardown in one function

For resources that need cleanup, write the fixture as a generator. Code before \`yield\`
is setup; the yielded value goes to the test; code after \`yield\` is teardown — and it runs
even when the test fails:

\`\`\`python
@pytest.fixture
def db():
    conn = connect_test_db()   # setUp
    yield conn                 # the test runs here
    conn.rollback()            # tearDown — guaranteed
    conn.close()
\`\`\`

One function, both halves, sharing local variables. No instance properties to shuttle state
from \`setUp()\` to \`tearDown()\`.

### Scopes: how often setup re-runs

\`@pytest.fixture(scope="...")\` controls the lifetime:

- **function** (default) — fresh per test. Maximum isolation, maximum cost.
- **class** — shared by tests in a class.
- **module** — one per file. Good for an expensive read-only resource.
- **session** — one per entire run. Right for "start a database container"; wrong for
  anything tests mutate, because shared mutable state is how flakiness starts.

The trade is always the same: wider scope buys speed and pays in coupling. Say exactly
that in an interview.

### Fixtures compose

A fixture can request other fixtures — just add parameters. Layered setup without
inheritance:

\`\`\`python
@pytest.fixture
def db(): ...

@pytest.fixture
def user(db):
    return db.insert_user(name="Ada")

def test_profile_page(user):
    assert profile_for(user).title == "Ada"
\`\`\`

The test asks for exactly what it needs; pytest resolves the chain (\`user\` → \`db\`) and
tears it down in reverse order. Compare PHPUnit, where one \`setUp()\` runs for **every**
test in the class whether that test needs the database or not.

### conftest.py: sharing without imports

Put fixtures in a \`conftest.py\` file and every test in that directory (and below) can use
them — no import statement. A typical suite has a root \`conftest.py\` with the app-level
fixtures (\`db\`, \`client\`) and deeper ones adding specialised fixtures near the tests that
need them.

pytest also ships useful built-in fixtures you request the same way: \`tmp_path\` (a fresh
temporary directory), \`capsys\` (captured stdout/stderr), and \`monkeypatch\` — next section.
`,

  comparisons: [
    {
      label: "setUp/tearDown vs a yield fixture",
      intro:
        "Both suites give each test a database connection and guarantee it is cleaned up. PHPUnit routes state through instance properties; pytest keeps setup, handover, and teardown in one function.",
      php: `<?php
// tests/OrderRepositoryTest.php
use PHPUnit\\Framework\\TestCase;

final class OrderRepositoryTest extends TestCase
{
    private PDO $conn;

    protected function setUp(): void
    {
        $this->conn = connectTestDb();
        $this->conn->beginTransaction();
    }

    protected function tearDown(): void
    {
        $this->conn->rollBack();
    }

    public function testSavesOrder(): void
    {
        $repo = new OrderRepository($this->conn);
        $repo->save(new Order(42));
        $this->assertNotNull($repo->find(42));
    }
}`,
      ts: `# tests/test_order_repository.py
import pytest

@pytest.fixture
def conn():
    conn = connect_test_db()   # setUp
    conn.begin()
    yield conn                 # test runs here
    conn.rollback()            # tearDown, even on failure

def test_saves_order(conn):
    repo = OrderRepository(conn)
    repo.save(Order(42))
    assert repo.find(42) is not None`,
      note: "The yield fixture holds setup and teardown as one function with shared locals — no instance property, and only tests that name `conn` as a parameter pay for the connection.",
      rightLang: "python",
    },
    {
      label: "Sharing setup: base class vs conftest.py",
      intro:
        "Twenty test files need the same authenticated user. The PHPUnit route is an inheritance hierarchy; the pytest route is a file that makes fixtures ambient for the directory.",
      php: `<?php
// tests/DatabaseTestCase.php — everyone extends this
abstract class DatabaseTestCase extends TestCase
{
    protected PDO $conn;
    protected User $user;

    protected function setUp(): void
    {
        $this->conn = connectTestDb();
        // Every subclass pays for this,
        // even tests that never touch a user.
        $this->user = $this->createUser('ada');
    }
}

final class ProfileTest extends DatabaseTestCase
{
    public function testShowsName(): void
    {
        $this->assertSame('ada', $this->user->name);
    }
}`,
      ts: `# tests/conftest.py — no imports needed by tests
import pytest

@pytest.fixture
def conn():
    conn = connect_test_db()
    yield conn
    conn.close()

@pytest.fixture
def user(conn):                 # composes: user needs conn
    return conn.insert_user(name="ada")

# tests/test_profile.py
def test_shows_name(user):      # asks only for what it needs
    assert user.name == "ada"

def test_homepage_needs_no_db():
    assert render_home().status == 200`,
      note: "conftest.py fixtures are opt-in per test and composable — the no-database test stays fast, where the base-class version forces every test through the whole setUp().",
      rightLang: "python",
    },
    {
      label: "Choosing a scope",
      intro:
        "An expensive resource — say a search index that takes seconds to build — should not rebuild per test. PHPUnit reaches for static state; pytest declares a scope.",
      php: `<?php
final class SearchTest extends TestCase
{
    private static ?SearchIndex $index = null;

    protected function setUp(): void
    {
        // Hand-rolled memoisation with static state —
        // and nothing ever tears it down.
        if (self::$index === null) {
            self::$index = SearchIndex::build();
        }
    }
}`,
      ts: `# tests/conftest.py
import pytest

@pytest.fixture(scope="module")
def index():
    idx = SearchIndex.build()   # once per file
    yield idx
    idx.dispose()               # torn down when the module ends

# scope="session" would build it once per run —
# fine while tests only read it, flaky the day one writes.`,
      note: "Scopes are declarative lifetimes with guaranteed teardown; widen them for speed only when the resource is read-only, because session-scoped mutable state couples tests together.",
      rightLang: "python",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "The yield mechanic with nothing hidden: a fixture is a generator, next() runs it up to yield (setup), the test uses the yielded resource, and resuming the generator runs the teardown. Watch the lifecycle print for each test — and note the second test gets a fresh connection.",
    code: `# A pytest yield-fixture, hand-rolled: one generator = setup + teardown.

def db_connection():
    print("  [setup]    open connection")
    conn = {"open": True, "rows": []}
    yield conn                      # hand the resource to the test
    print("  [teardown] close connection")
    conn["open"] = False

def run_with_fixture(fixture, test):
    gen = fixture()
    resource = next(gen)            # run the fixture UP TO yield
    try:
        test(resource)
        print(f"  PASS {test.__name__}")
    except AssertionError as e:
        print(f"  FAIL {test.__name__}: {e}")
    finally:
        try:
            next(gen)               # resume AFTER yield: teardown
        except StopIteration:
            pass                    # generator finished, as expected

# --- tests requesting the fixture (pytest matches by parameter name) ---

def test_insert_row(conn):
    conn["rows"].append("ada")
    assert conn["rows"] == ["ada"]

def test_gets_a_fresh_connection(conn):
    # function scope: the mutation above must not leak into this test
    assert conn["rows"] == []

for t in [test_insert_row, test_gets_a_fresh_connection]:
    print(f"{t.__name__}:")
    run_with_fixture(db_connection, t)`,
    output: `test_insert_row:
  [setup]    open connection
  PASS test_insert_row
  [teardown] close connection
test_gets_a_fresh_connection:
  [setup]    open connection
  PASS test_gets_a_fresh_connection
  [teardown] close connection`,
  },

  keyPoints: [
    "A fixture is a `@pytest.fixture` function; tests receive it by declaring a parameter with the fixture's name — injection by name, no imports.",
    "yield-style fixtures put setup before `yield` and teardown after it, in one function with shared locals; teardown runs even when the test fails.",
    "Scopes (`function`, `class`, `module`, `session`) trade isolation for speed — default to function scope, widen only for expensive read-only resources.",
    "Fixtures compose by requesting other fixtures as parameters; pytest resolves the chain and tears it down in reverse.",
    "`conftest.py` shares fixtures with a whole directory tree without a single import — the pytest answer to PHPUnit base-class hierarchies.",
    "Against PHPUnit: setUp() is one mandatory setup per class; fixtures are opt-in per test, so each test pays only for what it names.",
  ],

  interview: [
    {
      q: "Explain pytest fixtures to someone who knows PHPUnit's setUp() and tearDown().",
      a: "A fixture is a named, decorated function that produces a resource; a test receives it by declaring a parameter with that name, and pytest injects it. Teardown lives in the same function: write the fixture as a generator, `yield` the resource, and the code after the yield runs when the test finishes — pass or fail. The design wins over setUp() in two ways. First, it's opt-in: setUp() runs its entire body for every test in the class, while each pytest test requests exactly the fixtures it names, so a test needing no database never opens one. Second, fixtures compose — a `user` fixture can request `db` — which replaces the base-TestCase inheritance hierarchies PHPUnit pushes you toward.",
    },
    {
      q: "What fixture scopes exist and how do you choose one?",
      a: "Four main ones: function (the default — rebuilt per test), class, module (once per file), and session (once per run). The trade-off is isolation versus speed: function scope guarantees a clean slate but repeats the setup cost; session scope amortises an expensive setup like starting a database container but shares one instance across everything. My rule is to default to function scope and widen only for resources that are expensive and effectively read-only — the moment tests mutate a session-scoped object, they become order-dependent and flaky. For a shared database I keep the container session-scoped but wrap each test in a function-scoped transaction-rollback fixture, so the two scopes cooperate.",
    },
    {
      q: "What is conftest.py for?",
      a: "It's pytest's fixture-sharing mechanism: fixtures defined in a `conftest.py` are automatically available to every test in that directory and below, with no import statement. Typically the repo root conftest holds broad fixtures — the app instance, the test database, an authenticated client — and deeper directories add more specific ones next to the tests that use them; a nested conftest can even override a parent's fixture of the same name. It solves the problem PHPUnit solves with abstract base TestCases, but with composition and directory scoping instead of inheritance.",
    },
  ],

  quiz: [
    {
      question: "How does a pytest test get access to a fixture?",
      options: [
        "It calls the fixture function directly inside the test body",
        "It declares a parameter whose name matches the fixture; pytest injects the value",
        "It extends a FixtureTestCase base class",
        "It imports the fixture from conftest.py",
      ],
      answerIndex: 1,
      explain:
        "Injection is by parameter name: pytest sees `def test_x(cart)`, finds the fixture named `cart` (in the module or a conftest.py), runs it, and passes in the result. Calling fixture functions directly is an error, and conftest fixtures are never imported.",
    },
    {
      question: "In a yield-style fixture, when does the code after `yield` run?",
      options: [
        "Only if the test passes",
        "Immediately before the test, as part of setup",
        "After the test finishes, whether it passed or failed",
        "Never — yield ends the fixture",
      ],
      answerIndex: 2,
      explain:
        "Everything after the yield is teardown, and pytest resumes the generator once the test completes regardless of outcome — the equivalent of tearDown() running even for failed tests, but in the same function as the setup.",
    },
    {
      question:
        "Why is a session-scoped fixture risky for a mutable resource?",
      options: [
        "Session scope disables teardown",
        "All tests share one instance, so one test's mutations leak into others and create order-dependent failures",
        "It rebuilds the resource for every test, which is slow",
        "Session-scoped fixtures cannot be defined in conftest.py",
      ],
      answerIndex: 1,
      explain:
        "scope=\"session\" builds the resource once per run and shares it. That's a speed win for read-only resources, but shared mutable state couples tests: a test that writes to it changes what later tests see, producing flaky, order-dependent results.",
    },
  ],
};

export default lesson;
