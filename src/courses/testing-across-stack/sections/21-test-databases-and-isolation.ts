import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "test-databases-and-isolation",
  title: "Test Databases & Isolation",
  part: "Integration & E2E",
  estMinutes: 13,
  summary:
    "Database tests stay fast and repeatable through isolation strategies — transaction-per-test rollback, truncation, or a throwaway engine — plus factories so each test creates exactly the data it needs.",

  concept: `
"How do your tests touch the database?" is one of the questions that separates
senior candidates from everyone else — and after twenty years of MySQL you can
reason about it better than most. The core problem: a database is **shared
mutable state**, and shared mutable state is exactly what tests must not share.
The moment test B can see rows that test A left behind, your suite is
order-dependent — it passes alphabetically, fails in parallel, and nobody
trusts it again.

### Strategy 1: transaction-per-test with rollback

Open a transaction before each test, roll it back after. Nothing a test writes
survives it, and rollback is nearly free:

\`\`\`ts
beforeEach(async () => { await db.query('BEGIN'); });
afterEach(async () => { await db.query('ROLLBACK'); });
\`\`\`

This is Laravel's \`DatabaseTransactions\` trait, if you ever met it — the same
idea works with any client. It is the fastest option, with one famous failure
mode: **it breaks when the code under test commits.** If the service calls
\`COMMIT\`, opens its own transaction, or grabs a second connection (a queue
worker, a second pool), the outer rollback no longer contains it. MySQL adds a
classic gotcha you already know: DDL statements cause an implicit commit.
Savepoints (\`SAVEPOINT\` / \`ROLLBACK TO\`) let frameworks fake nested
transactions, but code that genuinely needs to commit needs strategy 2.

### Strategy 2: truncate between tests

\`TRUNCATE\` (or \`DELETE FROM\`) every table after each test. Slower — real
writes, real cleanup — but it works no matter what the code commits, and it
plays well with tests that exercise transaction behaviour itself. Many teams
mix strategies: transactions by default, truncation for the handful of suites
that need real commits.

### Strategy 3: whose database is it, anyway?

- **In-memory SQLite per suite** — spectacularly fast, zero setup. The catch is
  fidelity: SQLite is not MySQL or Postgres. Type coercion, \`ON UPDATE\`,
  fulltext, JSON functions, strict mode — behaviour differs exactly where bugs
  hide. Fine for testing query-shaped logic; risky as your only proof.
- **A real engine in Docker** (the testcontainers pattern) — the test run
  starts a throwaway \`mysql:8\` container, migrates it, runs the suite, and
  destroys it. Slower to boot, but you test against the engine production runs,
  and CI gets a pristine database on every run for free.

The senior answer is a trade: fidelity versus speed, chosen per layer — not a
single dogma.

### Factories over seed dumps

A shared \`seed.sql\` with "user 42, the admin" is the fixture equivalent of a
global variable: fifty tests silently depend on its shape, and editing one row
breaks tests that never mention it. A **factory function** inverts that — each
test creates precisely the rows it needs, with unique values by default and
overrides for what the test actually cares about:

\`\`\`ts
const user = await makeUser({ plan: 'pro' }); // everything else defaulted
\`\`\`

This is PHPUnit data-builders / Laravel factories done deliberately: the test
reads as a complete story, and no test can be broken by data it didn't create.
`,

  comparisons: [
    {
      label: "Shared dev database vs transaction-per-test",
      intro:
        "Both tests check that upgrading a user sets their plan to 'pro'. The left one runs against the team's dev database; the right one wraps each test in a transaction it rolls back.",
      php: `<?php
// tests/UpgradeTest.php — points at the SHARED dev MySQL
class UpgradeTest extends TestCase
{
    public function testUpgradeSetsPro(): void
    {
        $pdo = new PDO('mysql:host=dev-db;dbname=app', 'dev', 'dev');

        // Hope user 42 from the seed dump still exists...
        upgradeToPro($pdo, 42);

        $plan = $pdo->query(
            'SELECT plan FROM users WHERE id = 42'
        )->fetchColumn();
        $this->assertSame('pro', $plan);
        // User 42 is now 'pro' FOREVER. Every later run —
        // and every teammate — inherits that state.
    }
}`,
      ts: `// tests/upgrade.test.ts — dedicated test DB, rollback per test
import { beforeEach, afterEach, expect, test } from 'vitest';
import { db } from './helpers/test-db';
import { makeUser } from './helpers/factories';
import { upgradeToPro } from '../src/billing';

beforeEach(async () => { await db.query('BEGIN'); });
afterEach(async () => { await db.query('ROLLBACK'); });

test('upgrading a user sets their plan to pro', async () => {
  const user = await makeUser();        // this test's own row
  await upgradeToPro(db, user.id);

  const { plan } = await db.getUser(user.id);
  expect(plan).toBe('pro');
});  // ROLLBACK — the table is exactly as it was`,
      note:
        "The left test mutates state every teammate shares — it passes once, then the data drifts. The right test owns its data (factory) and its cleanup (rollback), so it gives the same answer on run 1 and run 10,000.",
    },
    {
      label: "Seed dump vs factory function",
      intro:
        "A test needs a pro-plan user with a verified email. One version reaches into a communal seed file; the other builds exactly that user.",
      php: `<?php
// tests/seed.sql loaded once for the WHOLE suite:
//   INSERT INTO users VALUES (42, 'admin@app.test', 'pro', 1);
//   INSERT INTO users VALUES (43, 'basic@app.test', 'free', 0);
//   ... 300 more rows nobody dares touch

public function testProUsersSkipTheQueue(): void
{
    // Magic number: WHY 42? You must open seed.sql to know
    // it's the pro+verified one. Change that row and 30
    // unrelated tests fail.
    $this->assertTrue(skipsQueue($this->repo->find(42)));
}`,
      ts: `// tests/queue.test.ts
import { expect, test } from 'vitest';
import { makeUser } from './helpers/factories';
import { skipsQueue } from '../src/queue';

test('pro users with verified email skip the queue', async () => {
  // The test states its OWN preconditions — nothing hidden:
  const user = await makeUser({ plan: 'pro', verified: true });

  expect(skipsQueue(user)).toBe(true);
});

// helpers/factories.ts — unique defaults, override what matters
let seq = 0;
export async function makeUser(overrides: Partial<NewUser> = {}) {
  seq += 1;
  return db.insertUser({
    email: \`user\${seq}@test.dev\`,
    plan: 'free',
    verified: false,
    ...overrides,
  });
}`,
      note:
        "PHPUnit data providers taught you to parameterise inputs; factories do the same for rows. The test names only the two fields it cares about — everything else is a unique default no other test can collide with.",
    },
    {
      label: "In-memory SQLite vs a real engine in Docker",
      intro:
        "Two ways to get a throwaway database for integration tests: SQLite in memory (fast, approximate) or a disposable MySQL container via testcontainers (slower, faithful).",
      php: `// tests/helpers/test-db.ts — SQLite in memory
import Database from 'better-sqlite3';

export function freshDb() {
  const db = new Database(':memory:'); // gone when the suite ends
  db.exec(migrationsSql);
  return db;
}
// Blazing fast. But SQLite is NOT MySQL: type coercion,
// JSON functions, ON UPDATE, strict mode all differ —
// exactly the places where real bugs live.`,
      ts: `// tests/global-setup.ts — a real MySQL 8, thrown away after
import { MySQLContainer } from '@testcontainers/mysql';

export default async function setup() {
  const container = await new MySQLContainer('mysql:8')
    .withDatabase('app_test')
    .start();                      // docker run, wait until ready

  process.env.DATABASE_URL = container.getConnectionUri();
  await runMigrations(process.env.DATABASE_URL);

  return async () => { await container.stop(); }; // teardown
}
// Slower to boot (~seconds), but it is the SAME engine as
// production — and CI gets a pristine DB every run.`,
      note:
        "Neither is 'the right answer' — that's the interview point. SQLite buys speed at the cost of engine fidelity; testcontainers buys fidelity at the cost of a container boot. Choose per suite, and say why.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Transaction-per-test in miniature: a Map-backed 'database' with BEGIN/ROLLBACK snapshot semantics, a factory, and a runner that wraps every test in a transaction. Both tests assert the table is empty when they start — predict the final row count, then run it.",
    code: `// ── Mini test harness (what Vitest does for you, in miniature) ────
function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(\`expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`);
      }
    },
  };
}
const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void) {
  tests.push([name, fn]);
}

