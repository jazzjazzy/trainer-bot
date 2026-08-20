import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "behat-phpunit-and-testing",
  title: "Testing Inside the Guardrails",
  part: "The Compliance Gates",
  estMinutes: 13,
  summary:
    "The Behat and PHPUnit harness the GovCMS scaffold actually ships, why none of it ever reaches the platform, and what is left worth testing once your only shippable code is a theme and a pile of configuration.",
  concept: `## The harness is in your repo and never leaves it

You already write PHPUnit and Behat against Drupal. GovCMS changes three things: where the suite runs, what is left to test once the code boundary is applied, and whether a red suite stops anything.

The scaffold repo ships the whole harness. \`tests/behat/\` holds \`behat.yml\`, \`bootstrap/FeatureContext.php\` and \`features/home.feature\`; \`tests/phpunit/\` holds \`phpunit.xml\`, \`bootstrap.php\` and an \`ExampleTest.php\`; \`tests/phpcs.xml\` carries the \`Drupal\` + \`DrupalPractice\` ruleset. Then \`scripts/scaffold-init.sh\` strips most of it: on \`saas\` and \`saasplus\` it deletes \`behat.yml\`, \`FeatureContext.php\`, \`phpcs.xml\`, \`phpunit/bootstrap.php\` and \`phpunit.xml\`, leaving \`features/\`, \`screenshots/\` and \`phpunit/tests/\`, because the \`govcms/test\` image supplies the config at \`/app/tests\`. PaaS keeps all of it. \`docker-compose.yml\` adds a \`test\` service built from \`.docker/Dockerfile.test\` and a \`chrome\` service running \`selenium/standalone-chrome\`. Both are labelled \`lagoon.type: none\`, so Lagoon never builds them, and \`.lagoon.yml\` has no test task in either rollout phase. On SaaS the image payload is \`themes/\`, \`config\` and \`favicon.ico\` — \`tests/\` is not on that list. Your suite is a laptop-and-CI artefact. It never runs on the platform.

### The two binaries

- \`ahoy test-behat\` → \`docker compose exec -T test ./vendor/bin/govcms-behat\`, which runs \`tests/vendor/bin/behat --config /app/tests/behat/behat.yml --strict --colors "$BEHAT_PROFILE"\`. Note the *behat* binary comes from \`tests/vendor\` inside the \`govcms/test\` image, not your project's \`vendor/\`; and \`--strict\` makes an undefined step a failure rather than a yellow warning.
- \`ahoy test-phpunit\` → \`govcms-phpunit --testsuite govcms\`. Read the script before you promise a client anything: it echoes \`@todo get this working\` before invoking phpunit.

### What is left to test

On a normal Drupal build most of your unit and kernel coverage sits over custom modules. On SaaS there are none — \`govcms-vet\` compares your repo against a freshly initialised scaffold and fails \`[vet-007]\` if \`find web -name "*.info.yml" | grep modules\` returns anything, exiting 1 on \`saas\` and \`saasplus\`. What remains:

- **PHPUnit** over the two testsuites in \`phpunit.xml\` that are yours: \`theme\` (\`/app/web/themes\`) and \`govcms\` (\`/app/tests/phpunit/tests\`). Theme PHP — hooks, preprocess, autoloaded \`themes/mytheme/src\` classes — is the code you are allowed to ship, so it is the code worth unit-testing. On PaaS the picture is the familiar one: custom modules, kernel tests, the lot.
- **Behat** over everything else, because everything else is configuration. Views output, workflow transitions, field visibility, role permissions, webform submission, redirects, 404 behaviour. When the thing you changed was config, a browser assertion is the only regression net that sees it.

### Tags, profiles and the accessibility net

\`tests/behat/behat.yml\` filters \`~@skipped\` by default and defines two extra profiles, \`p0\` and \`p1\`, filtering \`@p0&&~@skipped\` and \`@p1&&~@skipped\`. You select one with \`BEHAT_PROFILE=p0\`. That is the entire tag mechanism, and it is the pattern you copy.

GovCMS ships no accessibility tag, no axe or pa11y integration and no a11y feature — the tags in the scaffold are \`@skipped\`, \`@javascript\`, \`@smoke\` and \`@api\`, plus those two profile filters. Conformance of the theme and content is the agency's, at Level AA. So the regression net is one you build: tag the scenarios, add a matching profile, run it as its own job. \`MinkContext\` and \`MarkupContext\` give you the structural assertions that actually regress under a theme change — alt attributes, heading order, form labels, skip links.

Two operational catches. On SaaS the compose file mounts \`tests/behat/features\`, \`tests/behat/screenshots\` and \`tests/phpunit/tests\` only, so a new profile means committing your own \`tests/behat/behat.yml\` and running \`ahoy build\` — \`COPY tests /app/tests/\` overlays it onto the image's copy. On PaaS the provisioner swaps in \`*paas-volumes\` (\`.:/app\`), the whole repo is live-mounted, and the edit needs no rebuild. Second, the trigger defaults: the scaffold's \`.gitlab-ci-inputs.yml\` sets \`.job-behat\`, \`.job-unit\` and \`.job-functional\` to \`when: manual\` with \`allow_failure: true\`, and the vendored \`.gitlab-ci-main.yml\` jobs merely \`extends:\` those anchors. Only \`vet\` is \`allow_failure: false\`. Your suite can be red and the pipeline green — and only PaaS keeps that inputs file, because \`scaffold-init.sh\` deletes it for \`saas\` and \`saasplus\`.`,
  comparisons: [
    {
      label: "Where the suite lives, and what ships",
      intro:
        "The same intent — run the tests in CI against a real database — declared in two places. On your own infrastructure the suite is part of the deployable codebase; on GovCMS it is a container the platform never builds.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .github/workflows/test.yml
# The tests live in the repo, ship with the artefact, and gate the merge.
name: test
on: [push, pull_request]

jobs:
  phpunit:
    runs-on: ubuntu-latest
    services:
      mariadb:
        image: mariadb:10.11
        env:
          MYSQL_ALLOW_EMPTY_PASSWORD: "yes"
          MYSQL_DATABASE: drupal
        ports: ["3306:3306"]
    env:
      SIMPLETEST_DB: mysql://root@127.0.0.1:3306/drupal
      SIMPLETEST_BASE_URL: http://localhost:8080
    steps:
      - uses: actions/checkout@v4
      - run: composer install --no-interaction
      - run: ./vendor/bin/phpunit -c phpunit.xml.dist --testsuite unit
      - run: ./vendor/bin/phpunit -c phpunit.xml.dist --testsuite kernel`,
      ts: `# docker-compose.yml (scaffold) - the harness is local/CI only.
  test:
    build:
      context: .
      dockerfile: .docker/Dockerfile.test
    labels:
      lagoon.type: none
    depends_on:
      - cli

  chrome:
    image: selenium/standalone-chrome:4.5.2-20221021
    shm_size: '1gb'
    labels:
      lagoon.type: none

# .docker/Dockerfile.test bakes the suite into the test image:
#   COPY --from=cli /app /app
#   COPY tests /app/tests/
#
# .docker/Dockerfile.saas - the entire SaaS build payload:
#   COPY themes/ /app/web/themes/custom
#   COPY config /app/config
#   COPY favicon.ico /app/web
# "tests" is not one of those three paths.`,
      note: "Both test containers are `lagoon.type: none`, and the SaaS image copies three paths, none of them `tests/`. A GovCMS suite runs in exactly two places: your laptop and GitLab CI — never on the platform.",
    },
    {
      label: "Invoking the suites",
      intro:
        "Running unit tests and a tagged browser suite. On a site you control the binaries are in your vendor directory; on GovCMS they are wrappers that exec into a container and take their profile from the environment.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
set -euo pipefail

composer install --no-interaction

# Binaries come from the project's own vendor/, run on the host.
./vendor/bin/phpunit -c phpunit.xml.dist --testsuite unit
./vendor/bin/phpunit -c phpunit.xml.dist --testsuite kernel

# Behat: pick scenarios with a flag, on the command line, per run.
./vendor/bin/behat --config behat.yml --tags '@smoke'
./vendor/bin/behat --config behat.yml --tags '@a11y&&~@wip' \\
  --format progress --format junit --out reports/behat

# Add a suite, a tag or a CI job whenever you like. Nothing is locked.`,
      ts: `#!/usr/bin/env bash
set -euo pipefail

ahoy up          # also waits: docker compose exec -T test dockerize -wait tcp://mariadb:3306

# PHPUnit: the ahoy target pins one testsuite.
ahoy test-phpunit                     # govcms-phpunit --testsuite govcms
docker compose exec -T test ./vendor/bin/govcms-phpunit --testsuite theme

# Behat: the wrapper supplies --config and --strict for you.
ahoy test-behat
#   -> docker compose exec -T test ./vendor/bin/govcms-behat
#   -> tests/vendor/bin/behat --config /app/tests/behat/behat.yml \\
#        --strict --colors "$BEHAT_PROFILE"

# A shipped profile is selected by environment variable, not a flag.
docker compose exec -T -e BEHAT_PROFILE=p0 test ./vendor/bin/govcms-behat

# On SaaS, editing tests/behat/behat.yml is not enough - it is COPYd into
# the test image, and only features/, screenshots/ and phpunit/tests are
# mounted. (On PaaS the repo itself is mounted at /app, so no rebuild.)
ahoy build`,
      note: "`govcms-behat` hard-codes `--config /app/tests/behat/behat.yml` and `--strict`, and reads `BEHAT_PROFILE` from the environment. The behat binary itself lives in `tests/vendor` inside the `govcms/test` image, not in your project's `vendor/`.",
    },
    {
      label: "Unit-testing the code you are allowed to ship",
      intro:
        "A small formatting class with real logic, and a unit test for it. Vanilla, it belongs to a custom module; on SaaS a custom module fails vetting, so the same class has to live in the theme and be picked up by a different testsuite.",
      php: `<?php

// web/modules/custom/agency_alerts/src/AlertFormatter.php
namespace Drupal\\agency_alerts;

class AlertFormatter {

  public function label(string $severity, string $title): string {
    $prefix = match ($severity) {
      'urgent' => '[URGENT] ',
      'watch' => '[WATCH] ',
      default => '',
    };
    return $prefix . $title;
  }

}

// web/modules/custom/agency_alerts/tests/src/Unit/AlertFormatterTest.php
namespace Drupal\\Tests\\agency_alerts\\Unit;

use Drupal\\agency_alerts\\AlertFormatter;
use Drupal\\Tests\\UnitTestCase;

class AlertFormatterTest extends UnitTestCase {

  public function testSeverityPrefix(): void {
    $formatter = new AlertFormatter();
    $this->assertSame('[URGENT] Flood alert', $formatter->label('urgent', 'Flood alert'));
    $this->assertSame('Flood alert', $formatter->label('info', 'Flood alert'));
  }

}

// Run: ./vendor/bin/phpunit -c phpunit.xml.dist --testsuite unit`,
      ts: `<?php

// themes/agency/src/AlertFormatter.php
// -> web/themes/custom/agency/src/AlertFormatter.php in the built image.
// A theme may autoload classes; it may not declare services or routes.
namespace Drupal\\agency;

class AlertFormatter {

  public function label(string $severity, string $title): string {
    $prefix = match ($severity) {
      'urgent' => '[URGENT] ',
      'watch' => '[WATCH] ',
      default => '',
    };
    return $prefix . $title;
  }

}

// themes/agency/tests/src/Unit/AlertFormatterTest.php
namespace Drupal\\Tests\\agency\\Unit;

use Drupal\\agency\\AlertFormatter;
use PHPUnit\\Framework\\TestCase;

class AlertFormatterTest extends TestCase {

  public function testSeverityPrefix(): void {
    $formatter = new AlertFormatter();
    $this->assertSame('[URGENT] Flood alert', $formatter->label('urgent', 'Flood alert'));
    $this->assertSame('Flood alert', $formatter->label('info', 'Flood alert'));
  }

}

// phpunit.xml maps <testsuite name="theme"> to <directory>/app/web/themes</directory>
// Run: docker compose exec -T test ./vendor/bin/govcms-phpunit --testsuite theme`,
      note: "`govcms-vet` fails `[vet-007]` on any `*.info.yml` under `web/**/modules`, so on SaaS the theme is where autoloaded PHP lives — and the `theme` testsuite, not `unit`, is what covers it.",
    },
    {
      label: "Making an accessibility run actually gate something",
      intro:
        "Turning accessibility scenarios into a blocking check. On your own pipeline you add a job; on GovCMS you add a Behat profile — and whether you can also make the job block at all depends on whether the project was provisioned as PaaS or as SaaS.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .github/workflows/a11y.yml
# Your pipeline, your job, your blocking rule.
name: accessibility
on: pull_request

jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: composer install --no-interaction
      - run: ./scripts/start-test-site.sh
      - name: Tagged Behat run
        run: ./vendor/bin/behat --config behat.yml --tags '@a11y' --strict
      - name: Automated scan
        run: npx pa11y-ci --config .pa11yci.json
    # No allow_failure key: a red job fails the pull request.`,
      ts: `# 1. tests/behat/behat.yml - the profile itself.
#    PaaS: the file is in the repo; add the profile beside p0 / p1.
#    SaaS: scaffold-init.sh deleted it - the shipped p0 / p1 live in the
#    govcms/test image at /app/tests. Commit your own file; Dockerfile.test
#    does "COPY tests /app/tests/", which overlays it. Then: ahoy build.
a11y:
  gherkin:
    filters:
      tags: "@a11y&&~@skipped"

# 2. .gitlab-ci-inputs.yml - the trigger knob, and it is PaaS-only.
#    PaaS: .gitlab-ci.paas.yml is renamed to .gitlab-ci.yml at init and
#    includes '/.gitlab-ci-inputs.yml', so these anchors take effect.
#    SaaS: scaffold-init.sh removes BOTH files and .gitlab-ci.yml is on
#    the locked-file list - there is no repo-side knob.
.job-behat:
  when: on_success      # shipped default: manual
  allow_failure: false  # shipped default: true

.job-unit:
  when: on_success
  allow_failure: false

# 3. The vendored job is unchanged - "behat:" just does "extends: .job-behat"
#    and runs: docker compose exec -T test ./vendor/bin/govcms-behat
#    so BEHAT_PROFILE is how you steer which scenarios it picks.`,
      note: "GovCMS ships no accessibility tag, axe or pa11y integration — the tag-and-profile pattern is the mechanism, and the Level AA target plus the coverage are the agency's. The `.job-*` trigger anchors are defined in `.gitlab-ci-inputs.yml`, which only a PaaS project keeps; on SaaS that file is removed at init and `.gitlab-ci.yml` is push-locked.",
    },
  ],
  playground: {
    intro:
      "One suite of scenarios, rendered twice — Behat's scenario/step shape and PHPUnit's test/assertion shape — then re-run under a tag filter, and finally reduced to the gate line the pipeline actually acts on.",
    lang: "php",
    code: `<?php

// One dataset. Two reporters. One tag filter. One gate.

$suite = [
  ['feature' => 'home.feature', 'name' => 'Anonymous user sees the homepage',
    'tags' => ['smoke', 'javascript'],
    'steps' => [['I am on the homepage', true], ['I should see "Home"', true]]],
  ['feature' => 'a11y.feature', 'name' => 'Content images carry alt text',
    'tags' => ['a11y', 'p0'],
    'steps' => [['I am on "/news/flood-alert"', true],
      ['every "img" has an "alt" attribute', false],
      ['I should see the heading "Flood alert"', true]]],
  ['feature' => 'a11y.feature', 'name' => 'Skip link is first in tab order',
    'tags' => ['a11y', 'p0'],
    'steps' => [['I am on the homepage', true], ['the skip link targets "#content"', true]]],
  ['feature' => 'webform.feature', 'name' => 'A .doc upload is rejected',
    'tags' => ['api', 'skipped'],
    'steps' => [['I attach "budget.doc"', true], ['I should see "not allowed"', true]]],
];

function selected(array $tags, string $want, array $reject): bool {
  if ($want !== '' && !in_array($want, $tags, true)) { return false; }
  foreach ($reject as $r) { if (in_array($r, $tags, true)) { return false; } }
  return true;
}

function execute(array $suite, string $want, array $reject): array {
  $run = [];
  foreach ($suite as $s) {
    if (!selected($s['tags'], $want, $reject)) { continue; }
    $verdict = 'passed';
    $s['trace'] = [];
    foreach ($s['steps'] as [$text, $ok]) {
      // Behat's rule: after a failure the rest of the scenario is skipped.
      $state = $verdict === 'failed' ? 'skipped' : ($ok ? 'passed' : 'failed');
      if ($state === 'failed') { $verdict = 'failed'; }
      $s['trace'][] = [$text, $state];
    }
    $s['verdict'] = $verdict;
    $run[] = $s;
  }
  return $run;
}

function tally(array $run): array {
  $t = ['scenarios' => 0, 'sfail' => 0, 'steps' => 0,
    'passed' => 0, 'failed' => 0, 'skipped' => 0];
  foreach ($run as $s) {
    $t['scenarios']++;
    if ($s['verdict'] === 'failed') { $t['sfail']++; }
    foreach ($s['trace'] as [$text, $state]) { $t['steps']++; $t[$state]++; }
  }
  return $t;
}

function behat_report(string $label, array $run): void {
  $t = tally($run);
  printf("[behat] %s\\n", $label);
  foreach ($run as $s) {
    printf("  %-16s %-34s %s\\n", $s['feature'], $s['name'], strtoupper($s['verdict']));
    foreach ($s['trace'] as [$text, $state]) {
      if ($state !== 'passed') { printf("    %-8s %s\\n", $state, $text); }
    }
  }
  printf("  %d scenarios (%d passed, %d failed)\\n",
    $t['scenarios'], $t['scenarios'] - $t['sfail'], $t['sfail']);
  printf("  %d steps (%d passed, %d failed, %d skipped)\\n\\n",
    $t['steps'], $t['passed'], $t['failed'], $t['skipped']);
}

function phpunit_report(array $run): void {
  $t = tally($run);
  $dots = '';
  foreach ($run as $s) { $dots .= $s['verdict'] === 'failed' ? 'F' : '.'; }
  printf("[phpunit] same data, --testsuite govcms\\n");
  printf("  %s\\n", $dots);
  $n = 0;
  foreach ($run as $s) {
    if ($s['verdict'] !== 'failed') { continue; }
    $n++;
    foreach ($s['trace'] as $i => [$text, $state]) {
      if ($state !== 'failed') { continue; }
      printf("  %d) %s::%s\\n", $n, $s['feature'], $s['name']);
      printf("     assertion %d failed: %s\\n", $i + 1, $text);
    }
  }
  printf("  Tests: %d, Assertions: %d, Failures: %d\\n\\n",
    $t['scenarios'], $t['passed'] + $t['failed'], $t['failed']);
}

echo "GovCMS test harness: one dataset, two reporters, one gate\\n";
echo "=========================================================\\n\\n";

$default = execute($suite, '', ['skipped']);
behat_report('default profile, filter ~@skipped', $default);
phpunit_report($default);

behat_report('BEHAT_PROFILE=a11y, filter @a11y&&~@skipped',
  execute($suite, 'a11y', ['skipped']));

$exit = tally($default)['failed'] > 0 ? 1 : 0;
$allow_failure = true; // .gitlab-ci-inputs.yml -> .job-behat
printf("GATE  behat --strict exit=%d  allow_failure=%s  pipeline=%s\\n",
  $exit, $allow_failure ? 'true' : 'false',
  ($exit === 0 || $allow_failure) ? 'green' : 'red');`,
    output: `GovCMS test harness: one dataset, two reporters, one gate
=========================================================

[behat] default profile, filter ~@skipped
  home.feature     Anonymous user sees the homepage   PASSED
  a11y.feature     Content images carry alt text      FAILED
    failed   every "img" has an "alt" attribute
    skipped  I should see the heading "Flood alert"
  a11y.feature     Skip link is first in tab order    PASSED
  3 scenarios (2 passed, 1 failed)
  7 steps (5 passed, 1 failed, 1 skipped)

[phpunit] same data, --testsuite govcms
  .F.
  1) a11y.feature::Content images carry alt text
     assertion 2 failed: every "img" has an "alt" attribute
  Tests: 3, Assertions: 6, Failures: 1

[behat] BEHAT_PROFILE=a11y, filter @a11y&&~@skipped
  a11y.feature     Content images carry alt text      FAILED
    failed   every "img" has an "alt" attribute
    skipped  I should see the heading "Flood alert"
  a11y.feature     Skip link is first in tab order    PASSED
  2 scenarios (1 passed, 1 failed)
  5 steps (3 passed, 1 failed, 1 skipped)

GATE  behat --strict exit=1  allow_failure=true  pipeline=green
`,
  },
  keyPoints: [
    "The scaffold ships a full harness — `tests/behat/`, `tests/phpunit/`, `tests/phpcs.xml`, a `test` container and a `chrome` container — but both containers are `lagoon.type: none` and `.lagoon.yml` has no test task, so nothing in it ever runs on the platform.",
    "On SaaS the build payload is `themes/`, `config` and `favicon.ico`; `tests/` never enters the image. Tests are a laptop-and-CI artefact by construction, not by policy.",
    "`govcms-behat` runs `tests/vendor/bin/behat --config /app/tests/behat/behat.yml --strict --colors \"$BEHAT_PROFILE\"` — the config path and `--strict` are hard-coded, and the profile comes from an environment variable.",
    "`tests/behat/behat.yml` filters `~@skipped` by default and ships two profiles, `p0` and `p1`. The shipped tags are `@skipped`, `@javascript`, `@smoke` and `@api` — there is no accessibility tag, axe or pa11y integration; the Level AA target and the coverage are the agency's.",
    "`phpunit.xml` defines six testsuites; the two you own on SaaS are `theme` (`/app/web/themes`) and `govcms` (`/app/tests/phpunit/tests`), because `govcms-vet` fails `[vet-007]` on any custom module in the repo.",
    "The `when: manual` / `allow_failure: true` defaults for `.job-behat`, `.job-unit` and `.job-functional` are defined in the scaffold's `.gitlab-ci-inputs.yml`; the vendored `.gitlab-ci-main.yml` jobs only `extends:` those anchors, and `vet` is the one job with `allow_failure: false`. Only a PaaS project keeps that inputs file — `scaffold-init.sh` deletes it for `saas` and `saasplus` — so a SaaS agency has no repo-side knob for the shipped job triggers.",
  ],
  interview: [
    {
      q: "On a GovCMS SaaS project, where do your tests actually run, and what happens to them at deploy time?",
      a: "They run on the developer's machine through `ahoy test-behat` / `ahoy test-phpunit`, and in GitLab CI. They never run on the platform. The `test` and `chrome` services in `docker-compose.yml` are both labelled `lagoon.type: none`, so Lagoon does not build them, and there is no test task in either the pre-rollout or post-rollout list in `.lagoon.yml`. On SaaS it goes further than that: `.docker/Dockerfile.saas` copies exactly three paths into the image — `themes/`, `config` and `favicon.ico` — so the `tests/` directory is not even present in the running container. The practical consequence I'd flag to a client is that CI is the last place a test can catch anything; after that the only gate left is Shipshape, and Shipshape checks compliance, not behaviour.",
    },
    {
      q: "You cannot ship a custom module on SaaS. So what is worth unit-testing, and what has to be a Behat test?",
      a: "PHPUnit still earns its keep over the code you can ship, which is theme PHP — preprocess logic and autoloaded classes under `themes/mytheme/src`. `phpunit.xml` has a `theme` testsuite pointed at `/app/web/themes` and a `govcms` testsuite pointed at `/app/tests/phpunit/tests`; those are the two I actually use on SaaS. Everything else I changed was configuration, and configuration has no unit-testable surface, so Behat over the rendered site is the only net that sees a broken view, a lost field on a form display, or a permission that silently moved. On PaaS I'd write the normal kernel and functional coverage over custom modules as well. One caveat I'd raise: `ahoy test-phpunit` calls `govcms-phpunit`, and that script still echoes `@todo get this working` before it invokes phpunit — I run phpunit through the test container with an explicit `--testsuite` rather than relying on the wrapper.",
    },
    {
      q: "How would you build an accessibility regression net on GovCMS, and what would you not claim it does?",
      a: "I'd tag the scenarios — say `@a11y` — add a Behat profile filtering `@a11y&&~@skipped` alongside the shipped `p0` and `p1`, and run it with `BEHAT_PROFILE=a11y`. `MinkContext` and `MarkupContext` give me the structural assertions that genuinely regress under a theme change: alt attributes, heading order, form labels, a skip link that still targets the content region. What I would not claim is that GovCMS gives me any of this: the platform ships no accessibility tag and no axe or pa11y integration, and the guidance is explicit that conformance of the theme and content is the agency's, at Level AA. I'd also be precise about where that profile has to go, because it differs by hosting type. On PaaS `tests/behat/behat.yml` is in the repo and the provisioner mounts the whole repo at `/app`, so I edit it and re-run. On SaaS `scripts/scaffold-init.sh` deletes that file at init and the shipped `p0` and `p1` profiles come from `/app/tests` inside the `govcms/test` image, so I commit my own `tests/behat/behat.yml` and rebuild — `COPY tests /app/tests/` is what overlays it, and only `features/`, `screenshots/` and `phpunit/tests` are bind-mounted.",
    },
    {
      q: "A GovCMS pipeline is green but the Behat suite is failing. How is that possible, and what would you change?",
      a: "Because the shipped defaults do not block. Those defaults live in the scaffold's `.gitlab-ci-inputs.yml`, which sets `.job-behat`, `.job-unit` and `.job-functional` to `when: manual` with `allow_failure: true`; the vendored `.gitlab-ci-main.yml` jobs just `extends:` those anchors. So the behat job is not even triggered on a normal push, and if you run it manually and it goes red the pipeline stays green. The only job that is `allow_failure: false` is `vet`, which is the platform compliance check, not a test. What I'd change depends on the hosting type. On PaaS I flip it at source: `.gitlab-ci.paas.yml` becomes `.gitlab-ci.yml` at init and includes `.gitlab-ci-inputs.yml`, so I set `.job-behat` to `when: on_success` with `allow_failure: false` there. On SaaS I'd be straight about it — `scripts/scaffold-init.sh` removes both `.gitlab-ci-inputs.yml` and `.gitlab-ci.paas.yml`, and `.gitlab-ci.yml` is on the locked-file list, so there is no repo-side knob for the shipped triggers and a red suite has to be enforced by review process or a pipeline the agency runs itself. Either way I'd stage the change: run the suite non-blocking for a sprint first, because `--strict` means an undefined step definition fails the run, and a suite inherited from another agency usually has a few.",
    },
  ],
  quiz: [
    {
      question:
        "Why does a Behat suite committed to a GovCMS SaaS project never execute on the platform?",
      options: [
        "Shipshape blocks any deploy from a repo that contains a `tests/` directory.",
        "The `test` and `chrome` services are `lagoon.type: none`, there is no test task in `.lagoon.yml`, and the SaaS image copies only `themes/`, `config` and `favicon.ico`.",
        "Behat is stripped from the image because `phpstan.neon` bans its function calls.",
        "The post-rollout task list runs the suite but discards a non-zero exit code.",
      ],
      answerIndex: 1,
      explain:
        "Three independent facts stack up: both test containers are labelled `lagoon.type: none` so Lagoon never builds them, `.lagoon.yml` declares no test task in either phase, and `.docker/Dockerfile.saas` copies exactly three paths, none of which is `tests/`. Shipshape has no such check, and the banned-function list in `phpstan.neon` is scanned only over custom theme code.",
    },
    {
      question:
        "How does `govcms-behat` decide which scenarios to run?",
      options: [
        "It takes its profile from the `BEHAT_PROFILE` environment variable, against `tests/behat/behat.yml`, which filters `~@skipped` by default and ships `p0` and `p1` profiles.",
        "It reads a `tags:` key from `.gitlab-ci-inputs.yml` at run time.",
        "It always runs every feature, because `--strict` disables tag filtering.",
        "It uses the root `behat.yml`, whose default profile filters `~@drush&&~@skipped`.",
      ],
      answerIndex: 0,
      explain:
        "The script runs `tests/vendor/bin/behat --config /app/tests/behat/behat.yml --strict --colors \"$BEHAT_PROFILE\"`. The config path is hard-coded to the file under `tests/behat/`, and the only selection input the wrapper exposes is `BEHAT_PROFILE`. `--strict` promotes undefined and pending steps to failures; it has nothing to do with tags.",
    },
    {
      question:
        "On SaaS, which PHPUnit testsuite covers an autoloaded class you wrote at `themes/agency/src/AlertFormatter.php`?",
      options: [
        "`unit`, which resolves to core's `UnitTestSuite.php`.",
        "`functional`, because theme code can only be exercised through a rendered page.",
        "`theme`, which `phpunit.xml` maps to the directory `/app/web/themes`.",
        "None — theme classes are excluded from the coverage whitelist, so they cannot be tested.",
      ],
      answerIndex: 2,
      explain:
        "`phpunit.xml` declares six testsuites. Four point at core's TestSuite files; `govcms` points at `/app/tests/phpunit/tests`; `theme` points at the directory `/app/web/themes`, which is where `themes/agency` lands once the image is built. The coverage whitelist is a reporting filter and does not decide what can be tested.",
    },
    {
      question:
        "Which statement about accessibility testing on GovCMS is accurate?",
      options: [
        "The scaffold ships an `@a11y` tag and an axe-core integration in `FeatureContext`.",
        "Shipshape fails a deploy at `high` severity when a WCAG check regresses.",
        "The platform runs a nightly pa11y crawl and files the results to the service desk.",
        "GovCMS ships no accessibility tag or scanner; you add your own tag and Behat profile, and conformance at Level AA remains the agency's responsibility.",
      ],
      answerIndex: 3,
      explain:
        "The tags present in the scaffold are `@skipped`, `@javascript`, `@smoke` and `@api`, plus the `p0` and `p1` profile filters — there is no accessibility tag, no axe and no pa11y anywhere in it. Shipshape's checks are platform-compliance checks, not accessibility ones. The published guidance is explicit that individual agencies must ensure their site continues to meet accessibility standards, with Level AA the constant.",
    },
  ],
};

export default lesson;
