import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "query-performance",
  title: "Query Performance: entityQuery, Database API & Indexes",
  part: "Data, Queries & Runtime",
  estMinutes: 13,
  summary:
    "Learn where Drupal's slow SQL comes from — one JOIN per configurable field, the node_access EXISTS subquery, missing indexes — and when to drop to the Database API, how to read EXPLAIN, and how accessCheck(FALSE) can be both the fix and a security hole.",

  concept: `
## Field storage is a join factory

A configurable field does not live on the entity's base table. \`field_severity\`
on your incident node type gets its own pair of tables, \`node__field_severity\`
and \`node_revision__field_severity\`, keyed by \`entity_id\`, \`revision_id\`,
\`langcode\`, \`delta\` and \`deleted\`. That layout is why entity queries stay
correct across translations and revisions, and it is also why they get slow:
**every field you filter or sort on adds another JOIN.** Base-table properties
(\`type\`, \`status\`, \`created\`, \`uid\`, \`title\`) are free — they are columns on
\`node_field_data\`. A three-field filter with a fourth-field sort is a four-way
join plus a filesort over the intermediate result, and MySQL can only use an
index on the first table it sorts by.

The practical rules follow directly:

- Filter and sort on **base fields** wherever the content model allows it.
- If a listing must sort on a configurable field, consider a **base field** on a
  custom entity, or a small denormalised index table you maintain in
  \`hook_entity_insert\`/\`hook_entity_update\`.
- Ask for the smallest result: \`->range(0, 10)\` and \`->count()\` on entity
  queries; \`->range()\` and \`->countQuery()->execute()->fetchField()\` on
  Database API selects. Never load 4,000 nodes to display 10.

## accessCheck is not free, and not optional

Since Drupal 10, an entity query that never calls \`accessCheck()\` throws a
\`QueryException\` — core refuses to guess. \`accessCheck(TRUE)\` adds the tag
\`node_access\` (generally *entity_type_id* + \`_access\`) to the underlying SQL
query, and node module's query alter — \`NodeGrantDatabaseStorage::alterQuery()\` —
adds an \`EXISTS\` subquery against the \`node_access\` grants table:
\`SELECT na.nid FROM node_access na WHERE (na.realm, na.gid) IN (this user's
grants) AND na.grant_view >= 1 AND base.nid = na.nid\`, plus an \`na.fallback\` or
\`na.langcode\` condition on multilingual sites. Note it is a **correlated
subquery, not an extra join** — in \`EXPLAIN\` it shows up as a dependent subquery
or semi-join rather than another row in the join list, and the grant operator is
\`>= 1\`, not \`= 1\`. With no grants module installed that subquery is trivial; add
Group, Domain Access or any workflow-based access module and it can dominate the
plan.

\`accessCheck(FALSE)\` is correct and safe when the result set is not user-specific:
a cron or queue job, a count for an admin report behind its own permission check,
or a list of \`status = 1\` nodes on a page every anonymous visitor sees the same
way. It is a genuine security bug when the results are rendered to arbitrary
users without a second check — unpublished or access-restricted nodes leak. If
you keep \`accessCheck(TRUE)\` and render the result, the output now varies per
user's grants, so the render array needs the \`user.node_grants:view\` cache
context or you will serve one reader's list to another.

## Indexes and EXPLAIN

Your own tables get indexes in \`hook_schema\` under the \`indexes\` key. Existing
tables — including field tables — get them from a \`hook_update_N\` calling
\`Drupal::database()->schema()->addIndex()\`. Base fields on custom entities are
better served by a storage schema handler that overrides
\`getSharedTableFieldSchema()\`, and altering storage definitions themselves is
what \`hook_entity_field_storage_info_alter()\` is for.

Then measure. Run \`EXPLAIN\` on the real query and read three columns: \`type\`
(\`ALL\` means full scan), \`key\` (\`NULL\` means no index used) and \`rows\`
(what the planner expects to examine). \`Using filesort\` plus \`Using temporary\`
in \`Extra\` is the classic signature of sorting on a joined field table. MySQL
8.0.18+ adds \`EXPLAIN ANALYZE\` for real timings; MariaDB has \`ANALYZE\`.
`,

  comparisons: [
    {
      label: "One JOIN per field: the same listing in both stacks",
      intro:
        "Filter incidents by severity and region, newest first. Doctrine joins the tables you mapped; entityQuery joins one dedicated table per configurable field, whether you wanted it to or not.",
      php: `// Symfony/Doctrine: joins are explicit and you chose the schema.
// severity/region are columns on the incident table, so no joins at all.
public function findCritical(string $region, int $limit): array
{
    return $this->createQueryBuilder('i')
        ->andWhere('i.published = true')
        ->andWhere('i.severity = :sev')->setParameter('sev', 'critical')
        ->andWhere('i.region = :region')->setParameter('region', $region)
        ->orderBy('i.occurredAt', 'DESC')
        ->setMaxResults($limit)
        ->getQuery()
        ->getResult();
}

// One table, one composite index:
//   #[ORM\\Index(columns: ['published', 'severity', 'region', 'occurred_at'])]
// EXPLAIN: type=range, key=idx_incident_feed, rows≈120`,
      ts: `// Drupal: three configurable fields = three JOINs you did not write.
$nids = $this->entityTypeManager->getStorage('node')->getQuery()
  ->accessCheck(FALSE)                     // see the next comparison
  ->condition('type', 'incident')
  ->condition('status', 1)                 // base table, free
  ->condition('field_severity', 'critical')// JOIN node__field_severity
  ->condition('field_region', $region)     // JOIN node__field_region
  ->sort('field_incident_at', 'DESC')      // JOIN node__field_incident_at
  ->range(0, $limit)
  ->execute();

$nodes = $this->entityTypeManager->getStorage('node')
  ->loadMultiple($nids);                   // one batched load, not N loads

// Cheaper shape when the model allows it: keep the sort on the base
// table (->sort('created', 'DESC')) so MySQL can sort from an index
// instead of materialising the join and filesorting it.`,
      note: "entityQuery returns IDs, never loaded entities — always follow it with a single loadMultiple(), never Node::load() inside the loop.",
    },
    {
      label: "Access filtering: voters in PHP vs a node_access subquery in SQL",
      intro:
        "Symfony filters after the fetch with voters; Drupal pushes access into the SQL. That is more correct for pagination and far more expensive, so you have to decide per query.",
      php: `// Symfony: the query is dumb, the voter decides afterwards.
$incidents = $repository->findCritical($region, 50);
$visible = array_filter(
    $incidents,
    fn(Incident $i) => $this->security->isGranted('view', $i)
);

// Correct, but pagination lies: you asked for 50 and may render 31.
// Pushing it into SQL means hand-writing the tenant/role predicate:
$qb->join('i.workspace', 'w')
   ->andWhere('w.id IN (:allowed)')
   ->setParameter('allowed', $user->getWorkspaceIds());`,
      ts: `// Drupal: accessCheck(TRUE) adds the tag, node module adds the subquery.
$query->accessCheck(TRUE);
// -> $sqlQuery->addTag('node_access')
// -> WHERE EXISTS (SELECT na.nid FROM node_access na
//                  WHERE (na.realm, na.gid) IN (this user's grants)
//                    AND na.grant_view >= 1
//                    AND na.nid = base.nid)
//    It is a correlated EXISTS, not a join: EXPLAIN shows a dependent
//    subquery / semi-join, not an extra row in the join list.

// Hand-written Database API selects opt in the same way:
$select = $this->database->select('node_field_data', 'n')
  ->fields('n', ['nid'])
  ->condition('n.type', 'incident')
  ->addTag('node_access');

// If you render access-checked results, declare the variance:
$build['#cache']['contexts'][] = 'user.node_grants:view';

// accessCheck(FALSE) is fine for: cron/queue jobs, counts behind an
// admin permission, and status=1 lists every anonymous user sees
// identically. It is a data leak anywhere else.`,
      note: "Forgetting accessCheck() entirely is a hard QueryException in Drupal 10 and 11 — the fix is to decide, not to copy whichever value silences it.",
    },
    {
      label: "The reporting query: drop out of the ORM",
      intro:
        "Aggregates over 200k rows are not an entity problem. Both frameworks give you a typed escape hatch that still parameterises and still respects the connection's prefixing.",
      php: `// Symfony: DBAL for the report, ORM stays out of it.
$sql = <<<'SQL'
    SELECT i.region, COUNT(*) AS total, MAX(i.occurred_at) AS latest
    FROM incident i
    WHERE i.published = 1 AND i.occurred_at >= :since
    GROUP BY i.region
    ORDER BY total DESC
SQL;

$rows = $this->connection
    ->executeQuery($sql, ['since' => $since])
    ->fetchAllAssociative();

// Count without hydrating anything:
$total = (int) $this->connection
    ->executeQuery('SELECT COUNT(*) FROM incident WHERE published = 1')
    ->fetchOne();`,
      ts: `// Drupal: Database API select(). No entities are loaded at all.
$query = $this->database->select('node_field_data', 'n');
$query->join('node__field_region', 'r', 'r.entity_id = n.nid AND r.deleted = 0');
$query->addField('r', 'field_region_value', 'region');
$query->addExpression('COUNT(*)', 'total');
$query->addExpression('MAX(n.created)', 'latest');
$query->condition('n.type', 'incident')
  ->condition('n.status', 1)
  ->condition('n.created', $since, '>=')
  ->groupBy('r.field_region_value')
  ->orderBy('total', 'DESC');

// Paged listings: count with countQuery(), not count($query->execute()).
// Count BEFORE you add the range. prepareCountQuery() clears the ORDER BY
// but NOT the range, and countQuery() wraps the whole thing in a subquery -
// so counting a query that already has ->range(0, 20) returns at most 20.
$count_query = clone $query;
$total = (int) $count_query->countQuery()->execute()->fetchField();
// Caveat: this query has a GROUP BY, so $total is the number of region
// groups. On a plain (ungrouped) paged select it is the row count you want.

$rows = $query->range(0, 20)->execute()->fetchAll();

// Debugging: (string) $query is the SQL, $query->arguments() the values.`,
      note: "Reporting queries bypass entity access and cacheability entirely — attach the tags yourself (node_list, or your own table's tag) or the report will go stale forever.",
    },
    {
      label: "Adding the index, then proving it worked",
      intro:
        "Same discipline in both stacks: declare the index in the schema so fresh installs get it, ship a migration/update so existing sites get it, then re-run EXPLAIN.",
      php: `// Symfony: declare on the entity, generate a migration.
#[ORM\\Entity]
#[ORM\\Table(name: 'incident')]
#[ORM\\Index(name: 'idx_incident_feed',
             columns: ['published', 'region', 'occurred_at'])]
class Incident { /* ... */ }

// bin/console doctrine:migrations:diff
// bin/console doctrine:migrations:migrate

// Before: type=ALL,   key=NULL,             rows=204811, Using filesort
// After:  type=range, key=idx_incident_feed, rows=118`,
      ts: `// Drupal, new table: hook_schema in mymodule.install.
function incident_index_schema() {
  $schema['incident_index'] = [
    'fields' => [
      'nid' => ['type' => 'int', 'unsigned' => TRUE, 'not null' => TRUE],
      'region' => ['type' => 'varchar', 'length' => 32, 'not null' => TRUE],
      'occurred_at' => ['type' => 'int', 'not null' => TRUE],
    ],
    'primary key' => ['nid'],
    'indexes' => [
      'feed' => ['region', 'occurred_at'],
    ],
  ];
  return $schema;
}

// Existing table (including a field table): ship an update hook.
function incident_index_update_10001() {
  Drupal::database()->schema()->addIndex(
    'node__field_incident_at',
    'incident_at_lookup',
    ['field_incident_at_value'],
    ['fields' => [
      'field_incident_at_value' => ['type' => 'int', 'not null' => FALSE],
    ]]
  );
}

// Prove it:
// drush sqlq "EXPLAIN SELECT n.nid FROM node_field_data n ..."`,
      note: "addIndex() needs the column spec passed back in because the schema layer cannot introspect it portably; run drush updatedb and re-EXPLAIN rather than trusting the diff.",
    },
  ],

  playground: {
    intro:
      "No database, no Drupal — just a model of how conditions and sorts become JOINs, what the access tag adds, and why forgetting accessCheck() is a thrown exception rather than a default.",
    lang: "php",
    code: `<?php
// A tiny model of how an entity query becomes SQL: one JOIN per field table,
// plus the cost of the access tag. No Drupal, no database - just the shape.
// Simplification: this model prints the access tag as an extra INNER JOIN so
// the row-count arithmetic stays readable. Real core emits a correlated
// EXISTS (SELECT na.nid FROM node_access na WHERE ... AND na.nid = base.nid)
// instead - same filtering effect, but EXPLAIN shows a dependent subquery.

final class FakeEntityQuery {
  private array $joins = [];
  private array $where = ["base.type = 'incident'", 'base.status = 1'];
  private array $order = [];
  private ?bool $accessCheck = NULL;
  private int $limit = 0;

  public function fieldCondition(string $field, string $value): static {
    $alias = 't' . count($this->joins);
    $this->joins[] = "INNER JOIN node__{$field} {$alias} ON {$alias}.entity_id = base.nid AND {$alias}.deleted = 0";
    $this->where[] = "{$alias}.{$field}_value = '{$value}'";
    return $this;
  }

  public function baseCondition(string $sql): static {
    $this->where[] = $sql;
    return $this;
  }

  public function fieldSort(string $field, string $dir): static {
    $alias = 't' . count($this->joins);
    $this->joins[] = "LEFT JOIN node__{$field} {$alias} ON {$alias}.entity_id = base.nid AND {$alias}.deleted = 0";
    $this->order[] = "{$alias}.{$field}_value {$dir}";
    return $this;
  }

  public function baseSort(string $column, string $dir): static {
    $this->order[] = "base.{$column} {$dir}";
    return $this;
  }

  public function accessCheck(bool $on): static {
    $this->accessCheck = $on;
    return $this;
  }

  public function range(int $limit): static {
    $this->limit = $limit;
    return $this;
  }

  public function explain(string $label): void {
    if ($this->accessCheck === NULL) {
      // Exactly what Drupal 10/11 do: no guessing, you must say.
      throw new RuntimeException('Entity queries must explicitly set whether the query should be access checked or not.');
    }
    $joins = $this->joins;
    if ($this->accessCheck) {
      // Stand-in for the real EXISTS subquery - see the note at the top.
      $joins[] = 'INNER JOIN node_access na ON na.nid = base.nid AND na.grant_view = 1'
        . " /* added by tag: node_access */";
    }
    echo $label, PHP_EOL;
    echo 'SELECT base.nid FROM node_field_data base', PHP_EOL;
    foreach ($joins as $join) {
      echo '  ', $join, PHP_EOL;
    }
    echo 'WHERE ', implode(' AND ', $this->where), PHP_EOL;
    if ($this->order) {
      echo 'ORDER BY ', implode(', ', $this->order), PHP_EOL;
    }
    if ($this->limit) {
      echo 'LIMIT ', $this->limit, PHP_EOL;
    }
    // Crude but honest cost model: every join multiplies the rows the planner
    // has to touch before ORDER BY can run.
    $rows = 50000;
    foreach ($joins as $join) {
      $rows = (int) ($rows * 1.8);
    }
    printf("joins=%d  filesort=%s  est. rows examined=%s%s",
      count($joins),
      $this->order && $this->joins ? 'yes' : 'no',
      number_format($rows),
      PHP_EOL
    );
    echo PHP_EOL;
  }
}

// The obvious version: two field filters, a field sort, access on.
(new FakeEntityQuery())
  ->fieldCondition('field_severity', 'critical')
  ->fieldCondition('field_region', 'north')
  ->fieldSort('field_incident_at', 'DESC')
  ->accessCheck(TRUE)
  ->range(10)
  ->explain('A) entityQuery, fields + accessCheck(TRUE)');

// Same list, rebuilt: promoted the hot values onto the base table via a
// custom index table, access enforced once by the cache context instead.
(new FakeEntityQuery())
  ->baseCondition("base.severity = 'critical'")
  ->baseCondition("base.region = 'north'")
  ->baseSort('incident_at', 'DESC')
  ->accessCheck(FALSE)
  ->range(10)
  ->explain('B) same list off a denormalised table, accessCheck(FALSE)');

// Forgetting accessCheck() is a hard failure, not a silent default.
try {
  (new FakeEntityQuery())->fieldCondition('field_severity', 'critical')->explain('C)');
}
catch (RuntimeException $e) {
  echo 'C) ', $e->getMessage(), PHP_EOL;
}
`,
    output: `A) entityQuery, fields + accessCheck(TRUE)
SELECT base.nid FROM node_field_data base
  INNER JOIN node__field_severity t0 ON t0.entity_id = base.nid AND t0.deleted = 0
  INNER JOIN node__field_region t1 ON t1.entity_id = base.nid AND t1.deleted = 0
  LEFT JOIN node__field_incident_at t2 ON t2.entity_id = base.nid AND t2.deleted = 0
  INNER JOIN node_access na ON na.nid = base.nid AND na.grant_view = 1 /* added by tag: node_access */
WHERE base.type = 'incident' AND base.status = 1 AND t0.field_severity_value = 'critical' AND t1.field_region_value = 'north'
ORDER BY t2.field_incident_at_value DESC
LIMIT 10
joins=4  filesort=yes  est. rows examined=524,880

B) same list off a denormalised table, accessCheck(FALSE)
SELECT base.nid FROM node_field_data base
WHERE base.type = 'incident' AND base.status = 1 AND base.severity = 'critical' AND base.region = 'north'
ORDER BY base.incident_at DESC
LIMIT 10
joins=0  filesort=no  est. rows examined=50,000

C) Entity queries must explicitly set whether the query should be access checked or not.
`,
  },

  keyPoints: [
    "Configurable fields live in dedicated tables, so every field you filter or sort on in an entityQuery costs another JOIN; base-table properties (type, status, created, uid) are free.",
    "accessCheck() is mandatory in Drupal 10/11 — omitting it throws a QueryException. TRUE adds the node_access tag, which node module turns into a correlated EXISTS subquery against the node_access grants table (grant_view >= 1), not an extra join; FALSE is safe only when the results are not user-specific.",
    "If you render access-checked results, add the user.node_grants:view cache context, or a shared cache will hand one user's list to another.",
    "Use the Database API select() for reports and aggregates: no entity hydration, range() to bound the rows, countQuery()->execute()->fetchField() for totals, addTag('node_access') when access still matters.",
    "Add indexes via the indexes key in hook_schema for your own tables and a hook_update_N calling Drupal::database()->schema()->addIndex() for existing or field tables.",
    "Measure with EXPLAIN: type=ALL and key=NULL mean a full scan; 'Using filesort' plus 'Using temporary' usually means you sorted on a joined field table.",
  ],

  interview: [
    {
      q: "Why does an entityQuery with a few field conditions get slow, and what would you do about it?",
      a: "Because configurable field values are stored one table per field — `node__field_severity`, `node__field_region` and so on — so each `condition()` or `sort()` on a field adds a JOIN, and sorting on a joined table usually forces a filesort over the materialised intermediate result. Base-table properties like `type`, `status`, `created` and `uid` are plain columns on `node_field_data` and cost nothing extra. My first move is to shift the sort onto a base field so the database can read it from an index, then bound the result with `range()`. If the listing genuinely needs multi-field filtering at scale, I'd either denormalise into a small index table maintained in entity hooks, or move the listing to a search index. And I'd confirm all of it with EXPLAIN rather than guessing.",
    },
    {
      q: "When is accessCheck(FALSE) acceptable, and what goes wrong if you get it wrong?",
      a: "It is acceptable when the query result is not user-specific: cron and queue jobs, migrations, counts and reports already gated by their own permission check, and public listings of published nodes where every anonymous visitor legitimately sees the same set. It is a real vulnerability when the results are rendered to arbitrary users — unpublished nodes, moderation-restricted content, or anything a grants module like Group or Domain Access was protecting, all leak. The safe middle ground is to query without access checking and then filter with `$entity->access('view')` before rendering, or to keep `accessCheck(TRUE)`. If you keep it TRUE, remember the output now varies per user, so the render array needs the `user.node_grants:view` cache context — otherwise you have swapped a data leak in SQL for a data leak in the cache.",
    },
    {
      q: "How do you decide between entityQuery and the Database API?",
      a: "entityQuery when I need entities: it respects revisions, translations, bundles and access, and it returns IDs I hand to a single `loadMultiple()`. The Database API when I need numbers — counts, aggregates, admin reports, anything over hundreds of thousands of rows — because hydrating entities to compute a `COUNT(*)` is pure waste. The trade-off is that a raw select bypasses entity access and cacheability, so I have to add `addTag('node_access')` if access still matters and attach cache tags to whatever I build from it. It's the same call a Symfony developer makes between the ORM's QueryBuilder and dropping to DBAL for a reporting query.",
    },
    {
      q: "Walk me through debugging a slow listing page in production.",
      a: "Start with evidence, not theory: enable the MySQL slow query log (or read New Relic / Blackfire) and get the actual SQL text. Run `EXPLAIN` on it and read `type`, `key`, `rows` and `Extra` — `type=ALL` with `key=NULL` means no index is usable, and `Using filesort` with `Using temporary` usually points at sorting a joined field table. Then check query *count* as well as query time, because an N+1 of 400 fast queries beats any single slow one for wall-clock damage; `Drupal::database()` logging or Webprofiler will show that. The fixes, in order of preference: add the missing index in a `hook_update_N`, reshape the query onto base fields, batch the loads, then cache the result with correct tags so most requests never run it at all.",
    },
  ],

  quiz: [
    {
      question:
        "An entityQuery filters on field_severity and field_region and sorts on field_incident_at. How many field-table joins does that generate?",
      options: [
        "None — field values are columns on node_field_data",
        "One, because all three fields belong to the same node type",
        "Three, one per configurable field touched by a condition or sort",
        "Three, but only if accessCheck is TRUE",
      ],
      answerIndex: 2,
      explain:
        "Each configurable field has its own dedicated table (node__field_severity, node__field_region, node__field_incident_at), and every condition or sort on one of them adds a JOIN. accessCheck is independent — TRUE does not add a fourth join, it adds an EXISTS subquery against node_access.",
    },
    {
      question:
        "What happens in Drupal 10 or 11 if you build an entity query and never call accessCheck()?",
      options: [
        "It silently defaults to accessCheck(TRUE)",
        "It silently defaults to accessCheck(FALSE)",
        "It throws a QueryException telling you to set it explicitly",
        "It logs a deprecation notice and continues with access checking on",
      ],
      answerIndex: 2,
      explain:
        "The accessCheck property starts as NULL, and Query::prepare() throws a QueryException: 'Entity queries must explicitly set whether the query should be access checked or not.' Core deliberately refuses to pick a default, because either choice is wrong somewhere.",
    },
    {
      question:
        "You render a list built from an entityQuery with accessCheck(TRUE). What cacheability does the render array need?",
      options: [
        "Nothing extra — accessCheck adds its own cache metadata",
        "The user.node_grants:view cache context",
        "max-age 0, since access-checked results are never cacheable",
        "The user cache context, which is always required for any access check",
      ],
      answerIndex: 1,
      explain:
        "Entity queries do not bubble cacheability, so you must declare the variance yourself. user.node_grants:view varies the cached fragment by the viewer's node grants — far more shareable than the per-user 'user' context, which would give every account its own copy.",
    },
    {
      question:
        "You need the total row count for a paged Database API select. Which is correct?",
      options: [
        "count($query->execute()->fetchAll()) — one round trip either way",
        "$query->count()->execute() — same API as entityQuery",
        "$query->countQuery()->execute()->fetchField()",
        "$query->range(0, 0)->execute()->rowCount()",
      ],
      answerIndex: 2,
      explain:
        "Database API selects expose countQuery(), which rewrites the select into a COUNT(*) and returns a new query; fetchField() pulls the single scalar. count() is the entityQuery API, and fetching all rows just to count them defeats the purpose.",
    },
  ],
};

export default lesson;
