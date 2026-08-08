import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "secrets-and-environments",
  title: "Secrets & Environments in Actions",
  part: "CI with GitHub Actions",
  estMinutes: 12,
  summary:
    "Where credentials live now that there's no config.php on a server: masked repo/org secrets, vars for non-sensitive config, GitHub Environments with required reviewers, and a least-privilege permissions block for GITHUB_TOKEN.",

  concept: `
For twenty years the production database password lived in a \`config.php\`
that was FTP'd to the server — and, inevitably, also in a couple of inboxes,
a shared drive, and three developers' laptops. In a pipeline world the
workflow file is public-ish code in the repo, so credentials need a home
that is *not the code*. GitHub gives you three tiers.

### Secrets and vars

**Secrets** (Settings → Secrets and variables → Actions) are write-only
values injected at run time as \`\${{ secrets.NAME }}\`. Three properties
matter:

- **Masked in logs**: if the value would appear in output, GitHub prints
  \`***\` instead.
- **Write-only**: once saved, nobody — including admins — can read a secret
  back through the UI. You can only overwrite it.
- **Withheld from fork PRs**: a pull request from a fork runs your workflow
  with no access to secrets, so a stranger can't add \`echo \${{ secrets.PROD_DB_URL }}\`
  to a PR and harvest your credentials.

**Vars** (\`\${{ vars.NAME }}\`) are the same mechanism minus masking — for
non-sensitive config like a region name or a feature flag. If it would be fine
in a committed \`.env.example\`, it's a var; if it would be an incident in a
log line, it's a secret.

### Environments: staging vs production, with rules

A job can declare \`environment: production\`. That does two things. First,
**environment-scoped secrets**: \`DEPLOY_TOKEN\` in the \`staging\` environment
and \`DEPLOY_TOKEN\` in \`production\` are different values, and each job only
sees its own — same name in the YAML, no copy-paste divergence. Second,
**protection rules** on the environment:

- **Required reviewers** — the job *pauses* until a listed human approves.
  Your old "get sign-off before touching prod" rule, enforced by the platform
  instead of by memory.
- **Deployment branch rules** — e.g. only \`main\` may deploy to production,
  so a feature branch physically cannot reach the prod environment's secrets.

### GITHUB_TOKEN and least privilege

Every run gets an automatic, short-lived \`GITHUB_TOKEN\`. Don't rely on
defaults — declare exactly what a job may do:

\`\`\`yaml
permissions:
  contents: read     # can clone the repo
  packages: write    # can push to ghcr.io — and nothing else
\`\`\`

This is the opposite of the shared \`ops\` SSH account whose password half the
company knew and which could do anything on every box.

### Foot-guns

- **Don't echo secrets.** Masking is best-effort pattern matching — transform
  a secret (base64, split across lines) and it can slip through. Treat masking
  as a seatbelt, not permission to crash.
- **Build args are not secrets.** \`ARG\` values can be baked into image layers
  and read back with \`docker history\` — the same trap as the config.php inside
  the image from the image-building part of this course. Secrets belong in
  runtime env vars or BuildKit secret mounts, never in \`--build-arg\`.
- **Pin third-party actions.** \`uses: some-org/action@v3\` trusts a movable
  tag; a compromised action sees your secrets. GitHub's own docs pin
  third-party actions to a **full commit SHA**
  (\`uses: some-org/action@<40-char-sha>\`) — the hardened practice, with
  \`@vN\` tags as the everyday convention for well-known publishers.
`,

  comparisons: [
    {
      label: "Where the production DB password lives",
      intro:
        "The app needs a database password in production. Compare who can read it, and what has to happen before it's used.",
      php: `# 2009: the password is a file, and the file travels
$ cat config.php
<?php
  define('DB_PASS', 'Pr0d!Hunter2');  # also in
  # - the "FYI new db pass" email thread (3 inboxes)
  # - deploy-notes.txt on the shared drive
$ ftp ftp.example.com
ftp> put config.php
# rotating it means finding every copy. good luck.`,
      ts: `# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production   # prod-scoped secrets +
                               # required reviewer +
                               # only main may deploy
    steps:
      - uses: actions/checkout@v6
      - run: ./scripts/deploy.sh
        env:
          DB_PASS: \${{ secrets.DB_PASS }}
          # write-only, masked in logs,
          # withheld from fork PRs,
          # rotated in ONE place`,
      note: "The secret exists in exactly one place, is unreadable after saving, and reaches only jobs that pass the production environment's protection rules — rotation is one UI edit, not an email archaeology dig.",
    },
    {
      label: "The all-powerful shared account vs a scoped token",
      intro:
        "Something has to authenticate the deploy. The old way was one credential that could do everything; the new way is a per-run token that can do two things.",
      php: `# the shared ops account, password auth
$ ssh ops@prod-web-01.example.com
ops@prod-web-01's password: ********
# - same password since 2016, known by 9 people
# - sudo ALL=(ALL) NOPASSWD: ALL
# - no record of WHO actually logged in
$ sudo systemctl restart apache2`,
      ts: `# per-run GITHUB_TOKEN, least privilege
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read     # clone the repo
      packages: write    # push to ghcr.io
      # everything else: no. can't touch issues,
      # can't rewrite the repo, can't approve PRs.
    steps:
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}`,
      note: "GITHUB_TOKEN is minted per run, expires when the run ends, is attributed to a specific actor and commit, and the permissions block caps what it can do — a leak is bounded in both power and time.",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "A deploy job targeting the production environment, which has a required reviewer and an environment-scoped DEPLOY_TOKEN. Predict two behaviours before checking: what happens to the run before the job starts, and what appears in the log where the token is used.",
    code: `# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6
      - name: Push release to host
        run: |
          echo "Deploying \$IMAGE with token \$DEPLOY_TOKEN"
          curl -fsS -H "Authorization: Bearer \$DEPLOY_TOKEN" \\
            https://deploy.example.com/api/release
        env:
          IMAGE: ghcr.io/acme/shipit:sha-a1b2c3d
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}`,
    output: `$ gh run watch 4471

deploy  ·  Waiting for review
  Environment "production" requires approval from: jason, ops-lead
  ── run paused; nothing has executed yet ──

  [12 minutes later] Approved by @jason

deploy (production)
  Run actions/checkout@v6
  Run Push release to host
    Deploying ghcr.io/acme/shipit:sha-a1b2c3d with token ***
    {"status":"released","id":"rel_8f31"}
  ✓ deploy  1m12s

Behaviour 1: the job did not start until a required reviewer approved —
that's the environment's protection rule, and it also means the job only
received production's DEPLOY_TOKEN after approval.
Behaviour 2: the echoed token prints as *** — GitHub masks secret values
in logs. (Masking is best-effort: don't echo secrets on purpose.)`,
  },

  keyPoints: [
    "Secrets are write-only, masked as *** in logs, injected via `${{ secrets.NAME }}`, and withheld from fork-PR runs; vars (`${{ vars.NAME }}`) are the unmasked variant for non-sensitive config.",
    "`environment: production` on a job unlocks environment-scoped secrets and enforces that environment's protection rules: required reviewers pause the run, deployment branch rules limit which branches can deploy.",
    "Same secret name, different value per environment — staging and production each define DEPLOY_TOKEN and jobs only see their own.",
    "Declare a `permissions:` block per job (e.g. `contents: read, packages: write`) so the auto-generated, run-scoped GITHUB_TOKEN carries least privilege.",
    "Never pass secrets as build args — ARG values can be baked into layers and recovered with `docker history`; masking is best-effort, so don't echo secrets either.",
    "GitHub's own docs pin third-party actions to full commit SHAs; @vN tags are the everyday convention for trusted publishers, but a tag can move — a SHA cannot.",
  ],

  interview: [
    {
      q: "How do you manage credentials in a GitHub Actions pipeline?",
      a: "Secrets live in GitHub's secret store — repo, org, or environment level — and reach the workflow as `${{ secrets.NAME }}`. They're write-only once saved, masked in logs, and withheld from fork pull requests, which kills the drive-by 'echo the secret in a PR' attack. Non-sensitive config goes in vars instead so we're not treating a region name like a password. For deploy credentials specifically I scope them to a GitHub Environment, so the production token is only released to jobs that pass production's protection rules. And wherever possible I avoid stored credentials entirely — the per-run GITHUB_TOKEN with a least-privilege permissions block covers registry pushes without any long-lived secret existing at all.",
    },
    {
      q: "What do GitHub Environments give you over plain repo secrets?",
      a: "Three things. Scoping: staging and production each hold their own value under the same secret name, so one workflow file deploys to both without duplication or copy-paste drift. Gating: protection rules like required reviewers pause the job before it starts — the platform enforces the 'sign-off before prod' rule a human used to enforce by memory — and the job doesn't receive the environment's secrets until approval. And targeting: deployment branch rules mean a feature branch physically can't run against production or read its secrets. It also gives you a deployment history per environment, which is your audit trail for 'what's on prod and who approved it'.",
    },
    {
      q: "What are the common ways secrets leak from CI, and how do you prevent them?",
      a: "The classic three: logging, baking, and supply chain. Logging — GitHub masks secret values as ***, but masking is pattern-based and a transformed secret (base64, split) can slip through, so the rule is simply never to print them. Baking — passing a secret as a Docker build arg embeds it where `docker history` can recover it; secrets belong in runtime env vars or BuildKit secret mounts. Supply chain — `uses: third-party/action@v3` runs someone else's code with access to your job, and a tag can be re-pointed after compromise; GitHub's own docs pin third-party actions to a full commit SHA, which is what I do for anything outside actions/* and docker/*. Plus least-privilege `permissions:` on GITHUB_TOKEN, so even a compromised step has a small blast radius.",
    },
  ],

  quiz: [
    {
      question:
        "A pull request from a fork modifies the workflow to run `echo ${{ secrets.PROD_TOKEN }}`. What happens?",
      options: [
        "The token prints in the public log, masked as ***",
        "Nothing leaks — secrets are not provided to workflow runs triggered from fork PRs",
        "The run fails with a syntax error",
        "The token is emailed to the repository admins for review",
      ],
      answerIndex: 1,
      explain:
        "Fork-PR runs simply don't receive secrets, so the expression resolves to an empty string. Masking is the second line of defence for your own runs; withholding is what protects you from strangers' code.",
    },
    {
      question:
        "What does `environment: production` on a job do when the production environment has required reviewers configured?",
      options: [
        "It sends a notification but the job runs immediately",
        "It only changes which runner pool executes the job",
        "The job pauses before starting until an approved reviewer signs off, and only then receives production's scoped secrets",
        "It re-runs the test suite against the production database",
      ],
      answerIndex: 2,
      explain:
        "Required reviewers are a protection rule: the run halts at the job boundary, listed reviewers approve in the UI, and only then does the job execute with the environment's secrets. Deployment branch rules can additionally restrict which branches may target the environment.",
    },
    {
      question: "Why is `docker build --build-arg DB_PASS=$DB_PASS .` dangerous?",
      options: [
        "Build args are rejected by BuildKit",
        "The ARG value can be baked into image layers and recovered later with docker history",
        "It makes the build non-deterministic",
        "Environment variables are not available during builds",
      ],
      answerIndex: 1,
      explain:
        "ARG values become part of the build's recorded instructions, and anyone who can pull the image can read them back with docker history. Runtime env vars or BuildKit secret mounts keep credentials out of the artifact itself.",
    },
    {
      question:
        "According to GitHub's own documentation, what is the hardened way to reference a third-party action?",
      options: [
        "uses: some-org/action@main to always get fixes",
        "uses: some-org/action@v3 — major tags are immutable",
        "Vendor the action's code into your repo",
        "Pin it to a full commit SHA, e.g. uses: some-org/action@<40-char-sha>",
      ],
      answerIndex: 3,
      explain:
        "Tags — including major version tags — can be moved to point at new, possibly malicious code. A full commit SHA is immutable, so you run exactly the code you audited. @vN remains the common convention for high-trust publishers like actions/* and docker/*.",
    },
  ],
};

export default lesson;
