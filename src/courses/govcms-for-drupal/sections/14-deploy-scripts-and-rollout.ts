import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "deploy-scripts-and-rollout",
  title: "govcms-deploy: What Actually Runs on Rollout",
  part: "Lagoon: Deploy & Run",
  estMinutes: 13,
  summary:
    "The three unrelated sequences all called \"deploy\" on GovCMS, the eight post-rollout tasks in their real order, and the exact state a production site is left in when one of them fails halfway.",
  concept: `## Three different things are called "deploy"

You already know \`drush updatedb\`, \`drush config:import\`, \`drush cache:rebuild\`. On GovCMS you almost never type them. What you type instead depends on which of three unrelated sequences someone means.

- **\`ahoy govcms-deploy\`** — a local convenience target in the scaffold's \`.ahoy.yml\`. It chains exactly four binaries through \`docker compose exec -T cli\`: \`govcms-db-update\`, \`govcms-config-import\`, \`govcms-cache-rebuild\`, \`govcms-enable_modules\`.
- **\`scripts/govcms-deploy\`** — one environment-branching script in \`scaffold-tooling\`. Its internal order is \`cache:rebuild\` *then* \`updatedb\`, and on production it takes the backup-and-deploy path only when \`drush status\` reports bootstrap is **not** \`Successful\`. Read it before you quote it. Lagoon never calls it.
- **the Lagoon rollout** — the real one, declared in \`.lagoon.yml\`: three \`pre-rollout\` tasks, then eight \`post-rollout\` tasks.

### The rollout, in order

Pre-rollout runs \`govcms-pre-deploy-db-update\`, \`govcms-db-backup\`, \`govcms-config-backup\`. The last two are production-only and write into \`web/sites/default/files/private/backups\`. Pre-rollout is skipped entirely on an environment's first deploy.

Post-rollout, all eight, in file order:

\`\`\`text
1 Prepare the site for deployment           govcms-update_site_alias
2 Perform GovCMS platform validations       shipshape   (inside the SaaS-only block)
3 Synchronise the database                  govcms-db-sync
4 Perform database updates                  govcms-db-update
5 Perform config import                     govcms-config-import
6 Perform cache rebuild                     govcms-cache-rebuild
7 Ensure GovCMS/Lagoon modules are enabled  govcms-enable_modules
8 Preserve the last successful backup       govcms-backups-preserve
\`\`\`

Task 1 has no skip guard. Every other task carries \`when: withDefault("GOVCMS_SKIP_...", false) == false\`.

### The question that separates operators from readers

Lagoon runs post-rollout tasks *after* every container has been replaced with the new image and has passed its readiness check. There is no maintenance-mode toggle anywhere in the file. So from the first millisecond of task 1, the new code is already answering requests against the old database.

Fail at \`govcms-config-import\` on production and the site sits in a state no single command describes:

- **database updated and irreversible** — task 4 already ran \`drush updatedb -y\`; schema updates do not un-apply.
- **config partially imported** — \`config:import\` is not transactional in any useful sense. What landed, landed.
- **caches stale** — the rebuild is task 6 and never ran, so new code is serving pre-import cached definitions.
- **backup un-rotated** — task 8 never ran, so \`pre-deploy-dump.sql.gz\` was never moved to \`pre-deploy-dump-last-good.sql.gz\`.

There is no rollback task in \`.lagoon.yml\`. Recovery is a fresh deployment.

### govcms-drush, the wrapper

\`govcms-drush\` builds \`COMMAND="drush $*"\`, runs it while teeing stderr, and on failure sends mail to a GovCMS DevOps address plus anything in \`GOVCMS_DRUSH_RECIPIENTS\` — but only when \`GOVCMS_DRUSH_NOTIFICATION_ENABLE\` is \`true\`. Otherwise it prints \`[fail]: Command failed, notifications not enabled. Skipping.\` and exits 1. The scaffold's cron entry calls it; the deploy tasks call the individual binaries instead.`,
  comparisons: [
    {
      label: "Declaring the deploy sequence",
      intro:
        "Same four operations — snapshot, updatedb, config import, cache rebuild. On a site you control you write the script; on GovCMS you declare tasks and the platform's binaries decide what actually happens.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `#!/usr/bin/env bash
# deploy.sh - run by CI once the build artefact is on the target.
set -euo pipefail

cd /var/www/app

drush state:set system.maintenance_mode 1 -y
drush sql:dump --gzip --extra-dump=--no-tablespaces \\
  --result-file=/var/backups/pre-deploy.sql

drush updatedb -y
drush config:import -y
drush cache:rebuild

drush state:set system.maintenance_mode 0 -y
echo "deployed"`,
      ts: `# .lagoon.yml (excerpt) - you declare tasks, Lagoon sequences them.
tasks:
  pre-rollout:
    - run:
        name: Snapshot the database and store
        command: "[ -f /app/vendor/bin/govcms-db-backup ] && /app/vendor/bin/govcms-db-backup || echo 'Database backup is not available.'"
        service: cli
        shell: bash
        when: withDefault("GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP", false) == false

  post-rollout:
    - run:
        name: Perform database updates
        command: /app/vendor/bin/govcms-db-update
        service: cli
        shell: bash
        when: withDefault("GOVCMS_SKIP_DB_UPDATE", false) == false
    - run:
        name: Perform config import
        command: /app/vendor/bin/govcms-config-import
        service: cli
        shell: bash
        when: withDefault("GOVCMS_SKIP_CONFIG_IMPORT", false) == false
    - run:
        name: Perform cache rebuild
        command: /app/vendor/bin/govcms-cache-rebuild
        service: cli
        shell: bash
        when: withDefault("GOVCMS_SKIP_CACHE_REBUILD", false) == false`,
      note: "No maintenance mode on either side of the GovCMS rollout — containers are already swapped and serving before task 1 runs, so there is no window to close.",
    },
    {
      label: "Invoking drush",
      intro:
        "On a normal Drupal site drush is a host binary and its exit code is the whole story. On GovCMS it is never on the host, and the platform ships its own entry point around it.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Drush lives on the host (or reaches the host over an SSH alias).
# The exit code is all the feedback there is; CI turns it into an alert.
drush @prod.live updatedb -y
drush @prod.live config:import -y
drush @prod.live cache:rebuild

# Locally, straight off your PATH against a settings.local.php.
drush status --fields=bootstrap --format=json`,
      ts: `# Locally: never on the host. .ahoy.yml defines drush as an exec.
#   drush: docker compose exec -T cli drush "$@"
ahoy drush updatedb -y

# On the platform: the cron entry in .lagoon.yml calls the wrapper.
#   command: '/app/vendor/bin/govcms-drush cron --root=/app'

# scripts/govcms-drush, condensed - why the wrapper exists:
COMMAND="drush $*"
if $COMMAND 2> >(tee $TMP); then
  echo "[success]: Command completed successfully"
  exit
fi

if [ "$GOVCMS_DRUSH_NOTIFICATION_ENABLE" != "true" ]; then
  echo "[fail]: Command failed, notifications not enabled. Skipping."
  exit 1
fi

send_errors   # sendmail to GovCMS DevOps + GOVCMS_DRUSH_RECIPIENTS,
              # plus a Slack attachment when SLACK_TOKEN is set.
exit 1`,
      note: "The wrapper adds notification, not retry or rollback: it still exits 1. Deploy tasks call the individual govcms-* binaries; the cron entry is what uses govcms-drush.",
    },
    {
      label: "Turning a step off",
      intro:
        "You want to deploy without importing configuration. On your own site that is one edit. On GovCMS the answer is two independent layers, and one of them can skip silently without you asking.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
set -euo pipefail

# You own the script, so you own the switch.
SKIP_CIM=\${SKIP_CIM:-0}

drush updatedb -y

if [ "$SKIP_CIM" != "1" ]; then
  drush config:import -y
else
  echo "config import skipped by request"
fi

drush cache:rebuild`,
      ts: `# Layer 1 - the .lagoon.yml when: clause. Set a build-scope variable on
# the project/environment and the task is never dispatched at all:
#   when: withDefault("GOVCMS_SKIP_CONFIG_IMPORT", false) == false

# Layer 2 - the binary's own guards. Each of these makes
# govcms-config-import print a [skip] line and exit 0, so the deploy
# still goes green with no configuration imported:
GOVCMS_DEPLOY_WORKFLOW_CONFIG=retain    # "[skip]: Workflow is not set to import."
GOVCMS_TEST_CANARY=1                    # "[skip]: Config import disabled on canary sites."
LAGOON_GIT_SAFE_BRANCH=internal-govcms-update-1

# ...plus two you never set, evaluated every single run:
ls -1 /app/config/default/*.yml | wc -l  # 0 -> "[skip]: There is no configuration."
drush status --fields=bootstrap --format=json
                                         # != Successful -> "[skip]: Site is not available."`,
      note: "A green GovCMS deploy does not prove config was imported. Read the task log for the [update] line, not the exit code.",
    },
    {
      label: "Recovering from a bad deploy",
      intro:
        "The deploy went out and the site is wrong. Where is the restore point, and who is allowed to use it?",
      leftLang: "bash",
      rightLang: "bash",
      php: `# You took the snapshot, so you own the restore.
drush state:set system.maintenance_mode 1 -y
drush sql:drop -y
gunzip < /var/backups/pre-deploy.sql.gz | drush sql:cli

git -C /var/www/app checkout "$PREVIOUS_TAG"
composer install --no-dev --optimize-autoloader

drush cache:rebuild
drush state:set system.maintenance_mode 0 -y`,
      ts: `# The pre-rollout snapshot is taken for you - production only - into the
# private files tree, which is the one persistent Lagoon volume:
#   /app/web/sites/default/files/private/backups/pre-deploy-dump.sql.gz

# Rotation is the LAST post-rollout task, so a mid-rollout failure leaves
# this deploy's snapshot exactly where it was written:
#   govcms-backups-preserve
#     mv pre-deploy-dump.sql.gz pre-deploy-dump-last-good.sql.gz

# There is no restore task in .lagoon.yml, and on SaaS you cannot add one -
# .lagoon.yml is a locked file. Recovery is a new deployment:
git revert --no-edit HEAD
git push origin master

# ...which re-runs all eight post-rollout tasks against the already-updated
# database. Anything drush updatedb applied stays applied.`,
      note: "Reverting the commit reverts the code and the exported config, never the schema. If the update hook was the problem you are asking GovCMS support to restore, not redeploying.",
    },
  ],
  playground: {
    intro:
      "A sequencer over the eight post-rollout tasks. Each carries a skip guard and a reversibility flag; the run fails at config import. Read the STATE AFTER FAILURE block as the answer to the interview question.",
    lang: "php",
    code: `<?php

// The eight .lagoon.yml post-rollout tasks as a sequencer.
// Lagoon replaces every container BEFORE task 1 runs, so on every line
// below the new code is already answering production traffic.

$env = [
  'LAGOON_ENVIRONMENT_TYPE' => 'production',
  'GOVCMS_SKIP_AUDIT'       => 'true',
];

$steps = [
  ['govcms-update_site_alias',  'Prepare the site',          '',                          0, 1, 'private dirs made, alias templated'],
  ['shipshape',                 'Platform validations',      'GOVCMS_SKIP_AUDIT',         0, 1, 'read-only report'],
  ['govcms-db-sync',            'Synchronise the database',  'GOVCMS_SKIP_DB_SYNC',       1, 0, 'prod database copied over env'],
  ['govcms-db-update',          'Database updates',          'GOVCMS_SKIP_DB_UPDATE',     0, 0, 'schema + data at new version'],
  ['govcms-config-import',      'Config import',             'GOVCMS_SKIP_CONFIG_IMPORT', 0, 0, 'active config rewritten'],
  ['govcms-cache-rebuild',      'Cache rebuild',             'GOVCMS_SKIP_CACHE_REBUILD', 0, 1, 'caches rebuilt'],
  ['govcms-enable_modules',     'Enable platform modules',   'GOVCMS_SKIP_ENABLE_MODULES',0, 1, 'platform modules forced on'],
  ['govcms-backups-preserve',   'Preserve last backup',      'GOVCMS_SKIP_PRESERVE_BACKUP',0,1, 'snapshot rotated to -last-good'],
];

$fails_at = 'govcms-config-import';
$halted   = '';
$state    = [];

printf("POST-ROLLOUT SEQUENCE  env=%s  injected failure=%s\\n", $env['LAGOON_ENVIRONMENT_TYPE'], $fails_at);
printf("%-2s %-26s %-10s %-10s %s\\n", '#', 'TASK', 'RESULT', 'REVERSIBLE', 'EFFECT');
printf("%s\\n", str_repeat('-', 84));

foreach ($steps as $i => $s) {
  list($bin, $task, $guard, $prod_only, $undo, $effect) = $s;
  $note = $effect;

  if ($halted !== '') {
    $result = 'not run';
    $note   = '(never dispatched)';
  } elseif ($guard !== '' && isset($env[$guard]) && $env[$guard] === 'true') {
    $result = 'when:skip';
    $note   = 'guard ' . $guard;
  } elseif ($prod_only === 1 && $env['LAGOON_ENVIRONMENT_TYPE'] === 'production') {
    $result = 'self:skip';
    $note   = 'binary refuses on production';
  } elseif ($bin === $fails_at) {
    $result = 'FAIL';
    $halted = $bin;
    $note   = $effect . ' (PARTIAL)';
    $state[] = [$task . ' [PARTIAL]', $undo === 1 ? 'reversible' : 'IRREVERSIBLE', $note];
  } else {
    $result = 'ok';
    $state[] = [$task, $undo === 1 ? 'reversible' : 'IRREVERSIBLE', $effect];
  }

  printf("%-2d %-26s %-10s %-10s %s\\n", $i + 1, $task, $result, $undo === 1 ? 'yes' : 'no', $note);
}

printf("\\nSTATE AFTER FAILURE AT %s\\n", $halted);
printf("%s\\n", str_repeat('=', 84));
printf("  %-30s %-14s %s\\n", 'containers', 'n/a', 'new image, already serving traffic');
foreach ($state as $row) {
  printf("  %-30s %-14s %s\\n", $row[0], $row[1], $row[2]);
}
printf("  %-30s %-14s %s\\n", 'caches', 'stale', 'rebuild is task 6, never ran');
printf("  %-30s %-14s %s\\n", 'pre-deploy-dump.sql.gz', 'un-rotated', 'preserve is task 8, never ran');

$recovery = [
  'Accept the site is live on the new code. Lagoon does not roll containers back.',
  'Read the failed task log: the drush config:import error is the only diff you get.',
  'In the cli container run drush config:status to see what landed and what did not.',
  'Fix config/default in git so the import is replayable from the top.',
  'Redeploy the branch. All eight tasks re-run; updatedb is a no-op second time.',
  'Only if an update hook is the culprit: the snapshot is still pre-deploy-dump.sql.gz.',
];

printf("\\nRECOVERY SEQUENCE\\n");
printf("%s\\n", str_repeat('=', 84));
foreach ($recovery as $i => $line) {
  printf("  %d. %s\\n", $i + 1, $line);
}`,
    output: `POST-ROLLOUT SEQUENCE  env=production  injected failure=govcms-config-import
#  TASK                       RESULT     REVERSIBLE EFFECT
------------------------------------------------------------------------------------
1  Prepare the site           ok         yes        private dirs made, alias templated
2  Platform validations       when:skip  yes        guard GOVCMS_SKIP_AUDIT
3  Synchronise the database   self:skip  no         binary refuses on production
4  Database updates           ok         no         schema + data at new version
5  Config import              FAIL       no         active config rewritten (PARTIAL)
6  Cache rebuild              not run    yes        (never dispatched)
7  Enable platform modules    not run    yes        (never dispatched)
8  Preserve last backup       not run    yes        (never dispatched)

STATE AFTER FAILURE AT govcms-config-import
====================================================================================
  containers                     n/a            new image, already serving traffic
  Prepare the site               reversible     private dirs made, alias templated
  Database updates               IRREVERSIBLE   schema + data at new version
  Config import [PARTIAL]        IRREVERSIBLE   active config rewritten (PARTIAL)
  caches                         stale          rebuild is task 6, never ran
  pre-deploy-dump.sql.gz         un-rotated     preserve is task 8, never ran

RECOVERY SEQUENCE
====================================================================================
  1. Accept the site is live on the new code. Lagoon does not roll containers back.
  2. Read the failed task log: the drush config:import error is the only diff you get.
  3. In the cli container run drush config:status to see what landed and what did not.
  4. Fix config/default in git so the import is replayable from the top.
  5. Redeploy the branch. All eight tasks re-run; updatedb is a no-op second time.
  6. Only if an update hook is the culprit: the snapshot is still pre-deploy-dump.sql.gz.
`,
  },
  keyPoints: [
    "Three sequences share the name: `ahoy govcms-deploy` chains four binaries locally, `scripts/govcms-deploy` is a standalone environment-branching script Lagoon never calls, and the real rollout is the three pre-rollout plus eight post-rollout tasks in `.lagoon.yml`.",
    "Post-rollout order is fixed: update_site_alias, shipshape (SaaS-only block), db-sync, db-update, config-import, cache-rebuild, enable_modules, backups-preserve. Only task 1 has no `when:` guard.",
    "Lagoon swaps containers and passes readiness checks before task 1, and nothing sets maintenance mode — the site serves new code against the old database for the whole rollout.",
    "A failure at config import leaves an irreversible database update applied, configuration partially imported, caches unrebuilt (task 6) and the pre-deploy snapshot un-rotated (task 8).",
    "Every deploy binary can skip itself and still exit 0 — `[skip]: Site is not available.`, `[skip]: There is no configuration.`, `[skip]: Workflow is not set to import.` — so a green deploy is not evidence that anything ran.",
    "`govcms-drush` wraps `drush \"$@\"` to email and Slack failures when `GOVCMS_DRUSH_NOTIFICATION_ENABLE=true`; it still exits 1, and it is the cron entry point, not the deploy entry point.",
  ],
  interview: [
    {
      q: "Walk me through what GovCMS actually runs when I push to master.",
      a: "Lagoon builds the images, then runs the three `pre-rollout` tasks in the *old* containers — `govcms-pre-deploy-db-update`, then a production-only database snapshot and config snapshot into the private files tree. It swaps every container to the new image and waits for readiness, then runs eight `post-rollout` tasks in order: prepare the site, shipshape validations (SaaS only), db-sync, db-update, config import, cache rebuild, enable platform modules, preserve the last backup. The thing people miss is that pre-rollout is skipped on an environment's first deploy, which is exactly why `govcms-db-sync` has its own bootstrap check — it syncs when `drush status` cannot report `Successful`. I'd also point out that `scripts/govcms-deploy` exists in scaffold-tooling and is *not* what Lagoon runs, so quoting its ordering in an incident review sends people the wrong way.",
    },
    {
      q: "A production deploy failed at 'Perform config import'. What state is the site in, and what do you do?",
      a: "The site is live on the new code — containers were replaced before task 1 and there is no maintenance mode in `.lagoon.yml`. `govcms-db-update` already ran `drush updatedb -y`, so schema updates are applied and not reversible; config import got partway and stopped; the cache rebuild is task 6 so the container is serving new code against pre-import cached definitions; and `govcms-backups-preserve` is task 8, so `pre-deploy-dump.sql.gz` is still this deploy's snapshot and was never rotated to `-last-good`. Practically I read the config:import error in the task log, run `drush config:status` in the cli container to see what landed, fix `config/default` in git and redeploy — a revert restores code and exported config, never the schema. If an update hook is the actual problem, that is a support conversation about restoring the snapshot, not something I can self-serve on SaaS where `.lagoon.yml` is locked.",
    },
    {
      q: "How would you deploy without importing configuration, and what could go wrong?",
      a: "There are two independent layers. The `when: withDefault(\"GOVCMS_SKIP_CONFIG_IMPORT\", false) == false` clause on the task means a build-scope variable stops Lagoon dispatching it at all — and on SaaS I cannot edit `.lagoon.yml` to add my own, so that variable is the mechanism. Separately `govcms-config-import` has its own guards: `GOVCMS_DEPLOY_WORKFLOW_CONFIG` not set to `import`, a canary flag, an internal update branch, no YAML in `config/default`, or a site that will not bootstrap. All of those print a `[skip]` line and exit 0. So the failure mode I actually watch for is the opposite of the question: a perfectly green deploy where configuration silently never imported, which is why I grep the task log for the `[update]: Import site configuration.` line rather than trusting the deploy status.",
    },
    {
      q: "What is govcms-drush and why not just call drush?",
      a: "It is a thin wrapper in scaffold-tooling that builds `COMMAND=\"drush $*\"`, runs it while teeing stderr to a temp file, and on failure emails the GovCMS DevOps address plus anything in `GOVCMS_DRUSH_RECIPIENTS`, and posts a Slack attachment when `SLACK_TOKEN` is set — but only when `GOVCMS_DRUSH_NOTIFICATION_ENABLE` is `true`. Otherwise it prints `[fail]: Command failed, notifications not enabled. Skipping.` and exits 1 anyway, so it adds observability, not resilience. The scaffold's cron entry uses it — `/app/vendor/bin/govcms-drush cron --root=/app` — precisely because a silently failing cron is the classic invisible outage. Note the deploy tasks call the individual `govcms-*` binaries, not this wrapper, and that locally `ahoy drush` is just `docker compose exec -T cli drush`; drush never runs on the host.",
    },
  ],
  quiz: [
    {
      question:
        "In the `.lagoon.yml` post-rollout list, which task runs immediately before `Perform config import`?",
      options: [
        "Perform cache rebuild",
        "Perform GovCMS platform validations",
        "Perform database updates",
        "Synchronise the database",
      ],
      answerIndex: 2,
      explain:
        "Order is: update_site_alias, shipshape (SaaS-only), db-sync, db-update, config-import, cache-rebuild, enable_modules, backups-preserve. The database is updated before configuration is imported, and the cache rebuild comes after both.",
    },
    {
      question:
        "A post-rollout task exits non-zero on production. What is the state of the containers at that moment?",
      options: [
        "Already replaced with the new image and serving traffic — Lagoon rolls out before post-rollout tasks run.",
        "Still on the previous image; Lagoon promotes the new pods only once every task passes.",
        "In maintenance mode, which task 1 enables and task 8 disables.",
        "Automatically reverted to the last successful image by the deploy controller.",
      ],
      answerIndex: 0,
      explain:
        "Lagoon documents post-rollout tasks as running after all images are built, all containers updated, and readiness checks passed. Nothing in GovCMS's `.lagoon.yml` toggles maintenance mode, and there is no automatic container rollback.",
    },
    {
      question: "What does `ahoy govcms-deploy` actually run?",
      options: [
        "The same eight post-rollout tasks Lagoon runs, in the same order.",
        "`scripts/govcms-deploy` inside the cli container.",
        "The three pre-rollout tasks followed by the eight post-rollout tasks.",
        "Four binaries via `docker compose exec -T cli`: db-update, config-import, cache-rebuild, enable_modules.",
      ],
      answerIndex: 3,
      explain:
        "The `.ahoy.yml` target makes the private tmp directory and then chains exactly those four binaries. It is not the rollout, and it is not `scripts/govcms-deploy` — three different sequences that get conflated constantly.",
    },
    {
      question:
        "A production deploy fails at config import. Where is the pre-deploy database snapshot?",
      options: [
        "At `files/private/backups/pre-deploy-dump-last-good.sql.gz`, rotated by the pre-rollout task.",
        "At `files/private/backups/pre-deploy-dump.sql.gz`, un-rotated, because `govcms-backups-preserve` is task 8 and never ran.",
        "Nowhere — `govcms-db-backup` only takes snapshots on non-production environments.",
        "Only in Lagoon's off-cluster backup store, retrievable via a support ticket.",
      ],
      answerIndex: 1,
      explain:
        "`govcms-db-backup` runs pre-rollout and writes `pre-deploy-dump.sql.gz` (production only). Rotation to `-last-good.sql.gz` is `govcms-backups-preserve`, the final post-rollout task, so a mid-rollout failure means it never happened.",
    },
  ],
};

export default lesson;
