import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "sql-vs-nosql",
  title: "SQL vs NoSQL, Said Like an Operator",
  part: "System Design Fundamentals",
  estMinutes: 13,
  summary:
    "Relational buys joins, transactions, and ad-hoc queries; document/KV stores buy flexible schema and horizontal write scale at the cost of joins and multi-record transactions — so start with PostgreSQL until a measured access pattern says otherwise.",

  concept: `
"SQL or NoSQL?" is in every design loop, and it's a trap for anyone who answers
with a preference instead of a trade-off. You've run MySQL and PostgreSQL in
production for 25 years, so answer it the way an operator does: name what each
model actually buys and costs, then pick from the *workload*, not from fashion.

### What relational buys, and costs

A relational database (PostgreSQL, MySQL) buys you three things that are
genuinely hard to add later: **joins** across normalised tables, **ACID
transactions** spanning multiple rows and tables, and **ad-hoc queries** — you
can ask a question nobody designed for and an index or the planner will serve
it. The cost is that horizontal write scaling is real work: one primary handles
writes, and going beyond it means read replicas, partitioning, or sharding,
which you take on deliberately.

### What document/KV buys, and costs

Document stores (MongoDB-style) and key-value stores (DynamoDB-style, Redis-
style) buy **flexible or schemaless documents** and **horizontal write scale by
design** — data is partitioned across nodes by a key, so writes spread out
without you re-architecting. The cost is the mirror image of relational's
strengths: **joins are weak or absent** (you denormalise and duplicate data
instead), **multi-record transactions are limited** or costly, and **ad-hoc
queries are constrained** — you must design your access patterns up front,
because a query the key layout didn't anticipate can mean scanning everything.

### The strong default

The senior answer starts here: **"I'd start with PostgreSQL — 18 is current —
until a measured access pattern says otherwise."** Relational is the safe
default because it keeps the most options open: you get transactions and ad-hoc
queries for free, and modern Postgres handles JSON columns, huge tables, and
high throughput far longer than people expect. Reaching for NoSQL *first*,
before any measurement, is the anti-signal — it's solving a scale problem you
haven't demonstrated you have.

### The specific triggers for NoSQL

Name the concrete conditions, so it's judgment and not a vibe:

- **Key-value access at massive scale** — you only ever fetch by a known key
  (sessions, a cache, a user's profile blob) and need it to scale horizontally
  without joins. A KV store is a great fit and a relational table is overkill.
- **Genuinely schemaless documents** — records whose shape varies wildly and
  unpredictably per row, where forcing a fixed schema fights the data.
- **Write throughput beyond one primary** — a measured, sustained write rate a
  single primary plus replicas can't hold, where partitioning by key is the
  natural relief (event/telemetry ingest is the classic case).

Absent one of those, relational is usually the better call.

### Most "SQL is slow" is a missing index

The reflex "SQL can't scale, let's move to Mongo" is, in practice, almost always
a query doing a **sequential scan** because the right index doesn't exist. Reach
for \`EXPLAIN\` before you reach for a new database. An index turning a full-table
scan into an index lookup routinely takes a query from seconds to milliseconds —
no migration, no rewrite. Indexes and reading query plans fix the large majority
of real-world "the database is slow" complaints, and knowing that is exactly the
operator signal an interviewer is listening for.
`,

  comparisons: [
    {
      label: "Choosing a datastore: fashion vs workload",
      intro:
        "The interviewer asks which database you'd use for an orders service. One answer picks by reputation; the other reasons from the access patterns.",
      php: `// WEAK: pick NoSQL because "it scales".
//
// "I'd use a NoSQL database like MongoDB because it scales
//  horizontally and relational databases don't scale. SQL is
//  old and it'll be a bottleneck, so NoSQL is the safe choice
//  for anything modern."
//
// Interviewer: "An orders service NEEDS multi-row transactions
// and ad-hoc reporting — the two things they just gave away.
// This is fashion, not reasoning. Anti-signal."`,
      ts: `// STRONG: reason from the workload.
//
// "Orders need a transaction across order + line-items +
//  inventory, and finance will run ad-hoc reports on them.
//  That's exactly relational's sweet spot, so I'd start with
//  PostgreSQL. It handles this workload well past the scale
//  we estimated. IF we later measured a write rate one primary
//  couldn't hold, I'd look at partitioning first, and only
//  consider a KV store for a genuinely key-only, massive-scale
//  path — not before I had the numbers."
//
// Interviewer: "Chose from the access patterns, kept options
// open, named the trigger to switch. Operator."`,
    },
    {
      label: "The same table: unindexed vs indexed for its hot query",
      intro:
        "An orders table serving 'a user's most recent orders'. Both schemas are valid; only one has the index that query needs, and that's the difference between a scan and a lookup.",
      php: `-- WEAK: no index for the hot access pattern.
CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint      NOT NULL,
  status      text        NOT NULL,
  total_cents integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Only the primary key is indexed.

-- The app's most common query:
SELECT * FROM orders
WHERE user_id = 913
ORDER BY created_at DESC
LIMIT 20;
-- Planner has no index on user_id -> Seq Scan of the whole
-- table, then a Sort, every time. Fine at 10k rows, a fire
-- at 50M. This is what "SQL is slow" almost always means.`,
      ts: `-- STRONG: an index built for that exact query.
CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint      NOT NULL,
  status      text        NOT NULL,
  total_cents integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Composite index serving BOTH the filter and the ordering:
CREATE INDEX orders_user_recent
  ON orders (user_id, created_at DESC);

-- Same query, now an Index Scan:
SELECT * FROM orders
WHERE user_id = 913
ORDER BY created_at DESC
LIMIT 20;
-- The index seeks straight to user 913's rows, already in
-- created_at DESC order, so LIMIT 20 stops after 20 reads.
-- No table scan, no sort step. Seconds -> milliseconds.`,
      note:
        "The column order matters: (user_id, created_at DESC) filters by user then reads pre-sorted, so the planner skips the sort and honours the LIMIT early — the fix for most 'the database is slow' reports.",
      leftLang: "sql",
      rightLang: "sql",
    },
    {
      label: "\"SQL is slow\": migrate vs read the plan",
      intro:
        "A query has gone slow in production. One instinct reaches for a new database; the other reaches for EXPLAIN first.",
      php: `// WEAK: blame the engine, plan a migration.
//
// "The orders query takes 4 seconds, so Postgres can't handle
//  our scale. We should migrate the whole thing to a NoSQL
//  store that scales better."
//
// A multi-week migration, losing transactions and ad-hoc
// queries, to fix what is almost certainly a missing index.`,
      ts: `// STRONG: diagnose before you migrate.
//
// "Before touching the database choice, let me EXPLAIN it.
//  ...it's a Seq Scan on orders — no index on user_id, so it
//  reads all 50M rows then sorts. I'll add a composite index
//  on (user_id, created_at DESC), re-check the plan, and it
//  should drop to a sub-millisecond Index Scan. If it were
//  ALSO write-bound past one primary, THAT would be a real
//  reason to talk about a different store — but this isn't."
//
// Minutes, not weeks, and no capability lost.`,
    },
  ],

  playground: {
    lang: "sql",
    intro:
      "A PostgreSQL 18 orders schema with one composite index, then three queries. Read it as an operator: predict which index serves each query and which one falls back to a full table scan.",
    code: `-- schema.sql (PostgreSQL 18)
CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint      NOT NULL,
  status      text        NOT NULL,          -- 'pending' | 'paid' | 'shipped'
  total_cents integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Serves "a user's orders, newest first":
CREATE INDEX orders_user_recent ON orders (user_id, created_at DESC);

-- Query A: fetch one order by id
SELECT * FROM orders WHERE id = 40255;

-- Query B: a user's 20 most recent orders
SELECT * FROM orders
WHERE user_id = 913
ORDER BY created_at DESC
LIMIT 20;

-- Query C: how many orders are stuck pending?
SELECT count(*) FROM orders WHERE status = 'pending';`,
    output: `EXPLAIN-flavoured review of each query at ~50M rows:

Query A  ->  Index Scan using orders_pkey
  Lookup by primary key. O(log n), a handful of page reads.
  Nothing to improve. This is the ideal case.

Query B  ->  Index Scan using orders_user_recent
  The (user_id, created_at DESC) index seeks straight to user
  913's rows, ALREADY in created_at DESC order, so the planner
  skips the sort and the LIMIT 20 stops after ~20 index reads.
  Column order is doing the work: filter column first, sort
  column second. Textbook. Fast.

Query C  ->  Seq Scan on orders   <-- the problem child
  No index on status, so this reads all ~50M rows to count.
  A plain btree on status helps little — only ~3 values, so
  low cardinality. The operator fix is a PARTIAL index:
    CREATE INDEX orders_pending
      ON orders (id) WHERE status = 'pending';
  It indexes only the small, hot 'pending' subset, so the
  count becomes an index-only scan over a tiny fraction of
  the table. Follow-up an interviewer would ask: "why partial
  and not a plain index on status?" -> because pending is rare
  and the other statuses are noise you never query this way.

Takeaway: two of three queries were served by thinking about
the access pattern BEFORE the schema. The scan was fixable with
an index, not a new database.`,
  },

  keyPoints: [
    "Relational buys joins, multi-row ACID transactions, and ad-hoc queries; the cost is that scaling writes past one primary is deliberate work (replicas, partitioning, sharding).",
    "Document/KV stores buy flexible schema and horizontal write scale by design; the cost is weak/absent joins, limited multi-record transactions, and access patterns you must design up front.",
    "The strong default is 'start with PostgreSQL (18 is current) until a measured access pattern says otherwise' — reaching for NoSQL before measurement is the anti-signal.",
    "Name concrete NoSQL triggers: key-only access at massive scale, genuinely schemaless documents, or a measured write rate beyond a single primary — not 'it scales'.",
    "Most 'SQL is slow' is a sequential scan from a missing index — run EXPLAIN first; the right index takes a query from seconds to milliseconds with no migration.",
    "Composite index column order matters: put the filtered column first and the sorted column second so the planner skips the sort and honours LIMIT early.",
  ],

  interview: [
    {
      q: "How do you decide between a SQL and a NoSQL database for a new service?",
      a: "I decide from the workload, not from reputation. Relational databases buy me joins, multi-row transactions, and ad-hoc queries; document and key-value stores buy flexible schema and horizontal write scaling but give up joins and easy transactions. My default is to start with PostgreSQL, because it keeps the most options open and handles far more scale than people assume — modern Postgres does JSON, big tables, and high throughput well. I'd only move to NoSQL for a specific, measured trigger: key-only access at massive scale, genuinely schemaless documents, or a sustained write rate a single primary can't hold. Choosing NoSQL before I've measured a problem is exactly the judgment error I'd avoid.",
    },
    {
      q: "A stakeholder says 'our SQL database is too slow, we need to switch to NoSQL.' How do you respond?",
      a: "I'd want to see the slow query and its plan before I'd entertain switching databases, because in my experience the large majority of 'SQL is slow' turns out to be a query doing a sequential scan for want of the right index. I'd run EXPLAIN, and if it's scanning the whole table to filter or sort, I add the index that serves that access pattern — often a composite index matching the filter and the ordering — re-check the plan, and watch it drop from seconds to milliseconds. That's minutes of work versus a multi-week migration that would cost us transactions and ad-hoc reporting. If, and only if, we were genuinely write-bound past a single primary would I treat a different store as the real answer.",
    },
    {
      q: "When is NoSQL genuinely the right call over relational?",
      a: "When the access pattern actually matches what it's good at. The clearest case is key-value at massive scale: you only ever fetch by a known key — a session, a cache entry, a user's profile blob — and you need it to spread across many nodes without joins; a KV store fits and a relational table is overkill. The second is genuinely schemaless data, where the record shape varies so much per row that a fixed schema fights the data. The third is write throughput beyond one primary, like telemetry ingest, where partitioning by key is the natural relief. Outside those, relational's transactions and ad-hoc queries usually win, so I treat NoSQL as a targeted tool, not a default.",
    },
  ],

  quiz: [
    {
      question:
        "What is the strong default answer to 'SQL or NoSQL?' in a design interview?",
      options: [
        "NoSQL, because relational databases can't scale horizontally",
        "Start with PostgreSQL until a measured access pattern justifies otherwise",
        "Always use whichever the company already runs",
        "Split every service across both from day one",
      ],
      answerIndex: 1,
      explain:
        "Relational keeps the most options open — transactions, joins, ad-hoc queries — and modern PostgreSQL scales far further than people assume. Reaching for NoSQL before you've measured a specific problem is the anti-signal; the strong answer defaults to relational and names the trigger to switch.",
    },
    {
      question:
        "A production query on a 50M-row table takes 4 seconds. What should you check first?",
      options: [
        "Whether to migrate to a NoSQL database",
        "Whether adding more application servers helps",
        "The query plan via EXPLAIN — it's likely a sequential scan from a missing index",
        "Whether to rewrite the service in a faster language",
      ],
      answerIndex: 2,
      explain:
        "Most 'SQL is slow' complaints are a sequential scan because the right index doesn't exist. EXPLAIN reveals the scan, and the matching index (often composite: filter column then sort column) turns it into an index lookup — seconds to milliseconds, no migration.",
    },
    {
      question:
        "Which is a legitimate, concrete trigger to choose NoSQL over relational?",
      options: [
        "The team finds SQL syntax verbose",
        "Key-value access at massive scale, genuinely schemaless data, or write throughput beyond a single primary",
        "The application is written in JavaScript",
        "You want to avoid writing a schema",
      ],
      answerIndex: 1,
      explain:
        "Those three are the real triggers — they match what document/KV stores are actually good at. 'It scales' or 'I'd rather not write a schema' are fashion, not reasoning, and usually cost you the transactions and ad-hoc queries relational gives for free.",
    },
  ],
};

export default lesson;
