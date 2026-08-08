import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "config-export-the-bridge",
  title: "Config Export: Where Clicks Become Code",
  part: "Users, Config & Handoff",
  estMinutes: 12,
  summary:
    "Everything built in this course exports with drush cex to config/sync YAML — git-diffable, PR-reviewable, and replayed on production with drush cim — closing the loop between site building and engineering.",

  concept: `
## The receipt for the whole course

Everything you have clicked together since the content-types section is a
config entity, and this is where that pays off. Content types and their fields
(\`node.type.*\`, \`field.storage.*\`, \`field.field.*\`), form and view displays
(\`core.entity_form_display.*\`, \`core.entity_view_display.*\`), vocabularies,
media types, image styles, every View (\`views.view.*\`), block placements
(\`block.block.*\`), menu *definitions* (\`system.menu.*\`), text formats,
roles (\`user.role.*\`), editorial workflows (\`workflows.workflow.*\`),
Pathauto patterns — one command serializes all of it to flat YAML:

\`\`\`bash
drush config:export -y     # everyone types: drush cex -y
\`\`\`

The files land in the **sync directory**. Point it at a git-tracked folder
outside the webroot in \`settings.php\`:

\`\`\`php
$settings['config_sync_directory'] = '../config/sync';
\`\`\`

Left unset, Drupal invents a hashed directory under \`sites/default/files\` —
fine for a throwaway sandbox, wrong for a team.

## The loop that makes clicking professional

1. **Build in the UI, locally.** Clicks write to *active configuration* — the database.
2. **\`drush cex -y\`.** Active config overwrites \`config/sync/*.yml\`.
3. **\`git diff\`.** You see exactly which structures changed. Adding one field
   touches four files: two new (\`field.storage.*\`, \`field.field.*\`) and two
   modified (the form and view displays that place its widget and formatter).
4. **Pull request.** A reviewer reads \`required: true\` and \`cardinality: 1\`
   the way they'd read a Doctrine migration — same rigor, zero PHP.
5. **Merge and deploy.** Production runs \`drush config:import\` (\`cim\`),
   usually via \`drush deploy\` (updatedb → config:import → cache:rebuild →
   deploy hooks). Import is *declarative*: it creates, updates, and deletes
   until active config matches the committed YAML.

\`drush config:status\` (\`cst\`) lists what differs between database and
directory at any moment; the UI equivalent — with a per-item diff viewer —
lives at **Configuration > Development > Configuration synchronization**.

Two corollaries. First, never build structure directly on production: the next
import reverts it — exported config wins, unexported clicks lose. Second,
content never rides this pipe: nodes, users, files, taxonomy *terms*, menu
*links*, and custom block content are content entities. Config carries the
shapes, not the stuff inside them.

## The UUID leash

\`system.site.yml\` carries the site's UUID, and \`cim\` hard-stops when the
target database disagrees: *"Site UUID in source storage does not match the
target storage."* So fresh-install-then-import is the wrong way to spin up a
copy — a fresh install mints a brand-new UUID. Clone a database instead
(\`drush sql:sync @prod @self\`, or restore a dump), then run \`cim\` to catch
up. The leash stops you pouring one site's config into an unrelated site — and
cloning also matters because config sometimes references *content* by UUID: a
placed custom block points at block content a fresh install simply doesn't have.

## Trailhead, not the whole trail

This section is the mindset: UI work is authored config, git is the source of
truth, import is deployment. The full production story — config split for
per-environment modules, \`settings.php\` overrides, ignoring volatile keys,
running \`cim\` in CI — is its own course. Everything there stands on the loop
you just closed.
`,

  comparisons: [
    {
      label: "Getting structure into git",
      intro:
        "The whole site structure lives in the database. The framework instinct is to hand-roll an exporter; Drupal ships one — you only tell it where to write.",
      php: `// Symfony instinct: hand-roll an exporter so "the CMS
// settings" can live in git next to the code.
#[AsCommand(name: 'app:export-structure')]
class ExportStructureCommand extends Command
{
    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        $tables = ['content_types', 'fields', 'listings', 'roles'];
        foreach ($tables as $table) {
            $rows = $this->conn->fetchAllAssociative("SELECT * FROM $table");
            file_put_contents(
                "structure/$table.json",
                json_encode($rows, JSON_PRETTY_PRINT)
            );
        }
        return Command::SUCCESS;
        // Still to write: the importer, the differ, dependency
        // ordering, deletions... this is a project, not a script.
    }
}`,
      ts: `# One-time, in web/sites/default/settings.php:
#   $settings['config_sync_directory'] = '../config/sync';
# (git-tracked, outside the webroot)

$ drush cex -y
 [success] Configuration successfully exported to ../config/sync.

$ ls config/sync | head -8
core.entity_form_display.node.article.default.yml
field.field.node.article.field_subtitle.yml
field.storage.node.field_subtitle.yml
filter.format.basic_html.yml
node.type.article.yml
system.menu.main.yml
user.role.editor.yml
views.view.team.yml
# ...every click from this course, as flat reviewable YAML`,
      note:
        "cex serializes ALL active config — types, fields, displays, views, blocks, menu definitions, formats, roles, workflows, patterns. One command replaces the exporter, the importer, and the differ you would have written.",
      rightLang: "bash",
    },
    {
      label: "What the reviewer sees: a field addition",
      intro:
        "A PR titled 'Add Subtitle to Article'. In Symfony the reviewer reads a migration plus entity/form/template edits. In Drupal the reviewer reads the exported YAML diff: one click, four files.",
      php: `// The reviewable artifact in Symfony: a migration...
public function up(Schema $schema): void
{
    $this->addSql(
        'ALTER TABLE article ADD subtitle VARCHAR(255) DEFAULT NULL'
    );
}
// ...plus edits to Article.php, ArticleType.php, and
// show.html.twig scattered through the same PR.`,
      ts: `$ git diff --stat
 core.entity_form_display.node.article.default.yml |  8 +++++
 core.entity_view_display.node.article.default.yml |  7 ++++
 field.field.node.article.field_subtitle.yml       | 24 ++++++++
 field.storage.node.field_subtitle.yml             | 19 ++++++
 4 files changed, 58 insertions(+)

$ git diff config/sync/core.entity_form_display.node.article.default.yml
@@ -5,6 +5,7 @@ dependencies:
   config:
+    - field.field.node.article.field_subtitle
     - node.type.article
@@ -22,6 +23,10 @@ content:
+  field_subtitle:
+    type: string_textfield
+    weight: -4
+    region: content`,
      note:
        "Two NEW files (the storage and its attachment to Article) and two MODIFIED displays (widget and formatter placement plus their new dependency lines). A wrong cardinality or a missing required: true gets caught here, not in production.",
      rightLang: "bash",
    },
    {
      label: "Shipping to production",
      intro:
        "Deploy day. The Symfony pipeline ships code — but the feature you built is not code, it is rows in your LOCAL database until you export it.",
      php: `# The deploy you know ships code and migrations:
git push
ssh prod 'cd app && git pull && composer install --no-dev'
ssh prod 'bin/console doctrine:migrations:migrate -n'
# Deployed... and prod didn't change. Your clicks are
# still sitting in your local database.

# The two tempting fixes are both wrong:
#   re-click everything in prod's admin UI  -> unreviewed drift
#   mysqldump local | mysql prod            -> clobbers content`,
      ts: `# Locally: turn the clicks into files, then into a PR.
drush cex -y
git add config/sync
git commit -m "Article: add Subtitle field"
git push                     # reviewers read the YAML diff

# On production, after merge:
git pull
drush deploy
#  = updatedb -> config:import -> cache:rebuild -> deploy:hook
# cim replays your clicks exactly; content stays untouched.`,
      note:
        "cim is declarative: prod's active config is made EQUAL to the committed YAML, deletions included. Hotfix clicks made directly on prod are reverted by the next deploy — export them or lose them.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Onboarding a teammate: the site-UUID gotcha",
      intro:
        "A new developer needs a local copy. The framework habit — build every environment from scratch — runs straight into Drupal's site-UUID guard.",
      php: `# The Symfony habit: fresh environments from zero.
composer install
drush site:install -y   # fresh site => NEW random site UUID
drush cim -y            # replay the committed config?

# [error] Site UUID in source storage does not match
#         the target storage.
# system.site.yml in git carries the ORIGINAL site's uuid;
# the fresh install generated a different one. Import refuses.`,
      ts: `# The Drupal habit: environments share one lineage.
composer install
drush sql:sync @prod @self -y   # or restore a sanitized dump
drush cim -y                    # UUIDs match; the diff applies
drush cr

# Cloning also fixes a subtler issue: some config references
# CONTENT by uuid (a placed custom block points at block
# content). A cloned DB has that content; a fresh install
# doesn't, and the block renders as broken/missing.`,
      note:
        "The UUID pin is a feature — it stops you importing one site's config into an unrelated site. Escape hatches exist (drush cset system.site uuid ..., or site:install --existing-config), but a cloned database is the everyday answer.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "You just added one plain-text 'Subtitle' field to Article in the UI. This simulates drush cex followed by git status — predict which files turn up new vs modified — then the UUID guard cim runs on a fresh install.",
    code: `<?php
// config/sync as last committed to git (trimmed to what matters).
$committed = [
    'node.type.article' => ['name' => 'Article'],
    'core.entity_form_display.node.article.default' => [
        'content' => ['title' => ['weight' => -5], 'body' => ['weight' => 0]],
    ],
    'core.entity_view_display.node.article.default' => [
        'content' => ['body' => ['label' => 'hidden']],
    ],
];

// You click: Article > Manage fields > Create a new field
// -> "Subtitle", Text (plain). Active config (the DB) now holds:
$active = $committed;
$active['field.storage.node.field_subtitle'] =
    ['type' => 'string', 'cardinality' => 1];
$active['field.field.node.article.field_subtitle'] =
    ['label' => 'Subtitle', 'required' => false];
$active['core.entity_form_display.node.article.default']['content']['field_subtitle'] =
    ['type' => 'string_textfield', 'weight' => -4];
$active['core.entity_view_display.node.article.default']['content']['field_subtitle'] =
    ['type' => 'string', 'label' => 'hidden'];

// drush cex overwrites config/sync with active config.
// What does git see afterwards?
$status = [];
foreach ($active as $name => $data) {
    if (!array_key_exists($name, $committed)) {
        $status[$name] = 'A';                    // new file
    } elseif ($committed[$name] !== $data) {
        $status[$name] = 'M';                    // modified
    }
}
ksort($status);

echo "git status --short  (after drush cex):\\n";
foreach ($status as $name => $flag) {
    echo "  $flag  config/sync/$name.yml\\n";
}
$new = count(array_keys($status, 'A', true));
$mod = count(array_keys($status, 'M', true));
echo "\\nOne field added in the UI -> $new new + $mod modified YAML files to review.\\n";

// The guard cim runs before touching anything at all:
$uuidInGit = '7f2d63b4-91c0-4a3e-9f6a-2f6c1f0a8f3e';  // system.site.yml
$uuidInDb  = 'c0a1de55-83aa-4b1b-8b2e-77aa61e2b0c1';  // fresh install
echo "\\ndrush cim on a fresh install (different site UUID):\\n";
echo $uuidInGit === $uuidInDb
    ? "  Import the listed configuration changes? (y/n)\\n"
    : "  [error] Site UUID in source storage does not match the target storage.\\n";`,
    output: `git status --short  (after drush cex):
  M  config/sync/core.entity_form_display.node.article.default.yml
  M  config/sync/core.entity_view_display.node.article.default.yml
  A  config/sync/field.field.node.article.field_subtitle.yml
  A  config/sync/field.storage.node.field_subtitle.yml

One field added in the UI -> 2 new + 2 modified YAML files to review.

drush cim on a fresh install (different site UUID):
  [error] Site UUID in source storage does not match the target storage.`,
  },

  keyPoints: [
    "Everything clicked in this course — content types, fields, displays, views, blocks, menu definitions, formats, roles, workflows, patterns — is config, and drush cex serializes all of it to YAML in config/sync.",
    "Set $settings['config_sync_directory'] = '../config/sync' in settings.php: a git-tracked folder outside the webroot, instead of Drupal's default hashed files directory.",
    "The professional loop: build in the UI locally → cex → git diff → PR review of the YAML → merge → drush cim (usually via drush deploy: updatedb → config:import → cache:rebuild → deploy hooks) on production.",
    "One field addition is a four-file diff: field.storage.* and field.field.* are new, the bundle's entity_form_display and entity_view_display are modified — that diff is the reviewable artifact.",
    "Config is pinned to the site UUID in system.site.yml; cim refuses on a mismatch, so spin up new environments by cloning a database, not by fresh-installing — clones also carry content that config references by UUID.",
    "Import is declarative and content-only-excluded: cim makes active config match git (deletes included) while nodes, users, menu links, and custom block content are untouched — and unexported clicks on prod get reverted.",
  ],

  interview: [
    {
      q: "Your team builds features in Drupal's admin UI. How does a field you added by clicking survive code review and reach production?",
      a: "Clicks write to *active configuration* in the database, so on my local site I run `drush cex` to serialize it into the `config/sync` directory — for one field that's two new files (`field.storage.*`, `field.field.*`) plus modified form and view display YAML. I commit those files and open a PR; the reviewer reads the YAML diff exactly like a Doctrine migration — they can see `required`, `cardinality`, widget placement, and dependency changes line by line. After merge, production pulls the code and runs `drush deploy`, which wraps `updatedb`, `config:import`, `cache:rebuild`, and deploy hooks. `config:import` is declarative: it creates, updates, and deletes config until the live site matches the committed YAML, so the feature arrives without anyone re-clicking anything.",
    },
    {
      q: "A new developer runs drush site:install and then drush cim, and gets 'Site UUID in source storage does not match the target storage.' What went wrong and what's the correct workflow?",
      a: "Exported config includes `system.site.yml`, which carries the site's UUID, and `config:import` validates it before touching anything — it's a guard against pouring one site's config into an unrelated site. A fresh install generates a brand-new UUID, so it can never match the committed one. The standard fix is lineage, not force: clone a database from an existing environment (`drush sql:sync @prod @self` or a sanitized dump), after which UUIDs match and `cim` just applies the delta. There are escape hatches — `drush config:set system.site uuid ...` or installing with `drush site:install --existing-config` — but cloning is preferred because config can also reference content by UUID (a placed custom block points at block content), and only a cloned database actually contains that content.",
    },
    {
      q: "What travels through the config pipeline and what doesn't? Where do menus fit?",
      a: "Config carries structure: content types, field storage and instances, form/view displays, views, block *placements*, text formats, roles and permissions, workflows, image styles, and Pathauto patterns. Content entities never ride that pipe — nodes, users, files, taxonomy *terms*, and custom block *content* stay in each environment's database. Menus are the classic trick question: the menu *definition* (`system.menu.main`) is config and exports, but the individual links editors add under Structure > Menus are `menu_link_content` entities — content — so they don't export with `cex`. Knowing that boundary is what keeps deployments predictable: `cim` will recreate your structure exactly but will never ship or delete anyone's content.",
    },
  ],

  quiz: [
    {
      question:
        "A teammate fresh-installs Drupal locally, then runs drush cim -y against the project's committed config and gets 'Site UUID in source storage does not match the target storage.' What's the standard fix?",
      options: [
        "Edit system.site.yml in git so its uuid matches the new local site",
        "Clone a database from an existing environment, then run drush cim",
        "Delete config/sync and run drush cex from the fresh site to regenerate it",
        "Run drush cr to rebuild caches and retry the import",
      ],
      answerIndex: 1,
      explain:
        "Config is pinned to the site UUID in system.site.yml, and a fresh install mints a new random UUID, so cim refuses. Cloning a database (drush sql:sync or a dump) gives the copy the same lineage and UUID, and it also carries content that config references by UUID (like placed custom blocks). Editing git's uuid would break every other environment, and re-exporting from an empty site would destroy the canonical config.",
    },
    {
      question:
        "A PR adds one plain-text field to the Article content type. Which set of config/sync changes should the reviewer expect?",
      options: [
        "One new file: field.field.node.article.field_subtitle.yml",
        "Two new field.* files, plus modifications to Article's entity_form_display and entity_view_display files",
        "A modified node.type.article.yml listing the new field",
        "No YAML changes — field additions are content, not config",
      ],
      answerIndex: 1,
      explain:
        "Adding a field creates field.storage.node.field_subtitle.yml (the reusable storage) and field.field.node.article.field_subtitle.yml (its attachment to the bundle), and it modifies the bundle's core.entity_form_display and core.entity_view_display files to place the widget and formatter (plus new dependency entries). The content type's own YAML doesn't list fields — attachment lives on the field instance.",
    },
    {
      question:
        "An editor with admin access tweaks a View's sort order directly on production. Nobody exports it. What happens on the next deploy that runs drush deploy?",
      options: [
        "The tweak is kept — config:import merges live changes with git",
        "The import fails with a conflict that must be resolved manually",
        "The tweak is reverted — active config is made to match the committed YAML",
        "The tweak survives only if drush cr runs afterwards",
      ],
      answerIndex: 2,
      explain:
        "config:import is declarative, not a merge: it creates, updates, and deletes until active configuration equals config/sync. An unexported production click is exactly the kind of drift it erases. The rule of the loop is 'export or lose it' — structural changes belong in a local build, a cex, and a reviewed PR, not in production's UI.",
    },
  ],
};

export default lesson;
