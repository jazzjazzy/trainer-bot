import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "prisma-schema-modelling",
  title: "Modelling Tables in Prisma Schema Language",
  part: "Schema & Migrations",
  estMinutes: 12,
  summary:
    "The Prisma schema is a declarative DSL that compiles to the CREATE TABLE you would have written by hand — and the same file simultaneously drives the generated client types.",

  concept: `
You have written thousands of \`CREATE TABLE\` statements. Prisma asks you to
write them once more, in its own DSL — and in exchange, that single file
becomes the source of truth for **two** artifacts: the migration SQL that
\`prisma migrate\` emits, and the TypeScript types that \`prisma generate\`
emits. Change a model, and both the database and the compiler learn about it.

### Anatomy of a model

\`\`\`ts
// prisma/schema.prisma
model Article {
  id        Int      @id @default(autoincrement())
  title     String
  slug      String   @unique
  body      String?  @db.Text
  published Boolean  @default(false)
  createdAt DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("articles")
}
\`\`\`

Read it as DDL with the clauses inverted: the field *type* carries
nullability (\`String\` is NOT NULL, \`String?\` is nullable — the opposite
default from SQL, where columns are nullable unless you say otherwise), and
\`@\`-attributes carry everything you'd put after the type.

### Scalar types and their Postgres mappings

Prisma scalars are deliberately generic; each has a default Postgres mapping
you can override with \`@db.*\` native-type attributes:

| Prisma | Postgres default | Common override |
| --- | --- | --- |
| \`String\` | \`text\` | \`@db.VarChar(255)\` |
| \`Int\` / \`BigInt\` | \`integer\` / \`bigint\` | — |
| \`Boolean\` | \`boolean\` | — |
| \`DateTime\` | \`timestamp(3)\` | \`@db.Timestamptz(6)\` |
| \`Decimal\` | \`decimal(65,30)\` | \`@db.Decimal(10,2)\` |
| \`Json\` | \`jsonb\` | — |

The \`timestamp(3)\` default should raise your eyebrow: no time zone. For real
systems, \`@db.Timestamptz(6)\` gives you the \`timestamptz\` you would have
chosen yourself. Likewise \`Decimal\`'s absurd default precision is worth
pinning down for money columns.

### Primary keys: autoincrement() vs uuid()

\`@id @default(autoincrement())\` maps to \`SERIAL\` in the emitted DDL. But
watch \`@default(uuid())\`: that default is applied by **Prisma Client at
insert time**, not by Postgres — the migration creates a plain \`TEXT NOT
NULL\` column with *no* DB default. A raw \`INSERT\` from psql or another app
gets no UUID. If you want the database itself to own the default (you usually
do), say so explicitly: \`@default(dbgenerated("gen_random_uuid()")) @db.Uuid\`.

### snake_case tables under camelCase fields

Your Postgres conventions say \`created_at\`; idiomatic TS says \`createdAt\`.
\`@map("created_at")\` renames a column and \`@@map("articles")\` renames the
table, so the database keeps your naming standard while the generated client
exposes camelCase. Nothing about the SQL changes — it is purely a naming
bridge.

### @default(now()) and @updatedAt — one is real, one is not

\`@default(now())\` becomes a genuine \`DEFAULT CURRENT_TIMESTAMP\` in the DDL:
any client that inserts a row gets it. \`@updatedAt\` is different — it emits
**no DDL at all**. Prisma Client sets the value on every \`update()\` call,
replacing the \`ON UPDATE CURRENT_TIMESTAMP\` trick from MySQL or the
\`BEFORE UPDATE\` trigger you wrote in Postgres. The trade-off is the same as
\`uuid()\`: run an \`UPDATE\` from psql, a cron job, or a non-Prisma service,
and \`updated_at\` silently stays stale. If multiple writers touch the table,
keep the trigger.

Everything above lands in versioned SQL when you run \`prisma migrate dev\` —
which is the next thing to look at, and exactly what the playground below asks
you to predict.
`,

  comparisons: [
    {
      label: "CREATE TABLE, translated to a model block",
      intro:
        "The same articles table, defined twice: the DDL you would write by hand, and the Prisma model that generates equivalent DDL plus a typed client.",
      php: `CREATE TABLE articles (
    id         integer GENERATED ALWAYS AS IDENTITY
                       PRIMARY KEY,
    title      text NOT NULL,
    slug       text NOT NULL UNIQUE,
    body       text,
    published  boolean NOT NULL DEFAULT false,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);`,
      ts: `// prisma/schema.prisma
model Article {
  id        Int      @id @default(autoincrement())
  title     String
  slug      String   @unique
  body      String?
  published Boolean  @default(false)
  createdAt DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  @@map("articles")
}`,
      note:
        "Nullability is inverted: SQL columns are nullable unless you add NOT NULL, while Prisma fields are required unless you add ? — and note Prisma emits SERIAL for autoincrement(), not the GENERATED ALWAYS AS IDENTITY you would write in modern Postgres.",
      leftLang: "sql",
    },
    {
      label: "updated_at: trigger vs @updatedAt",
      intro:
        "Keep an updated_at column current on every write. In Postgres you wire a trigger; Prisma moves the job into the client library.",
      php: `-- The Postgres way: the DATABASE owns the behaviour
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER articles_touch
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
-- Works for EVERY writer: psql, cron, other apps.`,
      ts: `// prisma/schema.prisma
model Article {
  id        Int      @id @default(autoincrement())
  title     String
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("articles")
}

// @updatedAt emits NO DDL — no default, no trigger.
// Prisma Client sets the value itself on update():
await prisma.article.update({
  where: { id: 1 },
  data: { title: "New title" }, // updatedAt set here, by the client
});`,
      note:
        "@updatedAt only fires for writes that go through Prisma Client — a raw UPDATE from psql or another service leaves the column stale, so keep the trigger when the table has multiple writers.",
      leftLang: "sql",
    },
    {
      label: "UUID primary keys: who generates the value?",
      intro:
        "Both snippets give articles a UUID primary key — but they disagree about whether Postgres or the application generates it.",
      php: `-- The database owns the default: every INSERT
-- from any client gets a UUID.
CREATE TABLE articles (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL
);

INSERT INTO articles (title) VALUES ('Hello');
-- id filled in by Postgres itself`,
      ts: `// prisma/schema.prisma

// Option A: Prisma Client generates the UUID at insert
// time — the column has NO default in the database!
model Article {
  id    String @id @default(uuid())
  title String
}

// Option B: the database owns the default, like your DDL
model ArticleDb {
  id    String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title String
}`,
      note:
        "@default(uuid()) is applied in the client library, so raw SQL inserts get no id; @default(dbgenerated(...)) puts the DEFAULT clause in the migration DDL where every writer benefits.",
      leftLang: "sql",
    },
  ],

  playground: {
    lang: "sql",
    intro:
      "Read the schema.prisma model in the comments and predict the exact migration SQL prisma migrate dev generates — watch for what @updatedAt does and does not emit. Then reveal the output.",
    code: `-- Predict the migration for this schema.prisma model:
--
--   model Article {
--     id        Int      @id @default(autoincrement())
--     title     String
--     slug      String   @unique
--     body      String?
--     published Boolean  @default(false)
--     createdAt DateTime @default(now()) @map("created_at")
--     updatedAt DateTime @updatedAt @map("updated_at")
--
--     @@map("articles")
--   }
--
-- Questions to answer before revealing:
--   1. What column type does autoincrement() become?
--   2. Which columns are NOT NULL?
--   3. What DDL does @updatedAt produce?
--   4. How is @unique enforced — column constraint or index?`,
    output: `-- prisma/migrations/20260707120000_init/migration.sql

-- CreateTable
CREATE TABLE "articles" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- Notes on the surprises:
--   autoincrement()  -> SERIAL (not GENERATED ALWAYS AS IDENTITY)
--   DateTime         -> TIMESTAMP(3), no time zone unless @db.Timestamptz
--   @updatedAt       -> updated_at gets NO default and NO trigger:
--                       Prisma Client maintains it at update() time
--   @unique          -> a separate CREATE UNIQUE INDEX, not a column clause`,
  },

  keyPoints: [
    "One schema.prisma file drives two artifacts: `prisma migrate` derives the SQL migrations and `prisma generate` derives the client types — the model block is the single source of truth for both.",
    "Nullability is inverted from SQL: Prisma fields are NOT NULL by default, and `String?` opts *into* nullable — the opposite of a bare `text` column.",
    "Prisma scalars have Postgres defaults you should sometimes override with `@db.*`: `DateTime` is `timestamp(3)` (no zone) unless you add `@db.Timestamptz(6)`, and `Decimal` defaults to `decimal(65,30)`.",
    "`@default(now())` and `autoincrement()` are real database defaults in the DDL, but `@default(uuid())` and `@updatedAt` are applied by Prisma Client at query time — raw SQL writers bypass them entirely.",
    "`@map`/`@@map` let the database keep snake_case names while the generated client exposes camelCase — a pure naming bridge with no effect on the SQL semantics.",
    "`@unique` compiles to a separate `CREATE UNIQUE INDEX \"table_col_key\"`, and `@id @default(autoincrement())` compiles to `SERIAL` with a named `_pkey` constraint.",
  ],

  interview: [
    {
      q: "In Prisma, what's the difference between @default(now()) and @updatedAt?",
      a: "They live at different layers. \`@default(now())\` compiles to a real \`DEFAULT CURRENT_TIMESTAMP\` in the migration DDL, so any writer — Prisma, psql, a cron job — gets the timestamp. \`@updatedAt\` emits no DDL at all; Prisma Client sets the value itself on every \`update()\`, replacing the \`BEFORE UPDATE\` trigger I'd have written in Postgres or MySQL's \`ON UPDATE CURRENT_TIMESTAMP\`. The consequence is that \`@updatedAt\` only works for writes that go through Prisma Client. On a table with multiple writers I'd keep a database trigger, because client-side conveniences don't protect data the client never sees.",
    },
    {
      q: "How would you model a snake_case Postgres schema in Prisma without giving up camelCase in your TypeScript?",
      a: "With the mapping attributes: \`@map(\"created_at\")\` on fields and \`@@map(\"articles\")\` on models. The database keeps the naming convention my DBA side insists on, and the generated client exposes \`article.createdAt\`. It's purely a naming bridge — the emitted DDL uses the mapped names, the types use the field names, and no runtime translation cost exists beyond what the client already does. This matters when introspecting an existing PHP-era database: \`prisma db pull\` brings in snake_case names, and you add \`@map\`s to clean up the API without touching the schema.",
    },
    {
      q: "Why might @default(uuid()) surprise someone who expects database-owned defaults?",
      a: "Because it isn't one. \`@default(uuid())\` tells Prisma Client to generate the UUID at insert time; the migration creates the column with no \`DEFAULT\` clause. Insert a row from psql or another service and you get a NOT NULL violation, not a UUID. If I want the database to own it — which I usually do, having been burned by application-owned defaults before — I write \`@default(dbgenerated(\"gen_random_uuid()\")) @db.Uuid\`, which puts \`DEFAULT gen_random_uuid()\` into the DDL. The general lesson: in Prisma, always ask whether a schema feature compiles to SQL or to client behaviour.",
    },
  ],

  quiz: [
    {
      question:
        "What does the field `body String?` in a Prisma model compile to in Postgres?",
      options: [
        "body text NOT NULL",
        "body text (nullable)",
        "body varchar(255) NULL",
        "body text with a DEFAULT of empty string",
      ],
      answerIndex: 1,
      explain:
        "String maps to text on Postgres, and the ? suffix opts into nullability. Note the inversion from SQL: Prisma fields are NOT NULL by default and ? relaxes that, whereas SQL columns are nullable unless you add NOT NULL.",
    },
    {
      question:
        "A teammate runs a bulk UPDATE from psql on a table whose Prisma model has `updatedAt DateTime @updatedAt`. What happens to updated_at?",
      options: [
        "Postgres updates it via the default Prisma created",
        "A Prisma-generated trigger updates it",
        "Nothing — @updatedAt emits no DDL, so the column stays stale for non-Prisma writes",
        "The next prisma generate backfills the correct values",
      ],
      answerIndex: 2,
      explain:
        "@updatedAt is implemented entirely inside Prisma Client, which sets the value on update() calls. The migration contains no default and no trigger for that column, so any write that bypasses the client leaves it untouched — the reason multi-writer tables should keep a real trigger.",
    },
    {
      question:
        "Which Prisma attribute produces a genuine DEFAULT clause in the migration SQL?",
      options: [
        "@default(now())",
        "@default(uuid())",
        "@updatedAt",
        "@map(\"created_at\")",
      ],
      answerIndex: 0,
      explain:
        "@default(now()) compiles to DEFAULT CURRENT_TIMESTAMP in the DDL. uuid() and @updatedAt are applied by Prisma Client at query time (no DDL), and @map only renames the column. Distinguishing DB-level from client-level behaviour is the key skill for reading a Prisma schema.",
    },
    {
      question:
        "What DDL does `slug String @unique` generate on Postgres?",
      options: [
        "A UNIQUE column constraint inline in CREATE TABLE",
        "A separate CREATE UNIQUE INDEX \"articles_slug_key\" statement",
        "A CHECK constraint comparing against existing rows",
        "Nothing — uniqueness is validated by Prisma Client before insert",
      ],
      answerIndex: 1,
      explain:
        "Prisma emits uniqueness as a standalone CREATE UNIQUE INDEX named table_column_key. Semantically it's equivalent to the inline constraint (Postgres backs both with a unique index), and crucially it IS database-enforced — unlike uuid() or @updatedAt, this one is not a client-side feature.",
    },
  ],
};

export default lesson;
