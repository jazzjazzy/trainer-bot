import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "entitytypemanager-load-save",
  title: "Loading & Saving: EntityTypeManager vs Repository",
  part: "Content Model & Entities",
  estMinutes: 12,
  summary:
    "Drupal replaces Doctrine's repository + unit-of-work with per-entity storage handlers from the EntityTypeManager, where save() is immediate and field access goes through typed field item lists instead of getters.",

  concept: `
In Symfony you reach data through Doctrine's **EntityManager**: you ask it for a
**repository**, call \`find()\`, mutate the object, then \`persist()\` and \`flush()\`.
The unit-of-work batches every change and writes them in one transaction at
\`flush()\`.

Drupal has no unit-of-work. The equivalent of a repository is a per-entity-type
**storage handler** that you get from the **entity type manager**, and
\`save()\` writes **that one entity immediately**.

### Getting a "repository": storage handlers

\`\\Drupal::entityTypeManager()->getStorage('node')\` returns the storage handler
for the \`node\` entity type — the Drupal analogue of
\`$em->getRepository(Node::class)\`. It gives you \`load()\`, \`loadMultiple()\`,
\`loadByProperties()\`, \`create()\`, \`delete()\`, and \`getQuery()\`.

- \`$storage->load(42)\` — load by id (returns \`NULL\` if missing, like
  \`find()\`).
- \`$storage->loadMultiple([1, 2, 3])\` — keyed array of entities.
- \`$storage->loadByProperties(['type' => 'article', 'status' => 1])\` — the
  closest thing to \`findBy()\`.

### Creating and saving

There is no \`persist()\` + \`flush()\`. You build an entity and call \`save()\` on
it — the write happens then and there, one entity at a time:

\`\`\`php
$node = \\Drupal\\node\\Entity\\Node::create([
  'type' => 'article',
  'title' => 'Hello',
]);
$node->save();            // INSERT happens now
$node->set('title', 'Hi');
$node->save();            // UPDATE happens now
\`\`\`

\`Node::create([...])\` is sugar over
\`$storage->create([...])\`. \`save()\` returns \`SAVED_NEW\` or \`SAVED_UPDATED\`.
Because there is no batching, saving 500 entities is 500 writes — loop and
\`save()\`, or drop to a queue/batch API for bulk work.

### Field access is not a plain getter

A Doctrine getter returns a scalar. A Drupal field is a **typed field item
list**, so you step through it:

- \`$node->get('title')->value\` or the shortcut \`$node->title->value\`.
- \`$node->set('field_price', 9.99)\`.
- Entity references: \`$node->get('field_author')->target_id\` for the raw id,
  or \`->referencedEntities()\` to load the referenced entities.
- Multi-value fields are iterable: \`foreach ($node->get('field_tags') as $item)\`.

### Injecting the manager

Reaching for the static \`\\Drupal::entityTypeManager()\` is fine in a hook or a
quick script, but in a service or controller you **inject**
\`EntityTypeManagerInterface\`. In a controller/plugin that means the
\`create()\` factory method pulling the service out of the container — the same
constructor-injection idea as Symfony, just wired through Drupal's \`create()\`
rather than autowiring.
`,

  comparisons: [
    {
      label: "Repository vs storage handler",
      intro:
        "Loading one record by id. Symfony asks the EntityManager for a repository; Drupal asks the entity type manager for a storage handler.",
      php: `<?php
// Symfony / Doctrine
use App\\Entity\\Node;

$repo = $em->getRepository(Node::class);
$node = $repo->find(42);        // null if not found

if ($node) {
    echo $node->getTitle();
}`,
      ts: `<?php
// Drupal
$storage = \\Drupal::entityTypeManager()
  ->getStorage('node');

$node = $storage->load(42);     // NULL if not found

if ($node) {
  echo $node->get('title')->value;
}`,
      note:
        "getStorage('node') is the repository; load() is find(). Note the field access: ->get('title')->value, not a getTitle() getter.",
    },
    {
      label: "persist + flush vs immediate save()",
      intro:
        "Creating and persisting a new record. Doctrine defers the write until flush(); Drupal writes on each save() call — there is no unit-of-work.",
      php: `<?php
// Symfony / Doctrine — batched, one flush
$node = new Node();
$node->setTitle('Hello');
$node->setType('article');

$em->persist($node);   // staged
$em->flush();          // INSERT happens here

// Bulk: persist in a loop, one flush at the end
foreach ($rows as $r) {
    $em->persist(makeNode($r));
}
$em->flush();`,
      ts: `<?php
// Drupal — immediate, per entity
use Drupal\\node\\Entity\\Node;

$node = Node::create([
  'type' => 'article',
  'title' => 'Hello',
]);
$node->save();         // INSERT happens here

// Bulk: no flush — each save() is its own write
foreach ($rows as $r) {
  Node::create($r)->save();
}`,
      note:
        "No persist/flush pair. save() is immediate and per-entity, returns SAVED_NEW or SAVED_UPDATED. Bulk work means many writes — consider the Batch/Queue API.",
    },
    {
      label: "Query builder vs entityQuery",
      intro:
        "Finding a filtered set. Doctrine has the QueryBuilder; Drupal has entityQuery, which returns ids you then load. Note accessCheck() is mandatory.",
      php: `<?php
// Symfony / Doctrine QueryBuilder
$ids = $em->createQueryBuilder()
    ->select('n.id')
    ->from(Node::class, 'n')
    ->where('n.type = :t')
    ->andWhere('n.published = 1')
    ->setParameter('t', 'article')
    ->setMaxResults(10)
    ->getQuery()
    ->getSingleColumnResult();

$nodes = $repo->findBy(['id' => $ids]);`,
      ts: `<?php
// Drupal entityQuery
$storage = \\Drupal::entityTypeManager()
  ->getStorage('node');

$ids = $storage->getQuery()
  ->condition('type', 'article')
  ->condition('status', 1)
  ->accessCheck(TRUE)   // deprecated to omit since D9.2; throws in D10/11
  ->range(0, 10)
  ->execute();

$nodes = $storage->loadMultiple($ids);`,
      note:
        "entityQuery returns entity ids, not objects — you loadMultiple() them. accessCheck(TRUE/FALSE) is mandatory: omit it and Drupal 10/11 throws.",
    },
    {
      label: "Field access & entity references",
      intro:
        "Reading typed fields. A Doctrine getter returns a scalar; a Drupal field is a field item list you index into, with helpers for entity references.",
      php: `<?php
// Symfony / Doctrine — plain getters
$title  = $node->getTitle();
$price  = $product->getPrice();

// Relations are already objects
$author = $node->getAuthor();          // User
echo $author->getName();

// To-many relation
foreach ($node->getTags() as $tag) {
    echo $tag->getName();
}`,
      ts: `<?php
// Drupal — field item lists
$title = $node->get('title')->value;
$price = $product->get('field_price')->value;

// Entity reference: id vs loaded entity
$authorId = $node->get('uid')->target_id;
$author   = $node->get('uid')->entity;   // User
echo $author->get('name')->value;

// To-many reference -> load the entities
foreach ($node->get('field_tags')
  ->referencedEntities() as $term) {
  echo $term->label();
}`,
      note:
        "->value for scalars, ->target_id for the raw reference id, ->entity for a single referenced entity, ->referencedEntities() for the loaded set. label() is the generic 'display name' helper.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A tiny model of a storage handler: create() mints an entity, save() writes it immediately (assigning an id on first save), and there is no flush(). Predict the printed lines, then reveal.",
    code: `<?php
declare(strict_types=1);

// Model one entity: a field bag plus an id.
class Entity {
    public ?int $id = null;
    public function __construct(public array $fields) {}
    public function set(string $k, $v): void { $this->fields[$k] = $v; }
    public function get(string $k) { return $this->fields[$k] ?? null; }
}

// Model a storage handler with NO unit-of-work.
class Storage {
    private array $rows = [];   // the "table"
    private int $auto = 0;

    public function create(array $fields): Entity {
        return new Entity($fields);      // not saved yet
    }

    public function save(Entity $e): string {
        if ($e->id === null) {
            $e->id = ++$this->auto;      // assign id
            $this->rows[$e->id] = $e;
            return 'SAVED_NEW';          // INSERT now
        }
        $this->rows[$e->id] = $e;
        return 'SAVED_UPDATED';          // UPDATE now
    }

    public function load(int $id): ?Entity {
        return $this->rows[$id] ?? null;
    }
}

$storage = new Storage();

$node = $storage->create(['type' => 'article', 'title' => 'Hello']);
echo 'first save: ' . $storage->save($node) . " (id={$node->id})\\n";

$node->set('title', 'Hi');
echo 'second save: ' . $storage->save($node) . " (id={$node->id})\\n";

$reloaded = $storage->load(1);
echo 'reloaded title: ' . $reloaded->get('title') . "\\n";
echo 'missing load: ' . var_export($storage->load(99), true) . "\\n";`,
    output: `first save: SAVED_NEW (id=1)
second save: SAVED_UPDATED (id=1)
reloaded title: Hi
missing load: NULL`,
  },

  keyPoints: [
    "Drupal's `EntityTypeManager::getStorage('node')` is the analogue of Doctrine's `$em->getRepository(Node::class)` — it hands you the per-type storage handler.",
    "There is **no unit-of-work**: no `persist()`/`flush()`. `$entity->save()` writes that single entity immediately, returning `SAVED_NEW` or `SAVED_UPDATED`.",
    "`$storage->load($id)` = `find()` (NULL if absent); `loadMultiple()`, `loadByProperties()` cover the `findBy()` cases; `Node::create([...])->save()` is the quick create+insert.",
    "Fields are typed **field item lists**: `->get('field_foo')->value` for scalars, `->target_id`/`->entity`/`->referencedEntities()` for entity references — not plain getters.",
    "`entityQuery` (`$storage->getQuery()`) returns entity **ids** you then `loadMultiple()`, and `accessCheck(TRUE|FALSE)` must be set explicitly — deprecated to omit since Drupal 9.2, and it throws in Drupal 10/11.",
    "Use the static `\\Drupal::entityTypeManager()` only in hooks/scripts; in services and controllers inject `EntityTypeManagerInterface` (via `create()` in a controller/plugin).",
  ],

  interview: [
    {
      q: "A Symfony dev asks: where did persist() and flush() go in Drupal?",
      a: "Drupal has no unit-of-work, so there is nothing to stage or flush. You call `$entity->save()` and that entity is written immediately — an INSERT on the first save, an UPDATE afterwards, and the method returns `SAVED_NEW` or `SAVED_UPDATED`. Because writes aren't batched, saving many entities is many separate writes, so bulk operations lean on the Batch API or a queue rather than one big transaction. The upside is simplicity: there's no detached-entity or 'forgot to flush' class of bug.",
    },
    {
      q: "How do you load and query entities without a Doctrine repository?",
      a: "You get a storage handler from the entity type manager: `\\Drupal::entityTypeManager()->getStorage('node')`, which is the repository equivalent. For single or known ids use `load($id)` or `loadMultiple($ids)`; for simple criteria use `loadByProperties(['type' => 'article'])`. For real querying use `$storage->getQuery()` (entityQuery), which returns matching entity **ids** you then `loadMultiple()` — and you must call `accessCheck(TRUE)` or `accessCheck(FALSE)`, because omitting the explicit access check was deprecated in Drupal 9.2 and throws an error in Drupal 10/11.",
    },
    {
      q: "Why is $node->getTitle() wrong, and how do you actually read a field?",
      a: "Drupal content entities don't expose per-field getters; every field is a **field item list**, a small typed collection even when it holds one value. So you read `$node->get('title')->value` (or the magic shortcut `$node->title->value`). For entity references you have `->target_id` for the raw id, `->entity` for a single loaded entity, and `->referencedEntities()` for a loaded set of a multi-value reference. `->label()` is a handy generic accessor for an entity's display name. It feels verbose coming from Doctrine, but it's what lets fields be multi-value, translatable, and revisionable uniformly.",
    },
    {
      q: "When should you inject EntityTypeManagerInterface instead of calling \\Drupal::entityTypeManager()?",
      a: "Almost always in your own services, controllers, and plugins. The static `\\Drupal::entityTypeManager()` is a service-locator shortcut that's acceptable in procedural hooks or throwaway scripts, but in class-based code it hides your dependency and makes the class hard to unit-test. Inject `EntityTypeManagerInterface` through the constructor, and in a controller or plugin wire it via the `create()` factory that reads it from the container — the same dependency-injection discipline you'd apply in Symfony, just through Drupal's `create()` rather than autowiring.",
    },
  ],

  quiz: [
    {
      question:
        "What is the Drupal equivalent of `$em->getRepository(Node::class)->find(42)`?",
      options: [
        "\\Drupal::entityManager()->find('node', 42)",
        "\\Drupal::entityTypeManager()->getStorage('node')->load(42)",
        "Node::find(42)",
        "\\Drupal::database()->query('SELECT * FROM node WHERE nid = 42')",
      ],
      answerIndex: 1,
      explain:
        "getStorage('node') returns the storage handler (the repository analogue), and load(42) is find() — returning NULL if the id doesn't exist. entityManager() is a removed legacy service.",
    },
    {
      question:
        "You create a node, save it, change its title, and save again. How many database writes occur, and when?",
      options: [
        "Zero until you call flush() once at the end",
        "One combined write, because Drupal batches changes to the same entity",
        "Two: an INSERT at the first save(), an UPDATE at the second — each immediate",
        "None; you must call \\Drupal::entityTypeManager()->flush()",
      ],
      answerIndex: 2,
      explain:
        "Drupal has no unit-of-work. Each save() writes immediately — SAVED_NEW (INSERT) then SAVED_UPDATED (UPDATE). There is no flush() to batch them.",
    },
    {
      question:
        "You run `$storage->getQuery()->condition('type','article')->execute()` and it throws. What is the most likely fix?",
      options: [
        "Add ->accessCheck(TRUE) or ->accessCheck(FALSE) to the query",
        "Call ->flush() before ->execute()",
        "Wrap it in a database transaction",
        "Use ->find() instead of ->execute()",
      ],
      answerIndex: 0,
      explain:
        "An entityQuery must declare its access check explicitly: omitting accessCheck() was deprecated in Drupal 9.2 and throws an error in Drupal 10/11. execute() then returns entity ids, which you loadMultiple().",
    },
    {
      question:
        "Given an entity-reference field `field_author`, how do you get the referenced User entity (not just its id)?",
      options: [
        "$node->get('field_author')->value",
        "$node->getAuthor()",
        "$node->get('field_author')->entity",
        "$node->field_author->load()",
      ],
      answerIndex: 2,
      explain:
        "->entity returns the loaded referenced entity for a single-value reference; ->target_id gives the raw id and ->referencedEntities() gives the loaded set for multi-value references. ->value holds scalar fields, not references.",
    },
  ],
};

export default lesson;
