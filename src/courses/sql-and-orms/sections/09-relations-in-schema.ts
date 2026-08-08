import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "relations-in-schema",
  title: "Declaring Relations: 1-1, 1-n, m-n",
  part: "Schema & Migrations",
  estMinutes: 12,
  summary:
    "Both ORMs split relations into two layers: the real FOREIGN KEY constraint that lands in DDL, and query-layer relation declarations that exist only so the client can join for you.",

  concept: `
Take the classic blog trio — \`users\`, \`posts\`, \`tags\` — and model it in both
ORMs. The one distinction that makes everything else fall into place: **the
foreign key is real DDL; the relation fields are not.** Keep asking "which
layer am I looking at?" and neither ORM can confuse you.

### Prisma: @relation, and the virtual side

\`\`\`ts
// prisma/schema.prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]                 // VIRTUAL: no column, no DDL
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int                 // REAL column: the FK lives here
  author   User   @relation(fields: [authorId], references: [id],
                             onDelete: Cascade)
}
\`\`\`

\`authorId\` is the actual \`integer\` column; the migration adds
\`FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE\`.
\`author\` and \`posts\` are **relation fields** — they generate no columns
whatsoever. They exist so the client can offer \`include: { posts: true }\`,
and so the schema documents both directions. Prisma requires the back-relation
(\`posts Post[]\`) even if you never query that direction.

For 1-1, add \`@unique\` on the FK column — exactly how you have always turned
"many" into "one" at the database level.

### Prisma's implicit many-to-many

\`\`\`ts
model Post {
  id   Int   @id @default(autoincrement())
  tags Tag[]
}

model Tag {
  id    Int    @id @default(autoincrement())
  name  String @unique
  posts Post[]
}
\`\`\`

No join model in sight, but the migration creates one: a table named
\`_PostToTag\` with columns \`A\` and \`B\`, a unique index over both, and FKs
with \`ON DELETE CASCADE\`. Convenient — until you need columns *on* the
relationship (\`taggedAt\`, \`addedBy\`), at which point you model the join
table explicitly as its own \`model\`, the way you would have designed it
anyway.

### Drizzle: the FK and the query layer are separate APIs

\`\`\`ts
// src/db/schema.ts
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }), // REAL: DDL
});

// Query-layer only — emits NO DDL:
import { relations } from "drizzle-orm";

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));
export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
\`\`\`

\`.references(...)\` puts the \`FOREIGN KEY ... ON DELETE CASCADE\` into the
generated migration. The \`relations()\` helper is a *parallel declaration*
that powers the relational query API —
\`db.query.users.findMany({ with: { posts: true } })\` — and nothing else. You
can define \`relations()\` without any FK (useful on legacy schemas that never
had constraints), or FKs without \`relations()\` (you just lose \`with\`).
Drizzle has no implicit m-n: you write the join table yourself, composite
primary key and all.

### onDelete: the same clauses you have always written

Both ORMs pass referential actions straight through to Postgres:
\`Cascade\`/\`"cascade"\`, \`SetNull\`/\`"set null"\`, \`Restrict\`/\`"restrict"\`,
plus \`NoAction\` and \`SetDefault\`. Nothing is emulated in the client for
Postgres — a cascade is executed by the database, invisible to the ORM, which
is why the playground below is pure SQL. Prisma's defaults if you say nothing:
optional relations get \`SetNull\`, required ones get \`Restrict\` — sensible,
but check the migration rather than assuming.
`,

  comparisons: [
    {
      label: "A foreign key, DDL vs @relation",
      intro:
        "posts.author_id references users.id with a cascade. The DDL states it once; Prisma splits it across a real column, a virtual field, and a required back-relation.",
      php: `CREATE TABLE posts (
    id        serial PRIMARY KEY,
    title     text NOT NULL,
    author_id integer NOT NULL
              REFERENCES users(id)
              ON DELETE CASCADE
);`,
      ts: `// prisma/schema.prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]   // virtual back-relation — REQUIRED by Prisma,
}                // but produces no column and no DDL

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int    // the real column
  author   User   @relation(fields: [authorId],
                            references: [id],
                            onDelete: Cascade)
}`,
      note:
        "Only authorId and the FOREIGN KEY constraint reach the database; author and posts are query-layer conveniences that enable include/select on relations — SELECT * FROM posts will never show an 'author' column.",
      leftLang: "sql",
    },
    {
      label: "Many-to-many: explicit join table vs implicit @relation",
      intro:
        "Posts have tags. You have always modelled this with a join table; Prisma will happily hide that table — but it still exists.",
      php: `CREATE TABLE post_tags (
    post_id integer NOT NULL
            REFERENCES posts(id) ON DELETE CASCADE,
    tag_id  integer NOT NULL
            REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);
-- Yours to extend: add tagged_at, added_by ...`,
      ts: `// prisma/schema.prisma — no join model written...
model Post {
  id   Int   @id @default(autoincrement())
  tags Tag[]
}

model Tag {
  id    Int    @id @default(autoincrement())
  name  String @unique
  posts Post[]
}

// ...but the migration still creates one:
//   CREATE TABLE "_PostToTag" (
//     "A" INTEGER NOT NULL,  -- FK -> Post, ON DELETE CASCADE
//     "B" INTEGER NOT NULL   -- FK -> Tag,  ON DELETE CASCADE
//   );
//   + unique index on ("A","B")`,
      note:
        "Implicit m-n costs you control: the moment the relationship needs its own columns (tagged_at, added_by) you must promote it to an explicit model — Drizzle skips the magic and has you write the join table from day one.",
      leftLang: "sql",
    },
    {
      label: "The same 1-n in Prisma and in Drizzle",
      intro:
        "One author, many posts — declared in both ORMs. Note where each puts the real FK and where each puts the query-layer declaration.",
      php: `// prisma/schema.prisma — one block does both jobs
model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId],
                          references: [id],
                          onDelete: Cascade)
}`,
      ts: `// Drizzle separates the two layers explicitly.
// Layer 1 — real DDL:
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

// Layer 2 — query layer for db.query ... with: {}
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));
export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));`,
      note:
        "Prisma folds FK and query convenience into one @relation attribute; Drizzle makes the split physical — .references() emits DDL, relations() emits nothing and only unlocks db.query's with — so you can have either without the other.",
      leftLang: "ts",
    },
  ],

  playground: {
    lang: "sql",
    intro:
      "Three tables, two referential actions. Predict exactly which rows survive DELETE FROM users WHERE id = 1 — trace the cascade through posts into comments, and note what SET NULL does instead.",
    code: `CREATE TABLE users (
    id   serial PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE posts (
    id        serial PRIMARY KEY,
    author_id integer NOT NULL
              REFERENCES users(id) ON DELETE CASCADE,
    title     text NOT NULL
);

CREATE TABLE comments (
    id        serial PRIMARY KEY,
    post_id   integer NOT NULL
              REFERENCES posts(id) ON DELETE CASCADE,
    author_id integer
              REFERENCES users(id) ON DELETE SET NULL,
    body      text NOT NULL
);

INSERT INTO users VALUES (1, 'ana'), (2, 'bob');
INSERT INTO posts VALUES (10, 1, 'Ana''s post'), (11, 2, 'Bob''s post');
INSERT INTO comments VALUES
  (100, 10, 2, 'nice'),    -- bob comments on ana's post
  (101, 11, 1, 'thanks'),  -- ana comments on bob's post
  (102, 11, 2, 'agreed');  -- bob comments on bob's post

DELETE FROM users WHERE id = 1;   -- ana leaves

SELECT * FROM posts;
SELECT * FROM comments;`,
    output: `DELETE 1

SELECT * FROM posts;
 id | author_id |   title
----+-----------+------------
 11 |         2 | Bob's post
(1 row)

SELECT * FROM comments;
 id  | post_id | author_id |  body
-----+---------+-----------+--------
 101 |      11 |           | thanks
 102 |      11 |         2 | agreed
(2 rows)

-- Why: deleting ana cascades to post 10, and THAT cascade
-- cascades on to comment 100 (two hops, all inside Postgres).
-- Comment 101 survives because its post belongs to bob, but its
-- author_id is SET NULL — ana's authorship is erased, not the row.`,
  },

  keyPoints: [
    "The FK constraint (`authorId Int` + `@relation(fields, references)` in Prisma; `.references(() => users.id)` in Drizzle) is real DDL; relation fields like `author`/`posts` and Drizzle's `relations()` helper produce **no columns and no DDL**.",
    "Prisma requires the back-relation on the other model (`posts Post[]`) even if you never query it — it's schema documentation plus the hook for `include`.",
    "Prisma's implicit m-n (`tags Tag[]` / `posts Post[]`) silently creates a `_PostToTag(A, B)` join table with cascading FKs; the moment the relationship needs its own columns, promote it to an explicit model.",
    "Drizzle has no implicit m-n — you write the join table with its composite primary key yourself, exactly as you always designed it.",
    "Drizzle's `relations()` exists solely to power `db.query.*.findMany({ with: ... })`; you can declare it without FKs (legacy constraint-free schemas) or FKs without it.",
    "`onDelete: Cascade / SetNull / Restrict` pass straight through to `ON DELETE ...` clauses executed by Postgres; Prisma's defaults are SetNull for optional relations and Restrict for required ones — read the migration, don't assume.",
  ],

  interview: [
    {
      q: "In Prisma, what's the difference between the authorId field and the author field on a Post model?",
      a: "\`authorId Int\` is the real database column — the migration creates it and attaches the FOREIGN KEY constraint. \`author User @relation(...)\` is a relation field: it produces no column and no DDL, and exists purely at the query layer so the client can offer \`include: { author: true }\` and typed traversal. \`SELECT * FROM \"Post\"\` will show authorId but never author. The same split exists in Drizzle, just as two separate APIs: \`.references()\` emits the FK DDL while the \`relations()\` helper only unlocks \`db.query\`'s \`with\`. Knowing which layer each declaration lives in is the difference between reading a schema and guessing at one.",
    },
    {
      q: "How does Prisma handle many-to-many relations, and when would you avoid the implicit form?",
      a: "With list relation fields on both models — \`tags Tag[]\` and \`posts Post[]\` — Prisma generates a hidden join table, \`_PostToTag\`, with \`A\` and \`B\` columns, a unique index across both, and cascading FKs. It's genuinely convenient for pure associations. I'd avoid it the moment the relationship itself carries data — \`tagged_at\`, \`added_by\`, an ordering column — because the implicit table can't hold extra columns; you promote it to an explicit model with two 1-n relations, which is exactly the join table I'd have designed in SQL from the start. Drizzle forces that explicit design always, composite primary key included, which I don't mind: after 25 years, hidden tables in my schema make me nervous.",
    },
    {
      q: "Does an ORM-level cascade delete actually run in your application?",
      a: "Not on Postgres with these ORMs — \`onDelete: Cascade\` in Prisma and \`{ onDelete: \"cascade\" }\` in Drizzle both compile to an \`ON DELETE CASCADE\` clause in the migration DDL, so the cascade executes inside Postgres, in the same transaction as the delete, whether or not the ORM is even running. That's the behaviour I want: one DELETE statement, referential integrity handled atomically by the engine I trust. The interview-worthy nuance is Prisma's defaults when you don't specify: optional relations get SetNull, required relations get Restrict — so a delete can fail with an FK violation that surprises developers who assumed cascade. I always read the generated migration to confirm which clause actually shipped.",
    },
  ],

  quiz: [
    {
      question:
        "A Prisma Post model has `authorId Int` and `author User @relation(fields: [authorId], references: [id])`. What lands in the database?",
      options: [
        "Two columns: authorId and author",
        "One column (authorId) plus a FOREIGN KEY constraint; author is query-layer only",
        "One column (author) holding a serialized User reference",
        "No columns — Prisma joins on demand using its own metadata",
      ],
      answerIndex: 1,
      explain:
        "Relation fields are virtual: only the scalar FK column and its constraint reach the DDL. The author field exists so the generated client can offer include/select traversal — the core FK-vs-relation-field distinction both ORMs share.",
    },
    {
      question:
        "In Drizzle, what happens if you declare relations() between users and posts but never call .references() on posts.authorId?",
      options: [
        "drizzle-kit refuses to generate a migration",
        "A foreign key is inferred from the relations() declaration",
        "db.query's `with` works, but the database has no FK constraint enforcing integrity",
        "Queries fail at runtime with a missing-constraint error",
      ],
      answerIndex: 2,
      explain:
        "relations() is purely a query-layer declaration — it emits no DDL and powers db.query.users.findMany({ with: { posts: true } }) regardless of constraints. Integrity enforcement only exists if .references() put a real FOREIGN KEY into the migration. The two layers are independent by design.",
    },
    {
      question:
        "Prisma's implicit many-to-many between Post and Tag creates which database object?",
      options: [
        "An array column tag_ids on the Post table",
        "A join table _PostToTag with columns A and B, a unique index, and cascading FKs",
        "A Postgres composite type linking the two tables",
        "Nothing — the relation is resolved in the client at query time",
      ],
      answerIndex: 1,
      explain:
        "The join table is real, just hidden from your schema file: _PostToTag(\"A\", \"B\") with a unique index over both columns and ON DELETE CASCADE FKs to each side. It cannot carry extra columns, which is why relationships with their own data need an explicit join model.",
    },
    {
      question:
        "users → posts has ON DELETE CASCADE; posts → comments has ON DELETE CASCADE. Deleting a user does what to comments on that user's posts?",
      options: [
        "Nothing — cascades only travel one level",
        "They are deleted: the cascade chains through posts to comments, entirely inside Postgres",
        "Their post_id is set to NULL",
        "The delete fails unless the ORM issues three DELETE statements",
      ],
      answerIndex: 1,
      explain:
        "Cascades chain: deleting the user deletes their posts, and each deleted post triggers its own cascade into comments — all in one atomic operation inside the database, with no ORM involvement. That's why both ORMs simply compile onDelete to the DDL clause and let Postgres do the work.",
    },
  ],
};

export default lesson;
