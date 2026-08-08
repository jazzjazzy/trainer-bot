import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-recipes-handoff",
  title: "Cheat Sheet, Recipes & the Site-Builder Handoff",
  part: "Users, Config & Handoff",
  estMinutes: 13,
  summary:
    "The capstone: the Symfony-to-Drupal translation table in one glance, Recipes (D10.3+/D11) as composable config packages that replace both install profiles and 'clicking it all again', the config-vs-content deployment ledger, and the etiquette of a mixed dev/site-builder team.",

  concept: `
## The whole course in one table

Twenty-nine sections ago your reflex for "we need articles with tags and a
listing page" was three PHP classes and a migration. The capstone deliverable
is this table — say any row out loud in an interview and you sound like
someone who has actually run a Drupal team:

| You'd instinctively write | Click instead | Exports as |
| --- | --- | --- |
| Doctrine entity + migration | Structure > Content types | \`node.type.*\`, \`field.storage.*\`, \`field.field.*\` |
| FormType | Manage form display | \`core.entity_form_display.*\` |
| Repository + controller + Twig | Structure > Views | \`views.view.*\` |
| KnpMenuBundle builder | Structure > Menus | \`system.menu.*\` |
| Security voter | People > Permissions grid | \`user.role.*\` |
| Workflow component | Content moderation workflows | \`workflows.workflow.*\` |
| LiipImagineBundle filter sets | Image styles | \`image.style.*\` |
| Serializer + API controller | Views REST export display | \`views.view.*\` |

Every row lands in the third column: **exportable, diffable, deployable
YAML**. That is the course's thesis in one sentence.

### Recipes: click it once, apply it anywhere

Since Drupal 10.3 (and first-class in 11), a **recipe** packages a set of
clicks as a reusable unit: a \`recipe.yml\` that installs modules, imports
their config, ships its own \`config/\` directory of YAML, and runs **config
actions** (\`grantPermissions\`, \`simpleConfigUpdate\`, \`createIfNotExists\`)
against existing config. Apply one with
\`php core/scripts/drupal recipe recipes/blog\` or \`drush recipe recipes/blog\`
(Drush 13+). Core ships starters in \`core/recipes/\` — \`editorial_workflow\`,
\`article_content_type\` and friends — and your own live in the project-root
\`recipes/\` folder, installable via Composer as type \`drupal-recipe\`.

Recipes are the successor energy to install profiles and distributions: a
profile is chosen once at install and locks you in forever; recipes are
**composable** (a recipe lists other recipes), apply to *any* existing site
at *any* time, and leave no runtime trace. "Set up a blog" stops being an
afternoon of clicking or a 200-line install hook — it's \`drush recipe\`.

### The ledger, one last time

The recurring gotcha of this course: \`drush cex\` exports **config**, never
**content**. The four traps, in one list — the vocabulary is config but
**taxonomy terms** are content; the block *placement* is config but **custom
block content** is content; the menu *container* is config but **UI-added
menu links** are content; and **Layout Builder per-node overrides** live in a
field on the node. Recipes can bridge the gap: a recipe may ship a
\`content/\` directory of default content that's created on apply.

### Handoff etiquette on mixed teams

Config changes flow one way: **local UI click → cex → git branch → PR →
cim on prod**. Nobody clicks on production. Devs review config PRs like
code — check \`dependencies\` blocks before approving deletions, treat any
\`user.role.*\` permissions diff as a security review, and read the *changed
keys* of a 300-line \`views.view.*\` diff rather than every line. A
site-builder request becomes a **dev ticket** only when it needs a new
plugin (field type, widget, formatter, Views handler), business logic on
save, or an external integration. Everything else in this course — a field,
a view, a role, a layout — is a click and a config PR.
`,

  comparisons: [
    {
      label: "The translation table: eight features, zero classes",
      intro:
        "The left column is the artifact inventory a Symfony developer plans for a mid-size CMS build. The right column is the same inventory as admin click-paths and the config entities they export to.",
      php: `// The Symfony build plan for "a CMS with articles":
class Article {}                        // Doctrine entity
// + a migration for its table
class ArticleType extends AbstractType {}  // form per entity
class ArticleRepository {}              // the list queries
class ArticleController {}              // list/detail + Twig
class MenuBuilder {}                    // KnpMenuBundle service
class ArticleVoter extends Voter {}     // who can edit what
// workflow: framework.yaml places + transitions
// liip_imagine.yaml filter sets for thumbnails
// serializer groups + an ApiController for JSON
// Every box: code, tests, deploys.`,
      ts: `# Same plan, as clicks -> exportable config:
# Doctrine entity     -> Structure > Content types
#                        node.type.*, field.storage.*, field.field.*
# migration           -> (none; field storage IS config)
# FormType            -> Manage form display
#                        core.entity_form_display.*
# repo+controller+Twig-> Structure > Views
#                        views.view.*
# KnpMenu builder     -> Structure > Menus
#                        system.menu.*
# security Voter      -> People > Roles + Permissions grid
#                        user.role.*
# workflow component  -> Configuration > Workflows
#                        workflows.workflow.*
# LiipImagine filters -> Media > Image styles
#                        image.style.*
# serializer endpoint -> a REST export display on a view
#                        views.view.* (display: rest_export)`,
      note:
        "The right column is the interview answer: features a framework dev would code are config entities in Drupal — built in the UI, exported to YAML, deployed like code.",
    },
    {
      label: "Recipes vs the install hook (and the install profile)",
      intro:
        "Scripting site setup in an install hook is one-shot and imperative; an install profile is a once-forever choice. A recipe is the declarative, composable version — applicable to any site, any time.",
      php: `// The framework reflex: script the setup imperatively.
function myprofile_install(): void {
  \\Drupal::service('module_installer')
    ->install(['node', 'views', 'pathauto']);
  NodeType::create([
    'type' => 'post',
    'name' => 'Post',
  ])->save();
  // ...then ~150 more lines creating field storages,
  // fields, form/view displays, a listing view, a
  // pathauto pattern, an editor role...
}
// Or: bake it into an install PROFILE / distribution.
// You pick exactly ONE at install time, and the site
// depends on it forever. Existing sites: no help.`,
      ts: `# recipes/blog/recipe.yml (D10.4+ / D11.1+) — declarative,
# composable, applies to ANY site at ANY time:
name: 'Blog'
description: 'Post type, tag vocabulary, listing view.'
type: 'Content type'
recipes:
  - core/recipes/editorial_workflow   # compose recipes
install:
  - pathauto
config:
  strict: false      # 'strict' landed in 10.4/11.1,
                     # slightly after recipes (10.3)
  import:
    pathauto: '*'      # take pathauto's default config
  # YAML in this recipe's config/ dir is applied too:
  #   config/node.type.post.yml, config/views.view.blog.yml
  actions:
    user.role.editor:
      grantPermissions:
        - 'create post content'
        - 'edit any post content'
# Apply (repeatably, no lock-in, no runtime trace):
#   php core/scripts/drupal recipe recipes/blog
#   drush recipe recipes/blog          # Drush 13+`,
      note:
        "recipes: composes other recipes, install: enables modules, config: imports + actions mutate existing config, and an optional content/ dir ships default content. Profiles lock in at install; recipes never do.",
    },
    {
      label: "The deployment ledger: what cex will never carry",
      intro:
        "Left: the deploy-day patch a dev writes after discovering production got empty menus and vocabularies. Right: the ledger to memorize so it never happens.",
      php: `// hook_deploy_N(): recreating everything drush cex
// silently skipped shipping to production.
function mysite_deploy_0001(): void {
  Term::create([
    'vid' => 'tags', 'name' => 'Drupal',
  ])->save();                    // terms: content
  MenuLinkContent::create([
    'title' => 'Pricing',
    'link' => ['uri' => 'internal:/pricing'],
    'menu_name' => 'main',
  ])->save();                    // UI menu links: content
  BlockContent::create([
    'type' => 'basic', 'info' => 'Footer promo',
  ])->save();                    // block content: content
  // Layout Builder overrides? Per-node field data.
  // There is no sane script for those.
}`,
      ts: `# CONFIG — cex exports it, git carries it, cim applies it:
#   node.type.*   field.*   core.entity_*_display.*
#   views.view.*  taxonomy.vocabulary.*  system.menu.*
#   block.block.* user.role.*  workflows.workflow.*
#   image.style.* pathauto.pattern.*  language.entity.*
#
# CONTENT — database rows; cex exports NOTHING:
#   nodes, media, users            (obviously)
#   taxonomy TERMS                 (vocabulary is config)
#   custom block CONTENT           (placement is config)
#   menu LINKS added in the UI     (container is config)
#   Layout Builder OVERRIDES       (live in a node field)
#
# Rule of thumb: you typed a machine name at creation
# time -> config. An editor clicked "Add ..." -> content.
# Bridges: recipe content/ dir, Default Content, migrations.`,
      note:
        "Four traps, one pattern: the container/definition is config, the rows inside it are content. Say the rule of thumb in the interview and you've flagged the most common Drupal deploy failure.",
    },
    {
      label: "Handoff etiquette: one source of truth, reviewed like code",
      intro:
        "The anti-pattern is a dev overriding site-builder config in a hook — two sources of truth that fight forever. The pattern is a one-way config pipeline with real PR review.",
      php: `// Anti-pattern: dev "fixes" the site builder's view
// in code while the site builder keeps editing the UI.
function mymodule_views_pre_view(
  ViewExecutable $view,
): void {
  if ($view->id() === 'blog') {
    // Overrides whatever was configured. Invisible in
    // the Views UI, invisible in the exported YAML.
    $view->setItemsPerPage(20);
  }
}
// Now the YAML says 10, prod shows 20, and the next
// person to debug it loses an afternoon. If config is
// wrong, change the CONFIG — in one place.`,
      ts: `# The pipeline (one direction, no prod clicking):
#   local UI click -> drush cex -> git branch -> PR
#     -> merge -> deploy -> drush cim
#
# Reviewing a config PR, check:
#   - dependencies: does deleting this field break a
#     view/display that still lists it?
#   - user.role.* diffs = SECURITY review, never a
#     rubber stamp ("administer nodes" snuck in?)
#   - a 300-line views.view.* diff for one checkbox:
#     review the changed keys, not every line
#   - uuid/_core lines: noise, but leave them alone
#
# Becomes a DEV ticket only when it needs:
#   - a new field type / widget / formatter (plugin)
#   - a Views filter/sort core can't express (plugin)
#   - logic on save, external APIs (hooks/events)
# Otherwise: site-builder task + config PR. That
# boundary is the entire point of this course.`,
      note:
        "Site builders own the clicks, developers own the plugins, git owns the truth. If you must guarantee no prod clicking, the config_readonly module enforces the freeze.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "drush recipe in ~40 lines: resolve recipe dependencies depth-first, install each module once, import config, run config actions. Predict the apply order and the final module list — then run.",
    code: `<?php
// Simulate 'drush recipe recipes/blog'. A recipe lists other
// recipes (applied first), modules to install, config to import,
// and config actions to run against existing config.

$recipes = [
    'article_tags' => [
        'recipes' => [],
        'install' => ['taxonomy'],
        'import'  => ['taxonomy.vocabulary.tags', 'field.field.node.post.field_tags'],
        'actions' => [],
    ],
    'editorial_workflow' => [
        'recipes' => [],
        'install' => ['content_moderation', 'node', 'views'],
        'import'  => ['views.view.moderated_content'],
        'actions' => [],
    ],
    'blog' => [
        'recipes' => ['article_tags', 'editorial_workflow'],
        'install' => ['node', 'views', 'pathauto'],  // node, views already?
        'import'  => ['node.type.post', 'views.view.blog', 'pathauto.pattern.blog'],
        'actions' => [
            'user.role.editor' => "grantPermissions: ['create post content']",
            'system.site'      => 'simpleConfigUpdate: page.front = /blog',
        ],
    ],
];

$installed = [];
$imported  = [];

function applyRecipe(string $name, array $book, array &$installed, array &$imported): void
{
    $recipe = $book[$name];
    foreach ($recipe['recipes'] as $dep) {
        applyRecipe($dep, $book, $installed, $imported);  // deps first
    }
    echo "Applying recipe: " . $name . "\\n";
    foreach ($recipe['install'] as $module) {
        if (!in_array($module, $installed, true)) {       // install ONCE
            $installed[] = $module;
            echo "  install module: " . $module . "\\n";
        }
    }
    foreach ($recipe['import'] as $config) {
        if (!in_array($config, $imported, true)) {
            $imported[] = $config;
            echo "  import config:  " . $config . "\\n";
        }
    }
    foreach ($recipe['actions'] as $target => $action) {
        echo "  config action:  " . $target . " -> " . $action . "\\n";
    }
}

applyRecipe('blog', $recipes, $installed, $imported);

echo "\\nModules installed once each: " . implode(', ', $installed) . "\\n";
echo "Config imported: " . count($imported) . " items\\n";

echo "\\nStill CONTENT (invisible to cex AND to config import):\\n";
foreach (['taxonomy terms', 'menu links added in the UI',
          'custom block content', 'Layout Builder per-node overrides'] as $row) {
    echo "  - " . $row . "\\n";
}
echo "(a recipe CAN ship those in its content/ directory)\\n";`,
    output: `Applying recipe: article_tags
  install module: taxonomy
  import config:  taxonomy.vocabulary.tags
  import config:  field.field.node.post.field_tags
Applying recipe: editorial_workflow
  install module: content_moderation
  install module: node
  install module: views
  import config:  views.view.moderated_content
Applying recipe: blog
  install module: pathauto
  import config:  node.type.post
  import config:  views.view.blog
  import config:  pathauto.pattern.blog
  config action:  user.role.editor -> grantPermissions: ['create post content']
  config action:  system.site -> simpleConfigUpdate: page.front = /blog

Modules installed once each: taxonomy, content_moderation, node, views, pathauto
Config imported: 6 items

Still CONTENT (invisible to cex AND to config import):
  - taxonomy terms
  - menu links added in the UI
  - custom block content
  - Layout Builder per-node overrides
(a recipe CAN ship those in its content/ directory)`,
  },

  keyPoints: [
    "The translation table: entity class -> content type, FormType -> form display, repository+controller+template -> a View, KnpMenu -> Menus UI, voters -> the permissions grid, workflow component -> content moderation, LiipImagine -> image styles, serializer endpoint -> Views REST export — every row exports as config YAML.",
    "Recipes (Drupal 10.3+/11) package clicks: recipe.yml composes other recipes, installs modules, imports config, ships a config/ dir, and runs config actions (grantPermissions, simpleConfigUpdate); apply with php core/scripts/drupal recipe <path> or drush recipe (Drush 13+).",
    "Recipes are the successor to install profiles/distributions: composable, applicable to any existing site at any time, and they leave no runtime trace or lock-in; core ships starters in core/recipes/.",
    "The deployment ledger's four traps: taxonomy terms, custom block content, UI-added menu links, and Layout Builder per-node overrides are all CONTENT — the container around each is config, the rows inside are not.",
    "Config flows one way on a team: local UI click -> cex -> git PR -> cim on prod; nobody clicks on production (config_readonly can enforce it).",
    "A site-builder request becomes a dev ticket only for new plugins (field types, widgets, formatters, Views handlers), save-time logic, or integrations — everything else is a click plus a config PR.",
  ],

  interview: [
    {
      q: "What are Drupal Recipes, and how do they differ from install profiles and distributions?",
      a: "A recipe is a composable package of site-building decisions: a `recipe.yml` that can compose other recipes, install modules, import their config, apply the recipe's own `config/` directory, and run config actions like `grantPermissions` or `simpleConfigUpdate` against existing config. You apply one with `php core/scripts/drupal recipe <path>` or `drush recipe` in Drush 13+. The contrast with install profiles is lifecycle: a profile is chosen exactly once at install time and the site depends on it forever, while recipes can be applied to any existing site, at any point, in any combination, and leave no runtime trace. They shipped in Drupal 10.3 and are the strategic direction in 11 — core even ships starter recipes in `core/recipes/`, like `editorial_workflow`. For a Symfony developer the mental model is Flex recipes, but for admin-built config instead of bundle wiring.",
    },
    {
      q: "Your team deployed config to production and the site 'lost' its menu links, tags, and a footer block. What happened and how do you prevent it?",
      a: "Nothing was lost — it was never exported. `drush cex` exports configuration entities only, and each of those features is a config container holding content rows: the vocabulary is config but terms are `taxonomy_term` entities, the menu is config but UI-added links are `menu_link_content`, the block placement is config but the block's body is `block_content`, and Layout Builder overrides live in a field on each node. The rule of thumb I use: if you typed a machine name at creation time it's config; if an editor clicked 'Add', it's content. Prevention options are to treat that content as editorial (create it per environment), ship it via a recipe's `content/` directory or the Default Content approach, or move genuinely structural pieces into code, like links in a module's `links.menu.yml`.",
    },
    {
      q: "On a mixed team of developers and site builders, who owns configuration, and how do you review it?",
      a: "Everyone can produce config, but git owns the truth and it flows one way: build in the local UI, `drush cex`, commit on a branch, PR review, then `drush cim` on deploy — never click on production (the config_readonly module can enforce that). In review I read config YAML like code: check `dependencies` before approving deletions so a removed field doesn't strand a view, treat any `user.role.*` permissions diff as a security review, and for a 300-line `views.view.*` diff focus on the keys that changed rather than the noise. The anti-pattern to name in an interview is a developer overriding site-builder config in a hook like `hook_views_pre_view()` — that creates two sources of truth, and whichever one loses, someone burns an afternoon debugging it.",
    },
    {
      q: "How do you decide whether a request is a site-building task or a development ticket?",
      a: "I run it through the translation table first: content model changes, form and display tweaks, listings, menus, permissions, moderation states, image derivatives, and simple JSON feeds are all admin-UI features that export as config — site-builder work, delivered as a config PR. It becomes a dev ticket only when the request needs a plugin that doesn't exist (a new field type, widget, formatter, or Views filter/sort/handler), business logic at save or display time (hooks, event subscribers), or an external integration. The disciplined answer is that code raises the maintenance floor permanently, so the UI-plus-config route wins whenever both can deliver — and knowing where that boundary sits is exactly what a Drupal team hires a framework developer to know.",
    },
  ],

  quiz: [
    {
      question:
        "What distinguishes a Recipe (D10.3+/D11) from an install profile?",
      options: [
        "Recipes can only run at site-install time; profiles can run anytime",
        "Recipes are composable and can be applied to any existing site at any time, leaving no runtime lock-in; a profile is chosen once at install and the site depends on it forever",
        "Recipes contain PHP plugins; profiles contain only YAML",
        "Nothing — 'recipe' is the Drupal 11 rename of install profiles",
      ],
      answerIndex: 1,
      explain:
        "A recipe.yml composes other recipes, installs modules, imports config, and runs config actions — repeatably, on any site, with no trace left behind. Install profiles are a one-time, locked-in choice; that lifecycle difference is why recipes are positioned as the successor to profiles and distributions.",
    },
    {
      question:
        "A 'blog' recipe declares install: [node, views], and its dependency recipe editorial_workflow already installed both. What happens when the blog recipe applies?",
      options: [
        "The apply fails with a 'module already installed' error",
        "node and views are reinstalled, resetting their config to defaults",
        "Already-installed modules are simply skipped; recipes are built to apply on top of existing sites",
        "The dependency recipe is rolled back first",
      ],
      answerIndex: 2,
      explain:
        "Recipes are designed to be applied to existing sites, so an install list is 'ensure these are enabled', not 'enable these from scratch'. Combined with config options like strict: false, this is what makes recipes composable where install profiles are not.",
    },
    {
      question:
        "Which request from a site builder genuinely requires a developer ticket rather than admin-UI clicks?",
      options: [
        "Add a 'Subtitle' text field to Articles and show it on teasers",
        "Give the Editor role permission to moderate comments",
        "Sort the events listing by a custom 'weighted popularity' score computed from three fields",
        "Expose the blog listing as a JSON feed for the mobile app",
      ],
      answerIndex: 2,
      explain:
        "Fields, display tweaks, permissions, and Views REST exports are all UI-built config. A computed sort that no Views handler provides means writing a Views sort plugin (or a computed field) — code. The boundary: new plugin types, save-time logic, and integrations are dev work; everything else is clicks plus a config PR.",
    },
    {
      question:
        "In a config PR, which change deserves the closest review?",
      options: [
        "A changed uuid line in an exported view",
        "Three added lines under permissions in user.role.editor.yml",
        "A reordered fields list in core.entity_view_display.node.article.teaser",
        "A label change in node.type.article.yml",
      ],
      answerIndex: 1,
      explain:
        "Permissions diffs are security changes — one line like 'administer nodes' can hand an editor role control of every node on the site. Labels, display ordering, and uuid noise are low-risk; role permission additions should be reviewed the way you'd review an access-control code change.",
    },
  ],
};

export default lesson;
