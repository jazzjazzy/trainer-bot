import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "async-endpoints",
  title: "async def vs def: When Async Actually Helps",
  part: "Pydantic & Responses",
  estMinutes: 13,
  summary:
    "async def endpoints run on the event loop and must never block; plain def endpoints run in a threadpool and are always safe — async only wins when everything you await is genuinely non-blocking I/O.",

  concept: `
This is the most misunderstood FastAPI topic and a near-guaranteed interview
question. The rules are precise, so learn them precisely.

### The two kinds of endpoint

\`\`\`python
@app.get("/sync")
def read_sync():          # runs in a THREADPOOL
    return slow_sync_call()

@app.get("/async")
async def read_async():   # runs on the EVENT LOOP
    return await fast_async_call()
\`\`\`

- **\`async def\`** — FastAPI runs your coroutine directly on the single event
  loop that serves *every* request. While your code \`await\`s real async I/O,
  the loop handles thousands of other connections. But if you call anything
  blocking — \`time.sleep()\`, \`requests.get()\`, a synchronous DB driver — the
  **entire server freezes** for every client until it finishes.
- **plain \`def\`** — FastAPI notices it isn't a coroutine and runs it in an
  external **threadpool**, then awaits the result. Blocking calls are safe
  here: they tie up one worker thread, not the loop. The cost is the pool is
  finite, so heavy traffic queues once threads run out — safe, just less
  scalable than true async I/O.

The counterintuitive consequence: **wrongly-written \`async def\` is worse than
plain \`def\`.** Blocking inside \`async def\` is the classic FastAPI production
incident — the app "randomly hangs under load" because one endpoint called a
sync library while standing on the event loop.

### The PHP mental model

PHP-FPM scales by **process pool**: one worker per in-flight request, blocking
freely, and the pool size caps concurrency. FastAPI's plain-\`def\`-in-a-
threadpool is the same model with threads instead of processes. \`async def\` is
the **Swoole/ReactPHP** model: a single event loop juggling thousands of
connections that are mostly *waiting* — on a database, an upstream API, a
socket. Waiting is cheap on an event loop; computing or blocking is fatal.

### The decision rule

> Use \`async def\` only when **everything you call inside is awaitable**
> (httpx, asyncpg/SQLAlchemy async, aioredis, \`asyncio.sleep\`).
> If anything in the body is sync/blocking — sync SQLAlchemy session,
> \`requests\`, file-heavy work, CPU crunching — use plain \`def\`.

When unsure, plain \`def\` is the safe default: correct always, merely capped by
the threadpool. Never "upgrade" an endpoint to \`async def\` for style points.

### Where async actually wins

The payoff is *concurrent waiting*. An endpoint that needs three upstream
calls can overlap them:

\`\`\`python
import asyncio, httpx

@app.get("/dashboard")
async def dashboard():
    async with httpx.AsyncClient() as client:
        users, orders, stock = await asyncio.gather(
            client.get(USERS_URL),
            client.get(ORDERS_URL),
            client.get(STOCK_URL),
        )
    return {"users": users.json(), "orders": orders.json()}
\`\`\`

Three network round-trips take roughly the time of the slowest one, not the
sum. And even a single-await endpoint scales better: while it waits, the loop
serves everyone else — that's how one process holds thousands of open
connections where a PHP-FPM pool of 50 workers holds 50.
`,

  comparisons: [
    {
      label: "Worker pool vs event loop",
      intro:
        "How each stack survives a slow 2-second upstream call under load. PHP-FPM parks a whole worker on it; async FastAPI parks only the one coroutine.",
      php: `<?php
// PHP-FPM model: one process per request.
// Blocking is FINE -- it's the design.
$user = $db->query('SELECT ...');      // worker blocks
$resp = file_get_contents($apiUrl);    // worker blocks 2s

// Concurrency = pool size (pm.max_children).
// 50 workers => request #51 waits in the socket queue.
echo json_encode(['user' => $user]);`,
      ts: `# app/main.py -- event-loop model
import httpx
from fastapi import FastAPI

app = FastAPI()

@app.get("/profile")
async def profile():
    async with httpx.AsyncClient() as client:
        resp = await client.get(API_URL)   # coroutine parks 2s,
        # ...but the loop keeps serving OTHER requests meanwhile.
    return resp.json()`,
      note:
        "PHP-FPM caps concurrency at the worker count; the event loop caps it at how much waiting you do. FastAPI's plain-def endpoints are the FPM model in miniature — a threadpool of blockable workers.",
    },
    {
      label: "The classic mistake: blocking inside async def",
      intro:
        "Both snippets call a synchronous, blocking library. One is a production incident; the other is fine. Note the left column is Python here — this is a Python-vs-Python trap.",
      php: `# WRONG: blocking on the event loop
import time, requests
from fastapi import FastAPI

app = FastAPI()

@app.get("/report")
async def report():           # async def => runs ON the loop
    time.sleep(2)             # freezes EVERY request for 2s
    data = requests.get(URL)  # sync HTTP: also freezes the loop
    return data.json()`,
      ts: `# RIGHT: same blocking code, plain def
import time, requests
from fastapi import FastAPI

app = FastAPI()

@app.get("/report")
def report():                 # def => runs in the threadpool
    time.sleep(2)             # blocks ONE thread, not the loop
    data = requests.get(URL)  # safe: other requests unaffected
    return data.json()`,
      note:
        "Identical body, opposite behaviour. If anything inside is blocking, drop the async — FastAPI's threadpool exists precisely so sync code stays safe.",
      leftLang: "python",
      rightLang: "python",
    },
    {
      label: "Fanning out to three upstream services",
      intro:
        "A dashboard needs users, orders and stock from three internal APIs. Sequential PHP pays for all three round-trips; asyncio.gather pays only for the slowest.",
      php: `<?php
// Sequential: total time = sum of the three calls.
// (Guzzle async/curl_multi exists, but this is the
// idiomatic controller you actually see.)
$users  = $http->get('http://svc/users')->json();
$orders = $http->get('http://svc/orders')->json();
$stock  = $http->get('http://svc/stock')->json();

return response()->json(compact('users', 'orders', 'stock'));`,
      ts: `# app/main.py
import asyncio, httpx
from fastapi import FastAPI

app = FastAPI()

@app.get("/dashboard")
async def dashboard():
    async with httpx.AsyncClient(base_url="http://svc") as c:
        users, orders, stock = await asyncio.gather(
            c.get("/users"), c.get("/orders"), c.get("/stock")
        )
    return {"users": users.json(), "orders": orders.json(),
            "stock": stock.json()}  # time of slowest, not sum`,
      note:
        "asyncio.gather schedules all three coroutines and awaits them together — this concurrent-waiting pattern is where async def genuinely earns its keep.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Three fake fetches, each awaiting a few times like real I/O. Run sequentially they finish one by one; run with asyncio.gather they interleave. Predict the ordering — it's pure cooperative scheduling (asyncio.sleep(0) just yields to the loop), fully deterministic.",
    code: `import asyncio

# Each "fetch" awaits a few times, like real I/O would. await
# asyncio.sleep(0) hands control back to the event loop -- the
# ordering below is pure cooperative scheduling, no timers.

async def fetch(name, awaits):
    print(f"start {name}")
    for _ in range(awaits):
        await asyncio.sleep(0)  # "waiting on the network"
    print(f"end   {name}")
    return name

async def main():
    print("-- sequential: await one at a time --")
    for name, awaits in (("users", 3), ("orders", 2), ("stock", 1)):
        await fetch(name, awaits)

    print("-- concurrent: asyncio.gather --")
    results = await asyncio.gather(
        fetch("users", 3), fetch("orders", 2), fetch("stock", 1)
    )
    print(f"results: {results}")

asyncio.run(main())`,
    output: `-- sequential: await one at a time --
start users
end   users
start orders
end   orders
start stock
end   stock
-- concurrent: asyncio.gather --
start users
start orders
start stock
end   stock
end   orders
end   users
results: ['users', 'orders', 'stock']`,
  },

  keyPoints: [
    "`async def` endpoints run directly on the single event loop; blocking there (`time.sleep`, `requests`, sync DB drivers) freezes the whole server for everyone.",
    "Plain `def` endpoints are automatically run in a threadpool — blocking is safe, concurrency is just capped by the pool. It's PHP-FPM's worker-pool model with threads.",
    "Decision rule: `async def` only if everything you call inside is awaitable; otherwise use plain `def`. Wrongly async is worse than honestly sync.",
    "Async's real win is concurrent waiting: `await asyncio.gather(...)` overlaps several I/O calls so total time is the slowest call, not the sum.",
    "The event-loop model is Swoole/ReactPHP in PHP terms — one process holding thousands of mostly-waiting connections, versus one worker per request.",
    "`gather` returns results in the order you passed the coroutines, regardless of which finished first.",
  ],

  interview: [
    {
      q: "In FastAPI, when should an endpoint be async def versus plain def?",
      a: "`async def` only when everything inside the function is awaitable — httpx for HTTP, an async DB driver, `asyncio.sleep`. Then the endpoint runs on the event loop and while it awaits, the loop serves other requests, which is where async scales. If the body calls anything blocking — the `requests` library, a sync SQLAlchemy session, heavy CPU work — it should be plain `def`, because FastAPI runs those in a threadpool where blocking only occupies one thread. The dangerous combination is blocking inside `async def`: that stalls the event loop and every in-flight request with it. So my default is: plain `def` unless I can point at the awaits.",
    },
    {
      q: "What actually happens to a plain def endpoint in FastAPI — does it block the server?",
      a: "No. FastAPI detects it's not a coroutine and dispatches it to an external threadpool, then awaits the result from the loop. So a sync endpoint doing a 2-second blocking call ties up one pool thread while the event loop keeps serving everything else. The trade-off is capacity: the threadpool is finite, so under heavy load requests queue for a free thread — a smaller-scale version of PHP-FPM's `pm.max_children` cap, which is exactly the model I ran for years. It's safe-but-bounded, versus async's cheap-waiting-but-unforgiving.",
    },
    {
      q: "A FastAPI service intermittently freezes under load — all endpoints stop responding for a couple of seconds at a time. What's your first suspicion?",
      a: "A blocking call inside an `async def` endpoint or dependency. Because all coroutines share one event loop, a single `time.sleep`, sync HTTP call, or synchronous DB query in async code halts every request in the process for its duration — which presents exactly as intermittent whole-app freezes correlated with traffic to one route. I'd audit `async def` functions for non-awaited I/O. The fix is either to make the call genuinely async (httpx, async driver) or to change the endpoint to plain `def` so it runs in the threadpool.",
    },
    {
      q: "How does FastAPI's concurrency story compare to PHP-FPM?",
      a: "PHP-FPM is a process pool: each request owns a worker, blocking is free, and concurrency equals pool size. FastAPI gives you both models in one framework. Plain `def` endpoints reproduce the pool model with threads — familiar semantics, bounded concurrency. `async def` endpoints are the event-loop model, like Swoole or ReactPHP in the PHP world: one process multiplexes thousands of connections that are mostly waiting on I/O, so I/O-bound concurrency gets dramatically cheaper, but the code must never block the loop. That discipline is the price of the scalability.",
    },
  ],

  quiz: [
    {
      question:
        "An async def endpoint calls time.sleep(2). What happens under load?",
      options: [
        "Only that request is delayed by 2 seconds",
        "FastAPI moves the call to the threadpool automatically",
        "Every in-flight request in the process stalls for 2 seconds — the event loop is blocked",
        "Python raises an error because sleep is not awaitable",
      ],
      answerIndex: 2,
      explain:
        "async def code runs on the shared event loop; a blocking call there stops the loop and every coroutine on it. FastAPI only threadpools plain def endpoints — it can't rescue blocking calls inside a coroutine. This is the classic FastAPI production incident.",
    },
    {
      question:
        "Your endpoint uses the synchronous requests library and a sync SQLAlchemy session. What should its signature be?",
      options: [
        "async def, because FastAPI is an async framework",
        "def — FastAPI will run it in a threadpool, so blocking is safe",
        "async def, but wrap each call in await",
        "Either — the two are equivalent in FastAPI",
      ],
      answerIndex: 1,
      explain:
        "The rule is: async def only if everything inside is awaitable. With sync libraries, plain def is correct — FastAPI runs it in a worker thread so the event loop stays free. You can't just 'await' a sync function; await needs an awaitable.",
    },
    {
      question:
        "Why does await asyncio.gather(a(), b(), c()) beat awaiting a(), b(), c() one after another for three upstream API calls?",
      options: [
        "gather runs them in separate OS threads",
        "gather overlaps the waiting, so total time is roughly the slowest call instead of the sum",
        "gather caches the responses between requests",
        "It doesn't — the total time is identical",
      ],
      answerIndex: 1,
      explain:
        "gather schedules all three coroutines on the loop at once; while one waits on the network the others progress. That concurrent waiting — not threads — is the entire payoff of async I/O.",
    },
    {
      question:
        "Which PHP technology is the closest analogue of FastAPI's async def event loop?",
      options: [
        "PHP-FPM's worker pool",
        "Apache mod_php",
        "Swoole / ReactPHP",
        "cron with queued jobs",
      ],
      answerIndex: 2,
      explain:
        "Swoole and ReactPHP run a single event loop handling many concurrent, mostly-waiting connections — the async model. PHP-FPM's one-worker-per-request pool corresponds to FastAPI's plain-def threadpool instead.",
    },
  ],
};

export default lesson;
