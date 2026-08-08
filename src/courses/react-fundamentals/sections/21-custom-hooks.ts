import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "custom-hooks",
  title: "Custom Hooks: Extracting Reusable Logic",
  part: "Advanced Hooks & Data",
  estMinutes: 12,
  summary:
    "A custom hook is just a function named use* that calls other hooks — it shares stateful logic between components while every call site keeps its own independent state.",

  concept: `
You have written the same three lines in two components: a \`useState\`, a
\`useEffect\` that syncs it somewhere, and a bit of JSON glue. In PHP you would
reach for a trait or a helper class. React's answer is the **custom hook** —
and the anticlimax is the point: a custom hook is *just a function* whose name
starts with \`use\` and whose body calls other hooks. No registration, no API,
no framework magic.

### The rules

- **The name must start with \`use\`** (\`useLocalStorage\`, \`useDebouncedValue\`).
  This is a real convention, not taste: the linter uses the prefix to check the
  Rules of Hooks inside your function, and readers use it to know "this
  function may hold state and must follow hook rules."
- **Hook rules still apply.** Call a custom hook at the top level of a
  component or another hook — never inside \`if\`, loops, or callbacks.
- **Each call is an independent instance.** Two components calling
  \`useLocalStorage('theme', 'dark')\` get *separate* state variables. Custom
  hooks share **logic**, never **state**. This is the opposite of a PHP static
  property or a service registered in a DI container, where one instance's
  state is visible to every consumer.

### Build one: \`useLocalStorage<T>\`

\`\`\`ts
// src/hooks/useLocalStorage.ts
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored !== null ? (JSON.parse(stored) as T) : initial;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
\`\`\`

State, an effect, JSON plumbing — wrapped once, typed once (\`<T>\` flows from
the \`initial\` argument), reused everywhere. The lazy initializer reads
\`localStorage\` only on mount, and the effect re-writes whenever \`value\`
changes. \`as const\` makes the return a *tuple* — \`[T, setter]\` — instead of an
array of \`T | setter\`, so destructuring stays precisely typed.

### Build another: \`useDebouncedValue<T>\`

\`\`\`ts
// src/hooks/useDebouncedValue.ts
import { useState, useEffect } from 'react';

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer); // reset on every keystroke
  }, [value, delay]);

  return debounced;
}
\`\`\`

The component keeps a fast-changing \`query\` in normal state and renders
\`useDebouncedValue(query, 300)\` — a value that only settles after 300ms of
silence. The effect's cleanup does the debouncing: each new \`value\` clears the
previous timer before starting a new one.

### Return-type design: tuple or object?

Return a **tuple** (\`[value, setValue] as const\`) when the hook feels like
\`useState\` — two things the caller will rename at the call site:
\`const [theme, setTheme] = useLocalStorage(...)\`. Return a **named object**
(\`{ data, error, isLoading }\`) when there are three or more results or the
names carry meaning — callers then cherry-pick with destructuring. Both are
common; consistency within a codebase matters more than the choice.
`,

  comparisons: [
    {
      label: "Copy-pasted logic vs one hook",
      intro:
        "Two components both persist a value to localStorage. On the left the state + effect + JSON dance is duplicated in each; on the right it lives once in a hook and each component gets its own independent instance.",
      php: `// ThemePicker.tsx — and the same again in FontSizer.tsx
function ThemePicker() {
  const [theme, setTheme] = useState<string>(() => {
    const stored = localStorage.getItem('theme');
    return stored !== null ? JSON.parse(stored) : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('theme', JSON.stringify(theme));
  }, [theme]);

  return (
    <select value={theme} onChange={(e) => setTheme(e.target.value)}>
      <option>dark</option>
      <option>light</option>
    </select>
  );
}`,
      ts: `// src/hooks/useLocalStorage.ts — written once
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored !== null ? (JSON.parse(stored) as T) : initial;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

// ThemePicker:  const [theme, setTheme] = useLocalStorage('theme', 'dark');
// FontSizer:    const [size, setSize]   = useLocalStorage('fontSize', 16);`,
      note: "Extracting a hook is pure refactoring — cut the hook calls into a use* function and return what the component needs. Each caller still owns separate state.",
      leftLang: "tsx",
      rightLang: "ts",
    },
    {
      label: "PHP trait vs custom hook",
      intro:
        "Sharing reusable behaviour: a PHP trait mixes methods (and often shared static state) into a class; a custom hook packages per-caller state plus the logic around it.",
      php: `<?php
// A trait mixes logic in — but a static cache
// is ONE store shared by every user of the trait.
trait RemembersPreference
{
    private static array $cache = [];

    public function getPref(string $key, mixed $default): mixed
    {
        return self::$cache[$key]
            ?? $_SESSION['prefs'][$key]
            ?? $default;
    }

    public function setPref(string $key, mixed $value): void
    {
        self::$cache[$key] = $value;
        $_SESSION['prefs'][$key] = $value;
    }
}`,
      ts: `// src/hooks/usePreference.ts
import { useLocalStorage } from './useLocalStorage';

// Each component that calls this gets its OWN state.
// Sidebar's copy updating does not touch Header's copy —
// hooks share logic, never state.
export function usePreference<T>(key: string, fallback: T) {
  const [pref, setPref] = useLocalStorage<T>(\`pref:\${key}\`, fallback);
  return { pref, setPref };
}

// In Sidebar:  const { pref } = usePreference('density', 'cozy');
// In Header:   const { pref } = usePreference('density', 'cozy');
// Two independent instances of the same logic.`,
      note: "A trait's static state is a singleton visible to all consumers; a hook instantiates fresh state per call site. If you WANT shared state across components, that is context or a store — not a custom hook alone.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The framework-free core of useDebouncedValue: a debounce() helper built on setTimeout/clearTimeout. Six rapid calls go in — predict which ones actually fire before you run it.",
    code: `// The framework-free core of useDebouncedValue: a debounce() helper.
// Every call resets the timer; the wrapped function only fires after
// \`ms\` of silence. Predict which of the calls actually fire.

function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    clearTimeout(timer); // cancel the pending run
    timer = setTimeout(() => fn(...args), ms); // schedule a new one
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let fired = 0;
const search = debounce((q: string) => {
  fired++;
  console.log(\`FIRED -> search("\${q}")\`);
}, 100);

console.log('typing fast: "r", "re", "rea" (no pause between)');
search('r');
search('re');
search('rea');
await sleep(150); // user pauses longer than 100ms

console.log('typing again: "react", then "react h" 50ms later');
search('react');
await sleep(50); // shorter than the 100ms window — timer resets
search('react h');
await sleep(150);

console.log(\`calls made: 5, times fired: \${fired}\`);`,
  },

  keyPoints: [
    "A custom hook is a plain function named `use*` that calls other hooks — no registration or special API.",
    "The `use` prefix is load-bearing: it tells the linter to enforce the Rules of Hooks inside, and tells readers the function may hold state.",
    "Custom hooks share logic, not state — every call site gets its own independent `useState`/`useEffect` instances, unlike a PHP trait with static state or a shared service object.",
    "Hook rules still apply to custom hooks: call them at the top level of a component or another hook, never conditionally.",
    "Typed hooks use generics: `useLocalStorage<T>(key, initial: T)` lets the value type flow from the argument to the return.",
    "Return a tuple (`as const`) for useState-like pairs the caller renames; return a named object when there are several results.",
  ],

  interview: [
    {
      q: "What is a custom hook, and what problem does it solve?",
      a: "It's just a JavaScript function whose name starts with `use` and that calls other hooks — that's the entire mechanism. It solves logic duplication: when two components repeat the same state-plus-effect pattern (subscribe to something, persist something, debounce something), you cut that code into a `use*` function and both components call it. The key property is that each call site gets its own independent state — custom hooks share stateful *logic*, never the state itself. Before hooks, this required awkward patterns like higher-order components and render props; a custom hook is a plain function call, so it composes and type-checks naturally.",
    },
    {
      q: "Why must a custom hook's name start with 'use'?",
      a: "It's a contract with the tooling and with other developers. The `eslint-plugin-react-hooks` linter only enforces the Rules of Hooks — top-level calls only, no conditionals or loops — inside functions it recognizes as hooks, and it recognizes them by the `use` prefix. For readers, the prefix signals that the function may call `useState` or `useEffect` internally, so it must itself be called like a hook. Conversely, a function that doesn't call any hooks shouldn't take the prefix — it's just a normal utility function then.",
    },
    {
      q: "If two components call the same custom hook, do they share state? How does that compare to something like a PHP service class?",
      a: "No — each call creates a completely independent instance of the hook's state. If `Sidebar` and `Header` both call `useLocalStorage('theme', 'dark')`, they each hold their own state variable; setting one does not re-render the other. That's the opposite of a PHP service resolved from a DI container or a trait with a static property, where all consumers see one shared instance. If I actually need shared, synchronized state across components, a custom hook alone isn't enough — I'd lift the state up, put it in context, or use an external store, and the custom hook can then wrap *reading* that shared source.",
    },
  ],

  quiz: [
    {
      question: "What makes a function a custom hook, as far as React is concerned?",
      options: [
        "It must be registered with React.registerHook before use",
        "It extends a React.Hook base class",
        "It is a function whose name starts with 'use' and that calls other hooks",
        "It must be defined in a file ending in .hook.ts",
      ],
      answerIndex: 2,
      explain:
        "There is no registration or base class — a custom hook is a plain function following the naming convention and the Rules of Hooks. The 'use' prefix is what lets the linter and other developers treat it as a hook.",
    },
    {
      question:
        "Sidebar and Header both call useLocalStorage('theme', 'dark'). Sidebar calls its setter. What happens in Header?",
      options: [
        "Header re-renders with the new theme, because the hook shares its state",
        "Nothing — Header has its own independent state instance",
        "Header throws, because two components may not use the same key",
        "Header updates only after a full page reload",
      ],
      answerIndex: 1,
      explain:
        "Each call to a custom hook creates independent state — hooks share logic, not state. Both components wrote to the same localStorage key, but Header's in-memory state doesn't know that; syncing them would need context, a store, or a storage event listener.",
    },
    {
      question: "When is returning a named object from a custom hook better than a tuple?",
      options: [
        "Always — tuples are deprecated in React 19",
        "When the hook returns several values whose names carry meaning, so callers can destructure the ones they need",
        "Never — hooks must mirror useState's return shape",
        "Only when the hook is generic",
      ],
      answerIndex: 1,
      explain:
        "Both shapes are idiomatic. Tuples shine for useState-like pairs the caller will rename ([theme, setTheme]); named objects scale better past two values ({ data, error, isLoading }) because position no longer matters.",
    },
  ],
};

export default lesson;
