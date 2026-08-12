import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "template-suggestions",
  title: "Template Discovery & Suggestions",
  part: "The Theme Layer",
  estMinutes: 13,
  summary:
    "Why node--article--teaser.html.twig beats node--article.html.twig beats node.html.twig: the theme hook builds a suggestion list in ascending specificity, the registry picks the LAST entry that exists, and themes get to append to that list without touching a line of module PHP.",

  concept: `
## Symfony names a path; Drupal proposes a ranked list

In a Symfony controller you decide the template yourself. If articles need a
different teaser you write the branch: \`return $this->render($mode === 'teaser'
? 'node/teaser.html.twig' : 'node/full.html.twig')\`. The decision lives in PHP,
owned by whoever wrote the controller.

Drupal deliberately takes that decision away from you. \`'#theme' => 'node'\`
names a *hook*, and before anything renders, \`ThemeManager::render()\` builds a
list of alternative hook names — **theme suggestions** — and asks the registry
which of them actually has a template. The winner is whatever the front-end
team put in their theme's \`templates/\` directory. No module code changes.

## Ascending specificity, last match wins

The core docblock on \`buildThemeHookSuggestions()\` is blunt about the ordering
contract: suggestions are returned "in the order of ascending specificity. The
caller will pick the last of those suggestions that has a known theme registry
entry." The selection loop really is one line:

\`\`\`php
foreach (array_reverse($suggestions) as $suggestion) {
  if ($theme_registry->has($suggestion)) {
    $info = $theme_registry->get($suggestion);
    break;
  }
}
\`\`\`

So specificity is a **convention about list position**, not about string length.
A suggestion appended late wins over a longer name added early. If nothing in
the list is registered, the base hook's template renders.

### Where the entries come from, in order

1. **\`hook_theme_suggestions_HOOK($variables)\`** — modules only, via
   \`moduleHandler->invokeAll()\`. Core's node module returns
   \`node__VIEWMODE\`, \`node__BUNDLE\`, \`node__BUNDLE__VIEWMODE\`, \`node__NID\`,
   \`node__NID__VIEWMODE\` — which is exactly why \`node--article--teaser\` outranks
   \`node--article\`.
2. **A direct suggestion** — \`'#theme' => 'incident_card__critical'\`. If that
   hook is registered with a \`base hook\`, the hook name itself is pushed onto
   the list; if it is not registered at all, \`ThemeManager\` strips \`__\` segments
   from the right until it finds a hook that is.
3. **\`hook_theme_suggestions_alter()\` and \`hook_theme_suggestions_HOOK_alter()\`**
   — modules first, then the active theme last. This is the theme's entry
   point: a theme *cannot* implement \`hook_theme_suggestions_HOOK()\`, only the
   \`_alter\`, and because it runs last, anything it appends is the most specific
   candidate on the list.

Two naming rules bite people: a new suggestion must start with the base hook
followed by \`__\`, and it must contain no hyphens. \`incident_card__critical\` is
valid; \`incident-card--critical\` and \`critical_card\` are not.

Be precise about *why* those fail, because it is a favourite interview follow-up.
The resolver does no validation at all — \`buildThemeHookSuggestions()\` returns
whatever the hooks put in the array, and \`render()\` just looks each entry up in
the theme registry. A name that does not derive from the base hook simply never
matches a registry key, because the template scan registers
\`incident-card--critical.html.twig\` under the hook name
\`incident_card__critical\` and nothing else. *Separately*, since Drupal 10.1 the
**Twig debug output** validates every suggestion against the base hook — it must
equal the base hook or start with \`base_hook__\`, and contain no hyphens — and
lists the failures under \`INVALID FILE NAME SUGGESTIONS\` with a link to
\`hook_theme_suggestions_alter()\`. That check trims the printed listing only, not
the suggestion array the resolver walks.

## Hook name to filename, and 'base hook'

Underscores become hyphens: \`node__article__teaser\` maps to
\`node--article--teaser.html.twig\`. Dropping that file into
\`incident_theme/templates/\` is usually all you need — the registry scan sees a
template whose name resolves to a known base hook and auto-registers it with
\`'base hook' => 'node'\`, so it inherits the base hook's variables and its whole
preprocess chain. You only write \`base hook\` by hand in \`hook_theme()\` when you
register a variant that has no discoverable template of its own.

## Debugging: turn on the comments

Set \`twig.config: debug: true\` in \`sites/development.services.yml\` and every
rendered chunk is wrapped in \`<!-- THEME DEBUG -->\` comments listing every
candidate, most specific first, with the winner marked. From Drupal 10.3 the
markers are \`✅\` (used) and \`▪️\` (available); Drupal 10.2 and earlier used
\`x\` and \`*\` and always printed a plain \`BEGIN OUTPUT\`. Copy the filename you
want, paste it into your theme, \`drush cr\`.
`,

  comparisons: [
    {
      label: "Who decides which template renders",
      intro:
        "Show an incident node in teaser mode. Symfony branches in PHP and names a file. Drupal names one hook and lets the registry resolve a ranked candidate list — the controller never learns which file won.",
      php: `<?php
// src/Controller/IncidentController.php (Symfony 7)
namespace App\\Controller;

final class IncidentController extends AbstractController
{
    public function show(Incident $incident, string $viewMode): Response
    {
        // The branch lives here, in PHP, owned by the controller.
        // Front-enders cannot change it without a PR against this file.
        $template = match (true) {
            $viewMode === 'teaser' && $incident->isCritical()
                => 'incident/teaser_critical.html.twig',
            $viewMode === 'teaser' => 'incident/teaser.html.twig',
            default                => 'incident/full.html.twig',
        };

        return $this->render($template, ['incident' => $incident]);
    }
}`,
      ts: `<?php
// The controller (or the entity view builder) says only this:
public function show(NodeInterface $incident): array {
  return $this->entityTypeManager
    ->getViewBuilder('node')
    ->view($incident, 'teaser');
  // Produces ['#theme' => 'node', '#node' => ..., '#view_mode' => 'teaser'].
}

// ThemeManager::render() then builds the candidate list and does:
//
//   foreach (array_reverse($suggestions) as $suggestion) {
//     if ($theme_registry->has($suggestion)) {
//       $info = $theme_registry->get($suggestion);
//       break;
//     }
//   }
//
// For an article in teaser mode the list is, ascending specificity:
//   node__teaser
//   node__article
//   node__article__teaser
//   node__12
//   node__12__teaser
//
// The LAST one with a registered template wins. Ship
// node--article--teaser.html.twig in incident_theme/templates/ and it
// takes over — no module code is touched, no cache-busting branch.`,
      note:
        "Specificity is list ORDER, not name length. array_reverse() means a suggestion appended late beats a longer name added early — which is precisely how the active theme, whose alter hook runs last, always gets the final say.",
    },
    {
      label: "A module adding a suggestion",
      intro:
        "The incident_tracker module wants a distinct template for critical incidents. Symfony has no analogue — you either branch in the controller or push the decision into Twig. Drupal has a dedicated hook that only modules may implement.",
      php: `{# templates/incident/card.html.twig (Symfony 7, Twig 3) #}
{# No suggestion system, so the branch moves INTO the template. #}
{% if incident.severity == 'critical' %}
  {% include 'incident/card_critical.html.twig' %}
{% else %}
  {% include 'incident/card_default.html.twig' %}
{% endif %}

{# Or, the "themeable" workaround: a service that maps state -> path,
   which every consumer must remember to call. #}
{{ include(incident_template_resolver.pathFor(incident)) }}`,
      ts: `<?php
// modules/custom/incident_tracker/src/Hook/IncidentThemeHooks.php
// (Drupal 11 attribute style; in Drupal 10 write the procedural
// function incident_tracker_theme_suggestions_incident_card() in
// incident_tracker.module — same signature, same behaviour.)

namespace Drupal\\incident_tracker\\Hook;

use Drupal\\Core\\Hook\\Attribute\\Hook;

class IncidentThemeHooks {

  /**
   * Implements hook_theme_suggestions_HOOK() for incident_card.
   */
  #[Hook('theme_suggestions_incident_card')]
  public function themeSuggestionsIncidentCard(array $variables): array {
    $suggestions = [];
    $incident = $variables['incident'];

    // Ascending specificity: least specific first.
    $suggestions[] = 'incident_card__' . $incident->bundle();
    if ($incident->get('field_severity')->value === 'critical') {
      $suggestions[] = 'incident_card__critical';
    }
    return $suggestions;
  }

}

// Now incident_card--critical.html.twig, dropped in EITHER the module's
// or the theme's templates/ dir, renders critical incidents.
// Nothing else changes.`,
      note:
        "hook_theme_suggestions_HOOK() is invoked with moduleHandler->invokeAll(), so a THEME cannot implement it — a *.theme file must use the _alter variant. Note the hook name uses the base hook: for '#theme' => 'node__article' Drupal still invokes hook_theme_suggestions_node().",
      leftLang: "twig",
      rightLang: "php",
    },
    {
      label: "The theme intervening without touching PHP",
      intro:
        "The design team wants sidebar menus and 'stale' incidents styled differently. In Symfony that means editing the controller or adding an override path in config. In Drupal the theme appends to the suggestion list and drops a file.",
      php: `# config/packages/twig.yaml (Symfony 7)
twig:
    paths:
        # A theme can only SHADOW an existing path. It cannot invent a
        # new conditional variant — the template name is still whatever
        # the controller passed.
        '%kernel.project_dir%/templates/overrides': ~

# To vary by state you must go back to the controller (or a Twig
# extension) and change the name it renders. There is no list, no
# ranking, and no hook a designer can implement.`,
      ts: `<?php
// themes/custom/incident_theme/incident_theme.theme

/**
 * Implements hook_theme_suggestions_HOOK_alter() for node.
 *
 * Runs AFTER every module's suggestions, so anything appended here is
 * the most specific candidate on the list.
 */
function incident_theme_theme_suggestions_node_alter(array &$suggestions, array &$variables): void {
  $node = $variables['elements']['#node'];
  if ($node->bundle() === 'incident' && $node->get('field_status')->value === 'stale') {
    // Must start with the base hook + '__' and contain no hyphens.
    $suggestions[] = 'node__incident__stale';
  }
}

/**
 * Implements hook_theme_suggestions_HOOK_alter() for menu.
 *
 * Exactly what Olivero does, so menus can vary per region.
 */
function incident_theme_theme_suggestions_menu_alter(array &$suggestions, array &$variables): void {
  if (isset($variables['attributes']['region'])) {
    $suggestions[] = 'menu__' . $variables['attributes']['region'];
  }
}

// Then, purely as files:
//   incident_theme/templates/node--incident--stale.html.twig
//   incident_theme/templates/menu--sidebar.html.twig
// Both auto-register with 'base hook' => node / menu, so they inherit
// the base hook's variables and its full preprocess chain.`,
      note:
        "The alter also lets you REORDER or REMOVE entries — unset($suggestions[$key]) is how you suppress a contrib module's variant. $variables is by reference in Drupal 10/11 but the hook runs before preprocess, so only raw #-properties are available, not the finished template variables.",
      leftLang: "yaml",
      rightLang: "php",
    },
    {
      label: "Seeing which template won",
      intro:
        "Both frameworks can tell you the template that rendered a block of markup. Symfony puts it in the profiler; Drupal writes it into the HTML source, along with every candidate you could have used instead.",
      php: `# config/packages/dev/web_profiler.yaml (Symfony 7)
web_profiler:
    toolbar: true
    intercept_redirects: false

# The Twig panel of the profiler lists rendered templates, render
# time, and lets you jump to the source. You see what DID render;
# there is no list of what COULD have.`,
      ts: `# sites/development.services.yml  (Drupal 10 & 11)
parameters:
  twig.config:
    debug: true
    auto_reload: true
    cache: false

# Enable it from settings.local.php:
#   $settings['container_yamls'][] =
#     DRUPAL_ROOT . '/sites/development.services.yml';
# then: drush cr
#
# Every rendered chunk is now wrapped in:
#
#   <!-- THEME DEBUG -->
#   <!-- THEME HOOK: 'node' -->
#   <!-- FILE NAME SUGGESTIONS:
#      ▪️ node--12--teaser.html.twig
#      ▪️ node--12.html.twig
#      ✅ node--article--teaser.html.twig
#      ▪️ node--article.html.twig
#      ▪️ node--teaser.html.twig
#      ▪️ node.html.twig
#   -->
#   <!-- 💡 BEGIN CUSTOM TEMPLATE OUTPUT from
#        'themes/custom/incident_theme/templates/node--article--teaser.html.twig' -->
#
# Most specific first (the list is array_reverse()d for display).`,
      note:
        "The markup above is the Drupal 10.3+ format: 10.3 is where twig.engine switched to a checkmark for the winner, a small square for the rest, and a lightbulb + 'CUSTOM TEMPLATE OUTPUT' for a template that lives in the active theme. Drupal 10.2 and earlier used 'x' for the winner and '*' for the rest, and always printed a plain 'BEGIN OUTPUT'. Badly-named suggestions have appeared under a separate INVALID FILE NAME SUGGESTIONS comment since 10.1. Never leave debug on in production — it disables the Twig cache path and breaks markup assertions in tests.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
  ],

  playground: {
    intro:
      "A miniature ThemeManager::render(): core's node suggestions, a theme alter appended last, then the winner picked with array_reverse(). Two nodes go through it. Predict which template wins for the critical incident before you run it — the answer is NOT the longest name.",
    lang: "php",
    code: `<?php
// A miniature ThemeManager::render(): build the suggestion list, then let
// the LAST registered suggestion win. No Drupal bootstrap.

// 1. The theme registry - every template that actually exists, from the
//    module's templates/ dir and from incident_theme/templates/.
$registry = array_fill_keys([
  'node',
  'node__teaser',
  'node__article',
  'node__article__teaser',
  'node__incident__critical',
], TRUE);

// 2. hook_theme_suggestions_node() in core's node module, in core's order:
//    view mode, bundle, bundle+view mode, id, id+view mode.
function node_theme_suggestions_node(array $variables): array {
  $node = $variables['elements']['#node'];
  $view_mode = str_replace('.', '_', $variables['elements']['#view_mode']);
  return [
    'node__' . $view_mode,
    'node__' . $node['bundle'],
    'node__' . $node['bundle'] . '__' . $view_mode,
    'node__' . $node['nid'],
    'node__' . $node['nid'] . '__' . $view_mode,
  ];
}

// 3. incident_theme.theme - hook_theme_suggestions_HOOK_alter() runs after
//    every module, so anything it appends is the most specific candidate.
function incident_theme_theme_suggestions_node_alter(array &$suggestions, array &$variables): void {
  $node = $variables['elements']['#node'];
  if (($node['severity'] ?? '') === 'critical') {
    $suggestions[] = 'node__' . $node['bundle'] . '__critical';
  }
}

// 4. ThemeManager::render(): foreach (array_reverse($suggestions) ...) -
//    the LAST suggestion with a registry entry wins.
function pick_template(array $registry, array $suggestions, string $base): string {
  $hook = $base;
  foreach (array_reverse($suggestions) as $suggestion) {
    if (isset($registry[$suggestion])) {
      $hook = $suggestion;
      break;
    }
  }
  // Underscores become hyphens in the filename.
  return strtr($hook, '_', '-') . '.html.twig';
}

// 5. What twig.engine prints when twig.config debug is TRUE: the list
//    reversed (most specific first), base hook last, winner marked.
//    \\u{2705} is the check mark, \\u{25AA}\\u{FE0F} the small square.
//    These emoji markers are the Drupal 10.3+ format; 10.2 and earlier
//    printed 'x' for the winner and '*' for the rest.
function theme_debug(string $base, array $suggestions, string $winner): string {
  $candidates = array_reverse($suggestions);
  $candidates[] = $base;
  $out = "<!-- THEME DEBUG -->\\n<!-- THEME HOOK: '" . $base . "' -->";
  $out .= "\\n<!-- FILE NAME SUGGESTIONS:";
  foreach ($candidates as $suggestion) {
    $file = strtr($suggestion, '_', '-') . '.html.twig';
    $out .= "\\n   " . ($file === $winner ? "\\u{2705}" : "\\u{25AA}\\u{FE0F}") . ' ' . $file;
  }
  $out .= "\\n-->";
  return $out . "\\n<!-- BEGIN OUTPUT from '" . $winner . "' -->";
}

$nodes = [
  ['bundle' => 'article', 'nid' => 12, 'view_mode' => 'teaser', 'severity' => 'low'],
  ['bundle' => 'incident', 'nid' => 42, 'view_mode' => 'full', 'severity' => 'critical'],
];

foreach ($nodes as $node) {
  $variables = ['elements' => ['#node' => $node, '#view_mode' => $node['view_mode']]];
  $suggestions = node_theme_suggestions_node($variables);
  incident_theme_theme_suggestions_node_alter($suggestions, $variables);
  echo theme_debug('node', $suggestions, pick_template($registry, $suggestions, 'node')), "\\n\\n";
}
`,
    output: `<!-- THEME DEBUG -->
<!-- THEME HOOK: 'node' -->
<!-- FILE NAME SUGGESTIONS:
   ▪️ node--12--teaser.html.twig
   ▪️ node--12.html.twig
   ✅ node--article--teaser.html.twig
   ▪️ node--article.html.twig
   ▪️ node--teaser.html.twig
   ▪️ node.html.twig
-->
<!-- BEGIN OUTPUT from 'node--article--teaser.html.twig' -->

<!-- THEME DEBUG -->
<!-- THEME HOOK: 'node' -->
<!-- FILE NAME SUGGESTIONS:
   ✅ node--incident--critical.html.twig
   ▪️ node--42--full.html.twig
   ▪️ node--42.html.twig
   ▪️ node--incident--full.html.twig
   ▪️ node--incident.html.twig
   ▪️ node--full.html.twig
   ▪️ node.html.twig
-->
<!-- BEGIN OUTPUT from 'node--incident--critical.html.twig' -->

`,
  },

  keyPoints: [
    "'#theme' => 'node' names a hook, not a file. ThemeManager::render() builds a suggestion list in ASCENDING specificity, then does foreach (array_reverse($suggestions)) and takes the LAST entry that has a registry entry — so list position decides, not name length.",
    "Suggestions come from hook_theme_suggestions_HOOK() (modules only — invoked via moduleHandler->invokeAll()), from a direct '#theme' => 'hook__variant' call, and from hook_theme_suggestions_alter()/hook_theme_suggestions_HOOK_alter(), where modules run first and the active theme runs LAST. That ordering is why a theme always gets the final word.",
    "A theme cannot implement hook_theme_suggestions_HOOK(); THEME.theme uses the _alter variant, which can also reorder or unset() suggestions added by contrib.",
    "Naming rules: the hook name uses double underscores and the filename uses double hyphens (node__article__teaser -> node--article--teaser.html.twig); a new suggestion must start with the base hook plus '__' and contain no hyphens, or it can never match a registry key and so can never win. The resolver does not police this; since Drupal 10.1 the Twig debug output does, listing offenders under INVALID FILE NAME SUGGESTIONS.",
    "A suggestion template discovered during the registry scan is auto-registered with 'base hook', so it inherits the base hook's variables and full preprocess chain. Declare 'base hook' by hand in hook_theme() only for a variant with no discoverable template.",
    "twig.config debug: true in sites/development.services.yml prints THEME HOOK plus every FILE NAME SUGGESTION into the HTML source — Drupal 10.3+ marks the winner with a check mark and theme-owned templates with a lightbulb; 10.2 and earlier used 'x' and '*' and always printed a plain 'BEGIN OUTPUT'. Copy a name, paste the file into your theme, drush cr.",
  ],

  interview: [
    {
      q: "Explain how Drupal decides that node--article--teaser.html.twig should render instead of node.html.twig.",
      a: "The render array only says `'#theme' => 'node'`. Before rendering, `ThemeManager::render()` calls `hook_theme_suggestions_node()` on every module; core's node module returns `node__teaser`, `node__article`, `node__article__teaser`, `node__12`, `node__12__teaser` — deliberately in ascending order of specificity. Modules and then the active theme get to alter that list via `hook_theme_suggestions_node_alter()`. Drupal then loops `array_reverse($suggestions)` and stops at the first entry the theme registry knows about, so the **last** registered suggestion wins; the base hook's template is the fallback if none match. Since the registry is built by scanning template files, dropping `node--article--teaser.html.twig` into my theme's `templates/` directory and running `drush cr` is the whole implementation — no module PHP changes, which is the point of the design.",
    },
    {
      q: "You need a different template for incidents flagged critical. Where do you put the logic, and why does it matter whether it lives in the module or the theme?",
      a: "If the variant is part of what my module means — a critical incident is a first-class concept in `incident_tracker` — I implement `hook_theme_suggestions_incident_card()` in the module (a `#[Hook('theme_suggestions_incident_card')]` method in `src/Hook/` on Drupal 11, or the procedural function in `.module` on 10) and append `incident_card__critical`. That publishes a documented extension point: any theme can now supply `incident-card--critical.html.twig` without depending on my internals. If the variant is purely presentational — this client wants stale incidents greyed out — it belongs in `incident_theme.theme` as `hook_theme_suggestions_HOOK_alter()`, because a theme cannot implement the non-alter hook at all (it is invoked with `moduleHandler->invokeAll()`). The practical difference is portability: module suggestions ship with the feature, theme suggestions ship with the design and disappear when the theme is swapped.",
    },
    {
      q: "A colleague adds `$suggestions[] = 'incident-card--critical';` in a theme alter and the template is ignored. What is wrong?",
      a: "Suggestions are theme **hook names**, not filenames, so they use underscores: `incident_card__critical`. The hyphens only appear when the hook name is converted to a filename, `strtr($suggestion, '_', '-') . '.html.twig'`. Worth being precise about the mechanism: the resolver validates nothing, it just calls `$theme_registry->has($suggestion)` on each entry, and a hyphenated name can never match a registry key — the scan registered that template as `incident_card__critical`. What *does* validate is the Twig debug output: since Drupal 10.1 twig.engine checks each suggestion against the base hook (it must equal the base hook or start with `base_hook__`, and contain no hyphens) and prints the failures under a separate `<!-- INVALID FILE NAME SUGGESTIONS -->` comment linking to `hook_theme_suggestions_alter()` — so the colleague's mistake is visible in view-source. The other two classics in the same area are forgetting `drush cr` after adding the template (the registry is a cached filesystem scan) and appending a suggestion whose prefix is not the base hook, like `critical_card`: nothing strips it from the array, it just has no discoverable template behind it, so it silently loses.",
    },
    {
      q: "What does the 'base hook' key do, and when do you have to write it yourself?",
      a: "`base hook` marks a registry entry as a *variant* of another hook. Per the `hook_theme()` docs, the base hook is invoked with this implementation as its first suggestion, its files are included, and its preprocess functions run in addition to the suggestion's own — so `incident_card__critical` still gets everything `template_preprocess_incident_card()` and `THEME_preprocess_incident_card()` set up. Most of the time I never type it: when the registry is built, the scan of `templates/` directories finds `incident-card--critical.html.twig`, resolves it back to the `incident_card` base hook, and adds the `base hook` key automatically. I write it by hand in `hook_theme()` only when I register a variant that the scan cannot discover — for instance a suggestion whose template lives under a non-default `path`, or one I want to expose before any template file exists. Without it the variant would be an unrelated hook with no inherited preprocessing, and the template would receive almost no variables.",
    },
  ],

  quiz: [
    {
      question:
        "The suggestion list for a node is ['node__full', 'node__incident', 'node__incident__full', 'node__42', 'node__42__full'] and the theme's alter appends 'node__incident__critical'. Templates exist for node, node--incident--full, node--42--full and node--incident--critical. Which one renders?",
      options: [
        "node--42--full.html.twig — an ID is more specific than a bundle",
        "node--incident--critical.html.twig — it is last in the list, and the loop is array_reverse()",
        "node--incident--full.html.twig — it matches both bundle and view mode",
        "node.html.twig — ambiguous suggestion lists fall back to the base hook",
      ],
      answerIndex: 1,
      explain:
        "ThemeManager::render() iterates array_reverse($suggestions) and breaks on the first registered entry, so the LAST suggestion that has a template wins. Specificity in Drupal is a convention about position in the list, not about name length or which properties a name mentions — and because the active theme's alter runs after every module, whatever it appends is always the top candidate.",
    },
    {
      question:
        "You want incident_theme to vary the menu template per region. Which implementation belongs in incident_theme.theme?",
      options: [
        "incident_theme_theme_suggestions_menu() returning ['menu__sidebar']",
        "incident_theme_theme_suggestions_menu_alter(&$suggestions, &$variables) appending 'menu__' . $variables['attributes']['region']",
        "incident_theme_theme_registry_alter() rewriting the 'template' key of the menu hook",
        "incident_theme_theme() re-registering the menu hook with a new template",
      ],
      answerIndex: 1,
      explain:
        "hook_theme_suggestions_HOOK() is dispatched with moduleHandler->invokeAll(), so only modules can implement it — a theme's copy is never called. Themes use the _alter variant, which ThemeManager runs after all modules, and this is exactly what Olivero does for region-specific menus. hook_theme_registry_alter() is the wrong tool: it would change the template for every menu, not add a conditional candidate.",
    },
    {
      question:
        "Twig debug is on and the source shows a suggestion listed under '<!-- INVALID FILE NAME SUGGESTIONS -->'. What is the most likely cause?",
      options: [
        "The template file has not been created yet",
        "The suggestion does not start with the base hook followed by '__', or it contains a hyphen",
        "The cache has not been rebuilt since the suggestion was added",
        "The suggestion was added by a theme rather than a module",
      ],
      answerIndex: 1,
      explain:
        "That comment comes from twig.engine's debug output, which since Drupal 10.1 validates each suggestion against the base hook: it must be the base hook itself or start with the base hook plus '__', and it must contain no hyphens (hyphens only appear once the hook name is converted to a filename). Names like 'incident-card--critical' or 'critical_card' are removed from the printed FILE NAME SUGGESTIONS listing — not from the suggestion array the resolver walks — and reported under INVALID FILE NAME SUGGESTIONS with a link to hook_theme_suggestions_alter(). A missing template file is legal — that candidate simply loses to the next one down.",
    },
    {
      question:
        "In Symfony you write $this->render('incident/teaser.html.twig', ...). What is the closest structural equivalent in Drupal, and what does Drupal add?",
      options: [
        "$this->twig->render() — Drupal adds nothing beyond auto-escaping",
        "A render array with '#theme' => 'node' — Drupal adds a ranked suggestion list resolved against the theme registry, so the template is chosen at render time by whatever theme is active",
        "hook_theme_registry_alter() — Drupal adds a per-request template map",
        "'#type' => 'inline_template' — Drupal adds late binding via the Twig loader",
      ],
      answerIndex: 1,
      explain:
        "Symfony binds a template path early, in PHP the controller owns. Drupal defers the choice: the render array names a hook, suggestion hooks build a ranked candidate list, and the registry — which reflects the active theme's templates/ directory — resolves it at render time. That late binding is what lets a front-end team retheme output without a patch to the module.",
    },
  ],
};

export default lesson;
