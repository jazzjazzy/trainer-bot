import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "workflow-syntax",
  title: "Workflow Syntax: Jobs, Steps & Runners",
  part: "CI with GitHub Actions",
  estMinutes: 12,
  summary:
    "A workflow file is name + on (triggers) + jobs; each job gets a fresh ubuntu-latest VM and runs steps that are either uses: (a reusable action) or run: (shell).",

  concept: `
A GitHub Actions **workflow** is a YAML file in \`.github/workflows/\` —
commit it and it's live; there is nothing to install or host. The anatomy:

\`\`\`yaml
# .github/workflows/ci.yml
name: CI                      # display name in the Actions tab
on:                           # the TRIGGER(s)
  push:
    branches: [main, develop]
  pull_request:
jobs:                         # one or more JOBS
  test:
    runs-on: ubuntu-latest    # which machine (the RUNNER)
    steps:                    # ordered STEPS
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
\`\`\`

### \`on\`: what starts a run

The common triggers: \`push\` and \`pull_request\`, both filterable with
\`branches:\`; \`schedule:\` with the same five-field cron syntax you know from
\`crontab\` (runs against the default branch); and \`workflow_dispatch:\`,
which adds a manual "Run workflow" button. A workflow can have several.

### Jobs: parallel, and each on a FRESH machine

Every job gets its **own brand-new virtual machine** (\`runs-on:
ubuntu-latest\` is the standard choice), and jobs run **in parallel** by
default. Two consequences that surprise everyone once:

- Nothing carries over between jobs. Files created in \`lint\` don't exist
  in \`test\` — each VM starts empty, which is the clean-machine guarantee
  doing its job.
- The repo isn't even there. That's why nearly every job's first step is
  \`uses: actions/checkout@v6\` — it clones the exact commit that
  triggered the run. Forget it and \`npm ci\` fails wondering where
  \`package.json\` went.

Order jobs with \`needs:\` — \`needs: test\` makes a job wait for \`test\` to
succeed. To hand files between jobs (a build output, say), you upload and
download **artifacts**; you don't just leave files lying around.

### Steps: \`uses\` or \`run\`

Within a job, steps execute in order on the same VM, so state *does* carry
between steps. Each step is one of:

- \`run:\` — a shell command, exactly what you'd type over SSH.
- \`uses:\` — a reusable **action** from the marketplace, versioned with
  \`@\`: \`actions/checkout@v6\`, \`actions/setup-node@v7\`. The \`with:\`
  block passes inputs — \`setup-node\`'s \`cache: npm\` caches the npm
  download cache between runs for free. The \`@v6\` major-version tag is the
  common convention; the security-hardened practice (GitHub's own docs do
  this for third-party actions) is pinning to a **full commit SHA**, since
  tags can be moved.

If a step fails (non-zero exit), the remaining steps in that job are
skipped and the job fails — same fail-fast rule as the pipeline at large.

### \`\${{ }}\`: expressions and the github context

Inside the YAML, \`\${{ ... }}\` is evaluated by Actions before the shell
sees anything. The **github context** carries run metadata:

\`\`\`yaml
      - run: echo "commit \${{ github.sha }} pushed by \${{ github.actor }}"
      - run: echo "event=\${{ github.event_name }} ref=\${{ github.ref }}"
\`\`\`

\`github.ref\` is the full ref (\`refs/heads/main\`), \`github.sha\` the exact
commit, \`github.event_name\` which trigger fired. Expressions also power
conditionals — \`if: github.ref == 'refs/heads/main'\` on a step or job —
which is how one workflow tests every branch but deploys only from main.
`,

  comparisons: [
    {
      label: "deploy.sh from a laptop vs a workflow",
      intro:
        "Both automate the steps. One runs from whichever laptop has the SSH key, with no checks and no record; the other runs on every push, on a clean VM, with the log attached to the commit.",
      php: `#!/bin/bash
# deploy.sh - run from whoever's laptop has the key
ssh deploy@prod-box "cd /var/www/shop && git pull origin main"
ssh deploy@prod-box "composer install --no-dev"
ssh deploy@prod-box "service apache2 reload"
# No lint. No tests. No record of who ran it, when,
# or against which commit. Fails halfway? Good luck.`,
      ts: `# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test`,
      note:
        "lint and test are separate jobs, so they run in parallel on two fresh VMs — which is also why each repeats checkout and setup-node: nothing carries over between jobs.",
    },
    {
      label: "crontab on a server vs on: schedule",
      intro:
        "A weekly job, then and now. The crontab lives (and dies) with one server and one engineer's account; the workflow schedule is versioned in the repo.",
      php: `# On the prod box, in one engineer's crontab
$ crontab -e
0 5 * * 1 /home/deploy/scripts/weekly-report.sh
# Server rebuilt? Cron gone. Engineer leaves?
# Nobody knew the job existed until the report stops.`,
      ts: `# .github/workflows/report.yml - the schedule is in the repo
name: Weekly report
on:
  schedule:
    - cron: "0 5 * * 1"   # same five-field syntax, Mondays 05:00 UTC
  workflow_dispatch:       # plus a manual "Run workflow" button
jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: ./scripts/weekly-report.sh`,
      note:
        "Identical cron syntax — but the schedule is now reviewable, survives any server, and workflow_dispatch gives you the on-demand run you used to fake by running the script manually.",
    },
    {
      label: "Serial script vs needs: between jobs",
      intro:
        "Build only if tests pass, then announce what was built. The shell script chains everything on one machine; the workflow orders isolated jobs and reads run metadata from the github context.",
      php: `#!/bin/bash
# ci-by-hand.sh - everything serial, on one machine,
# state (and mess) leaking between phases
./lint.sh && ./test.sh && ./build.sh
echo "built $(git rev-parse --short HEAD) by $(whoami)"
# "$(whoami)": whichever human remembered to run it`,
      ts: `jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: npm ci && npm test
  build:
    needs: test               # runs only after test succeeds
    runs-on: ubuntu-latest    # ...on its own fresh VM
    steps:
      - uses: actions/checkout@v6   # nothing carried over: clone again
      - run: npm ci && npm run build
      - run: echo "built \${{ github.sha }} by \${{ github.actor }}"`,
      note:
        "needs: gives ordering without sharing a machine, and \${{ github.sha }} / \${{ github.actor }} are resolved by Actions before the shell runs — real run metadata, not whoami.",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "npm test is going to fail on this push. Predict which steps run after the failure, what happens to npm run build, and the job's final status — then read the Actions log.",
    code: `# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build`,
    output: `CI / test (push · 3f9c2ab)                       ✗ failed in 52s

✓ Set up job                                            2s
✓ Run actions/checkout@v6                               1s
✓ Run actions/setup-node@v7                             4s
✓ Run npm ci                                           31s
✗ Run npm test                                         12s
  > shop-api@1.0.0 test
  > vitest run

  ❯ src/cart.test.ts (3 tests | 1 failed)
    ✗ applies the discount code
      AssertionError: expected 90 to equal 85
  Tests  1 failed | 2 passed (3)
  Error: Process completed with exit code 1.
○ Run npm run build                               skipped
✓ Post Run actions/setup-node@v7                        0s
✓ Complete job                                          0s

Job "test" failed — steps after the failing step were skipped,
and the commit 3f9c2ab is marked with a red ✗ on GitHub.`,
  },

  keyPoints: [
    "A workflow is a YAML file in `.github/workflows/`: `name`, `on` (triggers: push/pull_request with `branches:` filters, schedule, workflow_dispatch), and `jobs`.",
    "Each job runs on its own fresh VM (`runs-on: ubuntu-latest`) and jobs run in parallel by default — order them with `needs:`, and nothing (not even the repo) carries over between jobs.",
    "Almost every job starts with `uses: actions/checkout@v6`, because the runner starts without your code; `actions/setup-node@v7` with `cache: npm` installs Node and caches the npm cache.",
    "Steps are `uses:` (a versioned, reusable action with `with:` inputs) or `run:` (a shell command); steps in one job share the VM and run in order.",
    "A failing step skips the rest of the job's steps and fails the job — fail-fast at step granularity.",
    "`${{ ... }}` expressions are evaluated by Actions before the shell runs; the github context provides `github.sha`, `github.ref`, `github.actor`, `github.event_name` for logic like `if: github.ref == 'refs/heads/main'`.",
  ],

  interview: [
    {
      q: "Walk me through the structure of a GitHub Actions workflow file.",
      a: "Three levels. At the top, `name` for display and `on` for triggers — typically `push` and `pull_request` with branch filters, plus `schedule` with cron syntax or `workflow_dispatch` for a manual button. Under `jobs`, each job declares `runs-on` — usually `ubuntu-latest` — and gets a fresh, isolated VM; jobs run in parallel unless you order them with `needs:`. Each job is a list of `steps`, which are either `uses:` — a reusable, versioned action like `actions/checkout@v6` or `actions/setup-node@v7` with inputs under `with:` — or `run:`, a plain shell command. Steps share their job's VM and run sequentially; a non-zero exit fails the step, skips the remaining steps, and fails the job.",
    },
    {
      q: "Why does every job start with actions/checkout, and why do two jobs in the same workflow both need it?",
      a: "Because each job's runner is a brand-new empty VM — the workflow file was read from the repo by GitHub, but the repo's contents are not on the machine. `actions/checkout@v6` clones the exact commit that triggered the run. And since every job gets its *own* fresh VM, nothing one job does exists for another: a `lint` and a `test` job each check out and install independently. That isolation is a feature — it's the clean-machine guarantee that makes CI results trustworthy — and when jobs genuinely need to share files, the explicit mechanism is uploading and downloading artifacts, not hoping state persists.",
    },
    {
      q: "What does @v6 in actions/checkout@v6 mean, and is there a more secure way to pin an action?",
      a: "Actions are versioned with an @ ref — `@v6` is a major-version tag that the maintainer moves to the latest v6.x release, so you get fixes without breaking changes. The catch is that a tag is mutable: whoever controls the repo can repoint it, which for a third-party action means the code running with access to your workflow's secrets can change under you. The hardened practice — which GitHub's own documentation follows for third-party actions — is pinning to a full commit SHA, with a comment noting the version, and letting a bot like Dependabot propose bumps. For GitHub-owned actions like checkout and setup-node, major-version tags are the accepted norm.",
    },
    {
      q: "How would you make one workflow run tests on every branch but only deploy from main?",
      a: "Trigger broadly and gate narrowly. The `on:` block listens to `push` on all branches plus `pull_request`, so tests run everywhere. The deploy job then does two things: `needs: test`, so it only starts after tests pass, and an `if:` expression — `if: github.ref == 'refs/heads/main' && github.event_name == 'push'` — so it's skipped entirely for feature branches and PRs. The `${{ }}` expression syntax and the github context (`github.ref`, `github.event_name`, `github.sha`) are evaluated by Actions before any shell runs, so the gating is part of the workflow's structure, not a script's guesswork.",
    },
  ],

  quiz: [
    {
      question:
        "A workflow has jobs `lint` and `test`, neither with a `needs:` key. How do they execute?",
      options: [
        "Sequentially, in the order they appear in the file",
        "In parallel, each on its own fresh virtual machine",
        "In parallel, sharing one virtual machine",
        "Only lint runs; test waits for the next push",
      ],
      answerIndex: 1,
      explain:
        "Jobs are parallel by default and each gets its own clean runner VM — which is why both must do their own checkout and setup. `needs:` is what introduces ordering, and artifacts are how jobs pass files.",
    },
    {
      question:
        "In the `test` job, `npm test` exits with code 1. What happens to the `npm run build` step that follows it?",
      options: [
        "It runs anyway, since each step is independent",
        "It runs, but its result is recorded as a warning",
        "It's skipped, and the job is marked failed",
        "It runs only if it has a needs: key",
      ],
      answerIndex: 2,
      explain:
        "Within a job, a failing step stops the remaining steps (post-steps of already-run actions still execute) and fails the job. `needs:` operates between jobs, not steps; running after failure requires an explicit `if: always()`-style condition.",
    },
    {
      question: "What is the difference between a `uses:` step and a `run:` step?",
      options: [
        "uses: runs on the runner, run: executes on GitHub's servers",
        "uses: invokes a versioned, reusable action (configured via with:); run: executes a shell command directly",
        "run: is only for JavaScript, uses: for any language",
        "They're interchangeable ways to write the same thing",
      ],
      answerIndex: 1,
      explain:
        "run: is literally a shell command on the job's VM — what you'd have typed over SSH. uses: pulls in a packaged action pinned with @ (like actions/checkout@v6) and passes it inputs via with:. Both execute on the same runner.",
    },
    {
      question:
        "Where does `${{ github.sha }}` get its value, and when is it substituted?",
      options: [
        "The shell expands it at run time, like a bash variable",
        "It's read from a .env file on the runner",
        "Actions evaluates the expression from the github context before the step's shell ever runs",
        "It's a placeholder the developer must replace before committing",
      ],
      answerIndex: 2,
      explain:
        "${{ }} is Actions' expression syntax, resolved from contexts (github, env, secrets, ...) during workflow processing — the shell only ever sees the substituted value. That's also why bash never complains about the braces.",
    },
  ],
};

export default lesson;
