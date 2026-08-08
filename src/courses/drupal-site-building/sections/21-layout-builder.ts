import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "layout-builder",
  title: "Layout Builder: Drag-and-Drop Page Composition",
  part: "Layout, Blocks & Menus",
  estMinutes: 13,
  summary:
    "Layout Builder turns a view mode's flat field list into drag-and-drop sections of blocks — a per-bundle default that exports as config, plus optional per-node overrides that live in content.",

  concept: `
## The flat field list becomes a canvas

Manage display renders a bundle as one top-to-bottom field list. Layout Builder
replaces that — **per view mode**. On
\`Structure > Content types > Landing page > Manage display\`, tick
**Use Layout Builder** and save: the formatter grid disappears in favour of a
**Manage layout** button that opens a visual editor
(\`/admin/structure/types/manage/landing_page/display/default/layout\`).
Other view modes are untouched — a common pattern is Layout Builder on
*Full content* while *Teaser* stays a plain formatter grid.

## Sections hold blocks

The canvas is built from **sections**: each section is a layout plugin (one,
two, three or four columns, with width variants like 67%/33%), and each column
region accepts **blocks**. Three kinds matter:

- **Field blocks** — the entity's own fields, exposed as blocks. Each placement
  embeds its own formatter settings, so everything you learned on Manage
  display transfers directly.
- **Anything from the block system** — Views block displays, menus, site
  branding, search. This is where content modeling and Views converge: drop the
  "Latest news" Views block beside the body field.
- **Inline blocks** — content blocks created right in the editor via
  *Create content block* (labelled "custom block" before Drupal 10.1).

## Two levels: the default is config, overrides are content

The **default layout** applies to every node of the bundle. It is stored on the
same \`core.entity_view_display\` config entity you already export — under
\`third_party_settings.layout_builder.sections\` — so it deploys with
\`drush cex\` / \`cim\` like everything else.

Tick **Allow each content item to have its layout customized** and every node
grows a **Layout** tab (\`/node/42/layout\`). Editing it copies the default
sections into the node's hidden \`layout_builder__layout\` field and edits that
copy. Overrides are **content**: revisionable (each layout edit is a node
revision) and invisible to config export — but deliberately **not
translatable**. Core creates \`layout_builder__layout\` with translation
disabled, so one override layout is shared by every translation of the node;
translated layouts need contrib (e.g. *Layout Builder Asymmetric Translation*).
*Revert to defaults* deletes the override and the config default shows through
again.

Inline blocks are content too: \`block_content\` entities that never appear in
the reusable block library, scoped to the one layout that created them, their
revisions riding along with the host node's. Need the same promo on twenty
pages? Create a reusable block (\`Content > Blocks\`) and place that instead.

## When to use what

The classic architecture debate — Layout Builder vs plain displays vs the
contrib **Paragraphs** module — has a workable rule:

- **Plain Manage display** — uniform bundles (articles, job ads): every node
  renders identically, so Layout Builder is pure overhead.
- **Layout Builder** — landing-page flexibility: the *arrangement* varies per
  page, and you're mixing entity fields with Views, menus and one-off blocks.
- **Paragraphs** — the *content itself* is componentised: editors stack
  structured components (hero, quote, gallery) inside the edit form, and those
  components are part of the node's data.

If what varies is the layout → Layout Builder. If what varies is structured
content → Paragraphs. If nothing varies → Manage display.

For a Symfony dev, Layout Builder replaces the "layout matrix" anti-pattern —
one template per variant plus a field choosing between them — and the week
you'd spend integrating a page-builder bundle. The drag-and-drop editor ships
with core, and its output is inspectable YAML.
`,

  comparisons: [
    {
      label: "Killing the layout matrix",
      intro:
        "Landing pages need different arrangements per page. The framework instinct: a layout field on the entity plus one Twig template per variant. Drupal: flip one checkbox on the view mode.",
      php: `// Symfony: a "layout matrix" — one template per variant,
// a column to pick one, and every new variant is a deploy.
class LandingPage
{
    #[ORM\\Column(length: 32)]
    private string $layout = 'one-col'; // 'two-col', 'hero-sidebar', ...
}

// show.html.twig picks the partial:
// {% include 'landing/layouts/_' ~ page.layout ~ '.html.twig' %}
//
// templates/landing/layouts/_one-col.html.twig
// templates/landing/layouts/_two-col.html.twig
// templates/landing/layouts/_hero-sidebar.html.twig   <- grows forever`,
      ts: `# Drupal: Structure > Content types > Landing page > Manage display
#   > tick "Use Layout Builder"
#   > optionally "Allow each content item to have its layout customized"
#   > Save. "Manage layout" now opens the visual editor at
#   /admin/structure/types/manage/landing_page/display/default/layout
# The SAME core.entity_view_display export gains:
dependencies:
  module:
    - layout_builder
third_party_settings:
  layout_builder:
    enabled: true
    allow_custom: true
    sections:
      -   # existing fields migrated into a one-column section
        layout_id: layout_onecol
        components:
          40a3fa8b-9df1-4a3c-b1d5-6e2f8c0a7b19:
            region: content
            configuration:
              id: 'field_block:node:landing_page:body'
            weight: 0
          # ...one field_block per previously visible field`,
      note:
        "No new config entity: Layout Builder piggybacks on the view display you already export. Enabling it converts the current formatter grid into a starting one-column section, so the canvas (and the export) never begins empty. Enable it per view mode — Full content gets a canvas, Teaser can stay a plain formatter grid.",
    },
    {
      label: "Composing the default layout",
      intro:
        "Body on the left, a news feed on the right. In Twig you hand-roll the grid and embed a controller; in Layout Builder you add a two-column section and drop two blocks into it.",
      php: `// Symfony: hand-rolled grid + embedded controller for the feed.
// templates/landing/show.html.twig
// <div class="grid">
//   <main class="col-8">
//     {{ page.body|raw }}
//   </main>
//   <aside class="col-4">
//     {{ render(controller(NewsController::class ~ '::latest')) }}
//   </aside>
// </div>

class NewsController extends AbstractController
{
    public function latest(NewsRepository $repo): Response
    {
        return $this->render('news/_latest.html.twig', [
            'items' => $repo->findLatest(5),
        ]);
    }
}`,
      ts: `# Drupal: Manage layout > Add section > Two column > 67%/33%
#   First region:  Add block > Content fields > Body
#   Second region: Add block > Lists (Views) > Latest news
#   Save layout, then: drush cex
# Exported sections (trimmed):
third_party_settings:
  layout_builder:
    sections:
      -
        layout_id: layout_twocol_section
        layout_settings:
          column_widths: 67-33
        components:
          6f1cb9c4-9c2e-4d3a-9a1f-2b7c8d0e4f5a:
            region: first
            configuration:
              id: 'field_block:node:landing_page:body'
              label_display: '0'
              context_mapping:
                entity: layout_builder.entity
              formatter:
                type: text_default
                label: hidden
            weight: 0
          9d3e5a12-1b6f-4c88-b2d0-7e4a9c3f1a20:
            region: second
            configuration:
              id: 'views_block:latest_news-block_1'
              items_per_page: 'none'
            weight: 0`,
      note:
        "Field blocks (field_block:ENTITY:BUNDLE:FIELD) embed a formatter config per placement — the Manage display knowledge from lesson 9, reused. views_block:VIEW-DISPLAY is the same block Views exposes everywhere else.",
    },
    {
      label: "Per-node overrides vs a JSON layout column",
      intro:
        "One campaign page needs its own arrangement. The coder's move is a nullable JSON column plus a custom editor UI. Drupal already shipped both — behind one checkbox.",
      php: `// Symfony: per-page layout means a JSON column, fallback logic,
// and a drag-and-drop admin UI you now have to build yourself.
#[ORM\\Column(type: 'json', nullable: true)]
private ?array $layoutOverride = null;

public function getLayout(): array
{
    return $this->layoutOverride ?? self::DEFAULT_LAYOUT;
}
// ...plus versioning the JSON blob if editors want an undo,
// plus per-locale copies if the site is multilingual.`,
      ts: `# Drupal: the "Allow each content item to have its layout
# customized" checkbox is, in the export, just:
third_party_settings:
  layout_builder:
    allow_custom: true
# Every node of the bundle now has a Layout tab (/node/42/layout).
# Editing it copies the default sections into the node's hidden
# layout_builder__layout field and edits THAT copy:
#   - lives in CONTENT, not config — drush cex exports nothing new
#   - revisionable: each layout edit is a node revision, revertable
#   - NOT translatable: core creates the field with translation
#     disabled, so every translation shares the one override layout
#     (contrib: Layout Builder Asymmetric/Symmetric Translation)
# "Revert to defaults" deletes the override; the config default
# from the view display shows through again.`,
      note:
        "The deployment split interviewers probe: default layouts ride cex/cim with the view display; overrides stay in the database like any node data and never appear in config/sync.",
    },
    {
      label: "One-off content: inline blocks",
      intro:
        "A promo card that exists only on this landing page. In Symfony that's hardcoded markup or a whole Promo entity with CRUD. In Layout Builder it's 'Create content block' inside the editor.",
      php: `// Symfony: either hardcoded markup an editor can't touch...
// {# _promo.html.twig #}
// <div class="promo">
//   <h3>Spring sale</h3>
//   <p>20% off until Friday.</p>
// </div>
// ...or a full entity + form + admin route so they can:
#[ORM\\Entity]
class Promo
{
    #[ORM\\Column] private string $heading;
    #[ORM\\Column(type: 'text')] private string $body;
}`,
      ts: `# Drupal: in the layout editor, Add block > "Create content block"
#   > pick a block type (e.g. Basic block) > fill it in > Add block
# The section component points at an inline block:
components:
  b47c2e91-5d0a-4f6b-8c3e-1a9d7f2b6e04:
    region: second
    configuration:
      id: 'inline_block:basic'
      label: 'Spring sale'
      block_revision_id: '17'
# inline_block = a block_content ENTITY, but:
#   - NOT in the reusable block library — this layout only
#   - stored as content; revisions track the host node's revisions
# Same promo on many pages? Create a reusable block instead
# (Content > Blocks) and place it from "Add block" like any other.`,
      note:
        "Inline blocks are the content-side sibling of the sections config: created in the UI, invisible to cex, versioned with the node. Reach for reusable blocks the moment content must appear twice.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate Layout Builder's two-level resolution: a bundle default from config vs a per-node override stored on the node. Predict which source each node renders from, then run.",
    code: `<?php
// Layout Builder's two levels: the bundle DEFAULT lives in config
// (third_party_settings.layout_builder.sections on the view display);
// a per-node OVERRIDE lives in content (the layout_builder__layout
// field). Resolution: override wins when allowed and present.

$allow_custom = true; // "Allow each content item to have its layout customized"

// Stand-in for core.entity_view_display.node.landing_page.default.yml
$default_sections = [
    [
        'layout_id'  => 'layout_onecol',
        'settings'   => [],
        'components' => [
            ['region' => 'content', 'weight' => 0,
             'block'  => 'field_block:node:landing_page:title'],
            ['region' => 'content', 'weight' => 1,
             'block'  => 'field_block:node:landing_page:body'],
        ],
    ],
];

$nodes = [
    1 => ['title' => 'About us', 'layout_builder__layout' => []],
    2 => ['title' => 'Campaign landing', 'layout_builder__layout' => [
        [
            'layout_id'  => 'layout_twocol_section',
            'settings'   => ['column_widths' => '67-33'],
            'components' => [
                ['region' => 'first',  'weight' => 0,
                 'block'  => 'field_block:node:landing_page:body'],
                ['region' => 'second', 'weight' => 0,
                 'block'  => 'views_block:latest_news-block_1'],
                ['region' => 'second', 'weight' => 1,
                 'block'  => 'inline_block:basic'],
            ],
        ],
    ]],
];

foreach ($nodes as $nid => $node) {
    $override    = $node['layout_builder__layout'];
    $useOverride = $allow_custom && $override !== [];
    $sections    = $useOverride ? $override : $default_sections;
    $source      = $useOverride ? 'OVERRIDE (content, revisionable)'
                                : 'DEFAULT (config)';

    echo "node/$nid  {$node['title']}  ->  $source\\n";
    foreach ($sections as $i => $section) {
        $label = $section['layout_id'];
        if (isset($section['settings']['column_widths'])) {
            $label .= ' (' . $section['settings']['column_widths'] . ')';
        }
        echo "  Section " . ($i + 1) . ": $label\\n";
        $byRegion = [];
        foreach ($section['components'] as $c) {
            $byRegion[$c['region']][$c['weight']] = $c['block'];
        }
        foreach ($byRegion as $region => $blocks) {
            ksort($blocks);
            echo "    [$region] " . implode(' | ', $blocks) . "\\n";
        }
    }
    echo "\\n";
}
echo "Delete node/2's override and it falls back to the default layout.\\n";`,
    output: `node/1  About us  ->  DEFAULT (config)
  Section 1: layout_onecol
    [content] field_block:node:landing_page:title | field_block:node:landing_page:body

node/2  Campaign landing  ->  OVERRIDE (content, revisionable)
  Section 1: layout_twocol_section (67-33)
    [first] field_block:node:landing_page:body
    [second] views_block:latest_news-block_1 | inline_block:basic

Delete node/2's override and it falls back to the default layout.`,
  },

  keyPoints: [
    "Layout Builder is enabled PER VIEW MODE via 'Use Layout Builder' on Manage display — the formatter grid becomes sections (1/2/3/4-column layout plugins with width variants) holding blocks.",
    "Available blocks: the entity's own fields as field blocks (each placement embeds its own formatter settings), any block the system knows (Views block displays, menus, branding), and inline blocks created in the editor.",
    "The default layout is CONFIG: it exports under third_party_settings.layout_builder.sections on the same core.entity_view_display entity, and deploys with drush cex / cim.",
    "Per-node overrides ('Allow each content item to have its layout customized') are CONTENT: stored in the node's layout_builder__layout field — revisionable, never exported, and deliberately non-translatable in core (all translations share one layout; contrib like Layout Builder Asymmetric Translation adds translated layouts); 'Revert to defaults' restores the config layout.",
    "Inline blocks are non-reusable block_content entities living in content, their revisions tied to the host node; for anything shown on more than one page, create a reusable block at Content > Blocks instead.",
    "Decision rule: arrangement varies per page → Layout Builder; structured content components vary → Paragraphs (contrib); nothing varies → plain Manage display.",
  ],

  interview: [
    {
      q: "Where does Layout Builder store its data, and what does that split mean for deployment?",
      a: "Two places, and the distinction is the heart of the feature. The **default layout** for a bundle's view mode is config — it lives in `third_party_settings.layout_builder.sections` on the `core.entity_view_display` entity, so `drush cex` exports it, git carries it, and `drush cim` applies it on production like any other config. **Per-node overrides** are content — stored in the node's `layout_builder__layout` section-list field, revisioned with the node, and completely invisible to config export. So a changed default deploys through the normal pipeline, while overrides made by editors on production stay there and are never clobbered by `cim`. Knowing which edits travel and which don't is exactly what an interviewer is testing with this question.",
    },
    {
      q: "When would you choose Layout Builder over Paragraphs, or use neither?",
      a: "State the rule first: if what varies between pages is the *arrangement* — where things sit, mixing the node's fields with Views blocks, menus, and one-off promos — that's Layout Builder. If what varies is the *structured content itself* — editors stacking repeatable components like hero, quote, gallery inside the edit form, with that data belonging to the node — that's Paragraphs. And if nodes of the bundle all render identically, like standard articles, use neither: a plain Manage display grid is simpler, faster, and easier for editors. Mentioning the trade-offs helps too: Layout Builder overrides scatter presentation into content, while Paragraphs keeps data structured and queryable but gives editors no control over page-level placement.",
    },
    {
      q: "How do you keep Layout Builder manageable when editors get access to it?",
      a: "First, only enable overrides where per-page variation is genuinely needed — every 'Allow each content item...' checkbox is drift you can't fix from config. Second, gate access with permissions: 'Configure any layout' is the master switch, and core also provides per-bundle override permissions ('Configure all/editable <bundle> layout overrides') so editors can touch landing pages but not articles. Third, trim the catalogue: the contrib **Layout Builder Restrictions** module limits which layouts and which blocks appear in the off-canvas picker, so editors choose between a few sanctioned options instead of every block on the site. Finally, prefer inline blocks for one-offs and reusable blocks for shared content, so nothing gets copy-pasted across twenty layouts.",
    },
  ],

  quiz: [
    {
      question:
        "You enable Layout Builder on the Landing page's Default display and build a two-column default layout. Where does that layout export?",
      options: [
        "A new layout_builder.layout.landing_page.yml config file",
        "Under third_party_settings.layout_builder.sections in the existing core.entity_view_display.node.landing_page.default.yml",
        "Into each node's layout_builder__layout field",
        "It cannot be exported — layouts are content",
      ],
      answerIndex: 1,
      explain:
        "Layout Builder creates no new config entity: it augments the view display you already export with third_party_settings.layout_builder (enabled, allow_custom, sections). Only per-node OVERRIDES live in the layout_builder__layout field — those are content and never export.",
    },
    {
      question:
        "An editor customises the layout of node/42 via its Layout tab. What is true of that override?",
      options: [
        "It appears in config/sync on the next drush cex",
        "It changes the layout of every node of the bundle",
        "It is stored in the node's layout_builder__layout field, is revisionable, and 'Revert to defaults' removes it",
        "It requires a custom module implementing a layout plugin",
      ],
      answerIndex: 2,
      explain:
        "Overrides copy the default sections into the node's hidden section-list field and edit that copy. Being content, each edit is a node revision and config export ignores it; reverting deletes the override so the bundle's config default renders again. Other nodes are never affected.",
    },
    {
      question:
        "Every Article on the site renders identically: image, body, tags. The right display tool is:",
      options: [
        "Layout Builder with overrides enabled, for future flexibility",
        "The plain Manage display formatter grid",
        "Paragraphs, converting body into components",
        "A custom Twig layout per article",
      ],
      answerIndex: 1,
      explain:
        "The decision rule: when nothing varies between nodes, Layout Builder is overhead and Paragraphs restructures content nobody asked to restructure. A uniform bundle is exactly what the ordinary formatter grid is for — enable Layout Builder where arrangement genuinely varies, like landing pages.",
    },
    {
      question:
        "You create a promo via 'Create content block' inside a node's layout. Where else can that block be placed?",
      options: [
        "Anywhere — it joins the reusable block library",
        "Nowhere — inline blocks belong to the one layout that created them",
        "Only on other nodes of the same bundle",
        "Only in the theme's sidebar regions",
      ],
      answerIndex: 1,
      explain:
        "Inline blocks are block_content entities stored as content, excluded from the reusable library and scoped to their layout, with revisions tracking the host node. If the promo must appear on several pages, create a reusable content block at Content > Blocks and place it via Add block instead.",
    },
  ],
};

export default lesson;
