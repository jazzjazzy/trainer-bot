import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "handling-events",
  title: "Handling Events",
  part: "State, Events & Forms",
  estMinutes: 10,
  summary:
    "Event handlers are camelCase props that take function references — onClick={handleClick}, never onClick={handleClick()} — with typed event objects and no separate 'handle the POST' round-trip.",

  concept: `
In PHP, an interaction is a round-trip: the browser POSTs, a different code
path (\`if ($_SERVER['REQUEST_METHOD'] === 'POST')\`) handles it, and a fresh
page renders. In React the handler is a function attached right where the
element is declared, it runs in place, and every variable of the current
render — props, state — is already in scope. No superglobals, no re-entry.

### Handlers are props: camelCase, function values

\`\`\`tsx
function SaveButton() {
  function handleClick() {
    console.log("saving…");
  }

  return <button onClick={handleClick}>Save</button>;
}
\`\`\`

Three details that separate this from HTML's \`onclick="..."\`:

- **camelCase**: \`onClick\`, \`onChange\`, \`onSubmit\` — not \`onclick\`.
- **A function, not a string**: you pass a reference for React to call later.
- **Declared inline in JSX** — no \`querySelector\` + \`addEventListener\`
  wiring step that can drift out of sync with the markup.

### The classic bug: \`onClick={fn}\` vs \`onClick={fn()}\`

\`onClick={handleClick}\` hands React the function. \`onClick={handleClick()}\`
**calls it immediately, during render**, and hands React the return value
(usually \`undefined\`). The symptom: the "click" behaviour fires on every
render and the button does nothing when actually clicked. If the handler sets
state, it's worse — setting state during render schedules another render,
which calls the handler again: an infinite loop.

Need to pass an argument? Wrap it in an arrow so the *call* happens on click:

\`\`\`tsx
<button onClick={() => deleteItem(item.id)}>Delete</button>
\`\`\`

TypeScript is your safety net here: a handler returning \`void\` can't be
assigned where a function is expected, so \`onClick={handleClick()}\` is a
compile error in TSX — in plain JSX it ships silently.

### Typed events

React wraps native events in a synthetic event with the same interface,
typed generically over the element:

\`\`\`tsx
function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
  console.log(e.currentTarget.name); // typed as HTMLButtonElement
}

function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
  console.log(e.target.value); // string — no cast needed
}
\`\`\`

In practice you rarely write these by hand: declare the handler inline and
TypeScript infers the event type from the element. Write the explicit type
when the handler is defined separately from the JSX. Prefer
\`e.currentTarget\` (the element the handler is attached to, precisely typed)
over \`e.target\` (whatever was actually clicked, possibly a child).

### preventDefault and propagation

Browser defaults still exist: a \`<form>\` submit still navigates, a link
still follows \`href\`. Call \`e.preventDefault()\` to stop the default — the
standard first line of every \`onSubmit\` handler in a client-rendered form.
Events also **bubble** up the tree exactly as in the DOM, so a click on a
button inside a clickable card fires both handlers, child first; call
\`e.stopPropagation()\` in the child when the parent shouldn't also react.
`,

  comparisons: [
    {
      label: "Wiring a click: querySelector vs JSX prop",
      intro:
        "A delete button that needs the row's id. Vanilla JS finds the element after render and attaches a listener; React declares the handler on the element, with the id already in scope.",
      php: `// vanilla.js — wiring is a separate step
const list = document.querySelector('#items');

// Markup and behaviour live apart; data must be
// smuggled through DOM attributes and parsed back:
list.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const id = Number(btn.dataset.id); // string -> number
  deleteItem(id);
});

// ...and the HTML somewhere else:
// <button data-id="42">Delete</button>`,
      ts: `// ItemRow.tsx — handler declared where the element is
type Props = { item: { id: number; name: string } };

function ItemRow({ item }: Props) {
  return (
    <li>
      {item.name}
      {/* item.id is in scope — no data-attributes,
          no parsing, no selector that can go stale */}
      <button onClick={() => deleteItem(item.id)}>
        Delete
      </button>
    </li>
  );
}`,
      note: "React removes the wiring step: no selector to break when the markup changes, and arguments flow through the closure as typed values instead of stringly-typed data-attributes.",
      leftLang: "js",
    },
    {
      label: "Form submit: POST round-trip vs onSubmit in place",
      intro:
        "Handle a search form. PHP branches on the request method and re-renders the whole page; React intercepts the submit and updates in place.",
      php: `<?php // search.php — the handler is a second request
$results = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // separate code path, data via superglobal
    $term = trim($_POST['term'] ?? '');
    $results = search($term);
}
?>
<form method="post">
  <input name="term">
  <button>Search</button>
</form>
<?php foreach ($results as $r): ?>
  <p><?= htmlspecialchars($r) ?></p>
<?php endforeach; ?>`,
      ts: `// Search.tsx — the handler runs in place
function Search() {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<string[]>([]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // stop the browser's POST+reload
    setResults(search(term)); // term already in scope
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={term} onChange={(e) => setTerm(e.target.value)} />
      <button>Search</button>
      {results.map((r) => <p key={r}>{r}</p>)}
    </form>
  );
}`,
      note: "There is no second 'handle the POST' entry point: e.preventDefault() cancels the browser round-trip and the same render scope handles input, submit, and output — $_POST becomes a variable you already had.",
    },
    {
      label: "Passing the handler vs calling it",
      intro:
        "Two buttons that should log on click. One passes a function reference; the other invokes the function during render. Spot which is which before reading the annotations.",
      php: `// Bug: () on the handler
<button onClick={notify("delete")}>
  Delete
</button>

// notify("delete") runs NOW — during render,
// before any click. Its return value (undefined)
// becomes the onClick prop, so clicking does
// nothing. If notify set state, render -> set ->
// render -> set... infinite loop.`,
      ts: `// Fix: hand React a function to call later
<button onClick={() => notify("delete")}>
  Delete
</button>

// Or, when there's no argument to pass:
<button onClick={notify}>Delete</button>

// The arrow is created during render but only
// EXECUTED on click — that's the difference.`,
      note: "onClick wants a function value; adding () turns it into that function's result. TypeScript flags the bug (void isn't assignable to an event handler) — one more reason TSX beats JSX.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Read and predict: one button passes a handler correctly, the other calls it during render. What appears in the console when the component renders — and what happens when each button is clicked?",
    code: `function Toolbar() {
  console.log("Toolbar renders");

  function notify(action: string) {
    console.log(\`user chose: \${action}\`);
  }

  return (
    <div>
      {/* A: pass a function for React to call on click */}
      <button onClick={() => notify("save")}>Save</button>

      {/* B: BUG — calls notify NOW, during render, and
          hands its return value (undefined) to onClick */}
      <button onClick={notify("delete")}>Delete</button>
    </div>
  );
}`,
    output: `On every render (no clicks yet), the console shows:
  Toolbar renders
  user chose: delete    <- ran DURING render, courtesy of the ()

Clicking Save logs:
  user chose: save      <- the arrow ran on click, as intended

Clicking Delete logs:
  (nothing) — notify("delete") already ran and returned
  undefined, so the button's onClick is undefined.

Note: TypeScript rejects line B ("Type 'void' is not assignable
to type 'MouseEventHandler'") — this bug only ships silently in
untyped JSX. If notify() set state instead of logging, line B
would trigger render -> setState -> render: an infinite loop.`,
  },

  keyPoints: [
    "Event handlers are camelCase props taking **function values**: `onClick={handleClick}`, `onChange`, `onSubmit` — not HTML's lowercase `onclick=\"...\"` strings.",
    "`onClick={fn}` passes the function; `onClick={fn()}` calls it during render and passes the result — the classic beginner bug. Use an arrow, `onClick={() => fn(arg)}`, to pass arguments.",
    "Events are typed generically over the element: `React.MouseEvent<HTMLButtonElement>`, `React.ChangeEvent<HTMLInputElement>`, `React.FormEvent<HTMLFormElement>`; inline handlers get these inferred for free.",
    "Prefer `e.currentTarget` (the element the handler is on, precisely typed) over `e.target` (whatever was clicked, possibly a child).",
    "`e.preventDefault()` stops browser defaults — first line of a client-side `onSubmit`; `e.stopPropagation()` stops the event bubbling to parent handlers.",
    "Unlike PHP, there's no separate 'handle the POST' code path: the handler runs in place with the current render's props and state in scope.",
  ],

  interview: [
    {
      q: "What's the difference between onClick={handleClick} and onClick={handleClick()}?",
      a: "The first passes the function itself as the prop — React stores it and calls it when the click happens. The second *invokes* the function during render and passes its return value, usually `undefined`, as the handler. So the behaviour runs once per render with no click, and the actual clicks do nothing. If the handler sets state it's an infinite loop: render calls the function, the state update schedules a render, which calls it again. When I need to pass arguments I wrap in an arrow — `onClick={() => remove(id)}` — so the call is deferred to the click. In TSX this mistake is usually a compile error because `void` isn't assignable to an event-handler type.",
    },
    {
      q: "How do you type event handlers in React with TypeScript?",
      a: "React's synthetic events are generic over the element: `React.MouseEvent<HTMLButtonElement>` for a button click, `React.ChangeEvent<HTMLInputElement>` for input changes — where `e.target.value` is already a string — and `React.FormEvent<HTMLFormElement>` for submits. If I write the handler inline in the JSX, TypeScript infers all of that from the element, so I only spell the types out for handlers declared separately. I also reach for `e.currentTarget` rather than `e.target` when I want the element the handler is attached to, because `currentTarget` is precisely typed by the generic while `target` can be any descendant that was actually clicked.",
    },
    {
      q: "Coming from server-side PHP, what changed about handling a form submission?",
      a: "In PHP the submit is a new HTTP request: the browser POSTs, my script branches on the request method, reads `$_POST`, and renders a whole new page. In React the handler intercepts the same page: `onSubmit` fires, I call `e.preventDefault()` to cancel the browser's navigation, and the function runs with the form's state already in scope as ordinary typed variables — there is no superglobal and no second entry point. The trade is that I now own what PHP gave me for free: I update state to show results, handle validation inline, and if the data must reach the server, I make that call explicitly. React 19's form actions bring back a declarative submit-to-function model, but preventDefault-style handlers remain the fundamental everyone expects you to know.",
    },
  ],

  quiz: [
    {
      question:
        "A component renders <button onClick={save()}>Save</button> where save() sets state. What happens?",
      options: [
        "save runs when the button is clicked, as intended",
        "save runs once during render, then clicks work normally",
        "save runs during render, the state update triggers another render, and it loops infinitely",
        "React throws 'save is not a function' at click time",
      ],
      answerIndex: 2,
      explain:
        "The () invokes save during render. Setting state during render schedules a re-render, which invokes save again — an infinite loop (React bails out with a 'Too many re-renders' error). Pass the reference: onClick={save}, or onClick={() => save(arg)} with arguments.",
    },
    {
      question:
        "In an onChange handler on an <input>, what is the type of e for e.target.value to be a string with no casting?",
      options: [
        "Event",
        "React.ChangeEvent<HTMLInputElement>",
        "React.MouseEvent<HTMLInputElement>",
        "InputEvent<string>",
      ],
      answerIndex: 1,
      explain:
        "React.ChangeEvent is generic over the element; with HTMLInputElement, e.target.value is typed string. Inline handlers get this inferred automatically — you write it explicitly when the handler lives outside the JSX.",
    },
    {
      question:
        "A button sits inside a card that has its own onClick. Clicking the button should NOT trigger the card's handler. What do you call in the button's handler?",
      options: [
        "e.preventDefault()",
        "e.stopPropagation()",
        "return false",
        "e.cancelBubble()",
      ],
      answerIndex: 1,
      explain:
        "Events bubble from the button up to the card, child handler first; stopPropagation() halts that climb. preventDefault() only cancels the browser's default action (navigation, submit) and does nothing about bubbling; returning false does nothing in React.",
    },
  ],
};

export default lesson;
