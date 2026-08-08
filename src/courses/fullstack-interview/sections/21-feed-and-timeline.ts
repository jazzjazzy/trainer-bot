import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "feed-and-timeline",
  title: "Design a News Feed / Timeline",
  part: "The Classic Questions",
  estMinutes: 13,
  summary:
    "The fan-out question: precompute timelines on write for fast reads, compute on read to avoid write amplification, or go hybrid — fan out for normal users and merge celebrity posts at read time.",

  concept: `
"Design a news feed" — Twitter, Instagram, a LinkedIn home timeline — is the
most common social-scale design question, and it has one hinge: **fan-out**.
Get the requirements straight first so you scope it out loud.

### Requirements, said back to the interviewer

- **Follow graph:** a user follows others; a post from someone you follow can
  appear on your home timeline.
- **Write:** create a post.
- **Read:** fetch *my* home timeline — the merged, reverse-chronological posts
  of everyone I follow.
- The traffic is **read-heavy by orders of magnitude** — people scroll far more
  than they post. That single sentence is what justifies precomputing reads.

### The data model

Three tables and one cache:

- \`posts(id, author_id, body, created_at)\` — the source of truth.
- \`follows(follower_id, followee_id)\` — the edges.
- a **per-user home timeline cache** — a materialised list of post ids per
  user, so a read is one lookup instead of a big join.

### The core trade-off: where does the fan-out happen?

**Fan-out-on-write** (push): when you post, copy the post id into every
follower's precomputed timeline. Reads are trivially fast — one cache read.
The catastrophe is the **celebrity problem**: one post by an account with
**50 million followers = 50 million timeline writes**, a write storm on every
tweet.

**Fan-out-on-read** (pull): store nothing extra; at read time gather the posts
of everyone you follow and merge them. No write amplification, but every read
does a fan-in query and sort — brutal at scale, and it's the *read* path you
said was hot.

**Hybrid** (what senior candidates land on): fan out on write for normal users,
and for **celebrities skip the fan-out entirely** — their followers merge the
celebrity's recent posts in at read time. Say the number aloud —
"50 million writes for one post" — and the hybrid justifies itself: you only
pay read-time merge for the handful of accounts where write fan-out would
explode.

### Pagination: cursor, not OFFSET

Timelines are infinite scroll, so paginate with a **cursor** (a keyset:
"give me posts older than this id/timestamp"), never \`OFFSET\`. \`OFFSET 100000\`
makes Postgres scan and discard 100000 rows every page, and if a new post
arrives between pages, \`OFFSET\` shifts everything and you see duplicates.
A cursor on \`(created_at, id)\` is a stable, index-friendly seek — the same
"WHERE id < ?" keyset you'd reach for on any large PHP result set.
`,

  comparisons: [
    {
      label: "Read-path architecture: join-everyone vs hybrid fan-out",
      intro:
        "Two sketches for serving a home timeline. The weak one joins the follow graph against posts on every single read; the strong one precomputes for normal users and merges only celebrities at read time.",
      php: `# WEAK: fan-out-on-read for everyone
# Every home-timeline request runs this join live.
read_home_timeline:
  query: |
    SELECT p.*
    FROM follows f
    JOIN posts p ON p.author_id = f.followee_id
    WHERE f.follower_id = :me
    ORDER BY p.created_at DESC
    LIMIT 50
  cost:
    - fan-in over ALL accounts you follow, every read
    - sort of a large union on the hot path
    - read-heavy traffic hits the DB hardest exactly where it hurts
  celebrity_problem: none on write, but reads never scale`,
      ts: `# STRONG: hybrid fan-out
services: [post-svc, timeline-svc, fanout-worker]
stores:
  posts: postgres            # source of truth
  timelines: redis           # per-user list of post ids (cache)
write_path:
  on_post:
    - if author.followers < 10000:      # normal user
        fanout-worker pushes post_id into each follower's redis list
    - else:                             # celebrity: SKIP fan-out
        store post only; nothing pushed
read_home_timeline:
  - base = redis timeline for :me          # precomputed, fast
  - merge = recent posts from celebrities :me follows  # read-time
  - return merge_sort(base, merge) limit 50
note: one celebrity post = 0 timeline writes, not 50,000,000`,
      note:
        "The hybrid pays a small read-time merge for celebrities to avoid unbounded write amplification, and keeps the common read (normal follows) a single precomputed lookup.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "Pagination: OFFSET vs cursor (keyset)",
      intro:
        "Fetch the next page of a timeline. Both return 50 rows; only one stays fast at page 2000 and doesn't duplicate rows when a new post arrives mid-scroll.",
      php: `-- WEAK: OFFSET pagination
-- Page N costs a scan of N*50 rows that are then thrown away.
SELECT id, author_id, body, created_at
FROM posts
WHERE author_id = ANY(:followees)
ORDER BY created_at DESC, id DESC
OFFSET 100000    -- page 2001: scan 100k rows, discard them
LIMIT 50;
-- Also: a new post shifts every row down one, so the
-- reader sees a duplicate at each page boundary.`,
      ts: `-- STRONG: cursor / keyset pagination
-- Client sends the last row it saw as the cursor.
SELECT id, author_id, body, created_at
FROM posts
WHERE author_id = ANY(:followees)
  AND (created_at, id) < (:cursor_created_at, :cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT 50;
-- Seeks straight to the position via an index on
-- (author_id, created_at, id): same cost on page 1 and
-- page 2001, and inserts never shift the window.`,
      note:
        "OFFSET scans and discards everything before the page and duplicates rows on concurrent inserts; a keyset cursor on (created_at, id) is an indexed seek with stable results — the pattern to name for any infinite scroll.",
      leftLang: "sql",
      rightLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A tiny social graph with one celebrity ('star', 8 followers) and one normal user ('bob'). It replays 5 posts under pure fan-out-on-write vs hybrid, printing timeline writes per post and one user's read path. Predict the two write totals before running.",
    code: `type UserId = string;

const followers = new Map<UserId, UserId[]>();
const following = new Map<UserId, UserId[]>();

function follow(follower: UserId, author: UserId): void {
  if (!followers.has(author)) followers.set(author, []);
  followers.get(author)!.push(follower);
  if (!following.has(follower)) following.set(follower, []);
  following.get(follower)!.push(author);
}

for (const fan of ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]) {
  follow(fan, "star");            // everyone follows the celebrity
}
follow("u1", "bob");              // bob is a normal account
follow("u2", "bob");

const CELEB_THRESHOLD = 5;
const isCelebrity = (a: UserId) =>
  (followers.get(a)?.length ?? 0) >= CELEB_THRESHOLD;

const events: UserId[] = ["star", "bob", "star", "bob", "star"];
const seqOf = new Map<string, number>();

console.log("=== fan-out write cost per post ===");
const pureTL = new Map<UserId, string[]>();
let pureWrites = 0;
events.forEach((author, i) => {
  const postId = \`p\${i + 1}(\${author})\`;
  seqOf.set(postId, i + 1);
  const fol = followers.get(author) ?? [];
  for (const f of fol) {
    if (!pureTL.has(f)) pureTL.set(f, []);
    pureTL.get(f)!.push(postId);
  }
  pureWrites += fol.length;
  console.log(\`  PURE   \${postId}: \${fol.length} timeline writes\`);
});
console.log(\`  PURE total writes: \${pureWrites}\`);

const hybridTL = new Map<UserId, string[]>();
const celebPosts = new Map<UserId, string[]>();
let hybridWrites = 0;
events.forEach((author, i) => {
  const postId = \`p\${i + 1}(\${author})\`;
  if (isCelebrity(author)) {
    if (!celebPosts.has(author)) celebPosts.set(author, []);
    celebPosts.get(author)!.push(postId);
    console.log(\`  HYBRID \${postId}: 0 writes (celebrity, merged on read)\`);
    return;
  }
  const fol = followers.get(author) ?? [];
  for (const f of fol) {
    if (!hybridTL.has(f)) hybridTL.set(f, []);
    hybridTL.get(f)!.push(postId);
  }
  hybridWrites += fol.length;
  console.log(\`  HYBRID \${postId}: \${fol.length} timeline writes\`);
});
console.log(\`  HYBRID total writes: \${hybridWrites}\`);

console.log("\\n=== one user's read path (u1 follows star + bob) ===");
console.log(\`PURE read:   \${(pureTL.get("u1") ?? []).join(" ")}  (0 merges)\`);

const merged = [...(hybridTL.get("u1") ?? [])];
for (const author of following.get("u1") ?? []) {
  if (isCelebrity(author)) merged.push(...(celebPosts.get(author) ?? []));
}
merged.sort((a, b) => (seqOf.get(a) ?? 0) - (seqOf.get(b) ?? 0));
console.log(\`HYBRID read: \${merged.join(" ")}  (merged celebrity feed)\`);
console.log("\\nSame timeline both ways; hybrid moved 24 writes off the hot path.");`,
  },

  keyPoints: [
    "A feed is read-heavy by orders of magnitude — that single fact justifies precomputing the read path (fan-out-on-write).",
    "Fan-out-on-write gives fast reads but suffers the celebrity problem: one post by 50M followers = 50M timeline writes.",
    "Fan-out-on-read has no write amplification but every read does a fan-in join and sort — it punishes the exact path that is hottest.",
    "The senior answer is hybrid: fan out on write for normal users, skip fan-out for celebrities, and merge their recent posts at read time.",
    "Data model: posts + follows tables plus a per-user timeline cache (e.g. a Redis list of post ids) that turns a read into one lookup.",
    "Paginate timelines with a keyset cursor on (created_at, id), never OFFSET — OFFSET scans-and-discards and duplicates rows on concurrent inserts.",
  ],

  interview: [
    {
      q: "Walk me through designing a home timeline. What's the central trade-off?",
      a: "I'd confirm the shape first: a follow graph, a create-post write, and a read-my-home-timeline that merges everyone I follow in reverse-chronological order — and critically, reads outnumber writes by orders of magnitude, so I want reads cheap. The central decision is where fan-out happens. Fan-out-on-write precomputes each user's timeline when a post is created: reads become one cache lookup, but a celebrity with fifty million followers triggers fifty million timeline writes per post. Fan-out-on-read computes at request time with no write amplification, but every read does a fan-in and sort on the hottest path. So I'd go hybrid: fan out on write for normal accounts, skip it for celebrities, and merge celebrity posts in at read time — you pay a small read-time merge for the few accounts where write fan-out would explode.",
    },
    {
      q: "Someone with 50 million followers posts. What happens in your design, and how do you keep it from taking the system down?",
      a: "In naive fan-out-on-write that post becomes fifty million writes into fifty million timeline caches — a write storm that can saturate the queue and the store. My fix is to classify authors by follower count: above a threshold they're 'celebrities' and we do zero fan-out on their posts. Their followers' read path then does a small extra step — pull the celebrity's recent posts and merge them into the precomputed timeline. So a celebrity post costs one row write, not fifty million, and the cost is spread across reads that were going to happen anyway. I'd also make the normal-user fan-out asynchronous through a queue so posting returns immediately and workers absorb the write fan-out.",
    },
    {
      q: "Why not paginate the feed with LIMIT/OFFSET?",
      a: "Two reasons. Cost: OFFSET 100000 makes the database scan and throw away a hundred thousand rows to reach page 2001, so deep pages get linearly slower. Correctness: a feed is a live list, so if a new post arrives between page requests, OFFSET shifts every row down and the reader sees a duplicate at the boundary. A keyset cursor fixes both — the client sends the last row it saw, and the query seeks with WHERE (created_at, id) < (cursor) using the index, so page 2001 costs the same as page 1 and new inserts never shift the window. It's the same 'WHERE id < ?' keyset I'd use on any big paged result set in SQL.",
    },
  ],

  quiz: [
    {
      question: "What is the 'celebrity problem' in a fan-out-on-write feed design?",
      options: [
        "Celebrities post too often and flood the queue with duplicate content",
        "One post by an account with millions of followers triggers millions of timeline writes",
        "Celebrity accounts get more reads than the cache can serve",
        "Verified accounts require a separate authentication path",
      ],
      answerIndex: 1,
      explain:
        "Fan-out-on-write copies each post into every follower's precomputed timeline. For an account with 50M followers that's 50M writes per post — a write storm. The hybrid fix skips fan-out for such accounts and merges their posts at read time.",
    },
    {
      question: "Why is fan-out-on-read a poor default for a large social feed?",
      options: [
        "It uses more storage than fan-out-on-write",
        "It cannot support the follow graph",
        "It puts a fan-in join and sort on the read path, which is the highest-traffic path",
        "It double-charges users for each post",
      ],
      answerIndex: 2,
      explain:
        "Feeds are read-heavy by orders of magnitude. Fan-out-on-read has no write amplification, but it forces every read to gather and sort posts from everyone you follow — loading the very path that carries the most traffic.",
    },
    {
      question: "Why use a keyset cursor instead of OFFSET for an infinite-scroll timeline?",
      options: [
        "OFFSET is not supported by PostgreSQL 18",
        "A cursor seeks via the index with stable results, while OFFSET scans-and-discards and duplicates rows on concurrent inserts",
        "OFFSET returns rows in random order",
        "A cursor lets you skip authentication on later pages",
      ],
      answerIndex: 1,
      explain:
        "OFFSET N scans and throws away N rows (slow deep pages) and shifts the window when new rows arrive (duplicates at boundaries). A keyset cursor on (created_at, id) is an indexed seek with constant cost and stable results.",
    },
  ],
};

export default lesson;
