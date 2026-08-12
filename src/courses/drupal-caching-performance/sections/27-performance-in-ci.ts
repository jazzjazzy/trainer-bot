import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "performance-in-ci",
  title: "Preventing Regressions in CI",
  part: "Measurement & Operations",
  estMinutes: 13,
  summary:
    "Turn the things you learned to measure into pipeline gates — Lighthouse budgets, cache-header smoke tests, query-count assertions and cache-tag assertions — so a regression fails a pull request instead of a Tuesday.",

  concept: `
## Performance regressions are silent by design

Nothing breaks when a developer adds \`#cache: max-age: 0\` to a footer block.
Tests pass, the page renders, the ticket closes. Three weeks later the incident
page that used to be \`X-Drupal-Cache: HIT\` is \`MISS\` on every request, origin
CPU has quadrupled and nobody can name the commit. The fix is not more heroics —
it is putting the measurements from the previous sections behind a **gate**, so
the regression is a red pull request instead of an outage.

The tooling here is 90% the same as on any Symfony project: Lighthouse CI for
the browser side, a smoke script for HTTP, query counting in integration tests.
The 10% that is Drupal-specific — and the part that actually catches Drupal
regressions — is asserting **cache headers** and **cache tags**.

### The four gates, cheapest first

1. **Cache-metadata assertions (kernel tests, milliseconds).** Render the build
   array, then read what bubbled into it. \`CacheableMetadata::createFromRenderArray($build)\`
   after \`\\Drupal\\Core\\Render\\RendererInterface::renderRoot()\` tells you the
   real tags, contexts and max-age. Assert the tag your listing needs
   (\`node_list:incident\`) and assert the max-age is \`Cache::PERMANENT\`, not 0.
2. **Query counts (kernel tests).** \`\\Drupal\\Core\\Database\\Database::startLog('key')\`
   turns on the connection logger; \`Database::getLog('key')\` returns one entry
   per statement (\`query\`, \`args\`, \`caller\`, \`time\`) and ends the log. Count
   them around a list build and you have a permanent N+1 tripwire.
3. **Response-level assertions (functional tests).** Core's
   \`AssertPageCacheContextsAndTagsTrait\` gives you \`assertCacheTags()\`,
   \`assertCacheContexts()\` and \`assertCacheMaxAge()\`. The first two read the
   \`X-Drupal-Cache-Tags\` / \`-Contexts\` debug headers, which core switches on
   for the test site automatically; the third reads plain \`Cache-Control\`. Be
   aware the first two are **exhaustive** — a sorted \`assertSame\` against your
   list plus injected defaults, so a stray bubbled tag fails the test. That
   strictness is the point.
4. **Browser budgets (Lighthouse CI).** \`.lighthouserc.yml\` with
   \`assert.assertions\` for \`largest-contentful-paint\`,
   \`cumulative-layout-shift\` and \`resource-summary:script:size\`, run on a
   deployed preview environment.

### Keeping gates from becoming noise

Flaky gates get disabled, so design for determinism. Use a fixed content
fixture, not production data. **Warm the cache before you measure** — the first
request after a deploy is always the slow one, so hit each URL once and assert
on the second. Give Lighthouse \`numberOfRuns: 3\` or more and set
\`aggregationMethod: median\`; the default is \`optimistic\`, which quietly takes
the best run and hides a bimodal regression. Assert exact numbers only where
they are genuinely deterministic (query counts on a fixed fixture are; LCP on a
shared CI runner is not) and use ranges elsewhere.

One caveat worth knowing: Lighthouse's \`interaction-to-next-paint\` audit only
runs in **timespan** mode, not in the ordinary navigation run, because a lab
navigation has no user input. Budget the lab metrics you can actually get and
read INP from field data instead.

### Threshold vs trend

A pass/fail threshold catches cliffs, not drift. Ten commits that each add 30 ms
never trip a 2.5 s budget but cost you 300 ms. Upload every run to an LHCI
server (or just append the metrics to a table keyed by commit SHA) and alert on
the **delta against the base branch**, not only the absolute number.
`,

  comparisons: [
    {
      label: "Catching a reintroduced N+1",
      intro:
        "Someone replaces a loadMultiple() with a loop. Both ecosystems solve this by counting statements around the code under test; only the plumbing differs.",
      php: `// Symfony: the profiler's db collector counts what Doctrine ran.
final class IncidentListQueryCountTest extends WebTestCase
{
    public function testListDoesNotNPlusOne(): void
    {
        $client = static::createClient();
        $client->enableProfiler();
        $client->request('GET', '/incidents');

        $db = $client->getProfile()->getCollector('db');

        // 1 list query + 1 batched author fetch + framework overhead.
        self::assertLessThanOrEqual(6, $db->getQueryCount());
    }
}`,
      ts: `// Drupal: the query log lives on the database connection itself.
final class IncidentListQueryCountTest extends KernelTestBase {

  protected static $modules = ['system', 'user', 'node', 'field', 'incident'];

  public function testListDoesNotNPlusOne(): void {
    $this->createIncidents(25);

    Database::startLog('incident_list');
    $build = $this->container->get('incident.list_builder')->build();
    $this->container->get('renderer')->renderRoot($build);
    // getLog() returns the entries AND ends the log.
    $queries = Database::getLog('incident_list');

    $this->assertLessThanOrEqual(
      6,
      count($queries),
      implode("\\n", array_column($queries, 'query')),
    );
  }
}`,
      note: "Pass the actual SQL as the assertion message. When it fails at 2am the failure output names the offending query instead of just saying '47 is not <= 6'.",
    },
    {
      label: "Asserting cacheability, not just output",
      intro:
        "Symfony can only assert the HTTP result. Drupal lets you assert the internal metadata too, which is where the bug actually lives — and catches it a layer earlier.",
      php: `// Symfony: cacheability is whatever ended up in the headers.
$client->request('GET', '/incident/42');
$response = $client->getResponse();

self::assertTrue($response->isCacheable());
self::assertSame(
    'max-age=300, public',
    $response->headers->get('Cache-Control'),
);

// With FOSHttpCacheBundle, tags are just another header to assert on.
self::assertSame(
    'incident-42,incident-list',
    $response->headers->get('X-Cache-Tags'),
);`,
      ts: `// Drupal, kernel level: assert the render array after it has rendered,
// so bubbled metadata from children is included.
$build = $this->container->get('incident.block_builder')->build();
$this->container->get('renderer')->renderRoot($build);
$meta = CacheableMetadata::createFromRenderArray($build);

$this->assertContains('node_list:incident', $meta->getCacheTags());
$this->assertContains('user.permissions', $meta->getCacheContexts());
$this->assertSame(Cache::PERMANENT, $meta->getCacheMaxAge());

// Drupal, functional level: assert what reached the response.
// These read the X-Drupal-Cache-* debug headers and compare EXHAUSTIVELY.
$this->drupalGet('/incidents');
$this->assertCacheTags(['config:views.view.incidents', 'node_list:incident']);
$this->assertCacheContexts(['url.query_args']);
$this->assertCacheMaxAge(300);`,
      note: "assertCacheMaxAge() checks the HTTP header (Cache-Control: max-age=N, public), not the render array's max-age — they are different numbers and both worth a test.",
    },
    {
      label: "Lighthouse budgets in the pipeline",
      intro:
        "Identical tool, identical config file. The Drupal-specific lines are the warm-up step and running strictly as an anonymous visitor.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .lighthouserc.yml — Symfony app built with Encore
ci:
  collect:
    numberOfRuns: 3
    startServerCommand: symfony serve --no-tls
    url:
      - http://127.0.0.1:8000/
      - http://127.0.0.1:8000/incidents
  assert:
    assertions:
      largest-contentful-paint:
        - error
        - maxNumericValue: 2500
          aggregationMethod: median
      cumulative-layout-shift:
        - error
        - maxNumericValue: 0.1
          aggregationMethod: median
      resource-summary:script:size:
        - error
        - maxNumericValue: 180000
  upload:
    target: temporary-public-storage`,
      ts: `# .lighthouserc.yml — Drupal preview environment
ci:
  collect:
    numberOfRuns: 3
    # Deterministic fixture + warmed caches, or run 1 is always the outlier.
    # In CI: drush cr && drush sql:cli < fixture.sql && curl -s <urls> >/dev/null
    url:
      - https://pr-142.preview.example.com/
      - https://pr-142.preview.example.com/incidents
    settings:
      # No session cookie: measure the anonymous, page-cached path.
      extraHeaders: '{"Cookie":""}'
  assert:
    assertions:
      largest-contentful-paint:
        - error
        - maxNumericValue: 2500
          aggregationMethod: median
      cumulative-layout-shift:
        - error
        - maxNumericValue: 0.1
          aggregationMethod: median
      # Drupal aggregates JS per library group; watch total weight.
      resource-summary:script:size:
        - error
        - maxNumericValue: 250000
  upload:
    target: lhci
    serverBaseUrl: https://lhci.example.com`,
      note: "aggregationMethod defaults to 'optimistic' — the single best run. Always set it to median explicitly, or your budget silently measures your luckiest run.",
    },
    {
      label: "Post-deploy cache-header smoke test",
      intro:
        "The single highest-value Drupal-specific check: hit each key URL twice and assert the second one is a hit. It costs four seconds and catches the class of regression nothing else sees.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
# Symfony behind its own HttpCache (debug => true adds the header).
set -euo pipefail
BASE="\${1:?base url}"

for path in / /incidents /incident/42; do
  curl -sSI "$BASE$path" > /dev/null              # warm
  # '|| true' matters: under 'set -e' a grep that matches nothing aborts.
  header=$(curl -sSI "$BASE$path" \\
    | grep -i '^x-symfony-cache:' | tr -d '\\r' || true)

  case "$header" in
    *fresh*) echo "ok   $path" ;;
    *)       echo "FAIL $path -> \${header:-<no header>}"; exit 1 ;;
  esac
