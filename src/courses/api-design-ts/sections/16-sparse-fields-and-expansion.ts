import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "sparse-fields-and-expansion",
  title: "Sparse Fields & Expansion",
  part: "Collections & Evolution",
  estMinutes: 12,
  summary:
    "Field selection (?fields=id,name) and relationship expansion (?expand=customer) let one endpoint serve many screens — without cloning endpoints or adopting GraphQL.",

  concept: `
Every API eventually hits the same tension: the mobile list screen needs three
fields per order, the admin detail screen needs everything *plus* the customer
record, and the CSV export needs something in between. The quick-and-dirty PHP
answer is to clone the script — \`getOrders.php\`, \`getOrdersLite.php\`,
\`getOrdersWithCustomer.php\` — and within a year you're maintaining five
near-identical endpoints that drift apart. The deliberate answer is to keep
**one** endpoint and let clients shape the response with two well-known query
parameters.

### Sparse fieldsets: \`?fields=\`

Field selection lets the client name exactly the attributes it wants:

\`\`\`bash
GET /orders?fields=id,total,status
\`\`\`

Google's APIs call this *partial response*; JSON:API standardises it as
*sparse fieldsets* with a per-type syntax (\`?fields[orders]=id,total\`). The
mechanics are the same: parse the comma list, **validate every name against a
whitelist of real fields** (an unknown field is a \`400\`, not a silent skip —
otherwise a typo like \`fields=totla\` "works" and returns nothing), then pick
those keys from each item before serialising.

The payoff is real: a 40-field order row shrinks to three fields, which
matters at 100 items per page over mobile networks — and it removes the
pressure to fork a bespoke endpoint per screen.

### Expansion: \`?expand=\`

By default a relationship is just a foreign key: \`"customerId": "cus_9"\`.
Expansion — popularised by Stripe's \`?expand[]=customer\` — lets the client
ask for the related object to be embedded in place of (or alongside) the id:

\`\`\`bash
GET /orders?expand=customer
\`\`\`

Now each order carries a full \`customer\` object and the client avoids N
follow-up requests. Two rules keep this safe:

- **Batch the lookups.** Expanding \`customer\` on a page of 100 orders must
  not run 100 queries. Collect the distinct ids and resolve them in one
  \`WHERE id IN (...)\` — the classic N+1 trap, same as lazy-loading relations
  in an ORM.
- **Cap the depth.** \`expand=customer.company.owner\` is a join graph the
  client is composing for you. Stripe caps expansion at four levels; most APIs
  are fine allowing one or two. Validate the requested paths against an
  explicit allowlist, exactly like fields.

### The honest costs

Response shaping is not free, and interviewers like hearing you name the
downsides:

- **Caching fragments.** The cache key is the full URL, so
  \`?fields=id,total\` and \`?fields=total,id\` are different cache entries for
  the same data. Normalise the parameter (sort the field list) before caching,
  and accept a lower hit rate than a fixed-shape endpoint.
- **Typing partial responses is work.** If the handler returns
  \`Pick<Order, "id" | "total">\` for one request and the full \`Order\` for
  another, no single static type describes the response. In practice you type
  the *full* shape and treat sparse responses as \`Partial<Order>\` on the
  client, or generate per-screen types — TS mapped types (\`Pick\`,
  \`Partial\`) express it, but the runtime shape is decided per request.

These two parameters are the pragmatic middle ground: they solve 90% of the
over-fetching problem GraphQL solves, with none of the new query language,
schema layer, or caching rewrite. If clients genuinely need arbitrary nested
queries, that's the point where GraphQL earns its complexity — say that in an
interview and you sound like someone who has weighed it.
`,

  comparisons: [
    {
      label: "One endpoint per screen vs one shaped endpoint",
      intro:
        "The mobile app wants a light order list and the admin wants orders with the customer embedded. One codebase clones the script per screen; the other validates fields/expand params on a single endpoint.",
      php: `<?php // getOrdersLite.php — cloned from getOrders.php last sprint
$rows = $pdo->query('SELECT id, total, status FROM orders')
            ->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($rows);

// Meanwhile in getOrdersWithCustomer.php (also cloned):
// same query + a customer lookup INSIDE the loop.
// Three files now disagree about what an "order" is.`,
      ts: `// src/routes/orders.ts — one endpoint, shaped by query params
const ALLOWED_FIELDS = new Set(["id", "total", "status", "customerId"]);
const ALLOWED_EXPAND = new Set(["customer"]);

app.get("/orders", async (req, res) => {
  const fields = parseCsv(req.query.fields);   // string[] | undefined
  const expand = parseCsv(req.query.expand);

  const badField = fields?.find((f) => !ALLOWED_FIELDS.has(f));
  const badExpand = expand?.find((e) => !ALLOWED_EXPAND.has(e));
  if (badField || badExpand) {
    return res.status(400).json(problem(400,
      \`Unknown parameter value: \${badField ?? badExpand}\`));
  }

  let orders = await listOrders();
  if (expand?.includes("customer")) orders = await embedCustomers(orders);
  res.json({ data: orders.map((o) => pickFields(o, fields)) });
});`,
      note:
        "The TS version rejects unknown field/expand names with a 400 instead of silently ignoring them — a typo becomes a client bug report, not months of a screen quietly rendering blanks.",
    },
    {
      label: "Over-fetched vs sparse payload",
      intro:
        "The same order, as returned by the default full representation and by ?fields=id,total,status. The list screen renders three values either way — one response just ships 10x the bytes to do it.",
      php: `{
  "id": "ord_1042",
  "total": 8600,
  "status": "shipped",
  "currency": "AUD",
  "customerId": "cus_9",
  "shippingAddress": {
    "line1": "12 Harbour St",
    "city": "Sydney",
    "postcode": "2000",
    "country": "AU"
  },
  "lineItems": [
    { "sku": "TSHIRT-L", "qty": 2, "unitPrice": 2500 },
    { "sku": "MUG-01", "qty": 3, "unitPrice": 1200 }
  ],
  "internalNotes": "repeat buyer",
  "createdAt": "2026-06-30T02:14:00Z",
  "updatedAt": "2026-07-01T09:41:00Z"
}`,
      ts: `{
  "id": "ord_1042",
  "total": 8600,
  "status": "shipped"
}`,
      note:
        "Multiply the difference by 100 items per page and it decides whether the list screen feels instant on a phone — and the full payload was also leaking internalNotes to a client that never needed it.",
      leftLang: "json",
      rightLang: "json",
    },
    {
      label: "Expansion done naively vs batched",
      intro:
        "Both versions embed the customer into a page of 100 orders. Watch the query count: one runs a lookup per order, the other collects ids and resolves them in a single round trip.",
      php: `-- N+1: one query for the page, then one per row
SELECT id, total, status, customer_id FROM orders LIMIT 100;

SELECT * FROM customers WHERE id = 'cus_9';   -- row 1
SELECT * FROM customers WHERE id = 'cus_14';  -- row 2
SELECT * FROM customers WHERE id = 'cus_9';   -- row 3 (again!)
-- ... 97 more queries`,
      ts: `-- Batched: two queries total, regardless of page size
SELECT id, total, status, customer_id FROM orders LIMIT 100;

SELECT * FROM customers
WHERE id IN ('cus_9', 'cus_14', 'cus_31', /* distinct ids only */ ...);`,
      note:
        "?expand= is an invitation for clients to trigger joins — resolve distinct ids in one IN query (or a JOIN) or a 100-row page costs 101 round trips.",
      leftLang: "sql",
      rightLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature shaping pipeline: applyExpand embeds customers (via one batched lookup), applyFields picks the requested keys. Predict what each of the three query combinations returns, then run it.",
    code: `// One dataset, three differently-shaped responses.
interface Customer { id: string; name: string; email: string }
type Order = {
  id: string; total: number; status: string; customerId: string;
  internalNotes: string;
};

const customers: Customer[] = [
  { id: "cus_9", name: "Mei Tanaka", email: "mei@example.com" },
  { id: "cus_14", name: "Owen Ellis", email: "owen@example.com" },
];
const orders: Order[] = [
  { id: "ord_1", total: 8600, status: "shipped", customerId: "cus_9",
    internalNotes: "repeat buyer" },
  { id: "ord_2", total: 1200, status: "pending", customerId: "cus_14",
    internalNotes: "first order" },
  { id: "ord_3", total: 4300, status: "shipped", customerId: "cus_9",
    internalNotes: "gift wrap" },
];

// Expansion: swap customerId for the embedded object — ONE batched lookup.
function applyExpand(rows: Order[], expand: string[]) {
  if (!expand.includes("customer")) return rows;
  const ids = [...new Set(rows.map((o) => o.customerId))];
  console.log(\`  (batched lookup for \${ids.length} distinct customers)\`);
  const byId = new Map(
    customers.filter((c) => ids.includes(c.id)).map((c) => [c.id, c]),
  );
  return rows.map(({ customerId, ...rest }) => ({
    ...rest,
    customer: byId.get(customerId),
  }));
}

// Sparse fields: whitelist-validated pick. Unknown name => reject.
const ALLOWED = new Set([
  "id", "total", "status", "customerId", "customer",
]);
function applyFields(rows: Record<string, unknown>[], fields?: string[]) {
  if (!fields) return rows;
  const bad = fields.find((f) => !ALLOWED.has(f));
  if (bad) throw new Error(\`400: unknown field "\${bad}"\`);
  return rows.map((row) =>
    Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]])),
  );
}

function handle(query: { fields?: string; expand?: string }) {
  const fields = query.fields?.split(",");
  const expand = query.expand?.split(",") ?? [];
  const shaped = applyFields(applyExpand(orders, expand), fields);
  console.log(JSON.stringify(shaped, null, 1));
}

console.log("A) GET /orders  (default shape — note internalNotes leaks)");
handle({});

console.log("B) GET /orders?fields=id,total,status  (list screen)");
handle({ fields: "id,total,status" });

console.log("C) GET /orders?fields=id,total,customer&expand=customer");
handle({ fields: "id,total,customer", expand: "customer" });

// Try it: request fields=totla and watch the whitelist catch the typo.`,
  },

  keyPoints: [
    "`?fields=id,total,status` (sparse fieldsets / partial response) lets one endpoint serve the list screen, the detail screen, and the export — instead of cloning `getOrdersLite.php` per screen.",
    "`?expand=customer` (Stripe-style expansion) embeds a related object in place of its foreign key, saving the client N follow-up requests.",
    "Validate `fields` and `expand` values against an explicit whitelist and return 400 for unknown names — silently ignoring a typo hides bugs for months.",
    "Expansion is an N+1 trap: resolve distinct related ids with one `WHERE id IN (...)` query, and cap expansion depth (Stripe allows four levels; one or two is plenty).",
    "Be honest about the costs: caching fragments because the response varies by shape (normalise/sort the field list in the cache key), and no single static TS type describes a per-request shape — think `Pick`/`Partial<Order>`.",
    "These two params solve most over-fetching without GraphQL; reach for GraphQL only when clients truly need arbitrary nested queries.",
  ],

  interview: [
    {
      q: "How would you let API clients control the shape of a response without adopting GraphQL?",
      a: "Two query parameters cover most of it. Sparse fieldsets — `?fields=id,total,status` — let the client name the attributes it wants; I validate each name against a whitelist and 400 on anything unknown so typos fail loudly. Relationship expansion — `?expand=customer`, Stripe's pattern — embeds a related object in place of its foreign key so the client avoids N follow-up calls. Together they remove the pressure to fork bespoke endpoints per screen, which is what quick-and-dirty codebases end up doing. I'd only consider GraphQL if clients genuinely need arbitrary nested queries, because it brings a whole schema layer and a caching model change with it.",
    },
    {
      q: "What's the performance risk with ?expand= and how do you mitigate it?",
      a: "It's the N+1 problem wearing an API hat: expanding `customer` across a 100-row page must not trigger 100 individual lookups. I collect the distinct foreign keys from the page and resolve them in a single `WHERE id IN (...)` query — two round trips total regardless of page size — then stitch the objects in memory. I also cap expansion depth and validate expand paths against an allowlist, because `expand=customer.company.owner` is the client composing a join graph on my database. Stripe caps at four levels; for most APIs one or two is enough.",
    },
    {
      q: "What are the downsides of field selection and expansion? Anything they make harder?",
      a: "Two honest costs. First, caching: the response now varies by requested shape, and since the cache key is the URL, `?fields=id,total` and `?fields=total,id` are separate entries for identical data — I normalise by sorting the field list, but the hit rate still fragments compared to a fixed-shape endpoint. Second, typing: in TypeScript a handler that returns `Pick<Order, ...>` for one request and the full `Order` for another has no single accurate response type, so clients usually model sparse responses as `Partial<Order>` or generate per-screen types. Neither cost is fatal, but naming them shows you've shipped this, not just read about it.",
    },
  ],

  quiz: [
    {
      question:
        "A client sends ?fields=id,totla,status (note the typo). What should a well-designed API do?",
      options: [
        "Ignore the unknown name and return id and status",
        "Return 400 with an error naming the unknown field",
        "Return the full representation since the field list is invalid",
        "Return 404 because the resource shape doesn't exist",
      ],
      answerIndex: 1,
      explain:
        "Field names must be validated against a whitelist of real fields. Silently skipping the typo means the client's screen renders a blank where total should be — and nobody finds out for months. A 400 naming the bad value turns the typo into an immediate, fixable bug report.",
    },
    {
      question:
        "Expanding ?expand=customer on a page of 100 orders — what's the correct query pattern?",
      options: [
        "One customer query per order inside the serialisation loop",
        "A single query for the distinct customer ids using WHERE id IN (...)",
        "Pre-join customers into every orders query whether expansion was requested or not",
        "Cache each customer individually so per-row queries are cheap",
      ],
      answerIndex: 1,
      explain:
        "Per-row lookups are the classic N+1: 101 round trips for one page. Collecting the distinct ids and resolving them in one IN query (or a JOIN) keeps it at two queries regardless of page size. Always-joining wastes work when expansion wasn't requested.",
    },
    {
      question: "Why does response shaping make HTTP caching less effective?",
      options: [
        "Shaped responses can't carry Cache-Control headers",
        "Caches refuse to store responses that vary by query string",
        "The cache key includes the full URL, so every distinct fields/expand combination is a separate cache entry for the same data",
        "Sparse responses are too small to be worth caching",
      ],
      answerIndex: 2,
      explain:
        "Caches key on the full URL including the query string, so ?fields=id,total and ?fields=total,id cache separately even though the data is identical. Normalising the parameter (sorting the field list) helps, but hit rates still fragment compared to one fixed shape — a trade-off worth naming out loud.",
    },
  ],
};

export default lesson;
