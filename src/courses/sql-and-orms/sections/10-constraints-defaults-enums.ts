import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "constraints-defaults-enums",
  title: "Constraints, Defaults, and Enums",
  part: "Schema & Migrations",
  estMinutes: 11,
  summary:
    "Composite uniques, CHECK constraints, and native enums all belong in the database — here is how each ORM expresses them, and where Prisma's DSL runs out and hand-written migration SQL takes over.",

  concept: `
Twenty-five years of production databases teach one rule: the application
validates for *user experience*, the database constrains for *truth*. Every
app that shares a database eventually gets a second writer — a cron job, an
import script, an intern with psql — and only DB-level constraints survive
that. Here is how far each ORM's schema layer takes you.

### Composite unique constraints

One slug per author — a two-column unique. Both ORMs express it:

\`\`\`ts
// prisma/schema.prisma
model Post {
  id       Int    @id @default(autoincrement())
  authorId Int
  slug     String

  @@unique([authorId, slug])   // -> CREATE UNIQUE INDEX "Post_authorId_slug_key"
}
\`\`\`

\`\`\`ts
// Drizzle: constraints go in the third argument of pgTable
import { pgTable, serial, integer, text, unique, uniqueIndex } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull(),
  slug: text("slug").notNull(),
}, (t) => [
  unique("posts_author_slug").on(t.authorId, t.slug),
  // or uniqueIndex("...").on(...) for the index form
]);
\`\`\`

Bonus: both feed the type layer — Prisma generates a compound
\`authorId_slug\` unique-where input, so \`findUnique\` can target the pair.

### CHECK constraints: Drizzle has them, Prisma's DSL does not

Drizzle treats checks as first-class, using its \`sql\` operator:

\`\`\`ts
import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  priceCents: integer("price_cents").notNull(),
}, (t) => [
  check("price_positive", sql\`\${t.priceCents} > 0\`),
]);
\`\`\`

Prisma's schema language **cannot represent CHECK constraints** — the docs
list them as "not yet directly representable in Prisma schema". They are still
fully usable: generate the migration without applying it
(\`prisma migrate dev --create-only\`), add
\`ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)\` to the \`migration.sql\` by
hand, then apply. Postgres enforces the check for every writer; Prisma Client
surfaces violations as errors. The cost is invisibility — introspection keeps
your models but the check never appears in \`schema.prisma\`, so document it.

### Native enums

Both ORMs map to a real Postgres \`CREATE TYPE ... AS ENUM\`:

\`\`\`ts
// prisma/schema.prisma
enum OrderStatus {
  PENDING
  PAID
  SHIPPED
}

model Order {
  id     Int         @id @default(autoincrement())
  status OrderStatus @default(PENDING)
}
\`\`\`

\`\`\`ts
// Drizzle
import { pgEnum } from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", ["pending", "paid", "shipped"]);

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  status: orderStatus("status").notNull().default("pending"),
});
\`\`\`

Both also project the enum into TypeScript as a union type, so
\`status: "paide"\` is a compile error *and* an insert error.

### The enum trade-off you should raise in interviews

A DB enum gives you 4-byte storage, guaranteed integrity for every writer, and
self-documenting \`\\dT+\` output. The pain is operational: **adding** a value is
easy (\`ALTER TYPE order_status ADD VALUE 'refunded'\`) — though before
Postgres 12 it couldn't run inside a transaction, and even now the new value
can't be used in the same transaction that added it, which trips up migration
tools that wrap everything in one transaction. **Removing or reordering**
values is not supported at all: you create a new type, \`ALTER\` the column
across, and drop the old one. The pragmatic alternative — \`text\` plus a CHECK
constraint listing allowed values — is one \`ALTER TABLE DROP CONSTRAINT\`/
\`ADD CONSTRAINT\` away from any change, at the cost of a few bytes per row.
Knowing when to pick which is exactly the judgement a senior data hand brings.
`,

  comparisons: [
    {
      label: "ALTER TABLE ADD CONSTRAINT vs schema-code constraints",
      intro:
        "Add a composite unique and a positivity check to an existing mental model of a table. Left: the DDL you would write. Right: the Drizzle table that generates it.",
      php: `ALTER TABLE products
  ADD CONSTRAINT products_sku_vendor_unique
  UNIQUE (sku, vendor_id);

ALTER TABLE products
  ADD CONSTRAINT price_positive
  CHECK (price_cents > 0);`,
      ts: `// src/db/schema.ts
import { sql } from "drizzle-orm";
import {
  pgTable, serial, integer, text, unique, check,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull(),
  vendorId: integer("vendor_id").notNull(),
  priceCents: integer("price_cents").notNull(),
}, (t) => [
  unique("products_sku_vendor_unique").on(t.sku, t.vendorId),
  check("price_positive", sql\`\${t.priceCents} > 0\`),
]);`,
      note:
        "Drizzle's third pgTable argument holds table-level constraints, and check() embeds raw SQL via the sql operator — Prisma's DSL can express the @@unique but the CHECK would have to be hand-added to migration SQL.",
      leftLang: "sql",
    },
    {
      label: "Validating in PHP vs constraining in Postgres",
      intro:
        "Guarantee price is positive. The PHP guard protects one code path; the constraint protects the table from every writer that will ever exist.",
      php: `<?php
// Protects THIS code path only.
function createProduct(PDO $pdo, string $sku, int $priceCents): void
{
    if ($priceCents <= 0) {
        throw new InvalidArgumentException('price must be positive');
    }
    $stmt = $pdo->prepare(
        'INSERT INTO products (sku, price_cents) VALUES (?, ?)'
    );
    $stmt->execute([$sku, $priceCents]);
}
// The import script, the admin panel, and the intern
// with psql all skip this function.`,
      ts: `-- Protects EVERY code path, forever:
ALTER TABLE products
  ADD CONSTRAINT price_positive
  CHECK (price_cents > 0);

-- Any writer that tries...
INSERT INTO products (sku, price_cents)
VALUES ('WIDGET-1', -500);

-- ...is refused by the database itself:
-- ERROR:  new row for relation "products" violates
--         check constraint "price_positive"`,
      note:
        "Keep the app-level check too — it gives users a friendly error before a round-trip — but treat it as UX, not integrity; only the database constraint binds the cron job and the psql session.",
      rightLang: "sql",
    },
    {
      label: "Native enum: CREATE TYPE vs pgEnum vs Prisma enum",
      intro:
        "An order-status enum, three ways. All three produce the same Postgres type; the ORM versions also project it into TypeScript as a union.",
      php: `CREATE TYPE order_status AS ENUM
  ('pending', 'paid', 'shipped');

CREATE TABLE orders (
    id     serial PRIMARY KEY,
    status order_status NOT NULL
           DEFAULT 'pending'
);

-- Later, the easy direction:
ALTER TYPE order_status ADD VALUE 'refunded';
-- Removing a value? New type, column migration,
-- drop old type. There is no easy direction.`,
      ts: `// Drizzle
export const orderStatus = pgEnum("order_status",
  ["pending", "paid", "shipped"]);

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  status: orderStatus("status").notNull().default("pending"),
});
// status is typed "pending" | "paid" | "shipped"

// Prisma (schema.prisma) — same DDL emitted:
// enum OrderStatus {
//   PENDING
//   PAID
//   SHIPPED
// }
// model Order {
//   status OrderStatus @default(PENDING)
// }`,
      note:
        "Both ORMs emit CREATE TYPE ... AS ENUM and give you a compile-time union on top — but the ALTER pain is identical in all three worlds, because it lives in Postgres, not in the schema tool.",
      leftLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A status union type plus a transition table — the TypeScript half of what a DB enum and CHECK constraint enforce. Predict which of the four transitions are rejected, then try adding a 'refunded' status.",
    code: `// The TS-side twin of a Postgres enum + CHECK constraint.

// Union type = compile-time enum ("paide" won't compile):
type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";

// Legal state transitions — what a CHECK constraint or trigger
// would enforce for EVERY writer at the database level:
const transitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: [],     // terminal
  cancelled: [],   // terminal
};

function transition(from: OrderStatus, to: OrderStatus): string {
  const ok = transitions[from].includes(to);
  return from + " -> " + to + ": " + (ok ? "OK" : "REJECTED");
}

console.log(transition("pending", "paid"));
console.log(transition("paid", "shipped"));
console.log(transition("shipped", "cancelled"));
console.log(transition("cancelled", "paid"));

// The compile-time guarantee:
// transition("pending", "paide");
//                        ^^^^^^^ not assignable to OrderStatus

// Try it: add "refunded" to the union. The compiler then forces
// you to give it a row in the transitions map — a Record over a
// union must be exhaustive. Adding a value to a Postgres enum is one
// ALTER TYPE ... ADD VALUE; removing one means a new type and a
// column migration. The union changes in one line either way.`,
  },

  keyPoints: [
    "App-side validation is UX; the database constraint is truth — every shared database eventually gets a writer that skips your application layer.",
    "Composite uniques: Prisma's `@@unique([authorId, slug])` and Drizzle's `unique().on(t.authorId, t.slug)` (or `uniqueIndex`) in pgTable's third argument both compile to the DDL you'd write by hand — and both feed the type layer with compound lookup inputs.",
    "Drizzle expresses CHECK constraints first-class: a `check(\"price_positive\", sql...)` entry in the table's constraint array, with the condition written via the sql operator.",
    "Prisma's schema DSL cannot represent CHECK constraints — the workflow is `prisma migrate dev --create-only`, hand-add the `ALTER TABLE ... ADD CONSTRAINT ... CHECK`, then apply; Postgres enforces it, but it stays invisible to schema.prisma and introspection.",
    "Prisma's `enum` block and Drizzle's `pgEnum` both emit `CREATE TYPE ... AS ENUM` and project it into TS as a union, so illegal values fail at compile time and at the database.",
    "Enum operations are asymmetric in Postgres: `ALTER TYPE ... ADD VALUE` is cheap (with transaction caveats), but removing/reordering values means creating a new type and migrating the column — the reason `text` + CHECK is sometimes the wiser choice for volatile value sets.",
  ],

  interview: [
    {
      q: "Where do you put data validation: the application or the database?",
      a: "Both, for different reasons. Application checks exist for user experience — fast, friendly errors before a round-trip. Database constraints exist for integrity: every real system eventually has a second writer — an import script, a cron job, someone in psql — and only NOT NULL, UNIQUE, FK, and CHECK constraints bind all of them. My rule from 25 years of shared databases: anything that must *never* be false about the data goes into DDL; the app layer merely duplicates it politely. With typed ORMs there's now a third layer — TS unions and required insert fields catch a class of mistakes at compile time — but that's still developer experience, not enforcement, because types are erased at runtime.",
    },
    {
      q: "How do you add a CHECK constraint when using Prisma, given its schema language doesn't support them?",
      a: "Through the migration files, which are plain SQL. I run \`prisma migrate dev --create-only\` so Prisma generates the migration without applying it, hand-add \`ALTER TABLE products ADD CONSTRAINT price_positive CHECK (price_cents > 0)\` to the generated \`migration.sql\`, then apply. Postgres enforces it for every writer and Prisma Client surfaces violations as query errors, so nothing is lost functionally. The genuine cost is visibility: the constraint never appears in schema.prisma, and introspection won't bring it in either, so I document it in the schema as a comment. Drizzle avoids the issue — a first-class \`check()\` entry in the table definition, with the condition written via its \`sql\` operator.",
    },
    {
      q: "Native Postgres enum or text column with a CHECK constraint — how do you choose?",
      a: "By how volatile the value set is. A native enum is compact, self-documenting, and both Prisma and Drizzle project it into a TS union — great for genuinely stable sets like weekdays or ISO-ish status codes. Its weakness is operational: \`ALTER TYPE ... ADD VALUE\` is fine (mind the transaction caveats — pre-12 it couldn't run in one, and even now the added value isn't usable in the same transaction), but you cannot remove or reorder values without creating a replacement type and migrating the column. For sets that product will churn — subscription tiers, workflow states — \`text\` plus a CHECK listing allowed values changes with a constraint drop-and-add inside a normal transactional migration. Same integrity guarantee, radically cheaper evolution.",
    },
  ],

  quiz: [
    {
      question:
        "How do you get a CHECK constraint into a Prisma-managed Postgres database?",
      options: [
        "Add @check to the field in schema.prisma",
        "Generate the migration with --create-only and hand-write the ALTER TABLE ... CHECK into the SQL before applying",
        "Prisma Client validates it, so no database constraint is needed",
        "Checks require dropping to Drizzle for that table",
      ],
      answerIndex: 1,
      explain:
        "Prisma's schema DSL cannot represent CHECK constraints, but migrations are plain SQL you own: create-only, edit, apply. Postgres then enforces the check for every writer — the constraint just stays invisible to schema.prisma, so it deserves a comment.",
    },
    {
      question:
        "In Drizzle, where does a check() constraint like price_positive live?",
      options: [
        "Chained onto the column builder like .notNull()",
        "In a separate checks.ts file drizzle-kit discovers",
        "In pgTable's third argument, the table-level constraint array, alongside unique() and indexes",
        "Inside the relations() helper",
      ],
      answerIndex: 2,
      explain:
        "Table-level constraints — check(), unique().on(...), uniqueIndex(), composite PKs — go in pgTable's third argument, a function of the table returning an array. Column-level chaining is for per-column clauses; checks can reference multiple columns, so they live at table level, just like in DDL.",
    },
    {
      question:
        "Why might a migration adding a Postgres enum value AND inserting a row using it fail, even on a current Postgres?",
      options: [
        "Enum values can only be added at type-creation time",
        "ALTER TYPE ... ADD VALUE succeeds, but the new value cannot be used in the same transaction that added it",
        "Enums are limited to the values Prisma or Drizzle originally generated",
        "INSERT statements cannot follow DDL in a migration",
      ],
      answerIndex: 1,
      explain:
        "Since Postgres 12 the ALTER can run inside a transaction, but the freshly added value remains unusable until that transaction commits. Migration tools that wrap each migration in one transaction hit exactly this — the classic fix is splitting the ADD VALUE and its first use into separate migrations.",
    },
    {
      question:
        "What does Prisma's `@@unique([authorId, slug])` give you beyond the database constraint?",
      options: [
        "Nothing — it is DDL only",
        "A generated compound unique input, so findUnique can target the authorId+slug pair with full typing",
        "Automatic deduplication of existing rows",
        "A hash index instead of a btree",
      ],
      answerIndex: 1,
      explain:
        "The schema drives both artifacts: the migration gets CREATE UNIQUE INDEX, and the generated client gets a compound where-input (authorId_slug) usable in findUnique/upsert. One declaration, enforced by Postgres and understood by the compiler.",
    },
  ],
};

export default lesson;
