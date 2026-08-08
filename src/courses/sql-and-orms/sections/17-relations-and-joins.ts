import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "relations-and-joins",
  title: "Loading Relations: include, with, and Real Joins",
  part: "Queries & CRUD",
  estMinutes: 13,
  summary:
    "Three ways to load a user with their posts — Prisma include, Drizzle's relational `with`, and an explicit leftJoin — and the flat-rows-vs-nested-objects shift that separates ORMs from PDO fetch loops.",

  concept: `
In PDO, a JOIN gives you what SQL gives you: **flat rows**. One row per
user-post pair, user columns duplicated down the left side, and a grouping
loop you wrote so many times you could type it asleep. ORMs exist largely to
hand you **nested objects** instead — \`user.posts\` as an array — and each
tool does it differently. Knowing *what SQL actually runs* is your edge here.

### Prisma: include → nested objects

\`\`\`ts
const users = await prisma.user.findMany({
  include: { posts: true },
});
// users[0].posts: Post[] — nested, typed, ready to use
\`\`\`

On Postgres, Prisma's default relation load strategy is \`join\`: **one** SQL
statement using \`LEFT JOIN LATERAL\` plus JSON aggregation
(\`json_build_object\`, \`json_agg\`), so the nesting is built *inside
Postgres* and no duplicated user columns cross the wire. You can opt into the
older behaviour per query with \`relationLoadStrategy: "query"\`, which runs
one query per table and joins in the app — occasionally cheaper for huge
result sets, since JSON assembly costs the database CPU.

### Drizzle relational queries: with → nested objects

Drizzle's query-builder core stays flat, but its relational query API (RQB)
gives Prisma-style nesting. You describe relations once with the
\`relations()\` helper, pass the schema to \`drizzle({ client, schema })\`,
then:

\`\`\`ts
// src/db/schema.ts
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

// anywhere
const result = await db.query.users.findMany({
  with: { posts: true },
});
// result[0].posts — nested, exactly one SQL query
\`\`\`

Drizzle RQB always generates **a single SQL statement**, also built on JSON
aggregation — a deliberate design goal so you never pay per-row round trips
or blow up serverless connection counts.

### Drizzle joins: flat rows, like the SQL you know

\`\`\`ts
const rows = await db
  .select()
  .from(users)
  .leftJoin(posts, eq(posts.authorId, users.id));
// rows: { users: User; posts: Post | null }[]
\`\`\`

This is your PDO mental model, typed: one element per joined row, keyed by
table. Because it's a LEFT JOIN, \`posts\` is \`Post | null\` — the type
system encodes the join semantics you already know. You group the nesting
yourself, which is exactly the right tool when you *want* row-shaped data:
reports, aggregations, or joins that don't follow declared relations.

### The mental shift

The question to ask of any relation-loading API is: **who builds the
nesting, and how many statements run?** PDO: you build it, one statement.
Prisma \`include\` / Drizzle \`with\`: Postgres builds it via JSON
aggregation, one statement. Drizzle \`leftJoin\`: you build it, one
statement. Nobody respectable does N+1 round trips here — but you should be
able to say *why* on a whiteboard.
`,

  comparisons: [
    {
      label: "User + posts: the grouping loop vs include",
      intro:
        "Fetch every user with their posts as nested arrays. PHP joins flat and groups by hand; Prisma returns the nested shape directly.",
      php: `<?php
$sql = 'SELECT u.id, u.name, p.id AS post_id,
               p.title
        FROM users u
        LEFT JOIN posts p ON p.author_id = u.id
        ORDER BY u.id';
$rows = $pdo->query($sql)->fetchAll();

$users = [];
foreach ($rows as $row) {
    $id = $row['id'];
    $users[$id] ??= [
        'id' => $id,
        'name' => $row['name'],
        'posts' => [],
    ];
    if ($row['post_id'] !== null) {
        $users[$id]['posts'][] = [
            'id' => $row['post_id'],
            'title' => $row['title'],
        ];
    }
}`,
      ts: `// Prisma: the nesting arrives built
const users = await prisma.user.findMany({
  include: {
    posts: { select: { id: true, title: true } },
  },
});

// users[0].posts: { id: number; title: string }[]
// Under the hood on Postgres (join strategy,
// the default): ONE statement using
// LEFT JOIN LATERAL + json_agg, so the
// grouping happens inside the database.

for (const user of users) {
  console.log(user.name, user.posts.length);
}`,
      note:
        "Same single-statement philosophy — but Prisma pushes your PHP grouping loop into Postgres as JSON aggregation, so user columns aren't duplicated per post row on the wire.",
    },
    {
      label: "Raw LEFT JOIN vs Drizzle leftJoin",
      intro:
        "The explicit-join route: both sides return one flat row per user-post pair. Drizzle just types the NULL half of the LEFT JOIN for you.",
      php: `-- flat rows, one per user-post pair
SELECT u.*, p.*
FROM users u
LEFT JOIN posts p ON p.author_id = u.id;

--  id | name |  id  | title
-- ----+------+------+---------------
--   1 | Ana  |  11  | Typed ORMs
--   1 | Ana  |  12  | Keyset pages
--   3 | Kim  | NULL | NULL
-- (Kim has no posts: NULLs appear,
--  and your code must remember that)`,
      ts: `import { eq } from "drizzle-orm";
import { db } from "./client";
import { users, posts } from "./schema";

const rows = await db
  .select()
  .from(users)
  .leftJoin(posts, eq(posts.authorId, users.id));

// rows: { users: User; posts: Post | null }[]
for (const row of rows) {
  // row.posts is Post | null — the compiler
  // forces the NULL check the LEFT JOIN implies
  console.log(row.users.name, row.posts?.title);
}`,
      note:
        "Drizzle returns flat rows keyed by table name, and encodes LEFT JOIN semantics in the type: posts is Post | null, so forgetting the no-posts case is a compile error instead of a production notice.",
      leftLang: "sql",
    },
    {
      label: "The SQL your ORM writes: json_agg vs with",
      intro:
        "How one statement can return nested data: JSON aggregation. On the left, the hand-written version; on the right, Drizzle's relational query that generates the same idea for you.",
      php: `-- nested result from ONE statement
SELECT
  u.id,
  u.name,
  COALESCE(
    json_agg(
      json_build_object(
        'id', p.id, 'title', p.title
      )
    ) FILTER (WHERE p.id IS NOT NULL),
    '[]'
  ) AS posts
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
GROUP BY u.id;`,
      ts: `// Drizzle RQB: one SQL statement, nested out
// (relations declared once via relations())
const result = await db.query.users.findMany({
  with: {
    posts: { columns: { id: true, title: true } },
  },
});

// result: {
//   id: number; name: string; email: string;
//   posts: { id: number; title: string }[];
// }[]
// Drizzle RQB always emits exactly one query,
// built on JSON aggregation like the SQL at left.`,
      note:
        "You could write that json_agg query in PDO too — the ORMs' contribution is generating it from a declarative 'with'/'include' and typing the nested result, not inventing the technique.",
      leftLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The transformation every ORM performs: flat LEFT JOIN rows in, nested user.posts objects out. Note how Kim's NULL post columns (no posts) must be handled — predict the nested output before running.",
    code: `// What include / with does for you: flat JOIN rows -> nested objects.

interface FlatRow {
  userId: number;
  userName: string;
  postId: number | null; // NULL when the LEFT JOIN found no post
  postTitle: string | null;
}

// Exactly what PDO::fetchAll() hands you for:
// SELECT u.id, u.name, p.id, p.title FROM users u LEFT JOIN posts p ON ...
const flatRows: FlatRow[] = [
  { userId: 1, userName: 'Ana', postId: 11, postTitle: 'Typed ORMs' },
  { userId: 1, userName: 'Ana', postId: 12, postTitle: 'Keyset pagination' },
  { userId: 2, userName: 'Ben', postId: 21, postTitle: 'EXPLAIN basics' },
  { userId: 3, userName: 'Kim', postId: null, postTitle: null }, // Kim has no posts
];

console.log('flat rows from the driver:', flatRows.length);

interface UserWithPosts {
  id: number;
  name: string;
  posts: { id: number; title: string }[];
}

// The grouping loop you have written in PHP a hundred times, typed:
const byId = new Map<number, UserWithPosts>();
for (const row of flatRows) {
  let user = byId.get(row.userId);
  if (!user) {
    user = { id: row.userId, name: row.userName, posts: [] };
    byId.set(row.userId, user);
  }
  if (row.postId !== null && row.postTitle !== null) {
    user.posts.push({ id: row.postId, title: row.postTitle });
  }
}

const nested = [...byId.values()];
console.log(JSON.stringify(nested, null, 2));
console.log(\`\${flatRows.length} flat rows -> \${nested.length} nested users\`);`,
  },

  keyPoints: [
    "Prisma `include: { posts: true }` returns nested objects; on Postgres its default `join` strategy runs ONE statement with `LEFT JOIN LATERAL` + JSON aggregation (`relationLoadStrategy: \"query\"` opts into one-query-per-table).",
    "Drizzle relational queries (`db.query.users.findMany({ with: { posts: true } })`) need relations declared via `relations()` and always emit exactly one SQL statement.",
    "Drizzle's explicit `.leftJoin()` returns flat rows keyed by table — `{ users: User; posts: Post | null }[]` — the PDO mental model with LEFT JOIN nullability enforced by the type system.",
    "The grouping loop you wrote in PHP hasn't disappeared: it either runs inside Postgres as `json_agg` or in the ORM/your code — know which, and say so in interviews.",
    "Choose nested APIs (`include`/`with`) for entity-shaped data, explicit joins for row-shaped data like reports and aggregations.",
    "The interview question behind every relation API: who builds the nesting, and how many statements run?",
  ],

  interview: [
    {
      q: "What SQL does Prisma's include actually generate?",
      a: "On Postgres, the default relation load strategy is `join`: one statement per query, using `LEFT JOIN LATERAL` against the related table and JSON aggregation — `json_build_object` and `json_agg` — so Postgres itself assembles the nested arrays and no duplicated parent columns cross the wire. There's a per-query escape hatch, `relationLoadStrategy: \"query\"`, which instead runs one query per table and merges in the application — still a constant number of queries, never N+1. I'd reach for `query` only after profiling shows JSON assembly is loading the database server on a very large result set; for most workloads the lateral-join strategy wins because it's one round trip and less redundant data.",
    },
    {
      q: "Drizzle gives you both db.query with `with` and an explicit .leftJoin(). When do you use which?",
      a: "`with` is for entity-shaped data: it returns nested typed objects, requires relations declared once via the `relations()` helper, and always compiles to a single SQL statement built on JSON aggregation. `.leftJoin()` is the SQL I've written for 25 years, typed: flat rows keyed by table name, `{ users: User; posts: Post | null }[]`, where the `| null` encodes the LEFT JOIN's missing-match case so the compiler forces me to handle it. I use joins when the output is genuinely row-shaped — reports, aggregates, ad-hoc joins that don't follow declared relations — and `with` when I'm loading an entity graph to render or serialize. The nice property is they're the same database cost: one statement either way.",
    },
    {
      q: "Coming from PDO, what was the biggest mental shift in how ORMs load related data?",
      a: "That flat rows versus nested objects is a *transformation with a location*, not magic. In PDO the driver hands you one row per user-post pair and you write the grouping loop keyed on user id. ORMs still need that exact transformation — the shift is that Prisma and Drizzle's relational APIs push it into Postgres as `json_agg` over a lateral join, one statement, nesting built server-side. Once I saw the generated SQL, the ORM stopped being a black box: `include` and `with` are code generators for a query pattern I could write by hand, plus derived TypeScript types for the nested result. That also tells me when *not* to use them — when I want row-shaped output, I use an explicit join like always.",
    },
  ],

  quiz: [
    {
      question:
        "On Postgres, what does Prisma's default strategy for include: { posts: true } emit?",
      options: [
        "One query for users, then one query per user for posts",
        "A single statement using LEFT JOIN LATERAL and JSON aggregation, nesting built in the database",
        "Two statements always: one per table, merged in the app",
        "A stored procedure created at migrate time",
      ],
      answerIndex: 1,
      explain:
        "The default join strategy generates one SQL statement with LEFT JOIN LATERAL plus json_agg/json_build_object, so Postgres returns the nested arrays directly. relationLoadStrategy: \"query\" switches to one-query-per-table merged in the app — but never one query per row.",
    },
    {
      question:
        "What is the element type of rows from db.select().from(users).leftJoin(posts, eq(posts.authorId, users.id))?",
      options: [
        "{ ...User, posts: Post[] } — nested automatically",
        "{ users: User; posts: Post | null } — flat, keyed by table, with LEFT JOIN nullability in the type",
        "[User, Post] tuples",
        "User rows only; joined columns need a raw sql`` selection",
      ],
      answerIndex: 1,
      explain:
        "Explicit Drizzle joins stay flat like SQL: one element per joined row, keyed by table name. Because it's a LEFT JOIN, the posts side is Post | null — the compiler makes you handle users without posts.",
    },
    {
      question:
        "What must exist before db.query.users.findMany({ with: { posts: true } }) works in Drizzle?",
      options: [
        "A foreign key constraint in the database — Drizzle introspects it at runtime",
        "Relations declared with the relations() helper and the schema passed to drizzle({ client, schema })",
        "A generated client from drizzle-kit generate",
        "Nothing — with works on any two tables",
      ],
      answerIndex: 1,
      explain:
        "Drizzle's relational query API is driven by application-level relations() declarations handed to drizzle() via the schema — it doesn't read FKs at runtime, and drizzle-kit generates migrations, not a query client.",
    },
    {
      question:
        "Your endpoint needs a report of revenue per user — one row per user with a SUM. Which tool fits best?",
      options: [
        "Prisma include with a big result and app-side summing",
        "Drizzle db.query with `with` on every relation",
        "An explicit join/aggregation query returning flat rows — the data is row-shaped, not entity-shaped",
        "N queries, one per user, each with its own SUM",
      ],
      answerIndex: 2,
      explain:
        "include/with shine for entity graphs. A per-user SUM is row-shaped output — an explicit GROUP BY join (Drizzle's query builder, or raw SQL) returns exactly the report rows without hydrating entities you'd immediately reduce.",
    },
  ],
};

export default lesson;
