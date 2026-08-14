import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "async-typescript",
  title: "Asynchronous TypeScript",
  part: "Modern Runtime & Async",
  estMinutes: 16,
  summary:
    "How a single-threaded, never-blocking event loop changes everything you assume about I/O — and why async/await makes it read almost like the synchronous PHP you already write.",

  concept: `
This is the section where your PHP instincts will fight you. The fix is not a new
keyword — it's a new **mental model** of how the program runs.

### The mindset shift: blocking vs. non-blocking

In PHP, a script is born when a request arrives and dies when the response is
sent. Everything in between is **synchronous and blocking**: when you call
\`$db->query(...)\` or \`file_get_contents(...)\`, that line *stops the world*
until the result comes back. The PHP process literally sits and waits. Because
each request gets its own fresh process, that's fine — blocking one process
doesn't block another.

JavaScript is the opposite. A Node server (or a browser tab) is **one
long-lived process running a single thread**. If a line blocked that thread,
*nothing else could happen* — no other request, no clicks, no timers. So JS
makes I/O **non-blocking**: you start the work, hand the runtime a callback, and
the thread is immediately free to do other things. When the result is ready, the
**event loop** picks up your callback and runs it.

> PHP = fresh process per request, blocks freely. JS = one process forever,
> must never block. That single constraint explains all of async JS.

### Promises

A \`Promise<T>\` is a placeholder for a value that isn't here *yet* — "I'll
eventually give you a \`T\`, or fail with an error." It has three states:
*pending*, *fulfilled*, *rejected*.

\`\`\`typescript
const p: Promise<number> = fetch("/count").then((r) => r.json());
\`\`\`

### async / await

\`await\` pauses **your function** (not the thread) until a promise settles, then
gives you the unwrapped value. An \`async\` function always returns a
\`Promise\`. This is the magic: non-blocking code that *reads* top-to-bottom like
the blocking PHP you know.

\`\`\`typescript
async function loadUser(id: number): Promise<User> {
  const res = await fetch(\`/users/\${id}\`); // thread is free while we wait
  return (await res.json()) as User;
}
\`\`\`

### Doing things in parallel & handling errors

- \`Promise.all([...])\` runs promises **concurrently** and resolves when all
  finish — far faster than awaiting each in turn.
- Wrap \`await\` in **\`try/catch\`**; a rejected promise throws right there,
  just like an exception.
`,

  comparisons: [
    {
      label: "Blocking I/O vs. non-blocking await",
      intro:
        "Fetch a user record from a remote API and print their name. Both versions get the same data; the difference is what the runtime is allowed to do while waiting for the response.",
      php: `<?php
// Blocks the process until the HTTP call returns:
$json = file_get_contents("https://api.example.com/user/1");
$user = json_decode($json, true);
echo $user["name"];`,
      ts: `// Frees the thread while waiting; resumes when the data arrives:
const res = await fetch("https://api.example.com/user/1");
const user = await res.json();
console.log(user.name);`,
      note:
        "PHP stops the whole process on that line. TS yields the thread so other work runs, then continues.",
    },
    {
      label: "Process lifetime",
      intro:
        "Count how many times the app has been hit. This shows where that counter lives between requests, and whether it survives once a request finishes.",
      php: `<?php
// One request = one fresh process. State dies at the end.
session_start();
$_SESSION["hits"] = ($_SESSION["hits"] ?? 0) + 1;
echo $_SESSION["hits"];`,
      ts: `// One long-lived process serves every request. State persists in memory.
let hits = 0;
server.on("request", (req, res) => {
  hits += 1;
  res.end(String(hits));
});`,
      note:
        "PHP forgets everything between requests; JS keeps the process (and your variables) alive.",
    },
    {
      label: "Sequential vs. concurrent work",
      intro:
        "Call two independent endpoints and combine their responses. Since neither call depends on the other, the goal is to finish in the time of one request rather than two.",
      php: `<?php
// Two calls run one after the other — total time = sum of both.
$a = file_get_contents("https://api.example.com/a"); // wait...
$b = file_get_contents("https://api.example.com/b"); // ...then wait again
echo $a . $b;`,
      ts: `// Both start at once — total time ≈ the slower of the two.
const [a, b] = await Promise.all([
  fetch("https://api.example.com/a").then((r) => r.text()),
  fetch("https://api.example.com/b").then((r) => r.text()),
]);
console.log(a + b);`,
      note:
        "Plain PHP has no mainstream concurrency; Promise.all is everyday JS.",
    },
    {
      label: "Error handling around I/O",
      intro:
        "Run an I/O operation that might fail and log the error instead of crashing. The aim is to show that async failures are caught with the same try/catch structure as synchronous ones.",
      php: `<?php
try {
    $pdo = new PDO($dsn);
    $row = $pdo->query("SELECT 1")->fetch();
} catch (PDOException $e) {
    error_log($e->getMessage());
}`,
      ts: `try {
  const res = await fetch("/health");
  const row = await res.json();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
}`,
      note:
        "A rejected promise throws at the await, so the same try/catch you know still works.",
    },
  ],

  playground: {
    intro:
      "Watch the ordering and timing. Notice the two parallel delays finish in ~300ms total, not 500ms — that's the event loop letting them run concurrently.",
    code: `// A Promise-based delay: resolves after \`ms\` milliseconds.
function delay(ms: number): Promise<number> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(ms), ms);
  });
}

async function main(): Promise<void> {
  const start = Date.now();
  console.log("start");

  // Sequential await: the function pauses here (thread stays free).
  await delay(200);
  console.log("after 200ms wait, elapsed ~", Date.now() - start, "ms");

  // Concurrent: both timers start NOW and run at the same time.
  const results = await Promise.all([delay(300), delay(200)]);
  console.log("Promise.all resolved with:", results);
  console.log("total elapsed ~", Date.now() - start, "ms (≈500, not 700)");
}

// This log runs BEFORE main() finishes — proof we never blocked the thread.
main();
console.log("this prints immediately, before the awaits complete");`,
  },

  keyPoints: [
    "**Blocking vs. non-blocking** is the core shift: PHP waits on a line; JS hands off and keeps the single thread free.",
    "JS runs **one long-lived, single-threaded process** with an **event loop** — unlike PHP's fresh-process-per-request model.",
    "A `Promise<T>` is a future value (pending → fulfilled/rejected); an `async` function always returns one.",
    "`await` pauses *your function*, not the thread, and unwraps the resolved value so code reads top-to-bottom.",
    "`Promise.all([...])` runs work **concurrently**; awaiting one-by-one is sequential and slower.",
    "Wrap `await` in **`try/catch`** — a rejected promise throws exactly like an exception.",
  ],

  interview: [
    {
      q: "Coming from PHP, explain why JavaScript needs async at all.",
      a: "PHP gives each request its own process, so a blocking call like `file_get_contents` only stalls *that* process — perfectly acceptable. JavaScript runs **one long-lived process on a single thread**. If any I/O blocked that thread, the entire server (or browser tab) would freeze for everyone. So JS makes I/O **non-blocking**: you start the operation, the thread is freed to do other work, and the **event loop** resumes your code via a callback/promise when the result is ready.",
    },
    {
      q: "What is a Promise, and how does `async`/`await` relate to it?",
      a: "A `Promise<T>` represents a value that will be available later — it's *pending*, then either *fulfilled* with a `T` or *rejected* with an error. `async`/`await` is syntactic sugar over promises: marking a function `async` makes it return a `Promise`, and `await` pauses that function until a promise settles, handing you the unwrapped value. The result reads like synchronous PHP while staying fully non-blocking underneath.",
    },
    {
      q: "How do you run several async operations in parallel, and why does it matter?",
      a: "Use `Promise.all([...])`, which starts all the promises immediately and resolves once every one is done (rejecting fast if any fails). Awaiting calls one after another is **sequential** — total time is the *sum* of each. `Promise.all` is **concurrent** — total time is roughly the *slowest single* operation. For independent I/O (e.g. several API calls) this is often a multiple-times speedup, and it's something PHP only reaches with core Fibers (8.1+), an event-loop library like AMPHP or ReactPHP, or curl_multi_exec.",
    },
    {
      q: "How do you handle errors from `await`ed code?",
      a: "A rejected promise throws at the `await` expression, so a normal `try/catch` block catches it — the same mental model as catching a PHP exception around a database call. `await Promise.all([...])` rejects as soon as any one promise rejects. If you instead need *all* results regardless of individual failures, use `Promise.allSettled`, which never rejects and reports each outcome.",
    },
  ],

  quiz: [
    {
      question: "What does `await` actually pause?",
      options: [
        "The entire single thread, like a blocking PHP call",
        "Only the current async function, leaving the thread free for other work",
        "Nothing — it runs synchronously",
        "The operating system process until the timer fires",
      ],
      answerIndex: 1,
      explain:
        "`await` suspends just your async function. The event loop keeps running everything else on the single thread; that's why JS never blocks while waiting on I/O.",
    },
    {
      question:
        "Two independent fetches each take ~300ms. Which approach finishes fastest?",
      options: [
        "`await fetchA(); await fetchB();` — about 600ms",
        "`await Promise.all([fetchA(), fetchB()])` — about 300ms",
        "Both take the same time on a single thread",
        "Neither works without multiple threads",
      ],
      answerIndex: 1,
      explain:
        "`Promise.all` starts both immediately and runs them concurrently, so total time is roughly the slower one (~300ms). Sequential awaits add up to ~600ms.",
    },
    {
      question:
        "What is the key runtime difference between a PHP script and a Node server?",
      options: [
        "PHP is faster because it is compiled ahead of time",
        "Node spawns a fresh process per request, like PHP does",
        "PHP gets a fresh process per request; Node is one long-lived single-threaded process with an event loop",
        "Both block the thread on I/O by default",
      ],
      answerIndex: 2,
      explain:
        "PHP's per-request process can block freely and forgets state between requests. Node runs one persistent single-threaded process, so it relies on a non-blocking event loop and keeps in-memory state alive.",
    },
  ],
};

export default lesson;
