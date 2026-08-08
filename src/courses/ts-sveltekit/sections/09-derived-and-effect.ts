import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "derived-and-effect",
  title: "$derived & $effect with Types",
  part: "Typed Components",
  estMinutes: 12,
  summary:
    "Compute values from state with full inference, run side effects with typed cleanup, and know which of the two you actually need.",

  concept: `
Once state exists, two questions follow: *what values fall out of it?* and
*what should happen when it changes?* Svelte 5 gives each question its own
rune — and mixing them up is the most common runes mistake.

### \`$derived\` — values computed from state

\`\`\`ts
let count = $state(0);
let doubled = $derived(count * 2);        // number — inferred
let parity = $derived(count % 2 === 0 ? "even" : "odd"); // "even" | "odd"
\`\`\`

TypeScript infers the derived type from the expression, exactly as it would
for a plain assignment — including union types from ternaries. You rarely
annotate a derived.

When one expression isn't enough, \`$derived.by\` takes a function:

\`\`\`ts
let total = $derived.by(() => {
  let sum = 0;
  for (const item of items) sum += item.price;
  return sum;                              // return type ⇒ derived type
});
\`\`\`

Two properties matter:

- **Lazy**: a derived is recomputed when read after its dependencies change —
  not eagerly on every write.
- **Pure**: the expression must be side-effect free. Svelte forbids mutating
  state inside a derived; it's a computation, not a place for actions.

### \`$effect\` — side effects, after the DOM settles

\`$effect\` runs a function after the component mounts and again after any
state it *reads* changes (post-DOM-update). It's for work with the outside
world: timers, canvas drawing, subscriptions, analytics, manual DOM APIs.

\`\`\`ts
$effect(() => {
  const id = setInterval(() => console.log(count), 1000);
  return () => clearInterval(id);   // cleanup: () => void
});
\`\`\`

The optional return value is a **typed cleanup function** (\`() => void\`).
Svelte calls it immediately before the effect re-runs and when the component
is destroyed — the same contract as React's \`useEffect\`, if you've seen it,
but with dependencies tracked automatically from what you read.

### When NOT to use \`$effect\`

If the effect's job is to *compute state from other state*, it's the wrong
tool:

\`\`\`ts
// ✗ state + effect: extra render, risk of loops, more code
let doubled = $state(0);
$effect(() => { doubled = count * 2; });

// ✓ derived: lazy, pure, synchronous, cannot loop
let doubled = $derived(count * 2);
\`\`\`

Rule of thumb: **\`$derived\` for values, \`$effect\` for actions.** If
nothing outside the component (DOM, network, timer, console) is touched,
you want a derived.

### Typing pitfalls

- **Deriving from possibly-undefined data.** If \`user\` is
  \`User | undefined\`, then \`$derived(user.name)\` won't compile. Push the
  \`undefined\` through honestly — \`$derived(user?.name ?? "guest")\` gives
  a clean \`string\` — rather than reaching for \`!\`.
- **Narrowing inside effects.** A guard at the top of an effect narrows for
  that run *and* registers the dependency: \`if (!el) return;\` early-returns
  when a \`bind:this\` element isn't mounted yet, and past it \`el\` is
  non-null for the rest of the callback.
`,

  comparisons: [
    {
      label: "Deriving values instead of syncing state by hand",
      intro:
        "A search box filters a product list, and the heading shows the match count. The untyped version syncs a second state variable with an effect; the typed version derives.",
      php: `<!-- src/lib/components/Search.svelte -->
<script>
  let products = $state([]);
  let query = $state("");

  // Manual sync: extra state, extra update pass,
  // and it silently breaks if a dependency is missed.
  let matches = $state([]);
  $effect(() => {
    matches = products.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase())
    );
  });
</script>

<h2>{matches.length} results</h2>`,
      ts: `<!-- src/lib/components/Search.svelte -->
<script lang="ts">
  interface Product {
    name: string;
    price: number;
  }

  let products = $state<Product[]>([]);
  let query = $state("");

  // A value computed from state is a derived — lazy, pure, no sync bugs.
  let matches = $derived(
    products.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase())
    )
  );  // inferred: Product[]
</script>

<h2>{matches.length} results</h2>`,
      note:
        "State-computed-from-state is $derived's job: no second state variable, no effect, and the Product[] type is inferred from the expression.",
    },
    {
      label: "Multi-step derivations with $derived.by",
      intro:
        "An order summary needs a subtotal, shipping tier, and total — too much for one expression. $derived.by takes a function whose return type becomes the derived's type.",
      php: `<!-- src/lib/components/OrderSummary.svelte -->
<script>
  let items = $state([]);

  // One unreadable expression, or handwritten sync — pick your poison.
  let summary = $derived(
    (() => {
      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
      return { subtotal, total: subtotal + (subtotal > 100 ? 0 : 9.95) };
    })()
  );
</script>`,
      ts: `<!-- src/lib/components/OrderSummary.svelte -->
<script lang="ts">
  interface Item {
    price: number;
    qty: number;
  }
  interface Summary {
    subtotal: number;
    shipping: number;
    total: number;
  }

  let items = $state<Item[]>([]);

  let summary = $derived.by((): Summary => {
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const shipping = subtotal > 100 ? 0 : 9.95;
    return { subtotal, shipping, total: subtotal + shipping };
  });
</script>

<p>Total: {summary.total.toFixed(2)}</p>`,
      note:
        "$derived.by is the multi-line form — a real function body with locals, and the return type (annotated or inferred) is the derived's type.",
    },
    {
      label: "An effect with typed cleanup",
      intro:
        "A component polls an endpoint while mounted, at an interval the user can change. The effect must tear the old timer down before starting a new one.",
      php: `<!-- src/lib/components/Poller.svelte -->
<script>
  let ms = $state(5000);
  let status = $state("");

  $effect(() => {
    const id = setInterval(async () => {
      status = await fetch("/api/status").then((r) => r.text());
    }, ms);
    // Forgot to return a cleanup: change ms twice and
    // three timers are now racing each other.
  });
</script>`,
      ts: `<!-- src/lib/components/Poller.svelte -->
<script lang="ts">
  let ms = $state(5000);
  let status = $state("");

  $effect(() => {
    const id = setInterval(async () => {
      status = await fetch("/api/status").then((r) => r.text());
    }, ms);

    // Cleanup is typed () => void: runs before each re-run
    // (ms changed) and on component destroy.
    return () => clearInterval(id);
  });
</script>

<p>{status}</p>`,
      note:
        "Reading ms inside the effect registers it as a dependency; the returned () => void cleanup runs before every re-run and on destroy, so exactly one timer ever exists.",
    },
  ],

  playground: {
    lang: "svelte",
    intro:
      "Derived values (inferred, including a union), a multi-line $derived.by, and an effect with cleanup. Predict what the console shows after clicking Add twice, then changing the interval.",
    code: `<!-- src/lib/components/CartMeter.svelte -->
<script lang="ts">
  interface Item {
    name: string;
    price: number;
  }

  let items = $state<Item[]>([]);
  let intervalMs = $state(1000);

  // Inferred number:
  let subtotal = $derived(items.reduce((s, i) => s + i.price, 0));

  // Inferred union "free" | "standard":
  let shipping = $derived(subtotal > 50 ? "free" : "standard");

  // Multi-line derivation with an explicit return type:
  let label = $derived.by((): string => {
    if (items.length === 0) return "cart empty";
    return items.length + " items — " + subtotal.toFixed(2) + " (" + shipping + " shipping)";
  });

  $effect(() => {
    const id = setInterval(() => console.log("tick:", label), intervalMs);
    return () => {
      console.log("cleanup: clearing old timer");
      clearInterval(id);
    };
  });

  function add(): void {
    items.push({ name: "widget", price: 30 });
  }
</script>

<button onclick={add}>Add $30 widget</button>
<button onclick={() => (intervalMs = 250)}>Faster ticks</button>
<p>{label}</p>`,
    output: `Mount: <p> shows "cart empty"; every second the console logs "tick: cart empty".
Click Add once: label becomes "1 items — 30.00 (standard shipping)".
Click Add again: "2 items — 60.00 (free shipping)" — shipping's union flipped to "free".
Click "Faster ticks": console logs "cleanup: clearing old timer", then the effect
re-runs and ticks arrive every 250ms — exactly one timer alive at all times.`,
  },

  keyPoints: [
    "`$derived(expr)` infers its type from the expression — including unions from ternaries; annotation is rarely needed.",
    "`$derived.by(() => { ... })` is the multi-line form; the function's return type is the derived's type.",
    "Deriveds are lazy (recomputed when read after dependencies change) and must be pure — no state mutation inside.",
    "`$effect` runs after mount and after any state it reads changes; it may return a `() => void` cleanup that runs before re-runs and on destroy.",
    "Never use `$effect` to compute state from other state — that's `$derived`'s job; effects are for the outside world (timers, DOM, network).",
    "Pitfalls: derive from possibly-undefined data with `?.` and `??` (not `!`), and narrow at the top of effects (`if (!el) return;`).",
  ],

  interview: [
    {
      q: "When do you use $derived versus $effect?",
      a: "`$derived` for values, `$effect` for actions. If I'm computing something from existing state — a filtered list, a total, a label — that's a derived: it's lazy, pure, type-inferred, and can't cause update loops. `$effect` is only for side effects that touch the world outside the component graph: timers, subscriptions, canvas or other manual DOM work, analytics. The classic smell is an effect whose body just assigns to a `$state` variable — that's a derived written the slow, bug-prone way.",
    },
    {
      q: "How does cleanup work in $effect, and what type does it have?",
      a: "The effect callback can return a cleanup function typed `() => void`. Svelte calls it immediately before the effect re-runs (because a dependency it read changed) and once more when the component is destroyed. So for something like `setInterval`, I create the timer in the effect body and return `() => clearInterval(id)` — that guarantees exactly one live timer no matter how often the interval setting changes, and no leak on unmount. Dependencies are tracked automatically from what the effect reads; there's no dependency array to keep in sync.",
    },
    {
      q: "What does it mean that deriveds are lazy and pure, and why does it matter?",
      a: "Pure means the derived expression only computes — Svelte actually errors if you mutate state inside one, which keeps the data-flow graph acyclic and predictable. Lazy means the value is recomputed when it's next *read* after a dependency changed, not eagerly on every write — so an expensive derivation you're not currently displaying costs nothing. Together they're why deriving beats effect-based syncing: no intermediate renders with stale values, no ordering bugs, and the type is just the expression's inferred type.",
    },
    {
      q: "A derived reads `user.name` but `user` is `User | undefined`. What do you do?",
      a: "Handle the undefined honestly in the derivation rather than asserting it away: `let greeting = $derived(user?.name ?? 'guest')` yields a clean `string`, or I keep the union with `$derived(user ? makeGreeting(user) : null)` and let the template guard. The `!` operator would compile but reintroduces exactly the runtime crash TypeScript was preventing — data that starts undefined (like anything loaded asynchronously) really is undefined on the first run.",
    },
  ],

  quiz: [
    {
      question:
        "What type does `let parity = $derived(count % 2 === 0 ? \"even\" : \"odd\")` have?",
      options: [
        "string",
        "\"even\" | \"odd\"",
        "unknown — deriveds need explicit annotation",
        "Derived<string>",
      ],
      answerIndex: 1,
      explain:
        "A derived's type is simply the inferred type of its expression, and a ternary over two string literals infers the union `\"even\" | \"odd\"`. Deriveds are one of the places inference does all the work.",
    },
    {
      question:
        "An effect creates a WebSocket. Which is the correct cleanup pattern?",
      options: [
        "Call socket.close() at the top of the effect body",
        "Return () => socket.close() from the effect callback",
        "Register it with onDestroy inside the effect",
        "Nothing — Svelte closes resources automatically",
      ],
      answerIndex: 1,
      explain:
        "The effect callback's return value is a `() => void` teardown that Svelte runs before each re-run and on component destroy — the right place to close sockets, clear timers, or unsubscribe. Svelte can't know how to release arbitrary resources on its own.",
    },
    {
      question:
        "You find `$effect(() => { fullName = first + \" \" + last; })` where fullName is $state. What's the right refactor?",
      options: [
        "Add fullName to the effect's dependency array",
        "Wrap the assignment in untrack()",
        "Replace all three with `let fullName = $derived(first + \" \" + last)`",
        "Move the assignment into $derived.by with a setter",
      ],
      answerIndex: 2,
      explain:
        "Computing state from other state is exactly what $derived is for — one declaration, lazily recomputed, no extra state variable, no risk of update loops. Effects that only assign to state are the canonical runes anti-pattern (and Svelte has no dependency arrays; tracking is automatic).",
    },
  ],
};

export default lesson;
