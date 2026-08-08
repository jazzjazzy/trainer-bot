import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "ecommerce-checkout",
  title: "Design an E-Commerce Checkout",
  part: "The Classic Questions",
  estMinutes: 14,
  summary:
    "Cart to order to payment to fulfilment, modelled as a state machine — with inventory reservation, idempotency keys so retries never double-charge, and the payment webhook as the source of truth.",

  concept: `
This is the design question where 25 years of PHP commerce work is an unfair
advantage — say so and cash it in. You have shipped carts, watched a payment
gateway double-charge a customer, and cleaned up oversold stock at 2am. That
lived experience is exactly what this question grades, so lead with it.

### Requirements

Cart -> order -> payment -> fulfilment, with two hard correctness rules:
**inventory must not oversell**, and **a card must be charged exactly once**
even though networks retry.

### The order as a state machine

Model the order as an explicit state machine, not a pile of booleans:

\`\`\`
pending --paid--> paid --fulfilled--> fulfilled
   \\--cancelled--> cancelled
\`\`\`

Only legal transitions are allowed; an illegal one (cancel an already-shipped
order) is **rejected**, not silently applied. This is the single most
stabilising decision in a checkout — every "how did this order get into that
state?" bug is an unguarded transition.

### Inventory reservation: reserve-with-TTL vs decrement-on-payment

The trade-off is oversell vs abandoned carts:

- **Decrement on payment:** stock only drops when money clears. Simple, but two
  buyers can both check out the last unit and one gets an oversold order.
- **Reserve with TTL:** at checkout, reserve the units with an expiry (say 15
  minutes). Concurrent buyers can't grab reserved stock, so no oversell; if the
  buyer abandons, the reservation expires and the stock returns. You trade a
  little temporary unavailability for correctness — usually the right call.

### Idempotency keys: charge exactly once

The payment call goes over a flaky network, so it **will** be retried. If a
retry starts a second charge, you double-charge the customer. The fix is an
**idempotency key**: the client generates one key per checkout attempt and
sends it with the charge; the first request does the work and records the key,
and any retry with the same key returns the original result **without moving
money again**. Every serious payment provider supports this header for exactly
this reason.

### The webhook is the source of truth

Don't mark an order paid because the charge call returned 200 — the connection
can drop after the bank approves. Treat the provider's **webhook** as
authoritative: it fires \`payment.succeeded\`, and *that* drives
\`pending -> paid\`. Webhooks are delivered **at-least-once**, so dedupe on the
event id — the same idempotency instinct, one layer out.

### Transactions where money moves, queues for the rest

Wrap the money-moving, stock-moving steps in a **database transaction** so they
commit atomically or not at all. Everything *after* payment — confirmation
email, warehouse fulfilment, analytics — goes on a **queue** and runs async, so
a slow email never fails a paid order. It's the cron-driven job table you've
run for years, just named a queue.
`,

  comparisons: [
    {
      label: "Inventory: decrement-and-hope vs reserve-with-TTL",
      intro:
        "Two buyers race for the last unit. The weak version decrements on payment and can oversell; the strong version reserves atomically at checkout so only one buyer can proceed.",
      php: `-- WEAK: decrement on payment, no reservation
-- Two sessions both read stock = 1, both "succeed".
BEGIN;
SELECT stock FROM products WHERE id = 42;      -- both read 1
-- ... buyer pays ...
UPDATE products SET stock = stock - 1 WHERE id = 42;
COMMIT;
-- Under concurrency stock goes to -1: oversold.
-- Nothing reserved the unit between read and pay.`,
      ts: `-- STRONG: reserve-with-TTL at checkout, atomically
-- Conditional update: only succeeds if stock is actually free.
BEGIN;
UPDATE products
   SET stock = stock - 1
 WHERE id = 42 AND stock >= 1;                  -- 0 rows if none left
INSERT INTO reservations (order_id, product_id, qty, expires_at)
VALUES (:order, 42, 1, now() + interval '15 minutes');
COMMIT;
-- Loser's UPDATE affects 0 rows -> "out of stock" now,
-- not an oversold order later. A sweeper returns stock
-- from reservations whose expires_at has passed.`,
      note:
        "The guard is the conditional UPDATE ... WHERE stock >= 1: it makes the check-and-decrement atomic so exactly one racing buyer wins, and the TTL reservation returns abandoned-cart stock automatically.",
      leftLang: "sql",
      rightLang: "sql",
    },
    {
      label: "Charging: naive retry vs idempotency key",
      intro:
        "The charge request times out and the client retries. The weak version charges twice; the strong version keys the charge so the retry is a no-op that returns the original result.",
      php: `// WEAK: retry starts a fresh charge
async function charge(orderId: string, cents: number): Promise<string> {
  // Timeout on the first call -> caller retries -> this runs
  // again with no memory of the first, and the bank approves
  // BOTH. Customer is charged twice.
  const res = await gateway.createCharge({ orderId, cents });
  return res.chargeId;
}`,
      ts: `// STRONG: idempotency key dedupes the retry
const results = new Map<string, string>(); // key -> chargeId

async function charge(
  orderId: string,
  cents: number,
  idempotencyKey: string,   // one per checkout attempt, from the client
): Promise<string> {
  const prior = results.get(idempotencyKey);
  if (prior) return prior;  // retry: return original, move no money
  const res = await gateway.createCharge(
    { orderId, cents },
    { idempotencyKey },     // provider also dedupes on its side
  );
  results.set(idempotencyKey, res.chargeId);
  return res.chargeId;
}`,
      note:
        "The client sends one idempotency key per checkout attempt; the first call charges and records it, every retry with the same key returns the stored result. The payment provider honours the same key, so it's dedupe on both sides.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "An order state machine processing checkout events — including a retried charge (same idempotency key) and a duplicated payment webhook. Predict the final charge count, then run it: the guard must keep it at exactly 1.",
    code: `type OrderState = "pending" | "paid" | "fulfilled" | "cancelled";

interface Order {
  id: string;
  state: OrderState;
  charges: number;      // how many times money actually moved
  reserved: number;     // units of stock reserved
}

// Legal transitions: anything else is rejected, not silently applied.
const allowed: Record<OrderState, OrderState[]> = {
  pending: ["paid", "cancelled"],
  paid: ["fulfilled"],
  fulfilled: [],
  cancelled: [],
};

const order: Order = { id: "o-1001", state: "pending", charges: 0, reserved: 2 };

// Idempotency ledgers: a key / id is processed at most once.
const chargedKeys = new Set<string>();   // payment idempotency keys
const seenWebhooks = new Set<string>();  // payment-provider event ids

function transition(to: OrderState, reason: string): boolean {
  if (!allowed[order.state].includes(to)) {
    console.log(\`  [reject] \${order.state} -/-> \${to} (\${reason})\`);
    return false;
  }
  console.log(\`  [state]  \${order.state} -> \${to} (\${reason})\`);
  order.state = to;
  return true;
}

// The idempotency key makes retries safe: a second call with the
// same key never moves money again.
function charge(idempotencyKey: string): void {
  if (chargedKeys.has(idempotencyKey)) {
    console.log(\`  [idem]   charge \${idempotencyKey} already processed -> no double charge\`);
    return;
  }
  chargedKeys.add(idempotencyKey);
  order.charges += 1;
  console.log(\`  [charge] card charged once (key=\${idempotencyKey}); charges=\${order.charges}\`);
}

// The webhook is the source of truth for "paid"; providers deliver
// at-least-once, so dedupe on the event id before transitioning.
function paymentWebhook(eventId: string): void {
  if (seenWebhooks.has(eventId)) {
    console.log(\`  [idem]   webhook \${eventId} already handled -> ignored\`);
    return;
  }
  seenWebhooks.add(eventId);
  transition("paid", \`webhook \${eventId}\`);
}

console.log("=== checkout: reserve -> charge (with a retry) ===");
console.log(\`  [stock]  reserved \${order.reserved} units with TTL at checkout\`);
charge("chg-abc");            // first attempt
charge("chg-abc");            // network retry: SAME key -> guard fires

console.log("\\n=== payment provider fires the webhook (twice) ===");
paymentWebhook("evt-77");     // real event -> pending -> paid
paymentWebhook("evt-77");     // duplicate delivery -> ignored

console.log("\\n=== fulfilment happens after payment (async) ===");
transition("fulfilled", "warehouse shipped");
transition("cancelled", "late cancel attempt"); // illegal from fulfilled

console.log("\\n=== final ===");
console.log(\`  state=\${order.state} charges=\${order.charges} (must be 1)\`);
console.log(order.charges === 1 ? "  idempotency guard held: charged exactly once" : "  BUG: double charge");`,
  },

  keyPoints: [
    "Model the order as an explicit state machine (pending -> paid -> fulfilled/cancelled) and reject illegal transitions — most 'how did it get into that state?' bugs are unguarded transitions.",
    "Inventory: reserve-with-TTL at checkout prevents oversell (concurrent buyers can't grab reserved stock) at the cost of temporary holds; decrement-on-payment is simpler but oversells under a race.",
    "Make the reserve atomic with a conditional UPDATE ... WHERE stock >= 1 so exactly one racing buyer wins, and sweep expired reservations back into stock.",
    "Idempotency keys make the charge call safe to retry: the first request charges and records the key, every retry with the same key returns the original result without moving money.",
    "Treat the payment provider's webhook as the source of truth for 'paid' — the charge response can be lost — and dedupe webhooks on event id since they're delivered at-least-once.",
    "Wrap money- and stock-moving steps in a DB transaction; push everything after payment (email, fulfilment) onto a queue so slow side-effects never fail a paid order.",
  ],

  interview: [
    {
      q: "How do you guarantee a customer is charged exactly once, given the network can fail at any point?",
      a: "Idempotency keys plus a webhook as the source of truth. The client generates one idempotency key per checkout attempt and sends it with the charge; my server — and the payment provider — record that key, so the first request does the charge and any retry with the same key returns the original result without moving money again. I don't mark the order paid just because the charge call returned success, because that response can be lost after the bank approves — instead the provider's payment.succeeded webhook drives the pending-to-paid transition. Webhooks are delivered at-least-once, so I dedupe them on the event id too. I've watched a gateway double-charge a customer without this, so I treat it as non-negotiable, not a nice-to-have.",
    },
    {
      q: "Reserve inventory at checkout or decrement on payment — which, and why?",
      a: "Reserve with a TTL at checkout, in almost every case. If I only decrement when payment clears, two buyers can both check out the last unit and I oversell — a real cost in refunds and trust. Reserving atomically at checkout with a conditional UPDATE that only succeeds when stock is actually free means the second buyer is told 'out of stock' immediately instead of getting a doomed order. The reservation carries an expiry, so an abandoned cart releases the stock automatically via a sweeper. The trade-off is that inventory looks briefly unavailable while a cart is open, but temporary unavailability is far cheaper than overselling. For genuinely unlimited digital goods I'd skip reservation entirely — it's stock scarcity that makes it necessary.",
    },
    {
      q: "You have 25 years in PHP e-commerce. How does that show up in this design?",
      a: "Directly, and I'd say so. I've built the cart-to-order-to-payment flow in production, so I lead with the failure modes I've actually hit rather than the happy path: the gateway that double-charged because a timeout got retried, the oversell when two buyers raced for the last unit, the order stuck in a weird state because someone flipped a boolean out of order. That's why I reach for an explicit state machine, idempotency keys, TTL reservations, and the webhook as source of truth — each one is scar tissue from a real incident. The cron-driven job tables I ran for years are exactly the queue that now handles post-payment email and fulfilment. The concepts transfer completely; only the vocabulary is new.",
    },
  ],

  quiz: [
    {
      question: "What problem does an idempotency key on the charge call solve?",
      options: [
        "It encrypts the card number in transit",
        "It lets a retried charge return the original result without moving money a second time",
        "It speeds up the charge by caching the gateway response",
        "It reserves inventory during payment",
      ],
      answerIndex: 1,
      explain:
        "Networks retry, and a naive retry starts a second charge — a double charge. With an idempotency key the first request charges and records the key; any retry with the same key returns the stored result and moves no money.",
    },
    {
      question: "Why treat the payment provider's webhook as the source of truth for 'paid' rather than the charge API response?",
      options: [
        "Webhooks are faster than API responses",
        "The API response is encrypted and hard to parse",
        "The charge response can be lost after the bank approves, so the webhook is the reliable confirmation",
        "Webhooks don't require authentication",
      ],
      answerIndex: 2,
      explain:
        "The connection can drop after the bank approves but before your server sees the response, leaving a real payment you don't know about. The provider's webhook reliably reports the outcome — dedupe it on event id since it's delivered at-least-once.",
    },
    {
      question: "What is the main trade-off of reserving inventory with a TTL at checkout?",
      options: [
        "It permanently reduces available stock",
        "It prevents oversell but makes stock briefly unavailable while carts are open",
        "It requires a NoSQL database",
        "It charges the customer before they confirm",
      ],
      answerIndex: 1,
      explain:
        "Reserve-with-TTL stops concurrent buyers from grabbing the same unit (no oversell), but the reserved stock looks unavailable until the buyer completes or the reservation expires and a sweeper releases it — usually a worthwhile trade.",
    },
  ],
};

export default lesson;
