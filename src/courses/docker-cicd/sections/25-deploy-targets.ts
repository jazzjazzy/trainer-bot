import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "deploy-targets",
  title: "Where to Deploy: A Tour of Targets",
  part: "Deploy & Operate",
  estMinutes: 11,
  summary:
    "The image is in the registry — now where does it run? A cost/control/ops-burden tour of the three realistic targets: a VPS you manage with compose, container platforms and orchestrators, and managed PaaS.",

  concept: `
Your pipeline ends with an image in ghcr.io. An image in a registry serves no
traffic — something has to pull and run it. There are three realistic families
of "something", and the trade-off between them is a triangle: **cost**,
**control**, and **ops burden**. You can't minimise all three; picking a
target is deciding which corner you'll pay.

### Target 1: a VPS you manage, running docker compose

Rent a Linux box (Hetzner, DigitalOcean, Linode — \$5–20/month), install
Docker, put a \`compose.yaml\` on it, and deploy with
\`docker compose pull && docker compose up -d\`. This is the closest
descendant of your LAMP box — same SSH, same \`apt-get upgrade\` duty, same
"the server is yours" feeling — except the app comes as an image, so the box
itself stays boring: Docker, a firewall, and a reverse proxy such as Caddy or
Traefik for TLS, and nothing else.

- **Cost**: lowest, by far, for steady workloads.
- **Control**: total. Any service, any daemon, cron, weird ports — yours.
- **Ops burden**: all yours. Kernel patches, disk full at 2am, backups,
  the reverse-proxy config. Fine for one or two boxes; it stops scaling
  around the time you can't name your servers anymore.

### Target 2: container platforms and orchestrators

When "restart it on another machine if this one dies" must happen without a
human, you want an **orchestrator** — a scheduler that treats servers as a
pool and keeps N replicas of your container running across them. Kubernetes
is the industry-standard one; the major clouds also sell simpler managed
container services where you hand over an image and replica count and they
run it. Kubernetes is honestly a course of its own — for now, the interview
sound bite is: *compose declares containers on one machine; an orchestrator
declares them across many, with self-healing, scaling, and rolling updates
built in*.

A middle path worth knowing: **self-hosted PaaS** like Coolify or Dokku —
open-source dashboards you install on your own VPS that give you push-to-deploy,
TLS, and per-app management on hardware you still own. VPS prices, some PaaS
convenience, still your box to patch.

- **Cost**: medium (cloud services) to VPS-cheap (Coolify/Dokku).
- **Control**: high, but through the platform's abstractions.
- **Ops burden**: shifted from "patch servers" to "operate the platform" —
  genuinely lower with managed offerings, genuinely NOT lower with self-run
  Kubernetes.

### Target 3: managed PaaS

Fly.io, Render, Railway — the modern Heroku shape. You push an image (or just
point them at the repo) and the platform does everything else: TLS, load
balancing, rollouts, restarts, often scale-to-zero. Deploy config shrinks to a
small file — Fly's \`fly.toml\` says little more than the image, an internal
port, and region.

- **Cost**: highest per unit of compute; brilliant at small scale (free/cheap
  tiers, scale-to-zero), pricier as you grow.
- **Control**: lowest. Their runtime, their networking, their roadmap.
- **Ops burden**: near zero — you never see the servers.

### Choosing, out loud, in an interview

The honest framework: **steady traffic + tight budget + you're happy to be
the ops team → VPS with compose. No ops capacity, need to ship yesterday →
managed PaaS. Many services, spiky traffic, dedicated platform/ops people →
a container platform/orchestrator.** And the beautiful part your FTP years
never had: the *artifact doesn't change* between these — the same
\`ghcr.io/acme/shipit:sha-a1b2c3d\` runs on all three, so migrating targets
later is a config problem, not a rewrite.
`,

  comparisons: [
    {
      label: "Shared hosting vs a VPS running compose",
      intro:
        "The budget option, then and now. Shared cPanel hosting was cheap because the host multiplexed you; a small VPS is cheap because the box is small — but it runs your images.",
      php: `# the cPanel-era ritual
$ ftp ftp.hostgator-clone.example
ftp> put index.php
ftp> put lib/db.php
# then click around cPanel:
#  - MySQL Databases -> create db_prod2
#  - Subdomains, PHP version dropdown
#  - cron: /usr/bin/php /home/acme/cron.php
# PHP version, extensions, MySQL flags:
# whatever the host decided. tickets otherwise.`,
      ts: `# compose.yaml on a \$8/month VPS
services:
  web:
    image: ghcr.io/acme/shipit:sha-a1b2c3d
    restart: unless-stopped
    ports: ['3000:3000']
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16
    restart: unless-stopped
    volumes: ['pgdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD', 'pg_isready', '-U', 'postgres']
      interval: 10s
volumes:
  pgdata:
# deploy = docker compose pull && docker compose up -d`,
      note: "Same price bracket as shared hosting, but the runtime is exactly what your image says — any language, any version, any extension — and 'deploy' is two commands instead of an FTP session plus cPanel clicks. The trade: you now patch the box.",
    },
    {
      label: "The same image on a VPS vs on a managed PaaS",
      intro:
        "One image, two run configs. The compose file describes machines-level detail; the Fly config (TOML, shown with yaml highlighting) describes intent and lets the platform fill in the rest.",
      php: `# compose.yaml — you run the box
services:
  web:
    image: ghcr.io/acme/shipit:sha-a1b2c3d
    restart: unless-stopped
    ports: ['3000:3000']
# plus, NOT in this file but on your plate:
#   TLS certs (Caddy/Traefik), the firewall,
#   OS updates, monitoring, backups, and
#   being awake when the disk fills up.`,
      ts: `# fly.toml — the platform runs the box
app = "shipit"
primary_region = "syd"

[build]
  image = "ghcr.io/acme/shipit:sha-a1b2c3d"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  min_machines_running = 0
# TLS, routing, restarts, scale-to-zero:
# included. so is the bigger invoice.`,
      note: "Both files point at the identical registry image — the artifact never changes, only the harness around it. The PaaS erases the ops column from your calendar and adds it to your bill.",
      leftLang: "yaml",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The cost/control/ops triangle as a runnable scoring model. Two scenarios are evaluated: a tight-budget side project with steady traffic and no ops capacity, and a funded startup with spiky traffic and a dedicated ops team. Predict which target wins each before running.",
    code: `// Where should the image run? Score three targets on three criteria.

const targets = ['VPS + compose', 'Container platform', 'Managed PaaS'] as const;
type Target = (typeof targets)[number];

interface Scenario {
  name: string;
  budget: 'tight' | 'flexible';
  traffic: 'steady' | 'spiky';
  teamOps: 'none' | 'dedicated';
}

function score(s: Scenario): Record<Target, number> {
  const pts: Record<Target, number> = {
    'VPS + compose': 0,
    'Container platform': 0,
    'Managed PaaS': 0,
  };
  // Budget: a VPS is the cheapest steady compute; PaaS bills for convenience.
  if (s.budget === 'tight') {
    pts['VPS + compose'] += 2;
    pts['Container platform'] += 1;
  } else {
    pts['Managed PaaS'] += 2;
    pts['Container platform'] += 1;
  }
  // Traffic: spiky loads want autoscaling; steady loads fit a fixed box.
  if (s.traffic === 'spiky') {
    pts['Container platform'] += 2;
    pts['Managed PaaS'] += 2;
  } else {
    pts['VPS + compose'] += 2;
  }
  // Ops capacity: no ops team -> pay a platform to be your ops team.
  if (s.teamOps === 'none') {
    pts['Managed PaaS'] += 2;
  } else {
    pts['Container platform'] += 2;
    pts['VPS + compose'] += 1;
  }
  return pts;
}

function recommend(s: Scenario): void {
  console.log(
    \`\${s.name}  (budget: \${s.budget}, traffic: \${s.traffic}, ops: \${s.teamOps})\`,
  );
  const pts = score(s);
  const ranked = [...targets].sort((a, b) => pts[b] - pts[a]);
  for (const t of ranked) {
    console.log(\`  \${t.padEnd(20)} \${'#'.repeat(pts[t]).padEnd(5)} \${pts[t]}\`);
  }
  console.log(\`  -> deploy to: \${ranked[0]}\`);
}

recommend({ name: 'Side project', budget: 'tight', traffic: 'steady', teamOps: 'none' });
recommend({ name: 'Funded startup', budget: 'flexible', traffic: 'spiky', teamOps: 'dedicated' });

// Try it: give the side project spiky traffic — watch the winner change.`,
  },

  keyPoints: [
    "Deploy targets trade along a triangle — cost, control, ops burden — and you can't minimise all three at once.",
    "VPS + `docker compose pull && docker compose up -d`: cheapest, total control, and every 2am problem is yours — the containerised descendant of your LAMP box.",
    "Orchestrators (Kubernetes and managed container services) run replicas across a *pool* of machines with self-healing and rolling updates — compose for one machine, orchestrators for many. Kubernetes is its own course.",
    "Self-hosted PaaS (Coolify, Dokku) is the middle path: push-to-deploy convenience on a VPS you still own and patch.",
    "Managed PaaS (Fly.io, Render, Railway): push an image, get TLS/routing/restarts/scale-to-zero — near-zero ops at the highest per-unit price and the least control.",
    "The image is target-agnostic: the same ghcr.io digest runs on all three, so changing targets later is a config change, not a rewrite — the portability FTP deploys never had.",
  ],

  interview: [
    {
      q: "Your team has a containerised app and needs to pick a deployment target. How do you decide?",
      a: "I frame it as cost versus control versus ops burden — you pay at least one corner. First question: do we have anyone to own servers? If nobody's on ops, a managed PaaS like Fly.io or Render is usually right despite the higher unit price, because the alternative is unpatched boxes. Second: what's the traffic shape? Steady and modest fits a fixed VPS running compose for a few dollars a month; spiky or global wants a platform that autoscales. Third: how many services and how much budget? A fleet of services with a dedicated platform team justifies an orchestrator like Kubernetes or a managed container service. The key point I'd stress: because the artifact is an OCI image, this decision is reversible — we can start on a PaaS and move to a VPS or an orchestrator later without touching the application.",
    },
    {
      q: "What's the difference between running compose on a VPS and running Kubernetes?",
      a: "Scope and self-healing. Compose declares a set of containers on *one* machine — if that machine dies, everything on it dies until a human intervenes. An orchestrator like Kubernetes treats a pool of machines as one compute surface: you declare 'three replicas of this image' and the scheduler places them, restarts them on failure, moves them off dead nodes, and rolls updates gradually. That power costs operational complexity — self-running Kubernetes is a bigger ops burden than the VPS it replaced, which is why most teams either buy it managed from a cloud or stay on compose until they genuinely have a multi-machine problem. For a single-box app, compose plus a healthcheck and restart policy covers a surprising amount of what people think they need Kubernetes for.",
    },
    {
      q: "When would you recommend a managed PaaS over infrastructure you control, and what's the catch?",
      a: "When time-to-ship and headcount dominate: small team, no ops capacity, product not yet proven. A PaaS turns deployment into 'push the image' — TLS, load balancing, health-based restarts, and often scale-to-zero are included, so the whole ops column disappears from the team's calendar. The catches are cost and control: per unit of compute you pay a multiple of a bare VPS, and you live inside the platform's abstractions — their networking, their allowed runtimes, their pricing changes. My rule of thumb is that PaaS is excellent while the bill is smaller than the salary fraction it replaces; when it stops being so, the same image moves to a VPS or a container platform, which is exactly why we containerised in the first place.",
    },
  ],

  quiz: [
    {
      question:
        "A solo developer with a steady-traffic app, a tight budget, and LAMP-era server skills asks where to run their image. Best fit?",
      options: [
        "A self-managed Kubernetes cluster for future-proofing",
        "A small VPS running docker compose behind a reverse proxy",
        "A premium managed PaaS tier",
        "Keep it on shared cPanel hosting",
      ],
      answerIndex: 1,
      explain:
        "Steady traffic fits a fixed box, tight budget favours VPS pricing, and existing server skills mean the ops burden is affordable. Kubernetes solves multi-machine problems they don't have; cPanel can't run their image at all.",
    },
    {
      question:
        "What is the honest one-line difference between compose and an orchestrator like Kubernetes?",
      options: [
        "Compose is for development only and cannot run production workloads",
        "Orchestrators are cheaper to operate than compose",
        "Compose declares containers on one machine; an orchestrator keeps declared replicas running across a pool of machines with self-healing and rolling updates",
        "Kubernetes runs images and compose cannot",
      ],
      answerIndex: 2,
      explain:
        "Both run the same images from declarative config. The difference is scope: compose manages a single host, while an orchestrator schedules across many hosts and reconciles failures automatically — power that costs significant operational complexity.",
    },
    {
      question:
        "Why is switching deploy targets (VPS → PaaS → orchestrator) comparatively cheap in a containerised setup?",
      options: [
        "All platforms share the same billing API",
        "The artifact is the same registry image everywhere — only the surrounding run config (compose.yaml, fly.toml, manifests) changes",
        "Docker automatically migrates running containers between providers",
        "It isn't — each target needs the app rebuilt for its runtime",
      ],
      answerIndex: 1,
      explain:
        "The OCI image is target-agnostic: the identical ghcr.io digest runs on a VPS, a PaaS, or Kubernetes. Migration means rewriting a small config file, not the application — portability the FTP-onto-a-specific-server era never offered.",
    },
  ],
};

export default lesson;
