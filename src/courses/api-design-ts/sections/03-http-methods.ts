import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "http-methods",
  title: "HTTP Methods Done Right",
  part: "HTTP & Resource Design",
  estMinutes: 13,
  summary:
    "Each HTTP method is a promise about safety and idempotency that clients, proxies, and retry logic rely on — including the interview classic: PUT replaces, PATCH partially updates via a defined patch format.",

  concept: `
HTTP methods aren't just naming conventions — each one is a **contract about
side effects** that the entire ecosystem (browsers, caches, proxies, retry
middleware, crawlers) is built to trust. Break the contract and the ecosystem
breaks you: a prefetcher "clicks" your GET-that-deletes, a retry double-fires
your POST.

### The two properties that matter

- **Safe**: the request causes no state change the client can be held
  responsible for. Safe methods can be prefetched, crawled, and cached.
- **Idempotent**: sending the request N times has the same effect on the
  server as sending it once. Idempotent methods can be *blindly retried*
  after a timeout.

Per RFC 9110:

\`\`\`text
Method   Safe   Idempotent   Typical success
GET      yes    yes          200 (representation)
HEAD     yes    yes          200 (headers only — cheap existence checks)
OPTIONS  yes    yes          204/200 (capabilities; CORS preflight)
PUT      no     yes          200/204 (replaced) or 201 (created)
DELETE   no     yes          204 or 200
POST     no     NO           201 + Location, or 200/202
PATCH    no     NO           200/204
\`\`\`

POST is the workhorse precisely *because* it promises nothing: "process this"
— create a child resource, run a computation, trigger a transition. That
no-promise is also why a timed-out POST is dangerous to retry, which is the
whole reason idempotency keys exist (next section's topic).

### PUT vs PATCH — the interview classic

**PUT is full replacement.** The body is the complete new representation;
whatever you omit is *gone*. That's exactly why PUT is idempotent: the final
state equals the request body, no matter how many times it lands. Send a
partial body via PUT and you've silently nulled the other fields — the classic
"PUT ate my data" bug.

**PATCH is partial update** — and crucially, the body is **not a resource
representation, it's a patch document**, so you must pick a defined format:

- **JSON Merge Patch** (RFC 7396, \`application/merge-patch+json\`): the body
  mirrors the resource's shape; fields you send are set, fields set to
  \`null\` are **removed**, fields you omit are untouched. Simple, covers 90%
  of cases. Two gotchas: you can't set a field *to* null, and arrays are
  replaced wholesale, never appended to.
- **JSON Patch** (RFC 6902, \`application/json-patch+json\`): the body is a
  list of operations — \`[{ "op": "replace", "path": "/price", "value": 1999 }]\`,
  plus \`add\`, \`remove\`, \`copy\`, \`move\`, and \`test\` (a precondition op
  that fails the whole patch if a value doesn't match). Precise, supports
  arrays and null, but heavier for both sides.

PATCH is **not idempotent by definition** — a \`test\`+\`increment\`-style
patch applied twice gives a different result — though many concrete patches
(like a merge patch setting fields to fixed values) happen to be idempotent in
effect. Saying that distinction precisely is an easy interview win.

### Method-choosing rules of thumb

- Reading? GET (HEAD if you only need existence/metadata).
- Client knows the full URL and the full new state? PUT (works for
  create-at-known-URL too: first PUT 201, subsequent 200/204).
- Server assigns the ID, or the operation is "do something"? POST.
- Changing part of an existing thing? PATCH with an explicit patch
  content type.
- Never GET with side effects. Ever. Middleboxes will find it.

Footnote for currency: OpenAPI 3.2 (Sept 2025) added a dedicated \`query\`
field to the Path Item Object so the proposed \`QUERY\` method — "GET with a
body" for huge filter expressions — can be described directly. (The sibling
\`additionalOperations\` map covers other non-standard methods such as COPY,
and must not repeat a method that already has a fixed field.) Worth
name-dropping as spec-awareness; not something to build on yet.
`,

  comparisons: [
    {
      label: "Everything-is-POST (or worse, GET) vs a method-keyed surface",
      intro:
        "A PHP endpoint that multiplexes create/update/delete through POST — plus a read with side effects through GET — against a TS handler table where the method carries the semantics.",
      php: `<?php
// product.php — the method tells you nothing
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $op = $_POST['op'] ?? 'save';
  if ($op === 'save')   save_product($_POST);   // create or update?
  if ($op === 'delete') delete_product($_POST['id']);
  echo json_encode(['ok' => true]);             // 200 either way
}

// track.php — a GET that writes!
// <img src="/track.php?id=42"> "seemed convenient"
if (isset($_GET['id'])) {
  increment_view_count((int) $_GET['id']);      // crawlers inflate
  echo '1';                                     // this all day
}`,
      ts: `// products.routes.ts — the verb IS the operation
app.get("/products/:id", getProduct);       // safe: cache/prefetch OK
app.head("/products/:id", getProduct);      // existence check, no body
app.put("/products/:id", replaceProduct);   // full body, retryable
app.patch("/products/:id", patchProduct);   // merge-patch body
app.delete("/products/:id", deleteProduct); // retryable: 204 then 404

app.post("/products", createProduct);       // server assigns the ID
app.post("/products/:id/views", trackView); // a write is a POST —
                                            // never a GET`,
      note: "Multiplexing through POST discards the safety/idempotency signals that caches, retries, and crawlers act on. The view-tracking GET is the classic failure: any prefetcher or link-checker silently corrupts your analytics.",
    },
    {
      label: "PUT vs PATCH on the wire",
      intro:
        "The same intent — 'set the price to 19.99' — sent as PUT and as PATCH. Predict what happens to the description and tags fields in each case.",
      php: `# PUT = full replacement. Partial body? Fields silently vanish.
$ curl -X PUT https://api.shop.test/products/42 \\
    -H 'Content-Type: application/json' \\
    -d '{"price": 19.99}'
HTTP/1.1 200 OK

$ curl https://api.shop.test/products/42
{"id":"42","price":19.99}
# name, description, tags: GONE — the request body
# said "this is the complete new representation".`,
      ts: `# PATCH = partial update with a declared patch format
$ curl -X PATCH https://api.shop.test/products/42 \\
    -H 'Content-Type: application/merge-patch+json' \\
    -d '{"price": 19.99, "discount": null}'
HTTP/1.1 200 OK

$ curl https://api.shop.test/products/42
{"id":"42","name":"Desk Lamp","description":"Warm LED",
 "tags":["home","lighting"],"price":19.99}
# Omitted fields untouched; "discount": null REMOVED
# the field — merge-patch semantics (RFC 7396).`,
      note: "PUT's body is the complete new state (that's what makes it idempotent); PATCH's body is a patch document, so the Content-Type must name the format — merge-patch (simple, null-removes, arrays replaced) or JSON Patch (RFC 6902 op list).",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Merge Patch vs JSON Patch documents",
      intro:
        "The same three edits — change price, remove discount, retitle the second tag — written in both patch formats. Notice what merge patch simply cannot express.",
      php: `{
  "price": 1999,
  "discount": null,
  "tags": ["home", "office-lighting"]
}

// application/merge-patch+json (RFC 7396)
// - shape mirrors the resource: trivial to write
// - "discount": null means REMOVE discount
//   (so you can never set a field TO null)
// - arrays only replace wholesale: to rename one
//   tag we must resend the entire array`,
      ts: `[
  { "op": "test",    "path": "/version", "value": 7 },
  { "op": "replace", "path": "/price",   "value": 1999 },
  { "op": "remove",  "path": "/discount" },
  { "op": "replace", "path": "/tags/1",  "value": "office-lighting" }
]

// application/json-patch+json (RFC 6902)
// - explicit operations, addresses array elements
// - "test" op = precondition: whole patch fails
//   atomically if version isn't 7 (optimistic locking)`,
      note: "Merge patch is the pragmatic default; reach for JSON Patch when you need array surgery, setting null as a value, or test-op preconditions. Either way, declare the format in Content-Type — an undeclared PATCH body is an undefined contract.",
      leftLang: "json",
      rightLang: "json",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A merge-patch engine (RFC 7396 semantics) applied to a typed product resource. Before running, predict: which fields survive, what happens to discount, and what happens to the tags array.",
    code: `// JSON Merge Patch (RFC 7396) in ~20 lines:
// send a field -> set it; send null -> remove it; omit -> untouched.

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isPlainObject(v: JsonValue | undefined): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function applyMergePatch(target: JsonValue, patch: JsonValue): JsonValue {
  // A non-object patch replaces the target entirely (spec rule 1)
  if (!isPlainObject(patch)) return patch;

  const result: JsonObject = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key]; // null means REMOVE — the famous gotcha
    } else {
      result[key] = applyMergePatch(result[key] ?? null, value);
    }
  }
  return result;
}

const product: JsonObject = {
  id: "42",
  name: "Desk Lamp",
  price: 2499,
  discount: 500,
  dimensions: { width: 12, height: 40 },
  tags: ["home", "lighting"],
};

// PATCH /products/42  Content-Type: application/merge-patch+json
const patch: JsonObject = {
  price: 1999,
  discount: null,                 // remove the field
  dimensions: { depth: 12 },      // nested objects MERGE
  tags: ["office"],               // arrays REPLACE wholesale
};

console.log("before:", JSON.stringify(product));
const after = applyMergePatch(product, patch);
console.log("after: ", JSON.stringify(after));

// Idempotency check: applying the same patch again changes nothing
const again = applyMergePatch(after, patch);
console.log("same after replay:", JSON.stringify(again) === JSON.stringify(after));

// Try it: patch { dimensions: null } — the whole nested object goes.
// Then try adding a tag without resending the array. You can't —
// that's when you reach for JSON Patch (RFC 6902).`,
  },

  keyPoints: [
    "Safe = no state change (GET, HEAD, OPTIONS); idempotent = N sends ≡ 1 send (those plus PUT, DELETE). Infrastructure — caches, prefetchers, retry logic — acts on these promises.",
    "POST promises nothing, which makes it the universal 'process this' verb and the one method that's dangerous to blindly retry.",
    "PUT is full replacement: the body is the complete new representation, omitted fields are deleted — and that totality is exactly why PUT is idempotent.",
    "PATCH's body is a patch *document*, not a representation: declare `application/merge-patch+json` (simple; null removes; arrays replace) or `application/json-patch+json` (op list; array surgery; `test` preconditions).",
    "PATCH is not idempotent by definition, though a fixed-value merge patch is idempotent in effect — say it exactly that way in interviews.",
    "Never GET with side effects; and as a spec-currency footnote, OpenAPI 3.2 can describe the proposed QUERY method (GET-with-a-body) via a dedicated `query` field on the Path Item Object — `additionalOperations` is for other non-standard methods.",
  ],

  interview: [
    {
      q: "What's the difference between PUT and PATCH?",
      a: "PUT is complete replacement: the request body is the full new representation of the resource, and anything omitted is removed. That totality is what makes PUT idempotent — final state equals the body regardless of repeats — and also its trap: sending a partial object via PUT silently wipes the other fields. PATCH is partial modification, and its body isn't a representation at all but a patch document in a declared format: JSON Merge Patch mirrors the resource shape where null means 'remove field' and arrays replace wholesale, while JSON Patch is an explicit operation list that can address array indices and carry `test` preconditions. PATCH isn't idempotent by definition, though most fixed-value patches are idempotent in effect. Practically: I use PUT when the client naturally holds the whole object, PATCH with merge-patch for typical field edits.",
    },
    {
      q: "Define 'safe' and 'idempotent', and explain why anyone should care.",
      a: "Safe means the client can't be held responsible for any state change — GET, HEAD, OPTIONS — so intermediaries feel free to prefetch, crawl, and cache those requests. Idempotent means N identical requests leave the server in the same state as one — the safe methods plus PUT and DELETE — so a client that times out can retry without fear. These matter because the web's infrastructure *acts* on them: a link prefetcher will happily fire your GET-that-deletes, and retry middleware will re-send an idempotent request but must not blindly re-send a POST. In PHP terms, every one-off script that mutated state on GET was breaking a contract the whole ecosystem assumes. Getting these right is what makes an API robust under real network conditions, not just in the happy path.",
    },
    {
      q: "A DELETE returns 404 the second time you send it. Does that break idempotency?",
      a: "No — and this is a subtlety worth stating precisely: idempotency is about the effect on *server state*, not about identical response codes. After the first DELETE the resource is gone; after the second it's still gone — the state is identical, so DELETE keeps its promise even though the client sees 204 then 404. The same logic applies to PUT-as-create returning 201 the first time and 200 thereafter. Where I would be careful is side channels: if each DELETE attempt sends a 'your account was closed' email, the state contract holds but the observable behaviour is broken — so I keep secondary effects (notifications, webhooks) tied to actual state transitions, not to request arrivals.",
    },
    {
      q: "When is POST the right verb even though it isn't 'RESTful-looking'?",
      a: "POST is correct whenever the server assigns the identity or the operation doesn't reduce to replacing a known resource's state: creating into a collection (`POST /orders` → 201 with a Location header), triggering a computation or state transition (`POST /orders/42/cancellation`), or submitting a search whose filter expression is too large or too sensitive for a query string. The trade-off I'd name is that POST forfeits idempotency, so for anything money-shaped I pair it with an Idempotency-Key so retries are safe. I'd also mention the emerging QUERY method — a safe GET-with-a-body aimed at the big-filter case, describable in OpenAPI 3.2 — as the standards-track answer to 'search via POST', while being clear it's not broadly deployed yet.",
    },
  ],

  quiz: [
    {
      question:
        "A client PUTs {\"price\": 19.99} to /products/42, which previously had name, description, and tags. What does a spec-correct server end up storing?",
      options: [
        "The product with only its price changed",
        "A product whose representation is just {price: 19.99} — the other fields are gone",
        "A 405 error — PUT can't target an existing resource",
        "The price change, but only if an If-Match header was sent",
      ],
      answerIndex: 1,
      explain:
        "PUT means 'replace the resource's state with this body'. Omitted fields aren't 'unchanged' — they're absent from the new representation. That totality is what makes PUT idempotent, and it's why partial updates belong in PATCH with a declared patch format. (A good API might instead reject the partial body as 400/422 — but it must not treat PUT as a merge.)",
    },
    {
      question:
        "In JSON Merge Patch (RFC 7396), what does {\"discount\": null} mean?",
      options: [
        "Set discount to the JSON value null",
        "Remove the discount field from the resource",
        "Reset discount to its default value",
        "It's invalid — merge patch forbids null",
      ],
      answerIndex: 1,
      explain:
        "In merge patch, null is the removal operator — which also means merge patch cannot set a field to a literal null. If you need that (or array-element edits, or test preconditions), use JSON Patch (RFC 6902), where operations are explicit.",
    },
    {
      question: "Which methods can a client blindly retry after a network timeout, per RFC 9110?",
      options: [
        "GET, HEAD, OPTIONS, PUT, DELETE",
        "GET and POST",
        "All methods — HTTP guarantees exactly-once delivery",
        "Only GET and HEAD",
      ],
      answerIndex: 0,
      explain:
        "The idempotent set is the safe methods (GET, HEAD, OPTIONS) plus PUT and DELETE — N identical requests leave the same server state as one. POST and PATCH promise no such thing, which is why unguarded POST retries can double-charge and why idempotency keys exist.",
    },
    {
      question:
        "Why must a PATCH request declare a specific Content-Type like application/merge-patch+json?",
      options: [
        "Because Express rejects PATCH bodies without it",
        "Because the body is a patch document, not a representation — without a declared format its semantics are undefined",
        "To enable gzip compression on the request body",
        "It's optional; servers infer the format from the body shape",
      ],
      answerIndex: 1,
      explain:
        "PATCH's body describes *changes*, and at least two standard formats exist with very different semantics (merge patch's null-removes vs JSON Patch's op list). The media type is the contract that tells the server how to interpret it — inferring from shape is guesswork, since a JSON Patch document is also valid JSON.",
    },
  ],
};

export default lesson;
