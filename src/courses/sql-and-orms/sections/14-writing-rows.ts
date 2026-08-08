import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "writing-rows",
  title: "Insert, Update, Delete — and RETURNING",
  part: "Queries & CRUD",
  estMinutes: 12,
  summary:
    "The write APIs ride on two Postgres features you know cold — RETURNING and ON CONFLICT: Drizzle exposes them almost verbatim, Prisma wraps them in create/update/delete/upsert verbs, and both give you back typed rows instead of lastInsertId round-trips.",

  concept: `
Everything on the write side maps to Postgres features you've used for
years. Two do most of the work: \`RETURNING\`, which both ORMs lean on to
hand back the written row without a second query, and
\`INSERT ... ON CONFLICT\`, which powers upserts. Drizzle exposes them
nearly verbatim; Prisma hides them behind verbs.

### Prisma's write verbs

\`\`\`ts
const user = await prisma.user.create({
  data: { email: 'ana@example.com', name: 'Ana' },
});
// user: the full row — id, defaults, timestamps included.
// On Postgres this is INSERT ... RETURNING under the hood:
// no lastInsertId() + re-SELECT dance.
\`\`\`

- \`create\` / \`createMany\` — \`createMany\` is a single multi-row
  \`INSERT\` and returns only a count; on Postgres,
  \`createManyAndReturn\` gets you the rows.
- \`update\` — targets **one** row via a unique \`where\` (enforced by the
  types), returns the updated row.
- \`updateMany\` / \`deleteMany\` — arbitrary filters, return
  \`{ count }\`, not rows.
- \`delete\` — one row by unique key, returns what it deleted.
- \`upsert({ where, create, update })\` — where possible Prisma compiles
  this to a native \`INSERT ... ON CONFLICT ... DO UPDATE\`; otherwise it
  falls back to a read-then-write pair, which is not atomic in the same way.

### Drizzle: your SQL, chained

\`\`\`ts
const [user] = await db.insert(users)
  .values({ email: 'ana@example.com', name: 'Ana' })
  .returning();
// insert into "users" (...) values ($1, $2) returning *
\`\`\`

\`.returning()\` is literally \`RETURNING *\`; pass an object
(\`.returning({ id: users.id })\`) to narrow it — SQL and type together.
Updates and deletes read exactly like the statements they emit:

\`\`\`ts
await db.update(users)
  .set({ plan: 'pro' })
  .where(eq(users.email, 'ana@example.com'))
  .returning({ id: users.id });

await db.delete(users).where(eq(users.id, 42));
\`\`\`

Upserts are the \`ON CONFLICT\` clause you already write:

\`\`\`ts
await db.insert(users)
  .values({ email: 'ana@example.com', name: 'Ana' })
  .onConflictDoUpdate({
    target: users.email,
    set: { name: 'Ana' },
  });
// on conflict ("email") do update set "name" = $3
\`\`\`

There's also \`.onConflictDoNothing()\`, and inside \`set\` you can reference
the proposed row with \`sql.raw('excluded.name')\` — the same \`excluded\`
pseudo-table you use in hand-written upserts.

### Insert types: defaults become optional

Both ORMs derive **two** types per table. The select type has every column;
the insert type makes columns with defaults optional. In Drizzle that's
\`typeof users.$inferSelect\` vs \`typeof users.$inferInsert\`: a
\`serial\` id and a \`.defaultNow()\` timestamp vanish from the required
insert fields, while \`.notNull()\` columns without defaults stay required.
Prisma's \`create\` input types work the same way from the schema. The
compiler now enforces what you used to keep in your head about which columns
the database fills in.

### The footgun you already respect

You have never run \`UPDATE users SET plan = 'free'\` without a \`WHERE\` —
on purpose. The ORM spelling of that mistake is quieter:
\`updateMany({ where: {}, data: ... })\` in Prisma, or a Drizzle
\`db.update(users).set(...)\` / \`db.delete(users)\` with the \`.where()\`
call simply *missing*. All compile. All are valid SQL. Treat a write
without a where clause with exactly the suspicion you'd give the raw
statement — some teams lint for it.
`,

  comparisons: [
    {
      label: "Insert and get the row back: lastInsertId vs RETURNING",
      intro:
        "Create a user and immediately need its generated id and default columns. PDO needs an insert plus a follow-up; Drizzle emits the single INSERT ... RETURNING you'd write on modern Postgres.",
      php: `<?php
$stmt = $pdo->prepare(
  'INSERT INTO users (email, name) VALUES (?, ?)'
);
$stmt->execute(['ana@example.com', 'Ana']);

$id = (int) $pdo->lastInsertId('users_id_seq');

// Need created_at (a DB default)? Second round-trip:
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);`,
      ts: `// One statement, one round-trip, typed result:
const [user] = await db
  .insert(users)
  .values({ email: 'ana@example.com', name: 'Ana' })
  .returning();

// SQL: insert into "users" ("email", "name")
//      values ($1, $2) returning *
// user: { id: number; email: string; name: string;
//         createdAt: Date }  — defaults included.

// Narrow it (SQL and type move together):
const [{ id }] = await db.insert(users)
  .values({ email: 'ben@example.com', name: 'Ben' })
  .returning({ id: users.id });`,
      note: "returning() is Postgres RETURNING, verbatim — the id, the defaulted timestamp, everything arrives typed in the insert's own round-trip. Prisma's create does the same under the hood and returns the full row.",
    },
    {
      label: "Upsert: raw ON CONFLICT vs Prisma upsert",
      intro:
        "Insert a user by email, or update the name if the email already exists. You know the left side by heart; Prisma expresses it as three keyed blocks.",
      php: `INSERT INTO users (email, name)
VALUES ('ana@example.com', 'Ana')
ON CONFLICT (email)
DO UPDATE SET name = EXCLUDED.name
RETURNING *;`,
      ts: `const user = await prisma.user.upsert({
  where:  { email: 'ana@example.com' }, // conflict target
  create: { email: 'ana@example.com', name: 'Ana' },
  update: { name: 'Ana' },
});
// Where the criteria allow it (unique-field where, no
// nested writes), Prisma compiles this to a native
//   INSERT ... ON CONFLICT ... DO UPDATE
// Otherwise it falls back to a read-then-write pair.

// Drizzle keeps your SQL's shape instead:
// db.insert(users).values({...})
//   .onConflictDoUpdate({ target: users.email,
//                         set: { name: 'Ana' } })`,
      note: "where maps to the conflict target, create to VALUES, update to DO UPDATE SET. Know the native-vs-fallback distinction: the fallback pair is two statements, so concurrent upserts can race where the native form cannot.",
      leftLang: "sql",
    },
    {
      label: "The missing WHERE, in three languages",
      intro:
        "The classic disaster — an UPDATE that forgot its WHERE — compiles happily in both ORMs. Know what its spelling looks like so it jumps out in review.",
      php: `-- You have flinched at this for 25 years:
UPDATE users SET plan = 'free';
-- 3,412,908 rows updated. No error. No undo.

DELETE FROM orders;
-- Ditto.`,
      ts: `// Prisma: an empty where matches EVERY row.
await prisma.user.updateMany({
  where: {},                    // <- the missing WHERE
  data: { plan: 'free' },
});

// Drizzle: the .where() call just isn't there.
await db.update(users).set({ plan: 'free' });
await db.delete(orders);        // DELETE FROM orders

// All three compile and are 'valid'. Single-row verbs are
// the safe default: prisma.user.update requires a unique
// where; delete/update returning() lets you log what
// actually changed.`,
      note: "updateMany/deleteMany and where-less Drizzle writes are the ORM spelling of the unbounded UPDATE. Prefer the unique-keyed single-row verbs, and treat any *Many write in review like raw SQL without a WHERE.",
      leftLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "An upsert modelled over an in-memory Map keyed by the unique column (email) — the same created-vs-updated split ON CONFLICT gives you. Predict the four log lines, including the final row count, then run it.",
    code: `// INSERT ... ON CONFLICT (email) DO UPDATE, in miniature.

interface User {
  email: string;   // the unique column = the Map key
  name: string;
  logins: number;
}

const usersTable = new Map<string, User>();

function upsertUser(
  email: string,
  name: string,
): { row: User; outcome: 'created' | 'updated' } {
  const existing = usersTable.get(email);

  if (existing) {
    // DO UPDATE SET name = excluded.name, logins = logins + 1
    const row = { ...existing, name, logins: existing.logins + 1 };
    usersTable.set(email, row);
    return { row, outcome: 'updated' };
  }

  // No conflict -> plain INSERT (logins has a "default" of 1)
  const row: User = { email, name, logins: 1 };
  usersTable.set(email, row);
  return { row, outcome: 'created' };
}

const writes: Array<[string, string]> = [
  ['ana@example.com', 'Ana'],
  ['ben@example.com', 'Ben'],
  ['ana@example.com', 'Ana Petrova'],   // conflict! -> update
];

for (const [email, name] of writes) {
  const { row, outcome } = upsertUser(email, name);
  console.log(
    \`\${outcome}: \${row.email} name=\${row.name} logins=\${row.logins}\`,
  );
}

console.log('rows in table:', usersTable.size);

// Try it: make upsertUser 'do nothing' on conflict instead
// (onConflictDoNothing) and watch Ana keep her original name.`,
  },

  keyPoints: [
    "Both ORMs use Postgres RETURNING so writes hand back typed rows in one round-trip — the lastInsertId() + re-SELECT dance is gone.",
    "Prisma verbs: `create`/`createMany` (+ `createManyAndReturn` on Postgres), unique-keyed `update`/`delete` returning the row, filter-based `updateMany`/`deleteMany` returning only `{ count }`, and `upsert({ where, create, update })`.",
    "Drizzle transliterates the SQL: `insert().values().returning()`, `update().set().where()`, `delete().where()`, and `onConflictDoUpdate({ target, set })` / `onConflictDoNothing()` for ON CONFLICT.",
    "Prisma compiles upsert to a native INSERT ... ON CONFLICT when the where is a plain unique filter; otherwise it's a non-atomic read-then-write fallback — worth knowing under concurrency.",
    "Insert types make defaulted columns optional: Drizzle's `$inferInsert` vs `$inferSelect`, and Prisma's create inputs, both drop serial ids and defaultNow() timestamps from the required fields.",
    "The unbounded-UPDATE footgun survives typing: `updateMany({ where: {} })` and a Drizzle write with no `.where()` compile fine — review *Many and where-less writes like raw SQL missing its WHERE.",
  ],

  interview: [
    {
      q: "How do Prisma and Drizzle handle getting generated values back after an INSERT?",
      a: "Both lean on Postgres RETURNING rather than the classic lastInsertId-then-SELECT pattern. Drizzle is explicit: `.returning()` appends RETURNING * and gives you typed rows, or you pass a projection object to narrow both the SQL and the type. Prisma's `create` does it implicitly — you get the full row back, generated id and column defaults included, in the insert's own round-trip. The practical wins over my PDO days: one statement instead of two, no sequence-name string in `lastInsertId('users_id_seq')`, and no race window between the insert and the read-back. For bulk inserts, Prisma's `createMany` returns just a count, with `createManyAndReturn` available on Postgres when you need the rows.",
    },
    {
      q: "Compare how the two ORMs express an upsert, and what SQL actually runs.",
      a: "Drizzle exposes the Postgres feature almost verbatim: `insert().values().onConflictDoUpdate({ target: users.email, set: {...} })` emits INSERT ... ON CONFLICT (email) DO UPDATE SET, and you can reference the proposed row with the `excluded` pseudo-table just like in raw SQL. Prisma abstracts it as `upsert({ where, create, update })` — where is the conflict target, create the VALUES, update the DO UPDATE SET. The detail I'd flag in an interview: Prisma only compiles that to a single native ON CONFLICT statement when the criteria allow — essentially a plain unique-field where with no nested writes; otherwise it falls back to a read-then-write pair, which unlike the native form can race under concurrency unless you add your own guard.",
    },
    {
      q: "What does it mean that a table has different select and insert types?",
      a: "The type system encodes which columns the database fills in. Drizzle derives both from one definition: `typeof users.$inferSelect` has every column, while `typeof users.$inferInsert` makes anything with a default optional — a serial or identity id, a `.defaultNow()` timestamp — and keeps not-null-without-default columns required. Prisma's generated create input works identically off the schema. So the knowledge I used to carry in my head with hand-written INSERTs — 'don't supply id, the sequence handles it; created_at defaults' — is now compiler-enforced: omitting a required column or supplying a nonexistent one fails the build, not the transaction.",
    },
    {
      q: "How would you guard against accidental full-table updates or deletes with these ORMs?",
      a: "First, recognise the spellings: in Prisma it's `updateMany`/`deleteMany` with an empty or over-broad where — an empty object matches every row — and in Drizzle it's an `update().set()` or `delete()` chain where the `.where()` call is simply absent. All of it compiles, exactly like `UPDATE users SET ...` without a WHERE parses fine in psql. My defence is layered: prefer the single-row verbs (Prisma's update/delete require a unique where by type), use `.returning()` or the returned count to assert the blast radius in code, wrap risky writes in a transaction so a wrong count can abort, and in review treat any *Many or where-less write with the same reflex I've had for 25 years about a missing WHERE clause.",
    },
  ],

  quiz: [
    {
      question:
        "What SQL does db.insert(users).values({...}).returning() emit on Postgres?",
      options: [
        "An INSERT followed by a SELECT ... WHERE id = lastval()",
        "A single INSERT ... RETURNING * statement",
        "An INSERT inside a stored procedure that returns the row",
        "Two statements wrapped in a transaction",
      ],
      answerIndex: 1,
      explain:
        "returning() is a direct mapping to Postgres RETURNING — one statement, one round-trip, and the typed rows include generated ids and column defaults. Passing a projection object narrows it to RETURNING specific columns.",
    },
    {
      question: "When does Prisma's upsert run as a single native ON CONFLICT statement?",
      options: [
        "Always — upsert is defined as ON CONFLICT",
        "Never — Prisma always does a read-then-write",
        "When the criteria allow it, e.g. a plain unique-field where with no nested writes; otherwise it falls back to a read-then-write pair",
        "Only when you set a special flag in prisma.config.ts",
      ],
      answerIndex: 2,
      explain:
        "Prisma compiles upsert to INSERT ... ON CONFLICT ... DO UPDATE when it can express the operation as one statement. The fallback pair is two statements and can race under concurrency — the kind of distinction a SQL veteran should surface when discussing upsert semantics.",
    },
    {
      question:
        "Which of these compiles AND updates every row in the users table?",
      options: [
        "prisma.user.update({ data: { plan: 'free' } }) — update with no where",
        "db.update(users).set({ plan: 'free' }) — a Drizzle update with no .where() call",
        "prisma.user.updateMany({ where: { id: null }, data: {...} })",
        "db.update(users).where() with no arguments",
      ],
      answerIndex: 1,
      explain:
        "Drizzle's update chain doesn't require .where(), so omitting it emits UPDATE users SET ... with no WHERE — every row. Prisma's single-row update won't compile without a unique where (its *Many verbs are the risky ones, via an empty where object).",
    },
    {
      question: "Why is a serial id column optional in Drizzle's $inferInsert type but present in $inferSelect?",
      options: [
        "Insert types omit all numeric columns for safety",
        "It's a bug that drizzle-kit fixes at migration time",
        "$inferInsert only includes columns marked .notNull()",
        "Columns with database-side defaults (like a sequence) don't need a value on insert, but every row read back has one",
      ],
      answerIndex: 3,
      explain:
        "The two inferred types encode direction: on the way in, defaulted columns (serial/identity, defaultNow()) may be omitted because the database fills them; on the way out, they're always populated. Not-null columns without defaults stay required in both.",
    },
  ],
};

export default lesson;
