import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "config-schema-defaults",
  title: "Default Config & Config Schema",
  part: "Forms & Config",
  estMinutes: 12,
  summary:
    "Ship incident_tracker's defaults in config/install (imported once, at install) and its type metadata in config/schema — the runtime type system that powers casting, validation, translation, and strict test failures.",

  concept: `
## Two YAML files, two jobs

Symfony's \`Configuration\` class does three things at once — declare keys, set
defaults, validate — all at container **compile** time. Drupal splits that into
two files inside incident_tracker, each working at a different moment:

- \`config/install/incident_tracker.settings.yml\` — the **default values**,
  imported into active configuration once, at module install.
- \`config/schema/incident_tracker.schema.yml\` — the **type metadata**,
  consulted at runtime every time the config is saved, validated, translated,
  or tested.

## Defaults: imported once, then never again

When you run \`drush en incident_tracker\`, the config installer copies every
file in \`config/install/\` into the active store (the database). File name =
config name, and the \`incident_tracker.\` prefix marks your module as its
owner. Install aborts if any of that config already exists on the site.

The gotcha every Drupal developer eventually hits: **editing config/install
later does nothing on existing sites**. It's a seed, not a live default —
closer to a Symfony Flex recipe (copied into \`config/packages/\` once at
\`composer require\`) than to \`->defaultValue()\`. To change a shipped default
you must *also* ship a \`hook_post_update_NAME()\` (or \`hook_update_N()\`)
that writes the new value via \`getEditable()\` — ideally guarded so it only
touches sites still on the old default and doesn't stomp admin customisations.

## Schema: the type system

\`incident_tracker.schema.yml\` mirrors the settings file's shape. The root key
is the config name; \`type: config_object\` is the base type for simple config
(it contributes the \`langcode\` and \`_core\` keys); \`mapping\` lists each key
with a \`type\` (\`string\`, \`integer\`, \`boolean\`, \`email\`, \`label\`,
\`path\`, ...) and a human \`label\`; lists use \`type: sequence\` plus a nested
\`sequence:\` describing each item. What that metadata buys you:

- **Typed values** — values are cast to their schema type on save, so
  \`get('retention_days')\` returns an int and exports stay stable.
- **Validation** — attach Symfony-style \`constraints\` (\`Range\`,
  \`NotBlank\`, \`Email\`); since Drupal 10.3 a top-level
  \`FullyValidatable: ~\` opts the whole object in, which \`#config_target\`
  forms surface as field errors. Note that constraints are *opt-in, not
  enforced on every save*: \`Config::save()\` only casts. They fire where
  something explicitly validates the typed object — a \`#config_target\`
  form, a recipe config action, core's own tests.
- **Config translation** — \`label\` plus translatable types feed the
  config_translation UI.
- **Test enforcement** — kernel and functional tests run with
  \`$strictConfigSchema = TRUE\`: saving config with missing or mismatched
  schema throws. A production-quality module cannot skip this file.

## config/optional and uninstall

\`config/optional/\` holds config that installs only if all of its declared
dependencies are satisfied — say a \`views.view.incident_list\` that needs the
views module. It's skipped silently otherwise, and installed automatically
later the moment views gets enabled. Everything in \`config/install\`, by
contrast, must always be installable, so it may only depend on your module's
hard dependencies.

Uninstall is the mirror image: \`drush pmu incident_tracker\` deletes every
\`incident_tracker.*\` simple config automatically, and config entities
anywhere on the site that depend on your module — via
\`dependencies.module\`, whether calculated or enforced — are deleted with
it, unless they can repair themselves in \`onDependencyRemoval()\`. One
subtlety: calculated dependencies are recalculated on every save, so shipped
config that doesn't functionally use your module must list it under
\`dependencies: enforced: module:\` — enforced entries survive re-saves and
guarantee the cleanup tie. No orphans — and a reinstall re-imports
\`config/install\` from scratch.
`,

  comparisons: [
    {
      label: "One compile-time tree vs two runtime files",
      intro:
        "Symfony folds keys, defaults and validation into one class that runs while the container compiles. Drupal separates values (config/install) from types (config/schema) and keeps the schema available at runtime.",
      rightLang: "yaml",
      php: `<?php
// Symfony: ONE class declares keys, defaults AND validation — all
// enforced when the container compiles. Bad YAML aborts the build;
// after compilation only frozen parameters remain, no metadata.
namespace App\\DependencyInjection;

use Symfony\\Component\\Config\\Definition\\Builder\\TreeBuilder;
use Symfony\\Component\\Config\\Definition\\ConfigurationInterface;

class Configuration implements ConfigurationInterface
{
    public function getConfigTreeBuilder(): TreeBuilder
    {
        $treeBuilder = new TreeBuilder('incident_tracker');
        $treeBuilder->getRootNode()
            ->children()
                ->scalarNode('notify_email')
                    ->defaultValue('ops@example.com')
                ->end()
                ->integerNode('retention_days')
                    ->min(1)
                    ->defaultValue(30)
                ->end()
                ->booleanNode('auto_close')->defaultTrue()->end()
                ->arrayNode('severities')
                    ->scalarPrototype()->end()
                    ->defaultValue(['low', 'medium', 'high', 'critical'])
                ->end()
            ->end();
        return $treeBuilder;
    }
}`,
      ts: `# config/install/incident_tracker.settings.yml — the VALUES.
# Imported into active config ONCE at module install; never re-read.
notify_email: 'ops@example.com'
retention_days: 30
auto_close: true
severities: [low, medium, high, critical]

# config/schema/incident_tracker.schema.yml — the TYPES.
# Consulted at runtime on every save, validation, translation, test.
incident_tracker.settings:
  type: config_object          # base type for simple config
  label: 'Incident Tracker settings'
  constraints:
    FullyValidatable: ~        # 10.3+: opt in to full validation
  mapping:
    notify_email:
      type: email              # core type carrying an Email constraint
      label: 'Notification email'
    retention_days:
      type: integer
      label: 'Retention period (days)'
      constraints:
        Range:
          min: 1
    auto_close:
      type: boolean
      label: 'Auto-close resolved incidents'
    severities:
      type: sequence
      label: 'Severity levels'
      sequence:
        type: string
        label: 'Severity'`,
      note:
        "type: config_object marks simple config and contributes the langcode/_core keys. Schema labels power config translation; constraints power validation (and #config_target error messages in 10.2+); and strict test mode fails any save whose keys lack schema.",
    },
    {
      label: "Changing a shipped default after release",
      intro:
        "incident_tracker 1.1.0 wants retention_days to default to 90. Symfony just edits the compile-time default; Drupal must ALSO push the change into sites that installed under the old default.",
      php: `<?php
// Symfony: defaults live in CODE, applied at container compile.
// Edit the Configuration class, deploy, cache:clear — every env
// that didn't override the key in config/packages gets 90 at once.
$treeBuilder->getRootNode()
    ->children()
        ->integerNode('retention_days')
            ->min(1)
            ->defaultValue(90)   // was 30 — and that's the whole fix
        ->end()
    ->end();`,
      ts: `<?php
// Drupal: incident_tracker.post_update.php — ships ALONGSIDE the
// edited config/install file (which only helps FUTURE installs)
// and pushes the new value into already-installed sites.

/**
 * Raise the default retention period from 30 to 90 days.
 */
function incident_tracker_post_update_retention_90(): void {
  $config = \\Drupal::configFactory()
    ->getEditable('incident_tracker.settings');
  // Guard: only sites still on the old shipped default.
  // An admin who deliberately chose 14 days keeps 14 days.
  if ((int) $config->get('retention_days') === 30) {
    $config->set('retention_days', 90)->save();
  }
}`,
      note:
        "hook_post_update_NAME() runs during drush updb with a fully built container, which is why it's preferred over hook_update_N() for config edits. Either way: config/install alone never updates an existing site.",
    },
    {
      label: "Conditional config: prepend() vs config/optional",
      intro:
        "Config that should only exist when another module is around. Symfony writes imperative checks in the bundle extension; Drupal declares dependencies and lets the installer decide — now or whenever the dependency appears.",
      rightLang: "yaml",
      php: `<?php
// Symfony: conditional config is CODE — the bundle extension checks
// whether the other bundle is registered before prepending config.
namespace App\\DependencyInjection;

use Symfony\\Component\\DependencyInjection\\ContainerBuilder;
use Symfony\\Component\\DependencyInjection\\Extension\\PrependExtensionInterface;

class IncidentTrackerExtension extends Extension implements PrependExtensionInterface
{
    public function prepend(ContainerBuilder $container): void
    {
        // Only add Twig paths if TwigBundle is actually installed.
        if ($container->hasExtension('twig')) {
            $container->prependExtensionConfig('twig', [
                'paths' => ['%kernel.project_dir%/templates/incidents'],
            ]);
        }
    }
}`,
      ts: `# config/optional/views.view.incident_list.yml (top of the export)
# DECLARATIVE: installed only if every dependency can be satisfied —
# here, the views module. Skipped silently otherwise, and installed
# automatically later the moment views is enabled on the site.
langcode: en
status: true
dependencies:
  module:
    - views
  enforced:
    module:
      # enforced deps are NOT recalculated on save — this is what
      # guarantees the view is deleted when incident_tracker is
      # uninstalled, even after an admin re-saves it.
      - incident_tracker
id: incident_list
label: 'Incident list'
description: 'Recent incidents, filterable by severity.'
# (rest of the view export: displays, fields, filters, sorts)`,
      note:
        "Rule of thumb: config/install may only rely on your module's hard dependencies from the .info.yml, because it must ALWAYS install. Anything with softer requirements — a view, a pathauto pattern, extra field config — belongs in config/optional.",
    },
    {
      label: "Uninstall cleanup",
      intro:
        "What happens to the configuration when the package goes away. Flex un-applies its recipe best-effort; Drupal's config ownership makes removal exact and automatic.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: Flex "unconfigures" the recipe — removes
# config/packages/incident_tracker.yaml, the bundles.php line and
# recipe env vars. Best-effort: hand-edited config stays behind.
$ composer remove acme/incident-tracker-bundle
Symfony operations: 1 recipe (unconfiguring)
  - Unconfiguring acme/incident-tracker-bundle (>=1.0)`,
      ts: `# Drupal: uninstalling deletes every simple config the module owns
# by name prefix (incident_tracker.*), plus any config entity on the
# site that depends on it via dependencies.module (calculated or
# enforced) — unless the entity repairs itself in onDependencyRemoval().
$ drush pm:uninstall incident_tracker
The following extensions will be uninstalled: incident_tracker
Do you want to continue? (yes/no) [yes]: yes
 [success] Successfully uninstalled: incident_tracker

$ drush config:get incident_tracker.settings
# -> error: 'incident_tracker.settings' does not exist. Clean slate —
#    reinstalling re-imports the config/install defaults.`,
      note:
        "This is why install aborts when the module's config already exists: ownership must be unambiguous. If you ever hand-remove a module from the core.extension config (or delete its code while it's still installed) instead of properly uninstalling it, its orphaned config blocks reinstalling until you delete that too.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The whole lifecycle in plain PHP: schema-driven casting on save, install-once defaults, the 1.1.0 release that edits config/install to no effect, the post-update hook that actually fixes live sites, and the strict-schema failure an untyped key triggers in tests. Predict the output, then run.",
    code: `<?php
// Simulate the config lifecycle: config/install seeds the active store
// ONCE, the schema types every value on save, and only an update hook
// changes a shipped default on already-installed sites.

// config/schema/incident_tracker.schema.yml -> one type per key.
$schema = [
    'notify_email'   => 'email',
    'retention_days' => 'integer',
    'auto_close'     => 'boolean',
    'severities'     => 'sequence',
];

// Typed config: on save, every value is cast to its schema type.
// Missing schema = exactly what $strictConfigSchema tests punish.
function saveWithSchema(array &$active, string $name, array $data, array $schema): void {
    foreach ($data as $key => $value) {
        if (!isset($schema[$key])) {
            throw new RuntimeException("No schema for $name:$key");
        }
        $active[$name][$key] = match ($schema[$key]) {
            'integer'         => (int) $value,
            'boolean'         => (bool) $value,
            'email', 'string' => (string) $value,
            'sequence'        => array_values($value),
        };
    }
}

$active = [];

// 1. drush en incident_tracker -> config/install/*.yml imported ONCE.
//    YAML gives us loosely typed values; the schema fixes them on save.
$installFile = [
    'notify_email'   => 'ops@example.com',
    'retention_days' => '30',      // sloppily quoted in the YAML
    'auto_close'     => 1,
    'severities'     => ['low', 'medium', 'high', 'critical'],
];
saveWithSchema($active, 'incident_tracker.settings', $installFile, $schema);
echo "Installed. Schema-typed active config:\\n";
foreach ($active['incident_tracker.settings'] as $key => $value) {
    $shown = is_array($value)
        ? '[' . implode(', ', $value) . ']'
        : var_export($value, true);
    echo "  $key = $shown\\n";
}
echo "\\n";

// 2. Release 1.1.0 edits config/install (retention_days: 90).
//    Existing sites NEVER re-read that file:
$installFile['retention_days'] = '90';
echo "1.1.0 ships default 90; active still: "
    . $active['incident_tracker.settings']['retention_days'] . "\\n\\n";

// 3. So 1.1.0 must also ship a post-update hook.
function incident_tracker_post_update_retention_90(array &$active): void {
    $active['incident_tracker.settings']['retention_days'] = 90;
}
incident_tracker_post_update_retention_90($active);
echo "After drush updb: "
    . $active['incident_tracker.settings']['retention_days'] . "\\n\\n";

// 4. A developer adds a key but forgets the schema entry.
try {
    saveWithSchema($active, 'incident_tracker.settings',
        ['webhook_url' => 'https://hooks.example.test'], $schema);
} catch (RuntimeException $e) {
    echo "Strict schema check: " . $e->getMessage();
}`,
    output: `Installed. Schema-typed active config:
  notify_email = 'ops@example.com'
  retention_days = 30
  auto_close = true
  severities = [low, medium, high, critical]

1.1.0 ships default 90; active still: 30

After drush updb: 90

Strict schema check: No schema for incident_tracker.settings:webhook_url`,
  },

  keyPoints: [
    "config/install/incident_tracker.settings.yml ships default values that are imported into active config exactly once, at module install — the file name is the config name, and the incident_tracker. prefix marks ownership.",
    "Editing config/install after release does nothing on existing sites; ship a hook_post_update_NAME() that uses getEditable()->set()->save(), guarded so it only replaces the old default and never stomps admin-chosen values.",
    "config/schema/incident_tracker.schema.yml is runtime type metadata: type: config_object at the root, a mapping of string/integer/boolean/email keys, and type: sequence for lists — it drives type casting on save, config translation labels, and validation constraints (FullyValidatable in 10.3+).",
    "Kernel and functional tests run with $strictConfigSchema = TRUE, so saving config with missing or wrong schema throws — the schema file is effectively mandatory for a production module.",
    "Symfony's Configuration TreeBuilder applies defaults and validation once at container compile and discards the metadata; Drupal keeps schema alive at runtime, which is what makes admin forms, drush cset, translation and #config_target validation possible.",
    "config/optional installs only when a file's declared dependencies are satisfiable (and retries when they later become available); uninstalling the module automatically deletes all incident_tracker.* config plus config entities that depend on it via dependencies.module — calculated or enforced — unless they repair themselves in onDependencyRemoval(). Shipped config that doesn't functionally use the module needs dependencies: enforced: module:, because calculated dependencies are recalculated on every save.",
  ],

  interview: [
    {
      q: "You changed a default in config/install and deployed, but live sites still show the old value. What happened, and what is the right fix?",
      a: "config/install is only read once, when the module is installed — it seeds active configuration and is never consulted again, so editing it only affects future installs. The fix is to ship the edited YAML (for new sites) *plus* a `hook_post_update_NAME()` (or `hook_update_N()`) that loads the config with `\\Drupal::configFactory()->getEditable('incident_tracker.settings')`, sets the new value, and saves. Good practice is to guard the write — only overwrite if the stored value still equals the old shipped default — so you don't clobber values an admin changed deliberately. On config-managed sites the exported YAML in config/sync plus `drush cim` can play the same role, but a contrib-style module can't assume that workflow.",
    },
    {
      q: "What does a config schema file actually buy you? Could you skip it for a small custom module?",
      a: "Schema is Drupal's runtime type system for config: it casts values to their declared types on save (so `get('retention_days')` reliably returns an int), provides the labels and translatability metadata the config_translation UI needs, and carries validation constraints — with a top-level `FullyValidatable: ~` (Drupal 10.3+) opting the object into complete validation that `#config_target` forms surface as errors. Practically you can't skip it: kernel and functional tests run with `$strictConfigSchema = TRUE`, so the first test that saves your config throws on missing schema. It's a few lines of YAML mirroring your settings file — for `incident_tracker.settings` that's a `config_object` with a `mapping` of typed keys and a `sequence` for the severity list.",
    },
    {
      q: "Coming from Symfony, how do Drupal's config defaults and schema compare to a bundle's Configuration class?",
      a: "Symfony's `Configuration` TreeBuilder is one compile-time artifact that declares keys, merges defaults, and validates — invalid config aborts the container build, and afterwards only frozen parameters remain. Drupal splits this in two runtime files: config/install carries the defaults (copied into the database once at install, like a Flex recipe copying YAML at `composer require`), while config/schema carries the types and is consulted on every save. The consequence of staying runtime is flexibility — admins edit values, config is translatable and exportable — but weaker guarantees: `drush cset` will *cast* your value to the schema type, yet it does not enforce constraints — `Config::save()` only casts, so `drush cset incident_tracker.settings retention_days 0` still succeeds even with `Range: min: 1`. Constraints only fire where something explicitly validates the typed object: a `#config_target` form, a recipe config action, or core's own tests. Symfony, by contrast, would have refused to boot. The validatable-schema work (constraints, and FullyValidatable in 10.3+) is Drupal closing that gap.",
    },
    {
      q: "What is config/optional for, and what happens to all this config when the module is uninstalled?",
      a: "config/optional holds config that should install only if its declared dependencies are satisfiable — the classic example is shipping a `views.view.*` export that requires the views module: it's skipped silently if views is absent and installed automatically later if views gets enabled. config/install, by contrast, must always succeed, so it may only depend on hard dependencies from the .info.yml. On uninstall, Drupal deletes every simple config owned by the module's name prefix (`incident_tracker.*`) and removes config entities anywhere on the site that depend on the module via `dependencies.module` — calculated or enforced — unless they can repair themselves in `onDependencyRemoval()`. Because calculated dependencies are recalculated on every save, shipped config that doesn't functionally use the module (like our view) must list it under `dependencies: enforced: module:` to guarantee that cleanup. That ownership model is also why installation aborts if the module's config already exists.",
    },
  ],

  quiz: [
    {
      question:
        "incident_tracker 1.1.0 should default retention_days to 90 instead of 30. What must the release contain for existing sites to get the new value?",
      options: [
        "Just the edited config/install/incident_tracker.settings.yml — it re-imports on drush updb",
        "A cache rebuild step in the deployment script",
        "An edited config/install file for future installs PLUS a post-update hook that getEditable()->set()->save()s the value on existing sites",
        "A new config/optional file with the value 90",
      ],
      answerIndex: 2,
      explain:
        "config/install is read exactly once, at install time — updb, cache rebuilds and cron never re-import it. New installs pick up the edited YAML, but already-installed sites need hook_post_update_NAME() (or hook_update_N()) writing the value through an editable config object, ideally only when the old default is still in place.",
    },
    {
      question:
        "A kernel test saves incident_tracker.settings with a new webhook_url key you never added to incident_tracker.schema.yml. What happens?",
      options: [
        "The value is saved untyped and the test passes",
        "The test throws — kernel and functional tests enforce strict config schema on every save",
        "Drupal silently drops the unknown key",
        "Only config_translation features break; saving works fine",
      ],
      answerIndex: 1,
      explain:
        "Test base classes set $strictConfigSchema = TRUE, so every config save is checked against schema and missing or mismatched entries throw an exception. On a normal site the save would succeed untyped — which is exactly why the tests are strict: they catch the missing schema before release.",
    },
    {
      question:
        "incident_tracker ships config/optional/views.view.incident_list.yml but the site does not have the views module installed. What does the installer do?",
      options: [
        "Aborts the module install with a missing-dependency error",
        "Installs the view in a disabled state until views arrives",
        "Skips it silently — and installs it automatically later if views is ever enabled",
        "Moves the file to config/install for the next deployment",
      ],
      answerIndex: 2,
      explain:
        "That conditional behavior is the whole point of config/optional: config there installs only when all of its dependencies are satisfiable, is skipped without error otherwise, and gets another chance whenever new modules are enabled. A missing dependency in config/install, by contrast, would be a bug — that directory must always install.",
    },
    {
      question:
        "What does 'type: config_object' at the root of incident_tracker.settings's schema entry declare?",
      options: [
        "That the config is a config entity with an ID and status",
        "The base type for simple configuration, contributing the langcode and _core keys to the mapping",
        "That the object is immutable at runtime",
        "That the config must be fully validatable",
      ],
      answerIndex: 1,
      explain:
        "config_object is the schema base type for simple config files like MODULE.settings — it extends the mapping with the standard langcode and _core keys so your own mapping only declares your keys. Config entities use different types (config_entity and friends), and full validation is a separate opt-in via the FullyValidatable constraint (10.3+).",
    },
  ],
};

export default lesson;
