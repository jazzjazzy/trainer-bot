import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "migrations-in-ci",
  title: "Migrations in CI/CD and Production",
  part: "Production & Choosing",
  estMinutes: 12,
  summary:
    "Ship schema changes as a pipeline step — prisma migrate deploy or drizzle-kit migrate — roll forward only, use expand-and-contract for zero downtime, and respect the locks your SQL brain already knows ALTER TABLE takes.",

  concept: `
You have almost certainly done the 2 a.m. version of this: SSH into the box,
paste an \`ALTER TABLE\` into psql, watch the app, hope. The formal version is
the same SQL — but it runs as a reviewed file, applied by a pipeline step,
in a strict order, exactly once per environment.

### The right command per environment

Both ORMs split their migration tooling into a *development* mode and an
*apply-only* mode, and mixing them up is the classic production incident:

- **Prisma**: \`prisma migrate dev\` is development-only — it diffs against a
  shadow database, generates new migration files, and can reset data.
  Production and CI run \`prisma migrate deploy\`: non-interactive, no shadow
  database, no generation — it just applies pending migrations in order and
  records them in \`_prisma_migrations\`.
- **Drizzle**: \`drizzle-kit generate\` writes the SQL files in development;
  \`drizzle-kit migrate\` applies pending ones (tracked in a journal plus a
  migrations table). \`drizzle-kit push\` diffs the schema straight into the
  database with **no migration file** — prototyping only, never production.

Run the apply step from the pipeline *before* the new application code starts
serving traffic, and make deploys fail hard if migration fails.

### Roll forward, not back

Down-migrations that undo a deployed change sound comforting and are mostly
fiction: once real writes have landed, "undo" means data loss. Production
practice is **roll forward** — if a migration is wrong, you ship a new
migration that fixes it. That constraint is what makes the next pattern
essential.

### Expand and contract: zero-downtime changes

Old code and new code overlap during a deploy, so every schema change must be
compatible with both. The pattern (you likely did this informally in PHP ops):

1. **Expand** — add the new column *nullable* (or with a default), add the new
   table. Old code ignores it; nothing breaks.
2. **Backfill** — copy or compute values in batches, not one giant \`UPDATE\`
   that locks and bloats the table.
3. **Enforce** — deploy code that writes both/new, then add \`NOT NULL\` and
   constraints once every row is valid.
4. **Contract** — after the old code is gone, drop the old column in a later
   release.

### Locks: where your Postgres depth pays off

- Most \`ALTER TABLE\` forms take **ACCESS EXCLUSIVE** — they block *all*
  reads and writes while held. Adding a nullable column is a metadata-only
  change (and since Postgres 11, so is adding one with a constant default) —
  the lock is held for milliseconds. \`SET NOT NULL\` scans the whole table
  under that lock — unless a previously *validated* \`CHECK (col IS NOT
  NULL)\` constraint lets Postgres 12+ skip the scan.
- \`CREATE INDEX\` locks out writes for the whole build. \`CREATE INDEX
  CONCURRENTLY\` doesn't — but it **cannot run inside a transaction**, and
  most migration runners wrap each migration in one. Check your tool's
  escape hatch or apply concurrent index builds as a separate, supervised
  step.
- Set \`lock_timeout\` in migration sessions so a blocked \`ALTER\` fails fast
  instead of queueing behind a long query while everything piles up behind
  *it*.

### Review the SQL, not the diff of the DSL

Generated migration SQL is a code-review artifact. Drizzle hands you the
\`.sql\` file directly; Prisma writes \`migration.sql\` per migration. Read it
in the PR like you'd read a colleague's hand-written DDL — you are the person
on the team who can spot the table rewrite hiding in a one-line schema change.
`,

  comparisons: [
    {
      label: "Adding a NOT NULL column: the outage vs expand-and-contract",
      intro:
        "Both add a mandatory tax_code column to a large busy table. The left version is one migration; the right is the same change split so no step blocks traffic or breaks running code.",
      php: `-- 20260707_add_tax_code.sql  (one risky step)
-- ACCESS EXCLUSIVE lock while EVERY row is checked;
-- and instantly breaks old code still INSERTing
-- without tax_code.
ALTER TABLE invoices
  ADD COLUMN tax_code text NOT NULL DEFAULT 'STD';

-- Postgres 11+ makes the default itself cheap, but the
-- deploy still races the old app version, and any
-- backfill logic beyond a constant can't work this way.`,
      ts: `-- Migration 1 (EXPAND): metadata-only, instant
ALTER TABLE invoices ADD COLUMN tax_code text;

-- App release: new code writes tax_code on every insert.

-- Migration 2 (BACKFILL): batched, no long lock
UPDATE invoices SET tax_code = 'STD'
WHERE tax_code IS NULL AND id BETWEEN 1 AND 50000;
-- ...repeat per batch (script or repeated migration)

-- Migration 3 (ENFORCE): validated check lets PG12+
-- skip the full-table scan under ACCESS EXCLUSIVE
ALTER TABLE invoices
  ADD CONSTRAINT invoices_tax_code_nn
  CHECK (tax_code IS NOT NULL) NOT VALID;
ALTER TABLE invoices
  VALIDATE CONSTRAINT invoices_tax_code_nn;  -- weak lock
ALTER TABLE invoices
  ALTER COLUMN tax_code SET NOT NULL;        -- instant
ALTER TABLE invoices
  DROP CONSTRAINT invoices_tax_code_nn;`,
      note: "Expand-and-contract trades one dangerous migration for several boring ones: each step is fast under lock, and old and new code both work at every point in the sequence.",
      leftLang: "sql",
      rightLang: "sql",
    },
    {
      label: "How the SQL reaches production",
      intro:
        "The same pending migration applied two ways: a human SSHing in with psql, versus a pipeline step that runs on every deploy, in order, exactly once, with the deploy failing if it fails.",
      php: `# The old way: SSH and hope
ssh deploy@prod-db-1

psql -U app -d app_production
app_production=> \\i /tmp/add_tax_code.sql
ALTER TABLE
-- Did staging get this exact file? Did Bob already
-- run half of it on Tuesday? Nobody knows. The
-- schema's history lives in people's memories.`,
      ts: `# .github/workflows/deploy.yml
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      # Apply-only: no generation, no shadow DB,
      # fails the deploy if a migration fails.
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: \${{ secrets.DATABASE_URL }}
  deploy_app:
    needs: migrate     # app ships only after schema
    steps:
      - run: ./deploy-app.sh`,
      note: "The pipeline gives you what SSH never did: ordering, exactly-once tracking in the migrations table, the same artifact across staging and prod, and a deploy that halts when the schema step fails.",
      leftLang: "bash",
      rightLang: "yaml",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "A CI job applies migrations before releasing the app. Three migrations are already recorded; one is pending. Predict what migrate deploy reports before revealing the transcript.",
    code: `# CI job: apply schema changes before the app ships
$ npx prisma migrate deploy

# The migrations directory in this commit:
#   prisma/migrations/
#     20260601120000_init/
#     20260614083000_add_orders/
#     20260628154500_orders_status_index/
#     20260705093000_add_invoices_tax_code/   <- new in this PR
#
# _prisma_migrations in the production DB already
# records the first three.`,
    output: `Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "app_production", schema "public"

4 migrations found in prisma/migrations

Applying migration \`20260705093000_add_invoices_tax_code\`

The following migration(s) have been applied:

migrations/
  └─ 20260705093000_add_invoices_tax_code/
    └─ migration.sql

All migrations have been successfully applied.`,
  },

  keyPoints: [
    "Production applies migrations with `prisma migrate deploy` or `drizzle-kit migrate` — never `migrate dev` (shadow DB, can reset) or `push` (no migration file).",
    "Migrations roll forward only: once real writes exist, an 'undo' migration is a data-loss event — fix mistakes with the next migration.",
    "Expand-and-contract: add nullable → backfill in batches → enforce NOT NULL → drop the old column after old code is retired; every step is compatible with both app versions.",
    "Most `ALTER TABLE` forms take ACCESS EXCLUSIVE; adding a nullable column (or a constant default on PG11+) is metadata-only, but `SET NOT NULL` scans unless a validated CHECK constraint (PG12+) proves it.",
    "`CREATE INDEX CONCURRENTLY` avoids blocking writes but cannot run inside a transaction — and migration runners usually wrap migrations in one, so it needs special handling.",
    "Generated migration SQL is a code-review artifact: read the `.sql` in the PR like hand-written DDL, and set `lock_timeout` so blocked DDL fails fast instead of stalling traffic.",
  ],

  interview: [
    {
      q: "How do schema migrations fit into your CI/CD pipeline?",
      a: "Migrations are files in the repo, reviewed like code — I actually read the generated SQL in the PR, because a one-line schema change can hide a table rewrite. CI runs the full suite against a database built by those same migrations. On deploy, a pipeline step runs the apply-only command — `prisma migrate deploy` or `drizzle-kit migrate` — before the new app version takes traffic, and the deploy aborts if it fails. Development-mode commands like `migrate dev` or `drizzle-kit push` never touch shared environments: one uses a shadow database and can reset data, the other leaves no migration file behind.",
    },
    {
      q: "Walk me through adding a NOT NULL column to a large, busy table with zero downtime.",
      a: "Expand and contract. First migration adds the column nullable — that's a metadata-only change, ACCESS EXCLUSIVE for milliseconds. Then I ship code that writes the value on every insert and update. Backfill happens in batches — keyed ranges, not one giant UPDATE that holds locks and bloats the table. To enforce, I add `CHECK (col IS NOT NULL) NOT VALID`, then `VALIDATE CONSTRAINT` — which takes only a weak lock — and on Postgres 12+ the subsequent `SET NOT NULL` sees the validated constraint and skips the full-table scan entirely. Then drop the redundant check. I'd also set `lock_timeout` so if the ALTER queues behind a long transaction it fails fast rather than blocking everything behind it.",
    },
    {
      q: "Why don't you rely on down-migrations for rollback in production?",
      a: "Because they only work in the demo. Once a migration has been live for even a few minutes, real rows exist that depend on the new shape — dropping a column to 'undo' destroys data, and reversing a backfill is rarely well-defined. So production policy is roll-forward: a bad migration gets a corrective migration, shipped through the same pipeline. The real rollback safety comes from the expand-and-contract discipline — since every step is compatible with the previous app version, I can roll the *application* back at any point without touching the schema.",
    },
  ],

  quiz: [
    {
      question:
        "Which commands are appropriate for applying migrations in production?",
      options: [
        "prisma migrate dev and drizzle-kit push",
        "prisma db push and drizzle-kit generate",
        "prisma migrate deploy and drizzle-kit migrate",
        "prisma migrate reset and drizzle-kit studio",
      ],
      answerIndex: 2,
      explain:
        "migrate deploy and drizzle-kit migrate are the apply-only commands: non-interactive, no shadow database, no schema generation — they run pending migration files in order and record them. migrate dev can reset data, and push writes schema changes with no migration file at all.",
    },
    {
      question:
        "Why does CREATE INDEX CONCURRENTLY need special care in a migration workflow?",
      options: [
        "It takes an ACCESS EXCLUSIVE lock for the whole build",
        "It cannot run inside a transaction, and migration runners typically wrap each migration in one",
        "Postgres only allows it on empty tables",
        "It is deprecated in Postgres 16",
      ],
      answerIndex: 1,
      explain:
        "CONCURRENTLY builds the index without blocking writes, but Postgres forbids it inside a transaction block. Since most migration tools run each migration transactionally, you need the tool's non-transactional escape hatch or a separate supervised step.",
    },
    {
      question:
        "In expand-and-contract, why is the new column added as nullable first rather than NOT NULL immediately?",
      options: [
        "Nullable columns are indexed faster",
        "Old application code still running during the deploy doesn't populate the column, so NOT NULL would break its inserts — and enforcing it would also scan/lock the table before rows are backfilled",
        "Postgres cannot add NOT NULL columns to existing tables",
        "It saves disk space until the backfill completes",
      ],
      answerIndex: 1,
      explain:
        "During a rolling deploy, old and new code overlap. A NOT NULL column with no value from old code fails every legacy insert, and enforcing the constraint before backfilling would require checking rows under an exclusive lock. Nullable-first keeps both app versions valid at every step.",
    },
  ],
};

export default lesson;
