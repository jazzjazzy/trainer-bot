import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "hooks",
  title: "Hooks: Handle, handleFetch & handleError",
  part: "Server & Forms",
  estMinutes: 12,
  summary:
    "src/hooks.server.ts is your middleware layer: a typed Handle wrapping every request, composed with sequence(), plus handleFetch and a handleError that returns your App.Error shape.",

  concept: `
Every request that hits your SvelteKit server — pages, endpoints, form actions
— flows through **\`src/hooks.server.ts\`**. If you've written PSR-15 middleware
or a Laravel middleware pipeline, you already know this file: it's the one
place that sees everything before your route code runs, and everything after.

### handle — the middleware function

\`\`\`ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // before: runs for every request — read cookies, set event.locals
  const response = await resolve(event); // hand off to routing + your route code
  // after: runs on the way out — add headers, log timing
  response.headers.set('x-powered-by', 'sveltekit');
  return response;
};
\`\`\`

The shape is exactly PHP middleware: \`event\` ≈ the request,
\`resolve\` ≈ \`$next($request)\`, and you can act before, after, or **instead**
— return your own \`Response\` without calling \`resolve\` at all (auth walls,
maintenance mode). The \`Handle\` type from \`@sveltejs/kit\` types both
arguments, and — because \`event.locals\` is your \`App.Locals\` from
\`app.d.ts\` — whatever you attach here is typed everywhere downstream.

### Composing with sequence()

One giant handle turns into spaghetti. \`sequence()\` from
\`@sveltejs/kit/hooks\` chains small, focused handles, middleware-stack style:

\`\`\`ts
import { sequence } from '@sveltejs/kit/hooks';

export const handle = sequence(logger, authenticate, securityHeaders);
\`\`\`

They run in order on the way in and unwind on the way out — the onion model.
(Fine print: \`transformPageChunk\` options merge in reverse order; for
\`preload\` the first handler to define one wins.)

### handleFetch — rewriting server-side fetches

When your \`load\` functions \`fetch('https://api.yourapp.com/...')\` during
SSR, \`handleFetch\` lets you intercept: rewrite the public URL to an internal
one (skip the load balancer), or forward credentials. Type it as
\`HandleFetch\`; it receives \`{ event, request, fetch }\` and returns a
\`Response\`.

### handleError — your App.Error contract, honoured

Unexpected exceptions (not \`error(404, ...)\` — genuinely unhandled throws)
land in \`handleError\`. Whatever it returns becomes \`page.error\`, and its
return type is **\`App.Error\`** — the interface you declared in \`app.d.ts\`.
This is where that declaration pays off: add \`errorId: string\` to
\`App.Error\`, and the compiler forces \`handleError\` to return one, and your
\`+error.svelte\` can rely on it being there.

\`\`\`ts
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, status, message }) => {
  const errorId = crypto.randomUUID();
  console.error(errorId, status, error);
  return { message: 'Something went wrong', errorId }; // must satisfy App.Error
};
\`\`\`

### The other two files

- **\`src/hooks.client.ts\`** — the browser-side twin; mostly just a client
  \`handleError\` (typed \`HandleClientError\`) for error reporting.
- **\`src/hooks.ts\`** — *universal* hooks, run on both server and client.
  Home of \`reroute\`, a one-liner that changes how a URL translates to a
  route: \`export const reroute: Reroute = ({ url }) =>
  url.pathname === '/alt' ? '/about' : undefined;\` — handy for translated
  or vanity URLs without duplicating route folders.
`,

  comparisons: [
    {
      label: "A typed handle pipeline",
      intro:
        "Two concerns — request logging and a maintenance-mode gate — composed into the handle export. Both versions behave identically at runtime.",
      leftLang: "js",
      rightLang: "ts",
      php: `// src/hooks.server.js (untyped)
import { sequence } from '@sveltejs/kit/hooks';

async function logger({ event, resolve }) {
  const start = Date.now();
  const response = await resolve(event);
  console.log(event.request.method, event.url.pathname,
    response.status, Date.now() - start + 'ms');
  return response;
}

async function maintenance({ event, resolve }) {
  if (process.env.MAINTENANCE === '1' &&
      !event.url.pathname.startsWith('/status')) {
    // typo in Response options? runtime surprise
    return new Response('Down for maintenance', { status: 503 });
  }
  return resolve(event);
}

export const handle = sequence(logger, maintenance);`,
      ts: `// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';

const logger: Handle = async ({ event, resolve }) => {
  const start = Date.now();
  const response = await resolve(event); // Response — typed
  console.log(event.request.method, event.url.pathname,
    response.status, Date.now() - start + 'ms');
  return response;
};

const maintenance: Handle = async ({ event, resolve }) => {
  if (env.MAINTENANCE === '1' &&
      !event.url.pathname.startsWith('/status')) {
    return new Response('Down for maintenance', { status: 503 });
  }
  return resolve(event); // ≈ $next($request) in PSR-15
};

export const handle: Handle = sequence(logger, maintenance);`,
      note:
        "Each small handle is annotated `Handle`, so `event` (including your typed locals) and the required return type are checked — and sequence() composes them exactly like a middleware stack.",
    },
    {
      label: "handleError returning App.Error",
      intro:
        "Catching unexpected server errors, logging them with an ID, and returning a safe shape for +error.svelte to render. The typed version is contractually bound to app.d.ts.",
      leftLang: "js",
      rightLang: "ts",
      php: `// src/hooks.server.js (untyped)
export async function handleError({ error, status }) {
  const errorId = crypto.randomUUID();
  console.error(errorId, status, error);

  // Forget errorId here and +error.svelte's
  // page.error.errorId is silently undefined
  return {
    message: 'Something went wrong'
  };
}`,
      ts: `// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';

// app.d.ts declares:
// interface Error { message: string; errorId: string }

export const handleError: HandleServerError = async ({ error, status, message }) => {
  const errorId = crypto.randomUUID();
  console.error(errorId, status, error);

  return {
    message: status === 404 ? message : 'Something went wrong',
    errorId // omit this and the file no longer compiles
  }; // return type is App.Error — the app.d.ts contract, enforced
};`,
      note:
        "handleError's return type is your App.Error interface — declare `errorId` in app.d.ts and the compiler guarantees every unexpected error carries one, so +error.svelte can display it unconditionally.",
    },
  ],

  playground: {
    intro:
      "sequence() in miniature: a hand-rolled onion of typed middleware around a resolver. Predict the order of the log lines — note how 'before' runs top-down and 'after' unwinds bottom-up, and how the gate short-circuits without calling resolve.",
    lang: "typescript",
    code: `// A tiny model of SvelteKit's handle / sequence()
interface Event { path: string; locals: { user: string | null } }
interface Res { status: number; body: string }

type Resolve = (event: Event) => Res;
type Handle = (input: { event: Event; resolve: Resolve }) => Res;

// Compose handles the way @sveltejs/kit/hooks sequence() does:
function sequence(...handlers: Handle[]): Handle {
  return ({ event, resolve }) => {
    const run = (i: number, e: Event): Res =>
      i === handlers.length
        ? resolve(e)
        : handlers[i]({ event: e, resolve: (e2) => run(i + 1, e2) });
    return run(0, event);
  };
}

const logger: Handle = ({ event, resolve }) => {
  console.log("logger: before", event.path);
  const res = resolve(event);
  console.log("logger: after  ->", res.status);
  return res;
};

const auth: Handle = ({ event, resolve }) => {
  event.locals.user = event.path.startsWith("/admin") ? null : "ada";
  if (event.path.startsWith("/admin") && !event.locals.user) {
    console.log("auth: short-circuit, resolve never called");
    return { status: 303, body: "-> /login" }; // respond instead of resolve
  }
  return resolve(event);
};

const handle = sequence(logger, auth);
const render: Resolve = (e) => ({ status: 200, body: "hello " + (e.locals.user ?? "?") });

console.log(handle({ event: { path: "/dashboard", locals: { user: null } }, resolve: render }).body);
console.log("---");
console.log(handle({ event: { path: "/admin/users", locals: { user: null } }, resolve: render }).body);`,
  },

  keyPoints: [
    "`src/hooks.server.ts` exports `handle` — it wraps *every* server request, exactly like a PHP middleware pipeline: act before `resolve(event)`, after it, or respond instead of calling it.",
    "Type it `Handle` (from `@sveltejs/kit`); `event.locals` inside is your `App.Locals`, so state you attach is typed app-wide.",
    "`sequence(a, b, c)` from `@sveltejs/kit/hooks` composes small handles into an onion — in-order on the way in, unwinding on the way out.",
    "`handleFetch` intercepts `fetch` calls made during SSR — rewrite public API URLs to internal ones or forward credentials.",
    "`handleError` catches *unexpected* errors and must return your `App.Error` shape from `app.d.ts` — the compiler enforces the contract that `+error.svelte` relies on.",
    "`hooks.client.ts` holds the client-side `handleError`; universal `src/hooks.ts` holds `reroute` for URL-to-route rewriting.",
  ],

  interview: [
    {
      q: "Explain SvelteKit's handle hook to someone who knows Laravel middleware.",
      a: "It's the same pattern with different spelling. `handle` in `src/hooks.server.ts` receives `{ event, resolve }` where `resolve(event)` is Laravel's `$next($request)`: everything before the call is 'before' middleware, everything after runs on the way out, and returning your own `Response` without calling `resolve` short-circuits the pipeline — perfect for auth gates or maintenance mode. Instead of registering middleware in a kernel, you compose functions with `sequence()` from `@sveltejs/kit/hooks`. And instead of request attributes, you attach per-request state to `event.locals`, which is typed by the `App.Locals` interface so every load function and endpoint sees it with real types.",
    },
    {
      q: "What's the difference between error(404) in a load function and what handleError catches?",
      a: "`error(status, body)` is an *expected* error — you're deliberately producing an HTTP failure, and SvelteKit renders the nearest `+error.svelte` with that status and message; `handleError` isn't involved (except for 404s from unmatched routes). `handleError` catches *unexpected* errors — real thrown exceptions, bugs. Its job is twofold: report (log, Sentry, an error ID) and sanitise — whatever it returns becomes `page.error`, and its return type is the `App.Error` interface from `app.d.ts`, so you never leak a stack trace to users and the compiler guarantees the shape your error page renders.",
    },
    {
      q: "When would you use handleFetch or reroute?",
      a: "`handleFetch` intercepts fetches made by load functions during SSR. The classic use: your code fetches `https://api.myapp.com/...`, but on the server that's a pointless round-trip through the public internet — rewrite the request to `http://localhost:9999/...` and hit the service directly. It's also used to forward cookies to sibling subdomains. `reroute` lives in universal `src/hooks.ts` and changes how a URL maps to a route before matching happens — think translated paths where `/de/ueber-uns` should render the `/de/about` route. It returns the new pathname (or nothing to leave the URL alone), and since it runs on both client and server, navigation stays consistent.",
    },
  ],

  quiz: [
    {
      question: "In `handle`, what happens if you return a Response without calling resolve(event)?",
      options: [
        "SvelteKit throws — resolve must always be called",
        "The route still renders, but your Response's headers are merged in",
        "The pipeline short-circuits: your Response is sent and route code never runs",
        "Only endpoints are skipped; pages still render",
      ],
      answerIndex: 2,
      explain:
        "resolve(event) is what invokes routing and your route code — like $next($request) in PSR-15. Skipping it and returning your own Response answers the request directly, which is exactly how auth walls and maintenance pages are built.",
    },
    {
      question: "Where does the return type of handleError come from?",
      options: [
        "It's always { message: string } and can't be changed",
        "The App.Error interface you declare in src/app.d.ts",
        "The generated ./$types for the failing route",
        "Whatever +error.svelte's props declare",
      ],
      answerIndex: 1,
      explain:
        "handleError must return App.Error. Extend that interface in app.d.ts (e.g. with errorId) and the compiler forces handleError to provide it — which is what makes page.error trustworthy inside +error.svelte.",
    },
    {
      question: "You have three concerns: logging, auth, and security headers. What's the idiomatic way to structure hooks.server.ts?",
      options: [
        "Three separate handle exports — SvelteKit runs them all",
        "One handle typed as Handle, composed from three small handles via sequence()",
        "Put logging in handleFetch, auth in handle, headers in handleError",
        "A hooks.config.ts registering middleware classes",
      ],
      answerIndex: 1,
      explain:
        "There's exactly one handle export. sequence() from '@sveltejs/kit/hooks' chains focused Handle functions middleware-style — each stays small and testable, and they run in order with the onion unwind on the way out.",
    },
  ],
};

export default lesson;