done`,
      ts: `#!/usr/bin/env bash
# Drupal: X-Drupal-Cache is the internal page cache (anonymous only),
# X-Drupal-Dynamic-Cache is the authenticated-path equivalent.
set -euo pipefail
BASE="\${1:?base url}"
fail=0

for path in / /incidents /incident/42; do
  curl -sSI "$BASE$path" > /dev/null              # warm
  hdrs=$(curl -sSI "$BASE$path" | tr -d '\\r')

  # '|| true' matters: under 'set -e' a grep that matches nothing aborts.
  page=$(grep -i '^x-drupal-cache:' <<< "$hdrs" | cut -d' ' -f2- || true)
  cc=$(grep -i '^cache-control:'   <<< "$hdrs" | cut -d' ' -f2- || true)

  if [[ "$page" != "HIT" ]]; then
    echo "FAIL $path X-Drupal-Cache=\${page:-<missing>}"; fail=1
  elif [[ "$cc" != *"public"* ]]; then
    echo "FAIL $path Cache-Control=$cc"; fail=1
  else
    echo "ok   $path"
  fi
done

exit "$fail"`,
      note: "Run it as a deploy step, not a test suite — it needs a real environment. Assert Cache-Control too: a page can be a page-cache HIT while still telling the CDN 'private'.",
    },
  ],

  playground: {
    intro:
      "A miniature CI gate that runs all four checks against one build. Note how the same five Lighthouse runs pass or fail depending only on the aggregation method — that is where flaky budgets come from.",
    lang: "php",
    code: `<?php
