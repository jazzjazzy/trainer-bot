import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "acsc-and-the-security-you-inherit",
  title: "ACSC Standards and the Security Posture You Inherit",
  part: "Why GovCMS Exists",
  estMinutes: 13,
  summary:
    "GovCMS ships a hardening baseline as a profile dependency and then removes your ability to undo it, so the job is knowing which controls are already discharged rather than re-implementing or accidentally disabling them.",
  concept: `## What "secured to ACSC standards" actually buys you

govcms.gov.au sells SaaS security as "Security and compliance (aligned with the Australian Cyber Security Centre)", and its security page states that the platform "has completed an IRAP assessment aligned with the 2019 Australian Government Information Security Manual (ISM) at the OFFICIAL: Sensitive level."

Read the rest of that page before you quote it in an interview. For SaaS customers, "everything is covered. You don't need to undertake your own assessment." For PaaS, "only the infrastructure layer is covered by our IRAP assessment. You are responsible for the IRAP assessment of your Drupal application layer at your own cost."

No GovCMS source publishes a module-to-ISM-control mapping, so do not invent one. What the job actually needs is narrower and more useful: know which hardening is **already discharged**, so you neither rebuild it in a custom module nor knock it over with a config export.

### The kit is a profile dependency, not a shopping list

\`govcms.info.yml\` has exactly one entry under \`dependencies:\` — \`govcms_security\` ("GovCMS Security Kit"). That one module drags in the whole baseline:

\`\`\`yaml
dependencies:
  - drupal:ban
  - encrypt:encrypt
  - event_log_track:event_log_track   # plus 7 submodules, incl. _auth, _tfa, _file
  - honeypot:honeypot
  - key:key
  - login_security:login_security
  - password_policy:password_policy   # plus 5 submodules
  - real_aes:real_aes
  - seckit:seckit
  - securitytxt:securitytxt
  - tfa:tfa
  - username_enumeration_prevention:username_enumeration_prevention
\`\`\`

Because these are profile dependencies they are on from install. \`shield\`, \`captcha\` and \`recaptcha\` are bundled by the distribution and sit on the \`managed_modules\` allowlist but are *not* installed — those are deliberate gaps you may close.

### govcms_security is mostly hook_form_alter() with a padlock

The kit's real work is removing your ability to undo the baseline:

- the TFA settings form hides \`tfa_enabled\` and \`tfa_required_roles\` for every user except uid 1, and caps \`validation_skip\` at 10
- the security.txt form pins \`enabled\` to 1 and sets \`#access\` FALSE on the checkbox
- the config-import UI's submit button is removed: "Configuration import is blocked via govcms_security module."
- uid 1's user entity is access-denied unless \`$settings['govcms_security_super_ui']\` is set
- \`hook_update_projects_alter()\` and \`hook_cron()\` empty \`update_available_releases\`, so the Available Updates report is deliberately blind

Platform settings layer more on top. \`production.settings.php\` sets \`tfa.settings.enabled\` and \`required_roles.authenticated\` when \`GOVCMS_TFA_ENFORCE\` is present; \`all.settings.php\` turns seckit's HSTS on with a one-year max-age for \`*.gov.au\` and \`*.org.au\` hosts and explicitly off otherwise; \`security.settings.php\` forces \`event_log_track\` output to \`watchdog\` with DB logging disabled — which is why \`dblog\` is a disallowed module.

### The failure mode to avoid

The common own-goal is exporting configuration that fights the platform. \`config_ignore\` ships enabled with \`seckit.settings\`, \`login_security.settings\` and \`password_policy.*\` in its list, so those never round-trip through a config import at all. Treat the baseline as read-only and spend your effort where it does not reach: your theme, your webforms, your roles, your content.`,
  comparisons: [
    {
      label: "Standing up the hardening baseline",
      intro:
        "You are starting a new Australian government site and need the usual security module set installed and configured. On vanilla Drupal that is a decision, a composer run and an export. On GovCMS it is already true before you clone the repo.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# Vanilla Drupal 11: you choose the baseline, install it, and own it forever.
composer require drupal/seckit drupal/tfa drupal/password_policy drupal/login_security
composer require drupal/honeypot drupal/securitytxt drupal/username_enumeration_prevention
composer require drupal/key drupal/encrypt drupal/real_aes
# ban needs no require -- it is a core module through Drupal 11 and only moves
# to contrib for Drupal 12, so you just install it.

drush -y pm:install seckit tfa password_policy password_policy_length login_security
drush -y pm:install honeypot securitytxt username_enumeration_prevention key encrypt
drush -y pm:install real_aes ban

# Configure each module by hand at /admin/config/security, then export it
# so the policy actually deploys with the site.
drush -y config:export
git add config/sync
git commit -m "Add security baseline"`,
      ts: `# GovCMS: the baseline is a dependency of the install profile.

# govcms.info.yml -- the profile's entire dependencies list is one line.
dependencies:
  - govcms_security

# govcms_security.info.yml -- "GovCMS Security Kit", the distribution's only
# custom module. Installing the profile installs all of this.
name: GovCMS Security Kit
type: module
package: GovCMS
dependencies:
  - drupal:ban
  - encrypt:encrypt
  - event_log_track:event_log_track
  - event_log_track:event_log_track_auth
  - event_log_track:event_log_track_tfa
  - event_log_track:event_log_track_file
  - honeypot:honeypot
  - key:key
  - login_security:login_security
  - password_policy:password_policy
  - password_policy:password_policy_length
  - real_aes:real_aes
  - seckit:seckit
  - securitytxt:securitytxt
  - tfa:tfa
  - username_enumeration_prevention:username_enumeration_prevention`,
      note: "On GovCMS the correct first move is an inventory, not an install: run `ahoy drush pm:list --status=enabled` and find out what you already have before you require anything.",
    },
    {
      label: "Enforcing two-factor authentication",
      intro:
        "TFA is required on the platform. The difference is not whether it is on — it is who is allowed to turn it off, and where that decision physically lives.",
      php: `// Vanilla Drupal: TFA is ordinary config. You set the policy, export it,
// and anyone holding 'admin tfa settings' can walk it straight back.
$config = \\Drupal::configFactory()->getEditable('tfa.settings');
$config->set('enabled', TRUE);
$config->set('required_roles', ['authenticated' => 'authenticated']);
$config->save();

// The exported tfa.settings.yml is the source of truth, and it round-trips:
//   drush -y config:export   ->  git diff  ->  drush -y config:import
// Nothing stops an admin editing /admin/config/people/tfa and re-exporting
// the weaker value on top of yours.`,
      ts: `// GovCMS layer 1: scaffold-tooling ships drupal/settings/production.settings.php,
// which asserts the policy from the settings layer on every request.
if (!empty(getenv('GOVCMS_TFA_ENFORCE'))) {
  $config['tfa.settings']['enabled'] = TRUE;
  if (empty(getenv('GOVCMS_TFA_DISABLE_REQUIRED_ROLES'))) {
    $config['tfa.settings']['required_roles']['authenticated'] = 'authenticated';
    $config['user.role.authenticated']['permissions'][999999] = 'setup own tfa';
  }
}

// GovCMS layer 2: govcms_security removes the off switch from the UI.
function govcms_security_form_tfa_settings_form_alter(&$form, \\Drupal\\Core\\Form\\FormStateInterface $form_state) {
  // Remove site admin's ability to disable TFA or change the required roles.
  if (\\Drupal::currentUser()->id() != 1) {
    $form['tfa_enabled']['#access'] = FALSE;
    $form['tfa_required_roles']['#access'] = FALSE;
  }
  // Limit the max validation skip to 10.
  $form['users_without_tfa']['validation_skip']['#max'] = 10;
}`,
      note: "Both GovCMS validators assert exactly two things: `enabled` is truthy and `required_roles.authenticated` equals `authenticated` — one role, meaning every logged-in user, not a per-privileged-role policy.",
    },
    {
      label: "Keeping hardening settings from drifting",
      intro:
        "Same goal on both sides: make sure the security settings that are live match the ones in the repo. Vanilla Drupal solves it with the config workflow; GovCMS deliberately takes those objects out of the workflow entirely.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Vanilla Drupal: hardening is exported config like anything else.
# config/sync/seckit.settings.yml
seckit_xss:
  csp:
    checkbox: 1
    default-src: "'self'"
    report-uri: '/report-csp-violation'
seckit_clickjacking:
  x_frame: 'SAMEORIGIN'
seckit_ssl:
  hsts: true
  hsts_max_age: 31536000
  hsts_subdomains: false

# A diff in this file is a reviewable, deployable change.
# Drift between the database and the repo is a bug you fix with config:import.`,
      ts: `# GovCMS: config/install/config_ignore.settings.yml, installed by the profile.
mode: simple
ignored_config_entities:
  - 'clamav.settings'
  - 'login_security.settings'
  - 'password_policy.*'
  - 'seckit.settings'
  - 'system.menu.*'
  - 'webform.webform.*'
  - 'webform.webform_options.*'

# So a seckit.settings.yml sitting in config/default is inert -- the deploy's
# config import step skips it. And the settings layer wins over the database
# anyway: all.settings.php re-asserts HSTS on every request for .gov.au hosts.
#   $config['seckit.settings']['seckit_ssl']['hsts'] = TRUE;
#   $config['seckit.settings']['seckit_ssl']['hsts_max_age'] = 31536000;
# security.settings.php does the same for the CSP report URI from GOVCMS_CSP_URI.`,
      note: "If you export login_security or password_policy config and open a PR claiming it hardens the site, you have shipped a no-op — and told the reviewer you have never deployed to the platform.",
    },
    {
      label: "Finding out a security release is due",
      intro:
        "A CVE lands in a contrib module you use. On a site you control, the update module tells you. On GovCMS the update module is disallowed and the kit actively blinds the available-releases cache.",
      leftLang: "bash",
      rightLang: "php",
      php: `# Vanilla Drupal: you own patching end to end.
drush -y pm:install update
composer audit                # Drush 11's pm:security is gone from Drush 12+
composer update drupal/core-recommended drupal/seckit --with-dependencies
drush -y updatedb
drush -y cache:rebuild
drush -y config:export

# /admin/reports/updates stays green, and cron re-checks drupal.org for you.`,
      ts: `// GovCMS: 'update' is on the validators' disallowed list alongside dblog,
// module_permissions_ui and statistics -- and govcms_security makes sure the
// data would be empty even if someone enabled it.
function govcms_security_update_projects_alter(&$projects) {
  \\Drupal::keyValueExpirable('update_available_releases')->deleteAll();
  \\Drupal::keyValueExpirable('update_available_releases')->setMultiple([]);
  $projects = [];
}

function govcms_security_cron() {
  \\Drupal::keyValueExpirable('update_available_releases')->deleteAll();
  \\Drupal::keyValueExpirable('update_available_releases')->setMultiple([]);
}

// Where patching actually happens:
//   SaaS -- the platform rebuilds and rolls out the distribution. Your image
//           is only themes/, config/ and favicon.ico, so you cannot ship a
//           module patch even if you wanted to.
//   PaaS -- the distribution is a composer dependency of your project
//           (govcms/govcms, tracked on 4.x-master-dev in the scaffold), so you
//           pull the new distribution and deploy it yourself. govcms.gov.au:
//           PaaS customers are responsible for "Security updates and patching".`,
      note: "The interview answer is the split, not the hook: on SaaS the module layer is Finance's to patch; on PaaS 'only the infrastructure layer is covered by our IRAP assessment' and the Drupal application layer is yours.",
    },
  ],
  playground: {
    intro:
      "A coverage checker over the distribution's actual module sets. Group each bundled security module by the hardening capability it provides (this grouping is a reading aid — GovCMS publishes no module-to-ISM-control mapping), then ask which capabilities the profile already discharges and which are left to you.",
    lang: "php",
    code: `<?php

// Every module below is bundled by the GovCMS 4.x distribution. The value is
// the hardening capability it provides -- a reading aid for reasoning about
// coverage, NOT an ACSC ISM control mapping. GovCMS publishes no such mapping.
$provides = [
  'seckit'                          => 'browser-side response headers',
  'tfa'                             => 'multi-factor authentication',
  'password_policy'                 => 'credential strength and reuse',
  'login_security'                  => 'repeat login-failure response',
  'ban'                             => 'repeat login-failure response',
  'username_enumeration_prevention' => 'account-existence disclosure',
  'honeypot'                        => 'automated form submission',
  'key'                             => 'secret storage and encryption',
  'encrypt'                         => 'secret storage and encryption',
  'real_aes'                        => 'secret storage and encryption',
  'event_log_track'                 => 'security event audit trail',
  'securitytxt'                     => 'vulnerability disclosure contact',
  'shield'                          => 'pre-authentication environment gate',
  'recaptcha'                       => 'interactive challenge on public forms',
];

// On because govcms_security lists them in its dependencies, and
// govcms_security is the install profile's only dependency.
$enabled = [
  'seckit', 'tfa', 'password_policy', 'login_security', 'ban',
  'username_enumeration_prevention', 'honeypot', 'key', 'encrypt',
  'real_aes', 'event_log_track', 'securitytxt',
];

// Bundled AND on the managed_modules allowlist, but not installed by the
// profile. These are the ones a site may turn on for itself.
$allowlisted = ['shield', 'recaptcha'];

// Invert module -> capability into capability -> modules.
$areas = [];
foreach ($provides as $module => $area) {
  $areas[$area][] = $module;
}

printf("%-38s %-8s %s\\n", 'HARDENING CAPABILITY', 'STATUS', 'MODULES');
printf("%s\\n", str_repeat('-', 78));

$covered = 0;
$gaps = [];
foreach ($areas as $area => $modules) {
  $on = array_values(array_intersect($modules, $enabled));
  if ($on) {
    $covered++;
    printf("%-38s %-8s %s\\n", $area, 'COVERED', 'by ' . implode(', ', $on));
    continue;
  }
  $fix = array_values(array_intersect($modules, $allowlisted));
  $gaps = array_merge($gaps, $fix);
  $how = $fix ? 'allowlisted, not installed: ' . implode(', ', $fix) : 'no bundled module';
  printf("%-38s %-8s %s\\n", $area, 'GAP', $how);
}

$total = count($areas);
printf("%s\\n", str_repeat('-', 78));
printf("inherited: %d of %d capabilities (%d%%) -- do not re-implement these\\n",
  $covered, $total, (int) round(100 * $covered / $total));
printf("your call: %d capability gap(s)\\n", $total - $covered);

if ($gaps) {
  printf("\\nclose the gaps (each is already on the managed_modules allowlist):\\n");
  printf("  ahoy drush -y pm:install %s\\n", implode(' ', $gaps));
  printf("  ahoy drush -y config:export   # then commit config/default and deploy\\n");
}`,
    output: `HARDENING CAPABILITY                   STATUS   MODULES
------------------------------------------------------------------------------
browser-side response headers          COVERED  by seckit
multi-factor authentication            COVERED  by tfa
credential strength and reuse          COVERED  by password_policy
repeat login-failure response          COVERED  by login_security, ban
account-existence disclosure           COVERED  by username_enumeration_prevention
automated form submission              COVERED  by honeypot
secret storage and encryption          COVERED  by key, encrypt, real_aes
security event audit trail             COVERED  by event_log_track
vulnerability disclosure contact       COVERED  by securitytxt
pre-authentication environment gate    GAP      allowlisted, not installed: shield
interactive challenge on public forms  GAP      allowlisted, not installed: recaptcha
------------------------------------------------------------------------------
inherited: 9 of 11 capabilities (82%) -- do not re-implement these
your call: 2 capability gap(s)

close the gaps (each is already on the managed_modules allowlist):
  ahoy drush -y pm:install shield recaptcha
  ahoy drush -y config:export   # then commit config/default and deploy
`,
  },
  keyPoints: [
    "The verifiable security claims are narrow: SaaS security and compliance is described as aligned with the Australian Cyber Security Centre, and the platform has completed an IRAP assessment aligned with the 2019 ISM at OFFICIAL: Sensitive. No GovCMS source maps modules to named ISM controls, so neither should you.",
    "For SaaS the IRAP assessment covers everything; for PaaS it covers only the infrastructure layer and the Drupal application layer is the agency's to assess at its own cost.",
    "The whole baseline arrives as one profile dependency, govcms_security ('GovCMS Security Kit'), which pulls in ban, encrypt, event_log_track, honeypot, key, login_security, password_policy, real_aes, seckit, securitytxt, tfa and username_enumeration_prevention plus their submodules.",
    "govcms_security spends most of its code taking the off switches away: TFA's enabled and required-roles controls are hidden from everyone but uid 1, security.txt's enable checkbox is forced on and made inaccessible, and the config-import UI's submit button is removed outright.",
    "seckit.settings, login_security.settings and password_policy.* are in config_ignore's default list, so exporting them is a no-op — and the settings layer (HSTS for .gov.au hosts, the CSP report URI, TFA enforcement) overrides the database regardless.",
    "shield, captcha and recaptcha are bundled and allowlisted but not installed — those are real gaps you may close yourself; simple_oauth, jsonapi, config_split and recaptcha_v3 are bundled, not installed and not on the allowlist, so they are not self-serve.",
  ],
  interview: [
    {
      q: "GovCMS says it is secured to ACSC standards. As a developer, what does that actually change about your work?",
      a: "It means the hardening layer is already built and, on SaaS, assessed — govcms.gov.au describes SaaS security and compliance as aligned with the Australian Cyber Security Centre, and states the platform has completed an IRAP assessment aligned with the 2019 ISM at the OFFICIAL: Sensitive level. Practically, my job stops being *choosing* a security baseline and becomes *not disturbing* one: seckit, tfa, password_policy, login_security, honeypot, username_enumeration_prevention, key/encrypt/real_aes, event_log_track and securitytxt are all installed as dependencies of `govcms_security`, which is the profile's single dependency. So on day one I run an inventory rather than a composer require. The nuance I'd flag is scope: for PaaS the IRAP assessment covers only the infrastructure layer, and the agency owns assessing its own Drupal application layer at its own cost — which is exactly the conversation that decides whether custom code is affordable.",
    },
    {
      q: "A client on GovCMS SaaS wants CAPTCHA on a public contact form and asks you to write a module for it. How do you respond?",
      a: "First, check whether it's already bundled — `captcha` and `recaptcha` both ship with the distribution and both are on the `managed_modules` allowlist, so this is a config change, not a build. Second, point out that `honeypot` is already installed as a `govcms_security` dependency, so there may already be spam mitigation on that form and the real requirement may be an interactive challenge rather than any mitigation at all. Third, on SaaS a custom module is not deliverable anyway: the SaaS image copies only `themes/`, `config/` and `favicon.ico`, so a module in the repo never reaches the container. I'd enable recaptcha locally, export the change into `config/default`, and deploy it through the normal config import. I'd also note that `recaptcha_v3` is bundled but not on the allowlist, so I would not promise the v3 flavour without confirming it with GovCMS first.",
    },
    {
      q: "How is two-factor authentication enforced on GovCMS, and what would you check if a client reported that it wasn't being applied?",
      a: "Enforcement is two layers. `production.settings.php` from scaffold-tooling sets `tfa.settings.enabled` to TRUE and `required_roles.authenticated` to `authenticated` when the `GOVCMS_TFA_ENFORCE` environment variable is set, and it injects the `setup own tfa` permission into the authenticated role; `govcms_security` then hides the `tfa_enabled` and `tfa_required_roles` form elements from every user except uid 1, so it cannot be switched off from the UI. Note the assertion is deliberately blunt — one role, `authenticated`, meaning every logged-in user, not a per-privileged-role policy. If it looked inactive I'd check the environment variables first (`GOVCMS_TFA_ENFORCE`, and `GOVCMS_TFA_DISABLE_REQUIRED_ROLES` which suppresses the role half), then confirm the authenticated role actually holds `setup own tfa`, because the platform validation checks that too.",
    },
    {
      q: "You inherit a GovCMS project and find seckit.settings.yml and password_policy.*.yml committed in config/default. What is wrong and what do you do?",
      a: "Nothing is technically broken, but those files are inert and misleading. `config_ignore` is installed by the profile with `seckit.settings`, `login_security.settings` and `password_policy.*` in its default ignore list, so the deploy's config import step skips them — a reviewer approving a 'hardening' PR built on those files is approving a no-op. Worse, they create false confidence: the values that are actually live come from the settings layer, which overrides the database on every request. I'd remove them from `config/default`, document in the repo README that the security baseline is platform-owned, and if a genuinely different policy is required, raise it with GovCMS rather than trying to route around config_ignore. That last part is the tell — knowing when the answer is a support ticket rather than a commit.",
    },
  ],
  quiz: [
    {
      question:
        "Which of these security modules is bundled by GovCMS 4.x but NOT installed on a fresh site?",
      options: ["seckit", "securitytxt", "shield", "username_enumeration_prevention"],
      answerIndex: 2,
      explain:
        "seckit, securitytxt and username_enumeration_prevention are all listed in govcms_security.info.yml's dependencies, and govcms_security is the install profile's only dependency, so they are on from install. shield is bundled by the distribution and appears on the managed_modules allowlist, but nothing installs it for you.",
    },
    {
      question: "What does govcms_security do to the TFA settings form?",
      options: [
        "Sets #access to FALSE on tfa_enabled and tfa_required_roles for every user except uid 1",
        "Adds a separate required-roles checkbox for each privileged role on the site",
        "Removes the /admin/config/people/tfa route entirely",
        "Makes the whole form read-only for any user lacking 'admin tfa settings'",
      ],
      answerIndex: 0,
      explain:
        "govcms_security_form_tfa_settings_form_alter() hides exactly two elements, tfa_enabled and tfa_required_roles, for any user whose id is not 1, and caps validation_skip at 10. The route stays reachable — you can still see the settings, you just cannot turn the policy off.",
    },
    {
      question:
        "seckit.settings appears in the profile's default config_ignore list. What follows from that?",
      options: [
        "seckit is uninstalled automatically on production environments",
        "seckit's settings are encrypted at rest by real_aes before being stored",
        "The seckit configuration form is hidden from all users except uid 1",
        "A seckit.settings.yml committed in config/default is never applied by the deploy's config import",
      ],
      answerIndex: 3,
      explain:
        "config_ignore ships enabled in mode: simple with seckit.settings, login_security.settings and password_policy.* listed, so the config import step skips those objects. Exporting them looks like a change but deploys nothing — and the settings layer re-asserts values like HSTS on every request anyway.",
    },
    {
      question:
        "A PaaS customer asks how much of their site is covered by the GovCMS IRAP assessment. What is the accurate answer?",
      options: [
        "All of it, exactly as for SaaS — the assessment is platform-wide",
        "Only the infrastructure layer; the Drupal application layer is theirs to assess at their own cost",
        "None of it — IRAP applies only to SaaS subscriptions",
        "Everything except custom themes, which each agency assesses separately",
      ],
      answerIndex: 1,
      explain:
        "govcms.gov.au's security page states that for SaaS customers 'everything is covered', while for PaaS customers 'only the infrastructure layer is covered by our IRAP assessment' and the customer is 'responsible for the IRAP assessment of your Drupal application layer at your own cost'. That split is the whole commercial difference between the two offerings.",
    },
  ],
};

export default lesson;
