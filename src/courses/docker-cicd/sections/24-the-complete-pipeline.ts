import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "the-complete-pipeline",
  title: "The Complete Pipeline: Test, Build, Gate",
  part: "CI with GitHub Actions",
  estMinutes: 14,
  summary:
    "Everything assembles into one production-shaped workflow: a test job with a real Postgres service, a build-and-push job gated behind needs: test and an if: main check, job outputs carrying the image tag, and concurrency cancelling superseded runs.",

  concept: `
Individually, none of the pieces you've met are hard: a checkout, a cache, a
matrix, a buildx push. The skill interviewers actually probe is reading a
**complete pipeline** — sixty lines of YAML — and narrating what runs when.
This section assembles one. It's your old release-day checklist ("merge, run
tests, build, upload, smoke test, email everyone") converted to code that
executes the same way at 4pm Friday as at 10am Tuesday.

### The shape: two jobs, one dependency, one gate

\`\`\`yaml
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    # runs for PRs AND main pushes
  build-and-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    # runs ONLY after test passes, ONLY on main
\`\`\`

Two mechanisms do the routing:

- **\`needs: test\`** makes \`build-and-push\` wait for \`test\` and skip if it
  fails. Without \`needs\`, jobs run in parallel — remember that jobs are
  separate VMs with no shared state.
- **\`if: github.ref == 'refs/heads/main'\`** gates publishing. A pull request
  runs the test job (so reviewers see red or green), but only a push to main
  produces an image. PRs *test*; main *publishes*. No more "who deployed the
  feature branch?".

### Integration tests need a real database

Unit tests are fine on a bare runner, but anything touching SQL wants real
Postgres. A **service container** attaches one to the job:

\`\`\`yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_PASSWORD: test
    ports: ['5432:5432']
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
\`\`\`

The runner waits for the healthcheck before your steps start — the same
healthcheck discipline as compose's \`depends_on: condition: service_healthy\`,
because "Postgres's port is open" and "Postgres is accepting queries" are
different moments.

### Passing data between jobs: outputs

Jobs are separate machines, so the image tag computed in one job doesn't
magically exist in another. A job publishes values explicitly:

\`\`\`yaml
build-and-push:
  outputs:
    image: \${{ steps.meta.outputs.tags }}

deploy:
  needs: build-and-push
  steps:
    - run: ./deploy.sh "\${{ needs.build-and-push.outputs.image }}"
\`\`\`

A step's output (like metadata-action's computed tags) is promoted to a job
output, and downstream jobs read it via \`needs.<job>.outputs.<name>\`. That's
how "the tag we built" travels to "the thing we deploy" without a human
re-typing it.

### concurrency: don't race yourself

Push three commits in quick succession and you get three full pipeline runs —
possibly finishing out of order, with an older build pushing its image *after*
a newer one. The fix:

\`\`\`yaml
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
\`\`\`

One run per workflow-and-branch at a time; a new push cancels the superseded
run. CI minutes saved, and the newest commit always wins the race — because
there is no race.
`,

  comparisons: [
    {
      label: "Release day, then and now",
      intro:
        "Everything that has to happen between 'the code is ready' and 'it is live and known-good'. One version is a checklist in a wiki; the other executes itself.",
      php: `# RELEASE-DAY.txt (last updated 2014, step 4 is stale)
$ git checkout main && git merge feature/checkout-v2
$ ./run-tests.sh          # locally. on MY php version
$ ftp ftp.example.com     # upload changed files
ftp> put checkout.php
ftp> put lib/cart.php     # ...did I miss one? probably
$ ssh deploy@prod 'service apache2 restart'
# open the site, click around, hold breath
# email team@ "deployed, let me know if weird"`,
      ts: `# .github/workflows/pipeline.yml (abridged)
on:
  push: { branches: [main] }
  pull_request:
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node + cache,
            npm ci, lint, test vs postgres:16]
  build-and-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    steps: [buildx, ghcr login, metadata,
            build-push with gha cache]`,
      note: "The checklist became executable: tests run on a clean machine against a real database, the artifact only exists if they pass, and 'email the team' is replaced by a run log everyone can read.",
    },
    {
      label: "Who can release, and when",
      intro:
        "A release needs to be possible at any time, by anyone on the team, without tribal knowledge. Compare the trigger conditions.",
      php: `# deploys happen when Bob is in
$ cat team-chat.log
[14:02] dev1: can we ship the pricing fix?
[14:03] lead: Bob's back Thursday
[14:03] dev1: ...it's a one-line fix
[14:04] lead: Bob has the FTP password
              and knows which files to skip
# the deploy process lives in Bob.`,
      ts: `# the deploy process lives in the repo
on:
  push:
    branches: [main]

# that's the whole trigger. merging to main
# IS the release action. Bob can be on a
# beach; the pipeline doesn't know who Bob is.
jobs:
  test:          # every push, every PR
  build-and-push: # only main, only after green
    needs: test
    if: github.ref == 'refs/heads/main'`,
      note: "The bus factor moves from a person to a file under version control — anyone who can merge to main can release, and nobody can release without the tests passing first.",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "The full two-job pipeline. Predict which jobs execute (a) for a pull request and (b) for a push to main — and what needs: test does to build-and-push if a test fails.",
    code: `# .github/workflows/pipeline.yml
name: pipeline
on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/postgres

  build-and-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image: \${{ steps.meta.outputs.tags }}
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
          tags: type=sha
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max`,
    output: `Run A — pull request #214 (branch feature/pricing):
  ✓ test            2m11s   (postgres:16 service healthy in 9s)
  - build-and-push  skipped
  Reason: github.ref is 'refs/pull/214/merge', not 'refs/heads/main'
  → PRs prove the code works; they never publish an image.

Run B — push to main @ 9e4f21b:
  ✓ test            2m08s
  ✓ build-and-push  1m34s
      pushed ghcr.io/acme/shipit:sha-9e4f21b
      job output image = ghcr.io/acme/shipit:sha-9e4f21b
  → both gates passed: needs: test was green AND ref is main.

Run C — push to main, but one test fails:
  ✗ test            1m47s   (assertion failed: cart.total)
  - build-and-push  skipped (dependency 'test' did not succeed)
  → needs: test means no image can exist for a commit that failed tests.

(A second push to main during Run B would cancel it:
 concurrency group "pipeline-refs/heads/main", cancel-in-progress: true.)`,
  },

  keyPoints: [
    "The production shape: a `test` job that runs for every PR and push, and a `build-and-push` job behind `needs: test` plus `if: github.ref == 'refs/heads/main'` — PRs test, only main publishes.",
    "`needs:` creates the dependency chain (and skips dependents on failure); without it, jobs run in parallel on separate VMs.",
    "Service containers (`services: postgres: image: postgres:16` with `--health-cmd pg_isready` options) give integration tests a real database, and steps wait for it to be healthy.",
    "Jobs share nothing — promote step outputs to job `outputs:` and read them downstream with `needs.<job>.outputs.<name>`, e.g. passing the built image tag to a deploy job.",
    "`concurrency: group: ... cancel-in-progress: true` ensures one run per branch at a time and cancels superseded runs, so an old build can never finish after a newer one.",
    "The pipeline is the old release-day checklist as code: versioned, reviewable, and it runs the same way regardless of who merged or what day it is.",
  ],

  interview: [
    {
      q: "Design a CI/CD workflow for a web app: PRs must be tested, but only main should publish an image.",
      a: "Two jobs. The workflow triggers on `pull_request` and on `push` to main. The test job — checkout@v6, setup-node@v7 with `cache: npm`, `npm ci`, lint, tests — runs unconditionally, with a postgres:16 service container and health options if the suite needs a real database. The build-and-push job declares `needs: test`, so it only starts after a green test job, plus `if: github.ref == 'refs/heads/main'`, so it's skipped for PRs. Inside it: buildx setup, ghcr login with the run's GITHUB_TOKEN under `permissions: packages: write`, metadata-action for sha tags, and build-push-action with gha layer caching. The two gates compose: an image can only exist for a commit that is on main *and* passed tests.",
    },
    {
      q: "Two jobs in your workflow: one builds the image, one deploys it. How does the deploy job know the image tag?",
      a: "Explicitly, through job outputs — jobs are separate VMs, so nothing is shared implicitly. The build job declares an `outputs:` map that promotes a step output, typically `image: ${{ steps.meta.outputs.tags }}` from metadata-action. The deploy job declares `needs: build` and reads `needs.build.outputs.image`. That gives you a single source of truth for the tag flowing through the pipeline: computed once from the commit, never re-typed. It's also why I tag with `type=sha` — the value being passed around is immutable and traceable to the exact commit that produced it.",
    },
    {
      q: "What does a concurrency block do, and why would you add one to a deployment pipeline?",
      a: "It serialises runs. `concurrency: group: ${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` means at most one run of that workflow per branch at a time, and a newer push cancels the in-flight run. Without it, three quick pushes to main are three racing pipelines, and the ordering isn't guaranteed — an older build can push its image or deploy *after* a newer one, so production goes backwards. With it, the superseded run is cancelled and the newest commit always wins. It also stops burning runner minutes on commits nobody cares about anymore. For deploy steps specifically, some teams set cancel-in-progress to false so a half-finished deploy is never killed mid-flight — the queueing still prevents overlap.",
    },
  ],

  quiz: [
    {
      question:
        "In the two-job pipeline, why does build-and-push have BOTH `needs: test` and `if: github.ref == 'refs/heads/main'`?",
      options: [
        "They are redundant — either one alone has the same effect",
        "needs orders the jobs and skips on failure; the if gates by branch — together: only tested commits on main publish",
        "The if condition is required for needs to work at all",
        "needs makes the jobs run in parallel and if picks which finishes first",
      ],
      answerIndex: 1,
      explain:
        "They answer different questions. needs: test handles 'did the code pass?' (sequencing + skip-on-failure). The if handles 'is this a publishable ref?' (PRs and feature branches skip it). Drop either and you'd publish untested images or publish from every PR.",
    },
    {
      question:
        "A pull request is opened against main. Which jobs of the pipeline run?",
      options: [
        "Both — PRs go through the full pipeline including the image push",
        "Neither — the workflow only triggers on push",
        "Only test; build-and-push is skipped because the ref is not refs/heads/main",
        "Only build-and-push, to preview the image",
      ],
      answerIndex: 2,
      explain:
        "The pull_request trigger starts the workflow and the test job runs, giving reviewers a green or red check. build-and-push evaluates its if condition against the PR's merge ref, which is not refs/heads/main, so it's skipped — PRs test, main publishes.",
    },
    {
      question:
        "Why give the postgres:16 service container --health-cmd pg_isready options?",
      options: [
        "So the runner waits until Postgres actually accepts connections before your steps run",
        "To automatically create the application's database schema",
        "Health options are required or the container won't start",
        "To restart Postgres if a test drops a table",
      ],
      answerIndex: 0,
      explain:
        "Container started and database ready are different moments — Postgres takes a few seconds to initialise. The health options make the runner poll pg_isready and hold your steps until it passes, eliminating the flaky 'connection refused' first test.",
    },
    {
      question:
        "You push twice to main within a minute and the workflow has concurrency with cancel-in-progress: true. What happens?",
      options: [
        "Both runs complete; the faster one's image wins",
        "The first run is cancelled when the second starts; only the newest commit's pipeline completes",
        "The second push waits a week in a queue",
        "GitHub merges the two runs into one",
      ],
      answerIndex: 1,
      explain:
        "Both pushes map to the same concurrency group (workflow + ref), and cancel-in-progress: true cancels the superseded run. The newest commit's pipeline is the only one that finishes, so an older image can never be published after a newer one.",
    },
  ],
};

export default lesson;
