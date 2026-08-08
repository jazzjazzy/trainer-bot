import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "ports-env-volumes",
  title: "Ports, Env Vars & Volumes",
  part: "From FTP to Containers",
  estMinutes: 12,
  summary:
    "The three flags that make a container actually useful: -p to publish ports (nothing is reachable by default), -e for runtime config, and -v for data that must outlive the container.",

  concept: `
A bare \`docker run\` gives you a process in a sealed box: nobody can reach
it, it has only the config baked into the image, and everything it writes
vanishes when the container is removed. Three flags open exactly the holes
you need — and each replaces something you used to do by editing files on a
server.

### \`-p\`: publish a port (closed by default)

Containers get their own network namespace. The app inside may listen on
port 80, but that's port 80 *inside the container* — **nothing on the host
can reach it until you publish it**:

\`\`\`bash
docker run -d --name web -p 8080:80 nginx:1.27
#                           └┬─┘ └┬┘
#                          host   container
curl http://localhost:8080     # works: host 8080 -> container 80
\`\`\`

Read \`-p host:container\` left-to-right as "traffic to the host's 8080 is
forwarded to the container's 80". This is the \`Listen\`/\`VirtualHost\` dance
from \`httpd.conf\`, except per-container and without a config file: run three
web containers on 8081, 8082, 8083 and they never conflict, because each
thinks it owns port 80.

### \`-e\`: config lives outside the image

The image is immutable and shared across environments — so anything that
*differs* per environment (DB host, credentials, API keys, debug flags) must
NOT be baked in. It's injected at run time:

\`\`\`bash
docker run -d --name api \\
  -e DB_HOST=db.internal \\
  -e DB_PASSWORD=s3cret \\
  -e APP_ENV=production \\
  shop-api:2.4.1

# or keep them in a file (never committed to git):
docker run -d --name api --env-file ./prod.env shop-api:2.4.1
\`\`\`

You already practise this: it's the \`.env\` file pattern from modern PHP,
elevated to a hard rule. The twelve-factor principle — *config lives in the
environment, not the artifact* — is what lets the SAME image run in dev,
staging, and prod. The old anti-patterns (a \`config.php\` with prod
credentials FTP-ed up, hand-edited \`php.ini\` per server) are exactly what
this replaces.

### \`-v\`: data that must survive

A container's writable layer dies with the container. Redeploying means
removing the old container and running a new one — so **anything not stored
in a volume is lost on every redeploy**. Think of your \`uploads/\`
directory, or the MySQL data dir. Two forms:

\`\`\`bash
# Named volume — Docker-managed storage, the production pattern:
docker run -d --name db \\
  -v pgdata:/var/lib/postgresql/data \\
  postgres:16

# Bind mount — map a HOST path in, the dev pattern:
docker run -d --name web \\
  -v ./site:/usr/share/nginx/html \\
  nginx:1.27
\`\`\`

A **named volume** (\`pgdata\`) is created and managed by Docker
(\`docker volume ls\` to see them); delete and recreate the container and the
data is still there. A **bind mount** maps a directory from your machine into
the container — perfect for live-editing code in dev, since your editor
writes to the same files the container serves.

### The mental checklist

Before running any real container, ask the three questions:

1. **Who needs to reach it?** → \`-p host:container\`
2. **What differs per environment?** → \`-e\` / \`--env-file\`
3. **What must survive a redeploy?** → \`-v volume:/path\`

Everything else belongs in the image.
`,

  comparisons: [
    {
      label: "Wiring up a web app: config files vs flags",
      intro:
        "Expose the app on a port, point it at the database, and keep uploads safe. The manual version is three files edited on the server; the container version is three flags on one command.",
      php: `# Three SSH edits, each a chance to break prod
sudo nano /etc/apache2/ports.conf
#   Listen 8080
sudo nano /etc/apache2/sites-available/shop.conf
#   <VirtualHost *:8080> DocumentRoot /var/www/shop ...

sudo nano /var/www/shop/config.php
#   <?php
#   define('DB_HOST', '10.0.0.5');
#   define('DB_PASS', 's3cret');   // in a file, in the
#                                  // webroot, since 2011
sudo service apache2 restart
# uploads/ lives in the webroot — remember to exclude
# it from the next FTP overwrite!`,
      ts: `# The same three concerns, as run-time flags:
docker run -d --name shop \\
  -p 8080:80 \\
  -e DB_HOST=10.0.0.5 \\
  -e DB_PASSWORD=s3cret \\
  -v shop-uploads:/app/uploads \\
  shop:2.4.1

# Port mapping: no httpd.conf, no restart.
# Credentials: injected, never in the image or repo.
# uploads: a named volume — redeploys can't touch it.`,
      note: "Each server edit was mutable state on a snowflake box; the flags are declarative, visible in docker inspect, and identical every time the container is recreated.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Changing config per environment",
      intro:
        "Staging needs debug on and a different DB. Manually that means divergent files on each server; with containers, one immutable image and different environments injected at run time.",
      php: `# Per-server file edits — the drift factory
ssh deploy@staging
$ sudo nano /etc/php/7.4/apache2/php.ini
#   display_errors = On        (staging only!)
$ nano /var/www/shop/config.php
#   define('DB_HOST', 'staging-db');
$ sudo service apache2 restart

# Six months later nobody knows which of the 14
# settings differ between staging and prod, or why.`,
      ts: `# ONE image, environment injected per run:
docker run -d --name shop \\
  --env-file staging.env shop:2.4.1

# staging.env          # prod.env
# APP_ENV=staging      # APP_ENV=production
# APP_DEBUG=1          # APP_DEBUG=0
# DB_HOST=staging-db   # DB_HOST=db.internal

# The full diff between environments is the diff
# between two small env files — nothing else.`,
      note: "Twelve-factor config: the artifact never changes between environments, only the injected environment does — so 'what's different about staging?' has a one-file answer.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Data that must outlive a redeploy",
      intro:
        "User uploads must survive shipping a new version. The FTP era solved it with careful exclusion rules; volumes solve it by putting the data outside the container entirely.",
      php: `# The uploads/ directory panic, FTP era
# Deploy = overwrite the webroot... carefully:
rsync -av --exclude 'uploads/' \\
  --exclude 'config.php' \\
  ./build/ deploy@prod:/var/www/shop/
# One forgotten --exclude in 2014 deleted 40,000
# product images. There was a backup. From Tuesday.`,
      ts: `# Uploads live in a volume, not the container:
docker run -d --name shop \\
  -v shop-uploads:/app/uploads shop:2.4.1

# Redeploy = destroy and recreate the container:
docker rm -f shop
docker run -d --name shop \\
  -v shop-uploads:/app/uploads shop:2.5.0
# The volume was never part of the container --
# nothing to exclude, nothing to forget.

docker volume ls    # DRIVER  VOLUME NAME
                    # local   shop-uploads`,
      note: "Containers are disposable by design; volumes are the explicit list of what is NOT disposable. If data matters, it goes in a volume — everything else should be safe to lose.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "nginx listens on port 80 *inside* the container, published to 8080 on the host. Predict which of the two curl commands succeeds — and what exactly answers (or refuses) each one.",
    code: `docker run -d --name web -p 8080:80 nginx:1.27

# nginx is listening on port 80 INSIDE this container.
# Which of these works from the host?

curl -sS -o /dev/null -w "%{http_code}\\n" http://localhost:8080

curl -sS -o /dev/null -w "%{http_code}\\n" http://localhost:80

docker ps --format "table {{.Names}}\\t{{.Ports}}"`,
    output: `$ docker run -d --name web -p 8080:80 nginx:1.27
3f8c2d9a1e5b7c4f0a6d8e2b9c1f5a3d7e4b8c6a0d2f9e1b5c7a3d8f4e6b0c2a

$ curl -sS -o /dev/null -w "%{http_code}\\n" http://localhost:8080
200

$ curl -sS -o /dev/null -w "%{http_code}\\n" http://localhost:80
curl: (7) Failed to connect to localhost port 80 after 0 ms: Connection refused
000

$ docker ps --format "table {{.Names}}\\t{{.Ports}}"
NAMES     PORTS
web       0.0.0.0:8080->80/tcp

# :8080 answers 200 — the -p 8080:80 mapping forwards host 8080
# to container 80, where nginx listens.
# :80 is refused — the container's port 80 exists only inside its
# network namespace. Nothing on the HOST listens on 80; publishing
# 8080:80 opened 8080, and only 8080. The PORTS column reads as
# host 0.0.0.0:8080 -> container 80/tcp.`,
  },

  keyPoints: [
    "Containers are network-isolated by default: an app listening on port 80 inside is unreachable until you publish it with `-p host:container`.",
    "Read `-p 8080:80` as 'host 8080 forwards to container 80' — host side first. Multiple containers can each own their internal port 80 without conflict.",
    "Config that differs per environment (DB hosts, credentials, debug flags) is injected at run time with `-e` or `--env-file` — never baked into the image. That's what lets one image serve dev, staging, and prod.",
    "A container's writable layer dies with the container: anything that must survive a redeploy — uploads, database files — belongs in a volume (`-v name:/path`).",
    "Named volumes are Docker-managed and the production pattern; bind mounts (`-v ./dir:/path`) map host directories in and shine for live-editing code in dev.",
    "The pre-flight checklist: who reaches it (`-p`), what differs per environment (`-e`), what must survive (`-v`). Everything else belongs in the image.",
  ],

  interview: [
    {
      q: "You start a web app container and can't reach it from the browser. Walk me through your reasoning.",
      a: "First suspicion: ports. Containers get their own network namespace, so the app listening on port 80 inside the container is invisible to the host unless it was published — I'd run `docker ps` and read the PORTS column. If it shows `80/tcp` with no arrow, nothing was published and the fix is rerunning with `-p 8080:80`; if it shows `0.0.0.0:8080->80/tcp`, the mapping exists and I'd curl the *host* port, 8080, not 80. If ports check out, next questions in order: is the container actually still running or did PID 1 crash (`docker ps -a` and `docker logs`), and is the app inside binding to 0.0.0.0 rather than 127.0.0.1 — an app that binds only to localhost inside the container is unreachable through the port mapping even when the mapping is correct.",
    },
    {
      q: "Why shouldn't configuration like database credentials be baked into the image?",
      a: "Two reasons: portability and security. The whole value of an image is that the identical artifact runs in every environment — the moment prod credentials are baked in, you either need per-environment images, which reintroduces the drift containers were meant to kill, or you're shipping prod secrets to every laptop that pulls the image. So config that varies goes in the environment — `-e` flags or an `--env-file` — following the twelve-factor principle. It's the mature version of the `.env` pattern from PHP frameworks: the image is like vendor code, the environment is like the .env file you never commit. Baked-in secrets are also effectively public to anyone who can pull the image, since image layers are inspectable.",
    },
    {
      q: "What happens to data a container writes, and how do you handle something like a user-uploads directory?",
      a: "Everything a container writes goes to its thin writable layer, and that layer is deleted with the container. Since the standard deploy is remove-and-recreate — containers are deliberately disposable — any data you care about would be lost on every release. The answer is volumes: `-v shop-uploads:/app/uploads` mounts Docker-managed storage at that path, so the container can be destroyed and recreated freely while the volume persists independently. It's the containerised answer to the old rsync `--exclude uploads/` ritual, but structural instead of hoping someone remembers a flag. For databases it's non-negotiable — postgres:16 with a volume on /var/lib/postgresql/data. In dev I'd use a bind mount instead, mapping my working directory in so code edits are live. The discipline: volumes are the explicit list of what's not disposable.",
    },
  ],

  quiz: [
    {
      question:
        "You run `docker run -d -p 8080:80 nginx:1.27`. Which URL reaches nginx from the host?",
      options: [
        "http://localhost:80 — nginx listens on 80",
        "http://localhost:8080 — host port 8080 forwards to container port 80",
        "Both — Docker publishes both sides of the mapping",
        "Neither — containers can't receive traffic from the host",
      ],
      answerIndex: 1,
      explain:
        "-p host:container, host side first: traffic to the host's 8080 is forwarded to port 80 inside the container's network namespace. The host's own port 80 has nothing listening — the container's 80 exists only inside, which is also why several containers can each use 'their' port 80 simultaneously.",
    },
    {
      question:
        "Why is `-e DB_HOST=...` at run time preferred over writing the DB host into the image?",
      options: [
        "Environment variables are faster to read than files",
        "Images can't contain configuration files",
        "The same immutable image can then run in every environment, with per-environment config injected — and secrets stay out of a pullable artifact",
        "Docker requires all uppercase variables to come from the CLI",
      ],
      answerIndex: 2,
      explain:
        "Twelve-factor config: the artifact never varies between environments; only the injected environment does. Baking config in would mean per-environment images (drift returns) and secrets embedded in inspectable image layers that anyone with pull access can read.",
    },
    {
      question:
        "A Postgres container is removed and recreated during a redeploy. When is the data safe?",
      options: [
        "Always — Docker snapshots the writable layer automatically",
        "Only if a volume was mounted at the data directory, e.g. -v pgdata:/var/lib/postgresql/data",
        "Only if the container was stopped gracefully before removal",
        "Only if the image was pinned by digest",
      ],
      answerIndex: 1,
      explain:
        "The writable layer is deleted with the container — a graceful stop changes nothing about that. A named volume lives outside the container's lifecycle: the new container mounts the same volume and finds the data intact. If data matters, it's in a volume; no volume, no data.",
    },
  ],
};

export default lesson;
