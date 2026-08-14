import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "oauth2-and-oidc",
  title: "OAuth 2.0 & OIDC",
  part: "Auth & Access Control",
  estMinutes: 13,
  summary:
    "OAuth 2.0 is delegated authorization (an app acting on a user's behalf), OIDC is the identity layer on top that adds authentication — and the authorization-code + PKCE flow is the modern default for both.",

  concept: `
Two acronyms, one perpetual interview trap. **OAuth 2.0** (RFC 6749) is a
framework for **delegated authorization**: letting an application act on a
user's behalf against someone else's API, with the user's consent, *without
ever seeing the user's password*. **OpenID Connect (OIDC)** is a thin
**identity layer built on top of OAuth 2.0** that adds **authentication**: a
signed **ID token** that proves *who just logged in*. OAuth answers "may this
app read Jason's contacts?"; OIDC answers "is this actually Jason?".

The pre-OAuth world is one you shipped in PHP: "Import your Gmail contacts —
just type your Gmail password here." The app stored a third-party password and
logged in *as* the user, with full account power, forever. OAuth exists to
kill exactly that: the user grants a **scoped, expiring, revocable** token
instead of a password.

### The four roles

- **Resource owner** — the user who owns the data.
- **Client** — your app, which wants to act on the user's behalf.
- **Authorization server** — issues tokens after authenticating the user and
  recording consent (Google's login screen, your Keycloak/Auth0 tenant).
- **Resource server** — the API that accepts access tokens (often a different
  host from the authorization server).

### The authorization-code + PKCE flow

This is the modern default for web *and* mobile clients. PKCE ("Proof Key for
Code Exchange", RFC 7636) started as a mobile fix and is now recommended for
every client; the old **implicit flow** (token delivered straight into the
browser URL) and the password grant are **deprecated** by the OAuth 2.0
Security Best Current Practice (RFC 9700).

1. **Client prepares**: generates a random \`code_verifier\`, hashes it into a
   \`code_challenge\`, and redirects the browser to the authorization server's
   \`/authorize\` endpoint with \`response_type=code\`, its \`client_id\`,
   \`redirect_uri\`, requested \`scope\`s, and the challenge.
2. **User authenticates at the authorization server** — never at your app —
   and approves the requested scopes.
3. **Redirect back** to your \`redirect_uri\` with a short-lived, single-use
   **authorization code** in the query string. This is the only leg that
   passes through the browser, and it carries no token.
4. **Back-channel exchange**: your server POSTs the code *plus the original
   \`code_verifier\`* to the \`/token\` endpoint. The server re-hashes the
   verifier, checks it against the challenge from step 1, and only then
   returns tokens. A stolen code is useless without the verifier.

### The token cast

- **Access token** — short-lived credential the client sends to the
  *resource server* (\`Authorization: Bearer ...\`). May be a JWT or opaque.
- **Refresh token** — longer-lived, held confidentially by the client, used
  at the *authorization server* to get fresh access tokens. Modern practice
  rotates it on every use.
- **ID token** (OIDC only) — a JWT *about the authentication event*, audience
  = your client. It's proof of login for your app — never an API credential.

### Machine-to-machine and devices

When no user is involved — a cron job calling a partner API — use the
**client-credentials flow**: the client authenticates as *itself* with its own
credentials and gets an access token with no resource owner in the picture.
And for input-constrained devices (TVs, CLIs) there's the **device flow**
(RFC 8628) — OpenAPI 3.2 added support for describing it in security schemes.
`,

  comparisons: [
    {
      label: "Acting on a user's behalf: password hoarding vs token exchange",
      intro:
        "Both apps import the user's contacts from a third-party service. One stores the user's password for that service; the other finishes an OAuth code flow and stores a scoped token.",
      php: `<?php // import-contacts.php — the anti-pattern OAuth killed
// We ask the user for their PROVIDER password... and keep it.
$stmt = $pdo->prepare(
  'INSERT INTO linked_accounts (user_id, provider, username, password)
   VALUES (?, ?, ?, ?)'
);
$stmt->execute([
  $userId, 'contactly',
  $_POST['username'], $_POST['password'], // plaintext, full power, forever
]);

// Later: log in AS the user — nothing is scoped, nothing expires,
// and revoking means the user changing their password everywhere.
$contacts = fetch_contacts($_POST['username'], $_POST['password']);
echo json_encode($contacts);`,
      ts: `// routes/oauth-callback.ts — leg 3 of the code flow, on our server
app.get("/oauth/callback", async (req, res, next) => {
  try {
    const code = String(req.query.code);
    const verifier = req.session.pkceVerifier; // saved at leg 1

    const tokenRes = await fetch("https://auth.contactly.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://app.example.com/oauth/callback",
        client_id: "web-app",
        code_verifier: verifier, // proves WE started this flow
      }),
    });

    // Scoped (contacts:read), expiring, revocable — no password seen.
    const tokens = await tokenRes.json();
    await saveTokens(req.session.userId, tokens);
    res.redirect("/contacts/import");
  } catch (err) {
    next(err);
  }
});`,
      note:
        "The password grants everything forever and can't be revoked per-app; the token is scoped, expires, and the user can revoke it at the provider without touching their password.",
    },
    {
      label: "Deprecated implicit flow vs code + PKCE",
      intro:
        "Two transcripts of getting a token to a browser-based client. On the left, the token itself rides in the redirect URL; on the right, only a one-time code does — the token moves over a back channel.",
      php: `# Implicit flow (response_type=token) — DEPRECATED
# The access token comes back IN THE URL FRAGMENT:

GET /authorize?response_type=token&client_id=spa
    &redirect_uri=https://app.example.com/cb HTTP/1.1
Host: auth.example.com

HTTP/1.1 302 Found
Location: https://app.example.com/cb#access_token=eyJhbGciOi...
    &token_type=Bearer&expires_in=3600

# The token lands in browser history and can leak via referrers
# or injected scripts. No refresh token is allowed. The OAuth 2.0
# Security BCP (RFC 9700) says: do not use this.`,
      ts: `# Authorization code + PKCE — the modern default

# LEG 1 (front channel): only a hashed CHALLENGE travels
GET /authorize?response_type=code&client_id=spa
    &redirect_uri=https://app.example.com/cb&scope=openid%20orders:read
    &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256 HTTP/1.1

# LEG 2: redirect carries a ONE-TIME CODE, not a token
HTTP/1.1 302 Found
Location: https://app.example.com/cb?code=SplxlOBeZQQYbYS6WxSbIA

# LEG 3 (back channel): code + original verifier -> tokens
POST /token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=SplxlOBeZQQYbYS6WxSbIA
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&client_id=spa

HTTP/1.1 200 OK
Content-Type: application/json

{ "access_token": "...", "refresh_token": "...", "id_token": "..." }`,
      note:
        "A code intercepted at leg 2 is useless: the token endpoint demands the code_verifier, which never left the client — that binding is the whole point of PKCE.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "ID token vs access token",
      intro:
        "Both tokens come back from the same OIDC login. Look at the aud (audience) claim to see who each one is addressed to — and therefore where each may be used.",
      php: `{
  "iss": "https://auth.example.com",
  "sub": "user-7",
  "aud": "web-app",
  "email": "jason@example.com",
  "email_verified": true,
  "nonce": "n-0S6_WzA2Mj",
  "iat": 1767744000,
  "exp": 1767747600
}`,
      ts: `{
  "iss": "https://auth.example.com",
  "sub": "user-7",
  "aud": "https://api.example.com",
  "scope": "orders:read orders:write",
  "client_id": "web-app",
  "iat": 1767744000,
  "exp": 1767744900
}`,
      note:
        "The ID token's audience is the CLIENT — it's proof of login, not an API credential. The access token's audience is the API and carries scopes. A resource server must reject ID tokens.",
      leftLang: "json",
      rightLang: "json",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The code + PKCE flow as three plain functions — authorize URL, login + code issuance, token exchange. Predict what happens when the code is replayed and when an attacker exchanges a code with the wrong verifier, then run it. The hash is illustrative, not real crypto.",
    code: `// The authorization-code + PKCE flow, simulated end to end.
// toyHash stands in for SHA-256 — illustrative only, NOT real crypto.

function toyHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h = ((h ^ input.charCodeAt(i)) * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function base64url(s: string): string {
  return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}

// ── Authorization-server state: one-time codes bound to a PKCE challenge ──
interface PendingCode {
  clientId: string;
  challenge: string;
  user: string;
  used: boolean;
}
const issuedCodes = new Map<string, PendingCode>();

// LEG 1 — the client builds the authorize URL (front channel, via browser)
function buildAuthorizeUrl(clientId: string, redirectUri: string, verifier: string): string {
  const challenge = base64url(toyHash(verifier)); // real code: SHA-256(verifier)
  return (
    "https://auth.example.com/authorize" +
    "?response_type=code" +
    "&client_id=" + clientId +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&scope=openid%20orders:read" +
    "&code_challenge=" + challenge +
    "&code_challenge_method=S256"
  );
}

// LEG 2 — the auth server authenticates the user, issues a one-time code
function authorize(url: string, user: string): string {
  const params = new URL(url).searchParams;
  const code = "code_" + toyHash(user + params.get("code_challenge"));
  issuedCodes.set(code, {
    clientId: params.get("client_id")!,
    challenge: params.get("code_challenge")!,
    user,
    used: false,
  });
  return code;
}

// LEG 3 — the client swaps code + verifier for tokens (back channel)
function exchangeCode(code: string, verifier: string): string {
  const pending = issuedCodes.get(code);
  if (!pending || pending.used) return "ERROR invalid_grant (unknown or already-used code)";
  if (base64url(toyHash(verifier)) !== pending.challenge) {
    return "ERROR invalid_grant (PKCE verifier does not match challenge)";
  }
  pending.used = true; // authorization codes are strictly one-time
  return (
    "access_token=at_" + toyHash(pending.user + "access") +
    " refresh_token=rt_" + toyHash(pending.user + "refresh") +
    " id_token=<JWT sub=" + pending.user + ">"
  );
}

// ── Run the flow ──
const verifier = "correct-horse-battery-staple"; // real code: 43+ random chars
const authorizeUrl = buildAuthorizeUrl("web-app", "https://app.example.com/callback", verifier);
console.log("LEG 1 — browser sent to:");
console.log("  " + authorizeUrl);

const code = authorize(authorizeUrl, "jason@example.com");
console.log("LEG 2 — user logs in AT THE AUTH SERVER; redirect back with " + code);

console.log("LEG 3 — token exchange with the RIGHT verifier:");
console.log("  " + exchangeCode(code, verifier));

console.log("Replaying the same code: " + exchangeCode(code, verifier));

const stolenCode = authorize(authorizeUrl, "jason@example.com");
console.log("Fresh code, but an attacker's verifier: " + exchangeCode(stolenCode, "attacker-guess"));`,
  },

  keyPoints: [
    "OAuth 2.0 = delegated AUTHORIZATION (an app acts on a user's behalf with scoped, revocable tokens); OIDC = AUTHENTICATION layered on top via the signed ID token.",
    "Roles: resource owner (user), client (your app), authorization server (issues tokens), resource server (the API that accepts them).",
    "Authorization-code + PKCE is the modern default for web and mobile; the implicit and password grants are deprecated by the OAuth 2.0 Security BCP (RFC 9700).",
    "PKCE binds the flow to the client: the token endpoint requires the `code_verifier` matching the `code_challenge` from leg 1, so an intercepted code is worthless.",
    "Know the token cast: access token → sent to the API, short-lived; refresh token → sent to the auth server, rotated; ID token → for the client only, never an API credential.",
    "No user involved (cron job, service-to-service)? That's the client-credentials flow; input-constrained devices use the device flow (RFC 8628), describable in OpenAPI 3.2.",
  ],

  interview: [
    {
      q: "What's the difference between OAuth 2.0 and OpenID Connect?",
      a: "OAuth 2.0 is a delegated *authorization* framework: it lets a client act on a user's behalf against an API using scoped, expiring access tokens, without handling the user's password. It deliberately says nothing about who the user is — an access token means \"may do X\", not \"is Jason\". OpenID Connect is an identity layer built on top of OAuth 2.0 that adds *authentication*: the same code flow additionally returns a signed ID token, a JWT whose claims (`iss`, `sub`, `aud`, `nonce`) describe the login event, addressed to the client. So \"Sign in with Google\" is OIDC; \"let this app read your Google Calendar\" is OAuth. Using a bare OAuth access token as login proof is a known anti-pattern — that's precisely the gap OIDC was created to close.",
    },
    {
      q: "Walk me through the authorization-code flow with PKCE. Why is PKCE needed?",
      a: "The client generates a random code verifier, hashes it into a challenge, and redirects the browser to the authorization server's `/authorize` endpoint with its client id, redirect URI, scopes, and that challenge. The user authenticates *at the authorization server* and consents; the server redirects back to the client with a short-lived, single-use authorization code. The client then makes a back-channel POST to `/token` with the code plus the original verifier; the server re-hashes the verifier, checks it against the stored challenge, and only then issues the access, refresh, and (with OIDC) ID tokens. PKCE protects the one leg that passes through the browser: if the code is intercepted, the attacker still can't exchange it, because the verifier never travelled over the front channel. It began as the fix for public clients that can't keep a secret, and current security guidance recommends it for all clients.",
    },
    {
      q: "Your API received a valid, signed ID token in the Authorization header. Do you accept it?",
      a: "No. An ID token is addressed to the client — its `aud` claim is the client id, not my API — and it asserts an authentication event, not permission to call anything. Accepting it would let any application the user ever logged into mint credentials for my API, and it carries no scopes to enforce. The resource server should accept only access tokens, validate signature, issuer, expiry and crucially audience, then enforce scopes. This is exactly why the audience check matters: it's the claim that separates \"proof Jason logged in over there\" from \"permission to act here\".",
    },
    {
      q: "A backend job needs to call a partner's API every night — no user is involved. Which OAuth flow fits?",
      a: "Client credentials. The job authenticates as *itself* to the token endpoint — with a client id and secret, or better, a signed assertion or mTLS — and receives an access token scoped to what the job may do. There's no resource owner, no browser redirect, no consent screen, and no refresh token needed since the client can simply re-authenticate. Authorization-code flows only make sense when a human delegates access; using a stored user's credentials for an unattended job would recreate the password-hoarding problem OAuth was designed to eliminate.",
    },
  ],

  quiz: [
    {
      question: "What does OpenID Connect add on top of OAuth 2.0?",
      options: [
        "Refresh tokens, which plain OAuth 2.0 does not support",
        "An authentication layer: a signed ID token describing who logged in",
        "PKCE, the protection against authorization-code interception",
        "Scopes, so tokens can be limited to specific permissions",
      ],
      answerIndex: 1,
      explain:
        "OAuth 2.0 already has refresh tokens, scopes, and (via RFC 7636) PKCE — but it only does delegated authorization. OIDC layers authentication on top: the ID token is a JWT addressed to the client that proves the login event and identifies the user.",
    },
    {
      question:
        "In the code + PKCE flow, an attacker intercepts the authorization code during the redirect. Why can't they use it?",
      options: [
        "The code is encrypted with the client's public key",
        "The code only works from the IP address that started the flow",
        "The token endpoint requires the code_verifier, which never travelled through the browser",
        "The code is a signed JWT that the attacker cannot re-sign",
      ],
      answerIndex: 2,
      explain:
        "Leg 1 sent only a hash (the challenge); the raw verifier stayed with the client. The token exchange re-hashes the presented verifier and compares it to the stored challenge, so a code without the matching verifier is rejected — and codes are single-use besides.",
    },
    {
      question:
        "Which token does your resource server (the API) accept, and which claim must it always check?",
      options: [
        "The ID token, checking the email claim",
        "The refresh token, checking the exp claim",
        "The access token, checking that aud names this API",
        "Any signed JWT, checking that iss is a known provider",
      ],
      answerIndex: 2,
      explain:
        "APIs accept access tokens only. Signature, issuer, and expiry all matter, but the audience check is what stops tokens issued for some other recipient — including ID tokens, whose audience is the client — from being replayed against your API.",
    },
    {
      question:
        "A server-side cron job (no user present) must call a partner API. Which flow is correct?",
      options: [
        "Client credentials — the job authenticates as itself",
        "Authorization code + PKCE with a stored employee account",
        "The implicit flow, since there is no browser to protect",
        "The device flow, since the job has no keyboard",
      ],
      answerIndex: 0,
      explain:
        "Client credentials is the machine-to-machine grant: the client presents its own credentials and gets a scoped access token with no resource owner involved. Storing a human's credentials for automation recreates the pre-OAuth anti-pattern, and the implicit flow is deprecated outright.",
    },
  ],
};

export default lesson;
