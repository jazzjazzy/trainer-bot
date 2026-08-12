import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "uuid-and-site-identity",
  title: "UUIDs, Site UUID & Why Fresh Installs Break Imports",
  part: "The Configuration System",
  estMinutes: 12,
  summary:
    "Drupal's config sync assumes source and target are the same site cloned, not two sites installed separately — which is why a fresh install refuses your exported configuration, and what to do instead.",
  concept: `
## Config carries identity; Symfony config does not

In Symfony, \`config/packages/framework.yaml\` is a file. Copy it to another machine and it works, because nothing in it knows which machine it is. Drupal's exported YAML is different: it is a serialisation of rows that live in a database, and those rows carry **identity**.

Two levels of identity matter.

- **Every config entity has its own \`uuid\`** — a view, a node type, a field, a block placement. Open \`config/sync/node.type.article.yml\` and the first key is \`uuid\`.
- **The site itself has a UUID**, stored as \`system.site:uuid\` and exported in \`system.site.yml\`. It is minted once, at install time.

### The refusal

Before writing anything, \`drush cim\` compares the site UUID in the sync directory against the site UUID in the target's active storage. If they differ, the import aborts:

\`\`\`
Site UUID in source storage does not match the target storage.
\`\`\`

Learn that string — it is worth grepping for. Drush wraps it in its own preamble, so what you actually see in a deploy log is:

\`\`\`
The import failed due to the following reasons:
There were errors validating the config synchronization.
Site UUID in source storage does not match the target storage.
\`\`\`

That is a feature, not a bug. Config sync's entire model is "one site, moved between environments". Import is a **full synchronisation**, not a merge: anything in active storage that is missing from the sync directory gets deleted. Letting you point site A's export at unrelated site B would happily delete B's configuration. The UUID check is the guard rail that says "these are not the same site".

### The correct workflow

Prod, stage and dev must all descend from **one** install.

1. Install once (or inherit the existing prod database).
2. For every other environment, **clone the database** — \`drush sql:dump\` on the source, restore locally, then \`drush cim\`.
3. If there is genuinely no database to copy — a fresh CI job, a brand-new environment — install *from* the configuration instead of installing fresh:

\`\`\`bash
drush site:install --existing-config -y
\`\`\`

The installer reads your sync directory, adopts the \`system.site\` UUID it finds there, and imports the exported configuration as part of installation. It requires \`$settings['config_sync_directory']\` to be set and that directory to contain a real export, including \`system.site.yml\` and \`core.extension.yml\`. Plain \`drush site:install standard\` mints a new site UUID and guarantees the refusal.

### Forcing the two sides to agree

You can overwrite the target's UUID:

\`\`\`bash
drush config:set system.site uuid 9f2c4b1e-... -y
\`\`\`

That is legitimate exactly once: when you inherit a project with no database and you are declaring "this install *is* that site". Any other use is hiding a real problem — usually that someone installed fresh instead of cloning, so the sync directory and the database disagree about far more than a UUID, and the import that now proceeds will delete things.

### Entity UUID collisions

Two developers, same sprint, both create a content type called \`press\`. Each gets a different entity UUID. Whoever merges second produces a file with the same *name* but a different \`uuid\`. Drupal's comparer treats same-name-different-UUID as a **recreate** — delete the old entity, create the new one — not an update. That does *not* delete the existing nodes: nothing in core removes content when a bundle is deleted. What it does delete is the node type and everything that depends on it — the field config and the view/form displays — after which the field data is purged and the existing node rows are left orphaned against a bundle that no longer exists. The UI refuses to let you do this at all (\`NodeTypeDeleteConfirm\` blocks the form while any content uses the type); config import has no such guard. Resolve these in review, not on prod.
`,
  comparisons: [
    {
      label: "Standing up a second copy of the site",
      intro:
        "A new team member needs a working environment. In Symfony you clone and migrate; in Drupal you must decide whether you are cloning a site or minting a new one.",
      leftLang: "bash",
      rightLang: "bash",
      php: `git clone git@github.com:acme/site.git && cd site
composer install
cp .env .env.local            # environment-specific values go here

php bin/console doctrine:database:create
php bin/console doctrine:migrations:migrate --no-interaction

# Done. config/packages/*.yaml is read straight off disk on every request.
# Nothing on disk knows or cares which machine it is running on, so there
# is no identity to reconcile and no import step that can refuse.`,
      ts: `git clone git@github.com:acme/site.git && cd site
composer install

# Option A - the normal one: clone an existing site's database.
drush @prod sql:dump --gzip --result-file=/tmp/prod.sql.gz
drush sql:drop -y && gunzip -c /tmp/prod.sql.gz | drush sql:cli
drush updb -y && drush cim -y && drush cr   # or just: drush deploy

# Option B - no database to copy (fresh CI job, new environment):
# install FROM the committed configuration.
drush site:install --existing-config -y

# What you must NOT do:
#   drush site:install standard -y && drush cim -y
#   -> mints a brand new system.site uuid, so cim aborts with
#      "Site UUID in source storage does not match the target storage."`,
      note: "Option A and Option B both preserve one site identity. A plain site:install creates a second, unrelated site — and config sync exists to move one site between environments, not to merge two. Note the order in Option A: updb before cim, matching drush deploy (updatedb → config:import → cache:rebuild → deploy:hook). Importing config before pending updates have run can import config that depends on schema the updates have not applied yet.",
    },
    {
      label: "Where identity lives on disk",
      intro:
        "Compare what an exported settings file actually contains. The Drupal side has keys that only make sense for one specific installation.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/framework.yaml - identical on every machine
framework:
  secret: '%env(APP_SECRET)%'
  session:
    handler_id: null
  http_client:
    default_options:
      max_redirects: 3

# .env - per-environment values, never per-installation identity
APP_ENV=prod
DATABASE_URL=postgresql://app:secret@db:5432/app

# There is no id, no uuid, no "which site is this" anywhere.
# Two independent installs of the same codebase are interchangeable.`,
      ts: `# config/sync/system.site.yml - the SITE identity
uuid: 9f2c4b1e-6d7a-4c31-b0ae-4d5e2a8f1c33   # minted once, at install
_core:
  default_config_hash: 5xM1kQ9pR2vTn0wZ_bYcLp8s3AeUqHdJfGrKt7Nx4C0
name: 'Acme Corp'
mail: web@acme.example
slogan: ''
page:
  front: /node

# config/sync/node.type.press.yml - a CONFIG ENTITY's own identity
uuid: 41d0c7b8-2e6f-4a19-9c50-7b3fd8e6a112
langcode: en
status: true
dependencies: {  }
name: 'Press release'
type: press
new_revision: true`,
      note: "Two files, two kinds of UUID. system.site:uuid answers \"is this the same site?\"; each entity uuid answers \"is this the same thing, or a different thing wearing the same name?\"",
    },
    {
      label: "Two developers create the same thing independently",
      intro:
        "Alice and Bob both build a 'press' content type in their own environments during the same sprint. Watch what the merge produces on each stack.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: both wrote an entity + a migration.
$ git merge feature/bob-press
CONFLICT (add/add): Merge conflict in migrations/Version20260810120000.php
CONFLICT (add/add): Merge conflict in src/Entity/PressRelease.php

# Resolution is textual and local. You keep one class, delete the other
# migration, regenerate if needed:
$ php bin/console doctrine:migrations:diff
$ php bin/console doctrine:migrations:migrate

# Worst case you ship a bad schema change. Nothing silently deletes rows
# because two files disagreed about an opaque identifier.`,
      ts: `# Drupal: both exported config/sync/node.type.press.yml,
# each with a DIFFERENT uuid. Git may even auto-resolve to "Bob wins".
$ git merge feature/bob-press && drush cim --diff

  node.type.press
- uuid: 41d0c7b8-2e6f-4a19-9c50-7b3fd8e6a112     # Alice's, live on stage
+ uuid: 8c3e91af-55b2-4d07-a6e1-0f9b2d7c4e88     # Bob's, from the merge

+------------+-----------------+-----------+
| Collection | Config          | Operation |
+------------+-----------------+-----------+
|            | node.type.press | Delete    |
|            | node.type.press | Create    |
+------------+-----------------+-----------+

# Delete + Create, not Update. The nodes themselves survive - core does
# not delete content when a bundle goes away - but the node type and its
# dependent field config and displays are deleted, the field data is
# purged, and the surviving node rows now point at a bundle that no
# longer exists. The UI refuses to do this while content uses the type;
# cim has no such guard. Catch it in review.`,
      note: "Same name, different uuid means \"a different entity that happens to share an id\", so sync recreates rather than updates. Prevention: one developer owns a new entity, and everyone else pulls their export before building on it.",
    },
    {
      label: "Overriding identity by hand",
      intro:
        "Both frameworks give you an escape hatch for 'I know better than the tool'. Both are for one-off reconciliation, not routine use.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Closest Symfony analogue: the migrations table disagreeing with reality
# (e.g. a schema restored from a dump that predates a tracked migration).
$ php bin/console doctrine:migrations:status
$ php bin/console doctrine:migrations:version \\
    'DoctrineMigrations\\Version20260701090000' --add --no-interaction

# You are asserting "this migration is already applied". If that is untrue,
# the next migrate leaves the schema broken. Same shape of risk, different
# blast radius: it lies about schema, not about which site this is.`,
      ts: `# Legitimate case: you inherited a repo with config/sync but no database,
# so you install from config and this environment ADOPTS that identity.
$ drush site:install --existing-config -y

# Legitimate case: an environment that predates the sync directory and you
# are declaring, once, that it is the same site.
$ drush config:get system.site uuid
'system.site:uuid': bb22ee01-1111-4aaa-9bbb-cccccccccccc
$ drush config:set system.site uuid \\
    9f2c4b1e-6d7a-4c31-b0ae-4d5e2a8f1c33 -y
$ drush config:status          # ALWAYS look before importing

# What does NOT work, however tempting it looks:
#   settings.php:
#   $config['system.site']['uuid'] = '9f2c4b1e-...';
#
# Config overrides live in the ConfigFactory. The import comparison does
# not go through the ConfigFactory: StorageComparer::validateSiteUuid()
# reads $this->targetStorage->read('system.site') - the raw active
# storage (the config.storage service) - so the override is invisible to
# it and cim aborts exactly as before. It does not hide anything either:
# config:status compares config.storage against the sync directory, and
# config:get defaults to getEditable() (overrides only with
# --include-overridden). config:set is the one that changes the outcome,
# because it writes active storage.`,
      note: "drush config:set writes active storage, so it makes cim proceed — it does not make the two sites the same. A $config override in settings.php does neither, because the import comparison reads raw active storage and never sees overrides. After a config:set, always run drush config:status (or cim --diff); if the changelist is full of Deletes, you fixed the symptom and not the cause.",
    },
  ],
  playground: {
    intro:
      "A miniature of the checks Drupal runs before an import writes anything: the site-UUID gate first, then the changelist — including the same-name-different-uuid case that becomes a delete-then-create.",
    lang: "php",
    code: `<?php
// A miniature StorageComparer: the checks drush cim runs BEFORE it writes anything.

$sync = [
  'system.site'          => ['uuid' => 'aa11-site-alpha', 'name' => 'Four Devs'],
  'node.type.article'    => ['uuid' => 'e1-article-alice', 'type' => 'article'],
  'node.type.press'      => ['uuid' => 'e2-press-alice', 'type' => 'press'],
  'views.view.frontpage' => ['uuid' => 'e3-frontpage', 'id' => 'frontpage'],
];

$freshInstall = [
  'system.site'       => ['uuid' => 'bb22-site-fresh', 'name' => 'Drupal'],
  'node.type.article' => ['uuid' => 'f7-article-fresh', 'type' => 'article'],
];

$clonedProd = [
  'system.site'        => ['uuid' => 'aa11-site-alpha', 'name' => 'Four Devs (stage)'],
  'node.type.article'  => ['uuid' => 'e1-article-alice', 'type' => 'article'],
  'node.type.press'    => ['uuid' => 'e9-press-bob', 'type' => 'press'],
  'system.menu.legacy' => ['uuid' => 'e4-legacy', 'id' => 'legacy'],
];

function attemptImport(string $label, array $source, array $target): void {
  static $n = 0;
  echo ($n++ ? "\\n" : "") . "== " . $label . " ==\\n";
  echo "  source site uuid: " . $source['system.site']['uuid'] . "\\n";
  echo "  target site uuid: " . $target['system.site']['uuid'] . "\\n";

  // ConfigImporter::validate() runs this first and refuses to go any further.
  if ($source['system.site']['uuid'] !== $target['system.site']['uuid']) {
    echo "  ABORT: Site UUID in source storage does not match the target storage.\\n";
    return;
  }
  echo "  site uuid OK - building the changelist\\n";

  $plan = [];
  foreach (array_diff(array_keys($source), array_keys($target)) as $name) {
    $plan[] = ['create', $name, ''];
  }
  foreach (array_diff(array_keys($target), array_keys($source)) as $name) {
    $plan[] = ['delete', $name, ''];
  }
  foreach (array_intersect(array_keys($source), array_keys($target)) as $name) {
    if ($source[$name] === $target[$name]) {
      continue;
    }
    $sourceUuid = $source[$name]['uuid'] ?? null;
    $targetUuid = $target[$name]['uuid'] ?? null;
    // Same name, different uuid = a different entity that happens to share an
    // id, so sync deletes the old one and creates the new one.
    if ($sourceUuid !== null && $sourceUuid !== $targetUuid) {
      $plan[] = ['recreate', $name, $targetUuid . ' -> ' . $sourceUuid];
    }
    else {
      $plan[] = ['update', $name, ''];
    }
  }

  $destructive = 0;
  foreach ($plan as [$op, $name, $detail]) {
    echo "    " . str_pad($op, 9) . $name . ($detail !== '' ? '  (' . $detail . ')' : '') . "\\n";
    if ($op === 'delete' || $op === 'recreate') {
      $destructive++;
    }
  }
  echo "  " . $destructive . " destructive operation(s) - rehearse against a prod database copy.\\n";
}

attemptImport('sync dir vs a FRESHLY INSTALLED site', $sync, $freshInstall);
attemptImport('sync dir vs a CLONE of the same site', $sync, $clonedProd);
`,
    output: `== sync dir vs a FRESHLY INSTALLED site ==
  source site uuid: aa11-site-alpha
  target site uuid: bb22-site-fresh
  ABORT: Site UUID in source storage does not match the target storage.

== sync dir vs a CLONE of the same site ==
  source site uuid: aa11-site-alpha
  target site uuid: aa11-site-alpha
  site uuid OK - building the changelist
    create   views.view.frontpage
    delete   system.menu.legacy
    update   system.site
    recreate node.type.press  (e9-press-bob -> e2-press-alice)
  2 destructive operation(s) - rehearse against a prod database copy.
`,
  },
  keyPoints: [
    "Drupal config carries identity: every config entity has a uuid, and the site itself has system.site:uuid, minted once at install time.",
    "drush cim compares the sync directory's site UUID against the target before writing anything and aborts with 'Site UUID in source storage does not match the target storage.' — because import is a full sync that deletes, not a merge.",
    "All environments must descend from one install: clone the database (sql:dump / sql:cli) rather than running a fresh site:install.",
    "When there is no database to copy, drush site:install --existing-config installs FROM the sync directory and adopts its site UUID; it needs $settings['config_sync_directory'] pointing at a real export.",
    "drush config:set system.site uuid <uuid> is a one-off reconciliation tool, not a deploy step — after using it, read drush config:status before importing.",
    "Same config name with a different entity uuid is treated as recreate (delete then create), not update — which for a node type means losing its field config and displays and orphaning the existing nodes against a bundle that no longer exists (core does not delete the content itself). Catch these merge collisions in review.",
  ],
  interview: [
    {
      q: "A colleague ran a fresh drush site:install on a new server, then drush cim, and it failed with a site UUID error. Walk me through what happened and how you would fix it.",
      a: "The installer minted a **new** \`system.site:uuid\`, so the sync directory and the active configuration now belong to two different sites. \`ConfigImporter\` validates the site UUID before it touches anything and aborts, because import is a full synchronisation — everything in active storage that is absent from the sync directory is deleted, so importing site A's export into unrelated site B would be destructive. The right fix is to redo the environment as a *clone*: restore a database dump from an existing environment, then \`drush cim\`. If there is no database to copy, tear down and re-run \`drush site:install --existing-config\`, which installs from the committed configuration and adopts its site UUID. I would only reach for \`drush config:set system.site uuid\` if I genuinely inherited a site with no other source of truth — and then I would read \`drush config:status\` before importing, because a long list of Deletes means the mismatch was never really about the UUID.",
    },
    {
      q: "Symfony has no equivalent of the site UUID. Why does Drupal need one?",
      a: "Because Symfony's config is read-only files on disk and Drupal's config is **database rows that round-trip through files**. A Symfony \`config/packages/*.yaml\` is loaded on every request; two independent installs of the same codebase are interchangeable because nothing is stored. Drupal's active configuration lives in the database, can be edited through the UI, and drifts — so an export is a snapshot of one particular site at one moment, and importing it is a *sync*, with deletes. The site UUID is the assertion that source and target are the same site at different points in time. Without it, config sync would have no way to distinguish 'this environment is behind' from 'this is somebody else's site entirely', and the delete half of the changelist would be unsafe.",
    },
    {
      q: "Two developers on your team each built a content type called 'press' locally in the same sprint. What goes wrong, and how do you prevent it?",
      a: "Each install generated its own entity \`uuid\`, so the two \`node.type.press.yml\` files have the same name but different identities. Git may not even flag it — one branch's file simply wins. On import, Drupal's \`StorageComparer\` sees a matching name with a mismatched uuid and classifies it as a **recreate**: delete the existing entity, then create the incoming one. For a node type that means the type, its field config and its displays are deleted and the field data is purged — the press-release nodes themselves are *not* deleted, because core does not remove content when a bundle goes away, but they are left orphaned against a bundle that no longer exists. That is a state the UI will not let you create: \`NodeTypeDeleteConfirm\` blocks the delete while any content uses the type. Config import bypasses that guard. Prevention is process, not tooling: one person owns a new config entity, exports it, and everyone else pulls before building on top. As a backstop I review \`drush cim --diff\` in CI and fail the build on any unexpected Delete of a node type, field storage or view.",
    },
    {
      q: "What does drush site:install --existing-config actually require, and when would you use it in a pipeline?",
      a: "It needs `$settings['config_sync_directory']` set in \`settings.php\` and that directory to hold a genuine export — at minimum \`system.site.yml\` (which supplies the site UUID the new install adopts) and \`core.extension.yml\` (the module and theme list), plus valid database credentials. The installer then imports the exported configuration as part of installation rather than running a profile's default setup. I use it for **ephemeral** environments: a CI job that spins up a throwaway site to prove the sync directory is self-consistent and importable, or a brand-new environment with nothing to clone. For dev and stage I still prefer restoring a copy of the production database, because that also rehearses \`drush updb\` and surfaces content-shaped problems an empty site never will.",
    },
  ],
  quiz: [
    {
      question:
        "Why does Drupal refuse an import when the sync directory's site UUID differs from the target site's?",
      options: [
        "Because the UUID is used as an encryption key for the exported YAML.",
        "Because config import is a full synchronisation that also deletes, so importing another site's export could destroy the target's configuration.",
        "Because Drupal licences configuration per site.",
        "Because the UUID is part of the config schema and would fail validation.",
      ],
      answerIndex: 1,
      explain:
        "Import is not a merge. Anything present in active storage but absent from the sync directory is added to the delete changelist. The site UUID check is the guard that the source and target are the same site at different points in time.",
    },
    {
      question:
        "config/sync/node.type.press.yml has uuid 41d0…, but the target site's active node.type.press has uuid 8c3e…. What does the changelist show?",
      options: [
        "Update — same name, so the fields are merged.",
        "Nothing — uuid is ignored when comparing config entities.",
        "Delete then Create — same name with a different uuid means a recreated entity.",
        "The import aborts with a site UUID mismatch.",
      ],
      answerIndex: 2,
      explain:
        "The storage comparer only classifies a difference as an update when the uuids match. A differing uuid means the entity was recreated, so sync does the same — which for a node type deletes its field config and displays and leaves the existing nodes orphaned against a bundle that no longer exists.",
    },
    {
      question:
        "You need a working local environment for a project whose production site already exists. Which approach keeps drush cim working?",
      options: [
        "drush site:install standard, then drush cim -y.",
        "drush site:install standard, then delete system.site.yml from the sync directory.",
        "Restore a dump of the production database, then drush cim && drush updb.",
        "Run composer install and skip the database entirely.",
      ],
      answerIndex: 2,
      explain:
        "Cloning the database preserves the one site identity that the sync directory was exported from. Installing fresh mints a new site UUID; deleting system.site.yml just moves the problem, since the export would then no longer describe the site's own settings.",
    },
    {
      question:
        "When is drush config:set system.site uuid <uuid> a defensible thing to run?",
      options: [
        "As a standard step in every deployment, before drush cim.",
        "Once, when adopting a site that has a committed sync directory but no database you can clone, and you are declaring this install to be that site.",
        "Whenever drush config:status shows any difference.",
        "Any time two developers' config entity uuids disagree.",
      ],
      answerIndex: 1,
      explain:
        "It is a one-off reconciliation for a genuine identity claim. Baking it into a deploy makes cim proceed while hiding a real mismatch, and it does nothing for entity-level uuid collisions between developers.",
    },
  ],
};

export default lesson;
