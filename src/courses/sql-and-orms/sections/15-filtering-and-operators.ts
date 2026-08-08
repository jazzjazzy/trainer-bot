import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "filtering-and-operators",
  title: "Filtering: WHERE Trees vs Operator Functions",
  part: "Queries & CRUD",
  estMinutes: 13,
  summary:
    "Prisma expresses WHERE as nested filter objects with implicit AND; Drizzle gives you imported operator functions whose nesting mirrors your parentheses — learn to translate any hand-written WHERE into both, and where Prisma's object syntax hides precedence.",

  concept: `
You think in \`WHERE\` clauses. The skill this section builds is
*translation*: take a condition you'd write in your sleep and express it in
each ORM's dialect — and, just as important, read one back into SQL to
check its precedence.

### Prisma: a tree of filter objects

Keys inside one object are **implicitly ANDed**; operators live in nested
objects; \`AND\`/\`OR\`/\`NOT\` take arrays for explicit grouping:

\`\`\`ts
const rows = await prisma.user.findMany({
  where: {
    status: 'active',                       // = 'active'
    email: { contains: '@example.com',
             mode: 'insensitive' },          // ILIKE '%@example.com%'
    plan: { in: ['pro', 'team'] },           // IN ('pro','team')
    credits: { gte: 100 },                   // >= 100
    deletedAt: null,                         // IS NULL
  },
});
\`\`\`

Every line ANDs with its siblings — one flat object is one flat AND list.
String \`contains\`/\`startsWith\`/\`endsWith\` become \`LIKE\` patterns;
\`mode: 'insensitive'\` turns them into \`ILIKE\` on Postgres. Relation
filters quantify over child rows the way \`EXISTS\` does:
\`posts: { some: {...} }\` → \`EXISTS\`, \`none\` → \`NOT EXISTS\`,
\`every\` → \`NOT EXISTS (child NOT matching)\`.

### Where the object syntax hides precedence

SQL makes grouping visible with parentheses. Prisma's object syntax has two
traps for people who read it too quickly:

1. **\`OR\` next to plain keys is still ANDed in.**
   \`{ status: 'active', OR: [{ plan: 'pro' }, { credits: { gt: 100 } }] }\`
   means \`status = 'active' AND (plan = 'pro' OR credits > 100)\` — the OR
   binds *tighter* than a skim suggests. Fine if that's what you meant;
   wrong if you meant \`(status = 'active' AND plan = 'pro') OR credits > 100\`,
   which needs the whole thing lifted into an explicit
   \`OR: [{ AND: [...] }, {...}]\`.
2. **A JS object can't repeat a key**, so two conditions on the same column
   OR-ed together can't be written flat — \`{ price: { gt: 100 } , price: ... }\`
   is a syntax-level dead end; you must reach for the \`OR\` array.

The habit that saves you: mentally decompile every Prisma filter back to
SQL, parentheses and all. You can do that faster than most people can read
the object.

### Drizzle: operators are just functions

\`\`\`ts
import { and, or, eq, gt, gte, inArray,
         ilike, isNull, not } from 'drizzle-orm';

const rows = await db.select().from(users).where(
  and(
    eq(users.status, 'active'),
    or(eq(users.plan, 'pro'), gt(users.credits, 100)),
    isNull(users.deletedAt),
    ilike(users.email, '%@example.com'),
  ),
);
// where "status" = $1 and ("plan" = $2 or "credits" > $3)
//   and "deleted_at" is null and "email" ilike $4
\`\`\`

Function nesting **is** parenthesisation — \`and(a, or(b, c))\` can only
mean \`a AND (b OR c)\`. The full operator kit maps one-to-one to SQL:
\`eq\`, \`ne\`, \`gt\`/\`gte\`/\`lt\`/\`lte\`, \`inArray\`/\`notInArray\`,
\`like\`/\`ilike\`, \`isNull\`/\`isNotNull\`, \`between\`, \`not(...)\`.

Two ergonomic details worth knowing. \`and()\` and \`or()\` ignore
\`undefined\` arguments, which makes optional filters clean:

\`\`\`ts
where: and(
  isNull(users.deletedAt),
  planFilter ? eq(users.plan, planFilter) : undefined,
)
\`\`\`

And when the differ between you and the SQL gets annoying, the escape hatch
keeps you parameterised: \`sql\` fragments interpolate values as bind
parameters, never as text.

In both ORMs, every value in every operator arrives at Postgres as \`$n\`
bind parameters — the operators build the SQL shape; your data never
becomes SQL text.
`,

  comparisons: [
    {
      label: "A real WHERE clause, as a Prisma filter tree",
      intro:
        "Active, non-deleted users on the pro plan or holding over 100 credits, with a company email. Left is what you'd type in psql; right is the same predicate as a filter object.",
      php: `SELECT *
  FROM users
 WHERE status = 'active'
   AND (plan = 'pro' OR credits > 100)
   AND deleted_at IS NULL
   AND email ILIKE '%@example.com%';`,
      ts: `const rows = await prisma.user.findMany({
  where: {
    status: 'active',        // siblings AND together
    OR: [                    // the parenthesised group
      { plan: 'pro' },
      { credits: { gt: 100 } },
    ],
    deletedAt: null,         // IS NULL
    email: {
      contains: '@example.com',
      mode: 'insensitive',   // LIKE -> ILIKE (Postgres)
    },
  },
});`,
      note: "Implicit AND across sibling keys; the OR array is your parentheses; a bare null means IS NULL; contains + mode: 'insensitive' emits ILIKE with the value as a bind parameter.",
      leftLang: "sql",
    },
    {
      label: "The same WHERE clause in Drizzle",
      intro:
        "Identical predicate, Drizzle spelling: each SQL operator is an imported function, and the function nesting reproduces your parentheses exactly.",
      php: `SELECT *
  FROM users
 WHERE status = 'active'
   AND (plan = 'pro' OR credits > 100)
   AND deleted_at IS NULL
   AND email ILIKE '%@example.com%';`,
      ts: `import { and, or, eq, gt, isNull, ilike }
  from 'drizzle-orm';

const rows = await db
  .select()
  .from(users)
  .where(
    and(
      eq(users.status, 'active'),
      or(eq(users.plan, 'pro'), gt(users.credits, 100)),
      isNull(users.deletedAt),
      ilike(users.email, '%@example.com%'),
    ),
  );
// where "status" = $1 and ("plan" = $2 or "credits" > $3)
//   and "deleted_at" is null and "email" ilike $4`,
      note: "and(a, or(b, c), d, e) is unambiguous — composition is precedence. Bonus: and()/or() skip undefined arguments, so optional filters compose without if-chains.",
      leftLang: "sql",
    },
    {
      label: "The precedence trap: (A AND B) OR C",
      intro:
        "You want: active pro users, OR anyone with 1000+ credits. Misplacing the OR in Prisma's object syntax silently queries something else.",
      php: `-- Intended predicate:
SELECT * FROM users
 WHERE (status = 'active' AND plan = 'pro')
    OR credits >= 1000;

-- What the buggy filter object actually asks for:
SELECT * FROM users
 WHERE status = 'active'
   AND (plan = 'pro' OR credits >= 1000);
-- An inactive whale with 50,000 credits: silently excluded.`,
      ts: `// WRONG: sibling keys AND in — this is
// status = 'active' AND (plan OR credits):
await prisma.user.findMany({
  where: {
    status: 'active',
    OR: [{ plan: 'pro' }, { credits: { gte: 1000 } }],
  },
});

// RIGHT: lift everything into the explicit OR:
await prisma.user.findMany({
  where: {
    OR: [
      { AND: [{ status: 'active' }, { plan: 'pro' }] },
      { credits: { gte: 1000 } },
    ],
  },
});
// Drizzle can't hide this:
// or(and(eq(status,'active'), eq(plan,'pro')),
//    gte(credits, 1000))`,
      note: "No error, no warning — just a different result set. The defence is to decompile filter objects back to parenthesised SQL in your head; in Drizzle the nesting already is the parenthesisation.",
      leftLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Drizzle's composition model in miniature: eq/gt/isNull/ilike build predicates, and()/or()/not() combine them — nesting is precedence. Predict which users match each filter, then run it.",
    code: `// Tiny predicate combinators — the mental model behind
// Drizzle's and(or(eq(...), gt(...)), isNull(...)).

interface User {
  id: number;
  email: string;
  plan: 'free' | 'pro';
  credits: number;
  deletedAt: string | null;
}

type Pred = (u: User) => boolean;

const eq = <K extends keyof User>(key: K, value: User[K]): Pred =>
  (u) => u[key] === value;

const gt = (key: 'id' | 'credits', value: number): Pred =>
  (u) => u[key] > value;

const isNull = (key: 'deletedAt'): Pred =>
  (u) => u[key] === null;

const ilike = (key: 'email', pattern: string): Pred => {
  const needle = pattern.split('%').join('').toLowerCase();
  return (u) => u[key].toLowerCase().includes(needle);
};

// Composition IS parenthesisation:
const and = (...ps: Pred[]): Pred => (u) => ps.every((p) => p(u));
const or = (...ps: Pred[]): Pred => (u) => ps.some((p) => p(u));
const not = (p: Pred): Pred => (u) => !p(u);

const users: User[] = [
  { id: 1, email: 'ana@example.com', plan: 'pro',  credits: 10,  deletedAt: null },
  { id: 2, email: 'ben@example.com', plan: 'free', credits: 250, deletedAt: null },
  { id: 3, email: 'cho@example.com', plan: 'free', credits: 50,  deletedAt: null },
  { id: 4, email: 'dee@example.com', plan: 'pro',  credits: 999, deletedAt: '2026-01-01' },
  { id: 5, email: 'eve@other.io',    plan: 'pro',  credits: 500, deletedAt: null },
];

// WHERE deleted_at IS NULL
//   AND (plan = 'pro' OR credits > 100)
//   AND email ILIKE '%@example.com%'
const where = and(
  isNull('deletedAt'),
  or(eq('plan', 'pro'), gt('credits', 100)),
  ilike('email', '%@example.com%'),
);

const matches = users.filter(where);
console.log('matches:', matches.map((u) => u.email).join(', '));

// WHERE NOT (plan = 'free') AND deleted_at IS NULL
const paying = users.filter(and(not(eq('plan', 'free')), isNull('deletedAt')));
console.log('paying:', paying.map((u) => u.id).join(', '));

// Move the parentheses, change the result:
// (deleted IS NULL AND plan='pro') OR credits > 100
const regrouped = users.filter(
  or(and(isNull('deletedAt'), eq('plan', 'pro')), gt('credits', 100)),
);
console.log('regrouped:', regrouped.map((u) => u.id).join(', '));`,
  },

  keyPoints: [
    "Prisma WHERE = nested filter objects: sibling keys AND implicitly, operators nest (`{ credits: { gte: 100 } }`), and explicit `AND`/`OR`/`NOT` arrays are your parentheses.",
    "Prisma string filters `contains`/`startsWith`/`endsWith` emit LIKE patterns; add `mode: 'insensitive'` for ILIKE on Postgres; a bare `null` value means IS NULL.",
    "Relation filters `some`/`every`/`none` quantify over child rows — think EXISTS / NOT EXISTS when reasoning about their SQL and performance.",
    "The Prisma precedence trap: `OR` sitting beside plain keys is ANDed with them — `(A AND B) OR C` requires lifting into an explicit `OR: [{ AND: [...] }, ...]`.",
    "Drizzle imports operators as functions — `eq`, `gt`, `inArray`, `like`/`ilike`, `isNull`, `between`, `not` — and `and(a, or(b, c))` nests exactly like your parentheses; `and()`/`or()` skip `undefined` for clean optional filters.",
    "In both APIs every value is a bind parameter — the filter syntax builds SQL shape, never SQL text.",
  ],

  interview: [
    {
      q: "How would you express WHERE status = 'active' AND (plan = 'pro' OR credits > 100) in Prisma and in Drizzle?",
      a: "In Prisma: `where: { status: 'active', OR: [{ plan: 'pro' }, { credits: { gt: 100 } }] }` — sibling keys are implicitly ANDed, and the OR array is the parenthesised group. In Drizzle: `where(and(eq(users.status, 'active'), or(eq(users.plan, 'pro'), gt(users.credits, 100))))` — imported operator functions whose nesting is literally the parenthesisation. I'd add the caveat I actually care about: Prisma's implicit AND reads ambiguously to people skimming — if the requirement had been `(status AND plan) OR credits`, the flat object is wrong and you have to lift the whole predicate into an explicit `OR: [{ AND: [...] }, ...]`. Drizzle can't express the ambiguity in the first place, which is one reason SQL-fluent people tend to find it easier to audit.",
    },
    {
      q: "How do you do case-insensitive matching and NULL checks in each ORM?",
      a: "Case-insensitivity: Prisma's string filters take `mode: 'insensitive'` — `{ email: { contains: '@example.com', mode: 'insensitive' } }` emits ILIKE on Postgres; Drizzle just has the `ilike()` operator, `ilike(users.email, '%@example.com%')`, mapping one-to-one to the SQL. NULL: in Prisma a bare `null` in the filter — `{ deletedAt: null }` — compiles to IS NULL, with `{ not: null }` for IS NOT NULL; Drizzle has explicit `isNull()` and `isNotNull()` operators. Worth noting from the Postgres side: ILIKE with a leading wildcard can't use a btree index either way — the ORM syntax doesn't change the plan, so the trigram-index conversation is the same one I'd have with raw SQL.",
    },
    {
      q: "What do Prisma's some/every/none relation filters compile to, and when would you worry about them?",
      a: "They're quantifiers over related rows: `posts: { some: { published: true } }` is semantically an EXISTS subquery against the child table, `none` is NOT EXISTS, and `every` is 'no child violates', i.e. NOT EXISTS with the negated condition. I reason about them exactly like hand-written correlated subqueries: they're fine when the join columns and the filtered child columns are indexed, and they get expensive when the child predicate can't use an index or the planner turns a broad `every` into scanning large child sets per parent. If a some/every filter shows up hot in pg_stat_statements, I read the actual generated SQL and EXPLAIN it — same workflow as any slow query, the ORM just wrote the text.",
    },
  ],

  quiz: [
    {
      question:
        "What SQL does this Prisma filter express: { status: 'active', OR: [{ plan: 'pro' }, { credits: { gt: 100 } }] }?",
      options: [
        "(status = 'active' AND plan = 'pro') OR credits > 100",
        "status = 'active' OR plan = 'pro' OR credits > 100",
        "status = 'active' AND (plan = 'pro' OR credits > 100)",
        "It's a compile error — OR cannot appear beside other keys",
      ],
      answerIndex: 2,
      explain:
        "Sibling keys in one filter object always AND together, and the OR array forms one parenthesised group among them. To get (A AND B) OR C you must lift the predicate into an explicit OR: [{ AND: [...] }, ...] — the flat version compiles fine and silently means something else.",
    },
    {
      question:
        "In Drizzle, how do you write email ILIKE '%@corp.com%' AND deleted_at IS NULL?",
      options: [
        "and(ilike(users.email, '%@corp.com%'), isNull(users.deletedAt))",
        "where({ email: { ilike: '%@corp.com%' }, deletedAt: null })",
        "users.email.ilike('%@corp.com%').and(users.deletedAt.isNull())",
        "sql`email ILIKE '%@corp.com%'` — operators don't cover ILIKE",
      ],
      answerIndex: 0,
      explain:
        "Drizzle's operators are standalone functions imported from 'drizzle-orm' — ilike() and isNull() map one-to-one to the SQL, and and() combines them. The pattern string travels as a bind parameter, not interpolated text.",
    },
    {
      question:
        "Why do Drizzle's and() and or() ignore undefined arguments?",
      options: [
        "It's a legacy quirk kept for backwards compatibility",
        "So optional filters compose cleanly — a conditional like plan ? eq(users.plan, plan) : undefined just drops out of the WHERE",
        "Because undefined compiles to NULL in SQL",
        "To silently skip operators the database doesn't support",
      ],
      answerIndex: 1,
      explain:
        "Search endpoints build WHERE clauses from optional inputs. Because and()/or() filter out undefined, you can inline each optional condition with a ternary instead of imperatively assembling an array — absent filters simply vanish from the emitted SQL.",
    },
  ],
};

export default lesson;
