import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "forms-and-action-state",
  title: "Forms, useActionState & Pending UI",
  part: "Mutations & APIs",
  estMinutes: 13,
  summary:
    "React 19's useActionState closes the form loop — the action returns validation errors or a success message as state, rendered back into the form — while useFormStatus powers pending submit buttons.",

  concept: `
You've written this PHP pattern a thousand times: POST comes in, validation
fails, so you **re-render the form** with an \`$errors\` array and the user's
old input repopulated from \`$_POST\`. That round trip — submit, validate,
redisplay with errors — is exactly what \`useActionState\` formalizes, typed.

### The hook

\`\`\`tsx
'use client';
import { useActionState } from 'react';
import { subscribe } from './actions';

const [state, formAction, isPending] = useActionState(subscribe, {});
\`\`\`

Three things come back:

- **\`state\`** — whatever the action last returned (initially the second
  argument, here \`{}\`). Your \`$errors\` array, as a typed value.
- **\`formAction\`** — the wrapped action to pass to \`<form action={...}>\`.
- **\`isPending\`** — \`true\` while a submission is in flight.

### The action's signature changes

Used with \`useActionState\`, the action receives **the previous state
first**, then the FormData — and returns the *next* state:

\`\`\`ts
// app/newsletter/actions.ts
'use server';

export interface FormState {
  errors?: Record<string, string>;
  values?: { email?: string };
  message?: string;
}

export async function subscribe(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim();

  if (!email.includes('@')) {
    return {
      errors: { email: 'Enter a valid email address.' },
      values: { email },
    };
  }

  await db.subscriber.create({ data: { email } });
  return { message: \`Subscribed \${email}.\` };
}
\`\`\`

That \`FormState\` shape — \`errors\` keyed by field name, plus an optional
\`message\` — is the community convention, and it's your PHP
\`['errors' => [...], 'message' => ...]\` array with a type. The state
renders straight into the form:

\`\`\`tsx
<form action={formAction}>
  <input name="email" defaultValue={state.values?.email} />
  {state.errors?.email && <p className="error">{state.errors.email}</p>}
  <button disabled={isPending}>{isPending ? 'Saving…' : 'Subscribe'}</button>
</form>
\`\`\`

One PHP habit carries over on purpose: **echo the old input back**. Return
the submitted values in the state (\`values: { email }\`) and feed them to
\`defaultValue\`, so a failed validation never eats what the user typed —
the \`htmlspecialchars($_POST['email'])\` move, minus the XSS footgun, since
React escapes by default.

### \`useFormStatus\`: pending state for shared buttons

\`isPending\` lives where the hook is called. For a reusable submit button,
\`useFormStatus\` (from \`react-dom\`) reads the status of the **nearest
enclosing form** — with one rule: it must be called in a component rendered
*inside* the \`<form>\`, not in the component that renders the form itself:

\`\`\`tsx
'use client';
import { useFormStatus } from 'react-dom';

export function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? 'Working…' : label}</button>;
}
\`\`\`

Drop \`<SubmitButton />\` into any form and it disables itself during
submission — the jQuery spinner-on-submit, as a five-line component.

### Who runs where

The form component says \`'use client'\` (hooks need the client); the action
stays \`'use server'\` in \`actions.ts\`. Validation still happens **on the
server** — this isn't client-side validation, it's the PHP round trip with
the page-reload cost removed. One caveat on progressive enhancement: because
the form itself is a Client Component, it does *not* get the JS-disabled
full-page POST a Server Component form gets — Next queues submissions made
before hydration and replays them once the bundle loads.
`,

  comparisons: [
    {
      label: "Validate-and-redisplay: $_POST echo vs typed state",
      intro:
        "A signup form that must survive failed validation: show the error, keep what the user typed. PHP re-renders with $errors and $_POST; React renders the action's returned state.",
      php: `<?php // signup.php — the classic redisplay pattern
$errors = [];
$email = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $email = trim($_POST['email'] ?? '');
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Enter a valid email address.';
  } else {
    save_subscriber($email);
    header('Location: /thanks');
    exit;
  }
}
?>
<form method="post">
  <input name="email"
         value="<?= htmlspecialchars($email) ?>">
  <?php if (isset($errors['email'])): ?>
    <p class="error"><?= $errors['email'] ?></p>
  <?php endif; ?>
  <button>Subscribe</button>
</form>`,
      ts: `// app/newsletter/signup-form.tsx
'use client';
import { useActionState } from 'react';
import { subscribe, type FormState } from './actions';

const initial: FormState = {};

export function SignupForm() {
  const [state, formAction, isPending] =
    useActionState(subscribe, initial);

  return (
    <form action={formAction}>
      <input
        name="email"
        defaultValue={state.values?.email}
      />
      {state.errors?.email && (
        <p className="error">{state.errors.email}</p>
      )}
      <button disabled={isPending}>
        {isPending ? 'Saving…' : 'Subscribe'}
      </button>
    </form>
  );
}`,
      note:
        "Same architecture: submit → server validates → form re-renders with errors and old input. The differences: state is typed, repopulation is deliberate (return values in state, feed defaultValue), escaping is automatic, and no full page reload.",
    },
    {
      label: "The handler: $errors array vs typed FormState",
      intro:
        "The server side of the loop. Both build an errors structure on failure and a success signal otherwise — one is an untyped array, one is a declared contract.",
      php: `<?php // validate + persist, PHP style
function handle_signup(array $post): array
{
    $errors = [];
    $email = trim($post['email'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        // Typo 'erros' here? Discovered in production.
        $errors['email'] = 'Enter a valid email address.';
    }
    if ($errors) {
        return ['errors' => $errors,
                'values' => ['email' => $email]];
    }

    save_subscriber($email);
    return ['message' => "Subscribed $email."];
}`,
      ts: `// app/newsletter/actions.ts
'use server';

export interface FormState {
  errors?: Record<string, string>;
  values?: { email?: string };
  message?: string;
}

export async function subscribe(
  prevState: FormState,   // ← useActionState prepends this
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim();

  if (!email.includes('@')) {
    return {
      errors: { email: 'Enter a valid email address.' },
      values: { email }, // echo input back, typed
    };
  }

  await db.subscriber.create({ data: { email } });
  return { message: \`Subscribed \${email}.\` };
}`,
      note:
        "The action's signature is (prevState, formData) => nextState when used with useActionState. FormState is the convention: errors keyed by field, optional values for repopulation, optional message — your PHP result array, but a typo in a key is now a compile error.",
      rightLang: "ts",
    },
    {
      label: "Pending UI: jQuery spinner vs useFormStatus",
      intro:
        "Disable the button and show progress while the POST is in flight — the jQuery ritual versus a reusable five-line component.",
      php: `// legacy.js — the jQuery spinner-on-submit ritual
$('#signup-form').on('submit', function () {
  var $btn = $(this).find('button[type=submit]');
  $btn.prop('disabled', true)
      .data('label', $btn.text())
      .text('Working…');
});

// And don't forget to undo it on error, on
// success, and on validation failure — each
// path re-enables the button by hand, and one
// missed path leaves it stuck on 'Working…'.`,
      ts: `// components/submit-button.tsx — reusable anywhere
'use client';
import { useFormStatus } from 'react-dom';

export function SubmitButton({ label }: { label: string }) {
  // Reads the NEAREST ENCLOSING <form>'s status —
  // must render inside the form, not beside it.
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Working…' : label}
    </button>
  );
}

// Usage, in any form:
// <form action={formAction}>
//   <SubmitButton label="Subscribe" />
// </form>`,
      note:
        "useFormStatus derives pending from the form's actual lifecycle, so there's no manual re-enable and no stuck button. The rule interviewers check: it only works in a component rendered inside the <form> whose status it reports.",
      leftLang: "js",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The useActionState loop with the React plumbing stripped away: an action takes (prevState, formData-like object) and returns the next state. Two submissions run — invalid, then valid. Predict both printed states, then run it.",
    code: `// useActionState in miniature: state = what the action
// last returned; each submit feeds the previous state in
// and renders whatever comes back.

interface FormState {
  errors?: Record<string, string>;
  values?: { email?: string };
  message?: string;
}

type FormValues = Record<string, string>;

// The "server action" — signature (prevState, formData):
function subscribe(prevState: FormState, form: FormValues): FormState {
  const email = (form.email ?? '').trim();
  const errors: Record<string, string> = {};

  if (!email.includes('@')) {
    errors.email = 'Enter a valid email address.';
  }
  if (Object.keys(errors).length > 0) {
    // Failed: return errors AND echo the input back,
    // like repopulating the form from $_POST.
    return { errors, values: { email } };
  }
  return { message: \`Subscribed \${email}.\` };
}

// The hook's loop, hand-cranked:
let state: FormState = {}; // useActionState's initialState
console.log('initial   :', JSON.stringify(state));

// Submission 1 — user typos their email:
state = subscribe(state, { email: 'jason.example.com' });
console.log('submit #1 :', JSON.stringify(state));
// The form re-renders: error under the field,
// input keeps 'jason.example.com' via defaultValue.

// Submission 2 — corrected:
state = subscribe(state, { email: 'jason@example.com' });
console.log('submit #2 :', JSON.stringify(state));
// Errors gone (new state replaces old), message shown.`,
  },

  keyPoints: [
    "`useActionState(action, initialState)` returns `[state, formAction, isPending]` — pass `formAction` to `<form action={...}>`; `state` is whatever the action last returned.",
    "With the hook, the action's signature becomes `(prevState, formData) => nextState` — previous state is prepended before the FormData.",
    "Type the state: `{ errors?: Record<string,string>; values?: {...}; message?: string }` — the PHP `$errors` + old-input array as a declared contract.",
    "Repopulate deliberately: return submitted values in the state and feed them to `defaultValue`, so failed validation never eats the user's input — the `$_POST` echo, escaped for free.",
    "`useFormStatus` (from `react-dom`) gives `{ pending }` for the nearest enclosing form — but only in a component rendered *inside* the `<form>`, which is what makes a reusable `<SubmitButton />`.",
    "The form component is `'use client'` (hooks), the action stays `'use server'` — validation still runs on the server; unlike a Server Component form, a Client Component form does NOT get the JS-disabled full-page POST: Next queues pre-hydration submissions and replays them after hydration.",
  ],

  interview: [
    {
      q: "Walk me through the useActionState loop for a form with server-side validation.",
      a: "`useActionState(action, initialState)` returns the current state, a wrapped `formAction` for the form's action prop, and an `isPending` flag. On submit, React calls my Server Action with the previous state prepended — `(prevState, formData)` — and whatever it returns becomes the new state, re-rendering the form. On validation failure I return a typed shape like `{ errors: { email: '…' }, values: { email } }`, render errors beside their fields, and repopulate inputs via `defaultValue` from the returned values; on success I return a message or redirect. It's the PHP validate-and-redisplay round trip — `$errors` plus `$_POST` echo — with types on the contract and no full page reload, and validation still runs on the server.",
    },
    {
      q: "What's the difference between isPending from useActionState and useFormStatus?",
      a: "They report the same kind of information from different vantage points. `isPending` is returned by `useActionState` in the component that owns the form — convenient when the form and its button live together. `useFormStatus` is for composition: a child component calls it and reads the status of the nearest enclosing form, so I can build one generic `<SubmitButton />` that disables itself in any form without threading a prop through. Its constraint is the interview trap: it must be called from a component rendered *inside* the `<form>` — call it in the same component that renders the form and `pending` never goes true. Both replace the jQuery era's manual disable-and-re-enable, where one missed error path left the button stuck.",
    },
    {
      q: "Why type the action's return state, and what shape do you use?",
      a: "Because the state is a contract between server and client crossing a serialization boundary: the action produces it in `actions.ts`, and the form component renders it. My convention is `interface FormState { errors?: Record<string, string>; values?: {...}; message?: string }` — errors keyed by field name, submitted values echoed back for repopulation, and a success message. In PHP this was an ad-hoc associative array where a typo'd key — `$state['erros']` — rendered nothing and shipped anyway; with a declared interface both sides autocomplete and a typo is a compile error. It also has to be serializable, since it travels from server action to client render — same constraint as any props crossing that boundary.",
    },
  ],

  quiz: [
    {
      question: "What does useActionState(subscribe, {}) return?",
      options: [
        "[formData, submit, errors]",
        "[state, formAction, isPending] — last returned state, the wrapped action for the form, and an in-flight flag",
        "A promise resolving to the action's next return value",
        "[state, setState] — like useState but server-synced",
      ],
      answerIndex: 1,
      explain:
        "The tuple is state (initially the second argument, then whatever the action last returned), formAction (pass to <form action={...}>), and isPending (true while a submission is in flight). It's the whole form loop in one hook.",
    },
    {
      question:
        "When a Server Action is used with useActionState, what is its call signature?",
      options: [
        "(formData: FormData) => state — unchanged",
        "(prevState, formData) => nextState — the previous state is prepended",
        "(event: SubmitEvent, formData: FormData) => void",
        "(formData: FormData, prevState) => nextState — FormData always comes first",
      ],
      answerIndex: 1,
      explain:
        "useActionState prepends the previous state as the first argument, then the FormData — and the return value becomes the next state. This is why the same action can accumulate or replace state across submissions, like carrying $errors between PHP redisplays.",
    },
    {
      question: "Why does useFormStatus return pending: false forever in this code?\n\nfunction Page() { const { pending } = useFormStatus(); return <form action={act}><button disabled={pending}>Go</button></form>; }",
      options: [
        "useFormStatus only works in Server Components",
        "The hook is called in the component that renders the form — it must be called from a component rendered inside the form",
        "pending requires useActionState to be called first",
        "The button needs type=\"submit\" for pending to update",
      ],
      answerIndex: 1,
      explain:
        "useFormStatus reads the status of the nearest enclosing <form> above the component calling it. Called in the component that renders the form, there is no enclosing form, so pending stays false. Fix: move the button into a child component (e.g. <SubmitButton />) rendered inside the form.",
    },
    {
      question:
        "After failed validation, how do you keep the user's typed input in the fields?",
      options: [
        "React preserves inputs automatically across action submissions",
        "Call event.preventDefault() in the action",
        "Return the submitted values in the action's state and render them via defaultValue",
        "Store the values in localStorage before submitting",
      ],
      answerIndex: 2,
      explain:
        "Repopulation is deliberate, exactly like echoing htmlspecialchars($_POST['email']) back into the value attribute in PHP: the action returns values in its state, and the inputs read defaultValue={state.values?.email}. Without it, a failed submit can leave fields empty — the classic lost-input annoyance.",
    },
  ],
};

export default lesson;
