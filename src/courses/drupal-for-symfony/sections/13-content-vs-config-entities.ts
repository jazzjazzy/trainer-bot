import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "content-vs-config-entities",
  title: "Content Entities vs Config Entities",
  part: "Content Model & Entities",
  estMinutes: 12,
  summary:
    "Drupal splits its data model into content entities (per-site data in the DB, revisionable and fieldable) and config entities (site configuration exported to YAML and deployed) — a distinction Symfony's Doctrine has no equivalent for.",

  concept: `
In Symfony you have one storage story: **Doctrine entities** are rows in the
database, and **config** is a separate world of parameters, \`services.yaml\`, and
\`.env\` values you deploy with the code. There is no framework-level idea that an
"entity" might itself *be* configuration.

Drupal draws exactly that line. Every entity type belongs to one of **two
families**, and picking the right one is the single most important modelling
decision you make.

### Content entities — the editor's data

Content entities are the per-site data your editors create: **nodes** (articles,
pages), **users**, **taxonomy terms**, **comments**, **media**, and any custom
type you build. Think of them as Doctrine entities on steroids:

- They live in **database tables** and are **unique per environment** — your
  production articles are not your local articles.
- They are **fieldable**: base fields are declared in code (like Doctrine
  columns), but site builders can attach more fields through the UI.
- They can be **revisionable** and **translatable** out of the box.
- They implement \`ContentEntityInterface\` and usually extend
  \`ContentEntityBase\`.

### Config entities — structure, not data

Config entities describe **how the site is put together**: the **node type**
"Article" itself, **views**, **image styles**, **user roles**, **fields'
definitions**, **menus**. In Symfony these things would be YAML/PHP config in your
repo. In Drupal they are entities too — but their storage is the **config
system**, exported to \`.yml\` files under a config sync directory and deployed
with \`drush config:export\` / \`config:import\`.

- They are **not fieldable** and **not revisionable**.
- Their exportable properties are declared explicitly via \`config_export\`.
- They implement \`ConfigEntityInterface\` and extend \`ConfigEntityBase\`.

### The relationship

The two families interlock: a config entity is usually the **bundle** (type) for
content. \`node.type.article\` is a config entity; the article *you* wrote is a
content entity of bundle \`article\`. Migrating the type between environments is a
config deploy; the content is data you never commit.

### Declaring them

An entity type is declared with an **attribute** (Drupal 11 / 10.3+) or the older
**annotation** on the class — the class's docblock-or-attribute *is* the plugin
definition, discovered by the entity type manager, much like a Symfony attribute
route is discovered by the router. The rule of thumb: if a value differs between
prod and your laptop, it's a **content** entity; if it should be identical
everywhere and travel in git, it's a **config** entity.
`,

  comparisons: [
    {
      label: "The mental split",
      intro:
        "Where does a given piece of state live? Symfony has one entity concept plus separate config files; Drupal forces you to classify every entity type up front.",
      php: `// Symfony — one storage model
#[ORM\\Entity]
class Article
{
    #[ORM\\Id, ORM\\GeneratedValue, ORM\\Column]
    private int $id;
    // ... rows in the DB, per environment
}

// "Configuration" is a wholly separate world:
//   config/packages/*.yaml, services.yaml, .env
//   -> deployed with the code, no "entity" involved`,
      ts: `// Drupal — the split is explicit
// Article you wrote  = CONTENT entity  (node, in the DB, per-site)
// The "Article" type = CONFIG entity   (node.type.article.yml, in git)
//
// Both are "entities" and both go through the entity type
// manager, but their STORAGE differs: database rows vs the
// config system exported to YAML.`,
      note:
        "Symfony has no notion of an entity that is itself configuration; Drupal makes 'is this data or structure?' a first-class typing decision.",
    },
    {
      label: "Declaring a content entity",
      intro:
        "A custom content entity type: rows in the database, fieldable and revisionable. Note base_table/entity_keys and the ContentEntityBase parent.",
      php: `<?php
// Symfony / Doctrine — closest analogue
namespace App\\Entity;

use Doctrine\\ORM\\Mapping as ORM;

#[ORM\\Entity]
#[ORM\\Table(name: 'product')]
class Product
{
    #[ORM\\Id, ORM\\GeneratedValue]
    #[ORM\\Column]
    private int $id;

    #[ORM\\Column(length: 255)]
    private string $title;
}`,
      ts: `<?php
// Drupal — a CONTENT entity type
namespace Drupal\\shop\\Entity;

use Drupal\\Core\\Entity\\Attribute\\ContentEntityType;
use Drupal\\Core\\Entity\\ContentEntityBase;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup as T;

#[ContentEntityType(
  id: 'product',
  label: new T('Product'),
  base_table: 'product',
  revision_table: 'product_revision',
  entity_keys: [
    'id' => 'id',
    'uuid' => 'uuid',
    'label' => 'title',
    'revision' => 'revision_id',
  ],
)]
class Product extends ContentEntityBase {}`,
      note:
        "ContentEntityBase + base_table means DB storage; entity_keys map logical roles (id, label, revision) to columns. Fields are added via baseFieldDefinitions(), not shown.",
    },
    {
      label: "Declaring a config entity",
      intro:
        "A config entity type: no DB table, no revisions. Its data is exported to YAML. config_prefix names the file and config_export lists the properties that get written.",
      php: `<?php
// Symfony — this would just be config, not an entity
// config/packages/shop.yaml
shop:
    product_types:
        book:
            label: 'Book'
            weight: 0
// read via a bound parameter object / ParameterBag
`,
      ts: `<?php
// Drupal — a CONFIG entity type
namespace Drupal\\shop\\Entity;

use Drupal\\Core\\Config\\Entity\\ConfigEntityBase;
use Drupal\\Core\\Entity\\Attribute\\ConfigEntityType;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup as T;

#[ConfigEntityType(
  id: 'product_type',
  label: new T('Product type'),
  config_prefix: 'type',
  entity_keys: ['id' => 'id', 'label' => 'label'],
  config_export: ['id', 'label', 'weight'],
)]
class ProductType extends ConfigEntityBase {
  public string $id;
  public string $label;
  public int $weight = 0;
}`,
      note:
        "ConfigEntityBase means no DB table and no revisions; config_export lists exactly which properties are serialised into shop.type.book.yml (provider.config_prefix.id) for deployment.",
      leftLang: "yaml",
      rightLang: "php",
    },
    {
      label: "Moving between environments",
      intro:
        "The practical payoff of the split: structure travels through git, content does not.",
      php: `# Symfony
# Structure/config -> committed YAML, deployed with code
git add config/packages/shop.yaml

# Data -> migrations create schema; rows are per-env,
# never committed
php bin/console doctrine:migrations:migrate`,
      ts: `# Drupal
# Config entities -> exported to YAML, committed, imported
drush config:export
git add config/sync/
drush config:import   # on the target environment

# Content entities -> DB data, per-site, NOT committed
# (moved, if ever, via a migration or a DB copy)`,
      note:
        "config:import/export is Drupal's deploy pipeline for config entities; content entities are ordinary data and stay in the database like Doctrine rows.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A tiny model of the entity type manager sorting declared entity types into the two families by their base class, exactly as Drupal's group ('content' vs 'config') drives storage. Predict the output, then reveal.",
    code: `<?php
declare(strict_types=1);

// Model Drupal's two base classes.
abstract class ContentEntityBase {}
abstract class ConfigEntityBase {}

// A handful of declared entity types (id => base class),
// like plugin definitions the entity type manager collects.
$definitions = [
    'node'         => ContentEntityBase::class,  // articles you write
    'user'         => ContentEntityBase::class,
    'node_type'    => ConfigEntityBase::class,   // the "Article" type
    'view'         => ConfigEntityBase::class,
    'image_style'  => ConfigEntityBase::class,
    'taxonomy_term'=> ContentEntityBase::class,
    'user_role'    => ConfigEntityBase::class,
];

function groupFor(string $baseClass): string {
    return is_a($baseClass, ContentEntityBase::class, true)
        ? 'content'   // DB storage, per-site, fieldable
        : 'config';   // YAML export, deployed in git
}

$buckets = ['content' => [], 'config' => []];
foreach ($definitions as $id => $base) {
    $buckets[groupFor($base)][] = $id;
}

foreach ($buckets as $group => $ids) {
    sort($ids);
    echo strtoupper($group) . ': ' . implode(', ', $ids) . "\\n";
}

echo "\\nDeploy config entities? " .
    (count($buckets['config']) > 0 ? 'yes -> drush config:export' : 'no') . "\\n";`,
    output: `CONTENT: node, taxonomy_term, user
CONFIG: image_style, node_type, user_role, view

Deploy config entities? yes -> drush config:export`,
  },

  keyPoints: [
    "Drupal splits entities into two families; Symfony/Doctrine has no equivalent split — everything is a Doctrine entity or plain config.",
    "**Content entities** (node, user, term, comment, media, custom) are DB rows: per-site data, fieldable, often revisionable/translatable — `ContentEntityBase` / `ContentEntityInterface`.",
    "**Config entities** (node type, view, image style, role, field definition) are site structure: exported to YAML and deployed — `ConfigEntityBase` / `ConfigEntityInterface`, with `config_export` listing saved properties.",
    "They interlock: a config entity is usually the **bundle** (type) of a content entity — `node.type.article` (config) vs an actual article (content).",
    "Rule of thumb: if a value differs between prod and your laptop it's **content**; if it should be identical everywhere and travel in git it's **config**.",
    "Entity types are declared with a `#[ContentEntityType]` / `#[ConfigEntityType]` attribute (Drupal 11 / 10.3+) or the older annotation — both still supported.",
  ],

  interview: [
    {
      q: "Explain the difference between a content entity and a config entity to someone coming from Symfony.",
      a: "In Symfony a Doctrine entity is always DB data and configuration is a separate, file-based world. Drupal fuses those ideas: *both* content and config are 'entities' that flow through the entity type manager, but they store differently. A **content entity** (node, user, term, custom) is per-site DB data — fieldable, often revisionable, extending `ContentEntityBase`. A **config entity** (node type, view, image style, role) describes site structure, has no DB table or revisions, and is exported to YAML for deployment via `drush config:export`/`config:import`, extending `ConfigEntityBase`. The test is portability: content differs per environment, config is identical everywhere and lives in git.",
    },
    {
      q: "How are the two families related in practice?",
      a: "They interlock through **bundles**. A config entity typically defines the *type* of a content entity: `node.type.article` is a config entity, while the article you actually wrote is a content entity of bundle `article`. So deploying a new content type is a config change you commit and import, whereas the articles editors create are data you never commit. This is why you can push a new 'Event' content type through git without touching anyone's actual events.",
    },
    {
      q: "How do you declare a custom entity type, and how does that compare to a Doctrine entity?",
      a: "You put a `#[ContentEntityType(...)]` or `#[ConfigEntityType(...)]` attribute (or the older annotation) on a class extending `ContentEntityBase` / `ConfigEntityBase`. The attribute *is* the plugin definition — discovered by the entity type manager much like Symfony's attribute routes are discovered by the router. For content you set `base_table`, `entity_keys`, optionally `revision_table`, and declare base fields in `baseFieldDefinitions()`; for config you set `config_prefix` and `config_export` to list which properties get serialised to YAML. Compared to Doctrine, Drupal generates and manages the schema for you rather than you writing migrations, and adds a UI-driven field layer on top of the code-defined base fields.",
    },
  ],

  quiz: [
    {
      question: "Which of these is a CONFIG entity, not a content entity?",
      options: ["A taxonomy term", "An image style", "A comment", "A user account"],
      answerIndex: 1,
      explain:
        "Image styles describe site structure and are exported to YAML and deployed — a config entity. Terms, comments, and users are per-site data stored in the database — content entities.",
    },
    {
      question:
        "You add a new 'Event' content type in the admin UI. What must happen for it to reach production the Drupal way?",
      options: [
        "Nothing — content types live in the database and replicate automatically",
        "Run a Doctrine migration to create the table",
        "Export it with drush config:export, commit the YAML, and config:import on prod",
        "Copy the production database down to your laptop",
      ],
      answerIndex: 2,
      explain:
        "A content *type* is a config entity (node.type.event). It travels as exported YAML through git and is applied with drush config:import — the config deployment pipeline, not a DB copy or a migration.",
    },
    {
      question:
        "In a config entity declaration, what does the config_export key control?",
      options: [
        "Which database columns are indexed",
        "Which properties are serialised into the entity's YAML file",
        "Whether the entity is revisionable",
        "The list of fields site builders can attach in the UI",
      ],
      answerIndex: 1,
      explain:
        "config_export lists exactly the properties written to the config entity's YAML (e.g. id, label, weight). Config entities are not revisionable and not fieldable, so the other options don't apply.",
    },
  ],
};

export default lesson;
