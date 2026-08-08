import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "build-and-push-in-ci",
  title: "Building & Pushing Images in CI",
  part: "CI with GitHub Actions",
  estMinutes: 12,
  summary:
    "The two threads of this course join: a GitHub Actions workflow that builds your Docker image with buildx and pushes it to ghcr.io on every push to main — tagged by metadata-action, layer-cached with type=gha.",

  concept: `
So far the Dockerfile lived on your laptop and the workflow ran tests. This is
the section where they meet: CI builds the image and pushes it to a registry,
so "the thing that runs in production" is produced by a machine, from a commit,
every time — never from somebody's laptop over home wifi.

### The four Docker actions

A build-and-push job is a fixed cast of four (current majors, in the order
they run):

\`\`\`yaml
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write        # allows GITHUB_TOKEN to push to ghcr.io
    steps:
      - uses: actions/checkout@v6
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v6
        id: meta
        with:
          images: ghcr.io/\${{ github.repository }}
          tags: |
            type=ref,event=branch
            type=sha
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
\`\`\`

- **setup-buildx-action@v4** creates a BuildKit builder on the runner — the
  same engine \`docker build\` uses on modern Docker, but configured for CI
  features like the GHA cache backend.
- **login-action@v4** is \`docker login\` for the workflow. For GitHub's own
  registry (ghcr.io) you don't create a secret at all: \`github.actor\` is the
  user who triggered the run, and \`secrets.GITHUB_TOKEN\` is the automatic
  per-run token — it just needs \`permissions: packages: write\`.
- **metadata-action@v6** computes tags and OCI labels from the git context
  (more below).
- **build-push-action@v7** runs the build and pushes in one step.

### Why layer caching needs the gha backend

On your laptop, Docker's layer cache lives on your disk and survives between
builds — that's why the second build is fast. A CI runner is a **fresh VM
every run**: there is no local layer store, so every build would be a
from-scratch build. \`cache-from: type=gha\` / \`cache-to: type=gha,mode=max\`
tells BuildKit to export layers to GitHub's cache service after the build and
import them at the start of the next one. \`mode=max\` caches all layers
(including intermediate multi-stage layers), not just the final image's.
Result: an unchanged \`npm ci\` layer is a cache hit in CI, exactly like the
laptop experience — just with the cache living in GitHub instead of on disk.

### metadata-action: tags computed, not chosen

Hand-picked tags (\`:latest\`, \`:final-v2-real\`) are the FTP-filename problem
all over again. metadata-action derives them from the event that triggered the
run:

- \`type=ref,event=branch\` → pushing the \`main\` branch tags the image \`main\`.
- \`type=sha\` → a \`sha-a1b2c3d\` tag: every image traceable to its exact commit.
- \`type=semver,pattern={{version}}\` → pushing a git tag \`v1.4.0\` produces
  \`1.4.0\`. On plain branch pushes this rule is simply dormant.

The step's \`id: meta\` makes its computed output available to the build step
as \`\${{ steps.meta.outputs.tags }}\`. One push to main therefore publishes
the same image under two names — a moving \`main\` tag and an immutable
\`sha-…\` tag — and a release tag adds proper semver on top. Nobody ever types
a tag name again.
`,

  comparisons: [
    {
      label: "Where the production image gets built",
      intro:
        "Same Dockerfile, same registry. The difference is which machine builds it, from what state, and how repeatable that is.",
      php: `# the laptop build — works, until it doesn't
$ git pull        # ...did I actually pull? mostly.
$ docker build -t ghcr.io/acme/shipit:latest .
$ docker login ghcr.io -u jason
Password: ********   # a PAT taped into a note
$ docker push ghcr.io/acme/shipit:latest
# 40 min over home wifi, includes whatever
# uncommitted files were sitting in my tree`,
      ts: `# .github/workflows/release.yml
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v6
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: ghcr.io/acme/shipit:sha-\${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max`,
      note: "CI builds from the exact commit, on a clean machine, authenticated with the run's own GITHUB_TOKEN (no long-lived password anywhere) — and datacenter bandwidth makes the push a non-event.",
    },
    {
      label: "Who decides the tag name",
      intro:
        "Every image needs a name. One approach relies on human discipline; the other derives names from git so they can't drift.",
      php: `# tag naming by vibes
$ docker tag shipit ghcr.io/acme/shipit:latest
$ docker tag shipit ghcr.io/acme/shipit:prod-final
$ docker tag shipit ghcr.io/acme/shipit:prod-final-2
# which commit is prod-final-2?
# nobody has known since March.`,
      ts: `# metadata-action derives tags from git
- uses: docker/metadata-action@v6
  id: meta
  with:
    images: ghcr.io/acme/shipit
    tags: |
      type=ref,event=branch     # push main  -> :main
      type=sha                  # any push   -> :sha-a1b2c3d
      type=semver,pattern={{version}}  # tag v1.4.0 -> :1.4.0
- uses: docker/build-push-action@v7
  with:
    push: true
    tags: \${{ steps.meta.outputs.tags }}`,
      note: "type=sha gives every image an immutable, commit-traceable name; the branch and semver tags are conveniences layered on top. The build step just consumes steps.meta.outputs.tags — no human in the naming loop.",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "The complete build-and-push workflow. Before reading the output: this run is a push to main at commit a1b2c3d (no git tag involved). Predict exactly which tags get pushed — then check what the semver rule did.",
    code: `# .github/workflows/release.yml
name: release
on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v6

      - uses: docker/setup-buildx-action@v4

      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - uses: docker/metadata-action@v6
        id: meta
        with:
          images: ghcr.io/acme/shipit
          tags: |
            type=ref,event=branch
            type=sha
            type=semver,pattern={{version}}

      - uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max`,
    output: `Run log — push to main @ a1b2c3d:

  Run docker/setup-buildx-action@v4
    Creating builder instance "builder-4f2c9e"
    Booting BuildKit... done

  Run docker/login-action@v4
    Logging into ghcr.io...
    Login Succeeded!

  Run docker/metadata-action@v6
    Processing tags input
      tags: ghcr.io/acme/shipit:main
            ghcr.io/acme/shipit:sha-a1b2c3d

  Run docker/build-push-action@v7
    importing cache manifest from gha:8842021…
    [2/5] RUN npm ci                          CACHED
    [4/5] RUN npm run build                   2.1s
    exporting layers... writing cache to gha (mode=max)
    pushing ghcr.io/acme/shipit:main
    pushing ghcr.io/acme/shipit:sha-a1b2c3d
    digest: sha256:7c1e02fa9d3b… size: 1786

Two tags: "main" (type=ref,event=branch) and "sha-a1b2c3d" (type=sha).
The semver rule produced nothing — it only activates when the run is
triggered by a git tag like v1.4.0. Both pushed names point at the SAME
digest: one image, two labels on the tin.`,
  },

  keyPoints: [
    "The standard cast: actions/checkout@v6 → docker/setup-buildx-action@v4 → docker/login-action@v4 → docker/metadata-action@v6 → docker/build-push-action@v7.",
    "Pushing to ghcr.io needs no created secret: username `github.actor`, password `secrets.GITHUB_TOKEN`, plus `permissions: packages: write` on the job.",
    "CI runners are fresh VMs with no local layer store — `cache-from: type=gha` / `cache-to: type=gha,mode=max` exports BuildKit layers to GitHub's cache so unchanged layers hit in the next run.",
    "`mode=max` caches all layers including intermediate multi-stage ones, not just the layers of the final image.",
    "metadata-action derives tags from the trigger: `type=ref,event=branch` → `:main`, `type=sha` → `:sha-a1b2c3d`, `type=semver` → `:1.4.0` on v-tag pushes only.",
    "Wire the tags with `id: meta` and `tags: ${{ steps.meta.outputs.tags }}` — one push publishes a moving branch tag and an immutable sha tag for the same digest.",
  ],

  interview: [
    {
      q: "Walk me through a GitHub Actions job that builds and pushes a Docker image to a registry.",
      a: "Five steps. checkout@v6 gets the code; docker/setup-buildx-action@v4 stands up a BuildKit builder; docker/login-action@v4 authenticates — for ghcr.io I use `github.actor` and the automatic `GITHUB_TOKEN` with `permissions: packages: write`, so there's no long-lived credential to manage; docker/metadata-action@v6 computes tags from the git context; and docker/build-push-action@v7 builds and pushes in one step, consuming the metadata step's outputs. I also always configure `cache-from`/`cache-to` with the gha backend, because without it every CI build is a cold build. The payoff over building locally is provenance: the image is guaranteed to come from a specific commit on a clean machine.",
    },
    {
      q: "Docker builds are fast on your machine but slow in CI. Why, and what's the fix?",
      a: "Locally, BuildKit's layer cache lives on my disk and persists between builds, so unchanged layers like `npm ci` are instant. A CI runner is a brand-new VM every run — no layer store, so every layer rebuilds from scratch. The fix is a remote cache backend: `cache-from: type=gha` and `cache-to: type=gha,mode=max` on docker/build-push-action, with setup-buildx-action in place first since the default docker driver can't use it. BuildKit then exports layers to GitHub's cache service after each build and imports them at the start of the next, so an unchanged dependency layer is a cache hit in CI too. `mode=max` matters for multi-stage builds — it caches intermediate stage layers, not just the final image's.",
    },
    {
      q: "How do you decide what to tag your images in CI?",
      a: "I don't decide per-image — I encode the policy once in docker/metadata-action@v6 and let it derive tags from the trigger. Every build gets `type=sha`, an immutable `sha-<commit>` tag, which is the one deploys and rollbacks should reference because it can never silently change. Branch pushes also get a moving branch tag like `:main` for convenience, and pushing a git tag `v1.4.0` gets real semver tags via `type=semver`. What I avoid is deploying `:latest` or hand-typed tags — that's a mutable pointer with no audit trail, the container equivalent of a file called final-v2.php.",
    },
  ],

  quiz: [
    {
      question:
        "Why does layer caching in GitHub Actions require cache-from/cache-to with the gha backend?",
      options: [
        "BuildKit has no cache of its own and always needs an external one",
        "Each run gets a fresh VM, so there is no local layer store to hit — layers must be exported to and imported from GitHub's cache service",
        "ghcr.io refuses images that were built without a cache manifest",
        "The gha backend is required to authenticate against the registry",
      ],
      answerIndex: 1,
      explain:
        "Locally the layer cache persists on your disk. CI runners are ephemeral — every run starts empty — so cache-to exports layers to GitHub's cache after the build and cache-from imports them next run, restoring the fast incremental builds you get on a laptop.",
    },
    {
      question:
        "A workflow uses metadata-action with type=ref,event=branch, type=sha, and type=semver. What tags result from a push to main at commit a1b2c3d?",
      options: [
        "main, sha-a1b2c3d, and 1.0.0",
        "only sha-a1b2c3d",
        "main and sha-a1b2c3d — the semver rule stays dormant without a git tag",
        "latest, main, and a1b2c3d",
      ],
      answerIndex: 2,
      explain:
        "type=ref,event=branch yields the branch name, type=sha yields sha-a1b2c3d, and type=semver only activates when the triggering event is a git tag like v1.4.0. Both produced tags point at the same image digest.",
    },
    {
      question:
        "What credentials does the workflow use to push to ghcr.io in the standard setup?",
      options: [
        "A personal access token stored as a repo secret named DOCKER_PASSWORD",
        "github.actor plus the automatic per-run GITHUB_TOKEN, with permissions: packages: write on the job",
        "An SSH deploy key mounted into the runner",
        "No credentials — ghcr.io allows anonymous pushes from Actions runners",
      ],
      answerIndex: 1,
      explain:
        "ghcr.io is GitHub's own registry, so the run's automatic GITHUB_TOKEN can authenticate — provided the job's permissions block grants packages: write. No long-lived secret is created, and the token expires when the run ends.",
    },
  ],
};

export default lesson;
