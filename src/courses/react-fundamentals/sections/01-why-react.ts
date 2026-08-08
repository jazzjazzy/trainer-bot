import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-react",
  title: "Why React: From Templates to Components",
  part: "Thinking in React",
  estMinutes: 10,
  summary:
    "PHP renders a full page per request and throws it away; React keeps the UI alive in the browser and re-renders components when data changes — UI = f(state).",

  concept: `
Twenty-plus years of PHP gives you a very clear model of a web page: a request
arrives, your script bootstraps, queries the database, \`echo\`s an HTML string,
and the process **dies**. The browser gets a finished, static document. If the
data changes, the user requests the page again and you rebuild the whole thing
from scratch. It's a simple, honest model — and React is much closer to it
than you might expect.

### The problem: the page has to stay alive

Modern UIs don't get to die between interactions. A search box filters as you
type, a "like" count updates without a reload, a dashboard streams new rows in.
The classic answer was jQuery-style JavaScript: find a DOM node, mutate it,
and keep every copy of every value in sync by hand. That works for one counter.
At fifty interacting widgets, the DOM has become a **mutable global database**
with no schema, and every feature must remember to patch every place a value
appears. Miss one and the UI silently lies to the user. SPAs — and React
specifically — exist to kill that class of bug.

### The React idea: UI = f(state)

React's answer is radical in its simplicity: **stop mutating the page.
Describe it instead.** You write functions — *components* — that take data and
return a description of the UI for that data:

\`\`\`tsx
function Inbox({ unread }: { unread: number }) {
  return <h2>Inbox ({unread})</h2>;
}
\`\`\`

When the data changes, React calls your function again, compares the new
description with the previous one, and applies only the minimal DOM changes.
You never write "find \`#count\` and update its text" — you declare what the
UI looks like for *any* state, and React handles the difference.

### A re-render is a fresh page request

Here's the mapping that makes React click for a PHP developer: **a re-render
is a fresh page request that only touches what changed.** In PHP you already
reason like this — every request rebuilds the page from current data, and you
never worry about "updating" the previous response. React gives you the same
rebuild-from-scratch reasoning, but scoped to a component and fast enough to
run on every keystroke. State is the data that survives between those
"requests" (much more on that soon); rendering is your template running again.

### Components are partials with a contract

A component is what \`include 'partial.php'\` always wanted to be: a reusable
chunk of UI. But instead of variables leaking in from the including scope, a
component is a **function** — it has a typed parameter list (props), it
returns its markup as a value, and TypeScript checks every call site.

### Where this course stands

This course teaches **React 19** with **function components and hooks** —
the only style you'll write in a modern codebase or be expected to produce in
an interview. React originally used class components with lifecycle methods
(\`componentDidMount\` and friends); you'll see them in old code and one
legacy corner (error boundaries), but hooks replaced them as the primary API
back in 2019 and everything here is functions.
`,

  comparisons: [
    {
      label: "Rendering a user list",
      intro:
        "Show a list of users with their unread counts. The PHP version is a template rendered server-side per request; the React version is a component that stays mounted in the browser and re-renders when the users array changes.",
      php: `<?php // users.php — rebuilt from scratch on every request
$users = get_users($pdo);
?>
<ul class="users">
  <?php foreach ($users as $user): ?>
    <li>
      <strong><?= htmlspecialchars($user['name']) ?></strong>
      — <?= (int) $user['unread'] ?> unread
    </li>
  <?php endforeach; ?>
</ul>`,
      ts: `// UserList.tsx — a live component; re-renders when data changes
interface User {
  id: number;
  name: string;
  unread: number;
}

function UserList({ users }: { users: User[] }) {
  return (
    <ul className="users">
      {users.map((u) => (
        <li key={u.id}>
          <strong>{u.name}</strong> — {u.unread} unread
        </li>
      ))}
    </ul>
  );
}`,
      note:
        "Same shape of logic — loop, emit markup — but the React version is a typed function the browser can re-run cheaply whenever `users` changes, no page reload and no manual DOM patching.",
    },
    {
      label: "Keeping a counter on screen up to date",
      intro:
        "A button increments a counter shown next to it. Vanilla JS mutates the DOM by hand; React re-describes the UI and lets the library reconcile.",
      php: `// counter.js — imperative: find nodes, mutate, keep in sync
let count = 0;
const btn = document.querySelector('#inc');
const label = document.querySelector('#count');

btn.addEventListener('click', () => {
  count++;
  // Forget this line and the UI silently shows stale data:
  label.textContent = String(count);
});`,
      ts: `// Counter.tsx — declarative: describe the UI for ANY count
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}`,
      note:
        "In the vanilla version, `count` lives in a variable AND in the DOM, and you must keep the two in sync; in React the DOM is derived output — state changes, the function re-runs, done.",
      leftLang: "js",
    },
    {
      label: "One click: full round trip vs in-place update",
      intro:
        "A user likes a post. Classic PHP does a POST, a redirect, and a full page rebuild; React updates one component in place.",
      php: `<?php // like.php — the whole page dies and is rebuilt
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    add_like($pdo, (int) $_POST['post_id']);
    header('Location: /post.php?id=' . (int) $_POST['post_id']);
    exit; // browser re-requests and re-renders EVERYTHING
}`,
      ts: `// LikeButton.tsx — only this component re-renders
import { useState } from 'react';

function LikeButton({ initial }: { initial: number }) {
  const [likes, setLikes] = useState(initial);
  return (
    <button onClick={() => setLikes(likes + 1)}>
      Likes: {likes}
    </button>
  );
}`,
      note:
        "React scopes the 'fresh page request' down to one component: same rebuild-from-data reasoning you use in PHP, without discarding the rest of the page (scroll position, form input, network round trip).",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Declarative rendering with zero React: render(state) returns the UI for whatever state you hand it. Predict the two HTML blocks and the final line, then run it.",
    code: `// Declarative rendering in miniature: the UI is a pure function of state.
// No React here — just the core idea it is built on.

interface AppState {
  user: string;
  unread: number;
}

// "The component": given state, DESCRIBE the UI. Never mutate anything.
function render(state: AppState): string {
  const badge = state.unread > 0 ? \` (\${state.unread} unread)\` : '';
  return '<header>\\n' +
    \`  <span>Signed in as \${state.user}\${badge}</span>\\n\` +
    '</header>';
}

// First "request": initial state in, HTML out.
let state: AppState = { user: 'jason', unread: 3 };
console.log(render(state));

// The user reads their messages. We do NOT hunt down a DOM node and
// patch its text — we make NEW state and call render again:
state = { ...state, unread: 0 };
console.log(render(state));

// Same state in => same UI out, every time. That purity is what lets
// React re-run your components safely and diff the results.
console.log('render(state) is pure: ' + (render(state) === render(state)));`,
  },

  keyPoints: [
    "PHP's model: request in, build full HTML, process dies. React's model: components stay alive in the browser and re-render when their data changes.",
    "UI = f(state): components are functions from data to a description of the UI — you declare what the page looks like, React works out the DOM changes.",
    "Think of a re-render as a fresh page request scoped to one component — the same rebuild-from-current-data reasoning you already use in PHP.",
    "Manual DOM patching (querySelector + mutation) turns the DOM into an unmanaged mutable database; React exists to eliminate that sync-by-hand bug class.",
    "A component is a typed template partial: props go in through an enforced signature instead of variables leaking in from scope.",
    "This course is React 19: function components and hooks only — class components are history apart from error boundaries.",
  ],

  interview: [
    {
      q: "What problem does React solve — why do SPAs exist at all?",
      a: "Server-rendered pages are stateless: every interaction costs a full round trip and a full page rebuild, which is fine for documents but too slow and disruptive for app-like UIs. The first-generation fix was imperative JavaScript — query the DOM, mutate it, and manually keep every on-screen value in sync with your data, which scales terribly and breeds stale-UI bugs. React solves the synchronization problem: you describe the UI as a pure function of state, and when state changes React re-runs that function and applies the minimal DOM updates itself. So the page stays alive and responsive like an app, but the developer keeps the simple 'rebuild everything from current data' mental model of a server-rendered page.",
    },
    {
      q: "What does 'UI is a function of state' actually mean in practice?",
      a: "It means the rendered output is always derived from data, never edited in place. A component takes props and state and returns a description of the markup for exactly that data; there is no code path that says 'find this element and change its text'. When the data changes, React calls the function again and reconciles the new description against the old one. The big practical consequence is that components must be pure during render — same inputs, same output, no side effects — because React assumes it can re-run them at any time and discard results.",
    },
    {
      q: "Coming from PHP templating, what's the biggest mental-model shift moving to React?",
      a: "Surprisingly little changes about rendering itself — a re-render is essentially a fresh page request that only touches what changed, so the PHP habit of rebuilding the view from current data transfers directly. The real shifts are: the code keeps running after the first render instead of dying, so some data has to live in memory between renders — that's state; templates become typed functions, so the compiler checks what I pass into markup; and I stop mutating the document entirely — no equivalent of echoing a bit more HTML or patching a node, just new data in, new description out.",
    },
  ],

  quiz: [
    {
      question:
        "In React's mental model, what happens when a component's data changes?",
      options: [
        "React finds the affected DOM nodes and your code mutates their contents directly",
        "The component function runs again, and React diffs the new output against the old to apply minimal DOM updates",
        "The browser reloads the page section via an automatic AJAX round trip to the server",
        "The component's HTML string is appended after the previous version",
      ],
      answerIndex: 1,
      explain:
        "React is declarative: your component re-runs and returns a fresh description of the UI, and React's reconciler computes and applies the minimal DOM changes. You never write the 'find node, mutate it' step — that imperative style is exactly what React replaces.",
    },
    {
      question:
        "Which PHP-era intuition transfers MOST directly to React rendering?",
      options: [
        "Global variables shared across includes",
        "Rebuilding the page from current data on every request",
        "Echoing extra HTML mid-request to update the page",
        "Storing UI state in $_SESSION between requests",
      ],
      answerIndex: 1,
      explain:
        "A re-render is like a fresh page request scoped to a component: React re-runs your function against current data and never 'edits' the previous output. The other options are mutation- or server-state habits that don't map to rendering.",
    },
    {
      question:
        "Why does manual DOM manipulation (querySelector + mutation) break down as an app grows?",
      options: [
        "The DOM API is too slow for more than a few elements",
        "Browsers limit how many event listeners a page can register",
        "Every value ends up living in both JS variables and DOM nodes, and every feature must remember to update every copy",
        "querySelector cannot select dynamically created elements",
      ],
      answerIndex: 2,
      explain:
        "The killer is synchronization, not speed: state gets duplicated into the DOM, and each new feature multiplies the places that must be patched in sync. React removes the duplication by treating the DOM as derived output of a render function.",
    },
    {
      question: "What is the status of class components in React 19?",
      options: [
        "They are the recommended way to write stateful components",
        "They are legacy — modern React uses function components with hooks, with error boundaries as the one remaining class use case",
        "They were removed entirely and no longer compile",
        "They are required for any component that fetches data",
      ],
      answerIndex: 1,
      explain:
        "Hooks (2019) made function components the primary API, and React 19 code is written that way. Classes still work and remain necessary for error boundaries, but you write and interview with function components.",
    },
  ],
};

export default lesson;
