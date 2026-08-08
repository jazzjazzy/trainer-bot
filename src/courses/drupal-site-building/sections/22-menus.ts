import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "menus",
  title: "Menus: Navigation as Config + Content",
  part: "Layout, Blocks & Menus",
  estMinutes: 12,
  summary:
    "Named menus (system.menu.* config) hold hierarchical links from three sources — admin UI, the per-node 'Provide a menu link' checkbox, and MODULE.links.menu.yml — render via menu blocks, and hide the third config-vs-content deployment gotcha: UI-added links are content.",

  concept: `
## A menu is a container; its links are another story

**Structure > Menus** (\`/admin/structure/menu\`) lists the named menus every
Drupal site ships with — **Main navigation**, **Footer**, **User account
menu**, **Administration**, **Tools** — plus any you add. Creating one is a
two-field form (label + machine name), and it mints a config entity:
\`system.menu.footer-legal\`. Menu machine names are one of Drupal's oddities:
they allow **hyphens**, not underscores.

In Symfony you'd reach for KnpMenuBundle: a \`MenuBuilder\` service in PHP,
\`addChild()\` calls, a service tag, a redeploy for every new link. In Drupal
the menu itself is ~7 lines of exportable YAML and the links come from three
different places.

### Three link sources

1. **Manual admin links** — *Structure > Menus > [menu] > Add link*
   (\`/admin/structure/menu/manage/main/add\`). You set title, URL, parent,
   weight, and the **expanded** flag. Editors drag-and-drop to reorder.
2. **Per-node opt-in** — on the content type's **Menu settings** tab you tick
   which menus are *available* (stored in \`node.type.*\` under
   \`third_party_settings.menu_ui\`). Editors then get a **"Provide a menu
   link"** checkbox on the node form itself: the page and its nav entry are
   created in one save, no developer involved.
3. **Module-provided links** — \`MODULE.links.menu.yml\` in code. This is the
   dev bridge: stable, route-based links (think admin pages, or a Cart link a
   commerce module guarantees) that are rebuilt from YAML on cache rebuild.

### Hierarchy: parent, weight, expanded

Every link picks a **parent** (building the tree), a **weight** (ordering
siblings, lower first), and an **expanded** flag. A collapsed parent renders
its children only when you're *inside* its subtree — the **active trail**.
Drupal computes the trail from the current route automatically, adds the
CSS classes, and the core **breadcrumb block** derives breadcrumbs from the
path. In Symfony, \`setCurrentUri()\` matching and breadcrumb builders are
your code; here they're free.

### Rendering: menus are blocks

A menu doesn't appear anywhere until you place its **menu block** in a
region (*Structure > Block layout > Place block*). The block's settings —
**initial visibility level**, **number of levels to display** (depth),
**expand all items** — mean one menu can power a full header nav *and* a
one-level footer strip: two blocks, one menu.

### The third deployment gotcha

Same family as taxonomy terms and custom block content:

- The **menu definition** (\`system.menu.X\`) and the **block placement**
  (\`block.block.X\`) are **config** — they export with \`drush cex\`.
- Every link added through the UI (sources 1 and 2) is a
  **menu_link_content entity** — **content**. Database rows. \`cex\` exports
  an empty menu.

Deploy the config and prod gets a menu with no links. Your options: recreate
links on prod, migrate them (Default Content / migrations), or — for links
that are genuinely structural — define them in \`links.menu.yml\` so they
live in code.
`,

  comparisons: [
    {
      label: "The menu container: config, not a builder class",
      intro:
        "In Symfony, navigation is a KnpMenuBundle builder service — PHP you write, tag, and redeploy. In Drupal the menu itself is a two-field form that mints a tiny config entity.",
      php: `// KnpMenuBundle: navigation as a PHP service.
use Knp\\Menu\\FactoryInterface;
use Knp\\Menu\\ItemInterface;

final class MenuBuilder
{
    public function __construct(
        private FactoryInterface $factory,
    ) {}

    public function createMainMenu(array $options): ItemInterface
    {
        $menu = $this->factory->createItem('root');
        $menu->addChild('Home', ['route' => 'homepage']);
        $menu->addChild('About', ['route' => 'about']);
        $menu['About']->addChild('Team', ['route' => 'team']);
        return $menu;
    }
}
// services.yaml: tag knp_menu.menu_builder, alias 'main'
// twig: {{ knp_menu_render('main') }} — every new link
// is a code change and a deploy.`,
      ts: `# Structure > Menus > Add menu
#   (/admin/structure/menu/add)
#   Title "Footer legal" > Save.
# drush cex writes system.menu.footer-legal.yml:
langcode: en
status: true
dependencies: {  }
id: footer-legal        # menu IDs allow HYPHENS
label: 'Footer legal'
description: 'Privacy, terms, imprint'
locked: false           # core menus ship locked: true
# The container is config. The links you now add at
# /admin/structure/menu/manage/footer-legal are NOT —
# they are menu_link_content entities (content).`,
      note:
        "The menu definition is ~7 lines of YAML and deploys via cex/cim. Links added in the UI are content entities — the gotcha the last comparison nails down.",
    },
    {
      label: "Rendering + active state: a menu block, placed in a region",
      intro:
        "The framework reflex is nav markup in the base template with hand-rolled active-class logic. In Drupal you place the menu's block and configure levels — active trail classes come free.",
      php: `// Hand-rolled nav helper for the base template.
final class NavRenderer
{
    public function render(array $links, string $current): string
    {
        $html = '<ul>';
        foreach ($links as $path => $label) {
            $class = str_starts_with($current, $path)
                ? ' class="active"'   // DIY active trail
                : '';
            $html .= sprintf(
                '<li%s><a href="%s">%s</a></li>',
                $class, $path, htmlspecialchars($label)
            );
        }
        return $html . '</ul>';
    }
}`,
      ts: `# Structure > Block layout > "Main navigation" (Olivero
#   ships this block pre-placed) > Configure > Save.
# drush cex writes block.block.olivero_main_menu.yml:
dependencies:
  config:
    - system.menu.main    # placement depends on the menu
  module:
    - system              # provider of the block plugin
  theme:
    - olivero
id: olivero_main_menu
theme: olivero
region: primary_menu
weight: 0
provider: null
plugin: 'system_menu_block:main'
settings:
  id: 'system_menu_block:main'
  label: 'Main navigation'
  label_display: '0'
  provider: system
  level: 1                # start at this depth
  depth: 2                # levels to display; Unlimited
                          # exports null (D10 wrote 0)
  expand_all_items: true  # full tree in the markup for
                          # Olivero's dropdown JS
visibility: {  }
# Active trail CSS classes + the breadcrumb block
# (system_breadcrumb_block) come with core. No PHP.`,
      note:
        "level + depth let ONE menu power several blocks: full tree in the header, level-1-only strip in the footer. Placement is theme-specific config, like any block.",
    },
    {
      label: "Per-node links: the editor opt-in",
      intro:
        "New page in Symfony nav = edit the builder, redeploy. Drupal's menu_ui module puts a checkbox on the node form — enabled per content type, stored as third-party settings on the type's config.",
      php: `// Symfony: adding tonight's landing page to the nav
// means a developer edits MenuBuilder and deploys.
public function createMainMenu(array $options): ItemInterface
{
    $menu = $this->factory->createItem('root');
    $menu->addChild('Home', ['route' => 'homepage']);
    $menu->addChild('About', ['route' => 'about']);
    // ...added today, deploying at 17:00:
    $menu->addChild('Spring Sale', [
        'route' => 'landing',
        'routeParameters' => ['slug' => 'spring-sale'],
    ]);
    return $menu;
}`,
      ts: `# Structure > Content types > Basic page > Edit >
#   Menu settings tab > tick "Main navigation" > Save.
# That click lands in node.type.page.yml:
dependencies:
  module:
    - menu_ui             # third-party settings owner
name: 'Basic page'
type: page
third_party_settings:
  menu_ui:
    available_menus:
      - main              # menus editors may target
    parent: 'main:'       # default parent link
# Node form now shows "Provide a menu link": editors
# create the page AND its nav entry in one save. The
# link it creates is a menu_link_content entity.`,
      note:
        "The availability of the checkbox is config (deployable); each link an editor creates with it is content. Untick every menu to hide the whole section from a type.",
    },
    {
      label: "The gotcha + the dev bridge: links.menu.yml",
      intro:
        "UI-added links don't export — so devs either script them (left) or, for genuinely structural links, define them in code where they belong (right).",
      php: `// Recreating UI links programmatically — e.g. in
// hook_update_N() or a deploy hook — because drush cex
// shipped an EMPTY menu to production:
use Drupal\\menu_link_content\\Entity\\MenuLinkContent;

MenuLinkContent::create([
  'title'     => 'Pricing',
  'link'      => ['uri' => 'internal:/pricing'],
  'menu_name' => 'main',
  'weight'    => 10,
  'expanded'  => FALSE,
])->save();
// Works, but now navigation lives in update hooks.
// Reserve this for one-off migrations of editor links.`,
      ts: `# For STRUCTURAL links, skip the UI: define them in
# mymodule/mymodule.links.menu.yml — links that ARE code,
# rebuilt from YAML on every drush cache:rebuild:
mymodule.pricing:
  title: 'Pricing'
  description: 'Plans and pricing'
  route_name: mymodule.pricing   # route, not raw path
  menu_name: main
  weight: 10
  expanded: false
mymodule.pricing.enterprise:
  title: 'Enterprise'
  route_name: mymodule.pricing_enterprise
  parent: mymodule.pricing       # hierarchy in code
  menu_name: main
# Decision rule: editors own it -> UI link (content);
# the site breaks without it -> links.menu.yml (code).`,
      note:
        "Three sources, three owners: UI links = editors (content), node checkbox = editors (content), links.menu.yml = developers (code). Only the menu container and block placement are config.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "One Main menu merged from all three link sources. Predict the sibling order (weight sorting), which subtrees render (expanded flag vs active trail), and the breadcrumbs for /about/team — then run to check.",
    code: `<?php
// Drupal merges links from three sources into one tree,
// sorts siblings by weight, and computes the active trail
// from the current route. Simulate the Main menu:

$links = [
    // source 'ui'   = added at Structure > Menus (CONTENT)
    // source 'node' = "Provide a menu link" checkbox (CONTENT)
    // source 'yml'  = MODULE.links.menu.yml (CODE)
    ['id' => 'home',     'title' => 'Home',     'url' => '/',
     'parent' => null,      'weight' => -10, 'expanded' => false, 'source' => 'ui'],
    ['id' => 'about',    'title' => 'About',    'url' => '/about',
     'parent' => null,      'weight' => 0,   'expanded' => true,  'source' => 'ui'],
    ['id' => 'history',  'title' => 'History',  'url' => '/about/history',
     'parent' => 'about',   'weight' => -5,  'expanded' => false, 'source' => 'ui'],
    ['id' => 'team',     'title' => 'Team',     'url' => '/about/team',
     'parent' => 'about',   'weight' => 0,   'expanded' => false, 'source' => 'ui'],
    ['id' => 'services', 'title' => 'Services', 'url' => '/services',
     'parent' => null,      'weight' => 2,   'expanded' => false, 'source' => 'ui'],
    ['id' => 'audits',   'title' => 'Audits',   'url' => '/services/audits',
     'parent' => 'services','weight' => 0,   'expanded' => false, 'source' => 'ui'],
    ['id' => 'node_12',  'title' => 'Careers',  'url' => '/careers',
     'parent' => null,      'weight' => 5,   'expanded' => false, 'source' => 'node'],
    ['id' => 'shop.cart','title' => 'Cart',     'url' => '/cart',
     'parent' => null,      'weight' => 10,  'expanded' => false, 'source' => 'yml'],
];

// Group by parent, sort siblings by weight (lower first).
$byParent = [];
foreach ($links as $link) {
    $byParent[$link['parent'] ?? 'root'][] = $link;
}
foreach ($byParent as &$siblings) {
    usort($siblings, fn ($a, $b) => $a['weight'] <=> $b['weight']);
}
unset($siblings);

// Active trail: walk parents up from the current path.
$currentPath = '/about/team';
$byId = array_column($links, null, 'id');
$active = null;
foreach ($links as $link) {
    if ($link['url'] === $currentPath) {
        $active = $link;
    }
}
$trail = [];
for ($link = $active; $link !== null;) {
    array_unshift($trail, $link['id']);
    $link = $link['parent'] !== null ? $byId[$link['parent']] : null;
}

function renderTree(array $siblings, array $byParent, array $trail, int $depth = 0): void
{
    foreach ($siblings as $link) {
        $inTrail  = in_array($link['id'], $trail, true);
        $isActive = $inTrail && end($trail) === $link['id'];
        $marker   = $isActive ? '  <-- active'
                  : ($inTrail ? '  <-- active trail' : '');
        $children = $byParent[$link['id']] ?? [];
        $open     = $children !== [] && ($link['expanded'] || $inTrail);
        if ($children !== [] && !$open) {
            $marker .= '  [collapsed]';
        }
        echo str_repeat('  ', $depth) . '- ' . $link['title']
            . ' (' . $link['source'] . ', w ' . $link['weight'] . ')'
            . $marker . "\\n";
        if ($open) {
            renderTree($children, $byParent, $trail, $depth + 1);
        }
    }
}

echo 'Current path: ' . $currentPath . "\\n\\n";
echo "Main menu tree (siblings sorted by weight):\\n";
renderTree($byParent['root'], $byParent, $trail);

$crumbs = [];
foreach (array_slice($trail, 0, -1) as $id) {
    $crumbs[] = $byId[$id]['title'];
}
echo "\\nBreadcrumbs: Home > " . implode(' > ', $crumbs) . "\\n";

$counts = ['ui' => 0, 'node' => 0, 'yml' => 0];
foreach ($links as $link) {
    $counts[$link['source']]++;
}
echo "\\nDeploys how? " . ($counts['ui'] + $counts['node'])
    . " UI/node links = CONTENT (DB rows, invisible to cex); "
    . $counts['yml'] . " from links.menu.yml = code (drush cr)\\n";`,
    output: `Current path: /about/team

Main menu tree (siblings sorted by weight):
- Home (ui, w -10)
- About (ui, w 0)  <-- active trail
  - History (ui, w -5)
  - Team (ui, w 0)  <-- active
- Services (ui, w 2)  [collapsed]
- Careers (node, w 5)
- Cart (yml, w 10)

Breadcrumbs: Home > About

Deploys how? 7 UI/node links = CONTENT (DB rows, invisible to cex); 1 from links.menu.yml = code (drush cr)`,
  },

  keyPoints: [
    "A menu is a config entity (system.menu.X — machine names allow hyphens); create it at Structure > Menus and it exports/deploys like any config.",
    "Links arrive from three sources: manual admin links, the per-node 'Provide a menu link' checkbox (enabled per content type via menu_ui third_party_settings), and MODULE.links.menu.yml in code.",
    "Hierarchy is parent + weight + expanded: parents build the tree, weight orders siblings (lower first), and collapsed parents reveal children only inside the active trail.",
    "Menus render only via menu blocks placed in regions; block settings (level, depth, expand_all_items) let one menu power multiple placements.",
    "Deployment gotcha #3 in the family (after taxonomy terms and custom block content): UI-added links are menu_link_content entities — content — so cex ships an empty menu; structural links belong in links.menu.yml.",
    "Active-trail CSS classes and the core breadcrumb block come free — no setCurrentUri() matching or hand-rolled active-class logic.",
  ],

  interview: [
    {
      q: "In Drupal, which parts of a menu are configuration and which are content — and what does that mean for deployment?",
      a: "The menu *container* (`system.menu.X`) and any menu *block placements* (`block.block.X`) are config entities: they export with `drush cex` and deploy through git and `drush cim`. Every link added through the UI — whether at Structure > Menus or via a node's 'Provide a menu link' checkbox — is a `menu_link_content` entity, which is content: database rows that config export never sees. So a naive deploy ships the menu and its block but zero links. The fixes are to recreate links per environment, migrate them, or define genuinely structural links in a module's `links.menu.yml`, where they live in code and are rebuilt on cache rebuild. It's the same config/content split as taxonomy vocabularies vs terms.",
    },
    {
      q: "How would you let editors add their new landing pages to the main navigation without involving a developer?",
      a: "Enable it on the content type: edit the type, open the Menu settings tab, and tick 'Main navigation' under available menus — optionally setting a default parent. That's stored in `node.type.X` under `third_party_settings.menu_ui`, so it's deployable config. From then on the node add/edit form shows a 'Provide a menu link' checkbox with title, parent, and weight fields, and the editor creates the page and its nav entry in one save. Coming from Symfony this is the striking part: with KnpMenuBundle that same request is a code change to a builder service and a deploy; in Drupal it's an editor-facing checkbox.",
    },
    {
      q: "When would you define menu links in MODULE.links.menu.yml instead of the admin UI?",
      a: "When the link is structural — the site or module is broken without it. `links.menu.yml` entries point at route names (not raw paths), can declare `parent` and `weight` for hierarchy, and are rebuilt from the YAML on every cache rebuild, so they version with the code and survive any environment. That's how core builds the entire Administration menu. Editor-owned navigation stays in the UI as `menu_link_content`, because editors can reorder and retitle it without a release. The decision rule I use: developers own `links.menu.yml`, editors own UI links — and only the menu container itself is exportable config.",
    },
    {
      q: "One menu needs to appear as a full dropdown tree in the header and as a single flat row in the footer. Two menus?",
      a: "No — one menu, two blocks. Menus render through menu blocks, and each placement carries its own settings: initial visibility level, number of levels to display (depth — Unlimited, which exports as `null` in Drupal 11 and `0` in Drupal 10, shows the whole tree), and expand all items. Place `system_menu_block:main` in the header region with depth Unlimited so the whole tree renders, and place a second instance in the footer with depth 1 so only top-level links show. Both placements are `block.block.*` config, so the whole arrangement exports and deploys. Duplicating the menu would mean editors maintain the same links twice — the per-block level/depth settings exist precisely to avoid that.",
    },
  ],

  quiz: [
    {
      question:
        "You build the site's navigation locally: a new 'Footer legal' menu, five links added at Structure > Menus, and the menu block placed in the footer. After cex, git, and cim on production, what exists there?",
      options: [
        "The menu, its five links, and the block placement — config moves everything",
        "The menu and the block placement, but zero links — UI links are menu_link_content (content)",
        "Nothing — menus are content and never export",
        "The links, but not the menu container",
      ],
      answerIndex: 1,
      explain:
        "system.menu.footer-legal and block.block.* are config entities and travel through cex/cim. The links you clicked together are menu_link_content entities — database rows the config system ignores, exactly like taxonomy terms and custom block content. Recreate them, migrate them, or move structural ones into a module's links.menu.yml.",
    },
    {
      question:
        "Editors should be able to add Basic pages to the Main navigation from the node form. Where do you switch that on?",
      options: [
        "Write a MenuBuilder service and tag it in services.yaml",
        "Add an entry to system.menu.main.yml",
        "Content type's Menu settings tab: tick 'Main navigation' as an available menu (saved to node.type.page third_party_settings.menu_ui)",
        "Place the Main navigation block in the content region",
      ],
      answerIndex: 2,
      explain:
        "The menu_ui module stores 'available_menus' and the default parent as third-party settings on the content type's config. Once ticked, the node form gains a 'Provide a menu link' checkbox — the availability is deployable config, while each link editors create with it is content.",
    },
    {
      question:
        "A parent link has 'Show as expanded' unchecked. When do its children appear in a standard menu block (expand_all_items off)?",
      options: [
        "Never — collapsed means the children are disabled",
        "Always — expanded only affects CSS classes",
        "Only when the current page is inside that parent's subtree, i.e. the parent is in the active trail",
        "Only for users with the 'administer menu' permission",
      ],
      answerIndex: 2,
      explain:
        "Collapsed parents render children only along the active trail, which Drupal computes from the current route. Checking 'Show as expanded' (or the block's expand_all_items setting) renders the subtree everywhere — the usual choice for CSS/JS dropdown menus that need the full tree in the markup.",
    },
    {
      question:
        "Which menu link source survives a fresh production deploy with an empty database import of config only?",
      options: [
        "Links added at Structure > Menus > Add link",
        "Links created via the node form's 'Provide a menu link' checkbox",
        "Links defined in MODULE.links.menu.yml",
        "All three — links are config",
      ],
      answerIndex: 2,
      explain:
        "links.menu.yml entries live in code: the menu system rebuilds them from the module's YAML on cache rebuild, so they exist wherever the code is deployed. The other two sources create menu_link_content entities — content rows that exist only in the database where they were clicked into being.",
    },
  ],
};

export default lesson;
