import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "select-include-overfetching",
  title: "select, include, and the Over-fetching Problem",
  part: "Queries & CRUD",
  estMinutes: 12,
  summary:
    "ORMs default to SELECT * — Prisma's select/omit and Drizzle's column picks let you fetch exactly the columns you need, and the result type narrows to match.",

  concept: `
You spent decades telling juniors not to write \`SELECT *\`. Then you open an
ORM tutorial and the very first query — \`prisma.user.findMany()\` — is exactly
that: every scalar column of every matching row. Over-fetching is the ORM
default, and knowing when it hurts (and how to turn it off) is where your SQL
instincts translate directly into typed TypeScript.

### Prisma: select, include, omit

Prisma gives you three field-shaping options on every read:

- **\`select\`** is *exclusive*: you get only the fields you name — like
  writing the column list yourself.
- **\`include\`** is *additive*: all scalar fields **plus** the named
  relations. You cannot use \`select\` and \`include\` at the same level;
  to trim columns while loading a relation, nest a \`select\` inside
  \`include\` (or select the relation inside a top-level \`select\`).
- **\`omit\`** is *subtractive*: everything except the named fields — the
  typed version of the \`unset($row['password_hash'])\` loop.

\`\`\`ts
const users = await prisma.user.findMany({
  where: { active: true },
  select: { id: true, email: true },
});
// users: { id: number; email: string }[]
users[0].bio; // compile error — 'bio' was not selected
\`\`\`

That last line is the payoff of a typed data layer. In PDO, forgetting that
you trimmed the column list means \`$row['bio']\` is silently \`null\`-ish at
runtime. In Prisma the result type *is derived from the query*: narrow the
query and the type narrows with it.

### Drizzle: pass the columns you want

Drizzle's query builder mirrors SQL even more directly. \`db.select()\` with
no argument is \`SELECT *\` (well, \`SELECT\` every mapped column);
\`db.select({ ... })\` with an object is your column list, keys become result
property names — aliases for free:

\`\`\`ts
const rows = await db
  .select({ id: users.id, email: users.email })
  .from(users);
// SQL: select "id", "email" from "users"
// rows: { id: number; email: string }[]
\`\`\`

The relational query API uses a \`columns\` option instead — \`true\` to
include, \`false\` to exclude:

\`\`\`ts
await db.query.users.findMany({
  columns: { id: true, email: true },
});
\`\`\`

### When over-fetching actually matters

Be ready to argue this with numbers, not superstition:

- **Wide columns multiply.** A listing page that needs \`id\` and \`title\`
  but drags a 20 KB \`body\` text or \`jsonb\` blob along fetches megabytes
  for a page that renders a few hundred bytes. Postgres must detoast those
  values, serialize them, and your app must parse and hydrate them — per row.
- **Row count is the multiplier.** 10,000 rows × 8 KB of unused columns is
  80 MB through the pool, per request.
- **\`SELECT *\` forbids index-only scans.** A query covered by an index on
  \`(email) INCLUDE (id)\` can skip the heap entirely — but only if you ask
  for indexed columns alone. Ask for everything and every row costs a heap
  fetch.

Equally important: for a 40-row admin table, none of this matters. The
default is fine until a column is wide or a row count is large — the skill
is knowing which queries deserve the narrowing.
`,

  comparisons: [
    {
      label: "The column list you always wrote",
      intro:
        "Fetch id and email for active users. The SQL version is second nature; Prisma's select produces the same statement — and a result type to match.",
      php: `-- what you write in psql / PDO
SELECT id, email
FROM users
WHERE active = true;

-- result: rows with exactly two columns.
-- Nothing stops app code from reading
-- $row['bio'] anyway — it is just missing.`,
      ts: `// Prisma: select is your column list
const users = await prisma.user.findMany({
  where: { active: true },
  select: { id: true, email: true },
});
// SQL: SELECT "id", "email" FROM "users"
//      WHERE "active" = $1

// users: { id: number; email: string }[]
users[0].bio; // compile error: not selected`,
      note:
        "Same SQL either way — the difference is that Prisma derives the result type from the select, so reading an unselected column fails at compile time instead of returning undefined.",
      leftLang: "sql",
    },
    {
      label: "fetchAll everything vs a narrowed Drizzle select",
      intro:
        "A listing page needs id and title, but the posts table has a wide body column. The PDO habit fetches it all; Drizzle's select object is the column list, typed.",
      php: `<?php
// SELECT * drags body (20 KB avg) along
// for a page that shows titles only.
$stmt = $pdo->query('SELECT * FROM posts');
$posts = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($posts as $post) {
    // only id + title are ever used
    printf("#%d %s\\n", $post['id'], $post['title']);
}`,
      ts: `// src/db/queries.ts
import { db } from "./client";
import { posts } from "./schema";

const rows = await db
  .select({ id: posts.id, title: posts.title })
  .from(posts);
// SQL: select "id", "title" from "posts"

for (const post of rows) {
  console.log(\`#\${post.id} \${post.title}\`);
  // post.body does not exist on this type
}`,
      note:
        "The Drizzle select object doubles as an alias map (keys become property names), and the inferred row type contains only what you picked — the wide body column never leaves Postgres.",
    },
    {
      label: "Hiding a column: unset() vs omit",
      intro:
        "Return users without their password hash. PHP strips the field after fetching it; Prisma's omit never selects it in the first place.",
      php: `<?php
$stmt = $pdo->query('SELECT * FROM users');
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

// hash was fetched, then discarded — and
// one forgotten unset() is a security bug
foreach ($users as &$user) {
    unset($user['password_hash']);
}
unset($user);

echo json_encode($users);`,
      ts: `// omit = everything except these fields
const users = await prisma.user.findMany({
  omit: { passwordHash: true },
});
// passwordHash is excluded from the SQL
// column list AND from the result type:
users[0].passwordHash; // compile error

// Need it back for one auth query?
// omit: { passwordHash: false } re-adds it.`,
      note:
        "omit is subtractive where select is exclusive — and unlike the PHP unset() loop, the column is excluded from the query itself, so the hash never crosses the wire.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A pick() helper that does what select/columns do in both ORMs: the generic return type Pick<T, K> narrows to exactly the keys requested. Predict the byte counts, then uncomment the slim[0].bio line to watch the type system object.",
    code: `// Over-fetching, measured: pick() narrows the type AND the payload.

interface User {
  id: number;
  email: string;
  name: string;
  bio: string;                                 // wide text column
  settings: { theme: string; locale: string }; // jsonb column
}

const bio = 'Started on PHP 3 in 1999. Ask me about EXPLAIN plans. '.repeat(10);

const users: User[] = [
  { id: 1, email: 'ana@example.com', name: 'Ana', bio, settings: { theme: 'dark', locale: 'en_AU' } },
  { id: 2, email: 'ben@example.com', name: 'Ben', bio, settings: { theme: 'light', locale: 'de_DE' } },
  { id: 3, email: 'kim@example.com', name: 'Kim', bio, settings: { theme: 'dark', locale: 'ja_JP' } },
];

// What every typed ORM's select/columns option does: the RETURN TYPE
// narrows to exactly the keys you asked for.
function pick<T extends object, K extends keyof T>(rows: T[], keys: K[]): Pick<T, K>[] {
  return rows.map((row) => {
    const slim = {} as Pick<T, K>;
    for (const key of keys) slim[key] = row[key];
    return slim;
  });
}

const slim = pick(users, ['id', 'email']);
console.log(slim);

// The narrowed type is enforced, not advisory. Uncomment to see:
// slim[0].bio  // Property 'bio' does not exist on type 'Pick<User, "id" | "email">'

const fullBytes = JSON.stringify(users).length;
const slimBytes = JSON.stringify(slim).length;
console.log(\`SELECT *        -> \${fullBytes} bytes\`);
console.log(\`SELECT id,email -> \${slimBytes} bytes\`);
console.log(\`saved \${Math.round((1 - slimBytes / fullBytes) * 100)}% of the payload\`);`,
  },

  keyPoints: [
    "ORM defaults are `SELECT *` (all scalar columns): `prisma.user.findMany()` and `db.select().from(users)` both fetch everything.",
    "Prisma `select` is exclusive (only these fields), `include` is additive (all scalars + relations), `omit` is subtractive — and `select`/`include` cannot share a level.",
    "Drizzle narrows with an object: `db.select({ id: users.id })` in the query builder, `columns: { id: true }` in `db.query` relational queries.",
    "The result type is derived from the query — reading an unselected column is a compile error, not a runtime `undefined`.",
    "Over-fetching hurts when wide `text`/`jsonb` columns multiply across large row counts, and `SELECT *` forces heap fetches where a covering index could serve an index-only scan.",
    "Prisma's `omit` (e.g. `passwordHash`) beats the PHP `unset()` loop: the column never even appears in the SQL, so it can't leak.",
  ],

  interview: [
    {
      q: "ORMs select every column by default. When does that actually matter, and what do you do about it?",
      a: "It matters when the unused data is big: wide `text` or `jsonb` columns on listing queries, multiplied by row count — 10,000 rows dragging an 8 KB blob each is 80 MB per request that Postgres must detoast, the wire must carry, and the app must hydrate. It also blocks index-only scans: a query for `(email, id)` can be served entirely from a covering index, but `SELECT *` forces a heap fetch per row. The fix is one option away — `select: { id: true, email: true }` in Prisma or `db.select({ id: users.id, email: users.email })` in Drizzle — and the result type narrows to match, so the change is refactor-safe. That said, I profile before micro-optimising: for a small admin table, the default is perfectly fine.",
    },
    {
      q: "What's the difference between select, include, and omit in Prisma?",
      a: "`select` is exclusive — you name the exact fields, like writing the column list in SQL, and you get nothing else. `include` is additive — all scalar fields of the model plus the relations you name; it exists because relations are never loaded by default. `omit` is subtractive — everything except the named fields, the right tool for structurally sensitive columns like a password hash, because the column is excluded from the generated SQL itself, not stripped afterwards like a PHP `unset()` loop. One rule trips people up: `select` and `include` can't be used at the same level of a query — to trim columns and load a relation, you nest the relation (with its own `select`) inside a single top-level `select`.",
    },
    {
      q: "How does the typed result of a narrowed query improve on what you had with PDO?",
      a: "With PDO, the shape of `fetchAll()`'s arrays lives only in my head — if I trim the column list, every `$row['bio']` elsewhere silently becomes a null-ish read. In Prisma and Drizzle, the compiler derives the result type from the query: `select: { id: true, email: true }` yields `{ id: number; email: string }[]`, and touching `.bio` is a compile error. That makes narrowing cheap to do and safe to change — I can tighten a hot query's column list and the build tells me every call site that depended on the removed field, which is exactly the feedback loop that made `SELECT *` feel 'safer' in PHP.",
    },
  ],

  quiz: [
    {
      question:
        "In Prisma, you want users' id and email plus their posts' titles — nothing else. Which query shape is valid?",
      options: [
        "findMany({ select: { id: true, email: true }, include: { posts: { select: { title: true } } } })",
        "findMany({ select: { id: true, email: true, posts: { select: { title: true } } } })",
        "findMany({ include: { id: true, email: true, posts: true } })",
        "findMany({ omit: { posts: false } })",
      ],
      answerIndex: 1,
      explain:
        "select and include cannot appear at the same level — Prisma throws. Instead, relations can be selected inside a top-level select, with their own nested select to trim the relation's columns. include only takes relation names, not scalar fields.",
    },
    {
      question:
        "Why can SELECT * prevent Postgres from using an index-only scan?",
      options: [
        "Postgres disables all indexes when * is used",
        "An index-only scan can serve only columns stored in the index; requesting all columns forces a heap fetch per row",
        "SELECT * bypasses the query planner entirely",
        "Index-only scans work only on primary keys",
      ],
      answerIndex: 1,
      explain:
        "An index-only scan answers the query from the index alone (visibility map permitting). That's only possible when every requested column lives in the index — e.g. (email) INCLUDE (id). SELECT * requests columns the index doesn't hold, so every row needs a trip to the heap.",
    },
    {
      question:
        "What does Drizzle's db.select({ userId: users.id }).from(users) return for each row?",
      options: [
        "{ id: number } — the key is taken from the column name",
        "{ userId: number } — object keys become result property names, acting as aliases",
        "An array [number] since only one column was picked",
        "The full users row, with userId added",
      ],
      answerIndex: 1,
      explain:
        "The selection object's keys name the result properties — it's a typed column list with aliasing built in, emitting select \"id\" from \"users\" and returning { userId: number }[].",
    },
    {
      question:
        "Your API keeps leaking password_hash. Which approach removes it most safely?",
      options: [
        "Loop over results and unset the field before json_encode, like in PHP",
        "Prisma omit: { passwordHash: true } — excluded from the SQL and the result type",
        "Rename the column so serializers skip it",
        "Rely on include, which never returns scalar fields",
      ],
      answerIndex: 1,
      explain:
        "omit removes the column from the generated SELECT list and from the TypeScript result type, so it neither crosses the wire nor compiles if referenced. Post-fetch stripping (the unset() loop) works until someone forgets it on one endpoint.",
    },
  ],
};

export default lesson;
