import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "stores-vs-runes",
  title: "Shared State: Stores vs Runes",
  part: "Patterns & Shipping",
  estMinutes: 12,
  summary:
    "Two ways to share state across components — typed writable<T> stores and $state in .svelte.ts modules — plus the SSR rule that decides what may live in either.",

  concept: `
Component state (\`$state\` inside a component) covers most needs. But sooner or
later two distant components need the same value — a theme, a cart, a toast
queue. SvelteKit gives you two mechanisms, one legacy and one modern, and a
hard server-side rule that applies to both.

### The legacy mechanism: stores

A store is any object with a \`subscribe\` method. \`svelte/store\` ships typed
factories and interfaces:

\`\`\`ts
// src/lib/theme.ts
import { writable, type Writable } from 'svelte/store';

export type Theme = 'light' | 'dark';
export const theme: Writable<Theme> = writable<Theme>('light');
\`\`\`

\`writable<T>\` returns \`Writable<T>\` — \`subscribe\`, \`set\`, \`update\` —
and \`Readable<T>\` is the subscribe-only face (what \`derived\` and
\`readable\` return). Inside components, the **\`$theme\` auto-subscription**
still works in Svelte 5: prefix a store with \`$\` and the compiler manages
subscribe/unsubscribe, with \`$theme\` typed as \`Theme\`. Stores are **not
deprecated** — existing code, and libraries built on the subscription
contract, remain valid.

### The modern mechanism: runes in .svelte.ts

Runes work outside components too: name a module \`.svelte.ts\` and you can
declare \`$state\` in it. Two idiomatic shapes:

\`\`\`ts
// src/lib/cart.svelte.ts
export const cart = $state({ items: [] as string[] });

export function addItem(item: string): void {
  cart.items.push(item); // mutate properties — reactive everywhere
}
\`\`\`

or a class with \`$state\` fields. One compiler rule to know: you **cannot
export a \`$state\` variable that you reassign** (\`state = newValue\`) —
the compiler rejects it because importers would hold a stale reference.
Export an *object* and mutate its properties, or keep the variable private
and export getter/setter functions. No \`subscribe\`, no \`$\` prefix — you
just read \`cart.items\` and it's reactive, with ordinary TypeScript types
throughout.

### THE BIG CAVEAT: the server shares modules

This is the one that bites. On the server, a module is loaded **once per
process, not once per request** — module-level state is shared by **every
user currently hitting your server**. Put a logged-in user into a shared
\`$state\` object (or a store) at module level, and during SSR user A's data
can render into user B's HTML. It's the same trap as storing request data in
a static property in a long-running PHP worker (Swoole/RoadRunner/Octane) —
except SvelteKit servers are *always* long-running.

The rule:

- **Per-user / per-request data** → \`load\` functions and \`event.locals\`,
  passed down as \`data\`. Never module-level state.
- **Module-level shared state** is a *client-side* tool: fine for UI state
  in the browser, where one process serves one user.

### Rule of thumb

- **Runes in \`.svelte.ts\`** — default for shared *client* app state
  (theme, cart UI, toasts). Plain typed objects, no subscription ceremony.
- **\`load\` / \`locals\`** — anything per-user or per-request. Full stop.
- **Stores** — when you need the subscription contract itself: interop with
  libraries that expect \`Readable<T>\`, existing codebases, or hand-built
  stores wrapping external sources.
`,

  comparisons: [
    {
      label: "A writable store, typed",
      intro:
        "A theme store shared app-wide. The untyped version will happily accept any string; the typed one constrains the value to a union and exposes the Writable<T> contract.",
      leftLang: "js",
      rightLang: "ts",
      php: `// src/lib/theme.js (untyped)
import { writable } from 'svelte/store';

// starts life as whatever you pass — and stays 'any-ish'
export const theme = writable('light');

export function toggle() {
  // nothing stops 'ligt' or even 42 ending up in here
  theme.update((t) => (t === 'light' ? 'dark' : 'light'));
}`,
      ts: `// src/lib/theme.ts
import { writable, type Writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

// Writable<Theme>: subscribe, set, update — all constrained to Theme
export const theme: Writable<Theme> = writable<Theme>('light');

export function toggle(): void {
  theme.update((t) => (t === 'light' ? 'dark' : 'light'));
  // theme.set('ligt') — compile error
}

// In a component: $theme auto-subscribes and is typed as Theme`,
      note:
        "writable<T> pins the store's value type for set, update, and the $-prefixed auto-subscription in components — a union type turns typos into compile errors.",
    },
    {
      label: "Shared state in a .svelte.ts module",
      intro:
        "The same shared state, runes-style: a cart module any component can import. Note the export rule — you export an object you mutate, not a variable you reassign.",
      leftLang: "js",
      rightLang: "ts",
      php: `// src/lib/cart.svelte.js (untyped)
export const cart = $state({ items: [] });

export function addItem(item) {
  cart.items.push(item); // item could be anything
}

export function itemCount() {
  return cart.items.length;
}

// export let total = $state(0)  <- reassigning an exported
// $state is a compile error; exporting the object is the fix`,
      ts: `// src/lib/cart.svelte.ts
export interface CartItem { sku: string; qty: number; price: number; }

// Export an object and mutate its properties — reactive everywhere.
// (Exporting a $state you reassign is rejected by the compiler.)
export const cart = $state({ items: [] as CartItem[] });

export function addItem(item: CartItem): void {
  cart.items.push(item);
}

export function total(): number {
  return cart.items.reduce((sum, i) => sum + i.qty * i.price, 0);
}

// CLIENT-ONLY state: on the server this module is shared
// by every request — never put per-user data here.`,
      note:
        "No subscribe, no $ prefix — importing components read cart.items directly and stay reactive; the interface types every mutation path, and the SSR warning is the price of module-level state.",
    },
    {
      label: "Consuming both in a component",
      intro:
        "A header that shows the theme (store) and the cart count (runes module). Same rendering; the typed side gets checked property access on both mechanisms.",
      php: `<!-- src/lib/Header.svelte (untyped) -->
<script>
  import { theme, toggle } from '$lib/theme';
  import { cart } from '$lib/cart.svelte';
</script>

<header class={$theme}>
  <!-- $theme could be anything; cart.itmes is undefined -->
  <button onclick={toggle}>{$theme}</button>
  <span>{cart.itmes.length} items</span>
</header>`,
      ts: `<!-- src/lib/Header.svelte -->
<script lang="ts">
  import { theme, toggle } from '$lib/theme';        // store
  import { cart } from '$lib/cart.svelte';           // runes module

  // $theme: Theme ('light' | 'dark') via auto-subscription
  // cart.items: CartItem[] — plain typed property access
</script>

<header class={$theme}>
  <button onclick={toggle}>{$theme}</button>
  <span>{cart.items.length} items</span> <!-- cart.itmes: compile error -->
</header>`,
      note:
        "Stores need the $ prefix (compiler-managed subscription); runes state is just a typed object — and in both cases lang=\"ts\" turns the .itmes typo into a red squiggle instead of a blank header.",
    },
  ],

  playground: {
    intro:
      "The store contract from scratch: a hand-rolled writable<T> in ~20 lines. Predict the log order — especially what the initial subscribe prints and what happens after unsubscribe.",
    lang: "typescript",
    code: `// The contract every Svelte store satisfies, hand-rolled:
type Subscriber<T> = (value: T) => void;
type Unsubscriber = () => void;

interface Readable<T> {
  subscribe(run: Subscriber<T>): Unsubscriber;
}
interface Writable<T> extends Readable<T> {
  set(value: T): void;
  update(updater: (value: T) => T): void;
}

function writable<T>(initial: T): Writable<T> {
  let value = initial;
  const subscribers = new Set<Subscriber<T>>();

  function set(next: T): void {
    value = next;
    subscribers.forEach((run) => run(value));
  }

  return {
    subscribe(run) {
      run(value);              // Svelte contract: call immediately with current value
      subscribers.add(run);
      return () => subscribers.delete(run);
    },
    set,
    update(updater) {
      set(updater(value));
    },
  };
}

// T is inferred as number; count.set("ten") would not compile
const count = writable(0);

const unsubscribe = count.subscribe((v) => console.log("subscriber sees:", v));
// ^ this is what the compiler generates for you when you write $count

count.set(1);
count.update((n) => n + 10);

unsubscribe();
count.set(999); // nobody is listening any more

console.log("done — 999 was set but never logged");`,
  },

  keyPoints: [
    "Stores are alive and well: `writable<T>` gives you a `Writable<T>` (`subscribe`/`set`/`update`), `Readable<T>` is the subscribe-only face, and `$store` auto-subscription still works in Svelte 5.",
    "Modern shared state: declare `$state` in a `.svelte.ts` module — plain typed objects, no subscription ceremony, reactive in every importer.",
    "You cannot export a reassigned `$state` variable — export an object and mutate its properties, or export getter/setter functions.",
    "**SSR caveat**: on the server, module-level state is shared across ALL requests — per-user data there leaks between users. Same trap as static state in a long-running PHP worker.",
    "Per-user / per-request data belongs in `load` and `event.locals`, delivered as `data` — never in module scope.",
    "Rule of thumb: runes-in-`.svelte.ts` for client app state, `load`/`locals` for per-request data, stores when you need the subscription contract or library interop.",
  ],

  interview: [
    {
      q: "Svelte 5 has runes — are stores obsolete? How do you choose?",
      a: "Not obsolete, just no longer the only tool. Stores are a stable contract — anything with a typed `subscribe` — and `writable<T>`, `derived`, and the `$store` auto-subscription all still work; libraries and existing codebases rely on them. But for new shared state I default to `$state` in a `.svelte.ts` module: it's a plain typed object, reactive in every importer, with no subscription ceremony and no `$` prefix. I reach for stores when I specifically need the subscription contract — interop with a library expecting `Readable<T>`, or wrapping an external event source where explicit subscribe/unsubscribe semantics are the point. And regardless of mechanism, per-user data never goes in module scope.",
    },
    {
      q: "What's the danger of module-level shared state in a SvelteKit app, and how do you avoid it?",
      a: "The server is one long-running process shared by all users, so a module-level store or `$state` object is *global across requests*. If my `handle` or a load function writes the current user into shared module state, during SSR one request can read another request's data — user B sees user A's name, or worse. It's exactly the class of bug PHP devs hit moving to Swoole or Laravel Octane: static state that was harmless in per-request PHP suddenly persists. The fix is architectural: per-user data flows through `event.locals` and `load` return values, which are scoped to the request; module-level shared state is reserved for client-side UI concerns like theme or cart display.",
    },
    {
      q: "You export state from a .svelte.ts file and the compiler complains about reassignment. Why, and what's the fix?",
      a: "Svelte compiles `$state` references into signal reads/writes, but an ES module export is a binding to a variable — if importers grabbed the value and I later reassigned the variable, their reference would go stale and reactivity would silently break. So the compiler bans exporting a `$state` variable that gets reassigned. Two fixes: export a *stable object* and mutate its properties (`export const cart = $state({ items: [] })`, then `cart.items.push(...)`), or keep the variable private and export accessor functions like `getCount()` / `increment()`. A class with `$state` fields is a nice typed variant of the first option.",
    },
  ],

  quiz: [
    {
      question: "What does `writable<Theme>('light')` return?",
      options: [
        "A Readable<Theme> — you need writable().asWritable() to mutate it",
        "A Writable<Theme> with subscribe, set, and update, all constrained to Theme",
        "A plain Theme value wrapped in a Proxy",
        "A $state object usable only inside components",
      ],
      answerIndex: 1,
      explain:
        "writable<T> returns the Writable<T> interface: subscribe (the store contract), plus set and update whose parameters are typed as T — so theme.set('ligt') fails to compile. Readable<T> is the subscribe-only subset returned by readable/derived.",
    },
    {
      question: "Why is `let user = $state(null)` at the top of a shared module a bug in a SvelteKit app (even ignoring export rules)?",
      options: [
        "Runes don't work outside .svelte files at all",
        "null can't be a $state initial value",
        "On the server that variable is shared by every concurrent request — one user's data can leak into another's SSR output",
        "It works, but only in production builds",
      ],
      answerIndex: 2,
      explain:
        "Server modules load once per process. Module-level state therefore outlives requests and is visible to all of them — per-user data there is a cross-user leak. Per-request data belongs in event.locals and load return values.",
    },
    {
      question: "Which is a valid way to share reactive runes state from src/lib/counter.svelte.ts?",
      options: [
        "export let count = $state(0) and reassign count from anywhere",
        "export const counter = $state({ count: 0 }) and mutate counter.count",
        "export default $state(0).subscribe",
        "It's impossible — runes only work inside components",
      ],
      answerIndex: 1,
      explain:
        "Exporting a $state variable that gets reassigned is a compile error, because importers would hold a stale binding. Exporting a stable object whose properties you mutate keeps every importer reactive — as do exported getter/setter functions or a class with $state fields.",
    },
  ],
};

export default lesson;
