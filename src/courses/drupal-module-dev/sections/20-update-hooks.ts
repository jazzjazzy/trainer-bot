import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "update-hooks",
  title: "Update Hooks: Schema & Data Migrations",
  part: "Data, State & Background Work",
  estMinutes: 13,
  summary:
    "Ship schema and data changes with hook_update_N and hook_post_update_NAME — Drupal's built-in, run-once-per-site answer to Doctrine migrations, batched via $sandbox and executed with drush updb.",

  concept: `
## Your migration system ships with core

In Symfony you install DoctrineMigrationsBundle; in Drupal the migration runner
is already there. A module publishes schema and data changes as
\`hook_update_N()\` functions in its \`.install\` file, and every site records
the highest N it has executed — one integer per module in the key_value store
(collection \`system.schema\`). That record is the moral equivalent of the
\`doctrine_migration_versions\` table: each update runs **once per site**, in
order, when a deployer runs \`drush updb\` (or visits \`/update.php\`).
\`drush deploy\` bundles the whole ritual — \`updb\`, \`config:import\`, cache
rebuild. Identical in Drupal 10 and 11.

### Naming: incident_tracker_update_10001

N is a convention: one or two digits for the core major version, one or two for
your module's major version, two for a counter. \`incident_tracker_update_10001\`
reads "Drupal 10 era, module 0.x, first update"; the next is \`10002\`. Two
rules are absolute: N only ever increases, and you never renumber or rewrite a
shipped update — sites that already ran it will never run it again.

### Schema changes: the raw Schema API

Inside an update you talk to the database directly:

\`\`\`php
$schema = \\Drupal::database()->schema();
$schema->addField('incident_log', 'assignee', [/* spec */]);
$schema->changeField('incident_log', 'message', 'message', [/* spec */]);
$schema->createTable('incident_tracker_audit', [/* table spec */]);
\`\`\`

The target is \`incident_log\`, the plain \`hook_schema()\` table from the
previous section — and that pairing matters. An update_N upgrades **existing**
sites only; \`hook_schema()\` is read at install time and never again, so every
column you add in an update must also be added to the hook_schema definition
for fresh installs. (Entity base tables like the \`incident\` entity's are
different territory: never raw-ALTER those — base-field changes go through
\`\\Drupal::entityDefinitionUpdateManager()\`.)

There is no \`down()\`. Drupal updates are one-way; the rollback plan is the
database backup you took before running \`updb\`.

### Big data: the $sandbox batch protocol

An update touching a million rows cannot finish in one request. Accept
\`&$sandbox\`, stash \`progress\` and \`max\` in it, process one slice, and set
\`$sandbox['#finished']\` to a float. Anything below 1 makes the runner call
the **same function again** with the same sandbox; 1 means done. Whatever you
return is the **result message, reported once the update finishes** — the
progress line during batching is core's own "Updating <module>", and each pass's
return value overwrites the previous one, so only the last survives. Make it a
summary, not a running tally.

### hook_post_update_NAME: the second phase

\`incident_tracker.post_update.php\` holds
\`incident_tracker_post_update_NAME()\` functions. They run after **all**
\`hook_update_N\` implementations of **every** module, on a freshly rebuilt
container — full entity API, config factory, your services. They're tracked by
function name (key_value collection \`post_update\`), run once, and support the
same \`$sandbox\` batching. Rule of thumb: schema surgery in \`update_N\`,
API-level fixes (config changes, entity re-saves) in \`post_update\`.

### The discipline that saves deployments

\`hook_update_N\` executes in a half-upgraded world: new code is on disk, but
the database and container still reflect the old release, and other modules'
updates may not have run yet. So an update hook must be **self-contained**:
raw queries only — no calls into your module's classes or services (the
classic trap: an update invoking a service whose constructor changed in the
very release being deployed), no entity API. If something goes wrong, throw
\`\\Drupal\\Core\\Utility\\UpdateException\` so the runner marks the update
failed. And a Drupal 11.1+ note: even with OOP \`#[Hook]\` classes, install
and update hooks are explicitly excluded from the conversion — they stay
procedural functions in \`.install\` forever.
`,

  comparisons: [
    {
      label: "One schema change, one run-once function",
      intro:
        "Doctrine gives you a timestamped class per change; Drupal gives you a numbered function per change in the .install file, using the Schema API instead of DBAL.",
      php: `<?php
// migrations/Version20260807143000.php — one class per change,
// timestamped name, recorded in doctrine_migration_versions.
declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\\DBAL\\Schema\\Schema;
use Doctrine\\Migrations\\AbstractMigration;

final class Version20260807143000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add an assignee column to the incident table';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('incident')->addColumn(
            'assignee',
            'string',
            ['length' => 64, 'notnull' => true, 'default' => ''],
        );
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('incident')->dropColumn('assignee');
    }
}`,
      ts: `<?php
// incident_tracker.install — loaded only during install/update ops.
// The docblock's first line is the description deployers see.

/**
 * Add an assignee column to the incident_log table.
 */
function incident_tracker_update_10001() {
  $schema = \\Drupal::database()->schema();
  $schema->addField('incident_log', 'assignee', [
    'type' => 'varchar_ascii',
    'length' => 64,
    'not null' => TRUE,
    'default' => '',
    'description' => 'Machine name of the engineer on the hook.',
  ]);
  return t('Added the assignee column.');
}

/**
 * Widen message and add the audit-trail table.
 */
function incident_tracker_update_10002() {
  $schema = \\Drupal::database()->schema();
  $schema->changeField('incident_log', 'message', 'message', [
    'type' => 'varchar',
    'length' => 512,
    'not null' => TRUE,
  ]);
  $schema->createTable('incident_tracker_audit', [
    'description' => 'Audit trail for incident changes.',
    'fields' => [
      'id' => ['type' => 'serial', 'not null' => TRUE],
      'incident_id' => [
        'type' => 'int', 'unsigned' => TRUE, 'not null' => TRUE,
      ],
      'note' => [
        'type' => 'varchar', 'length' => 255,
        'not null' => TRUE, 'default' => '',
      ],
    ],
    'primary key' => ['id'],
    'indexes' => ['incident_id' => ['incident_id']],
  ]);
}`,
      note:
        "N encodes core major + module major + a two-digit counter: 10001 = Drupal 10, module 0.x, update 01 — and shipped Ns are never renumbered or edited. There is no down(): Drupal updates are one-way, so your rollback is the pre-updb database backup. Remember the pairing: update_N migrates existing sites, and hook_schema() gains the same columns so new installs are born current.",
    },
    {
      label: "Deploy day: check status, run, record",
      intro:
        "Both runners answer the same two questions — what's pending, and has it run here before? Doctrine tracks class names in a table; Drupal tracks one schema-version integer per module in key_value.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# After deploying new code: what is pending on THIS database?
$ php bin/console doctrine:migrations:list
DoctrineMigrations\\Version20260807143000 | not migrated | Add assignee

# Apply. Each version is INSERTed into doctrine_migration_versions,
# so it never runs again on this database.
$ php bin/console doctrine:migrations:migrate --no-interaction
[notice] Migrating up to DoctrineMigrations\\Version20260807143000
[notice] finished in 231ms, 1 migrations executed, 2 sql queries`,
      ts: `# After deploying new code: what is pending on THIS site?
$ drush updatedb:status
 ------------------ ----------- --------------- -----------------------
  Module             Update ID   Type            Description
 ------------------ ----------- --------------- -----------------------
  incident_tracker   10001       hook_update_n   10001 - Add an assignee
                                                 column to the
                                                 incident_log table.

# Apply: hook_update_N in order, then post-updates, then cache rebuild.
# The new N lands in key_value (collection 'system.schema').
$ drush updb -y
>  [notice] Update started: incident_tracker_update_10001
>  [notice] Update completed: incident_tracker_update_10001
 [success] Finished performing updates.`,
      note:
        "drush deploy chains the full ritual (updb, config:import, cache:rebuild, deploy:hook). Peek at the recorded version with: drush php:eval \"echo \\Drupal::keyValue('system.schema')->get('incident_tracker');\" — and only ever reset it on a throwaway dev copy.",
    },
    {
      label: "Big data: batched updates via &$sandbox",
      intro:
        "A million-row backfill can't run in one request. Symfony teams write a pageable one-off command and remember to run it; Drupal's update runner has resumable batching built in.",
      php: `<?php
// Symfony: big one-off data changes usually leave migrations — you
// write a console command that loops in pages, then remember to run
// it (and to never run it twice) on every environment.
namespace App\\Command;

use Doctrine\\DBAL\\Connection;
use Symfony\\Component\\Console\\Attribute\\AsCommand;
use Symfony\\Component\\Console\\Command\\Command;
use Symfony\\Component\\Console\\Input\\InputInterface;
use Symfony\\Component\\Console\\Output\\OutputInterface;

#[AsCommand('app:backfill-assignee')]
class BackfillAssigneeCommand extends Command
{
    public function __construct(private readonly Connection $db)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        do {
            $affected = $this->db->executeStatement(
                "UPDATE incident SET assignee = 'duty-officer'
                 WHERE assignee = '' LIMIT 500"
            );
            $out->writeln("Updated $affected rows");
        } while ($affected > 0);

        return Command::SUCCESS;
    }
}`,
      ts: `<?php
// incident_tracker.install — the runner persists $sandbox and keeps
// re-invoking this function until #finished reaches 1: one request-
// sized bite at a time via update.php, continuously under drush.

/**
 * Backfill assignee on existing incident_log rows.
 */
function incident_tracker_update_10003(&$sandbox) {
  $db = \\Drupal::database();

  if (!isset($sandbox['progress'])) {
    $sandbox['progress'] = 0;
    $sandbox['max'] = (int) $db->select('incident_log', 'i')
      ->countQuery()->execute()->fetchField();
  }

  $ids = $db->select('incident_log', 'i')
    ->fields('i', ['id'])
    ->condition('i.assignee', '')
    ->range(0, 500)
    ->execute()->fetchCol();

  if ($ids) {
    $db->update('incident_log')
      ->fields(['assignee' => 'duty-officer'])
      ->condition('id', $ids, 'IN')
      ->execute();
    $sandbox['progress'] += count($ids);
  }

  // < 1 => "call me again with the same $sandbox"; 1 => done.
  $sandbox['#finished'] = ($sandbox['max'] === 0 || !$ids)
    ? 1
    : $sandbox['progress'] / $sandbox['max'];

  return t('Backfilled @done of @max incidents.', [
    '@done' => $sandbox['progress'],
    '@max' => $sandbox['max'],
  ]);
}`,
      note:
        "Note the raw dynamic queries: no incident_tracker services, no entity API. This function may run while the container still describes the OLD release — self-contained SQL is the only safe dialect in hook_update_N.",
    },
    {
      label: "Post-deploy data fixes: hook_post_update_NAME",
      intro:
        "Doctrine's docs warn against using the EntityManager inside migrations — the exact discipline Drupal enforces by splitting phases: raw SQL in update_N, then post_update functions with the full API.",
      php: `<?php
// Symfony has no tracked post-deploy slot. Teams either stuff data
// fixes into a migration (Doctrine's advice: DBAL only — the ORM's
// mappings may not match the half-migrated schema) or fire one-off
// commands from a deploy script, with nothing recording that they
// already ran on this environment.
declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\\DBAL\\Schema\\Schema;
use Doctrine\\Migrations\\AbstractMigration;

final class Version20260807150000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql(
            "UPDATE incident SET assignee = 'duty-officer'
             WHERE assignee IS NULL"
        );
    }
}`,
      ts: `<?php
