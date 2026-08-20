import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "permissions-profile-and-tfa-validators",
  title: "Permissions, Profile and TFA: The Runtime Guards",
  part: "The Compliance Gates",
  estMinutes: 13,
  summary:
    "The three guards that read a running GovCMS site — the nine-permission denylist, the install-profile assertion and the two-line TFA check — and why a role grant on this platform is a reviewed build artefact rather than an afternoon in the permissions grid.",
  concept: `## A role grant stops being a click

On a Drupal site you control, granting a permission is a UI action with a config export chasing it. On GovCMS the grant is only the beginning: the exported \`user.role.*.yml\` then has to survive a denylist that runs both over your committed configuration and over the live database.

Three guards matter here. Each reads a different input, and knowing which is which is the whole skill.

### 1. Permissions

\`govcms-validate-active-permissions\` shells \`drush role:list --format=json\` and pipes it through \`jq\`. It fails any role holding any of **nine** permissions:

\`\`\`text
administer modules                                administer software updates
administer permissions                            import configuration
administer seckit                                 synchronize configuration
administer site configuration                     administer config permissions
use PHP for google analytics tracking visibility
\`\`\`

It then loops every role and runs \`drush config:get user.role.<rid> is_admin --format=string\`, failing anything that returns \`1\`. So a role can hold none of the nine and still fail, simply for being flagged administrative.

Do not confuse this list with its neighbours. \`module_permissions.settings.permission_blacklist\` in scaffold-tooling's \`security.settings.php\` names **four** — \`administer modules\`, \`administer permissions\`, \`administer search_api\`, \`assign all roles\` — and \`administer search_api\` appears nowhere else. Shipshape's \`[DATABASE] Anonymous role check\` names roughly thirty-seven, anonymous only. Name your source when you quote a number.

The distribution's own \`Site Administrator\` role is the worked example: \`is_admin: null\`, and it deliberately stops short of all nine while still holding \`administer themes\`, \`administer users\`, \`administer views\` and \`bypass node access\`.

### 2. Install profile

Two scripts, one assertion. \`govcms-validate-profile\` runs \`yq '.profile'\` over \`config/default/core.extension.yml\` and exits \`0\` with \`[info]: Configuration files not present.\` when there is nothing to read — it never touches the filesystem for modules. \`govcms-validate-active-profile\` asks the running site via \`drush config:get core.extension --format=json\`. Both want exactly \`govcms\`.

### 3. TFA

\`govcms-validate-active-tfa\` reads \`drush config:get --include-overridden tfa.settings --format=json\` and asserts exactly two things: \`enabled\` is truthy, and \`required_roles.authenticated\` equals the string \`authenticated\`. One role name is legal here. Requiring TFA for your site-administrator role and nothing else fails the check, because the platform's position is that every logged-in user is second-factored. \`shipshape.yml\` declares one thing the bash script does not: \`[DATABASE] Authenticated role check\`, which requires the authenticated role to *hold* \`setup own tfa\`. It is a database check, so \`--exclude-db\` drops it from every GovCMS invocation — it is a rehearsal check you run locally, not a platform gate.

### How they are actually run

\`govcms-ship-shape\` — the bash aggregator, distinct from the Go \`shipshape\` binary — globs \`vendor/bin/govcms-validate-*\` and runs every one, incrementing a counter per non-zero script and exiting with that count under \`-n\`. Its \`-a\` flag drops the \`*active*\` scripts for codebase-only runs. Meanwhile the SaaS-only \`.lagoon.yml\` task runs \`shipshape ... --exclude-db\`, so on rollout it is the exported-config checks that gate you, not the live-database ones.`,
  comparisons: [
    {
      label: "Granting a site builder one extra permission",
      intro:
        "A team lead wants a role that can adjust security headers. On a site you own this is a two-minute job; on GovCMS the same two commands produce a build artefact that two separate gates read.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal: create the role, grant it, export, ship.
drush role:create seckit_admin 'Seckit admin'
drush role:perm:add seckit_admin 'administer seckit'
drush role:perm:add seckit_admin 'administer site configuration'
drush config:export -y

git add config/sync/user.role.seckit_admin.yml
git commit -m 'Add seckit_admin role'
# Nothing downstream inspects the permission list. It deploys.`,
      ts: `# GovCMS: identical Drush, then the artefact meets the guards.
ahoy drush role:create seckit_admin 'Seckit admin'
ahoy drush role:perm:add seckit_admin 'administer seckit'
ahoy drush role:perm:add seckit_admin 'administer site configuration'
ahoy drush config:export -y

# Live-site guard, over drush role:list --format=json:
govcms-validate-active-permissions
# GovCMS Validate :: Disallowed permissions on active site
# [fail]: 'seckit_admin' has restricted permissions: "administer seckit,administer site configuration"
# [fail]: Elevated permissions detected   -> exit 1

# Codebase guard on the SaaS rollout, over config/default/user.role.*.yml:
shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml --exclude-db --error-code .
# [FILE] Disallowed permissions   severity: high   -> post-rollout task fails`,
      note: "Both permissions are on the validator's nine. The grant is not refused at the UI — it is refused after you commit it, which is why GovCMS role changes belong in a pull request with a reviewer, not in the permissions grid on a Friday.",
    },
    {
      label: "The administrator role",
      intro:
        "Every vanilla Drupal site has a role with the admin flag set, so new permissions are inherited automatically. GovCMS ships the opposite pattern and the validator enforces it.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# user.role.administrator.yml on a site you control.
langcode: en
status: true
dependencies: {  }
id: administrator
label: Administrator
weight: 2
is_admin: true
permissions: {  }
# is_admin: true means every permission, including ones added by
# modules installed next year. This is the Drupal-standard shape.`,
      ts: `# user.role.govcms_site_administrator.yml, shipped by the distribution.
id: govcms_site_administrator
label: 'Site Administrator'
weight: -6
is_admin: null
permissions:
  - 'administer themes'
  - 'administer users'
  - 'administer views'
  - 'bypass node access'
  - 'administer menu'
  - 'administer taxonomy'
  - 'setup own tfa'
  # ...enumerated in full. None of the nine denied permissions appear.

# govcms-validate-active-permissions loops every role id and runs:
#   drush config:get user.role.$role is_admin --format=string
# Any role returning 1 is reported as "[FAIL]; '$role' has is_admin".`,
      note: "The GovCMS role is broad but finite: it can theme, manage users and bypass node access, yet cannot install a module, sync configuration or change site settings. Setting is_admin fails the validator on its own, with no denied permission present.",
    },
    {
      label: "Which install profile the site is running",
      intro:
        "Standard Drupal treats the profile as a starting point you may replace. GovCMS treats it as an identity assertion checked twice — once against your committed config and once against the running database.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla: pick a profile, or write your own and install from it.
drush site:install standard --account-name=admin -y
# ...or a project-specific profile:
drush site:install acme_profile -y

# Later, you can edit the profile line, but core will not import it:
#   config/sync/core.extension.yml -> profile: acme_profile
#   'Cannot change the install profile from standard to acme_profile once
#    Drupal is installed.' -- ConfigImportSubscriber
# What vanilla lacks is a *deploy-time* assertion that the profile is a
# specific named one; GovCMS adds exactly that, twice.`,
      ts: `# GovCMS: one legal profile, asserted by two separate scripts.
ahoy drush si -y govcms

# Codebase check - reads exported config only, via yq:
govcms-validate-profile
# GovCMS Validate :: Validate install profile
# [info]: config/default/core.extension.yml is using the 'govcms' profile
# (with no config committed at all it prints
#  "[info]: Configuration files not present." and exits 0)

# Live-site check - reads the database via Drush:
govcms-validate-active-profile
# GovCMS Validate :: Validate profile on active site
# [fail]: Detected invalid profile [standard]   -> exit 1`,
      note: "The codebase script passes vacuously when config/default holds no core.extension.yml, so a green govcms-validate-profile is not evidence the running site is correct. Only the active variant proves that.",
    },
    {
      label: "Enforcing two-factor authentication",
      intro:
        "Most Drupal sites that use TFA require it for their elevated roles and leave ordinary logins alone. GovCMS asserts a single, blunter shape, and it will not accept a named privileged role as a substitute.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# tfa.settings.yml on a site you control: TFA where it is worth the friction.
enabled: true
required_roles:
  administrator: administrator
  content_editor: content_editor
  authenticated: '0'
default_validation_plugin: tfa_totp
login_plugin_settings:
  validation_plugin: tfa_totp
# Perfectly defensible policy: second factor for staff, not for
# every account that can log in.`,
      ts: `# tfa.settings.yml on GovCMS: the validator asserts exactly two keys.
enabled: true
required_roles:
  authenticated: authenticated

# govcms-validate-active-tfa, over
#   drush config:get --include-overridden tfa.settings --format=json
#   1. enabled must be 1 or 'true'
#   2. required_roles.authenticated must equal the string 'authenticated'
# Anything else:
#   [fail]: TFA is not required for authenticated users   -> exit 1
# An empty required_roles gives:
#   [fail]: TFA is not required for any role

# shipshape.yml declares one more, severity high -- but --exclude-db drops it
# in every GovCMS invocation, so it only runs when you run it locally:
#   [DATABASE] Authenticated role check -> requires 'setup own tfa'`,
      note: "Naming govcms_site_administrator in required_roles does not help — the check looks up the authenticated key by name and compares the string. The Shipshape half reads only the authenticated role, and the distribution ships no user.role.authenticated.yml — the permission is injected at runtime by scaffold-tooling's production.settings.php, which sets $config['user.role.authenticated']['permissions'][999999] = 'setup own tfa'; inside the same GOVCMS_TFA_ENFORCE block that sets enabled and required_roles.authenticated. That runtime injection is also why the validator reads config with --include-overridden.",
    },
  ],
  playground: {
    intro:
      "A pure-PHP model of the three guards run back to back, over the exact JSON shapes each one reads from Drush. Each guard is a function returning an exit code; the closing block is what govcms-ship-shape does with them — a count of failed scripts, not a stop at the first one.",
    lang: "php",
    code: `<?php

// The nine permissions govcms-validate-active-permissions rejects.
$denied_permissions = [
  'administer modules',
  'administer permissions',
  'administer seckit',
  'administer site configuration',
  'administer software updates',
  'import configuration',
  'use PHP for google analytics tracking visibility',
  'synchronize configuration',
  'administer config permissions',
];

// Shape of: drush role:list --format=json
$roles = [
  'anonymous' => ['is_admin' => 0, 'perms' => ['access content']],
  'authenticated' => ['is_admin' => 0, 'perms' => ['access content', 'setup own tfa']],
  'govcms_content_approver' => ['is_admin' => 0, 'perms' => ['view latest version', 'setup own tfa']],
  'govcms_site_administrator' => ['is_admin' => 0, 'perms' => ['administer themes', 'administer users', 'setup own tfa']],
  'agency_webmaster' => ['is_admin' => 0, 'perms' => ['administer seckit', 'synchronize configuration']],
  'release_manager' => ['is_admin' => 1, 'perms' => ['access content', 'setup own tfa']],
];

// Shape of: drush config:get core.extension --format=json
$core_extension = ['profile' => 'govcms'];

// Shape of: drush config:get --include-overridden tfa.settings --format=json
$tfa_settings = [
  'enabled' => 1,
  'required_roles' => ['govcms_site_administrator' => 'govcms_site_administrator'],
];

function row($a, $b, $c) {
  printf("%-28s %-7s %s\\n", $a, $b, $c);
}

// Guard 1: denylist intersection, then the separate is_admin sweep.
echo "== govcms-validate-active-permissions ==\\n";
row('role', 'verdict', 'finding');
$permissions_exit = 0;
foreach ($roles as $rid => $role) {
  $hits = array_values(array_intersect($role['perms'], $denied_permissions));
  if ($role['is_admin'] === 1) {
    $hits[] = 'is_admin = 1';
  }
  if ($hits === []) {
    row($rid, 'pass', '-');
  }
  else {
    row($rid, 'FAIL', implode(', ', $hits));
    $permissions_exit = 1;
  }
}

// Guard 2: one string comparison against the only legal profile.
echo "\\n== govcms-validate-active-profile ==\\n";
row('assertion', 'verdict', 'finding');
$profile_exit = $core_extension['profile'] === 'govcms' ? 0 : 1;
row('core.extension profile', $profile_exit === 0 ? 'pass' : 'FAIL',
  $profile_exit === 0 ? "'govcms' profile is in use" : 'invalid profile [' . $core_extension['profile'] . ']');

// Guard 3: two assertions, then who those assertions actually cover.
echo "\\n== govcms-validate-active-tfa ==\\n";
row('assertion', 'verdict', 'finding');
$tfa_exit = 0;
$enabled = $tfa_settings['enabled'];
if ($enabled === 1 || $enabled === 'true') {
  row('enabled truthy', 'pass', '-');
}
else {
  row('enabled truthy', 'FAIL', 'TFA not enabled');
  $tfa_exit = 1;
}
$required = $tfa_settings['required_roles'];
$got = $required === [] ? 'no_role_required' : (isset($required['authenticated']) ? $required['authenticated'] : 'null');
if ($got === 'authenticated') {
  row('required_roles.authenticated', 'pass', '-');
}
else {
  row('required_roles.authenticated', 'FAIL', 'got ' . $got . ', want authenticated');
  $tfa_exit = 1;
}
$covered = isset($required['authenticated']) && $required['authenticated'] === 'authenticated';
echo "roles a logged-in user can hold, and whether the assertion covers them:\\n";
foreach ($roles as $rid => $role) {
  if ($rid === 'anonymous') {
    continue;
  }
  row('  ' . $rid, $covered ? 'yes' : 'no',
    $covered ? 'via required_roles.authenticated' : 'naming another role does not count');
}

// govcms-ship-shape -n: run them all, count the failures, exit with the count.
echo "\\n== govcms-ship-shape aggregate ==\\n";
$exits = [
  'govcms-validate-active-permissions' => $permissions_exit,
  'govcms-validate-active-profile' => $profile_exit,
  'govcms-validate-active-tfa' => $tfa_exit,
];
foreach ($exits as $script => $code) {
  printf("exit %-36s %d\\n", $script, $code);
}
printf("failed validators: %d of %d\\n", count(array_filter($exits)), count($exits));`,
    output: `== govcms-validate-active-permissions ==
role                         verdict finding
anonymous                    pass    -
authenticated                pass    -
govcms_content_approver      pass    -
govcms_site_administrator    pass    -
agency_webmaster             FAIL    administer seckit, synchronize configuration
release_manager              FAIL    is_admin = 1

== govcms-validate-active-profile ==
assertion                    verdict finding
core.extension profile       pass    'govcms' profile is in use

== govcms-validate-active-tfa ==
assertion                    verdict finding
enabled truthy               pass    -
required_roles.authenticated FAIL    got null, want authenticated
roles a logged-in user can hold, and whether the assertion covers them:
  authenticated              no      naming another role does not count
  govcms_content_approver    no      naming another role does not count
  govcms_site_administrator  no      naming another role does not count
  agency_webmaster           no      naming another role does not count
  release_manager            no      naming another role does not count

== govcms-ship-shape aggregate ==
exit govcms-validate-active-permissions   1
exit govcms-validate-active-profile       0
exit govcms-validate-active-tfa           1
failed validators: 2 of 3
`,
  },
  keyPoints: [
    "govcms-validate-active-permissions reads drush role:list --format=json and fails any role holding any of nine permissions: administer modules, administer permissions, administer seckit, administer site configuration, administer software updates, import configuration, use PHP for google analytics tracking visibility, synchronize configuration, administer config permissions.",
    "The same script separately runs drush config:get user.role.<rid> is_admin over every role and fails anything returning 1 — a role with none of the nine can still fail on the admin flag alone.",
    "Three different permission lists exist and interviewers conflate them: the validator's nine, module_permissions.settings.permission_blacklist's four (which uniquely includes administer search_api and assign all roles), and Shipshape's ~37-entry anonymous-role list.",
    "govcms-validate-profile reads only config/default/core.extension.yml via yq and exits 0 with '[info]: Configuration files not present.' when there is none; govcms-validate-active-profile asks the running database. Both require exactly govcms.",
    "Both TFA validators assert exactly two things — enabled is truthy, and required_roles.authenticated equals the string 'authenticated'. No other role name satisfies them; Shipshape separately requires the authenticated role to hold 'setup own tfa'.",
    "govcms-ship-shape is a bash aggregator that globs vendor/bin/govcms-validate-*, runs every script, and under -n exits with the count of failures; -a excludes the *active* scripts. It is not the Go shipshape binary that the SaaS post-rollout task invokes with --exclude-db.",
  ],
  interview: [
    {
      q: "A client's site builder wants the 'administer site configuration' permission so they can change the site name without raising a ticket. Walk me through what happens.",
      a: "It will not survive. \`administer site configuration\` is one of the nine on \`govcms-validate-active-permissions\`, so the moment that role exists the live-site guard exits 1, and the exported \`user.role.*.yml\` also trips Shipshape's \`[FILE] Disallowed permissions\` check, which carries \`severity: high\` and therefore fails the SaaS post-rollout validation task. The right move is to separate the *want* from the *permission*: site name lives in \`system.site\`, so ship it as configuration through \`config/default\` and a normal deploy, or expose the specific field through a small form if the site is PaaS with custom modules. In practice I tell teams early that on GovCMS a role change is a pull request with a reviewer, because the platform will read the diff whether or not we do.",
    },
    {
      q: "Your pipeline is green on govcms-validate-profile but the site is misbehaving after a restore. Does that green tell you anything?",
      a: "Almost nothing on its own. \`govcms-validate-profile\` only reads \`config/default/core.extension.yml\` through \`yq\`; if that file is absent it prints \`[info]: Configuration files not present.\` and exits 0. So a project that has never exported config passes trivially. The check that actually proves the running site is \`govcms-validate-active-profile\`, which asks the database via \`drush config:get core.extension --format=json\` and compares \`.profile\` to \`govcms\`. After a database restore that is the one I run first, because a restored dump can carry a profile the codebase never named.",
    },
    {
      q: "How is TFA enforced on GovCMS, and what is the most common way teams get the configuration wrong?",
      a: "The \`tfa\` module is in \`GOVCMS_REQUIRED_MODULES\` for both module validators, so it must be enabled, and the TFA validators then assert exactly two things about \`tfa.settings\`: \`enabled\` is truthy, and \`required_roles.authenticated\` equals the literal string \`authenticated\`. The classic mistake is treating it like an ordinary Drupal TFA rollout and requiring the second factor for the administrator-ish roles only — that leaves \`required_roles.authenticated\` unset, the validator prints \`[fail]: TFA is not required for authenticated users\`, and the deploy validation fails. The platform's position is that every logged-in account is second-factored, so there is no privileged-role carve-out to negotiate. I also check the Shipshape half, \`[DATABASE] Authenticated role check\`, which requires the authenticated role to actually hold \`setup own tfa\` — enabling TFA without that permission gives users nothing to enrol with. I run that one locally, because every GovCMS Shipshape invocation passes \`--exclude-db\` and drops the \`[DATABASE]\` checks.",
    },
    {
      q: "Someone tells you 'the GovCMS permission denylist has four entries'. Are they right?",
      a: "They are quoting a real list, just not the one that usually matters. \`module_permissions.settings.permission_blacklist\` in scaffold-tooling's \`security.settings.php\` does have four entries — \`administer modules\`, \`administer permissions\`, \`administer search_api\`, \`assign all roles\` — and \`administer search_api\` appears on no other list. The deploy-time validator \`govcms-validate-active-permissions\` uses a different list of nine, and Shipshape's \`[DATABASE] Anonymous role check\` uses a third of roughly thirty-seven applied only to anonymous. I always name the source when I quote a count, because I have seen a build fail on \`administer seckit\` while someone insisted it was not on the denylist — it is on the nine, and not on the four.",
    },
  ],
  quiz: [
    {
      question:
        "A role on a running GovCMS site holds only 'access content' and 'view own unpublished content', but its configuration has is_admin set to 1. What does govcms-validate-active-permissions do?",
      options: [
        "It fails the role, because the script separately checks is_admin on every role in addition to the nine-permission denylist.",
        "It passes the role, because neither permission is on the denylist and is_admin is only checked by Shipshape.",
        "It passes the role but emits a warning, because is_admin is advisory outside production.",
        "It fails only if the role also appears in module_permissions.settings.protected_modules.",
      ],
      answerIndex: 0,
      explain:
        "After the jq denylist pass, the script loops every role id from drush role:list and runs drush config:get user.role.$role is_admin --format=string, appending any role returning 1 to FAILURES with the message \"[FAIL]; '$role' has is_admin\". protected_modules is a module_permissions setting about modules, not roles.",
    },
    {
      question:
        "Which permission appears in module_permissions.settings.permission_blacklist but NOT in the nine used by govcms-validate-active-permissions?",
      options: [
        "administer seckit",
        "synchronize configuration",
        "administer search_api",
        "administer software updates",
      ],
      answerIndex: 2,
      explain:
        "The module_permissions blacklist has four entries: administer modules, administer permissions, administer search_api and assign all roles. administer search_api is unique to it. administer seckit, synchronize configuration and administer software updates are all on the validator's nine.",
    },
    {
      question:
        "A project has never run drush config:export, so config/default contains no core.extension.yml. What does govcms-validate-profile report?",
      options: [
        "It fails with '[fail]: Invalid profile detected' because no profile could be read.",
        "It prints '[info]: Configuration files not present.' and exits 0.",
        "It falls back to querying the database through Drush and reports the active profile.",
        "It scans web/profiles for a govcms directory and passes if one exists.",
      ],
      answerIndex: 1,
      explain:
        "The script builds its file list with find config/default -type f -name 'core.extension.yml'. When that list is empty it prints '[info]: Configuration files not present.' and exits 0 — it reads exported configuration only and never touches the database or the filesystem for modules. The active variant is the one that queries Drush.",
    },
    {
      question:
        "A site sets tfa.settings to enabled: true with required_roles containing only govcms_site_administrator: govcms_site_administrator. What is the outcome?",
      options: [
        "It passes, because TFA is required for the most privileged role the distribution ships.",
        "It passes only on PaaS, where the TFA assertion is relaxed to any named role.",
        "It fails with '[fail]: TFA is not required for any role', because required_roles must be empty or contain authenticated.",
        "It fails with '[fail]: TFA is not required for authenticated users', because required_roles.authenticated must equal the string 'authenticated'.",
      ],
      answerIndex: 3,
      explain:
        "required_roles is non-empty, so the script moves past the 'not required for any role' branch and reads .authenticated, which is unset. Comparing that to 'authenticated' fails and the script prints '[fail]: TFA is not required for authenticated users' before exiting 1. Only the authenticated key satisfies the assertion, on any offering.",
    },
  ],
};

export default lesson;
