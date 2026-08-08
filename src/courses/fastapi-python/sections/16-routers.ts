import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "routers",
  title: "APIRouter: Splitting the App",
  part: "Dependencies & Architecture",
  estMinutes: 11,
  summary:
    "APIRouter lets you split path operations into modules with a shared prefix, tags, and dependencies, then merge them into the app with include_router — pure organisation, zero runtime cost.",

  concept: `
Every FastAPI tutorial starts with one \`main.py\` and every real project
outgrows it by week two. The escape hatch is \`APIRouter\`: a class with the
same decorator API as \`FastAPI\` itself (\`@router.get\`, \`@router.post\`, ...)
that you declare in its own module and later merge into the app. If you've
used Laravel's \`Route::prefix('users')->group(...)\` or put a \`#[Route('/users')]\`
attribute on a Symfony controller class, you already have the mental model.

### A router module

\`\`\`python
# app/routers/users.py
from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/")
def list_users():
    return [{"username": "ada"}]

@router.get("/{user_id}")
def read_user(user_id: int):
    return {"user_id": user_id}
\`\`\`

Everything you set in the constructor applies to every path operation on the
router: \`prefix="/users"\` means \`@router.get("/")\` serves \`GET /users/\`,
and \`tags=["users"]\` groups all of these endpoints under one collapsible
"users" heading in Swagger UI. Two more constructor parameters matter:

- \`dependencies=[Depends(verify_token)]\` — runs a dependency for **every**
  route on the router. This is your Laravel middleware group:
  \`Route::middleware('auth:sanctum')->group(...)\` becomes a router-wide
  auth dependency.
- \`responses={404: {"description": "Not found"}}\` — extra documented
  responses added to every route's OpenAPI entry.

### Merging into the app

\`\`\`python
# app/main.py
from fastapi import FastAPI
from app.routers import users, items

app = FastAPI()
app.include_router(users.router)
app.include_router(items.router)
\`\`\`

\`include_router\` **copies** the router's path operations onto the app —
prefixes joined, tags and dependencies combined. There is no per-request
dispatch through the router afterwards; a router is a mini-app that gets
flattened into the real one at startup. That means splitting into twenty
routers costs exactly nothing at runtime — it's purely organisational.

You can also pass \`prefix\`, \`tags\`, \`dependencies\`, and \`responses\` to
\`include_router\` itself. That's useful when you don't own the router module
(a shared package) or when the same router is mounted differently per project.

### Routers inside routers: versioning

\`include_router\` works on routers too, which is the standard way to build a
versioned API:

\`\`\`python
# app/api.py
api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(users.router)   # -> /api/v1/users/...
api_v1.include_router(items.router)   # -> /api/v1/items/...

app.include_router(api_v1)
\`\`\`

When v2 arrives, you create \`api_v2\`, include the routers that changed, and
both versions coexist. In Laravel you'd nest \`Route::prefix('api/v1')->group()\`
blocks; here the nesting is explicit objects you can import, test, and reuse.
`,

  comparisons: [
    {
      label: "A route group becomes a router module",
      intro:
        "Both sides group the user endpoints under a /users prefix with shared naming. Laravel does it in a routes file pointing at a controller; FastAPI puts the routes and handlers together in one importable module.",
      php: `<?php
// routes/api.php
use App\\Http\\Controllers\\UserController;

Route::prefix('users')->name('users.')->group(function () {
    Route::get('/', [UserController::class, 'index'])
        ->name('index');
    Route::get('/{user}', [UserController::class, 'show'])
        ->name('show');
    Route::post('/', [UserController::class, 'store'])
        ->name('store');
});`,
      ts: `# app/routers/users.py
from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/")
def list_users():
    return [{"username": "ada"}]

@router.get("/{user_id}")
def read_user(user_id: int):
    return {"user_id": user_id}

@router.post("/", status_code=201)
def create_user(username: str):
    return {"username": username}

# app/main.py
# app.include_router(users.router)`,
      note:
        "The router carries its own prefix and tags, and the handlers live next to their route declarations — no separate routes file to keep in sync with a controller class.",
    },
    {
      label: "Group middleware vs router-wide dependencies",
      intro:
        "Protect a whole admin section. Laravel attaches middleware to the group; FastAPI attaches a dependency to the router — it runs before every route on it.",
      php: `<?php
// routes/api.php
Route::prefix('admin')
    ->middleware(['auth:sanctum', 'can:admin'])
    ->group(function () {
        Route::get('/stats', [AdminController::class, 'stats']);
        Route::get('/users', [AdminController::class, 'users']);
    });`,
      ts: `# app/routers/admin.py
from fastapi import APIRouter, Depends, HTTPException

async def require_admin(user = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

@router.get("/stats")
def stats():
    return {"users": 42}

@router.get("/users")
def users():
    return []`,
      note:
        "dependencies=[...] on the router is the middleware group: require_admin runs (and can raise 403) before every route here, and its requirements appear in the OpenAPI docs for each one.",
    },
    {
      label: "API versioning by nesting",
      intro:
        "Mount the same feature routers under /api/v1. Laravel nests prefix groups; FastAPI includes routers inside a router.",
      php: `<?php
// routes/api.php
Route::prefix('api/v1')->group(function () {
    Route::prefix('users')->group(
        base_path('routes/api/users.php')
    );
    Route::prefix('items')->group(
        base_path('routes/api/items.php')
    );
});`,
      ts: `# app/api.py
from fastapi import APIRouter
from app.routers import users, items

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(users.router)
api_v1.include_router(items.router)

# app/main.py
from app.api import api_v1

app.include_router(api_v1)
# GET /api/v1/users/  ·  GET /api/v1/items/{item_id}`,
      note:
        "Prefixes compose: the app's include + api_v1's prefix + each router's own prefix. A v2 router can reuse unchanged feature routers verbatim.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "APIRouter in miniature: routes registered on a router are just stored records, and include_router copies them across, composing prefixes. Predict the final route table (sorted), then run it.",
    code: `# A miniature of FastAPI's APIRouter. A router stores route records;
# include_router copies them onto the parent, prepending prefixes.
# No dispatching happens through routers at runtime - they flatten.

class Router:
    def __init__(self, prefix="", tags=None):
        self.prefix = prefix
        self.tags = tags or []
        self.routes = []  # (method, path, handler_name, tags)

    def get(self, path):
        return self._register("GET", path)

    def post(self, path):
        return self._register("POST", path)

    def _register(self, method, path):
        def decorator(fn):
            self.routes.append(
                (method, self.prefix + path, fn.__name__, self.tags)
            )
            return fn
        return decorator

    def include_router(self, other, prefix=""):
        for method, path, name, tags in other.routes:
            self.routes.append(
                (method, self.prefix + prefix + path, name, tags)
            )


# --- app/routers/users.py ---
users = Router(prefix="/users", tags=["users"])

@users.get("/")
def list_users(): pass

@users.get("/{user_id}")
def read_user(): pass

@users.post("/")
def create_user(): pass

# --- app/routers/items.py ---
items = Router(prefix="/items", tags=["items"])

@items.get("/")
def list_items(): pass

# --- app/main.py: nest for versioning, then mount on the app ---
api_v1 = Router(prefix="/api/v1")
api_v1.include_router(users)
api_v1.include_router(items)

app = Router()  # the "app" is just a router with no prefix
app.include_router(api_v1)

@app.get("/health")
def health(): pass

for method, path, name, tags in sorted(app.routes):
    print(f"{method:<4} {path:<24} -> {name} {tags}")`,
    output: `GET  /api/v1/items/           -> list_items ['items']
GET  /api/v1/users/           -> list_users ['users']
GET  /api/v1/users/{user_id}  -> read_user ['users']
GET  /health                  -> health []
POST /api/v1/users/           -> create_user ['users']`,
  },

  keyPoints: [
    "`APIRouter` has the same decorator API as `FastAPI` — declare it in its own module (`app/routers/users.py`) and merge it with `app.include_router(users.router)`.",
    "Constructor options apply to every route on the router: `prefix=\"/users\"`, `tags=[\"users\"]` (Swagger UI grouping), `dependencies=[Depends(...)]` (≈ a Laravel middleware group), and `responses={...}` for shared OpenAPI docs.",
    "`include_router` copies the routes onto the app at startup — a router is a mini-app that gets flattened, so splitting into many routers has zero runtime cost.",
    "`include_router` also accepts `prefix`/`tags`/`dependencies`, so you can mount a router you don't own with project-specific settings.",
    "Routers nest: `api_v1 = APIRouter(prefix=\"/api/v1\")` then `api_v1.include_router(users.router)` is the standard `/api/v1` versioning pattern.",
    "PHP mapping: `APIRouter` ≈ `Route::prefix()->group()` plus the controller in one module; a router-wide dependency ≈ group middleware.",
  ],

  interview: [
    {
      q: "How do you structure routes in a FastAPI app that has outgrown a single main.py?",
      a: "I move each resource into its own module with an `APIRouter` — for example `app/routers/users.py` declares `router = APIRouter(prefix=\"/users\", tags=[\"users\"])` and defines its path operations with `@router.get` and friends. `main.py` then just calls `app.include_router(users.router)` for each module. The router carries shared configuration — prefix, tags for the docs, router-wide dependencies like auth, extra documented responses — so none of it is repeated per endpoint. It's the same idea as Laravel route groups or Symfony controller-level route attributes, except the routes and their handlers live together in one importable module.",
    },
    {
      q: "Does splitting an app into many routers affect performance?",
      a: "No. `include_router` copies the router's path operations onto the application at startup, composing prefixes and merging tags and dependencies. After that the app has one flat route table — requests are never dispatched *through* a router object. So routers are purely an organisational tool; twenty routers route exactly as fast as one big main.py.",
    },
    {
      q: "How would you apply authentication to a whole group of endpoints without repeating yourself?",
      a: "Pass it at the router level: `APIRouter(dependencies=[Depends(require_admin)])` runs that dependency before every route on the router, and it can raise `HTTPException(403)` to short-circuit. It's the FastAPI equivalent of wrapping a Laravel route group in `->middleware('auth')`. Because it's a dependency rather than opaque middleware, it also shows up in the OpenAPI schema for each affected endpoint, and I can override it in tests with `app.dependency_overrides`. If I don't control the router module, I can attach the same `dependencies` list when calling `include_router` instead.",
    },
    {
      q: "How do you version an API in FastAPI?",
      a: "Routers compose, so I create a version router — `api_v1 = APIRouter(prefix=\"/api/v1\")` — and `include_router` each feature router into it, then include `api_v1` on the app. Prefixes concatenate, so `users.router` with prefix `/users` ends up serving `/api/v1/users/...`. When v2 comes along I build an `api_v2` router that includes new versions of the routers that changed and reuses the ones that didn't, and both versions run side by side in the same app.",
    },
  ],

  quiz: [
    {
      question:
        "A router is declared as APIRouter(prefix=\"/users\") and included with app.include_router(router, prefix=\"/api/v1\"). What path does @router.get(\"/\") serve?",
      options: [
        "GET /users/",
        "GET /api/v1/users/",
        "GET /users/api/v1/",
        "It raises an error — you can't set prefix in both places",
      ],
      answerIndex: 1,
      explain:
        "Prefixes compose: the include_router prefix is prepended to the router's own prefix, giving /api/v1/users/. Setting a prefix in both places is normal — it's how versioned mounting works.",
    },
    {
      question:
        "What does dependencies=[Depends(verify_token)] in the APIRouter constructor do?",
      options: [
        "Injects verify_token's return value into every handler as a parameter",
        "Runs verify_token once at startup to validate configuration",
        "Runs verify_token before every route on the router; it can raise to reject the request",
        "Registers verify_token as ASGI middleware for the whole app",
      ],
      answerIndex: 2,
      explain:
        "Router-level dependencies execute for every path operation on the router — like Laravel group middleware. Their return values aren't passed to handlers (use a parameter-level dependency for that); they exist to enforce things and raise HTTPException when checks fail.",
    },
    {
      question: "What is the runtime cost of splitting an app into many routers?",
      options: [
        "One extra dispatch hop per router level on each request",
        "None — include_router flattens all routes onto the app at startup",
        "Slower startup but faster requests due to route caching",
        "It depends on whether the routers share a prefix",
      ],
      answerIndex: 1,
      explain:
        "include_router copies path operations onto the app, composing prefixes as it goes. Requests hit one flat route table; the router objects play no part in serving traffic.",
    },
    {
      question: "What do tags=[\"users\"] on an APIRouter actually affect?",
      options: [
        "URL matching — only requests with a ?tag=users query reach the router",
        "Grouping of the endpoints in the OpenAPI schema and Swagger UI",
        "The router's cache invalidation strategy",
        "Which middleware group the routes belong to",
      ],
      answerIndex: 1,
      explain:
        "Tags are pure documentation metadata: every endpoint on the router is listed under a collapsible \"users\" section in Swagger UI and tagged in the OpenAPI JSON. They have no routing or runtime behaviour.",
    },
  ],
};

export default lesson;
