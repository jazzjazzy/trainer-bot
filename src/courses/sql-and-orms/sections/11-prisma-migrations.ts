import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "prisma-migrations",
  title: "Prisma Migrate: dev, deploy, and Drift",
  part: "Schema & Migrations",
  estMinutes: 13,
  summary:
    "prisma migrate dev diffs your schema into plain, editable SQL migration files, a shadow database guards against drift, and migrate deploy replays the folder in production — the numbered-.sql workflow you built by hand, automated.",

  concept: `
You have run schema migrations the manual way for decades: a folder of
numbered \`.sql\` files, a bookkeeping table recording which ones ran, and a
runner script that applies the pending ones in order. Prisma Migrate is
**exactly that architecture**. The folder is \`prisma/migrations/\`, the
bookkeeping table is \`_prisma_migrations\`, and the artifacts are plain SQL
files you can open, read, and edit. The only genuinely new part is that
Prisma *writes the SQL for you* by diffing your schema file against the
migration history.

### What \`prisma migrate dev\` actually does

Run it after editing \`schema.prisma\`:

\`\`\`bash
npx prisma migrate dev --name add_user_bio
\`\`\`

Four steps, in order:

1. **Replays the existing migration history in a shadow database** to detect
   drift — an edited or deleted migration file, or manual changes made
   directly to the dev database.
2. **Applies any pending migrations** (e.g. ones a colleague committed) to
   the shadow database, then diffs the result against your current schema.
3. **Generates a new migration** from that diff:
   \`prisma/migrations/20260707101530_add_user_bio/migration.sql\` — the
   timestamp prefix is your old numbering scheme, generated for you.
4. **Applies everything unapplied to your dev database**, records it in
   \`_prisma_migrations\`, and regenerates Prisma Client so the new column
   exists as a typed property immediately.

### The shadow database

The shadow database is a second, temporary database that \`migrate dev\`
creates and drops automatically on each run. By replaying the *entire*
migration history from scratch, it proves the folder of SQL files still
reconstructs the schema you think you have — the guarantee your hand-rolled
runner never gave you. It needs a Postgres role with \`CREATEDB\`; on hosted
databases that forbid that, you point Prisma at a manually created shadow
database instead. It is a **dev-only** tool: \`migrate deploy\` and
\`migrate resolve\` never touch it. In Prisma 7 this, like the datasource
URL, is configured in \`prisma.config.ts\` rather than scattered env magic.

### Editing generated SQL — your power move

The generated file is plain Postgres DDL, and you are allowed to edit it.
Use \`--create-only\` to generate *without applying*, rewrite the SQL, then
run \`migrate dev\` again to apply. The classic case: adding a \`NOT NULL\`
column to a populated table needs a three-step add-nullable → backfill
\`UPDATE\` → \`SET NOT NULL\` dance. Prisma can't know your backfill logic —
you write it into the migration, exactly as you always did. Developers who
only know the ORM never open these files; you should review every one like
a DBA reviewing a change ticket, because that is precisely what it is.

### Production: \`migrate deploy\`

\`\`\`bash
npx prisma migrate deploy
\`\`\`

No diffing, no schema comparison, no shadow database, no prompts: it applies
the not-yet-applied migrations from the folder, in order, and records them.
It is your CI runner, verbatim — you commit migration files to git and the
pipeline replays them.

### Prototyping and drift repair

- \`prisma db push\` syncs the database to the schema **without creating a
  migration file** — great for throwaway prototyping, but the change history
  doesn't exist, so never use it where migrations matter.
- \`prisma migrate diff\` prints the SQL (or summary) between any two schema
  states — live database, migrations folder, schema file. Perfect for
  answering "what actually changed on prod?".
- \`prisma migrate resolve --applied <name>\` (or \`--rolled-back\`) edits the
  \`_prisma_migrations\` ledger for hotfix situations: someone ran SQL
  directly on production, you back-port it as a migration file, then mark it
  applied so \`deploy\` doesn't try to run it twice.
`,

  comparisons: [
    {
      label: "Two decades of hand-rolled migrations, automated",
      intro:
        "Add a bio column to users. The left side is the runner you have written (or inherited) a dozen times; the right side is the same architecture with the diffing and bookkeeping automated.",
      php: `<?php
// bin/migrate.php — the classic hand-rolled runner
$applied = $pdo->query('SELECT name FROM migrations')
               ->fetchAll(PDO::FETCH_COLUMN);

foreach (glob(__DIR__ . '/../migrations/*.sql') as $file) {
    $name = basename($file);           // 0042_add_user_bio.sql
    if (in_array($name, $applied)) continue;

    $pdo->beginTransaction();
    $pdo->exec(file_get_contents($file));
    $stmt = $pdo->prepare('INSERT INTO migrations (name) VALUES (?)');
    $stmt->execute([$name]);
    $pdo->commit();
    echo "applied $name\\n";
}
// You wrote 0042_add_user_bio.sql by hand, and you picked "0042".`,
      ts: `# 1. Edit the schema (the only manual step):
#    model User { ...  bio String? }

# 2. Generate + apply + regenerate the client:
npx prisma migrate dev --name add_user_bio

# Prisma creates the numbered artifact for you:
#   prisma/migrations/20260707101530_add_user_bio/migration.sql
# containing plain SQL you can read and edit:
#   ALTER TABLE "User" ADD COLUMN "bio" TEXT;

# 3. Bookkeeping lives in _prisma_migrations — the same
#    "which files ran" table your PHP runner maintained.`,
      note: "Same design: ordered SQL files plus a ledger table. Prisma adds the diff (writes the SQL), the timestamp (picks the number), drift detection via the shadow DB, and client regeneration.",
      rightLang: "bash",
    },
    {
      label: "Customising generated SQL: the backfill",
      intro:
        "You made bio required in the schema, but users already has rows. The naive generated migration fails; with --create-only you rewrite it into the safe three-step version before applying.",
      php: `-- What prisma migrate dev generates for \`bio String\`
-- (a required column with no default):

-- AlterTable
ALTER TABLE "User" ADD COLUMN "bio" TEXT NOT NULL;

-- On a populated table Postgres rejects this:
-- ERROR: column "bio" of relation "User"
--        contains null values
-- Prisma even warns you the migration may fail —
-- it cannot invent your backfill logic.`,
      ts: `-- prisma/migrations/20260707103012_add_bio_required/migration.sql
-- generated with: npx prisma migrate dev --create-only
-- then edited by hand before applying:

-- 1. Add as nullable
ALTER TABLE "User" ADD COLUMN "bio" TEXT;

-- 2. Backfill existing rows (your domain logic)
UPDATE "User" SET "bio" = '' WHERE "bio" IS NULL;

-- 3. Now enforce the constraint
ALTER TABLE "User" ALTER COLUMN "bio" SET NOT NULL;`,
      note: "--create-only generates the file without applying it; you edit the SQL, then run migrate dev again. The migration stays a plain, reviewable .sql file — treat editing it as a first-class part of the workflow.",
      leftLang: "sql",
      rightLang: "sql",
    },
    {
      label: "The prod hotfix that never got recorded",
      intro:
        "Someone added an index directly on production during an incident. The old way, that change lives only in someone's memory; Prisma has an explicit reconciliation workflow.",
      php: `# The 2am incident, classic edition:
psql "$PROD_URL" -c \\
  'CREATE INDEX CONCURRENTLY idx_orders_status
     ON orders (status);'

# ...and then it lives nowhere. Staging doesn't have it,
# new environments won't get it, and the next person to
# rebuild from the migrations folder silently loses it.
# Best case: a note in the incident doc nobody re-reads.`,
      ts: `# Capture what prod actually has vs the migrations folder:
npx prisma migrate diff \\
  --from-migrations ./prisma/migrations \\
  --to-url "$PROD_URL" --script
# -> prints: CREATE INDEX idx_orders_status ...

# Back-port it as a real migration file (create-only, paste
# the SQL in), then tell the ledger prod already ran it:
npx prisma migrate resolve \\
  --applied 20260707110000_add_orders_status_idx

# migrate deploy now skips it on prod, applies it elsewhere.`,
      note: "migrate diff answers 'what drifted?'; migrate resolve edits the _prisma_migrations ledger so a back-ported hotfix isn't applied twice. Neither command needs the shadow database.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "You added `bio String?` to the User model in schema.prisma. Predict what migrate dev creates — the folder name pattern, the ledger update, the client regeneration — then reveal the transcript, including the generated SQL.",
    code: `# prisma/schema.prisma changed:
#   model User {
#     id    Int     @id @default(autoincrement())
#     email String  @unique
#     bio   String?   // <-- new
#   }

npx prisma migrate dev --name add_user_bio

# Inspect the artifact it produced:
cat prisma/migrations/20260707101530_add_user_bio/migration.sql`,
    output: `Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "app", schema "public" at "localhost:5432"

Applying migration \`20260707101530_add_user_bio\`

The following migration(s) have been created and applied from new schema changes:

migrations/
  └─ 20260707101530_add_user_bio/
    └─ migration.sql

Your database is now in sync with your schema.

✔ Generated Prisma Client to ./generated/prisma

$ cat prisma/migrations/20260707101530_add_user_bio/migration.sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "bio" TEXT;`,
  },

  keyPoints: [
    "Prisma Migrate is your hand-rolled workflow formalised: ordered SQL files in `prisma/migrations/`, a `_prisma_migrations` ledger table, and a runner — plus automated diffing that writes the SQL.",
    "`prisma migrate dev` replays history in a temporary shadow database to detect drift, generates a new migration from your schema diff, applies it, and regenerates the typed client.",
    "The shadow database is dev-only insurance that the migration folder still rebuilds the schema from scratch; `migrate deploy` and `migrate resolve` never use it.",
    "`--create-only` generates the SQL without applying it so you can edit — backfills, `CREATE INDEX CONCURRENTLY`, multi-step NOT NULL additions. Reviewing and editing generated DDL is a strength, not a hack.",
    "`prisma migrate deploy` is the production command: apply pending migrations in order, record them, no diffing, no prompts — the CI equivalent of your PHP runner.",
    "`prisma db push` prototypes without migration files; `migrate diff` shows what drifted; `migrate resolve --applied` reconciles the ledger after a back-ported hotfix.",
  ],

  interview: [
    {
      q: "Walk me through what happens when you run prisma migrate dev.",
      a: "It's a four-step pipeline. First it recreates a temporary shadow database and replays the whole migration history there, which catches drift — edited migration files or manual changes to my dev DB. Second, it applies any pending migrations, say ones a teammate committed. Third, it diffs my current schema.prisma against that state and generates a new timestamped folder with a plain `migration.sql`. Finally it applies everything unapplied to my dev database, records it in the `_prisma_migrations` table, and regenerates the client so the types match the new schema. Structurally it's the numbered-.sql-files-plus-ledger-table pattern I ran by hand in PHP for years — Prisma just writes the SQL and picks the numbers.",
    },
    {
      q: "Why does Prisma need a shadow database, and why doesn't production need one?",
      a: "The shadow database is how migrate dev proves two things before generating new SQL: that the migration history, replayed from zero, still produces a coherent schema, and that the real dev database hasn't drifted from it via manual changes. It's created and dropped automatically each run, which is why the dev role needs CREATEDB — or you configure a dedicated one on hosted Postgres. Production doesn't need it because `migrate deploy` never diffs anything: it just applies the not-yet-applied files in order and records them. All the schema reasoning happened at development time; deploy is a dumb, deterministic replay — which is exactly what you want in a pipeline.",
    },
    {
      q: "The generated migration adds a NOT NULL column to a table with millions of rows. What do you do?",
      a: "I don't apply the generated file as-is — `ADD COLUMN ... NOT NULL` without a default fails the moment existing rows are present. I run `prisma migrate dev --create-only`, open the generated SQL, and rewrite it as the standard three-step: add the column nullable, backfill with an `UPDATE` (batched if the table is large enough to worry about lock time and WAL volume), then `ALTER COLUMN ... SET NOT NULL`. Then I run migrate dev again to apply. The migration files are plain Postgres SQL and editing them is a supported, documented workflow — it's where 25 years of SQL pays off, because the ORM can diff schemas but it can't know my backfill semantics.",
    },
  ],

  quiz: [
    {
      question: "What is the shadow database used for in Prisma Migrate?",
      options: [
        "A read replica that serves queries while migrations run on the primary",
        "A dev-time scratch database where migrate dev replays history to detect drift before generating new SQL",
        "The database migrate deploy applies migrations to before production",
        "A backup Prisma restores automatically if a migration fails",
      ],
      answerIndex: 1,
      explain:
        "The shadow database is created and dropped by migrate dev on each run. Replaying the full migration history there proves the folder still reconstructs the expected schema and exposes drift or destructive changes — before anything touches your real database. Production commands like migrate deploy never use it.",
    },
    {
      question:
        "You need to add a backfill UPDATE to a migration before it runs. What is the supported workflow?",
      options: [
        "Edit schema.prisma to include the UPDATE statement",
        "Run prisma db push, then run the UPDATE manually",
        "Run prisma migrate dev --create-only, edit the generated migration.sql, then run prisma migrate dev to apply",
        "Migrations are generated and applied atomically — SQL can never be customised",
      ],
      answerIndex: 2,
      explain:
        "--create-only generates the migration file without applying it. Because the artifact is plain SQL, you edit it — add the backfill, split a NOT NULL addition into steps — and a subsequent migrate dev applies your edited version. db push would bypass migration files entirely.",
    },
    {
      question:
        "A hotfix index was created directly on production. How do you reconcile it with the migration history?",
      options: [
        "Run prisma migrate dev against production to regenerate the history",
        "Delete the _prisma_migrations table so Prisma rebuilds it",
        "Run prisma db push --force-reset on production",
        "Capture the change with migrate diff, back-port it as a migration file, and mark it applied on prod with migrate resolve --applied",
      ],
      answerIndex: 3,
      explain:
        "migrate diff shows the SQL delta between the migrations folder and the live database; you paste that into a new migration (create-only) so every other environment gets it, then migrate resolve --applied updates production's ledger so deploy doesn't run it twice. migrate dev is a development-only command and should never point at production.",
    },
  ],
};

export default lesson;
