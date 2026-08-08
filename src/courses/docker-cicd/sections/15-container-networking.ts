import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "container-networking",
  title: "Networking: How Containers Talk",
  part: "Compose & Local Dev",
  estMinutes: 12,
  summary:
    "Compose puts services on a shared network where service names are DNS hostnames; ports: publishes to the host, container-to-container traffic doesn't need it — and localhost inside a container means the container itself.",

  concept: `
Networking is where containers break everyone at least once — usually with a
\`connection refused\` that makes no sense until one idea clicks: **every
container is its own little machine with its own \`localhost\`.** Twenty-five
years of single-box habits — everything on \`127.0.0.1\`, services a socket
away — are exactly the instincts that mislead you here.

### The classic bug

Your app config says \`DB_HOST=localhost\`. It worked for decades: app and
MySQL shared a box. In a container, \`localhost\` is **the container itself** —
and there's no Postgres in the api container. Hence:

\`\`\`bash
api-1  | Error: connect ECONNREFUSED 127.0.0.1:5432
\`\`\`

Postgres is running fine — one network hop away, in its own container. The fix
is never "publish more ports"; it's pointing the app at the right hostname:
\`DB_HOST=db\`.

### Service names are DNS

Compose creates a network per project (\`<project>_default\`) and attaches
every service. On that network, **each service name resolves as a hostname** —
Docker's embedded DNS resolver maps \`db\` to the postgres container's
current IP. Containers get fresh IPs on every recreate, which is
why you use names, never IPs. Your old \`/etc/hosts\` bookkeeping is now
automatic and self-updating.

### ports: is for the HOST — and only the host

The mental model that untangles everything:

- **Service → service**: traffic flows over the project network to the
  **container port** directly — \`db:5432\`, \`cache:6379\`. No \`ports:\` entry
  is needed *at all* for this.
- **Host (your browser, curl, psql on your laptop) → container**: needs a
  published port. \`ports: "8080:3000"\` means host port 8080 forwards to
  container port 3000.

So a database with no \`ports:\` entry is fully reachable by the api and
completely unreachable from your laptop — usually exactly what you want.
\`expose:\` (just a container port, no host mapping) is pure documentation in
Compose: services can already reach each other's ports; it publishes nothing.

### Host port conflicts

Only *published* ports can collide. If host 5432 is busy (say, a Postgres
installed on your laptop years ago), \`ports: "5432:5432"\` fails with "address
already in use". Remap the host side — \`"5433:5432"\` — and note what changes:
your laptop's psql now connects to \`localhost:5433\`, while the api still uses
\`db:5432\`, because service-to-service traffic never touches the host mapping.
Two projects publishing the same host port is the same story; their *internal*
networks never conflict.

### Seeing the network

\`\`\`bash
$ docker network ls
NETWORK ID     NAME              DRIVER    SCOPE
9f3a1c2b4d5e   bridge            bridge    local
2e8b7a6c1f04   shopapi_default   bridge    local

$ docker network inspect shopapi_default
# shows connected containers, their IPs, and aliases
\`\`\`

\`docker network ls\` shows the per-project network Compose created;
\`inspect\` lists which containers are attached and their current IPs — your
first stop when two services can't see each other (usually: they're not on the
same network, or a service name is typo'd).

### The debugging drill

When service A can't reach service B, work the ladder:

1. Is B running? \`docker compose ps\`
2. Can A resolve and reach B? \`docker compose exec api ping db\` — tests DNS + network in one shot.
3. Is A using the right hostname and the *container* port? (\`db:5432\`, not \`localhost:5432\`, not the host-published port.)

That three-step ladder answers most container networking questions — in
production and in interviews.
`,

  comparisons: [
    {
      label: "One box and 127.0.0.1 vs service-name DNS",
      intro:
        "The single-server world wired everything through localhost and hand-edited hosts files. Compose replaces both with automatic per-project DNS.",
      php: `# The old single box: everything is localhost
cat /etc/hosts
# 127.0.0.1  localhost
# 10.0.2.15  db-internal   <- hand-added, went
#                             stale twice a year
cat config.php
# 'db_host' => '127.0.0.1',
# 'redis'   => '127.0.0.1:6379',
# app, mysql, redis: one machine, one localhost`,
      ts: `# compose.yaml — names, not addresses
services:
  api:
    build: .
    environment:
      DB_HOST: db              # service name = DNS
      REDIS_URL: redis://cache:6379
    depends_on: [db, cache]
  db:
    image: postgres:16
  cache:
    image: redis:7
# Docker's embedded DNS keeps names pointing
# at current container IPs — even after recreate.`,
      note:
        "Each container has its OWN localhost, so 127.0.0.1 stops meaning 'where the database is' — service names on the project network are the replacement, and they never go stale like /etc/hosts entries did.",
    },
    {
      label: "Debugging connection refused: guessing vs the ladder",
      intro:
        "The api can't reach the database. One session flails at the host; the other tests DNS and reachability from inside the container that's actually failing.",
      php: `# The flailing version (all on the HOST):
curl localhost:5432
# curl: (7) Failed to connect... refused
sudo netstat -tlnp | grep 5432
# (nothing) panic: "postgres is down!"
sudo service postgresql status   # wrong postgres —
# that's the HOST one, not the container
sudo ufw status                  # firewall? nope...
# hours pass; postgres-in-docker was fine all along`,
      ts: `# The ladder (from inside the failing container):
docker compose ps
# shopapi-db-1   postgres:16   Up 2 minutes

docker compose exec api ping -c 2 db
# PING db (172.19.0.2): 56 data bytes
# 64 bytes from 172.19.0.2: seq=0 ttl=64
# -> DNS resolves, network fine.

docker compose exec api env | grep DB_HOST
# DB_HOST=localhost    <- THERE's the bug
# fix: DB_HOST=db in compose.yaml, re-up`,
      note:
        "Test from where the failure happens: exec into the api and check DNS, reachability, then config — the host's netstat and services can't see (and don't matter to) the project network.",
      rightLang: "bash",
    },
    {
      label: "expose: vs ports:",
      intro:
        "Two ways to write a port in compose.yaml that beginners mix up constantly. Only one of them makes anything reachable from your laptop.",
      php: `# expose: container port only — publishes NOTHING
services:
  db:
    image: postgres:16
    expose:
      - "5432"
# From the host:
#   psql -h localhost -p 5432  -> refused
# From the api container:
#   db:5432 works — but it worked WITHOUT
#   expose: too. In Compose it's documentation.`,
      ts: `# ports: host mapping — actually publishes
services:
  db:
    image: postgres:16
    ports:
      - "5433:5432"   # host 5433 -> container 5432
# From the host:
#   psql -h localhost -p 5433  -> works
# From the api container:
#   still db:5432 — service traffic uses the
#   container port; the host mapping is irrelevant`,
      note:
        "Services can reach each other's container ports regardless of either keyword — expose: documents intent, ports: opens a door from the host; publish databases only when you genuinely want laptop access.",
      leftLang: "yaml",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "The stack: api publishes 8080:3000; db (postgres:16) has NO ports: entry. Three probes — curl to localhost:8080 from the laptop, psql to localhost:5432 from the laptop, and a reach-the-db test from inside the api container. Predict each outcome before revealing.",
    code: `# The running stack:
docker compose ps

# Probe 1 — from the laptop, the published api port:
curl -s localhost:8080/health

# Probe 2 — from the laptop, the UNpublished db port:
psql -h localhost -p 5432 -U app appdb

# Probe 3 — from INSIDE the api container, service name + container port:
docker compose exec api sh -c 'nc -zv db 5432'`,
    output: `$ docker compose ps
NAME            IMAGE         SERVICE   STATUS         PORTS
shopapi-api-1   shopapi-api   api       Up 3 minutes   0.0.0.0:8080->3000/tcp
shopapi-db-1    postgres:16   db        Up 3 minutes   5432/tcp

$ curl -s localhost:8080/health
{"status":"ok","db":"connected"}

$ psql -h localhost -p 5432 -U app appdb
psql: error: connection to server at "localhost" (127.0.0.1), port 5432 failed: Connection refused
        Is the server running on that host and accepting TCP/IP connections?

$ docker compose exec api sh -c 'nc -zv db 5432'
db (172.19.0.2:5432) open

# Probe 1 works: 8080 is published (8080->3000).
# Probe 2 refused: db has no ports: mapping, so the HOST
# cannot reach it — nothing is listening on the laptop's 5432.
# Probe 3 works: inside the project network, the service name
# db resolves and the CONTAINER port 5432 is directly reachable
# — no ports: entry needed for service-to-service traffic.`,
  },

  keyPoints: [
    "Every container has its own `localhost` — `DB_HOST=localhost` inside the api container points at the api container, hence `ECONNREFUSED 127.0.0.1:5432`. The fix is the service name: `DB_HOST=db`.",
    "Compose creates a per-project network where every service name is a DNS hostname, kept current by an embedded resolver — use names, never container IPs.",
    "`ports: \"8080:3000\"` publishes to the HOST only; service-to-service traffic uses the container port directly (`db:5432`) and needs no `ports:` entry at all.",
    "`expose:` publishes nothing in Compose — services can already reach each other's container ports; it's documentation. `ports:` is what opens a door from your laptop.",
    "Only published ports can conflict on the host — remap the host side (`\"5433:5432\"`); service-to-service traffic is unaffected by the host mapping.",
    "Debug ladder: `docker compose ps` (is it up?) → `docker compose exec api ping db` (DNS + reachability) → check the hostname and container port in the app's config; `docker network ls`/`inspect` shows who's attached where.",
  ],

  interview: [
    {
      q: "An app works on the developer's machine but in Docker it fails with ECONNREFUSED 127.0.0.1:5432. Diagnose it.",
      a: "That's the classic container networking bug. The app is configured with DB_HOST=localhost, which was correct when app and Postgres shared a machine — but inside a container, localhost is the container's own loopback, and there's no Postgres in the app container, so the connection is refused while Postgres runs happily next door. The fix is to point the app at the database's service name — DB_HOST=db — because Compose makes every service name a DNS hostname on the project network. I'd confirm with `docker compose exec api ping db` to prove resolution and reachability, then fix the env var. Publishing more ports wouldn't help — this is a hostname problem, not an exposure problem.",
    },
    {
      q: "In Compose, when do you need a ports: entry and when don't you?",
      a: "ports: exists for exactly one consumer: the host. `\"8080:3000\"` forwards my laptop's 8080 to the container's 3000 so a browser or curl can reach the app. Container-to-container traffic never uses it — services on the project network reach each other by service name and container port, like db:5432, whether or not anything is published. So my api gets a ports: entry because humans hit it, and the database usually gets none: fully reachable by the api, invisible from the host, which is the safer default. expose: is worth mentioning too — in Compose it publishes nothing and is effectively documentation.",
    },
    {
      q: "Two of your Compose projects both want host port 5432 for Postgres. What happens and what do you do?",
      a: "Nothing conflicts until a port is published — each project has its own network, and both databases can listen on container port 5432 internally forever. The collision only happens if both files publish 5432 to the host: the second `up` fails with 'address already in use'. The fix is remapping the host side for one of them, say \"5433:5432\". Crucially, only host-side tools notice: my laptop's psql connects to localhost:5433, while each project's api keeps using db:5432, because service-to-service traffic goes over the project network and never touches host mappings. Often the cleaner answer is to not publish the database at all and use `docker compose exec db psql` instead.",
    },
  ],

  quiz: [
    {
      question:
        "Inside the api container, the app tries to connect to localhost:5432 and gets ECONNREFUSED, yet the db service is Up. Why?",
      options: [
        "The db container crashed silently",
        "localhost inside a container is that container's own loopback — Postgres runs in a different container, reachable at db:5432",
        "Port 5432 must be added to the api's ports: list",
        "Postgres 16 disables TCP by default",
      ],
      answerIndex: 1,
      explain:
        "Each container is its own little machine with its own localhost. The database lives one network hop away in its own container; the fix is the service-name hostname (DB_HOST=db), not port publishing.",
    },
    {
      question:
        "The db service has no ports: entry. Which statement is true?",
      options: [
        "The api cannot reach it until 5432 is published",
        "The api reaches it at db:5432 over the project network, but the host cannot connect to it",
        "Neither the api nor the host can reach it",
        "It is reachable from the host on a random ephemeral port",
      ],
      answerIndex: 1,
      explain:
        "ports: only affects host access. Services on the project network reach each other's container ports directly, no publishing required — so db:5432 works for the api while the laptop gets connection refused.",
    },
    {
      question: "What does expose: actually do in a Compose file?",
      options: [
        "Publishes the port to the host like ports:",
        "Opens the port in the host firewall",
        "Effectively nothing functional in Compose — services can already reach each other's container ports; it documents intent",
        "Restricts the port to depends_on services only",
      ],
      answerIndex: 2,
      explain:
        "In Compose, expose: publishes nothing and grants nothing that the shared project network doesn't already provide. It's documentation of which port a service speaks on; ports: is the one that opens host access.",
    },
    {
      question:
        "Host port 5432 is already in use, so you change the db mapping to \"5433:5432\". What must be updated?",
      options: [
        "The api's DB_HOST must become db:5433",
        "Only host-side clients (e.g. your laptop's psql) now use port 5433; the api keeps using db:5432",
        "Both the api and host clients switch to 5433",
        "Nothing — Compose rewrites connections automatically",
      ],
      answerIndex: 1,
      explain:
        "The host mapping only exists for host traffic. Service-to-service connections go over the project network straight to the container port, so the api's db:5432 is untouched — only tools running on your laptop see the new 5433.",
    },
  ],
};

export default lesson;
