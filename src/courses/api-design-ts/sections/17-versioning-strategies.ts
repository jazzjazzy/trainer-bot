import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "versioning-strategies",
  title: "Versioning Strategies",
  part: "Collections & Evolution",
  estMinutes: 12,
  summary:
    "URI versioning, Accept-header versioning, and Stripe-style date pinning — what counts as a breaking change, and why the senior answer is to version the contract, as a last resort.",

  concept: `
"How would you version this API?" is a stock interview question, and the
trap is answering with a mechanism before answering with a philosophy. The
mechanism question has three mainstream answers; the philosophy question has
one: **a version is a promise you now have to keep forever, so treat it as a
last resort.**

### First: what actually breaks a client?

A change is **breaking** if a correctly written existing client can stop
working:

- removing or renaming a field (\`total\` → \`amount\`)
- changing a field's type or meaning (\`status\` int → string; cents → dollars)
- tightening validation (a request that used to be accepted now 400s)
- adding a new *required* request field
- changing a status code or error shape clients branch on

A change is **additive** — no version bump needed — if old clients can keep
ignoring it: a new optional field, a new endpoint, a new optional query
parameter. Most "we need v2" conversations dissolve once you sort the wishlist
into these two piles.

### Strategy 1: URI versioning — \`/v1/orders\`

The version lives in the path. It's the most common choice for a reason:
visible in every log line and curl command, trivially routable, and each
version has distinct URLs so HTTP caches never mix them. REST purists object
that the URI should identify the *resource*, not the era of its
representation — \`/v1/orders/42\` and \`/v2/orders/42\` are the same order.
That's a real argument; in practice the operational clarity usually wins.

### Strategy 2: media-type / header versioning

The URI stays clean and the version rides in content negotiation:

\`\`\`bash
Accept: application/vnd.acme.v2+json
\`\`\`

This is the "correct REST" answer — the version selects a *representation* of
an unchanged resource. The costs are practical: you can't exercise it from a
browser address bar, every curl needs the header, caches must respect
\`Vary: Accept\`, and API gateway routing rules get fiddlier. Some APIs use a
plain custom header instead (\`Acme-Version: 2\`) — same trade-offs, less
ceremony.

### Strategy 3: date-based pinning — Stripe's model

Stripe versions by release date: \`Stripe-Version: 2024-06-20\`. Every account
is **pinned** to the version that was current when it first made a request,
so an integration written in 2019 still receives 2019-shaped responses today.
Internally there's one current implementation plus a chain of small
transformers that rewrite responses down to older shapes. It's the best
developer experience in the industry and the most engineering to run — you're
committing to maintaining that transformer chain indefinitely.

### The senior position

Whichever mechanism you pick, two principles matter more:

- **Design additively first.** Most changes can be shipped as new optional
  fields alongside deprecated old ones. Versioning is what you do when
  additive genuinely can't work — a security fix that must tighten
  validation, a fundamental resource remodel.
- **Version the contract, not the code.** Copying the codebase per version
  (\`api/\` → \`api2/\`) means every bug fix lands twice, then once, then
  neither. Keep one domain model at the current shape and write thin
  transformers that map it to each supported wire contract — v1 becomes a
  view over v2, not a fork of it.

Say those two sentences in an interview and the mechanism debate becomes easy:
"URI versioning for visibility unless the org already runs header or
date-based negotiation — but I'd fight to need it as rarely as possible."
`,

  comparisons: [
    {
      label: "Fork the codebase vs transform the contract",
      intro:
        "v2 renames total to amount and nests currency. One shop copies the whole api/ directory to api2/; the other keeps a single v2-shaped domain model and maps it down to the v1 wire contract.",
      php: `<?php // api2/getOrder.php — copied from api/getOrder.php in 2024
// The 300-line original, duplicated. The tax bug found last month
// was fixed in api/ ... nobody remembered api2/ has the same code.
$order = loadOrder($pdo, $_GET['id']);
echo json_encode([
  'id'     => $order['id'],
  'amount' => ['value' => $order['total'], 'currency' => 'AUD'],
  'status' => $order['status'],
]);`,
      ts: `// One domain model (current shape) + a thin v1 transformer.
interface OrderV2 {
  id: string;
  amount: { value: number; currency: string };
  status: string;
}

interface OrderV1 {
  id: string;
  total: number;      // v1 flattened the money fields
  currency: string;
  status: string;
}

function toV1(o: OrderV2): OrderV1 {
  return {
    id: o.id,
    total: o.amount.value,
    currency: o.amount.currency,
    status: o.status,
  };
}

app.get("/:version/orders/:id", async (req, res) => {
  const order = await loadOrder(req.params.id); // always OrderV2
  res.json(req.params.version === "v1" ? toV1(order) : order);
});`,
      note:
        "One implementation, two wire contracts: bug fixes land once and v1 is a typed view over the v2 shape — the copied-directory approach fixes bugs in whichever copy someone remembers.",
    },
    {
      label: "URI versioning vs Accept-header versioning",
      intro:
        "The same order fetched under both schemes. Note where the version travels and what each response's caching story looks like.",
      php: `# URI versioning — version is part of the URL
$ curl https://api.acme.dev/v2/orders/ord_1042

HTTP/1.1 200 OK
Content-Type: application/json

{"id":"ord_1042","amount":{"value":8600,"currency":"AUD"},
 "status":"shipped"}

# Distinct URL per version: visible in logs, trivially
# curlable, caches key on the URL automatically.`,
      ts: `# Media-type versioning — version rides in content negotiation
$ curl https://api.acme.dev/orders/ord_1042 \\
    -H 'Accept: application/vnd.acme.v2+json'

HTTP/1.1 200 OK
Content-Type: application/vnd.acme.v2+json
Vary: Accept

{"id":"ord_1042","amount":{"value":8600,"currency":"AUD"},
 "status":"shipped"}

# Clean, stable URI — but every request needs the header,
# and caches must honour Vary: Accept to keep v1/v2 apart.`,
      note:
        "Same resource, same bytes — the difference is operational: URI versions are self-evident in every log line; header versions keep URIs pure but depend on Vary: Accept and tooling discipline.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Breaking change vs additive change",
      intro:
        "Two ways to ship 'we now support multiple currencies'. One redefines an existing field and forces a v2; the other adds alongside and needs no version bump at all.",
      php: `{
  "id": "ord_1042",
  "total": "86.00 AUD",
  "status": "shipped"
}

// total WAS integer cents (8600). Every existing client
// doing total / 100 or comparing numbers is now broken.
// This change cannot ship without a new version.`,
      ts: `{
  "id": "ord_1042",
  "total": 8600,
  "amount": { "value": 8600, "currency": "AUD" },
  "status": "shipped"
}

// total keeps its old meaning; amount is NEW and optional
// to consume. Old clients ignore it, new clients prefer it.
// No version bump — deprecate total later, on a schedule.`,
      note:
        "The breaking version changes what an existing field means; the additive version adds a better field next to it — sorting proposed changes into these two piles is most of the versioning decision.",
      leftLang: "json",
      rightLang: "json",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A version-negotiation layer in miniature: resolveVersion checks the path, then the Accept header, then falls back to the default; a v1 transformer reshapes the current domain object. Predict which shape each of the three requests receives.",
    code: `// The current (v2) domain shape — the ONLY shape handlers produce.
interface OrderV2 {
  id: string;
  amount: { value: number; currency: string };
  status: string;
}

const order: OrderV2 = {
  id: "ord_1042",
  amount: { value: 8600, currency: "AUD" },
  status: "shipped",
};

// v1 flattened the money fields — reproduce that contract on the fly.
function toV1(o: OrderV2) {
  return {
    id: o.id,
    total: o.amount.value,
    currency: o.amount.currency,
    status: o.status,
  };
}

interface Req { path: string; headers: Record<string, string> }

// Precedence: explicit path version > Accept header > default.
function resolveVersion(req: Req): { version: 1 | 2; via: string } {
  const pathMatch = req.path.match(/^\\/v(\\d+)\\//);
  if (pathMatch) {
    return { version: Number(pathMatch[1]) as 1 | 2, via: "URI path" };
  }
  const accept = req.headers["accept"] ?? "";
  const mediaMatch = accept.match(/application\\/vnd\\.acme\\.v(\\d+)\\+json/);
  if (mediaMatch) {
    return { version: Number(mediaMatch[1]) as 1 | 2, via: "Accept header" };
  }
  return { version: 1, via: "default (oldest supported = safest)" };
}

function handle(req: Req) {
  const { version, via } = resolveVersion(req);
  const body = version === 1 ? toV1(order) : order;
  console.log(\`GET \${req.path}  ->  v\${version} (via \${via})\`);
  console.log("   " + JSON.stringify(body));
}

// 1) Path version wins outright:
handle({ path: "/v2/orders/ord_1042", headers: {} });

// 2) No path version — the Accept media type decides:
handle({
  path: "/orders/ord_1042",
  headers: { accept: "application/vnd.acme.v1+json" },
});

// 3) Neither present — fall back to the pinned default:
handle({ path: "/orders/ord_1042", headers: { accept: "application/json" } });

// Try it: give request 3 an Accept of vnd.acme.v2+json, or add a
// /v1/ prefix to request 2 and confirm the path takes precedence.`,
  },

  keyPoints: [
    "Sort every proposed change into breaking (remove/rename fields, change types or semantics, tighten validation, new required inputs) vs additive (new optional fields/endpoints) — only the first pile justifies a version.",
    "URI versioning (`/v1/orders`) is visible, curlable, and cache-friendly because each version has distinct URLs; purists object that the URI should identify the resource, not the representation era.",
    "Media-type versioning (`Accept: application/vnd.acme.v2+json`) keeps URIs clean and is the 'correct REST' answer, but needs `Vary: Accept`, header-aware tooling, and is harder to poke at in a browser.",
    "Stripe versions by date (`Stripe-Version: 2024-06-20`) with per-account pinning and a chain of response transformers — best developer experience, most engineering to operate.",
    "Version the contract, not the code: keep one current-shape domain model and map it to old wire contracts through thin transformers — never copy `api/` to `api2/`.",
    "The senior position: design additively first so versioning stays a last resort, then pick the mechanism that fits the org's tooling.",
  ],

  interview: [
    {
      q: "URI versioning vs header versioning — which would you pick and why?",
      a: "Before picking a mechanism I'd push the philosophy: design additively so we rarely need either. When a version is genuinely required, I default to URI versioning — `/v1/orders` — because it's visible in every log line and curl command, routes trivially, and caches key on distinct URLs with no `Vary` gymnastics. The purist objection that a URI should identify the resource rather than its representation era is fair, and media-type versioning (`Accept: application/vnd.acme.v2+json`) is the more RESTful answer, but it costs tooling friction: every request needs the header, caches must honour `Vary: Accept`, and you can't test it from an address bar. I'd also mention Stripe's date-pinning as the gold standard for developer experience if the org can afford the transformer chain.",
    },
    {
      q: "What counts as a breaking change in an API, and what can you ship without a version bump?",
      a: "Breaking means a correctly written existing client can stop working: removing or renaming a field, changing a field's type or semantics — `total` going from integer cents to a formatted string is the classic — tightening validation so previously valid requests now 400, adding a required request field, or changing status codes clients branch on. Additive changes are safe without a bump: new optional response fields, new endpoints, new optional parameters, because well-behaved clients ignore what they don't know. In practice I triage every proposed change into those two piles first — most 'we need v2' discussions evaporate when you realise everything on the list can ship additively.",
    },
    {
      q: "How does Stripe's versioning work, and would you recommend it?",
      a: "Stripe versions by release date — `Stripe-Version: 2024-06-20` — and pins each account to the version current at its first API call, so a 2019 integration still gets 2019-shaped responses. Internally there's one current implementation and a chain of small transformers that rewrite responses down to each older shape; a new version is a new transformer, not a new codebase. It's the best developer experience in the industry: integrations essentially never break. Whether I'd recommend it depends on scale — it's meaningful ongoing engineering, and for an internal API with three known consumers it's overkill. The transferable idea is universal though: version the wire contract via transformers over a single current domain model, never fork the code.",
    },
  ],

  quiz: [
    {
      question: "Which of these changes requires a new API version?",
      options: [
        "Adding an optional `amount` object alongside the existing `total` field",
        "Adding a new `/orders/{id}/refunds` endpoint",
        "Changing `total` from integer cents to a formatted string like \"86.00 AUD\"",
        "Adding an optional `?expand=` query parameter",
      ],
      answerIndex: 2,
      explain:
        "Changing an existing field's type (and meaning) breaks every client that parses it — that's the definition of a breaking change. The other three are additive: old clients simply ignore new optional fields, endpoints, and parameters, so they ship on the current version.",
    },
    {
      question:
        "What does 'version the contract, not the code' mean in practice?",
      options: [
        "Tag each release in git so old versions can be redeployed",
        "Keep one current-shape domain model and map it to older wire formats through thin transformers",
        "Copy the API directory per version so old code stays frozen and safe",
        "Only version the OpenAPI document, never the responses",
      ],
      answerIndex: 1,
      explain:
        "The code stays singular — handlers always produce the current shape — and each supported version is a transformer view over it (Stripe's model). Copying the codebase per version means every bug fix must land in every copy, which stops happening within months.",
    },
    {
      question:
        "A team adopts Accept-header versioning (application/vnd.acme.v2+json). What must they get right for HTTP caching?",
      options: [
        "Disable caching entirely, since header-versioned responses can't be cached",
        "Send Vary: Accept so caches store v1 and v2 responses separately for the same URL",
        "Move the version into a cookie so caches can see it",
        "Nothing — caches automatically inspect Accept headers",
      ],
      answerIndex: 1,
      explain:
        "With the version in a header, /orders/42 serves different bytes depending on Accept — without Vary: Accept a shared cache could hand a v2 body to a v1 client. This operational subtlety is exactly why URI versioning, where each version has its own URL, is simpler to run.",
    },
  ],
};

export default lesson;
