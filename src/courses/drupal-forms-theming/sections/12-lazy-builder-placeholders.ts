import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "lazy-builder-placeholders",
  title: "#lazy_builder, Placeholders & BigPipe",
  part: "Render Arrays & the Render Pipeline",
  estMinutes: 13,
  summary:
    "Keep the outer page highly cacheable by replacing per-user fragments with placeholder tokens: \`#lazy_builder\` defers the build to a trusted callback with scalar-only arguments, auto-placeholdering does it for you when a fragment's cache metadata is poison, and BigPipe streams the replacements in after the shell.",

  concept: `
## One poisoned fragment kills the whole page

Cacheability bubbles. A single child with \`#cache['contexts'] => ['user']\` or
\`max-age => 0\` drags its metadata up through every ancestor, so the incident
dashboard — 95% identical for everyone — ends up cached per user, or not cached
at all. The fix is not "cache less"; it is to **cut the dynamic fragment out of
the tree** and leave a token in its place.

### #lazy_builder

\`\`\`php
$build['greeting'] = [
  '#lazy_builder' => ['incident_tracker.lazy_builders:greeting', [$this->currentUser->id()]],
  '#create_placeholder' => TRUE,
];
\`\`\`

The value is \`[callback, [args]]\` where the callback is usually
\`service_id:method\`. Two hard rules the renderer checks in
\`Renderer::doRender()\`:

- **The element may carry almost nothing else.** The supported keys are
  \`#lazy_builder\`, \`#cache\`, \`#create_placeholder\`, \`#lazy_builder_preview\`,
  \`#preview\` and — in Drupal 11 — \`#placeholder_strategy_denylist\`, plus
  \`#weight\` and \`#printed\` which the renderer sets itself. In practice that
  means no \`#prefix\`, \`#attached\`, \`#theme\` or \`#markup\`, and a sibling check
  forbids child elements too (*"no children can exist"*). Everything the
  fragment renders must come from the callback.
- **Arguments must be scalars or NULL.** Pass \`$node->id()\`, never \`$node\`.
  Otherwise: *"A #lazy_builder callback's context may only contain scalar values
  or NULL."* They have to survive being serialised into the placeholder token.

Both rules are enforced with \`assert()\`, not \`throw\` — that was Drupal 8's
behaviour. So breaking them trips an assertion (an \`AssertionError\` on a dev
site running \`zend.assertions=1\`, and *nothing at all* in production, where
\`zend.assertions=-1\` compiles the checks out). That asymmetry is exactly why you
should develop with assertions enabled: in production a malformed
\`#lazy_builder\` fails silently or weirdly instead of loudly. The one genuine
throw nearby is a \`\\LogicException\`: *"When #create_placeholder is set, a
#lazy_builder callback must be present as well."*

Rendering that element produces a token instead of markup:

\`\`\`html
<drupal-render-placeholder callback="incident_tracker.lazy_builders:greeting"
  arguments="0=42" token="c81f7355"></drupal-render-placeholder>
\`\`\`

The token goes into the (very cacheable) outer HTML; the real render array lands
in \`#attached['placeholders']\`. The fragment's own cache contexts stay with the
fragment and never bubble.

### Auto-placeholdering

You usually do not write \`#create_placeholder\`. Drupal decides, using
\`renderer.config\` from \`core.services.yml\`:

\`\`\`yaml
renderer.config:
  auto_placeholder_conditions:
    max-age: 0
    contexts: ['session', 'user']
    tags: []
\`\`\`

Any element that **has a \`#lazy_builder\`** and whose \`#cache\` hits one of those
conditions is placeholdered automatically. Note the precondition: no
\`#lazy_builder\`, no placeholder — a plain \`#markup\` element varying by
\`user\` simply poisons the page. \`'#create_placeholder' => FALSE\` opts out.

### Trusted callbacks

The builder class must implement
\`\\Drupal\\Core\\Security\\TrustedCallbackInterface\` and list the method in
\`trustedCallbacks()\`. Otherwise Drupal 10/11 throws an
\`UntrustedCallbackException\` — placeholder callbacks and their arguments travel
through markup, so an unvetted callback would be a remote-code-execution hole.

### Then BigPipe

Dynamic Page Cache stores the page **with tokens intact**. On each request a
placeholder strategy replaces them. The default \`single_flush\` strategy renders
them inline before sending. With the \`big_pipe\` module (on by default in
Standard, active whenever there is a session) the shell is flushed immediately,
each token becomes \`<span data-big-pipe-placeholder-id="…"></span>\`, and the
replacements stream in later as
\`<script type="application/vnd.drupal-ajax">\` blocks that JavaScript swaps in.
Same render array, same cache metadata, dramatically better TTFB.

For a Symfony developer: this is ESI/hinclude and the \`FragmentHandler\`, except
the decision to carve out a fragment is derived from cache metadata rather than
hand-written into the template, and the assembly happens inside PHP instead of
in Varnish.
`,

  comparisons: [
    {
      label: "Carving out the per-user fragment",
      intro:
        "The dashboard is identical for everyone except a greeting. Symfony makes you write the fragment call into the template; Drupal makes you declare a lazy builder in the render array and lets the renderer decide when to placeholder it.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# templates/incident/dashboard.html.twig #}
{# The controller renders this once and the reverse proxy caches it. #}
<h1>Incidents</h1>
{{ include('incident/_list.html.twig') }}

{# The per-user island is a separate sub-request. #}
{{ render_esi(controller(
  'App\\\\Controller\\\\IncidentFragmentController::greeting',
  { uid: app.user.id }
)) }}

{# or, client-side: #}
{{ render_hinclude(controller('App\\\\Controller\\\\IncidentFragmentController::greeting')) }}

{# framework.yaml must enable it:
   framework:
     esi: true
     fragments: { path: /_fragment }
#}`,
      ts: `<?php
// incident_tracker: IncidentDashboardController::build()
$build['list'] = [
  '#theme' => 'incident_list',
  '#incidents' => $this->loadOpenIncidents(),
  '#cache' => ['tags' => ['node_list:incident'], 'contexts' => ['url.path']],
];

// The per-user island. No markup here at all.
$build['greeting'] = [
  '#lazy_builder' => [
    'incident_tracker.lazy_builders:greeting',
    [$this->currentUser->id()],
  ],
  // Optional: auto-placeholdering would do this anyway, because the
  // fragment declares the 'user' cache context.
  '#create_placeholder' => TRUE,
];

return $build;`,
      note:
        "Symfony's fragment boundary lives in the template and is assembled by the proxy; Drupal's lives in the render array and is assembled by the renderer, so the placeholder decision can be driven by \`#cache\` metadata instead of by hand.",
    },
    {
      label: "The fragment builder",
      intro:
        "Both sides build the deferred HTML in a dedicated callable. The Drupal one is not a controller — it returns a render array, and it must announce itself as a trusted callback.",
      php: `<?php
// src/Controller/IncidentFragmentController.php
namespace App\\Controller;

use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpKernel\\Attribute\\Cache;
use Symfony\\Component\\HttpFoundation\\Response;

class IncidentFragmentController extends AbstractController
{
  // Sub-request gets its own Cache-Control; the proxy caches it separately.
  #[Cache(smaxage: 0, mustRevalidate: true)]
  public function greeting(int $uid): Response
  {
    $count = $this->repo->countOpenFor($uid);

    return $this->render('incident/_greeting.html.twig', [
      'count' => $count,
    ]);
  }
}`,
      ts: `<?php
// modules/custom/incident_tracker/src/IncidentLazyBuilders.php
namespace Drupal\\incident_tracker;

use Drupal\\Core\\Security\\TrustedCallbackInterface;
use Drupal\\Core\\StringTranslation\\StringTranslationTrait;

class IncidentLazyBuilders implements TrustedCallbackInterface {

  use StringTranslationTrait;

  public function __construct(
    protected IncidentRepository $repo,
  ) {}

  // Scalar args only. Returns a render array, not a Response.
  public function greeting(int $uid): array {
    $count = $this->repo->countOpenFor($uid);

    return [
      '#theme' => 'incident_greeting',
      '#count' => $count,
      '#cache' => [
        'contexts' => ['user'],
        'tags' => ['node_list:incident', 'user:' . $uid],
        'max-age' => 60,
      ],
    ];
  }

  // Without this, Drupal 10/11 throws UntrustedCallbackException.
  public static function trustedCallbacks(): array {
    return ['greeting'];
  }

}`,
      note:
        "Put the fragment's \`#cache\` metadata *inside* the callback: it applies to the placeholder's own cache entry and never bubbles into the outer page.",
    },
    {
      label: "Wiring and the placeholdering policy",
      intro:
        "Symfony's fragment behaviour is configured in framework.yaml; Drupal's is a container parameter you can override, plus an ordinary service definition for the builder.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/framework.yaml (Symfony 6.4 / 7)
framework:
  esi: true
  # ssi: true
  fragments:
    path: /_fragment
    hinclude_default_template: 'fragments/loading.html.twig'
  http_cache:
    enabled: true

# Nothing here decides *which* fragments are deferred --
# you make that call per call site with render_esi()/render_hinclude().`,
      ts: `# incident_tracker.services.yml -- the lazy builder is a normal service.
services:
  incident_tracker.lazy_builders:
    class: Drupal\\incident_tracker\\IncidentLazyBuilders
    arguments: ['@incident_tracker.repository']

# core.services.yml ships this parameter; a site can override it in
# sites/default/services.yml to change the placeholdering policy.
parameters:
  renderer.config:
    required_cache_contexts: ['languages:language_interface', 'theme', 'user.permissions']
    auto_placeholder_conditions:
      max-age: 0
      contexts: ['session', 'user']
      tags: []`,
      note:
        "\`auto_placeholder_conditions\` is the whole policy: a \`#lazy_builder\` element whose \`#cache\` has max-age <= 0, or a \`session\`/\`user\` context, is placeholdered without you asking.",
    },
    {
      label: "The classic error: passing an object",
      intro:
        "Both systems refuse non-scalar fragment arguments, for the same reason — the arguments have to survive a round trip through markup or a URL. The Drupal error message is one you will meet on your first lazy builder.",
      leftLang: "twig",
      php: `{# Symfony: fragment args are serialised into the /_fragment URL
   (or an ESI src). Objects cannot go through. #}
{{ render_esi(controller('...::greeting', { incident: incident })) }}
{# -> \\LogicException from FragmentUriGenerator::checkNonScalar():
   "Controller attributes cannot contain non-scalar/non-null values
    (value for key "incident" is not a scalar or null)." #}

{# Fix: pass the id and re-load inside the fragment controller. #}
{{ render_esi(controller('...::greeting', { id: incident.id })) }}`,
      ts: `<?php
// WRONG -- fails an assert() in Renderer::doRender():
// "A #lazy_builder callback's context may only contain scalar values or NULL."
$build['summary'] = [
  '#lazy_builder' => ['incident_tracker.lazy_builders:summary', [$node]],
];

// ALSO WRONG -- another assert() in the same method:
// "When a #lazy_builder callback is specified, no properties can exist;
//  all properties must be generated by the #lazy_builder callback."
$build['summary'] = [
  '#lazy_builder' => ['incident_tracker.lazy_builders:summary', [$node->id()]],
  '#prefix' => '<div class="summary">',   // not allowed
  '#attached' => ['library' => ['incident_tracker/summary']],  // not allowed
];

// RIGHT -- scalars in, everything else produced by the callback:
$build['summary'] = [
  '#lazy_builder' => ['incident_tracker.lazy_builders:summary', [(int) $node->id(), 'compact']],
  '#cache' => ['contexts' => ['user']],
  '#weight' => 10,
];`,
      note:
        "Note how close the two messages are: Symfony refuses “non-scalar/non-null values”, Drupal refuses anything but “scalar values or NULL” — same constraint, same reason. Alongside \`#lazy_builder\` core's supported keys are \`#cache\`, \`#create_placeholder\`, \`#lazy_builder_preview\`, \`#preview\`, \`#placeholder_strategy_denylist\` (Drupal 11) plus renderer-set \`#weight\`/\`#printed\`; \`#prefix\`, \`#attached\`, \`#theme\` and any child elements must come from the callback. Both Drupal checks are \`assert()\`s, so they only bite where assertions are enabled.",
    },
  ],

  playground: {
    intro:
      "A miniature renderer in plain PHP: it applies Drupal's real auto_placeholder_conditions to a page build, emits placeholder tokens for the deferred fragments, bubbles cacheability only from the fragments that were NOT placeholdered, then does the BigPipe second pass. Watch which element poisons the outer cache and why.",
    lang: "php",
    code: `<?php
// renderer.config from core.services.yml -- the real auto-placeholder conditions.
$conditions = ['max-age' => 0, 'contexts' => ['session', 'user'], 'tags' => []];

// The build for /incident/dashboard. -1 == Cache::PERMANENT.
$page = [
  'header' => [
    '#markup' => '<h1>Incidents</h1>',
    '#cache' => ['contexts' => ['url.path'], 'tags' => ['config:system.site'], 'max-age' => -1],
  ],
  'list' => [
    '#markup' => '<ul><li>INC-1</li><li>INC-2</li></ul>',
    '#cache' => ['contexts' => [], 'tags' => ['node_list:incident'], 'max-age' => -1],
  ],
  'greeting' => [
    '#lazy_builder' => ['incident_tracker.lazy_builders:greeting', [42]],
    '#cache' => ['contexts' => ['user'], 'tags' => [], 'max-age' => -1],
  ],
  'alerts' => [
    '#lazy_builder' => ['incident_tracker.lazy_builders:alertCount', [42, 'open']],
    '#cache' => ['contexts' => [], 'tags' => [], 'max-age' => 0],
  ],
  'whoami' => [
    // No #lazy_builder -> Drupal CANNOT placeholder this one.
    '#markup' => '<span>jason</span>',
    '#cache' => ['contexts' => ['user'], 'tags' => [], 'max-age' => -1],
  ],
];

// PlaceholderGenerator::shouldAutomaticallyPlaceholder(), simplified.
function shouldPlaceholder(array $el, array $conditions): bool {
  if (!isset($el['#lazy_builder'])) return false;          // canCreatePlaceholder()
  if (isset($el['#create_placeholder'])) return $el['#create_placeholder'];
  $c = $el['#cache'];
  if ($c['max-age'] !== -1 && $c['max-age'] <= $conditions['max-age']) return true;
  if (array_intersect($c['contexts'], $conditions['contexts'])) return true;
  if (array_intersect($c['tags'], $conditions['tags'])) return true;
  return false;
}

$html = '';
$placeholders = [];
$outer = ['contexts' => [], 'tags' => [], 'max-age' => -1];

foreach ($page as $name => $el) {
  if (shouldPlaceholder($el, $conditions)) {
    [$callback, $args] = $el['#lazy_builder'];
    foreach ($args as $arg) {
      if (!is_scalar($arg) && !is_null($arg)) {
        // Core uses assert() here; this mini-renderer throws so the rule is visible.
        throw new DomainException("A #lazy_builder callback's context may only contain scalar values or NULL.");
      }
    }
    $token = substr(md5($callback . serialize($args)), 0, 8);
    $q = http_build_query($args);
    $markup = '<drupal-render-placeholder callback="' . $callback . '" arguments="' . $q . '" token="' . $token . '"></drupal-render-placeholder>';
    $html .= $markup;
    $placeholders[$markup] = $el['#lazy_builder'];
    echo "placeholdered: $name  (" . $callback . ")\\n";
    continue;
  }
  // Not placeholdered: its markup AND its cacheability go into the outer page.
  $html .= $el['#markup'];
  $outer['contexts'] = array_unique(array_merge($outer['contexts'], $el['#cache']['contexts']));
  $outer['tags'] = array_unique(array_merge($outer['tags'], $el['#cache']['tags']));
  if ($el['#cache']['max-age'] !== -1) {
    $outer['max-age'] = $outer['max-age'] === -1 ? $el['#cache']['max-age'] : min($outer['max-age'], $el['#cache']['max-age']);
  }
}

echo "\\n--- cached outer HTML (Dynamic Page Cache stores this) ---\\n$html\\n";
echo "\\nouter contexts: " . implode(', ', $outer['contexts']) . "\\n";
echo "outer max-age:  " . ($outer['max-age'] === -1 ? 'PERMANENT' : $outer['max-age']) . "\\n";
echo "=> 'user' leaked in from #whoami: it varies per user but has no #lazy_builder,\\n";
echo "   so it cannot be placeholdered and it poisons the whole page cache.\\n";

// Second phase: BigPipe runs each lazy builder and streams the replacements.
$services = [
  'incident_tracker.lazy_builders:greeting' => fn(int $uid) => '<p>Hi, user ' . $uid . '</p>',
  'incident_tracker.lazy_builders:alertCount' => fn(int $uid, string $state) => '<b>3 ' . $state . '</b>',
];
echo "\\n--- after BigPipe flushes the placeholders ---\\n";
foreach ($placeholders as $markup => [$callback, $args]) {
  $html = str_replace($markup, $services[$callback](...$args), $html);
}
echo $html . "\\n";`,
    output: `placeholdered: greeting  (incident_tracker.lazy_builders:greeting)
placeholdered: alerts  (incident_tracker.lazy_builders:alertCount)

--- cached outer HTML (Dynamic Page Cache stores this) ---
<h1>Incidents</h1><ul><li>INC-1</li><li>INC-2</li></ul><drupal-render-placeholder callback="incident_tracker.lazy_builders:greeting" arguments="0=42" token="c81f7355"></drupal-render-placeholder><drupal-render-placeholder callback="incident_tracker.lazy_builders:alertCount" arguments="0=42&1=open" token="f11a8291"></drupal-render-placeholder><span>jason</span>

outer contexts: url.path, user
outer max-age:  PERMANENT
=> 'user' leaked in from #whoami: it varies per user but has no #lazy_builder,
   so it cannot be placeholdered and it poisons the whole page cache.

--- after BigPipe flushes the placeholders ---
<h1>Incidents</h1><ul><li>INC-1</li><li>INC-2</li></ul><p>Hi, user 42</p><b>3 open</b><span>jason</span>`,
  },

  keyPoints: [
    "\`'#lazy_builder' => ['service_id:method', [$scalar_args]]\` defers a fragment; the renderer emits a \`<drupal-render-placeholder>\` token and stores the real build under \`#attached['placeholders']\`, so the fragment's cache contexts never bubble into the outer page.",
    "Auto-placeholdering (\`renderer.config: auto_placeholder_conditions\` — max-age 0, contexts \`session\`/\`user\`) happens **only** on elements that already have a \`#lazy_builder\`; a plain \`#markup\` element with a \`user\` context just poisons the page.",
    "Alongside \`#lazy_builder\` core supports only \`#cache\`, \`#create_placeholder\`, \`#lazy_builder_preview\`, \`#preview\` and (Drupal 11) \`#placeholder_strategy_denylist\`, plus \`#weight\`/\`#printed\` which the renderer sets itself — no \`#prefix\`/\`#attached\`/\`#theme\` and no child elements; the callback must produce all of that. Both checks are \`assert()\`s in \`Renderer::doRender()\`, so they raise \`AssertionError\` on a dev site with \`zend.assertions=1\` and are compiled out in production — develop with assertions on.",
    "Lazy-builder arguments must be scalars or NULL (pass \`$node->id()\`, not \`$node\`) because they are serialised into the placeholder token.",
    "The callback's class must implement \`TrustedCallbackInterface\` and list the method in \`trustedCallbacks()\`, or Drupal 10/11 throws \`UntrustedCallbackException\`.",
    "Dynamic Page Cache stores the page with tokens intact; the \`single_flush\` strategy replaces them inline, while BigPipe streams the shell first and swaps replacements in via \`<script type=\"application/vnd.drupal-ajax\">\` — the same idea as Symfony ESI/hinclude, assembled in PHP instead of in the proxy.",
  ],

  interview: [
    {
      q: "Explain Drupal's placeholder/lazy-builder mechanism to someone who only knows Symfony ESI.",
      a: "Both solve the same problem: a mostly-static page containing a small per-user island, where the island's cacheability would otherwise force the whole response to be uncacheable. In Symfony you decide at the call site, writing \`render_esi(controller(...))\` into the Twig template, and the reverse proxy (or the \`FragmentHandler\` in a sub-request) assembles the final HTML. In Drupal you declare \`'#lazy_builder' => ['service:method', [$uid]]\` on the render array element; the renderer substitutes a \`<drupal-render-placeholder>\` token and keeps the real build under \`#attached['placeholders']\`, so the fragment's \`user\` context or \`max-age: 0\` never bubbles up. The big difference is that Drupal can make the decision **automatically** from the fragment's own \`#cache\` metadata, and the assembly happens inside PHP via a placeholder strategy rather than in Varnish.",
    },
    {
      q: "Why must lazy-builder arguments be scalars, and why does the callback need TrustedCallbackInterface?",
      a: "Both constraints come from the same fact: the callback name and its arguments are written into the page markup as part of the placeholder token, and may be read back out of a cached response much later. Objects cannot survive that round trip, so \`Renderer::doRender()\` asserts it — *\"A #lazy_builder callback's context may only contain scalar values or NULL\"* — and you pass \`$node->id()\` and re-load inside the callback. Worth knowing that this is an \`assert()\`, not a throw (Drupal 8 threw \`\\DomainException\`): on a dev site with \`zend.assertions=1\` you get an \`AssertionError\`, in production the check is compiled out entirely and you just get a broken fragment. Symfony's equivalent is a real throw — \`FragmentUriGenerator\` raises \`\\LogicException('Controller attributes cannot contain non-scalar/non-null values…')\`. Because an attacker who could influence that markup would otherwise be choosing which PHP callable runs, Drupal requires the callback's class to implement \`\\Drupal\\Core\\Security\\TrustedCallbackInterface\` and to name the method in \`trustedCallbacks()\`; anything else raises \`UntrustedCallbackException\` in Drupal 10/11. It is an allow-list against remote code execution, the same instinct as Symfony's fragment URL signing.",
    },
    {
      q: "A page is not being served from Dynamic Page Cache. How do you diagnose it, and what does BigPipe change?",
      a: "Look at the \`X-Drupal-Dynamic-Cache\` header (MISS/UNCACHEABLE) and enable the cacheability debug headers (\`http.response.debug_cacheability_headers: true\` in \`services.yml\`) to see the bubbled \`X-Drupal-Cache-Contexts\`/\`-Tags\`/\`-Max-Age\`. An \`UNCACHEABLE\` usually means some fragment bubbled \`max-age: 0\`, and a suspiciously high-cardinality context list means a per-user block is not placeholdered. The fix is to move that fragment behind a \`#lazy_builder\` so auto-placeholdering can take it out of the tree — remember auto-placeholdering only fires on elements that already have one. BigPipe does not change cacheability at all; it changes delivery, flushing the cached shell immediately and streaming the placeholder replacements afterwards, which mainly improves TTFB for authenticated users.",
    },
    {
      q: "When would you set \`#create_placeholder\` explicitly instead of relying on auto-placeholdering?",
      a: "Set \`TRUE\` when a fragment is genuinely expensive but its cache metadata does not match \`auto_placeholder_conditions\` — for example a heavy aggregate query that is cacheable for an hour with no \`user\` or \`session\` context: nothing would trigger auto-placeholdering, yet you still want the shell to ship first and BigPipe to stream the widget in. Set \`FALSE\` to opt a fragment out, typically when it must appear in the initial HTML for SEO or for a no-JavaScript audience, or when it is so cheap that a placeholder round trip costs more than rendering it inline. Everything else is best left to \`auto_placeholder_conditions\`, since that keeps the policy in one place and site-overridable in \`sites/default/services.yml\`.",
    },
  ],

  quiz: [
    {
      question:
        "Which of these render arrays will Drupal placeholder automatically, with default renderer.config?",
      options: [
        "\`['#markup' => $name, '#cache' => ['contexts' => ['user']]]\`",
        "\`['#lazy_builder' => ['a.b:c', [42]], '#cache' => ['contexts' => ['user']]]\`",
        "\`['#lazy_builder' => ['a.b:c', [42]], '#cache' => ['contexts' => ['theme']]]\`",
        "\`['#theme' => 'greeting', '#cache' => ['max-age' => 0]]\`",
      ],
      answerIndex: 1,
      explain:
        "Auto-placeholdering has a precondition: the element must have a #lazy_builder (canCreatePlaceholder), and then its #cache must hit auto_placeholder_conditions — max-age <= 0, or a 'session'/'user' context. Option 2 satisfies both. Options 1 and 4 have no #lazy_builder, so they cannot be placeholdered at all and their metadata bubbles up and poisons the page. Option 3 has a lazy builder but 'theme' is not a placeholdering condition (it is a required context, low cardinality), so it renders inline.",
    },
    {
      question:
        "You write \`['#lazy_builder' => ['incident_tracker.lazy_builders:summary', [$node]], '#prefix' => '<div>']\`. What happens?",
      options: [
        "It works; #prefix is applied after the callback returns",
        "Two assertion failures: the non-scalar argument, and a property (#prefix) that is not one of the keys supported alongside #lazy_builder",
        "It works but the fragment is never cached",
        "The node is silently converted to its id",
      ],
      answerIndex: 1,
      explain:
        "Both rules are violated, and each is checked by an assert() in Renderer::doRender() — not a throw (Drupal 8 used \\DomainException). Arguments are serialised into the placeholder token, so they must be scalar or NULL: pass $node->id() and re-load in the callback. And when #lazy_builder is set, core's supported keys are #cache, #create_placeholder, #lazy_builder_preview, #preview and (Drupal 11) #placeholder_strategy_denylist, plus the renderer's own #weight/#printed; #prefix, #attached, #theme, the rest, and any children must be returned by the callback itself. Practical catch: with zend.assertions=-1 (the production default) neither check runs at all, so you only see these on a dev site with assertions enabled — where they surface as AssertionError.",
    },
    {
      question:
        "What does BigPipe actually change compared with the default single_flush placeholder strategy?",
      options: [
        "It makes per-user fragments cacheable that otherwise would not be",
        "It replaces cache tags with ESI headers so Varnish can assemble the page",
        "It streams the cached page shell first and sends each placeholder's replacement afterwards as an embedded ajax script, improving TTFB",
        "It renders placeholders on the client with a second HTTP request per fragment",
      ],
      answerIndex: 2,
      explain:
        "BigPipe is a delivery optimisation, not a caching one. Both strategies consume the same placeholders; single_flush renders them inline before the response is sent, while BigPipe flushes the shell immediately, emits <span data-big-pipe-placeholder-id> stubs, and streams <script type=\"application/vnd.drupal-ajax\"> replacements in the same response for JavaScript to swap in. It requires a session, which is why it targets authenticated traffic.",
    },
  ],
};

export default lesson;
