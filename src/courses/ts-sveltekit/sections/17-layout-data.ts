import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "layout-data",
  title: "Layout Data & await parent()",
  part: "Routing & Data",
  estMinutes: 11,
  summary:
    "How layout load functions feed typed data to every child page, how a child load reads parent data with await parent(), and how to re-run loads with depends/invalidate.",

  concept: `
Pages rarely stand alone: the logged-in user, the nav menu, the tenant config —
that data belongs to a **layout**, not to each page. SvelteKit lets a layout
have its own load function, and the type system tracks exactly how that data
flows down.

### Layouts load data too

Next to \`+layout.svelte\` you can put:

- \`+layout.ts\` with \`export const load: LayoutLoad\` — runs on server *and*
  client.
- \`+layout.server.ts\` with \`export const load: LayoutServerLoad\` — server
  only (database, secrets).

Both types come from that folder's \`./$types\`, exactly like \`PageLoad\`.

### Merging: the part that surprises people

Whatever a layout's load returns is **automatically merged into the \`data\`
prop of every child page** (and child layout). If the root layout returns
\`{ user }\` and a page's own load returns \`{ post }\`, that page's generated
\`PageData\` is the intersection — effectively \`{ user: User; post: Post }\`.
You don't wire this up; the generated types compute it per route from the
whole layout chain. In PHP terms: it's like middleware attaching values to the
request that every controller receives — except here the compiler knows the
exact shape at every level.

If a page returns a key the layout also returns, the page wins for that page's
\`data\`.

### Reading parent data *inside* a load

Merging covers the component. But sometimes a **child load function** needs the
parent's data to do its own work — e.g. the layout loaded \`user\`, and the page
load wants \`user.id\` to fetch their orders. That's \`await parent()\`:

\`\`\`ts
// src/routes/account/orders/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, fetch }) => {
  const { user } = await parent(); // typed from the layout chain!
  const res = await fetch(\`/api/orders?user=\${user.id}\`);
  return { orders: await res.json() as Order[] };
};
\`\`\`

\`parent()\` returns the merged data from the parent \`+layout.ts\` loads (and,
in a \`+layout.server.ts\` / \`+page.server.ts\`, from parent server loads). Its
return type is generated, so \`user\` needs no annotation.

### The waterfall warning

\`await parent()\` makes your load *wait* for the parent's. If you don't need
parent data before your own fetches, start your fetches first and call
\`parent()\` afterwards — otherwise you serialise requests that could run in
parallel and add avoidable latency.

### Re-running loads: depends + invalidate

Load functions re-run automatically when \`params\` or \`url\` they used change.
For anything else, register a custom dependency and trigger it yourself:

\`\`\`ts
// in the load function:
export const load: LayoutLoad = async ({ depends }) => {
  depends('app:cart');
  return { cart: await fetchCart() };
};
\`\`\`

\`\`\`svelte
<script lang="ts">
  import { invalidate } from '$app/navigation';
  // after adding an item:
  await invalidate('app:cart'); // re-runs every load that depends on it
</script>
\`\`\`

\`invalidate()\` also accepts a URL the load fetched; \`invalidateAll()\` re-runs
everything. This is the SvelteKit answer to "the header cart count is stale".
`,

  comparisons: [
    {
      label: "Layout load feeding every page",
      intro:
        "The root layout loads the current user once; a nested page loads a post. The page component then renders both. The typed version shows how PageData is the merge of the two loads.",
      php: `// src/routes/+layout.ts  (untyped)
export async function load({ fetch }) {
  const res = await fetch('/api/me');
  return { user: await res.json() };
}

// src/routes/blog/[slug]/+page.svelte
// <script>
//   let { data } = $props();
//   // data.user exists at runtime, but nothing tells you so
// </script>`,
      ts: `// src/routes/+layout.ts
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch }) => {
  const user: { id: number; name: string } =
    await (await fetch('/api/me')).json();
  return { user };
};

// src/routes/blog/[slug]/+page.svelte
// <script lang="ts">
//   import type { PageProps } from './$types';
//   let { data }: PageProps = $props();
//   // data.user AND data.post — merged and typed
// </script>`,
      note: "Layout data merges into every child page's data prop automatically; the generated PageData for each route already includes the whole layout chain.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "await parent() in a child load",
      intro:
        "A page load needs the user the layout already fetched, to load that user's orders. Both versions call parent(); only one knows what comes back.",
      php: `// src/routes/account/orders/+page.ts  (untyped)
export async function load({ parent, fetch }) {
  const stuff = await parent();
  // stuff is 'any' — stuff.usr.id fails at runtime
  const res = await fetch('/api/orders?user=' + stuff.user.id);
  return { orders: await res.json() };
}`,
      ts: `// src/routes/account/orders/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, fetch }) => {
  const { user } = await parent(); // typed: { user: { id: number; ... } }
  const res = await fetch(\`/api/orders?user=\${user.id}\`);
  const orders: { id: number; total: number }[] = await res.json();
  return { orders };
};`,
      note: "parent()'s return type is generated from the actual parent layout loads — rename user in the layout and this file errors. Call parent() after starting independent fetches to avoid a waterfall.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Refreshing stale layout data",
      intro:
        "A cart count lives in layout data. After a mutation, the page tells SvelteKit to re-run exactly the loads that declared a dependency on 'app:cart'.",
      php: `<!-- untyped: reload the whole page to refresh -->
<script>
  async function addToCart(id) {
    await fetch('/api/cart', { method: 'POST', body: id });
    location.reload(); // heavy-handed: refetches everything
  }
</script>`,
      ts: `<!-- +page.svelte: surgical invalidation -->
<script lang="ts">
  import { invalidate } from '$app/navigation';

  // layout load declared: depends('app:cart')
  async function addToCart(id: number) {
    await fetch('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    await invalidate('app:cart'); // only matching loads re-run
  }
</script>`,
      note: "depends('app:cart') registers a custom key; invalidate('app:cart') re-runs only the loads that declared it — no full reload, no refetching unrelated data.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A simulation of the layout→page data flow: the layout load returns user data, the page load calls parent() (typed), and the final PageData is the merge. Predict the two logged lines, then check whether the merged type would let you read data.user.name.",
    code: `// Simulating layout data merging and await parent().

type User = { id: number; name: string };
type LayoutData = { user: User };

// The layout's load (root +layout.ts):
async function layoutLoad(): Promise<LayoutData> {
  return { user: { id: 7, name: "Ada" } };
}

// The page's load receives a typed parent() — like PageLoad's event.parent:
async function pageLoad(event: { parent: () => Promise<LayoutData> }) {
  const { user } = await event.parent(); // fully typed, no annotation
  const orders = [
    { id: 101, total: 42.5, userId: user.id },
    { id: 102, total: 9.99, userId: user.id },
  ];
  return { orders };
}

// What the page component receives: layout data merged with page data.
type PageData = LayoutData & Awaited<ReturnType<typeof pageLoad>>;

async function run() {
  const layoutData = await layoutLoad();
  const pageData = await pageLoad({ parent: async () => layoutData });
  const data: PageData = { ...layoutData, ...pageData };

  console.log(\`\${data.user.name} has \${data.orders.length} orders\`);
  console.log("first order total:", data.orders[0].total);
}

await run();`,
  },

  keyPoints: [
    "`+layout.ts` / `+layout.server.ts` export `load` typed as `LayoutLoad` / `LayoutServerLoad` from that folder's `./$types`.",
    "Layout load data merges automatically into every child page's `data` — each route's generated `PageData` includes the whole layout chain.",
    "`await parent()` inside a child load returns the parent layouts' merged data, fully typed from the generated types.",
    "Call `parent()` *after* starting fetches that don't need it — awaiting it first serialises requests into a waterfall.",
    "`depends('app:foo')` in a load plus `invalidate('app:foo')` from `$app/navigation` re-runs exactly the loads that declared that dependency.",
    "Loads also re-run automatically when the `params`/`url` they actually used change; `invalidateAll()` re-runs everything.",
  ],

  interview: [
    {
      q: "How does data flow from a layout to its pages in SvelteKit, and how is it typed?",
      a: "A `+layout.ts` or `+layout.server.ts` exports a `load` function (typed `LayoutLoad`/`LayoutServerLoad` from `./$types`), and whatever it returns is merged into the `data` prop of every child layout and page. The generated `PageData` for each route is computed from the entire layout chain plus the page's own load, so the component sees one typed object — `data.user` from the root layout and `data.post` from the page, both checked. There's no manual context-passing; it's closest to PHP middleware enriching the request, but with the compiler tracking the exact shape at every level.",
    },
    {
      q: "When would you use `await parent()` and what's the performance trap?",
      a: "Use it when a child *load function* — not the component — needs parent data to do its own work, like using the layout's `user.id` to fetch that user's orders. It returns the merged parent data, fully typed. The trap is waterfalls: `await parent()` blocks until the parent load finishes, so if you call it before kicking off fetches that don't depend on it, you've serialised work that could run in parallel. The docs' guidance is to start your independent fetches first and await `parent()` only where you actually need its result.",
    },
    {
      q: "The cart badge in your layout goes stale after a client-side mutation. How do you fix it idiomatically?",
      a: "Register a custom dependency in the layout's load with `depends('app:cart')`, and after the mutation call `await invalidate('app:cart')` from `$app/navigation`. SvelteKit re-runs only the load functions that declared that dependency and updates their data reactively — no `location.reload()`, no refetching unrelated loads. `invalidate` can also take a URL that the load fetched, and `invalidateAll()` is the sledgehammer that re-runs every load for the current page.",
    },
  ],

  quiz: [
    {
      question:
        "The root `+layout.ts` load returns `{ user }` and `blog/[slug]/+page.ts` load returns `{ post }`. What is that page's `data` prop?",
      options: [
        "Just `{ post }` — layout data is only available to +layout.svelte",
        "`{ user, post }` — layout data merges into every child page's data, and PageData types the merge",
        "`{ layout: { user }, page: { post } }` — namespaced by source",
        "Whatever you declare manually in app.d.ts",
      ],
      answerIndex: 1,
      explain:
        "Layout load results merge into child page data automatically, and the generated PageData reflects the merged shape — no manual wiring or declarations needed.",
    },
    {
      question: "Why should `await parent()` usually come *after* your load's own independent fetches?",
      options: [
        "parent() throws if called before any fetch",
        "Calling it early returns stale data from the previous navigation",
        "Awaiting it first creates a waterfall — your fetches wait on the parent load when they didn't need to",
        "parent() can only be called once per request, so you must save it for last",
      ],
      answerIndex: 2,
      explain:
        "parent() resolves when the parent load finishes. Awaiting it before starting unrelated fetches serialises requests that could run concurrently; call it only at the point you genuinely need parent data.",
    },
    {
      question: "What pairs with `depends('app:cart')` to re-run that load on demand?",
      options: [
        "`invalidate('app:cart')` from '$app/navigation'",
        "`refresh('app:cart')` from '@sveltejs/kit'",
        "`goto(location.href)` to force a soft reload",
        "Nothing — depends() re-runs the load on a timer",
      ],
      answerIndex: 0,
      explain:
        "depends() registers a custom invalidation key; invalidate() with the same key (imported from $app/navigation) re-runs exactly the loads that declared it.",
    },
  ],
};

export default lesson;
