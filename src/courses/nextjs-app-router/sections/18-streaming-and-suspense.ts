import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "streaming-and-suspense",
  title: "Streaming with Suspense",
  part: "Data & Caching",
  estMinutes: 12,
  summary:
    "Instead of blocking the whole response on the slowest query, Next streams the page shell immediately and fills each <Suspense> boundary as its data resolves.",

  concept: `
PHP's render model is **all-or-nothing**: the script runs top to bottom, and
(thanks to output buffering) the browser typically sees *nothing* until the
whole thing finishes. If one dashboard widget needs a 3-second aggregate
query, the header, nav, and every fast widget wait 3 seconds too. You can
fight it with \`flush()\` and \`ob_flush()\`, but then you're hand-managing
buffer state and can no longer touch headers — hackery, not architecture.

Next.js streams by default. The App Router sends the response as **chunks
over one HTTP connection**: the static shell goes out immediately, and each
pending region's HTML follows *as its data resolves* — even out of order.

### \`loading.tsx\`: streaming for free

Drop a \`loading.tsx\` next to a \`page.tsx\` and Next wraps the page in an
automatic Suspense boundary:

\`\`\`tsx
// app/dashboard/loading.tsx
export default function Loading() {
  return <p>Loading dashboard…</p>;
}
\`\`\`

The layout and this fallback are sent instantly; the page's HTML streams in
when its data is ready. One file, whole-page granularity.

### Manual \`<Suspense>\`: per-widget granularity

Whole-page is often too coarse. The fix is to **move the \`await\` down** —
out of the page, into small async components — and wrap each in a boundary:

\`\`\`tsx
// app/dashboard/page.tsx — no await here, so the shell is instant
import { Suspense } from 'react';

export default function Dashboard() {
  return (
    <main>
      <h1>Dashboard</h1>
      <Suspense fallback={<ChartSkeleton />}>
        <SalesChart />   {/* async — awaits the slow aggregate */}
      </Suspense>
      <Suspense fallback={<ListSkeleton />}>
        <RecentOrders /> {/* async — awaits a fast query */}
      </Suspense>
    </main>
  );
}
\`\`\`

The heading paints immediately, \`RecentOrders\` pops in first, and the slow
chart arrives whenever it arrives — each boundary is independent. The
fallback is server-rendered HTML too, so users see a real skeleton, not a
blank page.

### Advanced: pass the promise, unwrap with \`use()\`

Sometimes the *client* component should own the waiting (say, it also needs
interactivity). Start the fetch on the server **without awaiting**, pass the
promise as a prop, and unwrap it with React's \`use()\`:

\`\`\`tsx
// app/dashboard/page.tsx (server)
const salesPromise = getSales(); // NOT awaited — fetch starts now

<Suspense fallback={<ChartSkeleton />}>
  <SalesChart dataPromise={salesPromise} />
</Suspense>
\`\`\`

\`\`\`tsx
// components/sales-chart.tsx
'use client';
import { use } from 'react';

export function SalesChart({ dataPromise }: { dataPromise: Promise<Sales[]> }) {
  const sales = use(dataPromise); // suspends until it resolves
  return <Chart data={sales} />;
}
\`\`\`

The fetch starts server-side (no client round trip), the shell streams, and
the boundary resolves when the promise does. Promises are one of the few
things that *can* cross the server→client boundary.

### Why this matters

Streaming decouples **time-to-first-byte** from your slowest data source.
For interviews, the one-liner: *"loading.tsx is an automatic Suspense
boundary around the page; manual \`<Suspense>\` gives per-widget streaming;
the await moves down into the component you wrap."*
`,

  comparisons: [
    {
      label: "flush() hackery vs declarative boundaries",
      intro:
        "Get the header on screen before a slow report finishes. PHP manually flushes output buffers mid-script; Next declares a boundary and the framework streams.",
      php: `<?php // report.php — hand-flushing output buffers
echo '<html><body><h1>Sales Report</h1>';
echo '<p>Crunching numbers…</p>';

// Force the shell out the door:
ob_flush();
flush();
// Fragile: needs buffering config cooperation,
// headers/cookies are locked in, no way to
// REPLACE that "Crunching…" text — only append.

$report = runSlowAggregateQuery(); // 3s
echo render_table($report);
echo '</body></html>';`,
      ts: `// app/report/page.tsx — declare it, Next streams it
import { Suspense } from 'react';

export default function ReportPage() {
  return (
    <main>
      <h1>Sales Report</h1>
      <Suspense fallback={<p>Crunching numbers…</p>}>
        <ReportTable />
      </Suspense>
    </main>
  );
}

async function ReportTable() {
  const report = await runSlowAggregateQuery(); // 3s
  return <Table rows={report} />;
}`,
      note:
        "Same goal, opposite ergonomics: PHP appends to a one-way stream and can never replace the placeholder; Suspense streams the fallback, then swaps in the real HTML when the boundary resolves — out-of-order, per region.",
    },
    {
      label: "One blocking render vs shell + streamed widgets",
      intro:
        "A dashboard with one slow query (3s) and two fast ones. Structure decides whether users stare at a blank tab for 3 seconds or see a working page immediately.",
      php: `<?php // dashboard.php — slowest query gates EVERYTHING
$sales  = getSalesChart();   // 3000ms
$orders = getRecentOrders(); //  100ms
$top    = getTopProducts();  //  200ms

// Browser has seen nothing for ~3.3s. Only now:
?>
<h1>Dashboard</h1>
<div><?= render_chart($sales) ?></div>
<div><?= render_list($orders) ?></div>
<div><?= render_list($top) ?></div>`,
      ts: `// app/dashboard/page.tsx — shell now, widgets as ready
import { Suspense } from 'react';

export default function Dashboard() {
  return (
    <main>
      <h1>Dashboard</h1>   {/* paints immediately */}
      <Suspense fallback={<Skeleton />}>
        <SalesChart />     {/* streams in at ~3s */}
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <RecentOrders />   {/* streams in at ~100ms */}
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <TopProducts />    {/* streams in at ~200ms */}
      </Suspense>
    </main>
  );
}`,
      note:
        "The transformation is always the same: move each await out of the page and into a small async component, wrap it in Suspense. The page renders instantly because it awaits nothing itself.",
    },
    {
      label: "Shell + AJAX backfill vs promise + use()",
      intro:
        "The classic PHP workaround was a fast shell plus a second AJAX request to fill the slow widget. Next gets the same effect in one streamed response — no extra endpoint.",
      php: `<?php // dashboard.php — ship shell, backfill via AJAX
?>
<h1>Dashboard</h1>
<div id="chart">Loading…</div>
<script>
  // SECOND round trip, and you must build and
  // maintain /api/sales-chart.php just for this:
  fetch('/api/sales-chart.php')
    .then(r => r.text())
    .then(html => {
      document.getElementById('chart').innerHTML = html;
    });
</script>`,
      ts: `// app/dashboard/page.tsx (Server Component)
import { Suspense } from 'react';
import { SalesChart } from './sales-chart';

export default function Dashboard() {
  const salesPromise = getSales(); // started, NOT awaited
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SalesChart dataPromise={salesPromise} />
    </Suspense>
  );
}

// app/dashboard/sales-chart.tsx
// 'use client';
// const sales = use(dataPromise); // suspends, then renders`,
      note:
        "The AJAX version needs a second HTTP round trip and a dedicated endpoint to maintain. Streaming does it in the original response: the promise starts on the server, crosses the boundary as a prop, and use() suspends the client component until it resolves.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A simulation of one streamed response: the shell flushes immediately, then three Suspense 'chunks' arrive as their fake fetches resolve — note they complete in speed order, not source order. Predict the sequence, then run it.",
    code: `// Streaming SSR in miniature: one response, many chunks.
// The shell goes out first; each boundary's HTML follows
// whenever ITS data resolves — out of order is fine.

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const start = Date.now();
function flush(chunk: string): void {
  const ms = String(Date.now() - start).padStart(3, ' ');
  console.log(\`\${ms}ms  \${chunk}\`);
}

// The page declares three boundaries around async widgets:
const widgets = [
  { name: 'SalesChart', ms: 300 },   // slowest query
  { name: 'RecentOrders', ms: 100 }, // fastest
  { name: 'TopProducts', ms: 200 },
];

// 1. Shell + fallbacks flush immediately — no data awaited:
flush('<h1>Dashboard</h1> + 3 skeleton fallbacks');

// 2. Each boundary streams independently as data resolves:
await Promise.all(
  widgets.map(async (w) => {
    await delay(w.ms);
    flush(\`chunk: <\${w.name}/> replaces its skeleton\`);
  })
);

// 3. All boundaries resolved — the stream closes:
flush('stream closed (page complete)');

// PHP equivalent: nothing before ~300ms, then everything.
// Try making SalesChart 1000ms — the shell timing won't move.`,
  },

  keyPoints: [
    "PHP's model blocks the entire response on the slowest query; App Router responses stream — static shell first, each pending region's HTML as its data resolves, over one connection.",
    "`loading.tsx` is just an automatic `<Suspense>` boundary wrapped around the page — instant whole-page fallback with zero component changes.",
    "For per-widget streaming, move the `await` down: page awaits nothing, each slow fetch lives in a small async Server Component wrapped in `<Suspense fallback={...}>`.",
    "Fallbacks are server-rendered HTML — users get a real skeleton immediately, and React swaps it for the streamed content when the boundary resolves (even out of order).",
    "Advanced: start a fetch on the server without awaiting, pass the promise to a `'use client'` component as a prop, and unwrap it with React's `use()` — the client owns the suspending, but the fetch started server-side.",
    "Streaming decouples time-to-first-byte from your slowest data source — the PHP equivalents were flush() hackery or a second AJAX round trip to a dedicated endpoint.",
  ],

  interview: [
    {
      q: "What does streaming SSR give you over traditional server rendering, and how do you opt in?",
      a: "Traditional SSR — and every PHP app I've built — blocks the whole response on the slowest data source: nothing reaches the browser until everything is ready. Streaming sends the static shell immediately and then flushes each pending region's HTML over the same connection as its data resolves, so time-to-first-byte stops being hostage to the worst query. Opting in is structural: `loading.tsx` gives you an automatic Suspense boundary around a whole page, and manual `<Suspense fallback={...}>` around individual async components gives per-widget granularity. The key refactor is moving each `await` out of the page and down into the component you wrap.",
    },
    {
      q: "How is loading.tsx related to <Suspense>?",
      a: "loading.tsx isn't a separate mechanism — it's sugar. Next takes the file's default export and wraps the page in `<Suspense fallback={<Loading />}>` automatically, so the layout and fallback stream instantly while the page's data loads. It also applies during client-side navigations, so users get immediate feedback instead of a frozen UI. When whole-page granularity is too coarse — one slow widget shouldn't skeleton the entire page — you skip down to manual Suspense boundaries around the specific async components, and the two compose: page-level fallback first, then widget-level boundaries within it.",
    },
    {
      q: "When would you pass a promise to a client component and use React's use() instead of awaiting in a Server Component?",
      a: "When the component that displays the data must be a client component — it needs interactivity, browser APIs, or stateful chart libraries — but I still want the fetch to start on the server. I call the data function in the Server Component *without* awaiting, pass the promise as a prop (promises are among the few values that can cross the server-to-client boundary), and inside the client component `use(dataPromise)` suspends until it resolves, showing the surrounding Suspense fallback meanwhile. Compared to fetching in a useEffect, there's no second round trip after hydration and no hand-rolled loading state — it's the streaming answer to the old 'shell page plus AJAX backfill' pattern from PHP days.",
    },
  ],

  quiz: [
    {
      question:
        "A dashboard page awaits three queries (3000ms, 100ms, 200ms) directly in page.tsx, with a loading.tsx present. When does the user first see real page content?",
      options: [
        "At ~100ms, as each query streams in independently",
        "At ~3000ms — the page is one boundary, so all its awaits gate the whole page's HTML",
        "Immediately — Server Components never block",
        "Never, until all three queries are wrapped in use cache",
      ],
      answerIndex: 1,
      explain:
        "loading.tsx wraps the whole page in ONE Suspense boundary: the fallback streams instantly, but the page's actual content waits for every await inside it. Per-widget streaming requires moving each await into its own async component wrapped in its own <Suspense>.",
    },
    {
      question: "What exactly does loading.tsx do?",
      options: [
        "Registers a client-side spinner shown during fetch() calls",
        "Delays rendering until all data is ready, then shows the page",
        "Wraps the page in an automatic <Suspense> boundary whose fallback is the file's default export",
        "Enables streaming, which is otherwise off by default",
      ],
      answerIndex: 2,
      explain:
        "loading.tsx is convention-based sugar for <Suspense fallback={<Loading/>}> around the page. Streaming itself is how the App Router already responds; loading.tsx just gives the page boundary a fallback so the shell can flush before the page's data resolves.",
    },
    {
      question:
        "In the promise-passing pattern, why start the fetch in the Server Component instead of fetching inside the client component with useEffect?",
      options: [
        "useEffect is deprecated in React 19",
        "The fetch starts during the server render — no waiting for hydration and a second client round trip — and use() suspends into the existing Suspense fallback",
        "Client components cannot make network requests",
        "Promises are smaller over the wire than JSON",
      ],
      answerIndex: 1,
      explain:
        "Kicking off getSales() server-side (un-awaited) means the query is already in flight while the shell streams. The promise crosses to the client as a prop and use() unwraps it — versus useEffect, which can't even start fetching until the JS bundle loads and hydrates.",
    },
  ],
};

export default lesson;
