import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "middleware-and-cors",
  title: "Middleware & CORS",
  part: "Production & Shipping",
  estMinutes: 11,
  summary:
    "Middleware wraps every request in an onion of before/after hooks — @app.middleware('http') gives you the hook, CORSMiddleware handles the browser's cross-origin rules declaratively, and knowing when a dependency is the better tool is an interview classic.",

  concept: `
Some concerns don't belong to any one route: timing every request, logging,
attaching security headers, CORS. In PHP you've solved this with **PSR-15
middleware** or Laravel's middleware stack. FastAPI has the identical idea,
and the simplest way in is a decorator:

\`\`\`python
import time
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)          # everything inside runs here
    response.headers["X-Process-Time"] = str(time.perf_counter() - start)
    return response
\`\`\`

The shape is exactly PSR-15's \`process($request, $handler)\`: code before
\`call_next\` runs on the way **in**, code after it runs on the way **out**, and
you must return the response (you can inspect or modify it first). Skip
\`call_next\` entirely and you've short-circuited the request — that's how
rate limiters reject early.

### The onion, and who's outermost

Middleware nests like an onion, same as PHP. The ordering rule surprises
people: each \`app.add_middleware(...)\` call wraps the **existing** stack, so
the middleware added **last is outermost** — first to see the request, last to
touch the response. If your logging middleware should see what CORS did,
add the logger *after* CORS.

Middleware runs for **every** request, has no idea which route will handle
it, and works at the raw \`Request\`/\`Response\` level. Contrast with
dependencies: \`Depends\` is **per-route**, produces **typed values** injected
into your handler's signature, and shows up in the OpenAPI docs. Rule of
thumb: cross-cutting and route-agnostic → middleware; the handler needs a
*value* (a user, a DB session, a parsed tenant) → dependency.

### CORS: the browser is the bouncer

CORS trips up server-side developers because the enforcement point is wrong-
footed: **your API never blocks anything — the browser does.** When JS on
\`https://app.example.com\` calls your API on another origin, the browser asks
your server for permission headers and refuses to hand the response to the
page if they're missing. \`curl\` and Postman ignore CORS entirely — which is
why "it works in Postman but not the browser" is the classic symptom.

For anything beyond a simple GET/POST, the browser first sends a **preflight**:
an \`OPTIONS\` request with \`Origin\` and \`Access-Control-Request-Method\`
headers. Your API must answer it *before* your route code — which is exactly
what middleware is for. You've probably hand-written this dance in PHP:
\`header('Access-Control-Allow-Origin: ...')\` plus an early \`exit\` for
OPTIONS. FastAPI makes it configuration:

\`\`\`python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
\`\`\`

The defaults are deliberately restrictive: no origins, \`allow_methods\`
defaults to \`["GET"]\`, \`allow_credentials\` to \`False\`. And the gotcha every
interviewer loves: \`allow_origins=["*"]\` **cannot** be combined with
\`allow_credentials=True\`. The CORS spec forbids the wildcard when cookies or
auth headers are in play — the middleware must echo back one explicit origin,
so you have to list your origins (or use \`allow_origin_regex\` for patterns
like preview deployments).
`,

  comparisons: [
    {
      label: "Timing middleware: PSR-15 vs @app.middleware",
      intro:
        "Add an X-Process-Time header to every response. Both wrap the downstream handler; before/after the inner call is before/after the whole rest of the app.",
      php: `<?php
// src/Middleware/ProcessTime.php (PSR-15)
final class ProcessTime implements MiddlewareInterface
{
    public function process(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler
    ): ResponseInterface {
        $start = microtime(true);
        $response = $handler->handle($request); // the rest of the onion
        return $response->withHeader(
            'X-Process-Time',
            (string) (microtime(true) - $start)
        );
    }
}`,
      ts: `# main.py
import time
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)  # the rest of the onion
    response.headers["X-Process-Time"] = str(
        time.perf_counter() - start
    )
    return response`,
      note:
        "Same pattern, different packaging: PSR-15 needs a class implementing an interface; FastAPI takes any async function with the (request, call_next) signature. call_next IS $handler->handle().",
    },
    {
      label: "CORS: hand-rolled headers vs declarative middleware",
      intro:
        "Allow a JS frontend on another origin to call the API with credentials. The PHP version is the block you have almost certainly written by hand at least once.",
      php: `<?php
// public/index.php — the classic hand-written CORS dance
$allowed = ['https://app.example.com'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, DELETE');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
}

// answer the preflight before the router ever runs
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}`,
      ts: `# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
# Preflight OPTIONS requests are answered by the
# middleware — your route code never sees them.`,
      note:
        "Identical wire behaviour, but the middleware also enforces the spec: it will echo one explicit origin rather than * when credentials are on, because wildcard + credentials is forbidden.",
    },
    {
      label: "Cross-cutting vs per-route: middleware or dependency?",
      intro:
        "Two auth-ish concerns, two tools. Global request logging has no route context; 'the current user' is a typed value one handler needs.",
      php: `<?php
// Laravel: global middleware for cross-cutting...
// app/Http/Kernel.php
protected $middleware = [
    \\App\\Http\\Middleware\\LogRequests::class,
];

// ...route middleware + the container for per-route needs
Route::middleware('auth:sanctum')->get(
    '/profile',
    function (Request $request) {
        return $request->user(); // resolved by the guard
    }
);`,
      ts: `# FastAPI: middleware for cross-cutting...
@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    print(f"{request.method} {request.url.path}")
    return response

# ...a dependency when the handler needs a VALUE
@app.get("/profile")
async def profile(
    user: Annotated[User, Depends(get_current_user)],
):
    return user  # typed, documented in OpenAPI, testable`,
      note:
        "Middleware sees every request but knows nothing about routes and returns no values; Depends is scoped, typed, appears in the docs, and can be overridden in tests — reach for it whenever the handler needs the result.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "The onion, simulated with closures: three middleware are 'added' in the order timing, logging, cors — predict which one sees the request first. Then a preflight decision for an allowed and a blocked origin.",
    code: `# The onion, hand-rolled: each middleware is a closure that wraps
# the next handler — exactly what @app.middleware("http") does.

def make_middleware(name):
    def wrap(next_handler):
        def handler(request):
            print(f"-> {name}: request in")
            response = next_handler(request)
            print(f"<- {name}: response out")
            return response
        return handler
    return wrap

def endpoint(request):
    print(f"   endpoint: {request['method']} {request['path']}")
    return {"status": 200}

# Simulate app.add_middleware(...) called three times, in this order.
# Starlette inserts each new middleware OUTSIDE the existing stack,
# so the one added LAST runs FIRST on the way in.
stack = endpoint
for name in ["timing", "logging", "cors"]:
    stack = make_middleware(name)(stack)

stack({"method": "GET", "path": "/items"})

# --- Preflight: what CORSMiddleware decides before your code runs ---
ALLOW_ORIGINS = ["https://app.example.com"]
ALLOW_METHODS = ["GET", "POST", "DELETE"]

def preflight(origin, method):
    if origin not in ALLOW_ORIGINS:
        return "no CORS headers -> browser blocks the real request"
    if method not in ALLOW_METHODS:
        return f"method {method} not allowed"
    return f"200 OK, Access-Control-Allow-Origin: {origin}"

print()
print("preflight OPTIONS decisions:")
for origin in ["https://app.example.com", "https://evil.example.net"]:
    print(f"  Origin {origin}, DELETE -> {preflight(origin, 'DELETE')}")`,
    output: `-> cors: request in
-> logging: request in
-> timing: request in
   endpoint: GET /items
<- timing: response out
<- logging: response out
<- cors: response out

preflight OPTIONS decisions:
  Origin https://app.example.com, DELETE -> 200 OK, Access-Control-Allow-Origin: https://app.example.com
  Origin https://evil.example.net, DELETE -> no CORS headers -> browser blocks the real request`,
  },

  keyPoints: [
    "`@app.middleware(\"http\")` takes `async def mw(request, call_next)` — code before `await call_next(request)` runs on the way in, code after runs on the way out, and you must return the response. It's PSR-15's `process($request, $handler)` as a function.",
    "The onion ordering rule: each `add_middleware` call wraps the existing stack, so the middleware added **last** is outermost and sees the request **first**.",
    "Middleware is cross-cutting and route-blind; `Depends` is per-route, returns typed values, appears in OpenAPI, and is overridable in tests. If the handler needs a value, it's a dependency.",
    "CORS is enforced by the **browser**, not your API — curl and Postman bypass it completely, which is why 'works in Postman, fails in the browser' means CORS.",
    "Non-simple requests trigger a preflight `OPTIONS` request that `CORSMiddleware` answers before your routes run; defaults are restrictive (`allow_methods=[\"GET\"]`, `allow_credentials=False`).",
    "`allow_origins=[\"*\"]` cannot be combined with `allow_credentials=True` — the spec forbids wildcards with credentials, so list explicit origins or use `allow_origin_regex`.",
  ],

  interview: [
    {
      q: "When would you use middleware versus a dependency in FastAPI?",
      a: "Middleware wraps every request with no knowledge of which route will handle it — it's the right tool for cross-cutting, route-agnostic work: timing headers, request logging, compression, CORS. A dependency is per-route and produces a typed value injected into the handler's signature — the current user, a DB session, a validated tenant ID. Dependencies also show up in the OpenAPI schema and can be swapped via `dependency_overrides` in tests, which middleware can't. My rule: if the handler needs the *result*, it's a dependency; if no handler should even know it's happening, it's middleware. It maps directly to PHP: PSR-15/global middleware versus resolving a value out of the DI container.",
    },
    {
      q: "A frontend developer says your API 'blocks' their requests with a CORS error, but the endpoint works fine in Postman. What's actually happening?",
      a: "Nothing is blocked server-side — CORS is enforced by the browser, and Postman doesn't implement it. Their JS runs on a different origin, so the browser either sent a preflight OPTIONS that didn't get permissive headers back, or got the response and refused to expose it because `Access-Control-Allow-Origin` was missing or didn't match. The fix is on my side but it's configuration, not logic: add `CORSMiddleware` with their origin in `allow_origins`, plus `allow_credentials=True` and the methods and headers they use. The subtle bit is that if credentials are involved I can't use the `\"*\"` wildcard — the spec requires echoing an explicit origin.",
    },
    {
      q: "Two middleware are registered; how do you reason about their execution order?",
      a: "It's an onion, and each `app.add_middleware` call wraps everything registered so far — so the last one added is outermost: first to see the request, last to touch the response. That means order in code reads 'inside-out'. It matters in practice: CORS middleware should generally be outermost so even error responses from inner layers carry CORS headers, so it's added last. Same mental model as Laravel's middleware stack or a PSR-15 dispatcher, just with the registration order inverted relative to a priority list.",
    },
  ],

  quiz: [
    {
      question:
        "You call add_middleware(A), then add_middleware(B). A request arrives. What order do things run in?",
      options: [
        "A before, B before, handler, B after, A after",
        "B before, A before, handler, A after, B after",
        "A and B run concurrently around the handler",
        "Only B runs — the last add_middleware replaces earlier ones",
      ],
      answerIndex: 1,
      explain:
        "Each add_middleware call wraps the existing stack, so B (added last) is outermost: it sees the request first and the response last. The onion unwinds in reverse on the way out.",
    },
    {
      question:
        "Why does a cross-origin DELETE request from a browser hit your API with OPTIONS first?",
      options: [
        "FastAPI probes the client's capabilities before accepting writes",
        "It's the CORS preflight: the browser asks permission (origin, method, headers) before sending the real request",
        "OPTIONS is how HTTP/2 negotiates the connection",
        "CORSMiddleware converts all non-GET requests to OPTIONS",
      ],
      answerIndex: 1,
      explain:
        "Non-simple requests (like DELETE, or anything with an Authorization header) trigger a browser preflight. CORSMiddleware answers the OPTIONS request with the allow-lists you configured — your route code never sees it.",
    },
    {
      question:
        "What's wrong with CORSMiddleware(allow_origins=[\"*\"], allow_credentials=True)?",
      options: [
        "Nothing — it's the standard permissive dev setup",
        "The wildcard makes preflights slower",
        "The CORS spec forbids wildcard origins when credentials are allowed — you must list explicit origins (or use allow_origin_regex)",
        "allow_credentials must also be set on every route decorator",
      ],
      answerIndex: 2,
      explain:
        "When cookies or auth headers are in play, the browser requires an explicit echoed origin, not *. The middleware can't honor both settings at once, so credentialed setups must enumerate origins or match them by regex.",
    },
    {
      question: "Which job is a poor fit for middleware and better as a dependency?",
      options: [
        "Adding an X-Process-Time header to all responses",
        "Compressing large responses with gzip",
        "Providing the authenticated User object to the three routes that need it",
        "Logging the method and path of every request",
      ],
      answerIndex: 2,
      explain:
        "The current user is a typed value that specific handlers consume — exactly what Depends is for (and it's overridable in tests and visible in OpenAPI). The other three are route-agnostic, response-level concerns: classic middleware.",
    },
  ],
};

export default lesson;
