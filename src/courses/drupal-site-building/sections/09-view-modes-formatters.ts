import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "view-modes-formatters",
  title: "View Modes & Formatters: Display Without Templates",
  part: "Content Modeling in the UI",
  estMinutes: 12,
  summary:
    "The Manage display tab replaces a pile of Twig partials: every field gets a formatter, every view mode is a named render preset, and it all exports as core.entity_view_display YAML.",

  concept: `
## One node, many renderings — without writing templates

In Symfony, rendering the same Article three ways — a full page, a teaser on a
listing, a compact card in a sidebar — means three Twig partials plus the wiring
to pick the right one everywhere it's used. In Drupal that whole layer is
**display configuration**, built on the **Manage display** tab:

\`Structure > Content types > Article > Manage display\`
(\`/admin/structure/types/manage/article/display\`)

## Every field gets a formatter

Manage display is a grid of the bundle's fields. Each row has three decisions:

- **Label position** — Above, Inline, Hidden, or Visually Hidden (kept in
  markup for screen readers).
- **Formatter** — the plugin that turns the stored value into output. Text
  fields offer *Default*, *Trimmed*, or *Summary or trimmed*; image fields let
  you pick an **image style** (Thumbnail, Medium, Large, or your own) and a
  link target; date fields pick a date format or "time ago"; an entity
  reference can render as a **label** (linked or not), the raw **entity ID**,
  or a fully **rendered entity** — which itself uses a view mode.
- **Settings** — the gear icon: trim length, image style, date format, which
  view mode a rendered reference uses.

Drag rows to reorder output. Drag a field into the **Disabled** region and it
simply doesn't render in this display — no template edit, no \`if\` statement.

## View modes: named render presets

A **view mode** is a named preset of all those per-field choices. Nodes ship
with several: *Default*, *Teaser*, *Full content*, *RSS*, *Search index*,
*Search result*. Add your own (a "Card", say) under
\`Structure > Display modes > View modes > Add view mode\`
(\`/admin/structure/display-modes/view\`). New modes start disabled per bundle:
open Manage display, expand **Custom display settings** at the bottom, tick the
mode, save — it appears as a sub-tab with its own formatter grid.

Now one node renders differently everywhere it appears: trimmed body and medium
image in the teaser, everything in Full content, title-only in a card. No
controller decides which partial to include; the render pipeline looks up the
view mode's config.

## What the clicks export to

Each view-mode grid is one config entity. The teaser display of Article exports
as \`core.entity_view_display.node.article.teaser.yml\`: a \`content:\` map of
field → formatter type, settings, label position, weight — and a \`hidden:\`
map for the disabled fields. A custom view mode is its own tiny config entity,
\`core.entity_view_mode.node.card.yml\`. All of it travels with \`drush cex\`.

## Why this matters later

View modes are a hinge for the rest of the course: a Views row style of
"Rendered entity" asks *which view mode?*, the entity-reference "Rendered
entity" formatter nests one view mode inside another, and Layout Builder is
enabled *per view mode* from this very tab. Model your displays well now and
everything downstream reuses them.
`,

  comparisons: [
    {
      label: "One node, three renderings",
      intro:
        "An Article must render as a full page and as a short teaser on listings. In Symfony that's separate templates plus wiring; in Drupal it's two view-mode grids on the Manage display tab.",
      php: `// Symfony: one partial per rendering + wiring in every caller.
// templates/article/_teaser.html.twig, show.html.twig ...
#[Route('/articles', name: 'article_list')]
public function list(ArticleRepository $repo): Response
{
    return $this->render('article/list.html.twig', [
        'articles' => $repo->findLatest(10),
    ]);
}
// list.html.twig decides which partial to use:
// {% for article in articles %}
//   {{ include('article/_teaser.html.twig') }}
// {% endfor %}`,
      ts: `# Drupal: Structure > Content types > Article > Manage display
#   Default tab = full rendering; Teaser sub-tab = listing rendering.
# Each grid exports as ONE config entity. The teaser:
#   core.entity_view_display.node.article.teaser.yml
id: node.article.teaser
targetEntityType: node
bundle: article
mode: teaser
content:
  body:
    type: text_summary_or_trimmed
    label: hidden
    settings:
      trim_length: 600
    weight: 1
    region: content
hidden:
  field_tags: true`,
      note:
        "No partials, no include logic. Callers just ask for 'teaser' or 'full' and the renderer reads this YAML. hidden: is the Disabled region.",
    },
    {
      label: "Trimmed text and image sizes",
      intro:
        "The teaser should show a 600-character body excerpt and a medium-sized image. A framework dev reaches for Twig filters and an image library; in Drupal both are formatter settings behind the gear icon.",
      php: `// Symfony/Twig: truncate by hand, resize via LiipImagineBundle.
// _teaser.html.twig
// {{ article.body|u.truncate(600, '…') }}
// {{ article.image|imagine_filter('medium') }}

// ...after configuring the filter set yourself:
// liip_imagine:
//     filter_sets:
//         medium:
//             filters:
//                 thumbnail: { size: [220, 220] }`,
      ts: `# Drupal: Manage display > Teaser tab.
# Body row: formatter "Trimmed", gear icon > Trimmed limit: 600.
# Image row: formatter "Image", gear icon > Image style: Medium.
# Excerpt from core.entity_view_display.node.article.teaser.yml:
content:
  field_image:
    type: image
    label: hidden
    settings:
      image_style: medium
      image_link: content
    weight: 0
    region: content
  body:
    type: text_trimmed
    label: hidden
    settings:
      trim_length: 600
    weight: 1
    region: content`,
      note:
        "Image styles (Drupal's filter sets) are themselves config built in the UI at Configuration > Media > Image styles — the formatter just picks one.",
    },
    {
      label: "Entity reference: link vs embedded card",
      intro:
        "An Article references related articles. Sometimes you want linked titles, sometimes fully rendered cards. In Symfony you'd branch in the template; in Drupal you swap the field's formatter.",
      php: `// Symfony: the template decides, and you write both branches.
// {% if compact %}
//   {% for rel in article.related %}
//     <a href="{{ path('article_show', {id: rel.id}) }}">
//       {{ rel.title }}
//     </a>
//   {% endfor %}
// {% else %}
//   {% for rel in article.related %}
//     {{ include('article/_card.html.twig', {article: rel}) }}
//   {% endfor %}
// {% endif %}`,
      ts: `# Drupal: same field, two formatters — pick one per view mode.
# Teaser tab > field_related row > formatter "Label":
content:
  field_related:
    type: entity_reference_label
    label: inline
    settings:
      link: true
# Full content tab > formatter "Rendered entity" + gear icon
# > View mode: Card — nests one view mode inside another:
content:
  field_related:
    type: entity_reference_entity_view
    label: hidden
    settings:
      view_mode: card
      link: false`,
      note:
        "entity_reference_entity_view is the recursion point: the referenced node renders through ITS OWN 'card' display config. Same trick powers Views 'Rendered entity' rows.",
    },
    {
      label: "Adding a custom 'Card' view mode",
      intro:
        "You need a third rendering that core doesn't ship. In Symfony: another partial and more wiring. In Drupal: create a view mode once, enable it per bundle, configure its grid.",
      php: `// Symfony: yet another partial, plus every consumer updated.
// templates/article/_card.html.twig  (new file)
// <article class="card">
//   <h3>{{ article.title }}</h3>
//   {{ article.image|imagine_filter('thumb') }}
// </article>
// ...then edit each template that should use it.`,
      ts: `# Drupal:
# 1. Structure > Display modes > View modes > Add view mode
#    > Node > name it "Card"
# 2. Structure > Content types > Article > Manage display
#    > Custom display settings > tick "Card" > Save
# 3. Configure the new Card sub-tab, then: drush cex
# Two files land in config/sync:
#   core.entity_view_mode.node.card.yml
id: node.card
label: Card
targetEntityType: node
cache: true
#   core.entity_view_display.node.article.card.yml
#   (the Card tab's formatter grid, as in earlier examples)`,
      note:
        "The mode (node.card) is reusable across every node bundle; each bundle that enables it gets its own entity_view_display config. Layout Builder later attaches per view mode right here.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate Drupal's display pipeline: one node array, two view-mode configs (stand-ins for the exported YAML). Predict how 'teaser' and 'full' differ, then run.",
    code: `<?php
// Simulate Drupal's display pipeline: ONE node, rendered differently
// per view mode, driven purely by config (a stand-in for the exported
// core.entity_view_display.node.article.{MODE} YAML files).

$node = [
    'field_image' => 'launch.jpg',
    'body'        => 'Drupal 11 ships on Symfony 7 and modern PHP, and most of what you would code is clicked together as exportable config.',
    'field_tags'  => ['CMS', 'PHP'],
];

// content: = field => formatter + settings (weight order preserved here).
// A field missing from a mode sits in its "hidden:" region — never rendered.
$displays = [
    'teaser' => [
        'field_image' => ['type' => 'image', 'label' => 'hidden',
                          'settings' => ['image_style' => 'medium']],
        'body'        => ['type' => 'text_trimmed', 'label' => 'hidden',
                          'settings' => ['trim_length' => 60]],
        // field_tags: hidden in teaser.
    ],
    'full' => [
        'field_image' => ['type' => 'image', 'label' => 'hidden',
                          'settings' => ['image_style' => 'large']],
        'body'        => ['type' => 'text_default', 'label' => 'hidden',
                          'settings' => []],
        'field_tags'  => ['type' => 'entity_reference_label', 'label' => 'inline',
                          'settings' => []],
    ],
];

function format(string $field, array $conf, array $node): string {
    $value = $node[$field];
    switch ($conf['type']) {
        case 'text_trimmed':
            $len = $conf['settings']['trim_length'];
            if (strlen($value) <= $len) return $value;
            return substr($value, 0, strrpos(substr($value, 0, $len), ' ')) . '…';
        case 'text_default':
            return $value;
        case 'image':
            return '<img src="/styles/' . $conf['settings']['image_style']
                 . '/' . $value . '">';
        case 'entity_reference_label':
            return implode(', ', $value);
    }
    return '';
}

foreach ($displays as $mode => $fields) {
    echo "== node/1 rendered as '" . $mode . "' ==\\n";
    foreach ($fields as $field => $conf) {
        $prefix = $conf['label'] === 'inline'
            ? ucfirst(str_replace('field_', '', $field)) . ': '
            : '';
        echo $prefix . format($field, $conf, $node) . "\\n";
    }
    echo "\\n";
}
echo "Same node, same fields — only the display config differed.\\n";`,
    output: `== node/1 rendered as 'teaser' ==
<img src="/styles/medium/launch.jpg">
Drupal 11 ships on Symfony 7 and modern PHP, and most of…

== node/1 rendered as 'full' ==
<img src="/styles/large/launch.jpg">
Drupal 11 ships on Symfony 7 and modern PHP, and most of what you would code is clicked together as exportable config.
Tags: CMS, PHP

Same node, same fields — only the display config differed.`,
  },

  keyPoints: [
    "Manage display (Structure > Content types > TYPE > Manage display) controls output per field: a FORMATTER plugin plus its settings — text default/trimmed, image style, date format, entity reference as label / ID / rendered entity.",
    "Each field row also sets label position (Above, Inline, Hidden, Visually Hidden) and weight (drag order); dragging a field to the Disabled region stops it rendering — no template edit needed.",
    "View modes are named render presets (Default, Teaser, Full content, Search result...); one node renders differently per mode, replacing multiple Twig partials plus the wiring to choose between them.",
    "Custom view modes are created at Structure > Display modes > View modes, then enabled per bundle via the Custom display settings fieldset on Manage display.",
    "Every view-mode grid exports as one config entity — core.entity_view_display.node.article.teaser.yml with a content: map (formatter, settings, label, weight) and a hidden: map — deployable with drush cex/cim.",
    "View modes are the hook for what's next: Views 'Rendered entity' rows, the entity_reference_entity_view formatter, and Layout Builder all render through a view mode's display config.",
  ],

  interview: [
    {
      q: "What is a view mode in Drupal, and what would the equivalent be in a Symfony app?",
      a: "A view mode is a named preset of display configuration for an entity bundle — for each field it records which formatter renders it, the formatter's settings, the label position, and the order, with unused fields in a hidden region. Nodes ship with modes like Default, Teaser, and Full content, and you can add custom ones under Structure > Display modes. In Symfony you'd achieve the same thing with a Twig partial per rendering (`_teaser.html.twig`, `_card.html.twig`) plus logic in every caller to include the right one. In Drupal the caller just requests a mode — the render pipeline reads the `core.entity_view_display` config — so a new rendering is clicks plus a config export, not new templates and wiring.",
    },
    {
      q: "How do formatters differ from widgets, and where does each get configured?",
      a: "They're the two sides of a field's lifecycle. A **widget** controls input — how the field appears on the editing form — and is configured on the Manage form display tab, exporting as `core.entity_form_display.*`. A **formatter** controls output — how the stored value renders to visitors — and is configured on Manage display, exporting as `core.entity_view_display.*`. One field type offers several of each: an entity reference can be edited with autocomplete or checkboxes, and rendered as a linked label, an ID, or a fully rendered entity. Interviewers like this question because mixing the two up marks you as new to Drupal's display system.",
    },
    {
      q: "You need an Article's 'Related content' field to show full cards on the article page but plain links elsewhere. Walk me through the no-code solution.",
      a: "First create a 'Card' view mode (Structure > Display modes > View modes) and enable it for Article under Custom display settings on Manage display, configuring which fields a card shows. Then on the Full content display, set the related field's formatter to **Rendered entity** with view mode 'Card' — each referenced node renders through its own card config. On the Teaser display, set the same field's formatter to **Label** with 'link to the referenced entity' checked. That's the whole feature: zero templates, zero controllers, and it exports as a handful of `core.entity_view_display` and `core.entity_view_mode` YAML files you commit with `drush cex`.",
    },
    {
      q: "How does display configuration move from your local site to production?",
      a: "Every Manage display grid is a config entity, so it rides the normal config workflow. After clicking your changes together locally you run `drush config:export` (`cex`), which writes files like `core.entity_view_display.node.article.teaser.yml` into the config sync directory; you commit those to git. On deploy, production runs `drush config:import` (`cim`) and its database picks up the same formatter settings. Note the dependency handling: the export lists its dependencies — the field configs, the image style, the view mode — so config import fails loudly if, say, the image style the formatter references was never exported.",
    },
  ],

  quiz: [
    {
      question:
        "Which exported config file captures how an Article renders in its Teaser view mode?",
      options: [
        "node.type.article.yml",
        "core.entity_view_display.node.article.teaser.yml",
        "field.field.node.article.body.yml",
        "core.entity_form_display.node.article.default.yml",
      ],
      answerIndex: 1,
      explain:
        "core.entity_view_display.NODE.BUNDLE.MODE holds one view mode's whole formatter grid: each field's formatter type, settings, label position, and weight, plus the hidden fields. node.type.article is the content type itself, field.field.* is a field definition, and entity_form_display is the editing-form (widget) side.",
    },
    {
      question:
        "An editor asks you to stop showing the Tags field on teasers, but keep it on the full article page. The site-builder move is:",
      options: [
        "Delete the Tags field from the content type",
        "Add an if-condition to node--article--teaser.html.twig",
        "On Manage display > Teaser, drag Tags into the Disabled region and save",
        "Revoke the 'view tags' permission from anonymous users",
      ],
      answerIndex: 2,
      explain:
        "Each view mode has its own grid, so disabling Tags on the Teaser tab hides it there only — the export gains 'field_tags: true' under hidden:. Deleting the field destroys data everywhere, a Twig override is exactly the code this tab replaces, and permissions control access, not per-display layout.",
    },
    {
      question:
        "What does the 'Rendered entity' formatter on an entity reference field do?",
      options: [
        "Prints the referenced entity's ID as plain text",
        "Renders the referenced entity using a view mode you pick in the formatter settings",
        "Embeds the referenced entity's raw database row as JSON",
        "Creates a duplicate copy of the referenced entity",
      ],
      answerIndex: 1,
      explain:
        "entity_reference_entity_view renders the referenced entity through its own entity_view_display config for whichever view mode you select — display config nesting display config. That same mechanism powers 'Rendered entity' row styles in Views. Printing the ID is the separate 'Entity ID' formatter.",
    },
    {
      question:
        "You created a 'Card' view mode at Structure > Display modes, but there's no Card tab on Article's Manage display. Why?",
      options: [
        "View modes require a custom module to activate",
        "You must enable it for the bundle under Custom display settings on Manage display",
        "Card is a reserved name in Drupal core",
        "You need to clear the Twig cache first",
      ],
      answerIndex: 1,
      explain:
        "A view mode is created once per entity type but starts disabled for every bundle. Expand the Custom display settings fieldset at the bottom of the bundle's Manage display page, tick the mode, and save — the sub-tab appears with its own formatter grid, and drush cex then exports both core.entity_view_mode.node.card.yml and the per-bundle display config.",
    },
  ],
};

export default lesson;
