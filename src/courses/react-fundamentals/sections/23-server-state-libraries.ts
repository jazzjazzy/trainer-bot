import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "server-state-libraries",
  title: "Server State: Why TanStack Query Exists",
  part: "Advanced Hooks & Data",
  estMinutes: 12,
  summary:
    "Server data is a cache of someone else's state, not client state — TanStack Query gives that cache explicit keys, freshness rules, deduplication, and invalidation that a hand-rolled fetch effect never will.",

  concept: `
The hand-rolled \`useUser(id)\` hook — state union, fetch effect, ignore flag —
is correct. It is also the *floor*, not the ceiling. Ask it to do anything a
real app needs and the answer is "write more code": navigate away and back and
it re-fetches from scratch; mount it in two components and it fires two
identical requests; leave the tab open overnight and it happily shows
yesterday's data forever.

### The insight: server data is a cache

Your \`useState\` holds client state — the open/closed flag of a dropdown, the
draft text of a form. The user list from \`/api/users\` is different in kind:
**you don't own it**. It lives in someone else's database, it can change
without your app knowing, and your copy is a *cache entry* that is stale the
moment it arrives. Twenty years of PHP taught you cache discipline — Redis
keys, opcache, TTLs, invalidation on write. TanStack Query is that same
discipline applied to API responses inside React.

### What a fetch effect never gives you

- **Caching** — revisit a page and the data is there instantly, refreshed in
  the background (stale-while-revalidate).
- **Deduplication** — five components asking for the same data produce one
  request.
- **Background refetch** — refocus the tab or reconnect and fresh data is
  fetched automatically.
- **Retries** — a flaky 500 is retried with backoff before you show an error.
- **Invalidation** — after a mutation, mark related data stale and it refetches.

### Read-level fluency: \`useQuery\`

\`\`\`tsx
import { useQuery } from '@tanstack/react-query';

function UserProfile({ userId }: { userId: number }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['users', userId],       // the cache address
    queryFn: () => fetchUser(userId),  // how to fill it
    staleTime: 60_000,                 // fresh for 1 minute
  });

  if (isPending) return <p>Loading…</p>;
  if (isError) return <p role="alert">{error.message}</p>;
  return <h1>{data.name}</h1>;
}
\`\`\`

The **query key** is the heart of it: a serializable array that addresses one
cache entry, exactly like a Redis key (\`user:42\` → \`['users', 42]\`). Include
every input the request depends on — change \`userId\` and you are addressing a
*different* entry, so the library knows to fetch it. \`staleTime\` (default
\`0\`) says how long an entry counts as fresh: fresh entries are served from
cache with no request; stale entries are served instantly *and* refetched in
the background. Race conditions and request cancellation? Handled internally
— the whole previous section's bug class disappears.

### Writes: \`useMutation\` + invalidation

\`\`\`tsx
const queryClient = useQueryClient();
const addUser = useMutation({
  mutationFn: (draft: NewUser) => postUser(draft),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  },
});
\`\`\`

You never manually re-run fetches after a POST. You *invalidate* the affected
keys — mark them stale — and every mounted component using them refetches.
That is cache invalidation on write, the discipline you already apply when a
PHP admin save calls \`$redis->del("user:42")\`.

### The interview answer

When a panel asks "how do you fetch data in React?" in 2026, the expected
answer is: an effect-based fetch for a one-off, but for real server state, a
server-state library — TanStack Query, or its sibling **SWR** (named after
stale-while-revalidate) — because server data is a cache and the library
manages freshness, dedup, retries, and invalidation. Knowing *why* the library
exists matters more than its option list.
`,

  comparisons: [
    {
      label: "Hand-rolled useUser vs useQuery",
      intro:
        "The same user fetch. The left column is the entire race-safe hook you would maintain by hand; the right column replaces it — plus caching, dedup, retries, and background refetch you did not write.",
      php: `// useUser.ts — correct, and still the floor
type FetchState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: T };

function useUser(userId: number): FetchState<User> {
  const [state, setState] = useState<FetchState<User>>({
    status: 'loading',
  });

  useEffect(() => {
    let ignore = false;
    setState({ status: 'loading' });
    fetch(\`/api/users/\${userId}\`)
      .then((res) =>
        res.ok
          ? (res.json() as Promise<User>)
          : Promise.reject(new Error(\`HTTP \${res.status}\`)),
      )
      .then((data) => { if (!ignore) setState({ status: 'success', data }); })
      .catch((error) => { if (!ignore) setState({ status: 'error', error }); });
    return () => { ignore = true; };
  }, [userId]);

  return state;
}
// No cache: back-navigation refetches. Two callers: two requests.`,
      ts: `// useUser.ts — with @tanstack/react-query
import { useQuery } from '@tanstack/react-query';

function useUser(userId: number) {
  return useQuery({
    queryKey: ['users', userId], // cache address, like user:42 in Redis
    queryFn: async (): Promise<User> => {
      const res = await fetch(\`/api/users/\${userId}\`);
      if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
      return res.json();
    },
    staleTime: 60_000, // serve from cache for 1 min, no request
  });
}

// const { data, isPending, isError, error } = useUser(42);
//
// Included without writing it: caching keyed on ['users', 42],
// dedup across components, retries with backoff, background
// refetch on window focus, and race handling.`,
      note: "The status union survives — useQuery exposes it as isPending/isError/isSuccess — but the cache, deduplication, and refetch policy live in the library, configured per key instead of re-implemented per hook.",
      leftLang: "tsx",
    },
    {
      label: "Manual refetch-after-POST vs invalidateQueries",
      intro:
        "After creating a user, the list must update. On the left the component orchestrates the refetch by hand and only its own copy updates; on the right the mutation invalidates the cache key and every consumer refetches.",
      php: `// Manual: the component re-runs its own fetch
function AddUserForm({ onCreated }: { onCreated: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleSubmit(draft: NewUser) {
    setSaving(true);
    await fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(draft),
    });
    setSaving(false);
    onCreated(); // parent must remember to re-fetch its list...
    // ...and the sidebar's separate user count still shows
    // the old number, because nobody told it anything.
  }
  // ...
}`,
      ts: `// useMutation: invalidate the key, consumers refetch
import { useMutation, useQueryClient } from '@tanstack/react-query';

function AddUserForm() {
  const queryClient = useQueryClient();

  const addUser = useMutation({
    mutationFn: (draft: NewUser) =>
      fetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(draft),
      }),
    onSuccess: () => {
      // Mark everything under ['users'] stale:
      // the list AND the sidebar count refetch on their own.
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  // <button disabled={addUser.isPending} ...>
  // addUser.mutate(draft)
}`,
      note: "invalidateQueries decouples the write from the reads: the form doesn't know who displays users, it just marks the cache keys stale — the same idea as deleting a Redis key after an UPDATE and letting the next read repopulate it.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A mini query cache in ~30 lines: a keyed Map with a staleTime. Two 'components' mount at once (one network request, not two), a third reads while the entry is fresh, and a fourth arrives after expiry. Predict the fetch count before running.",
    code: `// A miniature of TanStack Query's cache: Map keyed by queryKey,
// entries fresh for staleTime ms. Watch which reads hit the network.

type Entry = { promise: Promise<unknown>; updatedAt: number };
const cache = new Map<string, Entry>();
const STALE_TIME = 200; // ms — how long an entry counts as fresh

let fetchCount = 0;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchUser(id: number) {
  fetchCount++;
  console.log(\`    network: GET /api/users/\${id}  (request #\${fetchCount})\`);
  await sleep(30);
  return { id, name: \`User #\${id}\` };
}

function miniQuery<T>(key: string, queryFn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.updatedAt < STALE_TIME) {
    console.log(\`  HIT  \${key} — fresh, no request\`);
    return entry.promise as Promise<T>;
  }
  console.log(\`  MISS \${key} — \${entry ? 'stale, refetching' : 'empty, fetching'}\`);
  const promise = queryFn();
  cache.set(key, { promise, updatedAt: Date.now() });
  return promise;
}

console.log('Sidebar and Header mount together, same key:');
const a = miniQuery('users:1', () => fetchUser(1));
const b = miniQuery('users:1', () => fetchUser(1)); // deduped
console.log(\`  same promise handed to both? \${a === b}\`);
await Promise.all([a, b]);

console.log('100ms later, ProfileCard asks (still fresh):');
await sleep(100);
await miniQuery('users:1', () => fetchUser(1));

console.log('another 150ms later (entry now stale):');
await sleep(150);
await miniQuery('users:1', () => fetchUser(1));

console.log(\`component reads: 4, network requests: \${fetchCount}\`);`,
  },

  keyPoints: [
    "Server data is a cache of state you don't own — it can change without your app knowing, so treat freshness and invalidation as first-class concerns, like Redis keys in PHP.",
    "A hand-rolled fetch effect gives you none of: caching, request deduplication, background refetch, stale-while-revalidate, retries, or mutation-driven invalidation.",
    "`useQuery({ queryKey, queryFn })` — the queryKey is the cache address; include every input the request depends on, and changing it addresses a different entry.",
    "`staleTime` controls freshness: fresh entries are served from cache with no request; stale entries are served instantly and refetched in the background (default staleTime is 0).",
    "Writes go through `useMutation`, and `queryClient.invalidateQueries({ queryKey })` marks affected keys stale so every consumer refetches — no manual re-fetch orchestration.",
    "SWR is the main sibling library; in interviews, 'how do you fetch data in React?' expects the server-state-library answer, not just a useEffect.",
  ],

  interview: [
    {
      q: "What's the difference between client state and server state, and why does it matter?",
      a: "Client state is data my app owns outright — form drafts, open panels, selected tabs — and `useState` or `useReducer` handles it fine. Server state is data that lives in someone else's database: my copy is really a cache entry that can go stale the moment it arrives, other users can change it behind my back, and it's shared across many components. That difference matters because caches need things component state doesn't: freshness policy, deduplication, background revalidation, and invalidation after writes. Treating server data as ordinary component state is how you get apps that refetch on every mount, show stale data forever, and fire duplicate requests — which is exactly the gap TanStack Query fills.",
    },
    {
      q: "How do you fetch data in a React application?",
      a: "For anything beyond a one-off, I use a server-state library — TanStack Query, or SWR. Reads are `useQuery({ queryKey, queryFn })`: the key is the cache address and includes every input of the request, and the library gives me caching, dedup across components, retries, background refetch, and stale-while-revalidate via `staleTime`. Writes are `useMutation` with `invalidateQueries` in `onSuccess`, so every view of the affected data refetches without manual orchestration. I can write the raw version — a discriminated-union state and a `useEffect` with an ignore-flag cleanup against races — and that's useful to understand, but hand-rolling it in production means re-implementing a cache badly. Coming from PHP, I think of it as Redis discipline applied to API responses: explicit keys, TTLs, invalidate on write.",
    },
    {
      q: "What does invalidateQueries do, and why is it better than refetching manually after a mutation?",
      a: "It marks every cache entry matching a key prefix as stale — `invalidateQueries({ queryKey: ['users'] })` hits `['users']`, `['users', 42]`, and so on — and any mounted component using those entries refetches automatically. The win is decoupling: the mutation doesn't need to know which components display the data. With manual refetching, the form has to call back into every consumer — the list, the sidebar count, the header badge — and it silently misses the ones added later. Invalidation inverts that: the write declares *what* changed, and the reads look after themselves. It's the same pattern as deleting a cache key after a database UPDATE and letting the next read repopulate it.",
    },
  ],

  quiz: [
    {
      question: "Why is data from /api/users fundamentally different from a dropdown's open/closed state?",
      options: [
        "It is larger, so it needs a different data structure",
        "It is a cache of state your app doesn't own — it can change on the server without your app knowing",
        "It cannot be stored in useState",
        "React re-renders more often for fetched data",
      ],
      answerIndex: 1,
      explain:
        "The dropdown flag is client state: your app is the source of truth. The user list's source of truth is a remote database — your copy is a cache entry that needs freshness rules, dedup, and invalidation, which is why server-state libraries exist. It stores in useState just fine; that's exactly the trap.",
    },
    {
      question: "In useQuery({ queryKey: ['users', userId], queryFn, staleTime: 60_000 }), what does the queryKey do?",
      options: [
        "It is sent to the server as a request header",
        "It addresses one cache entry — like a Redis key — so changing userId addresses (and fetches) a different entry",
        "It throttles the request to once per minute",
        "It names the query for React DevTools only",
      ],
      answerIndex: 1,
      explain:
        "The queryKey is the cache address: components using the same key share one entry (and one request), and every input of the request belongs in the key so a new userId means a new entry. Freshness is staleTime's job, not the key's.",
    },
    {
      question: "A query has staleTime: 60_000. A component mounts 30 seconds after the data was fetched. What happens?",
      options: [
        "The cached data is served with no network request — the entry is still fresh",
        "The cached data is shown while a background refetch runs",
        "A fresh fetch blocks rendering until it resolves",
        "The cache entry is deleted and refetched",
      ],
      answerIndex: 0,
      explain:
        "Within staleTime an entry is fresh: it's served straight from cache with no request at all. Only after it goes stale does the stale-while-revalidate behaviour kick in — serve the cached copy instantly and refetch in the background.",
    },
    {
      question: "After a successful POST creating a user, what is the idiomatic TanStack Query way to update the user list?",
      options: [
        "Call the list component's fetch function via a ref",
        "Reload the page to clear all state",
        "queryClient.invalidateQueries({ queryKey: ['users'] }) in the mutation's onSuccess",
        "Set staleTime to 0 globally",
      ],
      answerIndex: 2,
      explain:
        "Invalidation marks every entry under the key prefix stale, and all mounted consumers refetch on their own — the mutation never needs to know who displays the data. It's cache invalidation on write, not manual refetch orchestration.",
    },
  ],
};

export default lesson;
