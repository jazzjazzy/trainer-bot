import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "testing-against-postgres",
  title: "Testing the Data Layer Against Real Postgres",
  part: "Production & Choosing",
  estMinutes: 12,
  summary:
    "Mock the ORM and you test your mocks; the modern approach runs real Postgres in Docker, applies your actual migrations in setup, and isolates tests by rollback, truncation, or a database per worker.",

  concept: `
You already know this pattern from PHP: nobody sane mocked PDO. You pointed
PHPUnit at a throwaway MySQL or Postgres database, loaded fixtures in
\`setUp()\`, and asserted against real rows. The TypeScript world went through
a phase of mocking the ORM client — and has largely come back to your old
habit, with better tooling.

### Why mocking the ORM lies to you

The interesting failures in a data layer live in the database, not in your
code: unique violations, foreign-key cascades, \`NOT NULL\` checks, transaction
semantics, and the exact SQL the ORM generates. A mocked \`prisma.user.create\`
happily "returns" a row that real Postgres would reject. Worse, the thing you
most need confidence in — that the ORM call produces the SQL you think it
does — is precisely what a mock replaces. You end up asserting that your test
doubles behave like your test doubles.

### Real Postgres, disposable: Docker and Testcontainers

The modern setup gives every test run a real Postgres it can trash:

- **docker compose**: a \`postgres:16\` service on a non-default port, started
  before the suite. Simple, but shared across runs and developers.
- **Testcontainers** (\`@testcontainers/postgresql\`): the test process itself
  starts a throwaway container and gets a unique connection string:

\`\`\`ts
// tests/global-setup.ts (Vitest globalSetup)
const container = await new PostgreSqlContainer("postgres:16").start();
process.env.DATABASE_URL = container.getConnectionUri();
execSync("npx prisma migrate deploy", { env: process.env });
\`\`\`

Note the migration step: you apply the **same migration files production
uses** (\`prisma migrate deploy\` or \`drizzle-kit migrate\`) — never
\`db push\` — so the test schema can't drift from the deployed one.

### Isolation: the same three strategies you used in PHPUnit

1. **Transaction rollback per test** — \`BEGIN\` in before-each, run the test,
   \`ROLLBACK\` in after-each. Fastest option; nothing ever commits. The
   limitation is the same one Doctrine users hit: code under test that manages
   its own transactions or must observe committed data (a second connection,
   a background worker) doesn't fit inside your wrapper transaction.
2. **Truncation between tests** — \`TRUNCATE t1, t2, ... RESTART IDENTITY
   CASCADE\` in before-each. Slower, but every test starts from a genuinely
   empty committed state, and code can commit freely.
3. **A schema or database per worker** — Vitest and Jest run files in
   parallel workers, and two workers truncating one database destroy each
   other. Give each worker its own database (\`app_test_\${workerId}\`) or
   Postgres schema in global setup, run migrations into each, and workers
   never collide. Unique-database-per-worker is the standard answer for
   parallel suites.

### Keep it deterministic

Seed inside the test (or a per-test factory), not from a shared dump; never
assert on auto-generated ids across tests unless you \`RESTART IDENTITY\`;
freeze or inject the clock instead of comparing against \`now()\`. Flaky data
tests are almost always shared mutable state — the same lesson as flaky
PHPUnit suites, twenty years on.
`,

  comparisons: [
    {
      label: "Cleaning state between tests: TRUNCATE then and now",
      intro:
        "Both suites reset the tables before every test so each one starts from a known-empty database. The strategy is identical; only the runner changed.",
      php: `<?php
// tests/UserRepositoryTest.php (PHPUnit)
class UserRepositoryTest extends TestCase
{
    private PDO $pdo;

    protected function setUp(): void
    {
        $this->pdo = new PDO(getenv('TEST_DATABASE_DSN'));
        // Reset state before every test:
        $this->pdo->exec(
            'TRUNCATE users, orders RESTART IDENTITY CASCADE'
        );
    }

    public function testCreatesUser(): void
    {
        $repo = new UserRepository($this->pdo);
        $user = $repo->create('ada@example.com');
        $this->assertSame(1, $user['id']);
    }
}`,
      ts: `// tests/user-repository.test.ts (Vitest)
import { beforeEach, expect, test } from "vitest";
import { db, pool } from "../src/db";
import { createUser } from "../src/user-repository";

beforeEach(async () => {
  // Same reset, same SQL — one round trip, FKs handled:
  await pool.query(
    "TRUNCATE users, orders RESTART IDENTITY CASCADE"
  );
});

test("creates a user", async () => {
  const user = await createUser(db, "ada@example.com");
  expect(user.id).toBe(1);
  // Asserting id === 1 only works because
  // RESTART IDENTITY resets the sequence.
});`,
      note: "TRUNCATE ... RESTART IDENTITY CASCADE is the workhorse in both worlds: one statement empties the tables, resets sequences, and follows foreign keys — no per-table DELETE ordering.",
    },
    {
      label: "Pointing tests at a database: .env.test vs Testcontainers",
      intro:
        "The PHP version assumes a long-lived test database someone created by hand. The Testcontainers version creates a disposable Postgres per run and applies the real migrations to it.",
      php: `<?php
// tests/bootstrap.php — phpunit.xml points here
// .env.test:
//   TEST_DATABASE_DSN=pgsql:host=localhost;port=5433;dbname=app_test
//   TEST_DATABASE_USER=app_test

$dsn  = getenv('TEST_DATABASE_DSN');
$pdo  = new PDO($dsn, getenv('TEST_DATABASE_USER'), 'secret');

// Hope someone remembered to run the schema script
// against app_test after the last migration...
$pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));`,
      ts: `// tests/global-setup.ts — Vitest globalSetup
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";

export default async function setup() {
  // A fresh postgres:16 container, unique port, empty DB:
  const container = await new PostgreSqlContainer(
    "postgres:16"
  ).start();

  process.env.DATABASE_URL = container.getConnectionUri();

  // Apply the SAME migrations production runs:
  execSync("npx prisma migrate deploy", {
    env: process.env,
    stdio: "inherit",
  });

  return async () => {
    await container.stop();
  };
}`,
      note: "Testcontainers removes the 'stale shared test DB' failure mode: every run gets a pristine Postgres, and migrate deploy (not db push) guarantees the schema matches what production will run.",
    },
    {
      label: "Transaction-rollback-per-test",
      intro:
        "The fastest isolation strategy: wrap each test in a transaction that is always rolled back. Doctrine users did this in setUp/tearDown; here is the raw-PDO version next to a pg/Drizzle helper.",
      php: `<?php
// tests/RollbackTestCase.php
abstract class RollbackTestCase extends TestCase
{
    protected PDO $pdo;

    protected function setUp(): void
    {
        $this->pdo = TestDb::pdo();
        $this->pdo->beginTransaction();
    }

    protected function tearDown(): void
    {
        // Nothing this test wrote survives:
        $this->pdo->rollBack();
    }
}`,
      ts: `// tests/with-rollback.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "../src/db";

export async function withRollback(
  fn: (tx: ReturnType<typeof drizzle>) => Promise<void>
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(drizzle({ client }));
  } finally {
    await client.query("ROLLBACK"); // always
    client.release();
  }
}
// Limitation (same as Doctrine's wrapper): code that
// commits, or a second connection, can't see this data.`,
      note: "Rollback-per-test is the speed king, but it only works when everything under test shares the wrapped connection — code that opens its own transaction or connection needs truncation instead.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature withRollback(testFn) helper over an in-memory 'database': snapshot before the test, restore after, so writes never leak between tests. Predict what the two row-count lines print, then run it.",
    code: `// Transaction-rollback-per-test, modelled in memory.
// snapshot() plays BEGIN; restore() plays ROLLBACK.

interface UserRow {
  id: number;
  email: string;
}

interface Db {
  users: UserRow[];
}

const db: Db = { users: [{ id: 1, email: "seed@example.com" }] };

function snapshot(d: Db): Db {
  return { users: d.users.map((u) => ({ ...u })) };
}

function restore(d: Db, snap: Db): void {
  d.users = snap.users.map((u) => ({ ...u }));
}

async function withRollback(
  name: string,
  testFn: (d: Db) => void | Promise<void>
): Promise<void> {
  const snap = snapshot(db); // BEGIN
  try {
    await testFn(db);
    console.log("PASS  " + name);
  } catch (err) {
    console.log("FAIL  " + name + " — " + (err as Error).message);
  } finally {
    restore(db, snap); // ROLLBACK — even if the test threw
  }
}

await withRollback("creates a user", (d) => {
  d.users.push({ id: 2, email: "ada@example.com" });
  if (d.users.length !== 2) throw new Error("expected 2 rows");
});
console.log("rows committed after test 1:", db.users.length);

await withRollback("starts from clean state", (d) => {
  // If test 1 leaked its insert, this fails:
  if (d.users.length !== 1) {
    throw new Error("leaked state: " + d.users.length + " rows");
  }
  d.users.push({ id: 2, email: "grace@example.com" });
});
console.log("rows committed after test 2:", db.users.length);

// Both tests saw exactly one seed row; nothing they wrote
// survived. That's rollback-per-test isolation.`,
  },

  keyPoints: [
    "Mocking the ORM tests your mocks: unique violations, FK cascades, and the generated SQL only fail against real Postgres — the same reason you never mocked PDO.",
    "Testcontainers (`@testcontainers/postgresql`) starts a throwaway `postgres:16` container per run; `getConnectionUri()` feeds `DATABASE_URL`.",
    "Apply real migration artifacts in test setup — `prisma migrate deploy` or `drizzle-kit migrate`, never `db push` — so the test schema cannot drift from production.",
    "Three isolation strategies, straight from PHPUnit: rollback-per-test (fastest, single connection only), `TRUNCATE ... RESTART IDENTITY CASCADE` between tests, and a database or schema per parallel worker.",
    "Parallel runners (Vitest/Jest workers) sharing one database corrupt each other — unique-database-per-worker is the standard fix.",
    "Determinism comes from per-test seeding, reset sequences, and an injected clock — flaky data tests are almost always shared mutable state.",
  ],

  interview: [
    {
      q: "How do you test code that uses an ORM — do you mock the Prisma or Drizzle client?",
      a: "No — I run tests against real Postgres, usually a throwaway container via Testcontainers, with the project's actual migrations applied in global setup. Twenty-plus years of PHP taught me that the failures worth catching live in the database: unique and foreign-key violations, transaction semantics, and the exact SQL the ORM emits. A mocked client returns whatever I tell it to, so I'd be asserting my assumptions back at myself. I reserve mocks for the layer above the repository — services get a faked repository, but the repository itself is tested against Postgres.",
    },
    {
      q: "How do you keep database tests isolated from each other without making the suite slow?",
      a: "Pick per project from three strategies I've used since PHPUnit days. Rollback-per-test — BEGIN in before-each, ROLLBACK in after-each — is fastest and my default when everything under test shares one connection; its limit is code that commits or opens its own connection. Truncation between tests with `TRUNCATE ... RESTART IDENTITY CASCADE` is slightly slower but every test starts from committed empty state. And for parallel runners, each worker gets its own database created and migrated in global setup, so Vitest workers never fight over rows. In practice I combine them: database-per-worker for parallelism, truncation or rollback within a worker.",
    },
    {
      q: "Your test suite runs migrations with prisma migrate deploy rather than db push. Why does that matter?",
      a: "Because the migrations are the artifact production runs, and the tests should certify that artifact. `db push` diffs the schema and mutates the database directly — it can produce a schema that's subtly different from what the ordered migration files build, and it exercises none of them. If a migration is broken — bad column rename, missing default — I want the test suite to fail in CI, not the deploy step at 2 a.m. Same discipline as PHP days: the test database was built by the same .sql migrations as production, or the tests were lying.",
    },
  ],

  quiz: [
    {
      question:
        "Why is mocking the ORM client considered a weak strategy for testing a data layer?",
      options: [
        "Mocks are too slow to construct in JavaScript",
        "The failures that matter — constraint violations, transaction semantics, the generated SQL — only occur in a real database, which the mock replaces",
        "Prisma and Drizzle clients cannot be mocked because their types are generated",
        "Mocking is fine for Drizzle but impossible for Prisma",
      ],
      answerIndex: 1,
      explain:
        "A mock returns whatever the test author scripted, so unique violations, FK cascades, and wrong generated SQL can never surface. Both clients are perfectly mockable technically — it's just that doing so removes exactly the behaviour you need confidence in.",
    },
    {
      question:
        "A test suite uses rollback-per-test isolation. Which situation breaks it?",
      options: [
        "A test that inserts more than one row",
        "A test that reads and writes the same table",
        "Code under test that opens its own transaction or a second connection and must observe committed data",
        "Running the suite against Postgres 16 instead of 15",
      ],
      answerIndex: 2,
      explain:
        "Rollback-per-test wraps everything in one never-committed transaction on one connection. Code that commits, manages its own transactions, or reads from a second connection can't see that uncommitted data — those tests need truncation-based isolation instead.",
    },
    {
      question:
        "Vitest runs test files in parallel workers against one shared test database and tests fail randomly. What is the standard fix?",
      options: [
        "Disable parallelism so files run one at a time",
        "Give each worker its own database (or schema), created and migrated in global setup",
        "Switch every test to mocks so the database is not touched",
        "Add retries until the failures stop appearing",
      ],
      answerIndex: 1,
      explain:
        "Workers truncating and seeding one database destroy each other's state. Unique-database-per-worker keeps full parallelism and full isolation; disabling parallelism works but throws away the speed, and retries just hide the race.",
    },
  ],
};

export default lesson;
