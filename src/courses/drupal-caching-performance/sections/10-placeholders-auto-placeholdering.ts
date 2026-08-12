import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "placeholders-auto-placeholdering",
  title: "Placeholders & Auto-Placeholdering",
  part: "Page & Render Caching Layers",
  estMinutes: 12,
  summary:
    "How Drupal punches personalised holes in a cacheable page: #lazy_builder plus #create_placeholder, the auto_placeholder_conditions that decide for you, the scalar-arguments and trusted-callback rules, and how to debug a hole that never got punched.",

  concept: `
The previous sections ended on a problem: one uncacheable sliver — a "Hi, Jason"
menu, a live incident counter — poisons the cacheability of everything above it,
because \`#cache\` metadata **bubbles up**. Placeholdering is the escape hatch. It
maps a poorly-cacheable subtree onto a render array that is *only* \`#markup\` and
\`#attached\`, so nothing bubbles.

## The contract

You hand the renderer a **callback plus scalars** instead of built markup:

\`\`\`php
$build['account_menu'] = [
  '#lazy_builder' => ['newsroom.account:menu', []],
  '#create_placeholder' => TRUE,
  '#cache' => ['contexts' => ['user']],
];
\`\`\`

\`Renderer::doRender()\` sees \`#create_placeholder\`, calls
\`PlaceholderGenerator::createPlaceholder()\`, and replaces the element with a token:

\`\`\`html
<drupal-render-placeholder callback="newsroom.account:menu" token="Vc9…"></drupal-render-placeholder>
\`\`\`

There is no \`arguments\` attribute because this builder takes none:
\`createPlaceholder()\` skips any attribute whose value is the empty string. A
builder called as \`['newsroom.account:menu', [$account_id]]\` renders as
\`arguments="0=17"\` instead. (Only the long-dead 10.0/10.1 emitted a literal
\`arguments=""\`; every supported 10.2+ and 11.x release omits it.)

The token is \`Crypt::hashBase64(serialize())\` of the stripped render array (with
contexts and tags sorted first, so it is stable). The real element is stashed in
\`#attached['placeholders']\`, keyed by that markup string. The *page* renders and
caches with the placeholder string baked in. Late in the response,
\`HtmlResponsePlaceholderStrategySubscriber\` hands the placeholders to the chained
\`placeholder_strategy\` service; the fallback \`SingleFlushStrategy\` says "render
these now", the attachments processor calls each lazy builder and string-replaces
the tokens. Swap the strategy and the same placeholders become BigPipe stream
chunks or ESI tags — the render array never changes.

## Auto-placeholdering

You usually do not write \`#create_placeholder\` at all. \`core.services.yml\` ships:

\`\`\`yaml
renderer.config:
  auto_placeholder_conditions:
    max-age: 0
    contexts: ['session', 'user']
    tags: []
\`\`\`

If an element has a \`#lazy_builder\` **and** trips any condition —
\`max-age\` at or below 0, or a cache context intersecting \`session\`/\`user\`, or a
listed tag — the renderer sets \`#create_placeholder = TRUE\` for you. Two traps:
the intersection is done on **optimised** context tokens, so \`user.permissions\`
alone does *not* match \`user\`; and \`#create_placeholder => FALSE\` vetoes
placeholdering outright, which is the supported way to opt out.

## The three rules of lazy builders

1. **Scalars or NULL only.** Assertions enforce
   "A #lazy_builder callback's context may only contain scalar values or NULL."
   Passing a \`Node\` is the classic fatal — the arguments are serialised into the
   token and into a query string. Pass \`nid\`, load inside the builder.
2. **The callback must be trusted.** The string is *resolved* first —
   \`service_id:method\` through the container, \`Class::method\` directly — and the
   resolved target must *then* pass \`doTrustedCallback()\`. Using a service id
   does **not** exempt you. The target qualifies if it is a method listed in
   \`trustedCallbacks()\` on a class implementing \`TrustedCallbackInterface\`, any
   public method on a class implementing
   \`Drupal\\Core\\Render\\Element\\RenderCallbackInterface\`, a method carrying the
   \`#[TrustedCallback]\` attribute, or a closure. Anything else throws
   \`UntrustedCallbackException\`. Core proves it: \`user.toolbar_link_builder\` is
   a service-based lazy builder and \`Drupal\\user\\ToolbarLinkBuilder\` still
   implements \`TrustedCallbackInterface\`.
3. **The element must be otherwise empty.** With \`#lazy_builder\` set, only a
   short allow-list survives — \`#cache\`, \`#create_placeholder\`,
   \`#lazy_builder_preview\`, \`#weight\`, \`#printed\` — and **no children**. Adding
   \`#prefix\` or \`#theme\` beside a lazy builder trips an assertion.

## Debugging

Turn on \`renderer.config.debug: true\` and
\`http.response.debug_cacheability_headers: true\` in \`sites/default/services.yml\`
to see per-element cacheability in HTML comments and \`X-Drupal-Cache-Contexts\`
headers. If the hole was not punched: check the element really has a
\`#lazy_builder\`, that its \`#cache\` actually trips a condition, and that nothing
set \`#create_placeholder => FALSE\`. If a placeholder appears but never fills,
you are looking at a strategy problem, not a render problem.
`,

  comparisons: [
    {
      label: "Punching the hole",
      intro:
        "The same page: a heavily cached shell with one per-user fragment. Symfony asks the template to embed a sub-request; Drupal asks the render array to defer a callback.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# Symfony: the fragment is a controller call. #}
{# framework.esi.enabled: true, or render_hinclude for JS-side #}
{{ render_esi(controller(
  'App\\\\Controller\\\\AccountController::menu'
)) }}

{# The FragmentHandler resolves this: with ESI on it emits
   <esi:include src="/_fragments?_path=…&_hash=…" /> and the
   reverse proxy fetches it; with no ESI-capable proxy it
   falls back to an inline sub-request. The signature
   (UriSigner) is what makes the URL non-forgeable. #}`,
      ts: `// Drupal: the fragment is a lazy builder, not a route.
$build['account_menu'] = [
  '#lazy_builder' => ['newsroom.account:menu', [$account_id]],
  '#create_placeholder' => TRUE,
  '#cache' => ['contexts' => ['user']],
];

// Renderer::doRender() swaps this for
//   <drupal-render-placeholder callback="newsroom.account:menu"
//     arguments="0=17" token="…"></drupal-render-placeholder>
// and stashes the real element in
//   $build['#attached']['placeholders'][$markup]
// No route, no sub-request, no signed URL — the token is a
// hash of the stripped render array.`,
      note:
        "Symfony fragments are HTTP-addressable (a URL a proxy can fetch); Drupal placeholders are in-process render arrays that a strategy may later turn into ESI or BigPipe.",
    },
    {
      label: "Who decides to defer",
      intro:
        "In Symfony you decide per template call. In Drupal the renderer decides for you, from container parameters you can override.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/framework.yaml
framework:
  esi: { enabled: true }
  fragments: { path: /_fragments }
  http_cache: { enabled: true }

# There is no "automatically ESI anything that looks
# user-specific" rule. Every fragment boundary is a
# deliberate render_esi() / render_hinclude() call in a
# template, and each fragment controller sets its own
# Response cache headers.`,
      ts: `# core/core.services.yml (ships with Drupal 10 and 11)
parameters:
  renderer.config:
    required_cache_contexts:
      ['languages:language_interface', 'theme', 'user.permissions']
    auto_placeholder_conditions:
      max-age: 0
      contexts: ['session', 'user']
      tags: []
    debug: false

# Override in sites/default/services.yml, e.g. to make any
# element carrying the alert_list tag auto-placeholder:
parameters:
  renderer.config:
    auto_placeholder_conditions:
      max-age: 0
      contexts: ['session', 'user']
      tags: ['alert_list']`,
      note:
        "Overriding renderer.config replaces the whole nested array — copy every key across, or you silently drop required_cache_contexts.",
    },
    {
      label: "Trusted callbacks vs controllers",
      intro:
        "Both frameworks refuse to call an arbitrary user-supplied callable. Symfony's gate is the router plus a signed URL; Drupal's is TrustedCallbackInterface.",
      php: `// Symfony: a fragment target is just a controller.
// It is reachable because the router (and the fragment
// listener's UriSigner) says so.
namespace App\\Controller;

class AccountController {
  public function menu(int $uid): Response {
    // Arguments arrive through the URL as strings and are
    // converted by argument resolvers.
    return $this->render('account/menu.html.twig', [
      'user' => $this->users->find($uid),
    ]);
  }
}`,
      ts: `namespace Drupal\\newsroom;

use Drupal\\Core\\Security\\TrustedCallbackInterface;

class AccountMenuBuilder implements TrustedCallbackInterface {

  public function menu(int $uid): array {
    $account = $this->userStorage->load($uid);
    return [
      '#theme' => 'newsroom_account_menu',
      '#name' => $account->getDisplayName(),
      '#cache' => ['contexts' => ['user'], 'max-age' => 0],
    ];
  }

  public static function trustedCallbacks(): array {
    return ['menu'];
  }

}`,
      note:
        "Registering the class as a service and using the 'newsroom.account:menu' string form is the usual route, but that only resolves the callable — implementing TrustedCallbackInterface is what makes it callable at all. Core's own user.toolbar_link_builder is a service and Drupal\\user\\ToolbarLinkBuilder still implements the interface.",
    },
    {
      label: "The classic fatal: passing an object",
      intro:
        "Deferred rendering means the arguments have to survive being written into a string. Neither framework can carry an entity across that boundary.",
      php: `// Symfony — looks fine, is not.
{{ render_esi(controller('App\\\\Controller\\\\RelatedController::build',
  { article: article })) }}

// The fragment URI is built by serialising the parameters
// into a query string, so an entity object becomes garbage
// (or an exception). You pass the identifier:
{{ render_esi(controller('App\\\\Controller\\\\RelatedController::build',
  { id: article.id })) }}`,
      ts: `// WRONG: AssertionError under assertions, or a broken
// token / "Serialization of 'Closure' is not allowed".
$build['related'] = [
  '#lazy_builder' => ['newsroom.related:build', [$node]],
];

// Also wrong: siblings alongside a lazy builder.
$build['related']['#prefix'] = '<aside>';  // assertion fails

// RIGHT: scalars in, everything else built inside.
$build['related'] = [
  '#lazy_builder' => ['newsroom.related:build', [$node->id()]],
  '#cache' => ['max-age' => 0],
];`,
      note:
        "The assertion text to grep for: \"A #lazy_builder callback's context may only contain scalar values or NULL.\" Assertions are off in production, so the failure there is a corrupt token instead of a clear error — develop with assertions on.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP miniature of the renderer's decision: which children get placeholdered, what the token markup looks like, and what the shell is left carrying.",
    lang: "php",
    code: `<?php
// A miniature of Drupal's auto-placeholdering + placeholder replacement pass.

// core.services.yml: parameters.renderer.config.auto_placeholder_conditions
$conditions = ['max-age' => 0, 'contexts' => ['session', 'user'], 'tags' => []];

function shouldAutoPlaceholder(array $cache, array $conditions): string {
  if ($cache['max-age'] !== -1 && $cache['max-age'] <= $conditions['max-age']) {
    return 'max-age ' . $cache['max-age'];
  }
  $ctx = array_intersect($cache['contexts'], $conditions['contexts']);
  if ($ctx) {
    return 'context ' . implode(',', $ctx);
  }
  $tags = array_intersect($cache['tags'], $conditions['tags']);
  if ($tags) {
    return 'tag ' . implode(',', $tags);
  }
  return '';
}

function createPlaceholder(array $el): array {
  // Only #lazy_builder and #cache survive into the placeholder render array.
  $keep = ['#lazy_builder' => $el['#lazy_builder'], '#cache' => $el['#cache']];
  sort($keep['#cache']['contexts']);
  sort($keep['#cache']['tags']);
  $token = substr(md5(serialize($keep)), 0, 12);
  // UrlHelper::buildQuery(), then Html::escape() on every attribute value.
  // Core skips any attribute whose value is the empty string, so a builder with
  // no arguments produces a tag with no arguments attribute at all.
  $args = htmlspecialchars(http_build_query($el['#lazy_builder'][1]), ENT_QUOTES);
  $markup = '<drupal-render-placeholder callback="' . $el['#lazy_builder'][0] . '"'
    . ($args !== '' ? ' arguments="' . $args . '"' : '')
    . ' token="' . $token . '"></drupal-render-placeholder>';
  return ['#markup' => $markup, 'token' => $token];
}

// The incident page: a cacheable shell plus three candidate children.
$page = [
  'headline' => [
    '#cache' => ['contexts' => ['url.path'], 'tags' => ['node:42'], 'max-age' => -1],
  ],
  'account_menu' => [
    '#lazy_builder' => ['newsroom.account:menu', []],
    '#cache' => ['contexts' => ['user'], 'tags' => [], 'max-age' => -1],
  ],
  'alert_ticker' => [
    '#lazy_builder' => ['newsroom.alerts:ticker', ['region' => 'north', 'severity' => 3]],
    '#cache' => ['contexts' => ['url.path'], 'tags' => ['alert_list'], 'max-age' => 0],
  ],
  'related_links' => [
    '#lazy_builder' => ['newsroom.related:build', ['nid' => 42]],
    '#cache' => ['contexts' => ['url.path'], 'tags' => ['node_list'], 'max-age' => -1],
  ],
];

$shell = ['contexts' => ['theme'], 'tags' => ['config:system.site'], 'max-age' => -1];
$placeholders = [];

foreach ($page as $name => $el) {
  $why = isset($el['#lazy_builder']) ? shouldAutoPlaceholder($el['#cache'], $conditions) : '';
  if ($why !== '') {
    $ph = createPlaceholder($el);
    $placeholders[$ph['token']] = $el['#lazy_builder'];
    echo "$name: PLACEHOLDERED ($why)\\n";
    echo '  ' . $ph['#markup'] . "\\n";
    continue;
  }
  echo "$name: rendered inline, cacheability bubbles up\\n";
  $shell['contexts'] = array_values(array_unique(array_merge($shell['contexts'], $el['#cache']['contexts'])));
  $shell['tags'] = array_values(array_unique(array_merge($shell['tags'], $el['#cache']['tags'])));
  if ($el['#cache']['max-age'] !== -1) {
    $shell['max-age'] = $shell['max-age'] === -1 ? $el['#cache']['max-age'] : min($shell['max-age'], $el['#cache']['max-age']);
  }
}

echo "\\nShell cacheability after bubbling:\\n";
echo '  contexts: ' . implode(', ', $shell['contexts']) . "\\n";
echo '  tags:     ' . implode(', ', $shell['tags']) . "\\n";
echo '  max-age:  ' . $shell['max-age'] . "\\n";

echo "\\nLate replacement pass, run per request after the shell cache HIT:\\n";
foreach ($placeholders as $token => $builder) {
  echo "  $token -> " . $builder[0] . '(' . json_encode($builder[1]) . ")\\n";
}
`,
    output: `headline: rendered inline, cacheability bubbles up
account_menu: PLACEHOLDERED (context user)
  <drupal-render-placeholder callback="newsroom.account:menu" token="3274a52c8124"></drupal-render-placeholder>
alert_ticker: PLACEHOLDERED (max-age 0)
  <drupal-render-placeholder callback="newsroom.alerts:ticker" arguments="region=north&amp;severity=3" token="0cc847881d53"></drupal-render-placeholder>
related_links: rendered inline, cacheability bubbles up

Shell cacheability after bubbling:
  contexts: theme, url.path
  tags:     config:system.site, node:42, node_list
  max-age:  -1

Late replacement pass, run per request after the shell cache HIT:
  3274a52c8124 -> newsroom.account:menu([])
  0cc847881d53 -> newsroom.alerts:ticker({"region":"north","severity":3})
`,
  },

  keyPoints: [
    "A placeholdered element is reduced to #markup (a <drupal-render-placeholder> token) plus #attached['placeholders'], so its cache contexts, tags and max-age stop bubbling into the page.",
    "Auto-placeholdering is driven by renderer.config.auto_placeholder_conditions — max-age 0, contexts intersecting 'session' or 'user', and an empty tag list by default; an element must still have a #lazy_builder to qualify.",
    "The context intersection runs on optimised tokens, so 'user.permissions' does not trip the 'user' condition; add an explicit '#create_placeholder' => TRUE when you want it deferred anyway.",
    "#lazy_builder arguments must be scalars or NULL — pass an entity ID and load inside the builder; passing the entity itself is the classic fatal.",
    "The callback string is only resolved by its form (service_id:method through the container, or Class::method) — the resolved target must then be trusted: listed in trustedCallbacks() on a TrustedCallbackInterface class, any public method on a RenderCallbackInterface class, a method tagged #[TrustedCallback], or a closure. Using a service id does not exempt you; anything else throws UntrustedCallbackException.",
    "Placeholder replacement is pluggable: the chained placeholder_strategy service picks SingleFlushStrategy by default, BigPipe or an ESI strategy when installed — the render array is identical either way.",
  ],

  interview: [
    {
      q: "Explain auto-placeholdering to someone who has only used Symfony's ESI.",
      a: `In Symfony you choose the fragment boundary by hand: you call \`render_esi(controller(...))\` in a template, the \`FragmentHandler\` either emits an \`<esi:include>\` for the proxy or performs an inline sub-request, and each fragment controller sets its own cache headers. Drupal inverts the decision. You mark an element with \`#lazy_builder\` — a callback and scalar arguments — and the renderer consults \`renderer.config.auto_placeholder_conditions\` (default: \`max-age\` 0, contexts intersecting \`session\` or \`user\`, no tags). If the element trips a condition, Drupal sets \`#create_placeholder\` itself and swaps in a \`<drupal-render-placeholder>\` token, keeping the real element in \`#attached['placeholders']\`. The point is the same in both frameworks — stop one uncacheable sliver from ruining the cacheability of the page around it — but Drupal's version is policy-driven and transport-agnostic, because a placeholder strategy decides later whether the hole is filled inline, streamed by BigPipe, or turned into an ESI tag.`,
    },
    {
      q: "A colleague passes a loaded node into a #lazy_builder and the site breaks. What happened and how do you fix it?",
      a: `A lazy builder's arguments are not kept in memory — they are serialised into the placeholder token and written into the \`arguments\` attribute of the \`<drupal-render-placeholder>\` tag as a query string. Drupal asserts this explicitly: "A #lazy_builder callback's context may only contain scalar values or NULL." With assertions on in development you get an \`AssertionError\`; in production, where assertions are compiled out, you instead get an unserialisable token or a serialization exception from a service reference hanging off the entity. The fix is always the same: pass \`$node->id()\` (and the view mode, langcode, whatever else you need — all scalars) and do the \`load()\` inside the builder method. As a bonus that keeps the entity load off the critical path entirely when the placeholder is never rendered.`,
    },
    {
      q: "Your per-user block still ruins the page cache even though it has a lazy builder. How do you debug it?",
      a: `Work through the two gates. First \`canCreatePlaceholder()\`: the element must actually have a \`#lazy_builder\` and must not have \`#create_placeholder\` set to \`FALSE\` — plugins and alters sometimes set that to opt out. Second \`shouldAutomaticallyPlaceholder()\`: the element's own \`#cache\` must trip a condition. The usual culprit is a context that looks personal but is not in the list — \`user.permissions\` or \`user.roles\` do not intersect \`user\` once tokens are optimised — or metadata sitting on the *parent* rather than on the lazy-builder element itself. I would turn on \`renderer.config.debug: true\` and \`http.response.debug_cacheability_headers: true\` in \`sites/default/services.yml\`, look at the per-element HTML comments and the \`X-Drupal-Cache-Contexts\` header, then either move the \`#cache\` metadata onto the lazy-builder element or just set \`'#create_placeholder' => TRUE\` explicitly.`,
    },
    {
      q: "Why does Drupal require lazy builder callbacks to implement TrustedCallbackInterface?",
      a: `Because the callback name travels through untrusted territory. It is written into the rendered HTML as an attribute and, once a strategy like BigPipe or ESI is involved, can come back from the client. Without a whitelist, an attacker who could influence a placeholder attribute would have an arbitrary-callable primitive — the render-array equivalent of a PHP object injection gadget. So \`DoTrustedCallbackTrait::doTrustedCallback()\` is reached through \`Renderer::doCallback()\`, which resolves the definition first — \`service_id:method\` through the container, \`Class::method\` directly — and then **always** puts the resolved callable through the trust check. Registering a service buys you nothing on its own: the resolved object still has to be trusted, meaning a method named in a \`TrustedCallbackInterface\` class's static \`trustedCallbacks()\`, any public method on a class implementing \`RenderCallbackInterface\`, a method carrying the \`#[TrustedCallback]\` attribute, or a closure. Anything else is an \`UntrustedCallbackException\`. Core's own \`user.toolbar_link_builder\` is the proof: it is a registered service *and* \`ToolbarLinkBuilder\` implements \`TrustedCallbackInterface\`. The same trait guards \`#pre_render\`, \`#post_render\` and friends. In practice you register the builder as a service *and* implement the interface — the service id is for wiring, the interface is for permission.`,
    },
  ],

  quiz: [
    {
      question:
        "An element has '#lazy_builder' and '#cache' => ['contexts' => ['user.permissions']]. With stock renderer.config, what happens?",
      options: [
        "It is auto-placeholdered, because user.permissions is a user context.",
        "It is rendered inline and user.permissions bubbles up to the page.",
        "The renderer throws, because user.permissions is not allowed on a lazy builder.",
        "It is auto-placeholdered only if the page also has max-age 0.",
      ],
      answerIndex: 1,
      explain:
        "shouldAutomaticallyPlaceholder() intersects the element's optimised contexts against ['session', 'user']. 'user.permissions' is a distinct token and does not intersect 'user', so no condition trips and the element renders inline — its context bubbles up. If you want it deferred, set '#create_placeholder' => TRUE explicitly.",
    },
    {
      question:
        "Which of these is legal beside a '#lazy_builder' key in the same element?",
      options: [
        "'#prefix' => '<aside>'",
        "A child element such as 'links' => [...]",
        "'#cache' => ['max-age' => 0]",
        "'#theme' => 'item_list'",
      ],
      answerIndex: 2,
      explain:
        "When #lazy_builder is present, doRender() asserts that the element has no children and only a short allow-list of properties — #cache, #create_placeholder, #lazy_builder_preview, #weight and #printed among them. Everything else, including #prefix and #theme, must be produced by the callback itself.",
    },
    {
      question:
        "What is actually stored in the render cache entry for the page containing a placeholder?",
      options: [
        "The fully rendered fragment, refreshed on every request.",
        "The <drupal-render-placeholder> token string, plus the placeholder's render array under #attached['placeholders'].",
        "Nothing — a page with a placeholder is not render-cacheable.",
        "A signed fragment URL that the reverse proxy fetches separately.",
      ],
      answerIndex: 1,
      explain:
        "createPlaceholder() maps the element to #markup (the token tag) plus #attached['placeholders'][$markup] => the original element. That is what gets cached, which is precisely why the personalised subtree's contexts, tags and max-age no longer bubble. The callback runs per request during the late replacement pass. Signed fragment URLs are Symfony's ESI model, not Drupal's.",
    },
    {
      question:
        "You install BigPipe. What has to change in a module that already uses #lazy_builder?",
      options: [
        "Nothing — BigPipe registers a higher-priority placeholder_strategy service.",
        "Every lazy builder must be re-declared as a route so it can be streamed.",
        "The #lazy_builder arguments must be JSON-encoded.",
        "You must set '#create_placeholder' => TRUE manually on each element.",
      ],
      answerIndex: 0,
      explain:
        "Placeholder replacement is delegated to the chained placeholder_strategy service. SingleFlushStrategy is the lowest-priority fallback that renders placeholders inline; BigPipe adds a higher-priority strategy that streams them after the main content. The render arrays your module produces are unchanged.",
    },
  ],
};

export default lesson;
