import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "slim-and-secure-images",
  title: "Slim & Secure: Image Best Practices",
  part: "Building Images",
  estMinutes: 12,
  summary:
    "The image-hardening checklist interviewers love: minimal pinned base images, a non-root USER, COPY over ADD, one process per container, and never baking secrets into layers — because layers remember everything.",

  concept: `
An image is a full server snapshot, so it deserves the same hardening you'd
apply to a server — except now the hardening is a handful of Dockerfile lines
you can review in a pull request instead of a checklist someone forgot to run
over SSH. This section is a sweep of the practices that come up in almost every
container interview.

### Choose a minimal base — and know the trade-offs

- **\`node:22\`** (Debian-based, ~1GB): everything works, including native modules; big.
- **\`node:22-slim\`** (Debian minus extras): good middle ground; apt available if you need a package.
- **\`node:22-alpine\`** (~130MB): small and popular; uses musl libc instead of glibc, which very occasionally breaks native modules — test before committing.
- **Distroless** (e.g. Google's \`gcr.io/distroless/nodejs\`): no shell, no package manager, nothing but the runtime. Smallest attack surface, but you can't \`exec\` in with \`sh\` to debug.

The honest interview answer: default to \`slim\` or \`alpine\`, reach for
distroless when security requirements justify the debugging friction.

### Pin your base image

\`\`\`bash
FROM node            # never: floating "latest", rebuilds change under you
FROM node:22         # better: major pinned
FROM node:22-alpine  # good: major + variant
FROM node:22-alpine@sha256:9f8e3b...  # strictest: exact digest
\`\`\`

A bare \`FROM node\` means two builds a month apart can produce different images
from the same Dockerfile — the reproducibility you adopted Docker for, quietly
gone. Pin at least the major version; security-sensitive teams pin the digest
and update it deliberately.

### Run as a non-root user

By default your process runs as **root inside the container**. Container
isolation is good but not a security boundary you should bet on — a container
escape from root is far worse than from an unprivileged user. The official Node
images ship a \`node\` user for exactly this:

\`\`\`bash
# Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node dist/ ./dist
USER node
CMD ["node", "dist/server.js"]
\`\`\`

After \`USER node\`, every subsequent instruction and the running container
itself run unprivileged. It's the same instinct as never running Apache as
root — you just declare it once instead of auditing it forever.

### COPY, not ADD

\`ADD\` has magic behaviours: it auto-extracts local tar archives and can fetch
URLs. Magic in a build is a liability — a "copied" tarball silently exploding
into the filesystem, or a build reaching out to the network. \`COPY\` does one
predictable thing. Use \`COPY\` unless you specifically want tar extraction.

### One process per container

Resist the urge to rebuild your old LAMP box as one mega-container running
Apache + PHP-FPM + MySQL + cron under supervisord. One process per container
means each piece is independently restartable, scalable, and log-streamable —
and it's the assumption every orchestrator (Compose, Kubernetes) is built on.
The database gets its own container; cron becomes a scheduled job.

### Layers remember: never bake secrets

This is the one that bites people. Every instruction creates a layer, and
**deleting a file in a later layer does not remove it from the earlier one**:

\`\`\`bash
COPY secrets.env /app/          # layer N contains the secret
RUN rm /app/secrets.env         # layer N+1 hides it — but layer N still ships
\`\`\`

Anyone who pulls the image can read the secret straight out of layer N.
\`docker history myapp:1.0\` shows every instruction and the size it added —
your first stop when auditing what an image actually contains. Secrets belong
in **runtime injection**: \`-e\`/\`--env-file\` on \`docker run\`, Compose
\`environment:\`, or your platform's secret store — never in \`COPY\`, \`ENV\`,
or \`ARG\` values that end up in layers.

### Scanning — know the names

Registries and CI pipelines scan images against CVE databases. \`docker scout\`
is Docker's built-in scanner; **Trivy** is the popular open-source one. You
don't need depth here — you need to be able to say "our pipeline scans images
with Trivy and fails the build on critical CVEs" without blinking.
`,

  comparisons: [
    {
      label: "Root because it's easier vs USER node",
      intro:
        "The old box ran everything as root because permissions were annoying. The Dockerfile declares an unprivileged user once, and every container from the image inherits it.",
      php: `# The old way: everything as root, it's "easier"
ssh root@prod-web-01
# apache children run as root because the
# vhost setup fought us and we gave up:
ps aux | grep apache
# root  1123  /usr/sbin/apache2 -k start
# root  1124  /usr/sbin/apache2 -k start
nano /etc/apache2/apache2.conf   # User root  <- yikes
service apache2 restart`,
      ts: `# Dockerfile — unprivileged by declaration
FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node dist/ ./dist
USER node
CMD ["node", "dist/server.js"]

# docker exec myapp whoami
# node`,
      note:
        "USER node makes non-root the default for every container ever started from this image — one reviewed line instead of a server-hardening step someone can skip.",
      rightLang: "bash",
    },
    {
      label: "Config with a password baked in vs runtime injection",
      intro:
        "Both apps need a database password. One bakes it into an image layer forever; the other injects it when the container starts.",
      php: `# Dockerfile.bad — the secret is in the image
FROM node:22-alpine
WORKDIR /app
ADD config.prod.json /app/config.json
#   ^ contains "dbPassword": "s3cretPass!"
RUN npm ci --omit=dev
COPY dist/ ./dist
RUN rm /app/config.json   # too late: it's in
CMD ["node", "dist/server.js"]  # an earlier layer`,
      ts: `# Dockerfile — image is secret-free
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist
USER node
CMD ["node", "dist/server.js"]

# Secret arrives at RUN time, not build time:
docker run -d --env-file prod.env myapp:1.0
# or in compose.yaml: environment: / env_file:`,
      note:
        "Layers are immutable — rm in a later layer hides the file from the final filesystem but ships the earlier layer intact, readable by anyone who pulls the image.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Floating base vs pinned base",
      intro:
        "Two Dockerfiles, same intent. One produces a different image depending on the day you build it; the other is reproducible.",
      php: `# Dockerfile — floating tags
FROM node
# whatever "latest" means today: could be
# Node 23, 24... rebuild next month and your
# app is on a different major version.
COPY . .
RUN npm install     # unpinned deps too
CMD ["node", "server.js"]`,
      ts: `# Dockerfile — pinned and reproducible
FROM node:22-alpine
# stricter still, pin the exact digest:
# FROM node:22-alpine@sha256:9f8e3b1c...
COPY package*.json ./
RUN npm ci          # lockfile-exact installs
COPY . .
CMD ["node", "server.js"]`,
      note:
        "Pinning the tag (or digest) plus npm ci against the lockfile means the same Dockerfile builds the same image next month — upgrades become deliberate diffs instead of surprises.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Someone shipped a sloppy image. Read the `docker history` transcript bottom-up (oldest layer at the bottom). Predict: which instruction leaked a secret into a layer that still ships, and which instruction created the biggest layer?",
    code: `# Audit what each layer of the image actually added:
docker history myapp:1.0

# Then confirm the secret is really gone from the *current*
# filesystem (but not from the layer that added it):
docker run --rm myapp:1.0 ls /app/secrets.env`,
    output: `$ docker history myapp:1.0
IMAGE          CREATED BY                                      SIZE
a1b2c3d4e5f6   CMD ["node" "dist/server.js"]                   0B
<missing>      RUN rm /app/secrets.env                         0B
<missing>      COPY secrets.env /app/secrets.env               412B
<missing>      RUN npm run build                               38.1MB
<missing>      COPY . .                                        2.3MB
<missing>      RUN npm install                                 693MB
<missing>      COPY package*.json ./                           4.2kB
<missing>      WORKDIR /app                                    0B
<missing>      /bin/sh -c #(nop) FROM node:22-alpine           128MB

$ docker run --rm myapp:1.0 ls /app/secrets.env
ls: /app/secrets.env: No such file or directory

# The file is gone from the final filesystem — but the
# "COPY secrets.env" layer (412B) still ships with the image
# and anyone who pulls it can extract the secret from that
# layer. The rm layer added 0B: it only masks the file.
# Biggest layer: RUN npm install at 693MB — devDependencies
# included, since this single-stage build never pruned them.`,
  },

  keyPoints: [
    "Base image trade-offs: `slim` is the safe default, `alpine` is smaller but uses musl (test native modules), distroless is smallest but has no shell for debugging.",
    "Never write a bare `FROM node` — pin at least the major version (`node:22-alpine`), or the exact `@sha256:` digest for strict reproducibility.",
    "Containers run as root by default; add `USER node` (the official images ship the user) so a compromise lands in an unprivileged account.",
    "Prefer `COPY` over `ADD` — `ADD`'s auto-tar-extraction and URL fetching are surprises you don't want in a build.",
    "Layers are immutable: a secret `COPY`ed in and `rm`-ed later still ships in the earlier layer — inject secrets at runtime (`--env-file`, Compose `environment:`) instead.",
    "`docker history <image>` shows what each instruction added and is your audit tool; `docker scout` and Trivy scan images for CVEs in CI.",
  ],

  interview: [
    {
      q: "Walk me through how you harden a Docker image for production.",
      a: "Start with the base: a pinned, minimal image — `node:22-alpine` or `-slim`, never a bare floating tag, and a digest pin if the team wants strict reproducibility. Multi-stage build so no compilers, devDependencies, or source ship. Add `USER node` so the process isn't root — container isolation shouldn't be the only thing between a compromised app and the host. `COPY` instead of `ADD` to keep builds predictable. Secrets never go into layers — they're injected at runtime via environment or a secret store, because a file deleted in a later layer still ships in the earlier one. Finally, the pipeline scans the image — Trivy or docker scout — and fails on critical CVEs.",
    },
    {
      q: "A developer COPYed a credentials file into an image, then added `RUN rm` to delete it. Is the image safe to publish?",
      a: "No. Image layers are immutable and additive — the `COPY` created a layer containing the file, and the `rm` only adds a later layer that masks it from the final filesystem. Anyone who pulls the image can list layers with `docker history` and extract the file from the layer that added it. The fix is to rebuild without the secret ever entering a layer: pass it at runtime with `--env-file` or Compose `environment:`, or use BuildKit secret mounts if it's needed during the build. And since the image may already be in a registry, the credential itself should be rotated — treat it as leaked.",
    },
    {
      q: "Why one process per container? Your old servers ran Apache, MySQL, and cron on one box happily.",
      a: "Because the unit of scheduling, scaling, and restarting in the container world is the container. If my API, database, and cron live in one container, I can't restart the API without killing the database, can't scale them independently, and logs from three processes interleave into one stream. Splitting them means Compose or an orchestrator can health-check, restart, and scale each piece on its own — and each image stays small and single-purpose. The old box worked, but every operation on it was all-or-nothing; containers let me operate on the pieces.",
    },
  ],

  quiz: [
    {
      question:
        "An image was built with `COPY secrets.env /app/` followed later by `RUN rm /app/secrets.env`. What can someone who pulls the image do?",
      options: [
        "Nothing — the file is gone from the image",
        "Read the secret from the layer the COPY instruction created, which still ships with the image",
        "Only see the filename, not the contents",
        "Recover it only if they have the build cache",
      ],
      answerIndex: 1,
      explain:
        "Layers are immutable. The rm adds a whiteout in a later layer, hiding the file from the merged filesystem, but the COPY layer ships intact — docker history reveals it and the file can be extracted from that layer.",
    },
    {
      question: "Why is `USER node` in a Dockerfile considered important?",
      options: [
        "It makes npm install faster by skipping permission checks",
        "Containers run as root by default, and running the app unprivileged limits the damage if the process or container isolation is compromised",
        "It is required for node:alpine images to start",
        "It encrypts the container filesystem for that user",
      ],
      answerIndex: 1,
      explain:
        "Without USER, the process runs as root inside the container. Isolation helps, but defense in depth says a compromised process should hold the fewest privileges possible — the official Node images ship a `node` user for this.",
    },
    {
      question: "When is ADD actually the right choice over COPY?",
      options: [
        "When copying node_modules, because ADD is faster",
        "When you deliberately want a local tar archive auto-extracted into the image",
        "Always — ADD is the modern replacement for COPY",
        "When copying files larger than 1GB",
      ],
      answerIndex: 1,
      explain:
        "ADD's extra behaviours — auto-extracting local tarballs and fetching URLs — are the only reasons to use it, and tar extraction is the legitimate one. For plain file copies, COPY is explicit and predictable, which is why best practice says COPY by default.",
    },
    {
      question:
        "What is the main trade-off of a distroless base image versus alpine or slim?",
      options: [
        "Distroless images are larger but more compatible",
        "Distroless has no shell or package manager — smallest attack surface, but you can't exec in with sh to debug",
        "Distroless only supports Python applications",
        "Distroless images cannot be scanned for CVEs",
      ],
      answerIndex: 1,
      explain:
        "Distroless strips everything but the runtime — no shell, no package manager. That's the security appeal and the operational cost in one: nothing for an attacker, but also no `docker exec -it ... sh` when you need to poke around.",
    },
  ],
};

export default lesson;
