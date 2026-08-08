import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "drizzle-schema-modelling",
  title: "Modelling Tables in Drizzle pg-core",
  part: "Schema & Migrations",
  estMinutes: 11,
  summary:
    "Drizzle defines tables as plain TypeScript objects with column builders that map one-to-one onto Postgres DDL — and because the schema IS code, you can compose it in ways neither schema.prisma nor raw SQL allows.",

  concept: `
Drizzle's schema is not a DSL — it is TypeScript that *describes* DDL. Each
table is a \`pgTable(...)\` call, each column a builder chain, and each chained
method corresponds to a clause you have typed after a column name for 25
years.

### Column builders map onto DDL clauses

\`\`\`ts
// src/db/schema.ts
import {
  pgTable, serial, integer, text, varchar,
  boolean, timestamp, jsonb,
} from "drizzle-orm/pg-core";

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),                //  id serial PRIMARY KEY
  title: text("title").notNull(),               //  title text NOT NULL
  slug: varchar("slug", { length: 160 })        //  slug varchar(160)
    .notNull()
    .unique(),                                  //    NOT NULL UNIQUE
  body: text("body"),                           //  body text  (nullable)
  published: boolean("published")
    .notNull()
    .default(false),                            //  ... NOT NULL DEFAULT false
  meta: jsonb("meta"),                          //  meta jsonb
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),                              //  timestamptz DEFAULT now()
});
\`\`\`

The defaults mirror SQL, not Prisma: columns are **nullable unless you chain
\`.notNull()\`** — exactly your instinct from writing DDL. Two details worth
flagging: \`timestamp()\` without \`{ withTimezone: true }\` is a naive
\`timestamp\`, so say \`withTimezone\` the way you'd say \`timestamptz\`; and
\`serial()\` is what drizzle-kit emits by default even though your own modern
DDL would prefer \`GENERATED ALWAYS AS IDENTITY\` (an
\`integer().generatedAlwaysAsIdentity()\` builder exists when you want it).

### updated_at: .\$onUpdate() is client-side

\`\`\`ts
updatedAt: timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .\$onUpdate(() => new Date()),
\`\`\`

Every builder prefixed with \`$\` is an application-level feature: \`$onUpdate\`
makes *Drizzle* set the value on every update it executes — same idea and same
caveat as Prisma's \`@updatedAt\`. It is not a trigger; psql writes bypass it.

### Non-public schemas

\`pgSchema\` scopes tables (and enums) to a named Postgres schema, matching
\`CREATE SCHEMA billing; CREATE TABLE billing.invoices (...)\`:

\`\`\`ts
import { pgSchema } from "drizzle-orm/pg-core";

export const billing = pgSchema("billing");
export const invoices = billing.table("invoices", {
  id: serial("id").primaryKey(),
});
\`\`\`

### The schema is a program — compose it

Here is the thing neither \`schema.prisma\` nor raw DDL can do. Because tables
are object literals, shared column sets are just objects you spread:

\`\`\`ts
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .\$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  ...timestamps,
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  ...timestamps,
});
\`\`\`

In DDL you copy-paste those two columns into every \`CREATE TABLE\` (or reach
for inheritance tricks); in Prisma you repeat the two fields in every model.
In Drizzle the convention lives in one constant, and \`drizzle-kit generate\`
reads the final objects to produce the SQL. Row types come straight off the
same objects — \`typeof users.$inferSelect\` — so the one definition feeds the
DDL, the queries, and the types.
`,

  comparisons: [
    {
      label: "CREATE TABLE, translated to pgTable",
      intro:
        "The same articles table twice: hand-written DDL and the Drizzle definition drizzle-kit would turn into equivalent DDL.",
      php: `CREATE TABLE articles (
    id         serial PRIMARY KEY,
    title      text NOT NULL,
    slug       varchar(160) NOT NULL UNIQUE,
    body       text,
    published  boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);`,
      ts: `// src/db/schema.ts
import {
  pgTable, serial, text, varchar, boolean, timestamp,
} from "drizzle-orm/pg-core";

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  body: text("body"),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});`,
      note:
        "Drizzle keeps SQL's nullability default — columns are nullable until you chain .notNull() — and timestamp() needs { withTimezone: true } to mean timestamptz, so your DDL instincts translate clause by clause.",
      leftLang: "sql",
    },
    {
      label: "The same model in Prisma and in Drizzle",
      intro:
        "One table, both ORMs — the side-by-side fluency you need when a team debates which to adopt. Same DDL comes out of both.",
      php: `// prisma/schema.prisma
model Article {
  id        Int      @id @default(autoincrement())
  title     String
  slug      String   @unique @db.VarChar(160)
  body      String?
  published Boolean  @default(false)
  createdAt DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  @@map("articles")
}`,
      ts: `// src/db/schema.ts
import {
  pgTable, serial, text, varchar, boolean, timestamp,
} from "drizzle-orm/pg-core";

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  body: text("body"),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});`,
      note:
        "Prisma needs @map/@@map to bridge camelCase fields onto snake_case DDL; Drizzle states both names inline (TS key, SQL name as the builder's first argument) — and Prisma is required-by-default while Drizzle is nullable-by-default.",
      leftLang: "ts",
    },
    {
      label: "Shared columns: copy-paste vs composition",
      intro:
        "Every table in the system carries created_at and updated_at. DDL repeats the columns per table; Drizzle defines them once and spreads.",
      php: `CREATE TABLE users (
    id         serial PRIMARY KEY,
    email      text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE posts (
    id         serial PRIMARY KEY,
    title      text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- Convention enforced by review and vigilance.`,
      ts: `// The convention is a constant, not a habit:
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull().defaultNow().\$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  ...timestamps,
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  ...timestamps,
});`,
      note:
        "Because the schema is a TypeScript program, shared column sets, naming helpers, and factory functions are ordinary code — something neither raw DDL nor schema.prisma's declarative blocks can express.",
      leftLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of Drizzle's composable-schema trick: a shared timestamps object spread into two table definitions. Predict the logged column lists, then try adding a deletedAt column to the helper.",
    code: `// Drizzle's schema-is-code superpower, modelled in miniature.
// A "column builder" is just data here:
function column(sqlType: string, ...modifiers: string[]) {
  return { sqlType, modifiers };
}
type Column = ReturnType<typeof column>;

// The shared convention, defined ONCE:
const timestamps = {
  createdAt: column("timestamptz", "NOT NULL", "DEFAULT now()"),
  updatedAt: column("timestamptz", "NOT NULL", "$onUpdate(client-side)"),
};

// A fake pgTable that just records its shape:
function pgTable(name: string, columns: Record<string, Column>) {
  return { name, columns };
}

// Two tables, one spread each — no copy-paste:
const users = pgTable("users", {
  id: column("serial", "PRIMARY KEY"),
  email: column("text", "NOT NULL", "UNIQUE"),
  ...timestamps,
});

const posts = pgTable("posts", {
  id: column("serial", "PRIMARY KEY"),
  title: column("text", "NOT NULL"),
  authorId: column("integer", "REFERENCES users(id)"),
  ...timestamps,
});

for (const table of [users, posts]) {
  console.log(table.name + ": " + Object.keys(table.columns).join(", "));
}

const created = posts.columns.createdAt;
console.log("posts.created_at -> " + created.sqlType + " " + created.modifiers.join(" "));

// Try it: add deletedAt: column("timestamptz") to the timestamps
// object above — BOTH tables pick it up on the next run.`,
  },

  keyPoints: [
    "A Drizzle table is a `pgTable(\"sql_name\", { ...columns })` call; each column builder chain (`text(...).notNull().unique()`) maps clause-for-clause onto the DDL you would write by hand.",
    "Nullability follows SQL, not Prisma: columns are nullable until you chain `.notNull()` — the opposite default from Prisma's required-unless-`?` fields.",
    "`timestamp(\"col\", { withTimezone: true })` is how you say `timestamptz`; without the option you get a naive `timestamp`, the same trap as Prisma's `DateTime` default.",
    "`$`-prefixed builders like `.$onUpdate(() => new Date())` are application-level — Drizzle sets the value on updates it executes, no trigger is created, and raw SQL writers bypass it.",
    "`pgSchema(\"billing\")` scopes tables and enums to a non-public Postgres schema, mirroring `CREATE SCHEMA` + qualified table names.",
    "Because the schema is ordinary TypeScript, shared column sets are objects you spread into every table — one `timestamps` constant replaces the copy-paste discipline DDL and schema.prisma both require.",
  ],

  interview: [
    {
      q: "How does defining a schema in Drizzle differ from Prisma's schema file, practically?",
      a: "Prisma's schema is a DSL that gets compiled — into migration SQL by \`prisma migrate\` and into a generated client by \`prisma generate\`. Drizzle's schema is TypeScript itself: \`pgTable\` calls whose builder chains mirror DDL clauses, with types read straight off the objects via \`$inferSelect\`. Two practical consequences. First, composition: in Drizzle a shared \`timestamps\` object can be spread into every table, whereas in Prisma you repeat those fields per model — the schema is a program, not a document. Second, defaults: Drizzle keeps SQL's nullable-unless-notNull convention while Prisma inverts it, so my 25 years of DDL instincts transfer more directly to Drizzle.",
    },
    {
      q: "What does .$onUpdate() do in a Drizzle column, and what's its limitation?",
      a: "It registers a function Drizzle runs on every update statement it executes, injecting the result as the column's new value — the standard use is \`updatedAt: timestamp(...).\$onUpdate(() => new Date())\`. The \`$\` prefix is Drizzle's signal that this is application-level, not DDL: no trigger and no default is created, exactly like Prisma's \`@updatedAt\`. The limitation follows directly — any write that doesn't go through this Drizzle instance, whether psql, a cron job, or another service, leaves the column stale. Having maintained multi-writer databases, I'd keep a \`BEFORE UPDATE\` trigger for tables other systems touch, and use \`$onUpdate\` only when the app is the sole writer.",
    },
    {
      q: "You need timestamptz columns, not timestamp. How do you get them in Drizzle, and why does it matter?",
      a: "\`timestamp(\"created_at\", { withTimezone: true })\` — without that option Drizzle emits a naive \`timestamp\`, the same silent trap as Prisma's default \`TIMESTAMP(3)\`. It matters for the reason every Postgres veteran knows: naive timestamps store wall-clock time with no zone, so data written from servers in different zones, or across a DST change, becomes ambiguous. \`timestamptz\` normalises to UTC on the way in. Since the schema is code, I'd bake the choice into a shared helper — a \`timestamps\` object spread into every table — so nobody on the team can forget the option on table forty-seven.",
    },
  ],

  quiz: [
    {
      question:
        "In Drizzle's pg-core, what is the nullability of `bio: text(\"bio\")` with no further chaining?",
      options: [
        "NOT NULL — Drizzle fields are required by default like Prisma's",
        "Nullable — Drizzle follows SQL's default, and .notNull() opts out",
        "It depends on the database's default_null setting",
        "It fails to compile: nullability must be declared explicitly",
      ],
      answerIndex: 1,
      explain:
        "Drizzle mirrors SQL: a column is nullable unless you chain .notNull(). Prisma inverts this (fields are required unless suffixed with ?), which is exactly the kind of cross-ORM detail that trips up teams switching between them.",
    },
    {
      question:
        "What DDL does `.$onUpdate(() => new Date())` on a timestamp column generate?",
      options: [
        "A BEFORE UPDATE trigger calling now()",
        "An ON UPDATE CURRENT_TIMESTAMP clause",
        "None — it's an application-level feature Drizzle applies to updates it executes",
        "A CHECK constraint validating the timestamp",
      ],
      answerIndex: 2,
      explain:
        "The $ prefix marks runtime-only builders. Drizzle injects the callback's result into UPDATE statements it builds, producing no DDL at all — so like Prisma's @updatedAt, it silently misses writes from psql or other services.",
    },
    {
      question:
        "Why can Drizzle share a created_at/updated_at column pair across twenty tables with one definition?",
      options: [
        "drizzle-kit detects duplicated columns and deduplicates them",
        "The schema is plain TypeScript, so a shared object literal can be spread into each pgTable call",
        "Postgres table inheritance is applied automatically",
        "A special @@shared directive marks reusable columns",
      ],
      answerIndex: 1,
      explain:
        "pgTable takes an ordinary object of column builders, so `...timestamps` is standard TS spread syntax. The convention becomes a constant instead of a copy-paste habit — something neither raw DDL nor schema.prisma's declarative model blocks can express.",
    },
  ],
};

export default lesson;
