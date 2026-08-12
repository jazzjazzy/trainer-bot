import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "layouts-and-layout-plugins",
  title: "Layout Plugins & the Layout API",
  part: "Assets, Components & Layout",
  estMinutes: 12,
  summary:
    "Declare layouts in incident_theme.layouts.yml with regions, a template and an icon_map so Layout Builder, Display Suite and your own code can all place content into them — then add a LayoutDefault subclass when the layout needs configurable settings.",

  concept: `
## A layout is a plugin that eats render arrays

Everything you have built so far renders *one* thing. A **layout plugin** is the
opposite: it takes a keyed set of render arrays — one per region — and returns a
single render array wrapping them in markup. That is the whole contract:

\`\`\`php
$layout->build(['main' => $content, 'sidebar' => $meta]);
\`\`\`

The payoff is that once a layout exists as a plugin, *anything* can use it:
Layout Builder's "Choose a layout" list, Display Suite, Paragraphs layout
modules, Layout Builder Blocks, and your own controllers. In the site-building
course, editors dragged sections around a node's display — those sections are
your layouts. You ship the vocabulary; they do the arranging.

### The zero-PHP version

Enable core's \`layout_discovery\` module (Layout Builder already depends on it)
and drop an \`incident_theme.layouts.yml\` in your theme root — modules use the
identical file. Each key is a plugin ID:

\`\`\`yaml
incident_twocol:
  label: 'Incident: two column'
  category: 'Incident Tracker'
  path: layouts/incident-twocol
  template: layout--incident-twocol
  library: incident_theme/incident-twocol
  default_region: main
  icon_map:
    - [header, header]
    - [main, sidebar]
  regions:
    header: { label: Header }
    main: { label: 'Main content' }
    sidebar: { label: Sidebar }
\`\`\`

\`path\` is relative to the theme; \`template\` names the Twig file inside it
(without \`.html.twig\`) and is converted to the theme hook
\`layout__incident_twocol\`, so \`layout--incident-twocol.html.twig\` sitting at
\`layouts/incident-twocol/\` is found automatically — you never write
\`hook_theme()\`. \`library\` attaches CSS only when the layout is actually
rendered. \`icon_map\` is an ASCII-art grid of region names that core turns into
the SVG thumbnail in the layout picker; \`icon:\` can point at a real image
instead. \`default_region\` is where orphaned blocks land when a site builder
switches layouts.

### The template

\`\`\`twig
<div{{ attributes.addClass('layout', 'layout--incident-twocol') }}>
  {% if content.main %}
    <div{{ region_attributes.main.addClass('layout__region', 'layout__region--main') }}>
      {{ content.main }}
    </div>
  {% endif %}
</div>
\`\`\`

\`content\`, \`attributes\`, \`region_attributes\` and \`settings\` come from
\`template_preprocess_layout()\`. Guard every region with \`{% if %}\` — empty
regions must not emit empty grid cells.

### When it needs settings

Add \`class:\` pointing at a \`LayoutDefault\` subclass. It is a plugin form:
\`defaultConfiguration()\`, \`buildConfigurationForm()\`,
\`submitConfigurationForm()\`, and the values land in \`settings\` in Twig.
Core's \`Drupal\\layout_builder\\Plugin\\Layout\\MultiWidthLayoutBase\` already
does column widths — extend it and implement \`getWidthOptions()\` for a
two-line 67/33 vs 50/50 selector. Note where it lives: it ships with the
**layout_builder** module, not \`layout_discovery\`, so only extend it when
layout_builder is a real dependency of your theme or module — otherwise the
class disappears the day someone uninstalls it. When it is not a dependency,
copy its ~20 lines into your own \`LayoutDefault\` subclass instead.
(Drupal 10.3+ can also declare layouts entirely in PHP with the \`#[Layout]\`
attribute; YAML remains the idiomatic route for theme layouts.)

### Rendering one yourself

\`\`\`php
$build = \\Drupal::service('plugin.manager.core.layout')
  ->createInstance('incident_twocol', ['column_widths' => '50-50'])
  ->build(['main' => $incident, 'sidebar' => $sla]);
\`\`\`

Unknown region keys are silently dropped, and \`build()\` — not your array
order, not the template — decides the order regions appear in: it walks the
definition's own region names and copies across the ones you supplied.
`,

  comparisons: [
    {
      label: "Declaring the layout",
      intro:
        "Symfony composes layouts by inheritance: a base template with blocks, extended per page. Drupal registers a layout as a discoverable plugin so a non-developer can pick it from a list.",
      leftLang: "twig",
      rightLang: "yaml",
      php: `{# templates/layout/two_column.html.twig #}
<div class="layout layout--twocol">
  <div class="layout__main">
    {% block main %}{% endblock %}
  </div>
  <div class="layout__sidebar">
    {% block sidebar %}{% endblock %}
  </div>
</div>

{# incident/show.html.twig — a developer wires it up #}
{% embed 'layout/two_column.html.twig' %}
  {% block main %}{{ include('incident/_body.html.twig') }}{% endblock %}
  {% block sidebar %}{{ include('incident/_sla.html.twig') }}{% endblock %}
{% endembed %}`,
      ts: `# incident_theme.layouts.yml (theme root; modules use the same file)
incident_twocol:
  label: 'Incident: two column'
  category: 'Incident Tracker'
  path: layouts/incident-twocol
  template: layout--incident-twocol
  library: incident_theme/incident-twocol
  default_region: main
  icon_map:
    - [header, header]
    - [main, sidebar]
  regions:
    header:
      label: Header
    main:
      label: 'Main content'
    sidebar:
      label: Sidebar`,
      note: "The Symfony version is only reachable from a template a developer edits. The YAML version instantly appears in Layout Builder's 'Choose a layout' screen, in Display Suite, and in plugin.manager.core.layout.",
    },
    {
      label: "The layout template",
      intro:
        "Both sides are Twig, but Drupal hands the layout template pre-built render arrays plus two Attribute objects, and the file name itself is the plugin wiring.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# templates/layout/two_column.html.twig #}
{% set classes = 'layout layout--twocol layout--twocol--' ~ (widths|default('67-33')) %}
<div class="{{ classes }}">
  <div class="layout__region layout__region--main">
    {% block main %}{% endblock %}
  </div>
  {% if block('sidebar') is not empty %}
    <div class="layout__region layout__region--sidebar">
      {% block sidebar %}{% endblock %}
    </div>
  {% endif %}
</div>`,
      ts: `{# layouts/incident-twocol/layout--incident-twocol.html.twig #}
{%
  set classes = [
    'layout',
    'layout--incident-twocol',
    'layout--incident-twocol--' ~ settings.column_widths,
  ]
%}
{% if content %}
  <div{{ attributes.addClass(classes) }}>
    {% if content.header %}
      <div{{ region_attributes.header.addClass('layout__region', 'layout__region--header') }}>
        {{ content.header }}
      </div>
    {% endif %}
    {% if content.main %}
      <div{{ region_attributes.main.addClass('layout__region', 'layout__region--main') }}>
        {{ content.main }}
      </div>
    {% endif %}
    {% if content.sidebar %}
      <div{{ region_attributes.sidebar.addClass('layout__region', 'layout__region--sidebar') }}>
        {{ content.sidebar }}
      </div>
    {% endif %}
  </div>
{% endif %}`,
      note: "content.<region>, attributes, region_attributes and settings all come from template_preprocess_layout(). Layout Builder adds contextual-link and drag attributes into region_attributes in preview mode, which is why you must print them rather than hard-code class strings.",
    },
    {
      label: "Giving the layout settings",
      intro:
        "A Symfony layout takes template variables the developer passes. A Drupal layout with settings exposes a real form to the site builder, and the saved values are stored in the display config.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// src/Controller/IncidentController.php
public function show(Incident $incident): Response
{
    return $this->render('incident/show.html.twig', [
        'incident' => $incident,
        // The "setting" is just a variable the developer chose.
        'widths' => '50-50',
    ]);
}`,
      ts: `<?php
// incident_theme/src/Plugin/Layout/IncidentTwoCol.php
namespace Drupal\\incident_theme\\Plugin\\Layout;

use Drupal\\Core\\Form\\FormStateInterface;
use Drupal\\Core\\Layout\\LayoutDefault;

class IncidentTwoCol extends LayoutDefault {

  public function defaultConfiguration(): array {
    return parent::defaultConfiguration() + ['column_widths' => '67-33'];
  }

  public function buildConfigurationForm(array $form, FormStateInterface $form_state): array {
    $form = parent::buildConfigurationForm($form, $form_state);
    $form['column_widths'] = [
      '#type' => 'select',
      '#title' => $this->t('Column widths'),
      '#default_value' => $this->configuration['column_widths'],
      '#options' => ['67-33' => '67% / 33%', '50-50' => '50% / 50%'],
    ];
    return $form;
  }

  public function submitConfigurationForm(array &$form, FormStateInterface $form_state): void {
    parent::submitConfigurationForm($form, $form_state);
    $this->configuration['column_widths'] = $form_state->getValue('column_widths');
  }

}
// then in incident_theme.layouts.yml:
//   class: '\\Drupal\\incident_theme\\Plugin\\Layout\\IncidentTwoCol'`,
      note: "parent::defaultConfiguration() already provides the 'label' key Layout Builder uses for the section label. Core's Drupal\\layout_builder\\Plugin\\Layout\\MultiWidthLayoutBase gives you exactly this column-width form for free — extend it and implement getWidthOptions() — but it ships with the layout_builder module, so only extend it when layout_builder is a dependency; otherwise copy its ~20 lines into your own LayoutDefault subclass. Its buildConfigurationForm() adds column_widths and then calls parent, so the parent's label and context_mapping elements still appear.",
    },
    {
      label: "Rendering a layout from code",
      intro:
        "Sometimes you need the layout outside Layout Builder — in a controller, a block plugin, or a preprocess. Both frameworks can do it; only Drupal keeps it a render array.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Anywhere with the Twig service.
$html = $this->twig->render('layout/two_column.html.twig', [
    'main' => $mainHtml,
    'sidebar' => $sidebarHtml,
    'widths' => '50-50',
]);

return new Response($html);`,
      ts: `<?php
// incident_tracker/src/Controller/IncidentDashboard.php
$layout = \\Drupal::service('plugin.manager.core.layout')
  ->createInstance('incident_twocol', ['column_widths' => '50-50']);

return $layout->build([
  'header' => ['#markup' => $this->t('Open incidents')],
  'main' => $this->incidentTable(),
  'sidebar' => ['#theme' => 'incident_sla_summary', '#stats' => $stats],
  // 'legend' is not a declared region — silently dropped.
  'legend' => ['#markup' => 'ignored'],
]);`,
      note: "Inject plugin.manager.core.layout as LayoutPluginManagerInterface rather than using \\Drupal::. build() returns a render array (with #settings, #layout, #theme and any #attached library), so cache metadata on the region arrays still bubbles normally.",
    },
  ],

  playground: {
    intro:
      "LayoutDefault::build() is about ten lines. This pure-PHP model runs the same steps: loop over the definition's declared region names and copy across the ones the caller supplied, merge default settings, then let the 'template' add the wrappers. Note who wins on ordering — the caller passes sidebar before main. Predict the region order before you run it.",
    lang: "php",
    code: `<?php
// A miniature of Drupal's Layout API: definition -> plugin -> render array -> HTML.

$definition = [
  'id' => 'incident_twocol',
  'label' => 'Incident: two column',
  'theme_hook' => 'layout__incident_twocol',
  'default_region' => 'main',
  'regions' => [
    'header' => ['label' => 'Header'],
    'main' => ['label' => 'Main content'],
    'sidebar' => ['label' => 'Sidebar'],
  ],
  'icon_map' => [
    ['header', 'header'],
    ['main', 'sidebar'],
  ],
];

// LayoutDefault::defaultConfiguration() merged with what the site builder saved.
function configuration(array $saved): array {
  return $saved + ['label' => '', 'column_widths' => '67-33'];
}

// LayoutDefault::build(): "Ensure $build only contains defined regions and in
// the order defined", then hand the whole thing to the layout's theme hook.
function build(array $definition, array $saved, array $regions): array {
  $build = [];
  foreach (array_keys($definition['regions']) as $name) {
    if (array_key_exists($name, $regions)) {
      $build[$name] = $regions[$name];
    }
  }
  $build['#settings'] = configuration($saved);
  $build['#theme'] = $definition['theme_hook'];
  return $build;
}

$regions = [
  'sidebar' => '<div class="sla">SLA: 4h</div>',
  'main' => '<article>Incident #4711</article>',
  'legend' => '<p>no such region - dropped</p>',
];

$build = build($definition, ['column_widths' => '50-50'], $regions);

echo "Keys passed to the template: " . implode(', ', array_keys($build)) . "\\n";
echo "Settings: " . json_encode($build['#settings']) . "\\n";
echo "\\n";

// The definition's region order - not the caller's array order - wins.
// By the time Twig runs, build() has already settled the order; the
// template only adds the wrappers.
$classes = [
  'layout',
  'layout--incident-twocol',
  'layout--incident-twocol--' . $build['#settings']['column_widths'],
];
echo '<div class="' . implode(' ', $classes) . '">' . "\\n";
foreach (array_keys($definition['regions']) as $name) {
  if (empty($build[$name])) {
    continue; // {% if content.header %}
  }
  echo '  <div class="layout__region layout__region--' . $name . '">' . "\\n";
  echo '    ' . $build[$name] . "\\n";
  echo "  </div>\\n";
}
echo "</div>\\n";
echo "\\n";

// icon_map -> the thumbnail the Layout Builder "Choose a layout" list draws.
echo "icon_map preview:\\n";
foreach ($definition['icon_map'] as $row) {
  $cells = [];
  foreach ($row as $region) {
    $cells[] = str_pad($region, 9, ' ', STR_PAD_BOTH);
  }
  echo '|' . implode('|', $cells) . "|\\n";
}
`,
    output: `Keys passed to the template: main, sidebar, #settings, #theme
Settings: {"column_widths":"50-50","label":""}

<div class="layout layout--incident-twocol layout--incident-twocol--50-50">
  <div class="layout__region layout__region--main">
    <article>Incident #4711</article>
  </div>
  <div class="layout__region layout__region--sidebar">
    <div class="sla">SLA: 4h</div>
  </div>
</div>

icon_map preview:
| header  | header  |
|  main   | sidebar |
`,
  },

  keyPoints: [
    "A layout plugin maps region keys to render arrays and returns one render array; declare it in THEME.layouts.yml (or MODULE.layouts.yml) with label, category, path, template, regions, default_region and icon_map — no PHP required.",
    "template: layout--incident-twocol resolves to layout--incident-twocol.html.twig under path:, and derives the theme hook layout__incident_twocol, so hook_theme() is handled by layout_discovery for you.",
    "In the template use content.<region>, attributes, region_attributes.<region> and settings — printing region_attributes is what makes Layout Builder's preview drag/contextual behaviour work.",
    "Settings need a class extending LayoutDefault implementing defaultConfiguration/buildConfigurationForm/submitConfigurationForm; saved values appear as settings.* in Twig. Drupal\\layout_builder\\Plugin\\Layout\\MultiWidthLayoutBase is a ready-made width form, but it belongs to the layout_builder module — only extend it when layout_builder is a dependency.",
    "Render one anywhere with plugin.manager.core.layout ->createInstance($id, $config)->build($regions); build() walks the definition's region names, so undeclared keys are dropped and the region order is the declared order, whatever order you passed.",
    "Layout Builder, Display Suite and Paragraphs all read the same plugin list — you supply the vocabulary of layouts, site builders arrange sections with it.",
  ],

  interview: [
    {
      q: "How do you add a custom layout to a Drupal 10/11 site, and when does it need a PHP class?",
      a: "Create \`THEME.layouts.yml\` in the theme (or module) root and define a plugin ID with \`label\`, \`category\`, \`path\`, \`template\`, \`regions\` and \`default_region\`, then add the Twig template at that path — core's \`layout_discovery\` registers the theme hook automatically. Add \`icon_map\` so the layout picker draws a sensible thumbnail, and \`library\` so its CSS loads only when the layout renders. That is enough for Layout Builder, Display Suite and programmatic use. You only need \`class:\` pointing at a \`LayoutDefault\` subclass when the layout has configurable settings — column widths, an extra wrapper class, a background option — because that class supplies the plugin configuration form and defaults. Extending \`Drupal\\layout_builder\\Plugin\\Layout\\MultiWidthLayoutBase\` covers the common width-selector case with a single \`getWidthOptions()\` method — I'd only do that on a site where layout_builder is already a dependency, since the base class ships with that module and not with \`layout_discovery\`; otherwise I copy its twenty-odd lines onto my own \`LayoutDefault\` subclass.",
    },
    {
      q: "A Symfony developer says 'I'd just use a Twig embed with blocks'. Why does Drupal need a layout plugin at all?",
      a: "Twig embeds are fine when a developer decides the composition at build time — the arrangement lives in a template file only a developer can change. Drupal's layout plugins exist so the arrangement becomes *data*: Layout Builder stores a list of sections (layout ID plus settings plus components) in config or in a node's \`layout_builder__layout\` field, and a content editor rearranges it in the UI. That means the same layout has to be discoverable, have named regions with human labels, ship a preview icon and expose a settings form. In practice I still use Twig includes and SDC inside each region — the layout plugin is the outer shell that non-developers get to control, not a replacement for template composition.",
    },
    {
      q: "How would you render one of your layouts outside Layout Builder, and what should you watch for?",
      a: "Inject \`plugin.manager.core.layout\` (typed as \`LayoutPluginManagerInterface\`), call \`createInstance('incident_twocol', $settings)\`, then \`->build(['main' => $a, 'sidebar' => $b])\` and return that render array. \`LayoutDefault::build()\` keeps only the declared regions, in definition order, so a typo'd region key vanishes silently — that is the first thing I check when a region is blank. It also sets \`#settings\`, \`#layout\`, \`#theme\` and attaches the layout's library, and because everything stays a render array your cache contexts and tags bubble up normally. Don't render layouts to HTML strings early; that breaks placeholders and cacheability.",
    },
  ],

  quiz: [
    {
      question:
        "In incident_theme.layouts.yml you set \`template: layout--incident-twocol\` and \`path: layouts/incident-twocol\`. What must exist, and what theme hook is created?",
      options: [
        "layouts/incident-twocol/layout--incident-twocol.html.twig, theme hook layout__incident_twocol",
        "templates/layout--incident-twocol.html.twig, theme hook incident_twocol",
        "layouts/incident-twocol/incident-twocol.html.twig, and you must add hook_theme() yourself",
        "Nothing — the template key only sets a CSS class",
      ],
      answerIndex: 0,
      explain:
        "The layout plugin manager appends the provider's directory to path, treats template as the file name without .html.twig, and derives the theme hook by swapping hyphens for underscores — layout--incident-twocol becomes layout__incident_twocol. layout_discovery registers it, so you never write hook_theme().",
    },
    {
      question:
        "You call ->build(['main' => $a, 'aside' => $b]) but the layout declares regions main and sidebar. What happens?",
      options: [
        "A plugin exception is thrown for the unknown region",
        "'aside' is silently dropped; only main renders",
        "'aside' is moved into default_region",
        "'aside' renders after the declared regions in a fallback wrapper",
      ],
      answerIndex: 1,
      explain:
        "LayoutDefault::build() walks the definition's own region names (getRegionNames()) and copies over only the keys that exist in your array, so unknown keys such as 'aside' never make it into the build — no warning, no exception. That loop also fixes the region order to the order declared in layouts.yml, whatever order you passed them in. default_region only matters when Layout Builder has to relocate existing components after a site builder switches layouts.",
    },
    {
      question:
        "Your layout needs a 67/33 vs 50/50 selector that a site builder can change per section. What is the minimum work?",
      options: [
        "Add two separate layout IDs in layouts.yml, one per width",
        "Add a class extending LayoutDefault with a configuration form, and reference it via class: in layouts.yml",
        "Add a settings: key to layouts.yml listing the options",
        "Add the widths as regions and let the editor leave one empty",
      ],
      answerIndex: 1,
      explain:
        "Configurable settings live in a plugin class: defaultConfiguration(), buildConfigurationForm() and submitConfigurationForm() on a LayoutDefault subclass, wired up with class: in the YAML. The saved values are exposed to the template as settings.column_widths. Drupal\\layout_builder\\Plugin\\Layout\\MultiWidthLayoutBase implements this exact form and you only supply getWidthOptions() — just remember it comes from the layout_builder module, so extend it only when layout_builder is a dependency.",
    },
  ],
};

export default lesson;
