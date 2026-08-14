import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "caching-and-invalidation",
  title: "Caching Layers and Invalidation",
  part: "System Design Fundamentals",
  estMinutes: 12,
  summary:
    "Caching is layered from browser and CDN through an app-level store to the database's own buffer cache; the interview lives in the invalidation story and the failure modes — stale reads, stampedes, and what a 90% vs 99% hit ratio does to database load.",

  concept: `
"There are only two hard things in computer science: cache invalidation and
naming things." It's a joke because it's true — *adding* a cache is easy,
keeping it correct is the whole job. In an interview, anyone can say "we'll
put Redis in front of it"; the signal is knowing **which layer**, **which
pattern**, and **how the cache gets wrong and recovers**.

### The layers, outermost to innermost

Requests pass through a stack of caches, each cheaper and staler than the one
behind it:

- **Browser cache** — \`Cache-Control\`/\`ETag\` on responses; zero network cost,
  but you control invalidation only through headers and URL versioning.
- **CDN / edge** — shared cache near the user for static assets and cacheable
  GETs; great for read-heavy public data, useless for per-user pages.
- **Application cache** — an in-memory store like a Redis- or memcached-style
  server holding hot query results, sessions, computed views. **This is the
  layer interviews mean.** You've run this before: the memcached box in front
  of MySQL was exactly this.
- **Database buffer cache** — the DB keeps hot pages in RAM itself. Free, but
  it can't save you from the query-parsing and connection cost the way an
  app-level cache can.

### The patterns

- **Cache-aside** (lazy loading) — the default, the one you already wrote in
  PHP: on read, check cache; on miss, read the DB, then populate the cache.
  The application owns the cache. Simple, resilient (a cache outage just means
  more DB reads), but the first request for any key always misses.
- **Read-through** — the cache library itself fetches from the DB on a miss;
  same effect, the wiring moves into the cache layer.
- **Write-through** — writes go to cache and DB together, so the cache is never
  stale — at the cost of writing data nobody may read.
- **TTL vs explicit invalidation** — a **TTL** (time to live) expires entries
  after N seconds: trivial, but you serve stale data for up to N seconds.
  **Explicit invalidation** deletes or updates the key when the underlying row
  changes (often via an event): correct immediately, but you must find every
  place that writes. Most real systems use **both** — a short TTL as a safety
  net under event-based invalidation.

### The failure modes interviewers probe

- **Stale reads** — a write updated the DB but not the cache; readers see old
  data until the TTL lapses or an event fires. Name where this is acceptable
  (a profile bio) and where it is not (a price, a balance).
- **Thundering herd / stampede** — a hot key expires and a thousand concurrent
  requests all miss at once and all hammer the DB for the same value. Mitigate
  with **jittered TTLs** (spread expiry over a window so keys don't die
  together) and **single-flight locking** (the first miss fetches; the rest
  wait for that one result).

### The number that matters: hit ratio

Hit ratio is the lever, and the relationship is non-linear. At **1000 reads/sec**
with a **90%** hit ratio, 10% — **100 reads/sec** — reach the database. Push
the hit ratio to **99%** and only **10 reads/sec** get through: same traffic,
**10x less database load** for a 9-point improvement. That's why "cache the
hot 1% harder" beats "cache everything" — the tail of rarely-read keys costs
memory and buys almost no hit-ratio.
`,

  comparisons: [
    {
      label: "\"Add Redis\" vs cache-aside with an invalidation story",
      intro:
        "Serve a user profile from cache. The weak answer caches forever and never invalidates, so an edited profile shows stale data indefinitely; the strong answer is cache-aside with a TTL floor plus event-based invalidation on write.",
      php: `// Weak: cache on read, never invalidate.
async function getProfile(id: string) {
  const hit = await cache.get(\`profile:\${id}\`);
  if (hit) return JSON.parse(hit);

  const row = await db.profiles.find(id);
  await cache.set(\`profile:\${id}\`, JSON.stringify(row));
  return row;
}

// When the user edits their bio, we update the DB...
async function updateProfile(id: string, patch: object) {
  await db.profiles.update(id, patch);
  // ...and the cache still serves the OLD bio forever.
}`,
      ts: `// Strong: cache-aside + TTL safety net + event invalidation.
const TTL = 300; // 5 min: bounds staleness even if an event is missed

async function getProfile(id: string) {
  const key = \`profile:\${id}\`;
  const hit = await cache.get(key);
  if (hit) return JSON.parse(hit);

  const row = await db.profiles.find(id);
  await cache.set(key, JSON.stringify(row), { ttl: TTL });
  return row;
}

async function updateProfile(id: string, patch: object) {
  await db.profiles.update(id, patch);
  await cache.del(\`profile:\${id}\`); // explicit invalidation on write
  // TTL is the backstop; the delete makes it correct immediately.
}`,
      note:
        "The delete-on-write is the invalidation story interviewers want; the TTL is the backstop for the writes you forget to hook. 'Add Redis' with neither is the junior answer.",
    },
    {
      label: "Cache everything vs cache the hot reads only",
      intro:
        "Two reasoning scripts said out loud about what to cache. One caches every read; the other reasons from access distribution and consistency needs.",
      php: `// Weak reasoning
//
// "I'll cache every query result to be safe. More caching
//  is more speed, right? Wrap every read in get-or-set,
//  set a long TTL so the hit ratio looks great, and move
//  on. If something's stale, users can refresh."
//
// Problems: cold keys evict hot keys (memory is finite),
// the hit ratio on rarely-read data is ~0 so it buys
// nothing, and long TTLs on mutable data serve stale
// prices and balances — the exact data you must NOT cache
// loosely.`,
      ts: `// Strong reasoning
//
// "Caching pays off where reads vastly outnumber writes
//  AND some staleness is tolerable. So: cache the hot,
//  read-heavy, mutation-light data — session lookups,
//  the homepage feed, a product's static details — with
//  short TTLs plus invalidation on write.
//
//  Don't cache: rarely-read keys (near-zero hit ratio,
//  they just evict hot keys), and strongly-consistent
//  values like account balances, which read from the
//  primary. I'd measure hit ratio per key class and cache
//  where the ratio and the tolerance both justify it."`,
      note:
        "The senior move is naming the access pattern (read-heavy, mutation-light, staleness-tolerant) as the cache-worthiness test — not treating caching as a universal speed dial.",
    },
    {
      label: "Naive expiry vs stampede mitigation",
      intro:
        "A hot key that every request needs — the homepage feed. When it expires, the naive version lets every concurrent miss hit the DB at once; the strong version spreads expiry and lets one request do the fetch.",
      php: `// Weak: one shared TTL, every miss fetches.
async function getFeed() {
  const hit = await cache.get('feed:home');
  if (hit) return JSON.parse(hit);

  // Expiry moment: 2,000 concurrent requests all reach
  // HERE at once and all query the DB for the same feed —
  // a thundering herd that can topple the database.
  const feed = await db.buildHomeFeed();
  await cache.set('feed:home', JSON.stringify(feed), { ttl: 60 });
  return feed;
}`,
      ts: `// Strong: jittered TTL + single-flight lock.
const inFlight = new Map<string, Promise<Feed>>();

async function getFeed() {
  const hit = await cache.get('feed:home');
  if (hit) return JSON.parse(hit);

  // Single-flight: the first miss fetches; concurrent
  // misses await that same promise instead of piling on.
  let p = inFlight.get('feed:home');
  if (!p) {
    p = db.buildHomeFeed()
      .then(async (feed) => {
        const ttl = 60 + Math.floor(Math.random() * 20); // jitter
        await cache.set('feed:home', JSON.stringify(feed), { ttl });
        return feed;
      })
      // Clear on failure too — otherwise one DB blip parks a
      // rejected promise here and every later miss gets it.
      .finally(() => inFlight.delete('feed:home'));
    inFlight.set('feed:home', p);
  }
  return p;
}`,
      note:
        "Jitter stops many keys expiring on the same tick; single-flight collapses a herd of misses into one DB read. Naming 'thundering herd' and both mitigations is strong senior signal.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A cache-aside layer over a fake slow store. Predict how many of the 8 requests are hits before running, then check the final hit ratio and how many DB queries the cache actually saved.",
    code: `// Cache-aside over a slow store, in miniature.
// A HIT skips the store; a MISS pays for it, then fills the cache.

const store = new Map<string, string>([
  ["user:1", "Ada"],
  ["user:2", "Grace"],
  ["user:3", "Linus"],
]);

let dbQueries = 0;
function slowRead(key: string): string {
  dbQueries++; // every call here is a database round-trip
  return store.get(key) ?? "<missing>";
}

const cache = new Map<string, string>();
let hits = 0;
let misses = 0;

function get(key: string): string {
  const cached = cache.get(key);
  if (cached !== undefined) {
    hits++;
    console.log(\`  \${key.padEnd(7)} HIT  (served from cache)\`);
    return cached;
  }
  misses++;
  const value = slowRead(key);
  cache.set(key, value); // cache-aside: populate on miss
  console.log(\`  \${key.padEnd(7)} MISS (hit the db, now cached)\`);
  return value;
}

const requests = [
  "user:1", "user:1", "user:2", "user:1",
  "user:3", "user:2", "user:2", "user:1",
];
console.log(\`serving \${requests.length} requests through a cold cache:\`);
for (const r of requests) get(r);

const ratio = (hits / requests.length) * 100;
console.log(\`\\nhits=\${hits} misses=\${misses} hit-ratio=\${ratio.toFixed(1)}%\`);
console.log(\`db queries actually run: \${dbQueries} (vs \${requests.length} with no cache)\`);
console.log(\`db reads saved: \${requests.length - dbQueries} of \${requests.length}\`);`,
  },

  keyPoints: [
    "Caches are layered — browser, CDN/edge, app-level store (Redis/memcached-style), and the DB's own buffer cache; interviews usually mean the app-level layer you ran with memcached in front of MySQL.",
    "Cache-aside is the default: check cache, on miss read the DB and populate — the application owns the cache, and a cache outage degrades to more DB reads rather than an outage.",
    "TTL bounds staleness cheaply but serves stale data until it lapses; explicit (event-based) invalidation is immediately correct but you must hook every write — real systems use a short TTL under event invalidation.",
    "Thundering herd is a hot key expiring into a flood of concurrent misses; mitigate with jittered TTLs (so keys don't die together) and single-flight locking (one miss fetches, the rest wait).",
    "Hit ratio is non-linear: at 1000 reads/sec, 90% hit sends 100/sec to the DB but 99% sends only 10/sec — a 9-point gain is 10x less DB load.",
    "Cache read-heavy, mutation-light, staleness-tolerant data; never cache balances or prices loosely, and don't cache cold keys that buy no hit ratio and evict hot ones.",
  ],

  interview: [
    {
      q: "You're told the database is overloaded by reads. Walk me through adding a cache.",
      a: "First I'd confirm the reads are cacheable — read-heavy, mutation-light, and tolerant of some staleness; balances and prices I'd leave reading the primary. Then cache-aside at the app layer: on read, check the cache, and on a miss read the DB and populate the key with a short TTL. The TTL bounds staleness as a safety net, but correctness comes from invalidating on write — deleting or updating the key wherever the row changes, ideally off a change event. I'd size the win by hit ratio: pushing from 90% to 99% cuts DB read load tenfold, so I'd measure hit ratio per key class rather than caching everything. And I'd guard the hot keys against a stampede with jittered TTLs and single-flight fetching so an expiry doesn't turn into a thundering herd.",
    },
    {
      q: "What's the difference between TTL-based and event-based invalidation, and which do you use?",
      a: "A TTL just expires an entry after N seconds — trivial to implement, but it serves stale data for up to N seconds and has no idea when the underlying data actually changed. Event-based (explicit) invalidation deletes or refreshes the cached key the moment the row is written, so reads are correct immediately, but it's more work: you have to hook every write path, and a missed hook means silent staleness. In practice I use both — event invalidation for correctness plus a short TTL as a backstop for the write paths I miss or that happen outside the app, like a bulk SQL update. Which one dominates depends on the data: a five-minute TTL is fine for a bio, but a price needs event invalidation and a tight TTL.",
    },
    {
      q: "A cache key expires and the database gets hammered. What happened and how do you prevent it?",
      a: "That's a cache stampede, or thundering herd: a hot key expired and every concurrent request missed at the same instant, so they all queried the DB for the same value at once. Two mitigations. First, jitter the TTLs — add a random spread so a batch of keys populated together doesn't all expire on the same tick. Second, single-flight or lock-on-miss: the first request to miss takes a short lock and does the fetch while the others wait for that one result instead of each doing their own query. You can also refresh hot keys proactively before they expire. The root cause to name is that a single popular key with a shared expiry concentrates all the misses into one moment.",
    },
  ],

  quiz: [
    {
      question:
        "In the cache-aside pattern, what happens on a cache miss?",
      options: [
        "The request fails and the client must retry",
        "The application reads from the database, then populates the cache with the result",
        "The cache library transparently fetches from the DB itself",
        "The write is queued and the stale value is returned",
      ],
      answerIndex: 1,
      explain:
        "Cache-aside puts the application in control: check the cache, and on a miss read the DB and write the value back into the cache. (The library fetching on a miss is read-through — the same effect with different wiring.)",
    },
    {
      question:
        "At 1000 reads/sec, roughly how much does moving from a 90% to a 99% cache hit ratio reduce database read load?",
      options: [
        "By about 9% — the difference in the percentages",
        "By about 10x — from ~100 reads/sec to ~10 reads/sec reaching the DB",
        "It has no effect on the database, only on latency",
        "It doubles the load because more writes are needed",
      ],
      answerIndex: 1,
      explain:
        "Misses, not hits, hit the DB. 10% of 1000 is 100 reads/sec; 1% is 10 reads/sec. The 9-point hit-ratio gain is a 10x reduction in DB reads — the relationship is non-linear, which is why the tail of the hit ratio is worth chasing.",
    },
    {
      question:
        "What is a cache stampede (thundering herd), and which pair of techniques mitigates it?",
      options: [
        "Too many keys in the cache; fixed by raising the memory limit",
        "A hot key expiring into many concurrent misses; fixed by jittered TTLs and single-flight locking",
        "Writes outrunning reads; fixed by switching to write-through",
        "The CDN and app cache disagreeing; fixed by disabling one",
      ],
      answerIndex: 1,
      explain:
        "When a popular key expires, all in-flight requests miss simultaneously and stampede the DB for the same value. Jittering TTLs spreads expiry over a window, and single-flight locking makes one request fetch while the rest await its result.",
    },
  ],
};

export default lesson;