// A miniature CI performance gate. Four checks run against one build;
// the gate fails the build only if a check is over budget.

// --- 1. Lighthouse-style budget over repeated runs ------------------------
// LHCI aggregates N runs before comparing: 'optimistic' takes the best value
// for a max* assertion, 'pessimistic' the worst, 'median' the middle one.
function aggregate(array $values, string $method): float {
  sort($values);
  return match ($method) {
    'optimistic'  => (float) $values[0],
    'pessimistic' => (float) $values[count($values) - 1],
    'median'      => (float) $values[intdiv(count($values) - 1, 2)],
  };
}

$lcpRuns = [2410, 2680, 2520, 3180, 2470];
$budget  = 2600.0;

echo "LCP budget: {$budget}ms over 5 runs\\n";
foreach (['optimistic', 'median', 'pessimistic'] as $method) {
  $value  = aggregate($lcpRuns, $method);
  $status = $value <= $budget ? 'pass' : 'FAIL';
  printf("  %-12s %6.0fms  %s\\n", $method, $value, $status);
}
echo "\\n";

// --- 2. Cache-header smoke test on key URLs ------------------------------
// Each URL is requested twice; the second response must be a HIT.
$smoke = [
  '/'                  => ['want' => 'HIT', 'got' => 'HIT'],
  '/incidents'         => ['want' => 'HIT', 'got' => 'MISS'],
  '/incident/42'       => ['want' => 'HIT', 'got' => 'HIT'],
  // user.reset.form sets no_cache: TRUE, so DenyNoCacheRoutes denies it.
  '/user/reset/1'      => ['want' => 'UNCACHEABLE (response policy)',
                           'got'  => 'UNCACHEABLE (response policy)'],
];
$failures = [];
echo "X-Drupal-Cache smoke test (second request per URL)\\n";
foreach ($smoke as $path => $r) {
  $ok = $r['want'] === $r['got'];
  if (!$ok) {
    $failures[] = "cache-header {$path}";
  }
  printf("  %-14s want %-30s got %-30s %s\\n",
    $path, $r['want'], $r['got'], $ok ? 'pass' : 'FAIL');
}
echo "\\n";

