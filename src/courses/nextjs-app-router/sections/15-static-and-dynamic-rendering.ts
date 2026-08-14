import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "static-and-dynamic-rendering",
  title: "Static vs Dynamic Rendering",
  part: "Data & Caching",
  estMinutes: 12,
  summary:
    "Next.js renders each route either statically at build time (a page served like Varnish-cached PHP) or dynamically per request (classic PHP) — and which one you get is decided by whether the route touches request-time APIs like await cookies(), headers(), or searchParams.",

  concept: `
Every App Router route is rendered in one of two modes, decided **per route**:

- **Static rendering** — the route is rendered **once at build time** (or in
  the background when revalidating), stored in the Full Route Cache, and
  served as-is. In PHP terms: a page sitting behind Varnish, or an artisanal
  \`file_put_contents('cache/page.html', ...)\` — no PHP executes when a user
  hits it.
- **Dynamic rendering** — the route is rendered **on every request**. That is
  simply how PHP always works: script runs, page comes out.

Next.js prefers static — it's cheaper and faster — and renders a route
statically **unless the route gives it a reason not to**.

### What makes a route dynamic

A route opts into dynamic rendering when it uses information that only exists
at request time:

\`\`\`tsx
// Each of these, used in a page/layout, makes the route dynamic:
const cookieStore = await cookies();     // whose request?
const headersList = await headers();     // which User-Agent?
const { q } = await searchParams;        // which query string?
await fetch(url, { cache: 'no-store' }); // explicitly per-request data
\`\`\`

The logic is honest: a build server can't know what cookies a future visitor
will send, so a page that reads them *cannot* be prerendered. \`connection()\`
and \`export const dynamic = 'force-dynamic'\` also opt in.

Note what's **not** on the list: a plain, un-optioned \`fetch\`. Uncached is
not the same as dynamic — in an otherwise static route, that fetch simply runs
**at build time** and its result is baked into the HTML until the next build
or revalidation. If you see stale API data on a static page, this is why.

### Everything request-scoped is async now

In Next.js 16, \`cookies()\`, \`headers()\`, and \`draftMode()\` must be awaited,
and \`params\`/\`searchParams\` arrive as **Promises** — synchronous access
existed as a deprecated bridge in 15 and was **removed entirely in 16**:

\`\`\`tsx
// app/search/page.tsx
export default async function Search({
  searchParams,
}: PageProps<'/search'>) {
  const { q } = await searchParams;         // Promise — await it
  const theme = (await cookies()).get('theme'); // await, then read
  return <Results query={q ?? ''} theme={theme?.value} />;
}
\`\`\`

Coming from \`$_GET['q']\` and \`$_COOKIE['theme']\` — superglobals sitting there
before your first line runs — the await feels ceremonial. It isn't: PHP starts
a fresh process per request, so request data can be ambient. A Next server
handles many requests in one process, and the awaitable APIs both tie each
value to the right request and *signal to the build* that the route needs one.

### Segment config: overriding the decision

Two exports at the top of a \`page.tsx\`/\`layout.tsx\`/\`route.ts\` take manual
control:

\`\`\`tsx
export const dynamic = 'force-dynamic'; // always render per request
// or:
export const dynamic = 'force-static';  // prerender anyway; cookies()/headers() return empty
// or, the middle ground:
export const revalidate = 60; // static, but re-render in the background
                              // at most every 60s (must be a literal)
\`\`\`

\`revalidate = 60\` is the workhorse: the route stays static-fast, but the
Full Route Cache entry is refreshed in the background at most once per
minute — the "regenerate the cache file when it's older than N" pattern you
built by hand in PHP, minus the hand.

### Reading the build output

\`next build\` prints a route table with a marker per route:

\`\`\`text
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
\`\`\`

This table is your caching audit. The route you *thought* was static showing
\`ƒ\` usually traces back to a stray \`cookies()\` call — often inside a shared
layout, which drags every route under it into dynamic rendering.
`,

  comparisons: [
    {
      label: "Request data: superglobals vs awaited APIs",
      intro:
        "Read a cookie and a request header while rendering. PHP's are ambient globals; Next.js makes you await them — and that await is also the static/dynamic signal.",
      php: `<?php // dashboard.php
// Superglobals exist before line 1 runs — one process
// per request means request data can just be ambient.
$theme = $_COOKIE['theme'] ?? 'light';
$agent = $_SERVER['HTTP_USER_AGENT'] ?? '';

echo '<body class="' . htmlspecialchars($theme) . '">';
echo 'You are on: ' . htmlspecialchars($agent);`,
      ts: `// app/dashboard/page.tsx
import { cookies, headers } from 'next/headers';

export default async function Dashboard() {
  // Async since 15, sync access REMOVED in 16:
  const theme =
    (await cookies()).get('theme')?.value ?? 'light';
  const agent =
    (await headers()).get('user-agent') ?? '';

  // Using either one makes this route DYNAMIC —
  // it now renders per request, like the PHP page.
  return <body className={theme}>You are on: {agent}</body>;
}`,
      note: "The await isn't ceremony: one Node process serves many requests, so request data can't be ambient — and calling these APIs is exactly what tells the build 'this route can't be prerendered'.",
    },
    {
      label: "Timed regeneration: DIY file cache vs revalidate",
      intro:
        "A pricing page whose data changes rarely: serve it pre-rendered, but refresh at most once a minute. PHP hand-rolls the cache file; Next.js declares one segment export.",
      php: `<?php // prices.php — the classic DIY page cache
$cacheFile = __DIR__ . '/cache/prices.html';

if (is_file($cacheFile)
    && time() - filemtime($cacheFile) < 60) {
    readfile($cacheFile);   // serve the cached copy
    exit;
}

ob_start();
render_prices($pdo);        // expensive render
$html = ob_get_clean();
file_put_contents($cacheFile, $html);
echo $html;`,
      ts: `// app/prices/page.tsx
import { getPrices } from '@/lib/prices';

// Static route, re-rendered in the background at most
// every 60s. Stale-while-revalidate: visitors during a
// refresh still get the previous copy instantly.
export const revalidate = 60;

export default async function Prices() {
  const prices = await getPrices();
  return <PriceTable prices={prices} />;
}`,
      note: "Same intent, but Next's version regenerates in the background (no visitor pays for the expensive render) and needs no cache-file plumbing, locking, or cleanup. The value must be a literal — the build reads it statically.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Five routes, each described by what its page.tsx touches. Predict the build-table marker for every route — ○ static or ƒ dynamic — and why, then reveal the transcript. The blog route is the one most people get wrong.",
    code: `# What each route's page.tsx does:
#
#  app/page.tsx            plain JSX, no data at all
#  app/about/page.tsx      await fetch(CMS_URL)            # no options!
#  app/blog/[slug]/page.tsx  generateStaticParams() returns
#                            3 slugs + a revalidate of 3600
#  app/dashboard/page.tsx  const theme = (await cookies()).get('theme')
#  app/search/page.tsx     const { q } = await searchParams

npx next build`,
    output: `   ▲ Next.js 16.2.3 (Turbopack)

   Creating an optimized production build ...
 ✓ Compiled successfully
 ✓ Generating static pages (8/8)

Route (app)                         Revalidate  Expire
┌ ○ /
├ ○ /_not-found
├ ○ /about
├ ● /blog/[slug]                            1h      1y
├   ├ /blog/hello-world
├   ├ /blog/second-post
├   └ /blog/third-post
├ ƒ /dashboard
└ ƒ /search

○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses generateStaticParams)
ƒ  (Dynamic)  server-rendered on demand

Why each marker:
  /            ○  nothing request-scoped — prerendered at build
  /about       ○  the un-optioned fetch is UNCACHED but not dynamic:
                  it ran once AT BUILD TIME and its result is baked in
  /blog/[slug] ●  three pages prerendered from generateStaticParams,
                  refreshed in the background at most every hour
  /dashboard   ƒ  await cookies() needs a real request — dynamic
  /search      ƒ  await searchParams needs a real URL — dynamic`,
  },

  keyPoints: [
    "Static rendering: the route is rendered at build time into the Full Route Cache and served like a Varnish-cached PHP page. Dynamic rendering: per request — plain old PHP behavior. Next prefers static unless the route forces its hand.",
    "Request-time APIs opt a route into dynamic rendering: `await cookies()`, `await headers()`, reading `searchParams`, `connection()`, or `fetch(..., { cache: 'no-store' })`.",
    "All of these are async in 16 — `params`/`searchParams` are Promises and `cookies()`/`headers()`/`draftMode()` must be awaited; synchronous access was removed entirely.",
    "A plain un-optioned `fetch` does NOT make a route dynamic — on a static route it runs at build time and its result is frozen into the HTML until the next build/revalidation.",
    "Segment config overrides: `export const dynamic = 'force-dynamic' | 'force-static'`, and `export const revalidate = 60` for static pages regenerated in the background (the DIY PHP file-cache pattern, built in). The value must be a literal.",
    "Read the `next build` table: `○` static, `●` SSG via generateStaticParams, `ƒ` dynamic. An unexpected `ƒ` usually means a stray `cookies()`/`headers()` call — check shared layouts first.",
  ],

  interview: [
    {
      q: "How does Next.js decide whether a route is rendered statically or dynamically?",
      a: "Per route, at build time, and the default is static: if Next can render the route without request-specific information, it prerenders it into the Full Route Cache and serves the result like a static file. The route becomes dynamic the moment it uses a request-time API — `await cookies()`, `await headers()`, reading `searchParams`, `connection()`, or an explicit `cache: 'no-store'` fetch — because none of those values exist on a build server. You can override the heuristic with segment config: `export const dynamic = 'force-dynamic'` or `'force-static'`. My mental model from PHP: dynamic rendering is normal PHP, static rendering is the page pre-baked behind Varnish, and Next picks per route based on what the code actually touches.",
    },
    {
      q: "Why are cookies(), headers(), params and searchParams asynchronous in Next.js 16?",
      a: "Two reasons, one practical and one architectural. Practically, one Node process serves many concurrent requests — unlike PHP's process-per-request model where `$_COOKIE` can be an ambient global — so request data has to be explicitly bound to the request being rendered, and the Promise is that binding. Architecturally, awaiting them marks the precise point where rendering starts to depend on the request, which lets Next prerender everything before that point and stream the rest. Concretely for 16: `params` and `searchParams` are Promises you must `await`, same for `cookies()`, `headers()`, and `draftMode()`. Next 15 still allowed deprecated synchronous access as a migration bridge; 16 removed it entirely, so old sync code doesn't just warn — it breaks.",
    },
    {
      q: "A page does await fetch(url) with no options and got built statically. Users report the data never updates. What's happening and what are your options?",
      a: "That's the uncached-but-static trap. An un-optioned fetch isn't cached in the Data Cache, but it also doesn't make the route dynamic — so on a static route it executed once at build time and its response is frozen into the prerendered HTML. 'Uncached' and 'dynamic' are separate axes. Three fixes depending on intent: `export const revalidate = 300` (or `next: { revalidate }` on the fetch) keeps the page static but regenerates it in the background — usually the right call; `cache: 'no-store'` or `export const dynamic = 'force-dynamic'` makes it truly per-request if the data must always be live; or trigger on-demand regeneration with `revalidatePath()`/`revalidateTag()` when the source data changes. I'd confirm the diagnosis first by checking the route's marker in the `next build` table.",
    },
  ],

  quiz: [
    {
      question: "Which of these does NOT opt a route into dynamic rendering?",
      options: [
        "const theme = (await cookies()).get('theme')",
        "const { q } = await searchParams",
        "await fetch(url) with no options",
        "await fetch(url, { cache: 'no-store' })",
      ],
      answerIndex: 2,
      explain:
        "Uncached is not dynamic: a plain fetch on an otherwise static route simply runs at build time and its result is baked into the prerendered HTML. cookies(), searchParams, and an explicit no-store all require a real request, so they force per-request rendering.",
    },
    {
      question: "What does `export const revalidate = 60` on a page do?",
      options: [
        "Renders the page dynamically but caches the response in the browser for 60s",
        "Keeps the page static and regenerates it in the background at most every 60 seconds",
        "Re-runs proxy.ts every 60 seconds",
        "Sets a 60-second timeout for the page's fetches",
      ],
      answerIndex: 1,
      explain:
        "revalidate is stale-while-revalidate for the Full Route Cache: visitors always get the fast prerendered copy, and once it's older than 60s the next request triggers a background re-render. It's the hand-rolled PHP file-cache pattern as one declarative export — and the value must be a statically analyzable literal.",
    },
    {
      question: "In Next.js 16, how do you read a query-string value in a page component?",
      options: [
        "const q = searchParams.q — searchParams is a plain object prop",
        "const q = useSearchParams().get('q') in the Server Component",
        "const { q } = await searchParams — it's a Promise in 16",
        "const q = $_GET['q']",
      ],
      answerIndex: 2,
      explain:
        "params and searchParams are Promises in Next 16 — you must await them (typed helpers like PageProps<'/search'> know this). Synchronous access was a deprecated bridge in 15 and was removed in 16. useSearchParams is a client-component hook, not for Server Components.",
    },
    {
      question: "In the next build route table, what do ○ and ƒ mean?",
      options: [
        "○ = client component route, ƒ = server component route",
        "○ = prerendered as static content, ƒ = server-rendered on demand",
        "○ = cached fetch inside, ƒ = uncached fetch inside",
        "○ = passed type checks, ƒ = failed and fell back",
      ],
      answerIndex: 1,
      explain:
        "The build table is the static/dynamic audit: ○ marks routes prerendered at build time (● when a dynamic segment was prerendered via generateStaticParams), and ƒ marks routes rendered per request. An unexpected ƒ is your cue to hunt for a stray request-time API call, often in a shared layout.",
    },
  ],
};

export default lesson;
