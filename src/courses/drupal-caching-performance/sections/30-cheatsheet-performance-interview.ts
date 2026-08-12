import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-performance-interview",
  title: "Cheat Sheet & Interview Prep",
  part: "Measurement & Operations",
  estMinutes: 13,
  summary:
    "The capstone index: the tag/context/max-age decision table, the full layer map from CDN down to the database with the header that proves each hit, the Symfony-to-Drupal performance reflex list, and the reasoning chains behind the three diagnostic questions every panel asks.",

  concept: `
## Three questions, three answers

Everything in this course collapses into one table. Standing in front of a
render array, ask in this order:

| Ask | Answer | Incident-site example |
| --- | --- | --- |
| **When does this become wrong?** | a **cache tag** | \`node:42\`, \`node_list:incident\`, \`config:system.site\` |
| **What does this depend on?** | a **cache context** | \`user.permissions\`, \`url.query_args:page\`, \`languages:language_interface\` |
| **When does it expire by itself?** | **max-age** | a third-party weather strip nobody can invalidate |

Tags and contexts *union* as they bubble; max-age *intersects* — the smallest
value anywhere in the tree wins. Hence the corollary worth pinning to the team
wiki: **\`'max-age' => 0\` is nearly always the wrong answer.** It does not mean
"expire quickly", it means "never store this for anyone", and because it bubbles
it condemns the whole response rather than your one block. If output goes stale
when data changes, that is a tag. If it differs per visitor, that is a context.
Max-age is the third choice, for the rare thing with no invalidation event at all.

## The layer map

| Layer | Holds | Invalidated by | Header that proves a hit |
| --- | --- | --- | --- |
| CDN | whole responses, anonymous | purge → \`Surrogate-Key\` / \`Cache-Tag\` | \`x-cache\`, \`cf-cache-status\`, \`Age\` |
| Varnish | whole responses, anonymous | purge → BAN on the tags header | \`X-Varnish\`, \`Age\` |
| Internal page cache | whole responses, keyed on URL alone | core tag checksum | \`X-Drupal-Cache\` |
| Dynamic page cache | the page with placeholders unreplaced, keyed on contexts | core tag checksum | \`X-Drupal-Dynamic-Cache\` |
| Render cache | render subtrees, keyed on \`#cache['keys']\` + contexts | core tag checksum | — (\`X-Drupal-Cache-Tags\` lists the deps) |
| Entity cache | raw field values per entity | entity save | — |
| Database | rows, plus the InnoDB buffer pool | writes | — |

Two rules make that map usable. Everything above Dynamic Page Cache is
**anonymous-only** — one session cookie and the top three step aside. And only
the two outermost layers need the **purge** module, because they are the only
ones living outside PHP, where core's tag checksums cannot reach.

Since **Drupal 10.4 and 11.1** those two \`X-Drupal-*\` headers carry a reason in
parentheses — \`UNCACHEABLE (poor cacheability)\`, \`UNCACHEABLE (request policy)\` —
so the header alone usually names your bug.

## Three questions a panel will ask

- **"This page is slow — walk me through it."** Measure before touching
  anything. Slow for anonymous or only authenticated? Read \`X-Drupal-Cache\` and
  \`X-Drupal-Dynamic-Cache\`; if they say MISS or UNCACHEABLE the fix is
  cacheability, not tuning. Only once a cold origin request is the thing you are
  timing do you profile it — query count, N+1 entity loads, Views — and only
  then the runtime: OPcache, FPM workers, Redis.
- **"Editors save an article and the front page still shows the old teaser."**
  Walk the tag from source to edge. Does the listing declare \`node_list\`? Does
  it bubble into the response's \`X-Drupal-Cache-Tags\`? Does the CDN receive it
  as a surrogate key? Is the purge queue actually draining?
- **"One user is seeing another user's name in the header."** Walk the context.
  What varies, was that context declared, and would a \`#lazy_builder\`
  placeholder have been the better answer so it never entered the shared entry
  at all?
`,

  comparisons: [
    {
      label: "Row 1 — declaring cacheability",
      intro:
        "Same page, same three facts. Symfony asks you to state them at one layer and own the invalidation; Drupal asks you to attach them to the output and lets every layer below read them.",
      php: `<?php
// Symfony: you decide, at one layer, and invalidation is your job.
#[Route('/incident/{id}')]
public function show(Incident $incident, TagAwareCacheInterface $cache): Response {
  $html = $cache->get('incident_' . $incident->getId(), function (ItemInterface $i) use ($incident) {
    $i->tag(['incident_' . $incident->getId(), 'incident_list']); // when it goes wrong
    $i->expiresAfter(3600);                                       // when it expires
    return $this->renderView('incident/show.html.twig', ['incident' => $incident]);
  });

  $response = new Response($html);
  $response->setPublic()->setMaxAge(300);          // what the edge may do
  $response->setVary(['Accept-Language']);         // what it depends on
  return $response;
}

// Somewhere else entirely, a Doctrine listener has to remember:
//   $cache->invalidateTags(['incident_42']);
// ...and FOSHttpCacheBundle has to BAN it at Varnish separately.`,
      ts: `<?php
// Drupal: you declare, the renderer merges upward, every layer consumes it.
public function show(NodeInterface $node): array {
  $build = [
    '#theme' => 'incident_detail',
    '#incident' => $node,
    '#cache' => [
      'keys' => ['incident_detail', $node->id()],
      'tags' => Cache::mergeTags($node->getCacheTags(), ['node_list:incident']),
      'contexts' => ['languages:language_interface', 'user.permissions'],
      'max-age' => Cache::PERMANENT,
    ],
  ];
  // The rule that catches everyone: anything you READ, you depend on.
  $this->renderer->addCacheableDependency($build, $this->config('incident.settings'));
  return $build;
}

// Invalidation is nobody's job. $node->save() invalidates node:42 for the
// render cache, dynamic page cache and page cache, and purge carries the
// same tag out to Varnish and the CDN.`,
      note:
        "Cache::PERMANENT is -1, never the literal. The Symfony version has three separate places to remember on a write; the Drupal version has none, which is exactly what the metadata buys you.",
    },
    {
      label: "Row 2 — turning the layers on",
      intro:
        "The equivalent wiring on each side: a shared tag-aware cache backend, and telling the framework it is sitting behind a reverse proxy.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# Symfony — config/packages/framework.yaml
framework:
  http_cache:
    enabled: true              # the kernel-level reverse proxy
    debug: true                # adds the trace header
    trace_header: 'X-Symfony-Cache'
    default_ttl: 3600
  cache:
    app: cache.adapter.redis
    default_redis_provider: 'redis://cache:6379'
    pools:
      incident.cache:
        adapter: cache.adapter.redis
        tags: true             # -> TagAwareAdapter
  # In front of real Varnish, trust it:
  trusted_proxies: '10.0.0.0/8'
  trusted_headers: ['x-forwarded-for', 'x-forwarded-proto']`,
      ts: `<?php
// Drupal — sites/default/settings.php
// Redis (contrib) as the backend for every cache bin.
$settings['redis.connection']['host'] = 'cache';
$settings['cache']['default'] = 'cache.backend.redis';

// Behind Varnish or a CDN. Without this, every visitor's IP is the
// proxy's IP and Drupal builds http:// URLs behind your TLS terminator.
$settings['reverse_proxy'] = TRUE;
$settings['reverse_proxy_addresses'] = ['10.0.0.7'];
$settings['reverse_proxy_trusted_headers'] =
  \\Symfony\\Component\\HttpFoundation\\Request::HEADER_X_FORWARDED_FOR
  | \\Symfony\\Component\\HttpFoundation\\Request::HEADER_X_FORWARDED_PROTO;

// The public max-age is CONFIG, not settings.php:
//   drush config:set system.performance cache.page.max_age 900
// It ships as 0 — a fresh site tells every proxy to store nothing.

// Debug headers live in sites/default/services.yml:
//   parameters:
//     http.response.debug_cacheability_headers: true`,
      note:
        "The single most common 'why is the CDN not caching?' answer is that system.performance:cache.page.max_age is still 0 — deployable config, so put it in your exported config, not in a runbook.",
    },
    {
      label: "Row 3 — proving which layer answered",
      intro:
        "One curl per side. This is the first command to run on any 'the page is slow' or 'the page is stale' ticket, before you open a profiler.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony
curl -sI https://example.test/incident/42 \\
  | grep -i -E 'cache-control|x-symfony-cache|^age|vary'

# cache-control: max-age=300, public
# x-symfony-cache: GET /incident/42: fresh
# age: 41
# vary: Accept-Language

# Then the origin, if the cache genuinely missed:
blackfire curl https://example.test/incident/42
# or the Web Profiler toolbar / /_profiler on the dev environment`,
      ts: `# Drupal — one request names which of five layers answered.
curl -sI https://example.test/incident/42 \\
  | grep -i -E 'cache-control|x-drupal|x-varnish|^age|vary'

# cache-control: max-age=900, public
# x-drupal-cache: HIT                    <- stored with the copy; PHP did not
#                                          run for THIS request
# x-drupal-dynamic-cache: MISS           <- never ran; page cache was earlier
# x-drupal-cache-tags: config:system.site node:42 node_list:incident
# x-drupal-cache-contexts: languages:language_interface theme user.permissions
# x-drupal-cache-max-age: -1 (Permanent)
# vary: Cookie
# age: 128                               <- non-zero Age: Varnish/CDN answered,
#                                          so every x-drupal-* line is replayed

# Same URL carrying a session cookie: the anonymous-only layers stand down.
curl -sI -b 'SSESSabc=xyz' https://example.test/incident/42 | grep -i x-drupal
# x-drupal-cache: UNCACHEABLE (request policy)
# x-drupal-dynamic-cache: HIT`,
      note:
        "Read Age first: any non-zero Age means a shared cache in front of Drupal answered, so the x-drupal-* headers describe the request that filled the edge, not the one you just made. To see what PHP is actually doing, bypass the edge — hit the origin directly, or send Cache-Control: no-cache. The x-drupal-cache-tags/contexts/max-age trio only appears when http.response.debug_cacheability_headers is true. Turn it on in every non-production environment; most cache bugs then identify themselves in one curl.",
    },
    {
      label: "Row 4 — the toolchain reflex list",
      intro:
        "Muscle memory to port over: clear a pool, invalidate by tag, reach the edge, profile the origin.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony
bin/console cache:pool:clear incident.cache
bin/console cache:pool:invalidate-tags incident_42   # TagAwareAdapter
bin/console cache:clear                              # container, NOT the HTTP cache

# Edge invalidation: FOSHttpCacheBundle sends BAN/PURGE to Varnish
#   $this->cacheManager->invalidateTags(['incident-42']);

# Personalised fragments punched into a cached shell:
#   {{ render_esi(url('incident_user_bar')) }}

# Profiling: Blackfire, or the Web Profiler toolbar in dev.`,
      ts: `# Drupal
drush cache:rebuild                    # drush cr — everything; the blunt one
drush cache:clear bin render,dynamic_page_cache
drush php:eval "\\Drupal\\Core\\Cache\\Cache::invalidateTags(['node:42']);"

# Edge invalidation via the purge module family:
drush p:diagnostics                    # is the pipeline healthy?
drush p:invalidate tag node:42         # straight to Varnish/CDN, skipping the queue
drush p:queue-work                     # drain the queue (run from a systemd timer)

# Personalised fragments punched into a cached shell:
#   '#lazy_builder' => ['incident.builder:userBar', []]
#   plus core's big_pipe module to stream them in.

# Profiling: the standalone webprofiler module (split out of Devel for
# Drupal 10), XHProf, or Blackfire.`,
      note:
        "drush cr is the reflex to unlearn: it empties every bin including the render and page caches, so the next few hundred visitors pay full origin cost. On a busy site, invalidate the tag you actually changed.",
    },
  ],

  playground: {
    intro:
      "The layer map as a running machine. Five requests hit /incident/42 — anonymous cold, anonymous warm, editor cold, editor warm, then anonymous again after an edit. Predict which layer answers each one, and how many entries the node:42 invalidation drops per layer, before you run it.",
    lang: "php",
    code: `<?php
// The layer map as a machine. A request falls down the stack until some layer
// can answer it. Each layer knows what it holds, who invalidates it, and which
// response header tells you it hit. Simplification: one fill populates every
// layer that missed on the way down.

$layers = [
  ['name' => 'CDN edge',            'header' => 'x-cache / Age',          'ms' => 12,  'anon_only' => TRUE,  'external' => TRUE],
  ['name' => 'Varnish',             'header' => 'X-Varnish / Age',        'ms' => 30,  'anon_only' => TRUE,  'external' => TRUE],
  ['name' => 'Internal page cache', 'header' => 'X-Drupal-Cache',         'ms' => 70,  'anon_only' => TRUE,  'external' => FALSE],
  ['name' => 'Dynamic page cache',  'header' => 'X-Drupal-Dynamic-Cache', 'ms' => 150, 'anon_only' => FALSE, 'external' => FALSE],
  ['name' => 'Render cache',        'header' => 'X-Drupal-Cache-Tags',    'ms' => 380, 'anon_only' => FALSE, 'external' => FALSE],
];
$origin_ms = 940;

$store = array_fill(0, count($layers), []);
$clock = 0;

$request = function (string $who, array $contexts, string $url, array $tags) use ($layers, &$store, $origin_ms, &$clock): void {
  // The cache ID is the URL plus the RESOLVED values of the bubbled contexts.
  // Anonymous and editor land on different keys for the same URL - that is
  // user.permissions doing its job, not a bug.
  $cid = $url . ' [' . implode(' ', $contexts) . ']';
  printf("REQUEST  %-9s %s\\n", $who, $url);
  echo "  cid  $cid\\n";
  $missed = [];
  foreach ($layers as $i => $layer) {
    if ($layer['anon_only'] && $who !== 'anonymous') {
      printf("  %-19s SKIP  session cookie present\\n", $layer['name']);
      continue;
    }
    if (isset($store[$i][$cid])) {
      printf("  %-19s HIT   %4dms  <- %s\\n", $layer['name'], $layer['ms'], $layer['header']);
      $clock += $layer['ms'];
      echo "\\n";
      return;
    }
    printf("  %-19s MISS\\n", $layer['name']);
    $missed[] = $i;
  }
  printf("  %-19s %4dms  entity loads + views query + theming\\n", 'ORIGIN rebuild', $origin_ms);
  $clock += $origin_ms;
  foreach ($missed as $i) {
    $store[$i][$cid] = $tags;
  }
  echo '  stored in ' . count($missed) . ' layers, tagged: ' . implode(', ', $tags) . "\\n\\n";
};

$invalidate = function (string $tag) use ($layers, &$store): void {
  echo "INVALIDATE  $tag\\n";
  foreach ($layers as $i => $layer) {
    $before = count($store[$i]);
    $store[$i] = array_filter($store[$i], fn (array $tags): bool => !in_array($tag, $tags, TRUE));
    // Core invalidates its own bins by tag checksum; anything outside PHP has
    // to be told, which is the purge module's entire job.
    $how = $layer['external'] ? 'purge queuer -> BAN' : 'core tag checksum';
    printf("  %-19s dropped %d  (%s)\\n", $layer['name'], $before - count($store[$i]), $how);
  }
  echo "\\n";
};

$tags = ['node:42', 'node_list:incident', 'config:system.site'];
$anon = ['theme=olivero', 'user.permissions=anonymous'];
$editor = ['theme=claro', 'user.permissions=hash:9f2c'];

$request('anonymous', $anon, '/incident/42', $tags);
$request('anonymous', $anon, '/incident/42', $tags);
$request('editor', $editor, '/incident/42', $tags);
$request('editor', $editor, '/incident/42', $tags);
$invalidate('node:42');
$request('anonymous', $anon, '/incident/42', $tags);

echo "Total serve time across those 5 requests: {$clock}ms\\n";
echo 'With no caching at all it would be:      ' . (5 * $origin_ms) . "ms\\n";
`,
    output: `REQUEST  anonymous /incident/42
  cid  /incident/42 [theme=olivero user.permissions=anonymous]
  CDN edge            MISS
  Varnish             MISS
  Internal page cache MISS
  Dynamic page cache  MISS
  Render cache        MISS
  ORIGIN rebuild       940ms  entity loads + views query + theming
  stored in 5 layers, tagged: node:42, node_list:incident, config:system.site

REQUEST  anonymous /incident/42
  cid  /incident/42 [theme=olivero user.permissions=anonymous]
  CDN edge            HIT     12ms  <- x-cache / Age

REQUEST  editor    /incident/42
  cid  /incident/42 [theme=claro user.permissions=hash:9f2c]
  CDN edge            SKIP  session cookie present
  Varnish             SKIP  session cookie present
  Internal page cache SKIP  session cookie present
  Dynamic page cache  MISS
  Render cache        MISS
  ORIGIN rebuild       940ms  entity loads + views query + theming
  stored in 2 layers, tagged: node:42, node_list:incident, config:system.site

REQUEST  editor    /incident/42
  cid  /incident/42 [theme=claro user.permissions=hash:9f2c]
  CDN edge            SKIP  session cookie present
  Varnish             SKIP  session cookie present
  Internal page cache SKIP  session cookie present
  Dynamic page cache  HIT    150ms  <- X-Drupal-Dynamic-Cache

INVALIDATE  node:42
  CDN edge            dropped 1  (purge queuer -> BAN)
  Varnish             dropped 1  (purge queuer -> BAN)
  Internal page cache dropped 1  (core tag checksum)
  Dynamic page cache  dropped 2  (core tag checksum)
  Render cache        dropped 2  (core tag checksum)

REQUEST  anonymous /incident/42
  cid  /incident/42 [theme=olivero user.permissions=anonymous]
  CDN edge            MISS
  Varnish             MISS
  Internal page cache MISS
  Dynamic page cache  MISS
  Render cache        MISS
  ORIGIN rebuild       940ms  entity loads + views query + theming
  stored in 5 layers, tagged: node:42, node_list:incident, config:system.site

Total serve time across those 5 requests: 2982ms
With no caching at all it would be:      4700ms
`,
  },

  keyPoints: [
    "The decision table in three questions: 'when does it become wrong?' is a cache TAG, 'what does it depend on?' is a cache CONTEXT, 'when does it expire on its own?' is MAX-AGE — asked in that order, because tags and contexts union as they bubble while max-age intersects to the smallest value in the tree.",
    "max-age 0 means 'never store this for anyone', not 'expire soon', and it bubbles — so one block condemns the whole response. Reach for a tag or a context first; max-age is only right for output with no invalidation event, like a third-party feed.",
    "Layer map, top to bottom: CDN and Varnish (whole responses, anonymous, invalidated by purge sending surrogate keys or BANs), internal page cache (keyed on URL alone, X-Drupal-Cache), dynamic page cache (placeholders unreplaced, keyed on contexts, X-Drupal-Dynamic-Cache), render cache (subtrees), entity cache, database. Everything above dynamic page cache is anonymous-only.",
    "Only the two layers outside PHP need the purge module; core invalidates its own bins by tag checksum on entity or config save. Since Drupal 10.4/11.1 the X-Drupal-Cache and X-Drupal-Dynamic-Cache headers append a reason — UNCACHEABLE (request policy), UNCACHEABLE (poor cacheability) — which usually names the bug outright.",
    "Symfony-to-Drupal reflexes: HttpCache/Varnish to the page-cache layers, TagAwareAdapter to cache tags, the Vary header to cache contexts, ESI to #lazy_builder plus BigPipe, FOSHttpCacheBundle to the purge module family, X-Symfony-Cache to X-Drupal-Cache, Web Profiler to the standalone webprofiler module plus Blackfire or XHProf.",
    "Three diagnostic chains: slow page — check the cache headers before profiling, because MISS/UNCACHEABLE is a cacheability bug not a tuning problem; stale content — walk the tag from render array to response header to purge queue; leaked content — walk the context, and prefer a #lazy_builder placeholder so personal data never enters a shared entry.",
  ],

  interview: [
    {
      q: "Tag, context, or max-age — how do you decide, and when is max-age 0 acceptable?",
      a: "I ask three questions in order. *When does this become wrong?* — that is a cache **tag**, so `node:42` and `node_list:incident` on an article listing. *What does this depend on?* — a cache **context**, the analogue of Symfony's `Vary` header but with far finer granularity: `user.permissions`, `url.query_args:page`, `languages:language_interface`. *When does it expire on its own?* — **max-age**, and only if there genuinely is no invalidation event, such as a third-party feed I cannot hook. The reason for that order is the merge behaviour: tags and contexts union as they bubble up the render tree, but max-age intersects to the smallest value found anywhere, so a single `'max-age' => 0` in a sidebar block makes the entire response unstorable and turns every authenticated request into a full rebuild. I treat max-age 0 as a code smell: it usually means somebody could not work out which tag to attach.",
    },
    {
      q: "A page is slow. Walk me through how you diagnose it.",
      a: "I measure before I touch anything, and the first measurement is a `curl -sI` with the cacheability debug headers on. If `X-Drupal-Cache` or `X-Drupal-Dynamic-Cache` says MISS or UNCACHEABLE, this is a cacheability bug, not a tuning problem — recent core spells out the reason in parentheses, so `UNCACHEABLE (poor cacheability)` points me at a max-age 0 or a high-cardinality context, and `UNCACHEABLE (request policy)` usually means a session was opened on an anonymous request. Separating anonymous from authenticated traffic matters too, because the top three layers are anonymous-only. Only once I know I am timing a genuine origin rebuild do I profile it with Blackfire, XHProf or the webprofiler module, looking at query count first — N+1 entity loads in a loop and unbounded Views are the two usual culprits — then the runtime: OPcache sizing, PHP-FPM worker counts, Redis instead of the database cache bins. Tuning PHP when the real problem is a page that never caches is the classic wasted week.",
    },
    {
      q: "An editor saves an article but the front page still shows the old teaser. Where do you look?",
      a: "I follow the tag from where it should be created to where it should be honoured. First, does the listing declare a list tag — a Views block gets `node_list` automatically, but hand-rolled query code very often does not, and that is the single most common cause. Second, does it bubble: with debug headers on, `X-Drupal-Cache-Tags` on the response should contain it, and if not, something built the markup outside the render system or a `#lazy_builder` swallowed it. Third, is the response stale in a layer core cannot reach — Varnish or the CDN — in which case the tag needs to reach the edge as a `Cache-Tags` or `Surrogate-Key` header and the purge queue must actually be draining, which `drush p:diagnostics` and `drush p:queue-work` tell me. The lazy fix people reach for is `drush cr`, but that dumps every bin and hands the origin a thundering herd, so it hides the bug rather than fixing it.",
    },
    {
      q: "Under what circumstances would one logged-in user see another user's content, and how do you prevent it?",
      a: "A missing cache context. Dynamic Page Cache stores one entry per distinct set of *resolved* contexts, so if a block prints the current user's name but only declares `user.permissions`, every account sharing that permissions hash gets served the first user's name. On Internal Page Cache the failure is even blunter, because it keys purely on the URL and ignores contexts entirely — it is safe only because a session cookie makes it stand aside. The fix is either to declare the honest context, `user` for per-account output or `user.roles` where roles are enough, or better to pull the personalised fragment out behind a `#lazy_builder` so it is rendered after the cached shell is fetched and never enters the shared entry. In Symfony terms it is the same class of bug as caching a response publicly while forgetting `Vary`, except Drupal's contexts are much finer-grained and therefore much easier to under-declare.",
    },
  ],

  quiz: [
    {
      question:
        "A block shows a countdown to the next scheduled maintenance window, read from a config object. Which cacheability metadata is the right primary answer?",
      options: [
        "'max-age' => 0, because the countdown changes every second",
        "'max-age' => 60 plus the config object as a cacheable dependency, so it refreshes on a timer and also updates when the window is rescheduled",
        "A cache context on user.permissions",
        "No metadata at all — countdowns are client-side",
      ],
      answerIndex: 1,
      explain:
        "This is the rare case where max-age is genuinely the right primary tool, because the passage of time is a real change with no invalidation event. But it is not the only one: the value also becomes wrong when an editor reschedules the window, so the config object still has to be added as a cacheable dependency for its config: tag. max-age 0 would bubble up and make the whole page unstorable for a countdown nobody watches to the second, and a permissions context is unrelated to what actually varies.",
    },
    {
      question:
        "curl on an anonymous request returns 'x-drupal-cache: UNCACHEABLE (request policy)' on a page that used to be a HIT. What is the most likely cause?",
      options: [
        "The page's max-age bubbled down to 0",
        "Something opened a session on the anonymous request — a messenger call, a form, a contrib module touching $_SESSION — so the request now carries a session cookie",
        "The CDN stripped the Cache-Control header",
        "A cache tag was invalidated and has not been rebuilt yet",
      ],
      answerIndex: 1,
      explain:
        "The word before the parenthesis is the result and the parenthetical is the reason. 'request policy' means page_cache's request policy chain refused the request before any rendering happened, and its usual trigger is NoSessionOpen — a session cookie is present. A max-age of 0 would instead show up as a cacheability problem, most visibly on X-Drupal-Dynamic-Cache as 'UNCACHEABLE (poor cacheability)', and a tag invalidation would simply produce a MISS followed by a HIT.",
    },
    {
      question:
        "You change one article. Which layers require the purge module to be involved before they stop serving the old copy?",
      options: [
        "All of them — cache tags only ever work inside the render cache",
        "Render cache and entity cache only",
        "The CDN and Varnish only; core invalidates its own bins by tag checksum on save",
        "None — Cache-Control: max-age handles every layer",
      ],
      answerIndex: 2,
      explain:
        "Cache tags are Drupal's internal bookkeeping, and core's cache tag checksum invalidator reaches every bin it owns: render cache, dynamic page cache, internal page cache, entity cache. Varnish and the CDN live outside PHP and have never heard of node:42, so purge is what converts a core tag invalidation into a BAN or a surrogate-key purge at the edge. That is exactly why 'is the purge queue draining?' belongs on the stale-content checklist.",
    },
    {
      question:
        "Which pairing correctly maps a Symfony performance tool to its Drupal counterpart?",
      options: [
        "Symfony's Vary header maps to Drupal cache tags",
        "Symfony's TagAwareAdapter maps to Drupal cache contexts",
        "Symfony's ESI maps to Drupal's #lazy_builder placeholders, served eagerly or streamed by BigPipe",
        "Symfony's HttpCache maps to Drupal's entity cache",
      ],
      answerIndex: 2,
      explain:
        "ESI and #lazy_builder solve the identical problem: cache the expensive shared shell and punch the personalised hole in it afterwards, with BigPipe streaming those holes in as they finish rather than blocking the response. The other three are scrambled — Vary maps to cache contexts, TagAwareAdapter maps to cache tags, and HttpCache maps to the page-cache layers and Varnish, not to the entity cache.",
    },
  ],
};

export default lesson;
