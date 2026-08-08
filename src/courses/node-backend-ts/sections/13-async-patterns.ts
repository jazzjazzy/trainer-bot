import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "async-patterns",
  title: "Async Patterns for Request Handlers",
  part: "Async, Data & Validation",
  estMinutes: 12,
  summary:
    "Sequential awaits are a self-inflicted latency tax when the work is independent — Promise.all fans out, Promise.allSettled tolerates partial failure, and a forgotten await silently swallows errors.",

  concept: `
Twenty-five years of PHP trains one deep habit: do things **in order**. Query
the user, then query the orders, then render. That's not a flaw in PHP — with
one process per request, sequential is the only option, and it costs the other
users nothing. In Node the same habit becomes a measurable tax you pay on
every request.

### Sequential awaits vs \`Promise.all\`

\`await\` pauses **this handler** (not the process) until a promise settles. Two
independent 300ms queries awaited in sequence cost ~600ms of response time.
Start them both first, then wait once:

\`\`\`ts
// ~600ms — the PHP instinct, transplanted:
const user = await fetchUser(id);
const orders = await fetchOrders(id);

// ~300ms — both in flight at once:
const [user, orders] = await Promise.all([fetchUser(id), fetchOrders(id)]);
\`\`\`

The rule: **sequential when step B needs step A's result, parallel when the
steps are independent.** \`Promise.all\` rejects as soon as any input rejects
(fail-fast). When you want partial-failure tolerance — say, three enrichment
calls where two out of three is still a useful response — use
\`Promise.allSettled\`, which always resolves with a
\`{ status: 'fulfilled' | 'rejected', ... }\` record per input.

### async functions always return promises

Mark a function \`async\` and its return value is **always** a promise —
\`return 42\` becomes a promise of 42, and a \`throw\` becomes a **rejected
promise**, not a synchronous exception. That's why Express 5 can catch async
handler errors: the handler hands back a promise, and the framework watches it.

### The forgotten \`await\` — a floating promise

The classic Node bug, and a favourite interview topic:

\`\`\`ts
const user = fetchUser(id);      // forgot await!
console.log(user.name);          // undefined — user is a Promise
\`\`\`

No crash, no type of error at the call site — you just have the box instead of
the contents (TypeScript flags \`user.name\` here, one of its best services).
The nastier variant: calling an async function without \`await\` inside a
\`try/catch\`. The rejection happens **after** the try block has already
finished, so the catch never fires and the error is swallowed — or worse,
becomes an unhandled rejection. \`typescript-eslint\`'s \`no-floating-promises\`
rule exists precisely for this.

### Callbacks and .then — legacy literacy only

You will read older code shaped like \`fs.readFile(path, (err, data) => ...)\`
(error-first callbacks, nesting into the "pyramid of doom") and middle-aged
code chaining \`.then(user => ...).catch(err => ...)\`. Understand both; write
neither. \`async/await\` is the same promise machinery with readable control
flow and real \`try/catch\` — every callback-style Node builtin has a promise
form (\`node:fs/promises\`).
`,

  comparisons: [
    {
      label: "Two independent API calls",
      intro:
        "A handler needs a user profile and their order history from two independent services. PHP with Guzzle does them one after another; Node starts both and waits once.",
      php: `<?php
// PHP + Guzzle: each call blocks this worker until done.
// Total wall time = sum of both calls (~600ms).
$client = new GuzzleHttp\\Client();

$user   = json_decode(
    $client->get("http://users/api/{$id}")->getBody()
);
$orders = json_decode(
    $client->get("http://orders/api/{$id}")->getBody()
);

// Fine in PHP: only THIS request waits; every other
// request has its own process.`,
      ts: `// Node: start both, await once. Total ≈ slowest call (~300ms).
const [userRes, ordersRes] = await Promise.all([
  fetch(\`http://users/api/\${id}\`),
  fetch(\`http://orders/api/\${id}\`),
]);
const user = await userRes.json();
const orders = await ordersRes.json();

// Sequential awaits here would work — but double the
// latency of every single request, for nothing.`,
      note: "Promise.all is fail-fast: one rejection rejects the whole thing. Reach for Promise.allSettled when a partial result is still a useful response.",
    },
    {
      label: "The forgotten await, and its fix",
      intro:
        "Both sides compile and run. The left one logs undefined and swallows the failure entirely; the right one gets data and errors where it expects them.",
      php: `// BUG: no await — user is a Promise, not a user.
async function handler(id: number) {
  try {
    const user = getUser(id);   // Promise<User>, floating
    console.log(user.name);     // undefined (TS flags this)
  } catch (err) {
    // If getUser rejects, it happens AFTER this block
    // finished — this catch can never fire.
    console.error(err);
  }
}`,
      ts: `// FIX: await inside the try — now the rejection is
// a catchable exception in this stack.
async function handler(id: number) {
  try {
    const user = await getUser(id); // User
    console.log(user.name);
  } catch (err) {
    console.error(err);             // fires on rejection
  }
}`,
      note: "A floating promise fails silently: the value is missing AND the rejection escapes the try/catch. Lint it away with typescript-eslint's no-floating-promises.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Legacy async styles you must be able to read",
      intro:
        "Reading a file in the three eras of Node async. You'll meet all three in real codebases; you should only write the third.",
      php: `// Era 1: error-first callbacks (still in old code)
import { readFile } from "node:fs";
readFile("config.json", "utf8", (err, data) => {
  if (err) return console.error(err);
  const config = JSON.parse(data);
  // ...more work means more nesting ("pyramid of doom")
});

// Era 2: promise chains
import { readFile as readFileP } from "node:fs/promises";
readFileP("config.json", "utf8")
  .then((data) => JSON.parse(data))
  .then((config) => console.log(config.port))
  .catch((err) => console.error(err));`,
      ts: `// Era 3: async/await — same promises, readable control flow
import { readFile } from "node:fs/promises";

try {
  const data = await readFile("config.json", "utf8");
  const config = JSON.parse(data);
  console.log(config.port);
} catch (err) {
  console.error(err);
}`,
      note: "All three run on the same event loop; async/await is syntax over promises, not a new mechanism. Know the older forms for code reviews and interview questions.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Two simulated 300ms queries, timed sequentially and with Promise.all — predict roughly what each timing will print. Then watch a forgotten await hand back the box instead of the contents, and swallow its own error.",
    code: `function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function fetchUser() {
  return delay(300, { id: 1, name: "Ada" });
}
async function fetchOrders() {
  return delay(300, [{ id: 101, total: 99.5 }]);
}

// 1. Sequential awaits — the PHP instinct, transplanted:
let t0 = performance.now();
const user1 = await fetchUser();
const orders1 = await fetchOrders();
console.log(
  "sequential: " + Math.round(performance.now() - t0) + "ms —",
  user1.name + ",", orders1.length, "order(s)"
);

// 2. Promise.all — both queries in flight at once:
t0 = performance.now();
const [user2, orders2] = await Promise.all([fetchUser(), fetchOrders()]);
console.log(
  "parallel:   " + Math.round(performance.now() - t0) + "ms —",
  user2.name + ",", orders2.length, "order(s)"
);

// 3. The forgotten await: you get the promise, not the value.
const oops = fetchUser(); // no await!
console.log("forgot await -> is it a Promise?", oops instanceof Promise);
await oops; // clean up so the demo ends tidily

// 4. Worse: a floating promise swallows its own rejection.
async function failingQuery(): Promise<string> {
  await delay(50, null);
  throw new Error("duplicate key value violates unique constraint");
}

let floating: Promise<string> | undefined;
try {
  floating = failingQuery(); // no await — rejection happens LATER
  console.log("try/catch finished: it saw NO error");
} catch {
  console.log("this catch never runs");
}

// The rejection only surfaces if someone attaches a handler:
await floating?.catch((err) =>
  console.log("rejection surfaced via .catch:", (err as Error).message)
);`,
  },

  keyPoints: [
    "`await` pauses only the current handler, not the process — other requests keep being served while a promise is pending.",
    "Sequential `await`s on independent work add their latencies together; `Promise.all` runs them concurrently so the cost is the slowest one. Use sequential only when B needs A's result.",
    "`Promise.all` is fail-fast (first rejection rejects everything); `Promise.allSettled` always resolves with per-input fulfilled/rejected records for partial-failure tolerance.",
    "An `async` function always returns a promise — `return` fulfils it, `throw` rejects it. That's the hook Express 5 uses to catch async handler errors.",
    "A forgotten `await` creates a floating promise: the value is a Promise object, and a later rejection escapes any surrounding try/catch. TypeScript and no-floating-promises both catch this.",
    "Error-first callbacks and `.then` chains are legacy-codebase literacy — read them fluently, write `async/await`.",
  ],

  interview: [
    {
      q: "When would you use Promise.all versus sequential awaits versus Promise.allSettled?",
      a: "It's driven by data dependency and failure tolerance. If step B needs step A's result — fetch the user, then query by the user's account id — sequential awaits are correct. If the operations are independent, like fetching a profile and an order history, I start them together with `Promise.all` so the handler's latency is the slowest call instead of the sum; coming from PHP where everything is sequential by nature, this is the habit I had to consciously build. `Promise.all` is fail-fast — one rejection rejects the lot — which is right when the response is useless without every part. When partial results are acceptable, say three enrichment sources where two out of three still makes a good response, `Promise.allSettled` gives me a fulfilled/rejected record per input and I decide what to do with the failures.",
    },
    {
      q: "What actually goes wrong when you forget an await?",
      a: "Two distinct failures. First, you have the box instead of the contents: the variable holds a `Promise`, so `user.name` is `undefined` — TypeScript usually catches this because `Promise<User>` has no `name` property. Second, and nastier, error handling silently breaks: if I call an async function inside a try/catch without awaiting it, the function's rejection happens after the try block has already completed, so the catch never fires. The error is either swallowed or becomes an unhandled promise rejection — which in modern Node can crash the whole process. That's why I run `typescript-eslint`'s `no-floating-promises` rule; it makes every un-awaited promise an explicit, visible decision.",
    },
    {
      q: "Does await block the Node.js event loop?",
      a: "No — and that distinction is the heart of the runtime. `await` suspends the current async function and returns control to the event loop, so Node keeps serving every other request while the promise is pending; when it settles, the function resumes as a microtask. What does block the loop is synchronous CPU-bound work — a huge JSON.parse, a tight loop, synchronous crypto — because no await point ever yields. So sequential awaits hurt only that one request's latency, but a blocking computation freezes every concurrent user. In PHP that difference barely exists: the process is yours alone either way.",
    },
  ],

  quiz: [
    {
      question:
        "A handler awaits two independent 300ms queries one after the other. Roughly how long does the handler take, and what's the fix?",
      options: [
        "~300ms; no fix needed, awaits overlap automatically",
        "~600ms; start both and use Promise.all to make it ~300ms",
        "~600ms; move the queries into setTimeout callbacks",
        "~300ms, but other users are blocked for 600ms",
      ],
      answerIndex: 1,
      explain:
        "Each await waits for its promise to settle before the next line runs, so independent 300ms calls in sequence cost ~600ms. Promise.all starts both immediately and waits once, cutting it to the slowest call. Other users are never blocked either way — await yields to the event loop.",
    },
    {
      question:
        "Inside a try/catch, you call an async function WITHOUT await and it later rejects. What happens?",
      options: [
        "The catch block handles the rejection normally",
        "The rejection is silently converted to undefined",
        "The catch never fires — the rejection happens after the try block finished",
        "Node retries the function once before rejecting",
      ],
      answerIndex: 2,
      explain:
        "Without await, the try block completes as soon as the call returns its (pending) promise. The rejection arrives later, outside any active try/catch — it's swallowed or becomes an unhandled rejection. Awaiting the promise inside the try is what routes the rejection into the catch.",
    },
    {
      question: "What does an async function return when its body throws?",
      options: [
        "It raises a synchronous exception at the call site",
        "A rejected promise",
        "undefined",
        "null, with the error logged to stderr",
      ],
      answerIndex: 1,
      explain:
        "async functions always return promises: return fulfils, throw rejects. The caller only feels the error when it awaits (or .catch-es) that promise — which is also why Express 5 can route async handler throws to error middleware by watching the returned promise.",
    },
    {
      question: "When is Promise.allSettled the right choice over Promise.all?",
      options: [
        "When you need the results in completion order",
        "When some inputs may reject and you still want the successful results",
        "When the promises must run one at a time",
        "Always — allSettled is the modern replacement for all",
      ],
      answerIndex: 1,
      explain:
        "Promise.all rejects as soon as any input rejects, discarding the rest. Promise.allSettled always resolves with a { status, value | reason } record per input, so you can use the fulfilled results and handle the rejected ones — right for partial-failure tolerance, wrong when the response is useless without every part.",
    },
  ],
};

export default lesson;
