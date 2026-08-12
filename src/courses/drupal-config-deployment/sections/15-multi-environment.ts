import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "multi-environment",
  title: "Dev, Stage, Prod: Keeping Environments Honest",
  part: "Deployment Mechanics",
  estMinutes: 13,
  summary:
    "Run the same code and the same configuration on every rung of the ladder, confine environment differences to settings.php overrides and splits, and get production data downwards only through a sanitisation step you cannot accidentally skip.",

  concept: `
## One artefact, three environments

The rule that makes a deployment pipeline trustworthy is boring: **dev, stage
and prod run identical code and identical configuration.** The git SHA is the
same, the \`composer.lock\` is the same, the \`config/sync\` export is the same.
If stage is running something prod will not run, stage has stopped being a test
and become a different site that happens to look similar.

Everything that genuinely must differ falls into exactly three buckets:

- **Connection details and secrets** — database credentials, \`hash_salt\`,
  API keys, SMTP host, S3 bucket. These live in \`settings.php\` and environment
  variables, never in exported config.
- **Config value overrides** — the same config object, a different value.
  \`$config['system.logging']['error_level'] = 'all';\` on dev, \`'hide'\` on prod.
  The override layer sits above active config and is never written back by
  \`drush cex\`, which is precisely why it is the right place for this.
- **Which optional modules are on** — devel and stage_file_proxy on dev, not on
  prod. That is Config Split's job, not a hand-edited module list.

Anything outside those three buckets is drift, and drift is what turns "worked
on stage" into a 2am page.

### Keying settings.php on the environment

\`default.settings.php\` ends with a commented-out include of
\`settings.local.php\`. Uncomment it for local work, but for a real ladder go one
step further and include a file named after the environment, resolved from a
variable your host or Drush alias already sets:

\`\`\`php
$env = getenv('DRUPAL_ENV') ?: 'local';
$settings['four_rivers.env'] = $env;

$envFile = $app_root . '/' . $site_path . '/settings.' . $env . '.php';
if (file_exists($envFile)) {
  include $envFile;
}
\`\`\`

Those per-environment files are committed (they contain no secrets — secrets are
read from \`getenv()\` inside them), so the whole team can see what production
does differently, in a diff, in code review.

### Getting production data down, safely

Developers need realistic content. They do not need your users' email addresses.
An unsanitised production dump on a laptop is a personal-data transfer into an
unmanaged environment: under GDPR that is a processing activity you almost
certainly have no lawful basis for, and a stolen laptop becomes a notifiable
breach. Treat it as a hard gate, not a nicety.

The Drush path is two commands, and the second is not optional:

\`\`\`bash
drush sql:sync @prod @stage
drush @stage sql:sanitize --ignored-roles=qa_exempt
\`\`\`

\`sql:sync\` has no \`--sanitize\` flag — sanitising is a separate command run
against the target — so a pipeline that forgets the second line silently ships
raw PII. Wire both into one script that nobody invokes by hand. And remember
\`sql:sanitize\` only knows about core's user data: any custom table holding
personal data needs your own sanitise hook or it travels untouched.

### Files: rsync, or do not copy at all

\`drush rsync @prod:%files @stage:%files\` works and is fine for stage. For
laptops it is absurd once the public files directory passes a few gigabytes.
Install **stage_file_proxy** on dev instead: it intercepts 404s under the files
directory and fetches the original from production on demand.

### Stage has to actually be production-like

Same PHP minor version, same database server, same cache backend, same reverse
proxy, same module set. A stage box on the database cache backend while prod
runs Redis will never reproduce a cache-tag invalidation bug; one on PHP 8.2
will never reproduce a deprecation fatal that only fires on 8.3. Those are the
entire category of bug stage exists to catch, and only parity catches them.
`,

  comparisons: [
    {
      label: "Declaring which environment you are in",
      intro:
        "Both stacks resolve one environment variable and load a per-environment layer on top of a shared base. The difference is what that layer is allowed to contain.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# .env - committed, holds defaults and NO secrets.
APP_ENV=prod
DATABASE_URL="mysql://app@127.0.0.1:3306/app"
MAILER_DSN=null://null

# .env.local - gitignored, per-machine overrides.
# .env.prod.local - on the server only.

# config/packages/monolog.yaml       -> all envs
# config/packages/dev/monolog.yaml   -> APP_ENV=dev
# config/packages/prod/monolog.yaml  -> APP_ENV=prod
when@dev:
  monolog:
    handlers:
      main: { type: stream, level: debug }
when@prod:
  monolog:
    handlers:
      main: { type: fingers_crossed, level: error }

# Secrets go in the vault, not in any of the above:
#   php bin/console secrets:set MAILER_DSN`,
      ts: `<?php
// sites/default/settings.php - the shared base.

$databases['default']['default'] = [
  'driver' => 'mysql',
  'host' => getenv('DB_HOST') ?: 'localhost',
  'database' => getenv('DB_NAME'),
  'username' => getenv('DB_USER'),
  'password' => getenv('DB_PASS'),
];
$settings['hash_salt'] = getenv('DRUPAL_HASH_SALT');
$settings['config_sync_directory'] = '../config/sync';

// Resolve the rung of the ladder we are standing on.
// DRUPAL_ENV comes from the container, the host's own
// variable, or a Drush alias 'env-vars' entry.
$env = getenv('DRUPAL_ENV') ?: 'local';
$settings['four_rivers.env'] = $env;

// settings.local.php / settings.stage.php /
// settings.prod.php - committed, secret-free.
$file = $app_root . '/' . $site_path
  . '/settings.' . $env . '.php';
if (file_exists($file)) {
  include $file;
}`,
      note:
        "Symfony's per-environment layer can change services and bundles; Drupal's must not. Turning modules on or off per environment is Config Split's job — settings.php only sets connection details and $config[] value overrides.",
    },
    {
      label: "What the per-environment file is allowed to say",
      intro:
        "Same intent on both sides: verbose and disposable on dev, quiet and cached on prod. Watch which Drupal knobs are $settings (never exported) versus $config (an override of a real, exported config object).",
      leftLang: "yaml",
      rightLang: "php",
      php: `# config/packages/dev/framework.yaml
framework:
  cache:
    app: cache.adapter.filesystem
  profiler: { only_exceptions: false }

# config/packages/prod/framework.yaml
framework:
  cache:
    app: cache.adapter.redis
    default_redis_provider: '%env(REDIS_URL)%'

# config/packages/prod/doctrine.yaml
doctrine:
  orm:
    query_cache_driver: { type: pool, pool: doctrine.system_cache_pool }

# Bundles are per-environment too:
# config/bundles.php
# WebProfilerBundle::class => ['dev' => true, 'test' => true]`,
      ts: `<?php
// sites/default/settings.local.php

// $settings = machinery. Never exported, never
// visible in drush cex output.
$settings['container_yamls'][] = DRUPAL_ROOT
  . '/sites/development.services.yml';
$settings['cache']['bins']['render'] = 'cache.backend.null';
$settings['cache']['bins']['page'] = 'cache.backend.null';
$settings['rebuild_access'] = TRUE;
$settings['skip_permissions_hardening'] = TRUE;

// $config = an override of a real config object.
// system.logging IS exported; this layers on top of
// it at runtime and is never written back by cex.
$config['system.logging']['error_level'] = 'all';
$config['system.performance']['css']['preprocess'] = FALSE;
$config['system.performance']['js']['preprocess'] = FALSE;

// Pull images from prod instead of copying 400 GB.
$config['stage_file_proxy.settings']['origin']
  = 'https://www.fourrivers.org';
$config['stage_file_proxy.settings']['hotlink'] = TRUE;`,
      note:
        "Config forms use getEditable(), which bypasses the override layer — so the form shows the value stored in active config, not the value the site is actually running. Saving writes that stored value back, which is what turns up in the next drush cex, while the $config override silently keeps winning at runtime.",
    },
    {
      label: "Pulling production data down without shipping PII",
      intro:
        "Refreshing a lower environment from production. Symfony teams usually script an anonymising dump; Drush ships the sanitiser as a first-class command — but as a separate command you have to remember to run.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
set -euo pipefail

# No framework support - you write the scrub yourself,
# usually as SQL applied to a restored copy.
ssh prod "mysqldump --single-transaction app" \\
  | gzip > /tmp/app.sql.gz

zcat /tmp/app.sql.gz | mysql app_stage

mysql app_stage <<'SQL'
UPDATE user
   SET email = CONCAT('user+', id, '@example.invalid'),
       password = '$2y$13$anonymisedplaceholder',
       phone = NULL,
       stripe_customer_id = NULL;
TRUNCATE TABLE payment_method;
TRUNCATE TABLE messenger_messages;
SQL

php bin/console cache:clear --env=prod`,
      ts: `#!/usr/bin/env bash
set -euo pipefail

# 1. Copy the database. sql:sync has NO --sanitize
#    option - it only moves bytes.
drush sql:sync @prod @stage -y \\
  --structure-tables-key=common

# 2. Scrub it. Separate command, run on the TARGET.
#    Randomises passwords, rewrites mail + init to
#    user+%uid@localhost.localdomain by default.
drush @stage sql:sanitize -y \\
  --sanitize-email='user+%uid@fourrivers.invalid' \\
  --ignored-roles=qa_exempt

# 3. Files: fine for stage, absurd for a laptop.
drush rsync @prod:%files @stage:%files -y \\
  -- --exclude=styles --exclude=css --exclude=js

drush @stage deploy -y`,
      note:
        "sql:sanitize only understands core's user table. A custom donations table or a webform submission store needs your own post-command hook on SanitizeCommands::SANITIZE, or that data walks straight onto four laptops.",
    },
    {
      label: "Proving stage matches prod",
      intro:
        "Parity is a claim, and claims rot. Both stacks solve it the same way: build the environment from a declaration and assert the declaration in CI rather than trusting a runbook.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .gitlab-ci.yml - one image, every stage.
.php_env: &php_env
  image: php:8.3.14-fpm-alpine
  services:
    - name: mariadb:10.6
    - name: redis:7.2

test:
  <<: *php_env
  script:
    - composer install
    - php bin/console lint:container --env=prod
    - vendor/bin/phpunit

deploy_stage:
  <<: *php_env
  environment: staging
  script:
    - ansible-playbook deploy.yml -e env=stage
    # The same playbook, the same vars file shape,
    # runs against prod. Only the inventory differs.`,
      ts: `# .github/workflows/deploy.yml
jobs:
  parity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # setup-php pins a PHP minor, not a patch. Read it
      # from .php-version so CI and prod cannot drift.
      - uses: shivammathur/setup-php@v2
        with: { php-version-file: '.php-version' }

      - run: composer install --no-dev -o

      # Assert config in git equals config on stage.
      # Non-empty diff = someone clicked in the UI.
      # Block scalar (|): newlines survive, so the \\
      # continuations reach bash instead of being folded.
      - run: |
          drush @stage config:status --format=json \\
            --state=Different,Only\\ in\\ DB > drift.json
      - run: test "$(jq 'length' drift.json)" = "0"

      # Assert the module set matches the export.
      - run: |
          drush @stage config:get core.extension \\
            --format=json > stage.json
      - run: |
          diff <(jq -S . stage.json) \\
               <(jq -S . expected.json)`,
      note:
        "drush config:status compares the sync directory against active config and exits with a listing you can assert on. Running it against stage after every deploy is the cheapest possible drift alarm.",
    },
  ],

  playground: {
    intro:
      "Two checks that belong in every environment-refresh script. First, what drush sql:sanitize actually rewrites (and what it leaves alone). Second, a parity report that classifies each difference between stage and prod as designed or as drift.",
    lang: "php",
    code: `<?php

// PART 1 - what \`drush sql:sanitize\` does to the users table before a dump
// ever reaches a developer laptop. Modelled on the real Drush options.
$users = [
  ['uid' => 1,  'name' => 'admin',      'mail' => 'ops@fourrivers.org',   'pass' => '$2y$10$Kq9..real', 'roles' => ['administrator']],
  ['uid' => 42, 'name' => 'j.okafor',   'mail' => 'j.okafor@council.gov', 'pass' => '$2y$10$Lm3..real', 'roles' => ['editor']],
  ['uid' => 77, 'name' => 'donor_9912', 'mail' => 'k.hale@gmail.com',     'pass' => '$2y$10$Zx7..real', 'roles' => []],
  ['uid' => 91, 'name' => 'qa_bot',     'mail' => 'qa@fourrivers.test',   'pass' => '$2y$10$Pp1..real', 'roles' => ['qa_exempt']],
];

$emailPattern  = 'user+%uid@localhost.localdomain'; // --sanitize-email
$passwordValue = 'sanitised';                       // --sanitize-password=sanitised
$ignoredRoles  = ['qa_exempt'];                     // --ignored-roles=qa_exempt

echo "drush @stage sql:sanitize --ignored-roles=qa_exempt\\n";
printf("  %-4s %-11s %-32s %s\\n", 'uid', 'name', 'mail', 'pass');
foreach ($users as $u) {
  $exempt = array_intersect($u['roles'], $ignoredRoles) !== [];
  $mail = $exempt ? $u['mail'] : strtr($emailPattern, ['%uid' => $u['uid'], '%name' => $u['name']]);
  $pass = $exempt ? $u['pass'] : $passwordValue;
  printf("  %-4d %-11s %-32s %s\\n", $u['uid'], $u['name'], $mail, $pass);
}
echo "  note: uid 1 is sanitised too unless you exempt its role\\n\\n";

// Custom tables Drush knows nothing about stay untouched. Anything holding PII
// needs your own hook on SanitizeCommands::SANITIZE, or it ships to the laptop.
$customTables = [
  'four_rivers_donation' => ['donor_email', 'card_last4'],
  'webform_submission_data' => ['value'],
  'four_rivers_geo_cache' => [],
];
echo "PII audit of custom tables:\\n";
foreach ($customTables as $table => $pii) {
  printf("  %-24s %s\\n", $table, $pii === []
    ? 'safe - no personal data'
    : 'NEEDS a sanitize hook: ' . implode(', ', $pii));
}
echo "\\n";

// PART 2 - environment parity. Stage only earns its name if the things that
// must not differ, do not differ.
$policy = [
  'php_version'     => 'must match',
  'database_server' => 'must match',
  'cache_backend'   => 'must match',
  'modules_enabled' => 'must match',
  'config_sync_sha' => 'must match',
  'base_url'        => 'may differ',
  'error_level'     => 'may differ',
  'smtp_host'       => 'may differ',
];

$prod = [
  'php_version' => '8.3.14', 'database_server' => 'MariaDB 10.6',
  'cache_backend' => 'redis', 'modules_enabled' => 'a1b2c3',
  'config_sync_sha' => 'd4e5f6', 'base_url' => 'https://fourrivers.org',
  'error_level' => 'hide', 'smtp_host' => 'smtp.sendgrid.net',
];
$stage = [
  'php_version' => '8.2.20', 'database_server' => 'MariaDB 10.6',
  'cache_backend' => 'database', 'modules_enabled' => 'a1b2c3',
  'config_sync_sha' => 'd4e5f6', 'base_url' => 'https://stage.fourrivers.org',
  'error_level' => 'all', 'smtp_host' => 'mailpit:1025',
];

echo "stage vs prod parity report:\\n";
$blocking = 0;
foreach ($policy as $key => $rule) {
  $same = $prod[$key] === $stage[$key];
  if ($same) {
    $verdict = 'OK    identical';
  } elseif ($rule === 'may differ') {
    $verdict = 'OK    differs by design';
  } else {
    $verdict = 'DRIFT ' . $stage[$key] . ' != ' . $prod[$key];
    $blocking++;
  }
  printf("  %-16s %s\\n", $key, $verdict);
}
printf("\\n%d blocking difference(s): stage cannot certify this release.\\n", $blocking);
`,
    output: `drush @stage sql:sanitize --ignored-roles=qa_exempt
  uid  name        mail                             pass
  1    admin       user+1@localhost.localdomain     sanitised
  42   j.okafor    user+42@localhost.localdomain    sanitised
  77   donor_9912  user+77@localhost.localdomain    sanitised
  91   qa_bot      qa@fourrivers.test               $2y$10$Pp1..real
  note: uid 1 is sanitised too unless you exempt its role

PII audit of custom tables:
  four_rivers_donation     NEEDS a sanitize hook: donor_email, card_last4
  webform_submission_data  NEEDS a sanitize hook: value
  four_rivers_geo_cache    safe - no personal data

stage vs prod parity report:
  php_version      DRIFT 8.2.20 != 8.3.14
  database_server  OK    identical
  cache_backend    DRIFT database != redis
  modules_enabled  OK    identical
  config_sync_sha  OK    identical
  base_url         OK    differs by design
  error_level      OK    differs by design
  smtp_host        OK    differs by design

2 blocking difference(s): stage cannot certify this release.
`,
  },

  keyPoints: [
    "Same code, same composer.lock, same config/sync export on every rung. Legitimate differences reduce to three buckets: connection details and secrets, $config[] value overrides, and which optional modules a split enables.",
    "Key settings.php on one environment variable (DRUPAL_ENV, or the host's own) and include a committed, secret-free settings.<env>.php — so production's differences are reviewable in a diff instead of living on a server nobody logs into.",
    "drush sql:sync only moves bytes; it has no --sanitize option. drush sql:sanitize is a separate command run against the target, and a refresh script that omits it ships raw personal data to every laptop.",
    "sql:sanitize covers core's user data only (mail, init, passwords, with --ignored-roles and --allowlist-fields to carve out exceptions). Custom tables holding PII need your own post-command hook on SanitizeCommands::SANITIZE.",
    "Files: drush rsync @prod:%files @stage:%files for stage, stage_file_proxy on dev so images are fetched from production on demand rather than copied.",
    "Stage is only useful at parity — same PHP minor, same database engine, same cache backend, same module set. A stage box on the database cache backend cannot reproduce the Redis-only bug you are trying to catch.",
  ],

  interview: [
    {
      q: "How do you handle per-environment differences in Drupal, coming from Symfony's APP_ENV and config/packages?",
      a: "The mental model transfers directly: one environment variable selects a layer that sits on top of a shared base. In Drupal the base is `settings.php` plus the exported `config/sync` directory, and the layer is a `settings.<env>.php` I include based on `getenv('DRUPAL_ENV')`. The critical difference is what the layer may contain. Symfony's per-environment YAML can change services and even which bundles load; Drupal's must not, because the module list is itself configuration (`core.extension`) that gets imported. So `settings.php` holds only connection details, `$settings[]` machinery like cache bin backends, and `$config[]` value overrides — and anything that means \"this module is on here but not there\" goes through Config Split instead. I keep the per-environment files in git and read secrets from `getenv()` inside them, so the whole team can review what production does differently.",
    },
    {
      q: "A developer asks for a copy of the production database so they can debug an issue locally. Walk me through what you do.",
      a: "I never hand over a raw dump. The pipeline is `drush sql:sync @prod @stage` followed by `drush @stage sql:sanitize`, and the second command is the whole point — `sql:sync` has no sanitise option, it just moves bytes, so the two must be welded into one script that nobody runs by hand. Sanitise randomises passwords and rewrites `mail` and `init` to a pattern like `user+%uid@localhost.localdomain`; `--ignored-roles` and `--allowlist-fields` carve out the exceptions you actually need. Then I audit our custom tables, because `sql:sanitize` only knows about core's user data — a donations table or webform submission store needs a post-command hook on `SanitizeCommands::SANITIZE` or it travels untouched. The reason this is non-negotiable rather than good hygiene is legal: copying production personal data onto an unmanaged laptop is a processing activity with no lawful basis under GDPR, and a stolen laptop becomes a notifiable breach.",
    },
    {
      q: "Your team keeps hitting bugs that only appear in production. How would you attack that?",
      a: "Almost always it is stage-prod drift, so I would start by making parity measurable instead of assumed. I would write a check that compares PHP minor version, database engine and version, cache backend, reverse proxy, enabled module list and the config-sync SHA between the two environments, and fail the pipeline on any difference that is not on an explicit allowlist. The classic offenders are a stage box using the database cache backend while prod uses Redis, which hides every cache-tag invalidation bug, and a PHP minor mismatch, which hides deprecation fatals. I would also run `drush @stage config:status` after each deploy: a non-empty diff means someone has been clicking in the stage UI, which means stage's config is no longer the config prod will get. Building all environments from the same container image or the same Ansible playbook, with only the inventory differing, is what makes parity the default rather than a chore.",
    },
    {
      q: "The production files directory is 400 GB. How do developers work with images locally?",
      a: "They do not copy it. `drush rsync @prod:%files @stage:%files` is reasonable for a stage server on the same network, ideally with `--exclude=styles` so you skip derivative images that will be regenerated anyway. For laptops I install the **stage_file_proxy** contrib module on dev only, enabled through the dev config split. It hooks the 404 path under the files directory and fetches the original from production on demand, so a developer only ever pulls the handful of images the pages they visit actually reference. `$config['stage_file_proxy.settings']['origin']` points at the production URL, and setting `hotlink` to TRUE makes it serve straight from production without storing anything locally at all. It must never be enabled on production — that is exactly the kind of thing a config split is for.",
    },
  ],

  quiz: [
    {
      question:
        "Which of these differences between stage and production is legitimate rather than drift?",
      options: [
        "Stage runs PHP 8.2 while production runs PHP 8.3",
        "Stage has the devel module enabled and production does not",
        "$config['system.logging']['error_level'] is 'all' on stage and 'hide' on production",
        "Stage's config/sync export is two commits behind production's",
      ],
      answerIndex: 2,
      explain:
        "A $config[] override of an exported config object is exactly the sanctioned mechanism for a per-environment value: it layers above active config at runtime and drush cex never writes it back. A PHP minor mismatch and a stale export are drift. Devel being on in one place is legitimate as an outcome, but only when it is expressed through a config split — hand-enabling it makes core.extension differ, which the next config import will undo.",
    },
    {
      question:
        "What does `drush sql:sync @prod @stage` do about personal data in the users table?",
      options: [
        "Nothing — it copies the database verbatim; sanitising is a separate sql:sanitize command run on the target",
        "It scrubs emails and passwords automatically when the target alias is not production",
        "It prompts for confirmation and then applies the default sanitisation pattern",
        "It refuses to run unless --sanitize is passed",
      ],
      answerIndex: 0,
      explain:
        "sql:sync only moves bytes — dump on the source, rsync, import on the target. It has no --sanitize option at all. drush sql:sanitize is a distinct command you run against the target afterwards, which is why environment refreshes should be a single script rather than two commands a human remembers to type in order.",
    },
    {
      question:
        "Why put the module list difference between dev and prod into a config split rather than into settings.local.php?",
      options: [
        "settings.php cannot enable modules; the enabled module list is configuration (core.extension) that config import owns",
        "Config splits are faster than settings.php includes",
        "settings.local.php is not read on multisite installations",
        "Because $settings[] values are exported by drush cex and would leak the difference",
      ],
      answerIndex: 0,
      explain:
        "The set of enabled modules lives in the core.extension config object, so it is imported like any other config. Anything you do in settings.php to fake a different module list is fighting the next drush cim, which will simply restore the exported list. Config Split exists to make that difference a first-class, exportable part of configuration. ($settings[] values are never exported by drush cex — that is the opposite of the stated reason.)",
    },
    {
      question:
        "A developer needs realistic images locally but the production files directory is 400 GB. What is the standard Drupal answer?",
      options: [
        "drush rsync with --exclude=styles, which brings it under 40 GB",
        "Enable stage_file_proxy on dev so missing files are fetched from production on demand",
        "Mount the production files directory read-only over NFS",
        "Run drush image:flush and let Drupal regenerate everything from scratch",
      ],
      answerIndex: 1,
      explain:
        "stage_file_proxy intercepts 404s under the files directory and fetches the original from the URL in $config['stage_file_proxy.settings']['origin'], so a developer pulls only the images the pages they visit reference — or none at all if hotlink is TRUE. rsync with excludes is the right tool for a stage server on the same network, but it still moves the full set of originals.",
    },
  ],
};

export default lesson;
