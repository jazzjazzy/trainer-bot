import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "app-d-ts",
  title: "app.d.ts: The App Namespace",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "One ambient declaration file gives every request, page, and error in your app a shared, compiler-checked shape.",

  concept: `
Every SvelteKit project ships with a small file called \`src/app.d.ts\`. It
contains no runtime code at all — it's a **declaration file** that tells the
compiler what *your* app's data looks like, so SvelteKit's own types can pick
those shapes up everywhere.

\`\`\`ts
// src/app.d.ts
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
\`\`\`

### Why the interfaces are empty

SvelteKit can't know what a "user" or an "error code" means in your app, so it
ships **empty interfaces as extension points**. Its internal types reference
them directly — \`event.locals\` is typed as \`App.Locals\`, \`page.error\` as
\`App.Error\`, and so on. The moment you add properties, every route in the
project sees them, with no imports anywhere. This is TypeScript's
**declaration merging**: your declaration merges into the ambient \`App\`
namespace that SvelteKit already consumes.

### The five interfaces

- **\`Locals\`** — the shape of \`event.locals\`, the per-request bag that
  server hooks populate and server \`load\`/endpoints read. If you've used a
  PHP framework, this is the typed version of request attributes a middleware
  sets (think \`\$request->attributes\` in Symfony) — except here the compiler
  knows exactly what's in the bag.
- **\`PageData\`** — properties common to *all* pages' \`data\` (things your
  root layout always loads, like the current user). Page-specific data still
  comes from generated \`./$types\`; this is only for the shared core.
- **\`Error\`** — the shape of **expected** errors (the object you pass to
  \`error(404, {...})\` and read back on \`page.error\` in \`+error.svelte\`).
  It must at least contain \`message: string\`.
- **\`PageState\`** — the shape of \`page.state\` used by **shallow routing**
  (\`pushState\`/\`replaceState\` from \`$app/navigation\`), e.g. "a photo
  modal is open".
- **\`Platform\`** — whatever your **adapter** exposes on \`event.platform\`,
  e.g. Cloudflare's \`env\` with KV namespaces. Empty unless your deployment
  target provides extras.

### The canonical example: Locals for auth

You decode a session cookie once, in \`hooks.server.ts\` (SvelteKit's
middleware), and attach the user to \`event.locals\`. Declare that shape in
\`App.Locals\` and every server \`load\` function and endpoint gets
\`locals.user\` fully typed — including the \`| null\` that forces you to
handle logged-out visitors.

### Why it must stay an ambient .d.ts file

The file works because it's **ambient**: declaration-only, applied globally,
imported by no one. The \`export {}\` makes it a module so that
\`declare global\` is legal, and the \`declare global\` wrapper is what pushes
the \`App\` namespace into global scope. Delete the wrapper, or move the
interfaces into a regular \`.ts\` file, and the merging silently stops —
\`event.locals\` collapses back to an empty object and property access
becomes a compile error. Keep the skeleton; only fill in the interfaces.
`,

  comparisons: [
    {
      label: "Populating event.locals in a hook",
      intro:
        "A server hook decodes the session cookie and attaches the current user to event.locals so the rest of the request can use it. Both versions run — only one is checked.",
      php: `// src/hooks.server.js
export async function handle({ event, resolve }) {
  // What's on locals? Whatever anyone, anywhere, decided to put there.
  event.locals.user = await getUserFromSession(
    event.cookies.get("session")
  );
  // A typo like event.locals.usr = ... is created silently.
  return resolve(event);
}`,
      ts: `// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: { id: number; name: string; role: "admin" | "member" } | null;
    }
  }
}
export {};

// src/hooks.server.ts
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  // Must match App.Locals — a typo or a missing null is a compile error.
  event.locals.user = await getUserFromSession(
    event.cookies.get("session")
  );
  return resolve(event);
};`,
      note:
        "Declare the shape once in App.Locals and the Handle type enforces it — locals stops being an anything-goes bag.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Consuming locals in a server load",
      intro:
        "An admin page's server load reads the user set by the hook and redirects anonymous visitors. The typed version knows user can be null and what fields exist.",
      php: `// src/routes/admin/+page.server.js
import { redirect } from "@sveltejs/kit";

export function load({ locals }) {
  // Is it locals.user? locals.currentUser? Does it have .role?
  if (!locals.user) redirect(303, "/login");
  return { name: locals.user.name, role: locals.user.role };
}`,
      ts: `// src/routes/admin/+page.server.ts
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  // locals is App.Locals: user is typed as User | null.
  if (!locals.user) redirect(303, "/login"); // narrows to User below
  return { name: locals.user.name, role: locals.user.role };
};`,
      note:
        "After the null check the compiler narrows locals.user — and note redirect() is called without throw in SvelteKit 2 (it throws internally).",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "A typed shape for expected errors",
      intro:
        "A product page raises a 404 with extra context (an error code) that the +error.svelte page will display. App.Error is what makes that extra field safe to read.",
      php: `// src/routes/products/[id]/+page.server.js
import { error } from "@sveltejs/kit";

export async function load({ params }) {
  const product = await findProduct(params.id);
  if (!product) {
    // Nothing checks this object's shape — the error page
    // hopes a .code property exists.
    error(404, { message: "Not found", code: "PRODUCT_GONE" });
  }
  return { product };
}`,
      ts: `// src/app.d.ts (inside declare global > namespace App)
interface Error {
  message: string;         // required by SvelteKit
  code: string;            // your addition
}

// src/routes/products/[id]/+page.server.ts
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  const product = await findProduct(params.id);
  if (!product) {
    // Object must match App.Error — omit code and it won't compile.
    error(404, { message: "Not found", code: "PRODUCT_GONE" });
  }
  return { product };
};`,
      note:
        "App.Error types both ends: what error() accepts and what page.error exposes in +error.svelte — message: string is mandatory.",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of the Locals pattern: in a real app these interfaces live in app.d.ts inside declare global > namespace App. Predict both lines, then run.",
    code: `// Stand-ins for what you'd declare in src/app.d.ts:
interface User {
  id: number;
  name: string;
  role: "admin" | "member";
}
interface Locals {
  user: User | null;
}

// A hooks.server.ts-style handler consuming the typed bag:
interface RequestEvent {
  locals: Locals;
  url: { pathname: string };
}

function handleAdminPage(event: RequestEvent): string {
  const { user } = event.locals;
  if (!user) {
    // narrowing: past this point, user is User (not null)
    return \`303 redirect to /login (wanted \${event.url.pathname})\`;
  }
  return \`200 \${event.url.pathname} — hello \${user.name} (\${user.role})\`;
}

console.log(
  handleAdminPage({
    locals: { user: { id: 1, name: "Ada", role: "admin" } },
    url: { pathname: "/admin" },
  })
);
console.log(
  handleAdminPage({ locals: { user: null }, url: { pathname: "/admin" } })
);`,
  },

  keyPoints: [
    "`src/app.d.ts` is an ambient declaration file: no runtime code, no imports needed to use its types anywhere.",
    "The `App` namespace has five extension points: `Locals`, `PageData`, `Error`, `PageState`, `Platform` — empty by default because only you know your app's shapes.",
    "Filling in `App.Locals` types `event.locals` across hooks, server `load` functions, and endpoints — the canonical use is a `user: User | null` set during auth.",
    "`App.Error` must include `message: string`; it types both what `error()` accepts and what `page.error` exposes.",
    "Keep the `declare global { namespace App { ... } }` + `export {}` skeleton — the file must stay ambient or the declaration merging silently stops.",
    "`App.PageData` is only for data common to every page; per-route data stays with the generated `./$types`.",
  ],

  interview: [
    {
      q: "What is app.d.ts in a SvelteKit project and why does it matter?",
      a: "It's an ambient TypeScript declaration file that populates the global `App` namespace with five interfaces — `Locals`, `PageData`, `Error`, `PageState`, and `Platform`. SvelteKit's own types reference them, so declaration merging means the shapes I put there flow through the whole framework: `event.locals` in hooks and server loads, `page.error` in error pages, `event.platform` from the adapter. It matters because it's the one place I describe app-wide request context, and after that the compiler enforces it everywhere with zero imports.",
    },
    {
      q: "How would you make an authenticated user available, with types, to every server load function?",
      a: "Declare it in `App.Locals` — say `user: User | null` — then populate it once in the `handle` hook in `hooks.server.ts` by decoding the session cookie. Every server `load` and `+server.ts` endpoint then reads `locals.user` fully typed. The `| null` is doing real work: the compiler forces a logged-out check before I can touch `user.name`, and after an early `redirect(303, '/login')` it narrows to `User`. It's the typed equivalent of a PHP middleware attaching the user to the request.",
    },
    {
      q: "Why must the App interfaces live in a .d.ts file wrapped in declare global?",
      a: "Because the merging only works if the `App` namespace exists in *global* scope. The file has `export {}` to make it a module, which is what allows the `declare global` block, and that block is what pushes the interfaces into the global `App` namespace SvelteKit consumes. If I moved the interfaces into a normal module without the wrapper, nothing merges — `event.locals` silently reverts to an empty interface and property access becomes a compile error rather than a typed value.",
    },
  ],

  quiz: [
    {
      question:
        "You want `event.locals.user` to be typed in hooks and server load functions. Where does the type go?",
      options: [
        "In a Locals interface exported from src/lib/types.ts and imported into each file",
        "In App.Locals inside declare global in src/app.d.ts",
        "In the generated ./$types file for each route",
        "As a generic parameter on each load function: load<{ user: User }>",
      ],
      answerIndex: 1,
      explain:
        "SvelteKit types `event.locals` as `App.Locals`, so declaring the shape once inside `declare global { namespace App { interface Locals {...} } }` in app.d.ts makes it flow everywhere via declaration merging — no imports required.",
    },
    {
      question: "Which statement about App.Error is correct?",
      options: [
        "It types unexpected runtime exceptions like TypeError",
        "It can have any shape you like, with no required fields",
        "It types expected errors passed to error() and read from page.error, and must include message: string",
        "It's only used during server-side rendering",
      ],
      answerIndex: 2,
      explain:
        "App.Error describes the shape of *expected* errors — the object you hand to `error(status, {...})` and read back on `page.error` in `+error.svelte`. SvelteKit requires it to contain at least `message: string`; extra fields like a `code` are your additions.",
    },
    {
      question: "Why are the five App interfaces empty in a fresh project?",
      options: [
        "They're deprecated placeholders kept for backwards compatibility",
        "SvelteKit fills them in automatically at build time",
        "TypeScript requires empty interfaces before merging is allowed",
        "They're extension points — SvelteKit can't know your app's shapes, and your declarations merge into them",
      ],
      answerIndex: 3,
      explain:
        "The framework's types reference App.Locals, App.Error, etc. directly, but only you know what a user or an error code looks like in your app. The empty interfaces exist so your declarations can merge in and every built-in API picks up your shapes.",
    },
  ],
};

export default lesson;
