import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "deploy-sequence",
  title: "The Deployment Sequence, Step by Step",
  part: "Deployment Mechanics",
  estMinutes: 13,
  summary:
    "Turn a production deploy into an ordered, justified script — maintenance mode, code, updb, cim, cache rebuild — and understand exactly what breaks if you reorder it and what a rollback can and cannot undo.",

  concept: `
## One order, and reasons for it

A Drupal deploy moves three things that must agree with each other: **code** on
disk, the **database schema**, and **active configuration**. Every deployment bug
you will ever debug is one of those three being ahead of or behind the others.
The canonical order is:

\`\`\`bash
drush maint:set 1          # optional - see below
git fetch --all && ln -sfn releases/r42 current
composer install --no-dev --optimize-autoloader
drush updatedb -y          # hook_update_N + hook_post_update_NAME
drush config:import -y     # cim
drush cache:rebuild        # cr
drush deploy:hook -y       # hook_deploy_NAME, post-config work
drush maint:set 0
\`\`\`

Drush ships this as one command, \`drush deploy\` (added in Drush 10.3), which
runs \`updatedb\`, \`config:import\`, \`cache:rebuild\` and \`deploy:hook\` for you —
plus \`cache:warm\` on Drupal 11.2+. Use it; hand-rolled scripts drift.

### Why each step sits where it does

- **Code before everything.** \`updatedb\` executes update functions that only
  exist in the new release. Running it against old code runs old (or no) updates.
- **\`composer install\` before \`updatedb\`.** Update hooks routinely call classes
  from newly required libraries. No autoloader, fatal error.
- **\`updatedb\` before \`cim\`.** Update hooks make the *structural* changes that
  incoming config depends on: a new field storage table, a new entity type, a
  renamed config key. Import config first and it references something that does
  not exist yet. This is also why \`hook_post_update_NAME()\` runs **before**
  config import and \`hook_deploy_NAME()\` runs **after** it — the split exists
  precisely so you can put work on either side of the boundary.
- **\`cim\` before \`cr\`.** Import rebuilds the container as it goes, but a final
  explicit rebuild clears render, routing and plugin caches that a half-imported
  request may have re-populated.
- **Maintenance mode last off**, after any cache warm, so the first real visitor
  is not the one paying to rebuild the container.

### Do you actually need maintenance mode?

Turn it on for a destructive update hook, a field removal, or a config change
that will make requests fatal mid-flight. Skip it for a CSS- or template-only
release. The honest reason it is usually on: \`drush cim\` under traffic is
risky. Import is not atomic — it walks the changelist one config object at a
time, rebuilding the container in the middle. A request arriving at the wrong
microsecond can hit a route table that no longer matches the router, or a view
whose display was deleted but whose block has not been.

### Atomic releases and the window nobody closes

Symlink-per-release deploys (\`current -> releases/r42\`) make the *code* switch
atomic, but a gap remains: from the symlink flip until \`cim\` finishes, the site
serves **new code against old config**. Survivable if your code tolerates its own
previous config; fatal if the release renames a config key the new code reads
unconditionally. Gate that with maintenance mode, or split it into two
individually-safe releases.

### Rollback is asymmetric

Flipping the symlink back to \`r42\` takes a second. Undoing \`updatedb\` takes a
database restore, because update hooks have no down-migration. So:
**take a database snapshot immediately before \`updatedb\`, every single time.**
Restoring it also discards content created since the deploy, which is why short
deploy windows matter.

### When cim dies halfway

Config import leaves a partial active store and, sometimes, a stuck lock —
\`ConfigImporter::LOCK_NAME\` is \`'config_importer'\`. Fix the offending YAML, then
just re-run \`drush cim\`: it recomputes the diff against whatever is now active
and finishes the rest.

If it insists another import is running, the killed process left a row in the
\`semaphore\` table — and that row expires by itself.
\`DatabaseLockBackend::acquire($name, $timeout = 30.0)\` writes \`microtime(TRUE) +
$timeout\` into the row, and \`lockMayBeAvailable()\` treats a lapsed row as free, so
the first move is simply to wait roughly 30 seconds and re-run \`drush cim\`.

What does **not** work is the folklore fix,
\`drush ev "\\Drupal::lock()->release('config_importer')"\`. \`release()\` deletes with
\`->condition('name', $name)->condition('value', $this->getLockId())\`, and the lock
id is unique per process — a separate \`drush ev\` process matches zero rows and the
lock is untouched. If you genuinely cannot wait, delete the row yourself:

\`\`\`bash
drush sql:query "DELETE FROM semaphore WHERE name = 'config_importer'"
\`\`\`
`,

  comparisons: [
    {
      label: "The deploy script",
      intro:
        "The same shape in both stacks: switch code atomically, migrate the schema, then reconcile everything else. Drupal adds one step Symfony has no equivalent for — importing configuration that lives in version control.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
set -euo pipefail

RELEASE=/srv/app/releases/$1
cd "$RELEASE"

composer install --no-dev --optimize-autoloader \\
  --classmap-authoritative

# Build the new cache in the *new* release dir,
# before anything points at it.
php bin/console cache:clear --env=prod
php bin/console cache:warmup --env=prod
php bin/console assets:install public

# Schema first, then flip.
php bin/console doctrine:migrations:migrate \\
  --no-interaction

ln -sfn "$RELEASE" /srv/app/current
sudo systemctl reload php8.3-fpm`,
      ts: `#!/usr/bin/env bash
set -euo pipefail

RELEASE=/srv/app/releases/$1

# Maintenance mode goes on against the CURRENTLY
# live tree: $RELEASE has no vendor/ yet, so there
# is no drush and nothing to bootstrap from there.
drush -r /srv/app/current maint:set 1

cd "$RELEASE"
composer install --no-dev --optimize-autoloader

ln -sfn "$RELEASE" /srv/app/current

# Back up BEFORE any schema change.
drush sql:dump --result-file=/backups/pre-$1.sql --gzip

# updatedb -> config:import -> cache:rebuild -> deploy:hook
drush deploy -y

drush maint:set 0`,
      note:
        "Symfony can warm its cache inside the un-linked release directory because the cache is a build artifact. Drupal's caches live in the shared database, so they cannot be warmed until the code is live — which is what forces maintenance mode into the picture.",
    },
    {
      label: "Schema change vs. config change",
      intro:
        "Doctrine has one mechanism for 'change the database'. Drupal has three update mechanisms, and which one you pick decides whether your code runs before or after config import.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony: one kind of migration, one ordering.
final class Version20260810120000 extends AbstractMigration
{
  public function up(Schema $schema): void
  {
    $this->addSql('ALTER TABLE campaign
      ADD archived_at DATETIME DEFAULT NULL');
  }

  public function down(Schema $schema): void
  {
    $this->addSql('ALTER TABLE campaign
      DROP archived_at');
  }
}

// Everything else - routes, DI, twig paths -
// is derived from code at cache:warmup time.
// There is nothing to "import".`,
      ts: `// 1. Runs first, minimal API available.
function four_rivers_update_10001(): void {
  \\Drupal::database()->schema()
    ->addField('four_rivers_campaign', 'archived_at', [
      'type' => 'int', 'not null' => FALSE,
    ]);
}

// 2. Still before config import, full API.
function four_rivers_post_update_backfill(&$sandbox): string {
  // Batch-safe data migration goes here.
  return 'Backfilled archived_at.';
}

// 3. AFTER config import - the new view exists now.
function four_rivers_deploy_prime_index(): string {
  \\Drupal::service('views.views_data')->clear();
  return 'Primed archived campaigns view.';
}`,
      note:
        "hook_update_N and hook_post_update_NAME run during drush updatedb (before cim); hook_deploy_NAME runs after cim. None of them has a down() — that asymmetry is the whole reason for the pre-deploy database backup.",
    },
    {
      label: "Recovering a failed migration / import",
      intro:
        "Both stacks can stop halfway. The difference is what 'halfway' means and how you get moving again.",
      leftLang: "bash",
      rightLang: "bash",
      php: `$ php bin/console doctrine:migrations:migrate
 [ERROR] Migration Version20260810120000 failed
         during Execution. Error: Duplicate column
         name 'archived_at'

# MySQL has no transactional DDL, so the migration
# is partly applied but NOT recorded as executed.
# Repair by hand, then mark it done:
$ php bin/console doctrine:migrations:version \\
    'DoctrineMigrations\\Version20260810120000' \\
    --add --no-interaction

$ php bin/console doctrine:migrations:status`,
      ts: `$ drush cim -y
 [error] The configuration cannot be imported
 because it failed validation: views.view.campaigns
 depends on field.storage.node.archived_at which
 does not exist.
 [error] Another request may be synchronizing
 configuration already.

# 1. Nothing was half-written: validation runs
#    before the changelist is applied.
# 2. A lock left by a killed process expires on its
#    own ~30s after it was acquired, so wait and
#    retry. \\Drupal::lock()->release() will NOT clear
#    it - DatabaseLockBackend scopes the DELETE to
#    its own lock id. To force it:
$ drush sql:query \\
    "DELETE FROM semaphore WHERE name='config_importer'"

# 3. Fix the cause (run the missing update), re-run.
#    cim recomputes the diff from current active state.
$ drush updatedb -y && drush cim -y`,
      note:
        "Re-running drush cim is safe and idempotent: it diffs sync against whatever is currently active, so a partially applied import simply resumes rather than double-applying.",
    },
    {
      label: "Zero-downtime and the code/config gap",
      intro:
        "Atomic symlink switching solves half the problem in both stacks. The other half is the state that lives outside the release directory.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# Deployer-style layout. The switch is one
# rename() syscall - no request sees a mixed tree.
/srv/app/
  releases/r41/   <- previous
  releases/r42/   <- new, fully built
  shared/var/log
  shared/.env.local
  current -> releases/r42

# Remaining risk: r42 code + r41 database schema
# for the seconds between flip and migrate.
# Mitigation: expand/contract migrations - add the
# new column in release N, stop reading the old one
# in N+1, drop it in N+2.`,
      ts: `# .gitlab-ci.yml - the same discipline, plus config.
deploy_prod:
  stage: deploy
  environment: production
  script:
    - ssh $PROD "set -e;
        cd /srv/app/releases/$CI_COMMIT_SHORT_SHA;
        composer install --no-dev -o;
        drush maint:set 1;
        drush sql:dump --gzip
          --result-file=/backups/pre.sql;
        ln -sfn \\$PWD /srv/app/current;
        drush deploy -y;
        drush maint:set 0"
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      when: manual`,
      note:
        "Expand/contract works for Drupal config too: ship the new config key and code that reads either key, then remove the old key a release later. That is how you deploy without maintenance mode.",
    },
  ],

  playground: {
    intro:
      "A state machine for one deploy. Each step declares a precondition; run the steps out of order and the precondition fails exactly where a real site would. The final block classifies what a rollback can actually undo.",
    lang: "php",
    code: `<?php

// A tiny model of one production deploy. Three things must stay in step:
// the code on disk, the database schema, and the active configuration.
$initial = ['code' => 'r41', 'schema' => 8901, 'config' => 'r41', 'maint' => 0];

// Each step declares the precondition it needs and the state it advances.
$steps = [
  'maint:set 1' => ['needs' => null, 'does' => function (array &$s) { $s['maint'] = 1; }],
  'symlink r42' => ['needs' => null, 'does' => function (array &$s) { $s['code'] = 'r42'; }],
  'drush updb'  => ['needs' => 'code=r42',    'does' => function (array &$s) { $s['schema'] = 8902; }],
  'drush cim'   => ['needs' => 'schema=8902', 'does' => function (array &$s) { $s['config'] = 'r42'; }],
  'drush cr'    => ['needs' => 'config=r42',  'does' => function (array &$s) { }],
  'maint:set 0' => ['needs' => 'config=r42',  'does' => function (array &$s) { $s['maint'] = 0; }],
];

function run(string $title, array $order, array $state, array $steps): void {
  echo $title . "\\n";
  foreach ($order as $name) {
    $step = $steps[$name];
    if ($step['needs'] !== null) {
      [$key, $want] = explode('=', $step['needs']);
      if ((string) $state[$key] !== $want) {
        printf("  %-12s ABORT  wants %s=%s, site has %s=%s\\n",
          $name, $key, $want, $key, $state[$key]);
        echo "  -> halted with maintenance mode still on\\n\\n";
        return;
      }
    }
    $step['does']($state);
    printf("  %-12s ok     code=%s schema=%d config=%s\\n",
      $name, $state['code'], $state['schema'], $state['config']);
  }
  echo "  -> complete, maintenance mode off\\n\\n";
}

run('Canonical order:',
  ['maint:set 1', 'symlink r42', 'drush updb', 'drush cim', 'drush cr', 'maint:set 0'],
  $initial, $steps);

run('cim before updb (config needs a table the update hook creates):',
  ['maint:set 1', 'symlink r42', 'drush cim', 'drush updb', 'drush cr', 'maint:set 0'],
  $initial, $steps);

// What a rollback to release r41 can and cannot undo.
$rollback = [
  'code (release symlink)' => 'reversible in seconds',
  'active configuration' => 'reversible: re-import r41 export',
  'hook_update_N schema' => 'NOT reversible: restore DB backup',
  'content written since' => 'NOT reversible: lost by that restore',
];
echo "Rollback audit:\\n";
foreach ($rollback as $what => $verdict) {
  printf("  %-24s %s\\n", $what, $verdict);
}
`,
    output: `Canonical order:
  maint:set 1  ok     code=r41 schema=8901 config=r41
  symlink r42  ok     code=r42 schema=8901 config=r41
  drush updb   ok     code=r42 schema=8902 config=r41
  drush cim    ok     code=r42 schema=8902 config=r42
  drush cr     ok     code=r42 schema=8902 config=r42
  maint:set 0  ok     code=r42 schema=8902 config=r42
  -> complete, maintenance mode off

cim before updb (config needs a table the update hook creates):
  maint:set 1  ok     code=r41 schema=8901 config=r41
  symlink r42  ok     code=r42 schema=8901 config=r41
  drush cim    ABORT  wants schema=8902, site has schema=8901
  -> halted with maintenance mode still on

Rollback audit:
  code (release symlink)   reversible in seconds
  active configuration     reversible: re-import r41 export
  hook_update_N schema     NOT reversible: restore DB backup
  content written since    NOT reversible: lost by that restore
`,
  },

  keyPoints: [
    "The canonical order is code, composer install, updatedb, config:import, cache:rebuild, deploy:hook — drush deploy runs exactly that sequence (plus cache:warm on Drupal 11.2+) so you do not have to maintain it yourself.",
    "updatedb must precede cim because update hooks create the structures incoming config depends on; hook_post_update_NAME runs before the import and hook_deploy_NAME runs after it, which is the whole point of the split.",
    "Maintenance mode is not superstition: config import is not atomic, so a request arriving mid-import can see a routing table, view or block that no longer matches the container.",
    "An atomic symlink switch makes the code change instantaneous but still leaves a window where new code runs against old config — close it with maintenance mode or with expand/contract releases.",
    "Rollback is asymmetric: code and active config are reversible, update hooks and content are not. Take a database snapshot immediately before updatedb on every deploy, without exception.",
    "A failed cim is recoverable by fixing the cause and re-running it, because the importer diffs sync against current active state; a 'config_importer' lock left by a killed process is not a blocker either — DatabaseLockBackend stamps a 30-second expiry on the semaphore row, so waiting and retrying clears it, while \\Drupal::lock()->release() from a separate process cannot (release() matches on the caller's own lock id).",
  ],

  interview: [
    {
      q: "Walk me through your production deployment sequence for a Drupal 10 site and justify the ordering.",
      a: "Enable maintenance mode if the release is destructive, put the new release directory in place, run `composer install --no-dev --optimize-autoloader`, flip the symlink, take a database dump, then `drush updatedb -y`, `drush config:import -y`, `drush cache:rebuild`, `drush deploy:hook -y`, then maintenance mode off. In practice I run `drush deploy`, which is exactly that middle sequence — it was added in Drush 10.3 so teams stop hand-rolling it. The ordering is forced by dependencies: update hooks live in the new code, so code comes first; update hooks create the field storage and entity structures that incoming config references, so `updatedb` comes before `cim`. The database dump sits immediately before `updatedb` because that is the first irreversible step in the whole script.",
    },
    {
      q: "You get paged: a deploy failed halfway through drush cim on production. What do you do?",
      a: "First check whether the site is still in maintenance mode and leave it there — a partially imported site is not safe to serve. Read the actual error; most import failures are validation failures (a config object depending on something that does not exist) and validation runs before the changelist is applied, so often nothing was written at all. If the process was killed rather than exiting cleanly, the importer's lock may still be held, but it clears itself: `DatabaseLockBackend::acquire()` defaults to a 30-second timeout and writes that expiry into the `semaphore` row, so I wait half a minute and retry rather than running `drush ev \"\\Drupal::lock()->release('config_importer')\"` — that does nothing, because `release()` scopes its DELETE to the calling process's own lock id. If I really cannot wait, I delete the row directly with `drush sql:query \"DELETE FROM semaphore WHERE name = 'config_importer'\"`. Then fix the cause, usually by running the update hook that should have preceded the import, and re-run `drush cim`: it recomputes the diff against whatever is currently active, so it resumes rather than double-applying. I only reach for the database restore if the active store is genuinely inconsistent, and I would then also roll the release symlink back.",
    },
    {
      q: "Why can't you simply roll back a Drupal deploy the way you roll back a code deploy?",
      a: "Because only one of the three moving parts is versioned in a reversible way. Flipping the release symlink back restores the code instantly, and active configuration can be restored by re-importing the previous release's `config/sync` export. But `hook_update_N` and `hook_post_update_NAME` have no `down()` — unlike a Doctrine migration, Drupal's update system never asks you to write the inverse — so a schema change is only undone by restoring the pre-deploy database snapshot. That restore also throws away every node, comment and order created since the deploy started. This is why the practical answer is 'roll forward': fix the bug in a new release rather than reverting, and keep deploy windows short so a genuine restore costs as little content as possible.",
    },
    {
      q: "When would you deploy without maintenance mode, and how do you make that safe?",
      a: "For releases that touch nothing structural — CSS, Twig templates, a JavaScript library, copy changes — maintenance mode is pure downtime for no benefit. The technique that extends this to real changes is expand/contract, the same discipline Symfony teams use for database migrations. Release N adds the new config key or field and ships code that tolerates both the old and new shape; release N+1 stops reading the old one; release N+2 removes it. Each release is individually safe against either side of the config import, so the gap between the symlink flip and `cim` finishing stops mattering. It costs more releases, which is exactly the trade you are making for zero downtime.",
    },
  ],

  quiz: [
    {
      question:
        "Why must `drush updatedb` run before `drush config:import` rather than after?",
      options: [
        "Because config import clears the update system's schema table",
        "Because update hooks create the schema and structures that incoming configuration depends on",
        "Because drush refuses to run cim while any update is pending",
        "Because config import always runs inside a database transaction",
      ],
      answerIndex: 1,
      explain:
        "Update hooks perform the structural work — new field storage tables, new entity types, renamed keys — that the incoming config objects reference. Import config first and it validates against a database that has not caught up yet. It is also why hook_post_update_NAME runs before the import and hook_deploy_NAME runs after it.",
    },
    {
      question:
        "Which pair of things is genuinely reversible after a bad deploy, without a database restore?",
      options: [
        "The code release and active configuration",
        "Update hooks and content created during the deploy",
        "Update hooks and active configuration",
        "Nothing is reversible without a restore",
      ],
      answerIndex: 0,
      explain:
        "Flipping the release symlink back restores the code, and re-importing the previous release's config/sync export restores active configuration. Update hooks have no down-migration and content created since the deploy would be destroyed by a restore — which is why the pre-updatedb database snapshot is mandatory.",
    },
    {
      question:
        "A deploy killed mid-import leaves `drush cim` reporting 'Another request may be synchronizing configuration already'. What is the right first move?",
      options: [
        "Restore the pre-deploy database backup immediately",
        "Delete config/sync and re-export from the active store",
        "Wait out the stale 'config_importer' lock, then fix the cause and re-run cim",
        "Run drush cache:rebuild, which resets the importer",
      ],
      answerIndex: 2,
      explain:
        "ConfigImporter takes a named lock ('config_importer') and a killed process leaves the semaphore row behind until it expires — DatabaseLockBackend::acquire() stamps a 30-second expiry, and lockMayBeAvailable() treats a lapsed row as free, so the lock frees itself. (\\Drupal::lock()->release() run from another process would not help: release() only deletes rows matching its own lock id.) Waiting the lock out, correcting the underlying error and re-running cim is safe because the importer recomputes its changelist against whatever is currently active — a restore is a last resort, not a first move.",
    },
    {
      question:
        "Your release flips an atomic symlink, so code changes instantly. What risk remains before `drush cim` completes?",
      options: [
        "None — an atomic symlink switch guarantees consistency",
        "Requests can hit new code running against the old active configuration",
        "The opcache will serve files from the previous release forever",
        "Composer's autoloader will be missing until the next cache rebuild",
      ],
      answerIndex: 1,
      explain:
        "The symlink makes the code switch atomic, but configuration lives in the database and is only reconciled when cim finishes. In that window new code reads old config, which is fatal if the release renamed a key the new code reads unconditionally. Maintenance mode or an expand/contract release closes the gap.",
    },
  ],
};

export default lesson;
