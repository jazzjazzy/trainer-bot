import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "locals-and-auth",
  title: "Typed locals: Auth & Guards",
  part: "Server & Forms",
  estMinutes: 13,
  summary:
    "The canonical SvelteKit auth pattern: declare App.Locals, populate event.locals.user once in handle, and every load, action, and endpoint gets a typed user — plus redirect guards.",

  concept: `
Authentication is where everything from the last few sections clicks together:
\`app.d.ts\`, the \`handle\` hook, server \`load\`, and \`redirect\`. The pattern
is the same as a PHP auth middleware that resolves the session user and hangs
it on the request — except here the compiler knows about it.

### Step 1 — declare the shape in app.d.ts

\`\`\`ts
// src/app.d.ts
interface User { id: number; name: string; role: 'admin' | 'member'; }

declare global {
  namespace App {
    interface Locals {
      user: User | null;
    }
  }
}
export {};
\`\`\`

\`user: User | null\` — not \`user?: User\`. The union forces every consumer to
handle the logged-out case, and \`null\` says "we checked, nobody's here"
rather than "someone forgot to set this".

### Step 2 — populate it once, in handle

\`handle\` runs before everything, so it's the one place to turn a session
cookie into a user:

\`\`\`ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { getUserBySession } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const session = event.cookies.get('session'); // string | undefined
  event.locals.user = session ? await getUserBySession(session) : null;
  return resolve(event);
};
\`\`\`

\`cookies.get\` returns \`string | undefined\`; when you *set* the cookie (in a
login action), SvelteKit 2 requires the \`path\` option:
\`cookies.set('session', token, { path: '/', httpOnly: true, secure: true, maxAge: 60 * 60 * 24 * 30 })\`
— the options object is fully typed, so \`sameSite: 'laxx'\` won't compile.

### Step 3 — consume it, typed, everywhere

Every server \`load\`, form action, and \`+server.ts\` endpoint now sees
\`event.locals.user\` as \`User | null\`. No casts, no \`request->attributes->get('user')\`
returning \`mixed\` — autocomplete on \`.role\`, and the compiler nags you to
null-check first.

### Step 4 — guards

A guard is just "check locals, redirect if absent". Two good places:

- **\`+layout.server.ts\`** for a protected section like \`/app\`:

\`\`\`ts
// src/routes/app/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/login?from=' + url.pathname);
  return { user: locals.user }; // narrowed to User after the check
};
\`\`\`

- **in \`handle\`** for blanket rules (e.g. everything under \`/admin\`) — it
  runs even for endpoints, which layout loads do not.

Remember: in SvelteKit 2, \`redirect()\` is called **without** \`throw\` — it
throws internally. And note the narrowing: after the \`if (!locals.user)\`
guard, \`locals.user\` is \`User\`, so the returned \`data.user\` is
non-nullable in the pages below.

### Why locals never reach the client

\`locals\` lives and dies on the server — it is **not** serialised into the
page. That's a feature: it can hold session tokens or a DB handle without
leaking. Anything the browser should know must be *explicitly* returned from a
server \`load\` as \`data\`. The type system mirrors the trust boundary:
\`App.Locals\` is server-side truth, \`PageData\` is what you chose to publish.
`,

  comparisons: [
    {
      label: "Declaring and populating locals",
      intro:
        "The session-cookie-to-user lookup that runs on every request. The untyped version invents properties on the fly; the typed one declares App.Locals once and gets checked assignment.",
      leftLang: "js",
      rightLang: "ts",
      php: `// src/hooks.server.js (untyped)
import { getUserBySession } from '$lib/server/auth';

export async function handle({ event, resolve }) {
  const session = event.cookies.get('session');

  // locals is a free-for-all: event.locals.usr,
  // event.locals.currentUser — every file guesses
  event.locals.user = session
    ? await getUserBySession(session)
    : null;

  return resolve(event);
}`,
      ts: `// src/app.d.ts
// declare global { namespace App {
//   interface Locals { user: User | null }
// } }

// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { getUserBySession } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const session = event.cookies.get('session'); // string | undefined

  // event.locals is App.Locals: assigning .usr won't compile,
  // and forgetting to handle the no-cookie case won't either
  event.locals.user = session
    ? await getUserBySession(session)
    : null;

  return resolve(event);
};`,
      note:
        "One interface in app.d.ts makes locals a contract instead of a junk drawer — every producer and consumer of event.locals.user agrees on User | null, checked by the compiler.",
    },
    {
      label: "A route-group guard",
      intro:
        "Protecting everything under /app: logged-out visitors get bounced to /login, logged-in ones get the user in their layout data. Same behaviour both sides; only one narrows.",
      leftLang: "js",
      rightLang: "ts",
      php: `// src/routes/app/+layout.server.js (untyped)
import { redirect } from '@sveltejs/kit';

export async function load({ locals, url }) {
  if (!locals.user) {
    redirect(303, '/login?from=' + url.pathname);
  }

  // locals.user is still 'any' — pages read
  // data.user.roel and find out in production
  return { user: locals.user };
}`,
      ts: `// src/routes/app/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    // SvelteKit 2: no 'throw' — redirect() throws internally
    redirect(303, '/login?from=' + url.pathname);
  }

  // narrowed: locals.user is User here, so data.user is
  // non-nullable in every +page.svelte under /app
  return { user: locals.user };
};`,
      note:
        "The null-check both guards the route and narrows the type — downstream pages receive data.user as User, not User | null, so no redundant checks in templates.",
    },
    {
      label: "Login action: typed cookie options",
      intro:
        "The login form action verifies credentials, creates a session, and sets the cookie. SvelteKit 2 requires a path when setting cookies — the typed version can't forget it.",
      leftLang: "js",
      rightLang: "ts",
      php: `// src/routes/login/+page.server.js (untyped)
import { fail, redirect } from '@sveltejs/kit';
import { verifyLogin, createSession } from '$lib/server/auth';

export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const user = await verifyLogin(
      data.get('email'), data.get('password')
    );
    if (!user) return fail(400, { message: 'Bad credentials' });

    // typo'd option names are silently ignored
    cookies.set('session', await createSession(user.id), {
      path: '/', httpOnly: true, sameSit: 'lax'
    });
    redirect(303, '/app');
  }
};`,
      ts: `// src/routes/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { verifyLogin, createSession } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = data.get('email');
    const password = data.get('password');
    if (typeof email !== 'string' || typeof password !== 'string') {
      return fail(400, { message: 'Missing fields' });
    }

    const user = await verifyLogin(email, password);
    if (!user) return fail(400, { message: 'Bad credentials' });

    cookies.set('session', await createSession(user.id), {
      path: '/',            // required in SvelteKit 2
      httpOnly: true,
      secure: true,
      sameSite: 'lax',      // 'laxx' would not compile
      maxAge: 60 * 60 * 24 * 30
    });
    redirect(303, '/app');
  }
};`,
      note:
        "cookies.set's options object is typed (and path is mandatory in Kit 2) — misspelled attributes like sameSit are compile errors instead of silently-insecure cookies.",
    },
  ],

  playground: {
    intro:
      "The whole auth pipeline as plain TS: cookie → session lookup → typed locals → guard. Predict which requests reach the page and which bounce to /login — and notice the narrowing after the guard.",
    lang: "typescript",
    code: `interface User { id: number; name: string; role: "admin" | "member" }
interface Locals { user: User | null }

// Pretend session store (the DB lookup handle would do)
const sessions: Record<string, User> = {
  "tok_ada": { id: 1, name: "Ada", role: "admin" },
  "tok_bob": { id: 2, name: "Bob", role: "member" },
};

// ── handle: turn the cookie into typed locals, once per request ──
function populateLocals(cookies: Map<string, string>): Locals {
  const session = cookies.get("session"); // string | undefined
  return { user: session ? sessions[session] ?? null : null };
}

// ── guard: check locals, redirect or narrow ──
function guard(locals: Locals, path: string): string {
  if (!locals.user) {
    return "303 -> /login?from=" + path; // redirect(303, ...) in real Kit
  }
  // locals.user is narrowed from User | null to User here:
  const u = locals.user;
  if (path.startsWith("/admin") && u.role !== "admin") {
    return "403 Forbidden for " + u.name;
  }
  return "200 " + path + " as " + u.name + " (" + u.role + ")";
}

function request(path: string, cookieHeader: [string, string][]): void {
  const locals = populateLocals(new Map(cookieHeader));
  console.log(path.padEnd(12), "=>", guard(locals, path));
}

request("/app", [["session", "tok_ada"]]);
request("/app", [["session", "tok_bob"]]);
request("/app", []);                          // no cookie
request("/app", [["session", "tok_expired"]]); // unknown session
request("/admin", [["session", "tok_bob"]]);   // wrong role
request("/admin", [["session", "tok_ada"]]);`,
  },

  keyPoints: [
    "Declare `App.Locals` as `{ user: User | null }` in `app.d.ts` — the explicit `null` forces every consumer to handle logged-out.",
    "Populate `event.locals.user` exactly once, in `handle`: read the session cookie (`cookies.get` → `string | undefined`), look up the user, assign.",
    "Every server `load`, form action, and endpoint then sees a fully typed `locals.user` — the typed equivalent of a PHP auth middleware hanging the user on the request.",
    "Guards are just `if (!locals.user) redirect(303, '/login')` — in `+layout.server.ts` for a section, or in `handle` for blanket rules (which also cover endpoints).",
    "`cookies.set` options are typed and `path` is required in SvelteKit 2; `redirect()` is called without `throw`.",
    "`locals` never reaches the browser — publish only what you choose by returning it from a server `load` as `data`.",
  ],

  interview: [
    {
      q: "Describe how you'd implement authentication in SvelteKit with full type safety.",
      a: "Three pieces. First, `app.d.ts`: declare `App.Locals` with `user: User | null`. Second, the `handle` hook in `hooks.server.ts`: read the session cookie with `event.cookies.get`, look the session up, and set `event.locals.user` — this runs before every page, action, and endpoint, like an auth middleware in Laravel resolving the request user. Third, guards: in a `+layout.server.ts` over the protected section, `if (!locals.user) redirect(303, '/login')`, then return the user as data. The payoff is that `locals.user` is typed `User | null` everywhere on the server — the null check is compiler-enforced, and after the guard it narrows to `User`, so downstream pages get non-nullable data.",
    },
    {
      q: "Why doesn't event.locals get sent to the browser, and why is that good?",
      a: "`locals` is per-request server state — SvelteKit never serialises it into the HTML or the client payload. That's deliberate: it's the safe place for things the browser must never see, like session tokens, service clients, or the raw user record with its password hash. The client only receives what a server `load` explicitly returns as `data`, so exposure is an intentional, reviewable act. The types reflect the boundary too: `App.Locals` describes server truth, `PageData` describes the published subset. In PHP terms, `locals` is a request attribute inside your middleware stack; `data` is what you pass to the view.",
    },
    {
      q: "Where would you put a route guard — handle or +layout.server.ts — and why?",
      a: "Both have a place. A `+layout.server.ts` guard is great for a protected UI section like `/app`: it can return the narrowed user as layout data, and the check lives next to the routes it protects. But layout loads only run for pages — a guard there does *not* protect `+server.ts` endpoints, and load functions can run in parallel, so siblings shouldn't rely on it having run. For blanket enforcement — everything under `/admin`, or API routes — I check `event.locals.user` in `handle` (or a dedicated handle in a `sequence`), because handle wraps literally every request. Typical setup: coarse enforcement in handle, per-section narrowing and data provision in the layout load.",
    },
  ],

  quiz: [
    {
      question: "Why declare App.Locals.user as `User | null` rather than `user?: User`?",
      options: [
        "Optional properties aren't allowed in app.d.ts",
        "null serialises to JSON and undefined doesn't",
        "Explicit null means 'checked, not logged in' and forces every consumer to handle that case",
        "It makes locals reach the client safely",
      ],
      answerIndex: 2,
      explain:
        "handle always assigns the property — either a User or a deliberate null. The non-optional union documents that the check happened and makes the compiler demand a null-check before .role, whereas an optional property blurs 'not set' with 'logged out'.",
    },
    {
      question: "A guard in src/routes/app/+layout.server.ts — what does it NOT protect?",
      options: [
        "+page.server.ts loads under /app",
        "+server.ts endpoints (e.g. /api/...) elsewhere in the app",
        "Pages nested two levels deep under /app",
        "Direct browser navigation to /app/settings",
      ],
      answerIndex: 1,
      explain:
        "Layout loads run for pages in their subtree, not for standalone endpoints. API routes need their own locals check, or a blanket rule in handle — which runs for every request of any kind.",
    },
    {
      question: "In SvelteKit 2, which line correctly bounces a logged-out user in a server load?",
      options: [
        "throw redirect(303, '/login');",
        "redirect(303, '/login');",
        "return redirect('/login', 303);",
        "return new Response(null, { status: 303 });",
      ],
      answerIndex: 1,
      explain:
        "Since SvelteKit 2, redirect() (like error()) is called without throw — it throws internally. The old `throw redirect(...)` still works but is no longer the documented style; argument order is (status, location).",
    },
  ],
};

export default lesson;
