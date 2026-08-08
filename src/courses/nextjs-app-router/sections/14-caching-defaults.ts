import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "caching-defaults",
  title: "Caching: The Real Defaults",
  part: "Data & Caching",
  estMinutes: 13,
  summary:
    "Since Next.js 15, fetch is NOT cached by default — you opt in per request with cache: 'force-cache' and next: { revalidate, tags } — and knowing this (plus the four cache layers by name) is a stock interview question because half the internet still teaches the old defaults.",

  concept: `
This is the section where being current is worth actual interview points.
Next.js caching *defaults changed* in version 15, and the internet is full of
13/14-era tutorials teaching the old behavior. State the current rules
precisely and you immediately sound like someone who reads release notes.

### The headline: fetch is NOT cached by default

Since **Next.js 15** (and still true in 16):

\`\`\`tsx
// A Server Component in Next 15/16:
const res = await fetch('https://api.example.com/prices');
// → NOT cached. Runs fresh on every request, like every
//   line of PHP you ever wrote.
\`\`\`

In **Next 13/14**, that same line was cached **indefinitely by default** —
\`force-cache\` was implicit, and developers were routinely ambushed by stale
data they never asked to cache. The team reversed the default in 15:
**uncached until you say otherwise.** Interviewers ask this exact question to
filter people whose knowledge is a 2023 tutorial.

For a PHP developer this is the comfortable direction. PHP has *no* implicit
caching — every request recomputes everything, and anything cached (Redis,
APCu, Varnish) is something you explicitly added. That's precisely the Next
15+ model: trust the default, opt in deliberately.

### Opting in, per request

\`\`\`tsx
// Cache indefinitely (until a deploy or manual invalidation):
await fetch(url, { cache: 'force-cache' });

// Cache, but treat as stale after 60 seconds:
await fetch(url, { next: { revalidate: 60 } });

// Cache + label it, so a mutation can purge exactly this data:
await fetch(url, { next: { revalidate: 3600, tags: ['posts'] } });

// Explicitly never cache (and opt the route into dynamic rendering):
await fetch(url, { cache: 'no-store' });
\`\`\`

Tagged entries are purged on demand with \`revalidateTag('posts', 'max')\` — the
second (cacheLife) argument is required in Next 16; \`'max'\` keeps
stale-while-revalidate — typically
from the Server Action that changed the data. \`revalidatePath('/posts')\` does
the same by URL. That's Redis cache keys plus targeted invalidation, built in.

To flip a whole segment's default instead of decorating every call:
\`export const fetchCache = 'default-cache'\` in a layout or page opts every
un-optioned \`fetch\` below it into caching (individual calls still override).

### The four layers — know them by name

"Walk me through the Next.js caches" wants these four, one line each:

1. **Request memoization** — identical \`fetch\` calls deduped *within one
   render pass*. Not really a cache; dies with the request.
2. **Data Cache** — \`fetch\` responses persisted on the *server across
   requests*. This is the layer that's opt-in since 15, controlled by
   \`force-cache\` / \`revalidate\` / \`tags\`.
3. **Full Route Cache** — entire routes (HTML + RSC payload) prerendered and
   stored server-side. Your static pages live here; think Varnish in front
   of PHP.
4. **Router Cache** — the *client-side* cache of visited routes in the
   browser, making back/forward navigation instant.

Memoization is per-request; Data and Full Route are server-side and
persistent; Router is in the browser.

### Route handlers too

\`GET\` route handlers (\`route.ts\` — the App Router's API endpoints) follow the
same rule: **uncached by default** since 15. A GET handler behaves like a PHP
API script — runs on every hit — unless you opt it in (e.g.
\`export const revalidate = 60\` or \`export const dynamic = 'force-static'\`
in the file).

### Where Next 16 is heading

Next 16 ships an opt-in explicit model — \`cacheComponents: true\` in
\`next.config.ts\` enables the \`"use cache"\` directive with \`cacheLife()\` /
\`cacheTag()\` — pushing even further toward *nothing cached unless you mark
it*. You don't need its details yet; you do need the direction: **explicit
over implicit**, which has been the philosophy since the 15 reversal.
`,

  comparisons: [
    {
      label: "The default: every request recomputes",
      intro:
        "Fetch exchange rates in the page. Neither version caches anything — and for once, PHP intuition and Next.js current behavior agree exactly.",
      php: `<?php // prices.php
// PHP has no implicit caching: this HTTP call runs on
// EVERY page view, always fresh, always paid for.
$json = file_get_contents(
    'https://api.exchangerate.host/latest'
);
$rates = json_decode($json, true)['rates'];

echo 'EUR: ' . $rates['EUR'];`,
      ts: `// app/prices/page.tsx (Next 15/16)
export default async function Prices() {
  // NOT cached by default — fresh on every request,
  // exactly like the PHP version.
  const res = await fetch(
    'https://api.exchangerate.host/latest'
  );
  const { rates } = await res.json();

  return <p>EUR: {rates.EUR}</p>;
}

// ⚠ In Next 13/14 this SAME code was cached forever
// by default. If a tutorial says "fetch is cached
// automatically", it's teaching 2023.`,
      note: "The 15+ default is the PHP model: nothing cached unless you ask. The dangerous code is unchanged 13/14-era code — same lines, different behavior across the major versions.",
    },
    {
      label: "Opting in: Redis wrapper vs fetch options",
      intro:
        "The rates only change hourly, so cache them for an hour — with a way to purge early when needed. PHP wires up Redis by hand; Next.js expresses it as fetch options.",
      php: `<?php // prices.php — hand-rolled TTL + tagged key
$redis = new Redis();
$redis->connect('127.0.0.1');

$rates = $redis->get('rates:latest');
if ($rates === false) {
    $json = file_get_contents(
        'https://api.exchangerate.host/latest'
    );
    $redis->setex('rates:latest', 3600, $json);
    $rates = $json;
}
// Purging early = somewhere else calling:
// $redis->del('rates:latest');
echo json_decode($rates, true)['rates']['EUR'];`,
      ts: `// app/prices/page.tsx
export default async function Prices() {
  const res = await fetch(
    'https://api.exchangerate.host/latest',
    {
      cache: 'force-cache',
      next: { revalidate: 3600, tags: ['rates'] },
    }
  );
  const { rates } = await res.json();
  return <p>EUR: {rates.EUR}</p>;
}

// Purging early, e.g. from a Server Action:
//   import { revalidateTag } from 'next/cache';
//   revalidateTag('rates');`,
      note: "revalidate is the setex TTL; tags are your Redis key-naming scheme; revalidateTag() is the targeted DEL — the whole Redis pattern as declarative options on the request.",
    },
    {
      label: "API endpoints: uncached there too",
      intro:
        "An API endpoint returning the latest orders. Both run fresh per hit by default; the Next.js version shows the explicit opt-in when staleness is acceptable.",
      php: `<?php // api/orders.php
// A PHP API script naturally runs per request —
// nobody expects this to be cached.
header('Content-Type: application/json');

$orders = $pdo
    ->query('SELECT * FROM orders ORDER BY id DESC LIMIT 20')
    ->fetchAll(PDO::FETCH_ASSOC);

echo json_encode($orders);`,
      ts: `// app/api/orders/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET handlers are UNCACHED by default since Next 15.
// To serve a cached snapshot instead, opt in:
// export const revalidate = 60;

export async function GET() {
  const orders = await db.order.findMany({
    orderBy: { id: 'desc' },
    take: 20,
  });
  return NextResponse.json(orders);
}`,
      note: "Next 13/14 cached GET handlers by default — a notorious source of 'my API returns stale data' bugs. Since 15 they behave like the PHP script: per-request unless you export a revalidate.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The Next 15/16 per-request caching rules, encoded as one decision function. Predict each verdict — the first case is the interview question — then run it.",
    code: `// The Data Cache decision, as Next 15/16 applies it per fetch.
type FetchOptions = {
  cache?: 'force-cache' | 'no-store';
  next?: { revalidate?: number; tags?: string[] };
};

function dataCacheVerdict(opts: FetchOptions = {}): string {
  if (opts.cache === 'no-store') {
    return 'NOT CACHED — explicit no-store (also opts the route into dynamic rendering)';
  }
  const revalidate = opts.next?.revalidate;
  const tags = opts.next?.tags ?? [];
  const tagNote = tags.length
    ? \` + purgeable via revalidateTag('\${tags.join("','")}')\`
    : '';

  if (revalidate !== undefined) {
    return \`CACHED — stale after \${revalidate}s\${tagNote}\`;
  }
  if (opts.cache === 'force-cache') {
    return \`CACHED — indefinitely (until deploy or manual invalidation)\${tagNote}\`;
  }
  // THE default since Next 15. In 13/14 this same case was
  // 'CACHED — indefinitely'. That reversal is the interview question.
  return 'NOT CACHED — the Next 15+ default: no options means no Data Cache';
}

const cases: Array<[string, FetchOptions | undefined]> = [
  ['fetch(url)', undefined],
  ["fetch(url, { cache: 'force-cache' })", { cache: 'force-cache' }],
  ['fetch(url, { next: { revalidate: 60 } })', { next: { revalidate: 60 } }],
  [
    "fetch(url, { next: { revalidate: 3600, tags: ['posts'] } })",
    { next: { revalidate: 3600, tags: ['posts'] } },
  ],
  ["fetch(url, { cache: 'no-store' })", { cache: 'no-store' }],
];

for (const [label, opts] of cases) {
  console.log(label);
  console.log('  → ' + dataCacheVerdict(opts));
}`,
  },

  keyPoints: [
    "Since Next.js 15 (still true in 16), `fetch` is NOT cached by default — plain `await fetch(url)` runs fresh every request, exactly like PHP. Next 13/14 cached it indefinitely; stale tutorials still teach that.",
    "Opt in per request: `cache: 'force-cache'` (cache indefinitely), `next: { revalidate: 60 }` (TTL), `next: { tags: ['posts'] }` (targeted purging via `revalidateTag()`); `revalidatePath()` purges by URL.",
    "Opt in per segment: `export const fetchCache = 'default-cache'` in a layout/page caches every un-optioned fetch below it; individual calls still override.",
    "The four layers by name: request memoization (per render pass), Data Cache (fetch results, server, cross-request), Full Route Cache (prerendered HTML/RSC payload — Varnish for your static pages), Router Cache (visited routes, in the browser).",
    "GET route handlers are also uncached by default since 15 — they behave like a PHP API script unless you export `revalidate` or `dynamic = 'force-static'`.",
    "Next 16's opt-in `cacheComponents` + `\"use cache\"` directive continues the same philosophy: explicit caching over implicit.",
  ],

  interview: [
    {
      q: "Is fetch cached by default in Next.js?",
      a: "Not anymore — and the 'anymore' is the point. In Next 13 and 14, `fetch` in Server Components defaulted to `force-cache`, so responses were cached indefinitely unless you opted out, which surprised a lot of teams with stale data. Next 15 reversed that, and it holds in 16: `fetch` is uncached by default, and you opt in per request with `cache: 'force-cache'` or `next: { revalidate, tags }`, or per segment with `export const fetchCache = 'default-cache'`. GET route handlers followed the same reversal. So the current model matches PHP's: every request recomputes unless you explicitly cache — which I'd argue is the only default developers can reason about.",
    },
    {
      q: "Can you name the caching layers in Next.js and say where each lives?",
      a: "Four. Request memoization dedupes identical `fetch` calls within a single render pass — server-side, gone when the response is sent. The Data Cache stores individual fetch responses on the server across requests — that's the opt-in layer controlled by `force-cache`, `revalidate`, and `tags`. The Full Route Cache stores entire prerendered routes — the HTML and RSC payload — on the server; it's why static pages are served like files, essentially Varnish built into the framework. And the Router Cache lives in the browser, caching visited routes so back/forward navigation is instant. The first is per-request deduplication; the middle two are the server-side caches you actively manage; the last is client-side.",
    },
    {
      q: "How do you cache an expensive external API call for an hour but bust it immediately when the underlying data changes?",
      a: "Both controls go on the fetch: `fetch(url, { cache: 'force-cache', next: { revalidate: 3600, tags: ['rates'] } })`. The `revalidate` gives it an hour's freshness like a Redis `SETEX` TTL, and the tag labels the cache entry. When the data changes — say in the Server Action that updates it — I call `revalidateTag('rates')` and every entry with that tag is invalidated on the spot; `revalidatePath('/prices')` is the URL-based alternative. It's the Redis pattern — TTL plus targeted key deletion — expressed declaratively, with the framework owning the storage.",
    },
    {
      q: "A teammate copies data-fetching code from a Next 14 blog post into your Next 16 app. What behavior changes silently?",
      a: "Everything the post assumed about caching inverts. Code written for 14 assumed `fetch` was cached by default, so it either relied on that for performance — those calls now hit the origin on every request in 15/16, a possible load and latency regression — or it sprinkled `cache: 'no-store'` everywhere to fight the old default, which is now mostly redundant noise (though `no-store` still meaningfully opts the route into dynamic rendering). GET route handlers flipped the same way. The fix is to audit each fetch and make the intent explicit: add `force-cache`/`revalidate`/`tags` where caching was wanted, delete opt-outs that no longer do anything. This 'defaults flipped in 15' story is exactly what interviewers probe for.",
    },
  ],

  quiz: [
    {
      question: "In Next.js 16, what does `await fetch('https://api.example.com/data')` — no options — do about caching?",
      options: [
        "Cached indefinitely in the Data Cache",
        "Cached for 60 seconds by default",
        "Not cached — it runs fresh on every request",
        "Cached only in production builds",
      ],
      answerIndex: 2,
      explain:
        "Since Next 15, fetch has no implicit Data Cache entry — no options means uncached, like every PHP request. The 'cached indefinitely' answer was correct in Next 13/14, which is why this is a favorite interview trap.",
    },
    {
      question: "Which option combination caches a fetch for an hour AND lets a mutation purge it immediately?",
      options: [
        "{ cache: 'no-store', next: { revalidate: 3600 } }",
        "{ next: { revalidate: 3600, tags: ['rates'] } } — then revalidateTag('rates') on mutation",
        "{ cache: 'force-cache' } alone — force-cache implies a 1-hour TTL",
        "{ next: { tags: ['rates'] } } alone — tags imply caching with a default TTL",
      ],
      answerIndex: 1,
      explain:
        "revalidate sets the freshness window and tags label the entry for on-demand invalidation with revalidateTag(). no-store forbids caching entirely, and force-cache alone has no TTL — it caches until a deploy or manual invalidation.",
    },
    {
      question: "Which cache makes back/forward navigation feel instant, and where does it live?",
      options: [
        "The Data Cache, on the server",
        "The Full Route Cache, on the CDN",
        "Request memoization, in the React tree",
        "The Router Cache, in the browser",
      ],
      answerIndex: 3,
      explain:
        "The Router Cache is the one client-side layer: it keeps the RSC payloads of visited routes in the browser so revisiting them needs no server round trip. The Data and Full Route caches are server-side; memoization only lives for a single render pass.",
    },
    {
      question: "What is the default caching behavior of a GET route handler (route.ts) in Next.js 15/16?",
      options: [
        "Cached until the next deployment",
        "Uncached — it executes on every request unless you opt in (e.g. export const revalidate)",
        "Cached for 5 minutes",
        "GET handlers cannot be cached at all",
      ],
      answerIndex: 1,
      explain:
        "GET route handlers followed the same 15 reversal as fetch: uncached by default, executing per request like a PHP API script. Exporting revalidate or dynamic = 'force-static' opts a handler into cached, static behavior.",
    },
  ],
};

export default lesson;
