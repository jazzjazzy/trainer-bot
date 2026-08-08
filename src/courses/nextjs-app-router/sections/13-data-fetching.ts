import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "data-fetching",
  title: "Data Fetching in Server Components",
  part: "Data & Caching",
  estMinutes: 12,
  summary:
    "Server Components fetch data the way a PHP page always did — query the database or await fetch() right where you render — with Promise.all parallelism, automatic fetch deduplication, and React's cache() as the new tools.",

  concept: `
Here's the part of Next.js where twenty-five years of PHP is a *head start*.
For years, React data fetching meant building an API endpoint, then a client
component with \`useEffect\` + loading state to call it. Server Components
delete that ceremony: a component can be \`async\`, and you fetch **right where
you render** — exactly like putting a PDO query at the top of a PHP page.

### Query your own data directly — no API layer

\`\`\`tsx
// app/posts/page.tsx — a Server Component (the default)
import { db } from '@/lib/db';

export default async function Posts() {
  // Direct DB access. This runs ONLY on the server —
  // the import never reaches the browser bundle.
  const posts = await db.query('SELECT id, title FROM posts');
  return (
    <ul>
      {posts.map((p) => <li key={p.id}>{p.title}</li>)}
    </ul>
  );
}
\`\`\`

That is \`$pdo->query(...)\` at the top of \`posts.php\`, with types. You only
need \`fetch\` for **external** services; for your own database, call it
directly (or through Prisma/Drizzle). No REST endpoint, no client fetch,
no loading-state hook — the HTML arrives already full of data.

### Sequential vs parallel: the trap PHP trained into you

PHP code is naturally sequential — each query blocks until it finishes, and
there's no easy alternative. In an async Server Component the same shape is a
**choice**, and often the wrong one:

\`\`\`tsx
// SEQUENTIAL — the waterfall. 300ms + 200ms = 500ms.
const user = await getUser(id);        // 300ms
const orders = await getOrders(id);    // 200ms — starts only after user!
\`\`\`

\`getOrders\` doesn't need \`user\` — it needed \`id\`, which we already had. Start
both promises first, await together:

\`\`\`tsx
// PARALLEL — max(300, 200) = 300ms.
const userPromise = getUser(id);       // starts now
const ordersPromise = getOrders(id);   // starts now, in parallel
const [user, orders] = await Promise.all([userPromise, ordersPromise]);
\`\`\`

The rule: **\`await\` is the finish line, not the start line.** Calling an async
function starts the work; \`await\` only waits for it. Sequential awaits are
correct only when the second call genuinely needs the first's *result*.

### Request memoization: layouts and pages can both ask

A layout and its page often need the same data — in PHP you'd hoist that query
somewhere shared or eat the duplicate. Next.js **memoizes \`fetch\`**: identical
GET requests (same URL, same options) inside one render pass execute **once**;
the rest get the memoized result.

\`\`\`tsx
async function getUser(id: string) {
  const res = await fetch(\`https://api.example.com/users/\${id}\`);
  return res.json();
}
// layout.tsx calls getUser('7'); page.tsx calls getUser('7').
// One network request. Fetch where you need data — don't prop-drill.
\`\`\`

This dedupe lives only for the single render pass — it is *not* caching
between requests (that's the Data Cache, next section).

### cache() — the same dedupe for non-fetch work

Direct DB calls don't go through \`fetch\`, so they aren't auto-memoized. Wrap
them in React's \`cache()\`:

\`\`\`ts
// lib/data.ts
import { cache } from 'react';
import { db } from '@/lib/db';

export const getPost = cache(async (slug: string) => {
  return db.post.findUnique({ where: { slug } });
});
// generateMetadata() and the page both call getPost(slug):
// one query per request, per argument list.
\`\`\`

Same scope as fetch memoization: deduped within one render pass, recomputed
fresh on the next request. Think of it as a per-request static cache — the
\`static $result\` trick inside a PHP function, formalized.

### The shape of a well-fetched page

Fetch **in the component that needs the data**, as low in the tree as you
like — memoization makes repeats free. Kick off independent work early,
\`Promise.all\` it together. Reach for \`fetch\` only when the data lives behind
someone else's HTTP API.
`,

  comparisons: [
    {
      label: "Query in the page: PDO vs a Server Component",
      intro:
        "Render a product page from your own database. Both put the query directly in the code that renders — no API endpoint in between.",
      php: `<?php // product.php
$stmt = $pdo->prepare(
    'SELECT name, price_cents FROM products WHERE id = ?'
);
$stmt->execute([(int) $_GET['id']]);
$product = $stmt->fetch();
?>
<h1><?= htmlspecialchars($product['name']) ?></h1>
<p>$<?= number_format($product['price_cents'] / 100, 2) ?></p>`,
      ts: `// app/products/[id]/page.tsx
import { db } from '@/lib/db';

export default async function Product({
  params,
}: PageProps<'/products/[id]'>) {
  const { id } = await params;
  const product = await db.product.findUniqueOrThrow({
    where: { id: Number(id) },
  });

  return (
    <>
      <h1>{product.name}</h1>
      <p>\${(product.priceCents / 100).toFixed(2)}</p>
    </>
  );
}`,
      note: "Same mental model — query where you render, per request. The Server Component adds types end-to-end, automatic escaping via JSX, and the guarantee that db code never ships to the browser.",
    },
    {
      label: "Sequential habit vs Promise.all",
      intro:
        "A profile page needs the user, their orders, and their reviews — three independent 200ms lookups. PHP has one way to write it; the Server Component picks the fast one.",
      php: `<?php // profile.php — 3 × 200ms = ~600ms, and PHP
// offers no easy way to overlap these:
$user    = get_user($pdo, $id);      // 200ms
$orders  = get_orders($pdo, $id);    // 200ms
$reviews = get_reviews($pdo, $id);   // 200ms

render_profile($user, $orders, $reviews);`,
      ts: `// app/profile/[id]/page.tsx — ~200ms total
export default async function Profile({
  params,
}: PageProps<'/profile/[id]'>) {
  const { id } = await params;

  // Start all three NOW — calling starts the work…
  const [user, orders, reviews] = await Promise.all([
    getUser(id),
    getOrders(id),
    getReviews(id),
  ]); // …await is just the finish line.

  return <ProfileView user={user} orders={orders} reviews={reviews} />;
}`,
      note: "Awaiting each call in turn would recreate PHP's 600ms waterfall in JS. Promise.all overlaps independent work — reserve sequential awaits for calls that need a previous result.",
    },
    {
      label: "Deduping a repeated query: static var vs cache()",
      intro:
        "The page's metadata and its body both need the same post. Both languages solve the double-query with per-request memoization — one by idiom, one by API.",
      php: `<?php // lib/posts.php
function get_post(PDO $pdo, string $slug): ?array
{
    // The old PHP idiom: a static local as a
    // per-request memo so repeat callers don't
    // re-query.
    static $memo = [];
    if (!isset($memo[$slug])) {
        $st = $pdo->prepare(
            'SELECT * FROM posts WHERE slug = ?'
        );
        $st->execute([$slug]);
        $memo[$slug] = $st->fetch() ?: null;
    }
    return $memo[$slug];
}`,
      ts: `// lib/posts.ts
import { cache } from 'react';
import { db } from '@/lib/db';

// cache() = the static-var memo, per render pass:
// same args → one query, everyone shares the result.
export const getPost = cache(async (slug: string) =>
  db.post.findUnique({ where: { slug } })
);

// app/blog/[slug]/page.tsx: generateMetadata() calls
// getPost(slug) for the <title>, the page calls it
// again for the body — ONE query hits the database.`,
      note: "fetch() gets this dedupe automatically; cache() extends it to DB clients and any other async function. Both memos die with the request — this is deduplication, not cross-request caching.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A simulated clock makes the waterfall visible: three fake fetchers with fixed durations, run sequentially and then in parallel. Predict both elapsed totals before running — and note which strategy the mixed case forces.",
    code: `// Simulated async data layer: each fetcher "costs" fixed ms.
// We tally virtual time instead of real setTimeout so the
// numbers are exact.

type Fetcher = { name: string; ms: number };

const fetchers: Fetcher[] = [
  { name: 'getUser', ms: 300 },
  { name: 'getOrders', ms: 200 },
  { name: 'getReviews', ms: 250 },
];

// SEQUENTIAL: each await starts only after the previous finishes.
function runSequential(fs: Fetcher[]): number {
  let clock = 0;
  for (const f of fs) {
    clock += f.ms; // nothing overlaps
    console.log(\`  await \${f.name.padEnd(11)} done at \${clock}ms\`);
  }
  return clock;
}

// PARALLEL: all start at 0; Promise.all resolves at the slowest.
function runParallel(fs: Fetcher[]): number {
  let slowest = 0;
  for (const f of fs) {
    console.log(\`  start \${f.name.padEnd(11)} finishes at \${f.ms}ms\`);
    slowest = Math.max(slowest, f.ms);
  }
  return slowest; // Promise.all: max, not sum
}

console.log('SEQUENTIAL (await one by one):');
const seq = runSequential(fetchers);
console.log(\`  total: \${seq}ms\`);

console.log('PARALLEL (Promise.all):');
const par = runParallel(fetchers);
console.log(\`  total: \${par}ms\`);

console.log(\`Waterfall cost: \${seq - par}ms wasted\`);

// A DEPENDENT call cannot be parallelized: getRecommendations
// needs orders as INPUT, so it must wait for getOrders (200ms)
// but can still overlap everything else.
const dependent = Math.max(300, 200 + 150, 250);
console.log(\`Mixed (recommendations after orders): \${dependent}ms\`);`,
  },

  keyPoints: [
    "Server Components can be `async` — query the database or `await fetch()` directly where you render, exactly like PDO at the top of a PHP page. No API layer for your own data.",
    "`await` is the finish line, not the start line: calling an async function starts the work, so start independent calls first and collect them with `Promise.all` instead of awaiting one by one.",
    "Sequential awaits are only correct when a call needs the previous call's *result* — otherwise you've rebuilt PHP's query waterfall by hand.",
    "Request memoization: identical `fetch` GET calls (same URL + options) in one render pass run once — so layout, page, and metadata can each fetch what they need without coordinating.",
    "React's `cache()` gives non-fetch functions (DB queries via Prisma/Drizzle) the same per-render dedupe — the PHP `static $memo` idiom as an API.",
    "Both dedupe mechanisms last one render pass only; caching *across* requests is a separate system (the Data Cache) with its own opt-in rules.",
  ],

  interview: [
    {
      q: "How do you fetch data in the App Router, and where does it happen?",
      a: "In Server Components, which are the default: I make the component `async` and either query the database directly — Prisma, Drizzle, raw SQL — or `await fetch()` for external APIs, right in the component. That code runs only on the server, so credentials and the DB client never reach the browser, and the HTML streams out already populated. Coming from PHP this is the familiar model — a query at the top of the page — with the old React ceremony (build an endpoint, useEffect, loading flags) gone. Client-side fetching still exists for truly client-driven data, but it's the exception, not the default.",
    },
    {
      q: "What's the difference between sequential and parallel data fetching, and how do you get parallelism?",
      a: "`await getUser(id); await getOrders(id);` is a waterfall — the second request doesn't start until the first resolves, so latencies add up. If the calls are independent, I start them all first and await together: `const [user, orders] = await Promise.all([getUser(id), getOrders(id)])` — total time becomes the slowest call instead of the sum. The key insight is that invoking an async function starts the work immediately; `await` only waits. Sequential is right only when one call needs another's result. PHP developers have to unlearn a habit here: PHP made everything sequential by nature, so the waterfall shape looks normal even when it's costing you.",
    },
    {
      q: "Your layout and page both need the current user. Do you fetch twice, or lift the fetch somewhere shared?",
      a: "Neither — I fetch in both and let deduplication handle it. Next.js memoizes `fetch`: identical GET requests in the same render pass execute once, and every other caller gets the memoized result. For direct DB queries, which don't go through fetch, I wrap the accessor in React's `cache()` — `export const getUser = cache(async (id) => …)` — and get the same behavior, including for `generateMetadata`. This is per-request memoization, like a `static` local in a PHP function: it lives for one render pass and is gone on the next request. It's what makes 'fetch where you need the data' viable as an architecture — components stay self-contained without duplicate queries.",
    },
  ],

  quiz: [
    {
      question: "A Server Component needs data from your own Postgres database. What's the idiomatic approach?",
      options: [
        "Create a route handler API endpoint and fetch() it from the component",
        "Query the database directly in the async component (or via a cache()-wrapped helper)",
        "Use a client component with useEffect and a loading state",
        "Fetch in proxy.ts and pass the data down via headers",
      ],
      answerIndex: 1,
      explain:
        "Server Components run only on the server, so they can talk to the database directly — an internal API layer just adds latency and code. fetch() is for external services; useEffect fetching is the old client-side pattern this model replaces.",
    },
    {
      question: "getUser takes 300ms and getOrders takes 200ms; neither depends on the other. How long does `const u = await getUser(id); const o = await getOrders(id);` take, and what's the fix?",
      options: [
        "300ms — awaits automatically overlap; no fix needed",
        "500ms — start both promises first and await them with Promise.all to get 300ms",
        "200ms — Next.js reorders independent awaits",
        "500ms — and it can't be improved inside a single component",
      ],
      answerIndex: 1,
      explain:
        "Each await blocks the next line, so the calls run back to back: 300 + 200 = 500ms. Calling the functions first starts both requests immediately; Promise.all then resolves at the slower one — 300ms.",
    },
    {
      question: "Layout and page each call fetch('https://api.example.com/user/7') during one request. How many network requests go out?",
      options: [
        "Two — every fetch call is a network request",
        "One — identical fetches in a render pass are memoized",
        "Zero — fetch responses are cached between deployments",
        "One, but only if you set cache: 'force-cache'",
      ],
      answerIndex: 1,
      explain:
        "Request memoization dedupes identical GET fetches (same URL and options) within a single render pass, no configuration needed. It's independent of the Data Cache — it says nothing about caching across requests.",
    },
    {
      question: "Why would you wrap a Prisma query in React's cache()?",
      options: [
        "To cache the result across requests for 60 seconds",
        "To make the query run at build time",
        "Because DB calls bypass fetch memoization — cache() gives them the same per-render dedupe",
        "Because Prisma queries can't run in Server Components without it",
      ],
      answerIndex: 2,
      explain:
        "Automatic memoization only patches fetch. cache() extends per-render-pass deduplication to any async function, so metadata, layout, and page can all call getPost(slug) and issue one query. It does not cache across requests — that's the Data Cache's job.",
    },
  ],
};

export default lesson;
