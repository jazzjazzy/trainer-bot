import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "menu-links-tasks-actions",
  title: "Menu Links, Local Tasks & Action Buttons",
  part: "Module Anatomy & Scaffolding",
  estMinutes: 10,
  summary:
    "The three links YAML files — links.menu.yml, links.task.yml and links.action.yml — that hang incident_tracker's routes in the admin menu, render tabs on its pages, and add the 'Log incident' button, with breadcrumbs falling out of the path hierarchy for free.",

  concept: `
## The route is the endpoint — these files are the signage

In Symfony, a route existing doesn't put it *anywhere*: you write a KnpMenu
builder, configure EasyAdmin's menu, or hand-roll a Twig nav. Drupal separates
the endpoint (the route) from its navigational placement, and placement is
**declarative**: three optional YAML files sitting next to \`.info.yml\`, each
read by a different subsystem, each keyed by a machine name you prefix with your
module name.

### incident_tracker.links.menu.yml — a home in the admin menu

\`\`\`yaml
incident_tracker.admin:
  title: 'Incident Tracker'
  description: 'Configure incident severities and retention.'
  route_name: incident_tracker.settings
  parent: system.admin_config_system
  weight: 10
\`\`\`

- \`parent\` is another **menu link plugin ID** — not a route name, not a path.
  Core defines the admin tree in \`core/modules/system/system.links.menu.yml\`;
  \`system.admin_config_system\` is the "System" group on */admin/config*. Grep
  that file when you need a parent ID.
- \`route_name\` points at the settings route. Access falls out automatically:
  users who can't reach the route never see the link.
- Other keys you'll meet: \`menu_name\` (put a link in \`main\` or \`footer\`
  instead of the \`admin\` menu), \`expanded\`, and \`deriver\` for generating
  links dynamically from config or entities.

### incident_tracker.links.task.yml — tabs (local tasks)

Local tasks are the tabs across the top of a page — a node's View / Edit /
Revisions. \`base_route\` is the grouping key: every task sharing one renders on
every route in the group. The **default tab** is the task whose \`route_name\`
equals \`base_route\`, and Drupal refuses to render a lone tab — fewer than two
in the group and the whole strip disappears (a classic gotcha). \`weight\`
orders them; \`parent_id\` nests a second row of sub-tabs under a primary one.

### incident_tracker.links.action.yml — the button

Local actions are page-level buttons — think "+ Add content" on
*/admin/content*. \`appears_on\` lists the route names that should show the
button; on our listing route the themed result is a primary "+ Log incident"
button linking to the add form. Same access rule: no access to the target
route, no button.

### Breadcrumbs come along for free

Core's default breadcrumb builder is **path-based**: \`PathBasedBreadcrumbBuilder\`
pops segments off the current URL and, for each ancestor path, resolves the
route and uses *its* title. Because our settings form lives at
\`/admin/config/system/incident-tracker\`, users get *Home › Administration ›
Configuration › System* with zero code.

Note what is **not** involved: your \`parent\` key. The breadcrumb reads the URL,
never \`links.menu.yml\` — menu-parent breadcrumbs are contrib (the *Menu
Breadcrumb* module). Here the two happen to agree because the admin menu tree
mirrors the admin path tree, so it's easy to credit the wrong mechanism. Put
the route at \`/incident-tracker\` while still parenting the link under System
and the menu entry stays put while the breadcrumb collapses to just *Home*.
That's the payoff for choosing a sane admin **path** — pick one that matches
where you parented the link, and path hierarchy, menu placement and breadcrumbs
tell one consistent story.

### drush cr. Every. Time.

All three files feed **plugin discovery** — each entry becomes a menu-link,
local-task or local-action plugin definition — and discovery results are cached
aggressively. Editing the YAML does nothing until you rebuild with \`drush cr\`.
"I added a tab and nothing happened" is, nine times out of ten, a stale cache;
the tenth time it's a lone tab. The formats are identical in Drupal 10 and 11 —
nothing here moved to attributes or to D11.1's OOP hook classes.
`,

  comparisons: [
    {
      label: "Admin menu entry",
      intro:
        "Getting a 'Incident Tracker' entry under Configuration → System in the admin UI. Symfony builds menus in PHP (KnpMenu or similar); Drupal declares the placement in links.menu.yml and hangs it off a core parent link.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony — KnpMenu: navigation is code you write and maintain
namespace App\\Menu;

use Knp\\Menu\\FactoryInterface;
use Knp\\Menu\\ItemInterface;

final class AdminMenuBuilder
{
    public function __construct(private FactoryInterface $factory) {}

    public function createAdminMenu(): ItemInterface
    {
        $menu = $this->factory->createItem('root');
        $system = $menu->addChild('System');
        $system->addChild('Incident Tracker', [
            'route' => 'incident_settings',
        ]);
        return $menu;
    }
}`,
      ts: `# Drupal — incident_tracker.links.menu.yml
# key = menu link plugin ID (module-prefixed by convention)
incident_tracker.admin:
  title: 'Incident Tracker'
  description: 'Configure incident severities and retention.'
  route_name: incident_tracker.settings
  parent: system.admin_config_system
  weight: 10`,
      note:
        "parent is another menu link's plugin ID (grep core's system.links.menu.yml for the admin tree) — not a path or route. The link auto-hides for users without access to route_name.",
    },
    {
      label: "Tabs on a page (local tasks)",
      intro:
        "An Overview / Settings tab pair shown on both incident_tracker pages. Symfony makes you build the tab data and detect the active route yourself; Drupal groups tasks by base_route and renders the strip for you.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony — hand-rolled: you own the data AND the active check
abstract class IncidentAdminController extends AbstractController
{
    /** @return array<string, string> label => route name */
    protected function tabs(): array
    {
        return [
            'Overview' => 'incident_list',
            'Settings' => 'incident_settings',
        ];
    }
}

// _tabs.html.twig, included by every page that wants the strip:
// {% for label, route in tabs %}
//   <a href="{{ path(route) }}"
//      class="{{ app.current_route == route ? 'is-active' }}">
//     {{ label }}</a>
// {% endfor %}`,
      ts: `# Drupal — incident_tracker.links.task.yml
# base_route groups the tabs; the task whose route_name EQUALS
# base_route is the default (first) tab.
incident_tracker.list_tab:
  title: 'Overview'
  route_name: incident_tracker.list
  base_route: incident_tracker.list
  weight: 0

incident_tracker.settings_tab:
  title: 'Settings'
  route_name: incident_tracker.settings
  base_route: incident_tracker.list
  weight: 10`,
      note:
        "Drupal renders the strip on every route in the base_route group and marks the active tab itself — but only when the group has 2+ visible tabs. A lone task renders nothing.",
    },
    {
      label: "The 'Log incident' button (local action)",
      intro:
        "A prominent add button on the incident listing. In Symfony it's markup you drop into the listing template; in Drupal it's a declared local action that appears on the routes you list.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony — the button is just template markup
#[Route('/incidents', name: 'incident_list')]
public function list(IncidentRepository $incidents): Response
{
    return $this->render('incident/list.html.twig', [
        'incidents' => $incidents->findBy([], ['createdAt' => 'DESC']),
    ]);
}

// incident/list.html.twig:
// <a class="btn btn-primary" href="{{ path('incident_add') }}">
//   Log incident
// </a>`,
      ts: `# Drupal — incident_tracker.links.action.yml
incident_tracker.add:
  title: 'Log incident'
  route_name: incident_tracker.add
  appears_on:
    - incident_tracker.list`,
      note:
        "appears_on takes route names, so one action can surface on several listings. The admin theme styles it as the '+ Log incident' primary button; it hides itself if the user can't access incident_tracker.add.",
    },
    {
      label: "Applying the change",
      intro:
        "Both frameworks cache heavily. The three links files are plugin definitions discovered once and cached — after every edit you must rebuild, or the new tab/button simply never appears.",
      leftLang: "bash",
      rightLang: "bash",
      php: `$ php bin/console cache:clear

 // Clearing the cache for the dev environment with debug
 // true

 [OK] Cache for the "dev" environment (debug=true) was
      successfully cleared.`,
      ts: `$ drush cr
 [success] Cache rebuild complete.

# Run after EVERY *.links.*.yml edit. "My tab isn't showing"
# is almost always a stale cache — or a lone tab (2+ needed).`,
      note:
        "drush cr rebuilds all plugin discovery, the router and the menu link tree in one go — the Drupal reflex after touching any YAML in your module.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A mini model of Drupal's three link subsystems: tasks grouped by base_route with an active marker, actions filtered by appears_on, and — deliberately kept apart — the menu parent chain versus the path-based breadcrumb core actually builds. Predict the output for each route before running.",
    code: `<?php
declare(strict_types=1);

// Parsed stand-ins for incident_tracker's three links YAML files,
// plus the core menu links our menu entry hangs off.

$menuLinks = [
  'system.admin' => ['title' => 'Administration', 'parent' => NULL],
  'system.admin_config' => ['title' => 'Configuration', 'parent' => 'system.admin'],
  'system.admin_config_system' => ['title' => 'System', 'parent' => 'system.admin_config'],
  'incident_tracker.admin' => ['title' => 'Incident Tracker', 'parent' => 'system.admin_config_system'],
];

$localTasks = [
  'incident_tracker.list_tab' => ['title' => 'Overview', 'route_name' => 'incident_tracker.list', 'base_route' => 'incident_tracker.list', 'weight' => 0],
  'incident_tracker.settings_tab' => ['title' => 'Settings', 'route_name' => 'incident_tracker.settings', 'base_route' => 'incident_tracker.list', 'weight' => 10],
];

$localActions = [
  'incident_tracker.add' => ['title' => 'Log incident', 'route_name' => 'incident_tracker.add', 'appears_on' => ['incident_tracker.list']],
];

// Core's breadcrumb builder never reads links.menu.yml. It resolves each
// ANCESTOR PATH to a route and asks for that route's title, so this map is
// keyed by path - not by menu link ID.
$routeTitles = [
  '/admin' => 'Administration',
  '/admin/config' => 'Configuration',
  '/admin/config/system' => 'System',
  '/admin/config/system/incident-tracker' => 'Incident Tracker',
];

function renderTabs(array $tasks, string $currentRoute): string {
  // Which tab group does the current route belong to? base_route decides.
  $baseRoute = NULL;
  foreach ($tasks as $task) {
    if ($task['route_name'] === $currentRoute) {
      $baseRoute = $task['base_route'];
    }
  }
  if ($baseRoute === NULL) {
    return "  (no tabs on this page)\\n";
  }
  $group = array_filter($tasks, fn($t) => $t['base_route'] === $baseRoute);
  uasort($group, fn($a, $b) => $a['weight'] <=> $b['weight']);
  if (count($group) < 2) {
    return "  (lone tab hidden - Drupal only shows 2+ tabs)\\n";
  }
  $out = '';
  foreach ($group as $t) {
    $marker = $t['route_name'] === $currentRoute ? '*' : ' ';
    $out .= '  [' . $marker . '] ' . $t['title'] . "\\n";
  }
  return $out;
}

function renderActions(array $actions, string $currentRoute): string {
  $out = '';
  foreach ($actions as $a) {
    if (in_array($currentRoute, $a['appears_on'], true)) {
      $out .= '  (+ ' . $a['title'] . ') -> route ' . $a['route_name'] . "\\n";
    }
  }
  return $out;
}

function menuTrail(array $links, string $linkId): string {
  // WHERE THE LINK SITS in the admin menu: the links.menu.yml 'parent' chain.
  // This is menu placement only - it does NOT feed the breadcrumb.
  $trail = [$links[$linkId]['title']];
  $parent = $links[$linkId]['parent'];
  while ($parent !== NULL) {
    array_unshift($trail, $links[$parent]['title']);
    $parent = $links[$parent]['parent'];
  }
  return '  ' . implode(' > ', $trail) . "\\n";
}

function breadcrumb(array $routeTitles, string $path): string {
  // How core's PathBasedBreadcrumbBuilder actually works: drop the current
  // page's own segment, then walk the remaining ancestors left to right,
  // resolving each ancestor PATH to a route and taking that route's title.
  // An ancestor path with no matching route contributes nothing.
  $segments = explode('/', trim($path, '/'));
  array_pop($segments);
  $trail = ['Home'];
  $ancestor = '';
  foreach ($segments as $segment) {
    $ancestor .= '/' . $segment;
    if (isset($routeTitles[$ancestor])) {
      $trail[] = $routeTitles[$ancestor];
    }
  }
  return '  ' . implode(' > ', $trail) . "\\n";
}

foreach (['incident_tracker.list', 'incident_tracker.settings', 'incident_tracker.add'] as $route) {
  echo 'On ' . $route . ":\\n";
  echo renderTabs($localTasks, $route);
  echo renderActions($localActions, $route);
}

// Two different mechanisms. They only LOOK related because we chose an admin
// path that mirrors the menu tree; change the route's path to /incident-tracker
// and the breadcrumb collapses to "Home" while the menu placement is unmoved.
echo "\\nMenu placement (links.menu.yml parent chain):\\n";
echo menuTrail($menuLinks, 'incident_tracker.admin');

echo "\\nBreadcrumb on the settings page (path-based, from the URL):\\n";
echo rtrim(breadcrumb($routeTitles, '/admin/config/system/incident-tracker'), "\\n");`,
    output: `On incident_tracker.list:
  [*] Overview
  [ ] Settings
  (+ Log incident) -> route incident_tracker.add
On incident_tracker.settings:
  [ ] Overview
  [*] Settings
On incident_tracker.add:
  (no tabs on this page)

Menu placement (links.menu.yml parent chain):
  Administration > Configuration > System > Incident Tracker

Breadcrumb on the settings page (path-based, from the URL):
  Home > Administration > Configuration > System`,
  },

  keyPoints: [
    "Drupal separates a route (the endpoint, in routing.yml) from its navigational placement — three declarative YAML files, where Symfony has you code KnpMenu builders or Twig navs.",
    "`incident_tracker.links.menu.yml` adds admin-menu entries: title, route_name, parent (another menu link's plugin ID — find core's in system.links.menu.yml) and weight.",
    "`incident_tracker.links.task.yml` defines tabs; base_route groups them, the task whose route_name equals base_route is the default tab, and a group needs 2+ tabs to render at all.",
    "`incident_tracker.links.action.yml` defines page buttons like '+ Log incident'; appears_on lists the route names that show the button.",
    "All links are access-aware: a menu entry, tab or action hides automatically when the user can't access its target route.",
    "Breadcrumbs come from core's path-based builder walking URL segments — sane admin paths give you Home › Administration › Configuration › System for free. Run drush cr after every links YAML edit.",
  ],

  interview: [
    {
      q: "How does Drupal decide which tabs appear on a page, and why might a tab you just defined not show up?",
      a: "Local tasks in `MODULE.links.task.yml` are grouped by `base_route`: every task sharing a base_route renders as a tab strip on every route in that group, and the task whose `route_name` equals the `base_route` is the default tab. Ordering comes from `weight`, and `parent_id` can nest a secondary tab row. Two failure modes dominate: the definitions are cached plugin discovery, so nothing changes until `drush cr`; and Drupal suppresses the strip entirely when a group has fewer than two visible tabs — a lone task renders nothing. Access also matters: tabs whose target route the user can't access are hidden, which can silently drop a group below the two-tab threshold.",
    },
    {
      q: "Coming from Symfony where I'd wire navigation with KnpMenu, what's the philosophy behind Drupal's links.menu.yml / links.task.yml / links.action.yml split?",
      a: "Drupal treats the route as a pure endpoint and moves every navigational concern into declarative data: `links.menu.yml` for menu placement, `links.task.yml` for tabs, `links.action.yml` for page buttons. Because placement is data, other modules can alter it (e.g. `hook_menu_links_discovered_alter()`), the whole tree is cacheable, and the site builder can reorder menu links in the UI without touching your code. In Symfony the equivalent is imperative — a KnpMenu builder or Twig markup you own end to end. The mental swap: instead of asking 'where do I render this link?', you declare 'this route belongs under the System config group' and let the subsystems render it, permission-filtered, wherever that placement implies.",
    },
    {
      q: "You added an entry to incident_tracker.links.menu.yml but nothing shows in the admin menu. Walk me through your debugging.",
      a: "First, `drush cr` — the file feeds plugin discovery and is cached, so no edit is visible until a rebuild. Second, check `parent`: it must be an existing menu link plugin ID like `system.admin_config_system` (grep core's `system.links.menu.yml`), not a path or route name — a bad parent orphans the link. Third, verify `route_name` exists (`drush route --name=incident_tracker.settings`); a link to an unknown route is discarded. Finally check access: menu links are hidden from users who lack permission on the target route, so an admin-only route won't show for your test user. That checklist — cache, parent, route, access — resolves nearly every 'missing link' ticket.",
    },
  ],

  quiz: [
    {
      question:
        "In incident_tracker.links.task.yml, what does base_route do?",
      options: [
        "It sets the URL path prefix shared by all the tabs",
        "It groups local tasks together so they render as one tab strip, with the matching route_name as the default tab",
        "It declares which parent menu link the tabs appear under",
        "It restricts the tabs to users who can access that route",
      ],
      answerIndex: 1,
      explain:
        "base_route is purely a grouping key: all tasks sharing it render together on every route in the group, and the task whose route_name equals base_route becomes the default (first) tab. It has nothing to do with paths or menu parents.",
    },
    {
      question:
        "Which file and key put a '+ Log incident' button on the incident listing page?",
      options: [
        "incident_tracker.links.menu.yml with parent: incident_tracker.list",
        "incident_tracker.routing.yml with options._button: TRUE",
        "incident_tracker.links.action.yml with appears_on listing the incident_tracker.list route",
        "incident_tracker.links.task.yml with base_route: incident_tracker.list",
      ],
      answerIndex: 2,
      explain:
        "Local actions live in links.action.yml; appears_on is an array of route names on which the button renders. Tasks are tabs, menu links are menu entries — the three files are separate subsystems.",
    },
    {
      question:
        "What kind of value does the parent key in links.menu.yml expect?",
      options: [
        "A URL path such as /admin/config/system",
        "A route name such as system.admin_config_system",
        "Another menu link's plugin ID, such as system.admin_config_system",
        "A Twig template that renders the parent menu",
      ],
      answerIndex: 2,
      explain:
        "parent references the plugin ID of another menu link. Core's admin tree IDs live in core/modules/system/system.links.menu.yml; system.admin_config_system happens to share its name with a route, but it's the link ID that parent consumes.",
    },
    {
      question:
        "You add a second entry to links.task.yml and refresh the page, but no tabs appear. What's the most likely cause?",
      options: [
        "Local tasks only work on entity pages, not custom routes",
        "You didn't rebuild caches — the links files are cached plugin definitions, so run drush cr",
        "Tabs require a links.menu.yml entry for the same route first",
        "The weight values must be negative for tabs to render",
      ],
      answerIndex: 1,
      explain:
        "All three links files feed cached plugin discovery; edits are invisible until drush cr. (If tabs still don't show after a rebuild, check that the group really has two or more tabs the current user can access.)",
    },
  ],
};

export default lesson;
