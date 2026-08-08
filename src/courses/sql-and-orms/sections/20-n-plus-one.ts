import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "n-plus-one",
  title: "N+1: The Classic Killer, Typed",
  part: "Transactions & Performance",
  estMinutes: 12,
  summary:
    "The query-in-a-loop bug you've fixed in PHP for decades wears new clothes in TypeScript — count the queries, know each ORM's answer, and turn on query logging before anyone else does.",

  concept: `
You've fixed this bug in PHP more times than you can count:

\`\`\`php
$users = $pdo->query('SELECT * FROM users')->fetchAll();
foreach ($users as $user) {
    $stmt = $pdo->prepare('SELECT * FROM posts WHERE author_id = ?');
    $stmt->execute([$user['id']]);
    $posts[$user['id']] = $stmt->fetchAll();
}
\`\`\`

One query for users, then one per user: **1 + N**. For 100 users that's 101
statements — each cheap alone, but 101 round trips of parse/plan/execute
latency, serialized one after another. The endpoint is slow and Postgres
looks idle. In TypeScript the same bug hides in an innocent
\`for...of\` with an \`await\` inside, or in a GraphQL resolver that fetches
per parent.

### Each ORM's answer

**Prisma — ask for the relation up front.** \`include\` (or a relation inside
\`select\`) loads users and posts in **one SQL statement** on Postgres — a
\`LEFT JOIN LATERAL\` with JSON aggregation. Even the fallback
\`relationLoadStrategy: "query"\` is one query *per table*, never per row.
Prisma also has a historical trick worth naming in interviews: the fluent
API \`prisma.user.findUnique({ where: { id } }).posts()\` is batched by a
**dataloader** — identical \`findUnique\` calls issued in the same tick are
coalesced into a single \`WHERE "id" IN (...)\` query, which is what saves
naive GraphQL resolvers.

**Drizzle — relational queries are immune by construction.**
\`db.query.users.findMany({ with: { posts: true } })\` always compiles to
**exactly one SQL statement**. If you're using the core query builder, you
join — also one statement.

**The manual fix — the one that works in every language:**

\`\`\`ts
const users = await db.select().from(usersTable);            // 1 query
const posts = await db.select().from(postsTable)
  .where(inArray(postsTable.authorId, users.map(u => u.id))); // 1 query
// then group posts by authorId in a Map — total: 2 queries for any N
\`\`\`

That's \`WHERE author_id IN (...)\` plus in-memory grouping — the exact fix
you applied in PHP, and the right answer when an ORM's relation API doesn't
fit the query.

### Detection: count queries, don't guess

N+1 is invisible in code review and obvious in logs. Turn logging on in dev:

\`\`\`ts
// Prisma: log query events
const prisma = new PrismaClient({
  adapter,
  log: [{ emit: "event", level: "query" }],
});
prisma.$on("query", (e) => console.log(e.duration, "ms", e.query));

// Drizzle: one flag
const db = drizzle({ client, logger: true });
\`\`\`

Then hit the endpoint once and *count*. Fifty near-identical
\`SELECT ... WHERE "authorId" = $1\` lines with different parameters is the
signature. On the database side you'd spot the same thing in
\`pg_stat_statements\`: one normalized statement with an absurd \`calls\`
count — your Postgres instincts and the ORM logs point at the same culprit.
`,

  comparisons: [
    {
      label: "The foreach N+1 vs one include",
      intro:
        "Render 100 users with their posts. The PHP loop issues 101 statements; Prisma's include asks for the whole shape up front and lets the ORM plan the SQL.",
      php: `<?php
// 1 query...
$users = $pdo->query(
    'SELECT id, name FROM users LIMIT 100'
)->fetchAll();

// ...then N more, one per user
$stmt = $pdo->prepare(
    'SELECT id, title FROM posts
     WHERE author_id = ?'
);
foreach ($users as &$user) {
    $stmt->execute([$user['id']]);
    $user['posts'] = $stmt->fetchAll();
}
unset($user);
// 101 statements, 101 round trips,
// all sequential`,
      ts: `// declare the shape; the ORM plans the SQL
const users = await prisma.user.findMany({
  take: 100,
  select: {
    id: true,
    name: true,
    posts: { select: { id: true, title: true } },
  },
});

// ONE statement on Postgres: LEFT JOIN LATERAL
// + json_agg builds users[i].posts in-database.
// Even relationLoadStrategy: "query" would be
// one query per TABLE (2 here) — never per row.

console.log(users[0].posts);`,
      note:
        "The fix is declarative: because include/select state the full shape up front, the ORM can batch or join — the foreach version reveals its data needs one row at a time, which nothing can optimize.",
    },
    {
      label: "N SELECTs vs one IN (...)",
      intro:
        "The same fix at the SQL level — this is what any good ORM (or your hand-written batch fix) turns the loop into.",
      php: `-- what the N+1 loop sends: N of these
SELECT id, title FROM posts WHERE author_id = 1;
SELECT id, title FROM posts WHERE author_id = 2;
SELECT id, title FROM posts WHERE author_id = 3;
-- ... 97 more ...
SELECT id, title FROM posts WHERE author_id = 100;

-- 100 parse/plan/execute cycles and
-- 100 network round trips, serialized`,
      ts: `-- the batched equivalent: ONE statement
SELECT id, title, author_id
FROM posts
WHERE author_id IN (1, 2, 3, /* ... */ 100);

-- one round trip, one plan, one index scan
-- per matching range; group rows by
-- author_id in application memory.

-- Prisma's dataloader emits exactly this for
-- same-tick findUnique().posts() calls; your
-- manual fix emits it with inArray()/IN.`,
      note:
        "Same rows either way — the batched form trades N round trips for one, leaving Postgres one statement to plan and the app one cheap Map-grouping pass.",
      leftLang: "sql",
      rightLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A query counter makes the bug measurable: the naive loop needs 1 + N queries, the batched IN (...) fix needs 2 for any N. Predict both counts for 10 users, then run.",
    code: `// Count the queries: N+1 vs one batched IN (...) lookup.

interface User { id: number; name: string; }
interface Post { id: number; authorId: number; title: string; }

const userTable: User[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  name: \`user\${i + 1}\`,
}));
const postTable: Post[] = userTable.flatMap((u) => [
  { id: u.id * 10, authorId: u.id, title: \`Post A by \${u.name}\` },
  { id: u.id * 10 + 1, authorId: u.id, title: \`Post B by \${u.name}\` },
]);

let queryCount = 0;

const db = {
  allUsers(): User[] {
    queryCount++; // SELECT id, name FROM users
    return userTable;
  },
  postsByAuthor(authorId: number): Post[] {
    queryCount++; // SELECT ... FROM posts WHERE author_id = $1
    return postTable.filter((p) => p.authorId === authorId);
  },
  postsByAuthors(authorIds: number[]): Post[] {
    queryCount++; // SELECT ... FROM posts WHERE author_id IN ($1, ..., $10)
    return postTable.filter((p) => authorIds.includes(p.authorId));
  },
};

// --- The naive shape: the PHP foreach, translated ---
queryCount = 0;
const naive = db.allUsers().map((u) => ({ ...u, posts: db.postsByAuthor(u.id) }));
console.log(\`naive  : \${queryCount} queries for \${naive.length} users\`); // 1 + N

// --- The batched fix: one IN (...) query + in-memory grouping ---
queryCount = 0;
const users = db.allUsers();
const posts = db.postsByAuthors(users.map((u) => u.id));

const byAuthor = new Map<number, Post[]>();
for (const p of posts) {
  const list = byAuthor.get(p.authorId) ?? [];
  list.push(p);
  byAuthor.set(p.authorId, list);
}
const batched = users.map((u) => ({ ...u, posts: byAuthor.get(u.id) ?? [] }));
console.log(\`batched: \${queryCount} queries for \${batched.length} users\`); // always 2

console.log('identical results:', JSON.stringify(naive) === JSON.stringify(batched));`,
  },

  keyPoints: [
    "N+1 = one query for the parents plus one per parent — 100 users means 101 sequential round trips; the cost is latency multiplied, not any single slow query.",
    "In TS it hides in `for...of` loops with `await` inside and in per-parent GraphQL resolvers — the same foreach bug from PHP.",
    "Prisma's `include`/relation-`select` compiles to one statement on Postgres (LATERAL join + JSON aggregation); `relationLoadStrategy: \"query\"` is still one query per table, never per row.",
    "Prisma's dataloader batches identical same-tick `findUnique(...).posts()` fluent calls into a single `WHERE id IN (...)` — the classic GraphQL resolver rescue.",
    "Drizzle relational queries (`with`) always emit exactly one SQL statement; the universal manual fix is one `IN (...)` query plus Map grouping — 2 queries for any N.",
    "Detect by counting, not guessing: Prisma `log: [{ emit: \"event\", level: \"query\" }]` + `$on(\"query\")`, Drizzle `{ logger: true }` — or `pg_stat_statements` showing one normalized statement with a huge calls count.",
  ],

  interview: [
    {
      q: "Explain the N+1 problem and why it's about latency rather than query cost.",
      a: "N+1 is fetching a parent list with one query, then looping and issuing one more query per parent — users, then posts per user. Each per-row query is microseconds of work for Postgres: an index scan on `author_id`. The damage is the round trips: 101 sequential network hops plus parse/plan/execute overhead per statement, so a page that should take 5 ms takes half a second while the database sits mostly idle. That's also why it hides so well — no single query is slow, so it never shows up in a slow-query log. You find it by counting statements per request, and you fix it by restating the loop as one set-based query: a join, or `WHERE author_id IN (...)` plus in-memory grouping, which is 2 queries for any N.",
    },
    {
      q: "How do Prisma and Drizzle each prevent N+1 when loading relations?",
      a: "Both make the efficient path the declarative one. Prisma's `include` — or a relation inside `select` — states the whole shape up front, and on Postgres compiles to a single statement using a lateral join with JSON aggregation; even the `query` load strategy is one query per table, never per row. Prisma additionally runs a dataloader that coalesces identical `findUnique` fluent calls (`findUnique({ where: { id } }).posts()`) issued in the same tick into one `IN (...)` query — that's what rescues per-parent GraphQL resolvers. Drizzle's relational API, `db.query.users.findMany({ with: { posts: true } })`, is immune by construction: it always generates exactly one SQL statement. The bug survives only when you hand-roll the loop — an `await` per row inside `for...of` — which no ORM can see across statements.",
    },
    {
      q: "An endpoint is slow and you suspect query count. How do you confirm it?",
      a: "Turn on query logging and count. In Prisma I construct the client with `log: [{ emit: 'event', level: 'query' }]` and subscribe with `prisma.$on('query', ...)` — that gives me the SQL, parameters, and duration per statement. In Drizzle it's `{ logger: true }` at `drizzle()` init, or a custom `Logger` implementation to route into the app logger. Then I hit the endpoint once: fifty near-identical `WHERE \"authorId\" = $1` statements differing only in parameters is the N+1 signature. I'd cross-check from the database side with `pg_stat_statements`, where the loop shows up as one normalized statement with a calls count out of all proportion to request volume. Confirming with numbers matters — sometimes 'slow' turns out to be one bad plan, not fifty good ones, and the fix is completely different.",
    },
  ],

  quiz: [
    {
      question:
        "A page loads 50 users, then each user's posts in a loop. How many queries run, and what's the main cost?",
      options: [
        "51 queries; Postgres CPU is the bottleneck",
        "51 queries; the cost is 51 sequential round trips of network and parse/plan latency",
        "50 queries; the first is cached",
        "2 queries; the driver batches loops automatically",
      ],
      answerIndex: 1,
      explain:
        "1 for users + 50 for posts = 51. Each per-row query is individually fast — the damage is the serialized round-trip and per-statement overhead, which is why N+1 never appears in slow-query logs but dominates endpoint latency.",
    },
    {
      question:
        "What does Prisma's dataloader batch, historically the GraphQL-resolver rescue?",
      options: [
        "Any queries issued within the same second",
        "Identical-shape findUnique fluent calls (e.g. findUnique({ where: { id } }).posts()) issued in the same tick, coalesced into one IN (...) query",
        "All findMany calls across requests",
        "Only queries inside $transaction",
      ],
      answerIndex: 1,
      explain:
        "The dataloader collects same-tick findUnique calls that differ only in the where value and issues a single WHERE id IN (...) statement — which is why per-parent resolvers using the fluent API don't melt into N+1.",
    },
    {
      question:
        "How many SQL statements does db.query.users.findMany({ with: { posts: true } }) produce in Drizzle?",
      options: [
        "One per user",
        "Two — one per table",
        "Exactly one, regardless of row count",
        "It depends on the pool size",
      ],
      answerIndex: 2,
      explain:
        "Single-statement generation is a design goal of Drizzle's relational query builder: the nesting is built with JSON aggregation inside that one query, so RQB cannot produce N+1 no matter how many rows match.",
    },
    {
      question:
        "Which evidence most directly confirms an N+1 in production Postgres?",
      options: [
        "High CPU on the database server",
        "pg_stat_statements showing one normalized statement with a calls count vastly exceeding request volume",
        "A large table in pg_stat_user_tables",
        "Long-running queries in pg_stat_activity",
      ],
      answerIndex: 1,
      explain:
        "N+1 queries normalize to the same statement text with different parameters, so pg_stat_statements aggregates them into one row with an enormous calls count — the loop's fingerprint. CPU stays low and no individual query runs long, so the other signals stay quiet.",
    },
  ],
};

export default lesson;
