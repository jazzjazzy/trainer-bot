import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "cron-queues-batch-performance",
  title: "Background Work at Scale: Cron, Queues & Batch",
  part: "Data, Queries & Runtime",
  estMinutes: 13,
  summary:
    "Push heavy work off the request path with queues, understand the cron time budget that throttles them, run workers outside cron, keep long-running PHP from eating all your memory, and treat queue depth as a first-class operational signal.",

  concept: `
## Drupal pulls; Symfony pushes

Symfony Messenger has a daemon: \`bin/console messenger:consume async\` runs
forever under systemd or supervisor, blocking on a transport, and work starts
the moment it is dispatched. Drupal core has no daemon. Cron is a *pull* model —
something outside Drupal (a system crontab running \`drush cron\`, or the
\`automated_cron\` module firing on a web request after
\`automated_cron.settings: interval\`, default 10800s) says "go", Drupal runs every
\`hook_cron()\` implementation, then drains queues. That structural difference is
the source of nearly every background-work performance problem on a Drupal site.

## hook_cron enqueues; it never processes

The first rule: \`hook_cron()\` should be cheap and finite. It identifies work and
calls \`\\Drupal::queue('my_queue')->createItem(\$data)\`. It must not loop over
5,000 nodes doing HTTP calls, because \`Cron::run()\` holds a single \`cron\` lock
for 900 seconds and calls \`Environment::setTimeLimit(240)\` — a slow
\`hook_cron()\` blocks every other module's cron *and* every queue behind it.

## The cron time budget is also the lease

Look at what \`Cron::processQueue()\` actually does:

\`\`\`php
\$lease_time = \$worker->getPluginDefinition()['cron']['time'];
\$end = \$this->time->getCurrentTime() + \$lease_time;
while (\$this->time->getCurrentTime() < \$end && (\$item = \$queue->claimItem(\$lease_time))) {
  \$worker->processItem(\$item->data);
  \$queue->deleteItem(\$item);
}
\`\`\`

One number does two jobs. \`cron: {time: 60}\` means "spend at most 60 seconds in
this queue per cron run" *and* "lease each claimed item for 60 seconds". If an
item genuinely takes 90 seconds, the lease expires mid-processing and another
worker can claim the same item — so make \`time\` comfortably longer than one
item, and size throughput by *how often cron runs*, not by the budget alone.
Queues with no \`cron\` key in their definition are never touched by cron at all.

Three exceptions steer the loop: \`RequeueException\` (release this item, retry
now), \`DelayedRequeueException\` (added in Drupal 9.1 — hold this one item back
without noise; \`DatabaseQueue\` implements \`DelayableQueueInterface\`), and
\`SuspendQueueException\` (the remote API is down — abandon this queue for the
run; a delay shorter than the \`queue.config: suspendMaximumWait\` parameter,
30s by default, lets cron come back to it later in the same run).

## Get the workers out of cron

For real throughput, stop using cron as the runner:

\`\`\`bash
drush queue:run incident_reindex --time-limit=290 --items-limit=500 --lease-time=600
drush queue:list                      # Queue / Items / Class - your depth gauge
\`\`\`

Run several in parallel. \`DatabaseQueue::claimItem()\` is a single
\`UPDATE {queue} SET expire = :now + :lease WHERE item_id = :id AND expire = 0\`,
so exactly one process wins each row — no extra locking needed.

## Memory, batch and migrations

Long-running PHP accumulates. Entity storage keeps a static cache, so a worker
that loads 100k nodes never frees them: call \`\$storage->resetCache()\` (or
\`resetCache(\$ids)\`) periodically, and chunk with \`loadMultiple()\` over
\`array_chunk()\` rather than looping one-by-one.

The **Batch API** is the interactive cousin: a long operation split across HTTP
requests, driven by \`BatchBuilder\` and the \`\$context['sandbox']\` pattern —
you store \`progress\`, \`max\` and \`current_id\` in the sandbox and set
\`\$context['finished']\` to a fraction, and each chunk is a fresh PHP process
with fresh memory.

Migrations are the slowest thing you will ever run. With \`migrate_tools\`:
\`drush mim my_migration --feedback=1000 --limit=5000\` gives you progress and a
resumable slice; \`drush mr\` rolls back, and rollback is roughly as expensive as
the import because it deletes entities one at a time.
`,

  comparisons: [
    {
      label: "The write path: dispatch vs enqueue",
      intro:
        "A published incident must be pushed to a search index and a partner API. Neither stack should do that inside the save request — but Symfony's message is picked up in milliseconds, and Drupal's queue item waits for the next cron or queue:run.",
      php: `<?php
// Symfony: dispatch on the domain event. A consumer daemon is already
// blocking on the transport, so latency is milliseconds.
use Symfony\\Component\\Messenger\\MessageBusInterface;

final class IncidentPublishedListener
{
    public function __construct(private MessageBusInterface $bus) {}

    public function __invoke(IncidentPublished $event): void
    {
        $this->bus->dispatch(new ReindexIncident($event->getId()));
        $this->bus->dispatch(new NotifyPartnerApi($event->getId()));
    }
}

// config/packages/messenger.yaml
//   framework:
//     messenger:
//       transports:
//         async: '%env(MESSENGER_TRANSPORT_DSN)%'
//       routing:
//         'App\\Message\\ReindexIncident': async`,
      ts: `<?php
// Drupal: hook_cron() finds work and ENQUEUES it. It must stay finite -
// Cron::run() holds one 'cron' lock for the whole run.
function incident_ops_cron(): void {
  $state = \\Drupal::state();
  $last = $state->get('incident_ops.last_run', 0);

  // Bounded query. Never "load every node and process it here".
  $nids = \\Drupal::entityQuery('node')
    ->accessCheck(FALSE)
    ->condition('type', 'incident')
    ->condition('changed', $last, '>')
    ->sort('changed')
    ->range(0, 500)
    ->execute();

  $queue = \\Drupal::queue('incident_reindex');
  foreach ($nids as $nid) {
    // Queue the ID, not the loaded entity: item data is serialised into
    // the {queue} table and a serialised node is huge and stale-prone.
    $queue->createItem(['nid' => (int) $nid]);
  }

  // Move the watermark to the last item we actually ENQUEUED, never to the
  // request time. The slice is capped at 500 and sorted by 'changed', so
  // jumping to "now" would silently skip node 501 onwards forever.
  if ($nids) {
    $storage = \\Drupal::entityTypeManager()->getStorage('node');
    $newest = $storage->load((int) end($nids));
    $state->set('incident_ops.last_run', $newest->getChangedTime());
  }
}`,
      note: "Queue the smallest identifier that lets the worker re-derive state. A serialised entity in {queue} is both a storage cost and a correctness bug when the entity changes before the item is claimed. And when a bounded slice meets a watermark, advance the watermark to the last row you enqueued — advancing it to the request time drops everything the slice did not reach. (Strictly, `changed > $last` can still lose a row whose timestamp ties the slice boundary; use `>=` and an idempotent worker if one-second ties matter.)",
    },
    {
      label: "The worker, and how it signals trouble",
      intro:
        "Both sides implement one method. The interesting part is the failure vocabulary: Messenger has retry strategies and a failure transport; Drupal has three exceptions that the cron loop understands.",
      php: `<?php
// Symfony: the handler. Retries/backoff are transport config, not code.
use Symfony\\Component\\Messenger\\Attribute\\AsMessageHandler;
use Symfony\\Component\\Messenger\\Exception\\RecoverableMessageHandlingException;
use Symfony\\Component\\Messenger\\Exception\\UnrecoverableMessageHandlingException;

#[AsMessageHandler]
final class ReindexIncidentHandler
{
    public function __construct(private SearchClient $search) {}

    public function __invoke(ReindexIncident $message): void
    {
        try {
            $this->search->index($message->getId());
        } catch (SearchUnavailable $e) {
            // Retried with the transport's backoff, then sent to failed.
            throw new RecoverableMessageHandlingException('index down', 0, $e);
        } catch (InvalidDocument $e) {
            // Never retry this one.
            throw new UnrecoverableMessageHandlingException('bad doc', 0, $e);
        }
    }
}

# messenger.yaml: retry_strategy: { max_retries: 3, delay: 1000, multiplier: 2 }
# failure_transport: failed`,
      ts: `<?php
// Drupal 10.3+/11: the PHP attribute form. (@QueueWorker annotation still
// works and is what most Drupal 10 code looks like.)
namespace Drupal\\incident_ops\\Plugin\\QueueWorker;

use Drupal\\Core\\Queue\\Attribute\\QueueWorker;
use Drupal\\Core\\Queue\\QueueWorkerBase;
use Drupal\\Core\\Queue\\DelayedRequeueException;
use Drupal\\Core\\Queue\\SuspendQueueException;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup;

#[QueueWorker(
  id: 'incident_reindex',
  title: new TranslatableMarkup('Incident reindex'),
  // Time budget for this queue per cron run AND the per-item lease.
  // Omit 'cron' entirely and cron will never touch this queue.
  cron: ['time' => 60],
)]
final class IncidentReindex extends QueueWorkerBase {

  public function processItem($data): void {
    try {
      $this->search->index($data['nid']);
    }
    catch (SearchRateLimited $e) {
      // Hold THIS item back ~30s; no error log, no infinite loop.
      // Since Drupal 9.1; DatabaseQueue implements DelayableQueueInterface.
      throw new DelayedRequeueException(30);
    }
    catch (SearchUnavailable $e) {
      // The whole queue is pointless right now. Release the item and skip
      // this queue for the run. A delay under queue.config
      // suspendMaximumWait (30.0 by default) lets cron retry in-run.
      throw new SuspendQueueException('search cluster down', 0, $e, 10.0);
    }
    // Any other exception: logged, item LEFT in the queue, retried later.
  }

}`,
      note: "Drupal has no dead-letter queue. An item that always throws is claimed, logged and retried forever — you own poison-message handling yourself (a retry counter in the item data, or catching and dropping).",
    },
    {
      label: "Running the workers",
      intro:
        "This is where the throughput actually comes from. Symfony scales by adding consumer processes; Drupal scales by taking the queue off cron and running drush queue:run in parallel.",
      php: `# Symfony: a supervised, long-lived consumer. Scale = more processes.
# /etc/supervisor/conf.d/messenger.conf
#   [program:messenger-consume]
#   command=php /srv/app/bin/console messenger:consume async \\
#           --time-limit=3600 --memory-limit=128M --limit=1000
#   numprocs=4
#   process_name=%(program_name)s_%(process_num)02d
#   autorestart=true

bin/console messenger:consume async -vv
bin/console messenger:stats            # depth per transport
bin/console messenger:failed:show      # the dead-letter queue
bin/console messenger:failed:retry

# --time-limit / --memory-limit exist purely so a leaking PHP process is
# recycled by the supervisor rather than growing forever.`,
      ts: `# Drupal: cron is the default runner and it is the slow one.
drush cron                             # hook_cron + every queue with a cron key

# Take the hot queue off cron (drop 'cron' from the attribute) and run it
# from a systemd timer or crontab, once a minute:
drush queue:run incident_reindex \\
  --time-limit=290 \\
  --items-limit=500 \\
  --lease-time=600

# Parallelism is safe with no extra work. DatabaseQueue::claimItem() does
#   UPDATE {queue} SET expire = :now + :lease
#   WHERE item_id = :id AND expire = 0
# so exactly one process wins each row.
for i in 1 2 3 4; do
  drush queue:run incident_reindex --time-limit=290 &
done
wait

# Depth is your alert signal - graph it, do not eyeball it.
drush queue:list --format=json         # Queue / Items / Class
drush sql:query "SELECT name, COUNT(*) c FROM queue GROUP BY name ORDER BY c DESC"

# Migrations: the slowest job you will ever run. Feedback + slices.
drush migrate:import incident_legacy --feedback=1000 --limit=5000
drush migrate:status  --format=table   # ms  - Total / Imported / Unprocessed
drush migrate:rollback incident_legacy --feedback=1000
drush migrate:reset-status incident_legacy   # after a killed run left it 'Importing'`,
      note: "--lease-time on queue:run defaults to the worker's cron time (or 30s). Set it longer than your slowest item or a second worker will claim a job that is still running.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Long interactive operations and memory",
      intro:
        "An editor clicks 'rebuild 80,000 incident summaries' in the UI. Symfony would hand it to a console command or a message; Drupal has Batch API, which slices the work across successive HTTP requests so each chunk gets a fresh PHP process.",
      php: `<?php
// Symfony: a console command with a progress bar. The memory discipline is
// explicit - clear Doctrine's identity map or it retains every entity.
final class RebuildSummariesCommand extends Command
{
    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        $repo  = $this->em->getRepository(Incident::class);
        $total = $repo->count([]);
        $bar   = new ProgressBar($out, $total);

        for ($offset = 0; $offset < $total; $offset += 100) {
            foreach ($repo->findBy([], ['id' => 'ASC'], 100, $offset) as $incident) {
                $incident->rebuildSummary();
            }
            $this->em->flush();
            // Without this the identity map grows until the OOM killer wins.
            $this->em->clear();
            $bar->advance(100);
        }

        $bar->finish();
        return Command::SUCCESS;
    }
}`,
      ts: `<?php
// Drupal: BatchBuilder + the $context['sandbox'] pattern.
use Drupal\\Core\\Batch\\BatchBuilder;

function incident_ops_rebuild_start(): void {
  $batch = (new BatchBuilder())
    ->setTitle(t('Rebuilding incident summaries'))
    ->setInitMessage(t('Counting incidents...'))
    ->setProgressMessage(t('Processed @current of @total.'))
    ->setFinishCallback('incident_ops_rebuild_finished')
    ->addOperation('incident_ops_rebuild_chunk', []);
  batch_set($batch->toArray());
}

function incident_ops_rebuild_chunk(array &$context): void {
  $storage = \\Drupal::entityTypeManager()->getStorage('node');

  // sandbox survives between chunks; each chunk is a NEW php request.
  if (!isset($context['sandbox']['max'])) {
    $context['sandbox']['progress'] = 0;
    $context['sandbox']['current_id'] = 0;
    $context['sandbox']['max'] = (int) \\Drupal::entityQuery('node')
      ->accessCheck(FALSE)->condition('type', 'incident')->count()->execute();
  }

  $nids = \\Drupal::entityQuery('node')
    ->accessCheck(FALSE)
    ->condition('type', 'incident')
    ->condition('nid', $context['sandbox']['current_id'], '>')
    ->sort('nid')
    ->range(0, 50)
    ->execute();

  // Batched load, not 50 separate load() calls.
  foreach ($storage->loadMultiple($nids) as $nid => $node) {
    incident_ops_rebuild_summary($node);
    $context['sandbox']['progress']++;
    $context['sandbox']['current_id'] = $nid;
  }

  // The bit people forget: entity storage keeps a static cache. In a
  // long-running drush/queue loop this is what eats the memory limit.
  $storage->resetCache($nids);

  $context['message'] = t('Rebuilt @n incidents.', ['@n' => $context['sandbox']['progress']]);
  $context['finished'] = $context['sandbox']['max'] === 0
    ? 1
    : $context['sandbox']['progress'] / $context['sandbox']['max'];
}`,
      note: "$context['finished'] is a fraction, not a boolean: anything < 1 means 'call me again'. Forgetting to advance current_id gives you an infinite batch that re-processes the same 50 rows forever.",
    },
  ],

  playground: {
    intro:
      "A model of Cron::processQueue() sitting on DatabaseQueue::claimItem(). Predict the numbers first: with a 60-second budget and 4 seconds per item, how far does one cron run get through a 40-item backlog — and what happens to depth when the site enqueues 30 items an hour?",
    lang: "php",
    code: `<?php
// A model of Drupal\\Core\\Cron::processQueue() sitting on top of
// DatabaseQueue::claimItem(). No Drupal - just the mechanism.

// The {queue} table: item_id => ['expire' => int, 'data' => mixed].
// expire === 0 means "available"; anything else is a lease deadline.
$queue = [];
for ($i = 1; $i <= 40; $i++) {
  $queue[$i] = ['expire' => 0, 'data' => 'incident:' . $i];
}

// DatabaseQueue::claimItem() is one atomic statement:
//   UPDATE queue SET expire = :now + :lease
//   WHERE item_id = :id AND expire = 0
// Only one worker can win that row - that is the whole locking story.
function claimItem(array &$queue, int $now, int $lease): ?int {
  foreach ($queue as $id => $item) {
    if ($item['expire'] === 0 || $item['expire'] <= $now) {
      $queue[$id]['expire'] = $now + $lease;
      return $id;
    }
  }
  return NULL;
}

// Cron::processQueue(): the plugin's cron.time is BOTH the time budget
// and the lease time. One number, two jobs.
function processQueue(array &$queue, int &$now, int $cronTime, int $secsPerItem): array {
  $end = $now + $cronTime;
  $claimed = [];
  while ($now < $end && ($id = claimItem($queue, $now, $cronTime)) !== NULL) {
    $now += $secsPerItem;        // processItem()
    unset($queue[$id]);          // deleteItem()
    $claimed[] = $id;
  }
  return $claimed;
}

$now = 1000;
$before = count($queue);
$done = processQueue($queue, $now, 60, 4);
echo "-- one cron run, cron: {time: 60}, 4s per item --\\n";
printf("backlog before : %d\\n", $before);
printf("items processed: %d\\n", count($done));
printf("backlog after  : %d\\n", count($queue));
printf("clock advanced : %ds (budget was 60s)\\n", $now - 1000);

echo "\\n-- backlog math, hourly cron --\\n";
$backlog = 0;
foreach ([1, 2, 3, 4] as $hour) {
  $backlog += 30;                       // hook_cron enqueues 30/hour
  $drained = min($backlog, 15);         // 60s budget / 4s = 15 items
  $backlog -= $drained;
  printf("hour %d: +30 enqueued, -%d drained, depth = %d\\n", $hour, $drained, $backlog);
}
echo "A depth that climbs every cycle is an operational signal, not a later bug.\\n";

echo "\\n-- drush queue:run x3 in parallel, the lease keeps them apart --\\n";
$queue = [];
for ($i = 1; $i <= 9; $i++) {
  $queue[$i] = ['expire' => 0, 'data' => 'incident:' . $i];
}
$clock = 2000;
$got = [1 => [], 2 => [], 3 => []];
while (count($queue) > 0) {
  foreach ([1, 2, 3] as $worker) {
    $id = claimItem($queue, $clock, 300);
    if ($id === NULL) {
      continue;
    }
    $got[$worker][] = $id;
    unset($queue[$id]);
  }
  $clock += 5;
}
foreach ($got as $worker => $ids) {
  printf("worker %d claimed: %s\\n", $worker, implode(', ', $ids));
}
$all = array_merge(...array_values($got));
printf("total claims %d, distinct items %d -> nothing processed twice\\n", count($all), count(array_unique($all)));

echo "\\n-- memory: the entity static cache in a long-running worker --\\n";
$static = 0;
$peak = 0;
foreach (range(1, 500) as $n) {
  $static++;                             // $storage->load() keeps the entity
  $peak = max($peak, $static);
}
printf("never reset   : static cache peaks at %d entities\\n", $peak);

$static = 0;
$peak = 0;
foreach (range(1, 500) as $n) {
  $static++;
  $peak = max($peak, $static);
  if ($n % 50 === 0) {
    $static = 0;                         // $storage->resetCache()
  }
}
printf("reset every 50: static cache peaks at %d entities\\n", $peak);
`,
    output: `-- one cron run, cron: {time: 60}, 4s per item --
backlog before : 40
items processed: 15
backlog after  : 25
clock advanced : 60s (budget was 60s)

-- backlog math, hourly cron --
hour 1: +30 enqueued, -15 drained, depth = 15
hour 2: +30 enqueued, -15 drained, depth = 30
hour 3: +30 enqueued, -15 drained, depth = 45
hour 4: +30 enqueued, -15 drained, depth = 60
A depth that climbs every cycle is an operational signal, not a later bug.

-- drush queue:run x3 in parallel, the lease keeps them apart --
worker 1 claimed: 1, 4, 7
worker 2 claimed: 2, 5, 8
worker 3 claimed: 3, 6, 9
total claims 9, distinct items 9 -> nothing processed twice

-- memory: the entity static cache in a long-running worker --
never reset   : static cache peaks at 500 entities
reset every 50: static cache peaks at 50 entities
`,
  },

  keyPoints: [
    "hook_cron() should identify work and call queue()->createItem() with a small identifier — never do the work inline. Cron::run() holds a single 'cron' lock for 900s and calls Environment::setTimeLimit(240), so one slow hook starves every other module and every queue.",
    "A QueueWorker's cron time is both the per-run time budget and the per-item lease: Cron::processQueue() does $end = now + cron.time and claims each item with claimItem(cron.time). Set it longer than your slowest single item, or a second worker can claim a job still in flight.",
    "Throughput comes from taking the queue off cron: drop the cron key and run drush queue:run <name> --time-limit --items-limit --lease-time from a systemd timer, several in parallel. DatabaseQueue::claimItem()'s UPDATE ... WHERE expire = 0 makes parallelism safe with no extra locking.",
    "Three exceptions steer the cron loop: RequeueException (release and retry now), DelayedRequeueException (since Drupal 9.1 — hold one item back quietly), SuspendQueueException (skip this queue for the run; a delay below the queue.config suspendMaximumWait parameter, 30.0 by default, lets cron return to it in the same run).",
    "Long-running PHP accumulates: entity storage's static cache grows with every load(), so call $storage->resetCache($ids) per chunk and use loadMultiple() over array_chunk() instead of one load() per row.",
    "Batch API is the interactive equivalent — BatchBuilder plus $context['sandbox'] (progress, max, current_id) and $context['finished'] as a fraction, with each chunk running in a fresh request. Migrations are the slowest job you will run: use drush mim --feedback=N --limit=N, and remember rollback costs about as much as the import.",
  ],

  interview: [
    {
      q: "A queue on our news site keeps growing even though cron runs every 5 minutes. Walk me through diagnosing it.",
      a: "First I'd get the depth trend, not a snapshot: `drush queue:list` or a `SELECT name, COUNT(*) FROM queue GROUP BY name` graphed over time tells me whether it's growing linearly (throughput deficit) or spiking (a burst). Then I'd do the arithmetic — `Cron::processQueue()` gives each queue only `cron.time` seconds per run, so a `time` of 60 with 4-second items drains 15 items per run no matter how big the backlog is. If the site enqueues faster than that, cron will never catch up, and raising `cron.time` just makes cron runs long enough to overlap and hit the 900-second `cron` lock. The real fix is to drop the `cron` key from the worker and run `drush queue:run <name> --time-limit=290 --items-limit=500` from a per-minute systemd timer, several in parallel — `DatabaseQueue::claimItem()`'s `UPDATE ... WHERE expire = 0` guarantees no two workers get the same item. I'd also check for a poison item: Drupal has no dead-letter queue, so one permanently failing item is logged and retried forever and can dominate the loop.",
    },
    {
      q: "You're coming from Symfony Messenger. What actually has to change in your mental model for Drupal?",
      a: "The big one is push versus pull. Messenger has a resident consumer blocked on a transport, so a dispatched message is handled within milliseconds and you scale by adding processes under supervisor. Drupal core has no daemon: work sits in the `{queue}` table until an external trigger — a crontab running `drush cron`, or `automated_cron` firing on a web request — pulls it, so your baseline latency is the cron interval, not milliseconds. Second, the failure vocabulary is thinner: Messenger gives you retry strategies, backoff multipliers and a failure transport out of the box, while Drupal gives you `RequeueException`, `DelayedRequeueException` and `SuspendQueueException` and no dead-letter concept, so retry counting and poison-message handling are yours to write. Third, each queue gets its own `cron.time` budget per cron run — that per-queue time slice, which doubles as the item lease, has no Messenger equivalent; the only run-wide ceiling is the 900-second `cron` lock. The practical answer on a busy site is to make Drupal look more like Messenger: take the hot queues off cron and run supervised `drush queue:run` processes.",
    },
    {
      q: "Why does a long-running Drupal process run out of memory, and what do you do about it?",
      a: "Entity storage keeps a static cache keyed by ID — `EntityStorageBase` holds every entity you load for the lifetime of the request. In a web request that's a win; in a `drush` command, queue worker or migration that touches 100,000 nodes it is an unbounded leak, and the same is true of any `drupal_static()` registry and of the database log if `dblog` is capturing chatter. The fix is chunking plus explicit resets: iterate IDs with `array_chunk()`, use `loadMultiple()` per chunk instead of one `load()` per row, and call `$storage->resetCache($ids)` at the end of each chunk. Batch API dodges the problem differently — every chunk is a brand-new HTTP request, so memory resets for free, which is exactly why the `$context['sandbox']` array exists rather than a closure over state. For a truly long-lived worker I'd also recycle the process on a schedule, the same reason Symfony's `messenger:consume` has `--memory-limit` and `--time-limit`.",
    },
    {
      q: "The client wants a legacy import of 800,000 nodes to run in a maintenance window. How do you approach it?",
      a: "A migration is almost always the slowest thing you'll ever run on a Drupal site, because every row goes through source plugin, process pipeline, entity save, field storage writes and the map table — and entity save fires hooks, invalidates cache tags and updates search indexes. I'd never run it as one command: `drush migrate:import <id> --feedback=1000` so I get progress and a rate I can extrapolate from, and `--limit=5000` to run resumable slices I can stop and restart. Before the window I'd measure a slice to get items/second, then decide whether the window is even feasible or whether we need to run it incrementally against a live site. I'd also plan the abort path: `drush migrate:rollback` deletes destination entities one at a time and costs roughly as much as the import, so \"just roll it back\" is not a cheap escape hatch, and a killed run leaves the migration stuck in 'Importing' until `drush migrate:reset-status`. Disabling search indexing and any expensive contributed hooks during the import, then reindexing once at the end, is usually the single biggest win.",
    },
  ],

  quiz: [
    {
      question:
        "In a QueueWorker plugin definition, what does `cron: ['time' => 60]` control?",
      options: [
        "How often cron runs this queue, in seconds",
        "Both the maximum seconds cron spends on this queue per run and the lease time given to each claimed item",
        "The maximum number of items processed per cron run",
        "The PHP max_execution_time set before the worker runs",
      ],
      answerIndex: 1,
      explain:
        "Cron::processQueue() reads $lease_time = $worker->getPluginDefinition()['cron']['time'], sets $end = now + $lease_time as the loop budget, and passes the same value to $queue->claimItem($lease_time). One number, two jobs — which is why a value shorter than your slowest item lets a second worker claim a job that is still running.",
    },
    {
      question:
        "Your queue worker calls a partner API that has just gone down. Which exception should processItem() throw?",
      options: [
        "RequeueException, so the item is released and retried immediately",
        "DelayedRequeueException, so this one item is held back",
        "SuspendQueueException, so the item is released and cron abandons this queue for the run",
        "A plain \\RuntimeException, so the failure is logged",
      ],
      answerIndex: 2,
      explain:
        "SuspendQueueException means 'every remaining item in this queue will fail for the same reason'. Cron::processQueue() releases the current item, logs a debug message and rethrows so processQueues() skips to the next queue. If you pass a delay shorter than the queue.config suspendMaximumWait parameter (30.0 by default), cron re-queues that queue and comes back to it later in the same run.",
    },
    {
      question:
        "Why is it safe to run four `drush queue:run same_queue` processes in parallel against the default database queue?",
      options: [
        "Drush acquires a named lock per queue, so only one process actually works at a time",
        "claimItem() runs UPDATE {queue} SET expire = :now + :lease WHERE item_id = :id AND expire = 0, so only one process can win each row",
        "Each process gets its own copy of the queue table",
        "It isn't safe — items will be processed multiple times",
      ],
      answerIndex: 1,
      explain:
        "DatabaseQueue::claimItem() selects a candidate then does a conditional UPDATE guarded by expire = 0. Only one process's UPDATE affects a row; the losers loop and pick another item. The correctness requirement is on your side: the lease must outlive the slowest processItem(), or an expired lease makes the item claimable again while it is still being processed.",
    },
    {
      question:
        "In a Batch API operation, what does setting `$context['finished'] = 0.5` mean?",
      options: [
        "Half the items failed",
        "The batch is 50% through and should be called again",
        "The operation should sleep for half a second",
        "50% of the memory limit has been used",
      ],
      answerIndex: 1,
      explain:
        "$context['finished'] is a completion fraction, not a boolean: any value below 1 tells the batch runner to call the operation again in a fresh request. You track position in $context['sandbox'] (progress, max, current_id) because each chunk is a separate PHP process — and if you forget to advance current_id you get an infinite batch that reprocesses the same rows forever.",
    },
  ],
};

export default lesson;
