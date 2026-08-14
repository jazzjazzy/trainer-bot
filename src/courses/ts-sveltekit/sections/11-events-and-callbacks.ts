import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "events-and-callbacks",
  title: "Events & Callback Props",
  part: "Typed Components",
  estMinutes: 11,
  summary:
    "Svelte 5 treats events as plain properties — type DOM handlers precisely, and replace dispatched component events with typed callback props.",

  concept: `
In Svelte 5, events stopped being a special language feature. The \`on:click\`
directive is deprecated (it still compiles, with a warning) — an event handler
is now **just a property** like
any other: \`<button onclick={handler}>\`. That one design decision is what makes
events so pleasant to type: if a handler is just a function-valued prop, then
everything you learned about typing functions and props applies directly.

### DOM events: mostly inferred

When you write a handler inline in the markup, the Svelte language tools infer
the event type for you:

\`\`\`svelte
<button onclick={(e) => console.log(e.clientX)}>where?</button>
\`\`\`

Here \`e\` is already a \`MouseEvent\` whose \`currentTarget\` is an
\`HTMLButtonElement\`. You only need to spell types out when you move the handler
into the \`<script>\` block, because a standalone function has no markup context.
Two idiomatic options:

\`\`\`svelte
<script lang="ts">
  // Option 1 — intersection type, precise currentTarget:
  function handleClick(
    e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }
  ) {
    console.log(e.currentTarget.disabled); // fully typed
  }

  // Option 2 — helper types from 'svelte/elements':
  import type { MouseEventHandler } from 'svelte/elements';
  const handleOther: MouseEventHandler<HTMLButtonElement> = (e) => {
    console.log(e.currentTarget.form);
  };
</script>
\`\`\`

Prefer \`e.currentTarget\` (the element the handler is attached to) over
\`e.target\` (whatever was actually clicked, possibly a child) — \`currentTarget\`
is the one with the precise type.

### Component "events" are callback props

Svelte 4 components emitted events with \`createEventDispatcher\`. That API is
**deprecated in Svelte 5**. The modern pattern is simpler and — crucially —
fully typed: the component accepts a **callback prop**.

\`\`\`svelte
<script lang="ts">
  interface Props {
    onSelect?: (id: number) => void;
  }
  let { onSelect }: Props = $props();
</script>
\`\`\`

The parent passes a function; the child calls it. There is no event bus, no
\`CustomEvent\` with an untyped \`detail\`, no string event names that can be
misspelled. If you have written PHP that accepts a \`callable\` or a closure as a
dependency, this is exactly that idea — the "event" is just an injected
function, and TypeScript checks the argument types at both ends.

### Forwarding events: spread the rest

In Svelte 4 you had to re-declare every event you wanted to forward
(\`<button on:click>\`). In Svelte 5, because handlers are properties, you simply
collect the rest props and spread them onto the element — \`onclick\`,
\`onkeydown\`, \`disabled\` and friends all ride along, and typing the rest props
as \`HTMLButtonAttributes\` (from \`'svelte/elements'\`) means consumers get
autocomplete for every native attribute and handler.
`,

  comparisons: [
    {
      label: "Typing a DOM handler in the script block",
      intro:
        "A button whose click handler lives in the script block and reads details off the button element. Both versions log whether the clicked button is disabled.",
      php: `<!-- src/lib/SaveButton.svelte -->
<script>
  // No annotation: 'e' is untyped, and e.target could be
  // any element — no autocomplete, typos crash at runtime.
  function handleClick(e) {
    console.log(e.target.disabld); // typo: undefined, no warning
  }
</script>

<button onclick={handleClick}>Save</button>`,
      ts: `<!-- src/lib/SaveButton.svelte -->
<script lang="ts">
  // The intersection pins currentTarget to the button element.
  function handleClick(
    e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }
  ) {
    console.log(e.currentTarget.disabled); // typed; typo = compile error
  }
</script>

<button onclick={handleClick}>Save</button>`,
      note:
        "Inline handlers in markup are inferred automatically — you only need the intersection type (or MouseEventHandler<HTMLButtonElement> from 'svelte/elements') when the handler is declared in the script.",
    },
    {
      label: "Component events: dispatcher vs callback prop",
      intro:
        "A row component that tells its parent which user was chosen. The legacy version dispatches a custom event; the modern version accepts a typed callback prop.",
      php: `<!-- src/lib/UserRow.svelte (Svelte 4, legacy) -->
<script>
  import { createEventDispatcher } from 'svelte';
  export let user;
  const dispatch = createEventDispatcher();
</script>

<li>
  {user.name}
  <!-- 'select' is a string; detail is untyped on both ends -->
  <button on:click={() => dispatch('select', user.id)}>
    View
  </button>
</li>`,
      ts: `<!-- src/lib/UserRow.svelte (Svelte 5) -->
<script lang="ts">
  interface Props {
    user: { id: number; name: string };
    onSelect?: (id: number) => void;
  }
  let { user, onSelect }: Props = $props();
</script>

<li>
  {user.name}
  <button onclick={() => onSelect?.(user.id)}>View</button>
</li>

<!-- Parent: <UserRow {user} onSelect={(id) => open(id)} /> -->`,
      note:
        "createEventDispatcher is deprecated in Svelte 5 — a callback prop gives the parent a checked (id: number) => void signature instead of an untyped CustomEvent detail.",
    },
    {
      label: "Typed event forwarding with rest props",
      intro:
        "A styled button wrapper that should pass every native attribute and event handler through to the real <button>, so consumers can write onclick, disabled, type, etc. on the wrapper.",
      php: `<!-- src/lib/FancyButton.svelte -->
<script>
  // rest is untyped: consumers get no autocomplete,
  // and onclik={...} silently does nothing.
  let { children, ...rest } = $props();
</script>

<button class="fancy" {...rest}>
  {@render children?.()}
</button>`,
      ts: `<!-- src/lib/FancyButton.svelte -->
<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  let { children, ...rest }: HTMLButtonAttributes = $props();
</script>

<button class="fancy" {...rest}>
  {@render children?.()}
</button>

<!-- Consumer: <FancyButton onclick={save} disabled={busy}> -->`,
      note:
        "Because events are properties, spreading rest props forwards every handler in one go — and HTMLButtonAttributes types the whole native surface, so a misspelled onclik is a compile error at the call site.",
    },
  ],

  playground: {
    lang: "svelte",
    intro:
      "A click tracker using both handler styles: a typed script-block handler and an inferred inline one. Predict what the paragraph shows after clicking Increment twice, then Reset.",
    code: `<!-- src/lib/ClickTracker.svelte -->
<script lang="ts">
  let count = $state(0);
  let last = $state('nothing yet');

  // Script-block handler: type it yourself.
  function increment(
    e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }
  ) {
    count += 1;
    last = e.currentTarget.textContent ?? 'unknown';
  }
</script>

<button onclick={increment}>Increment</button>

<!-- Inline handler: 'e' is inferred as a MouseEvent on a button. -->
<button
  onclick={(e) => {
    count = 0;
    last = e.currentTarget.textContent ?? 'unknown';
  }}
>
  Reset
</button>

<p>Clicks: {count} — last pressed: {last}</p>`,
    output: `Initially renders: "Clicks: 0 — last pressed: nothing yet"
After clicking Increment twice: "Clicks: 2 — last pressed: Increment"
After clicking Reset: "Clicks: 0 — last pressed: Reset"
Both handlers are fully typed: the first via the explicit intersection type,
the second inferred automatically from the markup.`,
  },

  keyPoints: [
    "Svelte 5 events are plain properties: `onclick={handler}`, not `on:click` — no special directive, no special typing rules.",
    "Inline handlers in markup get their event type inferred; script-block handlers need `MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }` or a helper like `MouseEventHandler<HTMLButtonElement>` from `'svelte/elements'`.",
    "Use `e.currentTarget` (typed as the element the handler is on) rather than `e.target` (could be any descendant).",
    "`createEventDispatcher` is deprecated — component events are typed callback props like `onSelect?: (id: number) => void`, called with `onSelect?.(...)`.",
    "Forward events by spreading rest props onto the element; typing them as `HTMLButtonAttributes` gives consumers the full checked native surface.",
  ],

  interview: [
    {
      q: "How do component events work in Svelte 5, and how is that different from Svelte 4?",
      a: "Svelte 4 used `createEventDispatcher` — the child dispatched a named `CustomEvent` and the parent listened with `on:eventname`, with the payload hidden in an untyped `detail`. Svelte 5 deprecates that in favour of **callback props**: the child declares a prop like `onSelect?: (id: number) => void` and simply calls it. It's plain function passing, so TypeScript checks the signature at both the definition and the call site, there are no misspellable string event names, and forwarding is just spreading rest props. Coming from PHP, it's the difference between a string-keyed event system and injecting a typed closure.",
    },
    {
      q: "How do you type a DOM event handler in a Svelte component?",
      a: "If the handler is written inline in the markup, I don't — Svelte's tooling infers the event and `currentTarget` types from the element it's attached to. If the handler lives in the script block I annotate it, either with an intersection like `(e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement })`, or with the helper types from `'svelte/elements'` such as `MouseEventHandler<HTMLButtonElement>`. I also reach for `currentTarget` rather than `target`, because `currentTarget` is guaranteed to be the element the handler is bound to and therefore carries the precise type.",
    },
    {
      q: "A design-system button needs to accept any native button attribute and event. How do you type that?",
      a: "Type the component's props as `HTMLButtonAttributes` from `'svelte/elements'`, destructure the ones the component itself uses (like `children`), and spread `...rest` onto the underlying `<button>`. Because Svelte 5 events are properties, that spread forwards `onclick`, `onkeydown`, `disabled` — everything — without listing them, and consumers get autocomplete plus compile errors for typos like `onclik`.",
    },
  ],

  quiz: [
    {
      question: "In Svelte 5, what is `onclick={handler}` on a `<button>`?",
      options: [
        "A special event directive compiled differently from props",
        "An ordinary property whose value is a function",
        "Shorthand for createEventDispatcher",
        "Only valid on components, not DOM elements",
      ],
      answerIndex: 1,
      explain:
        "Svelte 5 deprecated the on: directive — it still compiles, with a warning — in favour of event handlers as regular properties. That's why they can be typed, spread, and forwarded exactly like any other prop.",
    },
    {
      question:
        "A component needs to notify its parent when an item is chosen. What's the idiomatic Svelte 5 approach?",
      options: [
        "createEventDispatcher with a 'chosen' event",
        "A writable store shared between parent and child",
        "A callback prop such as onChoose?: (item: Item) => void",
        "window.dispatchEvent with a CustomEvent",
      ],
      answerIndex: 2,
      explain:
        "createEventDispatcher is deprecated in Svelte 5. A callback prop is plain, typed function passing — the parent's handler signature is checked by the compiler.",
    },
    {
      question:
        "Why prefer `e.currentTarget` over `e.target` in a typed handler?",
      options: [
        "e.target does not exist on MouseEvent",
        "currentTarget is always the element the handler is attached to, so its type is knowable",
        "target is read-only",
        "currentTarget fires earlier in the capture phase",
      ],
      answerIndex: 1,
      explain:
        "target is whatever node was actually interacted with (possibly a nested child), so it can't be typed precisely. currentTarget is by definition the element carrying the handler — which is why the intersection pattern types exactly that field.",
    },
  ],
};

export default lesson;
