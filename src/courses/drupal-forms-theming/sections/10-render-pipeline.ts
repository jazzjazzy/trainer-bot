import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "render-pipeline",
  title: "The Render Pipeline: How Arrays Become HTML",
  part: "Render Arrays & the Render Pipeline",
  estMinutes: 13,
  summary:
    "Follow Renderer::renderRoot() depth-first through #access, element defaults, #pre_render, weighted children, #theme, #post_render and #prefix/#suffix — and see how #attached and #cache bubble back to the response.",

  concept: `
## renderRoot() is one depth-first walk with hooks at every step

Your controller hands back an array; something has to turn it into a string.
That something is the \`renderer\` service (\`Drupal\\Core\\Render\\Renderer\`),
and \`renderRoot()\` is the entry point. It opens a fresh **render context** — a
stack of \`BubbleableMetadata\` — and recurses.

### The order, for every element

\`doRender()\` always does the same things in the same order:

1. **#access.** \`FALSE\` returns \`''\` immediately — nothing below is built.
   If it is an \`AccessResultInterface\`, its cacheability bubbles *first*, then
   the short-circuit: a denied element still teaches the page that it varies.
2. **Render cache lookup**, when \`#cache['keys']\` is set. A hit skips
   everything below it.
3. **Element info defaults**: \`$elements += $this->elementInfo->getInfo($elements['#type'])\`.
   The element plugin's \`getInfo()\` supplies \`#theme\`, \`#pre_render\`,
   \`#process\`, \`#attached\`. \`+=\` never overwrites — so setting
   \`#pre_render\` yourself *replaces* the plugin's list instead of adding to it.
4. **#lazy_builder**, if present: built now, or swapped for a placeholder.
5. **#pre_render** callbacks, in order, each receiving and returning the whole
   element array.
6. **Children**, via \`Element::children($elements, TRUE)\` — the \`TRUE\` sorts
   by \`#weight\` (missing weight counts as 0).
7. **#theme.** If set, the theme hook (preprocess + template) produces
   \`#children\`, and it owns rendering its own children — Twig auto-renders any
   render array you print. Only when there is **no** \`#theme\` does the renderer
   concatenate children itself.
8. **#theme_wrappers**, each wrapping the finished \`#children\`.
9. **#post_render**, which receives the *string* plus the element — the only
   callback that ever sees markup.
10. **#prefix / #suffix** concatenated outermost; then \`#markup\` is set and
    \`#printed = TRUE\`.

All the way up, \`#attached\` and \`#cache\` bubble into the render context, so
the root owns the union of every library, tag, context and max-age in the tree.

### Callbacks must be trusted

Since Drupal 9, a \`#pre_render\`, \`#post_render\` or \`#lazy_builder\`
callback must be a method on a class implementing \`TrustedCallbackInterface\`
and named in its static \`trustedCallbacks()\`. That holds however you *spell*
the callback — \`[IncidentCard::class, 'severityClass']\`,
\`'IncidentCard::severityClass'\`, or the \`service_id:method\` form that
\`#lazy_builder\` uses. The service string is notation, not an exemption:
\`Renderer::doCallback()\` hands it to the callable resolver, gets back
\`[$service, 'method']\`, and *then* runs the identical trust check — so the
service's class must implement the interface too. Core's
\`comment.lazy_builders\` service class, \`CommentLazyBuilders\`, implements
\`TrustedCallbackInterface\` and returns \`['renderLinks', 'renderForm']\` for
exactly this reason. Anything else throws \`UntrustedCallbackException\` — the
one other accepted form is an anonymous function, which *is* trusted but cannot
be serialized, so it breaks the moment the element is render-cached.
\`RenderCallbackInterface\` is the blunt version: implement it and every public
method counts as trusted. The rule exists because render arrays are cached and
can be rebuilt from stored, user-influenced data — an arbitrary callable there
is remote code execution.

### renderRoot vs render vs renderInIsolation

- \`renderRoot()\` — root call, new context; bubbled assets land on
  \`$build['#attached']\` for the response. Nested inside another one it throws
  \`LogicException\`: *A stray renderRoot() invocation is causing bubbling of
  attached assets to break.*
- \`render()\` — legal only inside an existing render context.
- \`renderInIsolation()\` (Drupal 10.3+; \`renderPlain()\` before that,
  deprecated and removed in 12) — isolated context, nothing bubbles to the
  current page. Right for an email body or a string stuffed into JSON; copy the
  metadata by hand if it matters.

### The main-content pipeline

Controller returns an array → \`MainContentViewSubscriber\` picks a main-content
renderer from \`_wrapper_format\` (default \`html\` → \`HtmlRenderer\`) → the
array is wrapped by a page display variant into \`#type: 'page'\`
(\`page.html.twig\`), then \`#type: 'html'\` (\`html.html.twig\`) → one
\`renderRoot()\` → an \`HtmlResponse\` whose attachments processor fills the
head/CSS/JS placeholders. Symfony's controller → Twig → Response is three
steps; Drupal's extra machinery is what buys alterability, per-fragment cache
metadata, asset aggregation and BigPipe without any controller opting in.
`,

  comparisons: [
    {
      label: "What the controller returns",
      intro:
        "Both routes list incidents. Symfony renders Twig to a string and returns a Response. Drupal returns an unrendered array and lets the pipeline decide what happens to it.",
      php: `<?php
// Symfony: render() -> string -> Response. The pipeline is over.
namespace App\\Controller;

use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;

class IncidentController extends AbstractController
{
    #[Route('/incidents', name: 'app_incident_list')]
    public function list(IncidentRepository $incidents): Response
    {
        // Twig extends base.html.twig, so this string IS the page.
        return $this->render('incident/list.html.twig', [
            'incidents' => $incidents->findRecent(20),
        ]);
    }
}`,
      ts: `<?php
// Drupal: return an ARRAY. Nothing is rendered yet, so hooks,
// the render cache and the theme layer can still change it.
namespace Drupal\\incident_tracker\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;

class IncidentController extends ControllerBase {

  public function list(): array {
    return [
      '#theme' => 'incident_list',
      '#incidents' => $this->repository->recent(20),
      '#attached' => ['library' => ['incident_theme/incident-list']],
      '#cache' => [
        'tags' => ['node_list:incident'],
        'contexts' => ['user.permissions'],
      ],
    ];
  }

}

/* Then, without you doing anything:
 *   MainContentViewSubscriber (kernel.view)
 *     -> main_content_renderer.html (HtmlRenderer), chosen by
 *        _wrapper_format; drupal_ajax/drupal_dialog/drupal_modal
 *        pick the AJAX/dialog renderers instead
 *     -> page display variant wraps it as #type: 'page'
 *     -> #type: 'html'  (hook_page_attachments, page_top/page_bottom)
 *     -> renderer->renderRoot()
 *     -> HtmlResponse + HtmlResponseAttachmentsProcessor
 * Return a Response object instead and you skip ALL of it. */`,
      note:
        "Returning an array is what makes hook_preprocess, template suggestions, the render cache and BigPipe possible — none of them can touch a string. Return a Response (e.g. JsonResponse, or a BinaryFileResponse for a download) when you deliberately want out of the pipeline.",
    },
    {
      label: "Render callbacks must be trusted",
      intro:
        "Symfony will happily call any callable you hand it. Drupal refuses to call a #pre_render/#post_render/#lazy_builder callback unless the class has explicitly declared it safe.",
      php: `<?php
// Symfony: a Twig filter/function is registered on a runtime
// class. Any callable is fine -- nothing is serialized, so
// nothing can smuggle a callable back in later.
namespace App\\Twig;

use Twig\\Extension\\AbstractExtension;
use Twig\\TwigFilter;

class IncidentExtension extends AbstractExtension
{
    public function getFilters(): array
    {
        return [
            new TwigFilter('severity_class', [$this, 'severityClass']),
            // Or even: new TwigFilter('x', 'strtoupper')
        ];
    }

    public function severityClass(string $severity): string
    {
        return 'card--' . $severity;
    }
}`,
      ts: `<?php
// Drupal: render arrays are CACHED, so a callable stored in one
// is an RCE vector. Declare it or it throws.
namespace Drupal\\incident_tracker\\Render;

use Drupal\\Core\\Security\\TrustedCallbackInterface;

class IncidentCard implements TrustedCallbackInterface {

  public static function severityClass(array $element): array {
    $element['#attributes']['class'][] = 'card--' . $element['#severity'];
    return $element;
  }

  public static function stripInternalNotes(string $html, array $element): string {
    return str_replace('[internal]', '', $html);
  }

  public static function trustedCallbacks(): array {
    return ['severityClass', 'stripInternalNotes'];
  }

}

// Usage -- both forms are accepted:
$build['#pre_render'][] = [IncidentCard::class, 'severityClass'];
$build['#post_render'][] = [IncidentCard::class, 'stripInternalNotes'];
// #lazy_builder takes a service string -- same rule, different spelling:
// it resolves to [$service, 'summary'], so IncidentLazyBuilders (the class
// behind the incident_tracker.lazy_builders service) must ALSO implement
// TrustedCallbackInterface and list 'summary' in trustedCallbacks().
$build['#lazy_builder'] = ['incident_tracker.lazy_builders:summary', [42]];

// Anything else -> \\Drupal\\Core\\Security\\UntrustedCallbackException.
// Blunt alternative: implement RenderCallbackInterface and EVERY
// public method on the class is trusted (no trustedCallbacks()).`,
      note:
        "The service:method string form ('my_module.service:method') is what #lazy_builder wants, because a lazy builder must be re-invocable from a cached placeholder with only scalar arguments. It does not exempt you from the trust check: doCallback() resolves the string to [$service, 'method'] first and then runs the identical check, so the service's class still has to implement TrustedCallbackInterface and name the method. Enforced since Drupal 9 — 8.x only triggered a deprecation.",
    },
    {
      label: "Rendering a fragment to a string outside a page",
      intro:
        "You need HTML for an email body. Symfony just calls the Twig environment. In Drupal, the wrong method either throws or silently loses cache metadata.",
      php: `<?php
// Symfony: render a template to a string anywhere, any time.
// There is no ambient "render context" to corrupt.
$html = $this->twig->render('mail/incident.html.twig', [
    'incident' => $incident,
]);

$email = (new Email())
    ->to($assignee->getEmail())
    ->subject('Incident assigned')
    ->html($html);

$this->mailer->send($email);`,
      ts: `<?php
// Drupal: pick the method by which context you are in.
$build = [
  '#theme' => 'incident_summary',
  '#incident' => $incident,
  '#cache' => ['tags' => ['node:' . $incident->id()]],
];

// (a) Inside a request that is already rendering a page --
//     renderRoot() here throws LogicException("A stray
//     renderRoot() invocation is causing bubbling of attached
//     assets to break."). Isolate instead:
$html = $this->renderer->renderInIsolation($build);   // 10.3+

// Supporting 10.2 as well? Bridge the rename:
use Drupal\\Component\\Utility\\DeprecationHelper;
$html = DeprecationHelper::backwardsCompatibleCall(
  currentVersion: \\Drupal::VERSION,
  deprecatedVersion: '10.3',
  currentCallable: fn() => $this->renderer->renderInIsolation($build),
  deprecatedCallable: fn() => $this->renderer->renderPlain($build),
);

// (b) Building a Response yourself, outside any render context:
$html = $this->renderer->renderRoot($build);
$response = new CacheableResponse($html);
$response->addCacheableDependency(
  CacheableMetadata::createFromRenderArray($build)
);`,
      note:
        "renderInIsolation() (the 10.3 rename of renderPlain(), which is removed in Drupal 12) throws away bubbled metadata on purpose — nothing leaks into the page you are in the middle of building. That also means nothing is collected for you: if the fragment's cache tags matter, read them off $build yourself. Plain renderer->render() outside a context is a LogicException.",
    },
    {
      label: "The page wrapper: base.html.twig vs html + page",
      intro:
        "Where do <html>, the <head> and the regions come from? Symfony: template inheritance you write. Drupal: two theme hooks the pipeline wraps around your output.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# templates/base.html.twig -- YOU wrote this, and every
   template opts in with {% extends 'base.html.twig' %}. #}
<!DOCTYPE html>
<html>
  <head>
    <title>{% block title %}Incidents{% endblock %}</title>
    {{ encore_entry_link_tags('app') }}
    {{ encore_entry_script_tags('app') }}
  </head>
  <body>
    {% block body %}{% endblock %}
  </body>
</html>

{# templates/incident/list.html.twig #}
{% extends 'base.html.twig' %}
{% block body %}
  {% for incident in incidents %}{{ incident.title }}{% endfor %}
{% endblock %}`,
      ts: `{# core html.html.twig (simplified) -- #type: 'html'.
   You never extend it; the pipeline wraps you in it. #}
<!DOCTYPE html>
<html{{ html_attributes }}>
  <head>
    <head-placeholder token="{{ placeholder_token }}">
    <title>{{ head_title|safe_join(' | ') }}</title>
    <css-placeholder token="{{ placeholder_token }}">
    <js-placeholder token="{{ placeholder_token }}">
  </head>
  <body{{ attributes }}>
    {{ page_top }}
    {{ page }}
    {{ page_bottom }}
    <js-bottom-placeholder token="{{ placeholder_token }}">
  </body>
</html>

{# page.html.twig -- #type: 'page'. Regions, filled by blocks.
   Your controller's array arrives as page.content. #}
<div class="layout-container">
  {{ page.header }}
  <main>{{ page.content }}</main>
  {{ page.footer }}
</div>`,
      note:
        "The *-placeholder tokens are literal strings in the rendered HTML; HtmlResponseAttachmentsProcessor replaces them with the aggregated <link>/<script> tags collected from every #attached in the tree — which is why a library attached three levels deep inside a block still ends up in <head>. Override page.html.twig in incident_theme, never html.html.twig, unless you truly need to change the document shell.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A 100-line Renderer that walks the same steps in the same order: #access, element info defaults, #pre_render, weight-sorted children, #theme, #theme_wrappers, #post_render, #prefix/#suffix — bubbling #attached and #cache into a render context as it goes. Note that 'draft' is declared first but denied, and 'queue' (#weight -5) is declared after 'lag' (#weight 10). Predict the HTML, the order, and which libraries reach the root — then run.",
    code: `<?php
// A 100-line Renderer: the same walk Drupal\\Core\\Render\\Renderer::doRender()
// performs. A render context collects #attached and #cache on the way up.

// --- ElementInfoManager::getInfo(): per-#type defaults, merged with +=.
// NOTE: 'incident_badge' here is a render ELEMENT plugin, so its theme hook is
// registered with 'render element' => 'element' (the whole element array is
// handed to the template), not with 'variables'. That is a different hook from
// the data hook 'incident_card', which incident_tracker_theme() declares with
// 'variables' => ['incident' => NULL, 'severity' => NULL, 'breached' => FALSE].
$element_info = [
    'container' => ['#theme_wrappers' => ['container']],
    'incident_badge' => [
        '#theme'      => 'incident_badge',
        '#pre_render' => ['IncidentCard::severityClass'],
        '#attached'   => ['library' => ['incident_tracker/card-behaviour']],
        '#cache'      => ['tags' => ['config:incident_tracker.settings']],
    ],
];

// --- TrustedCallbackInterface: only listed methods may be render callbacks.
class IncidentCard {
    public static function trustedCallbacks(): array {
        return ['severityClass', 'stripInternalNotes'];
    }
    public static function severityClass(array $element): array {
        $element['#class'] = 'card card--' . $element['#severity'];
        return $element;
    }
    public static function stripInternalNotes(string $html, array $element): string {
        return str_replace('[internal]', '', $html);
    }
}
// No trustedCallbacks() at all -> untrusted.
class LegacyHelper {
    public static function shout(array $element): array {
        return $element;
    }
}

function do_callback(string $property, string $callback, array $args) {
    [$class, $method] = explode('::', $callback);
    $trusted = method_exists($class, 'trustedCallbacks')
        ? $class::trustedCallbacks()
        : [];
    if (!in_array($method, $trusted, TRUE)) {
        throw new RuntimeException(
            "UntrustedCallbackException: {$callback} used as {$property} callback"
        );
    }
    return $class::$method(...$args);
}

// --- The theme registry: a template gets the element + a child renderer.
$templates = [
    'incident_badge' => function (array $el, callable $render): string {
        // {{ title }} then the children -- Twig auto-renders child arrays.
        $body = '';
        foreach ($el['#sorted'] as $key) {
            $body .= $render($el[$key]);
        }
        return '<article class="' . $el['#class'] . '"><h3>'
            . $el['#title'] . '</h3>' . $body . '</article>';
    },
    'container' => fn(array $el, callable $render): string =>
        '<div class="layout">' . $el['#children'] . '</div>',
];

// --- The render context every doRender() bubbles into.
$context = ['library' => [], 'tags' => [], 'contexts' => []];

function do_render(array &$el, array $element_info, array $templates, array &$context): string {
    // 1. #access -- FALSE short-circuits, nothing below is built. (A real
    //    AccessResultInterface bubbles its cacheability BEFORE returning.)
    if (isset($el['#access']) && $el['#access'] === FALSE) {
        return '';
    }
    // 2. Element info defaults for #type (+= never overwrites what you set).
    if (isset($el['#type'])) {
        $el += $element_info[$el['#type']];
    }
    // 3. #pre_render, in order, each returning the whole element.
    foreach ($el['#pre_render'] ?? [] as $callback) {
        $el = do_callback('#pre_render', $callback, [$el]);
    }
    // 4. Bubble this element's metadata into the current render context.
    foreach (['library'] as $k) {
        $context[$k] = array_merge($context[$k], $el['#attached'][$k] ?? []);
    }
    foreach (['tags', 'contexts'] as $k) {
        $context[$k] = array_merge($context[$k], $el['#cache'][$k] ?? []);
    }
    // 5. Children, sorted by #weight (Element::children($el, TRUE)).
    $children = array_filter(array_keys($el), fn($k) => !str_starts_with((string) $k, '#'));
    usort($children, fn($a, $b) => ($el[$a]['#weight'] ?? 0) <=> ($el[$b]['#weight'] ?? 0));
    $el['#sorted'] = $children;
    $render = function (array &$child) use ($element_info, $templates, &$context) {
        return do_render($child, $element_info, $templates, $context);
    };
    // 6. #theme owns its children; without #theme the renderer recurses itself.
    if (isset($el['#theme'])) {
        $el['#children'] = $templates[$el['#theme']]($el, $render);
    }
    else {
        $el['#children'] = $el['#markup'] ?? '';
        foreach ($children as $key) {
            $el['#children'] .= $render($el[$key]);
        }
    }
    // 7. #theme_wrappers wrap the already-rendered #children.
    foreach ($el['#theme_wrappers'] ?? [] as $wrapper) {
        $el['#children'] = $templates[$wrapper]($el, $render);
    }
    // 8. #post_render sees the string, not the array.
    foreach ($el['#post_render'] ?? [] as $callback) {
        $el['#children'] = do_callback('#post_render', $callback, [$el['#children'], $el]);
    }
    // 9. #prefix / #suffix, outermost of all.
    return ($el['#prefix'] ?? '') . $el['#children'] . ($el['#suffix'] ?? '');
}

// --- The build the controller returns.
$build = [
    '#type'     => 'container',
    '#prefix'   => '<section id="incidents">',
    '#suffix'   => '</section>',
    '#attached' => ['library' => ['incident_theme/global']],
    '#cache'    => ['tags' => ['node_list:incident'], 'contexts' => ['user.permissions']],
    'draft' => [
        '#access'   => FALSE,
        '#type'     => 'incident_badge',
        '#title'    => 'Unpublished draft',
        '#severity' => 'low',
    ],
    'lag' => [
        '#type'     => 'incident_badge',
        '#weight'   => 10,
        '#title'    => 'Replica lag',
        '#severity' => 'low',
        'note'      => ['#markup' => '<p>Recovered overnight.[internal]</p>'],
        '#post_render' => ['IncidentCard::stripInternalNotes'],
    ],
    'queue' => [
        '#type'     => 'incident_badge',
        '#weight'   => -5,
        '#title'    => 'Queue backlog',
        '#severity' => 'high',
        'note'      => ['#markup' => '<p>Exports stalled.</p>'],
    ],
];

// renderRoot(): render in a fresh context, then read the bubbled metadata.
$html = do_render($build, $element_info, $templates, $context);

echo "HTML:\\n" . $html . "\\n\\n";
echo "bubbled to root:\\n";
echo "  libraries: " . implode(', ', array_unique($context['library'])) . "\\n";
echo "  cache tags: " . implode(', ', array_unique($context['tags'])) . "\\n";
echo "  cache contexts: " . implode(', ', array_unique($context['contexts'])) . "\\n\\n";

// A callback the class never declared as trusted.
try {
    $bad = ['#type' => 'incident_badge', '#title' => 'x', '#severity' => 'low'];
    $bad['#pre_render'] = ['LegacyHelper::shout'];
    do_render($bad, $element_info, $templates, $context);
}
catch (RuntimeException $e) {
    echo $e->getMessage();
}`,
    output: `HTML:
<section id="incidents"><div class="layout"><article class="card card--high"><h3>Queue backlog</h3><p>Exports stalled.</p></article><article class="card card--low"><h3>Replica lag</h3><p>Recovered overnight.</p></article></div></section>

bubbled to root:
  libraries: incident_theme/global, incident_tracker/card-behaviour
  cache tags: node_list:incident, config:incident_tracker.settings
  cache contexts: user.permissions

UntrustedCallbackException: LegacyHelper::shout used as #pre_render callback`,
  },

  keyPoints: [
    "Per element, doRender() runs in a fixed order: #access, render-cache lookup, element info defaults (+=, so your values win and your #pre_render REPLACES the plugin's), #lazy_builder, #pre_render, weight-sorted children, #theme, #theme_wrappers, #post_render, #prefix/#suffix.",
    "#theme owns rendering its own children — the renderer only concatenates children itself when there is no #theme. #post_render is the only callback that receives a string instead of the element array.",
    "#attached and #cache bubble up the tree into the render context, so the root build ends up carrying every library, cache tag, context and max-age below it — that bubbling is the entire reason controllers return arrays instead of strings.",
    "Any #pre_render/#post_render/#lazy_builder callback must be a method on a class implementing TrustedCallbackInterface and listed in trustedCallbacks() (or on a class implementing RenderCallbackInterface, where all public methods count) — otherwise UntrustedCallbackException, enforced since Drupal 9. The 'service_id:method' string #lazy_builder uses is only notation: doCallback() resolves it to [$service, 'method'] and applies the same check, so the service class must implement the interface too (see CommentLazyBuilders).",
    "renderRoot() opens a fresh context and must not be nested (LogicException: 'A stray renderRoot() invocation is causing bubbling of attached assets to break'); render() requires an existing context; renderInIsolation() (Drupal 10.3+, replacing the deprecated renderPlain()) renders with no bubbling at all.",
    "Main-content pipeline: controller array -> MainContentViewSubscriber picks a renderer by _wrapper_format -> HtmlRenderer wraps it as #type page (page.html.twig) then #type html (html.html.twig) -> one renderRoot() -> HtmlResponse whose attachments processor fills the head/CSS/JS placeholders.",
  ],

  interview: [
    {
      q: "Walk me through what happens between a controller returning a render array and the browser receiving HTML.",
      a: "The controller's array is not a response, so `MainContentViewSubscriber` on `kernel.view` picks a main-content renderer from the request's `_wrapper_format` — `html` by default, giving `HtmlRenderer`; `drupal_ajax`, `drupal_dialog` and `drupal_modal` select the AJAX and dialog renderers instead. `HtmlRenderer` wraps the array in a page display variant (`#type: 'page'`, rendered by `page.html.twig`, with blocks filling the regions), then in `#type: 'html'` for `html.html.twig`, invoking `hook_page_attachments` and the `page_top`/`page_bottom` hooks along the way. That whole tree goes through a single `renderRoot()`, which walks it depth-first and bubbles every `#attached` and `#cache` entry to the root. Finally an `HtmlResponse` is built and `HtmlResponseAttachmentsProcessor` swaps the literal `<css-placeholder>`, `<js-placeholder>` and `<head-placeholder>` tokens for the aggregated asset tags. In Symfony the equivalent is over after `$this->render()` returns a `Response` — the extra Drupal steps are what let a block three levels down add a library to `<head>` and contribute cache tags to the page.",
    },
    {
      q: "What is TrustedCallbackInterface and why does Drupal enforce it?",
      a: "Render arrays can name callbacks in `#pre_render`, `#post_render` and `#lazy_builder`. Since those arrays are stored in the render cache and can be rebuilt from user-influenced data, a bare callable in one is effectively remote code execution — this was hardened in SA-CORE-2018-002 territory and enforced from Drupal 9. So the callback must be a method on a class implementing `Drupal\\Core\\Security\\TrustedCallbackInterface` and listed in its static `trustedCallbacks()`; `RenderCallbackInterface` is a marker that trusts every public method on the class. The `service_id:method` string that `#lazy_builder` takes is just callback notation, not an exemption — `Renderer::doCallback()` resolves it to `[$service, 'method']` through the callable resolver and then runs the same check, which is why core's `CommentLazyBuilders` (the `comment.lazy_builders` service) implements the interface and returns `['renderLinks', 'renderForm']`. Anything else throws `UntrustedCallbackException`, the one exception being an anonymous function, which is trusted but unserializable and so breaks render caching. In practice this is the first thing that breaks when porting old `#pre_render` code, and the fix is a two-line `trustedCallbacks()` method.",
    },
    {
      q: "When do you use renderRoot(), render(), and renderInIsolation()?",
      a: "`renderRoot()` is the root call: it opens a fresh render context, renders the tree, and leaves the bubbled `#attached`/`#cache` on the build so a response can consume it — use it when *you* are producing a response outside the main-content pipeline. It must never be nested; a second one throws `LogicException` about a stray `renderRoot()` breaking asset bubbling. Plain `render()` is only valid inside an existing render context, e.g. from a theme hook or a preprocess function. `renderInIsolation()` — Drupal 10.3's rename of `renderPlain()`, which is deprecated and removed in Drupal 12 — renders in an isolated context so nothing bubbles into the page you're already building; that makes it right for an email body or a string embedded in JSON, and it also means you're responsible for carrying the cache metadata yourself if it matters. If you need to support 10.2 and 10.3 in one codebase, bridge the rename with `DeprecationHelper::backwardsCompatibleCall()`.",
    },
    {
      q: "Coming from Symfony, why doesn't Drupal just render Twig in the controller and return a Response? What does the extra machinery buy?",
      a: "Deferring rendering keeps the output alterable and measurable. While it is still an array, `hook_preprocess`, `hook_theme_suggestions_alter`, block layout, contextual links, Views and any module's `hook_*_alter` can restructure it — none of which can touch a string. It also lets each fragment declare its own `#cache` (tags, contexts, max-age) and `#attached` libraries, which bubble to the root: that is what makes per-fragment render caching, dynamic page cache, asset aggregation and BigPipe placeholders work without every controller opting in. The cost is real — you cannot debug by reading the template alone, and you must learn where `#pre_render` sits relative to `#theme`. When none of that is worth it, return a `Response` (or `JsonResponse`) from your controller and Drupal steps out of the way entirely.",
    },
  ],

  quiz: [
    {
      question:
        "In a single element, which of these runs LAST during doRender()?",
      options: [
        "#pre_render callbacks",
        "The #theme hook's template",
        "#post_render callbacks",
        "#prefix and #suffix concatenation",
      ],
      answerIndex: 3,
      explain:
        "The order is #access, cache lookup, element defaults, #lazy_builder, #pre_render, children, #theme, #theme_wrappers, #post_render, then #prefix/#suffix wrapped around everything. That's why #post_render can rewrite the themed markup but cannot see the prefix and suffix — and why the prefix/suffix strings always end up outermost.",
    },
    {
      question:
        "You add '#pre_render' => [[MyHelper::class, 'tweak']] to a render array and get an UntrustedCallbackException. What is the fix?",
      options: [
        "Make tweak() non-static and use a service instead",
        "Have MyHelper implement TrustedCallbackInterface and return ['tweak'] from its static trustedCallbacks()",
        "Add the class to the module's services.yml with a render_callback tag",
        "Wrap the callback in a closure so the renderer cannot inspect it",
      ],
      answerIndex: 1,
      explain:
        "Since Drupal 9, render callbacks must be declared safe: implement Drupal\\Core\\Security\\TrustedCallbackInterface and list the method in trustedCallbacks(), or implement RenderCallbackInterface to trust every public method. A 'service_id:method' string (what #lazy_builder takes) is not a way out — it is resolved to [$service, 'method'] and trust-checked identically. A closure is actually trusted (anonymous functions bypass the check), but it is still the wrong answer: a render array containing a Closure cannot be serialized, so it fatals as soon as the element hits the render cache. And there is no render_callback service tag.",
    },
    {
      question:
        "Inside a #pre_render callback you need HTML for an email body. Which call is safe there on Drupal 10.3+?",
      options: [
        "$renderer->renderRoot($build) — it always works",
        "$renderer->render($build) — it starts its own context",
        "$renderer->renderInIsolation($build) — an isolated context, nothing bubbles",
        "(string) $build — render arrays cast to their markup",
      ],
      answerIndex: 2,
      explain:
        "You are already inside a render context, so renderRoot() throws LogicException ('A stray renderRoot() invocation is causing bubbling of attached assets to break'). renderInIsolation() — the Drupal 10.3 rename of renderPlain(), which is deprecated and removed in 12 — renders with no bubbling into the page, which is exactly what an email body needs; just remember its cache metadata is not collected for you.",
    },
    {
      question:
        "A block deep inside the page adds '#attached' => ['library' => ['incident_tracker/card-behaviour']]. How does that CSS reach <head>?",
      options: [
        "The theme must also list the library in incident_theme.info.yml under libraries",
        "It bubbles up the render tree to the root during renderRoot(), and HtmlResponseAttachmentsProcessor replaces the <css-placeholder> token in html.html.twig",
        "Drupal scans rendered markup for class names and loads matching libraries",
        "The block renders its own <link> tag inline where it sits in the page",
      ],
      answerIndex: 1,
      explain:
        "#attached (and #cache) bubble from every element up to the root of the render context. html.html.twig prints literal <head-placeholder>, <css-placeholder> and <js-placeholder> tokens, and HtmlResponseAttachmentsProcessor substitutes the aggregated asset tags collected from the whole tree. Listing the library in *.info.yml would load it on every page — the opposite of what you want for a single block.",
    },
  ],
};

export default lesson;
