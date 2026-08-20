import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "scaffold-ahoy-and-local-dev",
  title: "ahoy init: The Scaffold, the Task Runner and the Local Stack",
  part: "The Distribution & Your Codebase",
  estMinutes: 13,
  summary:
    "How `ahoy init` bakes an offering into a fresh scaffold clone, why every GovCMS command goes through ahoy rather than raw docker compose, and what the local stack actually mounts.",
  concept: `
## The scaffold is a template, not a project

You are used to \`composer create-project\` producing a repo you then shape. The GovCMS equivalent is a clone of \`govCMS/scaffold\` (default branch \`develop\`) followed by one destructive provisioning run. That run is \`ahoy init\`, which is a two-line target in \`.ahoy.yml\` delegating to \`scripts/scaffold-init.sh\`.

### Three arguments, validated

\`\`\`bash
ahoy init <name> <type> <version>
\`\`\`

The script is the authority on what those mean, and the usage text elsewhere in the repo has drifted from it. It accepts a name matching \`[a-z0-9-]\` only, a type of \`saas\`, \`paas\` or \`saasplus\`, and a version of \`10\` or \`11\`. Anything else exits \`2\` with an \`[error]:\` line. Nothing is prompted for; nothing is inferred.

### The offering is baked in, once

Init does not set a runtime flag. It rewrites the repo:

- substitutes the project name and core version into \`.env\` (copied from \`.env.default\`), \`docker-compose.yml\` and \`.docker/Dockerfile*\`
- writes \`type:\` and \`version:\` into \`.version.yml\`, the file the platform reads to decide which automated tasks a project gets
- renames \`.docker/Dockerfile.<type>\` to \`.docker/Dockerfile.cli\` and deletes the other offerings' Dockerfiles
- on \`paas\`, promotes \`.gitlab-ci.paas.yml\` to \`.gitlab-ci.yml\`, copies \`composer.<version>.json\` to \`composer.json\`, and \`sed\`-deletes the \`## START SaaS-only\` / \`## END SaaS-only\` block from \`.lagoon.yml\`
- on \`saas\`/\`saasplus\`, deletes every \`composer.*\` file and appends \`web/\`, \`scripts/\` and \`drush/\` to \`.gitignore\` — you do not vendor a Drupal codebase, the \`govcms/govcms\` image supplies it
- regenerates \`README.md\` and then \`rm\`s itself

There is no "switch to PaaS" command. Changing offering means a fresh clone and another init, or a migration conversation with GovCMS.

## ahoy is a thin wrapper

Every meaningful target in \`.ahoy.yml\` is literally a \`docker compose exec\` line. \`ahoy drush\` is \`docker compose exec -T cli drush "$@"\`; \`ahoy cli\` is \`docker compose exec cli bash\`; \`ahoy ship-shape\` runs the Shipshape binary inside \`cli\` against the vendored \`shipshape.yml\`. Drush is never on the host PATH — it is a dependency of the image, pinned by scaffold-tooling.

Treat \`.ahoy.yml\` as read-only: it is on the SaaS locked-file list, so a push that modifies it is refused. Project-specific targets belong in \`custom/ahoy.yml\`, reached as \`ahoy my <target>\`.

### The local stack

\`docker compose\` brings up \`cli\`, \`php\`, \`nginx\`, \`test\`, \`mariadb\`, \`av\` and a Selenium \`chrome\`; \`solr\` ships commented out and is opt-in. The site answers on \`http://<name>.docker.amazee.io\` via the external \`amazeeio-network\`, so Pygmy or an equivalent resolver is a prerequisite. The AV service is wired the same way it is on the platform: \`HTTPAV_ENDPOINT: http://av:3993/scan\`.

The tell for which offering you cloned is the volume anchor. SaaS services inherit \`*default-volumes\` — six explicit mounts. PaaS services inherit \`*paas-volumes\`, which is \`.:/app\`.
`,
  comparisons: [
    {
      label: "Creating the project",
      intro:
        "Same goal — a running local Drupal 11 with a git history — reached two very different ways. Note where the decisions are made and whether they are reversible.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal 11: you compose the project, you choose the stack.
composer create-project drupal/recommended-project:^11 mydept-site
cd mydept-site
composer require drush/drush:^13 drupal/redis drupal/seckit
git init && git add . && git commit -m "Initial project"

# Local stack is your call, and re-runnable.
ddev config --project-name=mydept-site --docroot=web --php-version=8.3
ddev start
ddev drush site:install standard -y`,
      ts: `# GovCMS: clone the scaffold, then provision it exactly once.
git clone https://github.com/govCMS/scaffold.git mydept-site
cd mydept-site
rm -rf .git && git init

# name: [a-z0-9-] only.  type: saas|paas|saasplus.  version: 10|11.
ahoy init mydept-site saas 11
# Preparing GovCMS Scaffold
# [info]: Preparing scaffold for GovCMS11 (saas): mydept-site
# [info]: Cleaning up
# [info]: README.md updated

# scripts/scaffold-init.sh has now removed itself.
ahoy build   # docker compose up -d --build, then ahoy govcms-deploy`,
      note: "The three arguments are validated by `scripts/scaffold-init.sh` and each bad value exits 2. After the run the provisioner is gone and the other offerings' files are deleted, so the offering is a property of the repo, not a switch you flip later.",
    },
    {
      label: "Reaching the container",
      intro:
        "On a site you control you can put Drush wherever you like. On GovCMS every command is funnelled through one wrapper, and the wrapper is deliberately transparent.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# Vanilla: drush is a project dependency, run on the host or via the tool.
vendor/bin/drush status
vendor/bin/drush cache:rebuild
vendor/bin/drush user:login

ddev ssh
ddev exec drush config:export -y
docker compose exec -T php vendor/bin/drush updatedb -y`,
      ts: `# .ahoy.yml -- the abstraction is one line deep.
commands:
  cli:
    usage: Start a shell inside cli container.
    cmd: docker compose exec cli bash

  run:
    usage: Run command inside cli container.
    cmd: docker compose exec -T cli bash -c "$*"

  drush:
    usage: Run drush commands in cli container.
    cmd: docker compose exec -T cli drush "$@"

  ship-shape:
    usage: Run site validation scripts locally
    cmd: |
      docker compose exec -T cli shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml --exclude-db --error-code . "$@"

  my:
    usage: Custom commands for this project. See \`ahoy my help\`.
    imports:
      - 'custom/ahoy.yml'`,
      note: "`ahoy drush cr` expands to `docker compose exec -T cli drush cr` — Drush lives in the `cli` container and is pinned by scaffold-tooling, so a host Drush version is irrelevant. Add your own targets to `custom/ahoy.yml`, because `.ahoy.yml` is one of the files a SaaS push is refused for changing.",
    },
    {
      label: "What the containers can see",
      intro:
        "Both offerings run the same compose file, but init decides which YAML anchor the services inherit — and that decides how much of your repo is visible inside the containers.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# docker-compose.yml on a Drupal site you own: the repo IS the application.
services:
  php:
    build: .
    volumes:
      - .:/var/www/html:delegated
    environment:
      DRUSH_OPTIONS_URI: http://mydept-site.localhost
  db:
    image: mariadb:10.11
    ports:
      - "3306"`,
      ts: `# After \`ahoy init mydept-site saas 11\` -- services merge *default-volumes.
x-volumes: &default-volumes
  volumes:
    - ./themes:/app/web/themes/custom:\${VOLUME_FLAGS:-delegated}
    - ./files:/app/web/sites/default/files:delegated
    - ./tests/behat/features:/app/tests/behat/features:\${VOLUME_FLAGS:-delegated}
    - ./tests/behat/screenshots:/app/tests/behat/screenshots:\${VOLUME_FLAGS:-delegated}
    - ./tests/phpunit/tests:/app/tests/phpunit/tests:\${VOLUME_FLAGS:-delegated}
    - ./config:/app/config

# \`ahoy init mydept-site paas 11\` sed-swaps every *default-volumes for this.
x-volumes-paas: &paas-volumes
  volumes:
    - .:/app:delegated`,
      note: "On SaaS the containers mount six paths and the Drupal codebase arrives from the `govcms/govcms` image — which is exactly why init appends `web/`, `scripts/` and `drush/` to `.gitignore`. On PaaS the whole working copy is `/app` and running `composer install` is yours.",
    },
    {
      label: "Installing and redeploying locally",
      intro:
        "The si / updb / cim / cr muscle memory survives, but each step becomes a named scaffold-tooling binary and the profile argument stops being a choice.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal: your sequence, your profile, your order.
vendor/bin/drush site:install standard -y --site-name="My Dept"
vendor/bin/drush updatedb -y
vendor/bin/drush config:import -y
vendor/bin/drush cache:rebuild
vendor/bin/drush user:login`,
      ts: `# ahoy install == drush si -y govcms, then the govcms-deploy target.
ahoy install
ahoy govcms-deploy

# What ahoy govcms-deploy actually chains, in this order:
docker compose exec -T cli mkdir -p /app/web/sites/default/files/private/tmp
docker compose exec -T cli /app/vendor/bin/govcms-db-update
docker compose exec -T cli /app/vendor/bin/govcms-config-import
docker compose exec -T cli /app/vendor/bin/govcms-cache-rebuild
docker compose exec -T cli /app/vendor/bin/govcms-enable_modules

ahoy login       # skips the TFA reset gate, unblocks uid 1, then drush uli
ahoy ship-shape  # run the platform validator before you push`,
      note: "`govcms` is the only legal profile — validators fail on anything else. Do not carry this into an interview as *the* deploy: the `ahoy govcms-deploy` target, the `scripts/govcms-deploy` script and the eight `.lagoon.yml` post-rollout tasks are three different sequences, and Lagoon runs the third.",
    },
  ],
  playground: {
    intro:
      "A model of scripts/scaffold-init.sh. It runs the same rule set for saas and paas over one starting file list, prints the two resulting repos side by side, then shows what only one offering keeps — and finally the ahoy targets that wrap it all.",
    lang: "php",
    code: `<?php

$base = [
  '.ahoy.yml',
  '.docker/Dockerfile.paas',
  '.docker/Dockerfile.saas',
  '.docker/Dockerfile.saasplus',
  '.docker/Dockerfile.solr.paas',
  '.docker/Dockerfile.solr.saas',
  '.docker/Dockerfile.solr.saasplus',
  '.docker/config/cli/govcms.site.yml',
  '.docker/scripts/sanitize.sh',
  '.env.default',
  '.github/workflows/test-scaffold.yml',
  '.gitlab-ci-inputs.yml',
  '.gitlab-ci.paas.yml',
  '.gitlab-ci.yml',
  '.lagoon.yml',
  '.version.yml',
  'composer.10.json',
  'composer.11.json',
  'custom/ahoy.yml',
  'custom/composer/composer.json',
  'docker-compose.yml',
  'scripts/scaffold-init.sh',
  'tests/behat/behat.yml',
  'tests/phpunit/phpunit.xml',
  'themes/.gitkeep',
];

function drop_paths(array $f, array $paths) {
  return array_values(array_diff($f, $paths));
}

function rename_path(array $f, $from, $to) {
  $f = array_values(array_diff($f, [$from, $to]));
  $f[] = $to;
  return $f;
}

function scaffold_init(array $f, $type, $version) {
  $f[] = '.env';
  $f = rename_path($f, '.docker/Dockerfile.' . $type, '.docker/Dockerfile.cli');
  $f = rename_path($f, '.docker/Dockerfile.solr.' . $type, '.docker/Dockerfile.solr');
  $f = drop_paths($f, ['.github/workflows/test-scaffold.yml', 'scripts/scaffold-init.sh']);
  if ($type === 'paas') {
    $f = rename_path($f, '.gitlab-ci.paas.yml', '.gitlab-ci.yml');
    $f = rename_path($f, 'composer.' . $version . '.json', 'composer.json');
    $f = drop_paths($f, ['composer.10.json', 'composer.11.json', 'themes/.gitkeep',
      '.docker/Dockerfile.saas', '.docker/Dockerfile.saasplus',
      '.docker/Dockerfile.solr.saas', '.docker/Dockerfile.solr.saasplus']);
  } else {
    $f = drop_paths($f, ['.docker/Dockerfile.paas', '.docker/Dockerfile.solr.paas',
      '.docker/config/cli/govcms.site.yml', '.docker/scripts/sanitize.sh',
      'composer.10.json', 'composer.11.json', '.gitlab-ci-inputs.yml',
      '.gitlab-ci.paas.yml', 'tests/behat/behat.yml', 'tests/phpunit/phpunit.xml']);
  }
  if ($type === 'saas') {
    $f = drop_paths($f, ['custom/composer/composer.json', '.docker/Dockerfile.saasplus',
      '.docker/Dockerfile.solr.saasplus']);
  }
  sort($f);
  return $f;
}

$saas = scaffold_init($base, 'saas', '11');
$paas = scaffold_init($base, 'paas', '11');
$w = 36;

echo "ahoy init mydept-site <type> 11  ->  resulting repo\\n\\n";
echo str_pad('saas', $w) . '  ' . "paas\\n";
echo str_repeat('-', $w) . '  ' . str_repeat('-', $w) . "\\n";
$rows = max(count($saas), count($paas));
for ($i = 0; $i < $rows; $i++) {
  $l = isset($saas[$i]) ? $saas[$i] : '';
  $r = isset($paas[$i]) ? $paas[$i] : '';
  echo rtrim(str_pad($l, $w) . '  ' . $r) . "\\n";
}

echo "\\nDIFF  (kept by one offering only)\\n";
foreach (array_diff($saas, $paas) as $p) { echo '  only saas  ' . $p . "\\n"; }
foreach (array_diff($paas, $saas) as $p) { echo '  only paas  ' . $p . "\\n"; }

$targets = [
  ['ahoy cli', 'docker compose exec cli bash'],
  ['ahoy run "<cmd>"', 'docker compose exec -T cli bash -c "<cmd>"'],
  ['ahoy drush <args>', 'docker compose exec -T cli drush <args>'],
  ['ahoy install', 'docker compose exec -T cli drush si -y govcms'],
  ['ahoy ship-shape', 'docker compose exec -T cli shipshape run -f ... --error-code .'],
  ['ahoy test-behat', 'docker compose exec -T test ./vendor/bin/govcms-behat'],
  ['ahoy my <target>', 'imports custom/ahoy.yml -- yours; .ahoy.yml is not'],
];
echo "\\nAHOY TARGETS  (each one is a docker compose call)\\n";
foreach ($targets as $t) { echo '  ' . str_pad($t[0], 20) . $t[1] . "\\n"; }`,
    output: `ahoy init mydept-site <type> 11  ->  resulting repo

saas                                  paas
------------------------------------  ------------------------------------
.ahoy.yml                             .ahoy.yml
.docker/Dockerfile.cli                .docker/Dockerfile.cli
.docker/Dockerfile.solr               .docker/Dockerfile.solr
.env                                  .docker/config/cli/govcms.site.yml
.env.default                          .docker/scripts/sanitize.sh
.gitlab-ci.yml                        .env
.lagoon.yml                           .env.default
.version.yml                          .gitlab-ci-inputs.yml
custom/ahoy.yml                       .gitlab-ci.yml
docker-compose.yml                    .lagoon.yml
themes/.gitkeep                       .version.yml
                                      composer.json
                                      custom/ahoy.yml
                                      custom/composer/composer.json
                                      docker-compose.yml
                                      tests/behat/behat.yml
                                      tests/phpunit/phpunit.xml

DIFF  (kept by one offering only)
  only saas  themes/.gitkeep
  only paas  .docker/config/cli/govcms.site.yml
  only paas  .docker/scripts/sanitize.sh
  only paas  .gitlab-ci-inputs.yml
  only paas  composer.json
  only paas  custom/composer/composer.json
  only paas  tests/behat/behat.yml
  only paas  tests/phpunit/phpunit.xml

AHOY TARGETS  (each one is a docker compose call)
  ahoy cli            docker compose exec cli bash
  ahoy run "<cmd>"    docker compose exec -T cli bash -c "<cmd>"
  ahoy drush <args>   docker compose exec -T cli drush <args>
  ahoy install        docker compose exec -T cli drush si -y govcms
  ahoy ship-shape     docker compose exec -T cli shipshape run -f ... --error-code .
  ahoy test-behat     docker compose exec -T test ./vendor/bin/govcms-behat
  ahoy my <target>    imports custom/ahoy.yml -- yours; .ahoy.yml is not
`,
  },
  keyPoints: [
    "`ahoy init <name> <type> <version>` delegates to `scripts/scaffold-init.sh`, which accepts a lowercase alphanumeric-plus-hyphen name, a type of `saas`, `paas` or `saasplus`, and a core version of `10` or `11` — anything else exits 2.",
    "Init is a one-way door: it rewrites `.env`, `.version.yml`, `docker-compose.yml` and the Dockerfiles, deletes the other offerings' files, regenerates `README.md`, and then removes itself. Changing offering means re-cloning the scaffold.",
    "The `paas` branch is where the real divergence happens — `.gitlab-ci.paas.yml` becomes `.gitlab-ci.yml`, `composer.<version>.json` becomes `composer.json`, and the `## START SaaS-only` / `## END SaaS-only` block is `sed`-deleted from `.lagoon.yml`.",
    "On `saas`/`saasplus` init appends `web/`, `scripts/` and `drush/` to `.gitignore` and deletes every `composer.*` file: your repo carries themes, config and tests, and the codebase comes from the `govcms/govcms` image.",
    "Every ahoy target is a literal `docker compose exec` line — `ahoy drush` is `docker compose exec -T cli drush \"$@\"` — so Drush never runs on the host, and `.ahoy.yml` itself is a SaaS locked file, which is why `custom/ahoy.yml` behind `ahoy my` exists.",
    "The local stack is `cli`, `php`, `nginx`, `test`, `mariadb`, `av` and `chrome` on `http://<name>.docker.amazee.io`; `solr` ships commented out, and SaaS services mount six explicit paths while PaaS services mount `.:/app`.",
  ],
  interview: [
    {
      q: "Walk me through standing up a brand-new GovCMS SaaS project from nothing.",
      a: "Clone `govCMS/scaffold`, drop its git history, then run `ahoy init <name> saas 11` — a lowercase hyphenated project name, the offering, and the Drupal major. That single run substitutes the name and version through `.env`, `docker-compose.yml`, `.version.yml` and the Dockerfiles, renames `.docker/Dockerfile.saas` to `Dockerfile.cli`, deletes the PaaS and saasplus artefacts and all the `composer.*` files, appends `web/`, `scripts/` and `drush/` to `.gitignore`, rewrites `README.md`, and then deletes the provisioner. From there it is `ahoy build`, which brings the stack up and runs `ahoy govcms-deploy`, then `ahoy install` for a fresh `drush si -y govcms`. The detail people miss in interviews is that init is not idempotent and not reversible — I have had to re-clone and re-init a repo because someone ran it with the wrong offering and the script had already removed itself.",
    },
    {
      q: "Why does the team use ahoy rather than driving docker compose directly, and what goes in `custom/ahoy.yml`?",
      a: "Because it makes the container boundary non-negotiable rather than a habit. Every target is one `docker compose exec` deep — `ahoy drush` is `docker compose exec -T cli drush \"$@\"`, `ahoy cli` is `docker compose exec cli bash` — so nobody ends up running a host Drush against a container database or against the wrong environment. On SaaS `.ahoy.yml` is on the locked-file list, so a push that edits it is refused; project-specific targets go in `custom/ahoy.yml` and are reached as `ahoy my <target>`. In practice I put database refresh helpers and theme build commands there. The other thing I use constantly is `ahoy ship-shape`, which runs the platform validator locally against the vendored `shipshape.yml` so the pipeline is not the first place a breach shows up.",
    },
    {
      q: "A developer on a SaaS project wants to add a contrib module by editing composer.json. What do you tell them?",
      a: "There is no `composer.json` to edit — `scaffold-init.sh` deletes every `composer.*` file on a `saas` or `saasplus` init, and the `.gitignore` it writes excludes `web/`, `scripts/` and `drush/` entirely. The Drupal codebase is the `govcms/govcms` image; `.docker/Dockerfile.saas` copies only `themes/`, `config` and `favicon.ico` into it. So the answer is that the theme is the code extension point, and enabling anything is governed by the `module_permissions` allowlist rather than by dependency resolution. If the module genuinely is not available, that becomes a conversation with GovCMS or a case for being on PaaS, where `composer.<version>.json` is copied to `composer.json` and dependency management comes back to you.",
    },
    {
      q: "You inherit a GovCMS repo with no documentation. How do you work out how it was scaffolded?",
      a: "`.version.yml` first — it carries `type:` and `version:` and is the file the platform's automated tasks read, so it is the authoritative answer. Then I corroborate it from the file tree, because init leaves unmistakable fingerprints: a PaaS repo has a `composer.json`, `custom/composer/`, `.docker/config/`, `.docker/scripts/sanitize.sh` and the full test harness, while a SaaS repo has none of those and does have `themes/` plus `web/`, `scripts/` and `drush/` in `.gitignore`. I also check `.lagoon.yml` for whether the `## START SaaS-only` block is still present, since init strips it for PaaS. `.docker/Dockerfile.cli` is the renamed offering Dockerfile, so reading its `COPY` lines tells you the same story a third way.",
    },
  ],
  quiz: [
    {
      question: "Which core versions does `scripts/scaffold-init.sh` accept as the third argument to `ahoy init`?",
      options: [
        "8 or 9",
        "9 or 10",
        "10 or 11",
        "Any Drupal core constraint, e.g. ^11.3",
      ],
      answerIndex: 2,
      explain:
        "The script validates the version against exactly `10` and `11` and otherwise prints an `[error]:` line and exits 2. Older usage text in the repo has drifted and still mentions earlier majors — the script is the authority, not the help string.",
    },
    {
      question: "A repo was scaffolded with `ahoy init mydept-site saas 11` and the team now wants PaaS. What actually has to happen?",
      options: [
        "Re-clone the scaffold and init again — the provisioner deleted itself along with the other offering's files",
        "Re-run `ahoy init mydept-site paas 11` in place",
        "Edit `type:` in `.version.yml` to `paas` and rebuild",
        "Run `ahoy my switch-offering paas`",
      ],
      answerIndex: 0,
      explain:
        "`scaffold-init.sh` ends with `rm scripts/scaffold-init.sh`, and by then it has already deleted the PaaS Dockerfiles, `composer.10.json`/`composer.11.json`, `.gitlab-ci-inputs.yml`, `.gitlab-ci.paas.yml`, `.docker/config/` and `.docker/scripts/`. Flipping `.version.yml` changes what the platform thinks the project is without restoring any of the files it needs.",
    },
    {
      question: "What does `ahoy drush cache:rebuild` do?",
      options: [
        "Runs a host-installed Drush against the container's database over the exposed MariaDB port",
        "Opens an SSH session to the Lagoon environment and runs Drush there",
        "Runs `ddev exec drush cache:rebuild` under the hood",
        "Runs `docker compose exec -T cli drush cache:rebuild` — Drush lives in the cli container",
      ],
      answerIndex: 3,
      explain:
        "The `drush` target in `.ahoy.yml` is literally `docker compose exec -T cli drush \"$@\"`. Drush is a dependency of the image, pinned by scaffold-tooling, and is never expected on the host PATH.",
    },
    {
      question: "Which of these files exists after a `paas` init but not after a `saas` init?",
      options: [
        ".lagoon.yml",
        "composer.json",
        ".version.yml",
        "docker-compose.yml",
      ],
      answerIndex: 1,
      explain:
        "The PaaS branch copies `composer.<version>.json` to `composer.json`; the SaaS branch deletes every `composer.*` file. `.lagoon.yml`, `.version.yml` and `docker-compose.yml` are present for both — `.lagoon.yml` simply has the `## START SaaS-only` block `sed`-deleted on PaaS.",
    },
  ],
};

export default lesson;
