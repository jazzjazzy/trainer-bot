import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "theme-anatomy",
  title: "Theme Anatomy: info.yml, Regions & Starterkit",
  part: "The Theme Layer",
  estMinutes: 13,
  summary:
    "What a Drupal theme actually is on disk — one .info.yml declaring regions, libraries and overrides — and the modern choice between inheriting from a base theme and generating a standalone copy with Starterkit.",

  concept: `
In Symfony there is no theme layer. You have \`templates/\`, a Twig namespace or
two, Encore or AssetMapper for assets, and total ownership of every tag. Drupal
inserts a whole extension type between your controller and the HTML — and that
extension is defined by exactly one required file.

## incident_theme.info.yml

\`\`\`yaml
name: Incident Theme
type: theme
description: 'Front end for the incident tracker.'
core_version_requirement: ^10 || ^11
base theme: olivero
version: 1.0.0
logo: images/logo.svg
screenshot: screenshot.png

libraries:
  - incident_theme/global

libraries-override:
  olivero/global-styling:
    css:
      theme:
        css/components/table.css: false

libraries-extend:
  core/drupal.dialog:
    - incident_theme/dialog-tweaks

ckeditor5-stylesheets:
  - css/editor.css

regions:
  header: Header
  primary_menu: 'Primary menu'
  breadcrumb: Breadcrumb
  highlighted: Highlighted
  content: Content
  sidebar_first: 'Sidebar first'
  footer: Footer
regions_hidden:
  - highlighted
\`\`\`

\`type: theme\` is what separates this from a module. \`base theme\` is the big
one: a machine name makes you a **sub-theme** (you inherit templates, libraries
and preprocess functions — but never regions, see below); \`false\` means no
parent theme at all. \`incident_theme\` declares \`olivero\`, so everywhere in
this course it is an Olivero sub-theme.

Two rules people trip on. First, the moment you declare a \`regions:\` key you
**replace** core's defaults entirely — no key-by-key merge — so \`content\` had
better be in your list, and any region you omit disappears from Block layout.
Second, if you declare no \`regions:\` at all you do **not** inherit your base
theme's set — you get core's hardcoded defaults (\`sidebar_first\`,
\`sidebar_second\`, \`content\`, \`header\`, \`primary_menu\`, \`secondary_menu\`,
\`footer\`, \`highlighted\`, \`help\`, \`page_top\`, \`page_bottom\`,
\`breadcrumb\`). Regions are the one thing sub-theming never hands down:
\`ThemeExtensionList::$defaults\` fills them in per theme, and
\`fillInSubThemeData()\` copies only the engine, owner and prefix from a base
theme. \`regions_hidden:\` keeps a region working in \`page.html.twig\` while
hiding it from the block UI (core uses it for \`page_top\`/\`page_bottom\`).

\`libraries-override\` and \`libraries-extend\` are the theme-only escape hatches:
override rewrites or deletes files inside somebody else's library (\`false\`
removes, a path replaces); extend appends your library whenever theirs is
attached. Neither exists for modules. \`ckeditor5-stylesheets\` (Drupal 10+; it
was \`ckeditor_stylesheets\` in the CKEditor 4 era) pushes theme CSS into the
authoring surface. \`logo:\` as an info key landed in 8.6 — before that core
just looked for \`logo.svg\` in the theme root; \`favicon.ico\` in the root still
works that way, and both are overridable per-site from theme settings.

## Layout on disk

\`\`\`
themes/custom/incident_theme/
  incident_theme.info.yml
  incident_theme.libraries.yml
  incident_theme.theme          # preprocess + suggestion hooks
  theme-settings.php            # hook_form_system_theme_settings_alter()
  templates/                    # page.html.twig, node--incident.html.twig, …
  css/  js/  images/
  config/install/incident_theme.settings.yml
  config/schema/incident_theme.schema.yml
\`\`\`

## Starterkit: copy, don't inherit

Since 9.4, core ships \`starterkit_theme\` — a hidden theme that is not meant to
be a parent. Since Drupal 10.3 a theme qualifies as a Starterkit source by
shipping a \`THEME.starterkit.yml\` file (keys \`info\`, \`ignore\`, \`no_edit\`,
\`no_rename\`); \`starterkit: true\` in the .info.yml was the 9.4–10.2 mechanism
and is gone. Running \`php core/scripts/drupal generate-theme incident_theme\`
**copies** its templates and CSS into your theme and rewrites every reference to
your name. You own all of it: no surprise markup changes on a core minor
upgrade, but also no free bug fixes. Note that you own the markup by *copying*,
not by standing alone — the copied info.yml keeps whatever \`base theme\`
starterkit_theme itself declares, which is \`stable9\` on Drupal 10 and 11.0–11.3
and \`false\` from 11.4, where \`stable9\` is deprecated. Sub-theming Olivero
or a contrib base theme is the opposite trade. Pick copy for design-led builds,
inherit when you mostly want a colour and a logo.
`,

  comparisons: [
    {
      label: "Declaring the front-end layer",
      intro:
        "Symfony has nothing to declare — templates/ exists and Twig finds it. Drupal will not load a single template until an .info.yml announces the theme to the extension system.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: config/packages/twig.yaml — optional, and only if you want
# extra namespaces. There is no "theme" concept at all.
twig:
    default_path: '%kernel.project_dir%/templates'
    paths:
        '%kernel.project_dir%/templates/incident': incident
    form_themes:
        - 'bootstrap_5_layout.html.twig'

# Assets are a separate world: webpack.config.js / importmap.php.
# Nothing here can remove or replace a CSS file shipped by a bundle —
# you copy the bundle's template into templates/bundles/ and edit it.`,
      ts: `# themes/custom/incident_theme/incident_theme.info.yml
name: Incident Theme
type: theme
description: 'Front end for the incident tracker.'
core_version_requirement: ^10 || ^11
package: Custom

# A machine name = sub-theme: incident_theme inherits Olivero's templates,
# libraries and preprocess functions (regions are never inherited).
# false = no parent theme. Note this is NOT what generate-theme necessarily
# leaves behind — see the Starterkit note.
base theme: olivero

# Attached on every page this theme renders.
libraries:
  - incident_theme/global

# Theme-only superpower #1: rewrite or delete files in someone else's library.
libraries-override:
  core/drupal.tableselect:
    js:
      misc/tableselect.js: js/tableselect-fixed.js
  olivero/global-styling:
    css:
      theme:
        css/components/table.css: false

# Theme-only superpower #2: append yours whenever theirs is attached.
libraries-extend:
  core/drupal.dialog:
    - incident_theme/dialog-tweaks

# CSS injected into the CKEditor 5 editing surface (Drupal 10/11).
ckeditor5-stylesheets:
  - css/editor.css

logo: images/logo.svg      # info-key form added in Drupal 8.6
screenshot: screenshot.png`,
      note: "libraries-override / libraries-extend only work from a theme. A module that wants to change another module's assets must implement hook_library_info_alter().",
    },
    {
      label: "Named slots vs. regions",
      intro:
        "Both frameworks give a page named holes to fill. In Symfony a child template fills them; in Drupal the holes are config-facing — site builders drop blocks into them from /admin/structure/block.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# templates/base.html.twig — slots are template-level and private. #}
<body>
  <header>{% block header %}{% endblock %}</header>
  <main>
    {% block content %}{% endblock %}
  </main>
  <aside>{% block sidebar %}{% endblock %}</aside>
  <footer>{% block footer %}{% endblock %}</footer>
</body>

{# templates/incident/show.html.twig #}
{% extends 'base.html.twig' %}
{% block content %}<h1>{{ incident.title }}</h1>{% endblock %}
{% block sidebar %}{{ render(controller('App\\\\Controller\\\\StatsController::recent')) }}{% endblock %}

{# Only a developer editing a template can change what appears where. #}`,
      ts: `{# incident_theme.info.yml declares the names… #}
{# regions:                                                   #}
{#   header: Header                                           #}
{#   content: Content            <- required, keep it         #}
{#   sidebar_first: 'Sidebar first'                           #}
{#   footer: Footer                                           #}

{# …and templates/page.html.twig prints them. #}
<div class="layout-container">
  <header role="banner">
    {{ page.header }}
    {{ page.primary_menu }}
  </header>

  <main role="main">
    <a id="main-content" tabindex="-1"></a>
    {{ page.breadcrumb }}
    {{ page.content }}
  </main>

  {% if page.sidebar_first %}
    <aside class="layout-sidebar-first" role="complementary">
      {{ page.sidebar_first }}
    </aside>
  {% endif %}

  <footer role="contentinfo">{{ page.footer }}</footer>
</div>

{# A site builder now fills these from Block layout with no code at all. #}`,
      note: "Declaring any regions: key replaces core's 12 defaults outright — omit 'content' and the page renders empty. Declaring none gives you those defaults, never the base theme's list. Wrap optional regions in {% if page.x %} so you don't emit empty wrappers.",
    },
    {
      label: "Scaffolding and switching it on",
      intro:
        "Symfony scaffolds a project; Drupal scaffolds a theme by copying an existing one. Then the theme has to be installed and made default, which is config, not code.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: nothing to generate — templates/ already exists.
composer require symfony/twig-bundle
composer require symfony/webpack-encore-bundle

mkdir -p templates/incident
$EDITOR templates/base.html.twig

# "Switching themes" means editing templates or swapping a Twig namespace.
# There is no install step and no database record of which theme is active.
npm run build`,
      ts: `# Drupal 9.4+/10/11: copy starterkit_theme into your own theme.
# Run from the Drupal root (the directory containing core/).
php core/scripts/drupal generate-theme incident_theme \\
  --name="Incident Theme" \\
  --description="Front end for the incident tracker." \\
  --path="themes/custom"
# -> Theme generated successfully to themes/custom/incident_theme
#
# --starterkit=<theme> picks a different source. Since 10.3 it must ship
# a THEME.starterkit.yml file (info / ignore / no_edit / no_rename) or you
# get "Theme source theme X is not a valid starter kit." Olivero ships no
# olivero.starterkit.yml, so it is not a valid source.
# (In 9.4-10.2 the marker was "starterkit: true" in the .info.yml.)

# Install the theme (writes core.extension), then make it default.
drush theme:enable incident_theme
drush config:set system.theme default incident_theme -y

# Admin theme stays separate:
drush config:set system.theme admin claro -y

# Export so the choice travels with the codebase, then rebuild.
drush config:export -y
drush cache:rebuild

# Turn on Twig debug + no caching while you work: the UI toggle at
# /admin/config/development/settings, or the classic settings.local.php
# + development.services.yml (parameters: twig.config: debug: true).
# Since 10.3 that toggle writes the "development_settings" key-value
# collection, NOT state, so "drush state:set twig_debug 1" does nothing:
drush php:eval "\\Drupal::keyValue('development_settings')->set('twig_debug', TRUE); \\Drupal::service('kernel')->invalidateContainer();"`,
      note: "system.theme:default is configuration. Enabling a theme by hand on production and forgetting to export it is the classic 'it looks different on staging' bug.",
    },
    {
      label: "Default logo, favicon and theme settings",
      intro:
        "Symfony has no notion of a configurable logo — it's an <img> you write. Drupal exposes logo/favicon/features as per-theme configuration with a UI, so a custom theme ships sensible defaults in config/install.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony: the "setting" is a parameter, or just hard-coded markup.
// config/services.yaml
//   parameters:
//     app.logo_path: '/build/images/logo.svg'

// templates/base.html.twig
//   <img src="{{ asset(logo_path) }}" alt="{{ site_name }}">

// Anything editable by a non-developer means building your own
// settings entity/form and your own admin route. No framework help.
final class BrandingExtension extends AbstractExtension
{
    public function __construct(private string $logoPath) {}

    public function getGlobals(): array
    {
        return ['logo_path' => $this->logoPath];
    }
}`,
      ts: `# themes/custom/incident_theme/config/install/incident_theme.settings.yml
# Installed once when the theme is enabled; editable afterwards at
# /admin/appearance/settings/incident_theme.
logo:
  use_default: false
  path: 'themes/custom/incident_theme/images/logo.svg'
favicon:
  use_default: true
  path: ''
  mimetype: 'image/vnd.microsoft.icon'
features:
  node_user_picture: false
  comment_user_picture: false
  favicon: true
  logo: true
  name: true
  slogan: false
# Custom key of your own — needs a schema, see below.
incident_severity_colours: true

---
# config/schema/incident_theme.schema.yml
incident_theme.settings:
  type: theme_settings
  label: 'Incident Theme settings'
  mapping:
    incident_severity_colours:
      type: boolean
      label: 'Colour-code incident rows by severity'

# Add the checkbox to the UI from theme-settings.php with
# hook_form_system_theme_settings_alter(); read it in a preprocess with
# theme_get_setting('incident_severity_colours', 'incident_theme').`,
      note: "Dropping logo.svg and favicon.ico in the theme root still works with zero config; config/install is for when you want a non-default path or to preset the feature checkboxes.",
    },
  ],

  playground: {
    intro:
      "Sub-theme mechanics in pure PHP: walk the 'base theme' chain, see where regions actually come from (a trap — they do NOT ride that chain), stack the info.yml libraries base-first, then apply libraries-override and libraries-extend to definitions you don't own. The last two lines show what Starterkit trades away. Predict the region list before you run it.",
    lang: "php",
    code: `<?php
// A miniature theme registry: resolve the base-theme chain, inherit regions,
// stack libraries, then apply libraries-override / libraries-extend.

$info = [
  'stable9' => [
    'name' => 'Stable 9',
    'base theme' => FALSE,
    'regions' => ['header' => 'Header', 'content' => 'Content', 'footer' => 'Footer'],
    'libraries' => ['stable9/base'],
  ],
  'olivero' => [
    'name' => 'Olivero',
    'base theme' => 'stable9',
    'regions' => [
      'header' => 'Header',
      'content' => 'Content',
      'sidebar' => 'Sidebar',
      'footer_top' => 'Footer Top',
    ],
    'libraries' => ['olivero/global-styling'],
  ],
  // A SUB-THEME: owns almost nothing, borrows Olivero's markup and CSS.
  'incident_theme' => [
    'name' => 'Incident Theme',
    'base theme' => 'olivero',
    'libraries' => ['incident_theme/global'],
    // No 'regions' key -> core's hardcoded defaults. NOT Olivero's regions:
    // regions are the one thing a base theme never hands down.
    'libraries-override' => [
      'olivero/global-styling' => [
        'css' => [
          'base' => ['css/base/variables.css' => 'css/overrides/variables.css'],
          'theme' => ['css/components/table.css' => FALSE],
        ],
      ],
    ],
    'libraries-extend' => [
      'core/drupal.dialog' => ['incident_theme/dialog-tweaks'],
    ],
  ],
];

// What core/Olivero actually ship, before any theme touches them.
$definitions = [
  'olivero/global-styling' => [
    'css' => [
      'base' => ['css/base/variables.css' => []],
      'theme' => ['css/components/table.css' => [], 'css/components/card.css' => []],
    ],
  ],
  'core/drupal.dialog' => ['js' => ['misc/dialog/dialog.js' => []]],
];

/** ThemeInitialization: walk 'base theme' up, return base-first order. */
function base_theme_chain(array $info, string $theme): array {
  $chain = [];
  $current = $theme;
  while ($current !== NULL) {
    array_unshift($chain, $current);
    $parent = $info[$current]['base theme'] ?? FALSE;
    $current = $parent === FALSE ? NULL : $parent;
  }
  return $chain;
}

$chain = base_theme_chain($info, 'incident_theme');
echo "Base theme chain (base first): " . implode(' -> ', $chain) . "\\n";

// Regions: NOT merged key-by-key, and NOT inherited along that chain either.
// Only two sources exist -- the theme's OWN info.yml, or core's hardcoded
// defaults. ThemeExtensionList::$defaults supplies the list below, and
// ExtensionList::createExtensionInfo() fills it in for any theme that omitted
// the key. fillInSubThemeData() copies engine/owner/prefix from a base theme --
// never regions. So incident_theme does NOT get Olivero's 'sidebar'.
$core_default_regions = [
  'sidebar_first' => 'Left sidebar',
  'sidebar_second' => 'Right sidebar',
  'content' => 'Content',
  'header' => 'Header',
  'primary_menu' => 'Primary menu',
  'secondary_menu' => 'Secondary menu',
  'footer' => 'Footer',
  'highlighted' => 'Highlighted',
  'help' => 'Help',
  'page_top' => 'Page top',
  'page_bottom' => 'Page bottom',
  'breadcrumb' => 'Breadcrumb',
];
$own_regions = $info['incident_theme']['regions'] ?? NULL;
$regions = $own_regions ?? $core_default_regions;
echo "Regions come from: " . ($own_regions === NULL ? 'core defaults' : 'incident_theme.info.yml') . "\\n";
echo "Block layout offers: " . implode(', ', array_keys($regions)) . "\\n";

// info.yml 'libraries' stack base-first, so the child can win the cascade.
$attached = [];
foreach ($chain as $name) {
  foreach ($info[$name]['libraries'] ?? [] as $library) {
    $attached[] = $library;
  }
}
echo "Global libraries: " . implode(', ', $attached) . "\\n\\n";

// libraries-override: replace a file (string), or drop it (FALSE).
$overrides = $info['incident_theme']['libraries-override'] ?? [];
foreach ($overrides as $library => $override) {
  foreach ($override['css'] as $group => $files) {
    foreach ($files as $original => $replacement) {
      if ($replacement === FALSE) {
        unset($definitions[$library]['css'][$group][$original]);
        echo "libraries-override: removed $original from $library\\n";
      }
      else {
        unset($definitions[$library]['css'][$group][$original]);
        $definitions[$library]['css'][$group][$replacement] = [];
        echo "libraries-override: $original -> $replacement in $library\\n";
      }
    }
  }
}

echo "\\nEffective olivero/global-styling CSS:\\n";
foreach ($definitions['olivero/global-styling']['css'] as $group => $files) {
  foreach (array_keys($files) as $file) {
    echo "  [$group] $file\\n";
  }
}

// libraries-extend: never edits the original, just appends yours after it.
$extend = $info['incident_theme']['libraries-extend'] ?? [];
$request = ['core/drupal.dialog'];
$final = [];
foreach ($request as $library) {
  $final[] = $library;
  foreach ($extend[$library] ?? [] as $extra) {
    $final[] = $extra;
  }
}
echo "\\nAttaching core/drupal.dialog now loads:\\n";
print_r($final);

// The starterkit alternative: templates are COPIED, not inherited. (The copied
// info.yml keeps starterkit_theme's own 'base theme' -- stable9 on Drupal 10
// and 11.0-11.3, false from 11.4. Either way you own every template.)
$generated = ['name' => 'Incident Theme', 'base theme' => FALSE, 'libraries' => ['incident_theme/global']];
$info['incident_generated'] = $generated;
echo "\\nstarterkit-generated chain: " . implode(' -> ', base_theme_chain($info, 'incident_generated')) . "\\n";
echo "It owns every template, so libraries-override has nothing to override.\\n";
`,
    output: `Base theme chain (base first): stable9 -> olivero -> incident_theme
Regions come from: core defaults
Block layout offers: sidebar_first, sidebar_second, content, header, primary_menu, secondary_menu, footer, highlighted, help, page_top, page_bottom, breadcrumb
Global libraries: stable9/base, olivero/global-styling, incident_theme/global

libraries-override: css/base/variables.css -> css/overrides/variables.css in olivero/global-styling
libraries-override: removed css/components/table.css from olivero/global-styling

Effective olivero/global-styling CSS:
  [base] css/overrides/variables.css
  [theme] css/components/card.css

Attaching core/drupal.dialog now loads:
Array
(
    [0] => core/drupal.dialog
    [1] => incident_theme/dialog-tweaks
)

starterkit-generated chain: incident_generated
It owns every template, so libraries-override has nothing to override.
`,
  },

  keyPoints: [
    "A theme is one required file: THEME.info.yml with name, type: theme, core_version_requirement (^10 || ^11) and a 'base theme' key — a machine name to inherit, false to stand alone.",
    "Declaring regions: replaces core's defaults wholesale (always include content); omitting the key gets you core's 12 hardcoded defaults, NOT the base theme's set — regions are never inherited; regions_hidden: keeps a region printable in page.html.twig but out of Block layout.",
    "libraries-override (replace a path, or false to delete) and libraries-extend (append after) are theme-only — modules must use hook_library_info_alter() instead.",
    "php core/scripts/drupal generate-theme incident_theme --path=themes/custom COPIES starterkit_theme rather than inheriting: you own all the markup, and core minor upgrades can't change it under you.",
    "Enabling is two steps: drush theme:enable incident_theme installs it, drush config:set system.theme default incident_theme makes it active — and both live in exported config, not code.",
    "ckeditor5-stylesheets pushes theme CSS into the CKEditor 5 editing surface (Drupal 10/11; ckeditor_stylesheets was the CKEditor 4 key), and logo:/screenshot: plus config/install/THEME.settings.yml handle branding defaults.",
  ],

  interview: [
    {
      q: "You're starting a new custom theme for a client redesign. Do you sub-theme Olivero or generate one with Starterkit? Justify the choice.",
      a: "For a design-led build, Starterkit — `php core/scripts/drupal generate-theme` **copies** `starterkit_theme`'s templates and CSS into my theme and renames every reference, so I get complete ownership of the markup. That matters because Drupal core explicitly does not treat front-end theme markup as an API: Olivero's templates can change in any minor release, and a sub-theme silently inherits that churn mid-project. The trade is that I no longer get core's fixes for free, and I have to keep my own accessibility and RTL work current. I'd sub-theme instead when the brief is genuinely 'core's theme with our logo and colours', or when I'm extending a contrib base theme that publishes a stable template contract — in those cases inheritance plus `libraries-override` is far less code to maintain.",
    },
    {
      q: "A block disappeared from Block layout after a theme change and nobody edited any blocks. What do you check first?",
      a: "The `regions:` key in `THEME.info.yml`. Regions are not merged key-by-key with core's defaults, and they are not inherited from a base theme at all — the moment a theme declares a `regions:` map it replaces core's default set entirely, so removing or renaming one key drops every block placed there out of the UI. I'd diff the info.yml, then check `regions_hidden:`, which keeps a region functional in `page.html.twig` but removes it from the block admin screen (core uses it for `page_top`/`page_bottom`). If the region really has been renamed, the fix is a config update: the `block.block.*` config entities still carry the old `region` value, so they need re-saving or an update hook, not just a cache rebuild.",
    },
    {
      q: "A contrib module ships a CSS file that fights your design. How do you remove it, and what changes if the request comes to a module instead of a theme?",
      a: "From a theme, `libraries-override` in the info.yml: name the library, mirror its `css` group structure, and map the offending path to `false` to delete it or to another path to replace it. That's a declarative, cache-friendly change with no PHP. From a module you cannot do that — `libraries-override` and `libraries-extend` are read only for themes — so a module has to implement `hook_library_info_alter(&$libraries, $extension)` and mutate the array. In both cases the paths must match the shipped definition exactly, including the `base`/`layout`/`component`/`state`/`theme` group; a silently-ignored override is nearly always a wrong group or a stale library cache, so `drush cr` before you go hunting.",
    },
    {
      q: "How does a theme get activated, and why does that matter for deployment?",
      a: "Two distinct things happen. `drush theme:enable incident_theme` installs the extension, which writes it into `core.extension`. Then `drush config:set system.theme default incident_theme` makes it the active front-end theme; `system.theme` also holds `admin`. Both are configuration, so the correct workflow is to do it locally, `drush config:export`, and commit — a theme switched by hand in the production UI is exactly the drift that gets reverted by the next `config:import`. Coming from Symfony this is the surprising bit: which theme renders isn't a code or environment-variable decision, it's a database-backed config entity that happens to be tracked in Git.",
    },
  ],

  quiz: [
    {
      question:
        "Your incident_theme.info.yml declares `regions:` with header, sidebar_first and footer, but no `content`. What happens?",
      options: [
        "Core merges its default regions in, so `content` still exists.",
        "The theme inherits `content` from its base theme even though other regions are declared.",
        "The theme has no content region — the main page content has nowhere to go and blocks placed in `content` vanish from Block layout.",
        "Drupal refuses to install the theme with a validation error.",
      ],
      answerIndex: 2,
      explain:
        "Declaring a regions: key replaces core's default set outright; there is no key-by-key merge, and there is nothing to inherit either — a base theme never passes its regions down. Without a `content` region, `{{ page.content }}` is empty and the main content block has no home. Always include `content`, and use regions_hidden: if you want a region that works in Twig but stays out of the block UI.",
    },
    {
      question:
        "What does `php core/scripts/drupal generate-theme incident_theme` actually produce?",
      options: [
        "A sub-theme with `base theme: starterkit_theme`, inheriting its templates.",
        "A renamed copy of starterkit_theme's templates, CSS and libraries that you own outright — a copy, not an inheritance.",
        "An empty theme skeleton with only an info.yml.",
        "A sub-theme of Olivero, since Olivero is core's default front-end theme.",
      ],
      answerIndex: 1,
      explain:
        "Starterkit copies rather than inherits — that's the whole point. Every reference to starterkit_theme is rewritten to your machine name and you end up owning the markup, so core minor releases can't change your output. starterkit_theme is hidden and not meant to be used as a base theme. Since Drupal 10.3 a valid --starterkit source is one that ships a THEME.starterkit.yml file (the `starterkit: true` info key was the 9.4–10.2 marker), and Olivero ships no olivero.starterkit.yml, so it isn't one. Watch the `base theme` line in the result: the copied info.yml keeps starterkit_theme's own value — `stable9` on Drupal 10 and 11.0–11.3, `false` from 11.4 — so 'standalone' is about ownership of the files, not necessarily an empty base theme.",
    },
    {
      question:
        "Which mechanism appends your JS to core/drupal.dialog every time any module attaches it, without editing core's library definition?",
      options: [
        "`libraries-override` in the theme's info.yml",
        "`libraries-extend` in the theme's info.yml",
        "`dependencies:` in the theme's libraries.yml",
        "`hook_page_attachments_alter()` in the theme's .theme file",
      ],
      answerIndex: 1,
      explain:
        "libraries-extend maps a library name to a list of your libraries, which are attached immediately after it whenever it loads. libraries-override rewrites or deletes files inside the target definition instead. dependencies: goes the other way (your library pulls theirs in), and page_attachments_alter only fires for page-level attachments, missing libraries attached deep inside a render array.",
    },
    {
      question:
        "Which pair of commands installs incident_theme and makes it the active front-end theme?",
      options: [
        "`drush theme:enable incident_theme` then `drush config:set system.theme default incident_theme`",
        "`drush en incident_theme` then `drush config:set system.site theme incident_theme`",
        "`drush theme:enable incident_theme` alone — enabling a theme makes it default",
        "`drush config:set core.extension theme.incident_theme 0` then `drush cr`",
      ],
      answerIndex: 0,
      explain:
        "theme:enable installs the extension (recording it in core.extension); making it active is a separate config write to system.theme, whose keys are `default` and `admin`. `drush en` is for modules, and the active theme has nothing to do with system.site. Remember to config:export afterwards so the choice deploys with the code.",
    },
  ],
};

export default lesson;
