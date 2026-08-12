import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "hosting-platforms",
  title: "Platform Realities: Managed Drupal Hosting",
  part: "Safety & Operations",
  estMinutes: 13,
  summary:
    "Acquia, Pantheon, Platform.sh and a plain VPS each impose a different deploy pipeline, a different writable filesystem and a different secrets story — so keep the actual deploy logic in one repo script that every platform merely calls.",

  concept: `
Every managed Drupal platform sells you the same bargain: it takes over the boring,
dangerous parts of hosting — builds, per-branch environments, backups, a CDN, a
sanitised database pull — and in exchange it decides *when your code runs, where it
can write, and who owns cron*. Reading a platform as a set of constraints, rather
than as a marketing page, is the skill.

## What you are actually buying

- **A build step you did not write.** Platform.sh runs Composer for you via
  \`build: { flavor: composer }\`. Pantheon's Integrated Composer builds dependencies
  on push when you use a Composer-managed upstream. Acquia Cloud does the opposite:
  it deploys a **build artefact** whose \`vendor/\` is already committed, produced in
  CI by something like \`acli push:artifact\`.
- **Per-branch environments.** Pantheon Multidev, Platform.sh environments branched
  from a parent (code *and* a copy of the data), Acquia CDEs. This is the feature
  that makes reviewing a config change realistic.
- **Sanitised database pulls**, backups and a CDN in front of Drupal's page cache.

## What you give up

- **A fixed deploy pipeline.** You do not choose the hook names. Platform.sh gives
  you \`hooks.build\`, \`hooks.deploy\` (site is not serving traffic) and
  \`hooks.post_deploy\`. Acquia gives you shell scripts in \`hooks/common/post-code-deploy/\`
  invoked with the site and target environment as arguments. Pantheon gives you
  Quicksilver: \`type: webphp\` scripts bound to \`workflows.deploy.after\`, which run
  in the web container under a short timeout — long update runs still belong in CI
  via \`terminus drush\`.
- **A read-only filesystem.** On Platform.sh only declared \`mounts\` are writable;
  on Pantheon, Test and Live are read-only outside the files mount. Anything that
  wants to write into the docroot at runtime — a stray cache directory, a module
  that unpacks assets — fails in production and only in production.
- **Their opinions about layout and cron.** Pantheon's \`web_docroot: true\`, the
  files symlink, the private path; platform-run cron on Pantheon; scheduled jobs
  configured in Acquia's UI. Cron and workers are the classic thing nobody
  documents until the migration.

## Read the platform file as the deploy definition

\`.platform.app.yaml\`, \`pantheon.yml\` and \`hooks/\` are not config trivia — they are
the deployment contract. When you join a project, read them before the README.

## The portability rule

Put the deploy in the repo and let the platform call it:

\`\`\`bash
# scripts/deploy.sh — the only place the deploy actually lives
set -euo pipefail
drush --yes deploy          # updatedb, config:import, cache:rebuild, deploy:hook
drush --yes cache:rebuild
\`\`\`

Then \`hooks.deploy\` is one line, the Acquia hook is one line, and CI is one line.
A Symfony team faces the identical trade-off on the identical platforms — their
temptation is \`doctrine:migrations:migrate\` typed into a platform hook instead of
\`bin/deploy\`. Whatever lives only in a platform UI is invisible to code review,
untestable, and has to be rediscovered by hand the day you move.
`,

  comparisons: [
    {
      label: "The deploy definition, committed to the repo",
      intro:
        "The same platform, two frameworks. Both files declare a build, a deploy hook, writable mounts and cron — the differences are entirely about what the framework needs to be writable and which command applies pending changes.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony — .platform.app.yaml
name: app
type: 'php:8.3'

dependencies:
  php:
    composer/composer: '^2'

relationships:
  database: 'db:mysql'

disk: 1024

# Symfony writes very little at runtime: logs and the compiled container
# are baked at build time, so only var/ needs to be persistent.
mounts:
  '/var':
    source: local
    source_path: 'var'

build:
  flavor: composer

hooks:
  build: |
    set -e
    bin/console cache:warmup
    npm ci && npm run build
  deploy: |
    set -e
    bin/console doctrine:migrations:migrate --no-interaction
    bin/console cache:clear

web:
  locations:
    '/':
      root: 'public'
      passthru: '/index.php'

crons:
  messenger:
    spec: '*/5 * * * *'
    commands:
      start: 'bin/console messenger:consume async --time-limit=280'`,
      ts: `# Drupal — .platform.app.yaml
name: drupal
type: 'php:8.3'

dependencies:
  php:
    composer/composer: '^2'

relationships:
  database: 'db:mysql'
  redis: 'cache:redis'

disk: 2048

# Drupal wants more writable paths than you expect. Miss one and the
# failure only shows up on the read-only production filesystem.
mounts:
  '/web/sites/default/files':
    source: local
    source_path: 'files'
  '/private':
    source: local
    source_path: 'private'
  '/tmp':
    source: local
    source_path: 'tmp'
  '/.drush':
    source: local
    source_path: 'drush'

build:
  flavor: composer

hooks:
  build: |
    set -e
    # No services, no database here — schema changes must NOT go in build.
  deploy: |
    set -e
    bash scripts/deploy.sh      # one line: the logic lives in the repo

web:
  locations:
    '/':
      root: 'web'
      passthru: '/index.php'
      allow: false
      rules:
        '\\.(jpe?g|png|gif|svgz?|css|js|map|ico|woff2?)$':
          allow: true
    '/sites/default/files':
      root: 'web/sites/default/files'
      allow: true
      scripts: false             # never execute PHP from a writable mount

crons:
  drupal:
    spec: '*/19 * * * *'
    commands:
      start: 'cd web ; drush core:cron'`,
      note:
        "Two Drupal-specific traps: the deploy hook runs with the database available but the code read-only (so updates belong there, never in build), and 'scripts: false' on the files mount is what stops an uploaded .php file from being executed.",
    },
    {
      label: "One deploy script, four platforms",
      intro:
        "The portability move. Write the deploy once as a shell script in the repo, then make every platform's hook a single call into it — so switching host is a change of adapter, not a rewrite of your release process.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: bin/deploy is the contract; each host just calls it.
# ---- bin/deploy ----------------------------------------------------
set -euo pipefail
bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration
bin/console cache:clear
bin/console cache:pool:clear cache.app

# ---- callers -------------------------------------------------------
# Platform.sh  (.platform.app.yaml)
#   hooks:
#     deploy: bash bin/deploy
#
# Deployer / VPS (deploy.php)
#   task('deploy:app', fn() => run('cd {{release_path}} && bin/deploy'));
#
# Kubernetes: an initContainer or a Job running the same script,
# gated so only one pod runs migrations.
#
# GitHub Actions
#   - run: ssh deploy@prod 'cd /srv/app/current && bin/deploy'

# The anti-pattern: pasting the migrate command into three different
# host configs, then discovering they have drifted apart.`,
      ts: `# Drupal: scripts/deploy.sh is the contract.
# ---- scripts/deploy.sh ---------------------------------------------
set -euo pipefail
drush --yes deploy            # updatedb -> config:import -> cache:rebuild -> deploy:hook
drush --yes cache:rebuild
drush --yes config:status --format=list | grep -q . && exit 1 || true

# ---- callers -------------------------------------------------------
# Platform.sh  (.platform.app.yaml)
#   hooks:
#     deploy: |
#       set -e
#       bash scripts/deploy.sh

# Acquia Cloud  (hooks/common/post-code-deploy/deploy.sh, chmod +x)
#   #!/bin/sh
#   site="$1"; target_env="$2"
#   drush @$site.$target_env deploy --yes    # no '--' for a plain drush call

# Pantheon: Quicksilver webphp scripts run in the web container under a
# short timeout, so drive the real deploy from CI instead:
#   terminus drush my-site.live -- deploy --yes
#   terminus env:clear-cache my-site.live
# and use workflows.deploy.after only for fast notifications.

# VPS / Kubernetes
#   ssh deploy@prod 'cd /srv/drupal/current && bash scripts/deploy.sh'`,
      note:
        "Acquia cloud hooks are ordinary executables receiving $1 = site, $2 = target environment; put them in hooks/prod/... to scope them to production. Watch the '--': it is required by wrappers that forward a command to a remote drush ('terminus drush', 'platform drush'), but a plain 'drush @alias' call must not use it — there it ends option parsing and --yes is read as a stray argument. Pantheon is the outlier: its in-platform hook is a PHP script in the web container, so treat CI as the real deploy driver there.",
    },
    {
      label: "Knowing which environment you are in",
      intro:
        "Symfony decides everything from APP_ENV. Drupal has no APP_ENV, so settings.php sniffs a platform-specific variable and includes a per-environment file — the same shape, different plumbing.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: APP_ENV drives config/packages/{dev,stage,prod}/*.yaml.
// .env is committed with safe defaults; .env.local never is.

// config/packages/prod/monolog.yaml, doctrine.yaml etc. are loaded
// automatically once APP_ENV=prod.

// Secrets: encrypted per environment, decrypted with a key the host holds.
//   bin/console secrets:set MAILER_DSN --env=prod
//   bin/console secrets:decrypt-to-local --force --env=prod
// Injected in config as: '%env(MAILER_DSN)%'

// On the platform, APP_ENV comes from the host's variable store:
//   platform variable:create --level project --name env:APP_ENV \\
//     --value prod
//   platform variable:create --level project --name env:MAILER_DSN \\
//     --value '...' --sensitive true

// In code you almost never branch on the environment; the container
// was already built differently.
$isProd = $_ENV['APP_ENV'] === 'prod';`,
      ts: `<?php
// Drupal: settings.php is the only place this decision can be made.
// Normalise every host's variable into one $env, then include one file.

$env = 'local';
if (isset($_ENV['AH_SITE_ENVIRONMENT'])) {        // Acquia: dev|test|prod|odeN
  $env = $_ENV['AH_SITE_ENVIRONMENT'];
}
elseif (isset($_ENV['PANTHEON_ENVIRONMENT'])) {   // dev|test|live|<multidev>
  $env = $_ENV['PANTHEON_ENVIRONMENT'] === 'live' ? 'prod' : $_ENV['PANTHEON_ENVIRONMENT'];
}
elseif (getenv('PLATFORM_ENVIRONMENT_TYPE')) {    // development|staging|production
  $env = getenv('PLATFORM_ENVIRONMENT_TYPE') === 'production' ? 'prod' : 'stage';
}

$settings['config_sync_directory'] = '../config/sync';
$settings['config_exclude_modules'] = ['devel', 'stage_file_proxy'];

// Which config split is active is a plain override, not a UI toggle.
$config['config_split.config_split.dev']['status'] = ($env !== 'prod');
$config['config_split.config_split.prod']['status'] = ($env === 'prod');

// Secrets: read from the host's variable store, never from config/sync.
$config['system.mail']['interface']['default'] =
  $env === 'prod' ? 'symfony_mailer' : 'test_mail_collector';
$settings['stripe_secret_key'] = getenv('STRIPE_SECRET_KEY') ?: NULL;

$file = __DIR__ . '/settings.' . $env . '.php';
if (file_exists($file)) {
  include $file;
}`,
      note:
        "Platform.sh exposes PLATFORM_RELATIONSHIPS, PLATFORM_VARIABLES and PLATFORM_ROUTES as base64-encoded JSON — the vendor settings include decodes them into $databases. Normalising to your own $env variable at the top is what makes the rest of settings.php host-agnostic.",
    },
    {
      label: "A branch environment with real, sanitised data",
      intro:
        "The feature that justifies the hosting bill: spin up an environment per branch, seeded from production data with the personal data scrubbed. Every platform has it; the CLI verbs differ.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony team, Platform.sh review app
platform environment:branch feature/checkout main
# -> clones the parent's data, runs build + deploy hooks, gives a URL

# Refresh a stale branch from production
platform environment:synchronize --environment feature/checkout data

# Locally, an anonymised dump instead of raw production data
platform db:dump --environment main --gzip --file prod.sql.gz
gunzip -c prod.sql.gz | psql app
bin/console app:anonymise-users        # a command you had to write

# Kubernetes equivalent: a namespace per PR plus a restore Job,
# with anonymisation baked into the restore image.`,
      ts: `# Drupal, Pantheon Multidev
# Multidev names are capped: lowercase, 11 characters max, dashes allowed.
terminus multidev:create my-site.live checkout
terminus drush my-site.checkout -- deploy --yes
terminus drush my-site.checkout -- sql:sanitize --yes

# Platform.sh: same idea, Drupal commands, no name limit
platform environment:branch feature-checkout main
platform drush --environment feature-checkout -- deploy --yes
platform drush --environment feature-checkout -- sql:sanitize --yes

# Acquia: pull an environment down locally, sanitised on arrival
acli pull:db --no-scripts
drush --yes sql:sanitize
drush --yes deploy

# drush sql:sanitize rewrites user emails and passwords and truncates
# the sessions table. It does NOT know about your custom entity holding
# invoices — extend it from a Drush commandfile with a post-command hook
# on sql:sanitize (#[CLI\\Hook(type: HookManager::POST_COMMAND_HOOK,
# target: SanitizeCommands::SANITIZE)]), and test that on a real dump
# before anyone trusts it.`,
      note:
        "Sanitising after the copy leaves a window where raw production data sits on a dev environment. Where the platform supports it — Pantheon's clone_database Quicksilver hook, an Acquia post-db-copy hook — attach sanitisation to the copy workflow itself so nobody can forget.",
    },
  ],

  playground: {
    intro:
      "A portability audit for the team of four. For each platform, where does each part of the deploy actually live — in a file you can review, or in a UI somebody clicked? Run it and read the second block: that is your migration checklist.",
    lang: "php",
    code: `<?php
// Where does each step of a Drupal deploy actually live on each platform?
// "repo" = defined in a file you can grep, review and port. Anything else is
// lock-in: it lives in a platform UI or in the platform's own scheduler.

$platforms = [
  'platform.sh' => [
    'entry'     => '.platform.app.yaml -> hooks.deploy',
    'composer'  => 'repo',      // build flavor: composer, runs on the platform
    'cron'      => 'repo',      // crons: in the same yaml file
    'secrets'   => 'platform',  // platform variable:create --sensitive
    'writable'  => 'mounts only',
  ],
  'pantheon' => [
    'entry'     => 'pantheon.yml -> workflows.deploy.after',
    'composer'  => 'repo',      // Integrated Composer upstream
    'cron'      => 'platform',  // platform-run cron, not in the repo
    'secrets'   => 'private fs', // secrets file outside the docroot
    'writable'  => 'files mount only',
  ],
  'acquia' => [
    'entry'     => 'hooks/common/post-code-deploy/deploy.sh',
    'composer'  => 'repo (CI)', // artifact built by acli push:artifact
    'cron'      => 'ui',        // scheduled jobs in Cloud UI
    'secrets'   => 'platform',
    'writable'  => 'files mount only',
  ],
  'vps / k8s' => [
    'entry'     => 'deploy/deploy.sh',
    'composer'  => 'repo (CI)',
    'cron'      => 'repo',      // systemd timer or CronJob manifest
    'secrets'   => 'platform',  // vault / sealed secret
    'writable'  => 'whole disk',
  ],
];

$steps = ['composer', 'cron', 'secrets'];

echo "platform     entry point                                    portable\\n";
echo str_repeat('-', 68) . "\\n";

$risk = [];
foreach ($platforms as $name => $p) {
  $inRepo = 0;
  foreach ($steps as $step) {
    if (str_starts_with($p[$step], 'repo')) {
      $inRepo++;
    }
    else {
      $risk[$step][] = $name . ':' . $p[$step];
    }
  }
  printf("%-12s %-46s %d/%d\\n", $name, $p['entry'], $inRepo, count($steps));
}

echo "\\nOwned outside the repo (re-create by hand on migration):\\n";
foreach ($steps as $step) {
  if (isset($risk[$step])) {
    echo '  ' . str_pad($step, 9) . implode(', ', $risk[$step]) . "\\n";
  }
}

echo "\\nWritable filesystem at runtime:\\n";
foreach ($platforms as $name => $p) {
  echo '  ' . str_pad($name, 12) . $p['writable'] . "\\n";
}

echo "\\nRule: every platform above can call the SAME deploy/deploy.sh.\\n";
echo "Keep drush deploy in that script, not in four different hook files.\\n";
`,
    output: `platform     entry point                                    portable
--------------------------------------------------------------------
platform.sh  .platform.app.yaml -> hooks.deploy             2/3
pantheon     pantheon.yml -> workflows.deploy.after         1/3
acquia       hooks/common/post-code-deploy/deploy.sh        1/3
vps / k8s    deploy/deploy.sh                               2/3

Owned outside the repo (re-create by hand on migration):
  cron     pantheon:platform, acquia:ui
  secrets  platform.sh:platform, pantheon:private fs, acquia:platform, vps / k8s:platform

Writable filesystem at runtime:
  platform.sh mounts only
  pantheon    files mount only
  acquia      files mount only
  vps / k8s   whole disk

Rule: every platform above can call the SAME deploy/deploy.sh.
Keep drush deploy in that script, not in four different hook files.
`,
  },

  keyPoints: [
    "Read the platform file — .platform.app.yaml, pantheon.yml, hooks/ — as the deployment contract: it defines build vs deploy phases, writable mounts, cron and the web rules.",
    "Build and deploy are different phases with different powers: build has a writable disk but no database; deploy has the database but read-only code. Schema and config changes belong in deploy, never in build.",
    "Managed platforms run on a read-only filesystem outside declared mounts, so anything that writes into the docroot at runtime fails in production only — and set scripts: false on the files mount.",
    "Who builds Composer differs: Platform.sh builds on the platform, Pantheon builds via Integrated Composer on a Composer-managed upstream, Acquia deploys a pre-built artefact whose vendor/ is committed by CI.",
    "Keep the deploy logic in scripts/deploy.sh (drush deploy plus your checks) and make every platform hook a one-line call into it, so a host migration is an adapter change.",
    "Cron, workers, scheduled jobs and secrets are the parts most often owned by a platform UI — inventory them explicitly, because they are invisible to code review and to any migration plan.",
  ],

  interview: [
    {
      q: "You are moving a Drupal site from Acquia to Platform.sh. What breaks, and how do you plan it?",
      a: "The code moves easily; the platform-owned pieces do not. First I inventory everything outside the repo: scheduled jobs configured in Acquia's UI, environment variables and secrets, the cloud hooks in `hooks/`, and anything relying on `AH_SITE_ENVIRONMENT`. Then I write the new deploy definition — `.platform.app.yaml` with `build: {flavor: composer}`, the writable mounts Drupal needs (public files, private, tmp, `.drush`), `hooks.deploy` and a `crons` entry for `drush core:cron` — and I normalise `settings.php` so environment detection handles both hosts during the cutover. The build model also flips: Acquia deploys an artefact with `vendor/` committed (built by `acli push:artifact`), while Platform.sh runs Composer itself, so the artefact branch and its CI job go away. If the deploy already lives in `scripts/deploy.sh`, the actual release logic is unchanged — that is exactly why I put it there.",
    },
    {
      q: "A module works on your local Docker setup and on the dev environment, but fatals on production. What do you suspect first?",
      a: "The filesystem. Managed platforms mount most of the application read-only at runtime and only the declared mounts are writable, while dev environments are often looser — so code that writes into the docroot, unpacks a library, or caches to a directory next to itself will only fail where it matters. I would check what path it is writing to and either move it under an existing writable mount or declare a new one. The second suspect is a difference in the deploy phase: something the module expects to happen at install time that only ran on dev. The third is a config split or settings override that is on for dev and off for production, so a service the module depends on simply is not there.",
    },
    {
      q: "Your client wants deploys triggered from the hosting dashboard. Why push back?",
      a: "Because a dashboard click is not reviewable, testable or repeatable. If the sequence of commands lives in a UI text box, it is not in a pull request, no one can diff it, it cannot be exercised in CI, and it has to be reconstructed by hand the day you change host — the same argument a Symfony team makes about `doctrine:migrations:migrate` typed into a platform hook instead of `bin/deploy`. I would keep the logic in `scripts/deploy.sh`, make the platform hook a single call to it, and let the dashboard stay as the trigger and the audit log. That gives the client the button they want while the meaningful part still goes through code review.",
    },
    {
      q: "How do you get realistic data onto a review environment without leaking personal data?",
      a: "Use the platform's branch/clone feature so the environment starts from a copy of production — Pantheon Multidev, `platform environment:branch`, an Acquia CDE — then sanitise. `drush sql:sanitize` rewrites user emails and passwords and truncates sessions, but it knows nothing about custom entities holding invoices, addresses or support tickets, so I extend it and verify against a real dump. The important detail is *where* sanitisation runs: attaching it to the copy workflow itself (a Pantheon `clone_database` Quicksilver hook, an Acquia post-db-copy hook) closes the window where raw production data sits unscrubbed on a dev environment, whereas a step someone is supposed to remember will eventually be forgotten.",
    },
  ],

  quiz: [
    {
      question:
        "On Platform.sh, where should `drush updatedb` and `drush config:import` run?",
      options: [
        "In hooks.build, so the site is already correct when it starts",
        "In hooks.deploy, which has the database available but read-only code",
        "In a cron entry that runs a few minutes after each deploy",
        "In the web.locations rules, as a passthru",
      ],
      answerIndex: 1,
      explain:
        "The build hook runs with a writable disk but no services — there is no database to update. The deploy hook runs after the app is deployed, with the database available and the code read-only, while the site is not serving requests. That is exactly the window for schema and config changes, which is why you keep it fast.",
    },
    {
      question:
        "Acquia Cloud deploys a build artefact. What does that imply for your repository layout?",
      options: [
        "Nothing — Acquia runs composer install on every deploy like Platform.sh",
        "You keep a source repo without vendor/, and CI builds an artefact with vendor/ committed that is what Acquia actually deploys",
        "You must commit vendor/ to your main development branch",
        "Composer is not supported, so modules are installed through the UI",
      ],
      answerIndex: 1,
      explain:
        "Acquia's documented best practice is a source repository (no vendor/) plus a separate build repository containing static snapshots of the whole codebase including dependencies. Tools such as `acli push:artifact` run composer install and commit vendor/ and scaffold files into that artefact. Your development branch stays clean.",
    },
    {
      question:
        "Which of these is the strongest argument for putting the deploy sequence in scripts/deploy.sh rather than directly in each platform's hook?",
      options: [
        "Shell scripts run faster than YAML hooks",
        "It is the only way to use drush deploy",
        "It keeps the release logic reviewable, testable in CI and identical across hosts, so a migration is an adapter change",
        "Platforms charge per line of hook configuration",
      ],
      answerIndex: 2,
      explain:
        "The logic in a repo script goes through pull request review, can be exercised in CI, and stays identical between platform hooks, local runs and a VPS. When the hook is a one-line call, changing host means writing a new adapter, not rediscovering the release process from a dashboard.",
    },
    {
      question:
        "On a managed platform, code that writes a cache file into web/modules/custom/mymodule/cache/ will most likely fail where?",
      options: [
        "Everywhere, including local development",
        "Only in CI, because CI has no filesystem",
        "On production and other read-only environments, but not on a loose local or dev setup",
        "Nowhere — Drupal makes the whole docroot writable during deploy",
      ],
      answerIndex: 2,
      explain:
        "Managed platforms mount the application read-only at runtime and only declared mounts (public files, private, tmp) are writable. A local Docker setup usually has a fully writable disk, so this class of bug reaches production before anyone notices. The fix is to write into a real writable mount, or declare a new one in the platform file.",
    },
  ],
};

export default lesson;
