import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "fastapi-testclient",
  title: "FastAPI's TestClient",
  part: "Integration & E2E",
  estMinutes: 12,
  summary:
    "The same integration layer on the Python track: TestClient calls the ASGI app in-process — no server, no network — and app.dependency_overrides swaps real dependencies for fakes through FastAPI's built-in DI.",

  concept: `
Same layer, other interview track. Where Node has supertest wrapping an Express app,
FastAPI ships its own equivalent in the box: **TestClient**, an httpx-based client that
calls your ASGI app **in-process**. Same idea as \`request(app)\` — no server started,
no port bound, no network touched — the "request" is a function call wearing HTTP clothes.

### The shape of a TestClient test

\`\`\`python
# tests/test_items.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_read_item():
    response = client.get("/items/42")
    assert response.status_code == 200
    assert response.json()["name"] == "Mechanical Keyboard"
\`\`\`

You import the \`app\` object, wrap it, and issue requests: \`client.get\`, \`client.post\`,
\`client.put\`… The response gives you \`.status_code\`, \`.json()\`, and \`.headers\`. Note
what runs on the way: real routing, real Pydantic validation, real serialization — the
full HTTP slice, exactly like the supertest layer. And they're plain pytest tests, so
everything from the last sections applies: fixtures can build the client, parametrize can
table-drive the cases.

### dependency_overrides: swapping the database for a fake

FastAPI handlers receive their dependencies through \`Depends()\` — its built-in dependency
injection. That seam exists precisely so tests can substitute at it. \`app.dependency_overrides\`
is a dict mapping *the real dependency function* to a replacement:

\`\`\`python
from app.main import app
from app.deps import get_db

def fake_db():
    return {42: {"id": 42, "name": "Test Item"}}

def test_read_item_without_a_real_db():
    app.dependency_overrides[get_db] = fake_db
    try:
        response = client.get("/items/42")
        assert response.status_code == 200
        assert response.json()["name"] == "Test Item"
    finally:
        app.dependency_overrides.clear()   # never leak into other tests
\`\`\`

Every handler declaring \`Depends(get_db)\` now receives \`fake_db()\`'s result — no
monkeypatching internals, no test-only code paths in production files. This is the payoff
of designing for testability: because dependencies enter through a declared seam, replacing
them is a dictionary entry. In practice the override-and-clear dance lives in a fixture,
so the \`clear()\` is guaranteed teardown rather than discipline.

### Auth headers and validation responses

Two things you should always cover at this layer. Protected routes — pass headers and
assert both sides of the guard:

\`\`\`python
def test_requires_auth():
    assert client.get("/admin/items").status_code == 401

def test_allows_valid_token():
    response = client.get(
        "/admin/items",
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 200
\`\`\`

And validation: when a request body fails Pydantic validation, FastAPI responds **422**
with a \`detail\` list describing each violation. Assert the status and the field it names:

\`\`\`python
def test_rejects_negative_price():
    response = client.post("/items", json={"name": "X", "price": -1})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "price"]
\`\`\`

You didn't write that 422 handler — FastAPI generated it from your Pydantic model — but
it is still your API contract, and clients will still depend on it.

### One idea, both tracks

Say this in an interview and you sound like someone who has tested more than one stack:
supertest and TestClient are the same move — *import the app, call it in-process, assert
on status and body, substitute dependencies at the DI seam*. Only the injection mechanism
differs: Node apps thread dependencies through factories or module mocks; FastAPI gives
you \`dependency_overrides\` out of the box.
`,

  comparisons: [
    {
      label: "Manual endpoint QA vs a TestClient test",
      intro:
        "Checking that the item endpoint returns the right JSON. On the left, the endpoint is 'tested' the way most PHP APIs were; on the right, the check is code.",
      php: `<?php
// src/Controller/ItemController.php
public function show(int $id): JsonResponse
{
    $item = $this->items->find($id);
    if ($item === null) {
        return new JsonResponse(
            ['detail' => 'Item not found'], 404
        );
    }
    return new JsonResponse($item);
}
// "Testing": php -S localhost:8080, then browse to
// /items/42, eyeball the JSON, ship it.
// The 404 branch? Checked once in 2019.`,
      ts: `# tests/test_items.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_show_item():
    response = client.get("/items/42")
    assert response.status_code == 200
    assert response.json()["name"] == "Mechanical Keyboard"

def test_missing_item_is_404():
    response = client.get("/items/999")
    assert response.status_code == 404
    assert response.json() == {"detail": "Item not found"}`,
      note: "TestClient calls the ASGI app in-process — no php -S, no port, no browser — and the 404 branch gets re-verified on every run instead of once per career.",
      rightLang: "python",
    },
    {
      label: "Hard-wired dependencies vs dependency_overrides",
      intro:
        "Both endpoints need a database. The left one constructs it inside the controller, so tests must hit a real DB; the right one declares it as a dependency, so tests swap it with one dict entry.",
      php: `<?php
// src/Controller/ItemController.php
public function show(int $id): JsonResponse
{
    // Dependency constructed in place —
    // there is no seam. Any test of this
    // method hits the production database.
    $pdo = new PDO(getenv('DATABASE_DSN'));
    $repo = new ItemRepository($pdo);

    $item = $repo->find($id);
    return new JsonResponse($item);
}`,
      ts: `# app/main.py
@app.get("/items/{item_id}")
def read_item(item_id: int, db=Depends(get_db)):
    return db.find(item_id)

# tests/test_items.py
import pytest
from app.main import app
from app.deps import get_db

@pytest.fixture
def client_with_fake_db():
    app.dependency_overrides[get_db] = lambda: FakeDb()
    yield TestClient(app)
    app.dependency_overrides.clear()   # guaranteed teardown

def test_read_item(client_with_fake_db):
    response = client_with_fake_db.get("/items/42")
    assert response.status_code == 200`,
      note: "app.dependency_overrides maps the real dependency function to a fake — every handler declaring Depends(get_db) gets the fake, and the fixture's clear() stops the override leaking into other tests.",
      rightLang: "python",
    },
    {
      label: "Validation: hand-rolled and unchecked vs generated and asserted",
      intro:
        "Rejecting a negative price. The PHP version hand-writes the check and hopes it stays correct; FastAPI generates the 422 from the Pydantic model, and the test pins that contract.",
      php: `<?php
// src/Controller/ItemController.php
public function store(Request $request): JsonResponse
{
    $data = json_decode($request->getContent(), true);
    // Hand-rolled validation, one field at a time,
    // verified by poking Postman until it looked right.
    if (!isset($data['price']) || $data['price'] < 0) {
        return new JsonResponse(
            ['error' => 'bad price'], 400
        );
    }
    return new JsonResponse($this->items->create($data), 201);
}`,
      ts: `# app/main.py
class ItemIn(BaseModel):
    name: str
    price: float = Field(gt=0)

@app.post("/items", status_code=201)
def create_item(item: ItemIn, db=Depends(get_db)):
    return db.create(item)

# tests/test_items.py
def test_rejects_negative_price(client):
    response = client.post(
        "/items", json={"name": "X", "price": -1}
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "price"]`,
      note: "FastAPI turns the Pydantic model into the validation layer and the 422 response — the test asserts the generated contract (status plus which field failed) so a model refactor cannot silently change it.",
      rightLang: "python",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "TestClient minus the socket: a route handler wired to a swappable dependency, a get(path) helper returning (status, body), and tests covering the fake-DB override, the 404, the 422, and — crucially — that the override was cleaned up afterwards.",
    code: `# What TestClient does: call the app in-process. The "request" is a
# function call; dependency_overrides is just a lookup before calling.

# --- the real dependency (imagine a database session) ---
def real_db():
    return {42: {"id": 42, "name": "Mechanical Keyboard", "price": 149.0}}

dependency_overrides = {}          # FastAPI: app.dependency_overrides

def resolve(dep):
    return dependency_overrides.get(dep, dep)

# --- the "app": a handler declaring its dependency ---
def read_item(item_id):
    db = resolve(real_db)()        # Depends(real_db)
    if not item_id.isdigit():      # Pydantic would generate this
        return 422, {"detail": "item_id must be an integer"}
    item = db.get(int(item_id))
    if item is None:
        return 404, {"detail": "Item not found"}
    return 200, item

# --- the "TestClient": get(path) -> (status, body), fully in-process ---
def get(path):
    if path.startswith("/items/"):
        return read_item(path[len("/items/"):])
    return 404, {"detail": "Not Found"}

# --- the tests ---
def test_read_item_with_fake_db():
    dependency_overrides[real_db] = (
        lambda: {42: {"id": 42, "name": "Test Item", "price": 1.0}}
    )
    try:
        status, body = get("/items/42")
        assert status == 200
        assert body["name"] == "Test Item"
    finally:
        dependency_overrides.clear()   # the fixture-teardown step

def test_missing_item_is_404():
    status, body = get("/items/999")
    assert status == 404
    assert body == {"detail": "Item not found"}

def test_bad_id_is_422():
    status, body = get("/items/abc")
    assert status == 422

def test_override_did_not_leak():
    status, body = get("/items/42")
    assert body["name"] == "Mechanical Keyboard"   # the REAL db again

for t in [test_read_item_with_fake_db, test_missing_item_is_404,
          test_bad_id_is_422, test_override_did_not_leak]:
    try:
        t()
        print(f"PASS {t.__name__}")
    except AssertionError:
        print(f"FAIL {t.__name__}")`,
    output: `PASS test_read_item_with_fake_db
PASS test_missing_item_is_404
PASS test_bad_id_is_422
PASS test_override_did_not_leak`,
  },

  keyPoints: [
    "TestClient (from fastapi.testclient, httpx-based) calls the ASGI app in-process: `client.get('/items/42')` returns a response with `.status_code`, `.json()`, and `.headers` — no server, no network.",
    "It is the Python twin of supertest's `request(app)`: import the app object, exercise real routing, validation, and serialization, assert on status and body.",
    "`app.dependency_overrides[get_db] = fake_db` swaps a `Depends()` dependency everywhere it is declared — FastAPI's built-in DI is the substitution seam.",
    "Do the override in a fixture with `app.dependency_overrides.clear()` after the yield, so cleanup is guaranteed and overrides never leak between tests.",
    "Test auth by passing `headers={'Authorization': 'Bearer ...'}` and asserting both the 401 and the authorized path.",
    "Pydantic validation failures return 422 with a `detail` list — assert the status and the failing field's `loc`, because that generated response is still your API contract.",
  ],

  interview: [
    {
      q: "How do you test a FastAPI endpoint without running a server or touching a real database?",
      a: "Two mechanisms, both built in. TestClient wraps the app object and issues requests in-process — `client.get('/items/42')` drives the real routing, Pydantic validation, and serialization without binding a port, so the tests are just pytest functions with no environment to manage. For the database, FastAPI's dependency injection is the seam: handlers receive the session via `Depends(get_db)`, and `app.dependency_overrides[get_db] = fake_db` swaps it everywhere for the duration of a test. I wrap the override in a fixture that calls `dependency_overrides.clear()` after the yield, so a leaked fake can never poison other tests. It's exactly the supertest pattern from the Node world — import the app, call it in-process, substitute at the DI seam.",
    },
    {
      q: "What is app.dependency_overrides and why is it better than monkeypatching the database module?",
      a: "It's a dict on the FastAPI app mapping a real dependency function to a replacement; during request handling, any parameter declared with `Depends(get_db)` resolves through that dict first. It beats monkeypatching because it substitutes at a declared public seam rather than reaching into module internals: I don't need to know where `get_db` is imported or how the session is constructed, and every handler using the dependency is covered by one entry. It also survives refactors — moving or renaming the module the handler lives in breaks a monkeypatch target string, but the override keys on the function object itself. The discipline it demands is cleanup, which belongs in fixture teardown.",
    },
    {
      q: "Why should you write tests asserting FastAPI's 422 validation responses when you didn't write that code?",
      a: "Because clients don't care who wrote it — the 422 with its `detail` payload is part of my API's observable contract, generated from my Pydantic model. If someone relaxes `Field(gt=0)` or renames a field, request handling changes for every consumer, and only a test pins that. Asserting `status_code == 422` and the `loc` of the failing field means model refactors can't silently weaken validation. It's the same contract-testing mindset as the rest of the integration layer: test the promise the API makes, and the promise includes its error responses.",
    },
  ],

  quiz: [
    {
      question: "What happens on the network when TestClient's client.get('/items/42') runs?",
      options: [
        "An HTTP request goes to localhost on the app's configured port",
        "Nothing — the ASGI app is called in-process; the request never touches a socket",
        "TestClient starts a uvicorn server, sends the request, then stops it",
        "The request is recorded and replayed against staging later",
      ],
      answerIndex: 1,
      explain:
        "TestClient (built on httpx) invokes the ASGI application directly in the same process. Real routing, validation, and serialization run, but there is no server, port, or network involved — which is what makes these tests fast and CI-friendly.",
    },
    {
      question:
        "A handler is declared as read_item(item_id: int, db=Depends(get_db)). How does a test give it a fake database?",
      options: [
        "Pass db=FakeDb() as a query parameter in the request",
        "monkeypatch every import of get_db across the codebase",
        "Set app.dependency_overrides[get_db] = fake_get_db, and clear the dict afterwards",
        "Subclass the app and override the route",
      ],
      answerIndex: 2,
      explain:
        "app.dependency_overrides maps the real dependency function to a substitute; every Depends(get_db) then resolves to the fake. Clearing the dict (ideally in fixture teardown) prevents the override leaking into unrelated tests.",
    },
    {
      question:
        "A POST body fails Pydantic validation. What does FastAPI return, without you writing any handler code?",
      options: [
        "A 400 with an empty body",
        "A 500, because the handler raised",
        "A 422 with a detail list identifying each invalid field",
        "A 204 — the request is silently dropped",
      ],
      answerIndex: 2,
      explain:
        "FastAPI converts Pydantic validation failures into a 422 response whose detail array names the location (e.g. [\"body\", \"price\"]) and reason for each violation. Generated or not, that response is part of your API contract and worth asserting in tests.",
    },
  ],
};

export default lesson;
