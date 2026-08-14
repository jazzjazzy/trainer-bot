import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "typing-props",
  title: "Typing Props with $props()",
  part: "Typed Components",
  estMinutes: 12,
  summary:
    "Declare a component's inputs as an interface and let the compiler enforce the contract at every call site.",

  concept: `
In Svelte 5 a component receives all of its inputs through one rune:
\`$props()\`. You destructure what you need, and — because destructuring is
plain TypeScript — you type it the way you'd type any function parameter.

\`\`\`svelte
<script lang="ts">
  interface Props {
    title: string;
    count?: number;        // optional at the call site
  }

  let { title, count = 0 }: Props = $props();
</script>

<h2>{title} ({count})</h2>
\`\`\`

That \`interface Props\` is the component's **public contract**. Pass a
number as \`title\`, misspell \`count\`, or forget a required prop, and the
error appears at the *call site*, in the editor, before anything runs. For
20 years of PHP templating this is the upgrade from "read the docblock (or
the source) and hope" to a signature the compiler enforces — the same jump
as going from \`@param\` comments to real parameter types in PHP 7.

### Optional props and defaults

Two things must agree: mark the prop optional in the interface (\`count?:
number\`), and give it a default in the destructuring (\`count = 0\`). The
default also lets TypeScript treat \`count\` as plain \`number\` inside the
component — no \`undefined\` checks needed. An optional prop *without* a
default stays \`number | undefined\` inside, which is sometimes exactly what
you want.

### Rest props

Destructuring's rest pattern collects everything you didn't name:

\`\`\`svelte
<script lang="ts">
  let { variant, ...rest }: Props = \$props();
</script>

<div class={variant} {...rest}>...</div>
\`\`\`

Type the extras either loosely with an index signature
(\`[key: string]: unknown\`) or — much better for wrappers — precisely, by
extending a native element's attribute type.

### Extending native element attributes

\`svelte/elements\` exports attribute types for every HTML element:
\`HTMLButtonAttributes\`, \`HTMLInputAttributes\`, \`HTMLAttributes<T>\`, and
so on. A wrapper component extends one of them and instantly accepts every
valid native attribute and event handler — \`type\`, \`disabled\`,
\`onclick\`, \`aria-*\` — all type-checked:

\`\`\`svelte
<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    variant?: "primary" | "ghost";
  }

  let { variant = "primary", children, ...rest }: Props = \$props();
</script>

<button class={variant} {...rest}>{@render children?.()}</button>
\`\`\`

### If you've seen Svelte 4 code

The old syntax was one \`export let name: string\` per prop — types scattered
across declarations, defaults via initialisers, and no clean way to type rest
props. \`$props()\` replaces all of it with a single typed destructuring. New
code should never use \`export let\`.
`,

  comparisons: [
    {
      label: "From guessed props to a contract",
      intro:
        "A ProductCard takes a name, a price, and an optional currency. Both versions render the same output — the difference is what happens when a caller gets it wrong.",
      php: `<!-- src/lib/components/ProductCard.svelte -->
<script>
  // What types are these? Is currency required?
  // Callers must read the source to find out.
  let { name, price, currency = "AUD" } = $props();
</script>

<article>
  <h3>{name}</h3>
  <!-- <ProductCard price="9.99" /> renders "9.99 AUD"
       today and breaks the day you do price * 1.1 -->
  <p>{price.toFixed(2)} {currency}</p>
</article>`,
      ts: `<!-- src/lib/components/ProductCard.svelte -->
<script lang="ts">
  interface Props {
    name: string;
    price: number;          // pass "9.99" and the call site won't compile
    currency?: string;      // optional: has a default below
  }

  let { name, price, currency = "AUD" }: Props = $props();
</script>

<article>
  <h3>{name}</h3>
  <p>{price.toFixed(2)} {currency}</p>
</article>`,
      note:
        "The interface moves the failure from runtime in a browser to a red squiggle at the call site — missing or misspelled props are caught too.",
    },
    {
      label: "Optional props, defaults, and callback props",
      intro:
        "A Paginator shows the current page and notifies its parent when the user clicks next. In Svelte 5 events are just callback props — functions passed like any other prop.",
      php: `<!-- src/lib/components/Paginator.svelte -->
<script>
  // Is onchange guaranteed? What arguments does it get?
  let { page = 1, perPage = 20, onchange } = $props();
</script>

<button onclick={() => onchange(page + 1)}>
  Next (page {page}, {perPage}/page)
</button>
<!-- Crashes with "onchange is not a function"
     if the parent didn't pass one -->`,
      ts: `<!-- src/lib/components/Paginator.svelte -->
<script lang="ts">
  interface Props {
    page?: number;
    perPage?: number;
    onchange?: (page: number) => void;   // typed callback prop
  }

  let { page = 1, perPage = 20, onchange }: Props = $props();
</script>

<button onclick={() => onchange?.(page + 1)}>
  Next (page {page}, {perPage}/page)
</button>
<!-- onchange is ((page: number) => void) | undefined:
     the compiler forces the ?. call -->`,
      note:
        "Typing the callback documents its argument and makes the optional call explicit — the compiler won't let you invoke a possibly-undefined prop bare.",
    },
    {
      label: "A wrapper button that accepts every native attribute",
      intro:
        "A design-system Button that adds a variant but should otherwise behave exactly like <button> — including disabled, type, onclick, and aria attributes.",
      php: `<!-- src/lib/components/Button.svelte -->
<script>
  // rest is a mystery bag: nothing validates that
  // callers pass real button attributes.
  let { variant = "primary", children, ...rest } = $props();
</script>

<button class={"btn " + variant} {...rest}>
  {@render children?.()}
</button>`,
      ts: `<!-- src/lib/components/Button.svelte -->
<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    variant?: "primary" | "ghost";
  }

  let { variant = "primary", children, ...rest }: Props = $props();
</script>

<button class={"btn " + variant} {...rest}>
  {@render children?.()}
</button>
<!-- <Button type="submit" disabled onclick={save}> all type-check;
     <Button href="/x"> is rejected — that's an anchor attribute -->`,
      note:
        "Extending HTMLButtonAttributes from svelte/elements types the rest props: every valid native attribute is accepted, anything else is rejected.",
    },
  ],

  playground: {
    lang: "svelte",
    intro:
      "A complete typed component: required, optional-with-default, and callback props. Read the interface first and predict which of the example call sites in the comment would compile.",
    code: `<!-- src/lib/components/Stat.svelte -->
<script lang="ts">
  interface Props {
    label: string;                 // required
    value: number;                 // required
    unit?: string;                 // optional, defaults to ""
    onreset?: (label: string) => void;  // optional callback prop
  }

  let { label, value, unit = "", onreset }: Props = $props();
</script>

<div class="stat">
  <strong>{label}:</strong> {value}{unit}
  {#if onreset}
    <button onclick={() => onreset?.(label)}>reset</button>
  {/if}
</div>

<!--
  <Stat label="Speed" value={88} unit="mph" />          ✓ compiles
  <Stat label="Speed" value="88" />                     ✗ value: string not number
  <Stat value={88} />                                   ✗ label is required
  <Stat label="Runs" value={3} onreset={(l) => ...} />  ✓ l inferred as string
-->`,
    output: `With <Stat label="Speed" value={88} unit="mph" /> it renders:
  Speed: 88mph            (no reset button — onreset wasn't passed)
With <Stat label="Runs" value={3} onreset={(l) => console.log(l)} />:
  Runs: 3  [reset]        (a reset button appears)
Clicking [reset] calls the parent's callback and logs: Runs`,
  },

  keyPoints: [
    "Svelte 5 components receive all inputs via `let { ... } = $props()` — one typed destructuring instead of Svelte 4's per-prop `export let`.",
    "Type props with `interface Props` and annotate the destructuring: `let { x, y = 0 }: Props = $props()`.",
    "Optional prop = `?` in the interface **plus** a default in the destructuring; with a default, the value is non-undefined inside the component.",
    "Events are just callback props — type them as function properties like `onchange?: (page: number) => void` and call with `?.` when optional.",
    "`...rest` collects unnamed props; type it precisely by extending `HTMLButtonAttributes` (etc.) from `svelte/elements` for wrapper components.",
    "The Props interface is the component's public API: wrong types, missing props, and typos fail at the call site, in the editor.",
  ],

  interview: [
    {
      q: "How do you type a Svelte 5 component's props?",
      a: "Declare an `interface Props` in the `<script lang=\"ts\">` block and annotate the `$props()` destructuring: `let { title, count = 0 }: Props = $props()`. Required props are plain fields, optional ones get `?` in the interface and a default in the destructuring, and callbacks are typed as function properties. Because it's ordinary destructuring, all the TypeScript I already know applies — the interface becomes the component's enforced public API, checked at every call site.",
    },
    {
      q: "You're building a design-system Button wrapper. How do you type it so consumers can pass any native button attribute?",
      a: "Extend the attribute type from `svelte/elements`: `interface Props extends HTMLButtonAttributes { variant?: 'primary' | 'ghost' }`, then `let { variant = 'primary', children, ...rest }: Props = $props()` and spread `{...rest}` onto the `<button>`. Consumers get `type`, `disabled`, `onclick`, `aria-*` — everything a real button accepts — fully type-checked, and anything that isn't a button attribute is rejected. There's an attribute interface for each element, plus generic `HTMLAttributes<T>`.",
    },
    {
      q: "How do props differ between Svelte 4 and Svelte 5, and why is 5 better for TypeScript?",
      a: "Svelte 4 declared each prop as `export let name: string` — a compiler-special reuse of export syntax, with types scattered across declarations and no good way to type rest props. Svelte 5's `$props()` returns the whole props object, so a single `interface Props` types everything in one place using standard destructuring semantics: defaults, renaming, and `...rest` all just work. It's plain TypeScript rather than framework magic, which is also why tooling and type inference at call sites are stronger.",
    },
  ],

  quiz: [
    {
      question:
        "What's the correct way to declare a typed optional prop with a default in Svelte 5?",
      options: [
        "export let count: number = 0",
        "let { count = 0 }: { count?: number } = $props()",
        "let count = $props<number>(\"count\", 0)",
        "let { count }: { count: number } = $props(0)",
      ],
      answerIndex: 1,
      explain:
        "Props come from destructuring `$props()`; the annotation marks `count` optional (`count?: number`) and the destructuring default (`count = 0`) supplies the fallback — inside the component `count` is then a plain `number`. `export let` is Svelte 4.",
    },
    {
      question:
        "You want a wrapper component's rest props to accept exactly the attributes a native <input> accepts. What do you use?",
      options: [
        "interface Props { [key: string]: unknown }",
        "interface Props extends HTMLInputAttributes (from 'svelte/elements')",
        "let rest: HTMLInputElement = $props()",
        "interface Props extends InputEvent",
      ],
      answerIndex: 1,
      explain:
        "`svelte/elements` exports per-element attribute types like `HTMLInputAttributes`. Extending one types the `...rest` spread precisely — valid attributes and handlers pass, anything else is a compile error. An index signature accepts everything, which defeats the check.",
    },
    {
      question:
        "A component declares `onchange?: (page: number) => void` and you write `onchange(2)` in a handler. What does TypeScript say?",
      options: [
        "Fine — optional props are auto-guarded",
        "Error — the prop may be undefined, so you must guard or use onchange?.(2)",
        "Error — callback props must be invoked through dispatch()",
        "Fine at compile time, but it warns at runtime",
      ],
      answerIndex: 1,
      explain:
        "An optional callback's type is `((page: number) => void) | undefined`, so a bare call is a compile error. The optional-call syntax `onchange?.(2)` (or an if-guard) handles the parent-didn't-pass-it case — exactly the crash the untyped version hits at runtime.",
    },
  ],
};

export default lesson;
