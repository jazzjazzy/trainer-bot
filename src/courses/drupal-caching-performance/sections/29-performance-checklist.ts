import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "performance-checklist",
  title: "The Performance Audit Checklist",
  part: "Measurement & Operations",
  estMinutes: 13,
  summary:
    "A repeatable nine-step audit you can run on any Drupal site — confirm the config, classify the cache headers, remove what makes pages uncacheable, then profile, count queries and prove invalidation actually reaches the edge.",

  concept: `
## Order is the method

Every slow-Drupal engagement starts the same way: someone hands you a site, a
vague complaint ("it's slow in the afternoon") and root access. The temptation
is to open a profiler. Resist it. **A profiler measures the code path that
runs — it cannot tell you that this page should never have executed at all.**
Profile a page that is uncacheable by accident and you will spend a week
optimising a render path that ought to have been a 200-byte cache hit.

So the audit runs cheapest-and-most-leveraged first. Steps 1–3 cost minutes and
routinely halve response times; steps 4–7 are the real engineering; steps 8–9
stop you shipping a fix that only works on your laptop.

### The nine steps

1. **Confirm the obvious.** Are \`page_cache\` and \`dynamic_page_cache\`
   installed? Is *Page cache maximum age* non-zero? Is CSS/JS aggregation on?
   Is this a production \`settings.php\` — no \`development.services.yml\`, no
   null cache backends, opcache on? *Likely finding:* aggregation was switched
   off during a theme sprint two years ago, or \`page.max_age\` is 0.
2. **Read the headers on representative URLs.** Pick five: front page, a
   listing, an article, a search result, a logged-in page. \`curl -sSI\` each
   and record \`X-Drupal-Cache\`, \`X-Drupal-Dynamic-Cache\`, \`Cache-Control\`
   and \`Age\`. *Good:* anonymous pages HIT. *Likely finding:* everything MISSes.
3. **Find what makes pages uncacheable.** \`UNCACHEABLE (poor cacheability)\`
   means max-age 0 bubbled up; a bypassed page cache usually means a session
   started or a \`NO_CACHE\`-style cookie was set. *Likely finding:* one block
   or formatter setting \`max-age: 0\` that should be a lazy builder.
4. **Profile the worst remaining cache-miss page.** XHProf, Excimer or
   Blackfire, on the real dataset, warmed once then measured. *Good:* no single
   function over ~15% exclusive time. *Likely finding:* image style derivatives
   or a third-party HTTP call rendered inline.
5. **Count queries and hunt N+1s.** *Good:* a listing under ~50 queries.
   *Likely finding:* the same SELECT with a different id, dozens of times —
   replace with \`loadMultiple()\` or an entity query plus one load.
6. **Audit Views.** Caching plugin, pager limit, \`disable_sql_rewrite\`, and
   whether the view renders full entities where fields would do. *Likely
   finding:* caching set to *None* by someone chasing a stale-block bug.
7. **Check the backends and the runtime.** Cache bins in the database under
   load, opcache full or restarting, \`realpath_cache_size\` at its default,
   PHP-FPM \`pm.max_children\` unrelated to actual memory.
8. **Front-end pass.** Lighthouse on a *cached* URL, mobile profile. LCP,
   unused JS, uncompressed images.
9. **Prove invalidation end to end.** Edit a node, then re-request the URL
   through the CDN. If the edge does not go stale, your cache tags never
   reached it — and every earlier win is one editor complaint from being
   reverted.
`,

  comparisons: [
    {
      label: "Step 1 — is the 'production' site actually configured for production?",
      intro:
        "Both stacks have a handful of facts that must be true before any measurement is meaningful. Check them with commands, not by asking the team.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: prove the app is running prod, not dev on a prod hostname.
php bin/console about
#  Environment  prod
#  Debug        false
#  PHP OPcache  Enabled

# Was it deployed with an optimised autoloader?
composer install --no-dev --optimize-autoloader --classmap-authoritative

# Is the reverse-proxy kernel actually wired up?
grep -R "http_cache" config/packages/framework.yaml
#  http_cache: true

# Which pools exist, and are any of them still array/filesystem adapters?
php bin/console cache:pool:list`,
      ts: `# Drupal: four facts, four commands. Anything unexpected halts the audit.
drush pm:list --status=enabled | grep -i cache
#  Core  Internal Dynamic Page Cache (dynamic_page_cache)  Enabled
#  Core  Internal Page Cache (page_cache)                  Enabled

drush config:get system.performance
#  cache:
#    page:
#      max_age: 900      <- 0 means "tell proxies not to cache this"
#  css:
#    preprocess: true    <- aggregation
#  js:
#    preprocess: true

# Production settings.php smells: a null backend or the dev services file.
grep -nE "cache.backend.null|development.services.yml|rebuild_access" \\
  web/sites/default/settings.php

drush core:requirements   # opcache, cron, DB version, pending updates
php -i | grep -E "opcache.enable|opcache.memory_consumption|realpath_cache_size"`,
      note: "Drupal keeps these in three places — modules, config, and settings.php — so all three have to be checked; a site can have page_cache installed and still send max-age 0.",
    },
    {
      label: "Steps 2–3 — read the headers, then classify",
      intro:
        "Every layer in front of the application only sees HTTP headers. Reading them for five representative URLs tells you which pages are cached, which are cold, and which can never be cached at all.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony HttpCache: X-Symfony-Cache appears when the kernel runs in debug.
curl -sSI https://app.example.com/incidents \\
  | grep -Ei 'cache-control|age|vary|x-symfony-cache'

#  Cache-Control: max-age=300, public
#  Age: 42
#  Vary: Accept-Encoding
#  X-Symfony-Cache: GET /incidents: fresh

# Verdicts you get: fresh / stale / miss / invalid, plus store/ignore.
# No header at all usually means the kernel was never wrapped in HttpCache.`,
      ts: `# Drupal: two verdict headers, one per page-cache layer.
for u in / /incidents /node/412 "/search?q=fire" /user/login; do
  echo "== $u"
  curl -sSI "https://news.example.com$u" \\
    | grep -Ei 'x-drupal-cache|cache-control|^age|set-cookie'
done

#  == /
#  X-Drupal-Cache: HIT                          <- anonymous page cache
#  X-Drupal-Dynamic-Cache: HIT
#  Cache-Control: public, max-age=900
#  == /node/412
#  X-Drupal-Cache: MISS                         <- yes, MISS. See below.
#  X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)
#  Cache-Control: public, max-age=900

# Two traps in that second block:
#  - The internal page cache ignores max-age entirely: it stores entries as
#    Cache::PERMANENT and invalidates them by tag. A bubbled max-age 0 never
#    reaches X-Drupal-Cache, so it reads MISS here and HIT on the next
#    request. UNCACHEABLE (response policy) means page_cache_kill_switch,
#    a route with no_cache: TRUE, or a 5xx; UNCACHEABLE (request policy)
#    means a session was open or the method was not GET/HEAD.
#  - Cache-Control is built from system.performance cache.page.max_age, not
#    from the response's bubbled max-age, so it still advertises 900s. The
#    uncacheable string, when you do see it, is 'must-revalidate, no-cache,
#    private'.

# Then locally only, to name the culprit:
#   parameters:
#     http.response.debug_cacheability_headers: true
# -> X-Drupal-Cache-Max-Age: 0 (Uncacheable), plus -Tags and -Contexts.`,
      note: "X-Drupal-Cache is the internal page cache (anonymous only); X-Drupal-Dynamic-Cache is the dynamic page cache and is the one that reports 'poor cacheability' for max-age 0.",
    },
    {
      label: "Steps 5–6 — query counts, then the Views settings that cause them",
      intro:
        "A listing that issues hundreds of queries is almost always an N+1 or a Views display with caching turned off and full entities being rendered.",
      leftLang: "php",
      rightLang: "yaml",
      php: `// Symfony: the profiler's Doctrine panel gives a per-request query count,
// and the same number is assertable in a functional test so it cannot regress.
public function testIncidentListStaysCheap(): void
{
    $client = static::createClient();
    $client->enableProfiler();
    $client->request('GET', '/incidents');

    $db = $client->getProfile()->getCollector('db');
    self::assertLessThan(30, $db->getQueryCount());
}

// An N+1 reads as the same SQL repeated with a different parameter:
//   SELECT * FROM incident_author WHERE id = ?   x 50
// Fixes: a fetch join in the DQL, or one batched WHERE id IN (...).`,
      ts: `# The exported display config is where a Views audit actually happens.
# views.view.incident_feed.yml
display:
  default:
    display_options:
      cache:
        type: tag          # tag | time | none  <- 'none' is the smell
        options: {  }
      pager:
        type: some
        options:
          items_per_page: 10   # not 0 = all
          offset: 0
      row:
        type: 'entity:node'
        options:
          view_mode: teaser    # 'full' renders every field of every row
      query:
        type: views_query
        options:
          disable_sql_rewrite: false  # true removes the node_access join
          distinct: false`,
      note: "Tag-based Views caching invalidates on the relevant list tags, so it is almost always right; someone switching it to 'none' to fix a staleness bug is one of the most common findings on a slow site.",
    },
    {
      label: "Step 9 — prove invalidation reaches the edge",
      intro:
        "The audit is not finished when the site is fast; it is finished when an editor's change is visible within seconds and the cache still holds for everyone else.",
      leftLang: "php",
      rightLang: "bash",
      php: `// Symfony + FOSHttpCacheBundle: tag the response, then BAN by tag.
final class IncidentController extends AbstractController
{
    public function show(Incident $incident, ResponseTagger $tagger): Response
    {
        $tagger->addTags(['incident-' . $incident->getId()]);
        $response = $this->render('incident/show.html.twig', [...]);
        $response->setPublic()->setMaxAge(300);
        return $response;
    }
}

// On update, from a Doctrine listener or a message handler:
$this->cacheManager->invalidateTags(['incident-412']);
// The bundle flushes queued invalidations on kernel.terminate.`,
      ts: `# 1. Save a change, without clicking through the UI.
drush php:eval "\\Drupal\\node\\Entity\\Node::load(412)
  ->setTitle('Ferry terminal reopened')->save();"

# 2. Purge queue: did the tag invalidation turn into an edge request?
drush p:diagnostics     # every row must be OK / WARNING, never ERROR
drush p:queue-work      # processes queued invalidations now, not on cron

# 3. Ask the edge, not the origin.
curl -sSI https://news.example.com/node/412 | grep -Ei 'x-cache|^age|x-drupal'
#  X-Cache: MISS        <- correct: the edge object was purged
#  Age: 0
#  X-Drupal-Cache: MISS

# 4. Re-request: it must go back to HIT immediately.
curl -sSI https://news.example.com/node/412 | grep -Ei 'x-cache|^age'
#  X-Cache: HIT
#  Age: 3`,
      note: "If step 3 still shows a warm Age, the tags never left Drupal — check that purge has a purger configured for the CDN, not just a queue filling up.",
    },
  ],

  playground: {
    intro:
      "Steps 2 and 3 of the audit, automated. Feed in what curl reported for five representative URLs and let the script classify each one and tell you what to fix first.",
    lang: "php",
    code: `<?php
// Step 2 + 3 of the audit, automated. Each row is what curl -sSI reported
// for one representative URL, requested as an anonymous visitor.
$samples = [
  ['url' => '/',              'page' => 'HIT',         'dynamic' => 'HIT',         'maxage' => -1,  'sess' => false],
  ['url' => '/incidents',     'page' => 'MISS',        'dynamic' => 'HIT',         'maxage' => 300, 'sess' => false],
  ['url' => '/node/412',      'page' => 'MISS',        'dynamic' => 'UNCACHEABLE', 'maxage' => 0,   'sess' => false],
  ['url' => '/alerts/live',   'page' => 'UNCACHEABLE', 'dynamic' => 'MISS',        'maxage' => 60,  'sess' => true],
  ['url' => '/search?q=fire', 'page' => 'MISS',        'dynamic' => 'MISS',        'maxage' => -1,  'sess' => false],
];

function classify(array $s): array {
  if ($s['sess']) {
    return ['SESSION', 'a session was started: page cache is bypassed for this URL'];
  }
  if ($s['maxage'] === 0) {
    return ['POISONED', 'max-age 0 bubbled to the response: find the element that set it'];
  }
  if ($s['page'] === 'HIT') {
    return ['GOOD', 'served from the page cache without booting the render pipeline'];
  }
  if ($s['dynamic'] === 'HIT') {
    return ['WARM', 'render work reused; only the page-cache entry was cold'];
  }
  return ['COLD', 'full render on every request: profile this one next'];
}

$counts = [];
printf("%-14s %-9s %s\\n", 'URL', 'VERDICT', 'WHAT IT MEANS');
echo str_repeat('-', 76), "\\n";
foreach ($samples as $s) {
  [$verdict, $why] = classify($s);
  $counts[$verdict] = ($counts[$verdict] ?? 0) + 1;
  printf("%-14s %-9s %s\\n", $s['url'], $verdict, $why);
}

$cacheable = count($samples) - ($counts['POISONED'] ?? 0) - ($counts['SESSION'] ?? 0);
echo "\\n";
echo "cacheable for anonymous: ", $cacheable, '/', count($samples), "\\n";
echo "fix order: ", implode(' -> ', ['POISONED', 'SESSION', 'COLD']), "\\n";
echo "\\nNever profile before this table is clean - a page that is\\n";
echo "uncacheable by design will dominate every profile you take.\\n";
`,
    output: `URL            VERDICT   WHAT IT MEANS
----------------------------------------------------------------------------
/              GOOD      served from the page cache without booting the render pipeline
/incidents     WARM      render work reused; only the page-cache entry was cold
/node/412      POISONED  max-age 0 bubbled to the response: find the element that set it
/alerts/live   SESSION   a session was started: page cache is bypassed for this URL
/search?q=fire COLD      full render on every request: profile this one next

cacheable for anonymous: 3/5
fix order: POISONED -> SESSION -> COLD

Never profile before this table is clean - a page that is
uncacheable by design will dominate every profile you take.
`,
  },

  keyPoints: [
    "Audit in order: config checks and header classification cost minutes and usually beat any code change, so they come before the profiler.",
    "Classify five representative URLs by X-Drupal-Cache and X-Drupal-Dynamic-Cache before touching anything — HIT, MISS and UNCACHEABLE lead to completely different fixes.",
    "Uncacheable beats slow — but name the layer: a max-age 0 bubbling from one block kills Dynamic Page Cache and the render cache, while the internal page cache ignores max-age (it expires by tag), so that layer is only lost to an accidental session start via the request policy, or to the page cache kill switch.",
    "Only profile a page that is legitimately a cache miss; profiling an accidentally uncacheable page optimises work that should never have run.",
    "Views displays are a reliable source of findings: caching set to 'none', an unlimited pager, or full entities rendered where teasers would do.",
    "The audit ends with a live invalidation test through the CDN — if editing a node does not make the edge go stale, the tag pipeline is broken and every other win is temporary.",
  ],

  interview: [
    {
      q: "You are given a slow Drupal site and one day. Walk me through your first two hours.",
      a: "I would spend them on measurement and configuration, not code. First, confirm the boring things with `drush pm:list` and `drush config:get system.performance`: page cache and dynamic page cache installed, *Page cache maximum age* non-zero, CSS/JS aggregation on, and a production `settings.php` with no null cache backends or dev services file. Second, `curl -sSI` five representative URLs — front page, listing, article, search, a logged-in page — and record `X-Drupal-Cache`, `X-Drupal-Dynamic-Cache`, `Cache-Control` and `Age`, which classifies every URL as HIT, MISS or UNCACHEABLE. Third, chase the UNCACHEABLE ones, being precise about which layer each cause takes out: a `max-age: 0` bubbling up from one block defeats Dynamic Page Cache and the render cache for the entire response, whereas the internal page cache ignores max-age and expires by tag, so it is only lost to an accidental session start (request policy) or to `page_cache_kill_switch`. Only after that would I open a profiler, and only on a page that is genuinely a cache miss — otherwise I would be tuning code that should never have executed.",
    },
    {
      q: "Why not start with the profiler? In Symfony that is usually the first thing I reach for.",
      a: "Because the two stacks put the leverage in different places. In a typical Symfony app the request nearly always runs, so a Blackfire or profiler trace really does show you the cost. Drupal's design assumption is that most anonymous requests never reach the render pipeline at all — they are answered by the internal page cache, a reverse proxy or a CDN. So the question 'why is this request expensive' is usually less useful than 'why is this request happening'. A profiler cannot answer the second one: it happily reports 400ms of legitimate render work on a page that a single stray cache context stopped anyone from ever reusing. Once the header classification is clean, the profiler becomes exactly as valuable as it is in Symfony.",
    },
    {
      q: "What do you check when everything looks correctly cached but the site is still slow for logged-in editors?",
      a: "Authenticated traffic skips the internal page cache entirely, so the layers that matter are dynamic page cache, render cache and the backends underneath them. I would check that the dynamic page cache is actually returning HITs for editors — a personalised element that varies by `user` instead of `user.permissions`, or one that is not behind a `#lazy_builder`, will drag the whole response down to UNCACHEABLE. Then I would look at where the cache bins live: on a site with heavy authenticated traffic, database-backed `cache_render` and `cache_dynamic_page_cache` bins plus lock contention often become the bottleneck, which is the case for Redis or Memcache. Finally the runtime: opcache size and restart counts, `realpath_cache_size`, and PHP-FPM `pm.max_children` set from actual per-worker memory rather than copied from a blog post.",
    },
    {
      q: "How do you verify an invalidation fix rather than just believing it?",
      a: "End to end, through the edge, with a real content change. I save an edit — `drush php:eval` with a node load and `save()` is enough — then check the purge pipeline with `drush p:diagnostics` and drain it with `drush p:queue-work` rather than waiting for cron. Then I request the URL from the CDN, not the origin, and expect `X-Cache: MISS` with `Age: 0`; a second request must return to `X-Cache: HIT`. If the object stays warm, the cache tags never left Drupal, which usually means purge has a queue but no purger configured for the CDN. This test is the one I automate afterwards, because it is the failure mode that silently returns months later.",
    },
  ],

  quiz: [
    {
      question:
        "Why does the audit put header classification before profiling?",
      options: [
        "Profilers are unreliable on Drupal because of the render pipeline",
        "A profiler shows the cost of a request but cannot tell you the request should never have executed",
        "Profilers cannot be installed on production hosts",
        "Header inspection also measures PHP function timings",
      ],
      answerIndex: 1,
      explain:
        "Most anonymous Drupal traffic is meant to be answered by a cache layer before any rendering happens. Profiling an accidentally uncacheable page produces a beautiful trace of work that should never have run; fixing the cacheability deletes the whole trace.",
    },
    {
      question:
        "An anonymous request returns `X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)`. What is the most likely cause?",
      options: [
        "Redis is not configured for the dynamic_page_cache bin",
        "The response is missing a Vary header",
        "Something in the render tree set max-age 0 (or a very high-cardinality context) and it bubbled to the response",
        "CSS/JS aggregation is switched off",
      ],
      answerIndex: 2,
      explain:
        "'Poor cacheability' is the dynamic page cache's verdict on a response whose merged cacheability makes it not worth storing — classically a `max-age: 0` or a `user`/`session` context bubbling up from one small element. Enabling `http.response.debug_cacheability_headers` locally names the culprit via X-Drupal-Cache-Max-Age and -Contexts.",
    },
    {
      question:
        "Auditing a Views display on the incident listing, which finding most directly explains hundreds of queries per request?",
      options: [
        "Caching plugin set to 'none', an unlimited pager, and rows rendered as full entities",
        "The view uses a page display instead of a block display",
        "The view has an exposed filter",
        "The view's machine name does not match its label",
      ],
      answerIndex: 0,
      explain:
        "Those three settings compound: no result or output caching means the query and render run every time, an unlimited pager means every row, and 'full' view mode renders every field of every row. Tag-based caching, a real pager limit, and a teaser or fields row plugin usually fix it without any code.",
    },
    {
      question:
        "The final audit step is editing a node and re-requesting the URL through the CDN. What is that step actually proving?",
      options: [
        "That the origin server can render the node quickly",
        "That cache tags travel all the way from Drupal to the edge, so caching can be aggressive without serving stale content",
        "That the CDN supports HTTP/2",
        "That the editor has permission to save the node",
      ],
      answerIndex: 1,
      explain:
        "Long TTLs at the edge are only safe if invalidation works. If the edge object does not go stale after a content change, the tag pipeline is broken — and the usual response to the resulting editor complaints is to shorten TTLs, which quietly undoes every earlier improvement.",
    },
  ],
};

export default lesson;
