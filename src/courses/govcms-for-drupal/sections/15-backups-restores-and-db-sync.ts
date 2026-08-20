import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "backups-restores-and-db-sync",
  title: "Backups, Retention and Pulling Production Down",
  part: "Lagoon: Deploy & Run",
  estMinutes: 13,
  summary:
    "GovCMS runs two unrelated backup systems with different retention rules, and the one command that copies production into a lower environment does no sanitisation at all.",
  concept: `## Two backup systems that do not overlap

You already know how to back a Drupal site up: \`drush sql:dump\`, a cron entry, a bucket you own. On GovCMS neither backup system is yours, and they answer different questions.

**Lagoon's automated backups.** Lagoon takes nightly backups of every database and persistent volume on a \`M H(22-2) * * *\` schedule — the \`M\` is mandatory so the platform can load-balance the exact minute. The published default retention is *daily: 7, weekly: 6*, evaluated by Restic. Production environments can override it with a \`backup-retention\` block in \`.lagoon.yml\`; the Lagoon docs say other environment types cannot. On SaaS \`.lagoon.yml\` is a locked file, so you cannot override it at all. Retrieval is two steps — retrieve, then download — in the Lagoon UI or CLI.

**The deploy snapshot.** Separately, pre-rollout runs \`govcms-db-backup\` and \`govcms-config-backup\`. Both refuse outside production. They write into \`/app/web/sites/default/files/private/backups\`, inside the site's own persistent volume:

- \`pre-deploy-dump.sql.gz\` — \`drush sql:dump --gzip --extra-dump=--no-tablespaces\`, taken from the read replica when \`MARIADB_READREPLICA_HOSTS\` is set.
- \`pre-deploy-config.tar.gz\` — a \`config:export\` tarred with \`--remove-files\`.

Post-rollout task 8, \`govcms-backups-preserve\`, moves \`pre-deploy-dump.sql.gz\` to \`pre-deploy-dump-last-good.sql.gz\`. That is the entire rotation. **Depth is one**, and the next deploy's pre-rollout overwrites the file, so you get exactly one deploy of grace.

Two traps worth memorising. \`govcms-db-backup\` exits **0** when \`drush status\` reports bootstrap is not \`Successful\` — it prints \`[fail]: Drupal is not installed or operational.\` and the rollout continues with no snapshot; the source even carries the comment \`# Perhaps exit > 0 to fail the build?\`. And \`govcms-db-restore\` exists in \`scripts/deploy/\` but is absent from scaffold-tooling's composer \`bin\` list, so it is not on \`PATH\` as a vendor binary.

## Pulling production down

\`govcms-db-sync\` is post-rollout task 3. It refuses to run on production, then applies a gate you should be able to recite: sync if the environment is a canary, or the branch matches \`internal-govcms-update*\`, or the site cannot bootstrap (a brand-new environment), or \`GOVCMS_DEPLOY_WORKFLOW_CONTENT\` is \`import\`. Otherwise it prints \`[skip]: Site can be bootstrapped and the content workflow is not set to "import".\` A new branch environment therefore gets production on its first deploy and nothing after that.

Mechanically it dumps \`@govcms.prod\` with \`--structure-tables-list=search_index,search_total,redirect_404,cache,cache_*\`, rsyncs the gzip down, runs \`sql:drop\`, then pipes it into the \`mysql\` client rather than \`drush sqlc\` — that is the \`DB_LOAD_NO_DRUSH\` default, and it exists to dodge Drush's four-hour timeout.

### Sanitisation is a compliance step, not a courtesy

The last line before success is \`# @todo: Add sanitisation?\`. It performs none. GovCMS is certified to host websites information with a classification level up to **OFFICIAL: Sensitive**, and the platform tells prospective agencies *"If your website uses authentication, collects personal information or payments, talk to us early."* A development environment is a lower-protection place with a wider access list; \`govcms-db-sync\` moves real names, addresses and webform submissions into it verbatim. Under the Privacy Act and the Australian Privacy Principles that is a decision someone has to make, and \`/support/security\` puts content and user account management on the agency even for SaaS.

Two paths *are* sanitised, and both are pull-based rather than push: databases downloaded from the GovCMS Dashboard, and the nightly \`MARIADB_DATA_IMAGE\` you fetch with \`ahoy refresh-db\`. The developer wiki says only that Dashboard databases are "automatically sanitized" and that "Emails and passwords will have changed". No field-level ruleset is published, so treat everything else as untouched and re-sanitise what you care about yourself.`,
  comparisons: [
    {
      label: "Nightly backups and how long they live",
      intro:
        "Same requirement: a nightly dump, off-box, with a retention window someone can defend to an auditor. On your own server you write the schedule and the rotation; on GovCMS both are platform config, and on SaaS the file that holds them is locked.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# A server you own: the schedule, the rotation and the restore are all yours.
# /usr/local/bin/site-backup.sh, invoked from cron at 02:15 nightly.
set -euo pipefail

STAMP=$(/bin/date -u +%Y-%m-%d)
DEST=/srv/backups/prod
mkdir -p "$DEST"

drush --root=/var/www/prod/web sql:dump --gzip --extra-dump=--no-tablespaces --result-file="$DEST/db-$STAMP.sql"
aws s3 cp "$DEST/db-$STAMP.sql.gz" "s3://agency-backups/prod/db-$STAMP.sql.gz"

# Rotation is yours too: 14 dailies on disk, lifecycle rules in the bucket.
find "$DEST" -name 'db-*.sql.gz' -mtime +14 -delete
aws s3api put-bucket-lifecycle-configuration --bucket agency-backups --lifecycle-configuration file:///etc/agency/retention.json

# Restore is one command you can run at 2am.
gunzip -c "$DEST/db-2026-08-19.sql.gz" | drush --root=/var/www/prod/web sqlc`,
      ts: `# .lagoon.yml -- agency-editable on PaaS, a locked file on SaaS (a push that
# changes it is declined). The GovCMS scaffold ships neither key below, so
# Lagoon's published defaults apply: daily 7, weekly 6, evaluated by Restic.

backup-schedule:
  production: "M H(22-2) * * *"

backup-retention:
  production:
    monthly: 0
    weekly: 12
    daily: 14
    hourly: 0

# Only production accepts a retention override; Lagoon's docs state that other
# environment types cannot. There is no restore key anywhere in the schema:
# retrieval is a two-step "retrieve, then download" in the Lagoon UI or CLI.

tasks:
  pre-rollout:
    - run:
        name: Snapshot the database and store
        command: "[ -f /app/vendor/bin/govcms-db-backup ] && /app/vendor/bin/govcms-db-backup || echo 'Database backup is not available.'"
        service: cli
        shell: bash
        when: withDefault("GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP", false) == false`,
      note: "The minute field must be the literal M or the Lagoon build fails, and on SaaS you cannot edit either key — changing retention is a support ticket, not a commit.",
    },
    {
      label: "The pre-deploy snapshot and its rotation depth",
      intro:
        "Both sides take a dump immediately before a release so there is something to roll back to. The difference is how many of those dumps still exist a week later.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
# deploy.sh on a site you control: snapshot, deploy, keep ten, restore on failure.
set -euo pipefail

STAMP=$(/bin/date -u +%Y%m%dT%H%M%SZ)
DEST=/srv/backups/releases
drush sql:dump --gzip --extra-dump=--no-tablespaces --result-file="$DEST/pre-$STAMP.sql"

if ! (drush updatedb -y && drush config:import -y && drush cache:rebuild); then
  echo "Deploy failed, restoring $STAMP"
  drush sql:drop -y
  gunzip -c "$DEST/pre-$STAMP.sql.gz" | drush sqlc
  exit 1
fi

# Ten release snapshots stay on disk; you can diff or restore any of them.
ls -1t "$DEST"/pre-*.sql.gz | tail -n +11 | xargs -r rm --`,
      ts: `# Pre-rollout, production only. Elsewhere: "[skip]: Non-production environment."
/app/vendor/bin/govcms-db-backup      # -> private/backups/pre-deploy-dump.sql.gz
/app/vendor/bin/govcms-config-backup  # -> private/backups/pre-deploy-config.tar.gz

# Eight post-rollout tasks later, and only if none of them failed:
/app/vendor/bin/govcms-backups-preserve
# mv pre-deploy-dump.sql.gz pre-deploy-dump-last-good.sql.gz

ls -1 /app/web/sites/default/files/private/backups
# pre-deploy-config.tar.gz
# pre-deploy-dump-last-good.sql.gz

# Depth is one. Tomorrow's pre-rollout overwrites pre-deploy-dump.sql.gz, and
# the deploy after that overwrites -last-good. There is no third file.
# Restoring is not a vendor binary either: scripts/deploy/govcms-db-restore
# exists in scaffold-tooling but is not in its composer "bin" list, so:
cd /app/web/sites/default/files/private/backups
drush sql:drop -y
gunzip -c pre-deploy-dump-last-good.sql.gz | drush sqlc
drush cache:rebuild`,
      note: "Anything older than the previous deploy has to come from Lagoon's nightly backups, which are a different system with a different retrieval path.",
    },
    {
      label: "Refreshing a lower environment from production",
      intro:
        "The everyday task: get today's production content into dev. On a site you control it is one Drush command you type; on GovCMS it is a deploy-time task with a gate, and you influence it rather than invoke it.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Two aliases you wrote, an SSH key you control, one command.
# drush/sites/agency.site.yml defines @agency.prod and @agency.dev.

drush sql:sync @agency.prod @agency.dev -y --create-db --structure-tables-key=common
drush @agency.dev sql:sanitize -y --sanitize-email=user+%uid@localhost.localdomain
drush @agency.dev rsync @agency.prod:%files @agency.dev:%files -y
drush @agency.dev cache:rebuild

# Want it nightly? It is your crontab.
# 30 3 * * * /usr/local/bin/refresh-dev.sh >> /var/log/refresh-dev.log 2>&1`,
      ts: `# You never invoke this. @govcms.prod is resolvable only from inside the
# cluster, and post-rollout task 3 already owns the operation.
#
# govcms-db-sync refuses on production, then applies exactly this gate:
#   GOVCMS_SKIP_DB_SYNC not FALSE          -> "[skip]: Workflow is not set to sync db."
#   canary environment                     -> sync
#   branch internal-govcms-update*         -> sync
#   drush status bootstrap != Successful   -> sync   (a brand-new environment)
#   GOVCMS_DEPLOY_WORKFLOW_CONTENT=import  -> sync
#   otherwise                              -> skip, and the environment keeps its data

# Note what the gate implies: a redeploy on its own changes nothing. For an
# ordinary branch the only clause left is "cannot bootstrap", so the developer
# wiki's three ways to "refresh remote site databases with PROD" all begin with
# the same precondition -- "Delete the remote environments and:"
#   1. (the wiki's "Easiest") re-trigger the build step in the deployment
#      pipeline for that branch
#   2. push an empty commit to re-trigger the deployment
#   3. delete the remote branch and re-push your local copy
# Skip the deletion and step 2 is just this, followed by the [skip] line above:
git commit --allow-empty -m "Refresh dev from the latest production database"
git push origin dev

# The other route needs no deletion at all: set that environment's
# GOVCMS_DEPLOY_WORKFLOW_CONTENT to "import" and every deploy syncs.

# Locally, pull the sanitised nightly image instead of touching production:
#   .env -> MARIADB_DATA_IMAGE=gitlab-registry-production.govcms.amazee.io/org/project/mariadb-drupal-data
ahoy refresh-db`,
      note: "The gate means a branch environment is seeded once, on its first deploy, and then drifts — a standing daily refresh is not something you can add on SaaS.",
    },
    {
      label: "Sanitising personal information out of the copy",
      intro:
        "Production holds names, contact details and webform submissions. On a site you control you make sanitisation part of sql:sanitize so nobody can forget it; on GovCMS you cannot install that code and the sync does not call it.",
      leftLang: "php",
      rightLang: "bash",
      php: `<?php

// web/modules/custom/agency_sanitise/src/Drush/Commands/SanitiseAgencyCommands.php
// A Drush sanitize plugin: it runs inside \`drush sql:sanitize\`, so every
// developer who follows the documented sync-then-sanitize flow gets it.
//
// The directory is not negotiable. Drush 12+ expects command files in
// <module>/src/Drush/<Commands|Generators|Listeners>; the old src/Commands plus
// drush.services.yml route is deprecated and no longer discovered. A sanitiser
// that is silently never found is the worst failure mode there is.

namespace Drupal\\agency_sanitise\\Drush\\Commands;

use Consolidation\\AnnotatedCommand\\CommandData;
use Consolidation\\AnnotatedCommand\\Hooks\\HookManager;
use Drupal\\Core\\Database\\Connection;
use Drush\\Attributes as CLI;
use Drush\\Commands\\DrushCommands;
use Drush\\Commands\\sql\\sanitize\\SanitizeCommands;
use Drush\\Commands\\sql\\sanitize\\SanitizePluginInterface;
use Symfony\\Component\\Console\\Input\\InputInterface;

final class SanitiseAgencyCommands extends DrushCommands implements SanitizePluginInterface {

  // AutowireTrait is how every Drush core sanitize plugin injects services,
  // and what the docs recommend from 12.5+. If you hand-write create() instead,
  // hint Psr\\Container\\ContainerInterface -- Drush passes a League container
  // delegating to Drupal's, not Symfony\\Component\\DependencyInjection's, so the
  // Symfony hint is a TypeError at instantiation.
  use Drush\\Commands\\AutowireTrait;

  public function __construct(protected Connection $database) {
    parent::__construct();
  }

  // SanitizePluginInterface declares two methods, not one. Omit this and the
  // class is abstract-by-omission: PHP fatals at class-load time.
  #[CLI\\Hook(type: HookManager::ON_EVENT, target: SanitizeCommands::CONFIRMS)]
  public function messages(array &$messages, InputInterface $input): void {
    $messages[] = dt('Sanitize agency personal information.');
  }

  #[CLI\\Hook(type: HookManager::POST_COMMAND_HOOK, target: SanitizeCommands::SANITIZE)]
  public function sanitize($result, CommandData $commandData): void {
    $this->database->update('users_field_data')
      ->expression('mail', "CONCAT('user+', uid, '@localhost.localdomain')")
      ->expression('init', "CONCAT('user+', uid, '@localhost.localdomain')")
      ->condition('uid', 0, '>')
      ->execute();
    $this->database->truncate('webform_submission_data')->execute();
    $this->database->truncate('webform_submission')->execute();
    $this->logger()->success(dt('Agency personal information sanitised.'));
  }

}

// Aside: in Drush 13 both SanitizeCommands::SANITIZE and ::CONFIRMS carry a
// #[Deprecated] attribute. The forward path is a listener subscribing to
// \\Drush\\Event\\SanitizeConfirmsEvent and to ConsoleTerminateEvent rather than
// the two hooks above.`,
      ts: `# That module cannot exist on SaaS: a custom module is not part of the
# build payload, and govcms-db-sync would not call it regardless.
# Its final line before "[success]" is, verbatim:
#     # @todo: Add sanitisation?

# So the sanitised copies are the ones the platform produces, and both are pulled:
#
# 1) GovCMS Dashboard -> Tasks -> "Generate database backup [drush sql-dump]",
#    download the artefact, extract it, then import locally:
tar -xf backup-2026-08-19.tar
ahoy mysql-import ./database-name.sql

# 2) The nightly image, once MARIADB_DATA_IMAGE is uncommented in .env:
ahoy refresh-db

# The wiki claims only that these are "automatically sanitized" and that
# "Emails and passwords will have changed" -- no field list is published.
# Assume everything else survived, and finish the job yourself:
ahoy drush sql:sanitize -y --sanitize-email=user+%uid@localhost.localdomain
ahoy drush sqlq "TRUNCATE TABLE webform_submission_data; TRUNCATE TABLE webform_submission;"`,
      note: "Because the sanitised sources are pull-based, an unsanitised copy of production only ever reaches a lower environment through govcms-db-sync — which is exactly the path nobody audits.",
    },
  ],
  playground: {
    intro:
      "Two mechanisms, no Drupal. First the retention sweep: a fixed list of dated snapshots run through a keep-N-daily / keep-N-weekly policy, with the preserved deploy snapshot exempt. Then the sanitiser that govcms-db-sync does not run.",
    lang: "php",
    code: `<?php

// ---------------------------------------------------------------------------
// 1. Retention. Lagoon's published defaults, applied by Restic each night.
//    The deploy snapshot lives outside the policy and is never pruned by it.
// ---------------------------------------------------------------------------

$policy = ['daily' => 7, 'weekly' => 6];

$sets = [
  'daily' => ['2026-08-20', '2026-08-19', '2026-08-18', '2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12'],
  'weekly' => ['2026-08-16', '2026-08-09', '2026-08-02', '2026-07-26', '2026-07-19', '2026-07-12', '2026-07-05', '2026-06-28'],
];

$snapshots = [];
foreach ($sets as $kind => $dates) {
  foreach ($dates as $i => $d) {
    $snapshots[] = ['date' => $d, 'kind' => $kind, 'rank' => $i + 1, 'name' => $kind . '-' . $d . '.tar'];
  }
}
$snapshots[] = ['date' => '2026-08-11', 'kind' => 'deploy', 'rank' => 1, 'name' => 'pre-deploy-dump-last-good.sql.gz'];

function verdict(array $s, array $policy): string {
  if ($s['kind'] === 'deploy') {
    return 'KEEP-preserved';
  }
  return $s['rank'] <= $policy[$s['kind']] ? 'KEEP' : 'PRUNE';
}

printf("RETENTION SWEEP  policy daily=%d weekly=%d  (deploy snapshot exempt)\\n", $policy['daily'], $policy['weekly']);
printf("%-12s %-7s %-5s %-34s %s\\n", 'DATE', 'KIND', 'RANK', 'ARTEFACT', 'VERDICT');

$kept = 0;
$pruned = 0;
$oldest = '9999-99-99';
foreach ($snapshots as $s) {
  $v = verdict($s, $policy);
  if ($v === 'PRUNE') {
    $pruned++;
  } else {
    $kept++;
    $oldest = $s['date'] < $oldest ? $s['date'] : $oldest;
  }
  printf("%-12s %-7s %-5d %-34s %s\\n", $s['date'], $s['kind'], $s['rank'], $s['name'], $v);
}

printf("RPO  kept=%d pruned=%d newest=2026-08-20 oldest-retained=%s\\n", $kept, $pruned, $oldest);
printf("RPO  nightly cadence: up to 24h of content sits in no snapshot at all.\\n");

// ---------------------------------------------------------------------------
// 2. Sanitisation. govcms-db-sync loads this payload into dev untouched.
// ---------------------------------------------------------------------------

$users = [
  ['uid' => 1, 'name' => 'admin', 'mail' => 'webmaster@agency.gov.au', 'phone' => '02 6215 1000'],
  ['uid' => 12, 'name' => 'p.nguyen', 'mail' => 'phuong.nguyen@agency.gov.au', 'phone' => '0400 111 222'],
  ['uid' => 27, 'name' => 'r.oduya', 'mail' => 'ruth.oduya@agency.gov.au', 'phone' => '0400 333 444'],
  ['uid' => 88, 'name' => 'vendor.dev', 'mail' => 'dev@vendor.example', 'phone' => ''],
  ['uid' => 91, 'name' => 'j.citizen', 'mail' => 'jane.citizen@example.org', 'phone' => '0400 555 666'],
];
$tables = ['users_field_data' => 5, 'webform_submission' => 1284, 'node_field_revision' => 4102];

function sanitise(array $u): array {
  $u['mail'] = 'user+' . $u['uid'] . '@localhost.localdomain';
  $u['phone'] = '';
  return $u;
}

function show(string $title, array $users): void {
  printf("\\n%s\\n", $title);
  printf("%-5s %-11s %-34s %s\\n", 'UID', 'NAME', 'MAIL', 'PHONE');
  foreach ($users as $u) {
    printf("%-5d %-11s %-34s %s\\n", $u['uid'], $u['name'], $u['mail'], $u['phone'] === '' ? '(blank)' : $u['phone']);
  }
}

show('DB SYNC PAYLOAD  before sanitisation', $users);
show('DB SYNC PAYLOAD  after sanitisation', array_map('sanitise', $users));

printf("\\n%-24s %-6s %s\\n", 'TABLE', 'ACTION', 'ROWS AFTER');
foreach ($tables as $t => $rows) {
  $drop = str_starts_with($t, 'webform_submission');
  printf("%-24s %-6s %d\\n", $t, $drop ? 'DROP' : 'KEEP', $drop ? 0 : $rows);
}
printf("govcms-db-sync applies none of the above: # @todo: Add sanitisation?\\n");`,
    output: `RETENTION SWEEP  policy daily=7 weekly=6  (deploy snapshot exempt)
DATE         KIND    RANK  ARTEFACT                           VERDICT
2026-08-20   daily   1     daily-2026-08-20.tar               KEEP
2026-08-19   daily   2     daily-2026-08-19.tar               KEEP
2026-08-18   daily   3     daily-2026-08-18.tar               KEEP
2026-08-17   daily   4     daily-2026-08-17.tar               KEEP
2026-08-16   daily   5     daily-2026-08-16.tar               KEEP
2026-08-15   daily   6     daily-2026-08-15.tar               KEEP
2026-08-14   daily   7     daily-2026-08-14.tar               KEEP
2026-08-13   daily   8     daily-2026-08-13.tar               PRUNE
2026-08-12   daily   9     daily-2026-08-12.tar               PRUNE
2026-08-16   weekly  1     weekly-2026-08-16.tar              KEEP
2026-08-09   weekly  2     weekly-2026-08-09.tar              KEEP
2026-08-02   weekly  3     weekly-2026-08-02.tar              KEEP
2026-07-26   weekly  4     weekly-2026-07-26.tar              KEEP
2026-07-19   weekly  5     weekly-2026-07-19.tar              KEEP
2026-07-12   weekly  6     weekly-2026-07-12.tar              KEEP
2026-07-05   weekly  7     weekly-2026-07-05.tar              PRUNE
2026-06-28   weekly  8     weekly-2026-06-28.tar              PRUNE
2026-08-11   deploy  1     pre-deploy-dump-last-good.sql.gz   KEEP-preserved
RPO  kept=14 pruned=4 newest=2026-08-20 oldest-retained=2026-07-12
RPO  nightly cadence: up to 24h of content sits in no snapshot at all.

DB SYNC PAYLOAD  before sanitisation
UID   NAME        MAIL                               PHONE
1     admin       webmaster@agency.gov.au            02 6215 1000
12    p.nguyen    phuong.nguyen@agency.gov.au        0400 111 222
27    r.oduya     ruth.oduya@agency.gov.au           0400 333 444
88    vendor.dev  dev@vendor.example                 (blank)
91    j.citizen   jane.citizen@example.org           0400 555 666

DB SYNC PAYLOAD  after sanitisation
UID   NAME        MAIL                               PHONE
1     admin       user+1@localhost.localdomain       (blank)
12    p.nguyen    user+12@localhost.localdomain      (blank)
27    r.oduya     user+27@localhost.localdomain      (blank)
88    vendor.dev  user+88@localhost.localdomain      (blank)
91    j.citizen   user+91@localhost.localdomain      (blank)

TABLE                    ACTION ROWS AFTER
users_field_data         KEEP   5
webform_submission       DROP   0
node_field_revision      KEEP   4102
govcms-db-sync applies none of the above: # @todo: Add sanitisation?
`,
  },
  keyPoints: [
    "GovCMS has two unrelated backup systems: Lagoon's nightly Restic-pruned snapshots of the database and persistent volumes, and the deploy-time snapshot that pre-rollout writes into the site's own private files directory.",
    "Lagoon's published default retention is daily 7 and weekly 6; only production can override it via `backup-retention` in `.lagoon.yml`, and on SaaS that file is locked, so retention is a support ticket rather than a commit.",
    "The deploy snapshot rotates exactly one deep — `govcms-backups-preserve` renames `pre-deploy-dump.sql.gz` to `pre-deploy-dump-last-good.sql.gz`, and the next pre-rollout overwrites the original.",
    "`govcms-db-backup` exits 0 when `drush status` reports bootstrap is not `Successful`, so a production site that is already broken gets deployed over with no snapshot; the script's own comment questions that choice.",
    "`govcms-db-sync` refuses on production and otherwise fires only for a canary, an `internal-govcms-update*` branch, a site that cannot bootstrap, or `GOVCMS_DEPLOY_WORKFLOW_CONTENT=import` — so branch environments are seeded once and then drift.",
    "`govcms-db-sync` performs no sanitisation at all (`# @todo: Add sanitisation?`); the sanitised copies are the GovCMS Dashboard download and the nightly `MARIADB_DATA_IMAGE`, and moving unsanitised OFFICIAL: Sensitive data into a lower environment is a privacy decision, not a convenience.",
  ],
  interview: [
    {
      q: "Production content was corrupted by a bad migration that ran two deploys ago. Walk me through recovery on GovCMS SaaS.",
      a: "First I check what still exists. The deploy snapshot is only one deep — `pre-deploy-dump-last-good.sql.gz` is the state before the *previous* successful deploy, and two deploys back it has already been overwritten, so it is almost certainly useless here. That pushes me to Lagoon's automated nightly backups, which default to daily 7 and weekly 6, retrieved through the two-step retrieve-then-download flow in the Lagoon UI or CLI. Because the site is SaaS I cannot restore that myself into production, so in parallel I raise a ticket — Critical is acknowledged within 60 minutes 24/7, and the published service desk wording is explicit that resolution times are not committed. While that runs I pull the same backup locally and work out exactly which tables and node revisions need replacing, so the restore is surgical rather than a full rollback that throws away two deploys of legitimate content.",
    },
    {
      q: "Why isn't `drush sql:sync @prod @dev` the answer on GovCMS, and what is?",
      a: "The alias only resolves inside the cluster and the operation already belongs to post-rollout task 3, `govcms-db-sync`, so there is nothing for me to invoke. That script refuses on production, then syncs only if the environment is a canary, the branch matches `internal-govcms-update*`, the site cannot bootstrap, or `GOVCMS_DEPLOY_WORKFLOW_CONTENT` is `import`; otherwise it prints that the site can be bootstrapped and the content workflow is not set to import, and leaves the data alone. Re-running the deployment on its own does not help, because the gate is still satisfied: the developer wiki's three ways to refresh a remote database — re-triggering the `build` step, which it calls the easiest, pushing an empty commit, or deleting and re-pushing the branch — all start with deleting the remote environment, since only an environment that cannot bootstrap fires the sync. The alternative is to set `GOVCMS_DEPLOY_WORKFLOW_CONTENT` to `import` for that environment. Locally I would not go near production at all: I uncomment `MARIADB_DATA_IMAGE` and run `ahoy refresh-db` to pull the nightly image, which is the sanitised path.",
    },
    {
      q: "A delivery lead wants production content copied into UAT every morning. What do you tell them?",
      a: "Technically it is not something I can schedule on SaaS: the sync is a deploy-time task, cron jobs and task definitions live in `.lagoon.yml`, and that file is locked, so a nightly refresh would mean a platform change request rather than a commit. Even the deploy-time sync is gated — once UAT bootstraps successfully it stops pulling unless the content workflow for that environment is set to `import`. Then I raise the part that usually ends the conversation: `govcms-db-sync` does no sanitisation, its last line is literally a `@todo`, so a daily refresh is a daily copy of real personal information into an environment with a wider access list. GovCMS is certified up to OFFICIAL: Sensitive and `/support/security` puts content and user account management on the agency, so I would want the privacy officer's position before I asked the platform for anything.",
    },
    {
      q: "What sanitisation does GovCMS actually give you, and where does the gap sit?",
      a: "Two pull-based paths are sanitised: a database downloaded from the GovCMS Dashboard, and the nightly `MARIADB_DATA_IMAGE` in the project registry. The wiki's claim is narrow — that they are \"automatically sanitized\" and that emails and passwords will have changed — and no field-level ruleset is published anywhere, so I treat phone numbers, addresses, webform submissions and revision bodies as untouched. The gap is the push path: `govcms-db-sync` loads production straight into the lower environment with no sanitiser, and on SaaS I cannot install a Drush sanitize plugin to close it because a custom module is not part of the build payload. In practice I standardise on the Dashboard or nightly-image route for anything a developer touches, and I run `drush sql:sanitize` plus explicit webform truncations after every import so the team never relies on the platform having done it.",
    },
  ],
  quiz: [
    {
      question: "What does the post-rollout task `govcms-backups-preserve` actually do?",
      options: [
        "Uploads `pre-deploy-dump.sql.gz` into the Lagoon backup bucket so Restic retains it for six weeks.",
        "Keeps the ten most recent pre-deploy dumps and prunes anything older.",
        "Renames `pre-deploy-dump.sql.gz` to `pre-deploy-dump-last-good.sql.gz`, so exactly one previous snapshot survives.",
        "Exports configuration into `pre-deploy-config.tar.gz` before the config import runs.",
      ],
      answerIndex: 2,
      explain:
        "It is a single `mv` inside the site's private backups directory, and it only runs if the seven tasks before it succeeded. Rotation depth is one: the next deploy's pre-rollout overwrites `pre-deploy-dump.sql.gz`. Lagoon's bucket and Restic are a separate system, and the config tarball is written by `govcms-config-backup` during pre-rollout.",
    },
    {
      question: "What is Lagoon's default automated backup retention, and who can change it?",
      options: [
        "Daily 7 and weekly 6, and only production environments can override it with `backup-retention` in `.lagoon.yml`.",
        "Daily 7, weekly 6 and monthly 12, overridable per environment type.",
        "Daily 30 on production and daily 7 on development, fixed by the platform.",
        "There is no default — the GovCMS scaffold sets `backup-retention` explicitly.",
      ],
      answerIndex: 0,
      explain:
        "Lagoon documents daily 7 and weekly 6 as the default, evaluated by Restic, and states that only production can set a different policy — other environment types cannot. The GovCMS scaffold ships no `backup-retention` key at all, so the defaults apply, and on SaaS `.lagoon.yml` is locked so you cannot add one.",
    },
    {
      question: "A dev environment redeploys. The site bootstraps fine, it is not a canary, the branch is `dev`, and `GOVCMS_DEPLOY_WORKFLOW_CONTENT` is unset. What does `govcms-db-sync` do?",
      options: [
        "Syncs production down and then runs `drush sql:sanitize` on the result.",
        "Syncs, because non-production environments always pull the latest production database.",
        "Fails the rollout, because a bootstrappable non-production site is an inconsistent state.",
        "Skips and leaves the existing database alone, because the site bootstraps and the content workflow is not set to import.",
      ],
      answerIndex: 3,
      explain:
        "The script's default content strategy is `retain`, not `import`. Having refused on production, it syncs only for a canary, an `internal-govcms-update*` branch, a site that cannot bootstrap, or an explicit `import` workflow; everything else takes the skip branch. That is why a branch environment gets production on its first deploy and then quietly drifts.",
    },
    {
      question: "Which statement about sanitisation on GovCMS is correct?",
      options: [
        "`govcms-db-sync` runs `drush sql:sanitize` after loading the dump into the lower environment.",
        "`govcms-db-sync` performs no sanitisation; the sanitised copies are the GovCMS Dashboard download and the nightly `MARIADB_DATA_IMAGE`.",
        "scaffold-tooling publishes the field-level sanitisation ruleset so agencies can audit exactly what is masked.",
        "Sanitisation is unnecessary because the whole platform is certified to OFFICIAL: Sensitive.",
      ],
      answerIndex: 1,
      explain:
        "The sync script ends with the comment `# @todo: Add sanitisation?` and does none. The only sanitised sources are pull-based — the Dashboard database and the nightly image — and the wiki describes them no further than \"automatically sanitized\" with emails and passwords changed. The platform's classification ceiling is about what may be hosted, not a licence to spread that data into lower environments.",
    },
  ],
};

export default lesson;
