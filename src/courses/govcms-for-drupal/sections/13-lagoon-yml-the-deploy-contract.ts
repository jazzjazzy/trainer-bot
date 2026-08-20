import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "lagoon-yml-the-deploy-contract",
  title: ".lagoon.yml: The File That Deploys Your Site",
  part: "Lagoon: Deploy & Run",
  estMinutes: 13,
  summary:
    "On GovCMS the deploy is not a script you wrote but a declaration Lagoon executes — an ordered pre-rollout and post-rollout task list, per-environment cron, and a set of GOVCMS_SKIP_* escape hatches that buy deploy time by spending your rollback point.",

  concept: `
## The deploy contract is a file, not a pipeline

On a Drupal site you control, "deploy" is a shell script somebody on the team wrote:
pull, \`composer install\`, \`drush updatedb\`, \`drush config:import\`, \`drush cache:rebuild\`,
plus whatever backup discipline survived the last incident. On GovCMS that script is
replaced by a **declaration**. \`.lagoon.yml\` sits at the repo root and tells Lagoon which
\`docker-compose.yml\` to read, what cron to schedule **per environment**, and two ordered
task lists: \`pre-rollout\` and \`post-rollout\`. Lagoon is the executor. You only describe.

### pre-rollout runs in the *old* pods

Three tasks, in order — \`Pre-rollout database updates\`, \`Snapshot the database and store\`,
\`Snapshot the config and store\` (\`govcms-pre-deploy-db-update\`, \`govcms-db-backup\`,
\`govcms-config-backup\`). They run after the images build but **before** any container is
swapped, which is exactly what makes them your rollback point — and exactly why the
scaffold wraps each command in a file-existence test:

\`\`\`yaml
- run:
    name: Snapshot the database and store
    command: "[ -f /app/vendor/bin/govcms-db-backup ] && /app/vendor/bin/govcms-db-backup || echo 'Database backup is not available.'"
    service: cli
    shell: bash
    when: withDefault("GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP", false) == false
\`\`\`

The binary that runs is the one in the **currently deployed** image, not the one you just
built. Lagoon also skips pre-rollout entirely on a first deploy, because there are no
existing pods to run it in.

### post-rollout runs against the new pods

Eight tasks: prepare the site, \`Perform GovCMS platform validations\` (Shipshape, wrapped in
\`## START SaaS-only\` / \`## END SaaS-only\` markers), synchronise the database, database
updates, config import, cache rebuild, ensure GovCMS/Lagoon modules are enabled, preserve
the last successful backup. Two orderings are worth memorising: \`updatedb\` precedes
\`config:import\`, and the platform re-enables **its own** modules *after* your config import
— so an export that uninstalls \`httpav\` does not stay uninstalled.

### cron is declared, not crontab

Cron lives in \`environments.<branch>.cronjobs\`, not in a container's crontab, and it is
**per environment** — a branch environment with no \`cronjobs\` stanza runs no Drupal cron at
all. \`schedule: "M * * * *"\` is Lagoon's extended syntax: \`M\` means a random minute, the
same one every hour, so sites don't all fire on minute zero. Lagoon keeps a job inside the
named service only when the gap between runs is strictly under 30 minutes, so \`M/15\` stays
in-pod while \`M/30\` and anything wider becomes a native Kubernetes CronJob (section 16).

### The escape hatches, and their price

Every task except \`Prepare the site for deployment\` carries
\`when: withDefault("GOVCMS_SKIP_...", false) == false\`. Set that variable on the environment
and the task vanishes from the rollout. Two things to know first. The comparison is against
the **boolean** \`false\` while a Lagoon variable is a **string**, so
\`GOVCMS_SKIP_DB_UPDATE=false\` does not mean "don't skip" — delete the variable instead.
And the scripts carry a *second* layer of switches (\`GOVCMS_DEPLOY_UPDB\`,
\`GOVCMS_SKIP_DATABASE_BACKUP\`, \`GOVCMS_DEPLOY_WORKFLOW_CONFIG\`), so a task can log
\`[skip]\` with no \`.lagoon.yml\` guard set at all.

Skipping the snapshots is the tempting one: on a large production database they are most of
the deploy window. What you spend is the restore point. \`govcms-backups-preserve\` only
promotes a dump that exists, so skip the snapshot and the newest restorable database is the
one taken before the *previous* deploy.

### Who may edit it

On PaaS the file is yours — its own comment names "PaaS users or the support team" as its
editors and asks that tasks stay one or two lines with no if/else. On SaaS \`.lagoon.yml\` is
a locked file: a push that changes it is declined and the git push fails. You get the
variables, not the file.
`,

  comparisons: [
    {
      label: "Scheduling Drupal cron",
      intro:
        "The site needs hourly cron and you want it running in the right place. On your own infrastructure that is a crontab entry; on GovCMS it is a stanza in the deploy contract.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# /etc/cron.d/drupal on a host you own. One file, all environments,
# whatever minute you typed.
*/15 * * * * www-data /var/www/app/vendor/bin/drush --root=/var/www/app/web cron >> /var/log/drupal-cron.log 2>&1
0 3 * * *    www-data /var/www/app/vendor/bin/drush --root=/var/www/app/web sql:dump --gzip --result-file=/backups/nightly.sql

# Verify it landed:
sudo crontab -u www-data -l
sudo systemctl status cron`,
      ts: `# .lagoon.yml at the repo root. Cron is declared per environment.
environments:
  master:
    cronjobs:
      - name: Drupal cron with notifications
        schedule: "M * * * *"
        command: '/app/vendor/bin/govcms-drush cron --root=/app'
        service: cli

# "M" = a random minute, the same one every hour, so every GovCMS site
# does not fire at :00. Nothing declared under a branch environment
# means that environment gets no Drupal cron.`,
      note:
        "Cron becomes a deploy-time declaration scoped to one branch environment — there is no crontab to log into and no minute for you to choose.",
    },
    {
      label: "Taking the rollback snapshot",
      intro:
        "You want a database and configuration snapshot taken immediately before the new code goes live, so a bad release can be reversed.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `#!/usr/bin/env bash
# scripts/deploy.sh - your script, your ordering, your responsibility.
set -euo pipefail

drush sql:dump --gzip --result-file=/backups/pre-deploy.sql
drush config:export sync -y --destination /backups/config

git pull --ff-only
composer install --no-dev --optimize-autoloader

drush updatedb -y
drush config:import -y
drush cache:rebuild`,
      ts: `# .lagoon.yml - pre-rollout runs in the STILL-RUNNING old pods,
# after the new images build and before anything is swapped.
tasks:
  pre-rollout:
    - run:
        name: Pre-rollout database updates
        command: "[ -f /app/vendor/bin/govcms-pre-deploy-db-update ] && /app/vendor/bin/govcms-pre-deploy-db-update || echo 'Pre Update databse is not available.'"
        service: cli
        shell: bash
        when: withDefault("GOVCMS_SKIP_PRE_DEPLOY_UPDATE", false) == false
    - run:
        name: Snapshot the database and store
        command: "[ -f /app/vendor/bin/govcms-db-backup ] && /app/vendor/bin/govcms-db-backup || echo 'Database backup is not available.'"
        service: cli
        shell: bash
        when: withDefault("GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP", false) == false
    - run:
        name: Snapshot the config and store
        command: "[ -f /app/vendor/bin/govcms-config-backup ] && /app/vendor/bin/govcms-config-backup || echo 'Config backup is not available.'"
        service: cli
        shell: bash
        when: withDefault("GOVCMS_SKIP_PRE_DEPLOY_CONFIG_BACKUP", false) == false`,
      note:
        "Each command tests for its own binary because the old image may predate it, and Lagoon skips pre-rollout completely on a first deploy — so a brand-new environment has no snapshot by design.",
    },
    {
      label: "Shortening a deploy for one release",
      intro:
        "A migration release is running long and you want to drop the pre-deploy dump just this once. On your own site you edit the script; on GovCMS you drive the guard the platform already wrote.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Your script, so you add your own flag and read it yourself.
SKIP_DUMP=1 ./scripts/deploy.sh production

# inside scripts/deploy.sh
if [ "$SKIP_DUMP" = "1" ]; then
  echo "skipping pre-deploy dump for this release"
else
  drush sql:dump --gzip --result-file=/backups/pre-deploy.sql
fi
drush updatedb -y
drush config:import -y`,
      ts: `# You cannot edit the task, so you set the variable it is guarded on.
# Dashboard, API or CLI - it must exist at build time.
lagoon add variable --project agency-site --environment master \\
  --scope build --name GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP --value true

lagoon deploy latest --project agency-site --environment master

# Afterwards, DELETE it. The guard compares against the boolean false
# and a Lagoon variable is a string, so setting the value to "false"
# leaves the task skipped.
lagoon delete variable --project agency-site --environment master \\
  --name GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP`,
      note:
        "The skip is an environment variable with a lifetime, not a code change — which means nothing in your git history records that a deploy ran without a snapshot.",
    },
    {
      label: "Changing the deploy contract itself",
      intro:
        "You want a Search API reindex to run after every deploy. On infrastructure you own that is one more line in the deploy script you wrote; on GovCMS it is one more entry in the post-rollout list — if you are allowed to add it.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal on infrastructure you control: the post-deploy step
# list IS your own script, so the change is a line in it.
git checkout -b feature/reindex-after-deploy
vim scripts/deploy.sh

# ...the tail of scripts/deploy.sh after the edit:
#   drush updatedb -y
#   drush config:import -y
#   drush cache:rebuild
#   drush search-api:index      <- the line you just added

git commit -am "Reindex Search API after every deploy"
git push origin feature/reindex-after-deploy

# Merge it, run the script, and the reindex is part of every deploy.
# Nobody has to approve the step list: you own the script.`,
      ts: `# GovCMS SaaS: .lagoon.yml is on the locked-file list, alongside
# .docker/* .ahoy.yml .env.default .gitlab-ci.yml .version.yml
# README.md and docker-compose.yml.
git commit -am "Reindex Search API after every deploy"
git push origin master
# The push is declined and the git push fails - the change never
# reaches a build.

# Supported instead:
#   PaaS  - the same edit is yours to make and merge
#   SaaS  - raise it with the service desk, or use the GOVCMS_SKIP_*
#           variables to steer the tasks that already exist`,
      note:
        "On SaaS the deploy contract is platform-managed: your extension points are the theme, exported config and environment variables — not the rollout task list.",
    },
  ],

  playground: {
    intro:
      "A miniature of the rollout: the same ordered task list run twice, once clean and once with the skip variables set. Watch what happens to the RISK line at the bottom.",
    lang: "php",
    code: `<?php

// Each task: [phase, name, guard variable (null = no guard), saas-only].
$tasks = [
  ['pre',  'Pre-rollout database updates',            'GOVCMS_SKIP_PRE_DEPLOY_UPDATE',        false],
  ['pre',  'Snapshot the database and store',         'GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP',     false],
  ['pre',  'Snapshot the config and store',           'GOVCMS_SKIP_PRE_DEPLOY_CONFIG_BACKUP', false],
  ['post', 'Prepare the site for deployment',         null,                                   false],
  ['post', 'Perform GovCMS platform validations',     'GOVCMS_SKIP_AUDIT',                    true],
  ['post', 'Synchronise the database',                'GOVCMS_SKIP_DB_SYNC',                  false],
  ['post', 'Perform database updates',                'GOVCMS_SKIP_DB_UPDATE',                false],
  ['post', 'Perform config import',                   'GOVCMS_SKIP_CONFIG_IMPORT',            false],
  ['post', 'Perform cache rebuild',                   'GOVCMS_SKIP_CACHE_REBUILD',            false],
  ['post', 'Ensure GovCMS/Lagoon modules are enabled','GOVCMS_SKIP_ENABLE_MODULES',           false],
  ['post', 'Preserve the last successful backup',     'GOVCMS_SKIP_PRESERVE_BACKUP',          false],
];

// withDefault(NAME, false): the variable's value if set, else the default.
// Lagoon variables are strings; the default here is a real boolean.
function with_default(array $env, $name, $default) {
  return array_key_exists($name, $env) ? $env[$name] : $default;
}

// The whole rule: run when there is no guard, or when the guard
// expression evaluates to exactly the boolean false.
function evaluate($env, $guard) {
  if ($guard === null) {
    return [true, 'no when: clause'];
  }
  $value = with_default($env, $guard, false);
  if ($value === false) {
    return [true, 'guard unset'];
  }
  return [false, $guard . '="' . $value . '"'];
}

function rollout($label, $tasks, $env, $type) {
  printf("%s\\n", $label);
  printf("  %-5s %-42s %-8s %s\\n", 'PHASE', 'TASK', 'STATE', 'REASON');
  $skipped = [];
  foreach ($tasks as $task) {
    list($phase, $name, $guard, $saas_only) = $task;
    if ($saas_only && $type !== 'saas') {
      continue;
    }
    list($run, $reason) = evaluate($env, $guard);
    printf("  %-5s %-42s %-8s %s\\n", $phase, $name, $run ? 'RUN' : 'SKIPPED', $reason);
    if (!$run) {
      $skipped[] = $name;
    }
  }
  return $skipped;
}

function risk($skipped) {
  $db = in_array('Snapshot the database and store', $skipped, true);
  $cfg = in_array('Snapshot the config and store', $skipped, true);
  if (!$db && !$cfg) {
    printf("  RISK: rollback target is this deploy's own snapshot.\\n");
    return;
  }
  if ($db) {
    printf("  RISK: no dump taken, so nothing is promoted to last-good;\\n");
    printf("        the newest restorable database predates this deploy.\\n");
  }
  if ($cfg) {
    printf("  RISK: no config archive, so the only config restore point is git.\\n");
  }
}

$clean = [];
$fast = [
  'GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP'     => 'true',
  'GOVCMS_SKIP_PRE_DEPLOY_CONFIG_BACKUP' => 'true',
  'GOVCMS_SKIP_CACHE_REBUILD'            => 'false',
];

risk(rollout('RUN 1 - saas, no variables set', $tasks, $clean, 'saas'));
printf("\\n");
risk(rollout('RUN 2 - saas, skip variables set', $tasks, $fast, 'saas'));`,
    output: `RUN 1 - saas, no variables set
  PHASE TASK                                       STATE    REASON
  pre   Pre-rollout database updates               RUN      guard unset
  pre   Snapshot the database and store            RUN      guard unset
  pre   Snapshot the config and store              RUN      guard unset
  post  Prepare the site for deployment            RUN      no when: clause
  post  Perform GovCMS platform validations        RUN      guard unset
  post  Synchronise the database                   RUN      guard unset
  post  Perform database updates                   RUN      guard unset
  post  Perform config import                      RUN      guard unset
  post  Perform cache rebuild                      RUN      guard unset
  post  Ensure GovCMS/Lagoon modules are enabled   RUN      guard unset
  post  Preserve the last successful backup        RUN      guard unset
  RISK: rollback target is this deploy's own snapshot.

RUN 2 - saas, skip variables set
  PHASE TASK                                       STATE    REASON
  pre   Pre-rollout database updates               RUN      guard unset
  pre   Snapshot the database and store            SKIPPED  GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP="true"
  pre   Snapshot the config and store              SKIPPED  GOVCMS_SKIP_PRE_DEPLOY_CONFIG_BACKUP="true"
  post  Prepare the site for deployment            RUN      no when: clause
  post  Perform GovCMS platform validations        RUN      guard unset
  post  Synchronise the database                   RUN      guard unset
  post  Perform database updates                   RUN      guard unset
  post  Perform config import                      RUN      guard unset
  post  Perform cache rebuild                      SKIPPED  GOVCMS_SKIP_CACHE_REBUILD="false"
  post  Ensure GovCMS/Lagoon modules are enabled   RUN      guard unset
  post  Preserve the last successful backup        RUN      guard unset
  RISK: no dump taken, so nothing is promoted to last-good;
        the newest restorable database predates this deploy.
  RISK: no config archive, so the only config restore point is git.
`,
  },

  keyPoints: [
    "`.lagoon.yml` is a declaration, not a script: it names the compose file, declares cron per environment, and lists `pre-rollout` and `post-rollout` tasks that Lagoon executes in order.",
    "Pre-rollout runs in the still-live old pods before any container is swapped — that is why it is the rollback point, why every command tests for its own binary, and why Lagoon skips it entirely on a first deploy.",
    "Post-rollout order matters: database updates precede config import, and the platform re-enables its own modules after your import, so a config export that uninstalls a platform module does not stay uninstalled.",
    "Cron is declared under `environments.<branch>.cronjobs`, so an environment with no stanza runs no Drupal cron; `M` in the schedule is Lagoon's random-but-stable minute.",
    "Every task except `Prepare the site for deployment` is guarded by `when: withDefault(\"GOVCMS_SKIP_...\", false) == false`; because the comparison is against a boolean and Lagoon variables are strings, you turn a skip off by deleting the variable, not by setting it to \"false\".",
    "Skipping the snapshots is the fastest way to shorten a deploy and the fastest way to lose your restore point: `govcms-backups-preserve` only promotes a dump that exists, so the newest restorable database ends up being the one from the previous deploy.",
  ],

  interview: [
    {
      q: "Walk me through what actually happens when a GovCMS deploy runs.",
      a: "Lagoon reads `.lagoon.yml` at the repo root, builds the images, then runs the `pre-rollout` list **in the existing pods**: pre-rollout database updates, a database snapshot, a config snapshot. Only then are containers replaced, and once the new pods pass readiness the `post-rollout` list runs — prepare the site, the SaaS-only Shipshape validation run, database sync, database updates, config import, cache rebuild, re-enable the GovCMS and Lagoon modules, preserve the last successful backup. The thing I'd flag from operating it is that pre-rollout is skipped on a first deploy, so a newly created branch environment genuinely has no pre-deploy snapshot — and that the tasks defensively test for their own binary, because the *old* image is what executes them. I'd also point out that this is not the same sequence as `ahoy govcms-deploy` or the `scripts/govcms-deploy` script; Lagoon never calls those.",
    },
    {
      q: "A release is timing out because the pre-deploy database dump takes too long. What do you do?",
      a: "Short term, set `GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP` on that environment so the `when` guard drops the task, run the deploy, then **delete the variable** — I'd be explicit about deleting rather than setting it back to `false`, because the guard compares against a boolean and a Lagoon variable is a string, so `false` leaves it skipped. Before doing it I'd say out loud what the rollback target becomes: `govcms-backups-preserve` only promotes a dump that exists, so with no dump this deploy the newest restorable database is the one taken before the previous deploy. That's usually only acceptable if I have an independent recent backup or the release is config-only. The durable fix is to shrink what's being dumped and to schedule the risky release in a window where a longer deploy is tolerable, not to leave the skip variable in place.",
    },
    {
      q: "Can you add a post-rollout task to a GovCMS site — say, a Search API reindex after every deploy?",
      a: "On PaaS, yes. `.lagoon.yml` is agency-editable there; the file's own comment names PaaS users and the support team as its editors and asks that tasks stay to one or two lines with no if/else logic, so it remains easy to toggle. On SaaS, no — `.lagoon.yml` is on the locked-file list with `.docker/*`, `.ahoy.yml`, `.env.default`, `.gitlab-ci.yml`, `.version.yml`, `README.md` and `docker-compose.yml`; a push that changes it is declined and the git push fails. So on SaaS my options are the service desk, or driving the tasks that already exist through the `GOVCMS_SKIP_*` variables. Worth noting for a search question specifically: no deploy task reindexes, and Solr is opt-in rather than provisioned by default, so I'd confirm the service is even enabled before designing around it.",
    },
    {
      q: "How is scheduled work handled on GovCMS, and what do people get wrong about it?",
      a: "Cron is declared in `.lagoon.yml` under `environments.<branch>.cronjobs` — a name, a schedule, a command and the service to run it in — not in a container crontab, because containers are replaced on every deploy. The scaffold ships one entry on the production branch running `govcms-drush cron`. The mistake I see is assuming cron is global: it is declared **per environment**, so a branch or staging environment with no `cronjobs` stanza runs no Drupal cron at all, and people then debug queue workers or scheduled publishing that were never going to fire. The other detail worth knowing is Lagoon's extended schedule syntax — `M` means a random but stable minute each hour — and that Lagoon keeps a job inside the named service only when the gap between runs is strictly under 30 minutes — `M/15` in-pod, `M/30` and anything wider as a native Kubernetes CronJob.",
    },
  ],

  quiz: [
    {
      question:
        "Why does every pre-rollout command in the GovCMS scaffold begin with a `[ -f /app/vendor/bin/... ]` test?",
      options: [
        "Pre-rollout tasks execute in the currently deployed containers, so the binary from the new build may not exist yet",
        "Lagoon runs pre-rollout tasks before `composer install`, so `vendor/` is empty",
        "The test is what makes the task's `when:` guard evaluate correctly",
        "SaaS sites mount a read-only `vendor/` directory that may be absent",
      ],
      answerIndex: 0,
      explain:
        "Pre-rollout runs after the images build but before containers are swapped, inside the still-running old pods. Whatever binary the previous image shipped is what executes, so a newly added script would not be there — hence the existence test and the `|| echo` fallback.",
    },
    {
      question:
        "You set `GOVCMS_SKIP_DB_UPDATE=false` on a GovCMS environment expecting database updates to run. What happens?",
      options: [
        "The task runs — `false` matches the default in `withDefault(\"GOVCMS_SKIP_DB_UPDATE\", false)`",
        "The build fails, because `when:` only accepts `true`",
        "The task is skipped — the guard compares against the boolean `false` and the variable is the string \"false\"",
        "Nothing changes until the variable is also added to `docker-compose.yml`",
      ],
      answerIndex: 2,
      explain:
        "`withDefault` returns the variable's raw value once it exists, and Lagoon environment variables are strings. The string \"false\" is not the boolean `false` the guard compares against, so the expression is false and the task is dropped. Delete the variable to restore the task.",
    },
    {
      question:
        "Which statement about cron on GovCMS is correct?",
      options: [
        "Cron entries are written to the cli container's crontab by a post-rollout task",
        "The `cronjobs` block is global and applies to every environment in the project",
        "GovCMS disables Drupal cron and runs it from an external scheduler only",
        "Cron is declared per environment in `.lagoon.yml`, so an environment with no `cronjobs` stanza runs none",
      ],
      answerIndex: 3,
      explain:
        "`cronjobs` sits inside an environment stanza — the scaffold declares one under the production branch. Nothing is inherited by other environments, so branch and staging environments run no Drupal cron unless their own stanza declares it.",
    },
    {
      question:
        "A deploy runs with `GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP` set. What is the newest restorable database afterwards?",
      options: [
        "The snapshot taken before the previous deploy, because nothing new was promoted to last-good",
        "The snapshot taken during post-rollout, which is unaffected by that variable",
        "There is none — skipping the backup deletes the preserved copy",
        "The nightly platform backup, which the skip variable forces to run early",
      ],
      answerIndex: 0,
      explain:
        "`govcms-backups-preserve` runs last in post-rollout and only promotes a pre-deploy dump that actually exists. With no dump taken this deploy it finds nothing to move, so the preserved last-good copy is still the one from the previous deploy — the rollback target silently ages by one release.",
    },
  ],
};

export default lesson;
