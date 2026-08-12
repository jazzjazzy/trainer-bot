import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "http-cache-headers",
  title: "What Drupal Sends: HTTP Cache Headers",
  part: "Reverse Proxies & the Edge",
  estMinutes: 12,
  summary:
    "Everything in front of Drupal — browser, Varnish, CDN — only sees HTTP headers, so learn to read Cache-Control, Expires, Vary and Drupal's own X-Drupal-Cache* headers with curl before you tune anything.",

  concept: `
## Nothing downstream knows what a cache tag is

Your Varnish box, Fastly, Cloudflare and the visitor's browser have never heard
of \`node:42\` or the \`user.permissions\` cache context. They read three standard
headers — \`Cache-Control\`, \`Expires\`, \`Vary\` — exactly as they would from a
Symfony app. Drupal's cacheability metadata is internal bookkeeping that gets
**rendered down to plain HTTP** on the way out, by
\`\\Drupal\\Core\\EventSubscriber\\FinishResponseSubscriber\`. Learn to read that
translation and most "why isn't the edge caching this?" tickets answer themselves.

### The three headers that actually control caches

- **Cache-Control.** For a response that is cacheable *and* passes the page-cache
  request/response policies, Drupal sets \`public, max-age=N\`, where N is
  \`system.performance:cache.page.max_age\` — the **Browser and proxy cache
  maximum age** select at \`/admin/config/development/performance\`. It ships as
  \`0\`, which means *no caching at all*, so on a fresh site the edge stores
  nothing. Symfony's \`ResponseHeaderBag\` sorts directives alphabetically, so the
  wire format reads \`Cache-Control: max-age=300, public\`.
- **Expires.** Drupal stamps a date in 1978 on almost everything. That is
  deliberate: HTTP/1.0 proxies do not understand \`Vary\`, so the past date stops
  them caching, while HTTP/1.1 clients ignore \`Expires\` whenever \`max-age\` is
  present.
- **Vary: Cookie.** Added to cacheable responses so a shared cache never serves
  one visitor's page to another. You can suppress it with
  \`$settings['omit_vary_cookie'] = TRUE;\` — only safe when your proxy strips
  session cookies itself.

Note what is **not** there: core emits a single \`max-age\`, never \`s-maxage\`. One
number for browsers and shared caches alike. A long edge TTL with a short browser
TTL is something you add yourself, in a response subscriber or at the CDN.

### Why an authenticated response is never public

Open a session and page_cache's request policy refuses the request, so
\`setResponseNotCacheable()\` runs: \`no-cache, must-revalidate\` (Symfony appends
\`private\` because nothing claimed \`public\` or \`s-maxage\`), the 1978 \`Expires\`,
and \`ETag\`, \`Last-Modified\` and \`Vary\` are *removed* — there is no point
offering revalidation for something nobody may store. There is a subtler case
too: on a route that is cacheable, if the browser merely sends a session cookie,
the page_cache middleware downgrades the response with \`setPrivate()\`, so you
see \`max-age=300, private\`.

### Drupal's own headers

- \`X-Drupal-Cache\` — internal page cache (anonymous only):
  \`HIT\`, \`MISS\`, or \`UNCACHEABLE (request policy | response policy | no cacheability)\`.
- \`X-Drupal-Dynamic-Cache\` — dynamic page cache, same vocabulary plus
  \`UNCACHEABLE (poor cacheability)\` for a response with max-age 0, a
  high-cardinality context, or a churny tag.
- **Version gate.** Those parenthesised reasons only arrived in **Drupal 10.4.0
  and 11.1.0** ([change record 2958442](https://www.drupal.org/node/2958442)). On
  10.0–10.3 and 11.0 both headers emit a bare \`UNCACHEABLE\` with no explanation,
  so if you are staring at an unqualified value the site is simply on an older
  minor — check \`drush status\` before hunting for the reason.
- \`X-Drupal-Cache-Tags\`, \`X-Drupal-Cache-Contexts\`, \`X-Drupal-Cache-Max-Age\` —
  the debug trio, sorted and space-separated, printed only when
  \`http.response.debug_cacheability_headers\` is \`true\`. Max-age renders as
  \`0 (Uncacheable)\` or \`-1 (Permanent)\` when it hits those sentinels. Turn this
  on locally and leave it on; it is the single best teacher for this whole topic.
`,

  comparisons: [
    {
      label: "Declaring a public, shared-cacheable response",
      intro:
        "Same HTTP vocabulary, different authorship: in Symfony you write the directives in the controller, in Drupal core writes them for you from one config value — and only ever as max-age.",
      php: `// Symfony: the controller owns Cache-Control.
public function incident(Incident $incident): Response
{
    $response = $this->render('incident/show.html.twig', [
        'incident' => $incident,
    ]);

    $response->setPublic();
    $response->setMaxAge(60);          // browsers: 1 minute
    $response->setSharedMaxAge(3600);  // Varnish/CDN: 1 hour
    $response->setVary(['Cookie']);

    // Cache-Control: max-age=60, public, s-maxage=3600
    return $response;
}`,
      ts: `// Drupal: the controller declares *cacheability*, not headers.
public function incident(NodeInterface $node): array {
  return [
    '#theme' => 'incident_summary',
    '#node' => $node,
    '#cache' => [
      'tags' => $node->getCacheTags(),
      'contexts' => ['url.path'],
    ],
  ];
}

// FinishResponseSubscriber turns that into headers using
// system.performance:cache.page.max_age (default 0 = no caching):
//   Cache-Control: max-age=300, public
//   Expires: Sun, 19 Nov 1978 05:00:00 GMT
//   Vary: Cookie
// Set it once, for the whole site:
//   drush config:set system.performance cache.page.max_age 300`,
      note: "Core never emits s-maxage — one max-age covers browser and edge. If you want a short browser TTL and a long edge TTL you must add s-maxage yourself (response subscriber or CDN rule).",
    },
    {
      label: "Turning on header-level cache debugging",
      intro:
        "Both stacks hide a debug header behind a dev-only config flag. Drupal's is the one worth memorising, because it prints the cache tags and contexts of the whole page.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: config/packages/framework.yaml
# The HttpCache reverse proxy adds X-Symfony-Cache when debug is on.
framework:
    http_cache:
        enabled: true
        debug: '%kernel.debug%'

# Then in dev:
#   X-Symfony-Cache: GET /incidents: miss, store
#   Age: 12`,
      ts: `# Drupal: sites/development.services.yml
parameters:
  http.response.debug_cacheability_headers: true
  twig.config:
    debug: true
    auto_reload: true
    cache: false

# Wire it up in sites/default/settings.local.php:
#   $settings['container_yamls'][] = DRUPAL_ROOT . '/sites/development.services.yml';
# Then: drush cache:rebuild
#
# Adds to every cacheable response:
#   X-Drupal-Cache-Tags: config:user.role.anonymous node:42 node_list
#   X-Drupal-Cache-Contexts: languages:language_interface theme url.path user.permissions
#   X-Drupal-Cache-Max-Age: -1 (Permanent)`,
      note: "It is a container parameter, so a cache rebuild is required after editing the YAML. Never enable it in production — the tag list leaks your content graph and can run to kilobytes.",
    },
    {
      label: "Diagnosing a miss on the wire",
      intro:
        "The first move for any 'the CDN isn't caching it' report is the same in both worlds: fetch headers only, twice, and compare.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony behind its own HttpCache or a Varnish box
curl -sSI https://news.example.com/incidents | \\
  grep -iE 'cache-control|age|vary|x-symfony-cache'

# cache-control: max-age=60, public, s-maxage=3600
# age: 0
# vary: Cookie
# x-symfony-cache: GET /incidents: miss, store`,
      ts: `# Drupal: the two internal caches report separately
curl -sSI https://news.example.com/node/42 | \\
  grep -iE 'cache-control|expires|vary|^x-drupal'

# cache-control: max-age=300, public
# expires: Sun, 19 Nov 1978 05:00:00 GMT
# vary: Cookie
# x-drupal-cache: MISS
# x-drupal-dynamic-cache: MISS

# Run it again: x-drupal-cache flips to HIT.
# Anonymous but still HIT-less? Send no cookies at all:
curl -sSI --cookie '' https://news.example.com/node/42 | grep -i x-drupal-cache`,
      note: "A stray session cookie is the number-one cause of a permanent MISS: page_cache refuses any request with an open session, and downgrades Cache-Control to private.",
    },
    {
      label: "Overriding Cache-Control for one route",
      intro:
        "A live incident feed you want the edge to hold for 30 seconds but browsers to re-check constantly. Both frameworks let a controller win over the global default.",
      php: `// Symfony
public function feed(): Response
{
    $response = new JsonResponse($this->feedBuilder->latest());
    $response->setPublic();
    $response->setMaxAge(0);
    $response->setSharedMaxAge(30);
    $response->headers->addCacheControlDirective('must-revalidate');

    return $response;
}`,
      ts: `// Drupal: return a CacheableResponse and set Cache-Control yourself.
public function feed(): CacheableJsonResponse {
  $response = new CacheableJsonResponse($this->feedBuilder->latest());
  $response->addCacheableDependency(
    (new CacheableMetadata())
      ->setCacheTags(['node_list:incident'])
      ->setCacheMaxAge(30)
  );

  // FinishResponseSubscriber leaves this alone ONLY when the page-cache
  // policies allow caching AND cache.page.max_age > 0. Otherwise
  // setResponseNotCacheable() overwrites all of it.
  $response->setPublic();
  $response->setMaxAge(0);
  $response->setSharedMaxAge(30);

  return $response;
}`,
      note: "Read the guard carefully: onRespond() only consults isCacheControlCustomized() *inside* the cacheable branch, so your header survives only when the page-cache request/response policies allow caching AND system.performance:cache.page.max_age is greater than 0. On a default site (max_age 0), or on any authenticated request, the else branch runs setResponseNotCacheable(), which overwrites your Cache-Control with `must-revalidate, no-cache, private`, stamps the 1978 Expires and strips Vary, ETag and Last-Modified — so this recipe silently does nothing until max_age is raised. A route override that must survive regardless needs a response subscriber running after FinishResponseSubscriber (priority < 0) or a CDN rule. The cache *metadata* is unaffected either way: it still drives tag invalidation and Drupal's own two caches.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of the decision Drupal makes on every response: FinishResponseSubscriber picks the directives, the page_cache middleware may downgrade them to private, and Symfony's header bag sorts and finishes the string.",
    lang: "php",
    code: `<?php
// A small model of what Drupal puts in Cache-Control, mirroring
// FinishResponseSubscriber plus the page_cache middleware's private downgrade.

const PAGE_MAX_AGE = 300; // system.performance:cache.page.max_age

// Mirrors Symfony's ResponseHeaderBag::computeCacheControlValue():
// directives are sorted by name, and "private" is appended when the response
// claims neither public nor s-maxage.
function compute_cache_control(array $directives): string {
  ksort($directives);
  $parts = [];
  foreach ($directives as $name => $value) {
    $parts[] = $value === TRUE ? $name : "$name=$value";
  }
  $header = implode(', ', $parts);
  if (isset($directives['public']) || isset($directives['private'])) {
    return $header;
  }
  return isset($directives['s-maxage']) ? $header : $header . ', private';
}

function respond(string $label, bool $is_cacheable_response, bool $policy_allows, bool $has_session_cookie): void {
  $vary = NULL;
  if ($is_cacheable_response && $policy_allows && PAGE_MAX_AGE > 0) {
    // setResponseCacheable()
    $directives = ['public' => TRUE, 'max-age' => PAGE_MAX_AGE];
    $vary = 'Cookie';
  }
  else {
    // setResponseNotCacheable()
    $directives = ['no-cache' => TRUE, 'must-revalidate' => TRUE];
  }

  // page_cache lookup(): session cookie + Vary: Cookie + no no-cache => private.
  if ($has_session_cookie && $vary === 'Cookie' && !isset($directives['no-cache'])) {
    unset($directives['public']);
    $directives['private'] = TRUE;
  }

  echo "--- $label\\n";
  echo "Cache-Control: " . compute_cache_control($directives) . "\\n";
  echo "Expires: Sun, 19 Nov 1978 05:00:00 GMT\\n";
  if ($vary !== NULL) {
    echo "Vary: $vary\\n";
  }
  $shared = isset($directives['public']);
  echo "shared cache may store it? " . ($shared ? 'yes' : 'no') . "\\n";
}

respond('anonymous node page', TRUE, TRUE, FALSE);
respond('same page, browser still holds a session cookie', TRUE, TRUE, TRUE);
respond('logged-in editor (request policy denies)', TRUE, FALSE, TRUE);
respond('streamed CSV download (not a CacheableResponse)', FALSE, TRUE, FALSE);
`,
    output: `--- anonymous node page
Cache-Control: max-age=300, public
Expires: Sun, 19 Nov 1978 05:00:00 GMT
Vary: Cookie
shared cache may store it? yes
--- same page, browser still holds a session cookie
Cache-Control: max-age=300, private
Expires: Sun, 19 Nov 1978 05:00:00 GMT
Vary: Cookie
shared cache may store it? no
--- logged-in editor (request policy denies)
Cache-Control: must-revalidate, no-cache, private
Expires: Sun, 19 Nov 1978 05:00:00 GMT
shared cache may store it? no
--- streamed CSV download (not a CacheableResponse)
Cache-Control: must-revalidate, no-cache, private
Expires: Sun, 19 Nov 1978 05:00:00 GMT
shared cache may store it? no
`,
  },

  keyPoints: [
    "Everything in front of Drupal speaks only Cache-Control / Expires / Vary; FinishResponseSubscriber is the translator from cacheability metadata to those headers.",
    "'Browser and proxy cache maximum age' (system.performance:cache.page.max_age) defaults to 0 and becomes a plain `max-age`, applied to browsers and shared caches alike — core never emits s-maxage.",
    "Uncacheable responses get `must-revalidate, no-cache, private`, an Expires date in 1978, and have ETag, Last-Modified and Vary stripped; a mere session cookie downgrades an otherwise-public response to `private`.",
    "X-Drupal-Cache reports the internal page cache and X-Drupal-Dynamic-Cache the dynamic page cache, each as HIT, MISS or — from Drupal 10.4 / 11.1 onward — a qualified UNCACHEABLE (request policy / response policy / no cacheability / poor cacheability); older minors send a bare UNCACHEABLE.",
    "http.response.debug_cacheability_headers: true in development.services.yml adds X-Drupal-Cache-Tags, -Contexts and -Max-Age — the fastest way to learn the cacheability model, and strictly a local-only setting.",
    "`curl -sSI <url>` twice, then again with cookies suppressed, diagnoses most reported cache misses before you touch Varnish or the CDN.",
  ],

  interview: [
    {
      q: "You increase 'Browser and proxy cache maximum age' to 1 hour. What actually changes on the wire, and what are the risks?",
      a: "Drupal starts sending `Cache-Control: max-age=3600, public` (plus `Vary: Cookie`) on responses that pass the page-cache policies instead of `must-revalidate, no-cache, private`. Because core emits a single `max-age` and no `s-maxage`, that hour applies to visitors' browsers as well as to Varnish or the CDN. That is the risk: cache tag invalidation can purge your reverse proxy, but it cannot reach into a browser that has already stored the page, so a corrected article can stay wrong on a reader's screen for an hour. On a news site the usual answer is a modest site-wide value and an explicit `s-maxage` (set in a response subscriber or by the CDN) so the edge holds pages long while browsers re-check often.",
    },
    {
      q: "A page shows `X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)`. How do you investigate?",
      a: "That value means dynamic page cache decided the response was not worth storing — typically max-age 0, a high-cardinality context such as `user` or `session`, or a tag that churns constantly. First enable `http.response.debug_cacheability_headers` locally and re-request the page: `X-Drupal-Cache-Max-Age` and `X-Drupal-Cache-Contexts` name the culprit directly. Then walk the render tree to find the offending component — usually a block or a field formatter that set `max-age: 0` or varied by `user` when `user.permissions` or `user.roles` would do. The fix is normally to auto-placeholder and lazy-build that fragment so the rest of the page keeps its cacheability rather than letting one widget poison the whole response.",
    },
    {
      q: "Why does Drupal send an Expires header dated 1978, even on pages it wants caches to store?",
      a: "It is a compatibility guard for HTTP/1.0 caches, which do not understand `Vary`. Without it, an ancient proxy could serve one visitor's cookie-varying page to somebody else. HTTP/1.1 clients — every browser and every modern reverse proxy — ignore `Expires` entirely whenever `Cache-Control: max-age` is present, so the past date costs nothing there. Seeing it in a `curl -I` dump is normal and is not the reason your CDN is missing; read `Cache-Control` instead.",
    },
    {
      q: "Contrast Drupal's header pipeline with Symfony's. Where does the responsibility sit in each?",
      a: "In Symfony the controller is the author: you call `setPublic()`, `setMaxAge()`, `setSharedMaxAge()` and `setVary()` on the `Response`, and `HttpCache` or Varnish obeys. In Drupal the controller usually returns a render array carrying `#cache` metadata and never touches headers; `FinishResponseSubscriber` converts that metadata plus one site-wide config value into `Cache-Control`. The vocabulary is identical because it is all just RFC 9111 — the difference is who fills it in. You can still take control per route by returning a `CacheableResponse` and setting `Cache-Control` explicitly, and core's `isCacheControlCustomized()` check will then leave your header alone — but only while the page-cache policies allow caching and `cache.page.max_age` is above 0, because that check sits inside the cacheable branch of `onRespond()`; otherwise `setResponseNotCacheable()` overwrites your header and you need a later response subscriber (priority < 0) or a CDN rule.",
    },
  ],

  quiz: [
    {
      question:
        "On a Drupal 10/11 site with 'Browser and proxy cache maximum age' set to 5 minutes, what does an anonymous, cookie-free request to a node page return in Cache-Control?",
      options: [
        "`public, s-maxage=300`",
        "`max-age=300, public`",
        "`max-age=0, s-maxage=300, public`",
        "`must-revalidate, no-cache, private`",
      ],
      answerIndex: 1,
      explain:
        "FinishResponseSubscriber::setResponseCacheable() sets `public, max-age=300`, and Symfony's header bag sorts the directives alphabetically before sending, so the wire format is `max-age=300, public`. Core never adds s-maxage on its own.",
    },
    {
      question:
        "Which configuration turns on the X-Drupal-Cache-Tags / -Contexts / -Max-Age response headers?",
      options: [
        "`$settings['cache_debug'] = TRUE;` in settings.php",
        "Ticking 'Show cache metadata' on /admin/config/development/performance",
        "`http.response.debug_cacheability_headers: true` as a container parameter, followed by a cache rebuild",
        "`drush state:set system.cache_debug 1`",
      ],
      answerIndex: 2,
      explain:
        "It is a service-container parameter, conventionally set in sites/development.services.yml (which settings.local.php registers via $settings['container_yamls']). Because it is compiled into the container, you must run `drush cache:rebuild` afterwards. There is no UI toggle and no state key for it.",
    },
    {
      question:
        "An anonymous visitor requests a cacheable page, but their browser still carries a leftover session cookie. What happens?",
      options: [
        "Nothing changes — cookies are ignored unless a session is actually open",
        "The response is still `public`, but Vary: Cookie is removed",
        "The page_cache middleware calls setPrivate(), so Cache-Control becomes `max-age=300, private` and no shared cache may store it",
        "Drupal returns a 304 Not Modified",
      ],
      answerIndex: 2,
      explain:
        "In PageCache::lookup(), when the request carries the session cookie, the response varies by Cookie, and Cache-Control has no `no-cache` directive, Drupal downgrades the response with setPrivate(). The browser may still cache it; Varnish and the CDN must not. This is why a stray cookie quietly kills edge hit rates.",
    },
    {
      question:
        "On Drupal 10.4+ / 11.1+, which of these values can legitimately appear in the X-Drupal-Cache header (the internal page cache)?",
      options: [
        "`UNCACHEABLE (poor cacheability)`",
        "`UNCACHEABLE (response policy)`",
        "`BYPASS`",
        "`STALE`",
      ],
      answerIndex: 1,
      explain:
        "The internal page cache reports HIT, MISS, `UNCACHEABLE (request policy)`, `UNCACHEABLE (response policy)` and `UNCACHEABLE (no cacheability)`. `UNCACHEABLE (poor cacheability)` belongs to X-Drupal-Dynamic-Cache, which additionally judges max-age, context cardinality and tag churn. BYPASS and STALE are Varnish/CDN vocabulary, not Drupal's. Note the version gate: the parenthesised reasons only exist from Drupal 10.4 / 11.1 onward — on 10.0–10.3 and 11.0 you get a bare `UNCACHEABLE` on both headers.",
    },
  ],
};

export default lesson;
