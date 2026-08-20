import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "shipshape-lint-and-the-pipeline",
  title: "Shipshape, Lint and GitLab CI: The Full Gate",
  part: "The Compliance Gates",
  estMinutes: 13,
  summary:
    "Which jobs in the vendored GitLab pipeline can actually stop a merge, why a high-severity Shipshape breach can leave the pipeline green, and how to read a Shipshape check name as an assertion about exported config rather than a coding-standards nit.",
  concept: `## Two gates, and the pipeline is the weaker one

You already run phpcs and phpunit on Drupal projects. On GovCMS the QA story is two gates that answer different questions, and only one of them can stop a deployment.

- **The GitLab pipeline.** Your project's \`.gitlab-ci.yml\` is a short \`include:\` of a vendored file — and it is on the SaaS locked-files list. The job bodies live in \`.gitlab-ci-main.yml\` in \`scaffold-tooling\`, which the PaaS scaffold pins at \`ref: "{{ GOVCMS_VERSION }}.x-master"\`.
- **The Lagoon rollout.** Post-rollout task 2, \`Perform GovCMS platform validations\`, runs Shipshape again inside the \`## START SaaS-only\` block, guarded by \`GOVCMS_SKIP_AUDIT\`.

### The vendored pipeline

Four stages, declared in that order:

\`\`\`text
stage        job          gate                    what it runs
static       vet          allow_failure: false    composer validate; govcms-vet
static       shipshape    allow_failure: true     shipshape run . -f /govcms/shipshape.yml
static       lint         .job-lint  (advisory)   govcms-lint on modules/custom + themes/custom
preflight    preflight    .job-preflight          drush cim -y; drush st; drush updatedb:status
integration  behat        .job-behat  (manual)    govcms-behat
integration  functional   .job-functional         phpunit --testsuite=functional
deploy       deploy       -                       echoes the GovCMS Dashboard URL
\`\`\`

\`vet\` is the only job in the file with \`allow_failure: false\`, and the comment above it says why: it "must always run because it's a platform compliance check … it should not use \`extends:\`". \`shipshape\` and \`deploy\` declare no \`extends:\` either — \`shipshape\` simply sets \`allow_failure: true\` inline. The jobs that do extend are \`lint\`, \`unit\`, \`preflight\`, \`behat\` and \`functional\`, pulling \`.job-lint\`, \`.job-unit\`, \`.job-preflight\`, \`.job-behat\` and \`.job-functional\` from \`.gitlab-ci-inputs.yml\` — the one CI file you may edit, and the one \`scaffold-init.sh\` deletes outright when the type is \`saas\` or \`saasplus\`.

\`govcms-vet\` is not a linter. It shallow-clones the scaffold at your \`.version.yml\` pin, runs \`ahoy init\` on it, and diffs your committed tree against that ideal: \`repositories\`, \`extra.enable-patching\`, \`scripts\`, the patches-file location, \`custom/composer/patches.json\`, the keys of \`custom/composer/composer.json\`, and \`[vet-007]\` — any \`*.info.yml\` under \`web\` on a path containing \`modules\`. On \`paas\` it prints the problems and exits \`0\`; on \`saas\` and \`saasplus\` it exits \`1\`.

### A Shipshape failure is not a style failure

\`govcms-lint\` is the coding-standards half: \`parallel-lint\`, then \`phpcs\` against \`tests/phpcs.xml\` (\`Drupal\` plus \`DrupalPractice\`), then \`phpmd\`. The job wraps them in \`set +exuo pipefail\` specifically so all three report instead of the first one aborting.

Shipshape asserts something else — but read the prefix before you read the name. Both GovCMS invocations pass \`--exclude-db\`, and that flag drops every check whose type needs a database, so only the \`[FILE]\` checks ever execute. Those assert things about exported config and repo files: \`[FILE] Verify enabled modules\` (severity \`high\`) reads \`config/default/core.extension.yml\`, \`[FILE] Disallowed permissions\` (severity \`high\`) reads \`config/default/user.role.*.yml\`, \`[FILE] Validate TFA config\` reads \`config/default/tfa.settings.yml\`, and \`[FILE] Yaml lint platform files\` parses \`.lagoon.yml\` and \`docker-compose.yml\`. The \`[DATABASE]\` twins are all declared in \`shipshape.yml\` and none of them run. A breach is still not a coding-standards nit — the fix is exported config or a role change, not a patch to a \`.theme\` file.

### The bit interviews get wrong

**Shipshape does not short-circuit.** Every check runs. It then exits \`2\` only when the result list is \`Fail\` *and* at least one breach is at or above \`--fail-severity\`, which defaults to \`high\`. Stopping early is a GitLab stage behaviour, not a Shipshape one.

So a \`high\` breach in the \`shipshape\` job leaves the pipeline green — that job is \`allow_failure: true\` and merely uploads \`tests/shipshape-results.xml\` as a JUnit report. The same breach at post-rollout task 2 fails the SaaS rollout. And \`[FILE] Banned PHP function list\` declares no severity at all, so under Shipshape it fails the report and nothing else; only the standalone \`govcms-validate-php-functions\` script exits non-zero on it.`,
  comparisons: [
    {
      label: "Where the pipeline is defined",
      intro:
        "On a site you control the pipeline is yours to write. On GovCMS the file in your repo only points at a vendored one, and the amount you may tune depends on the offering type.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .gitlab-ci.yml on a Drupal site you own -- you write every line.
stages:
  - static
  - test

variables:
  COMPOSER_CACHE_DIR: "\${CI_PROJECT_DIR}/.composer-cache"

phpcs:
  stage: static
  image: php:8.3-cli
  script:
    - composer install --no-interaction --no-progress
    - vendor/bin/phpcs --standard=Drupal,DrupalPractice web/modules/custom web/themes/custom
  allow_failure: false

phpstan:
  stage: static
  image: php:8.3-cli
  script:
    - composer install --no-interaction --no-progress
    - vendor/bin/phpstan analyse -c phpstan.neon web/modules/custom
  allow_failure: false

phpunit:
  stage: test
  image: php:8.3-cli
  script:
    - composer install --no-interaction --no-progress
    - vendor/bin/phpunit -c web/core --testsuite=unit web/modules/custom
  allow_failure: false`,
      ts: `# .gitlab-ci.yml -- the whole file. On the SaaS locked-files list.
include:
  - project: 'govcms/govcms8-scaffold-ci'
    ref: master
    file: '.gitlab-ci-include.yml'

# PaaS instead: scaffold-init.sh renames .gitlab-ci.paas.yml over the top
# and substitutes the version, giving you this.
image: gitlab-registry-production.govcms.amazee.io/govcms/images/ci\${GOVCMS_CI_IMAGE_VERSION}

include:
  - local: '/.gitlab-ci-inputs.yml'
  - project: 'govcms/scaffold-tooling'
    ref: "11.x-master"
    file: '.gitlab-ci-main.yml'

# .gitlab-ci-inputs.yml -- the only CI knobs you own, and scaffold-init.sh
# deletes this file when the type is saas or saasplus.
.job-lint:
  when: on_success
  allow_failure: true

.job-unit:
  when: manual
  allow_failure: true

.job-preflight:
  when: on_success
  allow_failure: true`,
      note:
        "You tune GovCMS CI by redefining anchors, never by editing jobs — and on SaaS even the anchor file is removed at init, so the pipeline is entirely the platform's.",
    },
    {
      label: "Deciding what blocks the merge",
      intro:
        "Same question on both sides: which failing job stops the build? On a site you own it is a per-job judgement call. On GovCMS exactly one job is declared non-ignorable, and the vendored file says so in a comment.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Your own call, job by job.
code_standards:
  stage: static
  script:
    - vendor/bin/phpcs --standard=Drupal web/modules/custom
  allow_failure: false      # style is a hard gate on this team

security_advisories:
  stage: static
  script:
    - composer audit --locked --format=plain
  allow_failure: false

accessibility:
  stage: test
  script:
    - npx pa11y-ci --sitemap https://staging.example.gov.au/sitemap.xml
  allow_failure: true       # advisory until the backlog is cleared`,
      ts: `# .gitlab-ci-main.yml in scaffold-tooling -- verbatim structure.

# NOTICE: By default, this job must always run because it's a platform
# compliance check. It should be "allow_failure: false" and
# it should not use "extends:". PaaS users can override (docs link).
vet:
  <<: *static_template
  stage: static
  script:
    - composer validate
    - ./vendor/bin/govcms-vet
  when: on_success
  allow_failure: false

shipshape:
  <<: *static_template
  stage: static
  artifacts:
    reports:
      junit:
        - tests/shipshape-results.xml
    when: always
  script:
    - shipshape run . -f /govcms/shipshape.yml --exclude-db --error-code -o junit > tests/shipshape-results.xml
  when: on_success
  allow_failure: true

lint:
  <<: *static_template
  extends: .job-lint
  script:
    - |
      set +exuo pipefail
      ./vendor/bin/govcms-lint web/modules/custom
      ./vendor/bin/govcms-lint web/themes/custom`,
      note:
        "Read the gate off the job, not the severity: shipshape can exit 2 on a high breach and the pipeline still passes, because allow_failure is true.",
    },
    {
      label: "Running the standards tools",
      intro:
        "Invoking phpcs directly versus invoking the wrapper GovCMS ships. The wrapper decides the ruleset, the extensions and the failure semantics for you.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
# Vanilla Drupal: your composer scripts, your ruleset, your exit codes.
set -euo pipefail

vendor/bin/phpcs --standard=Drupal,DrupalPractice \\
  --extensions=php,module,inc,install,test,profile,theme \\
  web/modules/custom web/themes/custom

vendor/bin/phpstan analyse -c phpstan.neon --level=2 web/modules/custom

# Fix what is auto-fixable before the reviewer sees it.
vendor/bin/phpcbf --standard=Drupal web/modules/custom || true`,
      ts: `#!/usr/bin/env bash
# GovCMS: one wrapper, and it is the same binary CI calls.
# ahoy lint runs both paths in the test container, exactly as CI does.
ahoy lint

# Or one path at a time. Note it is "ahoy run <command>" -- "ahoy cli" takes
# no argument, it just drops you into a shell in the cli container.
ahoy run "./vendor/bin/govcms-lint web/themes/custom"

# What govcms-lint does internally, in order:
#   touch \${APP_DIR}/web/themes/custom/index.php
#   parallel-lint --exclude ./tests/vendor -e php,inc,module,theme,install,profile,test <path>
#   rm  \${APP_DIR}/web/themes/custom/index.php
#   phpcs --standard=\${APP_DIR}/tests/phpcs.xml <path>
#   phpmd <path> text codesize,unusedcode,cleancode
#
# It exits 0 with "[info]: Cannot lint <path> - does not exist" when the
# directory is absent, so an empty modules/custom is never a failure.

# The unit job calls a binary that is not in scaffold-tooling's bin list;
# the installed one is govcms-phpunit. The job is manual and advisory,
# so nobody notices.
ahoy run "./vendor/bin/govcms-phpunit --testsuite=unit"`,
      note:
        "tests/phpcs.xml describes itself as the standard for GovCMS PaaS and pulls in Drupal plus DrupalPractice; scaffold-init.sh removes that file for saas and saasplus.",
    },
    {
      label: "Asserting platform compliance",
      intro:
        "A compliance gate that inspects the running site, not the code. On your own site you write one; on GovCMS the platform runs one twice, with different consequences each time.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
# Your own compliance gate on a Drupal site you control.
set -euo pipefail

fail=0

if drush pm:list --status=enabled --field=name --format=list | grep -qx dblog; then
  echo "FAIL: dblog is enabled in this environment."
  fail=1
fi

if [[ "$(drush config:get system.performance css.preprocess --format=string)" != "true" ]]; then
  echo "FAIL: CSS aggregation is off."
  fail=1
fi

if drush role:list --format=json | jq -e '.[] | select(.is_admin == true) | select(.id != "administrator")' > /dev/null; then
  echo "FAIL: a non-administrator role carries is_admin."
  fail=1
fi

exit "$fail"`,
      ts: `#!/usr/bin/env bash
# GovCMS runs the same validator in two places, with two different gates.

# 1. GitLab, static stage. JUnit report, advisory: allow_failure: true.
shipshape run . -f /govcms/shipshape.yml --exclude-db --error-code -o junit > tests/shipshape-results.xml

# 2. .lagoon.yml post-rollout task 2, "Perform GovCMS platform validations",
#    inside the ## START SaaS-only block, skippable via GOVCMS_SKIP_AUDIT.
#    This one can fail the deployment.
shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml --exclude-db --error-code .

# Both carry --exclude-db, which drops every check whose type requires a
# database. So none of the [DATABASE] checks in shipshape.yml ever run in
# either place -- only the [FILE] checks over exported config and repo files.
#
# Exit semantics, both invocations:
#   every surviving check runs -- there is no early exit
#   exit 2 only if the result list is Fail AND a breach is at or above
#          --fail-severity, which defaults to high
#
# So these two behave differently even though both are "failures":
#   [FILE] Verify enabled modules          severity: high  -> exit 2
#   [FILE] Banned PHP function list        no severity     -> reported only
#
# The banned-function list does gate on its own, via the standalone script:
ahoy run "./vendor/bin/govcms-validate-php-functions"

# And the same Shipshape command the rollout runs, locally:
ahoy ship-shape`,
      note:
        "Severity in shipshape.yml decides the exit code; allow_failure in the CI job decides whether that exit code matters. Two independent switches.",
    },
  ],
  playground: {
    intro:
      "A GitLab stage gate over the four GovCMS stages. Every job in a stage runs, then the gate is evaluated — only a failing job with allow_failure: false halts the pipeline. Run it twice and watch which failures survive a green build.",
    lang: "php",
    code: `<?php

// blocking === TRUE models allow_failure: false.
$pipeline = [
  ['stage' => 'static', 'jobs' => [
    ['job' => 'vet', 'blocking' => TRUE, 'assert' => 'composer.json repositories match scaffold [vet-001]'],
    ['job' => 'vet', 'blocking' => TRUE, 'assert' => 'no custom module info.yml committed [vet-007]'],
    ['job' => 'shipshape', 'blocking' => FALSE, 'assert' => '[FILE] Verify enabled modules (high)'],
    ['job' => 'lint', 'blocking' => FALSE, 'assert' => 'phpcs Drupal + DrupalPractice on themes/custom'],
  ]],
  ['stage' => 'preflight', 'jobs' => [
    ['job' => 'preflight', 'blocking' => FALSE, 'assert' => 'drush cim -y then drush updatedb:status'],
  ]],
  ['stage' => 'integration', 'jobs' => [
    ['job' => 'behat', 'blocking' => FALSE, 'assert' => 'govcms-behat smoke suite (manual)'],
  ]],
  ['stage' => 'deploy', 'jobs' => [
    ['job' => 'deploy', 'blocking' => FALSE, 'assert' => 'echo the GovCMS Dashboard URL'],
  ]],
];

// Assertions currently breached on the pushed branch.
$breaches = [
  'no custom module info.yml committed [vet-007]',
  '[FILE] Verify enabled modules (high)',
  'phpcs Drupal + DrupalPractice on themes/custom',
];

function verdict(array $job, array $breaches): string {
  if (!in_array($job['assert'], $breaches, TRUE)) {
    return 'PASS';
  }
  return $job['blocking'] ? 'BLOCKING FAIL' : 'WARN';
}

function run_pipeline(array $pipeline, array $breaches, string $title): void {
  echo $title . "\\n";
  printf("  %-12s %-10s %-14s %s\\n", 'STAGE', 'JOB', 'VERDICT', 'ASSERTION');
  $halted = '';
  $skipped = 0;
  foreach ($pipeline as $stage) {
    if ($halted !== '') {
      $skipped++;
      continue;
    }
    $blocked = FALSE;
    foreach ($stage['jobs'] as $job) {
      $v = verdict($job, $breaches);
      printf("  %-12s %-10s %-14s %s\\n", $stage['stage'], $job['job'], $v, $job['assert']);
      $blocked = $blocked || $v === 'BLOCKING FAIL';
    }
    if ($blocked) {
      $halted = $stage['stage'];
    }
  }
  if ($halted !== '') {
    printf("  -> halted at stage '%s'; %d later stage(s) never ran\\n\\n", $halted, $skipped);
  }
  else {
    echo "  -> pipeline green; every breach above was advisory\\n\\n";
  }
}

run_pipeline($pipeline, $breaches, 'RUN 1 -- branch as pushed');

// Move the custom module out of the repo. Nothing else is fixed.
$fixed = array_values(array_diff($breaches, ['no custom module info.yml committed [vet-007]']));
run_pipeline($pipeline, $fixed, 'RUN 2 -- after the only blocking breach is fixed');

echo "A high-severity Shipshape breach survives RUN 2 and the merge is allowed.\\n";
echo "Shipshape ran every check both times; only GitLab stopped early.\\n";`,
    output: `RUN 1 -- branch as pushed
  STAGE        JOB        VERDICT        ASSERTION
  static       vet        PASS           composer.json repositories match scaffold [vet-001]
  static       vet        BLOCKING FAIL  no custom module info.yml committed [vet-007]
  static       shipshape  WARN           [FILE] Verify enabled modules (high)
  static       lint       WARN           phpcs Drupal + DrupalPractice on themes/custom
  -> halted at stage 'static'; 3 later stage(s) never ran

RUN 2 -- after the only blocking breach is fixed
  STAGE        JOB        VERDICT        ASSERTION
  static       vet        PASS           composer.json repositories match scaffold [vet-001]
  static       vet        PASS           no custom module info.yml committed [vet-007]
  static       shipshape  WARN           [FILE] Verify enabled modules (high)
  static       lint       WARN           phpcs Drupal + DrupalPractice on themes/custom
  preflight    preflight  PASS           drush cim -y then drush updatedb:status
  integration  behat      PASS           govcms-behat smoke suite (manual)
  deploy       deploy     PASS           echo the GovCMS Dashboard URL
  -> pipeline green; every breach above was advisory

A high-severity Shipshape breach survives RUN 2 and the merge is allowed.
Shipshape ran every check both times; only GitLab stopped early.
`,
  },
  keyPoints: [
    "Your project's `.gitlab-ci.yml` is an `include:` of a vendored pipeline and sits on the SaaS locked-files list; the job bodies live in `.gitlab-ci-main.yml` in `scaffold-tooling`, which the PaaS scaffold pins at `<version>.x-master`.",
    "Four stages — `static`, `preflight`, `integration`, `deploy` — and `vet` is the only job declared `allow_failure: false`. `lint`, `unit`, `preflight`, `behat` and `functional` extend anchors from `.gitlab-ci-inputs.yml`, a file `scaffold-init.sh` deletes for `saas` and `saasplus`; `shipshape` and `deploy` extend nothing, `shipshape` just sets `allow_failure: true` inline.",
    "`govcms-vet` diffs your committed tree against a freshly `ahoy init`-ed scaffold (composer `repositories`, `scripts`, patching, `custom/composer/*`, and `[vet-007]` for module `*.info.yml` under `web`). It exits `0` on `paas` and `1` on `saas`/`saasplus`.",
    "Shipshape never short-circuits: every check runs, then it exits `2` only if the result list is `Fail` and a breach is at or above `--fail-severity` (default `high`). Stage-level short-circuiting is GitLab, not Shipshape.",
    "The CI `shipshape` job is `allow_failure: true` and just publishes `tests/shipshape-results.xml` as JUnit; the gate that bites is post-rollout task 2, `Perform GovCMS platform validations`, in the SaaS-only block of `.lagoon.yml`.",
    "Both invocations pass `--exclude-db`, which drops every check whose type requires a database, so only the `[FILE] …` checks run — assertions about exported config and repo files (`[FILE] Verify enabled modules`, `[FILE] Disallowed permissions`, both `severity: high`) whose fix is a change under `config/default`. `govcms-lint` (parallel-lint, phpcs against `tests/phpcs.xml`, phpmd) is the advisory coding-standards half.",
  ],
  interview: [
    {
      q: "Walk me through the GovCMS GitLab pipeline. Which job actually blocks a merge?",
      a: "There are four stages — `static`, `preflight`, `integration`, `deploy` — and only one job is declared `allow_failure: false`: `vet`, in the `static` stage, running `composer validate` then `./vendor/bin/govcms-vet`. The vendored file carries a comment saying that job must always run because it is a platform compliance check and must not use `extends:`. Everything else — `shipshape`, `lint`, `preflight`, `behat`, `functional` — is advisory, and `behat`, `functional` and `unit` are `when: manual` on top of that. The practical consequence is that the pipeline is a reporting surface with one real gate, and I've had to explain to clients that a red `shipshape` job still merges anywhere, while on SaaS or SaaS+ a `vet` compliance breach does not. On PaaS `govcms-vet` sets `ON_ERROR=0`, so it prints the same problems and still exits `0` — the only thing that can redden that job on PaaS is the `composer validate` line that runs before it.",
    },
    {
      q: "A build shows a high-severity Shipshape breach but the pipeline is green. Is that a bug?",
      a: "No, that's the design, and it's two independent switches. Severity in `shipshape.yml` decides whether Shipshape exits `2` — it does so only when the result list is `Fail` and at least one breach is at or above `--fail-severity`, which defaults to `high`. Whether that exit code stops anything is decided by the CI job, and the `shipshape` job is `allow_failure: true`; it uploads `tests/shipshape-results.xml` as a JUnit report and the `after_script` prints a banner pointing at the test report. The place the same binary genuinely gates is post-rollout task 2 in `.lagoon.yml`, `Perform GovCMS platform validations`, inside the SaaS-only block. So my first question on a green-with-breaches build is always \"has this been through a rollout yet?\", because the deploy is where it bites.",
    },
    {
      q: "How do you triage a Shipshape policy failure versus a lint failure?",
      a: "I read the check name first, because it tells me which artefact is wrong. `govcms-lint` findings come from `parallel-lint`, `phpcs` against `tests/phpcs.xml` (Drupal plus DrupalPractice) and `phpmd`, so they're code and I fix the file. Shipshape names like `[FILE] Verify enabled modules`, `[FILE] Validate TFA config` or `[FILE] Disallowed permissions` are assertions about exported config and repo files, so the fix lands in `config/default`, not in a `.theme` file. The trap runs the other way from what people expect: both GovCMS invocations pass `--exclude-db`, which filters out every `[DATABASE]` check in `shipshape.yml` before anything runs. So a permission a delegated admin granted in the UI and never exported is precisely what the rollout gate will *not* catch — while committing that same permission into `config/default/user.role.*.yml` trips `[FILE] Disallowed permissions` at `severity: high` and fails the rollout.",
    },
    {
      q: "A client wants a new blocking accessibility job in the pipeline. What do you tell them?",
      a: "It depends on the offering. On PaaS the project's `.gitlab-ci.yml` includes `.gitlab-ci-main.yml` from `scaffold-tooling` plus a local `.gitlab-ci-inputs.yml`, and that inputs file is where the anchors like `.job-lint` and `.job-preflight` live, so I can retune existing jobs and add my own jobs on top. On SaaS the `.gitlab-ci.yml` is on the locked-files list — a push that changes it is declined — and `scaffold-init.sh` deletes `.gitlab-ci-inputs.yml` at provisioning time, so there is no self-serve surface at all. In that case I run the check outside the platform pipeline, on the agency's own CI against the repo, and treat GovCMS CI as the compliance gate only. I'd also be honest that accessibility isn't something GovCMS tests for you: the platform ships no accessibility-tagged test run, and conformance of the theme and content is the agency's responsibility at WCAG Level AA.",
    },
  ],
  quiz: [
    {
      question:
        "In the vendored `.gitlab-ci-main.yml`, which job is declared `allow_failure: false`?",
      options: ["shipshape", "lint", "vet", "preflight"],
      answerIndex: 2,
      explain:
        "`vet` is the only one, and the file comments say it must stay that way and must not use `extends:`. `shipshape` is explicitly `allow_failure: true`; `lint` and `preflight` extend anchors from `.gitlab-ci-inputs.yml` that set `allow_failure: true`.",
    },
    {
      question:
        "Shipshape hits a `severity: high` breach on its third check. What happens next?",
      options: [
        "It runs the remaining checks, then exits 2 because a breach is at or above the default --fail-severity",
        "It aborts immediately and exits 2, skipping the remaining checks",
        "It aborts immediately and exits 1, and the report file is never written",
        "It records the breach and exits 0 regardless; severity only colours the report",
      ],
      answerIndex: 0,
      explain:
        "Shipshape runs the whole check list and only then decides the exit code: `2` when the result list is `Fail` and at least one breach is at or above `--fail-severity` (default `high`). Short-circuiting is a GitLab stage behaviour, not a Shipshape one.",
    },
    {
      question:
        "`govcms-vet` finds that `composer.json` `repositories` no longer matches the scaffold. On a project whose `.version.yml` type is `paas`, what does the script exit with?",
      options: ["1", "2", "255", "0"],
      answerIndex: 3,
      explain:
        "`govcms-vet` sets `ON_ERROR=0` for `paas`, so PaaS users see the problems printed in the job log but a green result. `ON_ERROR=1` is set for `saas` and `saasplus`; an unrecognised type exits 1 immediately.",
    },
    {
      question:
        "A phpcs violation lands in `web/themes/custom` on a GovCMS project. What is its effect on the pipeline?",
      options: [
        "It blocks the merge, because lint runs in the static stage alongside vet",
        "It is reported by the `lint` job but does not block, because that job extends `.job-lint` with `allow_failure: true`",
        "It blocks the SaaS rollout, because Shipshape re-runs phpcs as post-rollout task 2",
        "It is never seen, because `govcms-lint` only runs against `web/modules/custom`",
      ],
      answerIndex: 1,
      explain:
        "Sharing a stage with `vet` does not make a job blocking — the gate is per-job. `lint` extends `.job-lint`, which is `allow_failure: true`, and the job body even runs `set +exuo pipefail` so parallel-lint, phpcs and phpmd all report. Shipshape runs no phpcs; its PHP checks are phpstan-based. And the job lints both `web/modules/custom` and `web/themes/custom`.",
    },
  ],
};

export default lesson;
