import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "proxy",
  title: "proxy.ts: The Middleware Layer",
  part: "Mutations & APIs",
  estMinutes: 11,
  summary:
    "One proxy.ts at the project root intercepts every matched request before routing — Next 16's renamed middleware, your front-controller bootstrap check as a file convention.",

  concept: `
Every non-trivial PHP app grows a layer that runs *before* the page: an
\`auth.php\` include at the top of every protected script, a front controller
that redirects by locale, an \`.htaccess\` full of rewrite rules, or a PSR-15
middleware pipeline. The App Router centralizes all of that into a single
file: **\`proxy.ts\`** at the project root, which intercepts requests before
they reach the routing layer.

### The rename interviewers will quiz you on

Next 16 renamed \`middleware.ts\` to \`proxy.ts\` — the named export goes from
\`middleware\` to \`proxy\`, types \`NextMiddleware\`/\`MiddlewareConfig\` become
\`NextProxy\`/\`ProxyConfig\`, and the config flag \`skipMiddlewareUrlNormalize\`
becomes \`skipProxyUrlNormalize\`. Same concept, clearer name: it sits in front
of your routes like a reverse proxy. Every existing codebase, blog post, and
interviewer still says "middleware" — know both names, write \`proxy.ts\`.

One real behavioral difference: **proxy runs on the Node.js runtime**, and the
edge runtime is *not* supported in \`proxy\`. If you specifically need edge
execution, you keep the legacy \`middleware.ts\` file. For everyone else, Node
means you can use the full standard library — no edge API subset to memorize.

### Shape of the file

\`\`\`ts
// proxy.ts  (project root, next to app/)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const session = request.cookies.get('session');

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();   // continue to the route
}

export const config = {
  matcher: ['/dashboard/:path*', '/account/:path*'],
};
\`\`\`

Three possible outcomes, all \`NextResponse\`:

- **\`NextResponse.next()\`** — let the request continue (optionally with
  injected request/response headers).
- **\`NextResponse.redirect(url)\`** — send the browser elsewhere; the URL
  changes. Your \`header('Location: ...')\`.
- **\`NextResponse.rewrite(url)\`** — serve a different route *internally*; the
  URL in the address bar stays. Your \`mod_rewrite\`, in TypeScript.

### The matcher scopes it

Without \`config.matcher\`, proxy runs on **every** request — pages, API
routes, images, favicons. The matcher restricts it with path patterns:
\`'/dashboard/:path*'\` matches \`/dashboard\` and everything beneath it. A
common production matcher inverts the logic with a regex to exclude static
assets (\`'/((?!_next/static|_next/image|favicon.ico).*)'\`). Keep proxy code
fast — it sits on the critical path of every matched request.

### What proxy is for — and what it is not

Good fits: locale detection and redirect, coarse **optimistic** auth gating
("no session cookie? straight to /login"), header injection (CSP, request
IDs), A/B rewrites. What it is **not**: your authorization system. Proxy sees
the cookie but shouldn't do database lookups on every request, and code
elsewhere (Server Actions, route handlers) is reachable without a page
navigation. The authoritative session check belongs next to the data — in the
action or the data-access layer. Proxy is the bouncer glancing at your
wristband; the bartender still checks ID.
`,

  comparisons: [
    {
      label: "One gate instead of an include at the top of every page",
      intro:
        "Protect an entire admin area. PHP repeats a require/session check in every script (forget one and it's public); proxy.ts declares the protected subtree once in a matcher.",
      php: `<?php // admin/users.php - and this block repeats
// in admin/orders.php, admin/stats.php, admin/...
session_start();

if (empty($_SESSION['user_id'])) {
    header('Location: /login.php?from=' .
        urlencode($_SERVER['REQUEST_URI']));
    exit;
}

// ...page logic follows.
// Forget the block in ONE file and that page is public.`,
      ts: `// proxy.ts  (project root)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const session = request.cookies.get('session');

  if (!session) {
    const login = new URL('/login', request.url);
    login.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/admin/:path*',   // /admin and everything below it
};`,
      note:
        "One file covers the whole subtree — new admin pages are protected by existing in /admin, not by remembering an include. But this is optimistic gating on a cookie's presence; the authoritative check still lives next to the data.",
      rightLang: "ts",
    },
    {
      label: ".htaccess rules become NextResponse calls",
      intro:
        "Redirect a retired URL permanently and rewrite a vanity path to its real handler. Apache does it in rewrite-rule syntax; proxy does it in TypeScript you can debug.",
      php: `# .htaccess
RewriteEngine On

# Permanent redirect: old blog URLs to the new prefix
RewriteRule ^blog/(.*)$ /posts/$1 [R=301,L]

# Internal rewrite: vanity URL, address bar unchanged
RewriteRule ^promo$ /campaigns/summer-2026 [L]`,
      ts: `// proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/blog/')) {
    const dest = new URL(
      pathname.replace('/blog/', '/posts/'), request.url);
    return NextResponse.redirect(dest, 308); // permanent
  }

  if (pathname === '/promo') {
    // Serve another route; the URL bar still shows /promo
    return NextResponse.rewrite(
      new URL('/campaigns/summer-2026', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/blog/:path*', '/promo'] };`,
      note:
        "redirect() changes the browser URL (use 308/301 for permanent); rewrite() serves different content under the original URL — exactly the R flag vs a plain RewriteRule. Unlike .htaccess, it's ordinary TypeScript: testable, typed, and one syntax.",
      leftLang: "bash",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Matcher mechanics in miniature: patterns like '/dashboard/:path*' decide which requests the proxy even sees, then the proxy function decides next/redirect. Predict which of the five requests are intercepted, then run it.",
    code: `// How config.matcher scopes proxy.ts, in miniature.

// '/dashboard/:path*' matches /dashboard AND everything beneath it.
function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith('/:path*')) {
    const prefix = pattern.slice(0, -'/:path*'.length);
    return path === prefix || path.startsWith(prefix + '/');
  }
  return pattern === path;   // exact match otherwise
}

// export const config = { matcher: [...] }
const matcher = ['/dashboard/:path*', '/admin/:path*', '/promo'];

interface MiniRequest {
  path: string;
  cookies: Record<string, string>;
}

// export function proxy(request) { ... }
function proxy(request: MiniRequest): string {
  if (request.path === '/promo') {
    return 'rewrite -> /campaigns/summer-2026 (URL bar unchanged)';
  }
  if (!request.cookies['session']) {
    return \`redirect -> /login?from=\${request.path}\`;
  }
  return 'next() - continue to the route';
}

const requests: MiniRequest[] = [
  { path: '/dashboard/settings', cookies: {} },
  { path: '/dashboard/settings', cookies: { session: 'tok_9f2' } },
  { path: '/admin', cookies: {} },
  { path: '/promo', cookies: {} },
  { path: '/pricing', cookies: {} },
];

for (const req of requests) {
  const hit = matcher.some((pattern) => matches(pattern, req.path));
  const who = req.cookies['session'] ? 'with session' : 'no session';

  if (!hit) {
    console.log(\`\${req.path} (\${who}): matcher miss - proxy never runs\`);
  } else {
    console.log(\`\${req.path} (\${who}): intercepted -> \${proxy(req)}\`);
  }
}`,
  },

  keyPoints: [
    "`proxy.ts` at the project root intercepts matched requests before routing — Next 16's rename of `middleware.ts` (export `proxy`, types `NextProxy`/`ProxyConfig`); interviewers will still say 'middleware'.",
    "proxy runs on the Node.js runtime; the edge runtime is NOT supported in proxy — keep the legacy `middleware.ts` only if you specifically need edge.",
    "Three outcomes, all `NextResponse`: `next()` to continue, `redirect(url)` to change the browser URL, `rewrite(url)` to serve other content under the same URL.",
    "`config.matcher` scopes which paths trigger it — `'/dashboard/:path*'` covers the whole subtree; without a matcher, proxy runs on every request including assets.",
    "Good uses: locale redirects, coarse optimistic auth gating on cookie presence, header injection, A/B rewrites — all your front-controller/.htaccess jobs in one typed file.",
    "Proxy alone is NOT authorization: it's an optimistic first gate; the authoritative session check belongs next to the data, in actions and the data-access layer.",
  ],

  interview: [
    {
      q: "What happened to middleware in Next.js 16?",
      a: "It was renamed, not removed: `middleware.ts` becomes `proxy.ts`, the named export `middleware` becomes `proxy`, and the related types and flags follow — `NextMiddleware` to `NextProxy`, `MiddlewareConfig` to `ProxyConfig`, `skipMiddlewareUrlNormalize` to `skipProxyUrlNormalize`. The new name reflects what it actually is: a layer sitting in front of your routes like a reverse proxy. The one substantive change is the runtime — proxy runs on Node.js, and the edge runtime is not supported in it, so teams that specifically need edge execution keep the legacy middleware.ts file. Conceptually it's unchanged: one function intercepting matched requests and returning next(), redirect(), or rewrite().",
    },
    {
      q: "Is checking authentication in proxy.ts sufficient to secure an app?",
      a: "No — and this is a favorite interview trap. Proxy is an *optimistic* check: it can see whether a session cookie exists and redirect early, which is great UX and cuts obvious unauthenticated traffic. But it shouldn't hit the database on every request for performance reasons, so it typically can't verify the session is still valid or check fine-grained permissions. And Server Actions and route handlers are HTTP endpoints reachable without a page navigation. So the model is defense in depth: proxy for the coarse redirect, then an authoritative `verifySession()` in every action and data-access function — the same discipline as PHP, where the front controller redirects but each handler still guards its own data.",
    },
    {
      q: "Explain the difference between NextResponse.redirect and NextResponse.rewrite.",
      a: "`redirect` sends an HTTP redirect response — the browser makes a new request and the address bar changes; with a 308 or 301 status it's the permanent redirect you'd write in .htaccess as `[R=301]`. `rewrite` is internal: Next serves the content of a different route while the browser URL stays what the user typed — Apache's plain RewriteRule, or a front controller dispatching one URL to another handler. Redirects are for moved resources and auth bounces where the user should see the new URL; rewrites are for vanity URLs, A/B tests, and multi-tenant routing where the public URL is part of the product.",
    },
  ],

  quiz: [
    {
      question:
        "In Next.js 16, which file and export name define the request-interception layer?",
      options: [
        "middleware.ts exporting default function middleware",
        "proxy.ts exporting a function named proxy",
        "intercept.ts exporting handle",
        "app/proxy/route.ts exporting ALL",
      ],
      answerIndex: 1,
      explain:
        "Next 16 renamed middleware.ts to proxy.ts with a named export proxy (plus NextProxy/ProxyConfig types). The middleware name is deprecated legacy — still worth recognizing, since most existing codebases and interviewers use it.",
    },
    {
      question:
        "config.matcher is set to '/dashboard/:path*'. For which request does the proxy function NOT run at all?",
      options: [
        "/dashboard",
        "/dashboard/settings/billing",
        "/pricing",
        "/dashboard/reports",
      ],
      answerIndex: 2,
      explain:
        "The matcher scopes proxy to /dashboard and every path beneath it. /pricing doesn't match, so the proxy function is never invoked for it — matcher misses skip the layer entirely rather than reaching a 'next()' branch.",
    },
    {
      question:
        "You want /promo to display a seasonal campaign page while the address bar keeps showing /promo. Which do you return?",
      options: [
        "NextResponse.redirect(new URL('/campaigns/summer-2026', request.url))",
        "NextResponse.rewrite(new URL('/campaigns/summer-2026', request.url))",
        "NextResponse.next() with a Location header",
        "Response.json({ rewrite: '/campaigns/summer-2026' })",
      ],
      answerIndex: 1,
      explain:
        "rewrite serves another route's content internally without changing the browser URL — Apache's plain RewriteRule. redirect would change the address bar, which is exactly what a vanity URL doesn't want.",
    },
  ],
};

export default lesson;
