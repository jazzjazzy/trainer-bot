import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "orm-landscape",
  title: "The ORM Landscape: Prisma, Drizzle, and Friends",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "The TypeScript data-layer spectrum runs from raw drivers to full ORMs — and the axes that sort it (active record vs data mapper, code-first vs schema-first) are ones you already know from Eloquent and Doctrine.",

  concept: `
"Which ORM would you pick and why?" is a genuine interview question, and the
honest answer starts with a map. The TypeScript data-layer world is a ladder
of abstraction, and every rung has a PHP cousin you've already worked with.

### The ladder, bottom to top

- **Raw driver — \`pg\` (node-postgres).** The PDO of this world: you write
  the SQL, you bind the parameters, and rows come back as untyped objects.
  Everything else on the ladder is built on a driver like this.
- **Typed query builder — Kysely.** You still write SQL shapes
  (\`selectFrom\`, \`innerJoin\`, \`where\`), but every table and column is
  checked against a TypeScript schema definition. Think of a Doctrine
  QueryBuilder that actually knows your columns.
- **Drizzle — a schema-owning query builder.** Your tables are TypeScript
  code (\`pgTable(...)\`), and the query API mirrors SQL almost keyword for
  keyword: \`db.select().from(users).innerJoin(...).where(...)\`. The
  compiler infers every result type directly from the schema code — no
  generation step.
- **Prisma — schema-first, generated client.** You describe models in a
  dedicated DSL (\`schema.prisma\`), run a generator, and get a client with
  a higher-level API: \`prisma.user.findMany({ where, include })\`. The SQL
  is further away, but the ergonomics and the generated types are superb.

### The axes you already know

Your PHP frameworks sit on the same two axes interviewers ask about:

- **Active record vs data mapper.** Eloquent is active record: the model
  *is* the row, it knows how to \`save()\` itself, and persistence logic is
  welded to the object. Doctrine is a data mapper: entities are plain
  objects and the EntityManager moves them in and out of the database.
  **Prisma and Drizzle are both on the data-mapper side** — queries return
  plain typed objects with no \`save()\` method, and all persistence goes
  through the client. TypeORM still offers an active-record mode (entities
  extending \`BaseEntity\`, with \`save()\` and static finders), but the
  pattern fights the type system, and the leading typed ORMs have all
  chosen the data-mapper side.
- **Code-first vs schema-first.** Drizzle is code-first: TypeScript table
  definitions are the source of truth and types fall out of the compiler.
  Prisma is schema-first: a \`.prisma\` DSL file is the source of truth and
  a codegen step produces the typed client. Doctrine's annotations/attributes
  are code-first; a DBA-managed database you introspect is schema-first —
  same trade-offs, new syntax.

### The versions this course teaches

- **Prisma 7** (7.8.x at the time of writing) — a major rewrite: the old
  Rust query engine is gone, replaced by a TypeScript query compiler, and
  the client now requires a JS **driver adapter** (e.g. \`@prisma/adapter-pg\`
  wrapping \`pg\`). Most online tutorials still show Prisma 5/6 patterns —
  this course teaches the current ones.
- **Drizzle** — \`drizzle-orm\` 0.45.x with \`drizzle-kit\` 0.31.x for
  migrations. Pre-1.0 but heavily used in production, especially in
  serverless and edge stacks.

### How to answer "which one?" in an interview

Not with a favourite — with trade-offs. Drizzle keeps you close to SQL,
adds zero codegen, and produces lean bundles; if you can write the query in
SQL you can write it in Drizzle. Prisma gives a bigger toolbox — polished
migrations, Studio, a friendlier high-level API — at the cost of a DSL and
a generate step. Someone with your SQL depth can be productive in either;
the differentiator is that you can read what each generates and judge it.
`,

  comparisons: [
    {
      label: "The bottom rung: PDO and the raw pg driver",
      intro:
        "The same parameterised query at driver level in both worlds. Notice that switching languages alone buys no type safety — the raw driver's rows are as untyped as PDO's.",
      php: `<?php
// PDO — the driver you know
$stmt = $pdo->prepare(
    'SELECT id, email FROM users WHERE active = ?'
);
$stmt->execute([true]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
// $rows: array<int, array<string, mixed>>
echo $rows[0]['email'];`,
      ts: `// node-postgres (pg) — same rung of the ladder
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const res = await pool.query(
  'SELECT id, email FROM users WHERE active = $1',
  [true]
);
// res.rows: any[] — TypeScript knows nothing about the shape.
console.log(res.rows[0].email); // .emial would ALSO compile`,
      note: "pg is PDO's equivalent: prepared statements with $1-style placeholders instead of ?, but rows come back as any[]. Every typed layer in this course is built on a driver like this.",
    },
    {
      label: "Active record (Eloquent) vs data mapper (Prisma)",
      intro:
        "Fetch active users and update one. Eloquent's model object carries its own persistence; Prisma returns plain typed data and all writes go through the client.",
      php: `<?php
// Eloquent: active record — the object IS the row
$users = User::where('active', true)->get();

$user = User::find(1);
$user->email = 'ana@corp.example';
$user->save();   // the model persists itself
// Column names are strings/magic properties —
// $user->emial is null, not an error.`,
      ts: `// Prisma: data mapper — plain objects, client persists
const users = await prisma.user.findMany({
  where: { active: true },
});
// users: { id: number; email: string; active: boolean }[]

const updated = await prisma.user.update({
  where: { id: 1 },
  data: { email: 'ana@corp.example' },
});
// updated is a new plain object; there is no .save().
// updated.emial is a compile error.`,
      note: "Prisma and Drizzle are both data mappers, like Doctrine — no stateful entities, no save() on rows. That design is what lets the compiler check every property access.",
    },
    {
      label: "A hand-written join vs Drizzle's SQL-like builder",
      intro:
        "Post titles with their authors' names. Drizzle's API is deliberately shaped like the SQL you'd write by hand — same clauses, same order — but the projection comes back fully typed.",
      php: `<?php
// PDO: the join you have written a thousand times
$stmt = $pdo->prepare(
    'SELECT u.name AS author, p.title
     FROM posts p
     INNER JOIN users u ON u.id = p.author_id
     WHERE u.active = ?'
);
$stmt->execute([true]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
// keys 'author' and 'title' exist by convention only`,
      ts: `// Drizzle: the same join, clause for clause
import { eq } from 'drizzle-orm';
import { db } from './db';
import { posts, users } from './schema';

const rows = await db
  .select({ author: users.name, title: posts.title })
  .from(posts)
  .innerJoin(users, eq(users.id, posts.authorId))
  .where(eq(users.active, true));
// rows: { author: string; title: string }[] —
// the projection defines the type.`,
      note: "This is Drizzle's pitch: if you can write the SQL, you already know the API — select/from/innerJoin/where map one-to-one, and the select({...}) projection becomes the result type.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Active record vs data mapper in miniature. The ActiveUser class persists itself (Eloquent-style); the mapper works with plain typed rows (Prisma/Drizzle-style). Predict the five logged lines, then run it.",
    code: `interface UserRow {
  id: number;
  email: string;
  active: boolean;
}

const usersTable: UserRow[] = [
  { id: 1, email: 'ana@example.com', active: true },
  { id: 2, email: 'bo@example.com', active: false },
];

// ── Active record (Eloquent-style): the object IS the row ──────────
class ActiveUser {
  constructor(
    public id: number,
    public email: string,
    public active: boolean
  ) {}

  static find(id: number): ActiveUser | null {
    const row = usersTable.find((r) => r.id === id);
    return row ? new ActiveUser(row.id, row.email, row.active) : null;
  }

  save(): void {
    const i = usersTable.findIndex((r) => r.id === this.id);
    usersTable[i] = { id: this.id, email: this.email, active: this.active };
    console.log(\`AR: UPDATE users SET ... WHERE id = \${this.id}\`);
  }
}

const bo = ActiveUser.find(2);
if (bo) {
  bo.active = true; // mutate the object...
  bo.save();        // ...and it persists ITSELF
  console.log('AR: bo is now active =', bo.active);
}

// ── Data mapper (Prisma/Drizzle-style): plain rows, separate client ──
const userMapper = {
  find(id: number): UserRow | null {
    return usersTable.find((r) => r.id === id) ?? null;
  },
  update(id: number, patch: Partial<Omit<UserRow, 'id'>>): UserRow {
    const i = usersTable.findIndex((r) => r.id === id);
    usersTable[i] = { ...usersTable[i], ...patch };
    console.log(\`DM: UPDATE users SET ... WHERE id = \${id}\`);
    return usersTable[i];
  },
};

const updated = userMapper.update(1, { email: 'ana@corp.example' });
console.log('DM: returned a plain object:', JSON.stringify(updated));
// updated has no .save() — persistence lives in the mapper,
// which is exactly how prisma.user.update / db.update work.

console.log('table:', usersTable.map((u) => u.email).join(', '));`,
  },

  keyPoints: [
    "The TS data-layer ladder: raw driver (`pg`) → typed query builder (Kysely) → Drizzle (schema in TS code, SQL-like API) → Prisma (schema-first DSL, generated client).",
    "Eloquent is active record, Doctrine is a data mapper — Prisma and Drizzle both sit on the data-mapper side: plain typed objects in and out, no `save()` on rows.",
    "Drizzle is code-first (TS table definitions, types inferred by the compiler, no codegen); Prisma is schema-first (`schema.prisma` DSL plus a generate step).",
    "Course baseline: Prisma 7 (7.8.x) with the TypeScript query compiler and required driver adapters, and drizzle-orm 0.45.x with drizzle-kit 0.31.x.",
    "A raw driver in TypeScript is exactly as untyped as PDO — `res.rows` is `any[]` — which is why the typed layers above it exist.",
    "In interviews, answer 'which ORM?' with trade-offs: Drizzle = closeness to SQL and zero codegen; Prisma = richer tooling and higher-level ergonomics.",
  ],

  interview: [
    {
      q: "Where do Prisma and Drizzle sit relative to ORMs you've used in PHP, like Eloquent and Doctrine?",
      a: "Both are data mappers, so philosophically they're Doctrine's side of the family: queries return plain objects and all persistence goes through a client — there's no active-record `$model->save()` like Eloquent. Where they differ from each other is the source of truth. Drizzle is code-first: tables are TypeScript code and the compiler infers every result type with no generation step. Prisma is schema-first: models live in a `schema.prisma` DSL and a codegen step produces the typed client, much like generating Doctrine proxies. Abstraction-wise, Drizzle stays close to SQL — select/join/where map one-to-one — while Prisma's `findMany`/`include` API sits higher, closer to how Eloquent relationships feel, but without mutable model objects.",
    },
    {
      q: "How would you decide between Prisma and Drizzle for a new project?",
      a: "I'd weigh three things. First, how close the team wants to stay to SQL: Drizzle's API is nearly one-to-one with SQL clauses, so a SQL-strong team is instantly productive and can predict the generated query; Prisma's higher-level API is more approachable for developers who don't think in SQL. Second, tooling and workflow: Prisma brings polished migrations, Studio, and a mature ecosystem, at the cost of a DSL and a generate step; Drizzle has no codegen and lean bundles, which matters in serverless and edge runtimes. Third, team profile and existing conventions. Coming from 25 years of SQL, I'm equally comfortable in either — the important skill is reading what each one emits and knowing when to drop to raw SQL.",
    },
    {
      q: "TypeORM supports active record, yet Prisma and Drizzle both chose data mapper. Why does the TypeScript ecosystem lean that way?",
      a: "Active record fuses data and persistence into one mutable object, and that fights TypeScript's strengths. The type system shines when query results are plain, precisely-shaped values — a projection can be typed as exactly `{ author: string; title: string }[]`. An active-record model with magic properties, partially-loaded state, and a `save()` method is much harder to type honestly: is that relation loaded? Is this field selected? Eloquent papers over that with runtime magic (`__get`), which PHP tolerates but TS can't verify. Data mappers also keep serialisation trivial — rows are already plain objects — which suits API-centric and serverless architectures where you fetch, transform, and return JSON.",
    },
  ],

  quiz: [
    {
      question:
        "Which pairing correctly maps the PHP ORMs to their design pattern?",
      options: [
        "Eloquent = data mapper, Doctrine = active record",
        "Eloquent = active record, Doctrine = data mapper — and Prisma/Drizzle follow Doctrine's side",
        "Both Eloquent and Doctrine are active record, like Prisma",
        "Doctrine and Drizzle are active record; Eloquent and Prisma are data mappers",
      ],
      answerIndex: 1,
      explain:
        "Eloquent models carry their own persistence (active record); Doctrine entities are plain objects persisted by the EntityManager (data mapper). Prisma and Drizzle both return plain typed objects with no save() method — data mappers — because that's the design a static type system can actually verify.",
    },
    {
      question:
        "What is the key workflow difference between Drizzle and Prisma?",
      options: [
        "Drizzle only works with MySQL while Prisma is Postgres-only",
        "Prisma writes schemas in TypeScript; Drizzle uses a DSL file",
        "Drizzle infers types from TS table code with no codegen; Prisma generates a client from a schema.prisma DSL",
        "Drizzle cannot run migrations, so Prisma is required alongside it",
      ],
      answerIndex: 2,
      explain:
        "Drizzle is code-first: pgTable definitions are TypeScript, and the compiler derives result types directly — change the schema file and types update instantly. Prisma is schema-first: schema.prisma is the source of truth and `prisma generate` produces the typed client. Drizzle has its own migration tool, drizzle-kit.",
    },
    {
      question:
        "You query with the raw `pg` driver: `const res = await pool.query('SELECT id, email FROM users')`. What does TypeScript know about `res.rows[0]`?",
      options: [
        "Its exact shape, inferred by parsing the SQL string",
        "Nothing useful — rows are effectively any, so wrong property names still compile",
        "The column names but not their types",
        "It's a compile error to access rows without a generic parameter",
      ],
      answerIndex: 1,
      explain:
        "A raw driver can't know your schema — rows come back as any[], so res.rows[0].emial compiles and yields undefined at runtime, exactly like a typo'd PDO array key. The typed layers (Kysely, Drizzle, Prisma) exist to close that gap.",
    },
  ],
};

export default lesson;
