import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "database-api",
  title: "The Database API: Queries Beyond Entities",
  part: "Data, State & Background Work",
  estMinutes: 12,
  summary:
    "Query the incident_log table through the injected Connection service — fluent select/insert/update/delete/merge builders, safe raw SQL with placeholders and {prefix} braces, and a clear rule for Database API vs entityQuery.",

  concept: `
## Doctrine DBAL with a different badge

Section 19 gave incident_tracker a real table — \`incident_log\`
(\`id\`, \`severity\` as the strings *notice* / *warning* / *critical*,
\`message\`, \`details\`, \`created\`), defined in \`hook_schema()\`; section 20's
update hooks added an \`assignee\` column and a second module-owned table,
\`incident_tracker_audit\`. Every query below uses exactly those columns.
Entities have entityQuery; bare tables have the **Database API**, and if you've
used Doctrine DBAL's QueryBuilder the mental model transfers almost one-to-one:
a connection service, fluent builders that compile to parameterized SQL, and an
escape hatch for raw queries. Inject the \`database\` service
(\`\\Drupal\\Core\\Database\\Connection\`) the usual way —
\`arguments: ['@database']\` in services.yml, or \`$container->get('database')\`
in \`create()\`. The **query builders** — select, insert, update, delete, merge —
are unchanged between Drupal 10 and 11; the differences sit at the edges: the
\`return\` option on \`query()\` (removed in 11) and the transaction layer
(rebuilt around \`TransactionManagerInterface\` in 10.2, which changed nesting
and rollback semantics).

## The fluent builders

\`select('incident_log', 'il')\` starts a dynamic query. Chain
\`fields('il', [...])\`, \`condition('severity', ['warning', 'critical'], 'IN')\`
— field, value, operator, with the placeholders invented for you (a scalar with
\`'>='\`, e.g. \`condition('created', $since, '>=')\`, works the same way) —
\`orderBy('created', 'DESC')\`,
\`range(0, 50)\` (LIMIT/OFFSET), then \`execute()\`. That returns a statement
whose fetchers go beyond PDO: \`fetchAll()\` (stdClass objects by default),
\`fetchAllAssoc('id')\`, \`fetchAllKeyed()\`, \`fetchCol()\`, \`fetchField()\`.

Two DBAL habits need adjusting:

- **Not everything chains.** \`join()\`, \`addField()\` and \`addExpression()\`
  return the **alias** they assigned, not the query — so multi-join queries are
  written statement by statement.
- **\`execute()\`'s return depends on the builder**: a statement for select,
  the new serial id for \`insert()\`, the matched-row count for \`update()\` and
  \`delete()\`, and \`Merge::STATUS_INSERT\` or \`Merge::STATUS_UPDATE\` for
  \`merge()\` — the portable upsert DBAL never shipped. (A bulk \`upsert()\`
  builder exists too.)

## Raw SQL, safely

\`query()\` takes real SQL with two Drupal twists. **Placeholders are
mandatory** — \`:since\` for scalars, and \`:severities[]\` expands an array into a
safe IN list. And table names go in braces — \`{incident_log}\` — so the
per-site **table prefix** is applied; the dynamic builders do that silently,
raw SQL needs the marker. String-concatenating a value into SQL is never
acceptable: not for "trusted" values, not in a one-off update hook.
Placeholders, always.

## Which API when

- **Entity data** (nodes, users, any content entity): entityQuery / entity
  storage. It applies access checks (\`accessCheck()\`), understands revisions
  and translations, and hides the fact that field values are spread across
  many tables.
- **Your own \`hook_schema()\` tables plus reporting**: Database API.
  \`incident_log\` has no entity wrapper, and cross-table reporting joins —
  incidents per assignee, counts per severity, log rows against their audit
  trail — are exactly what SQL is for.
- **Never** hand-query entity field tables like \`node__field_severity\`:
  their layout is private schema that changes without notice.

One version footnote: in Drupal 11, \`query()\` only ever returns a statement —
the long-deprecated \`return\` option from Drupal 7 days is gone, so when you
want an affected-row count, use the update/delete builders' return values.
`,

  comparisons: [
    {
      label: "SELECT: DBAL QueryBuilder vs Drupal select()",
      intro:
        "The incident list page needs the 50 most recent severe incidents. severity is a varchar_ascii holding 'notice' | 'warning' | 'critical', so 'severe' is a set membership test, not a numeric comparison. Same fluent shape on both sides — Drupal's condition() just writes the placeholders for you.",
      php: `<?php
// Symfony: a repository over Doctrine DBAL's QueryBuilder.
namespace App\\Repository;

use Doctrine\\DBAL\\ArrayParameterType;
use Doctrine\\DBAL\\Connection;

class IncidentRepository
{
    public function __construct(private readonly Connection $db) {}

    /**
     * @param string[] $severities
     * @return array<int, array<string, mixed>>
     */
    public function recentSevere(array $severities = ['warning', 'critical']): array
    {
        return $this->db->createQueryBuilder()
            ->select('il.id', 'il.message', 'il.severity', 'il.created')
            ->from('incident_log', 'il')
            ->where('il.severity IN (:severities)')
            // An array parameter needs an explicit type in DBAL.
            ->setParameter('severities', $severities, ArrayParameterType::STRING)
            ->orderBy('il.created', 'DESC')
            ->setMaxResults(50)
            ->executeQuery()
            ->fetchAllAssociative();   // rows as assoc arrays
    }
}`,
      ts: `<?php
// Drupal: src/IncidentRepository.php — the 'database' service
// injected via services.yml (arguments: ['@database']).
namespace Drupal\\incident_tracker;

use Drupal\\Core\\Database\\Connection;

class IncidentRepository {

  public function __construct(
    private readonly Connection $database,
  ) {}

  /**
   * @param string[] $severities
   * @return object[] rows as stdClass objects (default fetch)
   */
  public function recentSevere(array $severities = ['warning', 'critical']): array {
    return $this->database->select('incident_log', 'il')
      ->fields('il', ['id', 'message', 'severity', 'created'])
      ->condition('severity', $severities, 'IN')
      ->orderBy('created', 'DESC')
      ->range(0, 50)
      ->execute()
      ->fetchAll();
  }

}`,
      note:
        "fields() takes the alias plus a column array instead of select() strings, and condition(field, value, operator) generates the placeholders — you never type :severities, and passing an array with 'IN' needs no parameter-type hint the way DBAL does. The statement's fetchers cover more shapes than PDO: fetchAllAssoc('id'), fetchAllKeyed(), fetchCol(), fetchField().",
    },
    {
      label: "Writes: insert, update, delete — and merge(), the built-in upsert",
      intro:
        "Logging an incident, assigning it, purging old rows. DBAL's write helpers take arrays; Drupal's are fluent builders whose execute() return value differs per query type — and merge() is the portable upsert DBAL makes you hand-roll.",
      php: `<?php
// Symfony/DBAL: array-based helpers for single-table writes.
$this->db->insert('incident_log', [
    'severity' => 'critical',
    'message'  => 'Checkout 500s',
    'details'  => 'Stripe webhook timeouts since 09:12 UTC.',
    'created'  => time(),
]);
$id = (int) $this->db->lastInsertId();

$affected = $this->db->update(
    'incident_log',
    ['assignee' => 'duty-officer'],   // SET
    ['id' => $id],                    // WHERE
);

$this->db->delete('incident_log', ['severity' => 'notice']);

// Upsert: no portable DBAL helper — you write dialect SQL
// (MySQL ON DUPLICATE KEY, Postgres ON CONFLICT) or
// SELECT-then-write in a transaction.`,
      ts: `<?php
// Drupal: fluent builders on the injected Connection.
$id = $this->database->insert('incident_log')
  ->fields([
    'severity' => 'critical',
    'message'  => 'Checkout 500s',
    'details'  => 'Stripe webhook timeouts since 09:12 UTC.',
    'created'  => $this->time->getRequestTime(),
  ])
  ->execute();                  // returns the new serial id

$affected = $this->database->update('incident_log')
  ->fields(['assignee' => 'duty-officer'])
  ->condition('id', $id)
  ->execute();                  // returns matched-row count

$this->database->delete('incident_log')
  ->condition('severity', 'notice')
  ->execute();

// Upsert built in: update the row keyed on id, insert if absent.
$result = $this->database->merge('incident_log')
  ->keys(['id' => $id])
  ->fields(['assignee' => 'duty-officer'])
  ->execute();   // Merge::STATUS_INSERT or Merge::STATUS_UPDATE`,
      note:
        "Memorize the execute() returns: insert = new id, update/delete = row count, merge = which path ran. merge() works on any database Drupal supports; for many-row upserts there's also the upsert() builder with ->key() and repeated ->values().",
    },
    {
      label: "Raw SQL: placeholders and {table} prefix braces",
      intro:
        "A per-assignee breakdown of serious incidents. Both sides use bound parameters for values — Drupal adds braces around table names so the per-site table prefix can be applied, plus :name[] array expansion for IN lists.",
      php: `<?php
// Symfony/DBAL: raw SQL, named parameters. Table names are
// literal — prefixes are not a DBAL concept, and array params
// need an explicit ArrayParameterType.
use Doctrine\\DBAL\\ArrayParameterType;

$totals = $this->db->executeQuery(
    'SELECT il.assignee, COUNT(*) AS total
     FROM incident_log il
     WHERE il.created >= :since AND il.severity IN (:severities)
     GROUP BY il.assignee',
    ['since' => $since, 'severities' => ['warning', 'critical']],
    ['severities' => ArrayParameterType::STRING],
)->fetchAllKeyValue();`,
      ts: `<?php
// Drupal: query() for raw SQL. {braces} mark table names so the
// site's table prefix is applied; :name[] expands an array into
// a safely-placeholdered IN list.
$totals = $this->database->query(
  'SELECT il.assignee, COUNT(*) AS total
   FROM {incident_log} il
   WHERE il.created >= :since AND il.severity IN ( :severities[] )
   GROUP BY il.assignee',
  [':since' => $since, ':severities[]' => ['warning', 'critical']],
)->fetchAllKeyed();

// NEVER this — unescaped, unprefixed, injectable:
// $this->database->query(
//   "SELECT * FROM incident_log WHERE severity = '" . $severity . "'"
// );`,
      note:
        "The braces are why one database can host several Drupal sites (or share with another app) via a table prefix — dynamic builders prefix automatically, raw SQL needs the {marker}. On Drupal 11, query() always returns a statement; the old 'return' option is removed.",
    },
    {
      label: "Choosing the API: entities vs bare tables",
      intro:
        "The same split you already know from Doctrine: ORM for mapped entities, DBAL for bare tables. Drupal's entity storage adds access checking and multi-table field storage to the reasons you must not go around it.",
      php: `<?php
// Symfony: mapped entity => ORM QueryBuilder / DQL,
// never raw SQL against its tables.
$incidents = $this->em->getRepository(Incident::class)
    ->createQueryBuilder('i')
    ->where('i.severity IN (:severities)')
    ->setParameter('severities', ['warning', 'critical'])
    ->getQuery()
    ->getResult();

// Bare reporting table => DBAL, straight SQL is fine:
$bySeverity = $this->db->executeQuery(
    'SELECT severity, COUNT(*) FROM incident_log GROUP BY severity'
)->fetchAllKeyValue();`,
      ts: `<?php
// Drupal: entity data => entityQuery via entity storage. It
// applies access checks and hides multi-table field storage.
$nids = $this->entityTypeManager->getStorage('node')->getQuery()
  ->condition('type', 'article')
  ->accessCheck(TRUE)
  ->execute();

// Two tables THIS module owns (section 19's incident_log and the
// incident_tracker_audit table added by section 20's update hook):
// the latest audit note per severe incident. join() returns the
// assigned ALIAS (a string), not the query — so no full chaining.
$query = $this->database->select('incident_log', 'il');
$query->leftJoin('incident_tracker_audit', 'a', 'a.incident_id = il.id');
$query->fields('il', ['id', 'message', 'severity', 'assignee']);
$query->addField('a', 'note', 'last_note');
$rows = $query->condition('il.severity', ['warning', 'critical'], 'IN')
  ->orderBy('il.created', 'DESC')
  ->execute()
  ->fetchAll();`,
      note:
        "The bright line: if data belongs to an entity type, go through entity storage — field tables like node__field_severity are private schema, reshaped by the Field API. Entity base/data tables (users_field_data, node_field_data) are a narrower case: stable enough that core and Views join them, so a reporting join is defensible, but they still carry no access checking — never use one to decide what a user is allowed to see. Custom hook_schema() tables and joins between them are unambiguously Database API territory.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A miniature Connection over an in-memory incident_log: the fluent select() chain, merge() deciding between its UPDATE and INSERT paths, and {braces} becoming the real prefixed table name. Predict all three outputs, then run.",
    code: `<?php
// A miniature Drupal Connection: the fluent select() builder, merge()
// upsert, and {table} prefix expansion — over an in-memory incident_log.

const STATUS_INSERT = 1;   // Merge::STATUS_INSERT
const STATUS_UPDATE = 2;   // Merge::STATUS_UPDATE

class MiniConnection {
    public function __construct(
        public array $tables,
        private string $prefix = '',
    ) {}

    public function select(string $table, string $alias): MiniSelect {
        return new MiniSelect($this->tables[$table] ?? []);
    }

    public function merge(string $table): MiniMerge {
        return new MiniMerge($this, $table);
    }

    // What query() does to raw SQL: {braces} become the real table name.
    public function prefixTables(string $sql): string {
        return preg_replace('/\\{(\\w+)\\}/', $this->prefix . '$1', $sql);
    }
}

class MiniSelect {
    private array $fields = [];
    private array $conditions = [];
    private array $order = [];
    private ?array $range = null;

    public function __construct(private array $rows) {}

    public function fields(string $alias, array $fields): static {
        $this->fields = $fields;
        return $this;
    }

    public function condition(string $field, mixed $value, string $op = '='): static {
        $this->conditions[] = [$field, $value, $op];
        return $this;   // fluent — condition() builds the placeholder for you
    }

    public function orderBy(string $field, string $dir = 'ASC'): static {
        $this->order = [$field, $dir];
        return $this;
    }

    public function range(int $start, int $length): static {
        $this->range = [$start, $length];
        return $this;
    }

    public function execute(): array {
        $rows = array_filter($this->rows, function (array $row): bool {
            foreach ($this->conditions as [$field, $value, $op]) {
                $ok = match ($op) {
                    '='  => $row[$field] == $value,
                    '>=' => $row[$field] >= $value,
                    'IN' => in_array($row[$field], $value, true),
                };
                if (!$ok) {
                    return false;
                }
            }
            return true;
        });
        if ($this->order) {
            [$field, $dir] = $this->order;
            usort($rows, fn ($a, $b) => $dir === 'DESC'
                ? $b[$field] <=> $a[$field]
                : $a[$field] <=> $b[$field]);
        }
        if ($this->range) {
            $rows = array_slice($rows, $this->range[0], $this->range[1]);
        }
        // Drupal's default fetch mode: stdClass objects.
        return array_map(
            fn ($r) => (object) array_intersect_key($r, array_flip($this->fields)),
            array_values($rows),
        );
    }
}

class MiniMerge {
    private array $keys = [];
    private array $fields = [];

    public function __construct(private MiniConnection $conn, private string $table) {}

    public function keys(array $keys): static {
        $this->keys = $keys;
        return $this;
    }

    public function fields(array $fields): static {
        $this->fields = $fields;
        return $this;
    }

    public function execute(): int {
        foreach ($this->conn->tables[$this->table] as $i => $row) {
            if (array_intersect_key($row, $this->keys) == $this->keys) {
                // Row exists: behave like UPDATE.
                $this->conn->tables[$this->table][$i] = array_merge($row, $this->fields);
                return STATUS_UPDATE;
            }
        }
        // No row with those keys: behave like INSERT.
        $this->conn->tables[$this->table][] = $this->keys + $this->fields;
        return STATUS_INSERT;
    }
}

// The real incident_log columns: id, severity (notice|warning|critical),
// message, created — plus assignee, added by section 20's update hook.
$db = new MiniConnection([
    'incident_log' => [
        ['id' => 1, 'severity' => 'notice',   'message' => 'DB replica lag',   'assignee' => 'ops',  'created' => 100],
        ['id' => 2, 'severity' => 'critical', 'message' => 'Checkout 500s',    'assignee' => '',     'created' => 200],
        ['id' => 3, 'severity' => 'notice',   'message' => 'Slow search',      'assignee' => '',     'created' => 300],
        ['id' => 4, 'severity' => 'critical', 'message' => 'Payment API down', 'assignee' => '',     'created' => 400],
        ['id' => 5, 'severity' => 'warning',  'message' => 'Login flakiness',  'assignee' => 'ops',  'created' => 500],
    ],
], 'dr_');

// 1. The fluent select: recent severe incidents, newest first. severity is
// a string column, so 'severe' is an IN list — never a >= comparison.
$rows = $db->select('incident_log', 'il')
    ->fields('il', ['id', 'message', 'severity'])
    ->condition('severity', ['warning', 'critical'], 'IN')
    ->condition('created', 150, '>=')
    ->orderBy('created', 'DESC')
    ->range(0, 2)
    ->execute();

echo "severe + recent, newest first, range(0, 2):\\n";
foreach ($rows as $row) {
    echo "  #{$row->id} [{$row->severity}] {$row->message}\\n";
}

// 2. merge() = upsert. keys() finds the row; fields() sets values.
$first = $db->merge('incident_log')
    ->keys(['id' => 5])
    ->fields(['assignee' => 'duty-officer'])
    ->execute();
$second = $db->merge('incident_log')
    ->keys(['id' => 6])
    ->fields(['severity' => 'warning', 'message' => 'CDN purge storm', 'assignee' => '', 'created' => 600])
    ->execute();

echo "\\nmerge keys id=5: " . ($first === STATUS_UPDATE ? 'STATUS_UPDATE' : 'STATUS_INSERT') . "\\n";
echo "merge keys id=6: " . ($second === STATUS_UPDATE ? 'STATUS_UPDATE' : 'STATUS_INSERT') . "\\n";
echo "row count now: " . count($db->tables['incident_log']) . "\\n";

// 3. Raw SQL: {incident_log} braces let the site prefix be applied.
echo "\\n" . $db->prefixTables('SELECT severity, COUNT(*) FROM {incident_log} GROUP BY severity');`,
    output: `severe + recent, newest first, range(0, 2):
  #5 [warning] Login flakiness
  #4 [critical] Payment API down

merge keys id=5: STATUS_UPDATE
merge keys id=6: STATUS_INSERT
row count now: 6

SELECT severity, COUNT(*) FROM dr_incident_log GROUP BY severity`,
  },

  keyPoints: [
    "Inject the database service (\\Drupal\\Core\\Database\\Connection) — arguments: ['@database'] or $container->get('database') — and think 'Doctrine DBAL': fluent builders compiling to parameterized SQL. The query builders are unchanged between Drupal 10 and 11; the churn is at the edges (query()'s removed 'return' option, and the transaction manager rewritten in 10.2).",
    "The select() chain: fields(alias, [...]), condition(field, value, operator — pass an array with 'IN' for set membership, e.g. condition('severity', ['warning', 'critical'], 'IN')), orderBy(), range(offset, limit), execute() — then fetchAll() (stdClass objects by default), fetchAllAssoc('id'), fetchAllKeyed(), fetchCol(), fetchField().",
    "join(), addField() and addExpression() return the assigned alias string, NOT the query — multi-join queries are written statement by statement, unlike DBAL's always-fluent builder.",
    "execute() returns differ per builder: insert() = the new serial id, update()/delete() = matched-row count, merge() = Merge::STATUS_INSERT or STATUS_UPDATE — merge()->keys()->fields() is the portable upsert DBAL never shipped.",
    "Raw query() demands placeholders (:since, and :severities[] to expand IN lists) and {incident_log} braces so the per-site table prefix applies; string-concatenating values into SQL is never acceptable.",
    "Rule of thumb: entity data goes through entityQuery/entity storage (access checks, revisions, multi-table field storage); your own hook_schema() tables and reporting joins use the Database API — and entity field tables are private schema you never query by hand.",
  ],

  interview: [
    {
      q: "When do you use Drupal's Database API versus entityQuery?",
      a: "The split mirrors Doctrine: ORM for mapped entities, DBAL for bare tables. Entity data must go through entity storage or `entityQuery` because it applies access checks via `accessCheck()`, understands revisions and translations, and abstracts field storage that's physically spread across tables like `node__field_severity` — private schema that can change between versions. The Database API is for tables your module owns via `hook_schema()` (like `incident_tracker`'s `incident_log`) and for reporting: aggregates and cross-table joins that entityQuery can't express efficiently. Writing raw SQL against entity field tables is the classic red-flag answer — it bypasses access logic and breaks silently when storage changes.",
    },
    {
      q: "You know Doctrine DBAL — what actually differs in Drupal's query builder?",
      a: "The mental model is nearly identical: an injected `Connection`, fluent builders, bound parameters, a database-abstraction layer. The deltas are mostly ergonomic: `condition($field, $value, $operator)` generates placeholders for you, and `fields()` takes an alias plus a column array rather than select strings. The sharpest gotcha is that `join()`, `addField()` and `addExpression()` return the assigned *alias*, not `$this`, so complex queries aren't fully chainable. Also, `execute()`'s return type depends on the builder — statement for select, new id for insert, row count for update/delete, and `Merge::STATUS_INSERT`/`STATUS_UPDATE` for `merge()`, which is a portable upsert DBAL doesn't offer. Finally, raw SQL wraps table names in `{braces}` so Drupal's per-site table prefix gets applied.",
    },
    {
      q: "How do you keep raw SQL safe in a custom Drupal module?",
      a: "First preference: don't write raw SQL — the dynamic builders escape identifiers, bind values, and apply the table prefix automatically. When `query()` is genuinely needed (complex reporting SQL), every value goes through a named placeholder like `:since`, arrays go through `:severities[]` expansion for IN clauses, and table names are wrapped as `{incident_log}` so prefixing still works. Concatenating any runtime value into the SQL string — even one you 'know' is an integer, even in a one-off update hook — is an automatic review failure, because it's both an injection vector and a prefix bypass. If an identifier (column to sort by, say) comes from user input, validate it against a hard-coded allowlist rather than escaping it.",
    },
  ],

  quiz: [
    {
      question:
        "What does $this->database->insert('incident_log')->fields([...])->execute() return?",
      options: [
        "TRUE on success, FALSE on failure",
        "A StatementInterface you can fetch rows from",
        "The new serial id of the inserted row",
        "The number of affected rows",
      ],
      answerIndex: 2,
      explain:
        "Each builder's execute() returns something different: insert() hands back the new serial (auto-increment) id, update() and delete() return the matched-row count, merge() returns STATUS_INSERT or STATUS_UPDATE, and only select() returns a statement to fetch from.",
    },
    {
      question:
        "Why are table names written as {incident_log} in $this->database->query() calls?",
      options: [
        "The braces escape reserved words in all supported databases",
        "They mark the table name so the site's configured table prefix can be applied",
        "They enable the query result cache for that table",
        "They tell Drupal which table to LEFT JOIN automatically",
      ],
      answerIndex: 1,
      explain:
        "A Drupal site can run with a table prefix (e.g. dr_), letting one database host multiple sites or coexist with another app. Dynamic builders prefix automatically; in raw SQL the {braces} are how the connection knows which identifiers are table names to rewrite.",
    },
    {
      question:
        "This crashes: $this->database->select('incident_log', 'il')->join('incident_tracker_audit', 'a', 'a.incident_id = il.id')->fields('il', ['id']). Why?",
      options: [
        "join() is not allowed on dynamic select queries — joins require raw query()",
        "join() returns the assigned table alias (a string), not the query object, so ->fields() is called on a string",
        "accessCheck(TRUE) must be called before any join since Drupal 10",
        "The join condition must use {braces} around incident_tracker_audit",
      ],
      answerIndex: 1,
      explain:
        "Unlike DBAL's always-fluent builder, Drupal's join(), addField() and addExpression() return the alias they assigned rather than $this. Multi-join queries are therefore written statement by statement: $query = $db->select(...); $query->join(...); $query->fields(...). accessCheck() belongs to entityQuery, not the Database API.",
    },
    {
      question:
        "merge('incident_log')->keys(['id' => 42])->fields(['assignee' => 'duty-officer'])->execute() runs, but no row with id 42 exists. What happens?",
      options: [
        "It throws an exception because the row to update is missing",
        "Nothing — merge() only updates existing rows",
        "A row with id 42 and assignee 'duty-officer' is inserted, and execute() returns Merge::STATUS_INSERT",
        "A new revision of the row is created",
      ],
      answerIndex: 2,
      explain:
        "merge() is an upsert: keys() identifies the row, fields() supplies the values. If a matching row exists it's updated (STATUS_UPDATE); if not, the keys and fields together become a new row (STATUS_INSERT). It's the portable equivalent of MySQL's ON DUPLICATE KEY UPDATE, working on every database Drupal supports.",
    },
  ],
};

export default lesson;
