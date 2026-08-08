import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "reading-rows",
  title: "Reading Rows with Full Inference",
  part: "Queries & CRUD",
  estMinutes: 12,
  summary:
    "Prisma's findMany/findUnique/findFirst and Drizzle's select().from().where() both emit the parameterised SELECTs you'd write by hand — with result types inferred from the query itself, so narrowing the query narrows the type.",

  concept: `
Every read you do in these ORMs compiles to a \`SELECT\` you could have
written yourself — and both libraries **only** speak in parameterised
queries. The prepared-statement discipline you enforced manually with PDO
(\`prepare\`, \`execute([$id])\`, never interpolate) is not a best practice
here; it is the only mode that exists. String-concatenated SQL injection is
unrepresentable in either API.

### Prisma's read verbs

\`\`\`ts
const users = await prisma.user.findMany({
  where: { plan: 'pro' },
  orderBy: { createdAt: 'desc' },
  take: 20,
});
\`\`\`

emits (with Postgres):

\`\`\`sql
SELECT "id", "email", "plan", "created_at" FROM "User"
WHERE "plan" = $1 ORDER BY "created_at" DESC LIMIT $2
\`\`\`

Note the explicit column list — Prisma never emits \`SELECT *\`; it selects
every scalar column of the model by default (that default is also its
over-fetching trap; \`select\` narrows it). The verb family:

- \`findMany\` → always an array, possibly empty.
- \`findUnique\` → \`T | null\`; the \`where\` **must** target a unique
  column or unique index — the compiler rejects \`{ plan: 'pro' }\` here.
- \`findFirst\` → \`T | null\`; any filter plus \`orderBy\`, i.e.
  \`... LIMIT 1\`.
- \`findUniqueOrThrow\` / \`findFirstOrThrow\` → \`T\`, throwing a known
  error when no row matches — for code paths where absence is a bug, not a
  branch.

That \`T | null\` is doing real work: PDO's \`fetch()\` returns \`false\` on
miss and nothing forces you to check. Here the type system refuses
\`user.email\` until you've handled \`null\`.

### Narrow the query, narrow the type

\`\`\`ts
const rows = await prisma.user.findMany({
  select: { id: true, email: true },
});
// rows: { id: number; email: string }[]  — nothing else exists
\`\`\`

The return type is computed **from the query object**, not from a fixed
model type. Add a field to \`select\` and the type grows; remove one and
every downstream access of it fails the build. No DTO classes, no casts —
the query is the contract.

### Drizzle: SQL you already know, as typed code

\`\`\`ts
import { eq } from 'drizzle-orm';

const pros = await db.select().from(users)
  .where(eq(users.plan, 'pro'))
  .orderBy(users.createdAt).limit(20);
// SQL: select "id", "email", ... from "users"
//      where "users"."plan" = $1 order by "created_at" limit $2
\`\`\`

The clause order is SQL's own; if you can write the query, you can write the
Drizzle. Partial selects are an object of columns —
\`db.select({ email: users.email }).from(users)\` — and again the result
type follows the projection.

Drizzle's second read API is the **relational query builder**, closer in
feel to Prisma:

\`\`\`ts
const rows = await db.query.users.findMany({
  where: eq(users.plan, 'pro'),
  with: { posts: true },   // typed join via relations()
});
\`\`\`

Use \`select\` when you're thinking in SQL, \`db.query\` when you're
fetching object graphs. Both are typed end-to-end; both emit SQL you can log
and read.
`,

  comparisons: [
    {
      label: "Fetch a filtered list: PDO vs Prisma findMany",
      intro:
        "Load the 20 newest pro-plan users. Both run essentially the same parameterised SELECT; the difference is who wrote the SQL and what the language knows about the rows.",
      php: `<?php
$stmt = $pdo->prepare(
  'SELECT id, email, plan, created_at FROM users
    WHERE plan = ?
    ORDER BY created_at DESC LIMIT 20'
);
$stmt->execute(['pro']);
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($users as $row) {
    // array<string, mixed> — $row['emial'] is a
    // silent null, dates are strings, ints may be too.
    echo $row['email'], "\\n";
}`,
      ts: `// src/reports/pro-users.ts
const users = await prisma.user.findMany({
  where: { plan: 'pro' },
  orderBy: { createdAt: 'desc' },
  take: 20,
});
// users: { id: number; email: string; plan: string;
//          createdAt: Date }[]
// Emitted SQL (parameterised, explicit columns):
//   SELECT "id","email","plan","created_at" FROM "User"
//   WHERE "plan" = $1 ORDER BY "created_at" DESC LIMIT $2

for (const u of users) {
  console.log(u.email, u.createdAt.getFullYear());
}`,
      note: "Same query, but the result is a checked type: createdAt is a real Date, and a typo'd property is a compile error. Parameterisation isn't a discipline you maintain — it's the only thing the API can emit.",
    },
    {
      label: "The SELECT you'd write vs Drizzle's builder",
      intro:
        "One query, two spellings. Drizzle keeps SQL's shape — from, where, order by, limit — as chained typed calls, with operators imported as functions.",
      php: `SELECT id, email
  FROM users
 WHERE plan = 'pro'
   AND deleted_at IS NULL
 ORDER BY created_at DESC
 LIMIT 20;`,
      ts: `import { and, desc, eq, isNull } from 'drizzle-orm';

const rows = await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .where(and(eq(users.plan, 'pro'), isNull(users.deletedAt)))
  .orderBy(desc(users.createdAt))
  .limit(20);

// rows: { id: number; email: string }[]
// — the type follows the projection: only what you
//   selected exists, everything else is a build error.`,
      note: "A near 1:1 transliteration — IS NULL becomes isNull(), the column list becomes the select object. Values still travel as $1, $2 bind parameters, never interpolated.",
      leftLang: "sql",
    },
    {
      label: "Row-not-found: false vs null vs throw",
      intro:
        "Load one user by primary key when the row might not exist. PDO hands back false and hopes you check; the typed APIs make you choose a semantics up front.",
      php: `<?php
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

// fetch() returns false on a miss — and nothing stops
// the next line when you forget to check:
echo $user['email'];
// PHP warning, blank output, ticket filed three weeks later.`,
      ts: `// Absence is a normal branch? -> T | null
const user = await prisma.user.findUnique({
  where: { id },          // must be @id or @unique
});
// user.email        ✗ 'user' is possibly 'null'
if (user) console.log(user.email);   // ✓ narrowed

// Absence is a bug (e.g. row id from a session)? -> throw
const me = await prisma.user.findUniqueOrThrow({
  where: { id: sessionUserId },
});
console.log(me.email);  // me: User — no null branch exists`,
      note: "findUnique only accepts unique columns in where — that constraint is checked at compile time. The OrThrow variants trade the null branch for a catchable known error; pick per call site.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of the read API over an in-memory 'table': findMany always returns an array, findFirst returns T | null, findUniqueOrThrow removes the null branch by throwing. Predict the four logged lines, then run it.",
    code: `// The read-verb semantics, modelled in plain TypeScript.

interface User {
  id: number;
  email: string;
  plan: 'free' | 'pro';
}

const usersTable: User[] = [
  { id: 1, email: 'ana@example.com', plan: 'pro' },
  { id: 2, email: 'ben@example.com', plan: 'free' },
  { id: 3, email: 'cho@example.com', plan: 'pro' },
];

// findMany: SELECT ... WHERE — always an array, maybe empty.
function findMany(where: Partial<User>): User[] {
  const keys = Object.keys(where) as (keyof User)[];
  return usersTable.filter((u) => keys.every((k) => u[k] === where[k]));
}

// findFirst: ... LIMIT 1 — the type is User | null, so callers
// MUST handle the miss before touching a property.
function findFirst(where: Partial<User>): User | null {
  return findMany(where)[0] ?? null;
}

// findUniqueOrThrow: absence is a bug — no null branch, just throw.
function findUniqueOrThrow(where: { id: number }): User {
  const row = findFirst(where);
  if (!row) throw new Error(\`No User found (id=\${where.id})\`);
  return row;
}

const pros = findMany({ plan: 'pro' });
console.log('pro users:', pros.map((u) => u.email).join(', '));

const missing = findFirst({ email: 'zoe@example.com' });
console.log('findFirst miss:', missing); // null — check it or no compile

try {
  findUniqueOrThrow({ id: 99 });
} catch (e) {
  console.log('orThrow miss:', (e as Error).message);
}

const u2 = findUniqueOrThrow({ id: 2 });
console.log('orThrow hit:', u2.email, '/', u2.plan);

// Try it: change findFirst's return type to just 'User' and
// watch the '?? null' line go red — the null branch is the API.`,
  },

  keyPoints: [
    "Both ORMs emit only parameterised SQL — the PDO prepare/execute discipline is the sole mode; injection-by-concatenation is unrepresentable.",
    "Prisma read verbs: `findMany` (array), `findUnique` (`T | null`, unique columns only — compiler-enforced), `findFirst` (`T | null`, any filter + LIMIT 1), and `*OrThrow` variants returning plain `T`.",
    "Prisma never emits `SELECT *`: it selects all scalar columns by default; `select: { id: true, email: true }` narrows both the SQL and the inferred return type.",
    "Drizzle's `db.select().from(users).where(eq(...))` transliterates SQL clause-for-clause; the projection object determines the result type.",
    "Drizzle's second read API, `db.query.users.findMany({ with: { posts: true } })`, fetches typed object graphs via the `relations()` helper.",
    "Result types are computed from the query, not from a fixed model — change the query and the return type changes; no DTOs, no casts, no `FETCH_ASSOC` guessing.",
  ],

  interview: [
    {
      q: "What's the difference between findUnique, findFirst, and findUniqueOrThrow in Prisma?",
      a: "findUnique targets exactly one row via a unique column or unique index — and that's enforced at compile time; a where on a non-unique field won't typecheck. findFirst accepts any filter plus orderBy and effectively appends LIMIT 1, for 'the newest matching row' queries. Both return `T | null`, so TypeScript forces the miss branch to be handled — a real upgrade over PDO's fetch() returning false that nothing made you check. The OrThrow variants return plain `T` and throw a known, catchable error on a miss; I use those where absence indicates a bug, like loading the user for a validated session, so the null-check noise disappears from code paths that should never miss.",
    },
    {
      q: "How do these ORMs handle SQL injection compared to your PDO experience?",
      a: "With PDO, safety was a discipline: always prepare, always bind, never concatenate — and one lazy string interpolation in a code review away from an incident. Prisma and Drizzle remove the unsafe path entirely: every value in a where clause or insert travels as a bind parameter ($1, $2), because the APIs have no string-assembly mode for values. Even their raw-SQL escape hatches are tagged templates that convert interpolated values into parameters rather than splicing text. So the answer I give is: same mechanism I used for 20 years — prepared statements — but enforced by construction instead of by convention.",
    },
    {
      q: "What does it mean that the result type follows the query in these ORMs?",
      a: "The return type isn't a fixed entity class — it's computed from the query object by the type system. In Prisma, `select: { id: true, email: true }` produces `{ id: number; email: string }[]`; in Drizzle, `db.select({ email: users.email })` produces `{ email: string }[]`. Two consequences matter in practice. First, over-fetching becomes visible: narrowing the SQL projection also narrows the type, so there's an incentive to select only what you use. Second, refactoring is compiler-guided: remove a field from the query and every downstream usage fails the build immediately — with PDO's assoc arrays that same change surfaced as nulls in production.",
    },
  ],

  quiz: [
    {
      question:
        "Why does prisma.user.findUnique({ where: { plan: 'pro' } }) fail to compile?",
      options: [
        "findUnique's where clause only accepts unique columns or unique indexes, and plan isn't one",
        "findUnique requires an orderBy clause",
        "String values must be wrapped in a filter object like { equals: 'pro' }",
        "findUnique was removed in Prisma 7 in favour of findFirst",
      ],
      answerIndex: 0,
      explain:
        "findUnique's contract is 'at most one row, located by a uniqueness guarantee', and the generated types only admit @id/@unique fields in its where. For arbitrary filters with LIMIT 1 semantics, findFirst is the right verb.",
    },
    {
      question:
        "What SQL does Prisma emit for a default findMany (no select) on a model?",
      options: [
        "SELECT * FROM the table",
        "An explicit list of all the model's scalar columns with parameterised WHERE values",
        "One query per column, merged in the client",
        "A SELECT wrapped in a stored procedure call",
      ],
      answerIndex: 1,
      explain:
        "Prisma always emits explicit column lists — every scalar column of the model by default, which is also its over-fetching pitfall. Values are always bind parameters. Adding select narrows both the SQL columns and the inferred TypeScript type.",
    },
    {
      question:
        "In Drizzle, what determines the TypeScript type of rows returned by db.select({ id: users.id, email: users.email }).from(users)?",
      options: [
        "The full users table type — all columns are always present at runtime",
        "A manual interface you must declare and cast to",
        "The projection object passed to select: the rows are { id: number; email: string }[]",
        "The where clause's operators",
      ],
      answerIndex: 2,
      explain:
        "The select object is the projection, and the result type is inferred from it — exactly mirroring the emitted column list. Accessing a non-selected column is a compile error, not an undefined at runtime.",
    },
  ],
};

export default lesson;
