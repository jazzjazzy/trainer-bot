import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "auditing-a-project",
  title: "Auditing an Unfamiliar Drupal Project",
  part: "Safety & Operations",
  estMinutes: 13,
  summary:
    "A fixed, ordered first-day checklist for a Drupal site you have just inherited — Composer, config/sync, core.extension, contrib patches, deploy path, tests, versions, secrets, drift, security — and how each answer changes the risk of the next deploy.",

  concept: `
You have been handed the keys to a Drupal 10 site nobody on your team built. The
first deploy you do will either be uneventful or career-defining, and the
difference is entirely knowable in about two hours. Work the list **in order** —
each step tells you whether the next answer can even be trusted.

## The order, and why it is that order

**1. Is it a Composer project, and is \`composer.lock\` committed?** Run
\`composer validate --strict\` and check git. No lock file means "the code that
runs in production is whatever Composer resolved on the day someone last ran
\`composer update\`" — you cannot reproduce the build, so nothing downstream is
reproducible either. Worse is a site with no \`composer.json\` at all (core and
contrib dragged in by hand). That is the whole first sprint.

**2. Is there a sync directory, and is it current?** Look for
\`$settings['config_sync_directory']\` in \`settings.php\` and for YAML in git.
Then \`drush config:status\`, which compares the active store against those files:

\`\`\`bash
$ drush config:status
 -------------------------- -------------------
  Name                       State
 -------------------------- -------------------
  system.site                Different
  views.view.press_room      Only in DB
  webform.webform.contact    Only in sync dir
 -------------------------- -------------------
\`\`\`

Clean output on a fresh dev build is the single best signal that this site is
deployable. Two hundred *Only in DB* rows means the export is fiction and the
previous team clicked in production.

**3. Does \`core.extension\` match reality?** Diff the \`module\` keys in
\`config/sync/core.extension.yml\` against \`drush pm:list --status=enabled\` and
against what Composer actually installs. A module enabled in config but absent
from \`composer.json\` is a hard failure on the next \`drush cim\` on a fresh
environment.

**4. Has contrib been edited in place?** Re-run \`composer install\` into a clean
checkout and diff \`web/modules/contrib\`. Anything that differs is an
undocumented patch that will silently vanish on the next update — the fix is to
extract it to a \`.patch\` file and declare it under
\`extra.patches\` for \`cweagans/composer-patches\`.

**5. Is there a deploy script?** One command, in the repo, that runs the same
steps everywhere. If deployment is a wiki page with eleven manual steps, or
\`git pull\` over SSH, assume steps get skipped under pressure.

**6. Tests and CI?** Even one kernel test running on every PR proves the app can
be built from scratch. No CI usually means no reproducible build, which loops
you back to step 1.

**7. Supported versions?** \`drush status\` gives you Drupal and PHP. Drupal 11
requires PHP 8.3 or newer; Drupal 10 runs from PHP 8.1. Being two minor releases
behind often means you are already outside core's security window — check the
current release-cycle policy on drupal.org rather than guessing.

**8. Secrets.** Grep git history, not just \`HEAD\`, for database credentials and
API keys. A key in history is an incident, not a cleanup task.

**9. Drift and security, together.** Copy production's database down, import it
locally, and run \`drush config:status\` plus \`composer audit\`. Now you know both
what production believes and how exposed it is.

## What you do with the answers

Write it up as a dependency graph, not a list. You cannot honestly patch a
security advisory until Composer owns the dependency tree, and you cannot trust
\`config:status\` until \`core.extension\` is sane. Fix in waves, deploy something
trivial early to prove the pipeline, and only then touch anything interesting.
`,

  comparisons: [
    {
      label: "The first ten minutes",
      intro:
        "Same reconnaissance, two ecosystems. In Symfony you are reading files; in Drupal half the truth lives in a database, so you need a database copy before several of these commands mean anything.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: everything that matters is on disk and in git.
composer validate --strict
git log -1 --format='%h %ad %s' -- composer.lock

# What is wired up, and does the container even build?
bin/console about
bin/console debug:container --env=prod | head
bin/console lint:container

# Schema state: are migrations current, does the mapping match the DB?
bin/console doctrine:migrations:status
bin/console doctrine:schema:validate

# Per-environment overrides are just files you can read.
ls config/packages/ config/packages/prod/
cat .env            # committed defaults
git log --all -- .env.local   # should return NOTHING`,
      ts: `# Drupal: read the repo, then get a production DB copy — several of
# these answers only exist in the database.
composer validate --strict
git log -1 --format='%h %ad %s' -- composer.lock
ls web/modules/contrib | wc -l        # 0 here = contrib is not Composer-managed

# Where does this site think its config lives?
grep -n "config_sync_directory" web/sites/default/settings.php
ls config/sync/*.yml | wc -l          # 0 = there is no config workflow at all

# Now with a prod DB imported locally:
drush status                          # Drupal + PHP version, DB driver, docroot
drush config:status                   # Identical / Different / Only in DB / Only in sync dir
drush pm:list --status=enabled --no-core --format=list
drush core:requirements --severity=1  # what the status report is already shouting about

# Is anything overriding config at runtime?
grep -rn "config\\['" web/sites/default/settings.php web/sites/default/settings.local.php`,
      note:
        "The Drupal column has a prerequisite the Symfony one does not: without a recent production database, config:status, pm:list and core:requirements describe someone's laptop, not the site you are responsible for.",
    },
    {
      label: "Is the dependency tree honest?",
      intro:
        "You are looking for the same red flag in both: code in vendor/ that does not match what the lock file says should be there. Drupal projects hit it far more often because patching contrib is normal practice.",
      leftLang: "js",
      rightLang: "js",
      php: `// Symfony — composer.json. Patching a vendor package is unusual,
// so a divergence usually means someone edited vendor/ by hand.
{
  "require": {
    "php": ">=8.2",
    "symfony/framework-bundle": "7.1.*",
    "doctrine/orm": "^3.2"
  },
  "config": { "sort-packages": true },
  "extra": {
    "symfony": { "allow-contrib": false, "require": "7.1.*" }
  }
}

// Detection:
//   rm -rf vendor && composer install
//   git status --porcelain vendor/     -> must be empty
//   composer audit                     -> known CVEs in the lock file
// If vendor/ is committed to git AND dirty, treat every package as suspect.`,
      ts: `// Drupal — composer.json. Patching contrib IS the workflow, so the
// question is not "are there patches" but "are they declared".
{
  "require": {
    "php": ">=8.3",
    "composer/installers": "^2.3",
    "cweagans/composer-patches": "^1.7",
    "drupal/core-composer-scaffold": "^11.1",
    "drupal/core-recommended": "^11.1",
    "drupal/paragraphs": "^1.18"
  },
  "extra": {
    "installer-paths": {
      "web/core": ["type:drupal-core"],
      "web/modules/contrib/{$name}": ["type:drupal-module"]
    },
    "patches": {
      "drupal/paragraphs": {
        "3216517 - Duplicated paragraphs on translated nodes":
          "patches/paragraphs-3216517-32.patch"
      }
    }
  }
}

// Detection — ONLY if contrib is committed to git:
//   rm -rf web/core web/modules/contrib && composer install
//   git status --porcelain web/            -> must be empty
//   composer audit
// In a stock drupal/recommended-project, web/core and web/modules/contrib
// are gitignored, so git status comes back empty no matter how badly
// contrib was hacked. There, install the locked packages into a pristine
// tree and compare instead:
//   git worktree add /tmp/pristine HEAD && cd /tmp/pristine
//   composer install --no-dev
//   diff -ru /tmp/pristine/web/modules/contrib web/modules/contrib
// Either way, any difference = an undeclared patch that will disappear on
// the next security update.`,
      note:
        "Undeclared patches are the classic Drupal regression: you apply a security update, the hand-edit is overwritten, the bug it fixed comes back weeks later and nobody connects the two events. Extract every diff into patches/ and declare it before you update anything.",
    },
    {
      label: "How is per-environment configuration actually done?",
      intro:
        "Both teams need dev to differ from prod. Symfony resolves that at build time from files; Drupal resolves it at runtime from settings.php overrides and an optional config_split, and that difference is what you are auditing for.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# Symfony — declarative, per-environment, all in git.
# config/packages/monolog.yaml
monolog:
  handlers:
    main: { type: stream, path: "%kernel.logs_dir%/%kernel.environment%.log" }

# config/packages/dev/web_profiler.yaml   <- dev only, cannot ship to prod
web_profiler:
  toolbar: true

# config/packages/prod/doctrine.yaml
doctrine:
  orm:
    metadata_cache_driver: { type: pool, pool: doctrine.system_cache_pool }

# Audit questions:
#   - does config/packages/prod/ exist and is it reviewed?
#   - APP_ENV / APP_DEBUG on the prod host?
#   - anything reading getenv() outside config/?`,
      ts: `<?php
// Drupal — one exported config set, plus runtime overrides in settings.php.
// web/sites/default/settings.php (tail)
$settings['config_sync_directory'] = '../config/sync';

// Runtime overrides. These win over active config but are NEVER exported,
// so drush cex will not notice them and drush cim will not revert them.
$config['system.logging']['error_level'] = 'verbose';
$config['system.performance']['css']['preprocess'] = FALSE;
$config['stage_file_proxy.settings']['origin'] = 'https://www.example.com';

if (file_exists($app_root . '/' . $site_path . '/settings.local.php')) {
  include $app_root . '/' . $site_path . '/settings.local.php';
}

// Audit questions:
//   - is settings.php in git, and is settings.local.php gitignored?
//   - which modules are dev-only, and is config_split (or a profile of
//     ignored items) keeping devel//webprofiler out of production?
//   - does anything override config that SHOULD be exported instead?
//     (drush config:get <name> shows the raw active value with
//      settings.php overrides NOT applied; add --include-overridden to
//      see the value the site actually uses, and the difference between
//      the two runs is your override)`,
      note:
        "Red flag: a settings.php full of $config[] overrides for things that are ordinary site configuration. Overrides are invisible to the export workflow, so every one of them is a value that no code review will ever see change.",
    },
    {
      label: "Where do the secrets live?",
      intro:
        "The one check where a bad answer is an incident rather than technical debt. Look in git history, not just the current checkout.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony
cat .env                     # committed: defaults only, no real values
git log --all --oneline -- .env.local .env.prod.local   # must be empty

# Real secrets come from the vault or the environment:
bin/console secrets:list --reveal    # run ONLY on a machine allowed to see them
printenv | grep -E 'DATABASE_URL|APP_SECRET|MAILER_DSN'

# The scan that actually matters — history, not HEAD:
git log -p --all -S 'DATABASE_URL=postgres' -- .env .env.local | head`,
      ts: `# Drupal
git ls-files | grep -E 'settings\\.php|settings\\.local\\.php|services\\.yml'
grep -n "'password'" web/sites/default/settings.php

# settings.php SHOULD read from the environment, not hold literals:
#   $databases['default']['default'] = [
#     'password' => getenv('DB_PASSWORD'), ...
#   ];
#   $settings['hash_salt'] = getenv('DRUPAL_HASH_SALT');

# History scan — a rotated key in git history is still leaked:
git log -p --all -S 'hash_salt' -- web/sites/default/settings.php | head
git log --all --oneline -- web/sites/default/files   # private files in git?

# And the API keys people hide in exported config:
grep -rniE 'api_key|secret|token|password' config/sync/*.yml | head`,
      note:
        "That last grep finds more than you expect: contrib modules happily export API keys into config YAML. The fix is key (the Key module) or an environment-variable override in settings.php, plus rotating anything already committed.",
    },
  ],

  playground: {
    intro:
      "The audit is only useful if it produces an ordered plan. This models the twelve checks as a dependency graph — each check names the checks that must be green before it can honestly be fixed — then groups the failures into waves you can actually schedule.",
    lang: "php",
    code: `<?php

// Day one on an inherited Drupal site. Twelve checks, the answer we actually
// got, the blast radius if it stays broken, and which checks must be GREEN
// before this one can honestly be fixed ("needs" = fix those first).
$checks = [
  'composer_project' => ['ok' => false, 'risk' => 10, 'needs' => [],                                     'q' => 'Composer project, composer.lock committed'],
  'lock_matches'     => ['ok' => false, 'risk' => 6,  'needs' => ['composer_project'],                   'q' => 'composer.lock matches composer.json'],
  'contrib_clean'    => ['ok' => false, 'risk' => 8,  'needs' => ['composer_project'],                   'q' => 'No hand-edited contrib (patches declared)'],
  'security_current' => ['ok' => false, 'risk' => 10, 'needs' => ['lock_matches', 'contrib_clean'],      'q' => 'No outstanding security advisories'],
  'versions_ok'      => ['ok' => true,  'risk' => 9,  'needs' => ['security_current'],                   'q' => 'PHP and Drupal on supported versions'],
  'sync_dir'         => ['ok' => true,  'risk' => 9,  'needs' => [],                                     'q' => 'config/sync exists and is in git'],
  'extension_sane'   => ['ok' => false, 'risk' => 7,  'needs' => ['sync_dir', 'composer_project'],       'q' => 'core.extension matches what is installed'],
  'status_clean'     => ['ok' => false, 'risk' => 5,  'needs' => ['sync_dir', 'extension_sane'],         'q' => 'drush config:status clean on dev'],
  'prod_no_drift'    => ['ok' => false, 'risk' => 6,  'needs' => ['status_clean'],                       'q' => 'No config drift on production'],
  'secrets_ok'       => ['ok' => false, 'risk' => 10, 'needs' => [],                                     'q' => 'Secrets out of git, injected per env'],
  'deploy_script'    => ['ok' => false, 'risk' => 7,  'needs' => ['status_clean', 'secrets_ok'],         'q' => 'One scripted, repeatable deploy path'],
  'ci_tests'         => ['ok' => false, 'risk' => 4,  'needs' => ['lock_matches', 'deploy_script'],      'q' => 'Tests exist and run in CI'],
];

echo "=== Audit report ===\\n";
$exposure = 0;
foreach ($checks as $id => $c) {
  printf("%-6s %-18s %s\\n", $c['ok'] ? '[PASS]' : '[FAIL]', $id, $c['q']);
  if (!$c['ok']) {
    $exposure += $c['risk'];
  }
}
printf("\\nUnmitigated risk: %d of %d points\\n", $exposure, array_sum(array_column($checks, 'risk')));

// Remediation order: Kahn's algorithm over the FAILING checks only. A wave is
// everything whose prerequisites are already green, so a wave is safe to do in
// parallel — and anything that never becomes ready is a cycle you must break.
$todo = array_filter($checks, fn(array $c): bool => !$c['ok']);
echo "\\n=== Fix order ===\\n";
$wave = 0;
while ($todo) {
  $ready = array_keys(array_filter(
    $todo,
    fn(array $c): bool => !array_intersect($c['needs'], array_keys($todo))
  ));
  if (!$ready) {
    echo "Deadlocked, break the cycle by hand: " . implode(', ', array_keys($todo)) . "\\n";
    break;
  }
  sort($ready);
  printf("Wave %d: %s\\n", ++$wave, implode(', ', $ready));
  foreach ($ready as $id) {
    unset($todo[$id]);
  }
}

echo "\\nStart at wave 1. Nothing above it is trustworthy until those are green.\\n";
`,
    output: `=== Audit report ===
[FAIL] composer_project   Composer project, composer.lock committed
[FAIL] lock_matches       composer.lock matches composer.json
[FAIL] contrib_clean      No hand-edited contrib (patches declared)
[FAIL] security_current   No outstanding security advisories
[PASS] versions_ok        PHP and Drupal on supported versions
[PASS] sync_dir           config/sync exists and is in git
[FAIL] extension_sane     core.extension matches what is installed
[FAIL] status_clean       drush config:status clean on dev
[FAIL] prod_no_drift      No config drift on production
[FAIL] secrets_ok         Secrets out of git, injected per env
[FAIL] deploy_script      One scripted, repeatable deploy path
[FAIL] ci_tests           Tests exist and run in CI

Unmitigated risk: 73 of 91 points

=== Fix order ===
Wave 1: composer_project, secrets_ok
Wave 2: contrib_clean, extension_sane, lock_matches
Wave 3: security_current, status_clean
Wave 4: deploy_script, prod_no_drift
Wave 5: ci_tests

Start at wave 1. Nothing above it is trustworthy until those are green.
`,
  },

  keyPoints: [
    "Audit in dependency order, not checklist order: a committed composer.lock and a clean contrib tree come first, because nothing else — security patching, reproducible builds, CI — is trustworthy until Composer owns the codebase.",
    "drush config:status is the single highest-signal command on an unfamiliar site; it reports each item as Identical, Different, Only in DB or Only in sync dir, and a wall of 'Only in DB' means the export is fiction.",
    "core.extension.yml must agree with drush pm:list and with what Composer installs — a module enabled in config but missing from composer.json breaks the first fresh-environment import.",
    "Detect hand-patched contrib by reinstalling from the lock file and diffing: git status --porcelain web/ works only when contrib is committed, and since drupal/recommended-project gitignores web/core and web/modules/contrib you usually have to composer install into a pristine tree and diff -ru against it; any difference is an undeclared patch that the next security update will silently erase.",
    "Runtime $config[] overrides in settings.php are invisible to cex/cim, so a settings.php stuffed with ordinary site settings is a config workflow that nobody can review.",
    "Scan git history — not just HEAD — for credentials, hash_salt and API keys in config/sync; a rotated secret still in history is an incident to report, not a task to backlog.",
  ],

  interview: [
    {
      q: "You inherit a legacy Drupal site with no documentation. Where do you start?",
      a: "I work top-down through a fixed order, because each answer changes what the next one means. First: is it a Composer project with a committed `composer.lock`? If not, nothing is reproducible and that is the whole first piece of work. Second: is there a `config_sync_directory` with YAML in git, and does `drush config:status` come back clean against a production database copy — that one command tells me whether config management is real here or decorative. Third: does `core.extension.yml` agree with `drush pm:list` and with what Composer installs, and has anyone hand-edited `web/modules/contrib`. Then the operational layer: is there a scripted deploy, do tests run in CI, are PHP and Drupal still in support, and where do secrets live. I write the findings up as a dependency graph rather than a list, because you cannot honestly patch a security advisory before Composer owns the tree, and I prove the pipeline with one trivial deploy before touching anything that matters.",
    },
    {
      q: "You run drush config:status on the inherited site and get two hundred items marked 'Only in DB'. What does that tell you, and what do you do?",
      a: "It tells me the exported config in git is stale — the active configuration in the database has hundreds of items that were never exported, which almost always means people have been configuring production through the UI. The dangerous inference is the reverse one: if I run `drush cim` now, anything present in sync but different in the database gets overwritten, and anything the sync directory does not know about can be deleted. So I do not import. I take a production database copy locally, run `drush cex` there to capture reality, and review that diff carefully — it is often a mix of legitimate site building and junk like cache-busting counters. Then I get one environment to the point where `config:status` is clean, make that the baseline commit, and only after that start doing real imports. I would also check whether config_ignore was in play, because it changes what 'Only in DB' means for specific items.",
    },
    {
      q: "How do you tell whether contrib modules on an inherited site have been patched in place, and why does it matter for deployment?",
      a: "Restore exactly what the lock file specifies and compare it against what is actually deployed. If contrib is committed to git, that is: delete `web/core` and `web/modules/contrib`, run `composer install`, then `git status --porcelain web/` — a dirty tree is code somebody edited by hand. I would say that precondition out loud, because in the standard drupal/recommended-project layout those directories are gitignored and git status comes back empty however badly contrib was hacked. In that case I install the locked packages into a pristine directory instead — `composer install --no-dev` in a fresh clone or a `git worktree` checkout — and `diff -ru` that tree against `web/modules/contrib`. Any difference is an undeclared patch. It matters because contrib directories are rebuilt from the registry on every install: the moment I apply a security update, those edits vanish, and the bug they fixed reappears days later with nothing linking the two events. The fix is to capture each diff as a `.patch` file in the repo and declare it under `extra.patches` for `cweagans/composer-patches`, with the drupal.org issue number in the description so the patch can be retired when the fix lands upstream. Until that is done I will not run a security update, because I have no way to know what I am about to destroy.",
    },
    {
      q: "The site is on an old Drupal 10 minor and an old PHP. How do you decide how urgent that is?",
      a: "Two separate questions. First, is the version still receiving security coverage — Drupal's release-cycle policy only covers recent minors, so being a couple behind can mean advisories are being published that will never be patched for you; I check the current policy on drupal.org rather than working from memory. Second, what does the upgrade actually cost, which is a function of contrib compatibility rather than core: I run `composer update --dry-run` against the target constraint and see which contrib modules block it. PHP matters too — Drupal 11 requires PHP 8.3 or newer, while Drupal 10 runs from 8.1, so a PHP bump is often a prerequisite for the core bump rather than a separate project. I would sequence it as: get Composer honest, get patches declared, apply outstanding security releases on the current minor to stop the bleeding, then plan the version jump as its own piece of work with CI in place first.",
    },
  ],

  quiz: [
    {
      question:
        "On an inherited site, `drush config:status` on a fresh import of the production database reports dozens of items as 'Only in DB'. What is the safest immediate action?",
      options: [
        "Run `drush cim` to bring the site in line with the repository",
        "Do not import; export from the production copy first and review that diff to establish a truthful baseline",
        "Delete config/sync and start the configuration workflow from scratch on dev",
        "Add every affected item to config_ignore so imports stop touching them",
      ],
      answerIndex: 1,
      explain:
        "'Only in DB' means active configuration exists that the sync directory does not know about. Importing at that point can delete or overwrite live configuration. The safe move is to export from a production database copy, read the diff to separate real site building from noise, and commit that as the baseline before any import. config_ignore is a deliberate long-term policy for genuinely environment-owned items, not a way to silence an unexamined diff.",
    },
    {
      question:
        "Which check reliably reveals that contrib modules were patched by hand rather than through composer-patches?",
      options: [
        "`composer validate --strict` reports the modified packages",
        "`drush pm:list` shows a version mismatch for the patched module",
        "Deleting web/core and web/modules/contrib, running `composer install`, then checking `git status --porcelain web/`",
        "`drush config:status` lists the module as 'Different'",
      ],
      answerIndex: 2,
      explain:
        "Contrib directories are rebuilt from what the lock file specifies, so reinstalling from the lock file and comparing is the direct test — anything that differs is a hand edit. One precondition: the `git status` form only works if contrib is committed to git. In a stock drupal/recommended-project layout, `web/core` and `web/modules/contrib` are gitignored, so git reports nothing however badly contrib was hacked; there you install the locked packages into a pristine directory instead (`composer install --no-dev` in a fresh clone or `git worktree` checkout) and `diff -ru` that tree against `web/modules/contrib`. `composer validate` only checks composer.json against composer.lock, `drush pm:list` reports the version declared in the .info.yml (which a hand patch usually does not change), and `config:status` compares configuration, not code.",
    },
    {
      question:
        "Why is a settings.php packed with `$config['...']` override lines a finding worth writing up during an audit?",
      options: [
        "Overrides are deprecated and stop working in Drupal 11",
        "Overrides are applied at runtime and never exported, so those values change without ever appearing in a config diff or code review",
        "Overrides slow down every page request because config has to be rebuilt",
        "Overrides are stored in the database and therefore always cause config drift",
      ],
      answerIndex: 1,
      explain:
        "Runtime overrides in settings.php sit on top of active configuration but are invisible to `drush cex` and are not reverted by `drush cim`. They are the right tool for environment-specific values such as verbose error logging or a file-proxy origin, but when ordinary site configuration is set that way, its history and review trail disappear entirely.",
    },
    {
      question:
        "Which item should be fixed first on a site that fails every audit check?",
      options: [
        "Set up CI so that regressions are caught from now on",
        "Apply the outstanding security advisories immediately",
        "Get the codebase under Composer with a committed lock file (and get secrets out of git)",
        "Clean up config drift on production so that `drush cim` is safe",
      ],
      answerIndex: 2,
      explain:
        "Everything else depends on it. Without a reproducible build you cannot apply a security update without risking overwriting undeclared patches, CI has nothing deterministic to build, and a config import cannot be rehearsed on an environment that matches production. Secrets sit in the same first wave because they have no prerequisites and a leak is an incident, not debt.",
    },
  ],
};

export default lesson;
