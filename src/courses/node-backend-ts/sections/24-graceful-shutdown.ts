import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "graceful-shutdown",
  title: "Graceful Shutdown",
  part: "Production Hardening",
  estMinutes: 11,
  summary:
    "Handle SIGTERM properly — stop accepting connections, drain in-flight requests, close the DB pool, then exit — so every deploy stops dropping user requests.",

  concept: `
Here's a concept with **no PHP equivalent**, and that absence is the point. A
PHP request lived for 50 milliseconds; when you deployed, FPM finished the
requests already running (\`process_control_timeout\` governed how patiently)
and fresh processes picked up the new code. You never wrote shutdown code
because there was nothing to shut down — each process owned almost nothing.

Your Node process is different. At the moment a deploy begins it is holding:
**in-flight requests** halfway through their handlers, **open sockets**
(including idle keep-alive connections), and a **Postgres pool** with live
connections. Kill the process abruptly and every one of those requests dies
mid-flight — on *every single deploy*, which for a busy API means user-visible
errors several times a day.

### Who sends the signal, and what happens if you ignore it

Orchestrators follow the same contract: Kubernetes, PM2, Docker, systemd all
send **SIGTERM** ("please finish up"), wait a grace period (Kubernetes
defaults to 30 seconds), then send **SIGKILL** (uncatchable, instant death).
Node's default reaction to SIGTERM is to exit immediately — so with no
handler, you get the SIGKILL behaviour on the very first signal. The graceful
window exists, but only if you use it.

### The shutdown sequence

\`\`\`ts
// src/server.ts
const server = app.listen(3000);

async function shutdown(signal: string) {
  console.log(\`\${signal} received: draining\`);

  // 1. Hard deadline: if draining hangs, die anyway.
  //    .unref() so this timer can't keep the process alive itself.
  setTimeout(() => process.exit(1), 10_000).unref();

  // 2. Stop accepting NEW connections; the callback fires
  //    once existing connections have finished.
  server.close(async () => {
    // 3. In-flight requests are done — release held resources.
    await pool.end();          // close Postgres connections cleanly
    process.exit(0);           // 4. clean exit
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));  // Ctrl+C in dev
\`\`\`

Read the order carefully, because it *is* the lesson:

1. **Deadline first.** A request stuck on a dead upstream would otherwise
   block \`server.close\`'s callback forever, and you'd ride out the full
   orchestrator grace period doing nothing. The \`.unref()\` matters: an
   ordinary timer would itself hold the event loop open, keeping the process
   alive purely to schedule its own execution.
2. **\`server.close()\`** makes \`listen\` stop accepting new connections while
   letting current requests complete (modern Node also closes idle keep-alive
   connections here, which used to require extra work).
3. **\`pool.end()\` only after requests finish** — close it earlier and the
   very requests you're draining lose their database mid-query.
4. **\`process.exit(0)\`** tells the supervisor this was a clean, intentional
   exit — not a crash to alert on.

### Readiness vs liveness: drain before you die

Orchestrated platforms probe two different questions. **Liveness**: "is this
process alive at all?" — fail it and you get restarted. **Readiness**: "should
this instance receive *new* traffic?" — fail it and the load balancer routes
around you while you keep running. The graceful pattern uses them in order:
on SIGTERM, **fail readiness first** so new traffic stops arriving, drain
what you have, and only then exit. Dying while still marked ready is how
requests get routed to a corpse.

### The payoff

Zero-downtime deploys stop being a platform feature you hope works and become
a property of your code: old process drains while the new one starts serving.
The handful of lines above is the difference between "we deploy whenever" and
"we deploy at 3am and apologise in the morning".
`,

  comparisons: [
    {
      label: "Who owns the drain: FPM config vs your code",
      intro:
        "Both worlds let running requests finish before old workers die during a deploy. In PHP it's one ini line you probably never read; in Node it's a handler you must write.",
      php: `; /etc/php/8.3/fpm/php-fpm.conf
; On reload/shutdown, the master signals workers
; and waits this long for the CURRENT REQUEST
; (one per worker!) to finish before killing them:
process_control_timeout = 10s

; That's the whole story. Each worker holds ONE
; request, no app-owned sockets, no connection
; pool — the FPM master does the draining and
; your code never knows a deploy happened.

; $ systemctl reload php8.3-fpm   # graceful, free`,
      ts: `// src/server.ts — the drain is YOUR code in Node
const server = app.listen(3000);

async function shutdown(signal: string) {
  console.log(\`\${signal}: draining\`);

  // hard deadline — never outlive the grace period
  setTimeout(() => process.exit(1), 10_000).unref();

  server.close(async () => {
    await pool.end();   // release Postgres connections
    process.exit(0);    // clean exit for the supervisor
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT",  () => void shutdown("SIGINT"));`,
      note: "FPM could drain for you because each worker held exactly one request and no long-lived resources; your Node process holds many requests plus a DB pool, so only your code knows how to put it all down safely.",
      leftLang: "bash",
    },
    {
      label: "A deploy, with and without a SIGTERM handler",
      intro:
        "Same rolling deploy, same in-flight request. Left: no handler, Node's default SIGTERM action kills the process instantly. Right: the handler drains first.",
      php: `$ kubectl rollout restart deployment/api
# orchestrator sends SIGTERM to the old pod...
# Node's DEFAULT action: exit immediately.

# the user who was mid-request:
$ curl https://api.example.com/orders -d @order.json
curl: (52) Empty reply from server

# old pod's final log lines:
{"msg":"POST /orders started","reqId":"req-91x"}
# (nothing else — process died mid-handler;
#  was the order saved? nobody knows)

# ...and this happens on EVERY deploy.`,
      ts: `$ kubectl rollout restart deployment/api
# orchestrator sends SIGTERM to the old pod...

# old pod's log:
{"msg":"SIGTERM received: draining"}
{"msg":"readiness now failing — no new traffic"}
{"msg":"POST /orders completed","status":201,
 "reqId":"req-91x"}
{"msg":"pool drained, exiting cleanly"}

# the same user:
$ curl https://api.example.com/orders -d @order.json
{"id":8412,"status":"created"}

# new pod is already serving: zero requests dropped`,
      note: "The grace period between SIGTERM and SIGKILL exists on every platform — but Node's default is to die instantly, so without a handler you volunteer for the worst case.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A shutdown coordinator in miniature: three requests are in flight when SIGTERM arrives, one more tries to arrive during the drain, and one is too slow for the grace period. Predict the order of the log lines — especially what happens to requests 3 and 4 — then run it.",
    code: `const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let accepting = true;
let processAlive = true;
const inFlight = new Set<Promise<void>>();

// stands in for the HTTP server handing work to handlers
function handleRequest(id: number, ms: number): void {
  if (!accepting) {
    console.log(\`request \${id}: REFUSED — server is draining (server.close())\`);
    return;
  }
  const p = sleep(ms).then(() => {
    inFlight.delete(p);
    console.log(
      \`request \${id}: finished after \${ms}ms\` +
      (processAlive ? "" : "  <- too late, process was already killed"),
    );
  });
  inFlight.add(p);
  console.log(\`request \${id}: accepted (\${ms}ms of work)\`);
}

// the SIGTERM handler, as pure coordination logic
async function shutdown(graceMs: number): Promise<void> {
  console.log("--- SIGTERM received ---");
  accepting = false; // server.close(): stop taking new connections
  console.log(\`draining \${inFlight.size} in-flight request(s), grace = \${graceMs}ms\`);

  // race the drain against the hard deadline (the .unref()'d timer)
  const timedOut = await Promise.race([
    Promise.all([...inFlight]).then(() => false),
    sleep(graceMs).then(() => true),
  ]);

  processAlive = false;
  if (timedOut) {
    console.log(\`grace expired, \${inFlight.size} request(s) still running -> exit(1)\`);
  } else {
    console.log("all drained -> pool.end() -> exit(0)");
  }
}

// t=0: normal traffic
handleRequest(1, 30);
handleRequest(2, 60);
handleRequest(3, 400); // stuck on a slow upstream

await sleep(10); // deploy begins
const drain = shutdown(150);

handleRequest(4, 20); // arrives mid-drain

await drain;
await sleep(300); // watch what the hard kill cut off`,
  },

  keyPoints: [
    "PHP never needed shutdown code because each process held one request and nothing else; a Node process holds many in-flight requests, open sockets, and a DB pool — only your code can put those down safely.",
    "The contract everywhere (Kubernetes, PM2, Docker, systemd): SIGTERM, a grace period (k8s default 30s), then uncatchable SIGKILL. Node's default SIGTERM action is instant exit — no handler means dropped requests on every deploy.",
    "The sequence: register a hard-kill deadline (`setTimeout(() => process.exit(1), ms).unref()`), then `server.close()` to stop intake and let in-flight requests finish, then `pool.end()`, then `process.exit(0)`.",
    "`.unref()` on the deadline timer is essential — without it the timer itself holds the event loop open, keeping the process alive just to kill it.",
    "Close the pool only AFTER requests drain; `pool.end()` first would yank the database out from under the very requests you're trying to finish.",
    "Readiness ('send me new traffic?') and liveness ('am I alive?') are different probes: on SIGTERM fail readiness first, drain, then die — exiting while still marked ready routes requests to a corpse.",
  ],

  interview: [
    {
      q: "Walk me through what your Node service does when Kubernetes sends it SIGTERM.",
      a: "First, my handler starts a hard-deadline timer — setTimeout to process.exit(1) after ~10 seconds, with .unref() so the timer itself can't hold the event loop open — because a request stuck on a dead upstream must not make me ride out the whole grace period. Then server.close(): the listener stops accepting new connections while in-flight requests run to completion, and ideally my readiness probe starts failing so the load balancer routes around me. When close's callback fires, everything is drained, so I release held resources — pool.end() for Postgres — and process.exit(0) to signal a clean, intentional exit. The ordering matters: deadline before drain, drain before pool close, because closing the pool early would kill the very queries I'm waiting on. Kubernetes gives 30 seconds by default before SIGKILL; without a handler Node exits instantly on SIGTERM, which means dropped requests on literally every deploy.",
    },
    {
      q: "Why did you never write shutdown handlers in 25 years of PHP, and why must you now?",
      a: "Because PHP-FPM owned the problem: each worker held exactly one request and no long-lived resources, so on reload the master just waited process_control_timeout for each worker's single request to finish. There was nothing application-specific to clean up — no app-held sockets, no connection pool, no shared state. A Node process inverts all of that: it holds dozens of concurrent requests mid-handler, keep-alive sockets, timers, and a live Postgres pool, and no supervisor can know the right order to release them. So the drain logic moves from FPM's config into my code — it's the same trade as the rest of Node: the long-running process buys performance and shared state, and in exchange lifecycle management becomes my responsibility.",
    },
    {
      q: "What's the difference between readiness and liveness probes, and how do they interact with graceful shutdown?",
      a: "Liveness asks 'is this process healthy at all?' — fail it and the orchestrator kills and restarts you. Readiness asks 'should this instance receive new traffic right now?' — fail it and the load balancer stops routing to you, but you keep running. They're deliberately separate: a service that's draining or waiting on a warm-up is not ready but is very much alive, and restarting it would make things worse. In graceful shutdown they sequence the exit: on SIGTERM I fail readiness first so new requests stop arriving, drain the in-flight ones, then exit. Exiting — or being SIGKILLed — while still marked ready is the classic source of deploy-time 502s: the balancer keeps sending traffic to a process that's already gone.",
    },
  ],

  quiz: [
    {
      question:
        "Why does the hard-kill timer in a shutdown handler call .unref()?",
      options: [
        "To make the timer fire sooner under load",
        "So the timer doesn't itself keep the event loop alive — otherwise the process could stay up purely to run its own kill timer",
        "To cancel the timer once draining completes",
        "unref() promotes the timer to run before I/O callbacks",
      ],
      answerIndex: 1,
      explain:
        "An active timer normally holds the event loop open. Without unref(), even a fully drained process would wait around for the kill timer to fire. unref() says 'don't count this handle' — if draining finishes and nothing else is pending, the process can exit cleanly before the deadline ever fires.",
    },
    {
      question:
        "During shutdown, why must pool.end() run only after server.close()'s callback fires?",
      options: [
        "pool.end() is synchronous and would block the drain",
        "server.close() needs the pool to deregister the listener",
        "The in-flight requests being drained may still be running queries — closing the pool first pulls the database out from under them",
        "Postgres requires the HTTP port to be closed before disconnecting",
      ],
      answerIndex: 2,
      explain:
        "server.close()'s callback fires when existing connections have finished — meaning handlers, including their DB queries, are done. End the pool earlier and those handlers fail mid-query, which defeats the entire purpose of draining.",
    },
    {
      question:
        "A Node API with no signal handlers is deployed on Kubernetes. What happens to in-flight requests during a rolling deploy?",
      options: [
        "Kubernetes waits for them — the 30s grace period pauses traffic automatically",
        "They are dropped: Node's default action on SIGTERM is to exit immediately, before the grace period is even used",
        "Express queues them and replays after restart",
        "Nothing — the load balancer retries all failed requests transparently",
      ],
      answerIndex: 1,
      explain:
        "The grace period only helps processes that catch SIGTERM and use it. Node's default disposition for SIGTERM is immediate termination, so an unhandled deploy kills every in-flight request on the old pod — the 30 seconds Kubernetes would have granted go unused.",
    },
  ],
};

export default lesson;
