import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "lists-and-keys",
  title: "Rendering Lists and Keys",
  part: "Thinking in React",
  estMinutes: 12,
  summary:
    "map() is React's foreach, and every item needs a stable key so React can match old and new children across re-renders — index-as-key breaks that matching the moment the list reorders.",

  concept: `
In PHP you render a list with \`foreach\` inside the template. JSX has no
statements — only expressions — so React's foreach is \`Array.prototype.map\`:
transform your data array into an array of elements and drop it straight into
the markup.

\`\`\`tsx
const todos = [
  { id: "t1", text: "Write CV" },
  { id: "t2", text: "Apply to jobs" },
];

<ul>
  {todos.map((todo) => (
    <li key={todo.id}>{todo.text}</li>
  ))}
</ul>
\`\`\`

That \`key\` prop is not decoration. It is the one piece of information React
demands for lists, and understanding *why* is a stock interview question.

### Why keys exist: identity across re-renders

Every re-render produces a brand-new array of element descriptions. React then
compares it with the previous render's array to decide the cheapest set of real
DOM changes — that comparison is **reconciliation**. For a list, React needs to
know which new child *is* which old child: was item "Write CV" deleted, or did
it just move down one slot because something was inserted above it?

Position alone can't answer that. Keys can: React matches children by key, so a
child that keeps its key keeps its **identity** — its DOM node and, crucially,
its component **state** — even if it moved to a different position. A key that
disappears means "destroy that child (state and all)"; a new key means "mount a
fresh one".

Think of it like a primary key in SQL. You wouldn't sync two versions of a
table by comparing row 1 to row 1 and row 2 to row 2 — you'd match on \`id\`.
Reconciliation is exactly that sync, run on every render.

### The index-as-key trap

\`map\` hands you the index, and \`key={index}\` silences the console warning —
which is why it's the most common wrong answer. It's fine **only** for a list
that never reorders, inserts, deletes, or gets filtered. The moment the list
changes shape, indexes stop tracking items: insert a row at the top and every
item's index shifts by one, so React thinks *nothing moved* — key 0 is still
key 0 — and instead rewrites the content of every row.

The visible symptom: **state sticks to the wrong row**. The checked checkbox,
the half-typed input, the expanded accordion panel stays at position 0 while
the data that used to be there is now at position 1. Deleting a row makes the
row *below* it appear to lose its state instead.

### The rules

- Keys must be **stable** (same item, same key, every render — never
  \`Math.random()\` or a UUID generated *during render*),
- **unique among siblings** — not globally. Two different lists can both use
  id "t1"; two children of the same list cannot,
- and ideally come from your data: a database id, a slug, anything that
  identifies the item. If data has no id, generate one **when the item is
  created** (e.g. \`crypto.randomUUID()\` in the add handler), not when it's
  rendered.

One more gotcha: \`key\` is consumed by React itself. It is **not** passed to
your component as a prop — if the child also needs the id, pass it separately
(\`<Row key={item.id} id={item.id} />\`).
`,

  comparisons: [
    {
      label: "foreach in a template vs map in JSX",
      intro:
        "Render a list of products as <li> elements. PHP loops with a statement inside the template; JSX embeds an expression that evaluates to an array of elements.",
      php: `<!-- products.php -->
<ul>
  <?php foreach ($products as $product): ?>
    <li>
      <?= htmlspecialchars($product['name']) ?> —
      $<?= number_format($product['price'], 2) ?>
    </li>
  <?php endforeach; ?>
</ul>`,
      ts: `// ProductList.tsx
type Product = { id: number; name: string; price: number };

function ProductList({ products }: { products: Product[] }) {
  return (
    <ul>
      {products.map((product) => (
        <li key={product.id}>
          {product.name} — \${product.price.toFixed(2)}
        </li>
      ))}
    </ul>
  );
}`,
      note: "foreach is a statement; JSX only takes expressions, so map() returns the array of <li> elements inline — and each one must carry a key so React can track it across re-renders (no htmlspecialchars needed: JSX escapes text automatically).",
    },
    {
      label: "Rebuild everything vs reconcile by key",
      intro:
        "A new todo arrives at the top of the list. The vanilla approach throws the old DOM away and rebuilds; React diffs the keyed children and performs the minimal change.",
      php: `// vanilla.js
function renderTodos(todos) {
  const ul = document.querySelector('#todos');
  // Nuke and rebuild: every <li> is destroyed and
  // recreated — focus, scroll position, and any
  // checkbox state inside the rows are wiped out.
  ul.innerHTML = todos
    .map((t) => \`<li>\${t.text}</li>\`)
    .join('');
}

todos.unshift({ id: 't4', text: 'Network' });
renderTodos(todos);`,
      ts: `// TodoList.tsx
function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul>
      {todos.map((t) => (
        <li key={t.id}>{t.text}</li>
      ))}
    </ul>
  );
}

// Adding to the front (immutably) re-renders;
// React sees keys [t4, t1, t2, t3] vs [t1, t2, t3]:
// it inserts ONE new <li> and leaves the other
// three DOM nodes — and their state — untouched.
setTodos((prev) => [newTodo, ...prev]);`,
      note: "innerHTML rebuild destroys and recreates every node (and is an XSS foot-gun); keyed reconciliation computes the minimal edit — one insertion — because keys tell React the other three children are the same items as last render.",
      leftLang: "js",
    },
    {
      label: "Index key vs stable key",
      intro:
        "Each row has its own checkbox state. Delete the first todo and watch which row appears to lose its state. Both versions compile and neither warns — only one is correct.",
      php: `// Bug: key is the array position.
{todos.map((todo, index) => (
  <TodoRow key={index} todo={todo} />
))}

// Delete todos[0]: every item shifts up one slot,
// so old key 1 becomes key 0, old key 2 becomes
// key 1... React matches by key and concludes the
// LAST row was removed. The checkbox you ticked on
// row 0 is now shown next to a different todo.`,
      ts: `// Fix: key is the item's own identity.
{todos.map((todo) => (
  <TodoRow key={todo.id} todo={todo} />
))}

// Delete todos[0]: its key vanishes from the list,
// so React destroys exactly that row's component
// (and its state). The remaining rows keep their
// keys, keep their DOM nodes, keep their checkbox
// state — they merely move up.`,
      note: "Index keys are only safe for lists that never reorder, insert, delete, or filter; with stable ids, per-row state follows the item instead of the position.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "React's keyed matching, simulated in plain TypeScript. reconcile() compares last render's children with this render's — by key — and logs each child's fate. Scenario: one todo inserted at the front, one deleted. Predict both runs, then compare the stable-key run with the index-key run.",
    code: `// Simulate React's keyed reconciliation: given the children from the
// last render (prev) and this render (next), decide each child's fate.

type Child = { key: string; value: string };

function reconcile(prev: Child[], next: Child[]): void {
  const prevByKey = new Map(prev.map((c, i) => [c.key, { c, i }]));
  const nextKeys = new Set(next.map((c) => c.key));

  next.forEach((child, i) => {
    const old = prevByKey.get(child.key);
    if (!old) {
      console.log(\`  CREATE  key=\${child.key} "\${child.value}" (fresh state)\`);
    } else {
      const moved = old.i !== i ? \` moved \${old.i}->\${i},\` : "";
      const swapped =
        old.c.value !== child.value
          ? \` BUT content swapped "\${old.c.value}" -> "\${child.value}"\`
          : "";
      console.log(\`  KEEP    key=\${child.key},\${moved} state preserved\${swapped}\`);
    }
  });
  prev.forEach((child) => {
    if (!nextKeys.has(child.key)) {
      console.log(\`  DESTROY key=\${child.key} "\${child.value}" (state lost)\`);
    }
  });
}

const before = [
  { id: "t1", text: "Write CV" },
  { id: "t2", text: "Apply to jobs" },
  { id: "t3", text: "Prep interviews" },
];
// Next render: new item inserted at the FRONT, t2 deleted.
const after = [
  { id: "t4", text: "Network on LinkedIn" },
  { id: "t1", text: "Write CV" },
  { id: "t3", text: "Prep interviews" },
];

console.log("With stable keys (key = item.id):");
reconcile(
  before.map((t) => ({ key: t.id, value: t.text })),
  after.map((t) => ({ key: t.id, value: t.text }))
);

console.log("");
console.log("With index as key (key = array position):");
// Same data change — but now React can't see it. No CREATE for the
// new item, no DESTROY for the deleted one: just rows whose content
// silently changed underneath their (position-based) identity.
reconcile(
  before.map((t, i) => ({ key: String(i), value: t.text })),
  after.map((t, i) => ({ key: String(i), value: t.text }))
);`,
  },

  keyPoints: [
    "JSX has no statements, so lists are rendered with an expression: `{items.map((item) => <li key={item.id}>…</li>)}`.",
    "Keys give list children **identity across re-renders** — React matches old and new children by key during reconciliation, so a kept key keeps its DOM node and component state.",
    "Index-as-key is safe only for lists that never reorder, insert, delete, or filter; otherwise state (checkboxes, inputs, expanded panels) sticks to the *position* instead of the *item*.",
    "Keys must be stable (never generated during render) and unique **among siblings only** — not globally unique.",
    "`key` is consumed by React and never reaches your component's props; pass the id separately if the child needs it.",
    "Best key source is your data: database ids or slugs; if none exists, mint one (e.g. `crypto.randomUUID()`) when the item is *created*, not when it's rendered.",
  ],

  interview: [
    {
      q: "Why does React need keys on list items?",
      a: "On every re-render React gets a fresh array of children and has to work out how it corresponds to the previous one — that's reconciliation. Keys are the identity it matches on, like a primary key when syncing two versions of a table. A child whose key survives is treated as the same child: React keeps its DOM node and its component state, even if it moved position. Without reliable keys React falls back to matching by position, which means an insert at the top looks like every single row changed — worse performance and, more importantly, state getting attached to the wrong items.",
    },
    {
      q: "When is using the array index as a key acceptable, and what goes wrong when it isn't?",
      a: "It's acceptable only when the list is effectively static: no reordering, no inserts or deletes in the middle, no filtering — say, rendering a fixed set of tabs. The failure mode otherwise is that the index tracks the position, not the item. Insert a row at the top and every index shifts, so React believes nothing moved and rewrites each row's content in place — any per-row state like a checked checkbox or a focused input now sits next to the wrong data. Delete a row and the row below it appears to inherit the deleted row's state. I reach for a stable id from the data, and if none exists I generate one when the item is created, never during render.",
    },
    {
      q: "Do keys have to be globally unique, and can a component read its own key?",
      a: "Neither. Keys only need to be unique among siblings — the children of one parent in one render. Two separate lists can happily reuse the same key values. And `key` is special-cased by React: it's consumed during reconciliation and never appears in the child's props, so if the component also needs that id I pass it as an explicit prop like `<Row key={item.id} id={item.id} />`. A related trick worth mentioning: because a changed key means 'destroy and remount', you can deliberately change a component's key to reset its internal state, for example `<Profile key={userId} />` to reset a form when switching users.",
    },
  ],

  quiz: [
    {
      question:
        "A list uses key={index}. The user ticks the checkbox inside row 0, then a new item is inserted at the top of the list. What does the user see?",
      options: [
        "The checkbox moves down with its original row, as expected",
        "The new top row appears with the checkbox already ticked",
        "React throws an error about duplicate keys",
        "All checkboxes are cleared because the list re-rendered",
      ],
      answerIndex: 1,
      explain:
        "With index keys, key 0 exists before and after the insert, so React keeps that component instance — and its checked state — at position 0 and just swaps the row's content to the new item. The state stuck to the position, not the item. A stable id key would have moved the ticked row down intact.",
    },
    {
      question: "Which of these is a valid, safe key strategy?",
      options: [
        "key={Math.random()} so every key is guaranteed unique",
        "key={item.id} where id comes from the database",
        "key={item.id} but only if the id is unique across the entire app",
        "Omitting key — React infers identity from the item's content",
      ],
      answerIndex: 1,
      explain:
        "Keys must be stable across renders and unique among siblings — a database id is both. Math.random() produces a different key every render, so React destroys and remounts every child each time. Global uniqueness is not required, and React never diffs item content to infer identity; without keys it falls back to position.",
    },
    {
      question: "What happens to the key prop from the child component's point of view?",
      options: [
        "It arrives in props like any other prop",
        "It's available via a special useKey() hook",
        "React consumes it; the component never receives it",
        "It's attached to the DOM element as a key attribute",
      ],
      answerIndex: 2,
      explain:
        "key (like ref before React 19 made ref a normal prop) is instruction *to React*, used for matching during reconciliation, then stripped. If the child needs the same value, pass it again under another name: <Row key={item.id} id={item.id} />.",
    },
  ],
};

export default lesson;
