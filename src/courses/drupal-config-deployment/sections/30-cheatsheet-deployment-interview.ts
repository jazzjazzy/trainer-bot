import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-deployment-interview",
  title: "Cheat Sheet & Interview Prep",
  part: "Safety & Operations",
  estMinutes: 13,
  summary:
    "The capstone index: the deploy sequence and its emergency variant, the config-vs-content-vs-state-vs-code-vs-secret decision table, the failure catalogue with its first diagnostic, the Symfony-to-Drupal reflex map, and the deployment questions a hiring panel actually asks.",

  concept: `
## The sequence, memorised

Say it until it is muscle memory. Every step is where it is because the next one
depends on it:

\`\`\`bash
git checkout v42 && build the release dir   # 1. new code exists on disk
composer install --no-dev -o                # 2. autoloader, before anything runs
drush sql:dump --gzip --result-file=pre.sql # 3. the last fully reversible moment
drush maint:set 1                           # 4. only if the release is destructive
ln -sfn releases/v42 current                # 5. atomic code switch
drush deploy -y                             # 6. the four-in-one, see below
drush maint:set 0                           # 7. once caches are warm
\`\`\`

\`drush deploy\` (Drush 13+) runs \`drush updatedb\`, \`drush config:import\`,
\`drush cache:rebuild\`, \`drush deploy:hook\`, plus \`drush cache:warm\` on
Drupal 11.2+. Drush 12 and earlier ran a different shape —
\`updatedb --no-cache-clear\` with a cache rebuild on *both* sides of the import —
so older runbooks and blog posts will not match. The ordering that matters is
the same in both: **update hooks build the structures incoming config
references**, so \`updatedb\` precedes \`cim\`. That is also why
\`hook_post_update_NAME()\` runs *before* the import and \`hook_deploy_NAME()\`
*after* it — the split exists so you can choose which side of the config
boundary your code wakes up on.

**The emergency variant.** Site is down, the fix must land now: skip the tag,
skip the full CI run, never skip step 3. Snapshot, deploy the one-line hotfix,
then immediately open the pull request that puts the same commit on your main
branch — otherwise the next normal deploy silently reverts your fix.

## Five buckets, three questions

Ask in this order; the first YES decides.

- **Would leaking it be an incident?** → **secret**. Environment variable or
  platform secret store, read in \`settings.php\`. Never in \`config/sync\`.
- **Did a human author it in the site UI?** → **content**. Nodes, media, users,
  terms. Ships only via \`default_content\`, Migrate or a recipe's \`content/\`.
- **Did the running site write it to itself?** → **state**. Cron timestamps,
  counters, last-run markers. \`State\`/\`KeyValue\`, never exported.
- **Does it round-trip through \`drush cex\`?** → **config**. If its value differs
  per environment, it still lives in \`config/sync\` — plus a config_split folder
  or a \`$config[...]\` override in \`settings.php\`.
- **Otherwise** → **code**. Git, Composer, the release.

## Failure catalogue, first move only

| Symptom | First diagnostic |
| --- | --- |
| Site UUID mismatch on \`cim\` | \`drush cget system.site uuid\` at both ends |
| "depends on X which does not exist" | is the provider in \`core.extension\` **and** \`composer.json\`? |
| \`cim\` wants to delete a prod change | \`drush config:status\` on prod *before* importing |
| Module in config, missing from \`composer.json\` | \`composer why drupal/thing\` — nobody required it |
| \`updatedb\` died mid-hook | read the schema version; a failed hook is not recorded, so it re-runs |
| Split exported to the wrong folder | \`drush cget config_split.config_split.NAME --include-overridden\` |

## Symfony reflexes, translated

- \`config/packages/{env}/\` → \`config/sync\` + config_split folders
- \`.env\` / \`.env.local\` / secrets vault → \`settings.php\` + \`settings.local.php\` + platform secrets
- \`doctrine:migrations:migrate\` → \`drush updatedb\` (\`hook_update_N\`, \`hook_post_update_NAME\`, \`hook_deploy_NAME\`)
- Symfony Flex recipes → Drupal recipes (\`drush recipe\`)
- Doctrine fixtures → \`default_content\` / a recipe's \`content/\` directory
- \`cache:warmup\` in the release dir → \`drush cache:rebuild\` against the live database
`,

  comparisons: [
    {
      label: "Per-environment configuration",
      intro:
        "Symfony resolves the environment at container build time and the result is a build artifact. Drupal has one shared export plus two mechanisms that bend it per environment.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/monolog.yaml        (all envs)
# config/packages/dev/monolog.yaml    (dev only)
# config/packages/prod/monolog.yaml   (prod only)

# config/packages/prod/monolog.yaml
monolog:
  handlers:
    main:
      type: fingers_crossed
      action_level: error

# Chosen by APP_ENV, baked into the compiled
# container. Nothing is stored; nothing drifts.`,
      ts: `# config/sync/system.performance.yml  (shared)
css:
  preprocess: true
js:
  preprocess: true

# config/dev/system.performance.yml
# (written only when the dev split is active)
css:
  preprocess: false
js:
  preprocess: false

# config/sync/config_split.config_split.dev.yml
folder: ../config/dev
status: false          # flipped per env in settings.php`,
      note:
        "Drupal has no per-environment sync directory. config_split transforms the export/import storage, and settings.php $config[...] overrides sit on top of the active store at read time — an override never appears in drush cex, which is exactly why it is safe for secrets and dangerous for surprises.",
    },
    {
      label: "Secrets and environment values",
      intro:
        "Both stacks agree the value must not be committed. They disagree about where the indirection lives.",
      leftLang: "bash",
      rightLang: "php",
      php: `# .env             committed, defaults only
APP_ENV=dev
DATABASE_URL=postgresql://app@127.0.0.1/app

# .env.local       gitignored, per machine
# .env.prod.local  gitignored, on the server

# Or the encrypted vault:
php bin/console secrets:set STRIPE_SECRET
php bin/console secrets:list --reveal
# APP_RUNTIME_ENV picks the decryption key.`,
      ts: `<?php
// settings.php - committed, no values in it.
$settings['config_sync_directory'] = '../config/sync';
$settings['hash_salt'] = getenv('DRUPAL_HASH_SALT');

// Read the secret at runtime, override the
// config object that would otherwise export it.
$config['four_rivers_pay.settings']['stripe_secret']
  = getenv('STRIPE_SECRET_KEY');

// Per-machine extras, gitignored.
if (file_exists($app_root . '/' . $site_path . '/settings.local.php')) {
  include $app_root . '/' . $site_path . '/settings.local.php';
}`,
      note:
        "The Drupal-specific trap: a config override changes what the site does but leaves the exported YAML untouched, so drush cex still writes the placeholder and drush config:status still says everything is in sync. Read overridden values with drush cget --include-overridden.",
    },
    {
      label: "Evolving the database",
      intro:
        "One command on each side, but Drupal's has three entry points and no down-migration.",
      leftLang: "bash",
      rightLang: "bash",
      php: `$ php bin/console doctrine:migrations:status
$ php bin/console doctrine:migrations:migrate
$ php bin/console doctrine:migrations:migrate prev

# up() and down() are both written by you.
# Reverting a release can revert the schema.
# Fixtures reload the dev database:
$ php bin/console doctrine:fixtures:load`,
      ts: `$ drush updatedb:status
$ drush updatedb -y      # hook_update_N + hook_post_update_NAME
$ drush deploy:hook -y   # hook_deploy_NAME, after cim

# No down(). Reverting the release does NOT
# revert the schema - only a restore does.
$ drush sql:dump --gzip --result-file=pre.sql
$ drush sql:sanitize     # after pulling prod down`,
      note:
        "hook_update_N and hook_post_update_NAME run inside drush updatedb, before config import; hook_deploy_NAME runs after it. None of them is reversible, which is the entire argument for taking the database snapshot immediately before updatedb.",
    },
    {
      label: "Standing a site up from nothing",
      intro:
        "Both ecosystems package 'make the project look like this' — and both keep seed content separate from configuration.",
      leftLang: "bash",
      rightLang: "bash",
      php: `$ composer require symfony/security-bundle
# Flex applies the recipe: writes config/packages
# files, env vars, and a bundles.php entry.

$ composer recipes
$ composer recipes:update symfony/framework-bundle

# Seed data is a separate concern:
$ php bin/console doctrine:fixtures:load --append`,
      ts: `$ drush site:install --existing-config
# Installs FROM config/sync and adopts its site UUID.

$ drush recipe recipes/team4_blog
# Applies a recipe.yml: install modules, import
# config, run config actions, load content/.

$ drush cim -y && drush cr
# Seed content is separate here too:
$ drush en default_content && drush dcer node 12`,
      note:
        "A Flex recipe writes files you then own; a Drupal recipe writes config into the database and is not tracked afterwards, so re-running it is not an upgrade path. Recipes are unpacked one-shot bootstrapping in both stacks.",
    },
  ],

  playground: {
    intro:
      "The whole cheat sheet as code. First the classifier: five buckets from a decision tree, with the three questions ('would you commit it? deploy it? does it differ per environment?') shown as consequences. Then the failure catalogue, symptom to first command.",
    lang: "php",
    code: `<?php

// Five buckets, one decision tree. Ask the questions in this order and the
// first YES decides - that is the whole classification exercise.
function classify(array $a): array {
  if ($a['secret']) {
    return ['SECRET', 'env var or platform secret store; never in git'];
  }
  if ($a['authored']) {
    return ['CONTENT', 'default_content / Migrate, or it does not ship'];
  }
  if ($a['runtime']) {
    return ['STATE', 'State API; never exported, never deployed'];
  }
  if ($a['stored']) {
    return $a['perEnv']
      ? ['CONFIG', 'config/sync plus a config_split folder']
      : ['CONFIG', 'config/sync, moved by drush cim'];
  }
  return ['CODE', 'git plus composer, moved by the release'];
}

$defaults = ['secret' => FALSE, 'authored' => FALSE, 'runtime' => FALSE,
             'stored' => FALSE, 'perEnv' => FALSE];

$artefacts = [
  'views.view.campaigns' => ['stored' => TRUE],
  'core.extension (module list)' => ['stored' => TRUE],
  'devel + webprofiler enabled' => ['stored' => TRUE, 'perEnv' => TRUE],
  'system.performance aggregation' => ['stored' => TRUE, 'perEnv' => TRUE],
  'src/Controller/CampaignController' => [],
  'composer.lock' => [],
  'the 12 campaign landing pages' => ['authored' => TRUE],
  'system.cron last-run timestamp' => ['runtime' => TRUE],
  'Stripe live secret key' => ['secret' => TRUE],
];

printf("%-34s %-6s %-6s %-7s %-7s %s\\n",
  'ARTEFACT', 'COMMIT', 'DEPLOY', 'PER-ENV', 'BUCKET', 'MECHANISM');
foreach ($artefacts as $name => $flags) {
  $a = array_merge($defaults, $flags);
  [$bucket, $mechanism] = classify($a);
  $tracked = $bucket === 'CODE' || $bucket === 'CONFIG';
  printf("%-34s %-6s %-6s %-7s %-7s %s\\n",
    $name,
    $tracked ? 'yes' : 'no',
    $tracked ? 'yes' : 'no',
    ($a['perEnv'] || !$tracked) ? 'yes' : 'no',
    $bucket,
    $mechanism);
}

// The other half of the cheat sheet: symptom -> the ONE command you run first.
$failures = [
  'cim: "Site UUID in source storage does not match the target site."'
    => 'drush cget system.site uuid at both ends - the target was installed, not cloned',
  'cim: "... depends on X which does not exist"'
    => 'read the dependencies block; is the provider in core.extension AND composer.json?',
  'cim plans to DELETE something an editor changed on prod'
    => 'drush config:status on prod BEFORE importing; export-and-commit, or config_ignore',
  'updatedb: Class "Foo" not found'
    => 'did composer install run in the new release dir before updatedb? check the autoloader',
  'updatedb died halfway through a hook'
    => 'drush ev to read the schema version - a failed hook is not recorded, so it re-runs',
  'a split wrote its files to the wrong directory'
    => 'drush cget config_split.config_split.NAME --include-overridden (folder + status)',
];
echo "\\nFailure -> first diagnostic:\\n";
foreach ($failures as $symptom => $first) {
  echo "  " . $symptom . "\\n      " . $first . "\\n";
}
`,
    output: `ARTEFACT                           COMMIT DEPLOY PER-ENV BUCKET  MECHANISM
views.view.campaigns               yes    yes    no      CONFIG  config/sync, moved by drush cim
core.extension (module list)       yes    yes    no      CONFIG  config/sync, moved by drush cim
devel + webprofiler enabled        yes    yes    yes     CONFIG  config/sync plus a config_split folder
system.performance aggregation     yes    yes    yes     CONFIG  config/sync plus a config_split folder
src/Controller/CampaignController  yes    yes    no      CODE    git plus composer, moved by the release
composer.lock                      yes    yes    no      CODE    git plus composer, moved by the release
the 12 campaign landing pages      no     no     yes     CONTENT default_content / Migrate, or it does not ship
system.cron last-run timestamp     no     no     yes     STATE   State API; never exported, never deployed
Stripe live secret key             no     no     yes     SECRET  env var or platform secret store; never in git

Failure -> first diagnostic:
  cim: "Site UUID in source storage does not match the target site."
      drush cget system.site uuid at both ends - the target was installed, not cloned
  cim: "... depends on X which does not exist"
      read the dependencies block; is the provider in core.extension AND composer.json?
  cim plans to DELETE something an editor changed on prod
      drush config:status on prod BEFORE importing; export-and-commit, or config_ignore
  updatedb: Class "Foo" not found
      did composer install run in the new release dir before updatedb? check the autoloader
  updatedb died halfway through a hook
      drush ev to read the schema version - a failed hook is not recorded, so it re-runs
  a split wrote its files to the wrong directory
      drush cget config_split.config_split.NAME --include-overridden (folder + status)
`,
  },

  keyPoints: [
    "The sequence is: build the release, composer install, database snapshot, maintenance mode if destructive, flip the code, drush deploy, maintenance mode off — and drush deploy (Drush 13+) is updatedb, config:import, cache:rebuild, deploy:hook, plus cache:warm on Drupal 11.2+. Drush 12 and earlier used updatedb --no-cache-clear and rebuilt caches on both sides of the import.",
    "Classify with three questions — would you commit it, would you deploy it, does it differ per environment — and only code and config answer yes to the first two; content, state and secrets never travel in config/sync.",
    "A per-environment value is still committed config: the difference is carried by a config_split folder or a settings.php $config[...] override, and an override is invisible to drush cex and drush config:status.",
    "Half the failure catalogue is one root cause wearing different hats — a config object naming something the target site does not have: a module missing from composer.json, a field a skipped update hook never created, a split that never wrote its folder.",
    "The snapshot before updatedb is the only fully reversible moment in the deploy; update hooks have no down() and rolling the release symlink back does not touch the schema.",
    "The emergency deploy skips the tag and the full CI run but never the snapshot, and it is not finished until the same commit is merged back — otherwise the next normal deploy reverts the hotfix.",
  ],

  interview: [
    {
      q: "You have just joined a team of four. Walk me through how you would take ownership of deployments for a Drupal site you have never seen.",
      a: "I start read-only: clone the repo and check whether `config/sync` exists and is populated, whether `$settings['config_sync_directory']` points at it, and what `core.extension.yml` claims is enabled. Then I get a production database copy and run `drush config:status` against it — the size of that list is the single best measure of how much drift the team is living with, and a long list of Deletes usually means the sync directory came from a different site. Next I look for the deploy script and check the order: code, `composer install`, `updatedb`, `cim`, cache rebuild. I check whether a database snapshot happens immediately before `updatedb`, because that is the only reversible moment. Finally I rehearse the full sequence against the sanitised production copy before I ever touch the real thing — CI proving a fresh install works tells you nothing about a five-year-old database.",
    },
    {
      q: "How do you decide whether something belongs in config, in code, in state, or in settings.php?",
      a: "Three questions, asked in order. Would leaking it be a security incident? Then it is a secret and it lives in an environment variable read by `settings.php`, never in an exported YAML file. Did a human author it through the site UI, or did the site write it to itself at runtime? Then it is content or state — neither is exported, and `State`/`KeyValue` exist precisely so that runtime values do not pollute `drush cex`. Otherwise, if it round-trips through the config system it is config and belongs in `config/sync`, even when its value differs per environment — that difference is carried by a config_split folder or a `$config[...]` override, not by keeping the object out of the export. Anything left over is code. The reason to be strict is that a mis-filed item shows up as permanent noise in every future config diff, and noisy diffs stop being read.",
    },
    {
      q: "Production has a configuration change nobody exported, and you have a deploy scheduled in an hour. What do you do?",
      a: "Run `drush config:status` on production first, before anything else — I need to know whether the incoming import would update or delete that object, because those are very different conversations. If it is a legitimate editorial change, I export it from production, commit it on a branch, review the YAML like any other diff, and merge it so the deploy carries it forward rather than destroying it. If it is a change that should never have been made in production, I let the import revert it and tell the person who made it. Then I ask why it happened at all: if it is a config type editors legitimately own, such as a webform or a block layout, the answer is `config_ignore`, and if production should be read-only the answer is `config_readonly`. Discovering drift an hour before a deploy is the symptom; the fix is a CI gate that fails when `config:status` on production is not empty.",
    },
    {
      q: "What is the most dangerous step in a Drupal deploy, and how do you reduce the risk?",
      a: "`drush updatedb`, because it is the first irreversible one. Update hooks have no `down()` — unlike a Doctrine migration, Drupal never asks you to write the inverse — so a bad schema change can only be undone by restoring the database, which also destroys every node and order created since the deploy started. I reduce the risk in three ways: a `drush sql:dump` immediately before `updatedb` on every deploy without exception, a rehearsal of the whole sequence against a sanitised copy of the production database in CI or on stage, and keeping the deploy window short so a restore costs as little content as possible. In practice this pushes teams toward forward-fix over rollback: ship a corrective release rather than reverting, because the moment an editor saves a node the restore option has a real cost.",
    },
  ],

  quiz: [
    {
      question:
        "Which sequence does `drush deploy` (Drush 13+) actually run?",
      options: [
        "config:import, updatedb, cache:rebuild, deploy:hook",
        "cache:rebuild, config:export, updatedb, deploy:hook",
        "updatedb, config:import, cache:rebuild, deploy:hook (plus cache:warm on Drupal 11.2+)",
        "composer install, updatedb, config:import, maint:set 0",
      ],
      answerIndex: 2,
      explain:
        "Update hooks build the structures that incoming config references, so updatedb runs first and config:import follows it — reversing that pair is the classic wrong answer. deploy:hook runs last, which is what makes hook_deploy_NAME the place for work that needs the new configuration to already exist. Drush 12 and earlier ran updatedb --no-cache-clear with a cache rebuild on both sides of the import, so old runbooks look different. drush deploy does not run composer install — that is your job, before you call it.",
    },
    {
      question:
        "The Solr host name differs on dev, stage and prod. Which bucket does it belong in?",
      options: [
        "State — it is environment-specific, so the site should write it at runtime",
        "Content — it is data, not structure",
        "Config, still committed to config/sync, with the per-environment value carried by a split or a settings.php override",
        "Nowhere — keep the search server config out of the export entirely",
      ],
      answerIndex: 2,
      explain:
        "'Differs per environment' does not remove something from config. The object stays in config/sync so its structure and dependencies are reviewed and deployed like everything else; only the differing value moves into a config_split folder or a $config[...] override. Excluding it entirely means the next import deletes it on the environments that do have it.",
    },
    {
      question:
        "`drush cim` on stage fails with 'depends on X which does not exist'. What is the most likely root cause to check first?",
      options: [
        "The site UUID in system.site.yml is wrong",
        "The module providing X is listed in core.extension.yml but was never added to composer.json, so it is not on disk",
        "The config_sync_directory setting points at the wrong path",
        "Someone ran drush cex without --diff",
      ],
      answerIndex: 1,
      explain:
        "A dependency error means the target site cannot resolve something the incoming config names. The classic cause is a module enabled locally and exported into core.extension.yml while nobody ran composer require, so the code exists on one laptop and nowhere else. A wrong sync directory or UUID produces different, more specific errors.",
    },
    {
      question:
        "Why does rolling the release symlink back to the previous version fail to fully undo a deploy?",
      options: [
        "Because the opcache keeps serving the new code",
        "Because config/sync is not versioned in git",
        "Because update hooks have no down-migration, so the database schema stays at the new version",
        "Because drush deploy writes a lock that blocks the old release",
      ],
      answerIndex: 2,
      explain:
        "Code and active configuration are both recoverable — the symlink restores one, re-importing the previous export restores the other. hook_update_N and hook_post_update_NAME are one-way, so the schema only goes back via a database restore, and that restore also discards content created since the deploy. This asymmetry is why the pre-updatedb snapshot is mandatory and why forward-fix usually beats rollback.",
    },
  ],
};

export default lesson;
