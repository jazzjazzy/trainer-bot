import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-typed-data-layers",
  title: "Why Typed Data Layers",
  part: "Foundations",
  estMinutes: 10,
  summary:
    "A typed data layer turns the schema into a single source of truth so every query result is a checked type — the PDO bugs that exploded at runtime become compile errors.",

  concept: `
You have written the PDO loop thousands of times: build a SQL string, bind
parameters, \`fetchAll(PDO::FETCH_ASSOC)\`, and get back arrays of strings
keyed by whatever the database happened to return. It works — you have
shipped 25 years of software on it. But notice what the language knows about
that data: **nothing**. \`$row['email']\` and \`$row['emial']\` are equally
valid PHP. One is your data; the other is \`null\` (plus a warning, if you're
lucky), discovered in production.

### The rename that ruins a Tuesday

The classic failure isn't even a typo. Someone renames a column —
\`name\` becomes \`full_name\` in a migration — and every
\`$row['name']\` in the codebase silently starts returning \`null\`. grep
helps, but grep doesn't know which strings are column names. The database
schema and the code that consumes it are **two sources of truth**, connected
only by convention and discipline.

A typed data layer collapses them into one. You declare the schema once —
in Prisma's case a schema file, in Drizzle's case TypeScript code — and the
toolchain derives a type for every table. From then on:

- Every query result is a **checked type**, not a bag of strings.
- \`user.emial\` is a compile error, in your editor, before you save.
- Rename a column and the compiler lists **every line** that must change.

\`\`\`ts
const users = await prisma.user.findMany({ where: { isActive: true } });
// users: { id: number; email: string; isActive: boolean }[]
users[0].emial; // ✗ Property 'emial' does not exist — caught NOW
\`\`\`

In PHP terms: it's as if every \`fetchAll\` returned a typed value object
whose class was regenerated from \`information_schema\` on every build —
except there's no reflection cost and no class boilerplate to maintain.

### This does not replace your SQL

Be very clear on this, because interviewers probe it: **an ORM is a SQL
generator, not a SQL replacement**. \`findMany\` emits a \`SELECT\`;
\`include\` emits joins or extra queries; a lazy loop emits the N+1 pattern
you've been hunting in slow-query logs since the 2000s. Developers who only
know the ORM treat it as magic and can't explain why a query is slow. You
can read the generated SQL, reason about the plan, and know when to drop to
raw SQL. That combination — typed data layer *plus* deep SQL — is exactly
the profile teams struggle to hire.

### What "schema as source of truth" buys a team

- **Refactoring confidence**: schema changes become compiler-guided
  checklists instead of grep-and-pray.
- **Self-documenting queries**: hover a result in the editor and see its
  exact shape — no digging through \`DESCRIBE\` output.
- **Honest nullability**: a nullable column becomes \`string | null\`, and
  TypeScript forces you to handle the \`null\` branch — PDO just hands you
  \`null\` and lets the page render blank.

The rest of this course is about the two main ways to get there in 2026:
Prisma 7 (schema-first, generated client) and Drizzle (schema written in
TypeScript itself). Both ride on the Postgres knowledge you already have.
`,

  comparisons: [
    {
      label: "Fetching active users: PDO vs Prisma",
      intro:
        "Load all active users and print their emails. Both run essentially the same SELECT — the difference is what the language knows about the result.",
      php: `<?php
// PDO: the query works, the result is untyped.
$stmt = $pdo->prepare(
  'SELECT id, email, is_active FROM users WHERE is_active = ?'
);
$stmt->execute([1]);
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($users as $row) {
    // $row is array<string, mixed>. A typo'd key is null,
    // a renamed column is null — nobody tells you.
    echo $row['email'], "\\n";
}`,
      ts: `// src/reports/active-users.ts
import { prisma } from '../db';

const users = await prisma.user.findMany({
  where: { isActive: true },
});
// users: { id: number; email: string; isActive: boolean }[]
// — inferred from the schema, no annotation written here.

for (const u of users) {
  console.log(u.email);   // ✓ checked against the schema
  // console.log(u.emial) // ✗ compile error, not a blank page
}`,
      note: "Prisma emits a parameterised SELECT much like the PDO version — but the result type is derived from the schema, so a wrong property name fails the build instead of returning null at runtime.",
    },
    {
      label: "A repository function: assoc arrays vs a typed contract",
      intro:
        "A helper that loads one user by id. The PHP version's return shape lives in the author's head; the TS version's shape is enforced on both the implementation and every caller.",
      php: `<?php
// src/Repository/UserRepository.php
function findUser(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
    // ?array says nothing about keys. Callers guess:
    // $user['name']? $user['full_name']? Check the DB and hope.
}`,
      ts: `// src/repositories/user.ts
import { prisma } from '../db';

export function findUser(id: number) {
  return prisma.user.findUnique({ where: { id } });
  // Return type: Promise<User | null> — User is generated
  // from the schema. Callers autocomplete real columns,
  // and the | null forces them to handle "not found".
}

const user = await findUser(1);
if (user) console.log(user.fullName); // null-check required`,
      note: "The typed version costs fewer lines, not more: the return type is inferred, and the nullable result is a compiler obligation instead of a code-review comment.",
    },
    {
      label: "The column rename, before and after types",
      intro:
        "A migration renames name to full_name. Watch what each stack does with the code that still reads the old column.",
      php: `<?php
// After: ALTER TABLE users RENAME COLUMN name TO full_name;
$stmt = $pdo->query('SELECT * FROM users LIMIT 1');
$user = $stmt->fetch(PDO::FETCH_ASSOC);

// Still 'passes' — SELECT * hid the rename entirely.
// 'name' is now an undefined index: null + a warning.
echo "Welcome back, " . $user['name'];
// Output: "Welcome back, " — shipped, blank, in production.`,
      ts: `// After the same rename, plus regenerated types:
const user = await prisma.user.findFirst();

console.log('Welcome back, ' + user?.name);
//                                    ^^^^
// error TS2339: Property 'name' does not exist on
// type 'User'. Did you mean 'fullName'?
//
// The build fails. Every stale usage in the codebase is
// listed by the compiler — the rename becomes a checklist.`,
      note: "This is the core sell: the schema change propagates into the type system, so drift between database and code is impossible to ship, not merely unlikely.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A typed data layer in miniature: the schema is a TS interface, the 'database' is an array, and findMany is checked against both. Predict the three logged lines, then try uncommenting the typo at the bottom.",
    code: `// The schema, as a type. In Prisma this is generated from
// schema.prisma; in Drizzle it's inferred from your table code.
interface User {
  id: number;
  email: string;
  isActive: boolean;
}

// The "table" — think of it as what fetchAll() would return,
// except every row is a User, not an untyped assoc array.
const usersTable: User[] = [
  { id: 1, email: 'ana@example.com', isActive: true },
  { id: 2, email: 'bo@example.com', isActive: false },
  { id: 3, email: 'cy@example.com', isActive: true },
];

// A typed findMany: the filter can only mention real columns,
// and the result is User[] — no casting, no guessing.
function findMany(where: Partial<User>): User[] {
  return usersTable.filter((row) =>
    Object.entries(where).every(
      ([key, value]) => row[key as keyof User] === value
    )
  );
}

const active = findMany({ isActive: true });
console.log('active users: ' + active.length);
for (const u of active) {
  console.log(\`#\${u.id} \${u.email}\`);
}

// The PDO classic — $row['emial'] — is a compile error here.
// Uncomment and watch the editor object before anything runs:
// console.log(active[0].emial);

// So is filtering on a column that doesn't exist:
// findMany({ is_active: true });`,
  },

  keyPoints: [
    "PDO's `fetchAll(PDO::FETCH_ASSOC)` returns untyped arrays — `$row['emial']` is valid PHP that fails silently at runtime; a typed data layer makes the same mistake a compile error.",
    "A typed data layer collapses two sources of truth (database schema + code's assumptions) into one: the schema, from which every result type is derived.",
    "Rename a column and the compiler lists every affected line — schema drift becomes a build failure instead of a production incident.",
    "Nullable columns surface as `string | null` etc., forcing callers to handle the missing case that PDO lets slide.",
    "ORMs generate SQL, they don't replace it — `findMany` is a `SELECT`, and your ability to read and judge that SQL is a career asset, not obsolete knowledge.",
    "This course teaches the two dominant typed layers for Postgres in 2026: Prisma 7 (schema-first, generated client) and Drizzle (schema as TypeScript code).",
  ],

  interview: [
    {
      q: "You've used raw SQL with PDO for decades. Why would you adopt an ORM now?",
      a: "Not to avoid SQL — to get compile-time guarantees on the seam between the database and the code. With PDO, results are associative arrays: a typo'd key or a renamed column returns `null` at runtime, and nothing warns me. With Prisma or Drizzle, the schema is the single source of truth and every query result is a checked type, so those failures become build errors. I still care deeply about the SQL the ORM emits — I read the generated queries, watch for N+1 patterns and over-fetching, and drop to raw SQL when the builder gets in the way. The ORM buys type safety and refactoring speed; my SQL background is what keeps its output honest.",
    },
    {
      q: "What concrete class of bugs does a typed data layer eliminate?",
      a: "Schema-drift bugs — any mismatch between what the database actually has and what the code assumes. Three examples: a typo'd column key that reads `null` forever; a column rename that silently breaks every consumer; and unhandled nullability, where a nullable column flows into code that assumes a value. In TypeScript those become `Property does not exist` errors and forced `| null` handling at compile time. What it does not eliminate: logic bugs, bad queries, or performance problems — an ORM will happily generate a slow query with perfect types, which is why understanding the emitted SQL still matters.",
    },
    {
      q: "Does using an ORM mean you no longer need to know SQL?",
      a: "The opposite — the best ORM users are the ones who can read what it generates. Every ORM call maps to SQL: `findMany` is a `SELECT`, relation loading is joins or follow-up queries, and careless relation access in a loop is the classic N+1. When something is slow, the debugging path runs straight through `EXPLAIN` and the query plan, exactly as it did with hand-written SQL. ORMs also have escape hatches — Prisma's `$queryRaw`, Drizzle's `sql` template — precisely because their authors expect you to write SQL when it's the right tool. I'd describe an ORM as a typed SQL generator with great ergonomics, not an abstraction that lets you forget the database.",
    },
  ],

  quiz: [
    {
      question:
        "In a PDO codebase, a migration renames the `name` column to `full_name`. What happens to existing `$row['name']` reads?",
      options: [
        "PDO throws an exception at prepare() time",
        "They return null (with at most a notice/warning) and the code keeps running",
        "MySQL/Postgres rejects the SELECT with an unknown-column error",
        "PHP's type system flags them before deployment",
      ],
      answerIndex: 1,
      explain:
        "With FETCH_ASSOC the row is just an array; reading a key that no longer exists yields null plus an undefined-index warning at most. SELECT * hides the rename from the database too. That silent failure mode is exactly what a typed data layer converts into a compile error.",
    },
    {
      question: "What does 'the schema is the single source of truth' mean in a typed data layer?",
      options: [
        "The database validates all application types at runtime",
        "All SQL must be written inside the schema file",
        "Result types are derived from one schema definition, so code and database structure cannot silently drift apart",
        "The ORM prevents you from ever writing raw SQL",
      ],
      answerIndex: 2,
      explain:
        "Prisma generates types from schema.prisma; Drizzle infers them from the table definitions. Because every query result type traces back to that one definition, any code that disagrees with the schema fails to compile — the drift that PDO tolerated becomes impossible to ship.",
    },
    {
      question: "Which statement about ORMs and SQL knowledge is accurate?",
      options: [
        "ORMs execute queries without producing SQL, so SQL knowledge is irrelevant",
        "ORMs generate SQL, and being able to read and evaluate that SQL is a major advantage",
        "ORMs always produce optimal SQL, so performance tuning is unnecessary",
        "ORMs forbid raw SQL to preserve type safety",
      ],
      answerIndex: 1,
      explain:
        "Every ORM call compiles to SQL, and problems like N+1 queries or over-fetching are diagnosed by reading that SQL and its plan. Both Prisma ($queryRaw) and Drizzle (the sql template) provide raw-SQL escape hatches because their designers assume you'll need them.",
    },
  ],
};

export default lesson;
