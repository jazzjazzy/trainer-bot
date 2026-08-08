import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-ts-in-sveltekit",
  title: "Why TypeScript Is SvelteKit's Default",
  part: "Foundations",
  estMinutes: 10,
  summary:
    "SvelteKit treats TypeScript as the default, and its generated ./$types make typed routing nearly free — here's the big picture before we set anything up.",

  concept: `
You already know TypeScript. The good news: **SvelteKit assumes you'll use it**.
When you scaffold a project with \`npx sv create\`, the CLI asks how you want type
checking and the TypeScript option is the recommended path; the official docs
show TS variants of every example, and the ecosystem (adapters, component
libraries, \`@sveltejs/kit\` itself) ships complete type definitions. You're not
bolting TS onto a JS framework — you're using the framework the way it was built
to be used.

### The killer feature: generated types

In most frameworks, typing your routing layer is manual labour: you write an
interface for a route's params, another for the data it loads, and you keep them
in sync by hand. SvelteKit inverts this. It **generates types for every route in
your app** and puts them in a virtual module called \`./$types\`, right next to
each route file:

- For \`src/routes/blog/[slug]\`, the framework writes a \`RouteParams\` type of
  \`{ slug: string }\` — derived from the *folder name*.
- Your load function types itself with one import: \`import type { PageLoad } from './$types'\`.
- Your page component gets \`PageProps\`, where \`data\` is **whatever your load
  function actually returned** — inferred, not hand-written.

Change the folder name, and the types change. Return an extra field from
\`load\`, and the page's \`data\` prop knows about it instantly. This is why
"TypeScript in SvelteKit" is mostly *free*: the framework writes the tedious
types; you just annotate with the names it hands you.

### TS syntax or JSDoc?

\`sv create\` offers two flavours of type checking: **TypeScript syntax**
(\`.ts\` files and \`<script lang="ts">\`) or **JSDoc comments** in plain \`.js\`.
Both are checked by exactly the same tooling and both use \`./$types\` — JSDoc is
not "less typed", just noisier. This course uses TS syntax throughout: it's
terser, it's what the ecosystem and job interviews speak, and you already know it.

### Where the compile step fits

A \`.svelte\` file is compiled — the **Svelte compiler** turns your component into
plain JavaScript, and **Vite** serves and bundles it. TypeScript annotations are
*erasable*: the compiler strips them, and nothing type-related survives to the
browser. That means — unlike PHP, where \`function f(int $x)\` is enforced by the
engine at runtime — your types are enforced **before** runtime, by your editor
and by \`svelte-check\`. The compile step transforms; the check step verifies.
Two separate lanes, both fed by the same annotations.

### Where this course goes

**Foundations** gets your project, tooling, and file conventions in place;
**Typed Components** covers Svelte 5 runes (\`$props\`, \`$state\`, \`$derived\`),
snippets, and generic components; **Routing & Data** is the heart — load
functions and generated \`./$types\`; **Server & Forms** covers form actions, API
endpoints, and hooks; and **Patterns & Shipping** rounds out state, validation,
testing, and interview prep.
`,

  comparisons: [
    {
      label: "Typing a load function",
      intro:
        "A blog post route fetches its post inside a load function. Both versions work at runtime — the difference is what the editor knows while you type.",
      php: `// src/routes/blog/[slug]/+page.js
export async function load({ params, fetch }) {
  // params is untyped — params.slug, params.sulg, anything goes
  const res = await fetch('/api/posts/' + params.slug);
  return { post: await res.json() };
}`,
      ts: `// src/routes/blog/[slug]/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  // params: { slug: string } — generated from the folder name
  const res = await fetch(\`/api/posts/\${params.slug}\`);
  return { post: await res.json() };
};`,
      note: "One import from ./$types types the whole event: params matches the [slug] folder, and the return type is captured for the page to consume.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "The page that consumes the data",
      intro:
        "The page component receives the load function's return value as its data prop and renders the post title.",
      php: `<!-- src/routes/blog/[slug]/+page.svelte -->
<script>
  let { data } = $props();
  // data is any-ish: data.post, data.psot — no one checks
</script>

<h1>{data.post.title}</h1>`,
      ts: `<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  // data.post is exactly what load returned — inferred
</script>

<h1>{data.post.title}</h1>`,
      note: "PageProps (generated types, available since SvelteKit 2.16) links the component to its own load function — misspell a field and svelte-check fails.",
    },
    {
      label: "TS syntax vs JSDoc — the two typed flavours",
      intro:
        "Both versions of this component are fully type-checked, including the generated types. The left uses JSDoc comments in plain JS; the right uses TypeScript syntax.",
      php: `<!-- +page.svelte — JSDoc flavour (still type-checked!) -->
<script>
  /** @type {import('./$types').PageProps} */
  let { data } = $props();
</script>

<h1>{data.post.title}</h1>`,
      ts: `<!-- +page.svelte — TypeScript flavour -->
<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<h1>{data.post.title}</h1>`,
      note: "Same safety, same tooling — JSDoc just spells the annotation inside a comment. This course uses lang=\"ts\" because it's shorter and what the ecosystem defaults to.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A hand-rolled miniature of what SvelteKit generates for you. RouteParams stands in for the type derived from a [slug] folder — predict the two lines this prints, then try renaming a field to watch the editor catch it.",
    code: `// What SvelteKit generates for src/routes/blog/[slug] — a params type
// derived from the folder name (you never write this yourself):
type RouteParams = { slug: string };

interface LoadEvent {
  params: RouteParams;
}

interface PageData {
  title: string;
  minutes: number;
}

// "+page.ts" — the typed load function
const load = ({ params }: LoadEvent): PageData => {
  const words = params.slug.split("-");
  const title = words
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  return { title, minutes: Math.max(1, Math.round(words.length / 2)) };
};

// "+page.svelte" — the component gets exactly what load returned
const data = load({ params: { slug: "generated-types-do-the-work" } });

console.log(\`Title: \${data.title}\`);
console.log(\`Read time: \${data.minutes} min\`);

// Now try it: change \`slug\` to \`id\` in RouteParams, or log data.titel —
// the editor flags it before anything runs. That's the whole pitch.`,
  },

  keyPoints: [
    "`npx sv create` scaffolds TypeScript as the recommended default — the SvelteKit ecosystem is TS-first.",
    "The killer feature is generated types: every route gets a `./$types` module with `PageLoad`, `PageServerLoad`, `PageProps` and friends, derived from your folder names and load functions.",
    "Because the framework writes the route types, using TS in SvelteKit is mostly annotating with names it hands you — not authoring types by hand.",
    "JSDoc is the alternative flavour: same checking, same `./$types`, just spelled inside comments in `.js` files.",
    "Types are erasable: the Svelte compiler and Vite strip them for the browser; enforcement happens at check time (editor + `svelte-check`), not at runtime like PHP's type declarations.",
  ],

  interview: [
    {
      q: "Why is TypeScript considered the default in SvelteKit rather than an add-on?",
      a: "Two reasons. First, the tooling assumes it: `sv create` scaffolds a TS project, the docs are written TS-first, and the whole ecosystem ships type definitions. Second — and this is the differentiator — SvelteKit **generates** route-level types. For every route folder it writes a `./$types` module containing `PageLoad`, `PageServerLoad`, `PageProps` and so on, with param types derived from folder names like `[slug]` and data types inferred from what your load functions return. So the cost of TS is unusually low: the framework authors the boring types and you just import them.",
    },
    {
      q: "What are generated types in SvelteKit and what problem do they solve?",
      a: "They solve the drift problem between routing and types. Normally you'd hand-write an interface for a route's params and its loaded data, and it silently rots when the route changes. SvelteKit runs a codegen step (`svelte-kit sync`, also continuous during `dev`) that writes a `$types.d.ts` per route under `.svelte-kit/types`. You import from `./$types` and get types that are always in sync with the file system: rename `[slug]` to `[id]` and every `params.slug` access in that route becomes a type error immediately.",
    },
    {
      q: "TypeScript types versus PHP type declarations — what's the practical difference in a SvelteKit app?",
      a: "PHP enforces `function f(int $x)` at runtime — the engine throws a `TypeError` when a caller violates it. TypeScript annotations in SvelteKit are erased at compile time: the Svelte compiler and Vite strip them, and nothing checks them in the browser or on the Node server. Enforcement happens earlier, in the editor and in `svelte-check` (which you run in CI). The practical consequence: TS catches whole classes of bugs before deployment, but data crossing a real boundary — a form body, an external API response — still needs runtime validation, because a type annotation alone proves nothing about runtime input.",
    },
  ],

  quiz: [
    {
      question: "Where do types like `PageLoad` and `PageProps` for a specific route come from?",
      options: [
        "You write them by hand in app.d.ts",
        "They're generic types imported directly from @sveltejs/kit",
        "SvelteKit generates them per route, and you import them from ./$types",
        "The Svelte compiler infers them at runtime",
      ],
      answerIndex: 2,
      explain:
        "SvelteKit generates a $types module for every route (stored under .svelte-kit/types), with params derived from folder names and data inferred from load return values. You import them via the virtual path ./$types. @sveltejs/kit does export generic bases, but the per-route versions are generated.",
    },
    {
      question: "What happens to TypeScript annotations in a .svelte file when the app runs in the browser?",
      options: [
        "They're checked on every render, like PHP parameter types",
        "They're stripped during compilation — nothing type-related exists at runtime",
        "They're converted to runtime assertions by Vite",
        "They're kept as comments for debugging",
      ],
      answerIndex: 1,
      explain:
        "TS annotations are erasable syntax: the Svelte compiler and Vite remove them when producing JavaScript. Checking is a separate step handled by your editor and svelte-check — unlike PHP, where declared types are enforced by the engine at call time.",
    },
    {
      question: "Which statement about the JSDoc option in `sv create` is true?",
      options: [
        "JSDoc projects can't use the generated ./$types",
        "JSDoc gets the same type checking as TS syntax, written as comments in .js files",
        "JSDoc types are enforced at runtime",
        "JSDoc is required for Svelte 5 runes",
      ],
      answerIndex: 1,
      explain:
        "Both flavours are checked by the same tooling, and both can annotate with import('./$types') types. JSDoc simply spells annotations inside comments so files stay plain JavaScript — the safety is equivalent, the syntax is just noisier.",
    },
  ],
};

export default lesson;
