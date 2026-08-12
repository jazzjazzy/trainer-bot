import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-theming-interview",
  title: "Cheat Sheet: Output Pipeline & Interview Prep",
  part: "Quality & Debugging",
  estMinutes: 13,
  summary:
    "The capstone map of Drupal's output pipeline in order with the hook available at every stage, decision tables for markup/preprocess/override/interactivity, a Symfony-to-Drupal reflex table for the theme layer, and the theming and Form API questions panels actually ask.",

  concept: `
## One request, eleven stages

A Symfony controller returns a \`Response\`. A Drupal controller returns an
*array*, and then eleven things happen to it before anyone sees HTML. Memorise
the order and almost every theming bug collapses into one question: **which
stage was I too late for?**

\`\`\`text
route  →  controller returns a render array
  1  #access checked, render cache looked up      #cache keys/contexts
  2  #lazy_builder resolved (or left as a placeholder for BigPipe)
  3  #pre_render callbacks run                    hook_element_info_alter()
  4  children rendered depth-first, sorted by #weight
  5  theme hook resolved in the registry          hook_theme(), hook_theme_registry_alter()
  6  suggestions built and ranked                 hook_theme_suggestions_HOOK_alter()
  7  preprocess chain runs, in registry order     template_preprocess()
       → template_preprocess_HOOK() → MODULE_preprocess_HOOK() → THEME_preprocess_HOOK()
  8  Twig renders; everything autoescapes         {{ attributes }}, |raw, Markup::create()
  9  #post_render callbacks run on the children string (string in, string out),
     then #prefix / #suffix are concatenated around the result
 10  #attached merged upward                      hook_page_attachments(), hook_library_info_alter()
 11  #cache bubbles upward: contexts ∪, tags ∪, max-age = min
     →  HtmlRenderer: page.html.twig (hook_preprocess_page)
        inside html.html.twig (hook_preprocess_html)  →  Response
\`\`\`

Stage 3 versus stage 7 is the question panels love: **#pre_render changes the
array, preprocess changes the variables.** After stage 5 you cannot add a child
and expect it themed; after stage 8 you only have a string.

## What to output

| You have | Use | What it does |
| --- | --- | --- |
| Trusted snippet of HTML | \`#markup\` | \`Xss::filterAdmin()\`, not escaping — override with \`#allowed_tags\` |
| Text from anywhere else | \`#plain_text\` | \`Html::escape()\`, and it wins if \`#markup\` is also set |
| Output others may need to restyle | \`#theme\` | Gets suggestions, preprocess, template overrides |
| A design-system component | SDC \`#type: component\` | Validated props, own library, explicit call |

## Where to intervene

| Goal | Tool |
| --- | --- |
| Add/remove elements, attach cache metadata | \`#pre_render\` |
| Compute variables for one template | \`hook_preprocess_HOOK()\` |
| Change output you don't own | \`hook_form_alter()\`, \`hook_ENTITY_TYPE_view_alter()\`, \`hook_theme_registry_alter()\` |
| Change which template runs | \`hook_theme_suggestions_HOOK_alter()\` |

**Override vs suggestion vs SDC:** an override (same filename, in your theme)
changes *every* instance of that theme hook; a suggestion
(\`node--incident--teaser.html.twig\`) is a conditional variant, and the winner
is decided by POSITION in the suggestion list — suggestions are collected in
ascending specificity and the theme system reverses the list, taking the last
suggestion that has a registered template, not the longest name; an SDC is
never automatic — something has to call it by its \`provider:machine-name\` id.

**#states vs #ajax vs custom JS:** \`#states\` is pure client-side
show/hide/require with zero requests, so never trust it for validation or
access; \`#ajax\` is a real round trip needing a wrapper and a callback that
returns a render array or an \`AjaxResponse\`; custom JS means
\`Drupal.behaviors\` + \`once()\` + \`drupalSettings\` for anything stateful.

## Symfony → Drupal reflexes

| Symfony habit | Drupal muscle memory |
| --- | --- |
| \`$this->render('x.html.twig', \\$vars)\` | \`return ['#theme' => 'x', …]\` |
| \`{% include 'card.html.twig' %}\` | SDC, or a child element with \`#theme\` |
| Form theme block \`{% block …_widget %}\` | Template + preprocess + \`#theme_wrappers\` |
| Encore / AssetMapper entry | \`libraries.yml\` + \`#attached\` |
| ESI / \`render(controller(…))\` | \`#lazy_builder\` + placeholder + BigPipe |
| \`kernel.response\` listener | \`hook_page_attachments_alter()\` |

Version line: Twig 3 and CKEditor 5 in Drupal 10 and 11; SDC experimental in
10.1, stable in 10.3, plain core in 11; OOP hooks via \`#[Hook]\` landed in 11.1,
but preprocess hooks (\`#[Hook('preprocess_HOOK')]\`) only from 11.2 (backported
to 11.1.8).
`,

  comparisons: [
    {
      label: "The entry point: Response vs render array",
      intro:
        "The single structural difference the whole course rests on. Symfony renders to a string in the controller; Drupal returns a description of the output and lets the pipeline finish it, which is what makes theme overrides and cache bubbling possible at all.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: rendering happens HERE. You own the string.
final class IncidentController extends AbstractController
{
    #[Route('/incidents/{id}', name: 'incident_show')]
    public function show(Incident $incident): Response
    {
        // Twig runs now. Nothing downstream can change the template,
        // the variables, or the markup.
        $response = $this->render('incident/show.html.twig', [
            'incident' => $incident,
        ]);

        // Caching is an HTTP concern, set by hand.
        $response->setPublic()->setMaxAge(600);

        return $response;
    }
}
// Assets are a build artefact: {{ encore_entry_link_tags('incident') }}
// sits in the template. No merging, no dedupe across the page.`,
      ts: `<?php
// Drupal: you return a DESCRIPTION. Rendering happens later, downstream.
final class IncidentController extends ControllerBase implements TrustedCallbackInterface {

  public function show(NodeInterface $node): array {
    return [
      // Stage 5-8: hook resolved, suggestions ranked, preprocess, Twig.
      '#theme' => 'incident_card',
      '#incident' => $node,

      // Stage 3: last chance to change the ARRAY.
      '#pre_render' => [[static::class, 'addSeverityBadge']],

      // Stage 10: merged with every other #attached on the page, deduped.
      '#attached' => [
        'library' => ['incident_tracker/card-behaviour'],
        'drupalSettings' => ['incidentTracker' => ['pollInterval' => 30000]],
      ],

      // Stage 11: bubbles up to the page and into the response headers.
      '#cache' => [
        'contexts' => ['user.permissions'],
        'tags' => $node->getCacheTags(),
        'max-age' => 600,
      ],
    ];
  }

  // Renderer::doCallback() runs every #pre_render / #post_render /
  // #lazy_builder through doTrustedCallback(), so the class must declare
  // its callbacks or Drupal throws instead of rendering.
  public static function trustedCallbacks(): array {
    return ['addSeverityBadge'];
  }

}
// A theme can now override incident-card.html.twig, a module can add a
// suggestion, and both can preprocess — none of which is possible once
// you have returned a Response.`,
      note: "Return an array, not a Response, unless you genuinely need to bypass theming (file downloads, redirects, raw JSON). A Response short-circuits stages 3-11 including cache bubbling.",
    },
    {
      label: "Escaping and attributes in the template",
      intro:
        "Both use Twig 3 with autoescape on. The difference is that Drupal hands the template an Attribute object rather than a string, and treats already-safe markup as a value type instead of asking you to remember |raw.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# Symfony: you build the attribute string yourself. #}
<article class="incident incident--{{ incident.severity }}"
         data-id="{{ incident.id }}">
  <h2>{{ incident.title }}</h2>

  {# Autoescaped, same as Drupal. #}
  {{ incident.summary }}

  {# Opting out is a filter you have to remember, every time. #}
  {{ incident.bodyHtml|raw }}

  {# Merging classes from a parent means string concatenation
     or a custom Twig function. #}
</article>

{# Assets: emitted inline, per template, no page-wide dedupe. #}
{{ encore_entry_link_tags('incident') }}`,
      ts: `{# Drupal: preprocess handed you an Attribute object. #}
<article{{ attributes.addClass('incident-card').setAttribute('data-id', incident.id) }}>
  <h2>{{ label }}</h2>

  {# Autoescaped. #}
  {{ incident.summary }}

  {# Already-safe: a render array, or Markup::create() from PHP,
     or |render on a child. No |raw needed, and no XSS hole. #}
  {{ content.body }}

  {# Attribute objects merge cleanly with whatever a module added. #}
  <div{{ content_attributes.addClass('incident-card__body') }}>
    {{ content|without('body') }}
  </div>
</article>

{# Assets are declared, not printed — Drupal dedupes and orders them. #}
{{ attach_library('incident_tracker/card-behaviour') }}`,
      note: "Reach for |raw and you have almost always skipped a step: the value should have been a render array, a Markup object, or filtered through a text format instead.",
    },
    {
      label: "Deferred content: ESI vs #lazy_builder",
      intro:
        "Same goal — cache the page but keep one personalised fragment fresh. Symfony punts to the HTTP layer; Drupal keeps it inside the render pipeline, so the placeholder can be flushed early over the same connection.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: the fragment is a separate sub-request.
// config/packages/framework.yaml
//   framework:
//       esi: true
//       fragments: { path: /_fragment }

// templates/incident/show.html.twig
//   {{ render_esi(controller('App\\\\Controller\\\\AlertController::badge',
//        { userId: app.user.id })) }}

final class AlertController extends AbstractController
{
    public function badge(int $userId): Response
    {
        $response = $this->render('incident/_badge.html.twig', [
            'count' => $this->alerts->countFor($userId),
        ]);

        return $response->setPrivate()->setMaxAge(0);
    }
}
// Needs a reverse proxy that speaks ESI (Varnish, or Symfony's
// HttpCache) or it silently degrades to an inline sub-request.`,
      ts: `<?php
// Drupal: a placeholder inside the cached render array.
$build['badge'] = [
  '#lazy_builder' => [
    // Static method or service id, then SCALAR arguments only.
    // incident_tracker.lazy_builders must implement TrustedCallbackInterface
    // and list 'alertCount' in trustedCallbacks(), or the render throws.
    'incident_tracker.lazy_builders:alertCount',
    [$account->id(), 'open'],
  ],
  '#create_placeholder' => TRUE,
];

// The builder returns its own render array with its own cacheability.
public function alertCount(int $uid, string $state): array {
  return [
    '#markup' => $this->t('@n @state alerts', [
      '@n' => $this->count($uid, $state),
      '@state' => $state,
    ]),
    '#cache' => [
      'contexts' => ['user'],
      'tags' => ['incident_alerts:' . $uid],
      'max-age' => 0,
    ],
  ];
}
// The outer page still caches. With BigPipe installed the placeholder
// is streamed after the shell; without it, it is replaced before the
// response is sent. No reverse proxy required either way.`,
      note: "#lazy_builder arguments must be scalars because they become part of the placeholder's cache key — passing an entity is the classic mistake and throws immediately.",
    },
    {
      label: "Assets: Encore entrypoint vs libraries.yml",
      intro:
        "A one-screen reminder of the shape difference. Encore describes a build; libraries.yml describes a runtime dependency graph that Drupal resolves, orders and dedupes per request.",
      leftLang: "js",
      rightLang: "yaml",
      php: `// webpack.config.js — build-time only.
Encore
  .setOutputPath('public/build/')
  .setPublicPath('/build')
  .addEntry('incident', './assets/incident.js')
  .enableSassLoader()
  .splitEntryChunks()
  .autoProvidejQuery();

// The template decides when it loads:
//   {{ encore_entry_script_tags('incident') }}
//
// Dependencies are resolved by webpack and bundled in.
// Nothing at runtime can say "also load X whenever Y loads",
// and two templates asking for the same entry is your problem.`,
      ts: `# incident_tracker.libraries.yml — runtime dependency graph.
# The behaviour + the CSS the card needs to FUNCTION belong to the module.
card-behaviour:
  version: 1.0.x
  css:
    component:
      css/incident-card.css: {}
  js:
    js/incident-card.js: { attributes: { defer: true } }
  dependencies:
    - core/drupal
    - core/once

# Attach declaratively and Drupal dedupes + topologically sorts:
#   '#attached' => ['library' => ['incident_tracker/card-behaviour']]
#   {{ attach_library('incident_tracker/card-behaviour') }}
#
# Theme-only levers in THEME.info.yml:
#   libraries-override:  replace a file, or 'false' to delete it
#   libraries-extend:    append yours whenever theirs is attached, e.g.
#     incident_tracker/card-behaviour: [incident_theme/card-skin]
#     — card-skin is the theme's own theme-bucket CSS, what the card
#       needs to LOOK right.
# Modules must use hook_library_info_alter() instead.`,
      note: "The mental switch: Encore answers 'what gets built', libraries.yml answers 'what this piece of output needs' — which is why attaching from deep inside a render array is safe and normal in Drupal.",
    },
  ],

  playground: {
    intro:
      "The whole pipeline as one runnable script: pre_render mutates the array, the theme hook resolves, the suggestion list is walked in reverse so the last registered template wins, three preprocess functions run in registry order (theme last, so the theme wins), Twig escapes, post_render sees only a string, then #attached and #cache bubble upward. Predict which label survives and what max-age the page ends up with.",
    lang: "php",
    code: `<?php
// The whole output pipeline in one file. Each echo marks a stage you can hook.

$build = [
  '#theme' => 'incident_card',
  '#incident' => ['id' => 42, 'title' => 'Gateway down', 'severity' => 'critical'],
  '#pre_render' => ['pre_render_add_age'],
  '#post_render' => ['post_render_comment'],
  '#attached' => [
    'library' => ['incident_theme/global', 'incident_tracker/card-behaviour'],
    'drupalSettings' => ['incidentTracker' => ['pollInterval' => 30000]],
  ],
  '#cache' => ['contexts' => ['user.permissions'], 'tags' => ['node:42'], 'max-age' => 600],
];

// ---- 3. #pre_render: last chance to change the ARRAY (structure, not vars).
function pre_render_add_age(array $element): array {
  $element['#incident']['age_minutes'] = 17;
  return $element;
}
foreach ($build['#pre_render'] as $callback) {
  $build = $callback($build);
}
echo "3. #pre_render      -> added age_minutes to #incident\\n";

// ---- 5/6. Theme hook resolved, then suggestions built LEAST SPECIFIC FIRST.
$hook = $build['#theme'];
$suggestions = [
  $hook,
  $hook . '__' . $build['#incident']['severity'],
  $hook . '__' . $build['#incident']['severity'] . '__' . $build['#incident']['id'],
];
// hook_theme_suggestions_HOOK_alter() appends; the theme system then walks
// the list in REVERSE and takes the LAST suggestion that has a template,
// so list position decides the winner — never the length of the name.
$templates_on_disk = ['incident-card.html.twig', 'incident-card--critical.html.twig'];
$chosen = NULL;
foreach (array_reverse($suggestions) as $suggestion) {
  $file = str_replace('_', '-', $suggestion) . '.html.twig';
  if (in_array($file, $templates_on_disk, TRUE)) {
    $chosen = $file;
    break;
  }
}
echo "5. theme hook       -> $hook\\n";
echo "6. suggestions      -> " . implode(', ', $suggestions) . "\\n";
echo "   template picked  -> $chosen\\n";

// ---- 7. Preprocess chain, in registry order: core, then module, then theme.
$variables = [
  'incident' => $build['#incident'],
  'attributes' => ['class' => []],
];
function template_preprocess_incident_card(array $v): array {
  $v['attributes']['class'][] = 'incident-card';
  $v['title'] = $v['incident']['title'];
  return $v;
}
function incident_tracker_preprocess_incident_card(array $v): array {
  $v['attributes']['class'][] = 'incident-card--' . $v['incident']['severity'];
  // The module ships the human labels Low / High / Critical.
  $v['label'] = ucfirst($v['incident']['severity']);
  return $v;
}
function incident_theme_preprocess_incident_card(array $v): array {
  // The theme runs LAST, so it always wins a conflict with a module.
  // SEV numbers are INVERSE to severity — never concatenate the raw value.
  $map = ['critical' => 'SEV-1', 'high' => 'SEV-2', 'low' => 'SEV-3'];
  $v['label'] = $map[$v['incident']['severity']] ?? 'SEV-?';
  return $v;
}
$chain = [
  'template_preprocess_incident_card',
  'incident_tracker_preprocess_incident_card',
  'incident_theme_preprocess_incident_card',
];
foreach ($chain as $preprocess) {
  $variables = $preprocess($variables);
}
echo "7. preprocess chain -> " . implode(' -> ', $chain) . "\\n";
echo "   label after theme-> {$variables['label']}\\n";

// ---- 8. Twig renders. Attributes print as a string; values autoescape.
$class = implode(' ', $variables['attributes']['class']);
$html = '<article class="' . $class . '"><h2>'
  . htmlspecialchars($variables['title'], ENT_QUOTES, 'UTF-8')
  . '</h2><span>' . $variables['label'] . '</span></article>';
echo "8. twig + escaping  -> $html\\n";

// ---- 9. #post_render sees the finished STRING, not the array.
function post_render_comment(string $markup): string {
  return "<!-- incident-card -->" . $markup;
}
foreach ($build['#post_render'] as $callback) {
  $html = $callback($html);
}
echo "9. #post_render     -> " . substr($html, 0, 26) . "...\\n";

// ---- 10/11. #attached and #cache bubble up to the page: merged, not replaced.
$page = [
  '#attached' => ['library' => ['core/drupal', 'incident_theme/global']],
  '#cache' => ['contexts' => ['url.path'], 'tags' => ['config:system.site'], 'max-age' => 3600],
];
$libraries = array_values(array_unique(array_merge(
  $page['#attached']['library'],
  $build['#attached']['library'],
)));
$contexts = array_values(array_unique(array_merge($page['#cache']['contexts'], $build['#cache']['contexts'])));
$tags = array_values(array_unique(array_merge($page['#cache']['tags'], $build['#cache']['tags'])));
// Cache contexts and tags UNION; max-age takes the strictest value.
$max_age = min($page['#cache']['max-age'], $build['#cache']['max-age']);
sort($contexts);
sort($tags);
echo "10. #attached merged -> " . implode(', ', $libraries) . "\\n";
echo "11. cache bubbled    ->\\n";
print_r(['contexts' => $contexts, 'tags' => $tags, 'max-age' => $max_age]);

// ---- HtmlRenderer wraps the string in page.html.twig, then html.html.twig.
echo "12. wrappers         -> html.html.twig( page.html.twig( region content( markup ) ) )\\n";
`,
    output: `3. #pre_render      -> added age_minutes to #incident
5. theme hook       -> incident_card
6. suggestions      -> incident_card, incident_card__critical, incident_card__critical__42
   template picked  -> incident-card--critical.html.twig
7. preprocess chain -> template_preprocess_incident_card -> incident_tracker_preprocess_incident_card -> incident_theme_preprocess_incident_card
   label after theme-> SEV-1
8. twig + escaping  -> <article class="incident-card incident-card--critical"><h2>Gateway down</h2><span>SEV-1</span></article>
9. #post_render     -> <!-- incident-card --><art...
10. #attached merged -> core/drupal, incident_theme/global, incident_tracker/card-behaviour
11. cache bubbled    ->
Array
(
    [contexts] => Array
        (
            [0] => url.path
            [1] => user.permissions
        )

    [tags] => Array
        (
            [0] => config:system.site
            [1] => node:42
        )

    [max-age] => 600
)
12. wrappers         -> html.html.twig( page.html.twig( region content( markup ) ) )
`,
  },

  keyPoints: [
    "Pipeline order to recite: #access/cache lookup -> #lazy_builder -> #pre_render -> children by #weight -> theme hook -> suggestions -> preprocess (template_preprocess -> module -> theme) -> Twig -> #post_render -> #prefix/#suffix -> #attached merged -> #cache bubbled -> page.html.twig inside html.html.twig.",
    "#pre_render edits the render array (add elements, attach cacheability); preprocess edits template variables; alter hooks change output you do not own; #post_render only ever sees a string.",
    "Output choice: #plain_text escapes and beats #markup, #markup runs Xss::filterAdmin() (tune with #allowed_tags), #theme buys you suggestions and overrides, SDC buys you a validated props contract and its own library.",
    "Template override changes every instance of a hook; a suggestion is a conditional variant whose winner is the LAST entry in the (ascending-specificity) suggestion list that has a registered template — position decides, not name length; an SDC is only rendered when something calls it by provider:machine-name.",
    "#states is client-side only — always re-check required/visible logic in validateForm(); #ajax is a real round trip with a wrapper plus callback; Drupal.behaviors + once() covers everything else.",
    "Cache metadata unions contexts and tags on the way up and takes the minimum max-age, so one uncacheable child makes its ancestors uncacheable unless you isolate it behind #lazy_builder.",
  ],

  interview: [
    {
      q: "Walk me through what happens between a controller returning a render array and the browser receiving HTML.",
      a: "The renderer checks `#access`, tries the render cache, then resolves any `#lazy_builder` (or leaves a placeholder for BigPipe). It runs `#pre_render` callbacks, renders children depth-first in `#weight` order, then resolves the `#theme` hook against the theme registry and builds the suggestion list, which is walked most-specific-first. The preprocess chain runs in registry order — `template_preprocess()`, `template_preprocess_HOOK()`, then module and finally theme functions, so the theme always gets the last word — and Twig renders the variables with autoescaping on. Afterwards `#post_render` receives the rendered children string, and `#prefix`/`#suffix` are then wrapped around whatever it returns, `#attached` libraries and drupalSettings are merged and deduped page-wide, and `#cache` contexts/tags/max-age bubble upward. HtmlRenderer then places the result in `page.html.twig` inside `html.html.twig` and the response headers pick up the bubbled cacheability.",
    },
    {
      q: "#pre_render, hook_preprocess_HOOK() and an alter hook can all change the output. How do you choose?",
      a: "By what you need to touch and how early. `#pre_render` runs while it is still a **render array**, so it is the only one of the three where I can add or remove child elements, set `#attached`, or merge cache metadata that will bubble correctly — that is the right place for logic that changes the *structure* of my own element. `hook_preprocess_HOOK()` runs after the theme hook and template have already been chosen, so it can only shape the **variables** the template sees: computed strings, extra classes on the `attributes` object, a rearranged `content` array. Alter hooks (`hook_form_alter()`, `hook_ENTITY_TYPE_view_alter()`, `hook_theme_registry_alter()`) are for changing something another module or core built, before it is themed. The tell in an interview is that adding a `#theme`'d child from a preprocess function is too late for the parent's own theming, and that only `#pre_render` output is stored in the render cache in the shape you left it.",
    },
    {
      q: "A field needs to appear only when severity is 'critical'. When do you use #states, when #ajax, and what is the security implication?",
      a: "`#states` if the condition can be evaluated entirely from values already on the page — it is a declarative JSON blob that core's `states.js` turns into show/hide/required/disabled behaviour with zero server round trips, so it is fast and works offline of the form's rebuild cycle. `#ajax` when the server has to decide: the option list depends on a query, or the visible fields depend on something only the backend knows. The security point is the one people miss: `#states` is **purely cosmetic**. A hidden field still submits its value, and `'required' => [...]` in `#states` does not add server-side validation, so I re-check the condition in `validateForm()` and use `setErrorByName()` there. Same reasoning for access — never use `#states` or CSS to hide something a user is not allowed to see; strip it from the array or gate it with `#access`.",
    },
    {
      q: "When would you build a Single Directory Component instead of a theme hook with hook_theme() and a template?",
      a: "SDC when I am building a reusable design-system piece with a genuine contract: `incident_theme:incident-card` gets a `.component.yml` declaring typed, validated props and named slots, plus its own CSS and JS in the same folder, and Drupal auto-registers the library. That is the right shape for things a front-end team maintains and a Storybook can document. A classic `hook_theme()` hook is still right when the output needs to sit in Drupal's *automatic* pipeline — anything that should get theme suggestions, be overridable by an arbitrary theme, or be preprocessed by other modules — because an SDC is only ever rendered when something calls it explicitly, via `#type: 'component'` with `#props`/`#slots` or a Twig `include`/`embed`. In practice I use both: a theme hook for the entity-shaped output, whose template then includes SDCs for the presentational bits. Worth knowing the versions: SDC was experimental in 10.1, stable in 10.3, and plain core in 11.",
    },
  ],

  quiz: [
    {
      question:
        "A module's hook_preprocess_incident_card() sets variables['label'] = 'Critical' and the active theme's incident_theme_preprocess_incident_card() renames it to 'SEV-1'. What does the template print?",
      options: [
        "Critical — modules run after themes so they win.",
        "SEV-1 — the preprocess chain runs core, then module, then theme, so the theme is last and wins.",
        "Whichever ran first; the second is ignored to protect module output.",
        "Drupal throws a conflict error because two preprocess functions set the same variable.",
      ],
      answerIndex: 1,
      explain:
        "The registry orders preprocess functions template_preprocess() -> template_preprocess_HOOK() -> MODULE_preprocess_HOOK() -> base-theme -> active-theme. Later functions simply overwrite earlier ones, and the active theme is always last — which is precisely why themes can correct module output without an alter hook.",
    },
    {
      question:
        "You need to add a child render element that itself has a #theme hook. Which stage can still do that correctly?",
      options: [
        "hook_preprocess_HOOK() on the parent",
        "A #post_render callback",
        "A #pre_render callback on the parent",
        "The Twig template, using a custom function",
      ],
      answerIndex: 2,
      explain:
        "#pre_render runs while the value is still a render array and before children are rendered, so a child you add there goes through the whole pipeline normally. Preprocess runs after the parent's theme hook is resolved and only shapes variables, and #post_render receives a finished string — neither can introduce a new themed element.",
    },
    {
      question:
        "A page fragment declares '#cache' => ['max-age' => 0] and the page shell declares max-age 3600 with tags ['config:system.site']. What does the rendered page end up with?",
      options: [
        "max-age 3600; the child's value applies only to the child.",
        "max-age 0, and the union of both sets of cache contexts and tags.",
        "max-age 1800 — Drupal averages conflicting values.",
        "max-age 3600, and only the shell's tags, because tags do not bubble.",
      ],
      answerIndex: 1,
      explain:
        "Bubbling unions contexts and tags and takes the *minimum* max-age, so one uncacheable descendant makes every ancestor uncacheable. The fix is to isolate the volatile part behind a #lazy_builder placeholder so its max-age of 0 applies to the placeholder rather than the whole page.",
    },
    {
      question:
        "Which statement about #states is true?",
      options: [
        "A field marked required via #states is also validated as required on the server.",
        "#states triggers an AJAX request to re-evaluate the condition.",
        "#states is client-side only: hidden fields still submit values and required conditions must be re-checked in validateForm().",
        "#states can hide a field securely from users without permission to see it.",
      ],
      answerIndex: 2,
      explain:
        "#states compiles to a JSON blob consumed by core/drupal.states in the browser — no request, and no effect on server-side processing. Values of visually hidden fields are still posted, #states 'required' adds no server validation, and anything genuinely restricted must be removed from the render array or gated with #access.",
    },
  ],
};

export default lesson;
