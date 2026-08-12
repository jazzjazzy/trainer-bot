import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "config-form-settings",
  title: "Module Settings: ConfigFormBase",
  part: "Forms & Config",
  estMinutes: 12,
  summary:
    "Give incident_tracker an admin settings page with ConfigFormBase — editable runtime config that site admins change in the UI, unlike Symfony's compile-time parameters.",

  concept: `
## One class, four methods

Every real module grows settings: where to send incident notifications, how long
to keep resolved incidents, which severity triggers an email. In Drupal those
live in a **simple config object** — \`incident_tracker.settings\` — and the
admin page that edits it is a \`ConfigFormBase\` subclass. The four methods you
write are the same in Drupal 10 and 11 — but **if you override the constructor
to inject a service, Drupal 11 requires a second argument**: \`create()\` must
pass \`$container->get('config.typed')\` and \`__construct()\` must forward it as
\`parent::__construct($config_factory, $typed_config_manager)\`
(\`TypedConfigManagerInterface\`). Omitting it is deprecated in 10.2 and a fatal
\`ArgumentCountError\` in 11. The example below never overrides the constructor,
so it's safe as written. It's \`FormBase\` plus config plumbing:

- \`getFormId()\` — unique form ID, as always.
- \`getEditableConfigNames()\` — return \`['incident_tracker.settings']\`. This
  is the important one: for any name in this list, \`$this->config()\` hands
  back an **editable** (mutable, override-free) config object. Any other name
  returns the usual immutable read-only object.
- \`buildForm()\` — pull current values with
  \`$this->config('incident_tracker.settings')->get('retention_days')\` into
  each element's \`#default_value\`, then \`return parent::buildForm(...)\` —
  the parent adds the "Save configuration" submit button.
- \`submitForm()\` — chain \`->set('key', $form_state->getValue('key'))\` calls
  and finish with \`->save()\`, then call \`parent::submitForm(...)\` for the
  "The configuration options have been saved." status message.

Scaffold the whole thing with \`drush generate form:config\` if you like.

## Compile-time vs runtime configuration

This is a genuine mental-model shift from Symfony. There, a bundle's
\`Configuration\` class validates \`config/packages/*.yaml\` while the container
**compiles**; values are frozen in as parameters, and changing one means editing
a file, committing, deploying, and rebuilding the cache. Drupal config is
**runtime data**: it lives in the database, a site admin with the right
permission changes it through the form you just wrote, and \`drush cex\`
exports the current values to YAML for git (with \`drush cim\` applying them on
deploy). Your module's settings join the same config pipeline as core's.

## Wiring the page

Three YAML wires make it a real admin page:

- **Route** in \`incident_tracker.routing.yml\`: \`_form\` points at the class,
  \`_permission\` guards it. Convention: paths under
  \`/admin/config/{category}/{module}\`.
- **Menu link** in \`incident_tracker.links.menu.yml\` with
  \`parent: system.admin_config_system\`, so the page is discoverable on
  \`/admin/config\` instead of being an unlisted URL.
- **Permission** in \`incident_tracker.permissions.yml\` — a dedicated
  \`administer incident tracker\` permission with \`restrict access: true\`,
  which warns admins it's security-sensitive.

## Defaults — and less boilerplate in 10.2+

Initial values ship in \`config/install/incident_tracker.settings.yml\`. That
file is copied into active config **once, at module install** — editing it
later does nothing on existing sites (that's what update hooks are for).

Since Drupal 10.2, you can also put
\`'#config_target' => 'incident_tracker.settings:retention_days'\` on an
element: \`ConfigFormBase\` then loads the default value *and* saves the
submitted value for you, and validates it against the config schema — the
schema we'll write in the next section, which is what makes the config object
"typed".
`,

  comparisons: [
    {
      label: "Defining the settings surface",
      intro:
        "Both frameworks make you declare what settings exist — but Symfony does it in a compile-time tree while Drupal does it as an admin-facing form over an editable config object.",
      php: `<?php
// Symfony: DependencyInjection/Configuration.php — a COMPILE-TIME
// definition. Values come from config/packages/incident_tracker.yaml
// and are frozen into the container as parameters. No runtime UI.
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
                ->scalarNode('notify_email')->defaultValue('')->end()
                ->integerNode('retention_days')->defaultValue(30)->end()
                ->enumNode('severity_threshold')
                    ->values(['notice', 'warning', 'critical'])
                    ->defaultValue('warning')
                ->end()
            ->end();
        return $treeBuilder;
    }
}`,
      ts: `<?php
// Drupal: src/Form/IncidentTrackerSettingsForm.php — a RUNTIME
// admin page editing the incident_tracker.settings config object.
namespace Drupal\\incident_tracker\\Form;

use Drupal\\Core\\Form\\ConfigFormBase;
use Drupal\\Core\\Form\\FormStateInterface;

class IncidentTrackerSettingsForm extends ConfigFormBase {

  public function getFormId() {
    return 'incident_tracker_settings';
  }

  protected function getEditableConfigNames() {
    return ['incident_tracker.settings'];
  }

  public function buildForm(array $form, FormStateInterface $form_state) {
    $config = $this->config('incident_tracker.settings');
    $form['notify_email'] = [
      '#type' => 'email',
      '#title' => $this->t('Notification email'),
      '#default_value' => $config->get('notify_email'),
    ];
    $form['retention_days'] = [
      '#type' => 'number',
      '#title' => $this->t('Retention period (days)'),
      '#min' => 1,
      '#default_value' => $config->get('retention_days'),
    ];
    $form['severity_threshold'] = [
      '#type' => 'select',
      '#title' => $this->t('Notify from severity'),
      '#options' => [
        'notice' => $this->t('Notice'),
        'warning' => $this->t('Warning'),
        'critical' => $this->t('Critical'),
      ],
      '#default_value' => $config->get('severity_threshold'),
    ];
    // Parent adds the "Save configuration" button.
    return parent::buildForm($form, $form_state);
  }

  public function submitForm(array &$form, FormStateInterface $form_state) {
    $this->config('incident_tracker.settings')
      ->set('notify_email', $form_state->getValue('notify_email'))
      ->set('retention_days', (int) $form_state->getValue('retention_days'))
      ->set('severity_threshold', $form_state->getValue('severity_threshold'))
      ->save();
    // Parent adds the "configuration saved" status message.
    parent::submitForm($form, $form_state);
  }

}`,
      note:
        "getEditableConfigNames() is what makes $this->config('incident_tracker.settings') return a mutable, save()-able object instead of the usual immutable one. Since 10.2, '#config_target' => 'incident_tracker.settings:notify_email' can replace the manual default/set() wiring.",
    },
    {
      label: "Where the values live",
      intro:
        "Symfony values are part of the codebase; Drupal's install YAML is only a seed — the live values sit in the database and round-trip to git via config export.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/incident_tracker.yaml — part of the CODEBASE.
# Changing a value = edit file, commit, deploy, rebuild the
# container. Admins never touch it.
incident_tracker:
  notify_email: 'ops@example.com'
  retention_days: 30
  severity_threshold: warning`,
      ts: `# config/install/incident_tracker.settings.yml — INITIAL values,
# copied into the active store ONCE when the module is installed.
# After that, admins edit them on the settings page at runtime;
# 'drush cex' exports the live values to config/sync for git.
notify_email: 'ops@example.com'
retention_days: 30
severity_threshold: warning`,
      note:
        "Editing config/install later does NOT update existing sites — the file is read only at install time. Changing a shipped default on live sites takes an update hook.",
    },
    {
      label: "Route + admin menu link + permission",
      intro:
        "Making the form reachable and guarded: Symfony uses a route attribute and a role check; Drupal wires three YAML files so the page also appears in the /admin/config index.",
      rightLang: "yaml",
      php: `<?php
// Symfony: a route + security attribute on a controller action.
// There is no framework-provided admin menu to register into —
// you build (or install) your own admin UI.
use Symfony\\Component\\HttpFoundation\\Request;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;
use Symfony\\Component\\Security\\Http\\Attribute\\IsGranted;

class SettingsController
{
    #[Route('/admin/incident-tracker', name: 'incident_tracker_settings')]
    #[IsGranted('ROLE_ADMIN')]
    public function settings(Request $request): Response
    {
        // render + handle the form...
    }
}`,
      ts: `# incident_tracker.routing.yml
incident_tracker.settings:
  path: '/admin/config/system/incident-tracker'
  defaults:
    _form: '\\Drupal\\incident_tracker\\Form\\IncidentTrackerSettingsForm'
    _title: 'Incident Tracker'
  requirements:
    _permission: 'administer incident tracker'

# incident_tracker.links.menu.yml — shows up on /admin/config
incident_tracker.settings:
  title: 'Incident Tracker'
  description: 'Notification email, retention and severity threshold.'
  route_name: incident_tracker.settings
  parent: system.admin_config_system

# incident_tracker.permissions.yml
administer incident tracker:
  title: 'Administer Incident Tracker'
  restrict access: true`,
      note:
        "_form (not _controller) tells the routing system to build the form via the form builder. 'restrict access: true' flags the permission with a security warning on the permissions page.",
    },
    {
      label: "Reading the value elsewhere in the module",
      intro:
        "The cleanup cron and the notifier service both need retention_days. Symfony injects a frozen parameter; Drupal reads the current (immutable) config at call time.",
      php: `<?php
// Symfony: a container PARAMETER — resolved at compile time,
// identical until the next deploy.
use Symfony\\Component\\DependencyInjection\\Attribute\\Autowire;

class IncidentJanitor
{
    public function __construct(
        #[Autowire(param: 'incident_tracker.retention_days')]
        private int $retentionDays,
    ) {}
}`,
      ts: `<?php
// Drupal: inject config.factory; ->get() returns the IMMUTABLE
// config — live values, with settings.php overrides applied.
use Drupal\\Core\\Config\\ConfigFactoryInterface;

class IncidentJanitor {

  public function __construct(
    private readonly ConfigFactoryInterface $configFactory,
  ) {}

  public function retentionDays(): int {
    return (int) $this->configFactory
      ->get('incident_tracker.settings')
      ->get('retention_days');
  }

}`,
      note:
        "Outside a ConfigFormBase, always use the immutable get() — it applies per-environment $config overrides from settings.php. The editable object deliberately ignores overrides so admins edit the stored values.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The whole editable-config roundtrip in plain PHP: install defaults seed the store, buildForm() reads them, submitForm() chains set()->save(), and other code reads the new values. Predict the output, then run.",
    code: `<?php
// Simulate Drupal's editable config + the ConfigFormBase lifecycle:
// install defaults -> buildForm() -> admin submits -> set()->save().

// The active config store (lives in the database on a real site).
class ConfigStorage {
    private array $records = [];

    public function write(string $name, array $data): void {
        $this->records[$name] = $data;
    }

    public function read(string $name): array {
        return $this->records[$name] ?? [];
    }
}

// Stand-in for the EDITABLE Config object that $this->config() returns
// inside ConfigFormBase for names listed in getEditableConfigNames().
class Config {
    private array $data;

    public function __construct(
        private string $name,
        private ConfigStorage $storage,
    ) {
        $this->data = $storage->read($name);
    }

    public function get(string $key): mixed {
        return $this->data[$key] ?? null;
    }

    public function set(string $key, mixed $value): static {
        $this->data[$key] = $value;
        return $this;          // fluent, so ->set()->set()->save() chains
    }

    public function save(): void {
        $this->storage->write($this->name, $this->data);
        echo "[saved " . $this->name . "]\\n";
    }
}

$db = new ConfigStorage();

// 1. Module install: config/install/incident_tracker.settings.yml is
//    copied into the active store ONCE. These are just initial values.
$db->write('incident_tracker.settings', [
    'notify_email'       => 'ops@example.com',
    'retention_days'     => 30,
    'severity_threshold' => 'warning',
]);

// 2. buildForm(): read current values into each #default_value.
$config = new Config('incident_tracker.settings', $db);
echo "buildForm() defaults:\\n";
echo "  notify_email:       " . $config->get('notify_email') . "\\n";
echo "  retention_days:     " . $config->get('retention_days') . "\\n";
echo "  severity_threshold: " . $config->get('severity_threshold') . "\\n\\n";

// 3. An admin edits the page and hits "Save configuration".
//    submitForm() maps $form_state->getValue() -> set() -> save():
$formValues = [
    'notify_email'   => 'incidents@example.com',
    'retention_days' => '90',    // form values arrive as strings!
];
$config
    ->set('notify_email', $formValues['notify_email'])
    ->set('retention_days', (int) $formValues['retention_days'])
    ->save();

// 4. Any other service now reads the updated values.
$readBack = new Config('incident_tracker.settings', $db);
echo "\\nwhat cron / controllers now read:\\n";
echo "  notify_email:   " . $readBack->get('notify_email') . "\\n";
echo "  retention_days: " . var_export($readBack->get('retention_days'), true) . "\\n";
echo "\\n'drush cex' would export these live values back to YAML.";`,
    output: `buildForm() defaults:
  notify_email:       ops@example.com
  retention_days:     30
  severity_threshold: warning

[saved incident_tracker.settings]

what cron / controllers now read:
  notify_email:   incidents@example.com
  retention_days: 90

'drush cex' would export these live values back to YAML.`,
  },

  keyPoints: [
    "ConfigFormBase = FormBase + config plumbing: getFormId(), getEditableConfigNames(), buildForm() pulling #default_value from $this->config(), submitForm() doing ->set()->save() — and always call the parent build/submit implementations.",
    "D10 vs D11 trap unique to ConfigFormBase (plain FormBase has none): if you override the constructor to inject a service, ConfigFormBase::__construct() takes a second TypedConfigManagerInterface argument — create() must pass $container->get('config.typed') and __construct() must forward it to parent::__construct($config_factory, $typed_config_manager). Optional (deprecated) in 10.2, required in 11.0, where omitting it is a fatal ArgumentCountError.",
    "getEditableConfigNames() returning ['incident_tracker.settings'] is what makes $this->config('incident_tracker.settings') hand back a mutable, override-free object you can save(); other names come back immutable.",
    "A settings page needs three YAML wires: a route using _form with a _permission requirement, a menu link parented under system.admin_config_system, and a dedicated permission with restrict access: true.",
    "config/install/incident_tracker.settings.yml seeds values exactly once at module install — editing it later does nothing on existing sites; ship an update hook to change live defaults.",
    "Symfony parameters are compile-time (edit YAML, deploy, rebuild container); Drupal simple config is runtime data admins edit in the UI, exported to git with drush cex and applied on deploy with drush cim.",
    "Since Drupal 10.2, '#config_target' => 'incident_tracker.settings:key' on an element makes ConfigFormBase load and save the value itself, validated against the config schema.",
  ],

  interview: [
    {
      q: "Walk me through adding a settings page to a custom Drupal module.",
      a: "Create a form class extending `ConfigFormBase` with four methods: `getFormId()`, `getEditableConfigNames()` returning the config name (e.g. `incident_tracker.settings`), `buildForm()` that reads current values from `$this->config()` into each element's `#default_value` and returns `parent::buildForm()`, and `submitForm()` that chains `->set()` calls and `->save()`. Then wire it up with a route whose defaults use `_form` and whose requirements use a dedicated `_permission`, a menu link parented under `system.admin_config_system` so it appears on `/admin/config`, and the permission itself in `MODULE.permissions.yml`. Ship initial values in `config/install/MODULE.settings.yml` and a config schema so the values are typed and validatable. `drush generate form:config` scaffolds most of this.",
    },
    {
      q: "What is the difference between $this->config() inside a ConfigFormBase and an injected config factory's get() elsewhere?",
      a: "Inside `ConfigFormBase`, `$this->config()` returns an **editable** config object for any name listed in `getEditableConfigNames()` — mutable, saveable, and deliberately *ignoring* overrides so the admin edits the actually-stored values. Everywhere else you call `$configFactory->get()`, which returns an **immutable** object: read-only, and with per-environment `$config` overrides from `settings.php` applied. Mixing these up is a classic bug — reading via the editable object in normal code silently bypasses environment overrides, and trying to `set()` on an immutable object throws. So: editable only in the form that owns the config, immutable for all consumers.",
    },
    {
      q: "Coming from Symfony, how would you contrast bundle configuration with Drupal's config system?",
      a: "Symfony bundle config is compile-time: a `Configuration` class validates `config/packages/*.yaml` when the container is built, and values are frozen in as parameters until the next deploy — admins can't change them. Drupal simple config is runtime data in the database: site admins with the right permission edit it through a `ConfigFormBase` page, and it participates in the config-management pipeline — `drush cex` exports live values to YAML in git, `drush cim` applies them on deploy. The moral equivalent of Symfony's per-environment parameter overrides is `$config['incident_tracker.settings']['notify_email'] = ...` in `settings.php`, which immutable config applies transparently. The trade-off: Drupal gains admin editability and exportability, but you must think about drift between environments, which the export/import workflow manages.",
    },
  ],

  quiz: [
    {
      question:
        "What does getEditableConfigNames() actually control in a ConfigFormBase subclass?",
      options: [
        "Which YAML files in config/install get imported when the module is installed",
        "For which config names $this->config() returns a mutable, override-free object that can be save()d",
        "Which permissions are required to view the settings form",
        "The machine name of the form element IDs",
      ],
      answerIndex: 1,
      explain:
        "getEditableConfigNames() whitelists the config objects this form may edit: for those names, $this->config() returns an editable (mutable, override-ignoring) object so submitForm() can ->set()->save(). Any other name yields the normal immutable config. It has nothing to do with install-time imports or permissions.",
    },
    {
      question:
        "You change a default in config/install/incident_tracker.settings.yml and deploy. What happens on sites where the module is already installed?",
      options: [
        "Nothing — that file is only read once, at module install time",
        "The new value is applied on the next cache rebuild",
        "The new value is applied the next time drush cron runs",
        "The settings form resets to the new default",
      ],
      answerIndex: 0,
      explain:
        "config/install YAML seeds the active configuration exactly once, when the module is installed. Existing sites keep their stored values. To change a shipped default on live sites you write an update hook (or use the config import workflow) that sets and saves the new value.",
    },
    {
      question:
        "Why must buildForm() end with 'return parent::buildForm($form, $form_state);'?",
      options: [
        "It saves the configuration object",
        "It registers the route for the form",
        "It adds the 'Save configuration' submit button (and #config_target processing) to the form",
        "It validates the form against the config schema in all Drupal versions",
      ],
      answerIndex: 2,
      explain:
        "ConfigFormBase::buildForm() appends the actions element with the 'Save configuration' submit button — skip the parent call and your settings page renders with no way to submit. (In 10.2+ the parent is also where #config_target wiring hooks in.) Saving happens later, in submitForm().",
    },
  ],
};

export default lesson;
