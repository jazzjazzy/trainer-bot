import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "immutable-updates",
  title: "Immutable Updates: Objects and Arrays in State",
  part: "State, Events & Forms",
  estMinutes: 11,
  summary:
    "React detects change by reference (Object.is), so mutating an object or array in state is invisible — every update must produce a new object, via spread for objects and map/filter/spread for arrays.",

  concept: `
Here is the habit that bites PHP developers hardest. In PHP, arrays have
**value semantics**: \`$b = $a;\` copies, and changing \`$b\` never touches
\`$a\`. In JavaScript, objects and arrays are **references**: \`const b = a;\`
makes two names for one object, and \`b.push(...)\` changes what both see.
Twenty-five years of \`$rows[] = $row;\` muscle memory now points at a
loaded foot-gun.

### Why React cares: change detection by reference

After you call a state setter, React asks one cheap question: *is the new
value a different reference from the old one?* (\`Object.is(old, next)\`). It
does **not** deep-compare contents — that would be slow and unreliable. So:

\`\`\`ts
const [user, setUser] = useState({ name: "Jason", city: "Sydney" });

// ✗ Mutation: same reference — React sees "no change"
user.city = "Melbourne";
setUser(user); // Object.is(old, new) === true -> render skipped (state setters bail out)

// ✓ New object: different reference — re-render
setUser({ ...user, city: "Melbourne" });
\`\`\`

Treat everything in state as **read-only**. An update means: build a new
object/array that shares the unchanged parts and replaces the changed ones.

### Objects: spread, outermost to innermost

\`\`\`ts
setUser({ ...user, city: "Melbourne" });

// Nested: copy EVERY level you change
setUser({
  ...user,
  address: { ...user.address, city: "Melbourne" },
});
\`\`\`

Spread is a *shallow* copy — that's exactly what you want. Untouched branches
(\`user.skills\` above) are shared by reference, which is cheap and safe as
long as you never mutate them either.

### Arrays: the replacement table

| Intent | Mutates (never) | Returns new (use this) |
|---|---|---|
| add | \`push\`, \`unshift\` | \`[...items, x]\` / \`[x, ...items]\` |
| remove | \`splice\` | \`items.filter((i) => i.id !== id)\` |
| update one | \`items[i] = x\` | \`items.map((i) => i.id === id ? { ...i, done: true } : i)\` |
| sort/reverse | \`sort\`, \`reverse\` | \`[...items].sort(cmp)\` — copy first |

\`sort\` is the sneakiest: it *returns* the array, so
\`setItems(items.sort(cmp))\` looks functional but sorted **in place** and
returned the same reference — no re-render, plus you corrupted the previous
state. Always \`[...items].sort(cmp)\`. (ES2023 added \`toSorted\`,
\`toReversed\` and \`toSpliced\` — non-mutating versions, use them where your
target environment allows.)

### Why the rule exists (it's not pedantry)

- **Skipped renders**: same reference → \`Object.is\` says unchanged → UI
  silently stale. The bug report reads "sorting does nothing".
- **Cheap comparisons everywhere**: reference equality is also how effect
  dependency arrays and \`React.memo\` decide "did this change?" — mutation
  lies to all of them.
- **Snapshots stay trustworthy**: the previous render's state is history;
  mutating it rewrites history that concurrent features and debugging rely on.

For deeply nested state where spreads pile up, the community answer is
[Immer](https://immerjs.github.io/immer/) (\`produce\` lets you "mutate" a
draft and emits an immutable copy) — worth naming in an interview — but
spread patterns are the fundamentals you'll be tested on.
`,

  comparisons: [
    {
      label: "PHP copies, JavaScript aliases",
      intro:
        "Assign an array to a second variable and append to it. PHP gives you an independent copy; JavaScript gives you a second name for the same array.",
      php: `<?php
$a = ['php', 'sql'];
$b = $a;        // VALUE semantics: $b is a copy
$b[] = 'react';

print_r($a);    // ['php', 'sql']        — untouched
print_r($b);    // ['php', 'sql', 'react']

// Objects are the exception (handles since PHP 5),
// but arrays — what you use daily — copy on assign.`,
      ts: `// aliasing.ts
const a = ["php", "sql"];
const b = a;      // REFERENCE: two names, one array
b.push("react");

console.log(a);   // ["php", "sql", "react"] — changed!
console.log(b);   // ["php", "sql", "react"]
console.log(Object.is(a, b)); // true — same object

// To get PHP's behaviour you must copy explicitly:
const c = [...a]; // shallow copy, new reference`,
      note: "The PHP habit '$b = $a is safe' is exactly wrong in JS — assignment never copies objects or arrays. Every 'copy' must be explicit (spread), and that explicit new reference is precisely what React's change detection needs.",
      rightLang: "ts",
    },
    {
      label: "Mutating state vs replacing state",
      intro:
        "Mark a todo as done. Both handlers 'work' on the data; only one produces a UI update.",
      php: `// Bug: in-place mutation
function toggle(id: number) {
  const todo = todos.find((t) => t.id === id);
  if (todo) todo.done = !todo.done; // mutates state!
  setTodos(todos); // same reference...
  // Object.is(prev, next) === true -> React bails
  // out: no re-render. The data changed, the UI
  // didn't. "Clicking the checkbox does nothing."
}`,
      ts: `// Fix: map to a new array, spread the changed item
function toggle(id: number) {
  setTodos(
    todos.map((t) =>
      t.id === id ? { ...t, done: !t.done } : t
    )
  );
  // New array + new object for the changed row;
  // unchanged rows keep their old references (cheap,
  // and lets memoized rows skip re-rendering).
}`,
      note: "setTodos(sameArray) is a no-op by design — the new array from map() is what makes the change visible. Copy the changed item too: reusing the mutated object would leak the mutation into the previous state.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
    {
      label: "Add, remove, sort — the immutable trio",
      intro:
        "The three everyday list operations, written against state. Left: the mutating instincts (push/splice/sort). Right: the immutable equivalents that actually re-render.",
      php: `// The instincts that silently fail in React:
items.push(newItem);        // add
setItems(items);            // same ref — no render

items.splice(index, 1);     // remove
setItems(items);            // same ref — no render

setItems(items.sort(byPrice)); // sort returns the
// SAME array it just mutated in place — no render,
// and the previous state snapshot is corrupted.`,
      ts: `// The immutable equivalents:
setItems([...items, newItem]);            // add

setItems(items.filter((i) => i.id !== id)); // remove

setItems([...items].sort(byPrice));       // sort a COPY

// or, ES2023's non-mutating method:
setItems(items.toSorted(byPrice));`,
      note: "push/splice/sort all mutate in place and hand back the same reference; spread + filter + map + [...arr].sort() produce new arrays every time — the rule is 'never mutate, always replace'.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Reference vs copy, proven with Object.is — the exact comparison React runs after a setter. Predict each logged line: which operations produce a new reference, and which untouched branches stay shared after a nested update?",
    code: `// React asks one question after a state update: "is the new value a
// different reference?" (Object.is). Mutation answers "no" — so no render.

type User = { name: string; skills: string[]; address: { city: string } };

const user: User = {
  name: "Jason",
  skills: ["php", "sql"],
  address: { city: "Sydney" },
};

// --- Mutation: the reference never changes -------------------------
const mutated = user;
mutated.skills.push("react");
console.log("after push:   Object.is(user, mutated) =", Object.is(user, mutated));
// React compares old state to new state, sees the SAME reference,
// and skips the re-render — your update is invisible.

// --- Copy: a new reference React can see ---------------------------
const updated: User = { ...user, skills: [...user.skills, "typescript"] };
console.log("after spread: Object.is(user, updated) =", Object.is(user, updated));
console.log("original skills:", user.skills.join(", "));
console.log("updated skills: ", updated.skills.join(", "));

// --- Nested update: copy every level you change --------------------
const moved: User = { ...user, address: { ...user.address, city: "Melbourne" } };
console.log("city:", user.address.city, "->", moved.address.city);
console.log("top-level copy is new:", !Object.is(user, moved));
console.log("untouched skills array is shared:", Object.is(user.skills, moved.skills));

// --- The PHP habit that bites: sort() mutates in place --------------
const prices = [30, 10, 20];
const sorted = [...prices].sort((a, b) => a - b); // copy first!
console.log("prices:", prices.join(","), "| sorted copy:", sorted.join(","));`,
  },

  keyPoints: [
    "React detects state changes by **reference** with `Object.is` — it never deep-compares. Mutate an object/array in state and React sees 'unchanged': no re-render.",
    "PHP arrays copy on assignment (`$b = $a` is independent); JS objects and arrays alias (`const b = a` is the same object) — every copy must be explicit.",
    "Objects: `setUser({ ...user, city: \"Melbourne\" })`; for nested fields, spread **every level you change** and share the rest.",
    "Arrays: add with `[...items, x]`, remove with `filter`, update one with `map` + spread on the changed item.",
    "`push`, `splice`, `sort`, `reverse` mutate in place — `items.sort(cmp)` returns the *same* reference. Sort a copy: `[...items].sort(cmp)` (or ES2023 `toSorted`).",
    "Reference equality also powers effect dependency arrays and `React.memo` — mutation breaks all of them, not just the current render.",
  ],

  interview: [
    {
      q: "Why does mutating state directly break React, when the data clearly changed?",
      a: "Because React's change detection is reference equality, not deep comparison. After a setter call it runs `Object.is(previousState, nextState)`; if you mutated the existing object and passed it back, that's the same reference, so React concludes nothing changed and skips the re-render — the data moved but the UI didn't. Deep comparison would be too expensive to run on every update, so React makes it your contract: a change *is* a new reference. The same reference-based check drives effect dependency arrays and `React.memo`, so mutation doesn't just miss one render — it lies to every optimization layer. The rule I follow is to treat state as read-only and always build the next value with spread, `map`, and `filter`.",
    },
    {
      q: "You're from a PHP background — what surprised you about JavaScript arrays here?",
      a: "Value versus reference semantics. In PHP, `$b = $a;` copies the array, so mutating `$b` is safe and that assumption is wired into decades of habit. In JavaScript, `const b = a;` creates a second reference to the *same* array — `b.push(x)` changes `a` too, and `Object.is(a, b)` is `true`. So the PHP instinct 'assignment made me a safe copy, mutate away' produces exactly the invisible-mutation bug React punishes. The fix is explicit copying: `[...a]` for arrays, `{ ...obj }` for objects, one spread per level I'm changing. Once I reframed it as 'PHP copies for you; in JS the spread *is* the copy', the React patterns became mechanical.",
    },
    {
      q: "How do you update one item deep inside an array of objects in state?",
      a: "Map over the array, and for the matching element return a spread copy with the change; return everything else untouched: `setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t))`. That yields a new array and a new object for the changed row, while unchanged rows keep their old references — which is a feature, because memoized row components can then skip re-rendering. For deeper nesting the spreads stack up one per level, and if that gets unreadable I'd mention Immer: its `produce` API lets you write mutation-style code against a draft and emits a properly immutable result. But interviewers usually want the raw spread patterns first.",
    },
  ],

  quiz: [
    {
      question:
        "const [items, setItems] = useState([...]); A handler runs items.push(newItem); setItems(items);. Why doesn't the UI update?",
      options: [
        "push is asynchronous, so the item isn't added yet",
        "setItems received the same array reference, so Object.is says nothing changed and React skips the render",
        "You must call setItems twice for arrays",
        "push returns the new length, not the array",
      ],
      answerIndex: 1,
      explain:
        "push mutated the existing array in place; the reference passed to setItems is identical to the current state, so React's Object.is comparison reports 'no change' and bails out. The fix is a new array: setItems([...items, newItem]).",
    },
    {
      question:
        "Which snippet correctly sorts a list in state by price?",
      options: [
        "setItems(items.sort((a, b) => a.price - b.price))",
        "items.sort((a, b) => a.price - b.price)",
        "setItems([...items].sort((a, b) => a.price - b.price))",
        "setItems(items); items.sort((a, b) => a.price - b.price)",
      ],
      answerIndex: 2,
      explain:
        "sort mutates in place AND returns the same array, so option A both corrupts the current state and hands React an unchanged reference — no re-render. Spread first to sort a fresh copy ([...items].sort(...)), or use ES2023's non-mutating items.toSorted(...).",
    },
    {
      question:
        "user is { name, address: { city, zip } } in state. What's the correct immutable update of city?",
      options: [
        "user.address.city = 'Melbourne'; setUser(user)",
        "setUser({ ...user, city: 'Melbourne' })",
        "setUser({ ...user, address: { ...user.address, city: 'Melbourne' } })",
        "setUser(Object.assign(user, { address: { city: 'Melbourne' } }))",
      ],
      answerIndex: 2,
      explain:
        "Spread every level you change: a new outer object AND a new address object, keeping zip via the inner spread. Option B puts city at the wrong level; A mutates; D's Object.assign(user, ...) mutates user (same reference) and also drops zip.",
    },
  ],
};

export default lesson;
