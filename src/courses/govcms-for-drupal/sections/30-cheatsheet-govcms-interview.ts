import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-govcms-interview",
  title: "Cheat Sheet & Interview Capstone",
  part: "Building on GovCMS & Interview Prep",
  estMinutes: 13,
  summary:
    "The capstone index: the seven-move sequence, the five questions that pick an offering, a failure catalogue with the first diagnostic for every validator and platform failure in the course, and the standard-Drupal reflexes that need retraining.",

  concept: `
## The sequence, memorised

\`\`\`bash
# 1. OFFERING  classification first. Above OFFICIAL: Sensitive it is not this platform.
#              Then: authentication, personal information, payments -> talk to GovCMS early.
# 2. AUDIT     an existing site is a pass/fail assessment before it is a project.
#              Each custom module is either remediated or an argument for PaaS.
# 3. SCAFFOLD  ahoy init <name> <type> <version>   # type saas|paas|saasplus, version 10|11
#              scaffold-init.sh bakes the offering in and strips the
#              SaaS-only block from .lagoon.yml when type is paas.
# 4. BUILD     config in config/default, theme in themes/. On SaaS the image gets
#              themes/, config and favicon.ico -- nothing else in the repo ships.
# 5. VALIDATE  shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml \\
#                --exclude-db --error-code .        # plus govcms-vet, govcms-lint
# 6. ROLLOUT   push the branch: 3 pre-rollout tasks, then 8 post-rollout tasks.
# 7. OPERATE   SaaS -> Finance applies Drupal security updates. PaaS -> the agency
#              owns the application layer. Everything else is a service-desk ticket.
\`\`\`

### Five questions, one decision

1. **Is anything above OFFICIAL: Sensitive?** GovCMS is certified up to that level. Above it, stop.
2. **Authentication, personal information or payments?** Any yes triggers the early conversation.
3. **Does it need a custom module, a service, a route or a service override?** Yes on SaaS is a contradiction: theme PHP is fine, \`mytheme.services.yml\` is not.
4. **Does it need a platform-managed file changed?** \`.docker/*\`, \`.ahoy.yml\`, \`.env.default\`, \`.gitlab-ci.yml\`, \`.lagoon.yml\`, \`.version.yml\`, \`README.md\`, \`docker-compose.yml\` are locked on SaaS.
5. **Who should own Drupal security updates?** That answer *is* the offering.

Two yeses on 3 or 4 means PaaS, or a contribution upstream.

### Failure catalogue

| Symptom | First diagnostic |
| --- | --- |
| \`[fail]: 'lagoon_logs' is required\` | it reads exported \`core.extension.yml\`, never the filesystem |
| \`[info]: Configuration files not present.\` | no exported config found, exit 0 — your gate never ran |
| Pipeline green, SaaS rollout red | the \`shipshape\` job is \`allow_failure: true\`; post-rollout task 2 is not |
| Banned PHP function reported, build passes | that check declares no severity; only \`govcms-validate-php-functions\` exits non-zero |
| TFA validator fails on a site with TFA on | assert both: \`enabled\` truthy **and** \`required_roles.authenticated\` |
| Permission validator fails on a "harmless" role | \`drush role:list --format=json\` — any \`is_admin\` 1, plus nine denied permissions |
| \`git push\` declined | you touched a locked file; the push fails, not the build |
| \`vet\` red on saas, green on a colleague's paas clone | \`govcms-vet\` exits 0 on \`paas\`, 1 on \`saas\` and \`saasplus\` |
| Theme rejected | an \`*.info.yml\` under \`web/themes\` declaring \`type: module\` |
| Innocent filename rejected | \`govcms-validate-illegal-files\` uses an unanchored \`(adminer\\|phpmyadmin\\|bigdump)\`, so \`phpmyadmin-old.php\` matches. Shipshape's twin is anchored and scoped to \`web\`, so it does not |
| Module on in dev, gone in prod | \`PROD_ONLY_MODULES\` / \`NON_PROD_MODULES\` in \`govcms-enable_modules\` |
| Webform changes never reach prod | \`webform.webform.*\` is a \`config_ignore\` default, deliberately |
| \`composer update\` will not resolve | you pinned a package the distribution already owns |
| Search empty after rollout | no rollout task reindexes, and \`solr\` ships commented out |

### Standard Drupal reflexes, translated

- *Write a small module* → theme layer, a bundled module, or PaaS.
- *\`drush en devel\`, read \`dblog\`* → both disallowed; logging goes through \`lagoon_logs\`.
- *Environment logic in \`settings.local.php\`* → \`config/default\`, \`config/dev\`, \`config/local\`. Neither \`settings.local.php\` nor \`project.settings.php\` is reachable.
- *\`config_split\` per environment* → bundled but not installed and not on the allowlist; \`config_ignore\` is always on instead.
- *SSH in and fix it* → pods are ephemeral; the fix is config or code or it did not happen.
- *\`drush sql:sync @prod\`* → the Dashboard database; \`govcms-db-sync\` does not sanitise.
- *\`drush deploy\`* → the eight post-rollout tasks, in \`.lagoon.yml\`, in that order.
`,

  comparisons: [
    {
      label: "Shipping a release",
      intro:
        "Same goal: get tagged code and its config onto production safely. On your own infrastructure you write the sequence; on GovCMS you push a branch and the platform runs a sequence you can only skip, not reorder.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `#!/usr/bin/env bash
# Standard Drupal: your deploy script, your order, your rollback.
set -euo pipefail

git fetch --tags && git checkout v42
composer install --no-dev --optimize-autoloader

drush sql:dump --gzip --result-file=/backups/pre-v42.sql
drush state:set system.maintenance_mode 1 --input-format=integer

ln -sfn /srv/releases/v42 /srv/current
drush deploy -y            # updatedb, cim, cr, deploy hooks
drush state:set system.maintenance_mode 0 --input-format=integer

drush status --field=bootstrap`,
      ts: `# GovCMS: .lagoon.yml is the deploy script. Push the branch; Lagoon runs this.
tasks:
  pre-rollout:
    - run:
        name: Pre-rollout database updates
        command: /app/vendor/bin/govcms-pre-deploy-db-update
        service: cli
    - run:
        name: Snapshot the database and store
        command: /app/vendor/bin/govcms-db-backup
        service: cli
    - run:
        name: Snapshot the config and store
        command: /app/vendor/bin/govcms-config-backup
        service: cli
  post-rollout:
    - run:
        name: Prepare the site for deployment
        command: /app/vendor/bin/govcms-update_site_alias
        service: cli
    ## START SaaS-only
    - run:
        name: Perform GovCMS platform validations
        command: 'shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml --exclude-db --error-code .'
        service: cli
        when: withDefault("GOVCMS_SKIP_AUDIT", false) == false
    ## END SaaS-only
    - run:
        name: Perform config import
        command: /app/vendor/bin/govcms-config-import
        service: cli
        when: withDefault("GOVCMS_SKIP_CONFIG_IMPORT", false) == false`,
      note: "Eight post-rollout tasks run in a fixed order; only task 1 has no skip guard. The escape hatches are GOVCMS_SKIP_* environment variables, and every one of them trades a safety net for deploy time.",
    },
    {
      label: "Adding a module",
      intro:
        "A site builder wants a module turned on. On a site you own that is three commands. On GovCMS the answer is decided by an allowlist that lives in platform-owned settings, long before any validator runs.",
      leftLang: "bash",
      rightLang: "php",
      php: `#!/usr/bin/env bash
# Standard Drupal: require it, enable it, export it, commit it.
set -euo pipefail

composer require 'drupal/entity_browser:^2.13'
drush en -y entity_browser entity_browser_entity_form
drush config:export -y

git add composer.json composer.lock config/sync
git commit -m "Enable entity_browser for the media picker"`,
      ts: `<?php

// GovCMS: settings.php includes scaffold-tooling's security.settings.php.
// This array -- not the validators -- decides what the site may enable.
// The real file lists 73 machine names; these are five of them.
$config['module_permissions.settings']['managed_modules'] = [
  'entity_browser',
  'entity_browser_entity_form',
  'paragraphs',
  'webform',
  'govcms_dlm',
];

// The gatekeeper protects itself.
$config['module_permissions.settings']['protected_modules'] = [
  'module_permissions',
  'module_permissions_ui',
];

// A separate, shorter list: four permissions module_permissions denies.
$config['module_permissions.settings']['permission_blacklist'] = [
  'administer modules',
  'administer permissions',
  'administer search_api',
  'assign all roles',
];`,
      note: "Three different lists get conflated in interviews: this permission_blacklist has four entries, govcms-validate-active-permissions denies nine, and Shipshape's anonymous-role list is longer again. Name the source when you quote one.",
    },
    {
      label: "Giving a role more power",
      intro:
        "An agency asks for a 'super editor' role. The exported YAML is the artefact a GovCMS validator reads, so the same request produces a role that deploys and a role that fails the rollout.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Standard Drupal: config/sync/user.role.super_editor.yml
# Perfectly idiomatic -- is_admin short-circuits every access check.
langcode: en
status: true
dependencies:
  config:
    - node.type.page
id: super_editor
label: 'Super editor'
weight: 5
is_admin: true
permissions:
  - 'administer modules'
  - 'administer permissions'
  - 'administer site configuration'
  - 'synchronize configuration'
  - 'bypass node access'`,
      ts: `# GovCMS: config/default/user.role.super_editor.yml
# is_admin must be false, and none of the nine denied permissions may appear.
langcode: en
status: true
dependencies:
  config:
    - node.type.page
id: super_editor
label: 'Super editor'
weight: 5
is_admin: false
permissions:
  - 'access content overview'
  - 'bypass node access'
  - 'view all revisions'
  - 'administer nodes'
---
# Plus the TFA assertion both validators make, in config/default/tfa.settings.yml
enabled: true
required_roles:
  authenticated: authenticated`,
      note: "govcms-validate-active-permissions reads drush role:list --format=json and fails on any role with is_admin set to 1, before it even looks at the nine-permission denylist.",
    },
    {
      label: "Pre-flight before handover",
      intro:
        "The checks you run before you tell a client it is ready. On your own project these are advice you chose to take; on GovCMS most of them are the platform re-running its own gate.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
# Standard Drupal: a quality bar you set, and can waive.
set -euo pipefail

vendor/bin/phpcs --standard=Drupal,DrupalPractice web/modules/custom
vendor/bin/phpstan analyse web/modules/custom --level=1
vendor/bin/phpunit --testsuite=unit

drush config:status
drush updatedb:status
drush status --field=bootstrap`,
      ts: `#!/usr/bin/env bash
# GovCMS: the same commands the platform will run on you, run first.
set -euo pipefail

ahoy up
ahoy drush status --field=bootstrap

# Compliance gate. /app and the binaries only exist inside the cli container,
# so route it through ahoy run -- docker compose exec -T cli bash -c "$*".
# The inner command is byte-for-byte what post-rollout task 2 invokes.
ahoy run shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml \\
  --exclude-db --error-code .

# Scaffold drift. Exits 0 on paas, 1 on saas and saasplus.
ahoy run vendor/bin/govcms-vet

# Standalone validators. These do exit non-zero. They need the container's
# yq and phpstan, so they go through ahoy run too.
ahoy run vendor/bin/govcms-validate-php-functions
ahoy run vendor/bin/govcms-validate-illegal-files
ahoy run vendor/bin/govcms-validate-theme-modules`,
      note: "Shipshape runs every check, then exits 2 only if a breach is at or above --fail-severity (default high). It never stops at the first failure -- that is a GitLab stage behaviour, not a Shipshape one.",
    },
  ],

  playground: {
    intro:
      "A readiness interrogator: three real-shaped engagements pushed through the whole chain in one pass. Read the rule functions, not just the verdicts -- each one is a section of this course compressed to a few lines.",
    lang: "php",
    code: `<?php

$REQUIRED = ['httpav', 'govcms_security', 'lagoon_logs', 'tfa'];
$DISALLOWED = ['dblog', 'module_permissions_ui', 'statistics', 'update'];

$sites = [
  ['name' => 'Brochure site, 12 pages', 'above_official_sensitive' => false,
   'auth' => false, 'pii' => false, 'pay' => false, 'custom_modules' => 0,
   'core_patched' => false, 'db_gb' => 0.4, 'locked_file_edits' => 0,
   'enabled' => ['httpav', 'govcms_security', 'lagoon_logs', 'tfa'],
   'tfa_enabled' => true, 'tfa_authenticated' => true, 'admin_roles' => 0],
  ['name' => 'Grants portal, SSO + card payments', 'above_official_sensitive' => false,
   'auth' => true, 'pii' => true, 'pay' => true, 'custom_modules' => 1,
   'core_patched' => false, 'db_gb' => 2.0, 'locked_file_edits' => 1,
   'enabled' => ['httpav', 'govcms_security', 'tfa'],
   'tfa_enabled' => true, 'tfa_authenticated' => false, 'admin_roles' => 1],
  ['name' => 'Legacy department site', 'above_official_sensitive' => false,
   'auth' => true, 'pii' => false, 'pay' => false, 'custom_modules' => 4,
   'core_patched' => true, 'db_gb' => 18.0, 'locked_file_edits' => 0,
   'enabled' => ['httpav', 'govcms_security', 'lagoon_logs', 'tfa', 'dblog', 'statistics'],
   'tfa_enabled' => false, 'tfa_authenticated' => false, 'admin_roles' => 2],
];

function triggers(array $s): array {
  $t = [];
  if ($s['auth']) { $t[] = 'authentication'; }
  if ($s['pii']) { $t[] = 'personal information'; }
  if ($s['pay']) { $t[] = 'payments'; }
  return $t;
}

function blockers(array $s): array {
  $b = [];
  if ($s['custom_modules'] > 0) { $b[] = sprintf('%d custom module(s)', $s['custom_modules']); }
  if ($s['core_patched']) { $b[] = 'patched core'; }
  if ($s['locked_file_edits'] > 0) { $b[] = 'edits locked platform files'; }
  if ($s['db_gb'] > 10.0) { $b[] = sprintf('database %.1f GB', $s['db_gb']); }
  return $b;
}

function failing_validators(array $s, array $req, array $dis): array {
  $f = [];
  foreach ($req as $m) {
    if (!in_array($m, $s['enabled'], TRUE)) { $f[] = 'required module absent: ' . $m; }
  }
  foreach ($dis as $m) {
    if (in_array($m, $s['enabled'], TRUE)) { $f[] = 'disallowed module enabled: ' . $m; }
  }
  if (!$s['tfa_enabled'] || !$s['tfa_authenticated']) { $f[] = 'TFA assertion'; }
  if ($s['admin_roles'] > 0) { $f[] = sprintf('%d role(s) with is_admin', $s['admin_roles']); }
  return $f;
}

function offering(array $s, array $blockers): string {
  if ($s['above_official_sensitive']) { return 'Not GovCMS'; }
  return $blockers === [] ? 'SaaS' : 'PaaS';
}

$row = function (string $k, string $v): void { printf("  %-22s %s\\n", $k, $v); };
$join = fn(array $a): string => $a === [] ? 'none' : implode('; ', $a);

echo "GovCMS readiness interrogator\\n";
foreach ($sites as $s) {
  $b = blockers($s);
  $o = offering($s, $b);
  $v = failing_validators($s, $REQUIRED, $DISALLOWED);
  printf("\\n== %s\\n", $s['name']);
  $row('classification', 'at or under OFFICIAL: Sensitive');
  $row('early conversation', $join(triggers($s)));
  $row('SaaS blockers', sprintf('%d  (%s)', count($b), $join($b)));
  $row('validators failing', $join($v));
  $row('security updates', $o === 'SaaS' ? 'GovCMS applies them' : 'agency owns the app layer');
  $row('verdict', $o . ($v === [] ? '' : ' -- remediate config before rollout'));
}

echo "\\nThe sequence, memorised\\n";
$seq = ['offering decision', 'onboarding audit', 'scaffold (ahoy init)', 'build (config + theme)',
        'validators (shipshape, vet)', 'rollout (3 pre, 8 post)', 'operate (updates, service desk)'];
foreach ($seq as $i => $step) { printf("  %d. %s\\n", $i + 1, $step); }`,
    output: `GovCMS readiness interrogator

== Brochure site, 12 pages
  classification         at or under OFFICIAL: Sensitive
  early conversation     none
  SaaS blockers          0  (none)
  validators failing     none
  security updates       GovCMS applies them
  verdict                SaaS

== Grants portal, SSO + card payments
  classification         at or under OFFICIAL: Sensitive
  early conversation     authentication; personal information; payments
  SaaS blockers          2  (1 custom module(s); edits locked platform files)
  validators failing     required module absent: lagoon_logs; TFA assertion; 1 role(s) with is_admin
  security updates       agency owns the app layer
  verdict                PaaS -- remediate config before rollout

== Legacy department site
  classification         at or under OFFICIAL: Sensitive
  early conversation     authentication
  SaaS blockers          3  (4 custom module(s); patched core; database 18.0 GB)
  validators failing     disallowed module enabled: dblog; disallowed module enabled: statistics; TFA assertion; 2 role(s) with is_admin
  security updates       agency owns the app layer
  verdict                PaaS -- remediate config before rollout

The sequence, memorised
  1. offering decision
  2. onboarding audit
  3. scaffold (ahoy init)
  4. build (config + theme)
  5. validators (shipshape, vet)
  6. rollout (3 pre, 8 post)
  7. operate (updates, service desk)
`,
  },

  keyPoints: [
    "The seven moves in order: offering decision, onboarding audit, scaffold, build, validators, rollout, operate. Every GovCMS question in an interview lands somewhere on that line.",
    "Five questions pick the offering: classification, the three early-conversation triggers, custom code, locked platform files, and who owns Drupal security updates.",
    "Module gating is done by module_permissions' managed_modules allowlist in platform-owned settings, not by the validators — the validators only check four required and four disallowed names in exported config.",
    "Shipshape runs every check and exits 2 only on a breach at or above --fail-severity; the CI job is allow_failure: true, so the same breach is advisory in GitLab and fatal at post-rollout task 2 on SaaS.",
    "The permission gate has two independent halves: any role with is_admin fails outright, and nine named permissions are denied — a different list from module_permissions' four.",
    "Most 'GovCMS is broken' symptoms are the platform enforcing something: locked files decline the push, config_ignore drops webform config, and govcms-enable_modules rewrites the module list on every deploy.",
  ],

  interview: [
    {
      q: "Walk me through how you'd take a new agency website from first conversation to live on GovCMS.",
      a: `Seven moves. Decide the offering first — classification, then whether the site does authentication, collects personal information or takes payments, then whether anything genuinely needs custom code. If it's an existing site, the onboarding audit is a pass/fail gate before it's a project, and each custom module is either remediated or an argument for PaaS. Then \`ahoy init <name> <type> <version>\`, which bakes the offering into the repo, build in \`config/default\` and \`themes/\`, run Shipshape and \`govcms-vet\` locally, and push the branch so Lagoon runs three pre-rollout and eight post-rollout tasks.

The part people skip is step 7. On SaaS, Finance applies Drupal security updates and I stop patching core; on PaaS the agency owns the application layer and my sprint budget has to carry that. I've had that conversation land badly at month four because nobody named an owner at month zero.`,
    },
    {
      q: "A client on SaaS wants a module that isn't enabled. What actually happens?",
      a: `Three checks, in order. Is it bundled by the distribution at all — roughly 102 \`drupal/*\` packages ship with the profile, so a surprising amount is already on disk. Is it on the \`managed_modules\` allowlist in scaffold-tooling's \`security.settings.php\` — 73 machine names, enforced by \`drupal/module_permissions\`, and that list, not the validators, is what actually restricts the site. And is it on the four-name disallowed list the validators check.

What I won't do is promise a lead time for getting something added. \`simple_oauth\`, \`jsonapi\`, \`config_split\` and \`simplesamlphp_auth\` are all bundled, all off, and none of them are on the allowlist — the honest answer to the client is "it's present but not self-serve, and this is a GovCMS conversation, not a ticket I can close."`,
    },
    {
      q: "Our GitLab pipeline is green but the SaaS deploy failed. Where do you look?",
      a: `At the two Shipshape invocations — but not at the flags, because they are effectively the same call. Both pass \`--error-code\`, so both exit non-zero on a breach. The difference is what happens to that exit code. The \`shipshape\` job in the vendored pipeline is \`allow_failure: true\`, which swallows it — the job uploads a JUnit report and never reddens the pipeline. Nothing swallows it at post-rollout task 2 in \`.lagoon.yml\`, so the identical breach fails the rollout. A \`high\` breach is genuinely invisible in CI and fatal on deploy.

I'd pull \`tests/shipshape-results.xml\` from the CI artefacts first, because the failure was almost certainly already reported before the push. And I'd correct the assumption behind the question while I'm there: Shipshape doesn't stop at the first failure. It runs every check, then exits 2 only if a breach is at or above \`--fail-severity\`, default \`high\`. Stopping early is a GitLab stage behaviour.`,
    },
    {
      q: "How would you decide between SaaS and PaaS for a grants portal with agency SSO and online payments?",
      a: `SSO and payments are two of the three triggers on the "talk to us early" list, so the first move is that conversation, not an architecture diagram. Then the code question: SAML is bundled as \`simplesamlphp_auth\` but isn't installed and isn't on the allowlist, and a payment integration almost always needs a service, a route and a queue worker — all of which are exactly what the SaaS boundary excludes. Theme PHP is allowed; \`mytheme.services.yml\` is not.

So I'd expect PaaS, and I'd say why in cost terms rather than capability terms: PaaS returns the application layer, which means the agency now owns Drupal security updates, and that's an ongoing line item. If the payment step can be a redirect to an existing whole-of-government service, I'd push hard to stay on SaaS instead — that's usually the cheaper answer over five years.`,
    },
  ],

  quiz: [
    {
      question:
        "On a GovCMS SaaS site, what actually stops a site builder enabling an arbitrary contrib module?",
      options: [
        "govcms-validate-modules, which scans the codebase for unapproved packages",
        "Shipshape's [DATABASE] Active modules audit, which uninstalls off-list modules",
        "The managed_modules allowlist in scaffold-tooling's security.settings.php, enforced by drupal/module_permissions",
        "Composer, because the distribution's composer.json forbids extra requires",
      ],
      answerIndex: 2,
      explain:
        "The 73-name managed_modules list under $config['module_permissions.settings'] is the mechanism. The validators only assert four required and four disallowed names against exported config — govcms-validate-modules reads core.extension.yml via yq and never touches the filesystem — and Shipshape reports rather than uninstalls.",
    },
    {
      question:
        "A high-severity Shipshape breach appears in the GitLab pipeline, yet the pipeline is green. Why?",
      options: [
        "The shipshape job is allow_failure: true and only uploads a JUnit report",
        "Shipshape short-circuits at the first failure, so later checks never ran",
        "High severity is below the default --fail-severity threshold",
        "The breach was in a check with no declared severity, which cannot fail anything",
      ],
      answerIndex: 0,
      explain:
        "The job is advisory in CI; the same configuration at post-rollout task 2 uses --error-code and fails the SaaS rollout. Shipshape does not short-circuit — it runs every check then exits 2 if a breach is at or above --fail-severity, which defaults to high, so a high breach is exactly at the threshold.",
    },
    {
      question:
        "Which of these would fail govcms-validate-active-permissions on its own, with no denied permission granted?",
      options: [
        "A role granted 'administer search_api'",
        "A role with is_admin set to 1",
        "A role granted 'access content overview' plus 'bypass node access'",
        "The authenticated role without the 'setup own tfa' permission",
      ],
      answerIndex: 1,
      explain:
        "The validator reads drush role:list --format=json and fails any role with is_admin = 1, independently of its nine-permission denylist. 'administer search_api' belongs to module_permissions' four-entry permission_blacklist, and the 'setup own tfa' requirement is a Shipshape addition, not this validator's.",
    },
    {
      question:
        "A webform's configuration changes never appear in production after a successful rollout. What is the first diagnostic?",
      options: [
        "Check whether GOVCMS_SKIP_CONFIG_IMPORT was set on the environment",
        "Run drush config:status to find a UUID mismatch between environments",
        "Check whether govcms-db-sync overwrote the target database after the import",
        "Check config_ignore — webform.webform.* is ignored by default, deliberately",
      ],
      answerIndex: 3,
      explain:
        "config_ignore ships installed and on by default in the profile, with webform.webform.* and webform.webform_options.* among its simple-mode defaults, so webforms are excluded from config deployment on purpose. The skip variable and a sync ordering problem are real failure modes, but they would affect all config, not only webforms.",
    },
  ],
};

export default lesson;
