import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "themes-vs-modules-output",
  title: "Who Owns Output: Module Defaults vs Theme Overrides",
  part: "The Theme Layer",
  estMinutes: 12,
  summary:
    "The layering contract that keeps a Drupal site maintainable: incident_tracker ships default markup that assumes no theme, incident_theme reshapes presentation without touching logic, and the registry guarantees the theme's preprocess runs last.",

  concept: `
## Symfony has one owner; Drupal has two

In a Symfony app you write the controller, the view model and
\`templates/incident/card.html.twig\`. One team, one repo, one decision. If the
markup is wrong you edit the template. There is no discipline to enforce
because there is nobody else in the building.

A Drupal site is *assembled*: core plus a dozen contrib modules plus your
\`incident_tracker\` plus \`incident_theme\`, each on its own release cycle, none
of them able to edit the others. So Drupal splits output ownership in two, and
the split only works if both sides keep their half of the bargain.

## The contract

**A module ships defaults and assumes no theme.** \`incident_tracker\` registers
\`incident_card\` in \`hook_theme()\`, ships
\`templates/incident-card.html.twig\`, and implements
\`template_preprocess_incident_card()\` to compute the variables Twig needs. Its
markup must be *complete and plain* — usable in Olivero, in Claro, in a theme
that does not exist yet. Its CSS is limited to what the component needs to
**function** (layout that stops it collapsing, the CSS a JS behaviour depends
on), and it attaches only the libraries needed to work, never to look right.

**A theme overrides presentation and touches no logic.** \`incident_theme\`
copies that template into its own \`templates/\` directory, adds
\`incident_theme_preprocess_incident_card()\` for classes and formatted strings,
and ships the CSS and JS that make it *this site's* card. What it must not do
is compute business meaning: an SLA breach is a fact about the incident, not
about the skin, so it belongs in the module.

### Why the theme always wins

The registry builds a preprocess chain per hook by walking prefixes in a fixed
order — \`template\`, then every module in module-list order, then base themes
outermost-first, then the active theme — appending \`PREFIX_preprocess\` (for
hooks with a template) and then \`PREFIX_preprocess_HOOK\` for each. The active
theme is last in that list, so \`THEME_preprocess_HOOK()\` sees every value every
module set and overwrites whatever it likes. That is a guarantee, not a race:
you never need to out-weight a module.

Themes also get the last word on the alter hooks the theme layer takes part in
— \`form_alter\`, \`theme_registry_alter\`, \`theme_suggestions_HOOK_alter\`,
\`element_info_alter\`, \`library_info_alter\`, \`js_alter\`/\`css_alter\`,
\`page_attachments_alter\`. For those the invoking code runs
\`ModuleHandler::alter()\` for the modules and then \`ThemeManager::alter()\`,
which appends the base themes' implementations and finally the active theme's
\`THEME_form_alter()\`, \`THEME_theme_suggestions_HOOK_alter()\` and friends.
It is not automatic for every alter in core: \`ModuleHandler::alter()\` only
invokes modules, so a theme gets a say exactly where the caller invokes
\`ThemeManager::alter()\` too (\`FormBuilder::prepareForm()\` calls both, in that
order).

## Escape hatches (and why they are last resorts)

\`\`\`php
function incident_theme_theme_registry_alter(array &$registry): void {
  // Evict a contrib preprocess that hardcodes markup.
  $chain = &$registry['incident_card']['preprocess functions'];
  $chain = array_values(array_diff($chain, ['legacy_ui_preprocess_incident_card']));
}

function incident_theme_element_info_alter(array &$info): void {
  // Every '#type' => 'details' on the site gets our JS.
  $info['details']['#attached']['library'][] = 'incident_theme/details';
}
\`\`\`

Both are global, both invalidate cached registries, and both are invisible from
the template — the next developer sees a preprocess that mysteriously does not
run. Reach for a template suggestion, a preprocess, or \`libraries-override\`
first. And remember the registry is cached: nothing here takes effect until
\`drush cr\`.

### Smells that mean the layers have leaked

- Business logic in \`THEME_preprocess_HOOK()\` — entity queries, permission
  checks, price maths. Move it to the module, or a service the module calls.
- Hardcoded \`<div class="card">\` strings in a controller or \`#markup\`. The
  theme cannot override a string.
- A theme altering data (rewriting field values, unsetting entities) rather
  than variables.
- A module's CSS that only looks right in one theme — that CSS belongs in the
  theme.
`,

  comparisons: [
    {
      label: "Who decides the markup",
      intro:
        "Same goal: render an incident card. Symfony's controller names the template it wants. Drupal's controller names a theme hook and lets the theme layer resolve the file.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// src/Controller/IncidentController.php
final class IncidentController extends AbstractController
{
    #[Route('/incidents/{id}', name: 'incident_show')]
    public function show(Incident $incident): Response
    {
        // This controller has decided the final template. Nobody
        // downstream can change it without editing this line.
        return $this->render('incident/card.html.twig', [
            'incident' => $incident,
            'breached' => $incident->minutesOpen() > 60,
        ]);
    }
}`,
      ts: `<?php
// incident_tracker/src/Controller/IncidentController.php
use Drupal\\node\\NodeInterface;

public function card(NodeInterface $incident): array {
  // No template name, no markup. Just "render me an incident_card"
  // plus the data. incident_theme decides what that looks like.
  return [
    '#theme' => 'incident_card',
    '#incident' => $incident,
    // Business fact -> module. The theme must not compute this.
    '#breached' => (\\Drupal::time()->getRequestTime() - $incident->getCreatedTime()) > 3600,
    '#attached' => ['library' => ['incident_tracker/card-behaviour']],
    '#cache' => ['tags' => $incident->getCacheTags()],
  ];
}`,
      note: "The module's job ends at 'here is the data and the hook name'. Every string of HTML you put in a controller or '#markup' is a decision you have taken away from the theme.",
    },
    {
      label: "Shaping the variables",
      intro:
        "A designer wants the severity badge relabelled and a modifier class added. In Symfony you edit the view model or the template. In Drupal the theme appends a preprocess — the module's own preprocess still ran, and still won't be touched by your next module update.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// One app, one place. Edit the controller, the view model,
// or add a Twig extension — all of them are "yours".
final class IncidentCardViewModel
{
    public function __construct(
        public readonly string $badgeText,
        public readonly string $badgeClass,
    ) {}

    public static function from(Incident $i): self
    {
        // severity is one of 'low' | 'high' | 'critical'.
        $severity = $i->severity();

        return new self(
            ['critical' => 'SEV-1', 'high' => 'SEV-2', 'low' => 'SEV-3'][$severity] ?? 'SEV-?',
            in_array($severity, ['high', 'critical'], TRUE) ? 'badge badge--high' : 'badge',
        );
    }
}`,
      ts: `<?php
// incident_tracker.module — the DEFAULT. Theme-agnostic.
function template_preprocess_incident_card(array &$variables): void {
  /** @var \\Drupal\\node\\NodeInterface $incident */
  $incident = $variables['incident'];
  // 'low' | 'high' | 'critical' — a list_string field, always a string.
  $variables['severity'] = $incident->get('field_severity')->value;
  $variables['badge_text'] = ['critical' => 'SEV-1', 'high' => 'SEV-2', 'low' => 'SEV-3'][$variables['severity']] ?? 'SEV-?';
  $variables['badge_class'] = 'badge';
  // Derived here from the node, never passed in as '#minutes_open'.
  $variables['minutes_open'] = intdiv(\\Drupal::time()->getRequestTime() - $incident->getCreatedTime(), 60);
  $variables['attributes']['class'][] = 'incident-card';
}

// incident_theme.theme — runs LAST in the chain, so it wins.
function incident_theme_preprocess_incident_card(array &$variables): void {
  $variables['badge_text'] = t('Priority @level', ['@level' => $variables['badge_text']]);
  $variables['badge_class'] = $variables['breached']
    ? 'it-badge it-badge--late'
    : 'it-badge';
  // Presentation only. Note it READS 'breached'; it does not compute it.
}`,
      note: "Drupal 11.1 introduced OOP hooks generally and 11.2 extended them to preprocess, so modules may write these as #[Hook('preprocess_incident_card')] methods in src/Hook/; Drupal 11.3 extends OOP hooks to themes too (core's Olivero ships src/Hook/OliveroPagePreprocessHooks.php). In a theme the #[Hook] attribute takes no order or module parameter and ReorderHook/RemoveHook are not supported — base theme hooks simply run before the active theme's. Drupal 10 is procedural functions in .module and THEME.theme either way.",
    },
    {
      label: "Who attaches which assets",
      intro:
        "The card has a collapse toggle (it breaks without JS) and a house style (it just looks different). Symfony has one asset pipeline for both. Drupal splits them by owner — and gives the theme veto power over the module's CSS.",
      leftLang: "twig",
      rightLang: "yaml",
      php: `{# templates/incident/card.html.twig — Symfony 6.4/7 #}
{# One pipeline, one owner. Behaviour and skin are the same build. #}

{# Webpack Encore: #}
{{ encore_entry_link_tags('incident-card') }}
{{ encore_entry_script_tags('incident-card') }}

{# or AssetMapper (no build step): #}
{{ importmap('incident-card') }}

<article class="incident-card">…</article>

{# To restyle, you edit assets/styles/incident-card.scss.
   There is no "someone else's CSS" to override. #}`,
      ts: `# incident_tracker.libraries.yml — needed to FUNCTION.
card-behaviour:
  version: 1.x
  js:
    js/incident-card.js: {}
  css:
    component:
      css/incident-card.css: {}   # collapse states only, no colours
  dependencies:
    - core/drupal
    - core/once

# incident_theme.libraries.yml — needed to LOOK right.
card-skin:
  version: 1.x
  css:
    theme:
      css/incident-card.css: {}

# incident_theme.info.yml — the theme's veto + extension.
libraries-extend:
  incident_tracker/card-behaviour:
    - incident_theme/card-skin
libraries-override:
  incident_tracker/card-behaviour:
    css:
      component:
        css/incident-card.css: css/incident-card-replacement.css`,
      note: "libraries-extend piggybacks the skin onto the module's library so it loads exactly when the component does; libraries-override replaces (or with 'false', removes) a file the theme cannot edit. Neither requires touching incident_tracker.",
    },
    {
      label: "When the layering fails you",
      intro:
        "A contrib module hardcodes a wrapper you cannot live with. Symfony: open the file. Drupal: you may not, so you reach for a global alter — carefully.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony's answer to "a bundle's template is wrong":
// drop a file at templates/bundles/AcmeIncidentBundle/card.html.twig
// and it silently overrides the bundle's own.
//
// Or decorate the service that built the data:
#[AsDecorator('acme.incident_presenter')]
final class IncidentPresenterDecorator implements PresenterInterface
{
    public function __construct(
        #[AutowireDecorated] private PresenterInterface $inner,
    ) {}

    public function present(Incident $i): array
    {
        $data = $this->inner->present($i);
        $data['wrapper_class'] = 'it-card';
        return $data;
    }
}`,
      ts: `<?php
// incident_theme.theme — LAST RESORT #1: rewrite the registry.
function incident_theme_theme_registry_alter(array &$registry): void {
  if (isset($registry['incident_card']['preprocess functions'])) {
    $registry['incident_card']['preprocess functions'] = array_values(array_diff(
      $registry['incident_card']['preprocess functions'],
      ['legacy_ui_preprocess_incident_card'],
    ));
  }
  // Also legal here: repoint 'path'/'template', add 'base hook'.
}

// LAST RESORT #2: change a #type's defaults site-wide.
function incident_theme_element_info_alter(array &$info): void {
  if (isset($info['details'])) {
    $info['details']['#attached']['library'][] = 'incident_theme/details';
  }
}

// Both are cached. Nothing happens until: drush cr`,
      note: "Prefer, in order: a template suggestion, THEME_preprocess_HOOK(), libraries-override, THEME_form_alter(). Registry and element_info alters are global, silent and easy to forget — they are the tools you use when nothing else can reach.",
    },
  ],

  playground: {
    intro:
      "A miniature theme registry: build the preprocess chain for 'incident_card' from prefixes, let the theme evict a contrib implementation via hook_theme_registry_alter(), then run the chain and watch badge_class get overwritten until the active theme has the last word. Predict the final values before you run it.",
    lang: "php",
    code: `<?php
// How Drupal builds the preprocess chain for ONE theme hook — and why the
// active theme always gets the last word. Pure PHP, no Drupal.

// Stand-in for \\Drupal::time()->getRequestTime().
$request_time = 1700000000;

// Every preprocess implementation that exists on this imaginary site.
$implementations = [
  // Core, for every hook that has a template.
  'template_preprocess' => function (array &$vars): void {
    $vars['attributes']['class'][] = 'incident-card';
  },
  // The module that REGISTERED the hook ships the defaults.
  'template_preprocess_incident_card' => function (array &$vars) use ($request_time): void {
    // severity is a list_string value: 'low' | 'high' | 'critical'.
    $vars['badge_text'] = ['critical' => 'SEV-1', 'high' => 'SEV-2', 'low' => 'SEV-3'][$vars['severity']] ?? 'SEV-?';
    $vars['badge_class'] = 'badge';
    // Computed HERE from the node, not passed in as '#minutes_open'.
    $vars['minutes_open'] = intdiv($request_time - $vars['incident']['created'], 60);
  },
  // A contrib module hardcodes presentation. This is the smell.
  'legacy_ui_preprocess_incident_card' => function (array &$vars): void {
    $vars['badge_text'] = '<b>!!! ' . $vars['badge_text'] . '</b>';
  },
  // Another module adds DATA the theme could not compute. Legitimate.
  'sla_alerts_preprocess_incident_card' => function (array &$vars): void {
    $vars['breached'] = $vars['minutes_open'] > 60;
  },
  // Base theme: generic skin.
  'olivero_preprocess_incident_card' => function (array &$vars): void {
    $vars['badge_class'] = 'badge badge--olivero';
  },
  // Active theme, all hooks.
  'incident_theme_preprocess' => function (array &$vars): void {
    $vars['attributes']['class'][] = 'it-scope';
  },
  // Active theme, this hook. Runs LAST, so it wins.
  'incident_theme_preprocess_incident_card' => function (array &$vars): void {
    $vars['badge_class'] = 'it-badge it-badge--' . ($vars['breached'] ? 'late' : 'ok');
  },
];

// Registry::postProcessExtension() walks prefixes in this order and, for each,
// appends PREFIX_preprocess (templates only) then PREFIX_preprocess_HOOK.
$prefixes = ['template', 'incident_tracker', 'legacy_ui', 'sla_alerts', 'olivero', 'incident_theme'];
$hook = 'incident_card';
$has_template = TRUE;

$chain = [];
foreach ($prefixes as $prefix) {
  if ($has_template && isset($implementations[$prefix . '_preprocess'])) {
    $chain[] = $prefix . '_preprocess';
  }
  if (isset($implementations[$prefix . '_preprocess_' . $hook])) {
    $chain[] = $prefix . '_preprocess_' . $hook;
  }
}

echo "Registry chain as built:\\n";
foreach ($chain as $i => $fn) {
  echo '  ' . ($i + 1) . '. ' . $fn . "\\n";
}

// hook_theme_registry_alter(): the escape hatch. incident_theme evicts the
// contrib function that hardcodes markup instead of fighting it downstream.
$chain = array_values(array_filter(
  $chain,
  fn (string $fn): bool => $fn !== 'legacy_ui_preprocess_incident_card'
));

echo "\\nAfter incident_theme_theme_registry_alter():\\n";
foreach ($chain as $i => $fn) {
  echo '  ' . ($i + 1) . '. ' . $fn . "\\n";
}

// Now run it. Watch badge_class get overwritten three times. Only the
// variables incident_card declares in hook_theme() come in from the caller.
$variables = [
  'incident' => ['label' => 'Checkout latency', 'created' => $request_time - 5700],
  'severity' => 'high',
  'breached' => FALSE,
  'attributes' => [],
];

echo "\\nRunning the chain:\\n";
foreach ($chain as $fn) {
  $before = $variables['badge_class'] ?? '(unset)';
  $implementations[$fn]($variables);
  $after = $variables['badge_class'] ?? '(unset)';
  if ($before !== $after) {
    echo '  ' . $fn . ': badge_class ' . $before . ' -> ' . $after . "\\n";
  }
}

echo "\\nWhat Twig receives:\\n";
echo '  badge_text  = ' . $variables['badge_text'] . "\\n";
echo '  badge_class = ' . $variables['badge_class'] . "\\n";
echo '  minutes_open = ' . $variables['minutes_open'] . "\\n";
echo '  breached    = ' . var_export($variables['breached'], TRUE) . "\\n";
echo '  classes     = ' . implode(' ', $variables['attributes']['class']) . "\\n";
`,
    output: `Registry chain as built:
  1. template_preprocess
  2. template_preprocess_incident_card
  3. legacy_ui_preprocess_incident_card
  4. sla_alerts_preprocess_incident_card
  5. olivero_preprocess_incident_card
  6. incident_theme_preprocess
  7. incident_theme_preprocess_incident_card

After incident_theme_theme_registry_alter():
  1. template_preprocess
  2. template_preprocess_incident_card
  3. sla_alerts_preprocess_incident_card
  4. olivero_preprocess_incident_card
  5. incident_theme_preprocess
  6. incident_theme_preprocess_incident_card

Running the chain:
  template_preprocess_incident_card: badge_class (unset) -> badge
  olivero_preprocess_incident_card: badge_class badge -> badge badge--olivero
  incident_theme_preprocess_incident_card: badge_class badge badge--olivero -> it-badge it-badge--late

What Twig receives:
  badge_text  = SEV-2
  badge_class = it-badge it-badge--late
  minutes_open = 95
  breached    = true
  classes     = incident-card it-scope
`,
  },

  keyPoints: [
    "A module ships complete, theme-agnostic default output (hook_theme + template + template_preprocess_HOOK) and must never assume which theme is active; a theme reshapes that output and must never compute business facts.",
    "The registry appends preprocess functions prefix by prefix — template, modules, base themes, active theme — so THEME_preprocess_HOOK() always runs last and always wins. The same holds for THEME_*_alter() on the alter hooks the theme layer takes part in (form_alter, theme_registry_alter, theme_suggestions_*_alter, element_info_alter, library_info_alter…): the caller runs ModuleHandler::alter() for the modules and then ThemeManager::alter()/alterForTheme(), which appends the base themes and finally the active theme.",
    "Modules attach the libraries a component needs to FUNCTION (behaviour JS, structural CSS); themes attach the libraries it needs to LOOK right, and use libraries-extend / libraries-override in THEME.info.yml to add to or replace a module's assets without touching it.",
    "hook_theme_registry_alter() (rewrite the chain, repoint a template) and hook_element_info_alter() (change a #type's defaults site-wide) are the escape hatches: global, cached, invisible from the template, and a last resort after suggestions, preprocess and libraries-override.",
    "The classic leaks are business logic in a theme's preprocess, hardcoded HTML in a controller or '#markup', a theme rewriting data instead of variables, and module CSS that only looks right in one theme.",
    "Symfony needs none of this discipline because one team owns controller, view model and template; Drupal's split exists because most of the code producing your page is code you cannot edit — and clearing caches (drush cr) is what makes registry changes real.",
  ],

  interview: [
    {
      q: "How do you decide whether a piece of code belongs in incident_tracker or in incident_theme?",
      a: "I ask whether the output would still be correct if the site swapped themes tomorrow. Anything that is a **fact about the data** — an SLA breach, an access check, a computed total, the set of items to show — goes in the module, because a different theme would need the same fact. Anything that is a **decision about presentation** — class names, label wording, wrapper markup, colour and spacing CSS — goes in the theme, because a different theme would want a different answer. The module ships a working default template so it is usable with no theme at all; the theme overrides that template and appends `THEME_preprocess_HOOK()` on top. In practice the tell is: if I find myself calling `\\Drupal::entityTypeManager()` or checking a permission inside a `.theme` file, the logic is in the wrong layer.",
    },
    {
      q: "A contrib module's preprocess sets a class you need to remove. Walk me through your options in order.",
      a: "First I try the cheapest, most local thing: `THEME_preprocess_HOOK()` in `incident_theme.theme`. It runs after every module implementation because the registry appends the active theme's prefix last, so I can simply reassign or `array_diff()` the class there. If the problem is the markup rather than a variable, I override the template — copy it into `incident_theme/templates/` or add a template suggestion via `hook_theme_suggestions_HOOK_alter()` so only the affected case changes. If it is CSS I cannot beat, `libraries-override` in `THEME.info.yml` replaces or disables the offending file. Only if none of those can reach it do I use `hook_theme_registry_alter()` to strip the contrib function from the `preprocess functions` array — it works, but it is global, cached, and invisible to the next developer reading the template, so I leave a comment explaining why. And I remember to `drush cr`, because the registry is cached.",
    },
    {
      q: "Where should a library be attached — in the module's render array or in the theme's info.yml?",
      a: "Split it by *why* the asset exists. If the component is broken without it — a Drupal behaviour that wires up a collapse toggle, the CSS that gives that toggle its hidden state — the module attaches it, via `#attached['library']` on the render array so it only loads on pages that actually render the component. If the asset is about how the site looks, the theme owns it. The theme has two good ways to attach it: a global `libraries:` entry in `THEME.info.yml` for site-wide CSS, or `libraries-extend:` to piggyback its skin onto the module's library so the skin loads exactly when the component does and never otherwise. Attaching from the theme in `THEME_preprocess_HOOK()` also works and is fine for conditional cases. What I avoid is a module shipping opinionated visual CSS, because every theme then starts life fighting it.",
    },
    {
      q: "Drupal 10 vs 11 — has any of this changed?",
      a: "The layering rules are identical; the syntax has moved. Drupal 11.1 introduced OOP hooks and 11.2 extended them to preprocess, so a module can implement `#[Hook('preprocess_incident_card')]` as a method on a class in `src/Hook/` instead of a procedural function in the `.module` file. 11.3 extends OOP hooks to themes — core's Olivero ships `src/Hook/OliveroPagePreprocessHooks.php` — though in a theme the attribute takes no `order` or `module` parameter and `ReorderHook`/`RemoveHook` are not supported, so base theme hooks simply run before the active theme's. Procedural implementations still work everywhere in 10 and 11, so a `.theme` file full of `THEME_preprocess_HOOK()` functions is not legacy code. The other change worth naming is single-directory components, stable since 10.3: an SDC bundles its own Twig, CSS, JS and `*.component.yml` schema in one folder, which pushes a module even further toward shipping a self-contained default that a theme replaces wholesale rather than patching variable by variable.",
    },
  ],

  quiz: [
    {
      question:
        "incident_tracker sets $variables['badge_class'] = 'badge' in template_preprocess_incident_card(). incident_theme sets it to 'it-badge' in incident_theme_preprocess_incident_card(). What does Twig receive, and why?",
      options: [
        "'badge' — the module registered the hook, so its preprocess is authoritative",
        "'it-badge' — the registry appends the active theme's prefix last, so the theme's preprocess runs after every module's",
        "'badge it-badge' — preprocess functions merge string variables",
        "Whichever ran first; you need to set a weight in hook_theme() to be sure",
      ],
      answerIndex: 1,
      explain:
        "The chain is built by walking prefixes in a fixed order — 'template', modules in module-list order, base themes, then the active theme — appending PREFIX_preprocess and PREFIX_preprocess_HOOK for each. The active theme is last, so its assignment simply overwrites. There is no merging and no weight system to fight; that determinism is the whole point of the split.",
    },
    {
      question:
        "Which of these belongs in incident_theme rather than incident_tracker?",
      options: [
        "Deciding that an incident open for more than 60 minutes counts as an SLA breach",
        "The JavaScript behaviour that makes the card's detail panel expand and collapse",
        "The CSS that gives the breached badge the site's red and the card its shadow",
        "The cache tags declared on the render array so the card invalidates when the incident is edited",
      ],
      answerIndex: 2,
      explain:
        "Colour and shadow are presentation — a different theme would want different answers, so they belong in incident_theme (attached via libraries-extend or the theme's own library). The breach rule is a fact about the data, the collapse behaviour is required for the component to work, and cache metadata is correctness: all three live in the module.",
    },
    {
      question:
        "You add incident_theme_theme_registry_alter() to strip a contrib preprocess function, save the file, reload the page — and nothing changes. What is the most likely cause?",
      options: [
        "Themes are not allowed to implement alter hooks; only modules are",
        "The theme registry is cached, so the change needs drush cr (or a cache rebuild)",
        "The hook must be named incident_theme_registry_alter without the extra 'theme'",
        "You must also declare the altered hook in hook_theme() first",
      ],
      answerIndex: 1,
      explain:
        "The registry is an expensive discovery result and is cached per theme; alter hooks against it only run on rebuild. Themes absolutely can implement alter hooks — for the alters the theme layer takes part in, the caller invokes ThemeManager::alter()/alterForTheme() after ModuleHandler::alter(), and that is what runs the base themes' and then the active theme's THEME_*_alter() — and the function name is THEME + _theme_registry_alter, i.e. incident_theme_theme_registry_alter(). The doubled word looks like a typo and is not.",
    },
    {
      question:
        "A module ships css/incident-card.css with layout rules you need, plus brand colours you do not. What is the cleanest fix from the theme?",
      options: [
        "Patch the module and commit the patch to composer.json",
        "Write higher-specificity overrides in the theme's CSS and hope they win",
        "libraries-override in incident_theme.info.yml, repointing that file to the theme's own replacement copy",
        "hook_element_info_alter() to strip the library from the element",
      ],
      answerIndex: 2,
      explain:
        "libraries-override lets a theme replace a specific file inside another extension's library (or set it to false to drop it) without touching that extension or losing the rest of the library. Specificity wars are fragile and grow forever, patching creates an upgrade burden, and element_info_alter is a blunt global instrument aimed at #type defaults, not at one CSS file.",
    },
  ],
};

export default lesson;
