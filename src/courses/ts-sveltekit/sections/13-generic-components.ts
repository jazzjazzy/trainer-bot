import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "generic-components",
  title: "Generic Components",
  part: "Typed Components",
  estMinutes: 12,
  summary:
    "The `generics` attribute makes a whole component generic over a type parameter — so a List works for any item type while keeping every prop, callback and snippet in sync.",

  concept: `
You know generics from TypeScript functions: \`function first<T>(xs: T[]): T\`.
Svelte 5 lets an entire **component** be generic the same way. The syntax lives
on the script tag:

\`\`\`svelte
<script lang="ts" generics="T">
\`\`\`

Everything inside the component can now use \`T\` as a type — props, snippet
types, local functions — and, crucially, TypeScript **infers** \`T\` at each
usage site from the props the parent passes. Consumers never write the type
argument; they just get the safety.

### The canonical example: a typed List

\`\`\`svelte
<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  interface Props {
    items: T[];
    onpick: (item: T) => void;
    row: Snippet<[T]>;
  }
  let { items, onpick, row }: Props = $props();
</script>

{#each items as item}
  <button onclick={() => onpick(item)}>{@render row(item)}</button>
{/each}
\`\`\`

Three props, one \`T\`, one guarantee: whatever type flows in through \`items\`
is exactly what \`onpick\` receives and exactly what the \`row\` snippet's
parameter is. Without generics you'd either write \`unknown\` everywhere (safe
but useless) or duplicate the component per item type (the PHP-before-generics
experience — think of every strongly-typed-collection class you ever hand-rolled).

### Constraints

The \`generics\` attribute takes the same syntax as a generic parameter list, so
constraints and defaults work:

\`\`\`svelte
<script lang="ts" generics="T extends { id: number }">
\`\`\`

Now the component may rely on \`item.id\` — for instance as an \`{#each}\` key —
and passing \`items\` whose elements lack an \`id\` is a compile error at the
call site. Multiple parameters are fine too: \`generics="K, V extends Node"\`.

### The payoff: inference at the call site

\`\`\`svelte
<script lang="ts">
  interface User { id: number; name: string; email: string }
  const users: User[] = [/* ... */];
</script>

<List items={users} onpick={(u) => console.log(u.email)}>
  {#snippet row(u)}
    {u.name}
  {/snippet}
</List>
\`\`\`

The parent wrote **zero type annotations** on \`onpick\` or the snippet, yet
\`u\` is a \`User\` in both — inferred from \`items\`. Change \`u.email\` to
\`u.emial\` and the parent file fails to compile. That is the whole point of
generic components: one reusable component, and every consumer gets its own
precisely-typed contract for free.

### When to reach for it

Any component whose props must **agree with each other** about a type it
doesn't own: lists, selects, tables, autocompletes, data grids, paginators.
If a component only renders one concrete shape, skip the generic — a plain
interface is simpler.
`,

  comparisons: [
    {
      label: "A reusable List component",
      intro:
        "A List that renders items and reports clicks. The untyped version accepts anything; the generic version ties items, the pick callback and the row snippet to one shared T.",
      php: `<!-- src/lib/List.svelte -->
<script>
  // items, onpick and row have no relationship —
  // nothing stops onpick expecting a different shape
  // than items actually contains.
  let { items, onpick, row } = $props();
</script>

<ul>
  {#each items as item}
    <li>
      {@render row(item)}
      <button onclick={() => onpick(item)}>pick</button>
    </li>
  {/each}
</ul>`,
      ts: `<!-- src/lib/List.svelte -->
<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  interface Props {
    items: T[];
    onpick: (item: T) => void;
    row: Snippet<[T]>;
  }
  let { items, onpick, row }: Props = $props();
</script>

<ul>
  {#each items as item}
    <li>
      {@render row(item)}
      <button onclick={() => onpick(item)}>pick</button>
    </li>
  {/each}
</ul>`,
      note:
        "The generics attribute declares T once; items: T[], onpick: (item: T) => void and row: Snippet<[T]> are then guaranteed to agree — per consumer, inferred from the items prop.",
    },
    {
      label: "Constraining the type parameter",
      intro:
        "The List wants to key its each-block by item.id for efficient updates. The constraint documents — and enforces — that requirement.",
      php: `<!-- src/lib/List.svelte -->
<script>
  // Convention only: we *hope* every item has an id.
  let { items, onpick, row } = $props();
</script>

<ul>
  {#each items as item (item.id)}
    <!-- items without an id: undefined keys at runtime -->
    <li>{@render row(item)}</li>
  {/each}
</ul>`,
      ts: `<!-- src/lib/List.svelte -->
<script lang="ts" generics="T extends { id: number }">
  import type { Snippet } from 'svelte';

  interface Props {
    items: T[];
    onpick: (item: T) => void;
    row: Snippet<[T]>;
  }
  let { items, onpick, row }: Props = $props();
</script>

<ul>
  {#each items as item (item.id)}
    <li>{@render row(item)}</li>
  {/each}
</ul>

<!-- <List items={['a', 'b']} ...> is now a compile error -->`,
      note:
        "generics=\"T extends { id: number }\" is a normal generic constraint — the component may safely read item.id, and callers passing id-less items are rejected at compile time.",
    },
    {
      label: "The consumer: inference and the caught typo",
      intro:
        "A page using the generic List with User items. Watch what happens to a misspelled property in each version.",
      php: `<!-- src/routes/users/+page.svelte -->
<script>
  import List from '$lib/List.svelte';

  const users = [
    { id: 1, name: 'Ada', email: 'ada@example.com' },
    { id: 2, name: 'Linus', email: 'linus@example.com' }
  ];
</script>

<List
  items={users}
  onpick={(u) => console.log(u.emial)}
>
  {#snippet row(u)}
    {u.name}
  {/snippet}
</List>
<!-- u.emial logs undefined — discovered in production -->`,
      ts: `<!-- src/routes/users/+page.svelte -->
<script lang="ts">
  import List from '$lib/List.svelte';

  interface User { id: number; name: string; email: string }

  const users: User[] = [
    { id: 1, name: 'Ada', email: 'ada@example.com' },
    { id: 2, name: 'Linus', email: 'linus@example.com' }
  ];
</script>

<List
  items={users}
  onpick={(u) => console.log(u.email)}
>
  {#snippet row(u)}
    {u.name}
  {/snippet}
</List>
<!-- T inferred as User from items; u.emial would not compile -->`,
      note:
        "The parent writes no type arguments at all — T is inferred from items={users}, so u is a User in both the callback and the snippet, and the emial typo becomes a compile error.",
    },
  ],

  playground: {
    lang: "svelte",
    intro:
      "The full generic List with a constraint. Read the generics attribute and the three props, then predict: what does a parent get if it passes items lacking an id, or misspells a property in its onpick callback?",
    code: `<!-- src/lib/List.svelte -->
<script lang="ts" generics="T extends { id: number }">
  import type { Snippet } from 'svelte';

  interface Props {
    items: T[];
    onpick: (item: T) => void;
    row: Snippet<[T]>;
  }

  let { items, onpick, row }: Props = $props();

  let picked = $state<number | null>(null);

  function choose(item: T) {
    picked = item.id; // safe: the constraint guarantees .id
    onpick(item);
  }
</script>

<ul>
  {#each items as item (item.id)}
    <li class:active={picked === item.id}>
      {@render row(item)}
      <button onclick={() => choose(item)}>pick</button>
    </li>
  {/each}
</ul>`,
    output: `Used as <List items={users} onpick={(u) => open(u.email)}>{#snippet row(u)}{u.name}{/snippet}</List>:
- renders one <li> per user with its name and a "pick" button
- clicking "pick" marks that li active and calls onpick with the full User
- T is inferred as User: u.email autocompletes in the parent; u.emial is a compile error
- <List items={['a', 'b']}> fails to compile: string doesn't satisfy { id: number }`,
  },

  keyPoints: [
    "`<script lang=\"ts\" generics=\"T\">` makes the component generic; `T` is usable in prop types, snippet types and local code.",
    "The attribute takes a full generic parameter list: constraints (`generics=\"T extends { id: number }\"`), multiple parameters, and defaults all work.",
    "Tie related props to one `T` — `items: T[]`, `onpick: (item: T) => void`, `row: Snippet<[T]>` — so they can never disagree.",
    "Consumers never pass a type argument: `T` is inferred from the props (usually `items`), and callbacks/snippets get precise parameter types for free.",
    "The payoff is call-site safety: a wrong property access in the parent's callback or snippet is a compile error, not an undefined at runtime.",
    "Only go generic when props must agree about a type the component doesn't own; single-shape components should use a plain interface.",
  ],

  interview: [
    {
      q: "How do you write a generic component in Svelte 5, and when would you?",
      a: "You declare the type parameters in the `generics` attribute on the script tag: `<script lang=\"ts\" generics=\"T extends { id: number }\">`. The string is an ordinary generic parameter list, so constraints and multiple parameters work. Inside, `T` types the props — say `items: T[]`, `onpick: (item: T) => void` and `row: Snippet<[T]>`. I reach for it whenever several props must agree about a type the component doesn't own: lists, selects, tables. If the component renders one fixed shape, a plain `Props` interface is simpler and better.",
    },
    {
      q: "Do consumers of a generic Svelte component have to specify the type parameter?",
      a: "No — and that's the selling point. `T` is inferred from the props at each call site, typically from `items`. Pass `items={users}` and TypeScript resolves `T = User`, so the `onpick` callback parameter and the `row` snippet parameter are both `User` with zero annotations in the parent. The practical effect is that a wrong property access in the parent — `u.emial` instead of `u.email` — fails compilation in the parent's file, which is exactly where the mistake was made.",
    },
    {
      q: "How does this compare to generics in PHP?",
      a: "PHP doesn't have runtime generics — you simulate them with `@template` docblocks that only Psalm or PHPStan understand, and enforcement stops at static analysis you must opt into. The Svelte/TypeScript version is the same erased-at-runtime idea (the generated JavaScript has no trace of `T`), but it's part of the language toolchain everyone runs, inference is automatic at call sites, and constraints like `T extends { id: number }` are enforced on every consumer. Conceptually, if you've written `@template T` collection classes for PHPStan, the `generics` attribute is that — with the ergonomics you wished for.",
    },
  ],

  quiz: [
    {
      question: "Where does a Svelte 5 component declare its generic type parameters?",
      options: [
        "In a <generics> block above the script",
        "In the generics attribute of the script tag",
        "As a type argument when importing the component",
        "With a $generic rune inside the script",
      ],
      answerIndex: 1,
      explain:
        "The script tag carries it: <script lang=\"ts\" generics=\"T\">. The attribute's value is a normal generic parameter list, so 'T extends { id: number }' and multiple comma-separated parameters are valid.",
    },
    {
      question:
        "A generic List declares `items: T[]` and `onpick: (item: T) => void`. A parent passes `items={products}` where products is `Product[]`. What is the type of the parameter in the parent's `onpick` handler?",
      options: [
        "unknown until annotated",
        "any, because generics erase",
        "Product, inferred from the items prop",
        "T — the parent must import T from the component",
      ],
      answerIndex: 2,
      explain:
        "T is inferred per usage site from the props. items={products} fixes T = Product, so onpick's parameter is Product — with autocomplete and typo-checking in the parent, no annotation required.",
    },
    {
      question:
        "Why give the component `generics=\"T extends { id: number }\"` instead of plain `generics=\"T\"`?",
      options: [
        "It makes rendering faster",
        "Plain T is a syntax error in the generics attribute",
        "It lets the component safely use item.id (e.g. as an each key) and rejects callers whose items lack an id",
        "It allows the parent to omit the items prop",
      ],
      answerIndex: 2,
      explain:
        "The constraint is a contract: inside the component, item.id is known to exist; outside, passing items without a numeric id fails to compile. Plain T would make item.id an error inside the component.",
    },
  ],
};

export default lesson;
