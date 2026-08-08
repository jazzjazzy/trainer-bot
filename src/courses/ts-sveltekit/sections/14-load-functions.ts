import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "load-functions",
  title: "Typed load Functions & ./$types",
  part: "Routing & Data",
  estMinutes: 12,
  summary:
    "SvelteKit generates route-specific types in ./$types so your load function's params and return value flow into the page with zero manual wiring.",

  concept: `
Every SvelteKit route can fetch its data in a **load function**. For a page,
that's an exported \`load\` in \`+page.ts\` next to the \`+page.svelte\` it feeds.
If you think in PHP terms: the load function is the **controller action** —
it gathers data for the view — and \`+page.svelte\` is the view. The difference
is that SvelteKit *types the seam between them automatically*.

### \`./$types\`: generated, route-specific types

For every route, SvelteKit generates a hidden \`$types.d.ts\` you import from as
\`'./$types'\`:

\`\`\`ts
// src/routes/blog/[slug]/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  // params: { slug: string } — derived from the [slug] folder name
  const res = await fetch(\`/api/posts/\${params.slug}\`);
  return { post: (await res.json()) as Post };
};
\`\`\`

One annotation — \`PageLoad\` — buys you three things:

- **\`params\` is typed from the directory structure.** A \`[slug]\` folder means
  \`params.slug: string\`; \`params.slugg\` is a compile error.
- **The event is typed** — \`url\`, \`route.id\`, \`setHeaders\`, \`parent\`, and a
  special \`fetch\`.
- **The return type is captured** and becomes \`PageData\` for this route.

### The typed \`fetch\`

The \`fetch\` handed to \`load\` looks like the standard one but is better: it can
make relative requests during server-side rendering, forwards \`cookie\` and
\`authorization\` headers, and inlines the response into the served HTML so the
browser doesn't re-request it during hydration. Always use the event's
\`fetch\`, not the global.

### Data lands in the page, already typed

\`\`\`svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  // data.post is a Post — inferred from load's return
</script>

<h1>{data.post.title}</h1>
\`\`\`

\`PageProps\` (generated since SvelteKit **2.16**; \`LayoutProps\` for layouts)
types the whole props object — \`data\`, plus \`form\` on pages that have
actions. Older code typed the field directly with \`PageData\`; \`PageProps\`
is the modern shorthand. Rename a property in \`load\`'s return and every
usage in the page goes red. No DTO classes, no manual interface kept in
sync — the contract is *derived from the code*.

### Where universal load runs

\`+page.ts\` exports a **universal** load: on the first request it runs on the
**server** (during SSR), then on client-side navigations it runs in the
**browser**. So don't touch server secrets or Node APIs here — that's the next
section's job (\`+page.server.ts\`). Universal load is right when you're calling
public HTTP APIs or returning things that don't survive serialisation (class
instances, component constructors).
`,

  comparisons: [
    {
      label: "A blog-post load function",
      intro:
        "Fetch a post by slug for the /blog/[slug] route. Both versions return { post } for the page; only one knows what a post is or what params contains.",
      php: `// src/routes/blog/[slug]/+page.js
export async function load({ params, fetch }) {
  // params is untyped — params.slugg is undefined, and the
  // request goes to /api/posts/undefined at runtime.
  const res = await fetch(\`/api/posts/\${params.slug}\`);
  return { post: await res.json() }; // post: any
}`,
      ts: `// src/routes/blog/[slug]/+page.ts
import type { PageLoad } from './$types';

interface Post {
  title: string;
  body: string;
}

export const load: PageLoad = async ({ params, fetch }) => {
  // params: { slug: string } — generated from the folder name.
  const res = await fetch(\`/api/posts/\${params.slug}\`);
  const post: Post = await res.json();
  return { post };
};`,
      note:
        "PageLoad comes from the generated ./$types: params matches the route's [slug] segments, the event's fetch is the SSR-aware one, and the return type is recorded as this route's PageData.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Consuming the data in the page",
      intro:
        "The page component receives whatever load returned as its data prop and renders the post title.",
      php: `<!-- src/routes/blog/[slug]/+page.svelte -->
<script>
  // data is untyped: data.post.titel renders as
  // blank text and nobody is told.
  let { data } = $props();
</script>

<h1>{data.post.titel}</h1>
<div>{data.post.body}</div>`,
      ts: `<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import type { PageProps } from './$types';

  // data.post: Post — inferred from load's return type.
  let { data }: PageProps = $props();
</script>

<h1>{data.post.title}</h1>
<div>{data.post.body}</div>`,
      note:
        "PageProps (generated since SvelteKit 2.16) types the page's whole props object from load's actual return — the titel typo that rendered blank in JS is a compile error in TS.",
    },
    {
      label: "Query params force null-handling",
      intro:
        "A search page reads ?q= from the URL and returns it uppercased. The query string might be absent — one version is forced to deal with that.",
      php: `// src/routes/search/+page.js
export function load({ url }) {
  const q = url.searchParams.get('q');
  // Crashes with "Cannot read properties of null"
  // the first time someone visits /search without ?q=
  return { query: q.toUpperCase() };
}`,
      ts: `// src/routes/search/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
  const q = url.searchParams.get('q'); // string | null
  // TS refuses q.toUpperCase() until null is handled:
  return { query: (q ?? '').toUpperCase() };
};`,
      note:
        "Because the load event is fully typed, searchParams.get's string | null return forces the missing-parameter case into the code path instead of into production logs.",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of the load → page pipeline in plain TypeScript: the 'PageData' type is derived from what load returns, exactly as SvelteKit's ./$types does. Predict the three logged lines, then run it.",
    code: `// How ./$types works, in miniature: the page's data type is
// DERIVED from the load function — never written by hand.

interface Post {
  id: number;
  title: string;
  tags: string[];
}

// Stand-in for the load event's typed fetch:
function fetchPost(id: number): Post {
  return { id, title: 'TS-first SvelteKit', tags: ['sveltekit', 'typescript'] };
}

// The "load function" — its params are typed from the route
// ([id] folder => { id: string }), and its return becomes PageData.
function load(params: { id: string }) {
  const post = fetchPost(Number(params.id));
  return { post, readingMinutes: Math.ceil(post.title.length / 10) };
}

// SvelteKit generates this for you; here we derive it manually:
type PageData = ReturnType<typeof load>;

// The "page" consuming its data prop:
const data: PageData = load({ id: '42' });

console.log(\`#\${data.post.id}: \${data.post.title}\`);
console.log('tags: ' + data.post.tags.join(', '));
console.log(\`~\${data.readingMinutes} min read\`);

// Try it: rename readingMinutes in load's return —
// the console.log below goes red immediately.`,
  },

  keyPoints: [
    "A page's load function lives in `+page.ts` — the controller action to `+page.svelte`'s view, in PHP terms.",
    "Import `PageLoad` from `'./$types'`: `params` is typed from the `[slug]` folder names and the return type is captured as this route's `PageData`.",
    "Always use the `fetch` from the load event — it handles relative URLs during SSR, forwards credentials, and avoids a duplicate request during hydration.",
    "In the page, `let { data }: PageProps = $props()` — `PageProps` is generated in `./$types` since SvelteKit 2.16 and covers `data` plus `form`.",
    "Universal load (`+page.ts`) runs on the server for the first render, then in the browser on client-side navigations — never put secrets or DB calls in it.",
    "The load → page type contract is derived from the code, so renaming a returned property breaks the build instead of the page.",
  ],

  interview: [
    {
      q: "How does type safety work between a SvelteKit load function and its page?",
      a: "SvelteKit generates a `$types.d.ts` per route. In `+page.ts` I annotate `export const load: PageLoad`, which types the event — `params` derived from the `[slug]` folder names, `url`, and the enhanced `fetch` — and records whatever the function returns. In `+page.svelte` I write `let { data }: PageProps = $props()` (`PageProps` is generated since 2.16), and `data` has exactly load's return type. It's a controller-to-view contract, like passing data from a PHP controller to a template, except the contract is derived from the code by the tooling — rename a field in `load` and the page fails to compile.",
    },
    {
      q: "Why should you use the fetch provided to load rather than the global fetch?",
      a: "The event's `fetch` is SSR-aware. It can resolve relative URLs on the server (the global can't — there's no page origin), it forwards the incoming request's `cookie` and `authorization` headers when calling your own API routes, it can hit internal endpoints without an actual HTTP round trip, and it inlines the response into the rendered HTML so the browser doesn't repeat the request during hydration. And because the load event is typed, using it costs nothing — it has the standard fetch signature.",
    },
    {
      q: "Where does a universal load function run, and what follows from that?",
      a: "Both places, at different times: on the server during the first server-rendered request, then in the browser for subsequent client-side navigations. Two consequences. First, it must never touch secrets, private environment variables or the database — that code belongs in `+page.server.ts`. Second, since its return value isn't forced through serialisation on client navigations, universal load may return non-serialisable things like class instances or component constructors, which server load cannot.",
    },
  ],

  quiz: [
    {
      question:
        "In `src/routes/blog/[slug]/+page.ts`, what does annotating load with `PageLoad` from './$types' give you?",
      options: [
        "Runtime validation of the route parameters",
        "Typed params ({ slug: string }), a typed event, and capture of the return type as PageData",
        "Automatic caching of the fetch response",
        "Nothing — PageLoad must be written by hand per route",
      ],
      answerIndex: 1,
      explain:
        "The types are generated per route: params mirrors the [slug] segments, the event (url, fetch, parent, ...) is fully typed, and the return type flows to the page as PageData/PageProps. It's all compile-time — no runtime validation.",
    },
    {
      question:
        "What is the modern way to type a page's props in SvelteKit 2.16+?",
      options: [
        "let { data }: PageProps = $props() with PageProps from './$types'",
        "export let data: PageData",
        "let data = $props<PageData>()",
        "let { data } = $props() as PageLoad",
      ],
      answerIndex: 0,
      explain:
        "PageProps (and LayoutProps) were added to the generated ./$types in SvelteKit 2.16 as a shorthand typing the whole props object — data, plus form on pages with actions. export let is Svelte 4 syntax.",
    },
    {
      question: "When does a universal load in +page.ts execute?",
      options: [
        "Only in the browser",
        "Only on the server",
        "On the server for the initial SSR request, then in the browser during client-side navigation",
        "Twice on every navigation, server then browser",
      ],
      answerIndex: 2,
      explain:
        "Universal load runs wherever the render happens: server-side for the first request, browser-side afterwards. That's why secrets and DB access don't belong in it — that's server load's job.",
    },
  ],
};

export default lesson;
