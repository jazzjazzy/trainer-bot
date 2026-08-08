import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-and-interview",
  title: "Cheatsheet & Interview Prep",
  part: "Production & Interview Prep",
  estMinutes: 14,
  summary:
    "The whole course on one page — file conventions, the server/client boundary, the caching table, async request APIs, and the interview answers that tie them together.",

  concept: `
Thirty sections compress into four tables and two rules. If you can reproduce
these from memory and explain *why* each cell is what it is, you can build —
and interview about — a Next.js 16 App Router app.

### File conventions — the filesystem IS the API

| File | Role | PHP instinct |
| --- | --- | --- |
| \`page.tsx\` | the routable UI; the folder path is the URL | the \`.php\` file in the docroot |
| \`layout.tsx\` | shell around children; **persists** across navigations | \`header.php\`/\`footer.php\` includes |
| \`loading.tsx\` | instant Suspense fallback while the page's data loads | none — PHP blocks until the page is done |
| \`error.tsx\` | error boundary for the segment (must be \`'use client'\`) | the try/catch in your front controller |
| \`not-found.tsx\` | rendered by \`notFound()\` / unmatched routes | your 404 page |
| \`route.ts\` | HTTP-method exports (\`GET\`, \`POST\`, …) | \`api/orders.php\` echoing JSON |
| \`proxy.ts\` | runs before routing; export \`proxy\` (was \`middleware.ts\`) | front-controller middleware |

Dynamic segments come from folder names: \`[slug]\`, \`[...parts]\`,
\`(group)\` for URL-invisible grouping.

### The boundary — two rules

1. **Everything is a Server Component until a file says \`'use client'\`** —
   and that directive marks an *entry point*: every module it imports becomes
   client code too. Need state, effects, event handlers, browser APIs?
   Client. Need the DB, secrets, the filesystem? Server (and guard it with
   \`import 'server-only'\`).
2. **Props crossing server → client are serialized** — plain data only (plus
   Server Actions). Pass DTOs, never rows; whatever you pass ships to the
   browser whether the JSX renders it or not.

### Caching in 15/16 — nothing until you ask

| Surface | Default | Opt in |
| --- | --- | --- |
| \`fetch()\` on the server | **not cached** (since 15) | \`cache: 'force-cache'\`, \`next: { revalidate: 60, tags: ['posts'] }\` |
| \`GET\` route handler | **not cached** | route config (e.g. \`export const revalidate\`) |
| whole segment's fetches | per-request | \`export const fetchCache = 'default-cache'\` |
| your own functions/components | run every request | \`'use cache'\` + \`cacheLife()\` / \`cacheTag()\` (needs \`cacheComponents: true\`) |
| invalidation | — | \`revalidatePath()\` / \`revalidateTag()\` |

If an interviewer says "fetch is cached by default", that was Next 13/14 —
knowing the 15 change is a currency signal.

### Async request APIs — no sync access in 16

\`\`\`tsx
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;      // params is a Promise
  const query = await props.searchParams;   // so is searchParams
  const jar = await cookies();              // headers(), draftMode() too
}
\`\`\`

\`PageProps<'/blog/[slug]'>\` is globally available in 16 and types
\`params\` from the route string.

### Server Action or route handler?

**Server Action** when *your own app* mutates *its own data* — forms,
buttons: progressive enhancement, one typed function, \`revalidatePath\` when
done. **Route handler** for everything else: external consumers, webhooks,
GETs, file downloads, non-React clients. Either way it's a **public
endpoint** — authenticate and validate inside, every time, like any PHP
script that reads \`$_POST\`.
`,

  comparisons: [
    {
      label: "The whole course in one route",
      intro:
        "A blog post page that renders data and accepts a comment. The PHP file does everything inline; the Next version spreads the same responsibilities across the conventions this course covered.",
      php: `<?php // blog-post.php?slug=hello — one file, every job
require 'auth_check.php';     // hope every page remembers this
require 'header.php';         // layout, manually included

$stmt = $pdo->prepare('SELECT * FROM posts WHERE slug = ?');
$stmt->execute([$_GET['slug']]);
$post = $stmt->fetch() ?: exit(require '404.php');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $pdo->prepare('INSERT INTO comments (post_id, body)
                   VALUES (?, ?)')
        ->execute([$post['id'], $_POST['body']]);
    header("Location: /blog-post.php?slug={$_GET['slug']}");
    exit;
}
?>
<h1><?= htmlspecialchars($post['title']) ?></h1>
<form method="post"><textarea name="body"></textarea></form>
<?php require 'footer.php';`,
      ts: `// app/blog/[slug]/page.tsx — layout.tsx wraps it,
// loading.tsx covers the wait, error.tsx catches crashes.
import { notFound } from 'next/navigation';
import { getPost } from '@/lib/dal';        // re-checks session
import { addComment } from './actions';     // Server Action

export default async function PostPage(
  props: PageProps<'/blog/[slug]'>
) {
  const { slug } = await props.params;      // async in 16
  const post = await getPost(slug);
  if (!post) notFound();                    // -> not-found.tsx

  return (
    <article>
      <h1>{post.title}</h1>  {/* auto-escaped */}
      <form action={addComment}>
        <input type="hidden" name="postId" value={post.id} />
        <textarea name="body" />
      </form>
    </article>
  );
}`,
      note: "Same jobs, relocated: the include becomes layout.tsx, the 404 exit becomes notFound(), htmlspecialchars becomes JSX's default, and the POST branch becomes a Server Action that re-validates on its own.",
    },
    {
      label: "Routing: a rules file vs the filesystem",
      intro:
        "Where URLs come from. Classic PHP maps pretty URLs onto scripts with rewrite rules; the App Router derives them from the directory tree — there is no routes file to drift out of date.",
      php: `# .htaccess — routing as configuration
RewriteEngine On
RewriteRule ^blog/([a-z0-9-]+)$ post.php?slug=$1 [L]
RewriteRule ^shop/cart$        cart.php          [L]
RewriteRule ^api/orders$       api/orders.php    [L]
# 404s, param parsing, middleware ordering:
# all your front controller's problem.`,
      ts: `# app/ — routing as file structure
app/
├── layout.tsx          # wraps every route below
├── page.tsx            # /
├── blog/
│   └── [slug]/
│       ├── page.tsx    # /blog/:slug  (await params)
│       ├── loading.tsx # streams while data loads
│       └── error.tsx   # boundary for this segment
├── shop/cart/page.tsx  # /shop/cart
└── api/orders/route.ts # GET/POST /api/orders
proxy.ts                # runs before all of it`,
      note: "The left file can silently disagree with what's on disk; on the right the URL, its params type, and its error/loading UI are all derived from one directory — file location is the API.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Caching: both stacks are opt-in now",
      intro:
        "Serve an expensive product list without recomputing it per request. PHP caches only where you write cache code — and since Next 15, Next is the same: per-request by default, cached where you say so.",
      php: `<?php // products.php — hand-rolled opt-in cache
$cacheFile = __DIR__ . '/cache/products.json';

if (is_file($cacheFile)
    && time() - filemtime($cacheFile) < 3600) {
    $products = json_decode(
        file_get_contents($cacheFile), true);
} else {
    $products = $pdo->query('SELECT * FROM products')
                    ->fetchAll();
    file_put_contents($cacheFile, json_encode($products));
}
// Invalidation: unlink() the file after a write.`,
      ts: `// lib/products.ts — declarative opt-in cache
import { cacheLife, cacheTag } from 'next/cache';
import { db } from './db';

export async function getProducts() {
  'use cache';            // needs cacheComponents: true
  cacheLife('hours');     // your filemtime() < 3600
  cacheTag('products');   // a name to invalidate by
  return db.product.findMany();
}

// After a mutation, in a Server Action:
//   revalidateTag('products', 'max');   // your unlink() (2nd arg required in 16)
// fetch() has its own per-request opt-in:
//   fetch(url, { next: { revalidate: 3600, tags: ['products'] } })`,
      note: "Next 13/14 cached fetch by default; 15/16 moved to your PHP default — nothing cached until asked. 'use cache' + cacheTag is the file-cache-plus-unlink pattern with the bookkeeping done for you.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The course as flashcards: read each scenario, name the file or convention that handles it BEFORE the answer prints, then run to self-mark. These map one-to-one to interview questions.",
    code: `// Which file or convention handles it? Cover the answers, quiz yourself.

interface Flashcard {
  scenario: string;
  answer: string;
}

const cards: Flashcard[] = [
  {
    scenario: 'Render the page for /blog/how-to-brew',
    answer: 'app/blog/[slug]/page.tsx — await props.params for { slug }',
  },
  {
    scenario: 'Site-wide nav + footer that survive navigation',
    answer: 'app/layout.tsx — wraps children, does not re-render per page',
  },
  {
    scenario: 'Show a skeleton instantly while the page fetches',
    answer: 'loading.tsx — automatic Suspense fallback for the segment',
  },
  {
    scenario: 'One section crashed; keep the rest of the app alive',
    answer: "error.tsx — a 'use client' error boundary for that segment",
  },
  {
    scenario: 'Receive a Stripe webhook (POST, external caller)',
    answer: 'app/api/stripe/route.ts — export async function POST()',
  },
  {
    scenario: 'Handle your own <form> submit that adds a comment',
    answer: "a Server Action — 'use server' fn, validate + auth inside",
  },
  {
    scenario: 'Redirect logged-out users off /admin before rendering',
    answer: 'proxy.ts (UX only!) + verifySession() in the DAL (security)',
  },
  {
    scenario: 'A button needs onClick and useState',
    answer: "'use client' at the top of that component file",
  },
  {
    scenario: 'Cache a slow DB query for an hour, bust it on writes',
    answer: "'use cache' + cacheLife('hours') + cacheTag / revalidateTag",
  },
  {
    scenario: 'An uncached fetch() ran on every request. Why?',
    answer: 'Not a bug: since Next 15 fetch is uncached by default — opt in',
  },
];

cards.forEach((card, i) => {
  console.log(\`Q\${i + 1}: \${card.scenario}\`);
  console.log(\`    -> \${card.answer}\`);
});

console.log('');
console.log(\`\${cards.length}/\${cards.length} conventions drilled — now say each answer out loud.\`);`,
  },

  keyPoints: [
    "File conventions: `page.tsx` (URL from folder), `layout.tsx` (persistent shell), `loading.tsx` (Suspense fallback), `error.tsx` (client-side boundary), `not-found.tsx`, `route.ts` (HTTP methods), `proxy.ts` (pre-routing, was middleware.ts).",
    "Boundary rules: server by default, `'use client'` marks an entry point whose whole import graph goes to the browser; props crossing over are serialized wholesale — pass DTOs, guard secret modules with `server-only`.",
    "Caching in 15/16 is opt-in everywhere: `fetch` and GET handlers are uncached by default; opt in per request (`cache`, `next.revalidate`, `tags`) or per function with `'use cache'` + `cacheLife()`/`cacheTag()` (requires `cacheComponents: true`); invalidate with `revalidatePath`/`revalidateTag`.",
    "Request APIs are async in 16 — `await props.params`, `await props.searchParams`, `await cookies()/headers()/draftMode()` — and `PageProps<'/blog/[slug]'>` types pages from the route string.",
    "Server Action for your app's own form/button mutations; route handler for external consumers, webhooks, and GETs — both are public endpoints, so auth and validation live inside each.",
    "Your PHP career is the asset: per-request server rendering, form POSTs, escaping output, and auth-next-to-the-query are the App Router's core ideas with a compiler attached.",
  ],

  interview: [
    {
      q: "What's the difference between Server Components and server-side rendering?",
      a: "SSR is about the *first paint*: render the React tree to HTML on the server, send it, then ship the same components' JavaScript so the browser can hydrate — every component's code goes over the wire twice, as HTML and as JS. Server Components are about *where code lives*: an RSC executes only on the server, its JavaScript is never in the bundle, and what crosses the wire is its rendered output in the RSC payload. The two compose — client components inside a server tree are still SSR'd to HTML and then hydrate. My PHP framing: SSR is 'PHP render plus re-run everything in the browser'; Server Components are actual PHP-style rendering — the code stays on the server with the database — with client-side islands only where I opt in.",
    },
    {
      q: "When do you actually need 'use client'?",
      a: "When the component needs things that only exist in a browser session: state and effects (`useState`, `useEffect`), event handlers like `onClick`, browser APIs, or hook-based libraries. The directive goes at the top of the file and marks a *boundary*, not a single component — everything that file imports is pulled into the client bundle too. So the discipline is to push it to the leaves: the page and data-fetching stay server-side, and the interactive button or search box is a small client component receiving plain-data props. Two corollaries: props crossing that boundary must be serializable, and a server component can be passed *through* a client component as `children`, which is how you avoid converting whole subtrees.",
    },
    {
      q: "How does caching work in Next.js 15 and 16?",
      a: "The headline is that it became opt-in. In 13/14, `fetch` was cached by default and that surprised everyone; since 15, `fetch` and GET route handlers are uncached — every request hits the origin unless you say otherwise. You opt in per request with `cache: 'force-cache'` or `next: { revalidate: 3600, tags: ['posts'] }`, or per segment with `export const fetchCache = 'default-cache'`. Next 16 adds the explicit layer: with `cacheComponents: true`, the `'use cache'` directive caches a function or component, `cacheLife()` sets duration, `cacheTag()` names it, and `revalidateTag()`/`revalidatePath()` invalidate on demand — typically from the Server Action that changed the data. Static prerendering at build time still applies when a route uses no request data; the build's route table (○ vs ƒ) tells you what you got.",
    },
    {
      q: "Server Action or API route — how do you decide?",
      a: "Ownership of the caller. If my own app is mutating its own data — a form submit, a delete button — a Server Action wins: it's a typed function call with progressive enhancement (the form POSTs even before hydration, like every PHP form I ever shipped), and it can `revalidatePath` or `revalidateTag` in the same breath. If the caller is anyone else — a webhook from Stripe, a mobile app, a public JSON API, a file download, anything that needs GET or custom headers — that's a route handler in `route.ts`, the API-controller shape. The senior caveat I'd volunteer: both compile to public HTTP endpoints, so 'the button is only rendered for admins' protects nothing — each action and handler authenticates and validates its own input, every time.",
    },
  ],

  quiz: [
    {
      question:
        "In a fresh Next.js 16 app, what happens to a plain fetch('https://api.example.com/posts') in a Server Component?",
      options: [
        "It's cached indefinitely until revalidatePath is called",
        "It's cached for 60 seconds by default",
        "It runs on every request — caching is opt-in via cache/next options since Next 15",
        "It fails — fetch requires a cache option in 16",
      ],
      answerIndex: 2,
      explain:
        "Since Next 15, fetch is NOT cached by default (the 13/14 default-caching behavior is gone). You opt in per request with cache: 'force-cache' or next: { revalidate, tags }, per segment with fetchCache, or cache your own functions with 'use cache'.",
    },
    {
      question:
        "Why does `const { slug } = await props.params` have an await in Next.js 16?",
      options: [
        "params does a database lookup for the route",
        "params and searchParams are Promises in 15/16, and synchronous access was removed entirely in 16",
        "Only catch-all segments are async",
        "The await is optional — it's just a convention",
      ],
      answerIndex: 1,
      explain:
        "The request APIs went async in 15 (params, searchParams, cookies(), headers(), draftMode()) and 16 removed the sync fallback. PageProps<'/blog/[slug]'> types the awaited result from the route string.",
    },
    {
      question:
        "A product page's reviews panel throws while rendering. Which file keeps the rest of the page usable?",
      options: [
        "loading.tsx in the reviews segment",
        "not-found.tsx at the app root",
        "proxy.ts catching the error before routing",
        "error.tsx in that segment — a 'use client' error boundary",
      ],
      answerIndex: 3,
      explain:
        "error.tsx wraps its segment in an error boundary and renders a fallback (with a reset function) when rendering throws; parent layouts stay interactive. loading.tsx handles the pending state, not failures, and proxy.ts runs before rendering ever starts.",
    },
    {
      question: "What is the correct way to protect the /account routes?",
      options: [
        "A session check in proxy.ts, since it runs before every matched request",
        "Hiding the /account links from logged-out users",
        "proxy.ts for fast redirects, PLUS a verifySession() call inside the data-access functions the pages use",
        "Marking the pages 'use client' so the session can be checked in the browser",
      ],
      answerIndex: 2,
      explain:
        "Defense in depth: proxy.ts gives good UX but is a perimeter that can be bypassed (as the 2025 middleware CVE showed), and hidden links or client checks protect nothing. The load-bearing check re-verifies the session next to the data, in the DAL.",
    },
  ],
};

export default lesson;