// incident_tracker.post_update.php — every function here runs AFTER
// all hook_update_N of ALL modules, on a freshly rebuilt container.
// Tracked by NAME (key_value collection 'post_update'), run once.

/**
 * Turn on the daily digest for existing sites.
 */
function incident_tracker_post_update_enable_daily_digest() {
  \\Drupal::configFactory()
    ->getEditable('incident_tracker.settings')
    ->set('daily_digest', TRUE)
    ->save();
}

/**
 * Re-save incidents so the new presave logic stamps them.
 */
function incident_tracker_post_update_resave_incidents(&$sandbox = NULL) {
  // Entity API is safe HERE: schema updates are finished and the
  // container matches the new code. Batching works the same way.
  $storage = \\Drupal::entityTypeManager()->getStorage('incident');
  if (!isset($sandbox['ids'])) {
    $sandbox['ids'] = $storage->getQuery()->accessCheck(FALSE)->execute();
    $sandbox['max'] = count($sandbox['ids']);
  }
  $batch = array_splice($sandbox['ids'], 0, 50);
  foreach ($storage->loadMultiple($batch) as $incident) {
    $incident->save();
  }
  $sandbox['#finished'] = $sandbox['max'] === 0
    ? 1
    : 1 - count($sandbox['ids']) / $sandbox['max'];
}`,
      note:
        "Split rule: schema surgery in .install's hook_update_N (raw SQL), API-level fixes in .post_update.php (full container). Post-updates are tracked by function name, so like Ns they are write-once — never rename a shipped one.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The update runner in miniature: schema versions live in a key_value map, pending hook_update_N functions are discovered by name, the batched one re-runs until #finished reaches 1, and a second 'drush updb' finds nothing to do. Predict the output, then run.",
    code: `<?php
