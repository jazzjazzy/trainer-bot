import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "load-testing",
  title: "Load Testing & Capacity Planning",
  part: "Measurement & Operations",
  estMinutes: 13,
  summary:
    "Design a load test that models the real anonymous/authenticated mix instead of hammering one cached URL, then turn throughput, p95 and error rate into a defensible capacity number.",

  concept: `
## Most load tests measure the wrong system

Point \`ab -n 10000 -c 100\` at the front page of a well-configured Drupal site
and you will get a beautiful number — because Varnish answered every request
and PHP-FPM sat idle for the whole run. You measured your reverse proxy. On the
incident site that result is worse than useless: it is the number you will quote
in a capacity meeting right before a story goes wide and the cache-miss path
melts.

A load test is a **hypothesis about traffic**, and the hypothesis lives in the
mix, not the request count:

- **Anonymous readers** — most of the volume, mostly edge HITs, cheap.
- **Anonymous cache misses** — new URLs, long-tail articles, query strings,
  anything freshly purged after an edit. These are the requests that boot PHP.
- **Authenticated users** — editors and subscribers. Internal Page Cache is
  skipped entirely; at best Dynamic Page Cache plus BigPipe helps. Every one of
  these is a full render and a database connection.
- **Search and faceted listings** — uncacheable by construction, and usually the
  most expensive query on the site.

Get the *proportions* from your access logs or analytics, not from intuition.
A 95/5 anonymous/authenticated split behaves nothing like 80/20, even at
identical request rates, because the two populations use different amounts of
the only scarce resource: PHP workers and database connections.

## Warm and cold are two different experiments

A run started immediately after \`drush cr\` measures the cold path: empty render
cache, cold opcache, cold MySQL buffer pool, cold Varnish. A run after a warming
crawl measures steady state. Both are legitimate; conflating them is not. The
cold run answers "can we survive a deploy or a full purge at peak?", which is
the scenario that actually takes sites down. The warm run answers "what is our
normal ceiling?". Report which one you ran.

## Read percentiles, not means

The mean hides the failure. Under saturation a small share of requests queues
behind everything else, so the mean drifts while p95 and p99 go vertical. Track
throughput, p95/p99 latency and **error rate together** — throughput that stays
flat while errors climb is not capacity, it is a queue overflowing into 502s.

\`\`\`
    http_req_duration..: avg=140.36ms med=140.96ms p(90)=146.88ms p(95)=148.21ms
    http_req_failed....: 0.00%  0 out of 45
    http_reqs..........: 45     6.56109/s
\`\`\`

## The capacity identity

Little's Law is the whole of capacity planning:

> concurrency = throughput x service time

So a pool of N PHP-FPM workers with an average request time of T seconds retires
roughly **N / T** requests per second. Forty workers at 180 ms is ~222 req/s of
*PHP* traffic — which, behind a 95%-effective edge, corresponds to a much larger
public request rate.

The catch: the binding constraint is usually not PHP. Each busy worker holds a
database connection, so four servers x 40 children is 160 connections against a
default MySQL \`max_connections\` of 151. You sized a pool your database cannot
serve, and the failure mode is "too many connections" errors, not slow pages.
Size the pool to the database, memory and average service time — then prove it
with k6.
`,

  comparisons: [
    {
      label: "The 30-second smoke check",
      intro:
        "Before writing any scenario, find out which layer is answering. Both stacks expose a trace header; a single curl tells you whether your load generator will ever reach PHP.",
      php: `# Symfony: is the built-in HttpCache (or Varnish) answering?
# framework.http_cache trace_level 'short'/'full' adds X-Symfony-Cache.
curl -sSI https://symfony.example.com/articles \\
  | grep -Ei 'cache|age|x-symfony'
# age: 41
# cache-control: max-age=600, public
# x-symfony-cache: GET /articles: fresh

# Quick throughput probe. ApacheBench is fine for a smoke test and
# useless for capacity: one URL, no think time, no login, no mix.
ab -n 500 -c 20 https://symfony.example.com/articles

# siege gives you a URL list, which is one step less unrealistic.
siege -c 20 -t 30S -f urls.txt --no-follow`,
      ts: `# Drupal: two separate cache layers, two separate headers.
curl -sSI https://incidents.example.com/ \\
  | grep -Ei 'x-drupal|cache-control|age'
# cache-control: max-age=300, public
# age: 122
# x-drupal-cache: HIT              <- internal page cache (anonymous)
# x-drupal-dynamic-cache: MISS     <- only present when page cache misses

# Force the cache-miss path so the probe actually reaches PHP:
curl -sSI 'https://incidents.example.com/?cachebust='"$RANDOM" \\
  | grep -i x-drupal-cache
# x-drupal-cache: MISS

# And the authenticated path, which never uses the page cache at all:
curl -sSI -b cookies.txt https://incidents.example.com/ \\
  | grep -Ei 'x-drupal|cache-control'
# cache-control: must-revalidate, no-cache, private
# x-drupal-cache: UNCACHEABLE (request policy)      <- session cookie present
# x-drupal-dynamic-cache: UNCACHEABLE (poor cacheability)

ab -n 500 -c 20 https://incidents.example.com/   # measures Varnish. Not Drupal.`,
      note: "X-Drupal-Cache comes from the internal page cache module (anonymous only); X-Drupal-Dynamic-Cache reports HIT/MISS/UNCACHEABLE from dynamic page cache. Drupal 10.4 / 11.1 (change record 2958442) added the parenthesised reason - before that X-Drupal-Dynamic-Cache emitted a bare UNCACHEABLE and X-Drupal-Cache only ever said HIT or MISS (it was absent altogether when the page cache passed the request straight through), so match on the prefix, not the whole value. If your test only ever sees HIT, you are load-testing your proxy.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Modelling the mix in k6",
      intro:
        "Same tool, same methodology, both stacks. The interesting difference is the login handshake and the fact that Drupal's anonymous scenario must deliberately include cache misses.",
      php: `// symfony-load.js — two scenarios running concurrently.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    anonymous: {
      executor: 'ramping-vus', exec: 'browse', startVUs: 0,
      stages: [{ duration: '1m', target: 120 }, { duration: '5m', target: 120 }],
    },
    authenticated: {
      executor: 'constant-vus', exec: 'member', vus: 10, duration: '6m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scenario:anonymous}': ['p(95)<500'],
    'http_req_duration{scenario:authenticated}': ['p(95)<1200'],
  },
};

const BASE = 'https://symfony.example.com';

export function browse() {
  http.get(BASE + '/articles');
  sleep(3);
}

export function member() {
  // Symfony's form_login: post to the check path, session cookie
  // (PHPSESSID) is kept in the per-VU cookie jar automatically.
  const res = http.post(BASE + '/login', {
    _username: 'reporter@example.com',
    _password: 'correct-horse',
  });
  check(res, { 'logged in': (r) => r.status === 200 });
  http.get(BASE + '/dashboard');
  sleep(5);
}`,
      ts: `// drupal-load.js — the mix your logs actually show.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// Long-tail URLs, so the anonymous scenario produces real cache misses.
const urls = new SharedArray('articles', () =>
  JSON.parse(open('./article-paths.json')));

export const options = {
  scenarios: {
    anon_hits:   { executor: 'constant-arrival-rate', exec: 'frontPage',
                   rate: 400, timeUnit: '1s', duration: '6m',
                   preAllocatedVUs: 200 },
    anon_misses: { executor: 'constant-arrival-rate', exec: 'longTail',
                   rate: 25, timeUnit: '1s', duration: '6m',
                   preAllocatedVUs: 100 },
    editors:     { executor: 'constant-vus', exec: 'editor',
                   vus: 8, duration: '6m' },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true }],
    'http_req_duration{scenario:anon_hits}': ['p(95)<150'],
    'http_req_duration{scenario:anon_misses}': ['p(95)<900', 'p(99)<2000'],
    'http_req_duration{scenario:editors}': ['p(95)<1500'],
  },
};

const BASE = 'https://incidents.example.com';

export function frontPage() { http.get(BASE + '/'); sleep(2); }

export function longTail() {
  http.get(BASE + urls[Math.floor(Math.random() * urls.length)]);
  sleep(4);
}

export function editor() {
  // Anonymous forms carry no form_token (tokens are session-bound, and
  // anonymous forms are cached), so form_id + name + pass is enough for
  // user_login_form. Fetch the page anyway if you want to model real
  // browser cost, or to handle authenticated forms elsewhere in the
  // scenario - those DO get a token.
  const page = http.get(BASE + '/user/login');
  const body = {
    name: 'loadtest_editor',
    pass: 'correct-horse',
    form_id: 'user_login_form',
    form_build_id: page.html().find('input[name=form_build_id]').attr('value'),
    op: 'Log in',
  };
  const res = http.post(BASE + '/user/login', body);
  // 200 is NOT proof of login - a re-rendered login form is also a 200.
  // Assert on a marker only an authenticated response carries.
  check(res, { 'session established': (r) => r.body.includes('user-logged-in') });

  // Authenticated traffic: page cache is skipped entirely.
  http.get(BASE + '/admin/content');
  http.get(BASE + '/search/node?keys=flooding');
  sleep(6);
}`,
      note: "Tagging thresholds by scenario is what makes the run readable: a single global p(95) blends 150 ms edge hits with 900 ms misses and tells you nothing.",
      leftLang: "js",
      rightLang: "js",
    },
    {
      label: "Cold run vs warm run",
      intro:
        "Two runs, two questions. Script the state you are starting from, or you will never reproduce a result.",
      php: `# --- Symfony: cold ---------------------------------------------------
php bin/console cache:pool:clear cache.app
php bin/console cache:clear --env=prod      # also rebuilds the container
k6 run --tag run=cold symfony-load.js

# --- Symfony: warm ---------------------------------------------------
php bin/console cache:warmup --env=prod
wget --spider -r -l2 -nd --delete-after https://symfony.example.com/ 2>/dev/null
k6 run --tag run=warm symfony-load.js

# Profile one slow request rather than guessing:
blackfire curl https://symfony.example.com/articles`,
      ts: `# --- Drupal: cold ----------------------------------------------------
drush cache:rebuild                     # cr: everything, including the container
# ...or clear only the HTTP-facing bins and keep the container warm:
drush cache:clear bin page,dynamic_page_cache,render
varnishadm 'ban req.url ~ .'            # empty the edge too, or it lies to you
k6 run --tag run=cold drupal-load.js

# --- Drupal: warm ----------------------------------------------------
drush cr
curl -s https://incidents.example.com/sitemap.xml \\
  | grep -oP '(?<=<loc>)[^<]+' | head -500 \\
  | xargs -P 8 -n 1 curl -s -o /dev/null   # warm render + page caches
k6 run --tag run=warm drupal-load.js

# Watch the tier you suspect, while the run is happening:
watch -n1 'curl -s http://127.0.0.1/fpm-status | grep -E "active|listen queue"'
mysqladmin extended-status | grep -E 'Threads_connected|Threads_running'`,
      note: "A cold run is not a pessimistic warm run — it is a different system, with an empty buffer pool and a thundering herd on the same uncached render. Report which you measured.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Sizing the pool to the real bottleneck",
      intro:
        "The capacity number falls out of workers divided by service time — but the database, not PHP, usually sets the ceiling.",
      php: `; /etc/php/8.3/fpm/pool.d/www.conf  (Symfony app server)
[www]
pm = static
pm.max_children = 40          ; 40 x ~200 MB RSS = ~8 GB. Check with fpm-status.
pm.max_requests = 500
request_terminate_timeout = 30s
; capacity ~= 40 / 0.180s ~= 222 req/s per server

; Doctrine: one connection per PHP worker while a request runs.
; 4 servers x 40 children = 160 connections needed.
; MySQL default max_connections = 151  ->  you are already over.

; Options: raise max_connections (RAM per connection!), put
; ProxySQL/pgbouncer in front, or lower pm.max_children and add servers.`,
      ts: `<?php
// sites/default/settings.php — the same arithmetic, plus Drupal's extras.
$databases['default']['default'] = [
  'driver' => 'mysql',
  'host' => 'db-primary.internal',
  // Every executing PHP-FPM worker holds one connection here.
  // 4 servers x pm.max_children 40 = 160 > max_connections 151.
];

// Read-heavy incident traffic can go to a replica, halving primary load:
$databases['default']['replica'][] = [
  'driver' => 'mysql',
  'host' => 'db-replica.internal',
];

// Keep cache bins out of the database entirely so a load test does not
// spend its connection budget on cache_render writes.
$settings['cache']['default'] = 'cache.backend.redis';
$settings['cache']['bins']['bootstrap'] = 'cache.backend.chainedfast';

// Capacity, honestly stated:
//   PHP-only ceiling      = 160 workers / 0.180 s  ~= 888 req/s
//   DB-connection ceiling = 140 usable conns / 0.180 s ~= 777 req/s
//   Public ceiling at a 95% edge hit ratio is far higher again -
//   but only for the anonymous share of the mix.`,
      note: "Drupal adds cache and lock traffic to the same connection budget, which is why moving cache bins to Redis often raises throughput more than adding PHP workers.",
      leftLang: "bash",
      rightLang: "php",
    },
  ],

  playground: {
    intro:
      "Capacity planning on paper, before k6 confirms it on the cluster. Change the mix or the edge hit ratio and watch which ceiling binds first — and note what happens to p95 when the cold-cache service time is 900 ms instead of 180 ms.",
    lang: "php",
    code: `<?php
// Capacity planning on paper, before k6 confirms it on the real cluster.
// Little's Law: concurrency = throughput x service time. Everything below
// is that one identity, rearranged.

// --- 1. The mix matters more than the request count ------------------------
$offeredRps   = 900.0;  // peak req/s we must survive
$anonShare    = 0.92;   // 92% of the peak is anonymous readers
$edgeHitRatio = 0.95;   // Varnish answers 95% of anonymous requests itself

$anonRps = $offeredRps * $anonShare;
$authRps = $offeredRps - $anonRps;
$phpRps  = $anonRps * (1 - $edgeHitRatio) + $authRps;

printf("offered load        %7.1f req/s\\n", $offeredRps);
printf("  anonymous         %7.1f req/s  (%d%% absorbed by the edge)\\n", $anonRps, (int) round($edgeHitRatio * 100));
printf("  authenticated     %7.1f req/s  (never cacheable at the edge)\\n", $authRps);
printf("reaching PHP-FPM    %7.1f req/s\\n\\n", $phpRps);

// --- 2. Two ceilings: worker slots and database connections ----------------
$appServers      = 4;
$workersPerServe = 40;    // pm.max_children
$dbMaxConns      = 151;   // MySQL max_connections
$dbReserved      = 11;    // cron, drush, replication, your own mysql shell

$workerSlots = $appServers * $workersPerServe;
$dbSlots     = $dbMaxConns - $dbReserved;
$concurrency = min($workerSlots, $dbSlots);

printf("worker slots        %4d  (%d servers x %d children)\\n", $workerSlots, $appServers, $workersPerServe);
printf("db connection slots %4d  (%d max_connections - %d reserved)\\n", $dbSlots, $dbMaxConns, $dbReserved);
printf("usable concurrency  %4d  <- %s is the real ceiling\\n\\n", $concurrency, $workerSlots <= $dbSlots ? 'PHP' : 'the database');

// --- 3. Warm run vs cold run: same test, different system ------------------
function report(string $label, float $service, int $concurrency, float $demandRps): void {
  $capacity = $concurrency / $service;              // req/s the tier can retire
  $rho      = $demandRps / $capacity;               // utilisation
  echo $label . "\\n";
  printf("  avg service time  %6.0f ms\\n", $service * 1000);
  printf("  capacity          %7.1f req/s\\n", $capacity);
  printf("  utilisation       %7.1f %%\\n", $rho * 100);
  if ($rho >= 1.0) {
    printf("  -> SATURATED: queue grows without bound, 502s once the backlog exceeds the listen queue\\n\\n");
    return;
  }
  // M/M/1-flavoured queueing: wait explodes as utilisation approaches 1.
  $wait = $service * ($rho / (1 - $rho));
  printf("  est. mean latency %6.0f ms  (%.0f ms service + %.0f ms queueing)\\n",
    ($service + $wait) * 1000, $service * 1000, $wait * 1000);
  // Sojourn time in M/M/1 is exponential, so p95 = mean x ln(20) ~= 3x the mean.
  // This is the number your SLO is written against - never quote the mean.
  $p95 = ($service + $wait) * log(20);
  printf("  est. p95 latency  %6.0f ms  (M/M/1 tail ~ 3x the mean)\\n\\n", $p95 * 1000);
}

report('WARM caches (render cache populated, opcache hot)', 0.180, $concurrency, $phpRps);
report('COLD caches (drush cr, then hit go on the load generator)', 0.900, $concurrency, $phpRps);

// --- 4. The scenario people actually run by mistake -------------------------
$naive = $offeredRps; // "900 req/s of anonymous front page" - all edge HITs
printf("A test that only hammers the cached front page reports %d req/s\\n", (int) $naive);
printf("and never executes a single line of PHP. It measures Varnish.\\n");
`,
    output: `offered load          900.0 req/s
  anonymous           828.0 req/s  (95% absorbed by the edge)
  authenticated        72.0 req/s  (never cacheable at the edge)
reaching PHP-FPM      113.4 req/s

worker slots         160  (4 servers x 40 children)
db connection slots  140  (151 max_connections - 11 reserved)
usable concurrency   140  <- the database is the real ceiling

WARM caches (render cache populated, opcache hot)
  avg service time     180 ms
  capacity            777.8 req/s
  utilisation          14.6 %
  est. mean latency    211 ms  (180 ms service + 31 ms queueing)
  est. p95 latency     631 ms  (M/M/1 tail ~ 3x the mean)

COLD caches (drush cr, then hit go on the load generator)
  avg service time     900 ms
  capacity            155.6 req/s
  utilisation          72.9 %
  est. mean latency   3321 ms  (900 ms service + 2421 ms queueing)
  est. p95 latency    9949 ms  (M/M/1 tail ~ 3x the mean)

A test that only hammers the cached front page reports 900 req/s
and never executes a single line of PHP. It measures Varnish.
`,
  },

  keyPoints: [
    "The anonymous/authenticated mix determines the result far more than the request count: anonymous hits may never touch PHP, while every authenticated request skips the internal page cache and consumes a worker and a database connection.",
    "Deliberately include the cache-miss path (long-tail URLs, freshly purged content), the login flow and the search page — those are the requests that actually cost money.",
    "A cold-cache run (after drush cr and an edge ban) and a warm run measure two different systems; both are valid, but you must say which one you ran.",
    "Read throughput together with p95/p99 and error rate. Flat throughput plus climbing errors is saturation, not capacity; the mean will hide it.",
    "Capacity follows Little's Law: pm.max_children / average request time ~= requests per second of PHP work — then multiply the anonymous share up by the edge hit ratio to get a public number.",
    "The binding constraint is usually database connections, not PHP: servers x pm.max_children can easily exceed MySQL's max_connections, so size the pool to the database and move cache bins to Redis to free connections.",
  ],

  interview: [
    {
      q: "How would you design a load test for a Drupal news site expecting a traffic spike?",
      a: "I would start from the access logs, not from a target number: what share of requests are anonymous, what share are authenticated, and what the edge hit ratio currently is. Then I would build a k6 test with separate scenarios — a high-rate anonymous scenario against cached URLs, a lower-rate scenario against long-tail article paths so it genuinely misses the page cache and reaches PHP, an authenticated scenario that logs in through `/user/login` and then proves the session took by checking for an authenticated-only marker in the response, and a search scenario because search is uncacheable and usually the most expensive query. Each scenario gets its own tagged threshold, e.g. `http_req_duration{scenario:anon_misses}: p(95)<900`, because blending them into one percentile hides everything. I would run it twice — warm, and cold immediately after `drush cr` plus an edge ban — since a full purge during a spike is the scenario that actually takes sites down. Throughout, I watch PHP-FPM active processes and `Threads_connected` on the database, because the number that saturates first tells me what to buy.",
    },
    {
      q: "You have 4 app servers, pm.max_children = 40, and an average request time of 180 ms. What is your capacity, and what would you check before quoting it?",
      a: "Little's Law gives roughly 160 workers / 0.18 s ~= 880 requests per second of PHP work, and behind a 95%-effective edge that supports a much larger public rate for the anonymous share. But I would not quote that number without two checks. First, memory: 160 workers at ~150-250 MB RSS each has to fit, or the box swaps and the average request time stops being 180 ms. Second, and more importantly, database connections — each executing worker holds one, so 160 workers against MySQL's default `max_connections` of 151 means the pool is already oversubscribed, and the failure mode is connection errors rather than slow pages. I would also confirm the 180 ms figure came from the right population: an average dominated by page-cache hits is not the service time of the requests that will queue.",
    },
    {
      q: "Why report p95 and p99 rather than the mean, and what does the error rate add?",
      a: "Latency distributions under load are heavily skewed: a small number of requests queue behind a saturated worker pool and take seconds while the bulk still return quickly, so the mean barely moves while real users hit timeouts. p95 and p99 expose exactly that tail, and they are what an SLO can be written against. The error rate is the other half of the picture, because a saturated system frequently keeps throughput flat while failing an increasing share of requests — PHP-FPM's listen queue overflows and nginx returns 502s, or requests hit `request_terminate_timeout`. In k6 I would set `http_req_failed: ['rate<0.01']` with `abortOnFail` so the run stops at the breaking point rather than generating noise past it, and treat the load level where errors first appear as the real capacity, not the highest throughput number observed.",
    },
    {
      q: "Coming from Symfony, is any of this different for Drupal?",
      a: "The methodology is identical — same tools, same Little's Law, same insistence on percentiles — and the same PHP-FPM and database ceilings apply. What differs is what you have to model. Drupal has two distinct page-cache layers with their own headers, `X-Drupal-Cache` for the anonymous internal page cache and `X-Drupal-Dynamic-Cache` for authenticated responses, so 'a cache hit' is ambiguous unless you say which — and since 10.4/11.1 both headers carry a reason, so an authenticated hit on the front page reads `X-Drupal-Cache: UNCACHEABLE (request policy)` and `X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)` rather than a bare `UNCACHEABLE`. Authenticated traffic bypasses the internal page cache entirely, which makes the anonymous/authenticated split much more consequential than in a typical Symfony app where you may have hand-rolled caching. And the login handshake needs care: the anonymous login form carries no `form_token` — Drupal only issues tokens to authenticated users, precisely because anonymous forms are cached — so posting `name`, `pass` and `form_id=user_login_form` is enough to establish a session. I would still GET `/user/login` first to model real browser cost and to stay honest about forms that do carry tokens, and I would assert on an authenticated-only marker rather than `status === 200`, since a re-rendered login form is also a 200 and would let the whole 'authenticated' scenario silently measure anonymous, page-cached traffic.",
    },
  ],

  quiz: [
    {
      question:
        "You run `ab -n 20000 -c 200` against the front page of a Varnish-fronted Drupal site and see 8,000 req/s with a 12 ms p95. What have you learned about Drupal's capacity?",
      options: [
        "That Drupal can serve 8,000 requests per second",
        "Essentially nothing — the requests were served by Varnish and PHP never ran",
        "That pm.max_children is correctly sized",
        "That the database can handle 8,000 queries per second",
      ],
      answerIndex: 1,
      explain:
        "One cacheable URL with no cookies is a guaranteed edge HIT. The run measures Varnish's throughput. To measure Drupal you have to force cache misses (long-tail or cache-busted URLs) or authenticate, and confirm it with X-Drupal-Cache: MISS.",
    },
    {
      question:
        "Four app servers each run pm.max_children = 40 against a MySQL instance with the default max_connections = 151. What breaks first under saturation?",
      options: [
        "PHP-FPM, because 160 workers cannot be scheduled",
        "Varnish, because its object store fills",
        "The database connection limit — 160 concurrently executing workers need 160 connections",
        "Nothing; PHP-FPM shares one pooled connection across all workers",
      ],
      answerIndex: 2,
      explain:
        "Each executing PHP worker holds its own database connection for the life of the request; there is no connection pooling in stock PHP-FPM. 160 > 151, so under full load you get 'Too many connections' errors. Fix by raising max_connections (watching RAM), adding a proxy such as ProxySQL, lowering pm.max_children, or moving cache bins to Redis.",
    },
    {
      question:
        "Your k6 run shows throughput plateauing at 210 req/s while p99 climbs from 400 ms to 9 s and http_req_failed rises to 6%. What is the correct reading?",
      options: [
        "Capacity is 210 req/s and the test passed",
        "The system saturated below 210 req/s; the plateau is a queue, and the errors mark the real ceiling",
        "The load generator ran out of VUs",
        "The p99 is an artefact and should be ignored in favour of the mean",
      ],
      answerIndex: 1,
      explain:
        "Flat throughput with an exploding tail and a rising error rate is the signature of saturation: requests are queueing and some are being dropped or timing out. Usable capacity is the highest load level at which latency targets are met and errors stay near zero — not the largest req/s number the run produced.",
    },
    {
      question:
        "An 'authenticated' k6 scenario shows p(95) identical to the anonymous scenario. What is the most likely cause?",
      options: [
        "Authenticated and anonymous renders genuinely cost the same in Drupal",
        "The login POST never established a session, so every 'authenticated' request is anonymous and served from the internal page cache — verify by asserting on a post-login authenticated-only marker, not on status === 200",
        "k6 cannot report per-scenario percentiles, so both tags show the global figure",
        "Dynamic Page Cache serves authenticated users from the same cache entry as anonymous users",
      ],
      answerIndex: 1,
      explain:
        "Authenticated responses skip the internal page cache and cost a full render, so they should be visibly slower. Matching percentiles means the VUs never actually logged in — a failed login re-renders the login form with a 200, so `status === 200` passes while no session cookie is set, and every subsequent request is an anonymous page-cache HIT. Assert on something only an authenticated response contains (the `user-logged-in` body class, a toolbar element, a 200 on an admin-only path) and confirm the responses carry `X-Drupal-Cache: UNCACHEABLE (request policy)` rather than HIT.",
    },
  ],
};

export default lesson;
