import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "security-and-architecture",
  title: "Security & App Architecture",
  part: "Production & Interview Prep",
  estMinutes: 12,
  summary:
    "Authorization belongs in a Data Access Layer next to the queries — not only in proxy.ts — plus DTOs to stop over-sharing with the client, per-action auth in Server Actions, and JSX's automatic XSS escaping.",

  concept: `
This is the section that separates "knows Next.js" from "I'd trust them with
production." The theme is old wisdom you already hold from PHP — validate at
the point of use, escape output, never trust the transport — mapped onto the
App Router's architecture.

### Why proxy.ts is not your security boundary

It's tempting to put THE auth check in \`proxy.ts\`: one gate, every request.
But treat that gate as **UX optimization** (fast redirects for obviously
logged-out users), not the security boundary. Two reasons:

- **Layers get bypassed.** In March 2025, CVE-2025-29927 (CVSS 9.1) showed
  that sending a crafted \`x-middleware-subrequest\` header — an internal
  Next.js header — made self-hosted deployments **skip middleware entirely**.
  Every app whose only auth check lived in middleware was wide open until
  patched (14.2.25 / 15.2.3). The PHP parallel: one \`admin/users.php\` that
  forgot its \`require 'auth_check.php';\` — the include-based gate fails
  exactly once, somewhere.
- **Layouts don't re-render on every navigation**, and there are many paths
  to data (pages, route handlers, Server Actions). A perimeter check can't
  see them all.

The principle is **defense in depth**: check authorization *next to the
data*, where it can't be routed around.

### The Data Access Layer (DAL)

Concentrate all data access in one server-only module, and have **every
function re-verify the session before touching the database**:

\`\`\`ts
// lib/dal.ts
import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';

export const verifySession = cache(async () => {
  const token = (await cookies()).get('session')?.value;
  const session = await decrypt(token);
  if (!session?.userId) redirect('/login');
  return { userId: session.userId };
});

export async function getOrders() {
  const { userId } = await verifySession();   // EVERY query re-checks
  return db.order.findMany({ where: { userId } });
}
\`\`\`

\`import 'server-only'\` makes a client import a build error; React's
\`cache()\` memoizes \`verifySession\` per request, so ten DAL calls in one
render cost one session lookup. This is the officially recommended pattern —
authorization lives beside the query, like a repository class whose every
method runs the ACL check first.

### DTOs: don't pass the whole row across the boundary

Any prop you pass to a \`'use client'\` component is serialized into the
payload the browser receives. Hand a client component the full user row and
\`passwordHash\`, \`stripeCustomerId\` and \`email\` ship to the browser —
invisible in the UI, visible in DevTools. The fix is a **Data Transfer
Object**: a mapper that picks exactly the fields the client needs. Select
narrow columns in the query, return the narrow shape from the DAL.

### Server Actions are public endpoints

Every Server Action compiles to an HTTP endpoint. Anyone with a terminal can
invoke it with arbitrary arguments — exactly like a PHP script that handles
\`$_POST\`. So each action authenticates and authorizes **inside its own
body** (call \`verifySession()\` first) and validates its inputs. "The button
is only shown to admins" is not a security control; it never was in PHP
either.

### XSS: JSX is htmlspecialchars by default

Twenty-five years of \`echo htmlspecialchars($x)\` taught you that escaping
is opt-in in PHP — forget it once and you've got XSS. React inverts the
default: every \`{expression}\` in JSX is **automatically escaped**. The
opt-out is deliberately ugly:
\`dangerouslySetInnerHTML={{ __html: trustedHtml }}\` — reserve it for
content you sanitize server-side (CMS HTML through a library like DOMPurify),
and treat every use as a code-review flag.
`,

  comparisons: [
    {
      label: "Escaping output: opt-in vs automatic",
      intro:
        "Render a user-supplied comment. In PHP, safety depends on remembering htmlspecialchars every time; in JSX the escaping is the default and the dangerous path is loudly named.",
      php: `<?php // comment.php
$comment = $row['body']; // "<script>steal()</script>"

// Safe — but only because you remembered:
echo '<p>' . htmlspecialchars($comment) . '</p>';

// One forgetful echo elsewhere = stored XSS:
echo '<p>' . $comment . '</p>';`,
      ts: `// app/comments/comment.tsx
export function Comment({ body }: { body: string }) {
  // body = "<script>steal()</script>"

  // Escaped automatically — renders as inert text:
  return <p>{body}</p>;

  // The opt-out is deliberately scary to type, and
  // belongs only after server-side sanitization:
  // <p dangerouslySetInnerHTML={{ __html: body }} />
}`,
      note: "React flips PHP's default: interpolated values are escaped unless you explicitly reach for dangerouslySetInnerHTML — the same inversion TypeScript performed on 'any input is a string until proven otherwise.'",
    },
    {
      label: "Authorization next to the data",
      intro:
        "Fetch the current user's orders. The PHP repository runs its ACL check inside the method; the DAL function calls verifySession before querying. Same instinct, and in both cases no caller can skip the check.",
      php: `<?php // OrderRepository.php
class OrderRepository
{
    public function __construct(
        private PDO $pdo,
        private Auth $auth,
    ) {}

    public function forCurrentUser(): array
    {
        // The check lives IN the repository —
        // no controller can forget it.
        $user = $this->auth->requireLogin();

        $q = $this->pdo->prepare(
            'SELECT id, total, status
               FROM orders WHERE user_id = ?'
        );
        $q->execute([$user->id]);
        return $q->fetchAll();
    }
}`,
      ts: `// lib/dal.ts
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decrypt } from './session';
import { db } from './db';

export const verifySession = cache(async () => {
  const token = (await cookies()).get('session')?.value;
  const session = await decrypt(token);
  if (!session?.userId) redirect('/login');
  return { userId: session.userId };
});

export async function getOrders() {
  const { userId } = await verifySession();
  return db.order.findMany({
    where: { userId },
    select: { id: true, total: true, status: true },
  });
}`,
      note: "cache() memoizes verifySession per request so repeated DAL calls cost one session check, and server-only guarantees this file can never reach the client bundle.",
      rightLang: "ts",
    },
    {
      label: "The forgotten include vs the bypassed middleware",
      intro:
        "Both stacks have a perimeter that can fail: the PHP include you forget on one page, and the middleware layer CVE-2025-29927 proved can be skipped. The defense is identical — check again at the data.",
      php: `<?php // admin/users.php
// Whoops — every other admin page starts with
//   require __DIR__ . '/../auth_check.php';
// This one doesn't. It shipped on a Friday.

$users = $pdo->query(
    'SELECT id, email, role FROM users'
)->fetchAll();

foreach ($users as $u) {
    echo "<li>{$u['email']} ({$u['role']})</li>";
}`,
      ts: `// proxy.ts — the PERIMETER: fast redirects, good UX
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has('session');
  if (!hasSession && request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

// In March 2025, CVE-2025-29927 let attackers skip this
// entire layer with one crafted header. Apps that ALSO
// verified the session in their DAL didn't care:
// the data checks held.`,
      note: "Perimeter checks fail in every stack — a missing require, a bypassed middleware layer. Defense in depth means the query-side check makes the perimeter's failure a non-event.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A DTO mapper: the database row exists only on the server; the client component receives a hand-picked shape. Run it and note which fields never cross the boundary — and that role became a boolean instead of leaking the enum.",
    code: `// What crosses the server->client boundary is YOUR choice.
// Props passed to a 'use client' component are serialized into the
// page payload — so map rows to DTOs and pass only what the UI needs.

interface UserRow {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'member';
  stripeCustomerId: string;
}

interface UserDTO {
  id: number;
  name: string;
  isAdmin: boolean;
}

function toUserDTO(row: UserRow): UserDTO {
  // Pick fields explicitly. Never spread the row.
  return { id: row.id, name: row.name, isAdmin: row.role === 'admin' };
}

const row: UserRow = {
  id: 7,
  name: 'Ada',
  email: 'ada@example.com',
  passwordHash: '$2y$10$N9qo8uLOickgx2ZMRZoMye8Xz',
  role: 'admin',
  stripeCustomerId: 'cus_9x8y7z',
};

const dto = toUserDTO(row);

console.log('server-side row  :', JSON.stringify(row));
console.log('client-safe DTO  :', JSON.stringify(dto));

const strippedFields = (Object.keys(row) as (keyof UserRow)[]).filter(
  (key) => !(key in dto)
);
console.log('never serialized :', strippedFields.join(', '));
console.log('note: role became isAdmin — derive, do not forward.');`,
  },

  keyPoints: [
    "proxy.ts is UX-level gating, not the security boundary — CVE-2025-29927 (March 2025, CVSS 9.1) let a crafted x-middleware-subrequest header skip middleware entirely on unpatched self-hosted apps.",
    "Build a Data Access Layer (`lib/dal.ts`): `import 'server-only'`, a `verifySession()` memoized with React's `cache()`, and EVERY data function calls it before querying — authorization lives next to the data.",
    "Props passed to `'use client'` components are serialized to the browser: map DB rows to DTOs that pick exactly the fields the UI needs (and derive, e.g. `isAdmin`, rather than forwarding `role`).",
    "Every Server Action is a public HTTP endpoint — authenticate, authorize, and validate inside each action body; hidden buttons are not access control.",
    "JSX escapes interpolated values automatically (htmlspecialchars by default); `dangerouslySetInnerHTML` is the loud opt-out, only for server-sanitized HTML.",
    "Defense in depth is the senior signal: perimeter checks (proxy, layouts) fail eventually — the query-side check is what makes that failure a non-event.",
  ],

  interview: [
    {
      q: "How do you protect routes and data in a Next.js App Router application?",
      a: "In layers, with the real boundary at the data. proxy.ts gives fast optimistic redirects — logged-out users bounce off /admin before anything renders — but I treat it as UX, not security: the 2025 middleware bypass (CVE-2025-29927) skipped that entire layer with one crafted header, and apps relying on it alone were open. The load-bearing check is a Data Access Layer: a server-only lib/dal.ts whose `verifySession()` reads and decrypts the session cookie, memoized with React's `cache()` so it costs one lookup per request, and every data function calls it before querying. Server Actions get the same treatment individually, since each one is a public endpoint. It's the discipline PHP taught me the hard way — the one admin page that forgets its auth include is the one that ships.",
    },
    {
      q: "What's the risk in passing a database record straight to a client component?",
      a: "Everything you pass as props to a 'use client' component is serialized into the payload sent to the browser — rendering only three fields doesn't stop the other ten from shipping. A full user row means passwordHash, email, and billing IDs sitting in the RSC payload, one DevTools tab away. The fix is DTOs: the Data Access Layer selects narrow columns and a mapper returns exactly the shape the UI needs, deriving values where possible — isAdmin: boolean instead of forwarding the role enum. It's the API-response discipline from PHP days — you never json_encode'd the raw row — applied to an intra-app boundary that doesn't look like an API but is one.",
    },
    {
      q: "How does XSS protection work in React compared to PHP?",
      a: "The defaults are inverted. In PHP, output is raw unless I remember htmlspecialchars on every echo — safety is opt-in, and one forgotten call is a stored XSS. In JSX, every interpolated `{value}` is automatically escaped — a comment containing a script tag renders as inert text. The escape hatch is `dangerouslySetInnerHTML={{ __html }}`, named to hurt: I only reach for it for genuinely trusted HTML, like CMS content sanitized server-side with something like DOMPurify, and I'd flag any other use in review. Auto-escaping doesn't cover everything — URLs in href (javascript: schemes) and anything I concatenate into raw HTML outside JSX still need care.",
    },
  ],

  quiz: [
    {
      question:
        "Why shouldn't proxy.ts be the only place authorization is checked?",
      options: [
        "proxy.ts can't read cookies, so it can't identify users",
        "Perimeter layers can be bypassed — as CVE-2025-29927 demonstrated in 2025 — so checks must also live next to the data in a DAL",
        "proxy.ts only runs in development mode",
        "Middleware checks are too slow for production traffic",
      ],
      answerIndex: 1,
      explain:
        "The 2025 vulnerability let a crafted x-middleware-subrequest header skip middleware entirely on self-hosted apps. Defense in depth — verifySession() inside every DAL function — means a bypassed perimeter exposes nothing. proxy.ts can read cookies fine; it's just not sufficient alone.",
    },
    {
      question:
        "A Server Component passes the full user row as a prop to a 'use client' profile card that only renders the name. What ships to the browser?",
      options: [
        "Only the name, since that's all the JSX references",
        "Nothing — Server Component data stays on the server",
        "The entire row, serialized into the payload — including passwordHash if it's there",
        "The row, but sensitive-looking fields are stripped automatically",
      ],
      answerIndex: 2,
      explain:
        "Props crossing the server/client boundary are serialized wholesale into the payload the browser receives; what the JSX happens to render is irrelevant. That's why the DAL should return DTOs with hand-picked fields.",
    },
    {
      question: "What is the JSX equivalent of forgetting htmlspecialchars?",
      options: [
        "Rendering user input with {value} in JSX",
        "Using dangerouslySetInnerHTML with unsanitized user content",
        "Passing user input as a prop to a client component",
        "Using a template literal to build a string",
      ],
      answerIndex: 1,
      explain:
        "JSX escapes {value} interpolations automatically, so the ordinary path is safe. dangerouslySetInnerHTML injects raw HTML, recreating PHP's unescaped echo — acceptable only for content sanitized server-side.",
    },
  ],
};

export default lesson;
