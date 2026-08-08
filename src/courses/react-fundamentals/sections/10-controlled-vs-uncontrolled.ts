import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "controlled-vs-uncontrolled",
  title: "Controlled vs Uncontrolled Inputs",
  part: "State, Events & Forms",
  estMinutes: 11,
  summary:
    "A controlled input mirrors React state (value + onChange) and enables instant validation; an uncontrolled input lets the DOM hold the value until you read it on submit — two legitimate tools with a real trade-off.",

  concept: `
In PHP, form fields have one moment of truth: the POST. The browser owns the
input while the user types; your code only sees the value when
\`$_POST['email']\` arrives. React gives you a choice about *who owns the
value while typing* — and that choice is the controlled/uncontrolled split.

### Controlled: React state is the single source of truth

\`\`\`tsx
function EmailField() {
  const [email, setEmail] = useState("");

  return (
    <input
      value={email}
      onChange={(e) => setEmail(e.target.value)}
    />
  );
}
\`\`\`

Every keystroke fires \`onChange\`, you set state, the component re-renders,
and the input displays \`value={email}\` — the DOM never disagrees with your
state. The loop sounds circular but it buys real power: the current value is
in scope on **every render**, so you can validate as the user types, disable
the submit button until the form is valid, format/limit input, or derive UI
from it live. Two classics to know:

- \`value\` without \`onChange\` = a **read-only** input (React warns) — the
  state never changes, so typing appears to do nothing.
- The cost is a re-render per keystroke — almost always negligible, but it's
  the honest answer to "any downsides?".

### Uncontrolled: the DOM holds the value

For fire-and-forget forms — login, a search box, anything you only need **on
submit** — let the browser do what it's done since 1995 and read the values
once:

\`\`\`tsx
function Login() {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    console.log(data.get("email")); // like $_POST['email']
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" defaultValue="" />
      <button>Log in</button>
    </form>
  );
}
\`\`\`

\`FormData\` reads by \`name\` attribute — the closest thing React has to
\`$_POST\`. Use \`defaultValue\` (not \`value\`) to pre-fill without taking
control. The other uncontrolled access path is a **ref** — a direct handle on
the DOM node, e.g. \`inputRef.current.value\` — which gets its full treatment
in the useRef section later. React 19's form actions
(\`<form action={fn}>\`) build on exactly this uncontrolled model.

### The trade-off, honestly

| | Controlled | Uncontrolled |
|---|---|---|
| Value lives in | React state | The DOM |
| Read it | any render, any time | on submit (FormData/ref) |
| Live validation/derived UI | trivial | awkward |
| Code per field | state + two props | a \`name\` attribute |
| Re-renders while typing | one per keystroke | none |

Default professionally: **controlled** when the UI must react to the value as
it changes; **uncontrolled** when you only care at submit time.

### Checkbox and select

Two element quirks worth memorizing: a checkbox is controlled through
\`checked\` (a boolean), not \`value\`; and a \`<select>\` is controlled by
putting \`value\` **on the select itself** — not \`selected\` on an
\`<option>\`, which is how you'd do it in a PHP template.

\`\`\`tsx
<input type="checkbox" checked={agreed}
       onChange={(e) => setAgreed(e.target.checked)} />

<select value={country} onChange={(e) => setCountry(e.target.value)}>
  <option value="au">Australia</option>
  <option value="nz">New Zealand</option>
</select>
\`\`\`

Don't mix modes: an input switching between \`value={undefined}\` and
\`value={"text"}\` flips uncontrolled→controlled and React warns. Controlled
text state should start as \`""\`, never \`undefined\`.
`,

  comparisons: [
    {
      label: "Validate on POST vs validate as they type",
      intro:
        "An email field that must be validated. PHP can only judge the value after the round-trip; a controlled input judges it on every keystroke and gates the submit button.",
      php: `<?php // signup.php — truth arrives with the POST
$error = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        // user finds out AFTER submitting + reloading
        $error = 'Invalid email';
    }
}
?>
<form method="post">
  <input name="email" value="<?= htmlspecialchars($email ?? '') ?>">
  <?php if ($error): ?><p><?= $error ?></p><?php endif; ?>
  <button>Sign up</button>
</form>`,
      ts: `// Signup.tsx — truth is in state on every render
function Signup() {
  const [email, setEmail] = useState("");
  const valid = /^\\S+@\\S+\\.\\S+$/.test(email);

  return (
    <form onSubmit={(e) => { e.preventDefault(); subscribe(email); }}>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {!valid && email !== "" && <p>Invalid email</p>}
      <button disabled={!valid}>Sign up</button>
    </form>
  );
}`,
      note: "Controlled means the value is a state variable available on every render — validation, the error message, and the disabled button are all derived from it live, with no round-trip and no 'repopulate the field after an error' chore.",
    },
    {
      label: "Uncontrolled + FormData vs controlled",
      intro:
        "A login form that's only read at submit time, written both ways. Same behaviour at submit; very different amounts of machinery.",
      php: `// Login.tsx — uncontrolled: the DOM holds the values
function Login() {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    logIn(
      String(data.get("email")),
      String(data.get("password"))
    ); // FormData.get by name — React's \$_POST
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button>Log in</button>
    </form>
  );
}`,
      ts: `// Login.tsx — controlled: state mirrors every field
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form onSubmit={(e) => { e.preventDefault(); logIn(email, password); }}>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button>Log in</button>
    </form>
  );
}`,
      note: "For a form you only read on submit, uncontrolled is less code and zero re-renders while typing; the controlled version earns its keep the moment you need live validation, a disabled submit, or password-strength feedback.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
    {
      label: "Pre-selecting an option: selected vs value on <select>",
      intro:
        "Render a country dropdown with the saved value pre-selected. PHP marks the matching <option>; React sets value once on the <select>.",
      php: `<!-- profile.php — flag the matching option -->
<select name="country">
  <?php foreach ($countries as $code => $label): ?>
    <option
      value="<?= $code ?>"
      <?= $code === $saved ? 'selected' : '' ?>>
      <?= htmlspecialchars($label) ?>
    </option>
  <?php endforeach; ?>
</select>`,
      ts: `// Profile.tsx — value lives on the <select> itself
function CountryPicker() {
  const [country, setCountry] = useState("au");

  return (
    <select
      value={country}
      onChange={(e) => setCountry(e.target.value)}
    >
      <option value="au">Australia</option>
      <option value="nz">New Zealand</option>
      <option value="uk">United Kingdom</option>
    </select>
  );
}
// Checkboxes are the other quirk: controlled via
// checked={bool}, read via e.target.checked.`,
      note: "In React you never write selected on an <option> — the select's value prop picks the option, and onChange keeps state in sync; likewise checkboxes use checked/e.target.checked, not value.",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Read and predict: a controlled email input with live validation. Walk through what renders initially, after the user types 'jason', and after they finish 'jason@dev.au' — which parts of the UI change at each step, and why?",
    code: `function EmailSignup() {
  const [email, setEmail] = useState("");
  const valid = /^\\S+@\\S+\\.\\S+$/.test(email);

  // Derived on every render — no extra state needed:
  const hint =
    email === "" ? "Enter your email"
    : valid ? "Looks good ✓"
    : "Keep typing — not a valid email yet";

  return (
    <form onSubmit={(e) => { e.preventDefault(); subscribe(email); }}>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <p>{hint}</p>
      <button disabled={!valid}>Subscribe</button>
    </form>
  );
}`,
    output: `Initial render (email === ""):
  empty input, hint "Enter your email", button DISABLED.

User types "j": onChange fires -> setEmail("j") -> re-render.
  value={email} paints "j"; regex fails;
  hint: "Keep typing — not a valid email yet"; button disabled.
...each keystroke repeats that loop (one re-render per key).

After "jason@dev.au" (12 keystrokes, 12 re-renders later):
  regex passes -> hint "Looks good ✓", button ENABLED.

If the user deletes back to "": hint returns to
"Enter your email" and the button disables again — every bit
of UI is derived from the single email state, so nothing can
drift. (Remove the onChange and the input becomes read-only:
typing does nothing, because state never changes and React
repaints value="" every time.)`,
  },

  keyPoints: [
    "Controlled input = `value={state}` + `onChange={(e) => setState(e.target.value)}` — React state is the single source of truth, updated every keystroke.",
    "Controlled pays one re-render per keystroke and buys live validation, derived UI (disabled buttons, hints), and a value that's in scope on every render.",
    "Uncontrolled = the DOM holds the value; read it at submit with `new FormData(e.currentTarget).get(\"name\")` (React's `$_POST`) or via a ref — right for fire-and-forget forms.",
    "Pre-fill an uncontrolled input with `defaultValue`, never `value`; `value` without `onChange` makes the field read-only.",
    "Checkboxes are controlled via `checked` / `e.target.checked`; a `<select>` is controlled by `value` on the select element — not `selected` on an option.",
    "Keep the mode stable: start controlled text state at `\"\"`, not `undefined`, or React warns about switching between uncontrolled and controlled.",
  ],

  interview: [
    {
      q: "Explain controlled vs uncontrolled inputs and when you'd choose each.",
      a: "A controlled input has its value driven by React state: `value={email}` plus an `onChange` that sets the state, so every keystroke flows through React and the DOM can never disagree with my data. An uncontrolled input leaves the value in the DOM — the browser manages typing, and I read the result when I need it, typically `new FormData(form)` in the submit handler or a ref. I default to controlled whenever the UI must respond to the value as it changes: inline validation, disabling submit, character counters, filtering a list as you type. I go uncontrolled for fire-and-forget forms where only the submitted value matters — it's less code, and there are no re-renders while typing. React 19's form actions lean into the uncontrolled model, which has made it respectable again for plain forms.",
    },
    {
      q: "A teammate wrote <input value={text} /> with no onChange and reports that typing does nothing. What's happening?",
      a: "That's a controlled input with no way to change its state. Because `value` is set, React repaints the input from `text` on every render; typing fires input events, but nothing updates the state, so React immediately renders the old value back — the field is effectively read-only, and React logs a warning saying exactly that. The fix depends on intent: add `onChange={(e) => setText(e.target.value)}` to make it properly controlled, use `defaultValue={text}` if they only wanted to pre-fill an uncontrolled field, or add `readOnly` if read-only was actually the goal and they want the warning gone.",
    },
    {
      q: "Coming from PHP forms, what maps to $_POST in React, and what's genuinely new?",
      a: "The direct analogue is `FormData`: in an `onSubmit` handler, `new FormData(e.currentTarget).get('email')` reads fields by their `name` attribute, exactly like `$_POST['email']` — that's the uncontrolled path, and it feels familiar. What's genuinely new is that the round-trip is optional: with a controlled input the value lives in state *while the user types*, so validation, error messages, and a disabled submit button update live instead of after a POST and reload. The PHP chores of re-rendering the form with old input and an error block simply disappear — the form never leaves the page unless I want it to. The gotchas that bite PHP muscle memory: checkboxes use `checked`, and pre-selecting a dropdown option means `value` on the `<select>`, not `selected` on the `<option>`.",
    },
  ],

  quiz: [
    {
      question: "Which pair of props makes a text input controlled?",
      options: [
        "defaultValue and onInput",
        "value and onChange",
        "name and ref",
        "value and defaultValue together",
      ],
      answerIndex: 1,
      explain:
        "Controlled means React state drives the DOM: value pins the displayed text to state and onChange updates that state per keystroke. defaultValue only sets an initial value and leaves the DOM in charge (uncontrolled); name/ref are the uncontrolled reading paths.",
    },
    {
      question:
        "In an uncontrolled form, what's the idiomatic way to read all field values in the onSubmit handler?",
      options: [
        "document.querySelectorAll('input') and read .value from each",
        "e.target.value on the form element",
        "new FormData(e.currentTarget) and .get() by field name",
        "You can't — uncontrolled values are only available server-side",
      ],
      answerIndex: 2,
      explain:
        "FormData reads every named field from the form node in one call — the closest thing to PHP's $_POST. querySelector works but reintroduces the fragile DOM-wiring React exists to remove; e.target.value doesn't exist on a form.",
    },
    {
      question: "How do you correctly control a checkbox and a <select> in React?",
      options: [
        "Checkbox: value + onChange; select: selected on the chosen <option>",
        "Checkbox: checked + onChange reading e.target.checked; select: value on the <select> + onChange",
        "Both use value + onInput",
        "Checkbox: defaultChecked + ref; select can't be controlled",
      ],
      answerIndex: 1,
      explain:
        "Checkboxes carry their state in the boolean checked prop (read back via e.target.checked). Selects break the PHP habit: no selected attribute on options — the select element's value prop determines the chosen option, with onChange keeping state in sync.",
    },
  ],
};

export default lesson;
