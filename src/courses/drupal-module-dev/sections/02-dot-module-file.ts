import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "dot-module-file",
  title: "The .module File: Where Procedural Code Lives",
  part: "Module Anatomy & Scaffolding",
  estMinutes: 11,
  summary:
    "incident_tracker.module is a plain PHP include Drupal loads on every request to discover hook implementations by function name — keep it to thin hook glue, push real logic into src/ classes, and on Drupal 11.1+ replace it entirely with #[Hook] attribute classes.",

  concept: `
## A file with no Symfony equivalent

Section 1 gave incident_tracker its identity card (the info.yml). Now the first
behaviour. The moment the module is enabled, Drupal's module handler includes
\`incident_tracker.module\` near the start of **every request** — whether or not
anything in it will run. It is not a class, it has no namespace, and the
autoloader never touches it: it is a plain procedural PHP file. The nearest
Symfony analogue is a functions file wired through composer.json's \`"files"\`
autoload — something you would almost never do in Symfony, but which is
bread-and-butter Drupal.

### Function-name-is-the-registration

Everything in the file rides on one convention: to implement \`hook_NAME\`, you
define a function named \`incident_tracker_NAME()\`.

- \`hook_help\` → \`incident_tracker_help()\`
- \`hook_cron\` → \`incident_tracker_cron()\`
- \`hook_ENTITY_TYPE_presave\` for incident nodes →
  \`incident_tracker_node_presave()\`

When core fires a hook, the module handler concatenates each enabled module's
machine name with the hook name and calls every function that exists — in
module-weight order. No interface, no service tag, no YAML: in the procedural
form **the name is the wiring**. Two practical consequences: a typo silently
unregisters your implementation, and the discovered list is **cached**, so run
\`drush cr\` after adding a new hook or it will never fire.

### What belongs here — and what doesn't

Only two things belong in \`.module\`: **hook implementations** and **tiny
procedural helpers** — a preprocess function like
\`incident_tracker_preprocess_node()\`, or a private \`_incident_tracker_*()\`
helper a hook body calls. Note one thing that no longer qualifies: render
callbacks (\`#lazy_builder\`, \`#pre_render\`, \`#post_render\`,
\`#access_callback\`) must be a method on a class implementing
\`TrustedCallbackInterface\` — named directly or as a \`service_id:method\`
string — or a closure. Since Drupal 9.0 a bare function name there throws
\`UntrustedCallbackException\`, so a lazy builder is a service method, never a
\`.module\` function. Keep
each hook a few lines: filter early, then hand off to a service. Everything
else — controllers, forms, plugins, business logic — lives in \`src/\` as PSR-4
classes. Three reasons the file is a bad home for logic: it is parsed on every
request; it has no constructor injection (you fall back to \`\\Drupal::service()\`
statics); and free functions are painful to unit test. A module with no hooks
needs no \`.module\` file at all — the file is optional.

### Drupal 11.1+: the file can disappear

Since 11.1, hooks can be **methods on a class** in \`src/Hook/\`
(namespace \`Drupal\\incident_tracker\\Hook\`) marked with the
\`#[Hook('cron')]\` attribute. \`HookCollectorPass\` scans that namespace at
container compile time and registers each class as an autowired service — real
constructor DI in a hook, and a \`.module\` file that can shrink to nothing. If
you must support Drupal 10 too, keep the procedural function as a shim marked
\`#[LegacyHook]\` that delegates to the class: old cores ignore the attribute and
run the function; 11.1+ calls the method and skips the shim so it never fires
twice. One catch the shim depends on: \`HookCollectorPass\` only exists from
11.1, so on **Drupal ≤ 11.0 the hook class is not auto-registered**. You must
declare it yourself in \`incident_tracker.services.yml\` with
\`autowire: true\` and have the shim resolve it via
\`\\Drupal::service(IncidentTrackerHooks::class)\` — otherwise the delegation
dies with a \`ServiceNotFoundException\`. Section 11 shows the full pattern.

### The siblings: .install and .post_update.php

Two files next door use the same name-is-registration convention with different
loading rules. \`incident_tracker.install\` holds \`hook_install()\`,
\`hook_uninstall()\`, \`hook_schema()\` and \`hook_update_N()\` and is loaded **only
during install and update operations**, never on normal requests.
\`incident_tracker.post_update.php\` holds
\`incident_tracker_post_update_NAME()\` callbacks for data fixes after code
deploys. Both get full sections in Part 4 — for now, just recognise the family.
`,

  comparisons: [
    {
      label: "The always-loaded functions file",
      intro:
        "Where does per-request procedural code live? Symfony barely has the concept; Drupal gives every module a dedicated file for it, and hook_help is the classic first tenant.",
      php: `// Symfony has no hooks, so it has no .module file. The closest
// analogue is a functions file loaded on EVERY request via
// composer.json:
//   "autoload": { "files": ["src/functions.php"] }

// src/functions.php
function app_incident_ref(int $id): string
{
    return sprintf('INC-%05d', $id);
}

// Idiomatic Symfony would make this a service method instead —
// an always-loaded procedural file is the exception there,
// but the rule in Drupal.`,
      ts: `<?php

/**
 * @file
 * Hook implementations for the Incident Tracker module.
 */

use Drupal\\Core\\Routing\\RouteMatchInterface;

/**
 * Implements hook_help().
 */
function incident_tracker_help($route_name, RouteMatchInterface $route_match) {
  if ($route_name === 'help.page.incident_tracker') {
    return '<p>' . t('Logs and escalates production incidents.') . '</p>';
  }
}`,
      note: "The @file docblock is a Drupal coding-standards requirement, and every hook gets an 'Implements hook_NAME().' docblock — phpcs (Drupal standard) enforces both. The function fires purely because of its name.",
    },
    {
      label: "A lifecycle hook that stays thin",
      intro:
        "Run logic just before an incident is saved. Symfony registers a listener class with injected dependencies; the Drupal .module version is one line of glue that delegates to a service.",
      php: `// Symfony: a Doctrine listener — explicit registration via an
// attribute, dependencies injected through the constructor.
namespace App\\EventListener;

use App\\Entity\\Incident;
use App\\Service\\EscalationPolicy;
use Doctrine\\Bundle\\DoctrineBundle\\Attribute\\AsEntityListener;
use Doctrine\\ORM\\Events;

#[AsEntityListener(event: Events::prePersist, entity: Incident::class)]
final class IncidentListener
{
    public function __construct(private EscalationPolicy $policy) {}

    public function prePersist(Incident $incident): void
    {
        $this->policy->apply($incident);
    }
}`,
      ts: `// incident_tracker.module — hook_ENTITY_TYPE_presave. The NAME
// pre-filters the entity TYPE: {module}_{entity_type}_presave.
// Incidents are nodes of bundle 'incident', so the type is 'node'
// and the bundle still needs an explicit guard.
use Drupal\\Core\\Entity\\EntityInterface;

/**
 * Implements hook_ENTITY_TYPE_presave() for node entities.
 */
function incident_tracker_node_presave(EntityInterface $node) {
  // Filter early — this fires for EVERY node, not just incidents.
  if ($node->bundle() !== 'incident') {
    return;
  }
  // Thin glue only: a .module file has no constructor DI, so grab
  // the service statically and hand off immediately. The
  // EscalationPolicy service itself is built in Part 2.
  \\Drupal::service('incident_tracker.escalation')->apply($node);
}`,
      note: "Generic hook_entity_presave() fires for EVERY entity type and needs a manual getEntityTypeId() check; the ENTITY_TYPE variant filters the type by naming — but never the bundle, which is why the bundle() guard stays. Either way, real logic belongs in the service, not the hook body.",
    },
    {
      label: "Drupal 11.1+: the OOP hook class",
      intro:
        "Modern Symfony puts listeners on autowired classes with attributes — and since Drupal 11.1, hooks work the same way. The whole .module file can collapse into one class in src/Hook/.",
      php: `// Symfony 6.4/7: #[AsEventListener] on a method of an
// autowired class.
namespace App\\EventListener;

use App\\Event\\IncidentSaving;
use App\\Service\\EscalationPolicy;
use Symfony\\Component\\EventDispatcher\\Attribute\\AsEventListener;

final class IncidentHooks
{
    public function __construct(private EscalationPolicy $policy) {}

    #[AsEventListener]
    public function onIncidentSaving(IncidentSaving $event): void
    {
        $this->policy->apply($event->incident);
    }
}`,
      ts: `// src/Hook/IncidentTrackerHooks.php (Drupal 11.1+).
// HookCollectorPass scans Drupal\\incident_tracker\\Hook and
// registers this class as an autowired service.
namespace Drupal\\incident_tracker\\Hook;

use Drupal\\Core\\Entity\\EntityInterface;
use Drupal\\Core\\Hook\\Attribute\\Hook;
use Drupal\\incident_tracker\\EscalationPolicy;

class IncidentTrackerHooks {

  // Autowired by TYPE: the container needs a service whose id (or
  // alias) is the FQCN. Ours is the string 'incident_tracker.escalation'
  // (see the presave comparison), so incident_tracker.services.yml must
  // also add the class-name alias — core did the same when it converted
  // its own hooks:
  //   Drupal\\incident_tracker\\EscalationPolicy: '@incident_tracker.escalation'
  // Without it, drush cr fails with an AutowiringFailedException.
  public function __construct(private EscalationPolicy $policy) {}

  #[Hook('node_presave')]
  public function nodePresave(EntityInterface $node): void {
    if ($node->bundle() !== 'incident') {
      return;
    }
    $this->policy->apply($node);
  }

  #[Hook('cron')]
  public function cron(): void {
    // Close stale incidents — fleshed out in the cron section.
  }

}`,
      note: "Supporting D10 and D11 from one codebase? Keep the procedural function in .module, mark it #[LegacyHook], and have it delegate via \\Drupal::service(IncidentTrackerHooks::class) — ≤11.0 ignores the attribute and runs the shim; 11.1+ calls the method and skips it. Crucially, ≤11.0 has no HookCollectorPass, so nothing auto-registers the hook class: declare it yourself in incident_tracker.services.yml with autowire: true or the shim throws ServiceNotFoundException. Section 11 has the full pattern.",
    },
    {
      label: "Preview: the .install / .post_update.php siblings",
      intro:
        "Where one-time setup and deploy-time changes live. Symfony uses migration classes run explicitly; Drupal uses sibling files with the same naming convention but stricter loading rules.",
      php: `// Symfony: schema changes and one-off fixes are migration
// classes, executed explicitly:
//   bin/console doctrine:migrations:migrate
final class Version20260808093000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql(
            'ALTER TABLE incident ADD escalated TINYINT(1) DEFAULT 0'
        );
    }
}`,
      ts: `// incident_tracker.install — loaded ONLY during install/update
// operations (drush en, drush updb), never on normal requests.

/**
 * Implements hook_install().
 */
function incident_tracker_install() {
  \\Drupal::messenger()->addStatus(t('Incident Tracker installed.'));
}

/**
 * Adds the escalated flag for existing sites (runs once via drush updb).
 */
function incident_tracker_update_10101() {
  // Schema change — full treatment in the update-hooks section.
}

// incident_tracker.post_update.php — data fixes after deploys:
//   function incident_tracker_post_update_backfill_escalations() {}`,
      note: "Same function-name-is-the-registration model, different lifecycle: .module loads every request, .install only during install/update operations, .post_update.php only when drush updb looks for pending post-updates.",
    },
  ],

  playground: {
    intro:
      "A miniature ModuleHandler: three .module files' worth of functions, then invokeAll() builds each candidate name with string concatenation and calls whichever exist — missing implementations are skipped, by-reference arguments accumulate changes, and order follows the module list.",
    lang: "php",
    code: `<?php

// Pretend each enabled module's .module file was already include'd.
// Order = module weight, then alphabetical -- exactly how Drupal iterates.
$enabled = ['audit_log', 'incident_tracker', 'slack_notify'];

// --- audit_log.module -----------------------------------------------
function audit_log_node_presave(array &$node): void {
  $node['changed'] = '2026-08-08T09:00:00';
}
function audit_log_cron(): void {
  echo "  audit_log_cron(): rotated the audit table\\n";
}

// --- incident_tracker.module (ours) ---------------------------------
function incident_tracker_node_presave(array &$node): void {
  // The function NAME filtered the entity type down to 'node';
  // the bundle is still ours to check.
  if ($node['bundle'] !== 'incident') {
    return;
  }
  if ($node['severity'] === 'critical' && !$node['escalated']) {
    $node['escalated'] = true;
  }
}
function incident_tracker_cron(): void {
  echo "  incident_tracker_cron(): closed 2 stale incidents\\n";
}

// --- slack_notify.module (implements cron only) ---------------------
function slack_notify_cron(): void {
  echo "  slack_notify_cron(): pinged #incidents channel\\n";
}

// A miniature ModuleHandler::invokeAll(). The function's NAME is the
// registration: build "{module}_{hook}" and call whichever ones exist.
function invoke_all(array $modules, string $hook, mixed &$payload = null): void {
  echo "invokeAll('$hook'):\\n";
  foreach ($modules as $module) {
    $fn = $module . '_' . $hook;
    if (function_exists($fn)) {
      echo "  -> $fn()\\n";
      $fn($payload);
    } else {
      echo "  (no $fn, skipped)\\n";
    }
  }
}

$node = [
  'title' => 'DB replica lag',
  'bundle' => 'incident',
  'severity' => 'critical',
  'escalated' => false,
];

invoke_all($enabled, 'node_presave', $node);

echo "\\nnode after presave:\\n";
var_export($node);
echo "\\n\\n";

invoke_all($enabled, 'cron');`,
    output: `invokeAll('node_presave'):
  -> audit_log_node_presave()
  -> incident_tracker_node_presave()
  (no slack_notify_node_presave, skipped)

node after presave:
array (
  'title' => 'DB replica lag',
  'bundle' => 'incident',
  'severity' => 'critical',
  'escalated' => true,
  'changed' => '2026-08-08T09:00:00',
)

invokeAll('cron'):
  -> audit_log_cron()
  audit_log_cron(): rotated the audit table
  -> incident_tracker_cron()
  incident_tracker_cron(): closed 2 stale incidents
  -> slack_notify_cron()
  slack_notify_cron(): pinged #incidents channel
`,
  },

  keyPoints: [
    "incident_tracker.module is a plain procedural PHP file the module handler includes on every request once the module is enabled — no class, no namespace, never autoloaded. It is optional: a module with no hooks needs no .module file.",
    "Function-name-is-the-registration: implement hook_NAME by defining incident_tracker_NAME(). The module handler builds candidate names per enabled module and calls the ones that exist — and the list is cached, so drush cr after adding a new hook.",
    "Only hook implementations and tiny helpers belong in .module. Real logic goes in src/ classes: the file loads every request, has no constructor DI (only \\Drupal:: statics), and free functions resist unit testing.",
    "hook_ENTITY_TYPE_presave (incident_tracker_node_presave) filters by entity type through its name but never by bundle — incidents are nodes of bundle 'incident', so guard with $node->bundle() before delegating. The generic hook_entity_presave fires for every type and needs a manual getEntityTypeId() check too.",
    "Drupal 11.1+: #[Hook('name')] methods on classes in src/Hook/ are discovered by HookCollectorPass and registered as autowired services — the .module file can shrink to nothing. #[LegacyHook] shims keep one codebase working on Drupal 10, but on ≤11.0 you must declare the hook class in services.yml with autowire: true yourself.",
    "The siblings share the naming convention but not the lifecycle: .install (hook_install/hook_schema/hook_update_N) loads only during install/update operations; .post_update.php holds post-deploy data callbacks.",
  ],

  interview: [
    {
      q: "When is a module's .module file loaded, and what should — and shouldn't — go in it?",
      a: "It is included by the module handler near the start of **every request** once the module is enabled, whether or not any of its functions will run — the closest Symfony analogue is a composer.json `\"files\"` autoload entry. It should contain only hook implementations and small procedural helpers; each hook should filter early and delegate to a service in `src/`. Business logic doesn't belong there because the file adds parse weight to every request, offers no constructor injection (you're stuck with `\\Drupal::service()` statics), and plain functions are awkward to unit test. A module with no hooks can omit the file entirely.",
    },
    {
      q: "How does Drupal find your hook implementation, and why might a freshly written hook never fire?",
      a: "Discovery is a **naming convention**: for `hook_cron`, the module handler builds `{module}_cron` for every enabled module and invokes each function that exists — the function's name is the entire registration. There's no tag, interface, or attribute in the procedural form, which also means a typo in the name silently unregisters you. The most common reason a new hook never fires is caching: Drupal caches the list of discovered implementations, so you must rebuild caches (`drush cr`) after adding one. Order of invocation follows module weight, then alphabetical order.",
    },
    {
      q: "Your module must support both Drupal 10 and 11. How do you approach the new OOP hook classes?",
      a: "The `#[Hook]` attribute only exists from Drupal **11.1**, so a D10-compatible module can't rely on it alone. The bridge pattern: write the implementation as a method on a class in `Drupal\\mymodule\\Hook` with `#[Hook('cron')]`, and keep a procedural function in `.module` marked `#[LegacyHook]` that delegates to that class via `\\Drupal::service(MyModuleHooks::class)`. On 11.1+, `HookCollectorPass` registers the class as an autowired service, invokes the method, and skips the `#[LegacyHook]` function so it can't run twice; on 10.x the unknown attribute is inert and the procedural shim runs. The detail people miss: **`HookCollectorPass` doesn't exist on ≤11.0**, so nothing auto-registers the hook class there — you must declare it yourself in `mymodule.services.yml` (`Drupal\\mymodule\\Hook\\MyModuleHooks: {autowire: true}`) or the shim's delegation throws a `ServiceNotFoundException`. Once you drop D10 support you delete the shims and the services.yml entry, and the `.module` file can disappear.",
    },
  ],

  quiz: [
    {
      question:
        "You add function incident_tracker_node_presave() to incident_tracker.module, but saving an incident node never triggers it. What's the most likely fix?",
      options: [
        "Register the function in incident_tracker.services.yml",
        "Rebuild caches (drush cr) — the discovered hook implementation list is cached",
        "Rename it to hook_node_presave()",
        "Add #[Hook('node_presave')] above the function",
      ],
      answerIndex: 1,
      explain:
        "Procedural hooks need no registration — the name is the wiring — but Drupal caches which implementations exist. After adding a new hook function you must rebuild caches so the module handler rediscovers it. (The literal 'hook_' prefix is documentation shorthand, never a real function name.)",
    },
    {
      question:
        "Which statement about incident_tracker's sibling files is correct?",
      options: [
        ".install and .module are both loaded on every request",
        ".install is loaded only during install/update operations; .module is loaded on every request",
        ".module is loaded only when one of its hooks fires",
        ".post_update.php replaces .install in Drupal 11",
      ],
      answerIndex: 1,
      explain:
        "The .module file is included near the start of every request so its hooks are callable at any time. The .install file (hook_install, hook_schema, hook_update_N) loads only during install and update operations, and .post_update.php complements — not replaces — it with post-deploy data callbacks.",
    },
    {
      question:
        "In a module supporting Drupal 10 and 11, what does marking a procedural .module function with #[LegacyHook] achieve?",
      options: [
        "It makes the function run twice, once per major version",
        "It converts the function into an autowired service on all versions",
        "On 11.1+ the function is skipped in favour of the #[Hook] class method; on 10.x the attribute is ignored and the function runs normally",
        "It deprecates the hook so drush warns on every invocation",
      ],
      answerIndex: 2,
      explain:
        "#[LegacyHook] marks the procedural function as a backwards-compatibility shim. Drupal 11.1+ invokes the OOP #[Hook] method and skips the shim so the logic never executes twice; older cores don't reflect the attribute, so the shim runs and delegates to the same class.",
    },
  ],
};

export default lesson;
