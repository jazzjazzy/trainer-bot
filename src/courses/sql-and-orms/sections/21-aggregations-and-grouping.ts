import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "aggregations-and-grouping",
  title: "Aggregations and GROUP BY",
  part: "Transactions & Performance",
  estMinutes: 12,
  summary:
    "Prisma's count/aggregate/groupBy and Drizzle's count/sum/avg helpers cover the everyday GROUP BY workload — and knowing exactly where each one's ceiling is tells you when to reach for raw SQL.",

  concept: `
You have written \`GROUP BY\` with \`HAVING\` more times than most interviewers have run
\`SELECT 1\`. The question here is not how aggregation works — it's how much of your
aggregation vocabulary each ORM can express before you drop to raw SQL, and what the
typed versions give you in return.

### Prisma: three levels of aggregation

Prisma splits the job across three methods, from simplest to most SQL-shaped:

\`\`\`ts
// COUNT(*) with a WHERE — returns a number
const paid = await prisma.order.count({ where: { status: "paid" } });

// Aggregates over the whole (filtered) table — no grouping
const stats = await prisma.order.aggregate({
  where: { status: "paid" },
  _count: { _all: true },
  _sum: { total: true },
  _avg: { total: true },
  _max: { total: true },
});
// stats._sum.total, stats._avg.total, ...
\`\`\`

\`groupBy\` is the full \`GROUP BY\` statement as an object. The mapping is mechanical:
\`by\` is the GROUP BY column list, \`where\` filters rows **before** grouping (SQL
\`WHERE\`), \`having\` filters groups **after** aggregation (SQL \`HAVING\`) — the same
distinction you'd explain to a junior, enforced by the API shape:

\`\`\`ts
const byCustomer = await prisma.order.groupBy({
  by: ["customerId"],
  where: { status: "paid" },          // WHERE — cheap, before grouping
  _count: { _all: true },
  _sum: { total: true },
  having: {
    total: { _sum: { gt: 100 } },     // HAVING SUM(total) > 100
  },
  orderBy: { _sum: { total: "desc" } },
});
\`\`\`

Note the \`having\` shape: the aggregate condition nests as \`total: { _sum: { gt: 100 } }\`.
Anything a field in \`having\` references must either be in \`by\` or be wrapped in an
aggregate — the same rule Postgres itself enforces.

### The "users with post counts" card

The most common aggregation in a web app isn't \`groupBy\` at all — it's a relation
count attached to each row. Prisma has a dedicated shape for it:

\`\`\`ts
const users = await prisma.user.findMany({
  include: { _count: { select: { posts: true } } },
});
// users[0]._count.posts — one query, no N+1
\`\`\`

### Drizzle: aggregates are just select fields

Drizzle doesn't wrap aggregation in a separate API. \`count()\`, \`sum()\`, \`avg()\`,
\`min()\`, \`max()\` are expressions you put in the select object, then chain
\`.groupBy()\` and \`.having()\` — it reads almost token-for-token like the SQL:

\`\`\`ts
import { count, sum, gt } from "drizzle-orm";

const rows = await db
  .select({
    customerId: orders.customerId,
    orderCount: count(),
    lifetime: sum(orders.total),
  })
  .from(orders)
  .groupBy(orders.customerId)
  .having(({ lifetime }) => gt(lifetime, "100"));
\`\`\`

One type-level surprise worth knowing cold: \`count()\` comes back as \`number\`, but
\`sum()\` and \`avg()\` come back as \`string | null\` — Postgres \`numeric\` and \`bigint\`
results can exceed JavaScript's safe integer range, so Drizzle refuses to silently
lose precision. Convert deliberately (\`Number(row.lifetime)\`) or use
\`\`sql\`sum(...)\`.mapWith(Number)\`\` when you know the values are small.

### Where the ceiling is

Be honest about limits in an interview — it's more credible than pretending the ORM
does everything. Prisma's \`groupBy\` cannot express window functions, \`FILTER\`
clauses, \`GROUPING SETS\`/\`ROLLUP\`, or aggregates of expressions. Drizzle gets much
further because any select field can be a raw \`sql\` fragment, but a genuinely gnarly
report query is often clearer as one hand-written statement. Both ORMs have
first-class raw-SQL escape hatches for exactly this — that's the next section.
`,

  comparisons: [
    {
      label: "GROUP BY + HAVING: raw SQL vs Prisma groupBy",
      intro:
        "Paid-order totals per customer, keeping only customers who have spent more than 100. Same query plan; one is an object literal.",
      php: `-- customers worth keeping an eye on
SELECT customer_id,
       COUNT(*)   AS order_count,
       SUM(total) AS lifetime
FROM orders
WHERE status = 'paid'
GROUP BY customer_id
HAVING SUM(total) > 100
ORDER BY lifetime DESC;`,
      ts: `const byCustomer = await prisma.order.groupBy({
  by: ["customerId"],
  where: { status: "paid" },       // -> WHERE
  _count: { _all: true },          // -> COUNT(*)
  _sum: { total: true },           // -> SUM(total)
  having: {
    total: { _sum: { gt: 100 } },  // -> HAVING SUM(total) > 100
  },
  orderBy: { _sum: { total: "desc" } },
});
// byCustomer[0]._sum.total, byCustomer[0]._count._all`,
      note:
        "where filters rows before grouping, having filters groups after — Prisma keeps SQL's WHERE/HAVING split, and fields in having must be in by or wrapped in an aggregate, exactly as Postgres requires.",
      leftLang: "sql",
    },
    {
      label: "The same query in Drizzle",
      intro:
        "Drizzle expresses the identical statement as a select chain — every clause you would write in SQL appears in the same order.",
      php: `SELECT customer_id,
       COUNT(*)   AS order_count,
       SUM(total) AS lifetime
FROM orders
WHERE status = 'paid'
GROUP BY customer_id
HAVING SUM(total) > 100
ORDER BY lifetime DESC;`,
      ts: `import { count, sum, eq, gt, desc } from "drizzle-orm";

const rows = await db
  .select({
    customerId: orders.customerId,
    orderCount: count(),           // number
    lifetime: sum(orders.total),   // string | null (numeric!)
  })
  .from(orders)
  .where(eq(orders.status, "paid"))
  .groupBy(orders.customerId)
  .having(({ lifetime }) => gt(lifetime, "100"))
  .orderBy(({ lifetime }) => desc(lifetime));`,
      note:
        "sum()/avg() return string | null because Postgres numeric/bigint can exceed JS number precision — count() maps to number for you; the .having() callback receives your named select fields.",
      leftLang: "sql",
    },
    {
      label: "Users with post counts",
      intro:
        "The classic dashboard card: every user with how many posts they have. In SQL it's a LEFT JOIN + GROUP BY; Prisma has a dedicated relation-count shape.",
      php: `SELECT u.id, u.name, COUNT(p.id) AS post_count
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
GROUP BY u.id, u.name
ORDER BY u.name;`,
      ts: `const users = await prisma.user.findMany({
  include: {
    _count: { select: { posts: true } },
  },
  orderBy: { name: "asc" },
});

for (const u of users) {
  console.log(u.name, u._count.posts);
}`,
      note:
        "One query, no N+1: Prisma folds the relation count into the row instead of firing a count per user — the mistake this replaces is looping users and calling posts.count() inside.",
      leftLang: "sql",
    },
  ],

  playground: {
    lang: "sql",
    intro:
      "Read-and-predict: seven orders, a WHERE, a GROUP BY, and a HAVING. Work out which customers survive the HAVING and what their aggregates are before revealing the result — this is exactly the SQL Prisma's groupBy and Drizzle's select/groupBy/having emit.",
    code: `CREATE TABLE orders (
  id       int,
  customer text,
  status   text,
  total    numeric(10,2)
);

INSERT INTO orders VALUES
  (1, 'alice', 'paid',     40.00),
  (2, 'alice', 'paid',     75.50),
  (3, 'alice', 'refunded', 200.00),
  (4, 'bob',   'paid',     120.00),
  (5, 'bob',   'paid',     15.25),
  (6, 'carol', 'paid',     99.99),
  (7, 'dave',  'pending',  500.00);

-- WHERE runs before grouping; HAVING runs after.
SELECT customer,
       COUNT(*)             AS orders,
       SUM(total)           AS lifetime,
       ROUND(AVG(total), 2) AS avg_order
FROM orders
WHERE status = 'paid'
GROUP BY customer
HAVING SUM(total) > 100
ORDER BY lifetime DESC;`,
    output: ` customer | orders | lifetime | avg_order
----------+--------+----------+-----------
 bob      |      2 |   135.25 |     67.63
 alice    |      2 |   115.50 |     57.75
(2 rows)

-- Why: WHERE status = 'paid' removes alice's 200.00 refund and
-- dave entirely before grouping. Carol groups to 99.99 but the
-- HAVING SUM(total) > 100 filters her group out afterwards.`,
  },

  keyPoints: [
    "Prisma has three aggregation levels: `count()` for a filtered COUNT, `aggregate()` for whole-table `_sum`/`_avg`/`_min`/`_max`/`_count`, and `groupBy()` for full GROUP BY statements.",
    "In `prisma.order.groupBy`, `by` is the GROUP BY list, `where` maps to SQL WHERE (before grouping) and `having` to SQL HAVING (after) — aggregate conditions nest like `total: { _sum: { gt: 100 } }`.",
    "For per-row relation counts, use `include: { _count: { select: { posts: true } } }` — one query, no per-row count loop.",
    "Drizzle's `count()`, `sum()`, `avg()` are select fields combined with `.groupBy()` and `.having()` — the chain reads almost token-for-token like the SQL it emits.",
    "Drizzle's `sum()`/`avg()` return `string | null` because Postgres numeric/bigint can exceed JS number precision; `count()` is mapped to `number` for you.",
    "Window functions, FILTER, GROUPING SETS and aggregate expressions are beyond Prisma's groupBy; Drizzle stretches further via `sql` fragments, and both hand off cleanly to raw SQL.",
  ],

  interview: [
    {
      q: "How do WHERE and HAVING map into Prisma's groupBy, and why does the distinction matter?",
      a: "Prisma keeps SQL's split intact: `where` filters rows before grouping and becomes the WHERE clause; `having` filters aggregated groups and becomes HAVING. That matters for both correctness and cost — a condition you can express in `where` runs before aggregation, over fewer rows, and can use an index; the same condition in `having` forces Postgres to group everything first and discard groups afterwards. I'd also point out that Prisma enforces the classic SQL rule at the type level: a field referenced in `having` must appear in `by` or be wrapped in an aggregate like `_sum` or `_avg`.",
    },
    {
      q: "Why does Drizzle's sum() return string | null when count() returns number?",
      a: "It's a precision decision, not an oversight. In Postgres, `SUM` over a `numeric` or `bigint` column can produce values outside JavaScript's safe integer range (2^53 − 1), so Drizzle hands you the driver's string representation and makes the lossy conversion your explicit choice — `Number(row.lifetime)` or a raw sql fragment with `.mapWith(Number)` when I know the domain is small. `count()` is safe to map to `number` in practice, so Drizzle does. The `null` case is SQL semantics too: aggregating zero rows yields NULL for SUM/AVG, which the type forces me to handle.",
    },
    {
      q: "A product page needs every user with their post count. How do you avoid the N+1 version?",
      a: "The N+1 version loops users and runs a count query per user — 1 + N round trips. In raw SQL I'd write one LEFT JOIN with GROUP BY, and both ORMs have a single-query equivalent: Prisma's `include: { _count: { select: { posts: true } } }` attaches `_count.posts` to each row, and in Drizzle I'd select `count(posts.id)` with a `leftJoin` and `groupBy(users.id)`. Because I can read the emitted SQL, I can verify with the query log or EXPLAIN that it's genuinely one statement rather than trusting the ORM's marketing.",
    },
    {
      q: "Where do the ORMs' aggregation APIs run out, and what do you do then?",
      a: "Prisma's `groupBy` covers plain aggregates over grouped columns but can't express window functions, FILTER clauses, GROUPING SETS/ROLLUP, or aggregates over computed expressions. Drizzle goes further because any select field can be a raw `sql` fragment — a `rank() over (...)` slots straight into the select object. Past that, both offer parameterised raw-SQL escape hatches (`$queryRaw`, `db.execute`), and for a serious report query I'd rather write one well-shaped SQL statement I can EXPLAIN than contort an ORM API into emitting something I can't predict.",
    },
  ],

  quiz: [
    {
      question:
        "In prisma.order.groupBy, what is the difference between `where` and `having`?",
      options: [
        "They are interchangeable; Prisma optimises them to the same clause",
        "`where` filters rows before grouping (SQL WHERE); `having` filters groups after aggregation (SQL HAVING)",
        "`where` only accepts indexed columns; `having` accepts any column",
        "`having` runs in JavaScript after the rows return; `where` runs in the database",
      ],
      answerIndex: 1,
      explain:
        "Prisma preserves SQL semantics exactly: where becomes the WHERE clause and runs pre-aggregation; having becomes HAVING and filters the grouped results. Both run in the database — nothing is post-filtered in JS.",
    },
    {
      question: "What type does Drizzle's sum(orders.total) produce, and why?",
      options: [
        "number — Drizzle casts every aggregate for convenience",
        "bigint — Postgres always sums into bigint",
        "string | null — numeric/bigint sums can exceed JS number precision, and summing zero rows yields NULL",
        "Decimal — Drizzle ships its own arbitrary-precision class",
      ],
      answerIndex: 2,
      explain:
        "Postgres numeric and bigint results can be larger than Number.MAX_SAFE_INTEGER, so Drizzle returns the string form and leaves conversion to you; the null half of the type reflects SQL's rule that SUM over zero rows is NULL. count() by contrast is mapped to number.",
    },
    {
      question:
        "What is the idiomatic Prisma way to fetch users each with a count of their posts, in a single query?",
      options: [
        "Loop over findMany results and call prisma.post.count per user",
        "prisma.user.findMany({ include: { _count: { select: { posts: true } } } })",
        "prisma.user.groupBy({ by: ['id'], _count: { posts: true } })",
        "prisma.$transaction of one count query per user",
      ],
      answerIndex: 1,
      explain:
        "The _count relation selection folds the aggregate into each returned row in one statement. The per-user count loop is the textbook N+1, and groupBy aggregates scalar columns of the orders/users table — it doesn't count relations.",
    },
    {
      question:
        "Which of these can Prisma's groupBy NOT express, forcing raw SQL or a different tool?",
      options: [
        "Ordering groups by an aggregate like _sum",
        "A HAVING condition on SUM of a column",
        "Grouping by two columns at once",
        "A window function such as rank() OVER (PARTITION BY ...)",
      ],
      answerIndex: 3,
      explain:
        "groupBy handles multi-column by, aggregate orderBy, and aggregate having conditions. Window functions are outside its vocabulary entirely — in Drizzle you can embed one as a sql`` select field, and in Prisma you reach for $queryRaw.",
    },
  ],
};

export default lesson;
