import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "entityquery-vs-dql",
  title: "entityQuery vs Doctrine QueryBuilder / DQL",
  part: "Content Model & Entities",
  estMinutes: 13,

  summary:
    "Drupal has no DQL and no repository: you build an entityQuery that returns entity IDs, must call accessCheck() explicitly, then loadMultiple() to hydrate — and drop to the SQL Select API for anything non-entity.",

  concept: `
In Symfony you query through Doctrine: \`createQueryBuilder()\`, a **DQL**
string, or the repository shortcuts \`find()\`, \`findBy()\`,
\`findOneBy()\`. All of them hand back **hydrated entity objects**. Drupal has
none of this. The equivalent is **entityQuery**, and it is different in three
ways that trip up every Symfony developer: it returns **IDs, not objects**;
access checking is **explicit and mandatory**; and there is **no query
language** — only chained \`condition()\` calls.

### The two-step: query, then load

DQL returns objects in one round trip. entityQuery returns an array of entity
IDs; you then ask the storage handler to load them:

\`\`\`php
\$storage = \$this->entityTypeManager->getStorage('node');
\$ids = \$storage->getQuery()
  ->condition('status', 1)
  ->condition('type', 'article')
  ->accessCheck(TRUE)
  ->range(0, 10)
  ->execute();              // -> [7, 12, 30, ...]
\$nodes = \$storage->loadMultiple(\$ids);
\`\`\`

\`\Drupal::entityQuery('node')\` is the same thing via the static wrapper. The
split exists because loading is cached and access-aware; the query only finds
matches.

### accessCheck() is not optional

This is the single most important difference. Doctrine returns every matching
row — access control is your problem, later. Since Drupal 9, **omitting
\`accessCheck()\` throws a \`QueryException\`**. You must state your intent:
\`accessCheck(TRUE)\` respects node/entity access (use it for anything shown to
a user), \`accessCheck(FALSE)\` bypasses it (admin/cron/internal logic). There is
no default — the API forces the decision Doctrine lets you forget.

### condition() instead of DQL

There is no query string to write. \`condition(field, value, operator)\`
defaults the operator to \`=\`, and supports \`<>\`, \`>\`, \`IN\`, \`BETWEEN\`,
\`STARTS_WITH\`, \`CONTAINS\`, \`IS NULL\`, etc. It is **field-aware**: you can
filter on admin-added fields (\`field_price\`) and even traverse references
(\`uid.entity.name\`). Add \`->sort()\`, \`->range(offset, length)\`,
\`->pager(50)\`, \`->count()\`, and \`->orConditionGroup()\` for OR logic.

### findBy has a direct analogue

Doctrine's \`findBy(['type' => 'article', 'status' => 1])\` maps almost exactly
to storage's **\`loadByProperties()\`**, which returns loaded entities in one
call (no ID step). Use it for simple equality lookups; reach for entityQuery
when you need operators, ranges, sorting, or just the IDs.

### When you need real SQL

entityQuery only queries entities. For reports, joins across arbitrary tables,
or aggregates, drop to the **Database (Select) API** — Drupal's equivalent of
Doctrine DBAL / raw query builder:

\`\`\`php
\$rows = \Drupal::database()->select('node_field_data', 'n')
  ->fields('n', ['nid', 'title'])
  ->condition('n.status', 1)
  ->execute()
  ->fetchAll();
\`\`\`

That returns raw stdClass rows, not entities — the trade-off for full SQL power.
`,

  comparisons: [
    {
      label: "Fetch published articles, page 1",
      intro:
        "The everyday listing query. Symfony's query builder returns hydrated Article objects; Drupal's entityQuery returns IDs you then load, and forces an access decision.",
      php: `<?php
// Symfony — QueryBuilder returns Article objects directly
$articles = $this->em->createQueryBuilder()
    ->select('a')
    ->from(Article::class, 'a')
    ->where('a.status = :s')
    ->setParameter('s', true)
    ->orderBy('a.createdAt', 'DESC')
    ->setFirstResult(0)
    ->setMaxResults(10)
    ->getQuery()
    ->getResult();`,
      ts: `<?php
// Drupal — entityQuery returns IDs; loadMultiple() hydrates
$storage = $this->entityTypeManager->getStorage('node');
$ids = $storage->getQuery()
    ->condition('status', 1)
    ->condition('type', 'article')
    ->sort('created', 'DESC')
    ->range(0, 10)
    ->accessCheck(TRUE)      // MANDATORY since Drupal 9
    ->execute();
$nodes = $storage->loadMultiple($ids);`,
      note:
        "getResult() gives objects in one step; execute() gives an array of IDs (keyed by entity id) that you must loadMultiple(). Omitting accessCheck() throws a QueryException.",
    },
    {
      label: "findBy vs loadByProperties",
      intro:
        "Simple equality lookup by a set of properties. Doctrine's findBy has an almost 1:1 Drupal equivalent that skips the ID round-trip.",
      php: `<?php
// Symfony — repository findBy(): objects, sorting, limit
$articles = $this->em
    ->getRepository(Article::class)
    ->findBy(
        ['status' => true, 'type' => 'news'],
        ['createdAt' => 'DESC'],
        10,
    );

$one = $this->em
    ->getRepository(Article::class)
    ->findOneBy(['slug' => 'hello']);`,
      ts: `<?php
// Drupal — loadByProperties(): returns loaded entities keyed by id
$storage = $this->entityTypeManager->getStorage('node');
$nodes = $storage->loadByProperties([
    'status' => 1,
    'type'   => 'news',
]);
// No built-in sort/limit here — use entityQuery for those.

// findOneBy equivalent: filter, then take the first
$match = $storage->loadByProperties(['field_slug' => 'hello']);
$one = $match ? reset($match) : NULL;`,
      note:
        "loadByProperties() is the closest thing to findBy() and returns hydrated entities directly, but supports only equality — no operators, ordering, or ranges. For those, use entityQuery.",
    },
    {
      label: "Operators & OR logic",
      intro:
        "A richer filter: price over 100 OR flagged as featured. DQL puts this in a WHERE string; entityQuery composes condition groups.",
      php: `<?php
// Symfony — DQL string with OR and a bound parameter
$dql = 'SELECT p FROM App\\Entity\\Product p
        WHERE p.price > :min OR p.featured = true';
$products = $this->em->createQuery($dql)
    ->setParameter('min', 100)
    ->getResult();`,
      ts: `<?php
// Drupal — no query string; build an orConditionGroup()
$storage = $this->entityTypeManager->getStorage('node');
$query = $storage->getQuery()->accessCheck(TRUE);
$group = $query->orConditionGroup()
    ->condition('field_price', 100, '>')
    ->condition('field_featured', 1);
$ids = $query->condition($group)->execute();
$products = $storage->loadMultiple($ids);`,
      note:
        "condition() defaults its operator to '='; pass '>', 'IN', 'BETWEEN', 'CONTAINS', etc. Multiple top-level conditions are AND; use orConditionGroup()/andConditionGroup() to nest OR logic.",
    },
    {
      label: "Non-entity data: DQL vs the Select API",
      intro:
        "An aggregate report across a table. entityQuery only queries entities, so for counts/joins you use Drupal's Database (Select) API — the DBAL-level tool.",
      php: `<?php
// Symfony — DQL aggregate, or drop to DBAL for raw SQL
$rows = $this->em->createQuery(
    'SELECT a.type, COUNT(a) AS c
     FROM App\\Entity\\Article a
     GROUP BY a.type'
)->getResult();`,
      ts: `<?php
// Drupal — Database Select API returns raw stdClass rows
$query = \\Drupal::database()->select('node_field_data', 'n');
$query->addField('n', 'type');
$query->addExpression('COUNT(n.nid)', 'c');
$rows = $query
    ->condition('n.status', 1)
    ->groupBy('n.type')
    ->execute()
    ->fetchAll();   // [ {type:'article', c:'42'}, ... ]`,
      note:
        "The Select API is field/column oriented (real table + column names) and returns rows, not entities. Reach for it when entityQuery can't express the join or aggregate you need.",
      leftLang: "php",
      rightLang: "php",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A model of entityQuery: chained condition()s build a list, accessCheck() is REQUIRED (calling execute() without it throws), execute() returns IDs, and loadMultiple() hydrates. Predict the output, then reveal it.",
    code: `<?php
// --- model of Drupal's entityQuery + storage handler ---
class Query {
    private array $conds = [];
    private ?bool $access = null;   // null = not set yet
    private ?int $limit = null;
    public function __construct(private array $rows) {}

    public function condition(string $f, $v, string $op = '='): static {
        $this->conds[] = [$f, $v, $op];
        return $this;
    }
    public function range(int $offset, int $length): static {
        $this->limit = $length;
        return $this;
    }
    public function accessCheck(bool $on): static {
        $this->access = $on;
        return $this;
    }
    public function execute(): array {
        if ($this->access === null) {
            throw new \\Exception('accessCheck() must be called explicitly');
        }
        $ids = [];
        foreach ($this->rows as $id => $row) {
            foreach ($this->conds as [$f, $v, $op]) {
                $field = $row[$f] ?? null;
                $ok = $op === '>' ? $field > $v : $field === $v;
                if (!$ok) { continue 2; }
            }
            $ids[] = $id;
        }
        return $this->limit ? array_slice($ids, 0, $this->limit) : $ids;
    }
}

class Storage {
    public function __construct(private array $rows) {}
    public function getQuery(): Query { return new Query($this->rows); }
    public function loadMultiple(array $ids): array {
        return array_map(fn($id) => $this->rows[$id], $ids);
    }
}

$storage = new Storage([
    7  => ['type' => 'article', 'status' => 1, 'price' => 50,  'title' => 'Alpha'],
    9  => ['type' => 'page',    'status' => 1, 'price' => 10,  'title' => 'About'],
    12 => ['type' => 'article', 'status' => 1, 'price' => 200, 'title' => 'Beta'],
    30 => ['type' => 'article', 'status' => 0, 'price' => 999, 'title' => 'Draft'],
]);

// entityQuery returns IDs (not objects); accessCheck is mandatory.
$ids = $storage->getQuery()
    ->condition('type', 'article')
    ->condition('status', 1)
    ->condition('price', 100, '>')
    ->accessCheck(true)
    ->execute();

echo 'ids: ' . implode(',', $ids) . "\\n";
foreach ($storage->loadMultiple($ids) as $node) {
    echo '- ' . $node['title'] . ' ($' . $node['price'] . ")\\n";
}

// What happens if you FORGET accessCheck()?
try {
    $storage->getQuery()->condition('status', 1)->execute();
} catch (\\Exception $e) {
    echo 'ERROR: ' . $e->getMessage() . "\\n";
}`,
    output: `ids: 12
- Beta ($200)
ERROR: accessCheck() must be called explicitly`,
  },

  keyPoints: [
    "Drupal has **no DQL**: you chain `condition()` calls on an entityQuery instead of writing a query string.",
    "entityQuery `execute()` returns an array of **entity IDs**, not objects — you then `loadMultiple($ids)` on the storage handler to hydrate.",
    "**`accessCheck(TRUE|FALSE)` is mandatory** since Drupal 9; omitting it throws a `QueryException`. `TRUE` respects entity access, `FALSE` bypasses it.",
    "`condition()` is **field-aware** (queries admin-added `field_*` and reference chains), defaults the operator to `=`, and supports `>`, `IN`, `BETWEEN`, `CONTAINS`, etc.",
    "Doctrine's `findBy()` maps to storage's **`loadByProperties()`** — equality-only, but returns loaded entities directly with no ID step.",
    "For joins, aggregates, or non-entity tables, drop to the **Database (Select) API** (`\\Drupal::database()->select(...)`) — the DBAL-level equivalent that returns raw rows.",
  ],

  interview: [
    {
      q: "Walk me through fetching the 10 newest published articles in Drupal. How does it differ from Doctrine's query builder?",
      a: "Get the node storage handler, then build an entityQuery: `->condition('status', 1)->condition('type', 'article')->sort('created', 'DESC')->range(0, 10)->accessCheck(TRUE)->execute()`. Unlike Doctrine's `getResult()`, `execute()` returns an array of **entity IDs**, so you then call `$storage->loadMultiple($ids)` to get the actual node objects. There's no DQL string — everything is a chained `condition()`. The other big difference is `accessCheck(TRUE)`, which is required and has no Doctrine equivalent; it makes the query respect entity access rather than returning every row.",
    },
    {
      q: "Why does Drupal force you to call accessCheck(), and when would you pass FALSE?",
      a: "In Doctrine, access control is entirely your responsibility after the rows come back, so it's easy to leak content you shouldn't show. Since Drupal 9 the query API refuses to run without an explicit `accessCheck()` call — omitting it throws a `QueryException` — precisely to stop that silent data leak. Pass `accessCheck(TRUE)` for anything a user will see, so unpublished or permission-restricted entities are filtered out. Pass `accessCheck(FALSE)` for trusted internal contexts — cron jobs, migrations, admin batch operations — where you deliberately need every matching entity regardless of the current user's permissions.",
    },
    {
      q: "A colleague used entityQuery to build a report joining nodes to a custom stats table and it won't work. What do you tell them?",
      a: "entityQuery only queries **entities and their fields** — it can't join to an arbitrary table or do aggregates, so it's the wrong tool. Drupal's equivalent of Doctrine's DBAL / raw query builder is the **Database (Select) API**: `\\Drupal::database()->select('node_field_data', 'n')`, then `join()`, `addField()`, `addExpression('COUNT(...)', 'c')`, `groupBy()`, and `execute()->fetchAll()`. It returns raw `stdClass` rows keyed by real column names, not hydrated entities — that's the trade-off for full SQL power. Use entityQuery for entity lookups and the Select API when you genuinely need SQL joins or aggregation.",
    },
    {
      q: "What's the Drupal equivalent of Doctrine's findBy() and findOneBy()?",
      a: "Both map to the storage handler's **`loadByProperties()`**, e.g. `$storage->loadByProperties(['type' => 'news', 'status' => 1])`, which returns already-loaded entities keyed by ID in a single call — no separate load step. It's the closest match to `findBy()` but supports only equality; there's no ordering or limit argument like Doctrine's second and third parameters. For `findOneBy()` you call the same method and `reset()` the result to take the first entity. As soon as you need operators, sorting, or ranges, switch to entityQuery.",
    },
  ],

  quiz: [
    {
      question:
        "What does a Drupal entityQuery's execute() return, and what must you do next?",
      options: [
        "Hydrated entity objects — nothing further is needed",
        "An array of entity IDs — you then call loadMultiple() to hydrate them",
        "A PDOStatement you iterate row by row",
        "A DQL result set of associative arrays",
      ],
      answerIndex: 1,
      explain:
        "entityQuery returns entity IDs, not objects. You pass those IDs to the storage handler's loadMultiple() (or load()) to get the actual entities — a two-step split that differs from Doctrine's getResult(), which hydrates directly.",
    },
    {
      question:
        "You run an entityQuery in Drupal 10 without calling accessCheck(). What happens?",
      options: [
        "It silently returns all matching rows, like Doctrine",
        "It defaults to access checking enabled",
        "It throws a QueryException — accessCheck(TRUE|FALSE) is mandatory",
        "It returns an empty array as a safe default",
      ],
      answerIndex: 2,
      explain:
        "Since Drupal 9, calling execute() without an explicit accessCheck(TRUE) or accessCheck(FALSE) throws a QueryException. The API forces you to decide whether to enforce entity access, preventing the accidental data leaks that are easy with Doctrine.",
    },
    {
      question:
        "Which tool should you use for a report that joins nodes to a custom table and counts rows per type?",
      options: [
        "entityQuery with a orConditionGroup()",
        "loadByProperties() with a GROUP BY argument",
        "The Database (Select) API via \\Drupal::database()->select()",
        "A DQL string passed to entityQuery",
      ],
      answerIndex: 2,
      explain:
        "entityQuery only queries entities and their fields — it can't join arbitrary tables or aggregate. For joins and COUNT/GROUP BY you use the Database (Select) API, Drupal's DBAL-level query builder, which returns raw stdClass rows rather than entities.",
    },
    {
      question:
        "Which Drupal call is the closest equivalent of Doctrine's findBy(['status' => 1])?",
      options: [
        "$storage->getQuery()->condition('status', 1)->execute()",
        "$storage->loadByProperties(['status' => 1])",
        "\\Drupal::database()->select('node', 'n')",
        "$storage->load(1)",
      ],
      answerIndex: 1,
      explain:
        "loadByProperties() takes an array of property => value equality conditions and returns already-loaded entities keyed by ID, mirroring findBy(). entityQuery is more powerful (operators, sorting, ranges) but returns IDs and needs a separate load step.",
    },
  ],
};

export default lesson;
