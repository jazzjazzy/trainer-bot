import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "script-lang-ts",
  title: "<script lang=\"ts\"> & TS in Components",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "Turn on TypeScript inside a component with one attribute, know which TS features the compiler accepts where, and type your first DOM refs.",

  concept: `
### One attribute switches a component to TypeScript

There's no per-file rename like \`.php\` → nothing — a component stays a
\`.svelte\` file. You opt into TypeScript per script tag:

\`\`\`svelte
<script lang="ts">
  let count: number = 0;

  interface User {
    name: string;
    admin: boolean;
  }
</script>
\`\`\`

Inside that block you have the TypeScript you already know: type annotations,
\`interface\` and \`type\` declarations, generics, unions, narrowing, \`as\` and
\`satisfies\`. The \`sv create\` TypeScript template writes \`lang="ts"\` into
every scaffolded component, so in practice you'll rarely type it by hand.

### Instance script vs \`<script module lang="ts">\`

A component can have **two** script blocks:

- The plain \`<script lang="ts">\` — the **instance** script. Runs once per
  component instance; this is where props, state, and handlers live.
- \`<script module lang="ts">\` — the **module** script. Runs once when the
  module is first evaluated, like top-level code in a \`.ts\` file. You can
  \`export\` things from it (types, constants, helpers) and they become real
  module exports — but never \`export default\`, because the default export *is*
  the component. Module-script variables are visible to the instance script;
  the reverse is not true.

Each block declares its own \`lang="ts"\` — the attribute is per tag.

### Which TypeScript is allowed? "Erasable" is the rule

The Svelte compiler handles TS itself by **erasing** it — so out of the box you
can use any *type-only* feature: annotations, interfaces, generics, \`as\`,
\`satisfies\`. What you can't use are TS features that require the compiler to
**emit code**: \`enum\`, constructor parameter access modifiers with
initialisers (\`constructor(private x = 1)\`), and namespaces. If you truly need
those, \`vitePreprocess({ script: true })\` in \`svelte.config.js\` runs your
scripts through the full TS transform — but idiomatic Svelte code avoids them
(a union of string literals beats an \`enum\` anyway).

### TypeScript in the markup

Template expressions accept type-erasable TS too — the official docs show both
a typed handler parameter and an \`as\` cast in markup:

\`\`\`svelte
<button onclick={(e: Event) => greet(e)}>
  {name as string}
</button>
\`\`\`

The same erasable-only rule applies — an \`enum\` reference or other
code-emitting TS can't appear in the template, because markup never goes through
a script preprocessor. Style-wise, keep casts in the script where they're easy
to spot; a cast buried mid-template is legal but harder to review. (Early Svelte 5
releases didn't allow TS in markup at all, so you'll still meet codebases that
cast exclusively in the script.)

### Typing a DOM element ref

\`bind:this\` hands you the underlying DOM element — type the variable with the
right DOM interface and TypeScript guards you against using it before mount:

\`\`\`svelte
<script lang="ts">
  let input: HTMLInputElement | undefined = $state();
</script>

<input bind:this={input} />
<button onclick={() => input?.focus()}>Focus</button>
\`\`\`

The \`| undefined\` is honest — the element doesn't exist until the component
mounts — so the compiler forces the \`?.\`. Element refs, typed events, and
component instance types get a full section later; this is the shape to remember.
`,

  comparisons: [
    {
      label: "Typing component props",
      intro:
        "A card component takes a title and an optional highlight flag. Both render identically — the TS version documents and enforces the contract.",
      php: `<!-- src/lib/Card.svelte — plain JS -->
<script>
  let { title, highlight = false } = $props();
  // What is title? String? Object? Whatever the
  // caller felt like passing today.
</script>

<div class={highlight ? 'card hot' : 'card'}>
  <h2>{title}</h2>
</div>`,
      ts: `<!-- src/lib/Card.svelte — lang="ts" -->
<script lang="ts">
  interface Props {
    title: string;
    highlight?: boolean;
  }

  let { title, highlight = false }: Props = $props();
</script>

<div class={highlight ? 'card hot' : 'card'}>
  <h2>{title}</h2>
</div>`,
      note: "An interface plus one annotation on $props() types the whole contract — callers passing title={42} or forgetting it entirely now fail svelte-check.",
    },
    {
      label: "Handling an input event",
      intro:
        "An input's value is copied into state on every keystroke. The event target needs a cast — TypeScript makes you say what you believe it is.",
      php: `<!-- src/lib/Search.svelte — plain JS -->
<script>
  let query = $state('');

  function onInput(e) {
    // e is anything; target is anything; hope for the best
    query = e.target.value;
  }
</script>

<input oninput={onInput} />
<p>Searching: {query}</p>`,
      ts: `<!-- src/lib/Search.svelte — lang="ts" -->
<script lang="ts">
  let query = $state('');

  function onInput(e: Event) {
    // currentTarget is EventTarget | null — cast to the
    // element you know it is, in the script, once
    query = (e.currentTarget as HTMLInputElement).value;
  }
</script>

<input oninput={onInput} />
<p>Searching: {query}</p>`,
      note: "Erasable TS like this cast is also legal directly in markup expressions, but doing it once in the script keeps templates readable.",
    },
    {
      label: "A module script shared across instances",
      intro:
        "Every instance of this component increments a counter shared at module level. The TS version types the module state and exports the type for consumers.",
      php: `<!-- src/lib/Tracked.svelte — plain JS -->
<script module>
  let instances = 0;
</script>

<script>
  instances += 1;
  const mine = instances;
</script>

<p>Instance #{mine}</p>`,
      ts: `<!-- src/lib/Tracked.svelte — lang="ts" per tag -->
<script module lang="ts">
  export interface TrackedInfo {
    mine: number;
  }

  let instances = 0;
</script>

<script lang="ts">
  instances += 1;
  const info: TrackedInfo = { mine: instances };
</script>

<p>Instance #{info.mine}</p>`,
      note: "module scripts run once per module, can export (types included) but never export default — and each script tag needs its own lang=\"ts\".",
    },
  ],

  playground: {
    lang: "svelte",
    intro:
      "One component using the whole toolkit: a typed module-script interface, runes with annotations, a typed DOM ref, and a cast. Predict the initial counts, then what the button does.",
    code: `<!-- src/routes/wordcount/+page.svelte -->
<script module lang="ts">
  // Evaluated once per module — a fine home for shared types.
  export interface Stats {
    chars: number;
    words: number;
  }
</script>

<script lang="ts">
  let text = $state("SvelteKit speaks TypeScript");
  let box: HTMLTextAreaElement | undefined = $state();

  let stats: Stats = $derived({
    chars: text.length,
    words: text.trim() === "" ? 0 : text.trim().split(/\\s+/).length
  });

  function clearAndFocus(): void {
    text = "";
    box?.focus(); // box may be undefined pre-mount — TS insists on ?.
  }
</script>

<textarea bind:this={box} bind:value={text}></textarea>
<button onclick={clearAndFocus}>Clear & focus</button>

<!-- Erasable TS parses in markup too (the cast is redundant, and
     that's the point — it vanishes at compile time): -->
<p>{(stats.chars as number)} chars, {stats.words} words</p>`,
    output: `Renders a textarea containing "SvelteKit speaks TypeScript", a "Clear & focus" button,
and the line "27 chars, 3 words".
Editing the textarea updates both counts on every keystroke.
Clicking "Clear & focus" empties the textarea, moves focus into it,
and the line reads "0 chars, 0 words".`,
  },

  keyPoints: [
    "Add `lang=\"ts\"` to a script tag to write TypeScript in a component — the attribute is per tag, and the `sv create` TS template adds it for you.",
    "`<script module lang=\"ts\">` runs once per module (not per instance), may `export` types/values, but never `export default` — the component is the default export.",
    "Out of the box only *erasable* TS is supported: annotations, interfaces, generics, `as`, `satisfies`. Code-emitting features (`enum`, constructor access modifiers with initialisers, namespaces) need `vitePreprocess({ script: true })`.",
    "Markup expressions accept erasable TS too — typed handler params and `as` casts are legal in the template — but keeping casts in the script reads better.",
    "Type DOM refs as `let el: HTMLInputElement | undefined = $state()` with `bind:this={el}` — the `undefined` reflects pre-mount reality and forces safe `?.` access.",
  ],

  interview: [
    {
      q: "How do you enable TypeScript in a Svelte component, and are there limits on what TS you can write?",
      a: "Add `lang=\"ts\"` to the script tag — no file rename, and it's per tag, so a module script needs its own `lang=\"ts\"`. The Svelte compiler supports *type-only* TypeScript natively: it erases annotations, interfaces, generics, casts and so on during compilation. Features that require the TS compiler to emit real code — `enum`, constructor parameter access modifiers with initialisers, namespaces — aren't supported out of the box; you'd configure `vitePreprocess({ script: true })` for those, though idiomatic Svelte avoids them. Erasable TS also works inside markup expressions, so a typed event parameter or an `as` cast in the template is fine.",
    },
    {
      q: "What's the difference between the instance script and `<script module>`?",
      a: "The instance script runs once per component instance — it's where `$props()`, `$state`, and handlers live. `<script module>` runs once when the module first evaluates, like top-level code in a PHP file that's `require`d once versus a constructor that runs per object. Module scripts can `export` bindings — including types — which become exports of the compiled module, but not `export default`, since the component itself is the default export. Visibility is one-way: instance code can see module variables, but the module block can't touch instance state.",
    },
    {
      q: "Why type a `bind:this` variable as `HTMLInputElement | undefined`, and what does TypeScript buy you there?",
      a: "Because that's the truth at runtime: before the component mounts, the binding hasn't been assigned, so the variable is `undefined`. Typing it as `HTMLInputElement | undefined` (initialised via `$state()`) gives you two protections: full autocomplete on the real DOM interface — `.focus()`, `.select()`, `.value` — and a compile error if you dereference it without `?.` or a guard. It converts a classic runtime crash ('cannot read properties of undefined') into a squiggle.",
    },
  ],

  quiz: [
    {
      question: "Which of these is NOT supported by the Svelte compiler without an extra preprocessor?",
      options: [
        "interface Props { title: string }",
        "let { data }: PageProps = $props()",
        "enum Status { Draft, Published }",
        "query = (e.currentTarget as HTMLInputElement).value",
      ],
      answerIndex: 2,
      explain:
        "The compiler only erases type-level syntax. An enum must be compiled into a runtime object — code emission — which requires vitePreprocess({ script: true }). Interfaces, annotations, and as casts are all erasable and work out of the box.",
    },
    {
      question: "What is true of `<script module lang=\"ts\">`?",
      options: [
        "It runs once per component instance",
        "It runs once per module and can export types and values, but not export default",
        "It's required for using interfaces in a component",
        "It can read the instance script's $state variables",
      ],
      answerIndex: 1,
      explain:
        "The module block evaluates a single time when the module loads. Its exports become module exports (the default export slot is taken by the component itself), and visibility is one-way: instance sees module, not vice versa. Interfaces work fine in a plain instance script.",
    },
    {
      question: "You write `let input: HTMLInputElement = $state()` for a bind:this ref and get a type error. Why?",
      options: [
        "bind:this only works with untyped variables",
        "$state() can't hold DOM elements",
        "The ref is undefined until mount, so the type must include undefined",
        "HTMLInputElement must be imported from svelte",
      ],
      answerIndex: 2,
      explain:
        "$state() with no argument starts as undefined, and the element is only assigned when the component mounts. The honest type is HTMLInputElement | undefined, which then forces safe access like input?.focus(). DOM interfaces are global ambient types — no import needed.",
    },
  ],
};

export default lesson;
