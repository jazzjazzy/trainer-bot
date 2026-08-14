import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "multi-stage-builds",
  title: "Multi-Stage Builds: Small Prod Images",
  part: "Building Images",
  estMinutes: 12,
  summary:
    "Multi-stage builds compile your app in one throwaway stage and copy only the finished output into a small, clean runtime stage — turning a 1GB+ dev image into a ~150MB production one.",

  concept: `
A TypeScript app needs two very different environments. To **build** it you need
\`tsc\`, every devDependency, and often a compiler toolchain for native modules.
To **run** it you need Node, \`dist/\`, and production dependencies — nothing else.
A single-stage Dockerfile ships both, which is like tarring up your entire dev
box — compilers, source, node_modules bloat and all — and calling that
production. Multi-stage builds fix this with one idea: **a Dockerfile can
contain several \`FROM\` lines, and only the last one becomes the image you ship.**

### Two stages: build, then runtime

\`\`\`bash
# Dockerfile
# ---- Stage 1: build (named "build") ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # tsc -> dist/

# ---- Stage 2: runtime (the final image) ----
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev      # production deps only
COPY --from=build /app/dist ./dist
CMD ["node", "dist/server.js"]
\`\`\`

Each \`FROM\` starts a fresh stage with its own filesystem. \`AS build\` names the
first stage, and \`COPY --from=build\` reaches back into it to grab exactly the
files you want — here, just \`dist/\`. Everything else in the build stage — the
TypeScript source, devDependencies, npm cache — is simply **not in the final
image**. It isn't deleted; it was never copied.

### The size win, concretely

On a typical Express + TypeScript app:

\`\`\`bash
$ docker images
REPOSITORY   TAG           SIZE
myapp        single-stage  1.12GB
myapp        multi-stage   152MB
\`\`\`

The single-stage image carries \`node_modules\` with devDependencies (often
600MB+ with tooling like typescript, eslint, jest), the full source tree, and
whatever \`npm ci\` cached. The multi-stage image carries alpine Node, prod
dependencies, and \`dist/\`. Smaller images pull faster on every deploy, cost
less to store in a registry, and start containers sooner.

### The security win

Size is the headline; **attack surface** is what interviewers probe. The final
image has:

- **No compilers or build tools** — an attacker who gets in can't build exploits in place.
- **No devDependencies** — hundreds of packages (and their CVEs) that never ship.
- **No source code** — only compiled \`dist/\`, so your \`.ts\` files and comments stay out of production.

### Naming stages and \`--target\`

You can have more than two stages and build any one of them directly:

\`\`\`bash
docker build --target build -t myapp:ci .
\`\`\`

That builds only up to the \`build\` stage — handy in CI when you want an image
that still has jest and your test files to run the test suite, while production
uses the full multi-stage output. A common layout is \`base\` → \`build\` →
\`test\` → final runtime, with CI targeting \`test\` and deploys building the
whole file.

### The same pattern in Python

Python doesn't compile to \`dist/\`, but the pattern holds: build wheels (which
may need gcc) in a builder stage, install them in a slim runtime:

\`\`\`bash
# Dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc python3-dev \\
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/*
COPY app/ ./app
CMD ["python", "-m", "app"]
\`\`\`

The runtime image never sees gcc or build headers. Same principle, different
ecosystem — which is exactly how you should present it in an interview: not "a
Node trick" but "separate the build environment from the runtime environment".
`,

  comparisons: [
    {
      label: "Building on the prod server vs building in a stage",
      intro:
        "Shipping a TypeScript app the old way meant SSHing into production and building it there — leaving compilers, dev packages, and source on the live box. A multi-stage Dockerfile does the build in a disposable stage instead.",
      php: `# The old way: build ON the production server
ssh deploy@prod-web-01
cd /var/www/api
git pull origin main
npm install          # dev deps land on the prod box
npm run build        # tsc runs on the live server
pm2 restart api
# prod now has: full source, node_modules with
# devDependencies, npm cache, git history...`,
      ts: `# Dockerfile — the build happens in a throwaway stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node", "dist/server.js"]`,
      note:
        "The build stage is discarded after COPY --from=build — production never contains tsc, devDependencies, or your .ts source, and the build can't be affected by whatever state the prod box is in.",
      rightLang: "bash",
    },
    {
      label: "Single-stage vs multi-stage Dockerfile",
      intro:
        "Both Dockerfiles produce a working image of the same app. One ships everything the build needed; the other ships only what the runtime needs.",
      php: `# Dockerfile.single — everything in one stage
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci              # ALL deps, dev included
COPY . .                # full source tree
RUN npm run build
CMD ["node", "dist/server.js"]
# Ships: src/, tests/, node_modules incl.
# typescript, jest, eslint... ~1.1GB`,
      ts: `# Dockerfile — two stages
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev   # prod deps only
COPY --from=build /app/dist ./dist
CMD ["node", "dist/server.js"]
# Ships: dist/ + prod deps... ~150MB`,
      note:
        "docker images tells the story: myapp:single-stage 1.12GB vs myapp:multi-stage 152MB — same app, roughly 7x smaller, with no compilers or source in the shipped image.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Building just one stage with --target",
      intro:
        "CI wants an image that still contains jest and the test files; production wants the lean final stage. One Dockerfile serves both via --target.",
      php: `# Manual ops version: two parallel setups
# On the CI box:
ssh ci@ci-runner-03
cd /builds/api && npm install && npm test
# On the prod box (different machine, different
# node version, different results...):
ssh deploy@prod-web-01
cd /var/www/api && npm install --production`,
      ts: `# CI: build only up to the "build" stage
# (still has devDependencies and tests)
docker build --target build -t myapp:ci .
docker run --rm myapp:ci npm test

# Deploy: build the whole file — the final
# stage becomes the shipped image
docker build -t myapp:1.4.0 .`,
      note:
        "--target stops the build at a named stage, so one Dockerfile defines both the test environment and the production artifact — no drift between them.",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Read the two-stage Dockerfile, then the build-and-list transcript. Before revealing the output: which of the two images is bigger and why, and why is `typescript` missing from the final image even though the build clearly ran tsc?",
    code: `# Dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node", "dist/server.js"]

# Build it, then compare with the single-stage variant:
docker build -t myapp:multi .
docker images --format "table {{.Repository}}:{{.Tag}}\\t{{.Size}}"
docker run --rm myapp:multi ls node_modules | grep -c typescript`,
    output: `$ docker build -t myapp:multi .
[+] Building 24.3s (15/15) FINISHED
 => [internal] load build definition from Dockerfile         0.0s
 => [internal] load metadata for docker.io/library/node:22-alpine  0.6s
 => [build 1/6] FROM docker.io/library/node:22-alpine@sha256:9f8e3b  0.0s
 => CACHED [build 2/6] WORKDIR /app                          0.0s
 => [build 3/6] COPY package*.json ./                        0.1s
 => [build 4/6] RUN npm ci                                  14.2s
 => [build 5/6] COPY . .                                     0.2s
 => [build 6/6] RUN npm run build                            6.1s
 => [stage-1 4/5] RUN npm ci --omit=dev                      2.4s
 => [stage-1 5/5] COPY --from=build /app/dist ./dist         0.1s
 => exporting to image                                       0.5s
 => => naming to docker.io/library/myapp:multi               0.0s

$ docker images --format "table {{.Repository}}:{{.Tag}}\\t{{.Size}}"
REPOSITORY:TAG        SIZE
myapp:multi           152MB
myapp:single-stage    1.12GB
node:22-alpine        128MB

$ docker run --rm myapp:multi ls node_modules | grep -c typescript
0

# myapp:multi is barely bigger than the node:22-alpine base:
# just prod deps + dist/. typescript ran in the build stage,
# but that stage was never shipped — the final image only
# received what COPY --from=build explicitly pulled across.`,
  },

  keyPoints: [
    "A Dockerfile can have multiple `FROM` lines; each starts a fresh stage, and only the **last** stage becomes the shipped image.",
    "`FROM node:22-alpine AS build` names a stage; `COPY --from=build /app/dist ./dist` copies specific files out of it into the final stage.",
    "Build-stage contents (devDependencies, `tsc`, source) aren't deleted from the final image — they were **never copied in**, which is why the size drops from ~1.1GB to ~150MB.",
    "The security win matters as much as the size win: no compilers, no devDependency CVEs, no source code in production.",
    "`docker build --target build` builds only up to a named stage — one Dockerfile can serve CI (with tests) and production (lean runtime).",
    "The pattern is language-agnostic: Python uses a builder stage to compile wheels with gcc, then installs them into a clean `python:3.12-slim` runtime.",
  ],

  interview: [
    {
      q: "What is a multi-stage Docker build and why would you use one?",
      a: "It's a Dockerfile with multiple `FROM` instructions, where each `FROM` starts a fresh stage and only the final stage becomes the image you ship. I use an early stage with the full toolchain — devDependencies, `tsc`, compilers — to build the app, then a clean runtime stage that uses `COPY --from=build` to pull in only the compiled output and production dependencies. The payoff is a much smaller image — on a typical TypeScript service, roughly 1.1GB down to about 150MB — plus a real security improvement: no build tools, no devDependencies, and no source code in production. Faster pulls, cheaper registry storage, smaller attack surface.",
    },
    {
      q: "Why is a smaller image also a more secure image?",
      a: "Every binary and package in an image is attack surface. A single-stage image ships hundreds of devDependencies, each a potential CVE that scanners will flag and someone has to triage, plus compilers an attacker could use to build tooling inside a compromised container. The multi-stage runtime stage has none of that — just the base OS, Node, production deps, and compiled output. It also keeps intellectual property out of production: the shipped image contains `dist/`, not the TypeScript source. Fewer packages means fewer vulnerabilities, faster scans, and less for an attacker to work with.",
    },
    {
      q: "How would you run your test suite in CI if tests need devDependencies but production must not include them?",
      a: "That's exactly what `--target` is for. I keep the tests runnable in the build stage — it has the full `npm ci` install — and in CI I run `docker build --target build -t myapp:ci .`, which stops at that stage, then execute the tests inside it. The deploy job builds the same Dockerfile without a target, producing the lean final stage. One Dockerfile defines both environments, so there's no drift between what was tested and what ships — the runtime stage is assembled from the very build stage the tests passed in.",
    },
  ],

  quiz: [
    {
      question:
        "In a multi-stage Dockerfile, why do devDependencies not appear in the final image?",
      options: [
        "The final stage runs `npm prune` automatically",
        "BuildKit strips node_modules from the last layer",
        "The final stage starts from a fresh base image and only receives what COPY --from explicitly brings across",
        "Alpine images cannot store devDependencies",
      ],
      answerIndex: 2,
      explain:
        "Each FROM begins a brand-new filesystem. Nothing from earlier stages exists in the final stage unless a COPY --from=<stage> instruction copies it. The devDependencies weren't removed — they were never there.",
    },
    {
      question: "What does `docker build --target build -t myapp:ci .` do?",
      options: [
        "Builds all stages but tags only the one named build",
        "Builds the Dockerfile only up to and including the stage named build, and tags that as the image",
        "Runs the build stage's tests and discards the image",
        "Builds the final stage using cache from the build stage",
      ],
      answerIndex: 1,
      explain:
        "--target stops the build at the named stage and makes that stage the image output. It's how CI gets an image that still contains devDependencies and tests from the same Dockerfile that produces the lean production image.",
    },
    {
      question:
        "A single-stage image of a TS app is 1.12GB and the multi-stage version is 152MB. Where did most of the difference go?",
      options: [
        "Alpine compresses layers better in multi-stage mode",
        "devDependencies, the full source tree, and build caches that were never copied into the final stage",
        "The multi-stage build strips debug symbols from Node",
        "docker images reports multi-stage sizes after gzip",
      ],
      answerIndex: 1,
      explain:
        "The bulk is node_modules with devDependencies (typescript, jest, eslint and friends), the source tree, and npm's cache — all of which live only in the discarded build stage. The final image is essentially node:22-alpine plus prod deps plus dist/.",
    },
  ],
};

export default lesson;
