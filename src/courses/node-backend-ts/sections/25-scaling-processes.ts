import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "scaling-processes",
  title: "Scaling: Cluster, PM2, and Containers",
  part: "Scaling & Shipping",
  estMinutes: 12,
  summary:
    "One Node process uses one core — so production runs many processes via node:cluster, PM2, or container replicas, and anything you kept in process memory silently stops being shared.",

  concept: `
Here's the mirror image of everything PHP gave you for free. FPM's
\`pm.max_children = 20\` meant twenty worker processes across your cores —
multi-process was the default and you never thought about it. One Node
process, however busy, runs its JavaScript on **one core**. On an 8-core
production box, a single-process deployment leaves seven cores idle. Scaling
Node means running **multiple processes** — and there are three standard ways.

### 1. \`node:cluster\` — the built-in (know it for interviews)

\`\`\`ts
// src/cluster.ts
import cluster from "node:cluster";
import { availableParallelism } from "node:os";

if (cluster.isPrimary) {
  for (let i = 0; i < availableParallelism(); i++) cluster.fork();
  cluster.on("exit", (worker) => {
    console.log(\`worker \${worker.process.pid} died — replacing\`);
    cluster.fork(); // restart on crash
  });
} else {
  await import("./server.js"); // each worker runs the whole app
}
\`\`\`

The primary process forks one worker per core; they all \`listen()\` on the
same port and the primary distributes incoming connections (round-robin on
Linux). It works, and interviewers love asking about it — but hardly anyone
hand-rolls it anymore, because the next two options do the same job with
supervision included.

### 2. PM2 — the process manager

\`\`\`bash
pm2 start dist/server.js -i max   # one worker per core, cluster mode
pm2 reload api                    # zero-downtime rolling restart
pm2 logs api                      # aggregated logs from all workers
\`\`\`

PM2 is the classic answer on a VPS or bare metal: it forks workers (using
cluster under the hood with \`-i\`), **restarts them when they crash** — this
is the supervisor that makes "let programmer errors kill the process" a safe
policy — and \`pm2 reload\` restarts workers one at a time so the port never
goes dark. Config lives in an ecosystem file; note it's loaded as CommonJS,
so in an ESM project name it \`ecosystem.config.cjs\`.

### 3. Containers — one process each, replicas outside

Most container-era shops skip both of the above **inside** the container: run
exactly one Node process per container, and let the orchestrator run N
replicas behind its load balancer. Scaling, restarts, rolling deploys, and
health checks are the platform's job (\`docker compose up --scale api=4\`,
or a Kubernetes \`replicas: 4\`). Same model, different supervisor — the
orchestrator is PM2 writ large.

### The consequence that bites: shared nothing

Whichever route you choose, the processes **share no memory**. Every
module-level variable your app relies on now exists once *per worker*:

- an in-memory session map — users get logged out depending on which worker
  they hit;
- an in-memory cache — N copies, each missing and refilling independently;
- a rate-limit counter — each worker counts alone, so the real limit is
  \`limit × workers\`.

Single-process Node let you get away with state in module scope (the very
thing PHP could never do). Multi-process Node takes that back. The rule:
**state that must be shared lives outside the process** — Redis for
sessions/caches/counters, Postgres for data. This is exactly why Redis shows
up in every Node job listing: it plays the role the process's own memory
can't once you scale past one worker. (Sticky sessions can paper over some
of it, but they fight the load balancer and break the cattle-not-pets model.)

The upside of shared-nothing: it's the same discipline PHP forced on you for
25 years. If your app already keeps its state in the database and Redis, it
scales from 1 process to 40 replicas without a code change.
`,

  comparisons: [
    {
      label: "Multi-process config: FPM pool vs PM2 ecosystem file",
      intro:
        "Both files answer 'how many workers, and what happens when one dies?' — FPM for PHP processes, PM2 for Node processes.",
      php: `; /etc/php/8.3/fpm/pool.d/www.conf
[www]
listen = /run/php/php8.3-fpm.sock

; the free multi-process you never thought about:
pm = dynamic
pm.max_children = 20      ; hard cap of workers
pm.start_servers = 8
pm.min_spare_servers = 4
pm.max_spare_servers = 12
pm.max_requests = 500     ; recycle workers (leak hygiene)

; crash handling: a dead worker is just replaced;
; it only ever held one request anyway`,
      ts: `// ecosystem.config.cjs  (PM2 loads this as CommonJS —
// use the .cjs extension in an ESM project)
module.exports = {
  apps: [{
    name: "api",
    script: "./dist/server.js",
    instances: "max",        // one worker per core
    exec_mode: "cluster",    // share port 3000 across them
    max_memory_restart: "512M", // recycle on leak, like max_requests
    env_production: { NODE_ENV: "production" },
  }],
};

// $ pm2 start ecosystem.config.cjs --env production
// $ pm2 reload api      # zero-downtime rolling restart
// $ pm2 logs api        # merged logs from all workers`,
      note: "Same knobs, opposite defaults: FPM was multi-process unless you fought it; Node is single-process until you (or PM2, or the orchestrator) fork it.",
      leftLang: "bash",
      rightLang: "js",
    },
    {
      label: "The same load test, one process vs four",
      intro:
        "A CPU-heavy endpoint (image resize, ~80ms of pure computation) under 100 concurrent requests. Predict why the single process is not just slower but slower for EVERYONE.",
      php: `$ # single Node process on a 4-core box
$ npx autocannon -c 100 -d 10 http://localhost:3000/resize

Stat    Avg       Max
Latency 7,890 ms  9,940 ms
Req/Sec 12.4

$ # one core at 100%, three cores idle.
$ # 80ms of sync work x 100 queued users =
$ # every request waits for ALL the CPU work
$ # ahead of it in the ONE event loop.`,
      ts: `$ pm2 start dist/server.js -i 4 --name api
[PM2] App [api] launched (4 instances)

$ npx autocannon -c 100 -d 10 http://localhost:3000/resize

Stat    Avg       Max
Latency 1,995 ms  2,610 ms
Req/Sec 49.1

$ # ~4x throughput: four event loops, four cores.
$ # CPU work still blocks — but now it blocks
$ # 1/4 of your users instead of all of them.`,
      note: "Forking doesn't make blocking code fine — each worker's event loop can still stall — but it turns 'one slow request delays everyone' into 'delays everyone on that worker', and multiplies throughput by the core count.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Hand-rolled cluster vs orchestrator replicas",
      intro:
        "Two ways to get four workers: fork them yourself inside one Node program, or run one process per container and let the platform run four.",
      php: `// src/cluster.ts — DIY, the interview classic
import cluster from "node:cluster";
import { availableParallelism } from "node:os";

if (cluster.isPrimary) {
  const cores = availableParallelism();
  for (let i = 0; i < cores; i++) cluster.fork();

  cluster.on("exit", (worker) => {
    console.log(\`worker \${worker.process.pid} died\`);
    cluster.fork(); // self-healing, hand-rolled
  });
} else {
  await import("./server.js");
}`,
      ts: `# compose.yaml — one process per container,
# replicas are the platform's problem
services:
  api:
    build: .
    deploy:
      replicas: 4
      restart_policy:
        condition: on-failure
    expose:
      - "3000"

  redis:            # the shared state has to live
    image: redis:7  # SOMEWHERE once you have 4 copies

# $ docker compose up -d --scale api=4`,
      note: "Same four processes either way — but the container version gets restarts, rolling deploys, and scaling from the orchestrator, which is why hand-rolled cluster code is now mostly interview material.",
      leftLang: "ts",
      rightLang: "yaml",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Why in-memory rate limiting breaks the moment you scale out: 12 requests from ONE client are round-robined across 4 workers, each enforcing 'max 3 per client' from its own local counter. Predict how many requests get blocked — then imagine the same numbers with a shared Redis counter.",
    code: `const WORKERS = 4;
const LIMIT = 3; // intended: max 3 requests per client, TOTAL

// each worker's module-level state — one copy PER PROCESS
const localCounters: number[] = new Array(WORKERS).fill(0);

let rr = 0; // the load balancer / cluster primary: round-robin

function dispatch(requestId: number): string {
  const worker = rr;
  rr = (rr + 1) % WORKERS;

  localCounters[worker] += 1;
  const seen = localCounters[worker];
  const verdict = seen > LIMIT ? "429 Too Many Requests" : "200 OK";

  return \`req #\${String(requestId).padStart(2, " ")} -> worker \${worker}  (worker has seen \${seen})  \${verdict}\`;
}

console.log(\`intent: block a client after \${LIMIT} requests. reality with \${WORKERS} workers:\`);
console.log("");
for (let i = 1; i <= 12; i++) {
  console.log(dispatch(i));
}

console.log("");
console.log("per-worker counters:", localCounters.join(", "));

const totalBlocked = localCounters.reduce((sum, c) => sum + Math.max(0, c - LIMIT), 0);
console.log(\`client sent 12 requests; blocked: \${totalBlocked}. Effective limit: \${LIMIT * WORKERS}, not \${LIMIT}.\`);
console.log("");
console.log("same simulation with ONE shared counter (Redis):");
let shared = 0;
for (let i = 1; i <= 12; i++) {
  shared += 1;
  if (shared === LIMIT + 1) console.log(\`req #\${String(i).padStart(2, " ")} -> any worker  (shared count \${shared})  429 — and every request after it\`);
}
console.log(\`blocked: \${12 - LIMIT} of 12 — the limit means what it says again.\`);`,
  },

  keyPoints: [
    "One Node process runs its JavaScript on one core — the mirror image of FPM, where pm.max_children gave you multi-process for free. Scaling Node means running multiple processes.",
    "node:cluster forks one worker per core (use availableParallelism()) and the primary distributes connections — worth explaining in interviews, rarely hand-rolled in production.",
    "PM2 (`pm2 start dist/server.js -i max`) is cluster plus supervision: restart-on-crash (the safety net that makes crash-on-programmer-error policy viable) and `pm2 reload` for zero-downtime rolling restarts.",
    "The container-era default is one process per container with replicas managed by the orchestrator — same model, with the platform as the supervisor.",
    "Multiple processes share NOTHING: in-memory sessions, caches, and rate-limit counters silently become per-worker copies (real limit = limit x workers). Shared state must move outside the process — which is why Redis is in every Node job listing.",
    "The shared-nothing discipline is exactly what PHP enforced for 25 years — apps that already keep state in the DB/Redis scale from 1 process to 40 replicas without code changes.",
  ],

  interview: [
    {
      q: "A single Node process is deployed on an 8-core machine. What's wrong, and what are your options?",
      a: "The event loop runs JavaScript on one core, so seven cores sit idle and every user shares one thread of execution — the exact opposite of my PHP days, where FPM's pm.max_children spread workers across cores by default. Three standard fixes. node:cluster forks a worker per core — availableParallelism() tells you how many — with all workers sharing the port; it's good to understand but rarely hand-written now. PM2 in cluster mode, pm2 start -i max, does the same with supervision on top: restart-on-crash and zero-downtime reloads. And in containerized environments the idiomatic answer is one process per container with the orchestrator running N replicas. Whichever you pick, the follow-up matters: the processes share no memory, so any state that was implicitly shared in the single process has to move to something like Redis.",
    },
    {
      q: "You scaled from one process to four and users started getting randomly logged out, while your rate limiter stopped working. What happened?",
      a: "Both symptoms have the same root cause: module-level state that was effectively global in one process became four independent copies. If sessions were held in process memory, a user's login exists only on the worker that handled it — the load balancer round-robins them to a different worker, which has never heard of them, so they look logged out. The rate limiter is the same bug in reverse: each worker counts requests in its own memory, so a client limited to 100 can really make about 400 before any single counter trips. The fix isn't sticky sessions — that fights the load balancer and breaks when workers are replaced — it's moving shared state out of the process: Redis for sessions, caches, and counters. It's the discipline PHP forced on me anyway, since PHP memory never survived a request.",
    },
    {
      q: "What does PM2 actually provide over running node dist/server.js directly?",
      a: "Three production essentials. Supervision: it restarts workers when they crash, which is what makes the Node convention of letting programmer errors kill the process a safe policy rather than an outage generator. Multi-core utilization: -i max runs cluster mode with a worker per core, all sharing the port. And operational lifecycle: pm2 reload restarts workers one at a time so the service never goes dark during a deploy, plus aggregated logs and memory-based recycling via max_memory_restart — the spiritual cousin of FPM's pm.max_requests leak hygiene. In a container platform I'd skip PM2 and let the orchestrator do all three jobs — one process per container, replicas, rolling deploys — but on a VPS or bare metal, PM2 is the standard supervisor.",
    },
  ],

  quiz: [
    {
      question:
        "Why does a rate limit of 100/hour configured with an in-memory store become roughly 400/hour when you run 4 workers?",
      options: [
        "The load balancer multiplies the header value",
        "Each worker keeps its own counter, and a client's requests are spread across all four — no single counter reaches 100 until ~400 total requests",
        "PM2 resets counters on every health check",
        "Node's cluster module disables middleware state",
      ],
      answerIndex: 1,
      explain:
        "Processes share no memory. Round-robin dispatch means each worker sees about a quarter of the client's traffic and counts it independently. Only a store outside the processes — Redis being the standard — restores a single shared count.",
    },
    {
      question:
        "In the container-era deployment model, what replaces PM2's job?",
      options: [
        "node:cluster inside each container",
        "The orchestrator: one Node process per container, with replicas, restart policies, and rolling deploys handled by the platform",
        "nginx running as PID 1",
        "Nothing — containers don't need process supervision",
      ],
      answerIndex: 1,
      explain:
        "The idiomatic container pattern is one process per container. Restart-on-crash, scaling the worker count, and zero-downtime deploys — everything PM2 did on a VPS — become the orchestrator's responsibility (Kubernetes replicas, compose deploy.replicas).",
    },
    {
      question:
        "How does node:cluster let 4 workers all serve port 3000?",
      options: [
        "Each worker binds to a different port and nginx multiplexes",
        "Workers take turns binding for 250ms each",
        "The primary process accepts connections and distributes them to workers (round-robin on Linux); workers' listen() calls are routed through the primary",
        "The OS merges the processes into one via shared memory",
      ],
      answerIndex: 2,
      explain:
        "In cluster mode a worker's server.listen() doesn't really bind the port — the primary holds the listening socket and hands accepted connections to workers, round-robin by default on Linux. That's how N processes present as one server on one port.",
    },
    {
      question:
        "Your PHP app kept nothing in process memory (it couldn't!) and stored sessions in Redis out of habit. You port it to Node. What's true about scaling it?",
      options: [
        "It must be rewritten to use node:cluster APIs throughout",
        "It scales from 1 process to N replicas without code changes — the shared-nothing discipline PHP enforced is exactly what multi-process Node requires",
        "Redis must be replaced with an in-memory Map for performance",
        "It can only scale vertically until sessions move into JWTs",
      ],
      answerIndex: 1,
      explain:
        "Multi-process Node's one demand is that shared state live outside the process. An app already keeping sessions and caches in Redis and data in the database meets that by construction — the 25-year-old PHP constraint turns out to be the cloud-native best practice.",
    },
  ],
};

export default lesson;
