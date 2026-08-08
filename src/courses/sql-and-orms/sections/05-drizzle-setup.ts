import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "drizzle-setup",
  title: "Drizzle Setup: pg-core and drizzle.config.ts",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "Drizzle's bootstrap is three small files — a kit config, a schema written in TypeScript, and a db module — with no codegen step: the compiler infers every type straight from your table definitions.",

  concept: `
Drizzle's setup is refreshingly small because there is nothing to generate.
The schema is TypeScript; the compiler does the rest.

### Install

\`\`\`bash
npm install drizzle-orm pg          # 0.45.x + the Postgres driver
npm install -D drizzle-kit @types/pg  # 0.31.x — migrations tooling
\`\`\`

\`drizzle-orm\` is the runtime, \`pg\` is the same node-postgres driver
you'd use raw (Prisma 7's adapter wraps it too), and \`drizzle-kit\` is the
dev-time CLI for migrations and the Studio data browser.

### File one: \`drizzle.config.ts\`

\`\`\`ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',  // where your tables live
  out: './drizzle',              // where generated SQL migrations go
  dbCredentials: { url: process.env.DATABASE_URL! },
});
\`\`\`

Only \`drizzle-kit\` reads this — your application never touches it. The
kit commands are the modern bare forms: \`drizzle-kit generate\` (diff the
schema, emit SQL migration files), \`drizzle-kit migrate\` (apply them),
\`drizzle-kit push\` (sync schema straight to a dev database), and
\`drizzle-kit studio\`.

### File two: the schema — plain TypeScript

\`\`\`ts
// src/db/schema.ts
import { pgTable, serial, text, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  active: boolean('active').notNull().default(false),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
\`\`\`

Those two \`typeof\` lines are the whole "type generation" story:
\`$inferSelect\` is the row shape a SELECT returns, and \`$inferInsert\` is
what an INSERT requires — columns with defaults become optional. Edit a
column and both types change **in the same keystroke**. There is no
\`generate\` step to forget, so stale types are structurally impossible.

### File three: the db module

\`\`\`ts
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
\`\`\`

Passing \`schema\` isn't just organisation — it's what enables the
relational query API later (\`db.query.users.findMany({ with: ... })\`).
The \`Pool\` gives you real connection pooling out of the box, something a
classic per-request PDO setup never had.

### The contrast with Prisma's loop

Prisma's cycle is *edit schema.prisma → \`prisma generate\` → import the
generated client*. Drizzle's cycle is *edit schema.ts* — done. The
trade-off is honest: Prisma's DSL is arguably easier to scan and its
generated client offers a higher-level API; Drizzle keeps one language, one
source file, zero build steps, and an API that reads like the SQL you have
been writing since the nineties. Note what neither tool removes: the
**database** can still drift from the schema file — that's what migrations
(\`drizzle-kit generate\` / \`migrate\`) manage, and the next part of this
course covers them properly.
`,

  comparisons: [
    {
      label: "The connection singleton: PDO class vs a db module",
      intro:
        "Every PHP app has some version of this class. In TypeScript the module system does the singleton part for you — a module is evaluated once and cached.",
      php: `<?php
// src/Db.php — the classic lazy singleton
final class Db
{
    private static ?PDO $pdo = null;

    public static function conn(): PDO
    {
        if (self::$pdo === null) {
            self::$pdo = new PDO(
                getenv('DATABASE_DSN') ?: '',
                getenv('DB_USER') ?: '',
                getenv('DB_PASS') ?: '',
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );
        }
        return self::$pdo;
    }
}`,
      ts: `// src/db/index.ts — the module IS the singleton
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Evaluated once per process, cached by the module system.
// schema in the constructor unlocks db.query.* later.
export const db = drizzle({ client: pool, schema });`,
      note: "No static-property dance — ES modules are cached after first evaluation. And Pool is genuine connection pooling, not the one-connection-per-request model PHP-FPM pushed you toward.",
    },
    {
      label: "Prisma's generate loop vs importing the schema directly",
      intro:
        "How each ORM turns schema into types. Prisma inserts a codegen step; Drizzle lets the compiler read the schema file like any other module.",
      php: `// The Prisma cycle (from the previous section):
//
// 1. Edit prisma/schema.prisma   (a separate DSL)
// 2. npx prisma generate         (types created HERE)
// 3. Import what the generator wrote:
import { PrismaClient } from '../generated/prisma/client';

// Skip step 2 after a schema change and your editor
// happily autocompletes YESTERDAY'S schema — stale
// types until the next generate.`,
      ts: `// The Drizzle cycle: there is no step 2.
// src/db/schema.ts IS the schema AND the types:
import { pgTable, serial, text, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  active: boolean('active').notNull().default(false),
});

export type User = typeof users.$inferSelect;
// { id: number; email: string; active: boolean }
export type NewUser = typeof users.$inferInsert;
// { email: string; id?: number; active?: boolean }`,
      note: "$inferSelect is the SELECT row shape; $inferInsert makes defaulted/serial columns optional. Because types come from the compiler, not a generator, they can never lag behind the schema file.",
      leftLang: "ts",
    },
    {
      label: "Migration-tool config: phinx.php vs drizzle.config.ts",
      intro:
        "Both files exist purely for the migration tooling and tell it where schema truth lives, where migrations go, and how to reach the database.",
      php: `<?php
// phinx.php — config for the Phinx migration CLI
return [
    'paths' => [
        'migrations' => 'db/migrations',
    ],
    'environments' => [
        'default_environment' => 'dev',
        'dev' => [
            'adapter' => 'pgsql',
            'host'    => getenv('DB_HOST'),
            'name'    => getenv('DB_NAME'),
            'user'    => getenv('DB_USER'),
            'pass'    => getenv('DB_PASS'),
        ],
    ],
];`,
      ts: `// drizzle.config.ts — config for the drizzle-kit CLI
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts', // source of truth to diff
  out: './drizzle',             // generated SQL lands here
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
// Used by: drizzle-kit generate | migrate | push | studio
// Your app code never imports this file.`,
      note: "Same role as a phinx.php: dev-tooling-only config. The difference is direction — Phinx migrations are hand-written; drizzle-kit generate DIFFS your schema.ts against the previous state and writes the SQL for you.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Drizzle's core trick in miniature: column builders that carry a TypeScript type, and a table whose row type is inferred — no codegen. Predict the logged lines, then try adding a column or removing a notNull() and watch the User type follow.",
    code: `// A tiny pgTable: builders carry a phantom TS type + nullability flag.

interface Column<T, NN extends boolean> {
  sqlType: string;
  isNotNull: NN;
  _tsType?: T; // phantom marker — never set at runtime
  notNull(): Column<T, true>;
}

function makeColumn<T>(sqlType: string): Column<T, false> {
  return {
    sqlType,
    isNotNull: false,
    notNull(): Column<T, true> {
      return { ...this, isNotNull: true };
    },
  };
}

const text = () => makeColumn<string>('text');
const integer = () => makeColumn<number>('integer');
const boolean = () => makeColumn<boolean>('boolean');

// The row type falls out of the column map: notNull ? T : T | null
type RowOf<Cols extends Record<string, Column<unknown, boolean>>> = {
  [K in keyof Cols]: Cols[K] extends Column<infer T, infer NN>
    ? NN extends true ? T : T | null
    : never;
};

function pgTable<Cols extends Record<string, Column<any, boolean>>>(
  name: string,
  columns: Cols
) {
  return {
    name,
    columns,
    // Drizzle exposes exactly this property for inference:
    $inferSelect: undefined as unknown as RowOf<Cols>,
  };
}

// ── "src/db/schema.ts" ──────────────────────────────────────────
const users = pgTable('users', {
  id: integer().notNull(),
  email: text().notNull(),
  bio: text(), // nullable — no notNull()
});

type User = typeof users.$inferSelect;
// => { id: number; email: string; bio: string | null }

const row: User = { id: 1, email: 'ana@example.com', bio: null };

console.log('table: ' + users.name);
for (const [name, col] of Object.entries(users.columns)) {
  console.log(\`  \${name}: \${col.sqlType}\${col.isNotNull ? ' NOT NULL' : ''}\`);
}
console.log('row: ' + JSON.stringify(row));

// The compiler enforces the schema with no generate step:
// row.emial            → compile error (typo)
// { id: 2, email: 'x' }→ fine for User? No — bio is required
//                        (string | null), so you must state it.`,
  },

  keyPoints: [
    "Install `drizzle-orm` (0.45.x) + `pg` for runtime and `drizzle-kit` (0.31.x) as a dev dependency for migrations and Studio.",
    "Three files: `drizzle.config.ts` (kit-only config: dialect, schema path, out folder, dbCredentials), `src/db/schema.ts` (pgTable definitions), and `src/db/index.ts` (`drizzle({ client: pool, schema })`).",
    "There is no codegen step: `typeof users.$inferSelect` / `$inferInsert` are computed by the TypeScript compiler directly from the schema file, so types can never go stale.",
    "`$inferInsert` marks defaulted and serial columns optional — the INSERT type differs from the SELECT type, exactly as it should.",
    "Passing `schema` into `drizzle({ client, schema })` is what enables the relational query API (`db.query.users.findMany`).",
    "Modern drizzle-kit commands are the bare forms: `drizzle-kit generate`, `migrate`, `push`, `studio` — the old `generate:pg` style is deprecated.",
  ],

  interview: [
    {
      q: "Walk me through setting up Drizzle in a fresh TypeScript project against Postgres.",
      a: "Three packages, three files. Install `drizzle-orm` and `pg` as runtime dependencies, `drizzle-kit` and `@types/pg` as dev dependencies. First file: `drizzle.config.ts` — dialect `postgresql`, the path to my schema file, an `out` folder for generated SQL migrations, and `dbCredentials.url`; only drizzle-kit reads it. Second: `src/db/schema.ts`, where tables are defined with `pgTable` and pg-core column builders — this file is the single source of truth, and I export `typeof table.$inferSelect`/`$inferInsert` types from it. Third: `src/db/index.ts`, which creates a `pg` Pool and exports `drizzle({ client: pool, schema })` — passing the schema enables the relational query API. From there, `drizzle-kit generate` diffs the schema and writes SQL migrations, and `drizzle-kit migrate` applies them.",
    },
    {
      q: "Prisma generates a client; Drizzle doesn't. What are the practical consequences of that difference?",
      a: "With Prisma, types exist because a generator wrote them — so there's a step to forget: change the schema and skip `prisma generate`, and your editor autocompletes yesterday's schema until the next build catches it. With Drizzle, the schema is TypeScript, so the compiler recomputes `$inferSelect` the moment the file changes — stale types are structurally impossible, and there's no generated artifact to manage in CI or git. The costs run the other way: Drizzle's schema-in-code is noisier to read than Prisma's DSL, and complex type inference puts more load on the TS compiler in large schemas. Neither approach protects you from the database itself drifting — both still need migrations to keep Postgres in step with the schema definition.",
    },
    {
      q: "What's the difference between $inferSelect and $inferInsert, and why do both exist?",
      a: "They're the two shapes a table naturally has, and 25 years of SQL says they're not the same. `$inferSelect` is what a SELECT returns: every column present, nullable columns typed `T | null`. `$inferInsert` is what an INSERT requires: serial/identity columns and columns with defaults become optional, because the database will fill them — while genuinely required columns stay mandatory. In PDO both directions were untyped arrays and you found out about a missing NOT NULL column from a constraint violation at runtime; here the insert type rejects the incomplete row at compile time. It also mirrors RETURNING nicely: you insert a `NewUser` and get back a full `User` with the generated id populated.",
    },
  ],

  quiz: [
    {
      question:
        "After editing a Drizzle schema file, what must you run before the new column appears in your result types?",
      options: [
        "npx drizzle-kit generate, which regenerates the client types",
        "npm run build, to refresh node_modules",
        "Nothing — types are inferred by the TypeScript compiler directly from the schema file",
        "npx drizzle-orm sync",
      ],
      answerIndex: 2,
      explain:
        "Type inference is the compiler's job, not a CLI's: typeof users.$inferSelect recomputes the instant schema.ts changes. drizzle-kit generate produces SQL migration files to update the DATABASE — it has nothing to do with TypeScript types.",
    },
    {
      question: "Who reads drizzle.config.ts?",
      options: [
        "The drizzle() client at runtime, to find the database",
        "Only the drizzle-kit CLI (generate, migrate, push, studio) — application code never touches it",
        "The TypeScript compiler, to locate table types",
        "Node.js at startup, like a .env file",
      ],
      answerIndex: 1,
      explain:
        "drizzle.config.ts is dev-tooling config, like a phinx.php: it tells drizzle-kit where the schema and migrations live and how to reach the database. Your app builds its own connection in the db module — drizzle({ client: pool, schema }).",
    },
    {
      question:
        "Why pass `schema` when initialising: `drizzle({ client: pool, schema })`?",
      options: [
        "It's required — drizzle() throws without it",
        "It makes drizzle-kit migrations run automatically",
        "It enables runtime validation of every query against the schema",
        "It wires up the relational query API, e.g. db.query.users.findMany({ with: ... })",
      ],
      answerIndex: 3,
      explain:
        "drizzle({ client }) works fine for the SQL-like builder (db.select().from(...)), but the relational query API needs to know your tables and relations at construction time — that's what the schema argument provides.",
    },
  ],
};

export default lesson;
