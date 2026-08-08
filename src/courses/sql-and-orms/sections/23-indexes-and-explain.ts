import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "indexes-and-explain",
  title: "Indexes and EXPLAIN: Where You Shine",
  part: "Transactions & Performance",
  estMinutes: 13,
  summary:
    "Indexes move into schema code — Prisma's @@index and Drizzle's index() — but proving they work is still EXPLAIN ANALYZE, and reading plans is where your Postgres depth beats the ORM-native crowd.",

  concept: `
This is the section where your background flips from "catching up" to "ahead of the
room". Most ORM-native developers declare indexes because a blog post told them to;
you can read the plan. The only new material is *where the declaration lives* and
*how to get the ORM's SQL out* so you can EXPLAIN it like any other query.

### Declaring indexes in schema code

In Prisma, indexes are attributes in \`schema.prisma\` — \`@unique\` on a field,
\`@@index\` and \`@@unique\` at the model level for single or composite indexes.
Postgres index *types* are supported too:

\`\`\`ts
// prisma/schema.prisma
model Post {
  id       Int    @id @default(autoincrement())
  slug     String @unique              // unique index
  authorId Int
  status   String
  tags     Json?

  @@index([authorId, status])          // composite btree
  @@index([tags], type: Gin)           // Gin for JSON containment
}
\`\`\`

Drizzle puts them in the table's extras callback — the third argument to
\`pgTable\`, returning an array:

\`\`\`ts
import { pgTable, serial, integer, text, index, uniqueIndex } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id: serial().primaryKey(),
  slug: text().notNull(),
  authorId: integer("author_id").notNull(),
  status: text().notNull(),
}, (table) => [
  uniqueIndex("posts_slug_idx").on(table.slug),
  index("posts_author_status_idx").on(table.authorId, table.status),
]);
\`\`\`

Either way, the migration tool turns these into the \`CREATE INDEX\` DDL you would
have written by hand — schema code is just the new home for a decision you have
always made.

### Composite order: match the index to the query shape

You know this, but it's a top-three interview question so say it crisply: a btree on
\`(author_id, status)\` serves \`WHERE author_id = $1\` and
\`WHERE author_id = $1 AND status = $2\`, but **not** \`WHERE status = $2\` alone —
the leftmost prefix rule. Design composite indexes from your real query shapes
(equality columns first, then range/sort columns), not from the ER diagram.

### Getting the SQL out of the ORM

You can't EXPLAIN what you can't see. Prisma logs emitted SQL via query events:

\`\`\`ts
const prisma = new PrismaClient({
  adapter,
  log: [{ level: "query", emit: "event" }],
});
prisma.$on("query", (e) => console.log(e.query, e.params));
\`\`\`

Drizzle is even more direct — any built query exposes \`.toSQL()\`, returning
\`{ sql, params }\` without executing. Paste that into psql with \`EXPLAIN ANALYZE\`
and you're on home turf.

### Reading the plan (the 30-second version for interviews)

- **Seq Scan** — full table read. Fine for small tables or unselective predicates;
  a smell on a large table with a selective WHERE.
- **Index Scan** — walks the index, then visits the heap for each match.
- **Index Only Scan** — everything needed is in the index; no heap visits (modulo
  visibility-map checks). The reward for covering indexes.

And the classic ways a query defeats its own index: a leading-wildcard
\`LIKE '%term'\` (a btree can't seek into the middle of a string) and a function on
the column — \`WHERE lower(email) = $1\` can't use a plain index on \`email\`. The
fixes are yours already: rewrite the predicate to be sargable, or create an
expression index on \`lower(email)\` so the shapes match. ORM-generated queries are
not special: capture the SQL, EXPLAIN it, and treat the ORM as a code generator
whose output you audit.
`,

  comparisons: [
    {
      label: "CREATE INDEX vs Prisma schema attributes",
      intro:
        "The DDL you have always written, and where it now lives in a Prisma schema. prisma migrate generates the left side from the right.",
      php: `-- migrations/2026_07_add_post_indexes.sql
CREATE UNIQUE INDEX posts_slug_key
  ON posts (slug);

CREATE INDEX posts_author_id_status_idx
  ON posts (author_id, status);

CREATE INDEX posts_tags_idx
  ON posts USING GIN (tags);`,
      ts: `// prisma/schema.prisma
model Post {
  id       Int    @id @default(autoincrement())
  slug     String @unique
  authorId Int
  status   String
  tags     Json?

  @@index([authorId, status])
  @@index([tags], type: Gin)  // also: Hash, GiST, SP-GiST, BRIN
}`,
      note:
        "The schema is the source of truth: prisma migrate dev diffs it and writes the CREATE INDEX statements into a migration you can read — the type argument covers Postgres's non-btree index methods.",
      leftLang: "sql",
    },
    {
      label: "CREATE INDEX vs Drizzle's extras callback",
      intro:
        "The same indexes declared in Drizzle: a third argument to pgTable returns an array of index builders, and drizzle-kit generate emits the DDL.",
      php: `CREATE UNIQUE INDEX posts_slug_idx
  ON posts (slug);

CREATE INDEX posts_author_status_idx
  ON posts (author_id, status);`,
      ts: `// src/db/schema.ts
import {
  pgTable, serial, integer, text, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id: serial().primaryKey(),
  slug: text().notNull(),
  authorId: integer("author_id").notNull(),
  status: text().notNull(),
}, (table) => [
  uniqueIndex("posts_slug_idx").on(table.slug),
  index("posts_author_status_idx").on(table.authorId, table.status),
]);`,
      note:
        "Column order in .on() is the index column order — (authorId, status) serves author-only and author+status queries but not status alone, the leftmost-prefix rule you already design around.",
      leftLang: "sql",
    },
    {
      label: "A query that defeats its index vs the sargable rewrite",
      intro:
        "Two lookups against an indexed email column. The left one forces a Seq Scan no matter how good the index is; the right restores the Index Scan.",
      php: `-- Index: CREATE INDEX users_email_idx ON users (email);

-- Function on the column: the index on email
-- stores raw values, not lower(email) -> Seq Scan
SELECT id FROM users
WHERE lower(email) = 'jane@example.com';

-- Leading wildcard: btree can't seek into
-- the middle of a string -> Seq Scan
SELECT id FROM users
WHERE email LIKE '%@example.com';`,
      ts: `-- Fix 1: make the predicate match the index (sargable),
-- e.g. normalise email to lowercase on write:
SELECT id FROM users
WHERE email = 'jane@example.com';

-- Fix 2: make the index match the predicate —
-- an expression index:
CREATE INDEX users_email_lower_idx
  ON users (lower(email));

SELECT id FROM users
WHERE lower(email) = 'jane@example.com';  -- Index Scan`,
      note:
        "An index is only used when the predicate's shape matches what the index stores — either rewrite the query or build an expression index; this applies identically to WHERE clauses an ORM generates for you.",
      leftLang: "sql",
      rightLang: "sql",
    },
  ],

  playground: {
    lang: "sql",
    intro:
      "Read-and-predict: three EXPLAINs on a million-row users table — before an index, after CREATE INDEX, and a leading-wildcard LIKE that can't use it. Predict which plans show Seq Scan vs Index Scan before revealing.",
    code: `-- users: ~1,000,000 rows, no index on email yet

-- Query A: before any index
EXPLAIN SELECT id, email FROM users
WHERE email = 'jane@example.com';

-- Now add the index (what @@index / index().on() generate):
CREATE INDEX users_email_idx ON users (email);
ANALYZE users;

-- Query B: same query, after the index
EXPLAIN SELECT id, email FROM users
WHERE email = 'jane@example.com';

-- Query C: leading wildcard against the same indexed column
EXPLAIN SELECT id, email FROM users
WHERE email LIKE '%@example.com';`,
    output: `-- Query A (no index): full table read
Seq Scan on users  (cost=0.00..20834.00 rows=1 width=27)
  Filter: (email = 'jane@example.com'::text)

-- Query B (index in place): btree seek on the equality predicate
Index Scan using users_email_idx on users
    (cost=0.42..8.44 rows=1 width=27)
  Index Cond: (email = 'jane@example.com'::text)

-- Query C (leading wildcard): index CANNOT help —
-- a btree orders whole strings left-to-right, so '%...'
-- has no prefix to seek on. Back to scanning every row.
Seq Scan on users  (cost=0.00..20834.00 rows=100 width=27)
  Filter: (email ~~ '%@example.com'::text)`,
  },

  keyPoints: [
    "Indexes are schema code now: Prisma's `@unique`/`@@index` (with `type: Gin`, `Hash`, etc. on Postgres) and Drizzle's `index()`/`uniqueIndex()` in the pgTable extras array — the migration tools emit the CREATE INDEX you'd have written.",
    "Composite index column order follows the leftmost-prefix rule: `(author_id, status)` serves author-only and author+status predicates, never status alone — design from real query shapes, equality columns first.",
    "Get the SQL out before judging it: Prisma with `log: [{ level: 'query', emit: 'event' }]` plus `$on('query', ...)`; Drizzle with `.toSQL()` on any built query.",
    "Plan vocabulary for interviews: Seq Scan (full read), Index Scan (index + heap visits), Index Only Scan (covering index, no heap visits).",
    "A leading-wildcard LIKE or a function wrapped around the column defeats a plain btree; fix by rewriting the predicate to be sargable or creating an expression index that matches it.",
    "ORM-generated queries are not special — capture, EXPLAIN ANALYZE, and audit them like any SQL; that habit is your differentiator.",
  ],

  interview: [
    {
      q: "How do you verify that a query your ORM generates is actually using an index?",
      a: "First I get the real SQL out: Prisma emits it via query-event logging — `log: [{ level: 'query', emit: 'event' }]` and a `$on('query')` listener gives me the statement and parameters — and Drizzle gives me `.toSQL()` on any built query without executing it. Then it's standard practice: run EXPLAIN ANALYZE in psql with realistic parameter values and read the plan — Index Scan or Index Only Scan on the expected index confirms it; a Seq Scan on a large table with a selective predicate means the index is missing, mismatched, or the predicate isn't sargable. I treat the ORM as a code generator whose output I audit, not a black box.",
    },
    {
      q: "You have an index on email, but WHERE lower(email) = $1 still does a Seq Scan. Why, and what are the fixes?",
      a: "The btree stores raw email values, and the predicate asks about `lower(email)` — a different expression, so the planner can't use the index. Two fixes, and I'd choose based on ownership of the data: normalise the column on write (store lowercase, query with equality — the sargable rewrite), or create an expression index `CREATE INDEX ... ON users (lower(email))` so the index stores exactly what the predicate compares. Same family of problem as a leading-wildcard LIKE: a btree can only seek when the query's shape matches the ordered values it stores. This bites ORM users especially, because case-insensitive lookup helpers can quietly generate the non-sargable form.",
    },
    {
      q: "How do you decide the column order in a composite index?",
      a: "From the query shapes, never the schema diagram. The leftmost-prefix rule means an index on (author_id, status) serves filters on author_id alone and on both columns, but not status alone — so the column that appears in every query goes first. Within that, equality-tested columns lead and range or sort columns follow, because once the btree hits a range condition it can't seek on later columns. And I'd rather have one well-ordered composite than several single-column indexes the planner has to bitmap-AND together — but I'd verify that with EXPLAIN on the actual workload rather than assert it.",
    },
    {
      q: "What's the difference between an Index Scan and an Index Only Scan, and how do you get the latter?",
      a: "An Index Scan finds matching entries in the index but must still visit the heap to fetch columns the index doesn't contain (and check row visibility). An Index Only Scan answers the whole query from the index — no heap visits except visibility-map lookups — which matters enormously on wide tables. You get it by making the index cover the query: every selected and filtered column is in the index. So `SELECT id, email FROM users WHERE email = $1` with an index on (email, id) — or in Prisma/Drizzle terms, a composite `@@index`/`index().on()` listing both — can go index-only, and EXPLAIN will say so explicitly.",
    },
  ],

  quiz: [
    {
      question:
        "A Drizzle table has index('idx').on(table.authorId, table.status). Which WHERE clause can NOT use this index?",
      options: [
        "WHERE author_id = 7",
        "WHERE author_id = 7 AND status = 'published'",
        "WHERE status = 'published'",
        "WHERE author_id = 7 ORDER BY status",
      ],
      answerIndex: 2,
      explain:
        "Btree composites obey the leftmost-prefix rule: the index is ordered by author_id first, so a predicate on status alone has no prefix to seek on. Author-only, both-columns, and author-equality-plus-status-order shapes all line up with the index.",
    },
    {
      question:
        "Which plan node means Postgres answered the query entirely from the index, without visiting the table heap?",
      options: [
        "Seq Scan",
        "Index Scan",
        "Index Only Scan",
        "Bitmap Heap Scan",
      ],
      answerIndex: 2,
      explain:
        "Index Only Scan appears when the index covers every column the query needs (with visibility-map checks aside). Index Scan still fetches each matching row from the heap; Seq Scan reads the whole table; Bitmap Heap Scan builds a bitmap from the index then visits the heap in bulk.",
    },
    {
      question:
        "Why does WHERE email LIKE '%@example.com' seq-scan even with an index on email?",
      options: [
        "LIKE never uses indexes in Postgres",
        "A btree orders whole strings from the left, so a pattern with a leading wildcard has no prefix to seek on",
        "The index only works for numeric columns",
        "Postgres requires ILIKE for indexed pattern matching",
      ],
      answerIndex: 1,
      explain:
        "A btree can serve LIKE 'jane%' — that's a range seek on the prefix — but '%...' could match anywhere in the sorted order, so every row must be checked. Suffix searches need a different shape: an index on reverse(email), or trigram (pg_trgm) GIN indexes.",
    },
    {
      question: "How do you see the exact SQL a built Drizzle query would run, without executing it?",
      options: [
        "Call .toSQL() on the query — it returns { sql, params }",
        "Set DEBUG=drizzle and re-run the app",
        "Drizzle can't show SQL; you must use pg_stat_statements",
        "Wrap the query in db.explain()",
      ],
      answerIndex: 0,
      explain:
        "Every built Drizzle query exposes .toSQL(), returning the statement text and its bound parameters — paste it into psql with EXPLAIN ANALYZE and real values. (Prisma's equivalent is query-event logging via log/$on.)",
    },
  ],
};

export default lesson;
