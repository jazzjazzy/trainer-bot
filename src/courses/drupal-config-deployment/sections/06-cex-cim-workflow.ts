import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "cex-cim-workflow",
  title: "The Core Loop: cex, cim and Reading a Config Diff",
  part: "Everyday Workflow",
  estMinutes: 13,
  summary:
    "The daily rhythm of a Drupal team — click in the UI, export, read the YAML diff like code, commit, deploy, import — and how to tell a real change from a stray local flag before it reaches the pull request.",

  concept: `
## The round trip Symfony does not have

In Symfony the authored artefact and the deployed artefact are the same file.
You open \`config/packages/messenger.yaml\`, type, save, \`git diff\`, commit. One
step, one direction.

Drupal splits that in two. You author in the admin UI, which writes to **active
configuration** in the database. Only when you run \`drush config:export\` (alias
\`cex\`) does that state become files on disk in the sync directory — the one
named by \`$settings['config_sync_directory']\` in \`settings.php\`, conventionally
\`../config/sync\`. On the other end, \`drush config:import\` (\`cim\`) replays those
files into another site's database. The whole discipline of this course exists
because of that round trip.

## The rhythm

For our team of four the loop is fixed, and the order matters:

1. Pull \`main\`, run \`drush cim\` so your laptop starts from the team's truth.
2. Build the thing in the UI.
3. \`drush config:status\` — read what you touched **before** exporting.
4. \`drush cex\` — then \`git diff\` and actually read it.
5. Commit only the files that belong to your ticket. Open the PR.
6. Deploy: \`drush cim\` on stage, then prod.

Step 4 is the one people skip, and step 3 is the one that saves them. Export the
moment you finish a change, not at the end of the week — an export that has been
sitting for three days contains everyone's accidents as well as your feature.

## What a new field looks like

Adding one field to the *Event* content type produces four files, not one:

- \`field.storage.node.field_capacity.yml\` — the storage: type, cardinality,
  shared across every bundle that uses this field.
- \`field.field.node.event.field_capacity.yml\` — the instance: label, required,
  default value, on this bundle only.
- \`core.entity_form_display.node.event.default.yml\` — modified: the widget and
  its position on the edit form.
- \`core.entity_view_display.node.event.default.yml\` — modified: the formatter,
  or the field's name under \`hidden:\`.

Miss the storage file in a cherry-pick and the import fails on a missing
dependency. That is the shape to look for in every field-related PR.

## Reading the noise

A Views change is one enormous file, \`views.view.events.yml\`, where the real
edit hides inside \`display.default.display_options\`. Two things help: read the
\`dependencies:\` block first (it tells you what the View now needs), and treat a
whole-file rewrite as a red flag — that usually means someone deleted and
recreated the View, so it has a **new UUID**. UUID churn is how a "small tweak"
becomes an import that deletes and recreates the View in production instead of
updating it — the storage comparer treats same-name-different-uuid as a recreate.

Also scan for what should never ship: \`system.logging\` flipped to \`verbose\`,
a \`devel.\`-prefixed file, \`system.performance\` with aggregation switched off,
\`config_split\` toggles. Those are environment state, not features.

## Partial workflows

Full \`cim\` is authoritative: anything in the database but absent from the sync
directory gets **deleted**. When that is not what you want:

- \`drush config:import --partial --source=/path/to/dir\` — create and update
  only, never delete, from an arbitrary directory. Good for importing one
  hand-made file.
- \`drush config:get views.view.events > tmp.yml\`, then
  \`cat tmp.yml | drush config:set --input-format=yaml views.view.events ? -\`
  to push a single object back. Never add \`--include-overridden\` to the read
  side of that round trip: it resolves \`settings.php\` and module overrides into
  the returned values, so writing them back would bake environment state into
  stored config — exactly what must never reach the sync directory. Keep that
  flag for inspection only, to see what the running site is actually using.

Both are rescue tools. If \`--partial\` is in your deploy script, the sync
directory has stopped being the source of truth.
`,

  comparisons: [
    {
      label: "Where a change is authored",
      intro:
        "Same outcome — a setting changed and committed. Symfony edits the deployable file directly; Drupal edits a database and then serialises it.",
      leftLang: "yaml",
      rightLang: "bash",
      php: `# Symfony: the file IS the change. Edit, diff, commit. One direction.
# config/packages/framework.yaml
framework:
  session:
    cookie_lifetime: 604800
    cookie_samesite: lax

# $ git diff config/packages/framework.yaml
# $ git commit -am "Session cookies last a week"
# Deploy = git pull. Nothing to import; the container rebuilds.`,
      ts: `# Drupal: click first, serialise second, commit third.

# 1. Admin UI: Configuration > People > Account settings (writes to the DB)
# 2. See what the click actually touched:
drush config:status
#  user.settings                         Different

# 3. Serialise the whole active config to the sync directory:
drush config:export        # alias: drush cex

# 4. Now review it like any other code:
git diff config/sync/
git add config/sync/user.settings.yml
git commit -m "Require admin approval for new accounts"

# 5. On stage/prod, replay it into that site's database:
drush config:import        # alias: drush cim`,
      note:
        "The export step is the entire difference. Forget it and your work exists only in one laptop's database.",
    },
    {
      label: "One new field, seen as a diff",
      intro:
        "A reviewer needs to recognise the shape of a schema change. Doctrine gives you an entity property plus a migration; Drupal gives you four YAML files.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// src/Entity/Event.php — the change a reviewer reads.
#[ORM\\Column(type: 'integer', nullable: false)]
private int $capacity;

// Then: bin/console doctrine:migrations:diff
// src/Migrations/Version20260811093000.php
public function up(Schema $schema): void
{
    $this->addSql('ALTER TABLE event ADD capacity INT NOT NULL');
}

// Two files, both hand-reviewable. The form widget and the
// template that renders it are separate, explicit code.`,
      ts: `# git diff --stat config/sync/ after adding one field in the UI

 field.storage.node.field_capacity.yml           | 20 ++++++++
 field.field.node.event.field_capacity.yml       | 22 ++++++++
 core.entity_form_display.node.event.default.yml |  9 +++++
 core.entity_view_display.node.event.default.yml |  8 +++++

# field.storage.node.field_capacity.yml (new file)
langcode: en
status: true
dependencies:
  module:
    - node
id: node.field_capacity
field_name: field_capacity
entity_type: node
type: integer
settings:
  unsigned: true
cardinality: 1

# core.entity_form_display.node.event.default.yml (modified)
   content:
+    field_capacity:
+      type: number
+      weight: 12
+      region: content`,
      note:
        "Storage + instance + form display + view display. Cherry-pick without the storage file and cim fails on an unmet dependency.",
    },
    {
      label: "Knowing what will change before you act",
      intro:
        "Both ecosystems let you dry-run. Drupal's version answers a question Symfony never has to ask: which direction is this site out of step in?",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: the file on disk is authoritative, so a dry run
# is mostly about the database, not the config.

git diff --stat config/
bin/console doctrine:migrations:status
bin/console doctrine:migrations:migrate --dry-run
bin/console debug:config framework session   # resolved values
bin/console lint:yaml config/

# There is no "the running app disagrees with config/" state.
# The app reads the files; they cannot drift apart.`,
      ts: `# Drupal: DB and sync directory can disagree in either direction.

drush config:status
# -------------------------------------------------- ------------------
#  Name                                               State
# -------------------------------------------------- ------------------
#  field.storage.node.field_capacity                  Only in DB
#  views.view.events                                  Different
#  system.logging                                     Different
#  node.type.press_release                            Only in sync dir

# "Only in DB"       -> you built it here; cex will write it out.
# "Only in sync dir" -> a teammate built it; cim will create it here.
# "Different"        -> both sides moved. Read this one carefully.

# Filter to answer a specific question:
drush config:status --state='Only in sync dir' --prefix=node.type.

# Preview the actual content change rather than a name list:
drush config:import --diff
drush config:export --diff`,
      note:
        "config:status is a two-way report. Run it before cex to see what you are about to commit, and after a git pull to see what cim will do.",
    },
    {
      label: "Importing only part of the tree",
      intro:
        "A full cim is destructive by design: config in the database but missing from the sync directory is deleted. These are the escape hatches, and when they are legitimate.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: "partial" is just git. Take the file you want.
git checkout feature/events -- config/packages/messenger.yaml
git diff --cached

# Or hand-edit one key and restart the worker:
bin/console cache:clear
bin/console messenger:consume async

# Nothing is deleted because nothing is being synchronised;
# there is no authoritative "everything else" to compare against.`,
      ts: `# Create and update only, never delete, from any directory.
mkdir -p /tmp/one-view
cp config/sync/views.view.events.yml /tmp/one-view/
drush config:import --partial --source=/tmp/one-view

# Read one object out — stored active values, no overrides applied ...
drush config:get views.view.events > tmp.yml

# ... and push one object back in:
cat tmp.yml | drush config:set --input-format=yaml views.view.events ? -

# --include-overridden is an inspection flag: it resolves settings.php and
# module overrides into the output, so it shows what the site is really
# running. Never pipe that output into config:set — it would persist the
# environment's override as stored config, and the next cex would commit it.

# Legitimate uses:
#  - hotfix a single item on prod, then export it properly on dev
#  - seed config a module owns without touching the rest of the site
#  - rescue a deploy where an unrelated item blocks the whole import

# NOT legitimate: --partial in the standing deploy script. That hides
# deletions forever and lets prod accumulate config nobody reviewed.`,
      note:
        "--partial trades safety for surgical scope. Use it to recover, never as the normal path.",
    },
  ],

  playground: {
    intro:
      "A miniature config:status. It compares the active config (database) with the sync directory, classifies each item the way Drush would, and then flags the two entries that must never reach the pull request.",
    lang: "php",
    code: `<?php

// Left side = active config (the database, after an afternoon of clicking).
// Right side = config/sync on disk (what git already knows about).
$active = [
  'field.storage.node.field_capacity'           => ['type' => 'integer', 'cardinality' => 1],
  'field.field.node.event.field_capacity'       => ['label' => 'Capacity', 'required' => true],
  'core.entity_form_display.node.event.default' => ['content' => ['title', 'body', 'field_capacity']],
  'core.entity_view_display.node.event.default' => ['content' => ['body', 'field_capacity']],
  'views.view.events'                           => ['status' => true, 'items_per_page' => 10],
  'system.logging'                              => ['error_level' => 'verbose'],
  'devel.settings'                              => ['error_handlers' => [1]],
];

$sync = [
  'core.entity_form_display.node.event.default' => ['content' => ['title', 'body']],
  'core.entity_view_display.node.event.default' => ['content' => ['body']],
  'views.view.events'                           => ['status' => true, 'items_per_page' => 10],
  'system.logging'                              => ['error_level' => 'hide'],
];

// Names that must never leave a laptop, whatever the UI put in the database.
$environmentOnly = ['system.logging', 'devel.'];

function state_of(array $active, array $sync, string $name): string {
  if (!isset($sync[$name])) {
    return 'Only in DB';
  }
  if (!isset($active[$name])) {
    return 'Only in sync dir';
  }
  return $active[$name] === $sync[$name] ? 'Identical' : 'Different';
}

function is_environment_only(string $name, array $prefixes): bool {
  foreach ($prefixes as $prefix) {
    if (str_starts_with($name, $prefix)) {
      return TRUE;
    }
  }
  return FALSE;
}

$names = array_unique(array_merge(array_keys($active), array_keys($sync)));
sort($names);

echo "drush config:status\\n";
echo str_repeat('-', 64), "\\n";
foreach ($names as $name) {
  $state = state_of($active, $sync, $name);
  if ($state === 'Identical') {
    continue;
  }
  printf("  %-46s %s\\n", $name, $state);
}

echo "\\nReviewing what drush cex would stage\\n";
echo str_repeat('-', 64), "\\n";
$ship = 0;
$stop = 0;
foreach ($names as $name) {
  $state = state_of($active, $sync, $name);
  if ($state === 'Identical') {
    continue;
  }
  if (is_environment_only($name, $environmentOnly)) {
    $stop++;
    printf("  STOP  %-42s environment-specific\\n", $name);
  }
  else {
    $ship++;
    printf("  SHIP  %-42s %s\\n", $name, strtolower($state));
  }
}

printf("\\n%d file(s) belong in the pull request; %d need a split or an override.\\n", $ship, $stop);

echo "\\nLine diff for one changed display file\\n";
echo str_repeat('-', 64), "\\n";
$name = 'core.entity_form_display.node.event.default';
$was = $sync[$name]['content'];
$now = $active[$name]['content'];
echo "  ", $name, ".yml\\n";
foreach (array_diff($was, $now) as $removed) {
  echo "  -   ", $removed, "\\n";
}
foreach (array_diff($now, $was) as $added) {
  echo "  +   ", $added, "\\n";
}
`,
    output: `drush config:status
----------------------------------------------------------------
  core.entity_form_display.node.event.default    Different
  core.entity_view_display.node.event.default    Different
  devel.settings                                 Only in DB
  field.field.node.event.field_capacity          Only in DB
  field.storage.node.field_capacity              Only in DB
  system.logging                                 Different

Reviewing what drush cex would stage
----------------------------------------------------------------
  SHIP  core.entity_form_display.node.event.default different
  SHIP  core.entity_view_display.node.event.default different
  STOP  devel.settings                             environment-specific
  SHIP  field.field.node.event.field_capacity      only in db
  SHIP  field.storage.node.field_capacity          only in db
  STOP  system.logging                             environment-specific

4 file(s) belong in the pull request; 2 need a split or an override.

Line diff for one changed display file
----------------------------------------------------------------
  core.entity_form_display.node.event.default.yml
  +   field_capacity
`,
  },

  keyPoints: [
    "Drupal authors config in the database and only serialises it on drush cex; Symfony has no export step because the file is the change. That round trip is the source of every workflow rule in this course.",
    "Run drush config:status before exporting and after pulling: 'Only in DB' means cex will write it out, 'Only in sync dir' means cim will create it here, 'Different' means both sides moved.",
    "One new field is four files — field.storage.*, field.field.*, core.entity_form_display.*, core.entity_view_display.* — and dropping the storage file breaks the import with an unmet dependency.",
    "Export immediately after each UI change so the diff maps to one ticket; a stale export sweeps up teammates' local flags such as system.logging or devel.settings.",
    "A whole-file rewrite of views.view.* usually means the item was deleted and recreated, so its UUID changed — that is what makes an import fail on production rather than merely look noisy.",
    "drush config:import --partial --source=DIR creates and updates but never deletes; it is a rescue tool for hotfixes and seeding, not something that belongs in a deploy script.",
  ],

  interview: [
    {
      q: "Walk me through your team's daily config workflow on a Drupal 10 project.",
      a: "Start the day with `git pull` then `drush cim` so my local database matches what the team has agreed on — otherwise my next export carries someone else's half-finished work. I build the change in the admin UI, then run `drush config:status` to see exactly which config objects moved before I serialise anything. `drush cex` writes the active config to the sync directory, and I read `git diff config/sync/` as carefully as I would read a diff of PHP: I expect to see the files my ticket implies, and nothing else. I stage only those files, push, and the PR review is a review of YAML. Deployment on stage and prod is `drush cim` (usually via `drush deploy`, which also runs database updates and post-update hooks in the right order). The habit that makes this work is exporting immediately after each change, so a diff always corresponds to one piece of work.",
    },
    {
      q: "You open a PR and the diff shows views.view.events.yml rewritten end to end, with a changed uuid. What's happened, and why does it matter?",
      a: "Somebody deleted the View and rebuilt it rather than editing it. Config entities carry a UUID generated once at creation. Import still matches objects by config name — the storage comparer builds its create/update/delete changelist from names — but Drupal also compares UUIDs: `StorageComparer::addChangelistUpdate()` classifies a same-name object whose uuid no longer matches the stored entity's as a *recreate*, so the import does not abort — it puts the name in both the delete and the create changelist and, because deletes run first, quietly destroys the live View and builds the incoming one in its place, taking everything that depended on the old entity with it. On top of that, a full-file rewrite is unreviewable — you cannot see what actually changed. The fix is to revert the recreation and make the edit in place, or, if the rebuild was genuinely necessary, to coordinate it as a deliberate delete-then-create and verify `drush cim --diff` on a copy of production before merging.",
    },
    {
      q: "When is `drush cim --partial` the right tool, and when is it a smell?",
      a: "A full import is authoritative: anything present in the active config but missing from the sync directory gets deleted. `--partial` suppresses that, importing creates and updates only, and `--source` lets you point it at an arbitrary directory. That is genuinely useful for a production hotfix on one item, for seeding config a module owns, or for getting past a deploy where one unrelated object blocks the whole transaction. It is a smell the moment it appears in the standing deploy script, because deletions then never propagate — production quietly accumulates fields, views and roles that nobody has reviewed, and the sync directory stops being the source of truth. Anything you fix with `--partial` should be followed by a proper export from dev so the tree is honest again.",
    },
    {
      q: "A developer says config management is pointless because they can just edit the YAML in config/sync directly, like Symfony. What's your response?",
      a: "Editing the sync directory by hand is legitimate in narrow cases — a one-key change, or resolving a merge conflict — but it is not a substitute for the UI round trip. Config entities carry `dependencies:` and UUIDs that the UI maintains for you, and the importer does validate those dependencies (along with the site UUID and that the modules and themes involved are available). But note what it does *not* do: a normal `drush cim` never checks your YAML against config schema. Schema and constraint validation only runs under strict config schema in tests, or through a dedicated CI step or a contrib tool like config_inspector. So a malformed hand-edit can import perfectly cleanly and then break at runtime — hand-editing a View or a field instance is easy to get subtly wrong in a way that surfaces long after the import. The safe pattern is to hand-edit only when you can then prove it: run `drush cim` locally so the file goes through the importer, verify the site, and re-export. The moment a change involves more than one object or touches dependencies, do it in the UI and let `cex` write the YAML.",
    },
  ],

  quiz: [
    {
      question:
        "After a git pull, `drush config:status` reports `node.type.press_release` as 'Only in sync dir'. What does that tell you?",
      options: [
        "Your local database has a content type that was never exported, and cex would add it to the sync directory.",
        "A teammate exported this content type; running cim here will create it in your database.",
        "The item exists on both sides but its values differ, so someone must resolve a conflict.",
        "The file is orphaned and cim will delete it from the sync directory.",
      ],
      answerIndex: 1,
      explain:
        "'Only in sync dir' means the object exists in the files on disk but not in this site's active config. An import creates it locally. The mirror state, 'Only in DB', is the one where you built something here and cex would write it out; 'Different' means both sides hold the object with different values. cim never modifies the sync directory.",
    },
    {
      question:
        "You add a field to the Event content type in the UI, run drush cex, and cherry-pick only `field.field.node.event.field_capacity.yml` into your PR. What happens on stage?",
      options: [
        "It works — the instance file contains everything needed to create the field.",
        "It works, but the field is invisible until you rebuild caches.",
        "The import fails, because the instance depends on field.storage.node.field_capacity which is not present.",
        "Drupal auto-generates the missing storage file from the instance definition.",
      ],
      answerIndex: 2,
      explain:
        "Field configuration is split in two: field.storage.* defines the field's type and cardinality across all bundles, and field.field.* is the per-bundle instance that depends on it. The instance file's `dependencies:` block names the storage, and the importer validates dependencies before writing, so the import aborts. You also want the two display files, or the field will exist but appear on neither the form nor the rendered output.",
    },
    {
      question:
        "Which change in a `git diff config/sync/` should make you stop and question the PR rather than approve it?",
      options: [
        "core.entity_view_display.node.event.default.yml gained a formatter entry under content.",
        "system.logging.yml changed error_level from 'hide' to 'verbose'.",
        "field.storage.node.field_capacity.yml is added as a new file.",
        "views.view.events.yml changed items_per_page from 10 to 25.",
      ],
      answerIndex: 1,
      explain:
        "Verbose error display is local debugging state that leaked out of someone's laptop into the export; shipping it prints PHP errors to end users on production. Environment-specific values like this belong in a config split or a settings.php override, not in the shared sync directory. The other three are ordinary, reviewable feature changes.",
    },
    {
      question:
        "Why does the guidance say to run `drush cex` immediately after finishing a UI change rather than at the end of the sprint?",
      options: [
        "Because active configuration is discarded from the database after 24 hours.",
        "Because cex can only export objects modified in the current session.",
        "Because a late export sweeps up every unrelated change made in that database, producing a diff nobody can map to a ticket.",
        "Because the sync directory is locked once another developer runs cim.",
      ],
      answerIndex: 2,
      explain:
        "cex always serialises the entire active configuration, not a delta of what you personally touched. The longer you wait, the more experiments, module toggles and debug settings accumulate in that database, and the resulting diff mixes them all together. Exporting immediately keeps each diff small enough that a reviewer can actually read it and match it to the work it claims to be.",
    },
  ],
};

export default lesson;
