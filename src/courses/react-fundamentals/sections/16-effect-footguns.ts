import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "effect-footguns",
  title: "useEffect Footguns (and When You Don't Need an Effect)",
  part: "Effects, Refs & Rendering",
  estMinutes: 13,
  summary:
    "Most useEffect bugs come from effects that shouldn't exist — learn the litmus test, the classic footguns, and the render-time alternatives interviewers expect you to reach for.",

  concept: `
The most common React interview probe isn't "what does useEffect do" — it's
"here's an effect, tell me what's wrong with it". The answer is usually the
same: **the effect shouldn't exist**. React's own docs have a whole page
titled *You Might Not Need an Effect*, and it's the highest-yield page in
the documentation.

### The litmus test

> **Is this code synchronizing with an external system?** A network API, a
> browser API (title, localStorage, a subscription), a timer, a non-React
> widget? If yes — effect. If it only transforms data you already have, or
> reacts to a user event — **no effect**.

In PHP terms: an effect is for side channels *outside* the request/response
cycle. Computing a value from data you already hold is just... code in the
template. You'd never fire a follow-up sub-request to concatenate two strings.

### Footgun 1: mirroring props/state into state

\`\`\`tsx
// ❌ render → effect → setState → render again. Two renders, stale flash.
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(firstName + ' ' + lastName);
}, [firstName, lastName]);
\`\`\`

If a value can be **computed from existing props or state, compute it during
render**: \`const fullName = firstName + ' ' + lastName;\`. Every render
recomputes it, so it can never be stale, and there's no second render pass.
Derived state in React is a plain \`const\`, exactly like a derived variable
in a PHP template.

### Footgun 2: object and function dependencies

React compares each dependency with \`Object.is\` — reference equality for
objects. A component body runs top to bottom on every render, so any object
or function literal you declare there is a **new reference every render**:

\`\`\`tsx
const options = { userId, page };        // new object each render
useEffect(() => {
  fetchItems(options).then(setItems);    // setItems → render → new options
}, [options]);                           // → effect again → infinite loop
\`\`\`

Depend on the primitives instead — \`[userId, page]\` — or build the object
*inside* the effect. Same disease, different symptom: an unstable function
dep re-runs the effect every render.

### Footgun 3: lying to the linter

\`react-hooks/exhaustive-deps\` flags every value the effect reads that isn't
in the array. Silencing it with an empty array or an ignore comment doesn't
fix anything — it means the effect reads **stale values** from the render it
was created in. The linter is almost never wrong; if satisfying it causes a
loop, the code structure is wrong (see footguns 1 and 2), not the rule.

### Footgun 4: resetting state when a prop changes

Wanting a form to reset when \`userId\` changes tempts people into a
\`useEffect(() => setDraft(''), [userId])\`. The React way: give the component
a \`key\`:

\`\`\`tsx
<ProfileForm key={userId} userId={userId} />
\`\`\`

A changed key tells React "this is a *different* instance" — it unmounts the
old one and mounts a fresh one, resetting **all** state in one pass, with no
flash of stale UI.

### What legitimately needs an effect

Syncing with the outside world: subscribing to a WebSocket, setting
\`document.title\`, starting/clearing a timer, measuring a DOM node,
integrating a jQuery-era widget. Fetch-on-mount is the borderline case —
it's an external system, so an effect is *correct*, but data libraries
(covered later) handle it better.
`,

  comparisons: [
    {
      label: "Derived state: effect mirror vs plain computation",
      intro:
        "Both components display a full name built from two state fields. The left one stores the result in extra state kept in sync by an effect; the right one just computes it.",
      php: `// ❌ FullNameBad.tsx — state mirroring via effect
function FullName() {
  const [firstName, setFirstName] = useState('Grace');
  const [lastName, setLastName] = useState('Hopper');

  // Redundant state + an effect to babysit it:
  const [fullName, setFullName] = useState('');
  useEffect(() => {
    setFullName(firstName + ' ' + lastName);
  }, [firstName, lastName]);

  // First render after a name change still shows the
  // OLD fullName; the effect fixes it one render later.
  return <h1>{fullName}</h1>;
}`,
      ts: `// ✅ FullNameGood.tsx — derive during render
function FullName() {
  const [firstName, setFirstName] = useState('Grace');
  const [lastName, setLastName] = useState('Hopper');

  // Recomputed on every render — can never be stale,
  // no extra state, no extra render pass.
  const fullName = firstName + ' ' + lastName;

  return <h1>{fullName}</h1>;
}`,
      note: "If a value can be computed from existing props/state, compute it during render — mirroring it into state costs an extra render and opens a stale-data window.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
    {
      label: "Object dependency loop vs primitive deps",
      intro:
        "Both effects fetch a user's items when the user or page changes. The left one depends on an object recreated every render — and loops forever.",
      php: `// ❌ Items.tsx — infinite loop
function Items({ userId, page }: Props) {
  const [items, setItems] = useState<Item[]>([]);

  // New object reference on EVERY render:
  const query = { userId, page };

  useEffect(() => {
    fetchItems(query).then(setItems);
    // setItems → re-render → new query object →
    // Object.is says "changed" → effect runs again → ...
  }, [query]);

  return <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>;
}`,
      ts: `// ✅ Items.tsx — depend on the primitives
function Items({ userId, page }: Props) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    // Build the object INSIDE the effect:
    const query = { userId, page };
    fetchItems(query).then(setItems);
  }, [userId, page]); // strings/numbers compare by value

  return <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>;
}`,
      note: "Deps are compared with Object.is — objects/functions declared in the component body are new references every render, so depend on primitive fields (or move the object inside the effect).",
      leftLang: "tsx",
      rightLang: "tsx",
    },
    {
      label: "Resetting state on prop change: effect vs key",
      intro:
        "A comment form should start blank whenever the user navigates to a different post. The left version patches state with an effect; the right version tells React it's a new instance.",
      php: `// ❌ CommentForm reset via effect
function CommentForm({ postId }: { postId: number }) {
  const [draft, setDraft] = useState('');

  // Renders once with the OLD draft, then clears —
  // and every new piece of state needs adding here.
  useEffect(() => {
    setDraft('');
  }, [postId]);

  return <textarea value={draft}
    onChange={e => setDraft(e.target.value)} />;
}`,
      ts: `// ✅ Parent passes a key — React remounts the form
function PostPage({ postId }: { postId: number }) {
  // New key ⇒ different instance ⇒ ALL state resets
  // in one pass, no stale flash:
  return <CommentForm key={postId} postId={postId} />;
}

function CommentForm({ postId }: { postId: number }) {
  const [draft, setDraft] = useState('');
  return <textarea value={draft}
    onChange={e => setDraft(e.target.value)} />;
}`,
      note: "A changed key unmounts and remounts the component, resetting every piece of its state at once — no effect, no flash of the previous user's data.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The root cause of dependency loops, runnable: Object.is compares references for objects, and each simulated 'render' creates fresh ones. Predict all the logged booleans, then run it.",
    code: `// Why effects with object/function deps loop: every render creates
// NEW references, and React compares dependencies with Object.is.

console.log('--- Object.is: primitives vs objects ---');
console.log(Object.is('ava', 'ava')); // same value
console.log(Object.is(42, 42)); // same value
console.log(Object.is({ a: 1 }, { a: 1 })); // two different objects
console.log(Object.is([1, 2], [1, 2])); // two different arrays

// Simulate two renders of the same component with the SAME props.
// Each call to render() is one execution of the component function.
function render(userId: number) {
  const options = { userId, page: 1 }; // recreated every "render"
  const load = () => \`load user \${userId}\`; // recreated every "render"
  return { options, load };
}

const first = render(7);
const second = render(7); // a re-render for some unrelated reason

console.log('--- What React sees when it compares deps ---');
console.log('options changed?', !Object.is(first.options, second.options));
console.log('load changed?   ', !Object.is(first.load, second.load));
console.log(
  'userId changed? ',
  !Object.is(first.options.userId, second.options.userId),
);

// The fix is always the same: depend on the primitives.
// [options]                      -> re-runs every render (new object each time)
// [options.userId, options.page] -> re-runs only when the values change`,
  },

  keyPoints: [
    "The litmus test: an effect is only for **synchronizing with an external system** (network, browser APIs, timers, non-React widgets). Transforming data you already have is not an effect's job.",
    "Derived state is a plain `const` computed during render — never `useState` + `useEffect` to mirror other props/state; that costs an extra render and can flash stale values.",
    "Dependencies are compared with `Object.is`: objects and functions created in the component body are new references every render, so an object dep + `setState` in the effect = infinite loop. Depend on primitive fields instead.",
    "Never silence `react-hooks/exhaustive-deps` — a lied-to dependency array means the effect closes over stale values; restructure the code, don't mute the linter.",
    "To reset a component's state when a prop changes, pass `key={thatProp}` from the parent — React remounts the component and resets all state in one pass.",
    "`setState` inside an effect whose deps include that same state (directly or via a derived object) retriggers the effect — the classic self-sustaining loop.",
  ],

  interview: [
    {
      q: "When should you NOT use useEffect?",
      a: "Whenever the code isn't synchronizing with an external system. The two big cases: derived data and event handling. If a value can be computed from existing props or state — a filtered list, a full name, a total — I compute it during render as a plain `const`; mirroring it into state with an effect adds a redundant render pass and a window where the UI shows stale data. And if something should happen because the user did something — a POST on submit, navigation on click — that logic belongs in the event handler, not in an effect watching a state flag. Effects are for subscriptions, timers, `document.title`, manual DOM work, and syncing with non-React code.",
    },
    {
      q: "Why can an effect with an object in its dependency array cause an infinite loop?",
      a: "React compares each dependency against the previous render's value with `Object.is`, which is reference equality for objects. The component function re-runs on every render, so an object or function literal declared in its body is a brand-new reference each time. If the effect then calls `setState`, that triggers a render, the render creates a new object, `Object.is` reports a change, the effect runs again, and you're in a loop. The fix is to depend on the primitive fields (`[userId, page]` instead of `[query]`), move the object creation inside the effect, or memoize it — primitives compare by value, so they break the cycle.",
    },
    {
      q: "How do you reset a component's state when one of its props changes?",
      a: "Not with an effect — the idiomatic answer is a `key`. The parent renders `<ProfileForm key={userId} userId={userId} />`; when the key changes, React treats it as a different component instance, unmounts the old one and mounts a fresh one, so every piece of internal state resets in a single pass. The effect version (`useEffect(() => setDraft(''), [userId])`) renders once with the previous user's data before clearing it, and has to be updated every time you add a new state variable. The key approach also mirrors how reconciliation already works for list items.",
    },
    {
      q: "The exhaustive-deps lint rule is complaining about your effect. Is it ever right to suppress it?",
      a: "Practically never — the rule reports exactly which reactive values the effect reads but won't react to, so suppressing it just guarantees stale closures. When the rule and my intent seem to conflict, that's a design signal: if adding the dep causes a loop, I'm usually depending on an unstable object or setting state I derive from; if I 'only want it to run once,' I should ask whether it's really mount-only synchronization or misplaced logic. The right responses are restructuring — derive during render, depend on primitives, move object creation into the effect, use the updater form of setState — rather than an ignore comment.",
    },
  ],

  quiz: [
    {
      question:
        "A component stores `fullName` in state and keeps it in sync with `firstName`/`lastName` using an effect. What's the idiomatic fix?",
      options: [
        "Add fullName to the effect's dependency array",
        "Compute fullName as a plain const during render and delete the state and effect",
        "Wrap the setFullName call in setTimeout to avoid the extra render",
        "Move the effect into a useLayoutEffect so it runs before paint",
      ],
      answerIndex: 1,
      explain:
        "Values derivable from existing props/state should be computed during render — `const fullName = firstName + ' ' + lastName`. The effect version needs an extra render to converge and can briefly show stale data; useLayoutEffect only hides the flash, it doesn't remove the redundant state.",
    },
    {
      question:
        "An effect depends on `[options]` where `const options = { userId, page }` is declared in the component body, and the effect calls setState. What happens?",
      options: [
        "Nothing unusual — React deep-compares the object and sees it's unchanged",
        "The effect runs only on mount because objects are ignored in dependency arrays",
        "An infinite loop: each render creates a new object reference, Object.is reports a change, the effect re-runs and sets state again",
        "React throws an error because objects are not allowed as dependencies",
      ],
      answerIndex: 2,
      explain:
        "Dependency comparison uses Object.is — shallow reference equality, never a deep compare. A fresh object each render always looks 'changed', so the effect re-runs, sets state, causes another render, and loops. Depend on options.userId and options.page instead.",
    },
    {
      question:
        "You want a `<UserProfile userId={id} />` component's internal state to fully reset whenever `userId` changes. Best approach?",
      options: [
        "useEffect(() => resetAllState(), [userId]) inside UserProfile",
        "Render it as <UserProfile key={userId} userId={userId} /> so React remounts it",
        "Store userId in state inside UserProfile and compare it on each render",
        "Call the state setters at the top of the component body when the prop differs",
      ],
      answerIndex: 1,
      explain:
        "A changed key tells the reconciler this is a different instance: unmount, remount, all state fresh in one pass. The effect version renders stale data first and must enumerate every state variable by hand.",
    },
    {
      question:
        "Which of these genuinely needs a useEffect?",
      options: [
        "Filtering a list of products by a search query held in state",
        "Sending an analytics event when the user clicks 'Buy'",
        "Subscribing to a WebSocket when the component mounts and unsubscribing on unmount",
        "Computing the cart total from the items array",
      ],
      answerIndex: 2,
      explain:
        "A WebSocket is an external system — subscribe in the effect, return a cleanup that unsubscribes. Filtering and totals are derived data (compute during render); the click analytics belongs in the click handler, since it's caused by an event, not by rendering.",
    },
  ],
};

export default lesson;
