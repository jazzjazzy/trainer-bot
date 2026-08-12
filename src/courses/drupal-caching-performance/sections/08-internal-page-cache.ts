import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "internal-page-cache",
  title: "Internal Page Cache: The Anonymous Fast Path",
  part: "Page & Render Caching Layers",
  estMinutes: 12,
  summary:
    "The core page_cache module stores whole responses for anonymous users keyed by URL and returns them from a middleware before Drupal does any real work — the cheapest hit in the stack, and the one most easily switched off by accident.",

  concept: `
## A middleware, not a subscriber

\`page_cache\` registers one service, \`http_middleware.page_cache\`
(\`Drupal\\page_cache\\StackMiddleware\\PageCache\`), at priority 200 in the
HttpKernel stack. On a hit it returns a fully-formed \`Response\` **before**
routing, access checks, entity loads or rendering happen. There is no faster
path inside PHP: a hit is one cache-bin read plus a tag-checksum comparison.

The cache ID is deliberately dumb — scheme + host + request URI, plus the
request format:

\`\`\`php
// PageCache::getCacheId()
$cid_parts = [
  $request->getSchemeAndHttpHost() . $request->getRequestUri(),
  $request->getRequestFormat(NULL),
];
\`\`\`

That is the whole key. **Cache contexts are ignored.** Page Cache assumes every
anonymous visitor gets byte-identical HTML for a URL. If you genuinely need
anonymous output to vary by something (country, a query flag you have not put
in the URL), you must uninstall the module and let a reverse proxy or Dynamic
Page Cache handle it.

## What silently turns it off

Two policy chains decide. The **request** policy
(\`Drupal\\Core\\PageCache\\DefaultRequestPolicy\`) denies when the request is
not GET/HEAD, when it comes from the CLI, or when a **session cookie is
present** (\`NoSessionOpen\`). That last one is the classic production bug: one
\`Messenger\` call, one form that opens a session, one contrib module touching
\`$_SESSION\` on an anonymous request, and every subsequent request from that
visitor carries a cookie and skips the cache forever.

The **response** policy chain denies on the kill switch
(\`page_cache_kill_switch\`), on routes declaring \`no_cache: TRUE\`
(\`DenyNoCacheRoutes\`), and on 5xx (\`NoServerError\`). Responses that are not
\`CacheableResponseInterface\` — plus \`BinaryFileResponse\` and
\`StreamedResponse\` — are never stored, because there is no defined way to read
their cache tags. Current Drupal 10 and 11 tell you which one fired: the
\`X-Drupal-Cache\` header reports \`HIT\`, \`MISS\`,
\`UNCACHEABLE (request policy)\`, \`UNCACHEABLE (no cacheability)\` or
\`UNCACHEABLE (response policy)\`. One catch when you are reading it on a curl:
the header is only written for cacheable methods. \`handle()\` guards the write
with \`$request->isMethodCacheable()\`, so a POST, PUT or DELETE comes back with
**no** \`X-Drupal-Cache\` header at all — that is expected, not a sign the module
is missing. Diagnose with GET or HEAD.

4xx responses are stored, but only for \`Settings::get('cache_ttl_4xx', 3600)\`
seconds, so a crawler hammering bad URLs cannot fill the bin permanently. Set
that to 0 in \`settings.php\` to stop caching them at all.

## It ignores max-age — read this twice

Core's own comment in \`storeResponse()\`: *"Page cache entries default to
Cache::PERMANENT since they will be expired via cache tags locally. Because of
this, page cache ignores max age."* A \`#cache\` \`max-age\` of 0 on a block does
**not** keep the page out of \`cache_page\`. Entries live until a cache tag
invalidates them; that is why saving an incident node clears exactly the pages
that embedded it. To force a genuinely dynamic anonymous page you trigger the
kill switch as well.

Nor is the *Browser and proxy cache maximum age* select at
\`/admin/config/development/performance\` an on/off switch for this module. It
writes \`system.performance:cache.page.max_age\`, and \`FinishResponseSubscriber\`
turns it into \`Cache-Control: public, max-age=N\` for browsers, Varnish and your
CDN. Leave it at 0 and the internal page cache still works perfectly — you just
never let anything upstream cache.
`,

  comparisons: [
    {
      label: "Putting a whole-response cache in front of the kernel",
      intro:
        "Symfony ships HttpCache, a reverse proxy written in PHP that you wrap around the kernel in the front controller. Drupal ships the same idea as a stack middleware that is already wired up when the module is installed.",
      php: `<?php
// public/index.php — Symfony's PHP reverse proxy.
use Symfony\\Bundle\\FrameworkBundle\\HttpCache\\HttpCache;

return function (array $context) {
    $kernel = new Kernel($context['APP_ENV'], (bool) $context['APP_DEBUG']);

    if ('prod' === $context['APP_ENV']) {
        // Wraps the kernel; consults var/cache/prod/http_cache
        // before delegating. Obeys Cache-Control / Vary / ETag.
        $kernel = new HttpCache($kernel);
    }

    return $kernel;
};
// Everything is driven by HTTP semantics: s-maxage, Vary,
// stale-while-revalidate. Invalidation = purge or wait for TTL.`,
      ts: `# core/modules/page_cache/page_cache.services.yml
# (as shipped in 10.x and 11.0-11.2; 11.3+ drops the now-unused
# 'responder: true' attribute from the tag, nothing else changes)
services:
  _defaults:
    autoconfigure: true

  http_middleware.page_cache:
    class: Drupal\\page_cache\\StackMiddleware\\PageCache
    arguments: ['@cache.page', '@page_cache_request_policy', '@page_cache_response_policy']
    tags:
      - { name: http_middleware, priority: 200, responder: true }

  cache.page:
    class: Drupal\\Core\\Cache\\CacheBackendInterface
    tags:
      - { name: cache.bin }
    factory: ['@cache_factory', 'get']
    arguments: [page]`,
      rightLang: "yaml",
      note: "Same position in the stack, opposite philosophy: HttpCache keys on URL + Vary and expires on TTL; page_cache keys on URL only and expires on cache tags.",
    },
    {
      label: "Making one response uncacheable",
      intro:
        "A checkout confirmation, a rate-limited endpoint, a page showing a per-visitor A/B variant: you need this specific response to bypass the whole-page cache.",
      php: `<?php
// Symfony: say it in HTTP, because HTTP is the only contract
// HttpCache (or Varnish) understands.
public function confirmation(Request $request): Response
{
    $response = $this->render('order/confirm.html.twig');

    $response->setPrivate();
    $response->setMaxAge(0);
    $response->headers->addCacheControlDirective('no-store');
    $response->headers->addCacheControlDirective('must-revalidate');

    return $response;
}`,
      ts: `<?php
// Drupal: max-age alone is NOT enough for anonymous traffic —
// page_cache ignores max-age and expires on tags.
public function confirmation(): array {
  \\Drupal::service('page_cache_kill_switch')->trigger();

  return [
    '#markup' => $this->t('Thanks, your report was received.'),
    // Still declare it: this is what stops Dynamic Page Cache
    // and the render cache from storing the subtree.
    '#cache' => ['max-age' => 0],
  ];
}

// Whole-route alternative, in my_module.routing.yml:
//   options:
//     no_cache: TRUE
// -> DenyNoCacheRoutes denies both page caches for that route.`,
      note: "Inject Drupal\\Core\\PageCache\\ResponsePolicy\\KillSwitch rather than using \\Drupal:: in real code. The kill switch only affects Drupal's own caches — it does not stop a CDN, so pair it with a sane Cache-Control.",
    },
    {
      label: "Invalidating after an editor publishes",
      intro:
        "A breaking-news story is corrected. Every anonymous page that rendered it must stop serving the old HTML, immediately.",
      php: `<?php
// Symfony/HttpCache: you know URLs, not dependencies.
// Purge each one you can think of, or drop the whole store.
$store = new Store($cacheDir . '/http_cache');
$store->purge('https://news.example/incident/42');
$store->purge('https://news.example/');
$store->purge('https://news.example/incidents');

// With Varnish + FOSHttpCacheBundle you can get closer to tags,
// but only because *you* attached the headers yourself:
//   $response->headers->set('X-Cache-Tags', 'node-42,node-list');
//   $invalidator->invalidateTags(['node-42'])->flush();`,
      ts: `<?php
// Drupal: nothing to call. $node->save() invalidates 'node:42',
// which is already recorded on every cache_page row that
// rendered it, in the render cache, and in Dynamic Page Cache.

// Manual invalidation, when data changes outside the entity API:
use Drupal\\Core\\Cache\\Cache;

Cache::invalidateTags(['node:42']);
Cache::invalidateTags(['node_list:incident']);

// The bin does not delete rows. The cachetags table bumps a
// counter; a stored row whose tag checksum no longer matches
// is treated as a miss on the next read.`,
      note: "This is the real reason to keep responses CacheableResponseInterface: it is the only defined API page_cache has for reading a response's tags.",
    },
    {
      label: "The TTL setting, and what it actually controls",
      intro:
        "Both frameworks expose a global max-age. In Drupal the wording on the admin form causes endless confusion, so read the config key instead.",
      php: `# Symfony config/packages/framework.yaml
framework:
  http_cache:
    enabled: true
    # Default TTL applied when a response sets none.
    default_ttl: 0
    private_headers: ['Authorization', 'Cookie']

# Per-response, usually via the attribute:
#   #[Cache(public: true, maxage: 300, smaxage: 900)]
# HttpCache stores nothing without a positive TTL or a validator.`,
      ts: `# config/sync/system.performance.yml
cache:
  page:
    max_age: 900        # -> Cache-Control: public, max-age=900
                        # ships as 0; the admin form calls this
                        # "Browser and proxy cache maximum age"

# Same edit without touching the UI:
#   drush config:set system.performance cache.page.max_age 900 -y
#   drush cr
#
# Read it back on a real request:
#   curl -sI https://news.example/incident/42 \\
#     | grep -iE 'x-drupal-cache|cache-control|expires'`,
      leftLang: "yaml",
      rightLang: "yaml",
      note: "cache.page.max_age governs the Cache-Control header sent to browsers/proxies only. Set it to 0 and the internal page cache still stores and serves everything — it just never lets Varnish or a CDN help.",
    },
  ],

  playground: {
    intro:
      "A miniature of the page_cache middleware: the request policy, the URL-only cache ID, the tag checksum, and the X-Drupal-Cache header it reports. Predict each line before you run it.",
    lang: "php",
    code: `<?php
// A miniature of Drupal's page_cache StackMiddleware: request policy,
// URL-keyed cache id, tag checksums, and the X-Drupal-Cache header.

final class Req {
  public function __construct(
    public string $method,
    public string $uri,
    public bool $hasSessionCookie = false,
  ) {}
  // PageCache::getCacheId() -> host+uri joined with the request format.
  public function cid(): string {
    return 'https://news.example' . $this->uri . ':html';
  }
}

final class Resp {
  public function __construct(
    public int $status,
    public array $tags,
    public bool $cacheable = true,   // instanceof CacheableResponseInterface
    public bool $killSwitch = false, // page_cache_kill_switch->trigger()
  ) {}
}

// DefaultRequestPolicy: CommandLineOrUnsafeMethod + NoSessionOpen.
function requestPolicy(Req $r): bool {
  return in_array($r->method, ['GET', 'HEAD'], true) && !$r->hasSessionCookie;
}

// ChainResponsePolicy: KillSwitch + DenyNoCacheRoutes + NoServerError.
function responsePolicy(Resp $r): bool {
  return !$r->killSwitch && $r->status < 500;
}

$bin = [];              // cache_page rows: cid => [tags, checksum]
$checksums = [];        // cachetags table: tag => invalidation count
$log = [];

function tagChecksum(array $tags, array $checksums): int {
  $sum = 0;
  foreach ($tags as $t) {
    $sum += $checksums[$t] ?? 0;
  }
  return $sum;
}

function handle(Req $req, Resp $resp, array &$bin, array &$checksums, array &$log): void {
  if (!requestPolicy($req)) {
    // Core only writes the header when the method is cacheable (GET/HEAD):
    // "Don't indicate non-cacheability on responses to uncacheable requests."
    // A POST therefore comes back with NO X-Drupal-Cache header at all.
    $cacheableMethod = in_array($req->method, ['GET', 'HEAD'], true);
    $log[] = [$req->method . ' ' . $req->uri, $cacheableMethod ? 'UNCACHEABLE (request policy)' : NULL];
    return;
  }
  $cid = $req->cid();
  if (isset($bin[$cid]) && $bin[$cid]['checksum'] === tagChecksum($bin[$cid]['tags'], $checksums)) {
    $log[] = [$req->method . ' ' . $req->uri, 'HIT'];
    return;
  }
  // Miss: the real kernel runs, then storeResponse() decides.
  if (!$resp->cacheable) {
    $log[] = [$req->method . ' ' . $req->uri, 'UNCACHEABLE (no cacheability)'];
    return;
  }
  if (!responsePolicy($resp)) {
    $log[] = [$req->method . ' ' . $req->uri, 'UNCACHEABLE (response policy)'];
    return;
  }
  $bin[$cid] = ['tags' => $resp->tags, 'checksum' => tagChecksum($resp->tags, $checksums)];
  $log[] = [$req->method . ' ' . $req->uri, 'MISS'];
}

$article = new Resp(200, ['node:42', 'node_view', 'config:user.role.anonymous']);

handle(new Req('GET', '/incident/42'), $article, $bin, $checksums, $log);
handle(new Req('GET', '/incident/42'), $article, $bin, $checksums, $log);
handle(new Req('GET', '/incident/42', true), $article, $bin, $checksums, $log);
handle(new Req('POST', '/incident/42'), $article, $bin, $checksums, $log);
handle(new Req('GET', '/incident/42?utm_source=x'), $article, $bin, $checksums, $log);
handle(new Req('GET', '/status'), new Resp(200, [], true, true), $bin, $checksums, $log);
handle(new Req('GET', '/feed.xml'), new Resp(200, ['node_list'], false), $bin, $checksums, $log);

// An editor saves node 42: Cache::invalidateTags(['node:42']).
$checksums['node:42'] = ($checksums['node:42'] ?? 0) + 1;
handle(new Req('GET', '/incident/42'), $article, $bin, $checksums, $log);
handle(new Req('GET', '/incident/42'), $article, $bin, $checksums, $log);

foreach ($log as [$line, $header]) {
  printf("%-32s %s\\n", $line, $header === NULL ? '(no X-Drupal-Cache header)' : 'X-Drupal-Cache: ' . $header);
}

echo "\\ncache_page rows:\\n";
foreach ($bin as $cid => $row) {
  echo '  ' . $cid . '  tags=' . implode(',', $row['tags']) . "\\n";
}`,
    output: `GET /incident/42                 X-Drupal-Cache: MISS
GET /incident/42                 X-Drupal-Cache: HIT
GET /incident/42                 X-Drupal-Cache: UNCACHEABLE (request policy)
POST /incident/42                (no X-Drupal-Cache header)
GET /incident/42?utm_source=x    X-Drupal-Cache: MISS
GET /status                      X-Drupal-Cache: UNCACHEABLE (response policy)
GET /feed.xml                    X-Drupal-Cache: UNCACHEABLE (no cacheability)
GET /incident/42                 X-Drupal-Cache: MISS
GET /incident/42                 X-Drupal-Cache: HIT

cache_page rows:
  https://news.example/incident/42:html  tags=node:42,node_view,config:user.role.anonymous
  https://news.example/incident/42?utm_source=x:html  tags=node:42,node_view,config:user.role.anonymous
`,
  },

  keyPoints: [
    "page_cache runs as http_middleware.page_cache at priority 200 and returns a stored response before routing, access or rendering — the cheapest hit Drupal has.",
    "The cache ID is scheme+host+request URI plus request format. Cache contexts are ignored entirely, so anonymous output must be identical per URL; query strings create separate entries.",
    "It only applies to anonymous, session-free GET/HEAD requests. A Messenger call or any code opening a session poisons the fast path for that visitor from then on.",
    "Storage requires a CacheableResponseInterface response that passes the response policy chain: kill switch, no_cache routes and 5xx are denied; 4xx are kept only for Settings::get('cache_ttl_4xx', 3600) seconds.",
    "Entries are stored as Cache::PERMANENT and expire by cache tag, not by TTL — page_cache deliberately ignores max-age, so '#cache' => ['max-age' => 0] alone does not keep a page out of it; trigger page_cache_kill_switch instead.",
    "system.performance:cache.page.max_age (the 'Browser and proxy cache maximum age' select) only sets Cache-Control: public, max-age=N for browsers and upstream proxies; it does not switch the internal page cache on or off. Read X-Drupal-Cache on a curl to see which policy refused.",
  ],

  interview: [
    {
      q: "A client reports the site is slow for anonymous users even though Internal Page Cache is enabled. How do you diagnose it?",
      a: "I start at the HTTP layer, not the code: `curl -sI https://site/path` as a truly anonymous client and read `X-Drupal-Cache`. `HIT`/`MISS` means the module is doing its job and the problem is elsewhere; `UNCACHEABLE (request policy)` almost always means a session cookie is being set on anonymous requests, and `UNCACHEABLE (response policy)` means something triggered `page_cache_kill_switch` or the route declares `no_cache: TRUE`. Session leakage is the usual culprit — a `Messenger` message, a contrib module writing to `$_SESSION`, or a form that opens a session — and I find it by hitting the URL with a clean cookie jar and checking whether a `SESS…` cookie comes back. If the header says `UNCACHEABLE (no cacheability)`, a controller is returning a plain `Response` instead of a `CacheableResponse`. I'd also turn on `http.response.debug_cacheability_headers` in `development.services.yml` on a non-production environment to see the tags and contexts involved."
    },
    {
      q: "You come from Symfony. How would you explain the difference between Symfony's HttpCache and Drupal's Internal Page Cache to your team?",
      a: "They occupy the same slot — a whole-response cache wrapped around the kernel — but they invalidate on opposite principles. Symfony's `HttpCache` is a faithful HTTP/1.1 proxy: it keys on URL plus `Vary`, respects `s-maxage`, `ETag` and `stale-while-revalidate`, and you get freshness by expiry or by purging URLs you have to enumerate yourself. Drupal's `page_cache` middleware keys on URL alone, ignores `Vary` and ignores `max-age`, stores entries as `Cache::PERMANENT`, and relies on cache tags recorded on the response to expire exactly the right entries when a node or config object is saved. In practice that means Drupal can serve a permanently cached homepage and still be correct within milliseconds of an editor publishing, which HttpCache cannot do without a tag-aware proxy such as Varnish plus FOSHttpCache. In production you normally run both: Drupal's page cache as a safety net and a real Varnish or CDN in front of it."
    },
    {
      q: "Why does Internal Page Cache do nothing for logged-in users, and what do you use instead?",
      a: "Because the request policy chain (`DefaultRequestPolicy`) includes `NoSessionOpen`, and an authenticated request always carries a session cookie, so the middleware passes straight through to the kernel. That is deliberate: the module's cache ID has no notion of cache contexts, so serving a stored page to a logged-in user would leak one person's personalised markup to another. For authenticated traffic you rely on Dynamic Page Cache, which caches the response *with* cache contexts and with `#lazy_builder` placeholders left un-rendered, plus the render cache underneath it. The optimisation goal there changes from 'zero work' to 'as much of the page as possible is shared, with only the genuinely personal fragments rebuilt per request'."
    },
    {
      q: "An editor complains a page is stale for anonymous visitors even after re-saving the node. Where do you look?",
      a: "Since page_cache expires by tag rather than TTL, staleness means a tag is missing rather than an expiry being too long. I check whether the response actually carried the tag: with debug cacheability headers on, `X-Drupal-Cache-Tags` should list `node:42` for a page embedding that node. Common causes are a custom block or controller building markup from a raw database query without calling `$renderer->addCacheableDependency($build, $entity)`, or a listing that lacks `node_list` / `node_list:incident`. I'd also confirm the staleness is not upstream: if `Cache-Control: public, max-age=900` is set, a browser or CDN may be holding the old copy for up to fifteen minutes regardless of what Drupal did, which is why tag-aware CDN purging matters as much as getting the tags right."
    },
  ],

  quiz: [
    {
      question:
        "An anonymous page renders a block with '#cache' => ['max-age' => 0]. What happens to the Internal Page Cache?",
      options: [
        "The whole page is excluded from cache_page, because max-age bubbles up and makes the response uncacheable.",
        "Nothing — page_cache ignores max-age, stores the response as Cache::PERMANENT and expires it by cache tag.",
        "The page is stored but only for 1 second, then re-fetched.",
        "The response policy chain denies it via NoServerError.",
      ],
      answerIndex: 1,
      explain:
        "Core's storeResponse() comment says it outright: entries default to Cache::PERMANENT because they are expired via cache tags, so page cache ignores max age. To keep an anonymous page out of cache_page you must trigger page_cache_kill_switch (or declare no_cache: TRUE on the route). The max-age is still worth declaring — it governs the render cache and Dynamic Page Cache.",
    },
    {
      question:
        "Which of these makes the page_cache middleware pass a request straight through to the kernel without consulting the cache?",
      options: [
        "The response carries the cache tag node:42.",
        "The request has a session cookie, so NoSessionOpen denies it.",
        "system.performance:cache.page.max_age is set to 0.",
        "The route is served over HTTPS.",
      ],
      answerIndex: 1,
      explain:
        "DefaultRequestPolicy chains CommandLineOrUnsafeMethod and NoSessionOpen, so a session cookie (or a non-GET/HEAD method, or a CLI request) yields 'UNCACHEABLE (request policy)'. cache.page.max_age only controls the Cache-Control header sent to browsers and proxies; leaving it at 0 does not disable the internal page cache.",
    },
    {
      question:
        "Your marketing team wants the anonymous homepage to show a different hero image per visitor country, resolved from a GeoIP header. Internal Page Cache is enabled. What is the correct assessment?",
      options: [
        "Add a 'headers:X-Country' cache context and page_cache will store one entry per country.",
        "Add the context to the render array and bump cache.page.max_age so entries rotate.",
        "page_cache keys on URL only and ignores cache contexts, so it would serve one country's hero to everyone — uninstall it and vary at the reverse proxy or Dynamic Page Cache layer.",
        "Trigger page_cache_kill_switch on every request so the homepage is always rebuilt.",
      ],
      answerIndex: 2,
      explain:
        "The cache ID is scheme+host+request URI plus request format — nothing else. Cache contexts influence the render cache and Dynamic Page Cache but are invisible to page_cache, so anonymous output must be identical per URL. Either uninstall page_cache and let a context-aware layer handle the variation, or push the variation to a Vary-aware CDN. Killing the cache on every request would work but throws away the entire anonymous fast path.",
    },
    {
      question:
        "A crawler is hitting thousands of non-existent URLs. What does Internal Page Cache do with those 404 responses by default?",
      options: [
        "Stores them permanently, like any other response.",
        "Refuses to store them, because NoServerError denies all error responses.",
        "Stores them for Settings::get('cache_ttl_4xx', 3600) seconds, i.e. one hour unless overridden.",
        "Stores them only if fast_404 is disabled.",
      ],
      answerIndex: 2,
      explain:
        "storeResponse() special-cases client errors: 4xx entries get an expiry of REQUEST_TIME + cache_ttl_4xx (default 3600) so they cannot fill a non-LRU backend permanently, and setting cache_ttl_4xx to 0 in settings.php stops them being cached at all. NoServerError denies 5xx, not 4xx. fast_404 is a separate, earlier optimisation for missing static assets.",
    },
  ],
};

export default lesson;
