import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "features-and-legacy",
  title: "Legacy Ground: Features, Profiles & Inheriting a Site",
  part: "Team Workflow",
  estMinutes: 13,
  summary:
    "Most sites you inherit predate a clean CMI workflow — Features modules, an install profile you cannot change, or nothing but a production database — and each one has a specific, mechanical route back to plain cex/cim.",

  concept: `
Every inherited Drupal site sits somewhere between "no configuration management
at all" and "core CMI, cleanly". The two interesting failure modes in between
are **Features** and **install profiles**. Both are survivable; both need you to
understand the machinery before you touch anything.

## Features

The Features module has Drupal 7 heritage — back then it was the *only* way to
move configuration in code. It is still maintained for Drupal 10 and 11 (its
\`features.info.yml\` declares \`core_version_requirement: ^10 || ^11 || ^12\`)
and it still depends on the \`config_update\` module. In D8+ it is a *packaging*
tool that sits alongside \`config/sync\`, not a replacement for it.

The fingerprint is a file named \`<module>.features.yml\` sitting next to
\`<module>.info.yml\`:

\`\`\`yaml
bundle: acme
excluded:
  - system.theme
required:
  - core.date_format.long
\`\`\`

That file — not an \`.info.yml\` key — is what \`FeaturesManager::isFeatureModule()\`
looks for. If it exists, someone's deployment story was "revert the features".

Here is the trap. Features writes config into each generated module's
\`config/install\` directory, and core reads \`config/install\` exactly **once**, at
module-install time. After that those YAML files are inert. Editors change the
active config, the files rot, and nothing complains — until someone runs
\`drush features:import\` (\`fim\`) and silently stomps six months of production
changes. Two sources of truth, one of which core ignores.

## Install profiles and distributions

\`core.extension\` records the profile under a \`profile:\` key, and core's
\`ConfigImportSubscriber\` refuses to let an import change it:

> Cannot change the install profile from %profile to %new_profile once Drupal is
> installed.

That is real lock-in with no Symfony analogue: a Symfony "distribution" is a
skeleton you \`composer create-project\` once and then own outright. A Drupal
distribution keeps shipping code that runs on your site forever.

The escape hatch is newer than most people realise: **since Drupal 10.3 the
install profile can be uninstalled like any module**, provided nothing on the
site still depends on a module or theme living inside the profile directory.
\`drush pm:uninstall acme_profile\` clears the \`profile\` key from
\`core.extension\` entirely. Recipes (in core since 10.3, practical from 11.1,
though the Recipe API is still marked \`@internal\`/experimental in core) are the
forward-looking answer — they apply once and leave nothing behind.

## Sites with nothing at all

The third case: someone clicked production directly and there is no
\`config_sync_directory\`. Do **not** big-bang this. The production database is
the only truth, so make it the baseline:

1. Pull a prod database to a scratch environment.
2. Set \`\$settings['config_sync_directory']\`, run \`drush cex\`, commit the lot
   unreviewed — this is a *snapshot*, not a design.
3. Restore prod's database again and run \`drush cim\`. It must report zero
   changes. If it does not, your export was taken against a dirty site.
4. Only now start reviewing, splitting and ignoring.

Step 3 is the one people skip, and it is the only one that proves anything.
`,

  comparisons: [
    {
      label: "First ten minutes: does this site depend on Features?",
      intro:
        "Before changing anything, find out which workflow the previous team actually used. On both stacks this is a grep, but the Drupal signals are specific files and a Drush command that only exists if the module is installed.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: how much legacy config sprawl is there?
composer show | grep -iE 'bundle|flex'

# Config that lives outside config/packages is the smell.
find src config -name '*.yaml' -o -name '*.xml' | head -50

# Anything still loaded imperatively in the kernel?
grep -rn "registerContainerConfiguration\\|import" config/services.yaml

# Bundles are additive and removable. Delete one, run:
bin/console lint:container
bin/console debug:config acme_legacy`,
      ts: `# 1. Is Features installed at all?
composer show | grep -E 'drupal/(features|config_update)'
drush pm:list --status=enabled --type=module | grep -iE 'features|config_update'

# 2. THE definitive fingerprint: generated modules carry a .features.yml
find web/modules web/profiles -name '*.features.yml'
#   web/modules/custom/acme_press/acme_press.features.yml
#   web/modules/custom/acme_article/acme_article.features.yml

# 3. How stale are they? (features:diff, alias fd)
drush features:status          # fs  - bundles and their packages
drush features:list:packages   # fl  - per-package state
drush features:diff acme_press # fd  - active config vs the module's config/install

# 4. Is core CMI even wired up?
drush status --field=config-sync
drush config:status            # cst`,
      note: "A .features.yml file is the only reliable marker — Features 3.x reads that file, not a key in .info.yml. A module full of config/install YAML with no .features.yml is just a normal module shipping defaults.",
    },
    {
      label: "Profile lock-in vs. a skeleton you own",
      intro:
        "A Symfony distribution stops mattering the moment composer create-project finishes. A Drupal install profile is recorded in configuration and enforced by the config importer for the life of the site.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: config/packages/framework.yaml
# Nothing records which skeleton you started from.
framework:
  secret: '%env(APP_SECRET)%'
  session:
    handler_id: null

# config/packages/prod/monolog.yaml — env layering, no lock-in.
monolog:
  handlers:
    main:
      type: fingers_crossed
      action_level: error

# Started from symfony/website-skeleton three years ago?
# There is no trace of it, and nothing stops you deleting
# any bundle it happened to install.`,
      ts: `# Drupal: config/sync/core.extension.yml
_core:
  default_config_hash: yGxWLNvWTdRlkYyOZDbLL8kR-jS1zpZq8YkQhZ6QNVE
module:
  acme_profile: 1000   # the profile is in the module list
  node: 0
  views: 10
theme:
  olivero: 0
  claro: 0
profile: acme_profile  # <- enforced on every config import

# Change 'profile:' here and 'drush cim' aborts with:
#   Cannot change the install profile from acme_profile
#   to standard once Drupal is installed.
#
# Since Drupal 10.3 you can uninstall it instead, which
# removes the key rather than changing it:
#   drush pm:uninstall acme_profile`,
      note: "core.extension lists the profile in the module map AND in the profile key; ConfigImportSubscriber blocks changing the value but permits removal, which is why uninstalling is the supported migration path, not hand-editing YAML.",
    },
    {
      label: "Migrating a Features workflow to plain cex/cim",
      intro:
        "The safe order is: make active config the single truth, prove a clean round trip, and only then delete the packaging. Reversing steps 2 and 4 is how teams lose editorial changes.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: retiring a legacy config bundle
git switch -c chore/retire-acme-legacy

# 1. What does the bundle actually contribute?
bin/console debug:config acme_legacy > /tmp/before.yaml

# 2. Move it into config/packages/ by hand.
$EDITOR config/packages/acme.yaml

# 3. Drop the bundle.
composer remove acme/legacy-bundle
$EDITOR config/bundles.php

# 4. Prove the container is unchanged.
bin/console cache:clear
bin/console debug:config acme > /tmp/after.yaml
diff /tmp/before.yaml /tmp/after.yaml

# 5. Tests, then merge.
vendor/bin/phpunit`,
      ts: `# Drupal: retiring Features, one branch, reversible
git switch -c chore/retire-features

# 1. Baseline: export ACTIVE config. Active always wins —
#    it is what production is actually running.
drush config:export --yes
git add config/sync && git commit -m "Baseline export"

# 2. Prove the round trip BEFORE deleting anything.
drush config:import --yes
drush config:status            # must say "No differences"

# 3. NOW uninstall the feature modules. Their config stays
#    in active storage; only the packaging goes away.
drush pm:uninstall acme_press acme_article --yes
drush pm:uninstall features config_update --yes

# 4. Re-export: the only diff should be core.extension
#    plus any config the modules owned as dependencies.
drush config:export --yes
git diff --stat config/sync

# 5. Delete the module directories and the sync dir entries.
git rm -r web/modules/custom/acme_press web/modules/custom/acme_article
composer remove drupal/features drupal/config_update`,
      note: "Never run 'drush features:import' during the migration — it pushes stale config/install YAML over active config. Export first, uninstall second, and let step 2's clean config:status be the gate.",
    },
    {
      label: "Retro-fitting config management to a site that has none",
      intro:
        "Someone has been clicking production for four years. There is no sync directory and no branch that matches what is deployed. The goal of week one is a snapshot you can trust, not a tidy repository.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony equivalent: config edited on the prod box.
ssh prod
cd /var/www/app && git status --short
#  M config/packages/prod/doctrine.yaml
#  M config/packages/prod/messenger.yaml
#  ?? config/packages/prod/hotfix.yaml

# Painful, but bounded: the files ARE the config.
git diff > /tmp/prod-drift.patch
scp prod:/tmp/prod-drift.patch .
git apply /tmp/prod-drift.patch
git checkout -b chore/capture-prod-drift

# Worst case you read three YAML files and decide.
# Nothing is hidden in a database.`,
      ts: `# Drupal: the database is the config. Files do not exist yet.
# --gzip appends the .gz itself, so do NOT put it in --result-file.
drush @prod sql:dump --gzip --result-file=/tmp/prod.sql  # -> /tmp/prod.sql.gz
scp prod:/tmp/prod.sql.gz .                              # it dumped on PROD
drush @scratch sql:drop --yes
gunzip -c prod.sql.gz | drush @scratch sql:cli

# 1. Point at a sync dir (settings.php):
#    $settings['config_sync_directory'] = '../config/sync';
drush @scratch config:export --yes
git add config/sync
git commit -m "Snapshot of production configuration"

# 2. The step nobody does: prove the snapshot imports cleanly
#    onto a FRESH copy of prod.
gunzip -c prod.sql.gz | drush @scratch sql:cli
drush @scratch config:import --yes
drush @scratch config:status
#  [notice] No differences between DB and sync directory.

# 3. Only now: split, ignore, review, and add the CI gate.
drush @scratch config:status --state='Only in DB'`,
      note: "Step 2 catches the classic: an export taken from a site with a module enabled that production does not have, which then tries to uninstall a module (and delete its content) on the first real import.",
    },
  ],

  playground: {
    intro:
      "Before you delete a single Features module you need to know whether it is pure packaging or whether it is hiding a fork of production. This models 'drush features:diff' across a whole site: compare each module's frozen config/install against active config and classify every item.",
    lang: "php",
    code: `<?php
// Inherited site: active config, reduced to a signature per item.
$active = [
  'node.type.article'                            => 'name=Article;preview=1',
  'node.type.press_release'                      => 'name=Press release;preview=0',
  'field.field.node.article.body'                => 'label=Body;required=0',
  'views.view.press_room'                        => 'title=Press room;items=10',
  'core.entity_view_display.node.article.teaser' => 'hidden=links',
  'system.site'                                  => 'name=Acme;slogan=Ship it',
];

// What each Features-generated module froze into its own config/install dir.
$features = [
  'acme_press' => [
    'node.type.press_release'  => 'name=Press release;preview=0',
    'views.view.press_room'    => 'title=Newsroom;items=25',
    'views.view.press_archive' => 'title=Archive;items=50',
  ],
  'acme_article' => [
    'node.type.article'             => 'name=Article;preview=1',
    'field.field.node.article.body' => 'label=Body;required=1',
  ],
];

$plan = [];
foreach ($features as $module => $shipped) {
  foreach ($shipped as $name => $frozen) {
    if (!array_key_exists($name, $active)) {
      $plan[$name] = [$module, 'ORPHANED', 'never installed or since deleted - drop it'];
    }
    elseif ($active[$name] === $frozen) {
      $plan[$name] = [$module, 'IN SYNC ', 'export as-is; feature adds nothing'];
    }
    else {
      $plan[$name] = [$module, 'DRIFTED ', 'ACTIVE wins; the feature is stale'];
    }
  }
}
foreach (array_keys($active) as $name) {
  if (!isset($plan[$name])) {
    $plan[$name] = ['-           ', 'UNOWNED ', 'already core-managed; nothing to do'];
  }
}
ksort($plan);

echo "config item                                     owner         state     action\\n";
echo str_repeat('-', 118) . "\\n";
foreach ($plan as $name => $row) {
  echo str_pad($name, 48) . str_pad($row[0], 14) . $row[1] . '  ' . $row[2] . "\\n";
}

$counts = ['IN SYNC ' => 0, 'DRIFTED ' => 0, 'ORPHANED' => 0, 'UNOWNED ' => 0];
foreach ($plan as $row) {
  $counts[$row[1]]++;
}
echo "\\n";
foreach ($counts as $state => $n) {
  echo trim($state) . ': ' . $n . "\\n";
}

$risky = $counts['DRIFTED '] + $counts['ORPHANED'];
echo "\\nItems needing a human decision before 'drush cex': " . $risky . "\\n";
echo $risky === 0
  ? "Safe: features are pure packaging. Export, remove the modules, re-export.\\n"
  : "Not safe yet: reconcile the drifted/orphaned items, THEN uninstall the features.\\n";`,
    output: `config item                                     owner         state     action
----------------------------------------------------------------------------------------------------------------------
core.entity_view_display.node.article.teaser    -             UNOWNED   already core-managed; nothing to do
field.field.node.article.body                   acme_article  DRIFTED   ACTIVE wins; the feature is stale
node.type.article                               acme_article  IN SYNC   export as-is; feature adds nothing
node.type.press_release                         acme_press    IN SYNC   export as-is; feature adds nothing
system.site                                     -             UNOWNED   already core-managed; nothing to do
views.view.press_archive                        acme_press    ORPHANED  never installed or since deleted - drop it
views.view.press_room                           acme_press    DRIFTED   ACTIVE wins; the feature is stale

IN SYNC: 2
DRIFTED: 2
ORPHANED: 1
UNOWNED: 2

Items needing a human decision before 'drush cex': 3
Not safe yet: reconcile the drifted/orphaned items, THEN uninstall the features.`,
  },

  keyPoints: [
    "A module is a Features package if and only if it has a <module>.features.yml file beside its .info.yml — that is what Features itself checks, not an .info.yml key.",
    "Config in a module's config/install is read once, at install time. After that it is inert and drifts silently from active config, which is why 'features:import' can wipe months of production changes.",
    "core.extension stores the install profile under a 'profile:' key; ConfigImportSubscriber rejects any import that changes it (\"Cannot change the install profile ... once Drupal is installed\").",
    "Since Drupal 10.3 the install profile can be uninstalled like a module, provided nothing depends on modules or themes inside the profile directory — that removes the key instead of changing it.",
    "Migrating off Features: export active config, prove a clean config:import round trip, THEN uninstall the feature modules and re-export. Never revert features first.",
    "For a site with no config management, the production database is the baseline: snapshot it with cex, then prove cim is a no-op against a fresh restore before touching anything else.",
  ],

  interview: [
    {
      q: "You are handed a Drupal 10 site you have never seen. How do you assess its deployment maturity in the first hour?",
      a: `I work outside-in from the repository, because the repo tells you what the team *intended* and the database tells you what actually happened. First, is the codebase Composer-managed, is \`composer.lock\` committed, and is core a dependency rather than a vendored copy? Second, is there a \`config/sync\` directory with a \`core.extension.yml\`, and does \`$settings['config_sync_directory']\` point at it? Third, I look for legacy signals: \`find . -name '*.features.yml'\` for Features packages, \`profile:\` in \`core.extension.yml\` for a distribution, and any \`config/install\` directories in custom modules. Then I go to a real environment and run \`drush config:status\` — if it reports large numbers of "Only in DB" items, nobody has exported in months and the repo is fiction. Finally I check whether there is a deploy script at all, and whether it runs \`updatedb\` before or after \`config:import\`. Those five answers tell you the maturity level and roughly how long the remediation will take.`,
    },
    {
      q: "A client's site uses Features for everything. Walk me through moving them to core configuration management without losing work.",
      a: `The core principle is that **active configuration is the truth** — it is what production is serving — and the YAML in each feature module's \`config/install\` is a snapshot that may be years stale. So the order is: export before deleting. I branch, run \`drush config:export\` to capture active config into \`config/sync\`, and commit that unreviewed as a baseline. Then I prove the round trip: \`drush config:import\` followed by \`drush config:status\`, which must report "No differences". Only then do I \`drush pm:uninstall\` the feature modules, then Features and \`config_update\` themselves, and re-export — the diff at that point should be essentially just \`core.extension.yml\`. The thing I never do is run \`drush features:import\` or \`features:import:all\` during the migration, because that pushes the stale files back over live config. Before starting I would also run \`drush features:diff\` per package so I know up front which items have drifted and need a human decision.`,
    },
    {
      q: "The site was built on a distribution and the client wants off it. What is actually possible?",
      a: `The install profile is recorded in \`core.extension\` under a \`profile:\` key, and core's \`ConfigImportSubscriber\` explicitly blocks changing it — you get "Cannot change the install profile from X to Y once Drupal is installed." So you cannot swap one profile for another by editing YAML, and historically the only real answer was a full migration to a new site. That changed in Drupal 10.3: install profiles can now be uninstalled like any other module, which removes the \`profile\` key rather than changing it. The precondition is that nothing on the site still depends on a module or theme that lives inside the profile's directory, so the real work is inventorying those and either relocating them into \`web/modules/custom\` or replacing them. After that it is \`drush pm:uninstall <profile>\` and a re-export. If the client is on an older Drupal 10, upgrading to 10.3+ is the cheapest first step.`,
    },
    {
      q: "How does this compare to inheriting a legacy Symfony application?",
      a: `Symfony has legacy config sprawl — a bundle nobody understands, environment config duplicated across \`config/packages/prod\` and \`config/packages/staging\`, secrets hard-coded in a \`parameters.yaml\` that predates \`.env\` — but it has no lock-in. Config is files, files are in git, and \`bin/console debug:config\` will tell you the resolved value of anything. You can delete a bundle and \`lint:container\` will tell you what broke. Drupal's difference is that configuration lives in the database as the runtime source of truth, so a site can have *zero* representation of its config in the repository and still work perfectly, and an install profile is a decision recorded in configuration that the config importer actively enforces. The practical consequence is that a Drupal audit always requires database access, whereas a Symfony audit can often be done from a clone.`,
    },
  ],

  quiz: [
    {
      question:
        "You are auditing an inherited site. Which file most reliably tells you a custom module was generated by the Features module?",
      options: [
        "A 'features:' key inside the module's .info.yml",
        "A <module>.features.yml file next to the .info.yml",
        "The presence of a config/install directory in the module",
        "A dependency on drupal:config in the .info.yml",
      ],
      answerIndex: 1,
      explain:
        "Features 3.x looks for a separate <module>.features.yml file (holding keys like bundle, excluded and required) — that is what FeaturesManager::isFeatureModule() reads. Plenty of ordinary modules ship a config/install directory or depend on drupal:config without ever having touched Features.",
    },
    {
      question:
        "A site was installed with the 'acme_profile' distribution. You edit core.extension.yml in config/sync to say 'profile: standard' and run drush cim. What happens?",
      options: [
        "The import succeeds and the site switches to the standard profile",
        "The import succeeds but the profile key is silently ignored",
        "The import fails with 'Cannot change the install profile from acme_profile to standard once Drupal is installed'",
        "Drupal reinstalls the site using the standard profile",
      ],
      answerIndex: 2,
      explain:
        "ConfigImportSubscriber::validateModules() compares the profile in the source storage against the one in the target storage and logs exactly that error, aborting the import. The supported route off a profile is to uninstall it (possible since Drupal 10.3), which removes the key rather than changing it.",
    },
    {
      question:
        "Migrating a Features-based site to plain cex/cim, which step ordering is safe?",
      options: [
        "drush features:import:all, then drush cex, then uninstall the feature modules",
        "drush cex, then drush cim to verify a clean round trip, then uninstall the feature modules, then drush cex again",
        "Uninstall the feature modules first, then drush cex to capture what is left",
        "Delete the module directories from git, then drush cim to rebuild active config",
      ],
      answerIndex: 1,
      explain:
        "Active config is the truth, so export it first. Running features:import:all would push each module's stale config/install YAML over live configuration. Uninstalling before exporting risks losing config the modules owned as dependencies, and deleting directories before importing leaves core.extension referencing modules that no longer exist.",
    },
    {
      question:
        "A site has no config_sync_directory and production has been edited through the UI for years. What proves your first 'drush cex' snapshot is trustworthy?",
      options: [
        "That the exported files pass a YAML linter",
        "That the export produced more than 200 files",
        "That importing the export onto a fresh restore of the production database reports no differences",
        "That drush status reports a config-sync path",
      ],
      answerIndex: 2,
      explain:
        "The only meaningful test is a round trip: restore production's database again, run drush config:import, and confirm drush config:status reports 'No differences between DB and sync directory'. Anything else just proves the files exist, not that they faithfully describe the running site.",
    },
  ],
};

export default lesson;
