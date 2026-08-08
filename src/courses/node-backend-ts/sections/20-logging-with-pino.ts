import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "logging-with-pino",
  title: "Structured Logging with Pino",
  part: "Production Hardening",
  estMinutes: 11,
  summary:
    "One shared process interleaves every user's log lines, so you log structured JSON with pino — child loggers bind a requestId to every line, pino-http logs each request, and pino-pretty stays dev-only.",

  concept: `
In PHP, logs had a natural narrator: one request, one process, so the lines in
\`error_log\` (or a Monolog channel) between "request start" and "request end"
belonged to one story. In Node, **every concurrent request writes into the
same stdout of the same process**. Fifty in-flight requests means fifty
interleaved stories, and \`console.log("saving order")\` is useless — *whose*
order? The cure is structure: every line is a JSON object carrying its own
context, and a **requestId** stitches each story back together.

### Pino: JSON-first, object-first

Pino (v10 is current) is the ecosystem's standard structured logger — fast,
JSON-native:

\`\`\`ts
// src/logger.ts — another module-level singleton
import { pino } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.authorization", "*.password"], // secrets never land in logs
});

logger.info({ userId: 42, orderId: "A-981" }, "order saved");
// {"level":30,"time":1720000000000,"pid":7,"userId":42,"orderId":"A-981","msg":"order saved"}
\`\`\`

Note the signature: **object first, message second**. The mergeObject's fields
become top-level JSON keys your log aggregator can filter on
(\`userId=42\`) — the analogue of Monolog's context array, but as the primary
idiom rather than an optional trailing argument. Levels are numeric under the
hood (\`trace\` 10, \`debug\` 20, \`info\` 30, \`warn\` 40, \`error\` 50, \`fatal\`
60); \`level: "info"\` drops everything below 30 at (almost) zero cost.

### Child loggers: context bound once, present on every line

\`\`\`ts
const reqLog = logger.child({ requestId: crypto.randomUUID() });
reqLog.info("looking up user");        // requestId is on this line
reqLog.info({ rows: 3 }, "query done"); // ...and this one, automatically
\`\`\`

\`child()\` returns a logger with extra fields baked in. This is the whole
answer to interleaving: bind the requestId (and userId, route, whatever)
once at the top of the request, pass the child down, and every line it emits
is attributable. If you've used Monolog **channels** to separate concerns,
child loggers are the same instinct — except cheap enough to create one per
request.

### pino-http: the request logger middleware

\`\`\`ts
import { pinoHttp } from "pino-http";

app.use(pinoHttp({ logger }));  // FIRST middleware
// - assigns req.id (and puts it on every line)
// - exposes req.log — a child logger bound to this request
// - auto-logs one line per completed response: status, timing
\`\`\`

Handlers then use \`req.log.info(...)\` instead of the root logger — that's the
per-request child, wired for you. It's Laravel's access-log-plus-context in
one middleware.

### pino-pretty is for your eyes only

Raw pino output is one JSON object per line — perfect for machines
(aggregators like Loki, Datadog, CloudWatch), miserable for humans. In dev,
route it through the \`pino-pretty\` transport:

\`\`\`ts
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined, // prod: raw JSON to stdout, let the platform collect it
});
\`\`\`

Ship **raw JSON** in production — pretty-printing there burns CPU in your one
process and wrecks machine parsing. The Monolog map: **channels ≈ child
loggers, handlers + formatters ≈ transports** (where the lines go and how
they're shaped), processors ≈ bound context. And the twelve-factor rule
carries over: log to stdout, let the platform own shipping and rotation.
`,

  comparisons: [
    {
      label: "Logger setup and contextual logging",
      intro:
        "Set up an app logger and log an event with context. Monolog pushes handlers and passes a context array per call; pino is JSON-by-default and binds per-request context once with child().",
      php: `<?php
// Monolog: channel + handler + (implicit) formatter
use Monolog\\Logger;
use Monolog\\Handler\\StreamHandler;
use Monolog\\Level;

$log = new Logger('orders');                    // channel
$log->pushHandler(
    new StreamHandler('php://stdout', Level::Info)
);

// context array per call — repeated at EVERY call site:
$log->info('order saved', [
    'userId'    => 42,
    'requestId' => $requestId,
]);
$log->warning('stock low', [
    'sku'       => 'X-11',
    'requestId' => $requestId,  // don't forget it...
]);`,
      ts: `// src/logger.ts + handler — pino: bind context ONCE
import { pino } from "pino";

export const logger = pino({ level: "info" });

// per request: a child logger with the context baked in
const reqLog = logger.child({
  requestId: crypto.randomUUID(),
  userId: 42,
});

reqLog.info({ orderId: "A-981" }, "order saved");
reqLog.warn({ sku: "X-11" }, "stock low");
// BOTH lines carry requestId + userId automatically:
// {"level":30,...,"requestId":"...","userId":42,"orderId":"A-981","msg":"order saved"}
// {"level":40,...,"requestId":"...","userId":42,"sku":"X-11","msg":"stock low"}`,
      note:
        "Monolog's context array is per-call and forgettable; child() makes context structural — bound once, present on every line. Map: channels ≈ child loggers, handlers/formatters ≈ transports.",
    },
    {
      label: "Why plain-text lines fail in one shared process",
      intro:
        "Two users hit the API at the same moment and both paths log. PHP's per-request error_log lines were naturally scoped to one request; Node's stdout interleaves both users — only structure keeps them apart.",
      php: `<?php
// PHP-FPM: this process serves ONE request, so these
// consecutive error_log lines are all the same user:
error_log('payment started');
error_log('charging card');
error_log('payment failed: insufficient funds');
// [pid 811] payment started        <- all pid 811,
// [pid 811] charging card             one request,
// [pid 811] payment failed: ...       one story`,
      ts: `// Node: ONE process, interleaved output. Without structure:
//   payment started          <- whose?
//   payment started          <- whose??
//   charging card
//   payment failed: insufficient funds   <- WHICH user?

// With pino-http, each request logs through its child:
import { pinoHttp } from "pino-http";
app.use(pinoHttp({ logger }));            // assigns req.id, adds req.log

app.post("/pay", async (req, res) => {
  req.log.info("payment started");
  req.log.info({ amountCents: 4999 }, "charging card");
  // every line: {"level":30,"req":{"id":42,...},...,"msg":"payment started"}
  // -> aggregator filter req.id=42 replays ONE user's story
});`,
      note:
        "PHP got correlation for free from process-per-request (the pid WAS the request id). Node must add it back explicitly — pino-http's req.id on every line is that pid, reinvented for a shared process.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Pino in miniature: numeric levels, level filtering, and child() bindings. Two 'requests' log through their own children and the lines interleave — six calls are made, but predict which FIVE actually print (one is below the level threshold) and what fields each line carries, then run it.",
    code: `// Pino in miniature: structured JSON lines, numeric levels, and
// child loggers that bind context onto every line they emit.

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 20, info: 30, warn: 40, error: 50 };

interface Logger {
  child(bindings: Record<string, unknown>): Logger;
  debug(obj: Record<string, unknown>, msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

function createLogger(minLevel: Level, bindings: Record<string, unknown> = {}): Logger {
  const emit = (level: Level, obj: Record<string, unknown>, msg: string): void => {
    if (LEVELS[level] < LEVELS[minLevel]) return; // level filtering
    // One JSON object per line: bindings first, call-site fields, then msg.
    console.log(JSON.stringify({ level: LEVELS[level], ...bindings, ...obj, msg }));
  };
  return {
    // child() merges new bindings on top of the parent's — pino's API.
    child: (extra) => createLogger(minLevel, { ...bindings, ...extra }),
    debug: (obj, msg) => emit("debug", obj, msg),
    info: (obj, msg) => emit("info", obj, msg),
    warn: (obj, msg) => emit("warn", obj, msg),
    error: (obj, msg) => emit("error", obj, msg),
  };
}

const root = createLogger("info", { app: "shop-api" });

// Two concurrent requests, each with its own child logger.
// Their lines INTERLEAVE — exactly what happens in one shared process —
// but the bound requestId keeps every line attributable.
const reqA = root.child({ requestId: "req-a1", route: "GET /orders" });
const reqB = root.child({ requestId: "req-b2", route: "POST /orders" });

reqA.info({}, "request started");
reqB.info({}, "request started");
reqA.debug({ sql: "SELECT ..." }, "querying orders"); // filtered out: debug < info
reqB.warn({ field: "total" }, "missing field, using default");
reqA.info({ rows: 12, ms: 8 }, "request completed");
reqB.error({ err: "insert failed" }, "request failed");`,
  },

  keyPoints: [
    "One shared process interleaves every user's output — PHP's per-request `error_log` scoping is gone, so correlation (a requestId on every line) must be added back explicitly.",
    "Pino's idiom is object-first: `logger.info({ userId }, 'msg')` — the object's fields become top-level JSON keys aggregators can filter on; levels are numeric (debug 20, info 30, warn 40, error 50).",
    "`logger.child({ requestId })` bakes context into every subsequent line — Monolog channels' instinct, cheap enough to do per request.",
    "`pino-http` as early middleware assigns `req.id`, exposes the per-request child as `req.log`, and auto-logs each completed response with status and timing.",
    "`redact: ['req.headers.authorization', '*.password']` keeps secrets out of logs at the logger level, not by hoping call sites remember.",
    "`pino-pretty` is a dev-only transport — production ships raw JSON to stdout and lets the platform (Loki/Datadog/CloudWatch) collect it; twelve-factor logging carries straight over from PHP.",
  ],

  interview: [
    {
      q: "Why is structured logging more urgent in Node than it was in your PHP apps?",
      a: "Because Node takes away the free correlation PHP gave me. Under PHP-FPM each request had its own process, so consecutive error_log lines from one pid told one request's story in order. In Node, fifty concurrent requests write interleaved into the same stdout of the same process — a plain-text 'payment failed' line is unattributable. Structured logging fixes both halves: every line is a JSON object, so the aggregator can filter and index fields, and a requestId bound via a child logger stitches each request's lines back into a story. With pino-http that's one middleware: it assigns req.id, hands each handler a req.log child, and logs every response with status and timing.",
    },
    {
      q: "How would you map your Monolog experience onto pino?",
      a: "The concepts line up almost one-to-one. Monolog's context array — the second argument to $log->info() — is pino's first argument, the merge object, except pino makes it the primary idiom and the fields become top-level JSON keys. Channels map to child loggers: where I'd create an 'orders' channel, I call logger.child({ module: 'orders' }) — and children are cheap enough to create per request with a requestId, which Monolog channels weren't designed for. Handlers and formatters — where lines go and how they're shaped — map to pino transports, like pino-pretty in dev or just raw JSON to stdout in prod. Levels are the same RFC-style ladder, just numeric underneath: info is 30, error is 50, and the logger's level drops anything below its threshold cheaply.",
    },
    {
      q: "Why should pino-pretty never run in production?",
      a: "Two reasons, one about machines and one about your process. Production logs are consumed by aggregators — Loki, Datadog, CloudWatch — which want one parseable JSON object per line; pretty-printing turns that into colored, multi-line human text that breaks parsing and filtering. And the formatting work itself costs CPU inside the one process serving all my users — pino's speed comes from doing minimal work on the hot path, and a prettifier undoes that. So the transport is conditional on NODE_ENV: pino-pretty for my terminal in dev, raw JSON to stdout in prod, with the platform owning shipping and rotation — the same twelve-factor discipline as PHP containers logging to stdout.",
    },
  ],

  quiz: [
    {
      question: "What is pino's idiomatic call signature for logging with context?",
      options: [
        "logger.info('order saved', { userId: 42 }) — message first, like Monolog",
        "logger.info({ userId: 42 }, 'order saved') — merge object first, message second",
        "logger.info('order saved userId=' + userId) — interpolate into the string",
        "logger.info('order saved').with({ userId: 42 })",
      ],
      answerIndex: 1,
      explain:
        "Pino is object-first: the merge object's fields become top-level keys in the JSON line, filterable in your aggregator. It's Monolog's context array promoted to the primary argument — interpolating into the message string throws the structure away.",
    },
    {
      question:
        "You need every log line in a request to carry the same requestId. What's the pino way?",
      options: [
        "Add { requestId } to every single log call's merge object",
        "Set it as a global variable the logger reads",
        "Create a child once — logger.child({ requestId }) — and log through it (pino-http does this as req.log)",
        "Configure redact: ['requestId'] on the root logger",
      ],
      answerIndex: 2,
      explain:
        "child() returns a logger with the bindings baked into every line it emits — bind once at the top of the request, pass it down. pino-http automates exactly this: it assigns req.id and exposes the bound child as req.log. Repeating it per call is the forgettable Monolog-context pattern; redact hides fields, it doesn't add them.",
    },
    {
      question: "How should the pino-pretty transport be configured?",
      options: [
        "Always on — readable logs help debugging in production too",
        "Only in production, where logs matter most",
        "Only outside production: dev gets pretty output, prod ships raw JSON lines to stdout for the aggregator",
        "Never — pino-pretty is deprecated in pino 10",
      ],
      answerIndex: 2,
      explain:
        "Aggregators need one JSON object per line; pretty output breaks their parsing and burns CPU in the single process serving everyone. Gate the transport on NODE_ENV !== 'production' — human-friendly locally, machine-friendly where it counts.",
    },
  ],
};

export default lesson;
