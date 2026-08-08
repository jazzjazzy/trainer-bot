import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "config-management",
  title: "Configuration Management: Export/Import vs .env",
  part: "Rendering, Config & Shipping",
  estMinutes: 13,
  summary:
    "Drupal keeps active config in the database and round-trips it to versioned YAML via drush cex/cim — a schema-backed site-state pipeline, not Symfony's static config/*.yaml plus per-environment .env.",

  concept: `
## Two different meanings of "configuration"

In Symfony, "config" is **application parameters**: \`config/packages/*.yaml\`,
service definitions, and environment values in \`.env\` / \`.env.local\`. It is
static text you author, read at container-compile time, and it never travels
back out of the app. Secrets and per-environment values live in \`.env\`; the
committed YAML is the same everywhere.

Drupal's "config" is broader and stranger: it is **site state**. A content type,
a Views listing, an image style, a role's permissions, the site name, enabled
modules — all of it is configuration. Crucially the **active** copy lives in the
database (so the admin UI can edit it live), and you *export* it to YAML to get
it into git. So Drupal config round-trips: DB → YAML → git → DB, whereas Symfony
config is one-way, file → app.

## The active store and the sync directory

Two locations matter:

- **Active config** — the live values in the DB \`config\` table. Editing a form
  at \`/admin\` writes here immediately.
- **Sync directory** — flat YAML on disk, e.g. \`config/sync/*.yml\`, pointed to by
  \`\\$settings['config_sync_directory']\` in \`settings.php\`. This is what you commit.

Drush moves state between them:

- \`drush config:export\` (\`cex\`) — active DB config → \`config/sync\` YAML.
- \`drush config:import\` (\`cim\`) — committed YAML → active DB config.

\`cim\` is your **deploy step** — the moral equivalent of running Doctrine
migrations, but for structure captured as data. In practice you run
\`drush deploy\`, which sequences \`updatedb\`, \`config:import\`, \`cache:rebuild\`,
and \`deploy:hook\`.

## Every config has a schema

Just as Symfony validates bundle config against a \`Configuration\` tree, Drupal
validates config against **schema** files in \`config/schema/*.schema.yml\`. Schema
declares each key's type (\`mapping\`, \`sequence\`, \`label\`, \`text\`, \`boolean\`,
\`integer\`). It drives translation, typed-data casting, and (in D10.2+/D11)
validatable config. A key with no schema triggers warnings.

## Config entities vs simple config

- **Simple config**: one flat file of settings, e.g. \`system.site.yml\` (site
  name, slogan). Closest to a Symfony parameters file.
- **Config entities**: whole structural objects with a UUID and dependencies —
  \`node.type.article.yml\`, \`views.view.frontpage.yml\`. \`cim\` matches these by
  **UUID**, so a rename is an update, not a delete-plus-create.

## Handling per-environment differences

\`.env.local\` has no direct Drupal twin. Two idioms cover it:

- **Config overrides** in \`settings.php\`:
  \`\\$config['system.site']['name'] = 'DEV';\`. This overrides at runtime without
  changing the exported YAML — perfect for env-specific values.
- **Config Split** (contrib): export different config sets per environment (e.g.
  devel enabled on dev, off on prod). Secrets stay in real environment variables
  read via \`getenv()\` in \`settings.php\`, never in exported config.
`,

  comparisons: [
    {
      label: "Where config lives and how it moves",
      intro:
        "Symfony config is authored as files and read one-way at boot. Drupal config is live in the DB and must be exported to reach git.",
      php: `# Symfony: static YAML, read file -> container. One direction.
# config/packages/framework.yaml  (same on every env)
framework:
    secret: '%env(APP_SECRET)%'
    http_method_override: false

# .env.local (per environment, NOT committed)
APP_ENV=prod
DATABASE_URL="postgresql://user:pass@db:5432/app"`,
      ts: `# Drupal: active config lives in the DB; YAML is an export.
# settings.php points at the sync dir you commit:
$settings['config_sync_directory'] = '../config/sync';

# Round-trip both ways with Drush:
#   drush config:export   (cex)  DB  -> config/sync/*.yml -> git
#   drush config:import   (cim)  git -> config/sync/*.yml -> DB`,
      note:
        "The big flip: Drupal config originates in the database (edited via the admin UI) and is exported to git; Symfony config originates as committed files and is never written back.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "A single exported config entity",
      intro:
        "This is what one 'Article' content type looks like once exported — a config entity keyed by UUID, with declared dependencies.",
      php: `# Symfony has no direct equivalent: a content type would be a
# Doctrine entity class + a migration, all authored in PHP.
#[ORM\\Entity]
class Article
{
    #[ORM\\Column(length: 255)]
    private string $title;
}`,
      ts: `# Drupal: config/sync/node.type.article.yml
uuid: 9b2f0c34-1d5e-4a77-9c11-6f0a2e3b4c5d
langcode: en
status: true
dependencies: {  }
name: 'Article'
type: article
description: 'Use articles for time-sensitive content.'
new_revision: true
preview_mode: 1
display_submitted: true`,
      note:
        "cim matches this file by its uuid, not its filename — so renaming the type's label is an update, and the schema in node.schema.yml validates every key.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "The deploy step",
      intro:
        "Promote structural changes from dev to prod without touching editor content.",
      php: `# Symfony: pull code, run migrations, clear cache.
git pull
composer install --no-dev
bin/console doctrine:migrations:migrate --no-interaction
bin/console cache:clear --env=prod`,
      ts: `# Drupal: pull code, then apply config + updates.
git pull
composer install --no-dev
drush deploy   # = updatedb + config:import + cache:rebuild + deploy:hook
# (or run drush cim -y directly to only import config)`,
      note:
        "drush cim is the deploy-time equivalent of running migrations, but it applies STRUCTURE stored as data. Content (nodes, users) is never imported by cim.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Per-environment overrides",
      intro:
        "Symfony uses .env.local; Drupal overrides the active config at runtime from settings.php.",
      php: `# Symfony: .env.local (git-ignored, per environment)
APP_ENV=dev
MAILER_DSN=null://null
# Read anywhere via %env(...)% or $_ENV.`,
      ts: `// Drupal: settings.local.php (git-ignored, per environment)
// Runtime override — does NOT change exported YAML:
$config['system.site']['name'] = 'DEV - My Site';
$config['system.performance']['css']['preprocess'] = FALSE;
// Real secrets stay in env vars:
$databases['default']['default']['password'] = getenv('DB_PASSWORD');`,
      note:
        "$config[...] overrides win at runtime but never leak into drush cex output, so dev tweaks don't dirty your committed config. Config Split (contrib) covers larger per-env differences.",
      rightLang: "php",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Model the cex/cim round-trip: 'active' config lives in an array (the DB), export copies it to a 'sync' store (YAML/git), a settings.php override is applied at runtime, and import writes the sync store back. Predict what each stage prints.",
    code: `<?php
// Stand-in for Drupal's config pipeline. No Drupal bootstrap needed.

// Active config = the live values in the database.
$active = [
    'system.site'        => ['name' => 'Prod Site', 'slogan' => 'Ship it'],
    'node.type.article'  => ['name' => 'Article', 'new_revision' => true],
];

// drush cex: active DB config -> flat YAML files in config/sync (git).
function config_export(array $active): array {
    $sync = [];
    foreach ($active as $name => $data) {
        $sync[$name . '.yml'] = $data;   // one file per config object
    }
    return $sync;
}

// settings.php override: applied at RUNTIME, never exported.
function apply_overrides(array $active): array {
    $active['system.site']['name'] = 'DEV - Prod Site';
    return $active;
}

// drush cim: committed YAML -> active DB config.
function config_import(array $sync): array {
    $active = [];
    foreach ($sync as $file => $data) {
        $active[str_replace('.yml', '', $file)] = $data;
    }
    return $active;
}

$sync = config_export($active);
echo "cex wrote to config/sync:\\n";
foreach (array_keys($sync) as $file) {
    echo "  - " . $file . "\\n";
}

$runtime = apply_overrides($active);
echo "\\nRuntime site name (with override): " . $runtime['system.site']['name'] . "\\n";
echo "Exported site name (in git):        " . $sync['system.site.yml']['name'] . "\\n";

$imported = config_import($sync);
echo "\\nAfter cim, active site name: " . $imported['system.site']['name'] . "\\n";
echo "Config objects imported:     " . count($imported) . "\\n";`,
    output: `cex wrote to config/sync:
  - system.site.yml
  - node.type.article.yml

Runtime site name (with override): DEV - Prod Site
Exported site name (in git):        Prod Site

After cim, active site name: Prod Site
Config objects imported:     2`,
  },

  keyPoints: [
    "Symfony config is static files read one-way (config/*.yaml + .env); Drupal config is site state that lives active in the DB and round-trips DB -> YAML -> git via drush cex/cim.",
    "The sync directory (config/sync, set by $settings['config_sync_directory']) holds the committed YAML; drush config:export writes it, drush config:import applies it.",
    "drush cim is the deploy step — the moral equivalent of running migrations, but for structure stored as data; drush deploy wraps updatedb + cim + cache:rebuild + deploy:hook.",
    "Every config key is validated against schema in config/schema/*.schema.yml, which also drives translation and typed-data casting (validatable config in D10.2+/D11).",
    "Config entities (node.type.*, views.view.*) carry a UUID and are matched on import by UUID, not filename; simple config (system.site.yml) is just a flat settings file.",
    "Per-environment differences use $config[...] overrides in settings.local.php (runtime-only, not exported) or the Config Split contrib module; real secrets stay in env vars via getenv().",
  ],

  interview: [
    {
      q: "Explain Drupal's config export/import workflow to someone who only knows Symfony's config/*.yaml plus .env.",
      a: "In Symfony config is static: you author `config/packages/*.yaml` and per-environment `.env` files, and they're read one-way into the container at boot. Drupal config is *site state* — content types, Views, roles, settings — and the active copy lives in the database so the admin UI can edit it live. To version it you run `drush config:export` (`cex`) to dump the active DB config into `config/sync/*.yml`, commit that, and on other environments run `drush config:import` (`cim`) to apply the YAML back into the database. So Drupal config round-trips DB → YAML → git → DB, whereas Symfony config only ever flows file → app. `cim` is the deploy step, the equivalent of running Doctrine migrations.",
    },
    {
      q: "There's no .env.local in Drupal. How do you handle values that differ per environment, like a dev site name or a database password?",
      a: "Two mechanisms. For values you want to *override* per environment without changing the committed YAML, add `$config['system.site']['name'] = 'DEV';` in a git-ignored `settings.local.php` — these overrides apply at runtime but never appear in `drush cex` output, so dev tweaks don't dirty your exported config. For larger structural differences (a module enabled only on dev), use the **Config Split** contrib module to export separate config sets per environment. Real secrets like DB passwords stay in actual environment variables and are read with `getenv()` inside `settings.php`, exactly like you'd keep them out of committed files in Symfony.",
    },
    {
      q: "What is config schema in Drupal and what does it correspond to in Symfony?",
      a: "Config schema files (`config/schema/*.schema.yml`) declare the type of every key in a config object — `mapping`, `sequence`, `label`, `text`, `boolean`, `integer` and so on. It's roughly the analogue of a Symfony bundle's `Configuration` class that builds a `TreeBuilder` to validate and normalise bundle config. Schema drives typed-data casting, makes config translatable, and in Drupal 10.2+/11 enables validatable/immutable config constraints. Config without matching schema still works but throws schema warnings, which failing tests will flag.",
    },
    {
      q: "Why does drush config:import match config entities by UUID, and when does that bite you?",
      a: "Config entities like `node.type.article` carry a `uuid` in their YAML, and `cim` compares the incoming file's UUID against the active store to decide create vs update vs delete. This lets you rename a content type's label as an *update* rather than a destructive delete-and-recreate. It bites you when the same logical config was created independently on two environments — the UUIDs differ, so importing throws an 'entity ... does not match' error. The fix is to keep one canonical export as the source of truth (or use `drush config:import --partial` carefully), never to hand-create the same structure on multiple sites.",
    },
  ],

  quiz: [
    {
      question:
        "Where does Drupal's ACTIVE configuration live, and how does it get into git?",
      options: [
        "In config/sync YAML files that are read directly at runtime, like Symfony",
        "In the database; you run drush config:export (cex) to write it to config/sync YAML for git",
        "Only in settings.php; git captures it automatically",
        "In .env files committed per environment",
      ],
      answerIndex: 1,
      explain:
        "Active config lives in the database so the admin UI can edit it live. drush cex exports it to config/sync/*.yml, which you commit; drush cim applies committed YAML back into the DB. That DB round-trip is the key difference from Symfony's file-only config.",
    },
    {
      question:
        "During a deploy, which single Drush command applies config and runs update/cache steps in the right order?",
      options: [
        "drush config:export",
        "drush cron",
        "drush deploy (updatedb + config:import + cache:rebuild + deploy:hook)",
        "bin/console doctrine:migrations:migrate",
      ],
      answerIndex: 2,
      explain:
        "drush deploy standardises the sequence: updatedb, config:import, cache:rebuild, then deploy:hook. config:export goes the wrong way (DB -> YAML), and Doctrine migrations are Symfony, not Drupal.",
    },
    {
      question:
        "You want the site name to read 'DEV' on your local environment but keep 'Prod Site' in the committed config. What's the idiomatic approach?",
      options: [
        "Edit config/sync/system.site.yml on the dev box only",
        "Set $config['system.site']['name'] = 'DEV'; in settings.local.php",
        "Run drush cex after changing it in the admin UI",
        "Add SITE_NAME=DEV to .env",
      ],
      answerIndex: 1,
      explain:
        "A $config[...] override in git-ignored settings.local.php changes the value at runtime but never appears in drush cex output, so your committed config stays 'Prod Site'. Editing the sync YAML or re-exporting would pollute git; Drupal has no .env for this.",
    },
  ],
};

export default lesson;
