import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "api-keys-and-service-auth",
  title: "API Keys & Service Auth",
  part: "Auth & Access Control",
  estMinutes: 11,
  summary:
    "API keys identify client applications, not people — done properly they're prefixed, stored as hashes, scoped, rotatable, and sent in the Authorization header, never a query string.",

  concept: `
Sessions, JWTs, and OAuth all answered "which *person* is calling?". API keys
answer a different question: "which *client application* is calling?" — a
partner's integration, a customer's script, your own CLI. There's no login
ceremony and no user consent; the key both identifies the client and proves
it. That makes an API key a **credential**, and the design rule follows:
treat it exactly like a password.

### Anatomy of a good key

Stripe made the shape famous: \`sk_live_4eC39HqLyjWDarjtT1zdp7dc\`.

- **Prefix** (\`sk_live_\`) — identifies the key *type* and environment at a
  glance. A test key in production config becomes visible in code review,
  and secret-scanning tools (GitHub's among them) can recognise leaked keys
  in public commits by their prefix and alert or revoke.
- **Random secret** — long, from a CSPRNG (\`crypto.randomBytes\`, not
  \`Math.random()\`). The key encodes no data; it's pure entropy plus a
  lookup record on your side.

### Store the hash, never the key

Keys are passwords, so the plaintext-password rules apply: show the full key
**once** at creation, store only a **hash**, and compare hashes at
verification time. A leaked database then contains nothing usable. Because
keys are high-entropy (unlike human passwords), a fast hash like SHA-256 is
the accepted practice — you don't need bcrypt's deliberate slowness to
resist brute force here. Keep the first few characters (\`sk_live_9f2k\`)
in a separate plaintext column for lookup and for display in dashboards.
When comparing, use a **constant-time comparison** (Node ships
\`crypto.timingSafeEqual\`) so response timing can't leak how many bytes
matched.

### Scope it, expire it, rotate it

A key that can do everything is an outage waiting for a leak. Attach
**scopes** (\`orders:read\`, \`webhooks:manage\`) checked exactly like OAuth
scopes, and an optional expiry. **Rotation** must be routine, not an
emergency procedure: issue a new key while the old one still works, let the
client migrate, then revoke the old one. Two valid keys per client during
the **overlap window** is the feature — rotation with downtime never happens,
and rotation that never happens is how five-year-old keys end up in a
contractor's dotfiles. Tracking \`last_used_at\` tells you when the old key
has gone quiet and is safe to revoke.

### Transport: header, never URL

Send keys as \`Authorization: Bearer sk_live_...\` (or a dedicated
\`X-Api-Key\` header). Never in the query string: URLs are logged verbatim
by access logs, proxies, and CDNs, saved in browser history, and leaked in
\`Referer\` headers — a key in a URL is a key in a dozen log files you
don't control.

### When a key isn't enough

API keys are static bearer secrets: no expiry ceremony, no proof of
possession. When the machine-to-machine relationship needs more — short-lived
credentials, standard scoping and consent, audit trails — step up to the
**client-credentials OAuth flow** (the client trades its credentials for a
short-lived access token) or **mTLS**, where the client proves itself with a
certificate during the TLS handshake. Rule of thumb: keys for simple,
low-blast-radius integrations; client-credentials for anything internal at
scale; mTLS where infrastructure supports it and the stakes justify it.
The signing discipline you build here — shared secret, hash comparison —
returns when webhooks need HMAC signatures.
`,

  comparisons: [
    {
      label: "Plaintext key equality vs prefix lookup + hashed comparison",
      intro:
        "Both endpoints authenticate a machine client by its API key. One compares a query parameter against a plaintext column; the other looks up by prefix and compares hashes in constant time, then enforces scopes.",
      php: `<?php // api.php?api_key=abc123 — every mistake at once
$key = $_GET['api_key'];   // key in the URL: logged everywhere

$stmt = $pdo->prepare('SELECT * FROM clients WHERE api_key = ?');
$stmt->execute([$key]);    // plaintext column: DB dump = all keys
$client = $stmt->fetch();

if (!$client) {
    http_response_code(401);
    exit;
}
// No scopes: any key can hit any endpoint.
// No expiry, no rotation — 'abc123' was set in 2019.
echo json_encode(get_all_orders());`,
      ts: `// middleware/api-key.ts — hash at rest, constant-time compare, scopes
import { createHash, timingSafeEqual } from "node:crypto";

export async function requireApiKey(req: Req, res: Res, next: Next) {
  const key = req.headers.authorization?.replace(/^Bearer /, "");
  if (!key) return res.status(401).json(problem(401, "Missing API key"));

  // Plaintext prefix column finds the record; the hash proves the key.
  const record = await db.apiKeys.findByPrefix(key.slice(0, 12));
  const presented = createHash("sha256").update(key).digest();

  if (!record || !timingSafeEqual(presented, record.keyHash)) {
    return res.status(401).json(problem(401, "Invalid API key"));
  }
  if (record.expiresAt && record.expiresAt < new Date()) {
    return res.status(401).json(problem(401, "API key expired"));
  }

  req.client = { id: record.clientId, scopes: record.scopes };
  next(); // handlers still check scopes: client.scopes.includes("orders:read")
}`,
      note:
        "Header not URL, hash not plaintext, constant-time not ==, and a scope list instead of all-or-nothing — the key is identification AND a credential, so it gets password-grade handling.",
    },
    {
      label: "Where the key travels: query string vs Authorization header",
      intro:
        "The same request made two ways. Follow where the key ends up in each case — the access log lines tell the story.",
      php: `# Key in the query string
$ curl "https://api.example.com/v1/orders?api_key=sk_live_9f2kQ7pLmXw3"

# That key is now in the server's access log, verbatim:
203.0.113.9 - - [07/Jul/2026:10:01:22 +0000]
  "GET /v1/orders?api_key=sk_live_9f2kQ7pLmXw3 HTTP/1.1" 200 5121

# ...and in every proxy and CDN log along the path, the client's
# shell history, and any Referer header if this URL is ever a link.
# Rotating it means finding all of those first.`,
      ts: `# Key in the Authorization header
$ curl https://api.example.com/v1/orders \\
    -H "Authorization: Bearer sk_live_9f2kQ7pLmXw3"

# The access log records only the path:
203.0.113.9 - - [07/Jul/2026:10:01:22 +0000]
  "GET /v1/orders HTTP/1.1" 200 5121

HTTP/1.1 200 OK
Content-Type: application/json

# Headers aren't written to standard access logs — the key's
# exposure is limited to the TLS-protected request itself.`,
      note:
        "Access logs record the request line — query string included — by default everywhere; headers they don't. One transport choice removes a dozen leak points.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "What the database remembers about a key",
      intro:
        "Two versions of the stored record for the same client's key. Ask of each: what does an attacker gain by dumping this table, and can this client rotate without downtime?",
      php: `{
  "id": 311,
  "client": "Acme Integration",
  "api_key": "abc123",
  "created_at": "2019-03-14"
}`,
      ts: `{
  "id": 311,
  "client": "Acme Integration",
  "key_prefix": "sk_live_9f2k",
  "key_hash": "sha256:1c9f4ae0b7...",
  "scopes": ["orders:read", "webhooks:manage"],
  "expires_at": "2026-10-01T00:00:00Z",
  "last_used_at": "2026-07-06T08:12:44Z",
  "created_at": "2026-04-01T00:00:00Z",
  "rotated_from": "sk_live_8xw1"
}`,
      note:
        "The right-hand record leaks no usable credential if dumped, enforces least privilege via scopes, and last_used_at + rotated_from make overlap-window rotation observable and safe.",
      leftLang: "json",
      rightLang: "json",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The full key lifecycle in miniature: issue a prefixed key, store only its hash, verify with a constant-time-style loop, and reject a tampered key. Predict the three verification outcomes before running. The hash and 'randomness' are illustrative stand-ins for crypto.randomBytes, SHA-256, and crypto.timingSafeEqual.",
    code: `// API-key lifecycle: issue a prefixed key, store only a hash, verify with a
// constant-time-STYLE comparison. toyHash + the seeded generator are
// illustrative — real code uses crypto.randomBytes, SHA-256, and
// crypto.timingSafeEqual.

function toyHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h = ((h ^ input.charCodeAt(i)) * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Deterministic stand-in for crypto.randomBytes so every run matches.
let seed = 42;
function pseudoRandomChar(): string {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return alphabet[seed % alphabet.length];
}

interface KeyRecord {
  prefix: string;   // first chars, kept in clear for lookup + display
  hash: string;     // hash of the FULL key — never the key itself
  scopes: string[];
}
const keyStore: KeyRecord[] = [];

function issueKey(env: "live" | "test", scopes: string[]): string {
  let secret = "";
  for (let i = 0; i < 24; i++) secret += pseudoRandomChar();
  const key = "sk_" + env + "_" + secret;
  keyStore.push({ prefix: key.slice(0, 12), hash: toyHash(key), scopes });
  return key; // shown ONCE at creation; only the hash survives
}

// Compare every character even after a mismatch, so timing does not
// reveal how many leading characters were correct.
function constantTimeStyleEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function verify(presented: string): string {
  const record = keyStore.find((k) => presented.startsWith(k.prefix));
  if (!record) return "DENY  — no key with that prefix";
  if (!constantTimeStyleEqual(toyHash(presented), record.hash)) {
    return "DENY  — hash mismatch (tampered or revoked)";
  }
  return "ALLOW — scopes: " + record.scopes.join(", ");
}

const key = issueKey("live", ["orders:read", "orders:write"]);
console.log("Issued (shown once):  " + key);
console.log("Stored record:        " + JSON.stringify(keyStore[0]));

console.log("Genuine key:          " + verify(key));

const tampered = key.slice(0, key.length - 1) + (key.endsWith("x") ? "y" : "x");
console.log("Tampered last char:   " + verify(tampered));

console.log("Unknown key:          " + verify("sk_live_totallymadeupkey12345"));`,
  },

  keyPoints: [
    "API keys identify a CLIENT application; user auth identifies a PERSON — a key is both identifier and credential, so it gets password-grade handling.",
    "Prefix keys (`sk_live_...`) so environment is visible at a glance and secret-scanning tools can recognise leaks; generate the secret from a CSPRNG.",
    "Show the full key once, store only a hash (fast SHA-256 is fine for high-entropy keys) plus a plaintext prefix for lookup; compare with `crypto.timingSafeEqual`.",
    "Scope every key (`orders:read`) and rotate with an overlap window — two valid keys per client during migration is the feature that makes rotation routine.",
    "Send keys via `Authorization: Bearer ...`, never query strings — URLs land verbatim in access logs, proxy logs, browser history, and Referer headers.",
    "When static keys aren't enough — expiry, audit, proof of possession — step up to client-credentials OAuth or mTLS for service-to-service auth.",
  ],

  interview: [
    {
      q: "Design an API key system for third-party integrations. What does 'done properly' look like?",
      a: "Keys shaped like `sk_live_` plus 24-plus random characters from a CSPRNG — the prefix identifies type and environment and lets secret scanners catch leaks in public repos. I show the full key once at creation and store only a SHA-256 hash, with the first dozen characters in a plaintext prefix column for lookup and dashboard display; verification hashes the presented key and compares with `crypto.timingSafeEqual`. Every key carries scopes checked like OAuth scopes, an optional expiry, and a `last_used_at` timestamp. Rotation is first-class: issue a replacement while the old key still works, watch `last_used_at` go quiet, then revoke — the overlap window is what makes rotation routine instead of an outage. Transport is the Authorization header only, never query strings, because URLs are logged everywhere.",
    },
    {
      q: "Why store only a hash of the API key when the key is random anyway?",
      a: "Because the key is a credential, and the database will eventually be read by someone it shouldn't be — a dump, a misconfigured backup, an over-permissioned analytics job. If the column holds hashes, that event leaks nothing replayable; if it holds plaintext, every client of yours is compromised at once. The difference from passwords is that high entropy means I don't need a deliberately slow hash — SHA-256 is fine, since brute-forcing 128+ bits of randomness is not a realistic attack the way dictionary attacks on human passwords are. The operational cost is trivial: hash on issue, hash on verify, keep a short plaintext prefix for lookup.",
    },
    {
      q: "What's wrong with accepting the API key as a query parameter?",
      a: "Query strings are logged verbatim, everywhere, by default: your access logs, every reverse proxy and CDN on the path, the client's shell history, and potentially outbound `Referer` headers. A credential in the URL is a credential scattered across log systems with different retention and access rules — you can't rotate a key out of a backup of someone else's proxy logs. Headers avoid all of that because standard access-log formats record the request line, not headers. TLS encrypts both in transit, so this isn't about the wire — it's about where the request line gets written down afterwards. Same reasoning applies to tokens generally, which is why Bearer auth lives in a header.",
    },
    {
      q: "When would you move from API keys to client-credentials OAuth or mTLS?",
      a: "API keys are static bearer secrets — anyone holding one is the client, forever, until rotation. That's acceptable for simple, low-blast-radius integrations. I'd step up to client-credentials OAuth when I want short-lived credentials and standardised scoping: the client authenticates to the token endpoint and gets an access token that expires in minutes, so a leaked token has a tiny window and services validate tokens uniformly instead of hitting a key table. I'd use mTLS where the infrastructure supports it — service meshes, banking-grade partner APIs — because a client certificate is proof of possession, not a bearer secret: intercepting traffic doesn't yield a replayable credential. In practice: keys at the edge for third parties, client-credentials internally, mTLS where stakes and tooling justify it.",
    },
  ],

  quiz: [
    {
      question: "Why do well-designed API keys start with a prefix like sk_live_?",
      options: [
        "The prefix is a checksum that validates the key offline",
        "It identifies key type/environment at a glance and lets secret scanners recognise leaked keys",
        "It encrypts the rest of the key so the database can store it safely",
        "HTTP requires Bearer credentials to carry a type prefix",
      ],
      answerIndex: 1,
      explain:
        "The prefix carries no secret and no checksum — it makes keys identifiable: a test key in production config is visible in review, dashboards can show which key is which, and scanning tools (like GitHub secret scanning) can match leaked keys in public commits by their known prefixes.",
    },
    {
      question:
        "Unlike user passwords, API keys are commonly hashed with fast SHA-256 rather than bcrypt. Why is that acceptable?",
      options: [
        "API keys are less sensitive than passwords",
        "bcrypt output is too long to store in most databases",
        "Randomly generated keys have high entropy, so brute-forcing the hash is infeasible even with a fast hash",
        "It isn't acceptable — keys must always use a slow hash",
      ],
      answerIndex: 2,
      explain:
        "Slow hashes exist to make dictionary and brute-force attacks on low-entropy human passwords expensive. A CSPRNG-generated key has 128+ bits of entropy — no feasible enumeration exists at any hash speed — so a fast hash gives the at-rest protection without per-request cost.",
    },
    {
      question: "What makes key rotation with an overlap window the recommended approach?",
      options: [
        "It lets the client migrate to the new key with zero downtime before the old one is revoked",
        "It halves the number of hash comparisons during verification",
        "Old keys automatically become read-only during the overlap",
        "It's required by the OAuth 2.0 specification",
      ],
      answerIndex: 0,
      explain:
        "Rotation that requires a synchronized cutover never gets done, and stale keys accumulate. Issuing the new key while the old remains valid, watching last_used_at go quiet, then revoking makes rotation a routine, safe operation — which is the real security win.",
    },
    {
      question: "Why must the API key travel in the Authorization header rather than the query string?",
      options: [
        "Query strings are size-limited to 256 characters",
        "TLS encrypts headers but not query strings",
        "Header values are automatically hashed by the server",
        "URLs are written verbatim to access logs, proxy/CDN logs, history, and Referer headers",
      ],
      answerIndex: 3,
      explain:
        "TLS protects both on the wire — the danger is what gets written down afterwards. Standard access-log formats record the full request line including the query string, but not headers, so a key in the URL ends up in log systems you don't control and can't purge.",
    },
  ],
};

export default lesson;
