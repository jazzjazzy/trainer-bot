import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "raw-sql-escape-hatches",
  title: "Raw SQL Escape Hatches, Still Typed",
  part: "Transactions & Performance",
  estMinutes: 13,
  summary:
    "Prisma's $queryRaw and Drizzle's sql operator let you write the SQL you already know — with tagged-template interpolation compiling to bind parameters, so it stays as safe as PDO prepare/execute.",

  concept: `
Your 25 years of SQL never goes to waste. Both ORMs assume that sooner or later you
will out-write their query builders — window functions, CTEs, a report query with
four joins — and both give you a hatch that keeps two properties intact:
**parameterisation** (no injection) and, with a little help, **types**.

### The one mechanism to understand: tagged templates

Both hatches are built on JavaScript tagged template literals. When you write
\`\` prisma.$queryRaw\`...\` \`\` or Drizzle's \`\` sql\`...\` \`\`, the function receives the
literal string *pieces* and the interpolated *values* separately — they are never
concatenated. Each \`\${value}\` becomes a placeholder (\`$1\`, \`$2\`, ...) and the value
travels in the parameter list. This is PDO's \`prepare\`/\`execute\` with the syntax
inverted: instead of writing \`:email\` and binding later, you interpolate and the
binding happens for you.

\`\`\`ts
const email = req.query.email; // hostile input, doesn't matter
const users = await prisma.$queryRaw<{ id: number; name: string }[]>\`
  SELECT id, name FROM "User" WHERE email = \${email}
\`;
// Executed as: SELECT id, name FROM "User" WHERE email = $1  [email]
\`\`\`

The generic parameter (\`<{ id: number; name: string }[]>\`) is a **promise you make**,
not something Prisma checks — raw results are untyped at runtime, so a wrong
annotation is a lie the compiler believes. For raw queries you run constantly,
Prisma's **TypedSQL** closes that gap: you write the query in a \`.sql\` file under
\`prisma/sql/\`, \`prisma generate --sql\` (with \`previewFeatures = ["typedSql"]\`)
compiles it into a typed function, and you call it
with \`prisma.$queryRawTyped(getUserActivity(userId))\` — argument types and result
types both generated from the SQL itself.

### The footgun with "Unsafe" in its name

\`$queryRawUnsafe(queryString)\` takes a plain string. If any part of that string came
from user input via concatenation, you have written the same vulnerable code as
\`$pdo->query("... '$name'")\` in 2004. It exists for genuinely dynamic SQL (a table
name chosen from a fixed allowlist); treat every code-review sighting of it as guilty
until proven innocent. The subtle trap: \`\` $queryRawUnsafe(\`... \${name}\`) \`\` *looks*
like the safe version but interpolates before the call — the function only ever sees
the finished string.

### Drizzle: the sql operator composes *inside* queries

Prisma's hatch replaces the whole statement. Drizzle's \`sql\` operator is finer-grained —
it drops into any slot of a built query, so you keep the typed builder and go raw only
where you must:

\`\`\`ts
import { sql, desc } from "drizzle-orm";

const ranked = await db
  .select({
    name: employees.name,
    salary: employees.salary,
    rank: sql<number>\`rank() over (order by \${employees.salary} desc)\`,
  })
  .from(employees)
  .orderBy(desc(employees.salary));
\`\`\`

Interpolating a **column** (\`\${employees.salary}\`) emits the identifier; interpolating
a **value** emits a placeholder and binds it. The \`sql<number>\` generic types the
fragment's result — again your promise, not a runtime check. For a full statement,
\`\` db.execute(sql\`...\`) \`\` is the whole-hog equivalent of \`$queryRaw\`.

### The rule you already live by

Same lesson you've taught PHP juniors since PDO landed: **the query text and the data
must travel separately**. Tagged-template interpolation does that; string
concatenation (or building the string *before* the tagged call) does not. Everything
else in this section is API detail on top of that one rule.
`,

  comparisons: [
    {
      label: "PDO prepare/execute vs $queryRaw",
      intro:
        "Fetch users by status with hostile input safely parameterised. Both send the query text and the value to Postgres separately.",
      php: `<?php
// The discipline you already have: placeholders + bind
$stmt = $pdo->prepare(
  'SELECT id, name FROM users
   WHERE status = :status AND created_at > :since'
);
$stmt->execute([
  ':status' => $_GET['status'],
  ':since'  => $since,
]);
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);
// $users: array of untyped assoc arrays`,
      ts: `interface UserRow {
  id: number;
  name: string;
}

// Interpolations become $1, $2 bind params — never string parts
const users = await prisma.$queryRaw<UserRow[]>\`
  SELECT id, name FROM users
  WHERE status = \${req.query.status} AND created_at > \${since}
\`;
// users: UserRow[] — but the generic is YOUR claim;
// for hot queries, TypedSQL generates it from the .sql file`,
      note:
        "Same safety mechanism as prepare/execute — the tagged template hands string parts and values to the driver separately; the generic types the rows but is unchecked, which is exactly what TypedSQL fixes.",
    },
    {
      label: "A window function: raw SQL vs Drizzle sql`` embedding",
      intro:
        "Rank employees by salary. Prisma's groupBy can't express this at all; Drizzle embeds the window function inside an otherwise typed select.",
      php: `SELECT name,
       salary,
       rank() OVER (ORDER BY salary DESC) AS rank
FROM employees
ORDER BY salary DESC;`,
      ts: `import { sql, desc } from "drizzle-orm";

const ranked = await db
  .select({
    name: employees.name,     // typed column
    salary: employees.salary, // typed column
    rank: sql<number>\`rank() over (order by \${employees.salary} desc)\`,
  })
  .from(employees)
  .orderBy(desc(employees.salary));
// ranked: { name: string; salary: string; rank: number }[]`,
      note:
        "Interpolating a column object emits the identifier, interpolating a plain value emits a bind parameter — Drizzle knows the difference, so sql`` fragments stay injection-safe inside typed queries.",
      leftLang: "sql",
    },
    {
      label: "The footgun, then and now",
      intro:
        "The same injection bug, twenty years apart: query text built by concatenating user input. Both right-hand fixes keep data out of the query string.",
      php: `<?php
// 2004-vintage PHP — name becomes part of the SQL text
$name = $_GET['name'];
$rows = $pdo->query(
  "SELECT id FROM users WHERE name = '$name'"
);
// ?name=' OR '1'='1  → returns every user`,
      ts: `// SAME BUG: interpolation happens BEFORE the call —
// $queryRawUnsafe only ever sees the finished string
const rows = await prisma.$queryRawUnsafe(
  \`SELECT id FROM users WHERE name = '\${name}'\`
);

// SAFE: tagged template — name travels as $1
const ok = await prisma.$queryRaw\`
  SELECT id FROM users WHERE name = \${name}
\`;`,
      note:
        "The visual difference is tiny — parentheses with a template string vs a direct tagged template — but only the tagged form separates text from data; reserve $queryRawUnsafe for allowlisted dynamic SQL like table names.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "How both ORMs' raw hatches actually work, in 30 lines: a tagged template function that collects interpolated values into a params array and rewrites each slot as $1, $2, ... Run it and note that the malicious input never touches the query text.",
    code: `// A miniature of prisma.$queryRaw / Drizzle's sql\`\` mechanism.

interface ParamQuery {
  text: string;
  params: unknown[];
}

// A tag function receives the literal string PIECES and the
// interpolated VALUES separately — they are never concatenated.
function sqlTag(strings: TemplateStringsArray, ...values: unknown[]): ParamQuery {
  let text = strings[0];
  const params: unknown[] = [];
  values.forEach((value, i) => {
    params.push(value);                 // value -> parameter list
    text += "$" + (i + 1) + strings[i + 1]; // slot -> placeholder
  });
  return { text, params };
}

// Hostile input, straight out of the textbook:
const name = "' OR '1'='1";
const minId = 100;

const q = sqlTag\`SELECT id, name FROM users WHERE name = \${name} AND id > \${minId}\`;

console.log("text:  " + q.text);
console.log("params: " + JSON.stringify(q.params));

// Compare with concatenation — the attack becomes part of the SQL:
const evil = "SELECT id, name FROM users WHERE name = '" + name + "'";
console.log("concat: " + evil);

// The tagged version sends text + params separately to Postgres,
// exactly like PDO prepare/execute. The concat version is the
// injection you have been fixing in PHP codebases since 2004.`,
  },

  keyPoints: [
    "Both hatches ride on tagged template literals: the function receives string pieces and interpolated values separately, turning each `${value}` into a `$n` bind parameter — PDO prepare/execute with the syntax inverted.",
    "`prisma.$queryRaw<T[]>` types the rows via a generic, but that annotation is your unchecked claim; TypedSQL (.sql files under prisma/sql, compiled by `prisma generate --sql` with the `typedSql` preview feature enabled, called with `$queryRawTyped`) generates real types from the SQL.",
    "`$queryRawUnsafe` takes a finished string — building that string with interpolation or concatenation from user input is textbook injection; reserve it for allowlisted dynamic identifiers.",
    "Drizzle's `sql` operator embeds raw fragments inside typed queries — in select fields, where, orderBy — and `db.execute` runs full raw statements.",
    "In a Drizzle sql fragment, interpolating a column object emits the identifier while interpolating a plain value emits a bind parameter — composition stays injection-safe.",
    "The invariant from your PDO years still rules: query text and data must travel to the server separately; every API choice here is just enforcing that.",
  ],

  interview: [
    {
      q: "How does Prisma's $queryRaw prevent SQL injection when you're interpolating variables directly into the query?",
      a: "Because it's a tagged template, not string interpolation. JavaScript hands the tag function the literal string pieces and the interpolated values as separate arguments — they're never joined. Prisma rewrites each interpolation slot as a placeholder ($1, $2 on Postgres) and ships the values in the parameter list, so the database parses the query shape before any data arrives. It's exactly PDO's prepare/execute contract with nicer syntax. The danger is $queryRawUnsafe, which accepts a plain string: if you build that string with a template literal, interpolation happens before the call and you've reinvented the 2004 injection bug. I'd flag any $queryRawUnsafe in review unless the dynamic part is from a hard-coded allowlist.",
    },
    {
      q: "Raw queries lose type safety. How do you get it back in each ORM?",
      a: "Three tiers. Cheapest: `$queryRaw<MyRow[]>` or Drizzle's `sql<number>` generic — that types the result, but it's an unchecked assertion; if the SQL drifts from the annotation the compiler happily believes the lie. Better, in Prisma: TypedSQL — the query lives in a .sql file under prisma/sql, prisma generate compiles it into a function with typed arguments and a typed result, and I call it via $queryRawTyped, so the types are derived from the SQL rather than hand-maintained. In Drizzle the story is structural: because `sql` fragments embed inside an otherwise typed builder query, most of the statement keeps inferred types and only the raw fragment needs an annotation.",
    },
    {
      q: "When do you drop from the ORM query builder to raw SQL, and how do you keep that maintainable?",
      a: "When the SQL vocabulary outgrows the builder: window functions, CTEs with recursion, FILTER clauses, ORDER BY inside aggregates, or a report query where I want to control the exact plan. I'd rather write one statement I can EXPLAIN than contort an ORM API into emitting something unpredictable. For maintainability: keep raw queries parameterised (tagged templates only), give them types that are generated rather than asserted where possible (TypedSQL), and prefer Drizzle-style partial embedding over whole-statement raw when only one expression needs it — that keeps the schema references checked. Raw SQL isn't an admission of failure; it's the reason both ORMs ship first-class hatches.",
    },
  ],

  quiz: [
    {
      question:
        "Why is prisma.$queryRaw`SELECT * FROM users WHERE name = ${name}` safe even with hostile input?",
      options: [
        "Prisma escapes quotes in the string before concatenating",
        "The tagged template keeps string pieces and values separate, so the value ships as a bind parameter, never as query text",
        "Prisma validates the input against the schema's field types first",
        "It isn't — you must sanitise name yourself first",
      ],
      answerIndex: 1,
      explain:
        "Tagged templates give the tag function the literal parts and interpolated values as separate arguments; Prisma turns each slot into $n and sends the values in the parameter list — the same text/data separation as PDO prepare/execute. No escaping or sanitising is involved.",
    },
    {
      question:
        "What is wrong with: prisma.$queryRawUnsafe(`SELECT * FROM users WHERE name = '${name}'`)?",
      options: [
        "Nothing — Unsafe only refers to missing result types",
        "It will throw because $queryRawUnsafe rejects template literals",
        "The template literal interpolates before the call, so the function receives a finished string with the input already embedded — classic injection",
        "It's safe but slower, because the query can't be prepared",
      ],
      answerIndex: 2,
      explain:
        "$queryRawUnsafe takes a plain string, and the backtick interpolation runs first — by the time Prisma sees it, the hostile input is part of the SQL text. The tagged $queryRaw form looks nearly identical but parameterises; that visual closeness is exactly why the Unsafe variant is a review red flag.",
    },
    {
      question:
        "In a Drizzle sql`...` fragment, what happens when you interpolate employees.salary (a column object) vs a plain number?",
      options: [
        "Both become bind parameters",
        "Both are inlined as literal text",
        "The column emits its identifier into the SQL; the number becomes a bind parameter",
        "Columns are rejected — only values may be interpolated",
      ],
      answerIndex: 2,
      explain:
        "Drizzle inspects what you interpolate: schema column objects render as quoted identifiers (so fragments can reference tables safely), while plain values become placeholders with bound parameters. That's what makes the sql operator composable inside typed queries without opening an injection hole.",
    },
    {
      question: "What does Prisma's TypedSQL give you over $queryRaw<T[]>?",
      options: [
        "Runtime validation of every returned row against T",
        "Types generated from the .sql file itself — argument and result types are derived, not hand-asserted",
        "Automatic caching of repeated raw queries",
        "It converts raw SQL into Prisma query-builder calls",
      ],
      answerIndex: 1,
      explain:
        "With $queryRaw<T[]> the generic is a promise the compiler can't verify. TypedSQL compiles .sql files under prisma/sql into functions whose parameter and result types come from the query, called via $queryRawTyped — the contract is derived from the SQL, so it can't silently drift.",
    },
  ],
};

export default lesson;
