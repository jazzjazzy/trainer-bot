import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "lifting-state-up",
  title: "Lifting State Up",
  part: "State, Events & Forms",
  estMinutes: 11,
  summary:
    "When two components need the same data, the state moves to their closest common parent — data flows down as props, change requests flow up as callbacks.",

  concept: `
Sooner or later two components need the *same* piece of data: a search box and
the list it filters, a total in the header and the cart items below it. React's
answer is a single rule: **find the closest common parent of every component
that needs the value, and put the state there.** This is called *lifting state
up*, and it is the move that turns a pile of widgets into an application.

### The problem: siblings can't talk

Props flow strictly downward. A \`SearchBox\` cannot reach sideways into a
\`ProductList\` — there is no \`$GLOBALS\`, no event bus, no
\`document.querySelector\` to grab the other widget. If \`SearchBox\` owns
\`const [query, setQuery] = useState("")\`, that state is trapped inside it,
invisible to everything else.

In PHP terms: two partials both need \`$query\`. You would not have each partial
compute its own copy — you would move \`$query\` up into the controller that
includes both partials and pass it to each. Lifting state is exactly that
refactor, applied to components.

### The solution: data down, events up

The parent owns the state and passes two things to its children:

- **The value** (data down) — so both children render from the same source.
- **A callback** (events up) — so the child that *edits* the value can ask
  the parent to change it.

\`\`\`tsx
function FilterablePage() {
  const [query, setQuery] = useState("");
  return (
    <>
      <SearchBox query={query} onQueryChange={setQuery} />
      <ProductList query={query} />
    </>
  );
}
\`\`\`

\`SearchBox\` becomes a *controlled component*: it renders \`props.query\` and calls
\`props.onQueryChange(next)\` on every keystroke. It holds no state of its own.
\`ProductList\` just filters by \`props.query\`. When the user types, the flow is
always the same loop: **child fires callback → parent's setState → parent
re-renders → new props flow down → both children re-render in sync.** There is
one source of truth, so the two views can never disagree.

### Deciding where state lives

The recipe, straight from how React teams actually work:

1. List every component that renders from the value.
2. Find their **closest common parent** in the tree.
3. Put the state there (or in a component above it, if that reads better).
4. Pass the value down as a prop; pass a \`onSomethingChange\` callback down to
   whichever child mutates it.

Start state as low as possible — inside the only component that needs it — and
lift it *only when a second component genuinely needs the same value*. Lifting
everything to the top of the app by default recreates the global-variable soup
you left behind in old PHP codebases.

### The price: prop drilling

Lifting has a cost. If the common parent is four levels above the consumers,
the value and its callback must be threaded through every intermediate
component — components that neither read nor write it, just pass it along.
That relay race is called **prop drilling**, and it is the pain that motivates
two later tools: *composition with \`children\`* (next section) and *context*.
Name it in interviews exactly like that: lifting is correct first, drilling is
the symptom, context is the escape hatch — not the default.
`,

  comparisons: [
    {
      label: "Shared global vs parent-owned state",
      intro:
        "A search input filters a product list. The vanilla version syncs two DOM widgets through a shared mutable variable and manual re-paints; the React version lets one parent own the value.",
      php: `// search.js — two widgets, one mutable global
let query = ""; // shared state, owned by nobody

const input = document.querySelector("#search");
const list = document.querySelector("#products");

input.addEventListener("input", (e) => {
  query = e.target.value;
  repaintList(); // must remember to call this everywhere
});

function repaintList() {
  const visible = PRODUCTS.filter((p) =>
    p.toLowerCase().includes(query.toLowerCase())
  );
  list.innerHTML = visible
    .map((p) => \`<li>\${p}</li>\`)
    .join("");
}
// Add a "clear" button later? It must mutate query AND
// remember to repaint the list AND clear the input itself.`,
      ts: `// FilterablePage.tsx — one owner, everything follows
function FilterablePage() {
  const [query, setQuery] = useState("");

  const visible = PRODUCTS.filter((p) =>
    p.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <SearchBox query={query} onQueryChange={setQuery} />
      <button onClick={() => setQuery("")}>Clear</button>
      <ul>
        {visible.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </>
  );
}
// The clear button is one line: change the state, and the
// input and the list both re-render from it automatically.`,
      note: "In vanilla JS every writer of the shared value must also remember every repaint; in React there is exactly one writer path (setQuery) and every reader re-renders from it automatically.",
      leftLang: "js",
    },
    {
      label: "State trapped in a child vs lifted to the parent",
      intro:
        "First attempt: SearchBox keeps the query as its own state — and the list can never see it. The fix moves the state up and turns SearchBox into a controlled component.",
      php: `// SearchBox.tsx — state trapped inside the child
function SearchBox() {
  const [query, setQuery] = useState("");
  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
}

function FilterablePage() {
  return (
    <>
      <SearchBox />
      {/* ProductList cannot read SearchBox's query —
          props only flow DOWN, never sideways. */}
      <ProductList query={"???"} />
    </>
  );
}`,
      ts: `// SearchBox.tsx — controlled by the parent
interface SearchBoxProps {
  query: string;
  onQueryChange: (next: string) => void;
}

function SearchBox({ query, onQueryChange }: SearchBoxProps) {
  return (
    <input
      value={query}
      onChange={(e) => onQueryChange(e.target.value)}
    />
  );
}

function FilterablePage() {
  const [query, setQuery] = useState("");
  return (
    <>
      <SearchBox query={query} onQueryChange={setQuery} />
      <ProductList query={query} />
    </>
  );
}`,
      note: "Lifting removes the useState from the child entirely — SearchBox now renders what it is told and reports changes upward, so the parent is the single source of truth for both siblings.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "SearchBox and ProductList are siblings under FilterablePage, which owns the query. Each component logs when it renders. Predict the exact console flow as the user types 'p' then 'h'.",
    code: `const PRODUCTS = ["Phone case", "Physics textbook", "Coffee mug"];

function SearchBox({ query, onQueryChange }: {
  query: string;
  onQueryChange: (next: string) => void;
}) {
  console.log("render SearchBox, query =", JSON.stringify(query));
  return (
    <input
      value={query}
      onChange={(e) => onQueryChange(e.target.value)}
      placeholder="Search products"
    />
  );
}

function ProductList({ query }: { query: string }) {
  const visible = PRODUCTS.filter((p) =>
    p.toLowerCase().includes(query.toLowerCase())
  );
  console.log("render ProductList, showing:", visible.join(", ") || "(none)");
  return (
    <ul>
      {visible.map((p) => <li key={p}>{p}</li>)}
    </ul>
  );
}

export default function FilterablePage() {
  const [query, setQuery] = useState("");
  console.log("render FilterablePage, query =", JSON.stringify(query));
  return (
    <>
      <SearchBox query={query} onQueryChange={setQuery} />
      <ProductList query={query} />
    </>
  );
}`,
    output: `Console (production behaviour; StrictMode's dev-only double renders omitted):

Initial render:
  render FilterablePage, query = ""
  render SearchBox, query = ""
  render ProductList, showing: Phone case, Physics textbook, Coffee mug

User types "p"  — SearchBox calls onQueryChange("p"), i.e. the parent's setQuery:
  render FilterablePage, query = "p"
  render SearchBox, query = "p"
  render ProductList, showing: Phone case, Physics textbook

User types "h"  — onQueryChange("ph"):
  render FilterablePage, query = "ph"
  render SearchBox, query = "ph"
  render ProductList, showing: Phone case, Physics textbook

The loop is always: child event -> parent setState -> parent re-renders ->
fresh props flow down -> BOTH siblings re-render from the one source of truth.
"Coffee mug" disappears at "p" and never comes back.`,
  },

  keyPoints: [
    "When two components need the same value, move the state to their **closest common parent** — that is lifting state up.",
    "'Data down, events up': the parent passes the value down as a prop and a callback (`onQueryChange`) down for children to request changes.",
    "A child that renders a prop value and reports edits via a callback is a *controlled component* — it owns no copy of the state.",
    "One owner means one source of truth: siblings can never disagree, and a new writer (a clear button) is one `setState` call, not a manual repaint checklist.",
    "PHP mapping: it is the refactor of moving `$query` out of two partials into the controller that includes both, then passing it to each.",
    "The cost of lifting through many layers is **prop drilling** — intermediate components relaying props they don't use — which composition and context later relieve.",
  ],

  interview: [
    {
      q: "What does 'lifting state up' mean in React, and when do you do it?",
      a: "Props only flow downward, so siblings cannot share state that one of them owns. When two components need the same value, I move the `useState` to their closest common parent: the parent passes the value down to every reader and a change callback down to whichever child edits it — 'data down, events up'. I do it the moment a second component genuinely needs the value, and not before; state should start as low in the tree as possible. It is the same refactor as moving a variable out of two PHP partials into the controller that includes both.",
    },
    {
      q: "Walk me through what happens, render by render, when the user types into a lifted search box.",
      a: "The input's `onChange` fires and the child calls the callback prop, say `onQueryChange('p')`, which is really the parent's `setQuery`. That schedules a state update, so React re-renders the parent function. The parent returns JSX with the new query baked into both children's props, so React re-renders `SearchBox` — whose input now shows 'p' because it is controlled — and `ProductList`, which filters with the new value. One state change, one downward pass, both views consistent. The child never mutated anything; it only *requested* the change.",
    },
    {
      q: "What is prop drilling and how do you deal with it?",
      a: "Prop drilling is the side effect of lifting state high: the value and its callback have to be threaded through intermediate components that neither read nor write them, just relay them. A few levels of it is fine and I don't reach for machinery to avoid it. When it gets painful I first try composition — if the parent builds the JSX and passes it down as `children`, the middle layers never see the data at all. Only for genuinely app-wide values (theme, current user) do I move to context. Drilling is a symptom to manage, not an error to eliminate on sight.",
    },
  ],

  quiz: [
    {
      question:
        "A SearchBox and a ProductList are siblings and both need the current query. Where should the query state live?",
      options: [
        "In SearchBox, since it's where the user types",
        "In ProductList, since it consumes the value",
        "In their closest common parent, passed down to both as props",
        "In a module-level variable both components import",
      ],
      answerIndex: 2,
      explain:
        "Props flow only downward, so the sole place both siblings can receive the same value from is a shared ancestor — the closest common parent keeps it as local as possible. A module-level variable is the vanilla-JS global trap: React would not re-render when it changes.",
    },
    {
      question:
        "After lifting, how does SearchBox change the query it no longer owns?",
      options: [
        "It calls a callback prop like onQueryChange(next); the parent's setState does the actual update",
        "It mutates props.query directly",
        "It dispatches a DOM CustomEvent that the parent listens for",
        "It can't — lifted state becomes read-only everywhere",
      ],
      answerIndex: 0,
      explain:
        "That is the 'events up' half of the pattern: the child requests the change through a function prop, and only the owner calls setState. Props are read-only, and React components communicate through props and callbacks, not DOM events between components.",
    },
    {
      question:
        "The parent re-renders after setQuery. What happens to the two sibling children?",
      options: [
        "Only SearchBox re-renders, because it triggered the event",
        "Both re-render with the new query prop, keeping the input and the list in sync",
        "Neither re-renders until they call setState themselves",
        "React reloads the page to reflect the new state",
      ],
      answerIndex: 1,
      explain:
        "When a component re-renders, React re-renders its children with the fresh props from the new JSX. Both siblings render from the same single source of truth, which is exactly why lifted state keeps multiple views consistent by construction.",
    },
  ],
};

export default lesson;
