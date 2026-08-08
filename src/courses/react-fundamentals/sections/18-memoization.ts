import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "memoization",
  title: "useMemo, useCallback, and When Not to Use Them",
  part: "Effects, Refs & Rendering",
  estMinutes: 12,
  summary:
    "useMemo caches a value, useCallback caches a function identity, React.memo skips a child's render — and knowing when NOT to use them is half the interview answer.",

  concept: `
A component function re-runs on every render, recreating every local value.
Usually that's fine — renders are cheap. Sometimes it isn't: an expensive
computation re-runs pointlessly, or a recreated object/function reference
defeats an optimization downstream. React's memoization trio targets exactly
those cases.

### useMemo: cache a computed value

\`\`\`tsx
const visible = useMemo(
  () => items.filter(i => i.name.includes(query)), // runs only when needed
  [items, query],                                  // deps, compared with Object.is
);
\`\`\`

On re-render, React compares the deps to last time (\`Object.is\`, same as
effects). All equal → return the **cached value**, skip the function.
Anything changed → recompute and cache. It's the same idea as caching a
heavy query result in PHP (APCu/Redis) keyed by its inputs — except the
cache lives one render long per component instance, and each \`useMemo\` call
holds exactly one entry.

### useCallback: cache a function's identity

\`\`\`tsx
const handleSelect = useCallback((id: number) => {
  onSelect(id);
}, [onSelect]);
\`\`\`

\`useCallback(fn, deps)\` is literally \`useMemo(() => fn, deps)\` — it caches
the **function reference** itself, not a result. Why would identity matter?
Because functions are compared by reference: a fresh arrow function every
render looks "new" to anything doing an \`Object.is\` check — a memoized
child's props, or an effect's dependency array.

### React.memo: skip a child's re-render

\`\`\`tsx
const Row = memo(function Row({ item, onSelect }: RowProps) { ... });
\`\`\`

By default, when a parent renders, **all its children render too**.
\`memo(Component)\` changes that: if every prop is shallow-equal
(\`Object.is\`, prop by prop) to the previous render's, React reuses the last
output. And here's the coupling interviewers probe: pass
\`onSelect={id => ...}\` inline and the prop is a new function every render —
the memo never skips anything. \`React.memo\` on the child and \`useCallback\`
in the parent work as a pair.

### When NOT to memoize

The default is: **don't**. Reasons to reach for the trio — and you want a
*measured* or *structural* reason, not vibes:

1. A computation is provably expensive (profiled, not guessed).
2. A value/function feeds a \`memo\`'d child or a dependency array, so its
   **identity** matters.

Speculative memoization adds real cost: every \`useMemo\` stores deps and
value, compares arrays each render, and clutters the code. A \`useMemo\`
around \`items.length\` is slower than just computing it. Caveat for both
tools: they're **performance hints, not guarantees** — React may discard the
cache in some circumstances, so code must stay correct without it.

### The React Compiler footnote

The React Compiler (now stable, battle-tested at Meta) automates this: it
analyzes components
and inserts memoization automatically, making most hand-written \`useMemo\`/
\`useCallback\` unnecessary. Say that in an interview — *and* be able to do it
by hand, because the ecosystem is full of pre-compiler code and interviewers
still test the mechanics cold.
`,

  comparisons: [
    {
      label: "Expensive computation: every render vs useMemo",
      intro:
        "A product list filters 50,000 items by a search query. The component also has an unrelated 'dark mode' toggle — watch what each version does when only the theme changes.",
      php: `// ❌ ProductList.tsx — filter re-runs on EVERY render
function ProductList({ items }: { items: Product[] }) {
  const [query, setQuery] = useState('');
  const [dark, setDark] = useState(false);

  // Toggling dark mode re-renders this component,
  // and re-filters all 50,000 items for nothing:
  const visible = items.filter(i =>
    i.name.toLowerCase().includes(query.toLowerCase())
  );

  return <List items={visible} dark={dark} /* ... */ />;
}`,
      ts: `// ✅ ProductList.tsx — recompute only when inputs change
function ProductList({ items }: { items: Product[] }) {
  const [query, setQuery] = useState('');
  const [dark, setDark] = useState(false);

  // Dark-mode renders hit the cache; only a new items
  // array or new query re-runs the filter:
  const visible = useMemo(
    () => items.filter(i =>
      i.name.toLowerCase().includes(query.toLowerCase())
    ),
    [items, query],
  );

  return <List items={visible} dark={dark} /* ... */ />;
}`,
      note: "useMemo keys the cached result to [items, query] via Object.is — unrelated state changes reuse the cached array. Worth it here because the work is measurably heavy; don't wrap cheap expressions.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
    {
      label: "React.memo defeated by an inline handler vs stabilized with useCallback",
      intro:
        "Row is wrapped in React.memo so 5,000 rows don't re-render when the parent's unrelated state changes. Whether that works depends entirely on the parent.",
      php: `// ❌ Table.tsx — inline arrow defeats the memo
const Row = memo(function Row({ item, onSelect }: RowProps) {
  return <tr onClick={() => onSelect(item.id)}>…</tr>;
});

function Table({ items }: { items: Item[] }) {
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');

  // New function reference every render → every Row's
  // props are "different" → memo skips NOTHING:
  return items.map(item => (
    <Row key={item.id} item={item}
      onSelect={id => console.log('selected', id)} />
  ));
}`,
      ts: `// ✅ Table.tsx — stable identity makes memo effective
const Row = memo(function Row({ item, onSelect }: RowProps) {
  return <tr onClick={() => onSelect(item.id)}>…</tr>;
});

function Table({ items }: { items: Item[] }) {
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');

  // Same function reference across renders:
  const handleSelect = useCallback((id: number) => {
    console.log('selected', id);
  }, []);

  return items.map(item => (
    <Row key={item.id} item={item} onSelect={handleSelect} />
  ));
}`,
      note: "React.memo does a shallow Object.is check per prop — an inline arrow is a new reference every render, so the memo never fires. useCallback exists almost entirely to serve memo'd children and dependency arrays.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "useMemo in miniature, runnable: a one-slot cache that recomputes only when a dep fails Object.is against the previous render. Predict the computed/cache-hit sequence — render 4 is the trap.",
    code: `// useMemo in miniature: cache one value, recompute only when a
// dependency fails an Object.is comparison against last render's deps.

function createMemoSlot() {
  let lastDeps: unknown[] | null = null;
  let lastValue: unknown;

  return function memo<T>(compute: () => T, deps: unknown[]): T {
    const depsMatch =
      lastDeps !== null &&
      lastDeps.length === deps.length &&
      deps.every((dep, i) => Object.is(dep, (lastDeps as unknown[])[i]));

    if (depsMatch) {
      console.log('cache hit');
      return lastValue as T;
    }
    console.log('computed');
    lastValue = compute();
    lastDeps = deps;
    return lastValue as T;
  };
}

const useMemoSim = createMemoSlot();
const items = ['ale', 'bock', 'lager', 'stout'];
let query = 'a';

// Render 1: first run always computes.
let visible = useMemoSim(() => items.filter((i) => i.includes(query)), [items, query]);
console.log('render 1:', visible.join(', '));

// Render 2: same array reference, same string -> cache hit.
visible = useMemoSim(() => items.filter((i) => i.includes(query)), [items, query]);
console.log('render 2:', visible.join(', '));

// Render 3: query changed -> recompute.
query = 'o';
visible = useMemoSim(() => items.filter((i) => i.includes(query)), [items, query]);
console.log('render 3:', visible.join(', '));

// Render 4: same CONTENT, but a rebuilt array is a new reference -> miss.
const rebuilt = [...items];
visible = useMemoSim(() => rebuilt.filter((i) => i.includes(query)), [rebuilt, query]);
console.log('render 4:', visible.join(', '));`,
  },

  keyPoints: [
    "`useMemo(fn, deps)` returns a cached value while every dep passes `Object.is` against the previous render; any change re-runs `fn`.",
    "`useCallback(fn, deps)` is `useMemo(() => fn, deps)` — it caches the function's *identity*, which only matters to things that compare references: memo'd children and dependency arrays.",
    "`React.memo(Component)` skips a re-render when every prop is shallow-equal to last time — instantly defeated by inline object/array/function props.",
    "Default stance: don't memoize. Renders are cheap; add `useMemo`/`useCallback` only for measured cost or a referential-identity requirement.",
    "Memoization is a performance hint, not a semantic guarantee — React may discard caches, so components must render correctly without them.",
    "The React Compiler now automates most manual memoization, but hand-rolled `useMemo`/`useCallback`/`React.memo` remain required interview knowledge and fill existing codebases.",
  ],

  interview: [
    {
      q: "Explain the difference between useMemo, useCallback, and React.memo.",
      a: "They memoize three different things. `useMemo(fn, deps)` caches a computed *value* — on re-render, if every dep is `Object.is`-equal to last time, you get the cached result without re-running the function. `useCallback(fn, deps)` caches a *function reference* — it's equivalent to `useMemo(() => fn, deps)` and exists because functions are compared by identity. `React.memo(Component)` is a component wrapper that skips the child's re-render when all props are shallow-equal to the previous render. They compose: React.memo on a child is useless if the parent passes a fresh inline function each render, which is exactly the gap useCallback closes.",
    },
    {
      q: "When would you NOT use useMemo, and why is over-memoizing a problem?",
      a: "My default is not to memoize. A re-render running some cheap expressions is usually faster than storing a deps array, comparing it element-by-element every render, and keeping the old value alive in memory — `useMemo` around something like a string concat or `array.length` is pure overhead. I reach for it in two cases: a computation that profiling shows is actually expensive, or a value whose *identity* matters because it feeds a `React.memo`'d child or a dependency array. It also costs readability, and it's a hint rather than a guarantee — React can throw the cache away, so the code has to be correct without it. And the React Compiler now inserts this kind of memoization automatically, which strengthens the 'write it plainly first' default.",
    },
    {
      q: "You wrapped a list row in React.memo but profiling shows every row still re-renders when the parent updates. What's going on?",
      a: "Almost certainly a prop that's a new reference on every parent render. React.memo compares props with a shallow `Object.is` check, so an inline handler like `onSelect={id => ...}`, an object literal like `style={{ color }}`, or an array built inline fails the comparison every time — the memo never gets to skip. The fix is to stabilize the identities: wrap the handler in `useCallback`, hoist static objects out of the component or wrap computed ones in `useMemo`. I'd verify with the profiler rather than guess, and also check that `key`s are stable, since remounting looks like re-rendering in a flame chart.",
    },
    {
      q: "Does the React Compiler make useMemo and useCallback obsolete?",
      a: "Mostly, for code it compiles — the compiler analyzes components and auto-memoizes values, functions, and JSX, so new code rarely needs the manual hooks for render performance. But it doesn't make the knowledge obsolete: you still need the mental model to understand the mountains of existing code written with manual memoization, to debug identity-based bugs in dependency arrays, and to work in codebases that haven't adopted the compiler. The rules the compiler relies on are the same ones manual memoization taught — pure render functions, immutable updates. So my answer in practice: write plain code, let the compiler optimize, but be fluent in the manual tools.",
    },
  ],

  quiz: [
    {
      question: "How does useMemo decide whether to recompute its value?",
      options: [
        "It deep-compares the new dependency values with the previous ones",
        "It compares each dependency with Object.is against the previous render; any mismatch triggers a recompute",
        "It recomputes on a timer that React tunes automatically",
        "It hashes the dependency array and recomputes when the hash changes",
      ],
      answerIndex: 1,
      explain:
        "Same rule as effect deps: element-by-element Object.is, never a deep compare. That's why a rebuilt array or object with identical contents still causes a recompute — new reference, failed comparison.",
    },
    {
      question:
        "A child is wrapped in React.memo. Which parent-provided prop will defeat the memo on every render?",
      options: [
        "count={42}",
        'label={"Delete"}',
        "onClick={() => remove(item.id)} written inline in the JSX",
        "disabled={isLocked} where isLocked is a boolean state value",
      ],
      answerIndex: 2,
      explain:
        "Numbers, strings, and booleans compare by value under Object.is, so they pass when unchanged. An inline arrow is a brand-new function object every render — the shallow prop check fails and the child re-renders regardless. That's the job useCallback exists for.",
    },
    {
      question: "What is useCallback(fn, deps) equivalent to?",
      options: [
        "useMemo(() => fn, deps) — it memoizes the function reference itself",
        "useMemo(() => fn(), deps) — it memoizes the function's return value",
        "useEffect(fn, deps) — it runs fn when deps change",
        "memo(fn) — it memoizes the component's rendered output",
      ],
      answerIndex: 0,
      explain:
        "useCallback caches the function object, not its result — handy purely for referential identity (memo'd children, dependency arrays). useMemo(() => fn(), deps) would call the function and cache what it returns, which is a different tool.",
    },
    {
      question: "Which situation genuinely justifies adding useMemo?",
      options: [
        "Every derived value, as a habit, so renders stay predictable",
        "A profiled-slow filter over tens of thousands of items that currently re-runs on unrelated state changes",
        "A string template computed from two props",
        "Any component that renders more than once",
      ],
      answerIndex: 1,
      explain:
        "Memoize for measured cost or required identity — not by habit. Cheap computations are faster to redo than to cache-and-compare, and blanket useMemo adds memory, comparison work, and noise for nothing.",
    },
  ],
};

export default lesson;
