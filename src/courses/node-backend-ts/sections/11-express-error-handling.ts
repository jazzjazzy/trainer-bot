import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "express-error-handling",
  title: "Error Handling in Express 5",
  part: "Express Essentials",
  estMinutes: 12,
  summary:
    "Express funnels every error into one 4-argument middleware registered last — and Express 5 finally forwards rejected async handlers there automatically, killing the asyncHandler wrapper.",

  concept: `
In PHP you get global error handling almost for free. An uncaught exception
bubbles up to \`set_exception_handler\` (or Laravel's exception handler), the
framework renders a 500, PHP-FPM discards the dead process, and the next
request starts clean. Blast radius: exactly one request.

Node has no per-request process to sacrifice. Express gives you a single
funnel instead: **error-handling middleware**.

### The 4-argument signature, registered last

Express recognises error middleware purely by arity — a function with
**exactly four parameters** \`(err, req, res, next)\`:

\`\`\`ts
// src/middleware/error.ts
import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: unknown, req: Request, res: Response, next: NextFunction
) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(err); // real apps: pino, covered later
  res.status(500).json({ error: "Internal Server Error" });
}
\`\`\`

Register it with \`app.use(errorHandler)\` **after every route** — Express walks
the middleware stack in registration order, so a handler declared before your
routes never sees their errors. Any synchronous \`throw\` inside a handler, or an
explicit \`next(err)\`, skips all remaining normal middleware and jumps straight
to the error chain.

### Express 5: async handlers just work

The headline Express 5 change: **a rejected promise returned by an async
handler or middleware is automatically forwarded to the error middleware**.
You write \`async (req, res) => { ... }\`, you \`throw\` or let an awaited call
reject, and Express catches it — exactly like throwing an exception in a
Laravel controller.

Express 4 did **not** do this. A rejected async handler was a floating promise
Express never saw; the request hung until the client timed out, and the
rejection could crash the process. Old codebases are full of the
\`asyncHandler\` wrapper (or the \`express-async-errors\` package) to patch the
gap — recognise it as legacy, and say so in interviews.

### A custom HttpError and a 404 catch-all

One small class turns "which status code?" into a type check:

\`\`\`ts
export class HttpError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "HttpError";
  }
}

// in a handler:
if (!user) throw new HttpError("user not found", 404);
\`\`\`

For URLs that match no route, add a plain catch-all between your routes and
the error middleware: \`app.use((req, res) => res.status(404).json({ error: "Not Found" }))\`.

### What Express cannot catch

Express only guards code on the request path. An error thrown in a
\`setTimeout\` callback, an event-emitter listener, or a fire-and-forget promise
escapes the framework entirely — and in Node that can take down the **whole
process**, every in-flight request with it. That failure mode gets its own
section.
`,

  comparisons: [
    {
      label: "One global funnel for exceptions",
      intro:
        "Both frameworks route every uncaught error in a request to one place that decides the response. PHP gets it from the runtime's request-dies-alone model; Express gets it from a middleware registered last.",
      php: `<?php
// bootstrap/handler.php — plain PHP version of what
// Laravel's exception handler does for you.
set_exception_handler(function (Throwable $e) {
    http_response_code(
        $e instanceof HttpException ? $e->getStatusCode() : 500
    );
    header('Content-Type: application/json');
    echo json_encode(['error' => $e->getMessage()]);
    // Process exits; FPM starts the next request clean.
});`,
      ts: `// src/app.ts
import express from "express";
import { HttpError } from "./errors";

const app = express();
app.use(express.json());
// ... all routes registered here ...

// 404 catch-all: after routes, before the error handler.
app.use((req, res) => res.status(404).json({ error: "Not Found" }));

// Error middleware: 4 args, registered LAST.
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});`,
      note: "Express identifies error middleware by its 4-parameter signature alone — drop the unused `next` and it silently becomes a normal middleware that never receives errors.",
    },
    {
      label: "Async handlers: Express 4 wrapper vs Express 5",
      intro:
        "The same async route that may reject. Express 4 needed every handler wrapped so the rejection reached next(); Express 5 forwards rejected handler promises automatically.",
      php: `// Express 4 — LEGACY pattern you'll meet in old codebases.
// A rejected async handler was invisible to Express: the
// request hung and the rejection floated unhandled.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.get("/users/:id", asyncHandler(async (req, res) => {
  const user = await findUser(req.params.id); // may reject
  if (!user) throw new HttpError("user not found", 404);
  res.json(user);
}));`,
      ts: `// Express 5 — rejected promises from async handlers are
// forwarded to the error middleware automatically.
app.get("/users/:id", async (req, res) => {
  const user = await findUser(req.params.id); // may reject
  if (!user) throw new HttpError("user not found", 404);
  res.json(user);
});
// No wrapper, no try/catch boilerplate per route:
// throw -> error middleware -> one consistent JSON response.`,
      note: "Express 5 (npm default since 5.1.0) made the wrapper obsolete — but interviewers still ask about it because Express 4 code is everywhere.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Aborting a request with a status code",
      intro:
        "Signal 'this request fails with 404' from deep inside business logic. Laravel throws via abort(); in Express you throw a custom error carrying its status code.",
      php: `<?php
// app/Http/Controllers/UserController.php (Laravel)
public function show(string $id)
{
    $user = User::find($id);
    if (!$user) {
        abort(404, 'user not found'); // throws HttpException
    }
    return response()->json($user);
}`,
      ts: `// src/errors.ts
export class HttpError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "HttpError";
  }
}

// src/routes/users.ts — throw anywhere in the request path
app.get("/users/:id", async (req, res) => {
  const user = await findUser(req.params.id);
  if (!user) throw new HttpError("user not found", 404);
  res.json(user);
});`,
      note: "Same idea as Laravel's abort(): encode the HTTP outcome in the exception and let one handler translate it — instanceof HttpError replaces instanceof HttpException.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Express 5's error pipeline in miniature: async 'handlers' throw typed errors, and one errorMiddleware function maps error types to status codes. Predict the four logged responses, then run it.",
    code: `// Express 5 in miniature: every error becomes an HTTP response in ONE place.

class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: number) {
    super(resource + " " + id + " not found", 404);
    this.name = "NotFoundError";
  }
}

class ValidationError extends AppError {
  constructor(field: string) {
    super("invalid value for field: " + field, 400);
    this.name = "ValidationError";
  }
}

// A fake async route handler — like Express 5, it just throws.
async function getUserHandler(id: number) {
  if (Number.isNaN(id)) throw new ValidationError("id");
  if (id !== 42) throw new NotFoundError("user", id);
  return { id, name: "Ada Lovelace" };
}

// The "error middleware": one place mapping error types to responses.
function errorMiddleware(err: unknown) {
  if (err instanceof AppError) {
    return { status: err.statusCode, body: { error: err.message } };
  }
  // Unknown error (a bug, a driver failure): never leak internals.
  return { status: 500, body: { error: "Internal Server Error" } };
}

async function simulateRequest(rawId: string) {
  try {
    const user = await getUserHandler(Number(rawId));
    console.log("GET /users/" + rawId + " -> 200 " + JSON.stringify(user));
  } catch (err) {
    // Express 5 performs this catch for you on rejected handler promises.
    const r = errorMiddleware(err);
    console.log("GET /users/" + rawId + " -> " + r.status + " " + JSON.stringify(r.body));
  }
}

await simulateRequest("42");
await simulateRequest("7");
await simulateRequest("abc");

// An error that is NOT part of your HttpError family still gets a clean 500:
const r = errorMiddleware(new RangeError("connection pool exhausted"));
console.log("unexpected error   -> " + r.status + " " + JSON.stringify(r.body));`,
  },

  keyPoints: [
    "Error middleware is any function with exactly four parameters `(err, req, res, next)` — Express detects it by arity — and it must be registered with `app.use` after all routes.",
    "`next(err)` (or a synchronous `throw` in a handler) skips the rest of the normal stack and jumps to the error middleware chain.",
    "Express 5 automatically forwards rejected promises from async handlers and middleware to the error middleware — the Express 4 `asyncHandler` wrapper is a legacy pattern.",
    "A custom `HttpError extends Error` carrying `statusCode` lets business logic throw HTTP outcomes, like Laravel's `abort()` throwing an `HttpException`.",
    "Add a plain `(req, res)` catch-all after your routes for 404s — unmatched URLs are not errors, so they never reach the error middleware on their own.",
    "Express only catches errors on the request path: exceptions in `setTimeout` callbacks or un-awaited promises escape the framework and can kill the whole process.",
  ],

  interview: [
    {
      q: "How does error handling differ between Express 4 and Express 5?",
      a: "The mechanism is the same in both: a 4-argument middleware `(err, req, res, next)` registered last, reached via `next(err)` or a synchronous throw. The difference is async handlers. In Express 4, a rejected promise from an `async` handler was invisible to the framework — the request hung and the rejection floated, so everyone wrapped handlers in an `asyncHandler` that did `Promise.resolve(fn(req, res, next)).catch(next)`, or pulled in `express-async-errors`. Express 5 forwards rejected handler and middleware promises to the error middleware automatically, so you just `throw` inside `async` handlers and delete the wrapper. I'd still recognise the wrapper on sight because Express 4 codebases are everywhere.",
    },
    {
      q: "Coming from PHP, what surprised you about error handling in Node?",
      a: "In PHP the runtime gives you a free safety net: an uncaught exception kills one request, `set_exception_handler` or Laravel's handler renders the response, and FPM hands the next request a fresh process. In Node there's one long-running process, so 'let it crash' means every concurrent user's request dies, not one. Express narrows that risk by funnelling request-path errors into error middleware — Express 5 even catches async rejections — but anything outside the request path, like a throw inside a `setTimeout` callback or a fire-and-forget promise, escapes the framework entirely and can take the process down. So in Node I think about two tiers: HTTP errors handled per-request in middleware, and process-level failures that need a crash-log-and-restart strategy.",
    },
    {
      q: "How would you structure error handling in a production Express API?",
      a: "Three layers. First, a small error hierarchy — `HttpError extends Error` with a `statusCode`, plus subclasses like `NotFoundError` and `ValidationError` — so business logic throws intent, not status codes scattered through handlers. Second, one error middleware registered after all routes: it maps `instanceof HttpError` to that status with a safe JSON body, and everything else to a logged 500 that never leaks stack traces or internals to the client. Third, a plain 404 catch-all between the routes and the error middleware for unmatched URLs. Because Express 5 forwards async rejections automatically, handlers stay clean — no per-route try/catch — and every error path produces one consistent response shape.",
    },
  ],

  quiz: [
    {
      question:
        "How does Express know a middleware function is an error handler?",
      options: [
        "You register it with app.useError() instead of app.use()",
        "It has exactly four parameters: (err, req, res, next)",
        "Its name starts with 'error'",
        "It's the first middleware registered",
      ],
      answerIndex: 1,
      explain:
        "Express inspects the function's arity: exactly four declared parameters marks it as error middleware. That's also the classic footgun — remove the unused `next` parameter and it silently becomes a normal 3-arg middleware that never receives errors. It must be registered last, not first.",
    },
    {
      question:
        "In Express 5, an async route handler awaits a database call that rejects. What happens?",
      options: [
        "The request hangs until the client times out",
        "The process crashes with an unhandled rejection",
        "The rejection is automatically forwarded to the error middleware",
        "Express retries the handler once before failing",
      ],
      answerIndex: 2,
      explain:
        "Automatic forwarding of rejected async handler promises to the error middleware is the headline Express 5 improvement. The 'request hangs / rejection floats' behaviour describes Express 4, which is why the legacy asyncHandler wrapper existed.",
    },
    {
      question:
        "Where should the 404 catch-all and the error middleware sit in the middleware stack?",
      options: [
        "Both before the routes, so they run first",
        "404 catch-all after the routes, error middleware after that — both last",
        "Error middleware first, 404 catch-all last",
        "Order doesn't matter; Express sorts middleware by type",
      ],
      answerIndex: 1,
      explain:
        "Express walks middleware in registration order. The 404 catch-all only runs if no route matched, so it goes after all routes; the error middleware must be after everything that can produce an error, so it's registered very last. Express never reorders your stack.",
    },
  ],
};

export default lesson;
