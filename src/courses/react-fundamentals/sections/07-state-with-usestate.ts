import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "state-with-usestate",
  title: "State with useState",
  part: "State, Events & Forms",
  estMinutes: 12,
  summary:
    "useState gives a component data that survives re-renders; calling the setter schedules a re-render, and each render sees a frozen snapshot of the value — which is why setCount(count + 1) three times adds 1, not 3.",

  concept: `
In PHP, every request starts cold. Variables live for one request; anything
that must survive goes into \`$_SESSION\`, the database, or a cookie, and the
next request reads it back. React components have the same problem in
miniature: a re-render re-runs the whole function, so every local \`const\` is
recreated from scratch. **State** is React's answer — a value that lives
*outside* the function (React stores it, keyed to this component instance in
the tree) and survives across renders, the way session data survives across
requests.

### The useState hook

\`\`\`tsx
import { useState } from "react";

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}
\`\`\`

\`useState(initial)\` returns a two-element tuple — array destructuring gives
you any names you like. TypeScript infers the type from the initial value
(\`count: number\` here). Reach for the explicit generic when inference can't
see the whole picture, most commonly "starts empty":

\`\`\`ts
const [user, setUser] = useState<User | null>(null);
const [tags, setTags] = useState<string[]>([]); // not never[]
\`\`\`

Calling \`setCount\` does two things: stores the new value in React, and
**schedules a re-render** of this component. That re-render is where the new
value appears. Which leads to the concept people trip over:

### State is a snapshot

\`count\` is a plain \`const\`. Setting state does **not** change it — it can't;
it's a constant in a function call that has already started. Each render gets
a frozen snapshot of the state, and event handlers close over the snapshot of
the render that created them:

\`\`\`ts
// count is 0 in this render's snapshot:
setCount(count + 1); // "set it to 0 + 1"
setCount(count + 1); // "set it to 0 + 1" — still 0!
setCount(count + 1); // "set it to 0 + 1" — still 0!
// next render: count is 1, not 3
\`\`\`

When the next value depends on the previous one, pass an **updater function**
and React feeds it the latest pending value:

\`\`\`ts
setCount((c) => c + 1); // 0 -> 1
setCount((c) => c + 1); // 1 -> 2
setCount((c) => c + 1); // 2 -> 3 ✔
\`\`\`

React also **batches**: all the setter calls in one event handler produce a
single re-render after the handler finishes, not one render per call. (Since
React 18 this applies everywhere — timeouts, promises — not just DOM events.)

### The rules of hooks

\`useState\` works by call order: React keeps a list of state cells per
component and matches "first \`useState\` call → first cell". That only works
if every render makes the same hook calls in the same order, so:

- call hooks only at the **top level** of a component (or a custom hook) —
  never inside \`if\`, loops, or nested functions;
- call hooks only from React functions, not arbitrary helpers.

If you need state conditionally, hoist the hook and branch on the *value*.
The \`eslint-plugin-react-hooks\` rules enforce this — treat its errors as
non-negotiable.
`,

  comparisons: [
    {
      label: "A counter: session round-trip vs useState",
      intro:
        "Count how many times the user clicked. PHP persists across full page requests via the session; React persists across re-renders via a state cell — no round-trip, no storage code.",
      php: `<?php // counter.php
session_start();

// Every request starts cold — pull state back in:
$_SESSION['count'] ??= 0;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $_SESSION['count']++;
    header('Location: counter.php'); // re-"render"
    exit;
}
?>
<form method="post">
  <button>Clicked <?= $_SESSION['count'] ?> times</button>
</form>`,
      ts: `// Counter.tsx
import { useState } from "react";

function Counter() {
  // React stores the value between renders — the
  // component function re-runs, the state survives.
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}`,
      note: "Same mental model, tighter loop: a re-render is the 'next request', useState is the 'session' — but the update happens in memory in milliseconds, with no POST, redirect, or session storage.",
    },
    {
      label: "Manual DOM sync vs state-driven render",
      intro:
        "Track a value and keep the page in sync with it. Vanilla JS mutates a variable and must remember to update every DOM node that shows it; React re-renders from state, so the UI can't drift.",
      php: `// vanilla.js
let count = 0; // global mutable state

const btn = document.querySelector('#btn');
const label = document.querySelector('#label');
const badge = document.querySelector('#badge');

btn.addEventListener('click', () => {
  count++;
  // YOU must update every place that shows count.
  // Forget one and the UI silently disagrees
  // with the data:
  label.textContent = \`Clicked \${count} times\`;
  badge.textContent = String(count);
});`,
      ts: `// Counter.tsx
import { useState } from "react";

function Counter() {
  const [count, setCount] = useState(0);

  // setCount schedules a re-render; every place
  // that reads count is recomputed from the one
  // source of truth. Nothing to forget.
  return (
    <>
      <button onClick={() => setCount((c) => c + 1)}>
        Clicked {count} times
      </button>
      <span className="badge">{count}</span>
    </>
  );
}`,
      note: "The vanilla version has two sources of truth (the variable and the DOM) that you sync by hand; in React the DOM is a derived artifact of state — change the state and every dependent bit of UI updates in one pass.",
      leftLang: "js",
    },
    {
      label: "Snapshot value vs updater function",
      intro:
        "A handler wants to increment three times in one click. Both versions compile; only one ends up at 3.",
      php: `// Bug: three snapshots of the same value.
function handleTripleClick() {
  // this render's count is 0 — frozen
  setCount(count + 1); // set to 1
  setCount(count + 1); // set to 1 (count is STILL 0)
  setCount(count + 1); // set to 1
}
// One batched re-render. Next render: count === 1`,
      ts: `// Fix: updater functions queue and chain.
function handleTripleClick() {
  setCount((c) => c + 1); // 0 -> 1
  setCount((c) => c + 1); // 1 -> 2
  setCount((c) => c + 1); // 2 -> 3
}
// One batched re-render. Next render: count === 3`,
      note: "setCount(count + 1) bakes in the current render's snapshot; setCount(c => c + 1) asks React for the latest pending value — use the updater form whenever the next state depends on the previous one.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature useState with a real render loop: one state cell, per-render snapshots, and batched re-renders. Predict both final counts before running — why does the naive version land on 1 and the updater version on 3?",
    code: `// A miniature useState: one state cell, snapshots, and a render loop.
// Watch why calling setCount(count + 1) three times gives 1, not 3.

type Updater = number | ((current: number) => number);

let cell = 0; // where React actually stores the state
let dirty = false; // "a re-render is scheduled"

function useMiniState(): [number, (next: Updater) => void] {
  const snapshot = cell; // the value THIS render closes over
  const setState = (next: Updater) => {
    cell = typeof next === "function" ? next(cell) : next;
    dirty = true; // schedule a re-render (batched)
  };
  return [snapshot, setState];
}

function Counter(mode: "naive" | "updater") {
  const [count, setCount] = useMiniState();
  console.log(\`  render: count = \${count}\`);
  return () => {
    // the click handler — count is frozen at this render's snapshot
    if (mode === "naive") {
      setCount(count + 1); // cell = 0 + 1
      setCount(count + 1); // cell = 0 + 1 again!
      setCount(count + 1); // cell = 0 + 1 again!
    } else {
      setCount((c) => c + 1); // cell = 0 + 1
      setCount((c) => c + 1); // cell = 1 + 1
      setCount((c) => c + 1); // cell = 2 + 1
    }
  };
}

function mount(mode: "naive" | "updater") {
  cell = 0;
  console.log(\`\${mode}: click handler runs setCount three times\`);
  const click = Counter(mode); // initial render
  click(); // user clicks once
  while (dirty) {
    // React re-renders after the handler finishes (batching:
    // three setter calls, ONE re-render)
    dirty = false;
    Counter(mode);
  }
}

mount("naive"); // three setCount(count + 1) calls -> 1
console.log("");
mount("updater"); // three setCount(c => c + 1) calls -> 3`,
  },

  keyPoints: [
    "State is data React stores *outside* your component function so it survives re-renders — the `$_SESSION` to a re-render's 'next request', minus the round-trip.",
    "`const [value, setValue] = useState(initial)` — TypeScript infers the type from `initial`; use an explicit generic like `useState<User | null>(null)` when the state starts empty.",
    "Calling the setter does two things: stores the value and **schedules a re-render**. It never changes the current render's variable — state is a snapshot.",
    "When the next value depends on the previous, use the updater form `setCount(c => c + 1)`; three of those add 3, while three `setCount(count + 1)` calls add 1.",
    "React batches: all setter calls in one handler (and, since React 18, in timeouts/promises too) yield a single re-render.",
    "Rules of hooks: call hooks unconditionally at the top level of components and custom hooks — React matches state cells to components by call order.",
  ],

  interview: [
    {
      q: "What does useState actually do, and how would you explain state to someone from a server-rendered background?",
      a: "A component function re-runs on every render, so its locals are recreated each time — like a PHP script starting cold on every request. `useState` registers a state cell that React stores against that component instance in the tree, so the value survives re-renders the way session data survives requests. The hook returns the current value and a setter; the setter stores the new value and schedules a re-render, and the *next* invocation of the function receives the updated value. So the data flow is one-directional: state changes cause renders, renders read state — you never poke the UI directly.",
    },
    {
      q: "Why does calling setCount(count + 1) three times in one handler only increment once?",
      a: "Because state is a snapshot. `count` is a const captured when the render ran — the setter can't reach back and change it, so all three calls evaluate `count + 1` with the same frozen value and all say 'set it to 1'. React also batches them into a single re-render, but batching isn't the cause — the stale snapshot is. The fix is the updater form, `setCount(c => c + 1)`: React queues the functions and feeds each one the latest pending value, so three of them land on 3. My rule: whenever the next state depends on the previous state, use the updater form.",
    },
    {
      q: "Why can't you call a hook inside an if statement?",
      a: "Because hooks have no names — React identifies them by call order. It keeps an ordered list of state cells per component instance and pairs the first `useState` call with the first cell, the second with the second, and so on. A hook inside a conditional makes the call sequence differ between renders, so every hook after the skipped one reads the wrong cell — you'd get another piece of state's value, or a crash. Hence the rules of hooks: top level only, same order every render, only from components or custom hooks. The `eslint-plugin-react-hooks` lint rules catch violations, and I keep them on error, not warn.",
    },
  ],

  quiz: [
    {
      question:
        "count is 5. A click handler runs setCount(count + 1); console.log(count);. What logs, and what does the next render show?",
      options: [
        "Logs 6; next render shows 6",
        "Logs 5; next render shows 6",
        "Logs 5; next render shows 5",
        "Logs 6; next render shows 5",
      ],
      answerIndex: 1,
      explain:
        "Setting state never mutates the current render's variable — count stays 5 for the rest of the handler (it logs 5). The setter stored 6 and scheduled a re-render, so the next render's snapshot is 6.",
    },
    {
      question:
        "You declare const [items, setItems] = useState([]). TypeScript types items as never[]. What's the idiomatic fix?",
      options: [
        "Cast at each use: (items as string[]).map(...)",
        "Provide the generic: useState<string[]>([])",
        "Switch to useState(null) and check for null everywhere",
        "Disable strict mode for this file",
      ],
      answerIndex: 1,
      explain:
        "Inference only sees the empty array, so it infers never[]. Passing the type argument — useState<string[]>([]) — types both the value and the setter correctly. The same pattern covers 'starts empty' objects: useState<User | null>(null).",
    },
    {
      question:
        "A handler calls setCount(c => c + 1) four times. How many re-renders result, and what is added to count?",
      options: [
        "Four re-renders, +4",
        "One re-render, +1",
        "One re-render, +4",
        "Four re-renders, +1",
      ],
      answerIndex: 2,
      explain:
        "React batches all setter calls in the handler into one re-render. Because these are updater functions, each receives the previous pending value — they chain: +1, +1, +1, +1 = +4 applied in that single render.",
    },
  ],
};

export default lesson;
