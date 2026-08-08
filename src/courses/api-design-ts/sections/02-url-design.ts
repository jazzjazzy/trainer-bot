import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "url-design",
  title: "URL Design That Scales",
  part: "HTTP & Resource Design",
  estMinutes: 11,
  summary:
    "Concrete URL conventions — plural nouns, shallow nesting, path params for identity and query params for modification — that keep an API navigable at 200 endpoints, not just 5.",

  concept: `
URLs are the API's user interface for developers. Good ones are guessable:
having seen \`GET /products/{id}\`, a consumer can correctly guess
\`GET /customers/{id}\` without opening the docs. That guessability comes from
ruthless consistency, so pick these conventions once and enforce them.

### The house rules

- **Plural nouns for collections**: \`/orders\`, \`/orders/{id}\`. Mixing
  \`/order/{id}\` with \`/customers\` forces consumers to memorise exceptions.
- **No verbs**: the method is the verb. \`/orders/{id}/cancellation\` (a noun),
  never \`/cancelOrder\`.
- **kebab-case for multi-word segments**: \`/purchase-orders\`, not
  \`/purchaseOrders\` or \`/purchase_orders\`. URLs are case-sensitive
  everywhere except scheme and host, and kebab-case survives being lowercased.
- **No file extensions**: \`/orders.json\` bakes the representation into the
  identity. Use the \`Accept\` header for format negotiation.
- **Pick one trailing-slash policy** — conventionally none (\`/orders\`, not
  \`/orders/\`) — and redirect or normalise the other form. \`/orders\` and
  \`/orders/\` are different URLs to caches and some routers.

### Path params identify, query params modify

This is the line worth drawing precisely, because it settles most design
arguments:

- **Path** = *which resource*. If removing it changes what thing you're
  addressing, it's path: \`/orders/1042\`.
- **Query** = *how to present or filter it*. If removing it still addresses
  the same resource, just with defaults, it's query:
  \`/orders?status=shipped&sort=-created_at&page=2\`.

A filtered collection is still the same collection resource — so filters,
sorting, pagination, and search terms are query params. A specific order is a
different resource from the collection — so its ID is a path segment.

### Nesting: when the hierarchy helps and when it hurts

Nest when the child genuinely cannot exist outside the parent and you always
have the parent ID in hand: \`/customers/42/addresses\` is natural because an
address belongs to exactly one customer.

But nesting is a commitment. \`/customers/42/orders/1042/items/7\` means every
consumer must carry three IDs to address one line item, and if an order can
ever be re-parented or reached another way (admin views, search results, a
support tool holding just the order ID), the URL fights you. Practical rule:
**at most one level of nesting**, and give anything with its own identity a
top-level home too:

\`\`\`text
GET /customers/42/orders     → convenience view of a relationship
GET /orders?customer_id=42   → the same data, filter form
GET /orders/1042             → canonical home of an order
\`\`\`

The relationship endpoint and the filter endpoint can coexist; the canonical
top-level URL is the one other systems should store.

### IDs: opaque beats sequential

\`/orders/1\`, \`/orders/2\`, \`/orders/3\` leaks two things: your volume
(competitors can watch the counter — the classic "German tank problem") and an
enumeration attack surface — if authorization has a single gap, a for-loop
walks your whole table. Prefer opaque identifiers in URLs: **UUIDs** (random,
universally supported) or **ULIDs** (26-char, lexicographically sortable by
creation time, kinder to database indexes than random UUIDs). Sequential
integers are fine as internal primary keys; just don't make them the public
address. And treat public IDs as opaque strings in your types — \`string\`,
not \`number\` — so nobody is tempted to do arithmetic on them.
`,

  comparisons: [
    {
      label: "Front-controller query strings vs hierarchical routes",
      intro:
        "A catalogue API surface expressed the classic PHP front-controller way, then as guessable hierarchical URLs. Same operations; only one of them can be read as a map of the system.",
      php: `<?php
// index.php — everything is ?action=...
$action = $_GET['action'] ?? 'list';

switch ($action) {
  case 'view':        // ?action=view&id=42
    echo json_encode(get_product((int) $_GET['id']));
    break;
  case 'byCategory':  // ?action=byCategory&cat=7&p=2
    echo json_encode(products_in_category(
      (int) $_GET['cat'], (int) ($_GET['p'] ?? 1)
    ));
    break;
  case 'reviewsFor':  // ?action=reviewsFor&pid=42
    echo json_encode(reviews_for((int) $_GET['pid']));
    break;
}
// id, cat, pid, p — four private parameter names,
// zero structure a client could guess.`,
      ts: `// routes.ts — identity in the path, modification in the query
const routes = [
  // which thing:
  { method: "GET", path: "/products/{productId}" },
  { method: "GET", path: "/products/{productId}/reviews" },

  // same collection, presented differently:
  { method: "GET", path: "/products?category=7&page=2" },
  { method: "GET", path: "/products?sort=-price&in-stock=true" },
] as const;

// Having seen /products/{id}/reviews, a consumer can
// guess /customers/{id}/orders without reading docs.`,
      note: "The front controller hides structure inside parameter values; hierarchical URLs make the structure the address. Note the split: {productId} identifies, ?category= and ?page= modify the same collection resource.",
    },
    {
      label: "Deep nesting vs flat-with-filter",
      intro:
        "Two ways to let a client fetch order line items. The deeply nested version encodes the whole ownership chain into every URL; the flat version gives items a canonical home and expresses the relationship as a filter.",
      php: `// Deep nesting: 3 IDs to address one line item
// GET /customers/42/orders/1042/items/7

app.get(
  "/customers/:customerId/orders/:orderId/items/:itemId",
  (req, res) => {
    // Every caller must know customerId AND orderId,
    // even a support tool that only has the item ID.
    // Move the order to another account and this
    // URL — stored in logs, emails, other services —
    // silently breaks.
  },
);`,
      ts: `// Shallow + filter: one level max, canonical homes
// GET /orders/1042/items        (relationship view)
// GET /order-items/7            (canonical home)
// GET /order-items?order_id=1042  (filter form)

app.get("/orders/:orderId/items", listItemsForOrder);
app.get("/order-items/:itemId", getItem);
app.get("/order-items", listItems); // ?order_id= filter

// Anything with its own identity gets a top-level
// URL; nesting is a convenience view, never the
// only address.`,
      note: "Nesting to ~2 path levels max. Deep chains force every consumer to carry ancestor IDs and couple URLs to an ownership structure that may change; the flat form keeps one stable canonical URL per thing.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Sequential integers vs opaque IDs on the wire",
      intro:
        "What an outsider learns from your URLs. Left: a curious user increments an integer. Right: the same probe against ULIDs. Predict what each attacker walks away with.",
      php: `# Sequential IDs: the URL space is a countable set
$ curl -s https://api.shop.test/orders/1041 -H 'Authorization: Bearer eyJ...'
{"id":1041,"customer":"someone-else","total":89.00}   # BOLA gap: not my order!

$ curl -s https://api.shop.test/orders/1042 -H 'Authorization: Bearer eyJ...'
{"id":1042,"customer":"me","total":12.50}

# Monday's max ID 1042, Friday's 1198 →
# competitor now knows you do ~30 orders/day.`,
      ts: `# Opaque ULIDs: nothing to increment, nothing to count
$ curl -s https://api.shop.test/orders/01J1YW3TF4R9GX2M8Q4VZ7KDNC \\
    -H 'Authorization: Bearer eyJ...'
{"id":"01J1YW3TF4R9GX2M8Q4VZ7KDNC","customer":"me","total":12.50}

$ curl -s https://api.shop.test/orders/01J1YW3TF4R9GX2M8Q4VZ7KDNB \\
    -H 'Authorization: Bearer eyJ...'
{"type":"about:blank","title":"Not Found","status":404}

# Guessing a neighbour yields nothing; volume stays private.`,
      note: "Opaque IDs are defence in depth, not a substitute for per-object authorization (that's OWASP API1, Broken Object Level Authorization) — but they turn 'for ($i=1; ...)' from a data breach into noise.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A tiny URL builder and parser over the template /shops/{shopId}/products/{productId}. Predict all five logged lines — especially what happens when a param is missing at build time and when a path doesn't fit the template at parse time.",
    code: `// Path templates as data: build URLs safely, parse typed params back out.

const TEMPLATE = "/shops/{shopId}/products/{productId}";

function buildUrl(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\\{(\\w+)\\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(\`missing path param: \${name}\`);
    }
    return encodeURIComponent(String(value));
  });
}

function parseUrl(
  template: string,
  path: string,
): Record<string, string> | null {
  const tSegs = template.split("/").filter(Boolean);
  const pSegs = path.split("/").filter(Boolean);
  if (tSegs.length !== pSegs.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < tSegs.length; i++) {
    const seg = tSegs[i];
    if (seg.startsWith("{") && seg.endsWith("}")) {
      params[seg.slice(1, -1)] = decodeURIComponent(pSegs[i]);
    } else if (seg !== pSegs[i]) {
      return null; // literal segment mismatch
    }
  }
  return params;
}

// 1) Building with opaque IDs — note the encoding of unsafe chars
console.log(buildUrl(TEMPLATE, { shopId: "berlin-2", productId: "sku 9/A" }));

// 2) Round trip: parse what we build
const parsed = parseUrl(TEMPLATE, "/shops/berlin-2/products/01J1YW3T9GX2");
console.log("parsed:", JSON.stringify(parsed));

// 3) Wrong shape: too few segments
console.log("short path:", parseUrl(TEMPLATE, "/shops/berlin-2"));

// 4) Wrong shape: right length, wrong literal segment
console.log("wrong literal:", parseUrl(TEMPLATE, "/shops/berlin-2/reviews/9"));

// 5) Building with a missing param fails LOUDLY, not with /undefined
try {
  buildUrl(TEMPLATE, { shopId: "berlin-2" });
} catch (e) {
  console.log("build error:", (e as Error).message);
}

// Try it: change TEMPLATE to nest one level deeper and see how
// every call site suddenly needs a third ID — nesting is a tax.`,
  },

  keyPoints: [
    "Plural nouns, kebab-case, no verbs, no file extensions, one trailing-slash policy — consistency is what makes URLs guessable.",
    "Path params identify (*which* resource); query params modify (*how* it's filtered, sorted, paginated). A filtered collection is still the same resource.",
    "Nest at most ~1-2 levels, and only when the child can't exist outside the parent; deep chains force every consumer to carry ancestor IDs.",
    "Anything with its own identity deserves a canonical top-level URL (`/orders/1042`); nested paths (`/customers/42/orders`) are convenience relationship views, and `/orders?customer_id=42` is the equivalent filter form.",
    "Public IDs should be opaque — UUID or ULID (sortable, index-friendly) — because sequential integers leak business volume and invite enumeration; type them as `string`.",
    "Opaque IDs are defence in depth on top of per-object authorization checks (OWASP API1: BOLA), never a replacement for them.",
  ],

  interview: [
    {
      q: "How do you decide whether something belongs in the URL path or the query string?",
      a: "Path parameters establish identity — which resource I'm addressing — and query parameters modify the view of it: filtering, sorting, pagination, search. My test is: if I remove the parameter and I'm now talking about a *different thing*, it's path; if I'm talking about the *same thing with defaults*, it's query. So `/orders/1042` puts the ID in the path, but `/orders?status=shipped&page=2` keeps status and page in the query because a filtered order collection is still the orders collection. This also has a practical payoff: the path defines the resource for routing, logging, and metrics, while query variations can share cache and rate-limit rules.",
    },
    {
      q: "When would you nest resources in a URL, and where's the limit?",
      a: "I nest one level when the child is existentially dependent on the parent and callers naturally hold the parent ID — `/customers/42/addresses` is fine because an address belongs to exactly one customer. I cap it there. Beyond that, every consumer has to carry a chain of ancestor IDs to address one thing, and the URL hard-codes an ownership structure that can change. My pattern is: give anything with its own identity a canonical top-level URL like `/orders/1042`, offer `/customers/42/orders` as a relationship view if it's genuinely useful, and note that `/orders?customer_id=42` expresses the same relationship as a filter. The canonical URL is the one other systems should persist.",
    },
    {
      q: "Sequential integer IDs vs UUIDs in public URLs — what's the trade-off?",
      a: "Sequential integers leak information twice over: the counter reveals business volume over time, and the URL space becomes enumerable — if any endpoint has an object-level authorization gap (OWASP API1, BOLA), a trivial loop exfiltrates the whole table. So publicly I expose opaque IDs: UUIDv4 when randomness is all I need, or ULIDs when I want creation-time sortability and better index locality, since fully random keys scatter B-tree inserts. The cost is losing human-friendly short IDs and a few bytes per key. I'd also stress that opaque IDs are defence in depth — the real fix for enumeration is checking ownership on every object access, and unguessable IDs just lower the blast radius.",
    },
  ],

  quiz: [
    {
      question:
        "Which URL best fits the conventions for 'search shipped orders, newest first, second page'?",
      options: [
        "GET /getShippedOrders?page=2",
        "GET /orders/shipped/newest/2",
        "GET /orders?status=shipped&sort=-created_at&page=2",
        "POST /orders/search with a JSON body of filters",
      ],
      answerIndex: 2,
      explain:
        "Filtering, sorting, and pagination modify the presentation of the same collection resource, so they belong in the query string. Option 1 puts a verb in the URL, option 2 promotes view-modifiers into identity segments, and option 4 makes a safe, cacheable read into an unsafe-looking POST (defensible only for huge filter payloads).",
    },
    {
      question:
        "Your team proposes /customers/{cid}/orders/{oid}/items/{iid} as the only way to address a line item. What's the strongest objection?",
      options: [
        "URLs that long exceed browser limits",
        "Every consumer must know three IDs to address one item, and the URL breaks if the ownership chain ever changes — items need a canonical, shallower home",
        "REST forbids more than one path parameter per URL",
        "Query strings are faster to parse than path segments",
      ],
      answerIndex: 1,
      explain:
        "Deep nesting taxes every caller with ancestor IDs and couples addresses to an ownership hierarchy. The fix is a canonical top-level (or one-level) home like /order-items/{iid}, keeping /orders/{oid}/items as an optional relationship view. REST has no param-count rule, and length/parse-speed aren't the real issue.",
    },
    {
      question: "Why prefer ULIDs or UUIDs over auto-increment integers in public URLs?",
      options: [
        "They make per-object authorization checks unnecessary",
        "They compress better over HTTP/2",
        "Databases cannot index integers efficiently",
        "They prevent enumeration of the ID space and stop the counter from leaking business volume",
      ],
      answerIndex: 3,
      explain:
        "Sequential IDs let outsiders walk your keyspace (catastrophic combined with a BOLA gap) and infer order volume from counter growth. Opaque IDs remove both signals — but they're defence in depth: you still must authorize every object access. ULIDs additionally sort by creation time, which keeps inserts index-friendly.",
    },
  ],
};

export default lesson;
