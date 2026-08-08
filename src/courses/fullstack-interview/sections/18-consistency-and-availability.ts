import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "consistency-and-availability",
  title: "Consistency and Availability in Practice",
  part: "System Design Fundamentals",
  estMinutes: 12,
  summary:
    "CAP for practitioners: the real consistency problem is replication lag, the guarantee users actually notice is read-your-own-writes, and the senior move is naming — feature by feature — where consistency can relax and where it cannot.",

  concept: `
CAP is often recited as a party trick — "consistency, availability, partition
tolerance, pick two." That framing loses interviews. Partitions are not
optional (networks fail), so the real choice during a partition is between
**consistency** and **availability**, and — more usefully — the everyday
version of this problem isn't partitions at all. It's **replication lag**.

### The problem you actually have: replication lag

Almost every system scales reads by adding **replicas**: writes go to the
**primary**, which streams changes to one or more **read replicas** that serve
reads. Replicas are **asynchronously** a little behind — milliseconds usually,
seconds under load. So a read that hits a replica can miss a write that already
committed on the primary. That's not a theoretical CAP edge case; it's Tuesday.

### The guarantee users notice: read-your-own-writes

Users don't perceive "eventual consistency" in the abstract. They perceive
**"I posted a comment and it's not there."** **Read-your-own-writes** is the
guarantee that a user always sees their *own* recent changes, even if the rest
of the world sees them a beat later. The standard fix is cheap: after a user
writes, **pin that user's reads to the primary for a short window** (a few
seconds), long enough for replication to catch up. Everyone else keeps reading
replicas. You spend a little primary load to erase the most jarring bug.

### Eventual consistency: fine for feeds, never for balances

The senior skill isn't picking one consistency level for the whole system — it's
building a **per-feature consistency budget**: naming, feature by feature, what
can relax and what cannot.

- **Fine eventually consistent** — a like count, a follower feed, a "recently
  viewed" list, search results. A few seconds stale harms nobody.
- **Never eventually consistent** — an **account balance**, inventory you're
  selling, a payment, a uniqueness constraint (one username). Read these from
  the primary or behind a transaction; showing a stale balance is a bug that
  loses money or trust.

Saying "reads of the feed can be eventually consistent off replicas, but the
wallet balance reads from the primary" is worth more than any CAP recitation.

### Quorum intuition, in one paragraph

When data is replicated across N nodes, you can tune consistency with quorums:
require **W** nodes to acknowledge a write and **R** nodes to serve a read. If
**W + R > N**, the read set and write set always overlap by at least one node,
so a read is guaranteed to see the latest acknowledged write — strong
consistency at the cost of latency and availability. If **W + R ≤ N** you get
faster, more available reads that may be stale. It's a dial, not a switch.

### Idempotency: the partner of every retry

The moment you accept that networks fail, you accept **retries** — and a retry
can duplicate a request whose response was merely lost. So every operation you
retry must be **idempotent**: safe to apply more than once. A client-supplied
**idempotency key** lets the server recognise a retry and return the original
result instead of charging the card twice. Consistency and retries are the same
conversation: don't discuss one without the other.
`,

  comparisons: [
    {
      label: "\"Strong consistency everywhere\" vs a per-feature budget",
      intro:
        "How a candidate scopes consistency for a social app. The weak answer demands one global guarantee; the strong answer assigns a consistency level per feature.",
      php: `// Weak: one global demand
//
// "We need strong consistency everywhere. Every read
//  must reflect every write immediately, so all reads
//  go to the primary and we wrap things in serializable
//  transactions to be safe."
//
// Consequence: the primary is now the bottleneck for the
// entire product, replicas sit idle, read latency and
// cost balloon — and 95% of those reads (feeds, counts)
// never needed strong consistency at all.`,
      ts: `// Strong: a per-feature consistency budget
//
// "Feature by feature:
//   - home feed / like counts: eventually consistent,
//     read from replicas. Seconds stale is fine.
//   - a user's own new post/comment: read-your-writes —
//     pin them to the primary for a few seconds post-write.
//   - wallet balance, checkout inventory, payments:
//     strong — read from the primary, inside a transaction.
//   - username uniqueness: a DB constraint, non-negotiable.
//
//  So replicas absorb the bulk of reads, and the primary
//  is reserved for the handful of things that truly need it."`,
      note:
        "Naming where consistency relaxes and where it can't — per feature — is the senior move. 'Strong everywhere' throws away replicas and makes the primary the whole system's bottleneck.",
    },
    {
      label: "Read-replica-everything vs read-your-writes routing",
      intro:
        "The flow when a user posts a comment, then the page reloads and reads it back. The weak routing always reads a replica (which lags); the strong routing pins the just-wrote user to the primary briefly.",
      php: `# Weak: every read goes to a replica
flow:
  - user POSTs comment       -> primary (write commits)
  - page reloads, GET thread -> replica (spreads load)
  - replica is 300ms behind the primary
  - result: the user's OWN comment is MISSING from the
    list they just posted to
  - user: "did it save?" -> posts again -> duplicate`,
      ts: `# Strong: read-your-writes routing
flow:
  - user POSTs comment       -> primary (write commits)
  - server marks: userId "wrote recently" (TTL ~5s)
  - page reloads, GET thread:
      if user wrote recently -> read PRIMARY
      else                   -> read replica
  - result: the author sees their comment instantly;
    everyone else reads cheap replicas
  - after ~5s the pin expires; replica has caught up`,
      note:
        "Read-your-writes pins only the writer to the primary, and only briefly. It fixes the one staleness bug users actually notice without giving up replica scaling for everyone else.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "Blind retry vs idempotent retry",
      intro:
        "A payment request times out — did it go through? The weak client retries blindly and risks a double charge; the strong client sends an idempotency key so the retry is safe.",
      php: `// Weak: retry with no idempotency
async function charge(amount: number) {
  // First call actually SUCCEEDED on the server, but the
  // response was lost to a timeout. The client can't tell,
  // so it retries...
  const res = await post("/charge", { amount });
  return res; // ...and the customer is charged twice.
}`,
      ts: `// Strong: client-supplied idempotency key
async function charge(amount: number, key: string) {
  // The same key on the retry lets the server recognise
  // a duplicate and return the ORIGINAL result instead
  // of charging again.
  const res = await post("/charge", { amount }, {
    headers: { "Idempotency-Key": key },
  });
  return res; // retry is safe; at most one charge.
}`,
      note:
        "Retries are unavoidable once you accept network failure, so every retried operation needs to be idempotent — an idempotency key turns 'maybe charged twice' into 'charged exactly once'.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A primary with a replica that lags behind it. The user updates their name, then immediately reads it back. Predict what naive replica routing shows versus read-your-writes routing, then run it.",
    code: `// A primary and a replica that lags. A user writes, then
// immediately reads. Naive routing reads the (stale) replica;
// read-your-writes pins the just-wrote user to the primary.

class Store {
  private data = new Map<string, string>();
  set(key: string, value: string): void { this.data.set(key, value); }
  get(key: string): string { return this.data.get(key) ?? "<empty>"; }
}

const primary = new Store();
const replica = new Store();
const replicationLag: Array<{ key: string; value: string }> = [];

function write(key: string, value: string): void {
  primary.set(key, value);
  replicationLag.push({ key, value }); // replica catches up "later"
}
function replicaCatchUp(): void {
  for (const { key, value } of replicationLag) replica.set(key, value);
  replicationLag.length = 0;
}

// The user updates their display name, then the page reloads.
write("name:me", "Ada Lovelace");

// Naive: read a replica to spread load - but it hasn't caught up.
console.log("naive read-replica routing:");
console.log(\`  user sees: "\${replica.get("name:me")}"  <- their own edit is missing!\`);

// Read-your-writes: for a short window after a write, route THIS
// user to the primary so they always see their own change.
const wroteRecently = new Set<string>(["me"]);
function readName(user: string): string {
  return wroteRecently.has(user)
    ? primary.get(\`name:\${user}\`)
    : replica.get(\`name:\${user}\`);
}
console.log("read-your-writes routing:");
console.log(\`  user sees: "\${readName("me")}"  <- their own edit, from the primary\`);

// Replication catches up; the replica is safe for everyone again.
replicaCatchUp();
wroteRecently.delete("me");
console.log("after replication catches up:");
console.log(\`  replica now has: "\${replica.get("name:me")}"\`);`,
  },

  keyPoints: [
    "The everyday consistency problem is replication lag, not CAP partitions: writes hit the primary, async replicas serve reads a little behind, so a replica read can miss a just-committed write.",
    "Read-your-own-writes is the guarantee users actually notice ('my comment isn't there'); fix it by pinning a user's reads to the primary for a few seconds after they write.",
    "Eventual consistency is fine for feeds, counts, and search but never for balances, inventory, payments, or uniqueness — read those from the primary or inside a transaction.",
    "The senior skill is a per-feature consistency budget: name, feature by feature, what may relax and what must be strong, rather than demanding one global level.",
    "Quorum is a dial: with W + R > N the write and read sets overlap, guaranteeing you read the latest write, at the cost of latency and availability; W + R ≤ N is faster but can be stale.",
    "Once you accept retries (networks fail), every retried operation must be idempotent — an idempotency key lets the server dedupe a retry instead of charging or posting twice.",
  ],

  interview: [
    {
      q: "Design a system where users post comments. How do you keep reads fast without users losing their own comments?",
      a: "I'd scale reads with replicas — writes go to the primary, replicas serve the bulk of reads — but replicas lag the primary by milliseconds to seconds, so a naive setup shows a user a thread that's missing the comment they just posted. That's the read-your-own-writes bug, and it's the one staleness users actually notice. The fix is cheap: after a user writes, I pin that user's reads to the primary for a few seconds, long enough for replication to catch up, while everyone else keeps reading replicas. So the author sees their comment instantly, the system keeps replica scaling for the 99% of reads that don't need it, and I've spent only a little extra primary load to erase the jarring case. Other people seeing the comment a second late is fine — that part can be eventually consistent.",
    },
    {
      q: "Where in a design can you accept eventual consistency, and where can't you?",
      a: "I decide it per feature, not globally. Eventual consistency is fine anywhere a few seconds of staleness is harmless: home feeds, like and follower counts, 'recently viewed', search indexes — read those off replicas and let them lag. It's unacceptable anywhere staleness costs money or trust: account balances, inventory you're actively selling, payments, and uniqueness constraints like a username. Those read from the primary, inside a transaction where needed, and uniqueness is a database constraint rather than an application check. Framing it as a consistency budget — this feature can relax, this one can't, and here's why — is the useful answer; demanding strong consistency everywhere just makes the primary the whole system's bottleneck and wastes the replicas.",
    },
    {
      q: "Explain CAP the way you'd actually use it, not the textbook version.",
      a: "The textbook 'pick two of three' is misleading because partition tolerance isn't optional — networks drop packets, so P is a given. The real decision during a partition is whether to stay available and risk serving stale or conflicting data, or to refuse requests to stay consistent. But most days there's no partition; the practical version of the same tension is replication lag, where reads off async replicas can be behind the primary. So in a design I don't recite CAP — I say which features tolerate lag and read replicas, which need the primary, and how I'd handle a real partition for the strict ones, usually by favouring consistency for money-related data and availability for feeds. And because retries are inevitable when the network is flaky, I make retried writes idempotent so a duplicated request doesn't double-apply.",
    },
  ],

  quiz: [
    {
      question:
        "In most real systems, what is the everyday form of the consistency problem?",
      options: [
        "Network partitions splitting the cluster in half",
        "Replication lag — async read replicas being slightly behind the primary",
        "Clock skew between servers",
        "Deadlocks in the primary database",
      ],
      answerIndex: 1,
      explain:
        "Partitions are the dramatic CAP case, but day to day the issue is that replicas serving reads lag the primary by milliseconds to seconds, so a replica read can miss a just-committed write. That's what read-your-writes routing addresses.",
    },
    {
      question:
        "What is the standard fix for the read-your-own-writes problem?",
      options: [
        "Make all replicas synchronous so they never lag",
        "Route every read to the primary permanently",
        "Pin a user's reads to the primary for a short window after they write",
        "Cache the write in the browser and never re-read it",
      ],
      answerIndex: 2,
      explain:
        "You only need the writer to see their own change immediately. Pinning just that user to the primary for a few seconds (until replication catches up) fixes the visible bug while everyone else keeps reading cheap replicas.",
    },
    {
      question:
        "With data replicated across N nodes, which condition guarantees a read sees the latest acknowledged write?",
      options: [
        "R = 1 (read from any single node)",
        "W + R > N (write and read quorums overlap)",
        "W = 1 and R = 1 (fastest possible)",
        "N is an odd number",
      ],
      answerIndex: 1,
      explain:
        "If the number of nodes that must ack a write plus the number that serve a read exceeds N, the two sets must overlap by at least one node, so a read always includes a node holding the latest write — at the cost of latency and availability.",
    },
  ],
};

export default lesson;
