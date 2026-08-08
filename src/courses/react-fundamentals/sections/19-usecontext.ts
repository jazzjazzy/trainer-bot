import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "usecontext",
  title: "Sharing Data with Context",
  part: "Advanced Hooks & Data",
  estMinutes: 12,
  summary:
    "Context lets a component tree read app-wide data — theme, user, locale — without threading props through every layer, with React 19's <Context value={...}> as the provider.",

  concept: `
Props flow parent → child, one level at a time. That's usually a feature —
data flow you can trace with your eyes. But some values are needed *everywhere*:
the current theme, the logged-in user, the locale. Passing those through five
layers of components that never use them is **prop drilling**, and it's the
same pain as threading \`$user\` through every PHP function signature just so
a helper five calls deep can read it. Context is React's answer: a value a
subtree can *subscribe to* directly — a typed, scoped DI container rather
than a \`global\`.

### Creating and providing

\`\`\`tsx
// theme-context.ts
type Theme = 'light' | 'dark';
const ThemeContext = createContext<Theme>('light'); // typed default
\`\`\`

The default is used only when a component reads the context with **no
provider above it**. To supply a real value, render the context itself as a
wrapper — in React 19 the context object *is* the provider:

\`\`\`tsx
<ThemeContext value={theme}>
  <Dashboard />
</ThemeContext>
\`\`\`

\`<ThemeContext.Provider value={...}>\` is the legacy spelling — you'll see it
in most existing code, but new code uses the direct form.

### Reading

\`\`\`tsx
const theme = useContext(ThemeContext); // nearest provider above, else default
\`\`\`

\`useContext\` follows hook rules (top level only). React 19 also offers
\`use(ThemeContext)\`, which does the same read but *may* be called inside
conditionals and loops — handy for early-return components.

### The standard pattern: custom provider + custom hook

Real apps almost never export a raw context. They export a provider component
that owns the state, and a hook that fails loudly outside it:

\`\`\`tsx
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  return <AuthContext value={{ user, setUser }}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx; // narrowed: AuthValue, not AuthValue | null
}
\`\`\`

The \`null\` default plus the throwing hook gives you a runtime guard *and* a
narrowed type — consumers never deal with \`| null\`.

### The cost: every consumer re-renders

When a provider's \`value\` changes (\`Object.is\` comparison), **every
component reading that context re-renders** — even if it only uses one field
of a large object, and even if \`React.memo\`'d ancestors skipped. Two
consequences:

1. **Don't stuff frequently-changing state into one giant AppContext** — a
   keystroke in a search box shouldn't re-render everything reading the
   current user. Split contexts by change-frequency (ThemeContext,
   AuthContext, ...).
2. An inline \`value={{ user, setUser }}\` is a new object every provider
   render — memoize it (\`useMemo\`) if the provider re-renders often.

And before reaching for context at all: **composition is often enough**.
Passing components as \`children\` means intermediate layout components never
see the data, which removes much of the drilling that tempts people into
context.
`,

  comparisons: [
    {
      label: "Prop drilling vs provider + hook",
      intro:
        "The avatar in the header needs the current user, three levels down from where the user is known. On the left, every intermediate component carries a prop it never uses.",
      php: `// ❌ user threaded through components that ignore it
function App({ user }: { user: User }) {
  return <Layout user={user} />;
}

function Layout({ user }: { user: User }) {
  // Layout doesn't use user — it's just a courier
  return <Header user={user} />;
}

function Header({ user }: { user: User }) {
  // Header doesn't use it either
  return <Avatar user={user} />;
}

function Avatar({ user }: { user: User }) {
  return <img src={user.avatarUrl} alt={user.name} />;
}`,
      ts: `// ✅ provider at the top, hook at the point of use
function App({ user }: { user: User }) {
  return (
    <UserContext value={user}>
      <Layout />
    </UserContext>
  );
}

function Layout() {
  return <Header />;   // no user prop
}

function Header() {
  return <Avatar />;   // no user prop
}

function Avatar() {
  const user = useUser(); // throws outside the provider
  return <img src={user.avatarUrl} alt={user.name} />;
}`,
      note: "Layout and Header no longer change signature when Avatar's needs change — but consumers now depend on an invisible provider, so keep context for genuinely app-wide values, not as a props replacement.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
    {
      label: "PHP global / service locator vs typed context",
      intro:
        "A deeply nested helper needs the current user. The PHP habit reaches for a global or a static locator; React scopes the same idea to a component subtree with a compile-time type.",
      php: `<?php
// Anywhere, invisibly coupled to bootstrap order:
function renderAvatar(): string {
    $user = $GLOBALS['currentUser'];          // or:
    $user = Container::get('user');           // service locator

    // Nothing guarantees 'user' is bound, or what
    // type it is — failures happen at runtime,
    // and tests must mutate global state.
    return '<img src="' . $user->avatarUrl . '">';
}`,
      ts: `// React: same convenience, but scoped and typed
const UserContext = createContext<User | null>(null);

export function useUser(): User {
  const user = useContext(UserContext);
  if (user === null) {
    throw new Error('useUser must be used inside <UserContext>');
  }
  return user; // User — the null case is handled once, here
}

// Scope is explicit: only descendants of
// <UserContext value={user}> can read it, and a test
// just wraps the component in a provider with a fake user.`,
      note: "Context is a DI container scoped to a subtree: the dependency is typed, the unbound case throws with a clear message, and tests inject fakes by wrapping in a provider instead of mutating globals.",
      leftLang: "php",
      rightLang: "tsx",
    },
    {
      label: "Provider syntax: legacy .Provider vs React 19",
      intro:
        "Both provide a theme to a subtree. React 19 lets the context object render directly as the provider.",
      php: `// ❌ legacy spelling (React ≤18, still everywhere)
const ThemeContext = createContext<Theme>('light');

function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  return (
    <ThemeContext.Provider value={theme}>
      <Dashboard />
    </ThemeContext.Provider>
  );
}`,
      ts: `// ✅ React 19 — the context IS the provider
const ThemeContext = createContext<Theme>('light');

function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  return (
    <ThemeContext value={theme}>
      <Dashboard />
    </ThemeContext>
  );
}`,
      note: "Same semantics, less ceremony: in React 19 <ThemeContext value={...}> renders a provider; .Provider remains for backwards compatibility and is what you'll see in older codebases.",
      leftLang: "tsx",
      rightLang: "tsx",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Read and predict: a theme provider over a nested tree where the middle layer is memo'd. Which components log 'render' when the button toggles the theme?",
    code: `type Theme = 'light' | 'dark';
const ThemeContext = createContext<Theme>('light');

function App() {
  const [theme, setTheme] = useState<Theme>('light');
  console.log('render: App');
  return (
    <ThemeContext value={theme}>
      <button onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}>
        toggle
      </button>
      <Layout />
    </ThemeContext>
  );
}

const Layout = memo(function Layout() {
  console.log('render: Layout');
  return <Sidebar />;
});

function Sidebar() {
  console.log('render: Sidebar');
  return <ThemeBadge />;
}

function ThemeBadge() {
  const theme = useContext(ThemeContext);
  console.log('render: ThemeBadge');
  return <span>{theme}</span>;
}`,
    output: `Mount logs, in order:
render: App
render: Layout
render: Sidebar
render: ThemeBadge
(the badge shows "light")

Click "toggle" — logs:
render: App
render: ThemeBadge
(the badge now shows "dark")

Why: setTheme re-renders App. Layout is memo'd and receives no props, so it
(and therefore Sidebar) is skipped. But context bypasses the memo wall:
ThemeBadge subscribes to ThemeContext, whose value changed, so React
re-renders it anyway — consumers update even under skipped ancestors.`,
  },

  keyPoints: [
    "Context solves prop drilling for genuinely app-wide values (theme, current user, locale) — it's a typed DI container scoped to a subtree, not a general props replacement.",
    "`createContext<T>(default)` — the default only applies when no provider exists above the reader; a `null` default plus a throwing custom hook gives a runtime guard and a narrowed type.",
    "React 19: render the context itself as the provider — `<ThemeContext value={theme}>`; `<ThemeContext.Provider>` is the legacy spelling.",
    "Read with `useContext(Ctx)` at the top level; React 19's `use(Ctx)` does the same read but may sit inside conditionals and loops.",
    "Every consumer re-renders when the provider's value changes (`Object.is`) — split contexts by change-frequency and memoize object values instead of building one giant AppContext.",
    "Before adding context, try composition: passing ready-made components as `children` often removes the drilling entirely.",
  ],

  interview: [
    {
      q: "When would you use context instead of props, and what are its trade-offs?",
      a: "Props are my default — they're explicit and traceable. I reach for context when a value is needed by many components at many depths and threading it through layers that never use it just adds noise: theme, authenticated user, locale, a feature-flag client. Coming from PHP, it's the difference between passing `$user` through every function signature and registering it once in a DI container — except context is scoped to a subtree and typed. The trade-offs: consumers now depend on an invisible provider, so I pair every context with a custom hook that throws a clear error outside it; and every consumer re-renders when the value changes, so I keep contexts small and split by how often they change. Often composition — passing components as children — removes the drilling without any context at all.",
    },
    {
      q: "What changed about providing context in React 19?",
      a: "The context object itself now renders as a provider: `<ThemeContext value={theme}>...</ThemeContext>`. Previously you had to render `<ThemeContext.Provider value={...}>`; that spelling still works and dominates existing codebases, but it's the legacy form. Reading is unchanged — `useContext(ThemeContext)` returns the nearest provider's value or the `createContext` default — and React 19 adds `use(ThemeContext)`, which reads the same way but is allowed inside conditionals and loops, unlike regular hooks. So in a new codebase I'd write the direct provider syntax and mention I'd match the existing style when maintaining older code.",
    },
    {
      q: "A context holds { user, notifications, searchQuery } and the whole app feels slow while typing in the search box. Diagnose it.",
      a: "Classic giant-context problem: every keystroke updates `searchQuery`, which changes the context value, and *every* consumer of that context re-renders — including components that only read `user` and never touch the search. Context has no field-level subscription; the unit of invalidation is the whole value, compared with `Object.is`. The fix is to split by change-frequency: a stable `AuthContext`, and search state either as local state near the search UI (usually it isn't app-wide at all) or its own context. I'd also check the provider isn't creating a fresh object literal in `value={{...}}` on every render, which invalidates consumers even when nothing actually changed — that gets a `useMemo`.",
    },
  ],

  quiz: [
    {
      question:
        "In React 19, what's the current way to provide a context value to a subtree?",
      options: [
        "<ThemeContext.Provider value={theme}> — the only supported syntax",
        "<ThemeContext value={theme}> — the context object renders directly as a provider",
        "ThemeContext.setValue(theme) before rendering",
        "useContext(ThemeContext, theme) in the parent",
      ],
      answerIndex: 1,
      explain:
        "React 19 lets you render the context itself with a value prop; <ThemeContext.Provider> still works but is the legacy spelling. There's no imperative setter — the value is supplied by rendering.",
    },
    {
      question:
        "When is the default value passed to createContext actually used?",
      options: [
        "Whenever the provider's value is undefined",
        "On the first render, before any provider mounts",
        "Only when a component reads the context with no matching provider anywhere above it",
        "Never — it exists purely for TypeScript inference",
      ],
      answerIndex: 2,
      explain:
        "The default is the no-provider fallback. That's why the null-default + throwing-hook pattern works: reading null means 'you forgot the provider', which the custom hook turns into an immediate, descriptive error.",
    },
    {
      question:
        "A provider's value changes but the consumer's parent is wrapped in React.memo and skips its re-render. What happens to the consumer?",
      options: [
        "It doesn't update until its parent re-renders",
        "It re-renders anyway — context subscription bypasses memo'd ancestors",
        "React warns that memo and context are incompatible",
        "It updates only if the consumer is also wrapped in React.memo",
      ],
      answerIndex: 1,
      explain:
        "Consumers subscribe to the context directly, so a changed value re-renders them even when ancestors bailed out via memo. That's also the warning label: EVERY consumer re-renders on every value change, so keep fast-changing state out of broad contexts.",
    },
    {
      question:
        "Why does the custom-hook pattern use createContext<AuthValue | null>(null) plus a hook that throws on null?",
      options: [
        "null makes the context render faster",
        "It catches a missing provider at runtime with a clear error, and narrows the type so consumers get AuthValue without | null",
        "React requires a null default for object-typed contexts",
        "Throwing forces React to remount the provider",
      ],
      answerIndex: 1,
      explain:
        "Reading null can only mean 'no provider above me', so the hook converts a silent misconfiguration into an immediate, descriptive error — and after the check, TypeScript narrows the return to AuthValue, sparing every consumer a null check.",
    },
  ],
};

export default lesson;
