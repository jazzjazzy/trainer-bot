import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "yield-and-class-dependencies",
  title: "Yield Dependencies & Classes as Dependencies",
  part: "Dependencies & Architecture",
  estMinutes: 12,
  summary:
    "yield turns a dependency into setup + teardown around the request — the pattern behind every get_db — and since any callable works, classes give you typed, autocompleting dependency objects.",

  concept: `
Two power patterns turn \`Depends\` from convenient into structural: generators
for lifecycle, and classes for typed parameter objects.

### Dependencies with yield: setup and teardown

Make the dependency a generator function and FastAPI treats everything before
\`yield\` as setup, the yielded value as the injected dependency, and everything
after \`yield\` as teardown:

\`\`\`python
def get_db():
    db = SessionLocal()   # setup: runs before the endpoint
    try:
        yield db          # injected value; endpoint runs "inside" this line
    finally:
        db.close()        # teardown: runs after the response is sent
\`\`\`

This is *the* FastAPI database pattern — every SQLAlchemy tutorial is built on
it. In PHP terms it's the \`finally\` block of a PSR-15 middleware wrapped
around the handler, or \`register_shutdown_function\` with actual structure:
guaranteed cleanup, expressed next to the acquisition.

Details that matter:

- **Teardown runs after the response is sent.** The client isn't waiting on
  your \`db.close()\`.
- **Teardown always runs**, success or failure — that's what the
  \`try/finally\` guarantees. If the endpoint raises \`HTTPException\`, the
  exception passes *through* the dependency on its way out, the \`finally\`
  fires, and then FastAPI's handler builds the 404.
- **You can catch and react.** Put \`except\` between \`try\` and \`finally\` to
  roll back on failure, or to translate a domain exception into an
  \`HTTPException\` (raising after \`yield\` is supported since FastAPI 0.106):

\`\`\`python
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()               # only on success
    except Exception:
        db.rollback()
        raise                     # re-raise: don't swallow it
    finally:
        db.close()
\`\`\`

One rule: if you catch, **re-raise** (or raise something better). A yield
dependency that swallows the exception leaves the request with an error and
no handler — FastAPI can't respond sensibly on your behalf.

### Classes as dependencies

\`Depends\` accepts *any callable* — and a class is a callable that returns an
instance. So instead of a function returning an untyped dict:

\`\`\`python
from typing import Annotated
from fastapi import Depends, FastAPI

app = FastAPI()

class CommonParams:
    def __init__(self, q: str | None = None, skip: int = 0, limit: int = 100):
        self.q = q
        self.skip = skip
        self.limit = limit

@app.get("/items/")
async def read_items(commons: Annotated[CommonParams, Depends(CommonParams)]):
    return {"q": commons.q, "skip": commons.skip}
\`\`\`

FastAPI reads \`__init__\`'s signature exactly like a function dependency's —
\`q\`, \`skip\`, \`limit\` become documented query params — but now \`commons\` is a
**typed object**: your editor autocompletes \`.skip\`, and \`commons.skpi\` is a
visible mistake instead of a silent \`KeyError\` waiting to happen. It's a
FormRequest that's also a DTO.

Because writing the class twice is redundant, FastAPI offers a shorthand —
when the annotation type and the dependency are the same class, leave
\`Depends()\` empty:

\`\`\`python
commons: Annotated[CommonParams, Depends()]
\`\`\`

Both patterns compose with everything else: a class dependency can take a
yield-dependency session in its \`__init__\`, and yield dependencies can be
class-based too (\`__call__\` as a generator).
`,

  comparisons: [
    {
      label: "Guaranteed cleanup around the handler",
      intro:
        "Both guarantee a resource is released whether the request succeeds or explodes. PHP puts the try/finally in middleware around the handler; FastAPI puts it in the dependency that owns the resource.",
      php: `<?php
// PSR-15 middleware: cleanup wrapped around the handler
class DbSessionMiddleware implements MiddlewareInterface
{
    public function process(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler
    ): ResponseInterface {
        $session = $this->pool->acquire();
        $request = $request->withAttribute('db', $session);
        try {
            return $handler->handle($request);
        } finally {
            $session->close();   // always runs
        }
    }
}`,
      ts: `# app/deps.py -- the canonical FastAPI get_db
from typing import Annotated
from fastapi import Depends, FastAPI

def get_db():
    db = SessionLocal()      # setup
    try:
        yield db             # endpoint runs here
    finally:
        db.close()           # always runs, after the response

app = FastAPI()

@app.get("/items/")
def read_items(db: Annotated[Session, Depends(get_db)]):
    return db.scalars(select(Item)).all()`,
      note:
        "Same try/finally guarantee, but the FastAPI version is scoped: middleware wraps EVERY route, while only endpoints that declare the dependency pay for a session — and the endpoint receives it typed, not via a request attribute.",
    },
    {
      label: "Commit on success, roll back on failure",
      intro:
        "Transaction handling around the request. Laravel wraps the closure in DB::transaction; the yield dependency expresses the same commit/rollback/close arc inline.",
      php: `<?php
// Laravel: closure-scoped transaction
public function store(StoreOrderRequest $request)
{
    return DB::transaction(function () use ($request) {
        $order = Order::create($request->validated());
        // exception inside => automatic rollback + rethrow
        return $order;
    });
    // commit happens if the closure returns normally
}`,
      ts: `# app/deps.py
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()        # endpoint finished cleanly
    except Exception:
        db.rollback()      # HTTPException passes through here too
        raise              # ALWAYS re-raise -- never swallow
    finally:
        db.close()`,
      note:
        "The exception raised in the endpoint travels through the dependency's except block on its way to FastAPI's handler — catch to roll back or translate, but re-raise, or the request ends with no usable response.",
    },
    {
      label: "Untyped array vs a class dependency",
      intro:
        "Shared query params as a bag of values versus a typed object. The PHP side returns an array from a helper; the class dependency gives autocompletion and a real type.",
      php: `<?php
// Helper returning an array -- stringly-typed access
function commonParams(Request $request): array
{
    return [
        'q'     => $request->query('q'),
        'skip'  => (int) $request->query('skip', 0),
        'limit' => min(100, (int) $request->query('limit', 100)),
    ];
}

$params = commonParams($request);
$skip = $params['skpi'] ?? 0;  // typo: silently 0, no error`,
      ts: `# app/main.py
from typing import Annotated
from fastapi import Depends, FastAPI

class CommonParams:
    def __init__(
        self, q: str | None = None, skip: int = 0, limit: int = 100
    ):
        self.q, self.skip, self.limit = q, skip, min(limit, 100)

app = FastAPI()

@app.get("/items/")
async def read_items(commons: Annotated[CommonParams, Depends()]):
    # Depends() empty: the annotation IS the dependency.
    return {"skip": commons.skip}  # .skpi flagged by the editor`,
      note:
        "FastAPI reads __init__ like any dependency signature (q/skip/limit become documented query params), and the injected value is a typed instance — the PHP array's silent-typo failure mode disappears.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A yield dependency simulated with contextlib: one successful request, one that raises. Predict the print ordering for each — in particular, whether 'close session' still runs on the failing request, and where the 404 line lands.",
    code: `from contextlib import contextmanager

class HTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        self.detail = detail

# The exact shape of FastAPI's get_db yield dependency: code before
# yield = setup, code after = teardown. finally ALWAYS runs.
@contextmanager
def get_db():
    print("  open session")
    try:
        yield "session"
        print("  commit")
    except HTTPException:
        print("  rollback: HTTPException passed through the dependency")
        raise
    finally:
        print("  close session")

ITEMS = {"plumbus": 3.99}

def read_item(db, item_id):
    print(f"  handle request using {db}")
    if item_id not in ITEMS:
        raise HTTPException(404, "Item not found")
    return {"item_id": item_id, "price": ITEMS[item_id]}

def handle(item_id):
    try:
        with get_db() as db:
            body = read_item(db, item_id)
            print(f"  -> 200 {body}")   # response sent BEFORE teardown
    except HTTPException as exc:
        print(f"  -> {exc.status_code} {{'detail': '{exc.detail}'}}")

print("request: GET /items/plumbus")
handle("plumbus")
print("request: GET /items/missing")
handle("missing")`,
    output: `request: GET /items/plumbus
  open session
  handle request using session
  -> 200 {'item_id': 'plumbus', 'price': 3.99}
  commit
  close session
request: GET /items/missing
  open session
  handle request using session
  rollback: HTTPException passed through the dependency
  close session
  -> 404 {'detail': 'Item not found'}`,
  },

  keyPoints: [
    "In a yield dependency, code before `yield` is setup, the yielded value is injected, and code after `yield` is teardown — which runs after the response is sent.",
    "The canonical pattern is `get_db()`: open a session, `yield` it inside `try`, `close()` in `finally` — teardown is guaranteed on success and failure alike.",
    "Exceptions from the endpoint (including `HTTPException`) pass through the dependency on their way out — catch to roll back or translate, but always re-raise.",
    "Raising `HTTPException` (or converting domain exceptions) after `yield` is supported since FastAPI 0.106 — a dependency can turn `OwnerError` into a 400.",
    "Any callable works with `Depends`, so classes do too: FastAPI resolves `__init__`'s parameters like a function dependency, and you get a typed, autocompleting object instead of a dict.",
    "When the annotation and the dependency are the same class, `Annotated[CommonParams, Depends()]` — empty parentheses — avoids writing the class twice.",
  ],

  interview: [
    {
      q: "How does FastAPI handle resources that need cleanup after the request, like a database session?",
      a: "With a yield dependency. You write `get_db()` as a generator: create the session, `yield` it inside a `try`, close it in `finally`. FastAPI runs the code up to `yield` before the endpoint, injects the yielded session, and resumes the generator after the response is sent — so the client never waits on cleanup, and the `finally` guarantees the close happens even when the endpoint raises. It's the same guarantee I'd get from a try/finally in a PSR-15 middleware wrapping the handler, but scoped: only endpoints that declare the dependency open a session, and they receive it as a typed parameter rather than digging it out of a request attribute.",
    },
    {
      q: "An endpoint using your get_db yield dependency raises HTTPException. Walk me through what happens in the dependency.",
      a: "The exception propagates out of the endpoint and is thrown into the dependency generator at the `yield` point. If I have an `except` clause it fires — that's where I roll back the transaction — and then the `finally` closes the session; only after that does FastAPI's exception handler produce the 404 response. Two rules follow. First, code after `yield` runs regardless, so cleanup is never skipped. Second, if I catch, I must re-raise — either the original exception or a translated one, like turning a domain `OwnerError` into `HTTPException(400)`, which has been supported after `yield` since FastAPI 0.106. Swallowing it leaves the request errored with nothing for FastAPI to handle.",
    },
    {
      q: "Why would you use a class as a dependency instead of a function returning a dict?",
      a: "Type safety and ergonomics. `Depends` accepts any callable, and a class is a callable whose `__init__` signature FastAPI resolves exactly like a function's — so `q`, `skip`, `limit` still become validated, documented query params. But the injected value is now a typed instance: the editor autocompletes `commons.skip`, a typo like `commons.skpi` is caught by tooling instead of becoming a silent `KeyError`, and the annotation tells every reader what shape the dependency has. Coming from PHP, it merges Laravel's FormRequest and a DTO into one class. There's also the shorthand: when annotation and dependency are the same class, `Annotated[CommonParams, Depends()]` with empty parentheses avoids repeating it.",
    },
  ],

  quiz: [
    {
      question:
        "In a yield dependency, when does the code after yield execute?",
      options: [
        "Immediately before the endpoint runs",
        "Only if the endpoint succeeds",
        "After the response is sent, on success and on failure alike (given try/finally)",
        "Never — code after yield is unreachable in a generator dependency",
      ],
      answerIndex: 2,
      explain:
        "Everything before yield is setup, everything after is teardown, and FastAPI resumes the generator after the response goes out. With the yield inside try/finally, the teardown is guaranteed even when the endpoint raises — that's the entire point of the get_db pattern.",
    },
    {
      question:
        "Your yield dependency catches the endpoint's exception to roll back a transaction. What must it do next?",
      options: [
        "Return an error response object",
        "Re-raise the exception (or raise a translated one)",
        "Call app.handle_exception() manually",
        "Nothing — catching it is enough",
      ],
      answerIndex: 1,
      explain:
        "The dependency sits in the exception's path, not at its destination. If it swallows the exception, FastAPI has an errored request and no exception to handle. Catch to roll back or to translate (e.g. raise HTTPException(400) — supported after yield since 0.106), then always re-raise.",
    },
    {
      question:
        "What does commons: Annotated[CommonParams, Depends()] — with empty Depends() — mean?",
      options: [
        "Inject a cached singleton of CommonParams",
        "Use the annotation's class itself as the dependency: FastAPI calls CommonParams(...) from __init__'s params",
        "A syntax error — Depends always needs an argument",
        "Skip dependency resolution and pass None",
      ],
      answerIndex: 1,
      explain:
        "When the dependency is the same class as the annotation, FastAPI lets you leave Depends() empty rather than writing CommonParams twice. __init__'s parameters are resolved like any dependency signature and you receive a typed instance.",
    },
  ],
};

export default lesson;
