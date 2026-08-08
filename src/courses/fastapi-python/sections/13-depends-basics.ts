import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "depends-basics",
  title: "Dependency Injection with Depends",
  part: "Dependencies & Architecture",
  estMinutes: 12,
  summary:
    "A dependency is just a callable FastAPI runs for you per request — declare it with Annotated[..., Depends(fn)] and the result is injected, its parameters documented, and its value cached for the request.",

  concept: `
\`Depends\` is FastAPI's killer feature, and the mental model is one sentence:
**a dependency is just a callable whose own parameters are resolved exactly
like a path operation's.**

### The canonical example: shared pagination

Every list endpoint needs \`q\`, \`skip\`, \`limit\`. Instead of repeating them:

\`\`\`python
from typing import Annotated
from fastapi import Depends, FastAPI

app = FastAPI()

async def common_parameters(q: str | None = None, skip: int = 0, limit: int = 100):
    return {"q": q, "skip": skip, "limit": limit}

@app.get("/items/")
async def read_items(commons: Annotated[dict, Depends(common_parameters)]):
    return commons

@app.get("/users/")
async def read_users(commons: Annotated[dict, Depends(common_parameters)]):
    return commons
\`\`\`

Per request, FastAPI sees \`Depends(common_parameters)\`, resolves *that
function's* parameters from the request (three query params, with defaults and
validation), calls it, and hands the result to your endpoint as \`commons\`.

Two things fall out of "resolved like a path operation's":

- **The dependency's parameters become documented API surface.** \`q\`, \`skip\`
  and \`limit\` show up in the OpenAPI docs for */items/* and */users/*,
  validated like any query params — a bad \`skip=abc\` is a 422 before your
  code runs.
- **Dependencies compose.** A dependency can itself declare dependencies,
  because the resolution is recursive. (That graph is its own section.)

### The Laravel comparison, precisely

You know this move: type-hint a parameter on a controller method and the
container injects it. \`Depends\` is that, with three differences worth saying
in an interview:

1. **No registration.** No service provider, no container bindings — the
   "wiring" is the function reference in \`Depends(...)\` itself.
2. **Per-request by design.** Laravel's container defaults to resolving
   singletons-or-new per bind config; FastAPI dependencies run per request,
   which is what request-scoped things (current user, pagination, DB session)
   actually want.
3. **It feeds the docs.** The container's work is visible in the OpenAPI
   schema. Laravel's container is invisible to any API documentation.

### Annotated is the modern spelling

\`Annotated[dict, Depends(common_parameters)]\` has been the documented default
since FastAPI 0.95. You will still meet the older spelling in codebases:

\`\`\`python
async def read_items(commons: dict = Depends(common_parameters)):  # legacy style
\`\`\`

It works, but \`Annotated\` is preferred: the default-value trick confuses other
tools (calling the function yourself, type checkers), while \`Annotated\` keeps
the type clean and lets you build **reusable aliases** — define
\`CommonsDep = Annotated[dict, Depends(common_parameters)]\` once and use it in
every signature.

### Cached per request

If the same dependency appears twice in one request — say two other
dependencies both need \`get_settings\` — FastAPI calls it **once** and reuses
the value for the rest of that request. It's a per-request cache, not a
singleton: the next request runs it fresh. Opt out with
\`Depends(fn, use_cache=False)\` when you genuinely need a fresh value each
time it's asked for.
`,

  comparisons: [
    {
      label: "Container injection vs Depends",
      intro:
        "Request-scoped injection in both frameworks: Laravel resolves a type-hinted class through the container; FastAPI calls the function named in Depends. Both give the endpoint a ready-made object.",
      php: `<?php
// Laravel: the container resolves type-hinted params.
// Binding configured in a service provider elsewhere:
// $this->app->bind(ReportService::class, ...);

class ReportController extends Controller
{
    public function index(Request $request, ReportService $reports)
    {
        // $reports was built by the container
        return response()->json($reports->forUser($request->user()));
    }
}`,
      ts: `# app/main.py
from typing import Annotated
from fastapi import Depends, FastAPI

app = FastAPI()

async def get_report_service() -> "ReportService":
    return ReportService()  # built fresh for this request

@app.get("/reports")
async def index(
    reports: Annotated[ReportService, Depends(get_report_service)],
):
    return reports.for_user()`,
      note:
        "Same ergonomics, no registration step: the provider function IS the binding. And it's per-request by construction — no singleton/scoped/bind decisions to configure.",
    },
    {
      label: "Shared pagination params",
      intro:
        "Reusable q/skip/limit handling for every list endpoint. Laravel reads and clamps the request by hand (or via a FormRequest); FastAPI declares one dependency and reuses it.",
      php: `<?php
// Laravel controller -- repeated in every list action,
// or extracted to a trait/FormRequest you wire up yourself
public function index(Request $request)
{
    $q     = $request->query('q');
    $skip  = max(0, (int) $request->query('skip', 0));
    $limit = min(100, (int) $request->query('limit', 100));

    return Item::query()
        ->when($q, fn ($b) => $b->where('name', 'like', "%{$q}%"))
        ->skip($skip)->take($limit)->get();
}`,
      ts: `# app/deps.py
from typing import Annotated
from fastapi import Depends, FastAPI

async def common_parameters(
    q: str | None = None, skip: int = 0, limit: int = 100
):
    return {"q": q, "skip": skip, "limit": limit}

CommonsDep = Annotated[dict, Depends(common_parameters)]

app = FastAPI()

@app.get("/items/")
async def read_items(commons: CommonsDep):
    return {"params": commons}

@app.get("/users/")
async def read_users(commons: CommonsDep):
    return {"params": commons}`,
      note:
        "The dependency's q/skip/limit surface as documented, validated query params on BOTH endpoints in the OpenAPI docs — the reuse is visible to API consumers, not just to your code.",
    },
    {
      label: "Legacy default-value style vs modern Annotated",
      intro:
        "Two spellings of the same dependency, both Python. You'll read the left in older codebases; write the right.",
      php: `# Older style: Depends as a default value.
# Works, still common in tutorials and legacy code.
from fastapi import Depends, FastAPI

app = FastAPI()

@app.get("/items/")
async def read_items(
    commons: dict = Depends(common_parameters),
):
    return commons

# Downsides: the "default" is a lie (there's no real
# default), and you can't reuse the pairing elsewhere.`,
      ts: `# Modern style (default since FastAPI 0.95): Annotated.
from typing import Annotated
from fastapi import Depends, FastAPI

app = FastAPI()

CommonsDep = Annotated[dict, Depends(common_parameters)]

@app.get("/items/")
async def read_items(commons: CommonsDep):
    return commons

# The type stays honest, editors/type-checkers agree,
# and the alias is defined once, reused everywhere.`,
      note:
        "Annotated attaches the Depends metadata to the type instead of abusing the default value — and it enables module-level aliases, the idiom modern FastAPI codebases standardise on.",
      leftLang: "python",
      rightLang: "python",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Depends() in miniature: resolve() reads each callable's signature with inspect, recursively builds its arguments from a fake request, and caches results per request. Both pagination and db need settings — predict how many times get_settings runs per request.",
    code: `import inspect

# Depends() in miniature: a dependency is just a callable. The
# resolver reads each function's signature, builds its arguments
# (recursively), and caches every result for the request.

def get_settings():
    print("  run get_settings")
    return {"max_size": 50}

def get_pagination(request, settings):
    print("  run get_pagination")
    size = min(request["size"], settings["max_size"])
    return {"skip": request["skip"], "size": size}

def get_db(settings):
    print("  run get_db")
    return "session(max=" + str(settings["max_size"]) + ")"

PROVIDERS = {"settings": get_settings, "pagination": get_pagination, "db": get_db}

def resolve(func, request, cache):
    kwargs = {}
    for name in inspect.signature(func).parameters:
        if name == "request":
            kwargs[name] = request           # the incoming request itself
        elif name in cache:
            print(f"  cache hit: {name}")    # same dep twice -> runs once
            kwargs[name] = cache[name]
        else:
            kwargs[name] = resolve(PROVIDERS[name], request, cache)
            cache[name] = kwargs[name]
    return func(**kwargs)

# The "path operation": needs pagination and db; BOTH need settings.
def list_items(pagination, db):
    return f"SELECT ... LIMIT {pagination['size']} OFFSET {pagination['skip']} via {db}"

print("request 1: GET /items?skip=0&size=100")
print(resolve(list_items, {"skip": 0, "size": 100}, cache={}))
print("request 2: GET /items?skip=20&size=10")
print(resolve(list_items, {"skip": 20, "size": 10}, cache={}))`,
    output: `request 1: GET /items?skip=0&size=100
  run get_settings
  run get_pagination
  cache hit: settings
  run get_db
SELECT ... LIMIT 50 OFFSET 0 via session(max=50)
request 2: GET /items?skip=20&size=10
  run get_settings
  run get_pagination
  cache hit: settings
  run get_db
SELECT ... LIMIT 10 OFFSET 20 via session(max=50)`,
  },

  keyPoints: [
    "A dependency is just a callable; `commons: Annotated[dict, Depends(common_parameters)]` makes FastAPI call it per request and inject the result.",
    "The dependency's own parameters are resolved like a path operation's — so `q`/`skip`/`limit` inside it become validated, documented query params in OpenAPI.",
    "It's Laravel container autowiring without registration: the function reference in `Depends(...)` is the binding, and everything is request-scoped by design.",
    "Annotated is the modern spelling (documented default since FastAPI 0.95); `commons: dict = Depends(...)` is legacy you'll read but shouldn't write.",
    "Dependencies are cached per request: the same dependency needed twice runs once, and the cache dies with the request. Opt out with `Depends(fn, use_cache=False)`.",
    "Module-level aliases (`CommonsDep = Annotated[dict, Depends(common_parameters)]`) let you define the pairing once and reuse it across endpoints.",
  ],

  interview: [
    {
      q: "Explain FastAPI's dependency injection to someone who knows Laravel.",
      a: "It's the container's method injection, minus the container configuration. In Laravel I type-hint `ReportService` on a controller method and the container builds it, following whatever bindings a service provider registered. In FastAPI I write `reports: Annotated[ReportService, Depends(get_report_service)]` — the provider function replaces the binding, so there's no registration layer at all. Two upgrades over the Laravel version: it's per-request by construction, which is what request-scoped things like the current user or a DB session want; and the dependency's own parameters get resolved from the request, so they become validated, documented parts of the OpenAPI schema. The container's work is visible in the API docs.",
    },
    {
      q: "How does FastAPI treat a dependency that's required by several places within one request?",
      a: "It runs once. FastAPI keeps a per-request cache keyed by the dependency, so if two endpoints' sub-dependencies both declare `Depends(get_settings)`, the function executes on first use and the cached value is injected everywhere else in that request. It's not a singleton — the next request starts with an empty cache and runs it fresh. If a particular consumer needs a genuinely fresh value each time, it opts out at the declaration site with `Depends(get_settings, use_cache=False)`. This makes shared dependencies free to declare liberally, which is what makes the dependency-graph style practical.",
    },
    {
      q: "Why does modern FastAPI prefer Annotated[dict, Depends(fn)] over commons: dict = Depends(fn)?",
      a: "The old style smuggles the injection instruction into the parameter's default value, which is a lie — `Depends(fn)` isn't a usable default if you call the function directly, and type checkers and editors have to special-case it. `Annotated` puts the metadata where metadata belongs, on the type, so the signature stays honest. It also unlocks the aliasing idiom: `CommonsDep = Annotated[dict, Depends(common_parameters)]` defined once at module level and reused in every endpoint, which you can't do with the default-value form. It's been the documented default since FastAPI 0.95, so the `= Depends()` form is legacy you read, not write.",
    },
  ],

  quiz: [
    {
      question: "What can be a FastAPI dependency?",
      options: [
        "Only async functions registered with the app",
        "Only classes decorated with @injectable",
        "Any callable — FastAPI resolves its parameters like a path operation's and injects its return value",
        "Only functions that take the Request object",
      ],
      answerIndex: 2,
      explain:
        "The whole model is 'a dependency is just a callable': plain functions, async functions, classes, instances with __call__. FastAPI inspects its signature, resolves those parameters from the request (recursively), calls it, and injects the result. No registration anywhere.",
    },
    {
      question:
        "common_parameters(q, skip, limit) is used via Depends on /items/. Where do q, skip and limit appear?",
      options: [
        "Nowhere — dependency internals are hidden from clients",
        "As validated query parameters of /items/ in the OpenAPI docs",
        "As required headers on /items/",
        "Only in the dependency's own /common_parameters route",
      ],
      answerIndex: 1,
      explain:
        "A dependency's parameters are resolved exactly like an endpoint's, so its query params become part of each consuming route's documented, validated interface — invalid values 422 before your code runs. Dependencies don't get routes of their own.",
    },
    {
      question:
        "Within a single request, get_settings is declared as a dependency by three different sub-dependencies. How many times does it run?",
      options: [
        "Three times — once per declaration",
        "Once — results are cached for the lifetime of the app",
        "Once — results are cached per request, unless use_cache=False",
        "Zero — settings dependencies are resolved at startup",
      ],
      answerIndex: 2,
      explain:
        "FastAPI caches each dependency's result for the duration of the request, so shared nodes in the graph execute once. The cache is per request, not global — the next request re-runs it — and any consumer can opt out with Depends(fn, use_cache=False).",
    },
  ],
};

export default lesson;
