import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "forklifting-a-site-onto-govcms",
  title: "The Onboarding Gate: Auditing a Site Before It Moves",
  part: "The Compliance Gates",
  estMinutes: 13,
  summary:
    "Onboarding a site to GovCMS SaaS is a pass/fail assessment before it is a migration, and the audit output — not the budget — is what decides whether the site goes to SaaS, to PaaS, or nowhere.",
  concept: `## Onboarding is an assessment, not a deployment

The GovCMS wiki's own definition of forklifting: it "involves putting a copy of your database and \`sites/default/files\` up into the production environment." One sentence, and it is the *last* step. Everything that matters happens before it, when someone decides whether the site is allowed onto SaaS at all.

You already know how to move a Drupal site between environments. What changes here is that the destination has a veto, and the veto arrives as a machine-readable report rather than an opinion you can argue with.

### The two artefacts

Both live in \`govcms/scaffold-tooling\`. Neither is \`govCMS/audit-site\` — that repo is \`archived: true\` and its preflight profile encodes Drupal 7 policy. Do not quote it in an interview.

- **\`govcms-vet\`** clones a fresh \`govCMS/scaffold\` at the pins in your \`.version.yml\`, runs \`ahoy init\` on it, and diffs your repo against that ideal. Seven numbered findings, \`vet-001\` through \`vet-007\`. The last is the conversation-ender: *"There are custom Drupal modules in the repository."* It is detected with \`find $CLIENTCODE/web -type f -name "*.info.yml" | grep modules\`.
- **Shipshape**, run as \`shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml --exclude-db --error-code .\`, checks the codebase and the exported config in \`config/default\`.

The older shell validators still ship. \`govcms-ship-shape -a\` runs every \`govcms-validate-*\` in \`vendor/bin\` with the *active* (database-reading) ones excluded — exactly the mode a candidate repo needs, because there is no platform database yet.

### Reading severity

Shipshape does not stop at the first failure. Every check runs, and the process exits \`2\` only if the result list is \`Fail\` **and** at least one breach sits at or above \`--fail-severity\`, default \`high\`. Severity, not failure, is what decides:

\`\`\`text
high    blocks        13 checks, e.g. [FILE] Disallowed permissions,
                      [FILE] Validate TFA config, [FILE] Verify enabled modules
normal  reports only  [FILE] Executable files, plus every check omitting severity
low     reports only  [FILE] Banned PHP methods and classes
\`\`\`

\`[FILE] Banned PHP function list\` declares no severity at all, so under Shipshape it stains the report without failing the run; the standalone \`govcms-validate-php-functions\` script is what exits non-zero on it.

\`govcms-vet\` has no severity axis. It has an *offering* axis: \`ON_ERROR=0\` for \`paas\`, \`ON_ERROR=1\` for \`saas\` and \`saasplus\`. The same finding is a warning or a wall depending on which product the agency bought. Those three lines of bash are the SaaS/PaaS decision, written down.

### Turning findings into a plan

Sort every finding into one of three actions. Config, permission, TFA and enabled-module findings are **remediation** — they live in \`config/default\` and you fix them in a branch. Custom modules (\`vet-007\`) and custom Composer patches (\`vet-005\`) are **not remediable at SaaS at any budget**; the answer is rewrite into the theme, swap for something already in the distribution, or move the site to PaaS. Anything left is **accepted risk**, logged and moved on from.

### Then the move itself

The distribution pins \`migrate_plus\`, \`migrate_tools\`, \`migrate_source_csv\` and \`migrate_file\` in \`require\` — on \`4.x-develop\` and on \`3.x-develop\` alike, so the code is in every image. What it does not give you is a module to put plugins in. On SaaS your migrations are \`migrate_plus.migration.*\` config entities in \`config/default\`, assembled from stock source and process plugins, with anything exotic done to the source data before it arrives. Two operational notes from the wiki: re-imported migration config always shows a diff because Drupal runs none for those entities, and "it's better to ensure there is a power user available prior to forklifting".`,
  comparisons: [
    {
      label: "Deciding whether the site can move",
      intro:
        "Same question — is this site ready? On a site you control you invent the readiness criteria and grade your own homework. On GovCMS the criteria are two vendored binaries and their exit codes.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal: you define "ready", you choose the checks, you make the call.
drush status --field=drupal-version
drush pm:list --status=enabled --type=module --no-core --format=json > enabled.json
composer show 'drupal/*' --outdated --direct
drush php:eval 'print count(\\Drupal::entityTypeManager()->getStorage("node")->getQuery()->accessCheck(FALSE)->execute());'

# Custom code and patches: inventory, not verdict.
find web/modules/custom -maxdepth 2 -name '*.info.yml' | wc -l
jq -r '.patches | keys[]' composer.patches.json
vendor/bin/drupal-check web/modules/custom web/themes/custom

# Verdict: a judgement call, written into a spreadsheet by a human.`,
      ts: `# GovCMS: the verdict is two exit codes, and you do not own either of them.
ahoy up

# 1. Codebase conformance. No args -> reads type/scaffold/version from .version.yml.
#    Overrideable as: govcms-vet <flavour> <scaffold-branch> <drupal-version>
docker compose exec -T cli govcms-vet ; echo "vet exit=$?"

# 2. Platform validations over the codebase and config/default only.
docker compose exec -T cli shipshape run \\
  -f /app/vendor/govcms/scaffold-tooling/shipshape.yml \\
  --exclude-db --error-code . ; echo "shipshape exit=$?"

# 3. Legacy validators, file-only (-a drops the *active* database checks),
#    -n makes it fail on error instead of writing .ship-shape/*.xml reports.
docker compose exec -T cli govcms-ship-shape -a -n ; echo "validators failed=$?"`,
      note:
        "govcms-vet is a diff, not a rule engine: it clones govCMS/scaffold, runs ahoy init against your .version.yml pins, and compares composer.json's repositories, extra.enable-patching, scripts and patches-file, plus custom/composer/*, against that freshly generated ideal. That is why an innocuous-looking composer.json edit surfaces as vet-001 through vet-006 — you drifted from the scaffold, and the scaffold is the contract.",
    },
    {
      label: "A migration that needs a custom source",
      intro:
        "The bundled migrate modules are the same ones you already use. The place you normally put the interesting code is the thing GovCMS SaaS removes, so the transformation has to move somewhere else.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// web/modules/custom/acme_migrate/src/Plugin/migrate/source/LegacyStaff.php
namespace Drupal\\acme_migrate\\Plugin\\migrate\\source;

use Drupal\\migrate\\Plugin\\migrate\\source\\SqlBase;
use Drupal\\migrate\\Row;

/**
 * @MigrateSource(
 *   id = "legacy_staff",
 *   source_module = "acme_migrate"
 * )
 */
class LegacyStaff extends SqlBase {

  public function query() {
    return $this->select('staff', 's')
      ->fields('s', ['id', 'given', 'family', 'unit_code'])
      ->condition('s.active', 1);
  }

  public function fields() {
    return [
      'id' => 'Staff ID',
      'given' => 'Given name',
      'family' => 'Family name',
      'unit_code' => 'Business unit code',
    ];
  }

  public function getIds() {
    return ['id' => ['type' => 'integer', 'alias' => 's']];
  }

  public function prepareRow(Row $row) {
    $name = $row->getSourceProperty('given') . ' ' . $row->getSourceProperty('family');
    $row->setSourceProperty('full_name', trim($name));
    return parent::prepareRow($row);
  }

}`,
      ts: `# config/default/migrate_plus.migration.acme_staff.yml
# Deployed by drush config:import like any other config entity.
langcode: en
status: true
dependencies: {  }
id: acme_staff
label: 'Staff profiles from the legacy export'
migration_group: acme
migration_tags:
  - acme
source:
  # 'csv' comes from migrate_source_csv, pinned in the distribution's require.
  plugin: csv
  path: 'private://migrate/staff.csv'
  header_offset: 0
  ids:
    - id
  # full_name is produced by the export script, because there is no
  # prepareRow() you are allowed to ship on SaaS.
  fields:
    - name: id
    - name: full_name
    - name: unit_code
process:
  title: full_name
  uid:
    plugin: default_value
    default_value: 1
  field_unit:
    - plugin: skip_on_empty
      method: process
      source: unit_code
    # entity_lookup is a migrate_plus process plugin, also pinned.
    - plugin: entity_lookup
      entity_type: taxonomy_term
      bundle: unit
      value_key: name
destination:
  plugin: 'entity:node'
  default_bundle: staff`,
      note:
        "migrate_plus, migrate_tools, migrate_source_csv and migrate_file are all in the distribution's require on both 4.x-develop and 3.x-develop, so the code ships in every image. The pins differ by branch: 4.x-develop takes 6.0.10, 6.1.4, 3.8.0 and 3.0.0-alpha1, while 3.x-develop is a step back on each and a whole major line back on migrate_file, at 2.1.3. None of them appears in the profile's install list or on the 73-name managed_modules allowlist, so treat 'who turns them on, and where' as a question for GovCMS rather than something you assume. Wiki gotcha to expect during a migration: re-importing migration config always reports changes, because Drupal runs no diff for those entities.",
    },
    {
      label: "Who decides that a failing check blocks the build",
      intro:
        "Both sides are a YAML file that grades a codebase. The difference is authorship: on your own project you set the severity policy, and on GovCMS the policy arrives vendored and you read it to predict your own result.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .gitlab-ci.yml on a site you control -- you choose what is fatal.
stages:
  - lint
  - test

phpstan:
  stage: lint
  script:
    - vendor/bin/phpstan analyse web/modules/custom web/themes/custom
  allow_failure: false

phpcs:
  stage: lint
  script:
    - vendor/bin/phpcs --standard=Drupal,DrupalPractice web/modules/custom
  allow_failure: true

behat:
  stage: test
  script:
    - vendor/bin/behat --tags '~@wip'
  allow_failure: false`,
      ts: `# vendor/govcms/scaffold-tooling/shipshape.yml -- severity is declared, not negotiated.
checks:
  file:
    - name: '[FILE] Illegal files'
      severity: high
      path: web
      disallowed-pattern: '^(adminer|phpmyadmin|bigdump)?\\.php$'
    - name: '[FILE] Executable files'
      severity: normal
      path: ./
      disallowed-pattern: '.*\\.(bin|deb|dmg|elf|exe|msi|sh)+$'
      exclude-pattern: '^(vendor|web/core|web/modules/contrib)+.*'
  drupal-file-module:
    - name: '[FILE] Verify enabled modules'
      severity: high
      path: config/default
      required:
        - govcms_akamai_purge
        - govcms_security
        - httpav
        - lagoon_logs
        - tfa
      disallowed:
        - dblog
        - devel
        - module_permissions_ui
        - statistics
        - update
        - redirect_404
  phpstan:
    - name: '[FILE] Banned PHP function list'
      configuration: vendor/govcms/scaffold-tooling/phpstan.neon
      paths:
        - web/themes/custom
        - themes
# No 'allow_failure' anywhere. Every check runs; the run exits 2 only when a
# breach lands at or above --fail-severity, which defaults to high.`,
      note:
        "Two traps in that file. Checks that omit severity default to normal, so '[FILE] Validate install profile' and '[FILE] Detect module files in theme folder' report but do not block. And '[FILE] Banned PHP function list' has no severity either — a themer calling exec() shows up in the report and the deploy still succeeds. The one that does exit non-zero on banned functions is the standalone govcms-validate-php-functions script.",
    },
    {
      label: "Moving the database and the files",
      intro:
        "The forklift itself. On a site you control it is a sync between two endpoints you hold credentials for; on GovCMS you rehearse it locally against the platform image and hand over an artefact.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal: you own both ends, so you push straight across.
drush @acme.prod sql:dump --gzip --result-file=/var/backups/acme-prod.sql.gz
rsync -az --delete \\
  acme.prod:/var/www/web/sites/default/files/ \\
  acme.new:/var/www/web/sites/default/files/

drush @acme.new sql:drop -y
gunzip -c /var/backups/acme-prod.sql.gz | drush @acme.new sql:cli
drush @acme.new updatedb -y
drush @acme.new config:import -y
drush @acme.new cache:rebuild

# Or, on a good day, one command:
drush sql:sync @acme.prod @acme.new -y`,
      ts: `# GovCMS: no drush alias reaches SaaS production. You prove the dump locally
# against the platform image first, then the copy goes up.
ahoy up
ahoy drush sql:drop -y
docker compose exec -T cli bash -c \\
  'gunzip -c /app/legacy/acme-prod.sql.gz | drush sql:cli'

# "Ensure that your database works with your codebase, to avoid delays."
ahoy drush updatedb -y
ahoy drush config:import -y
ahoy drush cache:rebuild

# A power user that exists BEFORE the forklift, per the wiki FAQ.
ahoy drush user:create forklift_admin --mail="webops@agency.gov.au"
ahoy drush user:role:add govcms_site_administrator forklift_admin

# Now the *active* validators finally have a database to read.
docker compose exec -T cli govcms-ship-shape -n
docker compose exec -T cli shipshape run \\
  -f /app/vendor/govcms/scaffold-tooling/shipshape.yml --error-code .`,
      note:
        "Sequencing detail people get wrong: the file-only audit (--exclude-db, or govcms-ship-shape -a) is what you run on the candidate repo, and the database checks — '[DATABASE] Active modules audit', '[DATABASE] Disallowed permissions on active site', '[DATABASE] Active user roles admin check' — only become runnable once the forklifted database is loaded. A site can pass the codebase gate and still fail on a role carrying is_admin, so rehearse both locally before the handover.",
    },
  ],
  playground: {
    intro:
      "A pure-PHP model of the onboarding gate: twelve check records from one candidate repo, the classification rule that turns a severity into a BLOCKER, WARNING or INFO, the SaaS verdict, and the remediation plan. Then the same twelve records re-scored as PaaS — note which findings move and which do not.",
    lang: "php",
    code: `<?php

// One candidate repo, twelve audit records.
// [source, name, severity, status, remedy]
$checks = [
  ['SHIPSHAPE', '[FILE] Illegal files', 'high', 'pass', ''],
  ['SHIPSHAPE', '[FILE] Yaml lint platform files', 'high', 'pass', ''],
  ['SHIPSHAPE', '[FILE] Disallowed permissions', 'high', 'fail', 'Strip denied perms from config/default/user.role.*.yml'],
  ['SHIPSHAPE', '[FILE] Validate TFA config', 'high', 'fail', 'tfa.settings: enabled + required_roles.authenticated'],
  ['SHIPSHAPE', '[FILE] Verify enabled modules', 'high', 'fail', 'Add httpav, tfa, lagoon_logs; remove dblog'],
  ['SHIPSHAPE', '[FILE] Executable files', 'normal', 'fail', 'Delete the committed deploy.sh'],
  ['SHIPSHAPE', '[FILE] Validate install profile', '', 'fail', 'Rebuild the site on the govcms profile'],
  ['SHIPSHAPE', '[FILE] Detect module files in theme folder', '', 'fail', 'Move the type: module info.yml out of themes/'],
  ['SHIPSHAPE', '[FILE] Banned PHP function list', '', 'fail', 'Remove exec() from the theme'],
  ['SHIPSHAPE', '[FILE] Banned PHP methods and classes', 'low', 'fail', 'Replace the flagged class call'],
  ['VET', 'vet-005 custom composer patches', 'offering', 'fail', 'Drop the core patch, or move to PaaS'],
  ['VET', 'vet-007 custom Drupal modules', 'offering', 'fail', 'Rewrite in the theme, swap for contrib, or PaaS'],
];

$rank = ['low' => 1, 'normal' => 2, 'high' => 3];
$failSeverity = 'high';

function shown_severity($severity) {
  return $severity === '' ? 'normal*' : $severity;
}

function classify($source, $severity, $status, $offering, $failSeverity, $rank) {
  if ($status === 'pass') {
    return 'PASS';
  }
  if ($source === 'VET') {
    return $offering === 'paas' ? 'INFO' : 'BLOCKER';
  }
  $sev = $severity === '' ? 'normal' : $severity;
  if ($rank[$sev] >= $rank[$failSeverity]) {
    return 'BLOCKER';
  }
  return $sev === 'normal' ? 'WARNING' : 'INFO';
}

function assess($offering, $checks, $failSeverity, $rank) {
  $buckets = ['BLOCKER' => [], 'WARNING' => [], 'INFO' => [], 'PASS' => []];
  foreach ($checks as $c) {
    $buckets[classify($c[0], $c[2], $c[3], $offering, $failSeverity, $rank)][] = $c;
  }
  return $buckets;
}

printf("GovCMS onboarding audit -- candidate repo, offering=saas, fail-severity=%s\\n", $failSeverity);
printf("Rule: fail AND severity >= fail-severity -> BLOCKER | normal -> WARNING | low -> INFO\\n");
printf("      * severity omitted in shipshape.yml defaults to normal\\n");
printf("      vet findings carry no severity: fatal on saas/saasplus, INFO on paas\\n\\n");

$saas = assess('saas', $checks, $failSeverity, $rank);
foreach (['BLOCKER', 'WARNING', 'INFO'] as $bucket) {
  foreach ($saas[$bucket] as $c) {
    printf("%-8s %-43s %-10s %s\\n", $bucket, $c[1], strtolower($c[0]), shown_severity($c[2]));
  }
}

printf("\\n%d checks: %d pass, %d blocker, %d warning, %d info\\n", count($checks),
  count($saas['PASS']), count($saas['BLOCKER']), count($saas['WARNING']), count($saas['INFO']));
printf("Verdict: SaaS-ready = %s (%d blockers)\\n",
  count($saas['BLOCKER']) === 0 ? 'YES' : 'NO', count($saas['BLOCKER']));

printf("\\nRemediation plan\\n");
foreach ($saas['BLOCKER'] as $c) {
  printf("  %-12s %-43s %s\\n", $c[0] === 'VET' ? 'RE-PLATFORM' : 'REMEDIATE', $c[1], $c[4]);
}

$paas = assess('paas', $checks, $failSeverity, $rank);
printf("\\nSame twelve records scored as offering=paas: %d blockers (saas: %d).\\n",
  count($paas['BLOCKER']), count($saas['BLOCKER']));
printf("Nothing was fixed. govcms-vet sets ON_ERROR=0 for paas, so vet-005 and vet-007\\n");
printf("stop being fatal -- which is the whole SaaS-or-PaaS conversation in two lines of bash.\\n");`,
    output: `GovCMS onboarding audit -- candidate repo, offering=saas, fail-severity=high
Rule: fail AND severity >= fail-severity -> BLOCKER | normal -> WARNING | low -> INFO
      * severity omitted in shipshape.yml defaults to normal
      vet findings carry no severity: fatal on saas/saasplus, INFO on paas

BLOCKER  [FILE] Disallowed permissions               shipshape  high
BLOCKER  [FILE] Validate TFA config                  shipshape  high
BLOCKER  [FILE] Verify enabled modules               shipshape  high
BLOCKER  vet-005 custom composer patches             vet        offering
BLOCKER  vet-007 custom Drupal modules               vet        offering
WARNING  [FILE] Executable files                     shipshape  normal
WARNING  [FILE] Validate install profile             shipshape  normal*
WARNING  [FILE] Detect module files in theme folder  shipshape  normal*
WARNING  [FILE] Banned PHP function list             shipshape  normal*
INFO     [FILE] Banned PHP methods and classes       shipshape  low

12 checks: 2 pass, 5 blocker, 4 warning, 1 info
Verdict: SaaS-ready = NO (5 blockers)

Remediation plan
  REMEDIATE    [FILE] Disallowed permissions               Strip denied perms from config/default/user.role.*.yml
  REMEDIATE    [FILE] Validate TFA config                  tfa.settings: enabled + required_roles.authenticated
  REMEDIATE    [FILE] Verify enabled modules               Add httpav, tfa, lagoon_logs; remove dblog
  RE-PLATFORM  vet-005 custom composer patches             Drop the core patch, or move to PaaS
  RE-PLATFORM  vet-007 custom Drupal modules               Rewrite in the theme, swap for contrib, or PaaS

Same twelve records scored as offering=paas: 3 blockers (saas: 5).
Nothing was fixed. govcms-vet sets ON_ERROR=0 for paas, so vet-005 and vet-007
stop being fatal -- which is the whole SaaS-or-PaaS conversation in two lines of bash.
`,
  },
  keyPoints: [
    "Forklifting is the last step, not the project: the wiki defines it as putting a copy of the database and sites/default/files into the production environment. The assessment that decides whether it happens comes first.",
    "Two live artefacts, both in govcms/scaffold-tooling: govcms-vet (a diff against a freshly initialised scaffold, findings vet-001 to vet-007) and Shipshape (shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml --exclude-db --error-code .). govCMS/audit-site is archived and encodes Drupal 7 policy — do not cite it.",
    "Shipshape runs every check, then exits 2 only if the result list is Fail and at least one breach is at or above --fail-severity (default high). Thirteen checks declare severity: high; checks that omit severity default to normal and therefore report without blocking.",
    "govcms-vet has no severity axis, it has an offering axis: ON_ERROR=0 for paas, ON_ERROR=1 for saas and saasplus. The identical finding is advisory or fatal depending on the product.",
    "vet-007 (custom Drupal modules, found by scanning web for *.info.yml under a modules path) and vet-005 (custom Composer patches) are the pair no budget remediates on SaaS. The honest outputs are: rewrite into the theme, replace with something already in the distribution, or move to PaaS.",
    "migrate_plus, migrate_tools, migrate_source_csv and migrate_file are pinned in the distribution's require on both 4.x-develop and 3.x-develop, but none is in the profile install list or on the managed_modules allowlist. On SaaS the migration itself is migrate_plus.migration.* config entities in config/default built from stock plugins, with transformations pushed upstream into the source data.",
  ],
  interview: [
    {
      q: "A department has an existing Drupal 10 site and wants it on GovCMS SaaS. Walk me through how you'd assess it.",
      a: "I'd treat it as a pass/fail assessment before I'd treat it as a migration. First I stand the repo up against the platform image locally and run the two gates: `govcms-vet`, which diffs the codebase against a freshly `ahoy init`-ed scaffold and reports `vet-001` through `vet-007`, and Shipshape in file-only mode — `--exclude-db` — because there is no platform database to read yet. I'd also run `govcms-ship-shape -a -n`, since `-a` drops the *active* validators and `-n` makes it fail on error instead of writing XML reports. The output of those three commands is the artefact I take to the client, not my opinion. The thing I'd say out loud in the meeting is that the interesting result isn't the count of failures, it's which of them are `high` severity or `vet` findings, because those are the only two categories that actually decide anything.",
    },
    {
      q: "The audit comes back with four custom modules and a patched core. What do you tell the client?",
      a: "That the SaaS answer is no, and that no amount of budget changes it — `vet-007` is literally a `find` for `*.info.yml` under a modules path, and `vet-005` compares `custom/composer/patches.json` against the scaffold's. Then I'd triage the four modules, because in my experience most of a legacy custom module is a preprocess hook and a form alter, and both are legal in a GovCMS theme along with autoloaded classes under `themes/mytheme/src`. What doesn't survive is anything needing a `services.yml`, a route, or a plugin the theme can't declare. So the deliverable is a table: this one becomes theme code, this one is already covered by contrib in the distribution, this one is genuinely a module — and if anything lands in that third column, we're costing PaaS, where `govcms-vet` runs with `ON_ERROR=0` and the finding is advisory.",
    },
    {
      q: "How do you read a Shipshape report? What actually stops a deploy?",
      a: "Severity, not failure count. Shipshape runs every check — it doesn't short-circuit — and then exits `2` only if the result list is `Fail` *and* something breached at or above `--fail-severity`, which defaults to `high`. Thirteen checks declare `severity: high`; `[FILE] Executable files` is `normal`, `[FILE] Banned PHP methods and classes` is `low`, and anything that omits severity defaults to normal. The one that catches people out is `[FILE] Banned PHP function list`, which declares no severity, so a themer calling `exec()` shows up in red in the report and the deploy still goes through — it's the standalone `govcms-validate-php-functions` script that exits non-zero on that. If someone tells you the pipeline 'stopped at the first blocker', that's GitLab stage behaviour, not Shipshape.",
    },
    {
      q: "You need to migrate ten thousand nodes onto a SaaS site and you can't ship a module. How?",
      a: "As config. `migrate_plus`, `migrate_tools`, `migrate_source_csv` and `migrate_file` are pinned in the distribution's `require`, so the code is in the image on both the 4.x and 3.x lines — what's missing is somewhere to put custom source and process plugins. So the migration becomes `migrate_plus.migration.*` config entities in `config/default`, assembled from stock plugins, and every transformation I'd normally do in `prepareRow()` moves upstream into whatever generates the CSV or JSON feed. Practically that means the export script gets smarter and the YAML stays dumb, which is also easier to re-run. Two things I'd flag from having done it: re-importing migration config always shows a diff because Drupal runs none for those entities, so don't panic at a wall of changes on `config:import`, and create the power user before the forklift, because role assignment behaves differently afterwards.",
    },
  ],
  quiz: [
    {
      question:
        "A Shipshape run over a candidate repo produces nine failing checks, all of them at severity normal or below. What does the run exit with?",
      options: [
        "2, because any Fail result sets a non-zero exit code",
        "0, because no breach reached the default --fail-severity of high",
        "1, one per failing check up to a maximum of 1",
        "2, because Shipshape stops as soon as the first check fails",
      ],
      answerIndex: 1,
      explain:
        "Shipshape runs every check and then exits 2 only if the result list is Fail AND at least one breach is at or above --fail-severity, which defaults to high. Nine normal-or-below failures produce a red-looking report and a green exit. It also never short-circuits — any 'stops at the first failure' behaviour you've seen is GitLab stages, not Shipshape.",
    },
    {
      question:
        "The same repository is vetted twice: once with type paas in .version.yml, once with saas. Both runs report vet-007, custom Drupal modules. What differs?",
      options: [
        "The saas run skips vet-007 entirely because SaaS has no modules directory",
        "The paas run reports vet-007 at low severity and the saas run at high",
        "Nothing differs; govcms-vet always exits 1 on any finding",
        "Only the exit code: govcms-vet sets ON_ERROR=0 for paas and 1 for saas and saasplus",
      ],
      answerIndex: 3,
      explain:
        "govcms-vet has no severity model at all. It sets ON_ERROR once, near the top: 0 for paas, 1 for saas and saasplus, then assigns that value to exit_code on every failed comparison. PaaS users see the identical Problem lines in the job log and a green pipeline; SaaS users see the same lines and a red one.",
    },
    {
      question:
        "Which audit finding cannot be remediated on GovCMS SaaS, regardless of budget or timeline?",
      options: [
        "vet-007 — custom Drupal modules found in the repository",
        "[FILE] Disallowed permissions — a role in config/default granting 'administer modules'",
        "[FILE] Validate TFA config — tfa.settings missing required_roles.authenticated",
        "[FILE] Verify enabled modules — core.extension.yml missing httpav and tfa",
      ],
      answerIndex: 0,
      explain:
        "The other three are all edits to exported configuration in config/default: remove the permission, set the TFA keys, add the required modules to core.extension.yml. A custom module has nowhere to go on SaaS — the Dockerfile.saas payload is themes/, config and favicon.ico, and nothing else in the repo enters the image. The realistic outputs are rewriting into the theme, finding an equivalent already in the distribution, or moving to PaaS.",
    },
    {
      question:
        "On a GovCMS SaaS site, where does the definition of a content migration live?",
      options: [
        "In a custom module's migrations/ directory, deployed by the SaaS Dockerfile",
        "In .lagoon.yml as an extra post-rollout task calling drush migrate:import",
        "As migrate_plus.migration.* config entities in config/default, deployed by config import",
        "Nowhere in the repo — migrations must be executed by GovCMS support via the Dashboard",
      ],
      answerIndex: 2,
      explain:
        "migrate_plus lets a migration be a config entity, which is the only form that survives on SaaS: config/default is one of the three things the SaaS image copies in, and it is deployed by the config import task. Option 1 fails because no custom module reaches the image; option 2 fails because .lagoon.yml is a locked, platform-managed file on SaaS; option 4 overstates what any primary source says about the Dashboard.",
    },
  ],
};

export default lesson;
