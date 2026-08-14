import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "prisma-vs-drizzle",
  title: "Prisma vs Drizzle: The Honest Trade-offs",
  part: "Production & Choosing",
  estMinutes: 13,
  summary:
    "Both are excellent typed data layers; they differ on schema source-of-truth, distance from SQL, migration philosophy, runtime architecture, and maturity — and a SQL veteran should be able to steelman both.",

  concept: `
You can now do the same work in both tools, so the comparison can be honest
rather than tribal. Neither is "the good one". They optimise for different
teams — and in an interview, showing you understand *what each optimises for*
beats any hot take.

### Schema: DSL + codegen vs TypeScript + inference

Prisma's schema lives in \`schema.prisma\`, a purpose-built DSL. It's arguably
the most readable schema format in the ecosystem — non-TS teammates can review
it — but it needs a codegen step: Prisma 7's \`prisma-client\` generator emits
the typed client into an explicit \`output\` path, and you re-run \`prisma
generate\` after every schema change. Drizzle's schema *is* TypeScript:
\`pgTable(...)\` calls whose row types fall out via \`typeof users.$inferSelect\`
— no generate step, no drift window between schema and types, but the schema
file is code, with everything that implies for review and discipline.

### Query API: abstraction vs mirror

Prisma's API is object-shaped: \`findMany({ where, include, orderBy })\`. You
describe the result you want; the query compiler decides the SQL. It's
uniform and discoverable, and it hides the relational mechanics. Drizzle's
core API *is* SQL with types: \`db.select().from(users).leftJoin(...)
.where(eq(...))\` reads like the statement it emits, and the \`sql\` tagged
template degrades gracefully to raw SQL. If you already think in
SQL — you do — Drizzle's mapping is nearly free, and Prisma occasionally
feels like guessing what the abstraction will emit. For a developer who
*doesn't* know SQL, that same abstraction is a feature.

### Migrations: shadow-DB automation vs generate-and-read

\`prisma migrate dev\` diffs via a shadow database and manages the workflow
end-to-end; you *can* read the emitted \`migration.sql\`, but the tool doesn't
push you to. \`drizzle-kit generate\` writes a plain \`.sql\` file and expects
you to read (and freely edit) it before \`drizzle-kit migrate\` applies it.
Drizzle's philosophy assumes the SQL is the artifact; Prisma's assumes the
schema is.

### Runtime architecture

Prisma 7 replaced its old Rust query engine with a TypeScript query compiler
— and now **requires a driver adapter**: \`new PrismaClient({ adapter: new
PrismaPg({ connectionString }) })\`. That's a huge simplification over the
binary-engine era, but the client is still a generated artifact sitting on an
adapter. Drizzle was born "bring your own driver": a thin layer over
\`pg\`/\`postgres\`/neon/etc. with zero runtime dependencies, tiny bundles, and
first-class edge-runtime support. Prisma 7 narrowed this gap considerably
(the \`runtime\` generator option targets nodejs, workerd, vercel-edge and
more); Drizzle still holds the lightweight end.

### Ecosystem and maturity

Prisma is the older, larger ecosystem: Prisma Studio, Accelerate (hosted
pooling/caching), polished docs, huge community — and a stable major-version
history. Drizzle ships Drizzle Studio and moves fast, but drizzle-orm is
**pre-1.0** (0.45.x, with drizzle-kit at 0.31.x): APIs are stable in
practice, yet minor releases can still move things, and Relational Queries
v2 exists only in the v1.0 beta. Betting on Drizzle means accepting a
younger ecosystem.

### The SQL-veteran's take

Drizzle rewards people who think in SQL — you'll predict its output, reach
its escape hatches naturally, and lose almost nothing you know. Prisma
optimises for teams who want the database abstracted behind a uniform,
discoverable API with strong guardrails. Both are legitimate; the right
answer is a function of the team, not the technology.
`,

  comparisons: [
    {
      label: "The same upsert in both ORMs",
      intro:
        "Insert a user or update their name if the email already exists. Prisma on the left, Drizzle on the right — watch how far each sits from the INSERT ... ON CONFLICT it produces.",
      php: `// Prisma — describe the outcome, not the SQL
const user = await prisma.user.upsert({
  where:  { email: "ada@example.com" },
  update: { name: "Ada Lovelace" },
  create: {
    email: "ada@example.com",
    name:  "Ada Lovelace",
  },
});
// With a single unique field like this, Prisma can
// emit a native INSERT ... ON CONFLICT DO UPDATE;
// otherwise it falls back to read-then-write.`,
      ts: `// Drizzle — you write the ON CONFLICT yourself
const [user] = await db
  .insert(users)
  .values({
    email: "ada@example.com",
    name:  "Ada Lovelace",
  })
  .onConflictDoUpdate({
    target: users.email,
    set: { name: "Ada Lovelace" },
  })
  .returning();
// Reads exactly like the SQL it emits:
// INSERT ... ON CONFLICT (email)
//   DO UPDATE SET name = $2 RETURNING *`,
      note: "Prisma names the intent (upsert) and picks the strategy; Drizzle exposes the Postgres mechanism (onConflictDoUpdate + target) so what you write is what runs.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "A filtered partial select",
      intro:
        "Fetch just id and email for active users, newest first. Same result set, two philosophies: result-shape description vs typed SQL clauses.",
      php: `// Prisma — object describing the result shape
const rows = await prisma.user.findMany({
  where:   { active: true },
  select:  { id: true, email: true },
  orderBy: { createdAt: "desc" },
  take:    20,
});
// rows: { id: number; email: string }[]
// The compiler derives SELECT id, email ... for you.`,
      ts: `// Drizzle — the clauses, in SQL order, typed
const rows = await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .where(eq(users.active, true))
  .orderBy(desc(users.createdAt))
  .limit(20);
// rows: { id: number; email: string }[]
// Nearly a 1:1 transcription of:
// SELECT id, email FROM users
//   WHERE active = true
//   ORDER BY created_at DESC LIMIT 20`,
      note: "Identical inferred row types on both sides — the difference is purely where you stand relative to the SQL: Prisma above it, Drizzle beside it.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Migration workflow, day to day",
      intro:
        "Add a column and get it into the database. Prisma automates the loop around a shadow database; Drizzle generates SQL and expects you to read it before applying.",
      php: `# Prisma: edit schema.prisma, then
npx prisma migrate dev --name add_user_active
# - diffs against a shadow database
# - writes prisma/migrations/.../migration.sql
# - applies it (v7 does NOT re-run generate;
#   run npx prisma generate yourself)

# Production applies the same files with:
npx prisma migrate deploy`,
      ts: `# Drizzle: edit schema.ts, then
npx drizzle-kit generate
# -> drizzle/0007_add_user_active.sql
#    a plain SQL file you READ (and may edit)

npx drizzle-kit migrate
# applies pending .sql files, records them

# Prototyping only (no migration file):
npx drizzle-kit push`,
      note: "Prisma's loop is more automated (shadow DB, drift detection); Drizzle's is more transparent (the .sql file is the deliverable). Your code-review habits decide which you'll trust more.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The comparison as data: a decision matrix you can extend. Run it, then try re-weighting or adding a criterion (e.g. 'team knows SQL deeply') and see how the framing changes.",
    code: `// Prisma vs Drizzle — the trade-offs as a printable matrix.

interface Criterion {
  axis: string;
  prisma: string;
  drizzle: string;
}

const matrix: Criterion[] = [
  {
    axis: "Schema source",
    prisma: "schema.prisma DSL + codegen step",
    drizzle: "TypeScript (pgTable) + pure inference",
  },
  {
    axis: "Query API",
    prisma: "abstracts SQL (findMany/where/include)",
    drizzle: "mirrors SQL (select/join/where)",
  },
  {
    axis: "Migrations",
    prisma: "migrate dev + shadow DB, automated",
    drizzle: "generate -> read the .sql -> migrate",
  },
  {
    axis: "Runtime",
    prisma: "TS query compiler, driver adapter required",
    drizzle: "thin layer, bring-your-own-driver, zero deps",
  },
  {
    axis: "Maturity",
    prisma: "Prisma 7, Studio, Accelerate, big ecosystem",
    drizzle: "0.45.x (pre-1.0), Drizzle Studio, fast-moving",
  },
  {
    axis: "Best fit",
    prisma: "teams wanting the DB abstracted + guardrails",
    drizzle: "teams that think in SQL and want it visible",
  },
];

function row(a: string, b: string, c: string): string {
  return a.padEnd(15) + "| " + b.padEnd(45) + "| " + c;
}

console.log(row("Axis", "Prisma", "Drizzle"));
console.log("-".repeat(110));
for (const c of matrix) {
  console.log(row(c.axis, c.prisma, c.drizzle));
}

console.log("");
console.log(
  "SQL-veteran's verdict: Drizzle costs you nothing you know;"
);
console.log(
  "Prisma buys uniformity for teammates who don't share your SQL depth."
);`,
  },

  keyPoints: [
    "Schema: Prisma uses the `schema.prisma` DSL plus a `prisma generate` codegen step (Prisma 7: `provider = \"prisma-client\"` with an explicit `output`); Drizzle's schema is TypeScript with types inferred via `$inferSelect` — no generate step.",
    "Query API: Prisma abstracts SQL behind result-shape objects; Drizzle mirrors SQL clause-for-clause — identical type safety, different distance from the statement.",
    "Migrations: `prisma migrate dev` automates around a shadow database; `drizzle-kit generate` hands you a plain `.sql` file to read and edit before `drizzle-kit migrate` applies it.",
    "Runtime: Prisma 7 runs a TS query compiler and requires a driver adapter (`new PrismaClient({ adapter })` with e.g. `PrismaPg`); Drizzle is bring-your-own-driver with zero runtime dependencies and a smaller footprint.",
    "Maturity: Prisma has the larger, older ecosystem (Studio, Accelerate); drizzle-orm is pre-1.0 at 0.45.x — stable in practice, but minors can move APIs and RQB v2 is still beta.",
    "Steelman both in interviews: Drizzle rewards SQL thinkers; Prisma optimises for teams who want the database abstracted — the right pick is about the team.",
  ],

  interview: [
    {
      q: "Prisma or Drizzle — which would you choose and why?",
      a: "It depends on the team, and I can argue both sides. For me personally, Drizzle: I've written SQL for twenty-five years, its API is a typed mirror of the statements I'd write anyway, migrations are plain SQL files I review like any DDL, and it's a thin zero-dependency layer over the driver. For a mixed team where half the developers don't think in SQL, Prisma: the schema DSL is readable by everyone, the query API is uniform and discoverable, and the migrate workflow has strong guardrails. The honest caveats cut both ways — Prisma adds a codegen step and, in v7, a required driver adapter; Drizzle is still pre-1.0 at 0.45.x with a younger ecosystem. I'd decide on team composition, not ideology.",
    },
    {
      q: "How do the two migration philosophies differ, and which do you trust more?",
      a: "Prisma treats the schema as the artifact: `migrate dev` diffs against a shadow database, generates `migration.sql`, and applies it — quite automated, though in v7 it no longer regenerates the client, so `prisma generate` is an explicit follow-up. The SQL is there if you look. Drizzle treats the SQL as the artifact: `drizzle-kit generate` writes a plain `.sql` file and the workflow assumes you'll read and possibly edit it before `drizzle-kit migrate` applies it. Given my background I trust the generate-and-read model more, because I *will* read the DDL and catch things like an implicit table rewrite. But I'd note Prisma's output is equally reviewable — the difference is which behaviour the tool encourages, not what it allows.",
    },
    {
      q: "What changed architecturally in Prisma 7, and how does that compare to Drizzle's design?",
      a: "Prisma 7 dropped the Rust query engine binary for a TypeScript query compiler, which means the client now requires a JS driver adapter — you construct `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`, and building one without an adapter throws. The generator also changed to `prisma-client` with a mandatory explicit output path, and config moved to `prisma.config.ts`. That closes much of the gap to Drizzle, which was designed from day one as a thin, zero-dependency layer over whatever driver you bring — that design is why Drizzle got its reputation on bundle size and edge runtimes. Post-7 the practical difference is smaller: Prisma still generates a client artifact; Drizzle is still the lighter, closer-to-the-driver option.",
    },
  ],

  quiz: [
    {
      question:
        "What is the fundamental difference in how the two ORMs define a schema?",
      options: [
        "Prisma uses SQL files; Drizzle uses YAML",
        "Prisma uses the schema.prisma DSL with a codegen step; Drizzle defines tables in TypeScript and infers types with no generate step",
        "Both use TypeScript, but Drizzle requires decorators",
        "Drizzle requires a codegen step; Prisma infers types from the database at runtime",
      ],
      answerIndex: 1,
      explain:
        "Prisma's source of truth is the schema.prisma DSL, compiled into a client by prisma generate (Prisma 7: the prisma-client generator with an explicit output path). Drizzle's source of truth is TypeScript itself — pgTable definitions whose row types come from $inferSelect, with nothing to regenerate.",
    },
    {
      question:
        "Which statement about the runtime architecture is accurate as of Prisma 7 and drizzle-orm 0.45.x?",
      options: [
        "Prisma still ships a Rust engine binary; Drizzle compiles to WASM",
        "Both require a driver adapter object at construction",
        "Prisma 7 uses a TS query compiler and requires a driver adapter; Drizzle wraps whatever driver you bring with zero runtime dependencies",
        "Drizzle requires Prisma's adapter packages to talk to Postgres",
      ],
      answerIndex: 2,
      explain:
        "Prisma 7 removed the Rust engine; the client runs a TypeScript query compiler and must be constructed with a driver adapter such as PrismaPg. Drizzle never had an engine — it is a thin typed layer over the pg/postgres/neon driver you install yourself.",
    },
    {
      question:
        "A candidate says 'Drizzle is better because it's newer.' What is the honest maturity picture?",
      options: [
        "Drizzle is post-2.0 and more stable than Prisma",
        "drizzle-orm is pre-1.0 (0.45.x) — solid in practice, but minor releases can move APIs, while Prisma has years of stable majors and a larger ecosystem",
        "Prisma was abandoned after version 6",
        "Both projects have identical release maturity",
      ],
      answerIndex: 1,
      explain:
        "Newness cuts both ways. Drizzle is excellent but pre-1.0 at 0.45.x (drizzle-kit 0.31.x), and Relational Queries v2 is still beta-only. Prisma brings major-version stability, Studio, Accelerate, and a bigger community. A strong answer names the trade instead of picking a winner on age.",
    },
  ],
};

export default lesson;
