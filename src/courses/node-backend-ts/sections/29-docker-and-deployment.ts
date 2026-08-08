import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "docker-and-deployment",
  title: "Docker and Deployment",
  part: "Scaling & Shipping",
  estMinutes: 12,
  summary:
    "Ship the long-running process: a multi-stage Dockerfile, exec-form CMD so SIGTERM actually reaches node, a health endpoint for the orchestrator, and env vars injected at runtime.",

  concept: `
Deploying PHP meant configuring a web server to *host* your code: Apache with
mod_php, or nginx handing requests to an FPM pool. Node inverts that mental
model completely: **your process IS the server**. There is no Apache, no FPM
pool, nothing to mount your code into — the container runs
\`node dist/server.js\`, that process listens on port 3000, and a reverse
proxy or load balancer in front terminates TLS and forwards traffic. Deploying
means shipping and supervising one long-running process.

### The multi-stage Dockerfile

Production images should contain compiled JS and production dependencies —
not TypeScript sources, not \`tsc\`, not devDependencies. Multi-stage builds
get you there:

\`\`\`dockerfile
# Dockerfile
FROM node:22-slim AS deps          # 1: all deps (incl. dev) for building
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build                 # 2: compile TS → dist/
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-slim AS runtime       # 3: lean runtime image
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev              # prod deps only
COPY --from=build /app/dist ./dist
USER node                          # never run as root
EXPOSE 3000
CMD ["node", "dist/server.js"]     # exec form — see below
\`\`\`

\`node:22-slim\` (or \`node:24-slim\`) is the sensible base — Debian-slim,
a fraction of the full image. \`NODE_ENV=production\` matters: Express skips
dev-only work, and \`npm ci --omit=dev\` leaves test runners and type
packages out of the image. \`USER node\` uses the non-root user every official
Node image ships.

### The PID-1 signal gotcha

This one bites everybody once. If your CMD is \`npm start\`, then **npm is
PID 1**, and npm does not forward SIGTERM to the node process it spawned. So
when the orchestrator stops the container, your graceful shutdown handler —
the SIGTERM listener that stops accepting connections, drains in-flight
requests, and closes the pg Pool — never runs. Docker waits out the grace
period (10s default) and SIGKILLs everything mid-request. The fix is the
exec-form CMD calling node directly: \`CMD ["node", "dist/server.js"]\` —
node is PID 1 and receives the signal itself.

### Health checks and runtime config

Orchestrators need to ask "is this container alive?" — wire a trivial
endpoint:

\`\`\`ts
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});
\`\`\`

Compose \`healthcheck\` and Kubernetes probes hit it on an interval; a hung
event loop stops answering and the orchestrator replaces the container.

Config follows 12-factor: **env vars injected at runtime**, never baked into
the image. The same image runs in staging and production — only
\`docker run -e DATABASE_URL=...\` (or the compose \`environment\` block)
differs. No \`.env\` file in the image; \`process.env\` reads what the
platform provides.

The deploy loop, end to end: build the image in CI, push to a registry, the
platform starts new containers, health checks pass, traffic shifts, old
containers get SIGTERM — and because node is PID 1, they finish their
in-flight requests and exit cleanly.
`,

  comparisons: [
    {
      label: "Compose: the PHP two-container dance vs one Node service",
      intro:
        "The minimum viable web stack in each world. PHP needs a web server container in front of FPM; the Node process needs nothing in front of it but the platform's load balancer.",
      php: `# docker-compose.yml — classic PHP: TWO containers just to serve code
services:
  nginx:
    image: nginx:1.27
    ports: ["80:80"]
    volumes:
      - ./public:/var/www/public
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on: [php]

  php:
    build: .                # php:8.3-fpm + extensions
    volumes:
      - ./:/var/www
    # concurrency lives in FPM pool config:
    # pm.max_children, pm.start_servers, ...

  db:
    image: postgres:17`,
      ts: `# docker-compose.yml — Node: the app IS the web server
services:
  api:
    build: .
    ports: ["3000:3000"]
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://app:secret@db:5432/app
    healthcheck:
      test: ["CMD", "node", "-e",
        "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1))"]
      interval: 30s
      timeout: 3s
      retries: 3

  db:
    image: postgres:17`,
      note: "No nginx sidecar: the Node process speaks HTTP itself, and TLS termination moves to the platform's proxy/load balancer. The healthcheck uses Node's built-in fetch — no curl needed in a slim image.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "php:apache Dockerfile vs multi-stage Node build",
      intro:
        "Containerizing each app. PHP drops interpreted source into a preconfigured server; Node compiles, prunes, and ships a process.",
      php: `# Dockerfile — PHP: mount code into a ready-made web server
FROM php:8.3-apache
RUN docker-php-ext-install pdo_pgsql
COPY . /var/www/html/
# Done. Apache is PID 1, mod_php interprets the source
# per request. No build step, no dependency pruning —
# but also: vendor/, tests/, .git all ship unless ignored,
# and Apache config is your problem.`,
      ts: `# Dockerfile — Node: build once, ship a lean process
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci                     # dev deps too — tsc needs them

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc                    # TS → dist/

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev          # prod deps ONLY
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"] # node = PID 1, gets SIGTERM`,
      note: "Three stages so the final image has no TypeScript, no compiler, no devDependencies — and the exec-form CMD makes node PID 1, which is what lets graceful shutdown actually run on docker stop.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Read the Dockerfile stage by stage and predict the transcript: what does each stage contribute, what does /health return, and what happens inside the container on docker stop? Run to check.",
    code: `# Dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]`,
    output: `$ docker build -t api:1.0 .
[+] Building 24.6s (15/15) FINISHED
 => [deps 1/3] FROM docker.io/library/node:22-slim
 => [deps 3/3] RUN npm ci                      # full install: tsc available
 => [build 3/3] RUN npx tsc                    # src/*.ts -> dist/*.js
 => [runtime 4/5] RUN npm ci --omit=dev        # prod deps only, no tsc
 => [runtime 5/5] COPY --from=build /app/dist ./dist
 => naming to docker.io/library/api:1.0

$ docker run -d --name api -p 3000:3000 -e DATABASE_URL=postgres://... api:1.0
f3a91c0d2e...

$ curl -s localhost:3000/health
{"status":"ok","uptime":11.42}

$ docker stop api          # sends SIGTERM to PID 1 — which IS node
api
$ docker logs api | tail -3
{"level":30,"msg":"SIGTERM received, closing server"}
{"level":30,"msg":"in-flight requests drained, pool closed"}
{"level":30,"msg":"bye"}   # exit 0 — no SIGKILL needed`,
  },

  keyPoints: [
    "Mental-model flip: no Apache/FPM hosting your code — the container runs `node dist/server.js`, that process is the web server, and the platform's proxy/load balancer terminates TLS in front.",
    "Multi-stage build: install all deps → `npx tsc` to dist/ → fresh `node:22-slim` runtime with `npm ci --omit=dev` plus the copied dist/ — no TypeScript, compiler, or devDependencies in production.",
    "`CMD [\"node\", \"dist/server.js\"]` (exec form) makes node PID 1 so it receives SIGTERM; `npm start` as PID 1 swallows the signal and your graceful shutdown never runs — Docker SIGKILLs after the grace period.",
    "Set `ENV NODE_ENV=production` (Express optimizations, library dev-code off) and `USER node` (never run as root) in the runtime stage.",
    "Expose a `/health` endpoint and point compose healthchecks / Kubernetes probes at it — a blocked event loop stops answering and gets the container replaced.",
    "12-factor config: env vars injected at run time (`docker run -e`, compose `environment`), never baked into the image — one image serves every environment.",
  ],

  interview: [
    {
      q: "Walk me through your production Dockerfile for a TypeScript API.",
      a: "Three stages on node:22-slim. A deps stage runs npm ci with the lockfile — full install, because building needs devDependencies. A build stage copies tsconfig and src and runs tsc to emit dist/. Then a fresh runtime stage sets NODE_ENV=production, runs npm ci --omit=dev so only production dependencies ship, copies dist/ from the build stage, drops to the non-root node user, and ends with the exec-form CMD [\"node\", \"dist/server.js\"]. The result is a lean image with no compiler or sources, and — critically — node as PID 1. Config is injected as env vars at runtime, never copied in, so the identical image runs in staging and production.",
    },
    {
      q: "Why is CMD npm start a production bug, not just a style choice?",
      a: "Because of PID 1 signal semantics. With CMD npm start, npm is PID 1 and node is its child — and npm does not forward SIGTERM. When the orchestrator stops the container during a deploy or scale-down, the SIGTERM handler I wrote — stop accepting connections, drain in-flight requests, close the pg Pool — simply never fires. Docker waits the grace period, ten seconds by default, then SIGKILLs the whole process tree, killing requests mid-flight and abandoning pool connections. Exec-form CMD [\"node\", \"dist/server.js\"] makes node PID 1 so it receives the signal directly and shuts down cleanly. It's the deployment half of graceful shutdown: the handler is useless if the signal never arrives.",
    },
    {
      q: "How does deploying a Node service differ from the PHP deploys you did for years?",
      a: "PHP deploys were about updating files under a permanent web server: rsync or git-pull a release directory, maybe reload FPM, and the next request picks up the new code because every request boots fresh. Node has no host server and no per-request boot — the process is the server and it holds state: warm connection pools, in-flight requests, open sockets. So a deploy is a process replacement: CI builds an immutable image, the platform starts new containers, health checks on /health gate them into the load balancer, traffic shifts, and old containers receive SIGTERM and drain before exiting. Zero-downtime comes from that overlap plus graceful shutdown, not from PHP's 'every request is a fresh start' property.",
    },
  ],

  quiz: [
    {
      question:
        "Your container's CMD is `npm start`. What happens when the orchestrator sends SIGTERM to stop it?",
      options: [
        "npm forwards the signal to node, which shuts down gracefully",
        "npm (PID 1) doesn't forward SIGTERM; the graceful-shutdown handler never runs, and Docker SIGKILLs the container after the grace period",
        "The container ignores all signals until every request finishes",
        "Docker restarts the container automatically because npm exits non-zero",
      ],
      answerIndex: 1,
      explain:
        "PID 1 receives the signal, and npm doesn't pass SIGTERM on to the node child. The SIGTERM listener that would drain requests and close the pool never fires, so after the grace period (10s default) everything is SIGKILLed mid-flight. Exec-form CMD [\"node\", \"dist/server.js\"] makes node PID 1 and fixes it.",
    },
    {
      question: "What is the point of the third (runtime) stage in the multi-stage build?",
      options: [
        "It runs the test suite before the image is finalized",
        "It compiles TypeScript faster by caching tsc output",
        "It produces a lean final image: prod-only node_modules (npm ci --omit=dev) plus the compiled dist/ — no sources, compiler, or devDependencies",
        "It is required because Node cannot run in the same stage that installed packages",
      ],
      answerIndex: 2,
      explain:
        "Earlier stages need devDependencies (tsc lives there), but shipping them bloats the image and widens the attack surface. The runtime stage starts from a clean node:22-slim, installs only production deps, and copies in just dist/ — the build tooling stays behind in discarded stages.",
    },
    {
      question: "Why inject DATABASE_URL at `docker run` time instead of baking it into the image?",
      options: [
        "ENV instructions cannot hold values containing colons",
        "12-factor config: one immutable image runs in every environment, secrets stay out of image layers and registries, and rotation doesn't require a rebuild",
        "Runtime env vars are faster for Node to read than build-time ones",
        "Docker refuses to build images containing connection strings",
      ],
      answerIndex: 1,
      explain:
        "Baked-in config welds the image to one environment and leaves credentials readable in image history by anyone who can pull it. Injecting at runtime means the exact artifact you tested in staging is what runs in production, with only the environment differing.",
    },
    {
      question: "In this architecture, what terminates TLS for your API?",
      options: [
        "The Express app, via built-in HTTPS support that activates when NODE_ENV=production",
        "Apache inside the container, as with mod_php",
        "A reverse proxy or load balancer in front of the containers; the Node process serves plain HTTP on its port",
        "Docker itself, at the port-mapping layer",
      ],
      answerIndex: 2,
      explain:
        "Node can serve TLS, but in practice certificates, rotation, and HTTP/2 live at the edge — the platform's load balancer or a proxy like nginx/Traefik/Caddy — which forwards plain HTTP to the containers. The container is the app server, not the whole front door.",
    },
  ],
};

export default lesson;
