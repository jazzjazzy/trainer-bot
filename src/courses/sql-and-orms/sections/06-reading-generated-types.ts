import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "reading-generated-types",
  title: "Where the Types Come From",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "Prisma generates its client and model types as real code in an output folder, Drizzle infers types structurally from your table objects — and both make insert types looser than select types for the same reason you never list id in an INSERT column list.",

  concept: `
Both ORMs promise the same headline: change the schema, and every query in the
codebase type-checks against the new shape. They get there by opposite routes,
and knowing which route you are on explains almost every day-to-day difference
between them.

### Prisma: types are generated code

Prisma's schema lives in a DSL file (\`schema.prisma\`), which TypeScript cannot
read. So Prisma has a build step: \`prisma generate\` reads the schema and writes
an actual TypeScript client into a folder you choose. In Prisma 7 the generator
block requires an explicit output path:

\`\`\`ts
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}
\`\`\`

After \`prisma generate\`, \`generated/prisma/\` contains real files you can open
and read. You import from there:

\`\`\`ts
import { PrismaClient, Prisma, type User } from "../generated/prisma/client";
\`\`\`

\`User\` is the full-row type — every column, like \`SELECT *\`. The consequence
of codegen: **edit the schema and forget to regenerate, and your types are
stale**. The compiler happily checks against last week's schema.

### Payload types change shape with the query

The generated code is smarter than one interface per table. Prisma computes a
distinct return type from the *arguments* of each call:

\`\`\`ts
const u = await prisma.user.findFirst({ select: { email: true } });
// u: { email: string } | null  — NOT User | null
\`\`\`

Just as \`SELECT email FROM users\` returns a one-column row, \`select\` narrows
the payload type. \`include\` widens it with relations. When you need to name
one of these shapes, \`Prisma.UserGetPayload<{ select: ... }>\` reconstructs it.

### Drizzle: types are inferred, not generated

Drizzle has no build step for types, because its schema is *already*
TypeScript. A \`pgTable(...)\` call returns an object whose type carries every
column's name, SQL type, nullability, and default. You extract row types
structurally:

\`\`\`ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

type User = typeof users.$inferSelect;    // full row, as SELECT * returns it
type NewUser = typeof users.$inferInsert; // what INSERT requires
\`\`\`

\`$inferSelect\` and \`$inferInsert\` are not runtime values — they exist purely
so \`typeof\` has something to grab. Change the table object and every usage
re-checks instantly; there is no "stale client" failure mode.

### Why insert types differ from select types

You have known this rule for decades from writing INSERT column lists by hand:
you never list \`id\` (the sequence fills it), never \`created_at\` (the default
fills it), and nullable columns are optional. The type systems encode exactly
that. On **select**, every column is present: \`id: number\`,
\`createdAt: Date\`, \`name: string | null\`. On **insert**, columns with a
default or a nullable type become *optional properties*; only NOT NULL columns
without defaults stay required. \`NewUser\` above is
\`{ email: string; id?: number; name?: string | null; createdAt?: Date }\` —
the same judgement call you make writing \`INSERT INTO users (email) VALUES (?)\`,
now enforced by the compiler.
`,

  comparisons: [
    {
      label: "Docblock array shapes vs an inferred row type",
      intro:
        "Fetch one user row and describe its shape to tooling. PHP relies on a docblock you maintain by hand; Drizzle derives the type from the table definition itself.",
      php: `<?php
/**
 * The shape is documentation, not enforcement.
 * Rename the column in SQL and this docblock
 * silently lies to your IDE.
 *
 * @return array{id: int, email: string, name: ?string}|false
 */
function findUser(PDO $pdo, int $id): array|false
{
    $stmt = $pdo->prepare(
        'SELECT id, email, name FROM users WHERE id = ?'
    );
    $stmt->execute([$id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}`,
      ts: `// src/db/schema.ts
import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"), // nullable, like your ?string
});

// Derived FROM the table — never hand-maintained:
export type User = typeof users.$inferSelect;
// { id: number; email: string; name: string | null }

// Rename the column above and every use of
// user.name in the codebase goes red.`,
      note:
        "The docblock and the SQL can drift apart forever; typeof users.$inferSelect cannot drift because it IS the table definition, read structurally by the compiler.",
    },
    {
      label: "Hand-written value object vs Prisma's generated model type",
      intro:
        "Give the rest of the codebase a typed User. In PHP you write and maintain a value-object class plus a hydration method; Prisma writes the equivalent type for you on every generate.",
      php: `<?php
// src/Model/User.php — maintained by hand, forever
final class User
{
    public function __construct(
        public readonly int $id,
        public readonly string $email,
        public readonly ?string $name,
        public readonly \\DateTimeImmutable $createdAt,
    ) {}

    /** @param array<string,mixed> $row */
    public static function fromRow(array $row): self
    {
        return new self(
            (int) $row['id'],
            $row['email'],
            $row['name'],
            new \\DateTimeImmutable($row['created_at']),
        );
    }
}`,
      ts: `// prisma/schema.prisma defines the model once:
//   model User {
//     id        Int      @id @default(autoincrement())
//     email     String   @unique
//     name      String?
//     createdAt DateTime @default(now())
//   }

// prisma generate emits the type — you just import it:
import { PrismaClient, type User } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const u: User | null = await prisma.user.findUnique({
  where: { email: "ana@example.com" },
});
// u.createdAt is already a Date — no fromRow() hydration layer.`,
      note:
        "The generated type replaces the whole value-object-plus-hydrator layer — but it only updates when you rerun prisma generate, so a stale client is Prisma's version of a lying docblock.",
    },
    {
      label: "Selecting two columns changes the type",
      intro:
        "Fetch only email and name. In SQL you know the result has exactly two columns; Prisma's payload types encode that same narrowing at compile time.",
      php: `-- The result shape follows the column list,
-- but only in your head and in the docs:
SELECT email, name
FROM users
WHERE id = 42;

--      email       | name
-- -----------------+------
--  ana@example.com | Ana
-- (1 row)`,
      ts: `const u = await prisma.user.findUnique({
  where: { id: 42 },
  select: { email: true, name: true },
});
// u: { email: string; name: string | null } | null
// NOT the full User type.

console.log(u?.email);
console.log(u?.createdAt);
//            ^^^^^^^^^ compile error: createdAt
// was not selected, so it does not exist on u.`,
      note:
        "Prisma computes a fresh payload type per call from the select/include arguments — the compile-time equivalent of 'the result set has exactly the columns you asked for'.",
      leftLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Drizzle's $inferInsert, hand-rolled: derive an Insert type from a Select type with Omit, Pick and Partial, then watch a fake insert apply the defaults. Predict both logged rows before running.",
    code: `// Drizzle's trick, hand-derived: an INSERT type built from a SELECT type.

// The shape SELECT * returns — every column, fully populated:
interface UserSelect {
  id: number;                 // serial PRIMARY KEY        -> default
  email: string;              // text NOT NULL             -> required
  displayName: string | null; // text (nullable)           -> optional
  isAdmin: boolean;           // boolean DEFAULT false     -> default
  createdAt: string;          // timestamptz DEFAULT now() -> default
}

// The columns the database can fill in by itself:
type HasDefault = "id" | "isAdmin" | "createdAt";
type NullableCols = "displayName";

// INSERT shape: required columns stay required, the rest go optional —
// exactly the columns you'd leave out of a hand-written INSERT list.
type UserInsert = Omit<UserSelect, HasDefault | NullableCols> &
  Partial<Pick<UserSelect, HasDefault | NullableCols>>;

// A fake db.insert(...) applying defaults the way Postgres would:
let nextId = 1;
function insertUser(values: UserInsert): UserSelect {
  return {
    id: values.id ?? nextId++,
    email: values.email,
    displayName: values.displayName ?? null,
    isAdmin: values.isAdmin ?? false,
    createdAt: values.createdAt ?? "2026-07-07T09:00:00Z",
  };
}

// Minimal insert — like INSERT INTO users (email) VALUES ($1):
const ana = insertUser({ email: "ana@example.com" });
// Insert that overrides two defaults:
const bob = insertUser({ email: "bob@example.com", isAdmin: true, displayName: "Bob" });

console.log(ana);
console.log(bob);

// Try it: remove email from the first insert — the compiler rejects it,
// just as Postgres rejects a NOT NULL column with no default.`,
  },

  keyPoints: [
    "Prisma types are **generated code**: `prisma generate` writes a client into the `output` folder declared in the generator block (`provider = \"prisma-client\"`, explicit `output` required in Prisma 7), and you import `User` and `PrismaClient` from there.",
    "Drizzle types are **inferred structurally**: `typeof users.$inferSelect` and `typeof users.$inferInsert` read the row shapes straight off the `pgTable` object — no build step, no stale-client failure mode.",
    "Prisma computes a distinct payload type per query: `select: { email: true }` returns `{ email: string }`, not `User` — the compile-time twin of 'the result set has the columns you asked for'.",
    "Insert types are looser than select types because columns with defaults (serial, `DEFAULT now()`) and nullable columns become optional — the same judgement you have applied to INSERT column lists for 25 years.",
    "Prisma's cost is the regenerate step (stale types if you forget); Drizzle's cost is that heavy inference lives in the type checker, so complex schemas lean on tsserver instead of on generated files.",
    "Neither type system exists at runtime — both are erased at compile time; the database's NOT NULL and defaults remain the real enforcement.",
  ],

  interview: [
    {
      q: "Prisma and Drizzle both give you typed query results. How do their type systems actually differ?",
      a: "Prisma generates types as a build artifact: \`prisma generate\` reads the \`schema.prisma\` DSL and writes a real TypeScript client into the configured output folder — model types like \`User\`, plus computed payload types that change shape with \`select\` and \`include\`. Drizzle never generates anything: the schema is TypeScript already, so \`typeof users.$inferSelect\` derives the row type structurally from the \`pgTable\` object. The practical difference is failure modes — Prisma can have a stale client if you edit the schema and forget to regenerate, while Drizzle updates instantly but pushes more inference work onto the compiler. Coming from PHP, both replace the docblock-plus-value-object layer I used to maintain by hand next to my PDO calls.",
    },
    {
      q: "Why does an ORM's insert type differ from its select type for the same table?",
      a: "For the same reason an INSERT column list differs from \`SELECT *\`: the database can fill some columns itself. A serial or identity primary key, a \`DEFAULT now()\` timestamp, and any nullable column don't need to appear in the INSERT, so the insert type marks them optional; only NOT NULL columns without defaults stay required. The select type, by contrast, has every column present and non-optional because a fetched row is always complete. Drizzle exposes this as \`$inferSelect\` versus \`$inferInsert\`, and Prisma bakes the same rule into its create-input types. It's decades of column-list intuition, encoded so the compiler enforces it.",
    },
    {
      q: "What does prisma.user.findMany({ select: { email: true } }) return, type-wise, and why does that matter?",
      a: "It returns \`{ email: string }[]\` — not \`User[]\`. Prisma computes a payload type from the query's arguments, so the static type mirrors the actual result set, exactly like \`SELECT email FROM users\` returning one-column rows. That matters because over-fetching becomes visible: if a function only needs emails, its signature can say so, and accessing \`createdAt\` on that result is a compile error rather than an \`undefined\` at runtime. When I need to name such a shape for a function boundary, \`Prisma.UserGetPayload<{ select: ... }>\` reconstructs it from the same machinery.",
    },
  ],

  quiz: [
    {
      question:
        "In Prisma 7, where does the type for the User model physically come from?",
      options: [
        "TypeScript infers it from the schema.prisma file directly",
        "prisma generate writes a client into the generator's output folder, and you import the type from that generated code",
        "It is declared in @prisma/client's published .d.ts files on npm",
        "The database is introspected at application startup to build it",
      ],
      answerIndex: 1,
      explain:
        "schema.prisma is a DSL TypeScript cannot read, so Prisma has a codegen step: the generator block (provider \"prisma-client\" with a required output path in Prisma 7) writes real files, and imports point at that folder. That is also why forgetting to regenerate leaves you type-checking against a stale schema.",
    },
    {
      question:
        "For a Drizzle table with `id: serial().primaryKey()`, `email: text().notNull()`, and `bio: text()`, what does `typeof users.$inferInsert` require?",
      options: [
        "id, email, and bio — all columns are always required",
        "Only email — id has a default and bio is nullable, so both are optional",
        "Only id — primary keys must always be supplied",
        "Nothing — insert types make every column optional",
      ],
      answerIndex: 1,
      explain:
        "Insert types follow INSERT column-list rules: serial columns have a sequence default and nullable columns can be omitted, so both become optional properties. email is NOT NULL with no default, so it stays required — omit it and the compiler rejects the insert, just as Postgres would.",
    },
    {
      question:
        "You edit schema.prisma to rename a field, but your Prisma-based code still compiles referencing the old name. What is the most likely cause?",
      options: [
        "Prisma keeps old field names as deprecated aliases",
        "TypeScript caches types across builds",
        "You have not rerun prisma generate, so the client code in the output folder still reflects the old schema",
        "Renames require a database migration before types update",
      ],
      answerIndex: 2,
      explain:
        "Prisma's types are generated files, not live inference. Until prisma generate reruns, the output folder still contains last edit's client, and the compiler checks against that stale code. Drizzle has no equivalent failure mode because its types are derived structurally from the TypeScript schema itself.",
    },
  ],
};

export default lesson;
