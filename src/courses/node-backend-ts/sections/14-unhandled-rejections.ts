import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "unhandled-rejections",
  title: "Unhandled Rejections Crash the Whole Process",
  part: "Async, Data & Validation",
  estMinutes: 12,
  summary:
    "Since Node 15 an unhandled promise rejection terminates the process — killing every in-flight request from every user — so every promise needs an owner, and the last-resort handlers are crash loggers, not recovery tools.",

  concept: `
Here is the scariest consequence of the one-long-running-process model.

In PHP, a fatal error is a contained event: one request dies, the client gets
a 500, PHP-FPM reaps the worker and spawns a fresh one. Twenty-five years of
that teaches you fatals are survivable. In Node, **since Node 15, an unhandled
promise rejection crashes the entire process** — and the process is your whole
server. Every in-flight request from every concurrent user dies mid-flight.
One forgotten \`.catch\` on a background email job can drop five hundred
unrelated requests on the floor.

### Where rejections escape

Express 5 watches the promise your async handler returns, so throws inside
handlers are safe. Rejections escape everywhere Express *isn't* watching:

- **Fire-and-forget calls** — \`sendWelcomeEmail(user)\` without \`await\` or
  \`.catch\`; if it rejects, nobody owns the rejection.
- **A missing \`await\` in middleware or handlers** — the floating-promise bug:
  the surrounding try/catch has already exited when the rejection lands.
- **Async work started outside the request path** — a \`setTimeout\` or
  \`setInterval\` callback that calls an async function, event-emitter
  listeners, startup warmup jobs.

The rule that prevents all of them: **every promise must have an owner** —
either an \`await\` inside a try/catch, or an explicit \`.catch\` attached where
it's created. Deliberate fire-and-forget is fine *only* with a \`.catch\`:

\`\`\`ts
// intentional background work — the rejection has a home:
sendWelcomeEmail(user).catch((err) => logger.error(err, "welcome email failed"));
\`\`\`

### The last-resort hooks are crash loggers, not safety nets

\`\`\`ts
// src/process-handlers.ts — register once, at startup
process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandled rejection — exiting");
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.fatal(err, "uncaught exception — exiting");
  process.exit(1);
});
\`\`\`

The temptation is to log and carry on — resist it. After an
\`uncaughtException\`, the official guidance is blunt: the process is in an
**undefined state**. Some operation died halfway through — a connection
half-open, a lock never released, module-level state half-mutated — and that
state persists for every future request, because this process *is* the server.
Recovering PHP-style isn't possible: there's no fresh process waiting.

So the strategy is: **log with full detail, exit, and let a supervisor
restart you clean.** In production that supervisor is PM2, systemd, Docker's
restart policy, or Kubernetes — covered when we ship this thing. The handlers
above buy you one thing only: a structured log line explaining *why* you
crashed, instead of a bare stack trace on stderr.

### The try/catch that makes it worse

One anti-pattern deserves a call-out: catching and swallowing.
\`catch (err) {}\` — or \`catch\` + a lonely \`console.log\` — doesn't prevent
crashes, it hides the disease while the symptoms accumulate: corrupted state,
retries that never come, silent data loss. Catch errors where you can do
something about them (respond 502, retry, compensate); otherwise let them
propagate to a layer that can.
`,

  comparisons: [
    {
      label: "Blast radius of a fatal error",
      intro:
        "The same bug — an async failure nobody handles — in both runtimes. Count the victims.",
      php: `<?php
// PHP-FPM: a fatal error kills exactly ONE request.
function chargeCard(Order $order): void {
    // Bug: provider client throws an unexpected error
    throw new RuntimeException('gateway timeout');
}

chargeCard($order);
// -> This request: 500. This process: reaped by FPM.
// -> The other 499 concurrent requests: each in their
//    own process, completely unaffected.
// -> Next request: brand-new process, clean state.`,
      ts: `// Node: the same unhandled failure kills the PROCESS.
async function chargeCard(order: Order): Promise<void> {
  throw new Error("gateway timeout");
}

// fire-and-forget: no await, no .catch — no owner
chargeCard(order);

// -> Node 15+: unhandled rejection terminates the process.
// -> The other 499 in-flight requests from OTHER users:
//    all dead mid-flight, connections dropped.
// -> The server is down until a supervisor restarts it.`,
      note: "Same bug, wildly different blast radius: PHP's process-per-request model contains the damage for free; in Node, containment is your job — every promise needs an owner.",
    },
    {
      label: "Global handler: report-and-continue vs log-and-exit",
      intro:
        "Both runtimes offer a hook for errors nothing else caught. PHP's can render a response and move on; Node's exists to log the crash before the supervisor restarts you.",
      php: `<?php
// PHP: the handler runs at the end of a dying request.
// Respond politely — the NEXT request gets a fresh
// process regardless. Nothing to clean up.
set_exception_handler(function (Throwable $e) {
    error_log($e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal Server Error']);
});`,
      ts: `// Node: crash-loggers of LAST RESORT — not recovery.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandled rejection — exiting");
  process.exit(1); // state is untrustworthy; restart clean
});

process.on("uncaughtException", (err) => {
  logger.fatal(err, "uncaught exception — exiting");
  process.exit(1);
});
// A supervisor (PM2, systemd, Docker, k8s) restarts the
// process — THAT is Node's equivalent of FPM's fresh start.`,
      note: "The PHP handler can 'continue' because the process was about to die anyway. In Node, continuing means serving all future requests from a process in an undefined state.",
    },
    {
      label: "Swallowing errors vs owning them",
      intro:
        "Two versions of a background notification inside a handler. Both keep the process alive — only one tells you anything went wrong.",
      php: `// ANTI-PATTERN: the catch that hides the disease.
app.post("/orders", async (req, res) => {
  const order = await createOrder(req.body);
  try {
    notifyWarehouse(order); // async — but NOT awaited!
  } catch {
    // Never fires: the rejection lands after this block.
    // And even if it could: empty catch = silent data loss.
  }
  res.status(201).json(order);
});`,
      ts: `// OWNED: deliberate fire-and-forget WITH a .catch.
app.post("/orders", async (req, res) => {
  const order = await createOrder(req.body);

  // Don't make the client wait for the warehouse — but
  // give the rejection a home and an audit trail:
  notifyWarehouse(order).catch((err) => {
    logger.error({ err, orderId: order.id }, "warehouse notify failed");
    // and ideally: enqueue a retry
  });

  res.status(201).json(order);
});`,
      note: "The left version is doubly broken: the try/catch can't catch a floating promise, and an empty catch would hide the failure anyway. Fire-and-forget is legitimate only with an explicit .catch.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Three copies of the same failing async call: one awaited in try/catch, one fire-and-forget with .catch, one with no owner at all (its 'unhandledRejection' handler stands in for the process crash). Predict which errors get caught where.",
    code: `// One failing operation, three ownership strategies.

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWelcomeEmail(to: string): Promise<void> {
  await delay(30);
  throw new Error("SMTP connection refused (" + to + ")");
}

// Stand-in for process.on('unhandledRejection'). In real Node,
// reaching this means the PROCESS EXITS — every in-flight
// request from every user dies with it.
function processCrashHandler(err: Error) {
  console.log("3. [unhandledRejection] " + err.message);
  console.log("   -> process would EXIT here; ALL in-flight requests die");
}

// 1. Awaited in try/catch: the failure belongs to THIS request only.
try {
  await sendWelcomeEmail("ada@example.com");
} catch (err) {
  console.log("1. caught in handler: " + (err as Error).message);
  console.log("   -> respond 502; only this request is affected");
}

// 2. Deliberate fire-and-forget WITH .catch: the rejection has a home.
sendWelcomeEmail("grace@example.com").catch((err) =>
  console.log("2. caught by .catch: " + (err as Error).message +
    " -> logged; client already got its 202")
);
await delay(60); // let the background failure land

// 3. Fire-and-forget with NO owner. In real code the next line is all
//    there is — we attach the crash handler so this demo can show it:
sendWelcomeEmail("linus@example.com").catch(processCrashHandler);
await delay(60);

console.log("every promise needs an owner: await, .catch, or crash");`,
  },

  keyPoints: [
    "Since Node 15, an unhandled promise rejection terminates the process by default — every in-flight request from every user dies, versus PHP where a fatal kills exactly one request.",
    "Rejections escape wherever the framework isn't watching: fire-and-forget calls, missing `await` inside try/catch, and async work in `setTimeout`/event-listener/startup code.",
    "The rule: every promise needs an owner — an `await` in a try/catch, or an explicit `.catch` attached where it's created. Fire-and-forget is legitimate only with the `.catch`.",
    "`process.on('unhandledRejection')` and `process.on('uncaughtException')` are crash loggers of last resort: log with full detail, `process.exit(1)`, never limp on.",
    "After an uncaughtException the process state is untrustworthy — half-open connections, half-mutated module state — and that state would be shared with all future requests.",
    "Clean restarts come from a supervisor (PM2, systemd, Docker, Kubernetes) — that restart is Node's equivalent of FPM handing the next request a fresh process.",
  ],

  interview: [
    {
      q: "What happens when a promise rejection goes unhandled in Node, and how do you prevent it?",
      a: "Since Node 15 the default is fatal: the runtime emits `unhandledRejection` and, if nothing handles it, terminates the process — so one forgotten `.catch` on a background job kills every in-flight request from every user, which is a much bigger blast radius than a PHP fatal that costs exactly one request. Prevention is an ownership discipline: every promise gets either an `await` inside a try/catch or an explicit `.catch` at creation. The usual escape routes are fire-and-forget calls, a missing `await` inside a try/catch (the rejection lands after the block exits), and async work kicked off from `setTimeout` or event listeners where no framework is watching. I enforce it mechanically with `typescript-eslint`'s `no-floating-promises`, and I still register a `process.on('unhandledRejection')` handler — but as a crash logger that exits, not a safety net.",
    },
    {
      q: "Why shouldn't you just catch uncaughtException and keep the server running?",
      a: "Because after an uncaught exception the process is in an undefined state — that's Node's own documentation, not caution for its own sake. Something died halfway through: maybe a database connection is half-open, a mutex never released, or module-level state is half-mutated. In PHP that wouldn't matter because the process is about to be thrown away; in Node that corrupted state is shared with every future request, since the process is the server. So the correct move is log the error with full context, `process.exit(1)`, and let the supervisor — PM2, systemd, Docker, Kubernetes — restart a clean process. The handler's real value is producing one structured log line that explains the crash, rather than a bare stack trace on stderr at 3 a.m.",
    },
    {
      q: "Is fire-and-forget ever acceptable in a request handler?",
      a: "Yes — when the client genuinely shouldn't wait for the work, like sending a notification after the order is already committed. But 'forget' can never apply to the rejection: I attach a `.catch` at the call site that logs with enough context to act on — error, order id — and ideally enqueues a retry. Without that `.catch`, a rejection has no owner and, on modern Node, crashes the entire process. The trap version is wrapping the un-awaited call in try/catch, which does nothing: the try block exits before the rejection lands, so the failure is invisible AND still lethal. For anything beyond trivial notifications, the honest answer is a real job queue rather than in-process fire-and-forget.",
    },
  ],

  quiz: [
    {
      question:
        "A background email call with no await and no .catch rejects on a Node 22 server handling 300 concurrent requests. What happens?",
      options: [
        "Only the request that triggered the email gets a 500",
        "The rejection is logged and the server continues normally",
        "The process terminates — all 300 in-flight requests die",
        "Node retries the promise three times, then discards it",
      ],
      answerIndex: 2,
      explain:
        "Since Node 15 an unhandled rejection is fatal by default. Because Node is one long-running process, the crash takes every concurrent request with it — the defining contrast with PHP-FPM, where a fatal error costs exactly the one request that hit it.",
    },
    {
      question:
        "What is the correct body of a process.on('uncaughtException') handler in production?",
      options: [
        "Send a 500 response and continue serving requests",
        "Log the error with full detail, then process.exit(1) and let a supervisor restart",
        "Restart the Express app object without exiting the process",
        "Swallow the error — exceptions there are already handled elsewhere",
      ],
      answerIndex: 1,
      explain:
        "After an uncaught exception the process state is undefined — half-open connections, half-mutated module state shared with all future requests. The handler is a crash logger of last resort: capture why you died, exit, and let PM2/systemd/Docker/k8s start a clean process.",
    },
    {
      question:
        "Why does try { notifyWarehouse(order); } catch (err) { ... } fail to catch the rejection when notifyWarehouse is async and not awaited?",
      options: [
        "async functions can only be called inside other async functions",
        "The try block exits immediately; the rejection lands later, outside any active catch",
        "catch blocks can't receive Error objects from async code at all",
        "Express intercepts the rejection before the catch can see it",
      ],
      answerIndex: 1,
      explain:
        "Without await, notifyWarehouse returns a pending promise and the try block completes instantly. When the promise rejects later there's no try/catch on the stack — the rejection is unhandled. Either await it inside the try, or attach .catch for deliberate fire-and-forget.",
    },
  ],
};

export default lesson;
