import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "hooks-in-practice",
  title: "Implementing Hooks: Classic & D11 #[Hook] Classes",
  part: "Services, DI & Business Logic",
  estMinutes: 12,
  summary:
    "incident_tracker implements five real hooks — entity_presave, user_login, cron, theme, help — first the classic way as functions in the .module file, then as a Drupal 11.1+ #[Hook] attribute class with full constructor injection.",

  concept: `
## Five hooks for incident_tracker

Events (last section) are Drupal's Symfony-style extension points, but the bulk
of Drupal's extension surface is still **hooks**. incident_tracker needs five:

- \`hook_entity_presave\` — stamp a default severity before an incident is saved.
- \`hook_user_login\` — log when a user who can view incidents signs in.
- \`hook_cron\` — just a heartbeat for now; real queue work comes in section 23.
- \`hook_theme\` — register the \`incident_summary\` template.
- \`hook_help\` — the module's help page text.

### Classic form: functions in incident_tracker.module

A classic hook implementation is a **global function** named
\`MODULE_HOOKNAME\`: implement \`hook_entity_presave\` by defining
\`incident_tracker_entity_presave()\` in \`incident_tracker.module\`. Discovery
is pure naming convention — core scans loaded module files for matching
function names and **caches the resulting implementation list**. That caching
is the classic gotcha: add a new hook function and nothing happens until you
run \`drush cr\`. It is not broken; it is cached.

The pain point: \`.module\` functions live outside any class, so there is **no
constructor injection**. You reach for static calls like
\`\\Drupal::logger('incident_tracker')\` — exactly the service-location style
you were told to avoid in sections 8–9.

### Drupal 11.1+: #[Hook] attribute classes

Drupal 11.1 finally made hooks object-oriented. Create
\`src/Hook/IncidentTrackerHooks.php\` and put a
\`#[Hook('entity_presave')]\` attribute on any public method. At container
build time a compiler pass (\`HookCollectorPass\`) scans every module's
\`Drupal\\MODULE\\Hook\` namespace, **registers each class as an autowired
service**, and wires the attributed methods into the hook registry. No
services.yml entry, no naming convention — and the huge win: **a real
constructor**, so you inject the logger, entity type manager, or time service
like in any other class. Method names are free-form, one class can implement
many hooks, and \`#[Hook]\` is repeatable. Drupal 11.2 adds ordering
(\`order: Order::First\`, \`ReorderHook\`) to replace
\`hook_module_implements_alter()\`.

### Supporting both worlds

Procedural hooks remain **fully supported** in Drupal 11 — no forced
migration — and contrib modules must often run on 10 and 11 from one codebase.
The pattern: put the logic in the hook class, keep a thin \`.module\` function
that delegates to it, and mark that function \`#[LegacyHook]\`. On 11.1+ the
attribute tells the hook system to skip the procedural copy (the class version
already runs); on Drupal 10 PHP happily ignores the unknown attribute and the
function runs normally. On D10 you must also register the class yourself in
\`incident_tracker.services.yml\` with \`autowire: true\`, since only 11.1+
auto-registers it.

Not everything can move: hooks that run **before a container exists** — all of
\`.install\` (\`hook_install\`, \`hook_update_N\`, \`hook_schema\`,
\`hook_requirements\`) plus a few bootstrap hooks like \`hook_hook_info\` —
stay procedural forever.

Either way, hook discovery is cached (bootstrap cache classically, the compiled
container for attribute classes), so the rule is the same: **added or moved a
hook? \`drush cr\`.**
`,

  comparisons: [
    {
      label: "Classic hooks: named functions in the .module file",
      intro:
        "Default a severity on save and log incident viewers at login. Symfony does this with attribute-registered listener classes; classic Drupal does it with global functions discovered by name.",
      php: `// src/EventListener/IncidentPrePersistListener.php (Symfony)
namespace App\\EventListener;

use App\\Entity\\Incident;
use Doctrine\\Bundle\\DoctrineBundle\\Attribute\\AsEntityListener;
use Doctrine\\ORM\\Events;

#[AsEntityListener(event: Events::prePersist, entity: Incident::class)]
class IncidentPrePersistListener {

  public function prePersist(Incident $incident): void {
    if ($incident->getSeverity() === null) {
      $incident->setSeverity('medium');
    }
  }

}`,
      ts: `<?php
// incident_tracker.module — classic implementations.

use Drupal\\Core\\Entity\\EntityInterface;
use Drupal\\user\\UserInterface;

/**
 * Implements hook_entity_presave().
 */
function incident_tracker_entity_presave(EntityInterface $entity): void {
  if ($entity->getEntityTypeId() === 'node'
      && $entity->bundle() === 'incident'
      && $entity->get('field_severity')->isEmpty()) {
    $entity->set('field_severity', 'medium');
  }
}

/**
 * Implements hook_user_login().
 */
function incident_tracker_user_login(UserInterface $account): void {
  if ($account->hasPermission('view incident reports')) {
    // No DI in a .module file — static service location.
    \\Drupal::logger('incident_tracker')->notice(
      'Incident viewer @name logged in.',
      ['@name' => $account->getAccountName()],
    );
  }
}`,
      note:
        "Discovery is the function NAME (module prefix + hook), and the list is cached — new hook function, then drush cr. Global functions mean no constructor injection: \\Drupal:: statics only.",
    },
    {
      label: "Drupal 11.1+ #[Hook] class — DI at last",
      intro:
        "The same two hooks plus a cron heartbeat, as one autowired class in src/Hook. This is the closest Drupal has ever been to your Symfony listener classes.",
      php: `// src/EventListener/LoginListener.php (Symfony)
namespace App\\EventListener;

use Psr\\Log\\LoggerInterface;
use Symfony\\Component\\EventDispatcher\\Attribute\\AsEventListener;
use Symfony\\Component\\Security\\Http\\Event\\LoginSuccessEvent;

#[AsEventListener]
final class LoginListener {

  public function __construct(
    private readonly LoggerInterface $logger,
  ) {}

  public function __invoke(LoginSuccessEvent $event): void {
    $this->logger->notice('User {user} logged in.', [
      'user' => $event->getUser()->getUserIdentifier(),
    ]);
  }

}`,
      ts: `<?php
// src/Hook/IncidentTrackerHooks.php (Drupal 11.1+).
namespace Drupal\\incident_tracker\\Hook;

use Drupal\\Core\\Entity\\EntityInterface;
use Drupal\\Core\\Hook\\Attribute\\Hook;
use Drupal\\user\\UserInterface;
use Psr\\Log\\LoggerInterface;
use Symfony\\Component\\DependencyInjection\\Attribute\\Autowire;

/**
 * Hook implementations for incident_tracker.
 */
class IncidentTrackerHooks {

  public function __construct(
    #[Autowire(service: 'logger.channel.incident_tracker')]
    private readonly LoggerInterface $logger,
  ) {}

  #[Hook('entity_presave')]
  public function entityPresave(EntityInterface $entity): void {
    if ($entity->getEntityTypeId() === 'node'
        && $entity->bundle() === 'incident'
        && $entity->get('field_severity')->isEmpty()) {
      $entity->set('field_severity', 'medium');
    }
  }

  #[Hook('user_login')]
  public function userLogin(UserInterface $account): void {
    if ($account->hasPermission('view incident reports')) {
      $this->logger->notice('Incident viewer @name logged in.', [
        '@name' => $account->getAccountName(),
      ]);
    }
  }

  #[Hook('cron')]
  public function cron(): void {
    // Heartbeat only — section 23 replaces this with queue work.
    $this->logger->info('incident_tracker cron ran.');
  }

}`,
      note:
        "The class is auto-registered as an autowired service by a compiler pass — no services.yml entry. The logger channel itself (logger.channel.incident_tracker, parent: logger.channel_base) comes from our services.yml from section 7.",
    },
    {
      label: "One codebase for Drupal 10 AND 11: #[LegacyHook]",
      intro:
        "Contrib modules often must support both major versions. Symfony's analogue is keeping a deprecated BC alias while migrating; Drupal's is a procedural bridge marked #[LegacyHook].",
      php: `# config/services.yaml (Symfony BC pattern while
# migrating a listener to a new class/id)
services:
  App\\EventListener\\LoginListener: ~

  # Old service id kept one release for BC.
  app.login_listener:
    alias: App\\EventListener\\LoginListener
    deprecated:
      package: 'app'
      version: '2.0'`,
      ts: `<?php
// incident_tracker.module — thin bridge for Drupal 10 sites.

use Drupal\\Core\\Entity\\EntityInterface;
use Drupal\\Core\\Hook\\Attribute\\LegacyHook;
use Drupal\\incident_tracker\\Hook\\IncidentTrackerHooks;

/**
 * Implements hook_entity_presave().
 */
#[LegacyHook]
function incident_tracker_entity_presave(EntityInterface $entity): void {
  \\Drupal::service(IncidentTrackerHooks::class)->entityPresave($entity);
}

// incident_tracker.services.yml — Drupal 10 does not
// auto-register hook classes, so declare it yourself:
//
// services:
//   Drupal\\incident_tracker\\Hook\\IncidentTrackerHooks:
//     autowire: true`,
      note:
        "On 11.1+ the #[LegacyHook] attribute makes the hook system SKIP this function (the class already ran — no double execution). On 10.x the attribute class does not exist, but PHP ignores unresolved attributes, so the bridge runs normally.",
      leftLang: "yaml",
    },
    {
      label: "hook_theme + hook_help: registering what Symfony gives for free",
      intro:
        "In Symfony a Twig template needs no registration and a help page is just another route. Drupal makes you declare theme hooks and answers help requests via hook_help.",
      php: `// src/Controller/IncidentController.php (Symfony)
// Templates need no registration — render and go.
public function summary(IncidentRepository $repo): Response {
  return $this->render('incident/summary.html.twig', [
    'incidents' => $repo->findOpen(),
    'open_count' => $repo->countOpen(),
  ]);
}

// A "help page" is just another route + template
// you write yourself. No framework concept for it.`,
      ts: `<?php
// incident_tracker.module

use Drupal\\Core\\Routing\\RouteMatchInterface;

/**
 * Implements hook_theme().
 */
function incident_tracker_theme($existing, $type, $theme, $path): array {
  return [
    // Renders templates/incident-summary.html.twig.
    'incident_summary' => [
      'variables' => [
        'incidents' => [],
        'open_count' => 0,
      ],
    ],
  ];
}

/**
 * Implements hook_help().
 */
function incident_tracker_help($route_name, RouteMatchInterface $route_match) {
  return match ($route_name) {
    'help.page.incident_tracker' => '<p>' . t(
      'Incident Tracker logs production incidents and routes
      them to responders.') . '</p>',
    default => NULL,
  };
}`,
      note:
        "A controller renders the template by returning ['#theme' => 'incident_summary', '#incidents' => $rows, '#open_count' => 4]. Underscores in the hook name become hyphens in the template filename. Both hooks work as #[Hook('theme')] / #[Hook('help')] methods on 11.1+ too.",
    },
  ],

  playground: {
    intro:
      "ModuleHandler::invokeAll() in ~40 lines: classic function_exists() discovery over module names, plus a registry of class methods standing in for #[Hook] attributes. Predict the output, then run.",
    lang: "php",
    code: `<?php
// Simulated hook dispatch. Drupal's ModuleHandler does two things:
// 1. Classic: call every MODULE_HOOKNAME() function that exists.
// 2. D11.1+: call every method registered via a #[Hook('...')] attribute.

class Incident {
  public function __construct(
    public string $title,
    public string $severity = '',
  ) {}
}

// --- Classic style: global functions found by naming convention. ---
function incident_tracker_entity_presave(Incident $incident): void {
  if ($incident->severity === '') {
    $incident->severity = 'medium';
    echo "[incident_tracker] presave: defaulted severity to 'medium'\\n";
  }
}

function audit_log_entity_presave(Incident $incident): void {
  echo "[audit_log] presave: recorded change to '{$incident->title}'\\n";
}

// --- Modern style: a class with real constructor DI. ---
class IncidentTrackerHooks {
  public function __construct(private string $logChannel) {}

  public function userLogin(string $name): void {
    echo "[{$this->logChannel}] user_login: {$name} can view incidents\\n";
  }
}

final class ModuleHandler {
  private array $oopImplementations = [];

  public function __construct(private array $modules) {}

  public function addHookMethod(string $hook, callable $method): void {
    $this->oopImplementations[$hook][] = $method;
  }

  public function invokeAll(string $hook, array $args): void {
    foreach ($this->modules as $module) {
      $function = $module . '_' . $hook;
      if (function_exists($function)) {   // <-- the classic discovery rule
        $function(...$args);
      }
    }
    foreach ($this->oopImplementations[$hook] ?? [] as $method) {
      $method(...$args);
    }
  }
}

$handler = new ModuleHandler(['incident_tracker', 'audit_log']);

// At container build time Drupal scans src/Hook, autowires the class,
// and registers each #[Hook] method. Simulate that registration:
$hooks = new IncidentTrackerHooks('incident_tracker');
$handler->addHookMethod('user_login', $hooks->userLogin(...));

$incident = new Incident('Database outage');
$handler->invokeAll('entity_presave', [$incident]);
$handler->invokeAll('user_login', ['jane.doe']);

echo "Saved: {$incident->title} (severity: {$incident->severity})\\n";
`,
    output: `[incident_tracker] presave: defaulted severity to 'medium'
[audit_log] presave: recorded change to 'Database outage'
[incident_tracker] user_login: jane.doe can view incidents
Saved: Database outage (severity: medium)
`,
  },

  keyPoints: [
    "Classic hooks are global functions in the .module file named MODULE_HOOKNAME (incident_tracker_entity_presave); discovery is by naming convention and the implementation list is cached — run drush cr after adding one.",
    ".module functions have no constructor, so classic hooks fall back to static service location (\\Drupal::logger()) instead of real dependency injection.",
    "Drupal 11.1+ hook classes live in src/Hook (namespace Drupal\\MODULE\\Hook), mark methods with #[Hook('hook_name')], and are auto-registered as autowired services — full constructor injection is the headline win.",
    "To support Drupal 10 and 11 from one codebase: logic in the class, a thin .module bridge marked #[LegacyHook] (skipped on 11.1+, inert and executed on 10.x), plus an autowire: true services.yml entry for D10.",
    "Hooks that run without a container — hook_install, hook_update_N, hook_schema, hook_requirements, and a few bootstrap hooks — must stay procedural even on Drupal 11.",
    "hook_theme registers the incident_summary render element (template templates/incident-summary.html.twig); hook_help answers on the help.page.incident_tracker route.",
  ],

  interview: [
    {
      q: "How does Drupal discover hook implementations, and why did your new hook 'not work' until you rebuilt caches?",
      a: "Classic discovery is by naming convention: Drupal scans enabled modules for functions named `MODULE_HOOKNAME` and caches the per-hook implementation list so it is not re-scanning on every request. In 11.1+ there is a second path: a compiler pass scans each module's `Drupal\\MODULE\\Hook` namespace for `#[Hook]` attributes and compiles those registrations into the container. Both paths are cached — the bootstrap cache classically, the compiled container for attribute classes — so a freshly added implementation is invisible until `drush cr`. That is the single most common 'my hook is broken' cause in code review and interviews alike.",
    },
    {
      q: "What do Drupal 11's #[Hook] classes give you that .module functions never could?",
      a: "Constructor dependency injection, first and foremost: a `.module` file is procedural, so classic hooks use `\\Drupal::service()` statics, while a hook class is an autowired service where you inject the logger or entity type manager properly — same ergonomics as a Symfony `#[AsEventListener]` class. You also get a real autoloaded, namespaced class: unit-testable with mocked dependencies, better IDE support, and related hooks grouped in one file instead of scattered global functions. Registration is automatic — the `HookCollectorPass` finds the class in `src/Hook` and registers it, no services.yml needed. Procedural hooks remain fully supported, so this is an upgrade path, not a breaking change.",
    },
    {
      q: "You maintain a contrib module that must run on Drupal 10 and 11. How do you adopt OOP hooks without dropping D10?",
      a: "Put the logic in the `src/Hook` class, and keep each procedural implementation in the `.module` file as a one-line bridge that calls the class method, annotated with `#[LegacyHook]`. On 11.1+ the hook system invokes the class method and the attribute tells it to skip the bridge, so nothing runs twice; on Drupal 10 the `LegacyHook` attribute class does not exist, but PHP ignores unresolved attributes, so the bridge executes normally. The one extra step for D10 is registering the hook class in the module's services.yml with `autowire: true`, because only 11.1+ auto-registers classes in `src/Hook`. This is the officially documented compatibility pattern used across contrib.",
    },
  ],

  quiz: [
    {
      question:
        "You add incident_tracker_entity_presave() to incident_tracker.module, save an incident node, and the function never runs. What is the most likely fix?",
      options: [
        "Add a services.yml entry tagging the function as a hook",
        "Run drush cr — hook implementations are cached and the new one has not been discovered yet",
        "Rename the function to hook_entity_presave()",
        "Add #[Hook('entity_presave')] above the function in the .module file",
      ],
      answerIndex: 1,
      explain:
        "Classic hooks need no registration — the naming convention IS the registration — but the discovered implementation list is cached. Until you rebuild caches (drush cr), Drupal keeps using the old list. #[Hook] attributes belong on class methods in src/Hook, not on .module functions.",
    },
    {
      question:
        "Which hook must remain a procedural function even on Drupal 11.1+ and cannot move into a #[Hook] class?",
      options: [
        "hook_entity_presave",
        "hook_user_login",
        "hook_update_10101 (in the .install file)",
        "hook_theme",
      ],
      answerIndex: 2,
      explain:
        "Install and update hooks (hook_install, hook_update_N, hook_schema, hook_requirements) can run while the container is being rebuilt or unavailable, so they must stay procedural in the .install file. Regular runtime hooks like entity_presave, user_login, and theme all work as attribute methods.",
    },
    {
      question:
        "In the dual-support pattern, what does #[LegacyHook] on incident_tracker_entity_presave() in the .module file actually do on Drupal 11.1+?",
      options: [
        "It registers the function as a hook implementation",
        "It tells the hook system to skip this function, because the #[Hook] class method already handles the hook",
        "It marks the function as deprecated and logs a warning when called",
        "It converts the function into a service at container build time",
      ],
      answerIndex: 1,
      explain:
        "The class method is the real implementation on 11.1+; #[LegacyHook] prevents the procedural bridge from being invoked as well, which would run the logic twice. On Drupal 10 the attribute class does not exist, PHP ignores it, and the bridge is what runs.",
    },
    {
      question:
        "Where must IncidentTrackerHooks live for Drupal 11.1+ to auto-discover and autowire it?",
      options: [
        "Anywhere under src/, as long as it implements HookInterface",
        "In src/Hook/, i.e. the Drupal\\incident_tracker\\Hook namespace",
        "In incident_tracker.module, declared with a use statement",
        "It must be listed under 'hooks:' in incident_tracker.info.yml",
      ],
      answerIndex: 1,
      explain:
        "The HookCollectorPass scans each module's Drupal\\MODULE\\Hook namespace (the src/Hook directory) for classes with #[Hook] attribute methods and registers them as autowired services. There is no interface to implement and no info.yml key — the namespace plus the attribute is the contract.",
    },
  ],
};

export default lesson;
