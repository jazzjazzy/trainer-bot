import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "current-user-and-roles",
  title: "Auth Part 3: Current User & Roles",
  part: "Data & Auth",
  estMinutes: 12,
  summary:
    "The auth pieces assemble into a dependency chain — token to user to active-check to role-check — exposed as one CurrentUser annotation you drop into any endpoint that needs it.",

  concept: `
Token extraction and JWT validation are worthless until endpoints can say
"give me the logged-in user". In FastAPI that's a **dependency chain**, each
link depending on the previous one:

\`\`\`python
# deps.py — the guard layer, assembled
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    ...  # decode JWT, load user; ANY failure -> 401 credentials_exception

async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# The whole chain, named once:
CurrentUser = Annotated[User, Depends(get_current_active_user)]
\`\`\`

Now any endpoint opts into auth with one parameter:

\`\`\`python
@router.get("/users/me", response_model=UserPublic)
async def read_me(current_user: CurrentUser):
    return current_user
\`\`\`

The chain runs outside-in per request: \`oauth2_scheme\` extracts the Bearer
token (401 if absent), \`get_current_user\` validates it and loads the user
(401 on any failure), \`get_current_active_user\` rejects disabled accounts.
Endpoints that don't declare \`CurrentUser\` stay public — auth is opt-in and
visible in the signature, and because it's a declared security scheme, the
OpenAPI docs mark protected routes with a **padlock** automatically.

### Roles, option 1: a dependency factory

\`Depends\` takes anything callable. So a *function that returns a dependency*
gives you parameterised guards — the closure pattern PHP uses for middleware
with parameters (\`->middleware('role:admin')\`):

\`\`\`python
def require_role(role: str):
    async def checker(current_user: CurrentUser) -> User:
        if current_user.role != role:
            raise HTTPException(status_code=403,
                                detail=f"Requires role: {role}")
        return current_user
    return checker

@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    admin: Annotated[User, Depends(require_role("admin"))],
):
    ...
\`\`\`

\`require_role("admin")\` is *called* at declaration time and returns \`checker\`,
which closes over \`role\`. Note it builds on \`CurrentUser\`, so the full chain
still runs first.

### Roles, option 2: router-level dependencies

To protect a whole group of routes, attach dependencies to the router — like
wrapping a Laravel route group in middleware:

\`\`\`python
admin_router = APIRouter(
    prefix="/admin",
    dependencies=[Depends(require_role("admin"))],
)
\`\`\`

Every route on \`admin_router\` now runs the check first. Dependencies in the
\`dependencies=[...]\` list execute but their return values are discarded — use
this form when the endpoint doesn't need the user object, and a normal
parameter when it does.

### 401 vs 403 — the interview trap

- **401 Unauthorized** = "who are you?" — missing, malformed, expired, or
  invalid credentials. Send \`WWW-Authenticate: Bearer\` so clients know how to
  authenticate. Fix: log in (again).
- **403 Forbidden** = "I know exactly who you are, and you can't do this."
  Valid token, insufficient permissions. Re-authenticating won't help.

So \`get_current_user\` raises 401s, while \`require_role\` raises 403. (The
official tutorial uses 400 "Inactive user" for disabled accounts; 403 is also
defensible — be consistent and be able to justify the choice.)
`,

  comparisons: [
    {
      label: "Getting the authenticated user in an endpoint",
      intro:
        "Both give a handler the logged-in user. Laravel resolves it from the auth middleware's work; FastAPI declares the whole chain as one reusable annotated type.",
      php: `<?php
// Laravel: auth middleware ran earlier; the
// controller pulls the user out of the request
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/users/me', function (Request $request) {
        return new UserResource($request->user());
    });
});

// Or injected:
public function me(Request $request): UserResource
{
    $user = $request->user();  // set by middleware
    return new UserResource($user);
}`,
      ts: `# One alias names the whole chain:
# oauth2_scheme -> get_current_user
#   -> get_current_active_user
CurrentUser = Annotated[
    User, Depends(get_current_active_user)
]

@router.get("/users/me", response_model=UserPublic)
async def read_me(current_user: CurrentUser):
    return current_user

# No CurrentUser parameter -> route stays public.
# With it, OpenAPI shows a padlock on the route.`,
      note: "In Laravel the guard is configured away from the handler (route file); in FastAPI it's IN the signature — you can tell whether an endpoint is protected, and with what, by reading its parameters. The docs padlock comes free from the declared security scheme.",
    },
    {
      label: "Parameterised guards: middleware params vs dependency factory",
      intro:
        "Both express 'this route needs role X' with the role as a parameter. Laravel encodes it in a middleware string; FastAPI uses a function returning a closure.",
      php: `<?php
// Laravel: middleware with a parameter
Route::delete('/users/{id}', [UserController::class,
    'destroy'])->middleware('role:admin');

// app/Http/Middleware/EnsureRole.php
public function handle(Request $request,
                       Closure $next, string $role)
{
    if (!$request->user()->hasRole($role)) {
        abort(403, "Requires role: {$role}");
    }
    return $next($request);
}`,
      ts: `# Dependency factory: a function RETURNING
# a dependency, closed over the role
def require_role(role: str):
    async def checker(
        current_user: CurrentUser,
    ) -> User:
        if current_user.role != role:
            raise HTTPException(
                status_code=403,
                detail=f"Requires role: {role}")
        return current_user
    return checker

@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    admin: Annotated[User,
                     Depends(require_role("admin"))],
):
    db_delete_user(user_id)`,
      note: "require_role('admin') runs once at import time and returns checker; checker runs per request. Because checker itself depends on CurrentUser, the token→user→active chain executes before the role test — you compose guards by stacking dependencies.",
    },
    {
      label: "Protecting a whole router",
      intro:
        "An entire admin area behind one guard: Laravel wraps a route group in middleware; FastAPI passes dependencies=[...] to APIRouter.",
      php: `<?php
// routes/api.php — group-level middleware
Route::prefix('admin')
    ->middleware(['auth:sanctum', 'role:admin'])
    ->group(function () {
        Route::get('/stats', [AdminController::class,
            'stats']);
        Route::get('/users', [AdminController::class,
            'users']);
    });`,
      ts: `# routers/admin.py — router-level dependencies
admin_router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_role("admin"))],
)

@admin_router.get("/stats")
async def stats():
    # runs ONLY after the role check passed;
    # return value of the guard is discarded
    return {"users": 42}

@admin_router.get("/users")
async def list_users(current_user: CurrentUser):
    # still declare CurrentUser if you NEED the
    # user object; the guard result isn't injected
    return {"requested_by": current_user.username}`,
      note: "Router-level dependencies execute for every route but their return values are discarded — they guard, they don't inject. An endpoint that also needs the user object declares CurrentUser as a parameter (the resolved chain is cached per request, so it doesn't run twice).",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A simulator of the guard chain: three requests hit DELETE /users/9 — an admin token, a non-admin token, and a forged token. Predict how far each gets through token → user → active → role, and the final status codes (one 200, one 403, one 401).",
    code: `# The auth dependency chain in miniature:
# token -> get_current_user -> get_current_active_user -> require_role("admin").
# Three requests take three different paths through it.

TOKENS = {"tok-ada": "ada", "tok-bob": "bob"}  # stand-in for JWT decode
USERS = {
    "ada": {"username": "ada", "role": "admin", "disabled": False},
    "bob": {"username": "bob", "role": "user", "disabled": False},
}


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


def get_current_user(token: str) -> dict:
    username = TOKENS.get(token)
    if username is None:
        raise HTTPException(401, "Could not validate credentials")
    print("  get_current_user        -> " + username)
    return USERS[username]


def get_current_active_user(user: dict) -> dict:
    if user["disabled"]:
        raise HTTPException(400, "Inactive user")
    print("  get_current_active_user -> active")
    return user


def require_role(role: str):
    # Dependency FACTORY: returns a dependency closed over \`role\`.
    def checker(user: dict) -> dict:
        if user["role"] != role:
            raise HTTPException(403, "Requires role: " + role)
        print("  require_role(" + repr(role) + ")   -> ok")
        return user
    return checker


require_admin = require_role("admin")


def delete_user_endpoint(token: str) -> str:
    user = require_admin(get_current_active_user(get_current_user(token)))
    return "deleted (by " + user["username"] + ")"


for label, token in [("admin token", "tok-ada"), ("non-admin token", "tok-bob"), ("bad token", "tok-forged")]:
    print("DELETE /users/9 [" + label + "]")
    try:
        print("  => 200 " + delete_user_endpoint(token))
    except HTTPException as exc:
        print("  => " + str(exc.status_code) + " " + exc.detail)`,
    output: `DELETE /users/9 [admin token]
  get_current_user        -> ada
  get_current_active_user -> active
  require_role('admin')   -> ok
  => 200 deleted (by ada)
DELETE /users/9 [non-admin token]
  get_current_user        -> bob
  get_current_active_user -> active
  => 403 Requires role: admin
DELETE /users/9 [bad token]
  => 401 Could not validate credentials`,
  },

  keyPoints: [
    "Auth is a dependency chain: `oauth2_scheme` (extract token) → `get_current_user` (decode JWT + load user, 401 on any failure) → `get_current_active_user` (reject disabled accounts).",
    "Name the chain once — `CurrentUser = Annotated[User, Depends(get_current_active_user)]` — and any endpoint opts into auth by declaring one parameter.",
    "A dependency factory like `require_role(\"admin\")` is a function returning a dependency closed over its argument — the FastAPI equivalent of Laravel's `middleware('role:admin')`.",
    "Protect a whole router with `APIRouter(dependencies=[Depends(...)])` — those dependencies run for every route but their return values are discarded (guards, not injectors).",
    "401 means 'who are you?' (bad/missing credentials — include `WWW-Authenticate: Bearer`); 403 means 'I know who you are and you still can't' (valid token, insufficient permission).",
    "Protected routes get a padlock in the OpenAPI docs automatically because the security scheme is declared, not hidden in middleware.",
  ],

  interview: [
    {
      q: "How would you structure authentication and authorization in a FastAPI app?",
      a: "As a dependency chain. OAuth2PasswordBearer extracts the Bearer token; get_current_user depends on it, decodes the JWT and loads the user, collapsing every failure into a single 401 credentials_exception; get_current_active_user depends on that and rejects disabled accounts. I expose the chain as CurrentUser = Annotated[User, Depends(get_current_active_user)], so any endpoint gets auth by declaring one parameter — it's visible in the signature and the OpenAPI docs mark the route with a padlock. Authorization sits on top: a require_role factory returning a dependency for per-endpoint checks, or dependencies=[...] on an APIRouter to guard a whole admin section. Conceptually it's Laravel's auth middleware plus gates, but declared per-endpoint instead of configured in route files.",
    },
    {
      q: "What's the difference between HTTP 401 and 403, and where does each appear in your auth chain?",
      a: "401 Unauthorized answers 'who are you?' — the credentials are missing, malformed, expired, or invalid, and the response should carry WWW-Authenticate: Bearer to tell the client how to fix it: log in. 403 Forbidden answers 'you can't' — I validated the token, I know exactly who this is, and they lack permission; re-authenticating changes nothing. In the chain, oauth2_scheme and get_current_user raise 401s (missing header, bad signature, expired token, unknown user), while require_role raises 403. Getting these backwards is a classic review comment — a 401 from a role check wrongly invites the client to retry login forever.",
    },
    {
      q: "How do you implement 'this endpoint requires the admin role' in FastAPI?",
      a: "With a dependency factory: def require_role(role) defines an inner async checker that depends on CurrentUser, raises a 403 if the user's role doesn't match, and returns the user; require_role returns that checker. At the endpoint I write Annotated[User, Depends(require_role('admin'))] — the factory runs once at declaration time, the closure runs per request, and because it builds on CurrentUser the whole token-to-user chain executes first. It's the same closure trick as Laravel middleware parameters. For an entire admin area I'd instead pass dependencies=[Depends(require_role('admin'))] to the APIRouter, remembering that router-level dependencies guard but don't inject — their return values are discarded.",
    },
  ],

  quiz: [
    {
      question:
        "A request hits an endpoint guarded by require_role(\"admin\") with a valid, unexpired token belonging to a regular user. What should it receive?",
      options: [
        "401 with WWW-Authenticate: Bearer",
        "403 Forbidden",
        "400 Bad Request",
        "422 Unprocessable Entity",
      ],
      answerIndex: 1,
      explain:
        "Authentication succeeded — we know exactly who this is — so 401 would be wrong (it means 'credentials invalid, try authenticating'). Insufficient permission with valid identity is 403: re-authenticating won't help.",
    },
    {
      question:
        "What happens to the return values of dependencies passed as APIRouter(dependencies=[Depends(require_role(\"admin\"))])?",
      options: [
        "They're injected into every endpoint as the first parameter",
        "They're attached to request.state automatically",
        "They're discarded — router-level dependencies guard, they don't inject",
        "They're cached and reused as the response body",
      ],
      answerIndex: 2,
      explain:
        "Router-level (and decorator-level) dependencies execute for every route — raising exceptions stops the request — but their return values go nowhere. An endpoint that needs the user object declares CurrentUser as its own parameter.",
    },
    {
      question: "Why is require_role written as a function that returns a function?",
      options: [
        "FastAPI requires all dependencies to be nested functions",
        "Depends() needs a callable, and the closure lets the inner checker carry the role parameter chosen at declaration time",
        "Async functions can't take string arguments",
        "It avoids circular imports between routers",
      ],
      answerIndex: 1,
      explain:
        "Depends(require_role('admin')) calls the factory immediately; the returned checker closes over role and is what runs per request. It's the standard way to parameterise a dependency — the same pattern as Laravel's middleware('role:admin') with a param.",
    },
  ],
};

export default lesson;
