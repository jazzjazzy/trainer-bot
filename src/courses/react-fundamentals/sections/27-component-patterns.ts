import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "component-patterns",
  title: "Component Patterns",
  part: "Patterns & Production",
  estMinutes: 12,
  summary:
    "The patterns interviewers name-drop — presentational/container, compound components, render props, headless components — and the honest 2026 hierarchy of when each still earns its keep.",

  concept: `
React "patterns" are mostly answers to one question: **how do you share
logic and structure between components without coupling them?**
Interviewers name-drop these patterns constantly, and the honest answer in
2026 is that hooks retired about half of them. Knowing *which* half is what
makes you sound senior rather than well-read.

### Presentational vs container: know it as history

The classic pre-hooks split: **container** components fetched data and held
state, **presentational** components just took props and rendered markup —
controller vs view, in PHP terms. It existed because only class components
could hold state, so state got quarantined into a few "smart" components.
Hooks dissolved the constraint: any function component can hold state, so
the split stopped being an architecture and became a taste — even its
popularizer, Dan Abramov, has publicly walked it back. The surviving
instinct is real, though: keep data concerns out of markup-heavy
components. Today you honor it by extracting a **custom hook**, not by
writing a second component.

### Compound components: \`<Tabs>\` and \`<Tab>\` that talk privately

HTML already ships compound components: \`<select>\` and \`<option>\`
cooperate without you wiring them together. The React version: a parent
owns the shared state and provides it through **context**; its children
read that context and coordinate.

\`\`\`tsx
<Tabs defaultTab="specs">
  <Tab id="specs">Specs</Tab>
  <Tab id="reviews">Reviews</Tab>
  <TabPanel id="specs"><SpecTable /></TabPanel>
  <TabPanel id="reviews"><ReviewList /></TabPanel>
</Tabs>
\`\`\`

The win over a monolithic \`<Tabs tabs={configArray} />\` is that consumers
write *markup*, not a config schema: they can reorder tabs, wrap one in a
tooltip, insert a divider, style each independently. This is *the* pattern
of design systems — Radix UI and Headless UI are built on it — so expect it
in any design-system interview question.

### Render props: recognize it in older code

A **render prop** is a prop whose value is a function returning JSX; the
component calls it with data only it has:

\`\`\`tsx
<MouseTracker render={(pos) => <Crosshair x={pos.x} y={pos.y} />} />
\`\`\`

Before hooks, this (and its twin, children-as-a-function) was the main way
to share *stateful logic*. Custom hooks replaced most uses: \`useMouse()\`
gives you the same values with none of the nesting. Render props survive in
niches where the *varying part is markup* that must be rendered with values
the component computes mid-render — virtualized list rows, for example. You
need to read it fluently; you'll rarely write it.

### Headless components: logic, zero markup

The custom-hook philosophy at library scale: the library implements the
state machine, keyboard handling, and accessibility, and renders **nothing**
— you own 100% of the markup. TanStack Table hands you sorting/filtering
state via hooks; Radix primitives give you accessible behavior with
unstyled elements; Downshift does comboboxes the same way. It's the
logical endpoint of separating logic from presentation.

### The 2026 hierarchy

1. **Composition with \`children\`** — first resort; most "patterns" are unneeded if you just pass JSX in.
2. **Custom hooks** — for sharing stateful logic between components.
3. **Compound components via context** — for design-system families like Tabs, Accordion, Menu.
4. **Render props** — rarely; mostly when a library API demands it.
`,

  comparisons: [
    {
      label: "Monolithic config-array Tabs vs compound composition",
      intro:
        "Both render a two-tab widget. The left version accepts the whole UI as a data structure; the right lets consumers write the markup themselves.",
      php: `// Tabs.tsx — one component swallows the UI as config
type TabConfig = {
  id: string;
  label: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean; // every new need = another field
};

function Tabs({ tabs }: { tabs: TabConfig[] }) {
  const [active, setActive] = useState(tabs[0].id);
  return (
    <div>
      {tabs.map((t) => (
        <button key={t.id} disabled={t.disabled}
                onClick={() => setActive(t.id)}>
          {t.label}
        </button>
      ))}
      {tabs.find((t) => t.id === active)?.content}
    </div>
  );
}

// usage: markup smuggled through a data structure
<Tabs tabs={[
  { id: 'specs', label: 'Specs', content: <SpecTable /> },
  { id: 'reviews', label: 'Reviews', content: <ReviewList /> },
]} />`,
      ts: `// Compound: parent owns state, children read it via context
<Tabs defaultTab="specs">
  <Tab id="specs">Specs</Tab>
  <Tab id="reviews">
    Reviews <Badge count={212} /> {/* just JSX — no schema change */}
  </Tab>

  <hr />  {/* consumers can put anything between the pieces */}

  <TabPanel id="specs">
    <SpecTable />
  </TabPanel>
  <TabPanel id="reviews">
    <ReviewList />
  </TabPanel>
</Tabs>

// Tab and TabPanel coordinate through TabsContext internally:
// <Tabs> holds [active, setActive] and provides it;
// each child reads the context — no props threaded by the user.`,
      note:
        "The config array must grow a new field for every need (badges, dividers, disabled, tooltips); compound components expose plain JSX, so consumers already have full expressive power.",
      leftLang: "tsx",
    },
    {
      label: "A render-prop mouse tracker vs a useMouse() hook",
      intro:
        "Share 'current mouse position' logic with two consumers. The pre-hooks version injects markup through a function prop; the modern version is just a hook call.",
      php: `// MouseTracker.tsx — the pre-hooks way to share stateful logic
function MouseTracker({
  render,
}: {
  render: (pos: { x: number; y: number }) => React.ReactNode;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) =>
      setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return <>{render(pos)}</>;
}

// usage: logic arrives as a wrapper component + nested function
<MouseTracker
  render={(pos) => <Crosshair x={pos.x} y={pos.y} />}
/>`,
      ts: `// useMouse.ts — the same logic as a custom hook
function useMouse() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) =>
      setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return pos;
}

// usage: no wrapper in the tree, no nesting — just a value
function Crosshair() {
  const { x, y } = useMouse();
  return <div className="crosshair" style={{ left: x, top: y }} />;
}`,
      note:
        "Identical state + effect either way — the hook delivers the values without adding a component to the tree or a function-in-JSX to read around; that's why custom hooks replaced most render props.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "A compound Tabs component wired through context. Trace it: who owns the state, how do Tab and TabPanel learn about it, and what re-renders when a tab is clicked?",
    code: `// Tabs.tsx — compound components sharing state through context
import { createContext, useContext, useState, type ReactNode } from 'react';

const TabsContext = createContext<{
  active: string;
  setActive: (id: string) => void;
} | null>(null);

function Tabs({ defaultTab, children }: { defaultTab: string; children: ReactNode }) {
  const [active, setActive] = useState(defaultTab);
  return (
    <TabsContext value={{ active, setActive }}>
      <div className="tabs">{children}</div>
    </TabsContext>
  );
}

function Tab({ id, children }: { id: string; children: ReactNode }) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('<Tab> must be used inside <Tabs>');
  return (
    <button
      className={ctx.active === id ? 'tab tab--active' : 'tab'}
      onClick={() => ctx.setActive(id)}
    >
      {children}
    </button>
  );
}

function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('<TabPanel> must be used inside <Tabs>');
  return ctx.active === id ? <section>{children}</section> : null;
}

export default function App() {
  return (
    <Tabs defaultTab="specs">
      <Tab id="specs">Specs</Tab>
      <Tab id="reviews">Reviews</Tab>
      <TabPanel id="specs">Weight: 1.2 kg</TabPanel>
      <TabPanel id="reviews">4.5 stars (212 reviews)</TabPanel>
    </Tabs>
  );
}`,
    output: `Initial render:
  [Specs]* [Reviews]      <- Specs button has class "tab tab--active"
  Weight: 1.2 kg          <- only the "specs" TabPanel renders; the other returns null

Click "Reviews":
  ctx.setActive('reviews') updates the state that lives in <Tabs>,
  so <Tabs> re-renders and every context consumer sees the new value:
  [Specs] [Reviews]*      <- the active class moves
  4.5 stars (212 reviews) <- the reviews panel mounts, the specs panel unmounts

Note what did NOT happen: the user never threaded props between Tab and
TabPanel — they coordinate privately through TabsContext. (Also note the
React 19 provider spelling: <TabsContext value={...}> directly, no .Provider.)`,
  },

  keyPoints: [
    "Presentational vs container is a pre-hooks historical pattern: it existed because only classes could hold state; today you separate data concerns with a custom hook instead.",
    "Compound components (`<Tabs>` + `<Tab>` + `<TabPanel>`) share state through context so consumers compose free-form JSX — the pattern behind Radix UI and Headless UI.",
    "A render prop is a function-valued prop the component calls to produce JSX; custom hooks replaced most uses, so read it fluently but rarely write it.",
    "Headless components/hooks (TanStack Table, Radix, Downshift) ship logic and accessibility with zero markup — you own the rendering entirely.",
    "The 2026 hierarchy: plain composition with `children` first, custom hooks second, context-based compound components for design-system families, render props rarely.",
    "In React 19 a context renders directly as its own provider — `<TabsContext value={...}>` — no `.Provider` needed.",
  ],

  interview: [
    {
      q: "What are compound components, and when would you reach for the pattern?",
      a: "Compound components are a family of components that cooperate through shared, private state — the way HTML's `<select>` and `<option>` do. The parent (say `<Tabs>`) owns the state and exposes it through a context; children like `<Tab>` and `<TabPanel>` read that context, so the consumer just composes JSX without wiring anything. I reach for it when building reusable UI families for a design system, because it beats a config-array API on flexibility: consumers can reorder, wrap, decorate, and style the pieces freely since the API surface is markup, not a schema. It's the pattern Radix UI and Headless UI are built on. For a one-off widget inside an app I wouldn't bother — plain props and children are simpler.",
    },
    {
      q: "What is a render prop, and why do you see it less in modern React?",
      a: "A render prop is a prop whose value is a function that returns JSX — the component calls it with data only it has, like `<MouseTracker render={pos => <Crosshair {...pos} />} />`. Before hooks it was the primary way to share stateful logic between components. Custom hooks replaced most uses because they deliver the same values with no extra component in the tree and no nested function in the JSX — `useMouse()` reads far better than a tracker wrapper. It still appears where the varying part is genuinely markup rendered with mid-render values, like row renderers in virtualized lists, and in some library APIs, so I can read and write it — I just don't default to it.",
    },
    {
      q: "How do you decide between composition, a custom hook, and a context-based pattern when sharing behavior?",
      a: "I go up a ladder. First, plain composition: if a component just needs to not care what's inside it, `children` or a slot prop solves it with zero machinery. Second, if what's shared is stateful logic — a subscription, form handling, a fetch — I extract a custom hook, which shares the logic while each caller keeps its own state and markup. Third, if I'm building a family of components that must coordinate invisibly, like Tabs or an Accordion for a design system, I use compound components over context. Render props are my last resort, mostly when integrating with a library that expects them. The old presentational/container split I'd mention only as history — hooks dissolved the constraint it was built on.",
    },
  ],

  quiz: [
    {
      question:
        "In a compound `<Tabs>`/`<Tab>`/`<TabPanel>` implementation, how does `<TabPanel>` know which tab is active?",
      options: [
        "The consumer passes the active id to every TabPanel as a prop",
        "It reads shared state from a context provided by <Tabs>",
        "React automatically links components rendered as siblings",
        "TabPanel inspects its parent's props at runtime",
      ],
      answerIndex: 1,
      explain:
        "The parent owns the state and provides it via context; each child calls useContext (or use) to read it. That's the whole trick of compound components — coordination without the consumer threading props. React never links siblings automatically.",
    },
    {
      question: "Why did custom hooks replace most render props?",
      options: [
        "Render props no longer work in React 19",
        "Hooks are faster because they skip reconciliation",
        "A hook shares the same stateful logic without adding a wrapper component to the tree or a nested function to the JSX",
        "Render props can't be typed in TypeScript",
      ],
      answerIndex: 2,
      explain:
        "Render props still work fine and can be typed precisely — but they exist to share stateful logic, and a custom hook does that job with less ceremony: no tracker component in the tree, no function-in-JSX nesting. The niche that remains is when the varying part is markup rendered with mid-render values.",
    },
    {
      question: "What does 'headless' mean in 'headless component library' (TanStack Table, Downshift)?",
      options: [
        "It runs on the server without a browser",
        "It ships logic, state, and accessibility but renders no markup — you supply all the UI",
        "It has no documentation head section",
        "It renders to a canvas instead of the DOM",
      ],
      answerIndex: 1,
      explain:
        "Headless libraries implement the hard part — state machines, keyboard handling, ARIA — and hand it to you via hooks or unstyled primitives, rendering nothing (or nearly nothing) themselves. You keep total control of markup and styling; it's the custom-hook philosophy at library scale.",
    },
  ],
};

export default lesson;
