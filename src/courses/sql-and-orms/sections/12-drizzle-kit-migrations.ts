import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "drizzle-kit-migrations",
  title: "drizzle-kit: generate, migrate, push",
  part: "Schema & Migrations",
  estMinutes: 12,
  summary:
    "drizzle-kit generate diffs your TypeScript schema into a plain .sql file you review before drizzle-kit migrate applies it — plus push for prototyping, pull for adopting legacy databases, and studio for browsing.",

  concept: `
Drizzle's schema lives in TypeScript — \`pgTable(...)\` definitions in your
own source tree. \`drizzle-kit\` is the CLI that turns edits to that code
into database changes, and its philosophy will suit you: **it hands you the
SQL immediately** and expects you to read it.

### \`drizzle-kit generate\`: diff the code, emit SQL

\`\`\`bash
npx drizzle-kit generate --name add_user_bio
\`\`\`

drizzle-kit compares your current TS schema against a JSON **snapshot** of
the previous state (stored in \`drizzle/meta/\`) and writes the difference as
a numbered SQL file: \`drizzle/0003_add_user_bio.sql\`. Omit \`--name\` and
it invents a codename like \`0003_wealthy_hulk.sql\` — pass a name; your
future self greps for it. No database connection is needed to generate:
the diff is snapshot-vs-code, which is why Drizzle has **no shadow
database** — Prisma replays SQL history against a scratch DB to compute
state; Drizzle keeps state as JSON snapshots and diffs those.

The output is plain DDL. Review it, edit it if needed (backfills, index
tweaks), commit it. \`drizzle-kit generate --custom --name seed_plans\`
creates an *empty* migration file for hand-written SQL — data fixes and
anything the differ can't express get first-class slots in the history.

### \`drizzle-kit migrate\`: the runner and its journal

\`\`\`bash
npx drizzle-kit migrate
\`\`\`

Applies pending files in order and records each in a journal table —
\`__drizzle_migrations\`, kept in a separate \`drizzle\` schema on Postgres
(both names configurable). Alongside the DB table there's a repo-side ledger,
\`drizzle/meta/_journal.json\`, listing every migration and its snapshot.
This is the same "files + ledger" contract as your hand-rolled PHP runner
and as Prisma's \`_prisma_migrations\` — three implementations of one idea.

### \`drizzle-kit push\`: prototyping without files

\`push\` diffs your TS schema directly against the **live database** and
applies the changes, creating no files. Perfect for the first hour of a
project or a throwaway branch database; wrong for anything shared, because
there is no history to replay elsewhere. The pairing is deliberate:
\`push\` while sketching, switch to \`generate\` + \`migrate\` once the
schema is worth versioning.

### \`drizzle-kit pull\`: database-first for legacy systems

You will care about this one: modernising a PHP app whose database already
exists and is the real source of truth.

\`\`\`bash
npx drizzle-kit pull
\`\`\`

introspects the live database and **writes the Drizzle TS schema for you**
— tables, columns, defaults, foreign keys — plus a relations file. From
there you choose a direction: keep the database as source of truth and
re-pull after DBA-managed changes, or flip to codebase-first and let
\`generate\` drive future DDL. For a 15-year-old schema with 120 tables,
\`pull\` turns weeks of transcription into minutes.

Finally, \`drizzle-kit studio\` serves a local browser GUI over your schema
— an Adminer that already knows your types.

### Prisma vs Drizzle migration philosophy

Both end in the same place: ordered \`.sql\` files plus a ledger table.
Prisma migrates from a **DSL** (\`schema.prisma\`), validates via shadow-DB
replay, and regenerates a client. Drizzle diffs **TypeScript against JSON
snapshots** — faster loop, zero extra databases, and the SQL lands in your
lap before anything is applied. If you want to read every line of DDL that
will ever hit production, Drizzle's flow puts that review step directly in
your path.
`,

  comparisons: [
    {
      label: "The same schema change, both toolchains",
      intro:
        "Add a bio column to users. Prisma diffs a schema DSL and applies in one command; Drizzle splits generate (emit SQL, no DB needed) from migrate (apply), with your review in between.",
      php: `# Prisma: edit prisma/schema.prisma, then one command
# does diff + apply + client regeneration:
npx prisma migrate dev --name add_user_bio

# - needs the dev database AND a shadow database
# - artifact: prisma/migrations/<ts>_add_user_bio/migration.sql
# - SQL is written for you, reviewable after the fact
#   (or before, with --create-only)`,
      ts: `# Drizzle: edit src/db/schema.ts, then two explicit steps.

# 1. Diff TS schema vs stored snapshot — no DB connection:
npx drizzle-kit generate --name add_user_bio
#    -> drizzle/0003_add_user_bio.sql  (read it now)

# 2. Apply pending files, record in the journal:
npx drizzle-kit migrate

# No shadow database: state lives in drizzle/meta/
# snapshots, not in a replayed scratch DB. No client to
# regenerate either — the types ARE the schema file.`,
      note: "Prisma validates by replaying history in a shadow DB and regenerates a client; Drizzle diffs snapshots offline and its types update the instant you save schema.ts. Both produce plain SQL files plus a ledger table.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Your hand-rolled runner vs drizzle-kit's journal",
      intro:
        "Every migration system is files-in-order plus a ledger. Left: the PHP runner pattern you maintained yourself. Right: where Drizzle keeps the same information.",
      php: `<?php
// bin/migrate.php — files in order + a ledger table
$applied = $pdo->query('SELECT name FROM migrations')
               ->fetchAll(PDO::FETCH_COLUMN);

foreach (glob('migrations/*.sql') as $file) {
    $name = basename($file);
    if (in_array($name, $applied)) continue;
    $pdo->exec(file_get_contents($file));
    $pdo->prepare('INSERT INTO migrations (name) VALUES (?)')
        ->execute([$name]);
}`,
      ts: `// drizzle.config.ts — the runner is configuration now
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',              // the .sql files
  dbCredentials: { url: process.env.DATABASE_URL! },
  migrations: {
    table: '__drizzle_migrations', // your "migrations" table
    schema: 'drizzle',             // kept out of public
  },
});
// Repo-side ledger: drizzle/meta/_journal.json
// DB-side ledger:   drizzle.__drizzle_migrations`,
      note: "Identical contract: drizzle-kit migrate scans out/, skips what the journal table records, applies the rest in order. The defaults (__drizzle_migrations in a drizzle schema) are configurable.",
      rightLang: "ts",
    },
    {
      label: "Database-first: adopting a legacy schema",
      intro:
        "A production Postgres from a long-lived PHP app is the source of truth. Left: what already exists. Right: drizzle-kit pull writes the TypeScript schema from it.",
      php: `-- What 15 years of hand-written DDL left you with
-- (and no ORM has ever seen):
CREATE TABLE customers (
  id         integer GENERATED ALWAYS AS IDENTITY
             PRIMARY KEY,
  email      varchar(255) NOT NULL UNIQUE,
  plan       varchar(20)  NOT NULL DEFAULT 'free',
  created_at timestamptz  NOT NULL DEFAULT now()
);
-- ... times 120 tables, with FKs, checks, indexes.`,
      ts: `# Introspect the live DB into TS schema + relations:
npx drizzle-kit pull

# drizzle/schema.ts (generated — excerpt):
#   export const customers = pgTable('customers', {
#     id: integer().primaryKey()
#           .generatedAlwaysAsIdentity(),
#     email: varchar({ length: 255 }).notNull().unique(),
#     plan: varchar({ length: 20 })
#             .default('free').notNull(),
#     createdAt: timestamp('created_at', ...)
#                  .defaultNow().notNull(),
#   });

# From here: stay DB-first (re-pull after DBA changes)
# or go codebase-first and let generate drive new DDL.`,
      note: "pull is the modernisation on-ramp: the existing database keeps working for the PHP app while the new TS code gets fully typed access to the same tables from day one.",
      leftLang: "sql",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "schema.ts gained a bio column on users. Predict what generate emits (file name, SQL) and what migrate reports, then reveal the transcript.",
    code: `# src/db/schema.ts changed:
#   export const users = pgTable('users', {
#     id: serial('id').primaryKey(),
#     email: text('email').notNull().unique(),
#     bio: text('bio'),                    // <-- new
#   });

npx drizzle-kit generate --name add_user_bio

cat drizzle/0003_add_user_bio.sql

npx drizzle-kit migrate`,
    output: `Reading config file 'drizzle.config.ts'
1 tables
users 3 columns 1 indexes 0 fks

[✓] Your SQL migration file ➜ drizzle/0003_add_user_bio.sql 🚀

$ cat drizzle/0003_add_user_bio.sql
ALTER TABLE "users" ADD COLUMN "bio" text;

$ npx drizzle-kit migrate
Reading config file 'drizzle.config.ts'
Applying migrations...
[✓] migrations applied successfully!`,
  },

  keyPoints: [
    "`drizzle-kit generate` diffs your TS schema against JSON snapshots in `drizzle/meta/` and emits a numbered plain-SQL file — no database connection, no shadow database.",
    "`drizzle-kit migrate` applies pending files in order and records them in `__drizzle_migrations` (in a `drizzle` schema on Postgres) — the same ledger-table contract as a hand-rolled runner.",
    "Always pass `--name`; otherwise you get codenames like `0003_wealthy_hulk.sql`. Use `generate --custom` for empty migrations holding hand-written SQL like backfills.",
    "`drizzle-kit push` applies schema diffs straight to the database with no files — prototyping only; switch to generate + migrate once history matters.",
    "`drizzle-kit pull` introspects an existing database into TypeScript schema files — the on-ramp for modernising a legacy PHP app's database, DB-first or as a one-time bootstrap.",
    "Philosophy: Prisma migrates from a DSL with shadow-DB validation and a generated client; Drizzle diffs TS snapshots and shows you the SQL before anything runs. The old `generate:pg` command forms are deprecated — modern drizzle-kit uses bare `generate`, `migrate`, `push`, `pull`, `studio`.",
  ],

  interview: [
    {
      q: "How does Drizzle's migration workflow differ from Prisma's?",
      a: "Both end at ordered SQL files plus a ledger table, but they compute the diff differently. Prisma diffs a schema DSL and validates by replaying the whole migration history in a temporary shadow database, then regenerates a client. Drizzle stores a JSON snapshot of the schema alongside each migration; `drizzle-kit generate` diffs your current TypeScript against the last snapshot — offline, no database needed — and writes the SQL file immediately, which you review before `drizzle-kit migrate` applies it and records it in `__drizzle_migrations`. There's also no client generation step: the TS schema file is the type source, so types update on save. Coming from decades of reading my own DDL, I like that Drizzle puts the SQL in front of me by default.",
    },
    {
      q: "When would you use drizzle-kit push versus generate and migrate?",
      a: "push diffs the TS schema straight against the live database and applies changes without creating files — it's for prototyping: day one of a project, a scratch branch database, local experiments. The moment a schema is shared or deployed, I switch to generate + migrate, because push leaves no replayable history — a second environment has no way to reach the same state. It's the same judgement as ad-hoc ALTER TABLE on a dev box versus committing a numbered migration: fine until anyone else, including CI, needs to reproduce it.",
    },
    {
      q: "You're modernising a legacy PHP application with a large existing Postgres schema. How do you bring Drizzle into that?",
      a: "Database-first, with `drizzle-kit pull`. It introspects the live database and generates the TypeScript schema — tables, column types, defaults, keys — plus relations, so the new TS services get fully typed queries against the existing tables immediately, while the PHP app keeps running unchanged. Then there's a strategic choice: keep the DB as source of truth and re-pull after DBA-managed changes, or freeze that as a baseline and flip to codebase-first, letting drizzle-kit generate produce all future DDL as reviewable SQL migrations. I'd generally run DB-first during the transition and flip once the PHP side stops issuing its own schema changes.",
    },
  ],

  quiz: [
    {
      question:
        "Why does drizzle-kit generate not need a database connection or shadow database?",
      options: [
        "It only supports SQLite, which is file-based",
        "It diffs your TypeScript schema against JSON snapshots stored in drizzle/meta/, so state comparison happens entirely offline",
        "It connects to the production database directly instead",
        "It skips validation entirely and cannot detect schema state",
      ],
      answerIndex: 1,
      explain:
        "Each generated migration stores a snapshot of the schema state; the next generate diffs current TS code against that snapshot. Prisma instead reconstructs state by replaying SQL history in a shadow database — same goal, different mechanism.",
    },
    {
      question: "What does drizzle-kit migrate use to know which files to apply?",
      options: [
        "It re-diffs the schema against the database on every run",
        "It asks interactively which files to run",
        "A journal: the __drizzle_migrations table (in a drizzle schema on Postgres) plus the repo-side meta/_journal.json",
        "File modification timestamps",
      ],
      answerIndex: 2,
      explain:
        "migrate is a runner, not a differ: it applies migration files not yet recorded in the journal table, in order — exactly the files-plus-ledger design of a hand-rolled PHP migration runner or Prisma's _prisma_migrations.",
    },
    {
      question:
        "Which command turns an existing production database into Drizzle TypeScript schema files?",
      options: [
        "drizzle-kit push",
        "drizzle-kit generate --from-db",
        "drizzle-kit studio",
        "drizzle-kit pull",
      ],
      answerIndex: 3,
      explain:
        "pull introspects the live database and writes the pgTable definitions and relations for you — the database-first workflow. push goes the other direction (TS schema onto the DB), and studio is the browsing GUI.",
    },
  ],
};

export default lesson;
