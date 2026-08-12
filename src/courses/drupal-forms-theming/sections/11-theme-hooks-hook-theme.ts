import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "theme-hooks-hook-theme",
  title: "Theme Hooks: hook_theme & Your Own Templates",
  part: "Render Arrays & the Render Pipeline",
  estMinutes: 12,
  summary:
    "Register incident_card with hook_theme() so '#theme' => 'incident_card' resolves to templates/incident-card.html.twig — and understand the 'variables' vs 'render element' fork, the optional registry keys, and why the whole thing is cached.",

  concept: `
## Symfony names a file; Drupal names a hook

In Symfony, \`$this->render('incident/card.html.twig', [...])\` is a filesystem
lookup. There is no registry, no declaration, no cache to clear. Drupal refuses
to work that way, and the reason is the whole point of this part of the course:
in Drupal, **the code that produces output is not allowed to decide what the
final template is**. A render array says \`'#theme' => 'incident_card'\` and then
walks away; the active theme, other modules, and suggestion hooks get to argue
about which Twig file actually runs. That argument needs a lookup table, and
that table is the **theme registry**.

## hook_theme() writes one row of the registry

Put this in \`incident_tracker.module\` (or a \`#[Hook('theme')]\` method on
Drupal 11.1+):

\`\`\`php
function incident_tracker_theme($existing, $type, $theme, $path): array {
  return [
    'incident_card' => [
      'variables' => [
        'incident' => NULL,
        'severity' => NULL,
        'breached' => FALSE,
      ],
    ],
  ];
}
\`\`\`

You now have a theme hook named \`incident_card\`. Any render array with
\`'#theme' => 'incident_card'\` will be rendered by
\`templates/incident-card.html.twig\` inside your module — **underscores in the
hook name become hyphens in the filename**, and the \`templates\` subdirectory is
the default location. The declared keys are also the contract: the template
receives exactly \`incident\`, \`severity\` and \`breached\`, defaulted to \`NULL\`,
\`NULL\` and \`FALSE\` when the caller omits \`#incident\` / \`#severity\` /
\`#breached\`. A \`#\` property you did *not* declare never reaches Twig.

### The fork: 'variables' vs 'render element'

Every theme hook uses one or the other — never both.

- **\`variables\`** — for data. You list value names; the renderer copies
  \`#incident\` into \`incident\` and hands the template a flat set of variables.
  Use it for cards, summaries, badges, anything you build from scalars and
  entities.
- **\`render element\`** — for *structure*. You give one name (conventionally
  \`element\`, or \`form\` for forms) and the **entire render array**, children
  and \`#\` properties intact, arrives under that single variable. Use it when
  the template's job is to arrange already-buildable children:
  \`'incident_filter_form' => ['render element' => 'form']\`, then
  \`{{ form.severity }}\` and \`{{ form|without('severity') }}\` in Twig. Every
  form element type in core (\`#type\` plugins, \`form\`, \`container\`,
  \`details\`) is registered this way.

### The optional keys

- \`template\` — override the derived filename (no \`.html.twig\` extension).
- \`path\` — where the template lives, if not \`MODULE/templates\`.
- \`base hook\` — declares this hook as a *variant* of another, so it inherits
  the base hook's preprocessing. Needed when you register a suggestion like
  \`incident_card__critical\` explicitly.
- \`preprocess functions\` — replace the auto-built chain
  (\`template_preprocess\`, \`template_preprocess_HOOK\`, \`MODULE_preprocess_HOOK\`,
  \`THEME_preprocess_HOOK\`) with your own ordered list.
- \`file\` — an include holding those preprocess functions.

Note what is *gone*: theme **functions** were deprecated in 9.3 and removed in
Drupal 10, so the old \`'function' => 'theme_foo'\` key no longer exists — Twig
only. And since Drupal 10.3 (experimental from 10.1), a single-directory
component (SDC) is the modern alternative for self-contained UI: its
\`*.component.yml\` *is* the registration, so no \`hook_theme()\` entry is
required at all.

### It is cached, so rebuild

The registry is assembled once per theme by scanning every module and theme,
then cached. Add a hook, rename a template, add a preprocess function —
nothing happens until \`drush cr\`. For surgery on rows you do not own (reorder
someone else's preprocess, repoint a core template), implement
\`hook_theme_registry_alter(&$registry)\` in \`incident_theme.theme\`; it runs
during the rebuild, so it too is only picked up after a cache rebuild.
`,

  comparisons: [
    {
      label: "Rendering a card: filesystem lookup vs registered hook",
      intro:
        "The same output — an incident card — from a controller. Symfony names the template file directly; Drupal names a hook that must first exist in the theme registry.",
      php: `<?php
// src/Controller/IncidentController.php (Symfony 7)
namespace App\\Controller;

final class IncidentController extends AbstractController
{
    public function card(Incident $incident): Response
    {
        // No registration anywhere. Name the file, it renders.
        // Any variable you pass is available in the template.
        return $this->render('incident/card.html.twig', [
            'incident'    => $incident,
            'severity'    => $incident->getSeverity(),
            'internal_id' => $incident->getId(),
        ]);
    }
}`,
      ts: `<?php
// incident_tracker.module

/**
 * Implements hook_theme().
 */
function incident_tracker_theme($existing, $type, $theme, $path): array {
  return [
    // Creates the theme hook 'incident_card'. Default template:
    // modules/custom/incident_tracker/templates/incident-card.html.twig
    'incident_card' => [
      'variables' => [
        'incident' => NULL,
        'severity' => NULL,
        'breached' => FALSE,
      ],
    ],
  ];
}

// src/Controller/IncidentController.php — the controller returns a
// render array; it never says which Twig file runs.
public function card(NodeInterface $incident): array {
  return [
    '#theme' => 'incident_card',
    '#incident' => $incident,
    // field_severity is a list_string: 'low' | 'high' | 'critical'.
    '#severity' => $incident->get('field_severity')->value,
    // NOT declared in 'variables' -> silently dropped, never in Twig.
    '#internal_id' => $incident->id(),
  ];
}`,
      note:
        "Underscores in the hook name become hyphens in the filename (incident_card -> incident-card.html.twig). The 'variables' array is both the default values AND the whitelist: undeclared # properties never reach the template.",
    },
    {
      label: "'variables' vs 'render element'",
      intro:
        "Symfony has one form object that carries every child and its metadata into Twig. Drupal makes you choose per theme hook: flat data variables, or the whole render array under one name.",
      php: `{# templates/incident/filter_form.html.twig (Symfony) #}
{# One \`form\` view object carries every child + its metadata. #}
{{ form_start(form) }}
  <div class="incident-filters">
    {{ form_row(form.severity) }}
    {{ form_row(form.status) }}
  </div>
  {# Anything not yet rendered, so nothing is silently lost. #}
  {{ form_widget(form) }}
{{ form_end(form) }}`,
      ts: `<?php
// incident_tracker.module

function incident_tracker_theme($existing, $type, $theme, $path): array {
  return [
    // 'variables': flat DATA. Template gets \\$incident, \\$severity
    // and \\$breached — and nothing else.
    'incident_card' => [
      'variables' => [
        'incident' => NULL,
        'severity' => NULL,
        'breached' => FALSE,
      ],
    ],

    // 'render element': STRUCTURE. The entire render array arrives
    // under one variable named 'form' — children and # properties.
    'incident_filter_form' => [
      'render element' => 'form',
    ],
  ];
}

// In IncidentFilterForm::buildForm():
//   \\$form['#theme'] = 'incident_filter_form';
//
// templates/incident-filter-form.html.twig:
//   <div class="incident-filters">
//     {{ form.severity }}
//     {{ form.status }}
//   </div>
//   {{ form|without('severity', 'status') }}`,
      note:
        "Never both keys on one hook. Rule of thumb: if the template arranges renderable children (forms, containers, element types) use 'render element'; if it prints values you computed, use 'variables'. Twig's |without filter is Drupal's answer to form_widget(form) — it dumps the leftovers so hidden fields and tokens survive.",
      leftLang: "twig",
      rightLang: "php",
    },
    {
      label: "The template files themselves",
      intro:
        "Both are Twig 3. The Drupal side gains a documented variable contract, an Attribute object, and t()-aware filters — and it is auto-escaped output of a render array, not of an entity you fetched.",
      php: `{# templates/incident/card.html.twig (Symfony 7, Twig 3) #}
<article class="incident-card incident-card--sev-{{ severity }}">
  <h2>{{ incident.title }}</h2>
  <p class="meta">
    {{ 'incident.opened'|trans({'%date': incident.openedAt|date('Y-m-d')}) }}
  </p>
  {# Escaping is on; entity accessors run getters directly. #}
  <div class="body">{{ incident.summary }}</div>
</article>`,
      ts: `{#
/**
 * @file
 * Default theme implementation for an incident card.
 *
 * Available variables:
 * - incident: The incident node being displayed.
 * - severity: string — one of 'low', 'high', 'critical'.
 * - breached: bool — TRUE when the incident is past its SLA.
 * - attributes: HTML attributes for the wrapper element.
 *
 * @see incident_tracker_theme()
 * @see template_preprocess_incident_card()
 *
 * @ingroup themeable
 */
#}
<article{{ attributes.addClass('incident-card', 'incident-card--sev-' ~ severity) }}>
  <h2>{{ incident.label }}</h2>
  <p class="meta">
    {{ 'Opened @date'|t({'@date': incident.getCreatedTime|format_date('short')}) }}
  </p>
  {# Only declared variables arrive: 'incident' was listed in hook_theme(),
     so field access works. {{ content.body }} would print nothing here —
     'content' is not in this hook's 'variables' list. #}
  <div class="body">{{ incident.body.value }}</div>
</article>`,
      note:
        "That docblock is not decoration — it is the published contract other themes read before overriding your template, and core lints for it. On attributes: core's base preprocess seeds 'attributes', 'title_attributes' and 'content_attributes' as empty arrays; the theme system converts them into Attribute objects after the preprocess chain, which is why addClass()/setAttribute() work in Twig without you creating them, while in preprocess you append with array syntax.",
      leftLang: "twig",
      rightLang: "twig",
    },
    {
      label: "Overriding someone else's output",
      intro:
        "This is why the registry exists. In Symfony an override is a filesystem shadow; in Drupal the theme is scanned into the registry, and hook_theme_registry_alter() is the scalpel for everything the scan cannot express.",
      php: `# config/packages/twig.yaml (Symfony 7)
twig:
  paths:
    # Later paths win — this directory shadows bundle templates.
    '%kernel.project_dir%/templates/overrides': ~

# Or simply drop a file at:
#   templates/bundles/AcmeIncidentBundle/incident/card.html.twig
# Resolution is a filesystem lookup at render time.
# There is no registry, and nothing to rebuild.`,
      ts: `<?php
// incident_theme.theme

/**
 * Implements hook_theme_registry_alter().
 *
 * Runs once during the registry rebuild, so it is cached like
 * everything else here: change it, then \`drush cr\`.
 */
function incident_theme_theme_registry_alter(array &$registry): void {
  // 1. Run our preprocess LAST, after the module's own.
  $registry['incident_card']['preprocess functions'][] =
    'incident_theme_incident_card_finalize';

  // 2. Repoint a core hook at a template we ship in a subfolder.
  $registry['field']['path'] =
    'themes/custom/incident_theme/templates/field';
}

// The 90% case needs no alter at all: copying
// incident-card.html.twig into incident_theme/templates/ makes the
// theme's copy win, because themes are scanned after modules.`,
      note:
        "Reach for hook_theme_registry_alter() only for things a file copy cannot do: reordering or removing preprocess functions, moving template paths wholesale, or removing a hook. It runs on every registry rebuild for every theme, so keep it cheap and defensive (check isset() before touching a row).",
      leftLang: "yaml",
      rightLang: "php",
    },
  ],

  playground: {
    intro:
      "A miniature theme registry: apply the defaults Drupal derives from your hook_theme() array, then resolve a #theme render array against it — once for a 'variables' hook, once for a 'render element' hook. Predict the output before running.",
    lang: "php",
    code: `<?php
// A miniature theme registry: what Registry::processExtension() does to the
// array your hook_theme() returns, and how #theme is then resolved.

// 1. What incident_tracker_theme() returns.
$hook_theme = [
  'incident_card' => [
    'variables' => ['incident' => NULL, 'severity' => NULL, 'breached' => FALSE],
  ],
  'incident_card__critical' => [
    'variables' => ['incident' => NULL, 'severity' => NULL, 'breached' => FALSE],
    'base hook' => 'incident_card',
    'template' => 'incident-card--critical',
  ],
  'incident_filter_form' => [
    'render element' => 'form',
  ],
];

// 2. Registry build: fill in the defaults Drupal derives for you.
function build_registry(array $hook_theme, string $module, string $path, string $theme): array {
  $registry = [];
  foreach ($hook_theme as $hook => $info) {
    $info['type'] = 'module';
    $info['theme path'] = $path;
    // Underscores become hyphens unless you set 'template' yourself.
    $info['template'] ??= str_replace('_', '-', $hook);
    $info['path'] ??= $path . '/templates';
    // Preprocess chain: base first, then module, then theme.
    $info['preprocess functions'] ??= [
      'template_preprocess',
      'template_preprocess_' . $hook,
      $module . '_preprocess_' . $hook,
      $theme . '_preprocess_' . $hook,
    ];
    $registry[$hook] = $info;
  }
  return $registry;
}

$registry = build_registry($hook_theme, 'incident_tracker', 'modules/custom/incident_tracker', 'incident_theme');

foreach ($registry as $hook => $info) {
  $kind = isset($info['render element']) ? "render element '{$info['render element']}'" : 'variables ' . implode(', ', array_keys($info['variables']));
  echo $hook . "\\n";
  echo '  ' . $info['path'] . '/' . $info['template'] . ".html.twig\\n";
  echo '  ' . $kind . "\\n";
  if (isset($info['base hook'])) {
    echo '  base hook: ' . $info['base hook'] . "\\n";
  }
}

// 3. Resolve a render array against the registry.
function render_theme(array $registry, array $element): array {
  $hook = $element['#theme'];
  $info = $registry[$hook];
  if (isset($info['render element'])) {
    // The WHOLE element is handed to the template under one name.
    return [$info['render element'] => $element];
  }
  // Declared defaults first, then #keys from the render array override them.
  $variables = $info['variables'];
  foreach ($element as $key => $value) {
    $name = ltrim($key, '#');
    if ($key[0] === '#' && array_key_exists($name, $variables)) {
      $variables[$name] = $value;
    }
  }
  return $variables;
}

$build = [
  '#theme' => 'incident_card',
  '#incident' => 'Payments API 500s',
  // field_severity is a list_string: 'low' | 'high' | 'critical'.
  '#severity' => 'critical',
  '#breached' => TRUE,
  // Not declared in hook_theme() -> never reaches the template.
  '#internal_note' => 'paged the on-call engineer',
];

echo "\\nvariables passed to incident-card.html.twig:\\n";
print_r(render_theme($registry, $build));

echo "\\nvariables passed to incident-filter-form.html.twig:\\n";
print_r(array_keys(render_theme($registry, ['#theme' => 'incident_filter_form', 'severity' => [], '#action' => '/incidents'])));
`,
    output: `incident_card
  modules/custom/incident_tracker/templates/incident-card.html.twig
  variables incident, severity, breached
incident_card__critical
  modules/custom/incident_tracker/templates/incident-card--critical.html.twig
  variables incident, severity, breached
  base hook: incident_card
incident_filter_form
  modules/custom/incident_tracker/templates/incident-filter-form.html.twig
  render element 'form'

variables passed to incident-card.html.twig:
Array
(
    [incident] => Payments API 500s
    [severity] => critical
    [breached] => 1
)

variables passed to incident-filter-form.html.twig:
Array
(
    [0] => form
)
`,
  },

  keyPoints: [
    "hook_theme() in incident_tracker.module registers a theme hook; '#theme' => 'incident_card' then resolves to templates/incident-card.html.twig — underscores in the hook name become hyphens in the filename, and templates/ is the default directory.",
    "'variables' declares flat data (and doubles as a whitelist plus default values — an undeclared # property never reaches Twig); 'render element' hands the ENTIRE render array to the template under one name ('element', or 'form' for forms). One or the other, never both.",
    "Optional keys: template (override the derived filename), path (non-default directory), base hook (mark this hook a variant of another so it inherits preprocessing), preprocess functions (replace the auto-built chain), file (include holding them).",
    "Theme FUNCTIONS were deprecated in 9.3 and removed in Drupal 10 — the 'function' key is gone, Twig only. Since 10.3 (experimental from 10.1), single-directory components register themselves via *.component.yml and need no hook_theme() entry.",
    "hook_theme_registry_alter(&$registry) in incident_theme.theme is the scalpel for rows you do not own: reordering preprocess functions, repointing template paths, removing hooks. Simply copying a template into your theme already wins without it.",
    "The registry is built by scanning every module and theme, then cached per theme — a new hook, renamed template, or new preprocess function is invisible until drush cr.",
  ],

  interview: [
    {
      q: "Why does Drupal make you register templates with hook_theme() when Symfony just needs the file path?",
      a: "Because in Drupal the code that builds the output is deliberately not allowed to pick the final template. A render array declares an intent — `'#theme' => 'incident_card'` — and the active theme, other modules, and the theme-suggestion hooks then compete to satisfy it, which requires a lookup table rather than a filesystem path. That table is the theme registry, and `hook_theme()` is how a module contributes rows to it: the hook name, its variable contract, and the default template. The payoff is that a site builder can override my module's card markup by dropping a file in their theme, or add a `incident-card--critical.html.twig` suggestion, without touching or forking my module. Symfony gets a cheaper mental model; Drupal gets late binding of markup, which is the entire premise of a themable CMS.",
    },
    {
      q: "When do you use 'variables' and when 'render element' in hook_theme()?",
      a: "Use `variables` when the template consumes data you already computed: you list the names (`['incident' => NULL, 'severity' => NULL, 'breached' => FALSE]`), the values arrive as separate Twig variables, and any `#` property you did not declare is dropped — so the list is a contract and a whitelist, not just defaults. Use `render element` when the template's job is to arrange renderable children rather than print values: you name one variable and the whole render array — children, `#attributes`, `#attached` — arrives intact under it. Forms are the canonical case (`'render element' => 'form'`, then `{{ form.severity }}` and `{{ form|without('severity') }}` for the leftovers), as are all the `#type` element plugins in core. The two keys are mutually exclusive; picking `variables` for a form is the classic mistake, because the child elements are not scalars and you lose everything you did not enumerate.",
    },
    {
      q: "A colleague added a theme hook and a template but says '#theme just outputs nothing'. How do you debug it?",
      a: "First, `drush cr` — the theme registry is built by scanning all modules and themes and then cached, so a brand-new `hook_theme()` entry or a renamed template is genuinely invisible until it is rebuilt. Second, check the filename mapping: `incident_card` means `templates/incident-card.html.twig` (underscores to hyphens) in the module directory, unless a `template` or `path` key says otherwise. Third, verify the variables: if the array declares `['incident' => NULL]` and the render array passes `#node`, the template gets the default `NULL`, not the data. If it renders but with stale markup, enable Twig debug in `development.services.yml` (`twig.config: debug: true, auto_reload: true`) and read the HTML comments, which print every candidate template and mark the one that won. Finally, if a template is being ignored in favour of another file, something is winning higher in the registry — a theme override or a `hook_theme_registry_alter()` in the theme.",
    },
    {
      q: "What is hook_theme_registry_alter() for, and when would you avoid it?",
      a: "It receives the fully-built registry by reference just before it is cached, so you can do surgery on rows you do not own: append or reorder `preprocess functions` (for example to run your theme's preprocess after a contrib module's), repoint a hook's `path` at templates you ship, or remove a hook entirely. I avoid it for the common case, because overriding markup only needs a copy of the template in the theme — themes are scanned after modules, so the theme's file simply wins. It is also expensive and fragile territory: it runs on every registry rebuild for every theme, and the array shape it exposes is effectively internal, so guard with `isset()` and keep the code trivial. In Drupal 11.1+ it can be an OOP `#[Hook('theme_registry_alter')]` method, but in a `.theme` file it is still the plain procedural function.",
    },
  ],

  quiz: [
    {
      question:
        "incident_tracker_theme() returns ['incident_card' => ['variables' => ['incident' => NULL, 'severity' => NULL, 'breached' => FALSE]]]. Where does Drupal look for the template by default?",
      options: [
        "modules/custom/incident_tracker/templates/incident_card.html.twig",
        "modules/custom/incident_tracker/templates/incident-card.html.twig",
        "themes/custom/incident_theme/templates/incident-card.html.twig",
        "modules/custom/incident_tracker/incident-card.html.twig",
      ],
      answerIndex: 1,
      explain:
        "The derived template name is the hook name with underscores converted to hyphens, inside the module's templates/ directory. The theme copy is an override that wins if it exists, but it is not where the module's default lives; use the 'template' and 'path' keys to change either half.",
    },
    {
      question:
        "You theme a custom form with '#theme' => 'incident_filter_form' and register it as ['variables' => ['severity' => NULL, 'status' => NULL]]. What goes wrong?",
      options: [
        "Nothing — 'variables' works for forms as long as you list every element",
        "The template gets NULL for both, and the rest of the form (tokens, actions, #attached) is lost, because the render array's children are not # properties",
        "Drupal throws an exception because forms must use 'base hook'",
        "The form renders but loses only its CSS classes",
      ],
      answerIndex: 1,
      explain:
        "A form's children live under plain keys ($form['severity']), not # properties, so a 'variables' hook copies nothing into them and drops everything it was not told about — including the form token and actions. Forms want 'render element' => 'form', which hands the whole array to the template so {{ form.severity }} and {{ form|without('severity') }} work.",
    },
    {
      question:
        "You add a new theme hook and its template, clear nothing, and reload the page. Drupal reports the theme hook does not exist. Why?",
      options: [
        "hook_theme() must be listed in incident_tracker.info.yml",
        "The theme registry is built by scanning modules and themes and is then cached — run drush cr",
        "New theme hooks require a 'base hook' key before they are recognised",
        "Templates must be registered in incident_tracker.libraries.yml",
      ],
      answerIndex: 1,
      explain:
        "Building the registry means scanning every module and theme for hook_theme() plus preprocess functions and template files, which is far too expensive per request, so the result is cached per theme. Any change to hooks, template filenames, or preprocess functions needs drush cr.",
    },
    {
      question:
        "Which statement about Drupal 10/11 theme hooks is correct?",
      options: [
        "You can still supply 'function' => 'theme_incident_card' instead of a template",
        "Theme functions were removed in Drupal 10; a single-directory component's *.component.yml is its own registration and needs no hook_theme() entry",
        "Single-directory components must also be declared in hook_theme() to be usable",
        "'base hook' is required on every theme hook that has a template",
      ],
      answerIndex: 1,
      explain:
        "Theme functions were deprecated in 9.3 and removed in 10.0, so the 'function' key is gone and templates are Twig only. SDC (experimental in 10.1, stable in 10.3) discovers components from their *.component.yml, so they are used via '#type' => 'component' or the Twig include/embed without any hook_theme() row. 'base hook' is only for variants/suggestions of an existing hook.",
    },
  ],
};

export default lesson;
