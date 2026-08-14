import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "deployment",
  title: "Deployment: Uvicorn Workers & Docker",
  part: "Production & Shipping",
  estMinutes: 11,
  summary:
    "Production FastAPI is uvicorn worker processes (your PHP-FPM pool, relearned) behind a TLS-terminating reverse proxy, usually packaged in a Docker image with one worker per container and replicas handled by the orchestrator.",

  concept: `
\`uvicorn main:app --reload\` is a development tool: one process, auto-restart
on file changes, bound to localhost. Production looks different:

\`\`\`bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
\`\`\`

### Workers are processes — this is your PHP-FPM pool

Because of Python's GIL, one process runs Python bytecode on one core at a
time. \`--workers 4\` forks four **processes**, each with its own event loop
and its own copy of the app (so each runs its own lifespan — pools and
clients are per-worker). You already run this architecture: it's a PHP-FPM
pool. \`--workers\` is \`pm.max_children\`, with one deep difference — a
PHP-FPM child handles **one request at a time**, while each uvicorn worker
handles **thousands concurrently** on its event loop. That's why the rule of
thumb is workers ≈ CPU cores (not the dozens of children you'd give FPM):
concurrency comes from async within each worker; workers exist to use the
other cores. The \`fastapi run\` command (from the \`fastapi[standard]\`
install) is the packaged equivalent — it runs uvicorn under the hood and
takes \`--workers\` too.

### A reverse proxy in front

Just as you never exposed PHP-FPM directly, uvicorn sits behind **nginx**,
**Traefik**, or a cloud load balancer that terminates TLS and forwards plain
HTTP. Two flags matter behind a proxy:

- \`--forwarded-allow-ips\` — uvicorn already parses \`X-Forwarded-For\` /
  \`X-Forwarded-Proto\` (\`--proxy-headers\` is on by default), but it only
  trusts them from \`127.0.0.1\`. Widen this to the proxy's address — a
  separate container or host — so the app sees the real client IP and knows
  the original request was HTTPS.
- \`--root-path /api/v1\` — if the proxy strips a path prefix, this tells
  FastAPI, so \`/docs\` and \`openapi.json\` generate correct URLs.

### The Dockerfile

The structure from the FastAPI docs, with the two production touches
interviewers look for — dependency-layer caching and a non-root user:

\`\`\`dockerfile
FROM python:3.12-slim

WORKDIR /code

# Requirements FIRST: this layer is cached until requirements.txt
# changes, so code edits don't re-install dependencies.
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

COPY ./app /code/app

RUN useradd --create-home appuser
USER appuser

# 0.0.0.0, or nothing outside the container can reach it
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]
\`\`\`

Note the CMD runs **one worker**. That's deliberate: under Kubernetes,
Docker Swarm, or most PaaS platforms, the orchestrator runs multiple
**replicas** of the container and load-balances across them — replication
is its job, and one process per container keeps CPU/memory accounting,
scaling, and log streams clean. A single big VM with nothing else managing
processes is the case for \`--workers 4\` inside the container.

### Operational hygiene

Give the platform a cheap, dependency-free **health check** —
\`@app.get("/healthz")\` returning \`{"status": "ok"}\` — for load-balancer
probes and container HEALTHCHECKs. And **graceful shutdown** comes free if
you've used lifespan: on SIGTERM uvicorn stops accepting connections,
in-flight requests finish, then your post-\`yield\` cleanup closes pools and
clients before the process exits.
`,

  comparisons: [
    {
      label: "Dev server to production command",
      intro:
        "The development one-liner and what actually runs in production, in both stacks.",
      php: `# development: PHP's built-in server
php -S localhost:8000 -t public

# production: nginx + a PHP-FPM pool
# /etc/php/8.3/fpm/pool.d/www.conf
#   pm = dynamic
#   pm.max_children = 20      ; hard cap on workers
#   pm.start_servers = 4
# each child handles ONE request at a time
sudo systemctl start php8.3-fpm nginx`,
      ts: `# development: auto-reload, localhost only
uvicorn main:app --reload

# production: bind all interfaces, one worker per core
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# behind nginx/Traefik on another host: forwarded headers are
# parsed by default, but only trusted from 127.0.0.1
uvicorn main:app --host 0.0.0.0 --workers 4 --forwarded-allow-ips=10.0.0.5

# packaged equivalent (fastapi[standard], runs uvicorn)
fastapi run main.py --workers 4`,
      note:
        "--workers is pm.max_children with different math: an FPM child serves one request at a time, so you run dozens; a uvicorn worker serves thousands concurrently via its event loop, so you run about one per core.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "The production Dockerfile",
      intro:
        "Containerising each stack. The layer-caching trick — dependencies before code — is identical; only the package manager changes.",
      php: `# Dockerfile (Laravel)
FROM php:8.3-fpm-alpine

WORKDIR /var/www

RUN docker-php-ext-install pdo_mysql opcache

# composer files first -> cached dependency layer
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts

COPY . .

# php-fpm images ship with www-data
USER www-data

EXPOSE 9000
CMD ["php-fpm"]`,
      ts: `# Dockerfile (FastAPI, from the official docs pattern)
FROM python:3.12-slim

WORKDIR /code

# requirements first -> cached dependency layer
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

COPY ./app /code/app

RUN useradd --create-home appuser
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]
# behind a TLS proxy in another container, add:
#   "--forwarded-allow-ips", "10.0.0.5"`,
      note:
        "Same caching logic: the pip/composer layer rebuilds only when the lock/requirements file changes. One visible difference: php-fpm still needs nginx in front to speak HTTP; uvicorn IS an HTTP server.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Scaling: multi-worker container vs replicas",
      intro:
        "Two ways to use four cores. On a plain VM you scale inside the container; on an orchestrator you scale by running more containers.",
      php: `# One big VM, classic PHP ops:
# nginx + one FPM pool sized to the machine
# /etc/php/8.3/fpm/pool.d/www.conf
#   pm.max_children = 40

# scaling = editing pool config and reloading
sudo systemctl reload php8.3-fpm`,
      ts: `# docker-compose.yml — orchestration-native scaling
services:
  api:
    build: .
    deploy:
      replicas: 4          # 4 containers x 1 worker each
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/healthz"]
      interval: 10s

# vs the single-VM alternative: 1 container, CMD --workers 4`,
      note:
        "One worker per container keeps each replica's CPU/memory accounting honest and lets the orchestrator do rolling deploys and per-replica health checks. Multi-worker containers fit single-VM setups without an orchestrator.",
      leftLang: "bash",
      rightLang: "yaml",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "A deploy transcript: build the image, run it with a port mapping, read the worker startup logs, probe the health endpoint. Predict the log lines — how many 'Started server process' lines will 4 workers print, and which process logs 'Uvicorn running'?",
    code: `# Build the image (Dockerfile CMD: uvicorn ... --port 80 --workers 4)
docker build -t shop-api .

# Run detached, mapping host 8000 -> container 80
docker run -d --name shop-api -p 8000:80 shop-api

# What did the workers do at startup?
docker logs shop-api

# Probe the health endpoint through the mapped port
curl -s http://localhost:8000/healthz`,
    output: `$ docker build -t shop-api .
[+] Building 2.1s (10/10) FINISHED
 => [1/5] FROM docker.io/library/python:3.12-slim          CACHED
 => [2/5] WORKDIR /code                                    CACHED
 => [3/5] COPY ./requirements.txt /code/requirements.txt   CACHED
 => [4/5] RUN pip install --no-cache-dir --upgrade -r ...  CACHED
 => [5/5] COPY ./app /code/app                             0.1s
 => naming to docker.io/library/shop-api:latest

$ docker run -d --name shop-api -p 8000:80 shop-api
9f1c2e7ab41d

$ docker logs shop-api
INFO:     Uvicorn running on http://0.0.0.0:80 (Press CTRL+C to quit)
INFO:     Started parent process [1]
INFO:     Started server process [8]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Started server process [9]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Started server process [10]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Started server process [11]
INFO:     Waiting for application startup.
INFO:     Application startup complete.

$ curl -s http://localhost:8000/healthz
{"status":"ok"}`,
  },

  keyPoints: [
    "`uvicorn main:app --host 0.0.0.0 --workers 4` — workers are **processes** (the GIL means one process uses one core for Python code), each with its own event loop and its own lifespan run.",
    "The mental model is a PHP-FPM pool: `--workers` ≈ `pm.max_children`, except each uvicorn worker handles thousands of concurrent requests, so you size workers to CPU cores, not to expected concurrency.",
    "`fastapi run main.py --workers 4` (from `fastapi[standard]`) is the packaged equivalent — it runs uvicorn under the hood.",
    "Always put a reverse proxy (nginx/Traefik/cloud LB) in front for TLS; uvicorn parses X-Forwarded-* headers by default but only trusts them from `--forwarded-allow-ips` (default 127.0.0.1), so widen that for a proxy on another host or container, and add `--root-path` if the proxy strips a path prefix.",
    "Dockerfile order matters: `COPY requirements.txt` + `pip install` **before** `COPY ./app` caches the dependency layer; run as a non-root user; CMD must bind 0.0.0.0.",
    "Under an orchestrator, prefer one worker per container and scale with **replicas** (clean accounting, rolling deploys, per-replica health checks); use `--workers N` inside the container only on a plain VM. Ship a dependency-free `/healthz` and let lifespan handle graceful shutdown on SIGTERM.",
  ],

  interview: [
    {
      q: "How does a FastAPI app use all the cores of a 4-core server?",
      a: "With worker processes: `uvicorn main:app --workers 4` (or `fastapi run --workers 4`). Python's GIL means one process executes bytecode on one core at a time, so parallelism across cores comes from forking processes — same reason PHP runs an FPM pool. The difference from FPM is what each worker does: an FPM child is synchronous, one request at a time, so you run dozens; a uvicorn worker runs an event loop serving thousands of concurrent I/O-bound requests, so the rule of thumb is roughly one worker per core. Each worker is a full copy of the app — its own lifespan, its own connection pool — so nothing in-process is shared between them; shared state belongs in Redis or the database. In containers I'd usually flip it around: one worker per container and let the orchestrator run four replicas.",
    },
    {
      q: "Walk me through your production Dockerfile for a FastAPI service.",
      a: "Base image `python:3.12-slim` — small but glibc-based, so wheels install cleanly. Then the layer-caching move: COPY only `requirements.txt`, run `pip install --no-cache-dir -r`, and COPY the application code *after* — dependency installation re-runs only when requirements change, not on every code edit; it's the same trick as copying `composer.json` before the source in a PHP image. Create and switch to a non-root user so a container escape isn't root. CMD is exec-form uvicorn bound to `0.0.0.0` — localhost isn't reachable through the port mapping — plus `--forwarded-allow-ips` set to the proxy's address when it sits behind a TLS-terminating proxy, since uvicorn parses the X-Forwarded-* headers by default but only trusts them from 127.0.0.1. One worker per container by default, replicas for scale, a `/healthz` endpoint for the orchestrator's probes, and graceful shutdown handled by lifespan cleanup on SIGTERM.",
    },
    {
      q: "Why does your API generate wrong docs URLs and see the proxy's IP as every client behind nginx, and how do you fix it?",
      a: "Both are trust problems of running behind a reverse proxy. The client IP issue: uvicorn sees the TCP peer, which is nginx — the real client is in `X-Forwarded-For`. Uvicorn already parses that header — `--proxy-headers` is on by default — but it only trusts it from clients matching `--forwarded-allow-ips`, which defaults to 127.0.0.1, so with nginx in another container or on another host I have to widen that to the proxy's address; the same setting is what makes `https` detection via `X-Forwarded-Proto` work. The URL issue happens when the proxy strips a prefix like `/api/v1` before forwarding: the app doesn't know its public path, so `/docs` and `openapi.json` links break — `--root-path /api/v1` tells FastAPI what prefix to prepend in the schema and docs. PHP devs have met this exact pair before as `fastcgi_param` forwarding and trusted-proxy configuration in Laravel.",
    },
  ],

  quiz: [
    {
      question: "Why does uvicorn use worker *processes* rather than threads for CPU parallelism?",
      options: [
        "Processes start faster than threads in Linux",
        "The GIL lets only one thread run Python bytecode at a time per process, so multiple cores require multiple processes",
        "Threads can't run async event loops",
        "It's a Docker requirement — containers allow one thread per image",
      ],
      answerIndex: 1,
      explain:
        "The Global Interpreter Lock serialises Python bytecode execution within a process. Async gives concurrency (many waiting requests per worker); processes give parallelism (multiple cores) — exactly the role of the PHP-FPM pool.",
    },
    {
      question:
        "Your Docker image reinstalls all pip dependencies on every code change. What's the fix?",
      options: [
        "Add --no-cache-dir to pip install",
        "Use a multi-stage build",
        "COPY requirements.txt and run pip install before COPYing the application code, so the dependency layer stays cached",
        "Pin exact versions in requirements.txt",
      ],
      answerIndex: 2,
      explain:
        "Docker reuses a cached layer until an earlier layer's inputs change. With requirements.txt copied first, editing app code invalidates only the later COPY layer — the pip install layer is rebuilt only when requirements.txt itself changes.",
    },
    {
      question:
        "Deploying to Kubernetes, why prefer one uvicorn worker per container over --workers 4 in one container?",
      options: [
        "Multiple workers can't share a container's network namespace",
        "The orchestrator already replicates and load-balances containers — one process per container keeps resource accounting, scaling, and health checks per-replica",
        "The GIL is shared across workers inside one container",
        "uvicorn's --workers flag is ignored inside containers",
      ],
      answerIndex: 1,
      explain:
        "Replication is the orchestrator's job: replicas give clean CPU/memory limits, rolling deploys, and per-instance probes. A multi-worker container hides four processes behind one replica. On a plain VM with no orchestrator, --workers inside the container is the right call.",
    },
    {
      question: "The app works via docker exec but curl from the host gets connection refused, despite -p 8000:80. Likely cause?",
      options: [
        "uvicorn is bound to 127.0.0.1 inside the container instead of 0.0.0.0",
        "The container needs --proxy-headers",
        "Port 80 requires root, so the process crashed",
        "curl can't follow Docker port mappings",
      ],
      answerIndex: 0,
      explain:
        "The port mapping forwards traffic to the container's network interface — a server listening only on the container's localhost never sees it. Production CMDs bind 0.0.0.0. (Non-root binding to port 80 works in containers via Docker's defaults in modern setups, and the exec test proves the process is alive.)",
    },
  ],
};

export default lesson;
