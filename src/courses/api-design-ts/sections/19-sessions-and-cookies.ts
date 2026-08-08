import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "sessions-and-cookies",
  title: "Sessions & Cookies",
  part: "Auth & Access Control",
  estMinutes: 13,
  summary:
    "Server-side sessions done deliberately: an opaque id in an HttpOnly, Secure, SameSite cookie, a server-side store you can revoke instantly, and id rotation on login.",

  concept: `
You have run server-side sessions for 25 years: \`session_start()\`, a
\`PHPSESSID\` cookie, \`$_SESSION['user_id'] = 42\`. The model is not the
legacy part — it's still the right default for first-party browser apps. The
legacy part is running it on *defaults* without being able to explain each
knob. Interviews probe exactly those knobs.

### The model

1. On login, the server creates a **session record** in a server-side store
   (in-memory for dev, Redis-style shared store in production) keyed by a
   long random id.
2. That **opaque id** — meaningless, unguessable, containing no data — goes
   to the browser in a cookie.
3. Every subsequent request carries the cookie automatically; the server
   looks the id up and gets the user.

Because the state lives server-side, **revocation is instant**: delete the
record and the cookie in the wild is a dead key. Compromised account? Fired
employee? "Log out all devices"? One \`DELETE\` in the store. This is the
killer feature JWTs give up, and the heart of the sessions-vs-tokens debate.

### The cookie attributes, and why each exists

\`\`\`bash
Set-Cookie: sid=k3jf9a...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400
\`\`\`

- **HttpOnly** — JavaScript cannot read the cookie (\`document.cookie\` won't
  show it). An XSS bug can still *act* as the user while the page is open,
  but it cannot *exfiltrate* the session id for reuse elsewhere. Non-negotiable.
- **Secure** — sent over HTTPS only; never leaks on a plaintext hop.
- **SameSite** — controls whether the browser attaches the cookie to
  requests *initiated by other sites*:
  - \`Strict\`: never sent cross-site. Safest, but a user following a link
    into your app from an email arrives logged out.
  - \`Lax\`: sent on top-level GET navigations, withheld on cross-site POSTs
    and subresource requests. The right default.
  - \`None\`: always sent (requires \`Secure\`). Only for genuine cross-site
    needs — embedded widgets, third-party contexts — and it puts CSRF defence
    entirely on you.
- **Max-Age / Expires** — the browser-side lifetime. Enforce expiry
  server-side too; the client's clock and goodwill are not a security control.

### CSRF: why cookies need one more defence

The browser attaches cookies *automatically* — that convenience is also the
attack. A malicious page can auto-submit a form to
\`POST https://api.acme.dev/transfer\`, and the browser helpfully includes
your session cookie. \`SameSite=Lax\` blocks that cross-site POST, which is
why it's the default posture — but if you need \`SameSite=None\`, or must
support legacy browsers, add an explicit CSRF token (a random value the page
must echo back in a header or field, which the attacker's page can't read).
And never mutate state on GET: \`Lax\` sends cookies on top-level GETs, so a
state-changing GET endpoint is a CSRF hole even with SameSite set.

### Session fixation: rotate on login

PHP's classic footgun: if the session id survives the privilege change at
login, an attacker who planted a known id (fixation) now owns an
authenticated session. The fix is one line in either world —
\`session_regenerate_id(true)\` in PHP, or in your TS middleware: on
successful login, **issue a fresh id and delete the old record**. Rotate on
any privilege escalation.

Sessions are stateful, which purists count against them for "REST"
statelessness — a fair theory point. The pragmatic position you'll defend
later in this course: for a first-party browser app, an HttpOnly cookie
session is simpler and safer than tokens in JavaScript-readable storage, and
instant revocation is worth the lookup.
`,

  comparisons: [
    {
      label: "Defaults-mode PHP session vs deliberate TS session middleware",
      intro:
        "Both log a user in and establish a session. One inherits whatever php.ini says and keeps the pre-login session id; the other sets every cookie attribute explicitly and rotates the id at the privilege boundary.",
      php: `<?php // login.php — session_start() and hope
session_start(); // PHPSESSID with php.ini defaults:
                 // maybe no Secure, SameSite unset on old configs

$user = verifyPassword($pdo, $_POST['email'], $_POST['password']);
if ($user) {
    // Same session id as before login — if an attacker
    // planted that id (fixation), they're now logged in too.
    $_SESSION['user_id'] = $user['id'];
    echo json_encode(['ok' => true]);
}`,
      ts: `// login.ts — every attribute explicit, id rotated on login
app.post("/login", async (req, res) => {
  const user = await verifyPassword(req.body.email, req.body.password);
  if (!user) return res.status(401).json(problem(401, "Bad credentials"));

  // Fresh id at the privilege boundary — fixation dies here.
  const sid = randomSessionId();                // 128+ bits of entropy
  await store.set(sid, { userId: user.id }, { ttlSeconds: 86_400 });

  res.cookie("sid", sid, {
    httpOnly: true,   // JS can't read it — XSS can't exfiltrate it
    secure: true,     // HTTPS only
    sameSite: "lax",  // cross-site POSTs don't carry it
    path: "/",
    maxAge: 86_400_000,
  });
  res.status(204).end();
});`,
      note:
        "The TS version isn't cleverer — it's explicit: fresh id at login (PHP's session_regenerate_id(true) does the same), and HttpOnly/Secure/SameSite stated in code instead of inherited from php.ini.",
    },
    {
      label: "Cookie transcript: before vs after hardening",
      intro:
        "The same login, observed on the wire. Read each Set-Cookie attribute and ask: what attack does its absence permit?",
      php: `$ curl -si -X POST https://api.acme.dev/login -d '...'
HTTP/1.1 200 OK
Set-Cookie: PHPSESSID=abc123

# No HttpOnly  -> any XSS can read document.cookie and
#                 exfiltrate the session id
# No Secure    -> id leaks on any http:// hop
# No SameSite  -> browser attaches it to cross-site POSTs;
#                 modern browsers default to Lax, old ones don't
# No Max-Age   -> lifetime left to browser/server defaults`,
      ts: `$ curl -si -X POST https://api.acme.dev/login -d '...'
HTTP/1.1 204 No Content
Set-Cookie: sid=k3jf9aQ72LxWn4vB8pTzYd; HttpOnly; Secure; \\
  SameSite=Lax; Path=/; Max-Age=86400

# HttpOnly     -> XSS can't read or exfiltrate the id
# Secure       -> never sent over plaintext HTTP
# SameSite=Lax -> withheld from cross-site POSTs (CSRF cut off)
# Max-Age      -> deliberate 24h lifetime, matched by the
#                 server-side TTL on the session record`,
      note:
        "Every attribute on the right closes a specific attack named on the left — being able to recite that mapping is exactly what an interviewer is fishing for with 'tell me about cookie security'.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "The CSRF attack vs the layered defence",
      intro:
        "Left: the attack page a victim merely has to visit — the browser attaches the session cookie to the forged POST all by itself. Right: the server-side posture that kills it.",
      php: `<!-- evil.example.com/win-a-prize.html -->
<body onload="document.forms[0].submit()">
  <!-- Victim is logged in to api.acme.dev in another tab.
       This form POSTs cross-site; with no SameSite policy the
       browser HELPFULLY attaches their session cookie. -->
  <form action="https://api.acme.dev/transfer" method="POST">
    <input type="hidden" name="to" value="attacker-acct">
    <input type="hidden" name="amount" value="9900">
  </form>
</body>`,
      ts: `// Defence in depth: SameSite first, explicit token as backstop.
// 1) The session cookie is SameSite=Lax — the browser already
//    refuses to attach it to evil.example.com's cross-site POST.
// 2) Belt-and-braces CSRF token for anything that must run
//    SameSite=None (embedded contexts, legacy browsers):
app.post("/transfer", requireSession, (req, res) => {
  const sent = req.get("X-CSRF-Token");
  if (!sent || sent !== req.session.csrfToken) {
    return res.status(403).json(problem(403, "CSRF token mismatch"));
  }
  // 3) And never mutate state on GET — Lax still sends cookies
  //    on top-level GET navigations.
  performTransfer(req.session.userId, req.body);
  res.status(204).end();
});`,
      note:
        "CSRF exists because cookies travel automatically. SameSite=Lax blocks the classic auto-posting form; the token covers SameSite=None cases; keeping mutations off GET closes the Lax loophole.",
      leftLang: "html",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "An in-memory session store with create/verify/revoke and TTL expiry, driven through a full lifecycle: login, authenticated request, logout, replayed cookie, and an expired session. Predict each step's verdict before running.",
    code: `// A miniature of what express-session + Redis do for you.
interface SessionRecord { userId: string; expiresAt: number }

const store = new Map<string, SessionRecord>();
let entropy = 7; // stand-in for a CSPRNG — real code uses crypto
function randomSessionId(): string {
  entropy = (entropy * 48271) % 2147483647;
  return "sess_" + entropy.toString(36);
}

const TTL_MS = 60_000; // 1 minute, for the demo

function login(userId: string, now: number): string {
  const sid = randomSessionId(); // fresh id at the privilege boundary
  store.set(sid, { userId, expiresAt: now + TTL_MS });
  console.log(
    \`LOGIN    -> Set-Cookie: sid=\${sid}; HttpOnly; Secure; SameSite=Lax\`,
  );
  return sid;
}

function verify(sid: string, now: number): string | null {
  const rec = store.get(sid);
  if (!rec) return null;              // revoked or never existed
  if (now > rec.expiresAt) {          // server-side expiry — the
    store.delete(sid);                // cookie's Max-Age is advisory
    return null;
  }
  return rec.userId;
}

function logout(sid: string): void {
  store.delete(sid); // instant revocation: the killer feature
  console.log("LOGOUT   -> record deleted; cookie is now a dead key");
}

function request(label: string, sid: string, now: number): void {
  const userId = verify(sid, now);
  console.log(
    userId
      ? \`\${label} -> 200 OK (user \${userId})\`
      : \`\${label} -> 401 Unauthorized\`,
  );
}

// ── The lifecycle ────────────────────────────────────────────
let now = 1_000_000;

const sid = login("user_42", now);
request("GET /me ", sid, now + 5_000);   // within TTL, record exists

logout(sid);
request("GET /me ", sid, now + 6_000);   // same cookie, replayed

const sid2 = login("user_42", now + 10_000);
request("GET /me ", sid2, now + 90_000); // 80s after issue: TTL is 60s

console.log(\`Store size after expiry sweep: \${store.size}\`);

// Try it: extend TTL_MS, or make verify() rotate the id on every
// use and see why that breaks parallel requests from one browser.`,
  },

  keyPoints: [
    "A session is a server-side record keyed by a long random opaque id; the cookie carries only the key, never data — and deleting the record is instant revocation, the killer feature over stateless tokens.",
    "Set every cookie attribute deliberately: HttpOnly (XSS can't exfiltrate the id), Secure (HTTPS only), SameSite=Lax (withheld from cross-site POSTs), Path and Max-Age — and enforce expiry server-side too.",
    "SameSite: Strict never travels cross-site (breaks inbound links arriving logged-in), Lax allows top-level GET navigations only, None always sends and requires Secure plus your own CSRF defence.",
    "CSRF exists because browsers attach cookies automatically — SameSite=Lax blocks the auto-posting form, CSRF tokens cover SameSite=None cases, and state-changing GETs are a hole under Lax.",
    "Rotate the session id at login (PHP: `session_regenerate_id(true)`) and on privilege changes — otherwise a planted pre-login id survives into the authenticated session (fixation).",
    "Sessions in an HttpOnly cookie are the right default for first-party browser apps; the stateful-lookup cost buys instant revocation and keeps credentials out of JavaScript's reach.",
  ],

  interview: [
    {
      q: "Walk me through a secure session cookie setup for an API backing a browser app.",
      a: "On login I verify credentials, generate a fresh session id with 128+ bits of CSPRNG entropy — fresh, not reused, so fixation dies at the privilege boundary — and store a record server-side (Redis in production) with a TTL. The cookie carries only that opaque id, set with HttpOnly so XSS can't exfiltrate it, Secure so it never crosses plaintext HTTP, SameSite=Lax so cross-site POSTs don't carry it, an explicit Path and Max-Age, and the server enforces expiry independently of the cookie's lifetime. Requests are authenticated by store lookup, logout deletes the record — instant revocation — and I rotate the id on any privilege change. It's the $_SESSION model I've run for years, with every default made explicit and defensible.",
    },
    {
      q: "If SameSite cookies exist, why do we still talk about CSRF protection?",
      a: "SameSite narrows CSRF; it doesn't retire the topic. Lax still sends the cookie on top-level GET navigations, so any state-changing GET endpoint remains forgeable — one reason mutations must never ride on GET. If the app legitimately needs SameSite=None — embedded widgets, cross-site frontends — the browser attaches the cookie everywhere again and you're back to explicit defences: a CSRF token the page echoes in a header, which a cross-origin attacker can't read, or double-submit cookies, plus Origin-header checks. And defence in depth matters because one misconfigured cookie or legacy browser shouldn't be the single point of failure. So: SameSite=Lax as the default posture, tokens wherever that guarantee is weakened.",
    },
    {
      q: "What is session fixation and how do you prevent it?",
      a: "Fixation is when the attacker chooses the victim's session id before login — planting it via a URL parameter, a subdomain cookie, or an XSS — and then waits. If the application keeps that same id across the login, the attacker's copy of the id is now an authenticated session. The fix is to rotate: on successful login, and on any privilege escalation, issue a brand-new id and delete the old record — `session_regenerate_id(true)` in PHP, or generate-and-swap in your own middleware. Accepting only server-generated ids (never adopting an id presented by the client that isn't in the store) closes the rest of the gap.",
    },
    {
      q: "Sessions make the API stateful — doesn't that violate REST and hurt scaling?",
      a: "It's a real trade-off, so I'd concede the theory point first: the session lookup is per-request state, and REST purism prefers self-contained requests. In practice the cost is one round trip to a shared store like Redis — sub-millisecond, horizontally scalable, and every large PHP shop has run exactly this for decades. What that lookup buys is the thing stateless tokens can't do: instant revocation — logout, account compromise, or an offboarded employee is a single delete, effective on the very next request. For a first-party browser app I take that trade happily; where statelessness genuinely pays — many services verifying identity without a shared store — that's the JWT conversation, with its own costs.",
    },
  ],

  quiz: [
    {
      question: "What does the HttpOnly flag on a session cookie actually prevent?",
      options: [
        "The cookie being sent over unencrypted HTTP",
        "JavaScript reading the cookie, so an XSS bug can't exfiltrate the session id",
        "The cookie being attached to cross-site requests",
        "All XSS attacks against the application",
      ],
      answerIndex: 1,
      explain:
        "HttpOnly hides the cookie from document.cookie — script injected by XSS cannot steal the id for reuse elsewhere. It doesn't stop XSS itself (injected script can still act as the user in-page), Secure handles plaintext HTTP, and SameSite governs cross-site sending.",
    },
    {
      question:
        "With SameSite=Lax on the session cookie, which cross-site request still carries it?",
      options: [
        "A POST auto-submitted from an attacker's hidden form",
        "An image tag on another site loading your API URL",
        "A top-level GET navigation, e.g. the user clicking a link to your app",
        "A fetch() call from another origin's JavaScript",
      ],
      answerIndex: 2,
      explain:
        "Lax withholds the cookie from cross-site POSTs and subresource/script requests but allows it on top-level GET navigations — that's why users clicking into your app stay logged in, and why state-changing GET endpoints remain a CSRF hole even under Lax.",
    },
    {
      question: "Why must the session id be regenerated at login?",
      options: [
        "Old ids are shorter and easier to brute-force",
        "So concurrent logins from two devices get separate records",
        "Browsers refuse to update a cookie's value otherwise",
        "If a pre-login id chosen or planted by an attacker survives login, the attacker holds an authenticated session (fixation)",
      ],
      answerIndex: 3,
      explain:
        "Session fixation works by making the victim authenticate under an id the attacker already knows. Rotating at the privilege boundary — session_regenerate_id(true) in PHP, generate-and-swap in TS middleware — guarantees the authenticated session runs under an id that never existed before login.",
    },
    {
      question:
        "What's the strongest argument for sessions over stateless tokens for a first-party browser app?",
      options: [
        "Sessions need no server infrastructure at all",
        "Deleting the server-side record revokes access instantly — logout and compromise response take effect on the next request",
        "Session cookies are immune to all cross-site attacks",
        "Sessions avoid HTTPS requirements",
      ],
      answerIndex: 1,
      explain:
        "Because the authority lives in the server-side store, revocation is a single delete — no waiting for token expiry, no denylist infrastructure. That, plus HttpOnly keeping the credential out of JavaScript's reach entirely, is the case for sessions as the first-party default.",
    },
  ],
};

export default lesson;
