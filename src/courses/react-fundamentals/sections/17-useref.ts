import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "useref",
  title: "useRef: DOM Access and Mutable Values",
  part: "Effects, Refs & Rendering",
  estMinutes: 11,
  summary:
    "useRef gives you a mutable box that survives re-renders without causing them — the tool for DOM nodes, timer ids, and other bookkeeping that isn't state.",

  concept: `
\`useState\` has a strict deal: change the value through the setter, and React
re-renders. But some values shouldn't trigger a render — a timer id, the
previous value of a prop, a handle to a DOM node. For those, React gives you
**\`useRef\`**.

### A mutable box that survives renders

\`\`\`tsx
const timerId = useRef<number | null>(null);
timerId.current = window.setInterval(tick, 1000); // write: NO re-render
\`\`\`

\`useRef(initialValue)\` returns \`{ current: initialValue }\` — the **same
object on every render**. Two properties define it:

- Writing \`ref.current\` **never causes a re-render**.
- The value **persists between renders** (unlike a local \`const\`, which is
  recreated every time the component function runs).

Think of the render cycle as PHP's request cycle: a local variable dies with
the request, \`$_SESSION\` persists *and* changes what the next page shows
(that's state), while a ref is like a file handle you keep open across
requests — persistent, but invisible to the rendered page.

### The decision rule

> **Does the value appear in the JSX?** Then it's state — React must know it
> changed. **Is it bookkeeping the UI never displays** (timer ids, previous
> values, an "already submitted" flag, DOM handles)? Then it's a ref.

Rendering \`{ref.current}\` in JSX is the classic bug: you mutate it, nothing
updates, and the stale number only appears when *something else* triggers a
render. One more rule: **don't read or write refs during render** (except
lazy initialization) — mutate them in event handlers and effects, where side
effects belong.

### Refs as DOM handles

Pass a ref to a JSX element and React fills in \`.current\` with the real DOM
node after it mounts:

\`\`\`tsx
function SearchBox() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus(); // node exists after mount
  }, []);

  return <input ref={inputRef} placeholder="Search…" />;
}
\`\`\`

Typing matters: \`useRef<HTMLInputElement>(null)\` gives
\`current: HTMLInputElement | null\` — it's \`null\` until the element mounts
(and again after unmount), so TypeScript forces the \`?.\` or an explicit
check. This replaces \`document.querySelector\`: instead of reaching into a
global DOM and hoping the selector still matches, the component holds a typed
handle to *its own* node.

### React 19: ref is just a prop

On function components, \`ref\` is now a **normal prop** — a child can accept
and forward it like any other value:

\`\`\`tsx
function FancyInput({ ref, label }: { ref?: Ref<HTMLInputElement>; label: string }) {
  return <label>{label}<input ref={ref} /></label>;
}

// Parent: <FancyInput ref={inputRef} label="Email" />
\`\`\`

Before React 19 this required wrapping the child in \`forwardRef(...)\` —
you'll see that in older codebases and interview questions, but it's legacy
API, slated for deprecation. New code just declares \`ref\` in props.
`,

  comparisons: [
    {
      label: "Focusing an input: querySelector vs ref",
      intro:
        "Autofocus a search input when the widget appears. The vanilla version queries the global document; the React version holds a typed handle to its own node.",
      php: `// vanilla.js — reach into the global DOM
const input = document.querySelector('#search');

// Hope: #search exists, is unique on the page, and
// is really an <input> (querySelector returns
// Element | null — .focus() is a leap of faith).
if (input) {
  input.focus();
}

// If another widget renders its own #search,
// this grabs the wrong one silently.`,
      ts: `// SearchBox.tsx — a typed handle to THIS component's node
function SearchBox() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // current: HTMLInputElement | null — TS forces the check
    inputRef.current?.focus();
  }, []); // after first mount, when the node exists

  return <input ref={inputRef} placeholder="Search…" />;
}`,
      note: "The ref is scoped to this component instance and typed as HTMLInputElement — no global selectors, no duplicate-id collisions, and the null-until-mounted case is enforced by the compiler.",
      leftLang: "js",
      rightLang: "tsx",
    },
    {
      label: "A counter in a ref vs in state",
      intro:
        "Both components increment a number on click. Only one of them ever updates the screen.",
      php: `// ❌ RefCounter.tsx — mutates, but the UI never updates
function RefCounter() {
  const count = useRef(0);

  return (
    <button onClick={() => { count.current += 1; }}>
      {/* Always shows the value from the LAST render —
          writing a ref does not trigger one. */}
      Clicked {count.current} times
    </button>
  );
}`,
      ts: `// ✅ StateCounter.tsx — setter tells React to re-render
function StateCounter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(c => c + 1)}>
      {/* Re-renders with the new value on every click. */}
      Clicked {count} times
    </button>
  );
}`,
      note: "The rule in one line: if the value is shown in the JSX it must be state; a ref write is invisible to React, so the screen only catches up when something else renders.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
    {
      label: "Passing a ref to a child: forwardRef (legacy) vs React 19 prop",
      intro:
        "A parent wants to focus an input that lives inside a reusable child component. Pre-19 code needs the forwardRef wrapper; React 19 treats ref as an ordinary prop.",
      php: `// FancyInput.tsx — pre-React-19 (legacy)
const FancyInput = forwardRef<
  HTMLInputElement,
  { label: string }
>(function FancyInput({ label }, ref) {
  return (
    <label>
      {label}
      <input ref={ref} />
    </label>
  );
});
// ref arrives via a second argument, only because
// the component is wrapped in forwardRef(...).`,
      ts: `// FancyInput.tsx — React 19: ref is a normal prop
function FancyInput({
  ref,
  label,
}: {
  ref?: Ref<HTMLInputElement>;
  label: string;
}) {
  return (
    <label>
      {label}
      <input ref={ref} />
    </label>
  );
}

// Parent — identical usage either way:
// <FancyInput ref={inputRef} label="Email" />`,
      note: "In React 19, function components receive ref in props like anything else — forwardRef still works but is legacy and slated for deprecation, so new code shouldn't use it.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Read and predict: two counters, one in a ref and one in state. Work out what the screen shows and what gets logged after each step of the click sequence, then check the output.",
    code: `function Counters() {
  const refCount = useRef(0);
  const [stateCount, setStateCount] = useState(0);

  console.log(\`render — ref: \${refCount.current}, state: \${stateCount}\`);

  return (
    <div>
      <p>ref: {refCount.current} | state: {stateCount}</p>
      <button onClick={() => { refCount.current += 1; }}>ref +1</button>
      <button onClick={() => setStateCount(c => c + 1)}>state +1</button>
    </div>
  );
}

// Click sequence:
// 1. "ref +1"
// 2. "ref +1"
// 3. "state +1"`,
    output: `Mount: logs "render — ref: 0, state: 0"; screen shows "ref: 0 | state: 0".

Click 1 ("ref +1"): refCount.current becomes 1, but writing a ref does NOT
trigger a render — nothing logs, screen still shows "ref: 0 | state: 0".

Click 2 ("ref +1"): refCount.current becomes 2 — again no render, no log,
screen unchanged at "ref: 0 | state: 0".

Click 3 ("state +1"): the setter schedules a render. Logs
"render — ref: 2, state: 1" and the screen updates to "ref: 2 | state: 1" —
both ref writes become visible only because STATE caused a render.`,
  },

  keyPoints: [
    "`useRef(init)` returns the same `{ current }` object on every render — writes persist across renders and never trigger one.",
    "Decision rule: value shown in the JSX → `useState`; invisible bookkeeping (timer ids, previous values, flags, DOM nodes) → `useRef`.",
    "Type DOM refs as `useRef<HTMLInputElement>(null)`; `current` is `T | null` because the node doesn't exist until after mount — null-check or use `?.`.",
    "Attach with `<input ref={inputRef} />` and touch `.current` in effects or event handlers — not during render.",
    "React 19: `ref` is a normal prop on function components — declare it in the props type; `forwardRef` is legacy and slated for deprecation.",
    "Rendering `ref.current` in JSX is a bug pattern: the screen shows a stale value until an unrelated render happens to pick it up.",
  ],

  interview: [
    {
      q: "What's the difference between useRef and useState, and when do you choose each?",
      a: "Both persist a value across renders; the difference is the render contract. `useState` returns an immutable snapshot plus a setter, and calling the setter schedules a re-render — that's how the UI stays in sync. `useRef` returns one stable mutable object, and writing `ref.current` is invisible to React: no re-render, ever. So the rule I use is: if the value appears in the JSX, it must be state; if it's bookkeeping the user never sees — a timer id, a previous value, an 'in flight' flag, a DOM handle — a ref avoids pointless renders. A counter in a ref is the classic bug: the number changes in memory but the screen never updates.",
    },
    {
      q: "How do you access a DOM element in React, and how does that compare to document.querySelector?",
      a: "I create a ref with `useRef<HTMLInputElement>(null)`, pass it as `<input ref={inputRef} />`, and React assigns the real node to `.current` after mount — so I use it inside an effect or event handler, with a null check that TypeScript enforces because the type is `HTMLInputElement | null`. Compared to `querySelector`, the ref is scoped to this component instance rather than the global document, so two instances of the component can't grab each other's nodes, and it's typed to the exact element instead of `Element | null`. It's also declarative: React manages attaching and detaching the node as the component mounts and unmounts.",
    },
    {
      q: "How does passing a ref into a custom component work in React 19?",
      a: "In React 19, `ref` is just a prop on function components — I declare it in the props type, something like `{ ref?: Ref<HTMLInputElement> }`, and forward it to whichever inner element should receive it. Before 19 you couldn't do that: refs weren't passed through props, so the child had to be wrapped in `forwardRef`, which delivered the ref as a separate second argument. `forwardRef` still works for backwards compatibility, but it's legacy API slated for deprecation, so in new code I take `ref` straight from props. It's worth saying in an interview that you'd recognize `forwardRef` in older codebases but wouldn't reach for it today.",
    },
  ],

  quiz: [
    {
      question: "What happens to the UI when you write to ref.current?",
      options: [
        "React re-renders the component with the new value",
        "Nothing — ref writes never trigger a render; the screen updates only when something else causes one",
        "React re-renders only the JSX expressions that read the ref",
        "React throws a warning about mutating during render",
      ],
      answerIndex: 1,
      explain:
        "That's the defining property of a ref: a mutable box React doesn't watch. The write persists across renders, but no render is scheduled — which is exactly why values shown in the UI belong in state instead.",
    },
    {
      question:
        "Why is a DOM ref typed as useRef<HTMLInputElement>(null), making current `HTMLInputElement | null`?",
      options: [
        "Because querySelector might not find the element",
        "Because the node doesn't exist until after the component mounts (and is gone after unmount), so current is null outside that window",
        "It's a TypeScript limitation with generic hooks",
        "Because refs are read-only until the first render completes",
      ],
      answerIndex: 1,
      explain:
        "React fills in .current with the DOM node after mounting and clears it on unmount. During the first render there is no node yet, so the honest type is HTMLInputElement | null — which is why you access it in effects/handlers with a null check.",
    },
    {
      question:
        "In React 19, how does a parent focus an input inside a reusable <FancyInput /> child?",
      options: [
        "Wrap FancyInput in forwardRef — it's the only way to pass a ref down",
        "Use document.querySelector inside the parent's effect",
        "Declare ref as a normal prop on FancyInput's props type and pass <FancyInput ref={inputRef} />",
        "Refs cannot cross component boundaries in React",
      ],
      answerIndex: 2,
      explain:
        "React 19 delivers ref through props on function components, so the child just declares it (e.g. ref?: Ref<HTMLInputElement>) and attaches it to its input. forwardRef still functions but is legacy and slated for deprecation.",
    },
    {
      question:
        "Which value is the best candidate for a ref rather than state?",
      options: [
        "The current page number shown in a paginator",
        "The id returned by setInterval, needed later to clear the timer",
        "The text of a controlled input",
        "Whether a modal is open",
      ],
      answerIndex: 1,
      explain:
        "The interval id is pure bookkeeping — the UI never displays it, and changing it shouldn't re-render anything. Page number, input text, and modal visibility all appear in the rendered output, so they must be state.",
    },
  ],
};

export default lesson;
