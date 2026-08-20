import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "validators-and-the-module-allowlist",
  title: "Two Module Gates, and the Allowlist Behind Them",
  part: "The Compliance Gates",
  estMinutes: 13,
  summary:
    "Why govcms-validate-modules and govcms-validate-active-modules can report different failures from the same commit, and why neither of them is the thing that decides which modules your site is allowed to enable.",
  concept: `## Two module gates, two universes

On a Drupal site you own, "is this module enabled?" has exactly one answer: the \`module:\` key of \`core.extension\`, read from the active config store. GovCMS asks the question twice, from two different places, and the two answers can disagree about the same commit.

\`scripts/validate/govcms-validate-modules\` reads **exported configuration and nothing else**. It runs \`find\` for \`core.extension.yml\` under the config folder, then asks \`yq ".module.<name>"\` once per name. It never looks at \`web/modules\`, never looks at \`vendor/\`, never bootstraps Drupal. With no \`core.extension.yml\` anywhere it prints \`[info]: Configuration files not present. Couldn't find core.extension.yml file.\` and exits \`0\` — an empty config directory passes.

\`scripts/validate/govcms-validate-active-modules\` asks a running site instead: \`drush pm:list --status=enabled --format=json\`, then \`jq -r ".<name>"\` per name. Same names, different universe.

### The lists are short, and they are not Shipshape's

\`\`\`text
GOVCMS_REQUIRED_MODULES     httpav  govcms_security  lagoon_logs  tfa
GOVCMS_DISALLOWED_MODULES   dblog  module_permissions_ui  statistics  update
\`\`\`

Both scripts declare that same four-and-four. Shipshape's \`[FILE] Verify enabled modules\` and \`[DATABASE] Active modules audit\` declare longer versions — required adds \`govcms_akamai_purge\`; disallowed adds \`devel\` and \`redirect_404\` — both at \`severity: high\`. If you quote a list in an interview, name the file it came from.

### Four states, not two

A module name in a GovCMS repo can be:

- **enabled** — key in \`core.extension.yml\`, code on disk. The normal case.
- **present but disabled** — code shipped, no config key. The exported-config gate cannot see it at all; it only asks about names it already knows.
- **enabled but missing** — a \`module:\` key with no package behind it. Every module gate passes, and the deploy dies later at the \`Perform config import\` task.
- **enabled but not allowed** — key present, code present, name absent from the allowlist.

That last one is what people get wrong. **The validators do not restrict what you may enable.** They assert four names present and four names absent, and that is the whole assertion. What restricts the set is \`$config['module_permissions.settings']['managed_modules']\` in scaffold-tooling's \`drupal/settings/security.settings.php\` — 73 names, backed by contrib \`drupal/module_permissions\` — with \`module_permissions\` and \`module_permissions_ui\` listed in \`protected_modules\` so the gatekeeper cannot be switched off through itself.

### Only one of the two can repair

\`govcms-validate-active-modules\` honours a \`GOVCMS_REMEDIATE\` variable: when it is non-empty the script runs \`drush pm:enable\` or \`drush pm:disable\` instead of recording a failure. \`govcms-validate-modules\` has no such path — it cannot rewrite YAML, so it fails and hands you the remediation.

### The profile pair behaves identically

\`govcms-validate-profile\` reads \`yq '.profile'\` from \`core.extension.yml\` under \`config/default\`; \`govcms-validate-active-profile\` runs \`drush config:get core.extension --format=json | jq -r '.profile'\`. Anything other than \`govcms\` exits \`1\`. The file variant exits \`0\` with \`[info]: Configuration files not present.\` — the same "silence is a pass" behaviour, and the same trap.`,
  comparisons: [
    {
      label: "Adding a contrib module",
      intro:
        "On a site you control, requiring a package and enabling it is one uninterrupted sequence. On GovCMS the two halves are governed by different systems, and on SaaS the first half never reaches the running site at all.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal: require it, enable it, export it, commit the config.
composer require drupal/entity_print
drush pm:enable entity_print -y
drush config:export -y
git add config/sync/core.extension.yml
git commit -m "Enable entity_print for PDF rendering"

# The only gate is your own CI, and you wrote it.
drush config:status --format=table`,
      ts: `# GovCMS SaaS: composer require changes nothing that ships.
# .docker/Dockerfile.saas copies only three things into the image:
#   COPY themes/ /app/web/themes/custom
#   COPY config /app/config
#   COPY favicon.ico /app/web

# So the module must already exist in the distribution AND be on the
# allowlist before a delegated role can turn it on:
grep -n "'entity_print'" \\
  vendor/govcms/scaffold-tooling/drupal/settings/security.settings.php
# (no match -- it is not in managed_modules)

grep -n "'minisite'" \\
  vendor/govcms/scaffold-tooling/drupal/settings/security.settings.php
# 59:  'minisite',

ahoy drush pm:enable minisite -y
ahoy drush config:export -y
vendor/bin/govcms-validate-modules`,
      note: "managed_modules is the gate on enablement; the validators only assert eight fixed names. A module can be bundled, allowlisted and still off — that is the default state for most of the 73.",
    },
    {
      label: "Asking whether a module is enabled",
      intro:
        "Vanilla Drupal gives you one authoritative answer and a supported way to act on it. GovCMS gives you two answers from two scripts, and only one of them is allowed to change anything.",
      leftLang: "php",
      rightLang: "bash",
      php: `<?php

/**
 * Vanilla Drupal: one source of truth, enforced from a deploy hook.
 */
function mysite_core_deploy_require_modules(): string {
  $required = ['dblog', 'syslog', 'redis'];
  $handler = \\Drupal::service('module_handler');
  $installer = \\Drupal::service('module_installer');

  $missing = [];
  foreach ($required as $name) {
    if (!$handler->moduleExists($name)) {
      $missing[] = $name;
    }
  }

  if (empty($missing)) {
    return 'All required modules already enabled.';
  }

  $installer->install($missing);
  return 'Enabled: ' . implode(', ', $missing);
}`,
      ts: `# GovCMS ships the check, not the fix -- and ships it twice.

# 1. Exported configuration only. yq over core.extension.yml.
vendor/bin/govcms-validate-modules
# GovCMS Validate :: Verify enabled modules
# [fail]: 'tfa' is required
# [fail]: 'dblog' cannot be enabled
# [fail]: Modules are in invalid states        (exit 1)

# 2. The live site. drush pm:list --status=enabled --format=json.
vendor/bin/govcms-validate-active-modules
# GovCMS Validate :: Active modules validation
# [fail]: 'tfa' is not enabled                 (exit 1)

# Only the second one has a repair path, and only when asked:
GOVCMS_REMEDIATE=1 vendor/bin/govcms-validate-active-modules
# runs drush pm:enable tfa -y instead of recording a failure`,
      note: "The first script cannot rewrite YAML, so it can only fail. GOVCMS_REMEDIATE exists on the active-modules validator alone — repairing the database does not repair your exported config, so the file gate will still fail on the next commit.",
    },
    {
      label: "The exported core.extension.yml",
      intro:
        "Same file, same format, both committed to git. The difference is that on GovCMS four names in the module map are a build failure and the profile key is asserted by a second pair of scripts.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/sync/core.extension.yml on a site you control.
# dblog is normal here -- it is how you read the log at 2am.
_core:
  default_config_hash: xtvcMBiJPRW4kRWZ0e1cvfDpAlHz0LlXaJz9Bh5vMOw
module:
  dblog: 0
  node: 0
  path_alias: 0
  redis: 0
  syslog: 0
  system: 0
  update: 0
  user: 0
  views: 0
profile: standard
theme:
  claro: 0
  olivero: 0`,
      ts: `# config/default/core.extension.yml on GovCMS.
# dblog and update are in GOVCMS_DISALLOWED_MODULES, so either key
# here is "[fail]: '<name>' cannot be enabled" and exit 1.
# Logging goes to lagoon_logs; core updates are the platform's job.
module:
  govcms_security: 0
  httpav: 0
  lagoon_logs: 0
  node: 0
  path_alias: 0
  system: 0
  tfa: 0
  user: 0
  views: 0
profile: govcms
theme:
  claro: 0
  olivero: 0`,
      note: "Four disallowed names: dblog, module_permissions_ui, statistics, update. The profile key is checked separately — govcms-validate-profile fails on anything but govcms, and prints the value it found.",
    },
    {
      label: "Guaranteeing a module stays on",
      intro:
        "Making a module non-optional is a normal Drupal problem with a normal Drupal solution. GovCMS solves it for its own modules by re-enabling them on every rollout, and gives you no equivalent lever.",
      leftLang: "yaml",
      rightLang: "bash",
      php: `# web/modules/custom/mysite_core/mysite_core.info.yml
# Depend on it and Drupal will not let anyone uninstall it
# while mysite_core is enabled.
name: 'My Site Core'
type: module
description: 'Site-wide dependencies and deploy hooks.'
core_version_requirement: ^11
package: 'My Site'
dependencies:
  - drupal:syslog
  - drupal:dblog
  - redis:redis
  - stage_file_proxy:stage_file_proxy`,
      ts: `# GovCMS: on SaaS you own no custom module, so dependencies are not
# available to you. The platform enforces its own set instead, from
# post-rollout task 7 (scripts/deploy/govcms-enable_modules):

PLATFORM_MODULES=(redis fast404 httpav robotstxt lagoon_logs \\
  environment_indicator govcms_security govcms_akamai_purge)

MODULES=$(drush pm:list --status=enabled)
for MODULE in "\${PLATFORM_MODULES[@]}"; do
  if [[ $(echo "$MODULES" | grep -c "$MODULE") -eq 0 ]]; then
    MODULE_LIST="$MODULE_LIST $MODULE"
  fi
done
drush pm:enable $MODULE_LIST -y

# Off production it also enables stage_file_proxy and uninstalls
# google_tag. Nothing here consults your exported config.`,
      note: "Uninstalling a platform module survives exactly until the next deploy. Your own required set gets asserted, never restored — govcms-validate-modules exits 1 and hands you the remediation, nothing more. It ships in vendor/bin and is executed by vendor/bin/govcms-ship-shape; the check that actually gates a SaaS rollout is the .lagoon.yml post-rollout task 'Perform GovCMS platform validations', which runs Shipshape.",
    },
  ],
  playground: {
    intro:
      "One repository state, read by two gates through different windows. Watch the two reports fail on completely different modules — and note which module appears in both, with a different severity and a different fix.",
    lang: "php",
    code: `<?php

// One repository state. Two gates read it through different windows.
$on_disk = ['httpav', 'govcms_security', 'lagoon_logs', 'tfa', 'webform', 'entity_print', 'devel', 'dblog'];
$exported = ['httpav', 'govcms_security', 'lagoon_logs', 'webform', 'entity_print', 'dblog', 'minisite'];

// The four-and-four both validator scripts declare.
$required = ['httpav', 'govcms_security', 'lagoon_logs', 'tfa'];
$disallowed = ['dblog', 'module_permissions_ui', 'statistics', 'update'];
// A slice of managed_modules from security.settings.php.
$managed = ['webform', 'minisite', 'redirect', 'pathauto', 'govcms_dlm'];

function classify(string $m, array $disk, array $cfg): string {
  $d = in_array($m, $disk, TRUE);
  $c = in_array($m, $cfg, TRUE);
  if ($d && $c) {
    return 'enabled';
  }
  return $d ? 'present-but-disabled' : 'enabled-but-missing';
}

// Gate 1: govcms-validate-modules. Sees core.extension.yml, nothing else.
function gate_exported(array $cfg, array $req, array $bad): array {
  $rows = [];
  foreach ($req as $m) {
    if (!in_array($m, $cfg, TRUE)) {
      $rows[] = ['fail', $m, 'required, no module key', 'drush pm:enable ' . $m . ' -y; drush cex'];
    }
  }
  foreach ($bad as $m) {
    if (in_array($m, $cfg, TRUE)) {
      $rows[] = ['fail', $m, 'disallowed, module key present', 'drush pm:uninstall ' . $m . ' -y; drush cex'];
    }
  }
  return $rows;
}

// Gate 2: reconcile the shipped codebase against that same exported list.
function gate_codebase(array $all, array $disk, array $cfg, array $req, array $bad, array $ok): array {
  $rows = [];
  foreach ($all as $m) {
    $class = classify($m, $disk, $cfg);
    if ($class === 'enabled-but-missing') {
      $rows[] = ['fail', $m, 'config key, no code on disk', 'composer require it, or drop the key'];
    }
    elseif ($class === 'present-but-disabled') {
      $rows[] = ['warn', $m, 'code on disk, no config key', 'gate 1 sees this only if it is listed'];
    }
    elseif (!in_array($m, $ok, TRUE) && !in_array($m, $req, TRUE) && !in_array($m, $bad, TRUE)) {
      $rows[] = ['fail', $m, 'enabled, not on managed_modules', 'uninstall, or raise it with GovCMS'];
    }
  }
  return $rows;
}

$all = array_values(array_unique(array_merge($on_disk, $exported)));
sort($all);

printf("GovCMS module gates :: one repo state, two reports\\n\\n");
printf("%-14s %-8s %-9s %s\\n", 'MODULE', 'ON-DISK', 'EXPORTED', 'CLASS');
foreach ($all as $m) {
  printf("%-14s %-8s %-9s %s\\n", $m, in_array($m, $on_disk, TRUE) ? 'yes' : 'no',
    in_array($m, $exported, TRUE) ? 'yes' : 'no', classify($m, $on_disk, $exported));
}

$reports = [
  'GATE 1  govcms-validate-modules  (yq over core.extension.yml)' => gate_exported($exported, $required, $disallowed),
  'GATE 2  codebase reconcile  (disk + managed_modules)' => gate_codebase($all, $on_disk, $exported, $required, $disallowed, $managed),
];

foreach ($reports as $title => $rows) {
  printf("\\n%s\\n", $title);
  foreach ($rows as $r) {
    printf("  [%s] %-14s %-32s -> %s\\n", $r[0], $r[1], $r[2], $r[3]);
  }
  $fails = count(array_filter($rows, fn(array $r): bool => $r[0] === 'fail'));
  printf("  exit %d  (%d fail, %d warn)\\n", $fails > 0 ? 1 : 0, $fails, count($rows) - $fails);
}`,
    output: `GovCMS module gates :: one repo state, two reports

MODULE         ON-DISK  EXPORTED  CLASS
dblog          yes      yes       enabled
devel          yes      no        present-but-disabled
entity_print   yes      yes       enabled
govcms_security yes      yes       enabled
httpav         yes      yes       enabled
lagoon_logs    yes      yes       enabled
minisite       no       yes       enabled-but-missing
tfa            yes      no        present-but-disabled
webform        yes      yes       enabled

GATE 1  govcms-validate-modules  (yq over core.extension.yml)
  [fail] tfa            required, no module key          -> drush pm:enable tfa -y; drush cex
  [fail] dblog          disallowed, module key present   -> drush pm:uninstall dblog -y; drush cex
  exit 1  (2 fail, 0 warn)

GATE 2  codebase reconcile  (disk + managed_modules)
  [warn] devel          code on disk, no config key      -> gate 1 sees this only if it is listed
  [fail] entity_print   enabled, not on managed_modules  -> uninstall, or raise it with GovCMS
  [fail] minisite       config key, no code on disk      -> composer require it, or drop the key
  [warn] tfa            code on disk, no config key      -> gate 1 sees this only if it is listed
  exit 1  (2 fail, 2 warn)
`,
  },
  keyPoints: [
    "govcms-validate-modules reads exported configuration only: find for core.extension.yml, then yq \".module.<name>\". It never scans web/modules, vendor/ or the database — and with no config file it prints \"[info]: Configuration files not present. Couldn't find core.extension.yml file.\" and exits 0.",
    "govcms-validate-active-modules asks a live site through drush pm:list --status=enabled --format=json and jq. Same names, different universe, so the two scripts can disagree about the same commit.",
    "Both scripts declare the same four-and-four: required httpav, govcms_security, lagoon_logs, tfa; disallowed dblog, module_permissions_ui, statistics, update.",
    "Shipshape's module checks are longer and belong to a different file: required adds govcms_akamai_purge, disallowed adds devel and redirect_404, both at severity high. Name the source whenever you quote a list.",
    "Neither validator restricts what a site may enable. That is $config['module_permissions.settings']['managed_modules'] in scaffold-tooling's drupal/settings/security.settings.php — 73 names from contrib drupal/module_permissions, with module_permissions and module_permissions_ui in protected_modules.",
    "The profile pair mirrors the module pair: govcms-validate-profile runs yq '.profile' over config/default/core.extension.yml, govcms-validate-active-profile runs drush config:get core.extension --format=json | jq -r '.profile'. Anything but govcms exits 1; a missing config file exits 0.",
  ],
  interview: [
    {
      q: "You ran govcms-validate-modules and it passed, but the Lagoon deploy died at 'Perform config import'. How is that possible?",
      a: "Because the validator never checks that the code exists. It reads `config/default/core.extension.yml` with `yq` and asks only two questions about eight fixed names: are the four required ones listed, and are the four disallowed ones absent. A `module:` key for a package that is not installed satisfies both questions perfectly, so the gate is green and `drush config:import` is the first thing that actually tries to resolve the module and fails. In practice this is what a stale export looks like — someone enabled something locally, exported, then the package was removed or never made it into the SaaS image, which copies only `themes/`, `config/` and `favicon.ico`. The fix is to diff the exported module map against what the built image really has before you push, not to trust the validator's exit code.",
    },
    {
      q: "A client's repo has drupal/devel in composer.json. Does that fail the GovCMS build?",
      a: "Not through the module validators — `devel` is not in `GOVCMS_DISALLOWED_MODULES`, which is exactly `dblog`, `module_permissions_ui`, `statistics` and `update`. It *is* in Shipshape's `[FILE] Verify enabled modules` and `[DATABASE] Active modules audit` disallowed lists, both at `severity: high`. Only the `[FILE]` half actually runs on GovCMS — every invocation passes `--exclude-db` — so what fails the deploy is `devel` appearing as enabled in the exported `config/default/core.extension.yml`, not anything in composer.json. A module enabled only in the live database is the `[DATABASE]` twin's job, and that twin is declared but excluded. Present in the codebase and never enabled is invisible to every module gate. On SaaS it is also moot for a different reason: the Dockerfile copies three paths, and `vendor/` is not one of them.",
    },
    {
      q: "What actually stops a site builder from enabling any module they like on a GovCMS SaaS site?",
      a: "The `module_permissions` contrib module, configured from scaffold-tooling's `drupal/settings/security.settings.php`. It sets `$config['module_permissions.settings']['managed_modules']` to 73 names, and `protected_modules` to `module_permissions` and `module_permissions_ui` so the gatekeeper cannot be disabled through itself. Separately it sets a four-item `permission_blacklist` — `administer modules`, `administer permissions`, `administer search_api`, `assign all roles` — which is a different list from the nine permissions `govcms-validate-active-permissions` checks. The validators are downstream of all of that: they assert eight fixed names, they do not enumerate what is permitted. Getting this ordering right is the single clearest signal that someone has operated the platform rather than read about it.",
    },
    {
      q: "CI reports \"[fail]: 'tfa' is not enabled\". What is your remediation, and what would you avoid doing?",
      a: "Enable it on the site and re-export, so both gates agree: `ahoy drush pm:enable tfa -y`, then `ahoy drush config:export -y`, then commit `config/default/core.extension.yml` plus `tfa.settings.yml`. You can also let the active-modules validator repair itself by setting `GOVCMS_REMEDIATE`, which makes it run `drush pm:enable` instead of recording a failure — but that only touches the database, so the next run of `govcms-validate-modules` against your unchanged export still fails. What I would avoid is hand-editing the module map into `core.extension.yml` without enabling the module, because that gets you a green module gate and a config import failure on rollout. And enabling `tfa` is only half of it: both TFA validators also assert `enabled` is truthy and `required_roles.authenticated` equals `authenticated`.",
    },
  ],
  quiz: [
    {
      question: "What does govcms-validate-modules inspect to decide whether a module is enabled?",
      options: [
        "The contents of web/modules and vendor/ on disk",
        "The live database, via drush pm:list --status=enabled",
        "Exported configuration only — core.extension.yml, read with yq",
        "composer.lock, to confirm the package is installed",
      ],
      answerIndex: 2,
      explain:
        "It runs find for core.extension.yml under the config folder and then yq \".module.<name>\" per name. The database variant is the separate govcms-validate-active-modules script, which uses drush pm:list and jq.",
    },
    {
      question: "A repository has no exported configuration at all. What does govcms-validate-modules do?",
      options: [
        "Prints \"[info]: Configuration files not present. Couldn't find core.extension.yml file.\" and exits 0",
        "Exits 1, because all four required modules are missing",
        "Falls back to querying the database through drush",
        "Exits 2, matching Shipshape's failure exit code",
      ],
      answerIndex: 0,
      explain:
        "Silence is a pass. With no core.extension.yml the script reports the info line and exits 0 — the same behaviour govcms-validate-profile has, which is why an empty or misplaced config directory sails through this gate.",
    },
    {
      question: "Which module is on Shipshape's disallowed list but NOT in GOVCMS_DISALLOWED_MODULES?",
      options: [
        "statistics",
        "update",
        "module_permissions_ui",
        "devel",
      ],
      answerIndex: 3,
      explain:
        "The validator scripts disallow exactly dblog, module_permissions_ui, statistics and update. Shipshape's module checks add devel and redirect_404, and add govcms_akamai_purge to the required side. Two different files, two different lists.",
    },
    {
      question: "Which mechanism actually restricts the set of modules a GovCMS site may enable?",
      options: [
        "GOVCMS_REQUIRED_MODULES in the validator scripts",
        "$config['module_permissions.settings']['managed_modules'] in security.settings.php",
        "The required list in shipshape.yml's [FILE] Verify enabled modules check",
        "The govcms profile's own dependencies key",
      ],
      answerIndex: 1,
      explain:
        "The validators and Shipshape assert a handful of fixed names present or absent — they never enumerate what is permitted. The 73-name managed_modules list, backed by contrib drupal/module_permissions, is the allowlist. The profile's dependencies key holds only govcms_security.",
    },
  ],
};

export default lesson;
