import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "config-split",
  title: "config_split: Per-Environment Configuration",
  part: "Everyday Workflow",
  estMinutes: 13,
  summary:
    "How the config_split module carves environment-only modules and settings out of the shared sync directory, why it needs both a storage transformation and a settings.php status override to work, and where a half-configured split silently deletes config on the next import.",

  concept: `
## The problem

Your four-person team has \`devel\`, \`webprofiler\` and \`stage_file_proxy\`
enabled locally. \`drush cex\` writes \`core.extension\` — which lists every
enabled module — into \`../config/sync\`. That file is committed. The next
deploy runs \`drush cim\` on production and dutifully installs the developer
toolbar on your public site. Core has no notion of environments: there is one
sync directory and one active configuration.

In Symfony this is a solved, boring problem. \`config/packages/dev/\` is loaded
only when \`APP_ENV=dev\`, \`config/bundles.php\` maps each bundle to the
environments it belongs in, and nobody thinks about it again. Drupal has no
equivalent in core, so the community built one: **config_split**.

## What a split is

A split is a config entity — \`config_split.config_split.dev\` — with a folder
and three inclusion lists:

\`\`\`yaml
id: dev
folder: ../config/dev
module:
  devel: 0
  stage_file_proxy: 0
complete_list:
  - devel.settings
  - stage_file_proxy.settings
partial_list:
  - system.logging
stackable: false
no_patching: false
\`\`\`

- **module** — extensions removed from the shared \`core.extension\` and
  recorded in the split instead.
- **complete_list** (a *complete* split) — the item leaves \`../config/sync\`
  entirely and lives only in the split folder. Use it for config that has no
  business existing on prod at all.
- **partial_list** (a *conditional* split) — the item stays in sync with the
  shared value, and the split folder carries the environment's differing
  version. Use it when every environment needs the item but with a different
  value, e.g. \`system.logging.error_level\`.

Reach for a complete split for whole modules and their settings; reach for a
conditional split when you are tweaking one key of something everyone has.

## How it plugs in

Two independent mechanisms, and you need both:

1. **Storage transformation.** Core dispatches events while building the
   export and import storages (\`config.storage.export\` is assembled by
   \`ExportStorageManager\`). config_split subscribes to those transform
   events, so plain \`drush cex\` / \`drush cim\` already honour active splits —
   you do not need a special export command.
2. **Activation.** A split's \`status\` is read through the config factory,
   which means core's \`settings.php\` override layer can flip it:

\`\`\`php
// settings.local.php, never committed to the prod artifact
$config['config_split.config_split.dev']['status'] = TRUE;
\`\`\`

The exported \`status\` stays \`false\` for everyone; each environment turns on
what it needs. \`drush cget config_split.config_split.dev --include-overridden\`
tells you what is actually in effect.

## Where it bites

The classic failure is a **half-configured split**: the folder does not exist,
is not writable, or is outside the deployment artifact. \`drush cex\` reports
success, the split's items vanish from \`../config/sync\` — and because
\`cim\` treats "absent from sync" as *delete*, the next production import
removes that config for real. Always \`git status\` after the first export of a
new split and confirm files landed in both directories.

Layering config_split with **config_ignore** is the other trap: both rewrite
the same storages via the same event, so the outcome depends on subscriber
order. Pick one tool per config item and write down which.
`,

  comparisons: [
    {
      label: "Debug tooling that must never reach prod",
      intro:
        "A profiler/toolbar belongs on dev only. Symfony expresses that with a per-environment config directory; Drupal expresses it as a split entity that owns the module and its settings.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/dev/web_profiler.yaml
web_profiler:
  toolbar: true
  intercept_redirects: false

framework:
  profiler:
    only_exceptions: false

# config/bundles.php (PHP, shown for context):
#   WebProfilerBundle::class => ['dev' => true, 'test' => true],
#
# APP_ENV=prod simply never loads this directory,
# and the bundle is never registered.`,
      ts: `# config/sync/config_split.config_split.dev.yml
uuid: 5b0c9b21-9a1e-4f1c-8b0e-2d7a4c1f0e33
langcode: en
status: false
dependencies: {  }
id: dev
label: Dev
description: 'Developer tooling, never on stage or prod.'
weight: 0
stackable: false
no_patching: false
storage: folder
folder: ../config/dev
module:
  devel: 0
  webprofiler: 0
  stage_file_proxy: 0
theme: {  }
complete_list:
  - devel.settings
  - stage_file_proxy.settings
partial_list: {  }`,
      note:
        "status: false is correct in the committed file — the split is inert until an environment overrides it. Never commit status: true unless you want that split active everywhere.",
    },
    {
      label: "Selecting the environment",
      intro:
        "Symfony picks an environment from one variable and everything follows. Drupal has no environment concept, so you write the condition yourself in settings.php and flip split statuses explicitly.",
      leftLang: "bash",
      rightLang: "php",
      php: `# .env.local on a laptop
APP_ENV=dev
APP_DEBUG=1

# On the production host (env var, not a file)
APP_ENV=prod
APP_DEBUG=0

# Nothing else to declare: the kernel loads
# config/packages/, then config/packages/$APP_ENV/.`,
      ts: `<?php
// sites/default/settings.php — committed.
$settings['config_sync_directory'] = '../config/sync';

// Every split is off unless an environment says otherwise.
$config['config_split.config_split.dev']['status'] = FALSE;
$config['config_split.config_split.prod']['status'] = FALSE;

// Hosting providers expose an environment marker; use it.
if (getenv('APP_ENV') === 'prod') {
  $config['config_split.config_split.prod']['status'] = TRUE;
}

// Uncommitted, laptop-only.
if (file_exists($app_root . '/' . $site_path . '/settings.local.php')) {
  include $app_root . '/' . $site_path . '/settings.local.php';
}
// settings.local.php:
//   $config['config_split.config_split.dev']['status'] = TRUE;`,
      note:
        "Set every split explicitly to FALSE first, then switch on the one you want — an if/else chain that falls through leaves whatever the exported entity said.",
    },
    {
      label: "One value that differs per environment",
      intro:
        "Not everything is a whole module. Error verbosity exists everywhere but must differ — that is a conditional split, not a complete one.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/monolog.yaml  (shared baseline)
monolog:
  handlers:
    main:
      type: fingers_crossed
      action_level: error

# config/packages/dev/monolog.yaml  (overrides one key)
monolog:
  handlers:
    main:
      type: stream
      level: debug`,
      ts: `# config/sync/system.logging.yml  (shared baseline, ships to prod)
error_level: hide

# The dev split lists it as conditional:
#   partial_list:
#     - system.logging

# config/dev/config_split.patch.system.logging.yml (written by the split)
adding:
  error_level: verbose
removing:
  error_level: hide

# Prod import: sync value wins -> hide
# Dev import with the split active: the patch is applied -> verbose`,
      note:
        "config_split 2.x stores conditional splits as a diff against the sync value, in a config_split.patch.NAME file; set no_patching: true to get the 1.x behaviour of a full copy. A complete split here would be wrong: system.logging would disappear from sync, so any environment without a split would lose the setting entirely.",
    },
    {
      label: "Export and deploy",
      intro:
        "The daily commands. Note that config_split needs no special export command — it transforms the storage that cex and cim already use.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Developer changes a dev-only setting
vim config/packages/dev/web_profiler.yaml
git add config/packages/dev/
git commit -m "Tune profiler"

# Deploy
composer install --no-dev --optimize-autoloader
php bin/console cache:clear --env=prod
php bin/console doctrine:migrations:migrate --no-interaction`,
      ts: `# Laptop: confirm the dev split really is active
drush cget config_split.config_split.dev status --include-overridden
# 'config_split.config_split.dev:status': true

drush cex -y
git status --short
#  M config/sync/system.site.yml
#  M config/dev/devel.settings.yml
git add config/sync config/dev && git commit -m "Site name + devel tweak"

# Deploy (prod: dev split inactive)
composer install --no-dev --optimize-autoloader
drush updatedb -y
drush cim -y
drush cache:rebuild`,
      note:
        "There is no config-split:status command. Check activation with core's cget, as above; the module's own drush config-split:status-override dev reads and writes a State-based override, which is a separate mechanism from the $config[...]['status'] line in settings.php. Both directories must be staged: committing only config/sync is how a split's changes go missing and how the next import deletes them.",
    },
  ],

  playground: {
    intro:
      "A miniature config_split. Given the active configuration, the current sync directory and one split definition, work out what gets written where — and what production ends up with when the split is inactive.",
    lang: "php",
    code: `<?php
// A miniature config_split: decide what each export destination receives.

// What is actually in the database on the developer's laptop.
$active = [
  'core.extension' => ['module' => ['dblog', 'devel', 'node', 'stage_file_proxy']],
  'system.site' => ['name' => 'Acme', 'mail' => 'web@acme.test'],
  'system.logging' => ['error_level' => 'verbose'],
  'devel.settings' => ['error_handlers' => [2]],
  'stage_file_proxy.settings' => ['origin' => 'https://acme.test'],
];

// What ../config/sync already holds (committed, shared by the whole team).
$sync = [
  'core.extension' => ['module' => ['dblog', 'node']],
  'system.site' => ['name' => 'Acme', 'mail' => 'web@acme.test'],
  'system.logging' => ['error_level' => 'hide'],
];

// config_split.config_split.dev
$split = [
  'id' => 'dev',
  'folder' => '../config/dev',
  'module' => ['devel', 'stage_file_proxy'],
  'complete_list' => ['devel.settings', 'stage_file_proxy.settings'],
  'partial_list' => ['system.logging'],
];

$toSync = [];
$toSplit = [];

foreach ($active as $name => $data) {
  if (in_array($name, $split['complete_list'], TRUE)) {
    // Complete split: leaves ../config/sync altogether.
    $toSplit[$name] = $data;
    continue;
  }
  if (in_array($name, $split['partial_list'], TRUE)) {
    // Conditional split: only travels if it differs from the shared baseline.
    // Simplified: real config_split 2.x writes a diff to
    // config_split.patch.NAME instead of the whole item. Same decision, and
    // the same value ends up applied - only the file shape differs.
    if (($sync[$name] ?? NULL) !== $data) {
      $toSplit[$name] = $data;
    }
    $toSync[$name] = $sync[$name] ?? $data;
    continue;
  }
  $toSync[$name] = $data;
}

// The split's modules are stripped out of the shared core.extension.
$toSync['core.extension']['module'] = array_values(
  array_diff($toSync['core.extension']['module'], $split['module'])
);

echo "--- ../config/sync (shipped to prod) ---\\n";
foreach ($toSync as $name => $data) {
  echo "  " . $name . ": " . json_encode($data, JSON_UNESCAPED_SLASHES) . "\\n";
}

echo "--- " . $split['folder'] . " (only when the dev split is active) ---\\n";
foreach ($toSplit as $name => $data) {
  echo "  " . $name . ": " . json_encode($data, JSON_UNESCAPED_SLASHES) . "\\n";
}

echo "--- effective on prod (dev split inactive) ---\\n";
echo "  modules: " . implode(', ', $toSync['core.extension']['module']) . "\\n";
echo "  system.logging.error_level: " . $toSync['system.logging']['error_level'] . "\\n";
echo "  devel.settings: " . (isset($toSync['devel.settings']) ? 'present' : 'absent') . "\\n";
`,
    output: `--- ../config/sync (shipped to prod) ---
  core.extension: {"module":["dblog","node"]}
  system.site: {"name":"Acme","mail":"web@acme.test"}
  system.logging: {"error_level":"hide"}
--- ../config/dev (only when the dev split is active) ---
  system.logging: {"error_level":"verbose"}
  devel.settings: {"error_handlers":[2]}
  stage_file_proxy.settings: {"origin":"https://acme.test"}
--- effective on prod (dev split inactive) ---
  modules: dblog, node
  system.logging.error_level: hide
  devel.settings: absent
`,
  },

  keyPoints: [
    "A split is a config entity (config_split.config_split.NAME) with a folder plus three inclusion lists: module, complete_list and partial_list.",
    "Complete splits remove the item from the shared sync directory entirely; conditional splits leave the shared value in sync and put the environment's differing value in the split folder.",
    "config_split subscribes to core's config storage transformation events, so ordinary drush cex and drush cim honour active splits with no special command.",
    "Activation happens through core's settings.php override layer: $config['config_split.config_split.dev']['status'] = TRUE; the exported entity stays status: false.",
    "Set every split to FALSE in committed settings.php, then switch on exactly one per environment — never rely on the exported status value.",
    "A split pointing at a missing, unwritable or uncommitted folder loses config silently, and the next drush cim deletes it from the target environment because absent-from-sync means delete.",
  ],

  interview: [
    {
      q: "Your production site keeps getting the devel module installed after every deploy. Walk me through the fix.",
      a: "The cause is that `core.extension` is a single exported file listing every enabled module, so whatever is on the machine that ran `drush cex` becomes the shared truth. The fix is a **config_split** dev split: create `config_split.config_split.dev`, point it at `../config/dev`, add `devel` (and friends) to its `module` list and `devel.settings` to `complete_list`. Commit the split entity with `status: false`, and turn it on only in an uncommitted `settings.local.php` with `$config['config_split.config_split.dev']['status'] = TRUE;`. Re-export from a laptop with the split active — `devel` disappears from `config/sync/core.extension.yml` and lands in the split folder instead. After that, `drush cim` on production has nothing to install.",
    },
    {
      q: "What is the difference between a complete split and a conditional split, and when would you choose each?",
      a: "A **complete split** takes the config item out of the shared sync directory altogether — it exists only in the split folder, so any environment without that split active simply does not have it. That is right for things that should not exist on prod at all: `devel.settings`, `stage_file_proxy.settings`, a debug-only view. A **conditional split** (the `partial_list`) leaves the item in sync with the shared baseline value and puts the environment-specific version in the split folder, so every environment still gets the item but with a different value — `system.logging.error_level`, a mail transport, an API base URL. The mistake to avoid is using a complete split for something universal like `system.logging`: it vanishes from sync and any environment without a matching split loses it.",
    },
    {
      q: "How does config_split actually make drush cex and drush cim behave differently, and why is settings.php still involved?",
      a: "Two separate mechanisms. Core builds its export and import storages through managers that dispatch storage **transformation** events (the export storage is assembled by `ExportStorageManager` behind the `config.storage.export` service), and config_split subscribes to those events to move items between the sync directory and split folders. That is why the ordinary `drush cex` / `drush cim` commands already do the right thing — there is no special export command to remember. Separately, a split's `status` is read through the config factory, so core's `settings.php` global override layer decides whether a split is active in this environment. Verify with `drush cget config_split.config_split.dev --include-overridden`, since the value in the exported YAML is not the value in effect.",
    },
    {
      q: "A Symfony developer says this is all much simpler in Symfony. Do you agree?",
      a: "Yes, and I'd say so plainly. `config/packages/dev/` versus `config/packages/prod/` is native, declarative and needs no contributed module, no folder wiring and no per-environment status flag; `config/bundles.php` covers the enable-this-bundle-only-in-dev case in one line. Drupal's constraint is that configuration lives in the database as the source of truth and is exported to one flat directory, so environment layering has to be bolted on by rewriting the export and import storages. config_split does that well, but it has more moving parts and more failure modes — a wrong folder, a split left active on prod, an interaction with config_ignore. Knowing that difference matters because it tells you to keep the number of splits small and to review split diffs carefully in code review.",
    },
  ],

  quiz: [
    {
      question:
        "You commit config_split.config_split.dev.yml with `status: true`. What happens on production?",
      options: [
        "Nothing — production ignores exported split statuses.",
        "The dev split is active on production unless settings.php explicitly overrides status to FALSE, so dev-only config is applied there.",
        "drush cim refuses to import and reports a split conflict.",
        "The split folder is deleted on production during import.",
      ],
      answerIndex: 1,
      explain:
        "The exported status is the default value for every environment. Only a settings.php override changes it, so a committed `status: true` makes the split active everywhere that does not turn it off. Commit splits as `status: false` and activate per environment.",
    },
    {
      question:
        "You want `system.logging.error_level` to be `verbose` on dev and `hide` on prod. Which list does it belong in?",
      options: [
        "complete_list on the dev split",
        "the module list on the dev split",
        "partial_list on the dev split (a conditional split)",
        "It cannot be split; use config_ignore instead.",
      ],
      answerIndex: 2,
      explain:
        "Every environment needs `system.logging`, only its value differs — that is exactly a conditional split. A complete split would remove the item from config/sync entirely, so environments without the split would lose the setting.",
    },
    {
      question:
        "A teammate adds a split whose folder path does not exist in the repository, exports, and commits. What is the most likely production symptom?",
      options: [
        "drush cim fails fast with a missing-directory error, so nothing breaks.",
        "The split's config items are gone from config/sync, so drush cim deletes that configuration on production.",
        "Production silently keeps its current values for those items.",
        "core.extension is rebuilt from the database, so modules stay installed.",
      ],
      answerIndex: 1,
      explain:
        "The export removes split items from the sync directory whether or not the split folder is usable or committed. Since `drush cim` treats 'present in active but absent from sync' as a delete, the configuration is removed on the target environment. Always check `git status` after the first export of a new split.",
    },
    {
      question:
        "Which statement about how config_split integrates with Drupal's config system is correct?",
      options: [
        "You must replace drush cex/cim with dedicated config-split commands; the core commands ignore splits.",
        "It rewrites config/sync files with a post-commit git hook.",
        "It subscribes to core's config storage transformation events, so the normal export and import storages already account for active splits.",
        "It patches core.extension.yml at request time via hook_preprocess.",
      ],
      answerIndex: 2,
      explain:
        "Core dispatches transformation events while assembling the export and import storages (the export side is built by `ExportStorageManager` behind `config.storage.export`). config_split hooks into those, which is why plain `drush cex` and `drush cim` respect active splits.",
    },
  ],
};

export default lesson;
