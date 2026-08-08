import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "bindable-props",
  title: "Two-Way Binding: $bindable & bind:this",
  part: "Typed Components",
  estMinutes: 11,
  summary:
    "Opt props into typed two-way binding with $bindable, and get typed references to DOM elements and component instances with bind:this.",

  concept: `
Props normally flow one way: parent down to child. Svelte 5 makes any
exception explicit — a child must **opt a prop in** with \`$bindable()\`
before a parent may write to it with \`bind:\`.

### Declaring a bindable prop

\`\`\`svelte
<!-- FancyInput.svelte -->
<script lang="ts">
  interface Props {
    value?: string;          // typed like any other prop
    label: string;
  }

  let { value = $bindable(""), label }: Props = $props();
</script>

<label>{label} <input bind:value /></label>
\`\`\`

\`$bindable("")\` does two jobs: it marks \`value\` as bindable, and the
argument is a **fallback** used when the parent passes nothing. The type
still comes from the \`Props\` interface — a bindable is just a prop that the
child is allowed to assign to, with the change flowing back up.

The parent binds with the familiar directive:

\`\`\`svelte
<script lang="ts">
  let name = $state("");
</script>

<FancyInput bind:value={name} label="Name" />
<p>Hello {name}</p>
\`\`\`

The types must line up on both ends: binding a \`number\` state to a
\`string\` bindable is a compile error, which is precisely the class of bug
two-way binding used to hide.

### Prefer callback props — reach for $bindable deliberately

Two-way binding is powerful and easy to overuse. A bindable prop means the
child can change the parent's state at any moment, invisibly at the call
site. Prefer a **callback prop** (\`onchange: (v: string) => void\`) when:

- the parent should *decide* whether to accept the change (validation,
  clamping, confirmation);
- you want the data flow readable at the call site;
- several things must happen on change anyway.

Use \`$bindable\` for genuinely input-like components — text fields,
selects, sliders, date pickers — where "the parent's variable *is* the
value" matches how everyone already thinks about \`<input bind:value>\`.

### \`bind:this\` — typed element references

\`bind:this\` gives you the underlying DOM node. Type it with the precise
element interface, starting as \`undefined\` because the node doesn't exist
until mount:

\`\`\`svelte
<script lang="ts">
  let canvas = $state<HTMLCanvasElement>();   // HTMLCanvasElement | undefined

  $effect(() => {
    if (!canvas) return;                      // narrow: mounted from here on
    const ctx = canvas.getContext("2d");
    // ...
  });
</script>

<canvas bind:this={canvas} width="300" height="150"></canvas>
\`\`\`

Choosing \`HTMLInputElement\` over plain \`HTMLElement\` is what unlocks
\`.focus()\`, \`.select()\`, \`.value\` — the specific API of that element.

### \`bind:this\` on components

On a component, \`bind:this\` returns the **instance exports** — whatever the
child declares with \`export function\`/\`export const\` (in Svelte 5,
components aren't classes, so there's no \`$set\`/\`$on\`). The component's
own type names that instance shape:

\`\`\`svelte
<script lang="ts">
  import Player from "./Player.svelte";
  let player = $state<Player>();     // typed instance exports
</script>

<Player bind:this={player} />
<button onclick={() => player?.play()}>Play</button>
\`\`\`
`,

  comparisons: [
    {
      label: "Opting a prop into two-way binding",
      intro:
        "A reusable FancyInput whose value the parent can bind. The child forwards its inner input's value; the fallback covers parents that don't bind at all.",
      php: `<!-- src/lib/components/FancyInput.svelte -->
<script>
  // Bindable, but of what? Parents can bind a number,
  // a Date, anything — and find out at runtime.
  let { value = $bindable(""), label } = $props();
</script>

<label>
  {label}
  <input bind:value />
</label>`,
      ts: `<!-- src/lib/components/FancyInput.svelte -->
<script lang="ts">
  interface Props {
    value?: string;   // the bindable's type lives in the interface
    label: string;
  }

  let { value = $bindable(""), label }: Props = $props();
</script>

<label>
  {label}
  <input bind:value />
</label>

<!-- Parent:  let name = $state("");
     <FancyInput bind:value={name} label="Name" />   ✓
     let age = $state(0);
     <FancyInput bind:value={age} label="Age" />     ✗ number ≠ string -->`,
      note:
        "$bindable(\"\") marks the prop bindable and supplies the unbound fallback; the Props interface types both directions of the binding.",
    },
    {
      label: "Callback prop vs bindable: who owns the rule?",
      intro:
        "A quantity stepper that must stay between 1 and 99. With a bindable the child writes straight into parent state; with a callback the parent stays in charge.",
      php: `<!-- src/lib/components/Stepper.svelte -->
<script>
  // The child pushes any value into the parent's state —
  // clamping logic ends up duplicated in every child.
  let { qty = $bindable(1) } = $props();
</script>

<button onclick={() => (qty -= 1)}>-</button>
{qty}
<button onclick={() => (qty += 1)}>+</button>
<!-- Parent: <Stepper bind:qty={qty} />
     qty can silently become 0 or 100 -->`,
      ts: `<!-- src/lib/components/Stepper.svelte -->
<script lang="ts">
  interface Props {
    qty: number;
    onchange: (next: number) => void;   // parent decides what to accept
  }

  let { qty, onchange }: Props = $props();
</script>

<button onclick={() => onchange(qty - 1)}>-</button>
{qty}
<button onclick={() => onchange(qty + 1)}>+</button>

<!-- Parent:
     <Stepper {qty} onchange={(n) => (qty = Math.min(99, Math.max(1, n)))} />
     The clamp lives with the state's owner. -->`,
      note:
        "Bindables suit value-like inputs; when a rule governs the change (clamping, validation), a typed callback keeps the parent in control and the flow visible at the call site.",
    },
    {
      label: "Typed element refs with bind:this",
      intro:
        "A search form that focuses its input when a keyboard shortcut fires. The ref starts undefined because the element doesn't exist until mount.",
      php: `<!-- src/lib/components/SearchForm.svelte -->
<script>
  let input;   // could be anything

  function focusSearch() {
    // Runtime roulette: input may be undefined,
    // and nothing proves .select() exists on it.
    input.focus();
    input.select();
  }
</script>

<input bind:this={input} placeholder="Search…" />
<button onclick={focusSearch}>Focus</button>`,
      ts: `<!-- src/lib/components/SearchForm.svelte -->
<script lang="ts">
  // HTMLInputElement | undefined — undefined until mounted
  let input = $state<HTMLInputElement>();

  function focusSearch(): void {
    if (!input) return;   // narrowed: HTMLInputElement below
    input.focus();
    input.select();       // exists because it's an *input*, not HTMLElement
  }
</script>

<input bind:this={input} placeholder="Search…" />
<button onclick={focusSearch}>Focus</button>`,
      note:
        "Type the ref as the specific element (HTMLInputElement, HTMLCanvasElement…) to unlock its real API, and let the | undefined force a mount check.",
    },
  ],

  playground: {
    lang: "svelte",
    intro:
      "Both tools in one component: a typed bindable prop with a fallback, and a typed bind:this ref used to focus the inner input. Predict what a parent with and without bind:value sees.",
    code: `<!-- src/lib/components/FancyInput.svelte -->
<script lang="ts">
  interface Props {
    value?: string;
    label: string;
  }

  // Bindable with a fallback: used only when the parent doesn't bind.
  let { value = $bindable(""), label }: Props = $props();

  // Typed element ref: HTMLInputElement | undefined until mount.
  let inputEl = $state<HTMLInputElement>();

  function clearAndFocus(): void {
    value = "";            // flows back up to a bound parent
    inputEl?.focus();      // optional chaining handles pre-mount
  }
</script>

<label>
  {label}
  <input bind:this={inputEl} bind:value />
</label>
<button onclick={clearAndFocus}>Clear</button>
<p>Current: "{value}"</p>

<!-- Parent usage:
  <script lang="ts">
    let name = $state("Ada");
  </script>
  <FancyInput bind:value={name} label="Name" />
  <p>Parent sees: {name}</p>
-->`,
    output: `Bound parent (bind:value={name}, name = "Ada"): the input shows "Ada";
typing "Grace" updates both "Current" and the parent's {name} live.
Clicking Clear sets value to "" — the parent's name becomes "" too —
and the input regains focus via the typed inputEl ref.
Unbound parent (<FancyInput label="Name" />): the fallback "" is used and
edits stay local to the child; nothing flows upward.`,
  },

  keyPoints: [
    "Props are one-way by default; a child opts into two-way binding with `let { value = $bindable() } = $props()`.",
    "`$bindable(fallback)` supplies the value used when the parent doesn't bind; the prop's type still comes from the `Props` interface, e.g. `$bindable(0)` for `value?: number`.",
    "The parent binds with `bind:value={someState}` — and both sides' types must match, or it won't compile.",
    "Prefer typed callback props (`onchange: (v: T) => void`) when the parent must validate or decide; save `$bindable` for genuinely input-like components.",
    "Type `bind:this` refs precisely: `let input = $state<HTMLInputElement>()` is `HTMLInputElement | undefined` — narrow before use, and the specific interface unlocks `.focus()`, `.getContext()`, etc.",
    "`bind:this` on a component yields its instance exports (no class, no `$set`/`$on` in Svelte 5); type it with the component's own type: `$state<Player>()`.",
  ],

  interview: [
    {
      q: "How does two-way binding to a component prop work in Svelte 5?",
      a: "The child must opt the prop in: `let { value = $bindable('') } = $props()`. That marks `value` as bindable and the argument is a fallback for parents that don't bind. The parent then writes `bind:value={someState}` and assignments inside the child flow back up. It's deliberately explicit — a parent can't force two-way binding onto an ordinary prop — and with a `Props` interface both directions are type-checked, so binding a `number` to a `string` bindable fails at compile time.",
    },
    {
      q: "When would you choose a callback prop over $bindable?",
      a: "Whenever the parent should stay in charge of the change. A bindable lets the child write parent state directly, which is perfect for input-like components where the variable simply *is* the value — text fields, selects, sliders. But if there's a rule — clamping a quantity, validating, confirming a destructive change — I expose `onchange: (next: T) => void` and let the parent apply the rule when it assigns. It also keeps data flow visible at the call site: `bind:` hides a write, a callback shows one.",
    },
    {
      q: "How do you type bind:this for a DOM element, and why the undefined?",
      a: "`let canvas = $state<HTMLCanvasElement>()` — which is `HTMLCanvasElement | undefined`, because the element doesn't exist until the component mounts, so the ref is genuinely undefined at first. That forces a narrow (`if (!canvas) return;` in an effect, or `canvas?.`) before use. Choosing the precise interface matters: `HTMLCanvasElement` gives me `getContext`, `HTMLInputElement` gives me `focus`/`select`/`value` — a plain `HTMLElement` annotation would compile but hide the API I actually need.",
    },
    {
      q: "What does bind:this give you on a component in Svelte 5?",
      a: "The instance's exports — anything the child declares with `export function` or `export const` in its script. Components aren't classes any more, so there's no `$set`/`$on`/`$destroy` like Svelte 4. I type the ref with the component's own type, e.g. `let player = $state<Player>()`, and then `player?.play()` is fully checked against what Player actually exports. It's the right tool for imperative child APIs like play/pause, focus, or reset.",
    },
  ],

  quiz: [
    {
      question:
        "In `let { value = $bindable(0) } = $props()`, what does the `0` mean?",
      options: [
        "The value the prop resets to whenever the parent re-renders",
        "A fallback used when the parent doesn't bind or pass the prop",
        "The initial value the parent's bound state is overwritten with",
        "A type hint that coerces bound values to numbers",
      ],
      answerIndex: 1,
      explain:
        "The argument to $bindable is a fallback for when no prop is passed at all — a parent that does bind supplies (and keeps owning) the value. The type comes from the Props interface, not from the fallback.",
    },
    {
      question:
        "What is the type of `let el = $state<HTMLInputElement>()` used with `<input bind:this={el} />`, and why?",
      options: [
        "HTMLInputElement — bind:this guarantees assignment",
        "HTMLElement — refs are always the base type",
        "HTMLInputElement | undefined — the element doesn't exist until mount",
        "Ref<HTMLInputElement> — Svelte wraps refs in a container",
      ],
      answerIndex: 2,
      explain:
        "Calling $state with no initial value makes the type `HTMLInputElement | undefined`, which is honest: before mount there is no DOM node. The compiler then forces a narrow (`if (!el) return` or `el?.focus()`) before you touch the element's API.",
    },
    {
      question:
        "A QuantityStepper must keep its value between 1 and 99. Which design keeps that rule enforceable in one place?",
      options: [
        "A $bindable(1) prop — the child clamps before assigning",
        "A callback prop onchange: (next: number) => void — the parent clamps when it assigns",
        "A $bindable prop plus an $effect in the parent that re-clamps after each change",
        "A global store the stepper writes to directly",
      ],
      answerIndex: 1,
      explain:
        "With a callback the state's owner — the parent — applies the clamp at the single point of assignment. A bindable lets the child write parent state directly, so the rule either gets duplicated into children or patched up after the fact with an effect (an anti-pattern).",
    },
  ],
};

export default lesson;
