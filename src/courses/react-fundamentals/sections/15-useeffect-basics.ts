import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "useeffect-basics",
  title: "useEffect: Synchronizing with the Outside World",
  part: "Effects, Refs & Rendering",
  estMinutes: 13,
  summary:
    "Effects run after the commit and exist to synchronize your component with external systems — timers, subscriptions, browser APIs — with a cleanup function that undoes the setup.",

  concept: `
Rendering must stay pure — but real apps need timers, event listeners on
\`window\`, \`document.title\`, WebSocket subscriptions. \`useEffect\` is where that
code lives. Get the framing right from day one: an effect **synchronizes your
component with an external system**. It is *not* "run some code when a variable
changes" — that misreading produces most effect bugs.

### Effects run after the commit

\`\`\`tsx
useEffect(() => {
  document.title = \`\${unread} unread\`;
});
\`\`\`

The function you pass does **not** run during render. React renders, commits
the changes to the DOM — *then* the effect runs (usually after the browser has
painted). That ordering is the whole point: by effect time the DOM is real and
up to date, so touching the outside world is safe. Render describes; effects
synchronize.

### The dependency array: three shapes

The second argument controls *when* the effect re-runs:

\`\`\`tsx
useEffect(() => { ... });          // no array: after EVERY render
useEffect(() => { ... }, []);      // []: after the first render only (mount)
useEffect(() => { ... }, [title]); // after renders where title changed
\`\`\`

"Changed" means compared with \`Object.is\` against the previous render's value —
the same reference-equality rule state updates use. That has a sharp edge:
an object or array literal built during render is a *new reference every
time*, so listing one as a dependency makes the effect fire on every render.
Depend on primitives, or on values whose identity is stable.

The honest rule for filling the array: **every reactive value the effect reads
belongs in it** — props, state, anything derived from them. The array is not a
scheduling knob; it's a declaration of what the effect depends on. Lie to it
(the linter will catch you) and the effect runs with stale values.

### Cleanup: undo what setup did

Return a function from the effect and React treats it as the **cleanup**:

\`\`\`tsx
useEffect(() => {
  const id = setInterval(tick, 1000);      // setup
  return () => clearInterval(id);          // cleanup
}, []);
\`\`\`

Cleanup runs at two moments: **before the effect runs again** (so the old
interval is cleared before a new one starts) and **when the component
unmounts** (so nothing leaks after the component is gone). Think
subscribe/unsubscribe, connect/disconnect, addEventListener/removeEventListener
— every setup with a lasting footprint needs its inverse. PHP mostly spared
you this: the process died after each request and took its garbage with it. A
React component lives on one long-running page, so *you* are the cleanup.

### StrictMode: setup, cleanup, setup

In development, \`<StrictMode>\` runs one extra setup/cleanup cycle when a
component mounts: **setup → cleanup → setup**. It is a proof: if your cleanup
truly undoes your setup, the extra cycle is invisible. If you see doubled
intervals, duplicate subscriptions, or two fetches, StrictMode didn't break
your app — it revealed that cleanup was missing or incomplete. Never "fix" it
by deleting StrictMode; write the cleanup. Production runs setup once.

### What does NOT belong in an effect

Two anti-patterns to name in interviews. Deriving state:
\`setFullName(first + " " + last)\` in an effect is an extra render for nothing —
compute it during render instead. And responding to user events: a click
handler's logic belongs in the handler, not in an effect watching a flag the
handler sets. If no external system is involved, you probably don't need an
effect.
`,

  comparisons: [
    {
      label: "A window listener: leak vs cleanup",
      intro:
        "A widget tracks the window width. The vanilla version adds a listener when the widget is created and never removes it; the React version pairs setup with cleanup so mounting and unmounting leaves no trace.",
      php: `// widget.js — setup with no inverse
function createWidthWidget(el) {
  function onResize() {
    el.textContent = \`width: \${window.innerWidth}px\`;
  }
  window.addEventListener("resize", onResize);
  onResize();
}

// Later, the widget's DOM is thrown away:
document.querySelector("#sidebar").innerHTML = "";
// ...but the resize listener is still registered,
// still firing, still holding \`el\` in memory.
// Every open/close of the sidebar adds another one.`,
      ts: `// WidthWidget.tsx — setup and its inverse, together
function WidthWidget() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize); // setup
    return () =>
      window.removeEventListener("resize", onResize); // cleanup
  }, []);

  return <p>width: {width}px</p>;
}
// Unmount the widget and React runs the cleanup:
// no listener left behind, no leak, mount it a
// hundred times and you still have at most one.`,
      note: "The vanilla leak is silent — nothing errors, memory just grows. useEffect forces the fix into the pattern itself: the cleanup returned from setup runs on every re-run and on unmount.",
      leftLang: "js",
    },
    {
      label: "Syncing document.title: scattered writes vs one effect",
      intro:
        "The tab title should always show the unread count. Left: every code path that changes the count also remembers to write the title. Right: one effect declares the synchronization and React keeps it true.",
      php: `// Inbox.tsx — imperative writes on every path
function Inbox() {
  const [unread, setUnread] = useState(0);

  function markRead() {
    setUnread(unread - 1);
    document.title = \`(\${unread - 1}) Inbox\`; // path 1
  }

  function receiveMessage() {
    setUnread(unread + 1);
    document.title = \`(\${unread + 1}) Inbox\`; // path 2
  }

  // Add "mark all read" next sprint and forget the
  // title write — the tab silently shows stale data.
  return <button onClick={markRead}>Mark read</button>;
}`,
      ts: `// Inbox.tsx — one declaration of the sync
function Inbox() {
  const [unread, setUnread] = useState(0);

  // However unread changes — today's handlers or
  // next sprint's — the title follows:
  useEffect(() => {
    document.title = \`(\${unread}) Inbox\`;
  }, [unread]);

  return (
    <>
      <button onClick={() => setUnread(unread - 1)}>
        Mark read
      </button>
      <button onClick={() => setUnread(unread + 1)}>
        Simulate message
      </button>
    </>
  );
}`,
      note: "The effect states an invariant — 'the title mirrors unread' — instead of repeating a write on every path; [unread] re-runs it exactly when the value changes (compared by Object.is).",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "A ticking counter with an interval effect, mounted under StrictMode. Predict the exact dev-console sequence at mount — count the setups and cleanups before you look.",
    code: `function Ticker() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    console.log("effect: setup — starting interval");
    const id = setInterval(() => setCount((c) => c + 1), 1000);
    return () => {
      console.log("cleanup: clearing interval");
      clearInterval(id);
    };
  }, []); // [] — synchronize once with the timer system

  return <p>Ticks: {count}</p>;
}

// main.tsx
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Ticker />
  </StrictMode>
);`,
    output: `Dev console at mount — StrictMode runs one extra setup/cleanup cycle:

effect: setup — starting interval
cleanup: clearing interval
effect: setup — starting interval

Exactly ONE interval survives, so the page ticks once per second:
"Ticks: 1", "Ticks: 2", …

Delete the cleanup return and the sequence becomes setup, setup — TWO
live intervals, and the counter climbs twice per second in dev. That
is StrictMode catching a real leak, not StrictMode being broken.

Production build: setup runs once; the extra cycle is dev-only.`,
  },

  keyPoints: [
    "Effects run **after the commit** — React renders, updates the DOM, and then your effect fires (usually after the browser paints). Render describes; effects synchronize with the outside.",
    "The purpose is synchronizing with **external systems** (timers, listeners, subscriptions, `document.title`) — not 'run code when a variable changes', and not deriving state you could compute during render.",
    "Three dependency shapes: no array = after every render; `[]` = on mount only; `[dep]` = when `dep` changes, compared by `Object.is` — so a fresh object literal as a dep re-fires every render.",
    "The array declares every reactive value the effect reads — it is a dependency list, not a scheduling knob, and the lint rule enforcing it is right.",
    "Return a cleanup function to undo the setup; it runs **before each re-run of the effect** and **on unmount** — subscribe/unsubscribe always travel together.",
    "StrictMode runs setup → cleanup → setup once at mount, in dev only: if that extra cycle is visible (doubled timers, duplicate requests), your cleanup is missing — fix the cleanup, never remove StrictMode.",
  ],

  interview: [
    {
      q: "When does a useEffect callback actually run, and how do the dependency array shapes control it?",
      a: "After the commit: React renders the component, applies the DOM changes, and only then runs effects — never during render, which must stay pure. The dependency array then gates re-runs: omit it and the effect runs after every render; pass `[]` and it runs only after the first mount; pass `[dep]` and it re-runs only after renders where a dependency changed, compared to the previous value with `Object.is`. That comparison is reference-based for objects, so depending on an object literal built during render re-fires the effect every time — I depend on primitives or stable references. And the array should list every reactive value the effect reads; it's a declaration of dependencies, not a timer setting.",
    },
    {
      q: "Explain effect cleanup — when does it run and why does it matter?",
      a: "If the effect returns a function, React calls it at two moments: right before the effect runs again — so the previous setup is torn down before the next one starts — and when the component unmounts. It matters because effects create things with a lasting footprint: intervals, event listeners, subscriptions, socket connections. In PHP the process died after each request and cleanup was free; a React component lives inside a long-running page, so every subscribe needs its unsubscribe or you leak. My rule is that setup and its inverse are written together in the same effect, like a pair.",
    },
    {
      q: "In development your effect runs twice on mount. Is that a bug, and what should you do about it?",
      a: "That's StrictMode, and it's deliberate: in dev, React mounts, runs your effect, immediately runs its cleanup, then runs setup again — setup, cleanup, setup. It's a correctness proof: if cleanup genuinely inverts setup, the extra cycle is unobservable. If instead you see two intervals ticking or duplicate subscriptions, StrictMode has exposed a missing or incomplete cleanup that would have bitten you in production the first time the component remounted. The fix is to write proper cleanup — never to delete StrictMode or hack a 'didRun' ref to suppress the second run. Production builds run setup exactly once.",
    },
    {
      q: "What are common things people put in useEffect that don't belong there?",
      a: "Two big ones. First, derived state: `useEffect(() => setFullName(first + ' ' + last), [first, last])` renders once with stale data and again after the set — just compute `const fullName = first + ' ' + last` during render. Second, event logic: setting a flag in a click handler and having an effect 'watch' it splits one user action across two renders; the logic belongs in the handler itself. The litmus test I use: is there an external system being synchronized — a timer, a listener, a subscription, the document? If not, I almost certainly don't need an effect.",
    },
  ],

  quiz: [
    {
      question: "When does React run an effect's setup function?",
      options: [
        "During render, right where useEffect is called",
        "After React commits the render to the DOM",
        "Before rendering, so the effect can prepare data",
        "Only when the component unmounts",
      ],
      answerIndex: 1,
      explain:
        "useEffect registers the function during render, but React runs it after the commit — the DOM is already updated when it fires. That's what keeps render pure while still giving you a safe place for side effects.",
    },
    {
      question:
        "What does `useEffect(fn, [user])` compare to decide whether to re-run, and what's the trap if `user` is an object built during render?",
      options: [
        "A deep equality check — nested changes are detected, no trap",
        "Object.is on each dependency — a fresh object literal each render never equals the last one, so the effect runs every render",
        "JSON.stringify of the array — slow but correct",
        "Reference equality only on the array itself, not its items",
      ],
      answerIndex: 1,
      explain:
        "Dependencies are compared one by one with Object.is, which for objects means reference identity. An object recreated during every render is always 'new', so the effect fires every render despite the array. Depend on the primitive fields (user.id) or a stable reference instead.",
    },
    {
      question:
        "An effect subscribes to a WebSocket. When does its cleanup (the returned function) run?",
      options: [
        "Only when the whole app shuts down",
        "Immediately after setup, every time",
        "Before the effect re-runs due to changed dependencies, and when the component unmounts",
        "Only if the component throws an error",
      ],
      answerIndex: 2,
      explain:
        "Cleanup is the inverse of setup and runs before each re-run (tearing down the old subscription before the new one opens) and at unmount (so nothing outlives the component). StrictMode's dev-only setup/cleanup/setup cycle exists to verify exactly this pairing.",
    },
    {
      question:
        "In dev with StrictMode, a component's data-fetch effect fires two requests on mount. What's the correct response?",
      options: [
        "Remove StrictMode — it's a dev tool causing false alarms",
        "Guard the effect with a ref so it only ever runs once",
        "Accept it: it's dev-only, and make the effect correct under remounting — proper cleanup (e.g. aborting/ignoring the stale request)",
        "Move the fetch into the render body so it runs before StrictMode's check",
      ],
      answerIndex: 2,
      explain:
        "StrictMode's setup/cleanup/setup cycle simulates a remount, which real apps do all the time. The effect should survive that: cleanup aborts or flags the first request so its result is discarded. Deleting StrictMode or one-shot ref guards hides the very bug being surfaced, and fetching during render breaks purity.",
    },
  ],
};

export default lesson;
