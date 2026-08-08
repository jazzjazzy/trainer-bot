import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "centralized-errors",
  title: "An Error Strategy That Survives Production",
  part: "Production Hardening",
  estMinutes: 12,
  summary:
    "Split errors into operational (expected — respond and move on) and programmer (unknown state — log and let the process die), and build one error middleware that handles both without ever leaking a stack trace.",

  concept: `
In PHP, an uncaught exception torched exactly one request; FPM handed the next
request a fresh process and life went on. In Node, every error happens inside
the ONE process that is also serving everyone else. That raises the stakes and
forces a question PHP never made you answer precisely: *which errors should be
handled, and which should be allowed to kill the process?*

### Operational vs programmer errors

The production Node convention splits errors into two kinds:

- **Operational errors** are expected failures of a correct program: invalid
  input, a missing record, a downstream API timing out, a full disk. The
  program knows exactly what state it's in. **Handle them**: map to a status
  code, respond, log at \`warn\` or \`error\`, keep serving.
- **Programmer errors** are bugs: \`Cannot read properties of undefined\`, a
  broken invariant, an assertion failure. The process is in an *unknown* state
  — a half-finished write, a corrupted in-memory cache that every future
  request will now see. **Don't limp on**: log everything, return a generic
  500 for the current request if you can, and let the process exit so the
  supervisor (PM2, Kubernetes) restarts it clean.

Make the distinction machine-readable with a base class:

\`\`\`ts
// src/errors.ts
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly isOperational = true;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(\`\${resource} not found\`, 404, "NOT_FOUND");
  }
}
\`\`\`

Anything that is \`instanceof AppError\` is a deliberate, expected failure.
Anything else reaching the error middleware is a bug.

### The one error middleware

Express 5 forwards rejected promises from async handlers straight to your
error middleware — the 4-argument function registered *last*:

\`\`\`ts
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  const requestId = req.id; // from pino-http / a request-id middleware
  if (err instanceof AppError) {
    req.log.warn({ err, code: err.code }, err.message);
    res.status(err.status).json({ error: err.message, code: err.code, requestId });
    return;
  }
  // Programmer error: full detail to the log, nothing to the client.
  req.log.error({ err }, "unhandled error");
  res.status(500).json({ error: "Internal server error", code: "INTERNAL", requestId });
});
\`\`\`

Two rules are doing the heavy lifting. First, **the client never sees a stack
trace or a raw error message from a bug** — the same instinct as
\`display_errors = Off\` in production \`php.ini\`, except here it's your code's
job, not an ini flag's. Second, **every error response carries the request's
correlation ID**, so when a user emails support with \`requestId: "req-8fz2"\`,
you can \`grep\` your pino logs and see the full error with stack, because
pino's built-in \`err\` serializer expands \`type\`, \`message\`, and \`stack\`
into structured JSON.

### Wrapping errors with \`cause\`

When a low-level failure surfaces as a high-level one, chain them. PHP did
this through the exception constructor's third argument and
\`getPrevious()\`; JavaScript does it with the \`cause\` option:

\`\`\`ts
try {
  await fetch(\`\${PAYMENTS_URL}/charge\`, { method: "POST", body });
} catch (err) {
  throw new UpstreamError("payment provider unreachable", { cause: err });
}
\`\`\`

Pino serializes the whole chain, so the log shows *"payment provider
unreachable" BECAUSE "ECONNREFUSED 10.0.3.7:443"* — the context and the root
cause in one entry.

### What this middleware cannot catch

The error middleware only sees errors that flow through a request: thrown in
a handler, rejected from an async handler, or passed to \`next(err)\`. Errors
outside any request — a broken timer, a crashed event listener, a rejection
nobody awaited — bypass Express entirely and hit the process-level nets
(\`process.on("uncaughtException")\` / \`"unhandledRejection"\`), whose only
correct move is log-and-exit. The two layers are a team: middleware for
request-scoped errors, process handlers for everything else.
`,

  comparisons: [
    {
      label: "Central error handling: Laravel Handler vs error middleware",
      intro:
        "Both frameworks funnel every uncaught request error into one place that logs it and shapes the client response. Laravel gives you a class with report/render hooks; Express gives you a plain function.",
      php: `<?php
// app/Exceptions/Handler.php (Laravel)
class Handler extends ExceptionHandler
{
    public function report(Throwable $e): void
    {
        // logging side: goes to laravel.log / a channel
        parent::report($e);
    }

    public function render($request, Throwable $e)
    {
        // response side: shape what the client sees
        if ($e instanceof ModelNotFoundException) {
            return response()->json(
                ['error' => 'Not found'], 404
            );
        }
        // APP_DEBUG=false hides the stack trace page
        return parent::render($request, $e);
    }
}`,
      ts: `// src/app.ts (Express 5) — registered AFTER all routes
import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errors.js";

app.use((err: unknown, req: Request, res: Response,
         next: NextFunction) => {
  const requestId = req.id;

  if (err instanceof AppError) {
    // "report": structured log with pino's err serializer
    req.log.warn({ err, code: err.code }, err.message);
    // "render": safe, intentional client message
    res.status(err.status)
       .json({ error: err.message, code: err.code, requestId });
    return;
  }

  req.log.error({ err }, "unhandled error");
  res.status(500)
     .json({ error: "Internal server error", requestId });
});`,
      note: "Same two jobs — report (log) and render (respond) — but in Express it's one 4-arg function you register last; Express 5 routes rejected async handlers here automatically.",
    },
    {
      label: "Exception chaining: getPrevious() vs error.cause",
      intro:
        "A low-level connection failure is wrapped in a domain-level error so the caller sees intent while the log keeps the root cause.",
      php: `<?php
try {
    $client->post('/charge', $payload);
} catch (ConnectException $e) {
    // previous exception rides in the 3rd constructor arg
    throw new PaymentFailedException(
        'payment provider unreachable',
        0,
        $e
    );
}

// later, in the handler:
$root = $e->getPrevious();
Log::error($e->getMessage(), [
    'cause' => $root?->getMessage(),
]);`,
      ts: `try {
  await fetch(\`\${PAYMENTS_URL}/charge\`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
} catch (err) {
  // cause is a first-class option on every Error
  throw new UpstreamError(
    "payment provider unreachable",
    { cause: err },
  );
}

// later: pino's err serializer walks the chain,
// so one log line shows the wrapper AND the
// ECONNREFUSED underneath it.`,
      note: "Same idea, cleaner syntax: `cause` is a named option instead of a positional third constructor argument, and it works on plain Error — no custom class required.",
    },
    {
      label: "Hiding failure detail from clients",
      intro:
        "A bug throws deep inside the request. Production must log the full stack but show the client nothing exploitable.",
      php: `; php.ini (production)
; the classic switch: errors go to the log,
; never to the response body
display_errors = Off
log_errors = On
error_log = /var/log/php/error.log

; forget this and a fatal error prints the
; stack trace + file paths into the HTML`,
      ts: `// The Node equivalent is explicit code, not config.
// The middleware decides per-error what escapes:

req.log.error({ err }, "unhandled error"); // full stack -> logs

res.status(500).json({
  error: "Internal server error",  // generic on purpose
  code: "INTERNAL",
  requestId,                       // support can grep for this
});

// NEVER: res.status(500).json({ error: err.message,
//   stack: err.stack }) — that's display_errors=On.`,
      note: "PHP hid stacks with an ini flag; in Node nothing hides them for you — the split between what's logged and what's sent is a decision your middleware makes on every error.",
      leftLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of the production error middleware: toErrorResponse() maps an AppError subclass tree — plus one raw TypeError standing in for a bug — to {status, body, logLevel}. Predict which of the four errors leaks its real message to the client, then run it.",
    code: `// Operational errors: a small class tree the middleware can trust.
class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly isOperational = true;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

class NotFoundError extends AppError {
  constructor(resource: string) {
    super(\`\${resource} not found\`, 404, "NOT_FOUND");
  }
}
class ValidationError extends AppError {
  constructor(detail: string) {
    super(detail, 400, "VALIDATION");
  }
}
class UpstreamTimeoutError extends AppError {
  constructor(service: string) {
    super(\`\${service} timed out\`, 504, "UPSTREAM_TIMEOUT");
  }
}

interface ErrorResponse {
  status: number;
  body: { error: string; code: string; requestId: string };
  logLevel: "warn" | "error";
}

// The heart of the error middleware, as a pure function:
function toErrorResponse(err: unknown, requestId: string): ErrorResponse {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: err.message, code: err.code, requestId },
      logLevel: err.status >= 500 ? "error" : "warn",
    };
  }
  // Programmer error: unknown state. Log everything, tell the client nothing.
  return {
    status: 500,
    body: { error: "Internal server error", code: "INTERNAL", requestId },
    logLevel: "error",
  };
}

const incoming: unknown[] = [
  new NotFoundError("User 42"),
  new ValidationError("email must be a string"),
  new UpstreamTimeoutError("payments-api"),
  new TypeError("Cannot read properties of undefined (reading 'id')"),
];

for (let i = 0; i < incoming.length; i++) {
  const r = toErrorResponse(incoming[i], \`req-\${100 + i}\`);
  console.log(
    \`\${r.logLevel.toUpperCase().padEnd(5)} \${r.status} \${r.body.code.padEnd(16)} client sees: "\${r.body.error}"\`,
  );
}

// The TypeError's real message goes to the LOG (with its stack),
// never into the response body.`,
  },

  keyPoints: [
    "Operational errors (bad input, 404, downstream timeout) are expected — map them to a status code, respond, and keep serving. Programmer errors (`undefined is not a function`) mean unknown state — log fully and let the supervisor restart the process.",
    "Encode the distinction in an `AppError` base class with `status`, `code`, and `isOperational`; the error middleware branches on `instanceof AppError`.",
    "The client response for a bug is always generic (`Internal server error` + a `requestId`) — leaking `err.message` or `err.stack` is the Node equivalent of shipping with `display_errors = On`.",
    "Pino's `err` serializer turns a logged error into structured JSON with type, message, and stack — pass `{ err }` as the first argument to `req.log.error`.",
    "Chain errors with `new Error('high-level story', { cause: lowLevelErr })` — the modern, option-based version of PHP's previous-exception argument and `getPrevious()`.",
    "The error middleware only catches request-scoped errors; timers, event listeners, and un-awaited rejections bypass it and hit the `process.on('uncaughtException'/'unhandledRejection')` nets, which should log and exit.",
  ],

  interview: [
    {
      q: "What's the difference between operational and programmer errors in Node, and why does the distinction matter more than it did in PHP?",
      a: "Operational errors are expected failures of a correct program — invalid input, a missing row, a downstream timeout. The app knows its state, so it should map them to a response and keep going. Programmer errors are bugs — `undefined is not a function`, violated invariants — after which the process state is unknown, so the right move is to log everything and let the process exit and be restarted by PM2 or Kubernetes. In PHP the distinction barely mattered because FPM discarded the whole process after every request anyway; a corrupted state lived for milliseconds. In Node the process serves every user for days, so limping on after a bug means every future request runs against possibly-corrupted module-level state. I encode the split with an `AppError` base class and branch on `instanceof` in the error middleware.",
    },
    {
      q: "Walk me through your production Express error middleware.",
      a: "It's the 4-argument `(err, req, res, next)` function registered after all routes — in Express 5, rejected promises from async handlers land there automatically, no wrapper needed. If the error is `instanceof AppError` I log it at `warn` with pino's `err` serializer and return its status, message, and machine-readable code. Anything else is treated as a bug: I log the full error with stack at `error` level and return a generic 500 — the client never sees the real message or stack, same principle as `display_errors = Off`. Every response includes the request's correlation ID so a support ticket can be matched to the exact structured log entry. Request-scoped errors stop there; anything outside a request falls through to `process.on('uncaughtException')`, which logs and exits so the supervisor restarts clean.",
    },
    {
      q: "How do you preserve the root cause when you wrap a low-level error in a domain error?",
      a: "With the standard `cause` option: `throw new UpstreamError('payment provider unreachable', { cause: err })`. It's the same pattern as PHP's previous-exception chaining — `new PaymentFailedException($msg, 0, $e)` plus `getPrevious()` — but `cause` is a named option on every `Error`, not a positional constructor argument on a custom class. The win shows up in logging: pino's error serializer walks the chain, so one log entry tells the whole story — the domain-level context on top and the `ECONNREFUSED` that actually happened underneath. Without chaining you either lose the root cause or lose the context, and you end up debugging from whichever half survived.",
    },
  ],

  quiz: [
    {
      question:
        "A request handler throws `TypeError: Cannot read properties of undefined`. According to the operational/programmer split, what should your system do?",
      options: [
        "Catch it, return 400 Bad Request, and continue normally",
        "Return a generic 500 with a request ID, log the full error, and let the process exit for a clean restart",
        "Return the error message and stack to the client so they can report it accurately",
        "Retry the handler once before responding",
      ],
      answerIndex: 1,
      explain:
        "A TypeError is a programmer error — the process state is unknown, so after logging everything and answering the current request generically, the safest move is a supervised restart. Returning 400 mislabels a bug as the client's fault, and sending the message/stack leaks internals (the display_errors=On mistake).",
    },
    {
      question:
        "Why does the error middleware branch on `instanceof AppError` rather than checking `err.message` or status codes on arbitrary errors?",
      options: [
        "instanceof is faster than string comparison",
        "Only AppError instances are guaranteed to be deliberate, expected failures with a safe message and intended status",
        "Express 5 requires all errors to extend AppError",
        "instanceof works across process boundaries",
      ],
      answerIndex: 1,
      explain:
        "AppError is the marker your own code attaches to failures it planned for — its message was written to be shown to clients and its status is intentional. Any other error could be a bug carrying internal details, so it gets the generic 500 treatment. Express has no such requirement; it passes through whatever was thrown.",
    },
    {
      question: "What does `new Error('fetch failed', { cause: err })` give you?",
      options: [
        "It retries the failed operation automatically",
        "It merges the two stack traces into one",
        "It attaches the original error so loggers and handlers can see the high-level context and the root cause together",
        "It converts the error into an operational error",
      ],
      answerIndex: 2,
      explain:
        "cause chains the original error onto the wrapper, like PHP's getPrevious(). Nothing is retried or merged — but a serializer like pino's can walk the chain and log 'fetch failed BECAUSE ECONNREFUSED' as one structured entry.",
    },
    {
      question:
        "Which error will your Express error middleware NOT catch?",
      options: [
        "A rejected promise from an async route handler in Express 5",
        "An error passed to next(err) from ordinary middleware",
        "A throw inside a synchronous route handler",
        "A rejection from a setInterval callback running between requests",
      ],
      answerIndex: 3,
      explain:
        "The error middleware only sees errors that flow through a request pipeline. A timer callback has no req/res and no next — its failure bypasses Express and reaches the process-level handlers (uncaughtException / unhandledRejection), whose job is to log and exit.",
    },
  ],
};

export default lesson;
