import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "drupal-in-ci",
  title: "Building the Pipeline: Drupal in CI",
  part: "Deployment Mechanics",
  estMinutes: 13,
  summary:
    "A Drupal CI pipeline has the same shape as a Symfony one — validate, install, lint, analyse, test — but it adds a config-validation stage and needs SIMPLETEST_* env vars plus a real web server before a single functional test will run.",

  concept: `
Your Symfony pipeline is muscle memory: \`composer validate\`, \`composer install\`,
PHP-CS-Fixer, PHPStan, \`bin/console lint:container\`, PHPUnit against a service
container and a throwaway database. A Drupal pipeline is the same five stages in
the same order. Two things are genuinely different, and both bite people who
assume it is "just PHP CI".

## Stage order, and why it is that order

Order stages by **cost per unit of signal**. Cheap and decisive first:

1. \`composer validate --strict\` — catches a hand-edited \`composer.json\` and a
   \`composer.lock\` that no longer matches it. Two seconds.
2. \`composer install --no-progress\` — never \`composer update\` in CI. The lock
   file is part of the artefact you are testing.
3. \`phpcs --standard=Drupal,DrupalPractice\` — Drupal's own sniffs, shipped by
   \`drupal/coder\` (pulled in by \`drupal/core-dev\`). It knows about \`.module\`,
   \`.install\` and \`.theme\` files, so pass \`--extensions\`.
4. PHPStan with \`mglaman/phpstan-drupal\` — plain PHPStan cannot resolve
   \`\\Drupal::service()\`, entity storage handlers or hook signatures. The
   extension teaches it Drupal's dynamic edges.
5. PHPUnit: unit, then kernel, then functional. Fast to slow.
6. **Config validation** — the stage Symfony has no equivalent of.

## The Drupal-only parts

**Test bootstrap.** Kernel and functional tests boot a real Drupal, so PHPUnit
reads environment variables, not a \`.env.test\`:

- \`SIMPLETEST_DB\` — a database URL, e.g. \`mysql://root:root@127.0.0.1/drupal\`.
  Kernel tests need it; unit tests do not.
- \`SIMPLETEST_BASE_URL\` — functional tests drive the site over **HTTP**, so this
  must point at a web server that is actually serving your docroot. This is the
  single most common CI failure: everything green locally, functional tests
  exploding in CI because nothing is listening on port 8080.
- \`BROWSERTEST_OUTPUT_DIRECTORY\` — where browser tests dump HTML on failure.
  Upload it as a build artefact; it turns "assertion failed" into a page you can
  open.

Core also expects a writable \`sites/simpletest\` directory. Functional-JavaScript
tests additionally need chromedriver listening on port 4444.

**Config validation.** Unit tests never notice that \`core.extension\` enables a
module \`composer.lock\` does not install, or that a view depends on a module
nobody enabled. Install a fresh site from your committed config, then assert the
site is *still* clean afterwards:

\`\`\`bash
drush --yes site:install --existing-config
drush --yes deploy
test -z "\$(drush config:status --format=list)"
\`\`\`

If \`config:status\` prints anything after an import, your export is not
idempotent — something in \`config/sync\` is being rewritten on install, and that
delta will show up as noise in the next developer's \`drush cex\`.

## Keeping it under ten minutes

Cache Composer's global cache directory keyed on \`composer.lock\`, not the
\`vendor/\` directory — restoring \`vendor/\` skips the plugin and scaffold steps
Drupal relies on. Cache PHPStan's result cache too. Then accept that functional
tests are the budget: they are 50–60% of the run, and the only real lever is
sharding them across parallel jobs. Matrix cells (PHP 8.3 vs 8.4, Drupal 10 vs
11) run in parallel, so they cost you money, not minutes.
`,

  comparisons: [
    {
      label: "The whole pipeline, side by side",
      intro:
        "Two GitHub Actions workflows for the same team. Read them top to bottom: the stage list is nearly identical, and every difference is either a test bootstrap variable or the config stage.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-24.04
    services:
      database:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: app
        ports: ['5432:5432']
    env:
      APP_ENV: test
      DATABASE_URL: postgresql://postgres:app@127.0.0.1:5432/app
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          coverage: none

      - run: composer validate --strict
      - uses: actions/cache@v4
        with:
          path: ~/.cache/composer
          key: composer-\${{ hashFiles('composer.lock') }}
      - run: composer install --no-progress --no-interaction

      - run: vendor/bin/php-cs-fixer check --diff
      - run: vendor/bin/phpstan analyse

      # Symfony's "does the wiring hold together" stage
      - run: bin/console lint:container
      - run: bin/console lint:yaml config
      - run: bin/console doctrine:migrations:migrate --no-interaction
      - run: bin/console doctrine:schema:validate

      - run: vendor/bin/phpunit`,
      ts: `# Drupal: .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix:
        include:
          - { php: '8.3', core: 'lock' }   # what production runs
          - { php: '8.3', core: '^11' }    # forward compatibility
          - { php: '8.4', core: '^11' }
    services:
      mariadb:
        image: mariadb:10.11
        env:
          MARIADB_ROOT_PASSWORD: root
          MARIADB_DATABASE: drupal
        ports: ['3306:3306']
        options: >-
          --health-cmd="healthcheck.sh --connect"
          --health-interval=10s --health-retries=10
    env:
      SIMPLETEST_DB: mysql://root:root@127.0.0.1:3306/drupal
      SIMPLETEST_BASE_URL: http://127.0.0.1:8080
      BROWSERTEST_OUTPUT_DIRECTORY: /tmp/browser_output
      SYMFONY_DEPRECATIONS_HELPER: disabled
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: \${{ matrix.php }}
          extensions: gd, pdo_mysql, mbstring
          coverage: none

      - run: composer validate --strict --no-check-publish
      - uses: actions/cache@v4
        with:
          path: ~/.cache/composer
          key: composer-\${{ matrix.php }}-\${{ matrix.core }}-\${{ hashFiles('composer.lock') }}
          restore-keys: composer-\${{ matrix.php }}-\${{ matrix.core }}-
      - run: composer install --no-progress --no-interaction
      - name: Float core to the next major
        if: matrix.core != 'lock'
        run: |
          composer require --no-interaction --update-with-all-dependencies \\
            drupal/core-recommended:\${{ matrix.core }} \\
            drupal/core-composer-scaffold:\${{ matrix.core }}
          composer require --no-interaction --update-with-all-dependencies --dev \\
            drupal/core-dev:\${{ matrix.core }}

      - run: vendor/bin/phpcs
      - run: vendor/bin/phpstan analyse --no-progress

      - name: Serve the docroot for functional tests
        run: |
          mkdir -p web/sites/simpletest /tmp/browser_output
          php -S 127.0.0.1:8080 -t web web/.ht.router.php &
          until curl -sf http://127.0.0.1:8080 >/dev/null; do sleep 1; done

      - run: vendor/bin/phpunit -c web/core --testsuite unit,kernel
      - run: vendor/bin/phpunit -c web/core --testsuite functional
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: browser-output-\${{ matrix.php }}, path: /tmp/browser_output }`,
      note:
        "Only two blocks are Drupal-specific: the SIMPLETEST_* env vars plus the background web server, and (below) the config stage. Note the 'lock' matrix cell — the other cells deliberately ignore composer.lock, so treat them as early-warning jobs, not as gates on merging.",
    },
    {
      label: "Static analysis configuration",
      intro:
        "Both ecosystems run PHPStan, but Drupal needs an extension before PHPStan can see through its service container and hook system, and it uses PHP_CodeSniffer rather than PHP-CS-Fixer.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony — phpstan.dist.neon
includes:
  - vendor/phpstan/phpstan-symfony/extension.neon
  - vendor/phpstan/phpstan-doctrine/extension.neon

parameters:
  level: 8
  paths:
    - src
    - tests
  symfony:
    containerXmlPath: var/cache/dev/App_KernelDevDebugContainer.xml

# Style is PHP-CS-Fixer, configured in .php-cs-fixer.dist.php
# CI step:  vendor/bin/php-cs-fixer check --diff`,
      ts: `# Drupal — phpstan.neon
# composer require --dev phpstan/phpstan phpstan/extension-installer \\
#   mglaman/phpstan-drupal phpstan/phpstan-deprecation-rules
# extension-installer wires phpstan-drupal in; no "includes:" needed.

parameters:
  level: 2
  paths:
    - web/modules/custom
    - web/themes/custom
  excludePaths:
    - */tests/fixtures/*

# Style is PHP_CodeSniffer with Drupal's own sniffs, from drupal/coder.
# phpcs.xml:
#   <rule ref="Drupal"/>
#   <rule ref="DrupalPractice"/>
#   <file>web/modules/custom</file>
#   <arg name="extensions"
#        value="php,module,inc,install,test,profile,theme,yml"/>
# CI step:  vendor/bin/phpcs`,
      note:
        "Start phpstan-drupal at level 2 on an existing codebase and raise it one level per sprint — level 8 on a mature Drupal module produces thousands of errors from untyped hook signatures and render arrays, and a red pipeline nobody can fix gets ignored.",
    },
    {
      label: "Getting tests to boot at all",
      intro:
        "The single biggest source of 'works on my machine' in Drupal CI. Symfony reads a dotenv file; Drupal reads process environment variables and, for functional tests, insists on a live HTTP server.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: .env.test is committed, phpunit.xml.dist reads it.
# DATABASE_URL is enough - the kernel is booted in-process
# and requests go through the Symfony kernel, not over HTTP.

cat .env.test
# APP_ENV=test
# DATABASE_URL="postgresql://postgres:app@127.0.0.1:5432/app_test"
# KERNEL_CLASS='App\\Kernel'

bin/console --env=test doctrine:database:create
bin/console --env=test doctrine:migrations:migrate -n
vendor/bin/phpunit

# WebTestCase uses KernelBrowser: no web server involved.`,
      ts: `# Drupal: environment variables, set before phpunit runs.
# Defaults live in core/phpunit.xml.dist - copy it to phpunit.xml
# and fix the bootstrap path, or export the vars in CI.

export SIMPLETEST_DB="mysql://root:root@127.0.0.1:3306/drupal"
export SIMPLETEST_BASE_URL="http://127.0.0.1:8080"
export BROWSERTEST_OUTPUT_DIRECTORY="/tmp/browser_output"
export SYMFONY_DEPRECATIONS_HELPER=disabled

mkdir -p web/sites/simpletest            # core requires this, writable
php -S 127.0.0.1:8080 -t web web/.ht.router.php &

vendor/bin/phpunit -c web/core --testsuite unit         # needs nothing
vendor/bin/phpunit -c web/core --testsuite kernel       # needs SIMPLETEST_DB
vendor/bin/phpunit -c web/core --testsuite functional   # needs both + server

# functional-javascript additionally needs chromedriver:
# chromedriver --port=4444 &`,
      note:
        "The test suites are named unit, kernel, functional, functional-javascript and build. A functional test that hangs or 404s in CI is almost always SIMPLETEST_BASE_URL pointing somewhere nothing is listening — curl it in the pipeline before you run PHPUnit.",
    },
    {
      label: "The stage Symfony does not have",
      intro:
        "Symfony's equivalent of 'does the wiring survive deployment' is lint:container plus a migration run. Drupal's is a full install from committed config, followed by proving the export is idempotent.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: the container and the schema are the deployable state.
bin/console lint:container          # every service resolvable?
bin/console lint:yaml config        # config/ parses?
bin/console lint:twig templates

# Migrations are code, applied in order, one direction.
bin/console doctrine:migrations:migrate --no-interaction
bin/console doctrine:schema:validate  # entities match the DB?

# Nothing here can drift: the DB has no editable copy of config.`,
      ts: `# Drupal: config/sync IS the deployable state, and the DB
# holds an editable copy of it - so CI must prove they agree.

# 1. Can a brand new site be built from what is committed?
drush --yes site:install --existing-config

# 2. Does the deploy sequence itself succeed?
#    (updatedb -> config:import -> cache:rebuild -> deploy:hook)
#     plus cache:warm on Drupal 11.2+
drush --yes deploy

# 3. Is the export idempotent? Nothing should be left over.
if [ -n "$(drush config:status --format=list)" ]; then
  drush config:status
  echo "::error::Active config differs from config/sync after import"
  exit 1
fi

# 4. Optional: fail if a dev-only module leaked into core.extension.
drush config:get core.extension module --format=json | grep -q devel \\
  && { echo "::error::devel enabled in exported config"; exit 1; }
exit 0`,
      note:
        "Step 3 is the one that pays for itself. A module whose config/install YAML disagrees with what it writes on install leaves a permanent diff, and every developer's next 'drush cex' picks up noise they did not create.",
    },
  ],

  playground: {
    intro:
      "No CI runner here — just arrays and arithmetic modelling the matrix and the stage budget. Predict the wall-clock numbers before you run it, then look at which two stages own the pipeline.",
    lang: "php",
    code: `<?php
declare(strict_types=1);

// Model the job matrix and the stage budget of a Drupal CI pipeline.
// No runner, no Drupal - just arrays and arithmetic.

$matrix = [
  'php'    => ['8.3', '8.4'],
  'drupal' => ['10', '11'],
];

// This project does not support Drupal 10 on PHP 8.4, so drop that cell.
$exclude = [['php' => '8.4', 'drupal' => '10']];

// stage => [cold runner seconds, warm cache seconds]
$stages = [
  'composer install'    => [95, 11],
  'phpcs'               => [22, 22],
  'phpstan'             => [68, 19],
  'phpunit unit+kernel' => [145, 145],
  'phpunit functional'  => [318, 318],
  'config validation'   => [47, 47],
];

function expand(array $matrix, array $exclude): array {
  $jobs = [];
  foreach ($matrix['php'] as $php) {
    foreach ($matrix['drupal'] as $drupal) {
      $cell = ['php' => $php, 'drupal' => $drupal];
      if (in_array($cell, $exclude, TRUE)) {
        continue;
      }
      $jobs[] = $cell;
    }
  }
  return $jobs;
}

$jobs = expand($matrix, $exclude);
printf("Matrix: %d of %d cells survive the exclude\\n", count($jobs),
  count($matrix['php']) * count($matrix['drupal']));
foreach ($jobs as $job) {
  printf("  php%s / drupal%s\\n", $job['php'], $job['drupal']);
}

$cold = array_sum(array_column($stages, 0));
$warm = array_sum(array_column($stages, 1));

echo "\\nStage budget, one job:\\n";
foreach ($stages as $name => [$c, $w]) {
  printf("  %-20s cold %4ds   warm %4ds\\n", $name, $c, $w);
}
printf("  %-20s cold %4ds   warm %4ds\\n", 'TOTAL', $cold, $warm);

$fmt = static fn (int $s): string => sprintf('%d:%02d', intdiv($s, 60), $s % 60);

echo "\\nJobs run in parallel, so wall clock = the slowest job.\\n";
printf("  cold runner : %s\\n", $fmt($cold));
printf("  warm caches : %s  (saved %s on composer + phpstan)\\n",
  $fmt($warm), $fmt($cold - $warm));

echo "\\nWhat still costs the most on a warm run:\\n";
arsort($stages);
foreach (array_slice($stages, 0, 2, TRUE) as $name => [$c, $w]) {
  printf("  %-20s %4ds = %d%% of the job\\n", $name, $w, (int) round($w / $warm * 100));
}

$sharded = $warm - 318 + (int) ceil(318 / 4);
printf("\\nShard the functional suite 4 ways -> %s. Under ten minutes: %s\\n",
  $fmt($sharded), $sharded < 600 ? 'yes' : 'no');
`,
    output: `Matrix: 3 of 4 cells survive the exclude
  php8.3 / drupal10
  php8.3 / drupal11
  php8.4 / drupal11

Stage budget, one job:
  composer install     cold   95s   warm   11s
  phpcs                cold   22s   warm   22s
  phpstan              cold   68s   warm   19s
  phpunit unit+kernel  cold  145s   warm  145s
  phpunit functional   cold  318s   warm  318s
  config validation    cold   47s   warm   47s
  TOTAL                cold  695s   warm  562s

Jobs run in parallel, so wall clock = the slowest job.
  cold runner : 11:35
  warm caches : 9:22  (saved 2:13 on composer + phpstan)

What still costs the most on a warm run:
  phpunit functional    318s = 57% of the job
  phpunit unit+kernel   145s = 26% of the job

Shard the functional suite 4 ways -> 5:24. Under ten minutes: yes
`,
  },

  keyPoints: [
    "A Drupal pipeline is the standard PHP pipeline — composer validate, composer install from the lock, phpcs, PHPStan, PHPUnit — plus one extra stage that installs a site from config/sync and proves the export is idempotent.",
    "Kernel tests need SIMPLETEST_DB; functional tests additionally need SIMPLETEST_BASE_URL pointing at a web server that is actually serving the docroot, plus a writable sites/simpletest directory. Set BROWSERTEST_OUTPUT_DIRECTORY and upload it on failure.",
    "Static analysis needs mglaman/phpstan-drupal (installed automatically by phpstan/extension-installer) to understand \\Drupal::service(), entity storage and hooks; style uses PHP_CodeSniffer with the Drupal and DrupalPractice standards from drupal/coder.",
    "Cache Composer's global cache directory keyed on composer.lock, not vendor/ — restoring vendor/ skips the scaffold and plugin steps Drupal depends on. Cache the PHPStan result cache too.",
    "Functional tests are typically half the runtime and are the only stage worth sharding; matrix cells (PHP 8.3/8.4, Drupal 10/11) run in parallel and cost runner minutes, not wall clock.",
    "Never run composer update in CI on the gating job — the lock file is part of the artefact under test. Float core to the next major only in an explicitly non-blocking matrix cell.",
  ],

  interview: [
    {
      q: "Walk me through the CI pipeline you would set up for a Drupal 10 site that a team of four is deploying weekly.",
      a: `I would keep it in cost order so failures come back fast. First \`composer validate --strict\`, then \`composer install\` from the committed lock — never \`composer update\`, because the lock is part of what we are shipping. Then the cheap static gates: \`phpcs\` against the \`Drupal\` and \`DrupalPractice\` standards from \`drupal/coder\`, and PHPStan with \`mglaman/phpstan-drupal\` so it can resolve \`\\Drupal::service()\` and entity storage. Then PHPUnit in three passes — unit, kernel, functional — because unit tests need nothing, kernel tests need \`SIMPLETEST_DB\`, and functional tests need a real web server on \`SIMPLETEST_BASE_URL\`. The last stage is the Drupal-specific one: \`drush site:install --existing-config\`, \`drush deploy\`, then assert \`drush config:status\` is empty, which proves config/sync can build a site and that the export is idempotent.`,
    },
    {
      q: "Our functional tests pass locally but every one of them fails in CI. Where do you look first?",
      a: `The test bootstrap, not the tests. Functional tests in Drupal drive the site over HTTP, so they need \`SIMPLETEST_BASE_URL\` pointing at a server that is genuinely serving the docroot — locally that is your DDEV or Lando web container, and in CI you have to start one yourself, typically \`php -S 127.0.0.1:8080 -t web web/.ht.router.php\` in the background. I would curl that URL in the pipeline before PHPUnit runs so the failure names itself. The other two usual suspects are \`SIMPLETEST_DB\` not matching the database service container, and a missing or unwritable \`sites/simpletest\` directory. I would also set \`BROWSERTEST_OUTPUT_DIRECTORY\` and upload it as an artifact on failure, because then you get the actual HTML the test saw instead of an assertion message.`,
    },
    {
      q: "How do you keep a Drupal pipeline under ten minutes as the site grows?",
      a: `Measure first — in practice functional tests are 50–60% of the run and everything else is noise. Cache Composer's global cache directory keyed on \`composer.lock\` (not \`vendor/\`, because restoring \`vendor/\` skips the scaffold plugin and the \`core-dev\` wiring), and cache PHPStan's result cache. After that the only real lever is parallelism: shard the functional suite across several jobs, and split fast feedback (validate, phpcs, phpstan, unit, kernel) into a job that runs on every push while the functional suite runs on pull requests and on the develop branch. Matrix cells for PHP or Drupal versions do not cost wall clock because they run concurrently — they cost runner minutes, so keep the non-gating ones (like floating core to the next major) marked non-blocking.`,
    },
    {
      q: "What does the config validation stage catch that unit and kernel tests do not?",
      a: `Cross-cutting deployment breakage. A kernel test installs only the modules it declares, so it will happily pass while \`core.extension\` in \`config/sync\` enables a module that \`composer.lock\` never installs — which explodes as a fatal on the first \`drush cim\` in production. It also catches config whose dependencies are not satisfiable (a view depending on a module nobody enabled), a UUID mismatch between \`system.site\` and the target site, and non-idempotent exports where a module rewrites its own config on install so \`drush config:status\` is dirty immediately after an import. Installing from \`--existing-config\` in CI is the cheapest way to find all of that before the deploy window rather than during it.`,
    },
  ],

  quiz: [
    {
      question:
        "Your CI job runs unit and kernel tests successfully but every functional test errors out. Which environment variable is most likely wrong or unset?",
      options: [
        "SIMPLETEST_DB — kernel tests would have failed too if it were wrong",
        "SIMPLETEST_BASE_URL — functional tests drive the site over HTTP and need a live server",
        "SYMFONY_DEPRECATIONS_HELPER — deprecations abort the functional suite",
        "BROWSERTEST_OUTPUT_DIRECTORY — without it functional tests refuse to start",
      ],
      answerIndex: 1,
      explain:
        "Kernel tests boot Drupal in-process and only need SIMPLETEST_DB — the fact that they passed clears that variable. Functional tests make real HTTP requests against SIMPLETEST_BASE_URL, so if nothing is serving the docroot on that URL, every one of them fails. BROWSERTEST_OUTPUT_DIRECTORY only controls where failure HTML is written, and the deprecations helper affects reporting, not the ability to reach the site.",
    },
    {
      question:
        "Why cache Composer's global cache directory (~/.cache/composer) rather than caching vendor/ directly?",
      options: [
        "vendor/ is too large for most CI cache size limits",
        "Composer refuses to run if vendor/ already exists",
        "Restoring vendor/ skips composer install, and with it the scaffold and plugin steps Drupal relies on",
        "The global cache is keyed automatically, so no cache key is needed",
      ],
      answerIndex: 2,
      explain:
        "A Drupal project does real work during composer install: drupal/core-composer-scaffold writes index.php, .htaccess and the router file into the docroot, and other plugins run too. Drop a restored vendor/ in place and skip the install, and none of that happens. Caching the global cache keeps the downloads but still runs the full install, so the scaffold and plugin steps execute every time.",
    },
    {
      question:
        "After 'drush deploy' succeeds in CI, 'drush config:status --format=list' still prints two config names. What does that tell you?",
      options: [
        "The import failed and should be retried with --partial",
        "The export is not idempotent — something rewrites its config on install, so every developer's next drush cex picks up noise",
        "config:status always reports the items it just imported; this is expected",
        "The sync directory path in settings.php is wrong",
      ],
      answerIndex: 1,
      explain:
        "After a successful import the active configuration should be byte-identical to config/sync, so config:status should be empty. Output means something changed the active store after (or during) the import — typically a module rewriting its own config on install, or a value derived at install time. Left alone, that delta gets committed by whoever runs drush cex next, and it looks like an intentional change in review.",
    },
    {
      question:
        "Which stage ordering gives the fastest feedback on a broken pull request?",
      options: [
        "PHPUnit functional, then kernel, then unit, then phpcs, then composer validate",
        "composer validate, composer install, phpcs, PHPStan, PHPUnit unit/kernel/functional, config validation",
        "composer update, PHPUnit, phpcs, PHPStan",
        "Everything in one parallel fan-out with no ordering",
      ],
      answerIndex: 1,
      explain:
        "Order by cost per unit of signal: composer validate takes seconds and catches a mismatched lock file; phpcs and PHPStan are cheap and catch most sloppy pull requests; tests get progressively more expensive from unit to functional. Running composer update in CI is wrong regardless of order — it discards the lock file that is part of the artefact under test.",
    },
  ],
};

export default lesson;
