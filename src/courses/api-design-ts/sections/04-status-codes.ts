import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "status-codes",
  title: "Status Codes with Intent",
  part: "HTTP & Resource Design",
  estMinutes: 12,
  summary:
    "Status codes are machine-readable signals that caches, retry logic, and monitoring act on — choose them deliberately, and never tunnel errors through 200.",

  concept: `
The status code is the one part of your response that *machines* act on before
any human reads the body. Caches decide whether to store, clients decide
whether to retry, load balancers decide whether a backend is unhealthy,
monitoring decides whether to page someone — all from three digits. That leads
to the design rule for this whole section:

> **Codes are for machines and middleboxes; bodies are for humans (and
> structured error details).** Never encode "it failed" only in the body.

The PHP habit of \`echo json_encode(['success' => false])\` with an implicit
200 is the canonical violation: the cache stores your error, the client's
\`res.ok\` check passes, monitoring stays green while users see failures.

### The success family — more precise than "200 everything"

- **200 OK** — here's the representation you asked for.
- **201 Created** — a new resource exists; include a \`Location\` header
  pointing at it. The natural answer to a successful \`POST /orders\`.
- **202 Accepted** — I've queued the work but haven't done it. For async
  operations; typically return a status URL the client can poll.
- **204 No Content** — success, deliberately no body. Natural for DELETE and
  for PUT/PATCH when you don't echo the resource back.

### The client-error family — where design skill shows

- **400 Bad Request** — I can't even parse/understand this (malformed JSON,
  wrong types).
- **401 Unauthorized** — misnamed; it means **unauthenticated**: no credentials
  or bad credentials. Semantically paired with a \`WWW-Authenticate\` header
  saying how to authenticate. "Who are you?"
- **403 Forbidden** — I know exactly who you are, and the answer is no.
  Re-authenticating won't help. "You can't do that."
- **404 Not Found** — no such resource. Also the deliberate choice when you
  don't want to *reveal* that a resource exists (a 403 confirms existence;
  GitHub returns 404 for private repos you can't see).
- **409 Conflict** — the request is well-formed but collides with current
  state: duplicate unique key, edit conflict, invalid state transition
  (cancelling a shipped order).
- **422 Unprocessable Content** — syntactically fine, semantically invalid:
  parseable JSON that fails validation rules (email malformed, quantity
  negative). The conventional home for schema-validation failures; 400 for
  "couldn't parse", 422 for "parsed but invalid" is a defensible, widely used
  split — just apply it consistently.
- **429 Too Many Requests** — rate limited; send \`Retry-After\`.

### The server-error family — whose fault is it?

- **500 Internal Server Error** — my code broke. Log it, page someone.
- **502 Bad Gateway** — I'm a proxy/gateway and the upstream gave me garbage.
- **503 Service Unavailable** — I'm alive but can't serve you right now
  (overload, maintenance); \`Retry-After\` invites the client back.

The 4xx/5xx boundary is an *accountability* boundary: 4xx means "client, fix
your request"; 5xx means "server side is broken, retrying might help". Your
alerting should treat them completely differently — a 4xx spike is a confused
or malicious client; a 5xx spike is your outage.

One framework note: Express 5's \`res.status()\` now throws on non-integer
codes or codes outside 100–999 — sloppy \`res.status("four-oh-four")\` code
that limped along in Express 4 fails fast in 5.
`,

  comparisons: [
    {
      label: "Errors tunnelled through 200 vs precise codes",
      intro:
        "An order-lookup endpoint failing three different ways. The PHP version reports every outcome as 200 + a body flag; the TS version gives each outcome the code that machines can act on.",
      php: `<?php
// getOrder.php — everything is 200, truth lives in the body
$order = find_order($_GET['id'] ?? '');

if (!$order) {
  echo json_encode(['success' => false,
                    'error' => 'not found']);   // 200!
  exit;
}
if ($order['user_id'] !== current_user_id()) {
  echo json_encode(['success' => false,
                    'error' => 'not yours']);   // 200!
  exit;
}
echo json_encode(['success' => true, 'data' => $order]);
// Caches store the errors, res.ok is always true,
// monitoring sees a perfectly healthy endpoint.`,
      ts: `// orders.get.ts — the code carries the outcome
app.get("/orders/:id", (req, res) => {
  if (!req.user) {
    res.set("WWW-Authenticate", 'Bearer realm="api"');
    return res.status(401).json({ title: "Authentication required" });
  }
  const order = orders.get(req.params.id);
  if (!order || order.userId !== req.user.id) {
    // 404, not 403: don't confirm the order exists
    return res.status(404).json({ title: "Order not found" });
  }
  return res.status(200).json(order);
});
// Retry logic, caches, dashboards, and \`res.ok\` all
// see the truth without parsing a body.`,
      note: "Tunnelling errors through 200 defeats every machine that reads status codes — HTTP caches store failures, client res.ok checks pass, and 5xx-based alerting never fires. Note the deliberate 404-instead-of-403 to avoid confirming existence.",
    },
    {
      label: "401 vs 403 — who are you vs you can't",
      intro:
        "The same admin endpoint probed twice: once with no token, once with a valid token belonging to a non-admin. Predict which code each request earns and why re-sending credentials only helps one of them.",
      php: `# No credentials at all -> 401 Unauthorized
# ("unauthenticated" — identity is the problem)
$ curl -i https://api.shop.test/admin/reports
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="api"
Content-Type: application/json

{"title":"Authentication required",
 "detail":"Provide a bearer token."}

# Fixable by the client: authenticate and retry.`,
      ts: `# Valid token, insufficient privilege -> 403 Forbidden
# (identity is fine — permission is the problem)
$ curl -i https://api.shop.test/admin/reports \\
    -H 'Authorization: Bearer valid-customer-token'
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"title":"Admin role required",
 "detail":"Your account lacks the reports:read permission."}

# NOT fixable by re-authenticating as the same user.`,
      note: "401 = unauthenticated (send WWW-Authenticate; the client should acquire credentials and retry). 403 = authenticated but not allowed (retrying with the same identity is pointless). Use 404 instead of 403 when even the resource's existence is private.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "400 vs 422 vs 409 — three flavours of 'bad request'",
      intro:
        "Three failing attempts to create a user. Each fails at a different layer: unparseable, parseable-but-invalid, and valid-but-conflicting.",
      php: `# Layer 1: can't even parse -> 400
$ curl -X POST https://api.shop.test/users \\
    -H 'Content-Type: application/json' \\
    -d '{"email": "a@b.co", '        # truncated JSON
HTTP/1.1 400 Bad Request

{"title":"Malformed JSON body"}

# Layer 2: parses, fails validation -> 422
$ curl -X POST https://api.shop.test/users \\
    -H 'Content-Type: application/json' \\
    -d '{"email": "not-an-email", "age": -3}'
HTTP/1.1 422 Unprocessable Content

{"title":"Validation failed",
 "errors":[{"field":"email","message":"Invalid email"},
           {"field":"age","message":"Must be >= 0"}]}`,
      ts: `# Layer 3: valid request, conflicts with state -> 409
$ curl -X POST https://api.shop.test/users \\
    -H 'Content-Type: application/json' \\
    -d '{"email": "taken@example.com", "age": 34}'
HTTP/1.1 409 Conflict

{"title":"Email already registered",
 "detail":"A user with taken@example.com exists."}

# Same code for state-machine violations:
$ curl -X POST https://api.shop.test/orders/1042/cancellation
HTTP/1.1 409 Conflict

{"title":"Order already shipped",
 "detail":"Shipped orders cannot be cancelled."}`,
      note: "A useful ladder: 400 = unreadable, 422 = readable but breaks validation rules, 409 = valid but collides with current server state (duplicates, illegal transitions). Consistency across your API matters more than which convention you pick for the 400/422 line.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A chooseStatus function over a discriminated union of handler outcomes — the decision logic from this section as one exhaustive switch. Predict the code and headers for each of the eight scenarios, then run it.",
    code: `// Status-code selection as a total function: every outcome a handler
// can produce is a union member, and the switch must handle them all.

type Outcome =
  | { kind: "found"; body: string }
  | { kind: "created"; location: string }
  | { kind: "accepted"; statusUrl: string }
  | { kind: "deleted" }
  | { kind: "malformed"; detail: string }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; permission: string }
  | { kind: "missing" }
  | { kind: "conflict"; detail: string }
  | { kind: "invalid"; field: string }
  | { kind: "rateLimited"; retryAfterSec: number }
  | { kind: "crashed" };

interface Reply {
  code: number;
  reason: string;
  headers?: Record<string, string>;
}

function chooseStatus(o: Outcome): Reply {
  switch (o.kind) {
    case "found":     return { code: 200, reason: "OK" };
    case "created":   return { code: 201, reason: "Created",
                               headers: { Location: o.location } };
    case "accepted":  return { code: 202, reason: "Accepted",
                               headers: { Location: o.statusUrl } };
    case "deleted":   return { code: 204, reason: "No Content" };
    case "malformed": return { code: 400, reason: "Bad Request" };
    case "unauthenticated":
      return { code: 401, reason: "Unauthorized",
               headers: { "WWW-Authenticate": 'Bearer realm="api"' } };
    case "forbidden": return { code: 403, reason: "Forbidden" };
    case "missing":   return { code: 404, reason: "Not Found" };
    case "conflict":  return { code: 409, reason: "Conflict" };
    case "invalid":   return { code: 422, reason: "Unprocessable Content" };
    case "rateLimited":
      return { code: 429, reason: "Too Many Requests",
               headers: { "Retry-After": String(o.retryAfterSec) } };
    case "crashed":   return { code: 500, reason: "Internal Server Error" };
    // No default: if a new Outcome kind is added, TypeScript
    // reports this switch as non-exhaustive at compile time.
  }
}

const scenarios: Outcome[] = [
  { kind: "created", location: "/orders/01J1YW3T" },
  { kind: "accepted", statusUrl: "/jobs/77" },
  { kind: "deleted" },
  { kind: "unauthenticated" },
  { kind: "forbidden", permission: "reports:read" },
  { kind: "invalid", field: "email" },
  { kind: "conflict", detail: "order already shipped" },
  { kind: "rateLimited", retryAfterSec: 30 },
];

for (const s of scenarios) {
  const r = chooseStatus(s);
  const h = r.headers
    ? " | " + Object.entries(r.headers).map(([k, v]) => \`\${k}: \${v}\`).join(", ")
    : "";
  console.log(\`\${s.kind.padEnd(16)} -> \${r.code} \${r.reason}\${h}\`);
}

// Try it: add { kind: "gatewayTimeout" } to Outcome — chooseStatus
// stops compiling until you decide its code. That's the point:
// status selection as a reviewed design decision, not an afterthought.`,
  },

  keyPoints: [
    "Status codes are read by machines — caches, retry middleware, load balancers, alerting — before any human sees the body: never tunnel errors through 200 with a `success: false` flag.",
    "Success precisely: 200 representation, 201 + `Location` for creation, 202 for queued async work, 204 for success-with-no-body.",
    "401 means unauthenticated ('who are you?' — pair with `WWW-Authenticate`); 403 means authenticated but denied ('you can't'); return 404 instead of 403 when even existence is private.",
    "A practical client-error ladder: 400 unparseable → 422 parseable-but-invalid → 409 valid-but-conflicts-with-state; 429 + `Retry-After` for rate limits.",
    "4xx vs 5xx is an accountability boundary — 4xx: client must change the request; 5xx: server broke, retrying may help — so alert on them differently.",
    "Express 5's `res.status()` throws on non-integer codes or codes outside 100-999, so invalid-status bugs fail fast instead of shipping.",
  ],

  interview: [
    {
      q: "Why is returning errors as 200 + {\"success\": false} an anti-pattern?",
      a: "Because the status code is the only part of the response that infrastructure acts on without parsing your body. Tunnel errors through 200 and an HTTP cache may store and re-serve the failure, `fetch`'s `res.ok` and every generic client wrapper report success, retry logic never retries what it should, and status-code-based monitoring shows a healthy endpoint during an outage. It also forces every consumer to learn your bespoke body-level error protocol instead of the one HTTP already defines. The rule I use: codes for machines, bodies for detail — the code says *that* and *how* it failed at the protocol level; a structured body (ideally RFC 9457 Problem Details) says *why*, for humans and logs.",
    },
    {
      q: "Walk me through 401 vs 403 — and when you'd deliberately use 404 instead.",
      a: "401 is misnamed — it means *unauthenticated*: missing, expired, or invalid credentials. It should carry a `WWW-Authenticate` header, and the correct client reaction is to obtain credentials and retry. 403 means authentication succeeded but the authenticated principal isn't allowed — retrying with the same identity is pointless, so clients shouldn't. The subtle third case: a 403 on `/orders/1042` *confirms that order 1042 exists*, which is itself an information leak. When existence is private — other tenants' resources, private repos — I return 404 for both 'doesn't exist' and 'exists but not yours', the way GitHub does. That keeps the response indistinguishable and closes an enumeration channel, at the cost of slightly less honest semantics — a trade-off I'd state explicitly in a design review.",
    },
    {
      q: "How do you choose between 400, 422, and 409 for a rejected write?",
      a: "I use a three-layer ladder based on where the request fails. 400 when I can't even interpret it — malformed JSON, wrong content type, structurally hopeless. 422 when it parses fine but fails validation rules: bad email format, negative quantity — the schema-validation layer's code. 409 when the request itself is perfectly valid but conflicts with current server state: unique-key duplicates, optimistic-lock version mismatches, illegal state transitions like cancelling a shipped order. The 400-vs-422 line is convention rather than hard law — some teams use 400 for both — so the senior answer is: pick one ladder, document it, and apply it uniformly, because consumers write error-handling code against your consistency, not against the RFC.",
    },
  ],

  quiz: [
    {
      question:
        "A successful POST /orders creates a new order. What's the most correct response?",
      options: [
        "200 OK with the order in the body",
        "201 Created with a Location header pointing at /orders/{id}",
        "204 No Content — the client knows what it sent",
        "202 Accepted with the order in the body",
      ],
      answerIndex: 1,
      explain:
        "201 signals 'a new resource now exists' and the Location header tells the client its canonical URL — machine-readable creation semantics. 200 is acceptable but vaguer; 202 specifically means the work has been queued and NOT completed yet; 204 discards the one thing the client most needs — where the new resource lives.",
    },
    {
      question:
        "A request arrives with a valid token, but the user tries to read another tenant's invoice. Your product treats resource existence as confidential. Best response?",
      options: [
        "401 Unauthorized, so they can re-authenticate",
        "403 Forbidden with a clear explanation",
        "404 Not Found, identical to a genuinely missing invoice",
        "422 Unprocessable Content, since the ID fails a business rule",
      ],
      answerIndex: 2,
      explain:
        "401 is wrong — authentication already succeeded. 403 is semantically accurate but confirms the invoice exists, leaking information across tenants. When existence itself is private, returning the same 404 as for a missing resource closes the enumeration channel. 422 is for validation failures, not authorization decisions.",
    },
    {
      question:
        "Your dashboard shows a sudden spike of 502s from your API gateway. What does that most likely indicate?",
      options: [
        "Clients are sending malformed requests",
        "The gateway received invalid responses from an upstream service — look behind the gateway, not at clients",
        "The API is rate-limiting aggressively",
        "Nothing — 5xx codes are informational",
      ],
      answerIndex: 1,
      explain:
        "502 Bad Gateway is specifically 'I proxied your request upstream and got garbage or nothing back' — it points the investigation at the service behind the gateway (crashed workers, bad deploys), not at client behaviour (4xx territory) or rate limiting (429). The 4xx/5xx split is an accountability boundary; alerting should treat them differently.",
    },
  ],
};

export default lesson;
