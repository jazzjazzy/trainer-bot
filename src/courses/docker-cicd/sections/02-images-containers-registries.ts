import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "images-containers-registries",
  title: "Images, Containers & Registries",
  part: "From FTP to Containers",
  estMinutes: 10,
  summary:
    "The three-noun mental model — image (read-only template), container (running instance), registry (where images live) — plus how image names, tags, and digests actually work.",

  concept: `
Docker has exactly three nouns you must keep straight. Everything else in
this course hangs off them, and interviewers use them to check whether you've
actually used Docker or just read about it.

### Image: the read-only template

An **image** is a frozen, read-only filesystem snapshot plus metadata (which
command to run, which ports the app listens on, environment defaults). It is
built once and never changes. Two useful mappings from your world:

- like a **class** in OO terms — a definition you instantiate from,
- like a **zipped release build** of an entire server — code, runtime, and
  OS libraries in one archive.

Under the hood an image is a stack of **layers** (each build step adds one),
which is why pulls show multiple progress bars and why unchanged layers are
shared between images and never downloaded twice.

### Container: the running instance

A **container** is a live instance of an image: the image's filesystem plus a
thin writable layer on top, and a running process inside. Class → object;
image → container. You can run twenty containers from one image, each with
its own writable layer, network identity, and lifecycle. When a container is
deleted, its writable layer goes with it — the image underneath is untouched.

A container that has *exited* still exists (its writable layer and logs are
kept) until you \`docker rm\` it. That's why \`docker ps\` shows only running
containers, while \`docker ps -a\` shows exited ones too.

### Registry: where images live

A **registry** is an HTTP service that stores and serves images — Packagist,
but for whole server snapshots instead of PHP packages. **Docker Hub**
(\`docker.io\`) is the default; **GHCR** (\`ghcr.io\`) is GitHub's; companies
run private ones. \`docker pull\` downloads from a registry; \`docker push\`
uploads to one. That's the entire deployment transport — no FTP client, no
rsync.

### Reading an image name

A full image reference has four parts, most of them defaulted:

\`\`\`bash
ghcr.io/acme/shop-api:2.4.1
# └──┬──┘ └─┬─┘ └──┬───┘ └┬──┘
# registry namespace repo  tag

nginx:1.27       # really docker.io/library/nginx:1.27
node             # really docker.io/library/node:latest
\`\`\`

Omit the registry and you get Docker Hub; omit the namespace on Hub and you
get \`library/\` — the official images. Omit the tag and you get \`latest\`.

### \`latest\` is a lie (sort of)

\`latest\` is **just the default tag name** — nothing keeps it pointing at the
newest release, and pulling it tomorrow may give you a different image than
today. Tags are mutable pointers, like a git branch. For anything that must
be reproducible, pin a real version tag (\`node:22-alpine\`), or go further:

\`\`\`bash
docker pull nginx@sha256:1a83bf0ee5bcf6b8a24bcb03e3d24bbef7bfa279441a3e05fa2e6249ed42dba7
\`\`\`

A **digest** (\`@sha256:...\`) is a content address — the hash of the image
itself. It can never point at anything else, like a git commit SHA instead of
a branch name. Tag for humans, digest for machines that must never be
surprised.
`,

  comparisons: [
    {
      label: "Getting a 'copy of prod' to work with",
      intro:
        "You need the production environment somewhere else — a new server, a teammate's machine. The manual way clones the box; the container way pulls a named artifact.",
      php: `# Cloning the snowflake, 2010-style
ssh root@prod-01
$ tar czf /tmp/www.tar.gz /var/www /etc/apache2 /etc/php5
$ exit
scp root@prod-01:/tmp/www.tar.gz .
scp www.tar.gz root@new-box:/tmp/

# ...then untar and discover new-box has a different
# distro, different apache version, different paths.
# Half the config doesn't apply. Two days of fixing.`,
      ts: `# Pull the exact same artifact anywhere Docker runs
docker pull nginx:1.27

# Or byte-for-byte certainty with a digest:
docker pull nginx@sha256:1a83bf0ee5bcf6b8a24bcb03e3d24bbef7bfa279441a3e05fa2e6249ed42dba7

# Same command on a laptop, a CI runner, or a prod
# host — the registry serves the identical layers.`,
      note: "The tarball copies files out of one hand-built environment into another; the image IS the environment, and the registry serves it identically to any machine that asks.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Pinning dependencies: Composer vs image tags",
      intro:
        "You already know this problem from Composer: a loose constraint means tomorrow's install differs from today's. Image tags work the same way — and digests are the lock file.",
      php: `{
  "require": {
    "monolog/monolog": "^2.0",
    "guzzlehttp/guzzle": "*"
  }
}
// "*" and "^2.0" float: composer install next month
// resolves different versions than it did today.
// That's why composer.lock exists — it pins the
// EXACT resolved version of every package.`,
      ts: `# Image tags float exactly like version constraints:
docker pull node:latest    # ~ "*"        anything
docker pull node:22        # ~ "^22.0"    latest 22.x
docker pull node:22-alpine # narrower, still a moving pointer

# The digest is your composer.lock — content-addressed,
# can never change what it points to:
docker pull node@sha256:9f8c2aa5c1a6b6f8f9e37c8b5a13e94b0a2f3ec8ab1a67e0e4bfae55f6b74a21`,
      note: "A tag is a mutable pointer (git branch); a digest is a content hash (git commit). CI systems and production manifests pin digests for the same reason you commit composer.lock.",
      leftLang: "json",
      rightLang: "bash",
    },
    {
      label: "One image, many containers",
      intro:
        "The class/object relationship in action: instantiate three independent web servers from one downloaded image.",
      php: `# The manual equivalent: three apache instances on
# one box meant three configs, three sets of ports,
# and editing /etc/apache2/ports.conf by hand
sudo cp -r /etc/apache2 /etc/apache2-site2
sudo nano /etc/apache2-site2/ports.conf   # Listen 8081
sudo nano /etc/apache2-site2/apache2.conf # pid file, logs...
sudo /usr/sbin/apache2ctl -f /etc/apache2-site2/apache2.conf
# repeat for site3, get one path wrong, spend an evening`,
      ts: `# Image = class, container = object:
docker run -d --name site1 -p 8081:80 nginx:1.27
docker run -d --name site2 -p 8082:80 nginx:1.27
docker run -d --name site3 -p 8083:80 nginx:1.27

# Three isolated instances, one image on disk.
# Each has its own writable layer, network, and logs.
docker rm -f site2   # delete one; the image and the
                     # other two are untouched`,
      note: "Containers instantiated from the same image share its read-only layers on disk — the per-container cost is just the thin writable layer, which is why running many instances is cheap.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "A pull, then the two listing commands. Predict: which command shows images and which shows containers — and why does the exited hello-world container still appear even though nothing is running?",
    code: `docker pull nginx:1.27

# List what's on this machine — two different nouns:
docker images

docker ps

docker ps -a

# Earlier today, 'docker run hello-world' was run WITHOUT --rm.
# Predict: what does each listing show, and where does
# hello-world appear — in images, ps, ps -a, or several?`,
    output: `$ docker pull nginx:1.27
1.27: Pulling from library/nginx
302e3ee49805: Pull complete
e08e8a4b8ecb: Pull complete
7a9a1b8f9c3d: Pull complete
Digest: sha256:1a83bf0ee5bcf6b8a24bcb03e3d24bbef7bfa279441a3e05fa2e6249ed42dba7
Status: Downloaded newer image for nginx:1.27
docker.io/library/nginx:1.27

$ docker images
REPOSITORY    TAG       IMAGE ID       CREATED       SIZE
nginx         1.27      a59f2ecf3b25   3 weeks ago   197MB
hello-world   latest    d2c94e258dcb   8 months ago  13.3kB

$ docker ps
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES

$ docker ps -a
CONTAINER ID   IMAGE         COMMAND    CREATED          STATUS                      PORTS     NAMES
9c4f1e7ab210   hello-world   "/hello"   25 minutes ago   Exited (0) 25 minutes ago             upbeat_lamarr

# docker images lists IMAGES (templates on disk): both nginx and
# hello-world, because pulling/running caches the image either way.
# docker ps lists RUNNING containers: none — hello-world printed
# its message and exited.
# docker ps -a includes EXITED containers: the hello-world container
# still exists (writable layer + logs kept) because it was run
# without --rm and nobody ran 'docker rm'. Note the random NAME
# Docker generated since --name wasn't given.`,
  },

  keyPoints: [
    "Image = read-only template (class / zipped release build of a whole server); container = running instance with a thin writable layer (object); registry = image host (Packagist for server snapshots).",
    "Full image reference: `registry/namespace/repo:tag` — defaults fill in `docker.io`, `library/`, and `:latest` when omitted, so `nginx` means `docker.io/library/nginx:latest`.",
    "`latest` is just the default tag name, not a guarantee of newness — tags are mutable pointers, like git branches.",
    "A digest (`@sha256:...`) is a content address that can never point to different bytes — the composer.lock / git-commit-SHA of images. Pin digests where reproducibility matters.",
    "Images are stacks of shared layers, so pulling shows one progress bar per layer and identical layers are stored and downloaded only once.",
    "An exited container still exists (visible with `docker ps -a`) until you `docker rm` it — stopping is not deleting.",
  ],

  interview: [
    {
      q: "Explain the difference between an image and a container.",
      a: "An image is a read-only, layered filesystem snapshot plus metadata — the start command, exposed ports, default environment. It's built once and is immutable. A container is a running instance of an image: Docker adds a thin writable layer on top and starts the image's command as an isolated process. The relationship is class-to-object — one image can back any number of containers, each with its own writable layer, network identity, and lifecycle. Deleting a container throws away only its writable layer; the image is untouched. And a subtlety that shows real usage: a container that has exited still exists, with its logs and filesystem changes, until you explicitly remove it — that's why `docker ps -a` shows things `docker ps` doesn't.",
    },
    {
      q: "What does the `latest` tag actually mean, and how would you make a deployment reproducible?",
      a: "`latest` is nothing more than the default tag applied when you don't specify one — it's a naming convention, not a promise. Tags are mutable pointers, like git branches: `node:22` points at whatever the maintainers last published under that name, so pulling it on two days can give two different images. For reproducibility I'd pin progressively harder: a specific version tag like `node:22-alpine` for day-to-day work, and an immutable digest — `node@sha256:...`, a content hash of the image itself — anywhere surprise is unacceptable, like production manifests or security-sensitive CI. It's exactly the composer.json versus composer.lock distinction: constraints for humans, exact pins for machines.",
    },
    {
      q: "What is a registry and how does it change how you deploy compared to FTP?",
      a: "A registry is an HTTP service that stores and serves images — Docker Hub is the public default, GHCR is GitHub's, and most companies run a private one. It replaces the transport layer of deployment entirely: instead of FTP-ing files into a live server, CI builds an image, pushes it to the registry with `docker push`, and every environment pulls that exact artifact by name. That gives you things FTP never could: content-addressed integrity via digests, a full version history where rollback means pulling the previous tag, layer deduplication so you only transfer what changed, and access control with audit trails instead of a shared FTP password in a text file.",
    },
  ],

  quiz: [
    {
      question: "What does the bare image name `nginx` actually resolve to?",
      options: [
        "The newest nginx release, verified against nginx.org",
        "docker.io/library/nginx:latest — default registry, official-images namespace, default tag",
        "A locally built image named nginx",
        "It's an error — a registry must always be specified",
      ],
      answerIndex: 1,
      explain:
        "Every omitted part gets a default: registry defaults to Docker Hub (docker.io), the namespace for official images is library/, and the tag defaults to latest. And latest itself is just a tag name — a mutable pointer with no guarantee of being the newest release.",
    },
    {
      question:
        "You ran a container yesterday and it exited. Which command shows it, and why does it still exist?",
      options: [
        "docker images — exited containers become images",
        "docker ps — all containers are always listed",
        "docker ps -a — an exited container keeps its writable layer and logs until you docker rm it",
        "Nothing — containers are deleted automatically on exit",
      ],
      answerIndex: 2,
      explain:
        "Stopping and deleting are separate steps. An exited container's writable layer and logs are preserved for inspection until you remove it with docker rm (or ran it with --rm to auto-remove). docker ps shows only running containers; -a includes exited ones.",
    },
    {
      question:
        "Why would a production deploy pin an image by digest (@sha256:...) instead of a tag?",
      options: [
        "Digests download faster because they skip the registry lookup",
        "Tags are mutable pointers that can be re-pushed to different images; a digest is a content hash that can only ever refer to those exact bytes",
        "Digests include security patches automatically",
        "Tags expire after 90 days on Docker Hub",
      ],
      answerIndex: 1,
      explain:
        "A tag like 2.4.1 can be overwritten by a re-push — tomorrow it might serve different bytes. A digest is computed from the image content itself, so it's immutable by construction: the git-commit-SHA of images, versus the branch name that a tag is.",
    },
  ],
};

export default lesson;
