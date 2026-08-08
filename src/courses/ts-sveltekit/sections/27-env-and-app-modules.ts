import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "env-and-app-modules",
  title: "Typed env & the $app Modules",
  part: "Patterns & Shipping",
  estMinutes: 11,
  summary:
    "SvelteKit's four $env modules give you typed environment variables the bundler physically keeps out of the client, and $app/state, $app/navigation and $app/paths give you typed access to the running app.",

  concept: `
In PHP you read configuration with \`getenv()\` or \`$_ENV\` and never worried
about the browser seeing it — *everything* ran on the server. In SvelteKit the
same codebase compiles into a server bundle **and** a client bundle, so "which
side can see this variable?" becomes a real question. SvelteKit answers it
with four virtual modules, each a different combination of two choices.

### The four $env modules

- **\`$env/static/private\`** — values from \`.env\` injected **at build time** as named exports. Server-only.
- **\`$env/static/public\`** — build-time named exports of variables prefixed \`PUBLIC_\`. Importable anywhere.
- **\`$env/dynamic/private\`** — a single \`env\` object read **at run time** from the platform. Server-only.
- **\`$env/dynamic/public\`** — the runtime \`env\` object, filtered to \`PUBLIC_\` variables.

**Static vs dynamic**: static values are baked into the bundle when you run
\`vite build\` — they get real TypeScript declarations (generated into
\`.svelte-kit/ambient.d.ts\`), so \`import { API_KEY } from '$env/static/private'\`
is a typed \`string\` and a *typo in the name is a build error*. Because they're
literal values at build time, dead branches like
\`if (FEATURE_FLAG === 'off')\` can be tree-shaken away. Dynamic values are
read when the server boots — use them when the same build must run in several
environments (classic Docker-image-per-environment setups).

### Private means the build fails, not "please don't"

Import \`$env/static/private\` or \`$env/dynamic/private\` into anything reachable
from client code — a \`.svelte\` file, a universal \`+page.ts\` — and the **build
errors out**. This is a guarantee PHP never gave you, because PHP never needed
it: here the bundler analyses the import graph and refuses to let a secret
cross into the client bundle. Conversely, only variables prefixed \`PUBLIC_\`
(configurable via \`config.kit.env.publicPrefix\`) appear in the public modules;
everything else simply doesn't exist on the client side.

### $app/state — the app as typed reactive objects

Since SvelteKit **2.12**, \`$app/state\` replaces the older \`$app/stores\` and
exposes three read-only, rune-powered objects:

- \`page\` — current \`url\`, \`params\`, \`data\`, \`status\`, \`error\`, \`form\`. Fine-grained: a change to \`page.state\` doesn't invalidate \`page.data\`.
- \`navigating\` — details of an in-flight navigation (\`to\`, \`from\`, \`type\`), with \`null\` fields when idle.
- \`updated\` — whether a new version of the app has been deployed.

No \`$page\` store prefix, no subscriptions — just \`page.url.pathname\` in a
component and it's reactive (in runes mode).

### Typed navigation and paths

- \`goto(url, opts)\` from \`$app/navigation\` navigates programmatically and returns a \`Promise\`; \`invalidate(url)\` / \`invalidateAll()\` re-run \`load\` functions that depended on that data.
- \`resolve(...)\` from \`$app/paths\` (2.26+) turns a **route ID** plus params into a URL — \`resolve('/blog/[slug]', { slug })\` — and the route ID is checked against your actual routes, so renaming a route breaks links at compile time instead of in production.
- \`$app/paths\` also exports \`base\` and \`assets\` (and an \`asset()\` helper) for apps served under a subpath — the reason to prefer \`resolve()\` over hand-concatenated strings.
`,

  comparisons: [
    {
      label: "Reading a secret: process.env vs $env/static/private",
      intro:
        "A server load function calls a payment API with a secret key. Both versions work when everything is wired correctly — only one stops you wiring it incorrectly.",
      php: `// src/routes/admin/+page.server.js
// process.env: value is string | undefined, name is unchecked,
// and nothing stops this pattern being copied into client code.
const apiKey = process.env.STRIPE_SECRET;

export async function load({ fetch }) {
  const res = await fetch('https://api.stripe.com/v1/charges', {
    headers: { Authorization: 'Bearer ' + apiKey },
  });
  return { charges: await res.json() };
}`,
      ts: `// src/routes/admin/+page.server.ts
import { STRIPE_SECRET } from '$env/static/private';
import type { PageServerLoad } from './$types';

// STRIPE_SECRET is a typed string (declared from your .env at build
// time). Misspell it and the build fails; import this module from
// client-reachable code and the build fails too.
export const load: PageServerLoad = async ({ fetch }) => {
  const res = await fetch('https://api.stripe.com/v1/charges', {
    headers: { Authorization: 'Bearer ' + STRIPE_SECRET },
  });
  return { charges: await res.json() };
};`,
      note:
        "$env/static/private gives you three things process.env doesn't: a typed string (not string | undefined), name checking at build time, and a hard bundler guarantee the value never reaches the client.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "$app/stores vs $app/state",
      intro:
        "A header that shows the current path and a busy indicator while navigating. The store version still works but is the legacy pattern; $app/state is the Svelte 5 way since SvelteKit 2.12.",
      php: `<!-- src/lib/Header.svelte — legacy $app/stores pattern -->
<script>
  import { page, navigating } from '$app/stores';
  // These are stores: you need the $ prefix to read them,
  // and any change re-fires every subscriber.
</script>

<nav class:busy={$navigating}>
  You are on {$page.url.pathname}
</nav>`,
      ts: `<!-- src/lib/Header.svelte — SvelteKit 2.12+ -->
<script lang="ts">
  import { page, navigating } from '$app/state';
  // Plain reactive objects powered by runes: no $ prefix,
  // fine-grained updates (page.state changing doesn't
  // invalidate reads of page.data).
</script>

<nav class:busy={navigating.to !== null}>
  You are on {page.url.pathname}
</nav>`,
      note:
        "$app/state (SvelteKit 2.12) replaces $app/stores: same information, but as fine-grained rune-backed objects read directly — note navigating.to is null when idle, where the old $navigating store was null itself.",
    },
    {
      label: "Hand-built URLs vs resolve()",
      intro:
        "A button that navigates to a blog post. One version glues strings together; the other resolves a route ID that the compiler checks against your real routes directory.",
      php: `<!-- src/lib/PostLink.svelte -->
<script>
  import { goto } from '$app/navigation';

  let { slug } = $props();

  // '/blogg/' — the typo ships, and if the app is deployed
  // under a base path this link silently breaks too.
  function open() {
    goto('/blogg/' + slug);
  }
</script>

<button onclick={open}>Read post</button>`,
      ts: `<!-- src/lib/PostLink.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';

  let { slug }: { slug: string } = $props();

  // '/blog/[slug]' is validated against src/routes — rename the
  // route and this line is a compile error. base path included.
  async function open() {
    await goto(resolve('/blog/[slug]', { slug }));
  }
</script>

<button onclick={open}>Read post</button>`,
      note:
        "resolve() (SvelteKit 2.26+) takes a compiler-checked route ID plus typed params and prefixes the configured base path — dead links become type errors.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A simulation of what SvelteKit's build does with your .env: split variables by the PUBLIC_ prefix and refuse to hand private ones to client code. Predict which keys end up on each side, and what the 'client import' attempt prints.",
    code: `// What the bundler conceptually does with your .env file.
const dotEnv = {
  DATABASE_URL: "postgres://app:secret@db:5432/shop",
  STRIPE_SECRET: "sk_live_abc123",
  PUBLIC_BASE_URL: "https://shop.example.com",
  PUBLIC_APP_NAME: "TrainerShop",
} as const;

type EnvName = keyof typeof dotEnv;

function isPublic(name: EnvName): boolean {
  return name.startsWith("PUBLIC_"); // config.kit.env.publicPrefix
}

function splitEnv(env: Record<EnvName, string>) {
  const pub: Record<string, string> = {};
  const priv: Record<string, string> = {};
  for (const name of Object.keys(env) as EnvName[]) {
    (isPublic(name) ? pub : priv)[name] = env[name];
  }
  return { pub, priv };
}

const { pub, priv } = splitEnv(dotEnv);
console.log("$env/static/public exports: ", Object.keys(pub).join(", "));
console.log("$env/static/private exports:", Object.keys(priv).join(", "));

// The server/client boundary check, as a function:
function importEnv(module: "private" | "public", fromClientCode: boolean) {
  if (module === "private" && fromClientCode) {
    // In real SvelteKit this is a BUILD error, not a runtime one —
    // the secret never even makes it into the client bundle.
    throw new Error("Cannot import $env/static/private into client-side code");
  }
  return module === "private" ? priv : pub;
}

const serverSide = importEnv("private", false);
console.log("server sees DATABASE_URL?", "DATABASE_URL" in serverSide);

try {
  importEnv("private", true); // a +page.svelte trying to grab a secret
} catch (e) {
  console.log("build failed:", (e as Error).message);
}`,
  },

  keyPoints: [
    "Four env modules = two axes: `static` (baked in at build, typed named exports, tree-shakeable) vs `dynamic` (read at run time via an `env` object), and `private` (server-only) vs `public` (`PUBLIC_`-prefixed, safe anywhere).",
    "Importing a private env module into client-reachable code is a **build error** — the bundler enforces the secret boundary, a guarantee PHP's all-server world never needed.",
    "Only variables prefixed `PUBLIC_` (configurable via `config.kit.env.publicPrefix`) exist in the public modules; everything else is invisible to the client.",
    "`$app/state` (SvelteKit 2.12+, replacing `$app/stores`) exposes `page`, `navigating` and `updated` as fine-grained rune-backed objects — read `page.url.pathname` directly, no `$` prefix.",
    "Prefer `goto(resolve('/blog/[slug]', { slug }))` over string concatenation: `resolve()` from `$app/paths` (2.26+) type-checks the route ID against your routes and handles the `base` path.",
  ],

  interview: [
    {
      q: "How does SvelteKit keep server secrets out of the client bundle?",
      a: "Structurally, not by convention. Secrets are imported from `$env/static/private` or `$env/dynamic/private`, and the bundler analyses the import graph: if any module reachable from client code imports a private module, the **build fails**. On top of that, only variables prefixed `PUBLIC_` are exposed through the public env modules at all. Coming from PHP this is a new problem class — PHP code all ran server-side, but a SvelteKit codebase compiles to both bundles, so the framework makes 'this file is server-only' a compile-time property. The same mechanism covers `$lib/server/` modules and `.server.ts` files.",
    },
    {
      q: "When would you choose $env/dynamic over $env/static?",
      a: "Static is the default: values are injected at build time as typed named exports, typos are build errors, and constant conditions can be tree-shaken. But static means the value is frozen into the artifact — if I build one Docker image and promote it through staging and production with different configuration, those values must come from `$env/dynamic/private` (or `dynamic/public`), which reads the platform's environment when the server starts. The trade-off is that dynamic values are just an `env` object at run time, so I lose the per-variable typing and the tree-shaking.",
    },
    {
      q: "What changed with $app/state in SvelteKit 2.12, and why does it matter?",
      a: "`$app/state` replaces `$app/stores`. Instead of Svelte stores you subscribe to with a `$` prefix, it exports `page`, `navigating` and `updated` as read-only objects backed by Svelte 5 runes — you just read `page.url.pathname` and it's reactive. It's also fine-grained: with the old `$page` store, any change re-notified every subscriber, whereas now an update to `page.state` doesn't invalidate code that only reads `page.data`. The old module still exists for migration, but new Svelte 5 code should use `$app/state`.",
    },
  ],

  quiz: [
    {
      question: "A `.svelte` component imports `DATABASE_URL` from `$env/static/private`. What happens?",
      options: [
        "It works, but the value is undefined in the browser",
        "It works on the server render and errors on the client",
        "The build fails — private env modules cannot be imported into client-reachable code",
        "ESLint warns, but the app runs",
      ],
      answerIndex: 2,
      explain:
        "The bundler traces the import graph and refuses to build when a private env module is reachable from client code. The secret never gets a chance to leak — it's a compile-time guarantee, not a runtime check.",
    },
    {
      question: "Which module gives you typed, tree-shakeable variables that are safe to use in the browser?",
      options: [
        "$env/dynamic/private",
        "$env/static/public",
        "$env/dynamic/public",
        "$env/static/private",
      ],
      answerIndex: 1,
      explain:
        "$env/static/public exposes PUBLIC_-prefixed variables as build-time named exports: typed, checked, and inlined so constant conditions can be eliminated. The dynamic/public module is also browser-safe but is a runtime env object — no inlining, no per-name types.",
    },
    {
      question: "In Svelte 5 / SvelteKit 2.12+, how do you read the current pathname reactively?",
      options: [
        "import { page } from '$app/stores' and read $page.url.pathname",
        "import { page } from '$app/state' and read page.url.pathname",
        "import { url } from '$app/navigation'",
        "window.location.pathname inside $effect",
      ],
      answerIndex: 1,
      explain:
        "$app/state exports page as a rune-backed reactive object — no store subscription or $ prefix needed. $app/stores still works but is the legacy pattern that $app/state replaced in 2.12.",
    },
    {
      question: "What advantage does `resolve('/blog/[slug]', { slug })` have over `'/blog/' + slug`?",
      options: [
        "It performs the navigation as well",
        "It URL-encodes the whole string",
        "It's the only form goto() accepts",
        "The route ID and params are type-checked against your routes, and the base path is applied",
      ],
      answerIndex: 3,
      explain:
        "resolve() from $app/paths (2.26+) validates the route ID against the actual src/routes structure — renaming a route turns every stale link into a compile error — and prefixes the configured base path so subpath deployments keep working.",
    },
  ],
};

export default lesson;