// Simulate Drupal's update runner: the installed schema version lives in
// the key_value store (collection 'system.schema'), pending
// hook_update_N functions are discovered by name, batched ones re-run
// until $sandbox['#finished'] reaches 1, and each applied N is recorded
// so it never runs again. (Hooks get an extra &$db here only because the
// simulation has no real database connection.)

$keyValue = ['system.schema' => ['incident_tracker' => 10000]];

// A fake incident_log table: assignee column just added, still empty.
$db = [
    ['id' => 1, 'message' => 'Disk full on web-01',  'assignee' => null],
    ['id' => 2, 'message' => 'API timeout spike',    'assignee' => null],
    ['id' => 3, 'message' => 'SSL cert expired',     'assignee' => null],
    ['id' => 4, 'message' => 'Queue backlog rising', 'assignee' => null],
    ['id' => 5, 'message' => 'OOM during cron run',  'assignee' => null],
];

// hook_update_N #1 - a schema change. Instant, no batching needed.
function incident_tracker_update_10001(array &$sandbox, array &$db): string {
    // Real code: \\Drupal::database()->schema()->addField(...)
    $sandbox['#finished'] = 1;
    return 'Added assignee field to incident_log.';
}

// hook_update_N #2 - a data backfill, batched 2 rows per pass.
function incident_tracker_update_10002(array &$sandbox, array &$db): string {
    if (!isset($sandbox['progress'])) {
        $sandbox['progress'] = 0;
        $sandbox['max'] = count($db);
    }
    $slice = array_slice($db, $sandbox['progress'], 2, true);
    foreach ($slice as $key => $row) {
        $db[$key]['assignee'] = 'duty-officer';
        $sandbox['progress']++;
    }
    $sandbox['#finished'] = $sandbox['progress'] / $sandbox['max'];
    return $sandbox['#finished'] >= 1
        ? "Backfilled assignee for all {$sandbox['max']} incidents."
        : "Backfilled {$sandbox['progress']} of {$sandbox['max']} incidents.";
}

