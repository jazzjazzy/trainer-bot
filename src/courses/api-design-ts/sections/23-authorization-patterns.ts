import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "authorization-patterns",
  title: "Authorization Patterns",
  part: "Auth & Access Control",
  estMinutes: 12,
  summary:
    "Authentication says who you are; authorization says what you may do — via role→permission maps, attribute-based policies, and the non-negotiable object-level ownership check.",

  concept: `
Authentication (authN) establishes *who* is calling; authorization (authZ)
decides *what they may do*. Most auth walkthroughs stop at the first half —
and most real API breaches happen in the second. A valid token for user 7
must not fetch \`/orders/42\` belonging to user 9, and no session cookie or
JWT signature will save you from that bug: it's a missing check, not a
broken credential.

### RBAC: roles map to permissions — in one place

Role-Based Access Control assigns users **roles**, and roles grant
**permissions**. The design rule that separates clean RBAC from the PHP
habit of \`if ($user['role'] == 'admin')\` scattered across forty files is:
**handlers check permissions, never roles**. A single map — \`editor\` may
\`order:update\`, \`admin\` may \`order:delete\` — lives in one module, and
code asks \`can(user, "order:update", order)\`. Add a \`support\` role next
quarter and you edit the map, not forty conditionals with subtly different
rules.

### ABAC: attributes join the decision

Role alone can't express "editors may update *their own* draft orders".
Attribute-Based Access Control brings in properties of the **user** (id,
tenant), the **resource** (owner, tenant, status), and the **context**
(time, IP). In practice you rarely adopt a heavyweight policy language —
you write policy *functions* that take user + action + resource and return
a decision. Ownership and tenancy are the attributes that matter on day one.

### The object-level check (BOLA)

Broken Object Level Authorization — guessing IDs in URLs — is **API1 in the
OWASP API Security Top 10 (2023)**, the #1 API risk. The defence is
mechanical and non-negotiable: for every request that names a resource,
**load the resource, then check the caller's relationship to it** before
acting. Role checks don't help; user 7 and user 9 are both legitimate
\`editor\`s. The check is \`order.ownerId === user.id\` (or tenant equality),
and it must exist on *every* object-addressing endpoint — GET included.

### Where each check lives

- **Authenticate in middleware.** Verifying the session or token is uniform,
  so it belongs at the front door; the handler receives a trusted \`req.user\`.
- **Authorize near the handler.** The object-level decision needs the loaded
  resource, so it can't run before routing — the natural shape is
  *load, then authorize, then act*. Blanket rules ("\`/admin/*\` requires
  \`admin\`") can still sit in middleware; fine-grained decisions can't.

### 403 vs 404: an information-hiding decision

When the caller fails the object check, you choose what to reveal:

- **403 Forbidden** — "it exists, but you may not". Honest, but confirms
  existence: an attacker probing sequential IDs learns which are real.
- **404 Not Found** — "no such resource *for you*". Hides existence;
  GitHub returns 404 for private repositories you can't see.

Neither is universally right — 404 protects private per-user data; 403 suits
resources whose existence is public but whose access is restricted. Pick
per resource type, document it internally, and be consistent, because an
inconsistent mix leaks the same information 403 does.
`,

  comparisons: [
    {
      label: "Role strings inline vs a policy function",
      intro:
        "Both decide whether the caller may update an order. The left compares role strings wherever it happens to need them; the right asks one policy module a question.",
      php: `<?php // orders/update.php — a different rule in every file
$user = current_user();

if ($user['role'] == 'admin' || $user['role'] == 'manager') {
    update_order($_GET['id'], $_POST);
    echo json_encode(['ok' => true]);
} elseif ($user['role'] == 'editor' && $_GET['mine'] == '1') {
    // trusts a QUERY PARAM to say it's their own order...
    update_order($_GET['id'], $_POST);
    echo json_encode(['ok' => true]);
} else {
    http_response_code(403);
}
// Forty files like this, each with its own slightly different idea
// of what 'manager' means. Adding a role = a grep-and-pray refactor.`,
      ts: `// authz/policy.ts — one permission map, one entry point
type Role = "viewer" | "editor" | "admin";
type Action = "order:read" | "order:update" | "order:delete";

const grants: Record<Role, Action[]> = {
  viewer: ["order:read"],
  editor: ["order:read", "order:update"],
  admin: ["order:read", "order:update", "order:delete"],
};

export function can(
  user: { id: number; role: Role },
  action: Action,
  resource: { ownerId: number },
): boolean {
  if (!grants[user.role].includes(action)) return false;
  if (user.role !== "admin" && resource.ownerId !== user.id) return false;
  return true;
}

// Handlers ask a question instead of comparing strings:
//   if (!can(req.user, "order:update", order)) ...`,
      note:
        "Handlers check permissions, not roles: the role→permission mapping lives in one module, ownership is checked against the loaded resource — not a query param — and new roles are a one-line map edit.",
    },
    {
      label: "Authenticated is not authorized",
      intro:
        "Both endpoints require a valid login. The left one stops there — any signed-in user can read any order by guessing IDs. The right loads the row, then authorizes against it.",
      php: `// routes/orders.ts — the BOLA bug (OWASP API1:2023)
app.get("/orders/:id", requireAuth, async (req, res, next) => {
  try {
    // req.user is verified... and then never consulted again.
    const order = await db.orders.findById(req.params.id);
    if (!order) {
      return res.status(404).json(problem(404, "Not Found"));
    }
    // User 7 fetches /orders/42 belonging to user 9: 200 OK.
    res.json(order);
  } catch (err) {
    next(err);
  }
});`,
      ts: `// routes/orders.ts — load, THEN authorize, then act
app.get("/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const order = await db.orders.findById(req.params.id);

    // Missing and forbidden collapse into the same response on
    // purpose — existence is information too.
    if (!order || !can(req.user, "order:read", order)) {
      return res.status(404).json(problem(404, "Not Found"));
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});`,
      note:
        "The object-level check needs the loaded resource, so it lives beside the handler — middleware verified WHO is calling, but only the handler knows WHAT they're touching.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "What a failed check reveals: 403 vs 404",
      intro:
        "Bob probes order IDs that belong to Alice. Compare what each response strategy teaches him about which IDs exist.",
      php: `# Strategy A: honest 403 — and an existence oracle
$ curl -i https://api.example.com/orders/41 \\
    -H "Authorization: Bearer <bob's token>"
HTTP/1.1 403 Forbidden
Content-Type: application/problem+json

{ "title": "You do not own this order", "status": 403 }

$ curl -i https://api.example.com/orders/99999 \\
    -H "Authorization: Bearer <bob's token>"
HTTP/1.1 404 Not Found

# 403 vs 404 tells Bob exactly which order IDs are real.
# Now he can enumerate your order volume — or target real IDs.`,
      ts: `# Strategy B: information hiding — forbidden looks like missing
$ curl -i https://api.example.com/orders/41 \\
    -H "Authorization: Bearer <bob's token>"
HTTP/1.1 404 Not Found
Content-Type: application/problem+json

{ "type": "about:blank", "title": "Not Found", "status": 404 }

$ curl -i https://api.example.com/orders/99999 \\
    -H "Authorization: Bearer <bob's token>"
HTTP/1.1 404 Not Found
Content-Type: application/problem+json

{ "type": "about:blank", "title": "Not Found", "status": 404 }

# Identical responses: Bob learns nothing. GitHub does exactly
# this for private repositories you cannot see.`,
      note:
        "404-for-forbidden is a deliberate information-hiding decision, not sloppiness — choose per resource type, document it internally, and apply it consistently.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature policy engine: an RBAC permission map, the object-level ownership check, and one attribute rule — run against seven access attempts. Predict each ALLOW/DENY and the reason before running; then try promoting bob to editor and see which denials change.",
    code: `// A miniature policy engine: RBAC (role -> permissions) + object-level
// ownership + an attribute rule, with every denial explaining itself.

type Role = "viewer" | "editor" | "admin";
type Action = "read" | "update" | "delete";

interface User { id: number; role: Role; }
interface Order { id: number; ownerId: number; status: "draft" | "shipped"; }

// RBAC layer: what each role MAY do, before we look at the object.
const rolePermissions: Record<Role, Action[]> = {
  viewer: ["read"],
  editor: ["read", "update"],
  admin: ["read", "update", "delete"],
};

interface Decision { allow: boolean; reason: string; }

function can(user: User, action: Action, order: Order): Decision {
  // 1. RBAC: does the role include this action at all?
  if (!rolePermissions[user.role].includes(action)) {
    return { allow: false, reason: "role '" + user.role + "' lacks '" + action + "'" };
  }
  // 2. Object level — the BOLA check. Non-admins must own the resource.
  if (user.role !== "admin" && order.ownerId !== user.id) {
    return { allow: false, reason: "not the owner (object-level check)" };
  }
  // 3. ABAC: a resource attribute can still veto.
  if (action !== "read" && order.status === "shipped") {
    return { allow: false, reason: "shipped orders are immutable (state attribute)" };
  }
  return { allow: true, reason: "role permits it and object checks pass" };
}

const alice: User = { id: 7, role: "editor" };
const bob: User = { id: 9, role: "viewer" };
const root: User = { id: 1, role: "admin" };

const draft: Order = { id: 42, ownerId: 7, status: "draft" };
const shipped: Order = { id: 43, ownerId: 7, status: "shipped" };

const attempts: Array<[string, User, Action, Order]> = [
  ["alice reads her draft    ", alice, "read", draft],
  ["alice updates her draft  ", alice, "update", draft],
  ["alice updates shipped    ", alice, "update", shipped],
  ["alice deletes her draft  ", alice, "delete", draft],
  ["bob reads alice's order  ", bob, "read", draft],
  ["bob updates alice's order", bob, "update", draft],
  ["admin deletes the draft  ", root, "delete", draft],
];

for (const [label, user, action, order] of attempts) {
  const d = can(user, action, order);
  console.log((d.allow ? "ALLOW " : "DENY  ") + label + " — " + d.reason);
}`,
  },

  keyPoints: [
    "AuthN establishes who is calling; authZ decides what they may do — a valid token is the *start* of the access decision, not the end.",
    "RBAC done right: handlers check permissions via `can(user, action, resource)`; the role→permission map lives in one module, never as role strings compared inline.",
    "ABAC adds attributes — ownership, tenancy, resource state — as policy functions; ownership is the attribute that matters from day one.",
    "The object-level check is non-negotiable: load the resource, then verify the caller's relationship to it. Missing it is BOLA — OWASP API Security Top 10 (2023) #1.",
    "Placement: authenticate in middleware (uniform), authorize near the handler (needs the loaded resource) — load, then authorize, then act.",
    "403 confirms a resource exists; 404 hides it. Returning 404 for forbidden objects is a deliberate, documented information-hiding choice (GitHub does it for private repos).",
  ],

  interview: [
    {
      q: "What's the difference between authentication and authorization, and where does each belong in an API?",
      a: "Authentication establishes identity — verifying the session, JWT, or API key — and it's uniform across the API, so it belongs in middleware at the front door; handlers receive a trusted `req.user`. Authorization decides what that identity may do, and the interesting part of it can't live in middleware, because object-level decisions need the loaded resource: whether user 7 may update order 42 depends on order 42's owner, tenant, and state. So my shape is: middleware authenticates, coarse gates like '/admin requires the admin permission' can also sit in middleware, and handlers do load-then-authorize via a policy function before acting. Conflating the two — assuming 'logged in' means 'allowed' — is where BOLA bugs come from.",
    },
    {
      q: "What is BOLA and how do you prevent it?",
      a: "Broken Object Level Authorization — number one in the OWASP API Security Top 10 (2023). It's when an authenticated user reaches objects they don't own by manipulating identifiers: user 7 requests `/orders/42`, which belongs to user 9, and gets it because the endpoint only checked that *someone* was logged in. Prevention is mechanical: every endpoint that addresses an object must load it and verify the caller's relationship — ownership or tenancy — before acting, on reads as well as writes. I'd centralise that in a `can(user, action, resource)` policy function so it can't be forgotten per-handler, use unguessable IDs like UUIDs as defence-in-depth (never as the fix), and put an 'access another user's object' test in the suite for every resource type.",
    },
    {
      q: "A user requests a resource they're not allowed to see. Do you return 403 or 404?",
      a: "It's an information-hiding trade-off, and I'd frame it exactly that way. 403 is honest — 'this exists, you may not access it' — but it confirms existence, so an attacker walking sequential IDs learns which ones are real. 404 makes forbidden indistinguishable from missing; GitHub famously returns 404 for private repositories you can't see. My rule: for private, per-user or per-tenant data, return 404 so existence itself isn't leaked; 403 is fine where existence is public knowledge but access is restricted, like an admin-only endpoint. Whichever you pick, apply it consistently per resource type and document it internally — a mix of the two leaks as much as 403 does.",
    },
    {
      q: "How would you structure role-based access control so it stays maintainable as the app grows?",
      a: "The rule I hold is: handlers check permissions, never roles. Roles map to permission sets in exactly one module — `editor` grants `order:read` and `order:update` — and everything else asks `can(user, 'order:update', order)`. That keeps a role's meaning in one place, so adding a `support` role is a map edit rather than auditing every inline `role === 'admin'` comparison, and it gives one seam to layer attribute rules — ownership, tenancy, resource state — into the same decision. It also makes policy testable as a pure function: user, action, resource in; decision out. When requirements outgrow that, I'd reach for an existing policy engine before inventing a DSL.",
    },
  ],

  quiz: [
    {
      question:
        "User 7 sends a valid JWT and requests GET /orders/42, which belongs to user 9. The handler returns the order. What is this vulnerability?",
      options: [
        "Broken authentication — the JWT should have been rejected",
        "BOLA (Broken Object Level Authorization) — OWASP API Top 10 #1",
        "CSRF — the request was forged from another site",
        "An injection flaw in the ID parameter",
      ],
      answerIndex: 1,
      explain:
        "The credential was perfectly valid — that's the point. Authentication succeeded; what's missing is the object-level check that the caller has a relationship to order 42. That's Broken Object Level Authorization, API1 in the OWASP API Security Top 10 (2023).",
    },
    {
      question: "Why can't the object-level authorization check live in authentication middleware?",
      options: [
        "Middleware runs too slowly for per-object decisions",
        "Express middleware cannot return 403 responses",
        "The decision needs the loaded resource (owner, tenant, state), which middleware doesn't have",
        "It can — middleware is exactly where ownership checks belong",
      ],
      answerIndex: 2,
      explain:
        "Whether user 7 may touch order 42 depends on attributes of order 42 itself, which are only known after the handler (or a loader near it) fetches the row. Hence the pattern: authenticate in middleware, then load → authorize → act in the handler.",
    },
    {
      question:
        "Why might an API deliberately return 404 instead of 403 when a user requests another tenant's resource?",
      options: [
        "404 responses are cheaper to generate than 403s",
        "HTTP forbids sending 403 with application/problem+json",
        "It avoids logging failed authorization attempts",
        "A 403 confirms the resource exists, enabling ID enumeration; 404 hides existence",
      ],
      answerIndex: 3,
      explain:
        "Responding 403 for real-but-forbidden IDs and 404 for missing ones turns your API into an existence oracle. Collapsing both cases into 404 (as GitHub does for private repos) is deliberate information hiding — a per-resource-type design decision worth documenting.",
    },
    {
      question: "In well-structured RBAC, what does a request handler actually check?",
      options: [
        "That the user's role string equals one of the allowed roles",
        "A permission, via a central policy function like can(user, 'order:update', order)",
        "The user's role claim inside the JWT, decoded in the handler",
        "Nothing — RBAC checks all happen in the database layer",
      ],
      answerIndex: 1,
      explain:
        "Handlers ask about permissions; the role→permission mapping lives in one module. Inline role-string comparisons scatter each role's meaning across the codebase — the PHP `if ($user['role'] == 'admin')` habit — making every new role a risky grep-driven refactor.",
    },
  ],
};

export default lesson;
