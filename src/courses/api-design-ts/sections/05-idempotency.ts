import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "idempotency",
  title: "Idempotency & Retries",
  part: "HTTP & Resource Design",
  estMinutes: 13,
  summary:
    "Networks fail mid-request, so clients retry — and the Idempotency-Key pattern is how you make even POST safe to retry without double-charging anyone.",

  concept: `
Here's the failure that motivates this whole section. A client POSTs a
payment. The server charges the card... and the response is lost — the
connection drops after the work happened. The client sees a timeout.
Now what? If it retries, it may charge twice. If it doesn't, the user may not
have paid. **The client fundamentally cannot know which**, because a timeout
gives no information about how far the request got. Retrying is not optional
in distributed systems — so the server must make retries safe.

### What idempotency buys you

An operation is idempotent when performing it N times leaves the server in
the same state as performing it once. For idempotent requests, the timeout
dilemma dissolves: just retry. GET, HEAD, OPTIONS, PUT, and DELETE carry that
guarantee by definition — \`PUT /orders/42\` with the same body can land five
times harmlessly, because the final state *is* the body.

POST promises nothing. \`POST /payments\` twice is two payments. And POST is
exactly where the stakes are highest: payments, order creation, sending
emails. So we engineer idempotency onto it.

### The Idempotency-Key pattern

Popularised by Stripe's API and now an IETF HTTPAPI working-group draft
(\`draft-ietf-httpapi-idempotency-key-header\`), the pattern:

1. **Client generates a unique key per logical operation** — a UUID, created
   when the user clicks "Pay", *reused for every retry of that same attempt*:
   \`Idempotency-Key: 8e03978e-40d5-43e8-bc93-6894a57f9324\`.
2. **Server, on first sight of a key**: records the key as in-progress,
   executes the operation, stores the response (status + body) against the
   key, returns it.
3. **Server, on seeing the key again**: does **not** re-execute. It returns
   the stored response verbatim. The retry is indistinguishable from the
   original success — which is exactly the point.
4. **Concurrent duplicate** (retry arrives while the first is still
   executing): don't run it twice in parallel — either wait for the first to
   finish, or return \`409 Conflict\` (Stripe's choice) so the client backs
   off and retries.

Three design details interviewers probe:

- **Scope the key** to the authenticated caller and endpoint — two customers
  using the same UUID must not collide.
- **Reject key reuse with a different body** — same key + different payload
  is a client bug; Stripe rejects it with an \`idempotency_error\` (422 isn't
  a status Stripe uses at all — its table maps key reuse to 409). Store a
  hash of the request body to detect this; 400 or 422 are both defensible
  codes in your own API.
- **Expire keys.** The store can't grow forever; keys need a TTL comfortably
  longer than any realistic retry window (Stripe prunes after 24 hours).

### Where the store lives

The key→response store must be shared across your API instances (Redis or a
database table, with the "record key, run, store response" sequence made
atomic — e.g. a unique constraint on the key column so a concurrent duplicate
loses the race) and must persist long enough to cover retries. An in-memory
Map only works for a single process — fine for today's playground, not for
production.

One more honest subtlety: replaying the *stored response* means the client
may receive a stale picture (e.g. the order status has since moved on). That's
correct behaviour — the replay represents the original operation's outcome,
and the client can always GET current state afterwards.
`,

  comparisons: [
    {
      label: "A payment endpoint that double-charges vs an idempotent one",
      intro:
        "The same charge endpoint twice. The PHP version executes on every arrival, so a client retry after a lost response charges the card again; the TS version keys the operation and replays the stored result.",
      php: `<?php
// charge.php — every request is a fresh charge
$amount = (int) $_POST['amount_cents'];
$customer = $_POST['customer_id'];

// Timeout happened AFTER this line last time?
// Then this retry is charge number two.
$chargeId = payment_gateway_charge($customer, $amount);

save_charge($chargeId, $customer, $amount);
echo json_encode(['charge_id' => $chargeId]);

// Nothing links the retry to the original attempt —
// the server can't tell "try again" from "new sale".`,
      ts: `// charges.post.ts — one key, one execution, ever
app.post("/charges", async (req, res) => {
  const key = req.get("Idempotency-Key");
  if (!key) {
    return res.status(400)
      .json({ title: "Idempotency-Key header required" });
  }
  const scoped = \`\${req.user.id}:POST /charges:\${key}\`;

  const prior = await store.get(scoped);
  if (prior?.state === "done") {
    return res.status(prior.status).json(prior.body); // replay
  }
  if (prior?.state === "running") {
    return res.status(409)
      .json({ title: "Original request still in progress" });
  }

  await store.claim(scoped, hash(req.body)); // atomic insert
  const charge = await gateway.charge(req.body);
  await store.complete(scoped, 201, charge);
  return res.status(201).json(charge);
});`,
      note: "The key — scoped to caller + endpoint — turns 'process this request' into 'ensure this logical operation happened once'. The claim step must be atomic (unique constraint / SETNX) so two concurrent duplicates can't both execute.",
    },
    {
      label: "The same retry, without and with the key",
      intro:
        "A client POSTs a charge, the response is lost in transit, and the client retries. Compare the transcripts: same user action, very different bank statements.",
      php: `# Without an idempotency key
$ curl -X POST https://api.shop.test/charges \\
    -d '{"amount_cents":2500,"customer_id":"cus_9"}'
# ...connection drops, response never arrives...

$ curl -X POST https://api.shop.test/charges \\
    -d '{"amount_cents":2500,"customer_id":"cus_9"}'
HTTP/1.1 201 Created

{"charge_id":"ch_1002","amount_cents":2500}

# The server saw two independent requests.
# ch_1001 ALSO exists. The customer paid $50.`,
      ts: `# With an idempotency key (same key on the retry)
$ curl -X POST https://api.shop.test/charges \\
    -H 'Idempotency-Key: 8e03978e-40d5-43e8-bc93-6894a57f9324' \\
    -d '{"amount_cents":2500,"customer_id":"cus_9"}'
# ...connection drops, response never arrives...

$ curl -X POST https://api.shop.test/charges \\
    -H 'Idempotency-Key: 8e03978e-40d5-43e8-bc93-6894a57f9324' \\
    -d '{"amount_cents":2500,"customer_id":"cus_9"}'
HTTP/1.1 201 Created

{"charge_id":"ch_1001","amount_cents":2500}

# Same key -> stored response replayed. One charge: $25.`,
      note: "The key must be generated once per logical operation and reused across its retries — a fresh key per attempt defeats the whole mechanism. Note the replay returns the ORIGINAL response, ch_1001, not a new execution.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Retry loops belong on idempotent requests only",
      intro:
        "Two client-side retry policies. The left one blindly retries everything — including unguarded POSTs; the right one retries only what carries an idempotency guarantee.",
      php: `// naive-client.ts — retries anything that timed out
async function callApi(method: string, url: string, body?: unknown) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await doFetch(method, url, body);
    } catch {
      // POST /charges timing out lands here...
      // and fires again. And again.
    }
  }
  throw new Error("gave up");
}`,
      ts: `// safe-client.ts — retry only under a guarantee
const IDEMPOTENT = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

async function callApi(
  method: string, url: string, body?: unknown,
  opts: { idempotencyKey?: string } = {},
) {
  const retriable = IDEMPOTENT.has(method) || !!opts.idempotencyKey;
  const maxAttempts = retriable ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await doFetch(method, url, body, opts.idempotencyKey);
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(2 ** attempt * 100); // backoff before retrying
    }
  }
}`,
      note: "Client and server halves of one contract: the server makes replays safe; the client only auto-retries when that safety exists (idempotent method, or POST with a key) — and backs off exponentially instead of hammering.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "An in-memory idempotency store processing a charge, its retry with the same key, and a genuinely new charge with a fresh key. Predict: how many times does the gateway actually execute, and which charge ID does the retry receive?",
    code: `// The Idempotency-Key pattern in miniature: a Map from key to
// stored response, and a handler that only executes on first sight.

interface ChargeRequest {
  idempotencyKey: string;
  customerId: string;
  amountCents: number;
}

interface StoredResponse {
  status: number;
  body: { chargeId: string; amountCents: number };
}

// The "payment gateway" — counts real executions so we can
// prove the replay never re-runs it.
let gatewayExecutions = 0;
function executeCharge(req: ChargeRequest): StoredResponse {
  gatewayExecutions++;
  return {
    status: 201,
    body: {
      chargeId: \`ch_\${1000 + gatewayExecutions}\`,
      amountCents: req.amountCents,
    },
  };
}

// key -> stored response. Production: Redis/DB shared across
// instances, atomic claim, body-hash check, TTL (~24 h at Stripe).
const store = new Map<string, StoredResponse>();

function handleCharge(req: ChargeRequest): StoredResponse {
  const scopedKey = \`\${req.customerId}:POST /charges:\${req.idempotencyKey}\`;

  const prior = store.get(scopedKey);
  if (prior) {
    console.log(\`  [replay] key seen before -> stored response, no execution\`);
    return prior;
  }

  const response = executeCharge(req);
  store.set(scopedKey, response);
  console.log(\`  [execute] gateway charged \${req.amountCents} cents\`);
  return response;
}

const original: ChargeRequest = {
  idempotencyKey: "8e03978e-40d5-43e8",
  customerId: "cus_9",
  amountCents: 2500,
};

console.log("1) original request:");
const r1 = handleCharge(original);
console.log(\`   -> \${r1.status} \${JSON.stringify(r1.body)}\`);

console.log("2) client timed out, retries with the SAME key:");
const r2 = handleCharge(original);
console.log(\`   -> \${r2.status} \${JSON.stringify(r2.body)}\`);

console.log("3) a genuinely new purchase, NEW key:");
const r3 = handleCharge({ ...original, idempotencyKey: "b7f2c611-90aa-4d02" });
console.log(\`   -> \${r3.status} \${JSON.stringify(r3.body)}\`);

console.log(\`gateway executions: \${gatewayExecutions} (requests handled: 3)\`);
console.log(\`retry got the original charge id: \${r1.body.chargeId === r2.body.chargeId}\`);

// Try it: give the retry a fresh key — executions jumps to 3 and the
// customer pays twice. The key IS the "this is the same attempt" signal.`,
  },

  keyPoints: [
    "A timeout tells the client nothing about whether the work happened — so retries are inevitable, and the server must make them safe.",
    "GET, HEAD, OPTIONS, PUT, and DELETE are idempotent by definition and safe to blindly retry; POST is not — and POST guards the highest-stakes operations.",
    "Idempotency-Key pattern (Stripe; IETF httpapi draft): client generates one key per logical operation and reuses it on retries; the server executes on first sight, stores status+body, and replays that stored response for any repeat.",
    "Concurrent duplicates must not execute in parallel: claim the key atomically (unique constraint / SETNX) and answer the loser with 409 or by waiting for the winner.",
    "Scope keys to caller + endpoint, reject same-key-different-body as a client error (Stripe raises an `idempotency_error`; 400 or 422 both work in your own API), and expire keys after a TTL longer than any retry window (Stripe: 24 h).",
    "The client half of the contract: auto-retry only idempotent methods or keyed POSTs, with exponential backoff.",
  ],

  interview: [
    {
      q: "A payment POST times out. Walk me through why that's dangerous and how you'd design around it.",
      a: "The danger is asymmetric information: a timeout means the response was lost, but says nothing about whether the request was processed — the charge may or may not have happened, and the client cannot distinguish the two cases. Not retrying risks an unpaid order; naively retrying risks a double charge. The fix is the Idempotency-Key pattern: the client generates a UUID when the user initiates the payment and sends it on the original request *and every retry of it*. The server atomically claims the key before executing, stores the final status and body against it, and answers any repeat of that key by replaying the stored response without touching the gateway again. Retries become safe by construction, and the timeout dilemma disappears — this is exactly how Stripe's API works, and there's an IETF httpapi draft standardising the header.",
    },
    {
      q: "What are the tricky edge cases in implementing an idempotency-key store?",
      a: "Four that matter. First, concurrency: if the retry arrives while the original is mid-flight, both must not execute — I claim the key atomically (a unique constraint or Redis SETNX), and the loser either waits or gets a 409 telling the client to retry shortly, which is Stripe's behaviour. Second, scoping: keys must be namespaced by authenticated caller and endpoint so two clients picking the same UUID can't read each other's responses. Third, key reuse with a different body — that's a client bug, so I store a request-body hash and reject mismatches with a 422 rather than replaying something the client didn't send (Stripe surfaces this as an `idempotency_error`; the exact status is your call). Fourth, storage lifecycle: the store must be shared across instances (Redis or a DB table, not process memory) and pruned by TTL — long enough to cover any retry window; Stripe uses 24 hours.",
    },
    {
      q: "PUT is already idempotent — why do payment APIs use POST plus an idempotency key instead of PUT?",
      a: "PUT's idempotency comes from the client owning the resource's identity and full state: PUT /charges/{id} would require the client to mint the charge ID and send a complete representation, and 'replace this charge' is an awkward fit for 'execute this money movement' — the operation has server-side effects way beyond storing a document. POST matches the semantics — 'process this' — and the idempotency key restores the retry-safety we gave up, at the granularity that actually matters: the *logical attempt*, not the resource. It's worth noticing the two mechanisms deduplicate different things: PUT deduplicates by final state, while the key deduplicates by operation, which is what you want when the operation itself (charging) is the dangerous part. Some APIs do let clients supply IDs to get PUT-style creation — that's a legitimate alternative when the operation is a plain document write.",
    },
  ],

  quiz: [
    {
      question:
        "A client retries a POST /charges with the same Idempotency-Key after a timeout. The original succeeded. What should the server do?",
      options: [
        "Execute the charge again — POST means process the request",
        "Return 409 Conflict because the key was already used",
        "Return the stored response from the original execution, without re-executing",
        "Return 204 No Content since the work is already done",
      ],
      answerIndex: 2,
      explain:
        "The whole point of the pattern: a completed key means 'this logical operation already happened', so the server replays the stored status and body — the client can't even tell it was a retry. 409 is for a duplicate arriving while the original is still in progress, not after completion.",
    },
    {
      question:
        "Two identical requests with the same idempotency key arrive at two API instances at almost the same instant. What prevents a double execution?",
      options: [
        "Each instance keeps its own in-memory Map of keys",
        "An atomic claim on the key in a shared store (unique constraint or SETNX) — the loser gets 409 or waits",
        "Load balancers deduplicate identical request bodies",
        "TCP guarantees ordering, so the second request always arrives after the first finishes",
      ],
      answerIndex: 1,
      explain:
        "The store must be shared across instances and the 'first sight of this key' check must be atomic — an insert that can only succeed once. Per-instance memory fails the moment a retry lands on a different instance; nothing at the transport or LB layer deduplicates application operations.",
    },
    {
      question:
        "A client sends Idempotency-Key K with a $25 body, then later reuses K with a $90 body. Following Stripe's convention, the server should:",
      options: [
        "Replay the stored $25 response",
        "Execute the $90 charge under the same key",
        "Reject the request (e.g. 422) — same key with a different body is a client bug",
        "Charge the difference of $65",
      ],
      answerIndex: 2,
      explain:
        "A key identifies one logical operation, so a different payload under the same key is a contradiction: replaying the $25 response would silently misreport, and executing $90 would break the one-key-one-operation invariant. Detect it by storing a hash of the original body and reject the mismatch — Stripe raises an `idempotency_error` for exactly this case; 400 or 422 are both defensible codes in your own API.",
    },
    {
      question: "Why is a client allowed to blindly retry PUT and DELETE but not a bare POST?",
      options: [
        "PUT and DELETE are faster to process",
        "RFC 9110 defines PUT and DELETE as idempotent — repeats leave the same server state — while POST carries no such guarantee",
        "Proxies block repeated POSTs automatically",
        "POST bodies are too large to resend",
      ],
      answerIndex: 1,
      explain:
        "Idempotent methods promise that N deliveries produce the same state as one: PUT's final state is the request body, DELETE's is 'gone'. POST means 'process this', so each delivery may be a fresh execution — which is why unguarded POST retries double-charge, and why the Idempotency-Key header exists to opt POST into retry safety.",
    },
  ],
};

export default lesson;
