import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "settings-environments-and-config",
  title: "settings.php, Environment Variables and Per-Environment Config",
  part: "The Distribution & Your Codebase",
  estMinutes: 13,
  summary:
    "How a GovCMS site resolves configuration once the platform owns settings.php, injects LAGOON_* and MARIADB_* variables, and replaces config_split with three import directories.",

  concept: `
## settings.php stops being yours

On a Drupal site you control, \`web/sites/default/settings.php\` is the file you edit: database credentials, \`config_sync_directory\`, a trusted-host pattern, a \`settings.local.php\` include at the bottom.

On GovCMS it is a stub. The scaffold's \`ScriptHandler::createRequiredFiles\` copies scaffold-tooling's \`drupal/settings/settings.php\` into \`web/sites/default/\` once, and only if the file is absent. Everything of substance is an \`include\` out of \`vendor/\`:

\`\`\`php
$govcms_includes = $app_root . '/../vendor/govcms/scaffold-tooling/drupal/settings';
include $govcms_includes . '/all.settings.php';
include $govcms_includes . '/security.settings.php';
\`\`\`

### The include order, exactly

1. \`all.settings.php\` — every environment. Sets \`$settings['config_sync_directory'] = '../config/default';\`, the three file paths, fast404, a \`hash_salt\` derived from \`MARIADB_HOST\`, and \`trusted_host_patterns\` of \`.*\` when \`LAGOON\` is set.
2. \`security.settings.php\` — the \`module_permissions\` managed-module allowlist and permission denylist, event_log_track lockdown, seckit CSP report URI.
3. \`lagoon.settings.php\` — only \`if (getenv('LAGOON'))\`. Builds \`$databases\` from \`MARIADB_*\`, the Varnish reverse-proxy settings, and the Redis cache backend.
4. \`production.settings.php\` when \`LAGOON_ENVIRONMENT_TYPE == 'production'\`, otherwise \`development.settings.php\`. There is no third branch: a Lagoon branch environment gets the development file.
5. \`dev-mode.settings.php\` when \`DEV_MODE\` is \`true\`.
6. \`web/sites/default/project.settings.php\`, then \`settings.local.php\`, if those files exist.

Spelling trap worth knowing: the docblock talks about "settings.project.php", but the code that runs tests for \`project.settings.php\`.

### Overrides, not stored config

Almost everything those includes do is \`$config['x.y']['z'] = ...\` — Drupal's runtime override layer, not the active store. So CSS/JS aggregation, \`system.logging.error_level\`, the environment indicator name, \`securitytxt.settings.enabled\`, and \`tfa.settings\` when \`GOVCMS_TFA_ENFORCE\` is set are all decided *after* config import. They beat whatever you exported, never appear in \`drush config:export\`, and — the part that trips people up — the admin form still shows, and still lets you save, the *stored* value: core only adds a status message saying the values are overridden and that overrides will take precedence. Exporting them is harmless and pointless.

### Layering is three directories, not config_split

\`config_split\` 2.0.2 is bundled by the distribution but is not in the profile's install list and is not on the \`managed_modules\` allowlist. \`config_ignore\` 3.4.0 is bundled *and* installed, \`mode: simple\`, shipping ignores for \`webform.webform.*\`, \`webform.webform_options.*\`, \`system.menu.*\`, \`password_policy.*\`, \`seckit.settings\`, \`login_security.settings\` and \`clamav.settings\`.

Environment layering is done instead by \`govcms-config-import\`, the "Perform config import" post-rollout task in \`.lagoon.yml\`:

- \`config/default\` — full \`drush config:import -y\`, always
- \`config/dev\` — \`--partial\`, when \`LAGOON_ENVIRONMENT_TYPE\` is not \`production\`
- \`config/local\` — \`--partial\`, only when it is exactly \`local\`

The whole step is gated on \`GOVCMS_DEPLOY_WORKFLOW_CONFIG=import\` and skipped on \`internal-govcms-update*\` branches.

### Where an agency value may live

On PaaS: \`project.settings.php\`, the one include point that is yours. On SaaS: nowhere in PHP — \`.docker/Dockerfile.saas\` copies only \`themes/\`, \`config\` and \`favicon.ico\`, so \`web/sites/default\` never comes from your repository. Prefer a variable the platform already reads.
`,

  comparisons: [
    {
      label: "Who owns settings.php",
      intro:
        "The bootstrap file on a site you control versus the one GovCMS drops into web/sites/default. Both are real settings.php files; only one of them is yours to edit.",
      php: `<?php

// web/sites/default/settings.php -- yours, on a site you control.
$databases['default']['default'] = [
  'driver' => 'mysql',
  'database' => 'example',
  'username' => 'example',
  'password' => 'example',
  'host' => 'db',
  'port' => 3306,
];

$settings['config_sync_directory'] = '../config/sync';
$settings['file_private_path'] = '../private';
$settings['trusted_host_patterns'] = ['^www\\\\.example\\\\.gov\\\\.au$'];
$settings['hash_salt'] = 'a-value-you-generated-and-stored';

$config['system.performance']['css']['preprocess'] = TRUE;

if (file_exists($app_root . '/sites/default/settings.local.php')) {
  include $app_root . '/sites/default/settings.local.php';
}`,
      ts: `<?php

// web/sites/default/settings.php -- copied ONCE from
// vendor/govcms/scaffold-tooling/drupal/settings/settings.php by the scaffold's
// ScriptHandler::createRequiredFiles(), and only when it is missing.
// Every real decision is an include out of vendor/.
$govcms_includes = $app_root . '/../vendor/govcms/scaffold-tooling/drupal/settings';

include $govcms_includes . '/all.settings.php';
include $govcms_includes . '/security.settings.php';

// Every Lagoon, local or remote.
if (getenv('LAGOON')) {
  include $govcms_includes . '/lagoon.settings.php';
}

// Prod vs Dev specific overrides.
if (getenv('LAGOON_ENVIRONMENT_TYPE') && getenv('LAGOON_ENVIRONMENT_TYPE') == 'production') {
  include $govcms_includes . '/production.settings.php';
}
else {
  include $govcms_includes . '/development.settings.php';
}

if (getenv('DEV_MODE') && getenv('DEV_MODE') == 'true') {
  include $govcms_includes . '/dev-mode.settings.php';
}

// Project specific overrides.
if (file_exists($app_root . '/sites/default/project.settings.php')) {
  include $app_root . '/sites/default/project.settings.php';
}

// Local uncommitted overrides.
if (file_exists($app_root . '/sites/default/settings.local.php')) {
  include $app_root . '/sites/default/settings.local.php';
}`,
      note: "Six ordered includes, five of them out of vendor/. Editing the copy in web/sites/default is possible on PaaS and pointless on SaaS, because web/ never ships from your repository -- and on either offering a scaffold-tooling upgrade moves the ground under you.",
    },
    {
      label: "Detecting the environment and wiring the database",
      intro:
        "Vanilla sites read an app-specific variable and build $databases by hand. GovCMS keys everything off LAGOON and LAGOON_ENVIRONMENT_TYPE, and lagoon.settings.php assembles the connection from platform-injected MARIADB_* variables you never set.",
      php: `<?php

// A vanilla site: you choose the variable name and the shape.
$env = getenv('APP_ENV') ?: 'production';

$databases['default']['default'] = [
  'driver' => 'mysql',
  'database' => getenv('DB_NAME'),
  'username' => getenv('DB_USER'),
  'password' => getenv('DB_PASS'),
  'host' => getenv('DB_HOST'),
  'port' => 3306,
  'charset' => 'utf8mb4',
  'collation' => 'utf8mb4_general_ci',
];

if ($env !== 'production') {
  $config['system.logging']['error_level'] = 'verbose';
  $settings['cache']['bins']['render'] = 'cache.backend.null';
}`,
      ts: `<?php

// vendor/govcms/scaffold-tooling/drupal/settings/lagoon.settings.php
// Runs only when LAGOON is set. The variable names are the platform's.
$db_conf = [
  'driver' => 'mysql',
  'database' => getenv('MARIADB_DATABASE') ?: 'drupal',
  'username' => getenv('MARIADB_USERNAME') ?: 'drupal',
  'password' => getenv('MARIADB_PASSWORD') ?: 'drupal',
  'port' => 3306,
  'charset' => 'utf8mb4',
  'collation' => 'utf8mb4_general_ci',
];

$databases['default']['default'] = array_merge($db_conf, [
  'host' => getenv('MARIADB_HOST') ?: 'mariadb',
]);

// Read replicas arrive as a space-separated list, not a second variable.
if (getenv('MARIADB_READREPLICA_HOSTS')) {
  $replica_hosts = array_map('trim', explode(' ', getenv('MARIADB_READREPLICA_HOSTS')));
  $databases['read']['default'] = array_merge($db_conf, ['host' => $replica_hosts[0]]);
  foreach ($replica_hosts as $replica_host) {
    $databases['default']['replica'][] = array_merge($db_conf, ['host' => $replica_host]);
  }
}

// all.settings.php derives the salt rather than storing one.
$settings['hash_salt'] = hash('sha256', getenv('MARIADB_HOST'));

// Redis is opt-in per environment, via a platform variable.
if (getenv('ENABLE_REDIS')) {
  $settings['cache_prefix']['default'] = getenv('LAGOON_PROJECT') . '_' . getenv('LAGOON_GIT_SAFE_BRANCH');
}`,
      note: "LAGOON, LAGOON_ENVIRONMENT_TYPE, LAGOON_PROJECT, LAGOON_GIT_SAFE_BRANCH, LAGOON_ROUTE and the MARIADB_* set are injected by the platform. Locally, .env.default seeds LAGOON_ENVIRONMENT_TYPE=local so the same branching produces a sane dev box.",
    },
    {
      label: "Per-environment configuration",
      intro:
        "The idiomatic Drupal answer is config_split: a split entity plus a status override in settings.php. GovCMS does not install config_split; it layers three directories with partial imports instead.",
      leftLang: "yaml",
      rightLang: "bash",
      php: `# config/sync/config_split.config_split.dev.yml
# Activated from settings.php with:
#   $config['config_split.config_split.dev']['status'] = TRUE;
uuid: 6e1a0f2c-9c34-4d61-8a5f-1f7b2d3e4a55
langcode: en
status: false
dependencies: {  }
id: dev
label: 'Development overrides'
description: 'Config that should only exist off production.'
weight: 0
storage: folder
folder: ../config/splits/dev
module:
  devel: 0
theme: {  }
complete_list:
  - system.logging
  - shield.settings
partial_list: {  }
status_override: none`,
      ts: `# vendor/bin/govcms-config-import -- the "Perform config import" post-rollout task.

LAGOON_ENVIRONMENT_TYPE=\${LAGOON_ENVIRONMENT_TYPE:-production}
GOVCMS_DEPLOY_WORKFLOW_CONFIG=\${GOVCMS_DEPLOY_WORKFLOW_CONFIG:-import}
CONFIG_DEFAULT_DIR=\${CONFIG_DEFAULT_DIR:-/app/config/default}
CONFIG_DEV_DIR=\${CONFIG_DEV_DIR:-/app/config/dev}
CONFIG_LOCAL_DIR=\${CONFIG_LOCAL_DIR:-/app/config/local}

if [ "$GOVCMS_DEPLOY_WORKFLOW_CONFIG" != "import" ]; then
  echo "[skip]: Workflow is not set to import."
  exit 0
fi

# 1. Full import, every environment.
drush config:import -y

# 2. Anything that is not production.
if [ "$LAGOON_ENVIRONMENT_TYPE" != "production" ]; then
  drush config:import -y --source="$CONFIG_DEV_DIR" --partial
fi

# 3. Only a developer's machine -- public branch environments never see this.
if [ "$LAGOON_ENVIRONMENT_TYPE" = "local" ]; then
  drush config:import -y --source="$CONFIG_LOCAL_DIR" --partial
fi`,
      note: "Later --partial imports overwrite keys set by earlier ones, so config/local is the only safe home for a developer-only override. Note the script's default: an unset LAGOON_ENVIRONMENT_TYPE is treated as production, which is exactly the wrong direction to guess in.",
    },
    {
      label: "Parking an agency-specific value so it survives an upgrade",
      intro:
        "Same goal on both sides: raise the CLI HTTP timeout and the temporary-file lifetime for one client. On a site you own you edit settings.php. On GovCMS you have to pick a layer the distribution will not overwrite.",
      php: `<?php

// web/sites/default/settings.php on a site you own: just edit the file.
// Nothing else writes to it, so it survives every composer update.
$settings['http_client_config']['timeout'] = 60;
$config['system.file']['temporary_maximum_age'] = 900;
$config['system.performance']['cache']['page']['max_age'] = 604800;

if (in_array(PHP_SAPI, ['cli', 'cli-server'], TRUE)) {
  ini_set('memory_limit', '512M');
}`,
      ts: `<?php

// PaaS -- web/sites/default/project.settings.php.
// The one include point that is yours; scaffold-tooling never rewrites it.
// (The settings.php docblock calls this "settings.project.php". The code that
// executes checks for "project.settings.php". Use the second spelling.)
$settings['http_client_config']['timeout'] = 60;

// Better still: all.settings.php and production.settings.php already read
// these, so a Lagoon environment variable changes the value with no PHP at all.
//   GOVCMS_HTTP_CLIENT_TIMEOUT=60      (CLI requests only)
//   GOVCMS_CLI_MEMORY_LIMIT=512M       (CLI requests only)
//   GOVCMS_FILE_TEMP_MAX_AGE=900       (production.settings.php)
//   CACHE_MAX_AGE=604800               (production.settings.php)
//   GOVCMS_FAST404_EXTS=...            (all.settings.php)

// SaaS -- neither project.settings.php nor settings.local.php is reachable.
// .docker/Dockerfile.saas copies exactly this into the image:
//   COPY themes/ /app/web/themes/custom
//   COPY config /app/config
//   COPY favicon.ico /app/web
// web/sites/default is never built from your repository, so the value has to be
// exported configuration under config/default (or config/dev), or a platform
// variable set for you.`,
      note: "Order of preference on GovCMS: an existing platform variable, then exported config in config/default or config/dev, then project.settings.php on PaaS. Editing settings.php itself is last on PaaS and impossible on SaaS.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of GovCMS config resolution: five layers, three environments, one config_ignore entry. Read the chain column before the value -- the rule is that stored layers are gated by environment and by config_ignore, while settings.php overrides are gated by nothing.",
    lang: "php",
    code: `<?php

// The five layers, in the order GovCMS applies them. Later wins.
$layers = [
  'L1' => ['name' => 'config/default', 'kind' => 'store',    'envs' => ['local', 'development', 'production']],
  'L2' => ['name' => 'config/dev',     'kind' => 'store',    'envs' => ['local', 'development']],
  'L3' => ['name' => 'config/local',   'kind' => 'store',    'envs' => ['local']],
  'L4' => ['name' => 'all+security',   'kind' => 'override', 'envs' => ['local', 'development', 'production']],
  'L5' => ['name' => 'env.settings',   'kind' => 'override', 'envs' => ['local', 'development', 'production']],
];

// What each layer declares. L5 branches on LAGOON_ENVIRONMENT_TYPE.
$declared = [
  'L1' => [
    'system.performance:css.preprocess'    => '0',
    'environment_indicator.indicator:name' => 'Site',
    'webform.webform.contact:title'        => 'Contact form',
  ],
  'L2' => ['shield.settings:credentials.user' => 'preview'],
  'L3' => ['shield.settings:credentials.user' => 'localdev'],
  'L4' => ['shield.settings:allow_cli' => 'TRUE'],
  'L5:production' => [
    'system.performance:css.preprocess'    => '1',
    'environment_indicator.indicator:name' => 'Production',
  ],
  'L5:development' => ['environment_indicator.indicator:name' => 'Non-production'],
];

// config_ignore (mode: simple) keeps STORED layers off these keys only.
$ignored = ['webform.webform.contact:title'];

// Whatever an editor last saved into the database on this site.
$database = [
  'system.performance:css.preprocess'    => '1',
  'environment_indicator.indicator:name' => 'Prod copy',
  'shield.settings:allow_cli'            => 'FALSE',
  'shield.settings:credentials.user'     => '(empty)',
  'webform.webform.contact:title'        => 'Contact us (edited in UI)',
];

function resolve($key, $env, $layers, $declared, $database, $ignored) {
  $value = $database[$key];
  $won = 'database';
  $chain = [];
  foreach ($layers as $id => $layer) {
    $slot = ($id === 'L5') ? 'L5:' . ($env === 'production' ? 'production' : 'development') : $id;
    if (!in_array($env, $layer['envs'], TRUE)) {
      $chain[] = $id . '-';
    }
    elseif ($layer['kind'] === 'store' && in_array($key, $ignored, TRUE)) {
      $chain[] = $id . 'i';
    }
    elseif (!array_key_exists($key, $declared[$slot])) {
      $chain[] = $id . '.';
    }
    else {
      $value = $declared[$slot][$key];
      $won = $id . ' ' . $layer['name'];
      $chain[] = $id . '+';
    }
  }
  return [$value, $won, implode(' ', $chain)];
}

$keys = array_keys($database);
$envs = ['local', 'development', 'production'];

echo "GovCMS config resolution: 5 layers x 3 environments\\n";
echo "legend  + applied   - layer inactive here   . declares nothing   i blocked by config_ignore\\n";

$effective = [];
foreach ($envs as $env) {
  echo "\\n-- LAGOON_ENVIRONMENT_TYPE=" . $env . "\\n";
  foreach ($keys as $key) {
    list($value, $won, $chain) = resolve($key, $env, $layers, $declared, $database, $ignored);
    $effective[$key][$env] = $value;
    printf("%-38s %-20s %-26s won: %s\\n", $key, $chain, $value, $won);
  }
}

echo "\\nEffective values\\n";
printf("%-38s %-14s %-16s %s\\n", 'key', 'local', 'development', 'production');
foreach ($keys as $key) {
  printf("%-38s %-14s %-16s %s\\n", $key, $effective[$key]['local'], $effective[$key]['development'], $effective[$key]['production']);
}`,
    output: `GovCMS config resolution: 5 layers x 3 environments
legend  + applied   - layer inactive here   . declares nothing   i blocked by config_ignore

-- LAGOON_ENVIRONMENT_TYPE=local
system.performance:css.preprocess      L1+ L2. L3. L4. L5.  0                          won: L1 config/default
environment_indicator.indicator:name   L1+ L2. L3. L4. L5+  Non-production             won: L5 env.settings
shield.settings:allow_cli              L1. L2. L3. L4+ L5.  TRUE                       won: L4 all+security
shield.settings:credentials.user       L1. L2+ L3+ L4. L5.  localdev                   won: L3 config/local
webform.webform.contact:title          L1i L2i L3i L4. L5.  Contact us (edited in UI)  won: database

-- LAGOON_ENVIRONMENT_TYPE=development
system.performance:css.preprocess      L1+ L2. L3- L4. L5.  0                          won: L1 config/default
environment_indicator.indicator:name   L1+ L2. L3- L4. L5+  Non-production             won: L5 env.settings
shield.settings:allow_cli              L1. L2. L3- L4+ L5.  TRUE                       won: L4 all+security
shield.settings:credentials.user       L1. L2+ L3- L4. L5.  preview                    won: L2 config/dev
webform.webform.contact:title          L1i L2i L3- L4. L5.  Contact us (edited in UI)  won: database

-- LAGOON_ENVIRONMENT_TYPE=production
system.performance:css.preprocess      L1+ L2- L3- L4. L5+  1                          won: L5 env.settings
environment_indicator.indicator:name   L1+ L2- L3- L4. L5+  Production                 won: L5 env.settings
shield.settings:allow_cli              L1. L2- L3- L4+ L5.  TRUE                       won: L4 all+security
shield.settings:credentials.user       L1. L2- L3- L4. L5.  (empty)                    won: database
webform.webform.contact:title          L1i L2- L3- L4. L5.  Contact us (edited in UI)  won: database

Effective values
key                                    local          development      production
system.performance:css.preprocess      0              0                1
environment_indicator.indicator:name   Non-production Non-production   Production
shield.settings:allow_cli              TRUE           TRUE             TRUE
shield.settings:credentials.user       localdev       preview          (empty)
webform.webform.contact:title          Contact us (edited in UI) Contact us (edited in UI) Contact us (edited in UI)
`,
  },

  keyPoints: [
    "GovCMS's settings.php is copied once from vendor/govcms/scaffold-tooling/drupal/settings/settings.php and does nothing but include, in order: all.settings.php, security.settings.php, lagoon.settings.php (if LAGOON), production.settings.php or development.settings.php, dev-mode.settings.php (if DEV_MODE=true), then project.settings.php and settings.local.php.",
    "There are only two environment branches. LAGOON_ENVIRONMENT_TYPE == 'production' loads production.settings.php; everything else, including every Lagoon branch environment, loads development.settings.php.",
    "Most platform decisions are $config[...] runtime overrides, not stored config: they win over the active store, never appear in drush config:export, and still look editable in the UI -- core only warns that the values are overridden and that overrides take precedence, so saving the form writes a stored value that goes on being ignored.",
    "Per-environment layering is three directories, not config_split: config/default imported fully, config/dev --partial when LAGOON_ENVIRONMENT_TYPE is not production, config/local --partial only when it is exactly 'local'. The step is gated on GOVCMS_DEPLOY_WORKFLOW_CONFIG=import.",
    "config_ignore 3.4.0 is bundled and installed by the profile (mode: simple, with webform.webform.*, system.menu.*, password_policy.*, seckit.settings, login_security.settings and clamav.settings ignored); config_split 2.0.2 is bundled but not installed and not on the managed_modules allowlist.",
    "An agency value belongs in a platform variable the distribution already reads (GOVCMS_HTTP_CLIENT_TIMEOUT, GOVCMS_CLI_MEMORY_LIMIT, GOVCMS_FILE_TEMP_MAX_AGE, CACHE_MAX_AGE) or in exported config; project.settings.php is the PaaS escape hatch, and on SaaS no PHP settings file from your repo is reachable at all.",
  ],

  interview: [
    {
      q: "A SaaS client needs a longer HTTP client timeout for a migration that calls a slow external API. Where does that setting go?",
      a: "Not into settings.php, because on SaaS `web/` is never built from the project repository -- `.docker/Dockerfile.saas` copies only `themes/`, `config` and `favicon.ico` into the image, so `project.settings.php` and `settings.local.php` are unreachable. The distribution has already parameterised this one: `all.settings.php` reads `GOVCMS_HTTP_CLIENT_TIMEOUT` and applies it to `$settings['http_client_config']['timeout']`, but only when the SAPI is CLI, which is exactly the migration case. So the change is a platform environment-variable request, not a code change. I'd check the same file for `GOVCMS_CLI_MEMORY_LIMIT` at the same time, because a long migration usually needs both. On PaaS I'd still prefer the variable over `project.settings.php`, since a variable does not have to survive a scaffold-tooling upgrade.",
    },
    {
      q: "A site builder changed a setting in the UI, exported it into config/default, deployed -- and the site still shows the old value. How do you diagnose that?",
      a: "There are two GovCMS-specific causes before you reach for anything generic. First, `config_ignore` is installed by the profile in `mode: simple` and ships ignores for `webform.webform.*`, `webform.webform_options.*`, `system.menu.*`, `password_policy.*`, `seckit.settings`, `login_security.settings` and `clamav.settings` -- for those, the import simply never touches the stored value, which is deliberate so editors' webforms and menus are not stomped on deploy. Second, and more common in practice, the key is a `$config[...]` override in one of the settings includes: `production.settings.php` alone pins error level, CSS/JS aggregation, page max-age, the environment indicator and `securitytxt.settings.enabled`. Overrides sit above the active store, so import succeeds and the read still returns the platform's value. `drush config:get <name> --include-overridden` against the same key with and without the flag separates the two cases in one step.",
    },
    {
      q: "Without config_split, how do you give a non-production environment different configuration from production?",
      a: "GovCMS replaces splits with three directories resolved by `govcms-config-import`, the 'Perform config import' post-rollout task in `.lagoon.yml`. `config/default` is a full `drush config:import -y` everywhere; `config/dev` is imported `--partial` whenever `LAGOON_ENVIRONMENT_TYPE` is not `production`; `config/local` is imported `--partial` only when it is exactly `local`, so a public branch environment can never pick up a developer's overrides. The scaffold's own README for those directories uses `shield.settings` as the worked example, which is the usual real case -- basic-auth on the dev URL, off on production. Two operational gotchas: the whole step is skipped unless `GOVCMS_DEPLOY_WORKFLOW_CONFIG` is `import`, and the script defaults an unset `LAGOON_ENVIRONMENT_TYPE` to `production`, so a badly configured container quietly gets production behaviour rather than dev.",
    },
    {
      q: "Walk me through what actually loads when a GovCMS container boots, and where a distribution upgrade could break a customisation you made.",
      a: "`web/sites/default/settings.php` was copied from scaffold-tooling once by the scaffold's `createRequiredFiles()` and only sets `$govcms_includes`, then includes `all.settings.php` and `security.settings.php` unconditionally, `lagoon.settings.php` when the `LAGOON` variable is present, then `production.settings.php` or `development.settings.php` on `LAGOON_ENVIRONMENT_TYPE`, then `dev-mode.settings.php` when `DEV_MODE` is `true`, and finally `project.settings.php` and `settings.local.php` if they exist. Everything except the last two lives in `vendor/`, so a `composer update` of scaffold-tooling replaces it wholesale -- that is the point, and it is why nothing agency-specific should ever be edited into those files. The one durable seam on PaaS is `project.settings.php`, and it is worth remembering that the docblock misspells it as \"settings.project.php\" while the executing code checks `project.settings.php`. On SaaS there is no seam at all, so the answer is always a platform variable or exported config.",
    },
  ],

  quiz: [
    {
      question:
        "In GovCMS's settings.php, which include runs first?",
      options: [
        "all.settings.php",
        "lagoon.settings.php",
        "security.settings.php",
        "production.settings.php",
      ],
      answerIndex: 0,
      explain:
        "The order is all.settings.php, then security.settings.php, then lagoon.settings.php (only when the LAGOON variable is set), then production.settings.php or development.settings.php, then dev-mode.settings.php, then project.settings.php and settings.local.php. all.settings.php goes first because it establishes config_sync_directory, the file paths and the container_yamls array everything else appends to.",
    },
    {
      question:
        "When does govcms-config-import perform the partial import from config/local?",
      options: [
        "On any non-production environment, alongside config/dev",
        "Whenever the directory contains at least one .yml file",
        "Only when LAGOON_ENVIRONMENT_TYPE is exactly 'local'",
        "On every environment, immediately after the full config/default import",
      ],
      answerIndex: 2,
      explain:
        "config/dev is gated on LAGOON_ENVIRONMENT_TYPE != production, but config/local is gated on it being exactly 'local'. The script's own comment says this is deliberate: public Lagoon dev, staging and branch environments must not pick up a developer's local-only overrides. Having YAML in the directory is necessary but not sufficient.",
    },
    {
      question:
        "Which statement about config_split on GovCMS 4.x is correct?",
      options: [
        "It is installed by the govcms profile and is the supported way to layer per-environment config",
        "It is not bundled at all, so a project adds it with composer require",
        "It is bundled and on the managed_modules allowlist, so a delegated role can enable it from the UI",
        "It is bundled at 2.0.2 but is not in the profile's install list and is not on the managed_modules allowlist",
      ],
      answerIndex: 3,
      explain:
        "The distribution pins drupal/config_split 2.0.2, so the code is present, but the profile does not install it and security.settings.php does not list it among managed_modules. config_ignore 3.4.0 is the opposite case: bundled, in the install list, and therefore always on. Layering is done with config/default, config/dev and config/local instead.",
    },
    {
      question:
        "A builder renames the production environment indicator in the UI, exports it to config/default and deploys. Production still reads 'Production'. Why?",
      options: [
        "config_ignore ships an ignore rule for environment_indicator.*",
        "production.settings.php sets $config['environment_indicator.indicator']['name'], a runtime override that outranks the active store",
        "Config import is skipped on production environments",
        "The environment_indicator module is uninstalled on production by govcms-enable_modules",
      ],
      answerIndex: 1,
      explain:
        "production.settings.php sets the indicator's name, background and foreground colours as $config overrides, and development.settings.php sets its own. Overrides are applied at read time, above the active store, so the import genuinely succeeded and the exported value is simply never read. config_ignore's shipped list does not mention environment_indicator, config import runs on production, and environment_indicator is one of the modules govcms-enable_modules force-enables every deploy.",
    },
  ],
};

export default lesson;
