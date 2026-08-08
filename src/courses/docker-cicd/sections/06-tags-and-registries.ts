import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "tags-and-registries",
  title: "Tags, Push & Pull: Using Registries",
  part: "From FTP to Containers",
  estMinutes: 11,
  summary:
    "A registry is where images live between machines: you tag an image, push it once, and every server pulls the exact same artifact — digests, not dated tarballs, are the truth about what's running.",

  concept: `
For twenty years your release artifact was a tarball: zip the code, \`scp\` it to
the server, unzip it over the old version, hope you remembered everything. The
container world replaces that tarball with the **image**, and replaces the
\`releases/\` folder on the server with a **registry** — a versioned, HTTP-served
warehouse of images that both your laptop and your servers talk to.

### Anatomy of an image reference

A full image reference has four parts:

\`\`\`
ghcr.io / acme / myapp : 1.4.2
registry  namespace  repository  tag
\`\`\`

Everything except the repository has a default. \`node:22-alpine\` really means
\`docker.io/library/node:22-alpine\` — Docker Hub is the default registry, and
\`library/\` is the namespace for official images. If you omit the tag you get
\`:latest\`, which is just a tag like any other — nothing keeps it up to date.

### \`docker tag\` creates an alias, not a copy

\`\`\`bash
docker tag myapp:dev ghcr.io/acme/myapp:1.4.2
\`\`\`

This copies nothing. Both names now point at the same image ID — think of a
tag as a symlink to a build, the way \`current -> releases/2024-06-01/\` worked
in your deploy scripts. Tagging is instant; it's the *push* that moves bytes.

### login, push, pull

\`\`\`bash
echo $CR_PAT | docker login ghcr.io -u jason --password-stdin
docker push ghcr.io/acme/myapp:1.4.2
# ...later, on the server:
docker pull ghcr.io/acme/myapp:1.4.2
\`\`\`

Registries authenticate with tokens, not your account password — for
\`ghcr.io\` (GitHub Container Registry) that's a personal access token locally
and the built-in \`GITHUB_TOKEN\` in CI. The main registry options:

- **Docker Hub** (\`docker.io\`) — the default; where official images live.
- **GitHub Container Registry** (\`ghcr.io\`) — images live next to your repo,
  share its permissions, and CI can push without extra credentials.
- **Self-hosted / cloud** — Harbor, or a cloud registry (ECR, GAR, ACR) when
  images must stay inside your network.

Push and pull work **layer by layer**. Layers are content-addressed, so the
registry already knowing a layer means it is skipped — that's the
\`Layer already exists\` you'll see in the playground. Push a 140 MB image,
change one source file, push again: only the few layers that changed transfer.
Compare that to re-uploading the whole tarball because you couldn't tell what
changed.

### Tag strategy: why deploying \`:latest\` is a trap

Tags are **mutable pointers**. \`:latest\` on Tuesday and \`:latest\` on Friday
can be entirely different images. If your server runs \`myapp:latest\`, you
cannot tell what's actually deployed, two servers can silently run different
builds, and there is no "previous latest" to roll back to. A sane strategy
tags every build several ways:

- **Semver**: \`1.4.2\`, plus the floating \`1.4\` and \`1\` conveniences.
- **Git SHA**: \`sha-a1b2c3d\` — an exact, greppable link back to the commit.
- \`:latest\` — fine as a *convenience for humans* pulling locally; never what
  a deploy script references.

### Digests: the immutable truth

Behind every tag sits a **digest** — \`@sha256:...\`, a content hash of the
image manifest. Tags move; digests never do. \`docker pull
ghcr.io/acme/myapp@sha256:8f4e...\` fetches exactly one build, forever.
Production systems and security-conscious CI pin by digest for that reason,
and \`docker inspect\` shows you the digest of anything you're running — the
definitive answer to "what exactly is on this server?", a question the
tarball era answered with \`ls -la\` and guesswork.
`,

  comparisons: [
    {
      label: "Shipping a release",
      intro:
        "Get version 1.4.2 of the app onto infrastructure. The left side moves a tarball to one server; the right publishes an image once, and any number of servers can pull it.",
      php: `# The FTP/scp era: artifact = tarball, destination = one server
tar czf release-2024-06-14.tar.gz app/
scp release-2024-06-14.tar.gz deploy@vps-203:/var/www/releases/
ssh deploy@vps-203
cd /var/www && tar xzf releases/release-2024-06-14.tar.gz -C htdocs/
# unzipped OVER the old code — half old, half new for a few seconds,
# and no record of what was actually in the previous release`,
      ts: `# The registry era: artifact = image, destination = everywhere
docker tag myapp:dev ghcr.io/acme/myapp:1.4.2
docker push ghcr.io/acme/myapp:1.4.2

# any server, any time — the byte-identical artifact:
docker pull ghcr.io/acme/myapp:1.4.2`,
      note: "The tarball landed on one server and overwrote history; the pushed image is immutable, named, and pullable by every environment — laptop, staging, prod — with nothing overwritten.",
      rightLang: "bash",
    },
    {
      label: "Knowing what's released — and rolling back",
      intro:
        "Both sides keep old releases around. Only one can prove which build is running right now and roll back without re-uploading anything.",
      php: `# 'Version history' = a folder of dated tarballs on the server
ls -la /var/www/releases/
# release-2024-05-30.tar.gz
# release-2024-06-07.tar.gz
# release-2024-06-14.tar.gz
# Which one is live? Whatever was unzipped last. Hopefully.
# Rollback = find the old tarball, unzip it over the top, pray.`,
      ts: `# Every build tagged three ways at push time:
#   ghcr.io/acme/myapp:1.4.2         (exact version)
#   ghcr.io/acme/myapp:sha-a1b2c3d   (exact commit)
#   ghcr.io/acme/myapp:latest        (humans only)

# What is ACTUALLY running? Ask for the digest:
docker inspect --format '{{index .RepoDigests 0}}' myapp
# ghcr.io/acme/myapp@sha256:8f4e2b9c...

# Rollback = pull the previous tag and restart:
docker pull ghcr.io/acme/myapp:1.4.1`,
      note: "Tags name every build and the digest proves identity — rollback is pulling a name, not hunting for a tarball and unzipping over live code.",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "One image, tagged three ways, pushed twice. Before running: predict what docker tag transfers, which layers the SECOND push uploads, and whether the two digests differ.",
    code: `# One local build of the app:
docker images myapp

# Tag it three ways (semver, floating minor, git sha):
docker tag myapp:dev ghcr.io/acme/myapp:1.4.2
docker tag myapp:dev ghcr.io/acme/myapp:1.4
docker tag myapp:dev ghcr.io/acme/myapp:sha-a1b2c3d

# All four names, one image ID:
docker images --format '{{.Repository}}:{{.Tag}} -> {{.ID}}'

# Log in to GitHub Container Registry with a token:
echo $CR_PAT | docker login ghcr.io -u jason --password-stdin

# Push the first tag, then the second:
docker push ghcr.io/acme/myapp:1.4.2
docker push ghcr.io/acme/myapp:1.4`,
    output: `$ docker images myapp
REPOSITORY   TAG   IMAGE ID       CREATED         SIZE
myapp        dev   3f0c9d81a2b4   2 minutes ago   142MB

$ docker tag myapp:dev ghcr.io/acme/myapp:1.4.2
$ docker tag myapp:dev ghcr.io/acme/myapp:1.4
$ docker tag myapp:dev ghcr.io/acme/myapp:sha-a1b2c3d

$ docker images --format '{{.Repository}}:{{.Tag}} -> {{.ID}}'
myapp:dev -> 3f0c9d81a2b4
ghcr.io/acme/myapp:1.4.2 -> 3f0c9d81a2b4
ghcr.io/acme/myapp:1.4 -> 3f0c9d81a2b4
ghcr.io/acme/myapp:sha-a1b2c3d -> 3f0c9d81a2b4

$ echo $CR_PAT | docker login ghcr.io -u jason --password-stdin
Login Succeeded

$ docker push ghcr.io/acme/myapp:1.4.2
The push refers to repository [ghcr.io/acme/myapp]
9c1b7f3e5d20: Pushed
4b8e2a91c6f7: Pushed
d4f0e6a8b3c1: Pushed
7e2d9c4a1f68: Pushed
1.4.2: digest: sha256:8f4e2b9c0d1a3e5f7a9b2c4d6e8f0a1b3c5d7e9f2a4b6c8d0e1f3a5b7c9d0e2f size: 1786

$ docker push ghcr.io/acme/myapp:1.4
The push refers to repository [ghcr.io/acme/myapp]
9c1b7f3e5d20: Layer already exists
4b8e2a91c6f7: Layer already exists
d4f0e6a8b3c1: Layer already exists
7e2d9c4a1f68: Layer already exists
1.4: digest: sha256:8f4e2b9c0d1a3e5f7a9b2c4d6e8f0a1b3c5d7e9f2a4b6c8d0e1f3a5b7c9d0e2f size: 1786

# Every layer already exists — the second push moved almost nothing.
# Same digest both times: two tags, one immutable image.`,
  },

  keyPoints: [
    "A full reference is `registry/namespace/repository:tag`; `node:22-alpine` expands to `docker.io/library/node:22-alpine`, and a missing tag defaults to `:latest`.",
    "`docker tag` creates an alias to the same image ID — a symlink, not a copy. Bytes only move on `docker push` / `docker pull`.",
    "Push and pull are layer-by-layer and content-addressed: layers the registry already has show `Layer already exists` and are skipped.",
    "Tags are mutable pointers, so deploying `:latest` means you can't tell what's running and can't roll back — tag builds with semver AND a git SHA instead.",
    "A digest (`@sha256:...`) is the immutable content hash behind every tag; pulling by digest pins one exact build forever.",
    "ghcr.io keeps images next to the GitHub repo and lets CI push with the built-in `GITHUB_TOKEN`; Docker Hub is the default registry and home of official images.",
  ],

  interview: [
    {
      q: "Why is deploying the :latest tag considered bad practice?",
      a: "Because tags are mutable pointers, and `:latest` is the most mutable of all — it just means 'the last push that used that tag'. If prod runs `:latest` I can't tell which build is actually live, two servers restarted at different times can run different images, and rollback is impossible because there's no 'previous latest' to point back to. My rule is that every build gets an immutable identity — a semver tag and a git-SHA tag — and deploy configuration always references one of those. `:latest` is fine as a convenience for a human pulling on a laptop, never for a deploy script. It's the same lesson as the FTP era: 'whatever's in htdocs right now' is not a version.",
    },
    {
      q: "What's the difference between a tag and a digest?",
      a: "A tag is a mutable, human-friendly name — anyone with push access can re-point `myapp:1.4` at a different image tomorrow. A digest is the sha256 content hash of the image manifest, so it's immutable by construction: `myapp@sha256:8f4e...` will refer to the same bytes forever or fail to resolve. That's why hardened deploys and supply-chain-conscious CI pin by digest, and why `docker inspect` showing the RepoDigest is the definitive answer to 'what exactly is running on this box'. Tags are for humans, digests are for machines and audits.",
    },
    {
      q: "You pushed a 140 MB image, changed one source file, rebuilt, and pushed again. Roughly how much data transfers, and why?",
      a: "Only the layers that changed — typically a few hundred kilobytes to a few megabytes, not 140 MB. Images are stacks of content-addressed layers, and the registry checks each layer's hash before accepting it; anything it already has comes back as `Layer already exists` and is skipped. Since the base image and dependency layers didn't change, only the small layer containing my code change uploads. It's the opposite of the FTP days, where I'd re-upload the whole site because I couldn't reliably tell which files changed.",
    },
  ],

  quiz: [
    {
      question: "What does `docker tag myapp:dev ghcr.io/acme/myapp:1.4.2` actually do?",
      options: [
        "Copies the image into a new 1.4.2 image and doubles the disk usage",
        "Uploads the image to ghcr.io under the new name",
        "Creates a second name pointing at the same image ID — no data is copied or transferred",
        "Rebuilds the image from the Dockerfile with the new version baked in",
      ],
      answerIndex: 2,
      explain:
        "docker tag is an alias: both names resolve to the same image ID, like a symlink to a build. Nothing transfers until you run docker push against the new name.",
    },
    {
      question:
        "You push `myapp:1.4.2`, then immediately push `myapp:1.4` (same image). What does the second push output show?",
      options: [
        "Every layer uploads again because the tag is different",
        "`Layer already exists` for every layer — only the manifest for the new tag is created",
        "An error, because an identical digest is already in the registry",
        "Nothing — Docker refuses to push the same image twice",
      ],
      answerIndex: 1,
      explain:
        "Layers are content-addressed. The registry already holds every layer from the first push, so the second push skips them all and just records that the new tag points at the same manifest — same digest, two names.",
    },
    {
      question: "Which reference is guaranteed to fetch the exact same image bytes forever?",
      options: [
        "ghcr.io/acme/myapp:latest",
        "ghcr.io/acme/myapp:1.4.2",
        "ghcr.io/acme/myapp@sha256:8f4e2b9c...",
        "ghcr.io/acme/myapp:sha-a1b2c3d",
      ],
      answerIndex: 2,
      explain:
        "Only the digest is immutable — it IS the content hash of the manifest. Every tag, including a semver or git-sha tag, is a mutable pointer that someone with push access could re-point (the sha- tag is a strong convention, but not enforced by the registry).",
    },
  ],
};

export default lesson;
