import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "snippets",
  title: "Snippets & the Snippet Type",
  part: "Typed Components",
  estMinutes: 12,
  summary:
    "Snippets replace slots in Svelte 5 — reusable chunks of markup you can pass as props and type precisely with `Snippet<[...]>`.",

  concept: `
Slots are gone. In Svelte 5, the way you pass markup into a component — and the
way you reuse markup *within* a component — is the **snippet**. A snippet is a
chunk of template with a name and (optionally) parameters, and unlike slots it
is a real value: you can pass it around, and you can type it.

### Declaring and rendering

\`\`\`svelte
{#snippet row(item: Item)}
  <li>{item.name} — {item.qty}</li>
{/snippet}

<ul>
  {#each items as item}
    {@render row(item)}
  {/each}
</ul>
\`\`\`

\`{#snippet name(params)}\` defines it; \`{@render name(args)}\` renders it. Think
of a snippet as a **function that returns markup** — because that is exactly
how it types. If you've written a Blade/Twig partial or a small render helper
in PHP, this is that idea, but as a first-class typed value instead of a
file-include.

### The \`Snippet\` type

Svelte exports a \`Snippet\` type for use in props:

\`\`\`svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;          // no parameters
    row: Snippet<[Item]>;        // one Item parameter
    cell: Snippet<[Item, number]>; // two parameters
  }
  let { children, row, cell }: Props = $props();
</script>
\`\`\`

Note the **tuple**: \`Snippet<[Item]>\`, not \`Snippet<Item>\`. The type parameter
lists the snippet's parameters positionally, exactly like the parameter list of
a function type — \`Snippet<[Item, number]>\` is analogous to
\`(item: Item, index: number) => markup\`. Forgetting the square brackets is the
classic first mistake; the compiler will tell you.

### Passing snippets as props

A snippet declared **directly inside a component's tags** implicitly becomes a
prop of that component:

\`\`\`svelte
<Table data={fruits}>
  {#snippet row(f)}
    <td>{f.name}</td><td>{f.qty}</td>
  {/snippet}
</Table>
\`\`\`

\`Table\` receives \`row\` as a prop typed \`Snippet<[Fruit]>\` — and because the
component declares that type, the parameter \`f\` in the parent's snippet is
**inferred** as \`Fruit\`. No annotation needed at the call site.

### The implicit \`children\` prop

Any content inside a component's tags that isn't a named snippet becomes the
\`children\` snippet automatically:

\`\`\`svelte
<Button>Click me</Button>
<!-- Button.svelte: -->
<button>{@render children?.()}</button>
\`\`\`

Type it as \`children?: Snippet\` and render with \`{@render children?.()}\` when
the content is optional. This is the Svelte 5 replacement for the default
\`<slot />\`.
`,

  comparisons: [
    {
      label: "Default content: slot vs children snippet",
      intro:
        "A Card component that wraps whatever the parent puts between its tags. The legacy version uses a slot; the modern version types an optional children snippet.",
      php: `<!-- src/lib/Card.svelte (Svelte 4, legacy) -->
<div class="card">
  <slot>
    <p>No content provided.</p>
  </slot>
</div>

<!-- Parent -->
<Card>
  <h2>Hello</h2>
</Card>`,
      ts: `<!-- src/lib/Card.svelte (Svelte 5) -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<div class="card">
  {#if children}
    {@render children()}
  {:else}
    <p>No content provided.</p>
  {/if}
</div>

<!-- Parent (unchanged): <Card><h2>Hello</h2></Card> -->`,
      note:
        "Content between a component's tags becomes the implicit children prop — typed children?: Snippet, rendered with {@render} — replacing <slot /> and its fallback content.",
    },
    {
      label: "Parameterised markup: typed row snippet",
      intro:
        "A Table component that lets the parent decide how each row renders. The parent supplies a row template; the component calls it once per item.",
      php: `<!-- src/lib/Table.svelte -->
<script>
  // No types: row could be anything, and the parent's
  // snippet parameter is just guessed at.
  let { data, row } = $props();
</script>

<table>
  <tbody>
    {#each data as d}
      <tr>{@render row(d)}</tr>
    {/each}
  </tbody>
</table>`,
      ts: `<!-- src/lib/Table.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Fruit { name: string; qty: number; price: number }

  interface Props {
    data: Fruit[];
    row: Snippet<[Fruit]>;  // tuple: one Fruit parameter
  }
  let { data, row }: Props = $props();
</script>

<table>
  <tbody>
    {#each data as d}
      <tr>{@render row(d)}</tr>
    {/each}
  </tbody>
</table>`,
      note:
        "Snippet<[Fruit]> uses a tuple type parameter — the snippet's parameter list — so calling {@render row()} with no argument, or a wrong-typed one, is a compile error.",
    },
    {
      label: "The parent side: inference at the call site",
      intro:
        "Using the Table above. The parent declares the row snippet inside <Table>'s tags, and it implicitly becomes the row prop.",
      php: `<!-- src/routes/+page.svelte -->
<script>
  const fruits = [
    { name: 'apples', qty: 5, price: 2 },
    { name: 'bananas', qty: 10, price: 1 }
  ];
</script>

<Table data={fruits}>
  {#snippet row(d)}
    <!-- d untyped: d.pricee renders blank, nobody notices -->
    <td>{d.name}</td><td>{d.pricee}</td>
  {/snippet}
</Table>`,
      ts: `<!-- src/routes/+page.svelte -->
<script lang="ts">
  const fruits = [
    { name: 'apples', qty: 5, price: 2 },
    { name: 'bananas', qty: 10, price: 1 }
  ];
</script>

<Table data={fruits}>
  {#snippet row(d)}
    <!-- d inferred as Fruit from Table's Snippet<[Fruit]> -->
    <td>{d.name}</td><td>{d.price}</td>
    <!-- d.pricee would be a compile error here -->
  {/snippet}
</Table>`,
      note:
        "Because the component types its row prop, the parent's snippet parameter is inferred — the typo d.pricee that silently rendered blank in JS becomes a red squiggle.",
    },
  ],

  playground: {
    lang: "svelte",
    intro:
      "A self-contained page using a local typed snippet inside an each loop. Predict the three list items (note the computed total in each), then check the output.",
    code: `<!-- src/routes/fruit/+page.svelte -->
<script lang="ts">
  interface Fruit {
    name: string;
    qty: number;
    price: number;
  }

  const fruits: Fruit[] = [
    { name: 'apples', qty: 5, price: 2 },
    { name: 'bananas', qty: 10, price: 1 },
    { name: 'cherries', qty: 20, price: 0.5 }
  ];
</script>

{#snippet row(f: Fruit)}
  <li>{f.name}: {f.qty} × £{f.price} = £{f.qty * f.price}</li>
{/snippet}

<ul>
  {#each fruits as f}
    {@render row(f)}
  {/each}
</ul>`,
    output: `Renders an unordered list of three items:
  apples: 5 × £2 = £10
  bananas: 10 × £1 = £10
  cherries: 20 × £0.5 = £10
The row snippet's parameter is annotated (f: Fruit), so a typo like
f.pricee inside the snippet would fail to compile.`,
  },

  keyPoints: [
    "Snippets replace slots: `{#snippet name(params)}...{/snippet}` declares one, `{@render name(args)}` renders it.",
    "A snippet is conceptually a typed function that returns markup — which is why its type takes a parameter list.",
    "`Snippet` comes from `'svelte'`; its type parameter is a **tuple**: `Snippet<[Item]>` has one `Item` parameter, `Snippet<[Item, number]>` has two. (Square brackets required.)",
    "Content between a component's tags becomes the implicit `children` prop — type it `children?: Snippet` and render with `{@render children?.()}`.",
    "Snippets declared inside a component's tags implicitly become props, and their parameters are inferred from the component's declared `Snippet<[...]>` types.",
  ],

  interview: [
    {
      q: "What replaced slots in Svelte 5, and why is the replacement better for TypeScript users?",
      a: "Snippets. A snippet is a named, optionally-parameterised chunk of template declared with `{#snippet}` and rendered with `{@render}` — effectively a function that returns markup. Slots were a compiler feature you couldn't really type: `let:` directives passed data with weak inference and no reusable type. Snippets are values with a real type, `Snippet<[Params]>` from `'svelte'`, so a component can declare exactly what each template prop receives, and the parent's snippet parameters are inferred from that declaration. They can also be declared once and rendered many times, which slots never could.",
    },
    {
      q: "Why is the type written `Snippet<[Item]>` with square brackets rather than `Snippet<Item>`?",
      a: "The type parameter is the snippet's whole parameter list, expressed as a tuple type — the same trick TypeScript uses for function parameters (`Parameters<F>` returns a tuple too). `Snippet<[Item]>` is a snippet taking one `Item`; `Snippet<[Item, number]>` takes an item and an index; bare `Snippet` takes nothing. Using a tuple means any arity is expressible with one generic type, and `{@render}` calls are arity-checked like ordinary function calls.",
    },
    {
      q: "How does content placed between a component's tags reach the component in Svelte 5?",
      a: "Two ways, both as props. Ordinary content becomes the implicit `children` snippet — the component types it `children?: Snippet` and renders `{@render children?.()}`; that's the replacement for the default slot. Named `{#snippet foo(...)}` blocks declared directly inside the tags become props named `foo` — the replacement for named slots — and because the component declares their `Snippet<[...]>` types, the parameters in the parent's snippet bodies are inferred with no annotations at the call site.",
    },
  ],

  quiz: [
    {
      question:
        "Which is the correct type for a prop that receives a snippet taking one `User` parameter?",
      options: [
        "Snippet<User>",
        "Snippet<[User]>",
        "Snippet(User)",
        "SnippetFn<User, void>",
      ],
      answerIndex: 1,
      explain:
        "Snippet's generic parameter is a tuple listing the snippet's parameters — Snippet<[User]> for one, Snippet<[User, number]> for two. Snippet<User> fails because User isn't a tuple type.",
    },
    {
      question:
        "In Svelte 5, what happens to plain content written between `<Card>` and `</Card>`?",
      options: [
        "It's ignored unless Card declares a <slot />",
        "It becomes the implicit children snippet prop on Card",
        "It throws unless wrapped in {#snippet children()}",
        "It renders after the component automatically",
      ],
      answerIndex: 1,
      explain:
        "Non-snippet content inside a component's tags becomes the children prop — typed children?: Snippet and rendered by the component with {@render children?.()}. That's the slot replacement.",
    },
    {
      question:
        "A component declares `row: Snippet<[Fruit]>`. In the parent's `{#snippet row(d)} ... {/snippet}` inside that component's tags, what is `d`?",
      options: [
        "unknown until you annotate it",
        "any — snippets are untyped at the call site",
        "Inferred as Fruit from the component's prop type",
        "A Snippet object you must call",
      ],
      answerIndex: 2,
      explain:
        "Implicit snippet props are checked against the component's declared types, so the parameter is inferred as Fruit — misusing it (e.g. d.pricee) is a compile error with no annotation needed.",
    },
  ],
};

export default lesson;
