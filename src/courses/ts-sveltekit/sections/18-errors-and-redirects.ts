import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "errors-and-redirects",
  title: "Typed Errors & Redirects",
  part: "Routing & Data",
  estMinutes: 11,
  summary:
    "How error() and redirect() short-circuit a request in SvelteKit 2, how App.Error gives every expected error a typed shape, and where +error.svelte fits in.",

  concept: `
In a PHP framework you'd write \`abort(404)\` or return a \`RedirectResponse\`.
SvelteKit's equivalents are \`error()\` and \`redirect()\` from \`@sveltejs/kit\` —
and both are typed all the way to the error page.

### error(): call it, don't throw it

\`\`\`ts
// src/routes/blog/[slug]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const post = await db.getPost(params.slug);
  if (!post) {
    error(404, { message: 'Not found' }); // no throw keyword
  }
  return { post };
};
\`\`\`

In **SvelteKit 2** you call \`error()\` without \`throw\` — it throws internally,
and its return type is \`never\`, so TypeScript knows execution stops there
(\`post\` is narrowed to non-null after the \`if\`). Same for \`redirect()\`. The
one rule: don't swallow them in your own \`try/catch\`. If you must wrap code
that may call them, re-identify them with \`isHttpError\` / \`isRedirect\` from
\`@sveltejs/kit\` and rethrow.

### Shaping expected errors: App.Error

By default an error body is \`{ message: string }\`. You can demand more by
augmenting the \`App.Error\` interface in \`src/app.d.ts\`:

\`\`\`ts
// src/app.d.ts
declare global {
  namespace App {
    interface Error {
      message: string;
      code: string; // e.g. 'POST_NOT_FOUND'
    }
  }
}
export {};
\`\`\`

From that moment, **every** \`error()\` call in the app must supply a \`code\`
— \`error(404, { message: 'Not found' })\` becomes a compile error until you add
one. That's the trick: the shape of your error pages is enforced at the point
errors are raised, project-wide.

### Rendering: +error.svelte

When \`error()\` fires, SvelteKit renders the nearest \`+error.svelte\` up the
route tree. It reads the status and the typed body from \`$app/state\`:

\`\`\`svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<h1>{page.status}</h1>
<p>{page.error?.message}</p>
<p>Reference: {page.error?.code}</p> <!-- typed via App.Error -->
\`\`\`

\`page.error\` is \`App.Error | null\`, so your custom fields autocomplete.

### redirect(): the other short-circuit

\`\`\`ts
import { redirect } from '@sveltejs/kit';

if (!locals.user) {
  redirect(303, '/login'); // also no throw needed; returns never
}
\`\`\`

Use \`303\` after form submissions (redirect-as-GET), \`307\`/\`308\` to preserve
the method. Because it returns \`never\`, code after it is unreachable and
TypeScript treats it that way.

### Unexpected errors

Everything above is *expected* errors — ones you raise on purpose. A genuine
crash (a thrown \`TypeError\`, a failed DB connection) never reaches the client
raw: SvelteKit routes it through the \`handleError\` hook, where you log it and
return a safe \`App.Error\`-shaped body. Hooks get their own section later;
for now, know that \`error()\` = deliberate, \`handleError\` = everything else.
`,

  comparisons: [
    {
      label: "Missing record → 404",
      intro:
        "A load function looks up a post and 404s when it doesn't exist. The left side hand-rolls a failure; the right uses error(), which stops execution and renders +error.svelte with a typed body.",
      php: `// +page.server.ts  (untyped, hand-rolled)
export async function load({ params }) {
  const post = await getPost(params.slug);
  if (!post) {
    // Returning a flag instead of failing properly:
    // the page renders with data.notFound and a 200 status
    return { notFound: true };
  }
  return { post };
}`,
      ts: `// src/routes/blog/[slug]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPost(params.slug);
  if (!post) {
    // SvelteKit 2: no 'throw' — error() returns never
    error(404, { message: 'Post not found', code: 'POST_NOT_FOUND' });
  }
  return { post }; // post narrowed to non-null here
};`,
      note: "error() sends a real 404 status and renders the nearest +error.svelte; because it returns never, TypeScript narrows post after the if — no throw keyword since SvelteKit 2.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "The error page",
      intro:
        "The +error.svelte that renders when error() fires. The typed version reads page.status and the App.Error-shaped body from $app/state with full autocomplete.",
      php: `<!-- src/routes/+error.svelte (untyped) -->
<script>
  import { page } from '$app/state';
  // page.error is 'any'-ish to you: page.error.codee
  // renders as undefined with no warning
</script>

<h1>{page.status}</h1>
<p>{page.error.message}</p>`,
      ts: `<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  // page.error: App.Error | null — message AND code are known
</script>

<h1>{page.status}</h1>
<p>{page.error?.message}</p>
{#if page.error?.code}
  <p class="ref">Error code: {page.error.code}</p>
{/if}`,
      note: "Augmenting App.Error in app.d.ts types page.error everywhere — and forces every error() call site to provide the extra fields.",
    },
    {
      label: "Guarding a route with a redirect",
      intro:
        "An account page bounces anonymous visitors to /login — PHP's return RedirectResponse becomes a redirect() call that short-circuits the load. The untyped version wraps it in a try/catch that quietly breaks it.",
      php: `// +page.server.js  (untyped — and subtly broken)
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
  try {
    if (!locals.user) {
      redirect(303, '/login');
    }
    return { user: locals.user };
  } catch (e) {
    // Oops: this swallows the Redirect object —
    // the user never reaches /login
    return { user: null };
  }
}`,
      ts: `// src/routes/account/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login'); // no throw, no return needed
  }
  // locals.user narrowed: redirect() returns never
  return { user: locals.user };
};`,
      note: "Where PHP RETURNS a RedirectResponse, SvelteKit 2 just CALLS redirect() — it throws internally, so a blanket catch swallows it. Let it propagate (or rethrow via isRedirect).",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of SvelteKit's control flow: error() and redirect() that throw internally and return never, plus the framework-side catch that tells them apart with isHttpError/isRedirect-style checks. Predict the three lines of output.",
    code: `// Mini SvelteKit: expected errors and redirects as control flow.

type AppError = { message: string; code: string }; // our App.Error shape

class HttpError {
  constructor(public status: number, public body: AppError) {}
}
class Redirect {
  constructor(public status: number, public location: string) {}
}

// Like SvelteKit 2: you CALL these — they throw internally, return never.
function error(status: number, body: AppError): never {
  throw new HttpError(status, body);
}
function redirect(status: number, location: string): never {
  throw new Redirect(status, location);
}

// A load function using them:
function load(slug: string, user: string | null) {
  if (!user) redirect(303, "/login");
  const post = slug === "hello" ? { title: "Hello!" } : null;
  if (!post) error(404, { message: "Post not found", code: "POST_NOT_FOUND" });
  return { post }; // post is narrowed: error() returned never
}

// The framework-side handler (think: SvelteKit's request pipeline):
function respond(slug: string, user: string | null): string {
  try {
    const data = load(slug, user);
    return \`200 → \${data.post.title}\`;
  } catch (e) {
    if (e instanceof Redirect) return \`\${e.status} → Location: \${e.location}\`;
    if (e instanceof HttpError)
      return \`\${e.status} → +error.svelte [\${e.body.code}] \${e.body.message}\`;
    return "500 → handleError hook (unexpected)";
  }
}

console.log(respond("hello", "ada"));
console.log(respond("missing", "ada"));
console.log(respond("hello", null));`,
  },

  keyPoints: [
    "In SvelteKit 2 you call `error(404, {...})` and `redirect(303, '/login')` *without* `throw` — they throw internally and return `never`, so TypeScript narrows code after them.",
    "Never catch them accidentally: inside your own `try/catch`, identify them with `isHttpError`/`isRedirect` from `@sveltejs/kit` and rethrow.",
    "Augment `App.Error` in `src/app.d.ts` (e.g. add `code`) and every `error()` call in the project must satisfy the new shape at compile time.",
    "`+error.svelte` renders expected errors, reading `page.status` and the typed `page.error` (`App.Error | null`) from `$app/state`.",
    "Use `303` for post-form redirects (becomes GET), `307`/`308` to preserve the method.",
    "Unexpected (thrown) errors go through the `handleError` hook, where you log and return a safe `App.Error` body — covered with the other hooks later.",
    "PHP mapping: `error(404, ...)` ≈ `abort(404)`, `redirect(303, ...)` ≈ returning a `RedirectResponse` — except you call instead of return.",
  ],

  interview: [
    {
      q: "How do error() and redirect() work in SvelteKit 2, and what changed from v1?",
      a: "Both come from `@sveltejs/kit` and short-circuit the request: `error(404, body)` renders the nearest `+error.svelte` with that status and body, `redirect(303, location)` sends a redirect response. In SvelteKit 1 you had to write `throw error(...)`; since v2 you just *call* them — they throw internally and are typed to return `never`, which means TypeScript knows execution stops, so guards like `if (!post) error(404, ...)` narrow `post` afterwards. The caveat is not to catch them in your own try/catch; if you wrap risky code, use `isHttpError` and `isRedirect` to re-throw the framework's control-flow errors.",
    },
    {
      q: "What is App.Error and why would you extend it?",
      a: "It's the interface in the `App` namespace (declared in `src/app.d.ts`) describing the body of every *expected* error — by default `{ message: string }`. Extending it, say with a `code: string` field, does two things: `page.error` in `+error.svelte` is typed with your fields, and every `error()` call site in the project is now *required* to supply them, enforced at compile time. So the contract between where errors are raised and where they're rendered is a single typed interface — you can't ship an error page that expects a `code` the backend never sends.",
    },
    {
      q: "Coming from PHP: where do abort(404) and RedirectResponse map onto SvelteKit, and what's the gotcha?",
      a: "`error(404, {...})` is your `abort(404)` and `redirect(303, '/login')` is your `return redirect('/login')` — same intent, same status-code semantics (303 after form posts, 307/308 to keep the method). The gotcha is the mechanism: in PHP you *return* the redirect response up the stack; in SvelteKit you *call* the function mid-load and it throws a special object the framework catches. So a broad `catch (e)` around your code can accidentally swallow a redirect — the equivalent of catching Laravel's `HttpException` from `abort()` — and you must rethrow anything that `isRedirect`/`isHttpError` identifies.",
    },
  ],

  quiz: [
    {
      question: "In SvelteKit 2, which is the correct way to 404 from a load function?",
      options: [
        "`throw new Error('404')`",
        "`return { status: 404 }`",
        "`error(404, { message: 'Not found' })` — called, not thrown",
        "`response.status = 404`",
      ],
      answerIndex: 2,
      explain:
        "Since SvelteKit 2, error() is simply called — it throws internally and returns never. Throwing a plain Error would be an *unexpected* error routed to handleError instead.",
    },
    {
      question: "You add `code: string` to App.Error in app.d.ts. What happens to an existing `error(404, { message: 'Nope' })` call?",
      options: [
        "Nothing — App.Error only affects +error.svelte",
        "It becomes a compile error until you add a code field",
        "It works but logs a deprecation warning at runtime",
        "SvelteKit auto-fills code with the status text",
      ],
      answerIndex: 1,
      explain:
        "error()'s body parameter is typed as App.Error, so widening the interface makes every call site that omits the new required field fail to compile — the error contract is enforced project-wide.",
    },
    {
      question: "Where does an +error.svelte read the status and error body?",
      options: [
        "From its own `./$types` PageData",
        "From `page.status` and `page.error` via `$app/state`",
        "From a special `error` prop passed by the layout",
        "From `getContext('error')`",
      ],
      answerIndex: 1,
      explain:
        "Error pages import { page } from '$app/state' and read page.status and page.error — the latter typed as App.Error | null, so custom fields like code autocomplete.",
    },
    {
      question: "A try/catch around code that calls redirect(303, '/login') breaks the redirect. Why?",
      options: [
        "redirect() only works at the top level of a load function",
        "redirect() throws a control-flow object internally, and your catch swallowed it before SvelteKit could handle it",
        "303 is not a valid status inside try blocks",
        "The catch block runs on the client where redirects are forbidden",
      ],
      answerIndex: 1,
      explain:
        "redirect() (like error()) throws a special object that SvelteKit's request handling catches. A blanket catch intercepts it; use isRedirect/isHttpError from @sveltejs/kit to detect and rethrow them.",
    },
  ],
};

export default lesson;
