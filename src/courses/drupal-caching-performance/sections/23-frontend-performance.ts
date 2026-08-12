import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "frontend-performance",
  title: "Front-End Performance: Aggregation, Images & Core Web Vitals",
  part: "Measurement & Operations",
  estMinutes: 13,
  summary:
    "Once the server is fast, the browser becomes the bottleneck: learn how Drupal's runtime CSS/JS aggregation groups assets, how a sloppy library definition fragments it, and how image styles, srcset and explicit dimensions map onto LCP, CLS and INP.",

  concept: `
## The last hop nobody profiles

You can get TTFB to 40ms and still score 38 on Lighthouse. Everything past the
response body — how many stylesheets the browser must fetch before it paints,
whether the hero image is a 4000px original, whether jQuery blocks the main
thread — is front-end performance, and on a news site it is usually where the
remaining seconds live.

### Aggregation is a runtime pipeline, not a build

Symfony gives you Webpack Encore or AssetMapper: you run a build, you ship
hashed bundles. Drupal decides at request time. Every library you attach
contributes its files to a collection, and two settings on
\`/admin/config/development/performance\` — stored as
\`system.performance:css.preprocess\` and \`system.performance:js.preprocess\` —
decide whether those files are concatenated. Since **Drupal 10.1** the HTML
request no longer builds the aggregate itself: it emits a URL carrying enough
information (libraries, groups, theme, language) for a *separate route* to
generate, serve and write the file, so cold-cache page requests are no longer
punished and browsers fetch aggregates in parallel.

CSS is ordered by SMACSS bucket — \`base\`, \`layout\`, \`component\`, \`state\`,
\`theme\` — because that is what the \`css:\` key in a \`*.libraries.yml\` file
declares. Grouping then walks that ordered list and merges **adjacent** items
that share the same media and are groupable. Two consequences follow:

- \`preprocess: false\` on one component file does not just exclude that file, it
  **splits the run in two**, turning one aggregate into three requests.
- \`media: print\` correctly gets its own group — that one is a feature.

JavaScript groups the same way, plus header/footer scope. Attributes matter
here, but not in the way people assume. In **Drupal 10 and 11 alike**,
\`AssetResolver::getJsAssets()\` contains:

\`\`\`php
$options['preprocess'] = $options['cache'] && empty($options['attributes']) ? $options['preprocess'] : FALSE;
\`\`\`

Any JS file carrying a non-empty \`attributes\` map is therefore **forced out of
every aggregate** and rendered as its own \`<script>\` tag — which is exactly what
\`JsCollectionRenderer\` requires ("Attributes may only be set if this script is
output independently"). So a file declaring \`defer\` never loses the attribute;
it costs you an extra HTTP request instead. Attribute-aware aggregation — one
bundle for \`async\`, one for \`defer\` — is a *proposed* core change (issue
#1587536, change record still in Draft) and is **not in any released version**.
And if your theme still declares \`core/jquery\`, you are
shipping ~30KB gzipped plus parse time to anonymous readers who may need none of
it.

### Images are the whole LCP story

Never render a raw uploaded file. An **image style** produces derivatives on
first request; a **responsive image style** maps breakpoints to styles and emits
a \`<picture>\` element with \`srcset\`, so a phone downloads 400px, not 2400px.
Core's image and responsive-image formatters expose a **Loading** setting
(\`lazy\` / \`eager\`) and emit \`width\`/\`height\` so the browser reserves space —
responsive images gained both in **Drupal 10.1**.

Two rules that trip people up:

- The **LCP image must be \`eager\`**, not lazy. A lazy hero is a self-inflicted
  half-second.
- Modern formats: core's GD toolkit has supported WebP for years; **AVIF landed
  in Drupal 11.2**, and only when PHP's GD is built against libgd 2.3.2+ with
  libavif.

### Mapping Core Web Vitals to Drupal causes

| Metric | Threshold | Usual Drupal cause |
| --- | --- | --- |
| LCP | ≤ 2.5s | hero image with no image style, lazy-loaded, or slow TTFB |
| CLS | ≤ 0.1 | images without width/height, late-injected blocks, webfont swap |
| INP | ≤ 200ms | heavy Drupal.behaviors, jQuery, third-party tags |

Lighthouse is a lab number on a synthetic device — use it to compare builds.
Field data (CrUX, or your own RUM) is what actually ranks. Optimise the lab,
verify in the field.
`,

  comparisons: [
    {
      label: "Build-time bundling vs runtime aggregation",
      intro:
        "Symfony hashes bundles at deploy time; Drupal assembles groups per request from library metadata. Same goal, very different failure modes.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: webpack.config.js / AssetMapper — a build step.
# Output is fixed at deploy: app.a3f9c1.js, app.7d21b0.css.
#
# webpack.config.js (Encore)
#   .addEntry('news', './assets/news.js')
#   .enableVersioning()
#   .splitEntryChunks()
#
# Twig then asks the manifest for the hashed name:
#   {{ encore_entry_link_tags('news') }}
#   {{ encore_entry_script_tags('news') }}
#
# Nothing is decided at request time. If a page needs only 3KB of
# that bundle, it still downloads the bundle.`,
      ts: `# Drupal: newsroom.libraries.yml — metadata, assembled per request.
incident-ticker:
  version: 1.2.0
  css:
    component:
      css/ticker.css: {}
  js:
    js/ticker.js: {}
  dependencies:
    - core/once
    - core/drupal

# Attached from a render array or a preprocess hook:
#   $build['#attached']['library'][] = 'newsroom/incident-ticker';
#
# Drupal collects every attached library for THIS page, sorts CSS by
# SMACSS bucket, and groups adjacent groupable files into aggregates.
# A page that needs 3KB gets 3KB — but the grouping is only as good
# as your library declarations.`,
      note: "Practical upshot: in Symfony a bad bundle is a build problem you see once; in Drupal a bad library definition silently fragments aggregates on every page it appears on. Audit the number of CSS/JS requests on a real page, not on the front page.",
    },
    {
      label: "Deferring scripts",
      intro:
        "Render-blocking JS is the easiest INP/LCP win. Both frameworks let you set the attribute — Drupal's twist is what aggregation does with it.",
      leftLang: "twig",
      rightLang: "yaml",
      php: `{# Symfony: you control the tag, so you control the attribute. #}
<script src="{{ asset('build/news.js') }}" defer></script>

{# Encore can emit it for you: #}
{# webpack.config.js: Encore.configureScriptAttributes({ defer: true }) #}
{{ encore_entry_script_tags('news') }}

{# Critical CSS is a build concern too: inline the above-the-fold
   rules, load the rest with a preload + onload swap. #}`,
      ts: `# Drupal: attributes live in the library definition.
incident-map:
  version: 2.0.0
  # LIBRARY-level key: this library AND its dependencies render in
  # <head> instead of the footer. Written under an individual file it
  # is silently ignored and the script still lands in the footer.
  header: true
  js:
    js/map.js: { attributes: { defer: true } }
  # preprocess, minified and attributes ARE per-file options:
  # A file you deliberately keep out of the aggregate:
  #   js/legacy.js: { preprocess: false }
  # A file that is already minified (skip re-minification):
  #   js/vendor.min.js: { minified: true }

# AssetResolver::getJsAssets(), Drupal 10 and 11 alike:
#   $options['preprocess'] = $options['cache']
#     && empty($options['attributes']) ? $options['preprocess'] : FALSE;
# Non-empty attributes => preprocess FALSE => its own <script> tag.`,
      note: "You do not have to keep an attributed script out of the aggregate yourself — core already does. AssetResolver forces preprocess to FALSE whenever attributes is non-empty (identical code in 10.x and 11.x), so the defer survives and the file is served as its own <script>. The cost is fragmentation: attribute a dozen files and you have bought a dozen extra requests. Attribute-aware aggregation that would bundle all the defer files together is still an open core proposal (#1587536), not shipped behaviour.",
    },
    {
      label: "Responsive images",
      intro:
        "Serving a 2400px hero to a phone is the single most common LCP failure. Symfony reaches for a filter library; Drupal has this in core config.",
      leftLang: "twig",
      rightLang: "yaml",
      php: `{# Symfony + liip/imagine: filter sets in config, srcset by hand. #}
{# config/packages/liip_imagine.yaml
   liip_imagine:
     filter_sets:
       hero_sm: { filters: { thumbnail: { size: [640, 360] } } }
       hero_lg: { filters: { thumbnail: { size: [1600, 900] } } }
#}
<img
  src="{{ article.image|imagine_filter('hero_lg') }}"
  srcset="{{ article.image|imagine_filter('hero_sm') }} 640w,
          {{ article.image|imagine_filter('hero_lg') }} 1600w"
  sizes="(max-width: 700px) 100vw, 1600px"
  width="1600" height="900"
  loading="eager" fetchpriority="high"
  alt="{{ article.imageAlt }}">`,
      ts: `# Drupal: image styles + a responsive image style, no template code.
# config/install/image.style.hero_lg.yml
name: hero_lg
label: 'Hero large'
effects:
  d0b1c2e3-1111-4a1b-9c2d-0f1e2d3c4b5a:
    id: image_scale
    weight: 1
    data: { width: 1600, height: 900, upscale: false }

# config/install/responsive_image.styles.hero.yml
# NB: ResponsiveImageStyle's id key is "id" (ImageStyle's is "name").
id: hero
label: Hero
breakpoint_group: olivero
image_style_mappings:
  - breakpoint_id: 'olivero.md'
    multiplier: 1x
    image_mapping_type: image_style
    image_mapping: hero_lg
fallback_image_style: hero_lg

# Then set the field's display formatter to "Responsive image",
# pick the hero style, and set Loading = eager for the LCP image.
# The formatter emits <picture>/srcset plus width/height itself.`,
      note: "Drupal 10.1 added the loading setting and width/height output to the responsive image formatter; existing displays were set to eager on upgrade, new ones default to lazy. Check your hero explicitly — the default is wrong for above-the-fold content.",
    },
    {
      label: "Measuring it",
      intro:
        "Lab tooling looks similar on both stacks. The Drupal-specific part is checking that production settings are actually on.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: profile the server, then the browser.
blackfire curl https://news.example.com/live

# Lab metrics for the rendered page:
npx lighthouse https://news.example.com/live \\
  --preset=desktop --output=json --output-path=./lh.json

# Budget enforcement in CI:
npx @lhci/cli autorun \\
  --collect.url=https://news.example.com/live \\
  --assert.preset=lighthouse:recommended`,
      ts: `# Drupal: confirm the production toggles first.
drush config:get system.performance
#   css:
#     preprocess: true
#   js:
#     preprocess: true
#   cache:
#     page:
#       max_age: 900

# Turn aggregation ON without touching the UI:
drush config:set system.performance css.preprocess 1 -y
drush config:set system.performance js.preprocess 1 -y

# Asset URLs are cache-busted by a state value; bump it after a deploy:
drush cache:rebuild

# Then run the same Lighthouse/LHCI commands against the site.`,
      note: "Aggregation is normally disabled in local settings (settings.local.php) and enabled in production config. The classic embarrassment is exporting config from a dev box with preprocess off and deploying it. Diff system.performance before every release.",
    },
  ],

  playground: {
    intro:
      "Drupal orders CSS by SMACSS bucket, then merges adjacent groupable files into aggregates. This simulates that pass so you can see what one stray preprocess: false costs you.",
    lang: "php",
    code: `<?php
// How Drupal turns a pile of CSS assets into <link> tags.
// Assets are ordered by SMACSS bucket weight, then grouped: a run of
// adjacent, groupable items sharing the same media becomes ONE aggregate.

$weights = ['base' => -200, 'layout' => -100, 'component' => 0, 'state' => 100, 'theme' => 200];

$assets = [
  ['library' => 'core/normalize',        'bucket' => 'base',      'media' => 'all',   'preprocess' => TRUE],
  ['library' => 'olivero/layout',        'bucket' => 'layout',    'media' => 'all',   'preprocess' => TRUE],
  ['library' => 'incident/ticker',       'bucket' => 'component', 'media' => 'all',   'preprocess' => TRUE],
  ['library' => 'incident/map',          'bucket' => 'component', 'media' => 'all',   'preprocess' => FALSE],
  ['library' => 'incident/byline',       'bucket' => 'component', 'media' => 'all',   'preprocess' => TRUE],
  ['library' => 'newsroom/print-styles', 'bucket' => 'theme',     'media' => 'print', 'preprocess' => TRUE],
  ['library' => 'newsroom/colours',      'bucket' => 'theme',     'media' => 'all',   'preprocess' => TRUE],
];

function group_assets(array $assets, array $weights): array {
  // Stable sort by SMACSS weight; declaration order breaks ties.
  $order = 0;
  foreach ($assets as &$a) {
    $a['sort'] = [$weights[$a['bucket']], $order++];
  }
  unset($a);
  usort($assets, fn($x, $y) => $x['sort'] <=> $y['sort']);

  $groups = [];
  $current = NULL;
  foreach ($assets as $a) {
    $key = $a['preprocess'] ? 'agg:' . $a['media'] : 'solo';
    if ($current === NULL || $current['key'] !== $key || $key === 'solo') {
      if ($current !== NULL) {
        $groups[] = $current;
      }
      $current = ['key' => $key, 'media' => $a['media'], 'members' => []];
    }
    $current['members'][] = $a['library'];
  }
  if ($current !== NULL) {
    $groups[] = $current;
  }
  return $groups;
}

function report(string $title, array $groups): void {
  echo $title . "\\n";
  foreach ($groups as $i => $g) {
    $kind = $g['key'] === 'solo' ? 'single file' : 'aggregate';
    printf("  %d. [%s media=%s] %s\\n", $i + 1, $kind, $g['media'], implode(' + ', $g['members']));
  }
  printf("  -> %d CSS request(s)\\n\\n", count($groups));
}

report('Before: incident/map declares "preprocess: false"', group_assets($assets, $weights));

$fixed = $assets;
$fixed[3]['preprocess'] = TRUE;
report('After: preprocess flag removed', group_assets($fixed, $weights));

echo "Note: print media always splits off - browsers skip it on screen.\\n";`,
    output: `Before: incident/map declares "preprocess: false"
  1. [aggregate media=all] core/normalize + olivero/layout + incident/ticker
  2. [single file media=all] incident/map
  3. [aggregate media=all] incident/byline
  4. [aggregate media=print] newsroom/print-styles
  5. [aggregate media=all] newsroom/colours
  -> 5 CSS request(s)

After: preprocess flag removed
  1. [aggregate media=all] core/normalize + olivero/layout + incident/ticker + incident/map + incident/byline
  2. [aggregate media=print] newsroom/print-styles
  3. [aggregate media=all] newsroom/colours
  -> 3 CSS request(s)

Note: print media always splits off - browsers skip it on screen.
`,
  },

  keyPoints: [
    "Drupal aggregates assets at runtime from library metadata, not at build time; the toggles are system.performance:css.preprocess and js.preprocess, and since Drupal 10.1 the aggregate file is built by a separate route rather than during the HTML request.",
    "CSS is ordered by SMACSS bucket and grouped by adjacency + media, so one preprocess: false in the middle of a run splits one aggregate into three requests.",
    "A JS file declaring attributes: { defer: true } is automatically dropped out of every aggregate — AssetResolver forces preprocess to FALSE whenever attributes is non-empty — so the attribute is preserved at the cost of an extra request; budget for that before attributing lots of files.",
    "Always render through an image style; use a responsive image style for srcset, and set the LCP hero to loading=eager while everything below the fold stays lazy.",
    "Width and height on every image is the cheapest CLS fix there is — the responsive image formatter emits them since Drupal 10.1.",
    "LCP is usually an oversized or lazy hero (or slow TTFB), CLS is usually missing dimensions or late-injected markup, INP is usually heavy behaviours and third-party JS; confirm lab wins with field data.",
  ],

  interview: [
    {
      q: "A site scores badly on LCP. Walk me through how you would diagnose it on a Drupal site.",
      a: "I split LCP into server time and browser time. First I check TTFB with `curl -w` and the `X-Drupal-Cache` / `X-Drupal-Dynamic-Cache` headers — if anonymous requests are MISSing, the fix is caching, not images. If TTFB is fine, I open the Lighthouse LCP element: on a news site it is nearly always the hero image. Then I check three things: is it rendered through an image style or a raw upload, does the formatter emit `srcset` via a responsive image style, and is the Loading setting `lazy` when it should be `eager`. A lazy above-the-fold hero costs a real fraction of a second because the browser will not even queue it until layout runs. I finish by confirming the win in field data rather than trusting the lab score.",
    },
    {
      q: "What is the difference between Symfony's asset pipeline and Drupal's, and why does it matter for performance?",
      a: "Symfony bundles at build time with Encore or AssetMapper: the output is fixed, hashed and predictable before deploy. Drupal decides per request — it collects the libraries attached to that page, orders CSS by SMACSS bucket, and merges adjacent groupable files into aggregates, so a page only ships what it attached. The upside is no dead CSS on simple pages; the downside is that grouping is data-driven, so a single library declaring `preprocess: false` fragments the aggregate on every page that library appears on. Since Drupal 10.1 the aggregate itself is generated by a dedicated route rather than during the HTML request, which removed a big cold-cache penalty. Practically, in Symfony I audit the bundle; in Drupal I audit the number of CSS and JS requests on real pages.",
    },
    {
      q: "How would you get a CLS score under 0.1 on a content-heavy Drupal page?",
      a: "CLS is almost always reserved space. First, every image needs explicit `width` and `height` (or an aspect-ratio box) — core's image and responsive image formatters emit dimensions, and the responsive image formatter has done so since Drupal 10.1, so the usual culprit is a custom Twig template rendering `<img>` by hand. Second, anything injected after first paint shifts the page: BigPipe placeholders, lazy-built blocks, cookie banners and ad slots all need a reserved box in CSS. Third, webfonts — use `font-display: swap` with a metric-compatible fallback, or you trade CLS for FOIT. Then I verify with Lighthouse in mobile emulation, because CLS is far worse on narrow viewports.",
    },
    {
      q: "Your theme attaches core/jquery. Is that a problem?",
      a: "It is a cost you should be able to justify. jQuery is roughly 30KB gzipped plus parse and execute time on the main thread, and it is charged to every anonymous reader whether or not any behaviour uses it. Drupal core no longer loads it globally, so if the theme pulls it in it is usually one legacy snippet. I would grep the theme's JS for `jQuery`/`$(`, rewrite those behaviours against `core/once` plus plain DOM APIs, and drop the dependency. If something genuinely needs it, at least confine `core/jquery` to the library that uses it rather than the global theme library, so it only loads on the pages that attach it. The measurable effect shows up in INP and total blocking time, not in TTFB.",
    },
  ],

  quiz: [
    {
      question:
        "One component library in the middle of the CSS order declares `preprocess: false`. What happens to aggregation?",
      options: [
        "Only that file is excluded; the rest still form a single aggregate.",
        "Aggregation is disabled site-wide until the flag is removed.",
        "The run of adjacent files is split, producing an aggregate before it, a standalone file, and another aggregate after it.",
        "The file is aggregated anyway; preprocess only affects JavaScript.",
      ],
      answerIndex: 2,
      explain:
        "Grouping merges adjacent groupable items in the ordered collection. A non-groupable item in the middle breaks the run, so you get aggregate + single file + aggregate — three requests where you had one.",
    },
    {
      question:
        "Which Loading setting should the hero image of an article page use?",
      options: [
        "lazy — it is always the safest default",
        "eager — the LCP element must not wait for the lazy-loading heuristic",
        "It makes no difference once a responsive image style is configured",
        "auto — the browser decides correctly on its own",
      ],
      answerIndex: 1,
      explain:
        "loading=lazy defers the request until the browser knows the element is near the viewport, which delays the very image LCP measures. Above-the-fold images should be eager (and are good candidates for fetchpriority=high); everything below the fold stays lazy.",
    },
    {
      question:
        "You add `attributes: { defer: true }` to a JS file in libraries.yml on a Drupal 10 site with JS aggregation on. What is the risk?",
      options: [
        "The site will throw a configuration error on cache rebuild",
        "The attribute is applied but the file is excluded from every aggregate automatically",
        "JS aggregation is switched off for the whole page as soon as one file declares attributes",
        "Nothing at all — core collects every deferred script into a single defer aggregate",
      ],
      answerIndex: 1,
      explain:
        "AssetResolver::getJsAssets() does `$options['preprocess'] = $options['cache'] && empty($options['attributes']) ? $options['preprocess'] : FALSE;` — identical in 10.x and 11.x — so a file with attributes is force-excluded from aggregation and rendered as its own <script> (JsCollectionRenderer: attributes may only be set if the script is output independently). The attribute is never lost. The real risk is aggregate fragmentation: one extra HTTP request per attributed file. Bundling all defer scripts together is still an unreleased core proposal.",
    },
    {
      question:
        "Lighthouse says INP is 480ms. Which Drupal-side cause is most likely?",
      options: [
        "The page cache is missing, so TTFB is high",
        "Images are missing width and height attributes",
        "Heavy Drupal.behaviors, jQuery and third-party tags occupying the main thread",
        "Cache tags are invalidated too often",
      ],
      answerIndex: 2,
      explain:
        "INP measures how quickly the page responds to interaction, which is a main-thread problem: long-running behaviours, jQuery, and third-party scripts. TTFB drives LCP, missing dimensions drive CLS, and cache tag churn is a server-side concern.",
    },
  ],
};

export default lesson;