// --- 3. Query count assertion (catches a reintroduced N+1) ---------------
$expectedQueries = 12;
$actualQueries   = 47;
$queryOk = $actualQueries === $expectedQueries;
if (!$queryOk) {
  $failures[] = 'query-count /incidents';
}
printf("Query count on /incidents: expected %d, got %d  %s\\n",
  $expectedQueries, $actualQueries, $queryOk ? 'pass' : 'FAIL');
echo "\\n";

// --- 4. Cache tags the render array must carry ---------------------------
$expectedTags = ['config:views.view.incidents', 'node_list:incident'];
$actualTags   = ['config:views.view.incidents', 'node:42', 'node:43'];
$missing      = array_values(array_diff($expectedTags, $actualTags));
if ($missing) {
  $failures[] = 'cache-tags incident_teaser_block';
}
echo "Cache tags on incident_teaser_block\\n";
echo "  missing: " . ($missing ? implode(', ', $missing) : '(none)') . "\\n\\n";

// --- Gate verdict --------------------------------------------------------
echo "GATE: " . ($failures ? 'FAILED' : 'PASSED') . "\\n";
foreach ($failures as $f) {
  echo "  - {$f}\\n";
}`,
    output: `LCP budget: 2600ms over 5 runs
  optimistic     2410ms  pass
  median         2520ms  pass
  pessimistic    3180ms  FAIL

X-Drupal-Cache smoke test (second request per URL)
  /              want HIT                            got HIT                            pass
  /incidents     want HIT                            got MISS                           FAIL
  /incident/42   want HIT                            got HIT                            pass
  /user/reset/1  want UNCACHEABLE (response policy)  got UNCACHEABLE (response policy)  pass

