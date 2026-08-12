import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "migrating-to-modern-workflow",
  title: "Modernising a Legacy Deployment",
  part: "Safety & Operations",
  estMinutes: 14,
  summary:
    "Take a site that ships by FTP and is edited in the production UI to a Composer-managed, config-synced, CI-deployed one — in independently valuable, individually reversible steps, without ever asking the business for a freeze.",

  concept: `
## The site you have actually been handed

Four developers, one Drupal site, and no deployment. Contrib modules were
unzipped into \`sites/all/modules\` years ago and patched in place. Views are
built in production because that is where the content is. The "backup" is a
folder called \`site_old_2023\` next to the docroot. Everybody knows this is
bad; nobody can point at the week it gets fixed.

The instinct is to rebuild. Resist it: a rebuild is a single enormous
irreversible change that produces nothing until it produces everything, which
is exactly the shape of project that gets cancelled in month four. Modernise
in an ordered sequence where **each step is valuable the day it lands and can
be abandoned without unwinding the previous one.**

### The sequence

1. **Get the tree into git.** Rsync production down, commit it — vendor
   directories, patched modules, the lot. It is ugly and it is the single
   highest-value hour of the project: from now on you can *see* what
   production runs, and diff it against yesterday.
2. **A reproducible local environment.** DDEV or Lando plus a sanitised
   database dump, so a change can be tried somewhere other than production.
   Until this exists, every other improvement is theoretical.
3. **Convert to Composer.** The hard step, and the only genuinely one-way one.
   The destination is \`drupal/recommended-project\`, a clean build with a
   relocated \`web/\` docroot that you move the custom code into.
   \`drupal/legacy-project\` keeps the docroot at the repository root and so
   matches the old tarball structure, which buys you a conversion without
   rewriting every path — but core marked it abandoned in Drupal 11.4 in
   favour of \`drupal/recommended-project\`, so treat it as a short-lived
   stepping stone with a follow-up step that relocates to \`web/\`, never as a
   destination. Inventory every contrib module and its version first,
   re-declare them as \`composer require\` lines, and convert hand-edits into
   patches under \`cweagans/composer-patches\`.
4. **Baseline the config.** Set \`$settings['config_sync_directory']\`, run
   \`drush cex\` against a copy of production, and commit the result. It will be
   several hundred files in one commit. That is correct — it is the "before"
   photograph, not a design.
5. **One deploy script.** A shell file in the repo that pulls code, runs
   \`drush deploy\` (updatedb, config:import, cache:rebuild, deploy:hook) and
   exits non-zero on failure. Run it by hand at first. Automating an unwritten
   process just makes it fail faster.
6. **CI gates, one at a time.** Lint and \`composer validate\` first, because
   they are cheap and never controversial. Then a config import against a
   sanitised production database. Then tests. Add each one non-blocking for a
   sprint, fix what it finds, and only then make it required.
7. **Close the door.** Once the pipeline can actually deploy config, revoke
   the admin permissions that let people build views in production, and add
   \`config_ignore\` entries for the handful of items that genuinely must stay
   editable there.

### Managing the middle

Steps 3 to 6 produce nothing a stakeholder can see. Buy that time by
converting the work into risk language they already care about — "we cannot
currently apply a security release without downtime" — and by shipping one
small visible fix per sprint through the new pipeline. Every deploy that
works is your progress report.
`,

  comparisons: [
    {
      label: "Step 3: taking control of dependencies",
      intro:
        "Both teams are pulling a hand-managed codebase into a dependency manager. The Symfony team is usually converting an autoloader; the Drupal team is converting an entire directory tree, including modules somebody edited in place.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Legacy Symfony/PHP app: libraries live in lib/,
# loaded by a hand-written autoloader.

# 1. Inventory what is actually loaded.
grep -r "require_once" src/ | sort -u > /tmp/deps.txt

# 2. Declare them properly, pinned to what runs today.
composer require monolog/monolog:^2.9 \\
  guzzlehttp/guzzle:^7.8 symfony/console:^6.4

# 3. Swap the hand-rolled autoloader for Composer's.
#    require 'lib/autoload.php';  ->
#    require __DIR__.'/../vendor/autoload.php';

# 4. Delete lib/, run the test suite, commit.
git rm -r lib/ && vendor/bin/phpunit

# Hand-edits to a library are rare, and when they
# exist they are usually a fork you already own.`,
      ts: `# Legacy Drupal: contrib unzipped into
# sites/all/modules, some of it patched in place.

# 1. Inventory contrib AND its exact versions.
drush pm:list --type=module --status=enabled \\
  --format=json > /tmp/modules.json

# 2. Diff every contrib module against its release to
#    find the hand-edits you must preserve. No Drush
#    command does this: fetch the release and diff.
url=https://ftp.drupal.org/files/projects
for m in webform pathauto metatag; do
  v=$(awk -F"'" '/^version:/ {print $2}' \\
    sites/all/modules/$m/$m.info.yml)
  curl -sL $url/$m-$v.tar.gz | tar xz -C /tmp
  diff -ru /tmp/$m sites/all/modules/$m
done

# 3. New Composer skeleton:
composer create-project drupal/recommended-project new
#   -> docroot relocated to web/; the destination
composer create-project drupal/legacy-project new
#   -> docroot at the repo root, matching the old
#      tarball layout; less to rewrite in deploys,
#      BUT core abandoned it in 11.4 in favour of
#      recommended-project. Stepping stone only.

# 4. Re-declare contrib, pinned to what prod runs.
composer require drupal/webform:^6.2 drupal/pathauto:^1.12

# 5. Hand-edits become patches, never re-edits.
#    composer.json -> extra.patches, applied by
#    cweagans/composer-patches on every install.

# 6. Move custom modules/themes across, then
#    composer install && drush cr && smoke test.`,
      note:
        "The step with no Symfony analogue is the patch archaeology. A Drupal site of this vintage always has at least one contrib module edited in place, and if you do not find those edits before you switch to Composer, the first composer update silently deletes them.",
    },
    {
      label: "Step 4: the first export is a big, boring commit",
      intro:
        "Both stacks need a baseline: a recorded 'this is what production is right now' that later changes can be diffed against. Doctrine gives you one for the schema; Drupal gives you one for config, and it is much larger than people expect.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: the schema exists, the migrations
# table does not. Baseline it.

# Generate one migration describing today's schema.
bin/console doctrine:migrations:diff

# Mark it as already run everywhere it is already
# true - prod's tables are not recreated.
bin/console doctrine:migrations:version \\
  'DoctrineMigrations\\Version20260811090000' \\
  --add --no-interaction

# From here every change is a small migration.
# Note what did NOT need baselining: config/packages
# was in git from day one, so there is no config
# drift to capture. That problem does not exist.`,
      ts: `# Drupal: config lives in the database and has
# never been exported. Capture it once.

# 1. Point Drupal at a sync directory OUTSIDE the
#    docroot (settings.php):
#    $settings['config_sync_directory'] = '../config/sync';

# 2. Export from a COPY of production, not from a
#    developer's local site.
drush @local sql:drop -y
gunzip -c prod-sanitised.sql.gz | drush @local sqlc
drush @local config:export -y

git add config/sync && git status --short | wc -l
# 612

git commit -m "Baseline: export production config"

# 3. Prove the loop closes before trusting it.
drush @local config:import -y
drush @local config:status
# [notice] No differences between DB and sync dir.`,
      note:
        "Review that 612-file commit for secrets and environment-specific values, then stop reviewing it — it is a snapshot of what already runs, not a proposal. The commit that matters is the next one, which will be five lines. Note the site UUID in system.site: every environment importing this config must share it.",
    },
    {
      label: "Step 6: adding CI gates one at a time",
      intro:
        "Nobody accepts a pipeline that fails on day one against a legacy codebase. Both teams introduce gates in the same order — cheapest and least arguable first — and let each one run non-blocking for a sprint before it is allowed to stop a merge.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .github/workflows/ci.yml - Symfony
name: CI
on: [pull_request]
jobs:
  gate-1-static:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: composer validate --strict
      - run: composer install --no-interaction
      - run: vendor/bin/php-cs-fixer fix --dry-run
      - run: vendor/bin/phpstan analyse --level=5

  gate-2-schema:
    needs: gate-1-static
    steps:
      - run: bin/console doctrine:migrations:migrate
              --no-interaction
      - run: bin/console doctrine:schema:validate

  gate-3-tests:
    needs: gate-2-schema
    steps:
      - run: vendor/bin/phpunit

# No database needed for gate 1 or 2: migrations
# build the schema from empty, deterministically.`,
      ts: `# .github/workflows/ci.yml - Drupal
name: CI
on: [pull_request]
jobs:
  gate-1-static:            # week 1, blocking
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: composer validate --strict
      - run: composer install --no-interaction
      - run: vendor/bin/phpcs --standard=Drupal web/modules/custom
      - run: vendor/bin/phpstan analyse

  gate-2-config:            # week 4, non-blocking first
    needs: gate-1-static
    services:
      mysql: { image: mariadb:10.11 }
    steps:
      # The gate only means something against a copy
      # of prod's ACTIVE config, not a fresh install.
      - run: gunzip -c fixtures/prod-sanitised.sql.gz | drush sqlc
      - run: drush updatedb -y
      - run: drush config:import -y
      # The import itself never fails the build - it exits 0
      # whether or not it had work to do. THIS is the gate:
      # grep fails the step if anything did not round-trip.
      - run: drush config:status 2>&1 | grep "No differences"

  gate-3-tests:             # week 8
    needs: gate-2-config
    steps:
      - run: vendor/bin/phpunit web/modules/custom`,
      note:
        "Gate 2 is the one that pays for the whole project, and it only works against a sanitised production database — importing into a fresh install proves nothing, because the failures you are hunting come from prod's active config disagreeing with the export. Note that the import command is not the assertion: `drush config:import` exits 0 whether it applied changes or found none, so the gate is the `config:status` line after it, whose grep fails the step if anything did not round-trip.",
    },
    {
      label: "Step 7: closing the door on production edits",
      intro:
        "The last step is the only one that changes what colleagues are allowed to do, which is why it goes last — you must be able to deliver their changes through the pipeline before you take the UI away.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony: there was never a door to close. The
// only way to change behaviour in prod is a deploy.

// config/packages/prod/framework.yaml is read-only
// on disk, and the container is compiled at build
// time into var/cache/prod - editing a YAML file on
// the server does nothing until a rebuild.

// The equivalent hardening is about who can deploy
// and who can read secrets:
//   - branch protection on main
//   - deploy key with no shell
//   - secrets in the vault, decrypted at boot
//     bin/console secrets:decrypt-to-local --force

// Nobody has ever created "drift" in a Symfony app,
// because there is no writable configuration store
// for them to drift from.`,
      ts: `# Drupal: the door is open by default, so shut it
# deliberately - in three places.

# 1. Permissions: on prod, nobody holds
#    'administer views', 'administer filters',
#    'administer site configuration'.
#    Roles are config, so this ships like anything else.

# 2. settings.prod.php - stop writes at the source
#    (contrib config_readonly module):
#    $settings['config_readonly'] = TRUE;

# 3. config/sync/config_ignore.settings.yml
#    The genuine exceptions, listed explicitly.
#    'mode' is required: it is what the schema
#    resolves the list's shape against. simple = a
#    flat list; intermediate/advanced split it into
#    import/export or create/update/delete sub-lists.
mode: simple
ignored_config_entities:
  # Editors legitimately tune this in prod.
  - system.site:slogan
  # Set by the hosting platform, per environment.
  - system.performance
  # Third-party ids differ per environment.
  - google_analytics.settings

# Everything NOT on this list is drift, and
# drush config:status on prod will now say so.`,
      note:
        "Keep the ignore list short, explicit and commented — every entry is a piece of production state that no longer round-trips through review. If the list starts growing, the real answer is usually a settings.php override or a config split, not another exception.",
    },
  ],

  playground: {
    intro:
      "The whole argument of this section is sequencing: order the work so each step ships value alone, and so the one irreversible step happens where you can rehearse it. Here the remediation backlog is data — dependencies, reversibility, standalone value — and the script derives the landing order, then answers the stakeholder question 'can we just ban production edits next sprint?' with the list of things that have to happen first.",
    lang: "php",
    code: `<?php

// The remediation backlog for the legacy site. Each step records what it
// depends on, whether it can be undone cheaply, and - the important column -
// what it buys the team ON ITS OWN, before the next step lands.
$plan = [
  'git' => [
    'title' => 'Import the FTP tree into git',
    'needs' => [],
    'reversible' => TRUE,
    'value' => 'prod is finally diffable',
  ],
  'local' => [
    'title' => 'Reproducible local environment',
    'needs' => ['git'],
    'reversible' => TRUE,
    'value' => 'changes can be tried off production',
  ],
  'composer' => [
    'title' => 'Convert to Composer',
    'needs' => ['git', 'local'],
    'reversible' => FALSE,
    'value' => 'core and contrib updates become routine',
  ],
  'lint' => [
    'title' => 'CI gate 1: lint + composer validate',
    'needs' => ['composer'],
    'reversible' => TRUE,
    'value' => 'broken syntax stops at the pull request',
  ],
  'cex' => [
    'title' => 'Baseline export of prod config',
    'needs' => ['composer'],
    'reversible' => TRUE,
    'value' => 'config becomes reviewable',
  ],
  'deploy' => [
    'title' => 'One deploy script, run by hand',
    'needs' => ['cex'],
    'reversible' => TRUE,
    'value' => 'the deploy stops living in one head',
  ],
  'cim_ci' => [
    'title' => 'CI gate 2: import against a prod copy',
    'needs' => ['cex', 'lint'],
    'reversible' => TRUE,
    'value' => 'import failures surface before deploy day',
  ],
  'tests' => [
    'title' => 'CI gate 3: smoke tests',
    'needs' => ['cim_ci'],
    'reversible' => TRUE,
    'value' => 'regressions are caught, not reported',
  ],
  'lock_ui' => [
    'title' => 'Forbid prod UI edits, config_ignore the exceptions',
    'needs' => ['cim_ci', 'deploy'],
    'reversible' => TRUE,
    'value' => 'drift stops being created',
  ],
];

// Kahn's algorithm: the order in which the steps can actually land.
$remaining = $plan;
$done = [];
$order = [];
while ($remaining) {
  $progressed = FALSE;
  foreach ($remaining as $id => $step) {
    if (!array_diff($step['needs'], $done)) {
      $order[] = $id;
      $done[] = $id;
      unset($remaining[$id]);
      $progressed = TRUE;
      break;
    }
  }
  if (!$progressed) {
    echo "Cycle in the plan - nothing can start.\\n";
    break;
  }
}

echo "Landing order (each row is shippable on its own):\\n";
foreach ($order as $i => $id) {
  printf("  %d. %-52s %-12s %s\\n",
    $i + 1,
    $plan[$id]['title'],
    $plan[$id]['reversible'] ? '[revertable]' : '[ONE-WAY]',
    $plan[$id]['value']);
}

// The stakeholder shortcut: "can we just ban prod edits this sprint?"
function unmet(array $plan, string $target, array $shipped, array &$seen = []): array {
  $missing = [];
  foreach ($plan[$target]['needs'] as $need) {
    if (isset($seen[$need])) {
      continue;
    }
    $seen[$need] = TRUE;
    if (!in_array($need, $shipped, TRUE)) {
      $missing[] = $need;
      $missing = array_merge($missing, unmet($plan, $need, $shipped, $seen));
    }
  }
  return $missing;
}

$shipped = ['git', 'local'];
$asked = 'lock_ui';
$blockers = unmet($plan, $asked, $shipped);
usort($blockers, fn($a, $b) => array_search($a, $order, TRUE) <=> array_search($b, $order, TRUE));

echo "\\nRequest: ship '" . $plan[$asked]['title'] . "' next sprint.\\n";
echo "Already shipped: " . implode(', ', $shipped) . "\\n";
echo "Blocked on " . count($blockers) . " earlier steps:\\n";
foreach ($blockers as $id) {
  echo "  - " . $plan[$id]['title'] . "\\n";
}

$oneWay = array_keys(array_filter($plan, fn($s) => !$s['reversible']));
echo "\\nOnly " . count($oneWay) . " of " . count($plan) . " steps is hard to reverse: "
  . implode(', ', $oneWay) . ". Rehearse that one on a clone.\\n";
`,
    output: `Landing order (each row is shippable on its own):
  1. Import the FTP tree into git                         [revertable] prod is finally diffable
  2. Reproducible local environment                       [revertable] changes can be tried off production
  3. Convert to Composer                                  [ONE-WAY]    core and contrib updates become routine
  4. CI gate 1: lint + composer validate                  [revertable] broken syntax stops at the pull request
  5. Baseline export of prod config                       [revertable] config becomes reviewable
  6. One deploy script, run by hand                       [revertable] the deploy stops living in one head
  7. CI gate 2: import against a prod copy                [revertable] import failures surface before deploy day
  8. CI gate 3: smoke tests                               [revertable] regressions are caught, not reported
  9. Forbid prod UI edits, config_ignore the exceptions   [revertable] drift stops being created

Request: ship 'Forbid prod UI edits, config_ignore the exceptions' next sprint.
Already shipped: git, local
Blocked on 5 earlier steps:
  - Convert to Composer
  - CI gate 1: lint + composer validate
  - Baseline export of prod config
  - One deploy script, run by hand
  - CI gate 2: import against a prod copy

Only 1 of 9 steps is hard to reverse: composer. Rehearse that one on a clone.
`,
  },

  keyPoints: [
    "Modernise incrementally, not by rebuilding: order the work so every step is valuable the day it lands and can be abandoned without unwinding the one before it.",
    "Commit the FTP tree as-is first — ugly, complete, and instantly useful, because from that hour on you can diff what production actually runs.",
    "Converting to Composer is the one genuinely one-way step; inventory contrib versions and hunt down modules that were patched in place before you switch, or the first composer update erases those edits.",
    "The first drush cex against a copy of production is a several-hundred-file commit and that is correct — it is a snapshot, not a design. Prove the loop closes by importing it back and getting a clean config:status.",
    "Add CI gates one at a time, cheapest first (lint and composer validate, then config import against a sanitised prod database, then tests), running each non-blocking for a sprint before making it required.",
    "Forbid production UI edits only once the pipeline can deliver config changes reliably, then list the genuine exceptions explicitly in config_ignore and keep that list short.",
  ],

  interview: [
    {
      q: "You inherit a Drupal site deployed by FTP with all site building done in production. Where do you start, and why not with a rebuild?",
      a: "I start by rsyncing production into a git repository and committing it exactly as it is — patched contrib, stray files and all. It takes an hour and it changes the fundamentals: from that point the team can see what production runs and diff it against yesterday, which is the prerequisite for every other improvement. Then a reproducible local environment, so a change can be tried somewhere other than prod. I avoid the rebuild because it is one enormous irreversible change that delivers nothing until it delivers everything, and those projects get cancelled in month four when the business asks what it has bought. The incremental sequence also means that if the work is paused, the site is still better than it was rather than half-migrated.",
    },
    {
      q: "What actually makes the Composer conversion the hard step, and how do you de-risk it?",
      a: "Two things. First, the layout changes: `drupal/recommended-project` relocates the docroot to `web/`, which breaks every path in the web server config and deploy scripts, so on a site that cannot absorb that in one go I buy time with `drupal/legacy-project`, whose layout keeps the docroot at the repository root — but only as a stepping stone, because core marked that template abandoned in Drupal 11.4 in favour of `drupal/recommended-project`, so relocating to `web/` becomes a scheduled follow-up step rather than something I skip. Second, and worse, a site of this vintage always has contrib modules that were edited in place — a patch someone applied by hand in 2019 and never recorded. Once Composer owns those directories, the next `composer update` silently deletes those edits and you find out in production. So before converting I diff every enabled contrib module against a clean copy of its release, and convert each hand-edit into a real patch file applied by `cweagans/composer-patches`. I rehearse the whole conversion on a clone with a copy of the production database, and I keep the old tree on a branch until the new one has survived a real deploy.",
    },
    {
      q: "Your first drush cex produces a commit with 600 config files. How do you get that reviewed?",
      a: "I do not ask anyone to review it as a change, because it is not one — it is a photograph of what already runs in production, and the site behaves identically before and after. What I do review it for is narrow and specific: secrets or API keys that ended up in config, environment-specific values like file paths and analytics ids that should become `settings.php` overrides or `config_ignore` entries, and the site UUID in `system.site`, since every environment importing this must share it. Then I prove the loop closes by importing the export back into the copy and checking `drush config:status` reports no differences. The commit that gets a real review is the next one, which will be five lines, and that is the whole point of the exercise.",
    },
    {
      q: "How do you keep stakeholders on side during the months when this work has no visible output?",
      a: "I translate it into risk they already own rather than engineering virtue. 'We currently cannot apply a security release without downtime, and we cannot roll back if it breaks' lands very differently from 'we want to adopt Composer'. I also make the sequence itself the reporting mechanism: each step ships something concrete and I say what it bought — after step one we can see what production runs, after the baseline export we can review config changes, after gate two we catch import failures before deploy day. And I deliberately push one small visible fix per sprint through the new pipeline, so the pipeline's existence is demonstrated by ordinary work getting delivered rather than by a status update. The last step, removing admin permissions in production, needs the most political groundwork, which is exactly why it goes last — by then the team has months of evidence that changes get delivered without the UI.",
    },
  ],

  quiz: [
    {
      question:
        "Which step of the modernisation sequence is the genuinely irreversible one that deserves a full rehearsal on a clone?",
      options: [
        "Committing the FTP tree into git",
        "Converting the codebase to Composer",
        "Running the first drush cex and committing config/sync",
        "Adding a lint gate to CI",
      ],
      answerIndex: 1,
      explain:
        "Committing the tree, exporting config and adding CI gates can all be reverted or simply ignored. The Composer conversion changes the directory layout, takes ownership of contrib directories and can destroy in-place patches, so it is the one to rehearse against a clone with a copy of the production database before doing it for real.",
    },
    {
      question:
        "Why must the CI config-import gate run against a sanitised copy of the production database rather than a fresh Drupal install?",
      options: [
        "Because a fresh install has no config_sync_directory setting",
        "Because drush config:import refuses to run on a site installed from scratch",
        "Because the failures you are hunting come from production's active config disagreeing with the export, which a fresh install cannot reproduce",
        "Because the site UUID is only generated when a database dump is imported",
      ],
      answerIndex: 2,
      explain:
        "Importing into a fresh install proves only that the YAML is internally consistent. The real deploy-day failures — missing dependencies, entity types with data, config that exists in prod but not in the export — only appear when the import runs against the same active configuration production actually has.",
    },
    {
      question:
        "Why is 'forbid production UI edits and add config_ignore for the exceptions' placed last in the sequence rather than first?",
      options: [
        "Because config_ignore cannot be installed until the site uses Composer",
        "Because you must be able to deliver colleagues' changes through the pipeline before you take the UI away from them",
        "Because permissions are content, not config, and cannot be deployed",
        "Because drush config:status only works once tests exist",
      ],
      answerIndex: 1,
      explain:
        "Removing 'administer views' from production on day one stops the drift and also stops the work, because there is no working alternative route yet. Once the deploy script and the config-import gate exist, the UI can be closed without blocking anybody — and the few genuine exceptions get listed explicitly in config_ignore.",
    },
    {
      question:
        "What does 'drush deploy' run, in order, on the production server?",
      options: [
        "config:import, then updatedb, then cache:rebuild",
        "updatedb, then config:import, then cache:rebuild, then deploy:hook",
        "cache:rebuild, then config:import, then a database backup",
        "composer install, then updatedb, then config:export",
      ],
      answerIndex: 1,
      explain:
        "drush deploy standardises the sequence: updatedb (hook_update_N then hook_post_update_NAME), config:import, cache:rebuild, then deploy:hook for logic that must run after the new configuration is in place. Drupal 11.2 and later add a cache:warm step at the end. Getting your legacy deploy down to this single command is the goal of step five.",
    },
  ],
};

export default lesson;
