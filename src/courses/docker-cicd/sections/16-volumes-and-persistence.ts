import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "volumes-and-persistence",
  title: "Volumes: Data That Survives",
  part: "Compose & Local Dev",
  estMinutes: 11,
  summary:
    "Containers are disposable but data isn't — named volumes keep postgres data alive across rebuilds, and bind mounts map your source code into a dev container for instant reloads.",

  concept: `
Everything a container writes goes into its **writable layer**, and that layer
is deleted with the container. That's by design: containers are cattle, you
replace them without ceremony. But your database is not cattle. On the LAMP
box you had the same split instinctively — code could be re-uploaded any time,
but \`/var/lib/mysql\` and the \`uploads/\` directory were sacred, survived every
deploy, and made the whole server irreplaceable. Docker makes that split
explicit: anything that must outlive the container goes in a **volume**.

### Named volumes: Docker-managed data

A named volume is a chunk of disk that Docker manages for you (under
\`/var/lib/docker/volumes\` on the host — you never touch that path directly).
You declare it once at the top level of \`compose.yaml\` and mount it into a
service:

\`\`\`yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data   # volume-name : path-in-container

volumes:
  pgdata:        # top-level declaration — Docker creates and owns it
\`\`\`

Compose prefixes the real name with the project, so you'll see \`shop_pgdata\`
in \`docker volume ls\`. The lifecycle rule to burn in:

- \`docker compose down\` removes containers and the network — **volumes survive**.
- \`docker compose down -v\` removes the volumes too — **data gone**.

Inspect what exists with \`docker volume ls\` and
\`docker volume inspect shop_pgdata\` (shows the driver, creation time, and the
host mountpoint).

### Bind mounts: a host folder, live inside the container

A bind mount maps a directory you own straight into the container:
\`- ./src:/app/src\`. The container sees your edits the instant you save —
no image rebuild, no FTP upload. That makes bind mounts the tool for **dev
source code** (paired with a dev server that hot-reloads), and for pushing
config files in read-only (\`- ./nginx.conf:/etc/nginx/nginx.conf:ro\`).

Rule of thumb: **named volumes for data the app produces** (database files,
uploads), **bind mounts for files you edit** (source, config, in dev only).
Production containers should run from the baked image, not from a bind mount.

One classic dev trick, at mention level: if you bind-mount your whole project
with \`- ./:/app\`, your host \`node_modules\` (or lack of one) shadows the
container's. Adding an anonymous volume \`- /app/node_modules\` on the next
line tells Docker "keep the container's own copy at this path" — the bind
mount applies everywhere except there.

### Backups without SSH archaeology

Because a named volume is just managed disk, you can snapshot it with a
throwaway container that mounts it read-only and tars it to a bind mount:

\`\`\`bash
docker run --rm -v shop_pgdata:/data:ro -v "$PWD/backups":/backup \\
  alpine tar czf /backup/pgdata.tar.gz -C /data .
\`\`\`

The \`--rm\` container exists for exactly one command and vanishes. For
databases you'll usually prefer a logical dump too
(\`docker compose exec db pg_dump -U app shopdb > backup.sql\`) — same idea as
your old \`mysqldump\`, but runnable from anywhere the compose file works.
`,

  comparisons: [
    {
      label: "Where the data lives",
      intro:
        "Both setups keep database files safe across code deploys. One ties the data to an irreplaceable machine; the other names it and lets the containers stay disposable.",
      php: `# The old rule on the LAMP box: data lives INSIDE the server.
$ ssh deploy@prod-box
$ ls /var/lib/mysql/shopdb
customers.ibd  orders.ibd  products.ibd
# Nobody touches this path. Nobody rebuilds this machine.
# Moving hosts = a scary hand-run migration weekend,
# so the box lives forever and rots slowly.`,
      ts: `# compose.yaml - data lives in a NAMED VOLUME, not the container
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: example
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:   # survives docker compose down; removed only by down -v`,
      note:
        "The container is now cattle: destroy and recreate it freely, the volume reattaches. On the LAMP box the data made the whole server a pet.",
    },
    {
      label: "Shipping a code change in dev",
      intro:
        "You changed one source file and want to see the result. The FTP era uploads it; a bind mount means the container is already looking at your working copy.",
      php: `# Change a file, upload it, refresh, pray you got them all
$ ftp ftp.example.com
Connected to ftp.example.com.
ftp> cd public_html/includes
ftp> put cart.php
226 Transfer complete.
ftp> bye
# Forgot functions.php? Prod now runs a mixed version.`,
      ts: `# compose.yaml - the host folder IS the container folder
services:
  api:
    build: .
    command: npm run dev          # dev server with hot reload
    ports:
      - "3000:3000"
    volumes:
      - ./src:/app/src            # edit on host, container sees it instantly
      - /app/node_modules         # anonymous volume: keep container's deps`,
      note:
        "The bind mount removes the copy step entirely — there is one set of files, so a half-uploaded deploy is impossible. Dev only: production runs the baked image.",
    },
    {
      label: "Backing up the database",
      intro:
        "Nightly backups, then and now. The cron-on-the-box version fails silently; the volume version runs anywhere the compose project runs.",
      php: `# crontab on the prod box - dump, copy, hope it ran
$ crontab -l
0 2 * * *  mysqldump -u root -pS3cret shopdb > /root/backup/shopdb.sql
30 2 * * * scp /root/backup/shopdb.sql backup@nas:/backups/
# Password in the crontab, and nobody notices a silent
# failure until restore day.`,
      ts: `# Snapshot the named volume with a throwaway container
$ docker run --rm -v shop_pgdata:/data:ro -v "$PWD/backups":/backup \\
    alpine tar czf /backup/pgdata-2026-07-07.tar.gz -C /data .

# Or a logical dump through the running service:
$ docker compose exec db pg_dump -U app shopdb > backups/shopdb.sql`,
      note:
        "The --rm container mounts the volume read-only, tars it to a bind-mounted host folder, and deletes itself — one line, no SSH session, no state left behind.",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "The db service uses a named volume pgdata. Round 1 tears the stack down WITHOUT -v and brings it back; round 2 uses down -v. Predict what each final SELECT returns before revealing the transcript.",
    code: `# compose.yaml has:  db -> volumes: [pgdata:/var/lib/postgresql/data]

# Round 1: create data, then down (NO -v), then up again
docker compose up -d
docker compose exec db psql -U app -c "CREATE TABLE customers (name text);"
docker compose exec db psql -U app -c "INSERT INTO customers VALUES ('Acme');"
docker compose down
docker compose up -d
docker compose exec db psql -U app -c "SELECT name FROM customers;"

# Round 2: down -v deletes the named volume, then up again
docker compose down -v
docker compose up -d
docker compose exec db psql -U app -c "SELECT name FROM customers;"`,
    output: `$ docker compose up -d
[+] Running 3/3
 ✔ Network shop_default   Created    0.1s
 ✔ Volume "shop_pgdata"   Created    0.0s
 ✔ Container shop-db-1    Started    0.4s
$ docker compose exec db psql -U app -c "CREATE TABLE customers (name text);"
CREATE TABLE
$ docker compose exec db psql -U app -c "INSERT INTO customers VALUES ('Acme');"
INSERT 0 1
$ docker compose down
[+] Running 2/2
 ✔ Container shop-db-1    Removed    0.3s
 ✔ Network shop_default   Removed    0.2s
$ docker compose up -d
[+] Running 2/2
 ✔ Network shop_default   Created    0.1s
 ✔ Container shop-db-1    Started    0.4s
$ docker compose exec db psql -U app -c "SELECT name FROM customers;"
 name
------
 Acme
(1 row)

$ docker compose down -v
[+] Running 3/3
 ✔ Container shop-db-1    Removed    0.3s
 ✔ Network shop_default   Removed    0.2s
 ✔ Volume shop_pgdata     Removed    0.0s
$ docker compose up -d
[+] Running 3/3
 ✔ Network shop_default   Created    0.1s
 ✔ Volume "shop_pgdata"   Created    0.0s
 ✔ Container shop-db-1    Started    0.4s
$ docker compose exec db psql -U app -c "SELECT name FROM customers;"
ERROR:  relation "customers" does not exist
LINE 1: SELECT name FROM customers;
                         ^`,
  },

  keyPoints: [
    "A container's writable layer dies with the container — anything that must survive goes in a volume, exactly like `/var/lib/mysql` and `uploads/` survived your FTP deploys.",
    "Named volumes are declared under the top-level `volumes:` key in compose.yaml, are Docker-managed, and get a project prefix (`shop_pgdata` in `docker volume ls`).",
    "`docker compose down` keeps volumes; `docker compose down -v` deletes them — the difference between a restart and losing the database.",
    "Bind mounts (`./src:/app/src`) map a host folder into the container for live-editing source in dev; production containers should run the baked image instead.",
    "The anonymous-volume trick `- /app/node_modules` stops a whole-project bind mount from shadowing the container's installed dependencies.",
    "Back up a volume with a throwaway container: `docker run --rm -v shop_pgdata:/data:ro -v \"$PWD\":/backup alpine tar czf /backup/pgdata.tar.gz -C /data .`",
  ],

  interview: [
    {
      q: "What's the difference between a named volume and a bind mount, and when do you use each?",
      a: "A named volume is storage Docker creates and manages itself — I declare it at the top level of compose.yaml, mount it into a service, and Docker decides where it lives on the host. A bind mount maps a specific host directory I own into the container. I use named volumes for data the application produces — postgres's data directory, uploaded files — because they survive `docker compose down` and are portable across environments. I use bind mounts in development for source code, so my editor and the container share one set of files and a hot-reloading dev server picks up every save. In production I avoid bind-mounting code entirely: the image is the artifact.",
    },
    {
      q: "A teammate ran a command and the local database vanished. What probably happened, and how would you have protected against it?",
      a: "Almost certainly `docker compose down -v` — plain `down` removes containers and the network but keeps named volumes, while `-v` deletes them too. Protection is two-fold. First, backups that don't depend on the stack being up: a throwaway container like `docker run --rm -v shop_pgdata:/data:ro -v \"$PWD\":/backup alpine tar czf /backup/pgdata.tar.gz -C /data .`, or a `pg_dump` through `docker compose exec`. Second, treating `-v` as a deliberate reset gesture, not part of the routine restart muscle memory. It's the same discipline as the old servers — nobody typed `rm -rf /var/lib/mysql` casually, and `down -v` is that command wearing a friendlier name.",
    },
    {
      q: "Why does a whole-project bind mount break node_modules, and what's the standard fix?",
      a: "If I mount `./:/app`, the bind mount covers everything under /app — including /app/node_modules, which now reflects whatever is on my host: a Mac- or Windows-built dependency tree, or nothing at all. The container's own `npm ci` output from the image build is hidden underneath. The standard fix is an anonymous volume on the nested path: `- /app/node_modules` after the bind mount. Docker mounts a volume there, so the container keeps its own Linux-built dependencies while the rest of the project stays live-mounted. It's a mention-level trick, but it comes up in nearly every Node dev-container setup.",
    },
  ],

  quiz: [
    {
      question:
        "After `docker compose down` followed by `docker compose up -d`, what happens to data in a named volume?",
      options: [
        "It's gone — down removes everything the project created",
        "It survives — down removes containers and networks but keeps named volumes",
        "It survives only if the volume was backed up first",
        "It survives only for database images like postgres",
      ],
      answerIndex: 1,
      explain:
        "Plain `down` tears down containers and the network; named volumes persist and reattach on the next `up`. Only `down -v` (or `docker volume rm`) deletes them — nothing about it is image-specific.",
    },
    {
      question:
        "Which mount is the right choice for live-editing TypeScript source against a hot-reloading dev server in a container?",
      options: [
        "A named volume declared under top-level volumes:",
        "An anonymous volume on /app/src",
        "A bind mount like ./src:/app/src",
        "No mount — rebuild the image on every save",
      ],
      answerIndex: 2,
      explain:
        "A bind mount maps your working directory straight into the container, so every save is visible instantly. Named and anonymous volumes are Docker-managed storage — great for data, useless for editing files with your host tooling.",
    },
    {
      question:
        "What does `docker run --rm -v shop_pgdata:/data:ro -v \"$PWD\":/backup alpine tar czf /backup/pg.tar.gz -C /data .` do?",
      options: [
        "Restores a backup archive into the shop_pgdata volume",
        "Copies the volume to another volume called backup",
        "Starts a permanent backup sidecar container",
        "Starts a throwaway container that tars the volume's contents to the current host directory, then removes itself",
      ],
      answerIndex: 3,
      explain:
        "The container mounts the named volume read-only at /data and the current directory at /backup, runs tar once, and --rm deletes the container afterwards. It's the standard one-liner for snapshotting a volume without touching the running stack.",
    },
  ],
};

export default lesson;
