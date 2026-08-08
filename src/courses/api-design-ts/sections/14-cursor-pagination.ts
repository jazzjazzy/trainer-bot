import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "cursor-pagination",
  title: "Cursor Pagination",
  part: "Collections & Evolution",
  estMinutes: 13,
  summary:
    "Keyset pagination — 'give me rows after this key' — is stable under writes and constant-cost at any depth; wrap the key in an opaque base64url cursor so clients can't fabricate or depend on it.",

  concept: `
Offset pagination asks the database for a *position*: "skip 100,000 rows".
Keyset (cursor) pagination asks for a *location in the sort order*: "rows that
come after this one". That single change fixes both offset problems at once.

### The keyset idea

Sort by something stable, remember where the last page ended, and continue
from there with a WHERE clause instead of an OFFSET:

\`\`\`sql
SELECT id, title, created_at
FROM posts
WHERE (created_at, id) < (:cursor_created_at, :cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
\`\`\`

With an index on \`(created_at, id)\`, the database *seeks* straight to the key
and reads 20 rows — the same cost on page 2 as on page 5,000. And because the
query says "after this row" rather than "at position n", inserted or deleted
rows elsewhere can't shift the window: no duplicates, no skips.

### The tie-breaker is not optional

\`created_at\` alone is not a valid sort key, because two rows can share a
timestamp. If page 1 ends mid-tie, "created_at < :c" either re-serves or skips
the twins. The fix is to append a **unique tie-breaker column** — almost
always the primary key — so the tuple \`(created_at, id)\` gives a total order.
The row-value comparison \`(created_at, id) < (:c, :i)\` means: earlier
timestamp, or same timestamp with a smaller id. (Databases without row-value
syntax spell it \`created_at < :c OR (created_at = :c AND id < :i)\`.)

### Make the cursor opaque

You *could* put \`?after_created_at=...&after_id=17\` in the URL — the PHP
instinct. Don't. Serialize the key tuple and base64url-encode it, so the
client sees \`?cursor=eyJjIjoiMjAyNi0w...\`:

- **Clients can't fabricate cursors** or turn your sort internals into query
  hacks — the cursor came from you or it's a 400.
- **Clients can't depend on the contents.** The day you change the sort key
  from \`created_at\` to a ranking score, the cursor format changes with it and
  no client breaks, because no client ever parsed it.
- **You still validate on the way in.** Base64 is encoding, not trust: decode,
  parse, check shapes and types, reject anything malformed. (For hard
  tamper-proofing you can HMAC-sign cursors, but strict validation is the
  baseline.)

### Termination and the envelope

The response envelope carries the next cursor, and \`null\` means done:

\`\`\`json
{ "data": [ ... ], "meta": { "nextCursor": "eyJjIjoi..." } }
\`\`\`

A common trick: fetch \`limit + 1\` rows; if you got the extra one, there's
another page — build \`nextCursor\` from row \`limit\`; otherwise \`nextCursor\`
is \`null\`.

### The honest trade-offs

Cursors give up things offset had, and interviewers respect you for saying so:
**no jump-to-page** (a cursor only knows "after here", so "page 47 of 90" UX
is out), **totals are extra work** (no cheap \`totalPages\`; if the product
needs a count, run it separately and label it approximate), and cursors are
only stable for one sort order — offer a fixed set of sorts, not arbitrary
ones. Infinite feeds, sync APIs, and full-iteration exports don't need any of
what was lost — that's why cursors dominate there.
`,

  comparisons: [
    {
      label: "Offset SQL vs keyset SQL for the same page",
      intro:
        "Both fetch the 'next 20 posts' deep into a newest-first feed. Compare how much work each asks the database to do, and what happens if a row is inserted meanwhile.",
      php: `-- offset: "position 100,000" — produce and discard
-- 100,000 rows to find the window; inserts shift it.
SELECT id, title, created_at
FROM posts
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 100000;`,
      ts: `-- keyset: "after this row" — with an index on
-- (created_at, id) this SEEKS to the key and reads 20 rows.
-- Cost is identical at any depth; writes can't shift the window.
SELECT id, title, created_at
FROM posts
WHERE (created_at, id) < (:cursor_created_at, :cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;`,
      note:
        "The id tie-breaker in both the WHERE tuple and the ORDER BY is what makes the order total — created_at alone duplicates or skips rows that share a timestamp.",
      leftLang: "sql",
      rightLang: "sql",
    },
    {
      label: "Raw last_id in the URL vs an opaque validated cursor",
      intro:
        "Both continue a feed after row 17. The PHP version exposes the key material as query params; the TS version hands out an encoded token and validates it on the way back in.",
      php: `<?php // feed.php?after_id=17&after_ts=2026-07-06+16:30:00
$afterId = $_GET['after_id'] ?? PHP_INT_MAX;
$afterTs = $_GET['after_ts'] ?? '9999-12-31';

// The sort key is now a public API: clients build these
// params by hand, bookmark them, and depend on them.
// Change the sort and every integration breaks.
$stmt = $pdo->prepare(
  'SELECT * FROM posts
   WHERE (created_at, id) < (?, ?)
   ORDER BY created_at DESC, id DESC LIMIT 20');
$stmt->execute([$afterTs, $afterId]);`,
      ts: `// src/http/cursor.ts
interface CursorKey { c: string; i: number } // createdAt, id

function encodeCursor(key: CursorKey): string {
  return btoa(JSON.stringify(key))
    .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}

function decodeCursor(raw: string): CursorKey | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const key = JSON.parse(atob(b64));
    if (typeof key.c !== "string" || !Number.isInteger(key.i)) return null;
    if (Number.isNaN(Date.parse(key.c))) return null;
    return { c: key.c, i: key.i };
  } catch {
    return null; // bad base64, bad JSON, wrong shape → caller sends 400
  }
}`,
      note:
        "Opacity is a contract boundary: clients echo the token back untouched, so you can change the key tuple, the encoding, or the sort without breaking anyone — and decodeCursor treats every incoming token as hostile until validated.",
    },
    {
      label: "The collection envelope: page numbers vs cursors",
      intro:
        "The same feed response under each scheme. Notice what the cursor version no longer promises — and what it promises instead.",
      php: `{
  "data": [ { "id": "220" }, { "id": "219" } ],
  "meta": {
    "page": 2,
    "perPage": 20,
    "total": 8143,
    "totalPages": 408
  }
}`,
      ts: `{
  "data": [ { "id": "220" }, { "id": "219" } ],
  "meta": {
    "nextCursor": "eyJjIjoiMjAyNi0wNy0wNlQxNjozMDowMFoiLCJpIjoyMTl9"
  }
}

// last page:
// "meta": { "nextCursor": null }`,
      note:
        "No page numbers, no totals — just 'here's how to continue' and null when done. Clients loop until nextCursor is null instead of computing page counts.",
      leftLang: "json",
      rightLang: "json",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A full cursor pipeline over 9 posts, page size 3. Ids 7 and 6 share a timestamp exactly at the page-1/page-2 boundary — the tie-breaker case. Predict how many pages the loop fetches and what happens to the forged cursor at the end, then run it.",
    code: `// Cursor pagination end-to-end: encode → fetch → decode → validate.
interface Post { id: number; createdAt: string }

// Newest first. Ids 7 and 6 share a timestamp, and page 1 will END on id 7:
// without the id tie-breaker, id 6 would be skipped or re-served.
const posts: Post[] = [
  { id: 9, createdAt: "2026-07-07T10:00:00Z" },
  { id: 8, createdAt: "2026-07-07T09:00:00Z" },
  { id: 7, createdAt: "2026-07-06T16:30:00Z" },
  { id: 6, createdAt: "2026-07-06T16:30:00Z" },
  { id: 5, createdAt: "2026-07-05T12:00:00Z" },
  { id: 4, createdAt: "2026-07-05T12:00:00Z" },
  { id: 3, createdAt: "2026-07-04T08:00:00Z" },
  { id: 2, createdAt: "2026-07-03T19:00:00Z" },
  { id: 1, createdAt: "2026-07-02T07:00:00Z" },
];

interface CursorKey { c: string; i: number }

function encodeCursor(key: CursorKey): string {
  return btoa(JSON.stringify(key))
    .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}

function decodeCursor(raw: string): CursorKey | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const key = JSON.parse(atob(b64));
    if (typeof key.c !== "string" || !Number.isInteger(key.i)) return null;
    if (Number.isNaN(Date.parse(key.c))) return null;
    return { c: key.c, i: key.i };
  } catch {
    return null;
  }
}

const limit = 3;

// WHERE (createdAt, id) < (:c, :i) ORDER BY createdAt DESC, id DESC LIMIT n
// ISO-8601 UTC strings compare correctly as plain strings — by design.
function fetchPage(cursor: string | null) {
  let key: CursorKey | null = null;
  if (cursor !== null) {
    key = decodeCursor(cursor);
    if (key === null) return { status: 400, error: "invalid cursor" } as const;
  }
  const after = key; // narrow for the closure
  const matching = posts.filter((p) =>
    after === null ||
    p.createdAt < after.c ||
    (p.createdAt === after.c && p.id < after.i)
  );
  const data = matching.slice(0, limit);
  const hasMore = matching.length > limit;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ c: last.createdAt, i: last.id }) : null;
  return { status: 200, data, nextCursor } as const;
}

// Client loop: follow nextCursor until null.
let cursor: string | null = null;
let pageNo = 1;
while (true) {
  const page = fetchPage(cursor);
  if (page.status !== 200) break;
  console.log(\`page \${pageNo}: ids [\${page.data.map((p) => p.id).join(", ")}]\`);
  console.log(\`  nextCursor: \${page.nextCursor}\`);
  if (page.nextCursor === null) break;
  cursor = page.nextCursor;
  pageNo++;
}

// A client fabricates a cursor (SQL-ish payload where the id should be):
const forged = btoa(JSON.stringify({ c: "2026-07-06T16:30:00Z", i: "7 OR 1=1" }));
const attempt = fetchPage(forged);
console.log(\`forged cursor -> \${attempt.status}\${attempt.status === 400 ? " " + attempt.error : ""}\`);`,
  },

  keyPoints: [
    "Keyset pagination replaces `OFFSET n` with `WHERE (created_at, id) < (:c, :i) ORDER BY created_at DESC, id DESC LIMIT n` — an index seek, so every page costs the same and concurrent writes can't cause duplicates or skips.",
    "The unique tie-breaker column (usually the primary key) is mandatory: timestamps collide, and without a total order pages re-serve or skip rows at the boundary.",
    "Cursors are opaque: base64url-encode the key tuple, and clients echo it back untouched — they can't fabricate positions or depend on internals, so you can change the encoding or sort key freely.",
    "Opacity is not trust: decode, parse, and type-check every incoming cursor, returning 400 for anything malformed; HMAC-signing is the upgrade if tampering matters.",
    "Fetch `limit + 1` rows to detect whether another page exists; the envelope carries `meta.nextCursor`, and `null` is the termination signal clients loop on.",
    "Trade-offs to volunteer in an interview: no jump-to-page, totals cost extra, and a cursor is only valid for one sort order — perfect for feeds, sync, and exports; wrong for 'page 47 of 90' UX.",
  ],

  interview: [
    {
      q: "Explain cursor pagination and why it beats offset for a busy feed.",
      a: "Instead of asking for a position ('skip 100,000 rows'), the client presents a cursor that encodes the sort key of the last row it saw, and the server queries `WHERE (created_at, id) < (:c, :i) ORDER BY created_at DESC, id DESC LIMIT n`. Two wins. Performance: with an index on `(created_at, id)` that's a seek plus n reads — constant cost at any depth, where OFFSET does work proportional to the offset. Stability: 'after this row' is unaffected by inserts and deletes elsewhere, so no duplicated or skipped rows mid-scroll, which offset can't avoid on a high-write feed. The costs are no random access to page N and no cheap total count — acceptable for infinite scroll, which never shows page numbers anyway.",
    },
    {
      q: "Why do APIs make cursors opaque instead of just passing ?after_id=17?",
      a: "Because anything readable in a URL becomes a public contract. If clients see `after_id` and `after_ts`, they'll construct those params themselves, bookmark them, and build logic on them — and the day I change the sort from `created_at` to a ranking score, every integration breaks. An opaque base64url token means the only valid cursor is one I issued, clients echo it back untouched, and I can change the key tuple or encoding at will. It also closes a manipulation door: clients can't inject fabricated positions. One caveat I'd always add: base64 is encoding, not security — the server still decodes, validates types and shape, and 400s anything malformed; HMAC-sign the cursor if tampering is a real threat.",
    },
    {
      q: "Why does a cursor need a tie-breaker column, and what happens without one?",
      a: "The cursor's WHERE clause continues from 'strictly after the last key value', so the sort key must give every row a unique position — a total order. Timestamps don't: bulk imports and busy systems create rows sharing the same `created_at`. If page 1 ends between two rows with an identical timestamp, `created_at < :c` skips the twin (it's not strictly less), while `created_at <= :c` re-serves rows you already sent. Appending the primary key — `ORDER BY created_at DESC, id DESC` with `WHERE (created_at, id) < (:c, :i)` — breaks every tie deterministically. The composite index should match that column pair so the query stays a pure seek.",
    },
  ],

  quiz: [
    {
      question:
        "Why is `WHERE (created_at, id) < (:c, :i) ... LIMIT 20` cheap at page 5,000 when `OFFSET 100000` is not?",
      options: [
        "Row-value comparisons are computed by the client, not the database",
        "With an index on (created_at, id) the database seeks directly to the key and reads 20 rows, instead of producing and discarding 100,000",
        "The keyset query skips the ORDER BY step entirely",
        "It caches the previous page's rows in the connection",
      ],
      answerIndex: 1,
      explain:
        "OFFSET must count its way through the ordered result — O(offset) every request. The keyset predicate describes an index position, so the engine seeks there in O(log n) and reads just the page. Same ORDER BY, radically different work.",
    },
    {
      question:
        "Your feed sorts by created_at DESC only, and page 1 happens to end on one of three rows sharing the same timestamp. What does cursor pagination with `created_at < :c` do?",
      options: [
        "Works fine — LIMIT handles the ties automatically",
        "Returns the three tied rows again on page 2",
        "Skips the other tied rows entirely, because they are not strictly less than the cursor timestamp",
        "Throws a database error for a non-unique sort key",
      ],
      answerIndex: 2,
      explain:
        "Strictly-less-than excludes rows equal to the cursor's timestamp, so the remaining twins are silently skipped ('<=' would instead re-serve sent rows). This is why the sort key must include a unique tie-breaker: (created_at, id) gives a total order and the boundary is exact.",
    },
    {
      question: "What should a well-designed API do when it receives ?cursor=HELLO%21 (not a token it issued)?",
      options: [
        "Treat it as null and return the first page",
        "Decode what it can and start from the closest matching row",
        "Return 400 with a Problem Details body saying the cursor is invalid",
        "Return 404 because the cursor resource does not exist",
      ],
      answerIndex: 2,
      explain:
        "A cursor the server cannot decode and validate is a malformed request parameter — a client error, so 400 (invalid cursor) with a problem body. Silently returning page 1 masks client bugs and turns broken loops into infinite re-reads; 'closest match' means acting on unvalidated input.",
    },
  ],
};

export default lesson;
