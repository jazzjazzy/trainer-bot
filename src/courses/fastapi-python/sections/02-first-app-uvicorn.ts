import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "first-app-uvicorn",
  title: "First App & Uvicorn",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "Install FastAPI, write a two-route main.py, run it with uvicorn — and absorb the ASGI mental model: one long-lived process, not a fresh PHP-style boot per request.",

  concept: `
### Install and write main.py

\`\`\`bash
pip install "fastapi[standard]"
\`\`\`

The \`[standard]\` extra pulls in what you need to actually serve requests:
**uvicorn** (the server) and the \`fastapi\` CLI, among others. Then the whole
app is one file:

\`\`\`python
# main.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello from FastAPI"}

@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}
\`\`\`

Return a dict and FastAPI serialises it to JSON with the right
\`Content-Type\` — no \`echo json_encode($data)\`, no response object
boilerplate for the simple case. Run it:

\`\`\`bash
uvicorn main:app --reload    # module "main", variable "app"
# or the friendlier wrapper (same server underneath):
fastapi dev main.py
\`\`\`

\`--reload\` restarts on file changes — development only. Visit
\`http://127.0.0.1:8000\` for the JSON and \`/docs\` for the generated
Swagger UI.

### The mental model shift: ASGI vs PHP-FPM

This is the part that's genuinely new. Under PHP-FPM, every request boots your
application from nothing: PHP starts, the framework bootstraps, your code
runs, and *everything is thrown away*. That share-nothing model is why PHP
globals are harmless — they live for one request.

An ASGI app is the opposite: **uvicorn imports \`main.py\` once**, and that
single long-lived process serves thousands of requests from an async event
loop. Consequences:

- Module-level code (creating \`app\`, loading config, compiling regexes) runs **once at startup**, not per request — free performance you never had in PHP.
- **Global state persists between requests.** A module-level dict is a cache shared by every request the process serves — useful, and dangerous: it's also shared *between users*, and lost on restart.
- One process handles many requests concurrently by switching between them at \`await\` points — the concurrency story PHP delegates to the FPM pool of separate processes.

### Startup and shutdown: lifespan

Because the process is long-lived, you need hooks for "when the app starts"
(open a DB pool, load an ML model) and "when it stops" (close connections).
The modern way is a **lifespan** async context manager — everything before
\`yield\` runs at startup, everything after at shutdown:

\`\`\`python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await open_db_pool()   # startup
    yield
    await app.state.pool.close()            # shutdown

app = FastAPI(lifespan=lifespan)
\`\`\`

You will see \`@app.on_event("startup")\` in older codebases — it's
**deprecated**; use \`lifespan\` in anything new.
`,

  comparisons: [
    {
      label: "Serving the app in development",
      intro:
        "Get a local server running. Both are one command; the difference is what the process does between requests.",
      php: `# PHP's built-in dev server: boots your
# script fresh on EVERY request.
php -S localhost:8000 index.php

# Production: nginx hands requests to a pool
# of PHP-FPM workers; each request still gets
# a full framework bootstrap.
sudo systemctl start php8.3-fpm nginx`,
      ts: `# Uvicorn imports main.py ONCE, then a single
# long-lived async process serves all requests.
uvicorn main:app --reload

# Same thing via the FastAPI CLI (it finds the
# app object and runs uvicorn for you):
fastapi dev main.py

# Production preview (no reloader):
fastapi run main.py`,
      note: "php -S re-executes your code per request; uvicorn executes module-level code once at import and keeps the process alive — that's the ASGI/FPM divide in one command.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Hello JSON",
      intro:
        "The minimal JSON endpoint in both worlds. Watch who sets the header and who encodes the payload.",
      php: `<?php
// index.php -- runs top to bottom,
// then the process state is discarded.
header('Content-Type: application/json');

echo json_encode([
    'message' => 'Hello from PHP',
]);`,
      ts: `# main.py -- imported once; the function
# runs per request inside the live process.
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    # dict -> JSON + Content-Type, automatically
    return {"message": "Hello from FastAPI"}`,
      note: "Returning a dict is enough: FastAPI JSON-encodes it and sets the header. The decorator ties the function to a method + path, like a route definition and controller action fused together.",
    },
    {
      label: "Startup work: per-request bootstrap vs lifespan",
      intro:
        "Open a database connection for the app to use. PHP pays the cost on every request; FastAPI pays it once at process startup.",
      php: `<?php
// bootstrap.php -- included by every request.
// This connect happens again and again;
// persistence needs extra machinery
// (persistent connections, a pool in front).
$pdo = new PDO(
    'mysql:host=db;dbname=shop',
    $user,
    $pass
);`,
      ts: `# main.py -- lifespan runs once per process.
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await open_db_pool()  # startup
    yield                                  # app serves requests
    await app.state.pool.close()           # shutdown

app = FastAPI(lifespan=lifespan)

# Legacy (deprecated): @app.on_event("startup")`,
      note: "Everything before yield is startup, everything after is shutdown — one context manager replaces the deprecated on_event pair, and app.state carries what it built.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "A terminal session: start uvicorn, then curl the two routes from main.py above (plus one bad-type request). Predict every response body before revealing the transcript — remember item_id is declared as int and q defaults to None.",
    code: `# Terminal 1 -- start the server
uvicorn main:app --reload

# Terminal 2 -- exercise the API
curl http://127.0.0.1:8000/
curl http://127.0.0.1:8000/items/5
curl "http://127.0.0.1:8000/items/5?q=lamp"
curl http://127.0.0.1:8000/items/abc`,
    output: `$ uvicorn main:app --reload
INFO:     Will watch for changes in these directories: ['/home/dev/shopapi']
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [21341] using WatchFiles
INFO:     Started server process [21343]
INFO:     Waiting for application startup.
INFO:     Application startup complete.

$ curl http://127.0.0.1:8000/
{"message":"Hello from FastAPI"}

$ curl http://127.0.0.1:8000/items/5
{"item_id":5,"q":null}

$ curl "http://127.0.0.1:8000/items/5?q=lamp"
{"item_id":5,"q":"lamp"}

$ curl http://127.0.0.1:8000/items/abc
{"detail":[{"type":"int_parsing","loc":["path","item_id"],"msg":"Input should be a valid integer, unable to parse string as an integer","input":"abc"}]}`,
  },

  keyPoints: [
    "`pip install \"fastapi[standard]\"` brings FastAPI plus uvicorn and the `fastapi` CLI; run with `uvicorn main:app --reload` or `fastapi dev main.py`.",
    "`main:app` means: import module `main`, use the variable `app` (the `FastAPI()` instance) as the ASGI application.",
    "Path operations returning dicts are auto-serialised to JSON with the correct Content-Type — no manual `json_encode` or headers.",
    "ASGI mental model: uvicorn imports your module once and one long-lived async process serves many requests — unlike PHP-FPM, which boots the app per request and discards everything.",
    "Global/module-level state persists across requests and is shared between users — powerful for caches and pools, a bug factory if you store per-request data there.",
    "Startup/shutdown hooks belong in a `lifespan` async context manager passed to `FastAPI(lifespan=...)`; `@app.on_event(\"startup\")` is deprecated.",
  ],

  interview: [
    {
      q: "How does FastAPI's execution model differ from PHP's, and what follows from that?",
      a: "PHP under FPM is share-nothing: every request boots the framework, runs, and throws all state away, with concurrency coming from a pool of separate worker processes. FastAPI runs on an ASGI server like uvicorn, which imports the app once into a long-lived process; an async event loop serves many requests concurrently by switching at await points. Three consequences: module-level initialisation is paid once instead of per request; global state persists across requests — great for connection pools and caches, but it's shared between users and must never hold per-request data; and blocking the event loop with slow synchronous code stalls every in-flight request, which never mattered in PHP because each request had its own process.",
    },
    {
      q: "What does `uvicorn main:app --reload` actually do?",
      a: "Uvicorn is an ASGI server. The `main:app` string tells it to import the `main` module and use its `app` variable — the `FastAPI()` instance, which is an ASGI application — as the thing to hand requests to. `--reload` starts a watcher process that restarts the server when source files change, so it's development-only. The `fastapi dev main.py` CLI is a convenience wrapper that locates the app object and runs uvicorn with reload for you; `fastapi run` is its production-mode sibling without the reloader.",
    },
    {
      q: "How do you run code at application startup and shutdown in current FastAPI?",
      a: "With a lifespan async context manager: decorate an async function with `@asynccontextmanager`, do startup work before the `yield` — open the database pool, load an ML model, stash them on `app.state` — and cleanup after it, then pass it as `FastAPI(lifespan=lifespan)`. The framework enters the context manager once when the process starts and exits it on shutdown. The older `@app.on_event(\"startup\")`/`(\"shutdown\")` decorators do the same job but are deprecated, so I'd only expect to see them in legacy codebases.",
    },
  ],

  quiz: [
    {
      question: "In `uvicorn main:app`, what does each part of `main:app` refer to?",
      options: [
        "The domain `main` and the port alias `app`",
        "The Python module `main` (main.py) and the `FastAPI()` instance named `app` inside it",
        "The main branch of the repo and the app directory",
        "A config file `main.ini` with an `[app]` section",
      ],
      answerIndex: 1,
      explain:
        "It's an import string: uvicorn imports the module before the colon and uses the attribute after it as the ASGI application. That's why renaming the `app` variable breaks the command.",
    },
    {
      question:
        "A module-level dict in main.py is used to cache expensive results. What's true under uvicorn?",
      options: [
        "It resets at the start of every request, like a PHP global",
        "It persists across requests within the process and is shared by all users that process serves",
        "It's automatically synchronised across all uvicorn worker processes",
        "Python forbids mutating module-level state from request handlers",
      ],
      answerIndex: 1,
      explain:
        "The process is long-lived, so module state survives between requests — that's the big departure from PHP's share-nothing model. It's per-process though: multiple workers each have their own copy, which is why real caches live in Redis.",
    },
    {
      question: "What is the current, non-deprecated way to open a DB pool when the app starts?",
      options: [
        "@app.on_event(\"startup\") — it's the documented standard",
        "Open it at module level inside a try/except",
        "A lifespan async context manager passed to FastAPI(lifespan=...)",
        "A middleware that checks a 'first request' flag",
      ],
      answerIndex: 2,
      explain:
        "Code before the lifespan's `yield` runs at startup, code after it at shutdown — one place for both halves. `on_event` still works but is deprecated, and module-level opening can't await or clean up on shutdown.",
    },
  ],
};

export default lesson;
