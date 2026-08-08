import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "progressive-enhancement",
  title: "use:enhance & SubmitFunction",
  part: "Server & Forms",
  estMinutes: 12,
  summary:
    "Forms that work with JavaScript disabled, upgraded with use:enhance — and a typed SubmitFunction handling the ActionResult discriminated union.",

  concept: `
The whole point of form actions is that they work **without any client-side
JavaScript**. A plain \`<form method="POST">\` posts to your action, the server
runs it, and the browser renders the response — exactly like a classic PHP
controller handling a POST and re-rendering the page. If the user's JS fails to
load, your app still works.

\`use:enhance\` is the upgrade path: one attribute that intercepts the submit,
sends it via \`fetch\` instead of a full-page navigation, and applies the result
— no reload, no lost scroll position. Think of it as the \`$.ajax\` form handler
you used to hand-roll in the jQuery era, except SvelteKit generates it and keeps
it in sync with your action's types.

### The default behaviour

\`\`\`svelte
<script lang="ts">
  import { enhance } from '$app/forms';
</script>

<form method="POST" use:enhance>
\`\`\`

With no arguments, \`use:enhance\` emulates what the browser would have done,
minus the reload. On a response it updates the \`form\` prop and \`page.form\`,
resets the \`<form>\` element, re-runs \`load\` functions (via \`invalidateAll\`)
on success, navigates on a redirect, and renders the nearest \`+error\` boundary
on an unexpected error. **For most forms this is all you need.**

### Customising with a typed SubmitFunction

When you need a loading spinner, optimistic UI, or to cancel duplicate submits,
pass a callback. Its type is \`SubmitFunction\` from \`@sveltejs/kit\`:

- It runs **before** submission and receives
  \`{ formData, formElement, action, cancel, submitter, controller }\`.
  Call \`cancel()\` to abort; mutate \`formData\` to add fields.
- It can **return** an async callback that runs **after** the server responds,
  receiving \`{ result, update }\`. \`result\` is an \`ActionResult\`;
  \`update()\` triggers the default behaviour (and accepts
  \`{ reset: false }\` / \`{ invalidateAll: false }\`).
- If you take over completely, call \`applyAction(result)\` (from
  \`$app/forms\`) to apply the result to \`page.form\` / \`page.status\` and
  handle redirects and errors properly.

### ActionResult — a genuine discriminated-union win

\`ActionResult\` is a textbook TypeScript discriminated union:

\`\`\`ts
type ActionResult<Success, Failure> =
  | { type: 'success';  status: number; data?: Success }
  | { type: 'failure';  status: number; data?: Failure }
  | { type: 'redirect'; status: number; location: string }
  | { type: 'error';    status?: number; error: any };
\`\`\`

Switch on \`result.type\` and the compiler narrows each branch: \`location\`
only exists on \`'redirect'\`, \`data\` only on \`'success'\`/\`'failure'\`.
Reach for \`result.location\` inside the \`'success'\` branch and you get a
compile error — the union *is* the documentation.

### When is the default enough?

If your post-submit needs are "show the validation errors and refresh the data",
plain \`use:enhance\` does it. Only write a \`SubmitFunction\` when you need
pending state, cancellation, custom toasts, or to keep form values after
success. And remember: everything you add is an *enhancement* — the no-JS path
through your action must still make sense.
`,

  comparisons: [
    {
      label: "Enhancing a login form",
      intro:
        "A login form that posts to a form action and shows a pending state while the request is in flight. Both versions intercept the submit and re-enable the button when the server responds.",
      php: `<!-- src/routes/login/+page.svelte (untyped) -->
<script>
  import { enhance } from '$app/forms';

  let { form } = $props();
  let submitting = $state(false);
</script>

<form
  method="POST"
  use:enhance={({ formData, cancel }) => {
    if (!formData.get('email')) cancel();
    submitting = true;

    return async ({ result, update }) => {
      submitting = false;
      await update();
    };
  }}
>
  <input name="email" type="email" />
  <input name="password" type="password" />
  <button disabled={submitting}>Log in</button>
  {#if form?.message}<p>{form.message}</p>{/if}
</form>`,
      ts: `<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { PageProps } from './$types';

  let { form }: PageProps = $props();
  let submitting = $state(false);

  const handleSubmit: SubmitFunction = ({ formData, cancel }) => {
    // formData: FormData, cancel: () => void — typed, autocompleted
    if (!formData.get('email')) cancel();
    submitting = true;

    return async ({ result, update }) => {
      submitting = false;
      await update(); // default behaviour: form prop, invalidateAll
    };
  };
</script>

<form method="POST" use:enhance={handleSubmit}>
  <input name="email" type="email" />
  <input name="password" type="password" />
  <button disabled={submitting}>Log in</button>
  {#if form?.message}<p>{form.message}</p>{/if}
</form>`,
      note:
        "Annotating the callback as SubmitFunction types every destructured field — misspell `cancel` or treat formData as a plain object and the compiler catches it before you ever submit.",
    },
    {
      label: "Handling the ActionResult",
      intro:
        "A custom post-submit callback that reacts differently to success, validation failure, and redirect. The untyped version guesses at the result's shape; the typed one narrows it.",
      php: `<!-- src/routes/signup/+page.svelte (untyped) -->
<script>
  import { enhance, applyAction } from '$app/forms';

  let toast = $state('');
</script>

<form
  method="POST"
  use:enhance={() => {
    return async ({ result }) => {
      // result.data might not exist; result.location
      // only exists sometimes — nothing warns you here
      if (result.type === 'success') {
        toast = result.data.message; // runtime bomb if data is undefined
      }
      await applyAction(result);
    };
  }}
>
  <button>Sign up</button>
</form>`,
      ts: `<!-- src/routes/signup/+page.svelte -->
<script lang="ts">
  import { enhance, applyAction } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';

  let toast = $state('');

  const handleSubmit: SubmitFunction = () => {
    return async ({ result }) => {
      switch (result.type) {
        case 'success':
          toast = result.data?.message ?? 'Done!'; // data is typed optional
          break;
        case 'failure':
          toast = 'Please fix the errors below.';
          break;
        case 'redirect':
          toast = 'Redirecting to ' + result.location; // narrowed: location exists
          break;
      }
      await applyAction(result); // still apply form prop / redirect / error
    };
  };
</script>

<form method="POST" use:enhance={handleSubmit}>
  <button>Sign up</button>
</form>`,
      note:
        "ActionResult is a discriminated union on `type` — the compiler only lets you touch `result.location` in the 'redirect' branch and forces you to treat `data` as optional.",
    },
  ],

  playground: {
    intro:
      "A hand-written ActionResult union and a handler that narrows it. Predict each line, then try accessing result.location inside the 'success' case — the editor will refuse.",
    lang: "typescript",
    code: `// The shape SvelteKit gives your use:enhance callback (simplified)
type ActionResult<
  Success extends Record<string, unknown> = Record<string, unknown>,
  Failure extends Record<string, unknown> = Record<string, unknown>
> =
  | { type: "success"; status: number; data?: Success }
  | { type: "failure"; status: number; data?: Failure }
  | { type: "redirect"; status: number; location: string }
  | { type: "error"; status?: number; error: unknown };

type SignupSuccess = { message: string };
type SignupFailure = { field: string; problem: string };

function react(result: ActionResult<SignupSuccess, SignupFailure>): string {
  // Switching on the discriminant narrows every branch:
  switch (result.type) {
    case "success":
      // result.data is SignupSuccess | undefined here
      return "OK " + result.status + ": " + (result.data?.message ?? "no message");
    case "failure":
      // result.data is SignupFailure | undefined here
      return "Fix " + (result.data?.field ?? "form") + ": " + (result.data?.problem ?? "invalid");
    case "redirect":
      // result.location only exists in this branch
      return "Go to " + result.location + " (" + result.status + ")";
    case "error":
      return "Unexpected error (status " + (result.status ?? 500) + ")";
  }
}

console.log(react({ type: "success", status: 200, data: { message: "Welcome, Ada" } }));
console.log(react({ type: "failure", status: 400, data: { field: "email", problem: "already taken" } }));
console.log(react({ type: "redirect", status: 303, location: "/dashboard" }));
console.log(react({ type: "error", error: new Error("boom") }));`,
  },

  keyPoints: [
    "Form actions work with **zero client JS** — `use:enhance` is an upgrade, not a requirement. The no-JS path must stay sensible.",
    "Bare `use:enhance` emulates the browser: updates the `form` prop, resets the form, `invalidateAll`s on success, follows redirects.",
    "Type custom callbacks as `SubmitFunction` (from `@sveltejs/kit`) — it types `{ formData, cancel, submitter, ... }` and the returned `({ result, update })` handler.",
    "`ActionResult` is a discriminated union on `type`: `'success' | 'failure' | 'redirect' | 'error'` — narrowing gives you `location` only on redirect, `data` only on success/failure.",
    "If you replace the default handling, call `applyAction(result)` so redirects, errors, and `page.form` still behave correctly.",
    "`update({ reset: false })` keeps field values after a successful submit; `update({ invalidateAll: false })` skips the data refresh.",
  ],

  interview: [
    {
      q: "What does progressive enhancement mean for SvelteKit forms, and how does use:enhance fit in?",
      a: "SvelteKit form actions handle a plain `<form method=\"POST\">` on the server, so the form works even if JavaScript never loads — the same request/response model as a classic PHP POST controller. `use:enhance` then progressively upgrades that form: it intercepts the submit, sends it with `fetch`, and applies the result client-side without a full page reload. Because the baseline is a real HTML form hitting a real server action, you get resilience for free and the enhanced experience is purely additive. That's the opposite of an SPA-only form, where no JS means no form at all.",
    },
    {
      q: "Walk me through customising use:enhance. What's typed, and where?",
      a: "You pass a callback typed as `SubmitFunction` from `@sveltejs/kit`. It runs before submission with `{ formData, formElement, action, cancel, submitter, controller }` — so you can validate, add fields, show a spinner, or `cancel()`. Optionally it returns an async function that runs after the server responds, receiving `{ result, update }`. `result` is an `ActionResult` discriminated union, so I switch on `result.type` and the compiler narrows each branch — `location` on redirects, optional `data` on success/failure. If I've overridden the defaults I call `applyAction(result)` (or `update()`) so the `form` prop, redirects, and error boundaries still work.",
    },
    {
      q: "Why is ActionResult a good showcase for TypeScript discriminated unions?",
      a: "Because the four outcomes of a form submission genuinely have different shapes: success and failure may carry `data`, a redirect carries `location`, an error carries `error`. Modelling that as one object with all-optional fields would let you read `result.location` after a success and get `undefined` at runtime. As a discriminated union on the `type` field, `switch (result.type)` narrows each case, so illegal reads are compile errors and an exhaustive switch is checkable. It's the same payoff as PHP 8.1 enums plus `match`, but with per-variant payloads.",
    },
  ],

  quiz: [
    {
      question: "With JavaScript disabled, what happens to a form wired to a SvelteKit action?",
      options: [
        "It silently does nothing — actions require use:enhance",
        "It posts natively, the action runs on the server, and the browser renders the response",
        "It throws a hydration error",
        "It falls back to a GET request",
      ],
      answerIndex: 1,
      explain:
        "Actions handle plain HTML form POSTs. use:enhance only changes *how* the request is sent (fetch instead of navigation) — the server-side behaviour is identical, which is the whole point of progressive enhancement.",
    },
    {
      question: "Inside `return async ({ result }) => { ... }`, when can you safely read `result.location`?",
      options: [
        "Always — every ActionResult has a location",
        "Only after calling applyAction(result)",
        "Only after narrowing to result.type === 'redirect'",
        "Only when the action returned fail()",
      ],
      answerIndex: 2,
      explain:
        "ActionResult is a discriminated union: `location` exists only on the `{ type: 'redirect' }` member. TypeScript requires you to narrow on `result.type` first — which is exactly the union doing its job.",
    },
    {
      question: "You wrote a custom callback but still want the standard behaviour (form prop updated, data invalidated) afterwards. What do you call?",
      options: [
        "update() — or applyAction(result) if you need redirect/error handling applied too",
        "invalidateAll() directly",
        "goto(result.location) in every case",
        "Nothing — it happens automatically even with a custom callback",
      ],
      answerIndex: 0,
      explain:
        "Returning a callback replaces the default post-submit logic. `update()` re-triggers it (with optional `{ reset, invalidateAll }` tweaks); `applyAction(result)` applies the given result to page.form/page.status and handles redirect and error results.",
    },
  ],
};

export default lesson;
