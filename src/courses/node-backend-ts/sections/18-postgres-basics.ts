import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "postgres-basics",
  title: "Talking to Postgres with pg",
  part: "Async, Data & Validation",
  estMinutes: 13,
  summary:
    "node-postgres gives you a real connection pool as a module-level singleton, $1/$2 parameterized queries instead of PDO's placeholders, and transactions on a dedicated client you must release.",

  concept: `
The database driver is where Node's long-running process pays off most
directly. In PHP, every request built the world from scratch — including the
database connection. \`new PDO(...)\` per request, TCP handshake, auth, TLS,
teardown. Persistent connections (\`PDO::ATTR_PERSISTENT\`) or an external
pooler like pgbouncer could soften that, but real in-process pooling was
impossible: the process died with the request.

Node's process never dies, so **node-postgres** (\`pg\`, 8.x) can hold a real
pool of live connections that every request borrows from and returns to.

### The Pool: a module-level singleton

\`\`\`ts
// src/db.ts — evaluated ONCE when first imported, shared forever
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // cap concurrent connections (10 is the default)
});
\`\`\`

Module-level state persisting across requests is exactly the Node property
that made in-memory caches a footgun — here it's the feature. Every handler
imports the same \`pool\`; each \`pool.query()\` borrows an idle connection and
returns it automatically.

### Queries: $1, $2 instead of ? or :named

\`\`\`ts
const result = await pool.query(
  "SELECT id, email, status FROM users WHERE status = $1 AND created_at > $2",
  ["active", "2026-01-01"],
);
result.rows;     // array of plain objects: [{ id: 2, email: "...", ... }]
result.rowCount; // number of rows returned/affected
\`\`\`

Same SQL-injection defense as PDO prepared statements — values travel
separately from the SQL text — just different placeholder syntax: Postgres's
native numbered \`$1, $2\` (reusable within a query) instead of PDO's \`?\` or
\`:named\`. There's no \`prepare()\`/\`execute()\` two-step for everyday use;
\`pool.query(text, values)\` does it in one call.

### Typing rows: a promise, not a proof

\`\`\`ts
interface UserRow {
  id: number;
  email: string;
  status: "active" | "banned";
}

const { rows } = await pool.query<UserRow>(
  "SELECT id, email, status FROM users WHERE status = $1",
  ["active"],
);
rows[0].email; // typed as string — autocomplete, refactor safety
\`\`\`

Be honest about what that generic is: **you asserting**, not pg checking. If
the real column is \`email_address\`, TypeScript still says \`email: string\` and
you get \`undefined\` at runtime. The type is a contract with yourself — worth
having, but if you want it verified, validate rows (a zod schema) or use a
query builder / ORM that derives types from the schema. Prisma and Drizzle do
exactly that; deep ORM work is a separate course — know they exist and why.

### Transactions: a dedicated client, always released

\`pool.query()\` may use a **different connection each call** — useless for
transactions, which live on one session. Check out a client and release it in
\`finally\`, no matter what:

\`\`\`ts
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
    [amount, fromId],
  );
  await client.query(
    "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
    [amount, toId],
  );
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release(); // forget this and the pool leaks a connection — forever
}
\`\`\`

In PHP a leaked handle died with the request. Here the process lives on, so a
forgotten \`release()\` permanently shrinks the pool — after \`max\` leaks, every
query in the app hangs waiting for a connection that will never come back.
`,

  comparisons: [
    {
      label: "A parameterized SELECT",
      intro:
        "Fetch active users created after a date, with user-supplied values kept out of the SQL text. PDO prepares then executes; pg does both in one pool.query call with $1/$2 placeholders.",
      php: `<?php
// PDO: connection built for THIS request, dies with it
$pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$stmt = $pdo->prepare(
    'SELECT id, email, status FROM users
     WHERE status = :status AND created_at > :since'
);
$stmt->execute(['status' => 'active', 'since' => '2026-01-01']);

$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
// [['id' => 2, 'email' => 'dana@example.com', ...], ...]`,
      ts: `// db.ts + handler — pool lives across ALL requests
import { Pool } from "pg";
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

interface UserRow {
  id: number;
  email: string;
  status: "active" | "banned";
}

const { rows } = await pool.query<UserRow>(
  \`SELECT id, email, status FROM users
   WHERE status = $1 AND created_at > $2\`,
  ["active", "2026-01-01"],
);
// rows: UserRow[] — but the generic is YOUR claim, not pg's check`,
      note:
        "Same injection defense — values never touch the SQL string — but placeholders are Postgres-native $1/$2 (positional, reusable) rather than PDO's ? or :named, and there's no separate prepare step.",
    },
    {
      label: "A money-moving transaction",
      intro:
        "Transfer funds between two accounts atomically. PDO wraps its one per-request connection; pg must check out a dedicated client because pool.query may hit a different connection per call.",
      php: `<?php
// One connection per request — the transaction
// naturally lives on it
try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        'UPDATE accounts SET balance = balance - ? WHERE id = ?'
    );
    $stmt->execute([$amount, $fromId]);

    $stmt = $pdo->prepare(
        'UPDATE accounts SET balance = balance + ? WHERE id = ?'
    );
    $stmt->execute([$amount, $toId]);

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
} // request ends -> connection cleaned up regardless`,
      ts: `// transfer.ts — one client, BEGIN..COMMIT, release in finally
const client = await pool.connect(); // dedicated connection
try {
  await client.query("BEGIN");

  await client.query(
    "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
    [amount, fromId],
  );
  await client.query(
    "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
    [amount, toId],
  );

  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release(); // no request death to save you — leak = pool shrinks forever
}`,
      note:
        "The structural difference: pool.query() is fine for single statements, but a transaction needs ONE session — pool.connect() checks out a client, and release() in finally is non-negotiable in a process that never dies.",
    },
  ],

  playground: {
    lang: "sql",
    intro:
      "Read-and-predict. The app runs: pool.query<UserRow>('SELECT id, email, status FROM users WHERE status = $1 ORDER BY id', ['active']). Given the users table below, predict what psql would show AND what result.rows holds, then reveal the output.",
    code: `-- The table:
--  id |       email        | status
-- ----+--------------------+---------
--   1 | ana@example.com    | banned
--   2 | dana@example.com   | active
--   3 | kim@example.com    | pending
--   4 | jo@example.com     | banned
--   5 | lee@example.com    | active

-- The query pg sends ($1 bound separately to 'active'):
SELECT id, email, status
FROM users
WHERE status = $1
ORDER BY id;`,
    output: ` id |      email       | status
----+------------------+--------
  2 | dana@example.com | active
  5 | lee@example.com  | active
(2 rows)

-- and in Node, result.rows is plain objects:
[
  { id: 2, email: 'dana@example.com', status: 'active' },
  { id: 5, email: 'lee@example.com', status: 'active' }
]
-- result.rowCount === 2`,
  },

  keyPoints: [
    "Create ONE `new Pool()` in a module (`src/db.ts`) and import it everywhere — the long-running process makes real in-process connection pooling possible, where PHP needed pgbouncer or persistent connections.",
    "`pool.query(text, values)` uses Postgres-native `$1, $2` placeholders — same injection defense as PDO's `?`/`:named`, no separate prepare step.",
    "Results come back as `result.rows` (array of plain objects) and `result.rowCount`.",
    "`pool.query<UserRow>()` types the rows, but the generic is an assertion, not a check — a wrong column name still compiles and yields `undefined`. Validate rows or use a schema-deriving tool (Prisma/Drizzle) when it must be true.",
    "Transactions need one session: `pool.connect()` for a dedicated client, `BEGIN`/`COMMIT`/`ROLLBACK` in try/catch, and `client.release()` in `finally` — a leaked client shrinks the pool for the life of the process.",
    "Pool `max` defaults to 10 connections; exhaust it (e.g. via leaks) and every subsequent query waits forever.",
  ],

  interview: [
    {
      q: "How does database connection handling differ between PHP-FPM and Node?",
      a: "In PHP-FPM every request built and tore down its own connection — new PDO, handshake, auth, gone. Real pooling inside the app was impossible because the process died with the request; you approximated it with persistent connections or an external pooler like pgbouncer. Node's process is long-running, so node-postgres holds an actual in-process pool: a module-level `new Pool()` keeps live connections that handlers borrow via `pool.query()` and return automatically. It's the constructive side of the same property that makes module-level state a footgun — here persistence across requests is exactly what you want. The flip side is discipline: a client checked out with `pool.connect()` and never released doesn't get cleaned up by request death, it's gone until the process restarts.",
    },
    {
      q: "You added pool.query<UserRow>() generics everywhere. Is your data layer now type-safe?",
      a: "No — and saying so is the honest answer. The generic tells TypeScript what shape I *claim* the rows have; pg does no checking against the actual result. If the schema says `email_address` and my interface says `email`, everything compiles and I read `undefined` at runtime. It's still worth doing — autocomplete, refactoring safety, documenting intent — but it's a promise, not a proof. To make it real you either validate rows at the boundary with something like zod, or use a tool that derives types from the schema itself — Prisma or Drizzle — so the types can't drift from the database.",
    },
    {
      q: "Why can't you run a transaction through pool.query(), and what's the correct pattern?",
      a: "Because a transaction is state on one database session, and consecutive `pool.query()` calls may each borrow a *different* connection — your `BEGIN` could land on one session and the `UPDATE` on another, silently outside the transaction. The pattern is: `const client = await pool.connect()` for a dedicated client, then `BEGIN`, the statements, `COMMIT`, with `ROLLBACK` in the catch and — critically — `client.release()` in `finally`. In PHP the dying request cleaned up any mess; in Node a forgotten release leaks that connection for the process's lifetime, and once you've leaked `max` of them (default 10), every query in the app hangs waiting on an empty pool.",
    },
  ],

  quiz: [
    {
      question: "Where should `new Pool()` be created in an Express app?",
      options: [
        "Inside each request handler, so every request gets a fresh pool",
        "Once, at module level (e.g. src/db.ts), imported by every handler",
        "Inside middleware, attached to req for each request",
        "Once per route file, so each router has its own pool",
      ],
      answerIndex: 1,
      explain:
        "The pool IS the long-lived, shared resource — module-level state persisting across requests is the point here. A pool per request or per router recreates PHP's connect-per-request cost and multiplies open connections against Postgres's limits.",
    },
    {
      question:
        "In a transaction, why use a client from pool.connect() instead of multiple pool.query() calls?",
      options: [
        "pool.query() can't execute BEGIN or COMMIT statements",
        "A dedicated client is faster for repeated queries",
        "Each pool.query() may run on a DIFFERENT connection, but a transaction is state on one session",
        "pool.query() auto-commits after every statement, and that can't be disabled",
      ],
      answerIndex: 2,
      explain:
        "Transactions are per-session: BEGIN on connection A does nothing for an UPDATE that runs on connection B. pool.connect() pins one session for the whole BEGIN→COMMIT/ROLLBACK sequence — then client.release() in finally hands it back.",
    },
    {
      question:
        "A code path checks out a client with pool.connect() but skips client.release() when an error throws. What happens over time?",
      options: [
        "Nothing — Node's garbage collector returns idle clients to the pool",
        "The pool shrinks by one connection per leak; after `max` leaks (default 10), every query in the app hangs",
        "pg throws a LeakError on the next query",
        "Postgres closes the connection after the request ends",
      ],
      answerIndex: 1,
      explain:
        "There's no request death to clean up after you — the process (and the leaked checkout) lives on. Each leak permanently removes a connection from circulation, and when the pool is empty, pool.query() callers queue forever. That's why release() lives in finally.",
    },
    {
      question: "What does the type parameter in pool.query<UserRow>(sql) actually do?",
      options: [
        "Makes pg validate each row against UserRow and throw on mismatch",
        "Generates SQL column aliases so the row matches UserRow",
        "Only tells TypeScript to treat result.rows as UserRow[] — no runtime checking of any kind",
        "Casts Postgres column types to match the interface's types",
      ],
      answerIndex: 2,
      explain:
        "The generic is purely compile-time: rows get the type you asserted, checked against nothing. A renamed column still compiles and reads undefined at runtime. Validation (zod) or schema-derived types (Prisma/Drizzle) is how you make the claim true.",
    },
  ],
};

export default lesson;
