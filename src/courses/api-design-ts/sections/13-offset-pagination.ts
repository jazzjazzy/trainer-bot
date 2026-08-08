import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "offset-pagination",
  title: "Offset Pagination & Its Limits",
  part: "Collections & Evolution",
  estMinutes: 11,
  summary:
    "The classic ?page=2&per_page=20 model: how to build it properly with a typed envelope, and the two failure modes — page drift and O(offset) cost — you must be able to explain in an interview.",

  concept: `
Every PHP developer has built this: \`?page=2&per_page=20\` mapped to
\`LIMIT 20 OFFSET 20\`, a \`COUNT(*)\` for the total, and page-number links at
the bottom of the table. It's the right tool more often than pagination
snobs admit — but a senior candidate can also state precisely where it breaks.

### The well-built version

Three ingredients:

1. **Validated params.** \`page ≥ 1\`, \`perPage\` clamped to a maximum (say 100)
   — otherwise someone requests \`per_page=100000\` and your API becomes a
   table-dump service.
2. **A typed envelope.** Collections carry their metadata with them:

\`\`\`ts
interface Page<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}
\`\`\`

3. **Parameterised SQL.** \`LIMIT ? OFFSET ?\` with bound values — the offset is
   computed as \`(page - 1) * perPage\`, never interpolated from the query string.

### Failure mode 1: page drift

Offset pagination addresses rows by *position*, and positions move. Suppose a
feed is sorted newest-first and a user is reading page 1 (rows 1–20). A new
row is inserted at the top. Every existing row shifts down one position — so
when the user requests page 2, the row that *was* number 20 is now number 21,
and they see it again. **Inserts cause duplicates; deletes cause rows to be
skipped entirely.** For an admin table that changes weekly, nobody notices.
For a busy feed, page 2 is measurably wrong by the time anyone clicks it.

### Failure mode 2: OFFSET is O(offset)

\`LIMIT 20 OFFSET 100000\` does not "jump" to row 100,000. The database must
still *produce* the first 100,020 rows of the ordered result — walking the
index, checking visibility — and then throw 100,000 of them away. Cost grows
linearly with page depth: page 1 is fast, page 5,000 is a slow query, and a
crawler iterating every page turns your listing endpoint into a load test.
The \`COUNT(*)\` for \`totalPages\` is its own full scan on big tables, too.

### When offset is genuinely fine

Don't cargo-cult cursors everywhere. Offset pagination is the *right* choice
when:

- the dataset is **small or slow-changing** (admin screens, back-office CRUD);
- users genuinely need **jump-to-page** ("take me to page 47") or sortable
  columns with random access;
- the total count is cheap and the UX wants "page 3 of 12".

The interview move is to present it as a trade-off: offset buys random access
and trivially simple implementation, and pays with drift under writes and
linear cost at depth. When both of those bite — busy data, deep scrolling —
you reach for cursor pagination, which is the next section.
`,

  comparisons: [
    {
      label: "Concatenated LIMIT/OFFSET vs validated params and a typed envelope",
      intro:
        "Both serve GET /products?page=2&per_page=20. The PHP version pastes query-string values into SQL and echoes a bare array; the TS version validates, clamps, binds, and returns a Page<T>.",
      php: `<?php // products.php
$page    = $_GET['page'] ?? 1;
$perPage = $_GET['per_page'] ?? 20;
$offset  = ($page - 1) * $perPage;

// String-built SQL: ?per_page=20;DROP... is one mistake away,
// and ?per_page=100000 is a free table dump.
$sql  = "SELECT * FROM products ORDER BY created_at DESC "
      . "LIMIT $perPage OFFSET $offset";
$rows = $pdo->query($sql)->fetchAll();
echo json_encode($rows); // bare array, no total, no page info`,
      ts: `// routes/products.ts
interface Page<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

app.get("/products", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 20));

  const [rows, total] = await Promise.all([
    db.query("SELECT * FROM products ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
      [perPage, (page - 1) * perPage]),
    db.count("SELECT COUNT(*) FROM products"),
  ]);

  const body: Page<Product> = {
    data: rows.map(serializeProduct),
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  };
  res.json(body);
}));`,
      note:
        "Three upgrades: bound parameters (no injection), a clamped perPage (no table dumps), and an envelope so clients get total/totalPages instead of guessing when to stop.",
    },
    {
      label: "The same query at page 2 and page 5,000",
      intro:
        "Identical shape, wildly different cost. Read both and estimate how many rows the database must produce before it can return 20 of them.",
      php: `-- page 2: produce 40 rows, discard 20. Fast.
SELECT id, title, created_at
FROM products
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 20;`,
      ts: `-- page 5000: produce 100,020 rows, discard 100,000.
-- OFFSET cannot skip; it counts its way down the index
-- every single time this page is requested.
SELECT id, title, created_at
FROM products
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 100000;

-- and the envelope's total needs its own scan:
SELECT COUNT(*) FROM products;`,
      note:
        "OFFSET n is O(n): the database walks and discards n rows per request. Deep pages get linearly slower, and paginating crawlers hit every depth.",
      leftLang: "sql",
      rightLang: "sql",
    },
    {
      label: "Page drift on the wire",
      intro:
        "A newest-first feed, 20 per page. Between the two requests, one row is inserted at the top. Compare the last id of page 1 with the first id of page 2.",
      php: `$ curl 'https://api.example.com/posts?page=1&per_page=20'
# 12:00:00 — ids returned:
{ "data": [ /* ids 220 ... 201 */ ],
  "meta": { "page": 1, "total": 220 } }

# 12:00:30 — post 221 is created, shifting
# every existing row down one position.`,
      ts: `$ curl 'https://api.example.com/posts?page=2&per_page=20'
# 12:01:00 — ids returned:
{ "data": [ /* ids 201 ... 182 */ ],
  "meta": { "page": 2, "total": 221 } }

# id 201 was the LAST row of page 1 and is now
# the FIRST row of page 2 — shown to the user twice.
# A delete would do the opposite: a row nobody ever sees.`,
      note:
        "Offset addresses rows by position and writes move positions. Duplicates from inserts, silent gaps from deletes — invisible on stable admin tables, constant on busy feeds.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "An in-memory offset paginator over 100 rows (newest first). We fetch page 1, insert a row, fetch page 2 — predict which id the user sees twice. Then the delete variant: predict which ids are never shown at all.",
    code: `// Offset pagination over an in-memory table, newest (highest id) first.
interface Row { id: number }

function makeRows(): Row[] {
  const rows: Row[] = [];
  for (let id = 100; id >= 1; id--) rows.push({ id });
  return rows;
}

const perPage = 10;

function fetchPage(rows: Row[], page: number) {
  const offset = (page - 1) * perPage;          // LIMIT ? OFFSET ?
  const data = rows.slice(offset, offset + perPage);
  const total = rows.length;
  return { data, meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) } };
}

const ids = (rows: Row[]) => rows.map((r) => r.id).join(", ");

// ── Scenario 1: an INSERT between page 1 and page 2 ──────────────
const feed = makeRows();
const page1 = fetchPage(feed, 1);
console.log("page 1:", ids(page1.data));
console.log("meta:  ", JSON.stringify(page1.meta));

feed.unshift({ id: 101 }); // new row lands at the top of the feed
console.log("... row 101 inserted while the user reads page 1 ...");

const page2 = fetchPage(feed, 2);
console.log("page 2:", ids(page2.data));

const seen = new Set(page1.data.map((r) => r.id));
const dupes = page2.data.filter((r) => seen.has(r.id));
console.log("DUPLICATED for the user:", ids(dupes));

// ── Scenario 2: DELETES between page 1 and page 2 ────────────────
const feed2 = makeRows();
const p1 = fetchPage(feed2, 1);
console.log("\\npage 1:", ids(p1.data));

// The two newest rows are deleted before the user clicks "next":
feed2.splice(0, 2);
console.log("... rows 100 and 99 deleted ...");

const p2 = fetchPage(feed2, 2);
console.log("page 2:", ids(p2.data));

// Page 1 ended at 91, so the user expected 90 next — but every row
// shifted UP two positions, so offset 10 now starts at 88:
const shown = new Set([...p1.data, ...p2.data].map((r) => r.id));
const skipped = [90, 89].filter((id) => !shown.has(id));
console.log("SKIPPED, never shown:", skipped.join(", "));`,
  },

  keyPoints: [
    "Offset pagination maps `?page=2&per_page=20` to `LIMIT 20 OFFSET 20`; compute the offset server-side from validated numbers and always bind parameters — never interpolate query-string values into SQL.",
    "Clamp `perPage` to a documented maximum, or `?per_page=100000` turns your endpoint into a table-dump service.",
    "Return a typed envelope — `Page<T>` with `data` plus `meta: { page, perPage, total, totalPages }` — so clients know when to stop without probing for an empty page.",
    "Page drift: offset addresses rows by position, so inserts make the user see duplicate rows and deletes make rows vanish without ever being shown.",
    "`OFFSET n` is O(n) — the database produces and discards n rows per request, so page 5,000 is linearly slower than page 2, and `COUNT(*)` for totals adds its own scan.",
    "Offset is still the right choice for small or stable datasets and jump-to-page UX (admin tables, back-office CRUD); reach for cursors when data is busy and paging is deep.",
  ],

  interview: [
    {
      q: "What are the drawbacks of offset pagination?",
      a: "Two fundamental ones. First, correctness under writes: offset addresses rows by position, and writes move positions. On a newest-first feed, an insert between page requests shifts every row down, so the user sees the last row of page 1 again at the top of page 2; a delete shifts rows up, so a row is skipped and never displayed. Second, cost at depth: `LIMIT 20 OFFSET 100000` forces the database to produce 100,020 rows of the ordered result and discard 100,000 — O(offset) work on every request — and the `COUNT(*)` for total pages is expensive on large tables. Neither matters on a small, stable admin table, which is exactly where I'd still happily use offset.",
    },
    {
      q: "When is offset pagination the right choice despite its known problems?",
      a: "When its two failure modes can't fire or don't matter. Small or slow-changing datasets — admin screens, back-office CRUD, reporting tables — see negligible drift and never reach deep offsets. And offset uniquely supports random access: 'jump to page 47' and 'page 3 of 12' UX need positional addressing that cursors simply can't provide, because a cursor only knows 'after this row'. So for an internal orders dashboard I'd ship offset with a clamped perPage and a proper meta envelope, and I'd defend that as the simpler, correct-enough tool. For a public, high-write feed with infinite scroll, I'd switch to keyset pagination.",
    },
    {
      q: "A crawler is hammering your listing endpoint page by page and database load is climbing. Why, and what would you do?",
      a: "Each deeper page is more expensive than the last: `OFFSET n` makes the database walk and discard n rows, so a crawler iterating from page 1 to page 10,000 executes an arithmetic series of work — effectively a load test — plus a `COUNT(*)` per request if the envelope includes totals. Short-term mitigations: clamp `perPage`, cap the maximum page depth (many big APIs refuse offsets beyond ~10k), cache the count, and rate-limit. The structural fix is to expose a cursor-based listing for sequential consumers — keyset pagination does constant work per page regardless of depth, which is exactly the access pattern a crawler has.",
    },
  ],

  quiz: [
    {
      question:
        "A newest-first feed uses offset pagination. Between a user's page-1 and page-2 requests, one new row is inserted at the top. What does the user experience?",
      options: [
        "One row from page 1 appears again at the start of page 2",
        "One row is skipped and never shown",
        "Page 2 returns an error because total changed",
        "Nothing — the database snapshots the result set between requests",
      ],
      answerIndex: 0,
      explain:
        "The insert shifts every existing row down one position, so the row that was 20th (last of page 1) is now 21st (first of page 2) — a visible duplicate. Deletes cause the mirror image: rows shift up and one is skipped. There is no snapshot; each request is a fresh query.",
    },
    {
      question: "Why is `LIMIT 20 OFFSET 100000` slow?",
      options: [
        "The OFFSET keyword disables index usage entirely",
        "The database must produce the first 100,020 rows of the ordered result and discard 100,000 — work proportional to the offset",
        "It locks the table while counting rows",
        "It isn't — OFFSET seeks directly to the row position in O(1)",
      ],
      answerIndex: 1,
      explain:
        "OFFSET cannot seek; it counts. The engine walks the ordered result (even when an index provides the order) and throws away offset rows before returning any. Cost grows linearly with depth, which is why deep pagination and crawlers hurt.",
    },
    {
      question:
        "Which endpoint is the STRONGEST case for keeping offset pagination rather than moving to cursors?",
      options: [
        "A public social feed with heavy writes and infinite scroll",
        "An internal admin table of 2,000 suppliers where staff jump to specific pages",
        "An export endpoint that clients iterate completely every night",
        "A high-traffic product search with millions of rows",
      ],
      answerIndex: 1,
      explain:
        "The admin table is small (deep-offset cost can't materialise), slow-changing (drift is negligible), and its jump-to-page UX needs positional access that cursors cannot offer. The feed and the nightly full iteration are the canonical cursor cases; deep pages on millions of rows are the O(offset) trap.",
    },
  ],
};

export default lesson;
