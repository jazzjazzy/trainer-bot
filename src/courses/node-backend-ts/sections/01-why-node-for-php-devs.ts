import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-node-for-php-devs",
  title: "Why Node? The Death of the Dying Process",
  part: "The Runtime Shift",
  estMinutes: 12,
  summary:
    "PHP-FPM bootstraps a fresh world for every request and throws it away; Node is one long-running process where module-level state survives — the single mental-model shift everything else in this course hangs off.",

  concept: `
After 25 years of PHP you carry one assumption so deep you've stopped noticing
it: **when the request ends, everything dies**. Every \`$variable\`, every open
handle, every object graph — gone. The next request starts from a blank slate.
That assumption is wrong in Node, and unlearning it is the whole point of this
first part of the course.

### The PHP-FPM lifecycle: bootstrap, handle, die, forget

Under PHP-FPM, a pool of worker processes waits for requests. When one arrives,
a worker runs your entry script from the top: load the autoloader, read config,
wire the container, dispatch the route, render a response — then tear the whole
world down. Opcache keeps the *compiled bytecode* warm so parsing is cheap, but
your application **state** is rebuilt on every single request. A superglobal
like \`$_SESSION\` only *feels* persistent because it's serialized out to files
or Redis between requests.

This model is beautifully simple. A memory leak? Cleared in milliseconds when
the request ends. A fatal error? Kills one request; the other workers never
notice. Shared mutable state between users? Impossible by construction.

### Node: one process that never dies

Node is a single long-running process built from two pieces:

- **V8** — Google's JavaScript engine (the one in Chrome), which compiles your
  JS to machine code.
- **libuv** — a C library providing the event loop and non-blocking I/O, so one
  thread can juggle thousands of simultaneous connections.

You start the process once (\`node server.ts\`), it loads your modules **once**,
and then it sits there handling request after request *in the same memory
space*. A \`const\` at the top of a module is initialized at startup and lives
until the process exits — hours, days, weeks later.

### Feature and footgun

That persistence is why Node took over backend job listings: an in-memory
cache is just a \`Map\` at module scope; a database connection pool is created
once and reused across every request; there is no per-request bootstrap tax at
all. The process is *always warm*.

But every convenience is also a trap:

- **Leaks accumulate.** Push into a module-level array on every request and
  your process grows until it's OOM-killed. PHP forgave this; Node never does.
- **Cross-request data bleed.** Stash the "current user" in a module-level
  variable and two concurrent requests will overwrite each other — user A sees
  user B's data. In PHP that bug is unrepresentable.
- **One crash kills everyone.** An uncaught exception can take down the whole
  process — every in-flight request, not one. (Production setups restart the
  process; we cover that in the hardening part.)

Be honest in interviews: PHP's share-nothing model is *simpler and safer* per
request. Node trades that safety for throughput, statefulness, and one language
across the stack. Knowing the trade-off cold — both directions — is exactly
what "explain PHP's vs Node's execution model" panel questions are probing for.
`,

  comparisons: [
    {
      label: "The counter that can never count",
      intro:
        "Both files increment a top-level counter and report it. Hit each one five times: PHP answers 1, 1, 1, 1, 1 — Node answers 1, 2, 3, 4, 5.",
      php: `<?php
// counter.php — served by PHP-FPM
// This ENTIRE script runs fresh for every request.

$counter = 0;   // recreated from scratch each time
$counter++;

echo "This process has handled {$counter} request(s)";
// Always "1". The worker resets the world after responding.`,
      ts: `// counter.ts — one long-running Node process
import { createServer } from "node:http";

let counter = 0; // module scope: initialized ONCE at startup

createServer((req, res) => {
  counter++; // same variable, every request, every user
  res.end(\`This process has handled \${counter} request(s)\`);
}).listen(3000);
// 1, 2, 3, ... climbing until the process restarts.`,
      note:
        "Node's module scope is process-lifetime scope. That one fact powers in-memory caches and connection pools — and enables leaks and cross-request bleed PHP could never have.",
    },
    {
      label: "Where the bootstrap cost lives",
      intro:
        "Both apps load config and construct expensive services. PHP pays that price on every request; Node pays it once when the process boots.",
      php: `<?php
// public/index.php — runs top-to-bottom PER REQUEST
require __DIR__ . '/../vendor/autoload.php';

$config = require __DIR__ . '/../config/app.php';
$db     = new PDO($config['dsn']);      // reconnect*
$router = build_router($config);        // rebuilt

$response = $router->dispatch($_SERVER['REQUEST_URI']);
$response->send();
// *unless you opt into persistent connections —
// worker dies, request state dies with it.`,
      ts: `// src/server.ts — runs top-to-bottom ONCE, at startup
import { createServer } from "node:http";
import { loadConfig } from "./config.ts";
import { buildRouter } from "./router.ts";
import { createPool } from "./db.ts";

const config = loadConfig();          // once
const pool   = createPool(config.dsn); // once, reused forever
const router = buildRouter(config);    // once

createServer((req, res) => {
  // per-request work is ONLY the handling itself
  router.dispatch(req, res, pool);
}).listen(3000);`,
      note:
        "Opcache makes PHP's re-parse cheap, but the object graph is still rebuilt every request. Node's graph is built once — which is also why a startup crash in Node means the server never comes up at all.",
    },
    {
      label: "The failure modes trade places",
      intro:
        "The same bug — an unhandled exception while handling one request — has opposite blast radii in the two runtimes.",
      php: `<?php
// PHP-FPM: crash isolation for free
function handle(): void {
    // Fatal error / uncaught exception here kills
    // THIS request. The worker is recycled; the
    // other pool workers keep serving traffic.
    throw new RuntimeException('boom');
}
// Blast radius: exactly one user sees a 500.
// Leaked memory? Freed when the request ends.`,
      ts: `// Node: one process, shared fate
import { createServer } from "node:http";

createServer((req, res) => {
  // An exception that escapes here (especially from
  // async code with no catch) can crash the PROCESS:
  // every in-flight request dies with it.
  throw new Error("boom");
}).listen(3000);
// Blast radius: everyone. Production Node always runs
// under a supervisor that restarts the process.`,
      note:
        "This is the honest counterweight: PHP's share-nothing model gives you crash isolation and leak amnesty by construction. Node makes you earn them with error handling, supervision, and discipline.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Both lifecycles in miniature. handleRequestPHP() rebuilds its state every call, exactly like a PHP-FPM worker re-running your script; handleRequestNode is a closure whose state was created once, like Node's module scope. Predict the five lines, then run.",
    code: `// PHP-FPM in miniature: every request runs the whole script from scratch.
function handleRequestPHP(): number {
  // "the script" — state is created fresh, used, then thrown away
  let counter = 0;
  counter++;
  return counter; // the process dies; nothing survives to the next request
}

// Node in miniature: the "module" is evaluated ONCE when the process starts.
// The closure is module scope; the returned function is the request handler.
const handleRequestNode = (() => {
  let counter = 0; // module-level state — lives as long as the process
  return (): number => ++counter;
})();

for (let request = 1; request <= 3; request++) {
  console.log(
    \`request \${request}: PHP says \${handleRequestPHP()}, Node says \${handleRequestNode()}\`
  );
}

console.log('PHP: bootstrap, handle, die — the counter can never pass 1.');
console.log('Node: one process, one memory space — every request shares it.');`,
  },

  keyPoints: [
    "PHP-FPM's lifecycle is bootstrap → handle → die → forget: every request rebuilds the entire application state and throws it away.",
    "Node is ONE long-running process: modules are evaluated once at startup, and module-level state persists across every request from every user.",
    "Node = V8 (the JS engine that compiles your code) + libuv (the C event-loop library that makes one thread handle thousands of connections).",
    "Persistence is the feature: in-memory caches are a `Map` at module scope, DB pools connect once, and there is zero per-request bootstrap cost.",
    "Persistence is the footgun: leaks accumulate until the process dies, and module-level 'current user' state bleeds between concurrent requests.",
    "PHP's share-nothing model is genuinely simpler — crash isolation and leak amnesty for free — and saying so in an interview shows you understand the trade, not just the hype.",
  ],

  interview: [
    {
      q: "Explain the difference between PHP's and Node's execution models.",
      a: "PHP under FPM is process-per-request and share-nothing: a worker runs the entry script from the top for each request — autoload, config, container, dispatch — then discards all state, so nothing survives between requests except what you explicitly persist to a session store or database. Node is a single long-running process: modules load once at startup and the same memory space serves every request via an event loop, so module-level state persists for the life of the process. That buys Node free in-memory caching, reusable connection pools, and no bootstrap tax, but it costs you PHP's built-in safety: leaks accumulate instead of being cleared per request, shared mutable state can bleed between concurrent users, and one uncaught exception can take down every in-flight request instead of just one. Neither is strictly better — Node trades per-request isolation for throughput and statefulness.",
    },
    {
      q: "In Node, where would you put a database connection pool, and why does that placement work when it wouldn't in PHP?",
      a: "At module scope — export a `const pool = createPool(...)` from a db module and import it wherever it's needed. Because Node evaluates each module exactly once per process, that pool is created at startup and every request reuses the same warmed connections, which is exactly what a pool is for. In PHP the equivalent top-level `new PDO(...)` would reconnect on every request, because the script re-runs and the worker's state dies with each request; PHP works around it with persistent connections at the driver level or an external pooler like PgBouncer. In Node the language's module semantics give you the singleton for free — no service container needed.",
    },
    {
      q: "What are the risks of Node's persistent-process model, and how do you mitigate them?",
      a: "Three big ones. First, memory leaks: anything that grows at module scope — arrays, maps, listeners — accumulates forever instead of being wiped per request, so I keep per-request data in request scope and cap any module-level caches. Second, cross-request data bleed: module-level variables are shared by all concurrent users, so 'current user' style state must live on the request object or in AsyncLocalStorage, never at module scope. Third, blast radius: an uncaught exception can crash the whole process and every in-flight request, so production Node runs under a supervisor (systemd, a container orchestrator, or a process manager) that restarts it, plus centralized error handling so exceptions don't escape in the first place. PHP gets all three mitigations for free from its share-nothing design — Node makes you implement them deliberately.",
    },
  ],

  quiz: [
    {
      question:
        "A Node HTTP server increments a module-level `let counter = 0` on each request. After 5 requests from 3 different users, what does it report?",
      options: [
        "1 — the variable resets per request, like PHP",
        "5 — module state is shared by all requests for the life of the process",
        "3 — Node keeps one counter per connected user",
        "0 — module variables are read-only after startup",
      ],
      answerIndex: 1,
      explain:
        "Modules are evaluated once when the process starts, so `counter` lives in the process's single memory space and every request — from any user — increments the same variable. The equivalent PHP script would echo 1 forever, because each request re-runs the script and recreates the variable.",
    },
    {
      question: "What two components is Node.js fundamentally built from?",
      options: [
        "The Zend Engine and nginx",
        "V8 (the JavaScript engine) and libuv (the event-loop / async-I/O library)",
        "TypeScript and Chromium",
        "V8 and a per-request worker pool like PHP-FPM",
      ],
      answerIndex: 1,
      explain:
        "V8 compiles and runs the JavaScript; libuv is the C library that provides the event loop and non-blocking I/O so one thread can service thousands of concurrent connections. There is no per-request worker pool — that's precisely the model Node abandoned.",
    },
    {
      question:
        "Which bug is essentially impossible in PHP-FPM's share-nothing model but a real danger in Node?",
      options: [
        "An SQL injection through unescaped input",
        "A race condition writing the same database row",
        "One user's data leaking into another user's response via shared in-process state",
        "A missing null check causing a 500 error",
      ],
      answerIndex: 2,
      explain:
        "PHP rebuilds all state per request, so two requests can never see each other's variables. In Node, module-level state is shared by every concurrent request — stash the 'current user' there and interleaved requests will overwrite each other. SQL injection, DB races, and null bugs afflict both runtimes equally.",
    },
    {
      question:
        "Why is a slow memory leak more dangerous in Node than in PHP-FPM?",
      options: [
        "Node's garbage collector is weaker than PHP's",
        "PHP frees each request's memory when the request ends; Node's process accumulates the leak until it's killed",
        "Node allocates all memory up front at startup",
        "It isn't — both runtimes handle leaks identically",
      ],
      answerIndex: 1,
      explain:
        "PHP-FPM grants leak amnesty: whatever a request leaks is reclaimed milliseconds later when the worker resets. Node's process lives for days, so a few kilobytes leaked per request compounds into an out-of-memory crash that takes every active user down with it.",
    },
  ],
};

export default lesson;
