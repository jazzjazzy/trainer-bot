import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-and-interview",
  title: "Cheatsheet and Interview Drill",
  part: "Production & Choosing",
  estMinutes: 14,
  summary:
    "The whole course on one page: a Prisma/Drizzle/raw-SQL operation table, the version facts stated crisply, and the four interview questions this course has been building toward.",

  concept: `
Everything below is recall material. Read the table until you can produce any
cell from any other cell — that's the actual interview skill: "here's a
Prisma call, what SQL runs?" and "here's the SQL, write it in Drizzle."

### The operation cheatsheet

| Operation | Prisma | Drizzle | SQL underneath |
| --- | --- | --- | --- |
| Define schema | \`model User { ... }\` in \`schema.prisma\` | \`pgTable("users", { ... })\` in \`schema.ts\` | \`CREATE TABLE users (...)\` |
| Row types | generated client types | \`typeof users.$inferSelect\` / \`$inferInsert\` | — |
| Create migration | \`prisma migrate dev --name x\` (shadow DB) | \`drizzle-kit generate\` (writes .sql) | DDL file |
| Apply in prod | \`prisma migrate deploy\` | \`drizzle-kit migrate\` | run pending DDL, record it |
| Prototype only | \`prisma db push\` | \`drizzle-kit push\` | diff applied, no file |
| Insert | \`prisma.user.create({ data })\` | \`db.insert(users).values(v).returning()\` | \`INSERT ... RETURNING *\` |
| Read many | \`prisma.user.findMany({ where })\` | \`db.select().from(users).where(eq(...))\` | \`SELECT ... WHERE ...\` |
| Update | \`prisma.user.update({ where, data })\` | \`db.update(users).set(v).where(...)\` | \`UPDATE ... WHERE ...\` |
| Delete | \`prisma.user.delete({ where })\` | \`db.delete(users).where(...)\` | \`DELETE ... WHERE ...\` |
| Upsert | \`prisma.user.upsert({ where, update, create })\` | \`.onConflictDoUpdate({ target, set })\` | \`INSERT ... ON CONFLICT DO UPDATE\` |
| Relations | \`findMany({ include: { posts: true } })\` | \`db.query.users.findMany({ with: { posts: true } })\` | join or batched \`IN\` queries |
| Transaction | \`prisma.$transaction(async (tx) => ...)\` | \`db.transaction(async (tx) => ...)\` | \`BEGIN ... COMMIT/ROLLBACK\` |
| Raw SQL | \`prisma.$queryRaw\` (tagged) | \`sql\` tagged template | your SQL, parameterised |

### Version facts, stated crisply

**Prisma 7** (current major): the generator is \`provider = "prisma-client"\`
with a **required** explicit \`output\` path; the Rust query engine is gone —
a TypeScript query compiler runs instead, so the client **requires a driver
adapter** (\`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })\`
— constructing without one throws immediately); \`binaryTargets\` is replaced by a
\`runtime\` generator option (nodejs, bun, workerd, vercel-edge, ...); project
config lives in \`prisma.config.ts\`.

**Drizzle** (pre-1.0): drizzle-orm 0.45.x with drizzle-kit 0.31.x; schema is
TypeScript (\`pgTable\`), types via \`$inferSelect\`/\`$inferInsert\`; CLI verbs
are the bare \`drizzle-kit generate | migrate | push | studio\`; relational
queries use \`relations()\` plus \`db.query.users.findMany({ with: ... })\`
(RQB v2 is v1.0-beta only). Operators (\`eq\`, \`and\`, \`sql\`) import from
\`drizzle-orm\`; db init is \`drizzle({ client, schema })\`.

### How to drill

For each row of the table, say out loud: the Prisma call, the Drizzle call,
and the SQL — then reverse direction from the SQL. Your edge over other
candidates is that the third column is native to you; the drill is binding
the first two columns onto it.
`,

  comparisons: [
    {
      label: "Greatest hits: PDO CRUD vs Prisma CRUD",
      intro:
        "The bread-and-butter pair from early in the course, revisited at speed: parameterised insert-and-fetch in PDO, then the same operations in Prisma with types flowing from the schema.",
      php: `<?php
// PDO — safe, but shapes live in your head
$stmt = $pdo->prepare(
  'INSERT INTO users (email, name)
   VALUES (:email, :name) RETURNING id'
);
$stmt->execute([
  'email' => 'ada@example.com',
  'name'  => 'Ada',
]);
$id = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare(
  'SELECT id, email, name FROM users WHERE id = :id'
);
$stmt->execute(['id' => $id]);
$user = $stmt->fetch(PDO::FETCH_ASSOC); // array|false`,
      ts: `// Prisma — same statements, compiler-known shapes
const created = await prisma.user.create({
  data: { email: "ada@example.com", name: "Ada" },
});
// created: { id: number; email: string; name: string }
// SQL: INSERT INTO users (...) VALUES ($1,$2) RETURNING *

const user = await prisma.user.findUnique({
  where: { id: created.id },
});
// user: User | null — the null case is in the type,
// where PDO's \`false\` was a runtime surprise.
// SQL: SELECT ... FROM users WHERE id = $1 LIMIT 1`,
      note: "Both parameterise identically under the hood; the upgrade is that result shapes and the not-found case are compiler-checked instead of remembered.",
    },
    {
      label: "Greatest hits: raw join vs relational query",
      intro:
        "Users with their posts. On the left, the join you'd write by hand plus the row-regrouping loop it implies; on the right, Drizzle's relational query returning the nested shape directly.",
      php: `-- One round trip, but flat duplicated rows:
SELECT u.id, u.email, p.id AS post_id, p.title
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
ORDER BY u.id;

-- id | email           | post_id | title
--  1 | ada@example.com |      10 | Intro
--  1 | ada@example.com |      11 | Types
--  2 | alan@example.com|    NULL | NULL
-- ...then app code regroups rows into
-- user -> posts[] by hand.`,
      ts: `// Drizzle RQB — nested result, no regrouping code
const rows = await db.query.users.findMany({
  with: { posts: true },
});
// rows: { id: number; email: string;
//         posts: { id: number; title: string }[] }[]

// Requires the relations() wiring in the schema:
// export const usersRelations =
//   relations(users, ({ many }) => ({
//     posts: many(posts),
//   }));`,
      note: "The join produces duplicated flat rows you must regroup; RQB fetches efficiently (no N+1) and hands back the nested structure your code actually wants.",
      leftLang: "sql",
      rightLang: "ts",
    },
    {
      label: "Greatest hits: transactions",
      intro:
        "Move credits between two accounts atomically — the canonical transaction. PDO's begin/commit/rollback against the interactive transaction APIs.",
      php: `<?php
// PDO — manual bracket, easy to miss a path
$pdo->beginTransaction();
try {
    $debit = $pdo->prepare(
      'UPDATE accounts SET balance = balance - :amt
       WHERE id = :id AND balance >= :amt'
    );
    $debit->execute(['amt' => 100, 'id' => 1]);
    if ($debit->rowCount() === 0) {
        throw new RuntimeException('insufficient funds');
    }
    $pdo->prepare(
      'UPDATE accounts SET balance = balance + :amt
       WHERE id = :id'
    )->execute(['amt' => 100, 'id' => 2]);
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}`,
      ts: `// Both ORMs: the callback IS the transaction —
// commit on return, rollback on throw.

// Prisma
await prisma.$transaction(async (tx) => {
  const debit = await tx.account.updateMany({
    where: { id: 1, balance: { gte: 100 } },
    data:  { balance: { decrement: 100 } },
  });
  if (debit.count === 0) throw new Error("insufficient");
  await tx.account.update({
    where: { id: 2 },
    data:  { balance: { increment: 100 } },
  });
});

// Drizzle
await db.transaction(async (tx) => {
  // same statements via tx.update(accounts)...
});`,
      note: "Same BEGIN/COMMIT/ROLLBACK underneath; the callback style makes the rollback path impossible to forget — always issue queries through tx, never the outer client, inside the callback.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A flashcard drill for the five core interview topics. Each card logs the question, a beat to answer out loud, then the model answer. Run it, then edit the answers into your own words — that's the actual rehearsal.",
    code: `// Interview flashcards — the five questions this course
// has been building toward.

interface Card {
  topic: string;
  q: string;
  a: string;
}

const cards: Card[] = [
  {
    topic: "N+1",
    q: "What is the N+1 problem and how do you fix it?",
    a: "One query for N parents, then one lazy query per parent = N+1 round trips. Fix: fetch relations up front — include/with (join or batched IN), or one hand-written join. Detect it in query logs; verify the fix with EXPLAIN.",
  },
  {
    topic: "ORM vs raw SQL",
    q: "When would you drop from the ORM to raw SQL?",
    a: "When EXPLAIN ANALYZE shows a plan the ORM can't express the fix for: window functions, CTEs, tuned reporting joins. Use the typed escape hatches ($queryRaw / sql tag) — still parameterised, still typed rows.",
  },
  {
    topic: "Slow query",
    q: "An ORM query is slow in production. Walk me through it.",
    a: "Get the real SQL from logs; run EXPLAIN ANALYZE. Usual suspects: missing index for the WHERE/ORDER BY, over-fetching (select *, deep includes), N+1 at the call site, or pool starvation. Fix the cheapest layer first — often just an index.",
  },
  {
    topic: "Prisma vs Drizzle",
    q: "Prisma or Drizzle — when each?",
    a: "Prisma: mixed-skill teams, readable DSL, guardrailed migrations, mature ecosystem (v7: TS compiler + driver adapters). Drizzle: SQL-fluent teams, schema-as-TS, tiny zero-dep runtime, edge-friendly — but pre-1.0 (0.45.x).",
  },
  {
    topic: "Migrations",
    q: "How do schema changes reach production safely?",
    a: "Migration files reviewed as SQL, applied by CI with migrate deploy / drizzle-kit migrate. Roll forward only. Zero downtime via expand-and-contract; mind ACCESS EXCLUSIVE locks and CREATE INDEX CONCURRENTLY's no-transaction rule.",
  },
];

for (const card of cards) {
  console.log("Q [" + card.topic + "] " + card.q);
  console.log("   ... answer out loud, then compare:");
  console.log("A: " + card.a);
  console.log("");
}

console.log("Drilled " + cards.length + " of " + cards.length + " topics.");`,
  },

  keyPoints: [
    "Prisma 7 facts: `prisma-client` generator with required `output`, no Rust engine (TS query compiler), driver adapter mandatory (`new PrismaClient({ adapter })` — bare `new PrismaClient()` throws), `runtime` option instead of binaryTargets, config in `prisma.config.ts`.",
    "Drizzle facts: drizzle-orm 0.45.x / drizzle-kit 0.31.x (pre-1.0), schema as `pgTable` TypeScript, types via `$inferSelect`/`$inferInsert`, CLI verbs `generate | migrate | push | studio`, RQB via `relations()` + `with`.",
    "Production migration commands: `prisma migrate deploy` and `drizzle-kit migrate`; `db push`/`drizzle-kit push` are prototyping tools that leave no migration file.",
    "CRUD maps 1:1 to SQL in both ORMs — create/insert → `INSERT ... RETURNING`, upsert → `ON CONFLICT DO UPDATE`, `$transaction`/`db.transaction` callbacks → `BEGIN ... COMMIT/ROLLBACK`.",
    "Relations: Prisma `include` vs Drizzle `with` — both avoid N+1 by joining or batching; the raw-join alternative returns flat duplicated rows you must regroup yourself.",
    "Drill bidirectionally: given the ORM call, say the SQL; given the SQL, write both ORM versions — the SQL column is your home turf, so bind the other two onto it.",
  ],

  interview: [
    {
      q: "Explain the N+1 query problem and how you'd fix it in a modern ORM.",
      a: "N+1 is one query for a list of N parent rows followed by one query per parent for its relation — 101 round trips for 100 users with posts. The latency isn't in Postgres, it's in the network round trips, which is why it hides in development and explodes in production. In Prisma the fix is fetching the relation up front with `include` (or `select` on the relation); in Drizzle it's the relational query's `with`, or an explicit `leftJoin` in the core builder. Both collapse the work into a join or a small constant number of batched `IN` queries. Coming from PHP, it's the same disease lazy-loading ORMs like Doctrine had — my habit is to keep query logging on in development and treat query count as a first-class metric, then confirm the fixed shape with EXPLAIN.",
    },
    {
      q: "What are the real trade-offs between using an ORM and writing raw SQL?",
      a: "The ORM buys you compile-time types on rows and inputs, schema-migration tooling, safe parameterisation by default, and speed on the 80% of queries that are mechanical CRUD — that's genuinely valuable even to someone like me who's written SQL for 25 years. The costs: generated SQL can over-fetch or shape queries suboptimally, some of Postgres's power — window functions, CTEs, partial-index tricks — is awkward or inexpressible in the high-level API, and developers who only know the ORM can't debug the layer beneath. My position is the hybrid: ORM for CRUD, typed raw SQL through `$queryRaw` or Drizzle's `sql` tag for measured hot paths. The escape hatches parameterise exactly like the prepared statements I've always used, so there's no safety regression — and the decision to go raw should come from EXPLAIN ANALYZE, not taste.",
    },
    {
      q: "A Prisma query is slow in production. How do you make it fast?",
      a: "First I get the actual SQL — query logging or Postgres's log_min_duration_statement — because you tune statements, not ORM calls. Then EXPLAIN ANALYZE on that statement with production-like data. From 25 years of doing this, it's nearly always one of four things: a missing or unusable index for the WHERE or ORDER BY — fixed with the right index, built with CREATE INDEX CONCURRENTLY so writes aren't blocked; over-fetching — a deep `include` or unselected wide columns, fixed by narrowing `select`; an N+1 at the call site, visible as query count rather than one slow query; or pool exhaustion masquerading as query latency. If the plan needs something Prisma can't express — say a window function replacing a per-row subquery — I rewrite that one query with `$queryRaw` and keep the types. The superpower isn't the ORM knowledge; it's being able to read the plan.",
    },
    {
      q: "Prisma versus Drizzle — give me your honest comparison and when you'd pick each.",
      a: "They differ on five axes. Schema: Prisma's DSL plus a codegen step versus Drizzle's schema-as-TypeScript with pure inference. Query API: Prisma abstracts SQL behind result-shape objects; Drizzle mirrors it clause-for-clause. Migrations: `migrate dev` automates around a shadow database; `drizzle-kit generate` hands you a `.sql` file to read — which suits me, because I review DDL anyway. Runtime: Prisma 7 replaced the Rust engine with a TS query compiler but still requires a driver adapter and a generated client; Drizzle is a zero-dependency layer over your own driver, which is why it owns the edge story. Maturity: Prisma has stable majors, Studio and Accelerate; drizzle-orm is pre-1.0 at 0.45.x. I'd pick Prisma for a mixed-skill product team that wants guardrails, and Drizzle for a SQL-fluent team or a serverless/edge target. For me personally Drizzle is the natural fit — it rewards thinking in SQL, which is what I've done for 25 years — but I'd steelman Prisma for any team where that depth isn't shared.",
    },
  ],

  quiz: [
    {
      question:
        "Which set of statements about current versions is accurate?",
      options: [
        "Prisma 7 uses a Rust query engine; Drizzle is post-1.0 and frozen",
        "Prisma 7 uses the prisma-client generator with a required output path and mandatory driver adapters; drizzle-orm is pre-1.0 at 0.45.x with drizzle-kit 0.31.x",
        "Prisma 7 removed migrations entirely; Drizzle requires a codegen step",
        "Both ORMs require prisma.config.ts",
      ],
      answerIndex: 1,
      explain:
        "Prisma 7's headline changes: prisma-client generator (explicit output required), TS query compiler replacing the Rust engine, driver adapters mandatory (bare `new PrismaClient()` throws), runtime option, prisma.config.ts. Drizzle remains pre-1.0: drizzle-orm 0.45.x, drizzle-kit 0.31.x, no codegen — types are inferred.",
    },
    {
      question:
        "What SQL does an upsert map to in both ORMs when it can run natively?",
      options: [
        "SELECT then INSERT in two round trips, always",
        "MERGE INTO",
        "INSERT ... ON CONFLICT DO UPDATE",
        "UPDATE with a trigger fallback",
      ],
      answerIndex: 2,
      explain:
        "Drizzle spells it out directly (.onConflictDoUpdate with a target); Prisma's upsert emits the native INSERT ... ON CONFLICT DO UPDATE when its conditions are met (e.g. a single unique-field where), falling back to read-then-write otherwise.",
    },
    {
      question:
        "In Drizzle's relational queries, what loads users together with their posts?",
      options: [
        "db.query.users.findMany({ with: { posts: true } })",
        "db.query.users.findMany({ include: { posts: true } })",
        "db.select().from(users).lazy('posts')",
        "db.users.attach(posts)",
      ],
      answerIndex: 0,
      explain:
        "Drizzle's RQB uses `with` (Prisma's equivalent keyword is `include`), and it requires the relations() wiring in the schema. There is no lazy loading in either ORM — relations are fetched explicitly, which is exactly what prevents N+1.",
    },
    {
      question:
        "Why must queries inside a transaction callback go through the tx handle rather than the outer client?",
      options: [
        "The outer client is read-only during transactions",
        "Only tx queries run on the transaction's connection inside BEGIN/COMMIT — outer-client queries run outside it and won't roll back",
        "The tx handle is faster because it skips parameterisation",
        "Using the outer client throws a compile error in both ORMs",
      ],
      answerIndex: 1,
      explain:
        "The callback's tx is bound to the single connection where BEGIN was issued. A query through the outer client takes a different pooled connection, runs outside the transaction, commits immediately, and silently breaks atomicity — it type-checks fine, which is what makes it a classic bug.",
    },
  ],
};

export default lesson;
