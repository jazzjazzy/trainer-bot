import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "loading-error-not-found",
  title: "Loading, Error & Not-Found UI",
  part: "Routing & Navigation",
  estMinutes: 12,
  summary:
    "Three convention files — loading.tsx, error.tsx, not-found.tsx — give every route segment automatic loading, error, and 404 states, replacing the try/catch and header() plumbing you hand-wrote in PHP.",

  concept: `
In PHP you built these states by hand: a \`try/catch\` around the whole script
that includes \`500.php\`, an \`http_response_code(404)\` followed by an include
and a \`die()\`. And a loading state simply didn't exist — the browser stared at
a blank tab until your script finished. The App Router turns all three into
**files you drop into a route folder**. The folder is the configuration.

### loading.tsx — the state PHP never had

Put a \`loading.tsx\` next to a \`page.tsx\` and Next.js automatically wraps the
page in a React \`<Suspense>\` boundary with your file as the fallback:

\`\`\`tsx
// app/dashboard/loading.tsx
export default function Loading() {
  return <p className="skeleton">Loading dashboard…</p>;
}
\`\`\`

Because Server Components stream, the layout and this skeleton are sent to the
browser **immediately**, while the server is still awaiting the page's data.
When the page resolves, its HTML streams in and replaces the skeleton. PHP has
no equivalent: a PHP page is all-or-nothing, delivered only when the script
completes. This is the file that makes slow queries *feel* fast.

### error.tsx — a declarative error boundary

An uncaught throw anywhere in a segment's page (or its children) is caught by
the nearest \`error.tsx\`:

\`\`\`tsx
// app/dashboard/error.tsx
'use client'; // error boundaries MUST be Client Components

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong.</h2>
      <button onClick={() => unstable_retry()}>Try again</button>
    </div>
  );
}
\`\`\`

Three things to internalise:

- **\`'use client'\` is mandatory.** Error boundaries are a React class-component
  mechanism that needs client-side state — a Server Component cannot be one.
- **Production hides the message.** Server errors are redacted before reaching
  the browser so you never leak SQL or stack traces; you get a generic error
  plus \`error.digest\`, a hash you match against your server logs. (In dev you
  see the real message.)
- **Recovery props.** Next 16 (16.2+) passes \`unstable_retry()\` — note the
  \`unstable_\` prefix — which re-fetches and re-renders the segment, the one you
  almost always want — and \`reset()\`, which re-renders without re-fetching.
  Older code (13–15) only had \`reset\`; interviewers may still say "reset".

The boundary catches errors from the segment's page and everything below it,
but **not** from the same segment's \`layout.tsx\` — a layout error bubbles up to
the *parent* segment's \`error.tsx\`. If the **root layout** itself throws, only
\`app/global-error.tsx\` can catch it, and since it replaces the root layout it
must render its own \`<html>\` and \`<body>\` tags.

### not-found.tsx — a typed 404

Call \`notFound()\` (from \`next/navigation\`) when data doesn't exist. It throws,
rendering stops, and the nearest \`not-found.tsx\` renders with a real 404 status
code:

\`\`\`tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation';

export default async function Post({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound(); // throws — code after this never runs
  return <article>{post.title}</article>;
}
\`\`\`

\`notFound()\` returns \`never\`, so TypeScript narrows: after the \`if\`, \`post\`
is non-null. That's \`http_response_code(404); include '404.php'; die();\` —
status, view, and control-flow exit — in one call, with type narrowing thrown in.

### The mental model

Each route segment can declare its own loading, error, and not-found UI, and
the nearest one up the tree wins — like a hierarchy of try/catch blocks you
never have to write. A failure in \`/dashboard/invoices\` shows an error card in
that panel while the dashboard shell keeps working.
`,

  comparisons: [
    {
      label: "404 handling: manual header + include vs notFound()",
      intro:
        "A blog post lookup misses. Both versions must send a real 404 status, show a friendly page, and stop rendering the rest.",
      php: `<?php // blog-post.php
$stmt = $pdo->prepare('SELECT * FROM posts WHERE slug = ?');
$stmt->execute([$_GET['slug']]);
$post = $stmt->fetch();

if (!$post) {
    http_response_code(404);   // 1. status code
    include '404.php';         // 2. the view
    die();                     // 3. stop the script
}

echo '<h1>' . htmlspecialchars($post['title']) . '</h1>';`,
      ts: `// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { getPost } from '@/lib/posts';

export default async function Post({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) notFound(); // status + view + exit, in one throw

  // TS knows post is non-null here — notFound() returns never
  return <h1>{post.title}</h1>;
}

// app/blog/[slug]/not-found.tsx
export default function NotFound() {
  return <h2>That post doesn't exist.</h2>;
}`,
      note: "notFound() throws, so it bundles your three manual PHP steps into one call — and because it returns `never`, TypeScript narrows the type after the check.",
    },
    {
      label: "Error page: top-level try/catch vs error.tsx",
      intro:
        "The data layer throws. PHP wraps the whole script; Next.js declares a boundary file per segment, with a retry button PHP can't offer without a full reload.",
      php: `<?php // index.php — front controller
try {
    $page = route($_SERVER['REQUEST_URI']);
    echo $page->render();
} catch (Throwable $e) {
    error_log($e->getMessage());   // full detail to logs
    http_response_code(500);
    include '500.php';             // generic page to user
    // Recovery = user mashes F5 and re-runs everything
}`,
      ts: `// app/dashboard/error.tsx
'use client'; // mandatory — boundaries are Client Components

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div>
      <h2>Dashboard failed to load.</h2>
      <p>Reference: {error.digest}</p>
      <button onClick={() => unstable_retry()}>Try again</button>
    </div>
  );
}`,
      note: "The boundary is scoped: only the dashboard segment swaps to the fallback while the rest of the layout keeps working, and unstable_retry() re-fetches just that segment instead of reloading the page.",
    },
    {
      label: "Loading state: nothing vs loading.tsx",
      intro:
        "The page's query takes two seconds. What does the user see during those two seconds?",
      php: `<?php // report.php
// The browser shows a blank page (or the previous page)
// for the full 2 seconds — PHP output arrives only when
// the whole script has finished.
$rows = $pdo->query(
    'SELECT * FROM big_report'   -- takes ~2s
)->fetchAll();

echo render_report($rows);`,
      ts: `// app/report/loading.tsx
export default function Loading() {
  return <div className="skeleton">Crunching the report…</div>;
}

// app/report/page.tsx
export default async function Report() {
  const rows = await getBigReport(); // takes ~2s
  return <ReportTable rows={rows} />;
}`,
      note: "Next streams the layout and skeleton instantly, then swaps in the page HTML when the await resolves — a state that simply cannot exist in the buffered PHP model.",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "The page throws during rendering and a sibling error.tsx is defined. Predict what the user actually sees in production — including what happens to the error message — then reveal the output.",
    code: `// app/invoices/page.tsx
export default async function Invoices() {
  const res = await fetch('https://api.internal/invoices');
  if (!res.ok) {
    // Suppose the API is down, so this throws on every request:
    throw new Error('billing-db timeout at 10.0.3.7:5432');
  }
  return <ul>…</ul>;
}

// app/invoices/error.tsx
'use client';

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <section>
      <h2>Could not load invoices</h2>
      <p>Message: {error.message}</p>
      <p>Ref: {error.digest}</p>
      <button onClick={() => unstable_retry()}>Try again</button>
    </section>
  );
}`,
    output: `Rendered UI (production build) — the layout stays intact, only the
/invoices segment swaps to the error fallback:

  <section>
    <h2>Could not load invoices</h2>
    <p>Message: An error occurred in the Server Components render. The
    specific message is omitted in production builds to avoid leaking
    sensitive details.</p>
    <p>Ref: 3145682013</p>
    <button>Try again</button>
  </section>

The real message ("billing-db timeout at 10.0.3.7:5432") appears only in
the SERVER logs, tagged with the same digest. Clicking "Try again" calls
unstable_retry(), which re-fetches and re-renders just this segment.
(In "next dev" you would see the real message in the browser too.)`,
  },

  keyPoints: [
    "`loading.tsx` wraps the sibling page in a `<Suspense>` boundary: the shell and skeleton stream immediately while the server awaits data — a state buffered PHP output can never show.",
    "`error.tsx` MUST start with `'use client'` — error boundaries are a client-side React mechanism, so a Server Component can't be one.",
    "In production, server error messages are redacted; you get `error.digest` to correlate with server logs. Dev shows the real message.",
    "Next 16 (16.2+) passes both `unstable_retry()` (re-fetch + re-render — usually what you want, note the `unstable_` prefix) and `reset()` (re-render only); Next 13–15 code only had `reset`.",
    "`notFound()` throws a special error and the nearest `not-found.tsx` renders with a real 404 status — `http_response_code(404) + include + die()` in one typed call that narrows `never`.",
    "An `error.tsx` does not catch its own segment's layout errors — those bubble to the parent boundary; root-layout failures need `global-error.tsx`, which must render its own `<html>` and `<body>`.",
  ],

  interview: [
    {
      q: "Why does error.tsx have to be a Client Component when everything else in the App Router defaults to server?",
      a: "Because React error boundaries are built on client-side component state — a boundary has to catch a render error, store 'I am in an error state', and later clear that state when the user retries. A Server Component renders once on the server and holds no state, so it can't do any of that. The `'use client'` directive is therefore mandatory in `error.js`, and Next enforces it. It's also a nice illustration of the general rule: anything interactive or stateful — `onClick`, `useState`, boundaries — lives on the client, while data work stays on the server.",
    },
    {
      q: "A user reports an error page in production but the message just says something went wrong. How do you find the actual error?",
      a: "By design, Next.js redacts server-side error messages in production so stack traces, connection strings, or SQL never leak into the browser. What does cross the wire is `error.digest` — a hash of the error. I'd render that digest in the error UI as a support reference, then grep the server logs (or the error-tracking service where I report errors from the boundary's `useEffect`) for the same digest to find the full message and stack. In development the real message is shown directly, so this workflow is production-specific.",
    },
    {
      q: "How does notFound() compare to how you handled 404s in PHP?",
      a: "In PHP a 404 was three manual steps: `http_response_code(404)`, include the 404 template, then `die()` so nothing else renders — and forgetting any one of them was a classic bug (a '404 page' served with status 200, or content leaking after the include). `notFound()` from `next/navigation` does all three at once: it throws, which stops rendering, and Next responds with a genuine 404 status and renders the nearest `not-found.tsx`. Bonus: it's typed as returning `never`, so after `if (!post) notFound()` TypeScript knows `post` is non-null — the control-flow exit is visible to the compiler.",
    },
    {
      q: "What's the difference between error.tsx and global-error.tsx, and when do you need the latter?",
      a: "`error.tsx` is a per-segment boundary: it catches errors thrown in that segment's page and below, and the nearest boundary up the tree wins. But a boundary can't catch an error thrown in its own segment's layout — that bubbles to the parent's boundary. So an error in the root layout has no parent to bubble to; that's what `global-error.tsx` is for. Because it replaces the entire root layout when active, it has to render its own `<html>` and `<body>` tags, and like every boundary it's a Client Component. In practice it's a minimal 'the whole app crashed' page you hope no one ever sees.",
    },
  ],

  quiz: [
    {
      question: "What does dropping a loading.tsx file into a route segment actually do?",
      options: [
        "Registers a global spinner shown on every navigation in the app",
        "Wraps the segment's page in a Suspense boundary so the fallback streams instantly while the page awaits its data",
        "Delays rendering until all data is ready, then shows the page and the loader together",
        "Adds a client-side progress bar driven by fetch events",
      ],
      answerIndex: 1,
      explain:
        "loading.tsx is sugar for a <Suspense> boundary around page.tsx. The layout plus fallback are streamed to the browser immediately; when the async page resolves, its HTML streams in and replaces the fallback. It's per-segment, not global.",
    },
    {
      question: "In a production build, what does the `error` prop inside error.tsx contain when a Server Component throws?",
      options: [
        "The original Error object with full message and stack trace",
        "A serialized JSON copy of the server exception",
        "A generic message with the real one redacted, plus a `digest` hash for matching server logs",
        "null — errors are only available in development",
      ],
      answerIndex: 2,
      explain:
        "Server errors are redacted before being sent to the client so sensitive details never leak. The `digest` property survives, and the same digest appears in the server-side logs — that's your correlation key. In dev you see the real message.",
    },
    {
      question: "A component inside app/dashboard/layout.tsx throws. Which file catches it?",
      options: [
        "app/dashboard/error.tsx",
        "app/dashboard/not-found.tsx",
        "The error.tsx of the parent segment (e.g. app/error.tsx)",
        "Nothing — layout errors always crash the whole app",
      ],
      answerIndex: 2,
      explain:
        "A segment's error.tsx wraps the page and children, not the layout of the same segment — the boundary sits inside the layout. A layout error therefore bubbles up to the parent segment's boundary; only a root-layout error needs global-error.tsx.",
    },
    {
      question: "What is the difference between the unstable_retry() and reset() props in a Next.js 16 error boundary?",
      options: [
        "unstable_retry() re-fetches data and re-renders the segment; reset() re-renders without re-fetching",
        "They are aliases — both do a full page reload",
        "reset() clears the Router Cache; unstable_retry() clears the Data Cache",
        "unstable_retry() only works in development; reset() only in production",
      ],
      answerIndex: 0,
      explain:
        "Next 16 (16.2+) passes both: unstable_retry() attempts real recovery by re-fetching and re-rendering the failed children (the docs' recommended default), while reset() just clears the error state and re-renders with what's already there. Note the `unstable_` prefix on the prop. Pre-16 code only received reset.",
    },
  ],
};

export default lesson;
