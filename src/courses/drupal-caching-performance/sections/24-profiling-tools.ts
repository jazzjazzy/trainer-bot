import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "profiling-tools",
  title: "Profiling: Finding the Real Bottleneck",
  part: "Measurement & Operations",
  estMinutes: 13,
  summary:
    "Assemble a profiling kit for Drupal — a call-graph profiler, the WebProfiler toolbar, query and cache counters — and learn to read a profile so you fix the frame that actually costs you the request.",

  concept: `
## No optimisation without a number

Every performance instinct you have is wrong about a quarter of the time, and
you cannot tell which quarter without measuring. The incident site "feels slow"
is not a bug report. "Anonymous /incidents is 812 ms at p50, and 402 ms of that
is self time inside \\Drupal\\Core\\Database\\Connection::query across 902 calls"
is a bug report — it names the frame, the cost and the shape of the fix.

Two numbers matter and they are not the same. **Wall time** is what the user
waits for. **CPU time** is what your PHP workers burn. A page that is 700 ms of
wall and 90 ms of CPU is blocked on I/O — a slow query, a synchronous HTTP call,
a cold cache backend — and adding FPM workers will help. A page that is 700 ms
of wall and 660 ms of CPU is genuinely computing, and more workers just buy you
the same latency at higher load.

## Three tools, three jobs

**Call-graph profilers** — XHProf via the Tideways extension (\`tideways_xhprof\`),
or Blackfire — instrument every function entry and exit and give you the whole
tree. This is the tool for "where did the 812 ms go". The contrib \`xhprof\`
module wires XHProf/Tideways into Drupal, with settings at
\`/admin/config/development/xhprof\` and a run browser (including a two-run diff)
at \`/admin/reports/xhprof\`; Blackfire needs no Drupal module at all, because it
hooks the PHP extension.

**WebProfiler** is the Drupal answer to Symfony's web debug toolbar. It used to
ship as a submodule of Devel and was split out into its own project at Devel
5.0.0-beta1; it now depends on both \`devel\` and \`tracer\`, and its branches track
core (9.x for Drupal 9, 10.x for 10, 11.x for 11). It stores each request as a
profile via Symfony's own \`FileProfilerStorage\`, lists them at
\`/admin/reports/profiler/list\`, and gives you panels for database, cache,
services, events, forms, blocks, views, theme, memory and timing. Two
permissions gate it: \`view webprofiler toolbar\` and \`access webprofiler\`.

**Counters** answer the two questions that decide most Drupal pages: how many
queries did this run, and how many cache gets and sets. WebProfiler's Database
panel counts and times queries (and will run EXPLAIN on one for you); its Cache
panel counts hits and misses per bin, with the CID and tags of each entry.

## Reading the profile

Sort by **self** (exclusive) time, never inclusive. Inclusive time always
crowns whatever sits near the top of the stack — \`renderRoot\` will "cost" 600 ms
on every page you ever profile and tell you nothing.

Then look at the call count next to the self time, because there are only two
diagnoses:

- **A thousand cheap calls.** 902 queries at 0.45 ms each. Nothing is slow; the
  count is the bug. Fix it with \`loadMultiple()\`, a Views relationship, or
  render caching — not with an index.
- **One expensive call.** 60 image derivative builds at 2 ms each. Make the call
  cheaper or stop making it.

In real Drupal sites the first shape wins far more often, which is why an
EXPLAIN-first habit misleads people.

## Profile the CLI separately

Cron, queue workers and migrations run in a different container: different PHP
INI, no OPcache warmup between runs, no page cache, often no Redis timeout you
have tuned. Profile them on their own with \`blackfire run drush cron\` — a web
profile will never show you the queue worker that eats the box at 03:00.

Finally: **take a baseline before every change**, on a warm cache, several
samples. Blackfire's comparison view exists precisely so "it feels faster" never
enters the conversation.
`,

  comparisons: [
    {
      label: "Turning a profiler on",
      intro:
        "Symfony ships the toolbar in the standard dev recipe. Drupal has an equivalent, but you install and permission it yourself.",
      leftLang: "yaml",
      rightLang: "bash",
      php: `# Symfony: composer require --dev symfony/profiler-pack
# The recipe writes these for you; you mostly leave them alone.

# config/packages/web_profiler.yaml
when@dev:
  web_profiler:
    toolbar: true
  framework:
    profiler:
      collect: true

# Keep it out of the way on a heavy page: collect only when asked.
when@dev:
  framework:
    profiler:
      collect: false
      collect_parameter: 'profile'   # then hit /incidents?profile=1

# Toolbar on every dev response; full profile at /_profiler/latest.`,
      ts: `# Drupal: WebProfiler is contrib, and pulls devel + tracer with it.
composer require --dev drupal/webprofiler
drush en webprofiler -y

# Nothing shows up until the permissions are granted.
drush role:perm:add administrator 'view webprofiler toolbar,access webprofiler'

# Skip the admin theme's own noise while chasing a front-end page.
drush config:set webprofiler.settings exclude_paths "/admin/*" -y

# Highlight queries slower than 100ms in the Database panel.
drush config:set webprofiler.settings query_highlight 100 -y

# Toolbar at the foot of the page; stored profiles at
#   /admin/reports/profiler/list
# settings form at
#   /admin/config/development/devel/webprofiler`,
      note:
        "Same idea, opposite defaults: Symfony assumes the profiler is on in dev, Drupal assumes nothing is installed. Never enable WebProfiler on production — it writes a profile file per request.",
    },
    {
      label: "Counting the queries one code path runs",
      intro:
        "Before you optimise a query, find out how many times it runs. Both frameworks can count without a profiler attached.",
      php: `<?php
// Symfony: ask the profiler for the DB collector in a functional test,
// so the query count is asserted in CI rather than eyeballed once.
use Symfony\\Bundle\\FrameworkBundle\\Test\\WebTestCase;

final class IncidentListPerformanceTest extends WebTestCase
{
    public function testListingDoesNotNPlusOne(): void
    {
        $client = static::createClient();
        $client->enableProfiler();
        $client->request('GET', '/incidents');

        $profile = $client->getProfile();
        $db = $profile->getCollector('db');

        // 20 rows must not mean 20+ queries.
        self::assertLessThan(15, $db->getQueryCount());
    }
}`,
      ts: `<?php
// Drupal: core's Database class can log every statement on a connection.
// No contrib needed — run this in \`drush php:script\`, or in a kernel test.
use Drupal\\Core\\Database\\Database;
use Drupal\\views\\Views;

Database::startLog('incident_listing');

$view = Views::getView('incidents');
$view->setDisplay('block_1');
$view->execute();
$view->render();

$log = Database::getLog('incident_listing');
// Each entry: query, args, target, caller, time (seconds), start.
printf("%d queries, %.1f ms\\n", count($log), array_sum(array_column($log, 'time')) * 1000);

// The count alone is rarely enough — group by who asked.
$byCaller = [];
foreach ($log as $entry) {
  $key = ($entry['caller']['class'] ?? '') . '::' . $entry['caller']['function'];
  $byCaller[$key] = ($byCaller[$key] ?? 0) + 1;
}
arsort($byCaller);
print_r(array_slice($byCaller, 0, 5, TRUE));`,
      note:
        "Drupal's log entry carries a normalised backtrace in caller, so you can attribute 400 identical queries to the one field formatter that fires them.",
    },
    {
      label: "Timing a suspect block by hand",
      intro:
        "Sometimes you already know which method to interrogate and a full call graph is overkill. Both frameworks have a lightweight timer.",
      php: `<?php
// Symfony: the Stopwatch component. Named events show up as coloured
// bars in the profiler timeline when the profiler is enabled.
use Symfony\\Component\\Stopwatch\\Stopwatch;

final class IncidentFeedBuilder
{
    public function __construct(private Stopwatch $stopwatch) {}

    public function build(): array
    {
        $this->stopwatch->start('feed.fetch', 'incident');
        $rows = $this->client->fetchLatest();
        $event = $this->stopwatch->stop('feed.fetch');

        // getDuration() ms, getMemory() bytes.
        $this->logger->debug('feed.fetch took {ms}ms', [
            'ms' => $event->getDuration(),
        ]);

        return $rows;
    }
}`,
      ts: `<?php
// Drupal: \\Drupal\\Component\\Utility\\Timer — start/read/stop, values in ms.
// Deliberately primitive: it is a stopwatch, not a collector.
use Drupal\\Component\\Utility\\Timer;

public function build(): array {
  Timer::start('feed.fetch');
  $rows = $this->client->fetchLatest();
  // read() gives the elapsed ms without stopping the timer.
  $this->logger->debug('feed.fetch took @ms ms', ['@ms' => Timer::read('feed.fetch')]);
  Timer::stop('feed.fetch');

  return $rows;
}

// If WebProfiler is installed, prefer its Timing panel: it already
// brackets the kernel phases (bootstrap, routing, controller, render)
// so you can see whether your 200ms is even in the phase you assumed.`,
      note:
        "Timer is global static state keyed by name — fine for a one-off investigation, never something to leave in committed code.",
    },
    {
      label: "Profiling the CLI path",
      intro:
        "Cron and queue workers are where slow sites actually fall over, and no web profiler will ever see them.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: wrap the console command in the Blackfire CLI.
blackfire run php bin/console app:import-incidents --limit=500

# Blackfire CLI 1.x
# Profiling: [########################################] 500/500
# Wall Time     41.2s
# CPU Time      12.8s
# I/O Time      28.4s
# Memory       186MB
# Network       n/a
# https://blackfire.io/profiles/8f3c...  (compare against any other run)

# Wall 41s vs CPU 13s: the job is waiting, not computing.
# 10 samples for a stable baseline before you touch anything:
blackfire run --samples=10 php bin/console app:import-incidents --limit=50`,
      ts: `# Drupal: identical mechanics — the extension hooks PHP, not the framework.
blackfire run drush cron
blackfire run drush queue:run incident_notifier

# Cheap first pass with no profiler at all: how long, and how much?
time drush cron
# real  0m54.221s
# user  0m9.884s
# sys   0m1.402s

# Which queue is the expensive one?
drush queue:list
#  Queue                 Items  Class
#  incident_notifier      8412  Drupal\\Core\\Queue\\DatabaseQueue
#  media_thumbnails         12  Drupal\\Core\\Queue\\DatabaseQueue

# Sanity check the CLI's PHP is the one you think it is —
# a different php.ini means a different profile.
php -i | grep -E 'memory_limit|opcache.enable_cli|extension_dir'`,
      note:
        "Drush runs under the CLI SAPI: OPcache is usually off there, the memory limit differs, and there is no page cache. A web profile tells you nothing about cron.",
    },
  ],

  playground: {
    intro:
      "A miniature call-graph profile, in the shape XHProf, Tideways and Blackfire all produce. Read it the way you would read a real one: sort by self time, then look at the call count beside it.",
    lang: "php",
    code: `<?php
// A miniature call-graph profile, the shape XHProf/Tideways/Blackfire hand you.
// 'ct' = call count, 'wt' = INCLUSIVE wall time in ms (self + everything below).
$profile = [
  'main()'                  => ['ct' => 1,    'wt' => 812.0, 'child' => 790.0],
  'Renderer::renderRoot'    => ['ct' => 1,    'wt' => 604.0, 'child' => 561.0],
  'Renderer::doRender'      => ['ct' => 1180, 'wt' => 561.0, 'child' => 498.0],
  'EntityStorageBase::load' => ['ct' => 431,  'wt' => 388.0, 'child' => 372.0],
  'Connection::query'       => ['ct' => 902,  'wt' => 402.0, 'child' => 0.0],
  'DatabaseBackend::get'    => ['ct' => 606,  'wt' => 96.0,  'child' => 71.0],
  'twig_template_render'    => ['ct' => 1180, 'wt' => 143.0, 'child' => 0.0],
  'ImageStyle::buildUrl'    => ['ct' => 60,   'wt' => 121.0, 'child' => 0.0],
];

$rows = [];
foreach ($profile as $fn => $m) {
  $self = $m['wt'] - $m['child'];
  $rows[] = [
    'fn'      => $fn,
    'ct'      => $m['ct'],
    'wt'      => $m['wt'],
    'self'    => $self,
    'perCall' => $self / $m['ct'],
  ];
}

// Inclusive time flatters whatever sits near the top of the stack. Sort by
// SELF (exclusive) time or you will "optimise" renderRoot forever.
usort($rows, fn(array $a, array $b) => $b['self'] <=> $a['self']);

printf("%-24s %6s %9s %9s %9s\\n", 'function', 'calls', 'incl ms', 'self ms', 'ms/call');
echo str_repeat('-', 61), "\\n";
foreach ($rows as $r) {
  printf("%-24s %6d %9.1f %9.1f %9.3f\\n", $r['fn'], $r['ct'], $r['wt'], $r['self'], $r['perCall']);
}

$total = 812.0;
printf("\\nTotal wall time: %.1f ms\\n", $total);
printf("Top self time:   %s = %.1f ms (%.1f%% of the request)\\n",
  $rows[0]['fn'], $rows[0]['self'], 100 * $rows[0]['self'] / $total);

// Every hot frame is one of two shapes, and they need opposite fixes.
echo "\\nDiagnosis for frames over 60 ms of self time:\\n";
foreach ($rows as $r) {
  if ($r['self'] < 60.0 || $r['fn'] === 'main()') {
    continue;
  }
  $cheapCalls = $r['perCall'] < 1.0;
  printf("  %-24s %-26s -> %s\\n",
    $r['fn'],
    $cheapCalls ? 'a thousand cheap calls' : 'a genuinely expensive call',
    $cheapCalls ? 'cut the call COUNT' : 'make the CALL cheaper');
}

// The Drupal-specific question a generic profiler will not ask for you.
$gets = $profile['DatabaseBackend::get']['ct'];
$renders = $profile['Renderer::doRender']['ct'];
printf("\\n%d cache gets for %d render passes = %.2f lookups per element.\\n",
  $gets, $renders, $gets / $renders);
echo "Every miss on a hot element is a subtree you are rendering twice.\\n";
`,
    output: `function                  calls   incl ms   self ms   ms/call
-------------------------------------------------------------
Connection::query           902     402.0     402.0     0.446
twig_template_render       1180     143.0     143.0     0.121
ImageStyle::buildUrl         60     121.0     121.0     2.017
Renderer::doRender         1180     561.0      63.0     0.053
Renderer::renderRoot          1     604.0      43.0    43.000
DatabaseBackend::get        606      96.0      25.0     0.041
main()                        1     812.0      22.0    22.000
EntityStorageBase::load     431     388.0      16.0     0.037

Total wall time: 812.0 ms
Top self time:   Connection::query = 402.0 ms (49.5% of the request)

Diagnosis for frames over 60 ms of self time:
  Connection::query        a thousand cheap calls     -> cut the call COUNT
  twig_template_render     a thousand cheap calls     -> cut the call COUNT
  ImageStyle::buildUrl     a genuinely expensive call -> make the CALL cheaper
  Renderer::doRender       a thousand cheap calls     -> cut the call COUNT

606 cache gets for 1180 render passes = 0.51 lookups per element.
Every miss on a hot element is a subtree you are rendering twice.
`,
  },

  keyPoints: [
    "Sort a profile by self (exclusive) time, not inclusive time — inclusive time always crowns renderRoot and teaches you nothing.",
    "Read the call count beside the self time: a thousand cheap calls needs the count cut (loadMultiple, render cache), one expensive call needs the call made cheaper. In Drupal the first is far more common.",
    "Wall time minus CPU time is I/O wait; the split decides whether more FPM workers will help or just move the queue.",
    "WebProfiler is Drupal's toolbar — split out of Devel at 5.0.0-beta1, depends on devel and tracer, branches track core (10.x for Drupal 10, 11.x for 11), with Database and Cache panels and stored profiles at /admin/reports/profiler/list.",
    "Core's Database::startLog()/getLog() counts and attributes queries with no contrib module, and works inside drush php:script and kernel tests.",
    "Profile CLI work separately (blackfire run drush cron) — different SAPI, different php.ini, no OPcache, no page cache — and always take a warm-cache baseline with several samples before you change anything.",
  ],

  interview: [
    {
      q: "You are handed a Drupal page that takes 900 ms. Walk me through how you find out why.",
      a: "First I reproduce it with a **baseline**: several warm-cache runs against the same URL, as the same role, so I know whether 900 ms is p50 or an outlier, and whether it is anonymous or authenticated. Then I split wall time from CPU time — if wall is 900 ms and CPU is 120 ms, I am waiting on I/O and I go looking at queries and outbound HTTP, not at PHP. Next I take a call-graph profile with Blackfire or XHProf/Tideways and sort by **self time**, because inclusive time will just tell me \`renderRoot\` is expensive, which is true on every page ever built. Alongside that I install WebProfiler in the dev environment for the counts a call graph does not frame well: queries per page in the Database panel and cache hits/misses per bin in the Cache panel. Only once I have a named frame with a cost and a call count do I write a fix — and then I re-profile and compare, because 'it feels faster' is not a result.",
    },
    {
      q: "Symfony has the web debug toolbar built in. What is the Drupal equivalent, and what is different about it?",
      a: "It is the **WebProfiler** contrib module, which is a genuine port of the idea — it uses Symfony's own \`Profiler\` and \`FileProfilerStorage\`, and gives you data collectors for database, cache, events, services, routing, forms, blocks, Views, theme, memory and timing. The differences are mostly about assembly: in Symfony you \`composer require --dev symfony/profiler-pack\` and it is on in dev by default, whereas in Drupal you install WebProfiler (it pulls in Devel and Tracer), enable it, and grant \`view webprofiler toolbar\` and \`access webprofiler\` before anything appears. It also used to live inside Devel and was split into its own project at Devel 5.0.0-beta1, so older tutorials tell you to enable \`devel_webprofiler\` and that no longer exists. Version-matching matters too: because it wraps Symfony internals, you need the branch that matches your core version — 10.x for Drupal 10, 11.x for Drupal 11.",
    },
    {
      q: "A profile shows 400 ms of self time in the database layer across 900 queries. What do you do — and what would you do differently if it were 400 ms across 3 queries?",
      a: "900 queries at 0.45 ms each means nothing is slow; the **call count** is the defect. In Drupal that is nearly always an N+1: entities loaded one at a time in a loop, a field formatter loading a referenced node per row, or a Views field rewrite hitting storage. The fixes are \`loadMultiple()\`, a Views relationship so the join happens once, or render caching the repeated element so the loads stop happening at all. Three queries at 130 ms each is the opposite problem: those are genuinely expensive statements, so I run EXPLAIN, look at indexes and the Views query settings, and consider whether the query should be materialised instead. Reaching for EXPLAIN on the 900-query case would waste an afternoon indexing a query that is already fast.",
    },
    {
      q: "Why profile Drush and cron separately from web requests?",
      a: "They run under the **CLI SAPI**, which usually means a different \`php.ini\`: OPcache is often disabled for CLI, the memory limit differs, and there is no request-scoped page cache or reverse proxy in front. Cron also does work no web request ever does — queue draining, search indexing, migrations — and it does it in bulk, so an N+1 that costs 5 ms on a page costs ten minutes in a queue worker. Practically, I wrap the command: \`blackfire run drush cron\`, or start with plain \`time drush cron\` plus \`drush queue:list\` to see which queue is growing. A site whose pages are 200 ms can still fall over at 03:00 because cron pins every worker, and nothing in a web profile would have shown it.",
    },
  ],

  quiz: [
    {
      question:
        "A profile of the incidents page shows Renderer::renderRoot with 604 ms of inclusive time and 43 ms of self time. What does that tell you?",
      options: [
        "renderRoot is the bottleneck and should be optimised or replaced.",
        "Almost nothing — renderRoot is near the top of the stack, so its inclusive time is just the cost of everything below it; the 43 ms of self time is what it actually spends.",
        "The render cache is disabled, because renderRoot would otherwise not be called.",
        "There are 604 render array elements on the page.",
      ],
      answerIndex: 1,
      explain:
        "Inclusive time counts the whole subtree beneath a frame, so anything near the root of the call graph looks enormous on every profile. Self (exclusive) time — 43 ms here — is what that function personally burned, and it is what you sort by.",
    },
    {
      question:
        "Which of these gives you a per-page count of database queries and of cache hits and misses per bin, inside Drupal, without a PHP extension?",
      options: [
        "The Devel module's query log setting",
        "Enabling $settings['cache']['bins']['render'] = 'cache.backend.null'",
        "The WebProfiler module's Database and Cache panels",
        "The XHProf contrib module's run browser",
      ],
      answerIndex: 2,
      explain:
        "WebProfiler's data collectors include a DatabaseDataCollector and a CacheDataCollector that record hits and misses per bin along with each CID and its tags. XHProf needs the Tideways/XHProf PHP extension, and the query log now lives in WebProfiler rather than in Devel itself — its query_sort, query_highlight and query_detailed_output_threshold settings are WebProfiler config keys.",
    },
    {
      question:
        "A page takes 700 ms of wall time and 90 ms of CPU time. What is the most reasonable first conclusion?",
      options: [
        "PHP is compute-bound; increase the OPcache memory limit.",
        "The page is blocked on I/O — queries, cache backend round-trips, or outbound HTTP — for roughly 610 ms.",
        "The profiler is misconfigured, because CPU time cannot be lower than wall time.",
        "The theme layer is rendering too many Twig templates.",
      ],
      answerIndex: 1,
      explain:
        "Wall time is the elapsed clock; CPU time is the portion actually executing. A large gap is time spent waiting, which points at the database, the cache backend or a synchronous external call — and it means adding FPM workers may genuinely help, which is not true for a CPU-bound page.",
    },
    {
      question:
        "You want to know exactly how many queries a Views block runs, from a Drush script, with no contrib modules installed. What do you reach for?",
      options: [
        "Database::startLog() and Database::getLog() from Drupal core",
        "The Symfony Stopwatch component",
        "drush sql:query with EXPLAIN ANALYZE",
        "Setting http.response.debug_cacheability_headers to true",
      ],
      answerIndex: 0,
      explain:
        "Core's \\Drupal\\Core\\Database\\Database class can log every statement on a connection: startLog('key'), run the code path, then getLog('key') returns entries with query, args, target, caller and time. Because each entry carries a normalised backtrace in caller, you can attribute the queries to the code that fired them.",
    },
  ],
};

export default lesson;
