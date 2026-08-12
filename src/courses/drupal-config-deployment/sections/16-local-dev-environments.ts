import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "local-dev-environments",
  title: "Local Development Environments",
  part: "Team Workflow",
  estMinutes: 12,
  summary:
    "Commit the whole local stack — PHP, database, extensions, Drush — so four laptops behave like production, and turn onboarding into clone, start, install, import, cim.",

  concept: `
## Why Drupal cares more than Symfony does

A Symfony app's local environment can drift from production and you often get
away with it, because almost everything that matters is a build artifact
regenerated from code. Drupal cannot be so relaxed, and the reason is the one
that runs through this whole course: **configuration round-trips through the
database**. Your local site is a *database*, not a build output. So the tools
that read and write that database — the MySQL/MariaDB server, the PHP that
serialises into it, the Drush that drives \`cim\` — have to behave the same way on
your laptop as they do on production, or the artefact you commit is subtly
wrong.

Concretely, a mismatched local stack produces bugs like:

- **PHP version** differs, so a developer who runs \`composer update\` resolves
  against the wrong platform and commits a lock file production cannot use.
  (\`composer install\` never resolves — it installs exactly what
  \`composer.lock\` records, and on the wrong PHP it aborts with "Your lock file
  does not contain a compatible set of packages".) That is why teams pin
  \`config.platform.php\` in \`composer.json\` as well as \`php_version\` in
  \`.ddev/config.yaml\`.
- **Database server** differs (MySQL 8 locally, MariaDB 10.11 on prod), so
  collations, JSON columns and index length limits differ — a production dump
  restores locally with a different sort order and your Views output changes.
- **Extensions** differ: no \`apcu\` or \`redis\` locally means Drupal quietly falls
  back to the database cache backend, so the caching bug you are chasing cannot
  reproduce.
- **Drush major version** differs, so \`drush deploy\` runs a different sequence
  than CI does.

## DDEV, and the alternatives

**DDEV** is where the Drupal community has landed. Its whole model is a
committed \`.ddev/config.yaml\`: the stack is declared in the repo, and
\`ddev start\` reproduces it. **Lando** works the same way with \`.lando.yml\` and is
a perfectly reasonable choice, especially on teams already using it.
**Docksal** takes the same committed-config approach and still has users.
**Raw docker-compose** gives total control and is what you want if your
production platform hands you its own images — at the cost of maintaining PHP
extension installs, SSL certificates, hostnames, mail catching and Xdebug
wiring yourself, which is exactly what DDEV is doing for you.

Whichever you pick, the rule is the same: **one tool, committed, no exceptions.**
A "works on my machine" bug on a Drupal team is usually a stack difference, and
the cost of debugging one of those exceeds the cost of standardising.

### A minimal committed config

\`\`\`yaml
# .ddev/config.yaml
name: four-rivers
type: drupal11        # drupal10 / drupal11 are both valid project types
docroot: web
php_version: "8.3"
webserver_type: nginx-fpm
database:
  type: mariadb
  version: "10.11"
composer_version: "2"
nodejs_version: "22"
xdebug_enabled: false     # toggle per session: ddev xdebug on
performance_mode: mutagen # macOS/Windows filesystem speed
ddev_version_constraint: ">=1.24"
\`\`\`

Commit \`.ddev/\` — that is the point of it. DDEV manages its own
\`.ddev/.gitignore\` to separate the files you own from the ones it generates, so
leave that file alone. It also writes
\`web/sites/default/settings.ddev.php\`, marked \`#ddev-generated\` and gitignored,
which is where the local database credentials live; \`settings.php\` includes it
only when running under DDEV.

## Debugging and profiling in the container

\`ddev xdebug on\` flips Xdebug for the session (leave \`xdebug_enabled: false\` in
the committed config — an always-on Xdebug halves your page speed). For
profiling, either point Xdebug at profile mode via \`.ddev/php/xdebug.ini\`, or
use XHProf: \`ddev config global --xhprof-mode=xhgui\`, \`ddev xhgui on\`, then
\`ddev xhgui launch\` for a browsable UI of every request.
`,

  comparisons: [
    {
      label: "Declaring the stack",
      intro:
        "Both teams commit their environment. The difference is how much of Drupal's runtime has to be pinned, and how much of it a framework app simply does not have.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# compose.yaml - Symfony with Docker
services:
  php:
    image: php:8.3-fpm-alpine
    volumes: ['./:/var/www/html']
  database:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_PASSWORD: app

# .env - committed defaults, overridden
# per-environment by .env.local (gitignored)
APP_ENV=dev
DATABASE_URL=postgresql://app:app@database:5432/app

# Local run: 'symfony serve' or 'docker compose up'.
# Config lives in config/packages/*.yaml and is
# regenerated on cache:warmup, so a drifted local
# stack mostly costs you time, not correctness.`,
      ts: `# .ddev/config.yaml - committed, whole team
name: four-rivers
type: drupal11
docroot: web
php_version: "8.3"
webserver_type: nginx-fpm
database:
  type: mariadb
  version: "10.11"
composer_version: "2"
nodejs_version: "22"
xdebug_enabled: false
performance_mode: mutagen
ddev_version_constraint: ">=1.24"

web_environment:
  - DRUSH_OPTIONS_URI=https://four-rivers.ddev.site

hooks:
  post-start:
    - exec: composer install
  post-import-db:
    - exec: drush cim -y
    - exec: drush cache:rebuild`,
      note:
        "The post-import-db hook is the Drupal-specific bit: an imported database carries another environment's ACTIVE config, so the very next thing you must do is re-import config/sync.",
    },
    {
      label: "Onboarding developer number four",
      intro:
        "New hire, Monday morning, empty laptop. Count the steps and count the things that can silently go wrong in each stack.",
      leftLang: "bash",
      rightLang: "bash",
      php: `git clone git@github.com:four-rivers/api.git
cd api

# Requires a matching local PHP + extensions,
# or a docker compose stack, or both.
composer install
cp .env .env.local   # edit DATABASE_URL

docker compose up -d database
php bin/console doctrine:database:create
php bin/console doctrine:migrations:migrate -n
php bin/console doctrine:fixtures:load -n

symfony serve -d
# Done. No production data was needed: fixtures
# generate a usable dataset from code.`,
      ts: `git clone git@github.com:four-rivers/site.git
cd site

ddev start              # builds the committed stack
ddev composer install   # runs inside the container

# You need real-shaped content, and it must be
# sanitised before it leaves stage.
ddev import-db --file=db/stage-sanitised.sql.gz

# The DB you just imported carries stage's ACTIVE
# config. Reset it to what the repo says.
ddev drush cim -y
ddev drush cache:rebuild
ddev launch $(ddev drush uli)`,
      note:
        "Drupal's extra step is not the container, it is drush cim. Symfony fixtures build state from code; a Drupal laptop starts from someone else's database and has to be re-synced to the repo.",
    },
    {
      label: "Getting a database, and its half-life",
      intro:
        "Sharing databases is how Drupal teams get realistic local content — and the single biggest source of 'it works locally' confusion.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony rarely needs prod data locally.
php bin/console doctrine:fixtures:load

# When it does, the dump is just rows: no
# application configuration is hiding in it.
pg_dump -Fc app > dump.pgsql
pg_restore -d app dump.pgsql

# Schema state is explicit and checkable:
php bin/console doctrine:migrations:status
#  >> Already Executed Migrations   14
#  >> New Migrations                0`,
      ts: `# Nightly job on stage produces the shared dump.
# --gzip appends .gz itself; do not write it yourself
# or you get stage-sanitised.sql.gz.gz
drush @stage sql:dump --gzip \\
  --result-file=/backups/stage-sanitised.sql
# (sanitise BEFORE it leaves the server)

# On the laptop, a week later:
ddev import-db --file=db/stage-sanitised.sql.gz
ddev drush updatedb -y   # dump predates new updates
ddev drush cim -y        # dump carries stale config
ddev drush config:status
#  Only in sync directory: views.view.donations
#  -> your branch adds it; expected.

# Snapshot before anything destructive:
ddev snapshot --name pre-migration-test`,
      note:
        "Always updatedb then cim after an import: the dump's schema version and active config both lag the repo. drush config:status afterwards tells you whether the remaining diff is your work or someone else's drift.",
    },
    {
      label: "Step debugging and profiling",
      intro:
        "Same Xdebug, same ports — the difference is who wires the container to your IDE and whether it is on by default.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Dockerfile / php.ini you maintain yourself
# pecl install xdebug
# xdebug.mode=debug
# xdebug.client_host=host.docker.internal
# xdebug.start_with_request=trigger

XDEBUG_MODE=debug symfony serve -d

# Profiling: the Symfony Profiler is built in for
# dev, plus Blackfire for real numbers.
composer require --dev symfony/profiler-pack
blackfire run php bin/console app:heavy-task`,
      ts: `ddev xdebug on          # port 9003, IDE-ready
ddev xdebug status
ddev xdebug off         # turn it off, it is slow

# Profile with XHProf + a browsable UI:
ddev config global --xhprof-mode=xhgui
ddev restart
ddev xhgui on
ddev xhgui launch

# Or Xdebug's own profiler via .ddev/php/xdebug.ini:
#   xdebug.mode=profile
#   xdebug.output_dir=/var/www/html/.ddev/xdebug`,
      note:
        "Keep xdebug_enabled: false in the committed config and toggle per session. A team that leaves Xdebug on permanently spends its whole day waiting for a slow site and then draws wrong conclusions about performance.",
    },
  ],

  playground: {
    intro:
      "An environment-parity audit for the four-person team, followed by the onboarding path. Two of the four run the committed DDEV stack; one is on a stale container image and one never adopted it at all. The audit names what each drift actually breaks.",
    lang: "php",
    code: `<?php

// Production is the reference. Everything else is measured against it.
$prod = [
  'php'        => '8.3',
  'database'   => 'mariadb:10.11',
  'drush'      => '13',
  'extensions' => ['apcu', 'gd', 'opcache', 'pdo_mysql', 'redis'],
];

// .ddev/config.yaml is committed, so it is the team's single declared stack.
$declared = $prod;

// What the four laptops actually report on a Monday morning.
$laptops = [
  'amina  (ddev)'      => $declared,
  'ben    (ddev, old)' => ['php' => '8.3', 'database' => 'mariadb:10.6',
                           'drush' => '13', 'extensions' => ['apcu', 'gd', 'opcache', 'pdo_mysql', 'redis']],
  'chidi  (homebrew)'  => ['php' => '8.4', 'database' => 'mysql:8.0',
                           'drush' => '12', 'extensions' => ['gd', 'opcache', 'pdo_mysql']],
  'dilip  (ddev)'      => $declared,
];

// What each kind of drift actually breaks on a Drupal project.
$consequences = [
  'php'      => 'composer platform check and language features differ from prod',
  'database' => 'collation and JSON handling differ; a prod dump may not restore',
  'drush'    => 'different command set, so drush deploy behaves differently',
  'apcu'     => 'no fast bootstrap cache, so local timings lie about prod',
  'redis'    => 'cache backend silently falls back to the database',
];

function audit(string $who, array $env, array $ref, array $why): int {
  $problems = [];
  foreach (['php', 'database', 'drush'] as $key) {
    if ($env[$key] !== $ref[$key]) {
      $problems[] = sprintf('%-8s %s != %s  (%s)', $key, $env[$key], $ref[$key], $why[$key]);
    }
  }
  foreach (array_diff($ref['extensions'], $env['extensions']) as $ext) {
    $problems[] = sprintf('%-8s missing %s  (%s)', 'ext', $ext, $why[$ext] ?? 'behaviour differs');
  }
  printf("%-20s %s\\n", $who, $problems === [] ? 'matches production' : count($problems) . ' drift(s)');
  foreach ($problems as $line) {
    echo '    ' . $line . "\\n";
  }
  return count($problems);
}

echo 'Parity audit against production (' . $prod['php'] . ' / ' . $prod['database'] . "):\\n";
$total = 0;
foreach ($laptops as $who => $env) {
  $total += audit($who, $env, $prod, $consequences);
}
echo "\\nTotal drift: " . $total . "\\n\\n";

// Onboarding: every step that must succeed before the new hire can open the site.
$onboard = [
  'git clone git@github.com:four-rivers/site.git' => 'code, .ddev/config.yaml, config/sync',
  'ddev start'                                    => 'containers built from the committed stack',
  'ddev composer install'                         => 'vendor/ and web/ from composer.lock',
  'ddev import-db --file=db/sanitised.sql.gz'     => 'content plus stage ACTIVE config',
  'ddev drush cim -y'                             => 'active config reset to config/sync',
  'ddev drush uli'                                => 'a one-time login link',
];
echo "Onboarding path (one command each, in this order):\\n";
$n = 0;
foreach ($onboard as $cmd => $gives) {
  printf("  %d. %-45s -> %s\\n", ++$n, $cmd, $gives);
}
echo "\\nStep 5 is the one Symfony has no analogue for: the imported database\\n";
echo "carries stage's ACTIVE config, which must be re-synced from the repo.\\n";
`,
    output: `Parity audit against production (8.3 / mariadb:10.11):
amina  (ddev)        matches production
ben    (ddev, old)   1 drift(s)
    database mariadb:10.6 != mariadb:10.11  (collation and JSON handling differ; a prod dump may not restore)
chidi  (homebrew)    5 drift(s)
    php      8.4 != 8.3  (composer platform check and language features differ from prod)
    database mysql:8.0 != mariadb:10.11  (collation and JSON handling differ; a prod dump may not restore)
    drush    12 != 13  (different command set, so drush deploy behaves differently)
    ext      missing apcu  (no fast bootstrap cache, so local timings lie about prod)
    ext      missing redis  (cache backend silently falls back to the database)
dilip  (ddev)        matches production

Total drift: 6

Onboarding path (one command each, in this order):
  1. git clone git@github.com:four-rivers/site.git -> code, .ddev/config.yaml, config/sync
  2. ddev start                                    -> containers built from the committed stack
  3. ddev composer install                         -> vendor/ and web/ from composer.lock
  4. ddev import-db --file=db/sanitised.sql.gz     -> content plus stage ACTIVE config
  5. ddev drush cim -y                             -> active config reset to config/sync
  6. ddev drush uli                                -> a one-time login link

Step 5 is the one Symfony has no analogue for: the imported database
carries stage's ACTIVE config, which must be re-synced from the repo.
`,
  },

  keyPoints: [
    "Local stack parity matters more for Drupal than for Symfony because configuration lives in the database: the PHP, database server, extensions and Drush that read and write it all shape the artefact you commit.",
    "Commit the environment definition — .ddev/config.yaml, .lando.yml or your compose file — and pin php_version, database type and version, composer_version and a minimum tool version so every laptop rebuilds the same stack.",
    "Onboarding should be clone, ddev start, ddev composer install, import a sanitised database, drush cim, drush uli — with the config import being the step no framework app has an equivalent for.",
    "An imported database carries the source environment's ACTIVE config and its schema version, so always run updatedb then cim after an import, and use drush config:status to tell your own diff from someone else's drift.",
    "Shared databases go stale: content diverges, config diverges, and a month-old dump reproduces bugs that no longer exist. Refresh on a schedule and treat the dump as disposable, never as the source of truth.",
    "Keep xdebug_enabled false in the committed config and toggle it with ddev xdebug on; profile with XHProf/XHGui or Xdebug's profiler rather than leaving a debugger attached all day.",
  ],

  interview: [
    {
      q: "Why does a Drupal team need a standardised local environment more than a Symfony team does?",
      a: "Because Drupal's configuration is stored in the database and exported to YAML, so the local database and the tools around it are part of the artefact you commit, not just a runtime detail. If my MariaDB version, PHP version or PHP extensions differ from production, a dump may restore differently, collations and JSON handling change, and Drupal can silently fall back to a different cache backend so the bug I am chasing cannot reproduce. A Symfony app regenerates almost all of its state from `config/packages` at cache warmup, so drift mostly costs time rather than correctness. On top of that, Drush is the deployment tool — `drush deploy` behaves differently across major versions — so if my laptop runs a different Drush than CI, my local rehearsal proves nothing. That is why I commit `.ddev/config.yaml` and pin the PHP version, database version and a minimum DDEV version.",
    },
    {
      q: "A developer joins on Monday. Walk me through getting them productive by lunchtime.",
      a: "Clone the repo, `ddev start`, `ddev composer install`, import the latest sanitised database dump with `ddev import-db`, then `ddev drush updatedb -y && ddev drush cim -y`, `ddev drush cache:rebuild` and `ddev drush uli` for a login link. The two Drupal-specific steps are the last ones: the dump carries the source environment's active configuration and its schema version, so it lags whatever is on the branch, and `cim` is what resets active config back to `config/sync`. I would wire that into `post-start` and `post-import-db` hooks in `.ddev/config.yaml` so it is not tribal knowledge. The only thing that should require a human is access to the dump itself, which is why the sanitised dump gets published by a scheduled job rather than passed around by hand.",
    },
    {
      q: "What are the risks of a team sharing one local database dump, and how do you manage them?",
      a: "Two risks: privacy and staleness. Privacy first — a production dump on four laptops is four copies of your users' personal data, so it must be sanitised on the server before it is ever downloaded, and custom tables holding PII need their own sanitisation because Drush only knows about core's. Staleness is the subtler one: a month-old dump has old content, old active config and an old schema version, so people reproduce bugs that were fixed and file bugs that do not exist. I refresh the shared dump on a schedule, name it with a date, and require `updatedb` plus `cim` immediately after import so the database is realigned with the repo. Crucially the dump is disposable — `config/sync` in git is the source of truth for configuration, never the database someone happened to download.",
    },
    {
      q: "How would you evaluate DDEV against Lando or a hand-rolled docker-compose setup?",
      a: "All three can work; the question is how much undifferentiated plumbing you want to own. DDEV and Lando both commit a single config file to the repo and give you PHP extensions, trusted HTTPS, hostnames, a mail catcher, Xdebug wiring and `ddev drush` for free, which is exactly the surface a Drupal team keeps needing. DDEV is where the Drupal community has concentrated, so add-ons, hosting-provider integrations and documentation are easiest to find there. Hand-rolled docker-compose earns its keep when your host publishes images that match production exactly, or when you need a service the tools do not model — but you then maintain the extension builds and TLS yourself. The decision I would not accept is 'everyone uses whatever they like': the debugging cost of one stack-difference bug outweighs the setup cost of standardising.",
    },
  ],

  quiz: [
    {
      question:
        "You import a colleague's database dump into your local site. What must you run immediately afterwards, and why?",
      options: [
        "drush cex, because the imported database is now the source of truth",
        "drush updatedb then drush cim, because the dump lags the repo in both schema version and active config",
        "Nothing — ddev import-db already reconciles the database with the repo",
        "drush config:delete, to clear the other environment's configuration",
      ],
      answerIndex: 1,
      explain:
        "A dump is a snapshot of another environment's database, which contains both its schema version and its active configuration. Running updatedb applies any pending update hooks from your branch, and cim resets active config to config/sync. Running cex instead would export the stale imported config over the top of the repo — the classic way to undo a teammate's work.",
    },
    {
      question:
        "Which setting belongs in a committed .ddev/config.yaml for a Drupal 11 project?",
      options: [
        "xdebug_enabled: true, so debugging always works",
        "database: { type: mariadb, version: \"10.11\" } matching production",
        "The production database credentials, so drush can connect",
        "A copy of settings.php with local overrides",
      ],
      answerIndex: 1,
      explain:
        "Pinning the database type and version to production's is exactly what the committed config is for. Xdebug should stay off by default and be toggled with 'ddev xdebug on' because it is slow. Credentials never belong in a committed file, and DDEV generates settings.ddev.php itself — that file is gitignored and marked #ddev-generated.",
    },
    {
      question:
        "Your laptop has no Redis extension but production uses Redis as its cache backend. What is the practical consequence?",
      options: [
        "Drupal refuses to bootstrap until the extension is installed",
        "Drupal falls back to the database cache backend, so cache-related bugs cannot reproduce locally",
        "drush cim will fail validation because of the missing dependency",
        "Configuration exports will differ between environments",
      ],
      answerIndex: 1,
      explain:
        "Cache backend selection is an environment override in settings.php, so a missing extension typically means the site quietly uses the default database backend. The site works, which is the problem: cache invalidation and tag-clearing bugs behave differently, and your local performance numbers describe a stack nobody runs in production.",
    },
  ],
};

export default lesson;
