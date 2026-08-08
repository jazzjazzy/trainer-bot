import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "works-on-my-machine",
  title: "Works on My Machine: Why Containers",
  part: "From FTP to Containers",
  estMinutes: 10,
  summary:
    "Containers package your app together with its runtime, OS libraries, and config into one immutable, portable artifact — killing 'works on my machine' at the source.",

  concept: `
You have lived the problem this course solves. You build a PHP app locally,
FTP the changed files to a shared host, and discover that production runs
PHP 5.6 while you developed on 7.2. Or the \`gd\` extension is missing. Or the
host's \`php.ini\` has \`allow_url_fopen\` off. The app is identical — the
**environment** is not, and the environment was never part of the deploy.

### What actually gets deployed

An FTP upload ships maybe 2% of what your app needs to run: the code. The
other 98% — the PHP/Node/Python runtime and its exact version, its
extensions, the OS packages (\`libpng\`, \`libssl\`, ImageMagick), the web
server config, the environment variables — lives on the server, assembled by
hand over months of SSH sessions, and documented (if you're lucky) on a wiki
page nobody kept current. Every server drifts into a unique snowflake, and
"works on my machine" is the inevitable result: dev and prod are literally
different machines running different software.

### The container proposition

A container flips the deploy unit. Instead of shipping code *into* an
environment, you ship the code **and the environment together** as a single
artifact called an **image**:

- the app code,
- the exact runtime (\`node:22-alpine\`, \`python:3.12-slim\`),
- every OS library it needs,
- and the command that starts it.

The image is **immutable** — it is built once and never modified, only
replaced by a new version. It is **portable** — the same image runs on your
laptop, in CI, and in production, byte-for-byte identical. The question "does
prod have the right PHP version?" stops existing, because the runtime version
is *inside the artifact*. In PHP terms: instead of FTP-ing a diff of files
into a mystery server, you ship a snapshot of the whole working server.

### Containers are not VMs

Your instinct might be "so it's a virtual machine". Close, but the difference
matters (and comes up in interviews):

- A **VM** virtualises hardware and boots a full guest operating system with
  its own kernel. Gigabytes on disk, minutes to boot.
- A **container** is just a normal process on the host, isolated by two Linux
  kernel features: **namespaces** (its own view of the filesystem, network,
  and process table) and **cgroups** (CPU/memory limits). All containers
  share the host's kernel.

The consequence: containers start in milliseconds-to-seconds, weigh megabytes
instead of gigabytes, and you can run dozens on a laptop that would struggle
with three VMs. The trade-off is weaker isolation than a VM — fine for
running your own workloads, which is the normal case.

\`\`\`bash
# The whole pitch in two commands — no apt-get, no compiling, no config:
docker pull nginx:1.27      # fetch a complete, working web server
docker run -d -p 8080:80 nginx:1.27   # it is serving traffic in ~1 second
\`\`\`

### Why this matters for your job hunt

"Docker experience" on a job ad rarely means Kubernetes wizardry. It means:
can you explain image vs container, write a Dockerfile, and reason about why
teams ship containers instead of files? All of that maps directly onto ops
knowledge you already have — you know exactly what a mis-configured server
costs, which is precisely the pain containers remove.
`,

  comparisons: [
    {
      label: "Deploying a change to production",
      intro:
        "Ship a new version of an app. The manual version is an FTP upload plus an SSH session to fix the environment; the container version is one pull and one run.",
      php: `# The Tuesday-night deploy ritual, ca. 2009
# 1. Upload changed files (and pray you got them all)
ftp ftp.example.com
> cd public_html
> put index.php
> put lib/db.php
> bye

# 2. SSH in because the new code needs an extension
ssh deploy@prod-01
$ php -v
PHP 5.6.40 (cli)          # dev machine runs 7.2...
$ sudo apt-get install php-gd
$ sudo nano /etc/php5/apache2/php.ini
$ sudo service apache2 restart
# 3. Refresh the browser and hope`,
      ts: `# The container deploy: the environment ships WITH the code
docker pull registry.example.com/shop:2.4.1
docker stop shop && docker rm shop
docker run -d --name shop -p 80:3000 \\
  registry.example.com/shop:2.4.1

# Node version? Extensions? OS libraries? All inside
# the image — identical to what passed CI yesterday.
# Rollback is the same command with tag 2.4.0.`,
      note: "The FTP deploy ships code into an unknown environment; the container deploy ships code and environment as one tested, immutable artifact — and rolling back is just running the previous tag.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Documenting the server setup",
      intro:
        "How a new team member (or a replacement server) learns what the app needs to run. A wiki page describes it; a Dockerfile executes it.",
      php: `# wiki/server-setup.txt  (last updated: 14 months ago)
#
# Setting up a new prod box:
#  1. Ubuntu 16.04 (NOT 18.04, breaks the pdf lib)
#  2. sudo apt-get install apache2 php7.0 php7.0-mysql
#  3. also php-gd? (check with Dave)
#  4. copy php.ini from prod-01 -- it has the
#     memory_limit fix from the March incident
#  5. a2enmod rewrite && service apache2 restart
#  6. crontab -e -> paste the queue worker line
#  7. there is a step 7 but nobody remembers it`,
      ts: `# Dockerfile — the setup doc that cannot go stale,
# because it IS how every environment is built
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/server.js"]`,
      note: "The wiki page drifts from reality the day after it's written; the Dockerfile is executable documentation — if it builds, it's accurate, and every environment from laptop to prod is built from it identically.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "The classic first Docker command, run twice in a row. Before revealing the output, predict what the SECOND run prints — does Docker download the image again?",
    code: `# Run the hello-world container twice.
# --rm deletes the container (not the image) after it exits.

docker run --rm hello-world

# ...and immediately run the exact same command again:

docker run --rm hello-world

# Predict: which lines from the first run are missing
# from the second, and why?`,
    output: `$ docker run --rm hello-world
Unable to find image 'hello-world:latest' locally
latest: Pulling from library/hello-world
e6590344b1a5: Pull complete
Digest: sha256:940c619fbd418f9b2b1b63e25d8861f9cc1b46e3fc8b018ccfe8b78f19b8cc4f
Status: Downloaded newer image for hello-world:latest

Hello from Docker!
This message shows that your installation appears to be working correctly.

$ docker run --rm hello-world

Hello from Docker!
This message shows that your installation appears to be working correctly.

# Second run: no "Pulling", no "Pull complete", no "Digest" lines.
# The image is already in the local image cache, so Docker starts a
# fresh container from it instantly. --rm removed the exited
# CONTAINER after each run, but the IMAGE stays cached until you
# remove it yourself (docker rmi).`,
  },

  keyPoints: [
    "'Works on my machine' happens because an FTP/scp deploy ships only the code — the runtime version, extensions, OS libraries, and config all live on the server and drift over time.",
    "An image packages app + runtime + OS libraries + start command into one **immutable, portable artifact**; the same image runs identically on a laptop, in CI, and in production.",
    "A container is an isolated *process* on the host (Linux namespaces + cgroups), not a virtual machine — all containers share the host kernel.",
    "Because there's no guest OS to boot, containers start in milliseconds-to-seconds and weigh megabytes; VMs boot a full OS and weigh gigabytes.",
    "Deploying becomes `docker pull` + `docker run`, and rolling back is running the previous image tag — no SSH archaeology.",
    "A Dockerfile is your old server-setup wiki page turned into executable, un-driftable documentation.",
  ],

  interview: [
    {
      q: "What problem do containers solve, in practical terms?",
      a: "Environment drift. Traditionally you deploy code into an environment that was assembled by hand — a specific runtime version, OS packages, config files — and dev, staging, and prod each drift into unique snowflakes, which is where 'works on my machine' comes from. I spent years debugging exactly that: an app that ran fine locally and broke on a host with a different PHP version or a missing extension. A container image packages the application *with* its runtime, OS libraries, and start command into one immutable artifact, so the thing you tested is bit-for-bit the thing you run in production. Deploys become pulling and running an image, and rollback is just running the previous tag.",
    },
    {
      q: "How is a container different from a virtual machine?",
      a: "A VM virtualises hardware and boots a complete guest operating system with its own kernel — gigabytes of disk, minutes to start. A container is an ordinary process on the host that the Linux kernel isolates using namespaces, for its own view of the filesystem, network, and process table, and cgroups, for CPU and memory limits. All containers share the host's kernel, so there's nothing to boot: they start in milliseconds and cost megabytes. The trade-off is that kernel sharing gives weaker isolation than a hypervisor, which is why multi-tenant platforms sometimes still wrap containers in lightweight VMs — but for running your own services, containers are the right unit.",
    },
    {
      q: "Your team deploys by FTP and it mostly works. How would you argue for containers?",
      a: "I'd frame it as risk, not fashion. FTP deploys have no atomic cutover — users can hit a half-uploaded site; there's no reliable rollback — you'd have to re-upload the old files and hope the server environment hasn't changed; and the server itself is unreproducible — if it dies, rebuilding it depends on tribal knowledge. Containers fix all three: an image deploy is atomic (the new container either starts or it doesn't), rollback is re-running the previous image tag in seconds, and the Dockerfile makes every environment rebuildable from scratch. I'd also point out it de-risks hiring and onboarding: a new developer runs one command and has the exact production environment locally, instead of two days of setup-guide archaeology.",
    },
  ],

  quiz: [
    {
      question:
        "What is the core reason 'works on my machine' happens with FTP-style deploys?",
      options: [
        "FTP corrupts files during transfer",
        "Only the code is deployed — the runtime, OS libraries, and config live on the server and differ from the dev machine",
        "Shared hosts throttle PHP execution speed",
        "FTP doesn't support binary file transfers",
      ],
      answerIndex: 1,
      explain:
        "The deploy artifact (the code) is a small fraction of what the app needs. The runtime version, extensions, OS packages, and config are all part of the server, assembled separately on each machine — so dev and prod are genuinely different environments. Containers fix this by putting the environment inside the deploy artifact.",
    },
    {
      question: "Which statement about containers vs VMs is correct?",
      options: [
        "Containers each boot their own kernel for stronger isolation",
        "VMs start faster because they skip the container runtime",
        "Containers are isolated processes sharing the host kernel via namespaces and cgroups; VMs boot a full guest OS",
        "Containers can only run one at a time per host",
      ],
      answerIndex: 2,
      explain:
        "A container is a normal host process wrapped in kernel isolation (namespaces for visibility, cgroups for resource limits) — nothing boots, so it starts in milliseconds. A VM virtualises hardware and runs a complete guest OS with its own kernel, which is why it costs gigabytes and boot time.",
    },
    {
      question:
        "You run `docker run --rm hello-world` twice in a row. What differs on the second run?",
      options: [
        "Nothing — the image downloads again every time",
        "The image download (pull) is skipped because the image is already cached locally",
        "The second run fails because --rm deleted the image",
        "The second run reuses the same container from the first run",
      ],
      answerIndex: 1,
      explain:
        "`--rm` removes the exited *container*, not the *image*. The image stays in the local cache after the first pull, so the second run starts a brand-new container from it instantly with no download. Removing images is a separate operation (`docker rmi`).",
    },
  ],
};

export default lesson;
