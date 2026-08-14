import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "pooling-and-serverless",
  title: "Connection Pooling and Serverless Postgres",
  part: "Transactions & Performance",
  estMinutes: 13,
  summary:
    "PHP-FPM gave you a process-per-request world; Node gives you one long-lived process holding a pg Pool — and serverless multiplies processes until Postgres runs out of connections unless a pooler sits in between.",

  concept: `
Connection management is where the runtime model you're leaving actually matters.
Under PHP-FPM, each worker process held at most one database connection —
\`PDO::ATTR_PERSISTENT\` kept it alive between requests, and your effective pool size
*was* your FPM worker count. Nobody wrote pooling code because the process model was
the pool.

### Node inverts the model

A Node server is **one long-running process serving many concurrent requests**. It
holds a \`pg\` \`Pool\`: a set of open connections that concurrent queries check out and
return. Two rules follow:

- Create the pool **once**, at module scope, and share it — a pool (or
  \`PrismaClient\`) per request is the classic mistake, leaking connections until
  Postgres refuses new ones.
- Size it deliberately. Total connections = pool \`max\` × number of app instances,
  and that product must stay under Postgres's \`max_connections\` (default 100) with
  headroom for migrations, psql, and monitoring.

Both ORMs sit on exactly this. In Prisma 7 the Rust engine is gone and pooling
belongs to the JS driver adapter — \`new PrismaPg({ connectionString, max: 10 })\`
wraps a \`pg\` pool (v7 defaults: \`max\` 10, \`idleTimeoutMillis\` 10s,
\`connectionTimeoutMillis\` 0). In Drizzle you own the pool outright and hand it over:
\`drizzle({ client: pool })\`. Same knobs; the difference is who constructs the pool.

### Serverless breaks it again

Serverless functions resurrect the PHP-FPM shape — many short-lived instances — but
without FPM's fixed worker cap. Traffic spikes spin up hundreds of concurrent
function instances, each holding its own "small" pool, and \`100 instances × max 5\`
sails past \`max_connections\` into connection-refused errors.

The fix is an **external pooler** between the app and Postgres — PgBouncer
self-hosted, or the pooled endpoints Neon and Supabase expose (a separate connection
string; you often keep the direct string alongside for migrations). Poolers usually
run in **transaction mode**: your client "connection" borrows a real server
connection only for the duration of each transaction. That multiplexing is the whole
win, and also the constraint — anything relying on **session state** breaks, because
the next transaction may run on a different server connection: \`SET\` settings,
session advisory locks, \`LISTEN/NOTIFY\`, temp tables, and named prepared statements
prepared in one transaction and executed in another.

### The HTTP-driver end of the spectrum

Neon also offers a serverless driver that speaks HTTP/WebSockets instead of the
Postgres wire protocol — suited to edge runtimes where TCP sockets aren't available.
Drizzle plugs into it via \`drizzle-orm/neon-http\`, and Prisma covers the same ground
through its adapter family (e.g. \`@prisma/adapter-neon\`). Conceptually: per-query
HTTP round trips, no connection to hold at all — great for edge functions, not a
replacement for a pooled TCP connection on a long-running server.

### The interview framing

You can explain this better than most, because you have lived both models: FPM's
process-per-request (implicit pooling), Node's shared in-process pool (explicit
sizing), and serverless (external pooling required). The arithmetic —
\`instances × pool max\` vs \`max_connections\` — plus knowing *why* transaction-mode
pooling forbids session state is a senior-level answer.
`,

  comparisons: [
    {
      label: "Persistent PDO vs a shared Pool module",
      intro:
        "Keeping connections warm across requests. In PHP the process model did it; in Node you build one pool at module scope and import it everywhere.",
      php: `<?php
// Each FPM worker holds ONE connection, reused
// across the requests that worker serves.
$pdo = new PDO(
    'pgsql:host=db;dbname=app',
    $user,
    $pass,
    [PDO::ATTR_PERSISTENT => true]
);
// Effective "pool size" = FPM worker count (pm.max_children)`,
      ts: `// src/db.ts — constructed ONCE, imported everywhere
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                    // pool size
  idleTimeoutMillis: 10_000,  // close idle connections
});

export const db = drizzle({ client: pool, schema });
// Anti-pattern: new Pool() inside a request handler —
// connections leak until Postgres hits max_connections`,
      note:
        "Same goal, inverted ownership: FPM's worker count was your implicit pool cap, while Node makes the cap an explicit max on one shared Pool — and total usage is max times the number of app instances.",
    },
    {
      label: "Prisma 7: the adapter owns the pool",
      intro:
        "Prisma 7 requires a driver adapter — PrismaPg wraps a pg pool, so pool tuning happens in the adapter constructor rather than URL parameters.",
      php: `# Prisma 6 and earlier: pool tuning via URL params
# consumed by the Rust query engine
DATABASE_URL="postgresql://app:secret@db:5432/app?connection_limit=10&pool_timeout=10"`,
      ts: `// src/client.ts — Prisma 7
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 10,                       // pg pool size (v7 default: 10)
  connectionTimeoutMillis: 5_000, // v7 default: 0 (no timeout)
  idleTimeoutMillis: 10_000,      // v7 default: 10s
});

export const prisma = new PrismaClient({ adapter });
// No adapter? PrismaClient throws at construction —
// the TS query compiler needs a JS driver`,
      note:
        "The Rust engine's connection_limit/pool_timeout URL parameters are gone in v7 — pooling is the pg driver's job, configured on PrismaPg, with different defaults (no acquire timeout) than v6 had.",
      leftLang: "bash",
    },
    {
      label: "Direct vs pooled connection string",
      intro:
        "Managed Postgres providers hand you two connection strings: direct to the database, and through a transaction-mode pooler. Apps use the pooler; migrations use the direct one.",
      php: `# Direct: one real Postgres connection per client.
# Fine for a single long-running server or for
# migrations, which need session state.
DATABASE_URL="postgresql://app:secret@db.example.com:5432/app"`,
      ts: `# Pooled endpoint (PgBouncer-style, transaction mode):
# thousands of client connections multiplexed onto
# a few dozen real ones. Use from serverless functions.
DATABASE_URL="postgresql://app:secret@db-pooler.example.com:6432/app"

# Keep the direct URL for drizzle-kit migrate /
# prisma migrate — DDL and advisory locks want a
# real session, not a borrowed one.
DIRECT_URL="postgresql://app:secret@db.example.com:5432/app"`,
      note:
        "Transaction-mode pooling lends a server connection per transaction, so session state (SET, LISTEN/NOTIFY, temp tables, named prepared statements across transactions) breaks — which is why migration tools get the direct string.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A pool in miniature: 2 connections, 4 concurrent requests. Predict the acquire/release order — who waits, and which connection each waiter inherits — then run it. This queueing is exactly what pg's Pool (and therefore PrismaPg and Drizzle) does under load.",
    code: `// A pg.Pool in ~25 lines: fixed connections, FIFO waiters.

class MiniPool {
  private free: string[];
  private waiters: { name: string; resolve: (conn: string) => void }[] = [];

  constructor(size: number) {
    this.free = [];
    for (let i = size; i >= 1; i--) this.free.push("conn-" + i);
  }

  acquire(name: string): Promise<string> {
    const conn = this.free.pop();
    if (conn) {
      console.log(name + " acquired " + conn);
      return Promise.resolve(conn);
    }
    console.log(name + " WAITING (pool exhausted, queued)");
    return new Promise((resolve) => this.waiters.push({ name, resolve }));
  }

  release(conn: string, name: string) {
    const next = this.waiters.shift();
    if (next) {
      console.log(name + " released " + conn + " -> handed to " + next.name);
      next.resolve(conn);
    } else {
      console.log(name + " released " + conn + " -> idle");
      this.free.push(conn);
    }
  }
}

const pool = new MiniPool(2); // like new Pool({ max: 2 })

const a = await pool.acquire("req-A");
const b = await pool.acquire("req-B");

// Pool exhausted: C and D queue instead of opening connection #3.
const cPending = pool.acquire("req-C");
const dPending = pool.acquire("req-D");

pool.release(a, "req-A"); // goes to C, not back to the pool
pool.release(b, "req-B"); // goes to D

const c = await cPending;
const d = await dPending;
pool.release(c, "req-C");
pool.release(d, "req-D");

// Serverless punchline: every function instance has its OWN
// MiniPool. 100 instances x max 2 = 200 real connections —
// past Postgres's default max_connections of 100.`,
  },

  keyPoints: [
    "PHP-FPM's process-per-request model made the worker count your implicit connection pool; a Node process instead holds one explicit shared `pg` Pool that concurrent requests check connections out of.",
    "Construct the pool (or PrismaClient) once at module scope — per-request construction leaks connections; budget `pool max × app instances` under Postgres's `max_connections` (default 100).",
    "Prisma 7 pools via the driver adapter: `new PrismaPg({ connectionString, max, ... })` wraps a pg pool (defaults: max 10, idle timeout 10s, no acquire timeout) — the old connection_limit URL params are gone.",
    "Drizzle never hides the pool: you build `new Pool(...)` yourself and pass it as `drizzle({ client: pool })` — tuning is plain node-postgres configuration.",
    "Serverless multiplies instances (each with its own pool), so put a transaction-mode pooler in between — PgBouncer or a provider's pooled endpoint — and keep the direct URL for migrations.",
    "Transaction-mode pooling lends a server connection per transaction, so session state breaks: SET, LISTEN/NOTIFY, temp tables, session advisory locks, and prepared statements reused across transactions.",
  ],

  interview: [
    {
      q: "Why does connection pooling matter more in Node than it did in your PHP career?",
      a: "Because the process models are opposites. Under PHP-FPM every request got a worker process with at most one connection — persistent PDO reused it, and pm.max_children was effectively my pool cap, enforced by the runtime. Node is one long-lived process handling many requests concurrently, so it must hold multiple connections and arbitrate them — that's the pg Pool, and now the sizing is my job: max per pool, times the number of instances, kept under Postgres's max_connections. The failure modes changed too: in PHP the risk was too many workers; in Node it's constructing a pool or client per request and leaking connections, or Promise.all fan-out exhausting the pool and queueing behind the acquire timeout.",
    },
    {
      q: "What breaks under transaction-mode pooling with PgBouncer, and why?",
      a: "Anything that assumes the next statement runs on the same server connection. Transaction mode is what makes a pooler effective — a client borrows a real connection only for each transaction — but it means session state doesn't survive: SET/SET SESSION settings, session-level advisory locks, LISTEN/NOTIFY, temporary tables, and named prepared statements prepared in one transaction and executed in another, since the second may land on a different backend. That's why providers give you two connection strings and why migration tools get the direct one — schema migrations lean on session behaviour like advisory locks. Inside a single transaction you're fine, which is why ORM interactive transactions still work through a pooler.",
    },
    {
      q: "How do Prisma 7 and Drizzle each relate to the underlying pg pool?",
      a: "They converge on the same primitive with different ownership. Prisma 7 dropped the Rust query engine, so pooling moved from engine URL parameters (connection_limit, pool_timeout) into the JS driver adapter: new PrismaPg({ connectionString, max, idleTimeoutMillis }) constructs and manages a pg pool internally, and PrismaClient requires that adapter. Drizzle is thinner: I build new Pool() myself and pass it in with drizzle({ client: pool }), so the pool is mine to share, tune, and instrument. Practical consequence of the v7 change worth knowing: adapter defaults differ from Prisma 6 — pg has no acquire timeout by default where v6 waited 10 seconds — so upgrade guides tell you to set the timeouts explicitly.",
    },
    {
      q: "Your serverless app intermittently fails with 'sorry, too many clients already'. Walk through your diagnosis.",
      a: "That's Postgres refusing connections past max_connections, and in serverless the arithmetic almost always explains it: a traffic spike scaled to N concurrent function instances, each instantiating its own client with its own pool, so total connections is N times pool max — with default max_connections at 100, even modest spikes blow through it. I'd confirm with pg_stat_activity during an incident, then fix structurally: point functions at a transaction-mode pooled endpoint (PgBouncer, or the provider's pooler) so thousands of client connections multiplex onto a few dozen real ones, set each function's pool max low (even 1), and keep a direct URL only for migrations. On edge runtimes I'd consider an HTTP driver like Neon's, which holds no connection at all.",
    },
  ],

  quiz: [
    {
      question:
        "A serverless deployment scales to 80 concurrent instances, each with a pg Pool of max 3. Postgres has max_connections = 100. What happens under load?",
      options: [
        "Nothing — each pool only uses connections it needs",
        "Up to 240 connection attempts against a 100-connection limit: new connections are refused ('too many clients already')",
        "Postgres automatically raises max_connections",
        "The pools coordinate with each other to stay under 100",
      ],
      answerIndex: 1,
      explain:
        "Pools in separate instances know nothing about each other, so the budget is instances × max = 240 potential connections. Past max_connections, Postgres refuses logins. The structural fix is a transaction-mode pooler between the functions and the database.",
    },
    {
      question: "Which of these works correctly through a transaction-mode pooler?",
      options: [
        "LISTEN/NOTIFY subscriptions",
        "A named prepared statement prepared in one transaction, executed in a later one",
        "A multi-statement transaction (BEGIN ... COMMIT) run as one unit",
        "SET statements expected to persist across transactions",
      ],
      answerIndex: 2,
      explain:
        "Transaction mode lends a real server connection for the duration of each transaction, so anything inside one BEGIN...COMMIT stays on one backend and works. Session state across transactions — LISTEN, persistent SETs, named prepared statements reused later — can land on a different backend and breaks.",
    },
    {
      question: "In Prisma 7, where does connection pool configuration live?",
      options: [
        "URL parameters like ?connection_limit=10 on the datasource URL",
        "In schema.prisma under the generator block",
        "On the driver adapter, e.g. new PrismaPg({ connectionString, max: 10 })",
        "Prisma 7 does not pool; every query opens a fresh connection",
      ],
      answerIndex: 2,
      explain:
        "With the Rust engine removed, the JS driver adapter owns pooling: PrismaPg wraps a pg pool configured via max, connectionTimeoutMillis, idleTimeoutMillis, and maxLifetimeSeconds. The connection_limit/pool_timeout URL parameters were the v6 engine's mechanism and are gone.",
    },
    {
      question:
        "Why do providers like Neon and Supabase give you both a pooled and a direct connection string?",
      options: [
        "The direct string is faster and should be preferred everywhere",
        "Apps (especially serverless) go through the transaction-mode pooler, while migrations need a direct session for DDL and session-level behaviour like advisory locks",
        "The pooled string is read-only",
        "Only the direct string supports SSL",
      ],
      answerIndex: 1,
      explain:
        "The pooler multiplexes many client connections onto few real ones — ideal for scale-out app traffic — but it sacrifices session state. Migration tools rely on exactly that state (locks, multi-statement session behaviour), so drizzle-kit migrate and prisma migrate point at the direct URL.",
    },
  ],
};

export default lesson;
