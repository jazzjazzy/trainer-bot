import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "filtering-and-sorting",
  title: "Filtering & Sorting Conventions",
  part: "Collections & Evolution",
  estMinutes: 12,
  summary:
    "Pick one query-parameter convention for filters and sorts, document it, and translate API field names to SQL through an explicit whitelist — never straight from the query string.",

  concept: `
Collections need filtering and sorting, and the query string is where they
live. The design work is choosing *one* convention and holding the line — plus
one security rule that separates juniors from seniors in interviews.

### Equality, multi-value, ranges

**Simple equality** is a bare parameter: \`GET /products?status=active\`.

**Multi-value** (OR semantics) — pick a style and stick to it. Comma-separated
is compact and common: \`?status=active,pending\`. (Repeated params
\`?status=active&status=pending\` also work; just don't support both — your
docs, validators, and clients all pay for every variant.)

**Ranges** have two mainstream styles:

- Suffixed names: \`?created_after=2026-01-01&created_before=2026-02-01\`
- Bracketed operators (JSON:API-flavoured): \`?filter[created][gte]=2026-01-01\`

The suffixed style is simpler to parse and read; the bracketed style scales to
more operators without inventing new names. Either is defensible — what's not
defensible is using both in one API.

### Sorting: \`sort=-createdAt,name\`

The de-facto convention (canonised by JSON:API): a comma-separated list of
field names, each optionally prefixed with \`-\` for descending. So
\`?sort=-createdAt,name\` means "newest first, ties alphabetical". It's compact,
it encodes direction per field, and clients across ecosystems already know
how to read it. Always define a documented default sort — unordered SQL
results are not stable across executions, and an unstable order breaks
pagination.

### The whitelist rule

Never map query-parameter names straight onto SQL columns. Two reasons:

1. **Injection.** \`ORDER BY \` + \`$_GET['sort']\` is a classic hole — and it's
   *not* fixable with bound parameters, because placeholders can only stand
   for values, not identifiers. \`?sort=(CASE WHEN (SELECT ...) THEN id END)\`
   turns your sort param into a blind-SQLi oracle.
2. **Coupling and cost.** Even sanitised, a pass-through exposes every column
   as public API (rename one and clients break) and lets clients sort or
   filter by unindexed columns, handing them a full-table-scan button.

The fix is an explicit map from API field names to safe column expressions:

\`\`\`ts
const SORTABLE = {
  createdAt: "p.created_at",
  name: "p.name",
  price: "p.price_cents",
} as const;
\`\`\`

Unknown field → 400 with a Problem Details body that *lists the allowed
fields* (kind clients fix themselves). Known field → you chose the column, you
made sure it's indexed. This is \`filter_var\` thinking applied to identifiers:
validate against a closed set, because escaping doesn't exist for column names.

### Document the contract

Whatever you pick — comma multi-value, \`_after\`/\`_before\` ranges,
\`-\`-prefixed sort — write it down once in your API docs and reuse it on every
collection. Consistency *is* the feature: a client that learned
\`/products\` should already know how to query \`/orders\`.
`,

  comparisons: [
    {
      label: "ORDER BY from the query string vs a whitelist map",
      intro:
        "Both let clients sort products. The PHP version interpolates the sort parameter into SQL — bound parameters can't save you here, because identifiers can't be placeholders. The TS version maps API names to columns it chose.",
      php: `<?php // products.php?sort=price&dir=desc
$sort = $_GET['sort'] ?? 'created_at';
$dir  = $_GET['dir'] ?? 'ASC';

// Classic injection: placeholders only work for VALUES,
// so devs interpolate identifiers... and attackers send
// ?sort=(CASE WHEN (SELECT password FROM users LIMIT 1)
//        LIKE 'a%' THEN id ELSE name END)
$sql = "SELECT * FROM products ORDER BY $sort $dir LIMIT 20";
$rows = $pdo->query($sql)->fetchAll();`,
      ts: `// routes/products.ts?sort=-price
const SORTABLE: Record<string, string> = {
  createdAt: "p.created_at",
  name: "p.name",
  price: "p.price_cents",
};

function orderByClause(sortParam: string): string {
  const terms = sortParam.split(",").map((t) => {
    const desc = t.startsWith("-");
    const field = desc ? t.slice(1) : t;
    const column = SORTABLE[field];
    if (!column) throw new ApiError(
      \`sort: unknown field '\${field}' (allowed: \${Object.keys(SORTABLE).join(", ")})\`, 400, "/problems/invalid-sort");
    return \`\${column} \${desc ? "DESC" : "ASC"}\`;
  });
  return \`ORDER BY \${terms.join(", ")}, p.id DESC\`;
}`,
      note:
        "Only strings from the SORTABLE map's right-hand side ever reach the SQL — client input selects between them but never enters the query. Unknown fields become a 400 problem listing what IS allowed.",
    },
    {
      label: "Ad-hoc parameter styles vs one documented convention",
      intro:
        "Two APIs' collection URLs. The left one grew a new style per endpoint per year; the right one has a single convention a client learns once.",
      php: `# every endpoint invents its own dialect
GET /products?Status=Active&order_by=price&direction=descending
GET /orders?state[]=paid&state[]=shipped&sort=created:desc
GET /customers?filterName=smith&sortField=CreatedAt&sortDir=2
GET /invoices?q=status%3Dpaid&newest_first=true`,
      ts: `# one convention, every collection
GET /products?status=active&sort=-price
GET /orders?status=paid,shipped&sort=-createdAt
GET /customers?name=smith&sort=-createdAt,name
GET /invoices?status=paid&created_after=2026-01-01&sort=-createdAt

# rules, documented once:
#   equality:    field=value        multi-value: comma = OR
#   ranges:      field_after / field_before
#   sort:        comma list, leading '-' = descending`,
      note:
        "The right side isn't cleverer — it's merely consistent. Consistency is what lets a client (and your validator, and your docs generator) treat every collection identically.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Trusting req.query's shape vs parsing it",
      intro:
        "Both are TypeScript. The left handler casts req.query values and hopes; the right one parses them into a typed structure and rejects surprises — types checked at the boundary, not assumed.",
      php: `// naive: TS syntax, PHP-era trust
app.get("/products", async (req, res) => {
  // req.query values are string | string[] | undefined —
  // 'as string' is a hope, not a check:
  const sort = (req.query.sort as string) ?? "createdAt";
  const status = req.query.status as string;

  // ?sort=price&sort=name makes sort an array → runtime surprise
  // ?status=anything goes straight into the WHERE clause
  const rows = await findProducts({ sort, status });
  res.json(rows);
});`,
      ts: `// parsed: unknown in, typed + whitelisted out
const ListQuery = z.object({
  status: z.string().optional()
    .transform((s) => s?.split(",") ?? [])
    .pipe(z.array(z.enum(["active", "pending", "discontinued"]))),
  sort: z.string().default("-createdAt"),
});

app.get("/products", asyncHandler(async (req, res) => {
  const parsed = ListQuery.safeParse(req.query);
  if (!parsed.success) throw new ValidationError(
    parsed.error.issues.map((i) => \`\${i.path.join(".")}: \${i.message}\`));

  const query = parsed.data; // { status: Status[]; sort: string }
  res.json(await findProducts(query)); // sort still goes through SORTABLE
}));`,
      note:
        "The cast compiles and then lies at runtime; the schema turns 'whatever the query string held' into a value whose type is actually true — enum-checked statuses, defaulted sort.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "parseSort and parseFilters over explicit whitelists, applied to an in-memory product list. Predict the order of the first result set, then predict what the two bad requests at the end produce.",
    code: `// Whitelisted filtering & sorting over an in-memory catalogue.
interface Product {
  id: number; name: string; priceCents: number;
  status: "active" | "discontinued"; category: string;
}

const products: Product[] = [
  { id: 1, name: "Desk",    priceCents: 24900, status: "active",       category: "furniture" },
  { id: 2, name: "Chair",   priceCents: 9900,  status: "active",       category: "furniture" },
  { id: 3, name: "Lamp",    priceCents: 4900,  status: "discontinued", category: "lighting"  },
  { id: 4, name: "Monitor", priceCents: 34900, status: "active",       category: "tech"      },
  { id: 5, name: "Cable",   priceCents: 900,   status: "discontinued", category: "tech"      },
];

// The whitelists: API field name → how to actually read/compare it.
const SORTABLE: Record<string, (p: Product) => string | number> = {
  name: (p) => p.name,
  price: (p) => p.priceCents,
  category: (p) => p.category,
  id: (p) => p.id,
};
const FILTERABLE = new Set(["status", "category"]);

type Reject = { ok: false; status: 400; detail: string };
type SortSpec = { field: string; dir: 1 | -1 }[];

function parseSort(raw: string): { ok: true; spec: SortSpec } | Reject {
  const spec: SortSpec = [];
  for (const term of raw.split(",")) {
    const desc = term.startsWith("-");
    const field = desc ? term.slice(1) : term;
    if (!(field in SORTABLE)) {
      return { ok: false, status: 400,
        detail: \`sort: unknown field '\${field}' (allowed: \${Object.keys(SORTABLE).join(", ")})\` };
    }
    spec.push({ field, dir: desc ? -1 : 1 });
  }
  return { ok: true, spec };
}

function parseFilters(query: Record<string, string>): { ok: true; f: (p: Product) => boolean } | Reject {
  const checks: Array<(p: Product) => boolean> = [];
  for (const [key, value] of Object.entries(query)) {
    if (key === "sort") continue;
    if (!FILTERABLE.has(key)) {
      return { ok: false, status: 400,
        detail: \`filter: unknown field '\${key}' (allowed: \${[...FILTERABLE].join(", ")})\` };
    }
    const allowed = value.split(","); // comma = OR
    checks.push((p) => allowed.includes(String(p[key as "status" | "category"])));
  }
  return { ok: true, f: (p) => checks.every((c) => c(p)) };
}

function list(query: Record<string, string>) {
  const filters = parseFilters(query);
  if (!filters.ok) return filters;
  const sort = parseSort(query.sort ?? "id");
  if (!sort.ok) return sort;

  const data = products.filter(filters.f).sort((a, b) => {
    for (const { field, dir } of sort.spec) {
      const av = SORTABLE[field](a), bv = SORTABLE[field](b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
    }
    return a.id - b.id; // documented, stable tie-breaker
  });
  return { ok: true as const, data };
}

// GET /products?status=active&sort=-price
const good = list({ status: "active", sort: "-price" });
if (good.ok) {
  for (const p of good.data) console.log(\`\${p.name}: \$\${(p.priceCents / 100).toFixed(2)}\`);
}

// GET /products?status=active,discontinued&sort=category,-price — multi-value + two sort keys
const multi = list({ status: "active,discontinued", sort: "category,-price" });
if (multi.ok) console.log("multi:", multi.data.map((p) => p.name).join(", "));

// GET /products?sort=-password — not in the whitelist:
const bad1 = list({ sort: "-password" });
if (!bad1.ok) console.log(\`400 -> \${bad1.detail}\`);

// GET /products?is_admin=1 — filtering by a field we never exposed:
const bad2 = list({ is_admin: "1", sort: "name" });
if (!bad2.ok) console.log(\`400 -> \${bad2.detail}\`);`,
  },

  keyPoints: [
    "Adopt one convention per concern and reuse it on every collection: bare params for equality, commas for multi-value OR (`?status=active,pending`), `_after`/`_before` (or `filter[x][gte]`) for ranges — never a mix of styles.",
    "Sorting follows the JSON:API-style `sort=-createdAt,name`: comma-separated fields, leading `-` for descending, plus a documented default sort so ordering (and therefore pagination) is stable.",
    "The whitelist rule: query params never map straight onto SQL columns — maintain an explicit map from API field names to column expressions, and 400 anything outside it.",
    "Bound parameters cannot protect ORDER BY or column names — placeholders stand for values, not identifiers — so `\"ORDER BY $sort\"` is injectable no matter how it's quoted.",
    "Whitelisting is also a performance and coupling contract: you only expose fields you've indexed, and renaming a column stops being a breaking API change.",
    "Reject unknown filter/sort fields with a Problem Details body that lists the allowed fields — a self-documenting 400 beats a silent ignore that hides client bugs.",
  ],

  interview: [
    {
      q: "How would you design filtering and sorting for a collection endpoint?",
      a: "One convention, applied everywhere: bare query params for equality (`?status=active`), commas for multi-value OR, `created_after`/`created_before` for ranges, and JSON:API-style `sort=-createdAt,name` with the leading minus for descending — plus a documented default sort so results are stable for pagination. The critical implementation rule is that no parameter name or value ever reaches SQL directly: I keep an explicit whitelist mapping API field names to column expressions, translate through it, and return a 400 problem listing the allowed fields for anything else. That gives me injection safety for identifiers, control over which columns are queryable (so everything exposed is indexed), and the freedom to rename database columns without breaking the API.",
    },
    {
      q: "Why can't prepared statements protect a user-supplied sort column, and what's the correct defence?",
      a: "Placeholders in prepared statements can only bind *values* — the database plans the query around a fixed structure, and identifiers like column names or the ORDER BY expression are part of that structure. So `ORDER BY ?` either errors or sorts by a constant, which pushes developers into string interpolation, and `\"ORDER BY \" . $_GET['sort']` is a blind-SQL-injection oracle: an attacker sends a CASE expression whose sort order leaks data one comparison at a time. The correct defence is validation against a closed set: a hardcoded map from API field names to column expressions I wrote myself. Client input picks an entry; it never becomes SQL text. It's the same principle as `filter_var` with a whitelist, applied to identifiers because escaping doesn't exist for them.",
    },
    {
      q: "A client asks you to make every column filterable and sortable 'to be flexible'. How do you respond?",
      a: "I'd push back with three costs. Security: auto-exposing columns is how fields like `password_hash` or `internal_margin` end up filterable — filtering leaks values through behaviour even if the field is never returned (does `?password_hash=ab%` match anything?). Performance: sort and filter on an unindexed column is a full-table scan, so 'every column' hands anonymous clients a denial-of-service button; I only expose fields I've committed to indexing. Coupling: every exposed column becomes public contract, freezing the schema. So the answer is a deliberate, documented subset per resource — usually a handful of fields the UI actually needs — with a 400 that lists the allowed fields, and we extend the whitelist when a real use case shows up.",
    },
  ],

  quiz: [
    {
      question:
        "Using the common JSON:API-style convention, what does GET /orders?sort=-createdAt,total mean?",
      options: [
        "Sort by createdAt ascending, then total descending",
        "Sort by createdAt descending, ties broken by total ascending",
        "Exclude createdAt from the response and sort by total",
        "Sort by whichever of the two fields has an index",
      ],
      answerIndex: 1,
      explain:
        "The comma list is priority order and the leading minus means descending for that field only: newest orders first, and orders created at the same instant are sub-sorted by total ascending. The minus prefix has nothing to do with field selection — that's sparse fieldsets, a different parameter.",
    },
    {
      question:
        "Why doesn't switching to prepared statements fix `\"SELECT ... ORDER BY \" + req.query.sort`?",
      options: [
        "Prepared statements are slower for sorting, so nobody uses them there",
        "It does fix it — ORDER BY ? binds the column safely",
        "Placeholders can only represent values, not identifiers or expressions, so the column name still has to enter the SQL as text",
        "Prepared statements only protect INSERT and UPDATE statements",
      ],
      answerIndex: 2,
      explain:
        "Binding works for values because the statement's structure is fixed at prepare time; a column name IS structure. ORDER BY with a bound parameter sorts by a constant (or errors), so the identifier must be chosen server-side — which is exactly what the whitelist map does: client input selects among safe, pre-written column expressions.",
    },
    {
      question:
        "A request arrives with ?sort=nickname, but only createdAt, name, and price are in your sortable whitelist. The deliberate response is:",
      options: [
        "Silently fall back to the default sort so the request still succeeds",
        "Sort by nickname anyway if the column happens to exist",
        "Return 400 with a problem body naming the unknown field and listing the allowed sort fields",
        "Return 500 because the SQL would fail",
      ],
      answerIndex: 2,
      explain:
        "Silent fallback hides the client's bug — they believe they're getting nickname order and ship it. Passing it through reintroduces both the injection and the unindexed-scan problems. An explicit 400 listing allowed fields is self-documenting: the error message is the fix. It's a client error, so 4xx, not 500.",
    },
  ],
};

export default lesson;
