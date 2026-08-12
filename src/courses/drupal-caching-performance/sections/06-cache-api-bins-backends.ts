import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "cache-api-bins-backends",
  title: "The Cache API: Bins, Backends & Direct Use",
  part: "The Cacheability Model",
  estMinutes: 12,
  summary:
    "Underneath the render cache sits a plain tagged key-value store — CacheBackendInterface, split into bins, pluggable per backend — and knowing when to reach for it directly (and when not to) is what separates a fast incident site from a slow one.",

  concept: `
## It is just a key-value store with labels

Everything you have learned about \`#cache\` metadata is a *policy* layer. The
thing doing the storing is much dumber, and much older in spirit:

\`\`\`php
interface CacheBackendInterface {
  const CACHE_PERMANENT = -1;
  public function get($cid, $allow_invalid = FALSE);
  public function getMultiple(&$cids, $allow_invalid = FALSE);
  public function set($cid, $data, $expire = Cache::PERMANENT, array $tags = []);
  public function setMultiple(array $items);
  public function delete($cid);
  public function deleteMultiple(array $cids);
  public function deleteAll();
  public function invalidate($cid);
  public function invalidateMultiple(array $cids);
  public function invalidateAll();
  public function removeBin();
}
\`\`\`

A hit returns an object, not the value: \`->data\`, \`->cid\`, \`->created\`,
\`->expire\`, \`->tags\`, \`->valid\`. A miss returns \`FALSE\`. That \`FALSE\`
is why you write \`if ($cache = $this->cacheBin->get($cid))\` and never
\`isset()\`.

## Bins are namespaces, and each can have its own engine

There is no single cache. Core ships separate **bins**, each exposed as a
service: \`cache.default\`, \`cache.bootstrap\`, \`cache.config\`,
\`cache.discovery\`, \`cache.data\`, \`cache.entity\`, \`cache.menu\`,
\`cache.render\`, \`cache.dynamic_page_cache\` and \`cache.page\`. With the
database backend each is a \`cache_*\` table.

Bins matter because backends are assigned per bin in \`settings.php\`. Small,
read-hot, rarely-written bins (bootstrap, config, discovery) default to
\`cache.backend.chainedfast\` — an APCu layer in front of the consistent
backend, so the common path never touches the network. Big, write-hot bins
(render, page) belong on Redis or Memcached, or on nothing at all if you are
debugging.

Declare your own bin when you own a meaningful body of data and want to be able
to nuke it independently — tag a service with \`cache.bin\` and build it from
\`cache_factory:get\`.

## invalidate() is not delete()

\`delete()\` removes the row. \`invalidate()\` keeps the row and flips
\`valid\` to FALSE, and tag invalidation (\`Cache::invalidateTags()\`, which
fans out across *every* bin) works the same way. An invalid entry is normally a
miss — but \`get($cid, TRUE)\` will hand it back anyway. That is the escape
hatch for "the upstream API is down, serve yesterday's incident feed rather
than a blank page". Note that \`allow_invalid\` is a Cache API argument only:
render arrays have no equivalent flag, so a stale-on-failure strategy has to
live inside the service that owns the data.

## Static vs persistent

Persistent bins survive the request. A **memory cache** implements the same
interface but only lives for the request — that is why \`Node::load(5)\` twice
costs one query.

The implementation behind \`entity.memory_cache\` changed, and interviewers on
D11 sites will know it:

- **Drupal 10, and 11.0/11.1** — \`Drupal\\Core\\Cache\\MemoryCache\\MemoryCache\`,
  constructed from \`['@datetime.time']\`. A plain PHP array that never expires
  within the request, so it grows without bound. That is why a long migration
  eats memory.
- **Drupal 11.2+** — \`Drupal\\Core\\Cache\\MemoryCache\\LruMemoryCache\`
  (a subclass), constructed from
  \`['@datetime.time', '%entity.memory_cache.slots%']\`. It is bounded: it keeps
  \`entity.memory_cache.slots\` entities (default **1000**) and evicts the
  least-recently-used one to make room, instead of growing forever. Roughly
  200MB of entities at the default, so on low-memory hosts you lower that
  container parameter.

Either way \`\\Drupal::service('entity.memory_cache')->deleteAll()\` still
empties it, and is still a real fix when a batch is running hot.

## When to call it directly

Expensive external calls and computed aggregates: a BOM warnings feed, a
"incidents by region" rollup. **Always** with tags and an expiry — an entry with
\`Cache::PERMANENT\` and no tags is a bug you will meet again in six months.
`,

  comparisons: [
    {
      label: "Read-through caching of an expensive call",
      intro:
        "Cache a slow external feed for the incident dashboard. Symfony gives you a callback-shaped contract; Drupal gives you the older get/miss/set dance, but with tags baked into set().",
      leftLang: "php",
      rightLang: "php",
      php: `use Symfony\\Contracts\\Cache\\CacheInterface;
use Symfony\\Contracts\\Cache\\ItemInterface;

final class WarningsClient
{
    public function __construct(
        private CacheInterface $cache,   // cache.app pool
        private HttpClientInterface $http,
    ) {}

    public function forRegion(string $region): array
    {
        // Stampede-protected read-through: the callback only runs on a miss.
        return $this->cache->get(
            'bom_warnings.' . $region,
            function (ItemInterface $item) use ($region): array {
                $item->expiresAfter(300);
                $item->tag(['bom_warnings']);
                return $this->http
                    ->request('GET', "/warnings/{$region}")
                    ->toArray();
            }
        );
    }
}`,
      ts: `use Drupal\\Core\\Cache\\Cache;
use Drupal\\Core\\Cache\\CacheBackendInterface;

final class WarningsClient {

  public function __construct(
    private readonly CacheBackendInterface $cache,   // cache.default
    private readonly ClientInterface $http,
  ) {}

  public function forRegion(string $region): array {
    $cid = 'incident_ops:bom_warnings:' . $region;

    // get() returns an object on hit, FALSE on miss. Never isset().
    if ($cache = $this->cache->get($cid)) {
      return $cache->data;
    }

    $data = Json::decode(
      (string) $this->http->request('GET', "/warnings/{$region}")->getBody()
    );

    $this->cache->set(
      $cid,
      $data,
      // Absolute UNIX timestamp, not a TTL. Cache::PERMANENT === -1.
      \\Drupal::time()->getRequestTime() + 300,
      ['incident_ops:bom_warnings'],
    );

    return $data;
  }

}`,
      note:
        "Drupal's third argument is an absolute expiry timestamp, not a duration — the single most common bug when porting Symfony caching code.",
    },
    {
      label: "Declaring your own pool / bin",
      intro:
        "You want incident-feed data in its own namespace so you can clear it without a full cache rebuild.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/cache.yaml
framework:
  cache:
    app: cache.adapter.redis
    default_redis_provider: '%env(REDIS_DSN)%'
    pools:
      incident.feed.cache:
        adapter: cache.adapter.redis
        default_lifetime: 300
        tags: true

# Injected by name:
#   services:
#     App\\Feed\\WarningsClient:
#       arguments: ['@incident.feed.cache']`,
      ts: `# incident_ops/incident_ops.services.yml
services:
  # The bin service. 'incident_feed' is the bin name -> cache_incident_feed
  # table on the database backend, or a Redis key prefix.
  cache.incident_feed:
    class: Drupal\\Core\\Cache\\CacheBackendInterface
    tags:
      - { name: cache.bin, default_backend: cache.backend.chainedfast }
    factory: ['@cache_factory', 'get']
    arguments: [incident_feed]

  Drupal\\incident_ops\\WarningsClient:
    arguments: ['@cache.incident_feed', '@http_client', '@datetime.time']`,
      note:
        "The cache.bin tag is what makes drush cache:rebuild and the cache-clear routines find your bin; default_backend is only a default, settings.php still wins.",
    },
    {
      label: "Invalidate vs delete, and serving stale",
      intro:
        "A journalist publishes an incident node. Both frameworks fan out by tag — but Drupal keeps the stale row around, and that is deliberate.",
      leftLang: "php",
      rightLang: "php",
      php: `// TagAwareAdapter: invalidation *removes* the items.
$pool->invalidateTags(['bom_warnings']);

// A later get() is unconditionally a miss; the old value is gone.
$fresh = $pool->get('bom_warnings.nsw', $recompute);

// Serving stale on upstream failure is your own job:
// keep a second, longer-lived "last known good" key.
$pool->get('bom_warnings.nsw.lkg', function (ItemInterface $i) use ($fresh) {
    $i->expiresAfter(86400);
    return $fresh;
});`,
      ts: `use Drupal\\Core\\Cache\\Cache;

// Marks matching entries invalid in EVERY bin — render, page,
// dynamic_page_cache, your own bin. Rows stay; ->valid becomes FALSE.
Cache::invalidateTags(['incident_ops:bom_warnings']);
// Same thing, injectable: '@cache_tags.invalidator'
// $this->cacheTagsInvalidator->invalidateTags([...]);

// Normal read: an invalid entry is a miss.
$item = $this->cache->get($cid);            // FALSE

// Explicitly opt in to stale data when the upstream is down.
if (!$item && $upstreamFailed) {
  $item = $this->cache->get($cid, TRUE);    // $allow_invalid = TRUE
}

// delete() / deleteMultiple() / deleteAll() actually remove rows.
$this->cache->delete($cid);`,
      note:
        "invalidate() is cheap and reversible-ish (the data is still readable); delete() throws it away. Prefer invalidation so you keep the stale-while-error option.",
    },
    {
      label: "Choosing the storage engine",
      intro:
        "Moving the hot bins off the database onto Redis, and turning one bin off entirely while profiling.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# config/packages/cache.yaml
framework:
  cache:
    app: cache.adapter.redis
    system: cache.adapter.system   # APCu/filesystem for config-ish data
    default_redis_provider: 'redis://cache:6379'

# Turn a pool into a no-op while profiling:
#   incident.feed.cache:
#     adapter: cache.adapter.null`,
      ts: `// sites/default/settings.php  (redis contrib module installed)
$settings['redis.connection']['host'] = 'cache';
$settings['cache']['default'] = 'cache.backend.redis';

// Keep the tiny read-hot bins on the APCu-fronted chained backend so
// bootstrap never round-trips to Redis.
$settings['cache']['bins']['bootstrap'] = 'cache.backend.chainedfast';
$settings['cache']['bins']['config']    = 'cache.backend.chainedfast';
$settings['cache']['bins']['discovery'] = 'cache.backend.chainedfast';

// Your own bin, by bin name (not service id):
$settings['cache']['bins']['incident_feed'] = 'cache.backend.redis';

// Profiling only: make the render cache a black hole.
// $settings['cache']['bins']['render'] = 'cache.backend.null';`,
      note:
        "Bins are keyed by bin name in settings.php ('render'), but by service id everywhere else ('cache.render'). cache.backend.null is a supported way to disable a single bin for debugging.",
    },
  ],

  playground: {
    intro:
      "A 60-line stand-in for a cache bin. It models tag invalidation, the difference between invalidate() and delete(), and what the $allow_invalid flag actually buys you — no Drupal bootstrap required.",
    lang: "php",
    code: `<?php
// A tiny stand-in for Drupal's CacheBackendInterface: enough to show the
// difference between delete() (row gone) and invalidate() (row kept, marked
// stale) and what $allow_invalid buys you.

const CACHE_PERMANENT = -1;

final class MiniBin {
  private array $items = [];
  public array $stats = ['hit' => 0, 'miss' => 0, 'stale' => 0];

  public function set(string $cid, mixed $data, int $expire = CACHE_PERMANENT, array $tags = []): void {
    sort($tags);
    $this->items[$cid] = (object) [
      'cid' => $cid,
      'data' => $data,
      'expire' => $expire,
      'tags' => $tags,
      'valid' => TRUE,
    ];
  }

  public function get(string $cid, bool $allow_invalid = FALSE): object|false {
    if (!isset($this->items[$cid])) {
      $this->stats['miss']++;
      return FALSE;
    }
    $item = $this->items[$cid];
    if (!$item->valid && !$allow_invalid) {
      $this->stats['miss']++;
      return FALSE;
    }
    $this->stats[$item->valid ? 'hit' : 'stale']++;
    return $item;
  }

  public function delete(string $cid): void {
    unset($this->items[$cid]);
  }

  // Cache::invalidateTags() fans out to every bin; this is one bin's share.
  public function invalidateTags(array $tags): int {
    $n = 0;
    foreach ($this->items as $item) {
      if ($item->valid && array_intersect($item->tags, $tags)) {
        $item->valid = FALSE;
        $n++;
      }
    }
    return $n;
  }

  public function cids(): array {
    return array_keys($this->items);
  }
}

function show(MiniBin $bin, string $cid, bool $allow_invalid = FALSE): void {
  $label = $allow_invalid ? 'get(cid, TRUE) ' : 'get(cid)       ';
  $item = $bin->get($cid, $allow_invalid);
  if ($item === FALSE) {
    echo $label . $cid . ' => MISS (rebuild)' . "\\n";
    return;
  }
  $state = $item->valid ? 'HIT  ' : 'STALE';
  echo $label . $cid . ' => ' . $state . ' data=' . json_encode($item->data) . "\\n";
}

$bin = new MiniBin();
$bin->set('incident_feed:sev1', ['flood', 'fire'], CACHE_PERMANENT, ['node_list:incident']);
$bin->set('bom_warnings:nsw', ['temp' => 21], 1893456000, ['remote:bom']);

echo "-- warm reads --\\n";
show($bin, 'incident_feed:sev1');
show($bin, 'bom_warnings:nsw');

echo "-- an editor saves an incident node --\\n";
echo 'Cache::invalidateTags([node_list:incident]) marked '
  . $bin->invalidateTags(['node_list:incident']) . " entry stale\\n";

echo "-- reads after invalidation --\\n";
show($bin, 'incident_feed:sev1');
show($bin, 'incident_feed:sev1', TRUE);
show($bin, 'bom_warnings:nsw');

echo "-- delete() removes the row outright --\\n";
$bin->delete('incident_feed:sev1');
show($bin, 'incident_feed:sev1', TRUE);

echo "-- accounting --\\n";
print_r($bin->stats);
echo 'rows left in bin: ' . implode(', ', $bin->cids()) . "\\n";
`,
    output: `-- warm reads --
get(cid)       incident_feed:sev1 => HIT   data=["flood","fire"]
get(cid)       bom_warnings:nsw => HIT   data={"temp":21}
-- an editor saves an incident node --
Cache::invalidateTags([node_list:incident]) marked 1 entry stale
-- reads after invalidation --
get(cid)       incident_feed:sev1 => MISS (rebuild)
get(cid, TRUE) incident_feed:sev1 => STALE data=["flood","fire"]
get(cid)       bom_warnings:nsw => HIT   data={"temp":21}
-- delete() removes the row outright --
get(cid, TRUE) incident_feed:sev1 => MISS (rebuild)
-- accounting --
Array
(
    [hit] => 3
    [miss] => 2
    [stale] => 1
)
rows left in bin: bom_warnings:nsw
`,
  },

  keyPoints: [
    "CacheBackendInterface is a tagged key-value store: get() returns an item object with ->data/->tags/->valid or FALSE, and set($cid, $data, $expire, $tags) takes an ABSOLUTE expiry timestamp (or Cache::PERMANENT, which is -1) — not a TTL.",
    "Bins (cache.default, cache.bootstrap, cache.config, cache.discovery, cache.data, cache.entity, cache.menu, cache.render, cache.dynamic_page_cache, cache.page) are namespaces whose backend is chosen per bin in settings.php via $settings['cache']['bins'][BIN_NAME].",
    "Declare your own bin with a service tagged { name: cache.bin } built from the cache_factory:get factory with the bin name as its argument; that tag is what wires it into cache rebuilds.",
    "invalidate() and Cache::invalidateTags() mark entries stale across every bin without deleting them; delete()/deleteAll() remove them. get($cid, TRUE) deliberately serves a stale entry — your stale-while-upstream-is-down escape hatch.",
    "Memory caches implement the same interface but only live for the request — great for repeat loads. Know the version split: on Drupal 10 and 11.0/11.1 entity.memory_cache is a plain Drupal\\Core\\Cache\\MemoryCache\\MemoryCache, an unbounded array that leaks through a long migration; from Drupal 11.2 it is a bounded Drupal\\Core\\Cache\\MemoryCache\\LruMemoryCache sized by the entity.memory_cache.slots container parameter (default 1000), which evicts the least-recently-used entity instead of growing forever — lower that parameter on low-memory hosts.",
    "Reach for the Cache API directly only for expensive external calls and computed aggregates, and always pass both tags and an expiry so the entry has a defined way to die.",
  ],

  interview: [
    {
      q: "You come from Symfony's PSR-6 pools. What actually differs in Drupal's Cache API, and what trips people up?",
      a: "The shape is nearly identical — a pool becomes a *bin* (`cache.default`, `cache.render`, or your own tagged `cache.bin` service), `CacheItemInterface` becomes the plain stdClass returned by `get()`, and Symfony's `TagAwareAdapter` maps onto Drupal's cache tags. Three things trip people up. First, `set()`'s third argument is an **absolute UNIX timestamp**, not `expiresAfter()` seconds — passing `300` means \"expired in 1970\". Second, `get()` returns `FALSE` on a miss and an object on a hit, so the idiom is `if ($cache = $bin->get($cid))`, and the value lives on `->data`. Third, Drupal's tag invalidation *marks stale* rather than deleting, so `get($cid, TRUE)` can still return the old data — Symfony's `invalidateTags()` throws it away. There is no built-in stampede protection equivalent to Symfony's contracts `get()` callback, so on a very hot key you may need a lock (`@lock`) yourself.",
    },
    {
      q: "When would you call the Cache API directly instead of just putting #cache metadata on a render array?",
      a: "Render caching stores *rendered markup* keyed by cache contexts; the Cache API stores *arbitrary data*. Use the Cache API when the expensive thing is not the rendering — a third-party HTTP call to a weather or emergency-services feed, an aggregate query counting incidents per region, a parsed config file. The rule of thumb: cache the data at the Cache API layer with its own tags and expiry, then let the render array cache the presentation on top, and make the render array's `#cache['tags']` include the tag you used on the data entry so one invalidation clears both. Never use the Cache API to work around a missing cache context — that just makes the wrong markup persistent instead of transient.",
    },
    {
      q: "How would you declare and then wire up a custom cache bin, and why bother instead of using cache.default?",
      a: "In `MODULE.services.yml` define a service — say `cache.incident_feed` — with `class: Drupal\\Core\\Cache\\CacheBackendInterface`, `factory: ['@cache_factory', 'get']`, `arguments: [incident_feed]` and the tag `{ name: cache.bin, default_backend: cache.backend.chainedfast }`. Then inject `'@cache.incident_feed'` rather than calling `\\Drupal::cache('incident_feed')`. The payoff is operational: the bin gets its own storage (a `cache_incident_feed` table, or its own Redis key prefix), so you can point it at a different backend in `settings.php`, size and monitor it separately, and blow it away independently of the render cache. It also keeps your CIDs from colliding with core's in the shared `cache_default` table.",
    },
    {
      q: "A cron job that loads 200,000 nodes runs out of memory. Where does caching come into it, and how do you fix it?",
      a: "Entity storage keeps a per-request **memory cache** — the `entity.memory_cache` service, implementing `CacheBackendInterface` but backed by a PHP array. It is what makes two `Node::load(5)` calls cost one query, and it is also the thing filling up. Say which Drupal you are on, because the mechanism differs: on **Drupal 10 and 11.0/11.1** it is a plain `Drupal\\Core\\Cache\\MemoryCache\\MemoryCache` that never expires within the request, so it grows without bound; from **Drupal 11.2** it is a `Drupal\\Core\\Cache\\MemoryCache\\LruMemoryCache` built from `['@datetime.time', '%entity.memory_cache.slots%']`, which holds `entity.memory_cache.slots` entities (default 1000, roughly 200MB) and evicts the least-recently-used one rather than growing forever. The fixes, in order: batch the work (queue workers or `hook_update_N` sandboxes) so each run is a fresh request; iterate with `loadMultiple()` over chunked ID ranges rather than one-by-one; and call `\\Drupal::service('entity.memory_cache')->deleteAll()` — or the storage's `resetCache()` — between chunks. On 11.2+ there is one more lever: lower the `entity.memory_cache.slots` container parameter, which is the documented remedy when a 128MB host hits \"not enough reclaimed, starting new batch\" during a migration. Either way this is a static-versus-persistent-cache distinction, not a persistent-cache-sizing problem, so clearing Redis will not help.",
    },
  ],

  quiz: [
    {
      question:
        "What does the third argument to CacheBackendInterface::set($cid, $data, $expire, $tags) mean?",
      options: [
        "A time-to-live in seconds, like Symfony's expiresAfter()",
        "An absolute UNIX timestamp at which the item expires (or Cache::PERMANENT, which is -1)",
        "A priority used when the backend needs to evict entries",
        "The maximum size in bytes the serialized item may occupy",
      ],
      answerIndex: 1,
      explain:
        "Drupal takes an absolute expiry timestamp, so you write \\Drupal::time()->getRequestTime() + 300, not 300. Cache::PERMANENT (-1) means \"never expires on time; only tags or an explicit delete remove it\". Passing a bare 300 stores an item that expired in 1970 and will be treated as invalid immediately.",
    },
    {
      question:
        "An editor saves a node and Cache::invalidateTags(['node:12']) runs. What happens to a cache entry in your custom bin that was set with that tag?",
      options: [
        "The row is deleted from your bin immediately",
        "Nothing — Cache::invalidateTags() only touches the render and page bins",
        "The row stays but is marked invalid; a normal get() misses, while get($cid, TRUE) still returns it",
        "The row's expire timestamp is reset to now and it is deleted on the next cron run",
      ],
      answerIndex: 2,
      explain:
        "Tag invalidation fans out to every registered cache.bin and marks matching entries invalid rather than deleting them. That is what makes the $allow_invalid argument useful: you can knowingly serve stale data when the source of truth is unavailable. delete()/deleteMultiple()/deleteAll() are the operations that actually remove rows.",
    },
    {
      question:
        "Which service definition correctly declares a custom cache bin named 'incident_feed'?",
      options: [
        "A service with class Drupal\\Core\\Cache\\DatabaseBackend and arguments ['@database', 'incident_feed']",
        "A service tagged { name: cache.bin } with factory: ['@cache_factory', 'get'] and arguments: [incident_feed]",
        "A service tagged { name: cache.context } with arguments: ['incident_feed']",
        "An entry in MODULE.info.yml under a 'cache_bins:' key",
      ],
      answerIndex: 1,
      explain:
        "The cache_factory service builds the right backend for the bin based on settings.php, and the cache.bin tag registers the bin so cache rebuilds and tag invalidation reach it. Hard-coding DatabaseBackend would work but locks the bin to the database and bypasses per-bin backend configuration. cache.context is for cache context services, an unrelated concept.",
    },
    {
      question:
        "Why do the bootstrap, config and discovery bins default to cache.backend.chainedfast?",
      options: [
        "Because those bins must be cleared on every request",
        "Because they are small, read on nearly every request and rarely written, so an APCu layer in front of the consistent backend removes a network round-trip",
        "Because they contain user-specific data that must not be shared between processes",
        "Because they are the only bins that support cache tags",
      ],
      answerIndex: 1,
      explain:
        "ChainedFastBackend pairs a very fast, non-shared local store (APCu) with the consistent backend, using a last-write timestamp to detect staleness. That trade is only safe for bins that are tiny and write-rarely — putting the render or page bin behind it would blow out APCu and produce constant invalidation churn.",
    },
  ],
};

export default lesson;
