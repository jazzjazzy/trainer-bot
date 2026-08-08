import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "conditional-rendering",
  title: "Conditional Rendering",
  part: "Thinking in React",
  estMinutes: 10,
  summary:
    "JSX has no if statement inside markup — you render conditionally with ternaries, &&, early returns, and extracted variables, with TypeScript narrowing making each branch type-safe.",

  concept: `
In a PHP template you sprinkle \`<?php if (...): ?>\` anywhere. JSX slots take
**expressions**, and \`if\` is a statement — so React conditionals come in four
expression-shaped flavors. Knowing all four, and when each reads best, is
day-one working knowledge.

### 1. Ternary — when both branches render something

\`\`\`tsx
<p>{isLoggedIn ? \`Welcome back, \${user.name}\` : 'Please sign in'}</p>
\`\`\`

The workhorse. Use it when there's a real either/or. Nesting ternaries inside
ternaries is where readability dies — at two levels, switch to flavor 3 or 4.

### 2. \`&&\` — when it's render-or-nothing

\`\`\`tsx
{error && <p className="error">{error.message}</p>}
\`\`\`

JavaScript's \`&&\` returns its left side if falsy, otherwise its right side —
and React renders nothing for \`false\`, \`null\`, and \`undefined\`. So a falsy
left side means "skip it".

**The footgun**: React *does* render numbers. PHP has trained you that \`0\` is
falsy — and it is here too, which is exactly the problem:

\`\`\`tsx
{cart.items.length && <Cart items={cart.items} />}
// items.length === 0  →  the expression is 0  →  page shows a literal "0"
\`\`\`

An empty cart renders a stray **0** on screen. The classic React bug. Fix: put
a real boolean on the left — \`cart.items.length > 0 && ...\` — or use a
ternary with \`: null\`.

### 3. Early return — when a whole component has modes

\`\`\`tsx
function Dashboard({ user }: { user: User | null }) {
  if (user === null) return <LoginPrompt />;
  if (user.suspended) return null;   // render nothing at all

  return <main>Welcome, {user.name}</main>;
}
\`\`\`

Statements are fine *before* the JSX — a component is just a function.
Returning \`null\` is the official way to render nothing; React treats it as
"this component produces no output" (the component still runs, it just emits
nothing).

### 4. Extracted variable — when logic gets real

\`\`\`tsx
let banner: ReactNode = null;
if (isTrial) banner = <TrialBanner daysLeft={daysLeft} />;
else if (isPastDue) banner = <PaymentWarning />;

return <header>{banner}<Nav /></header>;
\`\`\`

Full \`if/else if\` chains, \`switch\` statements, whatever — compute the JSX
into a variable with ordinary statements, then drop the value into the markup.
This is the readable escape hatch from nested ternaries.

### TypeScript narrows every branch

Here conditionals stop being just control flow and become **type refinement**.
Given \`user: User | null\`, writing \`user.name\` is a compile error — until
you check:

\`\`\`tsx
{user !== null ? <p>{user.name}</p> : <LoginLink />}
//                     ^ user: User here — narrowed by the check
\`\`\`

The same works with early returns (\`if (!user) return ...\` — below that
line, \`user\` is \`User\`), with \`&&\`, and with discriminated unions
(\`status.kind === 'error'\` narrows to the error variant). The conditional
rendering you were going to write anyway doubles as the null-safety proof the
compiler demands — where PHP would have let \`$user->name\` fatal at runtime
on a null.
`,

  comparisons: [
    {
      label: "If/else in the template",
      intro:
        "Greet a logged-in user or show a login link, plus an admin-only badge. PHP uses template if-blocks; TSX uses a ternary and a boolean-guarded &&.",
      php: `<?php // header.php ?>
<?php if ($user !== null): ?>
  <p>Welcome, <?= htmlspecialchars($user['name']) ?></p>
  <?php if ($user['is_admin']): ?>
    <span class="badge">admin</span>
  <?php endif; ?>
<?php else: ?>
  <a href="/login">Sign in</a>
<?php endif; ?>`,
      ts: `// Header.tsx
interface User {
  name: string;
  isAdmin: boolean;
}

function Header({ user }: { user: User | null }) {
  return (
    <header>
      {user !== null ? (
        <>
          <p>Welcome, {user.name}</p>
          {user.isAdmin && <span className="badge">admin</span>}
        </>
      ) : (
        <a href="/login">Sign in</a>
      )}
    </header>
  );
}`,
      note:
        "Same branching, but the check does double duty: inside the ternary's first branch TypeScript has narrowed `user` from `User | null` to `User`, so `user.name` is provably safe — PHP finds that out at runtime.",
    },
    {
      label: "Show/hide: mutating the DOM vs describing it",
      intro:
        "Toggle an error banner. Vanilla JS finds the node and flips classes/hidden by hand; React includes the element in the description or doesn't.",
      php: `// banner.js — imperative show/hide
const banner = document.querySelector('#error-banner');

function showError(msg) {
  banner.querySelector('.msg').textContent = msg;
  banner.classList.remove('hidden');
}

function clearError() {
  banner.classList.add('hidden');
  // the stale message is still in the DOM, just invisible
}`,
      ts: `// ErrorBanner.tsx — the element exists only when needed
function ErrorBanner({ error }: { error: string | null }) {
  if (error === null) return null; // renders nothing

  return (
    <div className="error-banner">
      <span className="msg">{error}</span>
    </div>
  );
}

// parent: <ErrorBanner error={error} />
// error is state; set it and the banner appears,
// null it and the banner is GONE — not hidden.`,
      note:
        "The imperative version hides a stale node and hopes every code path remembers to toggle it; the React version derives existence from data — no element, no stale content, no forgotten toggle.",
      leftLang: "js",
    },
    {
      label: "The falsy-zero trap",
      intro:
        "Show the cart summary only when it has items. PHP's `if ($count)` habit, translated naively to && in JSX, prints a stray 0.",
      php: `<?php // cart.php — PHP truthiness works fine here
if (count($items)) {
    echo '<p>' . count($items) . ' items in cart</p>';
}
// count() === 0: the if is false, NOTHING is printed.`,
      ts: `// Cart.tsx
// ❌ Naive translation of the PHP habit:
//   {items.length && <p>{items.length} items in cart</p>}
//   With items.length === 0, && evaluates to the NUMBER 0 —
//   and React renders numbers. The page shows: 0

// ✅ Make the left side a real boolean:
function CartSummary({ items }: { items: string[] }) {
  return (
    <div>
      {items.length > 0 && <p>{items.length} items in cart</p>}
    </div>
  );
}`,
      note:
        "React skips rendering false/null/undefined but renders 0 and NaN as text — so guard && with an actual boolean (`length > 0`), not a truthiness check.",
      leftLang: "php",
      rightLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The logic of conditional rendering without the JSX: a renderStatus() over a discriminated union, using early returns, a ternary — and the && zero-trap. Predict all four lines, especially the last.",
    code: `// Conditional rendering logic, minus the JSX. renderStatus() returns the
// "markup" for each state of a discriminated union — including the classic
// && footgun that bites PHP devs who trust truthiness.

type Status =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: number };

function renderStatus(s: Status): string {
  // Early returns handle the easy cases (TS narrows s in each branch):
  if (s.kind === 'loading') return '<p>Loading...</p>';
  if (s.kind === 'error') return \`<p class="err">\${s.message}</p>\`;

  // s is narrowed to { kind: 'ready'; items: number } here.
  // The && trap: with items = 0, \`s.items && ...\` evaluates to 0,
  // and React renders the number 0 as visible text!
  const buggy = s.items && \`<span>\${s.items} items</span>\`;

  // The fix: make the left side a real boolean.
  const fixed = s.items > 0 ? \`<span>\${s.items} items</span>\` : '(nothing)';

  return \`buggy -> \${JSON.stringify(buggy)} | fixed -> \${fixed}\`;
}

console.log(renderStatus({ kind: 'loading' }));
console.log(renderStatus({ kind: 'error', message: 'API unreachable' }));
console.log(renderStatus({ kind: 'ready', items: 3 }));
console.log(renderStatus({ kind: 'ready', items: 0 })); // spot the 0`,
  },

  keyPoints: [
    "JSX braces take expressions, not statements — so conditionals are ternaries, `&&`, early returns before the JSX, or JSX computed into a variable.",
    "Ternary for either/or; `&&` for render-or-nothing; early returns for whole-component modes; an extracted variable when the logic outgrows one line.",
    "The `&&` footgun: React renders numbers, so `{items.length && <Cart />}` shows a literal 0 for an empty list — guard with `items.length > 0` or a ternary.",
    "React renders nothing for `false`, `null`, and `undefined`; returning `null` from a component is the official way to render nothing.",
    "Conditional checks double as TypeScript narrowing: after `if (user === null) return ...`, `user.name` is provably safe — the null crash PHP finds at runtime is a compile error here.",
    "Prefer conditional existence over show/hide mutation: derive whether an element exists from data instead of toggling classes on a stale DOM node.",
  ],

  interview: [
    {
      q: "What are the main ways to render conditionally in React, and when do you use each?",
      a: "Four patterns. A ternary in the JSX for a true either/or — two branches that both render something. The && short-circuit for render-or-nothing — {error && <Banner />} — with the caveat that the left side should be a genuine boolean. Early returns at the top of the component for whole-component modes: if not authorized return null, if loading return a spinner, then the main JSX stays flat and unindented. And for anything more complex — if/else-if chains, switch on a union — I compute the JSX into a variable before the return and interpolate it. The reason it works this way is that JSX slots are expression positions; statements like if can't produce a value, so they live before the return instead.",
    },
    {
      q: "Why does {count && <p>{count} items</p>} sometimes render a 0, and how do you prevent it?",
      a: "Because && returns its left operand when that operand is falsy — so with count === 0 the whole expression evaluates to the number 0, and React renders numbers as text, unlike false or null which render as nothing. So an empty list puts a literal 0 on the page. The fix is to make the left side an actual boolean: count > 0 && ..., or Boolean(count) && ..., or a ternary with an explicit null branch. It's a favorite interview question because it tests whether you know both JavaScript's short-circuit semantics and React's rendering rules — and it's especially sneaky for PHP developers, because in PHP an if(0) genuinely outputs nothing.",
    },
    {
      q: "How does TypeScript narrowing interact with conditional rendering?",
      a: "The same check that decides what to render also refines the type, so one condition does two jobs. With user: User | null, accessing user.name is a compile error until I've checked — but the moment I write if (!user) return <LoginPrompt />, everything below treats user as User. The same happens inside a ternary's branches, after &&, and with discriminated unions: checking status.kind === 'error' narrows status so status.message is available only in that branch. In practice this means the loading/error/empty states I should be rendering anyway are enforced by the compiler — I literally cannot reach into the success data without having handled the other variants.",
    },
  ],

  quiz: [
    {
      question:
        "items is an empty array. What does {items.length && <Cart />} render?",
      options: [
        "Nothing — 0 is falsy so React skips it",
        "The text '0', because && yields the number 0 and React renders numbers",
        "An empty <Cart /> with no items",
        "A runtime error: cannot render a number",
      ],
      answerIndex: 1,
      explain:
        "&& returns its falsy left operand, here the number 0 — and React renders numbers as text (only false, null, and undefined render as nothing). Guard with items.length > 0 or use a ternary with null.",
    },
    {
      question: "What is the official way for a component to render nothing?",
      options: [
        "return '' (an empty string)",
        "return <div style={{ display: 'none' }} />",
        "return null",
        "throw a SkipRender exception",
      ],
      answerIndex: 2,
      explain:
        "Returning null tells React this component produces no output — no node exists in the DOM at all. A hidden div still exists (and can hold stale content); null is cleaner and is the idiomatic pattern.",
    },
    {
      question:
        "Why can't you write `if (loggedIn) { <Dashboard /> } else { <Login /> }` directly inside JSX braces?",
      options: [
        "if is reserved for class components",
        "JSX braces are expression positions and if is a statement — use a ternary, or run the if before the return",
        "You can, but only with the babel-plugin-jsx-control extension",
        "React would render both branches simultaneously",
      ],
      answerIndex: 1,
      explain:
        "A JSX slot must evaluate to a value, like a function argument. Statements don't produce values. The expression form is the ternary; the statement form is fine before the JSX (early return or an extracted variable).",
    },
    {
      question:
        "Given `user: User | null`, why does `{user !== null && <p>{user.name}</p>}` compile without error?",
      options: [
        "React ignores type errors inside JSX",
        "The && check narrows user to User in the right-hand expression, so user.name is type-safe",
        "user.name returns undefined rather than erroring on null",
        "The compiler assumes props are never null",
      ],
      answerIndex: 1,
      explain:
        "TypeScript's control-flow narrowing applies inside JSX expressions: after `user !== null &&`, the right side sees user as User. The render condition and the null-safety proof are the same line of code.",
    },
  ],
};

export default lesson;
