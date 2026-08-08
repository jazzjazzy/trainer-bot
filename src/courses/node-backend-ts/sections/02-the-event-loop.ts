import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "the-event-loop",
  title: "The Event Loop: One Thread That Must Never Block",
  part: "The Runtime Shift",
  estMinutes: 13,
  summary:
    "One thread serves thousands of connections by never waiting — so a single synchronous 2-second computation freezes every user at once, which is why PHP's blocking habits must die here.",

  concept: `
PHP scales by adding workers: 50 FPM processes means 50 requests in flight,
each free to block on I/O because it only holds up itself. Node inverts this:
**one thread**, thousands of connections, and the deal is that your code never
waits. Understanding how — and what breaks the deal — is the most
interview-tested topic in all of Node.

### The loop, at a useful altitude

libuv runs an endless cycle. Each turn passes through phases; three matter
day-to-day:

- **timers** — run \`setTimeout\`/\`setInterval\` callbacks whose time is up.
- **poll** — the heart: wait for I/O events (a socket became readable, a DB
  responded) and run their callbacks.
- **check** — run \`setImmediate\` callbacks.

When you call \`fetch()\` or \`fs.readFile\`, Node registers the operation with
the OS (or its internal thread pool), notes which callback to run when it
finishes, and *immediately moves on* to other work. The loop picks up the
result on a later turn. That's how one thread juggles 10,000 idle connections
that would need 10,000 PHP workers.

A footnote that surfaces in interviews: the event loop thread never blocks on
I/O, but libuv also keeps a small **thread pool** (default 4 threads) for work
the OS can't do asynchronously — filesystem calls and CPU-ish crypto like
\`pbkdf2\`. Your JS still runs on the one main thread; the pool just keeps slow
syscalls from stalling it.

### Microtasks vs macrotasks

Between each callback, Node drains the **microtask queue** — promise
reactions (\`.then\`, code after \`await\`) and \`queueMicrotask\`. Macrotasks
(timers, I/O callbacks, \`setImmediate\`) each wait for their phase of the
loop. The rule that decides every ordering puzzle:

1. Run the current synchronous code to completion.
2. Drain **all** microtasks (including ones queued by other microtasks).
3. Only then take the next macrotask.

So \`Promise.resolve().then(...)\` always beats \`setTimeout(..., 0)\`. The
playground below makes you predict a full ordering — a genuine interview
classic.

### The killer consequence: blocking blocks *everyone*

In PHP, \`sleep(2)\` or a 2-second report loop is rude but contained: one
worker is busy, the other 49 keep serving. In Node, a synchronous 2-second
loop means the event loop cannot turn. **Every** connected user — the one who
triggered it and the 9,999 innocents — gets frozen. No responses, no new
connections, no timers. This is why:

- \`sleep()\`-style thinking must die — delays are \`setTimeout\` or awaited
  promises, never busy-waits.
- Synchronous APIs like \`fs.readFileSync\` are for startup scripts only, never
  request handlers.
- Big JSON parses, tight loops over huge arrays, and synchronous crypto are
  real production incidents, not style nits.

For genuinely CPU-bound work, Node has \`worker_threads\` to move computation
off the main thread — file that away for now; the scaling part of this course
covers spreading load across processes.
`,

  comparisons: [
    {
      label: "Blocking I/O: fine in PHP, catastrophic in Node",
      intro:
        "Both handlers read a file and call an HTTP API while building a response. PHP blocks and nobody else cares; Node must await, or every user waits too.",
      php: `<?php
// PHP: blocking is LOCAL. This worker sits idle
// during the disk read and the HTTP call, but the
// other FPM workers keep serving everyone else.
$template = file_get_contents(__DIR__ . '/tpl.html');

$json  = file_get_contents('https://api.example.com/rates');
$rates = json_decode($json, true);

echo render($template, $rates);
// Slow? Only THIS request pays.`,
      ts: `// Node: blocking is GLOBAL, so nothing may block.
// Both operations yield the one thread while the
// OS does the waiting; the loop serves others meanwhile.
import { readFile } from "node:fs/promises";

export async function handler(): Promise<string> {
  const template = await readFile("tpl.html", "utf8");

  const res = await fetch("https://api.example.com/rates");
  const rates = await res.json();

  return render(template, rates);
}
// Slow API? These requests wait — everyone else sails on.`,
      note:
        "Same shape of code, opposite stakes: PHP's blocking call costs one worker; a Node blocking call would cost the entire process. That's why async isn't optional style in Node — it's the survival contract.",
    },
    {
      label: "A 2-second delay: one victim vs total freeze",
      intro:
        "A handler needs to wait two seconds before responding. The PHP version blocks one worker; the naive Node busy-wait freezes the whole server — the fix is to schedule, not wait.",
      php: `<?php
// PHP: sleep() parks THIS worker for 2s.
// Impact: one of your N workers is busy.
// Everyone else is served by the rest of the pool.
sleep(2);

echo json_encode(['status' => 'done']);`,
      ts: `// Node — NEVER do this: a synchronous busy-wait
// seizes the only thread. For 2 whole seconds NO other
// request, timer, or connection makes progress.
// const end = Date.now() + 2000;
// while (Date.now() < end) { /* server is dead */ }

// The Node way: schedule the continuation and free the loop.
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function handler(): Promise<string> {
  await delay(2000); // this request sleeps; the LOOP does not
  return JSON.stringify({ status: "done" });
}`,
      note:
        "await delay(2000) suspends only this handler — the loop keeps turning and serves thousands of others meanwhile. The commented busy-wait is the literal translation of PHP sleep() thinking, and it's a production outage.",
    },
    {
      label: "Scaling model: more workers vs one loop",
      intro:
        "How each runtime handles 1,000 concurrent connections that are mostly waiting on a slow upstream API.",
      php: `; php-fpm pool config — scale by adding processes
; 1,000 concurrent waiting requests need ~1,000 workers,
; each holding a full process's memory while it BLOCKS.
pm = dynamic
pm.max_children = 1000
pm.start_servers = 100

; Each worker: own memory, own connections.
; Waiting on I/O still occupies a whole process.`,
      ts: `// Node: 1,000 waiting connections ≈ 1,000 pending
// promises in ONE process. Waiting costs almost nothing —
// the OS holds the sockets; the loop only runs callbacks
// when something actually happens.
import { createServer } from "node:http";

createServer(async (req, res) => {
  const data = await fetch("https://slow.example.com/api");
  res.end(await data.text());
}).listen(3000);
// I/O-bound: Node shines. CPU-bound: one thread saturates —
// that's worker_threads / multi-process territory.`,
      note:
        "Node's win is I/O-bound concurrency: waiting is nearly free. The honest flip side: PHP's 1,000 workers can chew CPU on 1,000 cores in parallel, while a single Node process maxes out one core.",
      leftLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The interview classic: predict the exact order of the six numbered lines before you run. Remember the rule — all synchronous code first, then drain every microtask (promise callbacks), and only then the next macrotask (timers).",
    code: `// Predict the order of the six lines BEFORE running.
// Rules: sync code runs to completion first; then ALL microtasks
// (promise callbacks) drain; only then does a macrotask (timer) run.

console.log('1) script start (sync)');

setTimeout(() => {
  console.log('6) setTimeout 0ms — macrotask, runs LAST');
}, 0);

Promise.resolve().then(() => {
  console.log('4) .then callback — microtask');
});

(async () => {
  console.log('2) async fn is synchronous until its first await');
  await Promise.resolve();
  console.log('5) after await — microtask, queued behind the .then');
})();

console.log('3) script end (sync)');`,
  },

  keyPoints: [
    "PHP scales by blocking in many workers; Node scales by never blocking in one thread — the event loop registers I/O with the OS and runs callbacks when results arrive.",
    "Loop phases worth naming in an interview: timers (`setTimeout`), poll (I/O callbacks — the heart), check (`setImmediate`).",
    "Microtasks (promise `.then`, code after `await`) drain completely between macrotasks — so `Promise.resolve().then` always fires before `setTimeout(..., 0)`.",
    "An async function runs synchronously until its first `await`; the rest is queued as a microtask.",
    "A synchronous 2-second loop in PHP slows one request; in Node it freezes EVERY connected user — no `sleep()` thinking, no `*Sync` APIs in handlers.",
    "libuv keeps a small thread pool (default 4) for fs and crypto syscalls; for genuinely CPU-bound work, `worker_threads` moves computation off the main thread.",
  ],

  interview: [
    {
      q: "How does Node handle thousands of concurrent connections with a single thread?",
      a: "Through libuv's event loop and non-blocking I/O. When my code starts an async operation — a fetch, a DB query, a file read — Node hands the waiting to the operating system (or libuv's small thread pool for filesystem and some crypto work), registers a callback, and immediately returns to the loop to serve other events. A connection that's merely waiting costs almost nothing; the loop only spends time running callbacks when something actually completes. Contrast PHP-FPM, where a request waiting on I/O still occupies an entire worker process. The trade is that this only works for I/O-bound loads — the moment my JavaScript itself computes for a long time, the single thread is saturated and every connection stalls, which is where worker_threads or multiple processes come in.",
    },
    {
      q: "What's the difference between microtasks and macrotasks, and what order do they run in?",
      a: "Macrotasks are the coarse units the event loop schedules per phase — timer callbacks, I/O callbacks, setImmediate. Microtasks are the fine-grained queue of promise reactions — .then callbacks and code after an await — plus queueMicrotask. The rule: run the current synchronous code to completion, then drain the entire microtask queue, including microtasks queued by other microtasks, and only then pick up the next macrotask. That's why Promise.resolve().then(fn) always fires before setTimeout(fn, 0), and why an async function runs synchronously until its first await with the remainder queued as a microtask. It also means an infinite microtask chain can starve the loop just like a synchronous infinite loop would.",
    },
    {
      q: "Why is CPU-heavy code so much more dangerous in Node than in PHP, and what do you do about it?",
      a: "Because of the blast radius. In PHP a 2-second report generation blocks one FPM worker; the rest of the pool keeps serving traffic, so it degrades capacity by one worker. In Node all JavaScript runs on the one event-loop thread, so those same 2 seconds mean zero responses, zero new connections, zero timers for every user of the process — the whole server appears down. Mitigations, in order: keep handlers I/O-bound and async; chunk unavoidable big computations so the loop can breathe; push real CPU work into worker_threads; and scale across processes so one busy loop doesn't own all the traffic. I'd also ban synchronous APIs like readFileSync and pbkdf2Sync from request paths in code review — they're startup-time tools.",
    },
  ],

  quiz: [
    {
      question:
        "In what order do these print? console.log('A'); setTimeout(() => console.log('B'), 0); Promise.resolve().then(() => console.log('C')); console.log('D');",
      options: ["A, B, C, D", "A, D, C, B", "A, D, B, C", "A, C, D, B"],
      answerIndex: 1,
      explain:
        "Synchronous code first: A then D. Then the microtask queue drains: C (promise .then). Only after all microtasks does the timer macrotask run: B. Microtasks always beat setTimeout(…, 0).",
    },
    {
      question:
        "A handler runs a synchronous loop that takes 2 seconds. What happens to other users of the same Node process during those 2 seconds?",
      options: [
        "They're unaffected — Node spawns a thread per request",
        "They're served slightly slower as the CPU is shared",
        "Every one of them is frozen: no responses, no new connections, no timers fire",
        "Node automatically moves the loop to a worker thread",
      ],
      answerIndex: 2,
      explain:
        "All JavaScript shares the single event-loop thread. While it's stuck in a synchronous loop, the event loop cannot turn, so nothing else in the process makes progress. In PHP-FPM the same code would tie up only one worker. Nothing is moved to threads automatically — you'd have to use worker_threads deliberately.",
    },
    {
      question: "What does libuv's thread pool (default size 4) actually do?",
      options: [
        "Runs a copy of your request handlers in parallel",
        "Executes filesystem and some crypto operations so slow syscalls don't stall the event-loop thread",
        "Runs all promise callbacks",
        "Handles incoming TCP connections, one thread each",
      ],
      answerIndex: 1,
      explain:
        "Your JavaScript always runs on the one main thread. The pool exists for operations the OS can't do in a non-blocking way — fs calls, dns.lookup, and CPU-ish crypto like pbkdf2 — keeping those syscalls from blocking the loop. Network sockets don't use it; the OS handles those asynchronously already.",
    },
    {
      question:
        "An async function contains code before and after its first await. When does each part run?",
      options: [
        "Both parts are deferred to the microtask queue",
        "Both parts run synchronously when the function is called",
        "The part before the await runs synchronously at the call; the part after is queued as a microtask",
        "The part before runs as a macrotask; the part after as a microtask",
      ],
      answerIndex: 2,
      explain:
        "Calling an async function executes its body synchronously until the first await, exactly like a normal function. The continuation after the await is scheduled on the microtask queue, so it runs after the current synchronous code finishes but before any timer. This detail decides most ordering-puzzle interview questions.",
    },
  ],
};

export default lesson;
