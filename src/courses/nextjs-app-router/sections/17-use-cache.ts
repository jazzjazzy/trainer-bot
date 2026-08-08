import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "use-cache",
  title: "\"use cache\" & Cache Components",
  part: "Data & Caching",
  estMinutes: 12,
  summary:
    "Next 16's explicit caching model: enable cacheComponents, mark functions, components, or files with 'use cache', and control freshness with cacheLife profiles and cacheTag.",

  concept: `
The history of Next.js caching is a history of *implicit defaults*: 13/14
cached aggressively unless you opted out, 15 flipped to uncached unless you
opted in per fetch. Next 16's answer to the whiplash is **Cache Components**:
caching you *declare*, with a directive, exactly where you want it — instead
of defaults you memorize.

### Enabling it

One flag in \`next.config.ts\`:

\`\`\`ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
\`\`\`

### The \`"use cache"\` directive

Like \`'use client'\` and \`'use server'\`, it's a string directive — but this
one means "cache my output". It works at three levels:

\`\`\`ts
// lib/data.ts
import { cacheLife, cacheTag } from 'next/cache';

export async function getUser(id: string) {
  'use cache';           // function level
  cacheLife('hours');    // TTL profile
  cacheTag('users');     // label for on-demand invalidation
  return db.query.users.findFirst({ where: eq(users.id, id) });
}
\`\`\`

- **Function**: first line of an async function — its return value is cached.
- **Component**: first line of an async Server Component — its rendered
  output is cached.
- **File**: at the top of a file — every export is cached.

If you've written \`apcu_entry($key, fn () => expensiveQuery())\` or Symfony's
\`$cache->get($key, $callback)\`, this is the same cache-aside shape — except
you never compute the key. **The arguments (and any closed-over values) become
the cache key automatically.** \`getUser('1')\` and \`getUser('2')\` are
separate entries, so arguments must be serializable.

### \`cacheLife\`: TTL as a named profile

Instead of scattering raw second counts, you pick a profile:
\`cacheLife('seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max')\`.
Each bundles how long clients may reuse it, how often the server revalidates,
and when the entry truly expires. You can also define custom profiles in
\`next.config.ts\`. Named profiles read like intent — \`'hours'\` says "this
is dashboard-fresh", the way a well-named PHP config constant beats
\`3600\` inline.

### \`cacheTag\`: the same tag system, from inside

\`cacheTag('posts')\` labels the cached entry from *inside* the cached
function (it can even tag based on fetched data). Invalidation is the same
API you use for tagged fetches: \`revalidateTag('posts', 'max')\` in a Server
Action or route handler, with \`'max'\` giving stale-while-revalidate.

### Why interviewers care

Cache Components is where Next is heading: the older per-fetch options and
segment configs give way to one composable primitive. Being able to say
"\`'use cache'\` marks a function/component/file as cacheable, arguments form
the key, \`cacheLife\` sets lifetime, \`cacheTag\` + \`revalidateTag\` handle
purging" shows you're current with 16, not reciting the 13/14 model.
`,

  comparisons: [
    {
      label: "Cache-aside wrapper vs a directive",
      intro:
        "Cache an expensive user lookup for a few hours. PHP wraps the call in apcu_entry with a hand-built key; Next marks the function itself.",
      php: `<?php // lib/users.php — apcu_entry: cache-aside by hand
function getUser(int $id): array
{
    // YOU build the key — forget the $id and every
    // user shares one cache entry (a classic bug).
    return apcu_entry("user:$id", function () use ($id) {
        return db()->query(
            'SELECT * FROM users WHERE id = ?', [$id]
        )->fetch();
    }, 3600);
}`,
      ts: `// lib/users.ts — the function IS the cache entry
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';

export async function getUser(id: string) {
  'use cache';
  cacheLife('hours');
  cacheTag('users', \`user:\${id}\`);

  // The cache key is derived from the function's
  // arguments — getUser('1') and getUser('2') are
  // separate entries, automatically.
  return db.users.findById(id);
}`,
      note:
        "Same cache-aside pattern, but the key is derived from the arguments instead of hand-assembled — the 'forgot the id in the key' bug can't happen. Arguments must be serializable, since they form the key.",
      rightLang: "ts",
    },
    {
      label: "Turning the cache on",
      intro:
        "Both frameworks need the caching layer configured once. PHP picks a driver in a config file; Next flips one flag that unlocks the directive.",
      php: `<?php // config/cache.php — pick a driver, tune it
return [
    'default' => 'apcu',
    'stores' => [
        'apcu'  => ['driver' => 'apcu'],
        'redis' => [
            'driver' => 'redis',
            'host'   => env('REDIS_HOST', '127.0.0.1'),
            'ttl'    => 3600,
        ],
    ],
];`,
      ts: `// next.config.ts — one flag enables Cache Components
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;

// From here on, 'use cache' is valid in any
// function, Server Component, or whole file.`,
      note:
        "cacheComponents is a top-level next.config.ts option in 16. Without it, the 'use cache' directive is an error — the flag opts the whole app into the explicit-caching model.",
      rightLang: "ts",
    },
    {
      label: "Tagged invalidation: Symfony vs cacheTag",
      intro:
        "Both ecosystems converge on the same idea: label cache entries when writing them, purge by label later. Compare Symfony's TagAwareCache with cacheTag + revalidateTag.",
      php: `<?php // Symfony TagAwareCacheInterface
$posts = $cache->get('post_list', function ($item) {
    $item->tag(['posts']);
    $item->expiresAfter(3600);
    return $this->cms->fetchPosts();
});

// Later, when an editor publishes:
$cache->invalidateTags(['posts']);`,
      ts: `// lib/posts.ts
import { cacheLife, cacheTag } from 'next/cache';

export async function getPosts() {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  return cms.fetchPosts();
}

// app/actions.ts — when an editor publishes:
// import { revalidateTag } from 'next/cache';
// revalidateTag('posts', 'max');`,
      note:
        "Conceptually identical to Symfony cache contracts — get(key, callback) plus tags — but the callback boundary is the function itself, and invalidation reuses the same revalidateTag('tag', 'max') you use for tagged fetches.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A tiny 'use cache' engine: cacheWithTags memoizes a function keyed on its arguments and records tags; revalidateTag drops matching entries. Predict the HIT/MISS sequence — especially which entries survive the invalidation — then run it.",
    code: `// What 'use cache' does mechanically: memoize by arguments,
// remember tags, drop entries when a tag is invalidated.

interface Entry { value: string; tags: string[] }

const store = new Map<string, Entry>();
let dbQueries = 0;

function cacheWithTags(
  name: string,
  tags: string[],
  fn: (...args: string[]) => string
) {
  return (...args: string[]): string => {
    // The cache key = function + its arguments (serialized):
    const key = \`\${name}(\${JSON.stringify(args)})\`;
    const hit = store.get(key);
    if (hit) {
      console.log(\`HIT   \${key} = \${hit.value}\`);
      return hit.value;
    }
    const value = fn(...args);
    store.set(key, { value, tags });
    console.log(\`MISS  \${key} → computed \${value}\`);
    return value;
  };
}

function revalidateTag(tag: string): void {
  console.log(\`─ revalidateTag("\${tag}") ─\`);
  for (const [key, entry] of store) {
    if (entry.tags.includes(tag)) store.delete(key);
  }
}

// Two "'use cache'" functions with different tags:
const getUser = cacheWithTags('getUser', ['users'], (id) => {
  dbQueries++;
  return \`user#\${id}/q\${dbQueries}\`;
});
const getPosts = cacheWithTags('getPosts', ['posts'], () => {
  dbQueries++;
  return \`posts/q\${dbQueries}\`;
});

getUser('1');   // miss — first call
getUser('1');   // hit  — same args, same key
getUser('2');   // miss — different arg = different key
getPosts();     // miss

revalidateTag('users');

getUser('1');   // recomputed — its tag was purged
getPosts();     // still cached — different tag
console.log(\`total db queries: \${dbQueries}\`);`,
  },

  keyPoints: [
    "`cacheComponents: true` in next.config.ts (top-level in Next 16) unlocks the `\"use cache\"` directive — Next's explicit, declared caching model.",
    "`'use cache'` works at three levels: first line of an async function (caches the return value), a Server Component (caches its rendered output), or a whole file (caches every export).",
    "The cache key is derived automatically from the function's arguments and closed-over values — no hand-built keys, but arguments must be serializable.",
    "`cacheLife('hours')` sets lifetime via named profiles ('seconds' through 'weeks', 'max'); custom profiles can be defined in next.config.ts.",
    "`cacheTag('posts')` labels an entry from inside the cached function; purge with the same `revalidateTag('posts', 'max')` used for tagged fetches.",
    "PHP mental model: `apcu_entry` / Symfony's `$cache->get($key, $callback)` — cache-aside as a language-level directive, with the key computed for you.",
  ],

  interview: [
    {
      q: "What problem do Cache Components and the 'use cache' directive solve?",
      a: "They replace implicit caching defaults with explicit declarations. Next 13/14 cached fetches and routes aggressively unless you opted out; 15 flipped to uncached unless you opted in per request — either way you were memorizing defaults. With `cacheComponents: true`, caching is something you write: put `'use cache'` at the top of an async function, component, or file and its output is cached, with the arguments automatically forming the cache key. `cacheLife` sets the lifetime via named profiles and `cacheTag` enables on-demand purging via `revalidateTag`. It's the cache-aside pattern I've written a hundred times in PHP with apcu_entry or Symfony cache contracts, minus the hand-built keys.",
    },
    {
      q: "How does 'use cache' decide what the cache key is, and what constraint does that impose?",
      a: "The key is derived from the cached function's identity plus its arguments and any values it closes over — `getUser('1')` and `getUser('2')` are independent entries without me writing `\"user:\" . $id` anywhere. The constraint is that those inputs must be serializable, since they're hashed into the key; you can't key a cache entry on a database connection or a callback. That automatic keying kills a whole class of PHP caching bugs — the forgotten variable in a hand-assembled key that silently serves one user's data to everyone.",
    },
    {
      q: "How do cacheLife and cacheTag work together with revalidateTag?",
      a: "They're the two freshness controls, called inside the cached function. `cacheLife('hours')` picks a named TTL profile — bundling client reuse time, server revalidation frequency, and hard expiry — which is time-based freshness as a backstop. `cacheTag('posts')` labels the entry for event-based freshness: when the data actually changes, a Server Action or webhook route handler calls `revalidateTag('posts', 'max')` and every entry carrying the tag is invalidated, with 'max' preserving stale-while-revalidate. In practice I'd use both on the same function: TTL as insurance, tags as the precise purge-on-publish mechanism — the same TTL-plus-invalidation strategy as a well-run Redis cache in front of a PHP app.",
    },
  ],

  quiz: [
    {
      question: "What must be true before you can use the 'use cache' directive?",
      options: [
        "The file must also contain 'use client'",
        "cacheComponents: true is set in next.config.ts",
        "The function must be a default export",
        "Nothing — it works out of the box in any Next 16 app",
      ],
      answerIndex: 1,
      explain:
        "'use cache' is part of the Cache Components model, enabled by the top-level cacheComponents: true option in next.config.ts. Without the flag the directive is an error. It's independent of 'use client' — in fact it applies to server-side code.",
    },
    {
      question:
        "A function marked 'use cache' is called as getUser('1') and then getUser('2'). What happens on the second call?",
      options: [
        "Cache hit — the function is cached, so all calls return the first result",
        "Cache miss — arguments are part of the cache key, so each id gets its own entry",
        "Runtime error — cached functions can't take arguments",
        "Both calls bypass the cache because ids are dynamic values",
      ],
      answerIndex: 1,
      explain:
        "The cache key is derived from the function plus its (serializable) arguments and closed-over values. Different arguments mean different entries — automatic per-argument keying is exactly what you'd otherwise hand-build into an APCu or Redis key.",
    },
    {
      question: "Inside a 'use cache' function, what does cacheTag('posts') do?",
      options: [
        "Sets the entry's TTL to the 'posts' profile",
        "Immediately invalidates any existing entries tagged 'posts'",
        "Labels this cache entry so revalidateTag('posts', 'max') can purge it later",
        "Restricts the cache entry to requests under the /posts route",
      ],
      answerIndex: 2,
      explain:
        "cacheTag attaches labels at write time; revalidateTag purges by label at mutation time (from a Server Action or route handler). TTL is cacheLife's job — the two are complementary: lifetime as backstop, tags for precise on-demand invalidation.",
    },
  ],
};

export default lesson;
