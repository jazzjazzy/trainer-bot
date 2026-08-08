import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "field-api-no-migrations",
  title: "Fields & the Field API (No Schema Migrations)",
  part: "Content Model & Entities",
  estMinutes: 13,
  summary:
    "In Doctrine you edit a property, add an attribute, and run a migration; in Drupal the entity's own fields live in code as base fields, while most fields are added by site admins in the UI as config — and the field system builds the schema for you, no hand-written migration.",

  concept: `
In Symfony you own the schema. You add a typed property to an entity, annotate it
with \`#[ORM\\Column]\`, run \`doctrine:migrations:diff\`, review the generated SQL,
then \`doctrine:migrations:migrate\`. The developer decides every column, and the
database only changes when a migration runs.

Drupal splits this into two very different tracks, and neither one is a
hand-written migration.

### Track 1: base fields (code, like Doctrine)

Base fields are the fields intrinsic to an entity type — a node always has
\`title\`, \`uid\`, \`created\`, \`status\`. You declare them in code by overriding
\`baseFieldDefinitions()\` on the entity class, returning an array of
\`BaseFieldDefinition\` objects. This is the closest thing to Doctrine: the
developer owns it, it ships in your module.

The schema is still not written by hand. The **entity system** derives the
storage from your field definitions. On module install it creates the tables;
when you add or change a base field later you tell the entity definition update
manager (usually from a \`hook_update_N\`), then run \`drush updatedb\`. You never
write \`ALTER TABLE\`.

### Track 2: configurable (bundle) fields — the big divergence

Most fields on a Drupal site are **not** in code at all. A site builder adds
"Body", "Tags", "Publish date" to the Article content type through the admin UI
(*Structure > Content types > Manage fields*). Each field becomes two **config
entities**, exported as YAML:

- \`field.storage.node.field_subtitle.yml\` — the storage (type, cardinality),
  shared across bundles.
- \`field.field.node.article.field_subtitle.yml\` — the instance on one bundle
  (label, required, default).

The field system reads that config and provisions the database columns
automatically. There is **no migration file** — the "migration" is just
importing config with \`drush config:import\`. This is why a Drupal content model
can be built by a non-developer and moved between environments as config.

### Field types are plugins

A field type — \`string\`, \`integer\`, \`boolean\`, \`datetime\`,
\`entity_reference\`, \`text_long\`, \`link\` — is a **plugin**, not a Doctrine
type. Each is a \`FieldItemBase\` subclass declaring its stored properties via
\`propertyDefinitions()\` and its DB columns via \`schema()\`. In Drupal 10.2+ /
11 they can be declared with a \`#[FieldType(...)]\` PHP attribute; older code uses
the \`@FieldType\` annotation. Because they are plugins, contrib modules add new
field types the same way core does.

### The workflow contrast

Symfony: change code, generate a migration, run it — every schema change flows
through the developer and version control. Drupal: base-field changes flow
through code + update hooks; the far more common configurable-field changes flow
through the UI and are captured as **config**, and the field system — never you —
touches the table structure.
`,

  comparisons: [
    {
      label: "Adding a field to an entity",
      intro:
        "You want a new 'subtitle' string on your content. In Symfony that is a property plus a column attribute plus a migration. In Drupal a developer-owned base field is defined in baseFieldDefinitions(); no SQL is written by hand.",
      php: `<?php
// src/Entity/Article.php  (Symfony / Doctrine)
namespace App\\Entity;

use Doctrine\\ORM\\Mapping as ORM;

#[ORM\\Entity]
class Article
{
    #[ORM\\Column(type: 'string', length: 255)]
    private string $subtitle = '';
}

// Then, at the CLI:
//   php bin/console doctrine:migrations:diff
//   php bin/console doctrine:migrations:migrate`,
      ts: `<?php
// A base field on a custom entity type (Drupal).
use Drupal\\Core\\Field\\BaseFieldDefinition;
use Drupal\\Core\\Entity\\EntityTypeInterface;

public static function baseFieldDefinitions(
  EntityTypeInterface $entity_type,
) {
  $fields = parent::baseFieldDefinitions($entity_type);

  $fields['subtitle'] = BaseFieldDefinition::create('string')
    ->setLabel(t('Subtitle'))
    ->setSetting('max_length', 255)
    ->setDisplayOptions('form', ['type' => 'string_textfield']);

  return $fields;
}
// New install: schema auto-created. Later change: register it in a
// hook_update_N via the entity definition update manager, then: drush updatedb`,
      note:
        "Both declare the field in code, but Drupal's entity system derives the storage — you never write the ALTER TABLE that Doctrine generates for you.",
    },
    {
      label: "The common case: a field added in the UI, stored as config",
      intro:
        "Most Drupal fields are not in code. A site builder adds a field to the Article type in the admin UI; Drupal writes it as two config entities. Symfony has no direct equivalent — schema is always developer-owned.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony has no admin-UI field builder. The closest analogue is
# still a developer editing the entity + a migration:
#
#   #[ORM\\Column(type: 'text', nullable: true)]
#   private ?string $subtitle = null;
#
#   php bin/console doctrine:migrations:diff
#   php bin/console doctrine:migrations:migrate
#
# There is no "config export" of the schema — it lives in migration
# classes committed to the repo.`,
      ts: `# config/sync/field.storage.node.field_subtitle.yml
langcode: en
status: true
id: node.field_subtitle
field_name: field_subtitle
entity_type: node
type: string           # the field-type plugin id
settings:
  max_length: 255
cardinality: 1
---
# config/sync/field.field.node.article.field_subtitle.yml
id: node.article.field_subtitle
field_name: field_subtitle
entity_type: node
bundle: article
label: 'Subtitle'
required: false
# Deploy elsewhere with:  drush config:import`,
      note:
        "Storage config is shared across bundles; the field config is the per-bundle instance. The field system provisions the columns from this YAML — importing config IS the migration.",
    },
    {
      label: "Field types: a Doctrine Type vs a Drupal plugin",
      intro:
        "A custom field type that stores an RGB colour. Symfony uses a Doctrine custom Type registered in config; Drupal uses a FieldType plugin discovered automatically.",
      php: `<?php
// A Doctrine custom type (Symfony).
namespace App\\Doctrine\\Type;

use Doctrine\\DBAL\\Types\\Type;
use Doctrine\\DBAL\\Platforms\\AbstractPlatform;

class RgbType extends Type
{
    public function getName(): string { return 'rgb'; }

    public function getSQLDeclaration(array $col, AbstractPlatform $p): string
    {
        return 'VARCHAR(7)';
    }
}
// Registered in doctrine.yaml:  types: { rgb: App\\Doctrine\\Type\\RgbType }`,
      ts: `<?php
// A field-type plugin (Drupal 10.2+/11 attribute form).
namespace Drupal\\my_module\\Plugin\\Field\\FieldType;

use Drupal\\Core\\Field\\Attribute\\FieldType;
use Drupal\\Core\\Field\\FieldItemBase;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup as T;

#[FieldType(
  id: 'rgb',
  label: new T('RGB colour'),
  default_widget: 'text_textfield',
  default_formatter: 'string',
)]
class RgbItem extends FieldItemBase {
  // schema() declares columns; propertyDefinitions() declares properties.
}`,
      note:
        "Doctrine types are registered in config and map to one SQL declaration. Drupal field types are auto-discovered plugins that own their schema, widget, and formatter — much richer, and addable by contrib.",
    },
  ],

  playground: {
    intro:
      "This models, in plain PHP, how Drupal's field system turns declarative field definitions into database columns — no ALTER TABLE written by you. A base field and a UI-added configurable field both flow through the same provisioning step.",
    lang: "php",
    code: `<?php
// A tiny stand-in for how Drupal derives storage from field definitions.
// (No Drupal bootstrap; just the mechanism.)

// The field-type "plugins": each knows the SQL columns it needs.
$fieldTypes = [
  'string'           => fn($s) => "VARCHAR(" . ($s['max_length'] ?? 255) . ")",
  'integer'          => fn($s) => "INT",
  'entity_reference' => fn($s) => "INT UNSIGNED",  // stores target_id
];

// Field definitions the entity system collects:
//  - base fields come from baseFieldDefinitions() in code
//  - configurable fields come from field.storage.*.yml config
$fields = [
  ['name' => 'title',         'type' => 'string',           'source' => 'base',   'settings' => ['max_length' => 255]],
  ['name' => 'field_subtitle','type' => 'string',           'source' => 'config', 'settings' => ['max_length' => 128]],
  ['name' => 'field_author',  'type' => 'entity_reference', 'source' => 'config', 'settings' => []],
];

// The field system provisions columns — you never write this SQL by hand.
echo "CREATE TABLE node_field_data (\\n";
$lines = [];
foreach ($fields as $f) {
  $decl = $fieldTypes[$f['type']]($f['settings']);
  $lines[] = "  {$f['name']} {$decl}";
}
echo implode(",\\n", $lines) . "\\n);\\n\\n";

// Report where each field came from — the workflow divergence.
foreach ($fields as $f) {
  $how = $f['source'] === 'base'
    ? 'code: baseFieldDefinitions()'
    : 'UI -> config, applied via drush config:import';
  echo str_pad($f['name'], 16) . " [{$f['type']}] <- {$how}\\n";
}`,
    output: `CREATE TABLE node_field_data (
  title VARCHAR(255),
  field_subtitle VARCHAR(128),
  field_author INT UNSIGNED
);

title            [string] <- code: baseFieldDefinitions()
field_subtitle   [string] <- UI -> config, applied via drush config:import
field_author     [entity_reference] <- UI -> config, applied via drush config:import`,
  },

  keyPoints: [
    "Base fields are declared in code via \`baseFieldDefinitions()\` returning \`BaseFieldDefinition\` objects — the closest analogue to a Doctrine-mapped property.",
    "Most fields are **configurable fields** added by site admins in the UI and stored as two config entities (\`field.storage.*\` + \`field.field.*.*\`), not in code.",
    "There is no hand-written schema migration: the field system provisions and alters columns from field definitions and config; you never write \`ALTER TABLE\`.",
    "Deploying a content-model change is a **config import** (\`drush config:import\`), not running a migration class.",
    "Field types (\`string\`, \`entity_reference\`, \`datetime\`, …) are **plugins**; D10.2+/11 can declare them with the \`#[FieldType]\` attribute, older code with the \`@FieldType\` annotation.",
    "Base-field changes made after install are applied via a \`hook_update_N\` + the entity definition update manager, then \`drush updatedb\`.",
  ],

  interview: [
    {
      q: "A Doctrine schema change is a migration. What is the Drupal equivalent, and why is it different?",
      a: "It depends which of Drupal's two field tracks you mean. **Base fields** are defined in code in \`baseFieldDefinitions()\`; changing one after install is applied through a \`hook_update_N\` that calls the entity definition update manager, then \`drush updatedb\` — conceptually like a migration but the entity system derives the DDL. **Configurable fields**, which are the common case, are added in the admin UI and stored as *config entities* (\`field.storage.*\` and \`field.field.*\`), so deploying them is a \`drush config:import\`, not a migration. In neither case do you hand-write SQL — the field system provisions the columns from the field definitions.",
    },
    {
      q: "Where does a field added through the Drupal admin UI actually live, and how does it move between environments?",
      a: "It lives as two config entities exported to YAML: \`field.storage.<entity>.<field_name>.yml\` (the storage — type and cardinality, shared across bundles) and \`field.field.<entity>.<bundle>.<field_name>.yml\` (the per-bundle instance — label, required, default). You export with \`drush config:export\`, commit the YAML, and apply it elsewhere with \`drush config:import\`. That is the Drupal deployment story for content-model changes: config, not migration classes.",
    },
    {
      q: "How do Drupal field types compare to Doctrine types?",
      a: "Both let you go beyond primitive columns, but Drupal field types are far richer. A Doctrine custom \`Type\` mostly maps a PHP value to one SQL declaration and is registered in \`doctrine.yaml\`. A Drupal field type is a **plugin** (\`FieldItemBase\` subclass) that is auto-discovered, can store multiple properties, declares its own \`schema()\`, and ships a default widget and formatter for forms and display. In Drupal 10.2 and 11 you declare it with a \`#[FieldType(...)]\` attribute; older code uses the \`@FieldType\` annotation. Because they are plugins, contrib modules add new field types exactly the way core does.",
    },
  ],

  quiz: [
    {
      question:
        "A site builder adds a 'Subtitle' field to the Article content type through the admin UI. Where is that field stored?",
      options: [
        "As a new property on the Node entity class in a custom module",
        "As two config entities: a field.storage.* and a field.field.*.* YAML",
        "As a Doctrine migration file under migrations/",
        "As a row hand-inserted into the node_field_data table",
      ],
      answerIndex: 1,
      explain:
        "UI-added (configurable) fields are config entities: the shared storage (field.storage.node.field_subtitle) plus the per-bundle instance (field.field.node.article.field_subtitle). The field system provisions the columns from that config.",
    },
    {
      question:
        "Which fields are defined in code via baseFieldDefinitions() rather than in the UI?",
      options: [
        "Every field on every entity, always",
        "Only fields added by contrib modules",
        "Base fields — the ones intrinsic to the entity type, like a node's title, uid, and created",
        "None; all Drupal fields are config",
      ],
      answerIndex: 2,
      explain:
        "Base fields are intrinsic to the entity type and declared in code with baseFieldDefinitions(). Configurable (bundle) fields are the ones added through the UI and stored as config.",
    },
    {
      question:
        "How is a content-model change (a new configurable field) typically deployed to production in Drupal?",
      options: [
        "Run doctrine:migrations:migrate",
        "Hand-write and run an ALTER TABLE statement",
        "Export the field config and run drush config:import on production",
        "Edit baseFieldDefinitions() and run drush updatedb",
      ],
      answerIndex: 2,
      explain:
        "Configurable fields are config, so you export the YAML (drush config:export), commit it, and apply it with drush config:import. drush updatedb is for code-defined base-field/schema changes, not UI-added fields.",
    },
  ],
};

export default lesson;
