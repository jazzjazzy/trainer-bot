import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "context-api",
  title: "Typed Context",
  part: "Patterns & Shipping",
  estMinutes: 10,
  summary:
    "Svelte's setContext/getContext are untyped by default — wrap them in typed helper functions so a whole component subtree shares data safely.",

  concept: `
Props are perfect for parent → child. But when a component five levels deep
needs something an ancestor owns — the current cart, a theme, a map instance —
threading it through every intermediate layer ("prop drilling") forces
components to carry data they never use. Svelte's answer is **context**: an
ancestor calls \`setContext(key, value)\` during its initialisation, and any
descendant in that subtree calls \`getContext(key)\` to receive it.

### The typing hole

Here's the catch: \`getContext\` has the signature \`getContext<T>(key): T\` —
**you** supply \`T\`, and Svelte just believes you. Nothing connects the type
you claim at \`getContext\` to the type the ancestor actually passed to
\`setContext\`. It's a cast wearing a generic's clothing, the same trap as
\`request.json() as MyType\`. Two components can disagree about the shape and
the compiler stays silent until production.

### The fix: a typed wrapper module

Don't call \`setContext\`/\`getContext\` directly in components. Put one pair of
helpers in a module, next to the interface they share:

\`\`\`ts
// src/lib/context/cart.ts
const KEY = Symbol('cart');

export function setCartContext(cart: Cart): Cart {
  return setContext(KEY, cart);
}
export function getCartContext(): Cart {
  const cart = getContext<Cart>(KEY);
  if (!cart) throw new Error('no cart context — call setCartContext in an ancestor');
  return cart;
}
\`\`\`

Now the type lives in exactly one place, the key is private to the module, and
a missing provider fails loudly with a useful message instead of a mysterious
\`undefined\`.

### Keys: string vs Symbol

Context keys can be any value. A string like \`'cart'\` works but can collide —
a library you install might use the same string. A \`Symbol('cart')\` is unique
by construction, so nobody can overwrite or accidentally read your context.
Since the wrapper module owns the key, consumers never see it either way;
\`Symbol\` just removes the collision risk for free.

### Reactive context: a class with $state fields

\`setContext\` runs **once**, at component init — the value is captured, not
watched. If you set a plain object and later reassign properties, consumers
won't update. The Svelte 5 pattern is to pass a stable reference whose
*insides* are reactive: a class with \`$state\` fields (declared in a
\`.svelte.ts\` file or a component). Every consumer holds the same instance,
and reads of \`cart.items\` are fine-grained reactive.

### Context vs props vs shared modules

- **Props** — the default. Explicit, visible in the component's signature. Use for direct parent → child data.
- **Context** — subtree-scoped. One provider, many consumers, no drilling. Crucially it's **per component tree**: during SSR each request renders its own tree, so per-user data in context never leaks between requests.
- **Module state** (\`export const store = ...\` in a shared \`.svelte.ts\`) — a singleton per JS module. Fine in the browser; **dangerous on the server**, because the Node process serves every request from the same module instance. Twenty years of PHP taught you that statics reset every request — Node's don't. Never put per-user data in module state.
`,

  comparisons: [
    {
      label: "Raw context vs a typed wrapper module",
      intro:
        "Both modules give components a way to share a shopping cart down the tree. The goal is that every consumer agrees on the cart's shape — enforced by the compiler, not by convention.",
      php: `// src/lib/context/cart.js
import { setContext, getContext } from 'svelte';

// A bare string key and no types. Every consumer
// guesses what the value looks like.
export function setCart(cart) {
  setContext('cart', cart);
}

export function getCart() {
  // Returns... something. Callers just hope.
  return getContext('cart');
}`,
      ts: `// src/lib/context/cart.ts
import { setContext, getContext } from 'svelte';

export interface Cart {
  items: string[];
  add(item: string): void;
}

const KEY = Symbol('cart'); // collision-proof, private to this module

export function setCartContext(cart: Cart): Cart {
  return setContext(KEY, cart);
}

export function getCartContext(): Cart {
  const cart = getContext<Cart>(KEY);
  if (!cart) {
    throw new Error('no cart context — call setCartContext in an ancestor');
  }
  return cart;
}`,
      note:
        "getContext<T>() is an unchecked assertion — the wrapper module makes it safe by being the only place the key and the type are ever mentioned.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Consuming the context in a component",
      intro:
        "A deeply nested component adds an item to the shared cart and shows the item count. Same behaviour — but only one version catches the typo before it ships.",
      php: `<!-- src/routes/shop/AddToCart.svelte -->
<script>
  import { getContext } from 'svelte';

  // What shape is this? A string key and a guess.
  const cart = getContext('cart');
</script>

<button onclick={() => cart.add('socks')}>
  <!-- 'itmes' is a typo — it compiles, then crashes in the browser -->
  Add socks ({cart.itmes.length} in cart)
</button>`,
      ts: `<!-- src/routes/shop/AddToCart.svelte -->
<script lang="ts">
  import { getCartContext } from '$lib/context/cart';

  const cart = getCartContext(); // typed as Cart — autocomplete works
</script>

<button onclick={() => cart.add('socks')}>
  <!-- cart.itmes would be a compile error here -->
  Add socks ({cart.items.length} in cart)
</button>`,
      note:
        "The typed helper turns 'runtime crash on a property typo' into a red squiggle in the editor — and documents exactly where the context comes from.",
    },
    {
      label: "Reactive context: plain object vs $state class",
      intro:
        "The cart should update every consumer when an item is added. setContext captures the value once, so reactivity has to live inside the value itself.",
      php: `// src/lib/context/cart-store.js
// A plain object: mutations happen, but no component
// re-renders — the fields aren't reactive.
export function createCart() {
  return {
    items: [],
    add(item) {
      this.items.push(item); // UI never hears about this
    },
  };
}`,
      ts: `// src/lib/context/cart-store.svelte.ts
// A class with $state fields: same instance everywhere,
// but reads of cart.items are fine-grained reactive.
export class CartStore {
  items = $state<string[]>([]);

  add(item: string): void {
    this.items.push(item); // every consumer updates
  }

  get count(): number {
    return this.items.length;
  }
}`,
      note:
        "Pass a stable reference with reactive insides — a $state-backed class in a .svelte.ts file — because setContext runs once and never watches for reassignment.",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature version of the typed-wrapper pattern: createContext<T>() hands back a matched set/get pair sharing one Symbol key and one type. Predict what the child sees, and what happens for the theme that was never set.",
    code: `// Simulating Svelte's context with a Map, to show WHY the wrapper works.
const contextMap = new Map<symbol, unknown>();

function createContext<T>(label: string) {
  const key = Symbol(label); // unique key, private to this closure
  return {
    set(value: T): T {
      contextMap.set(key, value);
      return value;
    },
    get(): T {
      if (!contextMap.has(key)) {
        throw new Error("no '" + label + "' context — did an ancestor set it?");
      }
      return contextMap.get(key) as T; // the ONLY cast, hidden in one place
    },
  };
}

interface Cart {
  items: string[];
  add(item: string): void;
}

const cartContext = createContext<Cart>("cart");
const themeContext = createContext<"light" | "dark">("theme");

// --- "parent component" runs ---
cartContext.set({
  items: [],
  add(item: string) {
    this.items.push(item);
  },
});

// --- "child component", five levels down ---
const cart = cartContext.get(); // typed as Cart, no key in sight
cart.add("TypeScript handbook");
cart.add("SvelteKit stickers");
console.log("cart has", cart.items.length, "items:", cart.items.join(", "));

// Nobody ever set the theme — the helper fails loudly, not with undefined:
try {
  themeContext.get();
} catch (e) {
  console.log("caught:", (e as Error).message);
}`,
  },

  keyPoints: [
    "`getContext<T>(key)` returns whatever `T` you claim — it's an unchecked assertion, so raw context calls scattered through components are a type-safety hole.",
    "Wrap each context in one module: a shared interface, a private `Symbol` key, and `setXContext`/`getXContext` helpers that throw a clear error when the provider is missing.",
    "`Symbol` keys can't collide with strings used elsewhere; since the wrapper owns the key, consumers never touch it anyway.",
    "`setContext` captures the value once — for reactive context, pass a stable class instance with `$state` fields (in a `.svelte.ts` file) and mutate its insides.",
    "Props for parent → child, context for subtree-wide data (per-request-safe under SSR), module state only for truly global, non-user data — Node module singletons outlive the request, unlike PHP statics.",
  ],

  interview: [
    {
      q: "Svelte's context API isn't typed — how do you use it safely in a TypeScript project?",
      a: "I never call `setContext`/`getContext` directly in components. Each context gets a small module exporting an interface, a private `Symbol` key, and a typed pair like `setCartContext(cart: Cart)` / `getCartContext(): Cart`. The one unavoidable assertion — `getContext<Cart>(key)` — lives inside that module, and the getter throws a descriptive error if no ancestor provided the value. Consumers just import a function that's fully typed, so a shape change is a compile error everywhere instead of a runtime surprise.",
    },
    {
      q: "When do you reach for context instead of props or a shared module?",
      a: "Props are my default — explicit and visible in the component signature. Context earns its place when many descendants need the same object and drilling it through layers that don't care would add noise: theme, auth session, a form or map instance. The critical distinction from a shared module is scope: context is per component tree, so during SSR each request gets its own copy — per-user data is safe there. A module-level singleton on the server is shared across all requests in the Node process, which is a data-leak bug waiting to happen. Coming from PHP, that's the mental shift: PHP statics died with the request; Node's don't.",
    },
    {
      q: "How do you make context reactive in Svelte 5?",
      a: "`setContext` runs once at component init and captures the value — it doesn't watch anything. So I pass a stable reference whose internals are reactive: typically a class declared in a `.svelte.ts` file with `$state` fields, e.g. a `CartStore` with `items = $state<string[]>([])` and methods that mutate it. Every consumer holds the same instance, and any read of `cart.items` in a template updates fine-grained when a method mutates it. Reassigning the context value itself after init is the anti-pattern — consumers would never see the new reference.",
    },
  ],

  quiz: [
    {
      question: "What does `getContext<Cart>('cart')` actually guarantee about the returned value?",
      options: [
        "That an ancestor set a value matching the Cart interface",
        "Nothing — the generic is an unchecked assertion by the caller",
        "That the value is deep-cloned so mutations are safe",
        "That the value is reactive",
      ],
      answerIndex: 1,
      explain:
        "The generic on getContext is purely a claim by the caller. Nothing links it to what setContext stored — which is exactly why the typed wrapper-module pattern exists: it puts that one assertion in a single, controlled place.",
    },
    {
      question: "Why is a class with `$state` fields the right shape for a reactive context value?",
      options: [
        "Because setContext only accepts class instances",
        "Because $state only works inside classes",
        "Because setContext captures the value once, so reactivity must live inside a stable reference",
        "Because plain objects can't hold methods in Svelte",
      ],
      answerIndex: 2,
      explain:
        "setContext runs once during component init and never re-runs. Consumers keep the reference they got, so the reference must stay stable while its $state fields provide the reactivity when methods mutate them.",
    },
    {
      question: "You need the logged-in user's data available to many components. Why is a module-level singleton (`export const user = ...`) the wrong choice in SvelteKit?",
      options: [
        "Module exports can't hold objects",
        "On the server the module is shared across all requests, so one user's data can leak to another",
        "Modules can't be imported into .svelte files",
        "It would work, but context is faster",
      ],
      answerIndex: 1,
      explain:
        "A Node server keeps modules alive across requests — unlike PHP, where statics reset every request. Per-user data belongs in locals/load data or in context, both of which are created fresh per request/render tree.",
    },
  ],
};

export default lesson;
