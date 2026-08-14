import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "ci-concepts",
  title: "CI Concepts: Automate the Checklist",
  part: "CI with GitHub Actions",
  estMinutes: 9,
  summary:
    "Continuous integration means every push is built and tested on a clean machine — the deploy checklist taped to the monitor, turned into code that fails fast and loudly.",

  concept: `
Before the YAML, get the idea straight, because "explain CI/CD" is a stock
interview question and the terms are abused daily.

### What continuous integration actually is

**CI** means: every time anyone pushes code, an automated system checks out
that exact commit on a **clean machine**, installs dependencies from scratch,
and runs the checks — lint, tests, build. Two words carry the weight:

- **Every push.** Not "before releases", not "when someone remembers".
  Integration problems are found minutes after they're created, while the
  change is small and the author still has context.
- **Clean machine.** The runner starts empty every time. If the build passes,
  it passes from nothing but the repo's own declared setup — which executes
  "works on my machine" as a claim and proves or disproves it. Your old
  ritual of testing locally (maybe) proved only that the code worked on a
  machine with five years of undocumented \`apt-get\` and \`pecl install\`
  history.

### The pipeline shape

A pipeline is a **trigger** plus ordered **stages**:

\`\`\`text
push  ─▶  lint  ─▶  test  ─▶  build  ─▶  package  ─▶  deploy
\`\`\`

Two design rules. **Fail fast**: cheap checks first, so a syntax error dies
in seconds on lint instead of after a ten-minute build. **Fail loudly**: a
red X on the commit and the pull request, visible to everyone — not a log
file on a server nobody reads. When any stage fails, later stages don't run;
a broken commit physically cannot reach the deploy stage. That's the whole
trick: the checklist taped to the monitor had the same steps, but paper
can't refuse to let you skip step 3.

### CI vs CD — be precise, it's an interview question

- **Continuous Integration**: every push is built and tested automatically.
- **Continuous Delivery**: on top of CI, every change that passes the
  pipeline is packaged into a **deployable artifact** — deploying to
  production is one manual decision (a button), not a project.
- **Continuous Deployment**: remove the button — every change that passes
  the pipeline goes to production automatically.

Both CDs share the acronym; the difference is *who pulls the trigger*.
Delivery = a human decides when; Deployment = the pipeline decides. Most
teams practise delivery; deployment demands serious test coverage and
healthcheck-gated rollouts.

### Where GitHub Actions fits

Every serious platform has a CI system: **GitLab CI** (a \`.gitlab-ci.yml\`
in the repo, tightly integrated with GitLab), **Jenkins** (the self-hosted
veteran — infinitely flexible, but you run and patch the CI server
yourself, the way you used to run your own LAMP boxes), plus CircleCI,
Bitbucket Pipelines, and others. They all share the same model: a YAML file
in the repo describes the pipeline, and pushes trigger it. This course uses
**GitHub Actions** — it lives where your code already is, has a huge
marketplace of reusable steps, and its free tier covers public repos and
small private ones. Learn one well and the others read like dialects.

The deeper shift to internalise: the deploy process stops being tribal
knowledge in one person's head and shell history, and becomes **code in the
repo** — reviewed in PRs, versioned, blameable, and runnable by anyone.
`,

  comparisons: [
    {
      label: "The deploy ritual vs the pipeline",
      intro:
        "Same steps, different executor. The checklist depends on a human doing every step, in order, every time; the workflow runs all of it on every push, unskippably.",
      php: `# deploy-checklist.txt — taped to the monitor since 2011
# 1. run the tests locally (if there is time)
# 2. FTP the changed files up (don't forget includes/!)
# 3. clear the cache dir over SSH
# 4. click around the live site to smoke-test
# 5. if broken: re-upload yesterday's files
#    from the copy on the Desktop
# Steps get skipped exactly when there's the least
# time — which is exactly when they matter most.`,
      ts: `# .github/workflows/ci.yml — the checklist, executed on EVERY push
name: CI
on: [push]
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
      - run: npm test`,
      note:
        "The pipeline can't be skipped under deadline pressure, runs on a clean machine every time, and marks the commit red or green where the whole team sees it.",
    },
    {
      label: "Tribal knowledge vs pipeline-as-code",
      intro:
        "How does this project get tested and shipped? One answer lives in Bob's head and shell history; the other is a reviewed file in the repository.",
      php: `# "How do we deploy?" — "Ask Bob."
$ ssh bob@prod-box
$ history | tail -4
  497  cd /var/www/shop && git pull
  498  composer install --no-dev
  499  rm -rf cache/*
  500  service apache2 reload
# Bob is on holiday in August. Nothing ships in August.`,
      ts: `# The process is code, living in the repo:
# reviewed in PRs, versioned, git-blameable, runnable by anyone.
name: CI
on:
  push:
    branches: [main, develop]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: npm ci && npm test`,
      note:
        "Pipeline-as-code removes the single point of failure: changing the process is a pull request, and the process's history is git log, not archaeology in someone's .bash_history.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A CI pipeline in miniature: ordered stages, fail fast, nothing after a failure runs. Predict the exact log lines — including how many stages never run — then flip test's pass to true and predict again.",
    code: `// A pipeline is a trigger plus ordered stages. First failure
// stops everything after it — a broken commit can't reach deploy.

interface Stage {
  name: string;
  pass: boolean; // whether this stage's command would exit 0
}

const pipeline: Stage[] = [
  { name: "lint", pass: true },
  { name: "test", pass: false }, // one failing unit test
  { name: "build", pass: true },
  { name: "package", pass: true },
  { name: "deploy", pass: true },
];

function runPipeline(stages: Stage[]): void {
  let failedAt: string | null = null;
  let ran = 0;

  for (const stage of stages) {
    if (failedAt) {
      console.log(\`- \${stage.name}: skipped\`);
      continue;
    }
    ran++;
    if (stage.pass) {
      console.log(\`✓ \${stage.name}: passed\`);
    } else {
      failedAt = stage.name;
      console.log(\`✗ \${stage.name}: FAILED\`);
    }
  }

  if (failedAt) {
    const skipped = stages.length - ran;
    console.log(\`\\nPipeline failed at "\${failedAt}" — \${skipped} stage(s) never ran.\`);
    console.log("Nothing was deployed. The broken commit never reached production.");
  } else {
    console.log("\\nAll stages green — this commit is deployable.");
  }
}

runPipeline(pipeline);`,
  },

  keyPoints: [
    "CI = every push is checked out, built, and tested automatically on a clean machine — problems surface minutes after they're created, not on deploy day.",
    "The clean runner is the point: a green build proves the repo's own declared setup is sufficient, killing \"works on my machine\" as a defence.",
    "Pipelines fail fast (cheap stages like lint first) and fail loudly (red X on the commit/PR); after a failure, later stages don't run.",
    "Continuous Delivery: every passing change becomes a deployable artifact, a human presses the button. Continuous Deployment: no button — passing changes ship automatically.",
    "GitHub Actions, GitLab CI, and Jenkins all share the same model — pipeline described in a YAML file in the repo, triggered by pushes; learn one and the rest are dialects.",
    "The cultural shift: the deploy process moves from one person's head and shell history into reviewed, versioned code in the repository.",
  ],

  interview: [
    {
      q: "What's the difference between continuous integration, continuous delivery, and continuous deployment?",
      a: "Continuous integration is the foundation: every push triggers an automated build and test run on a clean machine, so integration breakage is caught within minutes while the change is small. Continuous delivery builds on that — every change that passes the pipeline is packaged into a deployable artifact, and releasing to production is a single manual decision, a button rather than a project. Continuous deployment removes the button: anything that passes the pipeline ships to production automatically. The distinction between the two CDs is who pulls the trigger — a human or the pipeline. Most teams I'd join practise delivery; full deployment requires test coverage and healthcheck-gated rollouts you have to earn first.",
    },
    {
      q: "Why is it important that CI runs on a clean machine rather than a developer's laptop?",
      a: "Because a laptop accumulates years of undocumented state — globally installed tools, environment variables, that one library someone compiled by hand in 2019. A test pass there proves the code works *plus* all that invisible state. A CI runner starts empty on every run: checkout, install from the lockfile, build, test. If it goes green, the repository's own declared setup is provably sufficient to build the project, which is the same claim a Dockerfile makes about running it. I've lived the alternative for years in PHP shops — the server that only Bob's five-year-old setup could deploy from — and clean-machine CI is what makes onboarding, laptop replacement, and 'works on my machine' arguments all boring.",
    },
    {
      q: "Why do pipelines put lint before tests and tests before builds?",
      a: "Fail fast: order stages by cost, cheapest first. Lint takes seconds and catches syntax and style problems; unit tests take a minute or two; builds and image packaging take longer still. If a commit has a lint error, I want the pipeline red in ten seconds — not after a ten-minute build I paid for anyway. There's a feedback-loop argument on top of the compute one: developers act on red builds fastest when the answer arrives while they're still in context. And because later stages don't run after a failure, ordering also acts as a gate — nothing gets packaged or deployed from a commit that couldn't pass the cheap checks.",
    },
  ],

  quiz: [
    {
      question:
        "A team runs its full test suite automatically on every push, and a release manager clicks 'deploy' once a week. What are they practising?",
      options: [
        "Continuous deployment, because deploys are regular",
        "Continuous integration and continuous delivery, but not continuous deployment",
        "Only continuous deployment, not CI",
        "Neither — CI requires deploying on every push",
      ],
      answerIndex: 1,
      explain:
        "Automated build-and-test on every push is CI; keeping every passing change deployable behind a human decision is delivery. Continuous deployment would remove the human — every passing change would ship automatically.",
    },
    {
      question: "In a fail-fast pipeline (lint → test → build → deploy), the test stage fails. What happens to build and deploy?",
      options: [
        "They run anyway so you get complete feedback",
        "They run, but their results are marked as warnings",
        "They don't run — the pipeline stops and the commit is marked failed",
        "Only deploy is skipped; build still runs to produce an artifact",
      ],
      answerIndex: 2,
      explain:
        "Stages after a failure don't execute. That's the gate: a commit that can't pass tests can never be packaged or deployed, and the red status lands on the commit within minutes.",
    },
    {
      question:
        "What does running CI on a clean, ephemeral machine prove that running tests on the lead developer's machine doesn't?",
      options: [
        "That the tests run faster on server hardware",
        "That the code compiles under a newer OS",
        "That production deployment will succeed",
        "That the repo's own declared setup — lockfile, scripts, config — is sufficient to build and test the project from nothing",
      ],
      answerIndex: 3,
      explain:
        "The empty runner has none of a laptop's accumulated undocumented state, so a green run demonstrates the repository is self-sufficient. It doesn't guarantee production success — that's what later deploy stages and healthchecks address.",
    },
  ],
};

export default lesson;
