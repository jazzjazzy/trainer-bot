import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "sorting-and-pagination",
  title: "Sorting and Pagination: OFFSET vs Cursor",
  part: "Queries & CRUD",
  estMinutes: 12,
  summary:
    "orderBy/limit/offset map straight across in both ORMs — the real skill is knowing why OFFSET dies at depth and how cursor (keyset) pagination fixes it with a deterministic tiebreaker.",

  concept: `
Sorting and paging are the least surprising part of either ORM — the API is a
thin skin over the SQL. The valuable part is the conversation *behind* the
API: why \`OFFSET 100000\` is slow, and what to do instead. That's a pure SQL
question, which makes it your home turf.

### The APIs, quickly

\`\`\`ts
// Prisma
await prisma.post.findMany({
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  take: 20,
  skip: 40,        // OFFSET 40
});

// Drizzle
await db.select().from(posts)
  .orderBy(desc(posts.createdAt), desc(posts.id))
  .limit(20)
  .offset(40);
\`\`\`

Both emit exactly the \`ORDER BY ... LIMIT 20 OFFSET 40\` you'd write by hand.

### Why OFFSET dies at depth

\`LIMIT 20 OFFSET 100000\` doesn't jump to row 100,001. Postgres must
**produce and discard** 100,000 rows first — walk the index (or sort), fetch,
count, throw away. Page 1 is instant; page 5,000 reads 100,020 rows to return
20. Cost grows linearly with depth, and it's all wasted work.

OFFSET has a second, sneakier bug you've likely debugged in production PHP:
**pages shift under writes**. If rows are inserted or deleted between page
requests, offsets slide — users see duplicates or miss rows entirely.

### Keyset (cursor) pagination

Instead of counting rows to skip, remember **where the last page ended** and
seek straight there:

\`\`\`sql
SELECT * FROM posts
WHERE (created_at, id) < ($1, $2)      -- row-value comparison
ORDER BY created_at DESC, id DESC
LIMIT 20;
\`\`\`

With an index on \`(created_at DESC, id DESC)\` this is an index seek —
constant cost at any depth, and immune to shifting because the cursor is a
value, not a position.

### The tiebreaker is not optional

\`ORDER BY created_at\` alone is **non-deterministic** when timestamps
collide — Postgres may return equal rows in any order, so boundary rows get
skipped or duplicated between pages. Always append a unique column
(\`id\`) to the ORDER BY *and* the cursor. If you've ever chased a
"pagination sometimes shows the same row twice" bug in a PHP app, this was
probably it.

### Each ORM's idiom

**Prisma** builds cursor pagination in: \`cursor\` marks the last-seen row
(it must be a unique field or combination), \`skip: 1\` excludes the cursor
row itself, \`take\` is the page size, and \`orderBy\` must produce a stable
order.

**Drizzle** has no cursor option — you write the keyset WHERE yourself with
\`or\`/\`and\`/\`gt\`/\`lt\` (or a raw row-value comparison via \`sql\`), which its own
docs recommend for exactly the reasons above.

Trade-off to volunteer in interviews: keyset can't jump to page 47 and needs
a separate count for "page X of Y" UIs. For infinite scroll, feeds, and API
pagination it's strictly better; for a 30-row admin table, OFFSET is fine.
`,

  comparisons: [
    {
      label: "Deep OFFSET vs Prisma cursor",
      intro:
        "Page deep into a posts feed. The OFFSET version reads and discards 100,000 rows; the cursor version seeks straight to the boundary and reads 21.",
      php: `-- page 5,001 of a feed, OFFSET style
SELECT id, title, created_at
FROM posts
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 100000;

-- Postgres produces 100,020 rows and
-- discards 100,000 of them. Every deeper
-- page costs more, and concurrent inserts
-- shift the pages under the user.`,
      ts: `// Prisma cursor pagination
const page = await prisma.post.findMany({
  take: 20,
  skip: 1, // exclude the cursor row itself
  cursor: { id: lastSeenId }, // unique field
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
});

// The cursor marks WHERE the last page ended;
// with an index on (created_at, id) this is a
// seek — the same cost at page 2 or page 5,000,
// and inserts can't shift the boundary.`,
      note:
        "skip: 1 is the idiom's easy-to-miss detail: without it the cursor row itself is returned again as the first row of every page. Prisma's cursor must reference a unique field or combination.",
      leftLang: "sql",
    },
    {
      label: "PDO page-N loop vs Drizzle keyset",
      intro:
        "The classic page-number loop computes an OFFSET from $page; the Drizzle version carries a (createdAt, id) cursor forward instead.",
      php: `<?php
// the ?page=N handler you have maintained
$page = max(1, (int) ($_GET['page'] ?? 1));
$perPage = 20;
$offset = ($page - 1) * $perPage;

$stmt = $pdo->prepare(
    'SELECT id, title, created_at FROM posts
     ORDER BY created_at DESC, id DESC
     LIMIT :limit OFFSET :offset'
);
$stmt->bindValue('limit', $perPage, PDO::PARAM_INT);
$stmt->bindValue('offset', $offset, PDO::PARAM_INT);
$stmt->execute();
$posts = $stmt->fetchAll();
// page 5000 => OFFSET 99980: scan and discard`,
      ts: `import { and, or, eq, lt, desc } from "drizzle-orm";

// cursor = { createdAt, id } of the last row seen
const rows = await db
  .select()
  .from(posts)
  .where(
    cursor
      ? or(
          lt(posts.createdAt, cursor.createdAt),
          and(
            eq(posts.createdAt, cursor.createdAt),
            lt(posts.id, cursor.id),
          ),
        )
      : undefined,
  )
  .orderBy(desc(posts.createdAt), desc(posts.id))
  .limit(20);
// WHERE (created_at, id) < (cursor...) — spelled
// out as OR/AND, served by one composite index.`,
      note:
        "Drizzle has no cursor helper — you hand-build the keyset predicate (the OR/AND expansion of a row-value comparison). Index (created_at, id) to make it a pure seek.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Cursor pagination over an in-memory table. Posts 4 and 5 share a createdAt — exactly the collision that breaks tiebreaker-less pagination. Predict what page 2 starts with, then run.",
    code: `// Keyset (cursor) pagination over an in-memory "table".
// Note ids 4 and 5 share a createdAt — the tiebreaker earns its keep.

interface Post {
  id: number;
  createdAt: number; // epoch seconds, duplicates allowed
  title: string;
}

const posts: Post[] = [
  { id: 1, createdAt: 100, title: 'Hello world' },
  { id: 2, createdAt: 200, title: 'PDO memories' },
  { id: 3, createdAt: 300, title: 'Generics clicked' },
  { id: 4, createdAt: 400, title: 'Same second, post A' },
  { id: 5, createdAt: 400, title: 'Same second, post B' },
  { id: 6, createdAt: 500, title: 'Drizzle keyset' },
  { id: 7, createdAt: 600, title: 'Prisma cursors' },
];

// ORDER BY created_at DESC, id DESC — id is the deterministic tiebreaker.
const sorted = [...posts].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);

interface Cursor {
  createdAt: number;
  id: number;
}

function fetchPage(size: number, cursor?: Cursor) {
  // WHERE (created_at, id) < (cursor.createdAt, cursor.id)
  const rows = sorted
    .filter(
      (p) =>
        !cursor ||
        p.createdAt < cursor.createdAt ||
        (p.createdAt === cursor.createdAt && p.id < cursor.id),
    )
    .slice(0, size);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: last ? { createdAt: last.createdAt, id: last.id } : undefined,
  };
}

const label = (p: Post) => \`#\${p.id}@\${p.createdAt}\`;

const page1 = fetchPage(3);
console.log('page 1 :', page1.rows.map(label).join('  '));
console.log('cursor :', JSON.stringify(page1.nextCursor));

const page2 = fetchPage(3, page1.nextCursor);
console.log('page 2 :', page2.rows.map(label).join('  '));

// Without the id tiebreaker, #4 (same createdAt as the cursor row #5)
// could be skipped or repeated. With it, page 2 starts exactly at #4.`,
  },

  keyPoints: [
    "`orderBy`/`take`/`skip` (Prisma) and `.orderBy()/.limit()/.offset()` (Drizzle) emit exactly the ORDER BY/LIMIT/OFFSET you'd write yourself.",
    "OFFSET N makes Postgres produce and discard N rows — cost grows linearly with page depth, and concurrent inserts shift pages, causing duplicates and gaps.",
    "Keyset pagination seeks with `WHERE (created_at, id) < (cursor)` + matching composite index: constant cost at any depth, immune to shifting.",
    "Prisma's idiom: `cursor: { id: lastSeenId }` (unique field), `take` for page size, `skip: 1` to exclude the cursor row, and a stable `orderBy`.",
    "Drizzle has no cursor option — hand-build the keyset predicate with `or(lt(...), and(eq(...), lt(...)))`.",
    "Always append a unique tiebreaker (`id`) to the ORDER BY and the cursor — equal timestamps make the order non-deterministic and pages skip or repeat rows.",
  ],

  interview: [
    {
      q: "Why is LIMIT 20 OFFSET 100000 slow, and what's the alternative?",
      a: "OFFSET isn't a jump — Postgres has to produce the first 100,000 rows of the ordered result and throw them away before returning your 20, so cost grows linearly with depth even with a perfect index. It's also incorrect under concurrency: inserts and deletes between requests shift the offsets, so users see duplicated or missing rows. The alternative is keyset (cursor) pagination: remember the sort-key values of the last row — say `(created_at, id)` — and query `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20`. With a composite index on those columns that's an index seek, constant cost at any depth, and stable because the cursor is a value rather than a position. The trade-off: no random access to page 47, so classic numbered-pages UIs still need OFFSET or a hybrid.",
    },
    {
      q: "Walk me through Prisma's cursor pagination idiom.",
      a: "Three pieces: `cursor: { id: lastSeenId }` bookmarks the last row of the previous page and must reference a unique field or unique combination; `take: 20` is the page size; and `skip: 1` skips the cursor row itself — leave it out and every page starts by repeating the row you ended on. You also need an `orderBy` that produces a stable, deterministic order, so I always include a unique tiebreaker like `id`. The client returns the page, I read the last row's id as the next cursor, and the underlying SQL becomes a seek on the ordered index instead of a scan-and-discard. Drizzle deliberately doesn't wrap this — you write the keyset `WHERE` yourself with `or`/`and`/`lt`, which I actually like because the SQL is explicit.",
    },
    {
      q: "Why does ORDER BY created_at need a tiebreaker for pagination to be correct?",
      a: "Because SQL ordering is only defined up to the columns you give it. Two rows with the same `created_at` can legally come back in either order, and Postgres can even change its mind between executions — different plan, different order. For pagination that's fatal: if the page boundary falls inside a group of equal timestamps, the next request can skip or repeat rows in that group. Appending a unique column — `ORDER BY created_at DESC, id DESC` — makes the total order deterministic, and for keyset pagination the tiebreaker must also be part of the cursor and the WHERE predicate. I've debugged this exact 'the same row shows up on two pages' bug in production PHP; it's almost always a missing tiebreaker.",
    },
  ],

  quiz: [
    {
      question: "What does Postgres actually do for LIMIT 20 OFFSET 100000?",
      options: [
        "Uses the index to jump directly to row 100,001",
        "Produces the first 100,020 rows of the ordered result and discards 100,000 of them",
        "Caches earlier pages so only 20 rows are read",
        "Rejects the query unless an index covers the ORDER BY",
      ],
      answerIndex: 1,
      explain:
        "OFFSET is implemented as produce-and-discard: the executor generates rows in order and counts them off. Cost is linear in the offset, which is why deep pages crawl even when page 1 is instant.",
    },
    {
      question: "In Prisma's cursor pagination, what is skip: 1 for?",
      options: [
        "It skips one page ahead",
        "It excludes the cursor row itself, which would otherwise repeat as the first row of the new page",
        "It reserves one row for the next-cursor lookup",
        "It's required whenever take is used",
      ],
      answerIndex: 1,
      explain:
        "The cursor positions the result set AT the last-seen row (a unique field), so without skip: 1 that row is returned again. skip: 1 steps past it so the page starts at the first new row.",
    },
    {
      question:
        "A feed ordered by created_at (no tiebreaker) sometimes shows the same post on two consecutive pages. Most likely cause?",
      options: [
        "The index on created_at is bloated",
        "Equal created_at values make the order non-deterministic, so rows at the page boundary reshuffle between queries",
        "The LIMIT is too small",
        "Postgres caches the first page",
      ],
      answerIndex: 1,
      explain:
        "With duplicate sort keys, SQL guarantees no particular order among the ties — the boundary rows can swap between executions, duplicating or dropping rows across pages. Appending a unique id to ORDER BY (and to the cursor) fixes it.",
    },
    {
      question: "When is OFFSET pagination still a reasonable choice?",
      options: [
        "Never — keyset is strictly better",
        "Small datasets and UIs needing random access to numbered pages, where depth stays shallow",
        "Only on tables without a primary key",
        "Whenever the table has an index on the sort column",
      ],
      answerIndex: 1,
      explain:
        "Keyset can't jump to page 47 — it only moves relative to a cursor. For small tables, admin grids, and 'page X of Y' UIs with shallow depth, OFFSET's simplicity wins; keyset earns its complexity on deep, high-churn feeds.",
    },
  ],
};

export default lesson;
