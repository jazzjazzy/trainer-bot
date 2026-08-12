import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "recipes",
  title: "Recipes: Packaging Config for Reuse",
  part: "Team Workflow",
  estMinutes: 12,
  summary:
    "Package a bundle of modules, config and default content as a recipe, apply it once with drush recipe, and use config actions so the result composes with a site that already exists instead of trampling it.",

  concept: `
## A recipe is a directory, not an extension

Everything so far in this course has moved config that a site *already owns*.
A **recipe** is the other direction: a portable bundle of "make the site look
like this" that you apply to a site once. It is a directory containing a
\`recipe.yml\`, an optional \`config/\` directory of config files to create, and
an optional \`content/\` directory of default content.

\`\`\`yaml
# recipes/team4_blog/recipe.yml
name: 'Team Four blog'
description: 'Blog section: content type, tags, editorial workflow.'
type: 'Content type'
recipes:
  - core/recipes/article_content_type   # recipes compose
  - core/recipes/editorial_workflow
install:
  - views
  - path
config:
  strict: false        # tolerate config that already exists
  import:
    node:
      - views.view.frontpage
  actions:
    user.role.content_editor:
      grantPermissions:
        - 'view any unpublished content'
    system.site:
      simpleConfigUpdate:
        page.front: /node
\`\`\`

The Recipe APIs landed in core as **experimental in Drupal 10.3**, and matured
across the 11.x cycle — Drupal 11.1 is the release that made them genuinely
usable (recipe \`input\` for prompting the operator, and a much wider set of
config actions), so treat 11.1 as your practical floor. Apply one with
\`drush recipe recipes/team4_blog\` (Drush 13+) or, with no Drush,
\`php core/scripts/drupal recipe recipes/team4_blog -v\` from the web root.

### Apply-once, and untracked

This is the part that surprises people. A recipe is **not installed** — it is
*applied*. There is no \`core.extension\` entry, no uninstall hook, no registry
of "which recipes has this site had". Core fires a \`RecipeAppliedEvent\` and
then forgets. So:

- Re-applying is not an error, but it is not a no-op either — it is whatever
  the actions do a second time.
- You cannot "update" a shipped recipe on a live site. Once applied, the config
  belongs to the site, and future changes go through \`cex\`/\`cim\` like anything
  else.
- Recipes are a **scaffolding** tool, not a deployment mechanism. \`drush recipe\`
  does not belong in your production deploy script; \`drush deploy\` does.

### Config actions make it composable

If a recipe only shipped raw config files it would be destructive: applying it
would clobber the \`content_editor\` role a site already has. **Config actions**
fix that. Each entry under \`config.actions\` is *config name → action id →
value*, and the actions are surgical: \`createIfNotExists\` and \`create\`,
\`simpleConfigUpdate\` (simple config only — using it on a config entity is
deprecated as of Drupal 11.2 and throws in Drupal 12; use \`setProperties\`
instead),
\`setProperties\`, \`grantPermission\` / \`grantPermissions\` /
\`grantPermissionsForEachNodeType\`, \`setComponent\` on an entity form or view
display. They *add to* the site rather than replace it, and most are idempotent.

\`config.strict\` controls the other half: \`strict: false\` means "if this config
already exists, I don't care what it looks like"; \`strict: true\` (or a list of
names) makes a pre-existing mismatch a hard failure. Core uses the strict list
for field storages, because those decide the database layout.

### Recipes vs profiles vs Features

An **install profile** is one-per-site and chosen at install time — it was the
old answer to "ship a site template", and it locks you in. **Features** was the
contrib answer *before* CMI existed and is legacy on Drupal 8+. Recipes are the
current answer: additive, composable, many-per-site, applied whenever you want.
`,

  comparisons: [
    {
      label: "The same idea, the same word",
      intro:
        "Symfony Flex recipes and Drupal recipes solve the same problem — 'install this thing and wire it up sensibly' — and even share the name. Compare the two manifests.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony Flex recipe: manifest.json in the recipes repo,
# keyed by package name + version.
{
  "bundles": {
    "Symfony\\\\Bundle\\\\SecurityBundle": ["all"]
  },
  "copy-from-recipe": {
    "config/": "%CONFIG_DIR%/"
  },
  "env": {
    "APP_SECRET": "%generate(secret)%"
  },
  "post-install-output": [
    "Configure your firewalls in config/packages/security.yaml"
  ]
}

# Triggered by: composer require symfony/security-bundle
# Flex records what it applied in symfony.lock.`,
      ts: `# Drupal recipe: recipes/team4_blog/recipe.yml
name: 'Team Four blog'
description: 'Blog section for the team4 site.'
type: 'Content type'
recipes:
  - core/recipes/article_content_type
install:
  - views
  - path
config:
  strict: false
  import:
    node:
      - views.view.frontpage
  actions:
    system.site:
      simpleConfigUpdate:
        page.front: /node

# Triggered by: drush recipe recipes/team4_blog
# Drupal records nothing. Applying is one-way.`,
      note:
        "Flex writes symfony.lock so it knows what it applied; Drupal deliberately keeps no ledger — a recipe leaves behind ordinary config that the site now owns.",
    },
    {
      label: "Adding a permission without owning the role",
      intro:
        "Your bundle needs the editor role to gain one permission. The site may or may not already have that role, and you must not overwrite whatever else is on it.",
      leftLang: "php",
      rightLang: "yaml",
      php: `// Symfony: roles are usually a hierarchy in config, so a
// reusable bundle prepends config rather than replacing it.
final class Team4BlogExtension extends Extension
  implements PrependExtensionInterface
{
  public function prepend(ContainerBuilder $container): void
  {
    // Merged with (not replacing) the app's security config.
    $container->prependExtensionConfig('security', [
      'role_hierarchy' => [
        'ROLE_EDITOR' => ['ROLE_VIEW_UNPUBLISHED'],
      ],
    ]);
  }
}

// Anything data-shaped (a DB row, a stored setting) needs a
// Doctrine migration, and migrations are tracked + versioned.`,
      ts: `# Drupal: a config action. Surgical and idempotent.
config:
  strict: false
  actions:
    user.role.content_editor:
      # Create it only if the site doesn't have it already.
      createIfNotExists:
        label: 'Content editor'
      grantPermissions:
        - 'view any unpublished content'
        - 'view latest version'
      # Per content type, expanded for every node bundle:
      grantPermissionsForEachNodeType:
        - 'create %bundle content'
        - 'edit own %bundle content'`,
      note:
        "grantPermissions merges into the existing permission list. Run it twice and nothing changes — that idempotency is what makes recipes safe to compose.",
    },
    {
      label: "Standing up a new site from the org template",
      intro:
        "A fourth site joins the portfolio. The team wants the same base every time: modules, roles, editorial workflow, admin theme.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: the template is a project skeleton + shared bundles.
composer create-project acme/site-skeleton newsite
cd newsite
composer require acme/editorial-bundle   # Flex recipe fires
bin/console doctrine:migrations:migrate -n
bin/console acme:bootstrap-roles
git init && git add . && git commit -m "New site from skeleton"

# The skeleton is a starting point only. Improvements made to
# it later do not flow back into sites already created.`,
      ts: `# Drupal: install, then apply recipes - additively.
composer create-project drupal/recommended-project newsite
cd newsite/web
drush site:install minimal --account-name=admin -y

drush recipe ../recipes/acme_base            # roles, admin theme
drush recipe ../recipes/acme_editorial       # workflow + perms
drush recipe ../recipes/team4_blog           # blog section

drush cex -y      # the recipes' output is now OUR config
git add config/sync && git commit -m "Bootstrap newsite"

# Note: an install PROFILE could only be chosen once, at
# site:install time. Recipes stack, and you can add more later.`,
      note:
        "The last two lines are the whole workflow: recipes bootstrap, then you immediately cex so the result is tracked config under your own review process.",
    },
    {
      label: "Distributing it to the other three sites",
      intro:
        "Once a recipe is worth sharing, it ships as a Composer package — exactly like a Flex recipe or a shared bundle.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: a private bundle on a private Packagist.
# composer.json of the bundle
{
  "name": "acme/editorial-bundle",
  "type": "symfony-bundle",
  "require": { "symfony/framework-bundle": "^7.0" }
}

# Consumers just require it; the Flex recipe (if any) lives in
# a separate recipes repo keyed by name + version constraint.
# Upgrading the bundle re-runs nothing by default:
#   composer recipes:update acme/editorial-bundle`,
      ts: `# Drupal: a package of type drupal-recipe.
# composer.json of the recipe
{
  "name": "acme/editorial-recipe",
  "type": "drupal-recipe",
  "require": { "drupal/content_moderation": "*" }
}

# The project needs composer/installers to route it:
#   "installer-paths": {
#     "recipes/{$name}": ["type:drupal-recipe"]
#   }
# (Recent drupal/recommended-project templates set this up
# for you.) Then:
#   composer require acme/editorial-recipe
#   drush recipe recipes/editorial-recipe`,
      note:
        "Composer only puts the directory on disk. Nothing is applied until someone runs drush recipe — that separation is intentional and is why recipes never fire during a deploy.",
    },
  ],

  playground: {
    intro:
      "A miniature of the config action pipeline. The 'active config' is an array; the recipe is a list of actions. Watch pass 2 — this is what makes a recipe composable rather than destructive.",
    lang: "php",
    code: `<?php

// A miniature of Drupal's config action pipeline: the active config store is
// just an array, and a recipe is a list of actions applied to it.

$active = [
  'user.role.content_editor' => [
    'id' => 'content_editor',
    'label' => 'Content editor',
    'permissions' => ['access content', 'access toolbar'],
  ],
  'system.site' => [
    'name' => 'Team Four',
    'page' => ['front' => '/home'],
  ],
];

// recipe.yml -> config.actions, flattened to [config name, action id, value].
$recipe = [
  ['user.role.content_editor', 'createIfNotExists', ['id' => 'content_editor', 'label' => 'Content editor', 'permissions' => []]],
  ['user.role.reviewer', 'createIfNotExists', ['id' => 'reviewer', 'label' => 'Reviewer', 'permissions' => []]],
  ['user.role.content_editor', 'grantPermissions', ['view any unpublished content', 'view latest version']],
  ['user.role.reviewer', 'grantPermissions', ['view latest version']],
  ['system.site', 'simpleConfigUpdate', ['page.front' => '/node']],
];

function apply_action(array &$active, string $name, string $action, array $value): string {
  switch ($action) {
    case 'createIfNotExists':
      if (isset($active[$name])) {
        return 'already exists, skipped';
      }
      $active[$name] = $value;
      return 'created';

    case 'grantPermissions':
      $before = $active[$name]['permissions'];
      $active[$name]['permissions'] = array_values(array_unique(array_merge($before, $value)));
      $added = count($active[$name]['permissions']) - count($before);
      return 'granted, +' . $added . ' permission(s)';

    case 'simpleConfigUpdate':
      $touched = [];
      foreach ($value as $path => $new) {
        $ref = &$active[$name];
        foreach (explode('.', $path) as $part) {
          $ref = &$ref[$part];
        }
        $ref = $new;
        unset($ref);
        $touched[] = $path;
      }
      return 'set ' . implode(', ', $touched);
  }
  return 'unknown action';
}

foreach ([1, 2] as $pass) {
  echo "== apply pass {$pass} ==\\n";
  foreach ($recipe as [$name, $action, $value]) {
    printf("  %-26s %-18s %s\\n", $name, $action, apply_action($active, $name, $action, $value));
  }
}

echo "\\n-- effective config --\\n";
echo 'content_editor: ' . implode(' | ', $active['user.role.content_editor']['permissions']) . "\\n";
echo 'reviewer:       ' . implode(' | ', $active['user.role.reviewer']['permissions']) . "\\n";
echo 'front page:     ' . $active['system.site']['page']['front'] . "\\n";
`,
    output: `== apply pass 1 ==
  user.role.content_editor   createIfNotExists  already exists, skipped
  user.role.reviewer         createIfNotExists  created
  user.role.content_editor   grantPermissions   granted, +2 permission(s)
  user.role.reviewer         grantPermissions   granted, +1 permission(s)
  system.site                simpleConfigUpdate set page.front
== apply pass 2 ==
  user.role.content_editor   createIfNotExists  already exists, skipped
  user.role.reviewer         createIfNotExists  already exists, skipped
  user.role.content_editor   grantPermissions   granted, +0 permission(s)
  user.role.reviewer         grantPermissions   granted, +0 permission(s)
  system.site                simpleConfigUpdate set page.front

-- effective config --
content_editor: access content | access toolbar | view any unpublished content | view latest version
reviewer:       view latest version
front page:     /node
`,
  },

  keyPoints: [
    "A recipe is a directory: recipe.yml plus optional config/ and content/ subdirectories. It declares name, description, type, other recipes to apply first, modules/themes to install, and config to import or act on.",
    "Recipes are applied, not installed — drush recipe path/to/recipe (Drush 13+) or php core/scripts/drupal recipe path -v. Core keeps no record of which recipes ran, so applying is one-way and belongs to site setup, never to a production deploy script.",
    "Config actions (createIfNotExists, grantPermissions, grantPermissionsForEachNodeType, simpleConfigUpdate, setProperties, setComponent) are what make a recipe additive and mostly idempotent instead of destructive.",
    "config.strict decides how much a recipe cares about pre-existing config: false means 'whatever is already there is fine', true (or a list of names) turns a mismatch into a hard failure — core uses the strict list for field storages.",
    "The Recipe APIs arrived experimental in Drupal 10.3 and became practical in 11.1 with recipe inputs and a broader action set; target 11.1+ if you plan to rely on them.",
    "Recipes replace install profiles (one-per-site, chosen at install time) and Features (the pre-CMI contrib hack). After applying a recipe, drush cex so the result becomes tracked config you own.",
  ],

  interview: [
    {
      q: "What is a Drupal recipe, and how is it different from a module?",
      a: `A recipe is a directory containing \`recipe.yml\` — a declarative bundle of modules to install, config to import, config actions to run, and optional default content. The critical difference from a module is lifecycle: a module is *installed*, tracked in \`core.extension\`, and can be uninstalled; a recipe is **applied once** and leaves no trace. Core fires a \`RecipeAppliedEvent\` and then keeps no registry, so there is no "update the recipe" path — once applied, the config belongs to the site and evolves through \`drush cex\`/\`cim\` like any other config. That makes recipes a site-building and bootstrapping tool, not a deployment mechanism: \`drush recipe\` should never appear in your production deploy script.`,
    },
    {
      q: "How do recipes avoid destroying configuration a site already has?",
      a: `Two mechanisms. First, **config actions**: instead of dumping raw YAML over the top of existing config, \`config.actions\` names a config object, an action id, and a value — \`createIfNotExists\` skips if the object is already there, \`grantPermissions\` merges into an existing role's permission list, \`setComponent\` adds one field to an entity display without rewriting it. Most are idempotent, so re-running them is harmless. Second, \`config.strict\`: \`strict: false\` means "if this config already exists I don't care what it looks like", while \`strict: true\` or a list of config names makes a pre-existing mismatch a hard failure. Core uses the strict-list form for field storages, since those determine the database layout and silently accepting a different one would be dangerous.`,
    },
    {
      q: "When would you choose a recipe over an install profile or the Features module?",
      a: `Almost always, on Drupal 11.1+ (10.3 shipped the APIs experimentally). An install profile is chosen once at \`site:install\` time and there is exactly one per site — it can't be composed, and you can't add a second one later. Features was the pre-CMI contrib answer to packaging config; core CMI plus recipes cover its job, and on a modern site Features is legacy you'd migrate off. Recipes are additive and composable: they can list other recipes as dependencies, you can apply as many as you like whenever you like, and each one is a small unit like "blog section" or "editorial workflow". The one thing a recipe can't do is what a module does — provide code, services and update hooks — so ongoing behaviour still lives in a custom module.`,
    },
    {
      q: "If you know Symfony Flex, what carries over and what doesn't?",
      a: `The shape carries over almost exactly: a manifest that says "enable these things, drop in this config, set these values", triggered when you adopt a package. Both are for scaffolding, not for continuous deployment. The differences matter though. Flex applies its recipe automatically on \`composer require\` and records the result in \`symfony.lock\`, so it can tell you when a recipe has changed and offer \`composer recipes:update\`. Drupal deliberately splits the two steps: Composer only puts the recipe directory on disk (via \`type: drupal-recipe\` and a \`composer/installers\` path), and nothing happens until a human runs \`drush recipe\`. And Drupal keeps no lock file, so there is no update path at all — you get the config once and then own it.`,
    },
  ],

  quiz: [
    {
      question:
        "Your production deploy script currently runs `drush deploy`. A teammate proposes adding `drush recipe recipes/team4_blog` after it so prod gets the new blog section. What's the problem?",
      options: [
        "Nothing — that's the intended way to deploy recipe-provided config.",
        "Recipes are apply-once and untracked; the blog config should have been exported to config/sync on dev and shipped via config:import instead.",
        "`drush recipe` only works on the site that first installed Drupal.",
        "Recipes can only be applied by the site owner account, so it would fail in CI.",
      ],
      answerIndex: 1,
      explain:
        "A recipe is a bootstrapping tool. You apply it on dev, then `drush cex` so the resulting config is tracked in git and reviewed — production gets it through the normal `drush deploy` / `config:import` path. Running `drush recipe` in production reintroduces exactly the untracked, environment-divergent config the whole deployment workflow exists to prevent.",
    },
    {
      question:
        "A recipe ships a `content_editor` role. Some target sites already have that role with their own permissions. Which recipe.yml fragment adds two permissions without clobbering the existing role?",
      options: [
        "Put a full `user.role.content_editor.yml` in the recipe's `config/` directory.",
        "`config: { import: { user: ['user.role.content_editor'] } }`",
        "`config: { strict: true, actions: { user.role.content_editor: { create: {...} } } }`",
        "`config: { strict: false, actions: { user.role.content_editor: { createIfNotExists: {...}, grantPermissions: [...] } } }`",
      ],
      answerIndex: 3,
      explain:
        "`createIfNotExists` returns early when the role is already present, and `grantPermissions` merges into the existing permission list rather than replacing it. `strict: false` says a pre-existing role that doesn't match the recipe's expectations is acceptable. The `create` action, by contrast, throws if the entity already exists, and shipping a raw config file or importing one would overwrite the site's role.",
    },
    {
      question:
        "Which statement about `simpleConfigUpdate` is correct?",
      options: [
        "It is the recommended action for config entities such as node types and views.",
        "It is for simple config; using it on a config entity is deprecated in 11.2 and will throw in 12 — use `setProperties` instead.",
        "It creates the config object if it doesn't exist yet.",
        "It is only available inside install profiles, not recipes.",
      ],
      answerIndex: 1,
      explain:
        "`simpleConfigUpdate` is meant for simple config. On Drupal 11.2+ core's `SimpleConfigUpdate` plugin emits a deprecation when it is handed a config entity and directs you to `setProperties`; that becomes a hard exception in Drupal 12. (On 10.3–11.1 there is no check at all, so it just writes — which is exactly why the deprecation was added.) It also throws if the config object doesn't exist — it updates, it never creates. Config entities have their own action family: `create`/`createIfNotExists`, `setProperties`, `setComponent`, and role-specific ones like `grantPermissions`.",
    },
    {
      question:
        "Your team wants one shared 'org baseline' applied to four sites, and wants to add a second, independent 'commerce baseline' to two of them later. Which tool fits?",
      options: [
        "Two install profiles, one per baseline.",
        "The Features module, exporting each baseline as a feature.",
        "Two recipes — recipes are additive, composable and can be applied at any time, as many as you want.",
        "A single custom module whose hook_install() writes the config.",
      ],
      answerIndex: 2,
      explain:
        "An install profile is one-per-site and locked in at `site:install` time, so a second baseline is impossible. Features is the pre-CMI contrib approach and is legacy on modern Drupal. Recipes are designed for exactly this: independent bundles that stack, can list other recipes as dependencies, and can be applied whenever the need arises.",
    },
  ],
};

export default lesson;
