import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "openapi-and-typed-clients",
  title: "OpenAPI & Typed Clients",
  part: "Operating in Production",
  estMinutes: 12,
  summary:
    "OpenAPI turns your API contract into a machine-readable document that tooling can lint, mock, and — the real payoff — compile into typed clients, so a contract change becomes a compile error in every consumer.",

  concept: `
Every API you have ever documented in PHP had the same lifecycle: a wiki page or a README,
lovingly written, drifting out of date by the second deploy. **OpenAPI** replaces prose with a
machine-readable contract — a YAML or JSON document that describes every path, parameter,
payload, and status code. Machines can lint it, diff it in CI, mock a server from it, render
reference docs from it, and generate typed clients from it. The doc stops being *about* the
API; it becomes an *artifact of* the API.

### Anatomy of a document

\`\`\`yaml
openapi: 3.1.0
info:            # title, version — of the API, not the spec
paths:           # URL templates -> operations (get, post, ...)
  /orders/{id}:
    get:         # one operation: params, responses per status code
components:
  schemas:       # shared payload shapes, referenced via $ref
  securitySchemes:  # how auth works (bearer, oauth2, apiKey)
\`\`\`

The pieces that carry the weight:

- **Operations** — one per method+path, each declaring \`parameters\` (path/query/header),
  an optional \`requestBody\`, and \`responses\` keyed **by status code**, each with a schema
  per media type. Yes, that means documenting the 404 and the 422, not just the happy 200.
- **\`components/schemas\` + \`$ref\`** — define \`Order\` once, reference it everywhere with
  \`$ref: '#/components/schemas/Order'\`. Repetition in an OpenAPI doc is a design smell,
  exactly like copy-pasted SQL.
- **\`securitySchemes\`** — declares your bearer-token or OAuth2 setup so generated docs and
  clients know how to authenticate.

Teach yourself **OpenAPI 3.1** as the working baseline: it aligned schemas with standard JSON
Schema, and it is what the tooling ecosystem targets. The newest spec is **3.2.0**
(September 2025) — structured tags, streaming media types, and support for the new \`QUERY\`
method via \`additionalOperations\` — worth name-dropping, but 3.1 is what you will write today.

### Spec-first or code-first?

The genuine debate, and interviewers like it because there is no free lunch:

- **Spec-first**: the YAML is the source of truth, written before code. The contract can be
  reviewed like an RFC, front-end and back-end teams build in parallel against it, and CI can
  diff the spec for breaking changes. Cost: discipline — the server must be *held to* the spec
  (contract tests), or it drifts just like the wiki did.
- **Code-first**: the spec is *generated* from code, so it cannot drift. In TypeScript the
  natural source is your zod schemas — Zod 4 converts schemas to JSON Schema out of the box
  with \`z.toJSONSchema(schema)\`, and libraries such as \`zod-openapi\` assemble full OpenAPI
  documents from schemas plus route metadata. Cost: the contract is discoverable only after
  the code exists, and code-shaped types can leak into what should be a consumer-shaped contract.

Either way, the non-negotiable is: **one source of truth, everything else generated**.

### The payoff: generated typed clients

This is where the document earns its keep. From any OpenAPI schema:

\`\`\`bash
npx openapi-typescript ./orders.yaml -o ./src/lib/api/schema.d.ts
\`\`\`

generates pure TypeScript types (zero runtime code). Then \`openapi-fetch\` wraps \`fetch\`
in those types:

\`\`\`ts
import createClient from "openapi-fetch";
import type { paths } from "./lib/api/schema";

const client = createClient<paths>({ baseUrl: "https://api.example.com/v1/" });

const { data, error } = await client.GET("/orders/{id}", {
  params: { path: { id: "ord_123" } },
});
// data is typed from the 200 schema; error from the 4xx/5xx schemas
\`\`\`

Now rename a field, remove an endpoint, or narrow an enum in the contract, regenerate, and
**every consumer that relied on the old shape fails to compile**. Breaking changes surface in
CI at build time instead of in production at 2 a.m. — that is the whole argument for OpenAPI
in one sentence.
`,

  comparisons: [
    {
      label: "Documentation: prose that drifts vs a contract machines can check",
      intro:
        "Both describe GET /orders/{id}. The PHP docblock was accurate in 2019; the YAML operation is the same artifact tooling lints, diffs, and generates clients from.",
      php: `<?php
/**
 * orders.php — API DOCS (last updated: ask Dave)
 *
 * GET /orders.php?id=123
 * Returns the order as JSON:
 *   { "id": 123, "status": "pending", "total": 99.5 }
 *
 * NOTE: since v2 'total' is actually 'totalCents' (int)
 * NOTE2: status can also be 'refunded' now?? (check with Dave)
 * Errors: prints "not found" (200) if missing... I think.
 */
$id = (int) $_GET['id'];
// ... implementation the comment no longer matches
`,
      ts: `# openapi.yaml — the contract IS the doc
paths:
  /orders/{id}:
    get:
      operationId: getOrder
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: The order
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '404':
          description: No such order
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'`,
      note:
        "The YAML is machine-checkable: CI can diff it for breaking changes, contract tests can hold the server to it, and generators turn it into docs and typed clients — a docblock can only rot.",
      rightLang: "yaml",
    },
    {
      label: "Consuming the API: hand-rolled fetch vs generated typed client",
      intro:
        "Both call GET /orders/{id} from a front end. The hand-rolled wrapper trusts its own assumptions; the generated client is compiled against the contract.",
      php: `// api.js — hand-rolled, typeless wrapper
async function getOrder(id) {
  const res = await fetch("/api/v1/orders/" + id);
  // Assumes 200; assumes the shape; both silently wrong
  // when the API renames total -> totalCents.
  const order = await res.json();
  return {
    id: order.id,
    total: order.total,      // undefined since v2 — NaN downstream
    status: order.status,
  };
}`,
      ts: `// api.ts — generated types from the OpenAPI schema
import createClient from "openapi-fetch";
import type { paths } from "./lib/api/schema"; // openapi-typescript output

const client = createClient<paths>({ baseUrl: "/api/v1/" });

export async function getOrder(id: string) {
  const { data, error } = await client.GET("/orders/{id}", {
    params: { path: { id } },
  });
  if (error) throw new Error(error.title); // typed from the 404 schema
  return data; // typed from the 200 schema:
  //   data.totalCents: number — data.total is a COMPILE error
}`,
      note:
        "After the contract renames total to totalCents, the left wrapper ships NaN to the UI; the right one fails to compile until every consumer is updated — the drift is caught by tsc, not by users.",
      leftLang: "js",
    },
    {
      label: "Keeping spec and validation in sync: by hand vs one source of truth",
      intro:
        "The OrderCreate payload must be described in the OpenAPI doc and validated at runtime. Left: two hand-maintained copies. Right: the zod schema is the single source, and the JSON Schema is generated from it.",
      php: `# openapi.yaml — copy #1, maintained by hand
components:
  schemas:
    OrderCreate:
      type: object
      required: [items]
      properties:
        items:
          type: array
          items: { type: string }
        couponCode:
          type: string

# ...meanwhile the runtime validator (copy #2) lives in
# code, and the two copies disagree within a sprint.`,
      ts: `// schemas/order.ts — the single source of truth
import * as z from "zod";

export const OrderCreate = z.object({
  items: z.array(z.string()).min(1),
  couponCode: z.string().optional(),
});

// Runtime validation in the handler:
//   OrderCreate.safeParse(req.body)
// Contract generation for the OpenAPI doc:
const jsonSchema = z.toJSONSchema(OrderCreate);
// -> { type: "object", required: ["items"], properties: { ... } }
// Libraries like zod-openapi assemble the full document
// from schemas like this plus route metadata.`,
      note:
        "Zod 4 ships z.toJSONSchema() natively, so code-first means the runtime validator and the published contract literally cannot disagree — the classic argument against maintaining a spec by hand.",
      leftLang: "yaml",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "A compact but complete OpenAPI 3.1 document for two /orders operations. Read it and predict what `npx openapi-typescript` would generate: which properties are optional, what the status enum becomes, and what types the request body and responses get. Then check the output.",
    code: `# orders.yaml — OpenAPI 3.1, two operations, shared schemas
openapi: 3.1.0
info:
  title: Orders API
  version: 1.0.0
paths:
  /orders:
    get:
      operationId: listOrders
      parameters:
        - name: status
          in: query
          required: false
          schema:
            $ref: '#/components/schemas/OrderStatus'
      responses:
        '200':
          description: Matching orders
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Order'
    post:
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/OrderCreate'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '422':
          description: Validation failed
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'
components:
  schemas:
    OrderStatus:
      type: string
      enum: [pending, paid, shipped]
    Order:
      type: object
      required: [id, status, totalCents]
      properties:
        id:
          type: string
          format: uuid
        status:
          $ref: '#/components/schemas/OrderStatus'
        totalCents:
          type: integer
        couponCode:
          type: string
    OrderCreate:
      type: object
      required: [items]
      properties:
        items:
          type: array
          items:
            type: string
        couponCode:
          type: string
    Problem:
      type: object
      required: [title, status]
      properties:
        title:
          type: string
        status:
          type: integer`,
    output: `$ npx openapi-typescript orders.yaml -o schema.d.ts
🚀 orders.yaml -> schema.d.ts

What the generated types boil down to (simplified):

components["schemas"]["OrderStatus"]
  = "pending" | "paid" | "shipped"        # enum -> string-literal union

components["schemas"]["Order"] = {
  id: string;          # format: uuid is documentation only — still string
  status: "pending" | "paid" | "shipped";
  totalCents: number;
  couponCode?: string; # not listed in required -> optional
}

components["schemas"]["OrderCreate"] = {
  items: string[];
  couponCode?: string;
}

paths["/orders"]["get"]
  query:        { status?: "pending" | "paid" | "shipped" }  # required: false -> ?
  200 response: Order[]

paths["/orders"]["post"]
  requestBody:  OrderCreate            # required: true -> must be passed
  201 response: Order
  422 response: Problem                # error branch is typed too

In a consumer using openapi-fetch:

  const { data, error } = await client.GET("/orders", {
    params: { query: { status: "paid" } },
  });
  # data: Order[] | undefined
  # query: { status: "refunded" } would be a COMPILE error —
  # "refunded" is not in the OrderStatus union.`,
  },

  keyPoints: [
    "An OpenAPI document maps paths to operations, each declaring parameters, request body, and responses per status code — document the 404 and 422, not just the 200.",
    "Define shared payload shapes once in `components/schemas` and reuse them with `$ref` — duplication in a spec rots exactly like duplicated code.",
    "OpenAPI 3.1 is the practical tooling baseline (JSON-Schema-aligned); 3.2.0 (Sept 2025) is the newest spec — structured tags, streaming media types, the QUERY method.",
    "Spec-first makes the contract reviewable before code and enables parallel client/server work; code-first (zod schemas + `z.toJSONSchema()` / zod-openapi) guarantees the spec can't drift from the validator. Either way: one source of truth, the rest generated.",
    "`npx openapi-typescript schema.yaml -o schema.d.ts` emits pure types; `openapi-fetch`'s `createClient<paths>()` gives calls where paths, params, bodies, and per-status responses are all checked by tsc.",
    "The payoff in one sentence: a contract change becomes a compile error in every consumer, so breaking changes surface in CI instead of production.",
  ],

  interview: [
    {
      q: "Spec-first or code-first OpenAPI — which would you choose and why?",
      a: "I'd present it as a trade-off and pick per team. Spec-first treats the YAML as the artifact of record: you can review a contract change like an RFC before any code exists, front-end and back-end can build in parallel against a mock server, and CI can diff the spec for breaking changes. Its weakness is drift — you need contract tests holding the server to the spec. Code-first generates the spec from the code, typically from zod schemas — Zod 4 has native `z.toJSONSchema()`, and libraries like zod-openapi build the full document — so the published contract and the runtime validator literally cannot disagree. Its weakness is that implementation-shaped types can leak into the contract. On a team that already validates everything with zod, I'd go code-first with the generated spec committed and diffed in CI, which recovers most of spec-first's review benefits.",
    },
    {
      q: "How do generated typed clients change how you handle API breaking changes?",
      a: "They move the failure from runtime to compile time. I generate types from the schema with openapi-typescript and call the API through openapi-fetch's `createClient<paths>()`, so every path, path param, query param, request body, and per-status response body is checked by tsc. When the contract renames `total` to `totalCents` or removes an endpoint, I regenerate and every consumer that relied on the old shape goes red in CI — with a hand-rolled fetch wrapper the same change ships silently and surfaces as `undefined` or NaN in front of users. It also improves error handling: the 4xx response schema is typed too, so the error branch is a real shape, not a guess.",
    },
    {
      q: "Walk me through the key parts of an OpenAPI document.",
      a: "Top level: `openapi` (the spec version — 3.1 is the tooling baseline, 3.2 the newest), `info` with the API's own title and version, `paths`, and `components`. Under `paths`, each URL template holds operations keyed by HTTP method; each operation declares `parameters` (path, query, header — each with a schema and a required flag), an optional `requestBody` with a schema per media type, and `responses` keyed by status code, again with schemas per media type — including the error responses, ideally `application/problem+json`. `components/schemas` holds shared shapes referenced by `$ref` so `Order` is defined exactly once, and `components/securitySchemes` declares the auth mechanism so docs and generated clients know how to authenticate. `operationId` matters more than it looks — generators use it to name client methods.",
    },
  ],

  quiz: [
    {
      question:
        "In an OpenAPI 3.1 schema, a property appears under `properties` but not in the `required` array. What does openapi-typescript generate for it?",
      options: [
        "A required property with type `unknown`",
        "An optional property (`couponCode?: string`)",
        "A property typed `string | null`",
        "Nothing — properties outside `required` are skipped",
      ],
      answerIndex: 1,
      explain:
        "JSON Schema's required array drives TypeScript optionality: listed properties are required, unlisted ones become optional (`?:`). Nullability is separate — that comes from the schema's type, not from required.",
    },
    {
      question: "What is the strongest argument for generating typed clients from an OpenAPI schema?",
      options: [
        "Generated clients make HTTP requests faster",
        "It removes the need to version the API",
        "A contract change becomes a compile error in consumers instead of a silent runtime failure",
        "It encrypts the API traffic automatically",
      ],
      answerIndex: 2,
      explain:
        "openapi-typescript emits zero runtime code — nothing gets faster and versioning is still needed. The value is that tsc checks every call against the contract, so a renamed field or removed endpoint breaks the build in CI rather than the app in production.",
    },
    {
      question: "Which statement about spec-first vs code-first is accurate?",
      options: [
        "Code-first guarantees the spec matches the runtime validator, because the spec is generated from it",
        "Spec-first makes drift impossible without any further tooling",
        "Code-first lets teams review the contract before any code exists",
        "Spec-first requires zod; code-first forbids it",
      ],
      answerIndex: 0,
      explain:
        "When the document is generated from the same schemas that validate requests (e.g. zod + z.toJSONSchema / zod-openapi), spec and validator share one source of truth. Spec-first gets the early-review and parallel-work benefits instead — but needs contract tests to prevent server drift.",
    },
    {
      question: "Which OpenAPI version should you treat as the practical tooling baseline today?",
      options: [
        "2.0 (Swagger), since most tools never moved on",
        "3.1 — JSON-Schema-aligned and what generators target; 3.2.0 is the newest spec",
        "3.2.0 only — 3.1 documents are rejected by current tooling",
        "Whichever version, since they are wire-compatible",
      ],
      answerIndex: 1,
      explain:
        "OpenAPI 3.1 aligned with standard JSON Schema and is what the generator ecosystem (openapi-typescript and friends) targets. 3.2.0 (September 2025) is the current spec — structured tags, streaming media types, QUERY support — and worth knowing about, but 3.1 is what you author against today.",
    },
  ],
};

export default lesson;
