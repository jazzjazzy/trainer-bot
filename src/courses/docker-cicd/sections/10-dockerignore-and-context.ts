import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "dockerignore-and-context",
  title: ".dockerignore & the Build Context",
  part: "Building Images",
  estMinutes: 10,
  summary:
    "The dot in `docker build .` ships your entire directory to the builder — node_modules, .git, .env and all — unless a .dockerignore says otherwise; getting it wrong means slow builds, busted caches, and secrets baked into images.",

  concept: `
There's a detail hiding in the command you've been running all along:

\`\`\`bash
docker build -t api:dev .
\`\`\`

That trailing \`.\` is the **build context** — and Docker doesn't just "look
at" it. The client **tars up the entire directory and ships it to the
builder**. Every file. The first line of build output tells you the bill:

\`\`\`
=> => transferring context: 890.20MB
\`\`\`

890 MB, for an app whose source is a few hundred kilobytes. Where from?
\`node_modules/\` (hundreds of MB), \`.git/\` (the full history of every file
ever), \`dist/\` from local builds, logs — and \`.env\`, with your real
credentials in it.

### Three distinct failure modes

1. **Slow builds.** The whole context transfers before the first instruction
   runs — painful locally, worse with remote builders and in CI.
2. **A permanently busted cache.** \`COPY . .\` checksums everything it
   copies. \`.git\` changes on every commit; logs change constantly. Your
   carefully ordered Dockerfile still rebuilds from \`COPY . .\` every time,
   because *something* in the junk always changed.
3. **Leaked secrets.** \`COPY . .\` happily bakes \`.env\` into a layer. Anyone
   who can pull the image can read it. This is exactly the FTP-era horror of
   uploading \`config.php\` — prod DB password inside — into \`public_html\`,
   except now the file is inside an artifact you push to registries. And
   remember from the caching section: an \`rm\` in a later layer does NOT
   remove it from the earlier one.

### \`.dockerignore\` — the fix

A \`.dockerignore\` in the context root lists what to leave out, with
gitignore-style syntax you already know:

\`\`\`bash
# .dockerignore
node_modules
.git
.env
dist
*.log
Dockerfile
.dockerignore
\`\`\`

Patterns are relative to the context root; \`**\` matches any depth
(\`**/*.log\`), and \`!\` re-includes exceptions after a broader exclude. The
must-haves for a Node project and why:

- **node_modules** — huge, and rebuilt inside the image by \`npm ci\` anyway.
- **.git** — big and changes every commit (cache poison #1).
- **.env** — secrets never belong in an image; pass config at *run* time.
- \`dist\`, \`*.log\` — local build output and noise; the image builds its own.
- **Dockerfile / .dockerignore** — they're still *sent* to the builder (it
  needs them to run the build) but ignoring them keeps them out of \`COPY . .\`
  and out of your layers.

### The node_modules bug this quietly fixes

Without the ignore, \`COPY . .\` copies your **host's** \`node_modules\` over
the fresh install the image just did in \`RUN npm ci\`. Now the image contains
dependencies installed on your machine — wrong OS or architecture for native
addons (a macOS or Windows host building a Linux image), possibly a different
Node version, possibly stale. It "works on your machine" and crashes in the
container — the exact disease Docker was meant to cure, reintroduced by one
missing ignore line. With \`node_modules\` ignored, the container's own
\`npm ci\` install is the only one that exists.

### Rule of thumb

If \`git status\` would ignore it, \`.dockerignore\` probably should too — then
add \`.git\` and \`.env\` on top. Check what a build actually shipped by
watching the \`transferring context\` line: for a typical Node service it
should read kilobytes, not megabytes.
`,

  comparisons: [
    {
      label: "Uploading secrets: FTP then, COPY . . now",
      intro:
        "The same mistake, twenty years apart: a bulk 'send everything' that includes files which must never leave your machine. The right side is the two-minute fix.",
      php: `# FTP client, 'upload folder' on the project root:
ftp> mput *
local: config.php  remote: public_html/config.php
local: .git/config remote: public_html/.git/config
# config.php (prod DB password!) now web-readable if the
# server ever misconfigures .php handling — and .git/
# lets anyone download your full source history.`,
      ts: `# .dockerignore — same idea as .gitignore, for the context
node_modules
.git
.env
dist
*.log
Dockerfile
.dockerignore

# Now COPY . . physically CANNOT bake .env or .git into
# a layer — they never reach the builder's copy of the context.`,
      note: "An image with .env in a layer leaks to anyone who can pull it — and rm in a later instruction doesn't un-ship it. Exclusion at the context boundary is the only reliable fix.",
      rightLang: "bash",
    },
    {
      label: "The transferring-context line, before and after",
      intro:
        "Same project, same Dockerfile — the only change is adding a .dockerignore. Watch the first lines of build output and the fate of the COPY layer.",
      php: `$ docker build -t api:dev .
 => [internal] load build context                   14.8s
 => => transferring context: 890.20MB               14.6s
 => CACHED [3/6] COPY package*.json ./
 => CACHED [4/6] RUN npm ci
 => [5/6] COPY . .                                   3.9s
# 890MB shipped: node_modules, .git, dist, logs.
# And COPY . . misses the cache on EVERY build,
# because .git changed since the last commit.`,
      ts: `$ docker build -t api:dev .
 => [internal] load build context                    0.0s
 => => transferring context: 2.1kB                   0.0s
 => CACHED [3/6] COPY package*.json ./
 => CACHED [4/6] RUN npm ci
 => CACHED [5/6] COPY . .
# 2.1kB: just source files. With the junk excluded,
# COPY . . only misses when actual source changes.`,
      note: "The .dockerignore pays twice: the context transfer drops from 890MB to kilobytes, and COPY . . becomes an honest cache key over your real source instead of being busted by .git churn.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Two builds with NO source changes between them — the only edit is creating .dockerignore. Predict both transferring-context sizes, and whether COPY . . is CACHED in build #2 (careful: the files COPY sees have changed set membership...).",
    code: `# Build #1 — no .dockerignore, straight after a git commit:
docker build -t api:dev .

# Create the ignore file:
cat > .dockerignore << 'EOF'
node_modules
.git
.env
dist
*.log
Dockerfile
.dockerignore
EOF

# Build #2 — zero source changes, same Dockerfile:
docker build -t api:dev .

# Build #3 — pure git activity that writes only inside .git
# (README.md is still in the context, so editing IT would bust the cache):
git fetch origin && git tag v1.4.2 && docker build -t api:dev .`,
    output: `$ docker build -t api:dev .
[+] Building 24.1s (12/12) FINISHED
 => [internal] load build context                                 14.8s
 => => transferring context: 890.20MB                             14.6s
 => CACHED [3/6] COPY package*.json ./
 => CACHED [4/6] RUN npm ci
 => [5/6] COPY . .                                                 3.9s
 => [6/6] RUN npm run build                                        4.6s

$ cat > .dockerignore << 'EOF'
...
EOF

$ docker build -t api:dev .
[+] Building 5.4s (12/12) FINISHED
 => [internal] load build context                                  0.0s
 => => transferring context: 2.1kB                                 0.0s
 => CACHED [3/6] COPY package*.json ./
 => CACHED [4/6] RUN npm ci
 => [5/6] COPY . .                                                 0.1s
 => [6/6] RUN npm run build                                        4.6s

$ git fetch origin && git tag v1.4.2 && docker build -t api:dev .
[+] Building 0.9s (12/12) FINISHED
 => [internal] load build context                                  0.0s
 => => transferring context: 2.1kB                                 0.0s
 => CACHED [3/6] COPY package*.json ./
 => CACHED [4/6] RUN npm ci
 => CACHED [5/6] COPY . .
 => CACHED [6/6] RUN npm run build

# Build #2: context collapses 890MB -> 2.1kB, but COPY . . still
# re-runs ONCE — the set of files it copies changed (node_modules,
# .git, dist vanished), so its checksum changed.
# Build #3 is the payoff: fetching and tagging write only inside .git,
# which is now excluded, so COPY . . sees the identical 2.1kB file set
# and the whole build is CACHED. Before .dockerignore, every fetch,
# tag, or commit busted this layer via .git churn. (Editing a file that
# IS still in the context — src/, or README.md — would correctly
# invalidate COPY . . and everything below it.)`,
  },

  keyPoints: [
    "`docker build .` tars the ENTIRE directory and ships it to the builder — the `transferring context` line in the output is your bill.",
    "An oversized context hurts three ways: slow transfers, a `COPY . .` cache busted by junk churn (especially `.git`), and secrets like `.env` baked into pullable image layers.",
    ".dockerignore uses gitignore-style patterns (relative to context root, `**` for depth, `!` for exceptions) and lives next to the Dockerfile at the context root.",
    "Must-have entries for a Node project: `node_modules`, `.git`, `.env`, `dist`, `*.log`, plus `Dockerfile` and `.dockerignore` themselves (still sent to the builder, but kept out of COPY).",
    "Ignoring `node_modules` also fixes the classic bug where `COPY . .` overwrites the container's fresh `npm ci` install with host-built modules (wrong OS/arch for native addons).",
    "Rule of thumb: whatever `.gitignore` excludes, `.dockerignore` should too — then add `.git` and `.env` on top.",
  ],

  interview: [
    {
      q: "What is the build context, and why does it matter what's in it?",
      a: "The context is the directory you pass to `docker build` — and the client doesn't browse it lazily, it tars the whole thing and sends it to the builder before any instruction runs. That matters three ways. Performance: an unignored node_modules or .git can push the transfer to hundreds of megabytes per build. Caching: `COPY . .` is keyed on the checksums of everything it copies, so junk that changes constantly — .git on every commit — busts the layer every build no matter how well the Dockerfile is ordered. Security: `COPY . .` will happily bake a .env into a layer, and anyone who can pull the image can extract it — deleting it in a later instruction doesn't help because layers are additive. The fix for all three is the same .dockerignore.",
    },
    {
      q: "What goes in a .dockerignore for a typical Node project, and why each entry?",
      a: "node_modules — it's huge and the image builds its own with npm ci, plus copying the host's install over the container's is a real bug: native addons compiled for the wrong OS or architecture. .git — large and changes every commit, so it's the number-one cache poisoner of COPY . . . .env — secrets must never enter an image layer; config belongs at run time. dist and *.log — local build output and noise. And Dockerfile plus .dockerignore themselves: they're still transferred to the builder because the build needs them, but ignoring them keeps them out of COPY and out of the image. My rule of thumb is: start from what .gitignore already excludes, then add .git and .env on top.",
    },
    {
      q: "An image works on the developer's Mac but crashes in production with a native-module error. The Dockerfile runs npm ci. What would you check first?",
      a: "Whether node_modules is in .dockerignore — my bet is it isn't. The Dockerfile does the right thing: npm ci installs Linux-correct dependencies inside the image. But then COPY . . runs, and without the ignore entry it copies the developer's macOS-built node_modules from the context right over that fresh install. Native addons like bcrypt or sharp are compiled per-platform, so the container ends up executing darwin-arm64 binaries on Linux and crashes. One line — node_modules — in .dockerignore fixes it, and as a bonus shrinks the context transfer by a few hundred megabytes.",
    },
  ],

  quiz: [
    {
      question: "What does the `.` in `docker build -t api:dev .` actually cause to happen?",
      options: [
        "Docker reads only the files referenced by COPY instructions",
        "The entire directory is tarred and sent to the builder as the build context",
        "Docker watches the directory for changes during the build",
        "It sets the WORKDIR inside the image to the current directory",
      ],
      answerIndex: 1,
      explain:
        "The context is shipped wholesale before the first instruction runs — that's the 'transferring context' line. COPY can only reference files from that transferred context, which is why excluding junk with .dockerignore shrinks and speeds up every build.",
    },
    {
      question:
        "Why is having .git in the build context a caching problem, even with a perfectly ordered Dockerfile?",
      options: [
        "Git locks files so COPY fails intermittently",
        ".git makes the base image layer rebuild",
        "COPY . . includes .git in its checksum, and .git changes on every commit — so that layer misses the cache every build",
        "BuildKit refuses to cache contexts over 100MB",
      ],
      answerIndex: 2,
      explain:
        "COPY's cache key is the content checksum of everything it copies. .git churns constantly (every commit, fetch, or branch switch), so COPY . . — and everything below it — rebuilds each time. Ignore .git and the layer only misses when real source changes.",
    },
    {
      question:
        "A .env with production credentials was COPY'd into an image that's been pushed to a registry. Adding `RUN rm .env` and pushing a new build — does that contain the leak?",
      options: [
        "Yes — the file is gone from the new image",
        "Yes, as long as the new image gets the same tag",
        "No — layers are additive, the file still exists in the earlier layer, and the previously pushed image is still pullable; the credentials must be rotated",
        "No, but only because registries keep backups",
      ],
      answerIndex: 2,
      explain:
        "An rm in a later layer only hides the file; the bytes remain in the layer that copied it, extractable by anyone who pulls it — and the old image is still in the registry regardless. Treat the credentials as compromised and rotate them; prevent recurrence with .env in .dockerignore.",
    },
  ],
};

export default lesson;
