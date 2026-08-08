import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "authentication",
  title: "Authentication Patterns",
  part: "Mutations & APIs",
  estMinutes: 13,
  summary:
    "Session auth the App Router way: a login action sets an httpOnly cookie, a verifySession() data-access function reads it, and protection happens in layers — never only in a layout.",

  concept: `
You have run session auth for decades: \`session_start()\`, check the password
with \`password_verify()\`, drop the user id into \`$_SESSION\`, and guard every
protected page with an \`if (empty($_SESSION['user_id']))\` at the top. The
App Router model is the same — a cookie identifies the session, server code
checks it before serving anything private — but the cookie handling is
explicit, and "the top of the page" needs redefining in a world of layouts
and client-side navigation.

### Login is a Server Action that sets a cookie

\`\`\`ts
// app/login/actions.ts
'use server';
import { cookies } from 'next/headers';

export async function login(prev: FormState, formData: FormData) {
  const user = await findUser(String(formData.get('email')));
  const ok = user && (await verifyPassword(
    String(formData.get('password')), user.passwordHash));
  if (!ok) return { message: 'Invalid credentials' };

  const token = await createSession(user.id);  // signed or stored server-side

  (await cookies()).set('session', token, {
    httpOnly: true,      // JS can't read it - blunts XSS theft
    secure: true,        // HTTPS only
    sameSite: 'lax',     // basic CSRF hygiene
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect('/dashboard');
}
\`\`\`

\`cookies()\` is one of the async request APIs — **await it** (Next 16 removed
synchronous access entirely). Cookies can only be *set* where a response is
being produced: Server Actions and route handlers. PHP's \`session_start()\`
did the cookie ceremony invisibly; here you own the flags — and can finally
explain them in an interview.

### Reading it: a Data Access Layer, not scattered checks

Centralize verification in one function and call it everywhere private data
is touched:

\`\`\`ts
// lib/session.ts
import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';

export const verifySession = cache(async () => {
  const token = (await cookies()).get('session')?.value;
  if (!token) return null;
  return await decryptSession(token);   // null if invalid/expired
});
\`\`\`

React's \`cache()\` deduplicates the call within a single request — the layout,
the page, and three components can all call \`verifySession()\` and the cookie
is decrypted once. \`import 'server-only'\` makes any client-side import a
build error, so the session logic can never leak into the bundle.

### The layout trap (interviewers love this one)

Putting the auth check **only in a layout** is unsafe. Layouts do not
re-render on soft navigation — that's their selling point for performance.
Navigate from one protected page to another and the layout's check simply
does not run again; partial rendering means Next re-renders the page segment,
not the shared shell above it. A session invalidated mid-visit keeps working
wherever the layout is the only guard.

So protect in **layers**, each catching what the previous can't:

1. **proxy.ts** — optimistic: no session cookie at all → redirect to /login.
   Fast, no DB, great UX. Not authoritative.
2. **Pages and Server Components** — call \`verifySession()\` before rendering
   private data; \`redirect('/login')\` on failure.
3. **Server Actions and route handlers** — verify at the top of each one;
   they are public HTTP endpoints regardless of what the UI shows.

### The ecosystem answer

In production most teams reach for **Auth.js** (the successor to NextAuth)
for OAuth/social login, or a hosted provider like **Clerk**. Name them in
interviews — but the mechanics above are what they do under the hood, and
"how would you build sessions by hand" is the actual interview question.
`,

  comparisons: [
    {
      label: "Login: $_SESSION vs an explicit signed cookie",
      intro:
        "Verify a password and establish a session. PHP's session machinery sets the cookie implicitly; the Server Action creates a token and sets the cookie with every flag spelled out.",
      php: `<?php // login.php
session_start();

$stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
$stmt->execute([$_POST['email'] ?? '']);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user ||
    !password_verify($_POST['password'] ?? '', $user['password_hash'])) {
    $error = 'Invalid credentials';
    require 'login-form.php';
    exit;
}

session_regenerate_id(true);          // fixation defense
$_SESSION['user_id'] = $user['id'];   // cookie set behind the scenes

header('Location: /dashboard.php');
exit;`,
      ts: `// app/login/actions.ts
'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(prev: FormState, formData: FormData) {
  const user = await findUser(String(formData.get('email')));
  const ok = user && (await verifyPassword(
    String(formData.get('password')), user.passwordHash));

  if (!ok) return { message: 'Invalid credentials' };

  const token = await createSession(user.id); // signed JWT or DB row

  (await cookies()).set('session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect('/dashboard');   // outside any try/catch, as always
}`,
      note:
        "Same flow — verify, issue session, redirect — but the cookie ceremony session_start() hid is now explicit: cookies() is awaited (async request API), and httpOnly/secure/sameSite are your responsibility and your interview talking points.",
      rightLang: "ts",
    },
    {
      label: "Guarding a protected page",
      intro:
        "The dashboard must bounce anonymous visitors. PHP checks $_SESSION at the top of the script; the Server Component awaits verifySession() before rendering — same guard, same position.",
      php: `<?php // dashboard.php
session_start();

if (empty($_SESSION['user_id'])) {
    header('Location: /login.php');
    exit;
}

$stmt = $pdo->prepare('SELECT name FROM users WHERE id = ?');
$stmt->execute([$_SESSION['user_id']]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);
?>
<h1>Welcome back, <?= htmlspecialchars($user['name']) ?></h1>`,
      ts: `// app/dashboard/page.tsx
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { getUser } from '@/lib/data';

export default async function DashboardPage() {
  const session = await verifySession();   // cached per request
  if (!session) redirect('/login');

  const user = await getUser(session.userId);

  return <h1>Welcome back, {user.name}</h1>;
}`,
      note:
        "The check sits in the PAGE (and in every action touching private data) — not only in a layout, because layouts don't re-render on soft navigation between protected pages. React's cache() means repeated verifySession() calls cost one decryption per request.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The whole session lifecycle in miniature: login verifies credentials and puts a token in a cookie jar, verifySession() looks it up, and a protected 'page' allows or redirects. Predict all six printed lines, then run it.",
    code: `// Session auth in miniature: cookie jar + session store + guard.

interface SessionData { userId: number; name: string }

type CookieJar = Record<string, string>;          // one user's browser
const sessionStore = new Map<string, SessionData>(); // server side

const users = [
  { id: 1, name: 'Jason', email: 'jason@example.com', password: 'correct-horse' },
];

let nextToken = 1;

// The "Server Action": verify credentials, set the cookie.
function login(jar: CookieJar, email: string, password: string): string {
  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) return 'login failed: Invalid credentials';

  const token = \`tok_\${nextToken++}\`;
  sessionStore.set(token, { userId: user.id, name: user.name });

  // (await cookies()).set('session', token, { httpOnly: true, ... })
  jar['session'] = token;
  return \`login ok: session cookie set (\${token})\`;
}

// The Data Access Layer: lib/session.ts
function verifySession(jar: CookieJar): SessionData | null {
  const token = jar['session'];
  if (!token) return null;
  return sessionStore.get(token) ?? null;   // null if invalid/expired
}

// A protected Server Component: app/dashboard/page.tsx
function dashboardPage(jar: CookieJar): string {
  const session = verifySession(jar);
  if (!session) return 'redirect -> /login';
  return \`render: Welcome back, \${session.name}\`;
}

// Two visitors, two cookie jars:
const alice: CookieJar = {};
const mallory: CookieJar = {};

console.log('alice:  ', login(alice, 'jason@example.com', 'correct-horse'));
console.log('mallory:', login(mallory, 'jason@example.com', 'wrong-guess'));

console.log('alice   -> /dashboard:', dashboardPage(alice));
console.log('mallory -> /dashboard:', dashboardPage(mallory));

// Server-side logout: the cookie remains but the session is gone.
sessionStore.clear();
console.log('after server-side logout...');
console.log('alice   -> /dashboard:', dashboardPage(alice));`,
  },

  keyPoints: [
    "Login is a Server Action: verify the password, create a session token, then `(await cookies()).set('session', token, { httpOnly: true, secure: true, sameSite: 'lax', ... })` — the ceremony PHP's session_start() hid, now explicit.",
    "`cookies()` is an async request API — always `await` it (Next 16 removed synchronous access); cookies can only be SET in Server Actions and route handlers.",
    "Centralize reading into a Data Access Layer: `verifySession()` wrapped in React's `cache()` (one decryption per request) and guarded by `import 'server-only'`.",
    "Checking auth ONLY in a layout is unsafe: layouts don't re-render on soft navigation, so the check silently stops running between protected pages — a classic interview trap.",
    "Protect in layers: optimistic cookie-presence redirect in proxy.ts, authoritative `verifySession()` in pages, and again at the top of every Server Action and route handler.",
    "Name the ecosystem — Auth.js (NextAuth) for OAuth, hosted options like Clerk — but be able to explain the hand-rolled cookie/session mechanics they wrap.",
  ],

  interview: [
    {
      q: "Why is putting the auth check only in a protected layout considered a vulnerability?",
      a: "Because layouts deliberately don't re-render on soft navigation — when the user moves between pages under the same layout, Next's partial rendering re-renders the page segment and leaves the shared layout alone. So the layout's check runs when the section is first entered and then simply doesn't run again, no matter how many protected pages the user visits or whether the session was invalidated mid-visit. The fix is layered: keep an optimistic cookie check in proxy.ts for UX, but put the authoritative `verifySession()` in each page and — critically — at the top of every Server Action and route handler, since those are HTTP endpoints reachable without rendering anything. In PHP terms: the guard goes at the top of every script, not in the shared header template.",
    },
    {
      q: "Walk me through implementing session login with the App Router, coming from PHP sessions.",
      a: "The model is identical to `session_start()` plus `$_SESSION`, with the cookie handled explicitly. A login Server Action looks up the user, checks `verifyPassword` (my `password_verify`), then creates a session — either a signed/encrypted JWT holding the user id, or a random token keyed to a DB row, the equivalent of PHP's session file. I set it with `(await cookies()).set('session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: ... })` — httpOnly so client JS can't steal it, secure for HTTPS-only, sameSite for CSRF hygiene — then `redirect('/dashboard')` outside any try/catch. Reading is a cached `verifySession()` in a server-only Data Access Layer that decrypts the cookie and returns the session or null. Logout deletes the cookie and invalidates the server-side session.",
    },
    {
      q: "Would you hand-roll auth in production, or use a library?",
      a: "For anything beyond simple credentials I'd reach for the ecosystem: Auth.js — the successor to NextAuth — handles OAuth providers, token refresh, and the session plumbing, and hosted options like Clerk go further with prebuilt UI and user management. But I'd want to be able to build the credential/session version by hand, because that's what those libraries do underneath — an httpOnly session cookie set in a server context, verified by a cached server-only function, checked in layers from proxy down to the data access. Knowing the mechanics is also what lets me audit a library's defaults instead of trusting them blindly — the same reason a PHP developer should understand sessions even when the framework wraps them.",
    },
  ],

  quiz: [
    {
      question: "Where can a Server Component, a Server Action, and a route handler each interact with cookies?",
      options: [
        "All three can read and set cookies freely",
        "All three can read; only Server Actions and route handlers can set",
        "Only proxy.ts may touch cookies in Next 16",
        "Server Components set cookies; actions and handlers read them",
      ],
      answerIndex: 1,
      explain:
        "Reading via (await cookies()).get() works anywhere on the server, but setting requires a context that is producing a response — a Server Action or route handler. A Server Component render can't set cookies: by the time it streams, headers may already be sent (PHP developers know that error well).",
    },
    {
      question:
        "Why wrap verifySession() in React's cache()?",
      options: [
        "It persists the session between requests so the cookie is optional",
        "It deduplicates the call within one request — layout, page, and components share one cookie decryption",
        "cache() encrypts the session token",
        "It makes the function callable from Client Components",
      ],
      answerIndex: 1,
      explain:
        "cache() memoizes per request: however many Server Components call verifySession() during one render, the cookie is read and decrypted once. It's not cross-request storage — every new request verifies again, exactly as it should.",
    },
    {
      question:
        "A session cookie is set with httpOnly: true. What does that flag actually prevent?",
      options: [
        "The cookie being sent over plain HTTP",
        "Client-side JavaScript reading the cookie (blunting XSS token theft)",
        "The cookie being sent on cross-site requests",
        "The user deleting the cookie manually",
      ],
      answerIndex: 1,
      explain:
        "httpOnly hides the cookie from document.cookie, so injected scripts can't exfiltrate the session token. HTTPS-only transport is the secure flag; cross-site sending is governed by sameSite. Interviewers like hearing all three distinguished crisply.",
    },
  ],
};

export default lesson;
