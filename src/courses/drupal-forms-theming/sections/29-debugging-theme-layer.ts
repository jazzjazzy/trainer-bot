import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "debugging-theme-layer",
  title: "Debugging the Theme Layer",
  part: "Quality & Debugging",
  estMinutes: 12,
  summary:
    "The toolkit that turns theme-layer guesswork into a two-minute checklist: Twig debug comments, the null cache backend, Devel's dumpers in Twig, and the drush commands that interrogate the theme registry.",

  concept: `
Symfony hands you one integrated answer: the Web Profiler. Open the toolbar, click
the Twig panel, see every template that rendered, in what order, with what
variables. Drupal has nothing that good — what it has instead is a set of separate
switches that, once thrown, tell you almost as much. Knowing them is the difference
between two minutes and an afternoon.

## Throw the switches

Twig debug is off by default and lives in the service container, not in config, so
you need a dev-only container file that a dev-only settings file includes.

\`\`\`yaml
# sites/development.services.yml
parameters:
  http.response.debug_cacheability_headers: true
  twig.config:
    debug: true          # THEME DEBUG comments + dump() in templates
    auto_reload: true    # recompile when the .twig file changes
    cache: false         # skip the compiled-template cache entirely
services:
  cache.backend.null:
    class: Drupal\\Core\\Cache\\NullBackendFactory
\`\`\`

\`\`\`php
// sites/default/settings.local.php  (included from the bottom of settings.php)
$settings['container_yamls'][] = DRUPAL_ROOT . '/sites/development.services.yml';
$settings['cache']['bins']['render'] = 'cache.backend.null';
$settings['cache']['bins']['page'] = 'cache.backend.null';
$settings['cache']['bins']['dynamic_page_cache'] = 'cache.backend.null';
$config['system.performance']['css']['preprocess'] = FALSE;
$config['system.performance']['js']['preprocess'] = FALSE;
\`\`\`

Both are needed. \`auto_reload\` recompiles the template; the **render cache** still
holds the HTML that template produced last time, so without the null backend your
edit is invisible until a rebuild. Drupal 10.1+ adds a UI shortcut at
**/admin/config/development/settings** ("Development settings") that toggles Twig
development mode and rendered-output caching in the \`development_settings\`
key/value collection (it was State before 10.3) — handy, but the YAML is what
you commit to the repo, and only the YAML gives you the cacheability headers.

## Read the comment block

With debug on, every Twig template is wrapped in comments:

\`\`\`html
<!-- THEME HOOK: 'node' -->
<!-- FILE NAME SUGGESTIONS:
   ▪️ node--12--full.html.twig
   ✅ node--incident--full.html.twig
   ▪️ node.html.twig
-->
<!-- 💡 BEGIN CUSTOM TEMPLATE OUTPUT from 'themes/custom/incident_theme/templates/content/node--incident--full.html.twig' -->
\`\`\`

Three separate facts. **THEME HOOK** is the registry key — that is what you pass to
\`hook_theme_suggestions_HOOK_alter()\` and what your preprocess function must be
named after. **SUGGESTIONS** are listed most specific first; \`✅\` marks the file
actually used, and \`▪️\` marks the other names that would have been accepted. If the
name you invented is not in that list, no amount of cache clearing will help.
(The \`x\` / \`*\` markers and the plain \`BEGIN OUTPUT\` line are the pre-10.3 format —
if that is what you see, you are on Drupal ≤10.2.) The **BEGIN … OUTPUT** line gives
you the real path, which instantly settles "am I editing the file that is running?"
— and when the winning file lives inside the active theme, Drupal 10.3+ labels it
\`💡 BEGIN CUSTOM TEMPLATE OUTPUT\`. No comments at all means no Twig template
ran — you are looking at \`#markup\`, a \`#type\` element rendered by a function, or
markup produced above the theme layer.

## Dump at the right layer

\`{{ dump(variable) }}\` is core, but only when \`twig.config.debug\` is true. Devel
(5.x for D10/11) adds the Twig **functions** \`{{ devel_dump(x) }}\`, \`{{ dpm(x) }}\`
and \`{{ devel_breakpoint() }}\` — it registers no Twig *filters*, so
\`{{ x|devel_dump }}\` is an "Unknown filter" error. Kint is not part of Devel:
4.x only shipped a dumper plugin plus a suggested \`kint-php/kint\` package, and
Devel 5.4.0 removed the Kint integration outright (5.x ships VarDumper only). For
\`{{ kint(x) }}\` on D10/11 install the standalone Kint module,
\`composer require --dev drupal/kint\` — it registers \`kint()\` itself, and if Devel
is also installed it adds a Kint dumper you select at
**/admin/config/development/devel**. Dump inside preprocess
too — the shape there is a render array, and the keys that matter are \`#theme\`,
\`#type\`, \`#attached\`, \`#cache\` and the child keys, not the rendered strings.

## Then ask the registry

\`drush cr\` after any \`hook_theme()\`, \`.info.yml\` or new-template change — the
registry is cached. \`drush ev\` reads it back so you can confirm what Drupal thinks
your hook looks like.
`,

  comparisons: [
    {
      label: "Turning the diagnostics on",
      intro:
        "Symfony's dev environment is debug-by-default and self-configuring. Drupal's is opt-in, and the switch lives in the service container — which is why it needs its own YAML file.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/dev/twig.yaml — Symfony 6.4/7
twig:
    # Undefined variable = exception instead of silent empty string.
    strict_variables: true

# config/packages/dev/web_profiler.yaml
web_profiler:
    toolbar: true
    intercept_redirects: false
framework:
    profiler:
        only_exceptions: false

# That is it. In APP_ENV=dev Twig auto-reloads compiled templates,
# and the profiler's Twig panel lists every template that rendered,
# its parent, its render time and the variables it received.`,
      ts: `# sites/development.services.yml — Drupal 10/11
parameters:
  # Adds X-Drupal-Cache-Tags / -Contexts / -Max-Age response headers.
  http.response.debug_cacheability_headers: true
  twig.config:
    debug: true          # THEME DEBUG comments + dump() in templates
    auto_reload: true    # recompile whenever the .twig source changes
    cache: false         # do not even write compiled templates
services:
  # Referenced from settings.local.php to disable cache bins.
  cache.backend.null:
    class: Drupal\\Core\\Cache\\NullBackendFactory

# NOT loaded automatically. settings.local.php must do:
#   $settings['container_yamls'][] =
#     DRUPAL_ROOT . '/sites/development.services.yml';
# ...and settings.php must include settings.local.php (the snippet is
# at the bottom of default.settings.php, commented out).
# Any change here needs a container rebuild: drush cr`,
      note: "Never ship this to production: debug comments bloat every response, cache: false recompiles templates on every request, and the cacheability headers leak your cache tags. Keep it in settings.local.php, and keep settings.local.php out of git.",
    },
    {
      label: "Interrogating the render/theme layer from the CLI",
      intro:
        "Both stacks let you ask the container what it knows. Symfony has purpose-built debug commands; Drupal has a generic PHP evaluator plus a handful of listing commands.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: dedicated introspection commands.
php bin/console debug:twig                 # all functions/filters/paths
php bin/console debug:twig --filter=render
php bin/console debug:container twig       # the Twig service itself
php bin/console debug:config twig          # resolved twig config
php bin/console cache:clear                # rebuild the dev container

# And after a request, the profiler keeps the whole tree:
php bin/console debug:router | grep incident`,
      ts: `# Drupal: rebuild first, then read the registry back.
drush cr                                   # cache:rebuild - after ANY
                                           # hook_theme/.info.yml/new template

# Which themes exist, and which one is actually serving pages?
drush pm:list --type=theme --status=enabled
drush config:get system.theme              # default: + admin:

# What does the theme registry think 'incident_summary' looks like?
drush ev "print_r(\\Drupal::service('theme.registry')->get()['incident_summary']);"

# Every registered theme hook (grep it):
drush ev "print_r(array_keys(\\Drupal::service('theme.registry')->get()));" | grep incident

# Which theme is active in this (CLI) context?
drush ev "print(\\Drupal::theme()->getActiveTheme()->getName());"

# Render an array from the CLI, exactly as the page would:
drush ev "\\$b = ['#type' => 'html_tag', '#tag' => 'p', '#value' => 'hi']; print(\\Drupal::service('renderer')->renderInIsolation(\\$b));"`,
      note: "renderInIsolation() is the Drupal 10.3+ name for renderPlain(); renderRoot() is the one that keeps the bubbled metadata. All of them take $elements BY REFERENCE, so you must pass a real variable — inlining the array (or an assignment expression) is a PHP 8 fatal: 'could not be passed by reference'. drush cr is not optional after registry changes — a missing template is far more often a stale registry than a wrong file name.",
    },
    {
      label: "Finding out which template produced this markup",
      intro:
        "You are staring at a stray <div> in the page source. Symfony answers with a profiler panel; Drupal answers in the HTML itself.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# Symfony: the template tree is in the profiler, not the output. #}
{# Toolbar -> Twig panel: node/_incident.html.twig (2.1 ms)          #}
{#   -> incident/_row.html.twig  (x12)                              #}

{# If you want it inline you add it yourself: #}
{% if app.environment == 'dev' %}
  <!-- rendered by {{ _self }} -->
{% endif %}

{# Symfony has one answer per template: the path you wrote in
   render('...'). There is no suggestion list, because there is no
   registry deciding between candidates. #}`,
      ts: `{# Drupal 10.3+/11, with twig.config.debug: true — appears in view-source #}
<!-- THEME DEBUG -->
<!-- THEME HOOK: 'node' -->
<!-- FILE NAME SUGGESTIONS:
   ▪️ node--12--full.html.twig
   ▪️ node--12.html.twig
   ✅ node--incident--full.html.twig
   ▪️ node--incident.html.twig
   ▪️ node--full.html.twig
   ▪️ node.html.twig
-->
<!-- 💡 BEGIN CUSTOM TEMPLATE OUTPUT from 'themes/custom/incident_theme/templates/content/node--incident--full.html.twig' -->
  ...markup...
<!-- 💡 END CUSTOM TEMPLATE OUTPUT from 'themes/custom/incident_theme/templates/content/node--incident--full.html.twig' -->

{# Reading it:
   THEME HOOK  -> the registry key; name preprocess/suggestion hooks after it
   ✅          -> the suggestion that won (most specific existing file)
   ▪️          -> a name you MAY create; anything not listed will be ignored
   💡 CUSTOM   -> the winning file lives in the ACTIVE THEME, not core/a module
   BEGIN ...   -> the file on disk, so you know you are editing the right one
   On Drupal <=10.2 the same block uses 'x' / '*' and a plain BEGIN OUTPUT. #}`,
      note: "No THEME DEBUG comment around your markup means no Twig template rendered it — it came from #markup, a theme function, or a preprocessed string. Chasing a template that never ran is the classic time sink.",
    },
    {
      label: "Dumping a variable mid-render",
      intro:
        "Same instinct, different plumbing: Symfony's dump() goes to the profiler's dump panel, Drupal's goes into the page (or the message area) and needs the right tool for the size of the thing you are dumping.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# Symfony: VarDumper is wired into dev by default. #}
{{ dump(incident) }}          {# -> profiler dump panel, collapsible #}
{{ dump() }}                  {# -> every variable in scope         #}

{# In PHP, anywhere: #}
{# dump($incident); dd($incident); #}

{# Objects render as objects: lazy proxies are unwrapped, private
   properties are shown, and the toolbar links each dump back to the
   file and line that produced it. #}`,
      ts: `{# Drupal core — only works when twig.config.debug is TRUE #}
{{ dump(incident) }}
{{ dump(_context|keys) }}   {# names of every available variable   #}

{# Devel 5.x (D10/11): composer require --dev drupal/devel #}
{{ devel_dump(content.field_severity) }}
{{ devel_dump() }}                 {# no args = the whole context  #}
{{ dpm(node) }}                    {# into the status messages     #}
{{ devel_breakpoint() }}           {# xdebug stops HERE, in scope  #}
{# All FUNCTIONS. Devel registers no Twig filters: {{ x|devel_dump }}
   throws Unknown "devel_dump" filter. #}

{# Kint is not part of Devel (5.4.0 removed the integration).
   For the collapsible tree, add the standalone module:
   composer require --dev drupal/kint
   It registers kint() on its own; with Devel installed it also
   adds a dumper you pick at /admin/config/development/devel #}
{{ kint(elements) }}

{# In a preprocess function (incident_theme.theme): #}
{# function incident_theme_preprocess_node(array &$variables) {     #}
{#   \\Drupal::messenger()->addWarning(print_r(array_keys($variables), TRUE));  #}
{#   // or, with Devel installed: dpm(array_keys($variables));      #}
{# }                                                                #}`,
      note: "Never dump a full entity or the whole content array with core dump() — it will recurse through the entity's storage handlers and hang the request. Dump array_keys() first, then one branch at a time; Kint (the standalone drupal/kint module — Devel dropped Kint support in 5.4.0) is the tool that makes a big tree survivable.",
    },
  ],

  playground: {
    intro:
      "Two things you do by hand on every theming bug, in plain PHP. First, build the FILE NAME SUGGESTIONS block: given the suggestions the theme system produced (least specific first) and the templates that actually exist, print the list the way Drupal 10.3+/11 does — most specific first, with ✅ on the winner and ▪️ on the rest. Then run the 'my template isn't updating' checklist over six scenarios. Predict which line each scenario stops on before you reveal.",
    lang: "php",
    code: `<?php
// Two debugging tools, simulated with no Drupal in sight:
// (1) the comment block Twig debug prints, and
// (2) the "my template isn't updating" checklist.

// --- 1. What the theme system handed the renderer, LEAST specific first.
$hook = 'node';
$suggestions = [
  'node',
  'node__full',
  'node__incident',
  'node__incident__full',
  'node__12',
  'node__12__full',
];

// What the theme registry actually found on disk.
$registry = [
  'node__incident__full' => 'themes/custom/incident_theme/templates/content/node--incident--full.html.twig',
  'node__incident' => 'themes/custom/incident_theme/templates/content/node--incident.html.twig',
  'node' => 'core/themes/olivero/templates/content/node.html.twig',
];

// Drupal 10.3+/11 prints the list MOST specific first, marks the winner with
// '✅' and every other accepted name with '▪️'. (Drupal <= 10.2 used 'x' / '*'.)
$active_theme_path = 'themes/custom/incident_theme';
$display = array_reverse($suggestions);
$winner = NULL;
foreach ($display as $suggestion) {
  if (isset($registry[$suggestion])) {
    $winner = $suggestion;
    break;
  }
}

echo "<!-- THEME DEBUG -->\\n";
echo "<!-- THEME HOOK: '" . $hook . "' -->\\n";
echo "<!-- FILE NAME SUGGESTIONS:\\n";
foreach ($display as $suggestion) {
  $file = str_replace('__', '--', $suggestion) . '.html.twig';
  echo '   ' . ($suggestion === $winner ? '✅' : '▪️') . ' ' . $file . "\\n";
}
echo "-->\\n";
// A winner inside the ACTIVE THEME gets the "CUSTOM TEMPLATE" wording.
$custom = str_starts_with($registry[$winner], $active_theme_path);
$label = $custom ? '💡 BEGIN CUSTOM TEMPLATE OUTPUT' : 'BEGIN OUTPUT';
echo "<!-- " . $label . " from '" . $registry[$winner] . "' -->\\n";
echo "\\n";

// --- 2. The checklist, in the order that costs you the least time.
function diagnose(array $env): string {
  if ($env['file_theme'] !== $env['active_theme']) {
    return 'WRONG THEME: file is in ' . $env['file_theme'] . ', but ' . $env['active_theme'] . ' renders this page';
  }
  if (!$env['suggestion_matched']) {
    return 'WRONG NAME: no suggestion matches that file - copy a name out of the THEME DEBUG block';
  }
  if (!$env['twig_auto_reload']) {
    return 'STALE COMPILED TWIG: set twig.config.auto_reload true, then drush cr';
  }
  if ($env['render_cache'] !== 'null') {
    return 'STALE RENDER CACHE: point the render bin at cache.backend.null, then drush cr';
  }
  if ($env['css_js_aggregation']) {
    return 'STALE ASSETS: the markup is fine - turn off CSS/JS aggregation';
  }
  return 'OUTPUT IS CURRENT: the bug is inside the template';
}

$base = [
  'active_theme' => 'incident_theme',
  'file_theme' => 'incident_theme',
  'suggestion_matched' => TRUE,
  'twig_auto_reload' => TRUE,
  'render_cache' => 'null',
  'css_js_aggregation' => FALSE,
];

$scenarios = [
  'Edited the template, page unchanged' => ['twig_auto_reload' => FALSE],
  'Admin pages ignore the override' => ['active_theme' => 'claro'],
  'Invented node--incident-report.html.twig' => ['suggestion_matched' => FALSE],
  'Changes appear only after drush cr' => ['render_cache' => 'database'],
  'New markup shows, new styles do not' => ['css_js_aggregation' => TRUE],
  'Everything wired correctly' => [],
];

foreach ($scenarios as $name => $override) {
  echo $name . "\\n";
  echo '  -> ' . diagnose($override + $base) . "\\n";
}
`,
    output: `<!-- THEME DEBUG -->
<!-- THEME HOOK: 'node' -->
<!-- FILE NAME SUGGESTIONS:
   ▪️ node--12--full.html.twig
   ▪️ node--12.html.twig
   ✅ node--incident--full.html.twig
   ▪️ node--incident.html.twig
   ▪️ node--full.html.twig
   ▪️ node.html.twig
-->
<!-- 💡 BEGIN CUSTOM TEMPLATE OUTPUT from 'themes/custom/incident_theme/templates/content/node--incident--full.html.twig' -->

Edited the template, page unchanged
  -> STALE COMPILED TWIG: set twig.config.auto_reload true, then drush cr
Admin pages ignore the override
  -> WRONG THEME: file is in incident_theme, but claro renders this page
Invented node--incident-report.html.twig
  -> WRONG NAME: no suggestion matches that file - copy a name out of the THEME DEBUG block
Changes appear only after drush cr
  -> STALE RENDER CACHE: point the render bin at cache.backend.null, then drush cr
New markup shows, new styles do not
  -> STALE ASSETS: the markup is fine - turn off CSS/JS aggregation
Everything wired correctly
  -> OUTPUT IS CURRENT: the bug is inside the template
`,
  },

  keyPoints: [
    "Twig debug lives in the container, not in config: put twig.config debug/auto_reload/cache in sites/development.services.yml, and load it from settings.local.php via $settings['container_yamls'][].",
    "auto_reload alone is not enough — the render, page and dynamic_page_cache bins must point at cache.backend.null, or you keep serving HTML the old template produced.",
    "Read the THEME DEBUG block as three facts: THEME HOOK (the registry key you hook into), the suggestion list (✅ = the file actually used, ▪️ = the other names that would have been accepted), and the BEGIN line (the file actually on disk — labelled 💡 BEGIN CUSTOM TEMPLATE OUTPUT when the winner lives in the active theme). The x / * markers and the plain BEGIN OUTPUT line are the pre-10.3 format.",
    "No THEME DEBUG comment means no Twig template rendered that markup — stop looking for a template and go find the #markup or theme function.",
    "Devel 5.x gives you devel_dump/dpm/devel_breakpoint in Twig (functions only — there is no devel_dump filter); Kint is no longer part of Devel at all since 5.4.0, so install the standalone drupal/kint module for {{ kint() }}. Never core-dump a whole entity — dump array_keys() first.",
    "Registry changes (hook_theme, new template file, .info.yml, libraries.yml) need drush cr; drush ev + theme.registry tells you what Drupal actually registered.",
  ],

  interview: [
    {
      q: "Walk me through how you debug 'I changed the Twig template and nothing happened'.",
      a: `I work a fixed order, cheapest checks first. **Which theme is rendering?** Admin routes use the admin theme (Claro), so an override in \`incident_theme\` will not apply on /admin — \`drush config:get system.theme\` settles it. **Is the file name a real suggestion?** I view-source and read the FILE NAME SUGGESTIONS block; if my name is not on that list, no cache clear will ever pick it up, and I need a \`hook_theme_suggestions_HOOK_alter()\` instead. **Is the compiled Twig stale?** \`twig.config.auto_reload: true\` plus \`drush cr\`. **Is the render cache stale?** The template recompiled but the render/dynamic page cache still holds last request's HTML, so the render bin has to be \`cache.backend.null\` locally. Only if all four pass do I accept that the template itself is wrong. If the markup changed but the styling did not, it is asset aggregation, not theming.`,
    },
    {
      q: "You have Symfony's Web Profiler muscle memory. What is the closest equivalent in Drupal, and where does it fall short?",
      a: `There is no single equivalent — you assemble it. Twig debug comments give you the profiler's Twig panel: which template rendered, from which file, and what the alternatives were. \`http.response.debug_cacheability_headers: true\` gives you the cache picture as \`X-Drupal-Cache-Tags\`, \`X-Drupal-Cache-Contexts\` and \`X-Drupal-Dynamic-Cache\` headers. Devel gives you VarDumper-style inspection in Twig and in preprocess (add the standalone \`drupal/kint\` module if you want Kint's collapsible tree — Devel dropped Kint in 5.4.0). Webprofiler — a separate contrib project since Devel 5.0 (\`composer require --dev drupal/webprofiler\`; the 10.x branch on D10, 11.x on D11) — is a port of Symfony's own toolbar and gets you closest to the real thing, but it is not enabled on most projects. What you genuinely lose is the correlation: nothing ties a dumped variable back to the template and line that produced it, so you narrow down by dumping at each layer — controller/block build, preprocess, then template.`,
    },
    {
      q: "Why do you need both auto_reload and the null cache backend? Is one not enough?",
      a: `They cache different things. \`twig.config.auto_reload\` (and \`cache: false\`) controls the **compiled PHP class** Twig generates from your \`.twig\` source — without it, Twig keeps running yesterday's compiled template. The render cache stores the **HTML that template already produced**, keyed by cache keys and contexts, and it does not know or care that the source file changed. So with only auto_reload you edit the file, Twig happily recompiles, and the renderer never calls it because it has a cache hit. In \`settings.local.php\` I null out \`render\`, \`page\` and \`dynamic_page_cache\`. On production both are the opposite: Twig compiled and cached, render cache on, and a deploy runs \`drush cr\`.`,
    },
    {
      q: "How do you inspect a render array in practice, and which keys do you actually look at?",
      a: `In a preprocess function or block build I dump keys, not values: \`dpm(array_keys($variables))\` or Kint on one branch, because a full entity dumped with core's \`dump()\` will recurse into storage handlers and hang the request. The keys that matter are \`#theme\` or \`#type\` (which template/element will render this), \`#attached\` (libraries and drupalSettings), \`#cache\` (keys/contexts/tags/max-age — this is what makes stale output stale), \`#weight\` on children (ordering), and \`#access\`/\`#printed\` when something silently disappears. Anything without a leading \`#\` is a child element, rendered in weight order. The rendered strings are almost never where the bug is — the bug is a missing \`#theme\`, a wrong \`#type\`, or an \`#access\` that resolved to FALSE.`,
    },
  ],

  quiz: [
    {
      question:
        "You enabled twig.config.debug and auto_reload in sites/development.services.yml, ran drush cr, and your edits to node--incident.html.twig still do not show. The THEME DEBUG block shows ✅ on node--incident.html.twig. What is the most likely cause?",
      options: [
        "The theme registry is stale and needs a second drush cr",
        "The render cache is still serving the HTML produced by the previous version of the template",
        "The suggestion is wrong and you need hook_theme_suggestions_HOOK_alter()",
        "twig.config.cache must also be set to false or auto_reload is ignored",
      ],
      answerIndex: 1,
      explain:
        "The ✅ proves the right file is selected, and auto_reload proves Twig will recompile it — so the output you are seeing never went through the template on this request. That is the render (or dynamic page) cache. Point the render, page and dynamic_page_cache bins at cache.backend.null in settings.local.php.",
    },
    {
      question:
        "Your custom block's markup appears in the page, but there is no THEME DEBUG comment anywhere around it. What does that tell you?",
      options: [
        "Twig debug is only applied to node and page templates",
        "The template exists but has a syntax error, so Drupal fell back to core's",
        "No Twig template rendered that markup — it came from #markup, a #type element rendered by a function, or a string built before the theme layer",
        "The block is cached, so the comments were stripped from the cached copy",
      ],
      answerIndex: 2,
      explain:
        "The debug comments are emitted by the theme system when it renders a Twig template. No comments means no template was involved — you are looking at #markup, #plain_text, or output produced by a render element with no template. Chasing a nonexistent template here is the classic time sink; add a #theme hook instead.",
    },
    {
      question:
        "Which command tells you what Drupal actually registered for a theme hook, after you added hook_theme() to incident_tracker.module?",
      options: [
        "drush ev \"print_r(\\Drupal::service('theme.registry')->get()['incident_summary']);\"",
        "drush theme:list --hook=incident_summary",
        "drush config:get incident_tracker.theme",
        "drush php:eval \"print_r(twig_get_registry());\"",
      ],
      answerIndex: 0,
      explain:
        "The theme registry is a service (theme.registry) whose get() returns the merged array of every theme hook — template name, variables, preprocess functions and the module/theme that provided them. Run drush cr first, because the registry is cached; there is no theme:list command in Drush (use pm:list --type=theme).",
    },
    {
      question:
        "In Drupal 10/11 with Devel 5.x installed, {{ kint(node) }} in a Twig template throws 'Unknown function kint'. Why?",
      options: [
        "kint() was renamed to devel_kint() in Devel 5",
        "Kint no longer ships with Devel (removed in 5.4.0); it lives in the standalone Kint module",
        "kint() only works inside preprocess functions, not templates",
        "twig.config.debug must be false for Devel's Twig extension to register",
      ],
      answerIndex: 1,
      explain:
        "Devel 5.4.0 removed Kint support completely — the 5.x branch ships only the VarDumper dumper, and its Twig extension registers just devel_dump(), devel_message(), dpm(), dsm() and devel_breakpoint(). Kint now lives in the standalone Kint project: composer require --dev drupal/kint, which registers kint() (and kpr()) in Twig and, when Devel is present, adds a Kint dumper you select at /admin/config/development/devel. (The old devel_kint_extras add-on was declared obsolete in October 2025 — do not reach for it.)",
    },
  ],
};

export default lesson;
