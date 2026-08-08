import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "testing",
  title: "Testing with TestClient & pytest",
  part: "Production & Shipping",
  estMinutes: 12,
  summary:
    "TestClient calls your app in-process from plain synchronous pytest functions, and app.dependency_overrides swaps real dependencies (the database, the current user) for fakes — the cleanest test seam in the framework.",

  concept: `
Nothing signals "hire this person" like tests that arrive with the feature.
FastAPI makes that cheap: **TestClient** (built on \`httpx\` — install it with
\`pip install httpx pytest\`) speaks HTTP directly to your app **in-process**.
No server to boot, no port, and — the pleasant surprise — no async test
plumbing for the common case:

\`\`\`python
# test_items.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_read_item():                       # plain def — pytest runs it
    response = client.get("/items/1")
    assert response.status_code == 200
    assert response.json() == {"id": 1, "name": "Hammer"}
\`\`\`

Even though the app is async, TestClient drives the event loop for you, so
tests are ordinary synchronous functions. That's a Laravel feature test —
\`$this->getJson('/items/1')->assertStatus(200)\` — with \`assert\` statements
instead of assertion methods.

### pytest in sixty seconds

pytest discovers files named \`test_*.py\` and functions named \`test_*\`, and a
bare failing \`assert\` produces a rich diff — no \`assertEquals\` zoo. Shared
setup lives in **fixtures**: functions decorated with \`@pytest.fixture\`
(often in a \`conftest.py\`) that a test receives *by naming a parameter after
them*:

\`\`\`python
@pytest.fixture
def client():
    return TestClient(app)

def test_health(client):        # pytest injects the fixture by name
    assert client.get("/healthz").status_code == 200
\`\`\`

Notice the poetry: pytest fixtures are **dependency injection by parameter
name** — the same idea as \`Depends\`, living in your test suite. Unlike
PHPUnit's single \`setUp()\`, fixtures are composable (fixtures can request
other fixtures) and per-test opt-in.

### The killer seam: dependency_overrides

Because every external resource in a well-built FastAPI app arrives via
\`Depends\`, tests can swap any of them: \`app.dependency_overrides\` is a plain
dict mapping *the real dependency function* to a replacement.

\`\`\`python
def override_get_db():
    yield test_session                      # SQLite in-memory, say

app.dependency_overrides[get_db] = override_get_db
\`\`\`

Every route that depends on \`get_db\` — directly or through other
dependencies, in any router — now receives the test session. Auth becomes
trivial: to test a protected route you don't forge JWTs, you override
\`get_current_user\` to return a fixed user. Clear overrides between tests
(\`app.dependency_overrides.clear()\`, typically in a fixture's teardown) so
they can't leak.

Compare the PHP equivalent: mocking container bindings with
\`$this->app->instance(...)\` or \`$this->mock(...)\`, or Laravel's \`actingAs()\`.
Same intent — but here the seam is the *function you already wrote*, keyed in
one visible dict, with no mocking library and no container internals.
`,

  comparisons: [
    {
      label: "A feature test, twin for twin",
      intro:
        "Hit an endpoint, assert status and JSON body. If you can write the Laravel version, you can already write the FastAPI one.",
      php: `<?php
// tests/Feature/ItemTest.php (Laravel)
class ItemTest extends TestCase
{
    public function test_shows_an_item(): void
    {
        $this->getJson('/api/items/1')
            ->assertStatus(200)
            ->assertJson([
                'id' => 1,
                'name' => 'Hammer',
            ]);
    }
}`,
      ts: `# tests/test_items.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_shows_an_item():
    response = client.get("/items/1")
    assert response.status_code == 200
    assert response.json() == {"id": 1, "name": "Hammer"}`,
      note:
        "TestClient (httpx-based) calls the ASGI app in-process — no server, no HTTP socket. Plain assert replaces the assertion-method chain, and pytest prints a full diff when it fails.",
    },
    {
      label: "Swapping the database for tests",
      intro:
        "Point every route at a test database. Laravel rebinds the container / swaps the connection; FastAPI overrides one dependency function.",
      php: `<?php
// tests/TestCase.php (Laravel)
// phpunit.xml sets DB_CONNECTION=sqlite,
// DB_DATABASE=:memory:, and each test runs in
// a transaction that's rolled back:
class ItemTest extends TestCase
{
    use RefreshDatabase;

    public function test_lists_items(): void
    {
        Item::factory()->create(['name' => 'Hammer']);
        $this->getJson('/api/items')->assertJsonCount(1);
    }
}`,
      ts: `# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.deps import get_db

def override_get_db():
    yield test_session          # engine on sqlite:///:memory:

@pytest.fixture
def client():
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()   # never leak into other tests`,
      note:
        "One dict entry reroutes every route that depends on get_db, however deep in the dependency tree. The fixture's post-yield line is the teardown — same shape as a yield dependency.",
    },
    {
      label: "Testing an auth-protected route",
      intro:
        "The route requires a logged-in user. Neither test forges real credentials — both inject a user at the framework's seam.",
      php: `<?php
// Laravel: actingAs() sets the authenticated user
public function test_me_returns_profile(): void
{
    $user = User::factory()->create([
        'email' => 'jason@example.com',
    ]);

    $this->actingAs($user)
        ->getJson('/api/me')
        ->assertStatus(200)
        ->assertJsonPath('email', 'jason@example.com');
}`,
      ts: `# tests/test_auth.py
from app.deps import get_current_user
from app.schemas import User

def fake_user():
    return User(id=1, email="jason@example.com")

def test_me_returns_profile(client):
    app.dependency_overrides[get_current_user] = fake_user
    response = client.get("/me")
    assert response.status_code == 200
    assert response.json()["email"] == "jason@example.com"

def test_me_rejects_anonymous(client):
    assert client.get("/me").status_code == 401  # no override`,
      note:
        "Overriding get_current_user skips token decoding entirely — the JWT machinery gets its own focused tests. Removing the override gives you the 401 path for free.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A micro test-runner showing the whole mechanism: handlers resolve dependencies through an overridable dict, a fake client catches auth failures as 401s, and each test starts with a clean overrides dict. Predict the three verdict lines.",
    code: `# dependency_overrides in miniature: a dict from real dependency
# to replacement, consulted every time a handler resolves one.

def get_db():
    raise RuntimeError("would connect to postgres")

def get_current_user():
    raise PermissionError("401: no valid token")

dependency_overrides = {}

def resolve(dep):
    return dependency_overrides.get(dep, dep)()

# --- the "app": handlers declaring their dependencies ---
def list_items():
    db = resolve(get_db)
    return {"status": 200, "json": {"db": db["kind"], "items": ["hammer", "saw"]}}

def read_profile():
    user = resolve(get_current_user)
    return {"status": 200, "json": {"username": user["username"]}}

routes = {"/items": list_items, "/profile": read_profile}

class FakeClient:  # stands in for TestClient(app)
    def get(self, path):
        try:
            return routes[path]()
        except PermissionError as e:
            return {"status": 401, "json": {"detail": str(e)}}

client = FakeClient()

# --- the tests ---
def test_items_uses_fake_db():
    dependency_overrides[get_db] = lambda: {"kind": "sqlite-memory"}
    r = client.get("/items")
    assert r["status"] == 200
    assert r["json"] == {"db": "sqlite-memory", "items": ["hammer", "saw"]}

def test_profile_rejects_anonymous():
    r = client.get("/profile")  # no override -> real dependency raises
    assert r["status"] == 401

def test_profile_with_fake_user():
    dependency_overrides[get_current_user] = lambda: {"username": "jason"}
    r = client.get("/profile")
    assert r["status"] == 200
    assert r["json"] == {"username": "jason"}

passed = 0
tests = [test_items_uses_fake_db, test_profile_rejects_anonymous, test_profile_with_fake_user]
for test in tests:
    dependency_overrides.clear()  # a fresh app per test, like a fixture
    try:
        test()
        passed += 1
        print(f"PASSED {test.__name__}")
    except AssertionError:
        print(f"FAILED {test.__name__}")

print(f"{passed} passed, {len(tests) - passed} failed")`,
    output: `PASSED test_items_uses_fake_db
PASSED test_profile_rejects_anonymous
PASSED test_profile_with_fake_user
3 passed, 0 failed`,
  },

  keyPoints: [
    "`TestClient(app)` (httpx-based; `pip install httpx pytest`) calls the ASGI app in-process — plain synchronous `def test_*()` functions work even though the app is async.",
    "The assertions are just `assert response.status_code == 200` and `assert response.json() == {...}` — pytest's failure diffs replace PHPUnit's assertion-method zoo.",
    "pytest discovers `test_*.py` files and `test_*` functions; fixtures (`@pytest.fixture`, often in `conftest.py`) are injected by parameter name — dependency injection for tests, the same idea as `Depends`.",
    "`app.dependency_overrides[real_dep] = fake` is a plain dict that reroutes every route depending on `real_dep`, at any depth — swap `get_db` for an in-memory session, no mocking library needed.",
    "Test protected routes by overriding `get_current_user` to return a fixed user (Laravel's `actingAs()`); leave it un-overridden to test the 401 path.",
    "Always clear overrides between tests — `app.dependency_overrides.clear()` in a fixture's teardown — so one test's fakes can't leak into another.",
  ],

  interview: [
    {
      q: "How do you test a FastAPI endpoint that depends on a database and an authenticated user?",
      a: "Both resources should already arrive via `Depends` — `get_db` and `get_current_user` — so I use `app.dependency_overrides`: a dict on the app mapping the real dependency function to a test double. I override `get_db` with a function yielding a session bound to an in-memory SQLite engine (or a transaction-per-test Postgres setup for dialect fidelity), and `get_current_user` with a lambda returning a fixed `User` — no JWT forging; the token machinery gets its own unit tests. Then a plain `TestClient(app)` call exercises the full stack — routing, validation, serialisation — in-process. I clear the overrides in fixture teardown so tests stay independent. It's the same intent as Laravel's `RefreshDatabase` plus `actingAs()`, but the seam is a visible one-line dict entry rather than container rebinding.",
    },
    {
      q: "Your FastAPI app is async — why don't the tests need to be?",
      a: "`TestClient` is built on httpx and runs the ASGI app in-process, managing the event loop internally: it sends a real request through the middleware/routing/validation pipeline and blocks until the async handler completes. So the test function itself is ordinary synchronous code — no `async def test_`, no event-loop fixtures for the common case. You only reach for an async test setup (`httpx.AsyncClient` with `ASGITransport` and an async test runner) when the test itself must await things alongside the app. Keeping the default tests sync keeps the suite simple and fast.",
    },
    {
      q: "You know PHPUnit — what's genuinely different about pytest, beyond syntax?",
      a: "Three things. First, bare `assert` with introspected failure output replaces the assertion-method vocabulary — one keyword, rich diffs. Second, fixtures replace `setUp()`: they're named functions injected by parameter name, so setup is composable (fixtures can depend on other fixtures), opt-in per test, and shareable across files via `conftest.py` — it's dependency injection, the same principle as FastAPI's `Depends`, which makes the whole stack feel coherent. Third, tests are plain functions, not class hierarchies — classes exist if you want grouping, but nothing forces the ceremony. The net effect is that a FastAPI test file often fits on one screen while covering routing, validation, and auth.",
    },
  ],

  quiz: [
    {
      question: "What does TestClient(app) actually do when a test calls client.get('/items/1')?",
      options: [
        "Starts uvicorn on a random port and sends a real network request",
        "Calls the ASGI app in-process via httpx, running the async handler and returning a response object — no server or socket",
        "Parses the route table and calls your handler function directly, skipping middleware",
        "Replays a recorded HTTP response fixture",
      ],
      answerIndex: 1,
      explain:
        "TestClient speaks ASGI to the app in the same process: middleware, routing, validation, and serialisation all run for real. That's why its assertions are trustworthy without any server management.",
    },
    {
      question:
        "How do you make every route that uses Depends(get_db) hit a test database instead?",
      options: [
        "Monkeypatch the database driver import",
        "Pass db=test_session to each request as a query parameter",
        "app.dependency_overrides[get_db] = override_get_db",
        "Set an environment variable that get_db checks at runtime",
      ],
      answerIndex: 2,
      explain:
        "dependency_overrides is a plain dict keyed by the original dependency function. Every resolution of get_db — in any router, at any depth of the dependency tree — uses the override until you clear it.",
    },
    {
      question: "In pytest, how does a test receive the `client` fixture?",
      options: [
        "By calling self.getFixture('client') inherited from a base class",
        "By declaring a parameter named client — pytest matches fixtures by parameter name",
        "By importing it from pytest.fixtures",
        "Fixtures run automatically for every test; no declaration is needed",
      ],
      answerIndex: 1,
      explain:
        "Fixture injection is by-name: def test_health(client) makes pytest find and call the client fixture (locally or in conftest.py). It's opt-in per test and composable — the same dependency-injection idea as Depends.",
    },
    {
      question: "Why should app.dependency_overrides be cleared between tests?",
      options: [
        "Stale entries cause a memory leak that slows the suite",
        "FastAPI raises an error if an override is set twice",
        "It's a module-level dict on the app — a fake user or DB left behind silently leaks into later tests",
        "TestClient refuses to start while overrides are present",
      ],
      answerIndex: 2,
      explain:
        "Overrides are global mutable state on the app object. A test that forgets cleanup can make an unrelated test pass (fake auth) or fail (fake DB) mysteriously — so clear() belongs in fixture teardown after the yield.",
    },
  ],
};

export default lesson;
