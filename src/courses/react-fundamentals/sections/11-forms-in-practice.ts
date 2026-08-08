import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "forms-in-practice",
  title: "Forms in Practice: Multi-Field State and Actions",
  part: "State, Events & Forms",
  estMinutes: 13,
  summary:
    "Scale controlled inputs to a real form — one state object, one generic change handler, an errors record — then let React 19 Actions absorb the PHP POST-and-re-render pattern with useActionState.",

  concept: `
A signup form with five fields does not need five \`useState\` calls. Real React
forms consolidate: **one state object, one change handler, one errors object** —
and in React 19, one *action* that handles submission the way your PHP scripts
always did, except React keeps the page alive.

### One object, one handler

Give every input a \`name\` attribute (exactly like PHP's \`$_POST\` keys), then write
a single handler using a **computed property name** — \`[e.target.name]\` — to decide
which field to update:

\`\`\`tsx
interface SignupForm {
  email: string;
  password: string;
  displayName: string;
}

const [form, setForm] = useState<SignupForm>({
  email: "", password: "", displayName: "",
});

function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
  setForm({ ...form, [e.target.name]: e.target.value });
}
\`\`\`

\`{ ...form, [e.target.name]: e.target.value }\` is the immutable-update spread you
already know, plus a key chosen at runtime — the direct analogue of PHP's
\`$form[$key] = $value\`, except it builds a *new* object so React sees the change.
Each input then wires up identically: \`<input name="email" value={form.email}
onChange={handleChange} />\`.

### Submitting the classic way

Pre-React-19 submission is an \`onSubmit\` handler that calls \`e.preventDefault()\`
(otherwise the browser does a full-page POST, throwing away your app), validates,
posts with \`fetch\`, and tracks its own pending flag:

\`\`\`tsx
const [submitting, setSubmitting] = useState(false);
const errors = validate(form); // plain function -> errors object

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (Object.keys(errors).length > 0) return;
  setSubmitting(true);
  await fetch("/api/signup", { method: "POST", body: JSON.stringify(form) });
  setSubmitting(false);
}
\`\`\`

Validation is nothing exotic: a pure function from values to a typed record like
\`Partial<Record<keyof SignupForm, string>>\`. Render \`errors.email\` under the email
input, and disable the button with \`disabled={submitting}\` so double-clicks can't
double-submit — the React equivalent of the disable-the-button jQuery snippet
every PHP project ever shipped.

### React 19: pass a function to \`<form action>\`

Here is the payoff for a PHP developer. In React 19 you can pass a **function**
directly to the form's \`action\` attribute. React calls it with a real \`FormData\`
object — the same shape as \`$_POST\` — and manages the lifecycle:

\`\`\`tsx
const [state, formAction, isPending] = useActionState(signup, { error: null });

<form action={formAction}>
  <input name="email" />
  <button disabled={isPending}>Sign up</button>
  {state.error && <p role="alert">{state.error}</p>}
</form>
\`\`\`

\`useActionState(fn, initialState)\` (imported from \`react\` — it replaced the old
ReactDOM \`useFormState\`) wraps your async function \`fn(previousState, formData)\`.
Whatever \`fn\` returns becomes the new \`state\` — typically \`{ error }\` on failure or
a success payload — and \`isPending\` flips automatically while it runs. This *is*
the PHP pattern: POST the form, run the handler, re-render with either errors or a
result. React just absorbed it without the page reload.

One more piece: \`useFormStatus\` (from \`react-dom\`) lets a child component rendered
*inside* the form read \`{ pending }\` without any props — perfect for a reusable
\`<SubmitButton />\` that disables itself in any form it lands in.
`,

  comparisons: [
    {
      label: "POST, validate, re-render with errors",
      intro:
        "A signup handler that validates the email and re-shows the form with an error message. PHP does it with a page reload; React 19 does the same cycle with an action and useActionState — no reload, state preserved.",
      php: `<?php // signup.php — POST and re-render
$error = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'Enter a valid email address.';
    } else {
        create_user($email);
        header('Location: /welcome.php');
        exit;
    }
}
?>
<form method="post">
  <input name="email" value="<?= htmlspecialchars($_POST['email'] ?? '') ?>">
  <?php if ($error): ?><p class="error"><?= $error ?></p><?php endif; ?>
  <button>Sign up</button>
</form>`,
      ts: `// Signup.tsx — same cycle, no page reload
import { useActionState } from "react";

type FormState = { error: string | null };

async function signup(prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email.includes("@")) {
    return { error: "Enter a valid email address." };
  }
  await fetch("/api/signup", { method: "POST", body: formData });
  return { error: null };
}

export default function Signup() {
  const [state, formAction, isPending] = useActionState(signup, { error: null });
  return (
    <form action={formAction}>
      <input name="email" />
      {state.error && <p role="alert">{state.error}</p>}
      <button disabled={isPending}>{isPending ? "Signing up…" : "Sign up"}</button>
    </form>
  );
}`,
      note: "Same POST-validate-re-render loop you have written in PHP for years — but React keeps the page alive, gives you FormData like $_POST, and hands back pending state for free.",
    },
    {
      label: "Per-field useState sprawl vs one typed object",
      intro:
        "Three fields, controlled either as three independent useState pairs or as one typed object with a single generic handler. Both work; only one still works at ten fields.",
      php: `// SignupSprawl.tsx — one useState per field
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [displayName, setDisplayName] = useState("");

return (
  <form onSubmit={handleSubmit}>
    <input value={email}
      onChange={(e) => setEmail(e.target.value)} />
    <input type="password" value={password}
      onChange={(e) => setPassword(e.target.value)} />
    <input value={displayName}
      onChange={(e) => setDisplayName(e.target.value)} />
  </form>
);
// Every new field: another useState, another handler,
// and submit has to gather them all by hand.`,
      ts: `// Signup.tsx — one object, one handler
interface SignupForm {
  email: string;
  password: string;
  displayName: string;
}

const [form, setForm] = useState<SignupForm>({
  email: "", password: "", displayName: "",
});

function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
  setForm({ ...form, [e.target.name]: e.target.value });
}

return (
  <form onSubmit={handleSubmit}>
    <input name="email" value={form.email} onChange={handleChange} />
    <input name="password" type="password"
      value={form.password} onChange={handleChange} />
    <input name="displayName" value={form.displayName}
      onChange={handleChange} />
  </form>
);`,
      note: "The computed key [e.target.name] routes every input through one handler — like $form[$key] = $value in PHP, but as an immutable spread so React notices the change.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The logic layer of every form: a pure validate(values) function returning a typed errors record. Predict which fields fail on each attempt, then run it.",
    code: `// validate(): from typed values to a typed errors record.
// This same function runs on change, on submit, or inside a
// React 19 action — it knows nothing about React.

interface SignupValues {
  email: string;
  password: string;
  displayName: string;
}

// Partial: a field is either absent (valid) or holds a message.
type SignupErrors = Partial<Record<keyof SignupValues, string>>;

function validate(values: SignupValues): SignupErrors {
  const errors: SignupErrors = {};
  if (!values.email.includes("@")) {
    errors.email = "Enter a valid email address.";
  }
  if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }
  if (values.displayName.trim() === "") {
    errors.displayName = "Display name is required.";
  }
  return errors;
}

function report(label: string, values: SignupValues) {
  const errors = validate(values);
  const fields = Object.keys(errors) as (keyof SignupValues)[];
  if (fields.length === 0) {
    console.log(\`\${label}: valid — ready to submit\`);
  } else {
    console.log(\`\${label}: \${fields.length} error(s)\`);
    for (const f of fields) console.log(\`  \${f}: \${errors[f]}\`);
  }
}

report("first attempt", {
  email: "jason",
  password: "123",
  displayName: "  ",
});

report("second attempt", {
  email: "jason@example.com",
  password: "correct horse battery",
  displayName: "Jason",
});

// Try it: add a { minLength: number } rule for displayName,
// or make validate() generic over any values shape.`,
  },

  keyPoints: [
    "Consolidate multi-field forms into one typed state object; a single handler updates it with a computed property name: `setForm({ ...form, [e.target.name]: e.target.value })`.",
    "The input's `name` attribute plays the same role as a `$_POST` key — it routes the change to the right field.",
    "Classic submission: `onSubmit` + `e.preventDefault()`, a pure `validate()` returning `Partial<Record<keyof Form, string>>`, and `disabled={submitting}` on the button to block double-submits.",
    "React 19: pass a function straight to `<form action={fn}>` — React calls it with `FormData` (the `$_POST` of the web platform) and resets pending state around it.",
    "`useActionState(fn, initialState)` (from `react`) returns `[state, formAction, isPending]`: your action's return value becomes the new state, and `isPending` is managed for you.",
    "`useFormStatus` (from `react-dom`) gives a component rendered inside the form its `pending` flag without prop-passing — ideal for a shared `<SubmitButton />`.",
  ],

  interview: [
    {
      q: "How do you manage a form with many fields in React without a useState per field?",
      a: "I keep one state object typed to the form's shape and write a single change handler that uses a computed property name: `setForm({ ...form, [e.target.name]: e.target.value })`. Every input gets a `name` attribute matching a key of that interface, so adding a field is one interface line and one input — no new handler. Validation is a pure function from the values object to an errors record like `Partial<Record<keyof Form, string>>`, which I can run on submit or on change and render next to each field. Coming from PHP, it is the `$_POST` array pattern made immutable and typed.",
    },
    {
      q: "What are React 19 form Actions, and how does useActionState fit in?",
      a: "In React 19 the form's `action` attribute accepts a function, not just a URL. React invokes it with a `FormData` object when the form submits — no `preventDefault`, no manual serialization. `useActionState(fn, initialState)` wraps that function and returns `[state, formAction, isPending]`: you pass `formAction` to `<form action>`, whatever the async function returns becomes the new `state` (typically validation errors or a success payload), and `isPending` is true while it runs. It is essentially the classic PHP POST-validate-re-render cycle absorbed into React, minus the page reload. For child submit buttons, `useFormStatus` from `react-dom` exposes the surrounding form's `pending` flag without props.",
    },
    {
      q: "How do you prevent a form from being submitted twice while a request is in flight?",
      a: "Disable the submit button while the request is pending. With classic `onSubmit` I keep a `submitting` boolean in state, set it before the `await` and clear it after, and render `disabled={submitting}`. With React 19 Actions it is free: `useActionState` hands back `isPending`, or a nested submit-button component reads `pending` from `useFormStatus`. I also make the button label reflect it — 'Saving…' — because disabling without feedback reads as a broken UI.",
    },
  ],

  quiz: [
    {
      question:
        "What does `setForm({ ...form, [e.target.name]: e.target.value })` do?",
      options: [
        "Mutates the existing form object in place for performance",
        "Creates a new object copying all fields, overwriting only the field whose key matches the input's name attribute",
        "Adds a new property literally called 'e.target.name' to the form",
        "Resets every other field to its initial value",
      ],
      answerIndex: 1,
      explain:
        "The spread copies every existing field into a brand-new object, and the computed property name [e.target.name] evaluates the expression to pick the key — so the input's name attribute decides which field is overwritten. A new object is essential: React compares references to decide whether to re-render.",
    },
    {
      question:
        "In React 19, what does `useActionState(signup, { error: null })` return?",
      options: [
        "An object with submit() and reset() methods",
        "[state, formAction, isPending] — the latest action result, a function to pass to <form action>, and a pending flag",
        "Just the FormData from the last submission",
        "[isPending, retry] — Actions manage state internally and never expose it",
      ],
      answerIndex: 1,
      explain:
        "useActionState wraps your action fn(previousState, formData) and returns a triple: the current state (whatever the action last returned, starting from initialState), the formAction to wire into <form action={...}>, and isPending while the action runs. It lives in react — it superseded ReactDOM's old useFormState.",
    },
    {
      question:
        "Where must a component be rendered for `useFormStatus` to report pending: true during submission?",
      options: [
        "Anywhere in the app, as long as some form is submitting",
        "In the same file as the form component",
        "Inside the <form> element whose status it should read, as a child component",
        "It only works inside components created by useActionState",
      ],
      answerIndex: 2,
      explain:
        "useFormStatus (from react-dom) reads the status of the nearest enclosing <form>, like context. Called outside any form — including in the very component that renders the <form> tag — it has no form above it to report on, so pending stays false. That is why the pattern is a small <SubmitButton /> child component.",
    },
  ],
};

export default lesson;
