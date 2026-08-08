import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "usereducer",
  title: "useReducer: State Machines for Complex State",
  part: "Advanced Hooks & Data",
  estMinutes: 13,
  summary:
    "When one piece of state has several interdependent transitions, useReducer consolidates them into a single pure, testable function — and TypeScript's discriminated unions make illegal actions unrepresentable.",

  concept: `
\`useState\` scales badly in one specific direction: **interdependent
updates**. A checkout flow with \`step\`, \`items\`, and \`error\` isn't three
independent values — submitting must clear the error, adding an item must
reset a stale confirmation, and the valid combinations live only in the heads
of whoever wrote the six event handlers that each poke a different setter.

### The reducer idea

Move every transition into **one pure function**:

\`\`\`ts
(state, action) => newState
\`\`\`

The component stops mutating state directly. It **dispatches actions** —
plain objects describing *what happened* — and the reducer decides *how the
state changes*:

\`\`\`tsx
const [state, dispatch] = useReducer(cartReducer, { items: [] });

// in an event handler:
dispatch({ type: 'add', item: { id: 1, name: 'coffee' } });
\`\`\`

If you spent years in PHP controllers, you've written the untyped version of
this: \`if ($_POST['action'] === 'add') {...} elseif (...)\`. A reducer is
that dispatch table with a contract: a closed set of actions, one place where
transitions live, and a compiler checking both.

### The TypeScript sweet spot: discriminated unions

This is where reducers go from "nice pattern" to "why TS interviews love
them":

\`\`\`ts
type CartAction =
  | { type: 'add'; item: { id: number; name: string } }
  | { type: 'remove'; id: number }
  | { type: 'setQty'; id: number; qty: number }
  | { type: 'clear' };
\`\`\`

Inside \`switch (action.type)\`, TypeScript **narrows** each case:
in \`case 'setQty'\` the compiler knows \`action.qty\` exists; in
\`case 'clear'\` it knows nothing else does. Dispatching
\`{ type: 'setQty' }\` without a \`qty\` is a compile error — **illegal
actions are unrepresentable**. And the \`default\` branch buys exhaustiveness:

\`\`\`ts
default: {
  const unhandled: never = action; // add an action type, forget a case →
  return unhandled;                // this line stops compiling
}
\`\`\`

### Rules of the reducer

- **Pure**: no fetches, no \`Date.now()\`, no mutation of the incoming state —
  return a **new** object (same immutability discipline as \`useState\`).
  React may invoke reducers more than once in development (StrictMode) to
  flush out impurity.
- **Testable in isolation**: \`expect(cartReducer(state, action)).toEqual(...)\`
  — no rendering, no mocks, just a function.
- Updates based on previous state are automatic — the reducer *always*
  receives the current state, so the stale-closure worries around
  \`setCount(count + 1)\` disappear.

### Choosing, and where this leads

\`useState\` for independent values; \`useReducer\` when transitions are
coupled, when the next state depends on the previous in nontrivial ways, or
when you want the logic unit-tested. Pair \`useReducer\` with context —
provide \`state\` and \`dispatch\` to a subtree — and you have the "poor man's
Redux": Redux industrialized exactly this pattern (one store, actions,
reducers, devtools) years ago, so learning \`useReducer\` is learning Redux's
core for free.
`,

  comparisons: [
    {
      label: "Three coupled useState calls vs one reducer",
      intro:
        "A checkout flow: adding an item must clear any error, and submitting must validate and advance the step. On the left, the invariants are scattered across handlers; on the right they live in one function.",
      php: `// ❌ Checkout.tsx — invariants smeared across handlers
function Checkout() {
  const [step, setStep] = useState<'cart' | 'pay' | 'done'>('cart');
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addItem = (item: Item) => {
    setItems([...items, item]);
    setError(null);          // ← easy to forget in the next handler
    if (step === 'done') setStep('cart'); // ← and this one
  };

  const submit = () => {
    if (items.length === 0) {
      setError('Cart is empty');
      return;                // three setters to keep consistent,
    }                        // in every handler, forever
    setStep('pay');
    setError(null);
  };
  // ...
}`,
      ts: `// ✅ checkout-reducer.ts — one place owns the transitions
type State = {
  step: 'cart' | 'pay' | 'done';
  items: Item[];
  error: string | null;
};

type Action =
  | { type: 'addItem'; item: Item }
  | { type: 'submit' }
  | { type: 'confirm' };

function checkoutReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'addItem': // adding always clears error, reopens cart
      return { step: 'cart', items: [...state.items, action.item], error: null };
    case 'submit':
      return state.items.length === 0
        ? { ...state, error: 'Cart is empty' }
        : { ...state, step: 'pay', error: null };
    case 'confirm':
      return { ...state, step: 'done' };
  }
}

// Component: const [state, dispatch] = useReducer(checkoutReducer, initial);
// Handlers shrink to dispatch({ type: 'addItem', item }).`,
      note: "The reducer sees the whole state at once, so cross-field invariants ('adding clears the error') are enforced in one place instead of re-remembered in every handler — and the function is unit-testable without rendering anything.",
      leftLang: "tsx",
      rightLang: "ts",
    },
    {
      label: "PHP action branches vs a typed reducer",
      intro:
        "Both handle add/remove/clear commands against a cart. The PHP controller trusts whatever arrives in $_POST; the reducer's action type is a compile-time contract.",
      php: `<?php
// cart-controller.php — stringly-typed dispatch
$cart = $_SESSION['cart'] ?? [];

switch ($_POST['action'] ?? '') {
    case 'add':
        // Hope 'id' and 'name' were posted, and are the
        // right types — nothing checks until it breaks:
        $cart[] = ['id' => $_POST['id'], 'name' => $_POST['name']];
        break;
    case 'remove':
        $cart = array_filter($cart,
            fn($i) => $i['id'] != $_POST['id']);
        break;
    case 'clearr': // typo: silently matches nothing
        break;
}
$_SESSION['cart'] = $cart;`,
      ts: `// cart-reducer.ts — the same dispatch, with a contract
type Action =
  | { type: 'add'; item: { id: number; name: string } }
  | { type: 'remove'; id: number }
  | { type: 'clear' };

function cartReducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case 'add':    // action.item is typed — nothing to "hope"
      return { items: [...state.items, { ...action.item, qty: 1 }] };
    case 'remove': // action.id: number, guaranteed
      return { items: state.items.filter(i => i.id !== action.id) };
    case 'clear':
      return { items: [] };
    default: {
      const unhandled: never = action; // 'clearr' can't even
      return unhandled;                // be dispatched
    }
  }
}`,
      note: "Same shape you've written in controllers for years — but the discriminated union means a typo'd action type or a missing payload field is a compile error, not a silent no-op in production.",
      leftLang: "php",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A full cart reducer over a discriminated union — runnable. Follow the dispatch sequence and predict each logged state (watch the second 'add' of coffee: bump, not duplicate), then run it.",
    code: `// A cart reducer: every state transition in one pure function,
// with a discriminated union making illegal actions unrepresentable.

type CartItem = { id: number; name: string; qty: number };
type CartState = { items: CartItem[] };

type CartAction =
  | { type: 'add'; item: { id: number; name: string } }
  | { type: 'remove'; id: number }
  | { type: 'setQty'; id: number; qty: number }
  | { type: 'clear' };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const existing = state.items.find((i) => i.id === action.item.id);
      if (existing) {
        // Already in the cart: bump quantity immutably.
        return {
          items: state.items.map((i) =>
            i.id === action.item.id ? { ...i, qty: i.qty + 1 } : i,
          ),
        };
      }
      return { items: [...state.items, { ...action.item, qty: 1 }] };
    }
    case 'remove':
      return { items: state.items.filter((i) => i.id !== action.id) };
    case 'setQty':
      return {
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, qty: action.qty } : i,
        ),
      };
    case 'clear':
      return { items: [] };
    default: {
      // Exhaustiveness check: add a new action type and forget a case,
      // and this line becomes a compile error.
      const unhandled: never = action;
      return unhandled;
    }
  }
}

// A stand-in for useReducer's dispatch: run the reducer, keep the result.
let state: CartState = { items: [] };
function dispatch(action: CartAction) {
  state = cartReducer(state, action);
  const summary =
    state.items.map((i) => \`\${i.name} x\${i.qty}\`).join(', ') || '(empty)';
  console.log(\`\${action.type.padEnd(6)} -> \${summary}\`);
}

dispatch({ type: 'add', item: { id: 1, name: 'coffee' } });
dispatch({ type: 'add', item: { id: 2, name: 'beans' } });
dispatch({ type: 'add', item: { id: 1, name: 'coffee' } }); // qty bump, no duplicate
dispatch({ type: 'setQty', id: 2, qty: 5 });
dispatch({ type: 'remove', id: 1 });
dispatch({ type: 'clear' });`,
  },

  keyPoints: [
    "`useReducer(reducer, initialState)` returns `[state, dispatch]`; components dispatch action objects describing *what happened*, and the pure `(state, action) => newState` reducer decides *how state changes*.",
    "Reach for it when transitions are interdependent — the reducer sees the whole state, so cross-field invariants live in one place instead of being repeated across event handlers.",
    "Type actions as a discriminated union on `type`: each `case` narrows the payload, so a wrong or incomplete action is a compile error — illegal actions are unrepresentable.",
    "Get exhaustiveness with `const unhandled: never = action` in `default` — adding an action type without handling it breaks the build.",
    "Reducers must be pure and immutable: no fetches or clocks, always return new state objects; the payoff is trivially unit-testable transition logic.",
    "`useReducer` + context (providing `state` and `dispatch` to a subtree) is the 'poor man's Redux' — Redux industrialized this exact pattern.",
  ],

  interview: [
    {
      q: "When do you choose useReducer over useState?",
      a: "When the updates are interdependent, not just numerous. Three unrelated toggles are fine as three `useState` calls. But when handlers must keep invariants across fields — submitting clears the error, adding an item reopens the cart — each `useState` handler has to re-remember every rule, and they drift. A reducer receives the whole state and returns the whole next state, so those invariants are enforced in exactly one pure function that I can unit-test without rendering: `expect(reducer(state, action)).toEqual(next)`. Two smaller wins: dispatching is always safe against stale closures because the reducer gets the current state, and the component's handlers shrink to one-line `dispatch` calls that describe intent.",
    },
    {
      q: "How does TypeScript make reducers particularly powerful?",
      a: "Through discriminated unions and exhaustiveness checking. I type the actions as a union discriminated on `type` — `{ type: 'setQty'; id: number; qty: number } | { type: 'clear' } | ...` — and inside `switch (action.type)` the compiler narrows each branch, so `action.qty` only exists in the `setQty` case. That makes illegal actions unrepresentable: you literally cannot dispatch `setQty` without a numeric `qty`, and a typo'd type string won't compile. Then in the `default` branch I assign `action` to a `never`-typed constant — if someone later adds an action variant and forgets a case, that assignment becomes a compile error. It's the closest thing React state management has to a compiler-verified state machine.",
    },
    {
      q: "How would you explain the reducer pattern to another PHP developer, and how does it relate to Redux?",
      a: "I'd say: you've already written reducers — every controller with `if ($_POST['action'] === 'add') { ... } elseif (...)` is dispatching stringly-typed actions against session state. `useReducer` is that pattern with a contract: the action set is a closed, typed union instead of whatever arrives in `$_POST`, the transitions live in one pure function instead of scattered branches, and the compiler checks both. Redux is this same idea industrialized — a single store, actions, reducers, middleware, and devtools with time-travel — and it dominated React state management for years. So `useReducer` plus a context providing `state` and `dispatch` down a subtree is genuinely a 'poor man's Redux', and understanding it means Redux codebases read as familiar immediately.",
    },
    {
      q: "What rules must a reducer function follow, and why?",
      a: "It must be pure: same state and action in, same new state out — no fetches, no `Date.now()` or `Math.random()`, and no mutating the incoming state; you return new objects using spreads, `map`, `filter`. Purity is what makes the pattern pay off: React can call the reducer during render, StrictMode deliberately double-invokes it in development to surface impurity, and reconciliation relies on new references to detect change — a mutated-in-place state can look 'unchanged' and skip re-renders. Side effects belong in event handlers or effects; the reducer only computes the next state. The reward is transition logic that's deterministic and testable as a plain function.",
    },
  ],

  quiz: [
    {
      question: "What is the contract of a reducer function?",
      options: [
        "(action) => void — it performs the update imperatively",
        "(state, action) => newState — pure, returning a new state object without mutating the old one",
        "(state) => state — it validates state after each setter call",
        "async (state, action) => newState — it may await fetches before returning",
      ],
      answerIndex: 1,
      explain:
        "A reducer is a pure synchronous function from the current state and an action to the next state. No side effects, no mutation — React relies on purity (StrictMode double-invokes it in dev) and on new references to detect changes.",
    },
    {
      question:
        "With CartAction as a discriminated union, what does TypeScript do inside `case 'setQty':`?",
      options: [
        "Nothing — action stays the full union type in every branch",
        "Narrows action to { type: 'setQty'; id: number; qty: number }, so action.qty is typed and required",
        "Checks the payload at runtime and throws if qty is missing",
        "Requires a cast: (action as SetQtyAction).qty",
      ],
      answerIndex: 1,
      explain:
        "Switching on the discriminant narrows each branch to its variant — action.qty exists (typed number) in that case and nowhere else. It's compile-time only: no runtime validation happens, but no code can dispatch a malformed action in the first place.",
    },
    {
      question:
        "What does `const unhandled: never = action;` in the reducer's default branch achieve?",
      options: [
        "It silences the linter about unused variables",
        "It makes the reducer return undefined for unknown actions",
        "If every action variant has a case, default is unreachable and action is never — add a new variant without a case and this assignment fails to compile",
        "It converts runtime errors into warnings",
      ],
      answerIndex: 2,
      explain:
        "That's the exhaustiveness idiom: when all variants are handled, the narrowed type in default is never, so the assignment type-checks. Add a fifth action type without a case and action narrows to that variant instead — not assignable to never, build breaks, bug caught at compile time.",
    },
    {
      question:
        "Why is 'useReducer + context' described as a poor man's Redux?",
      options: [
        "Because useReducer secretly imports Redux under the hood",
        "Because providing state and dispatch through context gives you Redux's core — one store of state, typed actions, pure reducers — without the library",
        "Because Redux is deprecated in React 19",
        "Because context replaces the need for actions entirely",
      ],
      answerIndex: 1,
      explain:
        "Redux industrialized the reducer pattern: centralized state, dispatched actions, pure reducers, plus middleware and devtools. A context that shares useReducer's state and dispatch reproduces the core architecture — what you give up is the ecosystem (devtools, middleware, selectors with subscription granularity).",
    },
  ],
};

export default lesson;
