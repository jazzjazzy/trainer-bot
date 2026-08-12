import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "rollback-and-recovery",
  title: "When a Deploy Goes Wrong",
  part: "Safety & Operations",
  estMinutes: 14,
  summary:
    "Code rolls back cleanly and the database almost never does — so learn the three shapes of deploy failure, the backup that has to exist before you start, and why forward-fix usually beats rollback the moment an editor saves a node.",

  concept: `
## Code rolls back. The database does not.

Point the release symlink at r41 and the PHP on disk is byte-for-byte what it
was. Nothing else in a Drupal deploy has that property. \`drush updatedb\` ran a
function that dropped a column. \`drush cim\` deleted a view and rewrote a field
config. An editor published three articles in the ninety seconds since the
deploy finished. Roll the code back to r41 while the database sits at r42 and
you get old code reading new data — usually worse than the bug you were fixing.

The honest model to carry into an incident: **a Drupal deploy is one-way unless
you restore a database backup, and restoring a database backup throws away
every content change made since it was taken.**

## Three shapes of failure

**1. \`drush cim\` dies halfway.** Import is not a transaction. \`ConfigImporter\`
validates the entire changelist first — that failure mode is the safe one,
nothing has been written — and then walks the operations one at a time, in the
order delete, create, rename, update per collection, saving each object on its
own and rebuilding the container as it goes. A fatal in an event subscriber on
operation 12 of 40 leaves 11 applied. The saving grace: the changelist is
*derived*, not stored. Fix the cause and re-run; \`cim\` recomputes the diff and
only does what is left. If the process was killed hard, the \`config_importer\`
lock can outlive it and the next run complains that another request may already
be synchronising configuration — wait for the lock to expire or clear the row.

**2. An update function throws.** \`update_do_one()\` writes the new schema
version into the \`system.schema\` key-value collection only *after* the function
returns. Throw at 80% and the integer never moves, so the next \`drush updatedb\`
re-runs the whole function from the top — including the 80% that already
succeeded. \`hook_post_update_NAME()\` behaves identically: the function name is
appended to \`existing_updates\` only on success. That is not a bug, it is the
contract, and it is why every update function must be safe to re-run: check
before you add a column, use \`$sandbox\` and a stable pointer for batched work,
and never assume you are seeing a virgin database.

**3. The deploy technically succeeded.** Every command exited 0 and the site is
throwing 500s. Nothing to retry, nothing to resume — you are now choosing
between rollback and forward-fix under time pressure.

## The judgement call

Ask one question: **has content been written since the deploy landed?** If no —
a quiet Sunday, a marketing site, you caught it in ninety seconds — restoring
the pre-deploy dump and repointing the symlink is fast and total. If yes, a
restore silently deletes editors' work, and you have turned a visible outage
into invisible data loss. Past that line, forward-fix nearly always wins: patch,
tag, deploy again through the same pipeline. That is also the argument for
making the pipeline fast; a ten-minute deploy makes rollback tempting for the
wrong reasons.

Maintenance mode is what buys you the choice. It limits blast radius, keeps
editors from writing content you would have to destroy, and stops traffic
hitting a half-imported router table.
`,

  comparisons: [
    {
      label: "The backup that must exist before you start",
      intro:
        "Both stacks dump the database before touching it. The difference is what a Drupal dump contains: not just content, but the active configuration and every schema version, which is precisely why it is the only true rollback point.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
set -euo pipefail

# Symfony: dump, then migrate. Doctrine records each migration in
# doctrine_migration_versions as it completes, so a failed run is resumable
# and 'migrations:migrate prev' can walk back - IF every down() is real.
mysqldump --single-transaction --quick \\
  -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" \\
  | gzip > "/backups/pre-deploy-$(date +%FT%H%M%S).sql.gz"

php bin/console doctrine:migrations:migrate --no-interaction
php bin/console cache:clear --env=prod

# Rollback: revert the release, then hope.
#   php bin/console doctrine:migrations:migrate prev
# Most teams write down() as a stub, so this is a lie in practice.`,
      ts: `#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%FT%H%M%S)
# --gzip appends '.gz' to --result-file itself, so name the file .sql here
# or you end up with pre-deploy-$STAMP.sql.gz.gz.
drush sql:dump --gzip --result-file="/backups/pre-deploy-$STAMP.sql"

# Config lives in the DB too, so snapshot the ACTIVE store separately -
# it is the fastest way to see what the deploy actually changed.
drush config:export --destination="/backups/active-$STAMP" -y

# Public files are content. Managed files rows without the file on disk
# are broken images, so back them up on the same clock as the DB.
tar -czf "/backups/files-$STAMP.tgz" -C web/sites/default files

drush deploy -y   # updatedb, cim, cache:rebuild, deploy:hook

# Restore, if it comes to that:
#   drush sql:drop -y
#   gunzip -c /backups/pre-deploy-$STAMP.sql.gz | drush sql:cli
#   ln -sfn releases/r41 current && drush cache:rebuild`,
      note:
        "sql:drop before sql:cli matters — importing a dump over a live schema leaves tables the new release created but the dump never mentions. And a backup you have never restored is not a backup; rehearse it on stage every sprint.",
    },
    {
      label: "Recovering from a half-applied change",
      intro:
        "A Symfony config change is files only, so reverting the commit fully reverts the state. Drupal's active config is database rows, so reverting the commit changes nothing until you import — and you need to see the diff before you do.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: config/packages/*.yaml IS the runtime config.
git revert 9f3a21c
php bin/console cache:clear --env=prod
# Done. The container is rebuilt from the reverted files; there is no
# second copy of the config anywhere to fall out of step.

# The only irreversible half is the migration that already ran.
php bin/console doctrine:migrations:status
#   >> Executed Migrations   41
#   >> Latest Version        Version20260318121500`,
      ts: `# The active store still holds whatever the failed import wrote.
# Look before you leap - --diff shows active vs sync, not git history.
drush config:status
#  Name                     State
#  views.view.press         Different
#  field.field.node.press.body  Only in sync dir
drush config:import --diff

# Fix the cause (the missing update hook, the fatal subscriber), redeploy,
# and simply run it again. cim re-derives the changelist, so the 11
# operations that already applied are no longer in the plan.
drush config:import -y

# Surgical option when a full import would drag in unrelated drift:
drush config:import --partial --source=/tmp/hotfix-config -y

# Stale lock from a killed process:
drush sql:query "DELETE FROM semaphore WHERE name = 'config_importer'"`,
      note:
        "--partial only creates and updates, it never deletes. It is a scalpel for an incident, not a deploy strategy: run a full import afterwards or you will carry hidden drift forever.",
    },
    {
      label: "Writing an update function that survives being re-run",
      intro:
        "Because the schema version is only bumped after a clean return, any update function that throws will be executed again from the beginning. Write it as if that is guaranteed, because eventually it is.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Doctrine migration. Executed once, recorded on success, and down() is
// the theory of rollback that nobody tests.
final class Version20260318121500 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        // Throws on a re-run: the column already exists.
        $this->addSql('ALTER TABLE press_release ADD embargo_at DATETIME NULL');
        $this->addSql('UPDATE press_release SET embargo_at = published_at');
    }

    public function down(Schema $schema): void
    {
        // Structurally reversible, semantically destructive: the data
        // written into embargo_at since the deploy is gone.
        $this->addSql('ALTER TABLE press_release DROP embargo_at');
    }
}`,
      ts: `<?php
