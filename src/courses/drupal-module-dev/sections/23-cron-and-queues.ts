import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "cron-and-queues",
  title: "Cron: hook_cron & the Queue API",
  part: "Data, State & Background Work",
  estMinutes: 12,
  summary:
    "incident_tracker's cron hook finds stale incidents and queues escalation notifications instead of sending them inline — hook_cron stays fast, a QueueWorker plugin drains the queue with retry semantics, and the State API remembers when we last checked.",

  concept: `
## One heartbeat, many modules

In Symfony you own the process model: a crontab line per console command, or
the Scheduler component ticking messages onto Messenger. Drupal inverts that.
There is **one shared cron heartbeat** for the whole site: when a cron run
fires, core invokes \`hook_cron\` on **every** enabled module — core's file
cleanup, search indexing, and our \`incident_tracker_cron()\` all share the
same pass. You get recurring work with zero infrastructure of your own, but
you also share one PHP process and its time limit with everyone else.

That forces the golden rule: **hook_cron must be fast**. Don't do the work —
**queue** the work:

\`\`\`php
\\Drupal::queue('incident_tracker_notify')
  ->createItem(['nid' => $nid, 'reason' => 'stale_24h']);
\`\`\`

Also note \`hook_cron\` has **no schedule of its own** — it runs on every
pass, whether that is every 5 minutes or once an hour. Frequency control is
yours: store a last-run timestamp with the **State API**
(\`\\Drupal::state()->get('incident_tracker.last_escalation', 0)\`) and bail
out early. State is per-environment key/value storage in the database — never
exported like config, which is exactly right for timestamps. Core itself
records \`system.cron_last\` there. On Drupal 11.1+ the hook can live as a
\`#[Hook('cron')]\` method in our hook class from section 11.

### The Queue API lifecycle

\`\\Drupal::queue($name)\` hands you a \`QueueInterface\` from the queue
factory; \`createQueue()\` provisions backend storage if needed (a no-op for
the database backend). The consumer contract:

- \`claimItem($lease_time)\` — atomically **lease** an item; while leased it
  is invisible to other consumers.
- \`deleteItem($item)\` — success: gone forever.
- \`releaseItem($item)\` — give it back for immediate retry.
- Worker throws a plain exception — the item **stays claimed until the lease
  expires**, then becomes claimable again: automatic retry, no lost work.
- \`SuspendQueueException\` — "the mail gateway is down, stop draining this
  whole queue for now"; \`RequeueException\` releases just that item;
  \`DelayedRequeueException($delay)\` re-queues the item after a chosen delay
  via \`delayItem()\` on backends implementing \`DelayableQueueInterface\`
  (the default database queue does); on backends that don't, the item simply
  stays locked until the lease expires.

The worker is a **QueueWorker plugin** in \`src/Plugin/QueueWorker\` whose id
**must equal the queue name**. Declaring \`cron: ['time' => 30]\` makes cron
drain the queue for up to 30 seconds each pass, right after all the
\`hook_cron\` implementations. Omit it and the queue only drains when you say
so (\`drush queue:run\`).

### Reliable vs best-effort

\`\\Drupal::queue($name, TRUE)\` requests a backend implementing
\`ReliableQueueInterface\` — FIFO order and guaranteed delivery. The default
backend \`queue.database\` is reliable; \`queue.memory\` lives only for the
request. settings.php can remap one queue to another backend (e.g. Redis from
contrib) via \`$settings['queue_service_incident_tracker_notify']\`.

### Who pulls the trigger?

- \`drush cron\` — local dev, CI, and most production crontabs.
- System cron curl-ing \`/cron/{key}\` — the key is shown at
  \`/admin/config/system/cron\` and stored in State.
- The **Automated Cron** core module — piggybacks on \`kernel.terminate\`
  after normal page views at a configured interval. Fine for tiny sites, but
  cron latency then depends on traffic and steals time from a visitor's
  request — use a real crontab in production.
`,

  comparisons: [
    {
      label: "The heartbeat: Scheduler component vs hook_cron + State",
      intro:
        "Symfony schedules each concern explicitly with its own recurrence rule. Drupal gives every module the same tick — incident_tracker throttles itself with a State timestamp and only queues work.",
      php: `// src/Scheduler/AppScheduleProvider.php (Symfony 6.4+)
namespace App\\Scheduler;

use App\\Message\\EscalateStaleIncidents;
use Symfony\\Component\\Scheduler\\Attribute\\AsSchedule;
use Symfony\\Component\\Scheduler\\RecurringMessage;
use Symfony\\Component\\Scheduler\\Schedule;
use Symfony\\Component\\Scheduler\\ScheduleProviderInterface;

#[AsSchedule('default')]
final class AppScheduleProvider implements ScheduleProviderInterface {

  public function getSchedule(): Schedule {
    return (new Schedule())->add(
      // The recurrence lives HERE, per message.
      RecurringMessage::every('1 hour', new EscalateStaleIncidents()),
    );
  }

}

// Ticked by a long-running worker process:
//   bin/console messenger:consume scheduler_default`,
      ts: `<?php
// incident_tracker.module

/**
 * Implements hook_cron().
 */
function incident_tracker_cron(): void {
  $state = \\Drupal::state();
  $now = \\Drupal::time()->getRequestTime();

  // hook_cron fires EVERY pass — throttle to hourly ourselves.
  if ($now - $state->get('incident_tracker.last_escalation', 0) < 3600) {
    return;
  }

  // Fast part only: find open incidents untouched for 24h...
  $nids = \\Drupal::entityQuery('node')
    ->condition('type', 'incident')
    ->condition('field_status', 'open')
    ->condition('changed', $now - 86400, '<')
    ->accessCheck(FALSE)
    ->execute();

  // ...and QUEUE the slow notification work.
  $queue = \\Drupal::queue('incident_tracker_notify');
  foreach ($nids as $nid) {
    $queue->createItem(['nid' => $nid, 'reason' => 'stale_24h']);
  }

  $state->set('incident_tracker.last_escalation', $now);
}`,
      note:
        "State (not config!) holds the timestamp: it is environment-specific runtime data that must never appear in a config export. On Drupal 11.1+ this can be a #[Hook('cron')] method on IncidentTrackerHooks with the state and time services injected.",
    },
    {
      label: "The worker: Messenger handler vs QueueWorker plugin",
      intro:
        "Both are 'a class that handles one queued payload'. Messenger discovers handlers by message type; Drupal matches the plugin id to the queue name and lets cron drain it on a time budget.",
      php: `// src/MessageHandler/NotifyResponderHandler.php (Symfony)
namespace App\\MessageHandler;

use App\\Message\\NotifyResponder;
use App\\Service\\ResponderNotifier;
use Symfony\\Component\\Messenger\\Attribute\\AsMessageHandler;

#[AsMessageHandler]
final class NotifyResponderHandler {

  public function __construct(
    private readonly ResponderNotifier $notifier,
  ) {}

  public function __invoke(NotifyResponder $message): void {
    // Throwing here hands control to Messenger's
    // retry strategy / failure transport.
    $this->notifier->escalate($message->incidentId, $message->reason);
  }

}`,
      ts: `<?php
// src/Plugin/QueueWorker/IncidentNotifier.php
namespace Drupal\\incident_tracker\\Plugin\\QueueWorker;

use Drupal\\Core\\Entity\\EntityTypeManagerInterface;
use Drupal\\Core\\Plugin\\ContainerFactoryPluginInterface;
use Drupal\\Core\\Queue\\Attribute\\QueueWorker;
use Drupal\\Core\\Queue\\QueueWorkerBase;
use Drupal\\Core\\Queue\\SuspendQueueException;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup;
use Drupal\\incident_tracker\\ResponderNotifier;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;

/**
 * Sends escalations queued by incident_tracker_cron().
 */
#[QueueWorker(
  id: 'incident_tracker_notify',   // MUST match the queue name.
  title: new TranslatableMarkup('Incident escalation notifier'),
  cron: ['time' => 30],            // drain up to 30s per cron pass
)]
class IncidentNotifier extends QueueWorkerBase implements ContainerFactoryPluginInterface {

  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly ResponderNotifier $notifier,
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
  }

  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('entity_type.manager'),
      $container->get('incident_tracker.responder_notifier'),
    );
  }

  public function processItem($data): void {
    $incident = $this->entityTypeManager
      ->getStorage('node')->load($data['nid']);
    if (!$incident) {
      return;  // Deleted since queueing — silently drop the item.
    }
    if (!$this->notifier->isAvailable()) {
      // Gateway down: no point trying the REST of the queue.
      throw new SuspendQueueException('Notification gateway unreachable.');
    }
    $this->notifier->escalate($incident, $data['reason']);
  }

}`,
      note:
        "The #[QueueWorker] attribute shown here works on Drupal 10.3+ and 11; on older Drupal 10 (<10.3) write the same metadata as a @QueueWorker annotation (cron = {\"time\" = 30}) — annotations still work on 11 too. Without the cron key the queue is only drained manually (drush queue:run).",
    },
    {
      label: "Failure semantics: retry config vs the claim/delete lifecycle",
      intro:
        "Messenger's delivery guarantees are configuration — the transport acks, rejects, and retries for you. Drupal's are an explicit API: this manual drain loop is essentially what Cron::processQueues() runs for workers with a cron budget.",
      leftLang: "yaml",
      php: `# config/packages/messenger.yaml (Symfony)
framework:
  messenger:
    failure_transport: failed
    transports:
      async:
        dsn: 'doctrine://default'
        retry_strategy:
          max_retries: 3
          delay: 60000       # 1 min, doubled each retry
          multiplier: 2
      failed: 'doctrine://default?queue_name=failed'
    routing:
      App\\Message\\NotifyResponder: async`,
      ts: `<?php
// The explicit lifecycle (e.g. in a drush php:script).
$queue = \\Drupal::queue('incident_tracker_notify');
$worker = \\Drupal::service('plugin.manager.queue_worker')
  ->createInstance('incident_tracker_notify');

// Lease each claim for 60s: while leased, the item is
// invisible to every other consumer.
while ($item = $queue->claimItem(60)) {
  try {
    $worker->processItem($item->data);
    $queue->deleteItem($item);      // success: gone forever
  }
  catch (\\Drupal\\Core\\Queue\\SuspendQueueException $e) {
    $queue->releaseItem($item);     // hand it straight back...
    break;                          // ...and stop draining the queue
  }
  catch (\\Exception $e) {
    // Plain failure: do NOT delete or release. The item stays
    // claimed until the lease expires, then is retried — the
    // reliable (database) backend never loses it.
    \\Drupal::logger('incident_tracker')->error($e->getMessage());
  }
}`,
      note:
        "Reliable vs best-effort: \\Drupal::queue($name, TRUE) requests a ReliableQueueInterface backend (FIFO + guaranteed delivery — the default queue.database qualifies); queue.memory is best-effort within one request. settings.php can remap a named queue to e.g. a Redis backend.",
    },
    {
      label: "Running it: consumer processes vs one cron entry",
      intro:
        "Symfony background work means process management — supervisord/systemd keeping consumers alive. A Drupal site needs exactly one scheduled trigger, however you fire it.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: you own the process model. Keep consumers
# alive with supervisor/systemd, restart them periodically:
php bin/console messenger:consume scheduler_default async \\
  --time-limit=3600 --memory-limit=128M

# ...or classic crontab lines per command:
# 0 * * * * cd /var/www/app && php bin/console app:escalate-stale`,
      ts: `# Drupal: one heartbeat for the whole site.
$ drush cron -v
 [notice] Starting execution of incident_tracker_cron().
 [notice] Execution of incident_tracker_cron() took 12.41ms.
 [success] Cron run successful.

# Production crontab hits the keyed URL instead (key shown
# at /admin/config/system/cron, stored in State):
# */5 * * * * curl -s https://example.com/cron/aX93...bQ2 > /dev/null

# Inspect and drain queues without waiting for cron:
$ drush queue:list
 ------------------------- ------- ---------------------------------
  Queue                     Items   Class
 ------------------------- ------- ---------------------------------
  incident_tracker_notify   42      Drupal\\Core\\Queue\\DatabaseQueue
 ------------------------- ------- ---------------------------------
$ drush queue:run incident_tracker_notify
 [success] Processed 42 items from the incident_tracker_notify queue.`,
      note:
        "Third option for tiny sites: the Automated Cron core module runs cron on kernel.terminate after page views once an interval has passed — zero setup, but latency depends on traffic and the work rides on a visitor's request.",
    },
  ],

  playground: {
    intro:
      "A cron pass in ~90 lines: hook_cron dispatch by naming convention, then a queue drain with real claim/delete semantics. One item fails on pass 1 — watch what the lease does. Predict the output before running.",
    lang: "php",
    code: `<?php
// Drupal's cron pass in miniature. Order matters:
//   1. Every module's hook_cron runs (fast — it only QUEUES work).
//   2. Cron drains queues whose workers declare cron = ['time' => N].
// claimItem() leases an item (hidden from other consumers), deleteItem()
// removes it on success. If the worker THROWS, the item stays claimed
// until its lease expires — then it is retried on a later pass.

final class DatabaseQueue {
  private array $items = [];
  private int $serial = 0;

  public function createItem(array $data): void {
    $this->serial++;
    $this->items[$this->serial] = ['data' => $data, 'claimed' => false];
  }

  public function claimItem(): ?object {
    foreach ($this->items as $id => $item) {
      if (!$item['claimed']) {
        $this->items[$id]['claimed'] = true;   // lease starts
        return (object) ['item_id' => $id, 'data' => $item['data']];
      }
    }
    return null;                               // nothing claimable
  }

  public function deleteItem(object $item): void {
    unset($this->items[$item->item_id]);       // gone for good
  }

  public function expireLeases(): void {       // time passing, simplified
    foreach ($this->items as $id => $item) {
      $this->items[$id]['claimed'] = false;
    }
  }

  public function numberOfItems(): int {
    return count($this->items);
  }
}

// State API stand-in: ephemeral key/value store, NOT exportable config.
$state = ['incident_tracker.last_escalation' => 0];

// hook_cron: do NOT do the work here — queue it and get out.
function incident_tracker_cron(DatabaseQueue $queue, array &$state, int $now): void {
  $elapsed = $now - $state['incident_tracker.last_escalation'];
  if ($state['incident_tracker.last_escalation'] > 0 && $elapsed < 3600) {
    echo "  [incident_tracker] cron: escalation ran {$elapsed}s ago, throttled\\n";
    return;
  }
  $stale = [14, 27];  // pretend entityQuery found two stale incidents
  foreach ($stale as $nid) {
    $queue->createItem(['nid' => $nid, 'reason' => 'stale_24h']);
  }
  $state['incident_tracker.last_escalation'] = $now;
  echo "  [incident_tracker] cron: queued " . count($stale) . " notifications\\n";
}

// QueueWorker::processItem() — the slow, failure-prone work, decoupled.
$mailIsDown = true;
$processItem = function (array $data) use (&$mailIsDown): void {
  if ($mailIsDown && $data['nid'] === 27) {
    throw new RuntimeException('SMTP timeout');
  }
  echo "  [notify worker] escalated incident {$data['nid']} ({$data['reason']})\\n";
};

$queue = new DatabaseQueue();
$modules = ['incident_tracker'];

foreach ([1 => 1000, 2 => 2200] as $pass => $now) {
  echo "=== cron pass {$pass} (t={$now}) ===\\n";
  // Step 1: invoke hook_cron on every module (classic name dispatch).
  foreach ($modules as $module) {
    $function = $module . '_cron';
    if (function_exists($function)) {
      $function($queue, $state, $now);
    }
  }
  // Step 2: drain declared queues within the worker's time budget.
  while ($item = $queue->claimItem()) {
    try {
      $processItem($item->data);
      $queue->deleteItem($item);
    }
    catch (RuntimeException $e) {
      echo "  [cron] worker threw ({$e->getMessage()}); item {$item->item_id} "
        . "stays claimed until its lease expires\\n";
    }
  }
  echo "  queue afterwards: {$queue->numberOfItems()} item(s)\\n";

  if ($pass === 1) {
    echo "--- 20 minutes pass: leases expire, SMTP recovers ---\\n";
    $queue->expireLeases();
    $mailIsDown = false;
  }
}
`,
    output: `=== cron pass 1 (t=1000) ===
  [incident_tracker] cron: queued 2 notifications
  [notify worker] escalated incident 14 (stale_24h)
  [cron] worker threw (SMTP timeout); item 2 stays claimed until its lease expires
  queue afterwards: 1 item(s)
--- 20 minutes pass: leases expire, SMTP recovers ---
=== cron pass 2 (t=2200) ===
  [incident_tracker] cron: escalation ran 1200s ago, throttled
  [notify worker] escalated incident 27 (stale_24h)
  queue afterwards: 0 item(s)
`,
  },

  keyPoints: [
    "hook_cron runs on EVERY cron pass and has no schedule of its own — throttle with a State API timestamp (\\Drupal::state()) and keep it fast: query + createItem only, never the slow work itself.",
    "\\Drupal::queue('incident_tracker_notify')->createItem($data) serializes any payload; the queue name must match a QueueWorker plugin id in src/Plugin/QueueWorker.",
    "cron: ['time' => 30] on the worker (#[QueueWorker] attribute on Drupal 10.3+/11, @QueueWorker annotation on older Drupal 10) makes cron drain that queue for up to 30 seconds per pass, after all hook_cron implementations; omit it to drain only via drush queue:run or your own code.",
    "Item lifecycle: claimItem($lease) leases an item invisibly, deleteItem() finishes it; a thrown exception leaves it claimed until the lease expires (automatic retry), SuspendQueueException abandons the whole queue for this pass, RequeueException releases the item immediately.",
    "The default queue.database backend is reliable (FIFO + guaranteed delivery); \\Drupal::queue($name, TRUE) explicitly requests a ReliableQueueInterface backend, and settings.php can remap a named queue to another implementation.",
    "Trigger cron with drush cron, a real crontab curl-ing /cron/{key} (key at /admin/config/system/cron), or the Automated Cron module for tiny sites; core stores the last run in state as system.cron_last.",
  ],

  interview: [
    {
      q: "Why is doing heavy work directly in hook_cron an anti-pattern, and what is the correct pattern?",
      a: "Cron is one shared pass for the entire site: every module's `hook_cron` runs in the same PHP process, so a slow implementation risks hitting the time limit and starving core's own housekeeping plus every other module. The correct split is: `hook_cron` does only the cheap detection (an entity query for stale incidents) and pushes one item per unit of work into a queue with `createItem()`; a `QueueWorker` plugin with a `cron: ['time' => N]` budget does the slow part. That buys you per-item failure isolation — one bad email doesn't abort the pass — automatic retry via the lease mechanism, and a bounded time slice per cron run. It's the same reasoning as never doing slow work in a Symfony controller: dispatch to Messenger instead.",
    },
    {
      q: "Walk me through the life of a queue item, including what happens when processing fails.",
      a: "`createItem($data)` serializes the payload into the backend (the database table by default). A consumer calls `claimItem($lease_time)`, which atomically leases the item so no other consumer sees it, then runs the worker's `processItem($data)`. On success the consumer calls `deleteItem()`; on a plain exception it does nothing — the item stays claimed until the lease expires and is then retried, so reliable backends never lose work. The typed exceptions refine this: `RequeueException` releases the item for immediate retry, `SuspendQueueException` tells cron to stop draining that entire queue this pass (a shared dependency like the mail gateway is down), and `DelayedRequeueException($delay)` re-queues the item after the given delay via `delayItem()` on backends implementing `DelayableQueueInterface` (the default database queue does) — on backends that don't, the item simply stays locked until the lease expires. This is Drupal's manual, pull-based equivalent of Messenger's ack/nack plus retry_strategy configuration.",
    },
    {
      q: "You know Symfony Messenger and the Scheduler component. What's genuinely different about Drupal's model, and when does that matter?",
      a: "Messenger is push-based with long-running consumer processes you must keep alive via supervisord/systemd, and per-transport retry configuration; Scheduler gives each recurring message its own recurrence rule. Drupal is pull-based around one shared heartbeat: a single external trigger (crontab, `drush cron`, or the keyed `/cron/{key}` URL) fires `hook_cron` everywhere and then drains cron-declared queues — no daemons, which is why it works on commodity hosting where you can't run supervisor. The trade-offs: frequency control is manual (State API timestamps), and throughput is capped by cron cadence unless you add dedicated consumers (`drush queue:run` in its own crontab entry, or a contrib Redis/advanced-queue backend). For a high-volume pipeline you'd move heavy queues off the shared heartbeat exactly the way you'd scale Messenger consumers.",
    },
  ],

  quiz: [
    {
      question:
        "incident_tracker_cron() currently loads each stale incident and sends the escalation email inline, and cron runs are timing out. What is the idiomatic fix?",
      options: [
        "Raise PHP's max_execution_time in settings.php for cron requests",
        "Move the email loop into hook_cron_alter() so it runs last",
        "Have hook_cron only createItem() one queue item per incident, and send the emails in a QueueWorker with a cron time budget",
        "Call drush cron twice so the second run finishes the work",
      ],
      answerIndex: 2,
      explain:
        "Cron is a shared heartbeat — hook_cron should detect and enqueue, never perform slow work. A QueueWorker with cron: ['time' => N] drains the queue in bounded slices with per-item retry, so one slow or failing email no longer takes down the whole pass. (hook_cron_alter does not exist.)",
    },
    {
      question:
        "During a cron drain, processItem() throws a plain \\Exception for one item. What happens to that item?",
      options: [
        "It is deleted — failed items are discarded to keep the queue moving",
        "It stays in the queue, claimed until its lease expires, and is retried on a later pass",
        "It is moved to a failure queue like Messenger's failure_transport",
        "The whole queue is suspended until the next cron run",
      ],
      answerIndex: 1,
      explain:
        "Cron logs the exception and simply doesn't delete the item, so the lease keeps it hidden until it expires and then it becomes claimable again — automatic retry with no lost work. Suspending the whole queue requires SuspendQueueException, and Drupal has no built-in failure transport.",
    },
    {
      question:
        "What does cron: ['time' => 60] in the #[QueueWorker] attribute actually mean?",
      options: [
        "The worker runs every 60 seconds, independent of cron",
        "Each cron pass spends at most about 60 seconds claiming and processing items from this queue",
        "Every item gets a hard 60-second execution timeout",
        "Items younger than 60 seconds are skipped",
      ],
      answerIndex: 1,
      explain:
        "The cron key opts the queue into cron processing and 'time' is the drain budget per pass: after all hook_cron implementations run, cron keeps claiming items from this queue until roughly 60 seconds have elapsed, then moves on. It is not a per-item timeout or an independent schedule.",
    },
    {
      question:
        "Where should incident_tracker store its 'last escalation check' timestamp?",
      options: [
        "In config (incident_tracker.settings), exported with the rest of the config",
        "In a settings.php $settings[] entry",
        "In the State API (\\Drupal::state()), like core's own system.cron_last",
        "In a cache bin, since it is regenerable",
      ],
      answerIndex: 2,
      explain:
        "The timestamp is environment-specific runtime data: putting it in config would create permanent config drift and risk deploying one environment's timestamp to another; settings.php is for deployment constants; caches can be cleared at any time, which would break the throttle. State is exactly the per-site, non-exported key/value store this needs.",
    },
  ],
};

export default lesson;
