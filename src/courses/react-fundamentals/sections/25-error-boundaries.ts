import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "error-boundaries",
  title: "Error Boundaries",
  part: "Patterns & Production",
  estMinutes: 12,
  summary:
    "An uncaught render error unmounts the entire React tree — error boundaries catch errors from the components below them and swap in a fallback, keeping the rest of the page alive.",

  concept: `
Throw during render with nothing to catch it, and React **unmounts the whole
tree**. The user gets a blank page — the React equivalent of a PHP fatal with
\`display_errors\` off: white screen, no message, nothing left to click. One
bad \`comments[0].author.name\` in a footer widget takes down the checkout
form above it. Error boundaries are how you contain that blast radius.

### The class-component survivor

An error boundary is a component that catches errors thrown during rendering
by anything below it in the tree, and renders a fallback instead. Here is the
one legitimate reason you will still write a class component in 2026 —
**there is no hook equivalent**:

\`\`\`tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

class ErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };       // switch to fallback rendering
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info.componentStack); // log it somewhere real
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
\`\`\`

Two lifecycle methods split the job: \`static getDerivedStateFromError\`
updates state so the next render shows the fallback; \`componentDidCatch\`
is the side-effect slot for logging. Read it once, understand it, then don't
maintain your own.

### What you'd actually ship: react-error-boundary

\`\`\`tsx
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

function WidgetFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div role="alert">
      <p>This widget failed to load.</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

<ErrorBoundary
  FallbackComponent={WidgetFallback}
  onReset={() => refetchWidgetData()}
>
  <CommentsWidget />
</ErrorBoundary>
\`\`\`

The package wraps the class once and adds what production needs: a typed
\`FallbackComponent\` receiving \`error\` and \`resetErrorBoundary\`, an
\`onReset\` callback to clear the bad state before retrying, \`onError\` for
logging, and \`resetKeys\` to auto-reset when inputs change.

### What boundaries do NOT catch

- **Event handlers.** A click handler runs outside rendering — use ordinary
  \`try/catch\` there, like any PHP code.
- **Async code.** \`setTimeout\` callbacks and un-awaited promise rejections
  happen after render finished; nothing is on the render stack to catch them.
- **The boundary's own render.** Errors travel *up* — a boundary can't catch
  itself, only the tree below it.

One important async exception: with Suspense, a **rejected promise read by
\`use(promise)\`** propagates to the nearest error boundary. Boundary +
Suspense is the full pattern — the boundary is the \`'error'\` branch, the
fallback is the \`'loading'\` branch, and the component renders only success.

### Root-level hooks for what's left

React 19's \`createRoot\` takes error-handling options for everything that
reaches the top:

\`\`\`ts
createRoot(document.getElementById('root')!, {
  onUncaughtError: (error, info) => sendToSentry(error, info),
  onCaughtError: (error, info) => logBoundaryCatch(error, info),
});
\`\`\`

\`onUncaughtError\` fires for errors no boundary caught (the tree is still
unmounted — this is your last-chance logger, not a recovery path);
\`onCaughtError\` fires when some boundary *did* catch, useful for central
telemetry. Place boundaries per independent region — each route, each
dashboard widget — so one failure degrades one box, not the app.
`,

  comparisons: [
    {
      label: "PHP exception handling vs an error boundary",
      intro:
        "Contain a failure and show something useful instead. PHP wraps the controller call in try/catch and swaps in an error template; React wraps the subtree in a boundary component and swaps in a fallback element.",
      php: `<?php
// index.php — front controller
try {
    $controller = new CommentsController($pdo);
    $html = $controller->show((int) $_GET['post']);
    echo $html;
} catch (Throwable $e) {
    // Log it, render the error partial instead —
    // the rest of the page around it still renders.
    error_log($e->getMessage());
    http_response_code(500);
    require 'views/partials/widget-error.php';
}`,
      ts: `// PostPage.tsx
import { ErrorBoundary } from 'react-error-boundary';

function PostPage({ postId }: { postId: number }) {
  return (
    <article>
      <PostBody postId={postId} />

      <ErrorBoundary
        FallbackComponent={WidgetFallback}
        onError={(error, info) =>
          reportError(error, info.componentStack)
        }
      >
        <CommentsWidget postId={postId} />
      </ErrorBoundary>
    </article>
  );
}
// CommentsWidget throwing during render swaps in
// WidgetFallback; PostBody is untouched.`,
      note: "Same instinct, different mechanism: PHP catches on the call stack at the call site; React catches in the component tree, so the boundary is a COMPONENT you position around the region you're willing to lose.",
    },
    {
      label: "No boundary vs granular boundaries",
      intro:
        "A dashboard where one widget throws on render. Without a boundary the whole tree unmounts to a blank page; with per-widget boundaries only the broken widget degrades.",
      php: `// Dashboard.tsx — no boundaries anywhere
function Dashboard() {
  return (
    <main>
      <RevenueChart />   {/* fine */}
      <OrdersTable />    {/* fine */}
      <NewsFeed />       {/* throws: feed[0].title of undefined */}
    </main>
  );
}

// One uncaught render error and React unmounts the
// ENTIRE tree — charts, table, nav, everything.
// The user sees a blank page: a PHP fatal with
// display_errors off, in the browser.`,
      ts: `// Dashboard.tsx — each region owns its blast radius
function Dashboard() {
  return (
    <main>
      <ErrorBoundary FallbackComponent={WidgetFallback}>
        <RevenueChart />
      </ErrorBoundary>

      <ErrorBoundary FallbackComponent={WidgetFallback}>
        <OrdersTable />
      </ErrorBoundary>

      <ErrorBoundary FallbackComponent={WidgetFallback}>
        <NewsFeed />   {/* still throws... */}
      </ErrorBoundary>
    </main>
  );
}

// ...but now the chart and table keep working; only
// the news box shows "This widget failed to load."`,
      note: "Boundary placement is a product decision: wrap each independently useful region. A checkout page might want one boundary around the whole flow; a dashboard wants one per widget.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Read and predict: BrokenWidget throws during render, HealthyWidget doesn't. The boundary wraps only BrokenWidget. What does the page show, and what would change if the boundary were removed?",
    code: `import { Component, type ReactNode } from 'react';

class Boundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function BrokenWidget() {
  const stats: { views: number }[] = [];
  // stats[0] is undefined — this THROWS during render:
  return <p>Views today: {stats[0].views}</p>;
}

function HealthyWidget() {
  return <p>Orders today: 17</p>;
}

export default function Dashboard() {
  return (
    <main>
      <h1>Dashboard</h1>
      <Boundary fallback={<p role="alert">Stats unavailable.</p>}>
        <BrokenWidget />
      </Boundary>
      <HealthyWidget />
    </main>
  );
}`,
    output: `BrokenWidget throws TypeError (reading 'views' of undefined)
during render. The error travels UP the tree and hits <Boundary>:
getDerivedStateFromError sets hasError, and the boundary renders
its fallback instead of its children. The rest of the tree is
untouched. Rendered page:

  <h1>Dashboard</h1>
  <p role="alert">Stats unavailable.</p>
  <p>Orders today: 17</p>

Without the boundary, the same throw would reach the root with
nothing to catch it: React unmounts the ENTIRE tree and the user
gets a blank page — heading and healthy widget included.
(In development, React also logs the error and component stack
to the console either way.)`,
  },

  keyPoints: [
    "An uncaught render error unmounts the whole React tree — a blank page, like a PHP fatal with display_errors off. Boundaries contain the blast radius.",
    "Error boundaries are THE legitimate class-component survivor: `static getDerivedStateFromError` (switch to fallback) + `componentDidCatch` (log) — there is no hook equivalent.",
    "In practice, ship the `react-error-boundary` package: `<ErrorBoundary FallbackComponent={...} onReset={...}>` with typed `FallbackProps` (`error`, `resetErrorBoundary`).",
    "Boundaries only catch errors thrown during rendering below them — NOT event handlers (use try/catch) and NOT async callbacks like setTimeout.",
    "Exception that proves the pairing: a rejected promise read with `use(promise)` propagates to the nearest error boundary — boundary + Suspense = error branch + loading branch, externalized.",
    "React 19's `createRoot(container, { onUncaughtError, onCaughtError })` gives root-level logging for errors that no boundary caught and for boundary catches, respectively.",
  ],

  interview: [
    {
      q: "What is an error boundary, and why does it still require a class component?",
      a: "It's a component that catches errors thrown during rendering by the tree below it and renders a fallback instead — without one, a single render error unmounts the entire React tree and the user sees a blank page. The catching mechanism is two class lifecycle methods: `static getDerivedStateFromError` returns state that flips the component into fallback mode, and `componentDidCatch` receives the error plus the component stack for logging. React has never shipped hook equivalents of those, so this is the one place classes remain required. In practice I don't hand-roll it: the `react-error-boundary` package wraps the class once and exposes a function-component-friendly API — `FallbackComponent`, `onError`, `onReset`, `resetKeys` — with a `resetErrorBoundary` callback so the user can retry.",
    },
    {
      q: "What kinds of errors do error boundaries NOT catch, and what do you do about those?",
      a: "They only catch errors thrown during rendering (and lifecycles) below them. Event handlers aren't caught — a click handler runs outside the render phase, so I use ordinary try/catch there, exactly like any other imperative code. Asynchronous callbacks — setTimeout, un-awaited promise rejections — aren't caught either, because by the time they fire the render stack is gone; those need their own handling, typically converting the failure into state so the next render can show it. One deliberate exception: a rejected promise read via React 19's `use(promise)` does propagate to the nearest boundary, which is what makes the Suspense-plus-boundary pattern complete. And for whatever still escapes, React 19's `createRoot` accepts `onUncaughtError` and `onCaughtError` options for centralized telemetry.",
    },
    {
      q: "How do you decide where to place error boundaries in an app?",
      a: "By blast radius: I wrap each region that should fail independently. A dashboard gets a boundary per widget so a broken news feed degrades to one 'failed to load' box while charts and tables keep working; a route-level boundary above that catches anything page-wide; and the root boundary is the last resort with a generic 'something went wrong' screen. The granularity is a product decision, not a technical one — on a checkout flow I might deliberately use one boundary around the whole flow, because half a broken checkout is worse than a clear failure. I pair boundaries with Suspense at the same seams, so each region has both its loading fallback and its error fallback defined together, and wire `onReset` to clear or refetch the data that caused the throw.",
    },
  ],

  quiz: [
    {
      question: "A component deep in the tree throws during render and no error boundary exists anywhere. What does the user see?",
      options: [
        "The broken component renders as empty; the rest of the page is fine",
        "A blank page — React unmounts the entire tree",
        "React retries the render three times, then shows a default error screen",
        "The last successful render stays frozen on screen",
      ],
      answerIndex: 1,
      explain:
        "With no boundary to catch it, React unmounts the whole tree — the framework won't leave possibly-corrupt UI on screen. That's the blank-page fatal that boundaries exist to contain; there is no built-in retry or default error UI.",
    },
    {
      question: "Which error will an error boundary catch?",
      options: [
        "A throw inside a button's onClick handler",
        "A rejection inside a setTimeout callback",
        "A TypeError thrown while a child component renders",
        "A network error logged by fetch in an event handler",
      ],
      answerIndex: 2,
      explain:
        "Boundaries catch errors thrown during rendering of the tree below them. Event handlers and async callbacks run outside the render phase — use try/catch or turn the failure into state. (The special case: a rejected promise read via use() does propagate to a boundary.)",
    },
    {
      question: "Why does writing an error boundary require a class component in 2026?",
      options: [
        "Classes render faster when errors occur",
        "The catching lifecycles — static getDerivedStateFromError and componentDidCatch — have no hook equivalents",
        "Function components cannot hold the hasError state",
        "It doesn't — useErrorBoundary ships with React 19",
      ],
      answerIndex: 1,
      explain:
        "The two lifecycle methods that intercept a descendant's render error exist only on classes; React 19 did not add a hook version. Function components hold state fine — that's not the limitation. The practical move is the react-error-boundary package, which hides the class behind a modern API.",
    },
    {
      question: "In React 19, what do the createRoot options onUncaughtError and onCaughtError do?",
      options: [
        "They prevent the tree from unmounting on any error",
        "onUncaughtError fires for errors no boundary caught; onCaughtError fires when a boundary did catch — both for centralized logging",
        "They replace error boundaries entirely",
        "They catch errors in event handlers and async code",
      ],
      answerIndex: 1,
      explain:
        "They are root-level observation hooks, not recovery: an uncaught error still unmounts the tree, but onUncaughtError lets you log it, and onCaughtError gives central telemetry for boundary catches. Boundaries remain the recovery mechanism.",
    },
  ],
};

export default lesson;
