import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "api-security-top10",
  title: "API Security: OWASP Top 10",
  part: "Operating in Production",
  estMinutes: 13,
  summary:
    "The OWASP API Security Top 10 (2023) as a closing checklist — with the two failures interviewers love most, BOLA and mass assignment, examined in the depth they deserve.",

  concept: `
The **OWASP API Security Top 10 (2023 edition)** is the industry's ranked list of how APIs
actually get breached. It doubles as a map of this course: nearly every entry is a discipline
you now have. Interviewers use it as a checklist too — "how would you prevent BOLA?" is a
stock question — so learn the names, and go deep on the two at the top.

### API1: Broken Object Level Authorization (BOLA) — the #1, by a distance

Authentication says *who you are*; object-level authorization says *whether THIS object is
yours*. BOLA is the gap between them:

\`\`\`ts
// Authenticated? Yes. Authorized for invoice 42? Never asked.
app.get("/api/invoices/:id", requireAuth, async (req, res) => {
  res.json(await invoices.find(Number(req.params.id)));
});
\`\`\`

Any logged-in user walks the id space — \`/api/invoices/1\`, \`2\`, \`3\`... — and reads every
customer's invoices. The fix is a habit, not a framework: **load, then authorize, on every
object access**:

\`\`\`ts
const invoice = await invoices.find(id);
if (!invoice) return problem(res, 404);
if (invoice.customerId !== req.user.id) return problem(res, 404); // not 403 — don't confirm it exists
\`\`\`

UUIDs instead of sequential ids make enumeration harder but are **not** authorization —
ids leak in URLs, logs, and referrers. Check ownership every time, ideally in one
\`loadOwned(model, id, user)\` helper so the check can't be forgotten.

### API3: Broken Object Property Level Authorization — mass assignment's new name

The 2023 edition merged two old entries: **excessive data exposure** (returning properties
the caller shouldn't *read* — \`passwordHash\`, \`internalNotes\`) and **mass assignment**
(accepting properties the caller shouldn't *write*). The PHP classic:

\`\`\`php
foreach ($_POST as $k => $v) { $user->$k = $v; }  // hope nobody posts role=admin
\`\`\`

Its TS twin is \`Object.assign(user, req.body)\` or \`db.update(req.params.id, req.body)\` —
same wound, new syntax. The cure is the DTO discipline: a zod schema that **whitelists
exactly the updatable fields** on the way in (\`z.strictObject\` — unknown keys are an error,
so \`role\` can't even ride along silently), and an explicit response mapper on the way out
so new DB columns never leak by default.

### The rest of the list, fast

- **API2 Broken Authentication** — weak token validation, missing \`exp\` checks, credential
  stuffing without lockouts. Your JWT/session discipline covers this.
- **API4 Unrestricted Resource Consumption** — no rate limits, no pagination caps, no upload
  caps: attackers spend your compute and your third-party bills.
- **API5 Broken Function Level Authorization** — BOLA's sibling for *endpoints*: the mobile
  app hides the admin screen, but \`POST /api/admin/refunds\` answers anyone who finds it.
  Authorization lives server-side, per route, via middleware — never in the client.
- **API7 Server-Side Request Forgery** — your API fetches a user-supplied URL (webhook
  targets, image importers) and can be aimed at \`http://169.254.169.254/\` (cloud metadata)
  or internal services. Allowlist schemes/hosts and block private ranges.
- **API8 Security Misconfiguration** — verbose stack traces in errors, permissive CORS
  (\`Access-Control-Allow-Origin: *\` with credentials), missing security headers, debug
  endpoints in production.

(The remaining entries — unrestricted business flows, inventory management, unsafe
consumption of third-party APIs — are worth a read on owasp.org.)

### The closing mantra

Defence in depth, one line per layer — recite it in the interview and mean it:

> **Validate every input. Authorize every object. Limit everything. Never leak internals.**

Validation (zod at the boundary) stops malformed and malicious shapes; object-level checks
stop BOLA; rate limits, pagination caps, and size caps stop resource abuse; DTO mapping and
Problem Details without stack traces stop information leaks. No single layer is trusted to
be perfect — that is the point.
`,

  comparisons: [
    {
      label: "Mass assignment: patch-everything vs a whitelist schema",
      intro:
        "A profile-update endpoint. The PHP version assigns whatever arrives; the TS version parses the body against a schema that names exactly the fields a user may change.",
      php: `<?php // profile.php — the classic mass-assignment hole
$user = find_user($_SESSION['uid']);

// Whatever keys the client posts become object properties:
//   POST displayName=Dave&role=admin&creditBalance=99999
foreach ($_POST as $key => $value) {
    $user->$key = $value;
}
$user->save();

echo json_encode(['ok' => true]);`,
      ts: `// routes/profile.ts — the payload can ONLY contain these fields
import * as z from "zod";

const ProfileUpdate = z.strictObject({
  displayName: z.string().min(1).max(60).optional(),
  email: z.email().optional(),
});
// strictObject: unknown keys are an ERROR, not ignored —
// role: "admin" fails parsing instead of riding along.

app.patch("/api/me", requireAuth, async (req, res) => {
  const parsed = ProfileUpdate.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      title: "Validation failed",
      errors: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message),
    });
  }
  // parsed.data is typed { displayName?: string; email?: string } —
  // role and creditBalance cannot exist here, by construction.
  const user = await users.update(req.user.id, parsed.data);
  res.json(toProfileDto(user)); // explicit mapper on the way out, too
});`,
      note:
        "The whitelist must live server-side and be exhaustive: parsed.data physically cannot contain role, so there is no 'forgot to unset it' failure mode. The response mapper is the read-side twin — new DB columns don't leak by default.",
    },
    {
      label: "BOLA: fetch-by-id vs load-then-authorize",
      intro:
        "GET /api/invoices/:id in two versions. Both require login; only one asks whether the invoice belongs to the caller.",
      php: `// invoices.ts — authenticated but NOT authorized
app.get("/api/invoices/:id", requireAuth, async (req, res) => {
  const invoice = await invoices.find(Number(req.params.id));
  if (!invoice) {
    return res.status(404).json({ title: "Not found" });
  }
  // Any logged-in user can iterate /api/invoices/1..99999
  // and read every customer's billing history.
  res.json(invoice);
});`,
      ts: `// invoices.ts — load, then authorize, every time
app.get("/api/invoices/:id", requireAuth, async (req, res) => {
  const invoice = await invoices.find(Number(req.params.id));

  // Same 404 for "doesn't exist" and "isn't yours":
  // a 403 would confirm the id is real — free recon.
  if (!invoice || invoice.customerId !== req.user.id) {
    return res.status(404).json({ title: "Not found" });
  }
  res.json(toInvoiceDto(invoice));
});
// Better still: one loadOwned(invoices, id, req.user) helper
// used by EVERY object route, so the check can't be forgotten.`,
      note:
        "requireAuth answers 'who are you'; the ownership comparison answers 'is this object yours' — BOLA is what happens when only the first question gets asked. It has been OWASP's #1 API risk since the list existed.",
      leftLang: "ts",
    },
    {
      label: "Excessive data exposure: dump the row vs map a DTO",
      intro:
        "Returning a user's public profile. One version serialises the database row as-is; the other names every field that leaves the system.",
      php: `<?php // user.php — the row IS the response
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([(int) $_GET['id']]);

// Ships password_hash, reset_token, is_banned,
// internal_notes... and next month's new column, free.
echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));`,
      ts: `// dto/user.ts — the response shape is an explicit decision
interface PublicProfileDto {
  id: string;
  displayName: string;
  joinedAt: string;
}

function toPublicProfileDto(u: UserRow): PublicProfileDto {
  return {
    id: u.publicId,
    displayName: u.displayName,
    joinedAt: u.createdAt.toISOString(),
  };
}
// A new column added to users appears in responses only
// when someone deliberately adds it here — leaking is now
// an action, not a default.`,
      note:
        "SELECT * straight into json_encode means every future column is public by default. The mapper inverts the default: exposure requires an explicit edit — this is the read half of API3, Broken Object Property Level Authorization.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "An audit exercise: the same malicious request — a role-escalation payload aimed at somebody else's account — runs against a vulnerable updateProfile and a hardened one. Predict what each lets through before you run it.",
    code: `// Audit this handler: one request, two implementations.

interface User {
  id: number;
  email: string;
  displayName: string;
  role: "user" | "admin";
}

const db = new Map<number, User>([
  [7,  { id: 7,  email: "mallory@example.com", displayName: "Mallory", role: "user" }],
  [42, { id: 42, email: "victim@example.com",  displayName: "Victim",  role: "user" }],
]);

// The attack: Mallory (user 7) targets user 42 and smuggles a role change.
const session = { userId: 7 };
const request = {
  targetUserId: 42, // not her account            -> BOLA attempt
  payload: {
    displayName: "Totally Legit",
    role: "admin",                             // -> mass assignment attempt
    email: "mallory@evil.example",
  } as Record<string, unknown>,
};

// ---- Version A: vulnerable -------------------------------------------
function updateProfileVulnerable(
  sess: { userId: number },
  targetId: number,
  payload: Record<string, unknown>
): string {
  const user = db.get(targetId);          // no ownership check (API1: BOLA)
  if (!user) return "404";
  Object.assign(user, payload);           // no whitelist (API3: mass assignment)
  return "200";
}

// ---- Version B: hardened ---------------------------------------------
const UPDATABLE = ["displayName", "email"] as const;

function updateProfileHardened(
  sess: { userId: number },
  targetId: number,
  payload: Record<string, unknown>
): string {
  const user = db.get(targetId);
  // Load, then authorize — same 404 whether missing or not yours:
  if (!user || user.id !== sess.userId) return "404";

  // Whitelist parse — zod's strictObject does this for you:
  const unknownKeys = Object.keys(payload).filter(
    (k) => !(UPDATABLE as readonly string[]).includes(k)
  );
  if (unknownKeys.length > 0) {
    return "422 unexpected fields: " + unknownKeys.join(", ");
  }
  if (typeof payload.displayName === "string") user.displayName = payload.displayName;
  if (typeof payload.email === "string") user.email = payload.email;
  return "200";
}

console.log("--- attack vs VULNERABLE handler ---");
console.log("response:", updateProfileVulnerable(session, request.targetUserId, request.payload));
const v = db.get(42)!;
console.log("user 42 after:", v.displayName, "/", v.email, "/ role:", v.role);
console.log("=> foreign account rewritten AND privilege escalated");

// Reset the victim for a fair second round.
db.set(42, { id: 42, email: "victim@example.com", displayName: "Victim", role: "user" });

console.log("--- attack vs HARDENED handler ---");
console.log("foreign id  :", updateProfileHardened(session, request.targetUserId, request.payload));
console.log("own id, role:", updateProfileHardened(session, 7, request.payload));
console.log("own id,clean:", updateProfileHardened(session, 7, { displayName: "Mallory M." }));
const h = db.get(42)!;
const m = db.get(7)!;
console.log("user 42 after:", h.displayName, "/ role:", h.role);
console.log("user 7 after :", m.displayName, "/ role:", m.role);
console.log("=> ownership blocked the BOLA; the whitelist blocked the escalation");`,
  },

  keyPoints: [
    "API1, BOLA, is the #1 API risk: authentication proves who the caller is, but every object access still needs an ownership check — load, then authorize, returning the same 404 for 'missing' and 'not yours'.",
    "API3 merges mass assignment (writes) and excessive data exposure (reads): whitelist updatable fields with `z.strictObject` on the way in, map explicit DTOs on the way out.",
    "`Object.assign(user, req.body)` is `foreach ($_POST as $k => $v) $user->$k = $v` in new clothes — the fix is a schema where forbidden fields cannot exist, not a blacklist of fields to strip.",
    "API5 (function-level) is BOLA for endpoints: admin routes need server-side per-route authorization middleware — hiding buttons in the client is not access control.",
    "API4 is resource consumption: rate limits, pagination caps, and upload size caps are security controls, not just politeness. API7 (SSRF) means allowlisting any URL your API is asked to fetch.",
    "The defence-in-depth mantra: validate every input, authorize every object, limit everything, never leak internals.",
  ],

  interview: [
    {
      q: "What is Broken Object Level Authorization, and how do you prevent it?",
      a: "BOLA — number one on the OWASP API Security Top 10 2023 — is when an API checks that a caller is authenticated but not that the specific object belongs to them, so any logged-in user can iterate `/invoices/1..n` and read everyone's data. Prevention is a per-request habit: load the object, then compare its owner to the authenticated principal before doing anything, on every single object route — reads included. I return the same 404 for 'doesn't exist' and 'isn't yours' so attackers can't map the id space, and I centralise the pattern in a `loadOwned()` helper so the check can't be forgotten on route twenty-seven. Two things I'd flag as non-solutions: UUIDs (they slow enumeration but ids leak in logs and URLs, and possession of an id must never imply access) and client-side checks of any kind.",
    },
    {
      q: "Explain mass assignment and how your validation layer stops it.",
      a: "Mass assignment is binding client input to a model wholesale — PHP's `foreach ($_POST as $k => $v) $user->$k = $v`, or `Object.assign(user, req.body)` in Node — so a client can set fields it should never touch: `role`, `creditBalance`, `emailVerified`. OWASP files it under API3, Broken Object Property Level Authorization, alongside its read-side twin, excessive data exposure. My fix is structural rather than procedural: every write endpoint parses its body against a zod schema that whitelists exactly the updatable fields — `z.strictObject` so unknown keys are a 422, not silently ignored — and the handler only ever touches `parsed.data`, whose type physically cannot contain `role`. Blacklisting ('unset role before saving') fails the day a new privileged column ships; whitelisting is safe by default.",
    },
    {
      q: "You've got five minutes to security-review an API you've never seen. What do you look for first?",
      a: "I triage using the OWASP API Top 10, highest-yield first. One: pick any fetch-by-id route and check whether there's an ownership comparison after the load — missing BOLA checks are the most common and most damaging finding. Two: find an update endpoint and see whether the body is bound wholesale or parsed through a field whitelist — mass assignment. Three: look at a response for over-exposure — is it a mapped DTO or `SELECT *` serialised? Four: check the cheap-but-critical operational layer — rate limiting on auth endpoints, pagination caps, upload size limits (API4), and whether error responses leak stack traces (API8). Five: grep for anywhere the API fetches a user-supplied URL, which is the SSRF surface. That order matches both the OWASP ranking and where I've seen real incidents start.",
    },
  ],

  quiz: [
    {
      question:
        "An endpoint requires a valid JWT, then returns any invoice matching the :id in the URL. Which OWASP API risk is this?",
      options: [
        "API2: Broken Authentication",
        "API1: Broken Object Level Authorization",
        "API4: Unrestricted Resource Consumption",
        "API8: Security Misconfiguration",
      ],
      answerIndex: 1,
      explain:
        "Authentication is working — the JWT is validated. What's missing is the object-level question: does invoice :id belong to THIS caller? That gap is BOLA, the #1 entry, and the fix is an ownership check after every object load.",
    },
    {
      question: "Why is a whitelist schema (z.strictObject with named fields) the right fix for mass assignment, rather than deleting forbidden keys?",
      options: [
        "Whitelists run faster than blacklists",
        "Blacklists fail open: a new privileged field added next month is writable by default, while a whitelist stays safe until someone deliberately adds the field",
        "delete is not available on request bodies",
        "zod cannot remove keys from objects",
      ],
      answerIndex: 1,
      explain:
        "Stripping known-bad keys protects only against the fields you remembered today. A whitelist inverts the default: anything not explicitly named is rejected, so schema drift can't silently open a hole — and with strictObject the smuggled key is a visible 422, not a silent no-op.",
    },
    {
      question:
        "When a user requests an object that exists but belongs to someone else, why return 404 rather than 403?",
      options: [
        "403 is reserved for authentication failures",
        "404 responses are cacheable and 403 responses are not",
        "A 403 confirms the id refers to a real object, helping an attacker map the id space; 404 reveals nothing",
        "HTTP forbids 403 on GET requests",
      ],
      answerIndex: 2,
      explain:
        "Answering 403 for real-but-foreign ids and 404 for missing ones turns your API into an existence oracle — an enumerator learns exactly which ids are live. Returning an identical 404 for both cases gives away nothing. (403 remains fine where existence isn't secret.)",
    },
    {
      question:
        "The mobile app hides the admin screen from non-admins, and the team considers POST /api/admin/refunds safe because of it. Which risk does this illustrate?",
      options: [
        "API5: Broken Function Level Authorization",
        "API7: Server-Side Request Forgery",
        "API3: Broken Object Property Level Authorization",
        "API1: Broken Object Level Authorization",
      ],
      answerIndex: 0,
      explain:
        "Hiding UI is not access control — anyone with curl can call the endpoint directly. Function-level authorization means the server enforces role checks per route (middleware on every /admin/* path), regardless of what any client chooses to display.",
    },
  ],
};

export default lesson;