/**
 * Add the embargo column and backfill it, in re-runnable form.
 */
function acme_press_update_10301(&$sandbox): string {
  $schema = \\Drupal::database()->schema();
  if (!$schema->fieldExists('press_release', 'embargo_at')) {
    $schema->addField('press_release', 'embargo_at', [
      'type' => 'int',
      'not null' => FALSE,
      'description' => 'Embargo timestamp.',
    ]);
  }
  return 'embargo_at present.';
}

/**
 * Backfill in batches. The pointer lives in $sandbox, which is thrown away
 * if the function throws - so drive the batch off the DATA, not a counter.
 */
function acme_press_post_update_backfill_embargo(&$sandbox): void {
  $db = \\Drupal::database();
  // "Rows still needing work" is self-correcting: a re-run just picks up
  // whatever is left, however far the failed attempt got.
  $ids = $db->select('press_release', 'p')
    ->fields('p', ['id'])
    ->isNull('p.embargo_at')
    ->range(0, 200)
    ->execute()
    ->fetchCol();

  foreach ($ids as $id) {
    $db->update('press_release')
      ->fields(['embargo_at' => \\Drupal::time()->getRequestTime()])
      ->condition('id', $id)
      ->execute();
  }
  $sandbox['#finished'] = $ids ? 0 : 1;
}`,
      note:
        "Guard structural changes with fieldExists()/tableExists(), and make batched work idempotent by querying for unfinished rows instead of counting offsets. There is no hook_update_N_rollback().",
    },
    {
      label: "Maintenance mode as a blast-radius limiter",
      intro:
        "The point is not the holding page. It is that no editor can save content during the window, which keeps 'restore the backup' on the table as an option.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: a flag file the web server checks before PHP runs.
touch /var/www/shared/maintenance.flag
# nginx:
#   if (-f /var/www/shared/maintenance.flag) { return 503; }
#   error_page 503 /maintenance.html;

# Or in-app via a kernel.request subscriber reading an env var:
#   MAINTENANCE=1 in .env.local, then a listener that returns a 503
#   Response for every route except /_health and the office IP range.

rm /var/www/shared/maintenance.flag`,
      ts: `drush maint:set 1        # or: drush state:set system.maintenance_mode 1
drush maint:get
#  1

# Anonymous and normal editors get the maintenance page (503). Users with
# the 'access site in maintenance mode' permission still browse the site,
# which is how you verify the release before letting traffic back in.
# The page text is config: system.maintenance:message - so it is exportable,
# and it can be overridden per environment in settings.php:
#   $config['system.maintenance']['message'] = 'Back at 07:30 UTC.';

drush deploy -y
drush cache:rebuild
curl -sf -o /dev/null -w '%{http_code}' https://acme.example/health

drush maint:set 0`,
      note:
        "User 1 and anyone with 'access site in maintenance mode' bypasses it, so your smoke test must run as a bypassing user or it will just assert that the 503 page renders.",
    },
  ],

  playground: {
    intro:
      "A model of why a failed config import is resumable and a failed update hook is not. Nothing here touches Drupal — it is the same state machine, in 60 lines of plain PHP.",
    lang: "php",
    code: `<?php
// Config import is NOT a transaction. ConfigImporter walks the changelist in a
// fixed op order - delete, create, rename, update - and saves each object on
// its own. Kill it halfway and the active store is left part-way through.

$sync = [
  'system.site'                 => ['name' => 'Acme', 'slogan' => 'Ship it'],
  'node.type.press'             => ['name' => 'Press release'],
  'field.field.node.press.body' => ['label' => 'Body', 'required' => TRUE],
  'views.view.press'            => ['status' => TRUE, 'rows' => 20],
];
$active = [
  'system.site'              => ['name' => 'Acme', 'slogan' => 'Old slogan'],
  'node.type.press'          => ['name' => 'Press release'],
  'views.view.press'         => ['status' => FALSE, 'rows' => 10],
  'block.block.oldsearchbox' => ['region' => 'sidebar_first'],
];

function changelist(array $sync, array $active): array {
  $list = ['delete' => [], 'create' => [], 'update' => []];
  foreach (array_keys($active) as $name) {
    if (!isset($sync[$name])) {
      $list['delete'][] = $name;
    }
  }
  foreach ($sync as $name => $data) {
    if (!isset($active[$name])) {
      $list['create'][] = $name;
    }
    elseif ($active[$name] !== $data) {
      $list['update'][] = $name;
    }
  }
  return $list;
}

// Apply operations in ConfigImporter's order, stopping at $breaks_on.
function import(array $list, array $sync, array $active, ?string $breaks_on): array {
  $done = [];
  foreach (['delete', 'create', 'update'] as $op) {
    foreach ($list[$op] as $name) {
      if ($name === $breaks_on) {
        return [$active, $done, "$op:$name"];
      }
      if ($op === 'delete') {
        unset($active[$name]);
      }
      else {
        $active[$name] = $sync[$name];
      }
      $done[] = "$op:$name";
    }
  }
  return [$active, $done, NULL];
}

$plan = changelist($sync, $active);
echo "Planned changelist (drush cim):\\n";
foreach ($plan as $op => $names) {
  echo "  " . str_pad($op, 6) . " " . (empty($names) ? '-' : implode(', ', $names)) . "\\n";
}

// The new field references a base field the update hook never created.
[$active, $done, $failed] = import($plan, $sync, $active, 'field.field.node.press.body');

echo "\\nRun 1 aborts on $failed\\n";
echo "  applied : " . implode(' | ', $done) . "\\n";
echo "  pending : the rest of the changelist, plus a stale config_importer lock\\n";

echo "\\nActive store is now MIXED:\\n";
foreach ($active as $name => $data) {
  echo "  $name => " . str_replace(["\\n", '  '], '', var_export($data, TRUE)) . "\\n";
}

// Fix the code, redeploy, re-run. cim recomputes the diff from scratch.
$plan2 = changelist($sync, $active);
echo "\\nRun 2 changelist (recomputed, so already-applied ops have vanished):\\n";
foreach ($plan2 as $op => $names) {
  echo "  " . str_pad($op, 6) . " " . (empty($names) ? '-' : implode(', ', $names)) . "\\n";
}

[$active, $done, $failed] = import($plan2, $sync, $active, NULL);
echo "  result  : " . ($failed === NULL ? 'clean, ' . count($done) . ' ops applied' : "aborted on $failed") . "\\n";
echo "  in sync : " . var_export($active == $sync, TRUE) . "\\n";

echo "\\nWhy cim is re-runnable and hook_update_N is not:\\n";
echo "  cim state = a diff of two storages, re-derived on every run.\\n";
echo "  update hook state = one integer bumped only AFTER the function returns.\\n";
echo "  Throw halfway and the integer never moves, so the WHOLE hook re-runs -\\n";
echo "  including the half that already succeeded. Write it to survive that.\\n";
`,
    output: `Planned changelist (drush cim):
  delete block.block.oldsearchbox
  create field.field.node.press.body
  update system.site, views.view.press

Run 1 aborts on create:field.field.node.press.body
  applied : delete:block.block.oldsearchbox
  pending : the rest of the changelist, plus a stale config_importer lock

Active store is now MIXED:
  system.site => array ('name' => 'Acme','slogan' => 'Old slogan',)
  node.type.press => array ('name' => 'Press release',)
  views.view.press => array ('status' => false,'rows' => 10,)

Run 2 changelist (recomputed, so already-applied ops have vanished):
  delete -
  create field.field.node.press.body
  update system.site, views.view.press
  result  : clean, 3 ops applied
  in sync : true

Why cim is re-runnable and hook_update_N is not:
  cim state = a diff of two storages, re-derived on every run.
  update hook state = one integer bumped only AFTER the function returns.
  Throw halfway and the integer never moves, so the WHOLE hook re-runs -
  including the half that already succeeded. Write it to survive that.
`,
  },

  keyPoints: [
    "Code rollback is trivial and database rollback is not: restoring the pre-deploy dump is the only true rollback, and it destroys every content change made since the dump was taken.",
    "Config import is not transactional. Validation failures are safe (nothing written); mid-run failures leave a mixed active store, but the changelist is re-derived, so fixing the cause and re-running drush cim resumes cleanly.",
    "An update function that throws never gets its schema version written to system.schema (or its name appended to existing_updates), so the whole function re-runs — guard structural changes and drive batches off unfinished data, not offsets.",
    "Take the dump, the active config export and the files archive on the same clock before every deploy, and rehearse the restore on stage — an untested backup is a guess.",
    "Choose forward-fix over rollback the moment content has been written post-deploy; past that line a restore converts a visible outage into silent data loss.",
    "Maintenance mode is a blast-radius limiter, not a courtesy page: it stops editors writing content you would have to throw away, and 'access site in maintenance mode' lets you smoke-test before reopening.",
  ],

  interview: [
    {
      q: "You are 40 seconds into a production deploy and `drush cim` exits with a fatal error. What do you do?",
      a: "First establish which failure it was. If it failed during validation nothing was written, so the active config is untouched and the site is still on the old release — safe to abort and investigate. If it failed mid-execution, the active store is part-way through the changelist, because `ConfigImporter` saves each object individually and rebuilds the container as it goes rather than wrapping the run in a transaction. I would keep maintenance mode on, run `drush config:status` and `drush config:import --diff` to see exactly what is still outstanding, fix the underlying cause — very often a config object that depends on something an update hook was meant to create — and re-run the import. Re-running is safe because the changelist is derived from a fresh diff of sync versus active, so the operations that already applied are simply no longer in the plan. The one thing to watch for is a stale `config_importer` lock left by a hard-killed process, which makes the next run refuse to start until it expires.",
    },
    {
      q: "Why do you insist update hooks be idempotent, when Drupal is supposed to run each one exactly once?",
      a: "Because 'exactly once' only holds for a hook that returns cleanly. `update_do_one()` writes the module's new version into the `system.schema` key-value collection *after* the function returns, and `hook_post_update_NAME()` is appended to `existing_updates` on success in the same way. If the function throws — a timeout, a fatal, an out-of-memory during a big backfill — that bookkeeping never happens, so the next `drush updatedb` executes the identical function again from the top, including whatever part of it already committed. There is no rollback hook and no transaction wrapping. In practice that means guarding DDL with `fieldExists()` and `tableExists()`, and writing batched work so the query itself asks for rows that still need processing rather than paging by offset with a counter in `$sandbox`, since `$sandbox` is discarded on failure.",
    },
    {
      q: "A deploy went out cleanly and the site is now broken. Do you roll back or forward-fix?",
      a: "The deciding question is whether content has been written since the deploy landed. Rolling back the code alone leaves old code running against a database that update hooks and config import have already moved forward, which is usually worse than the original bug — so a real rollback means restoring the pre-deploy database dump as well. If nothing has been authored in the window, that restore is fast and total and I would take it. If editors have saved anything, a restore silently deletes their work, and I would forward-fix instead: patch, tag, and push through the same pipeline, with maintenance mode on if the fix touches config or schema. This is exactly the reasoning a Symfony team applies to an irreversible Doctrine migration — a written `down()` does not make a dropped column's data come back — the difference is that in Drupal the configuration itself lives in the database, so more of the deploy falls on the irreversible side of the line.",
    },
    {
      q: "What does your post-incident checklist look like after a bad Drupal deploy?",
      a: "Confirm the site is actually healthy rather than just returning 200s: check `drush status`, `drush config:status` for leftover drift from a partial import, and `drush updatedb:status` to confirm no update is stuck pending. Then reconcile — if a hotfix was applied directly on production, export the active config and commit it, or the next deploy will quietly revert it. Take a fresh backup once the site is stable, so the next deploy is not rolling back to a broken state. After that, write up the sequence with timestamps, and turn the failure into a gate: if a config dependency was missing, add a CI step that restores a production database copy and fails the build on drift — `drush config:status --format=json` checked for any non-`Identical` row, with `drush config:import --diff` run non-interactively to show exactly what the import would do; if an update hook timed out, batch it. The rule I work to is that an incident should make the pipeline stricter, not just the team more careful.",
    },
  ],

  quiz: [
    {
      question:
        "`drush cim` fails with a fatal error partway through applying a 40-item changelist. What is the state of the active configuration?",
      options: [
        "Unchanged — the import runs inside a database transaction that is rolled back",
        "Fully applied — the fatal happened during the post-import cache rebuild",
        "Partially applied — the operations processed before the fatal are committed, the rest are not",
        "Reverted to the last automatic config snapshot Drupal takes before each import",
      ],
      answerIndex: 2,
      explain:
        "ConfigImporter validates the whole changelist first, but then processes operations one at a time, saving each config object individually and rebuilding the container as it goes. There is no transaction and no automatic snapshot, so a mid-run fatal leaves a mixed active store. Re-running is the fix: the changelist is recomputed from a fresh diff, so completed operations drop out of the plan.",
    },
    {
      question:
        "`acme_press_update_10301()` adds a column and then throws while backfilling it. What happens on the next `drush updatedb`?",
      options: [
        "Drupal skips 10301 because the column already exists and moves on to 10302",
        "The whole of 10301 runs again from the start, because the schema version was never written",
        "Drupal runs a generated inverse of the completed statements first, then retries",
        "updatedb refuses to run until an administrator manually sets the schema version",
      ],
      answerIndex: 1,
      explain:
        "The installed schema version in the system.schema key-value collection is only written after the update function returns. A throw means the integer never moves, so the identical function is executed again from the top — including the ALTER TABLE that already succeeded. That is why structural changes need fieldExists()/tableExists() guards and batched work must be driven off unfinished data.",
    },
    {
      question:
        "A deploy at 09:02 broke a landing page. It is now 09:40 and editors have been publishing all morning. What is the right move?",
      options: [
        "Restore the 09:01 database dump and repoint the release symlink to the previous tag",
        "Roll the code back to the previous tag and leave the database at its current state",
        "Forward-fix: patch, tag and deploy through the normal pipeline, with maintenance mode if needed",
        "Run `drush config:import --partial` from the previous release's config directory",
      ],
      answerIndex: 2,
      explain:
        "Restoring the 09:01 dump would delete 39 minutes of editorial work — turning a visible bug into silent data loss. Rolling back code alone leaves old code against a database that updatedb and cim already moved forward. Once content has been written post-deploy, forward-fix through the normal pipeline is almost always correct.",
    },
    {
      question:
        "Why does maintenance mode matter for recoverability, beyond showing visitors a holding page?",
      options: [
        "It makes drush cim run inside a transaction so a failure rolls the import back",
        "It stops content being written during the window, keeping a backup restore viable as a rollback",
        "It automatically snapshots the database before each config import operation",
        "It disables hook_update_N so partial updates cannot occur",
      ],
      answerIndex: 1,
      explain:
        "Maintenance mode does not change how import or update hooks execute. Its real value during a deploy is that no editor can save content, so the pre-deploy dump stays a complete picture and restoring it costs nothing in lost work — plus users with 'access site in maintenance mode' can smoke-test the release before traffic returns.",
    },
  ],
};

export default lesson;
