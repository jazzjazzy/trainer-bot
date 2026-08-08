import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "layers-and-caching",
  title: "Layers & Build Cache: Order Matters",
  part: "Building Images",
  estMinutes: 12,
  summary:
    "Every Dockerfile instruction creates a layer; BuildKit reuses cached layers top-down until the first change, then rebuilds everything below — so instruction order is the difference between a 2-second and a 2-minute build.",

  concept: `
Here's the mental model that separates people who write Dockerfiles from
people who understand them: **an image is a stack of layers, and the build
cache reuses that stack top-down until the first thing that changed.**

### Instructions create layers

Each filesystem-changing instruction — \`FROM\`, \`COPY\`, \`ADD\`, \`RUN\` —
produces a **layer**: an immutable diff on top of everything before it.
(\`ENV\`, \`EXPOSE\`, \`CMD\` and friends only touch metadata — no layer.) The
final image is the stack, and layers are content-addressed — which is why
registries can skip pushing layers they already have.

### How the cache decides

BuildKit — the default builder in modern Docker — walks the Dockerfile from
the top asking, for each instruction: *can I reuse the layer from last time?*

- For \`RUN\`: yes, if the instruction string is unchanged **and** every layer
  above it was reused.
- For \`COPY\`/\`ADD\`: additionally, the **checksums of the copied files** must
  match. Contents matter, not timestamps.

The critical rule: **the first cache miss invalidates everything below it.**
Layers stack, so once one changes, every later layer must be rebuilt on top
of the new base. There is no cherry-picking.

### THE classic: manifests before source

This is why the Node Dockerfile copies \`package*.json\` before the source:

\`\`\`bash
COPY package*.json ./   # changes rarely
RUN npm ci              # expensive — 60s+
COPY . .                # changes on EVERY commit
RUN npm run build       # cheap-ish
\`\`\`

Edit \`src/index.ts\` and rebuild: the manifests are byte-identical, so their
COPY layer is reused — and so is the \`npm ci\` layer above the change. The
rebuild starts at \`COPY . .\`. Now imagine the naive ordering, \`COPY . .\`
first and then \`npm ci\`: *any* source edit checksums differently,
invalidates the COPY, and drags a full dependency reinstall behind it. Same
instructions, same image — one builds in 2 seconds, the other in 2 minutes,
on every single commit.

The principle: **order instructions from least-changing to most-changing.**
Base image, then system packages, then dependency manifests + install, then
your code.

### Why \`apt-get update && install\` must be one RUN

\`\`\`bash
# WRONG — two layers, cached independently
RUN apt-get update
RUN apt-get install -y curl

# RIGHT — one layer, always consistent
RUN apt-get update && apt-get install -y curl \\
    && rm -rf /var/lib/apt/lists/*
\`\`\`

Split them and the \`update\` layer gets cached forever — months later you add
a package to the \`install\` line, only *that* layer rebuilds, and it installs
from a stale, cached package list: broken or ancient versions. Combining them
means updating the list and installing are always consistent. The trailing
\`rm\` matters for a related reason: **layers are additive**. Deleting files in
a *later* instruction hides them but shrinks nothing — the bytes live on in
the earlier layer. Cleanup only helps inside the same RUN that created the
mess.

### The FTP flashback

You've lived the no-cache world: you couldn't tell which files changed, so
you re-uploaded the whole site and waited 25 minutes. A well-ordered
Dockerfile is the opposite — the machine knows exactly what changed, reuses
everything above it, and rebuilds only what it must. But that only works if
*you* put the volatile things at the bottom.
`,

  comparisons: [
    {
      label: "Re-upload everything vs rebuild only what changed",
      intro:
        "One CSS-sized change needs to ship. The left is the FTP ritual you remember; the right is a rebuild where the cache proves what didn't change.",
      php: `# One file changed. Which one? Who knows. Upload it all.
ftp ftp.acme.com
ftp> cd public_html
ftp> prompt off
ftp> mput *
# 4,000 files, 25 minutes, and if the connection drops
# at file 2,741 the site is half old, half new.`,
      ts: `# Same one-file change, well-ordered Dockerfile:
$ docker build -t api:dev .
 => CACHED [2/6] WORKDIR /app
 => CACHED [3/6] COPY package*.json ./
 => CACHED [4/6] RUN npm ci
 => [5/6] COPY . .                        0.1s
 => [6/6] RUN npm run build               4.6s
# 5 seconds. The checksums prove the manifests didn't
# change, so the 60-second npm ci never re-runs.`,
      note: "FTP made YOU the change-detection system, so you gave up and shipped everything; the build cache does change detection by content checksum and reuses every layer above the first difference.",
      rightLang: "bash",
    },
    {
      label: "Badly ordered vs well ordered",
      intro:
        "Two Dockerfiles producing the identical image. The only difference is instruction order — and what a one-line source edit costs you at build time.",
      php: `# Dockerfile — naive order
FROM node:22-alpine
WORKDIR /app
COPY . .              # <- source changes EVERY commit...
RUN npm ci            # <- ...so this re-runs every commit
RUN npm run build
CMD ["node", "dist/server.js"]
# Every edit to any file: full npm ci. ~2 min per build.`,
      ts: `# Dockerfile — cache-friendly order
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./ # <- changes only when deps change
RUN npm ci            # <- cached until the line above misses
COPY . .              # <- the volatile stuff, last
RUN npm run build
CMD ["node", "dist/server.js"]
# Source edit: manifests identical, npm ci CACHED. ~5s.`,
      note: "Identical final image either way — the ordering only changes what the cache can reuse. Least-changing at the top, most-changing at the bottom.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "apt-get: two RUNs vs one",
      intro:
        "Install a system package in a Debian-based image. Splitting update and install into separate instructions plants a time bomb in the cache.",
      php: `# Two layers, cached independently
RUN apt-get update
RUN apt-get install -y curl

# Months later you append: install -y curl jq
# -> only the install layer rebuilds, against the
#    STALE cached package list -> 404s / old versions`,
      ts: `# One layer: list update and install always consistent
RUN apt-get update && apt-get install -y \\
    curl \\
    jq \\
    && rm -rf /var/lib/apt/lists/*

# The rm shrinks the layer — cleanup only counts
# in the SAME RUN, because layers are additive.`,
      note: "A changed install line re-runs with a months-old package list if update was its own cached layer; and deleting files in a later layer hides them without reclaiming a single byte.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Two consecutive builds; between them, only src/index.ts is edited. Predict per step: CACHED or re-run? Remember the two rules — COPY compares content checksums, and the first miss invalidates everything below.",
    code: `# Dockerfile being built:
#   FROM node:22-alpine
#   WORKDIR /app
#   COPY package*.json ./
#   RUN npm ci
#   COPY . .
#   RUN npm run build

# Build #1 (fresh, nothing cached):
docker build -t api:dev .

# Edit ONE source file:
#   (change a string in src/index.ts — package.json untouched)

# Build #2 — which steps print CACHED?
docker build -t api:dev .`,
    output: `$ docker build -t api:dev .
[+] Building 19.3s (12/12) FINISHED
 => [1/6] FROM docker.io/library/node:22-alpine@sha256:2c3f34d2   3.1s
 => [2/6] WORKDIR /app                                            0.0s
 => [3/6] COPY package*.json ./                                   0.0s
 => [4/6] RUN npm ci                                              9.8s
 => [5/6] COPY . .                                                0.1s
 => [6/6] RUN npm run build                                       4.7s
 => exporting to image                                            0.4s

# ... edit src/index.ts, rebuild ...

$ docker build -t api:dev .
[+] Building 5.2s (12/12) FINISHED
 => [1/6] FROM docker.io/library/node:22-alpine@sha256:2c3f34d2   0.0s
 => CACHED [2/6] WORKDIR /app                                     0.0s
 => CACHED [3/6] COPY package*.json ./                            0.0s
 => CACHED [4/6] RUN npm ci                                       0.0s
 => [5/6] COPY . .                                                0.1s
 => [6/6] RUN npm run build                                       4.6s
 => exporting to image                                            0.4s

# Steps 1-4 reused: package*.json checksums are identical, so the
# expensive npm ci never re-ran. Step 5 is the first miss — src/index.ts
# has a new checksum — and step 6 rebuilds because everything below the
# first miss always rebuilds. 19s down to 5s.`,
  },

  keyPoints: [
    "Filesystem-changing instructions (FROM, COPY, ADD, RUN) each create an immutable layer; metadata instructions (ENV, EXPOSE, CMD) don't.",
    "BuildKit reuses a cached layer when the instruction is unchanged, all layers above were reused, and — for COPY/ADD — the copied files' checksums match.",
    "The first cache miss invalidates every layer below it; there is no partial reuse further down.",
    "Order least-changing to most-changing: base image → system packages → dependency manifests + install → source code. That's why `COPY package*.json` + `RUN npm ci` come before `COPY . .`.",
    "`apt-get update && apt-get install -y ... && rm -rf /var/lib/apt/lists/*` belongs in ONE RUN: split, the stale cached update layer poisons future installs.",
    "Layers are additive — deleting files in a later layer hides them but frees nothing; cleanup only shrinks the image inside the same RUN.",
  ],

  interview: [
    {
      q: "Explain how Docker's build cache works and how you structure a Dockerfile to exploit it.",
      a: "Every filesystem-changing instruction produces a layer, and BuildKit walks the Dockerfile top-down deciding whether each layer can be reused: a RUN is reused if the instruction text is unchanged and everything above it was cached; COPY additionally checksums the copied files. The moment one instruction misses, everything below it rebuilds — layers stack, so there's no reuse past the first change. So I order instructions from least- to most-volatile: base image, system packages, then dependency manifests and the install, and only then the application source. In a Node app that's COPY package*.json + npm ci before COPY . . — a source edit then rebuilds in seconds because the dependency layer is a cache hit. Get the order wrong and every commit pays for a full reinstall.",
    },
    {
      q: "Why should apt-get update and apt-get install be combined in a single RUN instruction?",
      a: "Because they're cached as separate layers if split. The `apt-get update` layer gets cached once and essentially never invalidates — its instruction text never changes. Months later someone adds a package to the install line; only that layer rebuilds, and it installs against the stale package list frozen in the cached update layer — you get 404s on packages or silently ancient versions. Combined into one RUN, changing the package list re-runs the update too, so they're always consistent. I also chain `rm -rf /var/lib/apt/lists/*` in the same RUN — layers are additive, so cleanup in a later instruction wouldn't reclaim any space.",
    },
    {
      q: "You add `RUN rm -rf /tmp/build-artifacts` at the end of a Dockerfile but the image doesn't get smaller. Why?",
      a: "Because layers are additive diffs — an image is the whole stack, and a delete in a later layer is just a whiteout marker hiding the files, not removing them. The bytes still ship in the earlier layer that created them; anyone can pull the image and read them from that layer, which also makes this a security issue if the 'deleted' files were secrets. To actually keep artifacts out you either clean up in the same RUN that produced them, or — the better structural answer — use a multi-stage build so build-time junk never enters the final image at all.",
    },
  ],

  quiz: [
    {
      question:
        "A Dockerfile has COPY package*.json → RUN npm ci → COPY . . → RUN npm run build. You edit only src/index.ts and rebuild. What happens?",
      options: [
        "Everything rebuilds — any file change invalidates the whole cache",
        "Steps through npm ci are CACHED; the rebuild starts at COPY . . and npm run build re-runs",
        "Only npm run build re-runs; both COPY steps are cached",
        "Nothing rebuilds — Docker sees the same Dockerfile and reuses the image",
      ],
      answerIndex: 1,
      explain:
        "The manifests are byte-identical so their COPY layer — and npm ci above the change — are reused. COPY . . is the first miss (src/index.ts checksums differently), and everything below the first miss, including the build step, must re-run.",
    },
    {
      question: "Why is `RUN apt-get update` followed by a separate `RUN apt-get install -y curl` a bug waiting to happen?",
      options: [
        "Two RUN instructions make the image twice as large",
        "apt-get update can't run without install in the same shell",
        "The cached update layer goes stale; a later change to the install line runs against an old package list",
        "BuildKit refuses to cache apt-get commands",
      ],
      answerIndex: 2,
      explain:
        "The update layer's instruction text never changes, so it stays cached indefinitely. Editing the install line rebuilds only that layer — installing from the frozen, stale package list. One combined RUN keeps update and install atomically consistent.",
    },
    {
      question: "For a COPY instruction, what determines a cache hit?",
      options: [
        "The file modification timestamps",
        "The checksums of the copied files (plus all earlier layers being cache hits)",
        "The size of the build context",
        "Whether the destination path already exists in the image",
      ],
      answerIndex: 1,
      explain:
        "COPY compares content checksums of the files being copied — timestamps are irrelevant. And like every instruction, it can only hit if every layer above it was also reused; the first miss anywhere invalidates all below.",
    },
  ],
};

export default lesson;
