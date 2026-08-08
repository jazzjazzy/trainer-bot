import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "blocks-and-regions",
  title: "Blocks & Regions: Composing Pages",
  part: "Layout, Blocks & Menus",
  estMinutes: 12,
  summary:
    "Compose pages by placing core, Views, and fieldable content blocks into theme-defined regions, with declarative visibility conditions replacing template if-logic — every placement exporting as a block.block.* config entity.",

  concept: `
## The page is a grid: theme regions × block placements

A Drupal theme declares its layout slots as *data*. Open any theme's info file
and there they are:

\`\`\`yaml
# core/themes/olivero/olivero.info.yml (excerpt)
regions:
  header: Header
  primary_menu: 'Primary menu'
  breadcrumb: Breadcrumb
  highlighted: Highlighted
  content: Content
  sidebar: 'Sidebar'
  footer_top: 'Footer Top'
\`\`\`

**Structure > Block layout** (\`/admin/structure/block\`) renders those regions
as a table you fill with **blocks** — one tab per installed theme, and a
*Demonstrate block regions* link that outlines every slot on the live theme.
In Symfony, composing a page means a \`base.html.twig\` full of
\`{% block %}\` slots, includes, and \`render(controller(...))\` calls —
placement is welded into templates. In Drupal the theme owns the *slots*, but
**config owns what fills them**.

### What you can place

- **Core blocks** — site branding, menus, page title, breadcrumbs, status
  messages, tabs (local tasks), user login, search. All the chrome you would
  otherwise hard-code into a base template.
- **Views block displays** — every *Block* display you built in the Views part
  appears in the *Place block* dialog automatically.
- **Content blocks** — hand-authored, fieldable chunks (next).

Each placement gets settings (label, whether to display it, per-plugin options
like menu depth) plus a weight for ordering inside the region. The same block
can be placed *many times*: main menu in the header and again in the footer is
two independent placements, each with its own settings and visibility.

### Content block types: mini content types

**Structure > Block types** (\`/admin/structure/block-content\`) — called
*custom blocks* before Drupal 10.1 — lets you define block types with the same
Manage fields / form display / display tabs as content types. A "Promo" type
with headline, image, and link fields turns "please add this banner" into an
editor task. Author the blocks themselves at **Content > Blocks**
(\`/admin/content/block\`), or straight from the *Place block* dialog via
*Add content block*.

### Visibility: if-logic as data

Every placement form ends with condition groups: **Pages** (path patterns, one
per line — \`/news/*\`, \`<front>\` — with a show/hide radio to negate),
**Content type**, **Roles**, and **Language** on multilingual sites. Configure
several and they are AND-ed: the block renders only when every group passes.
This is the declarative replacement for the \`{% if %}\` guards you would
sprinkle through Twig — one rule, stored once, on the placement.

### What exports — and what doesn't

Each placement exports as one config entity: \`block.block.ID.yml\` holds
theme, region, weight, plugin, settings, and visibility. Block *types* and
their fields are config too. But the content-block **content** you author is a
content entity, referenced from the placement by UUID
(\`plugin: 'block_content:<uuid>'\`). \`drush cex\` ships the placement and the
type — *not* the words and images. Deploy without them and the region renders
"This block is broken or missing." It is the config/content split from earlier
lessons, and the classic deployment gotcha of block-based site builds.
`,

  comparisons: [
    {
      label: "Layout slots: Twig blocks vs regions declared in info.yml",
      intro:
        "Where do a page's named slots live? Symfony welds them into a base template that children override. A Drupal theme declares them once, as YAML, and the Block layout UI turns each one into a fillable target.",
      php: `// templates/base.html.twig — the layout IS the template.
// Every slot is a Twig block; children override or inherit:
//
//   <header>{% block header %}...{% endblock %}</header>
//   <aside class="sidebar">{% block sidebar %}{% endblock %}</aside>
//   <main>{% block body %}{% endblock %}</main>
//   <footer>{% block footer %}...{% endblock %}</footer>
//
// Adding a slot = editing this template, plus every child
// template that should fill it. Deploy to change anything.`,
      ts: `# The theme declares its slots ONCE, as data:
# core/themes/olivero/olivero.info.yml (excerpt)
name: Olivero
type: theme
core_version_requirement: '>=10'
regions:
  header: Header
  primary_menu: 'Primary menu'
  breadcrumb: Breadcrumb
  highlighted: Highlighted
  content: Content
  sidebar: 'Sidebar'
  footer_top: 'Footer Top'
  footer_bottom: 'Footer Bottom'
# Every key becomes a row at Structure > Block layout,
# ready to receive placements — no template edit needed.`,
      note:
        "Use the 'Demonstrate block regions' link at the top of /admin/structure/block to overlay each region's outline on the real theme — the visual map of these YAML keys.",
    },
    {
      label: "Placing a widget: render(controller()) vs a block.block.* entity",
      intro:
        "A 'recent news' widget in the sidebar. The Symfony reflex is an embedded controller wired in from inside a template. Drupal places the Views block display through the UI, and the placement itself becomes a config entity.",
      php: `// src/Controller/SidebarController.php
public function recentNews(NewsRepository $repo): Response
{
    return $this->render('sidebar/_recent_news.html.twig', [
        'items' => $repo->findRecent(5),
    ]);
}
// templates/base.html.twig:
//   <aside class="sidebar">
//     {{ render(controller(
//          'App\\\\Controller\\\\SidebarController::recentNews')) }}
//   </aside>
// Moving or removing the widget = template edit + deploy.`,
      ts: `# Structure > Block layout > (Olivero tab)
#   > Sidebar row > "Place block" > search "News"
#   > Place block > set label > Save block
# drush cex -> block.block.olivero_news_recent.yml:
langcode: en
status: true
dependencies:
  config:
    - views.view.news
  theme:
    - olivero
id: olivero_news_recent
theme: olivero
region: sidebar
weight: 0
plugin: 'views_block:news-block_1'
settings:
  id: 'views_block:news-block_1'
  label: 'Recent news'
  label_display: visible
visibility: {}`,
      note:
        "Place the same plugin again — say in footer_top with a different label — and you get a SECOND block.block.* file. Placements are cheap, independent config entities; a site builder can move them without a deploy.",
    },
    {
      label: "Visibility conditions vs template if-guards",
      intro:
        "Show a promo only in the /news section, only on article pages, only to members. Symfony scatters that rule across templates; Drupal stores it once, on the placement, as declarative conditions.",
      php: `// The Symfony reflex: guard the fragment at the render site.
// templates/base.html.twig:
// {% if app.request.pathInfo starts with '/news'
//       and is_granted('ROLE_MEMBER') %}
//   {{ include('_member_promo.html.twig') }}
// {% endif %}
//
// Repeat the guard in every template that embeds the promo.
// Change the rule? Grep the codebase, edit, redeploy.`,
      ts: `# On the placement form: three collapsible groups —
#   Pages / Content type / Roles (+ Language when enabled).
# Exported inside block.block.*.yml:
visibility:
  request_path:
    id: request_path
    negate: false          # true = "Hide for the listed pages"
    pages: "/news\\n/news/*"
  'entity_bundle:node':
    id: 'entity_bundle:node'
    negate: false
    context_mapping:
      node: '@node.node_route_context:node'
    bundles:
      article: article
  user_role:
    id: user_role
    negate: false
    context_mapping:
      user: '@user.current_user_context:current_user'
    roles:
      member: member`,
      note:
        "Within one group, checked options are OR (any listed role passes); across groups it is AND — all configured conditions must pass. A placement with no conditions shows everywhere its region renders.",
    },
    {
      label: "Content block types: a fieldable entity with zero classes",
      intro:
        "Editors need reusable, hand-authored promo cards. In Symfony that is an entity plus a whole admin vertical. In Drupal it is a block TYPE built in the UI — but note which half of it deploys.",
      php: `// Reusable editable chunk in Symfony = a vertical slice:
use Doctrine\\ORM\\Mapping as ORM;

#[ORM\\Entity]
class Promo
{
    #[ORM\\Id, ORM\\GeneratedValue, ORM\\Column]
    private ?int $id = null;

    #[ORM\\Column(length: 255)]
    private string $headline;

    #[ORM\\Column(type: 'text')]
    private string $body;

    #[ORM\\Column(length: 255)]
    private string $ctaUrl;
}
// ...plus a FormType, admin CRUD controller, templates,
// a migration, and an editor-safe publishing workflow.`,
      ts: `# Structure > Block types > Add block type ("Promo"),
#   then Manage fields: field_headline, field_cta (Link).
#   (Named "custom blocks" before Drupal 10.1 — same thing.)
# The TYPE and its fields export as config:
# block_content.type.promo.yml:
id: promo
label: Promo
description: 'Reusable promo card for sidebars'
revision: 1
# ...plus field.field.block_content.promo.field_cta.yml etc.

# But the promo you AUTHOR (Content > Blocks) is a content
# entity — the placement references it only by UUID:
# block.block.olivero_spring_promo.yml (excerpt):
plugin: 'block_content:0d7ff836-4c9a-4a4b-9a13-c74c4bd2f6bd'
# drush cex ships the placement + the type, NOT the content.
# Deploy without it: "This block is broken or missing."`,
      note:
        "Same split as content types vs nodes: the block type is structure (config), the authored block is data (content). Plan deployments accordingly — recreate the content on the target, or use a default-content/recipe strategy.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A block manager in miniature: placements are pure data — plugin, region, weight, visibility — and the theme just prints whatever survives the conditions. Predict which blocks render for this request before running.",
    code: `<?php
// Block layout as data: each placement mirrors a block.block.*.yml —
// plugin, region, weight, and visibility conditions. Rendering a page
// = filter placements by conditions, group by region, sort by weight.

$placements = [
  ['id' => 'branding',   'plugin' => 'system_branding_block',    'region' => 'header',  'weight' => 0,   'visibility' => []],
  ['id' => 'main_menu',  'plugin' => 'system_menu_block:main',   'region' => 'header',  'weight' => 5,   'visibility' => []],
  ['id' => 'page_title', 'plugin' => 'page_title_block',         'region' => 'content', 'weight' => -10, 'visibility' => []],
  ['id' => 'news_feed',  'plugin' => 'views_block:news-block_1', 'region' => 'sidebar', 'weight' => 0,
   'visibility' => ['request_path' => ['pages' => ['/news', '/news/*'], 'negate' => false]]],
  ['id' => 'promo',      'plugin' => 'block_content:0d7f...',    'region' => 'sidebar', 'weight' => -5,
   'visibility' => ['user_role' => ['roles' => ['member']]]],
  ['id' => 'login',      'plugin' => 'user_login_block',         'region' => 'sidebar', 'weight' => 10,
   'visibility' => ['user_role' => ['roles' => ['anonymous']]]],
];

// The current request — what Drupal's condition plugins inspect.
$context = ['path' => '/news/site-launch', 'roles' => ['anonymous']];

function pathMatches(array $patterns, string $path): bool {
  foreach ($patterns as $pattern) {
    $regex = '~^' . str_replace('\\*', '.*', preg_quote($pattern, '~')) . '$~';
    if (preg_match($regex, $path)) return true;
  }
  return false;
}

function blockVisible(array $conditions, array $ctx): bool {
  // No conditions = show everywhere. Several groups = ALL must pass (AND).
  foreach ($conditions as $type => $cfg) {
    $pass = match ($type) {
      'request_path' => pathMatches($cfg['pages'], $ctx['path']),
      'user_role'    => (bool) array_intersect($cfg['roles'], $ctx['roles']),
    };
    if (!empty($cfg['negate'])) $pass = !$pass;
    if (!$pass) return false;
  }
  return true;
}

$regions = [];
foreach ($placements as $b) {
  if (blockVisible($b['visibility'], $context)) {
    $regions[$b['region']][] = $b;
  }
}

echo "Request: {$context['path']} (roles: " . implode(', ', $context['roles']) . ")\\n\\n";
foreach (['header', 'sidebar', 'content', 'footer'] as $region) {
  $blocks = $regions[$region] ?? [];
  usort($blocks, fn($a, $b) => $a['weight'] <=> $b['weight']);
  echo "[$region]\\n";
  if (!$blocks) { echo "  (empty — region renders nothing)\\n"; continue; }
  foreach ($blocks as $b) {
    echo "  " . $b['id'] . " <- " . $b['plugin'] . "\\n";
  }
}`,
    output: `Request: /news/site-launch (roles: anonymous)

[header]
  branding <- system_branding_block
  main_menu <- system_menu_block:main
[sidebar]
  news_feed <- views_block:news-block_1
  login <- user_login_block
[content]
  page_title <- page_title_block
[footer]
  (empty — region renders nothing)`,
  },

  keyPoints: [
    "Themes declare regions as YAML in their info.yml; Structure > Block layout (/admin/structure/block) is a regions-by-placements grid, one tab per theme, with 'Demonstrate block regions' to visualize the slots.",
    "Core blocks (branding, menus, page title, breadcrumbs, messages, login) plus Views block displays cover most of what a Symfony dev would hard-code into base.html.twig with render(controller()) and includes.",
    "Content block types (Structure > Block types — 'custom blocks' before 10.1) are fieldable mini content types; author the blocks at Content > Blocks or from the Place block dialog.",
    "Visibility conditions — Pages path patterns, Content types, Roles, Language — are AND-ed across groups, OR within a group, negatable, and export inside the placement: declarative replacements for template if-guards.",
    "Every placement is its own block.block.* config entity, so the same block placed twice yields two files with independent settings, weight, and visibility.",
    "Deployment gotcha: the placement references content-block content by UUID; drush cex exports placement and type but never the authored content — missing content renders 'This block is broken or missing.'",
  ],

  interview: [
    {
      q: "In Symfony I compose a sidebar with render(controller()) calls in the base template. How does Drupal decide what appears there, and what does that buy me?",
      a: "The theme declares named regions in its `*.info.yml`, and Block layout places blocks — core blocks, Views block displays, content blocks — into those regions. Each placement is a `block.block.*` config entity carrying theme, region, weight, plugin settings, and visibility conditions. The win is that placement becomes data: it exports with `drush cex`, gets code-reviewed as YAML, deploys with `cim`, and a site builder can move or reconfigure a block without touching a template or deploying. Templates decide how a region renders; config decides what is in it. And because placements are independent entities, the same block can sit in two regions with different settings.",
    },
    {
      q: "How do you show a block only on certain pages or to certain roles without writing template conditionals?",
      a: "Every placement form has visibility condition groups: **Pages** takes path patterns one per line (`/news/*`, `<front>`) with a radio to negate into 'hide for these pages'; **Content type**, **Roles**, and **Language** work the same way. Within one group checked options are OR (any matching role passes), but across groups conditions are AND-ed — configure Pages and Roles together and both must pass. The whole rule exports inside the `block.block.*` YAML, so it is one diffable declaration instead of `is_granted()` and path checks repeated across Twig templates. A placement with no conditions simply renders wherever its region does.",
    },
    {
      q: "After a deployment, a sidebar shows 'This block is broken or missing.' What is your diagnosis and fix?",
      a: "That is almost always a content block whose placement deployed without its content. The `block.block.*` config references the `block_content` entity by UUID (`plugin: 'block_content:<uuid>'`), but that entity is *content*, so `drush cex` never exported it. The block type and fields arrived as config; the authored words and images did not. The fix is to create the block content on the target environment (matching the expected UUID, or re-placing the block against the new entity), or to avoid the trap upfront with a default-content/recipe strategy — or by authoring block content directly in production and letting only structure flow through config.",
    },
    {
      q: "When do you reach for a content block type versus a Views block versus editing the theme?",
      a: "A **Views block** whenever the content is query-driven — recent articles, related items — because it stays current automatically and the whole query is config. A **content block type** when editors need hand-authored, reusable chunks with structured fields: promos, CTAs, opening hours; the fields keep the markup consistent and the editing safe. A **template change** only for genuinely static chrome that belongs to the design itself. The tell: if anyone will ever ask to change the text without a deployment, it must be a block, not markup in a Twig file.",
    },
  ],

  quiz: [
    {
      question:
        "Where does the list of regions you see on the Block layout page come from?",
      options: [
        "It is hard-coded by Drupal core (header, content, sidebar, footer)",
        "The active theme's *.info.yml file, under the regions: key",
        "Each block.block.* config file declares the regions it needs",
        "A settings.php array of region machine names",
      ],
      answerIndex: 1,
      explain:
        "Regions are declared by the theme in its info.yml under regions:. Block layout shows one tab per installed theme, each listing that theme's declared regions — which is why the same block placements can differ per theme.",
    },
    {
      question:
        "A placement has a Pages condition (/news/*) AND a Roles condition (member). When does the block render?",
      options: [
        "On /news/* pages OR for members — conditions are OR-ed",
        "Only on /news/* pages viewed by a user with the member role",
        "Everywhere except /news/* for non-members",
        "It depends on the order of the conditions in the YAML",
      ],
      answerIndex: 1,
      explain:
        "Across condition groups, visibility is AND: every configured group must pass. (Within a single group, checked options are OR — any one matching role satisfies the Roles group.) So the block needs both a matching path and the member role.",
    },
    {
      question:
        "You build a 'Promo' block type, author one promo block, place it in the sidebar, run drush cex, and deploy. Which piece is MISSING on the target site?",
      options: [
        "The block.block.* placement (region, weight, visibility)",
        "The block_content.type.promo block type",
        "The field storage and field instance config for the type's fields",
        "The authored promo block content (headline, image, link values)",
      ],
      answerIndex: 3,
      explain:
        "Placement, block type, and fields are all config and travel with cex/cim. The authored block is a content entity referenced by UUID from the placement — it never enters the config export, so the target shows 'This block is broken or missing' until the content exists there.",
    },
    {
      question:
        "Marketing wants the main menu in the header and a trimmed version in the footer. What is the site-builder move?",
      options: [
        "Copy the menu's Twig include into the footer template",
        "Place the 'Main navigation' block twice — two block.block.* entities, each with its own settings (e.g. depth) and visibility",
        "Create a duplicate menu and maintain both sets of links",
        "Write a custom block plugin that renders the menu twice",
      ],
      answerIndex: 1,
      explain:
        "Placements are independent config entities, so one block plugin can be placed any number of times. Each placement carries its own label, per-plugin settings like menu levels/depth, weight, and visibility — no duplicate menu and no template edits.",
    },
  ],
};

export default lesson;
