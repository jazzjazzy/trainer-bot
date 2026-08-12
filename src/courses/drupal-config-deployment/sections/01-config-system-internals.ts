import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "config-system-internals",
  title: "How Config Actually Works: Active Store, Sync & Schema",
  part: "The Configuration System",
  estMinutes: 13,
  summary:
    "Drupal's configuration is not a set of files you edit — it is a live store in the database that files are exported from and imported back into, and almost every deployment failure in this course traces back to that one difference.",

  concept: `
In Symfony, \`config/packages/*.yaml\` **is** the configuration. It is
read-only source, it is compiled into the container at build time, and if you
want to know what the app is configured to do you read the file. Nothing at
runtime writes to it.

Drupal inverts that. The files in \`config/sync\` are a **snapshot**; the thing
the running site actually reads is the **active store**.

## The three storages

- **Active** — by default a database table (\`config\`), served through the
  \`config.storage\` service (a cached wrapper around the database storage).
  Every time a site builder saves a form at \`/admin\`, this is what changes.
- **Sync** — a \`FileStorage\` over the directory named by
  \`$settings['config_sync_directory']\`, conventionally \`../config/sync\`,
  outside the docroot and committed to git.
- **Override** — \`$config['system.site']['name'] = 'DEV';\` in
  \`settings.php\`. This layer is applied *on read*, never written back.

\`ConfigFactory::get()\` returns an immutable \`Config\` object with overrides
applied; \`getEditable()\` returns a mutable one **without** them, so you never
accidentally save your dev override into the active store. That distinction
catches everyone once.

## Simple config vs config entities

\`system.site\` is *simple config*: a bag of typed values, one object, no
identity beyond its name. \`node.type.article\` and \`views.view.people\` are
*config entities*: full entity types stored in config. Their exported files
carry extra keys:

\`\`\`yaml
uuid: 8c9f2f3e-...   # stable identity across environments
langcode: en
status: true
dependencies:
  module:
    - text
  config:
    - field.storage.node.body
\`\`\`

Only \`status\` and \`dependencies\` are genuinely entity-only. \`uuid\` and
\`langcode\` also turn up on some simple config — \`system.site.yml\` ships both —
but there the \`uuid\` is the *site* uuid, a plain stored value, not an entity
identity.

On a config entity the \`uuid\` is how Drupal knows the article type on stage is
*the same object* as the one on dev rather than a coincidence of names. If an
entity with the same name already exists locally under a **different** uuid, the
import dies with \`ConfigDuplicateUUIDException\` — *"Attempt to save a
configuration entity 'article' with UUID 'x' when this entity already exists with
UUID 'y'"* — thrown from \`ConfigEntityBase::preSave()\`.

Do not confuse that with the other UUID failure: *"Site UUID in source storage
does not match the target storage."* comes from
\`StorageComparer::validateSiteUuid()\`, which compares nothing but the \`uuid\`
value inside \`system.site\`, and is what stops you importing one site's export
into an unrelated site. Section 02 is entirely about that one.

\`dependencies\` is recalculated on every save by \`calculateDependencies()\`, and
the importer uses it to sort the import into a safe order and to cascade
deletes.

## Schema is the type system

\`config/schema/*.schema.yml\` declares the shape of every object:
\`type: config_object\` or \`type: config_entity\`, then a \`mapping\` of typed
keys. It drives three things: **casting** (Config::save() coerces values to the
declared types), **translation** (only keys typed \`label\` or \`text\` are
offered to translators), and **validation** (constraints, and the strict schema
checker that fails your kernel tests when an object has no schema). Note the
asymmetry: saving casts to schema, but validation constraints are not enforced
by \`save()\` — they run where something explicitly validates.

## What cex actually does

\`drush cex\` writes the **entire** active store to the sync directory and
deletes any file that no longer exists in active. It is a full snapshot, not a
diff and not a patch. \`drush cim\` does the reverse: it compares the two
storages, builds a create/update/delete plan, sorts it by dependencies, and
applies it. The diff is a consequence, never the unit of work.
`,

  comparisons: [
    {
      label: "Where the truth lives",
      intro:
        "The same question — 'what is this site's name in production?' — answered in each framework. In Symfony you read a file; in Drupal the file is only last week's photograph of the answer.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# config/packages/app.yaml — this IS the configuration.
parameters:
    app.site_name: 'Acme Intranet'

# config/packages/prod/app.yaml — env layered at compile time
parameters:
    app.site_name: 'Acme'

# Read it back:
#   bin/console debug:container --parameter=app.site_name
# Nothing at runtime can change this file. Deploying it is
# "git pull && cache:clear". The container is rebuilt from source.`,
      ts: `<?php
// The active store is authoritative. config/sync is an export of it.

// Immutable + settings.php overrides applied:
$name = \\Drupal::config('system.site')->get('name');

// Mutable, overrides NOT applied — this is what writes to the
// \`config\` table:
\\Drupal::configFactory()
  ->getEditable('system.site')
  ->set('name', 'Acme Intranet')
  ->save();

// The raw storages, if you ever need them directly:
$active = \\Drupal::service('config.storage');       // db-backed, cached
$sync   = \\Drupal::service('config.storage.sync');  // config/sync files
$sync->listAll('node.type.');`,
      note: "Symfony: file -> container. Drupal: file -> database -> runtime. The database in the middle is why config can drift on a live site and why you export before you commit.",
    },
    {
      label: "Simple config vs config entity",
      intro:
        "Two exported files from the same site. One is a settings bag; the other is an entity that happens to be stored as configuration, and the extra keys are what make deployment work.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony has one shape: bundle configuration, validated by a
# Configuration class, merged per environment, then frozen.
framework:
    default_locale: en
    session:
        handler_id: null

monolog:
    handlers:
        main:
            type: fingers_crossed
            action_level: error

# No identity, no dependency graph, no import order problem —
# because nothing here is ever created or deleted at runtime.`,
      ts: `# config/sync/system.site.yml — SIMPLE config
_core:
  default_config_hash: q0Xz9nT4...
uuid: 1f2a...        # this one is the *site* uuid, a value
name: 'Acme Intranet'
slogan: 'Ship it'
page:
  front: /node

# config/sync/node.type.incident.yml — a CONFIG ENTITY
uuid: 7b3d1c2e-90aa-4f10-9c3e-51ab2d6f8801
langcode: en
status: true
dependencies: {  }
name: Incident
type: incident
new_revision: true
preview_mode: 1`,
      note: "Config entities have uuid, status, langcode and dependencies. Those four keys are what let the importer match objects across environments, skip disabled ones, translate them, and order the import.",
    },
    {
      label: "Typing and validating configuration",
      intro:
        "Both frameworks let you declare the shape of configuration so bad values fail loudly. Symfony does it in PHP at compile time; Drupal does it in YAML, at runtime, for objects that may be edited through a UI.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// src/DependencyInjection/Configuration.php
namespace App\\DependencyInjection;

use Symfony\\Component\\Config\\Definition\\Builder\\TreeBuilder;
use Symfony\\Component\\Config\\Definition\\ConfigurationInterface;

final class Configuration implements ConfigurationInterface
{
    public function getConfigTreeBuilder(): TreeBuilder
    {
        $tb = new TreeBuilder('acme_incident');
        $tb->getRootNode()
            ->children()
                ->scalarNode('queue_name')->defaultValue('incidents')->end()
                ->integerNode('retry_limit')->min(0)->max(10)->defaultValue(3)->end()
                ->scalarNode('notify_email')->isRequired()->end()
            ->end();

        return $tb;
    }
}
// Violations blow up at container compile time — before a request runs.`,
      ts: `# modules/custom/acme_incident/config/schema/acme_incident.schema.yml
acme_incident.settings:
  type: config_object
  label: 'Incident settings'
  # FullyValidatable opts the whole object into strict validation, but it
  # only exists in Drupal 10.3+ / 11 (change record 3404425). On 10.0-10.2
  # an unrecognised constraint name is an error, not a no-op — omit it.
  constraints:
    FullyValidatable: ~
  mapping:
    queue_name:
      type: string
      label: 'Queue name'
    retry_limit:
      type: integer
      label: 'Retry limit'
      constraints:
        Range:
          min: 0
          max: 10
    notify_email:
      type: email
      label: 'Notification address'
      constraints:
        NotBlank: []

# Types drive casting on save, translatability ('label'/'text' keys
# are exposed to translators), and constraint validation.`,
      note: "Config::save() casts values to the schema's types but does not itself run the constraints — they fire where something validates explicitly, and the strict schema checker in kernel tests fails any object with no schema at all.",
    },
    {
      label: "Getting it onto production",
      intro:
        "The deploy step that moves configuration forward. The shapes are similar; the risk profile is not, because only one of the two can be contradicted by someone clicking around in the admin UI.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
set -euo pipefail

git pull --ff-only
composer install --no-dev --optimize-autoloader

# Config is compiled from source; there is nothing to import.
APP_ENV=prod php bin/console cache:clear
APP_ENV=prod php bin/console cache:warmup

# Only the database needs a forward migration.
php bin/console doctrine:migrations:migrate --no-interaction

# If prod's config disagrees with the repo, the repo wins. Always.`,
      ts: `#!/usr/bin/env bash
set -euo pipefail

git pull --ff-only
composer install --no-dev --optimize-autoloader

# See the plan before anything runs — this is the storage comparison.
drush config:status

# The supported sequence, as one command (Drush 10.3+). It runs:
#   updatedb --no-cache-clear   hook_update_N + hook_post_update_N
#   cache:rebuild
#   config:import               active <- config/sync
#   cache:rebuild
#   deploy:hook                 hook_deploy_N, so it can rely on the
#                               configuration that was just imported
drush deploy -y

# Spelled out, when you need to wrap or gate a step:
#   drush updatedb -y
#   drush config:import -y   # --diff previews the changes then imports
#   drush cache:rebuild      #   them; it is not a dry run
#   drush deploy:hook -y

# Anything a site builder changed in prod's admin UI and never
# exported is silently reverted by the config:import step.`,
      note: "The order — update hooks, then cim, then deploy hooks — matters and gets its own section later. Drush 12 removed updatedb's --no-post-updates flag, so hook_deploy_N (drush deploy:hook) is now how you run code that has to wait for the imported config. The point here: Drupal has an import step at all, because its config lives in a database that production can write to.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of the two storages and the comparison between them. Same diff, read in two directions — that is exactly what config:status shows you, and why cex and cim are mirror images rather than 'save' and 'load'.",
    lang: "php",
    code: `<?php
// A tiny model of Drupal's two config stores and the snapshot diff between
// them. No Drupal, no database - just arrays standing in for the \`config\`
// table (active) and the files in config/sync.

$active = [
  'system.site'        => ['name' => 'Acme Intranet', 'slogan' => 'Ship it'],
  'node.type.article'  => ['uuid' => 'a1', 'type' => 'article', 'name' => 'Article'],
  'node.type.incident' => ['uuid' => 'c3', 'type' => 'incident', 'name' => 'Incident'],
  'views.view.people'  => ['uuid' => 'b2', 'id' => 'people', 'label' => 'People'],
];

$sync = [
  'system.site'        => ['name' => 'Acme Intranet', 'slogan' => 'Ship it well'],
  'node.type.article'  => ['uuid' => 'a1', 'type' => 'article', 'name' => 'Article'],
  'views.view.people'  => ['uuid' => 'b2', 'id' => 'people', 'label' => 'People'],
  'views.view.rota'    => ['uuid' => 'd4', 'id' => 'rota', 'label' => 'On-call rota'],
];

/** Storage comparison, the way ConfigImporter/StorageComparer sees it. */
function plan(array $source, array $target): array {
  $out = ['create' => [], 'update' => [], 'delete' => []];
  foreach ($source as $name => $data) {
    if (!array_key_exists($name, $target)) {
      $out['create'][] = $name;
    }
    elseif ($data !== $target[$name]) {
      $out['update'][] = $name;
    }
  }
  foreach (array_keys($target) as $name) {
    if (!array_key_exists($name, $source)) {
      $out['delete'][] = $name;
    }
  }
  foreach ($out as &$list) {
    sort($list);
  }
  return $out;
}

function render(string $title, array $plan): void {
  echo $title . "\\n";
  foreach (['create', 'update', 'delete'] as $op) {
    $names = $plan[$op] ?: ['(none)'];
    printf("  %-6s %s\\n", $op, implode(', ', $names));
  }
  echo "\\n";
}

// drush cex: the SOURCE is the active store, the TARGET is config/sync.
render('drush cex  (active -> config/sync)', plan($active, $sync));

// drush cim: the direction flips. Same diff, opposite meaning.
render('drush cim  (config/sync -> active)', plan($sync, $active));

// Simple config vs config entity. In this toy model a uuid marks an entity;
// on a real site system.site.yml also has one (the *site* uuid), so the
// reliable tell is the pair status + dependencies.
echo "Object kinds\\n";
foreach ($active as $name => $data) {
  $kind = isset($data['uuid']) ? 'config entity' : 'simple config';
  printf("  %-19s %s\\n", $name, $kind);
}
echo "\\n";

// cex is a snapshot, not a patch: whatever is not in active leaves config/sync.
$exported = $active;
echo "After cex, config/sync contains:\\n";
print_r(array_keys($exported));
`,
    output: `drush cex  (active -> config/sync)
  create node.type.incident
  update system.site
  delete views.view.rota

drush cim  (config/sync -> active)
  create views.view.rota
  update system.site
  delete node.type.incident

Object kinds
  system.site         simple config
  node.type.article   config entity
  node.type.incident  config entity
  views.view.people   config entity

After cex, config/sync contains:
Array
(
    [0] => system.site
    [1] => node.type.article
    [2] => node.type.incident
    [3] => views.view.people
)
`,
  },

  keyPoints: [
    "The active store (a database table by default, reached via the config.storage service) is what the running site reads; config/sync is an export of it, located by $settings['config_sync_directory'].",
    "drush cex writes a full snapshot of active into sync and deletes files whose objects no longer exist — it is never a patch. drush cim compares the two storages and applies the resulting create/update/delete plan.",
    "ConfigFactory::get() applies settings.php overrides and is immutable; getEditable() skips overrides and is what writes — never save an object you fetched with get().",
    "Simple config (system.site) is a typed bag of values; config entities (node.type.*, views.view.*) also carry status and a dependencies array — the genuinely entity-only keys — plus a uuid that identifies the object across environments. uuid and langcode are not proof of an entity: system.site has both, its uuid being the site uuid.",
    "config/schema/*.schema.yml gives every key a type, which drives casting on save, which strings are translatable, and constraint-based validation.",
    "The mental shift from Symfony: configuration round-trips through a database that production can write to, so 'the repo is the truth' is a discipline you enforce, not a property of the system.",
  ],

  interview: [
    {
      q: "In Symfony, config/packages is the configuration. Explain how Drupal differs and why that matters for deployment.",
      a: "Symfony compiles YAML into the container at build time, so the file is the single source of truth and deploying config is just deploying code. Drupal keeps configuration in an **active store** — by default the `config` database table, served through the `config.storage` service — and `config/sync` is an *export* of it that you commit to git. Because the store is writable at runtime, anyone with admin access on production can change configuration without touching the repo, which is called drift. Deployment therefore needs an explicit import step (`drush config:import`) that compares sync against active and reconciles them, and that import will silently revert unexported production changes. The practical consequence is process: export and commit locally, never edit config through the UI on prod, and lock down the permissions that would let someone do it.",
    },
    {
      q: "What is the difference between simple configuration and a configuration entity, and why does a config entity need a uuid?",
      a: "Simple config — `system.site`, `views.settings` — is a single named object holding typed values; there is only ever one of it and it is defined by a module's `config/install` defaults plus whatever the site has saved. A configuration entity — `node.type.article`, `views.view.people`, `field.field.node.article.body` — is a real entity type whose storage happens to be config, so site builders can create and delete many instances. Because instances are created independently on different environments, each carries a `uuid` that identifies it as the *same object* across dev, stage and prod, and a `dependencies` array (recalculated on save by `calculateDependencies()`) listing the modules, themes and other config it needs. The importer uses those dependencies to sort the import into a safe order and to cascade deletions. Simple config needs neither, because it cannot be created or removed by a user.",
    },
    {
      q: "What does configuration schema do, and what breaks when a custom module ships without it?",
      a: "`config/schema/*.schema.yml` declares the type of every key in a config object — `config_object` or `config_entity` at the top, then a `mapping` of typed keys such as `string`, `integer`, `boolean`, `label`, `email`, `sequence`. It has three jobs: `Config::save()` casts values to the declared types, so a checkbox does not end up stored as the string `\"1\"`; only keys typed as `label` or `text` are exposed to the translation UI; and constraints attached in schema let something validate the object. Without schema, values are stored with whatever PHP type they happened to have, your settings become untranslatable, and kernel tests fail outright — the strict schema checker throws `SchemaIncompleteException` with 'No schema for …'. It is the cheapest bug class to eliminate: write the schema when you write the settings form.",
    },
    {
      q: "A colleague says 'just diff config/sync against production and apply the differences'. Why is that the wrong model?",
      a: "Because neither `cex` nor `cim` works in diffs. `drush cex` writes the whole active store to the sync directory and deletes any file whose object no longer exists in active; `drush cim` reads the whole sync directory, builds a storage comparison against active, and applies the resulting create/update/delete plan in dependency order. The diff you see in `config:status` or `config:import --diff` is a *report* of that comparison, not the unit of work. Trying to apply a subset by hand — copying two YAML files onto prod, say — bypasses dependency ordering and the config import events that modules subscribe to, and leaves the active store in a state no environment has ever tested. If you genuinely need partial deployment, that is what config split and partial import options exist for, not manual file surgery.",
    },
  ],

  quiz: [
    {
      question:
        "On production, an editor changes the site slogan through /admin/config/system/site-information. Nobody runs drush cex. What happens on the next deploy that runs drush config:import?",
      options: [
        "The import fails with a conflict error, because active and sync disagree.",
        "The slogan is reverted to whatever config/sync says, silently.",
        "Nothing — config:import only touches objects whose files changed in git.",
        "The change is merged into config/sync automatically and committed.",
      ],
      answerIndex: 1,
      explain:
        "config:import makes active match sync. It compares the whole of both storages, sees system.site as an 'update', and overwrites the active value. There is no conflict detection and no merge — the import direction is one-way, which is exactly why unexported production edits are dangerous rather than merely untidy.",
    },
    {
      question:
        "Which service returns a configuration object with settings.php $config[] overrides applied?",
      options: [
        "\\Drupal::configFactory()->getEditable('system.site')",
        "\\Drupal::service('config.storage')->read('system.site')",
        "\\Drupal::config('system.site')",
        "\\Drupal::service('config.storage.sync')->read('system.site')",
      ],
      answerIndex: 2,
      explain:
        "\\Drupal::config() (ConfigFactory::get()) returns an immutable object with the override layer applied — that is the value the running site behaves according to. getEditable() deliberately strips overrides so that saving cannot bake a dev-only override into the active store, and the raw storages return unoverridden data straight from the database or the sync files.",
    },
    {
      question:
        "Which of these keys would you expect to find in config/sync/views.view.people.yml but NOT in config/sync/system.site.yml?",
      options: [
        "langcode",
        "dependencies",
        "_core",
        "name",
      ],
      answerIndex: 1,
      explain:
        "A dependencies array is a configuration-entity feature: it is recalculated on every save and tells the importer which modules, themes and other config objects must exist first. Simple config like system.site has no dependency graph because it cannot be created or deleted independently. (langcode and _core can appear on both, and 'name' happens to exist in system.site.)",
    },
    {
      question:
        "Your custom module's settings form saves acme_incident.settings, but the module ships no config/schema/ directory. Which symptom is the direct result?",
      options: [
        "drush cex refuses to export the object.",
        "The settings are stored in the state API instead of config.",
        "Kernel tests fail with 'No schema for acme_incident.settings', values are not type-cast on save, and the strings are not translatable.",
        "config:import skips the object entirely on every environment.",
      ],
      answerIndex: 2,
      explain:
        "Schema is about typing, translatability and validation — not about whether an object can be stored or exported. Without it, Config::save() has nothing to cast against, the translation UI has no way to know which keys are human-readable text, and the strict schema checker used in kernel tests throws SchemaIncompleteException.",
    },
  ],
};

export default lesson;
