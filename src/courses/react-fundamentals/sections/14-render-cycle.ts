import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "render-cycle",
  title: "The Render Cycle: When and Why Components Re-render",
  part: "Effects, Refs & Rendering",
  estMinutes: 12,
  summary:
    "A render is React calling your function again — cheap, pure, and not the same as touching the DOM. Knowing exactly when that happens demystifies effects, refs, and memoization before you meet them.",

  concept: `
Before effects and memoization make any sense, one mental model has to be
solid: **a render is React calling your component function again.** Nothing
more mysterious than that. Your 25 years of PHP are an advantage here, because
you already reason about code that runs top-to-bottom, fresh, over and over.

### A render is a fresh "request"

Each render is like PHP handling a fresh request with the same script: the
function runs from the top, every local variable is recreated, and it returns
a description of the UI. Nothing survives from the previous run *except* what
React stores for you (state, refs). If you have ever explained to a junior why
\`$counter++\` in a PHP script doesn't persist between page loads, you already
understand why a plain local variable in a component resets every render — and
why state needs \`useState\`.

\`\`\`tsx
function Price({ amount }: { amount: number }) {
  const formatted = \`$\${amount.toFixed(2)}\`; // recreated every render
  return <span>{formatted}</span>;
}
\`\`\`

### Render phase vs commit phase

Rendering is **not** touching the DOM. React works in two phases:

1. **Render phase** — React calls your functions and collects the JSX they
   return: a cheap, in-memory description. It then diffs that description
   against the previous one.
2. **Commit phase** — React applies only the *differences* to the real DOM.
   If nothing changed for a node, the DOM node is not touched.

So "my component rendered again" does not mean "the browser repainted
everything". A component can render 50 times and cause zero DOM writes if its
output is identical. This is why re-renders are usually cheap and why
premature memoization is usually noise.

### What triggers a re-render — the two everyday triggers

- **Its state changed** — a \`setState\`/dispatch it owns was called with a new
  value.
- **Its parent re-rendered** — React re-renders children as part of rendering
  the parent, *regardless of whether their props changed*.

That second point surprises people: React does **not** watch props. "Props
changed" is not a trigger; it is a *consequence* of the parent rendering with
new values. By default a child re-renders with its parent even if its props
are identical (opting out is what \`React.memo\` is for, later). And an initial
render happens once at the root, when \`createRoot(...).render(...)\` mounts the
tree.

There is one more trigger you haven't met yet: a component that *consumes* a
context value re-renders when that value changes, even if neither its state nor
its parent changed — that's the whole point of context, and it comes later with
\`useContext\`. For everyday reasoning, though, the two triggers above are what
you reach for.

### Rendering must be pure

React assumes your component is a **pure function** of props and state: same
inputs, same JSX, and *no side effects during the call*. No mutating variables
that exist outside the function, no \`fetch\`, no \`document.title = ...\`, no
writing to \`localStorage\` — not during render. Side effects belong in event
handlers or effects, both of which run *outside* the render phase.

Why so strict? Because React reserves the right to call your function whenever
and however often it likes — twice, speculatively, or concurrently — precisely
*because* renders are supposed to be free of consequences.

### StrictMode: purity smoke-test in dev

\`<StrictMode>\` double-invokes your component functions **in development only**.
Pure components produce identical output twice and nothing observable happens.
Impure ones — incrementing a counter during render, pushing into an array —
visibly misbehave, which is the point: the bug surfaces on your machine
instead of in production. Production builds render once; StrictMode has zero
production cost.
`,

  comparisons: [
    {
      label: "A fresh request vs a fresh render",
      intro:
        "PHP re-executes the whole script per request; React re-executes the component function per render. In both, locals are recreated every time — persistence lives elsewhere (the DB / React's state).",
      php: `<?php // counter.php — runs fresh on every request
$greeting = 'Hello, ' . htmlspecialchars($_GET['name'] ?? 'guest');

// A local survives only until the response is sent:
$hits = 0;
$hits++; // always 1 — resets each request!

// Real persistence lives OUTSIDE the script:
$total = $pdo->query('SELECT hits FROM stats')->fetchColumn();

echo "<h1>$greeting</h1>";
echo "<p>Visit #$total</p>";`,
      ts: `// Counter.tsx — runs fresh on every render
function Counter({ name }: { name: string }) {
  const greeting = \`Hello, \${name}\`;

  // A local survives only until the function returns:
  let hits = 0;
  hits++; // always 1 — resets each render!

  // Real persistence lives OUTSIDE the function body,
  // in React's state storage:
  const [total, setTotal] = useState(0);

  return (
    <>
      <h1>{greeting}</h1>
      <button onClick={() => setTotal(total + 1)}>
        Visit #{total}
      </button>
    </>
  );
}`,
      note: "Same discipline you already have from PHP: the function body is stateless and re-runs from the top; anything that must survive between runs is stored outside it (a DB there, useState here).",
    },
    {
      label: "Side effect during render vs pure computation",
      intro:
        "A component wants to know how expensive its list rendering is. The impure version mutates an outer counter during render; the pure version computes everything from its inputs.",
      php: `// ListStats.tsx — IMPURE: mutates outside the render
let renderTally = 0; // module-level, shared, mutable

function ListStats({ items }: { items: string[] }) {
  renderTally++; // side effect DURING render
  // StrictMode double-invokes renders in dev, so this
  // counts 2, 4, 6… and dev/prod now disagree.
  return (
    <p>
      {items.length} items (render #{renderTally})
    </p>
  );
}`,
      ts: `// ListStats.tsx — PURE: same props in, same JSX out
function ListStats({ items }: { items: string[] }) {
  // Derived purely from props — recreated per render,
  // identical for identical inputs:
  const count = items.length;
  const longest = items.reduce(
    (a, b) => (b.length > a.length ? b : a),
    ""
  );

  return (
    <p>
      {count} items — longest: {longest}
    </p>
  );
}
// Render it twice, ten times, concurrently — the
// output is identical and nothing else in the app moved.`,
      note: "React may call your function any number of times, so rendering must have zero observable consequences — mutation during render is exactly the class of bug StrictMode's dev-only double render exists to expose.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A component boiled down to what it really is: a function from state to UI. The pure version returns identical output for identical state; the impure one drifts. Predict all six logs, then run it.",
    code: `// A render is a function call: state in, UI description out.

interface AppState {
  user: string;
  unread: number;
}

// PURE "component": everything derives from the input.
function renderApp(state: AppState): string {
  const badge = state.unread > 0 ? \` (\${state.unread})\` : "";
  return \`<header>Inbox\${badge} — \${state.user}</header>\`;
}

const state: AppState = { user: "jason", unread: 2 };

console.log("pure render #1: ", renderApp(state));
console.log("pure render #2: ", renderApp(state));
console.log("pure identical? ", renderApp(state) === renderApp(state));

// IMPURE "component": mutates the world during render.
let renderCount = 0;

function renderAppImpure(state: AppState): string {
  renderCount++; // side effect during render!
  return \`<header>Inbox #\${renderCount} — \${state.user}</header>\`;
}

console.log("impure render #1:", renderAppImpure(state));
console.log("impure render #2:", renderAppImpure(state));
console.log(
  "impure identical?",
  renderAppImpure(state) === renderAppImpure(state)
);

// Same state, different output — this is precisely the drift
// StrictMode's dev-only double-invocation is designed to expose.
// React is free to call your component extra times ONLY because
// pure renders make those extra calls unobservable.`,
  },

  keyPoints: [
    "A render is React calling your component function again — like PHP re-running a script per request, all locals are recreated; only `useState`/refs persist across runs.",
    "Render phase (call functions, diff the JSX descriptions) is separate from commit phase (apply only the differences to the real DOM) — rendering is not repainting.",
    "Two everyday re-render triggers: the component's own state changed, or its parent re-rendered. React does not watch props — 'new props' are a consequence of the parent rendering. (A consumed context value changing is a third trigger, covered later with `useContext`.)",
    "By default a child re-renders whenever its parent does, even with identical props; opting out of that is `React.memo`'s job, later.",
    "Rendering must be pure: no mutations of outside variables, no fetches, no DOM writes during the render call — side effects go in event handlers or effects.",
    "StrictMode double-invokes renders in development only, so impure components visibly misbehave on your machine; production renders once and pays nothing.",
  ],

  interview: [
    {
      q: "What causes a React component to re-render?",
      a: "Two everyday triggers: a state update the component owns — a setState or dispatch called with a new value — or its parent re-rendering, because React re-renders children as part of rendering the parent. Notably, React does not watch props; a child re-renders with its parent by default even if its props are byte-for-byte identical, and 'props changed' is a consequence of the parent's render, not an independent trigger. The initial mount at `createRoot().render()` is the mount case. There's also a third trigger once you reach context: a component that consumes a context value re-renders when that value changes, independent of its state or parent — which is exactly how context bypasses `React.memo`. Opting a child out of parent-driven re-renders is what `React.memo` is for, but the default is: parent renders, subtree renders.",
    },
    {
      q: "What's the difference between the render phase and the commit phase?",
      a: "The render phase is React calling component functions and collecting the JSX they return — a cheap, in-memory description of the UI — then diffing it against the previous description. The commit phase is where React actually touches the DOM, applying only the differences the diff found. So a re-render is not a repaint: a component can render many times with identical output and produce zero DOM writes. That separation is also why render must be pure — React may call the function speculatively or repeatedly during the render phase, and only the commit has real-world consequences.",
    },
    {
      q: "Why does React require rendering to be pure, and how does StrictMode help enforce it?",
      a: "React reserves the right to call your component function whenever and however often it wants — twice, out of order, or concurrently — and it can only do that safely if the call has no observable consequences. Pure means: same props and state produce the same JSX, and nothing outside the function is mutated during the call — no fetches, no `document.title`, no pushing into shared arrays. Side effects belong in event handlers or in effects, which run outside the render phase. StrictMode double-invokes renders in development: pure components are unaffected, while impure ones visibly drift — a counter jumping by two, duplicated array entries — surfacing the bug in dev where it's cheap to fix. It does nothing in production builds.",
    },
    {
      q: "As a PHP developer, what's a good mental model for React's render cycle?",
      a: "Each render is a fresh request handled by the same script. PHP re-executes the whole file per request: locals are recreated, and anything that must persist lives outside the script, in a database or session. A component function is the same — every render re-runs it from the top, every `const` is rebuilt, and persistence lives outside the function body in React's state storage via `useState`. The instinct PHP gives you — never expect a local to survive to the next request, keep the script's execution free of surprise side effects — transfers almost verbatim, and it makes hooks feel less magical: they're the 'session store' the function checks into on each run.",
    },
  ],

  quiz: [
    {
      question:
        "A parent component re-renders. Its child receives the exact same props as last time. What happens to the child?",
      options: [
        "It skips rendering because React compares props automatically",
        "It re-renders anyway — children render with their parent by default",
        "It renders only if it has its own state",
        "It throws unless wrapped in React.memo",
      ],
      answerIndex: 1,
      explain:
        "React does not diff props to decide whether to call a child — rendering the parent means rendering its subtree. That's usually fine because renders are cheap and the commit phase only touches DOM that actually changed. React.memo is the explicit opt-out, not the default.",
    },
    {
      question: "Which of these is safe to do during render?",
      options: [
        "Incrementing a module-level counter to track renders",
        "Setting document.title to reflect the current state",
        "Computing a filtered copy of a props array with .filter()",
        "Starting a fetch for the data the component needs",
      ],
      answerIndex: 2,
      explain:
        "Render must be pure: deriving new values from props and state — like filtering into a new array — is exactly what it's for. Mutating outside variables, writing to the DOM, and firing requests are side effects, which belong in event handlers or effects because React may call your function extra times.",
    },
    {
      question:
        "In development, a component's console.log runs twice per render and a naive render-counter counts double. What's going on?",
      options: [
        "A bug in the component causing an extra state update",
        "React 19 always renders twice for hydration",
        "StrictMode intentionally double-invokes renders in dev to expose impure rendering",
        "The bundler is including the component twice",
      ],
      answerIndex: 2,
      explain:
        "StrictMode double-invokes component functions in development as a purity smoke test: pure components produce identical results and nothing observable changes, while impure ones (like that render-counter) visibly drift. Production builds are unaffected — never 'fix' this by removing logic, fix the impurity.",
    },
  ],
};

export default lesson;
