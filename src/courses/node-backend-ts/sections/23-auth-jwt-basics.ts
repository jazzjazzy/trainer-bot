import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "auth-jwt-basics",
  title: "Stateless Auth: JWTs and Sessions Rethought",
  part: "Production Hardening",
  estMinutes: 13,
  summary:
    "Replace session_start() thinking with stateless JWTs: sign and verify tokens with jsonwebtoken, attach req.user in middleware, hash passwords with bcrypt, and know exactly what a JWT does and doesn't hide.",

  concept: `
Twenty-five years of PHP auth boils down to two lines: \`session_start()\` and
\`$_SESSION['user_id'] = $id\`. Behind them, PHP wrote a session file on the
server, handed the browser a \`PHPSESSID\` cookie, and re-read the file on every
request. The **state lived on the server**; the cookie was just a key to it.

Node APIs usually flip this: the state lives **in the token itself**, signed
so it can't be forged. That's a JWT — and going stateless is a natural fit for
APIs serving SPAs and mobile apps across multiple servers, because no server
has to remember anything between requests.

### Anatomy: header.payload.signature

A JWT is three base64url-encoded segments joined by dots:

- **header** — \`{"alg":"HS256","typ":"JWT"}\`: which algorithm signed it.
- **payload** — the claims: \`sub\` (user id), \`role\`, \`iat\` (issued at),
  \`exp\` (expiry), plus anything you add.
- **signature** — a cryptographic signature over \`header.payload\`.

Burn this in: **base64url is an encoding, not encryption**. Anyone holding a
JWT can read every claim with two \`atob\` calls. The signature only proves the
token wasn't *modified* and was issued by someone holding the key. Never put
secrets in a payload — only non-sensitive claims.

### Signing and verifying with jsonwebtoken

\`\`\`ts
import jwt from "jsonwebtoken";

// login: verify credentials, then issue
const token = jwt.sign(
  { sub: String(user.id), role: user.role },
  process.env.JWT_SECRET!,
  { expiresIn: "15m" },        // sets the exp claim
);

// on every request: verify signature + expiry
const claims = jwt.verify(token, process.env.JWT_SECRET!);
// throws TokenExpiredError / JsonWebTokenError on failure
\`\`\`

**HS256 vs RS256**, honestly: HS256 is a shared-secret HMAC — the same key
signs and verifies, which is simple and fine when one service does both.
RS256 is a key *pair* — the private key signs, and any service holding only
the public key can verify. Choose RS256 when other services (or an identity
provider like Auth0/Keycloak) must verify tokens they didn't issue, so the
signing key never leaves the issuer.

### The auth middleware

Verification belongs in middleware that attaches the user to the request —
using the \`declare global\` / declaration-merging trick to extend Express's
\`Request\` type so \`req.user\` is typed everywhere:

\`\`\`ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as AuthClaims;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
\`\`\`

Because access tokens are short-lived (\`15m\` is typical), clients hold a
second, long-lived **refresh token** — stored server-side or as an httpOnly
cookie — that they exchange for fresh access tokens. That's the compromise
that makes stateless auth revocable-ish: you can't un-issue an access token,
but you can refuse to refresh it.

### Where the client keeps the token

Two camps, one honest note. \`localStorage\` is convenient but readable by any
JavaScript on the page — one XSS hole and the token is stolen. An **httpOnly
cookie** is invisible to JavaScript (XSS can't exfiltrate it) but rides along
automatically, so you must handle CSRF (SameSite attributes help a lot). Many
teams land on: access token in memory, refresh token in an httpOnly cookie.
And when you genuinely want PHP-style server-side sessions — admin panels,
server-rendered apps — \`express-session\` with a Redis store exists and is
respectable; stateless isn't a law.

### Passwords: you already know this

\`bcrypt\` is PHP's \`password_hash()\`/\`password_verify()\` with the API
renamed — PHP's default algorithm *is* bcrypt. \`await bcrypt.hash(pw, 12)\`
salts and hashes; \`await bcrypt.compare(pw, hash)\` verifies. Use the async
forms: hashing is deliberately CPU-expensive, and the sync variants would
block the event loop for every user — argon2 (of \`PASSWORD_ARGON2ID\` fame)
is available as the \`argon2\` package if you want the newer algorithm.
`,

  comparisons: [
    {
      label: "Login + authenticated request: $_SESSION vs JWT",
      intro:
        "A user logs in with email and password, then makes an authenticated request. PHP stores state on the server and hands out a pointer; the JWT version hands out the (signed) state itself.",
      php: `<?php
// login.php — state lives in a server-side file
session_start();

$user = findUserByEmail($_POST['email']);
if (!$user ||
    !password_verify($_POST['password'], $user->hash)) {
    http_response_code(401);
    exit;
}
$_SESSION['user_id'] = $user->id;   // server remembers
$_SESSION['role']    = $user->role;
// browser gets: Set-Cookie: PHPSESSID=abc123

// profile.php — every request re-reads the file
session_start();
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    exit;
}
echo json_encode(getProfile($_SESSION['user_id']));`,
      ts: `// src/routes/auth.ts — state lives in the token
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

router.post("/login", async (req, res) => {
  const user = await findUserByEmail(req.body.email);
  const ok = user &&
    (await bcrypt.compare(req.body.password, user.hash));
  if (!ok) {
    res.status(401).json({ error: "Bad credentials" });
    return;
  }
  const token = jwt.sign(
    { sub: String(user.id), role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" },
  );
  res.json({ token }); // server remembers NOTHING
});

// any authenticated route
router.get("/profile", requireAuth, async (req, res) => {
  res.json(await getProfile(req.user.sub));
});`,
      note: "PHP's cookie was a key to server-side state; the JWT IS the state, signed. That's why any replica can verify it with no session storage — and why you can't revoke it before exp without extra machinery.",
    },
    {
      label: "Password hashing: password_hash vs bcrypt",
      intro:
        "Hash a password at registration and verify it at login. The theory is identical — PHP's default algorithm is literally bcrypt — only the API changes.",
      php: `<?php
// register
$hash = password_hash($password, PASSWORD_DEFAULT);
// => "$2y$10$fEqNCco3Yq9h5ZUglD3CZJ..."
// salt generated + embedded automatically

// login
if (password_verify($password, $user->hash)) {
    // constant-time comparison inside
}

// upgrade old hashes transparently
if (password_needs_rehash($user->hash,
        PASSWORD_DEFAULT)) {
    $user->hash = password_hash($password,
        PASSWORD_DEFAULT);
}`,
      ts: `import bcrypt from "bcrypt";

// register — cost factor 12 ~ PHP's "cost" option
const hash = await bcrypt.hash(password, 12);
// => "$2b$12$LJ3m4yI0v1..."
// salt generated + embedded automatically

// login
if (await bcrypt.compare(password, user.hash)) {
  // constant-time comparison inside
}

// ALWAYS the async forms: hashing is deliberately
// slow (~100ms). bcrypt.hashSync would freeze the
// event loop for EVERY concurrent user while it
// grinds — the classic Node footgun.`,
      note: "Same algorithm, same embedded-salt format, same verify pattern — the one Node-specific rule is async-only, because a deliberately slow hash on the event loop stalls every request in flight.",
    },
    {
      label: "Reading the current user in a handler",
      intro:
        "Deep in a request handler you need the authenticated user's id and role. PHP reached into a superglobal; Express reads what the auth middleware attached — and TypeScript knows its shape.",
      php: `<?php
// anywhere, after session_start()
$userId = $_SESSION['user_id'] ?? null;
$role   = $_SESSION['role'] ?? 'guest';

if ($role !== 'admin') {
    http_response_code(403);
    exit;
}
// $userId is mixed — a typo like
// $_SESSION['user_Id'] is just null`,
      ts: `// src/types/express.d.ts — declaration merging
declare global {
  namespace Express {
    interface Request {
      user?: { sub: string; role: "admin" | "user" };
    }
  }
}

// in a handler behind requireAuth
router.delete("/users/:id", requireAuth, (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // req.user.sub is typed as string — a typo like
  // req.user.subb is a compile error
});`,
      note: "The middleware verified the token once and attached typed claims; handlers read req.user instead of a stringly-typed superglobal, and the compiler catches misspelled keys.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Decode a real JWT by hand — no library, just base64url and JSON.parse. Predict what the payload reveals before running, then check the exp claim against two fixed dates. The lesson that sticks: anyone can READ a JWT; only forging one requires the secret.",
    code: `// A real JWT: three base64url segments joined by dots.
const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJzdWIiOiI0MiIsIm5hbWUiOiJKYXNvbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2NDU0NzIwMCwiZXhwIjoxNzY3MjI1NjAwfQ" +
  ".u3kM9XcVp2nQ8rT5wYzA1bC4dE6fG7hJ0kL2mN3oP4q"; // signature: opaque bytes

// base64url -> base64 -> text (what jwt.io does in your browser)
function b64urlDecode(seg: string): string {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

const [headerSeg, payloadSeg, signatureSeg] = token.split(".");

// No secret needed to READ the token:
const header = JSON.parse(b64urlDecode(headerSeg));
const payload = JSON.parse(b64urlDecode(payloadSeg));

console.log("header: ", JSON.stringify(header));
console.log("payload:", JSON.stringify(payload));
console.log("signature (cannot be decoded — it's a signature, not data):",
  signatureSeg.slice(0, 12) + "...");

// exp is a unix timestamp in SECONDS (PHP time()-style, not Date.now() ms)
const expiresAt = new Date(payload.exp * 1000);
console.log("issued: ", new Date(payload.iat * 1000).toISOString());
console.log("expires:", expiresAt.toISOString());

// jwt.verify checks exp for you; here we do it by hand for two fixed "nows":
function isExpired(nowIso: string): string {
  const now = Date.parse(nowIso) / 1000;
  return now >= payload.exp
    ? "EXPIRED — verify() would throw TokenExpiredError"
    : "valid for " + Math.round((payload.exp - now) / 86400) + " more day(s)";
}

console.log("at 2025-12-15:", isExpired("2025-12-15T00:00:00Z"));
console.log("at 2026-02-01:", isExpired("2026-02-01T00:00:00Z"));

// We read sub, name, role, iat, exp — WITHOUT any secret.
// The secret is only needed to produce a signature that verifies.
console.log("moral: never put anything secret in a JWT payload.");`,
  },

  keyPoints: [
    "PHP sessions kept auth state on the server and gave the browser a pointer (PHPSESSID); JWTs put signed state in the token itself, so any replica can verify with zero shared session storage.",
    "A JWT is header.payload.signature in base64url — an ENCODING, not encryption: anyone can read the claims, so never put secrets in the payload.",
    "jsonwebtoken: `jwt.sign(claims, secret, { expiresIn: '15m' })` to issue, `jwt.verify(token, secret)` to check signature and expiry — it throws `TokenExpiredError` / `JsonWebTokenError` on failure.",
    "HS256 = one shared secret signs and verifies (fine within one service); RS256 = private key signs, public key verifies (for third-party verification and identity providers).",
    "Auth middleware verifies once and attaches `req.user`, typed via declaration merging on Express's `Request`; short-lived access tokens pair with a refresh token, since a stateless token can't be revoked before its exp.",
    "bcrypt maps 1:1 to password_hash/password_verify (PHP's default IS bcrypt) — but only use the async `hash`/`compare`, because a deliberately slow sync hash blocks the event loop for every user.",
  ],

  interview: [
    {
      q: "Compare PHP-style sessions with JWT auth. When would you still choose sessions?",
      a: "PHP sessions are stateful: the server stores the session data and the cookie is just a key, so revocation is trivial — delete the server-side record — but every replica needs access to the shared session store. JWTs invert that: the claims live in a signed token the client carries, so any instance can verify it with just the key, which scales beautifully for APIs and mobile clients — but you can't revoke an issued token before its exp, which is why access tokens are short-lived and paired with refresh tokens. I'd still choose sessions — express-session with a Redis store — for a server-rendered app or admin panel where instant revocation and simple logout matter more than statelessness. The honest answer is it's a trade-off between revocability and shared-nothing scaling, not a fashion choice.",
    },
    {
      q: "What exactly does a JWT's signature protect, and what doesn't it protect?",
      a: "The signature is computed over the header and payload with the key — HMAC for HS256, an RSA private key for RS256. It proves integrity and authenticity: the token was issued by a key-holder and hasn't been altered, so if someone flips role: 'user' to 'admin', verification fails. What it does NOT do is hide anything: the payload is plain base64url, readable by anyone with two atob calls, so claims must never contain secrets. It also doesn't protect against theft — a stolen token is valid until exp regardless of who presents it, which is why short expiries, https-only transport, and careful client-side storage matter as much as the signature.",
    },
    {
      q: "HS256 vs RS256 — how do you choose?",
      a: "HS256 is an HMAC with a single shared secret: whoever can verify can also sign. That's perfectly fine when one service both issues and verifies its own tokens — it's simpler and the keys are just strings. RS256 uses a key pair: the issuer signs with the private key, and verifiers only need the public key, which can be published freely. I'd reach for RS256 the moment more than one party needs to verify — microservices validating tokens issued by an auth service, or integrating an identity provider like Auth0 or Keycloak, which expose their public keys via JWKS. The rule of thumb: shared secret for one trust domain, key pair when verification must be distributed without spreading the ability to mint tokens.",
    },
    {
      q: "Where should a browser client store its JWT — localStorage or a cookie?",
      a: "Both have a real weakness, so I give the balanced answer. localStorage is readable by any JavaScript on the page, so a single XSS vulnerability means stolen tokens; it's convenient but the riskier default. An httpOnly cookie can't be read by scripts at all — XSS can't exfiltrate it — but because it's attached automatically, you inherit CSRF concerns, largely mitigated with SameSite=Lax or Strict plus CSRF tokens for state-changing routes. A common production pattern is the access token held only in memory and the refresh token in an httpOnly, Secure, SameSite cookie, so a page reload does a silent refresh rather than reading persistent storage. What I'd avoid is presenting either option as risk-free — interviewers usually want to hear the XSS-vs-CSRF trade-off stated plainly.",
    },
  ],

  quiz: [
    {
      question:
        "A colleague wants to store a user's API key for a third-party service inside the JWT payload 'since it's encoded'. What's wrong?",
      options: [
        "Nothing — the signature encrypts the payload",
        "base64url is a reversible encoding, not encryption: anyone holding the token can read every claim without any key",
        "It's fine as long as the token uses RS256",
        "JWT payloads only accept the registered claims like sub and exp",
      ],
      answerIndex: 1,
      explain:
        "The payload is just base64url-encoded JSON — atob and JSON.parse reveal it, no secret required. The signature proves the token wasn't modified; it hides nothing. Custom claims are allowed, but they must be non-sensitive.",
    },
    {
      question:
        "Why do stateless JWT setups pair a 15-minute access token with a long-lived refresh token?",
      options: [
        "Short tokens are faster to verify",
        "You cannot revoke an already-issued JWT before its exp, so a short life bounds the damage while refresh (which you CAN refuse) keeps users logged in",
        "The JWT spec sets a maximum lifetime of 15 minutes",
        "Refresh tokens are needed to rotate the HS256 secret",
      ],
      answerIndex: 1,
      explain:
        "A verified JWT is valid until exp no matter what — there's no server-side record to delete. Short expiry limits how long a stolen or stale token works, and the refresh exchange is the checkpoint where the server can say no (user banned, password changed), restoring a measure of revocability.",
    },
    {
      question:
        "Why must you use bcrypt's async hash/compare rather than the Sync variants in a Node API?",
      options: [
        "The sync variants use a weaker salt",
        "bcrypt hashing is deliberately CPU-slow, and a synchronous call blocks the event loop — stalling every concurrent request, not just the one logging in",
        "hashSync is deprecated and removed in Node 22",
        "Async hashing produces shorter hashes",
      ],
      answerIndex: 1,
      explain:
        "bcrypt's whole point is costing ~100ms of CPU. In PHP that cost hit one process serving one request; in Node a hashSync call freezes the single event loop, so every user in flight waits. The async API runs the work on the libuv threadpool, keeping the loop free.",
    },
    {
      question: "In the middleware pattern, what does requireAuth attach and how is it typed?",
      options: [
        "It stores claims in a global variable, typed as any",
        "It sets res.locals.session, typed via a generics parameter",
        "It attaches verified claims as req.user, typed by declaration-merging an interface into Express's Request",
        "It re-issues a new token on every request and returns it in a header",
      ],
      answerIndex: 2,
      explain:
        "The middleware verifies the Bearer token once, attaches the decoded claims to req.user, and calls next(). A declare global block merging into Express.Request gives req.user a real type everywhere — the typed replacement for reaching into $_SESSION.",
    },
  ],
};

export default lesson;
