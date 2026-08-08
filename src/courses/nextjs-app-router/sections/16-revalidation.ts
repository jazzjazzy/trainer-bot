import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "revalidation",
  title: "Revalidation: ISR & On-Demand",
  part: "Data & Caching",
  estMinutes: 12,
  summary:
    "Cached pages go stale — Next.js refreshes them either on a timer (revalidate, with stale-while-revalidate semantics) or the instant your data changes (revalidatePath / revalidateTag).",

  concept: `
If you've ever put a Redis or file cache in front of WordPress, you already
know this problem. Caching a rendered page is easy; the hard part is
**invalidation**: how long do you trust the copy, and how do you purge it the
moment an editor hits Publish? Next.js bakes both answers into the framework —
a TTL (**time-based revalidation**) and a purge API (**on-demand
revalidation**).

### Time-based revalidation: the TTL

Since Next 15, \`fetch\` is **not cached by default**. Adding \`revalidate\`
is the opt-in — it caches the response *and* gives it a lifetime in seconds:

\`\`\`tsx
// app/blog/page.tsx
const res = await fetch('https://cms.example.com/posts', {
  next: { revalidate: 3600 }, // cache this response for up to an hour
});
\`\`\`

Or set it for a whole route segment with an export (must be a literal, not a
computed value — the build reads it statically):

\`\`\`tsx
// app/blog/page.tsx
export const revalidate = 3600;
\`\`\`

This is what the docs call **ISR — Incremental Static Regeneration** — a term
worth knowing verbatim for interviews: static pages that regenerate
incrementally, per page, after deploy.

### Stale-while-revalidate: nobody waits

The crucial detail is *what happens when the hour is up*. The next visitor
does **not** wait for a rebuild. They get the stale copy instantly, and Next
regenerates the page **in the background**; the visitor after that sees the
fresh version. That's stale-while-revalidate semantics — the same trade-off as
serving an expired Redis entry while a queue worker rebuilds it, except you
don't have to build the queue worker.

### On-demand revalidation: purge-on-publish

A TTL is a guess. When you *know* the data changed — a form submission, a CMS
webhook — purge precisely, from a Server Action or a route handler:

- \`revalidatePath('/blog')\` — invalidate everything cached for one route.
- \`revalidateTag('posts', 'max')\` — invalidate every cached fetch labelled
  with the tag \`posts\`, wherever it's used.

Note the second argument: **in Next 16, \`revalidateTag\` requires a
cacheLife profile** — \`'max'\` is the recommended value and keeps
stale-while-revalidate behaviour (serve stale, refresh in background). The
old one-argument form is deprecated. There's also \`updateTag('posts')\` for
Server Actions when the user must *immediately* see their own write.

### Tags: label at read time, purge at write time

Tags are the precision tool. You attach them where data is **read**:

\`\`\`ts
// lib/posts.ts
const res = await fetch(\`https://cms.example.com/posts/\${slug}\`, {
  next: { revalidate: 3600, tags: ['posts', \`post:\${slug}\`] },
});
\`\`\`

…and invalidate where data is **written**. One \`revalidateTag('posts', 'max')\`
in your publish webhook nukes the post list, the homepage teaser, and the RSS
route in one call — every consumer of that data, without you maintaining a
list of which pages use it. In PHP terms: instead of remembering every cache
key your save-hook must delete, you delete by label.
`,

  comparisons: [
    {
      label: "TTL cache: filemtime check vs revalidate",
      intro:
        "Serve a cached copy of expensive CMS data for up to an hour. The PHP version hand-rolls a file cache; Next needs one option on the fetch.",
      php: `<?php // blog.php — hand-rolled file cache with a TTL
$cacheFile = __DIR__ . '/cache/posts.json';
$ttl = 3600;

if (file_exists($cacheFile)
    && time() - filemtime($cacheFile) < $ttl) {
  $posts = json_decode(file_get_contents($cacheFile), true);
} else {
  // This visitor pays for the rebuild — they wait.
  $posts = fetchPostsFromCms();
  file_put_contents($cacheFile, json_encode($posts));
}

foreach ($posts as $post) {
  echo '<h2>' . htmlspecialchars($post['title']) . '</h2>';
}`,
      ts: `// app/blog/page.tsx
interface Post { id: string; title: string }

export default async function BlogPage() {
  const res = await fetch('https://cms.example.com/posts', {
    next: { revalidate: 3600 }, // cache + 1h lifetime
  });
  const posts: Post[] = await res.json();

  return (
    <main>
      {posts.map((post) => (
        <h2 key={post.id}>{post.title}</h2>
      ))}
    </main>
  );
}

// Or for the whole segment:
// export const revalidate = 3600;`,
      note:
        "The behavioural difference: after the PHP TTL expires, the next visitor blocks while the cache rebuilds. Next serves them the stale copy instantly and regenerates in the background — stale-while-revalidate.",
    },
    {
      label: "Purge-on-publish: delete the key vs revalidateTag",
      intro:
        "An editor publishes a post and the cache must die now, not in an hour. PHP deletes known cache keys in the save hook; Next exposes a webhook route handler that invalidates by tag.",
      php: `<?php // save-post hook — must know every affected key
function on_post_published(int $postId): void
{
  $redis = new Redis();
  $redis->connect('127.0.0.1');

  // Miss one key and that page serves stale forever:
  $redis->del('page:/blog');
  $redis->del('page:/');
  $redis->del("page:/blog/post-$postId");
  $redis->del('feed:rss');
}`,
      ts: `// app/api/revalidate/route.ts — CMS webhook target
import { revalidateTag } from 'next/cache';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ ok: false }, { status: 401 });
  }

  // One call hits every fetch tagged 'posts',
  // on every page, without listing them:
  revalidateTag('posts', 'max');
  return Response.json({ revalidated: 'posts' });
}`,
      note:
        "The PHP version couples the write path to a hand-maintained list of keys. Tags invert that: readers label their own data, writers invalidate the label. Next 16 requires the second argument — 'max' keeps stale-while-revalidate.",
      rightLang: "ts",
    },
    {
      label: "Tagging at read time",
      intro:
        "The other half of the tag system: where the data is fetched, you attach labels — a broad one for the collection and a narrow one for the item.",
      php: `<?php // Manual equivalent: encode 'tags' into key names
// and keep an index of members per tag — by hand.
$key = "post:$slug";
$redis->set($key, json_encode($post), ['EX' => 3600]);

// Maintain the tag index yourself:
$redis->sAdd('tag:posts', $key);

// Invalidation walks the index:
foreach ($redis->sMembers('tag:posts') as $member) {
  $redis->del($member);
}`,
      ts: `// lib/posts.ts — label the fetch where it happens
export async function getPost(slug: string) {
  const res = await fetch(
    \`https://cms.example.com/posts/\${slug}\`,
    {
      next: {
        revalidate: 3600,
        tags: ['posts', \`post:\${slug}\`],
      },
    }
  );
  return res.json();
}

// Later, in a Server Action or route handler:
//   revalidateTag('posts', 'max')        — all posts
//   revalidateTag(\`post:\${slug}\`, 'max') — just one`,
      note:
        "Two granularities from one fetch: purge the whole collection on publish, or a single post on edit. Tags only exist on cached data — pair them with revalidate or cache: 'force-cache'.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of Next's tagged data cache. Two keys are cached under different tags; revalidateTag('posts') marks matching entries stale. Predict which reads are HIT, MISS, or STALE (served stale + regenerated in the background), then run it.",
    code: `// Next's tagged cache in ~30 lines: entries carry tags,
// revalidateTag marks them stale, stale reads serve the old
// value instantly while regenerating — stale-while-revalidate.

interface Entry { value: string; tags: string[]; fresh: boolean }

const cache = new Map<string, Entry>();
let version = 0;

function fetchFromCms(key: string): string {
  version++;
  return \`\${key} (v\${version})\`;
}

function cachedFetch(key: string, tags: string[]): string {
  const hit = cache.get(key);
  if (hit && hit.fresh) {
    console.log(\`HIT         \${hit.value}\`);
    return hit.value;
  }
  if (hit) {
    // Stale: serve the old copy NOW, regenerate in background.
    console.log(\`STALE       \${hit.value} → serving stale, regenerating…\`);
    cache.set(key, { value: fetchFromCms(key), tags, fresh: true });
    return hit.value;
  }
  console.log(\`MISS        \${key} → fetching\`);
  const value = fetchFromCms(key);
  cache.set(key, { value, tags, fresh: true });
  return value;
}

function revalidateTag(tag: string): void {
  console.log(\`INVALIDATE  tag "\${tag}"\`);
  for (const entry of cache.values()) {
    if (entry.tags.includes(tag)) entry.fresh = false;
  }
}

// Traffic before the editor publishes:
cachedFetch('post:42', ['posts']);
cachedFetch('post:42', ['posts']);
cachedFetch('author:7', ['authors']);

// Editor hits Publish → webhook fires:
revalidateTag('posts');

// Traffic after — watch which key was touched:
cachedFetch('post:42', ['posts']);
cachedFetch('post:42', ['posts']);
cachedFetch('author:7', ['authors']);`,
  },

  keyPoints: [
    "Since Next 15, `fetch` is uncached by default — `next: { revalidate: 3600 }` is the opt-in that both caches the response and gives it a lifetime.",
    "`export const revalidate = 3600` sets the TTL for a whole route segment; the value must be a literal.",
    "Time-based revalidation is stale-while-revalidate: after expiry the next visitor gets the stale copy instantly while Next regenerates in the background — nobody blocks on the rebuild.",
    "On-demand: `revalidatePath('/blog')` purges a route; `revalidateTag('posts', 'max')` purges every fetch carrying that tag — Next 16 requires the second (cacheLife profile) argument.",
    "Tags are the precision tool: label data where it's *read* (`next: { tags: ['posts'] }`), invalidate by label where it's *written* — no hand-maintained key lists.",
    "Call revalidatePath/revalidateTag from Server Actions or route handlers (e.g. a secret-protected CMS webhook); `updateTag` exists for actions where the user must immediately see their own write.",
  ],

  interview: [
    {
      q: "Explain Incremental Static Regeneration and its stale-while-revalidate behaviour.",
      a: "ISR means a statically rendered page can refresh itself after deploy without a rebuild. You give cached data a lifetime — `next: { revalidate: 3600 }` on a fetch, or `export const revalidate = 3600` on the segment. Within the hour every visitor gets the cached page. After it expires, the next visitor still gets the cached (now stale) page instantly, and Next regenerates it in the background; subsequent visitors get the fresh version. That's stale-while-revalidate: you trade bounded staleness for the guarantee that no user ever waits on regeneration. It's exactly the pattern you'd build in PHP with a Redis cache plus a background rebuild worker, but built into the framework.",
    },
    {
      q: "When would you use revalidateTag over revalidatePath, and how do tags work end-to-end?",
      a: "Path-based revalidation purges one route, so I need to know every route that displays the data — the same fragile key-list problem as manual Redis invalidation. Tags invert the dependency: at read time I label the fetch with `next: { tags: ['posts'] }`, and at write time — a Server Action or a CMS-webhook route handler — I call `revalidateTag('posts', 'max')`, which invalidates that data everywhere it's consumed. In Next 16 the second argument is required: it's a cacheLife profile, and 'max' keeps stale-while-revalidate semantics. I'd reach for revalidatePath only when I genuinely think in pages, like purging a one-off landing page.",
    },
    {
      q: "A CMS needs cached pages to update the moment an editor publishes. How do you wire that in Next?",
      a: "I'd expose a route handler like `app/api/revalidate/route.ts` as the CMS webhook target, protected by a shared secret checked against an environment variable. Fetches that read CMS content get tagged — `tags: ['posts']` plus a per-item tag like `post:slug`. The webhook payload tells me what changed, and I call `revalidateTag` with the right granularity: the collection tag on publish, the item tag on edit. I'd keep a modest time-based `revalidate` on the fetches too, as a safety net in case a webhook is ever dropped — TTL as backstop, purge-on-publish as the primary mechanism.",
    },
  ],

  quiz: [
    {
      question:
        "A page uses fetch with next: { revalidate: 60 }. A visitor arrives 90 seconds after the page was last generated. What happens?",
      options: [
        "They wait while Next re-fetches the data, then see the fresh page",
        "They instantly get the stale page; Next regenerates in the background for subsequent visitors",
        "They get a 404 until regeneration completes",
        "Nothing — fetch results are cached forever unless revalidatePath is called",
      ],
      answerIndex: 1,
      explain:
        "Time-based revalidation is stale-while-revalidate: expiry never makes a visitor wait. The stale copy is served immediately, regeneration happens in the background, and the next visitor gets the fresh version. Blocking-on-rebuild is what naive TTL caches do.",
    },
    {
      question: "In Next 16, what is the correct call to invalidate the 'posts' tag with stale-while-revalidate behaviour?",
      options: [
        "revalidateTag('posts')",
        "revalidateTag('posts', 'max')",
        "revalidatePath('posts')",
        "fetch.invalidate('posts')",
      ],
      answerIndex: 1,
      explain:
        "Next 16 requires a second argument — a cacheLife profile — on revalidateTag; 'max' is the recommended value and preserves stale-while-revalidate. The one-argument form is deprecated. revalidatePath takes a route path like '/blog', not a tag.",
    },
    {
      question: "Where do cache tags get attached to data?",
      options: [
        "In next.config.ts, mapping tags to routes",
        "In the revalidateTag call — it creates the tag and finds matching URLs",
        "At read time, on the fetch: next: { revalidate: 3600, tags: ['posts'] }",
        "In a special tags.ts file per route segment",
      ],
      answerIndex: 2,
      explain:
        "Tags are declared where data is read — as fetch options alongside caching opts — and consumed where data is written, via revalidateTag. That inversion is the point: readers label their own data, so writers never maintain a list of affected pages. Tags only apply to cached data.",
    },
  ],
};

export default lesson;
