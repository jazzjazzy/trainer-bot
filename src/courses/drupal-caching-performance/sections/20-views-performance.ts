import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "views-performance",
  title: "Views Performance",
  part: "Data, Queries & Runtime",
  estMinutes: 13,
  summary:
    "Audit what the Views UI generated — the caching plugin, query settings, pager, row style and relationships — and know when a View is simply the wrong tool.",

  concept: `
## You did not write this query, but you own it

In Symfony the failure mode is a query *you* wrote. In Drupal the slow page is
usually a View a site builder assembled through a UI, and every expensive
decision is a checkbox somebody ticked without seeing the SQL. Your job on the
incident site is forensic: read the generated query, then work back to the five
settings that produced it.

Start by making the SQL visible. At \`/admin/structure/views/settings\` (config
\`views.settings\`) turn on \`ui.show.sql_query.enabled\`, plus
\`ui.show.performance_statistics\` and \`ui.show.additional_queries\`. The live
preview now prints the query, its arguments, the row count and the render time.

## The five levers

**Caching** (Advanced → Other → Caching). Plugin ids are \`none\`, \`tag\` and
\`time\`; \`tag\` is core's default. It stores the *result rows* in the
\`cache_data\` bin under a key derived from the generated SQL, tagged with
\`config:views.view.ID\` plus the list cache tag of every entity type in the
query — for a node listing that is the blunt \`node_list\`, so any node save of
any bundle clears it. Choosing **None** is the most expensive click in Drupal:
that plugin's default cache max-age is 0, which bubbles up and stops both the
render cache and Dynamic Page Cache from storing the whole page. It does *not*
stop the Internal Page Cache — that ignores max-age, stores permanently and
only clears on cache tags — so for anonymous traffic the tool is the page cache
kill switch, not max-age 0.

**Pager.** \`PagerPluginBase::useCountQuery()\` returns TRUE, and the full pager
inherits it — so "Paged output, full pager" fires a second \`COUNT(*)\` over the
same joins with no LIMIT to help it. \`mini\`, \`some\` and \`none\` all override it
to FALSE. The mini pager works out whether a next page exists by asking for
\`items_per_page + 1\` rows and popping the extra one.

**Query settings.** \`distinct\` adds \`DISTINCT\`, forcing a dedupe pass over the
whole result set. "Disable SQL rewriting" (\`disable_sql_rewrite\`) strips every
query tag — including \`node_access\` — so it is fast *and* a security hole. Core
warns you inline; believe the warning.

**Row style.** \`fields\` prints columns the query already selected.
\`entity:node\` with a view mode loads each entity and pushes it through the full
render pipeline: formatters, preprocess, Twig, per-row. On a 25-row listing that
is 25 entity renders instead of zero.

**Relationships.** Each one is another JOIN, and a to-many relationship
multiplies rows — which is usually why somebody ticked Distinct.

## Results cache is not output cache

Two separate caches. The cache plugin's *results* cache skips the SQL. The
*output* goes through the ordinary render cache using the display's
\`cache_metadata\` (max-age, contexts, tags), which Views recalculates and writes
into the view config on save. A results hit still costs you 25 entity renders.

## When a View is the wrong tool

Very large result sets (a \`COUNT(*)\` over two million rows never gets fast),
heavy aggregation, relevance ranking, or faceted search across entity types:
hand those to Search API with a Solr or database backend, or write the query
yourself in a controller and attach cacheability by hand.
`,

  comparisons: [
    {
      label: "Where the expensive decisions live",
      intro:
        "The same listing — 25 incidents with author and section — expressed as Doctrine you wrote, and as Views config somebody clicked. Read the YAML the way you would read the DQL.",
      php: `<?php
// Symfony: every cost is visible in the code you wrote.
final class IncidentRepository extends ServiceEntityRepository
{
    /** @return Incident[] */
    public function latest(int $page = 0): array
    {
        return $this->createQueryBuilder('i')
            // Each join is a deliberate keystroke.
            ->leftJoin('i.author', 'a')->addSelect('a')
            ->leftJoin('i.section', 's')->addSelect('s')
            ->where('i.published = true')
            ->orderBy('i.createdAt', 'DESC')
            ->setFirstResult($page * 25)
            ->setMaxResults(25)
            ->getQuery()
            ->getResult();
    }

    // Want a page count? You write the COUNT yourself, so you notice
    // that you are paying for it.
    public function total(): int
    {
        return (int) $this->createQueryBuilder('i')
            ->select('COUNT(i.id)')
            ->where('i.published = true')
            ->getQuery()->getSingleScalarResult();
    }
}`,
      ts: `# views.view.incidents.yml - the same decisions, made in a UI.
display:
  page_1:
    display_options:
      pager:
        # 'full' inherits useCountQuery() = TRUE -> a second COUNT(*).
        # 'mini' / 'some' / 'none' override it to FALSE.
        type: mini
        options:
          items_per_page: 25
      row:
        # 'fields' = print selected columns.
        # 'entity:node' = load + render 25 entities through a view mode.
        type: fields
      style:
        type: default
      relationships:
        # Every entry here is another JOIN.
        uid: { id: uid, table: node_field_data, field: uid, required: true }
      query:
        type: views_query
        options:
          query_comment: 'incidents:page_1'
          disable_sql_rewrite: false   # leave FALSE: node_access lives here
          distinct: false              # only if a to-many join duplicates rows
          replica: true                # read from the replica connection
          query_tags: {  }
      cache:
        type: tag
        options: {  }`,
      note: "query_comment is worth setting on every heavy display: the comment appears in the slow query log, so a mystery query in production names its own View.",
      rightLang: "yaml",
    },
    {
      label: "Reading the generated SQL",
      intro:
        "Before changing anything, look at the query. Symfony gives you a profiler; Views gives you a live preview and a Drush runner.",
      php: `<?php
// Symfony: three ways to see the real SQL.

// 1. Straight off the query object.
$query = $repo->createQueryBuilder('i')->getQuery();
dump($query->getSQL(), $query->getParameters());

// 2. The Doctrine panel in the web profiler: query count,
//    duration, and a "same query N times" warning for N+1.

// 3. Blackfire / Xdebug profile for the render side.
//    bin/console doctrine:query:sql 'EXPLAIN SELECT ...'`,
      ts: `# Drupal: turn on the Views UI diagnostics once, per site.
drush config:set views.settings ui.show.sql_query.enabled 1
drush config:set views.settings ui.show.sql_query.where above
drush config:set views.settings ui.show.performance_statistics 1
drush config:set views.settings ui.show.additional_queries 1

# Now /admin/structure/views/view/incidents shows, under the preview:
#   the generated SQL + arguments
#   "Query build time / Query execute time / View render time"
#   every other query run during the render (the N+1 tell)

# Run a display from the CLI, outside the theme layer entirely:
drush views:execute incidents page_1 --count   # alias: vex
drush views:list --status=enabled

# Then take the SQL to the database and ask it what it thinks:
drush sql:query "EXPLAIN SELECT ..."`,
      note: "Views' 'additional queries' panel is the closest thing Drupal has to Symfony's Doctrine profiler — it is off by default, which is why nobody finds the N+1.",
      rightLang: "bash",
    },
    {
      label: "Caching the result vs caching the output",
      intro:
        "Both stacks distinguish 'don't run the query again' from 'don't build the HTML again'. Symfony makes you wire both; Views gives you a plugin for the first and the render cache for the second.",
      php: `<?php
// Symfony: result caching is explicit and key-management is yours.
use Symfony\\Contracts\\Cache\\ItemInterface;
use Symfony\\Contracts\\Cache\\TagAwareCacheInterface;

final class IncidentListing
{
    public function __construct(
        private TagAwareCacheInterface $cache,
        private IncidentRepository $repo,
    ) {}

    public function latest(int $page): array
    {
        return $this->cache->get(
            'incidents.latest.' . $page,
            function (ItemInterface $item) use ($page) {
                $item->expiresAfter(3600);
                $item->tag(['incident-list']);
                return $this->repo->latest($page);
            }
        );
    }
}

// Doctrine can also do it at the query level:
//   $query->enableResultCache(3600, 'incidents.latest.0');
// Output caching is a separate concern (ESI, or a cached Twig fragment).`,
      ts: `# Drupal: pick a cache plugin per display.

# Tag-based (the default). Results live in cache_data until a tag fires.
cache:
  type: tag
  options: {  }
# Cache tags applied: config:views.view.incidents + node_list
#   -> ANY node save of ANY bundle clears this listing.

# Time-based. Bounded staleness, ignores content changes.
cache:
  type: time
  options:
    results_lifespan: 3600         # or 'custom' + results_lifespan_custom
    results_lifespan_custom: 0
    output_lifespan: 300
    output_lifespan_custom: 0
# output_lifespan becomes the display's default cache max-age, so it
# also caps the max-age of the page the View is embedded in.

# None. Never do this on a public display.
cache:
  type: none
# Default cache max-age is 0 -> bubbles up -> the render cache and
# Dynamic Page Cache both stop storing the page. The Internal Page
# Cache ignores max-age, so anonymous hits still come from it until
# a tag fires - use the kill switch if you truly need it bypassed.`,
      note: "On a news site tag-based caching on node_list is nearly worthless — editors publish constantly. Time-based with a 60-300s results_lifespan often beats it, if the desk accepts the staleness.",
      rightLang: "yaml",
    },
    {
      label: "When the View should not exist",
      intro:
        "A faceted, relevance-ranked search over 2M incidents. In Symfony you would never express that as an ORM query; in Drupal, do not express it as a View over SQL either.",
      php: `<?php
// Symfony: you reach for a search engine without agonising.
use Elastic\\Elasticsearch\\Client;

final class IncidentSearch
{
    public function __construct(private Client $es) {}

    public function search(string $q, array $facets): array
    {
        return $this->es->search([
            'index' => 'incidents',
            'body'  => [
                'query' => ['multi_match' => [
                    'query' => $q,
                    'fields' => ['title^3', 'body'],
                ]],
                'aggs' => ['section' => ['terms' => ['field' => 'section']]],
                'size' => 25,
            ],
        ])->asArray();
    }
}

// The relational database was never going to rank text for you.`,
      ts: `<?php
// Drupal, option A: keep the View, swap the query backend.
// Search API + search_api_solr add a "Index" base table. The Views UI
// is unchanged; the query plugin now talks to Solr, facets are cheap,
// and the COUNT problem disappears.
//   drush en search_api search_api_solr
//   /admin/config/search/search-api  -> index, then a View on the index.

// Drupal, option B: write the query, keep the cacheability honest.
public function build(): array {
  $nids = $this->database->select('node_field_data', 'n')
    ->fields('n', ['nid'])
    ->condition('n.type', 'incident')
    ->condition('n.status', 1)
    ->orderBy('n.created', 'DESC')
    ->range(0, 10)
    // Keep the access check you would have lost to disable_sql_rewrite.
    ->addTag('node_access')
    ->addTag('incident_sidebar')
    ->execute()
    ->fetchCol();

  $build = ['#theme' => 'incident_teaser_list', '#items' => []];
  // One query for all ten, not ten queries.
  foreach ($this->nodeStorage->loadMultiple($nids) as $node) {
    $build['#items'][] = $node->label();
    $this->renderer->addCacheableDependency($build, $node);
  }
  $build['#cache']['tags'][] = 'node_list:incident';
  $build['#cache']['contexts'][] = 'user.node_grants:view';

  return $build;
}`,
      note: "Option B is only better than a View if you remember the cacheability and the access tag — the two things Views was doing for you for free.",
    },
  ],

  playground: {
    intro:
      "A cost model for one Views display: how the pager, row style and relationship settings change the query plan, and what the caching plugin does on top. Predict the query counts before you run it.",
    lang: "php",
    code: `<?php
// What the Views UI checkboxes actually cost, per request.
// Pure arithmetic - no Drupal bootstrap.

function plan(array $d): array {
  $joins = str_repeat(' JOIN ...', $d['relationships']);
  // node_access is a query tag; "Disable SQL rewriting" drops it,
  // and drops your access control with it.
  $access = $d['disable_sql_rewrite'] ? '' : ' JOIN node_access';
  $distinct = $d['distinct'] ? 'DISTINCT ' : '';

  // The mini pager asks for one extra row instead of counting: if row 26
  // comes back there is a next page, and it is popped before rendering.
  $limit = $d['limit'] + ($d['pager'] === 'mini' ? 1 : 0);

  $queries = ["SELECT {$distinct}nid FROM node_field_data{$access}{$joins} LIMIT {$limit}"];

  // Only a full pager needs the grand total, and that is a second query
  // over the same joins with no LIMIT to help it.
  if ($d['pager'] === 'full') {
    $queries[] = "SELECT COUNT(*) FROM node_field_data{$access}{$joins}";
  }

  // Row style. 'fields' reads columns the main query already selected.
  // 'entity:node' loads every entity and renders it through a view mode.
  $renders = 0;
  if ($d['row'] === 'entity:node') {
    $queries[] = 'SELECT ... FROM node_field_data WHERE nid IN (...)';
    $queries[] = 'SELECT ... FROM node__field_body WHERE entity_id IN (...)';
    $queries[] = 'SELECT ... FROM node__field_image WHERE entity_id IN (...)';
    $renders = $d['limit'];
  }

  return ['queries' => $queries, 'renders' => $renders];
}

$as_built = [
  'pager' => 'full', 'row' => 'entity:node', 'relationships' => 2,
  'distinct' => true, 'disable_sql_rewrite' => false, 'limit' => 25,
];

$displays = [
  'as built: full pager, rendered teaser, 2 relationships' => $as_built,
  'mini pager (no COUNT query)' => ['pager' => 'mini'] + $as_built,
  'mini pager + fields row + no relationships' =>
    ['pager' => 'mini', 'row' => 'fields', 'relationships' => 0, 'distinct' => false] + $as_built,
];

foreach ($displays as $name => $d) {
  $p = plan($d);
  echo "== {$name}\\n";
  foreach ($p['queries'] as $sql) {
    echo "   {$sql}\\n";
  }
  printf("   queries: %d   entity renders: %d\\n\\n", count($p['queries']), $p['renders']);
}

// The CACHING setting sits on top of whichever plan you chose. Tag-based
// caching stores the result ROWS in the cache_data bin under a key derived
// from the generated SQL, tagged with the view's own config tag plus the
// list cache tag of every entity type in the query.
$tags = ['config:views.view.incidents', 'node_list'];
$cid = 'incidents:page_1:results:' . substr(hash('sha256', 'SELECT nid FROM ...|page:0'), 0, 12);

echo "results cid : {$cid}\\n";
echo 'cache tags  : ' . implode(', ', $tags) . "\\n\\n";

$cost = count(plan($as_built)['queries']);
$timeline = ['request', 'request', 'save', 'request'];
$warm = false;

foreach ($timeline as $event) {
  if ($event === 'save') {
    $warm = false;
    echo "editor saves ANY node -> node_list invalidated -> results cache cold\\n";
    continue;
  }
  if ($warm) {
    echo "request -> HIT   0 queries, rows come straight from cache_data\\n";
  } else {
    echo "request -> MISS  {$cost} queries, result then written to cache_data\\n";
    $warm = true;
  }
}

echo "\\nOn a news site node_list is never quiet, so fix the plan first.\\n";
`,
    output: `== as built: full pager, rendered teaser, 2 relationships
   SELECT DISTINCT nid FROM node_field_data JOIN node_access JOIN ... JOIN ... LIMIT 25
   SELECT COUNT(*) FROM node_field_data JOIN node_access JOIN ... JOIN ...
   SELECT ... FROM node_field_data WHERE nid IN (...)
   SELECT ... FROM node__field_body WHERE entity_id IN (...)
   SELECT ... FROM node__field_image WHERE entity_id IN (...)
   queries: 5   entity renders: 25

== mini pager (no COUNT query)
   SELECT DISTINCT nid FROM node_field_data JOIN node_access JOIN ... JOIN ... LIMIT 26
   SELECT ... FROM node_field_data WHERE nid IN (...)
   SELECT ... FROM node__field_body WHERE entity_id IN (...)
   SELECT ... FROM node__field_image WHERE entity_id IN (...)
   queries: 4   entity renders: 25

== mini pager + fields row + no relationships
   SELECT nid FROM node_field_data JOIN node_access LIMIT 26
   queries: 1   entity renders: 0

results cid : incidents:page_1:results:c30536f07f3c
cache tags  : config:views.view.incidents, node_list

request -> MISS  5 queries, result then written to cache_data
request -> HIT   0 queries, rows come straight from cache_data
editor saves ANY node -> node_list invalidated -> results cache cold
request -> MISS  5 queries, result then written to cache_data

On a news site node_list is never quiet, so fix the plan first.
`,
  },

  keyPoints: [
    "Turn on views.settings ui.show.sql_query.enabled, ui.show.performance_statistics and ui.show.additional_queries once per site — the live preview then shows the generated SQL, timings, and every extra query the render triggered.",
    "The Caching setting is a plugin: 'tag' (core's default, results in cache_data tagged config:views.view.ID + node_list), 'time' (results_lifespan / output_lifespan, both defaulting to 3600), or 'none' — and 'none' reports a cache max-age of 0, which bubbles up and stops the render cache and Dynamic Page Cache from storing the whole page (the Internal Page Cache ignores max-age, so anonymous responses are still stored until a cache tag fires).",
    "PagerPluginBase::useCountQuery() returns TRUE, so a full pager costs a second COUNT(*) over the same joins; mini, some and none override it to FALSE, and mini detects a next page by fetching items_per_page + 1 rows.",
    "Query settings: distinct forces a dedupe over the full result set, and disable_sql_rewrite strips every query tag including node_access — it makes the query faster by removing your access control.",
    "Row style 'fields' prints columns the query already selected; row style 'entity:node' loads and renders every row through a view mode, which is usually the real cost even when the SQL looks fine.",
    "Very large result sets, heavy aggregation and relevance-ranked or faceted search are not Views-over-SQL problems — index them with Search API/Solr, or write the query in a controller and attach cache tags, contexts and the node_access tag yourself.",
  ],

  interview: [
    {
      q: "A Views-driven listing page is the slowest route on the site. Walk me through your audit.",
      a: "First I make the query visible: `drush config:set views.settings ui.show.sql_query.enabled 1` plus `ui.show.performance_statistics` and `ui.show.additional_queries`, then read the live preview. That splits the problem into query time versus render time immediately. If query time dominates I look at the pager (a full pager adds a `COUNT(*)` over the same joins), the relationships (each is a JOIN, and a to-many one is why someone ticked Distinct), and then `EXPLAIN` the SQL for a missing index. If render time dominates the row style is usually `entity:node` with a view mode, so 25 rows means 25 full entity renders — switching to a fields row, or a leaner view mode, is often a bigger win than any index. Last I check the Caching plugin: `none` is a page-wide disaster because its cache max-age of 0 bubbles up, and `tag` on a news site is nearly worthless because `node_list` fires on every editorial save.",
    },
    {
      q: "What is the difference between a View's results cache and its output cache?",
      a: "They are two different caches with two different keys. The cache plugin's *results* cache stores the `ResultRow` objects in the `cache_data` bin under a cache ID built from the generated SQL, the arguments, the pager position and the display's cache contexts — a hit means the database is never touched. The rendered HTML is cached separately by the normal render cache, using the display's `cache_metadata` (max-age, contexts, tags), which Views recalculates and stores inside the view's config entity when you save it. That is why a results-cache hit can still be slow: you skipped the SQL but you are still running the field formatters and Twig for every row. Fixing a slow View usually means being explicit about which of the two you are actually missing on.",
    },
    {
      q: "A site builder ticked 'Disable SQL rewriting' because it made the View fast. What do you tell them?",
      a: "That it made the View fast by removing security. `disable_sql_rewrite` tells the Views SQL query plugin to skip adding query tags entirely — most importantly the base table's access tag, which for nodes is `node_access`. Without it the query no longer joins the grants table, so the display leaks unpublished or otherwise restricted content to anonymous users, and every `hook_query_alter()` implementation from other modules is silently bypassed too. Core prints that warning right in the form. If the node_access join really is the bottleneck, the fixes are architectural — reduce the number of grant realms, cache the results with a `user.node_grants:view` context, or move the listing to Search API where access is filtered at index time.",
    },
    {
      q: "Coming from Symfony, what surprises people most about tuning Views?",
      a: "That the query is a build artefact of a UI rather than something you wrote, so the debugging loop is inverted. In Symfony a slow listing means re-reading your own QueryBuilder; in Drupal it means reverse-engineering someone's clicks back into SQL, and the settings that cost the most — pager type, row style, relationships, the caching plugin — are scattered across three columns of a form. The compensations are real though: Views already emits correct cache tags and contexts, already applies node access, and swapping the query backend to Solr via Search API leaves the whole display configuration intact. My habit is to set `query_comment` on every heavy display so the query names its own View in the slow query log, which is the cheapest possible bridge between the profiler and the UI.",
    },
  ],

  quiz: [
    {
      question:
        "Which Views pager types avoid the extra COUNT query, according to useCountQuery()?",
      options: [
        "Only 'none' — every pager that paginates must count",
        "'mini', 'some' and 'none' all override useCountQuery() to FALSE; the full pager inherits TRUE",
        "'full' and 'mini' both return FALSE; only 'some' counts",
        "None of them — Views always runs a COUNT query for the row total",
      ],
      answerIndex: 1,
      explain:
        "PagerPluginBase::useCountQuery() returns TRUE, so 'full' inherits it and pays for a second COUNT(*). Mini, Some and None each override it to FALSE — the mini pager instead requests items_per_page + 1 rows and pops the extra one to decide whether a next-page link is needed.",
    },
    {
      question:
        "Setting a public display's Caching plugin to 'None' has what effect beyond the View itself?",
      options: [
        "None — it only stops Views from caching its own result rows",
        "It disables the internal page cache for anonymous users site-wide",
        "The plugin's default cache max-age is 0, which bubbles up through the render tree and stops the render cache and Dynamic Page Cache from storing the page",
        "It forces Views to re-run the query but the rendered output is still render-cached normally",
      ],
      answerIndex: 2,
      explain:
        "The None cache plugin does not override getDefaultCacheMaxAge(), so it reports 0. Cache max-age intersects up the render tree, so a single uncached View drags the whole page's max-age to 0 — the render cache and Dynamic Page Cache both stop storing that response. Note the Internal Page Cache ignores max-age entirely: PageCache::storeResponse() writes the entry as Cache::PERMANENT and expires it via cache tags, so for anonymous traffic you need the page cache kill switch, not max-age 0.",
    },
    {
      question:
        "A View of articles uses tag-based caching. Which cache tags does the results cache carry?",
      options: [
        "node:1, node:2, ... — one tag per row currently in the result",
        "config:views.view.ID plus the list cache tags of the entity types in the query, e.g. node_list",
        "Only config:views.view.ID, because the view is a config entity",
        "views_data plus the bundle-specific node_list:article",
      ],
      answerIndex: 1,
      explain:
        "CachePluginBase::getCacheTags() merges the view config entity's own tags with getListCacheTags() for each entity type found in the query, plus any tags the query plugin adds. For a node listing that means the broad node_list tag — so saving any node of any bundle invalidates it.",
    },
    {
      question:
        "The SQL for a listing is fast in EXPLAIN, but the page still takes 800ms. What is the most likely Views setting to blame?",
      options: [
        "The Query settings 'Distinct' checkbox",
        "A relationship adding an extra JOIN",
        "The row style is 'entity:node' with a view mode, so every row runs the full entity render pipeline",
        "The query is not using the replica connection",
      ],
      answerIndex: 2,
      explain:
        "Distinct and relationships change the SQL, which EXPLAIN already told you is fine. A rendered-entity row style is pure PHP cost after the query: loading the entity, running every field formatter, preprocess and Twig template per row. Switching to a fields row, or a much leaner view mode, is the fix.",
    },
  ],
};

export default lesson;
