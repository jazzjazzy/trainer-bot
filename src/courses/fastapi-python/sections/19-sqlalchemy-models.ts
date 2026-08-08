import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "sqlalchemy-models",
  title: "SQLAlchemy 2.0 Models",
  part: "Data & Auth",
  estMinutes: 12,
  summary:
    "Modern SQLAlchemy maps tables with DeclarativeBase, Mapped[...] annotations and mapped_column() — a Data Mapper ORM (like Doctrine, unlike Eloquent) where models are plain data and the Session does the persisting.",

  concept: `
FastAPI has no bundled ORM; the de facto pairing is **SQLAlchemy**, and since
the 2.0 release its declarative mapping is annotation-driven — the same
type-hints-do-the-work philosophy as FastAPI itself.

### The 2.0 declarative style

\`\`\`python
# app/models.py
from sqlalchemy import ForeignKey, String, create_engine
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship,
)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str]
    bio: Mapped[str | None]          # Optional -> nullable column

    posts: Mapped[list["Post"]] = relationship(back_populates="author")

class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    author: Mapped["User"] = relationship(back_populates="posts")
\`\`\`

Read the annotations like Pydantic's: \`Mapped[str]\` is a required (NOT NULL)
string column, \`Mapped[str | None]\` is nullable. \`mapped_column()\` is only
needed when there's something extra to say — primary key, uniqueness, an
explicit SQL type, a foreign key. The one-to-many pair is two
\`relationship()\` calls joined by \`back_populates\`, so \`user.posts\` and
\`post.author\` stay in sync in memory.

### Creating tables

\`\`\`python
engine = create_engine("sqlite:///./app.db", echo=True)
Base.metadata.create_all(engine)
\`\`\`

\`create_all\` issues \`CREATE TABLE\` for anything missing — fine for tutorials
and tests. Real projects use **Alembic** (SQLAlchemy's migration tool, from
the same author) for versioned, reversible schema changes — the direct
counterpart of Laravel migrations.

### You will meet legacy 1.x code

Half the SQLAlchemy on Stack Overflow predates 2.0. Recognising the era is
interview gold:

\`\`\`python
# LEGACY 1.x style - recognise it, don't write it
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, String

Base = declarative_base()            # function, not class

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)     # no annotations
    name = Column(String, nullable=False)
\`\`\`

\`declarative_base()\` and bare \`Column\` attributes mark old code;
\`class Base(DeclarativeBase)\` with \`Mapped\`/\`mapped_column\` marks 2.0. The
old style still runs, but type checkers can't see through it — \`Mapped[int]\`
is what lets mypy and your IDE know \`user.id\` is an \`int\`.

### Active Record vs Data Mapper — the interview question

Eloquent is **Active Record**: the model *is* the gateway to the database.
\`$user->save()\`, \`User::find(5)\` — persistence logic lives on the model.

SQLAlchemy is a **Data Mapper**: models are plain mapped classes that know
*nothing* about saving themselves. There is no \`user.save()\`. A separate
**Session** object tracks instances and mediates all database traffic. If
you've used **Doctrine** in Symfony, this is exactly that pattern —
\`EntityManager\` ≈ \`Session\`.

Why prefer it? Models stay decoupled from persistence (trivially testable as
plain objects), and the Session batches work as a *unit of work* — it
accumulates changes and flushes them together — instead of each \`save()\`
firing its own query. Expect "compare Eloquent and SQLAlchemy" or "Active
Record vs Data Mapper" almost verbatim in interviews.
`,

  comparisons: [
    {
      label: "Defining a model",
      intro:
        "A users table with a required email, optional bio, and a primary key. Eloquent infers columns from the database; SQLAlchemy declares them in code as the source of truth.",
      php: `<?php
// app/Models/User.php - Active Record
// Columns live in the DATABASE; the model discovers
// them at runtime. The migration defines the schema:
//
//   Schema::create('users', function (Blueprint $t) {
//       $t->id();
//       $t->string('email')->unique();
//       $t->string('name');
//       $t->text('bio')->nullable();
//   });

class User extends Model
{
    protected $fillable = ['email', 'name', 'bio'];
}
// $user->email works, but no IDE/static tool
// can verify it without extra packages.`,
      ts: `# app/models.py - Data Mapper, schema declared in code
from sqlalchemy import String
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column,
)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True
    )
    name: Mapped[str]
    bio: Mapped[str | None]   # nullable column

# user.email is a str to mypy and your IDE -
# typos like user.emial fail type-checking.`,
      note:
        "Eloquent's columns are implicit (defined by migrations, discovered at runtime); SQLAlchemy's are explicit typed attributes, so static tooling sees them — Mapped[str | None] even encodes nullability.",
    },
    {
      label: "Legacy 1.x vs modern 2.0 declarative",
      intro:
        "The same model in the style you'll find in old codebases and answers, versus what you should write today. Knowing which era code belongs to is a hiring signal.",
      php: `# LEGACY SQLAlchemy 1.x - recognise on sight
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, String

Base = declarative_base()   # factory FUNCTION

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True,
                   nullable=False)
    bio = Column(String, nullable=True)

# No type info: to a type checker, user.id
# is a Column, not an int.`,
      ts: `# MODERN SQLAlchemy 2.0 - write this
from sqlalchemy import String
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column,
)

class Base(DeclarativeBase):    # a real class
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True
    )
    bio: Mapped[str | None]

# Annotations drive it: NOT NULL comes from the
# type, and user.id IS an int to tooling.`,
      note:
        "Markers of old code: declarative_base() the function, bare Column attributes, nullable= flags. In 2.0, DeclarativeBase is subclassed, mapped_column replaces Column, and nullability comes from the | None annotation.",
      leftLang: "python",
      rightLang: "python",
    },
    {
      label: "One-to-many relationships",
      intro:
        "A user has many posts; each post belongs to a user. Eloquent uses method-based magic; SQLAlchemy declares both sides and links them with back_populates.",
      php: `<?php
// app/Models/User.php
class User extends Model
{
    public function posts(): HasMany
    {
        return $this->hasMany(Post::class);
    }
}

// app/Models/Post.php
class Post extends Model
{
    public function author(): BelongsTo
    {
        return $this->belongsTo(
            User::class, 'author_id'
        );
    }
}
// $user->posts triggers a lazy query via magic
// __get; the FK convention is inferred.`,
      ts: `# app/models.py
from sqlalchemy import ForeignKey
from sqlalchemy.orm import (
    Mapped, mapped_column, relationship,
)

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)

    posts: Mapped[list["Post"]] = relationship(
        back_populates="author"
    )

class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id")
    )
    author: Mapped["User"] = relationship(
        back_populates="posts"
    )`,
      note:
        "The FK column is declared explicitly (author_id + ForeignKey), and back_populates links the two relationship attributes so appending to user.posts also sets post.author in memory — before anything is saved.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "The Data Mapper pattern with nothing but the stdlib: a plain User dataclass that knows zero SQL, and a separate mapper that persists it to an in-memory sqlite3 database — the role SQLAlchemy's Session plays. Predict all four printed lines.",
    code: `# Data Mapper in miniature: the model is plain data; a separate
# mapper object owns ALL the SQL. This is SQLAlchemy's split
# (model / Session) - versus Active Record, where save() and
# find() live on the model itself.

import sqlite3
from dataclasses import dataclass

@dataclass
class User:                      # knows NOTHING about databases
    id: int | None
    name: str
    email: str | None = None

class UserMapper:                # knows EVERYTHING about the table
    def __init__(self, conn):
        self.conn = conn
        conn.execute(
            "CREATE TABLE users ("
            " id INTEGER PRIMARY KEY,"
            " name TEXT NOT NULL,"
            " email TEXT)"
        )

    def add(self, user):
        cur = self.conn.execute(
            "INSERT INTO users (name, email) VALUES (?, ?)",
            (user.name, user.email),
        )
        user.id = cur.lastrowid   # like session.refresh: PK flows back
        return user

    def get(self, pk):            # like session.get(User, pk)
        row = self.conn.execute(
            "SELECT id, name, email FROM users WHERE id = ?", (pk,)
        ).fetchone()
        return User(*row) if row else None

    def all(self):
        rows = self.conn.execute(
            "SELECT id, name, email FROM users ORDER BY id"
        ).fetchall()
        return [User(*r) for r in rows]

conn = sqlite3.connect(":memory:")
mapper = UserMapper(conn)

# The model never saves itself - the mapper mediates:
mapper.add(User(id=None, name="Ada", email="ada@example.com"))
mapper.add(User(id=None, name="Linus"))   # email nullable

print(mapper.get(1))          # typed object back out
print(mapper.get(99))         # miss -> None, like session.get
for u in mapper.all():
    print(f"#{u.id} {u.name} email={u.email}")`,
    output: `User(id=1, name='Ada', email='ada@example.com')
None
#1 Ada email=ada@example.com
#2 Linus email=None`,
  },

  keyPoints: [
    "Modern mapping: subclass `DeclarativeBase` for your `Base`, then `id: Mapped[int] = mapped_column(primary_key=True)` — annotations drive the schema, like Pydantic for tables.",
    "`Mapped[str]` means NOT NULL; `Mapped[str | None]` means nullable. `mapped_column()` is only needed for extras (PK, unique, SQL type, ForeignKey).",
    "One-to-many = two `relationship()` attributes joined by `back_populates`, plus an explicit FK column (`author_id: Mapped[int] = mapped_column(ForeignKey(\"users.id\"))`).",
    "`Base.metadata.create_all(engine)` is for tutorials and tests; production schema changes go through Alembic — SQLAlchemy's answer to Laravel migrations.",
    "Legacy markers: `declarative_base()` and bare `Column(...)` attributes = 1.x code. It still runs, but type checkers can't see the attribute types.",
    "Eloquent is Active Record (`$user->save()` — model persists itself); SQLAlchemy is Data Mapper (a Session mediates, models are plain classes) — same camp as Doctrine, and a standard interview question.",
  ],

  interview: [
    {
      q: "Compare Eloquent and SQLAlchemy architecturally.",
      a: "They implement opposite ORM patterns. Eloquent is Active Record: the model class is the database gateway — `$user->save()`, `User::find(5)` — so persistence logic lives on the model, which is concise but couples domain objects to the database. SQLAlchemy is Data Mapper: models are plain mapped classes with no save method, and a separate Session tracks instances and mediates all SQL as a unit of work — it batches inserts, updates, and deletes and flushes them together at commit. The PHP analogue for SQLAlchemy isn't Eloquent at all, it's Doctrine: Session plays the role of the EntityManager. The Data Mapper trade-off is a little more ceremony in exchange for models you can instantiate and test without a database, and explicit control over when SQL actually runs.",
    },
    {
      q: "What does Mapped[str | None] mean on a SQLAlchemy 2.0 model, and how does it differ from the old way?",
      a: "It declares a nullable string column: in the 2.0 annotation-driven style, the Python type determines SQL nullability — `Mapped[str]` produces NOT NULL, `Mapped[str | None]` produces a nullable column. In 1.x you'd write `bio = Column(String, nullable=True)` — a plain class attribute with an explicit flag, invisible to type checkers, which see a Column object rather than a string. The 2.0 style gives you both the schema and accurate static types in one line: mypy knows `user.bio` is `str | None`, so it forces None-handling at call sites.",
    },
    {
      q: "You open a codebase and see declarative_base() and Column(Integer, primary_key=True). What does that tell you and what would you do?",
      a: "That's pre-2.0 SQLAlchemy declarative style — `declarative_base()` the factory function and untyped `Column` attributes are the giveaways; modern code subclasses `DeclarativeBase` and uses `Mapped[...]` with `mapped_column()`. It still works in 2.x, so nothing's on fire, but it means no static typing on model attributes and likely 1.x query patterns like `session.query()` elsewhere. I'd check which SQLAlchemy version is pinned, and if it's already 2.x I'd migrate incrementally — the two styles can coexist on the same Base subclass during transition — converting models and queries module by module rather than in one risky rewrite.",
    },
    {
      q: "How do you handle schema changes in a SQLAlchemy project?",
      a: "With Alembic, the migration tool from the SQLAlchemy author — the direct equivalent of Laravel migrations. `Base.metadata.create_all()` only creates missing tables; it never alters existing ones, so it's strictly for tutorials, prototypes, and test setup. Alembic generates versioned migration scripts (and can autogenerate them by diffing the models against the live schema), supports upgrade and downgrade paths, and runs in CI/CD so every environment converges on the same schema revision.",
    },
  ],

  quiz: [
    {
      question:
        "In SQLAlchemy 2.0 style, how do you declare a nullable string column?",
      options: [
        "bio: Mapped[str] = mapped_column(nullable=True)",
        "bio: Mapped[str | None]",
        "bio = Column(String, nullable=True)",
        "bio: str | None = None",
      ],
      answerIndex: 1,
      explain:
        "In the annotation-driven style, Optional typing (str | None) makes the column nullable — the type is the source of truth. Option C is legacy 1.x; option D is a plain dataclass field, not a mapped column. (A works but fights the idiom: the annotation should carry the nullability.)",
    },
    {
      question:
        "Which line marks a file as legacy SQLAlchemy 1.x rather than 2.0 style?",
      options: [
        "class Base(DeclarativeBase): pass",
        "id: Mapped[int] = mapped_column(primary_key=True)",
        "Base = declarative_base()",
        "posts: Mapped[list[\"Post\"]] = relationship(back_populates=\"author\")",
      ],
      answerIndex: 2,
      explain:
        "declarative_base() — a factory function — is the 1.x way to create the base class; 2.0 code subclasses DeclarativeBase. The other three options are all modern 2.0 idioms.",
    },
    {
      question:
        "SQLAlchemy has no user.save() method. Why?",
      options: [
        "It's a Data Mapper ORM — a separate Session tracks objects and mediates all persistence",
        "Saving is asynchronous, so it must go through await instead",
        "You must call Base.metadata.create_all() to save instances",
        "It does — save() was added in 2.0",
      ],
      answerIndex: 0,
      explain:
        "SQLAlchemy follows the Data Mapper pattern (like Doctrine): models are plain classes, and the Session — a unit of work — decides when and how SQL runs. Active Record ORMs like Eloquent put save() on the model instead.",
    },
    {
      question: "What is Alembic's role next to SQLAlchemy?",
      options: [
        "A connection pooler for production deployments",
        "A schema migration tool — versioned, reversible DDL changes, like Laravel migrations",
        "The async driver SQLAlchemy uses under the hood",
        "A GUI for browsing the database",
      ],
      answerIndex: 1,
      explain:
        "Alembic generates and runs versioned migration scripts (with autogenerate support that diffs your models against the database). create_all() can only add missing tables, so any real schema evolution goes through Alembic.",
    },
  ],
};

export default lesson;
