import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-and-interview",
  title: "Cheatsheet and Interview Prep",
  part: "Patterns & Production",
  estMinutes: 14,
  summary:
    "The whole course compressed: a hooks decision table, the render mental model in five bullets, the footgun list, the React 19 headlines to name-drop, and a PHP-to-React translation card.",

  concept: `
### The hooks decision table

| You need… | Reach for |
| --- | --- |
| A value that changes and the UI must follow | \`useState\` |
| Several related values updated by a fixed set of events | \`useReducer\` |
| A value that survives renders but must NOT trigger them (DOM node, timer id) | \`useRef\` |
| The same value in many distant components, no prop drilling | context (\`createContext\` + \`useContext\`/\`use\`) |
| A stable function/object identity, or a provably expensive computation | \`useCallback\` / \`useMemo\` — only when a memoized child or measured cost demands it |
| To synchronize with something *outside* React (subscription, widget, network) | \`useEffect\` — and only then |

On memoization: the React Compiler now automates most manual \`useMemo\`/
\`useCallback\`, but interviewers still expect you to do it by hand and to
know *why* it works (dependency comparison via \`Object.is\`).

### The render mental model, five bullets

1. A render is just React **calling your function**; the JSX is its return value.
2. \`setState\` doesn't change anything in place — it **requests a re-render**; each render sees its own snapshot of state and props.
3. React **diffs** the new element tree against the previous one — matching list children **by key** — and patches only what changed in the real DOM.
4. Effects run **after** commit; each re-run is preceded by the previous effect's cleanup, and unmount runs the final cleanup.
5. Data flows **down** through props; events flow **up** through callbacks. A parent's re-render re-renders its children by default — \`memo\` opts out.

### The footgun list

- **Index as key** on reorderable lists — state and DOM stick to positions, not items.
- **Mutating state** (\`items.push(x)\`) — same reference, no re-render; always produce new objects/arrays.
- **Effects for derived state** — if it can be computed from props/state, compute it during render; no effect, no extra state.
- **Missing/lied-about effect dependencies** — stale closures, especially in timers and subscriptions.
- **Inline object/array/function props defeating \`memo\`** — new identity every render; stabilize with \`useMemo\`/\`useCallback\` where it matters.
- **Fetching without cleanup** — race conditions when responses land out of order; abort or ignore stale results (or use a query library).

### React 19 headlines to name in interviews

- **\`ref\` is a normal prop** on function components — \`forwardRef\` is no longer needed and is headed for deprecation.
- **\`<MyContext value={...}>\`** renders directly as the provider — \`<MyContext.Provider>\` is the legacy spelling.
- **The \`use\` API** reads a promise (suspending until it resolves) or a context — and unlike hooks it may be called conditionally.
- **Actions**: pass a function to \`<form action={fn}>\`; \`useActionState\` (in \`react\`) manages pending/error/result, \`useFormStatus\` (in \`react-dom\`) reads the enclosing form's state, \`useOptimistic\` covers optimistic UI.
- **Root error hooks**: \`createRoot(el, { onUncaughtError, onCaughtError })\`.

### The PHP developer's translation card

| PHP world | React world |
| --- | --- |
| Template file (\`.phtml\`) | JSX — the template is code |
| \`include 'partials/card.php'\` | \`<Card />\` — a typed, reusable component |
| Function parameters | Props (read-only, flow down) |
| \`$_SESSION\` — data surviving between requests | State — data surviving between renders |
| Front controller (\`index.php\`) | \`createRoot(document.getElementById('root'))\` |
| Layout with content blocks | A component rendering \`{children}\` |
| \`htmlspecialchars()\` everywhere | JSX escapes interpolated text by default |
| A fresh request re-runs the script | A re-render re-runs the component function |

The last row is your superpower: you've spent 25 years reasoning about code
that re-runs from the top with fresh data. That's exactly the discipline
React's render model rewards.
`,

  comparisons: [
    {
      label: "Passing a ref: forwardRef (legacy) vs ref as a prop (React 19)",
      intro:
        "A parent needs to focus an input inside a child component. Legacy React required wrapping the child in forwardRef; in React 19, ref is just a prop.",
      php: `// legacy (React 18 and earlier): forwardRef ceremony
import { forwardRef } from 'react';

const SearchInput = forwardRef(function SearchInput(props, ref) {
  return <input ref={ref} type="search" {...props} />;
});

// parent
const inputRef = useRef(null);
<SearchInput ref={inputRef} placeholder="Search…" />;
inputRef.current?.focus();`,
      ts: `// React 19: ref is a normal prop on function components
function SearchInput({
  ref,
  ...props
}: React.ComponentProps<'input'>) {
  return <input ref={ref} type="search" {...props} />;
}

// parent — identical usage, no wrapper needed
const inputRef = useRef<HTMLInputElement>(null);
<SearchInput ref={inputRef} placeholder="Search…" />;
inputRef.current?.focus();`,
      note:
        "forwardRef still works but is slated for deprecation — in new React 19 code, accept ref like any other prop; ComponentProps<'input'> already includes it.",
      leftLang: "jsx",
    },
    {
      label: "Providing context: .Provider (legacy) vs <Context> (React 19)",
      intro:
        "Share the current theme with a subtree. Same createContext, same consumers — only the provider spelling changed.",
      php: `// legacy spelling
const ThemeContext = createContext('light');

function App() {
  const [theme, setTheme] = useState('dark');
  return (
    <ThemeContext.Provider value={theme}>
      <Dashboard />
    </ThemeContext.Provider>
  );
}`,
      ts: `// React 19: the context itself is the provider
const ThemeContext = createContext<'light' | 'dark'>('light');

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  return (
    <ThemeContext value={theme}>
      <Dashboard />
    </ThemeContext>
  );
}

// consumers are unchanged:
const theme = useContext(ThemeContext);
// (or: const theme = use(ThemeContext) — legal even inside an if)`,
      note:
        "<MyContext.Provider> is the legacy spelling; React 19 renders <MyContext value={...}> directly as the provider. Reading is unchanged — useContext, or the more flexible use().",
      leftLang: "jsx",
    },
    {
      label: "Lifecycle thinking (classes) vs synchronization thinking (hooks)",
      intro:
        "Subscribe to a chat room while the component is on screen, switching rooms when the prop changes. The class splits one concern across three methods; the effect states it once.",
      php: `// class era: one concern, three lifecycle methods
class ChatRoom extends React.Component {
  componentDidMount() {
    this.conn = connect(this.props.roomId);
  }
  componentDidUpdate(prevProps) {
    if (prevProps.roomId !== this.props.roomId) {
      this.conn.close();               // easy to forget
      this.conn = connect(this.props.roomId);
    }
  }
  componentWillUnmount() {
    this.conn.close();
  }
  render() {
    return <Messages roomId={this.props.roomId} />;
  }
}`,
      ts: `// hooks era: one synchronization, stated once
function ChatRoom({ roomId }: { roomId: string }) {
  useEffect(() => {
    const conn = connect(roomId);
    return () => conn.close(); // cleanup covers BOTH
                               // room-switch and unmount
  }, [roomId]);

  return <Messages roomId={roomId} />;
}`,
      note:
        "Don't think 'mount/update/unmount' — think 'keep this external thing in sync with roomId'. The dependency array plus cleanup replaces all three lifecycle methods, and the room-switch case can't be forgotten.",
      leftLang: "jsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The whole render mental model in one run: part 1 simulates how React matches list children by key; part 2 builds useMemo by hand — cache a value, recompute only when a dependency fails Object.is. Predict every line, then run.",
    code: `// Capstone simulation: keys + memo-by-deps, the two ideas behind
// most React performance questions.

// ---- 1. Keyed reconciliation ------------------------------------
type Item = { key: string; label: string };

function diffChildren(prev: Item[], next: Item[]): string[] {
  const ops: string[] = [];
  const before = new Map(prev.map((it) => [it.key, it]));
  for (const it of next) {
    const old = before.get(it.key);
    if (!old) ops.push(\`mount   <li key="\${it.key}">\`);
    else if (old.label !== it.label) ops.push(\`update  <li key="\${it.key}"> text\`);
    else ops.push(\`keep    <li key="\${it.key}"> (DOM untouched)\`);
    before.delete(it.key);
  }
  for (const key of before.keys()) ops.push(\`unmount <li key="\${key}">\`);
  return ops;
}

const renderA: Item[] = [
  { key: 'a', label: 'Apples' },
  { key: 'b', label: 'Bread' },
];
// Next render: prepend coffee, rename bread. With STABLE keys,
// only the real changes touch the DOM:
const renderB: Item[] = [
  { key: 'c', label: 'Coffee' },
  { key: 'a', label: 'Apples' },
  { key: 'b', label: 'Rye bread' },
];

console.log('--- reconciliation by key ---');
for (const op of diffChildren(renderA, renderB)) console.log(op);
// (Index keys would have "updated" all three — try renumbering
// the keys to 0/1/2 in both arrays and re-running.)

// ---- 2. useMemo by hand ------------------------------------------
function createMemoCell<T>() {
  let deps: unknown[] | undefined;
  let value: T | undefined;
  return (compute: () => T, nextDeps: unknown[]): T => {
    const changed =
      !deps ||
      deps.length !== nextDeps.length ||
      deps.some((d, i) => !Object.is(d, nextDeps[i]));
    if (changed) {
      value = compute();
      deps = nextDeps;
    }
    return value as T;
  };
}

const memo = createMemoCell<number>();
let runs = 0;
const total = (prices: number[]) => {
  runs++;
  return prices.reduce((sum, p) => sum + p, 0);
};

const prices = [300, 950, 120];
console.log('--- memo by deps (Object.is) ---');
console.log('render 1:', memo(() => total(prices), [prices]));
console.log('render 2:', memo(() => total(prices), [prices]), '<- same reference: cached');

const newPrices = [...prices, 80]; // new array = new identity
console.log('render 3:', memo(() => total(newPrices), [newPrices]), '<- new reference: recomputed');
console.log(\`expensive total() ran \${runs}x for 3 renders\`);
// Moral: deps compare by Object.is — a fresh inline array/object
// every render defeats memoization even if its contents are equal.`,
  },

  keyPoints: [
    "Hooks table: `useState` for UI-driving values, `useReducer` for event-driven state machines, `useRef` for render-surviving values that shouldn't re-render, context for distant sharing, `useMemo`/`useCallback` only when identity or measured cost demands.",
    "Render model: a render is a function call; setState requests a re-render with a fresh snapshot; React diffs by key and patches minimally; effects run after commit with cleanup between runs.",
    "Footguns: index keys on reorderable lists, mutated state, effects for derivable data, missing effect deps, inline props defeating memo, un-cancelled fetches.",
    "React 19 headlines: ref as a normal prop (forwardRef obsolete), `<Context value>` as provider, the `use` API for promises/context, Actions with `useActionState` + `<form action>`, root-level error callbacks on createRoot.",
    "Translation card: template → JSX, include → component, function args → props, $_SESSION-between-requests → state-between-renders, front controller → createRoot, layout blocks → children.",
    "Your PHP instinct — code that re-runs top-to-bottom with fresh data every request — is exactly the right mental model for a React render.",
  ],

  interview: [
    {
      q: "Walk me through what happens when a component's state updates.",
      a: "Calling the setter doesn't mutate anything in place — it schedules a re-render, and React batches setters called in the same event into one pass. On that re-render, React calls my component function again; it sees the new state value as a fresh snapshot, and returns a new element tree. React then reconciles: it diffs the new tree against the previous one — matching components by type and position, and list children by key — and computes the minimal set of real-DOM mutations, which it applies in the commit phase. After commit, effects whose dependencies changed run, each preceded by its previous cleanup. Two consequences I always mention: state updates are asynchronous with respect to the code that triggered them (my local variable still holds the old snapshot), and a parent re-rendering re-renders children by default — that's normally cheap, and `memo` exists for when it isn't.",
    },
    {
      q: "When do you reach for useEffect — and when do you avoid it?",
      a: "useEffect is for synchronizing with systems outside React: subscriptions, browser APIs, non-React widgets, anything with a setup/teardown lifecycle — the cleanup function is half the API. I actively avoid it for the common misuses: derived state (if it's computable from props and state, compute it during render — no effect, no extra state), responding to user events (that logic belongs in the event handler), and transforming data for display. Client-side data fetching in an effect is legitimate but needs cleanup for out-of-order responses, which is why in production I'd usually let TanStack Query own that. My rule of thumb: if I can't name the external system the effect synchronizes with, I probably shouldn't be writing it.",
    },
    {
      q: "How do you fetch data in a React application?",
      a: "It depends on the architecture, and I'd give the ladder. In a client-only SPA the primitive is fetch-in-an-effect with cleanup for race conditions — worth knowing because it's the interview classic — but in production I reach for TanStack Query, which owns caching, deduplication, refetching, and the loading/error states as 'server state' distinct from UI state. React 19 adds `use(promise)` with Suspense, so a component can suspend on a cached promise and let the boundary render the fallback. And in a framework like Next.js, Server Components move fetching to the server entirely: an async component awaits the database directly and ships rendered HTML, with client islands for interactivity. Naming that spectrum — effect, query library, use/Suspense, RSC — is usually exactly what the interviewer is probing for.",
    },
    {
      q: "What changed in React 19?",
      a: "The headline is that a lot of ceremony became direct. `ref` is now a normal prop on function components, so `forwardRef` is no longer needed and is headed for deprecation. A context renders directly as its own provider — `<MyContext value={...}>` instead of `<MyContext.Provider>`. The new `use` API reads a promise (suspending until it resolves) or a context, and unlike hooks it can be called conditionally. Actions overhaul forms: you pass a function to `<form action={fn}>`, `useActionState` manages pending/error/result, `useFormStatus` reads form state from `react-dom`, and `useOptimistic` handles optimistic updates. There are also root-level error callbacks on `createRoot`. Alongside 19, the React Compiler automates most manual `useMemo`/`useCallback` work, though understanding hand-memoization is still expected knowledge.",
    },
  ],

  quiz: [
    {
      question:
        "A component needs to track how many times it has rendered, without causing extra renders. Which hook?",
      options: ["useState", "useMemo", "useRef", "useReducer"],
      answerIndex: 2,
      explain:
        "A ref is the render-surviving box that doesn't trigger re-renders — incrementing ref.current in the render (or an effect) records the count silently. useState would re-render on every increment, looping forever; useMemo caches computations, it doesn't persist counters.",
    },
    {
      question: "Which of these is a real React 19 change?",
      options: [
        "useEffect was removed in favor of lifecycles",
        "ref is a normal prop on function components, making forwardRef unnecessary",
        "Class components stopped working entirely",
        "JSX now requires importing React in every file",
      ],
      answerIndex: 1,
      explain:
        "React 19 passes ref like any other prop to function components; forwardRef still works but is slated for deprecation. Effects are very much alive, class components still run (and error boundaries still require one), and the automatic JSX runtime removed the React-import requirement years ago.",
    },
    {
      question:
        "A child wrapped in memo() re-renders every time its parent does, despite its data not changing. Most likely cause?",
      options: [
        "memo() only works on class components",
        "The parent passes an inline object/array/function prop, so its identity is new each render",
        "The child uses useState internally",
        "memo() requires the React Compiler to be enabled",
      ],
      answerIndex: 1,
      explain:
        "memo compares props with shallow equality (Object.is per prop). An inline literal like style={{...}} or onClick={() => ...} is a brand-new reference every parent render, so the comparison fails. Stabilize it with useMemo/useCallback, hoist it out, or restructure — the playground's part 2 is exactly this mechanism.",
    },
    {
      question:
        "On the PHP translation card, which pairing is correct?",
      options: [
        "$_SESSION → props",
        "Front controller (index.php) → createRoot(...)",
        "include 'partial.php' → useEffect",
        "htmlspecialchars() → dangerouslySetInnerHTML",
      ],
      answerIndex: 1,
      explain:
        "createRoot is the single entry point that boots the whole tree — the front controller of a React app. $_SESSION maps to state (data surviving between renders/requests), include maps to rendering a component, and JSX's default escaping is the htmlspecialchars analogue — dangerouslySetInnerHTML is the opt-out of it.",
    },
  ],
};

export default lesson;
