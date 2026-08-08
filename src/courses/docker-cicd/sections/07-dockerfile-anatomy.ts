import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "dockerfile-anatomy",
  title: "Dockerfile Anatomy: A Node/TS App",
  part: "Building Images",
  estMinutes: 12,
  summary:
    "A Dockerfile is your old SSH setup session written down as code: every instruction is a command you used to type by hand, and the result is a reproducible image instead of a hand-configured server.",

  concept: `
Think back to setting up a new VPS: SSH in, install Node, clone the repo,
\`npm install\`, start the process, and hope you wrote down what you did. A
**Dockerfile** is that session, scripted — every instruction is a command
you'd have typed, and \`docker build\` replays it into an image, identically,
every time, on any machine.

Here is a complete, clean Dockerfile for a small Node/TS API. We'll walk
every line:

\`\`\`bash
# Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
\`\`\`

### FROM — the machine you start with

\`FROM node:22-alpine\` is "give me a fresh box that already has Node 22". The
\`alpine\` variant is a minimal Linux base — a few MB instead of hundreds.
Every Dockerfile starts with FROM; it's the layer everything else stacks on.

### WORKDIR — cd, but it creates the directory

\`WORKDIR /app\` creates \`/app\` if needed and makes it the working directory
for every following instruction. Prefer it over \`RUN mkdir\` + \`cd\` chains —
\`cd\` in a RUN doesn't persist to the next instruction anyway.

### COPY package*.json, then RUN npm ci, THEN copy the rest

This ordering looks odd until you know builds are cached per instruction
(next section's whole story). Copying only the manifests first means the
expensive \`npm ci\` step can be reused when only source code changed.
\`npm ci\` (not \`npm install\`) installs *exactly* what the lockfile says —
deterministic, faster, and it fails loudly if \`package.json\` and the lock
disagree. In an image build you always want the lockfile's truth.

### RUN — executes at BUILD time

\`RUN npm run build\` compiles the TypeScript *while building the image*. The
compiled \`dist/\` is baked into a layer. RUN is for setup; nothing here runs
when the container starts.

### EXPOSE — documentation only

\`EXPOSE 3000\` publishes **nothing**. It's metadata: "this app intends to
listen on 3000". You still need \`docker run -p 3000:3000\` to map a host
port (or \`-P\` to auto-publish all exposed ports). Think of it as the comment
in your old firewall config, not the firewall rule itself.

### CMD vs ENTRYPOINT, exec form vs shell form

\`CMD\` is the default command when the container starts — the replacement for
\`nohup node server.js &\` in \`rc.local\`. Two related knobs:

- **CMD** — the default command; anything after \`docker run image ...\`
  replaces it entirely.
- **ENTRYPOINT** — the fixed executable; CMD then supplies default *arguments*
  to it. Use ENTRYPOINT when the container should always run one program
  (e.g. a CLI tool) and users only vary the flags.

And two syntaxes:

\`\`\`bash
CMD ["node", "dist/server.js"]   # exec form — JSON array
CMD node dist/server.js          # shell form — wrapped in /bin/sh -c
\`\`\`

Always prefer **exec form**. Shell form makes \`sh\` PID 1 and your app its
child — \`docker stop\` sends SIGTERM to \`sh\`, which doesn't forward it, so
your app never gets a graceful shutdown and gets SIGKILLed after the 10-second
timeout. Exec form makes \`node\` itself PID 1: it receives SIGTERM, closes
connections, and exits cleanly. In a container there is no systemd, no
Apache parent process — your CMD **is** the init process.

### What you get

\`docker build -t api:dev .\` turns those eight lines into an image. The same
file in the repo means every developer, every CI runner, and every server
builds the identical environment — the end of "works on the box I set up
by hand in 2019 and am afraid to touch".
`,

  comparisons: [
    {
      label: "Provisioning by hand vs provisioning as code",
      intro:
        "Stand up the Node API somewhere it can run. The left side is the SSH session you've done a hundred times; the right is the same session written down as a Dockerfile.",
      php: `# SSH into the VPS and set it up by hand (again)
ssh deploy@vps-203
sudo apt-get update && sudo apt-get install -y nodejs npm git
cd /var/www
git clone git@github.com:acme/api.git && cd api
npm install
npm run build
node dist/server.js &
# Undocumented. Unrepeatable. Node version = whatever apt had.
# Six months later: "how was this box set up?" Nobody knows.`,
      ts: `# Dockerfile — the same session, as code in the repo
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]`,
      note: "Line for line it's the same work — get Node, get the code, install, build, run — but the Dockerfile version is reviewed in git, pins Node 22 exactly, and rebuilds identically anywhere.",
      rightLang: "bash",
    },
    {
      label: "Keeping the process alive: rc.local vs CMD as PID 1",
      intro:
        "Make the API start with the machine and restart when it dies. The old way bolts it onto boot scripts; the container way makes the process the container's entire reason to exist.",
      php: `# /etc/rc.local — the classic 'keep it running' hack
nohup node /var/www/api/dist/server.js \\
  > /var/log/api.log 2>&1 &
# Crashes? Stays down until someone notices.
# Reboot order, log rotation, which user it runs as:
# all somebody's manual problem.`,
      ts: `# In the Dockerfile — exec form, so node IS PID 1:
CMD ["node", "dist/server.js"]

# At runtime, the platform supervises the container:
docker run -d -p 3000:3000 --restart unless-stopped api:dev
# crash -> Docker restarts it; docker stop -> node gets
# SIGTERM and shuts down gracefully; logs -> docker logs`,
      note: "The container flips the model: instead of a process hiding among dozens on a shared box, the process IS the container — supervision, restarts, and logs come from the runtime, not from rc.local folklore.",
      rightLang: "bash",
    },
    {
      label: "Shell form vs exec form",
      intro:
        "Two ways to write the same CMD. One of them silently breaks graceful shutdown — run docker stop against each and watch the timing.",
      php: `# Shell form: CMD gets wrapped in /bin/sh -c
CMD node dist/server.js

# Inside the container:
#   PID 1: /bin/sh -c node dist/server.js
#   PID 7: node dist/server.js
# docker stop -> SIGTERM to sh -> not forwarded to node
# -> 10s timeout -> SIGKILL. No graceful shutdown, ever.`,
      ts: `# Exec form: JSON array, no shell wrapper
CMD ["node", "dist/server.js"]

# Inside the container:
#   PID 1: node dist/server.js
# docker stop -> SIGTERM straight to node
# -> close connections, flush, exit 0. Instant, clean.`,
      note: "The only visible difference is the JSON brackets, but shell form costs you signal handling: every docker stop becomes a 10-second hang followed by a kill.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "The full Dockerfile, then its build. Predict: how many numbered steps will the build show for these 8 instructions, and why don't EXPOSE and CMD appear as steps?",
    code: `# Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]

# Build it:
#   docker build -t api:dev .`,
    output: `$ docker build -t api:dev .
[+] Building 18.6s (12/12) FINISHED
 => [internal] load build definition from Dockerfile               0.0s
 => => transferring dockerfile: 402B                               0.0s
 => [internal] load metadata for docker.io/library/node:22-alpine  0.9s
 => [internal] load .dockerignore                                  0.0s
 => => transferring context: 94B                                   0.0s
 => [1/6] FROM docker.io/library/node:22-alpine@sha256:2c3f34d2    3.1s
 => [internal] load build context                                  0.1s
 => => transferring context: 61.42kB                               0.0s
 => [2/6] WORKDIR /app                                             0.0s
 => [3/6] COPY package*.json ./                                    0.0s
 => [4/6] RUN npm ci                                               9.4s
 => [5/6] COPY . .                                                 0.1s
 => [6/6] RUN npm run build                                        4.6s
 => exporting to image                                             0.4s
 => => exporting layers                                            0.4s
 => => writing image sha256:7d1e9f2a4c6b8e0d1f3a5c7e9b2d4f6a       0.0s
 => => naming to docker.io/library/api:dev                        0.0s

# 8 instructions, but only 6 numbered steps: EXPOSE and CMD are
# metadata — they change the image's config, create no filesystem
# layer, and execute nothing at build time.
# (If package.json were missing, step [3/6] COPY would be the one
# to fail — the build never even reaches npm ci.)`,
  },

  keyPoints: [
    "A Dockerfile is the SSH setup session as code: `FROM` picks the base box, `WORKDIR` is a persistent cd, `RUN` executes at build time, `CMD` says what runs at start time.",
    "Copy `package*.json` and run `npm ci` BEFORE `COPY . .` — it lets the dependency install be cached when only source changes (the next section's core lesson).",
    "`npm ci` installs exactly what the lockfile says and fails if it disagrees with package.json — always prefer it over `npm install` in image builds.",
    "`EXPOSE` is documentation only; ports are actually published with `docker run -p host:container`.",
    "Always use exec form — `CMD [\"node\", \"dist/server.js\"]` — so your app is PID 1 and receives SIGTERM; shell form leaves `sh` as PID 1 and every stop becomes a 10s timeout plus SIGKILL.",
    "`ENTRYPOINT` fixes the executable and `CMD` supplies default arguments; for a simple service, CMD alone is enough.",
  ],

  interview: [
    {
      q: "Walk me through a basic Dockerfile for a Node service. What does each instruction do?",
      a: "`FROM node:22-alpine` picks the base image — a minimal Linux with Node preinstalled. `WORKDIR /app` creates and switches to the app directory. Then I copy `package*.json` alone and run `npm ci`, and only after that `COPY . .` and `npm run build` — that ordering means the dependency layer is cached and a source-only change doesn't reinstall node_modules. `EXPOSE 3000` documents the port, though publishing actually happens with `-p` at run time. Finally `CMD [\"node\", \"dist/server.js\"]` in exec form defines what runs when the container starts, with node as PID 1 so it receives shutdown signals. The way I think of it: it's the server-setup session I used to do over SSH, written down and replayable.",
    },
    {
      q: "What's the difference between CMD and ENTRYPOINT?",
      a: "Both define what runs at container start, but they compose differently with `docker run`. Arguments after the image name *replace* CMD entirely, while ENTRYPOINT stays fixed and any CMD or run arguments are appended to it as arguments. So for a service where users might want a different command occasionally — say `docker run api:dev sh` to poke around — CMD alone is right. For a container that IS a program, like a CLI tool where users only vary flags, ENTRYPOINT names the binary and CMD holds the default flags. And in both cases I use exec form, the JSON array, so the process runs as PID 1 without a shell wrapper eating signals.",
    },
    {
      q: "Does EXPOSE open a port? What actually makes a container reachable?",
      a: "No — EXPOSE is pure metadata, documentation that the app intends to listen on that port. Nothing is reachable from the host until you publish with `docker run -p 3000:3000` (or `-P`, which auto-publishes all EXPOSEd ports to random high host ports). It trips people up because it sounds like a firewall rule; it's closer to a comment that tooling can read. Worth adding: containers on the same Docker network can reach each other's ports directly without any publishing — `-p` is only about the host and the outside world.",
    },
    {
      q: "Why does exec form vs shell form matter for CMD?",
      a: "It decides what PID 1 is. Shell form — `CMD node server.js` — wraps the command in `/bin/sh -c`, so sh is PID 1 and node is a child. When `docker stop` sends SIGTERM, sh doesn't forward it; the app never hears it, and after the 10-second grace period Docker SIGKILLs everything. Exec form — `CMD [\"node\", \"server.js\"]` — makes node itself PID 1, so it gets SIGTERM directly and can close connections and exit cleanly. In a container there's no init system standing in for you: graceful shutdown, and therefore zero-dropped-request deploys later, starts with this one syntax choice.",
    },
  ],

  quiz: [
    {
      question: "Why does the Dockerfile COPY package*.json and run npm ci BEFORE `COPY . .`?",
      options: [
        "npm ci fails if the rest of the source is present",
        "So the dependency-install layer can be cached and reused when only source code changes",
        "Because COPY can only copy two files at a time",
        "To keep node_modules out of the final image",
      ],
      answerIndex: 1,
      explain:
        "Builds cache per instruction. If only src/ changed, the manifests are identical, so the COPY and the expensive npm ci layers are reused — the rebuild starts at COPY . . instead of reinstalling everything.",
    },
    {
      question: "What does `EXPOSE 3000` do?",
      options: [
        "Maps container port 3000 to host port 3000",
        "Opens port 3000 in the container's firewall",
        "Documents that the app listens on 3000 — actual publishing requires -p or -P at run time",
        "Makes the app listen on port 3000",
      ],
      answerIndex: 2,
      explain:
        "EXPOSE is metadata only. The app listens because its code binds port 3000; the host can reach it because docker run -p 3000:3000 publishes it. EXPOSE just records the intent (and feeds -P).",
    },
    {
      question:
        "A container defined with `CMD node dist/server.js` (shell form) takes 10 seconds to stop and drops in-flight requests. Why?",
      options: [
        "Node needs 10 seconds to flush its event loop",
        "docker stop always waits 10 seconds before doing anything",
        "The image is missing an init system like systemd",
        "PID 1 is /bin/sh, which doesn't forward SIGTERM to node — Docker waits 10s, then SIGKILLs",
      ],
      answerIndex: 3,
      explain:
        "Shell form wraps the command in /bin/sh -c, making sh PID 1. SIGTERM goes to sh and stops there; node never gets a shutdown signal. After the grace period, SIGKILL takes everything down hard. Exec form — CMD [\"node\", \"dist/server.js\"] — fixes it.",
    },
  ],
};

export default lesson;
