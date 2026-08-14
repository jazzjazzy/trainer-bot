import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "suspense-and-use",
  title: "Suspense and the use API",
  part: "Advanced Hooks & Data",
  estMinutes: 12,
  summary:
    "Suspense moves loading state out of every component and into one boundary above them; React 19's use(promise) is the client-side trigger — it reads a promise's value and suspends until it resolves.",

  concept: `
Every data-fetching component so far has carried its own loading state: a
status union, an \`isPending\` check, an early-return spinner. Multiply that by
a dashboard with six widgets and you get spinner soup — six components each
asking "am I ready?" **Suspense inverts the question**: components lower down
simply *suspend* while their data is pending, and one boundary above decides
what to show in the meantime.

### The boundary

\`\`\`tsx
<Suspense fallback={<PageSkeleton />}>
  <UserHeader />
  <CommentList />
</Suspense>
\`\`\`

\`<Suspense>\` is a built-in component. While *anything* beneath it is
suspended, React renders the \`fallback\`; the moment everything below is
ready, the real content appears. The children don't render a loading state —
they don't even know one exists. In PHP terms it's the difference between
every include checking \`if (!$data) show_spinner()\` and the front controller
holding back the page until the parts are ready — except React can hold back
*one region* while the rest of the page is live.

### \`use(promise)\`: the trigger

What makes a component suspend? On the client, the verified React 19 answer
is the \`use\` API:

\`\`\`tsx
import { use } from 'react';

function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise); // suspends until resolved
  return <ul>{comments.map((c) => <li key={c.id}>{c.text}</li>)}</ul>;
}
\`\`\`

\`use\` reads a promise's resolved value. If the promise is still pending, the
component suspends and the nearest \`<Suspense>\` boundary shows its fallback;
when it resolves, React retries the render and \`comments\` is the plain,
awaited value — no \`.then\`, no status union. If the promise *rejects*, the
error propagates to the nearest error boundary.

Unusually, \`use\` is not bound by the Rules of Hooks: you **may call it inside
conditionals and loops**. \`if (preview) return <Teaser />;\` before a \`use\`
call is legal — something you could never do with \`useContext\` or
\`useState\`. (\`use\` also reads a context: \`use(ThemeContext)\` is equivalent
to \`useContext(ThemeContext)\`, minus the top-level-only restriction.)

### Caveat 1: the promise must be stable

Do **not** create the promise during render:

\`\`\`tsx
function Comments() {
  const comments = use(fetchComments()); // ❌ new promise every render
}
\`\`\`

Every render makes a *fresh* promise, which is pending, so the component
suspends, which causes a re-render later, which makes another fresh promise —
an endless fallback loop. React warns: "A component was suspended by an
uncached promise." The promise must come from outside render (created in a
parent event, a route loader) or from a cache that returns the *same* promise
instance for the same input.

### Caveat 2: this arrives via frameworks

That caching requirement is why, in real apps, Suspense data fetching comes
through infrastructure: React Server Components pass promises from server to
client, routers create them in loaders, and TanStack Query ships
\`useSuspenseQuery\` — same query cache, but pending queries suspend instead
of returning \`isPending\`. What you need at read-level: recognize the
boundary/fallback mechanics, know \`use(promise)\` is the client-side trigger,
and know why a promise created in render loops forever.
`,

  comparisons: [
    {
      label: "Manual status rendering vs use + Suspense",
      intro:
        "A comments widget. On the left the component owns its loading UI via a status union; on the right the component reads the value directly with use() and the boundary above owns the loading UI.",
      php: `// Comments.tsx — the component tracks its own loading
function Comments({ postId }: { postId: number }) {
  const state = useComments(postId); // FetchState<Comment[]>

  switch (state.status) {
    case 'loading':
      return <Spinner />;            // loading UI lives HERE
    case 'error':
      return <p role="alert">{state.error.message}</p>;
    case 'success':
      return (
        <ul>
          {state.data.map((c) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
      );
  }
}`,
      ts: `// Comments.tsx — the component just reads the value
import { use, Suspense } from 'react';

function Comments({ commentsPromise }: {
  commentsPromise: Promise<Comment[]>;
}) {
  // Suspends while pending; on resolve, it's the plain value.
  const comments = use(commentsPromise);
  return (
    <ul>
      {comments.map((c) => (
        <li key={c.id}>{c.text}</li>
      ))}
    </ul>
  );
}

function Post({ commentsPromise }: {
  commentsPromise: Promise<Comment[]>;
}) {
  return (
    <Suspense fallback={<Spinner />}> {/* loading UI lives HERE */}
      <Comments commentsPromise={commentsPromise} />
    </Suspense>
  );
}`,
      note: "The status union moves out of the component: use() hands back the resolved value or suspends, the boundary above renders the fallback, and a rejected promise routes to the nearest error boundary instead of an 'error' branch.",
      leftLang: "tsx",
    },
    {
      label: "Spinner soup vs one boundary",
      intro:
        "A profile page with three data widgets. On the left each widget renders its own spinner and the page flickers piecemeal; on the right one boundary shows a single skeleton until the region is ready.",
      php: `// ProfilePage.tsx — three widgets, three spinners
function ProfilePage({ userId }: { userId: number }) {
  return (
    <main>
      {/* Each renders <Spinner /> on its own schedule: */}
      <UserHeader userId={userId} />   {/* pops in at 120ms */}
      <ActivityFeed userId={userId} /> {/* pops in at 300ms */}
      <FriendsList userId={userId} />  {/* pops in at 180ms */}
      {/* Three layout shifts as each one lands. */}
    </main>
  );
}`,
      ts: `// ProfilePage.tsx — one boundary, one skeleton
function ProfilePage({ userId }: { userId: number }) {
  return (
    <main>
      <Suspense fallback={<ProfileSkeleton />}>
        {/* All three suspend into the SAME boundary; the
            region appears as one unit when all are ready. */}
        <UserHeader userId={userId} />
        <ActivityFeed userId={userId} />
        <FriendsList userId={userId} />
      </Suspense>
    </main>
  );
}

// Want the header early but the feed grouped? Nest boundaries:
// <Suspense fallback={<HeaderSkeleton />}>
//   <UserHeader userId={userId} />
//   <Suspense fallback={<FeedSkeleton />}>
//     <ActivityFeed userId={userId} />
//     <FriendsList userId={userId} />
//   </Suspense>
// </Suspense>`,
      note: "Boundary placement is a design decision, not plumbing: one boundary = the region appears atomically; nested boundaries = deliberate reveal stages. Either way, no widget carries its own isLoading.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Read and predict: Page wraps Comments in a Suspense boundary; Comments reads a promise (created once, outside render) with use(). What appears at t=0, and what happens when the promise resolves at t≈800ms?",
    code: `import { use, Suspense } from 'react';

type Comment = { id: number; text: string };

// Created ONCE at module level — stable across renders.
// (Created inside render, this would suspend forever.)
const commentsPromise: Promise<Comment[]> = new Promise((resolve) =>
  setTimeout(
    () =>
      resolve([
        { id: 1, text: 'First!' },
        { id: 2, text: 'Suspense makes sense now.' },
      ]),
    800,
  ),
);

function Comments({ promise }: { promise: Promise<Comment[]> }) {
  console.log('Comments: attempting render');
  const comments = use(promise); // t=0: pending -> suspend
  console.log('Comments: rendered with data');
  return (
    <ul>
      {comments.map((c) => (
        <li key={c.id}>{c.text}</li>
      ))}
    </ul>
  );
}

export default function Page() {
  return (
    <section>
      <h1>Post title</h1>
      <Suspense fallback={<p>Loading comments…</p>}>
        <Comments promise={commentsPromise} />
      </Suspense>
    </section>
  );
}`,
    output: `t=0 — initial render:
  console: "Comments: attempting render"
  use(promise) finds it pending -> Comments suspends.
  The nearest boundary renders its fallback:

    <h1>Post title</h1>
    <p>Loading comments…</p>

  (The h1 is OUTSIDE the boundary, so it shows immediately.)

t≈800ms — the promise resolves; React retries Comments:
  console: "Comments: attempting render"
  console: "Comments: rendered with data"
  The fallback is replaced by the real content:

    <h1>Post title</h1>
    <ul>
      <li>First!</li>
      <li>Suspense makes sense now.</li>
    </ul>`,
  },

  keyPoints: [
    "Suspense inverts loading state: children suspend while pending, and one `<Suspense fallback={...}>` boundary above decides what renders in the meantime.",
    "`use(promise)` (React 19) reads a promise's resolved value — pending suspends to the nearest boundary, rejection propagates to the nearest error boundary.",
    "Unlike hooks, `use` may be called inside conditionals and loops; it also reads context (`use(ThemeContext)`).",
    "The promise must be stable: created outside render or cached. A new promise each render means suspend → re-render → new promise — an endless fallback loop, and React warns about the uncached promise.",
    "Boundary placement is UI design: one boundary reveals a region atomically; nested boundaries stage the reveal deliberately.",
    "In production, Suspense data fetching arrives via frameworks and libraries — RSC, router loaders, TanStack Query's useSuspenseQuery — not hand-cached promises.",
  ],

  interview: [
    {
      q: "What problem does Suspense solve compared to isLoading flags in every component?",
      a: "It decouples *where data is read* from *where loading UI is decided*. With manual flags, every data-bound component carries a status union and an early-return spinner, so a page with six widgets flickers in six stages and the loading design is smeared across six files. With Suspense, components just read their data — via `use(promise)` on the client — and suspend if it isn't ready; a `<Suspense fallback>` boundary above renders the placeholder for the whole region. That turns loading UX into a layout decision: one boundary reveals the region atomically, nested boundaries stage the reveal. The child components get simpler too, because the success path is the only path they render.",
    },
    {
      q: "How does the use API differ from a regular hook?",
      a: "Two ways. First, capability: `use` reads a *resource* — pass it a promise and it returns the resolved value, suspending the component until it's ready; pass it a context and it behaves like `useContext`. Second, rules: `use` is exempt from the top-level-only restriction, so I can call it inside an `if` or a loop, or after an early return — impossible with `useState` or `useContext`. The constraint it does have is promise identity: the promise must be stable across renders, coming from outside render or a cache. If you create a fresh promise during render, each retry produces a new pending promise and the component suspends forever — React warns that a component was suspended by an uncached promise.",
    },
    {
      q: "Why shouldn't you call use(fetchComments()) directly in a component's render?",
      a: "Because `fetchComments()` runs on every render and returns a brand-new promise each time. The first render suspends on it; when the original resolves, React retries the render — which calls `fetchComments()` again, producing another pending promise, so the component suspends again. The fallback never goes away and you may be firing a new network request per attempt. React detects this and warns about an uncached promise. The fix is stability: create the promise outside render — in a parent's event handler, a route loader, a Server Component — or behind a cache keyed by input that returns the same promise instance. That's exactly the service that Suspense-aware libraries like TanStack Query's useSuspenseQuery provide.",
    },
  ],

  quiz: [
    {
      question: "A component calls use(promise) and the promise is still pending. What happens?",
      options: [
        "use returns undefined and the component renders empty",
        "The component suspends and the nearest <Suspense> boundary shows its fallback until the promise resolves",
        "React throws an error that crashes the app",
        "The render blocks synchronously until the promise resolves",
      ],
      answerIndex: 1,
      explain:
        "Suspending is the mechanism: React pauses that subtree, renders the nearest boundary's fallback, and retries the component when the promise settles. A rejected promise instead propagates to the nearest error boundary.",
    },
    {
      question: "Which of these is use() allowed to do that ordinary hooks are not?",
      options: [
        "Be called during the render phase",
        "Be called inside an if statement or a loop",
        "Trigger a re-render",
        "Read component props",
      ],
      answerIndex: 1,
      explain:
        "use is explicitly exempt from the top-level-only Rule of Hooks — conditional and looped calls are supported. Everything else listed is unremarkable; the conditional-call exemption is what sets use apart.",
    },
    {
      question: "Why does `const data = use(fetchData())` inside render cause an endless loading state?",
      options: [
        "fetchData() is blocked by the browser inside components",
        "use only accepts promises created by React",
        "Each render creates a new pending promise, so every retry suspends again — the promise must be stable/cached across renders",
        "The Suspense boundary caches the first fallback forever",
      ],
      answerIndex: 2,
      explain:
        "The resolve of promise #1 triggers a retry that creates pending promise #2, and so on — the fallback never clears, and React warns about an uncached promise. Stable promises come from outside render or from a cache, which is what Suspense-enabled frameworks and libraries provide.",
    },
  ],
};

export default lesson;
