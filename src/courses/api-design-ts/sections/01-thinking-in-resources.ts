import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "thinking-in-resources",
  title: "Thinking in Resources",
  part: "HTTP & Resource Design",
  estMinutes: 12,
  summary:
    "Stop designing a script per action and start designing nouns: resources addressed by URLs, manipulated through HTTP's small fixed verb set.",

  concept: `
Twenty years of PHP builds a specific reflex: a new requirement means a new
script. \`getUser.php\`, \`saveOrder.php\`, \`doCancelOrder.php\`,
\`fetchOrdersForCustomer2.php\`. Each file invents its own parameter names, its
own response shape, its own error convention. The API's "surface" is whatever
happens to be in the directory. Nobody can enumerate it, and every consumer
has to learn each endpoint individually.

REST's core move is to flip that: instead of an open-ended set of verbs
(functions), you design a set of **nouns** (resources) and manipulate all of
them through the **same small, fixed set of verbs** — HTTP's methods. That's
the *uniform interface*, and it's the single most interview-quotable idea in
API design.

### Resources and representations

- A **resource** is a concept your system exposes: an order, a customer, the
  collection of a customer's orders. Each gets a stable URL — its identity.
- A **representation** is what actually travels over the wire — usually a JSON
  document describing the resource's current state. The resource is the thing;
  the JSON is a *picture* of the thing at a moment in time.

Once you think this way, the endpoint list designs itself:

\`\`\`text
GET    /orders          → list the collection
POST   /orders          → add one to the collection
GET    /orders/1042     → one order's representation
PATCH  /orders/1042     → change part of it
DELETE /orders/1042     → remove it
\`\`\`

Five operations, zero new vocabulary. A consumer who has used one of your
resources already knows how to use all of them.

### The hard part: actions that don't look like nouns

"Cancel an order", "publish an article", "retry a payment" — these *feel* like
verbs, and the PHP reflex is \`POST /cancelOrder.php?id=1042\`. Resist it.
Two idiomatic modellings:

1. **State transition on the resource itself.** Cancellation is really a
   status change, so: \`PATCH /orders/1042\` with body
   \`{ "status": "cancelled" }\`. Clean when the action is a simple field flip.
2. **A sub-resource that reifies the action.** Model the *cancellation* as a
   thing that gets created: \`POST /orders/1042/cancellation\` with a body like
   \`{ "reason": "customer_request" }\`. This wins when the action has its own
   data (reason, timestamp, actor), can fail with its own rules, or needs to be
   retrievable later (\`GET /orders/1042/cancellation\`).

Either is defensible in an interview; naming a verb in the URL is not. The
question to ask out loud: *"what noun does this action create or change?"*

### Richardson Maturity Model (interview vocabulary)

Leonard Richardson's model grades how "RESTful" an API is:

- **Level 0** — one URL, one method, everything tunnelled through POST bodies
  (classic RPC / SOAP-over-HTTP; also \`api.php?action=...\`).
- **Level 1** — distinct URLs per resource, but methods still wrong.
- **Level 2** — resources + proper HTTP verbs + proper status codes. **This is
  where almost every good production API lives.**
- **Level 3** — hypermedia controls (HATEOAS): responses embed links telling
  the client what it can do next.

Be ready to say why level 3 is rare in practice: most APIs are consumed by
code written against published documentation (OpenAPI), not by generic clients
that discover actions from links — so the hypermedia machinery adds payload
and complexity that nothing consumes. Knowing the model *and* its practical
ceiling reads as senior.
`,

  comparisons: [
    {
      label: "A directory of scripts vs a route table",
      intro:
        "The same order-management surface twice. The PHP version is four files, each with private conventions; the TS version is one declarative table over two resources.",
      php: `// getOrder.php
$id = $_GET['order_id'];        // this one says order_id
echo json_encode(get_order($id));

// listOrders.php
$cust = $_GET['cid'];           // this one says cid
echo json_encode(find_orders($cust));

// saveOrder.php — create OR update, you have to read it to know
$data = $_POST;
echo json_encode(['ok' => save_order($data)]);

// doCancelOrder.php — a verb, tunnelled through GET!
cancel_order($_GET['id']);
echo 'cancelled';`,
      ts: `// routes.ts — the whole surface, enumerable at a glance
const routes = [
  { method: "GET",    path: "/orders",                   op: "listOrders" },
  { method: "POST",   path: "/orders",                   op: "createOrder" },
  { method: "GET",    path: "/orders/{id}",              op: "getOrder" },
  { method: "PATCH",  path: "/orders/{id}",              op: "updateOrder" },
  { method: "POST",   path: "/orders/{id}/cancellation", op: "cancelOrder" },
] as const;

// One param convention ({id}), one response convention,
// and "cancel" is a sub-resource — not a verb in the URL.`,
      note: "The scripts each invent parameter names and response shapes; the route table makes the API a designed, reviewable artifact — and it's exactly the shape an OpenAPI document formalises later.",
    },
    {
      label: "Modelling 'cancel' as a state transition or a sub-resource",
      intro:
        "Two legitimate resource-oriented ways to model order cancellation. Left: cancellation as a status change. Right: cancellation as a created thing with its own data.",
      php: `// Option A: state transition on the order itself
// PATCH /orders/1042
// { "status": "cancelled" }

app.patch("/orders/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).end();
  if (order.status === "shipped") {
    return res.status(409).json({
      detail: "Shipped orders cannot be cancelled",
    });
  }
  order.status = "cancelled";
  res.status(200).json(order);
});`,
      ts: `// Option B: the cancellation is a sub-resource
// POST /orders/1042/cancellation
// { "reason": "customer_request" }

app.post("/orders/:id/cancellation", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).end();
  const cancellation = {
    orderId: order.id,
    reason: req.body.reason,
    cancelledAt: new Date().toISOString(),
  };
  order.status = "cancelled";
  res.status(201)
    .location(\`/orders/\${order.id}/cancellation\`)
    .json(cancellation);
});`,
      note: "Prefer the sub-resource when the action carries its own data (reason, actor, timestamp) or needs to be fetched later; prefer the plain state transition when it's a bare field flip. Both beat POST /cancelOrder.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "RPC-style call vs resource-style call on the wire",
      intro:
        "The same 'cancel order 1042' request as HTTP traffic. Predict which one a cache, a proxy, or a new team member can understand without reading server code.",
      php: `# Level 0-1: the URL names a procedure, the method lies
$ curl 'https://api.example.com/api.php?action=cancelOrder&id=1042'
HTTP/1.1 200 OK
Content-Type: text/html

cancelled

# GET with a side effect: a prefetcher or link checker
# that touches this URL cancels a real order.`,
      ts: `# Level 2: the URL names a thing, the method says the intent
$ curl -X POST https://api.example.com/orders/1042/cancellation \\
    -H 'Content-Type: application/json' \\
    -d '{"reason":"customer_request"}'
HTTP/1.1 201 Created
Location: /orders/1042/cancellation
Content-Type: application/json

{"orderId":"1042","reason":"customer_request","cancelledAt":"2026-07-07T09:14:03Z"}`,
      note: "Method + URL + status code carry the semantics, so infrastructure (caches, retries, monitoring) and humans can reason about the traffic without the source code. GET-with-side-effects is the classic level-0 hazard.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature router: the API surface is a data table of resource operations, and one generic matcher maps any (method, path) pair onto it. Predict which handler each of the five requests hits — including the one that 404s — then run it.",
    code: `// The uniform interface in ~40 lines: nouns in a table,
// verbs from HTTP, one matcher for everything.

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Route {
  method: Method;
  template: string; // "{id}" segments are parameters
  handler: string;
}

const routes: Route[] = [
  { method: "GET",   template: "/orders",                   handler: "listOrders" },
  { method: "POST",  template: "/orders",                   handler: "createOrder" },
  { method: "GET",   template: "/orders/{id}",              handler: "getOrder" },
  { method: "PATCH", template: "/orders/{id}",              handler: "updateOrder" },
  { method: "POST",  template: "/orders/{id}/cancellation", handler: "cancelOrder" },
];

function match(
  method: Method,
  path: string,
): { handler: string; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const tSegs = route.template.split("/").filter(Boolean);
    const pSegs = path.split("/").filter(Boolean);
    if (tSegs.length !== pSegs.length) continue;

    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < tSegs.length; i++) {
      const seg = tSegs[i];
      if (seg.startsWith("{") && seg.endsWith("}")) {
        params[seg.slice(1, -1)] = pSegs[i];
      } else if (seg !== pSegs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler: route.handler, params };
  }
  return null;
}

const traffic: Array<[Method, string]> = [
  ["GET", "/orders"],
  ["POST", "/orders"],
  ["GET", "/orders/1042"],
  ["POST", "/orders/1042/cancellation"],
  ["DELETE", "/orders/1042/cancellation"], // not in the table — by design
];

for (const [method, path] of traffic) {
  const hit = match(method, path);
  if (hit) {
    const p = Object.entries(hit.params)
      .map(([k, v]) => \`\${k}=\${v}\`)
      .join(", ");
    console.log(\`\${method} \${path} -> \${hit.handler}\${p ? \` (\${p})\` : ""}\`);
  } else {
    console.log(\`\${method} \${path} -> 404 (no such operation)\`);
  }
}

// Try it: add { method: "DELETE", template: "/orders/{id}", ... }
// and watch the last request stay a 404 — un-cancelling isn't
// deleting the cancellation record.`,
  },

  keyPoints: [
    "REST's uniform interface: design an open-ended set of nouns (resources) and manipulate them all with HTTP's small fixed verb set — the opposite of one-script-per-action.",
    "A resource is the concept with a stable URL; a representation is the JSON snapshot of it that travels over the wire.",
    "Model verb-like actions as either a state transition (`PATCH /orders/1042` with `{ \"status\": \"cancelled\" }`) or a sub-resource (`POST /orders/1042/cancellation`) — never as a verb in the URL.",
    "Choose the sub-resource form when the action has its own data (reason, actor, timestamp) or needs to be retrievable afterwards.",
    "Richardson Maturity Model: level 0 = tunnelled RPC, level 1 = resources, level 2 = resources + correct verbs + correct status codes, level 3 = hypermedia (HATEOAS).",
    "Level 2 is the practical industry standard; level 3 is rarely worth it because clients are built against published contracts (OpenAPI), not link discovery.",
  ],

  interview: [
    {
      q: "What does 'resource-oriented' API design mean, and how is it different from RPC?",
      a: "RPC exposes an open-ended list of procedures — every new capability is a new verb the client must learn, like my old `doCancelOrder.php` scripts. Resource-oriented design inverts that: I expose nouns with stable URLs and manipulate every one of them through the same fixed verb set — GET, POST, PUT, PATCH, DELETE. That uniform interface means the semantics live in the method and status code, so caches, proxies, retry logic, and new developers can all reason about traffic generically. The design work shifts from 'naming functions' to 'choosing the right nouns', which is harder up front but scales across a whole API surface.",
    },
    {
      q: "How would you model an operation like 'publish an article' RESTfully?",
      a: "First I'd ask what noun the action creates or changes. If publishing is just a status flip, it's a state transition: `PATCH /articles/123` with `{ \"status\": \"published\" }`. If it carries its own data — who published, when, to which channels — I'd reify it as a sub-resource: `POST /articles/123/publication`, returning 201 with the publication record, which also gives me `GET /articles/123/publication` for free later. What I'd avoid is `POST /publishArticle?id=123`: a verb in the URL bypasses the uniform interface and drags the API back toward RPC. I'd also mention that either choice needs a rule for invalid transitions — publishing an already-published article should be a 409, not a silent success.",
    },
    {
      q: "Explain the Richardson Maturity Model. Should every API aim for level 3?",
      a: "It's a four-level ladder for how fully an API uses HTTP. Level 0 tunnels everything through one URL and one method — classic SOAP or `api.php?action=...`. Level 1 introduces distinct URLs per resource. Level 2 adds correct HTTP verbs and status codes, which is where the value concentrates: idempotency, caching, and error semantics all start working. Level 3 adds hypermedia — responses carry links describing available next actions. In practice I'd target level 2 and treat level 3 as a deliberate exception: almost all real clients are generated or hand-written against an OpenAPI document, so nothing consumes the hypermedia, and it costs payload size and server complexity. Saying that trade-off out loud — rather than 'HATEOAS is required for true REST' — is the senior answer.",
    },
  ],

  quiz: [
    {
      question:
        "Your API needs a 'retry failed payment' capability that records who triggered the retry and when. Which endpoint best fits resource-oriented design?",
      options: [
        "GET /retryPayment?paymentId=88",
        "POST /payments/88/retries",
        "POST /api?action=retryPayment&id=88",
        "PUT /payments/88?retry=true",
      ],
      answerIndex: 1,
      explain:
        "The action carries its own data (actor, timestamp, outcome), so reify it: POST creates a new 'retry' sub-resource under the payment, and each retry is individually addressable afterwards. The GET option has side effects, the ?action= option is level-0 RPC, and PUT with a query flag hides a verb in a parameter.",
    },
    {
      question:
        "In REST terminology, what is the relationship between a resource and a representation?",
      options: [
        "They are synonyms — both mean the JSON response body",
        "The resource is the database row; the representation is the ORM object",
        "The resource is the concept identified by a URL; the representation is a document (e.g. JSON) describing its state at a point in time",
        "The representation is the URL; the resource is the response body",
      ],
      answerIndex: 2,
      explain:
        "A resource is the stable, URL-identified concept (order 1042); a representation is a snapshot of its state serialised for transfer, and one resource can have several (JSON, CSV, different versions). It's deliberately decoupled from storage — a resource need not map to any single database row.",
    },
    {
      question:
        "An API exposes /customers and /orders with distinct URLs but performs every operation — reads included — via POST, always returning 200. What Richardson maturity level is it?",
      options: [
        "Level 0, because it returns 200 for everything",
        "Level 1 — it has resources, but not HTTP verbs or meaningful status codes",
        "Level 2 — distinct URLs are enough",
        "Level 3, if the responses contain URLs",
      ],
      answerIndex: 1,
      explain:
        "Distinct per-resource URLs get you to level 1. Level 2 additionally requires using HTTP's verbs and status codes correctly — GET for safe reads, proper 2xx/4xx signalling. Level 3 is about hypermedia controls describing available actions, not merely URLs appearing in a payload.",
    },
  ],
};

export default lesson;
