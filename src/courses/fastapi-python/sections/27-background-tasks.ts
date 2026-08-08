import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "background-tasks",
  title: "Background Tasks & Lifespan",
  part: "Production & Shipping",
  estMinutes: 10,
  summary:
    "BackgroundTasks lets a handler respond immediately and run work after the response is sent — in the same process — while the lifespan context manager owns startup/shutdown resources like DB pools; knowing when to graduate to Celery is the interview question.",

  concept: `
A signup endpoint shouldn't make the user wait while you talk to an email
provider. The response takes 20ms; the welcome email takes 800ms. FastAPI's
answer is built in:

\`\`\`python
from fastapi import BackgroundTasks, FastAPI

app = FastAPI()

def send_welcome_email(to: str, body: str):
    ...  # talk to the mail provider

@app.post("/signup", status_code=201)
async def signup(user: UserCreate, background_tasks: BackgroundTasks):
    account = create_account(user)
    background_tasks.add_task(send_welcome_email, user.email, "Welcome!")
    return account   # sent NOW — the email goes out after
\`\`\`

Declare a \`background_tasks: BackgroundTasks\` parameter (no \`Depends\`
needed — FastAPI recognises the type), call \`.add_task(func, *args)\` with a
regular or async function, and every queued task runs **after the response
has been sent**, in order. Dependencies can add tasks too — a reusable
\`get_query\` dependency can queue an audit-log write, and FastAPI merges all
tasks from the whole dependency tree onto the one response.

### Be honest about what this is

The tasks run **in the same process** as your web server, on the same event
loop. That has hard consequences:

- If the process dies mid-task, the task is **gone** — no retry, no queue, no
  record it ever existed.
- A CPU-heavy task competes with live requests for the worker.
- Tasks can't be scheduled for later or rate-limited.

So: emails, log writes, cache warms, webhooks-on-best-effort — perfect.
Retries, delayed jobs, fan-out, heavy CPU work (image processing, report
generation) — reach for a real queue: **Celery** (the incumbent, with Redis
or RabbitMQ as broker), or the lighter async-native **ARQ** / **RQ**. This is
exactly Laravel's line between "do it in the request" and
\`dispatch(new SendWelcomeEmail($user))\` onto a queue with Horizon watching
workers, retries, and backoff. \`add_task\` is closer to PHP-FPM's
\`fastcgi_finish_request()\`: flush the response, keep computing.

### Lifespan: resources that outlive requests

Some things should be created once per process, not per request: a database
engine and its connection pool, a shared \`httpx.AsyncClient\`, an ML model.
The modern home for that is the **lifespan** context manager:

\`\`\`python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient()     # before the first request
    yield
    await app.state.http.aclose()            # after the last request

app = FastAPI(lifespan=lifespan)
\`\`\`

Everything before \`yield\` runs at startup, everything after runs at
shutdown — one function, so the acquire and the release sit next to each
other, exactly like a dependency with \`yield\` but at application scope. The
older \`@app.on_event("startup")\` / \`("shutdown")\` decorators are
**deprecated**; you'll still see them in codebases, and "migrate on_event to
lifespan" is a routine modernisation task. In PHP terms: this is your service
provider's \`boot()\` plus a shutdown hook — a lifecycle PHP-FPM never gave
you, because your process died after every request.
`,

  comparisons: [
    {
      label: "Respond now, email later",
      intro:
        "A signup endpoint that must not block on the mail provider. Laravel pushes a job to a queue; FastAPI queues a function on the response.",
      php: `<?php
// app/Http/Controllers/SignupController.php (Laravel)
public function store(SignupRequest $request)
{
    $user = User::create($request->validated());

    // Serialised, pushed to Redis, picked up by a
    // queue worker process — survives a crash, retries.
    SendWelcomeEmail::dispatch($user);

    return response()->json($user, 201);
}`,
      ts: `# app/routers/signup.py
from fastapi import BackgroundTasks

@router.post("/signup", status_code=201)
async def signup(
    payload: UserCreate,
    background_tasks: BackgroundTasks,
    db: SessionDep,
):
    user = create_user(db, payload)

    # Runs in THIS process, right after the response
    # is sent. No broker, no retry, no persistence.
    background_tasks.add_task(send_welcome_email, user.email)

    return user`,
      note:
        "Same developer experience, very different guarantees: dispatch() hands the job to out-of-process workers with retries; add_task is fire-and-forget inside the web process. For Laravel-queue semantics in Python, that's Celery/ARQ.",
    },
    {
      label: "The closest vanilla-PHP relative: fastcgi_finish_request",
      intro:
        "PHP-FPM can flush the response and keep executing — the same 'respond now, work after' trick, which is precisely what BackgroundTasks formalises.",
      php: `<?php
// PHP-FPM only
echo json_encode(['message' => 'account created']);

// Response is flushed to nginx; the client is done waiting.
fastcgi_finish_request();

// Still executing, invisibly to the client:
send_welcome_email($email);
write_audit_log("signup $email");`,
      ts: `# FastAPI — the same idea, structured
@app.post("/signup", status_code=201)
async def signup(
    payload: UserCreate, background_tasks: BackgroundTasks
):
    background_tasks.add_task(send_welcome_email, payload.email)
    background_tasks.add_task(write_audit_log, f"signup {payload.email}")
    return {"message": "account created"}
    # return happens first; tasks run after, in add order`,
      note:
        "fastcgi_finish_request is the proof you already know this pattern — FastAPI just makes it declarative, testable, and available from dependencies as well as handlers.",
    },
    {
      label: "Startup/shutdown: service provider boot vs lifespan",
      intro:
        "Create a shared resource once per process and tear it down cleanly. PHP-FPM never needed this; a long-running Python process does.",
      php: `<?php
// app/Providers/AppServiceProvider.php (Laravel)
public function register(): void
{
    // Bound once per REQUEST — PHP-FPM tears the
    // whole process down after each response, so
    // 'shutdown cleanup' barely exists as a concept.
    $this->app->singleton(
        HttpClient::class,
        fn () => new HttpClient(['timeout' => 5])
    );
}`,
      ts: `# main.py
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=5)
    yield                       # the app serves requests here
    await app.state.http.aclose()

app = FastAPI(lifespan=lifespan)
# legacy you'll still meet: @app.on_event("startup") — deprecated`,
      note:
        "The Python process serves thousands of requests, so setup AND teardown are real. Lifespan puts both in one function around a yield — same shape as a yield dependency, scoped to the app instead of a request.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "An event-loop simulation of both lifecycles: lifespan brackets the whole run, and each request's tasks are drained only after its response is 'sent'. Predict the exact order — does any [task] line ever print before its response line?",
    code: `import asyncio
from contextlib import asynccontextmanager

# --- lifespan: runs before the first request and after the last ---
@asynccontextmanager
async def lifespan():
    print("startup: opening connection pool")
    yield
    print("shutdown: closing connection pool")

# --- BackgroundTasks in miniature: a per-request task list ---
task_queue = []

def add_task(func, *args):
    task_queue.append((func, args))

def send_email(to, subject):
    print(f"  [task] email to {to}: {subject}")

def write_log(line):
    print(f"  [task] audit log: {line}")

async def create_account(email):
    # ... insert the user, hash the password ...
    add_task(send_email, email, "Welcome!")
    add_task(write_log, f"signup {email}")
    return {"message": "account created"}

async def serve(email):
    response = await create_account(email)
    print(f"response sent: {response['message']} ({email})")
    # The response is on the wire — ONLY NOW do the tasks run,
    # in the order they were added.
    while task_queue:
        func, args = task_queue.pop(0)
        func(*args)

async def main():
    async with lifespan():
        await serve("jason@example.com")
        await serve("ada@example.com")

asyncio.run(main())`,
    output: `startup: opening connection pool
response sent: account created (jason@example.com)
  [task] email to jason@example.com: Welcome!
  [task] audit log: signup jason@example.com
response sent: account created (ada@example.com)
  [task] email to ada@example.com: Welcome!
  [task] audit log: signup ada@example.com
shutdown: closing connection pool`,
  },

  keyPoints: [
    "Declare `background_tasks: BackgroundTasks` in the signature (no `Depends` needed) and call `background_tasks.add_task(func, *args)` — tasks run **after** the response is sent, in the order added.",
    "Dependencies can add tasks too: FastAPI merges tasks from the whole dependency tree onto the one response.",
    "Tasks run in the same process as the server: no persistence, no retries, and CPU-heavy work steals time from live requests.",
    "Graduate to Celery (or async-native ARQ/RQ) for retries, scheduling, fan-out, or heavy CPU — the exact line Laravel draws with queued jobs + Horizon; `add_task` is closer to `fastcgi_finish_request()`.",
    "Startup/shutdown resources (DB engines, shared `httpx.AsyncClient`s, ML models) belong in a `lifespan` `@asynccontextmanager` passed to `FastAPI(lifespan=...)` — setup before `yield`, teardown after.",
    "`@app.on_event(\"startup\")`/`(\"shutdown\")` is deprecated legacy — recognise it in old codebases and migrate it to lifespan.",
  ],

  interview: [
    {
      q: "When would you reach for Celery instead of FastAPI's BackgroundTasks?",
      a: "BackgroundTasks runs functions in the web process after the response is sent — great latency win for cheap, loseable work: emails, audit logs, cache warming. But it has no broker, so if the process restarts mid-task the work vanishes; there are no retries, no scheduling, no rate limiting, and CPU-heavy tasks compete with live requests. The moment I need any of those guarantees — payment webhooks that must not be lost, image processing, nightly reports, exponential-backoff retries — I move to a real queue: Celery with Redis or RabbitMQ, or ARQ if I want something async-native and lighter. Coming from Laravel, it's exactly the line between doing work inline versus `dispatch()`ing a job to queue workers under Horizon; BackgroundTasks is closer to `fastcgi_finish_request()` than to a queue.",
    },
    {
      q: "How do you manage resources like a database pool across a FastAPI app's lifetime?",
      a: "With the lifespan context manager: an `@asynccontextmanager` function passed as `FastAPI(lifespan=lifespan)`. Code before the `yield` runs once at startup — create the SQLAlchemy engine, open a shared `httpx.AsyncClient`, load models — and code after the `yield` runs at shutdown to close them gracefully. It's the application-scoped twin of a `yield` dependency, and it also matters for graceful deploys: when the orchestrator sends SIGTERM, the server stops accepting connections and the post-yield cleanup runs. The older `@app.on_event(\"startup\")` decorators are deprecated; I'd recognise them in a legacy codebase and consolidate them into one lifespan function, which also keeps paired setup/teardown adjacent instead of split across two handlers.",
    },
    {
      q: "Does returning a response from a FastAPI handler mean all the work is done?",
      a: "Not necessarily, and that's by design. Any tasks registered on `BackgroundTasks` — by the handler or by any dependency in its tree — run after the response has gone out, in registration order, in the same process. That's the whole point: the client's latency is decoupled from the slow side-effects. The flip side is that a 201 response is not proof the email sent; if the business needs that proof, the work belongs in a durable queue with acknowledgement and retries, not in the request lifecycle at all.",
    },
  ],

  quiz: [
    {
      question:
        "A handler calls background_tasks.add_task(send_email, addr) and then returns a 201. When does send_email run?",
      options: [
        "Immediately, concurrently with building the response",
        "After the response has been sent to the client, in the same process",
        "In a separate worker process managed by uvicorn",
        "On the next request to the same endpoint",
      ],
      answerIndex: 1,
      explain:
        "That's the contract: response first, then queued tasks in order — but in the web process itself. No broker or worker pool is involved; if the process dies, the task is lost.",
    },
    {
      question: "Which workload is a legitimate BackgroundTasks use, not a Celery job?",
      options: [
        "Retrying a failed payment webhook with exponential backoff",
        "Generating a 500-page PDF report",
        "Writing an audit-log line after a successful login",
        "Sending 100,000 marketing emails overnight",
      ],
      answerIndex: 2,
      explain:
        "A quick, loseable, I/O-light side-effect is the sweet spot. Retries need a broker's persistence, heavy CPU work starves the event loop's process, and scheduled bulk work needs real workers — all Celery/ARQ territory.",
    },
    {
      question: "In a lifespan function, what does the code after `yield` correspond to?",
      options: [
        "Code that runs once per request, after the response",
        "Shutdown cleanup — it runs when the application stops taking requests",
        "A fallback if startup raises an exception",
        "Nothing — code after yield in a context manager is unreachable",
      ],
      answerIndex: 1,
      explain:
        "Lifespan brackets the app's whole life: pre-yield at startup, post-yield at shutdown (e.g. closing pools and clients on SIGTERM). It replaces the deprecated on_event('startup')/('shutdown') pair with one function.",
    },
  ],
};

export default lesson;
