import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "preprocess-functions",
  title: "Preprocess Functions: Preparing Template Variables",
  part: "The Theme Layer",
  estMinutes: 12,
  summary:
    "The ordered chain that fills $variables before Twig runs — template_preprocess_HOOK() then MODULE_preprocess_HOOK() then THEME_preprocess_HOOK() — and the recipes it exists for: derived values, classes, restructured content, conditional libraries, and cache metadata.",

  concept: `
## The hook that exists so themes can win

In Symfony you compute presentation values in the controller, or in a Twig
extension, and the template consumes them. Both live in *your* bundle. If a
site builder wants a different severity label, they change your PHP or they
fork the template. Drupal splits that job in half on purpose: a controller
returns a render array and never sees the template, and a separate, ordered
chain of **preprocess functions** builds the variable bag that Twig receives.
The last function in that chain belongs to the active theme — so a theme can
rewrite presentation logic it did not author, without owning the controller.

## The chain, in order

For a theme hook \`HOOK\`, the registry compiles this ordered list once and
caches it:

\`\`\`text
template_preprocess(&$variables, $hook, $info)   core base pass
template_preprocess_HOOK(&$variables)            the module that owns the hook
MODULE_preprocess(&$variables, $hook)            every module, all hooks
MODULE_preprocess_HOOK(&$variables)              every module, this hook
THEME_preprocess(&$variables, $hook)             base themes, then active theme
THEME_preprocess_HOOK(&$variables)               the last word
\`\`\`

Every entry gets the **same array by reference**. There is no return value, no
merge: later functions read, overwrite and delete what earlier ones wrote.
Core's base pass is where \`directory\` comes from, and where \`attributes\`,
\`title_attributes\` and \`content_attributes\` are seeded as **empty arrays**.
The theme system converts those three into \`Attribute\` objects only *after*
the whole chain has finished, immediately before the template renders — so
inside a preprocess function you are always appending to a plain array.
\`template_preprocess_node()\` is where \`label\`, \`date\`, \`author_name\`,
\`content\` and \`page\` come from. Then modules, then you:

\`\`\`php
function incident_theme_preprocess_node(array &$variables): void {
  if ($variables['node']->bundle() !== 'incident') {
    return;
  }
  $variables['attributes']['class'][] = 'incident';
  $variables['severity_label'] = 'SEV-1';
}
\`\`\`

Drupal 11.2 added OOP preprocess hooks **for modules only** — a
\`#[Hook('preprocess_node')]\` method in \`MODULE/src/Hook/\`. That change record
says it flatly: *"Themes remain procedural."* Themes got \`#[Hook]\` in Drupal
11.3, and with restrictions (no \`order\` or \`module\` parameter, no
\`ReorderHook\`/\`RemoveHook\`; base theme always runs before the active theme).
On Drupal 10 and 11.0–11.2, theme preprocess stays procedural in
\`incident_theme.theme\`.

## What belongs in preprocess

- **Derived values** — a label, a formatted duration, a boolean the template
  would otherwise compute with an \`if\` chain.
- **Classes and attributes** — \`$variables['attributes']['class'][] = ...\`.
- **Restructuring \`content\`** — pull \`content.field_status\` out into its own
  variable so the template can place it; \`unset()\` it so \`content\` (printed
  with \`|without\`) does not repeat it.
- **Conditional \`#attached\`** — \`$variables['#attached']['library'][] = ...\`
  only when the markup actually needs the CSS/JS.
- **Cache metadata** — yes, here too. Anything you looked up (current user,
  another entity, a config object) must be declared via
  \`$variables['#cache']['contexts'|'tags'|'max-age']\`. Drupal renders those two
  keys as a tiny render array after the chain runs, so they bubble exactly like
  metadata inside a render array. Forgetting this is the classic
  "my preprocess works until page cache warms" bug.

## preprocess vs #pre_render vs alter

- **preprocess** — you are shaping *variables for a template*. It runs late,
  once per themed element, and the theme gets the last word.
- **#pre_render** — you are shaping the *render array itself* (adding children,
  swapping \`#theme\`, wrapping). It runs before theming, so before suggestions
  are resolved and before any preprocess function sees the data.
- **alter hooks** (\`hook_ENTITY_TYPE_view_alter\`, \`hook_form_alter\`) — you are
  changing *what a module built*, structurally, before rendering starts.

Both \`#pre_render\` and the preprocess chain are skipped on a **render-cache
hit**: \`Renderer::doRender()\` returns the cached markup before either one is
reached. So neither is a place to be careless about cacheability — and the
reason not to put access checks in \`#pre_render\` is that its result is baked
into that cached markup and then served to everyone.

Rule of thumb: if the fix is "the template needs one more value", preprocess.
If it is "this build is wrong", alter or \`#pre_render\`.

## You cannot add a template suggestion in preprocess

Suggestions are resolved *before* the chain runs — \`hook_theme_suggestions_HOOK_alter()\`
is documented as being invoked before any preprocessing. By the time your
preprocess function has the data, the template file is already chosen. Compute
the condition in \`hook_theme_suggestions_node_alter()\`, and use preprocess only
for the variables that template will print.
`,

  comparisons: [
    {
      label: "Where presentation logic is allowed to live",
      intro:
        "Same requirement: an incident node should render a human severity label, and the site's theme wants a different wording than the module shipped. Symfony puts the computation in code the theme does not own; Drupal gives the theme a hook that runs last.",
      php: `<?php
// src/Controller/IncidentController.php (Symfony 7)
final class IncidentController extends AbstractController
{
    public function show(Incident $incident): Response
    {
        // Presentation logic computed by the controller...
        return $this->render('incident/show.html.twig', [
            'incident'       => $incident,
            'severity_label' => $this->labelFor($incident->getSeverity()),
        ]);
    }
}

// ...or in a Twig extension, so templates can call it:
final class IncidentExtension extends AbstractExtension
{
    public function getFilters(): array
    {
        return [new TwigFilter('severity_label', $this->labelFor(...))];
    }
}

// Either way it lives in the bundle. A designer who wants
// "SEV-1" instead of "Critical" must patch this PHP or fork
// the template — there is no seam reserved for the theme.`,
      ts: `<?php
// incident_tracker.module — the MODULE's opinion.
function incident_tracker_preprocess_node(array &$variables): void {
  $node = $variables['node'];
  if ($node->bundle() !== 'incident') {
    return;
  }
  $variables['severity_label'] = match ($node->get('field_severity')->value) {
    'critical' => t('Critical'),
    'high' => t('High'),
    'low' => t('Low'),
    default => t('Unknown'),
  };
}

// incident_theme.theme — the THEME runs afterwards and wins.
function incident_theme_preprocess_node(array &$variables): void {
  if (isset($variables['severity_label']) && (string) $variables['severity_label'] === 'Critical') {
    $variables['severity_label'] = t('SEV-1');
  }
}

// Drupal 11.2+: the MODULE's implementation can be an OOP hook, in
// incident_tracker/src/Hook/IncidentTrackerHooks.php
//   #[Hook('preprocess_node')]
//   public function preprocessNode(array &$variables): void { ... }
// The THEME above stays procedural until Drupal 11.3, which is the
// release that allowed #[Hook] in themes.`,
      note:
        "Nothing here is magic naming luck: the registry compiled ['template_preprocess', 'template_preprocess_node', 'incident_tracker_preprocess_node', 'incident_theme_preprocess_node'] and calls them in that order on one array passed by reference. The theme is last, so the theme wins.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Add a class, attach a library — only when needed",
      intro:
        "A critical incident needs an extra class and a small JS behaviour; everything else must not pay for it. Symfony decides in the template with Encore tags; Drupal decides in preprocess and lets #attached bubble.",
      php: `{# templates/incident/show.html.twig (Symfony 7, Twig 3) #}
{% set classes = ['incident', 'incident--sev-' ~ incident.severity] %}
{% if incident.severity == 'critical' %}
  {% set classes = classes|merge(['incident--critical']) %}
{% endif %}

<article class="{{ classes|join(' ') }}">
  {{ block('body') }}
</article>

{% block javascripts %}
  {{ parent() }}
  {# Encore entry; the template decides, and the tag is emitted
     right here in the document rather than collected centrally. #}
  {% if incident.severity == 'critical' %}
    {{ encore_entry_script_tags('incident-siren') }}
  {% endif %}
{% endblock %}`,
      ts: `<?php
// incident_theme.theme

function incident_theme_preprocess_node(array &$variables): void {
  /** @var \\Drupal\\node\\NodeInterface $node */
  $node = $variables['node'];
  if ($node->bundle() !== 'incident') {
    return;
  }

  $severity = $node->get('field_severity')->value;
  // Inside preprocess this is still a plain array: the theme system
  // only turns it into an Attribute object after the whole chain runs.
  $variables['attributes']['class'][] = 'incident';
  $variables['attributes']['class'][] = 'incident--sev-' . $severity;

  if ($severity === 'critical') {
    $variables['attributes']['class'][] = 'incident--critical';
    // Declared here, collected by the renderer, emitted once in
    // drupalSettings/<head> no matter how many nodes are on the page.
    $variables['#attached']['library'][] = 'incident_theme/incident-siren';
  }

  // We read the node's field, so the variables depend on the node.
  $variables['#cache']['tags'] = Cache::mergeTags(
    $variables['#cache']['tags'] ?? [],
    $node->getCacheTags()
  );
}`,
      note:
        "#attached and #cache left in $variables are not decoration: after the chain runs, Drupal renders them as a miniature render array so library and cacheability metadata bubble up to the page exactly as if they had been set inside the render array. Attaching a library from preprocess is fully supported and is the idiomatic way to make a library conditional on data.",
      leftLang: "twig",
      rightLang: "php",
    },
    {
      label: "preprocess vs #pre_render vs alter",
      intro:
        "Three different jobs that all look like 'change the output'. Symfony collapses them into controller code and a kernel listener; Drupal keeps them separate because each runs at a different point in the pipeline with different caching consequences.",
      php: `<?php
// Symfony has two seams, and both belong to the app, not a theme.

// 1. The controller: build the data. (~ Drupal's alter hooks)
$view = ['incident' => $incident, 'sla' => $this->sla->for($incident)];

// 2. A kernel.view / kernel.response listener: post-process
//    what a controller returned, globally. (~ hook_*_alter)
final class IncidentViewListener
{
    public function onKernelView(ViewEvent $event): void
    {
        // Rewrite the controller's result before rendering.
    }
}

// 3. Lazy work: a Twig extension marked as lazy, or a
//    LazyString / Closure passed into the template.
//    (~ #pre_render / #lazy_builder)
$view['sla'] = new LazyString(fn () => $this->sla->for($incident));

// Nothing here reserves a slot for "the theme"; the app
// owns all three.`,
      ts: `<?php
// 1. ALTER — the build is wrong. Runs before rendering starts,
//    changes structure, module-level concern.
function incident_tracker_node_view_alter(array &$build, NodeInterface $node, EntityViewDisplayInterface $display): void {
  if ($node->bundle() === 'incident') {
    $build['field_internal_notes']['#access'] = FALSE;
    $build['#contextual_links']['incident'] = ['route_parameters' => ['node' => $node->id()]];
    // 2. #PRE_RENDER is REGISTERED here — a module gets exactly one
    //    hook_node_view_alter(), so it goes inside this function.
    $build['#pre_render'][] = 'incident_tracker_add_timeline';
  }
}

// ...and the callback is a plain function, not a hook. Its result is
// baked into the cached markup, so never put access checks or
// per-user data here.
function incident_tracker_add_timeline(array $element): array {
  $element['timeline'] = ['#theme' => 'incident_timeline', '#weight' => 50];
  return $element;
}

// 3. PREPROCESS — the template needs one more value, or a class.
//    Runs per themed element, after suggestions are resolved,
//    and the THEME gets the final pass.
function incident_theme_preprocess_node(array &$variables): void {
  $variables['is_stale'] = $variables['node']->getChangedTime() < strtotime('-7 days');
}`,
      note:
        "Order of execution: alter hooks -> render array built -> #pre_render -> theme hook + suggestions resolved -> preprocess chain -> Twig. On a render-cache hit none of it runs: Renderer::doRender() returns the cached markup before #pre_render AND before the theme layer, so the whole preprocess chain is skipped too. That symmetry is exactly why both need correct cacheability metadata. The real difference is what each one touches: #pre_render mutates the render array (children, #theme, wrappers) before theming and suggestions, while preprocess only shapes the template's variable bag — and gives the theme the last word.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Suggestions are decided BEFORE preprocess runs",
      intro:
        "You want critical incident nodes to use a different template. It is tempting to compute that in preprocess — but by then the template file is already chosen.",
      php: `<?php
// Symfony 7: the controller simply picks a filename at runtime.
// The decision and the variables are made in the same place.
public function show(Incident $incident): Response
{
    $template = $incident->getSeverity() === 'critical'
        ? 'incident/show_critical.html.twig'
        : 'incident/show.html.twig';

    return $this->render($template, [
        'incident' => $incident,
        // Same call, same moment: no ordering problem exists.
        'severity_label' => $this->labelFor($incident->getSeverity()),
    ]);
}`,
      ts: `<?php
// incident_theme.theme

/**
 * Implements hook_theme_suggestions_HOOK_alter() for node.
 *
 * Runs BEFORE any preprocess function. Suggestions must start with
 * the base hook + two underscores, or they are ignored.
 */
function incident_theme_theme_suggestions_node_alter(array &$suggestions, array &$variables): void {
  $node = $variables['elements']['#node'];
  if ($node->bundle() === 'incident' && $node->get('field_severity')->value === 'critical') {
    // node--incident--critical.html.twig — last suggestion wins.
    $suggestions[] = 'node__incident__critical';
  }
}

/**
 * Implements hook_preprocess_HOOK() for node.
 *
 * Runs AFTER the template is chosen. Setting a suggestion here is
 * too late; use it for the variables that template will print.
 */
function incident_theme_preprocess_node(array &$variables): void {
  /** @var \\Drupal\\node\\NodeInterface $node */
  $node = $variables['node'];
  // Recompute the condition from data you actually have. Do NOT read
  // $variables['theme_hook_suggestions'] — ThemeManager::render() assigns
  // that key AFTER the preprocess loop, so here it is not set yet.
  $variables['is_critical'] = $node->bundle() === 'incident'
    && $node->get('field_severity')->value === 'critical';
}`,
      note:
        "Note the argument shapes differ: in hook_theme_suggestions_node_alter() the node lives at $variables['elements']['#node'] (raw render array, pre-preprocess), while in preprocess_node it is the friendly $variables['node'] that template_preprocess_node() extracted. $variables['theme_hook_original'] tells you which hook was originally requested.",
      leftLang: "php",
      rightLang: "php",
    },
  ],

  playground: {
    intro:
      "A miniature preprocess chain for the 'node' hook. Four callables share one array by reference: core, the module that owns the hook, our module, then the theme. Predict what the theme's pass changes, and what ends up in the bubbleable keys, before you run it.",
    lang: "php",
    code: `<?php
// The preprocess chain, simulated. Drupal compiles this ordered list ONCE per
// theme hook when it builds the theme registry, then calls every entry with
// the SAME \$variables array by reference: later functions see, and can undo,
// everything earlier ones did.

$chain = [
  'template_preprocess',              // core base pass
  'template_preprocess_node',         // the module that owns the hook
  'incident_tracker_preprocess_node', // any module: hook_preprocess_HOOK()
  'incident_theme_preprocess_node',   // the active theme: the last word
];

$impl = [];

$impl['template_preprocess'] = function (array &$v, string $hook): void {
  $v['directory'] = 'themes/custom/incident_theme';
  $v['theme_hook_original'] = $hook;
  foreach (['attributes', 'title_attributes', 'content_attributes'] as $k) {
    $v[$k] = $v[$k] ?? [];
  }
};

$impl['template_preprocess_node'] = function (array &$v): void {
  // node.module promotes entity data to plain template variables.
  $v['label'] = $v['node']['title'];
  $v['page'] = $v['view_mode'] === 'full';
  $v['attributes']['class'][] = 'node';
  $v['attributes']['class'][] = 'node--type-' . $v['node']['bundle'];
};

$impl['incident_tracker_preprocess_node'] = function (array &$v): void {
  if ($v['node']['bundle'] !== 'incident') {
    return;
  }
  // A derived value, so the template never has to compute it.
  $v['severity_label'] = ['low' => 'Low', 'high' => 'High', 'critical' => 'Critical'][$v['node']['severity']];
  $v['attributes']['class'][] = 'incident--sev-' . $v['node']['severity'];
  // The label depends on who is looking -> declare it, do not hide it.
  $v['#cache']['contexts'][] = 'user.permissions';
};

$impl['incident_theme_preprocess_node'] = function (array &$v): void {
  // The theme overrides what the module decided...
  if (($v['severity_label'] ?? '') === 'Critical') {
    $v['severity_label'] = 'SEV-1';
    $v['#attached']['library'][] = 'incident_theme/incident-siren';
  }
  // ...and restructures content so the template can place the field itself.
  $v['status_block'] = $v['content']['field_status'];
  unset($v['content']['field_status']);
};

$variables = [
  'node' => ['title' => 'Payments API returning 500s', 'bundle' => 'incident', 'severity' => 'critical'],
  'view_mode' => 'teaser',
  'content' => ['body' => '#markup', 'field_status' => '#markup', 'links' => '#lazy_builder'],
];

foreach ($chain as $name) {
  $impl[$name]($variables, 'node');
  $classes = $variables['attributes']['class'] ?? [];
  echo str_pad($name, 34) . ' classes: '
    . ($classes ? implode(' ', $classes) : '(none)') . "\\n";
}

echo "\\nseverity_label: " . $variables['severity_label'] . "\\n";
echo 'content children: ' . implode(', ', array_keys($variables['content'])) . "\\n";
echo 'status_block moved out: ' . var_export(isset($variables['status_block']), TRUE) . "\\n";

// Drupal renders #attached / #cache left in \$variables as if they were a tiny
// render array, so they bubble to the page just like inside a render array.
echo "\\nbubbled by preprocess:\\n";
print_r(array_intersect_key($variables, ['#attached' => 1, '#cache' => 1]));
`,
    output: `template_preprocess                classes: (none)
template_preprocess_node           classes: node node--type-incident
incident_tracker_preprocess_node   classes: node node--type-incident incident--sev-critical
incident_theme_preprocess_node     classes: node node--type-incident incident--sev-critical

severity_label: SEV-1
content children: body, links
status_block moved out: true

bubbled by preprocess:
Array
(
    [#cache] => Array
        (
            [contexts] => Array
                (
                    [0] => user.permissions
                )

        )

    [#attached] => Array
        (
            [library] => Array
                (
                    [0] => incident_theme/incident-siren
                )

        )

)
`,
  },

  keyPoints: [
    "The chain is fixed and ordered: template_preprocess -> template_preprocess_HOOK -> MODULE_preprocess -> MODULE_preprocess_HOOK -> THEME_preprocess -> THEME_preprocess_HOOK. Every entry receives the SAME array by reference and returns nothing, so the active theme always has the last word.",
    "Signature: function incident_theme_preprocess_node(array &$variables): void — always by reference. Drupal 11.2 added #[Hook('preprocess_node')] methods in MODULE/src/Hook/ for MODULES only ('Themes remain procedural'); themes got #[Hook] in Drupal 11.3, without the order/module parameters and without ReorderHook/RemoveHook. On Drupal 10 and 11.0-11.2, theme preprocess is procedural in incident_theme.theme.",
    "Preprocess is for template-facing work: derived values, $variables['attributes']['class'][], restructuring 'content' (pull a field out and unset it so |without does not repeat it), and conditional $variables['#attached']['library'][].",
    "You can and must set $variables['#cache']['contexts'|'tags'|'max-age'] in preprocess — Drupal renders those keys as a tiny render array after the chain so they bubble like normal render-array metadata. Skipping it is why 'it works until the page cache warms'.",
    "preprocess shapes variables for a template (runs late, per element, theme wins); #pre_render shapes the render array itself, before theming and suggestions; alter hooks change what a module built, before rendering starts. On a render-cache hit Renderer::doRender() returns cached markup before EITHER #pre_render or the preprocess chain runs, so both need correct cacheability metadata — and #pre_render is still the wrong place for access checks, because its result is baked into that cached markup.",
    "Template suggestions are resolved BEFORE preprocess runs, so a suggestion set in preprocess is too late — compute it in hook_theme_suggestions_HOOK_alter() (new suggestions must start with the base hook plus two underscores) and use preprocess only for the variables that template prints.",
  ],

  interview: [
    {
      q: "Walk me through what happens between a controller returning a render array and Twig printing a variable. Where does preprocess sit?",
      a: "The render array is altered by module alter hooks, then the renderer walks it depth-first and runs any `#pre_render` callbacks — those change the array itself and are stored in the render cache with the element. When it hits `#theme`, the theme system resolves the hook against the registry, collects and alters template **suggestions** (`hook_theme_suggestions_HOOK()` / `_alter`), and picks the most specific template that exists. Only then does it run the compiled **preprocess chain** — `template_preprocess`, `template_preprocess_HOOK`, then every module's `MODULE_preprocess_HOOK`, then base themes and the active theme — all against one `$variables` array passed by reference. Finally Twig renders that array. Two consequences worth stating out loud: suggestions are already decided by the time preprocess runs, so setting one there is too late; and on a render-cache hit `Renderer::doRender()` returns the cached markup before any of this — `#pre_render` and the entire preprocess chain are both skipped — which is exactly why preprocess still has to declare its `#cache` contexts and tags.",
    },
    {
      q: "A colleague says 'never do anything expensive or dynamic in preprocess, it isn't cache-aware.' Is that right?",
      a: "Half right, and the half that is wrong matters. Preprocess has no cache entry of its own — it runs whenever the element is actually themed — so genuinely expensive lookups belong in `#pre_render` or a `#lazy_builder`, where the result is cached with the element or deliberately placeholdered. But 'it isn't cache-aware' is false twice over: on a render-cache hit the preprocess chain is skipped along with everything else, and preprocess *is* fully cacheability-aware — anything you set in `$variables['#cache']['contexts']`, `['tags']` or `['max-age']` is rendered by Drupal as a small render array right after the chain finishes, so it bubbles to the enclosing element and out to the page exactly like metadata declared inside a render array. `$variables['#attached']` behaves the same way, which is how you attach a library conditionally. So the real rule is: keep preprocess cheap, and always declare what you looked up — the failure mode of skipping it is a page that renders correctly for the first visitor and stale or leaked-permission markup for everyone after.",
    },
    {
      q: "Coming from Symfony — why not just compute these values in the controller or a Twig extension, like you would in a Symfony app?",
      a: "Because in Drupal the code that produces output is deliberately not allowed to decide how it looks. A controller returning `['#theme' => 'incident_card', ...]` hands off to a theme layer it cannot see, and preprocess is the seam reserved for that layer: a site's custom theme can add a class, rename a label, or restructure `content` without patching the module or forking its template. A Twig extension is still the right tool for a genuinely reusable, presentation-free transform (Drupal has those too — `|clean_class`, `|format_date`), but per-hook variable preparation goes in preprocess so the override chain works. In interviews it is worth naming the ordering explicitly: module first, theme last, which is the whole reason contrib modules can ship sensible defaults that themers quietly replace.",
    },
    {
      q: "How do you decide between hook_preprocess_HOOK(), a #pre_render callback, and hook_ENTITY_TYPE_view_alter()?",
      a: "Ask what you are changing. If the answer is 'the template needs one more value or one more class', it is preprocess — cheap, template-facing, and the theme runs last. If it is 'this element's structure is wrong: a child is missing, `#access` should be FALSE, `#theme` should be different', that is an alter hook, running before rendering starts. If it is 'this structural work is expensive and should be cached with the element', it is `#pre_render` — with the caveat that it may be skipped entirely on a render-cache hit, so never do access checks or per-user work there. A useful smell test: if a theme should be able to override your change, preprocess; if no theme should be able to break it, alter.",
    },
  ],

  quiz: [
    {
      question:
        "Both incident_tracker_preprocess_node() and incident_theme_preprocess_node() set $variables['severity_label']. What does the template print?",
      options: [
        "The module's value — modules run after themes.",
        "The theme's value — the active theme runs last in the chain.",
        "An array containing both values, merged by the theme system.",
        "Whichever function is alphabetically last.",
      ],
      answerIndex: 1,
      explain:
        "The compiled chain is template_preprocess, template_preprocess_HOOK, MODULE_preprocess(_HOOK), then base themes and finally the active theme. Every function gets the same array by reference and simply overwrites keys, so the active theme's pass is the last word — which is exactly why the hook exists.",
    },
    {
      question:
        "In incident_theme_preprocess_node() you read \\Drupal::currentUser()->hasPermission('view internal notes') and set a variable from it. What must you also do?",
      options: [
        "Nothing — preprocess output is never cached.",
        "Call \\Drupal::service('page_cache_kill_switch')->trigger().",
        "Add $variables['#cache']['contexts'][] = 'user.permissions'.",
        "Move the whole thing into hook_theme_registry_alter().",
      ],
      answerIndex: 2,
      explain:
        "Preprocess is fully cacheability-aware: Drupal renders $variables['#cache'] (and $variables['#attached']) as a small render array after the chain, so the metadata bubbles to the page. Without the 'user.permissions' context the first render is cached and served to users with different permissions. The kill switch is a sledgehammer that disables the whole page cache.",
    },
    {
      question:
        "You add $variables['theme_hook_suggestions'][] = 'node__incident__critical' inside incident_theme_preprocess_node(). What happens?",
      options: [
        "node--incident--critical.html.twig is used for critical incidents.",
        "Nothing useful — suggestions are resolved before the preprocess chain runs, so the template is already chosen.",
        "It works, but only after drush cr on every request.",
        "Drupal throws a TwigException about an unknown template.",
      ],
      answerIndex: 1,
      explain:
        "hook_theme_suggestions_HOOK() and hook_theme_suggestions_HOOK_alter() are documented as running before any preprocessing — the theme system has already picked the most specific existing template by the time your preprocess function is called. Put the condition in incident_theme_theme_suggestions_node_alter() (and remember new suggestions must begin with the base hook plus two underscores).",
    },
    {
      question:
        "Which piece of work belongs in a #pre_render callback rather than in preprocess?",
      options: [
        "Adding a CSS class to $variables['attributes'].",
        "Renaming a label the module computed.",
        "Building an expensive child element that can safely be stored in the render cache with its parent.",
        "Checking whether the current user may see a field, then hiding it.",
      ],
      answerIndex: 2,
      explain:
        "#pre_render runs on the render array and its result is cached with the element, which makes it right for expensive structural work — and wrong for access checks or per-user logic, because on a cache hit it never runs. Classes and label tweaks are template-facing and belong in preprocess, where the theme also gets the final say.",
    },
  ],
};

export default lesson;
