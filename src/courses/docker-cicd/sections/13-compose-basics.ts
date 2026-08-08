import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "compose-basics",
  title: "Docker Compose: App + Database",
  part: "Compose & Local Dev",
  estMinutes: 11,
  summary:
    "compose.yaml turns a stack of docker run commands into one declarative, reviewable file — `docker compose up -d` starts your app and its database, wired together by service name.",

  concept: `
By the time your app needs a database, plain \`docker run\` gets painful: two
long commands with port flags, env flags, and a network to connect them —
typed from memory or pasted from a README. **Docker Compose** replaces those
commands with one declarative file. Think of it as the stack you used to click
together in cPanel or MAMP — Apache here, MySQL there, versions and ports in a
control panel — except now it's a single reviewable, versionable file in the
repo.

### Get the tooling facts straight first

Interviewers use these as freshness checks:

- The CLI is **\`docker compose\`** (with a space) — a plugin that ships with
  modern Docker. The old \`docker-compose\` hyphenated binary was a separate
  Python tool; it's legacy. If a tutorial says \`docker-compose up\`, it's dated.
- The preferred filename is **\`compose.yaml\`** (\`docker-compose.yml\` still
  works and is everywhere in older repos).
- The top-level **\`version:\` key is obsolete**. The Compose Specification
  ignores it entirely. You'll see \`version: "3.8"\` at the top of countless
  older files — it's a fossil; don't write it in new ones.

### A two-service file

\`\`\`yaml
# compose.yaml
services:
  api:
    build: .
    ports:
      - "8080:3000"
    environment:
      DATABASE_URL: postgres://app:app@db:5432/appdb
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: appdb
\`\`\`

Reading it as \`docker run\` flags: \`build: .\` means "build the image from the
Dockerfile in this directory" (vs \`image:\` which pulls a prebuilt one);
\`ports: "8080:3000"\` is \`-p 8080:3000\`; \`environment:\` is \`-e\`;
\`depends_on\` controls **start order** — Compose starts \`db\` before \`api\`.
(Started isn't *ready*: Postgres may still be initialising. Healthchecks fix
that properly; for now, know that \`depends_on\` alone only orders startup.)

### Services find each other by name

The line that makes Compose click: \`db\` in that \`DATABASE_URL\` is the
**service name**, and it resolves like a hostname. Compose puts all services
on a shared project network where each service name is a DNS entry. No IP
addresses, no \`links\`, no editing \`/etc/hosts\` — the API connects to
\`db:5432\` and it just works.

### The daily driver commands

\`\`\`bash
docker compose up -d      # create & start everything, detached
docker compose ps         # what's running, ports, status
docker compose logs -f api  # follow one service's logs
docker compose down       # stop and remove containers + network
\`\`\`

\`up -d\` is idempotent: run it again after editing the file and Compose
recreates only what changed. \`down\` removes the containers and the network
but leaves named volumes (your data) alone unless you add \`-v\`.

Container names get a project prefix — the directory name by default — so
\`api\` becomes \`myapp-api-1\`. That's what you'll see in \`docker ps\` and in
log prefixes.

### Why this beats the README

The old workflow was documentation-as-instructions: "install MySQL 5.7, create
a database called appdb, set the password in config.php…" — and every new
machine executed the instructions slightly differently. \`compose.yaml\` is
documentation that **executes itself**. The file in the repo *is* the
environment; drift between "what the README says" and "what's actually running"
stops being possible.
`,

  comparisons: [
    {
      label: "README instructions vs compose.yaml",
      intro:
        "Both get a new developer to a running app-plus-database. One is prose that humans execute (differently every time); the other is a file the machine executes.",
      php: `# README.md, circa forever:
#  1. Install MySQL 5.7 (NOT 8, auth breaks)
#  2. mysql -u root -p
#     CREATE DATABASE appdb;
#     CREATE USER 'app'@'localhost' ...
#  3. Copy config.sample.php to config.php,
#     edit the DB password
#  4. Enable mod_rewrite, restart apache
sudo apt-get install mysql-server-5.7
sudo service apache2 restart
# ...and hope every step was done identically`,
      ts: `# compose.yaml
services:
  api:
    build: .
    ports:
      - "8080:3000"
    environment:
      DATABASE_URL: postgres://app:app@db:5432/appdb
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: appdb`,
      note:
        "The compose file is the setup instructions in executable form — versioned, reviewed in PRs, and incapable of being followed 'slightly differently' on each machine.",
    },
    {
      label: "Three docker run commands vs docker compose up",
      intro:
        "The same stack started by hand versus by Compose. The hand-run version needs a network created first and every flag remembered in order.",
      php: `# By hand, every time, in the right order:
docker network create app-net

docker run -d --name db --network app-net \\
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app \\
  -e POSTGRES_DB=appdb postgres:16

docker build -t myapp .
docker run -d --name api --network app-net \\
  -p 8080:3000 \\
  -e DATABASE_URL=postgres://app:app@db:5432/appdb \\
  myapp`,
      ts: `# With the compose.yaml in the repo:
docker compose up -d

# Compose creates the project network, builds
# the api image, starts db first (depends_on),
# then api — and names everything predictably.
docker compose ps
docker compose logs -f api
docker compose down   # tear it all down again`,
      note:
        "Compose is those docker run flags, declared once — up/down/ps/logs then operate on the whole stack instead of container-by-container.",
      rightLang: "bash",
    },
    {
      label: "The legacy file vs the modern file",
      intro:
        "You will inherit compose files that look like the left side. Know what's a fossil and what's current.",
      php: `# docker-compose.yml — the 2018 way
version: "3.8"        # <- obsolete, ignored now
services:
  web:
    build: .
    links:            # <- legacy: unnecessary,
      - db            #    service DNS replaced it
  db:
    image: postgres:9.6

# run with the old Python binary:
# $ docker-compose up -d`,
      ts: `# compose.yaml — the current way
services:
  api:
    build: .
    ports:
      - "8080:3000"
    depends_on:
      - db
  db:
    image: postgres:16

# run with the compose plugin (note the space):
# $ docker compose up -d`,
      note:
        "The version: key is ignored by the Compose Specification, links: is obsolete (service names resolve via DNS automatically), and docker-compose (hyphen) is the dead Python v1 binary — docker compose (space) is the plugin.",
      leftLang: "yaml",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "Read the compose.yaml, then predict before revealing: what will the two containers be named in `docker compose ps` (the project directory is `shopapi`), and which ports are reachable from your laptop's browser?",
    code: `# shopapi/compose.yaml
services:
  api:
    build: .
    ports:
      - "8080:3000"
    environment:
      DATABASE_URL: postgres://app:app@db:5432/appdb
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: appdb`,
    output: `$ docker compose up -d
[+] Running 3/3
 ✔ Network shopapi_default  Created    0.1s
 ✔ Container shopapi-db-1   Started    0.4s
 ✔ Container shopapi-api-1  Started    0.6s

$ docker compose ps
NAME            IMAGE         COMMAND                  SERVICE   STATUS         PORTS
shopapi-api-1   shopapi-api   "node dist/server.js"    api       Up 5 seconds   0.0.0.0:8080->3000/tcp
shopapi-db-1    postgres:16   "docker-entrypoint.s…"   db        Up 5 seconds   5432/tcp

# Names are <project>-<service>-<n>: shopapi-api-1, shopapi-db-1.
# db was started first (depends_on orders startup).
# From the laptop only localhost:8080 works — api's 3000 is
# published to host port 8080. Postgres shows "5432/tcp" with
# no 0.0.0.0 mapping: reachable by the api at db:5432 on the
# project network, but NOT from the host.`,
  },

  keyPoints: [
    "The CLI is `docker compose` (a plugin, with a space); the hyphenated `docker-compose` Python binary is legacy. Prefer the filename `compose.yaml`.",
    "The top-level `version:` key is obsolete and ignored by the Compose Specification — it appears in old files as a fossil; never write it in new ones.",
    "Read the file as declarative `docker run` flags: `ports:` is `-p`, `environment:` is `-e`, `build: .` builds from the local Dockerfile, `image:` pulls a prebuilt one.",
    "Services reach each other by **service name** — `db:5432` resolves over the automatic project network; no IPs, no links, no /etc/hosts.",
    "`depends_on` controls start *order*, not readiness — Postgres can be started but still initialising when the api connects.",
    "Daily commands: `up -d` (idempotent create/start), `ps`, `logs -f <service>`, `down` (removes containers + network, keeps named volumes unless `-v`).",
  ],

  interview: [
    {
      q: "What does Docker Compose actually do, and when would you use it over plain docker run?",
      a: "Compose takes a declarative YAML file — services, images or build contexts, ports, environment, dependencies — and manages the whole set as one stack: `docker compose up -d` creates a project network, starts services in dependency order, and names everything predictably. I'd use it the moment an app has more than one container, which in practice is immediately: app plus database. It replaces a README full of docker run commands with a file that's versioned and reviewed like code, so every developer and CI job runs the identical stack. One thing I'd flag: it's a local-dev and single-host tool — multi-host orchestration is Kubernetes territory.",
    },
    {
      q: "In a compose file, the api connects to postgres at db:5432. How does that hostname work?",
      a: "Compose creates a network for the project and attaches every service to it, and each service name becomes a DNS name on that network. So `db` resolves to the postgres container's address — no hardcoded IPs, and it keeps working when the container restarts with a new IP. Note that 5432 there is the *container* port, and it doesn't need to be published with `ports:` for the api to reach it — publishing is only for access from the host. It's the piece of Compose that removes the whole 'edit config.php with the right host' class of setup problems.",
    },
    {
      q: "You open an older project and see `version: \"3.8\"` and the team runs `docker-compose up`. What would you modernise?",
      a: "Two things, both cheap. The top-level `version:` key is obsolete — the Compose Specification ignores it, so I'd delete it and rename the file to `compose.yaml` while I'm there. And `docker-compose` with a hyphen is the old standalone Python v1 binary, which is end-of-life; the current tool is the `docker compose` plugin that ships with modern Docker, so scripts and CI should call that. Usually the YAML itself needs almost nothing else — the spec is compatible — but I'd also check for legacy `links:`, which service-name DNS made unnecessary years ago.",
    },
  ],

  quiz: [
    {
      question:
        "What is the current status of the top-level `version:` key in a compose file?",
      options: [
        "Required — Compose refuses to start without it",
        "Optional but recommended, to select feature levels",
        "Obsolete — the Compose Specification ignores it entirely",
        "Only required when using docker compose (the plugin)",
      ],
      answerIndex: 2,
      explain:
        "The Compose Specification dropped file versioning; the key is ignored and only lingers in older files. Modern compose.yaml files simply start with `services:`.",
    },
    {
      question:
        "In `DATABASE_URL: postgres://app:app@db:5432/appdb`, what is `db`?",
      options: [
        "The container's IP address alias defined under links:",
        "The Compose service name, resolvable as a DNS hostname on the project network",
        "A special keyword meaning 'the default database container'",
        "The name of the Docker volume storing the data",
      ],
      answerIndex: 1,
      explain:
        "Every service in a compose project gets a DNS entry matching its service name on the automatically created project network. The api resolves `db` to the postgres container — no links, IPs, or host-file edits.",
    },
    {
      question: "What does `depends_on: [db]` guarantee for the api service?",
      options: [
        "The db container is started before api starts",
        "Postgres is fully initialised and accepting connections before api starts",
        "api restarts automatically whenever db restarts",
        "api and db share a filesystem",
      ],
      answerIndex: 0,
      explain:
        "Plain depends_on only orders startup — 'started' is not 'ready'. Postgres may still be initialising when api's first connection attempt lands, which is why production-grade files pair depends_on with a healthcheck condition.",
    },
    {
      question:
        "What's the difference between `docker compose` and `docker-compose`?",
      options: [
        "They are two names for the same binary",
        "docker compose is the current plugin shipped with Docker; docker-compose (hyphen) is the legacy standalone Python v1 tool",
        "docker-compose is the newer rewritten version",
        "docker compose only works with Kubernetes",
      ],
      answerIndex: 1,
      explain:
        "The hyphenated docker-compose was a separate Python project (Compose v1), now end-of-life. Compose was rewritten as a CLI plugin — invoked as `docker compose` — which is what modern Docker ships.",
    },
  ],
};

export default lesson;