// A minimal "drush updb": run everything above the installed version.
function run_pending_updates(array &$keyValue, array &$db): int {
    $applied = 0;
    $installed = $keyValue['system.schema']['incident_tracker'];
    foreach (range($installed + 1, $installed + 50) as $n) {
        $fn = "incident_tracker_update_$n";
        if (!function_exists($fn)) {
            continue;
        }
        $sandbox = [];
        do {  // batched updates re-run until #finished reaches 1
            echo "  [$n] " . $fn($sandbox, $db) . "\\n";
        } while ($sandbox['#finished'] < 1);
        $keyValue['system.schema']['incident_tracker'] = $n;  // record
        $applied++;
    }
    return $applied;
}

echo "drush updb (installed schema version: "
    . $keyValue['system.schema']['incident_tracker'] . ")\\n";
$count = run_pending_updates($keyValue, $db);
echo "Applied $count update(s); schema version is now "
    . $keyValue['system.schema']['incident_tracker'] . ".\\n\\n";

echo "drush updb again (installed schema version: "
    . $keyValue['system.schema']['incident_tracker'] . ")\\n";
$count = run_pending_updates($keyValue, $db);
echo "Applied $count update(s) - each hook_update_N runs ONCE per site.";`,
    output: `drush updb (installed schema version: 10000)
  [10001] Added assignee field to incident_log.
  [10002] Backfilled 2 of 5 incidents.
  [10002] Backfilled 4 of 5 incidents.
  [10002] Backfilled assignee for all 5 incidents.
