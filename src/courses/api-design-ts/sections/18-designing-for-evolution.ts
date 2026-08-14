import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "designing-for-evolution",
  title: "Designing for Evolution",
  part: "Collections & Evolution",
  estMinutes: 12,
  summary:
    "How to avoid needing v2 at all: additive-only changes, tolerant readers, unknown-enum handling, and a deprecation lifecycle with Deprecation (RFC 9745) and Sunset (RFC 8594) headers.",

  concept: `
Versioning is the emergency exit. Evolution is the staircase you should be
taking every day. An API designed for evolution can absorb years of change —
new features, renamed concepts, retired fields — without ever forcing clients
through a v2 migration. Four producer-side rules and one consumer-side rule
get you there.

### Producer rule 1: additive only

Never remove, rename, or retype a field on a live contract. Need a better
shape? Add the new field *next to* the old one, keep both serving, and retire
the old one through the deprecation lifecycle below. \`total\` (integer cents)
doesn't become \`"86.00 AUD"\` — an \`amount\` object appears alongside it.

### Producer rule 2: optional with a default

New request fields must be optional with a server-side default, so requests
written last year keep validating. In zod terms:
\`priority: z.enum(["low", "normal", "high"]).default("normal")\` — an old
client that never sends \`priority\` is indistinguishable from one that chose
\`"normal"\`.

### Producer rule 3: never repurpose meaning

The most insidious break isn't structural — the field is still there, still a
string — it's *semantic*. \`status\` used to hold \`1|2|3\` and now holds
\`"pending"\`; \`total\` silently switches from cents to dollars. Nothing 400s,
every consumer just starts being quietly wrong. If the meaning changes, it's a
new field, full stop.

### Consumer rule: be a tolerant reader

Clients must **ignore unknown fields** and survive missing optional ones —
the *tolerant reader* pattern. A client that does
\`if (Object.keys(order).length !== 5) throw\` has made every additive server
change a breaking one. This is where zod quietly helps: \`z.object()\` **strips
unknown keys by default** when parsing, so a zod-validated client is a
tolerant reader out of the box — new server fields simply vanish from the
parsed result instead of crashing anything. (Don't reach for
\`z.strictObject()\` on schemas that parse *responses* — Zod 4 replaced the
deprecated \`.strict()\` method with it; save strictness for validating
requests you own.)

Enums deserve special care on both sides. The producer treats a new enum
value as a semi-breaking change; the consumer defends itself by mapping
anything unrecognised to a fallback:

\`\`\`ts
const KNOWN = new Set(["pending", "shipped", "delivered"]);
const status = KNOWN.has(raw.status) ? raw.status : "unknown";
\`\`\`

A switch statement that throws on an unexpected enum value is a time bomb
with the server team's finger on the button.

### The deprecation lifecycle

Retiring a field or endpoint is a process, not an event:

1. **Document** the deprecation and its replacement in the changelog/OpenAPI.
2. **Signal in-band.** RFC 9745 (March 2025) standardises the
   \`Deprecation\` response header, whose value is a structured-field date:
   \`Deprecation: @1767225600\`. Pair it with \`Sunset\` (RFC 8594) — an
   HTTP-date announcing when the resource stops working — and a
   \`Link: <...>; rel="deprecation"\` pointing at the docs.
3. **Monitor.** Log which API keys still hit the deprecated thing; email the
   stragglers. Removal without usage data is a guess.
4. **Remove** on the announced sunset date — after it has passed, and after
   traffic has actually drained.

\`\`\`bash
HTTP/1.1 200 OK
Deprecation: @1767225600
Sunset: Tue, 30 Jun 2026 23:59:59 GMT
Link: <https://api.acme.dev/docs/migrate-total>; rel="deprecation"
\`\`\`

This closes the versioning story: evolve additively by default, deprecate on
a visible schedule, and version only when a change genuinely cannot be made
additive. Teams that follow these rules often never ship a v2 — which is the
whole point.
`,

  comparisons: [
    {
      label: "Repurposing a field vs adding alongside",
      intro:
        "The team wants human-readable statuses. One shop redefines the existing field in place; the other adds a new field and deprecates the old one on a schedule.",
      php: `<?php // getOrder.php — "improved" on a Friday afternoon
$order = loadOrder($pdo, $_GET['id']);

// status used to be an int (1=pending, 2=shipped, 3=delivered).
// Now it's a string. Same field name, new meaning.
echo json_encode([
  'id'     => $order['id'],
  'status' => statusLabel($order['status_code']), // "shipped"
  'total'  => $order['total'],
]);
// Every consumer doing ($order->status === 2) is now
// silently, permanently wrong. No error. No 400. Nothing.`,
      ts: `// The additive path: new field beside the old, then a lifecycle.
interface OrderResponse {
  id: string;
  /** @deprecated integer code — use statusCode. Sunset 2026-06-30. */
  status: number;
  statusCode: "pending" | "shipped" | "delivered"; // the new field
  total: number;
}

app.get("/orders/:id", async (req, res) => {
  const o = await loadOrder(req.params.id);
  res.setHeader("Deprecation", "@1767225600");          // RFC 9745
  res.setHeader("Sunset", "Tue, 30 Jun 2026 23:59:59 GMT"); // RFC 8594
  res.json({
    id: o.id,
    status: o.statusInt,        // old clients keep working
    statusCode: o.statusCode,   // new clients migrate here
    total: o.total,
  } satisfies OrderResponse);
});`,
      note:
        "Same field name + new meaning is the worst possible break: nothing errors, consumers are just wrong. The additive version keeps both fields serving while headers and docs drive the migration.",
    },
    {
      label: "Brittle exact-match client vs tolerant reader",
      intro:
        "Two clients consume the same order endpoint. The server then ships a purely additive change — one new optional field. Watch which client survives it.",
      php: `// client.ts — brittle: validates by exact shape
function parseOrder(raw: Record<string, unknown>) {
  const expected = ["id", "status", "total"];
  const keys = Object.keys(raw);
  if (keys.length !== expected.length ||
      !expected.every((k) => k in raw)) {
    // The day the server adds "statusCode", this throws.
    throw new Error("Unexpected order shape: " + keys.join(","));
  }
  return raw as { id: string; status: number; total: number };
}`,
      ts: `// client.ts — tolerant reader: take what you know, ignore the rest
function parseOrder(raw: Record<string, unknown>) {
  return {
    id: String(raw.id),
    status: Number(raw.status),
    total: Number(raw.total),
    // Unknown keys are simply not copied — additive server
    // changes are invisible here. zod's z.object() gives you
    // exactly this: unknown keys are stripped by default.
  };
}`,
      note:
        "The brittle client turned an additive server change into its own outage. Tolerant reading — pick known fields, ignore unknowns — is what makes 'additive is non-breaking' actually true.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Silent removal vs a signalled sunset",
      intro:
        "Two ways a field dies. On the left, consumers discover the removal in production; on the right, machines and humans were told months in advance.",
      php: `# March: field is there
$ curl -s https://api.acme.dev/orders/ord_1042
HTTP/1.1 200 OK

{"id":"ord_1042","status":2,"total":8600}

# July: field is gone. First anyone hears of it is a
# NullPointerException in every consumer's error tracker.
$ curl -s https://api.acme.dev/orders/ord_1042
HTTP/1.1 200 OK

{"id":"ord_1042","statusCode":"shipped","total":8600}`,
      ts: `# March: response announces the plan, in-band and machine-readable
$ curl -si https://api.acme.dev/orders/ord_1042
HTTP/1.1 200 OK
Deprecation: @1767225600
Sunset: Tue, 30 Jun 2026 23:59:59 GMT
Link: <https://api.acme.dev/docs/migrate-status>; rel="deprecation"

{"id":"ord_1042","status":2,"statusCode":"shipped","total":8600}

# July, AFTER the sunset date and after usage logs drained:
{"id":"ord_1042","statusCode":"shipped","total":8600}`,
      note:
        "Deprecation (RFC 9745, a structured-field date like @1767225600) says 'this is going away'; Sunset (RFC 8594, an HTTP-date) says when. Monitoring who still uses the old field is what makes the removal date safe.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "One tolerant client parser fed two generations of server payload — the 2019 shape and the 2026 shape with new fields and a new enum value. Predict whether both parse cleanly, then run it.",
    code: `// The client's view of an order: only the fields IT needs.
interface ClientOrder {
  id: string;
  status: "pending" | "shipped" | "delivered" | "unknown";
  total: number;
  currency: string; // optional on the wire; client defaults it
}

const KNOWN_STATUSES = new Set(["pending", "shipped", "delivered"]);

// Tolerant reader: pick known fields, default missing optionals,
// map unrecognised enum values to a fallback, ignore everything else.
function parseOrder(raw: Record<string, unknown>): ClientOrder {
  const rawStatus = String(raw.status ?? "");
  return {
    id: String(raw.id),
    status: KNOWN_STATUSES.has(rawStatus)
      ? (rawStatus as ClientOrder["status"])
      : "unknown",
    total: Number(raw.total),
    currency: typeof raw.currency === "string" ? raw.currency : "AUD",
  };
}

// Generation 1: the payload as the server sent it in 2019.
const payload2019 = {
  id: "ord_77",
  status: "shipped",
  total: 8600,
};

// Generation 2: six years of ADDITIVE evolution later — new fields,
// an explicit currency, and a status value that didn't exist in 2019.
const payload2026 = {
  id: "ord_9001",
  status: "delayed_in_transit", // new enum value — client must not crash
  total: 12400,
  currency: "NZD",
  amount: { value: 12400, currency: "NZD" }, // newer money shape
  statusCode: "delayed_in_transit",
  fulfilmentCentre: "SYD-2", // fields the client has never heard of
};

for (const [era, payload] of [
  ["2019 payload", payload2019],
  ["2026 payload", payload2026],
] as const) {
  const order = parseOrder(payload);
  console.log(\`\${era} -> parsed OK\`);
  console.log(
    \`   id=\${order.id} status=\${order.status} \` +
      \`total=\${order.total} currency=\${order.currency}\`,
  );
}

console.log("Both generations parse: unknown fields ignored,");
console.log("missing currency defaulted, unknown status mapped safely.");

// Try it: add a throw for unrecognised statuses instead of the
// fallback and watch the 2026 payload take the client down.`,
  },

  keyPoints: [
    "Evolve additively: never remove, rename, or retype a live field — add the better field alongside and retire the old one through a deprecation lifecycle.",
    "New request fields must be optional with a server-side default (zod: `.default(...)`) so last year's requests keep validating.",
    "Never repurpose a field's meaning — `status` int quietly becoming a string breaks every consumer with zero errors; a new meaning is a new field.",
    "Clients must be tolerant readers: consume known fields, ignore unknown ones — zod's `z.object()` strips unknown keys by default, so zod-parsed responses get this for free (don't use `z.strictObject()` for response schemas — it's Zod 4's replacement for the deprecated `.strict()`).",
    "Handle enum evolution defensively: map unrecognised values to a fallback like `\"unknown\"` instead of throwing on them.",
    "Retire on a visible schedule: document, send `Deprecation: @<unix-ts>` (RFC 9745) + `Sunset: <HTTP-date>` (RFC 8594) + a docs `Link`, monitor remaining usage, then remove.",
  ],

  interview: [
    {
      q: "How do you evolve an API over years without ever shipping a v2?",
      a: "By making every change additive and pushing tolerance onto both sides of the contract. On the producer side: never remove, rename, or retype a field — add the new field next to the old one; make new request inputs optional with server-side defaults; and never repurpose a field's meaning, because a semantic change breaks consumers with zero errors. On the consumer side: be a tolerant reader — pick the fields you know, ignore unknown ones, default missing optionals, and map unrecognised enum values to a fallback. When something must go away, it goes through a lifecycle: document it, signal with the Deprecation header (RFC 9745) and a Sunset date (RFC 8594), monitor who still uses it, then remove after traffic drains. Teams that hold that line often never need a v2.",
    },
    {
      q: "What is the tolerant reader pattern and how does zod relate to it?",
      a: "Tolerant reader means a client consumes only what it understands: unknown fields are ignored, missing optional fields get defaults, and unexpected enum values map to a safe fallback rather than throwing. It's the consumer half of the evolution bargain — 'additive changes are non-breaking' is only true if clients don't exact-match the response shape. zod helps because `z.object()` strips unknown keys by default when parsing, so a client that validates responses through a zod schema is a tolerant reader automatically — a new server field simply doesn't appear in the parsed output. The corollary is to keep strictness off response schemas — in Zod 4 that means not reaching for `z.strictObject()`, which replaced the now-deprecated `.strict()` method; strictness belongs on requests you own, where unknown keys indicate a caller bug.",
    },
    {
      q: "Walk me through properly deprecating a field on a public API.",
      a: "It's a four-step lifecycle, not a deletion. First, document: changelog, OpenAPI `deprecated: true`, and a migration guide to the replacement. Second, signal in-band so machines see it too: the `Deprecation` response header from RFC 9745 — a structured-field date like `@1767225600` marking when deprecation takes effect — plus `Sunset` from RFC 8594 giving the removal date as an HTTP-date, and a `Link` with `rel=\"deprecation\"` to the docs. Third, monitor: log which API keys still read the old field and contact the stragglers directly — removing without usage data is gambling with other people's production. Fourth, remove on or after the announced sunset date, once traffic has actually drained. The old and new fields serve side by side for the whole window.",
    },
  ],

  quiz: [
    {
      question:
        "The team wants `status` (currently the integer 2) to become the string \"shipped\". What's the evolution-safe move?",
      options: [
        "Change the field in place — it's still called status, so clients will adapt",
        "Add a new field (e.g. statusCode) with the string value, keep serving status, and deprecate it with headers and a sunset date",
        "Return the string only to clients whose requests look new",
        "Bump to /v2/ immediately — any status change is a breaking change",
      ],
      answerIndex: 1,
      explain:
        "Changing a live field's type/meaning breaks every consumer silently — the worst kind of break. Adding statusCode alongside keeps old clients working while new ones migrate, and the Deprecation/Sunset lifecycle retires status on a visible schedule. Versioning is the fallback when a change can't be additive; this one can.",
    },
    {
      question:
        "Why should a client map an unrecognised enum value like \"delayed_in_transit\" to a fallback instead of throwing?",
      options: [
        "Throwing is slower than mapping to a fallback",
        "Enum values are never documented, so clients can't know the full set",
        "Producers add enum values over time, and a throwing switch turns each addition into a client outage",
        "JSON has no enum type, so the value might be a number",
      ],
      answerIndex: 2,
      explain:
        "New enum values are one of the most common evolutions, and a client that throws on the unknown has coupled its uptime to the server's release schedule. Mapping to a fallback like \"unknown\" (and rendering something sensible) keeps the client functional while it catches up.",
    },
    {
      question:
        "Which pair of response headers announces that an endpoint is deprecated and when it will stop working?",
      options: [
        "Warning and Expires",
        "Deprecation (RFC 9745, structured-field date) and Sunset (RFC 8594, HTTP-date)",
        "Retry-After and Age",
        "X-Deprecated and X-Removal-Date — there's no standard for this",
      ],
      answerIndex: 1,
      explain:
        "RFC 9745 (2025) standardised Deprecation with a structured-field date value like @1767225600; RFC 8594 defines Sunset with a conventional HTTP-date marking when the resource becomes unresponsive. Together with a Link rel=\"deprecation\" to docs, they make the retirement machine-readable — no X- headers needed.",
    },
  ],
};

export default lesson;