Query count on /incidents: expected 12, got 47  FAIL

Cache tags on incident_teaser_block
  missing: node_list:incident

GATE: FAILED
  - cache-header /incidents
  - query-count /incidents
  - cache-tags incident_teaser_block`,
  },

  keyPoints: [
    "Put the cheap, deterministic checks in PHPUnit and the expensive, browser-level ones on a preview environment: cache-metadata and query-count assertions in kernel tests, cache-tag/context assertions in functional tests, Lighthouse budgets after deploy.",
    "Database::startLog('key') plus Database::getLog('key') is the built-in query counter; getLog() returns one entry per statement and ends the log, and each entry carries query, args, caller and time.",
    "Read cacheability with CacheableMetadata::createFromRenderArray($build) AFTER renderRoot(), otherwise you only see the metadata the top level declared, not what bubbled up from children.",
    "assertCacheTags() and assertCacheContexts() from AssertPageCacheContextsAndTagsTrait compare exhaustively with a sorted assertSame against your list plus injected defaults — strict on purpose, so a stray tag fails.",
    "A cache-header smoke test (warm, then assert X-Drupal-Cache: HIT and a public Cache-Control on key URLs) is the highest-value Drupal-specific gate and takes seconds to run.",
    "Design against flakiness: fixed fixtures, warmed caches, numberOfRuns >= 3, aggregationMethod: median (the default is optimistic), exact counts only where genuinely deterministic — and track the delta against the base branch, not just a pass/fail threshold.",
  ],

  interview: [
    {
      q: "How would you stop a caching regression from reaching production on a busy Drupal site?",
      a: "I'd make cacheability a test assertion rather than a review convention. At kernel level I render the build with `renderRoot()` and then read `CacheableMetadata::createFromRenderArray($build)` to assert the tags and contexts I expect and that max-age is `Cache::PERMANENT` rather than 0 — a single stray `max-age: 0` bubbling up is the most common way a page silently stops caching. At functional level I use core's `AssertPageCacheContextsAndTagsTrait` (`assertCacheTags()`, `assertCacheContexts()`, `assertCacheMaxAge()`), which reads the `X-Drupal-Cache-*` debug headers that core enables for the test site. Then, as a deploy step against the real preview environment, a short curl script warms each key URL and asserts the second response is `X-Drupal-Cache: HIT` with a `public` Cache-Control. That last one is four seconds of pipeline time and catches the regression class — HIT quietly becoming MISS — that unit tests never see.",
    },
    {
      q: "Your Lighthouse budget passes on every PR but the site has got 400ms slower over a quarter. What went wrong and how do you fix the process?",
      a: "A threshold only catches cliffs. If the budget is LCP under 2.5s and the site drifts from 1.6s to 2.0s, every individual PR passes while the trend is bad. Two changes fix it. First, record the metrics per commit — upload to an LHCI server or just append to a table keyed by commit SHA — and alert on the **delta against the base branch**, so a PR that adds 150ms fails even though the absolute number is fine. Second, check the aggregation: LHCI's `aggregationMethod` defaults to `optimistic`, which takes the best of N runs, so a change that made the page bimodal — fast on a warm cache, slow on a cold one — would never show up. Setting `aggregationMethod: median` with `numberOfRuns: 3` or more makes the budget measure the typical experience instead of the luckiest run.",
    },
    {
      q: "How do you write a query-count assertion that catches an N+1 without becoming flaky?",
      a: "Use `\\Drupal\\Core\\Database\\Database::startLog('key')` before the code under test and `Database::getLog('key')` after; you get one entry per statement with the query text, args and calling code, and `getLog()` ends the log for you. The flakiness comes from the environment, not the technique: run it as a kernel test with an explicit, fixed content fixture and a fixed module list, so the count is deterministic. I assert `assertLessThanOrEqual()` against a headroom number rather than an exact equality, unless I've confirmed the count is stable — an exact assertion breaks every time core adds one bootstrap query in a patch release, and a test that fails for irrelevant reasons gets deleted. I also pass `implode(\"\\n\", array_column($queries, 'query'))` as the assertion message so the failure output names the offending SQL directly.",
    },
    {
      q: "Where does Core Web Vitals measurement in CI stop being useful, and what fills the gap?",
      a: "Lab tools measure what a headless browser on a CI runner experiences, which is not your users. LCP and CLS are available in a Lighthouse navigation run and are worth budgeting because they're mostly determined by markup, images and CSS, which are things a PR can regress. INP is different: Lighthouse's `interaction-to-next-paint` audit only runs in timespan mode, because a plain navigation run has no user input to measure. So for responsiveness I budget the lab metrics I can actually collect and get INP from field data — CrUX, or a small `web-vitals` RUM script posting to an endpoint. The general rule I'd give is: lab data in CI for regression detection because it's repeatable, field data in dashboards for prioritisation because it's real.",
    },
  ],

  quiz: [
    {
      question:
        "In a kernel test you call CacheableMetadata::createFromRenderArray($build) and see none of the tags the child blocks declare. What is most likely wrong?",
      options: [
        "Kernel tests do not support cache tags; you need a functional test",
        "You read the metadata before rendering, so nothing had bubbled into $build['#cache'] yet",
        "createFromRenderArray() only reads contexts, never tags",
        "The render cache was cold, so the tags had not been computed",
      ],
      answerIndex: 1,
      explain:
        "Child metadata is merged into the parent's #cache during rendering. Call the renderer (renderRoot(), which bubbles into the array by reference) first, then build the CacheableMetadata from $build — otherwise you only see what the top level declared itself.",
    },
    {
      question:
        "Your functional test calls $this->assertCacheTags(['node_list:incident']) and fails with a diff showing extra tags like 'http_response' and 'config:user.role.anonymous'. What should you do?",
      options: [
        "Switch to assertCacheTag(), which checks a single tag",
        "The assertion is exhaustive but already injects those defaults — the failure means some other tag really is present, so investigate the extras it listed",
        "Disable http.response.debug_cacheability_headers so the header is not compared",
        "Pass FALSE as the second argument to suppress all default tags",
      ],
      answerIndex: 1,
      explain:
        "assertCacheTags() merges 'http_response' (and 'config:user.role.anonymous' for anonymous requests) into your expectation, then does a sorted assertSame. So those two are already accounted for; anything else in the diff is a genuinely bubbled tag worth understanding before you add it to the expectation.",
    },
    {
      question:
        "Which LHCI setting most often makes a budget pass while the site is actually getting slower?",
      options: [
        "numberOfRuns set higher than 1",
        "upload.target set to temporary-public-storage",
        "aggregationMethod left at its default of 'optimistic', which uses the best run",
        "preset: lighthouse:recommended",
      ],
      answerIndex: 2,
      explain:
        "For max* assertions, 'optimistic' takes the minimum across runs — the luckiest result. A change that makes the page bimodal (fast warm, slow cold) can regress badly without ever moving the best run. Set aggregationMethod: median explicitly.",
    },
    {
      question:
        "Why is 'warm the URL once, then assert on the second response' the right shape for a post-deploy cache smoke test?",
      options: [
        "Because Drupal only sends cache headers on the second request",
        "Because the first request after a deploy is a guaranteed MISS while caches rebuild, so asserting on it would fail every single deploy",
        "Because curl caches the first response locally",
        "Because X-Drupal-Cache is only added once the render cache bin exists",
      ],
      answerIndex: 1,
      explain:
        "A deploy rebuilds caches, so the first hit on any URL is legitimately a MISS. Warming once and asserting on the second request separates 'cold cache' (expected) from 'this page can no longer be cached at all' (the regression you actually care about).",
    },
  ],
};

export default lesson;
