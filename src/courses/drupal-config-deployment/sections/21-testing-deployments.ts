import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "testing-deployments",
  title: "Testing the Deployment Itself",
  part: "Safety & Operations",
  estMinutes: 13,
  summary:
    "Your CI proves the code works on a fresh install; production is not a fresh install — so rehearse the whole deploy sequence against a sanitised copy of the production database, gate it on a clean config:status, and finish with smoke checks that actually hit HTTP.",

  concept: `
Every pipeline you have already built tests the *application*. Almost none of them
test the *deployment*. Those are different artefacts with different failure modes,
and the second one only runs in anger once per release.

## Why a fresh install proves nothing

A \`site:install --existing-config\` job in CI is genuinely useful — it proves the
exported config is self-consistent and installable. But it starts from an empty
database, so it can never exercise the two things that actually break releases:

- **\`updatedb\` against real data.** A \`hook_update_N\` that loops 40 nodes on a
  fresh install loops 400,000 in production, hits a legacy row with a NULL where
  your code assumed a string, and dies halfway — leaving the schema version
  bumped for the updates that already ran and not for the one that failed.
- **\`config:import\` against config that has drifted.** Production has a decade of
  editors clicking things. An import that is a clean no-op on a fresh site can be
  a 60-item changelist against the real active config, including deletions
  nobody intended.

Fresh-install CI is a *lint*. The rehearsal is the *test*.

## The rehearsal

The single highest-value practice in this whole course is one job:

1. Restore a recent, **sanitised** production database snapshot.
2. Check out the release commit and \`composer install\` it.
3. Run the real deploy sequence — the same script prod runs, not an approximation.
4. Assert every step exited 0.
5. Assert \`drush config:status\` reports no differences afterwards.
6. Run smoke checks over HTTP.

Step 5 is the one people forget. \`config:status\` is a *report*, not an
assertion — it exits 0 whether the site is clean or wildly drifted, so you have
to test its output yourself. A non-empty result after a successful import means
something wrote to active config *during or after* the import: usually a
\`hook_deploy_NAME()\` re-saving a config entity and writing back defaults, or a
module's install/enable path firing because \`core.extension\` switched it on
mid-import. A \`hook_post_update_NAME()\` is almost never the answer even though
it is the first thing people reach for — post-updates run inside \`updatedb\`,
*before* the import, so the import just picks the object up in its changelist
and overwrites it. It can only leave drift behind when that object is excluded
from the import by config_ignore or a config split.

Sanitisation is not optional and not a nicety — \`drush sql:sanitize\` scrambles
emails and passwords, and you extend it with your own listener for anything else
your site stores. A rehearsal environment holding real personal data is a breach
waiting for someone to point a crawler at it.

## Smoke checks are not functional tests

Keep them small enough that nobody is tempted to skip them: front page 200,
login form 200, an authenticated POST to \`/user/login\` redirecting, one key view
rendering non-empty, and the cache headers you expect —
\`X-Drupal-Cache: HIT\` from the internal page cache for anonymous traffic, and
\`X-Drupal-Dynamic-Cache\` for authenticated. Cache headers are the cheapest
possible detector of "someone shipped a change that made every page uncacheable".

## Two numbers worth tracking

**Deploy duration** and **deploy failure rate**. A deploy creeping from 40s to
six minutes is usually an update hook that should have been a queue. A failure
rate above a few percent means your rehearsal is not representative — the
snapshot is stale, or someone is deploying past it.
`,

  comparisons: [
    {
      label: "Rehearsing schema changes against real data",
      intro:
        "Both ecosystems agree on the principle: never let a migration meet production data for the first time in production. The mechanics differ because Drupal's deploy moves config as well as schema.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: rehearse doctrine migrations on a copy of prod
pg_restore -d app_rehearsal prod-2026-08-10.dump

# Anonymise before anyone can reach it
php bin/console app:anonymise-users --env=rehearsal

git checkout release/2026-08-11
composer install --no-dev --no-progress

# The real thing, against real row counts
php bin/console doctrine:migrations:migrate --no-interaction
php bin/console doctrine:schema:validate   # mapping still matches DB?
php bin/console cache:clear --env=prod`,
      ts: `# Drupal: rehearse the whole deploy on a copy of prod
drush @rehearsal sql:drop --yes
# --gzip appends .gz itself, so this writes /tmp/prod.sql.gz
drush @prod sql:dump --gzip --result-file=/tmp/prod.sql
gunzip -c /tmp/prod.sql.gz | drush @rehearsal sql:cli

# Scramble emails/passwords before the site is reachable
drush @rehearsal sql:sanitize --yes

git checkout release/2026-08-11
composer install --no-dev --no-progress

# updatedb -> config:import -> cache:rebuild -> deploy:hook
drush @rehearsal deploy --yes

# The assertion Symfony has no equivalent of
drush @rehearsal config:status --format=list`,
      note: "drush sql:sync does the dump-and-restore in one command where both aliases are reachable; the two-step version above is what you fall back to when prod is behind a bastion. Note that drush deploy runs hook_post_update_NAME() BEFORE config:import and hook_deploy_NAME() after — put anything that depends on freshly imported config in a deploy hook.",
    },
    {
      label: "The rehearsal as a CI job",
      intro:
        "Same pipeline shape in both stacks: restore a snapshot, run the release's own deploy script, then assert. The Drupal version adds a config-cleanliness gate because config is part of the deployable artefact.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .github/workflows/rehearse.yml (Symfony)
jobs:
  rehearse:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16 }
    steps:
      - uses: actions/checkout@v4
      - run: composer install --no-progress
      - name: Restore sanitised snapshot
        run: |
          aws s3 cp s3://snapshots/prod-sanitised.dump .
          pg_restore -d app prod-sanitised.dump
      - name: Migrate
        run: php bin/console doctrine:migrations:migrate -n
      - name: Schema still in sync?
        run: php bin/console doctrine:schema:validate
      - name: Smoke
        run: ./bin/smoke.sh http://localhost:8000`,
      ts: `# .gitlab-ci.yml (Drupal)
rehearse:
  stage: verify
  services: [mariadb:10.11]
  script:
    - composer install --no-progress
    - aws s3 cp s3://snapshots/prod-sanitised.sql.gz .
    - gunzip -c prod-sanitised.sql.gz | drush sql:cli
    # set -e: any non-zero step fails the job
    - set -e
    - drush deploy --yes
    # config:status EXITS 0 even when drifted - assert on its output
    - |
      DRIFT="$(drush config:status --format=list)"
      if [ -n "$DRIFT" ]; then
        echo "Config drift after import:"; echo "$DRIFT"; exit 1
      fi
    - ./scripts/smoke.sh "$CI_ENVIRONMENT_URL"
  artifacts:
    when: always
    paths: [sites/simpletest/browser_output/]`,
      note: "The snapshot must be refreshed on a schedule (nightly is typical). A rehearsal against a six-month-old dump slowly stops representing production and quietly loses all its value.",
    },
    {
      label: "Post-deploy smoke checks",
      intro:
        "A handful of HTTP assertions that run in seconds after every deploy. The point is not coverage — it is catching a white screen or a cache regression before your users do.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
# Symfony smoke.sh
set -euo pipefail
BASE="\${1:?base url}"

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

[ "$(code "$BASE/")" = "200" ]            || exit 1
[ "$(code "$BASE/login")" = "200" ]       || exit 1
[ "$(code "$BASE/api/health")" = "200" ]  || exit 1

# Prod must never leak the profiler
curl -sI "$BASE/" | grep -qi '^x-debug-token' && exit 1

echo "smoke ok"`,
      ts: `#!/usr/bin/env bash
# Drupal scripts/smoke.sh
set -euo pipefail
BASE="\${1:?base url}"

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

[ "$(code "$BASE/")" = "200" ]           || exit 1
[ "$(code "$BASE/user/login")" = "200" ] || exit 1

# A key view renders and is not empty
curl -s "$BASE/press-releases" | grep -q 'views-row' || exit 1

# Anonymous front page must be served from the internal page cache
curl -sI "$BASE/" | grep -qi 'x-drupal-cache: HIT'

# One-time login proves the session/auth path survived the deploy
drush user:login --uri="$BASE" >/dev/null

echo "smoke ok"`,
      note: "Warm the page cache with one throwaway request before asserting HIT, or the first check races the deploy's own cache:rebuild. X-Drupal-Cache comes from the page_cache module (anonymous only); X-Drupal-Dynamic-Cache comes from dynamic_page_cache and appears for authenticated responses too.",
    },
    {
      label: "Testing an update hook itself",
      intro:
        "If you ship update hooks in a contributed or shared custom module, Drupal core gives you a test base that boots an OLD database fixture, runs the update path, and lets you assert on the result.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: there is no first-class "migration test" base.
// You hand-roll it: load a fixture representing the old schema,
// run the migration, assert on the new state.
namespace App\\Tests\\Migrations;

use Symfony\\Bundle\\FrameworkBundle\\Console\\Application;
use Symfony\\Bundle\\FrameworkBundle\\Test\\KernelTestCase;
use Symfony\\Component\\Console\\Tester\\CommandTester;

final class Version20260810120000Test extends KernelTestCase {

  public function testPromoCodesAreBackfilled(): void {
    $kernel = self::bootKernel();
    $conn = static::getContainer()
      ->get('doctrine')->getConnection();
    $conn->executeStatement(
      "INSERT INTO promo (id, code) VALUES (1, NULL)"
    );

    // Drive the real command: Migrator::migrate() is @internal
    // and wants a plan + config you would have to build yourself.
    $app = new Application($kernel);
    $tester = new CommandTester(
      $app->find('doctrine:migrations:migrate')
    );
    self::assertSame(
      0,
      $tester->execute([], ['interactive' => false])
    );

    self::assertSame('LEGACY-1', $conn->fetchOne(
      'SELECT code FROM promo WHERE id = 1'
    ));
  }
}`,
      ts: `<?php
// Drupal: core ships UpdatePathTestBase.
namespace Drupal\\Tests\\acme_core\\Functional\\Update;

use Drupal\\FunctionalTests\\Update\\UpdatePathTestBase;

/**
 * @group acme_core
 */
class AcmeCoreUpdateTest extends UpdatePathTestBase {

  /**
   * {@inheritdoc}
   */
  protected function setDatabaseDumpFiles(): void {
    // Core's own "filled" fixture, plus your module's old state.
    $this->databaseDumpFiles = [
      $this->root . '/core/modules/system/tests/fixtures/update/'
        . 'drupal-11.3.0.filled.standard.php.gz',
      __DIR__ . '/../../../fixtures/update/acme-core-9002.php',
    ];
  }

  public function testPromoBackfill(): void {
    // Boots the old DB, then runs update.php's whole update path.
    $this->runUpdates();

    $config = $this->config('acme_core.settings');
    $this->assertSame('LEGACY', $config->get('promo_prefix'));
    $this->assertSession()->statusCodeEquals(200);
  }
}`,
      note: "setDatabaseDumpFiles() is abstract, so you must implement it. The core fixture name is version-specific — 11.x ships drupal-11.3.0.filled.standard.php.gz and drupal-10.3.0.filled.standard.php.gz; check what your core version actually has rather than copying a name from a blog post.",
    },
  ],

  playground: {
    intro:
      "A rehearsal harness in miniature. It works out which update hooks are pending on a restored production snapshot, replays the drush deploy sequence recording exit codes and wall time, then applies the two gates a fresh-install CI job can never apply: is config still clean, and does the site still answer over HTTP?",
    lang: "php",
    code: `<?php
// A deploy rehearsal, run against a RESTORED PRODUCTION SNAPSHOT — not a fresh install.

// What the prod copy already has (key_value: system.schema + post_update).
$snapshot = [
  'schema' => ['node' => 10300, 'commerce_price' => 8005, 'acme_core' => 9002],
  'post_update_done' => ['acme_core_post_update_rebuild_permissions'],
];

// What the release branch actually ships.
$codebase = [
  'update_n' => [
    'node' => [10300, 10301],
    'commerce_price' => [8005, 8006, 8007],
    'acme_core' => [9002, 9003],
  ],
  'post_update' => [
    'acme_core_post_update_rebuild_permissions',
    'acme_core_post_update_resave_promos',
  ],
];

$pending = [];
foreach ($codebase['update_n'] as $module => $numbers) {
  $installed = $snapshot['schema'][$module] ?? 0;
  foreach ($numbers as $n) {
    if ($n > $installed) {
      $pending[] = $module . '_update_' . $n;
    }
  }
}
$pendingPost = array_values(
  array_diff($codebase['post_update'], $snapshot['post_update_done'])
);

echo "== pending updates on the prod copy ==\\n";
foreach (array_merge($pending, $pendingPost) as $hook) {
  echo "  run  " . $hook . "\\n";
}
echo "  total: " . (count($pending) + count($pendingPost)) . "\\n";

// Replay drush deploy step by step, recording exit code and wall time.
$steps = [
  ['drush updatedb',      0, 41.2],
  ['drush config:import', 0, 12.8],
  ['drush cache:rebuild', 0,  6.4],
  ['drush deploy:hook',   0,  3.1],
];
$elapsed = 0.0;
$aborted = FALSE;
echo "\\n== deploy sequence ==\\n";
foreach ($steps as [$cmd, $exit, $secs]) {
  if ($aborted) {
    printf("  %-20s SKIPPED\\n", $cmd);
    continue;
  }
  $elapsed += $secs;
  printf("  %-20s exit=%d  %5.1fs\\n", $cmd, $exit, $secs);
  if ($exit !== 0) {
    $aborted = TRUE;
  }
}

// The gate a fresh-install CI job can never fire: is the site STILL clean?
$status = ['views.view.press_releases' => 'Different'];
echo "\\n== gate: drush config:status ==\\n";
if ($status === []) {
  echo "  no differences\\n";
}
foreach ($status as $name => $state) {
  printf("  %-32s %s\\n", $name, $state);
}

// Post-deploy smoke checks against the rehearsal URL.
$smoke = [
  ['GET / -> 200',                        TRUE],
  ['GET /user/login -> 200',              TRUE],
  ['POST /user/login -> 303',             TRUE],
  ['GET / -> X-Drupal-Dynamic-Cache: HIT', FALSE],
];
echo "\\n== smoke checks ==\\n";
$failures = 0;
foreach ($smoke as [$label, $ok]) {
  printf("  [%s] %s\\n", $ok ? 'ok  ' : 'FAIL', $label);
  if (!$ok) {
    $failures++;
  }
}

$exitCode = ($aborted || $status !== [] || $failures > 0) ? 1 : 0;
echo "\\n== rehearsal verdict ==\\n";
printf("  duration : %.1fs\\n", $elapsed);
printf("  drift    : %d item(s)\\n", count($status));
printf("  smoke    : %d failure(s)\\n", $failures);
printf("  exit     : %d\\n", $exitCode);
`,
    output: `== pending updates on the prod copy ==
  run  node_update_10301
  run  commerce_price_update_8006
  run  commerce_price_update_8007
  run  acme_core_update_9003
  run  acme_core_post_update_resave_promos
  total: 5

== deploy sequence ==
  drush updatedb       exit=0   41.2s
  drush config:import  exit=0   12.8s
  drush cache:rebuild  exit=0    6.4s
  drush deploy:hook    exit=0    3.1s

== gate: drush config:status ==
  views.view.press_releases        Different

== smoke checks ==
  [ok  ] GET / -> 200
  [ok  ] GET /user/login -> 200
  [ok  ] POST /user/login -> 303
  [FAIL] GET / -> X-Drupal-Dynamic-Cache: HIT

== rehearsal verdict ==
  duration : 63.5s
  drift    : 1 item(s)
  smoke    : 1 failure(s)
  exit     : 1
`,
  },

  keyPoints: [
    "A fresh-install CI job proves your exported config is installable; only a rehearsal against a restored production snapshot proves updatedb and config:import survive real data and real drift.",
    "Always sanitise the snapshot (drush sql:sanitize, extended with your own listener) before anything can reach it — a rehearsal environment full of real personal data is a breach waiting to happen.",
    "drush config:status is a report, not an assertion: it exits 0 whether or not the site has drifted, so capture its output and fail the job yourself when it is non-empty.",
    "Non-empty config:status after a successful import means something wrote to active config during or after it — typically a hook_deploy_NAME(), or a module install/enable path fired by a core.extension change mid-import; a hook_post_update_NAME() runs before the import, so the import overwrites its writes unless the object is excluded by config_ignore or a split.",
    "Smoke checks should be seconds long and HTTP-level: front page 200, login form 200, one key view rendering, and the expected X-Drupal-Cache / X-Drupal-Dynamic-Cache headers.",
    "Module authors shipping update hooks should test them with Drupal\\FunctionalTests\\Update\\UpdatePathTestBase, implementing setDatabaseDumpFiles() and asserting after runUpdates().",
  ],

  interview: [
    {
      q: "Your CI runs a fresh install from exported config and all tests pass, yet the last three production deploys still broke. What would you add?",
      a: "A rehearsal job against a sanitised copy of the production database, because a fresh install exercises none of the things that actually break a release. `updatedb` on an empty site never meets the legacy rows that make a `hook_update_N` fail halfway, and `config:import` against an empty active store never produces the surprise changelist that real editor drift produces. I would restore a recent sanitised snapshot, check out the release commit, and run the *same* deploy script production runs — usually `drush deploy`, which is `updatedb`, `config:import`, `cache:rebuild`, `deploy:hook` — asserting every step exits 0. Then I would gate on `drush config:status` being empty afterwards and finish with a handful of HTTP smoke checks. This is exactly the practice a Symfony team already has when they replay `doctrine:migrations:migrate` against a prod dump; Drupal just needs the config-cleanliness assertion bolted on as well.",
    },
    {
      q: "Your rehearsal job runs drush deploy, every command exits 0, but drush config:status still reports two items as 'Different'. What is going on?",
      a: "Something wrote to active config *during or after* the import. The usual culprit is a `hook_deploy_NAME()` that loads a config entity and calls `->save()`, which re-serialises it including any defaults or computed keys that were not in the exported YAML — deploy hooks run after `config:import`, so nothing comes along afterwards to correct them. Another common cause is a module's install/enable path re-saving its own settings when it is newly enabled by `core.extension` during the import. What it is usually *not* is a `hook_post_update_NAME()`, even though that is everyone's first guess: post-updates run inside `updatedb`, before the import, so the import simply picks that object up in its changelist and overwrites it from the sync directory — a post-update can only leave drift behind if the object is excluded from the import by config_ignore or a config split. I would run `drush config:status` and then diff the specific objects to see which keys moved, and either make the hook idempotent — write only the key it is meant to change — or export the resulting shape so the YAML and the active config agree. The important thing is that the job fails on this: `config:status` exits 0 regardless, so if you do not test its output the drift ships silently and the next developer's `drush cex` picks it up as mystery noise.",
    },
    {
      q: "How would you test a hook_update_N you are shipping in a custom module?",
      a: "With `Drupal\\FunctionalTests\\Update\\UpdatePathTestBase`, which is core's functional test base for the update path. You implement the abstract `setDatabaseDumpFiles()` to point at a core database fixture — 11.x ships things like `drupal-11.3.0.filled.standard.php.gz` under `core/modules/system/tests/fixtures/update/` — plus a small PHP fixture that puts your module at its *old* schema version. The test then calls `runUpdates()`, which drives the real update path the way `update.php` would, and after that you assert on whatever the hook was supposed to change: config values, entity data, a schema column. It is slow because it is a functional test, so I would keep one per meaningful update rather than one per hook number. For a site-specific module I would often skip this and rely on the prod-copy rehearsal instead; `UpdatePathTestBase` earns its keep when the module ships to sites whose data you cannot see.",
    },
    {
      q: "Which deployment metrics would you track for a four-person team, and what would each one tell you?",
      a: "Deploy duration and deploy failure rate, both trended over time rather than looked at per-release. Rising duration is almost always an update hook doing per-entity work that should have been queued — a loop over 400,000 nodes that was fine at 400 — and it matters because a long deploy means a long maintenance window and a longer window in which a rollback is painful. Failure rate is a proxy for how representative the rehearsal is: if the rehearsal passes and production fails more than a few percent of the time, the snapshot is stale or someone is bypassing the pipeline. I would also track time-to-first-successful-deploy after a failure, since a team that can roll forward in ten minutes behaves very differently from one that needs an hour. These are the same DORA-flavoured numbers a Symfony team would watch; nothing about Drupal changes what makes a deployment healthy.",
    },
  ],

  quiz: [
    {
      question:
        "Your CI pipeline pipes `drush config:status` into a job step and the step passes, but production is visibly drifted. Why?",
      options: [
        "config:status only works when run with --uri",
        "config:status is a report and exits 0 whether or not differences exist — you must assert on its output",
        "config:status must be run before cache:rebuild or it reports nothing",
        "config:status only compares files, never the database",
      ],
      answerIndex: 1,
      explain:
        "config:status prints a table (or list/json with --format) of differing config objects but does not signal drift through its exit code. The CI idiom is to capture the output — e.g. `DRIFT=\"$(drush config:status --format=list)\"` — and `exit 1` when it is non-empty.",
    },
    {
      question:
        "Why is rehearsing on a restored production database more valuable than a `drush site:install --existing-config` job?",
      options: [
        "It runs faster, so it can be run on every commit",
        "It is the only way to validate that exported YAML is syntactically correct",
        "A fresh install has no legacy data and no drift, so it cannot exercise how updatedb and config:import behave against the real active configuration",
        "site:install --existing-config does not run update hooks or import config at all",
      ],
      answerIndex: 2,
      explain:
        "A fresh install is a useful lint — it proves the config set is self-consistent and installable — but it starts from an empty database. Update hooks that choke on legacy rows and imports that produce a surprise changelist against drifted active config only show up against a real snapshot.",
    },
    {
      question:
        "In the sequence `drush deploy` runs, where does `hook_post_update_NAME()` execute relative to `config:import`?",
      options: [
        "After config:import, alongside hook_deploy_NAME()",
        "Before config:import, as part of updatedb — hook_deploy_NAME() is the one that runs after",
        "It never runs during drush deploy; only hook_update_N does",
        "It runs last, after cache:rebuild",
      ],
      answerIndex: 1,
      explain:
        "drush deploy runs updatedb (which executes hook_update_N then hook_post_update_NAME), then config:import, then cache:rebuild, then deploy:hook (hook_deploy_NAME). So anything that depends on freshly imported configuration belongs in a deploy hook, not a post-update hook.",
    },
    {
      question:
        "Which is the correct base class for testing a module's update path in Drupal 10/11?",
      options: [
        "Drupal\\KernelTests\\Core\\Update\\UpdateKernelTestBase",
        "Drupal\\Tests\\system\\Functional\\UpdateTestBase",
        "Drupal\\FunctionalTests\\Update\\UpdatePathTestBase",
        "Drupal\\Tests\\BrowserTestBase with $runUpdates = TRUE",
      ],
      answerIndex: 2,
      explain:
        "UpdatePathTestBase lives in Drupal\\FunctionalTests\\Update. You implement its abstract setDatabaseDumpFiles() to load an old-state database fixture, call runUpdates() to drive the real update path, and then assert on the resulting config or data.",
    },
  ],
};

export default lesson;
