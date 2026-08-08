import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "jwt-in-practice",
  title: "JWTs in Practice",
  part: "Auth & Access Control",
  estMinutes: 13,
  summary:
    "JWT anatomy and claims, HS256 vs RS256, why stateless verification trades away revocation, and the classic vulnerabilities — alg:none, algorithm confusion, weak secrets, missing aud/iss checks.",

  concept: `
A JSON Web Token is three base64url segments joined by dots:

\`\`\`bash
eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiJ1c2VyXzg0MjEiLCJleHAiOjE3NTAwMDM2MDB9 . 3kf9...
#      header        .              payload                             . signature
\`\`\`

The single most important fact: base64url is **encoding, not encryption**.
Anyone holding the token — a browser extension, a proxy log, the user
themselves — can read the header and payload with two lines of code. The
signature makes the token *tamper-evident*, not *secret*. Never put
passwords, PII, or anything you wouldn't print in a log line into the
payload.

### The registered claims

The payload is a JSON object of **claims**. The ones that matter daily:

- \`sub\` — subject: who the token is about (\`"user_8421"\`)
- \`exp\` / \`iat\` — expiry and issued-at, as Unix timestamps
- \`iss\` — issuer: which service minted it (\`"https://auth.acme.dev"\`)
- \`aud\` — audience: which service it was minted *for* (\`"acme-api"\`)

A verifier must check **all of them** — signature first, then \`exp\`, then
that \`iss\` and \`aud\` match its own expectations. Skipping \`aud\` means a
perfectly valid token minted for some *other* service in your ecosystem gets
accepted by yours.

### HS256 vs RS256

- **HS256** (HMAC + shared secret): whoever can *verify* can also *mint*.
  Fine when the signer and verifier are the same service or a tightly trusted
  pair. The secret must be long and random — HMAC with a guessable secret is
  brute-forced offline with tools like hashcat.
- **RS256 / ES256** (asymmetric): the auth server signs with a private key;
  any number of services verify with the public key (usually fetched from a
  JWKS URL). Verifiers *cannot* mint tokens. This is the shape you want the
  moment there's one signer and many verifiers — which is most real
  microservice and OIDC setups.

### The trade everyone asks about: stateless vs revocable

JWT verification is a local computation — no session store, no network hop.
That's the selling point: any service holding the key material can
authenticate a request by itself. The price is that **you cannot take a
token back**. A signed token is valid until \`exp\`, full stop; there's no
server-side record to delete when the user logs out or the account is
compromised.

The standard mitigation: **short-lived access tokens** (5–15 minutes)
paired with **refresh tokens** that *are* stored server-side and can be
revoked. Logout deletes the refresh token; the access token dies of natural
causes within minutes. Rotate refresh tokens on every use and treat reuse of
an old one as theft — revoke the whole family. If even minutes of exposure
is unacceptable, you add a denylist checked on each request (keyed by the
\`jti\` claim)… at which point you've rebuilt the session store you were
avoiding. Saying that sentence out loud in an interview lands well.

### The classic vulnerabilities

Every one of these has shipped in production libraries or apps:

- **\`alg: "none"\`** — the header claims the token is unsigned and a naive
  verifier agrees. Never let the *token* choose how it's verified; the
  server pins the expected algorithm.
- **Algorithm confusion** — attacker takes an RS256 setup, crafts a token
  with \`alg: HS256\`, and signs it using the *public* key as the HMAC
  secret. Verifiers that pass one key into a do-everything verify() call
  have been burned repeatedly. Same rule: pin the algorithm.
- **Weak HMAC secrets** — \`"secret"\`, the app name, anything guessable:
  offline brute force, then the attacker mints arbitrary admin tokens.
- **Missing \`aud\`/\`iss\` checks** — a valid token from the same issuer for
  a different audience (or a different tenant's issuer) is accepted.

None of this means hand-rolling: in TypeScript you reach for a vetted
library (\`jose\` is the modern standard), give it the key, the pinned
algorithm, and the expected \`iss\`/\`aud\`, and let it enforce the rest.
`,

  comparisons: [
    {
      label: "Decode-and-trust vs verify-then-trust",
      intro:
        "Both handlers read the user id out of a bearer token. One decodes the payload and believes it; the other refuses to look at the claims until signature, expiry, issuer, and audience have all passed.",
      php: `<?php // api.php — reads the payload, checks nothing
$jwt = str_replace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION'] ?? '');
[$h, $p, $s] = explode('.', $jwt);

// base64 is NOT a signature check. Anyone can craft
// {"sub":"admin","exp":9999999999}, encode it, and be admin.
$claims = json_decode(base64_decode(strtr($p, '-_', '+/')), true);
$userId = $claims['sub'];   // attacker-controlled
loadDashboard($pdo, $userId);`,
      ts: `// api.ts — nothing is trusted until every check passes (jose)
import { jwtVerify } from "jose";

app.get("/dashboard", async (req, res) => {
  const token = req.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return res.status(401).json(problem(401, "Missing token"));

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ["RS256"],          // pinned — token can't choose
      issuer: "https://auth.acme.dev", // iss must match
      audience: "acme-api",            // aud must match
      // exp/nbf are enforced by jwtVerify automatically
    });
    loadDashboard(res, payload.sub!); // NOW the claims mean something
  } catch {
    return res.status(401).json(problem(401, "Invalid token"));
  }
});`,
      note:
        "The PHP version treats decoding as authentication — the fatal JWT misunderstanding. The TS version pins the algorithm and checks signature, exp, iss, and aud before a single claim is believed.",
    },
    {
      label: "Where the token lives: localStorage vs HttpOnly cookie",
      intro:
        "The SPA must store its access token somewhere. Each home trades one attack surface for another — know which one you're accepting.",
      php: `// auth.js — token in localStorage
const { accessToken } = await login(email, password);
localStorage.setItem("token", accessToken);

// Every call attaches it by hand:
fetch("/api/orders", {
  headers: { Authorization: "Bearer " + localStorage.getItem("token") },
});

// Trade-off: immune to CSRF (nothing auto-attaches)…
// but ANY XSS can read localStorage and exfiltrate the
// token — a stolen JWT works from anywhere until exp.`,
      ts: `// auth.ts — token in an HttpOnly cookie, set by the server
res.cookie("access_token", jwt, {
  httpOnly: true,   // scripts cannot read it — XSS can't steal it
  secure: true,
  sameSite: "lax",  // cross-site POSTs won't carry it
  maxAge: 10 * 60 * 1000, // matches the 10-minute exp
});

// The browser attaches it automatically; client code never
// touches the token at all.

// Trade-off: cookies auto-attach, so CSRF is back in scope —
// SameSite=Lax plus CSRF tokens where needed (previous section).`,
      note:
        "localStorage: XSS steals the token but CSRF is moot. HttpOnly cookie: XSS can't exfiltrate it but cookie auto-attach revives CSRF. Most security guidance prefers the cookie — script-proof storage — and handles CSRF deliberately.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "A leaky payload vs minimal claims",
      intro:
        "Two payloads for the same user. Remember both are readable by anyone who ever sees the token — which of these would you be happy to find in a proxy log?",
      php: `{
  "sub": "user_8421",
  "email": "mei@example.com",
  "fullName": "Mei Tanaka",
  "dateOfBirth": "1988-04-12",
  "role": "admin",
  "passwordHash": "$2y$10$N9qo8uLOickgx2ZMRZoMye...",
  "creditBalanceCents": 184000,
  "exp": 1781536000
}

// PII + a password hash in a base64 envelope, valid for a
// YEAR — readable by every proxy, log line, and browser
// extension that ever sees the token.`,
      ts: `{
  "sub": "user_8421",
  "iss": "https://auth.acme.dev",
  "aud": "acme-api",
  "iat": 1750000000,
  "exp": 1750000600,
  "scope": "orders:read orders:write"
}

// Identifiers and authorization context only, 10-minute
// lifetime. Anything personal lives behind /me, fetched
// with the token — not inside it.`,
      note:
        "The payload is a postcard, not a sealed envelope. Minimal claims plus a short exp bound both the blast radius of a leak and how stale the embedded authorization data can get.",
      leftLang: "json",
      rightLang: "json",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Dissect a hardcoded JWT: base64url-decode its segments with atob, inspect the claims, check exp against a fixed 'now', then catch a tampered payload with a toy integrity check. The 'signature' here is an illustrative hash so the mechanics are visible — real code ALWAYS uses a vetted library (e.g. jose) and real HMAC/RSA, never hand-rolled crypto.",
    code: `// ── base64url helpers (base64url = base64 with -_ and no padding)
function b64urlDecode(seg: string): string {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}
function b64urlEncode(s: string): string {
  return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}

// ── TOY signing: an illustrative hash, NOT real crypto ─────────
function toySign(data: string, secret: string): string {
  let h = 5381;
  for (const ch of data + "|" + secret) {
    h = (h * 33 + ch.charCodeAt(0)) % 2147483647;
  }
  return h.toString(16);
}

const SECRET = "server-side-secret-32-bytes-long";

// A sample token, as minted by the auth server (segments are real
// base64url of real JSON — decode them yourself on jwt.io):
const h64 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
const p64 =
  "eyJzdWIiOiJ1c2VyXzg0MjEiLCJpc3MiOiJodHRwczovL2F1dGguYWNtZS5kZXYiLCJh" +
  "dWQiOiJhY21lLWFwaSIsImlhdCI6MTc1MDAwMDAwMCwiZXhwIjoxNzUwMDAzNjAwfQ";
const token = \`\${h64}.\${p64}.\${toySign(\`\${h64}.\${p64}\`, SECRET)}\`;

// 1) Decoding is NOT verification — anyone can do this part:
const header = JSON.parse(b64urlDecode(token.split(".")[0]));
const claims = JSON.parse(b64urlDecode(token.split(".")[1]));
console.log("header:", JSON.stringify(header));
console.log("claims:", JSON.stringify(claims));

// 2) A verifier's checklist — signature, exp, iss, aud:
const NOW = 1750001000; // fixed clock for the demo

function verify(t: string): string {
  const [h, p, sig] = t.split(".");
  if (toySign(\`\${h}.\${p}\`, SECRET) !== sig) return "REJECT: bad signature";
  const c = JSON.parse(b64urlDecode(p));
  if (NOW >= c.exp) return "REJECT: expired";
  if (c.iss !== "https://auth.acme.dev") return "REJECT: wrong issuer";
  if (c.aud !== "acme-api") return "REJECT: wrong audience";
  return \`ACCEPT: sub=\${c.sub} (\${c.exp - NOW}s of life left)\`;
}

console.log("genuine token  ->", verify(token));

// 3) The tamper test: promote ourselves to admin, keep the old sig:
const forged = { ...claims, sub: "admin" };
const forgedToken =
  \`\${h64}.\${b64urlEncode(JSON.stringify(forged))}.\${token.split(".")[2]}\`;
console.log("forged payload ->", verify(forgedToken));

// 4) Expiry: same genuine token, but the clock has moved past exp:
const late = { ...claims, exp: NOW - 60 };
const lateSeg = b64urlEncode(JSON.stringify(late));
const lateToken = \`\${h64}.\${lateSeg}.\${toySign(\`\${h64}.\${lateSeg}\`, SECRET)}\`;
console.log("expired token  ->", verify(lateToken));

// Try it: make verify() trust the header's alg field and imagine
// what {"alg":"none"} would let an attacker skip.`,
  },

  keyPoints: [
    "A JWT is header.payload.signature in base64url — encoded, NOT encrypted: anyone can read the payload, so no secrets or PII ever go in it.",
    "Verify in order and completely: signature (with the algorithm pinned server-side), then `exp`, then `iss` and `aud` match your expectations — skipping `aud` accepts valid tokens minted for other services.",
    "HS256's shared secret means every verifier can also mint; RS256/ES256 lets one auth server sign with a private key while many services verify via the public key/JWKS — choose asymmetric when there's one signer and many verifiers.",
    "Stateless verification scales (no session-store hop) but can't be revoked — so issue short-lived access tokens (5–15 min) plus server-side, revocable refresh tokens, rotated on every use with reuse treated as theft.",
    "Know the classic attacks by name: alg:none, algorithm confusion (public key used as HMAC secret), brute-forced weak HMAC secrets, and missing aud/iss checks.",
    "Never hand-roll JWT crypto — use a vetted library like jose, configured with pinned algorithms and expected issuer/audience.",
  ],

  interview: [
    {
      q: "Walk me through what's inside a JWT and what a verifier must check before trusting it.",
      a: "Three base64url segments: a header naming the algorithm, a payload of claims — `sub` for the subject, `exp`/`iat` for lifetime, `iss` for who minted it, `aud` for who it's meant for — and a signature over the first two. Base64url is encoding, not encryption, so the payload is readable by anyone and must never carry secrets or PII. A verifier checks, in order: the signature, using an algorithm pinned in server config — never the one the token's own header suggests; that `exp` hasn't passed; and that `iss` and `aud` match its expectations, because a valid token minted for a different service must not be accepted here. Only after all four does the verifier read `sub` and act on it. In practice a vetted library like jose does this given the key and the expected values.",
    },
    {
      q: "JWTs are stateless — how do you handle logout and account compromise?",
      a: "Honestly: you can't un-sign a token, so pure stateless logout doesn't exist. The standard architecture is short-lived access tokens — five to fifteen minutes — paired with refresh tokens that are stored server-side and therefore revocable. Logout or compromise deletes the refresh token; the access token expires on its own within minutes, which bounds the exposure window. Refresh tokens rotate on every use, and reuse of a rotated-out token is treated as theft — revoke the entire token family. If the business can't tolerate even minutes, you add a per-request denylist keyed on `jti` — and I'd point out that's rebuilding the session store JWTs were supposed to avoid, which is exactly the trade-off to surface when choosing between sessions and tokens.",
    },
    {
      q: "When would you choose RS256 over HS256?",
      a: "The deciding question is who needs to verify. HS256 is HMAC with a shared secret, and anyone holding that secret can mint tokens, not just check them — acceptable when the signer and verifier are the same service. The moment there's one auth server and many verifying services — a microservice fleet, third-party consumers, standard OIDC — I want RS256 or ES256: the private key stays with the signer, and verifiers fetch the public key from a JWKS endpoint, which also makes key rotation clean. Distributing an HMAC secret to ten services means ten places that can forge admin tokens and ten places to leak it. I'd also mention pinning the algorithm server-side either way, because algorithm-confusion attacks — RS256 public key replayed as an HS256 secret — specifically target verifiers that let the token choose.",
    },
    {
      q: "What are the classic JWT vulnerabilities you'd check for in a code review?",
      a: "Four, all with real-world CVE history. First, `alg: none` — the token declares itself unsigned and a naive verifier obliges; the fix is pinning accepted algorithms in server config. Second, algorithm confusion — an RS256 public key fed into an HMAC verify as the secret, so attackers who only hold the public key can sign; again fixed by pinning, and by modern library APIs that type keys. Third, weak HMAC secrets — short or guessable secrets fall to offline brute force, and then the attacker mints arbitrary tokens; secrets need to be long, random, and rotated. Fourth, missing claim checks — no `aud`/`iss` validation means a legitimate token for another service or tenant is accepted here. And as a meta-point: any hand-rolled verification at all is a finding — this belongs to a vetted library.",
    },
  ],

  quiz: [
    {
      question: "What does the signature on a JWT actually guarantee?",
      options: [
        "The payload is encrypted and unreadable in transit",
        "The token was minted by a holder of the signing key and hasn't been altered since",
        "The token can be revoked by the issuer at any time",
        "The claims inside the payload are factually current",
      ],
      answerIndex: 1,
      explain:
        "The signature makes the token tamper-evident and proves key possession — nothing more. The payload stays readable by anyone (base64url is encoding, not encryption), revocation isn't possible for a signed token before exp, and claims like roles can go stale the moment after minting.",
    },
    {
      question:
        "Your auth server signs with RS256 and ten services verify. Why is this better than sharing an HS256 secret with all ten?",
      options: [
        "RS256 signatures are shorter, saving bandwidth",
        "RS256 tokens cannot expire, avoiding clock skew problems",
        "With a shared HMAC secret, every verifying service can also mint valid tokens — ten copies of forging power and ten places to leak it",
        "HS256 is deprecated and rejected by modern browsers",
      ],
      answerIndex: 2,
      explain:
        "HMAC verification requires the same secret used for signing, so distribution equals minting power. Asymmetric signing keeps the private key with one signer while verifiers hold only the public key (via JWKS) — they can check tokens but never forge them, and key rotation is clean.",
    },
    {
      question:
        "A verifier checks the signature and exp but not aud. What attack does this enable?",
      options: [
        "Tokens can be replayed after they expire",
        "A valid token minted by the same issuer for a different service is accepted by this one",
        "The payload can be modified without invalidating the signature",
        "The attacker can downgrade the token to alg:none",
      ],
      answerIndex: 1,
      explain:
        "aud states which service a token was minted FOR. Without checking it, any token from the trusted issuer — say one issued to a low-privilege internal tool — passes verification at your API too, and its sub/scope get honoured in the wrong context. Signature and exp checks don't help; the token is genuinely valid, just not for you.",
    },
    {
      question:
        "Why do JWT architectures pair short-lived access tokens with refresh tokens?",
      options: [
        "Short tokens are faster to base64-decode on every request",
        "Access tokens can't carry claims for longer than 15 minutes",
        "Refresh tokens are cheaper to sign than access tokens",
        "Signed access tokens can't be revoked before exp, so a short life bounds exposure while the server-side refresh token provides the revocable control point",
      ],
      answerIndex: 3,
      explain:
        "Statelessness cuts both ways: no lookup to verify, but also no record to delete on logout or compromise. Keeping access tokens short (5–15 min) limits how long a stolen or logged-out token stays usable, while the refresh token — stored and checked server-side, rotated on each use — is where revocation actually happens.",
    },
  ],
};

export default lesson;
