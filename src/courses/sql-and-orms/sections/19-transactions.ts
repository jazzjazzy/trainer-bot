import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "transactions",
  title: "Transactions: $transaction and db.transaction",
  part: "Transactions & Performance",
  estMinutes: 13,
  summary:
    "PDO's beginTransaction/commit/rollBack becomes a callback in both ORMs — commit on return, rollback on throw — with typed options for isolation levels, timeouts, and savepoints.",

  concept: `
You already know the hard parts of transactions — atomicity, isolation
levels, lock contention, keeping them short. What's new is the shape: both
ORMs replace PDO's \`beginTransaction()\` / \`commit()\` / \`rollBack()\`
triple with a **callback**. Return normally → COMMIT. Throw → ROLLBACK. The
try/catch you wrote around every PDO transaction is now the structure itself,
so a forgotten rollback path can't exist.

### Prisma: two forms of $transaction

**Sequential (array) form** — a batch of queries executed in order inside one
transaction, no logic in between:

\`\`\`ts
const [posts, total] = await prisma.$transaction([
  prisma.post.findMany({ where: { published: true } }),
  prisma.post.count(),
]);
\`\`\`

**Interactive (callback) form** — for logic that reads, decides, then writes.
The callback receives \`tx\`, a client scoped to the transaction:

\`\`\`ts
await prisma.$transaction(
  async (tx) => {
    const sender = await tx.account.update({
      where: { email: "alice@example.com" },
      data: { balance: { decrement: 100 } },
    });
    if (sender.balance < 0) throw new Error("insufficient funds"); // → ROLLBACK
    await tx.account.update({
      where: { email: "bob@example.com" },
      data: { balance: { increment: 100 } },
    });
  },
  {
    maxWait: 2000,  // ms to wait for a connection (default 2s)
    timeout: 5000,  // ms before forced rollback (default 5s)
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  },
);
\`\`\`

Use \`tx\`, not \`prisma\`, inside the callback — queries on the outer client
run **outside** the transaction, a classic bug.

### Drizzle: db.transaction, rollback, savepoints

\`\`\`ts
await db.transaction(
  async (tx) => {
    const [account] = await tx.select().from(accounts)
      .where(eq(accounts.owner, "alice"));
    if (account.balance < 100) tx.rollback(); // throws → ROLLBACK

    await tx.transaction(async (tx2) => {
      // nested transaction = SAVEPOINT; its failure
      // rolls back to the savepoint, not the whole tx
    });
  },
  { isolationLevel: "serializable", accessMode: "read write" },
);
\`\`\`

\`tx.rollback()\` throws internally, so execution stops there. Nested
\`tx.transaction()\` calls map to \`SAVEPOINT\` / \`ROLLBACK TO SAVEPOINT\` —
the same partial-undo mechanism you used in raw SQL.

### The rules you already enforce, restated

- **Keep transactions short.** The callback holds a connection and its locks
  for its whole life. Prisma's 5-second default timeout is a guard rail,
  not a target.
- **Never await external I/O inside** — no HTTP calls, no queue publishes.
  A slow third-party API inside a transaction is a lock held for seconds and
  a pool drained under load.
- **Isolation is Postgres, not the ORM.** Default \`READ COMMITTED\`;
  \`REPEATABLE READ\` gives a stable snapshot; \`SERIALIZABLE\` gives true
  serializability but can fail with error \`40001\` — the *caller* must
  retry. The ORM options just emit \`BEGIN ISOLATION LEVEL ...\`; the
  semantics are the ones you already know cold.
`,

  comparisons: [
    {
      label: "PDO try/commit/rollback vs interactive $transaction",
      intro:
        "A transfer that must debit and credit atomically. In PDO the rollback lives in your catch block; in Prisma the throw IS the rollback.",
      php: `<?php
try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        'UPDATE accounts SET balance = balance - ?
         WHERE email = ? RETURNING balance'
    );
    $stmt->execute([100, 'alice@example.com']);
    $balance = $stmt->fetchColumn();

    if ($balance < 0) {
        throw new RuntimeException('insufficient');
    }

    $pdo->prepare(
        'UPDATE accounts SET balance = balance + ?
         WHERE email = ?'
    )->execute([100, 'bob@example.com']);

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack(); // forget this and the
    throw $e;         // connection is left mid-tx
}`,
      ts: `// commit on return, rollback on throw
await prisma.$transaction(
  async (tx) => {
    const sender = await tx.account.update({
      where: { email: "alice@example.com" },
      data: { balance: { decrement: 100 } },
    });

    if (sender.balance < 0) {
      throw new Error("insufficient"); // ROLLBACK
    }

    await tx.account.update({
      where: { email: "bob@example.com" },
      data: { balance: { increment: 100 } },
    });
  }, // reaching here = COMMIT
  { timeout: 5000, maxWait: 2000 },
);`,
      note:
        "The callback structure makes the missing-rollBack bug unwritable — but inside it you must use tx, not prisma: queries on the outer client silently run outside the transaction.",
    },
    {
      label: "Raw SAVEPOINT vs Drizzle nested transactions",
      intro:
        "Undo part of a transaction without losing all of it. The SQL you know; Drizzle expresses it as a nested transaction callback.",
      php: `BEGIN;

UPDATE accounts SET balance = balance - 100
WHERE owner = 'alice';

SAVEPOINT audit_log;

-- audit insert fails (e.g. constraint):
INSERT INTO audit (event) VALUES ('transfer');

-- undo ONLY the audit insert:
ROLLBACK TO SAVEPOINT audit_log;

-- the debit above survives:
COMMIT;`,
      ts: `await db.transaction(async (tx) => {
  await tx
    .update(accounts)
    .set({ balance: sql\`\${accounts.balance} - 100\` })
    .where(eq(accounts.owner, "alice"));

  try {
    // nested transaction = SAVEPOINT
    await tx.transaction(async (tx2) => {
      await tx2.insert(audit)
        .values({ event: "transfer" });
    });
  } catch {
    // inner failure rolled back TO the
    // savepoint; the debit above survives
  }
}); // COMMIT`,
      note:
        "Each nested tx.transaction() wraps its work in SAVEPOINT/RELEASE, and a throw inside it becomes ROLLBACK TO SAVEPOINT — catch it in the outer callback if the outer work should still commit.",
      leftLang: "sql",
    },
    {
      label: "Two statements, one atomic batch",
      intro:
        "Delete-then-recreate as an all-or-nothing unit with no decision logic in between — PDO strings the statements together; Prisma's array form batches them.",
      php: `<?php
$pdo->beginTransaction();
try {
    $pdo->prepare(
        'DELETE FROM tags WHERE post_id = ?'
    )->execute([42]);

    $stmt = $pdo->prepare(
        'INSERT INTO tags (post_id, name)
         VALUES (?, ?)'
    );
    foreach (['sql', 'orm'] as $tag) {
        $stmt->execute([42, $tag]);
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}`,
      ts: `// sequential array form: no logic between
// statements, all-or-nothing, results in order
const [, created] = await prisma.$transaction([
  prisma.tag.deleteMany({
    where: { postId: 42 },
  }),
  prisma.tag.createMany({
    data: [
      { postId: 42, name: "sql" },
      { postId: 42, name: "orm" },
    ],
  }),
]);

// need to READ and branch mid-transaction?
// that's the interactive callback's job.`,
      note:
        "The array form can't branch on intermediate results — it's for fixed batches. The moment you need if/else between queries, switch to the interactive callback.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A transaction simulator: the callback works on a copy of the ledger; returning commits it, throwing discards it. The failing transfer writes its debit AND credit before the check fires — predict the final balances, then run.",
    code: `// A money transfer inside a transaction, with rollback on failure.

type Ledger = Map<string, number>;

const accounts: Ledger = new Map([
  ['alice', 500],
  ['bob', 100],
]);

// db.transaction / $transaction in miniature: run the callback against a
// working copy; COMMIT on return, ROLLBACK (discard the copy) on throw.
async function transaction<T>(fn: (tx: Ledger) => Promise<T>): Promise<T> {
  const tx: Ledger = new Map(accounts); // BEGIN
  const result = await fn(tx); // a throw here -> tx is discarded = ROLLBACK
  for (const [account, balance] of tx) accounts.set(account, balance); // COMMIT
  return result;
}

async function transfer(from: string, to: string, amount: number) {
  return transaction(async (tx) => {
    tx.set(from, (tx.get(from) ?? 0) - amount); // debit is written...
    tx.set(to, (tx.get(to) ?? 0) + amount); // ...credit is written...
    if ((tx.get(from) ?? 0) < 0) {
      // ...then the rule fires, like a CHECK constraint violation.
      throw new Error(\`insufficient funds: \${from} would go negative\`);
    }
  });
}

function show(label: string) {
  console.log(\`\${label}: alice=\${accounts.get('alice')} bob=\${accounts.get('bob')}\`);
}

show('before          ');
await transfer('alice', 'bob', 200);
show('after commit    ');

try {
  await transfer('bob', 'alice', 10_000); // both writes happen on the copy...
} catch (err) {
  console.log('transfer failed :', (err as Error).message);
}
show('after rollback  '); // ...but the ledger never saw them`,
  },

  keyPoints: [
    "Both ORMs use callback transactions: return = COMMIT, throw = ROLLBACK — PDO's try/commit/rollBack pattern with the forgotten-rollback bug made unwritable.",
    "Prisma `$transaction([...])` runs a fixed batch sequentially; the interactive `$transaction(async (tx) => ...)` form is for read-decide-write logic, with `maxWait` (default 2s), `timeout` (default 5s), and `isolationLevel` options.",
    "Inside the callback, always query through `tx` — statements on the outer `prisma`/`db` client run OUTSIDE the transaction.",
    "Drizzle's `tx.rollback()` throws to abort, and nested `tx.transaction()` calls compile to SAVEPOINT / ROLLBACK TO SAVEPOINT.",
    "Keep transactions short and never await external I/O (HTTP, queues) inside one — the callback holds a pooled connection and its locks the whole time.",
    "Isolation levels are Postgres semantics surfaced through options: READ COMMITTED default, SERIALIZABLE needs a retry loop for error 40001.",
  ],

  interview: [
    {
      q: "Prisma has two $transaction forms — when do you use which?",
      a: "The array form takes a fixed list of Prisma queries and runs them sequentially in one transaction — it's for all-or-nothing batches where nothing needs to be decided mid-flight, like delete-then-recreate, and it returns the results as an array. The interactive form takes an async callback receiving `tx`, a transaction-scoped client, and is for read-decide-write logic: debit an account, inspect the balance, throw to roll back if it went negative. It accepts `maxWait` (how long to wait for a connection, default 2s), `timeout` (how long the transaction may run before forced rollback, default 5s), and `isolationLevel`. Those short defaults are deliberate — an interactive transaction holds a pooled connection and its locks, so I treat needing a longer timeout as a design smell first.",
    },
    {
      q: "What are the classic mistakes inside a callback transaction?",
      a: "First: using the outer client instead of `tx` — `prisma.user.update(...)` inside a `$transaction` callback runs on a different connection, outside the transaction, so it neither sees uncommitted writes nor rolls back with them. Same rule in Drizzle with `db` versus `tx`. Second: awaiting external I/O — an HTTP call or queue publish inside the callback means row locks and a pooled connection held for the duration of somebody else's latency, which under load drains the pool. The fix is to do the slow work before or after, and keep the transaction to pure database statements. Third, from my PDO years: assuming isolation does more than it does — READ COMMITTED still allows non-repeatable reads, so a balance check and the update that depends on it need row locking (`SELECT ... FOR UPDATE`) or a higher isolation level.",
    },
    {
      q: "How do isolation levels surface in these ORMs, and what do you actually pick?",
      a: "Both just parameterise the BEGIN: Prisma via `isolationLevel: Prisma.TransactionIsolationLevel.Serializable` on either $transaction form, Drizzle via `{ isolationLevel: 'serializable', accessMode, deferrable }` as `db.transaction`'s second argument. The semantics are pure Postgres: READ COMMITTED by default, REPEATABLE READ for a stable snapshot of the whole transaction, SERIALIZABLE for true serializability at the cost of serialization failures — error 40001 — which the application must catch and retry, something neither ORM does for you. In practice I stay on READ COMMITTED plus explicit row locking for most OLTP work, and reserve SERIALIZABLE with a retry loop for invariants that span multiple rows, like enforcing an account can't go negative across concurrent transfers.",
    },
    {
      q: "How do savepoints work in Drizzle?",
      a: "Nested transactions. Calling `tx.transaction(async (tx2) => ...)` inside an open transaction emits SAVEPOINT before the inner callback and RELEASE after; if the inner callback throws — or calls `tx2.rollback()`, which throws internally — Drizzle issues ROLLBACK TO SAVEPOINT, undoing only the inner work. If the outer transaction should survive the inner failure, I wrap the nested call in try/catch; otherwise the exception propagates and rolls back everything. It's exactly the SAVEPOINT/ROLLBACK TO pattern I used raw for things like best-effort audit writes inside a mandatory business transaction — the ORM version just ties the savepoint's lifetime to a callback scope.",
    },
  ],

  quiz: [
    {
      question:
        "Inside prisma.$transaction(async (tx) => { ... }), what happens if you run prisma.user.update(...) instead of tx.user.update(...)?",
      options: [
        "It works the same — prisma is aliased to tx inside the callback",
        "It throws P2028 immediately",
        "It runs on a separate connection outside the transaction — it won't roll back with it",
        "It deadlocks against the transaction",
      ],
      answerIndex: 2,
      explain:
        "Only tx is bound to the open transaction. The outer client checks out its own connection, so the query commits independently and survives the transaction's rollback — one of the most common transaction bugs in Prisma code.",
    },
    {
      question: "What does Drizzle's tx.rollback() actually do?",
      options: [
        "Sends ROLLBACK and continues executing the callback",
        "Throws an exception, so execution stops and the transaction is rolled back",
        "Marks the transaction for rollback at COMMIT time",
        "Rolls back only the most recent statement",
      ],
      answerIndex: 1,
      explain:
        "tx.rollback() throws — the lines after it never run, the callback aborts, and Drizzle issues the ROLLBACK. In a nested transaction the same mechanism becomes ROLLBACK TO SAVEPOINT.",
    },
    {
      question:
        "Why is awaiting a third-party HTTP call inside a transaction callback a production problem?",
      options: [
        "The ORM can't serialize HTTP responses",
        "The transaction holds a pooled connection and row locks for the whole call — external latency multiplies lock time and drains the pool under load",
        "Postgres forbids network access during transactions",
        "It forces the isolation level to SERIALIZABLE",
      ],
      answerIndex: 1,
      explain:
        "A transaction owns one connection until commit/rollback, and its locks block other writers. Adding seconds of external latency inside it means seconds of held locks per request — Prisma's 5s default timeout exists precisely to catch this pattern.",
    },
    {
      question:
        "You run concurrent transfers under isolationLevel Serializable. What must your application handle?",
      options: [
        "Nothing extra — SERIALIZABLE makes conflicts impossible",
        "Serialization failures (Postgres error 40001) by catching and retrying the whole transaction",
        "Manual SAVEPOINTs after every statement",
        "Switching the pool to a single connection",
      ],
      answerIndex: 1,
      explain:
        "SERIALIZABLE achieves correctness by aborting transactions whose interleaving can't be serialized — error 40001. Neither Prisma nor Drizzle retries for you; the caller catches the failure and re-runs the transaction, so the callback must be safe to re-execute.",
    },
  ],
};

export default lesson;
