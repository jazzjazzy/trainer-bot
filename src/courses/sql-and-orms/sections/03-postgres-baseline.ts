import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "postgres-baseline",
  title: "Postgres Refresher Through TS Eyes",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "You already know identity columns, timestamptz, jsonb, enums, and RETURNING — this section shows exactly how each one surfaces in Prisma and Drizzle, and which MySQL-era habits to drop.",

  concept: `
Nothing here is new SQL for you. What's new is the mapping: every Postgres
feature you rely on has a specific spelling in each ORM, and interviews often
probe whether you know *both* sides of that mapping.

### Identity columns: the modern spelling of auto-increment

When you write DDL by hand on Postgres 16, prefer the SQL-standard form:

\`\`\`sql
id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY
\`\`\`

\`SERIAL\` still works but is the legacy idiom — it's really a macro for a
sequence plus a default, with quirks around permissions and dumps. The ORMs
carry some history here: Prisma's \`@default(autoincrement())\` emits
\`SERIAL\`, and Drizzle offers both — a \`serial()\` column type and the
modern \`integer().generatedAlwaysAsIdentity()\`. Knowing why identity
replaced serial is exactly the kind of depth that separates you from
ORM-only candidates.

### Types you'll map constantly

- **\`text\` vs \`varchar(n)\`** — on Postgres there's no performance
  difference; \`text\` is idiomatic. Prisma's \`String\` and Drizzle's
  \`text()\` both map to \`text\` by default.
- **\`timestamptz\`** — your habit of always storing UTC-normalised
  timestamps carries over, but watch the defaults: Prisma's \`DateTime\`
  maps to \`timestamp(3)\` *without* time zone unless you add
  \`@db.Timestamptz(6)\`; Drizzle wants
  \`timestamp('created_at', { withTimezone: true })\`.
- **\`jsonb\`** — Prisma's \`Json\` type maps to \`jsonb\`; Drizzle's
  \`jsonb()\` can even carry a compile-time shape via
  \`jsonb('payload').$type<{ plan: string }>()\`. Containment queries
  (\`@>\`) and \`->\`/\`->>\` extraction remain raw-SQL territory in both —
  a preview of the escape hatches later in the course.
- **Native enums** — \`CREATE TYPE status AS ENUM (...)\` becomes an
  \`enum\` block in Prisma and \`pgEnum('status', [...])\` in Drizzle, and
  both surface it as a string-literal union type in TS: \`'draft' | 'live'\`.

### RETURNING: the feature that shapes ORM ergonomics

\`INSERT ... RETURNING\` is why Postgres ORMs can hand you the inserted row
— generated id, defaulted timestamps and all — in a single round trip.
Prisma's \`create()\` always returns the full row (RETURNING under the
hood); Drizzle makes it explicit with \`.returning()\`, mirroring the SQL.

### MySQL habits to leave behind

Decades of LAMP leave muscle memory worth auditing:

- **Backtick quoting** — MySQL quotes identifiers with backticks; Postgres
  uses double quotes (\`"users"\`), and unquoted identifiers fold to
  *lower*case, not uppercase.
- **\`AUTO_INCREMENT\`** — replaced by identity/serial as above.
- **No RETURNING reflex** — on MySQL you did \`lastInsertId()\` then maybe a
  re-SELECT; on Postgres one statement does it all, and the ORMs lean on it.
- **Loose typing** — Postgres will not silently truncate strings or coerce
  \`'0000-00-00'\` dates; errors surface immediately, which pairs well with
  a strict type system upstream.
`,

  comparisons: [
    {
      label: "Modern DDL vs the Prisma model",
      intro:
        "The table you'd write by hand, and the schema.prisma model that manages the same shape. Read the attribute mappings line by line.",
      php: `-- migrations/001_create_events.sql
CREATE TABLE events (
  id         integer GENERATED ALWAYS AS IDENTITY
               PRIMARY KEY,
  kind       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);`,
      ts: `// prisma/schema.prisma
model Event {
  id        Int      @id @default(autoincrement())
  kind      String
  payload   Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@map("events")
}
// Caveats a SQL veteran will spot:
// - autoincrement() emits SERIAL, not the standard
//   GENERATED ALWAYS AS IDENTITY.
// - Without @db.Timestamptz, DateTime would be
//   timestamp(3) WITHOUT time zone.`,
      note: "Fields are non-nullable by default in Prisma (String means NOT NULL; String? is nullable) — the opposite polarity from raw DDL, where NULL is the default. @map/@@map keep snake_case in the database and camelCase in TS.",
      leftLang: "sql",
    },
    {
      label: "The same DDL in Drizzle's column builders",
      intro:
        "Drizzle's pg-core builders map one-to-one onto the DDL — including the modern identity spelling that Prisma lacks.",
      php: `-- migrations/001_create_events.sql
CREATE TABLE events (
  id         integer GENERATED ALWAYS AS IDENTITY
               PRIMARY KEY,
  kind       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);`,
      ts: `// src/db/schema.ts
import {
  pgTable, integer, text, jsonb, timestamp,
} from 'drizzle-orm/pg-core';

export const events = pgTable('events', {
  id: integer('id')
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});`,
      note: "Nearly a transliteration: generatedAlwaysAsIdentity(), notNull(), defaultNow() read like the DDL. Note the polarity flip — columns are nullable unless you say notNull(), matching SQL rather than Prisma.",
      leftLang: "sql",
    },
    {
      label: "RETURNING vs the typed inserted row",
      intro:
        "One INSERT, and the generated id plus defaulted timestamp come straight back. The ORMs ride the same Postgres feature — one implicitly, one explicitly.",
      php: `-- One round trip: insert AND read back the
-- columns the database filled in.
INSERT INTO events (kind, payload)
VALUES ('signup', '{"plan": "pro"}')
RETURNING id, kind, created_at;

-- On MySQL you'd INSERT, then lastInsertId(),
-- then possibly re-SELECT for the defaults.`,
      ts: `// Prisma: create() ALWAYS returns the full row —
// RETURNING under the hood, typed from the schema.
const event = await prisma.event.create({
  data: { kind: 'signup', payload: { plan: 'pro' } },
});
console.log(event.id, event.createdAt); // populated

// Drizzle: RETURNING is explicit, projection and all:
const [row] = await db
  .insert(events)
  .values({ kind: 'signup', payload: { plan: 'pro' } })
  .returning({ id: events.id, createdAt: events.createdAt });`,
      note: "Drizzle's .returning({...}) mirrors the SQL clause including the column list; Prisma returns the whole row every time. Either way, no lastInsertId() dance — that's a MySQL habit Postgres retired.",
      leftLang: "sql",
    },
  ],

  playground: {
    lang: "sql",
    intro:
      "Read and predict: an identity column, jsonb defaults, a two-row INSERT ... RETURNING with a ->> projection, and a @> containment query. Write down the two result tables before revealing the output.",
    code: `CREATE TABLE events (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Postgres hands the inserted rows straight back — no second query:
INSERT INTO events (kind, payload) VALUES
  ('signup', '{"plan": "pro", "seats": 3}'),
  ('signup', '{"plan": "free"}')
RETURNING id, kind, payload->>'plan' AS plan;

-- jsonb containment: which events carry a pro plan?
SELECT id, kind, payload->'seats' AS seats
FROM events
WHERE payload @> '{"plan": "pro"}';`,
    output: `CREATE TABLE

 id |  kind  | plan
----+--------+------
  1 | signup | pro
  2 | signup | free
(2 rows)

INSERT 0 2

 id |  kind  | seats
----+--------+-------
  1 | signup | 3
(1 row)`,
  },

  keyPoints: [
    "Write `GENERATED ALWAYS AS IDENTITY` in hand-written DDL; know that Prisma's `autoincrement()` still emits legacy `SERIAL`, while Drizzle offers both `serial()` and `integer().generatedAlwaysAsIdentity()`.",
    "Prisma's `DateTime` is `timestamp(3)` without time zone unless you add `@db.Timestamptz(6)`; Drizzle needs `timestamp(..., { withTimezone: true })` — timestamptz is never the silent default.",
    "`jsonb` surfaces as Prisma `Json` and Drizzle `jsonb()` (optionally typed via `.$type<...>()`); containment (`@>`) and `->>` extraction stay in raw-SQL territory.",
    "Native Postgres enums become Prisma `enum` blocks and Drizzle `pgEnum`, both surfacing as string-literal union types in TS.",
    "`INSERT ... RETURNING` is why Postgres ORMs return the inserted row in one round trip — implicit in Prisma's `create()`, explicit in Drizzle's `.returning()`.",
    "Drop the MySQL habits: double quotes not backticks, identity not AUTO_INCREMENT, RETURNING instead of `lastInsertId()` plus a re-SELECT.",
  ],

  interview: [
    {
      q: "Why is GENERATED ALWAYS AS IDENTITY preferred over SERIAL in modern Postgres, and do the ORMs follow suit?",
      a: "SERIAL was never a real type — it's shorthand that creates a sequence, sets a default, and wires up an ownership link, and that indirection leaks: permissions on the sequence are separate, and the column doesn't resist manual inserts into it. Identity columns are SQL-standard, keep the sequence managed as part of the column, and `GENERATED ALWAYS` rejects accidental explicit writes unless you say OVERRIDING SYSTEM VALUE. The ORMs are mid-transition: Prisma's `autoincrement()` still emits SERIAL, while Drizzle supports `integer().generatedAlwaysAsIdentity()` alongside legacy `serial()`. In practice I write identity in hand-authored migrations and accept the ORM default where it's managing the DDL — the behaviour difference rarely bites, but knowing it exists does, in interviews and in dump/restore edge cases.",
    },
    {
      q: "How do you make sure your ORM actually stores timestamptz and not naive timestamps?",
      a: "By never trusting the default mapping. Prisma's `DateTime` maps to `timestamp(3)` without time zone — you must annotate `@db.Timestamptz(6)` per field. Drizzle's `timestamp()` is also naive unless you pass `{ withTimezone: true }`. My rule from years of multi-timezone bugs stands: store timestamptz everywhere, let Postgres normalise to UTC, and convert at the edges. After defining the schema I verify by reading the generated migration SQL — if it says `timestamp` rather than `timestamptz`, the mapping is wrong regardless of what the TS types claim.",
    },
    {
      q: "What does RETURNING give you, and how does it show up in Prisma and Drizzle?",
      a: "RETURNING lets a write statement act like a query: INSERT, UPDATE, or DELETE hands back any columns of the affected rows — generated ids, defaulted timestamps — in the same round trip, with no lastInsertId() plus re-SELECT race like classic MySQL workflows. Prisma leans on it invisibly: `create()` and `update()` always return the complete row, fully typed. Drizzle keeps it explicit and SQL-shaped: `.returning()` for the whole row or `.returning({ id: users.id })` for a projection, and the result type matches what you asked for. It's a nice example of the theme that ORM ergonomics are really database features wearing a typed API.",
    },
  ],

  quiz: [
    {
      question:
        "In a Prisma model, what does `createdAt DateTime @default(now())` produce in Postgres without further attributes?",
      options: [
        "A timestamptz column, since Prisma always stores UTC",
        "A timestamp(3) column WITHOUT time zone — you need @db.Timestamptz to get timestamptz",
        "A date column with a trigger for the time portion",
        "A bigint storing epoch milliseconds",
      ],
      answerIndex: 1,
      explain:
        "Prisma's DateTime maps to timestamp(3) (no time zone) by default; @db.Timestamptz(6) opts into timestamptz. Drizzle has the same trap — timestamp() is naive unless you pass { withTimezone: true }. Always check the generated DDL.",
    },
    {
      question:
        "A row is inserted with `INSERT INTO events (kind) VALUES ('signup') RETURNING id, created_at;`. What does Postgres return?",
      options: [
        "Just a success flag — you must SELECT to read generated values",
        "The number of affected rows only",
        "A result set containing the generated id and the defaulted created_at, in the same round trip",
        "An error — RETURNING only works with UPDATE",
      ],
      answerIndex: 2,
      explain:
        "RETURNING turns the INSERT into something that also yields rows: the identity-generated id and the now() default come back immediately. This is the mechanism behind Prisma's create() returning the full typed row and Drizzle's .returning().",
    },
    {
      question:
        "Which of these is a MySQL habit that will bite on Postgres?",
      options: [
        "Using text instead of varchar(255)",
        "Quoting identifiers with backticks (`users`) instead of double quotes",
        "Storing timestamps as timestamptz",
        "Using prepared statements with placeholders",
      ],
      answerIndex: 1,
      explain:
        "Postgres uses double quotes for identifiers; backticks are a syntax error. (And unquoted identifiers fold to lowercase, not uppercase.) text over varchar(255) is actually idiomatic Postgres — there's no performance penalty.",
    },
  ],
};

export default lesson;
