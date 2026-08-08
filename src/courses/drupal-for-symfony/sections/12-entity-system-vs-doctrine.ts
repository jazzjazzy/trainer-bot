import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "entity-system-vs-doctrine",
  title: "The Entity System vs Doctrine ORM",
  part: "Content Model & Entities",
  estMinutes: 13,

  summary:
    "Drupal has no Doctrine, no DQL, and no migrations file — entities are defined by a plugin and stored by the entity system, which you reach through EntityTypeManager instead of Doctrine's EntityManager.",

  concept: `
This is the single biggest divergence from Symfony. In Symfony you reach for
**Doctrine**: you hand-write a PHP entity class, map it to a table with
attributes (formerly annotations), generate a migration, and query it with the
repository API or **DQL**. Nothing in Drupal works that way.

### Doctrine's model vs Drupal's model

In Doctrine the **class is the source of truth**. The schema is derived from your
mapping, and \`doctrine:migrations\` keeps the database in step with the code.

In Drupal an entity type is a **plugin**. The class only declares metadata (its
storage handler, its base table, its keys); the **entity system** owns the
schema and creates/updates tables for you when the module installs. There is no
migrations workflow to run — \`drush entity:updates\` was even removed because
schema changes are handled through the update system, not a diff against your
classes.

### EntityTypeManager, not EntityManager

Symfony injects \`EntityManagerInterface\` and calls
\`\$em->getRepository(Node::class)\`. Drupal injects
**\`entity_type.manager\`** (\`EntityTypeManagerInterface\`) and asks it for a
**storage handler** by the entity type's *string id*:

\`\`\`php
\$storage = \$this->entityTypeManager->getStorage('node');
\$node = \$storage->load(1);
\`\`\`

Note the string \`'node'\` — Drupal identifies entity types by a machine name, not
a PHP class, because a type's class can be swapped by other modules.

### Two flavours: content vs config

Doctrine has one kind of entity. Drupal has two:

- **Content entities** (\`node\`, \`user\`, \`taxonomy_term\`, \`media\`) hold user
  data in the database and are **fieldable**.
- **Config entities** (a content type, a view, an image style) hold site
  configuration and are exported to YAML — closer to Symfony *config* than to a
  Doctrine entity.

### Fieldable: the part with no Doctrine analogue

A Doctrine entity's columns are fixed in code. A Drupal content entity has
**base fields** defined in code (via \`baseFieldDefinitions()\`) *plus* fields a
site admin adds through the UI — stored as configuration and attached at
runtime. So the \`Node\` class never lists \`field_subtitle\`; an admin added it,
and it lives in its own table. This is why you almost never subclass an entity to
add data — you attach a field instead.

### Querying: entityQuery, not DQL

There is no DQL. You build a query object and get back **entity IDs**, then load
the entities:

\`\`\`php
\$ids = \$storage->getQuery()
  ->accessCheck(TRUE)
  ->condition('type', 'article')
  ->condition('status', 1)
  ->execute();
\$nodes = \$storage->loadMultiple(\$ids);
\`\`\`

The following sections drill into base fields, bundles, and entityQuery. For now:
**class = truth in Doctrine; plugin + entity system = truth in Drupal.**
`,

  comparisons: [
    {
      label: "Getting to your data layer",
      intro:
        "You want to load one record by its primary key. In Symfony you go through Doctrine's EntityManager/repository; in Drupal you go through EntityTypeManager to a storage handler named by a string.",
      php: `<?php
// Symfony — Doctrine EntityManager + repository, typed by class
public function __construct(
    private EntityManagerInterface $em,
) {}

public function show(int $id): Response
{
    $article = $this->em
        ->getRepository(Article::class)
        ->find($id);
    // ...
}`,
      ts: `<?php
// Drupal — EntityTypeManager -> storage handler, keyed by string id
public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
) {}

public function show(int $id): array {
    $node = $this->entityTypeManager
        ->getStorage('node')   // 'node', not Node::class
        ->load($id);
    // ...
}`,
      note:
        "Drupal identifies an entity type by machine name ('node') because its class can be overridden by other modules; Doctrine keys off the concrete class.",
    },
    {
      label: "Defining the entity",
      intro:
        "Declaring a new entity type. In Symfony the class maps directly to columns; in Drupal the plugin only declares metadata and the entity system builds the schema.",
      php: `<?php
// Symfony — attributes ARE the table mapping (columns live here)
#[ORM\\Entity(repositoryClass: ArticleRepository::class)]
#[ORM\\Table(name: 'article')]
class Article
{
    #[ORM\\Id]
    #[ORM\\GeneratedValue]
    #[ORM\\Column]
    private ?int $id = null;

    #[ORM\\Column(length: 255)]
    private string $title;
}`,
      ts: `<?php
// Drupal 11 — a plugin declaring metadata; NO columns here
#[ContentEntityType(
    id: 'product',
    label: new TranslatableMarkup('Product'),
    base_table: 'product',
    entity_keys: ['id' => 'id', 'uuid' => 'uuid', 'label' => 'title'],
    handlers: ['storage' => SqlContentEntityStorage::class],
)]
class Product extends ContentEntityBase {
    public static function baseFieldDefinitions(
        EntityTypeInterface $entity_type,
    ): array {
        $fields = parent::baseFieldDefinitions($entity_type);
        $fields['title'] = BaseFieldDefinition::create('string')
            ->setLabel(t('Title'));
        return $fields;   // entity system builds the table from these
    }
}`,
      note:
        "PHP attribute-based entity types (#[ContentEntityType]) arrived in Drupal 11; older code (and much of D10) uses an @ContentEntityType annotation docblock. (Generic plugin attributes came in 10.2, but entity types are a special plugin type whose attribute support landed in 11.0.) Either way the schema is generated, not migrated.",
    },
    {
      label: "Querying",
      intro:
        "Fetch published articles. Symfony uses DQL or the query builder and returns hydrated objects; Drupal's entityQuery returns IDs you then load.",
      php: `<?php
// Symfony — DQL / query builder, returns Article objects
$articles = $this->em->createQuery(
    'SELECT a FROM App\\Entity\\Article a
     WHERE a.status = :s'
)->setParameter('s', true)
 ->getResult();`,
      ts: `<?php
// Drupal — entityQuery returns IDs; loadMultiple() hydrates
$storage = $this->entityTypeManager->getStorage('node');
$ids = $storage->getQuery()
    ->accessCheck(TRUE)        // required: opt in/out explicitly
    ->condition('type', 'article')
    ->condition('status', 1)
    ->execute();
$nodes = $storage->loadMultiple($ids);`,
      note:
        "There is no DQL. entityQuery is field-aware (it can query admin-added fields) and since Drupal 9 accessCheck(TRUE|FALSE) is mandatory — omitting it throws.",
    },
    {
      label: "Keeping schema in sync",
      intro:
        "You changed the data model and need the database to match. Symfony diffs your classes and writes a migration; Drupal has no such step for its own schema.",
      php: `<?php
// Symfony — generate + run a migration from the class changes
// $ php bin/console doctrine:migrations:diff
// $ php bin/console doctrine:migrations:migrate`,
      ts: `<?php
// Drupal — no migration diff for entities. The entity/update system
// applies schema changes; you import config and run updates:
//   $ drush updatedb        # runs hook_update_N / entity updates
//   $ drush config:import   # applies exported YAML config
//   $ drush cache:rebuild`,
      note:
        "Doctrine migrations are a versioned diff of your PHP classes; Drupal's schema is owned by the entity system and changed via update hooks + config, not a diff.",
      leftLang: "php",
      rightLang: "php",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A tiny model of the entity system: a manager hands back a storage handler keyed by a STRING id (not a class), and entityQuery builds a conditions list that yields IDs you then load. Predict the output, then reveal it.",
    code: `<?php
// --- model of Drupal's storage handler + entityQuery ---
class Storage {
    public function __construct(private array $rows) {}

    // getQuery() returns a builder; execute() returns matching IDs.
    public function getQuery(): Query {
        return new Query($this->rows);
    }
    public function loadMultiple(array $ids): array {
        return array_map(fn($id) => $this->rows[$id], $ids);
    }
}

class Query {
    private array $conds = [];
    private bool $access = false;
    public function __construct(private array $rows) {}
    public function accessCheck(bool $on): static { $this->access = $on; return $this; }
    public function condition(string $field, $value): static {
        $this->conds[$field] = $value; return $this;
    }
    public function execute(): array {
        $ids = [];
        foreach ($this->rows as $id => $row) {
            foreach ($this->conds as $f => $v) {
                if (($row[$f] ?? null) !== $v) { continue 2; }
            }
            $ids[] = $id;
        }
        return $ids;
    }
}

// EntityTypeManager: getStorage() keyed by a STRING, not a class.
class EntityTypeManager {
    public function __construct(private array $storages) {}
    public function getStorage(string $type): Storage {
        return $this->storages[$type];
    }
}

$etm = new EntityTypeManager([
    'node' => new Storage([
        1 => ['type' => 'article', 'status' => 1, 'title' => 'Hello'],
        2 => ['type' => 'page',    'status' => 1, 'title' => 'About'],
        3 => ['type' => 'article', 'status' => 0, 'title' => 'Draft'],
    ]),
]);

$storage = $etm->getStorage('node');       // string id
$ids = $storage->getQuery()
    ->accessCheck(true)
    ->condition('type', 'article')
    ->condition('status', 1)
    ->execute();                            // -> IDs, not objects

echo 'ids: ' . implode(',', $ids) . "\\n";
foreach ($storage->loadMultiple($ids) as $node) {
    echo '- ' . $node['title'] . "\\n";
}`,
    output: `ids: 1
- Hello`,
  },

  keyPoints: [
    "Drupal has **no Doctrine, no DQL, and no migrations diff** — the entity system owns the schema and generates tables on module install.",
    "You inject **`entity_type.manager`** (`EntityTypeManagerInterface`) and call `getStorage('node')` — keyed by a **string machine name**, not `Node::class`.",
    "An entity type is a **plugin** (`#[ContentEntityType]` in D11+, or an `@ContentEntityType` annotation before that); the class declares metadata, not columns.",
    "Two flavours: **content entities** (DB data, fieldable) and **config entities** (exported to YAML, closer to Symfony config).",
    "Content entities are **fieldable**: base fields in code plus admin-added fields as config — no subclassing to add data.",
    "**entityQuery** returns entity **IDs** (then `loadMultiple()`), and `accessCheck(TRUE|FALSE)` is **mandatory** since Drupal 9.",
  ],

  interview: [
    {
      q: "A Symfony developer asks where Doctrine fits in Drupal. What do you tell them?",
      a: "It doesn't — Drupal ships its own **entity system** and doesn't use Doctrine at all. Instead of `EntityManagerInterface` you inject `entity_type.manager` and call `getStorage('node')` to get a storage handler keyed by a string machine name. There's no DQL (you use `entityQuery`, which returns IDs) and no `doctrine:migrations` (the entity system generates and updates the schema itself). The mental shift is that a Doctrine entity's class is the source of truth for its columns, whereas a Drupal entity type is a **plugin** whose class only declares metadata while fields live partly in code and partly in admin-managed config.",
    },
    {
      q: "What does it mean that Drupal content entities are 'fieldable', and why does that matter coming from Doctrine?",
      a: "A Doctrine entity's columns are fixed in the mapped class. A Drupal content entity has **base fields** defined in code via `baseFieldDefinitions()`, *plus* fields a site builder can add through the UI, which are stored as configuration and attached to the entity at runtime. So the `Node` class never mentions `field_subtitle` — an admin added it and it lives in its own table. Practically, you rarely subclass an entity to add data the way you'd add a Doctrine column; you attach a field instead, and `entityQuery` can still filter on it.",
    },
    {
      q: "How would you fetch all published articles in Drupal, and how is that different from DQL?",
      a: "Get the storage handler and build an entityQuery: `$storage->getQuery()->accessCheck(TRUE)->condition('type','article')->condition('status',1)->execute()`. That returns an array of **entity IDs**, which you hydrate with `$storage->loadMultiple($ids)`. Unlike DQL it isn't a SQL-like string and it doesn't return objects directly; it's a field-aware builder that also enforces access via the required `accessCheck()` call. Omitting `accessCheck(TRUE|FALSE)` throws since Drupal 9, which trips up people used to Doctrine returning rows with no access layer.",
    },
  ],

  quiz: [
    {
      question:
        "In Drupal, how do you obtain the object you use to load and query entities of type 'node'?",
      options: [
        "$this->em->getRepository(Node::class)",
        "$this->entityTypeManager->getStorage('node')",
        "$this->doctrine->getManager()->find('node')",
        "Node::query()->where('status', 1)",
      ],
      answerIndex: 1,
      explain:
        "Drupal injects entity_type.manager and calls getStorage() with the entity type's string machine name ('node') to get a storage handler. There is no Doctrine EntityManager or repository, and entity types are keyed by machine name rather than PHP class.",
    },
    {
      question: "What does a Drupal entityQuery's execute() return?",
      options: [
        "Fully hydrated entity objects",
        "An array of entity IDs",
        "A DQL result set",
        "A PDOStatement you iterate",
      ],
      answerIndex: 1,
      explain:
        "entityQuery returns an array of entity IDs. You then pass those IDs to loadMultiple() (or load()) on the storage handler to get the actual entity objects — unlike Doctrine's DQL, which returns hydrated objects directly.",
    },
    {
      question:
        "How does Drupal keep the database schema in sync with an entity type's definition, compared to Symfony/Doctrine?",
      options: [
        "You run doctrine:migrations:diff then :migrate, same as Symfony",
        "The entity system owns and generates the schema; changes go through update hooks and config, with no migration diff",
        "You hand-write CREATE TABLE SQL in the module's install file every time",
        "Drupal regenerates every table from scratch on each cache rebuild",
      ],
      answerIndex: 1,
      explain:
        "In Drupal the entity system generates the schema from the entity/field definitions when a module installs, and later changes are applied via hook_update_N / entity updates and config import — there is no Doctrine-style migration diff of your PHP classes.",
    },
  ],
};

export default lesson;
