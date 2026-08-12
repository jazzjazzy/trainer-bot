import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "render-array-anatomy",
  title: "Render Array Anatomy: Properties, Children & Weight",
  part: "Render Arrays & the Render Pipeline",
  estMinutes: 13,
  summary:
    "A render array is a tree of #-prefixed properties and weight-sorted children that stays data until the Renderer walks it — which is exactly what makes it alterable, cacheable, and dangerous to get wrong on the security properties.",

  concept: `
A render array is one PHP array with two kinds of keys, and that is the whole
data model:

- keys **starting with \`#\`** are **properties** — directives to the Renderer;
- **every other key** is a **child**, and a child is itself a render array.

So \`$build['messages']['#markup']\` reads as "the child named \`messages\`, whose
\`#markup\` property is …". There is no class, no schema, no validation. It is a
tree of arrays until \`\\Drupal\\Core\\Render\\Renderer::render()\` walks it.

### Why laziness is the point

In Symfony, \`return $this->render('page.html.twig', [...])\` runs Twig
*immediately* and hands you a finished \`Response\`. A string is opaque: nobody
downstream can reorder it, prune it, or cache half of it.

Drupal returns the *recipe* instead. Because the tree is still data at the end
of your controller, \`hook_preprocess_HOOK\`, \`hook_ENTITY_TYPE_view_alter\` and
\`hook_element_info_alter\` can all mutate it, \`#cache\` metadata can bubble
upward from children to parent, and \`#lazy_builder\` placeholders can be filled
in *after* a cached shell is served. Eager rendering forecloses all of that.

### The properties that carry the load

\`#type\` names a **render element plugin**; its \`getInfo()\` defaults are merged
into your array (once — the Renderer flags it with \`#defaults_loaded\`), so
\`['#type' => 'table']\` arrives pre-wired with a \`#theme\`, \`#pre_render\` and
\`#process\` callbacks. In Drupal 10.3+ and 11 those plugins use
\`#[RenderElement]\` / \`#[FormElement]\` attributes and extend
\`RenderElementBase\` / \`FormElementBase\`; the old annotations still work in 10
but are deprecated.

\`#theme\` names a **theme hook** from \`hook_theme()\` and hands the element's
properties to a Twig template as variables. \`#markup\` is a short HTML string.
\`#prefix\` / \`#suffix\` wrap whatever came out. \`#weight\` orders siblings.
\`#access\` (\`FALSE\`, or an \`AccessResultInterface\`) prunes the element and its
whole subtree. \`#attached\` and \`#cache\` carry libraries and cacheability.

### The security fork

This is the part interviewers probe. \`Renderer::ensureMarkupIsSafe()\` runs:

- **\`#plain_text\`** wins if set: the value goes through \`Html::escape()\`. Every
  tag becomes text. This is the correct default for anything a user typed.
- **\`#markup\`** otherwise — **but only when the value is not already a
  \`MarkupInterface\`**. A plain string is filtered with \`Xss::filter()\` against
  \`Xss::getAdminTagList()\` — roughly 70 tags, but **not** \`script\`, \`style\`,
  \`iframe\`, \`object\`, \`form\` or \`input\`, and \`on*\` attributes are stripped.
  Set \`#allowed_tags\` to narrow or widen that list. Silent tag loss here is a
  classic "why did my \`<video>\` disappear" bug.
  The branch is literally \`elseif (!$elements['#markup'] instanceof
  MarkupInterface)\`, so anything already wrapped as safe markup —
  \`Markup::create()\`, \`t()\` output — is trusted and passes through
  **unfiltered**. \`'#markup' => Markup::create($user_input)\` is the classic
  way to hand yourself an XSS bug: \`#markup\` is a filter you can opt out of,
  not a sanitiser you can lean on.
- **\`#theme\`** gives you full control: Twig 3 autoescapes \`{{ var }}\` per
  variable, so you decide field by field.

### Sorting

\`Element::children($build, TRUE)\` collects the non-\`#\` keys and sorts them —
but **only if at least one child declares a \`#weight\`**. It then rewrites the
children back in order and sets \`#sorted => TRUE\` so a later pass doesn't
re-sort. Lower weights float up; PHP 8's stable \`uasort\` keeps declaration
order for ties.
`,

  comparisons: [
    {
      label: "A finished string vs a tree that is still data",
      intro:
        "Both controllers produce the same incident list page. The Symfony one is done rendering when it returns; the Drupal one has not rendered anything yet.",
      php: `<?php // Symfony 6.4 / 7 controller
namespace App\\Controller;

use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;

final class IncidentController extends AbstractController
{
    #[Route('/incidents', name: 'incident_list')]
    public function list(): Response
    {
        // Twig runs HERE. What comes back is a
        // Response wrapping a finished HTML string.
        return $this->render('incident/list.html.twig', [
            'heading'   => 'Open incidents',
            'incidents' => $this->repo->findOpen(),
        ]);
    }
}
// Nothing downstream can reorder, prune or
// partially cache that string.`,
      ts: `<?php // incident_tracker/src/Controller/IncidentController.php
namespace Drupal\\incident_tracker\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;

final class IncidentController extends ControllerBase {

  public function list(): array {
    return [
      '#type' => 'container',          // element plugin defaults
      '#attributes' => ['class' => ['incident-list']],
      'heading' => [                    // a CHILD (no leading #)
        '#type' => 'html_tag',
        '#tag' => 'h2',
        '#value' => $this->t('Open incidents'),
        '#weight' => -10,
      ],
      'rows' => [
        '#theme' => 'incident_list',    // a theme hook + template
        '#incidents' => $this->repo->findOpen(),
        '#weight' => 0,
      ],
      '#cache' => ['tags' => ['node_list:incident']],
    ];
  }
}
// Still an array. The Renderer walks it later.`,
      note:
        "Same page, opposite timing. Symfony renders eagerly to a string; Drupal returns a recipe that hooks can alter and the render cache can slice up before anything becomes HTML.",
    },
    {
      label: "Getting untrusted text onto the page",
      intro:
        "An incident title typed by a reporter, plus a short blob of editor-authored HTML. Twig makes the escaping decision per variable; render arrays make it per property.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# templates/incident/list.html.twig — Twig 3 #}

{# Autoescaped: <script> becomes &lt;script&gt; #}
<h3>{{ incident.title }}</h3>

{# You opt OUT explicitly, and own the consequences: #}
<div class="body">{{ incident.bodyHtml|raw }}</div>

{# Or filter first, in PHP, before it reaches Twig:
   $safe = $purifier->purify($incident->getBodyHtml()); #}`,
      ts: `<?php
$build['title'] = [
  // Html::escape() — every tag becomes visible text.
  // The right default for anything a human typed.
  '#plain_text' => $incident->label(),
];

$build['body'] = [
  // Xss::filter() against Xss::getAdminTagList():
  // ~70 tags allowed; script/style/iframe/object/form
  // /input are NOT, and on* attributes are stripped.
  '#markup' => $incident->get('body')->value,
];

$build['clip'] = [
  '#markup' => '<video><source src="/x.webm"></video>',
  // Widen or narrow the allow-list per element.
  // Without this, <video> is silently removed.
  '#allowed_tags' => ['video', 'source'],
];

// If BOTH are set, #plain_text wins and
// #markup + #allowed_tags are ignored entirely.`,
      note:
        "#plain_text escapes, #markup filters against an allow-list you can override with #allowed_tags, #theme hands the decision to Twig's per-variable autoescaping. Choose deliberately — the failure mode of #markup is silent tag loss, and of |raw is XSS.",
    },
    {
      label: "#type vs #theme vs #markup",
      intro:
        "Three ways to emit one severity badge. The Twig side shows the closest Symfony analogue — an include with defaults — for the #type case.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# Symfony: reuse = include/embed a partial. #}
{{ include('_badge.html.twig', {
     severity: 'critical',
     label: 'Critical',
   }) }}

{# _badge.html.twig supplies its own defaults: #}
{% set severity = severity|default('low') %}
<span class="sev sev--{{ severity }}">{{ label }}</span>

{# There is no registry: the template path IS
   the contract, and nothing can swap it out
   without editing the caller or overriding the
   file in a child bundle's templates/ dir. #}`,
      ts: `<?php
// 1. #markup — no template, no plugin, filtered HTML.
$build['a'] = ['#markup' => '<span class="sev">Critical</span>'];

// 2. #theme — a hook from incident_tracker.module's
//    hook_theme(); incident_theme can override the
//    template, and hook_preprocess_incident_badge()
//    can add variables.
$build['b'] = [
  '#theme' => 'incident_badge',
  '#severity' => 'critical',
  '#label' => $this->t('Critical'),
];

// 3. #type — an element PLUGIN. Its getInfo() merges
//    in defaults (#theme, #pre_render, #attached...)
//    before anything renders.
$build['c'] = [
  '#type' => 'html_tag',
  '#tag' => 'span',
  '#attributes' => ['class' => ['sev', 'sev--critical']],
  '#value' => $this->t('Critical'),
];

// 4. Drupal 10.1+/11, SDC: a component with a schema.
$build['d'] = [
  '#type' => 'component',
  '#component' => 'incident_theme:incident-badge',
  '#props' => ['severity' => 'critical', 'label' => 'Critical'],
];`,
      note:
        "#type brings plugin defaults and is themeable and alterable; #theme is a template contract other modules and your theme can hook into; #markup is a dead-end string. If both #theme and #markup are set on one element, #markup is ignored.",
    },
    {
      label: "Injecting into someone else's output",
      intro:
        "Add an 'Escalate' link to a page rendered by a module you do not own, positioned after the title. This is the payoff for staying lazy.",
      php: `<?php // Symfony: the string is already built.
namespace App\\EventListener;

use Symfony\\Component\\EventDispatcher\\Attribute\\AsEventListener;
use Symfony\\Component\\HttpKernel\\Event\\ResponseEvent;

#[AsEventListener(event: 'kernel.response')]
final class EscalateLinkListener
{
    public function __invoke(ResponseEvent $event): void
    {
        $html = $event->getResponse()->getContent();
        // String surgery on finished HTML.
        $html = str_replace(
            '</h2>',
            '</h2><a href="/escalate">Escalate</a>',
            $html,
        );
        $event->getResponse()->setContent($html);
    }
}
// Brittle: depends on markup you don't control,
// and there is no "after the title" concept left.
// The real fix is overriding the template file.`,
      ts: `<?php // incident_tracker.module — the tree is still data.

use Drupal\\Core\\Access\\AccessResult;
use Drupal\\Core\\Url;

function incident_tracker_preprocess_incident_list(array &$variables): void {
  // Add a CHILD; #weight decides where it lands.
  $variables['actions']['escalate'] = [
    '#type' => 'link',
    '#title' => t('Escalate'),
    '#url' => Url::fromRoute('incident_tracker.escalate'),
    '#weight' => -5,
    // Prune it for users who can't act on it. An AccessResult
    // rather than a raw bool: doRender() calls
    // addCacheableDependency() on it, so the user.permissions
    // cache context bubbles up and the cached subtree can't be
    // served to someone with the opposite permission.
    '#access' => AccessResult::allowedIfHasPermission(
      \\Drupal::currentUser(), 'escalate incidents'),
    '#attached' => [
      'library' => ['incident_tracker/escalate'],
    ],
  ];
}`,
      note:
        "No string parsing, no ordering guesswork: you add a keyed child and give it a #weight. #access FALSE removes the element and everything under it, and an AccessResult object also bubbles its cacheability into the parent.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A miniature Renderer::doRender() in pure PHP — #access pruning, #type defaults, weight sorting with the #sorted flag, and the #plain_text / #markup / #theme fork. Read it, predict the exact HTML and the final child order, then run it.",
    code: `<?php
// A miniature Renderer::doRender(). Same rules Drupal uses, ~40 lines.

// Xss::getAdminTagList() is ~70 tags long; this is a representative slice.
// Note what is NOT on it: script, style, iframe, object, form, input.
const ADMIN_TAGS = ['a', 'em', 'strong', 'code', 'h2', 'p', 'ul', 'li', 'br'];

/** Stand-in for ElementInfoManager::getInfo() — the plugin's getInfo() defaults. */
function element_info(string $type): array {
  return match ($type) {
    'container' => ['#theme' => 'ic_container', '#attributes' => ['class' => ['ic-wrap']]],
    default => [],
  };
}

/** Stand-in for the theme registry: a theme hook and the template it runs. */
function theme_render(string $hook, array $el): string {
  return match ($hook) {
    // {{ children }} is already safe markup; {{ label }} is autoescaped by Twig.
    'ic_container' => '<div class="' . implode(' ', $el['#attributes']['class']) . '">' . $el['#children'] . '</div>',
    'incident_badge' => '<span class="sev sev--' . $el['#severity'] . '">'
      . htmlspecialchars($el['#label'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</span>',
    default => $el['#children'],
  };
}

/** Element::children($el, TRUE): every key without a '#', sorted by #weight. */
function children(array &$el): array {
  $kids = [];
  $sortable = FALSE;
  foreach ($el as $k => $v) {
    if ($k === '' || $k[0] === '#') continue;
    $kids[$k] = $v;
    if (isset($v['#weight'])) $sortable = TRUE;
  }
  // Only sorts if at least one child declares a #weight, and only once.
  if ($sortable && empty($el['#sorted'])) {
    uasort($kids, fn($a, $b) => ($a['#weight'] ?? 0) <=> ($b['#weight'] ?? 0));
    // Write the children back in the new order, then flag it so a second pass
    // (a preprocess hook, say) sees the same order without re-sorting.
    foreach ($kids as $k => $child) {
      unset($el[$k]);
      $el[$k] = $child;
    }
    $el['#sorted'] = TRUE;
  }
  return array_keys($kids);
}

function render_el(array &$el): string {
  // 1. #access FALSE prunes this element AND everything under it.
  if (isset($el['#access']) && $el['#access'] === FALSE) return '';

  // 2. #type merges in the element plugin's getInfo() defaults, once.
  if (isset($el['#type']) && empty($el['#defaults_loaded'])) {
    $el += element_info($el['#type']);
    $el['#defaults_loaded'] = TRUE;
  }

  // 3. Recurse into the children, in weight order.
  $el['#children'] = '';
  foreach (children($el) as $key) {
    $el['#children'] .= render_el($el[$key]);
  }

  // 4. The security decision, in the order ensureMarkupIsSafe() applies it.
  if (isset($el['#plain_text'])) {
    $el['#children'] = htmlspecialchars($el['#plain_text'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . $el['#children'];
  }
  elseif (isset($el['#markup'])) {
    $tags = $el['#allowed_tags'] ?? ADMIN_TAGS;
    $el['#children'] = strip_tags($el['#markup'], $tags) . $el['#children'];
  }

  // 5. #theme owns the final markup; #prefix/#suffix wrap whatever came out.
  if (isset($el['#theme'])) {
    $el['#children'] = theme_render($el['#theme'], $el);
  }
  return ($el['#prefix'] ?? '') . $el['#children'] . ($el['#suffix'] ?? '');
}

$build = [
  '#type' => 'container',
  '#prefix' => '<section id="incidents">',
  '#suffix' => '</section>',
  'summary' => [
    '#markup' => '<p>3 open</p><script>steal()</script>',
    '#weight' => 10,
  ],
  'title' => [
    '#markup' => '<h2>Open incidents</h2>',
    '#weight' => -10,
  ],
  'badge' => [
    '#theme' => 'incident_badge',
    '#severity' => 'critical',
    '#label' => '<b>Critical</b>',
    '#weight' => 0,
  ],
  'note' => [
    '#plain_text' => '<em>raw</em> title typed by a user',
    '#weight' => 5,
  ],
  'internal' => [
    '#markup' => 'On-call pager number',
    '#access' => FALSE,
    '#weight' => -20,
  ],
];

echo render_el($build), "\\n";
echo "child order: ", implode(', ', children($build)), "\\n";
var_export($build['#sorted']);
echo "\\n";`,
    output: `<section id="incidents"><div class="ic-wrap"><h2>Open incidents</h2><span class="sev sev--critical">&lt;b&gt;Critical&lt;/b&gt;</span>&lt;em&gt;raw&lt;/em&gt; title typed by a user<p>3 open</p>steal()</div></section>
child order: internal, title, badge, note, summary
true`,
  },

  keyPoints: [
    "One rule splits the whole structure: keys beginning with `#` are properties (directives); every other key is a child, and children are render arrays too.",
    "Children render in `#weight` order — but `Element::children()` only sorts when at least one child declares a `#weight`, then rewrites them in order and sets `#sorted => TRUE`. `#access` FALSE (or a denied AccessResult) prunes the element and its entire subtree.",
    "`#plain_text` runs `Html::escape()`; `#markup` runs `Xss::filter()` against `Xss::getAdminTagList()` (no script/style/iframe/object/form/input) unless you override `#allowed_tags` — and only when the value is not already a `MarkupInterface`, so `Markup::create($user_input)` skips filtering entirely and is a live XSS hole; `#theme` hands escaping to Twig 3 per variable. `#plain_text` beats `#markup` when both are set.",
    "`#type` names an element plugin whose `getInfo()` defaults are merged in once (flagged by `#defaults_loaded`); `#theme` names a theme hook and template; `#markup` is a bare string with no template and no plugin. `#theme` set together with `#markup` makes `#markup` dead weight.",
    "Nothing is HTML until `Renderer::render()` walks the tree — that lateness is what enables preprocess/alter hooks, bubbling `#cache` metadata, `#attached` libraries and `#lazy_builder` placeholders.",
    "Version notes: Drupal 10.3+/11 element plugins use `#[RenderElement]`/`#[FormElement]` attributes on `RenderElementBase`/`FormElementBase`; SDC (10.1+, stable from 10.3) adds `['#type' => 'component', '#component' => 'theme:name', '#props' => [...]]` as a schema-validated alternative to `#theme`.",
  ],

  interview: [
    {
      q: "Why does a Drupal controller return an array instead of a rendered Response like a Symfony controller does?",
      a: "Because a string is opaque and an array is still data. `$this->render()` in Symfony runs Twig immediately, so by the time the value leaves the method the markup is fixed — the only way to change it is template overrides or string surgery in a `kernel.response` listener. Drupal defers rendering to `Renderer::render()`, which runs late in the request, so between your controller and the HTML there is a window where `hook_preprocess_HOOK`, `hook_ENTITY_TYPE_view_alter` and `hook_element_info_alter` can add, reorder or remove elements. That same window is what lets `#cache` metadata bubble from children to parent so subtrees can be cached independently, and lets `#lazy_builder` placeholders be substituted into an otherwise cached page. The cost is indirection; the payoff is that altering and caching are possible at all.",
    },
    {
      q: "What is the difference between `#markup`, `#plain_text` and `#theme`, and how do you choose?",
      a: "`#plain_text` runs the value through `Html::escape()`, so every tag becomes visible text — that is the correct choice for anything a user typed, like an incident title. `#markup` runs `Xss::filter()` against `Xss::getAdminTagList()`, roughly 70 tags that deliberately exclude `script`, `style`, `iframe`, `object`, `form` and `input`, and it strips `on*` handlers; set `#allowed_tags` on the element to narrow or widen that list. The catch worth naming is that the filter is conditional: `ensureMarkupIsSafe()` only calls `Xss::filter()` inside an `elseif (!$elements['#markup'] instanceof MarkupInterface)` branch, so a value that is already safe markup — `Markup::create()` or `t()` output — is trusted and passes through untouched. That makes `'#markup' => Markup::create($user_input)` a direct XSS hole, which is why I treat `#markup` as an opt-out filter rather than a sanitiser. `#theme` hands the properties to a Twig template, where Twig 3's autoescaping applies per variable, so you decide field by field and other modules can preprocess the variables. Order of precedence matters: `Renderer::ensureMarkupIsSafe()` checks `#plain_text` first, so if both are set `#markup` and `#allowed_tags` are ignored. My rule is `#plain_text` for user data, `#theme` for anything with structure, and `#markup` only for a short trusted fragment.",
    },
    {
      q: "You added an element to a render array but it renders in the wrong place, or not at all. How do you debug it?",
      a: "First check whether it is a child at all — a typo like `'#escalate'` instead of `'escalate'` makes it a property, and properties are never rendered as children. Then check `#weight`: `Element::children()` only sorts when at least one sibling declares a `#weight`, so adding a weight to just your element is usually the fix, and if a parent already set `#sorted => TRUE` your late addition can be skipped by the sort entirely. If it disappears completely, look at `#access` — `FALSE` or a denied `AccessResultInterface` prunes the element and its whole subtree silently. If the markup is there but tags vanished, it is `Xss::filter()` on `#markup` dropping tags outside the admin tag list, which `#allowed_tags` fixes. Enabling Twig debug and `kint()`/`dpm()` from Devel on the build array is the fastest way to see the tree as the Renderer sees it.",
    },
  ],

  quiz: [
    {
      question:
        "An element has both `'#theme' => 'incident_badge'` and `'#markup' => '<b>Critical</b>'`. What renders?",
      options: [
        "The #markup string, then the theme hook's output appended after it",
        "Only the incident_badge template's output — #markup is ignored",
        "Only the #markup string — #theme is only used when #markup is absent",
        "A RuntimeException, because the two properties conflict",
      ],
      answerIndex: 1,
      explain:
        "When a theme hook is implemented for the element, the template's output becomes the element's children and the raw `#markup` fallback is never prepended. `#markup` only acts as the fallback body for elements with no `#theme`, so setting both is dead weight and a common source of 'why isn't my string showing' confusion.",
    },
    {
      question:
        "A build array has children `a`, `b` and `c` in that order, and none of them declares a `#weight`. In what order do they render?",
      options: [
        "Alphabetically by key: a, b, c",
        "Declaration order: a, b, c — no sort runs at all",
        "Undefined, because unweighted children are sorted arbitrarily",
        "Reverse declaration order: c, b, a",
      ],
      answerIndex: 1,
      explain:
        "`Element::children($build, TRUE)` skips the sort entirely unless at least one child has a `#weight` key, so the array's natural order is preserved. Once any sibling declares a weight the sort kicks in for all of them (missing weights count as 0), the children are rewritten in order, and `#sorted => TRUE` is set so later passes don't re-sort.",
    },
    {
      question:
        "You need to output an incident title that a reporter typed, which may contain `<script>` or stray angle brackets. Which property is correct?",
      options: [
        "'#markup' — Xss::filter() already strips script tags",
        "'#plain_text' — Html::escape() turns every tag into visible text",
        "'#markup' with '#allowed_tags' => [] ",
        "'#prefix'/'#suffix' around the raw string",
      ],
      answerIndex: 1,
      explain:
        "`#plain_text` is the property designed for untrusted input: it escapes the whole value with `Html::escape()`, so a title of `<script>x</script>` displays literally rather than being silently rewritten. `#markup` would strip the script tag but leave its text content and would still allow ~70 other tags, which changes what the user actually wrote — filtering is not the same as escaping.",
    },
  ],
};

export default lesson;
