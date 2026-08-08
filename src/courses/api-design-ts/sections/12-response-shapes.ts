import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "response-shapes",
  title: "Response Shapes & Serialization",
  part: "Contracts & Validation",
  estMinutes: 12,
  summary:
    "Design the JSON you send deliberately: envelope collections but not single resources, pick one casing, and serialize dates, money, and big ids in formats that survive the trip through JavaScript.",

  concept: `
\`json_encode($row)\` is not a serialization strategy — it's whatever your
database column types happened to be, shipped as a public contract. Deliberate
APIs decide the wire shape separately from the storage shape.

### Envelope or bare resource?

For a **single resource**, return it bare: \`GET /orders/42\` →
\`{ "id": "42", ... }\`. Wrapping it as \`{ "data": { ... } }\` adds a level of
nesting with nothing to say.

For a **collection**, you need somewhere to put metadata — pagination, totals,
next cursors — so a top-level array is a dead end:

\`\`\`json
{ "data": [ ... ], "meta": { "page": 2, "perPage": 20, "total": 143 } }
\`\`\`

There's a second, historical reason collections were wrapped: a bare top-level
JSON array was exploitable in very old browsers. That attack is dead, but the
*extensibility* argument is alive — you cannot add \`meta\` to \`[...]\` later
without breaking every client.

### null vs omitted

Decide what absence means, and be consistent. A common contract: **a field
that applies but has no value is \`null\`; a field the client didn't ask for or
that doesn't apply is omitted**. Whatever you choose, clients will write code
against it — \`if ("notes" in order)\` behaves differently from
\`order.notes !== null\`. Document the rule once and enforce it in the
serializer, not per endpoint.

### Casing: pick one, document it

JSON has no official casing, but JavaScript clients dominate, so **camelCase**
is the pragmatic default (\`createdAt\`, not \`created_at\`). The real sin isn't
snake_case — it's *mixing*, which happens exactly when responses are raw DB
rows from tables named by different people over 15 years. The serializer is
where \`created_at\` becomes \`createdAt\`, in one place.

### Dates: ISO 8601, UTC, always

Send \`"2026-07-07T09:30:00.000Z"\` — an ISO 8601 string in UTC. Never epoch
integers: the moment you ship \`1751880600\`, someone will guess wrong about
seconds vs milliseconds (PHP's \`time()\` is seconds; JS's \`Date.now()\` is
milliseconds — a 1000× bug you get to debug at 2 a.m.). \`Date.prototype
.toISOString()\` produces exactly the right format, and every language parses it.

### Money: never floats

IEEE 754 floats cannot represent most decimal fractions: \`0.1 + 0.2\` is
\`0.30000000000000004\`, and \`19.99 * 100\` — the innocent "convert dollars to
cents" — is \`1998.9999999999998\`. Store and
transmit money as **integer minor units** (\`129999\` cents) or as a **decimal
string** (\`"1299.99"\`), paired with a currency code:
\`{ "amount": 129999, "currency": "AUD" }\`. Same discipline as using \`DECIMAL\`
instead of \`FLOAT\` in MySQL — the wire format needs it too.

### 64-bit ids: strings on the wire

JavaScript numbers are IEEE 754 doubles: integers are only exact up to
2^53 − 1 (\`Number.MAX_SAFE_INTEGER\`). A BIGINT or Snowflake id like
\`9007199254740993\` silently becomes \`...992\` the instant a JS client calls
\`JSON.parse\`. PHP with 64-bit ints never taught you this scar — JS clients
will. Ship big ids as strings: \`"id": "9007199254740993"\`. They're opaque
identifiers anyway; nobody should be doing arithmetic on them.
`,

  comparisons: [
    {
      label: "json_encode the row vs a deliberate serializer",
      intro:
        "Both return an order. The PHP script ships the database row verbatim — DATETIME string in server-local time, price as a float, BIGINT id as a number. The TS serializer owns the wire format.",
      php: `<?php // api/order.php
$stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
$stmt->execute([$_GET['id']]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

// Whatever MySQL had, the client gets:
//   created_at: "2026-07-07 19:30:00"  (which timezone?)
//   total: 1299.99                     (float — rounding bugs ahead)
//   id: 9007199254740993               (mangled by JS clients)
echo json_encode($row);`,
      ts: `// src/serializers/order.ts
interface OrderRow {
  id: string;            // BIGINT read as string from the driver
  created_at: Date;
  total_cents: number;   // integer minor units in the DB
  currency: string;
  notes: string | null;
}

function serializeOrder(row: OrderRow) {
  return {
    id: row.id,                                  // string on the wire
    createdAt: row.created_at.toISOString(),     // ISO 8601, UTC
    total: { amount: row.total_cents, currency: row.currency },
    notes: row.notes,                            // null means "applies, empty"
  };
}`,
      note:
        "The serializer is the boundary where storage names (snake_case, DATETIME, cents) become contract names (camelCase, ISO strings, money objects) — change the schema and only this file moves.",
    },
    {
      label: "Bare array vs collection envelope",
      intro:
        "Two ways to return GET /orders. The bare array works on day one; the envelope is the one that survives day ninety, when pagination metadata has to go somewhere.",
      php: `[
  { "id": "41", "status": "shipped" },
  { "id": "42", "status": "pending" }
]`,
      ts: `{
  "data": [
    { "id": "41", "status": "shipped" },
    { "id": "42", "status": "pending" }
  ],
  "meta": { "page": 1, "perPage": 20, "total": 143, "totalPages": 8 }
}`,
      note:
        "You cannot add meta to a top-level array without breaking every client that does response.map(...). Envelope collections from day one; leave single resources bare.",
      leftLang: "json",
      rightLang: "json",
    },
    {
      label: "Mixed casing vs one documented convention",
      intro:
        "The left payload is what fifteen years of organic schema growth looks like when rows are echoed raw. The right one went through a serializer with a single rule.",
      php: `{
  "order_id": "42",
  "createdAt": "2026-07-07 19:30:00",
  "customer_name": "Ada Lovelace",
  "TotalAmount": 1299.99,
  "shippingaddress": { "post_code": "3000" }
}`,
      ts: `{
  "id": "42",
  "createdAt": "2026-07-07T09:30:00.000Z",
  "customerName": "Ada Lovelace",
  "total": { "amount": 129999, "currency": "AUD" },
  "shippingAddress": { "postCode": "3000" }
}`,
      note:
        "Every mixed-case field forces client developers to check the docs (or guess). One convention — camelCase, documented — means they stop thinking about it.",
      leftLang: "json",
      rightLang: "json",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "First, watch the two raw-value traps fire: float money arithmetic and a 64-bit id passed through a JS number. Then serializeOrder produces the wire-safe shape. Predict the first three logged lines before running.",
    code: `// Trap 1: float money. Converting a float price to cents:
console.log("19.99 * 100 =", 19.99 * 100); // floats can't represent 19.99 exactly
console.log("0.1 + 0.2   =", 0.1 + 0.2);

// Trap 2: a 64-bit id as a JS number. 2^53 + 1 cannot survive:
const idAsNumber = 9007199254740993;
console.log("id as number:", idAsNumber, "(off by one!)");
console.log("MAX_SAFE_INTEGER:", Number.MAX_SAFE_INTEGER);

// The row as it comes from the data layer (driver configured to
// return BIGINT as string, money as integer cents):
interface OrderRow {
  id: string;
  created_at: Date;
  total_cents: number;
  currency: string;
  notes: string | null;
  internal_flags: number; // storage detail — must NOT reach the wire
}

const row: OrderRow = {
  id: "9007199254740993",
  created_at: new Date(Date.UTC(2026, 6, 7, 9, 30, 0)), // deterministic UTC
  total_cents: 129999,
  currency: "AUD",
  notes: null,
  internal_flags: 6,
};

// The serializer OWNS the contract: camelCase, ISO dates, money object,
// string id — and it decides what never leaves the server.
function serializeOrder(r: OrderRow) {
  return {
    id: r.id,                              // string: safe in every client
    createdAt: r.created_at.toISOString(), // ISO 8601, UTC, unambiguous
    total: { amount: r.total_cents, currency: r.currency },
    notes: r.notes,                        // null = "applies, but empty"
  };
}

console.log("wire JSON:");
console.log(JSON.stringify(serializeOrder(row), null, 2));

// The id round-trips intact because it stayed a string:
const parsed = JSON.parse(JSON.stringify(serializeOrder(row)));
console.log("round-tripped id:", parsed.id);`,
  },

  keyPoints: [
    "Return single resources bare; give collections an envelope (`{ data, meta }`) because pagination and totals need somewhere to live — you can't bolt `meta` onto a top-level array later.",
    "Pick one casing for JSON (camelCase is the pragmatic default for JS-heavy clients), document it, and convert from snake_case column names in the serializer — never mix.",
    "Dates on the wire are ISO 8601 UTC strings (`Date.prototype.toISOString()`); epoch integers invite the seconds-vs-milliseconds bug between PHP's `time()` and JS's `Date.now()`.",
    "Money is integer minor units or a decimal string plus a currency code — never a float; in IEEE 754, `19.99 * 100` is `1998.9999999999998` and `0.1 + 0.2` is `0.30000000000000004`.",
    "64-bit ids must be strings on the wire: JS numbers are exact only to 2^53 − 1, so BIGINT/Snowflake ids silently corrupt in `JSON.parse`.",
    "Define whether absence is `null` (applies, no value) or an omitted key (doesn't apply), and enforce the rule in one serializer, not per endpoint.",
  ],

  interview: [
    {
      q: "Would you wrap API responses in an envelope?",
      a: "For collections, always — the envelope (`{ data, meta }`) is where pagination, totals, and cursors live, and you can't retrofit metadata onto a bare top-level array without breaking every client that maps over the response. For single resources I return the object bare; a `data` wrapper around one object adds nesting without information. The interview-worthy point is that this isn't stylistic: it's about which shapes can evolve. An object can grow new optional keys compatibly; an array cannot grow anything.",
    },
    {
      q: "How do you represent money and dates in a JSON API, and why?",
      a: "Money: integer minor units plus an ISO currency code — `{ \"amount\": 129999, \"currency\": \"AUD\" }` — or a decimal string. Never floats, because IEEE 754 can't represent most decimal fractions; `19.99 * 100` evaluates to `1998.9999999999998`, and rounding errors in invoices are career-limiting. It's the same reason we used DECIMAL rather than FLOAT columns in MySQL. Dates: ISO 8601 strings in UTC, straight from `toISOString()`. Epoch integers are ambiguous — PHP counts seconds, JavaScript counts milliseconds — and ISO strings are human-readable in logs and parseable everywhere. Timezone conversion is the client's presentation concern.",
    },
    {
      q: "Why do many APIs send numeric ids as JSON strings?",
      a: "Because the biggest consumer of JSON is JavaScript, where all numbers are IEEE 754 doubles — exact only up to 2^53 − 1. A 64-bit BIGINT or Snowflake id above that threshold gets silently rounded by `JSON.parse`: `9007199254740993` becomes `...992`, and you now have two records that look like one. As a PHP developer on 64-bit builds I never hit this, which is exactly why it's a trap. Ids are opaque identifiers — nobody does arithmetic on them — so strings cost nothing and survive every client. Twitter's API made this famous by shipping `id_str` alongside `id` after real-world corruption.",
    },
  ],

  quiz: [
    {
      question:
        "GET /orders needs to return pagination info alongside the results. Which response shape is the deliberate choice?",
      options: [
        "A top-level JSON array, with pagination in custom X- headers only",
        "{ \"data\": [...], \"meta\": { \"page\": 1, \"total\": 143 } }",
        "A top-level array whose first element is the meta object",
        "{ \"orders\": [...], \"page\": 1, \"order_total\": 143 } — shape varies per endpoint",
      ],
      answerIndex: 1,
      explain:
        "Collections get a consistent envelope: data for the items, meta for pagination. Headers-only metadata is invisible to many client stacks and harder to evolve; a meta-as-first-element array corrupts the item list; per-endpoint shapes force clients to special-case every call.",
    },
    {
      question:
        "Why must a 64-bit database id be serialized as a JSON string rather than a number?",
      options: [
        "JSON's specification forbids integers larger than 32 bits",
        "Strings compress better in gzip responses",
        "JavaScript parses JSON numbers as IEEE 754 doubles, which are exact only up to 2^53 − 1, so larger ids get silently rounded",
        "Databases return BIGINT as strings and conversion would be slow",
      ],
      answerIndex: 2,
      explain:
        "JSON itself allows arbitrary-precision numbers — the problem is the consumer. JSON.parse in JavaScript produces doubles, so 9007199254740993 becomes 9007199254740992 with no error. Serializing ids as strings sidesteps the entire class of bug.",
    },
    {
      question:
        "Your API documents: 'fields that apply but are empty are null; fields that don't apply are omitted.' A physical order has no tracking number yet; a digital order can never have one. What does each response contain?",
      options: [
        "Both include \"trackingNumber\": null",
        "Both omit trackingNumber",
        "Physical: \"trackingNumber\": null; digital: trackingNumber omitted",
        "Physical: \"trackingNumber\": \"\"; digital: \"trackingNumber\": null",
      ],
      answerIndex: 2,
      explain:
        "The convention encodes two different facts: null says 'this field is part of this resource and currently has no value'; omission says 'this field does not apply here'. Clients can then distinguish 'not yet shipped' from 'will never ship' without extra flags — but only if the serializer applies the rule consistently.",
    },
  ],
};

export default lesson;
