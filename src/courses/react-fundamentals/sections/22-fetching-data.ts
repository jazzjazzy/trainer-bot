import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "fetching-data",
  title: "Fetching Data in Components",
  part: "Advanced Hooks & Data",
  estMinutes: 13,
  summary:
    "In React the component renders first and the data arrives later — so loading and error are first-class states, and the fetch effect must guard against races and post-unmount updates.",

  concept: `
Twenty-five years of PHP taught you one order of operations: fetch the data,
*then* render the template. By the time \`echo\` runs, \`$user\` exists. React
inverts this. The component renders **immediately** — before any network
request completes — and the data arrives on some later render. "Loading" is
not an edge case; it is the *first thing every user sees*. Model it as real
state, not an afterthought.

### One state, three shapes

Three separate \`useState\` calls (\`data\`, \`loading\`, \`error\`) invite impossible
combinations — \`loading: false\` with neither data nor error. A discriminated
union makes illegal states unrepresentable:

\`\`\`ts
type FetchState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: T };
\`\`\`

Switch on \`status\` and TypeScript narrows: inside the \`'success'\` branch,
\`state.data\` exists and nowhere else. This is the same discipline as a PHP
enum-backed value object, applied to async UI.

### The canonical fetch effect

\`\`\`tsx
function UserProfile({ userId }: { userId: number }) {
  const [state, setState] = useState<FetchState<User>>({ status: 'loading' });

  useEffect(() => {
    let ignore = false;
    setState({ status: 'loading' });

    fetch(\`/api/users/\${userId}\`)
      .then((res) => {
        if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
        return res.json() as Promise<User>;
      })
      .then((data) => { if (!ignore) setState({ status: 'success', data }); })
      .catch((error) => { if (!ignore) setState({ status: 'error', error }); });

    return () => { ignore = true; };
  }, [userId]);
  // ...render by switching on state.status
}
\`\`\`

The dependency array is \`[userId]\`: when the prop changes, the effect re-runs
and fetches the new user. That re-run is exactly where the bugs live.

### Bug 1: the race condition

The user views profile 1 (slow response), then clicks profile 2 (fast
response). Two requests are now in flight. Response 2 lands first and sets
state; response 1 lands *later* and overwrites it. The screen shows user 1
under user 2's URL. HTTP responses are not required to arrive in request
order — without a guard, **last response wins**, not last request.

The \`ignore\` flag fixes it: when \`userId\` changes, React runs the *previous*
effect's cleanup before the new effect. Cleanup flips that closure's
\`ignore\` to \`true\`, so the stale response is discarded when it finally lands.
The stronger version aborts the request entirely:

\`\`\`ts
useEffect(() => {
  const controller = new AbortController();
  fetch(\`/api/users/\${userId}\`, { signal: controller.signal })
    .then(/* ... */)
    .catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      /* real error handling */
    });
  return () => controller.abort();
}, [userId]);
\`\`\`

### Bug 2: setState after unmount

Same shape, different trigger: the user navigates away while the request is in
flight, the component unmounts, the response lands, and the \`.then\` calls a
setter on a component that no longer exists. The update is silently dropped —
it's dead code masquerading as working code, and often a symptom of a missing
cleanup. The same \`ignore\` flag / \`AbortController\` cleanup covers it, because
React also runs cleanup on unmount.

### Extract it: \`useUser(id)\`

All of that is reusable logic with per-caller state — exactly what a custom
hook is for:

\`\`\`ts
function useUser(userId: number): FetchState<User> {
  const [state, setState] = useState<FetchState<User>>({ status: 'loading' });
  useEffect(() => {
    let ignore = false;
    setState({ status: 'loading' });
    fetch(\`/api/users/\${userId}\`)
      .then((res) => res.ok ? (res.json() as Promise<User>) : Promise.reject(new Error(\`HTTP \${res.status}\`)))
      .then((data) => { if (!ignore) setState({ status: 'success', data }); })
      .catch((error) => { if (!ignore) setState({ status: 'error', error }); });
    return () => { ignore = true; };
  }, [userId]);
  return state;
}
\`\`\`

The component collapses to \`const state = useUser(userId)\` plus a render
switch. Keep this hook in mind — it is the "before" picture for the next
section, where a library replaces it.
`,

  comparisons: [
    {
      label: "Fetch-then-render vs render-then-fetch",
      intro:
        "A user profile page. PHP gathers the data before a single byte of HTML exists; the React component renders instantly and fills in the data when it arrives.",
      php: `<?php
// profile.php — data exists BEFORE the template runs
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$_GET['id']]);
$user = $stmt->fetch();

if (!$user) {
    http_response_code(404);
    require 'views/not-found.php';
    exit;
}

// By the time we render, $user is guaranteed to exist.
require 'views/profile.php';
// <h1><?= htmlspecialchars($user['name']) ?></h1>`,
      ts: `// UserProfile.tsx — renders FIRST, data arrives later
function UserProfile({ userId }: { userId: number }) {
  const state = useUser(userId); // FetchState<User>

  switch (state.status) {
    case 'loading':
      return <p>Loading…</p>;          // the FIRST render, always
    case 'error':
      return <p role="alert">{state.error.message}</p>;
    case 'success':
      return <h1>{state.data.name}</h1>;
  }
}`,
      note: "PHP has no loading state because the browser is still waiting for the whole page; in React the shell is already on screen, so 'no data yet' is a state you must render deliberately.",
    },
    {
      label: "Naive fetch effect vs race-safe effect",
      intro:
        "The same effect keyed on userId. On the left, whichever response lands last wins — even if it belongs to a userId the user has already navigated away from. On the right, cleanup marks the old request stale.",
      php: `// Naive: works in the demo, loses the race in production
useEffect(() => {
  setState({ status: 'loading' });

  fetch(\`/api/users/\${userId}\`)
    .then((res) => res.json() as Promise<User>)
    .then((data) => {
      // If userId changed while this was in flight,
      // this STALE response still overwrites state.
      setState({ status: 'success', data });
    });
}, [userId]);`,
      ts: `// Race-safe: cleanup invalidates the previous request
useEffect(() => {
  let ignore = false;
  setState({ status: 'loading' });

  fetch(\`/api/users/\${userId}\`)
    .then((res) => res.json() as Promise<User>)
    .then((data) => {
      if (!ignore) setState({ status: 'success', data });
    });

  return () => {
    ignore = true; // runs before the next effect AND on unmount
  };
}, [userId]);`,
      note: "React runs the previous effect's cleanup before re-running it for a new userId — each request closes over its own ignore flag, so only the latest one may write state. AbortController goes further and cancels the network call itself.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The race, simulated: profile 1 is requested first but responds slowly; profile 2 is requested second and responds fast. Run the naive version, then the cleanup version — watch which response 'wins' each time.",
    code: `// Simulating the fetch race. The user opens profile 1 (slow network),
// then quickly clicks profile 2 (fast response). Which name ends up
// on screen? First the naive version, then the effect-cleanup version.

type User = { id: number; name: string };

function fakeFetch(id: number, delayMs: number): Promise<User> {
  return new Promise((resolve) =>
    setTimeout(() => resolve({ id, name: \`User #\${id}\` }), delayMs),
  );
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let screen = '(empty)';

// ── Naive: every response writes to state, whenever it lands ──
console.log('--- naive effect ---');
async function naiveEffect(id: number, delayMs: number) {
  const user = await fakeFetch(id, delayMs);
  screen = user.name;
  console.log(\`response for id=\${id} landed -> screen shows "\${screen}"\`);
}
naiveEffect(1, 120); // requested first, resolves LAST
naiveEffect(2, 40); // requested last, resolves first
await sleep(200);
console.log(\`final screen: "\${screen}"  <- WRONG: user 2 was requested last\`);

// ── Race-safe: cleanup flips an \`ignore\` flag, exactly like useEffect ──
console.log('--- effect with cleanup ---');
function safeEffect(id: number, delayMs: number): () => void {
  let ignore = false;
  fakeFetch(id, delayMs).then((user) => {
    if (ignore) {
      console.log(\`response for id=\${id} landed -> IGNORED (stale)\`);
      return;
    }
    screen = user.name;
    console.log(\`response for id=\${id} landed -> screen shows "\${screen}"\`);
  });
  return () => {
    ignore = true; // the cleanup function
  };
}

const cleanup1 = safeEffect(1, 120);
cleanup1(); // deps changed: React runs the old effect's cleanup...
safeEffect(2, 40); // ...then the new effect
await sleep(200);
console.log(\`final screen: "\${screen}"  <- correct\`);`,
  },

  keyPoints: [
    "PHP fetches then renders; React renders then fetches — 'loading' is the first state every data-driven component shows.",
    "Model async state as one discriminated union (`loading | error | success`) so impossible combinations like 'not loading, no data, no error' cannot exist.",
    "Fetch in `useEffect` keyed on the query inputs (`[userId]`) — a new id re-runs the effect for the new data.",
    "Race condition: responses can land out of request order, so an unguarded effect shows stale data. Fix with an `ignore` flag flipped in cleanup, or an `AbortController` that cancels the request.",
    "Cleanup also runs on unmount, which prevents setting state on a component that no longer exists.",
    "Extract the whole pattern into a custom hook like `useUser(id)` — the component keeps only the render switch.",
  ],

  interview: [
    {
      q: "Walk me through fetching data in a React component with useEffect. What can go wrong?",
      a: "I hold the request state in a discriminated union — `{ status: 'loading' } | { status: 'error'; error } | { status: 'success'; data }` — so the UI can only be in a representable state. The effect depends on the query inputs, say `[userId]`, sets loading, fetches, and writes success or error. Two classic bugs: first, a race — if the user changes `userId` while a request is in flight, the slow stale response can land after the fast fresh one and overwrite it, because responses don't arrive in request order. Second, resolving after unmount and calling a setter on a dead component. Both are fixed in cleanup: either flip an `ignore` flag that each request closes over, or abort the request with `AbortController`. React runs cleanup before every re-run and on unmount, which is exactly the two moments a request becomes stale.",
    },
    {
      q: "Why is a discriminated union better than separate loading/error/data state variables?",
      a: "Separate booleans allow states that should be impossible — `loading: true` while data is set, or `loading: false` with neither data nor error — and every render has to defensively handle those combinations. A union like `{ status: 'loading' } | { status: 'error'; error: Error } | { status: 'success'; data: T }` makes the machine explicit: exactly one status at a time, and TypeScript narrows so `state.data` is only accessible inside the success branch. It's the same idea as replacing a cluster of nullable properties in PHP with an enum-driven value object. It also means state transitions are atomic — one `setState` moves you between whole states, not three setters that can be interleaved.",
    },
    {
      q: "How does the ignore-flag pattern actually prevent the race condition?",
      a: "Each run of the effect creates a fresh closure with its own `let ignore = false`, and returns a cleanup that sets that flag to true. When the dependency changes, React runs the *old* effect's cleanup before starting the new effect — so the request from the old run is marked stale while the new run starts with a clean flag. When the stale response eventually resolves, its `.then` sees `ignore === true` and does nothing; only the latest run can ever write state. `AbortController` is the stronger version: cleanup calls `controller.abort()`, which rejects the fetch with an `AbortError` and actually frees the connection, rather than letting the response complete and discarding it.",
    },
  ],

  quiz: [
    {
      question:
        "A component fetches on [userId]. The user switches from user 1 (slow response) to user 2 (fast response). Without a guard, what does the screen show once both responses land?",
      options: [
        "User 2 — React ignores responses from previous renders automatically",
        "User 1 — the slower, stale response landed last and overwrote state",
        "An error — two concurrent fetches throw",
        "User 2, but only in development mode",
      ],
      answerIndex: 1,
      explain:
        "Nothing ties a response to the render that requested it — last response to land wins. The stale user-1 response resolves after user 2's and overwrites state. Cleanup (ignore flag or AbortController) is what discards the stale response.",
    },
    {
      question: "When does React run a fetch effect's cleanup function?",
      options: [
        "Only when the component unmounts",
        "After every successful fetch",
        "Before the effect re-runs due to a dependency change, and on unmount",
        "Only when the fetch rejects",
      ],
      answerIndex: 2,
      explain:
        "Cleanup runs at exactly the two moments a request becomes stale: right before the effect re-runs for new deps, and when the component unmounts. That's why one cleanup fixes both the race condition and the setState-after-unmount problem.",
    },
    {
      question: "Why model fetch state as a discriminated union rather than three useState calls?",
      options: [
        "It reduces the number of re-renders",
        "It prevents impossible state combinations and lets TypeScript narrow data/error by status",
        "useState may only be called once per component",
        "Unions are required for useEffect dependencies",
      ],
      answerIndex: 1,
      explain:
        "One union field means exactly one status at a time — no 'finished loading but no data and no error' limbo — and switching on status narrows the type so data is only reachable in the success branch. Render performance is unrelated.",
    },
  ],
};

export default lesson;
