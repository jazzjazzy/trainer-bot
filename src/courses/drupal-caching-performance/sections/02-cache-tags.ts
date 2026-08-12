import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "cache-tags",
  title: "Cache Tags: Invalidation That Actually Works",
  part: "The Cacheability Model",
  estMinutes: 12,
  summary:
    "Tags are dependency labels, not cache keys: where Drupal derives them for you, why a listing needs node_list rather than the ids it happened to show, and how the {cachetags} checksum table makes invalidating millions of entries a single UPDATE.",

  concept: `
## A tag is a dependency label, not a key

A cache **key** answers "where do I store this?". A cache **tag** answers
"what does this depend on?". \`node:5\` on a cached fragment is a standing
promise: *if node 5 ever changes, throw me away*. Tags are plain strings, they
are global across every cache bin, and one item can carry hundreds of them.

The rule that makes the system work is blunt: **anything you rendered from a
piece of data must carry that data's tag.** Rendered the author's name?
\`user:12\`. Read the site name out of config? \`config:system.site\`. Pulled a
severity list from a taxonomy? \`taxonomy_term:9\` plus
\`taxonomy_term_list\`. Called an external incident API? A tag you invent.

## Drupal derives most of them for you

Entities and config objects implement \`CacheableDependencyInterface\`, so
\`$node->getCacheTags()\` returns \`['node:5']\` and
\`$config->getCacheTags()\` returns \`['config:system.site']\`. Entity view
builders, field formatters, Views and block plugins already attach these — which
is why a stock article page invalidates correctly without you writing a line.

You only have to think when you leave that path: a custom block, a controller,
a service that assembles data by hand. Then use the helpers rather than
\`array_merge\`:

\`\`\`php
$build['#cache']['tags'] = Cache::mergeTags(
  $build['#cache']['tags'] ?? [],
  $node->getCacheTags(),
);
// Better still — merges tags, contexts AND max-age in one call:
$this->renderer->addCacheableDependency($build, $node);
\`\`\`

\`Cache::mergeTags()\` de-duplicates and asserts that every tag is a string —
unlike \`array_merge()\`, which happily produces duplicates. (Order does not
matter: the checksum is a sum, and cache IDs are built from
\`#cache['keys']\` and contexts, not tags.)

## LIST tags vs specific tags

\`node:5\` covers *that node changing*. It does not cover *a different node
appearing in your listing*. Query results depend on rows that are not in the
result, so a listing must also carry a **list tag**: \`node_list\`, or the
narrower bundle form \`node_list:incident\` (available since Drupal 8.9, so it
is there on 10 and 11). Same for \`taxonomy_term_list\`, \`user_list\`, and so on.

The classic production bug is a hand-built "latest incidents" block that tags
only the five nodes it happened to render. Editors publish a breaking story, the
block does not move, and someone blames Varnish. Rule of thumb: **render one
entity, use its specific tag; render the result of a query, add the list tag
too.**

## What invalidation actually does

Nothing is deleted. \`Cache::invalidateTags(['node:5'])\` increments a counter
for that tag in the \`{cachetags}\` table
(\`Drupal\\Core\\Cache\\DatabaseCacheTagsChecksum\`, service
\`cache_tags.invalidator.checksum\`). Every cache item stores the **sum** of its
tags' counters at write time; on read, the backend re-sums and compares. Different
means stale, which means a miss. So invalidation costs one row per tag no matter
how many million entries carry it, and it behaves identically on database,
Redis or Memcache backends. Actual deletion is lazy garbage collection.

Entity saves route through \`EntityBase::invalidateTagsOnSave()\`: list tags
always, \`4xx-response\` when the entity type has a canonical link template, and
the entity's own tag **only on update** — a brand-new node cannot invalidate
\`node:9\`, because nothing could have cached it yet.

## Tags you invent

For data Drupal does not own, mint your own — \`incident_feed\` — attach it
wherever that data is rendered or cached, and invalidate it from the webhook or
cron that ingests the feed. Reach for a tag before you reach for max-age: a
max-age is a guess, a tag is a fact.
`,

  comparisons: [
    {
      label: "Caching a listing",
      intro:
        "The 'latest incidents' block on the news site. Both stacks cache the rendered listing; the difference is who works out what the listing depends on.",
      php: `// Symfony: TagAwareCacheInterface. You invent the tag vocabulary and
// remember to attach it at every call site.
public function latestIncidents(): string
{
    return $this->cache->get('incident_feed', function (ItemInterface $item): string {
        $incidents = $this->repo->findLatest(10);

        // Per-item tags: entirely on you.
        foreach ($incidents as $incident) {
            $item->tag('incident_' . $incident->getId());
        }
        // The "a new one might appear" tag: also on you, and the one
        // people forget. Your repository must invalidate it on insert.
        $item->tag('incident_list');

        return $this->twig->render('feed.html.twig', ['incidents' => $incidents]);
    });
}`,
      ts: `// Drupal: the teasers tag themselves. You supply the list tag.
public function build(): array {
  $storage = $this->entityTypeManager->getStorage('node');
  $nids = $storage->getQuery()
    ->accessCheck(TRUE)
    ->condition('type', 'incident')
    ->condition('status', 1)
    ->sort('created', 'DESC')
    ->range(0, 10)
    ->execute();

  // Each rendered teaser already carries node:N and its author's user:N.
  $build = $this->entityTypeManager
    ->getViewBuilder('node')
    ->viewMultiple($storage->loadMultiple($nids), 'teaser');

  // This is the tag core cannot infer: the query result depends on
  // incident nodes that are not in the result.
  $build['#cache']['tags'] = ['node_list:incident'];

  return $build;
}`,
      note:
        "Specific tags come free from the view builder; the list tag never does. Omit it and new content never appears for anonymous visitors.",
    },
    {
      label: "Declaring a dependency you took on",
      intro:
        "A custom block that mixes an entity and a config value. Both need every dependency recorded, but Drupal gives you an object-level API instead of string concatenation.",
      php: `// Nothing in Symfony knows which objects your callback touched,
// so every dependency is a string you type by hand.
$html = $this->cache->get($key, function (ItemInterface $item) use ($article) {
    $item->tag('article_' . $article->getId());
    $item->tag('site_settings');
    $item->expiresAfter(3600);

    return $this->render($article, $this->settings->getSiteName());
});`,
      ts: `use Drupal\\Core\\Cache\\CacheableMetadata;

$site = $this->configFactory->get('system.site');

$build = [
  '#markup' => $node->label() . ' — ' . $site->get('name'),
];

$meta = CacheableMetadata::createFromRenderArray($build);
$meta->addCacheableDependency($node);   // tags: node:5  (+ contexts, max-age)
$meta->addCacheableDependency($site);   // tags: config:system.site
$meta->applyTo($build);

// Equivalent one-liners when you have the renderer injected:
// $this->renderer->addCacheableDependency($build, $node);
// $this->renderer->addCacheableDependency($build, $site);`,
      note:
        "addCacheableDependency() merges tags, contexts and max-age together. Hand-written '#cache' arrays reliably remember tags and forget the other two.",
    },
    {
      label: "A tag for data Drupal does not own",
      intro:
        "The incident site pulls a severity feed from an external API. Nothing in Drupal will ever invalidate that for you, so you mint the tag and fire it yourself.",
      php: `// Symfony: same shape, different names.
$feed = $this->cache->get('weather_alerts', function (ItemInterface $item) {
    $item->tag('weather_alerts');
    $item->expiresAfter(900);
    return $this->http->request('GET', $this->endpoint)->toArray();
});

// The ingest worker / webhook controller:
$this->cache->invalidateTags(['weather_alerts']);`,
      ts: `use Drupal\\Core\\Cache\\Cache;

// Store the raw payload in a cache bin, tagged with your own tag.
$cid = 'incident_feed:alerts';
if ($cached = $this->cacheDefault->get($cid)) {
  $alerts = $cached->data;
}
else {
  $alerts = $this->feedClient->fetchAlerts();
  // Cache::PERMANENT: no expiry — the tag decides when it dies.
  $this->cacheDefault->set($cid, $alerts, Cache::PERMANENT, ['incident_feed']);
}

// Anything rendered from it repeats the tag so the page cache and the
// edge follow along.
$build['#cache']['tags'] = Cache::mergeTags(
  $build['#cache']['tags'] ?? [],
  ['incident_feed'],
);

// The webhook or cron that ingests a new payload:
Cache::invalidateTags(['incident_feed']);`,
      note:
        "Cache::PERMANENT plus a custom tag beats a short max-age: the data stays hot until it actually changes, instead of being thrown away on a timer.",
    },
    {
      label: "Invalidating from the command line",
      intro:
        "Same operation, both stacks: bump the tag rather than flush the whole cache. Useful after a bad import or a content-freeze fix.",
      php: `# Symfony: invalidate named tags across taggable pools.
php bin/console cache:pool:invalidate-tags incident_feed
php bin/console cache:pool:invalidate-tags incident_feed alerts --pool=cache.app

# The blunt instrument you are trying NOT to use:
php bin/console cache:pool:clear cache.app`,
      ts: `# Drush: comma-delimited list of cache tags (alias: drush ct).
drush cache:tags incident_feed
drush cache:tags node:5,node_list:incident,config:system.site

# The blunt instrument. On a busy site this is a self-inflicted
# thundering herd — every anonymous page re-renders at once.
drush cache:rebuild`,
      leftLang: "bash",
      rightLang: "bash",
      note:
        "Reaching for 'drush cr' to fix a staleness bug is a diagnosis, not a solution: it means some fragment is missing a tag.",
    },
  ],

  playground: {
    intro:
      "The checksum model in miniature, with no Drupal. Three cached fragments on the incident site, each storing the sum of its tags' invalidation counters. Watch which ones go stale when node 5 is edited, and — the point of the exercise — which one stays wrongly fresh when a brand-new incident is published. Predict the last three lines before you run it.",
    lang: "php",
    code: `<?php
// A miniature of Drupal's cache-tag checksum model (the {cachetags} table).
$counters = [];   // tag => invalidation count. Missing means 0.
$bin      = [];   // cid => ['tags' => [...], 'checksum' => int, 'data' => string]

function checksum(array $tags, array $counters): int {
  $sum = 0;
  foreach ($tags as $tag) {
    $sum += $counters[$tag] ?? 0;
  }
  return $sum;
}

function cache_set(array &$bin, array $counters, string $cid, array $tags, string $data): void {
  sort($tags);
  $bin[$cid] = ['tags' => $tags, 'checksum' => checksum($tags, $counters), 'data' => $data];
  echo "SET    $cid  tags=[" . implode(' ', $tags) . "] checksum=" . $bin[$cid]['checksum'] . "\\n";
}

function cache_get(array $bin, array $counters, string $cid): void {
  $item = $bin[$cid];
  $now = checksum($item['tags'], $counters);
  if ($now === $item['checksum']) {
    echo "HIT    $cid  -> " . $item['data'] . "\\n";
  }
  else {
    echo "MISS   $cid  (stale: stored " . $item['checksum'] . ", now $now)\\n";
  }
}

function invalidate(array &$counters, array $tags): void {
  foreach ($tags as $tag) {
    $counters[$tag] = ($counters[$tag] ?? 0) + 1;
  }
  echo "-- Cache::invalidateTags([" . implode(' ', $tags) . "])\\n";
}

// Three cached fragments on the incident site.
cache_set($bin, $counters, 'view:incident_feed', ['node_list:incident'], '3 incidents');
cache_set($bin, $counters, 'node:5:teaser', ['node:5', 'user:12'], 'Storm warning by Ada');
cache_set($bin, $counters, 'block:top3', ['node:5', 'node:6', 'node:7'], 'Top 3 stories');

echo "\\n== Editor updates node 5 -- invalidateTagsOnSave(\\$update = TRUE) ==\\n";
invalidate($counters, ['node_list', 'node_list:incident', '4xx-response', 'node:5']);
cache_get($bin, $counters, 'view:incident_feed');
cache_get($bin, $counters, 'node:5:teaser');
cache_get($bin, $counters, 'block:top3');

echo "\\n== Everything rebuilds and is stored again ==\\n";
cache_set($bin, $counters, 'view:incident_feed', ['node_list:incident'], '3 incidents');
cache_set($bin, $counters, 'node:5:teaser', ['node:5', 'user:12'], 'Storm warning by Ada');
cache_set($bin, $counters, 'block:top3', ['node:5', 'node:6', 'node:7'], 'Top 3 stories');

echo "\\n== New incident node 9 published -- \\$update = FALSE, so no node:9 tag ==\\n";
invalidate($counters, ['node_list', 'node_list:incident', '4xx-response']);
cache_get($bin, $counters, 'view:incident_feed');
cache_get($bin, $counters, 'node:5:teaser');
cache_get($bin, $counters, 'block:top3');

echo "\\ncachetags table now: " . json_encode($counters) . "\\n";
echo "block:top3 listed only the nodes it happened to show, so it never sees node 9.\\n";
`,
    output: `SET    view:incident_feed  tags=[node_list:incident] checksum=0
SET    node:5:teaser  tags=[node:5 user:12] checksum=0
SET    block:top3  tags=[node:5 node:6 node:7] checksum=0

== Editor updates node 5 -- invalidateTagsOnSave($update = TRUE) ==
-- Cache::invalidateTags([node_list node_list:incident 4xx-response node:5])
MISS   view:incident_feed  (stale: stored 0, now 1)
MISS   node:5:teaser  (stale: stored 0, now 1)
MISS   block:top3  (stale: stored 0, now 1)

== Everything rebuilds and is stored again ==
SET    view:incident_feed  tags=[node_list:incident] checksum=1
SET    node:5:teaser  tags=[node:5 user:12] checksum=1
SET    block:top3  tags=[node:5 node:6 node:7] checksum=1

== New incident node 9 published -- $update = FALSE, so no node:9 tag ==
-- Cache::invalidateTags([node_list node_list:incident 4xx-response])
MISS   view:incident_feed  (stale: stored 1, now 2)
HIT    node:5:teaser  -> Storm warning by Ada
HIT    block:top3  -> Top 3 stories

cachetags table now: {"node_list":2,"node_list:incident":2,"4xx-response":2,"node:5":1}
block:top3 listed only the nodes it happened to show, so it never sees node 9.
`,
  },

  keyPoints: [
    "A tag is a dependency label, not a cache key: node:5, user:12, config:system.site, node_list:incident, or one you invent. Anything rendered from a piece of data must carry that data's tag.",
    "Entities and config objects implement CacheableDependencyInterface — use $entity->getCacheTags(), Cache::mergeTags() (never array_merge) or, best, $renderer->addCacheableDependency($build, $entity), which merges tags, contexts and max-age at once.",
    "Specific tags cover an item changing; LIST tags (node_list, node_list:incident since 8.9, taxonomy_term_list) cover an item appearing or disappearing. A cached query result needs both.",
    "Cache::invalidateTags() deletes nothing: it increments a counter per tag in the {cachetags} table, and items whose stored checksum no longer matches are treated as misses. Cost is per tag, not per cached item.",
    "EntityBase::invalidateTagsOnSave() fires list tags on every save, 4xx-response when the entity type has a canonical route, and the entity's own tag only on update — inserts cannot invalidate a tag nothing has cached.",
    "For data Drupal does not own, mint a custom tag, cache with Cache::PERMANENT, and invalidate from the webhook or cron. 'drush cr' as a staleness fix means a missing tag; find it instead.",
  ],

  interview: [
    {
      q: "Explain cache tags to me as if I only know Symfony's cache component.",
      a: "Symfony has the same primitive: \`TagAwareCacheInterface\`, \`$item->tag('article_5')\`, \`$cache->invalidateTags([...])\`. The mechanics are equivalent — Drupal's tags are namespaced strings like \`node:5\`, \`user:12\`, \`config:system.site\` and \`node_list:incident\`. The real difference is who attaches them. In Symfony every tag is a string you type at every call site, so the tag vocabulary is a convention your team has to police. In Drupal, entities and config objects implement \`CacheableDependencyInterface\`, and the entity view builders, field formatters, Views and block system attach those tags automatically as output bubbles up the render tree, so a stock page is already correct. You write tag code only when you step off that path, and then you use \`Cache::mergeTags()\` or \`$renderer->addCacheableDependency()\` rather than string concatenation.",
    },
    {
      q: "A custom 'latest incidents' block shows stale content for anonymous users after editors publish something new. Editing an existing incident does update it. Where do you look?",
      a: "That asymmetry is the tell: the block is tagged with the specific nodes it rendered but not with a list tag. Editing node 5 invalidates \`node:5\`, which the block carries, so it refreshes. Publishing node 9 invalidates \`node_list\` and \`node_list:incident\` — tags the block never declared — so nothing marks it stale. The fix is one line: add \`'node_list:incident'\` to the block's \`#cache['tags']\`, because a cached query result depends on rows that are not in the result. I'd confirm before changing anything by enabling \`http.response.debug_cacheability_headers\` in \`development.services.yml\` and reading \`X-Drupal-Cache-Tags\` on the response, which shows exactly what bubbled to the page.",
    },
    {
      q: "How can Drupal invalidate a tag that appears on millions of cache entries without a huge write?",
      a: "It never touches those entries. \`Cache::invalidateTags()\` goes through the \`cache_tags.invalidator\` service to \`DatabaseCacheTagsChecksum\`, which increments an \`invalidations\` counter for each tag in the \`{cachetags}\` table — one row per tag. When an item is written, the backend stores the sum of its tags' current counters alongside the data. On read, it re-sums and compares; a mismatch is treated as a miss. So invalidation is O(number of tags), not O(number of cached items), and the stale data is reclaimed later by garbage collection. The same checksum service backs Redis and Memcache backends, which is why swapping cache backends does not change invalidation semantics — and why external caches like Varnish need a purge module to translate tags into edge purge requests.",
    },
    {
      q: "When would you use a custom cache tag rather than max-age?",
      a: "Whenever an event exists that tells you the data changed. Max-age is a guess: too long and you serve stale content, too short and you throw away good cache on a timer and lose the benefit. If the incident site ingests an external alerts feed via a webhook or a cron job, I'd cache the payload with \`Cache::PERMANENT\` and the tag \`incident_feed\`, repeat that tag on anything rendered from it, and call \`Cache::invalidateTags(['incident_feed'])\` in the ingest code. The content then stays hot indefinitely and drops the instant it is actually wrong. I'd only fall back to a max-age when there is genuinely no signal — a third-party API I poll blind — and even then I'd combine it with a tag so I can force a refresh with \`drush cache:tags incident_feed\` without flushing the site.",
    },
  ],

  quiz: [
    {
      question:
        "A block renders the ten newest incident teasers. Which cache tags does it need to be correct?",
      options: [
        "node:1 through node:10 — the tags of the nodes it rendered",
        "The rendered teasers' own tags plus a list tag such as node_list:incident",
        "Only node_list — per-node tags are redundant once a list tag is present",
        "None; max-age of 300 covers it",
      ],
      answerIndex: 1,
      explain:
        "The view builder already attaches node:N (and user:N for authors) to each teaser as it bubbles up. What it cannot infer is that the query result depends on incident nodes that are NOT in the result — publishing or unpublishing one changes the list. That is exactly what node_list:incident covers. Dropping the per-item tags would break edits; dropping the list tag breaks new content.",
    },
    {
      question:
        "What does Cache::invalidateTags(['node:5']) actually do to the cache backend?",
      options: [
        "Deletes every cache item whose tag list contains node:5",
        "Marks matching items with an expiry of now so garbage collection removes them",
        "Increments an invalidation counter for node:5 in the {cachetags} table; items whose stored checksum no longer matches are read as misses",
        "Sends a BAN request to Varnish and clears the render cache bin",
      ],
      answerIndex: 2,
      explain:
        "DatabaseCacheTagsChecksum increments one row per tag. Each cache item stores the sum of its tags' counters at write time; on read the backend re-sums and compares, so a mismatch is a miss. That is why invalidation cost scales with the number of tags, not the number of affected entries, and why it works the same on Redis or Memcache. Purging Varnish is a separate step handled by a purge module.",
    },
    {
      question:
        "An editor creates a brand-new incident node (id 9). Which tags does EntityBase::invalidateTagsOnSave() invalidate?",
      options: [
        "node:9, node_list and node_list:incident",
        "node_list, node_list:incident and 4xx-response — but not node:9",
        "node:9 only; list tags fire on delete",
        "Nothing — tags are only invalidated on update and delete",
      ],
      answerIndex: 1,
      explain:
        "On insert there is nothing cached under node:9 yet, so core skips it and invalidates only the list tags — plus 4xx-response, because a previously cached 403 or 404 for that path may now be a valid page. The entity's own tag is merged in only when $update is TRUE.",
    },
    {
      question:
        "You cache an external alerts feed for 15 minutes with max-age. The vendor now sends a webhook when alerts change. What is the better design?",
      options: [
        "Keep max-age 900; webhooks are unreliable",
        "Set max-age 0 so the feed is always fresh",
        "Cache with Cache::PERMANENT plus a custom tag like incident_feed, and call Cache::invalidateTags(['incident_feed']) from the webhook",
        "Call drush cache:rebuild from the webhook handler",
      ],
      answerIndex: 2,
      explain:
        "A max-age is a guess about when data might change; a tag is a statement that it did. Caching permanently with a custom tag keeps the data hot until the webhook says otherwise, and the tag propagates to anything rendered from the feed — including page-level caches and, via a purge module, the edge. Rebuilding the whole cache from a webhook would flush unrelated content and cause a thundering herd.",
    },
  ],
};

export default lesson;
