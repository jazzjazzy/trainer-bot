import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "choosing-your-stack",
  title: "Choosing a Data Layer for a Real Project",
  part: "Production & Choosing",
  estMinutes: 12,
  summary:
    "'Walk me through how you'd choose' is a real interview prompt — here is a decision framework applied to four concrete scenarios, including the legacy-database story that maps directly onto PHP modernisation work.",

  concept: `
"Which ORM should we use?" is the wrong first question. The right first
questions are about the *project*: who's on the team, where does the code
run, does the database already exist, and how much of the workload is CRUD
versus hand-tuned SQL? Answer those and the tool picks itself.

### The criteria that actually decide it

- **Team SQL fluency** — abstraction is a cost for SQL experts and a safety
  rail for everyone else.
- **Runtime target** — long-lived Node containers tolerate anything;
  serverless and edge punish heavy clients and reward small, driver-agnostic
  layers and HTTP drivers.
- **Existing schema or greenfield** — a 200-table legacy database makes
  introspection quality (\`prisma db pull\` / \`drizzle-kit pull\`) the
  headline feature.
- **Query profile** — CRUD-dominant favours high-level APIs; report-heavy
  workloads live in raw SQL, so the escape hatch *is* the product.
- **Risk appetite** — Prisma 7's stable-major ecosystem vs drizzle-orm's
  pre-1.0 (0.45.x) velocity.

### Four scenarios, defensible picks

**1. Greenfield startup CRUD app** (Next.js, small mixed-skill team).
Pick: **Prisma**. The readable schema DSL, guardrailed \`migrate dev\` loop,
and uniform query API maximise a small team's velocity; Studio helps
non-experts inspect data. Runner-up: Drizzle — entirely viable, slightly
more SQL knowledge assumed.

**2. High-scale serverless / edge API.** Pick: **Drizzle**. Zero-dependency,
tiny bundle, works over HTTP drivers (Neon and friends) in workerd-style
runtimes. Runner-up: Prisma 7 — the TS query compiler plus the generator's
\`runtime\` option made it genuinely edge-capable, so this is closer than it
was in the Rust-engine era; Drizzle still wins on footprint.

**3. Legacy Postgres, 200 hand-crafted tables** — the PHP-modernisation
story. Pick: **either, decided by introspection ergonomics and the team** —
and this is where you shine. \`prisma db pull\` writes models into
\`schema.prisma\`; \`drizzle-kit pull\` emits a TypeScript \`schema.ts\`. Run
both against a copy, read what they produce for your gnarliest tables
(partial indexes, exotic defaults, cross-schema FKs), and pick the one whose
output you'd maintain. Strangle the old code table-by-table: new typed
repositories replace PDO classes incrementally, both stacks writing to the
same database during the transition.

**4. Data-heavy reporting service** (aggregations, window functions, CTEs).
Pick: **Drizzle — used mostly as a typed harness around raw SQL** via the
\`sql\` tagged template, with the query builder for the boring parts.
Runner-up: skip the ORM — a plain driver plus a SQL-validation layer is
legitimate when 90% of the value is hand-written SQL.

### The hybrid answer is a real answer

"ORM for CRUD, typed raw SQL for hot paths" is not a compromise — it's the
architecture most mature teams converge on. Both ORMs are designed for it:
Prisma has \`$queryRaw\`, Drizzle has \`sql\`. Saying this out loud in an
interview — *and* saying you'd measure with \`EXPLAIN ANALYZE\` before moving
a query to raw SQL — signals senior judgment.

### Rehearse it

The interview prompt is "walk me through how you'd choose." Practise a
60-second answer: criteria first (team, runtime, schema history, query
profile), then a concrete pick with a named runner-up, then the hybrid
caveat. Decisive but not dogmatic.
`,

  comparisons: [
    {
      label: "Introspecting a 200-table legacy database",
      intro:
        "Both tools read an existing database and generate a schema you own from then on. This is the make-or-break feature for modernising an old PHP app's database.",
      php: `# Prisma: introspect into the DSL
npx prisma db pull
# Reads the live database and (re)writes models
# into prisma/schema.prisma — 200 tables become
# 200 model blocks, with @@map/@map preserving
# your legacy snake_case names.

npx prisma generate
# Then hand-tune: relation names, enums it
# guessed at, comments. From here on the DSL is
# the source of truth and migrate takes over.`,
      ts: `# Drizzle: introspect into TypeScript
npx drizzle-kit pull
# Reads the live database and emits
# drizzle/schema.ts (+ relations.ts) — pgTable()
# definitions for all 200 tables; types flow
# immediately via $inferSelect, no generate step.

# Then hand-tune the generated TS and move the
# files into your source tree. From here on
# schema.ts is the source of truth and
# drizzle-kit generate/migrate take over.`,
      note: "Same shape, different artifact: db pull gives you a DSL file, drizzle-kit pull gives you TypeScript. Run both against a copy of the real database and judge them on your ugliest tables, not the docs' examples.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Strangling a legacy PDO repository",
      intro:
        "Incremental migration in practice: the old PHP repository keeps running while a typed TS repository takes over the same table, one call site at a time.",
      php: `<?php
// src/Repository/CustomerRepository.php (legacy)
class CustomerRepository
{
    public function __construct(private PDO $pdo) {}

    /** @return array<string,mixed>|false */
    public function findByEmail(string $email)
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, email, plan, created_at
               FROM customers WHERE email = :email'
        );
        $stmt->execute(['email' => $email]);
        // Shape known only by convention + PHPDoc:
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }
}`,
      ts: `// src/repositories/customer-repository.ts (replacement)
import { eq } from "drizzle-orm";
import { db } from "../db";
import { customers } from "../db/schema";

// Row type derived from the introspected schema —
// the compiler, not a PHPDoc, knows the shape:
export type Customer = typeof customers.$inferSelect;

export async function findByEmail(
  email: string
): Promise<Customer | undefined> {
  const [row] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);
  return row; // same table, same SQL, now typed
}`,
      note: "Both hit the same customers table during the transition — the strangler pattern needs no schema change, just introspection plus discipline about which code path owns writes.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The decision framework as executable rules. Each scenario is scored against the criteria from the lesson; run it to see the pick and reasoning per scenario, then add a scenario of your own.",
    code: `// A decision function over project scenarios.

interface Scenario {
  name: string;
  teamSqlDepth: "low" | "mixed" | "expert";
  runtime: "node" | "serverless-edge";
  schema: "greenfield" | "legacy";
  queryProfile: "crud" | "reporting";
}

interface Recommendation {
  pick: string;
  runnerUp: string;
  reasons: string[];
}

function choose(s: Scenario): Recommendation {
  const reasons: string[] = [];

  if (s.runtime === "serverless-edge") {
    reasons.push("edge runtime -> smallest footprint wins");
    reasons.push("Drizzle: zero-dep, HTTP-driver friendly");
    reasons.push("Prisma 7 is edge-capable but heavier");
    return { pick: "Drizzle", runnerUp: "Prisma 7", reasons };
  }

  if (s.queryProfile === "reporting") {
    reasons.push("workload is hand-written SQL, not CRUD");
    reasons.push("Drizzle's sql tag = typed raw-SQL harness");
    reasons.push("runner-up: plain driver, no ORM at all");
    return { pick: "Drizzle (mostly raw SQL)", runnerUp: "No ORM", reasons };
  }

  if (s.schema === "legacy") {
    reasons.push("200 tables -> introspection quality decides");
    reasons.push("run prisma db pull AND drizzle-kit pull on a copy");
    reasons.push("keep the one whose output you'd maintain");
    return { pick: "Trial both via pull", runnerUp: "-", reasons };
  }

  if (s.teamSqlDepth === "low" || s.teamSqlDepth === "mixed") {
    reasons.push("mixed-skill team -> guardrails + readable DSL");
    reasons.push("Prisma: uniform API, Studio, migrate dev loop");
    return { pick: "Prisma", runnerUp: "Drizzle", reasons };
  }

  reasons.push("SQL-expert team -> abstraction is pure cost");
  return { pick: "Drizzle", runnerUp: "Prisma", reasons };
}

const scenarios: Scenario[] = [
  { name: "Greenfield startup CRUD app", teamSqlDepth: "mixed",
    runtime: "node", schema: "greenfield", queryProfile: "crud" },
  { name: "High-scale serverless/edge API", teamSqlDepth: "expert",
    runtime: "serverless-edge", schema: "greenfield", queryProfile: "crud" },
  { name: "Legacy Postgres, 200 tables", teamSqlDepth: "expert",
    runtime: "node", schema: "legacy", queryProfile: "crud" },
  { name: "Data-heavy reporting service", teamSqlDepth: "expert",
    runtime: "node", schema: "greenfield", queryProfile: "reporting" },
];

for (const s of scenarios) {
  const r = choose(s);
  console.log("== " + s.name);
  console.log("   pick: " + r.pick + "  (runner-up: " + r.runnerUp + ")");
  for (const reason of r.reasons) {
    console.log("   - " + reason);
  }
}

console.log("");
console.log("Hybrid rule: ORM for CRUD + typed raw SQL for hot paths");
console.log("is a legitimate final architecture, not a compromise.");`,
  },

  keyPoints: [
    "Choose on project facts, not ideology: team SQL fluency, runtime target, existing-vs-greenfield schema, CRUD-vs-reporting query profile, and risk appetite.",
    "Greenfield CRUD with a mixed team: Prisma (readable DSL, guardrailed migrate loop, Studio); Drizzle is the runner-up, not a wrong answer.",
    "Serverless/edge: Drizzle's zero-dependency, bring-your-own-driver design wins on footprint; Prisma 7's TS compiler and `runtime` option made it a credible runner-up.",
    "Legacy database with hundreds of tables: run `prisma db pull` and `drizzle-kit pull` against a copy and judge the generated schema on your ugliest tables — introspection quality decides.",
    "Reporting-heavy services invert the question: the raw-SQL escape hatch is the main API, so Drizzle-as-typed-SQL-harness or even no ORM are the defensible picks.",
    "The hybrid architecture — ORM for CRUD, typed raw SQL (`$queryRaw` / `sql`) for measured hot paths — is what mature teams converge on; say it out loud in interviews.",
  ],

  interview: [
    {
      q: "Walk me through how you'd choose a data layer for a new project.",
      a: "I'd ask four questions before naming a tool. Who's on the team — SQL abstraction is a guardrail for mixed teams and a tax on SQL experts. Where does it run — edge and serverless reward Drizzle's zero-dependency footprint, though Prisma 7's TS compiler narrowed that gap. Does the database already exist — a big legacy schema makes introspection quality the deciding feature, so I'd run both `prisma db pull` and `drizzle-kit pull` on a copy and review the output. And what's the query profile — CRUD favours a high-level API, reporting lives in raw SQL. Then I commit to a pick with a named runner-up, and I'd flag upfront that ORM-for-CRUD plus typed raw SQL for measured hot paths is a legitimate end state, not a failure of the ORM.",
    },
    {
      q: "You're modernising a PHP application with a 200-table Postgres database that's been hand-tuned for 15 years. How do you introduce a typed data layer?",
      a: "This is exactly the work I'm positioned for — the database is the asset, and I would not let any tool regenerate or 'fix' it. Step one is introspection on a copy: `prisma db pull` produces schema.prisma models, `drizzle-kit pull` produces a TypeScript schema.ts. I'd judge them on the nastiest tables — partial indexes, exotic defaults, cross-schema foreign keys — and keep whichever output the team can maintain. Then a strangler migration: new typed repositories replace individual PDO repository classes one bounded context at a time, both stacks hitting the same tables, with clear ownership of writes during the overlap. From cutover onward the introspected schema becomes the source of truth and migrations go through the ORM's tooling. No big-bang rewrite, and the schema itself never has to change to start.",
    },
    {
      q: "Is 'use an ORM for some queries and raw SQL for others' an architectural smell?",
      a: "No — it's the design both tools explicitly support, and it's where most mature teams land. The ORM earns its keep on the 80% that's CRUD: typed inserts, relation loading, migrations. For the hot paths — reporting aggregations, window functions, carefully tuned joins — I write the SQL myself through the typed escape hatches: Prisma's `$queryRaw` or Drizzle's `sql` tagged template, both of which parameterise like the prepared statements I've used for decades. The discipline that keeps it healthy is measurement: a query moves to raw SQL because `EXPLAIN ANALYZE` showed a problem the ORM couldn't express the fix for, not because someone felt like it. Then the raw version is benchmarked and code-reviewed like any DDL.",
    },
  ],

  quiz: [
    {
      question:
        "For a high-scale edge/serverless API, why is Drizzle usually the first pick?",
      options: [
        "It is the only ORM that supports Postgres",
        "Its zero-dependency, bring-your-own-driver design gives a tiny bundle and works with HTTP drivers in edge runtimes",
        "Prisma cannot run outside long-lived Node processes at all",
        "Drizzle caches all queries at the edge automatically",
      ],
      answerIndex: 1,
      explain:
        "Drizzle is a thin typed layer over whichever driver you bring — including HTTP drivers — with no runtime dependencies, which suits size- and cold-start-sensitive runtimes. Prisma 7 is genuinely edge-capable now (TS query compiler, runtime generator option), which is why it's the runner-up rather than disqualified.",
    },
    {
      question:
        "You inherit a 15-year-old Postgres database with 200 hand-crafted tables. What is the recommended first step toward a typed data layer?",
      options: [
        "Rewrite the schema from scratch in the ORM's format and migrate the data across",
        "Run the ORM's introspection (prisma db pull or drizzle-kit pull) against a copy and review the generated schema on the hardest tables",
        "Use db push to overwrite the legacy schema with a clean one",
        "Avoid ORMs entirely — introspection cannot handle that many tables",
      ],
      answerIndex: 1,
      explain:
        "Both tools generate a schema from the live database: db pull writes schema.prisma models, drizzle-kit pull writes TypeScript pgTable definitions. The database is the asset — you introspect it, hand-tune the output, and strangle the old code incrementally. Rewriting or pushing over a tuned legacy schema destroys 15 years of work.",
    },
    {
      question:
        "What makes 'ORM for CRUD plus typed raw SQL for hot paths' a defensible architecture rather than a hack?",
      options: [
        "It avoids ever writing migrations",
        "Both ORMs ship first-class, parameterised raw-SQL escape hatches ($queryRaw, the sql tag), and queries move to raw SQL based on EXPLAIN ANALYZE evidence",
        "Raw SQL bypasses the connection pool, which is faster",
        "It lets you skip code review for the raw queries",
      ],
      answerIndex: 1,
      explain:
        "The hybrid is designed-for, not worked-around: the escape hatches parameterise safely and can return typed rows. What keeps it disciplined is measurement — a query earns its raw-SQL rewrite by showing a plan problem the ORM can't express — plus normal review of the hand-written SQL.",
    },
  ],
};

export default lesson;
