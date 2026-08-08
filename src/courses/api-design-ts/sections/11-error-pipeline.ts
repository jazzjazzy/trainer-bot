import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "error-pipeline",
  title: "The Error Pipeline",
  part: "Contracts & Validation",
  estMinutes: 12,
  summary:
    "Throw typed error classes anywhere in your code, map them to Problem Details in exactly one place, and never let an unknown error leak internals onto the wire.",

  concept: `
If you've used Laravel, you've already met this idea: the framework's exception
handler catches everything a controller throws and turns it into an HTTP
response in one place. This section builds that by hand, because interviewers
love this question and because the pattern is framework-agnostic: **throw
semantically, map centrally, leak nothing**.

### Step 1: typed error classes

Instead of throwing raw \`Error("not found")\` strings, define a small hierarchy
of error classes that carry HTTP intent:

\`\`\`ts
// src/http/errors.ts
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly type: string) {
    super(message);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id: string) {
    super(\`\${resource} \${id} not found\`, 404, "/problems/not-found");
  }
}

export class ConflictError extends ApiError { /* 409 */ }
export class ValidationError extends ApiError { /* 422 + issues[] */ }
\`\`\`

Now your service layer can say \`throw new NotFoundError("order", id)\` from
three calls deep, and it means the same thing everywhere. The class *is* the
contract between "something went wrong" and "what the client sees" — like a
custom PHP exception hierarchy, but with the status code and problem type
attached instead of guessed later.

### Step 2: one mapper, one place

Every error — thrown by a handler, a service, or the framework itself — flows
to a single function that produces an RFC 9457 Problem Details response:

\`\`\`ts
function toProblem(err: unknown): { status: number; body: Problem } {
  if (err instanceof ValidationError) return { status: 422, body: /* + issues */ };
  if (err instanceof ApiError)
    return { status: err.status, body: { type: err.type, title: err.message, status: err.status } };
  // Everything else is UNKNOWN — see the never-leak rule below.
  return internalError(err);
}
\`\`\`

The switch is on \`instanceof\`, most-specific first. Because \`err\` arrives as
\`unknown\` (anything can be thrown in JS — even a string), the mapper is the one
place that must handle literally any value.

### Step 3: the never-leak rule

An unknown error means a bug, and bug details are for *your logs*, not the
wire. \`err.message\` from a database driver can contain SQL fragments,
hostnames, file paths, even credentials from a connection string. The rule:

- **Log the full error server-side** — stack, message, everything — tagged
  with a **correlation id** (e.g. \`req_8f3a…\`).
- **Send the client a generic 500 problem** containing *only* that correlation
  id, so a user can quote it to support and you can grep the logs.

The client learns "something broke, reference req_8f3a" — nothing about your
schema, your stack, or your secrets.

### Wiring it up

In Express-ish terms, error-handling middleware is the four-argument function
registered last: \`app.use((err, req, res, next) => { ... })\`. Handlers just
throw (or call \`next(err)\`); the middleware calls \`toProblem\` and writes
\`application/problem+json\`. Express 5's migration guide notes that rejected
promises from async handlers are now forwarded to error middleware
automatically — nice — but the portable habit is still to propagate explicitly
(a tiny \`asyncHandler\` wrapper or \`next(err)\` in a catch), because that habit
works in Express 4 codebases, in other frameworks, and makes the flow visible
in code review.
`,

  comparisons: [
    {
      label: "Catching an exception: echo the message vs map it",
      intro:
        "Both sides catch a failure while loading an order. The PHP script sends whatever the exception says straight to the client; the TS mapper decides per error class what the client is allowed to know.",
      php: `<?php // api/orders.php
try {
    $order = loadOrder($pdo, $_GET['id']);
    echo json_encode($order);
} catch (Exception $e) {
    http_response_code(500);
    // Info leak: PDO messages contain SQL fragments,
    // table names, sometimes host/user from the DSN.
    echo json_encode(['error' => $e->getMessage()]);
}`,
      ts: `// src/http/problem.ts
function toProblem(err: unknown): { status: number; body: Problem } {
  if (err instanceof ValidationError) {
    return { status: 422, body: { type: err.type, title: err.message,
      status: 422, errors: err.issues } };
  }
  if (err instanceof ApiError) {
    return { status: err.status, body: { type: err.type,
      title: err.message, status: err.status } };
  }
  // Unknown error: full detail to the logs, only an id to the client.
  const correlationId = newRequestId();
  logger.error({ correlationId, err });
  return { status: 500, body: { type: "about:blank",
    title: "Internal Server Error", status: 500, correlationId } };
}`,
      note:
        "The PHP catch treats every exception the same and trusts its message; the mapper treats the message as radioactive unless the error class was written for the wire.",
    },
    {
      label: "Per-route try/catch vs one central handler",
      intro:
        "Two Express-ish routes that can fail with 'not found'. The left one handles errors inline — and every new route copies the dance. The right one throws and lets one middleware do the mapping.",
      php: `// routes/orders.ts — error mapping duplicated per route
app.get("/orders/:id", async (req, res) => {
  try {
    const order = await orders.find(req.params.id);
    if (!order) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(order);
  } catch (err) {
    // ...and this block is subtly different in every route
    res.status(500).json({ error: "oops" });
  }
});`,
      ts: `// routes/orders.ts — routes throw, ONE place maps
app.get("/orders/:id", asyncHandler(async (req, res) => {
  const order = await orders.find(req.params.id);
  if (!order) throw new NotFoundError("order", req.params.id);
  res.json(order);
}));

// app.ts — registered LAST; Express treats 4-arg fns as error middleware
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  const { status, body } = toProblem(err);
  res.status(status).type("application/problem+json").json(body);
});`,
      note:
        "Same behaviour, but the mapping logic exists once — change the error format and you edit one function, not forty routes. This is Laravel's exception handler, hand-rolled.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "What the client sees when a bug hits production",
      intro:
        "The same unexpected database failure, on the wire. Predict which response you'd rather have quoted back to you in a security audit.",
      php: `$ curl -i https://api.example.com/orders/42

HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{"error": "SQLSTATE[HY000] [2002] Connection refused
 in /var/www/api/src/Db/Connection.php:48
 (host=db-prod-3.internal user=api_rw)"}`,
      ts: `$ curl -i https://api.example.com/orders/42

HTTP/1.1 500 Internal Server Error
Content-Type: application/problem+json

{
  "type": "about:blank",
  "title": "Internal Server Error",
  "status": 500,
  "correlationId": "req_8f3a1c"
}`,
      note:
        "The left response hands an attacker your internal hostname, DB user, and file layout. The right one gives support staff a grep-able id and gives attackers nothing.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A complete miniature error pipeline: three typed error classes plus a raw Error thrown by 'handlers', all mapped by one toProblem function. Predict the four status/body pairs — especially what happens to the raw Error's scary message — then run it.",
    code: `// The error pipeline in miniature: throw typed, map centrally, leak nothing.

class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly type: string) {
    super(message);
  }
}

class NotFoundError extends ApiError {
  constructor(resource: string, id: string) {
    super(\`\${resource} \${id} not found\`, 404, "/problems/not-found");
  }
}

class ConflictError extends ApiError {
  constructor(message: string) {
    super(message, 409, "/problems/conflict");
  }
}

class ValidationError extends ApiError {
  constructor(readonly issues: string[]) {
    super("Request body failed validation", 422, "/problems/validation");
  }
}

// Deterministic stand-in for a random request id (real code: crypto.randomUUID()).
let seq = 100;
const newRequestId = () => \`req_\${(seq++).toString(16)}\`;

// THE one place errors become HTTP. Note the parameter type: unknown.
function toProblem(err: unknown): { status: number; body: object } {
  if (err instanceof ValidationError) {
    return { status: 422, body: { type: err.type, title: err.message, status: 422, errors: err.issues } };
  }
  if (err instanceof ApiError) {
    return { status: err.status, body: { type: err.type, title: err.message, status: err.status } };
  }
  // Unknown error → never-leak rule: full detail to the log, only an id to the wire.
  const correlationId = newRequestId();
  const detail = err instanceof Error ? err.message : String(err);
  console.log(\`   [server log] \${correlationId}: \${detail}\`);
  return { status: 500, body: { type: "about:blank", title: "Internal Server Error", status: 500, correlationId } };
}

// Four "handlers", each throwing a different way:
const handlers: Array<[string, () => never]> = [
  ["GET /orders/42", () => { throw new NotFoundError("order", "42"); }],
  ["PUT /orders/7", () => { throw new ConflictError("Order 7 was modified by another request"); }],
  ["POST /orders", () => { throw new ValidationError(["items: must not be empty", "currency: invalid enum value"]); }],
  // A bug: the DB driver throws a raw Error full of internals.
  ["GET /orders/9", () => { throw new Error("connect ECONNREFUSED db-prod-3.internal:5432 (user=api_rw)"); }],
];

for (const [route, handler] of handlers) {
  try {
    handler();
  } catch (err) {
    const { status, body } = toProblem(err);
    console.log(\`\${route} -> \${status} \${JSON.stringify(body)}\`);
  }
}`,
  },

  keyPoints: [
    "Define an `ApiError` base class carrying `status` and a problem `type`; subclasses like `NotFoundError`, `ConflictError`, `ValidationError` let any layer throw with HTTP intent attached.",
    "Map every thrown value to a Problem Details response (RFC 9457, `application/problem+json`) in exactly ONE function — the hand-rolled equivalent of Laravel's exception handler.",
    "The mapper's input type is `unknown`, because JavaScript lets you throw anything — switch on `instanceof`, most specific class first.",
    "Never-leak rule: unknown errors become a generic 500 problem carrying only a correlation id; the message, stack, and context go to the server log under that same id.",
    "Express 5 forwards rejected promises from async handlers to error middleware automatically, but explicit propagation (`next(err)` or an `asyncHandler` wrapper) is the portable habit worth keeping.",
    "Error-handling middleware in Express is the four-argument function `(err, req, res, next)` registered after all routes.",
  ],

  interview: [
    {
      q: "How would you design error handling for a REST API?",
      a: "I'd centralise it. Domain and service code throws typed error classes — `NotFoundError`, `ConflictError`, `ValidationError` — each carrying a status code and a stable problem `type` URI. Routes never format errors themselves; a single error middleware maps whatever was thrown to an RFC 9457 Problem Details body with `application/problem+json`. The mapper takes `unknown` and switches on `instanceof`. Anything it doesn't recognise is a bug: it gets logged in full with a correlation id, and the client receives only a generic 500 problem containing that id. That gives clients a machine-readable contract, gives support a grep-able reference, and guarantees internals never reach the wire.",
    },
    {
      q: "Why is echoing an exception message to the API client dangerous?",
      a: "Because exception messages are written for developers, not clients. A PDO or Postgres driver message can include SQL fragments, table and column names, internal hostnames, file paths, and even the DB username from the connection string — exactly the reconnaissance an attacker wants before trying injection or lateral movement. I've seen plenty of legacy PHP endpoints do `echo $e->getMessage()` in a catch block. The fix is a whitelist mindset: only error classes explicitly designed for the wire get their message sent; everything else is logged server-side and replaced with a generic problem plus a correlation id.",
    },
    {
      q: "How do async errors reach your error handler in Express, and does Express 5 change anything?",
      a: "In Express 4, a rejected promise in an async handler is lost unless you catch it and call `next(err)` — the classic fix is a tiny `asyncHandler` wrapper that does `fn(req, res, next).catch(next)`. Express 5's migration guide says rejected promises from async handlers are now forwarded to the error middleware automatically, which removes that footgun. I still write explicit propagation, though: it works identically on Express 4, on other frameworks, and it makes the error path visible rather than magical. Either way, the destination is the same four-argument error middleware, registered last, which runs my `toProblem` mapper.",
    },
  ],

  quiz: [
    {
      question:
        "Your central error mapper receives a value it doesn't recognise (not one of your ApiError subclasses). Per the never-leak rule, what should the client receive?",
      options: [
        "The error's message, so the client can debug the problem",
        "A 500 with the stack trace in development mode only",
        "A generic 500 Problem Details body containing only a correlation id, while the full error is logged server-side under that id",
        "Nothing — close the connection without a response",
      ],
      answerIndex: 2,
      explain:
        "Unknown errors are bugs, and their messages routinely contain SQL, paths, and hostnames. The client gets a generic problem plus a correlation id; the id links to a full server-side log entry so support and developers lose nothing. Even 'dev mode only' leaks eventually — environments get misconfigured.",
    },
    {
      question:
        "Why signal failures by throwing typed error classes (NotFoundError, ConflictError) from the service layer instead of returning status codes from it?",
      options: [
        "Exceptions are faster than return values in V8",
        "A throw from any depth reaches the single central mapper, and the class carries the HTTP status and problem type so the mapping is defined once",
        "Because Express cannot read return values from handlers",
        "Typed errors are automatically serialised to JSON by JSON.stringify",
      ],
      answerIndex: 1,
      explain:
        "The win is centralisation: code three calls deep throws `new NotFoundError(...)` and the error middleware turns it into a 404 problem — no threading of status codes up the call stack, no per-route formatting. The class itself is the contract. (JSON.stringify does not serialise Error fields automatically, and performance is irrelevant here.)",
    },
    {
      question:
        "In Express, what distinguishes error-handling middleware from ordinary middleware?",
      options: [
        "It is registered with app.error() instead of app.use()",
        "It has four parameters — (err, req, res, next) — and is registered after the routes",
        "It must be the first middleware registered",
        "It only runs when you call res.error()",
      ],
      answerIndex: 1,
      explain:
        "Express identifies error middleware by arity: exactly four declared parameters, err first. It's registered last so every route and middleware before it can forward errors into it — via throw (async handlers in Express 5) or an explicit next(err).",
    },
  ],
};

export default lesson;
