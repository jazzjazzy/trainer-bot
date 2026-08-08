import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "healthchecks",
  title: "Healthchecks: Is It Actually Up?",
  part: "Compose & Local Dev",
  estMinutes: 11,
  summary:
    "A running container is not a ready container — healthchecks let Docker probe the service itself, and depends_on with condition: service_healthy makes the api wait for postgres to accept connections.",

  concept: `
\`docker ps\` says a container is "Up" the moment its process starts. But
postgres spends its first seconds initialising, replaying WAL, and only then
listening for connections. Start an api container at the same time and its
first query hits a database that isn't accepting connections yet — crash,
restart, crash. You know this failure from the old world: restart MySQL and
Apache together and the first few requests error out until MySQL finishes
coming up. The fix then was "wait a bit and refresh". The fix now is a
**healthcheck**: a command Docker runs inside the container, on a schedule,
whose exit code (0 = healthy, 1 = unhealthy) tells Docker whether the service
is actually *ready*, not merely started.

### The healthcheck block

\`\`\`yaml
services:
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d shopdb"]
      interval: 5s        # run the probe every 5s
      timeout: 3s         # probe hanging longer than this = failure
      retries: 5          # this many consecutive failures => unhealthy
      start_period: 10s   # grace window: failures here don't count
\`\`\`

\`test\` is the heart of it. \`CMD-SHELL\` runs the string through a shell
(so pipes and \`||\` work); \`CMD\` takes an exec-style array like
\`["CMD", "pg_isready", "-U", "app"]\`. Two canonical probes cover most
services:

- **Databases:** \`pg_isready\` (ships in the postgres image) — exits 0 only
  when the server accepts connections. MySQL images have \`mysqladmin ping\`.
- **HTTP apps:** hit a health endpoint, e.g.
  \`["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]\`.
  Note two things: your app must actually *implement* \`/health\` (a route
  returning 200 when it can serve traffic — cheap DB ping included if that's
  what "ready" means for you), and slim images often lack \`curl\` —
  alpine-based images have busybox \`wget\`, so prefer that or install curl.

The same thing can be baked into an image with the Dockerfile
\`HEALTHCHECK\` instruction; the compose block overrides it per stack.

### The three states

A container with a healthcheck moves through **starting** (during
\`start_period\`) → **healthy** or **unhealthy** (after \`retries\` consecutive
failures). \`docker ps\` shows it in the STATUS column —
\`Up 30 seconds (healthy)\` — and
\`docker inspect --format '{{.State.Health.Status}}' shop-db-1\` gives you
just the state, with recent probe logs in \`.State.Health.Log\`.

### The payoff: ordering on readiness

Plain \`depends_on: [db]\` only orders **startup** — api starts after db's
*process* starts, which is exactly the race we're trying to kill. The long
form gates on health:

\`\`\`yaml
services:
  api:
    depends_on:
      db:
        condition: service_healthy   # wait until the probe passes
\`\`\`

Now \`docker compose up\` holds api in \`Waiting\` until db's healthcheck
succeeds, then starts it. (There's also \`service_started\` — the weak
default — and \`service_completed_successfully\` for one-shot jobs like
migrations.)

This section is quiet foundation-laying: in production, healthchecks are what
**gate traffic**. A rolling deploy replaces containers one at a time and only
routes requests to instances reporting healthy — no health signal, no
zero-downtime deploys. Get the habit now, locally.
`,

  comparisons: [
    {
      label: "Proving the service is ready",
      intro:
        "After a restart, how do you know the stack actually works? One approach is human eyeballs on a browser; the other is a machine-checked probe that gates dependent services.",
      php: `# Deploy day on the LAMP box
$ ssh deploy@prod-box
$ service apache2 restart
 * Restarting Apache httpd web server
$ # now alt-tab to the browser, refresh the homepage
$ # a few times... loads? looks fine. ship it.
$ # (nobody refreshed checkout, which needs the DB)`,
      ts: `# compose.yaml - the container proves its own readiness
services:
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d shopdb"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 10s
  api:
    build: .
    depends_on:
      db:
        condition: service_healthy   # gate on READY, not started`,
      note:
        "The probe runs every 5 seconds forever, not once on deploy day — and unlike the browser refresh, it checks the actual dependency (accepting connections), not the homepage rendering.",
    },
    {
      label: "Killing the sleep-and-pray",
      intro:
        "The api must not start until the database accepts connections. The manual script guesses a duration; the healthcheck waits for the real event.",
      php: `#!/bin/bash
# deploy.sh - the classic race-condition "fix"
service mysql restart
sleep 10        # ...should be enough, right?
php artisan migrate
# Fast box: you waited 9s for nothing.
# Slow box under load: 10s wasn't enough, migrate crashes.`,
      ts: `# compose.yaml - no guessing: wait for the actual event
services:
  api:
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "app"]
      interval: 5s
      retries: 10`,
      note:
        "sleep encodes a guess about time; the healthcheck encodes the condition you actually care about. Fixed sleeps are always simultaneously too long and too short.",
    },
    {
      label: "An HTTP health probe for the app itself",
      intro:
        "The api container should also report its own health. Manual ops smoke-tests once from a laptop; the image bakes in a probe against a real /health endpoint.",
      php: `# After every deploy: someone smoke-tests by hand
$ curl -I https://shop.example.com/
HTTP/1.1 200 OK
$ # once, from one laptop, right after the deploy -
$ # then nothing watches it until a customer emails`,
      ts: `# Dockerfile - bake the probe into the image
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
# alpine has busybox wget (no curl) - use it
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]`,
      note:
        "The app must implement /health for real — a route that returns 200 when it can serve traffic. The probe is only as honest as the endpoint behind it.",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "api depends on db with condition: service_healthy. Predict the startup order: which container is held back, what state it waits in, and what docker ps shows once everything settles.",
    code: `# compose.yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: example
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 2s
      timeout: 2s
      retries: 10
      start_period: 5s
  api:
    image: shop-api:1.0
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy`,
    output: `$ docker compose up -d
[+] Running 1/3
 ✔ Network shop_default  Created      0.1s
 ⠿ Container shop-db-1   Waiting      2.9s
 ⠿ Container shop-api-1  Created      0.2s

  ...db's pg_isready probe starts passing...

[+] Running 3/3
 ✔ Network shop_default  Created      0.1s
 ✔ Container shop-db-1   Healthy      6.4s
 ✔ Container shop-api-1  Started      6.9s

$ docker ps --format "table {{.Names}}\\t{{.Status}}"
NAMES        STATUS
shop-api-1   Up 12 seconds
shop-db-1    Up 18 seconds (healthy)

$ docker inspect --format '{{.State.Health.Status}}' shop-db-1
healthy`,
  },

  keyPoints: [
    "\"Up\" means the process started; healthy means the service works. A healthcheck is a command run inside the container whose exit code (0/1) defines health.",
    "The compose healthcheck: block takes test, interval, timeout, retries, and start_period — failures during start_period don't count against the container.",
    "Canonical probes: `pg_isready` for postgres, and `wget -qO- http://localhost:3000/health` for HTTP apps — which requires the app to genuinely implement /health.",
    "Health states are starting → healthy / unhealthy (after `retries` consecutive failures) and show in `docker ps` as `Up ... (healthy)`.",
    "Plain depends_on only orders process startup; `depends_on: db: condition: service_healthy` holds the dependent in Waiting until the probe passes.",
    "Healthchecks are the foundation of zero-downtime deploys later — a rolling deploy only routes traffic to instances reporting healthy.",
  ],

  interview: [
    {
      q: "What problem do Docker healthchecks solve that a plain depends_on doesn't?",
      a: "depends_on in its short form only orders *startup*: the api container starts after the db container's process starts. But postgres takes seconds to initialise before it accepts connections, so the api's first query still fails — the classic crash-loop on `docker compose up`. A healthcheck gives Docker a real readiness signal: a probe like `pg_isready` running on an interval, with the container moving through starting → healthy or unhealthy. Combining them — `depends_on` with `condition: service_healthy` — makes Compose hold the api in Waiting until the probe actually passes. It replaces the `sleep 10` in every old deploy script with the condition the sleep was guessing at.",
    },
    {
      q: "How would you write a healthcheck for an HTTP API, and what should the endpoint do?",
      a: "In compose or the Dockerfile: `test: [\"CMD-SHELL\", \"wget -qO- http://localhost:3000/health || exit 1\"]` with a sensible interval, timeout, retries, and a start_period covering the app's boot time. Two practical details: alpine-based images usually don't ship curl, so I use busybox wget or install curl explicitly; and the endpoint has to exist and be honest. /health should return 200 only when the app can serve traffic — if the app is useless without its database, the handler should do a cheap DB ping. A /health that returns 200 unconditionally makes every downstream decision — startup ordering, restart policies, load-balancer routing — confidently wrong.",
    },
    {
      q: "Where do healthchecks fit into zero-downtime deployments?",
      a: "They're the gate. A rolling deploy replaces instances one at a time, and something — Compose, an orchestrator, a load balancer — must decide when the new instance is safe to receive traffic and when the old one can die. That decision is the health status. Without a probe, the deployer either guesses with sleeps or routes traffic to a container that's still booting, which is downtime by another name. So I treat the healthcheck and the /health endpoint as part of the application's contract from day one in local dev: the same probe that orders `compose up` locally is what gates traffic in production.",
    },
  ],

  quiz: [
    {
      question:
        "A container's STATUS shows 'Up 10 seconds (health: starting)'. What does that mean?",
      options: [
        "The healthcheck has failed and Docker is restarting the container",
        "The process is running and probes are underway, but the container is still inside its grace window and hasn't been declared healthy yet",
        "Docker is still pulling the image layers",
        "The container is healthy but dependent services haven't started",
      ],
      answerIndex: 1,
      explain:
        "starting is the initial state: the process is up and the probe is running, but failures during start_period don't count and no verdict has been reached. It becomes healthy on a passing probe, or unhealthy after `retries` consecutive failures.",
    },
    {
      question:
        "Why is `depends_on: [db]` (short form) not enough to stop the api crashing on first boot?",
      options: [
        "Because short-form depends_on is ignored by docker compose up",
        "Because it only starts api after db's container process starts — not after postgres is actually accepting connections",
        "Because depends_on only works when both services share a network",
        "Because postgres containers can't be depended on without a volume",
      ],
      answerIndex: 1,
      explain:
        "Short-form depends_on orders container startup only. Postgres needs seconds of initialisation before it listens, so the api's first connection still fails. The long form with condition: service_healthy plus a pg_isready healthcheck waits for real readiness.",
    },
    {
      question:
        "In a healthcheck block, what does retries: 5 control?",
      options: [
        "How many times Docker restarts an unhealthy container",
        "How many probes run during start_period",
        "How many consecutive probe failures are needed before the container is marked unhealthy",
        "How many seconds each probe may run before timing out",
      ],
      answerIndex: 2,
      explain:
        "retries is the consecutive-failure threshold for flipping to unhealthy — one flaky probe doesn't condemn the container. Restart behaviour is separate (restart policies / orchestrators); the per-probe time limit is timeout.",
    },
  ],
};

export default lesson;