Applied 2 update(s); schema version is now 10002.

drush updb again (installed schema version: 10002)
Applied 0 update(s) - each hook_update_N runs ONCE per site.`,
  },

  keyPoints: [
    "hook_update_N lives in the .install file; N = core major + module major + two-digit counter (10001, 10002, ...). N only increases, and a shipped update is never renumbered or edited — sites that ran it will never run it again.",
    "Each site tracks the highest executed N as one integer per module in key_value collection 'system.schema' — Drupal's doctrine_migration_versions. drush updb (or /update.php) runs the pending ones in order; drush deploy chains updb + config:import + cache rebuild.",
    "Schema changes use the raw Schema API — \\Drupal::database()->schema() with addField(), changeField(), createTable() — and there is no down(): rollback means restoring the pre-updb database backup.",
    "Big data changes accept &$sandbox: store progress/max, process a slice, set $sandbox['#finished'] to a fraction — below 1 re-invokes the same function with the same sandbox. The returned string is the result message shown after the update completes (the batch progress line is core's own 'Updating <module>'), and each pass overwrites the previous one — so return a summary, not a running tally.",
    "hook_post_update_NAME in MODULE.post_update.php runs after ALL modules' update_N on a rebuilt container — full entity/config API available, tracked by function name, batchable the same way. Schema surgery in update_N; API-level fixes in post_update.",
    "Discipline: hook_update_N runs in a half-upgraded site, so keep it self-contained — raw queries only, never your module's services/classes or the entity API (they may not match the old container). Throw UpdateException on failure. Update hooks stay procedural even under Drupal 11's #[Hook] classes.",
  ],

  interview: [
    {
      q: "How do Drupal's update hooks compare to Doctrine migrations?",
      a: "Same contract, different packaging. A Doctrine migration is a timestamped class whose executed versions are recorded in the `doctrine_migration_versions` table; a Drupal update is a numbered function `MODULE_update_N()` in the `.install` file, and each site records its highest executed N in the key_value store (collection `system.schema`), so every update runs exactly once per site. You apply them with `drush updb` instead of `doctrine:migrations:migrate`. Two notable differences: Drupal has no `down()` — updates are one-way and rollback means restoring a backup — and Drupal adds a second tracked phase, `hook_post_update_NAME`, that runs after all schema updates with the full API available, something Symfony teams usually improvise with one-off commands.",
    },
    {
      q: "Why shouldn't a hook_update_N implementation call your module's own services or the entity API?",
      a: "Because update hooks run in a half-upgraded environment: the new code is on disk, but the container, entity schema, and other modules' data may still reflect the previous release — your update might even be the one that brings them up to date. If `incident_tracker_update_10004` calls an `incident_tracker` service whose constructor changed in the same release, or loads entities whose field definitions an unrun update still needs to alter, the deployment blows up in the worst possible place. So update hooks must be self-contained: raw Schema API and database queries, values inlined rather than pulled from possibly-changed code, and `\\Drupal\\Core\\Utility\\UpdateException` thrown on failure. It's the same reason Doctrine tells you to use DBAL, never the EntityManager, inside migrations.",
    },
    {
      q: "When do you use hook_post_update_NAME instead of hook_update_N?",
      a: "Use `hook_update_N` for low-level schema surgery — add/change/drop columns and tables via the Schema API with raw queries. Use `hook_post_update_NAME` (in `MODULE.post_update.php`) for anything that needs the real API: config changes, re-saving entities, cache invalidation. Post-updates run after every module's `update_N` has finished, on a freshly rebuilt container, so services and the entity system are trustworthy there. They're tracked by function name rather than number, run once per site like updates, and support the same `&$sandbox` batching for large jobs.",
    },
    {
      q: "A hook_update_N has to touch two million rows. How do you keep it from timing out?",
      a: "Use the sandbox batch protocol. Accept `&$sandbox`, and on the first call initialize `$sandbox['progress']` and `$sandbox['max']` (e.g. a COUNT query). Each invocation processes one bounded slice — say 500 rows selected with a range — and then sets `$sandbox['#finished']` to `progress / max`; any value below 1 tells the runner to call the same function again with the same sandbox, while 1 marks it complete. Through the `/update.php` UI each pass is its own HTTP request, so memory and time limits reset; under `drush updb` the loop just runs continuously. One thing people get backwards: the string you return is *not* the progress line — core sets that itself (`t('Updating @module')`). Your return value lands in the update's results and is shown after the update completes, and each pass overwrites the last, so make it a summary rather than a running tally.",
    },
  ],

  quiz: [
    {
      question:
        "incident_tracker_update_10001 shipped last release. You edit its body to fix a bug and deploy. What happens on sites that already ran it?",
      options: [
        "The corrected version runs again on the next drush updb",
        "Nothing — the site's recorded schema version (10001) means it will never re-run; you must ship the fix as update 10002",
        "It re-runs only if you also bump the module's version in the .info.yml",
        "drush updb warns about a checksum mismatch and aborts",
      ],
      answerIndex: 1,
      explain:
        "Each site stores the highest executed N in key_value collection 'system.schema'. Sites at 10001 consider that update done forever — there are no checksums and no re-runs. A shipped update is immutable in practice: corrections always go into a new, higher N.",
    },
    {
      question:
        "Which change belongs in hook_post_update_NAME rather than hook_update_N?",
      options: [
        "Adding an assignee column with $schema->addField()",
        "Widening a varchar column with $schema->changeField()",
        "Re-saving all incident entities so a new presave hook stamps them",
        "Creating the incident_tracker_audit table",
      ],
      answerIndex: 2,
      explain:
        "Re-saving entities needs the entity API and a container that matches the new code — exactly what post-updates guarantee, since they run after every module's update_N on a rebuilt container. The other three are raw schema surgery, which is hook_update_N's job via the Schema API.",
    },
    {
      question:
        "During drush updb, incident_tracker_update_10003 sets $sandbox['#finished'] = 0.4 and returns a message. What does the runner do?",
      options: [
        "Marks the update failed because it did not finish",
        "Records 10003 as done and moves on to the next update",
        "Calls incident_tracker_update_10003 again with the same $sandbox; the returned string is not printed per pass",
        "Rolls back the changes made so far in this update",
      ],
      answerIndex: 2,
      explain:
        "#finished below 1 is the batch protocol's 'not done yet' signal: the runner re-invokes the same function, passing the same persisted $sandbox so progress/max survive between passes. Only when #finished reaches 1 is N recorded in system.schema and the runner moves on. Nothing is rolled back — updates are one-way.",
    },
  ],
};

export default lesson;
