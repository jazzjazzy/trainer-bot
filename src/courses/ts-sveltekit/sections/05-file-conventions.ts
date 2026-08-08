import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "file-conventions",
  title: "File Conventions: routes, +page & $lib",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "SvelteKit's filesystem is the router: learn what each + file does, where it runs, and why the conventions are what make generated types possible.",

  concept: `
### The filesystem is the router

In a PHP framework you maintain a routes file that maps URLs to controllers.
SvelteKit merges the two: **the directory structure of \`src/routes\` is the
route table, and the files inside each directory are the handlers**. Creating
\`src/routes/about/+page.svelte\` *is* registering \`GET /about\`. No annotations,
no \`routes/web.php\` — the convention is the configuration.

### The \`+\` files and where each one runs

Every route capability is a file with a \`+\` prefix. Knowing which environment
each runs in is half of SvelteKit:

- **\`+page.svelte\`** — the page component. Rendered on the **server** (SSR)
  for the first request, then hydrated and re-rendered in the **browser**.
- **\`+page.ts\`** — a *universal* \`load\` function. Runs on the **server** for
  the first request and in the **browser** for client-side navigations. No
  secrets here.
- **\`+page.server.ts\`** — a *server-only* \`load\` (plus form \`actions\`).
  Database calls, private env vars, sessions — this is your controller action.
- **\`+layout.svelte\` / \`+layout.ts\` / \`+layout.server.ts\`** — the same trio
  for layouts, which wrap child pages and *nest* down the directory tree.
- **\`+server.ts\`** — an API endpoint: export \`GET\`, \`POST\`, \`PUT\`, \`DELETE\`...
  handlers returning \`Response\` objects. **Server only.** Your JSON API
  controller.
- **\`+error.svelte\`** — rendered when a \`load\` fails; the nearest one up the
  tree wins.

Rule of thumb: \`.server\` in the name (or \`+server.ts\`) → server only;
\`+page.ts\`/\`+layout.ts\` → both; \`.svelte\` components → server-rendered, then
alive in the browser.

### Dynamic segments in the folder name

Parameters live in **square brackets in directory names**:

- \`src/routes/blog/[slug]\` — required param: \`/blog/hello\` → \`{ slug: 'hello' }\`.
- \`src/routes/docs/[...path]\` — *rest* param: \`/docs/kit/types\` →
  \`{ path: 'kit/types' }\`, matching any depth.
- \`src/routes/[[lang]]/about\` — *optional* param: matches both \`/about\` and
  \`/fr/about\`.

Compare a PHP route like \`Route::get('/blog/{slug}', ...)\` — same idea, spelled
as a folder.

### \`$lib\`: shared code with a short name

Anything outside \`src/routes\` that you want to share lives in \`src/lib\`,
importable from anywhere as \`$lib/...\`. The sub-folder \`$lib/server\` is
special: SvelteKit **refuses** to let client-reachable code import from it, so
your DB layer can't leak into a bundle by accident.

### The payoff: every \`+\` file gets its own \`./$types\`

Here's why the strict naming matters. Because SvelteKit knows *exactly* what
each file is — a universal load, a server load, an endpoint, a page — it can
generate precise types for each one, in that route's own \`./$types\` module:

- \`+page.ts\` → \`PageLoad\` — \`params\` typed from the folder's \`[brackets]\`.
- \`+page.server.ts\` → \`PageServerLoad\` and \`Actions\`.
- \`+server.ts\` → \`RequestHandler\`.
- \`+page.svelte\` → \`PageProps\`; \`+layout.svelte\` → \`LayoutProps\` (SvelteKit 2.16+).

A convention-free framework can't do this — it doesn't know which function is a
route handler. SvelteKit's rigid file names are the price of types you never
have to write.
`,

  comparisons: [
    {
      label: "A server load — the controller action",
      intro:
        "The blog post route loads a post from the database by slug. Server-only, because it touches the DB — this is the closest thing to a PHP controller action.",
      php: `// src/routes/blog/[slug]/+page.server.js
import * as db from '$lib/server/database';

export async function load({ params }) {
  // params could be anything — was the folder [slug] or [id]?
  // You go check the directory name to find out.
  return { post: await db.getPost(params.slug) };
}`,
      ts: `// src/routes/blog/[slug]/+page.server.ts
import * as db from '$lib/server/database';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // params: { slug: string } — generated from the folder name.
  // Rename the folder to [id] and this line goes red.
  return { post: await db.getPost(params.slug) };
};`,
      note: "PageServerLoad comes from this route's own generated ./$types — its params reflect this folder's [brackets], and its return type flows into the page's PageProps.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "An API endpoint (+server.ts)",
      intro:
        "A JSON endpoint that returns one todo by id. +server files export one function per HTTP verb and run only on the server.",
      php: `// src/routes/api/todos/[id]/+server.js
import { json } from '@sveltejs/kit';
import { getTodo } from '$lib/server/todos';

export async function GET({ params }) {
  // Nothing ties this handler to its route's params
  return json(await getTodo(params.id));
}`,
      ts: `// src/routes/api/todos/[id]/+server.ts
import { json } from '@sveltejs/kit';
import { getTodo } from '$lib/server/todos';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  // params: { id: string } — typed by the [id] folder
  return json(await getTodo(params.id));
};`,
      note: "One RequestHandler type from ./$types covers every verb you export here — the same generated-params guarantee as load functions, applied to your JSON API.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "A layout and its children",
      intro:
        "A layout renders navigation and then whatever child page is active, via the children snippet. The TS version types both the layout data and the snippet.",
      php: `<!-- src/routes/+layout.svelte — plain JS -->
<script>
  let { data, children } = $props();
</script>

<nav>Signed in as {data.user.name}</nav>

{@render children()}`,
      ts: `<!-- src/routes/+layout.svelte — lang="ts" -->
<script lang="ts">
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
</script>

<nav>Signed in as {data.user.name}</nav>

{@render children()}`,
      note: "LayoutProps (generated, SvelteKit 2.16+) types data from the layout's own load AND children as a Snippet — misuse either and svelte-check fails.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "SvelteKit's folder-name grammar as a tiny runtime matcher: [param], [...rest] and [[optional]]. Predict which pathnames match which route ids, and what params come out.",
    code: `type Params = Record<string, string>;

// A miniature of SvelteKit's route matching (simplified):
function matchRoute(routeId: string, pathname: string): Params | null {
  const route = routeId.split("/").filter(Boolean);
  const path = pathname.split("/").filter(Boolean);
  const params: Params = {};
  let i = 0;

  for (let r = 0; r < route.length; r++) {
    const seg = route[r];

    if (seg.startsWith("[...")) {
      // rest param: swallow everything left (even nothing)
      params[seg.slice(4, -1)] = path.slice(i).join("/");
      i = path.length;
    } else if (seg.startsWith("[[")) {
      // optional param: consume a segment only if one is spare
      const required = route.slice(r + 1).filter((s) => !s.startsWith("[[")).length;
      if (path.length - i > required) params[seg.slice(2, -2)] = path[i++];
    } else if (seg.startsWith("[")) {
      // required param
      if (i >= path.length) return null;
      params[seg.slice(1, -1)] = path[i++];
    } else if (path[i++] !== seg) {
      return null; // static segment mismatch
    }
  }
  return i === path.length ? params : null;
}

const show = (route: string, url: string) =>
  console.log(\`\${route}  vs  \${url}  ->\`, JSON.stringify(matchRoute(route, url)));

show("/blog/[slug]", "/blog/typed-routing");
show("/blog/[slug]", "/shop/typed-routing");
show("/docs/[...path]", "/docs/kit/types/generated");
show("/[[lang]]/about", "/about");
show("/[[lang]]/about", "/fr/about");`,
  },

  keyPoints: [
    "`src/routes` **is** the router: directories are URL paths, and the `+` files inside are the handlers — router config and controllers in one place.",
    "Environments: `+page.server.ts`, `+layout.server.ts` and `+server.ts` run **server only**; `+page.ts`/`+layout.ts` run on server *and* browser; `.svelte` components are server-rendered then hydrated client-side.",
    "Dynamic segments are folder names: `[slug]` (required), `[...path]` (rest, any depth), `[[lang]]` (optional).",
    "`$lib` aliases `src/lib` everywhere; `$lib/server` is enforced server-only — client code that imports it fails the build.",
    "The conventions are what make generated types possible: each `+` file gets a matching type from its own `./$types` — `PageLoad`, `PageServerLoad`, `Actions`, `RequestHandler`, `PageProps`, `LayoutProps`.",
  ],

  interview: [
    {
      q: "Walk me through SvelteKit's route file conventions and where each file executes.",
      a: "Routing is filesystem-based under `src/routes`: the folder path is the URL, with `[param]`, `[...rest]` and `[[optional]]` folders for dynamic segments. Within a route, `+page.svelte` is the component — SSR'd on the server, then hydrated in the browser. `+page.ts` exports a *universal* load that runs server-side for the first request and client-side on navigations, so no secrets belong there. `+page.server.ts` is server-only: DB access, private env, plus form `actions`. Layouts mirror all three and nest down the tree. `+server.ts` defines an API endpoint with one exported handler per HTTP verb, server-only, and `+error.svelte` renders when a load throws. Coming from PHP: the routes folder is your route table and controllers merged, with `+page.server.ts` playing the controller action.",
    },
    {
      q: "Why does SvelteKit insist on these exact file names instead of letting you name files freely?",
      a: "Because the rigidity is what the tooling trades on. Since the framework knows that `+page.server.ts` exports a server load and that the folder is called `[slug]`, it can *generate* exact types — `PageServerLoad` with `params: { slug: string }`, `RequestHandler` for endpoints, `PageProps`/`LayoutProps` for components — in each route's `./$types`. It also enables hard guarantees like code-splitting per route and the `$lib/server` import wall. Free-form file names would make every one of those a heuristic instead of a certainty. It's convention over configuration with a type-safety dividend.",
    },
    {
      q: "When do you choose +page.ts over +page.server.ts for a load function?",
      a: "Ask where the data can safely be fetched from. `+page.server.ts` when the work must stay on the server: database queries, private API keys, cookies/sessions — its return value is serialised to the client. `+page.ts` when the load is safe to run anywhere — say, hitting your own public `+server.ts` endpoint or a public API — because after the first SSR request it runs in the browser during client-side navigation, saving a hop through your server. They can coexist: the universal load even receives the server load's data. Default pragmatically: start server-only for anything touching infrastructure, go universal when the client can do the work itself.",
    },
  ],

  quiz: [
    {
      question: "Which file's code can NEVER run in the browser?",
      options: ["+page.svelte", "+page.ts", "+page.server.ts", "+error.svelte"],
      answerIndex: 2,
      explain:
        "The .server suffix means server-only — its load runs on the server and only its returned data is sent to the client. +page.ts is universal (server first, then browser), and the .svelte components render on the server and hydrate in the browser.",
    },
    {
      question: "Which folder structure matches BOTH /about and /fr/about?",
      options: [
        "src/routes/[lang]/about",
        "src/routes/[[lang]]/about",
        "src/routes/[...lang]/about",
        "src/routes/(lang)/about",
      ],
      answerIndex: 1,
      explain:
        "Double brackets make a parameter optional, so [[lang]] matches with or without the segment. Single brackets require it (/about wouldn't match), and a rest param [...lang] would swallow segments greedily rather than optionally taking one.",
    },
    {
      question: "What type does a +server.ts endpoint import from ./$types?",
      options: ["PageServerLoad", "RequestHandler", "EndpointProps", "ServerRoute"],
      answerIndex: 1,
      explain:
        "Generated ./$types gives +server.ts a RequestHandler type — with params matching the folder's [brackets] — and you annotate each exported verb (GET, POST, ...) with it. PageServerLoad belongs to +page.server.ts, and the other two don't exist.",
    },
    {
      question: "Why is putting your database module in src/lib/server better than src/lib?",
      options: [
        "It loads faster because of server-side caching",
        "SvelteKit blocks client-reachable code from importing $lib/server, so the DB layer can't end up in a browser bundle",
        "It's required for +page.server.ts to import it",
        "Modules there are automatically type-checked more strictly",
      ],
      answerIndex: 1,
      explain:
        "$lib/server is an enforced boundary: if any code that could reach the client imports from it, the build fails. Server-only files may import from anywhere — the win is that a refactor can't silently leak credentials or DB code into the client bundle.",
    },
  ],
};

export default lesson;
