import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "compose-full-stack",
  title: "A Full Dev Stack: App, DB & Cache",
  part: "Compose & Local Dev",
  estMinutes: 13,
  summary:
    "A realistic three-service compose.yaml — api with a live-reload bind mount, Postgres with a named volume, Redis — makes 'set up a new dev laptop' a one-command job.",

  concept: `
Remember setting up a new dev machine? A day of installing Apache, MySQL,
Redis, the right PHP version, the right extensions — and it still behaved
differently from your colleague's box. The full-stack compose file is the
answer to that day: **clone the repo, run \`docker compose up\`, start coding.**

### The three-service file

\`\`\`yaml
# compose.yaml
services:
  api:
    build: .
    ports:
      - "8080:3000"
    volumes:
      - ./src:/app/src          # bind mount: live reload
    environment:
      DB_HOST: db
      DB_USER: app
      DB_PASSWORD: app
      REDIS_URL: redis://cache:6379
    depends_on:
      - db
      - cache

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: appdb
    volumes:
      - pgdata:/var/lib/postgresql/data   # named volume: data survives

  cache:
    image: redis:7

volumes:
  pgdata:
\`\`\`

Three services, wired together by name: the api reaches Postgres at \`db\` and
Redis at \`redis://cache:6379\` because service names are hostnames on the
project network. Only the api publishes a port — the database and cache are
reachable *by the api* but not from your host, which is exactly the exposure
you want.

### build: vs image:

\`db\` and \`cache\` use \`image:\` — pull a prebuilt image and run it. \`api\`
uses \`build: .\` — build from the local Dockerfile. Rule of thumb: **your code
gets \`build:\`, everyone else's software gets \`image:\`.** When you change the
Dockerfile or dependencies, rebuild as part of up:

\`\`\`bash
docker compose up -d --build
\`\`\`

Without \`--build\`, Compose reuses the image it built last time — the classic
"why isn't my new dependency in the container" moment.

### Two kinds of volumes, two jobs

- **Bind mount** (\`./src:/app/src\`): maps a host directory into the
  container. Edit \`src/\` in your editor, and the file changes *inside* the
  running container instantly — pair it with \`tsx watch\` or nodemon and you
  get live reload without rebuilding the image. Dev-only; production images
  copy code in at build time.
- **Named volume** (\`pgdata:/var/lib/postgresql/data\`): Docker-managed
  storage that outlives containers. \`docker compose down\` removes the
  postgres *container*, but your database survives in \`pgdata\` and reattaches
  on the next \`up\`. Only \`down -v\` deletes it.

One mount is for *your code flowing in*; the other is for *the database's data
staying put*.

### Running one-off commands in the stack

Two commands cover almost everything:

\`\`\`bash
# a shell (or any command) inside the RUNNING api container:
docker compose exec api sh
docker compose exec db psql -U app appdb

# a FRESH throwaway container from the api image:
docker compose run --rm api npm test
\`\`\`

\`exec\` enters a container that's already running — your \`docker exec\`
instinct, but by service name. \`run --rm\` spins up a *new* container from the
service's config (same network, same env vars, so tests can reach \`db\`), runs
the command, and \`--rm\` deletes the container afterwards. Migrations, seeds,
test suites — all \`run --rm\`.

### The pitch, for interviews and for yourself

This file is the whole "local environment" story: identical stacks on every
laptop and in CI, per-project versions with no conflicts (project A on
Postgres 16, project B on 14, simultaneously), onboarding measured in minutes,
and \`docker compose down\` leaves your actual machine clean. The WAMP/MAMP
day-of-setup — and the "works on my machine" arguments it produced — is the
thing this replaces.
`,

  comparisons: [
    {
      label: "New dev machine: the day vs the command",
      intro:
        "A new hire needs the app, Postgres, and Redis running locally. Compare the hand-installed afternoon with the compose file already in the repo.",
      php: `# New laptop, the old way (day one, maybe two):
sudo apt-get install apache2 mysql-server redis-server
sudo apt-get install php8.1 php8.1-mysql php8.1-redis
sudo nano /etc/mysql/my.cnf        # match prod... roughly
sudo nano /etc/apache2/sites-available/app.conf
sudo a2enmod rewrite && sudo service apache2 restart
mysql -u root -p < schema.sql
# Redis on 6380 because 6379 was taken by
# that other project... update config.php...
# "works on my machine" starts here.`,
      ts: `# compose.yaml — new laptop, the new way:
# git clone && docker compose up -d
services:
  api:
    build: .
    ports:
      - "8080:3000"
    volumes:
      - ./src:/app/src
    environment:
      DB_HOST: db
      REDIS_URL: redis://cache:6379
    depends_on: [db, cache]
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: appdb
    volumes:
      - pgdata:/var/lib/postgresql/data
  cache:
    image: redis:7
volumes:
  pgdata:`,
      note:
        "Every laptop (and CI) runs byte-identical services at pinned versions, isolated per project — the version-conflict and drift problems of host installs don't exist.",
    },
    {
      label: "Database shell: on the host vs in the service",
      intro:
        "You need a SQL prompt on the dev database. One way assumes MySQL is installed and configured on your machine; the other uses the containers you already have.",
      php: `# Old way: client + server both live on the host
mysql -u root -p
# Enter password: ********
mysql> USE appdb;
mysql> SELECT COUNT(*) FROM orders;
# ...assuming your host mysql client version
# is compatible, the socket path is right,
# and root's password is the one you remember`,
      ts: `# Compose way: exec into the db service
docker compose exec db psql -U app appdb
# psql (16.4)
# appdb=# SELECT COUNT(*) FROM orders;

# Same idea for the cache and the app:
docker compose exec cache redis-cli PING
docker compose exec api sh

# One-off in a FRESH container (then removed):
docker compose run --rm api npm test`,
      note:
        "exec runs inside the already-running container (right client version guaranteed, service-name networking included); run --rm creates a disposable container with the service's env for one-offs like tests and migrations.",
      rightLang: "bash",
    },
    {
      label: "Code changes: rebuild vs bind mount",
      intro:
        "You edit a source file and want the running dev app to pick it up. Without a mount, code is baked into the image; with one, the container sees your edit instantly.",
      php: `# No mount: code was COPYed at build time
nano src/routes/orders.ts
docker compose up -d --build api
# ...wait for a full image rebuild on every
# edit. Nobody develops like this for long.`,
      ts: `# compose.yaml (dev): bind-mount the source
services:
  api:
    build: .
    command: npx tsx watch src/server.ts
    volumes:
      - ./src:/app/src
# Edit src/routes/orders.ts in your editor:
# the file changes INSIDE the container the
# same instant, and tsx watch restarts the
# server. No rebuild until deps change.`,
      note:
        "The bind mount is a dev-loop tool — production images still COPY code at build time; --build is only needed when the Dockerfile or dependencies change.",
      leftLang: "bash",
      rightLang: "yaml",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "The project directory is `shopapi`. Predict before revealing: in what order do the three containers start, what prefix does each log line carry, and which service's data would survive a `docker compose down`?",
    code: `# shopapi/compose.yaml
services:
  api:
    build: .
    ports:
      - "8080:3000"
    volumes:
      - ./src:/app/src
    environment:
      DB_HOST: db
      REDIS_URL: redis://cache:6379
    depends_on:
      - db
      - cache

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: appdb
    volumes:
      - pgdata:/var/lib/postgresql/data

  cache:
    image: redis:7

volumes:
  pgdata:`,
    output: `$ docker compose up
[+] Running 5/5
 ✔ Network shopapi_default    Created   0.1s
 ✔ Volume "shopapi_pgdata"    Created   0.0s
 ✔ Container shopapi-db-1     Created   0.2s
 ✔ Container shopapi-cache-1  Created   0.2s
 ✔ Container shopapi-api-1    Created   0.3s
Attaching to api-1, cache-1, db-1
cache-1  | 1:M 07 Jul 2026 09:14:02.113 * Ready to accept connections tcp
db-1     | PostgreSQL init process complete; ready for start up.
db-1     | 2026-07-07 09:14:02.891 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432
db-1     | 2026-07-07 09:14:02.899 UTC [1] LOG:  database system is ready to accept connections
api-1    | > shopapi@1.0.0 dev
api-1    | > tsx watch src/server.ts
api-1    | api listening on :3000 (db=db, cache=redis://cache:6379)

# depends_on means db and cache are created before api;
# api attaches last. Logs interleave, prefixed <service>-<n>:
# "db-1 |", "cache-1 |", "api-1 |".
# After docker compose down, the postgres DATA survives in the
# named volume shopapi_pgdata (only down -v deletes it) —
# redis and the containers themselves are recreated fresh.`,
  },

  keyPoints: [
    "Rule of thumb: your code gets `build: .`, everyone else's software gets `image:` — and `docker compose up -d --build` when the Dockerfile or deps change.",
    "Bind mounts (`./src:/app/src`) flow your edits into the running container for live reload; named volumes (`pgdata:`) keep database data alive across `down`/`up`.",
    "`docker compose down` removes containers and the network but keeps named volumes — only `down -v` deletes your data.",
    "Services wire together via names in env vars: `DB_HOST: db`, `REDIS_URL: redis://cache:6379` — and db/cache need no `ports:` entry for the api to reach them.",
    "`docker compose exec api sh` enters the running container; `docker compose run --rm api npm test` runs a one-off in a fresh disposable container with the same network and env.",
    "This file is the 'new laptop in one command' story: identical, isolated, per-project stacks on every machine — the modern answer to the day-long WAMP/MAMP setup.",
  ],

  interview: [
    {
      q: "How do you set up local development so the whole team runs an identical environment?",
      a: "A compose.yaml in the repo defines the full stack — our api built from the local Dockerfile, plus pinned images like postgres:16 and redis:7. Services are wired by name through environment variables (DB_HOST=db, REDIS_URL=redis://cache:6379), the database uses a named volume so data survives restarts, and the api bind-mounts ./src with a watcher for live reload. Onboarding is clone-and-`docker compose up`. Because the same file drives CI, 'works on my machine' mostly disappears — everyone's Postgres is the same Postgres, and per-project stacks can't conflict the way host-installed services did.",
    },
    {
      q: "Explain the difference between a bind mount and a named volume, and when you'd use each.",
      a: "A bind mount maps a host path into the container — `./src:/app/src` — so my editor's changes appear inside the container instantly; that's the dev live-reload loop, and it has no place in production, where code is copied in at build time. A named volume is Docker-managed storage attached to a container path — `pgdata:/var/lib/postgresql/data` — whose whole point is to outlive containers: `docker compose down` destroys the postgres container but the data reattaches on the next up. Shorthand I use: bind mounts move my code in, named volumes keep the service's data from moving out.",
    },
    {
      q: "How would you run your test suite or a database migration inside the Compose stack?",
      a: "With `docker compose run --rm api npm test` — it starts a fresh container from the api service's configuration, so it's on the project network with the same env vars and can reach db and cache, runs the command, and removes itself thanks to --rm. Migrations and seeds work the same way. That's distinct from `docker compose exec`, which runs a command in the already-running container — right for opening a shell or a psql prompt against live state, wrong for one-offs where I want a clean, disposable environment that can even run while the main api is stopped.",
    },
  ],

  quiz: [
    {
      question:
        "After `docker compose down`, what happens to the Postgres data stored in a named volume?",
      options: [
        "It is deleted along with the container",
        "It survives — down removes containers and the network but keeps named volumes; only down -v deletes them",
        "It is archived to an image layer",
        "It survives only if the container was stopped gracefully",
      ],
      answerIndex: 1,
      explain:
        "Named volumes exist independently of containers. down tears down containers and the network, but the volume reattaches on the next up. The -v flag is the explicit 'yes, delete my data' opt-in.",
    },
    {
      question:
        "You added a new npm dependency but the running container doesn't have it. What's the likely fix?",
      options: [
        "docker compose restart api",
        "docker compose up -d --build — the image must be rebuilt for dependency changes",
        "Add node_modules to the bind mount",
        "docker compose down -v and up again",
      ],
      answerIndex: 1,
      explain:
        "Dependencies are installed at image build time. Without --build, Compose reuses the previously built image; the bind mount only covers ./src, not node_modules. Restart and down -v don't rebuild anything (and -v would nuke your data).",
    },
    {
      question:
        "What's the difference between `docker compose exec api sh` and `docker compose run --rm api sh`?",
      options: [
        "They are identical",
        "exec opens a shell in the running api container; run --rm starts a new disposable container from the api service's config",
        "run works only when the stack is down; exec only when it is up — otherwise they're the same container",
        "exec requires root; run does not",
      ],
      answerIndex: 1,
      explain:
        "exec attaches into the existing container — you see its live state. run creates a fresh container with the service's image, env, and network (ideal for tests/migrations), and --rm cleans it up when the command exits.",
    },
    {
      question:
        "In the three-service file, why do db and cache have no `ports:` entries?",
      options: [
        "They inherit the api's port mappings",
        "Compose forbids publishing database ports",
        "The api reaches them by service name over the project network; ports: is only needed for access from the host",
        "postgres:16 and redis:7 publish their ports automatically",
      ],
      answerIndex: 2,
      explain:
        "Service-to-service traffic flows over the project network using container ports directly (db:5432, cache:6379). Publishing with ports: exposes a service to the host machine — unnecessary for db and cache, and leaving them unpublished is the safer default.",
    },
  ],
};

export default lesson;
