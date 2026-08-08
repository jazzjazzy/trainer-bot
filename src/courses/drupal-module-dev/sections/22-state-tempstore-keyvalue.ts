import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "state-tempstore-keyvalue",
  title: "State, TempStore & Key-Value: Not Everything Is Config",
  part: "Data, State & Background Work",
  estMinutes: 12,
  summary:
    "Learn Drupal's four non-config stores — State, key_value(_expire), private TempStore and shared TempStore — and the 'would you deploy it?' litmus test that keeps runtime data like API cursors and wizard drafts out of incident_tracker's exported config.",

  concept: `
## The litmus test: would you deploy it?

Config answers "how is this site *supposed* to behave?" — it's exported by
\`drush cex\`, reviewed in git, and imported on every environment. But
incident_tracker also accumulates facts about **this environment right now**:
the timestamp of the last successful sync with the monitoring API, a paging
cursor, a half-finished report wizard, an "Alice is editing incident 42" lock.
Put those in config and you'd deploy your laptop's cron timestamp to
production. The rule: **if you wouldn't want it in a git diff, it isn't
config.** Drupal names the non-config tiers instead of leaving you to
hand-pick a cache pool, a session bag, or a custom Doctrine table like you
would in Symfony.

## The four tiers

- **State API** — \`\\Drupal::state()\` (service \`state\`), simple
  \`get('key', \$default)\` / \`set()\` / \`delete()\`. Per-environment runtime
  values: \`incident_tracker.last_sync\`, an API cursor, a "sync disabled"
  kill switch. Core uses it for \`system.cron_last\`. Never exported, survives
  cache rebuilds, and values are cached so reads are cheap.
- **key_value / key_value_expire** — the generic engine *underneath*: State
  is literally the \`state\` collection in the \`key_value\` table. Grab your
  own collection with \`\\Drupal::keyValue('incident_tracker_sync')\` when you
  have many related keys, or \`keyvalue.expirable\` when entries should die on
  their own: \`->setWithExpire('payload', \$data, 900)\`. Unlike the Cache
  API, this data is **not** wiped by \`drush cr\` — use it for things you'd
  rather not lose but can afford to expire.
- **Private TempStore** — \`tempstore.private\`, per-user and expiring
  (default one week, the \`tempstore.expire\` container parameter). Perfect
  for multi-step wizard data or "selected rows" between requests. Keys are
  silently prefixed with the user's uid, so authenticated users keep their
  draft across browsers and logins; anonymous users fall back to a session
  identifier.
- **Shared TempStore** — \`tempstore.shared\`, same table but every entry
  remembers an **owner**. This is cross-user work-in-progress: the classic
  example is the Views editor's "locked by another user" banner. Methods like
  \`setIfNotExists()\`, \`setIfOwner()\` and \`getMetadata()\` (returning a
  \`Lock\` object with \`getOwnerId()\`) give you edit-lock semantics for
  free.

Both TempStores live in the \`key_value_expire\` table under collections like
\`tempstore.private.incident_tracker\` — they're wrappers, not new storage.

## What about sessions?

The Symfony session is still there — \`\$request->getSession()->get()/set()\`
works in any controller for classic flash-style, browser-tab-scoped data. But
prefer private TempStore for anything that should outlive one browser: it's
uid-keyed for logged-in users, expiring, and identical in Drupal 10 and 11.

## In incident_tracker

This section wires three of the tiers into the module: the sync service
stores its cursor in State, the report wizard parks step data in private
TempStore, and the triage screen takes a shared-TempStore edit lock so two
responders can't clobber each other's triage.
`,

  comparisons: [
    {
      label: "Runtime cursor: hand-rolled table vs State API",
      intro:
        "The sync service must remember where it left off with the monitoring API. In Symfony you'd hand-roll storage (parameters are compile-time, so they can't change at runtime); Drupal ships the tier as the state service.",
      php: `<?php
// Symfony: parameters are frozen at compile time, so a runtime
// cursor needs hand-rolled storage — e.g. a tiny DBAL-backed table.
use Doctrine\\DBAL\\Connection;

class IncidentSyncService
{
    public function __construct(private Connection $db) {}

    public function sync(): void
    {
        $since = (int) ($this->db->fetchOne(
            'SELECT value FROM app_runtime WHERE name = ?',
            ['incident_sync.last_run'],
        ) ?: 0);

        // ... pull incidents newer than $since ...

        $this->db->executeStatement(
            'REPLACE INTO app_runtime (name, value) VALUES (?, ?)',
            ['incident_sync.last_run', time()],
        );
    }
}`,
      ts: `<?php
// Drupal: inject the 'state' service — no schema, no table, and
// the value stays out of config exports. Identical in D10 and D11.
namespace Drupal\\incident_tracker;

use Drupal\\Core\\State\\StateInterface;

class IncidentSyncService {

  public function __construct(
    private readonly StateInterface $state,
  ) {}

  public function sync(): void {
    $since = $this->state->get('incident_tracker.last_sync', 0);

    // ... pull incidents newer than $since from the API ...

    $this->state->set('incident_tracker.last_sync', \\Drupal::time()->getRequestTime());
  }

}`,
      note:
        "Wire it with arguments: ['@state'] in incident_tracker.services.yml. State rides the key_value table's 'state' collection and is cached — but it is NOT exported by drush cex, which is exactly the point.",
    },
    {
      label: "Wizard drafts: session vs private TempStore",
      intro:
        "A multi-step 'report incident' wizard needs step data between requests. Symfony reaches for the session; Drupal's private TempStore is uid-keyed and expiring, so a logged-in responder can resume the draft from another browser.",
      php: `<?php
// Symfony: stash wizard state in the session — gone when the
// session ends, and tied to this one browser's cookie.
use Symfony\\Component\\HttpFoundation\\Request;

class ReportWizardController
{
    public function step2(Request $request)
    {
        $session = $request->getSession();

        $draft = $session->get('incident_wizard', []);
        $draft['severity'] = 'critical';
        $session->set('incident_wizard', $draft);

        // ... render step 2 ...
    }
}`,
      ts: `<?php
// Drupal: tempstore.private prefixes every key with the uid and
// expires entries (default: one week). Survives logout/login.
namespace Drupal\\incident_tracker\\Form;

use Drupal\\Core\\TempStore\\PrivateTempStoreFactory;

class ReportWizardForm {

  private readonly \\Drupal\\Core\\TempStore\\PrivateTempStore $tempStore;

  public function __construct(PrivateTempStoreFactory $factory) {
    // Collection 'incident_tracker' in the key_value_expire table.
    $this->tempStore = $factory->get('incident_tracker');
  }

  public function saveStep(array $values): void {
    $draft = $this->tempStore->get('report_wizard') ?? [];
    $draft['severity'] = $values['severity'];
    $this->tempStore->set('report_wizard', $draft);   // key becomes "7:report_wizard"
  }

  public function finish(): void {
    // ... create the incident, then throw the draft away.
    $this->tempStore->delete('report_wizard');
  }

}`,
      note:
        "Inject '@tempstore.private' and call ->get('incident_tracker') to derive your collection. set() can throw TempStoreException if the underlying lock can't be acquired. For plain flash-style data, $request->getSession() still works exactly as in Symfony.",
    },
    {
      label: "Edit locks: symfony/lock vs shared TempStore",
      intro:
        "Two responders opening the triage screen for incident 42 shouldn't overwrite each other. Symfony's lock component and Drupal's shared TempStore solve the same problem — but TempStore also tells you WHO holds the lock, Views-style.",
      php: `<?php
// Symfony: symfony/lock — great for mutual exclusion, but the
// 'who holds it?' UI story is yours to build.
use Symfony\\Component\\Lock\\LockFactory;

class TriageController
{
    public function __construct(private LockFactory $lockFactory) {}

    public function edit(int $id)
    {
        $lock = $this->lockFactory->createLock('incident-edit-' . $id, 1800);

        if (!$lock->acquire()) {
            // Locked — but by whom? You'd store that yourself.
            return $this->render('triage/locked.html.twig');
        }
        // ... show the triage form ...
    }
}`,
      ts: `<?php
// Drupal: tempstore.shared — entries carry an owner, so the
// "locked by Alice — break lock?" banner comes almost for free.
namespace Drupal\\incident_tracker\\Controller;

use Drupal\\Core\\TempStore\\SharedTempStoreFactory;

class TriageController {

  private readonly \\Drupal\\Core\\TempStore\\SharedTempStore $tempStore;

  public function __construct(SharedTempStoreFactory $factory) {
    $this->tempStore = $factory->get('incident_tracker');
  }

  public function edit(int $id) {
    $key = 'triage:' . $id;

    if (!$this->tempStore->setIfNotExists($key, ['started' => time()])) {
      // Someone else holds it — getMetadata() returns a Lock object.
      $ownerId = $this->tempStore->getMetadata($key)?->getOwnerId();
      // ... render "Locked by uid $ownerId" with a break-lock link
      //     that calls $this->tempStore->delete($key). ...
    }
    // We own it: setIfOwner()/deleteIfOwner() keep it that way.
  }

}`,
      note:
        "This is exactly how the Views UI implements edit locking. Drupal also has a low-level '@lock' service like symfony/lock, but that's for short critical sections within a request — shared TempStore is for human-scale, cross-request locks.",
    },
    {
      label: "Expiring payload cache: cache pool vs key_value_expire",
      intro:
        "The last raw API payload is worth keeping for 15 minutes for debugging — but a cache pool may be wiped at any moment. key_value_expire only forgets when the TTL says so.",
      php: `<?php
// Symfony: a cache pool with a TTL. Correct — but cache:clear
// (or an eviction) can erase it early, by design.
// PSR-6 save() overwrites on every call; CacheInterface::get()
// with a callback would only run on a MISS and skip later payloads.
use Psr\\Cache\\CacheItemPoolInterface;

class PayloadRecorder
{
    public function __construct(private CacheItemPoolInterface $pool) {}

    public function record(array $payload): void
    {
        $item = $this->pool->getItem('incident_api.payload');
        $item->set($payload)->expiresAfter(900);
        $this->pool->save($item);
    }
}`,
      ts: `<?php
// Drupal: keyvalue.expirable — NOT flushed by 'drush cr'; rows
// disappear only when their expiry passes.
use Drupal\\Core\\KeyValueStore\\KeyValueExpirableFactoryInterface;

class PayloadRecorder {

  private readonly \\Drupal\\Core\\KeyValueStore\\KeyValueStoreExpirableInterface $store;

  public function __construct(KeyValueExpirableFactoryInterface $factory) {
    $this->store = $factory->get('incident_tracker_api');
  }

  public function record(array $payload): void {
    // Key, value, TTL in seconds.
    $this->store->setWithExpire('payload:latest', $payload, 900);
  }

  public function latest(): ?array {
    return $this->store->get('payload:latest');
  }

}`,
      note:
        "Rule of thumb: Cache API for anything you can recompute (it may vanish any time); key_value_expire for data you'd rather keep but can afford to lose on schedule. The non-expiring twin is \\Drupal::keyValue('collection') via the 'keyvalue' factory service.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "All four tiers are one generic key-value engine with smarter wrappers. This simulation builds the engine, then layers State (a collection), private TempStore (uid-prefixed keys) and shared TempStore (owned rows) on top. Predict each line — mind var_export's casing — then run.",
    code: `<?php
// Drupal's non-config tiers are ONE generic key-value engine plus
// smarter wrappers: state -> key_value table ('state' collection);
// both tempstores -> key_value_expire. Simulate the whole stack.

class KeyValueStore {
    private array $rows = [];

    public function __construct(public readonly string $collection) {}

    public function get(string $key, mixed $default = NULL): mixed {
        return $this->rows[$key] ?? $default;
    }

    public function set(string $key, mixed $value): void {
        $this->rows[$key] = $value;
    }

    public function setIfNotExists(string $key, mixed $value): bool {
        if (array_key_exists($key, $this->rows)) {
            return FALSE;               // someone beat us to it
        }
        $this->rows[$key] = $value;
        return TRUE;
    }
}

// The factory: one store per collection (services @keyvalue /
// @keyvalue.expirable in real Drupal).
$stores = [];
$keyValue = function (string $collection) use (&$stores): KeyValueStore {
    return $stores[$collection] ??= new KeyValueStore($collection);
};

// -- 1. STATE: just the 'state' collection. Per-environment runtime
//       facts. NEVER exported by 'drush cex'.
$state = $keyValue('state');
$state->set('incident_tracker.last_sync', 1754617200);
echo "STATE   last_sync = " . $state->get('incident_tracker.last_sync') . "\\n";
echo "STATE   missing key, default = " . $state->get('incident_tracker.api_cursor', 0) . "\\n\\n";

// -- 2. PRIVATE TEMPSTORE: per-user drafts. Drupal silently prefixes
//       every key with the owner's uid, so users never collide.
class PrivateTempStore {
    public function __construct(
        private KeyValueStore $store,
        private int $uid,
    ) {}

    public function set(string $key, mixed $value): void {
        $this->store->set($this->uid . ':' . $key, $value);
    }

    public function get(string $key): mixed {
        return $this->store->get($this->uid . ':' . $key);
    }
}

$drafts = $keyValue('tempstore.private.incident_tracker');
$alice  = new PrivateTempStore($drafts, 7);
$bob    = new PrivateTempStore($drafts, 9);
$alice->set('report_wizard', ['step' => 2, 'title' => 'API gateway 500s']);
echo "PRIVATE alice's draft: " . $alice->get('report_wizard')['title'] . "\\n";
echo "PRIVATE bob's draft:   " . var_export($bob->get('report_wizard'), TRUE) . "\\n\\n";

// -- 3. SHARED TEMPSTORE: one value visible to everyone, but each row
//       remembers an OWNER -- exactly how Views edit-locking works.
class SharedTempStore {
    public function __construct(
        private KeyValueStore $store,
        private int $uid,
    ) {}

    public function setIfNotExists(string $key, mixed $value): bool {
        return $this->store->setIfNotExists(
            $key,
            ['owner' => $this->uid, 'data' => $value],
        );
    }

    public function getOwnerId(string $key): ?int {
        $row = $this->store->get($key);
        return $row === NULL ? NULL : $row['owner'];
    }
}

$locks = $keyValue('tempstore.shared.incident_tracker');
$aliceLock = new SharedTempStore($locks, 7);
$bobLock   = new SharedTempStore($locks, 9);

echo "SHARED  alice locks incident 42: " . var_export($aliceLock->setIfNotExists('edit:42', TRUE), TRUE) . "\\n";
echo "SHARED  bob locks incident 42:   " . var_export($bobLock->setIfNotExists('edit:42', TRUE), TRUE) . "\\n";
echo "SHARED  bob's UI: 'locked by uid " . $bobLock->getOwnerId('edit:42') . "' -- offer Break lock";`,
    output: `STATE   last_sync = 1754617200
STATE   missing key, default = 0

PRIVATE alice's draft: API gateway 500s
PRIVATE bob's draft:   NULL

SHARED  alice locks incident 42: true
SHARED  bob locks incident 42:   false
SHARED  bob's UI: 'locked by uid 7' -- offer Break lock`,
  },

  keyPoints: [
    "Litmus test: config is 'how the site is supposed to behave' and gets deployed via drush cex/cim; State, key-value and TempStore hold facts about ONE environment right now and are never exported.",
    "State API (\\Drupal::state()->get/set/delete, service 'state') is for per-environment runtime values — last_sync timestamps, API cursors, kill switches — and is really just the 'state' collection of the generic key_value table.",
    "\\Drupal::keyValue('collection') and the keyvalue.expirable factory (setWithExpire($key, $value, $ttl)) are the raw engine; unlike the Cache API their data survives drush cr and only expirable rows ever disappear on their own.",
    "Private TempStore (tempstore.private) is per-user and expiring (default one week via the tempstore.expire parameter): keys are uid-prefixed, so wizard drafts survive logout and browser changes — better than the session for anything multi-request.",
    "Shared TempStore (tempstore.shared) stores owned, expiring entries for cross-user work-in-progress; setIfNotExists()/setIfOwner()/getMetadata()->getOwnerId() give you Views-style 'locked by another user' edit locks.",
    "Classic sessions still exist — $request->getSession() is the same Symfony HttpFoundation session — and both TempStores physically live in the key_value_expire table under tempstore.private.MODULE / tempstore.shared.MODULE collections.",
  ],

  interview: [
    {
      q: "How do you decide whether a value belongs in config or in the State API?",
      a: "Ask: 'would I deploy this?' Config describes intended site behavior — it's exported with `drush cex`, code-reviewed, and imported identically on every environment. State describes what has *happened* in one environment: the last cron or API-sync timestamp, a pager cursor, a temporary kill switch. Put runtime data in config and you get noisy git diffs and, worse, `drush cim` on deploy will overwrite production's live value with whatever a developer last exported. Core models it too: `system.cron_last` is state, while `system.site` (the site name) is config. State rides the key_value table's `state` collection and never appears in a config export.",
    },
    {
      q: "What's the difference between private and shared TempStore, and when would you use each?",
      a: "Both live in the `key_value_expire` table and expire (default one week), but private TempStore (`tempstore.private`) silently prefixes every key with the current user's uid — each user gets an isolated namespace, ideal for multi-step wizard drafts or bulk-operation selections that should survive across requests and even browsers. Shared TempStore (`tempstore.shared`) has one namespace visible to all users, but each entry records an owner; `setIfNotExists()`, `setIfOwner()` and `getMetadata()->getOwnerId()` turn that into edit-lock semantics — it's exactly how the Views UI shows 'this view is being edited by another user' with a break-lock option. Rule of thumb: private = my unfinished work, shared = our contested resource.",
    },
    {
      q: "Why not just use the Cache API instead of key_value_expire or TempStore for this kind of data?",
      a: "Because caches are disposable by contract: `drush cr`, a deploy, or backend eviction can wipe them at any moment, so anything you can't cheaply recompute doesn't belong there. A user's half-finished wizard draft or an edit lock can't be 'recomputed' — losing it loses real work. key_value_expire (and the TempStores built on it) survives cache rebuilds and only removes rows when their expiry passes. The Symfony parallel: you'd never keep a wizard draft in a Symfony cache pool either — you'd use the session or a table; Drupal just gives those tiers first-class names and APIs.",
    },
    {
      q: "Coming from Symfony, what maps to Drupal's non-config storage tiers?",
      a: "Symfony parameters map to Drupal *config* (deploy-time, in git) — but for runtime data Symfony makes you hand-pick: a custom Doctrine table for something like a sync cursor, the session for per-user flow state, `symfony/lock` for mutual exclusion, a cache pool with TTL for expiring data. Drupal names those tiers: State for environment facts, private TempStore for per-user drafts (uid-keyed, so it beats the session across browsers), shared TempStore for cross-user locks that also tell you *who* holds them, and key_value_expire as the generic TTL store that — unlike a cache — isn't flushed on rebuild. The session itself is still there via `$request->getSession()`, same HttpFoundation object you already know.",
    },
  ],

  quiz: [
    {
      question:
        "incident_tracker's sync service needs to remember the timestamp of its last successful API pull, per environment. Where does it belong?",
      options: [
        "incident_tracker.settings simple config, saved from a ConfigFormBase",
        "The State API: \\Drupal::state()->set('incident_tracker.last_sync', $ts)",
        "The Cache API with a permanent expiry",
        "Private TempStore keyed by the cron user",
      ],
      answerIndex: 1,
      explain:
        "It's a fact about one environment, not intended behavior — putting it in config would export dev's timestamp to production on the next cim. Cache is wrong because a drush cr would erase it and force a full re-sync; TempStore is wrong because it's per-user and expiring. State is exactly this tier: runtime values that survive cache rebuilds and never appear in config exports.",
    },
    {
      question:
        "A logged-in responder starts the 3-step 'report incident' wizard on their desktop and wants to finish it on their laptop tomorrow. Which store makes that work?",
      options: [
        "$request->getSession() — session storage follows the user",
        "Shared TempStore, so both machines can see it",
        "Private TempStore — keys are prefixed with the uid, not tied to one browser's session",
        "The State API with the uid baked into the key name",
      ],
      answerIndex: 2,
      explain:
        "Private TempStore keys are silently prefixed with the user's uid, so any authenticated session for that user sees the same draft — and entries expire (default one week) so abandoned drafts clean themselves up. A session is tied to one browser's cookie; shared TempStore would expose the draft to every user; hand-rolling uid keys in State works but never expires and reinvents what tempstore.private already does.",
    },
    {
      question:
        "What does SharedTempStore::getMetadata($key) give you that makes Views-style edit locking possible?",
      options: [
        "The serialized value plus its cache tags",
        "A Lock object exposing the owner (getOwnerId()), so you can render 'locked by user X — break lock?'",
        "The list of all users currently viewing the entry",
        "The number of seconds until the entry expires",
      ],
      answerIndex: 1,
      explain:
        "Shared TempStore entries record an owner; getMetadata() returns a Lock object whose getOwnerId() (and getUpdated()) let you tell the second user exactly who holds the work-in-progress and offer a break-lock action that delete()s the entry. Plain symfony/lock-style mutexes only tell you that acquisition failed, not who won.",
    },
    {
      question:
        "After running 'drush cex' and 'drush cr' on production, which data is still sitting safely in the database?",
      options: [
        "Only exported config — everything else is flushed",
        "State values and key_value/key_value_expire rows (including TempStore entries); only caches were flushed and only config was exported",
        "Nothing — cex exports and cr clears all storage tiers",
        "State values are exported to YAML alongside config",
      ],
      answerIndex: 1,
      explain:
        "drush cex exports config only — State and key-value data never leave the environment. drush cr flushes cache bins, which is precisely why non-recomputable data goes in key_value(_expire) instead of the Cache API: state, plain key-value rows and TempStore entries all survive a rebuild, with expirable rows disappearing only when their TTL passes.",
    },
  ],
};

export default lesson;
