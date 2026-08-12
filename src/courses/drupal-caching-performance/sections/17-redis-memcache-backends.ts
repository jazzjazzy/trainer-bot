import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "redis-memcache-backends",
  title: "Swapping Backends: Redis & Memcache",
  part: "Data, Queries & Runtime",
  estMinutes: 13,
  summary:
    "Every cache bin lives in the database until you say otherwise — this is how you move the hot ones to Redis or Memcached in settings.php without breaking tag invalidation, locking or your sessions.",

  concept: `
## The default is the database, and that is the bottleneck

Out of the box every bin is a \`cache_*\` table. On the incident site that means
each anonymous page miss does a \`SELECT\` on \`cache_page\`, several on
\`cache_render\`, a fan-out \`UPDATE\` on \`cachetags\` whenever an editor saves,
and a row in \`semaphore\` every time something takes a lock. Your database is
now doing the one job it is worst at: high-frequency, low-value writes that
contend on the same rows. Moving those bins to Redis or Memcached is usually the
single largest win available to you, and it is a settings change, not a code
change.

## Three steps, in this order

**1. Install the contrib module** — \`composer require drupal/redis\` (or
\`drupal/memcache\`) and enable it. The module ships the backend factory service
(\`cache.backend.redis\`, \`cache.backend.memcache\`) and the client wrapper.

**2. Load the module's container YAML.** The module's own
\`redis.services.yml\` defines the building blocks — \`cache.backend.redis\`,
\`redis.factory\`, \`redis.lock.factory\`, \`redis.flood.factory\`. What it
deliberately does *not* do is replace core's \`lock\`, \`flood\` and tag
checksum services: those overrides are opt-in, which is why redis ships them
separately as \`example.services.yml\`. Copy it, trim it, and list your copy in
\`\$settings['container_yamls'][]\`. Entries there are read straight from
settings.php and merged last, so they win over every module's services.yml and
they still apply when the module is not yet installed — a fresh site install, a
container rebuild. The catch: those overrides reference \`@redis.factory\`, so
the redis module has to stay enabled, or you must additionally load
\`modules/contrib/redis/redis.services.yml\` from \`container_yamls\`.

**3. Point the bins at it in settings.php.**

\`\`\`php
\$settings['redis.connection']['interface'] = 'PhpRedis';
\$settings['redis.connection']['host'] = 'cache';
\$settings['cache']['default'] = 'cache.backend.redis';
\$settings['cache']['bins']['render'] = 'cache.backend.redis';
\`\`\`

## The precedence rule that bites everyone

The backend for a bin is chosen in this order: an explicit
\`\$settings['cache']['bins'][BIN]\`, then the \`default_backend\` on the
service's \`cache.bin\` tag, then \`\$settings['cache']['default']\`. So setting
only the global default does **not** move \`bootstrap\`, \`config\` and
\`discovery\` — those declare \`cache.backend.chainedfast\` on their tag and keep
it. That is fine: ChainedFastBackend's *consistent* half defaults to
\`\$settings['cache']['default']\`, so they become "APCu in front of Redis",
which is what you wanted anyway.

## What must move with the data

Cache tags are validated by a **checksum** — the sum of per-tag invalidation
counters — via the \`cache_tags.invalidator.checksum\` service. If your entries
live in Redis and the counters live in the database, every read costs a database
query and you have thrown away most of the win. Override the service
(\`Drupal\\redis\\Cache\\RedisCacheTagsChecksum\`) so both live together — and
then make sure Redis cannot silently drop those keys. Under
\`maxmemory-policy allkeys-lru\` an evicted counter resets to zero, the stored
checksum no longer matches, and *every tagged entry on the site invalidates at
once*. It fails safe (a stampede, never stale HTML) but a stampede on a news
site during an incident is its own outage.

## Locks, key-value and sessions

Move the \`lock\` and \`lock.persistent\` services too — the database lock
backend writes to \`semaphore\` on every acquire, and locks are your stampede
defence. Move \`flood\` if you rate-limit logins. Do **not** move key-value or
sessions casually: \`keyvalue\` holds durable state — installed module schema
versions (\`system.schema\`), the last-installed entity type and field storage
definitions, \`state\` values, \`development_settings\` — and a volatile store
losing it is not a cache miss, it is data loss. (The compiled container is not
in key-value, despite the folklore: it lives in the \`container\` cache bin,
the \`cache_container\` table, which is exactly what
\`\$settings['bootstrap_container_definition']\` lets Redis serve instead.)
`,

  comparisons: [
    {
      label: "Pointing the app at Redis",
      intro:
        "The same swap in both frameworks. Symfony treats the adapter as ordinary bundle config; Drupal does it in settings.php because the cache layer is built before configuration is readable.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# config/packages/cache.yaml
framework:
  cache:
    # One line moves the app pool. That is genuinely all of it.
    app: cache.adapter.redis
    system: cache.adapter.system          # keep config-ish data on APCu
    default_redis_provider: '%env(REDIS_DSN)%'
    prefix_seed: 'incident_site/%kernel.environment%'
    pools:
      incident.feed.cache:
        adapter: cache.adapter.redis
        default_lifetime: 300
        tags: true

# .env
# REDIS_DSN=redis://cache:6379/1`,
      ts: `// sites/default/settings.php

// Connection. 'PhpRedis' is the C extension (use it); 'Predis' is the
// pure-PHP client, for when you cannot install the extension.
$settings['redis.connection']['interface'] = 'PhpRedis';
$settings['redis.connection']['host']      = 'cache';
$settings['redis.connection']['port']      = 6379;
// $settings['redis.connection']['password'] = getenv('REDIS_PASSWORD');
// Redis database index — a cheap way to isolate environments on one server.
$settings['redis.connection']['base']      = 1;

// Namespace the keys. Essential on a shared/multisite Redis, and it is what
// you bump if you ever need to "cold start" without a FLUSHDB.
$settings['cache_prefix'] = 'incident_site_prod';

// The actual swap.
$settings['cache']['default'] = 'cache.backend.redis';

// Load the module's container overrides (checksum, lock, flood). Copy
// modules/contrib/redis/example.services.yml, trim it, and load your copy.
$settings['container_yamls'][] = 'sites/default/redis.services.yml';

// Needed only if Redis must serve requests before the module is installed
// (fresh installs, or a bootstrap container — see below).
$class_loader->addPsr4('Drupal\\\\redis\\\\', 'modules/contrib/redis/src');`,
      note:
        "settings.php runs before the container is built, which is why connection details cannot live in config entities — and why a typo here is a white screen, not a logged error.",
    },
    {
      label: "Keeping the tag checksum with the data",
      intro:
        "Tag invalidation is only fast if the invalidation counters live in the same store as the cached items. Both frameworks make this explicit; Drupal makes it a service override you must not forget.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: RedisTagAwareAdapter keeps tags in Redis using Sets, so the
# tag index and the items are colocated by construction.
framework:
  cache:
    app: cache.adapter.redis_tag_aware
    default_redis_provider: '%env(REDIS_DSN)%'

# The trade-off is stated up front in the docs: redis_tag_aware REQUIRES
# a non-evicting policy, i.e. run this instance with
#   maxmemory-policy noeviction    (or volatile-* with TTLs you control)
# because losing a tag Set silently orphans the items it pointed at.`,
      ts: `# sites/default/redis.services.yml
# (trimmed from modules/contrib/redis/example.services.yml, then loaded via
#  $settings['container_yamls'][]. These replace CORE services, so redis ships
#  them as an example rather than forcing them on in redis.services.yml. They
#  all reference @redis.factory: the module must stay enabled.)
services:

  # Without this, every tag validation is still a database round-trip and
  # the 'cachetags' table stays your hottest write target.
  cache_tags.invalidator.checksum:
    class: Drupal\\redis\\Cache\\RedisCacheTagsChecksum
    arguments: ['@redis.factory']
    tags:
      - { name: cache_tags_invalidator }

  # The database lock backend writes to 'semaphore' on every acquire.
  lock:
    class: Drupal\\Core\\Lock\\LockBackendInterface
    factory: ['@redis.lock.factory', get]

  # Same factory method — the boolean is what makes the lock persistent.
  lock.persistent:
    class: Drupal\\Core\\Lock\\LockBackendInterface
    factory: ['@redis.lock.factory', get]
    arguments: [true]

  # Login/contact-form rate limiting: many small writes, zero durability need.
  flood:
    class: Drupal\\Core\\Flood\\FloodInterface
    factory: ['@redis.flood.factory', get]`,
      note:
        "Set the Redis checksum service only once ALL tagged bins are on Redis. A half-migration where render is in Redis and the counters are in the database is slower than not migrating at all.",
    },
    {
      label: "Surviving the stampede",
      intro:
        "A front-page render entry for a live incident expires and 400 concurrent requests all decide to rebuild it. Symfony solves this inside the cache contract; Drupal makes you reach for the lock service yourself.",
      leftLang: "php",
      rightLang: "php",
      php: `use Symfony\\Contracts\\Cache\\CacheInterface;
use Symfony\\Contracts\\Cache\\ItemInterface;

// Symfony's cache *contracts* have stampede protection built in: probabilistic
// early expiration means one lucky request recomputes early, while everyone
// else keeps getting the still-valid value.
$feed = $this->cache->get(
    'incident.feed.live',
    function (ItemInterface $item): array {
        $item->expiresAfter(300);
        $item->tag(['incident_feed']);
        return $this->buildFeed();
    },
    beta: 1.0,   // 0 disables, INF forces immediate recompute
);

// When you need a hard mutex rather than a hint, the Lock component:
$lock = $this->lockFactory->createLock('incident.feed.rebuild', ttl: 30);
if ($lock->acquire()) {
    try { $this->rebuild(); } finally { $lock->release(); }
}`,
      ts: `use Drupal\\Core\\Lock\\LockBackendInterface;

// Drupal's Cache API has NO stampede protection. get()/set() is a plain
// check-then-act, so on a hot key you write the lock dance by hand.
// Inject '@lock' (LockBackendInterface).
public function liveFeed(): array {
  $cid = 'incident_ops:feed:live';

  if ($cache = $this->cache->get($cid)) {
    return $cache->data;
  }

  $lockName = 'incident_ops_feed_rebuild';
  if (!$this->lock->acquire($lockName, 30)) {
    // Someone else is rebuilding. Prefer stale data over piling on:
    // $allow_invalid = TRUE returns an invalidated-but-present entry.
    if ($stale = $this->cache->get($cid, TRUE)) {
      return $stale->data;
    }
    // Nothing at all to serve: block until they finish, then re-read.
    $this->lock->wait($lockName, 5);
    return ($item = $this->cache->get($cid)) ? $item->data : [];
  }

  try {
    $data = $this->buildFeed();
    $this->cache->set($cid, $data, $this->time->getRequestTime() + 300, ['incident_feed']);
    return $data;
  }
  finally {
    $this->lock->release($lockName);
  }
}`,
      note:
        "This is why moving the lock backend matters: with the database lock, 400 requests failing to acquire means 400 writes to the semaphore table — the contention you were trying to escape.",
    },
    {
      label: "What should NOT move, and why",
      intro:
        "Redis is a cache. Some of what Drupal keeps in the database looks cache-shaped but is not, and losing it is an outage rather than a slow request.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# Symfony draws the line for you by naming the pools:
framework:
  cache:
    app:    cache.adapter.redis      # discardable. Anything may be evicted.
    system: cache.adapter.system     # container/annotation metadata

  # Sessions are a separate decision, made explicitly:
  session:
    handler_id: 'redis://cache:6379'
    cookie_secure: auto
    cookie_samesite: lax

# Doctrine result/query caches -> Redis: fine, they are derived data.
# Doctrine entity data                 -> the database. Obviously.`,
      ts: `// settings.php — the honest split for the incident site.

// YES: derived, rebuildable, hot.
$settings['cache']['default'] = 'cache.backend.redis';
$settings['cache']['bins']['render'] = 'cache.backend.redis';
$settings['cache']['bins']['dynamic_page_cache'] = 'cache.backend.redis';
$settings['cache']['bins']['data'] = 'cache.backend.redis';
$settings['cache']['bins']['page'] = 'cache.backend.redis';

// NO: key-value is durable state, not cache. It holds installed module schema
// versions (system.schema), the last-installed entity type and field storage
// definitions, state values and development_settings. Core only ships
// database-backed key-value factories (keyvalue.database,
// keyvalue.expirable.database) for a reason.
//
// And there is no $settings key for this one: KeyValueFactory /
// KeyValueExpirableFactory are handed the container parameters
// %factory.keyvalue% / %factory.keyvalue.expirable%, so it is a services.yml
// decision. In sites/default/services.yml:
//
//   parameters:
//     factory.keyvalue:
//       default: keyvalue.database             # leave it alone
//     factory.keyvalue.expirable:
//       default: keyvalue.expirable.database

// SESSIONS: possible, but weigh it. Core writes sessions to the 'sessions'
// table via the session_handler.storage service; replacing it with a Symfony
// Redis handler in a container YAML works, but you trade durability (a Redis
// restart logs out every journalist mid-edit) for writes the database was
// already handling. Anonymous readers get no session at all unless something
// writes to it, so on a read-heavy news site this is rarely the bottleneck.
// Measure the 'sessions' table write rate before you touch it.

// The compiled container definition, by the way, is NOT in key-value: it
// lives in the 'container' cache bin (the cache_container table), read via
// the bootstrap container's cache.container service. A bootstrap container
// definition lets Redis serve that instead, before the database is opened.
// Real, documented in the redis module README, and worth it only once you
// have proven the container rebuild is your cold-start cost:
// $settings['bootstrap_container_definition'] = [ /* per redis README */ ];`,
      note:
        "Rule of thumb: if losing the store means 'slower for a minute', Redis is right. If it means 'wrong behaviour' or 'logged-out users', keep it in the database.",
    },
  ],

  playground: {
    intro:
      "Two things people get wrong on the day they switch to Redis. First, which bins actually moved — the precedence rule is not 'the global default wins'. Second, why the tag checksum store needs an eviction policy of its own. Pure PHP, no Drupal.",
    lang: "php",
    code: `<?php
// Reproduces the rule CacheFactory uses to pick a backend for every bin.
// This is the part people get wrong: setting $settings['cache']['default']
// does NOT move every bin.

// 1. default_backend declared on each core service's cache.bin tag.
$binTag = [
  'bootstrap'          => 'cache.backend.chainedfast',
  'config'             => 'cache.backend.chainedfast',
  'discovery'          => 'cache.backend.chainedfast',
  'default'            => NULL,
  'entity'             => NULL,
  'menu'               => NULL,
  'render'             => NULL,
  'dynamic_page_cache' => NULL,
  'page'               => NULL,
];

// 2. What we actually wrote in settings.php.
$settings = [
  'cache' => [
    'default' => 'cache.backend.redis',
    'bins' => [
      // Override a bin only when you mean it. Here: black-hole the page
      // bin while profiling authenticated traffic.
      //
      // WATCH OUT: cache.backend.null is NOT registered by core.services.yml.
      // It is defined by the scaffolded sites/development.services.yml
      // (class Drupal\\Core\\Cache\\NullBackendFactory), so this line is a
      // white screen -- "You have requested a non-existent service
      // cache.backend.null" -- unless that YAML is loaded first via
      // $settings['container_yamls'][].
      'page' => 'cache.backend.null',
    ],
  ],
];

/**
 * The selection order, in three lines:
 *   1. $settings['cache']['bins'][$bin]              - explicit, wins outright
 *   2. default_backend on the service's cache.bin tag
 *   3. $settings['cache']['default'], else the database
 */
function resolve(string $bin, ?string $tag, array $settings): array {
  if (isset($settings['cache']['bins'][$bin])) {
    return [$settings['cache']['bins'][$bin], 'settings bins[' . $bin . ']'];
  }
  if ($tag !== NULL) {
    return [$tag, 'cache.bin tag default_backend'];
  }
  return [$settings['cache']['default'] ?? 'cache.backend.database', 'settings cache[default]'];
}

// ChainedFastBackend is a pair: APCu in front, "consistent" behind. The
// consistent half defaults to $settings['cache']['default'].
function expand(string $backend, array $settings): string {
  if ($backend !== 'cache.backend.chainedfast') {
    return $backend;
  }
  $consistent = $settings['cache']['default'] ?? 'cache.backend.database';
  return 'apcu -> ' . substr($consistent, strlen('cache.backend.'));
}

echo "== which backend does each bin get? ==\\n";
printf("%-19s %-24s %s\\n", 'BIN', 'EFFECTIVE STORE', 'CHOSEN BY');
$onRedis = [];
foreach ($binTag as $bin => $tag) {
  [$backend, $why] = resolve($bin, $tag, $settings);
  $effective = expand($backend, $settings);
  printf("%-19s %-24s %s\\n", $bin, $effective, $why);
  if (str_contains($effective, 'redis')) {
    $onRedis[] = $bin;
  }
}

echo "\\n== so what is actually in Redis? ==\\n";
echo 'bins reading/writing Redis: ' . implode(', ', $onRedis) . "\\n";
echo "note: bootstrap/config/discovery still hit Redis - but only on an APCu miss.\\n";

echo "\\n== the correctness hazard ==\\n";
// Cache tag validity is a checksum: the sum of per-tag invalidation counters.
$counters = ['node_list:incident' => 7, 'config:system.site' => 2];
$calc = function (array $tags) use (&$counters): int {
  $sum = 0;
  foreach ($tags as $t) {
    $sum += $counters[$t] ?? 0;
  }
  return $sum;
};

$entryTags = ['node_list:incident', 'config:system.site'];
$entryChecksum = $calc($entryTags);
echo 'render entry stored with checksum ' . $entryChecksum . " (7 + 2)\\n";
echo 'isValid now? ' . var_export($entryChecksum === $calc($entryTags), TRUE) . "\\n";

// Redis evicts the counter keys under maxmemory-policy allkeys-lru.
$counters = [];
echo "-- Redis evicts the tag counters (allkeys-lru) --\\n";
echo 'recalculated checksum: ' . $calc($entryTags) . "\\n";
echo 'isValid now? ' . var_export($entryChecksum === $calc($entryTags), TRUE) . "\\n";
echo "=> every tagged entry misses at once: a full-site stampede, not stale HTML.\\n";
`,
    output: `== which backend does each bin get? ==
BIN                 EFFECTIVE STORE          CHOSEN BY
bootstrap           apcu -> redis            cache.bin tag default_backend
config              apcu -> redis            cache.bin tag default_backend
discovery           apcu -> redis            cache.bin tag default_backend
default             cache.backend.redis      settings cache[default]
entity              cache.backend.redis      settings cache[default]
menu                cache.backend.redis      settings cache[default]
render              cache.backend.redis      settings cache[default]
dynamic_page_cache  cache.backend.redis      settings cache[default]
page                cache.backend.null       settings bins[page]

== so what is actually in Redis? ==
bins reading/writing Redis: bootstrap, config, discovery, default, entity, menu, render, dynamic_page_cache
note: bootstrap/config/discovery still hit Redis - but only on an APCu miss.

== the correctness hazard ==
render entry stored with checksum 9 (7 + 2)
isValid now? true
-- Redis evicts the tag counters (allkeys-lru) --
recalculated checksum: 0
isValid now? false
=> every tagged entry misses at once: a full-site stampede, not stale HTML.
`,
  },

  keyPoints: [
    "The swap is three moves, not one: install drupal/redis or drupal/memcache, load the module's container YAML via $settings['container_yamls'][], and set $settings['cache']['default'] plus any per-bin overrides in settings.php.",
    "Backend precedence is: explicit $settings['cache']['bins'][BIN] > the default_backend on the service's cache.bin tag > $settings['cache']['default'] > the database. That is why bootstrap/config/discovery stay on chainedfast — and why they still end up APCu-in-front-of-Redis, since ChainedFastBackend's consistent half defaults to your global setting.",
    "Move the cache_tags.invalidator.checksum service to the same store as the data. Leaving the counters in the database means a database query on every tag validation, which erases most of the benefit.",
    "Give the tag-checksum keys a store that cannot evict them. Under allkeys-lru a lost counter resets to zero, no stored checksum matches, and the whole site invalidates simultaneously — safe but a stampede.",
    "Move the lock, lock.persistent and flood services too: the database lock backend writes to the semaphore table on every acquire, and Drupal's Cache API has no stampede protection of its own — you write the acquire / serve-stale-via-get($cid, TRUE) / release dance by hand on hot keys.",
    "Keep durable state in the database: key-value (installed module schema versions, last-installed entity type and field storage definitions, state values, development_settings) and, by default, sessions. Losing a cache is a slow minute; losing key-value is a broken site. And key-value is not a settings.php switch — the factories read the %factory.keyvalue% / %factory.keyvalue.expirable% container parameters.",
  ],

  interview: [
    {
      q: "Walk me through moving a Drupal 10 site's caches from the database to Redis. What breaks if you only do half the job?",
      a: "Install `drupal/redis` with Composer and enable it, then in `settings.php` set the connection (`$settings['redis.connection']['interface'] = 'PhpRedis'` plus host/port), set `$settings['cache']['default'] = 'cache.backend.redis'`, set a `$settings['cache_prefix']` so environments cannot collide, and add the module's container overrides via `$settings['container_yamls'][]` — the module ships `example.services.yml` as a starting point. The half-job failure is leaving `cache_tags.invalidator.checksum` on the database implementation: every cache read still has to validate its tags, so every read does a database query against `cachetags` and you have added a network hop for no gain. The second half-job is forgetting `lock` and `lock.persistent`, which keeps the `semaphore` table as a write hotspot precisely when traffic spikes. I would also check the Redis eviction policy — the tag counters must not be evictable, or the whole site invalidates at once.",
    },
    {
      q: "You set $settings['cache']['default'] = 'cache.backend.redis' but MONITOR shows the bootstrap and discovery bins still are not hitting Redis directly. Is something broken?",
      a: "No — that is the documented precedence order. A bin's backend is chosen from the explicit `$settings['cache']['bins'][BIN]` entry first, then the `default_backend` declared on the service's `cache.bin` tag, and only then the global `$settings['cache']['default']`. Core tags `cache.bootstrap`, `cache.config` and `cache.discovery` with `default_backend: cache.backend.chainedfast`, so the tag wins over your global setting. That is desirable: ChainedFastBackend puts APCu in front of a consistent backend, and its consistent half defaults to whatever `$settings['cache']['default']` is — so those bins are now APCu-fronted Redis, and the common path never leaves the PHP process. If you genuinely want them on plain Redis you set the per-bin key explicitly, but on a multi-server site you usually do not.",
    },
    {
      q: "Coming from Symfony, what is missing in Drupal's cache layer that you would have to build yourself?",
      a: "Stampede protection, mainly. Symfony's cache *contracts* — `CacheInterface::get($key, $callback)` — give you probabilistic early expiration via the `beta` parameter and lock-based recomputation for free, so a hot key expiring does not send every concurrent request to the origin. Drupal's `CacheBackendInterface` is a bare check-then-act `get()`/`set()`, so on a genuinely hot key I inject the `lock` service and write the pattern manually: try `acquire()`, and if it fails serve `get($cid, TRUE)` to return the invalidated-but-still-present entry rather than joining the rebuild. Drupal does give you one thing Symfony does not have out of the box — that `$allow_invalid` flag, because tag invalidation marks entries stale instead of deleting them, which makes stale-while-revalidate cheap to implement. The other difference is ceremony: Symfony is one line of `framework.cache` YAML, Drupal is settings.php plus a container YAML, because the cache layer is constructed before configuration is readable.",
    },
    {
      q: "Would you put Drupal's key-value store and PHP sessions in Redis on a busy news site?",
      a: "Key-value, no. Despite the name it is durable state, not cache — installed module schema versions in `system.schema`, the last-installed entity type and field storage definitions, `state` values, `development_settings` — and core only ships database-backed key-value factories (`keyvalue.database`, `keyvalue.expirable.database`) for good reason. It is not even a settings.php switch: `KeyValueFactory` is constructed with the `%factory.keyvalue%` container parameter, so you would be editing services.yml to do it. Losing it to an eviction or a restart is not a slow request, it is a site that no longer knows what version its schema is at. (People sometimes say key-value holds the compiled container — it does not; that lives in the `container` cache bin, `cache_container`, which is the thing `$settings['bootstrap_container_definition']` can hand to Redis.) Sessions are a real trade-off rather than a clear no: core writes them to the `sessions` table through the `session_handler.storage` service, which you *can* replace with a Symfony Redis session handler in a container YAML, and it does take writes off the database. But a Redis restart logs out every journalist mid-article, and on a read-heavy news site anonymous visitors get no session row at all unless something writes to it — so the session table is rarely the hotspot people assume. I would measure the write rate on `sessions` first and move the render, page, dynamic_page_cache and data bins before I touched it.",
    },
  ],

  quiz: [
    {
      question:
        "With only $settings['cache']['default'] = 'cache.backend.redis' set, which backend does the 'discovery' bin use?",
      options: [
        "cache.backend.redis — the global default applies to every bin",
        "cache.backend.chainedfast, because the service's cache.bin tag declares that default_backend and a tag beats the global default",
        "cache.backend.database, because discovery cannot be moved off the database",
        "cache.backend.null, because discovery is rebuilt on every request",
      ],
      answerIndex: 1,
      explain:
        "Precedence is: explicit $settings['cache']['bins'][BIN], then the default_backend on the service's cache.bin tag, then $settings['cache']['default']. Core tags bootstrap, config and discovery with cache.backend.chainedfast, so they keep it. This is not a downgrade though — ChainedFastBackend's consistent backend defaults to $settings['cache']['default'], so the bin becomes APCu in front of Redis.",
    },
    {
      question:
        "Why does the redis module ship example.services.yml to be loaded via $settings['container_yamls'][] rather than just putting those overrides in redis.services.yml?",
      options: [
        "Because module .services.yml files cannot define factory services",
        "Because they are opt-in replacements of core services that must also apply when the redis module is not yet installed — and container_yamls entries are read straight from settings.php and merged last",
        "Because YAML loaded from settings.php is cached more aggressively",
        "Because contrib modules are forbidden from overriding core service definitions",
      ],
      answerIndex: 1,
      explain:
        "redis.services.yml already ships the building blocks — cache.backend.redis, redis.factory, redis.lock.factory, redis.flood.factory — and a module's services.yml can override core service ids too. What it cannot be is optional: replacing core's lock, lock.persistent, flood and cache_tags.invalidator.checksum is a per-site choice, and plenty of sites keep the database lock. Those overrides also have to apply when redis is not installed yet, during a fresh site install or a container rebuild. Entries in $settings['container_yamls'] are read straight from settings.php and merged last, which covers both. One caveat: the overrides reference @redis.factory, so the module must stay enabled — otherwise also load modules/contrib/redis/redis.services.yml via container_yamls, as the README documents for pre-install use.",
    },
    {
      question:
        "You move every cache bin to Redis but leave cache_tags.invalidator.checksum on the database implementation. What is the practical consequence?",
      options: [
        "Cache tags stop working entirely and invalidation is silently ignored",
        "Cached entries are served stale forever, because the checksum can never change",
        "Every cache read still validates its tags against the database, so you have added a network hop without removing the database load",
        "Nothing — the checksum service is only used during cron",
      ],
      answerIndex: 2,
      explain:
        "Tag validity is a checksum comparison performed on read. If the counters live in the database while the entries live in Redis, each read touches both stores and the cachetags table remains a hot spot. Correctness is fine; the performance win largely is not. Override the service so the counters and the data share a store.",
    },
    {
      question:
        "Your Redis instance runs with maxmemory-policy allkeys-lru and the cache tag checksums live in it. Memory pressure evicts some checksum keys. What happens?",
      options: [
        "Stale content is served indefinitely, because invalidations are lost",
        "Counters reset, stored checksums no longer match, and large numbers of tagged entries invalidate at once — a stampede, not stale output",
        "Redis refuses further writes until the keys are restored",
        "Drupal automatically falls back to the database checksum implementation",
      ],
      answerIndex: 1,
      explain:
        "Validity is an equality check between the checksum stored with the entry and a freshly summed one. Losing counters makes the recalculated sum smaller, so the comparison fails and the entry is treated as invalid. It fails safe — you never serve wrong content — but a site-wide simultaneous miss during a traffic spike is its own outage. Give the checksum keys a non-evicting instance or policy.",
    },
  ],
};

export default lesson;
