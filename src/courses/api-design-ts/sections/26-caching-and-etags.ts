import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "caching-and-etags",
  title: "Caching & ETags",
  part: "Operating in Production",
  estMinutes: 12,
  summary:
    "HTTP caching is API design: Cache-Control tells clients what they may reuse, ETags plus If-None-Match turn repeat polls into cheap 304s, and If-Match turns the lost-update problem into an explicit 412 instead of silent last-write-wins.",

  concept: `
Every PHP CRUD app you have shipped answered the same question the same way: the client asks,
the script queries, \`json_encode\` runs, the full payload goes over the wire — even when nothing
changed since the last poll two seconds ago. HTTP has had the fix built in since the nineties.
Caching is not an ops afterthought bolted on by a CDN team; the headers your handlers emit
**are part of your API's contract**, and interviewers treat them that way.

### Cache-Control: the four directives that matter for APIs

\`\`\`text
Cache-Control: private, max-age=60
Cache-Control: no-store
Cache-Control: no-cache
Cache-Control: private, max-age=0, must-revalidate
\`\`\`

- **\`private\`** — only the end client (browser, mobile app) may store this; shared caches
  (CDNs, proxies) must not. Anything personalised — "my orders", "my profile" — needs this,
  or a proxy can serve *your* account page to the next user.
- **\`max-age=60\`** — the response is *fresh* for 60 seconds; within that window the client
  can reuse it without asking you at all. Zero requests beat cheap requests.
- **\`no-store\`** — never write this to disk anywhere. Reserve it for genuinely sensitive
  bodies: tokens, banking data, PII exports.
- **\`no-cache\`** — the most misread directive in HTTP. It does **not** mean "don't cache".
  It means "you may store this, but **revalidate with the server before every reuse**".
  Paired with ETags, \`no-cache\` gives you always-current data at 304 prices.
  \`must-revalidate\` is the softer cousin: reuse freely while fresh, but once stale you must
  revalidate — no serving stale data when the origin is unreachable.

If a response varies by a request header — compression, language, or an \`Authorization\`
header — say so with **\`Vary\`** (e.g. \`Vary: Accept-Encoding, Accept-Language\`), so a shared
cache keys its entries correctly instead of handing user A's representation to user B.

### ETags: a fingerprint of the representation

An **ETag** is an opaque validator for the current representation of a resource — in practice,
a hash of the bytes you would send (or of \`updatedAt\` + id, if hashing is too dear):

\`\`\`text
HTTP/1.1 200 OK
ETag: "a3f5c982"
Cache-Control: private, no-cache
\`\`\`

The client stores body + ETag together. On the next poll it sends the ETag back:

\`\`\`text
GET /api/orders/42
If-None-Match: "a3f5c982"

HTTP/1.1 304 Not Modified
ETag: "a3f5c982"
\`\`\`

**304 has no body.** If the fingerprint still matches, you send a few header bytes instead of
kilobytes of JSON — and you can often skip serialisation entirely. For a mobile client polling
every 30 seconds, that is most of your egress bill. A \`W/"..."\` prefix marks a *weak* ETag —
"semantically equivalent, maybe not byte-identical" — fine for GET revalidation.

### If-Match: the lost-update fix you always needed

Here is the bug you have hit in every PHP admin panel: Alice and Bob both open the same
record, both edit, both save. Whoever saves second silently erases the other's work —
**last-write-wins**, and nobody is told. HTTP solves this with the same ETag machinery run
in reverse. The client sends the ETag of the version it *edited* on the write:

\`\`\`text
PUT /api/orders/42
If-Match: "a3f5c982"
\`\`\`

The server compares against the *current* ETag. Match → apply the write. Mismatch → someone
else got there first → **412 Precondition Failed**, and the client re-fetches, merges, and
retries. This is **optimistic concurrency**: no row locks, no \`SELECT ... FOR UPDATE\` held
across a user's lunch break — just a cheap compare at write time. To make it mandatory,
reject unconditional writes with **428 Precondition Required**. That one status code — 412 —
is the difference between "we occasionally lose edits" and a defensible design.
`,

  comparisons: [
    {
      label: "Polling an order: re-send everything vs revalidate",
      intro:
        "A dashboard polls GET /api/orders/42 every 30 seconds. The PHP script rebuilds and re-sends the full payload every time; the TS handler fingerprints the representation and answers unchanged polls with an empty 304.",
      php: `<?php // order.php — every poll pays full price
$id = (int) $_GET['id'];
$stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
$stmt->execute([$id]);
$order = $stmt->fetch(PDO::FETCH_ASSOC);

// No Cache-Control, no ETag: the default is "who knows".
// 2 KB of JSON re-serialised and re-sent every 30 s,
// even when the row has not changed in a week.
header('Content-Type: application/json');
echo json_encode($order);`,
      ts: `// routes/orders.ts
import { createHash } from "node:crypto";

app.get("/api/orders/:id", async (req, res) => {
  const order = await orders.find(Number(req.params.id));
  if (!order) return res.status(404).end();

  const body = JSON.stringify(order);
  const etag = '"' + createHash("sha1").update(body).digest("hex") + '"';

  res.set("ETag", etag);
  res.set("Cache-Control", "private, no-cache"); // store, but revalidate

  if (req.get("If-None-Match") === etag) {
    return res.status(304).end(); // headers only — no body
  }
  res.type("application/json").send(body);
});`,
      note:
        "no-cache means the client must revalidate before reuse — combined with the ETag check, unchanged polls cost a 304 with zero body instead of the full payload.",
    },
    {
      label: "The lost update: last-write-wins vs If-Match / 412",
      intro:
        "Alice and Bob both fetched version \"v1\" of order 42 and both save an edit. Left: without preconditions, Bob's save silently vanishes. Right: the second writer's stale ETag is rejected with 412 and they re-fetch and merge.",
      php: `# Without preconditions — last write wins, silently
GET /api/orders/42          # Alice fetches
HTTP/1.1 200 OK
{"id":42,"note":"","status":"pending"}

GET /api/orders/42          # Bob fetches the same version
HTTP/1.1 200 OK
{"id":42,"note":"","status":"pending"}

PUT /api/orders/42          # Bob saves his edit
{"note":"call before delivery","status":"pending"}
HTTP/1.1 200 OK

PUT /api/orders/42          # Alice saves — and erases Bob's note
{"note":"","status":"paid"}
HTTP/1.1 200 OK             # nobody is told anything was lost`,
      ts: `# With If-Match — the stale writer is told, loudly
GET /api/orders/42
HTTP/1.1 200 OK
ETag: "v1"

PUT /api/orders/42          # Bob saves first, citing his version
If-Match: "v1"
HTTP/1.1 200 OK
ETag: "v2"                  # resource moved on

PUT /api/orders/42          # Alice's If-Match is now stale
If-Match: "v1"
HTTP/1.1 412 Precondition Failed
Content-Type: application/problem+json
{"title":"Resource has changed since you fetched it"}

GET /api/orders/42          # Alice re-fetches "v2", merges, retries
If-Match: "v2"  ->  200 OK  # clean save, nothing lost`,
      note:
        "Same ETag machinery, opposite direction: If-None-Match saves bandwidth on reads, If-Match prevents lost updates on writes. Return 428 Precondition Required if you want to force every writer to send If-Match.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Per-user responses and shared caches",
      intro:
        "GET /api/me returns the logged-in user's profile. One version leaves caching policy to chance behind a CDN; the other states it explicitly.",
      php: `<?php // me.php — personalised body, no cache policy
session_start();
$user = load_user($_SESSION['uid']);

header('Content-Type: application/json');
// Nothing tells the CDN this is per-user. A cache
// configured to be "helpful" can store this response
// and serve YOUR profile to the next visitor.
echo json_encode([
  'email' => $user['email'],
  'plan'  => $user['plan'],
]);`,
      ts: `// routes/me.ts
app.get("/api/me", requireAuth, (req, res) => {
  // private: browsers may cache, shared caches must not.
  // Vary tells any cache the response depends on the
  // Authorization header, not just the URL.
  res.set("Cache-Control", "private, max-age=30");
  res.set("Vary", "Authorization");

  res.json({
    email: req.user.email,
    plan: req.user.plan,
  });
});`,
      note:
        "Anything derived from the session or the Authorization header needs Cache-Control: private (or no-store for the truly sensitive) plus a Vary header — 'the CDN served someone else's account page' is a real incident class.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A GET/PUT pair with the full conditional-request lifecycle simulated in memory. Predict the five logged statuses: a first GET, a conditional re-GET, Bob's PUT, Alice's stale PUT, and Alice's retry — then run it.",
    code: `// ETag revalidation + optimistic concurrency, end to end.
// etagFor() stands in for createHash("sha1") — same idea, tiny hash.

interface Article {
  id: number;
  title: string;
  body: string;
}

function etagFor(resource: unknown): string {
  const json = JSON.stringify(resource);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash * 33) ^ json.charCodeAt(i)) >>> 0;
  }
  return '"' + hash.toString(16) + '"';
}

let stored: Article = { id: 7, title: "Caching", body: "first draft" };

function handleGet(ifNoneMatch?: string): {
  status: number;
  etag: string;
  body?: Article;
} {
  const etag = etagFor(stored);
  if (ifNoneMatch === etag) return { status: 304, etag }; // no body
  return { status: 200, etag, body: { ...stored } };
}

function handlePut(
  update: Partial<Article>,
  ifMatch?: string
): { status: number; etag?: string; problem?: string } {
  if (!ifMatch) {
    return { status: 428, problem: "If-Match header required" };
  }
  if (ifMatch !== etagFor(stored)) {
    return { status: 412, problem: "resource changed since you fetched it" };
  }
  stored = { ...stored, ...update };
  return { status: 200, etag: etagFor(stored) };
}

// 1. First GET: full body plus fingerprint.
const first = handleGet();
console.log("GET          ->", first.status, "ETag", first.etag);

// 2. Poll again, citing the ETag: nothing changed, so no body moves.
const poll = handleGet(first.etag);
console.log("GET (cond)   ->", poll.status, poll.body ? "body sent" : "no body - cache is fresh");

// Alice and Bob both hold the version they fetched in step 1.
const aliceEtag = first.etag;
const bobEtag = first.etag;

// 3. Bob writes first — his precondition still matches.
const bobPut = handlePut({ body: "Bob's edit" }, bobEtag);
console.log("PUT (Bob)    ->", bobPut.status, "new ETag", bobPut.etag);

// 4. Alice writes with the now-stale ETag — rejected, not overwritten.
const alicePut = handlePut({ body: "Alice's edit" }, aliceEtag);
console.log("PUT (Alice)  ->", alicePut.status, alicePut.problem);

// 5. Alice re-fetches, merges, retries with the fresh fingerprint.
const refreshed = handleGet();
const retry = handlePut({ body: "Bob's edit + Alice's addition" }, refreshed.etag);
console.log("PUT (retry)  ->", retry.status, "new ETag", retry.etag);`,
  },

  keyPoints: [
    "Cache headers are part of the API contract: `private` for per-user data, `no-store` for secrets, `max-age` for freshness, `must-revalidate` to forbid serving stale.",
    "`no-cache` means 'store it, but revalidate before every reuse' — it does NOT mean 'don't cache'. Paired with ETags it gives always-fresh data at 304 prices.",
    "An ETag is an opaque fingerprint of the representation (hash the bytes, or hash `updatedAt` + id); `If-None-Match` + `304 Not Modified` sends headers instead of the payload.",
    "`If-Match` is optimistic concurrency: the client cites the version it edited, and a mismatch returns `412 Precondition Failed` instead of silently losing the other writer's work.",
    "Use `428 Precondition Required` to make conditional writes mandatory rather than optional.",
    "Any response that varies by a request header (Authorization, Accept-Language, Accept-Encoding) needs `Vary`, or a shared cache will mix users' representations.",
  ],

  interview: [
    {
      q: "What does Cache-Control: no-cache actually do, and when would you use it on an API response?",
      a: "It's the most misnamed directive in HTTP: `no-cache` permits storing the response but requires revalidation with the origin before every reuse — 'don't cache' is `no-store`. I use `no-cache` together with an ETag on resources that must always be current but rarely change: the client keeps the cached body, sends `If-None-Match` on each request, and I answer `304 Not Modified` with no body when the fingerprint still matches. The client gets guaranteed-fresh data, and I get to skip serialising and shipping the payload on the overwhelming majority of requests.",
    },
    {
      q: "How would you solve the lost-update problem in a REST API without database locks?",
      a: "Optimistic concurrency via conditional requests. Every GET returns an `ETag` for the current version; every PUT or PATCH must send `If-Match` with the ETag the client actually edited. If it matches the current version the write proceeds; if another writer got there first it fails with `412 Precondition Failed`, and the client re-fetches, merges, and retries. I'd return `428 Precondition Required` for writes that omit `If-Match`, making the protection mandatory. It's cheap — one string compare at write time, no locks held across user think-time — and it's the HTTP-native version of a version-number column in SQL, which is how I'd implement the ETag under the hood: hash the representation or derive it from `updatedAt`.",
    },
    {
      q: "Your API sits behind a CDN. What caching headers do you set on a personalised endpoint like /api/me, and why?",
      a: "At minimum `Cache-Control: private` so shared caches — the CDN, corporate proxies — never store it, with a short `max-age` if the client may reuse it briefly, or `no-store` if the body is genuinely sensitive. I'd also send `Vary: Authorization` so any cache that does handle it keys entries by credential rather than by URL alone. The failure mode this prevents is serious: a shared cache storing one user's profile under `/api/me` and serving it to the next user. That's a data-leak incident caused entirely by a missing response header, which is why I treat cache headers as part of the endpoint's contract, reviewed like the payload itself.",
    },
  ],

  quiz: [
    {
      question: "What does `Cache-Control: no-cache` instruct a cache to do?",
      options: [
        "Never store the response anywhere",
        "Store the response but revalidate with the origin before every reuse",
        "Store the response for 60 seconds by default",
        "Only cache the response on HTTPS connections",
      ],
      answerIndex: 1,
      explain:
        "no-cache allows storage but forbids reuse without revalidation — typically an If-None-Match request answered with 304 or a fresh 200. The directive that forbids storage entirely is no-store.",
    },
    {
      question:
        "A client PUTs an update with If-Match: \"abc\" but the resource's current ETag is \"def\". What should the server return?",
      options: [
        "409 Conflict, and apply the update anyway",
        "304 Not Modified",
        "412 Precondition Failed, without applying the update",
        "200 OK — If-Match is only advisory",
      ],
      answerIndex: 2,
      explain:
        "A failed If-Match precondition means another writer changed the resource since this client fetched it. The server must reject the write with 412 so the client can re-fetch, merge, and retry — that refusal is the whole point of optimistic concurrency.",
    },
    {
      question: "What is true of a 304 Not Modified response?",
      options: [
        "It carries the full body so the client can double-check it",
        "It has no body — the client reuses its cached representation",
        "It is only valid for HTML, not JSON APIs",
        "It signals the resource was deleted",
      ],
      answerIndex: 1,
      explain:
        "304 is headers-only by definition: it tells the client 'your stored copy is still the current representation'. That empty body is exactly where the bandwidth savings come from.",
    },
    {
      question: "Why does a per-user JSON response need `Cache-Control: private`?",
      options: [
        "It encrypts the response body in transit",
        "It stops shared caches (CDNs, proxies) from storing it and serving one user's data to another",
        "It disables browser caching completely",
        "It is required before an ETag header is allowed",
      ],
      answerIndex: 1,
      explain:
        "private restricts storage to the end client's own cache. Without it, a shared cache along the path may store the personalised body and hand it to the next requester of the same URL — a data leak caused by a missing header.",
    },
  ],
};

export default lesson;