// ── An in-memory "database" with transaction semantics ────────────
interface User { id: number; email: string; plan: string }

class MemoryDb {
  private rows = new Map<number, User>();
  private snapshot: Map<number, User> | null = null;
  private nextId = 1;

  begin() { this.snapshot = new Map(this.rows); }        // BEGIN
  rollback() {                                            // ROLLBACK
    if (this.snapshot) { this.rows = this.snapshot; this.snapshot = null; }
  }
  insert(data: Omit<User, 'id'>): User {
    const row = { id: this.nextId++, ...data };
    this.rows.set(row.id, row);
    return row;
  }
  update(id: number, patch: Partial<User>) {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, ...patch });
  }
  find(id: number) { return this.rows.get(id); }
  count() { return this.rows.size; }
}

const db = new MemoryDb();

// Factory: each test creates EXACTLY the data it needs — no seed dump.
let seq = 0;
function makeUser(overrides: Partial<Omit<User, 'id'>> = {}): User {
  seq += 1;
  return db.insert({ email: \`user\${seq}@test.dev\`, plan: 'free', ...overrides });
}

// The code under test:
function upgradeToPro(database: MemoryDb, userId: number) {
  database.update(userId, { plan: 'pro' });
}

// ── Two tests that would collide on a shared database ─────────────
test('upgrading a user sets their plan to pro', () => {
  expect(db.count()).toBe(0);            // clean table — guaranteed
  const user = makeUser();
  upgradeToPro(db, user.id);
  expect(db.find(user.id)?.plan).toBe('pro');
});

test('new users start on the free plan', () => {
  expect(db.count()).toBe(0);            // the pro user above is GONE
  const user = makeUser();
  expect(user.plan).toBe('free');
});

// ── The runner: transaction-per-test ──────────────────────────────
for (const [name, fn] of tests) {
  db.begin();                            // open the transaction
  try { fn(); console.log(\`PASS  \${name}\`); }
  catch (e) { console.log(\`FAIL  \${name}: \${(e as Error).message}\`); }
  finally { db.rollback(); }             // nothing a test does survives it
}
console.log(\`rows left in the table after the suite: \${db.count()}\`);

// Try it: delete the db.rollback() line in the runner. The second
// test's "clean table" assertion fails — that IS test-order dependence.`,
  },

  keyPoints: [
    "A database is shared mutable state — the moment one test can see another's rows, the suite is order-dependent and untrustworthy.",
    "Transaction-per-test (`BEGIN` in setup, `ROLLBACK` in teardown) is the fastest isolation strategy, but it breaks when the code under test commits, opens its own connection, or runs DDL (implicit commit in MySQL).",
    "Truncating tables between tests is slower but survives real commits — many teams default to transactions and fall back to truncation where needed.",
    "In-memory SQLite is fast but not your production engine; a Dockerised real engine (testcontainers pattern: `new MySQLContainer('mysql:8').start()`) trades boot time for fidelity.",
    "Prefer factory functions (`makeUser({ plan: 'pro' })`) over shared seed dumps: each test states its own preconditions and cannot be broken by data it didn't create.",
    "Never point tests at a shared dev database — data drifts with every run and every teammate.",
  ],

  interview: [
    {
      q: "How do you keep tests that hit a database isolated from each other?",
      a: "My default is transaction-per-test: open a transaction in setup, roll it back in teardown, so every test starts from the same schema-plus-migrations state and its writes never survive it. That's nearly free performance-wise. It has a known limit — if the code under test commits, opens a second connection, or runs DDL (which implicitly commits in MySQL), the rollback no longer contains it — so for those suites I truncate tables between tests instead. On top of either strategy, each test creates its own data through factory functions rather than relying on a shared seed, so no test depends on rows it didn't create.",
    },
    {
      q: "Would you run integration tests against SQLite in memory or a real database in Docker?",
      a: "Both have a place, and I'd pick per suite. In-memory SQLite is effectively instant and great for logic that's merely query-shaped, but it isn't the production engine — type coercion, JSON functions, and strict-mode behaviour all differ from MySQL, which is exactly where subtle bugs hide. The testcontainers pattern starts a throwaway `mysql:8` container for the run, migrates it, and destroys it afterwards: a few seconds of boot cost buys you the real engine and a pristine database on every CI run. For a payments or reporting module I'd insist on the real engine; for a small repository layer SQLite may be a fine trade.",
    },
    {
      q: "Why are factory functions preferred over a shared seed dump, and what does that have to do with flaky tests?",
      a: "A seed dump is a global fixture: dozens of tests silently depend on 'user 42 is the pro admin', so editing one row breaks tests that never mention it, and any test that mutates seeded data poisons the tests that run after it — that's the classic root of test-order dependence. A factory like `makeUser({ plan: 'pro' })` inverts the dependency: unique defaults for everything, explicit overrides for the one or two fields the test actually asserts on. The test becomes a self-contained story, and shuffling test order — which good runners do precisely to flush out this bug — changes nothing.",
    },
  ],

  quiz: [
    {
      question:
        "A team wraps every test in a transaction and rolls it back afterwards. Which situation breaks this isolation strategy?",
      options: [
        "A test that reads from two tables in one query",
        "The code under test commits, opens its own second connection, or runs DDL",
        "A test that inserts more than one row",
        "Running the suite in watch mode",
      ],
      answerIndex: 1,
      explain:
        "Rollback only undoes work inside the wrapping transaction on that connection. An explicit COMMIT, a second connection (its own transaction), or DDL — which implicitly commits in MySQL — escapes it. Those suites need truncation between tests instead. Reads and multi-row inserts roll back fine.",
    },
    {
      question:
        "What is the strongest argument for the testcontainers approach (a throwaway MySQL in Docker) over in-memory SQLite for integration tests?",
      options: [
        "Containers make the test suite run faster",
        "SQLite cannot execute JOINs",
        "You test against the same engine production uses, so engine-specific behaviour is covered",
        "Docker is required for Vitest to run at all",
      ],
      answerIndex: 2,
      explain:
        "The container costs a few seconds of boot but gives you production's actual engine — type coercion, JSON functions, and strict-mode quirks included — plus a pristine database every run. SQLite is much faster and handles JOINs fine; what it can't do is behave exactly like MySQL.",
    },
    {
      question:
        "A suite passes when run alphabetically but fails when tests run in random order. What is the most likely cause?",
      options: [
        "The test runner has a bug in its shuffler",
        "Tests share mutable fixture data — one test depends on rows another test created or modified",
        "The database driver doesn't support transactions",
        "Random ordering disables beforeEach hooks",
      ],
      answerIndex: 1,
      explain:
        "Order dependence is the signature of shared mutable fixtures: test B silently relies on state test A left behind. Runners offer random ordering precisely to expose this. The cure is isolation (rollback or truncate) plus factories so each test creates its own data.",
    },
  ],
};

export default lesson;
