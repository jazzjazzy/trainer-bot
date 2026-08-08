import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "seeding-and-test-data",
  title: "Seeding and Realistic Test Data",
  part: "Production & Choosing",
  estMinutes: 11,
  summary:
    "The fixture-file discipline you built over decades becomes a typed seed script: Prisma's seed hook in prisma.config.ts with idempotent upserts, and Drizzle's plain TS scripts plus drizzle-seed for deterministic generated data.",

  concept: `
Every serious PHP project you've maintained had a \`fixtures.sql\` — a curated file of
INSERTs that rebuilt a working dataset. The discipline transfers wholesale; what
changes is that seeds are now TypeScript, so they're type-checked against the schema
and can use the same client as the app.

### Prisma: the seed hook

In Prisma 7, the seed command is registered in \`prisma.config.ts\` under
\`migrations.seed\`:

\`\`\`ts
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",   // any command; tsx runs TS directly
  },
  datasource: { url: env("DATABASE_URL") },
});
\`\`\`

\`npx prisma db seed\` runs that command, and the CLI also invokes it when
\`prisma migrate reset\` rebuilds the database — so a fresh checkout goes from zero
to working data in one command.

### Idempotent seeds: upsert by natural key

A seed you can only run once is a trap. The pattern that makes reruns safe is the
one you used in SQL as \`INSERT ... ON CONFLICT DO UPDATE\`: **upsert by a natural
key**, so running the seed twice converges instead of duplicating:

\`\`\`ts
// prisma/seed.ts
await prisma.user.upsert({
  where: { email: "admin@example.com" },  // natural key
  update: { role: "ADMIN" },              // reconcile if it exists
  create: { email: "admin@example.com", name: "Admin", role: "ADMIN" },
});
\`\`\`

The alternative — truncate-and-reload — is simpler and fine for disposable local
databases, but it destroys anything you created by hand while testing. Rule of
thumb: reference data (roles, plans, countries) is always upserted; bulk demo data
can be truncate-and-reload behind an environment check. And gate by environment
explicitly — a seed that runs in production because \`NODE_ENV\` was unset is a
classic incident.

### Drizzle: a script you own, plus drizzle-seed

Drizzle has no dedicated hook: a seed is a plain TS script using your \`db\` instance,
run with \`tsx src/db/seed.ts\` (wire it to \`npm run db:seed\` yourself). Batch inserts
take an array — \`db.insert(users).values(rows)\` — with \`onConflictDoNothing()\` or
\`onConflictDoUpdate()\` for idempotency.

For *volume*, the \`drizzle-seed\` package generates realistic fake data straight from
your schema, and its headline feature is the one your fixture files always had:
**determinism**. The same seed number produces the same rows every run:

\`\`\`ts
import { seed, reset } from "drizzle-seed";

await reset(db, schema);                          // truncate-and-reload style
await seed(db, schema, { count: 1000, seed: 42 }); // same 1000 rows, every time
\`\`\`

A \`.refine()\` callback customises generators per column (unique emails, value
ranges, weighted enums). Deterministic data means a failing test reproduces on a
colleague's machine — the property that made you keep fixtures in version control
in the first place.

### What goes in which environment

- **Local dev**: reference data + a rich, deterministic demo dataset.
- **CI**: the minimum rows the tests need; speed matters, run per suite.
- **Staging**: reference data + anonymised or generated bulk data — never a
  production dump with real emails in it.
- **Production**: reference data only, upserted, usually as part of deployment.
`,

  comparisons: [
    {
      label: "fixtures.sql vs a typed Prisma seed",
      intro:
        "Guaranteeing the admin user and the default plans exist. The SQL version and the Prisma version even share the same idempotency mechanism underneath.",
      php: `-- db/fixtures.sql (run via psql -f)
INSERT INTO users (email, name, role)
VALUES ('admin@example.com', 'Admin', 'ADMIN')
ON CONFLICT (email)
DO UPDATE SET role = 'ADMIN';

INSERT INTO plans (code, name, price_cents)
VALUES ('free', 'Free', 0),
       ('pro',  'Pro',  1900)
ON CONFLICT (code) DO NOTHING;`,
      ts: `// prisma/seed.ts — run by \`npx prisma db seed\`
// (registered as migrations.seed in prisma.config.ts)
await prisma.user.upsert({
  where: { email: "admin@example.com" },
  update: { role: "ADMIN" },
  create: { email: "admin@example.com", name: "Admin", role: "ADMIN" },
});

for (const p of [
  { code: "free", name: "Free", priceCents: 0 },
  { code: "pro", name: "Pro", priceCents: 1900 },
]) {
  await prisma.plan.upsert({ where: { code: p.code }, update: {}, create: p });
}`,
      note:
        "upsert-by-natural-key is ON CONFLICT wearing a typed API — both versions converge on rerun instead of duplicating; the TS version also fails to compile if the schema drops a column the seed still sets.",
      leftLang: "sql",
    },
    {
      label: "PHP faker loop vs Drizzle batch insert",
      intro:
        "Fifty demo users. The PHP loop fires fifty INSERTs; the Drizzle version builds a typed array and inserts it in one statement.",
      php: `<?php
// seed.php
$faker = Faker\\Factory::create();
$faker->seed(42); // deterministic run

$stmt = $pdo->prepare(
  'INSERT INTO users (email, name) VALUES (:email, :name)'
);
for ($i = 0; $i < 50; $i++) {
    $stmt->execute([
        ':email' => $faker->unique()->safeEmail(),
        ':name'  => $faker->name(),
    ]);
}`,
      ts: `// src/db/seed.ts — run with: tsx src/db/seed.ts
import { db } from "./client";
import { users } from "./schema";

type NewUser = typeof users.$inferInsert;

const rows: NewUser[] = Array.from({ length: 50 }, (_, i) => ({
  email: \`user\${i + 1}@example.com\`,
  name: \`Demo User \${i + 1}\`,
}));

await db.insert(users).values(rows).onConflictDoNothing();
// One multi-row INSERT; $inferInsert keeps rows honest
// against the schema at compile time`,
      note:
        "values(array) emits a single multi-row INSERT instead of 50 round trips, and onConflictDoNothing gives the rerun-safety your ON CONFLICT clauses always did — with rows typechecked via $inferInsert.",
    },
    {
      label: "Truncate-and-reload vs drizzle-seed determinism",
      intro:
        "Rebuilding a thousand-row demo dataset from scratch. The SQL version hand-maintains the data; drizzle-seed generates it from the schema, identically on every run.",
      php: `-- reload.sql
TRUNCATE users, posts RESTART IDENTITY CASCADE;

\\i fixtures/users.sql   -- 1000 hand-maintained INSERTs
\\i fixtures/posts.sql   -- kept in sync with schema by hope`,
      ts: `// src/db/seed-demo.ts
import { seed, reset } from "drizzle-seed";
import { db } from "./client";
import * as schema from "./schema";

await reset(db, schema);   // truncate all schema tables
await seed(db, schema, {
  count: 1000,
  seed: 42,                // same rows on every machine, every run
});
// .refine((f) => ({ users: { columns: {
//   email: f.string({ isUnique: true }) } } }))
// customises per-column generators`,
      note:
        "The seed number is the point: deterministic generation gives you version-controlled reproducibility without version-controlling a thousand INSERT statements that drift from the schema.",
      leftLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Deterministic fake data with zero randomness: a seeded counter feeds name/domain tables, so every run prints identical rows — the property that makes seed data debuggable. Run it twice mentally; then change SEED to 7 and see a different (but again stable) dataset.",
    code: `// Deterministic user generation — same rows every run,
// like drizzle-seed with a fixed seed number.

interface SeedUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "member";
}

const FIRST = ["Ada", "Rasmus", "Grace", "Linus", "Anders"];
const LAST = ["Lovelace", "Lerdorf", "Hopper", "Torvalds", "Hejlsberg"];
const DOMAINS = ["example.com", "example.org"];

const SEED = 42;

// Tiny deterministic generator (linear congruential) — the same
// SEED always yields the same sequence. No Math.random anywhere.
let state = SEED;
function nextInt(max: number): number {
  state = (state * 1103515245 + 12345) % 2147483648;
  return state % max;
}

function makeUsers(count: number): SeedUser[] {
  const rows: SeedUser[] = [];
  for (let i = 1; i <= count; i++) {
    const first = FIRST[nextInt(FIRST.length)];
    const last = LAST[nextInt(LAST.length)];
    const domain = DOMAINS[nextInt(DOMAINS.length)];
    rows.push({
      id: i,
      email: (first + "." + last + i + "@" + domain).toLowerCase(),
      name: first + " " + last,
      role: i === 1 ? "admin" : "member", // reference row first
    });
  }
  return rows;
}

const users = makeUsers(5);

console.log("would insert " + users.length + " rows:");
for (const u of users) {
  console.log(
    "  " + u.id + " | " + u.email.padEnd(32) + " | " + u.role
  );
}

// Rerun-safety note: in a real seed these rows go through
// upsert / ON CONFLICT on the email natural key, so running
// the script twice converges instead of duplicating.`,
  },

  keyPoints: [
    "Prisma 7 registers the seed command in prisma.config.ts under `migrations.seed` (e.g. `\"tsx prisma/seed.ts\"`); `npx prisma db seed` runs it, and `migrate reset` re-seeds automatically.",
    "Make seeds idempotent by upserting on a natural key — `prisma.user.upsert({ where: { email }, update, create })` is `INSERT ... ON CONFLICT DO UPDATE` in a typed coat.",
    "Truncate-and-reload is legitimate for disposable demo data but destroys hand-made state; upsert reference data (roles, plans) always, and gate destructive seeds by environment.",
    "Drizzle seeds are plain TS scripts you run with tsx: `db.insert(users).values(arrayOfRows)` emits one multi-row INSERT, with `onConflictDoNothing()`/`onConflictDoUpdate()` for rerun safety.",
    "drizzle-seed generates schema-aware fake data deterministically — `seed(db, schema, { count, seed: 42 })` yields identical rows on every machine, with `.refine()` to customise per-column generators.",
    "Environment discipline: rich deterministic data locally, minimal rows in CI, anonymised or generated bulk in staging, upserted reference data only in production.",
  ],

  interview: [
    {
      q: "How do you make a seed script safe to run repeatedly?",
      a: "Same answer I'd have given for SQL fixtures, in new syntax: converge, don't append. Every reference row is written as an upsert keyed on a natural key — email, plan code, slug — so Prisma's `upsert({ where, update, create })` or Drizzle's `onConflictDoUpdate` reconciles existing rows instead of duplicating them; underneath it's the `INSERT ... ON CONFLICT` I've written for years. For bulk demo data, idempotency-by-upsert is overkill, so I use explicit truncate-and-reload — drizzle-seed's `reset` followed by a deterministic `seed` — but only behind an environment guard, because a destructive seed pointed at the wrong DATABASE_URL is a career moment. Then I test the property directly: run the seed twice in CI and assert row counts are stable.",
    },
    {
      q: "How does seeding get wired up in Prisma 7 versus Drizzle?",
      a: "Prisma makes it a first-class hook: prisma.config.ts has a `migrations.seed` entry holding the command — typically `tsx prisma/seed.ts` — and the CLI runs it on `prisma db seed` and after `migrate reset`, so a fresh clone is one command away from a working dataset. Drizzle deliberately doesn't have a hook: the seed is an ordinary TypeScript script using my db instance and schema, wired to an npm script; what it adds is the drizzle-seed package, which generates fake data from the schema itself with a deterministic seed number. Either way the script is type-checked against the schema — a seed that sets a dropped column fails at compile time instead of at 2 a.m. on a colleague's machine.",
    },
    {
      q: "Why does deterministic test data matter, and how do you get it?",
      a: "Because 'flaky' usually means 'random'. If seed data differs per run, a test failure on CI may not reproduce locally, and debugging turns into archaeology. Deterministic seeds give every developer and every CI job byte-identical data, so failures reproduce and golden-output tests are possible — it's why I kept fixtures.sql in version control for two decades. In this stack you get it by seeding the generator: drizzle-seed takes a `seed` number and produces the same rows every run, PHP's Faker had `$faker->seed(42)`, and for hand-rolled generators I use a seeded PRNG or a plain counter — never bare Math.random. The same rule extends to time: freeze or parameterise 'now', or your data ages out from under your tests.",
    },
  ],

  quiz: [
    {
      question: "In Prisma 7, how does the CLI know what to run for `npx prisma db seed`?",
      options: [
        "It looks for prisma/seed.ts by convention",
        "The `\"prisma\": { \"seed\": ... }` key in package.json",
        "The `migrations.seed` command configured in prisma.config.ts",
        "A @@seed attribute in schema.prisma",
      ],
      answerIndex: 2,
      explain:
        "Prisma 7 moved project configuration into prisma.config.ts; defineConfig's migrations.seed holds the command (e.g. \"tsx prisma/seed.ts\"), which db seed executes and migrate reset triggers automatically. The package.json key was the older mechanism.",
    },
    {
      question: "Which seed-script pattern is idempotent?",
      options: [
        "prisma.user.create() for each fixture row",
        "prisma.user.upsert() keyed on a unique natural key like email",
        "db.insert(users).values(rows) with no conflict clause",
        "Running createMany with skipDuplicates: false",
      ],
      answerIndex: 1,
      explain:
        "Upsert on a natural key converges: existing rows get reconciled via update, missing rows get created — the same guarantee as INSERT ... ON CONFLICT DO UPDATE. Plain create/insert calls throw on the unique constraint (or worse, duplicate) the second time you run the script.",
    },
    {
      question:
        "What does the `seed: 42` option in drizzle-seed's seed(db, schema, { count: 1000, seed: 42 }) control?",
      options: [
        "The number of rows inserted into each table",
        "Which tables are seeded first",
        "The RNG seed — the same number regenerates the identical fake dataset on every run and machine",
        "The batch size of the generated INSERT statements",
      ],
      answerIndex: 2,
      explain:
        "drizzle-seed is deterministic: seeding its generator with the same number always yields the same sequence of fake data. That reproducibility — identical rows locally and in CI — is what makes generated data debuggable; count controls volume.",
    },
    {
      question: "Which dataset belongs in a production seed?",
      options: [
        "A thousand generated demo users for realistic load",
        "An anonymised copy of the staging database",
        "Upserted reference data only — roles, plans, lookup tables",
        "Nothing — production databases must never be seeded",
      ],
      answerIndex: 2,
      explain:
        "Production seeding is for data the application requires to function — reference/lookup rows — applied idempotently via upsert so deploys can rerun it safely. Demo volume belongs in dev/staging; and it's dumps FROM production that need anonymising, not the reverse.",
    },
  ],
};

export default lesson;
