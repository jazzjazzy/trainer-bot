import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-module-checklist",
  title: "Cheat Sheet: The Module-Shipping Checklist & Interview Prep",
  part: "Polish & Ship",
  estMinutes: 12,
  summary:
    "The capstone index for incident_tracker — the file map with a one-line purpose for each file, the pre-release checklist (access, cache, schema, updates, uninstall, phpcs), the Symfony-to-Drupal reflex table, and the module-dev questions a hiring panel actually asks.",

  concept: `
## The file map you should be able to recite

Twenty-nine sections ago this was one folder and one YAML file. Here is the
mental index worth keeping — if you can state each file's job cold, you own
the module system:

\`\`\`text
incident_tracker/
├─ incident_tracker.info.yml         # identity + dependencies; discovery starts here
├─ incident_tracker.module           # procedural hooks (thin on 11.1+)
├─ incident_tracker.install          # hook_install/uninstall/schema + hook_update_N
├─ incident_tracker.routing.yml      # path → controller/form; _permission on EVERY route
├─ incident_tracker.permissions.yml  # defines the grants routing.yml references
├─ incident_tracker.links.menu.yml   # hangs pages in the admin menu tree
├─ incident_tracker.links.task.yml   # tabs (List / Settings) on our pages
├─ incident_tracker.links.action.yml # the 'Log incident' button
├─ incident_tracker.services.yml     # container wiring: calculator, repository, subscriber
├─ incident_tracker.libraries.yml    # named CSS/JS bundles, attached per render array
├─ config/install/…settings.yml      # defaults imported ONCE, at install
├─ config/schema/…schema.yml         # types for every config key we own
├─ src/Controller/                   # thin: render arrays + cache metadata
├─ src/Form/                         # FormBase, ConfigFormBase, ConfirmFormBase
├─ src/Plugin/Block|QueueWorker|Validation/  # discoverable, swappable behaviour
├─ src/EventSubscriber/              # tagged event_subscriber in services.yml
├─ src/Hook/IncidentTrackerHooks.php # #[Hook] methods (11.1+), autowired
├─ src/Event/IncidentReportedEvent.php  # our extension point for other modules
├─ src/IncidentSeverityCalculator.php   # plain services: the business logic
└─ templates/ css/ js/ tests/src/    # Twig, assets, Unit/Kernel/Functional
\`\`\`

The pattern in one line: **YAML declares, \`src/\` implements**, and the
machine name binds every piece together.

## The shipping checklist

- **Access** — every route has \`_permission\` or \`_custom_access\`; every
  permission it names exists in \`permissions.yml\`; admin routes set
  \`_admin_route: TRUE\`. No requirement means *denied*, so Drupal fails closed.
- **Cache** — every render array carries \`#cache\` (contexts, tags, max-age),
  merging the cacheability of whatever config or entities you read.
- **Config** — every key under \`config/install\` has a schema entry; core's
  test base classes check saved config strictly.
- **Updates** — schema changes as \`hook_update_N\`, the rest as
  \`hook_post_update_NAME\`; never call your own services from them; rehearse
  \`drush updb\` against a production database copy.
- **Uninstall** — core drops \`hook_schema\` tables and shipped config; State
  keys and queue items are yours to clear. Prove install → uninstall →
  reinstall.
- **Standards** — \`phpcs --standard=Drupal,DrupalPractice\` clean, PHPStan
  green, every dependency declared in \`info.yml\`.

## Symfony → Drupal reflexes

| Symfony habit | Drupal muscle memory |
| --- | --- |
| \`make:controller\`, \`make:form\` | \`drush generate controller\`, \`form:config\` |
| \`#[Route]\` + \`#[IsGranted]\` | \`routing.yml\` + \`permissions.yml\` |
| \`#[AsEventListener]\` | \`event_subscriber\` tag in \`services.yml\` |
| Messenger + \`#[AsMessageHandler]\` | Queue API + \`QueueWorker\` plugin |
| \`$this->addFlash(…)\` | \`$this->messenger()->addStatus(…)\` |
| \`#[Assert\\NotBlank]\` | Constraint plugin + validator |
| Encore / AssetMapper entry | \`libraries.yml\` + \`'#attached'\` |
| Doctrine migrations | \`hook_update_N\` + \`drush updb\` |
| \`.env\` / \`config/packages\` | \`settings.php\` / Config API / State |

Version line worth memorising: attribute plugins from **10.2**, the
\`#[QueueWorker]\` attribute from **10.3**, OOP \`#[Hook]\` classes from
**11.1** — Symfony 6.4 under Drupal 10, Symfony 7 under 11.

## What panels actually probe

Rarely syntax. They probe **decisions**: hook vs event vs plugin, config vs
State vs tempstore, what your \`#cache\` keys buy, why an update hook can't
trust your own services. The Q&A below rehearses exactly those.
`,

  comparisons: [
    {
      label: "Scaffolding: MakerBundle → drush generate",
      intro:
        "Both ecosystems ship an interactive generator per concern. The difference is what comes out: Symfony writes a class that wires itself via attributes, Drush writes the class AND the YAML that registers it.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony — MakerBundle
composer require --dev symfony/maker-bundle

bin/console make:controller IncidentListController
bin/console make:form       IncidentReportType
bin/console make:subscriber IncidentSubscriber
bin/console make:message    NotifyResponder

# Output: PHP only. autoconfigure reads the attributes.`,
      ts: `# Drupal — drush + drupal-code-generator
drush generate module          # info.yml + skeleton
drush generate controller      # class + routing.yml entry
drush generate form:config     # ConfigFormBase + route + schema stub
drush generate plugin:block    # attribute plugin class
drush generate service:custom  # class + services.yml entry

# Output: PHP *and* its YAML registration.
# Run bare to list every generator:  drush generate
# Then make the site notice the new files:  drush cr`,
      note:
        "Because Drupal wiring lives in YAML rather than attributes, the YAML bookkeeping is exactly what the generator earns its keep on — and drush cr is the step Symfony developers forget.",
    },
    {
      label: "A page and its access",
      intro:
        "The single most-repeated shape in module work: declare a path, point it at code, and gate it. Symfony puts all three on the method; Drupal puts the first two in routing.yml and the grant in permissions.yml.",
      rightLang: "yaml",
      php: `<?php
// Symfony 6.4/7 — the attributes ARE the registration.
final class IncidentController extends AbstractController {

  #[Route('/incidents', name: 'incident_list')]
  #[IsGranted('ROLE_INCIDENT_VIEWER')]
  public function list(): Response {
    // Returns a finished Response.
    return $this->render('incident/list.html.twig', [
      'incidents' => $this->repository->findRecent(),
    ]);
  }

}
// Roles/hierarchy live in config/packages/security.yaml.`,
      ts: `# incident_tracker.routing.yml — the route is data.
incident_tracker.list:
  path: '/incidents'
  defaults:
    _controller: '\\Drupal\\incident_tracker\\Controller\\IncidentListController::build'
    _title: 'Incidents'
  requirements:
    _permission: 'view incident reports'

# incident_tracker.permissions.yml — the grant itself,
# which site builders then assign to roles in the UI.
'view incident reports':
  title: 'View incident reports'
  description: 'See the incident log and its detail pages.'`,
      note:
        "Omit requirements entirely and the route is DENIED, not public — a deliberately public route must say _access: 'TRUE'. The controller returns a render array carrying #cache, never a finished Response.",
    },
    {
      label: "Registration: attributes → explicit wiring",
      intro:
        "Same Symfony EventDispatcher, same queue-a-job-and-handle-it-later idea. Drupal's container ignores wiring attributes, so a services.yml tag registers the subscriber, and a plugin id matches the worker to its queue.",
      php: `<?php
// Symfony — autoconfigure sees the attribute. Nothing else to write.
#[AsEventListener(event: IncidentReported::class)]
final class NotifyOnCall {
  public function __invoke(IncidentReported $event): void {}
}

#[AsMessageHandler]
final class NotifyResponderHandler {
  public function __invoke(NotifyResponder $message): void {}
}

// Dispatch + drain:
//   $bus->dispatch(new NotifyResponder($id));
//   bin/console messenger:consume async`,
      ts: `<?php
// Drupal — the services.yml tag IS the registration:
//   incident_tracker.subscriber:
//     class: Drupal\\incident_tracker\\EventSubscriber\\IncidentSubscriber
//     tags: [{ name: event_subscriber }]
class IncidentSubscriber implements EventSubscriberInterface {

  public static function getSubscribedEvents(): array {
    return [IncidentReportedEvent::class => ['onReported', 0]];
  }

  public function onReported(IncidentReportedEvent $event): void {}

}

// Background work: queue NAME matches worker plugin ID.
#[QueueWorker(
  id: 'incident_tracker_notify',
  title: new TranslatableMarkup('Incident notifier'),
  cron: ['time' => 30],
)]
class IncidentNotifier extends QueueWorkerBase {
  public function processItem($data): void {}
}

// Enqueue + drain:
//   \\Drupal::queue('incident_tracker_notify')->createItem($item);
//   drush cron   (or: drush queue:run incident_tracker_notify)`,
      note:
        "Two escapes from YAML wiring: plugin classes carry their own metadata (attributes from 10.2/10.3, annotations before that), and #[Hook] classes under src/Hook on 11.1+ are collected by HookCollectorPass and registered autowired — the one place Drupal autowires like Symfony.",
    },
    {
      label: "Talking back: flash bag and assets",
      intro:
        "After a successful submit you tell the user and you load some JavaScript. Both are per-request in Symfony and per-render-array in Drupal — which is why they cache correctly.",
      php: `<?php
// Symfony — flash bag, read once by the next template render.
$this->addFlash('success', 'Incident ' . $id . ' logged.');
return $this->redirectToRoute('incident_list');

// Assets: an Encore/AssetMapper entry, loaded from the base
// template, so it ships on every page that extends it.
//   {# templates/base.html.twig #}
//   {{ encore_entry_script_tags('incident-board') }}
//   {{ importmap('app') }}   {# AssetMapper equivalent #}`,
      ts: `<?php
// Drupal — the messenger service is the flash bag.
$this->messenger()->addStatus($this->t('Incident @id logged.', ['@id' => $id]));
$form_state->setRedirect('incident_tracker.list');

// Assets: a NAMED library, declared once in
// incident_tracker.libraries.yml —
//   incident_board:
//     version: 1.x
//     css: { component: { css/incident-board.css: {} } }
//     js:  { js/incident-board.js: {} }
//     dependencies: [core/drupal, core/once]
//
// …then attached only where it is actually needed:
$build['#attached']['library'][] = 'incident_tracker/incident_board';
$build['#cache']['tags'][] = 'incident_tracker_list';`,
      note:
        "addStatus/addWarning/addError mirror the flash bag's severities. A library loads only on pages whose render array attached it, dependencies resolve and deduplicate, and the attachment travels with that render array's cache entry.",
    },
  ],

  playground: {
    intro:
      "The shipping checklist as code: a mock release audit over incident_tracker's routes, permissions, render arrays, config, updates and uninstall. Three checks fail — predict which three before you run it.",
    lang: "php",
    code: `<?php
// The release audit for incident_tracker, as code. Before you tag, walk the
// module and prove six things: every route is guarded, every permission a
// route names actually exists, every render array is cacheable, every config
// object has a schema, updates are numbered contiguously, and uninstall
// leaves nothing behind.

$module = [
  'routes' => [
    'incident_tracker.list'     => ['_permission' => 'view incident reports'],
    'incident_tracker.settings' => ['_permission' => 'administer incident tracker'],
    'incident_tracker.archive'  => ['_permission' => 'archive incident reports'],
    'incident_tracker.export'   => [],
  ],
  // incident_tracker.permissions.yml
  'permissions' => ['view incident reports', 'administer incident tracker'],
  'render_arrays' => [
    'IncidentListController::build' => [
      '#theme' => 'incident_list',
      '#cache' => ['contexts' => ['user.permissions'], 'tags' => ['incident_list']],
    ],
    'RecentIncidentsBlock::build' => ['#markup' => 'Recent incidents'],
  ],
  'config_objects' => ['incident_tracker.settings'],
  'config_schema'  => ['incident_tracker.settings'],
  'schema_version' => 10002,
  'update_hooks'   => [10003, 10004],
  // hook_uninstall() already clears our State keys and queue.
  'leftovers_after_uninstall' => [],
];

$checks = [
  'Every route declares an access requirement' => function (array $m): array {
    $bad = [];
    foreach ($m['routes'] as $name => $requirements) {
      if ($requirements === []) {
        $bad[] = "$name -> no requirement: Drupal denies it for everyone";
      }
    }
    return $bad;
  },

  'Every permission a route names exists in permissions.yml' => function (array $m): array {
    $bad = [];
    foreach ($m['routes'] as $name => $requirements) {
      $permission = $requirements['_permission'] ?? NULL;
      if ($permission !== NULL && !in_array($permission, $m['permissions'], TRUE)) {
        $bad[] = "$name -> '$permission' is never defined";
      }
    }
    return $bad;
  },

  'Every render array carries #cache metadata' => function (array $m): array {
    $bad = [];
    foreach ($m['render_arrays'] as $where => $build) {
      if (!isset($build['#cache'])) {
        $bad[] = "$where -> no #cache: uncacheable, or cached wrongly";
      }
    }
    return $bad;
  },

  'Every config object has a schema entry' => fn (array $m): array =>
    array_values(array_diff($m['config_objects'], $m['config_schema'])),

  'Pending hook_update_N numbers are contiguous' => function (array $m): array {
    $expected = $m['schema_version'];
    foreach ($m['update_hooks'] as $n) {
      $expected++;
      if ($n !== $expected) {
        return ["expected incident_tracker_update_$expected, found _$n"];
      }
    }
    return [];
  },

  'Uninstall leaves no trace' => fn (array $m): array => $m['leftovers_after_uninstall'],
];

$blockers = 0;
foreach ($checks as $label => $check) {
  $failures = $check($module);
  echo ($failures === [] ? '[PASS] ' : '[FAIL] ') . $label . "\\n";
  foreach ($failures as $detail) {
    echo "       - $detail\\n";
  }
  $blockers += count($failures);
}

echo "\\n";
echo $blockers === 0
  ? "Clean. Tag the release.\\n"
  : "$blockers blockers. A missing _permission or #cache is a bug, not polish.\\n";
`,
    output: `[FAIL] Every route declares an access requirement
       - incident_tracker.export -> no requirement: Drupal denies it for everyone
[FAIL] Every permission a route names exists in permissions.yml
       - incident_tracker.archive -> 'archive incident reports' is never defined
[FAIL] Every render array carries #cache metadata
       - RecentIncidentsBlock::build -> no #cache: uncacheable, or cached wrongly
[PASS] Every config object has a schema entry
[PASS] Pending hook_update_N numbers are contiguous
[PASS] Uninstall leaves no trace

3 blockers. A missing _permission or #cache is a bug, not polish.
`,
  },

  keyPoints: [
    "The mental index: ten YAML files DECLARE (info, routing, permissions, three links files, services, libraries, config install + schema) and src/ IMPLEMENTS (Controller, Form, Plugin, EventSubscriber, Hook classes, plain services) — the machine name incident_tracker binds them all, and .install owns the lifecycle.",
    "Shipping checklist: _permission on every route AND that permission defined in permissions.yml, #cache on every render array, a schema entry for every config key, hook_update_N for schema plus hook_post_update_NAME for the rest, an uninstall that leaves no trace, phpcs --standard=Drupal,DrupalPractice clean.",
    "Reflex table: make:* → drush generate; #[Route]+#[IsGranted] → routing.yml+permissions.yml; #[AsEventListener] → event_subscriber tag; Messenger handler → QueueWorker plugin; addFlash() → messenger service; Assert attributes → Constraint plugins; Encore/AssetMapper → libraries.yml + '#attached'.",
    "Versions to quote: attribute plugin discovery from Drupal 10.2 (Block first), the #[QueueWorker] attribute from 10.3, OOP #[Hook] classes from 11.1 — annotations still work across 10, and it is Symfony 6.4 under Drupal 10, Symfony 7 under 11.",
    "Drupal fails closed on access but asymmetrically on uninstall: a route with no requirement is denied to everyone, while core removes hook_schema tables and shipped config yet leaves State keys and queue items for your hook_uninstall to clear.",
    "Panels probe decisions over syntax: hook vs event vs plugin, config vs State vs tempstore, what #cache contexts and tags buy you, and why an update hook cannot trust your module's own services.",
  ],

  interview: [
    {
      q: "Walk me through every file you'd touch to add a new admin screen with a settings form to an existing module.",
      a: "Route first: an entry in `incident_tracker.routing.yml` pointing `_form` at the class with a `_permission` requirement, and that permission defined in `incident_tracker.permissions.yml` if it's new. The form class extends `ConfigFormBase` under `src/Form/` and names `incident_tracker.settings` in `getEditableConfigNames()`. Config needs two more files: defaults in `config/install/incident_tracker.settings.yml` — imported only at install, so existing sites get new keys via an update hook — and types in `config/schema/incident_tracker.schema.yml`. Finally `incident_tracker.links.menu.yml` hangs it in the admin menu and `links.task.yml` can add it as a tab. In Symfony that's roughly one `#[Route]`, a form type and a config class; Drupal spreads the declaration across YAML precisely so the menu, permission and config UIs can see it without executing your code.",
    },
    {
      q: "What's on your pre-release checklist for a custom module?",
      a: "Access: every route carries `_permission` or `_custom_access`, and I grep that each referenced permission actually exists in `permissions.yml` — a typo there silently denies everyone rather than erroring. Cacheability: every render array declares `#cache` contexts, tags and max-age, merging the cacheability of whatever config or entities it read, or the page is stale for someone. Config: each object has a schema entry, which core's test base classes enforce strictly. Updates: schema changes as `hook_update_N`, everything else as `hook_post_update_NAME`, rehearsed with `drush updb` on a production database copy. Uninstall: `hook_uninstall` clears State and queues, then I prove install → uninstall → reinstall is clean. Finally `phpcs --standard=Drupal,DrupalPractice` and PHPStan in CI so standards are never a release-day surprise.",
    },
    {
      q: "As a Symfony developer, which habits transfer directly to Drupal module work, and which will bite you?",
      a: "Direct transfers: constructor injection and thin controllers, `EventSubscriberInterface` (it is literally Symfony's dispatcher), the Validator component beneath constraints, PSR-4 autoloading, and console-driven scaffolding via `drush generate`. What bites: wiring lives in YAML, not attributes — no `#[Route]`, no `#[AsEventListener]`, no autowiring by default — and every container or discovery change needs `drush cr`. Config is deployable site data with schemas and update hooks rather than env-specific parameters, so runtime values belong in State instead. Controllers return render arrays that must carry cache metadata, not finished `Response` objects. And hooks let other modules alter *your* forms and pages, so you design for being altered rather than owning the whole request.",
    },
    {
      q: "When do you implement a hook, subscribe to an event, and write a plugin?",
      a: "A hook reacts to or alters *other* code's behaviour at Drupal's conventional extension points — `hook_form_alter`, `hook_cron`, `hook_theme` — procedural in `.module`, or on 11.1+ as methods on a `#[Hook]` class under `src/Hook`. An event subscriber handles the Symfony-flavoured signal layer: kernel events, config save events, or domain events your own module dispatches like `IncidentReportedEvent`, registered with the `event_subscriber` tag. A plugin is for *interchangeable behaviour with metadata* that the system discovers and a site builder chooses: blocks, queue workers, field types, constraints. The one-liner that lands in interviews: hooks broadcast to every module, events go to declared subscribers with a typed payload, and plugins are picked one-of-many by configuration.",
    },
  ],

  quiz: [
    {
      question:
        "incident_tracker needs a genuinely public route with no login required. What's the correct routing.yml?",
      options: [
        "Omit the requirements section — routes are public unless restricted",
        "requirements: { _access: 'TRUE' } — explicitly opt out of access control",
        "requirements: { _role: 'anonymous' } — anonymous users means public",
        "defaults: { public: true }",
      ],
      answerIndex: 1,
      explain:
        "A route with no access requirement is DENIED by default — Drupal fails closed, so 'I forgot the requirement' surfaces immediately as a 403 rather than as an exposed page. An intentionally public route must say so with _access: 'TRUE'. _role: 'anonymous' would lock out logged-in users, and 'public: true' is not a thing.",
    },
    {
      question:
        "A route requires _permission: 'archive incident reports', but nobody ever added that key to incident_tracker.permissions.yml. What happens?",
      options: [
        "The route falls back to requiring 'access content'",
        "Drupal throws a RouteNotFoundException when the module is installed",
        "Nobody can reach the route — the permission can never be granted, so the check never passes, silently, even for user 1's roles",
        "phpcs catches it as an ERROR under the Drupal standard",
      ],
      answerIndex: 2,
      explain:
        "Permissions are just strings matched against what roles have been granted. An undefined permission never appears in the permissions UI, so no role can hold it and the access check always fails — a silent 403 with no log entry (user 1 is the exception only because it bypasses checks entirely). Nothing errors and no sniff catches it, which is exactly why cross-referencing routes against permissions.yml belongs on the release checklist.",
    },
    {
      question:
        "Why shouldn't incident_tracker_update_10005() call the module's own services, like incident_tracker.repository?",
      options: [
        "The container doesn't exist while updates run",
        "Update hooks execute in a half-upgraded world — new code but old schema and config, with other modules' updates possibly unrun — so your services' assumptions may not hold yet",
        "Services are read-only during drush updb",
        "It's purely a performance concern on large sites",
      ],
      answerIndex: 1,
      explain:
        "When updb runs, the new codebase is on disk but the database schema and config are still whatever the old site had, and other modules' pending updates may not have run. Your service was written assuming the NEW world, so calling it can fatal or corrupt data. Update hooks should use low-level APIs — the database layer, raw config objects — directly; broader work belongs in hook_post_update_NAME, which runs afterwards against a rebuilt container.",
    },
    {
      question:
        "After drush pm:uninstall incident_tracker, which artifact remains unless you removed it yourself in hook_uninstall()?",
      options: [
        "The tables declared in hook_schema()",
        "The config shipped in config/install/",
        "State entries like incident_tracker.last_escalation",
        "The module's routes and menu links",
      ],
      answerIndex: 2,
      explain:
        "Uninstall is a lifecycle event: core drops hook_schema tables, deletes the config the module owns, and rebuilds routing and menus. But State — and key/value storage generally, plus anything still sitting in a queue — is a shared store core cannot attribute to you wholesale, so clearing incident_tracker.last_escalation and friends is hook_uninstall's job. That's why 'uninstall leaves no trace' is a checklist item you actually test.",
    },
  ],
};

export default lesson;
