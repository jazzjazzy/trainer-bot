import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "error-handling",
  title: "Custom Exceptions & Exception Handlers",
  part: "Production & Shipping",
  estMinutes: 12,
  summary:
    "Services raise domain exceptions; @app.exception_handler maps each to a consistent JSON envelope in one place — Laravel's Handler::render(), FastAPI-style.",

  concept: `
\`raise HTTPException(404, ...)\` inline is fine in a tutorial. In a real
codebase it means your service layer knows about HTTP, and every endpoint
repeats the same try/except and error-shaping. The production pattern
separates the layers: **services raise domain exceptions, one handler per
exception type maps them to HTTP**.

### Domain exceptions + registered handlers

\`\`\`python
# exceptions.py — the domain speaks its own language
class AppError(Exception):
    """Base for all domain errors."""

class ItemNotFoundError(AppError):
    def __init__(self, item_id: int):
        self.item_id = item_id

class InsufficientStockError(AppError): ...
\`\`\`

\`\`\`python
# main.py — one place maps domain -> HTTP
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(ItemNotFoundError)
async def item_not_found_handler(request: Request, exc: ItemNotFoundError):
    return JSONResponse(
        status_code=404,
        content={"error": {"code": "item_not_found",
                           "message": f"Item {exc.item_id} does not exist"}},
    )
\`\`\`

Now \`items_service.get(42)\` just raises \`ItemNotFoundError(42)\` — no
HTTP imports, testable in isolation — and any endpoint calling it produces
the same envelope. This is exactly Laravel's \`Handler::render()\` (or a
Symfony \`kernel.exception\` listener): exceptions bubble up, one component
translates them.

**Specificity rule:** FastAPI matches the handler for the most specific
exception class. Register a handler for \`AppError\` and one for
\`ItemNotFoundError\`; an \`ItemNotFoundError\` takes its own handler, while a
new \`PaymentFailedError(AppError)\` you forgot to map falls back to the
\`AppError\` handler instead of a bare 500.

### Overriding the defaults: 422 and 404 bodies

FastAPI ships default handlers: \`RequestValidationError\` → 422 with a
\`detail\` list, \`StarletteHTTPException\` → \`{"detail": ...}\`. When a client
contract demands a different shape, override them the same way:

\`\`\`python
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {
        "code": "validation_failed",
        "fields": [{"loc": e["loc"], "msg": e["msg"]} for e in exc.errors()],
    }})

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code,
                        content={"error": {"code": "http_error",
                                           "message": str(exc.detail)}})
\`\`\`

Catch \`StarletteHTTPException\` (FastAPI's \`HTTPException\` subclasses it) so
you also reshape errors Starlette itself raises, like the router's 404. You
can also *wrap* rather than replace: import \`http_exception_handler\` /
\`request_validation_exception_handler\` from \`fastapi.exception_handlers\`,
log, then \`return await\` the default.

### The 500 case: log everything, leak nothing

For truly unhandled exceptions, the client must get a generic envelope while
the logs get the full story:

\`\`\`python
@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"error": {
        "code": "internal", "message": "Something went wrong"}})
\`\`\`

Stack traces, SQL fragments, and file paths in a 500 body are reconnaissance
gifts. The rule: **specific errors get specific messages; unexpected errors
get logged in full and answered in generic.** Debug-mode trace pages
(Laravel's Whoops / Symfony profiler) are a dev-only luxury — same as PHP.
`,

  comparisons: [
    {
      label: "One place that maps exceptions to responses",
      intro:
        "A service raises ItemNotFoundError; neither the service nor the controller shapes HTTP. Laravel does the mapping in the exception handler; FastAPI in a registered handler function.",
      php: `<?php
// app/Exceptions/Handler.php (Laravel)
public function register(): void
{
    $this->renderable(
        function (ItemNotFoundException $e, $request) {
            return response()->json([
                'error' => [
                    'code' => 'item_not_found',
                    'message' => "Item {$e->itemId}"
                        . " does not exist",
                ],
            ], 404);
        }
    );
}

// Service stays HTTP-free:
public function get(int $id): Item
{
    return $this->repo->find($id)
        ?? throw new ItemNotFoundException($id);
}`,
      ts: `# main.py
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(ItemNotFoundError)
async def item_not_found_handler(
    request: Request, exc: ItemNotFoundError,
):
    return JSONResponse(
        status_code=404,
        content={"error": {
            "code": "item_not_found",
            "message": f"Item {exc.item_id}"
                       " does not exist"}},
    )

# services/items.py stays HTTP-free:
def get_item(db, item_id: int) -> Item:
    item = db.get(Item, item_id)
    if item is None:
        raise ItemNotFoundError(item_id)
    return item`,
      note: "Same architecture, same benefit: the service is testable without HTTP, every endpoint that touches items produces an identical 404 envelope, and changing the error shape is a one-file edit. @app.exception_handler ≈ Handler::renderable ≈ a kernel.exception listener.",
    },
    {
      label: "Reshaping the framework's own errors (422/404)",
      intro:
        "A client contract demands {error: {code, fields}} instead of FastAPI's default 422 detail list. Both frameworks let you override the built-in rendering.",
      php: `<?php
// Laravel: override validation rendering
public function register(): void
{
    $this->renderable(function (
        ValidationException $e, $request) {
        return response()->json([
            'error' => [
                'code' => 'validation_failed',
                'fields' => $e->errors(),
            ],
        ], 422);
    });
}`,
      ts: `from fastapi.exceptions import (
    RequestValidationError,
)
from starlette.exceptions import (
    HTTPException as StarletteHTTPException,
)

@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    return JSONResponse(status_code=422, content={
        "error": {
            "code": "validation_failed",
            "fields": [{"loc": e["loc"],
                        "msg": e["msg"]}
                       for e in exc.errors()],
        }})

@app.exception_handler(StarletteHTTPException)
async def http_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "http_error",
                 "message": str(exc.detail)}})`,
      note: "Register against StarletteHTTPException, not FastAPI's HTTPException, to also catch errors raised inside Starlette (like the router's own 404 for unknown paths). exc.errors() gives the same loc/msg/type structure the default 422 body exposes.",
    },
    {
      label: "Unhandled errors: log fully, respond generically",
      intro:
        "A bug throws something nobody mapped. Production must log the stack trace but answer with a shape that reveals nothing.",
      php: `<?php
// Laravel: report() logs, render() shapes
public function register(): void
{
    $this->reportable(function (Throwable $e) {
        // full trace to the log channel
    });

    $this->renderable(function (Throwable $e,
                                $request) {
        if (!config('app.debug')) {
            return response()->json(['error' => [
                'code' => 'internal',
                'message' => 'Something went wrong',
            ]], 500);
        }
    });
}`,
      ts: `import logging

logger = logging.getLogger("app")

@app.exception_handler(Exception)
async def unhandled_handler(
    request: Request, exc: Exception,
):
    # Full traceback -> logs (logger.exception
    # captures the active exception's stack)
    logger.exception(
        "Unhandled error on %s %s",
        request.method, request.url.path)
    # Generic envelope -> client. No trace, no
    # SQL, no file paths.
    return JSONResponse(status_code=500, content={
        "error": {"code": "internal",
                  "message": "Something went wrong"}})`,
      note: "The split mirrors Laravel's reportable/renderable: observability gets everything, the wire gets nothing exploitable. A stack trace in a 500 body hands attackers your file layout, library versions, and query shapes.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "An exception-handler registry in miniature. Dispatch walks the exception's class hierarchy (MRO) so the most specific registered handler wins. RateLimitError has no handler of its own — predict which handler catches it before running.",
    code: `# An exception-handler registry in miniature: services raise domain
# errors; ONE dispatcher maps each to a consistent JSON envelope by
# walking the exception's class hierarchy (most specific class wins).
import json


class AppError(Exception):
    """Base class for all domain errors."""


class NotFoundError(AppError):
    pass


class ItemNotFoundError(NotFoundError):
    def __init__(self, item_id: int):
        self.item_id = item_id


class RateLimitError(AppError):
    pass  # note: NO handler registered for this one


HANDLERS = {}


def exception_handler(exc_type):
    def register(fn):
        HANDLERS[exc_type] = fn
        return fn
    return register


@exception_handler(ItemNotFoundError)
def item_not_found(exc):
    return 404, {"error": {"code": "item_not_found", "message": "Item " + str(exc.item_id) + " does not exist"}}


@exception_handler(AppError)
def app_error(exc):
    return 500, {"error": {"code": "internal", "message": "Something went wrong"}}


def dispatch(exc):
    # Walk Type -> parents (Python's MRO): most specific handler wins.
    for cls in type(exc).__mro__:
        if cls in HANDLERS:
            status, body = HANDLERS[cls](exc)
            return status, body, cls.__name__
    raise exc  # truly unhandled -> framework's bare 500


def endpoint_get_item():
    raise ItemNotFoundError(42)


def endpoint_rate_limited():
    raise RateLimitError("slow down")


def endpoint_ok():
    return 200, {"item": "widget"}, None


for name, endpoint in [("GET /items/42", endpoint_get_item), ("POST /orders", endpoint_rate_limited), ("GET /items/1", endpoint_ok)]:
    try:
        status, body, handled_by = endpoint()
    except AppError as exc:
        status, body, handled_by = dispatch(exc)
    via = " (handler: " + handled_by + ")" if handled_by else ""
    print(name + " -> " + str(status) + via)
    print("  " + json.dumps(body))`,
    output: `GET /items/42 -> 404 (handler: ItemNotFoundError)
  {"error": {"code": "item_not_found", "message": "Item 42 does not exist"}}
POST /orders -> 500 (handler: AppError)
  {"error": {"code": "internal", "message": "Something went wrong"}}
GET /items/1 -> 200
  {"item": "widget"}`,
  },

  keyPoints: [
    "Services raise domain exceptions (`class ItemNotFoundError(AppError)`) and never import HTTP; `@app.exception_handler(ItemNotFoundError)` maps them to a `JSONResponse` in one place — Laravel's `Handler::render()` in FastAPI clothes.",
    "Design one consistent error envelope (e.g. `{\"error\": {\"code\", \"message\"}}`) and produce it from handlers, not from scattered try/except blocks in endpoints.",
    "The most specific handler wins: a handler for a base class like `AppError` acts as a safety net for unmapped subclasses.",
    "Override `RequestValidationError` to reshape 422 bodies, and `StarletteHTTPException` (not just FastAPI's `HTTPException`) to reshape 404s and other framework-raised errors; you can wrap the defaults from `fastapi.exception_handlers` to add logging without replacing behaviour.",
    "For unhandled exceptions: `logger.exception(...)` captures the full traceback for observability, while the client gets a generic 500 envelope — stack traces in response bodies are reconnaissance gifts.",
  ],

  interview: [
    {
      q: "How do you handle errors in a production FastAPI application beyond raising HTTPException inline?",
      a: "I define a small hierarchy of domain exceptions — an AppError base with specifics like ItemNotFoundError — and the service layer raises those, never touching HTTP. Then I register handlers with @app.exception_handler(ItemNotFoundError) that return a JSONResponse in one consistent envelope, say {error: {code, message}}. That keeps services testable in isolation, guarantees every endpoint emits identical error shapes, and makes changing the contract a one-file edit. FastAPI picks the most specific registered handler, so a handler on the AppError base doubles as a safety net for subclasses nobody mapped yet. It's the same architecture as Laravel's exception Handler or Symfony's kernel.exception listener — exceptions bubble, one translator renders them.",
    },
    {
      q: "A client contract requires a custom shape for validation errors instead of FastAPI's default 422 body. How do you do it?",
      a: "Register a handler for RequestValidationError from fastapi.exceptions: @app.exception_handler(RequestValidationError), then build my envelope from exc.errors(), which yields the same loc/msg/type entries the default body contains, and return a JSONResponse with status 422. For non-validation framework errors — including the router's own 404 for unknown paths — I register against StarletteHTTPException, because FastAPI's HTTPException subclasses it and Starlette raises the base type internally. If I only want to add logging while keeping the stock bodies, I import http_exception_handler and request_validation_exception_handler from fastapi.exception_handlers, log, and return await the default.",
    },
    {
      q: "What should a 500 response body contain in production, and why?",
      a: "Almost nothing: a generic envelope like {error: {code: 'internal', message: 'Something went wrong'}}, plus ideally a correlation id so support can find the log entry. The full story — traceback, request context — goes to the logs via logger.exception, which captures the active exception's stack automatically. Leaking the traceback in the body hands an attacker file paths, framework and library versions, and often SQL fragments — free reconnaissance. It's the same discipline as PHP: display_errors off in production, Whoops-style trace pages only in dev; the split between what you report to logs and what you render to clients is exactly Laravel's reportable versus renderable.",
    },
  ],

  quiz: [
    {
      question:
        "Handlers are registered for AppError and ItemNotFoundError (a subclass of AppError, via NotFoundError). A service raises ItemNotFoundError. Which handler runs?",
      options: [
        "The AppError handler — base classes take precedence",
        "The ItemNotFoundError handler — the most specific match wins",
        "Both, base first then subclass",
        "Neither — ambiguous registrations raise a startup error",
      ],
      answerIndex: 1,
      explain:
        "Handler lookup prefers the most specific exception class. The base-class handler only fires for AppError subclasses without their own handler — which is precisely what makes a base handler a useful safety net.",
    },
    {
      question:
        "Why register your custom 404 reshaping against StarletteHTTPException rather than FastAPI's HTTPException?",
      options: [
        "FastAPI's HTTPException can't be caught by handlers",
        "StarletteHTTPException responses are faster to serialise",
        "FastAPI's HTTPException subclasses Starlette's, and Starlette itself raises the base type (e.g. the router's 404) — catching the base covers both",
        "The OpenAPI schema only documents Starlette exceptions",
      ],
      answerIndex: 2,
      explain:
        "Errors raised by Starlette internals — like 404 for an unknown path — are the base StarletteHTTPException. A handler on FastAPI's subclass would miss them; a handler on the base catches your raises and the framework's.",
    },
    {
      question: "What belongs in the response body when an unhandled exception produces a 500?",
      options: [
        "The full traceback, to help clients report bugs",
        "The exception message, since it's usually harmless",
        "A generic envelope (and perhaps a correlation id); the traceback goes to the logs via logger.exception",
        "Nothing — return an empty body so nothing can leak",
      ],
      answerIndex: 2,
      explain:
        "Clients get a stable, generic shape they can parse; logs get the full stack trace for debugging. Tracebacks in responses leak paths, versions, and query shapes. An empty body is safe but hostile — a consistent envelope with a correlation id serves clients and support.",
    },
  ],
};

export default lesson;
