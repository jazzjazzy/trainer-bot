import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "first-route-controller",
  title: "Your First Page: Route + Controller",
  part: "Module Anatomy & Scaffolding",
  estMinutes: 10,
  summary:
    "Wire /incidents end to end: an incident_tracker.routing.yml entry pointing at an IncidentListController extending ControllerBase that returns a render array — then drush cr so the cached router notices.",

  concept: `
Time for the module's first visible feature: a page at \`/incidents\` that will
grow into the incident list. In Symfony this is one file — a controller method
with a \`#[Route]\` attribute. In Drupal it is two files plus a cache rebuild,
and the responsibilities split differently: the **route owns the URL, the title,
and access**; the **controller owns only the content**.

### 1. Declare the route: incident_tracker.routing.yml

Next to \`incident_tracker.info.yml\` at the module root:

\`\`\`yaml
incident_tracker.list:
  path: '/incidents'
  defaults:
    _controller: '\\Drupal\\incident_tracker\\Controller\\IncidentListController::build'
    _title: 'Incidents'
  requirements:
    _permission: 'access content'
\`\`\`

- \`incident_tracker.list\` is the **route name** — module-prefixed and
  dot-separated; it is what \`Url::fromRoute()\`, menu links, and tests reference.
- \`_controller\` is a plain \`FQCN::method\` string. This line *is* the wiring —
  the controller class carries no routing metadata at all.
- \`_title\` sets the page title **in the route**. Drupal's page-title block
  renders it, so your controller never prints the page \`<h1>\`. For a dynamic
  title, use \`_title_callback: 'FQCN::method'\` instead.
- \`_permission\` gates access. We borrow core's \`access content\` for now and
  will define a proper \`view incident reports\` permission later in the course.

### 2. The controller: src/Controller/IncidentListController.php

PSR-4 maps \`Drupal\\incident_tracker\\\` to the module's \`src/\` directory, so the
class lives at \`src/Controller/IncidentListController.php\` and extends
\`ControllerBase\` — Drupal's \`AbstractController\`: a thin base with helpers like
\`$this->t()\`, \`$this->currentUser()\`, \`$this->entityTypeManager()\`, and
\`$this->redirect()\`.

The crucial difference: \`build()\` returns a **render array**, not a \`Response\`.
You hand back structured data (\`'#theme' => 'item_list'\`, \`'#items' => [...]\`)
and Drupal's render pipeline turns it into HTML *inside the full page* — theme,
regions, blocks, toolbar — collecting cache metadata along the way. A Symfony
action ends the request with \`return $this->render(...)\`; a Drupal controller's
return value is where rendering *starts*.

Returning an actual \`Symfony\\Component\\HttpFoundation\\Response\` still works —
Drupal passes it straight through and skips the theme layer entirely. That is
exactly right for special cases (a CSV export of incidents, a generated file)
and exactly wrong for a normal page.

### 3. drush cr — make the router see it

Drupal compiles every module's routing.yml into a cached router table. Until you
rebuild caches your new route does not exist, and \`/incidents\` is a 404:

\`\`\`bash
drush cr                         # rebuild caches (router included)
drush route --path=/incidents    # confirm the route resolves
\`\`\`

Get used to the rhythm: **edit YAML → drush cr → refresh**. Editing the *body*
of a class Drupal already knows about is live immediately — that is just
autoloading. But anything Drupal has to **discover** still needs \`drush cr\`,
and that is not only YAML (routes, services, libraries, permissions): newly
added PHP that Drupal discovers and caches counts too — a plugin class in
\`src/Plugin/\`, a new hook implementation, a new theme hook, a new entity type.
The rule is not "YAML vs PHP", it is **discovery vs execution**.
`,

  comparisons: [
    {
      label: "Declaring the /incidents route",
      intro:
        "A GET page at /incidents that lists incidents. Symfony attaches the route to the method with an attribute; Drupal declares it as data in the module's routing.yml, pointing at the controller by FQCN::method string.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony 6.4/7 — src/Controller/IncidentListController.php
namespace App\\Controller;

use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;

final class IncidentListController extends AbstractController
{
    #[Route('/incidents', name: 'incident_list', methods: ['GET'])]
    public function list(): Response
    {
        return $this->render('incident/list.html.twig', [
            'incidents' => [],
        ]);
    }
}`,
      ts: `# Drupal 10/11 — incident_tracker.routing.yml (module root)
incident_tracker.list:
  path: '/incidents'
  defaults:
    _controller: '\\Drupal\\incident_tracker\\Controller\\IncidentListController::build'
    _title: 'Incidents'
  requirements:
    _permission: 'access content'`,
      note:
        "The route name is module-prefixed (incident_tracker.list). URL, title, and access all live in the YAML; the controller class knows nothing about them.",
    },
    {
      label: "The controller: render array, not Response",
      intro:
        "The method the route dispatches to. Symfony builds a Response (usually via render() and a Twig template); Drupal returns a render array that the theme layer later turns into HTML inside the full page.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony — the action produces the final Response itself
public function list(): Response
{
    $incidents = ['Disk full on web-01', 'Deploy failed: release 2.4.1'];

    return $this->render('incident/list.html.twig', [
        'incidents' => $incidents,
    ]);
}`,
      ts: `<?php
// Drupal — src/Controller/IncidentListController.php
namespace Drupal\\incident_tracker\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;

final class IncidentListController extends ControllerBase {

  public function build(): array {
    return [
      '#theme' => 'item_list',
      '#title' => $this->t('Open incidents'),
      '#items' => [
        $this->t('Disk full on web-01'),
        $this->t('Deploy failed: release 2.4.1'),
      ],
      '#empty' => $this->t('No incidents logged yet.'),
    ];
  }

}`,
      note:
        "ControllerBase is Drupal's AbstractController: $this->t(), $this->currentUser(), $this->entityTypeManager(). The returned array is data — Drupal renders it inside the page (regions, blocks, toolbar) and tracks its cacheability.",
    },
    {
      label: "Page title: route metadata, not template markup",
      intro:
        "Where the page's H1 comes from. In Symfony the template owns it; in Drupal the page-title block prints whatever the route's _title (or _title_callback) says.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony — the Twig template owns the title:
//   {% block title %}Incidents{% endblock %}
//   <h1>{{ page_title }}</h1>
// The controller just passes variables along.
return $this->render('incident/list.html.twig', [
    'page_title' => 'Incidents',
]);`,
      ts: `<?php
// Drupal — static title lives in routing.yml:
//   defaults:
//     _title: 'Incidents'
//
// Dynamic title: point the route at a callback instead:
//   defaults:
//     _title_callback: '\\Drupal\\incident_tracker\\Controller\\IncidentListController::title'

public function title() {
  $open = 3; // later: a real count from our storage service
  return $this->t('Incidents (@count open)', ['@count' => $open]);
}`,
      note:
        "Never print the page H1 from your render array — the page-title block does it from the route. _title_callback is the escape hatch when the title depends on data.",
    },
    {
      label: "Seeing the new route",
      intro:
        "Verifying the route exists. Symfony's dev kernel recompiles routes on every request; Drupal's router table is cached, so a rebuild comes first.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony — the dev environment recompiles routes automatically
$ php bin/console debug:router | grep incident
  incident_list   GET   ANY   ANY   /incidents`,
      ts: `# Drupal — the router table is cached; rebuild it first
$ drush cr
 [success] Cache rebuild complete.

$ drush route --path=/incidents
name: incident_tracker.list
path: /incidents
defaults:
  _controller: '\\Drupal\\incident_tracker\\Controller\\IncidentListController::build'
  _title: Incidents
requirements:
  _permission: 'access content'`,
      note:
        "Any new or edited .yml file in a module needs drush cr before Drupal sees it — visiting /incidents before the rebuild is a guaranteed 404.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A working model of the whole loop: a cached router table that starts stale, drush cr rebuilding it from routing.yml, and a controller whose render array becomes HTML. Predict all three dispatches before running.",
    code: `<?php
declare(strict_types=1);

// incident_tracker.routing.yml, as the YAML parser would hand it to Drupal.
$routingYml = [
  'incident_tracker.list' => [
    'path' => '/incidents',
    'defaults' => [
      '_controller' => 'IncidentListController::build',
      '_title' => 'Incidents',
    ],
    'requirements' => ['_permission' => 'access content'],
  ],
];

// The controller returns a render ARRAY — never HTML, never a Response.
class IncidentListController {
  public function build(): array {
    return [
      '#theme' => 'item_list',
      '#items' => ['Disk full on web-01', 'Deploy failed: release 2.4.1'],
    ];
  }
}

// Drupal's router matches against a CACHED table, not the YAML on disk.
$routerTable = []; // stale — the route was added after the last rebuild

function drush_cr(array $yml, array &$table): void {
  $table = $yml; // rebuild: re-read every module's routing.yml
  echo '[drush cr] router rebuilt: ' . count($table) . " route(s)\\n";
}

// A miniature render pipeline: render array in, HTML out.
function render(array $element): string {
  if (($element['#theme'] ?? null) === 'item_list') {
    $items = array_map(fn ($i) => '  <li>' . $i . '</li>', $element['#items']);
    return "<ul>\\n" . implode("\\n", $items) . "\\n</ul>";
  }
  return $element['#markup'] ?? '';
}

function dispatch(string $path, array $table): void {
  foreach ($table as $name => $route) {
    if ($route['path'] !== $path) {
      continue;
    }
    [$class, $method] = explode('::', $route['defaults']['_controller']);
    $build = (new $class())->$method();   // the render array comes back
    echo 'GET ' . $path . ' -> 200 (' . $name . ")\\n";
    echo '<h1>' . $route['defaults']['_title'] . "</h1>\\n"; // title from routing!
    echo render($build) . "\\n";
    return;
  }
  echo 'GET ' . $path . " -> 404 (not in cached router table)\\n";
}

dispatch('/incidents', $routerTable);  // before any cache rebuild
drush_cr($routingYml, $routerTable);   // = drush cr
dispatch('/incidents', $routerTable);  // now the router knows the path`,
    output: `GET /incidents -> 404 (not in cached router table)
[drush cr] router rebuilt: 1 route(s)
GET /incidents -> 200 (incident_tracker.list)
<h1>Incidents</h1>
<ul>
  <li>Disk full on web-01</li>
  <li>Deploy failed: release 2.4.1</li>
</ul>
`,
  },

  keyPoints: [
    "A Drupal page = a route entry in `incident_tracker.routing.yml` + a controller class under `src/Controller/` — the YAML's `defaults._controller` FQCN::method string is the only wiring.",
    "The route owns URL, access (`requirements._permission`), and title (`defaults._title` or `_title_callback`); the controller owns only the content.",
    "Controllers extend `ControllerBase` (Drupal's `AbstractController`) and return a **render array**, not a `Response` — the theme layer renders it inside the full page and tracks cacheability.",
    "Returning a real Symfony `Response` bypasses theming entirely — reserve it for special cases like CSV/file downloads.",
    "New or changed YAML is invisible until `drush cr`; verify with `drush route --path=/incidents`. Editing the body of an existing class is live immediately, but anything Drupal *discovers and caches* — a new plugin class, hook implementation, or theme hook — needs the rebuild too: the rule is discovery vs execution, not YAML vs PHP.",
  ],

  interview: [
    {
      q: "Walk me through everything needed to add a page at /incidents in a custom Drupal module.",
      a: "Two files and a rebuild. First, an entry in `incident_tracker.routing.yml`: a module-prefixed route name (`incident_tracker.list`), `path: '/incidents'`, `defaults._controller` pointing at `\\Drupal\\incident_tracker\\Controller\\IncidentListController::build`, a `defaults._title`, and a `requirements._permission` so the route is access-controlled. Second, the controller itself at `src/Controller/IncidentListController.php` (PSR-4 under the module's `src/`), extending `ControllerBase` and returning a render array. Finally `drush cr`, because routes are compiled into a cached router table — until the rebuild the page is a 404. It's the same Symfony Routing component underneath, but declared as YAML data instead of a `#[Route]` attribute.",
    },
    {
      q: "Why does a Drupal controller return a render array instead of a Response, and when would you return a Response anyway?",
      a: "A render array is structured data, so Drupal can render it *inside* the whole page — theme, regions, blocks, toolbar — and, critically, collect cache metadata (tags, contexts, max-age) from every element as it renders. Returning HTML or a `Response` directly would throw all of that away. Drupal does honor a returned `Symfony\\Component\\HttpFoundation\\Response`: it short-circuits the theme layer and is sent as-is, which is exactly what you want for a CSV export, a generated file, or a redirect — and exactly what you don't want for a normal page.",
    },
    {
      q: "Where does the page title come from if the controller never renders an H1?",
      a: "From the route. `defaults._title` sets a static title, and Drupal's page-title block prints it in the theme — your render array should never emit the page `<h1>` itself. When the title depends on data (say 'Incidents (3 open)'), you swap `_title` for `_title_callback` pointing at a `FQCN::method` that returns a translatable string. That's a real mindset shift from Symfony, where the Twig template's `{% block title %}` owns the title: in Drupal, title is routing metadata so menus, breadcrumbs, and the page all agree on it.",
    },
  ],

  quiz: [
    {
      question:
        "You added incident_tracker.list to incident_tracker.routing.yml, but /incidents returns 404. Most likely cause?",
      options: [
        "The controller must also carry a #[Route] attribute",
        "The cached router table hasn't been rebuilt — run drush cr",
        "Routes only work after the module is reinstalled",
        "The path must be declared in services.yml too",
      ],
      answerIndex: 1,
      explain:
        "Drupal compiles all routing.yml files into a cached router table. New or edited YAML is invisible until a cache rebuild — drush cr — after which drush route --path=/incidents should resolve the route.",
    },
    {
      question:
        "What should IncidentListController::build() return for a normal page?",
      options: [
        "A Symfony Response containing the rendered HTML",
        "A string of HTML markup",
        "A render array (e.g. '#theme' => 'item_list', '#items' => [...])",
        "A Twig template path plus a context array",
      ],
      answerIndex: 2,
      explain:
        "Controllers return render arrays; the theme layer converts them to HTML inside the full page and gathers cache metadata. A Response is honored but skips theming — reserved for special cases like CSV downloads.",
    },
    {
      question:
        "The page title should read 'Incidents (3 open)', where the number is live data. How do you declare that?",
      options: [
        "Echo an <h1> from the controller's build() method",
        "Set defaults._title with a @count placeholder in routing.yml",
        "Point defaults._title_callback at a controller method returning the title",
        "Override the page.html.twig template in the module",
      ],
      answerIndex: 2,
      explain:
        "_title handles static titles only. For dynamic ones, defaults._title_callback names a FQCN::method whose return value the page-title block renders — the controller's render array never prints the page H1.",
    },
  ],
};

export default lesson;
