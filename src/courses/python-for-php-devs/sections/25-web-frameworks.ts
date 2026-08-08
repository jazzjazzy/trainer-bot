import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "web-frameworks",
  title: "Web Frameworks: FastAPI, Flask & Django vs Laravel",
  part: "Real-World Python",
  estMinutes: 14,
  summary:
    "Python web apps are one long-running process, not PHP's fresh-world-per-request — plus the framework map: Django ≈ Laravel, Flask ≈ Slim, FastAPI ≈ type-hint-driven APIs.",

  concept: `
Before any framework, absorb the architectural headline, because it changes
how you write every line of web code.

### One process, many requests

PHP-FPM gives each request a **fresh script world**: globals reset, statics
reset, memory reclaimed — the shared-nothing model that makes PHP so forgiving.
A Python web app is **one long-running process** (or a small pool of them)
serving thousands of requests:

- **State persists.** A module-level dict lives across requests — great for a
  connection pool, catastrophic for per-user data. Globals are dangerous in a
  way PHP never trained you for.
- **Memory leaks matter.** A slow leak PHP would erase at end-of-request
  accumulates for days.
- **Code loads once.** Editing a file changes nothing until restart;
  hot-reload is a *dev-server feature*, not the deployment model.

### WSGI and ASGI

Python standardised the server↔app interface: **WSGI** is the older
synchronous contract (Django classic, Flask), **ASGI** its async successor
(FastAPI, modern Django) — enabling \`async def\` handlers and websockets.
PHP has no true analogue because PHP-FPM owns that layer; the closest cousins
are Swoole or FrankenPHP's worker mode, where PHP too becomes a long-running
process — and inherits exactly the same state-leak caveats.

### The framework map

- **Django ≈ Laravel** — the batteries choice: ORM, migrations, auth,
  admin panel, templates. \`Todo.objects.filter(done=False)\` reads like
  Eloquent's \`Todo::where('done', false)->get()\`.
- **Flask ≈ Slim** — the micro-framework: routing plus request/response, you
  choose the rest. Its templating, **Jinja2**, will feel eerily like Twig —
  same designer lineage, so \`{% for %}\` and \`{{ var }}\` carry straight over.
- **FastAPI ≈ modern API-first** — the one with no clean Laravel analogue:
  your **type hints become the validation layer** via Pydantic.

### FastAPI: annotations become validation

\`\`\`python
from fastapi import FastAPI

app = FastAPI()

@app.get("/todos/{todo_id}")
async def read_todo(todo_id: int, limit: int = 10):
    return {"todo_id": todo_id, "limit": limit}
\`\`\`

\`todo_id: int\` isn't documentation: FastAPI converts the path segment,
rejects \`/todos/abc\` with a structured 422, and generates OpenAPI docs — all
from the annotation. This is the payoff of Python type hints: in Laravel
you'd write a FormRequest with rules; here the signature *is* the rules.
Note the decorator: \`@app.get\` registers the handler in the app's route
table at import time.

### Serving it

You don't "put files under the docroot". An ASGI server — **uvicorn** — runs
your app object (\`uvicorn main:app --workers 4\`), typically behind nginx;
**gunicorn** is the traditional WSGI process manager. The role split mirrors
php-fpm behind nginx, except the workers hold your app in memory permanently.
Deploys therefore mean **restarting processes**, not just copying files.
`,

  comparisons: [
    {
      label: "The request lifecycle: fresh world vs persistent world",
      intro:
        "The same counter endpoint in both worlds. Watch what happens to module/file-level state between two requests.",
      php: `<?php
// counter.php — PHP-FPM: fresh world per request
$count = 0;          // reborn as 0 EVERY request
$count++;

echo "count: {$count}";
// request 1 -> count: 1
// request 2 -> count: 1  (state was erased)
// persistence requires a DB, cache, or session`,
      ts: `# counter.py — one process serves all requests
from fastapi import FastAPI

app = FastAPI()
count = 0            # loaded ONCE at startup

@app.get("/count")
async def counter():
    global count
    count += 1
    return {"count": count}
# request 1 -> {"count": 1}
# request 2 -> {"count": 2}  (state persisted!)
# ...and each worker process has its OWN count`,
      note:
        "PHP's shared-nothing resets everything; Python's process keeps it. That's a feature (connection pools) and a trap (per-user data in globals, slow leaks) — and with N workers the 'shared' state isn't even shared.",
    },
    {
      label: "A typed route: Laravel controller vs FastAPI handler",
      intro:
        "GET /todos/42 returns a todo, validating that the id is an integer. Compare where the validation logic lives.",
      php: `<?php
// routes/api.php + app/Http/Controllers/TodoController.php
Route::get('/todos/{id}', [TodoController::class, 'show'])
    ->whereNumber('id');

class TodoController extends Controller
{
    public function show(int $id): JsonResponse
    {
        return response()->json([
            'todo_id' => $id,
            'title'   => "Task #{$id}",
        ]);
    }
}`,
      ts: `# main.py — the signature IS the validation
from fastapi import FastAPI

app = FastAPI()

@app.get("/todos/{todo_id}")
async def read_todo(todo_id: int):
    return {"todo_id": todo_id, "title": f"Task #{todo_id}"}

# GET /todos/42  -> 200 {"todo_id": 42, ...}
# GET /todos/abc -> 422 with a structured error body
# + OpenAPI docs generated at /docs, for free`,
      note:
        "Laravel splits route, constraint and controller; FastAPI derives routing, coercion, 422 validation and OpenAPI docs from one decorated, type-annotated function.",
    },
    {
      label: "Querying: Eloquent vs the Django ORM",
      intro:
        "Fetch open todos for a user, newest first. Both are ActiveRecord-flavoured ORMs riding on model classes.",
      php: `<?php
// Eloquent (Laravel)
$todos = Todo::where('done', false)
    ->where('user_id', $userId)
    ->orderByDesc('created_at')
    ->limit(10)
    ->get();

$todo = Todo::findOrFail(42);
$todo->update(['done' => true]);`,
      ts: `# Django ORM
todos = (Todo.objects
    .filter(done=False, user_id=user_id)
    .order_by("-created_at")[:10])

todo = Todo.objects.get(pk=42)   # raises DoesNotExist
todo.done = True
todo.save()

# querysets are lazy: no SQL runs until iterated`,
      note:
        "Model.objects.filter(...) chains like Eloquent's where(...); '-field' spells descending, slicing spells limit, and querysets stay lazy until you iterate them.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A toy framework in ~25 lines of pure stdlib: decorators register handlers into a route table at import time, and one long-lived process serves every request. Predict the route table and what /health reports.",
    code: `# A toy web framework in pure stdlib: decorators register handlers
# into a route table, and ONE process serves every "request".
routes = {}

def get(path):
    def register(fn):
        routes[("GET", path)] = fn
        return fn                      # unchanged; registration is the side effect
    return register

hits = 0                               # lives as long as the process does

@get("/todos/{todo_id}")
def read_todo(todo_id: int):
    return {"todo_id": todo_id, "title": f"Task #{todo_id}"}

@get("/health")
def health():
    return {"status": "ok", "requests_served": hits}

def handle(method, path, **params):
    global hits
    hits += 1
    handler = routes.get((method, path))
    if handler is None:
        return {"error": 404}
    return handler(**params)

print(f"route table: {sorted(p for _, p in routes)}")
print(handle("GET", "/todos/{todo_id}", todo_id=42))
print(handle("GET", "/todos/{todo_id}", todo_id=7))
print(handle("GET", "/health"))        # state survived earlier requests
print(handle("POST", "/todos/{todo_id}", todo_id=1))`,
    output: `route table: ['/health', '/todos/{todo_id}']
{'todo_id': 42, 'title': 'Task #42'}
{'todo_id': 7, 'title': 'Task #7'}
{'status': 'ok', 'requests_served': 3}
{'error': 404}`,
  },

  keyPoints: [
    "The headline: PHP-FPM rebuilds a fresh, shared-nothing world per request; a Python web app is one long-running process — state persists, leaks accumulate, globals are dangerous, and deploys restart processes.",
    "WSGI is the older sync server↔app contract, ASGI the async one; PHP's only real cousins are Swoole/FrankenPHP worker mode.",
    "The map: Django ≈ Laravel (ORM, migrations, auth, admin), Flask ≈ Slim (micro), FastAPI ≈ modern API-first with type-hint-driven validation.",
    "In FastAPI, `@app.get(\"/todos/{todo_id}\")` on `def read_todo(todo_id: int)` gives routing, type coercion, 422 validation (Pydantic) and OpenAPI docs from one signature.",
    "Django's `Todo.objects.filter(done=False)` ≈ Eloquent's `Todo::where('done', false)->get()` — lazy querysets, `-field` for descending, slices for limit.",
    "Serving: uvicorn (ASGI) or gunicorn (WSGI) behind nginx ≈ php-fpm behind nginx; templates: Jinja2 ≈ Twig, same designer lineage.",
  ],

  interview: [
    {
      q: "What's the biggest architectural difference between deploying PHP and Python web apps?",
      a: "The process model. PHP-FPM is shared-nothing: every request gets a fresh interpreter world, so state can't leak between requests and a deploy is essentially copying files. A Python app is one long-running process (usually a small pool under uvicorn or gunicorn, behind nginx — same topology as php-fpm): the code loads once, module-level state persists across requests, memory leaks accumulate, and deploys mean restarting workers. Practically that means I treat globals as shared infrastructure only — connection pools yes, per-user data never — and remember that with four workers, 'global' state isn't even global.",
    },
    {
      q: "Map the Python web frameworks onto the PHP ecosystem.",
      a: "Django is Laravel: full batteries — ORM with migrations, auth, forms, templates, and an auto-generated admin that Laravel doesn't even match out of the box. Flask is Slim: a micro-framework giving routing and request/response, with everything else chosen à la carte; its Jinja2 templates feel like Twig because Twig came from the same design lineage. FastAPI has no direct Laravel analogue: an API-first ASGI framework where the type hints on your handler *are* the validation layer via Pydantic, plus free OpenAPI docs. For a JSON API today I'd default to FastAPI; for an app with admin/auth/HTML, Django.",
    },
    {
      q: "What are WSGI and ASGI, and does PHP have an equivalent?",
      a: "They're standard contracts between web servers and Python applications, so any server can run any framework. WSGI is the original synchronous one — one request per worker thread/process, Flask and classic Django. ASGI is its async successor — handlers can be `async def`, one worker can multiplex many I/O-bound requests, and websockets become possible; FastAPI is ASGI-native. PHP has no real equivalent because FPM owns that boundary and hides it from you. The nearest PHP cousins are Swoole and FrankenPHP's worker mode, which make PHP long-running — and immediately re-import Python's globals-and-leaks caveats.",
    },
    {
      q: "In FastAPI, what does declaring `todo_id: int` on a path handler actually do?",
      a: "Three jobs from one annotation. Routing/coercion: the `{todo_id}` path segment is converted to int before my function runs. Validation: a non-integer like `/todos/abc` never reaches my code — FastAPI returns a structured 422, powered by Pydantic. Documentation: the parameter appears typed in the auto-generated OpenAPI schema and the interactive /docs UI. In Laravel terms it collapses the route constraint (`whereNumber`), a slice of FormRequest validation, and API doc annotations into the function signature itself — the practical payoff of Python's type-hint system.",
    },
  ],

  quiz: [
    {
      question: "A module-level dict in a FastAPI app is written to during a request. What happens on the next request?",
      options: [
        "It's reset — Python is shared-nothing like PHP-FPM",
        "The data is still there if the same worker process serves the request",
        "FastAPI raises an error — module state is read-only",
        "It's automatically persisted to Redis",
      ],
      answerIndex: 1,
      explain:
        "A Python web app is a long-running process: module state survives across requests within a worker. That's the core contrast with PHP-FPM's fresh-world-per-request — useful for pools, dangerous for per-user data, and inconsistent across multiple workers.",
    },
    {
      question: "Which mapping between the ecosystems is most accurate?",
      options: [
        "Flask ≈ Laravel, Django ≈ Slim, FastAPI ≈ WordPress",
        "Django ≈ Laravel, Flask ≈ Slim, FastAPI ≈ type-driven API framework",
        "Django ≈ Symfony Console, Flask ≈ Eloquent, FastAPI ≈ Blade",
        "All three are ORMs with different template engines",
      ],
      answerIndex: 1,
      explain:
        "Django is the batteries-included Laravel analogue (ORM, auth, admin, migrations), Flask the Slim-style micro-framework, and FastAPI the API-first framework whose Pydantic-powered validation is driven by type hints.",
    },
    {
      question: "In FastAPI, `GET /todos/abc` hits `def read_todo(todo_id: int)`. What happens?",
      options: [
        "todo_id arrives as the string 'abc'",
        "A 500 error from an uncaught TypeError",
        "A 422 response with a structured validation error — your code never runs",
        "FastAPI casts 'abc' to 0",
      ],
      answerIndex: 2,
      explain:
        "The type hint drives Pydantic validation at the boundary: non-coercible input is rejected with a 422 and error details before the handler executes — the annotation acts like a Laravel FormRequest rule.",
    },
    {
      question: "What role does uvicorn play in a deployed FastAPI app?",
      options: [
        "It's the template engine, like Blade",
        "It's the ASGI server holding your app in memory, typically behind nginx — the php-fpm slot",
        "It compiles Python to machine code for speed",
        "It's a database migration runner",
      ],
      answerIndex: 1,
      explain:
        "uvicorn is an ASGI server: it loads your app object once and keeps worker processes serving requests behind a reverse proxy like nginx — the same topology as nginx + php-fpm, except the workers are long-lived and hold application state.",
    },
  ],
};

export default lesson;
