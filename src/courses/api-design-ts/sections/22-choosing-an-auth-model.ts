import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "choosing-an-auth-model",
  title: "Choosing an Auth Model",
  part: "Auth & Access Control",
  estMinutes: 12,
  summary:
    "A decision framework for the interview classic — sessions vs JWT vs OAuth2/OIDC — driven by who the clients are, how many services verify identity, and how fast revocation must be.",

  concept: `
"Sessions or JWT?" is the question interviewers reach for because it has no
universal answer — it has a *framework*. A strong candidate doesn't pick a
favourite; they ask three questions and let the answers pick the model.

### The three questions

1. **Who are the clients?** First-party browser app? Mobile app? Other
   services? Third-party developers acting on users' behalf?
2. **How many backends must verify identity?** One monolith, or a dozen
   services that each need to know who's calling?
3. **How fast must revocation be?** Is "the token dies within 10 minutes"
   acceptable, or must a fired admin lose access *now*?

### The heuristics

**First-party browser app + single backend → server-side sessions.**
An \`HttpOnly\`, \`Secure\`, \`SameSite\` cookie holding a random session id,
state in Redis/Postgres. This is the PHP \`session_start()\` model, and it is
*not* legacy — it's the simplest, most revocable option. Logout and bans are
one \`DELETE\`. The cost is the shared session store every request touches.

**Multiple services, or mobile/native clients → short-lived JWTs + refresh
rotation.** A signed JWT lets every service verify the caller *locally* —
check the signature against a published key, no shared session store, no
network hop. The price is revocation: a signed token stays valid until
\`exp\`, so you keep access tokens short (5–15 minutes) and rotate refresh
tokens, accepting a small revocation lag — or you reintroduce state with a
denylist and give some of the benefit back.

**Third-party access, delegation, or "Sign in with X" → OAuth 2.0/OIDC.**
The moment apps you don't control act on your users' behalf, you need
consent screens, scoped tokens, and revocation per client — that's OAuth,
not something to improvise. And almost always via a **managed identity
provider** (Auth0, Cognito, Keycloak, Entra) rather than hand-rolling an
authorization server: token issuance is a security product, not a sprint task.

### The models compose

The trap in this question is treating the three as mutually exclusive.
Real systems hybridise constantly:

- **OIDC login, session afterwards.** "Sign in with Google" proves *who* the
  user is; your app then sets an ordinary session cookie. OAuth handled
  authentication; sessions handle the API. Extremely common, and the right
  default for a first-party web app that wants social login.
- **JWTs issued by an OAuth server.** The access tokens your OAuth flow
  returns are very often JWTs — OAuth is the *issuance ceremony*, JWT is the
  *token format*. "JWT vs OAuth" is a category error worth naming out loud
  in an interview.
- **Sessions at the edge, JWTs inside.** A gateway holds the browser-facing
  session and mints short-lived internal JWTs for the services behind it.

### Saying it in the room

Frame trade-offs in operational terms: sessions buy instant revocation at
the cost of shared state; JWTs buy stateless verification at the cost of
revocation lag; OAuth buys safe delegation at the cost of protocol
complexity — which is why you delegate that complexity to an IdP. Then
commit: "for this system, I'd start with X because…".
`,

  comparisons: [
    {
      label: "The same protected endpoint: session vs JWT",
      intro:
        "Both handlers protect GET /orders. The left one looks up a server-side session; the right one verifies a signed token locally. Note what each costs at scale and at logout.",
      php: `// session-protect.ts — first-party browser app, single backend
app.get("/orders", async (req, res, next) => {
  try {
    const sid = req.cookies.sid; // HttpOnly, Secure, SameSite cookie
    const session = sid ? await sessionStore.get(sid) : null;
    if (!session) {
      return res.status(401).json({ title: "Not signed in", status: 401 });
    }
    res.json(await listOrders(session.userId));
  } catch (err) {
    next(err);
  }
});

// Revocation: DELETE the session record — effective immediately.
// Cost: every request, on every instance, hits the session store.`,
      ts: `// jwt-protect.ts — many services verify the same identity
app.get("/orders", async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const claims = token ? verifyJwt(token, publicKey) : null; // local CPU, no I/O
    if (!claims) {
      return res.status(401).json({ title: "Invalid or expired token", status: 401 });
    }
    res.json(await listOrders(claims.sub));
  } catch (err) {
    next(err);
  }
});

// Verification: stateless — any service with the public key can do it.
// Revocation: NOT immediate — short exp + refresh rotation, or a denylist.`,
      note:
        "Same requirement, opposite trade: the session buys one-DELETE revocation for the price of a shared store; the JWT buys store-free verification for the price of revocation lag.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Hand-rolling OAuth vs delegating to an IdP",
      intro:
        "Third-party apps need delegated access to your API. The left file is an honest inventory of what 'we'll just build the OAuth server ourselves' means; the right keeps the one job you should own.",
      php: `// auth-server/roadmap.ts — what you just signed up to build
app.get("/authorize", renderLoginAndConsent);    // + CSRF, + PKCE challenge storage
app.post("/token", exchangeCodeForTokens);       // + single-use codes, + client auth
app.post("/token", refreshTokenGrant);           // + rotation, + reuse detection
app.get("/.well-known/jwks.json", publishKeys);  // + signing-key rotation
app.post("/revoke", revokeTokens);               // + per-client revocation
app.post("/clients", registerClient);            // + secrets, + redirect-URI rules

// ...plus consent records, scope management, audit logging, and every
// attack the OAuth 2.0 Security BCP (RFC 9700) exists to catalogue.`,
      ts: `// middleware/verify-idp-token.ts — issuance delegated to a managed IdP
// (Auth0 / Cognito / Keycloak / Entra). You keep exactly one job:
// verify incoming tokens against the IdP's published keys.
app.use(async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) {
    return res.status(401).json({ title: "Missing token", status: 401 });
  }
  try {
    req.user = await verifyAgainstJwks(token, {
      issuer: "https://tenant.idp.example.com/",
      audience: "https://api.example.com",
    });
    next();
  } catch {
    res.status(401).json({ title: "Invalid token", status: 401 });
  }
});`,
      note:
        "Login UIs, consent, key rotation, and revocation become the IdP's problem; your API's attack surface shrinks to 'validate issuer, audience, signature, expiry'.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Owning passwords vs OIDC login that becomes a session",
      intro:
        "Both apps sign a user in and land them on a dashboard. The left owns a password database; the right delegates authentication to an OIDC provider, then runs on an ordinary session.",
      php: `<?php // login.php — you own passwords, resets, 2FA, and the breach
session_start();

$stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = ?');
$stmt->execute([$_POST['email']]);
$user = $stmt->fetch();

if ($user && password_verify($_POST['password'], $user['password_hash'])) {
    $_SESSION['user_id'] = $user['id'];
    header('Location: /dashboard');
} else {
    http_response_code(401);
    echo json_encode(['error' => 'bad credentials']);
}`,
      ts: `// routes/auth-callback.ts — OIDC proves WHO; a plain session takes over
app.get("/auth/callback", async (req, res, next) => {
  try {
    // Completes the code flow and verifies the ID token's signature,
    // issuer, audience, and nonce.
    const claims = await completeOidcLogin(req);
    const user = await upsertUser({ sub: claims.sub, email: claims.email });

    req.session.userId = user.id; // from here on: an ordinary session app
    res.redirect("/dashboard");
  } catch (err) {
    next(err);
  }
});

// No password column, no reset flow, no credential database to breach.`,
      note:
        "The hybrid most real apps ship: OIDC for authentication, a session for everything after — 'OAuth vs sessions' was never either/or.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "An auth-model rubric as a typed function: requirements in, recommendation plus rationale out. Predict what each of the four scenarios gets — especially scenario 4 — then run it, and try flipping backends to 3 on scenario 1.",
    code: `// A decision rubric for sessions vs JWT vs OAuth2/OIDC, as a typed function.
// Replay this out loud in an interview: requirements in, recommendation out.

type ClientKind = "browser" | "mobile" | "service" | "third-party";

interface AuthRequirements {
  clients: ClientKind[];
  backends: number;              // how many services must verify the caller
  instantRevocation: boolean;    // must logout/ban take effect immediately?
  thirdPartyDelegation: boolean; // do outside apps act on users' behalf?
  socialLogin: boolean;          // "Sign in with Google/GitHub"?
}

interface Recommendation {
  model: string;
  because: string[];
}

function recommendAuth(r: AuthRequirements): Recommendation {
  const because: string[] = [];

  if (r.thirdPartyDelegation) {
    because.push("outside apps need delegated, scoped access — that is exactly OAuth 2.0");
    because.push("use a managed IdP: hand-rolling an OAuth server is a security project, not a feature");
    return { model: "OAuth 2.0 + OIDC via a managed IdP", because };
  }

  const multiService = r.backends > 1;
  const hasMobile = r.clients.includes("mobile");

  if (!multiService && !hasMobile && r.clients.includes("browser")) {
    because.push("one backend + browser client: a session cookie is the simplest thing that works");
    because.push("instant revocation is free — delete the server-side session record");
    if (r.socialLogin) {
      because.push("let OIDC handle the LOGIN, then establish a plain session — the models compose");
    }
    return { model: "Server-side sessions (HttpOnly cookie)", because };
  }

  if (multiService) {
    because.push(r.backends + " services can verify a signed JWT locally — no shared session store");
  }
  if (hasMobile) {
    because.push("mobile clients hold bearer tokens more naturally than cookies");
  }
  because.push("keep access tokens short-lived (5-15 min) and rotate refresh tokens");
  if (r.instantRevocation) {
    because.push("caution: instant revocation needs a denylist or very short TTLs — budget for it");
  }
  return { model: "Short-lived JWTs + refresh-token rotation", because };
}

const scenarios: Array<[string, AuthRequirements]> = [
  ["1. Internal admin dashboard", {
    clients: ["browser"], backends: 1,
    instantRevocation: true, thirdPartyDelegation: false, socialLogin: false,
  }],
  ["2. Mobile app talking to 6 microservices", {
    clients: ["mobile", "browser"], backends: 6,
    instantRevocation: false, thirdPartyDelegation: false, socialLogin: false,
  }],
  ["3. Public platform where partner apps act for users", {
    clients: ["third-party", "service"], backends: 3,
    instantRevocation: true, thirdPartyDelegation: true, socialLogin: false,
  }],
  ["4. SaaS with Google login, single backend", {
    clients: ["browser"], backends: 1,
    instantRevocation: true, thirdPartyDelegation: false, socialLogin: true,
  }],
];

for (const [name, req] of scenarios) {
  const rec = recommendAuth(req);
  console.log(name + " -> " + rec.model);
  for (const line of rec.because) console.log("     - " + line);
}`,
  },

  keyPoints: [
    "Decide with three questions: who are the clients, how many backends verify identity, and how fast must revocation be.",
    "First-party browser app + single backend → server-side sessions: simplest option, and revocation is one `DELETE` — sessions are not legacy.",
    "Multiple services or mobile clients → short-lived JWTs (5–15 min) + refresh-token rotation; every service verifies locally, but revocation lag is the price.",
    "Third-party delegation or 'Sign in with X' → OAuth 2.0/OIDC — and almost always a managed IdP, because an authorization server is a security product, not a feature.",
    "The models compose: OIDC login can establish a plain session, and OAuth servers typically issue JWTs — 'JWT vs OAuth' confuses a token format with an issuance protocol.",
    "In interviews, state the trade-off in operational terms (revocation vs shared state vs protocol complexity), then commit to a recommendation for the system at hand.",
  ],

  interview: [
    {
      q: "Sessions or JWTs — which would you use for authentication?",
      a: "It depends on three things, so I'd ask them first: who the clients are, how many backends must verify identity, and how fast revocation has to be. A first-party browser app against a single backend gets server-side sessions — an HttpOnly cookie and a session store gives instant revocation and the least complexity. Multiple services or mobile clients push me to short-lived JWTs with refresh rotation, because every service can verify a signature locally without a shared session store; I accept a 5–15 minute revocation lag or add a denylist for the cases that can't. And if third-party apps act on users' behalf, neither is enough — that's OAuth2/OIDC via a managed IdP. I'd also point out the models compose: an OIDC login very often just establishes a plain session.",
    },
    {
      q: "Aren't sessions outdated? Everyone seems to use JWTs now.",
      a: "No — sessions are still the best fit for the most common architecture there is: one web app, one backend. They give instant revocation (delete the record), tiny cookies, no token-expiry choreography on the client, and decades of battle-tested tooling — PHP teams have run this model since `session_start()` existed. JWTs solve a *distribution* problem: verifying identity across many services without shared state. If you don't have that problem, a JWT mostly buys you its drawbacks — revocation lag, refresh-token plumbing, and a signing key to protect. Cargo-culting JWTs onto a monolith is one of the most common auth design smells.",
    },
    {
      q: "We're adding 'Sign in with Google' to our single-backend web app. Does the whole API need to switch to OAuth?",
      a: "No — and conflating those two is the classic trap. 'Sign in with Google' is OIDC used purely for *authentication*: Google proves who the user is and hands us verified claims via the ID token. Once my callback verifies that token, I can create or look up the local user and establish an ordinary session cookie, exactly as if they'd typed a password. The API keeps its session model; we've just outsourced credential handling — no password column, no reset flow, no breach liability. I'd only put OAuth in front of my *own* API if third-party clients needed delegated, scoped access to it.",
    },
    {
      q: "Would you ever build your own OAuth authorization server?",
      a: "Almost never, and I'd say so explicitly. A real authorization server means login and consent UIs, PKCE handling, single-use code enforcement, refresh rotation with reuse detection, JWKS publishing and key rotation, revocation, client registration — plus staying current with the OAuth Security BCP as attacks evolve. That's a product, and companies like Auth0 or the Keycloak project ship it full-time. My job as an API designer is the resource-server side: validate issuer, audience, signature, and expiry, then enforce scopes. I'd only consider self-hosting an existing server like Keycloak for data-residency or cost reasons — hand-writing one is how you end up as a case study.",
    },
  ],

  quiz: [
    {
      question:
        "A first-party browser app talks to one backend, and a banned user must lose access immediately. Best-fit auth model?",
      options: [
        "Short-lived JWTs with refresh rotation",
        "Server-side sessions with an HttpOnly cookie",
        "OAuth 2.0 client-credentials flow",
        "Long-lived JWTs stored in localStorage",
      ],
      answerIndex: 1,
      explain:
        "One backend and a browser client is the session sweet spot: no distribution problem to solve, and instant revocation is one DELETE against the session store. JWTs would add revocation lag and refresh plumbing for no benefit here; client credentials is for machine-to-machine.",
    },
    {
      question: "What is the main operational cost of choosing JWTs over sessions?",
      options: [
        "Every request must query a shared token store",
        "Tokens cannot carry any user information",
        "A signed token stays valid until it expires, so revocation is not immediate",
        "Each backend service needs its own signing key",
      ],
      answerIndex: 2,
      explain:
        "Statelessness cuts both ways: no store lookup on requests, but also no record to delete at logout. You manage the gap with short expiries plus refresh rotation, or reintroduce state via a denylist. Verification needs only the public key, and not hitting a store is the JWT's benefit, not its cost.",
    },
    {
      question:
        "Your app adds 'Sign in with Google' but has a single backend. What does a well-designed hybrid look like?",
      options: [
        "Every API request is proxied through Google's OAuth server",
        "The Google access token becomes your API's session identifier",
        "OIDC verifies the login, then your app establishes its own session cookie",
        "You must issue your own JWTs signed with Google's private key",
      ],
      answerIndex: 2,
      explain:
        "OIDC solves authentication — who the user is — via the verified ID token. After the callback, the app runs as a normal session-based system. Google's tokens are addressed to your client for Google's APIs, not credentials for yours, and nobody else can sign with Google's private key.",
    },
  ],
};

export default lesson;
