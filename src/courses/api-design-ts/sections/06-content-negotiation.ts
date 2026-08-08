import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "content-negotiation",
  title: "Headers & Content Negotiation",
  part: "HTTP & Resource Design",
  estMinutes: 10,
  summary:
    "The URL names the resource; headers negotiate its representation — Content-Type and Accept are the contract vocabulary, and 415/406 are what you say when negotiation fails.",

  concept: `
A URL identifies a **resource**; headers negotiate its **representation**.
\`GET /orders/42\` doesn't say whether the response should be JSON, CSV, or
HTML — that conversation happens entirely in headers. In two decades of PHP
you've probably treated \`header('Content-Type: application/json')\` as
boilerplate to paste at the top of each script. In deliberate API design,
those headers are part of the contract, and they're set in exactly one place.

### Content-Type vs Accept — the two directions

- **\`Content-Type\`** describes the body *being sent* — in either direction.
  A client POSTing JSON sends \`Content-Type: application/json\`; your response
  carries its own \`Content-Type\` describing what you returned.
- **\`Accept\`** is the client's wish list for the *response*: "here's what I
  can consume, in order of preference."

The classic confusion is thinking \`Accept\` describes the request body. It
never does. A request can say "I'm sending you JSON (\`Content-Type\`) but I'd
like CSV back (\`Accept\`)" — both at once, no contradiction.

### q-values: preferences, not demands

\`Accept\` can list several media types weighted by quality values from 0 to 1
(no \`q\` means \`q=1\`):

\`\`\`text
Accept: text/html, application/json;q=0.9, */*;q=0.1
\`\`\`

Read: "HTML if you have it, JSON is nearly as good, anything else as a last
resort." The server picks the best match it can actually produce. \`q=0\`
means "never send me this."

### The two failure codes

Negotiation can fail in each direction, and each direction has its status:

- **415 Unsupported Media Type** — "I can't read what you *sent me*." The
  request's \`Content-Type\` isn't one you support (someone POSTs XML to your
  JSON API).
- **406 Not Acceptable** — "I can't produce what you *asked for*." Nothing in
  the \`Accept\` header matches a representation you can generate.

Mnemonic: 415 is about the request body, 406 is about the response body.

### Media types are contract identifiers

\`application/json\` says "this parses as JSON" and nothing more. Richer media
types name the *contract*, not just the syntax:

- \`application/problem+json\` — a standardised error document (RFC 9457; a
  later section covers it). The \`+json\` suffix means "JSON syntax, but this
  specific shape."
- \`application/vnd.acme.v2+json\` — a vendor type: "Acme's format, version 2,
  as JSON." Some APIs (famously GitHub's) version themselves through the
  \`Accept\` header this way instead of putting \`/v2/\` in the URL.

On charset: JSON is defined as UTF-8 on the wire, so \`application/json\`
needs no \`charset\` parameter (you'll see \`;charset=utf-8\` appended
harmlessly, but it carries no meaning for JSON). For \`text/*\` types like
\`text/csv\`, charset genuinely matters — state it.

\`Accept-Language\` negotiates the *human* language of a representation the
same way \`Accept\` negotiates its format: \`Accept-Language: de, en;q=0.8\`.
For APIs it mostly affects human-readable strings such as error messages.

### Custom headers: the X- prefix is dead

RFC 6648 (2012) deprecated the \`X-\` convention for custom headers: too many
"experimental" headers became permanent (\`X-Forwarded-For\` is stuck with its
name forever). New custom headers get meaningful unprefixed names, ideally
with your product as a namespace: \`Acme-Request-Id\`, \`Acme-Api-Version\` —
not \`X-Acme-Request-Id\`. Existing entrenched \`X-\` headers survive; you just
don't mint new ones.
`,

  comparisons: [
    {
      label: "Setting response headers: per-script vs one door",
      intro:
        "Both codebases return JSON. One repeats (and sometimes forgets) the header in every script; the other routes every response through a single helper.",
      php: `<?php
// users.php — header pasted at the top, per script
header('Content-Type: application/json');
echo json_encode($users);

// orders.php — copy-pasted with a subtle difference
header('Content-Type: application/json;charset=UTF8');
echo json_encode($orders);

// legacy.php — forgot the header entirely, so PHP
// defaults to text/html and every client just guesses
echo json_encode($legacyReport);`,
      ts: `// src/http/respond.ts — every handler responds through here
const JSON_TYPE = "application/json";

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, {
    "Content-Type": JSON_TYPE,
    // Tell caches the body varies by what the client accepts:
    "Vary": "Accept",
  });
  res.end(JSON.stringify(body));
}

// handlers/users.ts, handlers/orders.ts, everywhere:
sendJson(res, 200, users);`,
      note: "Centralising the response path means the Content-Type can never be missing, typo'd, or inconsistent — change the policy once and every endpoint follows.",
    },
    {
      label: "Negotiation failing vs succeeding on the wire",
      intro:
        "The same endpoint, two conversations. Left: the client sends XML to a JSON-only API and gets 415. Right: both directions negotiated correctly.",
      php: `# The client's Content-Type isn't supported -> 415
$ curl -i -X POST https://api.acme.dev/users \\
    -H 'Content-Type: application/xml' \\
    -d '<user><email>ada@example.com</email></user>'

HTTP/1.1 415 Unsupported Media Type
Content-Type: application/problem+json

# And if the client demands a format we can't produce -> 406
$ curl -i https://api.acme.dev/users/42 \\
    -H 'Accept: text/xml'

HTTP/1.1 406 Not Acceptable`,
      ts: `# Client declares what it sends AND what it wants back
$ curl -i -X POST https://api.acme.dev/users \\
    -H 'Content-Type: application/json' \\
    -H 'Accept: application/json' \\
    -d '{"email":"ada@example.com"}'

HTTP/1.1 201 Created
Content-Type: application/json
Location: /users/42

{"id":42,"email":"ada@example.com"}`,
      note: "415 rejects the request body's format; 406 rejects the requested response format. Two directions, two status codes.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Custom headers, before and after RFC 6648",
      intro:
        "Both APIs attach a request id and an API version to responses. One mints new X- headers out of habit; the other follows RFC 6648.",
      php: `<?php
// The 2005 reflex: everything custom gets X-
header('X-Acme-Request-Id: ' . $requestId);
header('X-Acme-Api-Version: 2');
header('X-Rate-Limit-Remaining: 58');`,
      ts: `// RFC 6648 (2012): no X- prefix on NEW headers.
// Namespace with your product name instead.
res.setHeader("Acme-Request-Id", requestId);
res.setHeader("Acme-Api-Version", "2");
// Entrenched X- headers (X-Forwarded-For...) keep
// their names — you just don't create new ones.
res.setHeader("RateLimit-Remaining", "58");`,
      note: "RFC 6648 exists because 'experimental' X- headers never got renamed once they shipped — X-Forwarded-For is experimental forever. Name headers as if they're permanent, because they are.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature content negotiator for a server that can produce JSON, CSV, or HTML. For each Accept header, predict which representation wins — watch how q-values beat the server's own preference order, and which request earns a 406.",
    code: `// A miniature content negotiator: parse the Accept header,
// score media types by q-value, pick the best representation.

// What this server can produce, in ITS order of preference:
const available = ["application/json", "text/csv", "text/html"];

interface AcceptEntry {
  type: string;
  q: number;
  specificity: number; // exact > type/* > */*
}

function parseAccept(header: string): AcceptEntry[] {
  return header.split(",").map((part) => {
    const [rawType, ...params] = part.trim().split(";");
    const type = rawType.trim().toLowerCase();
    let q = 1; // no q param means q=1 (RFC 9110)
    for (const p of params) {
      const [key, value] = p.trim().split("=");
      if (key === "q") q = Number(value);
    }
    const specificity = type === "*/*" ? 0 : type.endsWith("/*") ? 1 : 2;
    return { type, q, specificity };
  });
}

function matches(pattern: string, concrete: string): boolean {
  if (pattern === "*/*") return true;
  if (pattern.endsWith("/*")) {
    return pattern.split("/")[0] === concrete.split("/")[0];
  }
  return pattern === concrete;
}

function negotiate(acceptHeader: string): string | null {
  const entries = parseAccept(acceptHeader)
    .filter((e) => e.q > 0) // q=0 means "never send me this"
    .sort((a, b) => b.q - a.q || b.specificity - a.specificity);
  for (const entry of entries) {
    const hit = available.find((t) => matches(entry.type, t));
    if (hit) return hit;
  }
  return null; // nothing acceptable -> respond 406
}

const requests = [
  "application/json",
  "text/html, application/json;q=0.9",
  "text/*;q=0.9, application/json;q=0.4",
  "image/png",
  "*/*",
];

for (const accept of requests) {
  const chosen = negotiate(accept);
  const label = ("Accept: " + accept).padEnd(46);
  console.log(label + "=> " + (chosen ?? "406 Not Acceptable"));
}`,
  },

  keyPoints: [
    "`Content-Type` describes the body being sent (in either direction); `Accept` is the client's preference list for the response — it never describes the request body.",
    "q-values weight preferences: `Accept: text/html, application/json;q=0.9` means HTML first, JSON almost as good; missing `q` means `q=1`, and `q=0` means never.",
    "415 Unsupported Media Type rejects the request body's format; 406 Not Acceptable means you can't produce anything the `Accept` header allows.",
    "Media types are contract identifiers, not just syntax labels: `application/problem+json` names a standard error shape, and `application/vnd.acme.v2+json` names a vendor format + version.",
    "JSON is UTF-8 by definition, so `application/json` needs no charset parameter; `text/*` types do.",
    "RFC 6648 (2012) deprecated the `X-` prefix for new custom headers — use namespaced permanent names like `Acme-Request-Id`.",
  ],

  interview: [
    {
      q: "What's the difference between Content-Type and Accept, and when would an API return 406 vs 415?",
      a: "`Content-Type` describes the body actually being transmitted — the client sets it on its request body, the server sets it on the response body. `Accept` is the client stating which response formats it can consume, optionally weighted with q-values. They fail in opposite directions: if the client sends a request body in a format I don't support — say XML to a JSON-only endpoint — that's a **415 Unsupported Media Type**, because I can't read what was sent. If the client's `Accept` header only lists formats I can't produce, that's a **406 Not Acceptable**, because I can't write what was requested. One request can trigger either, since the two headers negotiate independent directions.",
    },
    {
      q: "Why would an API use a media type like application/vnd.acme.v2+json instead of plain application/json?",
      a: "Because a media type can identify a *contract*, not just a syntax. `application/json` only promises the body parses as JSON. A vendor type like `application/vnd.acme.v2+json` — the `+json` suffix means 'structured as JSON' — names an exact document shape and its version. That enables header-based versioning: a client requests version 2 via `Accept: application/vnd.acme.v2+json` and the URL stays stable, which is how GitHub's API has historically versioned. The same mechanism is why `application/problem+json` is valuable for errors: the media type itself tells the client 'this body follows the RFC 9457 error shape', so generic error-handling middleware can key off the header alone.",
    },
    {
      q: "You need to add a custom header for a request correlation id. What do you call it, and why not X-Request-Id?",
      a: "Something namespaced and permanent-sounding — `Acme-Request-Id` or just `Request-Id` — not a new `X-` name. RFC 6648, from 2012, deprecated the `X-` convention because 'experimental' headers never get renamed once clients depend on them; `X-Forwarded-For` was meant to be temporary and is now effectively a standard with a wrong name (its standardised replacement, the `Forwarded` header, still fights for adoption years later). Existing `X-` headers stay for compatibility, but new headers should be named as if they'll live forever, because they will. In practice I'd also check whether an established header already covers the need before inventing one.",
    },
  ],

  quiz: [
    {
      question:
        "A client sends: POST with 'Content-Type: application/xml' and 'Accept: application/json' to an API that only reads and writes JSON. What should the API return?",
      options: [
        "406 Not Acceptable — the client asked for a format we don't have",
        "415 Unsupported Media Type — we can't parse the XML request body",
        "400 Bad Request — the two headers contradict each other",
        "200 OK — the Accept header is satisfiable, so the request is fine",
      ],
      answerIndex: 1,
      explain:
        "The Accept header (application/json) is satisfiable — the API produces JSON. The problem is the request body: it's XML and the API can't read it, which is exactly what 415 Unsupported Media Type means. 406 would apply only if the Accept header were unsatisfiable. The headers don't contradict each other — they negotiate opposite directions.",
    },
    {
      question:
        "Given 'Accept: text/*;q=0.9, application/json;q=0.4' and a server that prefers to serve application/json but can also produce text/csv, what does the server send?",
      options: [
        "application/json — the server's own preference wins ties",
        "text/csv — the client's q=0.9 for text/* outranks q=0.4 for JSON",
        "406 Not Acceptable — text/* is too vague to match anything",
        "Both, in a multipart response",
      ],
      answerIndex: 1,
      explain:
        "q-values order the client's preferences, and the client rated text/* (0.9) far above application/json (0.4). The wildcard text/* matches text/csv, so the server should serve CSV even though JSON is its own default. The server's preference only breaks ties at equal q.",
    },
    {
      question: "Per RFC 6648, what's the right name for a brand-new custom header carrying your API's deprecation notices?",
      options: [
        "X-Acme-Deprecation — the X- prefix marks it as non-standard",
        "X-Experimental-Deprecation — since it may change later",
        "Acme-Deprecation — a namespaced name with no X- prefix",
        "Custom headers are forbidden; only IANA-registered headers may be sent",
      ],
      answerIndex: 2,
      explain:
        "RFC 6648 deprecated the X- convention in 2012: experimental headers never get renamed once deployed, so new headers should get their permanent, ideally namespaced, name from day one. Custom headers are perfectly legal — the guidance is about naming, not permission.",
    },
  ],
};

export default lesson;
