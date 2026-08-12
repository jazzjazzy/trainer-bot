import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "entity-loading-n-plus-1",
  title: "Entity Loading: Static Cache, loadMultiple & N+1",
  part: "Data, Queries & Runtime",
  estMinutes: 13,
  summary:
    "Loading entities one at a time inside a loop is the most common performance bug in custom Drupal code — this section covers the two-tier entity cache that hides it, loadMultiple() as the fix, resetCache() for long-running processes, and how to count the queries so you can prove it.",

  concept: `
## Three caches sit between you and the database

Every content entity load goes through \`EntityStorageBase::loadMultiple()\`.
\`load($id)\` is not a separate code path — it literally calls
\`loadMultiple([$id])\` and returns the first element. That single fact explains
most of this section.

Before a query is issued, storage checks two caches in order:

1. **The static (memory) cache.** A \`MemoryCacheInterface\` backend from the
   \`entity.memory_cache\` service, keyed \`values:ENTITY_TYPE:ID\`. It lives for
   exactly one PHP request. A second \`Node::load(42)\` anywhere in the same
   request is free — no query, and you get the *same object instance*, so a
   change made through one reference is visible through the other. This is
   Doctrine's identity map by another name.
2. **The persistent cache**, bin \`cache_entity\`. Stores the entity's raw field
   values across requests and is invalidated by the entity's cache tags when it
   is saved. Cheap, but still a cache-backend round trip.

Both are opt-out per entity type: the \`static_cache\` and \`persistent_cache\`
properties on the entity type definition default to TRUE for content entities.

## Why the loop still hurts

Because the static cache absorbs *repeat* loads, not *first* loads. Fetching 50
distinct incident nodes with \`Node::load()\` inside a \`foreach\` is 50 cache
misses and 50 round trips to the base table, each dragging in the field tables.
\`loadMultiple($ids)\` fetches all 50 in one \`IN ()\` query per table. Same rows,
same hydrated objects, a fraction of the latency — and latency is what kills you,
not row count.

The bug hides well precisely *because* of the static cache. Re-run the loop in
the same request and the query log stays flat, so the code "looks fine" in a
unit test and melts under a cold cache on a busy news page.

### Load only what you need

Two shapes to keep apart:

- **Wrong:** \`loadMultiple()\` with no argument (every node of that type) then
  \`array_filter()\` in PHP. You paid to hydrate thousands of objects to keep six.
- **Right:** an \`entityQuery\` with conditions and a \`range()\`, returning *ids
  only*, then one \`loadMultiple()\` on that id list. Two queries, six objects.

Entity queries must call \`accessCheck(TRUE|FALSE)\` explicitly — omitting it
throws a \`QueryException\`, so decide deliberately whether the query is filtered
by the current user's access.

### Field-level laziness

Reference fields do not load their targets when the parent loads. Calling
\`$node->get('field_related')->referencedEntities()\` is what triggers the load —
and it batches internally with \`loadMultiple()\` per target entity type. So the
N+1 is not \`referencedEntities()\` itself; it is calling it once per node inside
a loop. Collect the target ids across all nodes first, then load once.

### When the static cache turns on you — and when it stopped

The core version matters here, so check it before repeating the folklore.

**Drupal 10 through Drupal 11.2 — unbounded.** In a web request the identity map
is bounded by the request. In \`drush\` scripts, queue workers, cron and
migrations there is no request end, so one process can load a million nodes and
the memory cache will hold every one — a slow climb to "Allowed memory size
exhausted". You clear it yourself:

- \`$storage->resetCache()\` — drop the static cache for that storage handler
  (optionally only given ids).
- \`\\Drupal::service('entity.memory_cache')->deleteAll()\` — clear it for every
  entity type at once.

Call one of them at the end of each batch. Query counts do not change; peak
memory does.

**Drupal 11.3 and later — a bounded LRU.** Core replaced the static cache with a
least-recently-used cache capped by the \`entity.memory_cache.slots\` container
parameter (issue #3498154). The default is 1000, and it is documented in
\`sites/default/default.services.yml\`: *"The maximum number of entities stored in
memory. Lowering this number can reduce the amount of memory used in
long-running processes like migrations, however will also increase requests to
the database or entity cache backend."* Override it in
\`sites/default/services.yml\`. Load the 1001st entity and the least recently used
one is evicted, so a long-running process plateaus instead of climbing. The
manual clears above still work and still do no harm, but they are now a tuning
knob rather than a necessity — and the trade runs the other way: fewer slots
means less memory but more trips back to \`cache_entity\` or the database.
`,

  comparisons: [
    {
      label: "The N+1 and its fix",
      intro:
        "Rendering a related-incidents sidebar. Both stacks have an identity map that makes repeat loads free and a batching call that makes first loads cheap — the failure mode is identical.",
      php: `<?php
// Doctrine: N+1. findOneBy() per id; the UnitOfWork identity map only
// helps if the entity was already managed in this EntityManager.
foreach ($incidentIds as $id) {
  $incident = $this->em->getRepository(Incident::class)->find($id); // 1 query each
  $rows[] = $this->renderer->row($incident);
}
// SELECT ... FROM incident WHERE id = ?   x 50

// Fix: one query, and every result is now in the identity map.
$incidents = $this->em->getRepository(Incident::class)
  ->createQueryBuilder('i')
  ->where('i.id IN (:ids)')->setParameter('ids', $incidentIds)
  ->getQuery()->getResult();                                        // 1 query`,
      ts: `<?php
// Drupal: N+1. load() is loadMultiple([$id]) — one storage round trip each.
$storage = $this->entityTypeManager->getStorage('node');
foreach ($incidentIds as $nid) {
  $node = $storage->load($nid);            // miss -> cache_entity -> SELECT
  $rows[] = $this->viewBuilder->view($node, 'teaser');
}

// Fix: one call. Storage splits the ids into "already in the static cache"
// and "not", and issues a single IN () query for the remainder.
$nodes = $storage->loadMultiple($incidentIds);
foreach ($nodes as $nid => $node) {
  $rows[] = $this->viewBuilder->view($node, 'teaser');
}

// Node::loadMultiple($ids) is the same thing via the static wrapper.`,
      note: "Both fixes return the exact same hydrated objects. The win is round trips, not rows — 50 x 1ms of network latency beats the query planner every time.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Load only what you need",
      intro:
        "Find the six most recent unresolved incidents. The temptation in both stacks is to fetch everything and filter in application code.",
      php: `<?php
// Wrong: hydrate the whole table, filter in PHP.
$all = $this->em->getRepository(Incident::class)->findAll();
$open = array_slice(array_filter($all, fn($i) => !$i->isResolved()), 0, 6);

// Right: push the filter and the limit into the database. A fetch join
// pulls the reporter in the same query instead of lazy-loading it later.
$open = $this->em->createQuery(
    'SELECT i, r FROM App\\\\Entity\\\\Incident i
     JOIN i.reporter r
     WHERE i.resolved = false
     ORDER BY i.createdAt DESC'
  )->setMaxResults(6)->getResult();`,
      ts: `<?php
// Wrong: loadMultiple() with no argument loads EVERY node of that type.
$all = $this->entityTypeManager->getStorage('node')->loadMultiple();
$open = array_filter($all, fn($n) => $n->bundle() === 'incident'
  && $n->get('field_resolved')->value == 0);

// Right: entityQuery returns IDS ONLY, then one loadMultiple().
$storage = $this->entityTypeManager->getStorage('node');
$nids = $storage->getQuery()
  ->accessCheck(TRUE)              // required — omitting it throws QueryException
  ->condition('type', 'incident')
  ->condition('status', 1)
  ->condition('field_resolved', 0)
  ->sort('created', 'DESC')
  ->range(0, 6)
  ->execute();                     // ['1042' => '1042', ...]
$open = $storage->loadMultiple($nids);

// Drupal has no fetch join: reference targets load on demand.
// Batch them yourself instead of touching them one node at a time.
$authorIds = [];
foreach ($open as $node) {
  $authorIds[] = $node->getOwnerId();
}
$authors = $this->entityTypeManager->getStorage('user')
  ->loadMultiple(array_unique($authorIds));`,
      note: "entityQuery is a query builder over the field tables, not an object loader. Ids out, then one loadMultiple() in. accessCheck() is not optional in Drupal 10 and 11.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Long-running processes: clearing the identity map",
      intro:
        "A queue worker re-indexing 200,000 incidents. In both stacks the per-request identity map has no request to end, so on Drupal 10 and 11.2 or earlier it grows until the process dies. (Drupal 11.3 caps it — see the note below.)",
      php: `<?php
// Doctrine: the UnitOfWork holds every managed entity for the process life.
foreach ($this->batches($ids, 100) as $batch) {
  $incidents = $repo->findBy(['id' => $batch]);
  foreach ($incidents as $incident) {
    $this->indexer->index($incident);
  }
  $this->em->flush();
  $this->em->clear();   // detach everything; without this: memory exhausted
  gc_collect_cycles();
}`,
      ts: `<?php
// Drupal 10 / 11.2 and earlier: entity.memory_cache holds every loaded
// entity for the process life. From 11.3 it is an LRU capped at the
// entity.memory_cache.slots parameter (default 1000), so it self-evicts.
public function processItem($data): void {
  $storage = $this->entityTypeManager->getStorage('node');
  $nodes = $storage->loadMultiple($data['nids']);   // batch of 100
  foreach ($nodes as $node) {
    $this->indexer->index($node);
  }

  // Option A: drop the static cache for this storage handler only.
  $storage->resetCache();
  // (or $storage->resetCache($data['nids']) for just these ids)

  // Option B: drop it for every entity type at once. This is what
  // MigrateExecutable::attemptMemoryReclaim() did in Drupal 10 and early
  // 11; core removed that memory management in 11.3 once the static cache
  // became an LRU (change record 3139212).
  \\Drupal::service('entity.memory_cache')->deleteAll();
}`,
      note: "Neither call changes the query count — both processes issue the same number of queries. They change peak RSS, which is what actually kills the worker. On Drupal 11.3+ the LRU already bounds RSS, so the Drupal-side clear becomes optional: lower entity.memory_cache.slots in services.yml instead.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Counting the queries so you can prove it",
      intro:
        "You cannot claim a fix without a before and after number. Both stacks can log the queries a single request issued.",
      php: `<?php
// Symfony: the profiler's Doctrine panel gives query count + duplicates
// for every request in dev, with no code changes.
//   bin/console debug:container doctrine.dbal.logging_middleware
// In prod, Blackfire counts SQL calls per profile:
//   blackfire curl https://news.example/incidents

// Programmatically, with DBAL's logging middleware. SQLLogger and its
// DebugStack were deprecated in DBAL 3.2 and REMOVED in DBAL 4.0, along
// with Configuration::get/setSQLLogger() — middlewares are the supported
// path, and must be registered before the connection is created.
$logger = new class extends \\Psr\\Log\\AbstractLogger {
  public array $queries = [];
  public function log($level, $message, array $context = []): void {
    // The middleware emits "Executing query: {sql}" and, for prepared
    // statements, "Executing statement: {sql} (parameters: ...)".
    if (str_starts_with((string) $message, 'Executing ')) {
      $this->queries[] = $context['sql'] ?? (string) $message;
    }
  }
};

$config = (new \\Doctrine\\DBAL\\Configuration())
  ->setMiddlewares([new \\Doctrine\\DBAL\\Logging\\Middleware($logger)]);
$connection = \\Doctrine\\DBAL\\DriverManager::getConnection($params, $config);
$this->renderSidebar();   // running through an EntityManager on $connection
printf("queries: %d\\n", count($logger->queries));`,
      ts: `<?php
// Drupal core: Database::startLog() / getLog(), no contrib needed.
use Drupal\\Core\\Database\\Database;

Database::startLog('sidebar');
$build = $this->buildRelatedIncidents($node);
$log = Database::getLog('sidebar');

printf("queries: %d\\n", count($log));
foreach ($log as $entry) {
  // $entry['query'], $entry['args'], $entry['time'], $entry['caller']
  printf("%6.2fms  %s\\n", $entry['time'] * 1000, $entry['query']);
}

// Interactively, without editing the module:
//   drush php:eval "\\Drupal\\Core\\Database\\Database::startLog('x'); ..."
// Or install the Webprofiler contrib module
// (drupal.org/project/webprofiler — 10.x or 11.x branch to match core):
// its toolbar Database panel gives the per-request query count and the
// full list of queries, so the repeats are easy to spot. Devel no longer
// ships a query log on Drupal 10/11.`,
      note: "The caller field in each log entry names the function that issued the query — that is how you find which loop is producing forty identical SELECTs.",
      leftLang: "php",
      rightLang: "php",
    },
  ],

  playground: {
    intro:
      "A model of entity storage: a persistent table, a per-request static cache (the identity map), and a query counter. Predict the query counts for each pattern before you run it — especially B's second pass, and whether resetCache() costs extra queries.",
    lang: "php",
    code: `<?php
// A model of Drupal entity storage: one persistent table, a per-request
// static cache (the entity.memory_cache identity map), and a query counter.

final class FakeNodeStorage {
  private array $static = [];
  public int $queries = 0;
  public int $rows = 0;

  public function __construct(private array $db) {}

  // ONE query for however many uncached ids are asked for.
  public function loadMultiple(array $ids): array {
    $missing = array_values(array_diff($ids, array_keys($this->static)));
    if ($missing !== []) {
      $this->queries++;
      foreach ($missing as $id) {
        if (isset($this->db[$id])) {
          $this->static[$id] = $this->db[$id];
          $this->rows++;
        }
      }
    }
    $out = [];
    foreach ($ids as $id) {
      if (isset($this->static[$id])) {
        $out[$id] = $this->static[$id];
      }
    }
    return $out;
  }

  // EntityStorageBase::load() is literally loadMultiple() with one id.
  public function load(int $id): ?string {
    return $this->loadMultiple([$id])[$id] ?? NULL;
  }

  public function resetCache(?array $ids = NULL): void {
    if ($ids === NULL) {
      $this->static = [];
      return;
    }
    foreach ($ids as $id) {
      unset($this->static[$id]);
    }
  }

  public function held(): int {
    return count($this->static);
  }
}

$db = [];
foreach (range(101, 108) as $nid) {
  $db[$nid] = "Incident #" . ($nid - 100);
}
$ids = array_keys($db);

// --- Pattern A: load() inside a loop (the N+1 bug) -----------------------
$a = new FakeNodeStorage($db);
foreach ($ids as $nid) {
  $a->load($nid);
}
printf("A  load() in a loop            queries=%d  rows=%d  static=%d\\n",
  $a->queries, $a->rows, $a->held());

// --- Pattern B: one loadMultiple() --------------------------------------
$b = new FakeNodeStorage($db);
$b->loadMultiple($ids);
printf("B  loadMultiple(\\$ids)          queries=%d  rows=%d  static=%d\\n",
  $b->queries, $b->rows, $b->held());

// --- The static cache makes the SECOND pass free, in both patterns ------
foreach ($ids as $nid) {
  $b->load($nid);
}
printf("B  + a second pass of load()   queries=%d  rows=%d  static=%d\\n",
  $b->queries, $b->rows, $b->held());

// --- Pattern C: load everything, filter in PHP vs query for ids ---------
$c = new FakeNodeStorage($db);
$all = $c->loadMultiple($ids);
$published = array_slice($all, 0, 2, TRUE);
printf("C  load all, filter in PHP     queries=%d  rows=%d  (kept %d)\\n",
  $c->queries, $c->rows, count($published));

$d = new FakeNodeStorage($db);
$d->queries++;                        // the entityQuery that returns ids only
$matching = [101, 102];
$d->loadMultiple($matching);
printf("D  entityQuery -> loadMultiple queries=%d  rows=%d  (kept %d)\\n",
  $d->queries, $d->rows, count($matching));

// --- The long-running process: the identity map never lets go ----------
// (This models Drupal 10 / 11.2 and earlier. From 11.3 the cache is an LRU
// capped at entity.memory_cache.slots, so "held" would stop at that cap.)
echo "\\nQueue worker processing 4 batches without resetCache():\\n";
$w = new FakeNodeStorage($db);
foreach ([[101, 102], [103, 104], [105, 106], [107, 108]] as $i => $batch) {
  $w->loadMultiple($batch);
  printf("  batch %d  entities held in memory: %d\\n", $i + 1, $w->held());
}
echo "Same worker, calling resetCache() after each batch:\\n";
$w2 = new FakeNodeStorage($db);
foreach ([[101, 102], [103, 104], [105, 106], [107, 108]] as $i => $batch) {
  $w2->loadMultiple($batch);
  printf("  batch %d  entities held in memory: %d\\n", $i + 1, $w2->held());
  $w2->resetCache();
}
printf("Queries are identical (%d vs %d); only the memory profile differs.\\n",
  $w->queries, $w2->queries);
`,
    output: `A  load() in a loop            queries=8  rows=8  static=8
B  loadMultiple($ids)          queries=1  rows=8  static=8
B  + a second pass of load()   queries=1  rows=8  static=8
C  load all, filter in PHP     queries=1  rows=8  (kept 2)
D  entityQuery -> loadMultiple queries=2  rows=2  (kept 2)

Queue worker processing 4 batches without resetCache():
  batch 1  entities held in memory: 2
  batch 2  entities held in memory: 4
  batch 3  entities held in memory: 6
  batch 4  entities held in memory: 8
Same worker, calling resetCache() after each batch:
  batch 1  entities held in memory: 2
  batch 2  entities held in memory: 2
  batch 3  entities held in memory: 2
  batch 4  entities held in memory: 2
Queries are identical (4 vs 4); only the memory profile differs.
`,
  },

  keyPoints: [
    "EntityStorageBase::load($id) is loadMultiple([$id]) — so N loads in a loop are N storage round trips, while loadMultiple($ids) issues one IN () query for the ids not already cached.",
    "Two caches sit in front of the database: the per-request static cache from the entity.memory_cache service (an identity map — you get the same object instance back) and the persistent cache_entity bin across requests. Both default to on for content entities via the static_cache and persistent_cache entity-type properties.",
    "The static cache hides N+1 bugs: the second pass over the same ids is free, so the loop looks harmless in tests and only bites on a cold cache under real traffic — benchmark after drush cache:rebuild.",
    "Use entityQuery with conditions and range() to get ids, then one loadMultiple() — never loadMultiple() with no argument followed by array_filter(). entityQuery requires an explicit accessCheck(TRUE|FALSE) or it throws QueryException. referencedEntities() batches per target type, but calling it once per node inside a loop reintroduces the N+1.",
    "Through Drupal 11.2 the static cache never expires inside a CLI process, so drush scripts, queue workers, cron and migrations must call $storage->resetCache() or \\Drupal::service('entity.memory_cache')->deleteAll() per batch to keep peak memory flat. From Drupal 11.3 entity.memory_cache is an LRU bounded by the entity.memory_cache.slots parameter (default 1000, set in sites/default/services.yml), so it evicts on its own and the manual clear becomes a tuning knob.",
    "Prove the fix with numbers: Database::startLog('key') / Database::getLog('key') gives you the query count, timings and the caller of each query.",
  ],

  interview: [
    {
      q: "A custom block on our incident site takes 900ms. Webprofiler says it issues 63 queries. How do you approach it?",
      a: "First I look at the *shape* of the 63, not the total: `Database::getLog()` gives me each query plus its `caller`, so I can see whether it is 63 different queries or the same `SELECT ... WHERE nid = ?` sixty times with a different argument. The repeated-query shape is the classic N+1 — `Node::load()` or `referencedEntities()` inside a `foreach`. The fix is to collect the ids first and issue one `loadMultiple()`, which storage turns into a single `IN ()` query per field table. Then I re-measure with a cold cache (`drush cache:rebuild` first) because the entity static cache will happily make a broken second run look fast. If the count is already low and the time is not, the problem is elsewhere — render caching or a genuinely slow query — and I move to profiling.",
    },
    {
      q: "Explain Drupal's entity static cache to someone who knows Doctrine.",
      a: "It is Doctrine's identity map with a shorter life. Entity storage keeps loaded entities in a `MemoryCacheInterface` backend from the `entity.memory_cache` service, keyed by entity type and id, so a second `load()` in the same request returns the *same PHP object* with no query — mutate it through one reference and the other sees the change. The difference from Doctrine is scope and intent: it is per-request only, it is not a unit of work (there is no change tracking or flush; you call `$entity->save()` yourself), and behind it Drupal has a second, persistent tier in the `cache_entity` bin that survives across requests and is invalidated by the entity's cache tags. The failure mode used to be the same as Doctrine's: in a long-running CLI process nothing ends the request, so on Drupal 10 and 11.2 or earlier the map grows until memory runs out, and you clear it with `$storage->resetCache()` the way you would call `EntityManager::clear()`. Drupal 11.3 turned that cache into an LRU bounded by the `entity.memory_cache.slots` parameter — default 1000 — so it now evicts for you, which Doctrine's UnitOfWork still does not.",
    },
    {
      q: "When would you deliberately call resetCache(), and what does it cost?",
      a: "In anything that outlives a normal web request: `drush` scripts, queue workers, `hook_cron` implementations, migrations and Batch API operations that walk large id sets. On Drupal 10 and Drupal 11 up to 11.2 the `entity.memory_cache` identity map is unbounded, so without a clear it accumulates every entity the process ever touched and you hit `Allowed memory size exhausted` partway through a 200,000-row job. I call `$storage->resetCache()` at the end of each batch, or `\\Drupal::service('entity.memory_cache')->deleteAll()` when several entity types are involved — that is what `MigrateExecutable::attemptMemoryReclaim()` did on those versions (`drupal_static_reset()`, `entity.memory_cache->deleteAll()`, `gc_collect_cycles()`). I would check the core version first, though: Drupal 11.3 made that cache an LRU capped at the `entity.memory_cache.slots` parameter (default 1000) and removed Migrate's memory management entirely for exactly that reason (change record 3139212), so on 11.3+ the knob is the slot count in `services.yml` rather than a manual clear. Either way the cost is the same: a later re-load of the same entity goes back to the persistent `cache_entity` bin or the database, so it is a memory-versus-queries trade, and in a batch job that never revisits an id it is pure win. I would not force it inside a web request, where the identity map is exactly what you want.",
    },
    {
      q: "Why is `loadMultiple()` with no arguments a red flag in a code review?",
      a: "Because it loads and fully hydrates every entity of that type — every node on the site — before your code has filtered anything. On a news site with 80,000 incident nodes that is a table scan plus 80,000 object constructions plus every field table joined in, to keep the six you wanted. It also tends to pass in dev, where the database has 40 rows, and fall over in production. The correct pattern is an `entityQuery` that pushes the conditions, sort and `range()` into SQL and returns ids only, then a single `loadMultiple($ids)` on that short list. And since Drupal 10 the query must call `accessCheck(TRUE)` or `accessCheck(FALSE)` explicitly — it throws a `QueryException` otherwise — which is a useful prompt to think about whether the listing should be filtered by the viewing user's access at all.",
    },
  ],

  quiz: [
    {
      question:
        "You replace a `foreach ($nids as $nid) { Node::load($nid); }` loop with `Node::loadMultiple($nids)` for 50 nodes. What changes?",
      options: [
        "Nothing — `loadMultiple()` calls `load()` internally, once per id.",
        "The number of storage round trips drops from 50 to 1; the same 50 hydrated objects come back.",
        "Fewer field values are loaded, so you must call `referencedEntities()` afterwards.",
        "The entities skip the static cache and are always read from the database.",
      ],
      answerIndex: 1,
      explain:
        "The relationship runs the other way: `EntityStorageBase::load($id)` is implemented as `loadMultiple([$id])`. Batching lets storage issue one `IN ()` query per table instead of one per entity. You get identical hydrated objects — the win is round trips and latency, and the loaded entities land in the static cache either way.",
    },
    {
      question:
        "On a Drupal 10 site, a queue worker loops over 200,000 nodes in batches of 100 with `loadMultiple()` and dies with 'Allowed memory size exhausted' after about 40,000. What is the most likely cause?",
      options: [
        "`loadMultiple()` leaks database connections.",
        "The `cache_entity` bin has grown too large for the database.",
        "The entity static cache (`entity.memory_cache`) is unbounded on this version, so it holds every entity loaded during the process and nothing ends the request to clear it.",
        "The batch size of 100 is too large; it must be 10 or fewer.",
      ],
      answerIndex: 2,
      explain:
        "The static cache is scoped to a request, and a CLI process is one very long request. On Drupal 10 — and on Drupal 11 up to 11.2 — that cache has no size limit, so every entity ever loaded stays in the identity map. Call `$storage->resetCache()` — or `\\Drupal::service('entity.memory_cache')->deleteAll()` for all entity types — at the end of each batch. Query counts are unchanged; only peak memory drops. From Drupal 11.3 the same cache is an LRU capped at `entity.memory_cache.slots` (default 1000), so this job would plateau rather than die, and the fix becomes lowering the slot count in `services.yml`.",
    },
    {
      question:
        "Which pair of calls is the correct way to get the six newest published incident nodes?",
      options: [
        "`$storage->loadMultiple()` then `array_filter()` and `array_slice()` in PHP.",
        "`$storage->getQuery()->condition('type','incident')->condition('status',1)->sort('created','DESC')->range(0,6)->accessCheck(TRUE)->execute()` then `$storage->loadMultiple($nids)`.",
        "`$storage->loadByProperties()` with no conditions, then sort the result array.",
        "A raw `SELECT * FROM node_field_data` with `\\Drupal::database()->query()`, then `Node::load()` per row.",
      ],
      answerIndex: 1,
      explain:
        "`entityQuery` pushes the conditions, sort and limit into SQL and returns ids only; one `loadMultiple()` then hydrates exactly six entities. Option 1 hydrates the entire table to keep six. Option 4 reintroduces an N+1 and bypasses the entity API. Note that `accessCheck()` must be called explicitly or the query throws a `QueryException`.",
    },
    {
      question:
        "Your fix looks like it made no difference: the query count is the same before and after. What is the most likely measurement mistake?",
      options: [
        "`Database::getLog()` only records write queries.",
        "The second measurement ran with a warm entity static cache or a warm `cache_entity` bin, so the old code was not issuing its queries either.",
        "`loadMultiple()` queries are not logged by the database layer.",
        "The query count only updates after cron runs.",
      ],
      answerIndex: 1,
      explain:
        "Both entity cache tiers absorb repeat loads, which is exactly what makes N+1 bugs so easy to miss. Benchmark from a cold state — `drush cache:rebuild`, a fresh request, and measure the first hit — otherwise the static cache flatters the broken code and hides your improvement.",
    },
  ],
};

export default lesson;
