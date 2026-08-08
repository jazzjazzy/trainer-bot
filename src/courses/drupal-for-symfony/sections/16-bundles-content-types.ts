import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "bundles-content-types",
  title: "Bundles: Content Types Defined by Admins",
  part: "Content Model & Entities",
  estMinutes: 12,
  summary:
    "In Drupal a 'bundle' is a subtype of a content entity — e.g. the node entity has Article and Page bundles, each with its own fields — usually created by admins in the UI, not by writing a PHP subclass, and the word collides confusingly with Symfony's 'bundle'.",

  concept: `
### First: the word "bundle" means two different things

Stop and reset your vocabulary. In **Symfony**, a *bundle* is a reusable package
of code you register in \`bundles.php\` — the framework's plugin/package unit
(FrameworkBundle, DoctrineBundle, your AppBundle in the old days). In **Drupal**
that role is played by a **module**, which you already met earlier in this course.

In **Drupal**, *bundle* means something completely unrelated: **a subtype of a
content entity type**. The \`node\` entity type ships with bundles like **Article**
and **Page**; the \`taxonomy_term\` entity type has bundles called
**vocabularies**; \`media\` has bundles like **Image** and **Video**. Same
storage, same PHP class — different subtype, different fields. Do not let the
shared spelling fool you.

### One class, many subtypes — the mental flip

Coming from Symfony/Doctrine, your instinct is **one PHP class per type**:
\`Article extends Node\`, \`Page extends Node\`, each mapped to its own table with
its own properties. Drupal does **not** work that way.

There is **one** \`Drupal\\node\\Entity\\Node\` class, and it serves *every* node
bundle. An Article and a Page are both \`Node\` objects at runtime. What differs is:

- the **bundle** value stored on the entity (\`$node->bundle()\` returns \`article\`),
- the **fields** attached to that bundle (Article has \`field_tags\`, Page does not),
- **behaviour** you switch on the bundle in hooks and services.

So behaviour is driven by **data + configuration**, not by subclassing. This is
the single biggest adjustment for a Symfony developer.

### A bundle is (usually) a config entity built in the UI

You met content vs config entities already. A bundle definition — the "Article
type" itself — is a **config entity**: \`node.type.article\` exported to
\`node.type.article.yml\` and deployed through \`drush config:export\`. Site
builders create bundles by clicking through **Admin → Structure → Content types →
Add content type**, then attaching fields through the Field UI. No PHP class, no
Doctrine migration, no deploy of code — just config that travels in git.

The entity type declares that it *has* bundles by pointing at its bundle config
entity:

- The content entity sets \`entity_keys['bundle'] => 'type'\` and
  \`bundle_entity_type => 'node_type'\`.
- The config entity (\`NodeType\`) sets \`bundle_of => 'node'\`.

### Querying and targeting a bundle

Because there is one class, you filter by the bundle field. An \`entityQuery\` on
nodes narrows to a bundle with \`->condition('type', 'article')\` — \`type\` being
node's bundle key. Bundle-specific fields are added per bundle, so
\`baseFieldDefinitions()\` gives fields common to *all* bundles, while
\`bundleFieldDefinitions()\` (or the Field UI) adds fields to *one* bundle.
`,

  comparisons: [
    {
      label: "The word collision",
      intro:
        "Same five letters, opposite meanings. Map the Symfony concept onto the right Drupal concept before anything else.",
      php: `// Symfony: a "bundle" = a reusable code package
// config/bundles.php
return [
    Symfony\\Bundle\\FrameworkBundle\\FrameworkBundle::class => ['all' => true],
    Doctrine\\Bundle\\DoctrineBundle\\DoctrineBundle::class  => ['all' => true],
    App\\AppBundle::class                                    => ['all' => true],
];
// -> the framework's package/plugin unit`,
      ts: `// Drupal: a "bundle" = a SUBTYPE of a content entity
//   node    -> bundles: article, page
//   media   -> bundles: image, video
//   taxonomy_term -> bundles: tags, categories
//
// The Symfony "bundle" (a package) maps to a Drupal MODULE,
// NOT to a Drupal bundle. Different word, different layer.`,
      note:
        "Symfony bundle == Drupal MODULE (a package). Drupal bundle == an entity subtype. Never translate the word literally.",
    },
    {
      label: "One class per type vs one class, many bundles",
      intro:
        "Your Doctrine instinct is a class hierarchy. Drupal keeps a single class and distinguishes subtypes by a stored bundle value plus attached fields.",
      php: `<?php
// Symfony / Doctrine — one class per subtype
#[ORM\\Entity]
#[ORM\\InheritanceType('JOINED')]
#[ORM\\DiscriminatorColumn(name: 'kind', type: 'string')]
#[ORM\\DiscriminatorMap(['article' => Article::class, 'page' => Page::class])]
abstract class Content {}

#[ORM\\Entity]
class Article extends Content
{
    #[ORM\\Column(type: 'json')]
    private array $tags = [];   // field lives on the subclass
}

#[ORM\\Entity]
class Page extends Content {}   // different class, different table`,
      ts: `<?php
// Drupal — ONE class serves every node bundle
use Drupal\\node\\Entity\\Node;

$article = Node::create(['type' => 'article', 'title' => 'Hello']);
$page    = Node::create(['type' => 'page',    'title' => 'About']);

// Both are the SAME class:
get_class($article);   // Drupal\\node\\Entity\\Node
get_class($page);      // Drupal\\node\\Entity\\Node

$article->bundle();    // 'article'  <- subtype is DATA, not a class
$article->set('field_tags', ['drupal', 'symfony']);  // field on the bundle`,
      note:
        "No Article/Page subclass. The bundle is a value ($node->bundle()); fields are attached to the bundle via config, not declared on a PHP subclass.",
    },
    {
      label: "Defining the subtype: PHP class vs UI/config",
      intro:
        "Where the subtype is defined differs sharply. Symfony devs write a class and migrate; Drupal admins click through the UI and the result is exported YAML.",
      php: `# Symfony — a developer writes code + a migration
# 1. create src/Entity/Article.php (a PHP class)
# 2. generate + run the schema migration
php bin/console make:entity Article
php bin/console make:migration
php bin/console doctrine:migrations:migrate
# The new subtype only exists once code is deployed.`,
      ts: `# Drupal — a site builder creates it in the browser, no code
# Admin -> Structure -> Content types -> Add content type
#   Name: Event   (machine name: event)
#   Add fields via the Field UI: field_date, field_location
#
# Result is a CONFIG entity, exported as YAML and committed:
drush config:export
git add config/sync/node.type.event.yml \\
        config/sync/field.field.node.event.field_date.yml
drush config:import   # applied on production`,
      note:
        "A new bundle needs no PHP class and no schema migration. It is configuration (node.type.event) that deploys through config:export/import.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "The bundle config entity it exports to",
      intro:
        "The 'Event' type is itself an entity — a NodeType config entity. This is the YAML that clicking 'Add content type' produces.",
      php: `# Symfony — no equivalent 'type entity'.
# The nearest thing is the class + Doctrine metadata, plus maybe
# a hand-written config/packages/*.yaml if you externalise options.
# There is no framework object that IS 'the Article type'.`,
      ts: `# Drupal — config/sync/node.type.event.yml
langcode: en
status: true
dependencies: {  }
name: Event
type: event
description: 'A dated happening.'
help: ''
new_revision: true
preview_mode: 1
display_submitted: true
# node's content entity type declares it has bundles via:
#   entity_keys: { bundle: type }
#   bundle_entity_type: node_type
# and NodeType (the config entity) declares:  bundle_of: node`,
      note:
        "The bundle IS a config entity (node.type.event). node's entity type points at it with bundle_entity_type: node_type; NodeType points back with bundle_of: node.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A tiny model of the flip: one entity class, and behaviour selected by the stored bundle value plus per-bundle field config — exactly how Drupal treats Article vs Page. Predict the output, then reveal.",
    code: `<?php
declare(strict_types=1);

// ONE class serves every bundle — like Drupal\\node\\Entity\\Node.
final class Node {
    public function __construct(
        public string $bundle,          // 'article' | 'page' ...
        public array  $values = [],     // field values
    ) {}
    public function bundle(): string { return $this->bundle; }
}

// Bundle definitions live in CONFIG, not in subclasses.
// Each bundle lists the fields attached to it via the Field UI.
$bundleFields = [
    'article' => ['field_tags', 'field_image'],
    'page'    => ['field_summary'],
];

// Two nodes, same class, different subtype.
$nodes = [
    new Node('article', ['field_tags' => ['drupal', 'symfony']]),
    new Node('page',    ['field_summary' => 'About us']),
];

foreach ($nodes as $node) {
    $class  = $node::class;               // identical for both
    $fields = $bundleFields[$node->bundle()] ?? [];
    echo $node->bundle() . ' is a ' . $class
       . ' with fields: ' . implode(', ', $fields) . "\\n";
}

// entityQuery-style narrowing to one bundle: filter by the bundle value.
$articles = array_filter($nodes, fn(Node $n) => $n->bundle() === 'article');
echo "\\nquery(type = article) -> " . count($articles) . " match\\n";`,
    output: `article is a Node with fields: field_tags, field_image
page is a Node with fields: field_summary

query(type = article) -> 1 match`,
  },

  keyPoints: [
    "**Naming collision:** a Symfony *bundle* is a code package (== a Drupal **module**); a Drupal *bundle* is a **subtype of a content entity** (Article/Page are bundles of node).",
    "There is **one** PHP class per content entity type (`Drupal\\node\\Entity\\Node` serves all node bundles) — the subtype is a stored value (`$node->bundle()`), not a subclass.",
    "Behaviour differs by **bundle + attached fields + hooks**, not by class inheritance — the opposite of Doctrine's one-class-per-type instinct.",
    "A bundle is usually a **config entity** (e.g. `node.type.article`) created by admins in the UI and deployed via `drush config:export`/`config:import` — no code, no migration.",
    "The content entity type declares bundles with `entity_keys['bundle']` + `bundle_entity_type`; the bundle config entity declares `bundle_of`.",
    "Filter a query to one bundle with the bundle key: `\\Drupal::entityQuery('node')->condition('type', 'article')->accessCheck(TRUE)`.",
  ],

  interview: [
    {
      q: "A Symfony developer says 'a bundle'. In a Drupal interview, what must you clarify?",
      a: "That the word means two different things. In Symfony a *bundle* is a reusable code package registered in `bundles.php` — the framework's package/plugin unit; in Drupal that role is filled by a **module**. In Drupal a *bundle* means a **subtype of a content entity**, like the Article and Page bundles of the `node` entity type, or Image and Video bundles of `media`. So a Symfony bundle maps to a Drupal module, and a Drupal bundle has no real Symfony equivalent — it's closer to a Doctrine discriminator value than to a package. Getting this mapping wrong is an instant tell that someone hasn't actually worked in Drupal.",
    },
    {
      q: "Why doesn't Drupal have an `Article` class extending a `Node` class the way Doctrine would?",
      a: "Because Drupal models subtypes as **data and configuration**, not inheritance. One `Drupal\\node\\Entity\\Node` class serves every node bundle; an Article and a Page are both `Node` instances at runtime, distinguished by the bundle value (`$node->bundle()`) and by which fields are attached to that bundle. Fields are added per bundle through the Field UI (stored as config entities), so you never subclass to add `field_tags`. You switch behaviour on the bundle inside hooks or services — e.g. `if ($node->bundle() === 'article')`. This is why site builders can create whole new content types without a developer writing or deploying a single PHP class.",
    },
    {
      q: "How is a new content type created and moved to production, and how does that differ from adding a Doctrine entity?",
      a: "A site builder creates it in the browser — Structure → Content types → Add content type — and attaches fields through the Field UI. The result is a **config entity** (`node.type.event`) plus field config, which you export with `drush config:export`, commit the YAML, and apply on the target with `drush config:import`. There is no PHP class and no schema migration: Drupal manages the storage for you. With Doctrine you'd instead write an `Event` class, generate a migration, and deploy code before the type exists. So Drupal shifts type creation from a code-and-migrate developer task to a config-driven task that can be done by non-developers and deployed as configuration.",
    },
  ],

  quiz: [
    {
      question: "In Drupal terminology, what is a 'bundle'?",
      options: [
        "A reusable package of code registered with the kernel",
        "A subtype of a content entity type, e.g. the Article bundle of node",
        "A compiled asset library of CSS and JS",
        "A group of services wired together in a *.services.yml file",
      ],
      answerIndex: 1,
      explain:
        "A Drupal bundle is a subtype of a content entity (Article/Page are bundles of node). The 'package of code' meaning is Symfony's bundle, which in Drupal is a module.",
    },
    {
      question:
        "You have Article and Page content types. At runtime, what class are an article node and a page node?",
      options: [
        "Article extends Node, and Page extends Node — two classes",
        "Both are the same class, Drupal\\node\\Entity\\Node; the bundle is a stored value",
        "Each bundle gets an auto-generated proxy class",
        "They are plain stdClass objects hydrated from the database",
      ],
      answerIndex: 1,
      explain:
        "One class (Node) serves all node bundles. The subtype is data — $node->bundle() returns 'article' or 'page' — and fields are attached per bundle via config, not via subclassing.",
    },
    {
      question:
        "A site builder adds a new 'Event' content type in the admin UI. What is required to deploy it to production?",
      options: [
        "Write an Event PHP class and run a database migration",
        "Nothing — content types replicate with the database automatically",
        "Export the config (drush config:export), commit node.type.event.yml, and config:import on prod",
        "Register Event in the module's *.services.yml file",
      ],
      answerIndex: 2,
      explain:
        "A bundle is a config entity (node.type.event). It travels as exported YAML through git and is applied with drush config:import — no PHP class and no schema migration are involved.",
    },
  ],
};

export default lesson;
