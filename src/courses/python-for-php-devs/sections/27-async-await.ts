import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "async-await",
  title: "async/await: Concurrency PHP Never Had",
  part: "Real-World Python",
  estMinutes: 14,
  summary:
    "Python's asyncio gives you in-process concurrency — many I/O waits overlapping on one event loop — a model classic PHP simply outsources to FPM workers.",

  concept: `
### The mental-model gap

Classic PHP code is strictly synchronous, and that's fine because the *server*
provides concurrency: PHP-FPM runs many workers, each handling one request from
start to finish. If your request makes three slow API calls with curl, they run
one after another and your user waits for the sum. The workarounds —
\`curl_multi_*\`, Guzzle promises, or since PHP 8.1 **fibers** (the low-level
primitive Swoole/ReactPHP-style runtimes build on) — never became everyday PHP.

Python bakes the alternative into the language: **asyncio**, an event loop that
runs *inside your process* and interleaves many tasks whenever one of them is
waiting on I/O. One process, one thread, thousands of concurrent waits.

### Coroutines: async def / await

\`\`\`python
import asyncio

async def fetch_user(uid: int) -> dict:
    await asyncio.sleep(0.1)          # stand-in for a network call
    return {"id": uid}

async def main():
    user = await fetch_user(1)        # await = "pause me, loop, do other work"
    print(user)

asyncio.run(main())                   # the entry point: starts/stops the loop
\`\`\`

Three rules that surprise everyone:

- Calling \`fetch_user(1)\` does **nothing** — it returns a coroutine object.
  Work only happens when it's awaited or scheduled as a task. (Forgetting the
  \`await\` is the classic bug; Python warns "coroutine was never awaited".)
- \`await\` is only legal **inside an \`async def\`**. At the top level you hand
  one coroutine to \`asyncio.run()\`.
- Awaiting one thing sequentially buys you nothing. The win comes from running
  awaits **concurrently**.

### The canonical win: fan-out with gather

\`\`\`python
users, orders, stock = await asyncio.gather(
    api.get("/users"), api.get("/orders"), api.get("/stock"),
)
\`\`\`

Three calls complete in the time of the *slowest one*, not the sum — the thing
sequential PHP curl can't do without \`curl_multi\` gymnastics. Results come back
in argument order regardless of finish order. Python 3.11 added
\`asyncio.TaskGroup\` as a structured alternative with better error handling.

### The golden rule: never block the loop

One thread runs *everything*. A blocking call — \`time.sleep()\`, \`requests.get()\`,
a synchronous DB driver — freezes the entire loop and every other task with it.
Use the async spellings: \`asyncio.sleep()\`, an async HTTP client (\`httpx\`,
\`aiohttp\`), async DB drivers. This is why async is viral: an async endpoint
calling a blocking library is *worse* than plain sync code.

### When it matters — and when it doesn't

Async shines for **I/O-bound fan-out**: aggregating APIs, websockets, scrapers,
FastAPI \`async def\` endpoints holding thousands of idle connections. It does
nothing for **CPU-bound** work — and here Python has an extra wrinkle: the
**GIL** (global interpreter lock) means threads in one process don't run Python
bytecode in parallel either, so heavy computation wants *processes*
(\`multiprocessing\` / \`concurrent.futures.ProcessPoolExecutor\`). (Python 3.13
ships an experimental free-threaded build, but the GIL is still the norm.)

| Workload | Reach for |
| --- | --- |
| Many concurrent I/O waits (APIs, sockets) | \`asyncio\` |
| A few blocking I/O calls, legacy libraries | threads (\`ThreadPoolExecutor\`) |
| CPU-heavy number crunching | processes (\`ProcessPoolExecutor\`) |

PHP 8.1's fibers gave PHP the same *primitive*, but Python has the thing that
actually matters: a decade of ecosystem — async web frameworks, HTTP clients,
and DB drivers that all speak \`await\`.
`,

  comparisons: [
    {
      label: "Three API calls: sequential vs concurrent",
      intro:
        "Fetch three endpoints that each take ~1 second. PHP with plain curl pays 3 seconds; asyncio pays roughly 1 second — the slowest call.",
      php: `<?php
// aggregate.php — classic PHP: one after another (~3s total)
function fetchJson(string $url): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $body = curl_exec($ch);
    curl_close($ch);
    return json_decode($body, true);
}

$users  = fetchJson('https://api.test/users');   // ~1s
$orders = fetchJson('https://api.test/orders');  // ~1s
$stock  = fetchJson('https://api.test/stock');   // ~1s
// concurrency would need curl_multi_* or Guzzle promises`,
      ts: `# aggregate.py — asyncio: all three in flight at once (~1s total)
import asyncio
import httpx  # async HTTP client (pip install httpx)

async def main() -> None:
    async with httpx.AsyncClient() as client:
        r_users, r_orders, r_stock = await asyncio.gather(
            client.get("https://api.test/users"),
            client.get("https://api.test/orders"),
            client.get("https://api.test/stock"),
        )
    print(r_users.json(), r_orders.json(), r_stock.json())

asyncio.run(main())`,
      note:
        "gather() starts all awaitables and completes in the time of the slowest; results come back in argument order — no promise-unwrapping ceremony.",
    },
    {
      label: "Where concurrency lives: the server vs your code",
      intro:
        "Both handle many clients at once. PHP scales by running many synchronous workers; async Python multiplexes many requests inside one process.",
      php: `<?php
// index.php — the code is 100% synchronous.
// Concurrency = php-fpm spawning N workers,
// each owning ONE request until it dies.
$user = $repo->find((int) $_GET['id']); // blocks this worker
echo json_encode($user);
// 200 slow clients => you need ~200 workers`,
      ts: `# app.py — FastAPI: one process, one loop, many requests
from fastapi import FastAPI

app = FastAPI()

@app.get("/users/{uid}")
async def get_user(uid: int) -> dict:
    user = await repo.find(uid)   # while this waits,
    return user                   # the loop serves others
# 200 slow clients => still one worker, 200 idle awaits`,
      note:
        "PHP's request-per-worker model dies with the request; an asyncio server is one long-lived process where a single blocking call stalls every request on the loop.",
    },
    {
      label: "The blocking-call trap",
      intro:
        "A 2-second pause inside a handler. In PHP it delays one worker; on an event loop the wrong sleep delays everyone.",
      php: `<?php
// PHP: sleep() blocks only THIS fpm worker.
// Other workers keep serving other requests.
sleep(2);
echo "done\\n";`,
      ts: `# Python: on the event loop these are night and day.
import asyncio, time

async def bad() -> None:
    time.sleep(2)          # BLOCKS the whole loop:
                           # every other task freezes for 2s

async def good() -> None:
    await asyncio.sleep(2) # yields: other tasks run meanwhile

asyncio.run(good())`,
      note:
        "Same rule for requests vs httpx/aiohttp and sync vs async DB drivers: inside async def, every slow call must be awaitable or the loop stalls.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Three fake API calls with different delays, launched together with gather(). Predict the interleaving: do the 'start' lines all print before any 'done' line, and which call finishes first?",
    code: `# fanout.py — three "API calls" running concurrently on one event loop.
# Watch the interleaving: everything starts before anything finishes,
# and the fastest call completes first — impossible in sequential PHP.
import asyncio

async def fetch(name: str, delay: float) -> str:
    print(f"start {name}")
    await asyncio.sleep(delay)   # yields control — NOT time.sleep!
    print(f"done  {name} ({delay}s)")
    return f"{name}-payload"

async def main() -> None:
    results = await asyncio.gather(
        fetch("users", 0.03),
        fetch("orders", 0.02),
        fetch("stock", 0.01),
    )
    print("results:", results)
    print("order preserved despite finish order:", results[0] == "users-payload")

asyncio.run(main())`,
    output: `start users
start orders
start stock
done  stock (0.01s)
done  orders (0.02s)
done  users (0.03s)
results: ['users-payload', 'orders-payload', 'stock-payload']
order preserved despite finish order: True`,
  },

  keyPoints: [
    "Classic PHP is synchronous per request; concurrency comes from FPM workers. asyncio moves concurrency *into your process*: one event loop interleaving tasks at every `await`.",
    "Calling an `async def` function returns a coroutine that does nothing until awaited or scheduled; `asyncio.run(main())` is the program's entry point, and `await` is only legal inside `async def`.",
    "`asyncio.gather()` runs awaitables concurrently — N calls finish in the time of the slowest, with results in argument order (Python 3.11 adds `asyncio.TaskGroup`).",
    "Never block the loop: `time.sleep()` or `requests` inside async code stalls *every* task — use `asyncio.sleep()` and async clients like `httpx`/`aiohttp`.",
    "Async helps I/O-bound fan-out (APIs, websockets, FastAPI endpoints), not CPU-bound work — the GIL means heavy computation wants processes, and threads suit blocking-I/O libraries.",
    "PHP 8.1 fibers are the same primitive, but Python's advantage is the ecosystem: frameworks, HTTP clients, and DB drivers that are async end to end.",
  ],

  interview: [
    {
      q: "PHP never needed async — why does Python code use it so much?",
      a: "Because the execution models differ. PHP gets concurrency from the server: FPM runs many workers and each request is synchronous, so slow I/O just occupies one worker. Python services are long-lived processes, and asyncio lets one process overlap thousands of I/O waits on a single event loop — so an endpoint that fans out to three APIs awaits them with `asyncio.gather()` and pays only the slowest call, where sequential PHP curl pays the sum. It's the same idea as Guzzle promises or PHP 8.1 fibers, except it's built into the language and the whole ecosystem — FastAPI, httpx, async DB drivers — actually speaks it.",
    },
    {
      q: "What happens if you call a blocking function like time.sleep() or requests.get() inside async code?",
      a: "You stall the entire event loop. Everything on the loop runs in one thread, and tasks only take turns at `await` points — a blocking call never yields, so every other task (every other request, in a web app) freezes until it returns. The fix is to use awaitable equivalents — `asyncio.sleep()`, `httpx`/`aiohttp` instead of `requests`, async DB drivers — or to push an unavoidable blocking call onto a thread with `asyncio.to_thread()`. This has no PHP analogue: `sleep()` in PHP only ties up that one FPM worker.",
    },
    {
      q: "When would you choose asyncio vs threads vs processes in Python?",
      a: "Triage by workload. I/O-bound with high concurrency — API fan-out, websockets, many idle connections — is asyncio's home ground: cheapest per task, single-threaded, no locking. I/O-bound but stuck with blocking libraries suits a thread pool, since threads can wait on I/O in parallel even under the GIL. CPU-bound work needs processes (`ProcessPoolExecutor`), because the GIL prevents threads in one process from executing Python bytecode simultaneously — async gives you nothing there since nothing is *waiting*. Coming from PHP, the honest extra option is 'none of the above': for a classic request/response CRUD app, synchronous Python behind multiple gunicorn workers is exactly the FPM model and perfectly respectable.",
    },
    {
      q: "What does it mean that calling an async function 'does nothing'?",
      a: "Calling `fetch(1)` on an `async def` doesn't execute the body — it builds and returns a coroutine object, the way calling a generator function returns a generator. The body only runs when the coroutine is driven: `await`ed, wrapped in a task via `asyncio.create_task()`/`TaskGroup`, or passed to `asyncio.run()`. Forgetting the `await` is the signature beginner bug; the call appears to succeed, nothing happens, and Python emits a 'coroutine ... was never awaited' RuntimeWarning. There's no PHP equivalent — a PHP function call always runs the body.",
    },
  ],

  quiz: [
    {
      question: "Three awaited API calls take 1s, 2s and 3s. How long does `await asyncio.gather(a, b, c)` take, roughly?",
      options: [
        "6 seconds — awaits always run in order",
        "3 seconds — they overlap, so the slowest call sets the total",
        "1 second — gather returns as soon as the first finishes",
        "2 seconds — gather runs calls two at a time",
      ],
      answerIndex: 1,
      explain:
        "gather() schedules all awaitables concurrently on the loop; while one waits on the network the others progress, so total time ≈ the slowest call (~3s). Sequential awaits — or classic PHP curl — would pay the 6s sum.",
    },
    {
      question: "Inside an async FastAPI endpoint you call time.sleep(2). What happens?",
      options: [
        "Only that request is delayed by 2 seconds, like sleep() in PHP-FPM",
        "Python raises an error — blocking calls are forbidden in async def",
        "The whole event loop blocks: every in-flight request stalls for 2 seconds",
        "The loop automatically moves the call to a background thread",
      ],
      answerIndex: 2,
      explain:
        "The event loop is single-threaded and only switches tasks at await points. time.sleep() never yields, so all tasks on the loop freeze — unlike PHP, where a blocking sleep only occupies one FPM worker. Use await asyncio.sleep(2) or asyncio.to_thread().",
    },
    {
      question: "What does calling an `async def` function without `await` do?",
      options: [
        "Runs the function synchronously to completion",
        "Returns a coroutine object; the body doesn't run until it's awaited or scheduled",
        "Raises a TypeError immediately",
        "Queues it on the event loop to run as soon as possible",
      ],
      answerIndex: 1,
      explain:
        "Calling a coroutine function just creates a coroutine object — like calling a generator function. The body executes only when awaited or wrapped in a task; otherwise Python warns 'coroutine was never awaited'.",
    },
    {
      question: "Your Python job is CPU-bound (image processing). Which gives real parallel speed-up?",
      options: [
        "asyncio with gather() across the images",
        "A ThreadPoolExecutor with many threads",
        "A ProcessPoolExecutor using multiple processes",
        "Rewriting the loop as an async generator",
      ],
      answerIndex: 2,
      explain:
        "async and threads don't help CPU-bound work: async only overlaps *waiting*, and the GIL stops threads in one process running Python bytecode in parallel. Multiple processes each get their own interpreter and GIL, so ProcessPoolExecutor achieves true parallelism.",
    },
  ],
};

export default lesson;
