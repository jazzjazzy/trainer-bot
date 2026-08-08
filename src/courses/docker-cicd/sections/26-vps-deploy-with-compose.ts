import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "vps-deploy-with-compose",
  title: "Deploying to a VPS with Compose",
  part: "Deploy & Operate",
  estMinutes: 13,
  summary:
    "A $6 VPS running Docker plus a production compose.yaml gives you a real, affordable deploy target — CI builds the image, the server only pulls and runs it.",

  concept: `
You do not need Kubernetes to deploy like a professional. A single cheap VPS —
the same class of machine you used to run a LAMP stack on — becomes a solid
production target the moment it runs Docker. The difference from your old
setup is philosophical, and it is the line interviewers listen for:

**The server never builds anything. It only runs pre-built, tested artifacts.**

No \`git pull\` on the server. No \`composer install\` on the server. No compiler,
no Node, no build tools installed at all. CI built the image, tested it, and
pushed it to a registry. The server's entire job is: pull that image, run it.

### The production compose.yaml

Your local \`compose.yaml\` says \`build: .\` — that is a dev convenience. The
production file on the server names an exact image instead:

\`\`\`yaml
# /srv/app/compose.yaml (on the VPS)
services:
  api:
    image: ghcr.io/acme/api:\${TAG:-latest}
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:3000:3000"   # bind to loopback; a reverse proxy fronts it
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16
    restart: unless-stopped
    volumes:
      - dbdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      timeout: 3s
      retries: 5
volumes:
  dbdata:
\`\`\`

Three things to notice. \`image:\` instead of \`build:\` — the server has no
source code to build from, on purpose. \`restart: unless-stopped\` — Docker
restarts crashed containers and brings everything back after a reboot, the job
your old \`@reboot\` crontab and monit configs used to do. And the tag comes
from an environment variable, so deploying a new version is just changing
\`TAG\` and re-running \`up\`.

For TLS, put a reverse proxy in front — Caddy is the pragmatic choice because
it provisions and renews Let's Encrypt certificates automatically; nginx plus
certbot is the classic alternative. Either runs as just another service in the
same compose file.

### The deploy is two commands

\`\`\`bash
docker compose pull   # fetch new image layers from the registry
docker compose up -d  # recreate only containers whose config/image changed
\`\`\`

\`up -d\` is smart: it diffs desired state against running state. If only the
\`api\` image changed, only \`api\` is recreated — the database keeps running,
untouched. That is your whole deploy. CI triggers it over SSH:

\`\`\`yaml
# .github/workflows/deploy.yml (the deploy job, after build-and-push)
deploy:
  needs: build
  runs-on: ubuntu-latest
  steps:
    - name: Deploy over SSH
      env:
        SSH_KEY: \${{ secrets.DEPLOY_SSH_KEY }}
      run: |
        install -m 600 /dev/null key && echo "\$SSH_KEY" > key
        ssh -i key -o StrictHostKeyChecking=accept-new \\
          deploy@\${{ secrets.DEPLOY_HOST }} \\
          "cd /srv/app && TAG=sha-\${GITHUB_SHA::7} docker compose pull && TAG=sha-\${GITHUB_SHA::7} docker compose up -d"
\`\`\`

The host and private key live in GitHub Actions secrets. The server needs a
one-time \`docker login ghcr.io\` with a read-only token so it can pull private
images — after that the credential is stored and every pull just works.

### Housekeeping the VPS still needs

Old images accumulate and VPS disks are small. Add a periodic
\`docker image prune -af --filter "until=168h"\` (cron on the server, or a step
at the end of the deploy) to drop images older than a week — but keep a few
recent tags around, because they are your instant rollback path.
`,

  comparisons: [
    {
      label: "Shipping a release to the server",
      intro:
        "A new version needs to go live. One way is a human with FileZilla and a memory of which files changed; the other is a workflow step that runs the same two commands every time.",
      php: `# The FTP-era deploy, from memory
# 1. Open FileZilla, connect to the server
# 2. Drag changed files into public_html/
#    (hope you remembered ALL of them)
# 3. SSH in to fix the config the upload clobbered
ssh admin@203.0.113.10
nano /var/www/public_html/config.php   # edit live, in prod
service apache2 restart
# 4. Refresh the site and pray`,
      ts: `# .github/workflows/deploy.yml — the deploy step
- name: Deploy over SSH
  env:
    SSH_KEY: \${{ secrets.DEPLOY_SSH_KEY }}
  run: |
    install -m 600 /dev/null key && echo "\$SSH_KEY" > key
    ssh -i key -o StrictHostKeyChecking=accept-new \\
      deploy@\${{ secrets.DEPLOY_HOST }} \\
      "cd /srv/app && \\
       TAG=sha-\${GITHUB_SHA::7} docker compose pull && \\
       TAG=sha-\${GITHUB_SHA::7} docker compose up -d"`,
      note:
        "The workflow deploys the exact image CI just built and tested — no partial uploads, no live config edits, and the same commands run identically for release 500 as for release 5.",
    },
    {
      label: "Building on the server vs pulling an artifact",
      intro:
        "Getting new code running. The old way rebuilds the app on the production box; the new way downloads an immutable image that was built and tested elsewhere.",
      php: `# On the production server, as part of every deploy
cd /var/www/app
git pull origin main
composer install --no-dev
# Now pray the server's PHP version, extensions and
# composer cache produce the same result as staging.
# If composer fails halfway, prod is broken mid-deploy.
service php8.1-fpm restart`,
      ts: `# On the production server — no git, no build tools
cd /srv/app
TAG=sha-9f8e7d1 docker compose pull
TAG=sha-9f8e7d1 docker compose up -d
# The image was built once in CI and already passed
# tests. Pull either fully succeeds or changes nothing —
# the running containers are untouched until 'up'.`,
      rightLang: "bash",
      note:
        "git pull + composer install can fail halfway and leave prod broken; docker compose pull is atomic per image, and the old container keeps serving until the new one replaces it.",
    },
    {
      label: "Surviving a reboot",
      intro:
        "The VPS provider reboots the host for maintenance at 3am. What brings your services back?",
      php: `# The old insurance policy
crontab -e
# @reboot /usr/local/bin/start-everything.sh
cat /usr/local/bin/start-everything.sh
#!/bin/bash
service mysql start
service apache2 start
service memcached start   # added 2019, forgot redis
# ...and hope the script kept pace with the stack`,
      ts: `# compose.yaml — the restart policy is per service
services:
  api:
    image: ghcr.io/acme/api:\${TAG:-latest}
    restart: unless-stopped
  db:
    image: postgres:16
    restart: unless-stopped
# Docker's daemon starts on boot and restores every
# container marked unless-stopped — no script to forget.`,
      note:
        "restart: unless-stopped covers both crashes and reboots, and it lives next to the service definition — it can never drift out of sync with the stack the way a hand-maintained boot script did.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "The deploy transcript, live on the VPS. CI pushed ghcr.io/acme/api:sha-9f8e7d1 and triggered this over SSH. Predict: which layers download during pull, which services get recreated by up -d, and why the database container's CREATED time doesn't change.",
    code: `# You are deploy@vps, in /srv/app. Current release: sha-4c2b8aa
export TAG=sha-9f8e7d1

docker compose pull

docker compose up -d

docker compose ps`,
    output: `$ export TAG=sha-9f8e7d1
$ docker compose pull
[+] Pulling 8/8
 ✔ db Skipped - Image is already present locally
 ✔ api 7 layers [⣿⣿⣿⣿⣿⣿⣿]  Pulled                    4.1s
   ✔ 9d3a1e4f2c1b Already exists                       0.0s
   ✔ 1f0c9b8d7e6a Already exists                       0.0s
   ✔ 6b5a4c3d2e1f Already exists                       0.0s
   ✔ e2d1c0b9a8f7 Already exists                       0.0s
   ✔ a7b6c5d4e3f2 Pull complete                        1.9s
   ✔ f1e2d3c4b5a6 Pull complete                        2.6s
   ✔ 0a9b8c7d6e5f Pull complete                        3.8s
$ docker compose up -d
[+] Running 2/2
 ✔ Container app-db-1   Running                        0.0s
 ✔ Container app-api-1  Started                        1.4s
$ docker compose ps
NAME        IMAGE                        STATUS                 PORTS
app-api-1   ghcr.io/acme/api:sha-9f8e7d1 Up 5 seconds (healthy) 127.0.0.1:3000->3000/tcp
app-db-1    postgres:16                  Up 6 days (healthy)    5432/tcp

# Why: pull only downloaded the 3 layers that changed (the base
# layers were already on disk). up -d recreated ONLY api — its image
# changed. db's image and config are identical, so Compose left it
# alone: "Up 6 days".`,
  },

  keyPoints: [
    "Production philosophy: the server never builds — CI builds, tests, and pushes the image; the VPS only runs `docker compose pull && docker compose up -d`.",
    "The production compose.yaml uses `image: ghcr.io/acme/api:$TAG` instead of `build:` — there is no source code on the server, by design.",
    "`restart: unless-stopped` replaces the @reboot crontab: Docker restarts crashed containers and restores everything after a host reboot.",
    "`docker compose up -d` recreates only services whose image or config changed — deploying a new api image never touches the running database.",
    "One-time `docker login ghcr.io` on the server with a read-only token lets it pull private images; GitHub Actions secrets hold the SSH host and key for the deploy job.",
    "Prune old images periodically (`docker image prune -af --filter \"until=168h\"`) so the VPS disk survives — but keep recent tags as your rollback path.",
  ],

  interview: [
    {
      q: "Walk me through how you'd deploy a containerised app to a single VPS.",
      a: "CI builds the image on every merge to main, runs the tests, and pushes it to a registry like GHCR tagged with the commit SHA. The VPS runs Docker and holds a production compose.yaml that references that image by tag — `image:`, never `build:`, because the server should only run pre-built, tested artifacts. The workflow's deploy job SSHes in using a key stored in Actions secrets and runs `docker compose pull` then `docker compose up -d`; Compose recreates only the services whose image changed, so the database keeps running. TLS is handled by a reverse proxy like Caddy running as another service in the same file. It's the same class of $6 machine I ran LAMP stacks on for years — the difference is nothing is ever built or hand-edited on it.",
    },
    {
      q: "Why is it considered bad practice to run git pull and build on the production server?",
      a: "Three reasons. First, the artifact you run is no longer the artifact you tested — the build happens again on prod with whatever tool versions that box has, so 'it passed CI' guarantees nothing. Second, builds can fail halfway: a composer or npm install that dies mid-deploy leaves production in a broken intermediate state, whereas `docker compose pull` either completes or changes nothing while the old container keeps serving. Third, it bloats the attack surface — the server needs git, compilers, package managers and repo credentials it otherwise wouldn't have. An immutable image built once in CI and pulled everywhere eliminates all three.",
    },
    {
      q: "Your app image on the server is private. How does the VPS pull it, and how do you stop old images filling the disk?",
      a: "The server needs to authenticate to the registry once: `docker login ghcr.io` with a token that has read-only package scope — least privilege, since the server only ever pulls. Docker stores that credential, so subsequent `docker compose pull` calls just work. For disk hygiene, every pulled release leaves the previous image behind, which is deliberate — those old tags are the instant rollback path — but unbounded they'll fill a small VPS disk. I schedule `docker image prune -af --filter \"until=168h\"` via cron or as a post-deploy step, which keeps roughly a week of rollback candidates and deletes anything older.",
    },
  ],

  quiz: [
    {
      question:
        "Why does the production compose.yaml use `image: ghcr.io/acme/api:TAG` instead of `build: .`?",
      options: [
        "build: is not supported when a volumes: section is present",
        "The server should only run pre-built, tested images from CI — it has no source code or build tools",
        "image: is faster to parse than build: at startup",
        "Registries reject images that were built with compose",
      ],
      answerIndex: 1,
      explain:
        "The core production principle: CI builds and tests the artifact once, and the server only pulls and runs it. No git, no compilers, no half-finished builds on prod — build: is a local-dev convenience.",
    },
    {
      question:
        "After `docker compose pull` fetches a new api image, what does `docker compose up -d` do to the running db service?",
      options: [
        "Recreates it along with every other service",
        "Stops it during the deploy and restarts it after",
        "Nothing — its image and config are unchanged, so Compose leaves it running",
        "Restarts it only if api has depends_on: db",
      ],
      answerIndex: 2,
      explain:
        "up -d diffs desired state against running state and recreates only services whose image or configuration changed. The db container keeps its uptime — which the transcript shows as 'Up 6 days'.",
    },
    {
      question:
        "What does `restart: unless-stopped` give you on a VPS?",
      options: [
        "Zero-downtime deploys between image versions",
        "Automatic container restarts after crashes and after host reboots, unless you manually stopped the container",
        "A rollback to the previous image if the container exits non-zero",
        "Graceful connection draining before stopping",
      ],
      answerIndex: 1,
      explain:
        "It's the modern @reboot crontab: the Docker daemon restarts the container on crash and restores it on boot. It does not do zero-downtime handovers or rollbacks — those are separate patterns.",
    },
  ],
};

export default lesson;
