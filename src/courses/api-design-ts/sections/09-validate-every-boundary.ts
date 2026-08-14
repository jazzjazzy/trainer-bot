import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "validate-every-boundary",
  title: "Validate Every Boundary",
  part: "Contracts & Validation",
  estMinutes: 11,
  summary:
    "The body isn't the only untrusted input — params, query strings, headers, and env vars are all strings from strangers, and each one gets validated once, at the edge.",

  concept: `
Validating the JSON body and calling it done is the API equivalent of locking
the front door with the windows open. Everything that crosses into your
process is untrusted, and almost all of it arrives as **strings**:

- **Route params** — \`/users/:id\` gives you \`id: string\`, even if it must
  be a UUID.
- **Query strings** — \`?limit=20\` is the string \`"20"\`. Or \`"banana"\`.
  Or \`"999999"\`.
- **Headers** — free-form strings from the client.
- **Environment variables** — \`process.env.PORT\` is \`string | undefined\`,
  set by whoever wrote the deploy config. Untrusted in the "humans make
  typos" sense.

You know this instinctively from PHP — \`$_GET\` never lied about being
untrusted. But PHP's habit of fixing it, \`(int)$_GET['limit']\`, has a trap:
\`(int)"banana"\` is \`0\`, silently. \`Number("banana")\` in JS is at least
\`NaN\`, but the discipline is the same either way: **coerce deliberately,
bound the result, and default the absent**.

### Coercion: strings in, types out

Zod's \`z.coerce\` runs a JS-style conversion before validating, built for
exactly this:

\`\`\`ts
const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["createdAt", "email"]).default("createdAt"),
});

const query = ListQuery.parse(req.query);
// query: { limit: number; offset: number; sort: "createdAt" | "email" }
\`\`\`

Every rule earns its place: \`.max(100)\` stops \`?limit=999999\` from
becoming a full-table scan; \`z.enum\` whitelists \`sort\` because that value
ends up in an \`ORDER BY\` — a raw string there is an injection waiting;
\`.default()\` makes absent parameters well-defined instead of \`undefined\`
sprinkled through the handler.

### Unknown keys: strip, reject, or allow

By default \`z.object()\` **strips** unknown keys — extra fields are silently
dropped. Zod 4 gives you the other two policies as top-level constructors
(the v3 methods \`.strict()\` and \`.passthrough()\` are deprecated):

\`\`\`ts
z.object({ email: z.email() });        // strips unknown keys (default)
z.strictObject({ email: z.email() });  // unknown keys -> validation error
z.looseObject({ email: z.email() });   // unknown keys pass through
\`\`\`

For request bodies, \`strictObject\` is worth considering: if a client sends
\`emial\` (typo), the default strip policy silently discards it and the client
wonders why the update "didn't take". Strict rejects with a clear error —
failing loudly at the boundary instead of mysteriously downstream.

### Env and config: validate at boot, fail fast

\`\`\`ts
// config.ts — runs once, at import time
const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.url(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export const config = Env.parse(process.env);
\`\`\`

\`parse\` (not \`safeParse\`) is deliberate: a misconfigured process should
**crash at boot** with a precise message, not serve traffic for six hours and
explode on the first request that touches the missing value. This also
eliminates the \`process.env.PORT!\` non-null assertions scattered through a
codebase — each one a small lie waiting for the deploy where it's false.

### The pattern: validate once, then trust

Parse at the edge; pass \`query.limit\` (a bounded number) and
\`config.DATABASE_URL\` (a verified URL) inward as plain typed values. Domain
code should never re-check — if a function deep in the domain is
re-validating its arguments, that's the type system telling you the boundary
leaked. One trust boundary, enforced in one place, and everything inside it
programs against types instead of paranoia.
`,

  comparisons: [
    {
      label: "Casting the query string vs parsing it",
      intro:
        "Read ?limit= for a list endpoint. The PHP cast always 'succeeds' — that's the problem. The schema coerces, bounds, and defaults in one declaration.",
      php: `<?php // list_users.php
// (int)"banana" === 0, (int)"" === 0, (int)"-5" === -5
$limit = (int) ($_GET['limit'] ?? 20);

// ?limit=banana  -> LIMIT 0   (returns nothing, no error)
// ?limit=-5      -> LIMIT -5  (SQL error at runtime)
// ?limit=999999  -> LIMIT 999999 (full-table scan, happily)
$stmt = $pdo->prepare('SELECT * FROM users LIMIT ?');
$stmt->execute([$limit]);`,
      ts: `// handlers/listUsers.ts
const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const parsed = ListQuery.safeParse(req.query);
if (!parsed.success) {
  return send422(res, parsed.error.issues);
}
// ?limit=banana -> 422 with a precise message
// ?limit=-5     -> 422 ("too small")
// ?limit=999999 -> 422 ("too big") — or clamp if you prefer
// absent        -> { limit: 20, offset: 0 }
const { limit, offset } = parsed.data; // numbers, guaranteed`,
      note: "The PHP cast maps every garbage input onto SOME integer and carries on; the schema distinguishes absent (default), invalid (422), and out-of-bounds (422) — each failure mode gets an honest answer.",
    },
    {
      label: "process.env scattered vs one validated Config",
      intro:
        "Both apps need PORT and DATABASE_URL. One reads process.env wherever it's convenient; the other validates everything once at boot.",
      php: `// server.ts — the ! assertions are hopes, not checks
const port = Number(process.env.PORT!);   // NaN if unset
app.listen(port);

// db.ts — different file, same hope
const pool = createPool(process.env.DATABASE_URL!);

// mailer.ts — typo'd var name, undefined forever
const key = process.env.SENDGIRD_API_KEY!;

// Failure mode: deploys fine, crashes (or worse,
// half-works) at the first request that hits each lie`,
      ts: `// config.ts — the ONLY file that touches process.env
const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.url(),
  SENDGRID_API_KEY: z.string().min(1),
});

// Throws at boot with the exact missing/invalid keys:
export const config = Env.parse(process.env);

// everywhere else imports typed, verified values:
// server.ts:  app.listen(config.PORT)
// db.ts:      createPool(config.DATABASE_URL)
// mailer.ts:  config.SENDGRID_API_KEY  // typo = compile error`,
      note: "Boot-time parse turns every deploy misconfiguration into an immediate, precise crash — and downstream code gets autocompleted, typo-proof config instead of stringly-typed env reads.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Unknown body keys: silent strip vs loud reject",
      intro:
        "A client PATCHes a profile but typos the field name. Watch what each unknown-key policy does with it.",
      php: `// z.object (default): unknown keys are STRIPPED
const UpdateProfile = z.object({
  displayName: z.string().min(1).optional(),
});

// client sends: { "displayNmae": "Ada" }
UpdateProfile.parse(body);
// -> {}  ...valid! The typo'd key vanished.
// The update "succeeds", changes nothing, and the
// client files a bug: "your API ignores my field"`,
      ts: `// z.strictObject: unknown keys FAIL validation
const UpdateProfile = z.strictObject({
  displayName: z.string().min(1).optional(),
});

// client sends: { "displayNmae": "Ada" }
UpdateProfile.parse(body);
// -> ZodError: unrecognized key "displayNmae"
// The client learns about the typo from the 422,
// not from a silent no-op

// (v3's .strict()/.passthrough() methods are
// deprecated; use z.strictObject/z.looseObject)`,
      note: "Strip is safe but silent; strict is loud and debuggable. For PATCH-style bodies where every key matters, strictObject converts client typos into immediate 422s instead of ghost bugs.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A parseQuery that coerces, bounds, and defaults limit/offset/sort — the hand-rolled equivalent of z.coerce.number().int().min(1).max(100).default(20). Predict the parsed output for each raw query, especially the greedy, garbage, and hostile ones.",
    code: `// Query strings are all strings — and all hostile until proven otherwise.
// parseQuery coerces, bounds, and defaults, so everything downstream
// receives trusted, typed values. (In real code: z.coerce.number() etc.)

const SORT_FIELDS = ["createdAt", "email"] as const;
type SortField = (typeof SORT_FIELDS)[number];

interface ListQuery {
  limit: number; // 1..100, default 20
  offset: number; // >= 0, default 0
  sort: SortField; // whitelist, default "createdAt"
}

function parseQuery(raw: Record<string, string | undefined>): ListQuery {
  // Coerce: Number("abc") is NaN, Number("") is 0 — both fail the checks.
  const rawLimit = Number(raw.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit >= 1
      ? Math.min(rawLimit, 100) // bound: never let a client ask for 999999
      : 20;

  const rawOffset = Number(raw.offset);
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  // Whitelist, never interpolate: sort ends up in ORDER BY.
  const sort: SortField = (SORT_FIELDS as readonly string[]).includes(raw.sort ?? "")
    ? (raw.sort as SortField)
    : "createdAt";

  return { limit, offset, sort };
}

const requests: Array<Record<string, string | undefined>> = [
  {}, // no params at all
  { limit: "50", offset: "100", sort: "email" }, // well-behaved client
  { limit: "999999" }, // greedy client
  { limit: "abc", offset: "-5" }, // garbage in
  { sort: "password_hash; DROP TABLE users" }, // hostile sort
];

for (const raw of requests) {
  console.log(JSON.stringify(raw).padEnd(56) + "=> " + JSON.stringify(parseQuery(raw)));
}`,
  },

  keyPoints: [
    "Every input is untrusted strings: route params, query strings, headers, and env vars — not just the JSON body. Each boundary gets a schema.",
    "`z.coerce.number()` converts then validates — chain `.int().min(1).max(100).default(20)` so query numbers arrive bounded and absent values are well-defined.",
    "Values headed for `ORDER BY` or similar get whitelisted with `z.enum`, never passed through as raw strings.",
    "Zod 4 unknown-key policies: `z.object` strips (default), `z.strictObject` rejects, `z.looseObject` passes through — v3's `.strict()`/`.passthrough()` methods are deprecated.",
    "Validate `process.env` once at boot with `parse` so misconfiguration crashes immediately with a precise message — and kill every `process.env.X!` assertion in the codebase.",
    "Validate once at the edge, then pass trusted typed values inward — domain code that re-validates its arguments is a sign the boundary leaked.",
  ],

  interview: [
    {
      q: "PHP developers write (int)$_GET['limit'] — what's wrong with the equivalent Number(req.query.limit) in a TS API, and what do you do instead?",
      a: "The cast alone answers the wrong question. `(int)\"banana\"` is 0 in PHP; `Number(\"banana\")` is NaN in JS — either way the code keeps running with a value nobody intended, and you've still done nothing about bounds or absence. `?limit=999999` coerces perfectly and then scans the table. I'd parse the whole query object through a schema: `z.coerce.number().int().min(1).max(100).default(20)`. That distinguishes the three cases a cast conflates — absent (apply the default), invalid (422 with a message), and out-of-bounds (422 or clamp, but chosen deliberately). And anything destined for an ORDER BY goes through `z.enum`, because a sort field is a whitelist decision, not a string.",
    },
    {
      q: "Why validate process.env at startup rather than reading variables where they're needed?",
      a: "Failure timing and typing. Scattered `process.env.PORT!` reads mean a misconfigured deploy starts cleanly and fails later — possibly hours later, on the first request that touches the missing variable, in a stack trace far from the actual cause. A single `Env.parse(process.env)` in a config module runs at import time and crashes the process at boot with the exact list of missing or malformed keys, which is precisely when the person who ran the deploy is watching. I use `parse`, not `safeParse`, because crashing is the correct behaviour. It also gives the rest of the codebase a typed `config` object — `config.SENDGRID_API_KEY` is autocompleted and typo-proof, whereas `process.env.SENDGIRD_API_KEY` is undefined forever and no tool warns you.",
    },
    {
      q: "What are zod 4's unknown-key policies for objects, and when would you choose each?",
      a: "Three policies. Default `z.object()` strips unknown keys — safe output, and fine for most response-ish parsing, but silent: a typo'd field in a request just vanishes. `z.strictObject()` fails validation on unknown keys — my choice for request bodies, especially PATCH, where a client sending `displayNmae` should get a 422 naming the unrecognized key rather than a successful no-op they'll report as a bug. `z.looseObject()` passes unknown keys through — for proxy or webhook scenarios where you must preserve fields you don't model. Worth mentioning in a zod 3 → 4 migration: these replaced the deprecated `.strict()` and `.passthrough()` methods as top-level constructors.",
    },
  ],

  quiz: [
    {
      question: "A client calls GET /users?limit=999999. What does a well-designed query schema do?",
      options: [
        "Coerce it to a number and pass it to the database — the client asked for it",
        "Enforce an upper bound like .max(100), returning a 422 (or clamping) instead of executing the huge query",
        "Ignore the limit parameter entirely for safety",
        "Round it down to the nearest power of ten",
      ],
      answerIndex: 1,
      explain:
        "Coercion alone isn't validation — 999999 coerces perfectly and then costs you a giant scan. The schema owns the policy: .max(100) either rejects with a clear 422 or clamps to the maximum, but either way the bound is declared at the boundary, not discovered in the slow-query log.",
    },
    {
      question:
        "With the default z.object({ displayName: z.string().optional() }), a client sends { displayNmae: 'Ada' } (a typo). What happens?",
      options: [
        "Validation fails with 'unrecognized key displayNmae'",
        "The unknown key is stripped, parsing succeeds with an empty result, and the typo is invisible — strictObject is what would reject it",
        "Zod auto-corrects the key using fuzzy matching",
        "parse() returns undefined",
      ],
      answerIndex: 1,
      explain:
        "z.object strips unknown keys by default, so the typo'd field silently disappears and the 'update' succeeds while changing nothing. z.strictObject makes unknown keys a validation error — usually the kinder behaviour for request bodies, because the client finds out immediately. (Zod 4 deprecates the v3 .strict()/.passthrough() methods in favour of these constructors.)",
    },
    {
      question: "Why use Env.parse(process.env) (throwing) rather than safeParse at boot?",
      options: [
        "parse is faster than safeParse",
        "safeParse can't handle objects with unknown keys like process.env",
        "A misconfigured process SHOULD crash at boot — an unhandled throw with precise issues is exactly the desired behaviour",
        "parse validates asynchronously, which boot code requires",
      ],
      answerIndex: 2,
      explain:
        "At boot there is no graceful degradation: serving traffic with a broken config is worse than not starting. Letting parse throw stops the deploy at the moment someone is watching, with the exact missing/invalid keys in the error. safeParse would just make you write code to... crash anyway. Performance and async have nothing to do with it.",
    },
  ],
};

export default lesson;
