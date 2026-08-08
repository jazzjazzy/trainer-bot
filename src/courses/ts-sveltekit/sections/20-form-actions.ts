import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "form-actions",
  title: "Typed Form Actions",
  part: "Server & Forms",
  estMinutes: 13,
  summary:
    "Handle POSTed forms in +page.server.ts with a typed actions object, narrow raw FormData values, and get a typed form prop back on the page via ActionData.",

  concept: `
If you've written PHP for 20 years, you've written this loop a thousand times:
render a form, POST it to a controller, validate, and either redirect or
re-render with errors and the old input. SvelteKit's **form actions** are
exactly that loop — with the whole round trip typed.

### Declaring actions

Actions live in \`+page.server.ts\` (server only — this is where you touch the
database), as an \`actions\` object:

\`\`\`ts
// src/routes/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = data.get('email'); // FormDataEntryValue | null
    // ...
  },
} satisfies Actions;
\`\`\`

Two things to notice:

- \`Actions\` comes from \`./$types\`, like everything else in a route.
- \`satisfies Actions\` (rather than \`: Actions\`) checks the shape **without
  widening** — the precise return types of each action are preserved, and
  that's what makes the \`form\` prop below so useful.

A \`default\` action handles a plain \`<form method="POST">\`. **Named actions**
(\`save\`, \`delete\`, …) are targeted with a query string:
\`<form method="POST" action="?/save">\` — one page, several POST handlers,
like separate controller methods.

### FormData: the TS discipline moment

\`data.get('email')\` returns \`FormDataEntryValue | null\`, where
\`FormDataEntryValue\` is \`string | File\`. The wire format is stringly-typed —
TypeScript refuses to pretend otherwise. So every action starts by narrowing:

\`\`\`ts
const email = data.get('email');
if (typeof email !== 'string' || !email.includes('@')) {
  return fail(400, { email, missing: true });
}
// email: string from here on
\`\`\`

This is the same discipline as validating \`$_POST\` in PHP — except forgetting
it is a *compile error* the moment you treat the value as a string.

### fail(): validation errors, typed

\`fail(status, data)\` returns an \`ActionFailure\` carrying your data back to
the page with a 4xx status — the "re-render the form with errors and old
input" half of the PHP loop. Return it (don't throw). On success you can
return plain data (\`{ success: true }\`) or \`redirect(303, ...)\` — the classic
POST/redirect/GET.

### The form prop: ActionData

The page component receives a \`form\` prop typed as \`ActionData\` — the union
of everything your actions can return via \`fail()\` or plain return, **or
\`null\`** on first visit (no submission yet):

\`\`\`svelte
<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import type { PageProps } from './$types';
  let { form }: PageProps = $props();
</script>

{#if form?.missing}<p>Email is required.</p>{/if}
{#if form?.success}<p>Welcome back!</p>{/if}

<form method="POST">
  <input name="email" value={form?.email ?? ''} />
  <input name="password" type="password" />
  <button>Log in</button>
</form>
\`\`\`

Because \`ActionData\` is a union, TypeScript makes you check \`form?\` and
narrows per branch — you can't read \`form.success\` in the branch where only
\`missing\` exists. Change what an action returns and the template errors:
one more generated-types feedback loop.

Actions work without JavaScript (it's a real POST); progressive enhancement
via \`use:enhance\` upgrades them to fetch-based submits — that's the next
step once the typed foundation is in place.
`,

  comparisons: [
    {
      label: "The POST handler",
      intro:
        "A login form posts email and password; missing input should send the values back with an error flag — the classic PHP controller loop. The untyped version trusts the FormData; the typed one is forced to validate it.",
      php: `// src/routes/login/+page.server.js  (untyped)
import { fail, redirect } from '@sveltejs/kit';

export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    // Trusted blindly — like reading $_POST raw.
    // A missing field is null, an upload is a File:
    const email = data.get('email').toLowerCase(); // can crash
    const password = data.get('password');

    if (!email || !password) {
      return fail(400, { email, missing: true });
    }

    cookies.set('session', await login(email, password), { path: '/' });
    redirect(303, '/dashboard');
  },
};`,
      ts: `// src/routes/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = data.get('email');       // string | File | null
    const password = data.get('password');

    if (typeof email !== 'string' || typeof password !== 'string'
        || !email || !password) {
      return fail(400, { email, missing: true as const });
    }

    cookies.set('session', await login(email, password), { path: '/' });
    redirect(303, '/dashboard');
  },
} satisfies Actions;`,
      note: "fail(400, {...}) is withErrors()+withInput() in one typed call; redirect(303) is the POST/redirect/GET you know. FormData values must be narrowed from string | File | null before use.",
      leftLang: "php",
      rightLang: "ts",
    },
    {
      label: "Rendering validation state",
      intro:
        "The form page shows errors and repopulates the email field after a failed submit. The typed version's form prop is the exact union of what the action can return — null until a submission happens.",
      php: `<!-- login page (untyped) -->
<script>
  let { form } = $props();
  // form is 'any': form.mising, form.succes — all fine
  // until users see 'undefined' in production
</script>

{#if form && form.missing}<p>Email required.</p>{/if}

<form method="POST">
  <input name="email" value={form ? form.email : ''} />
  <button>Log in</button>
</form>`,
      ts: `<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import type { PageProps } from './$types';
  let { form }: PageProps = $props();
  // form: { email: ...; missing: true } | null  (ActionData)
</script>

{#if form?.missing}<p>Email required.</p>{/if}

<form method="POST">
  <input name="email" value={typeof form?.email === 'string'
    ? form.email : ''} />
  <button>Log in</button>
</form>`,
      note: "ActionData is inferred from every fail()/return in your actions, unioned with null for the first visit — misspell a field and the template won't compile.",
    },
    {
      label: "Named actions on one page",
      intro:
        "A settings page with two buttons: save the profile or delete the account. Named actions give each its own handler; the form targets one with ?/name.",
      php: `// +page.server.ts  (untyped, one catch-all)
export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    // manual dispatch on a hidden 'op' field
    if (data.get('op') === 'delete') {
      // ... delete
    } else {
      // ... save
    }
  },
};`,
      ts: `// src/routes/settings/+page.server.ts
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
  save: async ({ request }) => {
    const data = await request.formData();
    const name = data.get('name');
    if (typeof name !== 'string' || !name) {
      return fail(400, { name, invalid: true as const });
    }
    return { saved: true as const };
  },
  delete: async ({ cookies }) => {
    cookies.delete('session', { path: '/' });
    return { deleted: true as const };
  },
} satisfies Actions;

// <form method="POST" action="?/save"> …
// <button formaction="?/delete">Delete</button>`,
      note: "Named actions replace hidden-field dispatch: the URL (?/save, ?/delete) picks the handler, and ActionData becomes the union of both actions' returns — the page narrows on saved/deleted/invalid.",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Both halves of the typed form loop in one runnable file: narrowing raw FormData-style values (string | File | null), then handling the resulting ActionData union the way the page's form prop does. Predict all four outputs.",
    code: `// Half 1: FormData discipline — values are string | File | null.
type FakeFile = { name: string; size: number };
type FormDataEntryValueish = string | FakeFile | null;

function getField(raw: FormDataEntryValueish): string | undefined {
  // Must narrow: it could be a File (uploads) or null (absent field).
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return undefined;
}

// Half 2: ActionData — the union of everything actions can return, or null.
type ActionData =
  | { missing: true; email: FormDataEntryValueish } // fail(400, ...)
  | { invalid: true; email: string }                // fail(422, ...)
  | { success: true; userId: number }               // happy-path return
  | null;                                           // first visit, no POST yet

// The "action": validate a submitted email field.
function loginAction(rawEmail: FormDataEntryValueish): ActionData {
  const email = getField(rawEmail);
  if (email === undefined) return { missing: true, email: rawEmail };
  if (!email.includes("@")) return { invalid: true, email };
  return { success: true, userId: 7 };
}

// The "page": render the form prop by narrowing the union.
function renderForm(form: ActionData): string {
  if (form === null) return "fresh form (no submission yet)";
  if ("missing" in form) return "error: email is required";
  if ("invalid" in form) return \`error: '\${form.email}' is not an email\`;
  return \`welcome, user #\${form.userId}\`; // narrowed to the success branch
}

console.log(renderForm(null));
console.log(renderForm(loginAction(null)));
console.log(renderForm(loginAction("not-an-email")));
console.log(renderForm(loginAction("ada@example.com")));`,
  },

  keyPoints: [
    "Form actions live in `+page.server.ts` as `export const actions = {...} satisfies Actions` — `Actions` imported from `./$types`; `satisfies` keeps each action's precise return type.",
    "`data.get('field')` is `FormDataEntryValue | null` (`string | File | null`) — narrow/coerce before use; this is validating `$_POST`, but enforced by the compiler.",
    "`fail(400, { email, missing: true })` returns validation failures (with old input) to the page with a 4xx status; return it, don't throw it.",
    "The page's `form` prop is `ActionData`: the union of every action's `fail`/success shapes, or `null` before any submission — narrow it in the template.",
    "Named actions (`save`, `delete`) are targeted with `action=\"?/save\"` (or `formaction` on a button) — one route, several POST handlers, no hidden dispatch field.",
    "On success prefer `redirect(303, ...)` — the same POST/redirect/GET pattern as a classic PHP controller; actions work without JS and can be enhanced later.",
  ],

  interview: [
    {
      q: "Walk me through a typed form action round trip in SvelteKit.",
      a: "The page has a `<form method=\"POST\">`; the route's `+page.server.ts` exports `actions` checked with `satisfies Actions` from `./$types`. The action reads `request.formData()`, whose values are `FormDataEntryValue | null` — i.e. `string | File | null` — so I narrow them first. Validation failures return `fail(400, { email, missing: true })`, which re-renders the page with a 4xx and hands that object to the component; success either returns data or calls `redirect(303, ...)` for POST/redirect/GET. The component receives it as the `form` prop, typed `ActionData`: the union of every action's possible returns, or `null` on first visit, so the template narrows with `form?.missing` etc. Rename a field in the action and the template stops compiling.",
    },
    {
      q: "Why does SvelteKit type form values as string | File instead of just string, and is that annoying?",
      a: "Because that's what the platform's `FormData` actually carries — text fields are strings, `<input type=\"file\">` entries are `File` objects, and a missing field is `null`. Typing it honestly forces the same validation you'd do on `$_POST` in PHP, except skipping it is now a compile error rather than a production bug. In practice each action starts with a few `typeof x === 'string'` narrows or a schema parse (Zod is common), and after that everything downstream is precisely typed. Mildly verbose, but it's verbosity at exactly the trust boundary where you want it.",
    },
    {
      q: "What's the difference between returning fail() and calling error() in an action?",
      a: "`fail(status, data)` is for *expected validation failures*: it keeps the user on the form, re-renders the same page with a 4xx status, and delivers your data (field errors, old input) as the typed `form` prop — PHP's 'back with errors and input'. `error(status, body)` aborts into the nearest `+error.svelte` — the form is gone, so it's for genuinely broken requests, not 'password too short'. And on success you usually don't return at all but `redirect(303, ...)` so a refresh doesn't re-POST.",
    },
    {
      q: "How do named actions work and why prefer them over one handler that switches on a field?",
      a: "You export several keys — `{ save: ..., delete: ... } satisfies Actions` — and the form picks one via the URL: `action=\"?/save\"`, or per-button with `formaction=\"?/delete\"`. Each handler stays small and independently typed, and `ActionData` becomes the union of all their return shapes, so the template can discriminate on `form?.saved` versus `form?.deleted`. A single `default` handler switching on a hidden field is the stringly-typed version of the same thing: no per-branch types, and the dispatch logic is your problem instead of the router's.",
    },
  ],

  quiz: [
    {
      question: "What type does `data.get('email')` return inside an action, and why?",
      options: [
        "string — form fields are always text",
        "FormDataEntryValue | null, i.e. string | File | null — fields can be files or absent",
        "unknown — SvelteKit can't see the form",
        "It depends on the input's type attribute, which SvelteKit reads at compile time",
      ],
      answerIndex: 1,
      explain:
        "FormData is honest about the wire: entries are strings or File objects, and get() returns null for missing fields. You must narrow (or schema-parse) before treating a value as a string — the compiler enforces it.",
    },
    {
      question: "What is the page's `form` prop on the very first visit, before any POST?",
      options: [
        "An object with every field set to undefined",
        "An empty object {}",
        "null — ActionData includes null for 'no submission yet'",
        "It's not defined until an action file exists and a POST occurs",
      ],
      answerIndex: 2,
      explain:
        "ActionData is the union of the actions' possible returns OR null; a GET render has no action result, so form is null and templates use form?.field.",
    },
    {
      question: "Which form targets the `save` action of `export const actions = { save, delete }`?",
      options: [
        "<form method=\"POST\" action=\"/save\">",
        "<form method=\"POST\" action=\"?/save\">",
        "<form method=\"POST\" data-action=\"save\">",
        "<form method=\"POST\"> with <input type=\"hidden\" name=\"action\" value=\"save\">",
      ],
      answerIndex: 1,
      explain:
        "Named actions are addressed with the ?/name query suffix on the same route (or formaction=\"?/name\" on a specific button). A leading /save would be a different route entirely.",
    },
    {
      question: "Why write `satisfies Actions` instead of `: Actions` on the actions object?",
      options: [
        "satisfies is required — the : annotation doesn't compile on objects",
        "satisfies checks the shape while preserving each action's precise return types, which is what makes ActionData's union exact",
        "satisfies runs the check at runtime as well as compile time",
        "There is no difference; it's purely stylistic",
      ],
      answerIndex: 1,
      explain:
        "An explicit : Actions annotation would widen the actions' return types to the general contract; satisfies validates against Actions but keeps the inferred literal returns — so the generated ActionData union stays precise for the form prop.",
    },
  ],
};

export default lesson;
