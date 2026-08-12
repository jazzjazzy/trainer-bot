import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "libraries-deep",
  title: "Asset Libraries in Depth",
  part: "Assets, Components & Layout",
  estMinutes: 13,
  summary:
    "The whole libraries.yml grammar — SMACSS CSS buckets as weights, js attributes, external assets, dependencies on core libraries — plus the two theme-only levers (libraries-override and libraries-extend) that let incident_theme rewrite assets a module it does not own declared.",

  concept: `
## A build step you don't have

Encore hands you a compiled bundle and a \`manifest.json\`; every page that
wants the dashboard CSS pulls in whatever \`dashboard.css\` happens to contain
today. Drupal's asset system is the opposite shape: a declarative registry of
named libraries, resolved **per request** against the render arrays that
actually got built, aggregated on the fly. Nothing is compiled ahead of time,
so nothing needs rebuilding when a module is enabled.

### The grammar, in full

\`\`\`yaml
# incident_theme.libraries.yml
dashboard:
  version: 1.x
  css:
    base:      { css/reset-tweaks.css: {} }
    layout:    { css/dashboard-grid.css: {} }
    component: { css/dashboard-panel.css: {} }
    state:     { css/incident-severity.css: {} }
    theme:     { css/incident-colors.css: { media: print } }
  js:
    js/dashboard.js: {}
    js/chart-init.js: { attributes: { type: module } }
    assets/vendor/chart/chart.min.js: { minified: true, preprocess: false }
  dependencies:
    - core/drupal
    - core/once
    - core/drupalSettings
\`\`\`

The five CSS keys are **not folders** — they are weights.
\`LibraryDiscoveryParser\` turns each bucket name into the constant
\`CSS_BASE\` (-200), \`CSS_LAYOUT\` (-100), \`CSS_COMPONENT\` (0),
\`CSS_STATE\` (100), \`CSS_THEME\` (200) from \`core/includes/common.inc\`. Any
other key trips an assertion. Above that sits the **aggregate group**: CSS
declared by a theme (and by an SDC, whose generated \`components.*\` libraries
have been treated the same way since 11.2, backported to 10.5 — on earlier
10.x a module's SDC CSS landed in \`CSS_AGGREGATE_DEFAULT\` instead) gets
\`CSS_AGGREGATE_THEME\` = 100 while module CSS gets 0 — and group is compared
before weight. A theme's \`base\`
bucket therefore still loads after a module's \`theme\` bucket. That is the
single most misunderstood thing about Drupal CSS order.

JS has no buckets. Order is dependency order then declaration order, and a
**positive** \`weight\` on a JS file throws \`UnexpectedValueException\` — core
wants you to fix the dependency list instead. \`header: true\` on the library
moves it (and its dependencies) into \`<head>\`.

### What escapes aggregation

\`AssetResolver\` refuses to preprocess any JS asset that carries
\`attributes\`, and CSS whose path already has a query string. So
\`{ attributes: { type: module } }\` or \`{ defer: true }\` guarantees its own
\`<script>\` tag — which is exactly what you want for an ES module, and exactly
what surprises people who then wonder why their file isn't in the aggregate.
External assets need \`type: external\` (auto-detected for \`https://\` and
protocol-free \`//cdn/…\` paths), plus \`remote:\` and a \`license:\` block when
the code is third-party, or the parser throws.

### Theme-only levers

\`libraries-override\` and \`libraries-extend\` live in \`THEME.info.yml\`, never
in a module. Override swaps or deletes individual files (or a whole library);
extend appends your library whenever a given library loads. One gotcha worth
memorising: core applies extend **only when the library was not overridden**,
and \`drupalSettings\` may never be overridden — use
\`hook_library_info_alter()\` for that.
`,

  comparisons: [
    {
      label: "Declaring the assets",
      intro:
        "Ship a dashboard stylesheet, an ES-module chart initialiser and a vendored chart library. Encore compiles them into entries; Drupal registers them as a named library and resolves them per request.",
      leftLang: "js",
      rightLang: "yaml",
      php: `// webpack.config.js — Encore. Order inside a bundle is import order,
// so SMACSS discipline is a code-review rule, not a mechanism.
const Encore = require('@symfony/webpack-encore');

Encore
  .setOutputPath('public/build/')
  .setPublicPath('/build')
  .addEntry('dashboard', './assets/dashboard.js')
  .addStyleEntry('dashboard-css', './assets/styles/dashboard.scss')
  .enableSassLoader()
  .enableVersioning(Encore.isProduction())  // hashes filenames
  .splitEntryChunks()
  .autoProvidejQuery();

module.exports = Encore.getWebpackConfig();

// assets/dashboard.js — the dependency graph is import statements,
// resolved at BUILD time into one or more chunks.
// import 'chart.js';
// import './styles/incident-card.css';

// An ES module or a CDN script does not fit the entry model at all:
// you hand-write the <script> tag in the Twig layout and remember
// to keep its version in sync with composer/npm yourself.`,
      ts: `# incident_theme.libraries.yml
dashboard:
  version: 1.x
  css:
    # Bucket names are WEIGHTS: base -200, layout -100,
    # component 0, state 100, theme 200.
    base:
      css/reset-tweaks.css: {}
    layout:
      css/dashboard-grid.css: {}
    component:
      # The card's own component CSS is NOT here: it ships with the
      # module, in incident_tracker/card-behaviour.
      css/dashboard-panel.css: {}
    state:
      css/incident-severity.css: {}
    theme:
      css/incident-print.css: { media: print }
  js:
    js/dashboard.js: {}
    # attributes => its own <script> tag, never aggregated.
    js/chart-init.js: { attributes: { type: module } }
    # Already minified, and kept out of the aggregate on purpose.
    assets/vendor/chart/chart.umd.min.js: { minified: true, preprocess: false }
  dependencies:
    - core/drupal          # Drupal.behaviors, Drupal.t()
    - core/once            # once() — replaced jQuery.once in D9.2+
    - core/drupalSettings  # the drupalSettings global

# A third-party file served from a CDN. 'remote' + 'license' are
# REQUIRED once you declare 'remote', or the parser throws
# LibraryDefinitionMissingLicenseException.
sparkline:
  remote: https://github.com/example/sparkline
  version: "2.1.0"
  license:
    name: MIT
    url: https://raw.githubusercontent.com/example/sparkline/2.1.0/LICENSE
    gpl-compatible: true
  js:
    https://cdn.example.com/sparkline-2.1.0.min.js: { type: external, minified: true }

# Needs to run before first paint? Move the whole library to <head>.
dashboard_boot:
  version: 1.x
  header: true
  js:
    js/theme-preference.js: {}`,
      note:
        "Two hard rules people hit: CSS must be nested under one of the five bucket names (anything else fails an assertion in LibraryDiscoveryParser), and a JS file may not carry a positive 'weight' — core throws UnexpectedValueException and tells you to declare a dependency instead. Drupal 11.5 (still 11.x dev at the time of writing — it is in no tagged release) adds an 'aggregate_target' key for pinning a library into its own aggregate; it is a nested map, aggregate_target: { css: true, js: true }, not a flat scalar. Skip it entirely if you target Drupal 10 or any current 11.x release.",
    },
    {
      label: "Attaching it to output",
      intro:
        "Get the library onto the page — but only the pages that need it. Symfony attaches assets to a template; Drupal attaches them to a render array, so the attachment travels with the fragment and survives caching.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# templates/incident/dashboard.html.twig #}
{% extends 'base.html.twig' %}

{% block stylesheets %}
  {{ parent() }}
  {{ encore_entry_link_tags('dashboard-css') }}
{% endblock %}

{% block javascripts %}
  {{ parent() }}
  {{ encore_entry_script_tags('dashboard') }}
  {# Passing PHP data to JS: a data- attribute or an inline
     <script type="application/json"> blob you parse yourself. #}
  <script type="application/json" id="dashboard-settings">
    {{ settings|json_encode|raw }}
  </script>
{% endblock %}

{# Site-wide assets go in base.html.twig. There is no per-fragment
   attachment: if an ESI-included fragment needs a stylesheet, the
   PARENT template has to know about it. #}`,
      ts: `<?php
// 1. From a render array — the usual case. #attached travels with the
//    fragment, so a block rendered into a page still gets its assets,
//    and it is cached alongside the markup.
$build['dashboard'] = [
  '#theme' => 'incident_dashboard',
  '#incidents' => $incidents,
  '#attached' => [
    'library' => ['incident_theme/dashboard'],
    // Typed data for JS. Deep-merged across the whole page, so
    // namespace it under your module key.
    'drupalSettings' => [
      'incidentTracker' => [
        // Milliseconds — JS reads settings.incidentTracker.pollInterval.
        'pollInterval' => 30000,
        'endpoint' => Url::fromRoute('incident_tracker.feed')->toString(),
      ],
    ],
    // Other #attached buckets you get for free:
    'html_head' => [[['#tag' => 'meta', '#attributes' => [...]], 'key']],
    'html_head_link' => [[['rel' => 'canonical', 'href' => '/incidents'], TRUE]],
    'http_header' => [['X-Incident-Count', (string) count($incidents)]],
  ],
  '#cache' => ['contexts' => ['user.permissions'], 'tags' => ['node_list:incident']],
];

// 2. From the template itself, when only the theme knows it is needed.
//    (Twig: {{ attach_library('incident_theme/dashboard') }} — it just
//    renders a throwaway ['#attached' => ['library' => [...]]] array.)

// 3. Globally, for every page. Modules only; themes must use the _alter.
function incident_tracker_page_attachments(array &$attachments): void {
  $attachments['#attached']['library'][] = 'incident_tracker/global';
  // Anything other than #attached and #cache here throws.
  $attachments['#cache']['contexts'][] = 'user.roles';
}

// 4. Last word, and the page-attachment hook a theme *can* implement —
//    hook_page_attachments() itself is module-only, but themes get the
//    last word on the alters the theme layer takes part in (form_alter,
//    theme_registry_alter, theme_suggestions_HOOK_alter,
//    element_info_alter, library_info_alter, js_alter/css_alter,
//    page_attachments_alter).
function incident_theme_page_attachments_alter(array &$attachments): void {
  $index = array_search('core/drupal.dialog', $attachments['#attached']['library'] ?? [], TRUE);
  if ($index !== FALSE) {
    unset($attachments['#attached']['library'][$index]);
  }
}`,
      note:
        "Because #attached is part of the render array, a cached block carries its libraries with it — there is no Symfony equivalent of 'this ESI fragment also needs these two stylesheets'. drupalSettings is deep-merged across every attachment on the page and lands in a single drupal-settings-json <script>, which is why namespacing your key matters. In Drupal 11.1+ both hooks can be written as #[Hook('page_attachments')] methods on a service class instead of functions in the .module file.",
    },
    {
      label: "Rewriting someone else's assets",
      intro:
        "The Incident Tracker module ships CSS your designer hates, and core's dialog needs one extra rule. In Symfony you fork or patch; in Drupal a theme can rewrite another extension's library declaration from its .info.yml.",
      leftLang: "twig",
      rightLang: "yaml",
      php: `{# Symfony: a bundle's assets are baked into ITS templates. To drop
   or replace one you override the template under
   templates/bundles/AcmeIncidentBundle/ and copy the whole block. #}

{# templates/bundles/AcmeIncidentBundle/dashboard.html.twig #}
{% block stylesheets %}
  {# Original line, deleted:
     {{ encore_entry_link_tags('acme-incident') }} #}
  {{ encore_entry_link_tags('our-incident-skin') }}
{% endblock %}

{# To ADD a stylesheet whenever the bundle's dialog renders, you either
   override every template that uses it, or append a global entry in
   base.html.twig and load it on pages that do not need it.

   Nothing lets you say "when THIS asset loads, also load MINE" —
   there is no registry to hook into. #}`,
      ts: `# incident_theme.info.yml — themes only. A module cannot do this;
# it must use hook_library_info_alter() instead.
name: Incident Theme
type: theme
base theme: olivero
core_version_requirement: ^10 || ^11

libraries:
  - incident_theme/global

libraries-override:
  # Replace an entire library with one of yours.
  incident_tracker/legacy-charts: incident_theme/charts

  # Remove a library outright.
  incident_tracker/print-styles: false

  # Surgery on individual files. The KEY must match the path exactly as
  # the declaring extension wrote it, in the SAME SMACSS bucket — get
  # the bucket wrong and it silently does nothing.
  incident_tracker/dashboard:
    css:
      theme:
        css/incident-colors.css: false            # drop it
    js:
      js/dashboard.js: js/dashboard.js            # shadow it entirely

  # The card's component CSS ships with the module's behaviour library,
  # so THAT is the library you name here — not one of the theme's.
  incident_tracker/card-behaviour:
    css:
      component:
        css/incident-card.css: css/our-card.css   # value is relative
                                                  # to THIS theme

  # Core's paths are relative to /core, exactly as core.libraries.yml
  # writes them.
  core/drupal.dialog:
    css:
      theme:
        misc/dialog/dialog.theme.css: css/dialog.css

libraries-extend:
  # Whenever core's dialog loads anywhere, load ours alongside it.
  core/drupal.dialog:
    - incident_theme/dialog-tweaks
  incident_tracker/dashboard:
    - incident_theme/dashboard-skin`,
      note:
        "libraries-override runs on the RAW yaml before buckets are flattened into weights, which is why the bucket has to match. Two traps: core skips libraries-extend for any library you also overrode wholesale, and drupalSettings may not appear under libraries-override at all (InvalidLibrariesOverrideSpecificationException — use hook_library_info_alter()). Overrides from the base theme apply too, so an Olivero subtheme inherits Olivero's.",
    },
    {
      label: "Aggregation and cache-busting",
      intro:
        "Both systems concatenate and fingerprint. Encore does it at deploy time from a fixed graph; Drupal does it at request time from whatever libraries this page actually attached.",
      leftLang: "bash",
      rightLang: "php",
      php: `# Symfony: a build step, run on every deploy.
$ npm ci && npm run build
  Entrypoint dashboard = runtime.abc123.js dashboard.def456.js
  Entrypoint dashboard-css = dashboard-css.789abc.css
  written to public/build/, with public/build/manifest.json

# Twig resolves logical names through manifest.json, so the hash in
# the URL changes only when the content does. Forget to rebuild and
# you ship stale assets; forget to deploy manifest.json and every
# asset 404s.

# AssetMapper (6.3+) drops webpack but still needs a compile step
# to write the versioned files:
$ php bin/console asset-map:compile`,
      ts: `<?php
// Drupal: no build step. Aggregation is a runtime setting.
// /admin/config/development/performance, or config:
//   system.performance: css.preprocess / js.preprocess

// settings.local.php while theming — see individual files in devtools.
$config['system.performance']['css']['preprocess'] = FALSE;
$config['system.performance']['js']['preprocess'] = FALSE;

// With aggregation ON, assets are grouped by (type, media, category,
// declaration order) and each group's filename is a hash of its
// contents plus the libraries in it:
//   /sites/default/files/css/css_Kx9…hash….css
// Since 10.1 the file is written LAZILY: the first request for a
// filename that isn't on disk falls through to AssetControllerBase,
// which regenerates it if the hash checks out. No warm-up needed
// after a deploy, and old aggregates keep serving cached pages.

// Non-aggregated files get ?<query string> instead, bumped on every
// cache rebuild. Drupal 10.2+ exposes it as a service:
\\Drupal::service('asset.query_string')->reset();   // state: asset.css_js_query_string
// drush cr does exactly this as part of drupal_flush_all_caches().`,
      note:
        "The practical difference: Drupal's aggregate contains only the libraries this page attached, so an admin page and a node page get different — and separately cached — aggregates. That is better than one fat bundle for cache hit rate and worse for the number of distinct files, which is what the 'aggregate_target' key landing in Drupal 11.5 exists to tune.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Pure PHP, no Drupal: run the library pipeline in the same order core does — apply libraries-override to the raw YAML, flatten the SMACSS buckets into weights, deep-merge libraries-extend, walk the dependency graph, then sort. Predict two things before you run it: which of the two overrides actually takes effect, and where the theme's 'layout' stylesheet ends up relative to the module's 'component' one.",
    code: `<?php
// A miniature Drupal asset pipeline, in the same order core runs it:
// parse -> libraries-override -> flatten SMACSS buckets into weights ->
// libraries-extend -> resolve dependencies -> sort -> group for aggregation.

// core/includes/common.inc: the SMACSS buckets are nothing but weights...
const CSS_BASE = -200;
const CSS_LAYOUT = -100;
const CSS_COMPONENT = 0;
const CSS_STATE = 100;
const CSS_THEME = 200;
// ...and the aggregate group, which sorts BEFORE weight.
const CSS_AGGREGATE_DEFAULT = 0;
const CSS_AGGREGATE_THEME = 100;

// Raw *.libraries.yml, straight off disk.
$raw = [
    'core/drupalSettings' => [
        'from' => 'module',
        'js' => ['misc/drupalSettingsLoader.js' => []],
    ],
    'core/drupal' => [
        'from' => 'module',
        'js' => ['misc/drupal.js' => []],
        'dependencies' => ['core/drupalSettings'],
    ],
    'core/once' => [
        'from' => 'module',
        'js' => ['assets/vendor/once/once.min.js' => ['minified' => true, 'preprocess' => false]],
    ],
    'incident_tracker/dashboard' => [
        'from' => 'module',
        'css' => [
            // The card's own CSS lives in incident_tracker/card-behaviour;
            // this library is the dashboard's own chrome.
            'component' => ['css/dashboard-widgets.css' => []],
            'theme' => ['css/incident-colors.css' => []],
            'base' => ['css/reset-tweaks.css' => []],
        ],
        'js' => [
            'js/dashboard.js' => [],
            'js/chart-init.js' => ['attributes' => ['type' => 'module']],
            'https://cdn.example.com/sparkline-2.1.0.min.js' => ['type' => 'external', 'minified' => true],
        ],
        'dependencies' => ['core/drupal', 'core/once'],
    ],
    // Declared by the THEME, so its CSS is stamped with the theme group.
    'incident_theme/dashboard-skin' => [
        'from' => 'theme',
        'css' => [
            'layout' => ['css/dashboard-grid.css' => []],
            'state' => ['css/incident-severity.css' => []],
        ],
    ],
];

// incident_theme.info.yml
$librariesOverride = [
    'incident_tracker/dashboard' => [
        'css' => [
            // Remove one file, swap another for a copy inside the theme.
            'theme' => ['css/incident-colors.css' => false],
            // Right file, WRONG bucket -> silently does nothing.
            'component' => ['css/reset-tweaks.css' => 'css/our-reset.css'],
        ],
    ],
];
$librariesExtend = [
    'incident_tracker/dashboard' => ['incident_theme/dashboard-skin'],
];

// --- 1. LibraryDiscoveryParser::applyLibrariesOverride(), on the RAW yaml ---
foreach ($librariesOverride as $name => $definition) {
    foreach ($definition['css'] as $bucket => $overrides) {
        foreach ($overrides as $original => $replacement) {
            if (!array_key_exists($original, $raw[$name]['css'][$bucket] ?? [])) {
                echo "override MISS   {$name} css.{$bucket}.{$original}\\n";
                continue;
            }
            $options = $raw[$name]['css'][$bucket][$original];
            unset($raw[$name]['css'][$bucket][$original]);
            if ($replacement === false) {
                echo "override REMOVE {$name} css.{$bucket}.{$original}\\n";
                continue;
            }
            $replacement = '/themes/custom/incident_theme/' . $replacement;
            $raw[$name]['css'][$bucket][$replacement] = $options;
            echo "override SWAP   {$name} -> {$replacement}\\n";
        }
    }
}

// --- 2. Flatten the buckets: bucket name becomes a weight ------------------
$parsed = [];
foreach ($raw as $name => $library) {
    $group = $library['from'] === 'theme' ? CSS_AGGREGATE_THEME : CSS_AGGREGATE_DEFAULT;
    $parsed[$name] = ['css' => [], 'js' => [], 'dependencies' => $library['dependencies'] ?? []];
    foreach ($library['css'] ?? [] as $bucket => $files) {
        foreach ($files as $file => $options) {
            $parsed[$name]['css'][] = [
                'file' => $file,
                'bucket' => $bucket,
                'group' => $group,
                'weight' => constant('CSS_' . strtoupper($bucket)) + ($options['weight'] ?? 0),
            ];
        }
    }
    foreach ($library['js'] ?? [] as $file => $options) {
        $external = ($options['type'] ?? 'file') === 'external';
        $parsed[$name]['js'][] = [
            'file' => $file,
            // AssetResolver: attributes or external means never aggregated.
            'preprocess' => ($options['preprocess'] ?? true) && empty($options['attributes']) && !$external,
        ];
    }
}

// --- 3. LibraryDiscoveryCollector::applyLibrariesExtend() -------------------
// A deep MERGE of the whole definition, not a new dependency.
foreach ($librariesExtend as $name => $extras) {
    foreach ($extras as $extra) {
        $parsed[$name]['css'] = array_merge($parsed[$name]['css'], $parsed[$extra]['css']);
        $parsed[$name]['js'] = array_merge($parsed[$name]['js'], $parsed[$extra]['js']);
        echo "extend  MERGE   {$extra} into {$name}\\n";
    }
}
echo "\\n";

// --- 4. Dependencies first, depth-first, each library once ------------------
$order = [];
$resolve = function (string $name) use (&$resolve, &$order, $parsed): void {
    if (isset($order[$name])) {
        return;
    }
    $order[$name] = TRUE;
    foreach ($parsed[$name]['dependencies'] as $dependency) {
        $resolve($dependency);
    }
    unset($order[$name]);
    $order[$name] = TRUE;
};
$resolve('incident_tracker/dashboard');

echo "LOAD ORDER\\n";
foreach (array_keys($order) as $i => $name) {
    echo '  ' . ($i + 1) . ". {$name}\\n";
}
echo "\\n";

// --- 5. Sort CSS by group, then weight, then discovery order ---------------
$css = [];
$seq = 0;
foreach (array_keys($order) as $name) {
    foreach ($parsed[$name]['css'] as $asset) {
        $asset['seq'] = $seq++;
        $css[] = $asset;
    }
}
usort($css, fn($a, $b) => [$a['group'], $a['weight'], $a['seq']] <=> [$b['group'], $b['weight'], $b['seq']]);

echo "CSS ORDER (group wins, then weight)\\n";
foreach ($css as $asset) {
    printf("  group %-4d weight %-5d %-10s %s\\n", $asset['group'], $asset['weight'], $asset['bucket'], $asset['file']);
}
echo "\\n";

echo "JS ORDER\\n";
foreach (array_keys($order) as $name) {
    foreach ($parsed[$name]['js'] as $asset) {
        printf("  %-11s %s\\n", $asset['preprocess'] ? '[aggregate]' : '[separate]', $asset['file']);
    }
}
`,
    output: `override REMOVE incident_tracker/dashboard css.theme.css/incident-colors.css
override MISS   incident_tracker/dashboard css.component.css/reset-tweaks.css
extend  MERGE   incident_theme/dashboard-skin into incident_tracker/dashboard

LOAD ORDER
  1. core/drupalSettings
  2. core/drupal
  3. core/once
  4. incident_tracker/dashboard

CSS ORDER (group wins, then weight)
  group 0    weight -200  base       css/reset-tweaks.css
  group 0    weight 0     component  css/dashboard-widgets.css
  group 100  weight -100  layout     css/dashboard-grid.css
  group 100  weight 100   state      css/incident-severity.css

JS ORDER
  [aggregate] misc/drupalSettingsLoader.js
  [aggregate] misc/drupal.js
  [separate]  assets/vendor/once/once.min.js
  [aggregate] js/dashboard.js
  [separate]  js/chart-init.js
  [separate]  https://cdn.example.com/sparkline-2.1.0.min.js
`,
  },

  keyPoints: [
    "The five CSS keys (base/layout/component/state/theme) are weights — CSS_BASE -200 through CSS_THEME 200 — and anything else fails an assertion in LibraryDiscoveryParser.",
    "Aggregate group is compared before weight: theme-declared CSS (and, since 11.2 / 10.5, SDC 'components.*' CSS) sits at CSS_AGGREGATE_THEME 100, so a theme's base bucket still loads after a module's theme bucket.",
    "Any JS file with 'attributes' (defer, async, type: module) or type: external is excluded from aggregation and gets its own tag; a positive JS weight throws — declare a dependency instead.",
    "Attach per render array with '#attached' (it travels with the cached fragment), per template with attach_library(), or globally with hook_page_attachments() — modules only — and hook_page_attachments_alter(), which themes may implement too.",
    "libraries-override and libraries-extend are theme-only, live in THEME.info.yml, and match file paths exactly as the declaring extension wrote them, in the same SMACSS bucket; modules use hook_library_info_alter().",
    "Aggregation is a runtime setting, not a build step: filenames hash the group's contents, files are written lazily on first request since 10.1, and unaggregated URLs carry the asset.query_string that drush cr resets.",
  ],

  interview: [
    {
      q: "A module ships a stylesheet that breaks your design. Walk me through the options for getting rid of it, and when you'd pick each.",
      a: `If I own a theme, the cheapest fix is \`libraries-override\` in \`THEME.info.yml\`: name the library, the SMACSS bucket and the exact file path the module declared, and map it to \`false\` to drop it or to a path inside my theme to replace it. That's declarative, survives module updates and needs no PHP. If I need the change to apply regardless of which theme is active — an admin theme, an AJAX dialog, a mail render — I use \`hook_library_info_alter()\` in a module instead, because \`libraries-override\` is theme-only and \`drupalSettings\` can't be touched from it at all. If the problem is only *additive* — the module's CSS is fine but needs two more rules — I'd reach for \`libraries-extend\` so my stylesheet loads after theirs everywhere the library appears, rather than forking the file. The trap to mention is that override keys are matched against the raw YAML before buckets are flattened into weights, so a path in the wrong bucket silently does nothing, and core skips \`libraries-extend\` for any library you also overrode wholesale.`,
    },
    {
      q: "Coming from Encore, what actually changes about how you think about frontend assets in Drupal?",
      a: `The unit stops being a compiled bundle and becomes a named library resolved at request time. With Encore I declare entries, run a build, and the page pulls a fixed set of chunks; the dependency graph is \`import\` statements resolved at build time. In Drupal the graph lives in \`libraries.yml\` \`dependencies\`, and the set of libraries on a given page is whatever the render arrays that were actually built attached — so an admin page and a node page get genuinely different aggregates. The second shift is that attachment is per render array, not per template: \`#attached\` travels inside a cached block or field, so a fragment can carry its own CSS without the page layout knowing. Practically, that means no build step and no manifest to deploy, but it also means you can't assume "my CSS is always on the page" — if you need it everywhere, that's \`hook_page_attachments()\` or the theme's \`libraries:\` key, not an entry file.`,
    },
    {
      q: "Why would you add 'attributes' or 'preprocess: false' to a JS file, and what does it cost?",
      a: `\`attributes\` is how you get \`defer\`, \`async\` or \`type: module\` onto the \`<script>\` tag — an ES module physically cannot be concatenated with classic scripts, so \`AssetResolver\` refuses to preprocess any asset that carries attributes and renders it as its own tag. \`preprocess: false\` says the same thing explicitly, and is what core uses for already-minified vendor files where re-minifying only wastes CPU (usually paired with \`minified: true\`). The cost is an extra HTTP request and a file that's outside the aggregate's cache-busting hash, so it falls back to the \`asset.query_string\` fingerprint that resets on cache rebuild. It also fragments the aggregate: a non-aggregated file in the middle of a library list splits the surrounding files into two separate groups, which is exactly the trick core's \`ckeditor5\` library uses on purpose.`,
    },
  ],

  quiz: [
    {
      question:
        "incident_tracker declares css/badge.css under the 'theme' bucket. incident_theme declares css/grid.css under the 'layout' bucket. Which loads first in the rendered page?",
      options: [
        "grid.css — 'layout' (-100) sorts before 'theme' (200)",
        "badge.css — module CSS is in aggregate group 0, theme CSS in group 100, and group is compared before weight",
        "Whichever library was attached first, since CSS buckets only affect aggregation",
        "badge.css — 'theme' is always the last bucket, so it is emitted first",
      ],
      answerIndex: 1,
      explain:
        "LibraryDiscoveryParser stamps every asset with both a group (CSS_AGGREGATE_DEFAULT 0 for modules, CSS_AGGREGATE_THEME 100 for themes — and, since 11.2 / 10.5, for SDC 'components.*' libraries too) and a weight from the bucket name. AssetResolver sorts by group first, so every theme stylesheet lands after every module stylesheet regardless of bucket. Buckets only order files within the same group.",
    },
    {
      question:
        "Your theme's libraries-override lists incident_tracker/dashboard with 'component: { css/card.css: false }', but the module declared css/card.css under 'theme'. What happens?",
      options: [
        "The file is removed anyway — the bucket is only a hint",
        "Drupal throws InvalidLibrariesOverrideSpecificationException on cache rebuild",
        "Nothing at all: the key doesn't exist at that path, so the override is a silent no-op",
        "The file is moved from the 'theme' bucket into the 'component' bucket",
      ],
      answerIndex: 2,
      explain:
        "setOverrideValue() does a NestedArray::getValue() on ['css', <bucket>, <path>] against the raw YAML and only acts if the key exists. A wrong bucket, a leading slash that the original didn't have, or a renamed file all produce a quiet no-op — which is why 'my libraries-override does nothing' is nearly always a path or bucket mismatch, best diagnosed by dumping the library with hook_library_info_alter() or Devel.",
    },
    {
      question:
        "Which of these libraries.yml entries will still be emitted as its own <script> tag with CSS/JS aggregation turned on?",
      options: [
        "js/dashboard.js: {}",
        "js/chart-init.js: { attributes: { type: module } }",
        "js/util.js: { weight: -5 }",
        "js/legacy.js: { minified: true }",
      ],
      answerIndex: 1,
      explain:
        "AssetResolver sets preprocess to FALSE whenever an asset carries attributes, because a type=module (or defer/async) script cannot be concatenated with classic scripts. 'minified: true' only skips re-minification, and a negative weight just reorders — both still aggregate. Note that a positive JS weight would throw UnexpectedValueException outright.",
    },
    {
      question:
        "Where can you implement hook_page_attachments() to add a library to every page?",
      options: [
        "In a module's .module file only — themes must use hook_page_attachments_alter()",
        "In either a module or a theme; they behave identically",
        "In a theme's .theme file only, since assets are a theme concern",
        "Nowhere — it was removed in Drupal 10 in favour of THEME.info.yml 'libraries:'",
      ],
      answerIndex: 0,
      explain:
        "Core's documentation for hook_page_attachments() states it can only be implemented by modules; hook_page_attachments_alter() runs afterwards and is open to both modules and themes, which is how a theme removes or reorders another extension's global assets. A theme's own site-wide assets go under the 'libraries:' key in THEME.info.yml. In Drupal 11.1+ either hook can be written as a #[Hook] attribute method on a service class.",
    },
  ],
};

export default lesson;
