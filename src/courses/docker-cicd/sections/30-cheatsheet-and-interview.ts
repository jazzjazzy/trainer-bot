import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-and-interview",
  title: "Cheatsheet & Interview Prep",
  part: "Deploy & Operate",
  estMinutes: 14,
  summary:
    "The whole course compressed for the night before an interview: the mental model in five lines, the canonical Dockerfile, compose and workflow skeletons, and the deploy/rollback one-liners.",

  concept: `
This is the recap to read the night before the interview. Everything below is
covered in depth earlier in the course; here it is compressed to what you must
be able to reproduce on a whiteboard.

### The model in five lines

1. An **image** is an immutable, layered snapshot of a filesystem plus a start
   command — the whole server, not a diff-upload.
2. A **container** is a running process started from an image, isolated by
   namespaces/cgroups — not a VM.
3. A **registry** (Docker Hub, GHCR) stores images under \`name:tag\`; push
   from CI, pull anywhere.
4. A **Dockerfile** is your old SSH setup session as reviewable code; each
   instruction creates a cached layer.
5. **CI builds and tests the image once; every environment runs that same
   artifact.** The server never builds.

### The canonical multi-stage Dockerfile

\`\`\`bash
# Dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci                 # cached unless package*.json changed
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
\`\`\`

Order matters: dependencies before source, so editing code doesn't bust the
\`npm ci\` layer. The final stage carries no compilers, no dev deps, no source.

### The compose.yaml skeleton (no version: key — that's obsolete)

\`\`\`yaml
services:
  api:
    image: ghcr.io/acme/api:\${TAG:-latest}   # build: . in dev only
    restart: unless-stopped
    env_file: .env
    ports: ["127.0.0.1:3000:3000"]
    depends_on:
      db: { condition: service_healthy }
  db:
    image: postgres:16
    restart: unless-stopped
    volumes: [dbdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
volumes:
  dbdata:
\`\`\`

### The CI workflow skeleton (current action versions)

\`\`\`yaml
on:
  push: { branches: [main] }
jobs:
  build:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm test
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v6
        id: meta
        with: { images: "ghcr.io/acme/api" }
      - uses: docker/build-push-action@v7
        with:
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
\`\`\`

Security note worth saying out loud in an interview: \`@v6\`-style tags are the
common convention, but GitHub's own docs pin third-party actions to full
commit SHAs so the tag can't be moved to malicious code.

### Deploy and rollback one-liners

\`\`\`bash
# deploy (CI runs this over SSH):
TAG=sha-9f8e7d1 docker compose pull && TAG=sha-9f8e7d1 docker compose up -d
# rollback = the same command, previous tag:
TAG=sha-4c2b8aa docker compose up -d
# housekeeping:
docker image prune -af --filter "until=168h"
\`\`\`

### Answers to have loaded

Image vs container; why multi-stage; how layer caching works and why COPY
order matters; CI vs CD; where secrets live (Actions secrets and env files —
never in the image); how to deploy without downtime; how to roll back in
under a minute; why the server never builds. The interview section below
rehearses each one.
`,

  comparisons: [
    {
      label: "The whole journey, both eras",
      intro:
        "The complete deploy story you started this course with, next to the one you can now tell in an interview — end to end, from 'code is ready' to 'new version is live'.",
      php: `# The FTP era, end to end
# 1. Code is "ready" (it worked on your machine)
# 2. FileZilla: drag changed files to public_html/
#    — hope you got them all, hope no one's mid-checkout
# 3. SSH in, hand-run the schema change
mysql -u root -p app < changes.sql
# 4. Edit config live to match the new code
nano /var/www/html/config.php
service apache2 restart      # kills in-flight requests
# 5. Testing = refreshing the homepage
# 6. Rollback plan = last night's tarball + memory
# Every step manual, unrecorded, unrepeatable.`,
      ts: `# The containerised pipeline, end to end
# 1. git push -> Actions workflow triggers
# 2. CI: npm ci && npm test        (gate: must pass)
# 3. CI: docker build (multi-stage, layer-cached)
# 4. CI: push ghcr.io/acme/api:sha-9f8e7d1 (immutable)
# 5. CI: ssh deploy@vps "TAG=sha-9f8e7d1 \\
#          docker compose pull && docker compose up -d"
# 6. Healthcheck gates traffic; db untouched
# 7. Rollback plan = TAG=sha-4c2b8aa ... up -d
# Every step is code, logged, and identical every time.
# The artifact that passed tests IS the artifact running.`,
      rightLang: "bash",
      note:
        "The deep difference isn't the tools — it's that the pipeline version is written down, versioned, gated by tests, and repeatable by anyone on the team, including you at 3am.",
    },
    {
      label: "Legacy docker-compose v1 vs the modern Compose Spec",
      intro:
        "You will meet old compose files in real codebases and interview questions. Know exactly what dates a file — and what replaced each dated piece.",
      php: `# docker-compose.yml — the legacy shape (v1 era)
version: "3.8"        # <- obsolete: the Compose Spec
                      #    ignores this key entirely
services:
  api:
    build: .
    ports:
      - "3000:3000"
  db:
    image: postgres:9.6

# run with the old Python binary (dead, v1):
#   docker-compose up -d     (note the hyphen)`,
      ts: `# compose.yaml — the modern shape (Compose Spec)
# no version: key. Preferred filename: compose.yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
  db:
    image: postgres:16

# run with the compose plugin built into docker:
#   docker compose up -d     (space, not hyphen)`,
      leftLang: "yaml",
      note:
        "Two tells of a legacy file: the version: key (now ignored by the spec) and docs referencing the hyphenated docker-compose Python binary. The modern CLI is the docker compose plugin (Compose v2+); the file schema is the Compose Specification.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "The whole course as one terminal session: build, tag, push, pull, deploy, inspect, roll back. Three outputs are replaced with ??? — predict each (what CACHED means, which layers upload, what image the rolled-back container runs) before checking the transcript.",
    code: `# 1-3: build and tag (laptop or CI — same commands)
docker build -t api:dev .
docker build -t api:dev .          # rebuilt immediately: ???  (a)
docker tag api:dev ghcr.io/acme/api:sha-9f8e7d1

# 4-5: authenticate and push
docker login ghcr.io -u jason
docker push ghcr.io/acme/api:sha-9f8e7d1       # uploads: ???  (b)

# 6-8: on the server — pull and run
docker compose pull
TAG=sha-9f8e7d1 docker compose up -d
docker compose ps

# 9-10: observe
docker logs --tail 2 app-api-1
docker stats --no-stream app-api-1

# 11-12: the release is bad — roll back and verify
TAG=sha-4c2b8aa docker compose up -d
docker ps --format '{{.Names}}  {{.Image}}'    # api runs: ???  (c)`,
    output: `$ docker build -t api:dev .
[+] Building 38.2s (12/12) FINISHED
$ docker build -t api:dev .
[+] Building 0.9s (12/12) FINISHED
 => CACHED [build 2/6] WORKDIR /app                    0.0s
 => CACHED [build 4/6] RUN npm ci                      0.0s
# (a) every layer CACHED — nothing changed, BuildKit reuses all of it
$ docker tag api:dev ghcr.io/acme/api:sha-9f8e7d1
$ docker login ghcr.io -u jason
Login Succeeded
$ docker push ghcr.io/acme/api:sha-9f8e7d1
9d3a1e4f2c1b: Layer already exists
1f0c9b8d7e6a: Layer already exists
f1e2d3c4b5a6: Pushed
0a9b8c7d6e5f: Pushed
# (b) only the app layers upload — base-image layers already in registry
$ docker compose pull
[+] Pulling 2/2
 ✔ db Skipped - Image is already present locally
 ✔ api Pulled                                          3.7s
$ TAG=sha-9f8e7d1 docker compose up -d
[+] Running 2/2
 ✔ Container app-db-1   Running                        0.0s
 ✔ Container app-api-1  Started                        1.3s
$ docker compose ps
NAME        IMAGE                          STATUS
app-api-1   ghcr.io/acme/api:sha-9f8e7d1   Up 4 seconds (healthy)
app-db-1    postgres:16                    Up 3 weeks (healthy)
$ docker logs --tail 2 app-api-1
{"time":"2026-07-07T15:01:02Z","level":"info","msg":"listening","port":3000}
{"time":"2026-07-07T15:01:07Z","level":"info","msg":"request","path":"/health","status":200}
$ docker stats --no-stream app-api-1
NAME        CPU %   MEM USAGE / LIMIT
app-api-1   0.31%   84.2MiB / 512MiB
$ TAG=sha-4c2b8aa docker compose up -d
[+] Running 2/2
 ✔ Container app-db-1   Running                        0.0s
 ✔ Container app-api-1  Started                        1.1s
$ docker ps --format '{{.Names}}  {{.Image}}'
app-api-1  ghcr.io/acme/api:sha-4c2b8aa
app-db-1   postgres:16
# (c) the api container runs the OLD tag — rollback was one command,
# because sha-4c2b8aa never stopped existing. db never flinched.`,
  },

  keyPoints: [
    "Model in one breath: image = immutable layered snapshot, container = running process from it, registry = where tagged images live, Dockerfile = the setup as code, and CI builds once so every environment runs the same artifact.",
    "The canonical Dockerfile is multi-stage with dependencies copied before source — so code edits reuse the cached `npm ci` layer and the final image carries no build tools.",
    "Modern compose files have NO `version:` key (the Compose Spec ignores it), are named compose.yaml by preference, and run via the `docker compose` plugin — the hyphenated Python `docker-compose` v1 binary is history.",
    "CI skeleton to memorise: checkout@v6 → setup-node@v4 (cache: npm) → test → setup-buildx-action@v4 → login-action@v4 → metadata-action@v6 → build-push-action@v7 with `type=gha` layer caching.",
    "Deploy = `TAG=<sha> docker compose pull && ... up -d` over SSH; rollback = the same `up -d` with the previous tag; both under a minute.",
    "Security lines that land well: pin third-party actions to commit SHAs (GitHub's own hardening guidance), secrets live in Actions secrets/env files and never in image layers, and the server never builds.",
  ],

  interview: [
    {
      q: "What's the difference between an image and a container, and where does a registry fit?",
      a: "An image is an immutable, layered filesystem snapshot plus metadata — the app, its runtime, its dependencies, and the command to start it. A container is a live instance of that image: a normal Linux process isolated with namespaces and cgroups, with a thin writable layer on top — so one image can back many containers, and containers are disposable while images are permanent. A registry like GHCR or Docker Hub is where tagged images are stored and distributed: CI pushes `ghcr.io/acme/api:sha-9f8e7d1` once, and my laptop, a teammate's machine, and the production VPS all pull the identical artifact. Coming from PHP deployment, the image is the whole server captured as a versioned file, instead of a diff of files FTPed onto a box that was configured by hand.",
    },
    {
      q: "Why multi-stage builds, and how does layer caching actually work?",
      a: "Each Dockerfile instruction produces a layer, and BuildKit reuses a cached layer when the instruction and its inputs are unchanged — but the first changed layer invalidates everything after it. That's why the canonical Dockerfile copies package manifests and runs `npm ci` before copying source: editing app code then only rebuilds from the `COPY . .` step and the expensive dependency install stays cached. Multi-stage builds solve a different problem: building needs compilers and dev dependencies that production shouldn't ship, so a build stage produces the artifacts and a slim final stage copies just those in — smaller image, faster pulls, less attack surface. In CI, `cache-from/cache-to: type=gha` persists those layers between runs so pipeline builds get the same speedup as local ones.",
    },
    {
      q: "Explain CI versus CD, and how you'd deploy without downtime.",
      a: "CI — continuous integration — is the automated gate on every push: build the code, run the tests, produce the artifact; its job is to prove the change is safe to ship. CD extends that: continuous delivery means every green build produces a deployable, versioned artifact, and continuous deployment means it actually ships automatically. For zero downtime, the rule is to never remove serving capacity until its replacement has passed a healthcheck: rolling deploys swap instances one at a time behind a proxy (what orchestrators automate), and blue-green runs the new version alongside the old and flips the router, giving instant rollback. The prerequisites are a genuine `/health` endpoint, graceful SIGTERM handling so connections drain, and stateless containers — sessions in Redis, not PHP-style files on local disk.",
    },
    {
      q: "How do you roll back a bad release, and where do secrets live in your pipeline?",
      a: "Rollback is redeploying the previous tag: we ship pinned tags like `sha-9f8e7d1`, never bare `:latest`, so the last known-good version is a named, immutable image that still exists in the registry and usually on the server — `TAG=sha-4c2b8aa docker compose up -d` and it's serving again in under a minute, with a `workflow_dispatch` workflow as the audited team-facing button. The caveat I always raise: the database doesn't roll back with the code, so we write expand/contract migrations where the current and previous release both work against the live schema. Secrets never go in the image or the repo — they'd be readable in layers and history forever. They live in GitHub Actions secrets (injected as env vars at workflow runtime, masked in logs) and in an `.env` file with tight permissions on the server; the registry login on the VPS uses a read-only token, least privilege.",
    },
  ],

  quiz: [
    {
      question:
        "In a modern compose.yaml, what should the top-level `version:` key be set to?",
      options: [
        "\"3.9\" — the latest schema version",
        "\"2\" — for Compose v2 compatibility",
        "It should not be present at all — the Compose Specification ignores it",
        "The version of the docker compose plugin installed",
      ],
      answerIndex: 2,
      explain:
        "The version: key is obsolete: the Compose Specification ignores it, and modern files simply start at services:. Seeing it (alongside the hyphenated docker-compose binary) is the tell of a legacy v1-era file.",
    },
    {
      question:
        "Why does the canonical Dockerfile COPY package*.json and run `npm ci` BEFORE copying the rest of the source?",
      options: [
        "npm refuses to install if source files are present",
        "So code-only changes reuse the cached dependency layer — the first changed layer invalidates all later ones, so the expensive step goes early",
        "To make the final image smaller",
        "Because COPY . . cannot include package.json",
      ],
      answerIndex: 1,
      explain:
        "Layer caching reuses layers until the first change. Dependencies change rarely; source changes constantly. Installing deps from the manifests first means everyday code edits rebuild only the cheap layers after COPY . . — image size is multi-stage's job, not ordering's.",
    },
    {
      question:
        "Which sequence correctly orders the containerised pipeline?",
      options: [
        "push image → run tests → build image → deploy",
        "test → build image → push to registry → server pulls and runs it",
        "build on the server → test on the server → restart services",
        "deploy → healthcheck → build → tag",
      ],
      answerIndex: 1,
      explain:
        "Tests gate the build, the built image is pushed to the registry as an immutable tagged artifact, and the server's only job is pull-and-run. Building on the server is the anti-pattern this whole course replaces.",
    },
    {
      question:
        "According to GitHub's own hardening guidance, what is the most secure way to reference a third-party action in a workflow?",
      options: [
        "uses: some/action@main to always get fixes",
        "uses: some/action@v7 — major version tags are immutable",
        "uses: some/action@<full commit SHA> — tags can be moved, commits can't",
        "Vendoring the action's source into your repo",
      ],
      answerIndex: 2,
      explain:
        "Version tags like @v7 are the common convention but are mutable — a compromised maintainer could repoint one at malicious code. Pinning to the full commit SHA freezes exactly what runs, which is what GitHub's docs recommend for third-party actions.",
    },
  ],
};

export default lesson;
