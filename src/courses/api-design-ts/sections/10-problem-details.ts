import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "problem-details",
  title: "Error Contracts: Problem Details",
  part: "Contracts & Validation",
  estMinutes: 11,
  summary:
    "RFC 9457 Problem Details gives every error the same machine-readable shape — type, title, status, detail, instance — so clients write one error handler instead of one per endpoint.",

  concept: `
Success responses get designed; error responses get improvised. That's the
quick-and-dirty pattern: one script dies with \`{"error": "oops"}\`, another
with \`{"message": "...", "code": 17}\`, a third echoes an HTML warning into
the JSON. Every client integrating with you must reverse-engineer each shape
per endpoint. The fix is the same move as everywhere else in this course:
**errors are part of the contract**, and there's a standard for them.

### RFC 9457: Problem Details for HTTP APIs

Published July 2023, RFC 9457 **obsoletes RFC 7807** (2016). The format is
unchanged at the core — 9457 clarifies semantics, adds guidance for carrying
multiple problems, and establishes a registry of common problem types. Citing
9457 rather than 7807 is cheap interview polish that signals you actually
track standards. The response is JSON with media type
**\`application/problem+json\`** — the \`+json\` suffix tells generic clients
"JSON syntax, this specific contract":

\`\`\`json
{
  "type": "https://api.acme.dev/problems/insufficient-credit",
  "title": "Insufficient credit",
  "status": 403,
  "detail": "Your balance is 30; the purchase costs 50.",
  "instance": "/accounts/12345/purchases"
}
\`\`\`

The five standard members, each with a distinct job:

- **\`type\`** — a URI identifying the problem *class*. This is the primary
  machine-readable field: clients switch on it. It should be stable and
  ideally dereference to human docs, but it doesn't have to resolve — it's an
  identifier first. Defaults to \`"about:blank"\` when the status code says
  it all.
- **\`title\`** — short human summary of the class; same for every occurrence
  of this \`type\`.
- **\`status\`** — echoes the HTTP status code, handy for logs and proxies.
- **\`detail\`** — human explanation of *this* occurrence. For people, not
  parsers: clients must not parse \`detail\`; anything machine-actionable
  belongs in \`type\` or an extension member.
- **\`instance\`** — a URI for this specific occurrence, often the request
  path or a per-error id you can grep in logs.

### Extension members: where your data goes

Problem Details is deliberately extensible — add members as long as the
standard five keep their meaning. The canonical API use: field-level
validation failures.

\`\`\`json
{
  "type": "https://api.acme.dev/problems/validation-failed",
  "title": "Request body failed validation",
  "status": 422,
  "errors": [
    { "path": "email", "message": "Invalid email address" },
    { "path": "age", "message": "Expected integer >= 13" }
  ]
}
\`\`\`

That \`errors\` array maps one-to-one from zod's issues:

\`\`\`ts
const result = CreateUser.safeParse(req.body);
if (!result.success) {
  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return sendProblem(res, 422, "validation-failed",
    "Request body failed validation", { errors });
}
\`\`\`

### Why a standard error contract earns its keep

- **Clients write one error handler.** Parse \`problem+json\`, switch on
  \`type\`, show \`title\`/\`detail\`, map \`errors[]\` onto form fields — once,
  for the whole API. Without it, error handling grows per endpoint.
- **The media type is self-describing.** Middleware can recognise
  \`application/problem+json\` without knowing which endpoint produced it.
- **It forces error taxonomy.** Assigning \`type\` URIs makes you enumerate
  what can actually go wrong — design work that ad-hoc \`die()\` calls let
  you skip.

Two production cautions: never leak stack traces, SQL, or internal class
names into \`detail\` (it ships to strangers), and keep \`type\` URIs stable —
they're API surface, renaming one is a breaking change.
`,

  comparisons: [
    {
      label: "die(json_encode(...)) vs a ProblemDetails factory",
      intro:
        "Three failure paths in each codebase. The PHP scripts each invent a shape; the TS API has one type and one factory, so a new endpoint can't invent anything.",
      php: `<?php
// user.php
if (!$user) {
    http_response_code(404);
    die(json_encode(['error' => 'not found']));
}

// order.php — different author, different shape
if (!$order) {
    die(json_encode(['success' => false, 'msg' => 'no such order']));
    // ...and forgot http_response_code: ships as 200
}

// payment.php — third shape, plus a leak
if ($e) {
    http_response_code(500);
    die(json_encode(['exception' => $e->getMessage()]));
}`,
      ts: `// http/problem.ts — the only way errors leave this API
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: { path: string; message: string }[];
}

export function sendProblem(
  res: ServerResponse,
  p: ProblemDetails,
): void {
  res.writeHead(p.status, {
    "Content-Type": "application/problem+json",
  });
  res.end(JSON.stringify(p));
}

// handlers/getUser.ts
sendProblem(res, {
  type: "https://api.acme.dev/problems/not-found",
  title: "Resource not found",
  status: 404,
  instance: req.url,
});`,
      note: "The factory couples the status code, the media type, and the body shape — the PHP version shows all three drifting independently (including a 'failure' shipped as HTTP 200).",
    },
    {
      label: "The same failure, ad hoc vs problem+json",
      intro:
        "A rejected order cancellation as two payloads. Ask of each: what can a client program against?",
      php: `{
  "success": false,
  "msg": "cant cancel, already shipped!!",
  "code": 17
}`,
      ts: `{
  "type": "https://api.acme.dev/problems/already-shipped",
  "title": "Order already shipped",
  "status": 409,
  "detail": "Order ord_77AB shipped on 2026-07-01 and can no longer be cancelled.",
  "instance": "/orders/ord_77AB/cancellation"
}`,
      note: "Left, the client string-matches 'already shipped' in msg or maintains a lookup of magic code numbers. Right, it switches on the stable type URI, shows detail to the human, and logs instance for support.",
      leftLang: "json",
      rightLang: "json",
    },
    {
      label: "What the CLIENT gets to write",
      intro:
        "The payoff side: consuming an API without and with a standard error contract.",
      php: `// client for an ad-hoc API: per-endpoint archaeology
async function cancelOrder(id: string) {
  const res = await fetch("/orders/" + id + "/cancel", {
    method: "POST",
  });
  const body = await res.json();
  // this endpoint: { success, msg }...
  if (body.success === false) throw new Error(body.msg);
  // ...but /users returns { error }, and /payments
  // returns { exception } — three handlers and counting
}`,
      ts: `// client for a problem+json API: ONE error handler
async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  const isProblem = res.headers
    .get("content-type")
    ?.includes("application/problem+json");
  if (isProblem) {
    const p = await res.json();
    // one switch on p.type covers the ENTIRE API:
    if (p.type.endsWith("/validation-failed")) {
      throw new ValidationError(p.errors);
    }
    throw new ApiError(p.title, p.status, p.detail);
  }
  return res.json();
}`,
      note: "The standard contract moves error-handling effort from O(endpoints) to O(1) — the media type flags the shape, and the type URI is the switch key.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A problem() factory building typed RFC 9457 documents for three classic failures — 404, 409, and a 422 carrying the errors[] extension (in real code those entries come straight from zod's error.issues). Predict each JSON body before running.",
    code: `// A problem() factory: every error the API emits goes through here,
// so every error has the same RFC 9457 shape.

interface FieldError {
  path: string;
  message: string;
}

interface ProblemDetails {
  type: string; // URI identifying the problem CLASS
  title: string; // short human summary of the class
  status: number; // echoes the HTTP status code
  detail?: string; // human explanation of THIS occurrence
  instance?: string; // URI of this occurrence (often the request path)
  errors?: FieldError[]; // extension member for validation failures
}

function problem(
  status: number,
  slug: string,
  title: string,
  extra: Partial<ProblemDetails> = {},
): ProblemDetails {
  return { type: "https://api.acme.dev/problems/" + slug, title, status, ...extra };
}

// 404 — resource missing:
const notFound = problem(404, "not-found", "Resource not found", {
  detail: "No order with id ord_9XKQ exists.",
  instance: "/orders/ord_9XKQ",
});

// 409 — business-rule conflict:
const conflict = problem(409, "already-shipped", "Order already shipped", {
  detail: "Order ord_77AB shipped on 2026-07-01 and can no longer be cancelled.",
  instance: "/orders/ord_77AB/cancellation",
});

// 422 — validation failure, with the errors[] extension
// (in real code, each entry comes straight from a zod issue):
const invalid = problem(422, "validation-failed", "Request body failed validation", {
  detail: "2 fields are invalid.",
  instance: "/users",
  errors: [
    { path: "email", message: "Invalid email address" },
    { path: "age", message: "Expected integer >= 13" },
  ],
});

for (const p of [notFound, conflict, invalid]) {
  console.log("--- " + p.status + " " + p.title + " ---");
  console.log(JSON.stringify(p, null, 2));
}`,
  },

  keyPoints: [
    "Cite RFC 9457 (July 2023) for Problem Details — it obsoletes RFC 7807; same core format, plus multi-problem guidance and a registry of common types.",
    "The media type is `application/problem+json` — self-describing, so generic middleware can recognise an error document without knowing the endpoint.",
    "The five members split the work: `type` (stable URI, the machine switch key), `title` (class summary), `status` (echoes HTTP), `detail` (human text — never parsed), `instance` (this occurrence).",
    "Extension members are the design intent, not a hack: an `errors[]` array of `{ path, message }` carries field-level validation failures, mapped straight from zod's `error.issues`.",
    "A standard error contract makes client error handling O(1) instead of O(endpoints) — one handler, switching on `type`.",
    "`detail` ships to strangers: no stack traces, SQL, or internal identifiers; and `type` URIs are API surface — renaming one is a breaking change.",
  ],

  interview: [
    {
      q: "How would you design error responses for a new REST API?",
      a: "I'd adopt Problem Details — RFC 9457, the July 2023 revision that obsoletes RFC 7807 — rather than inventing a shape. Every error becomes `application/problem+json` with `type`, `title`, `status`, `detail`, and `instance`, produced by a single factory so no endpoint can improvise. `type` is a stable URI per problem class — that's what clients switch on; `detail` is strictly for humans. For validation failures I add an `errors[]` extension member listing `path` and `message` per field, mapped directly from the validator's issues. The payoff is that consumers write exactly one error handler for the whole API, and the media type alone tells any middleware 'this is an error document'. The cautions I'd flag: keep `type` URIs stable because they're contract surface, and never let stack traces or SQL reach `detail`.",
    },
    {
      q: "In Problem Details, what's the difference between type, title, and detail — and which may a client parse?",
      a: "`type` is a URI identifying the problem *class* — 'insufficient-credit' as a concept — and it's the one field designed for machine dispatch: stable, documented, switch on it. `title` is the short human label for that class, identical across occurrences. `detail` explains this *specific* occurrence — 'balance is 30, purchase costs 50' — and the RFC is explicit that clients shouldn't parse it; if a client would need to extract the numbers, they belong in extension members like `balance` and `cost`. So: machines get `type`, `status`, and extensions; humans get `title` and `detail`. That separation is what keeps error messages editable without breaking integrations — reworded `detail` text is a copy change, not an API change.",
    },
    {
      q: "How do you turn a zod validation failure into a proper HTTP error response?",
      a: "safeParse the body; on failure, map `result.error.issues` into an `errors` extension array — each issue gives a `path` (an array I join with dots, so nested failures read like `address.zip`) and a `message`. That goes into a 422 problem document: `type` something stable like `.../problems/validation-failed`, `title` 'Request body failed validation', `status` 422, and the `errors[]` array, served as `application/problem+json`. The nice property is one code path handles every schema in the API — any zod failure anywhere becomes the same shaped 422, so client form libraries can bind `errors[].path` back onto fields generically. I'd centralise it: either a helper the handlers call or error middleware that catches thrown ZodErrors.",
    },
  ],

  quiz: [
    {
      question: "Which RFC do you cite for Problem Details in 2026, and why does the number matter?",
      options: [
        "RFC 7807 — it's the original and still authoritative",
        "RFC 9457 — published July 2023, it obsoletes RFC 7807 (same core format, added guidance and a problem-type registry)",
        "RFC 6648 — it covers error headers",
        "RFC 9110 — Problem Details is part of HTTP semantics",
      ],
      answerIndex: 1,
      explain:
        "RFC 9457 (July 2023) obsoletes RFC 7807. The wire format is essentially unchanged — application/problem+json with the same five members — but 9457 adds guidance (e.g. for multiple problems) and a common problem-type registry. Citing the current number is small but visible interview polish; 9110 is HTTP semantics and 6648 is the X- header deprecation.",
    },
    {
      question: "A client needs to react differently to 'insufficient credit' vs 'account frozen', both HTTP 403. Which field should it switch on?",
      options: [
        "detail — it contains the most specific text",
        "title — it names the problem",
        "type — the stable URI identifying the problem class; detail is explicitly not for parsing",
        "status — 403 distinguishes them",
      ],
      answerIndex: 2,
      explain:
        "type exists precisely for machine dispatch: each problem class gets a stable URI, so two different 403s carry two different types. detail is per-occurrence human text the RFC says clients shouldn't parse, title is a human label that may be reworded, and status is identical (403) for both cases here.",
    },
    {
      question: "Where do field-level validation messages (e.g. from zod issues) belong in a Problem Details response?",
      options: [
        "Concatenated into the detail string",
        "In an extension member such as errors[] with path and message per issue — extensions are how the format is meant to carry structured data",
        "In separate response headers, one per field",
        "Problem Details can't represent multiple errors; send one response per invalid field",
      ],
      answerIndex: 1,
      explain:
        "Problem Details is deliberately extensible: beyond the five standard members you add your own, and a per-field errors[] array is the canonical API example. Stuffing them into detail would force clients to parse human text — exactly what the RFC warns against.",
    },
  ],
};

export default lesson;
