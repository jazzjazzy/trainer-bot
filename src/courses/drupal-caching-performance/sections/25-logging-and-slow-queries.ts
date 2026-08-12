import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "logging-and-slow-queries",
  title: "Finding Slow Things in Production",
  part: "Measurement & Operations",
  estMinutes: 13,
  summary:
    "Diagnose a slow production site without a profiler: the MySQL slow query log and EXPLAIN, performance_schema, dblog vs syslog, access logs with response-time fields, APM traces, and reading cache headers to tell 'slow to build' from 'never cached'.",

  concept: `
## You cannot Xdebug production

Everything in the previous section — Xdebug, Blackfire, Webprofiler — assumes
you can slow a request down deliberately. On the incident site at 3am you
cannot. What you have instead is exhaust: logs the database, the web server,
the application and the APM agent were already writing. This section is about
reading that exhaust well enough to name the problem before you touch code.

Almost none of it is Drupal-specific. A Symfony developer already knows the
slow query log, \`EXPLAIN\`, nginx's \`\$request_time\` and New Relic. What changes
in Drupal is *what the traces contain* and *which log you should be writing to*.

## Rule zero: get a repeatable reproduction first

Before you change one setting, get a command that reliably shows the problem —
a \`curl -w '%{time_total}'\` against a specific URL with a specific cookie, run
ten times, with the caches in a known state. Without it you will "fix" a page
that was only slow because it was a cold cache miss, deploy, and be back the
next night. Note the state you reproduced in: caches warm or cold, anonymous or
authenticated, behind the proxy or straight at the origin.

## Slow to build, or never cached?

This is the single most valuable distinction, and Drupal hands it to you in
response headers. On Drupal 10.4+ and 11, **both** cache layers use the same
vocabulary: \`HIT | MISS | UNCACHEABLE (<reason>)\`. Internal Page Cache emits
\`X-Drupal-Cache\`, Dynamic Page Cache emits \`X-Drupal-Dynamic-Cache\`, and the
reason in parentheses names the check that refused:

- \`request policy\` — the layer never looked. For Internal Page Cache this is
  overwhelmingly *a session cookie was sent*, because that cache is anonymous
  traffic only. So the first \`curl\` you run with your own login cookie returns
  \`X-Drupal-Cache: UNCACHEABLE (request policy)\`, not \`MISS\`, and that is
  expected — not the bug you are hunting.
- \`response policy\` — a policy rejected the built response, typically
  \`no-cache\` / \`private\` \`Cache-Control\`, or a form with a session token.
- \`no cacheability\` — the response object carried no cacheability metadata at
  all (it does not implement \`CacheableResponseInterface\`).
- \`poor cacheability\` — Dynamic Page Cache only: the response *has* metadata,
  but a \`max-age: 0\` or a per-user cache context makes storing it pointless.

A page taking 900ms on a \`MISS\` is *slow to build* — annoying, amortised over
thousands of hits. The same 900ms on every request with \`UNCACHEABLE\` is
*never cached* — that is your whole capacity problem, and no amount of query
tuning fixes it. (Before 10.4 only \`X-Drupal-Dynamic-Cache\` carried
\`UNCACHEABLE\`; \`X-Drupal-Cache\` was simply absent when the page cache passed
the request through, which is why older write-ups say it is only HIT or MISS.)

Join that to the access log. nginx's \`\$request_time\` and
\`\$upstream_response_time\`, or Apache's \`%D\`, turn the log into a ranked list of
where time actually goes. Rank by **total time per URL**, not by the worst
single request: a 300ms page hit 50,000 times costs far more than a 4s page hit
twice.

## The database side

Turn on the slow query log with a threshold low enough to catch real offenders
(\`long_query_time = 0.5\`, not the 10s default), aggregate with
\`mysqldumpslow\` or \`pt-query-digest\`, then \`EXPLAIN\` the top query. If you
cannot restart or tail files, \`performance_schema.events_statements_summary_by_digest\`
gives you the same ranking live, already normalised by statement digest.

## dblog is a write, and writes cost

Core's \`dblog\` writes a row to the \`watchdog\` table on every logged event —
inside the request, on the same database the site is trying to serve from. On a
busy site under an error storm that is a genuine write bottleneck and a
self-amplifying one. The production answer is core's \`syslog\` module: log to
the system logger, let the OS ship it, and read it where all your other logs
already live.
`,

  comparisons: [
    {
      label: "Turning on the slow query log",
      intro:
        "Identical infrastructure work in both stacks — the database does not know or care which framework is talking to it. The difference is only how you then get at the query text.",
      php: `# /etc/mysql/conf.d/slow.cnf  (Symfony or Drupal - same file)
[mysqld]
slow_query_log              = 1
slow_query_log_file         = /var/log/mysql/slow.log
# The 10s default catches nothing real. Half a second is a
# reasonable starting threshold for a web request.
long_query_time             = 0.5
log_queries_not_using_indexes = 1
# Guard against the previous line drowning you in tiny lookups.
min_examined_row_limit      = 1000
# MariaDB only: record the query plan alongside the query.
# log_slow_verbosity        = query_plan,explain

# Then aggregate - never read the raw file:
#   mysqldumpslow -s t -t 20 /var/log/mysql/slow.log
#   pt-query-digest /var/log/mysql/slow.log

# In dev, Symfony gives you the same data in-process:
#   config/packages/dev/doctrine.yaml
#     doctrine:
#       dbal:
#         profiling: true
#   -> Doctrine panel in the web profiler, with backtraces.`,
      ts: `# Same my.cnf. What differs is finding the callers.

# 1. Rank the aggregate offenders.
pt-query-digest /var/log/mysql/slow.log | head -60

# 2. Drupal's table names tell you which subsystem it is:
#    node_field_data / node__field_*  -> entity or Views query
#    taxonomy_index                   -> a term-filtered listing
#    watchdog                         -> dblog is the bottleneck
#    cache_*                          -> cache bin still on the database
#    key_value / semaphore            -> lock contention, not data

# 3. Run the offender by hand against the real data.
drush sql:query "EXPLAIN SELECT ..."
drush sql:cli < /tmp/offender.sql

# 4. If it is a View, get the exact SQL Drupal generated:
#    enable the Views SQL preview at /admin/structure/views/settings
#    ("Show the SQL query"), or in a hook:
#      function mymod_views_post_execute(ViewExecutable $view) {
#        \\Drupal::logger('view_query')->debug($view->query->query());
#      }`,
      note: "The my.cnf half is pure ops knowledge and transfers straight from Symfony. The Drupal-specific skill is reading a table name in the digest and knowing which subsystem generated it.",
      leftLang: "yaml",
      rightLang: "bash",
    },
    {
      label: "EXPLAIN the offending query",
      intro:
        "A slow query log gives you the statement; EXPLAIN tells you why it is slow. Drupal's schema is wide and heavily joined, so the failure mode is almost always a filesort or a scan on a field table.",
      php: `-- Symfony/Doctrine: a DQL join that generated a bad plan.
EXPLAIN
SELECT i.id, i.title, i.published_at
FROM incident i
JOIN incident_tag it ON it.incident_id = i.id
WHERE i.status = 1 AND it.tag_id = 7
ORDER BY i.published_at DESC
LIMIT 10;

-- +----+-------+------+---------------+---------+--------+---------------------------------+
-- | id | table | type | key           | rows    | filtered | Extra                         |
-- +----+-------+------+---------------+---------+--------+---------------------------------+
-- |  1 | it    | ref  | tag_id        |   9,142 |   100.00 | Using temporary; Using filesort |
-- |  1 | i     | eq_ref | PRIMARY     |       1 |    10.00 | Using where                     |
-- +----+-------+------+---------------+---------+--------+---------------------------------+

-- The fix is the same in any framework: an index that satisfies
-- both the filter and the sort so the filesort disappears.
CREATE INDEX idx_incident_status_pub ON incident (status, published_at);

-- MySQL 8: EXPLAIN ANALYZE runs it and reports actual rows/time.
-- MariaDB: ANALYZE FORMAT=JSON SELECT ...`,
      ts: `-- Drupal: the same shape, but the SQL was generated by Views.
EXPLAIN
SELECT node_field_data.nid, node_field_data.created
FROM node_field_data
LEFT JOIN taxonomy_index ti ON ti.nid = node_field_data.nid
LEFT JOIN node__field_severity fs
  ON fs.entity_id = node_field_data.nid AND fs.deleted = 0
WHERE node_field_data.status = 1
  AND node_field_data.type = 'incident'
  AND ti.tid = 7
  AND fs.field_severity_value >= 3
ORDER BY node_field_data.created DESC
LIMIT 10 OFFSET 0;

-- Typical Extra column: "Using where; Using temporary; Using filesort"
-- Three things to check, in this order:
--   1. Is the filter field indexed at all? Do not guess - SHOW INDEX.
--      Every dedicated field table gets a primary key led by entity_id
--      plus indexes on bundle and revision_id. The value column is
--      indexed ONLY if the field type declares it in its own schema():
--        entity_reference / file / image -> target_id IS indexed
--        list_integer / list_string / list_float, datetime -> value IS indexed
--        integer / decimal / float / boolean / string / text -> NOT indexed
--      field_severity here is a plain integer field, so its value
--      column has no index. An entity_reference filter would.
--   2. Is the sort column in the same table as the most selective
--      filter? Cross-table ORDER BY forces the temporary table.
--   3. Is OFFSET large? Deep pagers scan everything they skip.

-- Adding the missing index. Dedicated field tables are NOT defined by
-- hook_schema() - the entity storage schema handler builds them
-- (SqlContentEntityStorageSchema::getDedicatedTableSchema), so declare
-- the index on the field storage definition and let the entity update
-- system apply it. It then survives a schema rebuild and is applied to
-- node_revision__field_severity as well:
--   $storage = FieldStorageConfig::loadByName('node', 'field_severity');
--   $storage->setIndexes(['value' => ['value']])->save();
-- For a base or code-defined field, do the same from
-- hook_entity_field_storage_info_alter().
--
-- The raw shortcut below is a stopgap only: it touches ONE table, so
-- repeat it for node_revision__field_severity, and the next field
-- storage schema rebuild silently drops it. The empty [] $spec is legal
-- here only because the column is an integer.
--   \\Drupal::database()->schema()->addIndex(
--     'node__field_severity', 'field_severity_value',
--     ['field_severity_value'], []
--   );`,
      note: "Every dedicated field table gets a primary key led by entity_id plus indexes on bundle and revision_id; the value column is indexed only when the field type declares it — entity_reference, file and image do (target_id), the list_* and datetime types do (value), but integer, decimal, string and text do not. A View that filters on one of those unindexed field values and sorts on node created is the classic 'Using temporary; Using filesort' generator.",
      leftLang: "sql",
      rightLang: "sql",
    },
    {
      label: "Application logs in production",
      intro:
        "Symfony sends logs to a stream and lets the platform collect them. Drupal defaults to writing them into the database it is trying to serve from — which is fine at low volume and a real bottleneck at high volume.",
      php: `# config/packages/prod/monolog.yaml
monolog:
  handlers:
    # Buffer everything, flush the whole buffer only when
    # something at error level actually happens.
    main:
      type: fingers_crossed
      action_level: error
      handler: nested
      excluded_http_codes: [404, 405]
      buffer_size: 50
    nested:
      type: stream
      path: "php://stderr"
      level: debug
      formatter: monolog.formatter.json
    # Or straight to syslog on a traditional host.
    syslog:
      type: syslog
      ident: incident-site
      facility: local0
      level: warning

# Nothing here touches the database. The application never
# pays for logging with a write to its own data store.`,
      ts: `# Drupal ships two core logger implementations. Pick deliberately.

# dblog: writes a row to the {watchdog} table per event, in-request.
#   + browsable at /admin/reports/dblog, no server access needed
#   + drush watchdog:show / watchdog:tail work out of the box
#   - a write to the primary database on every log call
#   - dblog_cron() trims the table on cron: a large DELETE
#   - an error storm becomes a write storm on the busiest table
drush config:set dblog.settings row_limit 1000

# syslog: hands the message to the OS logger and returns.
drush pm:install syslog
drush pm:uninstall dblog        # deliberate: no admin UI for logs any more
drush config:set syslog.settings identity incident-site
drush config:set syslog.settings facility 128   # LOG_LOCAL0

# Reading logs while dblog is still installed:
drush watchdog:show --count=50 --severity=Error
drush watchdog:tail
drush watchdog:delete all

# Pragmatic middle ground on a busy site: keep both installed,
# keep row_limit small (100-1000) so the watchdog table stays
# tiny, and treat syslog as the real record.`,
      note: "Uninstalling dblog removes /admin/reports/dblog and the drush watchdog commands' data source — make sure syslog output is actually reaching somewhere a human looks before you do it.",
      leftLang: "yaml",
      rightLang: "bash",
    },
    {
      label: "Correlating a slow URL with its cache headers",
      intro:
        "The same 900ms means two completely different bugs depending on whether the response was cacheable. Both frameworks expose this, but Drupal's headers are far more specific about why.",
      php: `# Symfony's HttpCache, with debug enabled, adds one header.
#   new HttpCache($kernel, $store, null, ['debug' => true]);
curl -sSI https://example.test/incidents | grep -i 'x-symfony\\|cache-control\\|age'

# X-Symfony-Cache: GET /incidents: stale, invalid, store
# Cache-Control: max-age=0, must-revalidate, private
# Age: 0

# Plus Server-Timing, which you emit yourself from a kernel listener:
#   $response->headers->set('Server-Timing', 'app;dur=912, db;dur=640');

# Timing a URL repeatably - this part is identical everywhere:
for i in $(seq 1 10); do
  curl -o /dev/null -sS -w '%{time_starttransfer}\\n' \\
    https://example.test/incidents
done | sort -n | awk 'NR==5{print "median", \$1}'`,
      ts: `# Drupal names the layer that decided, not just the outcome.
curl -sSI https://example.test/alerts/live | grep -i 'x-drupal\\|cache-control\\|age'

# X-Drupal-Cache: MISS                                    <- Internal Page Cache (anonymous only)
# X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability) <- Dynamic Page Cache refused to store
# Cache-Control: must-revalidate, no-cache, private
# X-Cache: MISS from varnish
#
# On 10.4+/11 both headers use HIT | MISS | UNCACHEABLE (<reason>).
# Reasons: request policy | response policy | no cacheability,
# plus poor cacheability on the dynamic header only.

# Then ask *why* it was uncacheable. In services.yml (or a
# development.services.yml include), temporarily:
#   parameters:
#     http.response.debug_cacheability_headers: true
# -> X-Drupal-Cache-Tags, X-Drupal-Cache-Contexts, X-Drupal-Cache-Max-Age
# A max-age of 0, or a 'session'/'user' context on an anonymous
# page, names the exact culprit.

# Reading the triage:
#   HIT  + fast                        -> nothing to do
#   MISS + slow                        -> slow to build; profile the build, or warm it
#   UNCACHEABLE (poor cacheability)
#     or (response policy) + slow      -> never cached; fix cacheability FIRST,
#                                         because tuning the build only divides
#                                         a cost you are paying on every request
#   X-Drupal-Cache: UNCACHEABLE
#     (request policy)                 -> you sent a session cookie. Internal Page
#                                         Cache is anonymous-only, so this is the
#                                         expected answer, NOT a finding. Judge an
#                                         authenticated page by the *dynamic* header.

# Compare authenticated vs anonymous with the same URL:
curl -sSI --cookie "SSESSabc=..." https://example.test/alerts/live | grep -i x-drupal

# X-Drupal-Cache: UNCACHEABLE (request policy)   <- session open: page cache skipped
# X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)
#
# Always take the anonymous measurement too, or you cannot tell
# "uncacheable for everyone" from "you happened to be logged in".`,
      note: "Turn debug_cacheability_headers off again when you are done — the tag list on a busy page can be kilobytes and will blow past proxy header limits.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    intro:
      "One minute of access log, joined to the cache headers each response carried. Before you run it: which URL should you fix first — the one with the 1180ms outlier, or something else?",
    lang: "php",
    code: `<?php
// One minute of an nginx access log, joined to the cache headers each
// response carried. No Drupal - just the arithmetic you do at 3am.
// Fields: url, \$request_time in ms, X-Drupal-Cache, X-Drupal-Dynamic-Cache

$log = [
  ['/',              12, 'HIT',  'HIT'],
  ['/',              11, 'HIT',  'HIT'],
  ['/',             940, 'MISS', 'MISS'],
  ['/incident/41',   14, 'HIT',  'HIT'],
  ['/incident/41', 1180, 'MISS', 'MISS'],
  ['/alerts/live',  610, 'MISS', 'UNCACHEABLE'],
  ['/alerts/live',  585, 'MISS', 'UNCACHEABLE'],
  ['/alerts/live',  640, 'MISS', 'UNCACHEABLE'],
  ['/alerts/live',  702, 'MISS', 'UNCACHEABLE'],
  ['/search?q=fire', 880, 'MISS', 'UNCACHEABLE'],
];

$stats = [];
foreach ($log as [$url, $ms, $page, $dynamic]) {
  if (!isset($stats[$url])) {
    $stats[$url] = ['reqs' => 0, 'total' => 0, 'slow' => 0, 'uncacheable' => 0];
  }
  $stats[$url]['reqs']++;
  $stats[$url]['total'] += $ms;
  if ($ms >= 500) {
    $stats[$url]['slow']++;
  }
  if ($dynamic === 'UNCACHEABLE') {
    $stats[$url]['uncacheable']++;
  }
}

function verdict(array $s): string {
  if ($s['uncacheable'] === $s['reqs']) {
    return 'NEVER CACHED  - every request pays the full build';
  }
  if ($s['slow'] > 0) {
    return 'SLOW TO BUILD - only the miss is expensive';
  }
  return 'fine          - served from cache';
}

// Rank by total time spent, not by the worst single request.
uasort($stats, fn(array $a, array $b): int => $b['total'] <=> $a['total']);

printf("%-16s %5s %8s %8s  %s\\n", 'URL', 'reqs', 'total', 'avg', 'verdict');
foreach ($stats as $url => $s) {
  printf("%-16s %5d %6dms %6dms  %s\\n",
    $url,
    $s['reqs'],
    $s['total'],
    (int) round($s['total'] / $s['reqs']),
    verdict($s));
}

$grand = array_sum(array_column($stats, 'total'));
$worst = array_key_first($stats);
printf("\\nPHP time in this window: %dms across %d requests\\n", $grand, count($log));
printf("Fix first: %s - %d%% of all time, and it is a caching bug, not a slow query.\\n",
  $worst,
  (int) round(100 * $stats[$worst]['total'] / $grand));
echo "The 1180ms outlier on /incident/41 is one cold miss. It is not the bill.\\n";
`,
    output: `URL               reqs    total      avg  verdict
/alerts/live         4   2537ms    634ms  NEVER CACHED  - every request pays the full build
/incident/41         2   1194ms    597ms  SLOW TO BUILD - only the miss is expensive
/                    3    963ms    321ms  SLOW TO BUILD - only the miss is expensive
/search?q=fire       1    880ms    880ms  NEVER CACHED  - every request pays the full build

PHP time in this window: 5574ms across 10 requests
Fix first: /alerts/live - 46% of all time, and it is a caching bug, not a slow query.
The 1180ms outlier on /incident/41 is one cold miss. It is not the bill.
`,
  },

  keyPoints: [
    "Get a repeatable reproduction before changing anything: a fixed URL, fixed cookie state, known cache state, run ten times — otherwise you cannot tell a fix from a warm cache.",
    "On Drupal 10.4+/11 both X-Drupal-Cache and X-Drupal-Dynamic-Cache report HIT | MISS | UNCACHEABLE (<reason>), where the reason is request policy, response policy, no cacheability, or — Dynamic Page Cache only — poor cacheability. They separate 'slow to build' from 'never cached'; UNCACHEABLE + slow is the higher-priority bug because you pay it on every request. Curl with a session cookie and X-Drupal-Cache: UNCACHEABLE (request policy) is normal, since Internal Page Cache serves anonymous traffic only.",
    "Set long_query_time to something realistic (0.5s, not the 10s default), aggregate the slow log with pt-query-digest or mysqldumpslow, and EXPLAIN the top offender — 'Using temporary; Using filesort' on node_field_data joined to a field table is the classic Views symptom.",
    "performance_schema.events_statements_summary_by_digest ranks live queries by digest without touching a log file, which is the option you have when you cannot restart the database.",
    "Rank access-log URLs by total time (count × mean), not by the worst single request: a 300ms page served 50,000 times costs far more than a 4s page served twice.",
    "dblog writes to the watchdog table inside the request, so an error storm becomes a write storm on the primary database; core's syslog module is the production choice, at the cost of losing /admin/reports/dblog and the drush watchdog commands.",
  ],

  interview: [
    {
      q: "A production Drupal page takes 900ms. Walk me through how you'd find out why, with no profiler available.",
      a: "First I'd make it reproducible: `curl -o /dev/null -w '%{time_starttransfer}'` against that exact URL, ten times, noting whether I'm anonymous or carrying a session cookie and whether the caches are warm. Then I'd read the response headers — `X-Drupal-Cache` and `X-Drupal-Dynamic-Cache` tell me immediately whether 900ms is a one-off cache miss or the price of every single request, and those are completely different bugs. If it's `UNCACHEABLE`, I temporarily enable `http.response.debug_cacheability_headers` in `services.yml` and read `X-Drupal-Cache-Contexts` and `X-Drupal-Cache-Max-Age` to find what poisoned the cacheability, usually a `session` or `user` context or a bubbled `max-age: 0`. If it's genuinely slow to build, I go to the slow query log and `performance_schema.events_statements_summary_by_digest` to see whether the time is in the database at all, and `EXPLAIN` whatever comes out on top. Only if the database looks clean do I start suspecting PHP-level work — an N+1 entity load, an uncached external HTTP call, or a Views render loop.",
    },
    {
      q: "Would you run dblog in production? Defend your answer.",
      a: "Not as the primary log sink on a high-traffic site. `dblog` writes a row into the `watchdog` table synchronously, in-request, on the same database the site is trying to serve pages from — so logging competes with the queries you actually care about, and an error storm turns into a write storm exactly when the database is already struggling. `dblog_cron()` also trims the table with a large DELETE, which is its own periodic spike. The production answer is core's `syslog` module: it hands the message to the OS logger and returns, and your existing log shipping picks it up. The honest trade-off is that uninstalling `dblog` costs you `/admin/reports/dblog` and the `drush watchdog:show`/`watchdog:tail` data source, so a common middle ground is keeping both installed with `dblog.settings.row_limit` set low, treating dblog as a convenience view and syslog as the real record.",
    },
    {
      q: "How much of your Symfony performance-debugging experience transfers to Drupal?",
      a: "The infrastructure layer transfers almost entirely. The MySQL slow query log, `long_query_time`, `EXPLAIN`, `pt-query-digest`, `performance_schema`, nginx's `$request_time` and `$upstream_response_time`, New Relic and Datadog traces — none of that knows or cares which framework generated the request. What changes is interpretation. In Symfony a slow query usually traces back to a DQL statement you can find by grepping a repository class; in Drupal it was probably generated by Views or the entity query system, so I'd read the table names in the digest (`node_field_data`, `taxonomy_index`, `node__field_*`) to work out which subsystem produced it, then use the Views SQL preview or `hook_views_post_execute()` to confirm. The other Drupal-specific skill is the cacheability headers, which have no direct Symfony equivalent — `X-Symfony-Cache` tells you hit or miss, but Drupal tells you which layer refused and, with the debug headers on, exactly which context or max-age caused it.",
    },
    {
      q: "What does a useful Drupal APM trace look like, and what's the usual setup mistake?",
      a: "A good trace shows the Drupal route or controller as the transaction name, then spans for kernel boot, the router, each cache-backend round trip, every PDO statement with its SQL, outbound Guzzle calls, and — if BigPipe is in play — the placeholder replacements. That's enough to say 'this page spent 600ms in 340 SELECTs against node_field_data' without a profiler. The classic mistake is leaving the PHP agent on its default naming, which groups every request under `index.php` because that's the entry script, so every page on the site looks like one enormous transaction and the data is useless. For New Relic the `new_relic_rpm` contrib module fixes this by naming transactions after the matched route; Datadog's `dd-trace-php` has similar Drupal-aware naming. The second mistake is sampling too aggressively on a site whose slow requests are rare — you lose exactly the tail you're trying to find.",
    },
  ],

  quiz: [
    {
      question:
        "A URL returns in 900ms with `X-Drupal-Cache: MISS` and `X-Drupal-Dynamic-Cache: UNCACHEABLE` on every request. What should you fix first?",
      options: [
        "The slowest SQL query in the page's build, since 900ms must be database time",
        "The cacheability of the response — it is never stored, so every visitor pays the full build cost",
        "PHP-FPM's pm.max_children, to serve more of these requests concurrently",
        "The Varnish TTL, so the edge holds the page longer",
      ],
      answerIndex: 1,
      explain:
        "UNCACHEABLE means Dynamic Page Cache refused to store the response, so the 900ms is not an amortised cold-miss cost — it is the per-request cost for everyone. Optimising the build only divides a bill you are still paying on every hit; making the response cacheable removes it. Varnish cannot help either, because Drupal is telling it the response must not be stored.",
    },
    {
      question:
        "Why is core's `dblog` module a questionable default for a high-traffic production site?",
      options: [
        "It only stores the last 100 messages, so you lose history",
        "It writes a row to the watchdog table inside every request, putting log writes on the primary database — and an error storm becomes a write storm",
        "It cannot record messages logged from cron or Drush",
        "It bypasses the logger channel factory, so module logs never reach it",
      ],
      answerIndex: 1,
      explain:
        "dblog's DbLog implementation inserts into {watchdog} synchronously during the request, on the same database serving the site, and dblog_cron() periodically trims the table with a large DELETE. Core's syslog module hands the message to the OS logger instead — the trade-off is losing /admin/reports/dblog and the drush watchdog commands' data source.",
    },
    {
      question:
        "You have a week of nginx access logs with `$request_time`. Which ranking best tells you what to work on?",
      options: [
        "The single slowest request in the week",
        "URLs sorted by their maximum response time",
        "URLs sorted by total time consumed — request count multiplied by mean response time",
        "URLs sorted alphabetically, then filtered to those over 1 second",
      ],
      answerIndex: 2,
      explain:
        "Capacity is consumed by count × cost. A 300ms page served 50,000 times burns far more of your PHP-FPM pool than a 4s page served twice, and the 4s outlier is often a single cold cache miss. Rank by total time, then use the max/p95 as a secondary signal for user-facing pain.",
    },
    {
      question:
        "EXPLAIN on a slow Views query shows `Using where; Using temporary; Using filesort` over `node_field_data` joined to `node__field_severity`. What is the most likely cause?",
      options: [
        "The query is missing a LIMIT clause",
        "field_severity is an integer field, whose value column gets no index, and the sort column lives in a different table from the selective filter",
        "The database is not using the InnoDB storage engine",
        "The View is configured to render entities rather than fields",
      ],
      answerIndex: 1,
      explain:
        "A dedicated field table gets a primary key led by entity_id plus indexes on bundle and revision_id. Beyond that, the value column is indexed only if the field type declares it in its own schema() — entity_reference, file and image index target_id, and the list_* and datetime types index value, but integer, decimal, string and text do not. field_severity is a plain integer field, so field_severity_value is unindexed; filtering on it while sorting on node_field_data.created means the optimiser cannot satisfy both from one index, so it materialises a temporary table and sorts it. The fixes are declaring the index on the field storage definition (FieldStorageConfig::setIndexes(), applied by the entity update system so it covers the revision table and survives a schema rebuild), moving the sort into the same table as the filter, or precomputing the listing.",
    },
  ],
};

export default lesson;
