import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "config-dependencies",
  title: "Config Dependencies & Import Order",
  part: "The Configuration System",
  estMinutes: 13,
  summary:
    "Every config entity carries a dependencies block, and that block — not the filename, not your commit order — decides what imports first, what dies when a module is uninstalled, and whether drush cim refuses to run at all.",

  concept: `
## The block you have been scrolling past

Open any exported config entity and the third key is always the same:

\`\`\`yaml
# config/sync/field.field.node.incident.field_severity.yml
uuid: 5a2b8f1c-9d34-4f77-8f21-0b7c6f2a4e10
langcode: en
status: true
dependencies:
  config:
    - field.storage.node.field_severity
    - node.type.incident
  module:
    - options
id: node.incident.field_severity
field_name: field_severity
entity_type: node
bundle: incident
label: Severity
\`\`\`

Four buckets live under \`dependencies\`: **config** (other config entity names),
**module**, **theme**, and **content** (content entities, written as
\`ENTITY_TYPE:BUNDLE:UUID\` — a menu link or a taxonomy term a config entity
genuinely points at). Everything in those buckets is **recalculated on every
save** by \`ConfigEntityBase::calculateDependencies()\`, so you never hand-edit
them; if the YAML disagrees with reality, re-save the entity and re-export.

A fifth bucket, \`dependencies.enforced\`, has the same shape but is **not**
recalculated. That is the escape hatch for "delete this view when my module is
uninstalled even though nothing in the view mentions my module."

### Why it decides import order

\`StorageComparer\` builds the create/update/delete/rename changelist, then hands
the names to \`ConfigDependencyManager\`, which builds a graph and topologically
sorts it. Creates come out **dependencies first**; deletes are the same list
**reversed**, so dependents die before the thing they point at. Extension
changes from \`core.extension.yml\` are processed before any config operation, so
a module install always precedes the config that names it — which is exactly why
you never hand-order an import.

Before any of that runs, \`ConfigImportSubscriber\` validates the graph and
aborts the whole import if a prerequisite is missing:

\`\`\`text
Configuration views.view.incident_queue depends on the incident_tracker
module that will not be installed after import.
\`\`\`

Ninety percent of the time that means a colleague exported config for a module
they forgot to commit to \`core.extension.yml\` and \`composer.json\`. True cycles
are rare, because dependencies are derived from real references rather than
declared by hand — and worth knowing: Drupal's graph sort does not throw a
"cycle detected" error, it just emits an order that cannot satisfy both edges,
so a genuine cycle surfaces later as a save or validation failure.

### The dangerous half: removal

\`ConfigManager::getConfigEntitiesToChangeOnDependencyRemoval()\` answers "if this
module goes away, what happens to everything pointing at it?" For each dependent
it calls \`onDependencyRemoval()\`. Return \`TRUE\` and the entity is **rewritten
and saved** — a view drops the offending field handler and lives. Return
\`FALSE\` (the base-class default for most entities) and it is **deleted**.

That cascade is transitive and it is silent. Uninstall a field-providing module
and you lose the field storage, every field instance, every form and view display
row, and the stored data behind them. Always run
\`drush pm:uninstall module_name\` against a production database copy first and
read the confirmation list.
`,

  comparisons: [
    {
      label: "Who solves ordering, and when",
      intro:
        "Both frameworks have the same problem — thing B cannot be built before thing A. Symfony resolves it at container-compile time on every request boot; Drupal resolves it at import time from data stored in the database.",
      php: `<?php
// Symfony: ordering is a compile-time concern of the DI container.

// config/bundles.php — order here is load order for extensions.
return [
    Symfony\\Bundle\\FrameworkBundle\\FrameworkBundle::class => ['all' => true],
    Doctrine\\Bundle\\DoctrineBundle\\DoctrineBundle::class  => ['all' => true],
    App\\IncidentBundle\\IncidentBundle::class              => ['all' => true],
];

// A compiler pass runs after every extension has loaded, so it can rely on
// services that other bundles registered — ordering solved by the pass phase.
final class IncidentReporterPass implements CompilerPassInterface
{
    public function process(ContainerBuilder $container): void
    {
        if (!$container->has(IncidentQueue::class)) {
            return; // Optional dependency: degrade, don't explode.
        }
        $queue = $container->findDefinition(IncidentQueue::class);
        foreach ($container->findTaggedServiceIds('incident.reporter') as $id => $tags) {
            $queue->addMethodCall('addReporter', [new Reference($id)]);
        }
    }
}
// Get it wrong and 'cache:warmup' fails loudly, before a single request runs.`,
      ts: `# Drupal: ordering is data, recalculated on save, read at import time.

# config/sync/core.extension.yml — the source of truth for what is installed.
module:
  node: 0
  options: 0
  views: 0
  incident_tracker: 0
theme:
  olivero: 0

# config/sync/views.view.incident_queue.yml (head of file)
dependencies:
  config:
    - field.storage.node.field_severity
    - node.type.incident
  module:
    - node
    - user
    - views
    - incident_tracker

# Nothing in the repo declares an order. ConfigDependencyManager derives it:
#   core.extension changes first (modules installed / uninstalled)
#   then creates,  sorted dependencies-first
#   then deletes,  the same sort reversed`,
      leftLang: "php",
      rightLang: "yaml",
      note: "Symfony's ordering lives in code you wrote; Drupal's lives in a generated key you must never hand-edit — re-save the entity and re-export instead.",
    },
    {
      label: "Recalculated vs enforced dependencies",
      intro:
        "A module ships a view. Nothing inside the view mentions the module, so the automatic calculation will not link them — and uninstalling the module would leave an orphan view behind.",
      php: `<?php
// Symfony has no analogue: a bundle's resources are files on disk, so
// removing the bundle removes them. The nearest concern is Doctrine
// migrations, where YOU declare ordering and reversal by hand.

final class Version20250114093000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE incident ADD severity VARCHAR(16) NOT NULL');
    }

    public function down(Schema $schema): void
    {
        // Removal is explicit, hand-written, and reviewable in the diff.
        $this->addSql('ALTER TABLE incident DROP severity');
    }
}
// Nothing is auto-deleted for you. Nothing is auto-deleted WITHOUT you.`,
      ts: `<?php
// Drupal: calculateDependencies() runs on every save and OVERWRITES the
// non-enforced buckets. Add to them; never assume they persist verbatim.
namespace Drupal\\incident_tracker\\Entity;

use Drupal\\Core\\Config\\Entity\\ConfigEntityBase;

class IncidentPolicy extends ConfigEntityBase {

  public function calculateDependencies() {
    parent::calculateDependencies();
    // Points at a workflow config entity -> declare it, or import may
    // create this policy before the workflow exists.
    if ($this->workflow) {
      $workflow = \\Drupal::entityTypeManager()
        ->getStorage('workflow')
        ->load($this->workflow);
      if ($workflow) {
        $this->addDependency('config', $workflow->getConfigDependencyName());
      }
    }
    return $this;
  }

}`,
      note: "For the shipped-view case you add the enforced bucket to the YAML itself — dependencies.enforced.module: [incident_tracker] — because enforced entries survive every recalculation.",
    },
    {
      label: "Uninstalling: loud failure vs silent cascade",
      intro:
        "Someone drops a module from the project. Symfony's container refuses to compile. Drupal happily uninstalls and takes the dependent config with it.",
      php: `<?php
// Symfony: remove the bundle, and anything referencing it fails at compile.
//
//   $ composer remove app/incident-bundle
//   $ bin/console cache:clear --env=prod
//
//   In ContainerBuilder.php line 1067:
//     You have requested a non-existent service
//     "App\\IncidentBundle\\Service\\IncidentQueue".
//
// The deploy stops. Nothing has been deleted. The failure is the safety net:
// you fix the reference, or you do not ship.`,
      ts: `<?php
// Drupal: ask BEFORE you uninstall. This is what the confirm screen uses.
$config_manager = \\Drupal::service('config.manager');

$changes = $config_manager->getConfigEntitiesToChangeOnDependencyRemoval(
  'module',
  ['options'],
);

// ['update' => [...], 'delete' => [...], 'unchanged' => [...]]
foreach ($changes['delete'] as $entity) {
  // field.storage.node.field_severity  -> and the column behind it.
  print $entity->getConfigDependencyName() . " will be DELETED\\n";
}
foreach ($changes['update'] as $entity) {
  // views.view.incident_queue -> onDependencyRemoval() returned TRUE,
  // so the view rewrites itself, dropping the dead handler, and survives.
  print $entity->getConfigDependencyName() . " will be REWRITTEN\\n";
}`,
      note: "Drupal deletes on your behalf and reports it as success. Rehearse every uninstall against a production database copy and read the list before confirming.",
    },
    {
      label: "The deploy sequence this forces",
      intro:
        "A view depends on a field, which depends on a module. All three ship in one release. Neither team hand-orders anything — but the mechanisms are different.",
      php: `# Symfony deploy: schema, then code, then warm the container.
set -euo pipefail

composer install --no-dev --optimize-autoloader --no-interaction

# Ordering is inside the migration filenames; Doctrine walks them in order.
bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration

bin/console cache:clear   --env=prod
bin/console cache:warmup  --env=prod

# config/packages/*.yaml was read from disk at warmup. There is no
# "import" step, no drift, and nothing to reconcile.`,
      ts: `# Drupal deploy: code, then schema, then config. Order matters here.
set -euo pipefail

composer install --no-dev --optimize-autoloader --no-interaction

# 'drush deploy' is these five steps in one command. Spelled out:

# Entity/schema updates first, so the code cim runs against is sane.
# This runs HOOK_update_N() then HOOK_post_update_NAME() — both BEFORE import.
drush updatedb --no-cache-clear
drush cache:rebuild

# ONE import. core.extension installs incident_tracker, then the sorted
# changelist creates field.storage -> field.field -> views.view.
drush config:import
drush cache:rebuild

# Code that must run AFTER config is in place goes in HOOK_deploy_NAME()
# inside MODULE.deploy.php, which this step executes.
drush deploy:hook`,
      leftLang: "bash",
      rightLang: "bash",
      note: "Never split one release's config across two imports to 'get the order right' — a single cim already sorts the whole changelist; splitting it is how you ship a half-imported site.",
    },
  ],

  playground: {
    intro:
      "A miniature ConfigDependencyManager in plain PHP: validate the changelist, topologically sort it into import order, then model what an uninstall would take with it. Predict the three sections before you run it.",
    lang: "php",
    code: `<?php
// A miniature ConfigDependencyManager. No Drupal, no database: just the graph.

// The changelist drush cim is about to create, with the dependencies block
// each exported YAML file carries.
$configs = [
  'node.type.incident' => [
    'module' => ['node'],
    'config' => [],
  ],
  'field.storage.node.field_severity' => [
    'module' => ['options'],
    'config' => [],
  ],
  'field.field.node.incident.field_severity' => [
    'module' => ['options'],
    'config' => ['field.storage.node.field_severity', 'node.type.incident'],
  ],
  'core.entity_view_display.node.incident.default' => [
    'module' => ['incident_tracker'],
    'config' => ['field.field.node.incident.field_severity', 'node.type.incident'],
  ],
  'views.view.incident_queue' => [
    'module' => ['views', 'incident_tracker'],
    'config' => ['field.storage.node.field_severity', 'node.type.incident'],
  ],
];

// What core.extension in the sync directory says will be installed.
$modules_after_import = ['node', 'options', 'views'];

// --- 1. Validation, the way ConfigImportSubscriber does it. ---------------
echo "== validate ==\\n";
$errors = [];
foreach ($configs as $name => $deps) {
  foreach ($deps['module'] as $module) {
    if (!in_array($module, $modules_after_import, TRUE)) {
      $errors[] = "Configuration $name depends on the $module module that will not be installed after import.";
    }
  }
  foreach ($deps['config'] as $target) {
    if (!isset($configs[$target])) {
      $errors[] = "Configuration $name depends on configuration ($target) that will not exist after import.";
    }
  }
}
foreach ($errors as $error) {
  echo "  [error] $error\\n";
}
echo "  " . count($errors) . " error(s)\\n\\n";

// The fix is one line in core.extension.yml, not a hand-sorted import.
$modules_after_import[] = 'incident_tracker';

// --- 2. Topological sort: dependencies first, cycles reported. ------------
$order = [];
$state = [];
$sort = function (string $name) use (&$sort, &$order, &$state, $configs): ?array {
  if (($state[$name] ?? 'new') === 'done') {
    return NULL;
  }
  if (($state[$name] ?? 'new') === 'open') {
    return [$name];
  }
  $state[$name] = 'open';
  foreach ($configs[$name]['config'] as $target) {
    if ($cycle = $sort($target)) {
      $state[$name] = 'done';
      return array_merge([$name], $cycle);
    }
  }
  $state[$name] = 'done';
  $order[] = $name;
  return NULL;
};

echo "== import order ==\\n";
$cycle = NULL;
foreach (array_keys($configs) as $name) {
  if ($cycle = $sort($name)) {
    break;
  }
}
if ($cycle) {
  echo "  cycle: " . implode(' -> ', $cycle) . "\\n\\n";
}
else {
  foreach ($order as $i => $name) {
    printf("  %d. create %s\\n", $i + 1, $name);
  }
  echo "  delete order is the exact reverse: " . $order[count($order) - 1] . " first\\n\\n";
}

// --- 3. Uninstall cascade, the getConfigEntitiesToChangeOnDependencyRemoval
// question: for each dependent, delete it or let it rewrite itself?
$uninstall = 'options';
$doomed = [];
foreach ($configs as $name => $deps) {
  if (in_array($uninstall, $deps['module'], TRUE)) {
    $doomed[$name] = TRUE;
  }
}
do {
  $grew = FALSE;
  foreach ($configs as $name => $deps) {
    if (isset($doomed[$name])) {
      continue;
    }
    foreach ($deps['config'] as $target) {
      if (isset($doomed[$target])) {
        $doomed[$name] = TRUE;
        $grew = TRUE;
        break;
      }
    }
  }
} while ($grew);

echo "== uninstalling module: $uninstall ==\\n";
foreach (array_reverse($order) as $name) {
  if (!isset($doomed[$name])) {
    continue;
  }
  // A view can drop the offending handler and survive; most config cannot.
  $verdict = str_starts_with($name, 'views.view.')
    ? 'update  (onDependencyRemoval() returned TRUE - rewritten in place)'
    : 'delete  (onDependencyRemoval() returned FALSE)';
  printf("  %-48s %s\\n", $name, $verdict);
}
`,
    output: `== validate ==
  [error] Configuration core.entity_view_display.node.incident.default depends on the incident_tracker module that will not be installed after import.
  [error] Configuration views.view.incident_queue depends on the incident_tracker module that will not be installed after import.
  2 error(s)

== import order ==
  1. create node.type.incident
  2. create field.storage.node.field_severity
  3. create field.field.node.incident.field_severity
  4. create core.entity_view_display.node.incident.default
  5. create views.view.incident_queue
  delete order is the exact reverse: views.view.incident_queue first

== uninstalling module: options ==
  views.view.incident_queue                        update  (onDependencyRemoval() returned TRUE - rewritten in place)
  core.entity_view_display.node.incident.default   delete  (onDependencyRemoval() returned FALSE)
  field.field.node.incident.field_severity         delete  (onDependencyRemoval() returned FALSE)
  field.storage.node.field_severity                delete  (onDependencyRemoval() returned FALSE)
`,
  },

  keyPoints: [
    "Every config entity carries dependencies with config / content / module / theme buckets, all recalculated by calculateDependencies() on every save — hand-editing them in YAML is pointless because the next export overwrites them.",
    "dependencies.enforced is the one bucket that is never recalculated; use it to make config die with the module that shipped it.",
    "ConfigDependencyManager topologically sorts the changelist: creates run dependencies-first, deletes run the reverse, and core.extension changes are processed before any config operation — so you never hand-order an import.",
    "A missing prerequisite aborts the entire import during validation with 'depends on the X module that will not be installed after import' — usually a module missing from core.extension.yml or composer.json.",
    "Uninstalling a module calls onDependencyRemoval() on every dependent: TRUE means the entity rewrites itself and survives, FALSE (the common default) means it is deleted, transitively and silently.",
    "Ship one release as one drush config:import; splitting it across two imports to 'fix the order' is how you end up with a half-imported site.",
  ],

  interview: [
    {
      q: "How does Drupal know what order to import configuration in, and why can't you just import files alphabetically?",
      a: "The order comes from the `dependencies` key inside each exported file, not from filenames. `StorageComparer` builds the create/update/delete changelist, then `ConfigDependencyManager` builds a graph from the `config`, `module` and `theme` buckets and topologically sorts it, so a field storage is created before the field instance, which is created before the view display that renders it. Deletes use the same sort reversed, so dependents are removed before their targets. Extension changes from `core.extension.yml` are processed ahead of any config operation, which is what guarantees a module is installed before the config naming it lands. Alphabetical order would break immediately — `field.field.*` sorts before `field.storage.*`, which is exactly backwards."
    },
    {
      q: "A teammate's `drush cim` on stage fails with 'Configuration views.view.incident_queue depends on the incident_tracker module that will not be installed after import.' Walk me through diagnosing it.",
      a: "That message comes from the config import validation step, before anything is written, so the site is untouched — good. It means the sync directory contains a view whose `dependencies.module` lists `incident_tracker`, but `core.extension.yml` in that same directory does not list it as installed. Almost always the author enabled the module locally and exported the view, but staged only the view file, or the module is in `core.extension.yml` but missing from `composer.json` so it is not on disk on stage. Fix it by committing the module in `composer.json`/`composer.lock` and making sure `core.extension.yml` includes it, then re-run the import as one operation. Adding it by hand to `core.extension.yml` without the code on disk just swaps one validation error for another — `Unable to install the incident_tracker module since it does not exist.` — and the import still aborts before writing anything."
    },
    {
      q: "What does `onDependencyRemoval()` do, and why does it make module uninstalls risky?",
      a: "When a module or config entity is removed, `ConfigManager::getConfigEntitiesToChangeOnDependencyRemoval()` collects everything that depends on it and calls `onDependencyRemoval()` on each. Returning `TRUE` means the entity has repaired itself — a view drops the field handler that pointed at the departing module and gets re-saved — and returning `FALSE` means it cannot survive, so Drupal deletes it. The default for most config entities is deletion, and the cascade is transitive: uninstall a field-providing module and you lose the field storage, every instance, every form and view display row, and the stored data. The risk is that Drupal reports all of this as a successful uninstall. The habit is to run the uninstall against a copy of the production database first, read the confirmation list, and export the resulting diff so the deletions show up in code review rather than in production."
    },
    {
      q: "Coming from Symfony, what's the mental shift with config dependencies?",
      a: "In Symfony, ordering is a compile-time problem: `config/bundles.php` sets extension load order, compiler passes run after every extension has loaded, and a dangling service reference blows up `cache:warmup` before a request is served. Nothing is ever deleted for you, and the container is rebuilt from files on disk every deploy. In Drupal, config lives in the database, so dependencies are *data* recalculated on save and replayed at import time — which means they can drift, they carry identity via UUIDs, and removal cascades act on real stored config rather than failing to compile. Symfony's failure mode is a loud compile error; Drupal's is a quiet, successful-looking deletion. That is why config diffs get code-reviewed and uninstalls get rehearsed against a production database copy."
    },
  ],

  quiz: [
    {
      question:
        "You hand-edit `dependencies.module` in an exported `views.view.*.yml` to add a module. What happens on the next export after someone saves that view in the UI?",
      options: [
        "The edit persists — dependencies are only written when the file is first created.",
        "The edit is overwritten, because calculateDependencies() recalculates the config/content/module/theme buckets on every save.",
        "The import fails with a schema validation error on the extra module.",
        "Drupal merges your value with the calculated one and keeps both.",
      ],
      answerIndex: 1,
      explain:
        "`ConfigEntityBase::calculateDependencies()` runs on every save and replaces the non-enforced buckets from the entity's actual references. The only bucket that survives is `dependencies.enforced`, which is deliberately never recalculated.",
    },
    {
      question:
        "One release adds a custom module, a field it provides, and a view using that field. How should it be deployed?",
      options: [
        "Three separate `drush config:import` runs, ordered module, field, view.",
        "Install the module manually with `drush pm:enable`, then import config.",
        "One `drush config:import` — core.extension installs the module first, then the sorted changelist creates field storage, field instance, then the view.",
        "Import the view first so Views can create the field it needs.",
      ],
      answerIndex: 2,
      explain:
        "Extension changes from `core.extension.yml` are processed before config operations, and ConfigDependencyManager sorts the rest dependencies-first. Splitting the release across multiple imports only creates windows where the site is half-imported.",
    },
    {
      question:
        "During `drush pm:uninstall`, a dependent config entity's `onDependencyRemoval()` returns TRUE. What does that mean?",
      options: [
        "The entity confirmed it has no remaining dependencies and will be left untouched.",
        "The entity repaired itself — the offending piece was removed — so Drupal re-saves it instead of deleting it.",
        "The uninstall is blocked until the dependency is resolved manually.",
        "The entity is exported to the sync directory before being deleted.",
      ],
      answerIndex: 1,
      explain:
        "TRUE means 'I changed myself and I can survive' — the entity lands in the `update` list and is re-saved. FALSE, the common default, puts it in the `delete` list.",
    },
    {
      question:
        "`drush cim` reports: 'Configuration field.field.node.incident.field_severity depends on configuration (field.storage.node.field_severity) that will not exist after import.' What is the state of the site?",
      options: [
        "Partially imported — the field instance was created and then rolled back.",
        "Unchanged — validation runs before any config is written, so the import aborted with nothing applied.",
        "The field instance was created with a null storage reference.",
        "The active store was flushed and must be restored from backup.",
      ],
      answerIndex: 1,
      explain:
        "Dependency validation happens during the import's validate phase, before the changelist is executed. The import aborts as a whole and the active configuration is untouched — the usual cause is a partially staged export missing the field storage file.",
    },
  ],
};

export default lesson;
