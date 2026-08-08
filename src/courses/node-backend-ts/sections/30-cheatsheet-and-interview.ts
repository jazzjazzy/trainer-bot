import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-and-interview",
  title: "Cheatsheet and Interview Prep",
  part: "Scaling & Shipping",
  estMinutes: 14,
  summary:
    "The whole course on one page: the PHP→Node translation table, plus the five interview narratives that turn thirty sections into answers a hiring panel remembers.",

  concept: `
Thirty sections compress into one table and five stories. The table is the
vocabulary; the stories are what actually get you hired.

### The translation table

| PHP world | Node world | The catch |
| --- | --- | --- |
| Composer / Packagist | npm / registry | \`package-lock.json\` ≈ \`composer.lock\`; \`npm ci\` in CI |
| PSR-4 autoloading | ESM \`import\` | resolved at module load, cached once per process |
| PSR-15 / Laravel middleware | Express middleware | \`(req, res, next)\` — call \`next()\` or the request hangs |
| PDO prepared statements | \`pg\` Pool + \`$1, $2\` | positional only; the Pool outlives every request |
| Monolog | pino | JSON to stdout; child loggers carry request context |
| PHP-FPM worker pool | \`node:cluster\` / PM2 / container replicas | processes share nothing — externalize state |
| \`$_SESSION\` | JWT or Redis-backed session | process memory is shared across users, never a session store |
| vlucas/phpdotenv | \`node --env-file=.env\` | built into Node; production injects real env vars |
| PHPUnit | \`node:test\` + supertest | the runner ships with the runtime |
| \`php artisan serve\` | \`tsx watch src/server.ts\` | \`tsc\` typechecks; tsx runs |

### The five narratives

**1. The event loop and what blocks it.** One thread runs all JavaScript;
I/O waits in the kernel, callbacks queue up, microtasks (promises) drain
completely between macrotasks (timers, I/O). Synchronous CPU work —
\`JSON.parse\` on 50MB, sync crypto, a hot loop — blocks **every concurrent
user**, not one worker. PHP-FPM isolated the blast radius per request; Node
makes it global. That's the trade for holding 10,000 idle connections for
free.

**2. Why unhandled rejections crash, and the guards.** Since Node 15 an
unhandled promise rejection terminates the process — correct behavior,
because a long-lived process that limps on in unknown state corrupts every
later request. Guards: Express 5 forwards async handler rejections to error
middleware automatically; a centralized error handler distinguishes expected
failures from bugs; a \`process.on('unhandledRejection')\` logger plus a
supervisor (container restart policy) covers the rest.

**3. Express 5 vs 4 vs Fastify.** Express 5: async errors auto-forwarded (no
more wrapper functions), path-to-regexp v8 syntax (\`/{*splat}\`, optionals
\`/users{/:id}\`, no inline regex), \`req.query\` read-only. Express 4 is the
legacy you'll maintain: hand-rolled \`asyncHandler\` everywhere. Fastify: JSON
Schema validation built into the route contract, type providers infer request
types, faster serialization — the performance-and-structure choice, at the
cost of a smaller middleware ecosystem.

**4. How you scale a Node API.** Vertically Node uses one core per process,
so scaling is horizontal: cluster/PM2 on one box, container replicas behind a
load balancer beyond it. The prerequisite is that processes share nothing —
sessions to Redis or JWT, caches to Redis, WebSocket fan-out through pub/sub.
State in process memory is the thing that stops you scaling.

**5. The graceful-shutdown deploy story.** SIGTERM arrives (deploy,
scale-down), \`server.close()\` stops new connections, in-flight requests
drain, the pg Pool closes, exit 0. It only works if the signal reaches node —
exec-form \`CMD ["node", "dist/server.js"]\`, never \`npm start\` as PID 1 —
and the platform's health checks gate new containers in before old ones go.

Tell any of these five and land the same closing note: **PHP threw the world
away after every request; Node keeps the world alive — that's the feature
and the responsibility.**
`,

  comparisons: [
    {
      label: "Best-of #1: the request lifecycle",
      intro:
        "The single deepest difference in the course, one file each: what happens between two consecutive requests.",
      php: `<?php // public/index.php — EVERY request starts the world from zero
require __DIR__ . '/vendor/autoload.php'; // load classes again
$config = require 'config/app.php';       // parse config again
$pdo = new PDO($config['dsn']);           // connect to Postgres AGAIN
$router->dispatch($_SERVER['REQUEST_URI']); // handle ONE request
// ...then the process state is discarded. Crashes only kill this
// one request. Globals can't leak between users. Blocking sleep(5)
// stalls one worker, not the site.`,
      ts: `// src/server.ts — the world boots ONCE, then serves forever
import { app } from "./app.js";
import { pool } from "./db.js"; // warm connections, reused for months

const server = app.listen(3000); // one process, ALL requests

process.on("SIGTERM", () => {    // so it must know how to die politely
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});
// Module state persists across requests (cache: feature, session
// data: leak). One unhandled rejection or blocking loop affects
// EVERY user in flight.`,
      note: "Everything in this course follows from this pair: pooling, module singletons, graceful shutdown, and the blocking footgun are all consequences of the process outliving the request.",
    },
    {
      label: "Best-of #2: validation at the boundary",
      intro:
        "Untrusted input becomes trusted, typed data. PHP checks values; zod checks values and hands the type system proof.",
      php: `<?php // validate, then hope everyone downstream remembers
$email = filter_var($_POST['email'] ?? '', FILTER_VALIDATE_EMAIL);
$age   = filter_var($_POST['age'] ?? '', FILTER_VALIDATE_INT);

if ($email === false || $age === false || $age < 18) {
    http_response_code(422);
    echo json_encode(['error' => 'invalid input']);
    exit;
}
// $email is now "probably a string" — nothing enforces it
// three function calls deeper.`,
      ts: `import { z } from "zod";

const signupSchema = z.object({
  email: z.email(),
  age: z.coerce.number().int().min(18),
});
type Signup = z.infer<typeof signupSchema>; // static type, for free

app.post("/signup", (req, res) => {
  const result = signupSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(422).json({ issues: result.error.issues });
  }
  register(result.data); // result.data: Signup — checked AND typed
});`,
      note: "safeParse returns a discriminated union instead of throwing, and z.infer derives the compile-time type from the runtime schema — one definition guards the boundary and types every layer behind it.",
    },
    {
      label: "Best-of #3: structured logging",
      intro:
        "Production logging in each stack: Monolog's handler pipeline vs pino's JSON-to-stdout with request-scoped children.",
      php: `<?php
use Monolog\\Logger;
use Monolog\\Handler\\StreamHandler;
use Monolog\\Level;

$log = new Logger('app');
$log->pushHandler(new StreamHandler('php://stderr', Level::Info));

$log->info('user registered', ['userId' => $user->id]);
// context array serialized per call; correlation across a
// request means threading an id through by hand.`,
      ts: `import { pino } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.authorization"], // secrets never hit disk
});

// pino-http gives every request a child logger + req id:
app.use(pinoHttp({ logger }));

app.post("/signup", (req, res) => {
  req.log.info({ userId: user.id }, "user registered");
  // JSON line to stdout, req id included — the container
  // platform collects it; pino-pretty is dev-only.
});`,
      note: "pino logs newline-delimited JSON to stdout — 12-factor style, aggregated by the platform — and pino-http's per-request child logger stamps every line with the request id automatically.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "An interview flash-quiz: ten questions covering the course's hardest recall points. Answer each out loud before reading the printed answer — the ones that surprise you mark the sections to reread.",
    code: `// Flash cards: the ten recall points a hiring panel actually probes.
// Read each question, answer OUT LOUD, then check yourself.

interface Card {
  q: string;
  a: string;
}

const cards: Card[] = [
  {
    q: "What runs first: process.nextTick, a resolved Promise callback, or setTimeout(fn, 0)?",
    a: "nextTick, then the microtask queue (Promise callbacks), then timer callbacks. Microtasks drain completely before the loop takes the next macrotask.",
  },
  {
    q: "Why does one slow JSON.parse hurt EVERY user, not just one?",
    a: "One event-loop thread serves all requests. Synchronous CPU work blocks the loop, so every in-flight response waits — in PHP-FPM only that one worker would stall.",
  },
  {
    q: "A module-level \`const cache = new Map()\` in a route file — bug or feature?",
    a: "Both. The process lives across requests, so it is a free in-memory cache — and a cross-user data leak if you ever key it by 'current user' instead of an explicit id.",
  },
  {
    q: "What happens to an unhandled promise rejection in modern Node?",
    a: "It crashes the process (default since Node 15). Guard with try/catch in handlers, a process-level unhandledRejection logger, and a supervisor that restarts the process.",
  },
  {
    q: "Why did Express 5 make asyncHandler wrappers obsolete?",
    a: "Express 5 forwards rejected promises from async handlers and middleware to the error middleware automatically; in Express 4 a rejection escaped the chain and you had to catch-and-next yourself.",
  },
  {
    q: "Express 5 route syntax for 'match everything under /files/'?",
    a: "A named wildcard: app.get('/files/{*path}', ...). Bare * is gone in path-to-regexp v8, and optional segments use braces like /users{/:id}.",
  },
  {
    q: "Parameterized query placeholders in pg vs PDO?",
    a: "pg uses positional $1, $2 with a values array: pool.query('SELECT * FROM users WHERE id = $1', [id]). PDO used ? or :named — same injection protection, different spelling.",
  },
  {
    q: "zod's safeParse vs parse?",
    a: "parse returns typed data or throws; safeParse returns a discriminated union { success: true, data } | { success: false, error } — no exception, and z.infer gives the static type either way.",
  },
  {
    q: "Why must Docker CMD be [\\"node\\", \\"dist/server.js\\"] and not \\"npm start\\"?",
    a: "npm as PID 1 does not forward SIGTERM, so graceful shutdown never runs and Docker kills the container after the grace period. Exec-form node gets the signal directly.",
  },
  {
    q: "Two Node instances behind a load balancer — why does a WebSocket broadcast miss half the users?",
    a: "Each process only knows its own sockets; processes share nothing. Externalize the fan-out through Redis pub/sub (or use Socket.IO's Redis adapter) so every instance relays to its own clients.",
  },
];

cards.forEach((card, i) => {
  console.log(\`Q\${i + 1}. \${card.q}\`);
  console.log(\`    \${card.a}\`);
  console.log("");
});
console.log(\`\${cards.length}/10 — if any answer surprised you, reread that section.\`);`,
  },

  keyPoints: [
    "The one-line course: PHP-FPM boots a fresh world per request and throws it away; Node boots once and serves forever — so module state persists (cache = feature, per-user data = leak) and blocking code blocks everyone.",
    "Translation table: Composer→npm, PSR-4→ESM imports, PSR-15→`(req, res, next)` middleware, PDO→pg Pool with `$1` params, Monolog→pino, FPM pool→cluster/replicas, `$_SESSION`→JWT or Redis, PHPUnit→`node:test`.",
    "Express 5 essentials: async handler rejections auto-forward to the 4-arg error middleware, wildcard routes are `/{*splat}`, optionals are `/users{/:id}`, and `req.query` is a read-only getter.",
    "Validation story: zod schemas at the boundary — `safeParse` returns a discriminated union, `z.infer` derives the static type, validated data flows typed through services.",
    "Scaling story: one core per process → cluster/PM2/replicas, and it only works because nothing lives in process memory — sessions, cache, and socket fan-out all externalize to Redis.",
    "Deploy story: multi-stage image, env at runtime, `/health` for the orchestrator, SIGTERM → `server.close()` → drain → `pool.end()` — reachable only with exec-form `CMD [\"node\", ...]` as PID 1.",
  ],

  interview: [
    {
      q: "Panel opener: 'You've done PHP for 25 years. Walk us through what actually changes when a request hits a Node API instead of a PHP one — and where that bit you while learning.'",
      a: "In PHP-FPM, a request means a worker process boots my application from zero — autoload, config, new PDO connection — handles one request, and discards everything; isolation is free and state is impossible. In Node, the request arrives at a process that booted once, possibly weeks ago: the pg Pool is warm, module singletons are live, and my handler is one async function among hundreds interleaved on a single event-loop thread — awaiting I/O yields the thread, so concurrency comes from the loop, not from workers. What bit me: module-level state persists across requests and users, which is a free cache and a data leak depending on what you put there; and synchronous CPU work blocks every user, not one worker — the discipline PHP never demanded. The compensations are pooling, streaming, and graceful shutdown: a process that never dies has to be told how to die politely.",
    },
    {
      q: "Compound: 'Your Node API gets slow under load. Diagnose it — and explain how each suspect differs from what you'd look for in a PHP app.'",
      a: "First suspect: event-loop blocking — some handler doing synchronous CPU work, big JSON.parse, sync crypto, a hot loop. In PHP that stalls one worker; in Node it queues every concurrent request behind it, so p99 latency spikes across unrelated endpoints — I'd check event-loop lag metrics first. Second: sequential awaits that should be parallel — three independent queries awaited one after another triple latency; Promise.all fixes what PHP never let me choose. Third: pool exhaustion — pg Pool max is 10 by default, so slow queries make requests queue for connections; pool wait metrics and pg_stat_activity tell me, same as FPM pool saturation but for connections rather than workers. Fourth: an unhandled-rejection crash loop restarting the process and dumping its warm state. Only after those would I scale horizontally — more replicas amplify a blocking bug, they don't fix it.",
    },
    {
      q: "Compound: 'Express 5, Express 4, or Fastify — pick one for a new service, defend it, and tell us what you'd watch out for in each.'",
      a: "For a new service I'd default to Express 5 unless performance or schema discipline pushes me to Fastify. Express 5 keeps the largest ecosystem and middleware model — PSR-15 instincts transfer directly — and it fixed Express 4's worst trap: rejected promises from async handlers now flow to the error middleware automatically, so no more asyncHandler wrappers silently missing. Watch-outs: path-to-regexp v8 changed route syntax — named wildcards like /files/{*path}, optionals as /users{/:id}, no inline regex — and req.query is read-only now. Express 4 I'd only maintain, not start; its hazard is the unwrapped async handler that hangs a request or crashes the process. Fastify I'd pick when JSON Schema validation on every route and serialization speed matter: v5 wants full JSON Schema objects and type providers give inferred request types — more structure up front, fewer per-route decisions later. The honest close: the framework is the thin layer; the event loop underneath is the thing that actually determines behavior.",
    },
    {
      q: "Compound: 'Take us from git push to serving traffic: your image, your config, your health checks, and exactly what happens to the old containers.'",
      a: "CI builds a multi-stage image: npm ci with the lockfile, tsc to dist/, then a clean node:22-slim runtime stage with npm ci --omit=dev, the compiled dist/, USER node, and exec-form CMD [\"node\", \"dist/server.js\"] — that exec form matters later. The image is immutable; DATABASE_URL, JWT secret, and log level are injected as env vars at runtime, so staging and production run the identical artifact. The platform starts new containers and polls /health — a trivial endpoint that stops answering if the event loop is wedged — and only healthy containers join the load balancer. Old containers then get SIGTERM: because node is PID 1, my handler runs — server.close() stops new connections, in-flight requests drain, pool.end() returns connections to Postgres, exit 0. If I'd used npm start, npm would swallow that SIGTERM and Docker would SIGKILL mid-request after ten seconds. Scaling from there is replicas, which works because nothing lives in process memory — sessions are JWT or Redis, and any WebSocket fan-out goes through Redis pub/sub.",
    },
  ],

  quiz: [
    {
      question:
        "A teammate ports a PHP habit: they stash the current user's profile in a module-level variable during middleware, then read it in the handler. What's the failure mode?",
      options: [
        "Nothing — module state is request-scoped in Node like it was in PHP",
        "A race: with concurrent requests interleaving on one process, user B's middleware can overwrite the variable before user A's handler reads it — cross-user data leak",
        "A compile error — TypeScript forbids mutable module-level variables",
        "The variable resets on every request, so the handler always sees undefined",
      ],
      answerIndex: 1,
      explain:
        "This is the course's core footgun. PHP's globals were safe because the process served exactly one request. Node's module state is shared by every interleaved request in the process. Request-scoped data must travel on the request (res.locals, AsyncLocalStorage), never in module scope.",
    },
    {
      question:
        "Which pairing in the translation table is WRONG?",
      options: [
        "Monolog → pino",
        "PSR-15 middleware → Express (req, res, next) middleware",
        "$_SESSION → module-level Map keyed by session id",
        "Composer lockfile + install → package-lock.json + npm ci",
      ],
      answerIndex: 2,
      explain:
        "An in-process Map dies on restart and — worse — isn't visible to other instances, so scaling breaks sessions. The translation for $_SESSION is externalized state: a signed JWT (stateless) or a Redis-backed session store shared by all processes. The other three pairings are the standard mappings.",
    },
    {
      question:
        "Rank the fixes for an endpoint that awaits three independent database queries sequentially and occasionally crashes the whole process on a failed lookup:",
      options: [
        "Add more container replicas; increase the pool size",
        "Promise.all the three queries for latency; catch or let Express 5 forward the rejection to the error middleware so a failed lookup returns 500 instead of dying unhandled",
        "Convert the queries to synchronous calls so failures are catchable",
        "Wrap everything in process.on('uncaughtException') and keep the process alive no matter what",
      ],
      answerIndex: 1,
      explain:
        "Two course threads meet here: sequential awaits on independent work waste latency (Promise.all runs them concurrently), and in Express 5 an async handler's rejection auto-forwards to the 4-arg error middleware — the crash only happens when a rejection escapes handling entirely. Suppressing crashes globally leaves the process in unknown state; more replicas just crash in parallel.",
    },
    {
      question:
        "Your chat feature works with one instance but drops messages at two, and sessions randomly log out. Which single principle explains both bugs?",
      options: [
        "Node's cluster module corrupts WebSocket frames",
        "Processes share nothing: in-memory sessions and per-process wss.clients are invisible to the other instance — externalize both (Redis sessions/JWT, Redis pub/sub fan-out)",
        "The load balancer strips Upgrade headers unless sticky sessions are enabled",
        "Express 5 removed support for multi-instance deployments",
      ],
      answerIndex: 1,
      explain:
        "One principle, two symptoms. Each Node process has its own memory: a session map on instance A doesn't exist on B (random logouts), and A's socket Set doesn't contain B's clients (missed broadcasts). The scaling rule is always the same — state that must survive or span processes moves out of the process.",
    },
  ],
};

export default lesson;
