import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "zero-downtime-deploys",
  title: "Zero-Downtime Deploy Patterns",
  part: "Deploy & Operate",
  estMinutes: 13,
  summary:
    "Plain compose up -d drops requests during the swap; rolling and blue-green deploys fix that by never removing capacity until healthcheck-passing replacements are serving.",

  concept: `
Here is the uncomfortable truth about the VPS deploy: \`docker compose up -d\`
recreates a service by **stopping the old container, then starting the new
one**. Between those two moments there is nothing listening on the port. For
a few seconds — longer if the app boots slowly — every request fails. It is a
much shorter outage than your old "maintenance window", but it is still an
outage, and "how do you deploy without dropping requests?" is a stock
interview question.

All zero-downtime patterns share one rule: **never remove old capacity until
new capacity is proven ready.** Two patterns dominate.

### Rolling deploys

Run several instances of the app. Replace them one at a time: start a new
instance *alongside* the old ones, wait for its healthcheck to pass, tell the
proxy to route to it, then drain and stop one old instance. Repeat. Capacity
never drops below the starting count, and if a new instance fails its
healthcheck the rollout halts with the old version still fully serving.
This is exactly what orchestrators (Kubernetes, ECS, Swarm) do for you — when
an interviewer asks what \`kubectl rollout\` actually does, this is the answer.

### Blue-green deploys

Run **two complete environments**: blue (live) and green (idle). Deploy the
new version to green, test it against real infrastructure, then flip the
router so traffic goes to green. Blue stays running, untouched — which makes
rollback instant: flip back. The cost is running double the containers during
the switchover, which on a single VPS is usually fine for an app tier.

\`\`\`yaml
# compose.yaml — blue and green as sibling services
services:
  proxy:
    image: caddy:2
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile"]
    ports: ["443:443"]
  app-blue:
    image: ghcr.io/acme/api:sha-4c2b8aa   # live
  app-green:
    image: ghcr.io/acme/api:sha-9f8e7d1   # next
\`\`\`

The "flip" is a one-line proxy upstream change (\`app-blue:3000\` →
\`app-green:3000\`) plus a proxy reload, which Caddy and nginx both do without
dropping connections.

### The ingredient both need: healthcheck-gated traffic

Neither pattern works if the proxy routes to a container the moment it starts.
A Node or Python app can take seconds to be ready — connected to the database,
caches warmed. The healthcheck you wrote earlier (\`HEALTHCHECK\` /
\`healthcheck:\` hitting \`/health\`) is what turns "the process started" into
"this instance may receive traffic". The proxy or orchestrator only adds an
instance to the pool once it reports healthy, and pulls it out when it stops.

Two supporting ideas complete the picture. **Connection draining**: before
stopping an old container, stop sending it *new* requests and give in-flight
ones a grace period to finish — the opposite of \`service apache2 restart\`,
which killed requests mid-flight. And **statelessness**: none of this works if
sessions live in files on one container's disk (the PHP default you lived
with for decades). Sessions and uploads go to Redis, the database, or object
storage, so any instance can serve any request and instances become
disposable.

### Being honest about plain Compose

Compose alone does not orchestrate rolling deploys. Your realistic options:
run the blue/green pair behind a proxy as above and script the flip; use a
platform that layers the pattern on top (Kamal, or a PaaS like Fly.io or
Coolify); or graduate to an orchestrator when you genuinely run many
instances. For a single-VPS app, scripted blue-green behind Caddy is the
sweet spot — and knowing *why* it works is what the interview is testing.
`,

  comparisons: [
    {
      label: "The deploy window vs the traffic flip",
      intro:
        "Both deploys replace the running version. One schedules downtime and asks users to wait; the other switches live traffic between two running versions.",
      php: `# The 2am deploy window, circa 2008
# 1. Put up the apology page
mv /var/www/html/maintenance.html.off \\
   /var/www/html/maintenance.html
# 2. Do the deploy while the site is "down for maintenance"
#    (FTP upload, schema tweak, config edit...)
# 3. Remove the page and hope
mv /var/www/html/maintenance.html \\
   /var/www/html/maintenance.html.off`,
      ts: `# Blue-green flip: green already running & healthchecked
# Caddyfile (before)          # Caddyfile (after)
# reverse_proxy app-blue:3000 → reverse_proxy app-green:3000

# The whole "deploy window":
docker compose up -d app-green        # start next version
curl -fsS http://app-green:3000/health # gate on readiness
sed -i 's/app-blue/app-green/' Caddyfile
docker compose exec proxy caddy reload --config /etc/caddy/Caddyfile
# Rollback = the same sed, reversed. Blue is still running.`,
      rightLang: "bash",
      note:
        "The flip happens only after green passes its healthcheck, and the proxy reload keeps existing connections alive — users never see a gap, let alone a maintenance page.",
    },
    {
      label: "Killing requests vs draining them",
      intro:
        "An old instance has to go. What happens to the requests it is serving right now?",
      php: `# Restarting apache mid-afternoon
service apache2 restart
# Every in-flight request is killed on the spot:
# half-rendered pages, half-finished POSTs.
# The checkout that was mid-payment? Gone.
# Users see connection-reset errors and retry —
# sometimes double-charging themselves.`,
      ts: `# Connection draining, step by step
# 1. Proxy stops routing NEW requests to the old
#    instance (it leaves the healthy pool).
# 2. In-flight requests get a grace period to finish.
docker stop --timeout 30 app-api-blue
# docker stop sends SIGTERM first; the app finishes
# current requests and exits cleanly. Only after the
# timeout does Docker escalate to SIGKILL.`,
      rightLang: "bash",
      note:
        "docker stop's SIGTERM-then-SIGKILL contract is the hook for draining — but the app must handle SIGTERM (stop accepting, finish in-flight work, exit), or it gets killed like apache did.",
    },
    {
      label: "File sessions vs external state",
      intro:
        "Zero-downtime patterns run two versions side by side and stop instances at will — which only works if no instance holds irreplaceable state.",
      php: `# php.ini on the single server
; session.save_handler = files
; session.save_path = /var/lib/php/sessions
# Every logged-in user's session is a file on THIS
# box. Stop this server (or add a second one) and
# users are logged out — or bounce between servers
# with different sessions. Deploys must be gentle.`,
      ts: `# compose.yaml — state lives outside the app containers
services:
  api:
    image: ghcr.io/acme/api:\${TAG}
    environment:
      SESSION_STORE: redis://cache:6379
  cache:
    image: redis:7
  db:
    image: postgres:16
# Any api instance can serve any request; instances
# are disposable, so replacing them is routine.`,
      note:
        "Stateless app containers are the precondition for every zero-downtime pattern — once sessions live in Redis and files in object storage, stopping an instance costs nothing.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A rolling deploy as a runnable simulation: three v1 instances are replaced one at a time, and an old instance is only stopped after its replacement passes a healthcheck. Predict the capacity value on every line before running — the point is what it never drops to.",
    code: `// A rolling deploy in miniature. The pool starts with three healthy
// v1 instances. We replace them ONE at a time, and an old instance is
// only stopped AFTER its replacement passes a healthcheck — so the
// number of in-service instances never drops below three.

interface Instance {
  id: string;
  version: string;
  healthy: boolean; // the proxy only routes to healthy instances
}

const OLD = "v1";
const NEW = "v2";

const pool: Instance[] = [
  { id: "api-a", version: OLD, healthy: true },
  { id: "api-b", version: OLD, healthy: true },
  { id: "api-c", version: OLD, healthy: true },
];

function inService(): number {
  return pool.filter((i) => i.healthy).length;
}

function log(event: string): void {
  const versions = pool
    .filter((i) => i.healthy)
    .map((i) => \`\${i.id}:\${i.version}\`)
    .join(" ");
  console.log(\`\${event.padEnd(26)} capacity=\${inService()}  serving: \${versions}\`);
}

// Simulated healthcheck: passes once the app has "warmed up".
function healthcheck(instance: Instance): boolean {
  return instance.version === NEW; // v2 boots fine in this run
}

log("rollout begins");

for (let step = 1; step <= 3; step++) {
  // 1. Start the replacement ALONGSIDE the old instances.
  const fresh: Instance = { id: \`api-\${step}n\`, version: NEW, healthy: false };
  pool.push(fresh);

  // 2. Gate on the healthcheck — the proxy ignores it until it passes.
  if (!healthcheck(fresh)) {
    console.log(\`\${fresh.id} failed healthcheck — rollout HALTED, old pool intact\`);
    break;
  }
  fresh.healthy = true;
  log(\`\${fresh.id} passed check\`);

  // 3. Drain and stop ONE old instance.
  const victim = pool.find((i) => i.version === OLD && i.healthy);
  if (victim) {
    victim.healthy = false; // proxy stops routing; in-flight requests drain
    pool.splice(pool.indexOf(victim), 1);
    log(\`\${victim.id} drained+stopped\`);
  }
}

log("rollout complete");
console.log(\`lowest capacity during deploy: 3 — zero requests dropped\`);

// Try it: make healthcheck() return false — the rollout halts at
// step 1 with all three v1 instances still serving. That halt-on-
// failure behaviour is the other half of the zero-downtime promise.`,
  },

  keyPoints: [
    "`docker compose up -d` alone stops the old container before the new one is ready — a small outage on every deploy.",
    "The universal rule: never remove old capacity until new capacity has passed a healthcheck and is receiving traffic.",
    "Rolling deploy = replace instances one at a time behind a proxy; it is what orchestrators like Kubernetes automate, and a failed healthcheck halts the rollout harmlessly.",
    "Blue-green = two full environments and a proxy flip between them; rollback is flipping back, because the old environment is still running.",
    "Connection draining (SIGTERM grace via `docker stop --timeout`) lets in-flight requests finish — the opposite of `service apache2 restart` killing them mid-flight.",
    "All of it requires stateless app containers: sessions in Redis, files in object storage — PHP-style file sessions pin users to one box and make instances precious instead of disposable.",
  ],

  interview: [
    {
      q: "How would you achieve zero-downtime deploys for a containerised app?",
      a: "The principle is: never remove old capacity until new capacity is verified. With multiple instances I'd do a rolling deploy — start a new instance alongside the old, gate it behind a healthcheck so the proxy only routes to it once it's genuinely ready, then drain and stop one old instance, and repeat; that's what Kubernetes or ECS automate. On a single VPS with plain Compose I'd use blue-green instead: run the new version as a sibling service, healthcheck it, then flip the reverse proxy's upstream and reload — Caddy and nginx reload without dropping connections. Either way the prerequisites are the same: a real `/health` endpoint, graceful SIGTERM handling for connection draining, and stateless app containers with sessions in Redis rather than on local disk.",
    },
    {
      q: "What's the difference between rolling and blue-green deployments, and when would you pick each?",
      a: "Rolling replaces instances incrementally — capacity stays constant, resource overhead is one extra instance, but during the rollout both versions serve traffic simultaneously, so the code and schema must tolerate that mix. Blue-green runs two complete environments and flips traffic between them atomically: only one version serves users at a time, and rollback is instant because the old environment is still running — at the cost of doubling resources during the switch. I'd pick rolling where an orchestrator manages many instances, and blue-green for a small deployment where I want the instant-rollback property and can afford two copies briefly. Both are useless without healthcheck-gated traffic — that's the shared ingredient.",
    },
    {
      q: "Why does `docker compose up -d` cause dropped requests, and what role do healthchecks play in fixing that?",
      a: "For a changed service, Compose stops the existing container and then starts the replacement, so there's a window — container stop plus app boot time — where nothing is listening. Worse, 'started' isn't 'ready': a process can be up seconds before it can actually serve, while it connects to the database. Healthchecks close that gap by making readiness explicit: the container reports healthy only when `/health` succeeds, and a proxy or orchestrator uses that signal to decide when an instance joins the traffic pool and when the old one may be removed. Zero-downtime patterns are essentially choreography built on that one signal.",
    },
  ],

  quiz: [
    {
      question:
        "Why does plain `docker compose up -d` drop requests when deploying a new image?",
      options: [
        "The registry blocks pulls while a container runs",
        "Compose stops the old container before the new one is started and ready, leaving a gap with nothing serving",
        "Docker networks are recreated on every up, breaking DNS",
        "The healthcheck runs before the container starts",
      ],
      answerIndex: 1,
      explain:
        "Recreation is stop-then-start for the same service, so there's a window (container swap plus app boot) with no listener on the port. Zero-downtime patterns exist to keep proven capacity serving through that window.",
    },
    {
      question:
        "In a blue-green deployment, what makes rollback nearly instant?",
      options: [
        "The green containers restart faster than blue ones",
        "The registry keeps a rollback tag automatically",
        "The old (blue) environment is still running — rollback is just flipping the proxy back to it",
        "Docker snapshots the container filesystem before the flip",
      ],
      answerIndex: 2,
      explain:
        "Blue-green never tears down the previous environment during the switch. Since blue is still up and warm, reverting is a proxy upstream change — no pull, no boot, no waiting.",
    },
    {
      question:
        "During a rolling deploy, a new instance fails its healthcheck. What should happen?",
      options: [
        "The proxy routes to it anyway and retries failed requests",
        "The rollout halts with the old instances still serving full traffic",
        "All old instances are stopped so the new version can be debugged",
        "Compose automatically rebuilds the image",
      ],
      answerIndex: 1,
      explain:
        "Because old capacity is only removed after its replacement proves healthy, a failing healthcheck stops the rollout before any damage: the old version is still fully in service. Halt-on-unhealthy is half the value of the pattern.",
    },
    {
      question:
        "Why do PHP-style file sessions break zero-downtime deploy patterns?",
      options: [
        "Session files are too large to copy between containers",
        "They tie user state to one instance's local disk, so stopping or adding instances loses or splits sessions",
        "Docker volumes cannot store session files",
        "File sessions are slower than Redis under load",
      ],
      answerIndex: 1,
      explain:
        "Rolling and blue-green both assume any instance can serve any request and instances are disposable. State on a container's local disk violates that — externalise sessions (Redis, database) and uploads (object storage) first.",
    },
  ],
};

export default lesson;
