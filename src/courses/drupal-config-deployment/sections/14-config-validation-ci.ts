import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "config-validation-ci",
  title: "Gating Config in CI",
  part: "Deployment Mechanics",
  estMinutes: 13,
  summary:
    "Prove in CI that the committed config actually installs and imports cleanly — a successful drush cim followed by an empty second config:status catches almost every deploy-window surprise before the deploy window.",

  concept: `
## The problem: cex is a local verb, cim is a production verb

Ana exports on her laptop, where the module is installed, the field exists and
the split is active. The import runs on production at 22:00, where none of that
is guaranteed. Between those two moments nothing has checked that the YAML in
\`config/sync\` is *self-consistent* — that every dependency it names is
installable, that every module in \`core.extension\` is in \`composer.lock\`, that
nothing was exported from a state your split filters will not reproduce.

The gate that catches most of this is embarrassingly simple: **in CI, apply the
committed config to a database that is not Ana's, and assert it lands clean.**

## Two shapes of the same check

**Build from nothing.** \`drush site:install --existing-config\` installs Drupal
using the profile and configuration already in the sync directory instead of the
profile's own \`config/install\` defaults. It only works if the sync directory is
complete — it needs a \`system.site\` with a UUID and a \`core.extension\` naming
the profile — which is exactly why it is a good test. If a colleague enabled a
module through the UI and forgot to export \`core.extension\`, this fails loudly
in a pull request instead of quietly on prod.

**Restore and replay.** Load a sanitised production snapshot, then run the real
deploy sequence (\`drush deploy\` = \`updatedb\`, \`config:import\`,
\`cache:rebuild\`, \`deploy:hook\`, plus \`cache:warm\` on Drupal 11.2+). This
catches the things a clean install cannot: update hooks that choke on real
content, a field removal that strands data, a \`hook_post_update\` that assumes a
config object the snapshot predates.

Run the first on every pull request; run the second nightly and before a
release.

## The second config:status is the whole point

\`drush cim\` exiting 0 is necessary, not sufficient. Immediately re-run
\`drush config:status\` and assert it reports nothing. Drift after a *successful*
import is the classic signal that something is wrong:

- A module's \`hook_install()\` wrote config that was never exported.
- A config entity normalises itself on save (Views is a repeat offender), so the
  stored form differs from the committed YAML.
- A split re-filters on import, so what you exported is not what stays active.
- A post-update hook mutates config without a matching export.

Be careful with exit codes: \`config:status\` reports differences but still exits
0, so CI has to inspect the output, not just \`&&\` the command.

## Gates worth adding next to it

- **\`core.extension\` vs \`composer.lock\`.** A module enabled in config but never
  required by Composer is a guaranteed white screen on prod.
- **\`drush updatedb:status\`.** After the import, no updates should be pending;
  anything left means a hook did not run or re-registers itself.
- **Schema coverage.** Config with no schema silently skips validation and
  typecasting; the contrib \`config_inspector\` module reports objects that have no
  schema or violate the one they claim.
- **\`composer validate --strict\`** so the lockfile and manifest agree.

## The Symfony instinct is the same

You already run \`bin/console lint:yaml config/\` and \`lint:container\` in CI to
prove the wiring resolves before anyone deploys it, and
\`doctrine:migrations:up-to-date\` to prove the schema is current. Drupal's
equivalent is heavier because the configuration lives in a database rather than
in files — you cannot lint it statically, you have to actually import it. That
is the whole difference, and it is why the CI job needs a real database service.
`,

  comparisons: [
    {
      label: "Does the configuration even load?",
      intro:
        "Both teams want one command sequence that fails the build if the shipped configuration cannot be applied. Symfony can answer statically; Drupal has to boot a database and import for real.",
      php: `# Symfony: the config is files, so it can be linted without a database.
set -euo pipefail

composer validate --strict
composer install --no-dev --prefer-dist --no-progress

# Are the YAML files even parseable?
bin/console lint:yaml config/ --parse-tags

# Does the compiled container resolve every service, argument and env var?
APP_ENV=prod bin/console lint:container

# Does a cold prod cache actually warm up?
APP_ENV=prod bin/console cache:clear
APP_ENV=prod bin/console cache:warmup

bin/console lint:twig templates/`,
      ts: `# Drupal: config lives in the DB, so "does it load" means "does it import".
set -euo pipefail

composer validate --strict
composer install --no-dev --prefer-dist --no-progress

# --existing-config reads $settings['config_sync_directory'] from settings.php
# and aborts with "Existing config directory not found" if it is unset, so the
# runner needs a settings.php that defines it before the installer runs.
cp web/sites/default/default.settings.php web/sites/default/settings.php
echo '$settings["config_sync_directory"] = "../config/sync";' \\
  >> web/sites/default/settings.php

# Build the whole site from the committed config. Needs a DB service in CI.
drush site:install --existing-config -y \\
  --db-url="mysql://drupal:drupal@127.0.0.1:3306/drupal"

# Import again. On a freshly installed-from-config site this must be a no-op.
drush config:import -y

# THE GATE: nothing may be left to import.
DRIFT="$(drush config:status --field=name)"
if [ -n "$DRIFT" ]; then
  echo "Config drift after a successful import:"
  echo "$DRIFT"
  drush config:status
  exit 1
fi

# Nothing may be left to update either.
test -z "$(drush updatedb:status --field=module)"`,
      note: "config:status exits 0 even when it lists differences — you must capture and test its output, or the gate silently passes.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "The CI job",
      intro:
        "Same pipeline shape, different cost: the Symfony job needs no services, the Drupal job needs a real MySQL/MariaDB before it can say anything useful.",
      php: `# .github/workflows/ci.yml - Symfony
name: CI
on: [pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
      - run: composer validate --strict
      - run: composer install --no-progress
      - run: bin/console lint:yaml config/ --parse-tags
      - run: APP_ENV=prod bin/console lint:container
      - run: bin/console doctrine:schema:validate --skip-sync
      # Fails if any migration is unmigrated or unregistered.
      - run: bin/console doctrine:migrations:up-to-date --fail-on-unregistered`,
      ts: `# .github/workflows/ci.yml - Drupal
name: CI
on: [pull_request]

jobs:
  config-gate:
    runs-on: ubuntu-latest
    services:
      mariadb:
        image: mariadb:10.11
        env:
          MARIADB_ROOT_PASSWORD: root
          MARIADB_DATABASE: drupal
        ports: ['3306:3306']
        options: >-
          --health-cmd="healthcheck.sh --connect" --health-retries=10
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          extensions: gd, pdo_mysql
      - run: composer validate --strict
      - run: composer install --no-progress
      # --existing-config fails outright unless settings.php sets
      # $settings['config_sync_directory'], so write one first.
      - name: Provide settings.php with a sync directory
        run: |
          cp web/sites/default/default.settings.php web/sites/default/settings.php
          echo '$settings["config_sync_directory"] = "../config/sync";' \\
            >> web/sites/default/settings.php
      # Install the site from the committed config, not from the profile.
      - run: |
          vendor/bin/drush site:install --existing-config -y \\
            --db-url="mysql://root:root@127.0.0.1:3306/drupal"
      - run: vendor/bin/drush config:import -y
      - name: Assert nothing left to import
        run: ./scripts/assert-config-clean.sh`,
      note: "Keep the assertion in a committed script, not inline YAML — developers need to run the identical gate locally before they push.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "core.extension vs the lockfile",
      intro:
        "A module enabled in config but absent from composer.lock is a fatal error on the first request after deploy. Symfony's bundles.php is generated by Flex from the lockfile, so the drift is hard to create; Drupal's core.extension is hand-committed, so you have to check it.",
      php: `<?php
// Symfony: config/bundles.php is written by Flex when a package is
// installed or removed, so it tracks composer.lock by construction.
// The remaining risk is a manifest/lockfile mismatch, which composer
// checks for you:
//
//   composer validate --strict
//   composer install --dry-run   # no-op means the lock matches vendor/
//
// config/bundles.php
return [
    Symfony\\Bundle\\FrameworkBundle\\FrameworkBundle::class => ['all' => true],
    Doctrine\\Bundle\\DoctrineBundle\\DoctrineBundle::class => ['all' => true],
    Sentry\\SentryBundle\\SentryBundle::class => ['prod' => true],
];`,
      ts: `<?php
// scripts/assert-extension-matches-lock.php  (run with: php scripts/...)
// core.extension is committed by hand, so it CAN name a module Composer
// never installs. Compare the two before the deploy does it for you.

$extension = yaml_parse_file(__DIR__ . '/../config/sync/core.extension.yml');
$lock = json_decode(file_get_contents(__DIR__ . '/../composer.lock'), TRUE);

$installed = [];
foreach ($lock['packages'] as $package) {
  if (in_array($package['type'], ['drupal-module', 'drupal-custom-module'], TRUE)) {
    // "drupal/webform" -> "webform"; the package name is the project name,
    // which may host several modules, so treat this as a first-pass check.
    $installed[] = substr($package['name'], strrpos($package['name'], '/') + 1);
  }
}

$errors = [];
foreach (array_keys($extension['module']) as $module) {
  $inCore = is_dir(__DIR__ . '/../web/core/modules/' . $module);
  $inCustom = is_dir(__DIR__ . '/../web/modules/custom/' . $module);
  $inContrib = is_dir(__DIR__ . '/../web/modules/contrib/' . $module);
  if (!$inCore && !$inCustom && !$inContrib) {
    $errors[] = "core.extension enables '$module' but no code provides it";
  }
}

if ($errors) {
  fwrite(STDERR, implode("\\n", $errors) . "\\n");
  exit(1);
}
echo "core.extension is fully backed by installed code.\\n";`,
      note: "Checking the filesystem after composer install is more reliable than string-matching package names, because one project can ship several modules (webform, webform_ui, webform_ui_...).",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Pending schema updates",
      intro:
        "Both stacks want the same guarantee before traffic arrives: no migration or update hook is still waiting to run.",
      php: `# Symfony / Doctrine
# Exits non-zero if any migration is not executed, or if the DB has
# executed a migration this codebase does not contain.
bin/console doctrine:migrations:up-to-date --fail-on-unregistered

# What would actually run, without running it:
bin/console doctrine:migrations:status
bin/console doctrine:migrations:migrate --dry-run

# Deploy order: code -> migrations -> cache warm.
bin/console doctrine:migrations:migrate --no-interaction
APP_ENV=prod bin/console cache:clear`,
      ts: `# Drupal
# List pending hook_update_N / hook_post_update_NAME without running them.
drush updatedb:status
drush updatedb:status --format=json

# The whole deploy, in the order core expects:
drush deploy
#   = drush updatedb
#     drush config:import
#     drush cache:rebuild
#     drush deploy:hook
#     drush cache:warm      (Drupal 11.2+ only)

# In CI, run the sequence against a restored snapshot, then assert twice:
drush updatedb:status --field=module | grep . && exit 1
drush config:status --field=name | grep . && exit 1
echo "Snapshot deploy is clean."`,
      note: "Order matters: updatedb runs BEFORE config:import (schema first, then config), and the single cache:rebuild sits between the import and deploy:hook — which runs last, so it is where you put logic that needs the new config to already be in place.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    intro:
      "A miniature of the CI gate, in pure PHP: check core.extension against composer.lock, run an import plan, then re-run config:status and prove it is empty. Two realistic failures are planted — spot them before you run it.",
    lang: "php",
    code: `<?php
// A miniature of the CI gate: pretend to install a site from committed config,
// run "config:import", then run "config:status" a SECOND time and assert clean.

// --- What is committed in config/sync (name => data) ---------------------
$sync = [
  'core.extension' => [
    'module' => ['node', 'views', 'webform', 'config_split'],
  ],
  'system.site' => ['name' => 'Acme Corp', 'slogan' => 'Ship on Tuesdays'],
  'views.view.press' => [
    'id' => 'press',
    'dependencies' => ['module' => ['node', 'views', 'better_exposed_filters']],
  ],
  'webform.webform.brief' => [
    'id' => 'brief',
    'dependencies' => ['module' => ['webform']],
  ],
];

// --- Active config of the CI site before the import ----------------------
$active = [
  'core.extension' => ['module' => ['node', 'views', 'webform']],
  'system.site' => ['name' => 'Acme Corp', 'slogan' => 'Old slogan'],
  'block.block.legacy_hero' => ['id' => 'legacy_hero'],
  'webform.webform.brief' => [
    'id' => 'brief',
    'dependencies' => ['module' => ['webform']],
  ],
];

// --- Non-core packages composer.lock actually installs -------------------
$composerLock = ['drupal/webform', 'drupal/better_exposed_filters'];
$coreModules = ['node', 'views', 'system', 'block', 'user'];

/** Return the create/update/delete plan config:import would execute. */
function plan(array $sync, array $active): array {
  $out = ['create' => [], 'update' => [], 'delete' => []];
  foreach ($sync as $name => $data) {
    if (!array_key_exists($name, $active)) {
      $out['create'][] = $name;
    }
    elseif ($active[$name] !== $data) {
      $out['update'][] = $name;
    }
  }
  foreach (array_keys($active) as $name) {
    if (!array_key_exists($name, $sync)) {
      $out['delete'][] = $name;
    }
  }
  return $out;
}

$failures = [];

// --- Gate 1: core.extension vs composer.lock ----------------------------
echo "== Gate 1: core.extension vs composer.lock ==\\n";
foreach ($sync['core.extension']['module'] as $module) {
  if (in_array($module, $coreModules, TRUE)) {
    continue;
  }
  $package = 'drupal/' . $module;
  $ok = in_array($package, $composerLock, TRUE);
  printf("  %-14s %s\\n", $module, $ok ? 'ok (' . $package . ')' : 'MISSING ' . $package);
  if (!$ok) {
    $failures[] = 'core.extension enables ' . $module . ' but composer.lock never installs it';
  }
}

// --- Gate 2: the import itself ------------------------------------------
echo "\\n== Gate 2: drush cim (first pass) ==\\n";
$first = plan($sync, $active);
foreach ($first as $op => $names) {
  foreach ($names as $name) {
    printf("  %-6s %s\\n", $op, $name);
  }
}

// Only modules listed in the incoming core.extension can satisfy a dependency.
$enabled = array_merge($coreModules, $sync['core.extension']['module']);
foreach (array_merge($first['create'], $first['update']) as $name) {
  $needs = $sync[$name]['dependencies']['module'] ?? [];
  $missing = array_values(array_diff($needs, $enabled));
  if ($missing !== []) {
    printf("  SKIP   %s - unmet dependency: %s\\n", $name, implode(', ', $missing));
    $failures[] = $name . ' depends on ' . implode(', ', $missing) . ', which core.extension does not enable';
    continue;
  }
  $active[$name] = $sync[$name];
}
foreach ($first['delete'] as $name) {
  unset($active[$name]);
}

// --- Gate 3: the second config:status must be empty ----------------------
echo "\\n== Gate 3: drush config:status (second pass) ==\\n";
$second = plan($sync, $active);
$drift = array_merge($second['create'], $second['update'], $second['delete']);
if ($drift === []) {
  echo "  No differences between DB and sync directory.\\n";
}
else {
  foreach ($drift as $name) {
    printf("  %-24s Different\\n", $name);
  }
}

echo "\\n== Verdict ==\\n";
if ($failures === []) {
  echo "  PASS - exit 0\\n";
}
else {
  foreach ($failures as $i => $message) {
    printf("  %d) %s\\n", $i + 1, $message);
  }
  echo "  FAIL - exit 1 (caught before the deploy window, not during it)\\n";
}
`,
    output: `== Gate 1: core.extension vs composer.lock ==
  webform        ok (drupal/webform)
  config_split   MISSING drupal/config_split

== Gate 2: drush cim (first pass) ==
  create views.view.press
  update core.extension
  update system.site
  delete block.block.legacy_hero
  SKIP   views.view.press - unmet dependency: better_exposed_filters

== Gate 3: drush config:status (second pass) ==
  views.view.press         Different

== Verdict ==
  1) core.extension enables config_split but composer.lock never installs it
  2) views.view.press depends on better_exposed_filters, which core.extension does not enable
  FAIL - exit 1 (caught before the deploy window, not during it)
`,
  },

  keyPoints: [
    "The highest-value CI gate is applying the committed config to a database that is not the author's: drush site:install --existing-config on every pull request, plus a restore-and-drush-deploy run against a sanitised snapshot before releases.",
    "A successful drush cim proves nothing on its own — re-run drush config:status afterwards and fail the build if it lists anything. Leftover drift after a clean import means a hook_install, a self-normalising config entity, a split filter or a post-update wrote config nobody exported.",
    "drush config:status reports differences but still exits 0, so capture its output (--field=name) and test for emptiness rather than relying on the exit code.",
    "Check core.extension against what Composer actually installs; a module enabled in config with no code behind it is a fatal error on the first production request, and the sync directory has no way to notice.",
    "drush deploy encodes the correct order — updatedb, config:import, cache:rebuild, deploy:hook (plus cache:warm on Drupal 11.2+) — so schema changes land before config and deploy:hook logic can assume the new config exists.",
    "Symfony's lint:yaml, lint:container and doctrine:migrations:up-to-date answer the same question statically; Drupal's config lives in the database, so the equivalent check needs a real DB service and a real import.",
  ],

  interview: [
    {
      q: "Your team keeps discovering broken config imports during the production deploy window. What would you put in CI to stop that?",
      a: "I would add a job that installs the site from the committed configuration — `drush site:install --existing-config` — and then runs `drush config:import`, on every pull request. That alone catches a module enabled in `core.extension` but missing from `composer.lock`, a config entity whose dependencies cannot be satisfied, and a sync directory that is simply incomplete. The critical extra step is running `drush config:status` again *after* a successful import and failing the build if it reports anything, because a clean exit code from `cim` does not mean the active config now matches the files. Because `config:status` exits 0 even when it lists differences, the job has to capture the output and test it, not just chain commands with `&&`. I would pair that with a nightly job that restores a sanitised production snapshot and runs the real `drush deploy` sequence, since a fresh install never exercises update hooks against real content.",
    },
    {
      q: "Why would config:status show differences immediately after a config:import that reported success?",
      a: "Because the import writes the file's data through the config system, and several things can rewrite or re-filter it on the way in. A module's `hook_install()` may create config objects during the import that were never exported. Config entities can normalise themselves on save — Views is the usual example, adding defaults that the exported YAML did not carry — so the stored form differs from the file. A config split can re-filter on import so the item you exported is not what stays active. And a `hook_post_update_NAME()` can mutate config without a matching export. All four are real bugs that surface as drift, which is exactly why the second `config:status` is the assertion worth writing.",
    },
    {
      q: "How is this different from what you'd do on a Symfony project, and why does Drupal need more machinery?",
      a: "On Symfony the shipped configuration is files that are compiled at build time, so I can validate it without a database: `bin/console lint:yaml config/`, `lint:container` to prove every service, argument and env var resolves in the prod environment, and a `cache:warmup` to prove a cold container builds. Schema currency is `doctrine:migrations:up-to-date --fail-on-unregistered`. Drupal's configuration is *data in the database*, and the files in `config/sync` are only a serialisation of it, so there is no static equivalent — the only honest check is to actually import them. That is why the Drupal CI job needs a MySQL/MariaDB service and takes minutes rather than seconds, and why teams are tempted to skip it. It is also why skipping it hurts more: the failure has nowhere else to surface except the deploy.",
    },
    {
      q: "What order do database updates and config import run in during a deploy, and why does it matter?",
      a: "`drush deploy` runs `updatedb`, then `config:import`, then `cache:rebuild`, then `deploy:hook` — and on Drupal 11.2+ a final `cache:warm`. Schema changes go first because config being imported may depend on a table, column or field storage that an update hook creates. `deploy:hook` runs after the import and the rebuild precisely so that `hook_deploy_NAME()` implementations can assume the new configuration is already active — that is the right place for a content migration that depends on a field you just configured, whereas `hook_update_N()` runs before config exists and must not assume it. Getting this backwards is a common cause of deploys that work on a fresh install and fail on production, which is another argument for testing the sequence against a restored snapshot rather than only a clean install.",
    },
  ],

  quiz: [
    {
      question:
        "Your CI job runs `drush config:import -y && echo OK`. It prints OK. What has actually been proven?",
      options: [
        "That the active configuration now matches config/sync exactly.",
        "That the import ran without a fatal error — but not that nothing is left to import.",
        "That every module in core.extension is present in composer.lock.",
        "That no database update hooks are pending.",
      ],
      answerIndex: 1,
      explain:
        "A zero exit code from config:import only means the import completed. Hooks fired during the import, self-normalising config entities and split filters can all leave the active config different from the files. That is why the gate is a second `drush config:status` that must come back empty — and why you have to inspect its output, since config:status itself exits 0 even when it lists differences.",
    },
    {
      question:
        "What does `drush site:install --existing-config` do that a normal `drush site:install` does not?",
      options: [
        "It skips the database and installs against the config files directly.",
        "It installs using the profile and configuration already in the sync directory instead of the profile's own config/install defaults.",
        "It runs config:import automatically after every subsequent deploy.",
        "It exports the current site configuration before installing.",
      ],
      answerIndex: 1,
      explain:
        "--existing-config makes the installer take the configuration from the sync directory, including the profile named in core.extension and the site UUID from system.site, rather than the defaults each module and the profile would normally provide. It fails if the sync directory is incomplete, which is exactly the property that makes it a useful pull-request gate.",
    },
    {
      question:
        "Which failure would a `core.extension` vs `composer.lock` check catch that a plain `drush cim` on a developer laptop would not?",
      options: [
        "A views display with a broken filter.",
        "A module enabled and exported locally, but never added to composer.json — so the code exists on the laptop and nowhere else.",
        "A config object with no schema definition.",
        "A hook_post_update that mutates config.",
      ],
      answerIndex: 1,
      explain:
        "If the module's code is sitting in the working copy but was never required through Composer, the import succeeds locally because the code is there. On a CI runner or production, `composer install` never fetches it, `core.extension` enables a module with no code behind it, and the site fatals on the first request. Comparing the enabled module list against what Composer actually installed is the only thing that catches it before deploy.",
    },
    {
      question:
        "In `drush deploy`, why does `deploy:hook` run after `config:import` rather than before?",
      options: [
        "Because deploy hooks are slower and should not block the config import.",
        "Because hook_deploy_NAME() implementations are meant to run against the new configuration, which must already be active.",
        "Because config:import would otherwise delete the deploy hooks.",
        "Because deploy hooks cannot run while the cache is cold.",
      ],
      answerIndex: 1,
      explain:
        "The ordering is deliberate: `hook_update_N()` runs first for schema changes that config might depend on, and `hook_deploy_NAME()` runs last for logic that depends on the newly imported configuration — for example, populating a field whose storage and display settings only exist after the import. Putting content-shaped logic in an update hook that assumes new config is a classic source of deploys that pass on a fresh install and fail on production.",
    },
  ],
};

export default lesson;
