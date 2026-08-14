import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "webhooks",
  title: "Webhooks Done Right",
  part: "Operating in Production",
  estMinutes: 12,
  summary:
    "Webhooks reverse the arrow — you call your consumers — so the contract becomes signed payloads, replay-proof timestamps, retries with backoff, and event ids that make at-least-once delivery safe to deduplicate.",

  concept: `
So far the arrow pointed at you: clients call your API. Webhooks flip it — when an order is
paid, **you** POST an event to a URL your consumer registered. You are now the client, their
endpoint is the server, and the roles bring a new contract. If you have ever wired up a
Stripe or GitHub webhook in PHP, you have stood on the consumer side; interviews increasingly
ask you to design the **provider** side.

### The provider's contract

An unauthenticated POST to a guessable URL is an invitation to forge events. The industry
pattern (Stripe, GitHub) is an **HMAC signature**:

\`\`\`text
POST /webhooks/payments HTTP/1.1
X-Event-Id: evt_8f2c31
X-Timestamp: 1767800000
X-Signature: sha256=1b2f5a...   # HMAC-SHA256(secret, timestamp + "." + rawBody)
\`\`\`

- **Sign timestamp + "." + raw body** with a per-consumer secret, hex digest in a header.
  Signing the timestamp *with* the body means an attacker who captures a delivery cannot
  replay it later with a fresh timestamp — changing either breaks the signature.
- **Reject stale timestamps** — a tolerance window of ~5 minutes kills replay attacks even
  when the captured request is bit-for-bit intact.
- **Retry on anything but 2xx**, with exponential backoff (1 min, 5 min, 30 min, hours...),
  and give consumers a dashboard of failed deliveries plus manual redelivery.
- **Send an event id** — because retries make delivery **at-least-once**: a consumer that
  processed the event but timed out before responding *will* receive it again. Duplicates
  are not a bug; they are the contract. The event id is the idempotency key that makes them safe.

### The consumer's rules

The mirror image, and where most real-world webhook handlers go wrong:

1. **Verify the signature before parsing** — compute the expected HMAC over the **raw body
   bytes** (not \`JSON.parse\` then re-stringify: key order and whitespace differ, and the
   signature won't match). Compare with a **constant-time comparison**
   (\`crypto.timingSafeEqual\` in Node), because early-exit string comparison leaks how many
   leading characters matched — a timing oracle an attacker can iterate on.
2. **Check the timestamp** against your clock, inside the tolerance window.
3. **Return 2xx fast, process async.** The provider's timeout is short; if your handler does
   thirty seconds of work inline, the provider times out, retries, and now you're doing the
   work twice. Persist the event, answer \`202 Accepted\`, process from a queue.
4. **Dedupe by event id** — record processed ids; skip repeats. At-least-once delivery plus
   your idempotent handling equals effectively-once processing.

### Design details that separate juniors from seniors

- **Thin payloads**: send \`{ id, type, data: { orderId } }\` and let the consumer GET the
  full resource — the fetch-back is authenticated and always current, and a leaked payload
  reveals little. Fat payloads save a round trip but can arrive out of order and stale.
- **Ordering is not guaranteed.** Retries interleave; consumers must treat events as facts
  to reconcile ("order.paid happened") rather than diffs to apply blindly.
- **Secret rotation**: support two active secrets per endpoint so consumers can rotate
  without dropping deliveries.

In PHP terms: the signature check is the same discipline as verifying
\`hash_hmac('sha256', $payload, $secret)\` with \`hash_equals()\` — the function names change
(\`createHmac\`, \`timingSafeEqual\`), the reasoning does not.
`,

  comparisons: [
    {
      label: "The receiving endpoint: trusting any POST vs verify-then-process",
      intro:
        "Both receive an order.paid webhook. The PHP script believes anyone who can reach the URL; the TS handler authenticates the delivery, kills replays, and dedupes before touching business logic.",
      php: `<?php // hook.php — believes anything that POSTs to it
$event = json_decode(file_get_contents('php://input'), true);

// No signature check: anyone who finds this URL can
// forge {"type":"order.paid"} and ship themselves goods.
// No timestamp check: a captured request replays forever.
// No dedupe: the provider's retry double-fulfils the order.
if ($event['type'] === 'order.paid') {
    fulfil_order($event['data']['order_id']);
}
http_response_code(200);`,
      ts: `// routes/webhooks.ts — raw body, verify, dedupe, then act
import { createHmac, timingSafeEqual } from "node:crypto";

app.post("/webhooks/payments",
  express.raw({ type: "application/json" }), // keep raw bytes!
  async (req, res) => {
    const ts = req.get("X-Timestamp") ?? "";
    const sig = Buffer.from(
      (req.get("X-Signature") ?? "").replace(/^sha256=/, ""), "hex");
    const expected = createHmac("sha256", process.env.WEBHOOK_SECRET!)
      .update(ts + "." + req.body.toString())
      .digest();

    if (sig.length !== expected.length || !timingSafeEqual(sig, expected))
      return res.status(401).end();               // forged
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300)
      return res.status(401).end();               // replayed

    const event = JSON.parse(req.body.toString()); // NOW parse
    if (await events.alreadyProcessed(event.id))
      return res.status(200).end();               // duplicate delivery

    await queue.enqueue(event);   // heavy work happens async
    res.status(202).end();        // answer fast; provider is happy
  });`,
      note:
        "Order matters: verify the signature over the raw bytes with a constant-time compare, check the timestamp, dedupe by event id — and only then parse and enqueue. The PHP version fails all four steps.",
    },
    {
      label: "One delivery's life: at-least-once in practice",
      intro:
        "The provider delivers evt_8f2c31 to a consumer that is briefly down. Read the retry timeline and note why the consumer sees the same event twice — by design.",
      php: `# Naive provider: fire once, hope for the best
12:00:00  POST https://shop.example/hook
          -> (connection timeout — consumer deploying)

# ...and that's it. The order was paid, the consumer
# never heard, and the two systems now disagree until
# a human reconciles them by hand.`,
      ts: `# Real provider: retry with exponential backoff until 2xx
12:00:00  POST /webhooks/payments  X-Event-Id: evt_8f2c31
          -> timeout (attempt 1)                 # consumer deploying
12:01:00  POST /webhooks/payments  X-Event-Id: evt_8f2c31
          -> 500 (attempt 2, +1m)                # consumer half-up
12:06:00  POST /webhooks/payments  X-Event-Id: evt_8f2c31
          -> 202 Accepted (attempt 3, +5m)       # processed, acked

# Consumer log:
12:06:00  evt_8f2c31 verified -> enqueued
12:06:02  evt_8f2c31 processed: order 42 fulfilled
12:09:30  evt_8f2c31 delivered AGAIN (attempt 2's
          response was lost in transit)
          -> already in processed set -> 200, skip

# Same event, two deliveries, one fulfilment:
# at-least-once delivery + dedupe by event id.`,
      note:
        "Retries are what make webhooks reliable, and retries guarantee duplicates — the event id turns 'delivered at least once' into 'processed exactly once' on the consumer side.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Responding: heavy work inline vs ack fast, process async",
      intro:
        "The webhook triggers PDF generation and two third-party calls (~20s). One handler does it before responding; the other persists and acks in milliseconds.",
      php: `// webhook handler doing the work inline (naive TS/Node)
app.post("/webhooks/payments", verifySignature, async (req, res) => {
  const event = JSON.parse(req.body.toString());

  await generateInvoicePdf(event.data.orderId); // ~15s
  await notifyWarehouse(event.data.orderId);    // ~3s
  await syncToCrm(event.data.orderId);          // ~2s

  // Total ~20s — the provider timed out at 10s,
  // marked the delivery failed, and will RETRY.
  // Now the PDF generates twice and the warehouse
  // gets two pick orders.
  res.status(200).end();
});`,
      ts: `// ack fast, work later
app.post("/webhooks/payments", verifySignature, async (req, res) => {
  const event = JSON.parse(req.body.toString());

  if (await events.alreadyProcessed(event.id)) {
    return res.status(200).end();
  }
  // One fast, idempotent write, then acknowledge:
  await queue.enqueue({ eventId: event.id, payload: event });
  res.status(202).end(); // ~10ms — well inside any timeout

  // A worker drains the queue, marks event.id processed
  // on completion, and can itself retry safely because
  // processing is keyed by event id.
});`,
      note:
        "The provider's timeout is part of your budget: respond in milliseconds with 202 and let a queue absorb the slow work — otherwise the provider's retries multiply your side effects.",
      leftLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A toy webhook pipeline: sign, deliver, redeliver, tamper, replay. The hash is illustrative only — real code uses crypto.createHmac(\"sha256\", secret) and crypto.timingSafeEqual — but the verification logic is exactly what a real receiver runs. Predict the four verdicts, then run it.",
    code: `// Toy HMAC-style signing — ILLUSTRATIVE hash, not real crypto.
// Real code: crypto.createHmac("sha256", secret) + crypto.timingSafeEqual.

function toyHmac(secret: string, message: string): string {
  let h = 2166136261;
  const input = secret + ":" + message;
  for (let i = 0; i < input.length; i++) {
    h = ((h ^ input.charCodeAt(i)) * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Constant-time-style compare: never exits early, accumulates
// differences bit-wise — no timing oracle on how much matched.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const SECRET = "whsec_toy_secret";
const TOLERANCE_SECONDS = 300;

interface Delivery {
  eventId: string;
  timestamp: number; // unix seconds, signed WITH the body
  body: string;      // raw JSON string
  signature: string;
}

function sign(timestamp: number, body: string): string {
  return toyHmac(SECRET, timestamp + "." + body);
}

const processedIds = new Set<string>();

function receive(d: Delivery, now: number): string {
  const expected = sign(d.timestamp, d.body);
  if (!constantTimeEqual(expected, d.signature)) {
    return "401 rejected: signature mismatch (forged or tampered)";
  }
  if (Math.abs(now - d.timestamp) > TOLERANCE_SECONDS) {
    return "401 rejected: timestamp outside tolerance (replay?)";
  }
  if (processedIds.has(d.eventId)) {
    return "200 ok: duplicate of " + d.eventId + " - skipping";
  }
  processedIds.add(d.eventId);
  return "202 accepted: processing " + d.eventId;
}

const now = 1_767_800_000;
const body = JSON.stringify({ type: "order.paid", data: { orderId: 42 } });

// 1. A legitimate delivery.
const delivery: Delivery = {
  eventId: "evt_8f2c31",
  timestamp: now - 2,
  body,
  signature: sign(now - 2, body),
};
console.log("deliver   ->", receive(delivery, now));

// 2. The provider retries the SAME event (response was lost).
console.log("redeliver ->", receive(delivery, now + 30));

// 3. An attacker tampers with the body but keeps the signature.
const tampered: Delivery = { ...delivery, body: body.replace("42", "999") };
console.log("tampered  ->", receive(tampered, now));

// 4. A captured delivery replayed an hour later — signature is
//    valid, but the signed timestamp gives it away.
console.log("replayed  ->", receive(delivery, now + 3600));`,
  },

  keyPoints: [
    "Sign webhook deliveries with HMAC-SHA256 over `timestamp + \".\" + rawBody` using a per-consumer secret — signing the timestamp with the body makes captured requests unreplayable.",
    "Consumers verify over the RAW body bytes (never parse-then-restringify) with a constant-time compare (`crypto.timingSafeEqual`), and reject timestamps outside a ~5-minute window.",
    "Providers retry non-2xx responses with exponential backoff — so delivery is at-least-once and duplicates are part of the contract, not a bug.",
    "Every event carries an id; consumers record processed ids and skip repeats — dedupe turns at-least-once delivery into effectively-once processing.",
    "Return 2xx in milliseconds and process asynchronously from a queue; slow inline handlers trip the provider's timeout and multiply your side effects via retries.",
    "Prefer thin payloads (event id + resource id, consumer fetches the rest) — authenticated fetch-back is always current, and ordering across deliveries is never guaranteed.",
  ],

  interview: [
    {
      q: "Design the security model for outgoing webhooks. How do consumers know a delivery is genuine?",
      a: "Shared-secret HMAC, the Stripe/GitHub pattern. Each consumer endpoint gets a secret at registration; on delivery I compute HMAC-SHA256 over `timestamp + \".\" + rawBody` and send the hex digest plus the timestamp and an event id in headers. The consumer recomputes the HMAC over the raw bytes it received and compares with `timingSafeEqual` — constant-time, because an early-exit compare leaks a timing oracle. Binding the timestamp into the signature plus a ~5-minute tolerance window defeats replay: a captured request can't be re-sent later, and can't have its timestamp freshened without breaking the signature. I'd also support two active secrets per endpoint so consumers can rotate without downtime, and keep payloads thin so a leaked delivery reveals little.",
    },
    {
      q: "Why do webhook consumers receive duplicate events, and how should they handle that?",
      a: "Because reliable delivery forces at-least-once semantics. The provider retries every non-2xx or timed-out delivery with backoff — and 'timed out' includes the case where the consumer processed the event but the 200 got lost, so the same event arrives again. Exactly-once delivery over an unreliable network isn't achievable; exactly-once *processing* is, on the consumer side: every event carries a unique id, the consumer records ids it has processed, and repeats are acknowledged with a 200 and skipped. I'd also make the downstream work idempotent keyed on that event id, so even a crash between processing and recording the id can't double-fulfil an order.",
    },
    {
      q: "A webhook handler needs to do about 20 seconds of work per event. How do you structure it?",
      a: "Never inline. Providers typically time out deliveries within seconds, mark them failed, and retry — so a 20-second handler guarantees duplicate work. The handler should do only fast, safe things: verify the signature over the raw body, check the timestamp, dedupe by event id, persist the event to a queue or table, and answer 202 Accepted in milliseconds. A worker processes the queue at its own pace, marks the event id done on completion, and can retry internally because processing is idempotent. This also separates concerns nicely: delivery reliability is the provider's retry loop; processing reliability is my queue — each can fail and recover independently.",
    },
  ],

  quiz: [
    {
      question: "Why is the timestamp included INSIDE the signed payload (timestamp + \".\" + body) rather than just sent as a header?",
      options: [
        "It makes the HMAC computation faster",
        "So an attacker replaying a captured request cannot substitute a fresh timestamp without invalidating the signature",
        "Because HMAC requires at least two inputs",
        "To keep the body valid JSON",
      ],
      answerIndex: 1,
      explain:
        "If the timestamp were only a header, an attacker could replay the captured body with a current timestamp and pass the freshness check. Signing them together means changing either breaks the signature — freshness and integrity are verified as one unit.",
    },
    {
      question: "Why must the consumer verify the signature over the RAW request body?",
      options: [
        "Raw bytes are faster to hash than parsed objects",
        "JSON.parse followed by JSON.stringify can change key order and whitespace, producing different bytes and a false mismatch",
        "The raw body is encrypted and parsing would fail",
        "Express cannot parse webhook payloads",
      ],
      answerIndex: 1,
      explain:
        "The provider signed the exact bytes it sent. Re-serialising parsed JSON is not guaranteed to reproduce those bytes (key order, whitespace, number formatting), so the recomputed HMAC would differ even for a genuine delivery. Capture the raw body (e.g. express.raw) and verify before parsing.",
    },
    {
      question: "A provider retries deliveries until it gets a 2xx. What follows for the consumer?",
      options: [
        "Events arrive exactly once, in order",
        "Events may arrive more than once, so the consumer must dedupe by event id and process idempotently",
        "The consumer must respond with 429 to stop retries",
        "The consumer should process synchronously so retries never happen",
      ],
      answerIndex: 1,
      explain:
        "Retries are what make delivery reliable, and they guarantee at-least-once semantics — an ack lost in transit means a re-delivery of an already-processed event. Recording processed event ids and skipping repeats turns that into effectively-once processing.",
    },
    {
      question: "Why compare webhook signatures with a constant-time function instead of ===?",
      options: [
        "=== cannot compare strings of hex digits",
        "Constant-time comparison is faster",
        "An early-exit compare leaks how many leading characters matched, giving attackers a timing oracle to forge signatures incrementally",
        "timingSafeEqual also checks the timestamp automatically",
      ],
      answerIndex: 2,
      explain:
        "Ordinary comparison returns as soon as a character differs, so response timing correlates with how much of the guess was right — an attacker can recover the signature byte by byte. crypto.timingSafeEqual takes the same time regardless of where the difference is (PHP's hash_equals exists for the same reason).",
    },
  ],
};

export default lesson;
