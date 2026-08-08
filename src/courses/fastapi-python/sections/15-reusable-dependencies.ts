import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "reusable-dependencies",
  title: "Sub-Dependencies & Reusable Aliases",
  part: "Dependencies & Architecture",
  estMinutes: 12,
  summary:
    "Dependencies compose into a per-request graph — get_current_user depends on the token dep, which depends on settings — and Annotated aliases plus router-level dependencies=[...] turn that graph into your middleware/guard layer.",

  concept: `
Dependencies can declare dependencies. That single fact turns \`Depends\` from
a parameter-sharing trick into the **architecture of the whole request**: a
typed graph FastAPI resolves per request, caching shared nodes.

### Sub-dependencies: the auth chain

The classic three-level chain:

\`\`\`python
from typing import Annotated
from fastapi import Depends, FastAPI, Header, HTTPException

def get_settings() -> Settings:
    return Settings()                      # level 3

def get_token(
    authorization: Annotated[str, Header()],   # the Authorization header
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:                                  # level 2
    token = authorization.removeprefix("Bearer ")
    if not valid(token, settings.secret):
        raise HTTPException(status_code=401, detail="Invalid token")
    return token

def get_current_user(
    token: Annotated[str, Depends(get_token)],
) -> User:                                 # level 1
    return lookup_user(token)
\`\`\`

The endpoint declares only \`Depends(get_current_user)\`; FastAPI walks the
graph — user needs token, token needs settings — resolving depth-first. If
\`get_db\` elsewhere in the same request also needs \`settings\`, the per-request
cache means \`get_settings\` still runs **once**.

### Aliases: define once, use everywhere

Writing \`Annotated[User, Depends(get_current_user)]\` in forty signatures is
noise. The modern idiom is a module-level alias:

\`\`\`python
CurrentUser = Annotated[User, Depends(get_current_user)]
SessionDep = Annotated[Session, Depends(get_db)]

@app.get("/me")
async def read_me(user: CurrentUser):
    return user

@app.post("/orders")
async def create_order(user: CurrentUser, db: SessionDep):
    ...
\`\`\`

This is the house style of current FastAPI codebases (the official templates
use it): a \`deps.py\` full of aliases is the API's capability vocabulary —
\`CurrentUser\`, \`SessionDep\`, \`Pagination\` — each one line to consume.

### Dependencies for side effects only

Sometimes you need the *check*, not the value — verify an API key, enforce a
role. Declaring a parameter you never read is ugly, so the decorator takes a
\`dependencies\` list:

\`\`\`python
@app.get("/admin/stats", dependencies=[Depends(verify_admin)])
async def admin_stats():
    return {"ok": True}
\`\`\`

\`verify_admin\` runs (and can raise 401/403) but injects nothing. The same
parameter exists at every level of scope:

\`\`\`python
router = APIRouter(prefix="/admin", dependencies=[Depends(verify_admin)])
app = FastAPI(dependencies=[Depends(verify_api_key)])  # global
\`\`\`

Router-level dependencies are Laravel's route-group middleware —
\`Route::middleware('can:admin')->prefix('admin')->group(...)\` — and app-level
dependencies are global middleware. Same layering, but each guard is an
ordinary typed function you can also inject for its value elsewhere, and its
requirements (headers, tokens) appear in the OpenAPI docs.

### The interview frame

This graph **is** the middleware/guard layer of a PHP framework, rebuilt on
three properties worth naming: it's **typed** (guards return values that flow
into handlers — middleware can only stash attributes on the request), it's
**per-route granular** (each endpoint states exactly what it needs), and it's
**deduplicated** (shared nodes run once per request via the cache). Auth,
tenancy, rate-limit checks, DB sessions — in FastAPI they're all just nodes
in one dependency graph.
`,

  comparisons: [
    {
      label: "Auth guard: middleware chain vs dependency chain",
      intro:
        "Getting 'the authenticated user' into a handler. Laravel runs auth middleware and you fetch the user from the request; FastAPI resolves a typed chain and hands you the user as a parameter.",
      php: `<?php
// routes/api.php
Route::middleware('auth:sanctum')->get('/me', [MeController::class, 'show']);

// app/Http/Controllers/MeController.php
class MeController extends Controller
{
    public function show(Request $request)
    {
        // middleware ran somewhere upstream; the user is
        // an untyped attribute you pull off the request
        return response()->json($request->user());
    }
}`,
      ts: `# app/deps.py
from typing import Annotated
from fastapi import Depends, Header, HTTPException

def get_token(authorization: Annotated[str, Header()] = "") -> str:
    token = authorization.removeprefix("Bearer ")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token

def get_current_user(token: Annotated[str, Depends(get_token)]) -> User:
    return lookup_user(token)

CurrentUser = Annotated[User, Depends(get_current_user)]

# app/main.py
@app.get("/me")
async def read_me(user: CurrentUser):
    return user   # typed User, injected, 401 already handled`,
      note:
        "Both short-circuit unauthenticated requests before the handler. The difference: the FastAPI guard RETURNS a typed value into the signature, while middleware communicates via untyped request attributes.",
    },
    {
      label: "Route-group middleware vs router-level dependencies",
      intro:
        "Protect a whole admin section with one declaration. Laravel groups routes under middleware; FastAPI gives the router a dependencies list.",
      php: `<?php
// routes/api.php -- every route in the group runs the guards
Route::prefix('admin')
    ->middleware(['auth:sanctum', 'can:admin'])
    ->group(function () {
        Route::get('/stats', [AdminController::class, 'stats']);
        Route::get('/users', [AdminController::class, 'users']);
    });`,
      ts: `# app/routers/admin.py
from fastapi import APIRouter, Depends, HTTPException

def verify_admin(user: CurrentUser):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

router = APIRouter(
    prefix="/admin",
    dependencies=[Depends(verify_admin)],  # runs for every route below
)

@router.get("/stats")
async def stats():
    return {"orders": 42}

@router.get("/users")
async def users():
    return []`,
      note:
        "dependencies=[...] on the router (or on FastAPI(...) for global scope) runs the callables for every enclosed route, values discarded — a guard, not an injection. verify_admin itself composes on CurrentUser, so the whole auth chain still runs and caches normally.",
    },
    {
      label: "Repeated wiring vs a module-level alias",
      intro:
        "Both columns are FastAPI. The left repeats the full Annotated form in every endpoint; the right defines the vocabulary once in deps.py.",
      php: `# Repetitive: full form in every signature
from typing import Annotated
from fastapi import Depends

@app.get("/me")
async def read_me(
    user: Annotated[User, Depends(get_current_user)],
):
    return user

@app.post("/orders")
async def create_order(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    ...`,
      ts: `# app/deps.py -- the API's capability vocabulary
from typing import Annotated
from fastapi import Depends

CurrentUser = Annotated[User, Depends(get_current_user)]
SessionDep = Annotated[Session, Depends(get_db)]

# app/main.py -- one word per capability
@app.get("/me")
async def read_me(user: CurrentUser):
    return user

@app.post("/orders")
async def create_order(user: CurrentUser, db: SessionDep):
    ...`,
      note:
        "An Annotated alias is just a type-level constant — zero runtime cost, one place to change the wiring, and endpoint signatures read as a list of capabilities.",
      leftLang: "python",
      rightLang: "python",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A three-level chain resolved recursively: user needs token, token needs settings — and db needs settings too. Predict the resolution tree, and whether get_settings runs once or twice for the request.",
    code: `import inspect

# A three-level dependency chain, resolved the way FastAPI resolves
# Depends(): user -> token -> settings, plus db -> settings.
# The shared settings node runs ONCE thanks to the request cache.

def get_settings():
    return {"secret": "tok_123", "db_url": "sqlite://"}

def get_token(request, settings):
    auth = request["headers"].get("authorization", "")
    token = auth.removeprefix("Bearer ")
    return token if token == settings["secret"] else None

def get_current_user(token):
    return {"username": "jason", "role": "admin"} if token else None

def get_db(settings):
    return "session(" + settings["db_url"] + ")"

PROVIDERS = {
    "settings": get_settings,
    "token": get_token,
    "user": get_current_user,
    "db": get_db,
}

def resolve(func, request, cache, depth=1):
    kwargs = {}
    for name in inspect.signature(func).parameters:
        if name == "request":
            kwargs[name] = request
        elif name in cache:
            print("  " * depth + f"{name}: cache hit")
            kwargs[name] = cache[name]
        else:
            print("  " * depth + f"{name}: run {PROVIDERS[name].__name__}")
            kwargs[name] = resolve(PROVIDERS[name], request, cache, depth + 1)
            cache[name] = kwargs[name]
    return func(**kwargs)

def read_profile(user, db):
    return f"200 {user['username']} ({user['role']}) via {db}"

request = {"headers": {"authorization": "Bearer tok_123"}}
print("GET /me")
print(resolve(read_profile, request, cache={}))`,
    output: `GET /me
  user: run get_current_user
    token: run get_token
      settings: run get_settings
  db: run get_db
    settings: cache hit
200 jason (admin) via session(sqlite://)`,
  },

  keyPoints: [
    "Dependencies compose: `get_current_user` depends on `get_token`, which depends on `get_settings` — FastAPI resolves the graph depth-first per request.",
    "Shared nodes run once: the per-request cache means `get_settings` used by both the token dep and `get_db` executes a single time in a request.",
    "Module-level aliases are the modern idiom: `CurrentUser = Annotated[User, Depends(get_current_user)]` in a `deps.py`, then `user: CurrentUser` everywhere.",
    "For checks without values, use `dependencies=[Depends(verify_admin)]` on the path operation — it runs (and can raise) but injects nothing.",
    "The same list works at every scope: `APIRouter(dependencies=[...])` ≈ Laravel route-group middleware, `FastAPI(dependencies=[...])` ≈ global middleware.",
    "Interview frame: the dependency graph is a PHP framework's middleware/guard layer, but typed (guards return values into signatures), per-route granular, and deduplicated by the cache.",
  ],

  interview: [
    {
      q: "How would you implement authentication and authorization in FastAPI without middleware?",
      a: "As a dependency chain. A `get_token` dependency extracts and validates the bearer token — raising `HTTPException(401)` on failure, which short-circuits the request — and `get_current_user` depends on it and returns a typed `User`. I expose that as a module-level alias, `CurrentUser = Annotated[User, Depends(get_current_user)]`, so any endpoint needing the user writes one word. Authorization layers on top: a `verify_admin` dependency consumes `CurrentUser` and raises 403 for non-admins, attached as `dependencies=[Depends(verify_admin)]` on the admin `APIRouter` so every route in the group is guarded — the direct equivalent of Laravel's route-group middleware, except each guard is a typed, testable function and the request cache guarantees the user lookup runs once even if several dependencies need it.",
    },
    {
      q: "What's the difference between declaring a dependency as a parameter and putting it in the decorator's dependencies list?",
      a: "A parameter dependency — `user: Annotated[User, Depends(get_current_user)]` — runs the callable and injects its return value into the handler; you use it when you need the value. The `dependencies=[Depends(verify_key)]` list on a path operation, router, or the app runs the callables identically — same resolution, same caching, same ability to raise and abort the request — but discards their return values. That's for side-effect guards: verify an API key, enforce a role, count a rate limit. It also solves the linting problem of declaring a parameter you never read. Scope-wise: decorator = one route, `APIRouter(dependencies=...)` = a group, `FastAPI(dependencies=...)` = global.",
    },
    {
      q: "In one request, get_current_user and get_db both depend on get_settings. How many times does get_settings run, and why does that matter architecturally?",
      a: "Once. FastAPI caches each dependency's result for the duration of the request, so when the resolver reaches `get_settings` the second time it injects the cached value instead of calling it again — with `use_cache=False` available on a per-declaration basis if someone truly needs a fresh call. Architecturally this is what makes the graph style viable: you can declare dependencies wherever they're logically needed, without bookkeeping about who else needs them, and expensive shared nodes — settings parsing, the user lookup, a DB session — are still computed once. It removes the reason PHP apps push everything into one fat middleware 'so it only runs once'.",
    },
  ],

  quiz: [
    {
      question:
        "get_current_user depends on get_token, which depends on get_settings. An endpoint declares only Depends(get_current_user). What does FastAPI do?",
      options: [
        "Fails at startup — sub-dependencies must be declared on the endpoint too",
        "Resolves the whole chain per request: settings, then token, then user, injecting only the user",
        "Runs get_current_user with None for its parameters",
        "Resolves the chain once at startup and reuses the user for all requests",
      ],
      answerIndex: 1,
      explain:
        "Dependency resolution is recursive: each callable's own Depends parameters are resolved first, depth-first, on every request. The endpoint receives only what it declared — the User — while intermediate values live in the per-request cache. Nothing is resolved at startup.",
    },
    {
      question:
        "You need an API-key check on every route of a router, but no endpoint uses any value from it. What's the idiomatic approach?",
      options: [
        "Add key: Annotated[None, Depends(verify_key)] to every endpoint and ignore it",
        "Write ASGI middleware that wraps the router",
        "APIRouter(dependencies=[Depends(verify_key)]) — runs for every route, return value discarded",
        "Call verify_key() manually at the top of each endpoint",
      ],
      answerIndex: 2,
      explain:
        "The dependencies= list exists exactly for side-effect guards: the callables execute with full resolution and can raise 401/403 to abort, but inject nothing. On a router it covers the group (like Laravel route-group middleware); the same parameter works on a single decorator or on FastAPI() globally.",
    },
    {
      question:
        "What does CurrentUser = Annotated[User, Depends(get_current_user)] give you?",
      options: [
        "A cached global user object shared across requests",
        "A reusable type alias: endpoints write user: CurrentUser and get the resolved, typed dependency",
        "A subclass of User with dependency metadata",
        "A runtime wrapper that lazily fetches the user on attribute access",
      ],
      answerIndex: 1,
      explain:
        "It's a plain type-level alias bundling the annotation and the Depends metadata. Defined once in deps.py, it makes every consuming signature one word, keeps the wiring in a single place, and costs nothing at runtime — the resolution still happens per request as usual.",
    },
  ],
};

export default lesson;
