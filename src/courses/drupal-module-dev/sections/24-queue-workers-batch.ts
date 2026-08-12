import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "queue-workers-batch",
  title: "Queue Workers & the Batch API",
  part: "Data, State & Background Work",
  estMinutes: 13,
  summary:
    "Two ways incident_tracker does a lot of work: a QueueWorker plugin that cron drains in the background with real retry semantics, and the Batch API that walks an admin through a long job across many HTTP requests with a progress bar.",

  concept: `
## Nobody watching vs somebody watching

Section 23 got work off the request thread. Now the practical question: **is a
human waiting for the answer?**

- **No one is watching** — escalation emails, re-indexing, syncing to a remote
  API. Use the **Queue API**. Cron pulls items on its own schedule and the
  browser never knows.
- **Someone clicked a button and is staring at the screen** — "close all 600
  stale incidents", "re-import this CSV". Use the **Batch API**. It gives them
  a progress bar and cannot silently fall behind.

They are not competitors; they solve different halves of the same problem, and
production modules ship both.

## Writing a QueueWorker you can trust

The plugin lives in \`src/Plugin/QueueWorker/IncidentNotifier.php\`, its id
**must equal the queue name**, and \`cron: ['time' => 30]\` is the drain budget
per cron pass. Beyond the boilerplate, three rules matter:

1. **Queue IDs, never objects.** The payload is serialized into the database
   and may be processed hours later. Store \`['nid' => 42]\` and re-load; store
   a loaded node and you will deserialize a stale entity — or a class that no
   longer exists after a deploy.
2. **Be idempotent.** An item can be processed twice (a lease expires while
   the worker is still running, someone runs \`drush queue:run\` mid-cron).
   Re-check the precondition — "is this incident still open?" — and return
   early instead of double-sending.
3. **Pick your exception deliberately.** Returning normally deletes the item.
   Throwing is a control-flow decision:

| Throw | Meaning |
| --- | --- |
| plain \`\\Exception\` | logged; item stays claimed until the lease expires, then retried |
| \`RequeueException\` | "not finished yet": release **this item** so it can be claimed again immediately — for genuine **partial progress**, never for contention or failure |
| \`DelayedRequeueException($seconds)\` | retry this item after a delay (needs a \`DelayableQueueInterface\` backend — the database queue is one) |
| \`SuspendQueueException\` | a shared dependency is down: **stop draining this whole queue** for this pass |

Watch \`RequeueException\` in particular: cron catches it with
\`$queue->releaseItem()\`, which sets \`expire = 0\`, and \`claimItem()\` orders by
\`created ASC\` — so the **same item** is re-claimed on the very next loop. Throw
it on a contention or failure condition and cron spins on one item until the
\`cron: ['time' => 30]\` budget expires, processing nothing else. For "someone
else holds the lock", back off with \`DelayedRequeueException\` (or just
\`return\`) instead.

Core has no \`max_retries\` and no failure transport. An item that always
throws retries **forever** — count attempts in the payload and give up
explicitly, or use contrib Advanced Queue.

## The Batch API: one job, many requests

\`batch_set()\` hands Drupal a list of **operation callbacks**; the batch
engine then redirects the browser to \`/batch\`, which calls your operation
once per HTTP request and re-renders a progress bar in between. Each call
receives \`&$context\`:

- \`$context['sandbox']\` — your scratch state. Along with \`$context['results']\`,
  it is one of the **two keys that persist across requests**; \`message\` and
  \`finished\` are reset on every invocation (\`finished\` back to 1). Sandbox is
  also wiped when the operation completes, results is not. Seed \`progress\` and
  \`max\` on the first call.
- \`$context['results']\` — accumulates for the finish callback.
- \`$context['message']\` — the line under the progress bar.
- \`$context['finished']\` — a **fraction, not a boolean**. Below 1 means "call
  me again"; 1 (the default if you never set it) ends the operation.

Build it with \`BatchBuilder\` and set a \`finished\` callback of the shape
\`(bool $success, array $results, array $operations, string $elapsed)\`.
Callbacks must be strings or \`[Class::class, 'method']\` arrays — the batch is
serialized, so **no closures**. And because each request re-bootstraps Drupal,
process a modest slice (25–50 entities) and never rely on static caches.

Same code runs from Drush: \`batch_set()\` then \`drush_backend_batch_process()\`
loops in one process instead of over HTTP. \`hook_update_N\` uses the identical
\`&$sandbox\` protocol — that is why \`drush updb\` can walk a million rows.
`,

  comparisons: [
    {
      label: "Failure control: Messenger exceptions vs Drupal's queue exceptions",
      intro:
        "Both frameworks let the handler steer its own retry, but Symfony's decisions are per-message against a configured retry strategy, while Drupal's are per-item against a lease — and one of them can shut down the entire queue.",
      php: `// src/MessageHandler/NotifyResponderHandler.php (Symfony 6.4/7)
namespace App\\MessageHandler;

use App\\Message\\NotifyResponder;
use Symfony\\Component\\Messenger\\Attribute\\AsMessageHandler;
use Symfony\\Component\\Messenger\\Exception\\RecoverableMessageHandlingException;
use Symfony\\Component\\Messenger\\Exception\\UnrecoverableMessageHandlingException;

#[AsMessageHandler]
final class NotifyResponderHandler {

  public function __invoke(NotifyResponder $message): void {
    $incident = $this->repository->find($message->incidentId);

    if (!$incident) {
      // Never going to succeed: skip the retry strategy entirely
      // and go straight to the failure transport.
      throw new UnrecoverableMessageHandlingException('Incident gone.');
    }
    if (!$this->gateway->isUp()) {
      // Retry me, overriding the transport's delay (milliseconds).
      throw new RecoverableMessageHandlingException(
        'Gateway down.', retryDelay: 300000,
      );
    }
    // Any other exception -> transport's retry_strategy decides,
    // then max_retries is reached and it lands in "failed".
    $this->gateway->escalate($incident, $message->reason);
  }

}`,
      ts: `<?php
// src/Plugin/QueueWorker/IncidentNotifier.php (processItem excerpt)
use Drupal\\Core\\Queue\\DelayedRequeueException;
use Drupal\\Core\\Queue\\SuspendQueueException;

public function processItem($data): void {
  // The payload is IDs, never objects: it was serialized into the
  // DB and may be replayed after a deploy.
  $incident = $this->entityTypeManager
    ->getStorage('node')->load($data['nid']);

  if (!$incident) {
    // Deleted since queueing. Returning normally = deleteItem().
    return;
  }
  if ($incident->get('field_status')->value !== 'open') {
    // IDEMPOTENCY: an item can be delivered twice. Don't re-send.
    return;
  }
  if ($this->gateway->isRateLimited()) {
    // This ONE item, five minutes from now. Needs a backend
    // implementing DelayableQueueInterface (the DB queue is one).
    throw new DelayedRequeueException(300, 'Rate limited.');
  }
  if (!$this->gateway->isUp()) {
    // Shared dependency down: draining the rest is pointless.
    throw new SuspendQueueException('Gateway unreachable.');
  }
  if (!$this->lock->acquire('incident_notify:' . $data['nid'])) {
    // Someone else is on it. Back OFF — do not throw RequeueException here:
    // cron releases the item (expire = 0) and claimItem() orders by created
    // ASC, so the same item is re-claimed instantly and spins the whole
    // cron budget. RequeueException is for genuine partial progress.
    throw new DelayedRequeueException(60, 'Lock held elsewhere.');
  }

  try {
    $this->gateway->escalate($incident, $data['reason']);
  }
  finally {
    $this->lock->release('incident_notify:' . $data['nid']);
  }
}`,
      note:
        "The big missing piece coming from Messenger: core has no max_retries and no failure transport. A plain exception leaves the item claimed until the lease expires and it is retried forever — track an attempt count in the payload and give up explicitly, or install contrib Advanced Queue. And note there is no Messenger-style backoff behind RequeueException: cron releases the item and immediately re-claims it, so contention needs DelayedRequeueException, not a requeue.",
    },
    {
      label: "A long user-facing job: console ProgressBar vs batch_set()",
      intro:
        "An admin asks incident_tracker to close every incident untouched for 90 days. Symfony's answer is a console command in a terminal; Drupal's is a form submit handler that hands the browser a progress bar.",
      php: `// src/Command/CloseStaleIncidentsCommand.php (Symfony)
#[AsCommand(name: 'app:incidents:close-stale')]
final class CloseStaleIncidentsCommand extends Command {

  protected function execute(InputInterface $in, OutputInterface $out): int {
    $io = new SymfonyStyle($in, $out);
    $ids = $this->repository->findStaleIds((int) $in->getOption('days'));

    // ONE long-lived process. Nothing to resume; if it dies at 80%
    // you re-run it. A browser user sees nothing at all.
    $io->progressStart(count($ids));
    foreach (array_chunk($ids, 50) as $chunk) {
      $this->closer->closeAll($chunk);
      $this->entityManager->clear();   // keep memory flat
      $io->progressAdvance(count($chunk));
    }
    $io->progressFinish();

    $io->success(sprintf('Closed %d incidents.', count($ids)));
    return Command::SUCCESS;
  }

}`,
      ts: `<?php
// src/Form/IncidentBulkCloseForm.php
namespace Drupal\\incident_tracker\\Form;

use Drupal\\Core\\Batch\\BatchBuilder;
use Drupal\\Core\\Form\\FormBase;
use Drupal\\Core\\Form\\FormStateInterface;

class IncidentBulkCloseForm extends FormBase {

  public function getFormId(): string {
    return 'incident_tracker_bulk_close';
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    $form['days'] = [
      '#type' => 'number',
      '#title' => $this->t('Close open incidents untouched for (days)'),
      '#default_value' => 90,
      '#min' => 1,
    ];
    $form['actions']['#type'] = 'actions';
    $form['actions']['submit'] = [
      '#type' => 'submit',
      '#value' => $this->t('Close them'),
    ];
    return $form;
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $cutoff = $this->time->getRequestTime()
      - ($form_state->getValue('days') * 86400);

    $nids = $this->entityTypeManager->getStorage('node')->getQuery()
      ->condition('type', 'incident')
      ->condition('field_status', 'open')
      ->condition('changed', $cutoff, '<')
      ->accessCheck(FALSE)
      ->execute();

    $batch = (new BatchBuilder())
      ->setTitle($this->t('Closing stale incidents'))
      ->setInitMessage($this->t('Gathering incidents...'))
      ->setProgressMessage($this->t('Completed @current of @total.'))
      ->setErrorMessage($this->t('Closing incidents failed.'))
      // No closures! The batch is serialized between requests.
      ->setFinishCallback([static::class, 'finished'])
      ->addOperation([static::class, 'closeChunk'], [array_values($nids)]);

    batch_set($batch->toArray());

    // The batch engine owns the response for the duration of the job (the
    // browser goes to /batch). You may still call $form_state->setRedirect() —
    // _batch_finished() honours it as the destination AFTER the batch
    // completes; without it the user lands back on this form.
    $form_state->setRedirect('incident_tracker.reports');
  }

}`,
      note:
        "In a controller (no form) you call batch_set($batch) and then return batch_process('/admin/reports/incidents'). From Drush it is batch_set($batch) then drush_backend_batch_process(), which runs the same operations in one CLI process instead of over HTTP.",
    },
    {
      label: "Resuming across requests: hand-rolled offset vs $context['sandbox']",
      intro:
        "The batch operation callback is where the sandbox protocol earns its keep. In a Symfony app you would build this progressive endpoint yourself; Drupal already owns the loop, the progress bar and the state.",
      php: `// Symfony has no built-in "progressive HTTP job" primitive, so you
// hand-roll one: an offset in the session plus JS that keeps polling.
#[Route('/admin/close-stale/step', methods: ['POST'])]
public function step(SessionInterface $session): JsonResponse {
  $offset = (int) $session->get('close_stale.offset', 0);
  $total  = (int) $session->get('close_stale.total');

  $ids = $this->repository->findStaleIds(limit: 25, offset: $offset);
  foreach ($ids as $id) {
    $this->closer->close($id);
  }
  $offset += count($ids);
  $session->set('close_stale.offset', $offset);

  return new JsonResponse([
    'finished' => $offset >= $total,
    'percent'  => $total ? (int) round($offset / $total * 100) : 100,
  ]);
}
// ...plus the JS that re-POSTs until finished === true, plus your own
// progress markup, plus handling the user closing the tab.`,
      ts: `<?php
// src/Form/IncidentBulkCloseForm.php (continued)

/**
 * Batch operation: called ONCE PER REQUEST until finished >= 1.
 *
 * Operation arguments come first, &$context always last.
 */
public static function closeChunk(array $nids, array &$context): void {
  // sandbox and results are the two keys that survive between requests.
  if (!isset($context['sandbox']['progress'])) {
    $context['sandbox']['progress'] = 0;
    $context['sandbox']['max'] = count($nids);
    $context['results']['closed'] = 0;
    $context['results']['skipped'] = 0;
  }

  $storage = \\Drupal::entityTypeManager()->getStorage('node');
  $slice = array_slice($nids, $context['sandbox']['progress'], 25);

  foreach ($storage->loadMultiple($slice) as $incident) {
    if ($incident->get('field_status')->value !== 'open') {
      $context['results']['skipped']++;
      continue;
    }
    $incident->set('field_status', 'closed');
    $incident->setNewRevision(TRUE);
    $incident->setRevisionLogMessage('Bulk-closed as stale.');
    $incident->save();
    $context['results']['closed']++;
  }

  $context['sandbox']['progress'] += count($slice);
  $context['message'] = t('Closed @done of @max', [
    '@done' => $context['sandbox']['progress'],
    '@max' => $context['sandbox']['max'],
  ]);

  // A FRACTION, not a boolean. < 1 means "call me again".
  $context['finished'] = $context['sandbox']['max']
    ? $context['sandbox']['progress'] / $context['sandbox']['max']
    : 1;
}

/**
 * Finish callback. $elapsed arrives preformatted, e.g. "41 sec".
 */
public static function finished(bool $success, array $results, array $operations, string $elapsed): void {
  $messenger = \\Drupal::messenger();
  if (!$success) {
    // $operations holds what never ran — the first one is the culprit.
    $messenger->addError(t('Bulk close failed on @op.', [
      '@op' => print_r(reset($operations), TRUE),
    ]));
    return;
  }
  $messenger->addStatus(t('Closed @closed incident(s), skipped @skipped, in @elapsed.', [
    '@closed' => $results['closed'],
    '@skipped' => $results['skipped'],
    '@elapsed' => $elapsed,
  ]));
}`,
      note:
        "Because every slice is a fresh bootstrap, keep slices small (25-50 entities), never cache anything in statics, and re-check preconditions per item — the data can change while the batch is running.",
    },
    {
      label: "Running them: consumer daemons vs drush queue:run / batch",
      intro:
        "Same shapes, different operational story. Symfony needs supervised worker processes; Drupal needs one cron trigger, plus on-demand commands when you don't want to wait for it.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: long-running consumers you must keep alive.
$ php bin/console messenger:consume async -vv --limit=100 --time-limit=3600
 [OK] Consuming messages from transport "async".
 // The worker will automatically exit once it has processed 100 messages.

# Failure transport tooling comes for free:
$ php bin/console messenger:failed:show
$ php bin/console messenger:failed:retry -vv
$ php bin/console messenger:stats

# And the long user-facing job is just a command:
$ php bin/console app:incidents:close-stale --days=90`,
      ts: `# Drupal: cron drains cron-declared queues, but you can force it.
$ drush queue:run incident_tracker_notify --time-limit=60 --lease-time=120
 [success] Processed 137 items from the incident_tracker_notify queue.

$ drush queue:list
 ------------------------- ------- ---------------------------------
  Queue                     Items   Class
 ------------------------- ------- ---------------------------------
  incident_tracker_notify   0       Drupal\\Core\\Queue\\DatabaseQueue
 ------------------------- ------- ---------------------------------

# A batch from the CLI: batch_set() + drush_backend_batch_process()
# runs the same operations in ONE process, no browser involved.
$ drush incident-tracker:bulk-close --days=90
 [notice] Closing stale incidents
 [notice] Completed 25 of 623.
 [notice] Completed 600 of 623.
 [success] Closed 601 incidents, skipped 22, in 41 sec.

# Same protocol core uses for update hooks:
$ drush updb`,
      note:
        "There is no core equivalent of messenger:failed:show. If a queue matters, monitor it: drush queue:list in a health check, or log a warning from hook_cron when an item count crosses a threshold.",
    },
  ],

  playground: {
    intro:
      "The batch engine and a cron queue drain doing the SAME 23 items. Watch how the batch re-enters the operation until finished reaches 1, while cron takes fixed bites. Predict the progress percentages before you run it.",
    lang: "php",
    code: `<?php
// The Batch API in miniature, then the same work as a queue.
//
// A batch is NOT one long request. The engine calls your operation once per
// HTTP request, each time handing back $context. Only $context['sandbox'] and
// $context['results'] survive between requests, and $context['finished'] is a
// FRACTION (1 = this operation is done) that drives the progress bar.

function incident_bulk_close(array $nids, array &$context): void {
  // First invocation only: seed the sandbox.
  if (!isset($context['sandbox']['progress'])) {
    $context['sandbox']['progress'] = 0;
    $context['sandbox']['max'] = count($nids);
    $context['results']['closed'] = 0;
    $context['results']['skipped'] = 0;
  }

  // A SMALL slice per request — this is what keeps PHP under its time limit.
  $slice = array_slice($nids, $context['sandbox']['progress'], 5);
  foreach ($slice as $nid) {
    if ($nid % 7 === 0) {
      $context['results']['skipped']++;   // someone already closed it
    }
    else {
      $context['results']['closed']++;
    }
  }
  $context['sandbox']['progress'] += count($slice);
  $context['message'] = "Closing incident {$context['sandbox']['progress']} of {$context['sandbox']['max']}";
  $context['finished'] = $context['sandbox']['progress'] / $context['sandbox']['max'];
}

function incident_bulk_close_finished(bool $success, array $results, array $operations, string $elapsed): void {
  $verdict = $success ? 'success' : 'error';
  echo "[{$verdict}] closed {$results['closed']}, skipped {$results['skipped']} in {$elapsed}\\n";
}

// --- The batch engine: re-enter the operation until finished >= 1. --------
$nids = range(1, 23);
$context = ['sandbox' => [], 'results' => [], 'finished' => 0, 'message' => ''];
$request = 0;

echo "=== BATCH: a user is watching a progress bar ===\\n";
while ($context['finished'] < 1) {
  $request++;
  incident_bulk_close($nids, $context);
  $percent = (int) round($context['finished'] * 100);
  $bar = str_pad(str_repeat('#', (int) round($context['finished'] * 20)), 20, '.');
  printf("  request %d  [%s] %3d%%  %s\\n", $request, $bar, $percent, $context['message']);
}
incident_bulk_close_finished(TRUE, $context['results'], [], '1.2 sec');

// --- The same 23 items as a QUEUE: cron drains inside the worker budget. --
echo "\\n=== QUEUE: nobody is watching; cron nibbles at it ===\\n";
$queue = $nids;
$budget = 30;   // cron: ['time' => 30] on the QueueWorker plugin
$cost = 4;      // seconds per notification
$pass = 0;

while ($queue) {
  $pass++;
  $spent = 0;
  $done = 0;
  // Cron checks the clock BEFORE claiming, so the last item can overshoot.
  while ($queue && $spent < $budget) {
    array_shift($queue);
    $spent += $cost;
    $done++;
  }
  echo "  cron pass {$pass}: processed {$done} item(s) in {$spent}s, " . count($queue) . " left\\n";
}
`,
    output: `=== BATCH: a user is watching a progress bar ===
  request 1  [####................]  22%  Closing incident 5 of 23
  request 2  [#########...........]  43%  Closing incident 10 of 23
  request 3  [#############.......]  65%  Closing incident 15 of 23
  request 4  [#################...]  87%  Closing incident 20 of 23
  request 5  [####################] 100%  Closing incident 23 of 23
[success] closed 20, skipped 3 in 1.2 sec

=== QUEUE: nobody is watching; cron nibbles at it ===
  cron pass 1: processed 8 item(s) in 32s, 15 left
  cron pass 2: processed 8 item(s) in 32s, 7 left
  cron pass 3: processed 7 item(s) in 28s, 0 left
`,
  },

  keyPoints: [
    "Choose by audience: Queue API when nobody is waiting (cron pulls in the background), Batch API when a user clicked a button and needs a progress bar — production modules usually ship both.",
    "A good QueueWorker queues IDs not objects, is idempotent (items can be delivered twice), and picks its exception on purpose: return = delete, plain exception = retry after the lease expires, RequeueException = 'not finished yet', claim me again immediately (partial progress only — throwing it on contention makes cron re-claim the same item and burn the whole time budget), DelayedRequeueException($seconds) = back off and retry later, SuspendQueueException = abandon the whole queue this pass.",
    "Core has no max_retries and no failure transport — an always-failing item retries forever, so count attempts in the payload yourself or use contrib Advanced Queue.",
    "batch_set() takes operation callbacks; the engine re-invokes each one per HTTP request, passing &$context — sandbox and results are the two keys that survive between requests (message and finished are reset every invocation, finished back to 1), results feeds the finish callback, and finished is a fraction (< 1 means 'call me again'), not a boolean.",
    "Build batches with BatchBuilder (setTitle / setInitMessage / setProgressMessage / setFinishCallback / addOperation / toArray); callbacks must be strings or [Class::class, 'method'] arrays because the batch is serialized — never closures.",
    "The same batch runs headless: batch_set() + drush_backend_batch_process() from a Drush command, and hook_update_N uses the identical &$sandbox protocol, which is why drush updb can chew through millions of rows.",
  ],

  interview: [
    {
      q: "When would you use Drupal's Batch API instead of the Queue API, and can you use both for the same feature?",
      a: "The deciding factor is whether a human is waiting. Batch is **foreground and progressive**: an admin submits a form, `batch_set()` takes over the response, and the engine re-enters your operation callback once per HTTP request while showing a progress bar — the user gets feedback and a definite end. Queue is **background and pull-based**: `createItem()` drops a payload in the database and cron drains it later within the worker's `cron: ['time' => N]` budget, so the user's request returns immediately but nobody knows when the work lands. They compose well: I'd use a batch for the admin's 'close all stale incidents' button and a queue for the escalation emails those closures generate. A useful third pattern is a batch whose operations simply enqueue items, so the user watches the fast enqueuing and cron does the slow part.",
    },
    {
      q: "Walk me through the $context array in a batch operation. Why does the sandbox exist?",
      a: "Because a batch is not one long request — the browser is redirected to `/batch` and each operation callback runs in a **fresh Drupal bootstrap**, so ordinary local variables and static caches are gone every time. `$context['sandbox']` and `$context['results']` are **the two keys that persist across requests** — core binds both by reference into the stored batch set, while `message` and `finished` are reset on every invocation (`finished` back to 1). That is why the idiom is to seed `progress` and `max` on the first invocation (`if (!isset($context['sandbox']['progress']))`) and slice off 25–50 items per call. Sandbox is wiped once the operation completes; results is not, and it accumulates data for the finish callback. `$context['message']` is the line under the progress bar, and `$context['finished']` is a **fraction, not a boolean** — anything below 1 means 'call me again', and if you never set it Drupal assumes 1 and moves on, which is the classic bug where a batch processes only the first chunk. The finish callback then receives `($success, $results, $operations, $elapsed)`, where `$operations` holds whatever never ran.",
    },
    {
      q: "You know Symfony Messenger. What is genuinely missing from Drupal's QueueWorker, and how do you compensate?",
      a: "The handler shape is nearly identical — a small class, one payload, throw to signal failure — but the delivery guarantees around it are much thinner. Messenger gives you a configurable `retry_strategy` with `max_retries`, exponential backoff, a `failed` transport and `messenger:failed:show`/`retry` tooling. Drupal core gives you a lease: throw and the item just stays claimed until the lease expires, then gets retried **forever**, with no dead-letter destination and no CLI to inspect failures. So I compensate deliberately: keep an attempt counter in the payload and log-and-drop past a threshold, use `SuspendQueueException` when the failure is a shared dependency so I don't burn the whole cron budget hammering a dead gateway, make `processItem()` idempotent because double delivery is possible, and monitor depth with `drush queue:list`. On a high-volume site I'd reach for contrib Advanced Queue, which adds real retry counts and failure states.",
    },
    {
      q: "An admin form kicks off a batch that closes 600 nodes, and it dies with a fatal error halfway through. What actually happened and how do you make it robust?",
      a: "Almost always the slice is too big: the operation tried to load and save far more entities than one PHP request could handle, and it hit the memory limit or `max_execution_time`. Because each batch request is a fresh bootstrap, the fix is to shrink the unit of work — slice 25–50 nodes from the sandbox, save, update `$context['sandbox']['progress']`, and set `$context['finished']` to the fraction so the engine calls you again rather than trying to do it all at once. I'd also stop passing loaded entities as operation arguments (the whole batch is serialized into the database, so pass node IDs), re-check each entity's state inside the loop since the data can change mid-batch, and wrap per-item work in a try/catch that records failures into `$context['results']` so one bad node doesn't abort the run. Finally I'd expose the same work as a Drush command via `drush_backend_batch_process()` so it can be run headless on a big dataset.",
    },
  ],

  quiz: [
    {
      question:
        "In a batch operation callback you process a chunk of nodes and forget to set $context['finished']. What happens?",
      options: [
        "The batch loops forever, re-processing the same chunk",
        "Drupal defaults it to 1, so the operation is considered complete after the first chunk and the rest is never processed",
        "The batch throws a fatal error on the second request",
        "Nothing — Drupal infers progress from $context['sandbox']['progress']",
      ],
      answerIndex: 1,
      explain:
        "$context['finished'] defaults to 1, meaning 'this operation is done'. The batch engine moves on to the next operation (or the finish callback) after a single pass, so only the first slice is processed — a silent, very common bug. You must set it to progress / max yourself.",
    },
    {
      question:
        "IncidentNotifier::processItem() discovers the notification gateway is completely down. Which exception is the right choice?",
      options: [
        "RequeueException — release this item and keep going",
        "DelayedRequeueException(300) — retry this item in 5 minutes",
        "SuspendQueueException — stop draining this whole queue for this pass",
        "UnrecoverableMessageHandlingException — send it to the failure transport",
      ],
      answerIndex: 2,
      explain:
        "The failure is a shared dependency, so every remaining item would fail too. SuspendQueueException tells cron to abandon this queue for the rest of the pass, leaving the items intact for the next run. RequeueException and DelayedRequeueException only affect the single item, and UnrecoverableMessageHandlingException is Symfony Messenger, not Drupal.",
    },
    {
      question:
        "Why must batch operations and the finish callback be strings or [Class::class, 'method'] arrays rather than closures?",
      options: [
        "Coding standards forbid closures in Drupal",
        "Closures cannot accept a reference parameter like &$context",
        "The batch definition is serialized into the database between requests, and closures are not serializable",
        "The plugin system only discovers named methods",
      ],
      answerIndex: 2,
      explain:
        "A batch spans many HTTP requests, so the whole definition — operations, arguments and callbacks — is stored in the batch table and unserialized on each request. PHP cannot serialize a closure, so you must reference callables by name. It is the same reason you pass entity IDs rather than loaded entities as operation arguments.",
    },
    {
      question:
        "Which statement about the #[QueueWorker] plugin's cron: ['time' => 30] setting is correct?",
      options: [
        "Cron will process items from this queue for up to about 30 seconds per pass, after all hook_cron implementations have run",
        "The queue is drained every 30 seconds by a background daemon",
        "Each individual item is killed if processItem() takes longer than 30 seconds",
        "Items are retried at most 30 times before being discarded",
      ],
      answerIndex: 0,
      explain:
        "The cron key opts the queue into cron processing and 'time' is the drain budget per pass, checked before claiming each item (so the final item can overshoot slightly). It is not a per-item timeout, not an independent schedule, and not a retry limit — core has no retry limit at all.",
    },
  ],
};

export default lesson;
