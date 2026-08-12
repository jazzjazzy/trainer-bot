import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "observability-post-deploy",
  title: "Knowing the Deploy Worked",
  part: "Safety & Operations",
  estMinutes: 13,
  summary:
    "A green pipeline proves the artefact shipped, not that the site works — so watch 5xx rate, log errors, cache hit ratio, latency and queue depth for ten minutes, read the status report, and keep a deploy log so 'what changed?' has an answer.",

  concept: `
The pipeline going green means the artefact deployed. It does not mean the site
works. Symfony teams already know this — \`deployer\` exits 0 and you still stare
at a dashboard for ten minutes. Drupal is the same discipline with two twists:
the deploy almost certainly flushed every cache, and Drupal ships its own
self-diagnostic page you should be reading.

## The five signals, in priority order

1. **5xx rate at the edge.** Fastest and most honest. Your CDN or load balancer
   sees every request; Drupal only logs requests that reached PHP. A white
   screen from a fatal in an update hook may never make it into \`dblog\` at all.
2. **Application errors.** \`drush watchdog:show --severity-min=Error --count=20\`,
   or the same stream in your aggregator if the \`syslog\` module is shipping logs
   off the box. Compare against the *pre-deploy* error rate, not against zero —
   every real site has a baseline of noise.
3. **Cache hit ratio.** This is the Drupal-specific one. \`drush deploy\` rebuilds
   caches, so at minute zero the page cache is empty and the hit ratio falls off
   a cliff. **The dip is expected; the recovery curve is the signal.** Back to
   baseline within a few minutes is normal. Plateauing at 40% means something
   you shipped added a cache context, a cache tag that invalidates constantly,
   or a max-age of 0. Read \`X-Drupal-Cache\` (internal page cache, anonymous
   traffic only) and \`X-Drupal-Dynamic-Cache\`. Since Drupal 10.4 / 11.1 the
   miss carries its reason in parentheses: dynamic page cache emits \`HIT\`,
   \`MISS\`, \`UNCACHEABLE (poor cacheability)\`, \`UNCACHEABLE (no cacheability)\`,
   \`UNCACHEABLE (request policy)\` or \`UNCACHEABLE (response policy)\`, and the
   internal page cache adds \`UNCACHEABLE (request policy)\` and
   \`UNCACHEABLE (response policy)\` to its own HIT/MISS. Only sites older than
   10.4 / 11.1 print a bare \`UNCACHEABLE\`. UNCACHEABLE appearing on a route
   where it did not appear before is a regression you just deployed — and
   because the value is now parenthesised, anything grepping or alerting on it
   has to match a prefix rather than an exact string.
4. **p95 response time.** Follows the cache dip up, and must follow it back down.
5. **Queue depth.** \`drush queue:list\` prints Queue / Items / Class. A newly
   enabled queue worker, or cron that has silently stopped, shows here first.

## The status report is your post-deploy health check

\`/admin/reports/status\` is Drupal's built-in diagnostic, and
\`drush core:requirements\` (aliases \`status-report\`, \`rq\`) gives you the same
data with \`--severity\`, \`--ignore\` and \`--format\` so a script can gate on it.
Four items actually matter in a deploy window:

- **Database updates** — pending \`hook_update_N\` means \`drush updatedb\` never
  ran, or died halfway through.
- **Entity/field definitions** — a "mismatched entity and/or field definitions"
  warning means an entity or field change shipped without an update hook.
- **Cron** — Drupal reports the last run from the \`system.cron_last\` state key.
  If it stops moving, everything scheduled has stopped.
- **File system / config sync directory** — unwritable paths, common on a fresh
  container or after a permissions change.

Note that in Drupal 11.2 the \`REQUIREMENT_*\` constants and
\`drupal_requirements_severity()\` were deprecated in favour of the
\`RequirementSeverity\` enum. That is a code-level change for module authors; the
report and the drush command behave the same on 10 and 11.

## Alert on the release, not on uptime

An uptime check fires when the site is down — by then customers found it. What
you want is an alert that fires when *this release* is bad: thresholds expressed
relative to a pre-deploy baseline, evaluated over a short window, and correlated
with a release marker so the graph shows a vertical line labelled with the git
SHA. That marker is the whole game. Emit a deploy record — SHA, who ran it, when,
which update hooks ran, a one-line config diff summary — into the same system
that holds your metrics, and "what changed at 14:07?" stops being a
twenty-minute archaeology exercise.
`,

  comparisons: [
    {
      label: "The first ten minutes, as a checklist",
      intro:
        "Same ritual on both stacks: prove the app booted, prove migrations/config landed, then watch the error stream. Only the command names differ.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony — post-deploy smoke, run from the deploy host.

# 1. Did the right code land, in the right env?
php bin/console about | grep -E 'Environment|Debug|Version'
git -C current rev-parse --short HEAD

# 2. Did the schema land?
php bin/console doctrine:migrations:status | grep -i 'new migrations'
php bin/console doctrine:schema:validate --skip-sync

# 3. Does the app answer, and is the container warm?
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\\n' https://example.com/health

# 4. Watch the error stream against a known baseline.
tail -f var/log/prod.log | grep -E 'CRITICAL|ERROR'
#    or, in a container: kubectl logs -f deploy/app | grep ERROR

# 5. Edge: 5xx rate and latency for the next ten minutes.
#    (Grafana / Datadog / whatever fronts the load balancer.)`,
      ts: `# Drupal — post-deploy smoke, run from the app container.

# 1. Did the right code land, in the right env?
drush status --fields=drupal-version,db-status,bootstrap
#    --fields takes a comma list; --field selects exactly one and forces
#    string format, so it does not stack.
drush php:eval 'print \\Drupal::config("system.logging")->get("error_level");'
#    -> should print "hide" in production, never "verbose"

# 2. Did updatedb and config:import actually land?
drush updatedb:status          # must be empty
drush config:status            # must be empty - no drift after import

# 3. Drupal's own health check, machine-readable.
#    --severity=1 shows warnings and errors only (2 = errors only).
drush core:requirements --severity=1 --format=table \\
  --ignore=cron,update_core,update_contrib

# 4. Errors since the release, worst first.
drush watchdog:show --severity-min=Error --count=20
drush watchdog:tail --severity-min=Warning   # leave this running

# 5. Is the cache refilling? Anonymous request, twice.
curl -sSI https://example.com/ | grep -i 'x-drupal-'
#    X-Drupal-Cache: MISS            <- first hit after cache rebuild
#    X-Drupal-Dynamic-Cache: MISS
#    ...30 seconds later...
#    X-Drupal-Cache: HIT             <- ratio is climbing back

# 6. Is background work moving?
drush queue:list
drush php:eval 'print date("c", (int) \\Drupal::state()->get("system.cron_last"));'`,
      note:
        "drush updatedb:status and drush config:status both being empty is the single strongest 'the deploy completed' signal — it proves the code, the schema and config/sync all agree on this box right now.",
    },
    {
      label: "Getting logs off the box",
      intro:
        "Neither dblog nor a file on disk survives a container restart, and neither is greppable across four web nodes. Both stacks solve it the same way: a handler that writes to stdout or syslog, and something upstream that collects it.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony — config/packages/prod/monolog.yaml
monolog:
  handlers:
    # Buffer, then emit only if something went wrong: one grouped
    # record per failed request instead of a wall of debug lines.
    main:
      type: fingers_crossed
      action_level: error
      handler: nested
      excluded_http_codes: [404, 405]
      buffer_size: 50
    nested:
      type: stream
      path: "php://stderr"        # container collects stderr
      level: debug
      formatter: monolog.formatter.json
    # Deprecations kept apart so they never page anyone.
    deprecation:
      type: stream
      channels: [deprecation]
      path: "php://stderr"

# The release is stamped on every record by a processor:
#   App\\Logging\\ReleaseProcessor -> extra.release = %env(GIT_SHA)%`,
      ts: `# Drupal — the core "syslog" module, exported like any other config.

# config/sync/core.extension.yml (excerpt)
module:
  syslog: 0
  dblog: 0        # keep for the admin UI; it is NOT your log store

# config/sync/syslog.settings.yml
identity: drupal
facility: 128     # LOG_LOCAL0 - route it in rsyslog/journald
format: '!base_url|!timestamp|!type|!ip|!request_uri|!referer|!uid|!link|!message'

# config/sync/dblog.settings.yml
row_limit: 10000  # watchdog rows kept; trimmed on cron

# config/sync/system.logging.yml
error_level: hide  # NEVER "verbose" in production - it prints backtraces
                   # to anonymous visitors. Use config split so dev keeps
                   # "verbose" and prod keeps "hide".

# settings.php (prod), for a container that wants JSON on stdout:
#   contrib drupal/monolog gives you Monolog handlers and processors,
#   configured in monolog.settings + a services.yml override - the same
#   fingers_crossed / stream setup you already know from Symfony.`,
      note:
        "dblog writes every log record into the watchdog table in the same database serving your pages — a burst of PHP warnings after a bad deploy becomes a write storm. Keep dblog for the UI, keep row_limit sane, and treat syslog (or contrib monolog) as the actual transport.",
    },
    {
      label: "Alerting on a bad deploy specifically",
      intro:
        "A generic uptime alert fires when the site is already down. These fire when this release is measurably worse than the ten minutes before it — and they are deliberately silent about the cache dip a deploy is supposed to cause.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony — Prometheus alerting rules
groups:
  - name: release-health
    rules:
      - alert: ErrorRateRegression
        expr: |
          sum(rate(http_server_requests_total{status=~"5.."}[5m]))
            /
          sum(rate(http_server_requests_total[5m]))
          > 3 * (
            sum(rate(http_server_requests_total{status=~"5.."}[5m] offset 30m))
              /
            sum(rate(http_server_requests_total[5m] offset 30m))
          )
        for: 3m
        labels: { severity: page }
        annotations:
          summary: "5xx rate is 3x the pre-deploy baseline"
          release: "{{ $labels.release }}"

      - alert: MigrationsPending
        expr: symfony_doctrine_migrations_pending > 0
        for: 10m
        labels: { severity: ticket }`,
      ts: `# Drupal — same shape, Drupal-shaped signals.
# The metrics come from your edge and a small exporter, not from
# Drupal itself: Drupal emits logs, you turn them into numbers.
groups:
  - name: release-health
    rules:
      - alert: DrupalErrorRateRegression
        # watchdog severity <= 3 is Error/Critical/Alert/Emergency.
        expr: sum(rate(drupal_watchdog_total{severity=~"0|1|2|3"}[5m])) > 3 *
              sum(rate(drupal_watchdog_total{severity=~"0|1|2|3"}[5m] offset 30m))
        for: 3m
        labels: { severity: page }

      - alert: PageCacheNotRecovering
        # A deploy empties the cache. Fine. Not recovering is not fine,
        # so the window is long enough to skip the expected dip.
        expr: |
          sum(rate(edge_requests_total{drupal_cache="HIT"}[10m]))
            /
          sum(rate(edge_requests_total[10m]))
          < 0.7
        for: 10m
        labels: { severity: page }
        annotations:
          summary: "Anonymous cache hit ratio stuck below 70% after release"
          runbook: "Check for a new cache context or max-age 0 on the hot route"

      - alert: DynamicCacheUncacheableSpike
        # Since 10.4/11.1 the header reads UNCACHEABLE (<reason>), so the
        # label matcher has to be a regex - an exact match never fires.
        expr: sum(rate(edge_requests_total{drupal_dynamic_cache=~"UNCACHEABLE.*"}[10m]))
              > 5 * sum(rate(edge_requests_total{drupal_dynamic_cache=~"UNCACHEABLE.*"}[10m] offset 1h))
        for: 10m
        labels: { severity: ticket }

      - alert: DrupalCronStalled
        # Exporter reads the system.cron_last state key.
        expr: time() - drupal_cron_last_timestamp > 10800
        for: 15m
        labels: { severity: ticket }

      - alert: DrupalQueueBacklogGrowing
        expr: deriv(drupal_queue_items[15m]) > 0 and drupal_queue_items > 1000
        for: 15m
        labels: { severity: ticket }

      - alert: DrupalPendingUpdates
        # Exporter shells out to: drush updatedb:status --format=json
        expr: drupal_pending_updates > 0
        for: 10m
        labels: { severity: page }`,
      note:
        "PageCacheNotRecovering is the rule that earns its keep. Every other alert here has a Symfony twin; this one exists because a Drupal deploy legitimately destroys the cache, so the alert has to be written around the expected dip rather than against it.",
    },
    {
      label: "Keeping a deploy log",
      intro:
        "The question you will actually be asked is 'what changed at 14:07?'. Both stacks answer it by writing a record at deploy time — a machine-readable one for the dashboard, and a human one for the channel.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony — deploy.sh, after a successful release.
RELEASE=$(git rev-parse --short HEAD)
WHO=\${DEPLOYER:-$(git config user.email)}
WHEN=$(date -u +%FT%TZ)

# Machine-readable: a vertical line on every graph.
curl -sS -XPOST "$GRAFANA/api/annotations" \\
  -H "Authorization: Bearer $GRAFANA_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d "{\\"tags\\":[\\"deploy\\",\\"prod\\"],\\"text\\":\\"$RELEASE by $WHO\\"}"

# Human-readable: append to a file the whole team can read.
{
  echo "## $WHEN  $RELEASE  ($WHO)"
  git log --oneline "$PREVIOUS_RELEASE..HEAD"
  php bin/console doctrine:migrations:list --no-ansi | tail -5
} >> deploy-log.md

# Same text into the release channel.
curl -sS -XPOST "$SLACK_WEBHOOK" -d "{\\"text\\":\\"prod <- $RELEASE ($WHO)\\"}"`,
      ts: `# Drupal — same script, Drupal facts in the record.
RELEASE=$(git rev-parse --short HEAD)
WHO=\${DEPLOYER:-$(git config user.email)}
WHEN=$(date -u +%FT%TZ)

# BEFORE drush deploy: capture what is about to happen.
PENDING=$(drush updatedb:status --format=json)
CONFIG_DIFF=$(drush config:status --format=list | tr '\\n' ' ')

drush deploy   # updatedb -> config:import -> cache:rebuild -> deploy:hook
               # (-> cache:warm on 11.2+)

# AFTER: stamp the release where Drupal itself can see it, so a
# support engineer in the admin UI can answer "which build is this?".
drush state:set deploy.release "$RELEASE" --input-format=string
drush state:set deploy.time "$WHEN" --input-format=string

# And put it in the log stream your aggregator already collects,
# so the release marker sits inline with the errors around it.
drush php:eval "\\Drupal::logger('deploy')->notice('Release @r by @w', \\
  ['@r' => '$RELEASE', '@w' => '$WHO']);"

{
  echo "## $WHEN  $RELEASE  ($WHO)"
  echo "update hooks: $PENDING"
  echo "config changed: $CONFIG_DIFF"
  git log --oneline "$PREVIOUS_RELEASE..HEAD"
} >> deploy-log.md

curl -sS -XPOST "$SLACK_WEBHOOK" -d "{\\"text\\":\\"prod <- $RELEASE ($WHO)\\"}"`,
      note:
        "Capture updatedb:status and config:status BEFORE running drush deploy — afterwards they are both empty, and the list of what the deploy actually did is gone. Writing the SHA into state (not config) is deliberate: state is per-environment, so it will never be exported and never cause drift.",
    },
  ],

  playground: {
    intro:
      "Ten minutes of telemetry around a release, and the rules an on-call rota would apply to it. Predict the verdict before running it — in particular, decide whether that cache collapse at minute 0 should page anyone.",
    lang: "php",
    code: `<?php
declare(strict_types=1);

// Ten minutes of post-deploy telemetry, one sample per minute.
// Minute 0 is the release. drush deploy rebuilt caches, so the
// page-cache hit ratio falls off a cliff and has to climb back.
// [minute, requests, 5xx, page-cache hit ratio, p95 ms, queue depth]
$samples = [
  [-2, 4120, 2, 0.94, 210, 12],
  [-1, 4080, 1, 0.95, 205, 9],
  [0, 3960, 4, 0.12, 910, 14],
  [1, 4010, 9, 0.38, 720, 38],
  [2, 4090, 6, 0.61, 480, 57],
  [3, 4150, 3, 0.78, 300, 61],
  [4, 4100, 2, 0.88, 240, 44],
  [5, 4130, 2, 0.92, 215, 21],
  [6, 4160, 1, 0.94, 208, 10],
];

$pre = array_values(array_filter($samples, static fn(array $s): bool => $s[0] < 0));
$post = array_values(array_filter($samples, static fn(array $s): bool => $s[0] >= 0));

$mean = static fn(array $rows, int $col): float
  => array_sum(array_column($rows, $col)) / count($rows);

$baseErr = $mean($pre, 2) / $mean($pre, 1);
$baseHit = $mean($pre, 3);
$baseP95 = $mean($pre, 4);
$baseQueue = $mean($pre, 5);

echo "Baseline, the two minutes before the release:\\n";
printf("  5xx rate     %.3f%% of requests\\n", $baseErr * 100);
printf("  cache hits   %.0f%%\\n", $baseHit * 100);
printf("  p95 latency  %.0f ms\\n", $baseP95);
printf("  queue depth  %.0f items\\n\\n", $baseQueue);

// Thresholds an alert rule would encode, relative to that baseline.
$errCeiling = 3 * $baseErr;
$hitFloor = 0.90 * $baseHit;
$p95Ceiling = 1.5 * $baseP95;

printf("%4s %8s %6s %7s %7s  %s\\n", 'min', '5xx/req', 'hit%', 'p95ms', 'queue', 'breaches');
$errRun = 0;
$worstErrRun = 0;
$hitBackAt = NULL;
$p95BackAt = NULL;
foreach ($post as [$m, $req, $err, $hit, $p95, $queue]) {
  $rate = $err / $req;
  $flags = [];
  if ($rate > $errCeiling) {
    $flags[] = '5xx';
    $errRun++;
    $worstErrRun = max($worstErrRun, $errRun);
  }
  else {
    $errRun = 0;
  }
  if ($hit < $hitFloor) {
    $flags[] = 'cache';
  }
  elseif ($hitBackAt === NULL) {
    $hitBackAt = $m;
  }
  if ($p95 > $p95Ceiling) {
    $flags[] = 'p95';
  }
  elseif ($p95BackAt === NULL) {
    $p95BackAt = $m;
  }
  printf(
    "%4d %7.3f%% %5.0f%% %7d %7d  %s\\n",
    $m, $rate * 100, $hit * 100, $p95, $queue,
    $flags === [] ? '-' : implode(',', $flags)
  );
}

$queues = array_column($post, 5);
$drained = end($queues) <= 1.5 * $baseQueue;

echo "\\nWhat the on-call rules make of that:\\n";
printf(
  "  5xx      : %d consecutive minutes over %.3f%% -> %s\\n",
  $worstErrRun, $errCeiling * 100,
  $worstErrRun >= 3 ? 'PAGE' : 'transient, no page'
);
printf(
  "  cache    : dipped to %.0f%%, back over %.0f%% at minute %s -> %s\\n",
  min(array_column($post, 3)) * 100, $hitFloor * 100,
  $hitBackAt === NULL ? 'never' : (string) $hitBackAt,
  $hitBackAt !== NULL && $hitBackAt <= 6 ? 'expected recovery' : 'INVESTIGATE'
);
printf(
  "  p95      : back under %.0f ms at minute %s -> %s\\n",
  $p95Ceiling,
  $p95BackAt === NULL ? 'never' : (string) $p95BackAt,
  $p95BackAt !== NULL ? 'recovered' : 'INVESTIGATE'
);
printf(
  "  queue    : peaked at %d, ended at %d -> %s\\n",
  max($queues), end($queues),
  $drained ? 'draining' : 'BACKING UP'
);

$bad = $worstErrRun >= 3 || $hitBackAt === NULL || $p95BackAt === NULL || !$drained;
echo "\\nVERDICT: " . ($bad ? 'roll back' : 'deploy is healthy, close the window') . "\\n";
echo "Note the shape: every signal moved at minute 0 and every one came back.\\n";
echo "A dip that does not recover is the deploy; a dip that recovers is the cache.\\n";
`,
    output: `Baseline, the two minutes before the release:
  5xx rate     0.037% of requests
  cache hits   94%
  p95 latency  208 ms
  queue depth  10 items

 min  5xx/req   hit%   p95ms   queue  breaches
   0   0.101%    12%     910      14  cache,p95
   1   0.224%    38%     720      38  5xx,cache,p95
   2   0.147%    61%     480      57  5xx,cache,p95
   3   0.072%    78%     300      61  cache
   4   0.049%    88%     240      44  -
   5   0.048%    92%     215      21  -
   6   0.024%    94%     208      10  -

What the on-call rules make of that:
  5xx      : 2 consecutive minutes over 0.110% -> transient, no page
  cache    : dipped to 12%, back over 85% at minute 4 -> expected recovery
  p95      : back under 311 ms at minute 3 -> recovered
  queue    : peaked at 61, ended at 10 -> draining

VERDICT: deploy is healthy, close the window
Note the shape: every signal moved at minute 0 and every one came back.
A dip that does not recover is the deploy; a dip that recovers is the cache.
`,
  },

  keyPoints: [
    "Watch five signals for ten minutes after every deploy: edge 5xx rate (the only one that sees requests PHP never handled), application error rate, cache hit ratio, p95 latency and queue depth.",
    "A Drupal deploy rebuilds caches, so a cache hit ratio collapse at minute zero is expected — the recovery curve is the signal. A ratio that plateaus means you shipped a new cache context, a constantly-invalidated tag, or a max-age of 0; X-Drupal-Cache and X-Drupal-Dynamic-Cache tell you which routes.",
    "drush core:requirements (aliases status-report, rq) is /admin/reports/status in machine-readable form, with --severity, --ignore and --format so a deploy script can gate on it.",
    "The four status-report items that matter post-deploy: pending database updates, mismatched entity/field definitions, cron last run (the system.cron_last state key), and unwritable file system or config sync directories.",
    "drush updatedb:status and drush config:status both returning nothing is the strongest single proof that code, schema and config/sync agree on that box.",
    "Alert relative to a pre-deploy baseline over a short window, not on generic uptime, and emit a release marker (SHA, who, when, which update hooks, config diff) into both your metrics system and your log stream so 'what changed?' is answerable in seconds.",
  ],

  interview: [
    {
      q: "You deploy to production on a Friday afternoon and the pipeline goes green. What do you actually do for the next ten minutes?",
      a: `I watch, in this order. First the edge 5xx rate, because the load balancer sees requests that never reached PHP — a fatal in an update hook produces a white screen that may never land in \`dblog\`. Then the application error stream, \`drush watchdog:show --severity-min=Error\` or the aggregated equivalent, compared against the pre-deploy rate rather than against zero. Then the cache hit ratio, which I expect to collapse because \`drush deploy\` rebuilt caches, and which I expect to climb back within a few minutes — if it plateaus, something I shipped made a hot route uncacheable. Alongside that I run \`drush updatedb:status\` and \`drush config:status\` and want both empty, and I check \`drush core:requirements --severity=1\` for pending updates or mismatched entity definitions. Finally queue depth and \`system.cron_last\`, because background work failing is silent from the outside.`,
    },
    {
      q: "Why is 'cache hit ratio dropped after the deploy' not automatically an incident, and when does it become one?",
      a: `Because a Drupal deploy destroys the cache by design — \`drush deploy\` rebuilds caches after the config import, so the internal page cache and dynamic page cache start empty and every early request is a MISS. The ratio dropping to near zero at minute zero is the expected shape. It becomes an incident when the recovery stalls: the ratio climbs but plateaus well below baseline, or \`X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)\` starts appearing on routes where it used to say HIT. That almost always means the release added a high-cardinality cache context (session or user), a cache tag that something invalidates on every request, or a max-age of 0 on a block or render array. So the alert rule has to be written with a long enough window and a low enough floor to sit under the expected dip, and to fire on failure to recover rather than on the dip itself.`,
    },
    {
      q: "What does Drupal's status report give you that your APM does not, and how do you use it in a pipeline?",
      a: `The APM tells you the site is slow or throwing; the status report tells you *why* in Drupal's own terms — pending \`hook_update_N\`, mismatched entity and field definitions, cron not having run, an unwritable files or config sync directory, a missing PHP extension, an out-of-date module with a security advisory. None of that shows up as a metric until it causes a failure. In a pipeline I use \`drush core:requirements --severity=1 --format=json\`, ignore the items that are noisy in that environment with \`--ignore\`, and fail the deploy job if anything at error severity remains. It is the same instinct as running \`doctrine:schema:validate\` after a Symfony deploy: assert that the runtime agrees with what you just shipped, rather than waiting for traffic to discover it.`,
    },
    {
      q: "Your team of four ships weekly and someone asks 'what changed at 14:07 yesterday?'. How is that answerable?",
      a: `Only if the deploy wrote a record at the time. I have the deploy script capture \`drush updatedb:status\` and \`drush config:status\` *before* running \`drush deploy\` — afterwards both are empty and the evidence is gone — then, after a successful deploy, push three things: a Grafana or Datadog annotation so every graph gets a labelled vertical line, a line in a committed \`deploy-log.md\` with the SHA, the author, the commit range, the update hooks that ran and the config items that changed, and a \`\\Drupal::logger('deploy')->notice()\` entry so the release marker sits inline with the errors in the log aggregator. I also \`drush state:set deploy.release\` so anyone in the admin UI can see which build they are looking at — state rather than config, deliberately, because state is per-environment and will never get exported into \`config/sync\`.`,
    },
  ],

  quiz: [
    {
      question:
        "Five minutes after a deploy, the anonymous cache hit ratio has recovered from 5% to 91% (baseline 94%), but p95 latency is still 4x baseline and climbing. What is the most likely story?",
      options: [
        "Normal post-deploy cache warming; wait another five minutes",
        "Something other than the cache is slow — the cache recovered, so look at the database, a queue worker saturating the box, or a slow external call added by this release",
        "The CDN is misconfigured and bypassing Drupal",
        "drush deploy did not run cache:rebuild",
      ],
      answerIndex: 1,
      explain:
        "Cache warming and latency move together: if the ratio is back near baseline, cache misses can no longer explain the latency. A p95 that is still climbing while cache hits are healthy points at something the release changed underneath — an unindexed query in an update hook, a queue worker eating CPU, or a new synchronous HTTP call. The two signals decoupling is exactly the information the pair gives you.",
    },
    {
      question:
        "Which command gives you the status report data in a form a deploy script can gate on?",
      options: [
        "drush status",
        "drush core:requirements (aliases status-report, rq), with --severity and --format",
        "drush watchdog:show --severity-min=Error",
        "drush config:status --format=json",
      ],
      answerIndex: 1,
      explain:
        "drush core:requirements is the CLI equivalent of /admin/reports/status; --severity filters to warnings or errors, --ignore drops items that are noise in that environment, and --format=json makes it scriptable. drush status reports environment facts (Drupal version, DB connection, paths), watchdog:show reports log records, and config:status reports config drift — all useful, but none of them is the requirements report.",
    },
    {
      question:
        "Your deploy script runs drush deploy and then records what changed. Why must it capture 'drush updatedb:status' and 'drush config:status' BEFORE the deploy rather than after?",
      options: [
        "Those commands are not available once the site is in maintenance mode",
        "After a successful deploy both are empty by definition, so the record of what the deploy actually did no longer exists",
        "Running them after the deploy rewrites the active configuration",
        "They both require a database connection that drush deploy closes",
      ],
      answerIndex: 1,
      explain:
        "A successful deploy is precisely the state in which there are no pending updates and no config drift, so running the commands afterwards produces empty output every time. Capturing them beforehand is what turns the deploy log from 'we deployed abc123' into 'we deployed abc123, which ran two update hooks and changed these six config items' — the difference between a timestamp and an actual answer to 'what changed?'.",
    },
    {
      question:
        "Why is dblog a poor primary log store for a production Drupal site behind a load balancer, even though it is the one with the nice admin UI?",
      options: [
        "dblog cannot record errors at Critical severity or above",
        "dblog writes every record into the watchdog table in the same database serving pages, so an error burst becomes a write storm — and it is per-database, not per-fleet, aggregated view",
        "dblog is removed from Drupal core in version 11",
        "dblog only retains records for the current request",
      ],
      answerIndex: 1,
      explain:
        "dblog stores records in the watchdog table of your live database, so a flood of PHP warnings after a bad deploy adds write load exactly when the site is already struggling, and the table only gets trimmed to dblog.settings row_limit on cron. The usual pattern is to keep dblog installed for the admin UI with a sane row limit, enable the core syslog module (or contrib monolog) to ship records off the box, and do the real searching and alerting in an aggregator that sees every web node at once.",
    },
  ],
};

export default lesson;
