import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "streaming-promises",
  title: "Streaming Data with Promises",
  part: "Routing & Data",
  estMinutes: 10,
  summary:
    "Return an un-awaited promise from a server load and SvelteKit streams it to the browser — with the generated types tracking exactly which fields are promises.",

  concept: `
A load function normally answers the question "what does this page need before
it renders?". But some data is slow *and* non-critical — comments under a
post, recommendations, an analytics widget. Making the whole page wait for it
is the wrong trade. SvelteKit's answer: **stream it**.

### Await blocks, un-awaited streams

In a **server** load (\`+page.server.ts\`), every value you \`await\` before
returning blocks rendering until it resolves. But a promise you return
*without* awaiting is streamed to the browser as it resolves:

\`\`\`ts
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  return {
    post: await loadPost(params.slug), // blocks: page needs it
    comments: loadComments(params.slug), // no await: streamed later
  };
};
\`\`\`

The page renders as soon as \`post\` is ready; \`comments\` arrives over the same
response when it resolves. (In SvelteKit 1 top-level promises were
auto-awaited and only *nested* promises streamed; since SvelteKit 2 nothing is
awaited for you — un-awaited means streamed, wherever it sits.)

### The types follow

The generated \`PageData\` reflects exactly what you returned:

- \`data.post\` → \`Post\`
- \`data.comments\` → \`Promise<Comment[]>\`

The compiler will not let you write \`data.comments.length\` — it's a promise,
and the type says so. That's the discipline: streaming isn't a runtime
surprise, it's visible in the type.

### Consuming with {#await}

Svelte's \`{#await}\` block is the natural consumer, and the resolved value is
typed:

\`\`\`svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<h1>{data.post.title}</h1>

{#await data.comments}
  <p>Loading comments…</p>
{:then comments}
  {#each comments as c}<p>{c.text}</p>{/each}
{:catch err}
  <p>Couldn't load comments.</p>
{/await}
\`\`\`

Inside \`:then\`, \`comments\` is \`Comment[]\` — the promise is unwrapped by the
template, types intact.

### Caveats — know these for interviews

- **Server loads only.** Streaming is a property of the server response; this
  is a \`+page.server.ts\` technique.
- **JavaScript required.** The shell arrives as HTML, but the streamed data is
  applied by client-side JS. No JS → the \`{#await}\` pending state is what the
  user keeps.
- **Headers and status are locked.** Once the response starts streaming you
  cannot \`setHeaders\`, and calling \`redirect()\` or \`error()\` *inside a
  streamed promise* can't change the already-sent status — reject and handle
  it in \`{:catch}\` instead.
- **Handle rejections.** A streamed promise that rejects with nothing
  listening can crash the server process — attach a noop \`.catch(() => {})\`
  server-side if the template might not always await it.
- **Buffering platforms.** On platforms without response streaming (e.g. AWS
  Lambda without streaming enabled) the response is buffered — you silently
  lose the benefit.

### When to stream

Stream data that is *slow and non-essential to the first paint*. Critical
content (the post itself, anything SEO-relevant) should stay awaited. Think of
it as choosing your skeleton states in the load signature.
`,

  comparisons: [
    {
      label: "Blocking load vs streamed load",
      intro:
        "A post page where comments come from a slow service (800ms). Both versions load the same data; they differ in when the reader sees the post.",
      php: `// src/routes/blog/[slug]/+page.server.ts  (everything blocks)
export async function load({ params }) {
  // Page is blank until BOTH resolve — the slow
  // comments service delays the post by 800ms.
  const post = await loadPost(params.slug);
  const comments = await loadComments(params.slug);
  return { post, comments };
}`,
      ts: `// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  return {
    // awaited → blocks render (the page IS the post):
    post: await loadPost(params.slug),
    // un-awaited → streamed when ready:
    comments: loadComments(params.slug),
  };
};
// PageData: { post: Post; comments: Promise<Comment[]> }`,
      note: "Dropping the await turns comments into Promise<Comment[]> in the generated PageData — the page renders immediately and the type system tells the component it must await.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Consuming the streamed promise",
      intro:
        "The page component renders the post at once and the comments when they arrive. The typed version knows comments is a promise and what it resolves to.",
      php: `<!-- +page.svelte (untyped) -->
<script>
  let { data } = $props();
  // Nothing warns you that data.comments is a Promise:
  // {data.comments.length} renders 'undefined'
</script>

<h1>{data.post.title}</h1>
<p>{data.comments.length} comments</p>`,
      ts: `<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
  // data.comments: Promise<Comment[]> — .length is a compile error
</script>

<h1>{data.post.title}</h1>

{#await data.comments}
  <p>Loading comments…</p>
{:then comments}
  <p>{comments.length} comments</p>
{:catch}
  <p>Comments unavailable.</p>
{/await}`,
      note: "The generated type makes the streaming visible: you literally cannot treat data.comments as an array until {#await} (or an await) unwraps it.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A simulation of a streamed load: post is awaited (blocks), comments is returned as a live promise resolved 60ms later — the type is Promise<string[]>, so the consumer must await, just like {#await} does. Predict the order of the four log lines.",
    code: `// Simulating a server load that streams a nested promise.

type Post = { title: string };

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function loadPost(slug: string): Promise<Post> {
  await delay(10); // fast: the page needs this
  return { title: "Post: " + slug };
}

async function loadComments(slug: string): Promise<string[]> {
  await delay(60); // slow, non-critical service
  return ["Great read!", "Typed streaming is neat."];
}

// The load function: post awaited, comments NOT awaited.
async function load(slug: string) {
  return {
    post: await loadPost(slug),
    comments: loadComments(slug), // stays a Promise<string[]>
  };
}
// Inferred "PageData": { post: Post; comments: Promise<string[]> }

async function renderPage() {
  const data = await load("streaming");

  // First paint: post is ready, comments is still pending.
  console.log("render:", data.post.title);
  console.log("comments field is a Promise:", data.comments instanceof Promise);
  console.log("…rendering 'Loading comments…' placeholder");

  // The {#await} equivalent — typed resolution to string[]:
  const comments = await data.comments;
  console.log("streamed in:", comments.length, "comments →", comments[0]);
}

renderPage();`,
  },

  keyPoints: [
    "In a SvelteKit 2 *server* load, values you `await` block rendering; a promise returned un-awaited is streamed to the browser as it resolves.",
    "The generated `PageData` types streamed fields as promises (e.g. `Promise<Comment[]>`), so the component can't misuse them as resolved values.",
    "Consume streamed fields with `{#await data.comments}` — the `:then` value is fully typed.",
    "Streaming needs client-side JavaScript, and once the response is streaming you can't change headers/status — no `setHeaders` or redirects from inside a streamed promise.",
    "Handle rejections of streamed promises (a `{:catch}` block, and a server-side noop catch if it may go unawaited) — an unhandled rejection can crash the process.",
    "Stream slow, non-critical data only; keep SEO-relevant and above-the-fold content awaited. (SvelteKit 1 auto-awaited top-level promises; v2 never awaits for you.)",
  ],

  interview: [
    {
      q: "How does streaming data from a load function work in SvelteKit?",
      a: "In a server load, anything you await resolves before the page renders, but a promise you return without awaiting is streamed: SvelteKit sends the page with the resolved data, keeps the response open, and pushes the promise's result when it settles. The generated `PageData` types that field as a `Promise<T>`, and the component consumes it with `{#await}`, getting a typed value in the `:then` branch. It's ideal for slow, non-critical data — the post renders instantly while comments trickle in. Note the v1→v2 change: SvelteKit 1 auto-awaited top-level promises, SvelteKit 2 awaits nothing for you.",
    },
    {
      q: "What are the limitations of streamed promises you'd warn a team about?",
      a: "Four big ones. It only applies to *server* loads — it's a property of the HTTP response. It requires JavaScript on the client; without it users are stuck on the pending state. Once streaming has started the status code and headers are already sent, so you can't `setHeaders` or usefully `redirect()`/`error()` from inside a streamed promise — failures must be handled as rejections in `{:catch}`. And rejected streamed promises need a handler (an unhandled rejection can bring down the server process), plus some platforms like non-streaming AWS Lambda buffer the whole response, silently negating the benefit.",
    },
    {
      q: "How do you decide what to await and what to stream?",
      a: "Await anything the first paint genuinely needs: the primary content, anything SEO-relevant, anything whose absence makes the page meaningless. Stream what is slow *and* secondary — comments, recommendations, dashboards' long-tail widgets — where a skeleton state is an acceptable first impression. The nice thing in SvelteKit is that the decision is visible in the load function's return type: `Post` versus `Promise<Comment[]>` documents the rendering contract, and the compiler holds the component to it.",
    },
  ],

  quiz: [
    {
      question:
        "A SvelteKit 2 server load returns `{ post: await loadPost(slug), comments: loadComments(slug) }`. What does the generated PageData say?",
      options: [
        "Both post and comments are resolved values — SvelteKit awaits everything",
        "post is Post, comments is Promise<Comment[]> — the un-awaited promise streams",
        "Both are promises, because server loads never await",
        "It's a type error: load functions may not return promises",
      ],
      answerIndex: 1,
      explain:
        "Awaited values block and arrive resolved; un-awaited promises are streamed and stay typed as promises in PageData — the component must {#await} them.",
    },
    {
      question: "Why can't you call redirect(303, ...) from inside a streamed promise?",
      options: [
        "redirect() is client-only and streamed promises run on the server",
        "The response's status and headers are already sent once streaming starts — they can't be changed",
        "Streamed promises run outside the request context so redirect() throws",
        "You can — SvelteKit buffers the stream until all promises settle",
      ],
      answerIndex: 1,
      explain:
        "Streaming means the browser already received the status line and headers. A redirect needs a 3xx status, which is no longer possible — reject instead and render the failure in {:catch}.",
    },
    {
      question: "What does a user without JavaScript see on a page with streamed comments?",
      options: [
        "The full page — streaming is server-rendered HTML",
        "A blank page until the promise resolves",
        "The page with the {#await} pending state permanently shown",
        "A 500 error, since streaming requires JS",
      ],
      answerIndex: 2,
      explain:
        "The initial HTML includes the pending branch; applying the streamed data when it arrives is client-side work. Without JS the placeholder never updates — one reason to keep critical content awaited.",
    },
  ],
};

export default lesson;
