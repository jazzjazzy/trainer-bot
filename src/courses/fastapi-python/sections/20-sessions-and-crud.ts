import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "sessions-and-crud",
  title: "Sessions, Depends & CRUD Endpoints",
  part: "Data & Auth",
  estMinutes: 13,
  summary:
    "Wire SQLAlchemy into FastAPI with a yield-dependency that opens one Session per request, then build CRUD endpoints with 2.0-style queries — remembering that nothing hits the database until commit.",

  concept: `
Models describe tables; the **Session** is what actually talks to the
database. Wiring it into FastAPI is a three-piece pattern you'll write in
every project: an engine, a session factory, and a yield-dependency.

### One session per request

\`\`\`python
# app/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

engine = create_engine("sqlite:///./app.db")
SessionLocal = sessionmaker(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db          # handler runs here
    finally:
        db.close()        # runs even if the handler raised
\`\`\`

\`get_db\` is a yield-dependency: FastAPI opens a fresh session before the
handler, injects it, and the \`finally\` closes it after the response — even on
exceptions. One request, one session, always cleaned up. This is the PHP-FPM
lifecycle you already trust (fresh state per request), made explicit. Add the
usual \`Annotated\` alias and every endpoint can ask for it:

\`\`\`python
from typing import Annotated
from fastapi import Depends

SessionDep = Annotated[Session, Depends(get_db)]
\`\`\`

### The CRUD quartet, 2.0 style

\`\`\`python
# app/routers/users.py
@router.post("/", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, db: SessionDep):
    user = User(**data.model_dump())
    db.add(user)          # queued, not written
    db.commit()           # NOW the INSERT runs
    db.refresh(user)      # pull back DB-generated id
    return user

@router.get("/{user_id}", response_model=UserOut)
def read_user(user_id: int, db: SessionDep):
    user = db.get(User, user_id)       # by primary key
    if user is None:
        raise HTTPException(404, "User not found")
    return user

@router.get("/", response_model=list[UserOut])
def list_users(db: SessionDep, skip: int = 0, limit: int = 100):
    stmt = select(User).offset(skip).limit(limit)
    return db.execute(stmt).scalars().all()

@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: SessionDep):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
\`\`\`

Query style matters: **\`select(User).where(...)\` handed to
\`db.execute(...)\` / \`db.scalars(...)\` is 2.0**; \`db.session.query(User)\` is
the legacy 1.x API you'll see in old answers — recognise it, don't write it.
\`db.get(User, pk)\` is the by-primary-key shortcut (it even skips the query if
the object is already in the session's identity map). \`.scalars()\` unwraps
the result rows into model instances; forget it and you get \`Row\` tuples.

### Unit of work: nothing happens until commit

The mental shift from Eloquent: \`$user->save()\` fires an INSERT *right now*.
\`db.add(user)\` fires **nothing** — it registers the object with the session's
unit of work. The session accumulates pending inserts, updates (it detects
attribute changes on loaded objects automatically — no \`save\` call at all),
and deletes, then writes them all inside one transaction when you \`commit()\`.
\`rollback()\` throws the pending work away.

That's why the create endpoint ends with \`db.refresh(user)\`: the INSERT that
\`commit()\` fired gave the row its auto-increment id, and \`refresh\` re-reads
the row so \`user.id\` is populated before the response is serialised.

For updates, the pattern is load → mutate → commit:

\`\`\`python
user = db.get(User, user_id)
user.name = data.name      # tracked automatically
db.commit()                # UPDATE emitted here
\`\`\`

No \`db.add\` needed — the session already tracks the loaded object. Batching
into one transaction means multi-step operations are atomic by default: if
the handler raises before \`commit()\`, nothing was written.
`,

  comparisons: [
    {
      label: "Store endpoint: Eloquent vs Session CRUD",
      intro:
        "Create a user from a validated payload and return it with its new id. Compare where validation, persistence, and the response shape live.",
      php: `<?php
// app/Http/Controllers/UserController.php
class UserController extends Controller
{
    public function store(StoreUserRequest $request)
    {
        // save() fires the INSERT immediately;
        // $user->id is populated by Eloquent.
        $user = User::create($request->validated());

        return (new UserResource($user))
            ->response()
            ->setStatusCode(201);
    }
}`,
      ts: `# app/routers/users.py
from fastapi import APIRouter
from app.database import SessionDep
from app.models import User
from app.schemas import UserCreate, UserOut

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=UserOut,
             status_code=201)
def create_user(data: UserCreate, db: SessionDep):
    user = User(**data.model_dump())
    db.add(user)       # queued in the unit of work
    db.commit()        # INSERT happens here
    db.refresh(user)   # load DB-generated id back
    return user        # response_model shapes output`,
      note:
        "Same trio (validate, persist, shape response) — but Eloquent's create() writes immediately, while the Session queues the insert until commit(), and refresh() plays the role Eloquent handles implicitly of pulling back the generated id.",
    },
    {
      label: "Immediate save vs unit of work",
      intro:
        "Update two related rows. Eloquent issues SQL per save(); the Session batches everything into one transaction at commit.",
      php: `<?php
// Two separate statements, two implicit
// transactions - unless you remember to wrap:
$order->status = 'paid';
$order->save();              // UPDATE #1 fires now

$invoice->paid_at = now();
$invoice->save();            // UPDATE #2 fires now

// Crash between the two saves =
// inconsistent data, unless you used
// DB::transaction(function () { ... });`,
      ts: `# One transaction, atomic by default:
order = db.get(Order, order_id)
invoice = db.get(Invoice, order.invoice_id)

order.status = "paid"        # tracked, no SQL yet
invoice.paid_at = datetime.now(UTC)  # tracked too

db.commit()   # both UPDATEs in ONE transaction
# An exception before commit() -> nothing
# was written; db.rollback() discards it all.`,
      note:
        "The Session detects attribute changes on loaded objects (no save() call exists) and flushes all pending work inside one transaction at commit — atomicity is the default, not something you remember to add.",
    },
    {
      label: "Legacy query() vs 2.0 select()",
      intro:
        "Fetch a page of active users. The left side is the 1.x API all the old Stack Overflow answers use; the right is what you should write in 2.0.",
      php: `# LEGACY SQLAlchemy 1.x - read-only knowledge
users = (
    db.query(User)
      .filter(User.active == True)
      .offset(20)
      .limit(10)
      .all()
)

one = db.query(User).get(5)   # .get on Query:
# deprecated in 1.4+, emits warnings in 2.0`,
      ts: `# MODERN 2.0 - select() + execute/scalars
from sqlalchemy import select

stmt = (
    select(User)
    .where(User.active == True)
    .offset(20)
    .limit(10)
)
users = db.execute(stmt).scalars().all()
# or the shorthand:
users = db.scalars(stmt).all()

one = db.get(User, 5)   # by-PK lives on Session`,
      note:
        "2.0 unifies Core and ORM around select(): build a statement, execute it, call .scalars() to unwrap model instances (skip it and you get Row tuples). session.query() still runs but is the legacy API.",
      leftLang: "python",
      rightLang: "python",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A fake Session that makes the unit of work visceral: add() and delete() only queue intentions, and the dict standing in for the database is untouched until commit(). Predict the store's state at each of the four printed checkpoints.",
    code: `# Unit of work in miniature. THE point: add()/delete() write
# nothing - they queue work. Only commit() touches the store.
# (Eloquent's save() would have written immediately.)

class Session:
    def __init__(self, store):
        self.store = store          # our "database": a dict by pk
        self.new = []               # pending INSERTs
        self.deleted = []           # pending DELETEs
        self._next_id = max(store, default=0) + 1

    def add(self, obj):             # like db.add(user)
        self.new.append(obj)

    def delete(self, pk):           # like db.delete(user)
        self.deleted.append(pk)

    def get(self, pk):              # like db.get(User, pk)
        return self.store.get(pk)

    def commit(self):               # ALL queued work, "one txn"
        for obj in self.new:
            pk = self._next_id
            self.store[pk] = {"id": pk, **obj}  # refresh: id assigned
            self._next_id += 1
        for pk in self.deleted:
            self.store.pop(pk, None)
        self.new, self.deleted = [], []

    def rollback(self):             # discard pending work
        self.new, self.deleted = [], []


db_store = {1: {"id": 1, "name": "Ada"}}
session = Session(db_store)

# Queue an insert AND a delete - store must not change yet:
session.add({"name": "Linus"})
session.delete(1)
print("1 before commit:", db_store)

session.commit()
print("2 after commit: ", db_store)

# Queue more work, then change our mind:
session.add({"name": "Guido"})
session.delete(2)
session.rollback()
session.commit()                    # nothing left to do
print("3 after rollback:", db_store)

# Reads go through the session too:
print("4 get(2):", session.get(2), "| get(1):", session.get(1))`,
    output: `1 before commit: {1: {'id': 1, 'name': 'Ada'}}
2 after commit:  {2: {'id': 2, 'name': 'Linus'}}
3 after rollback: {2: {'id': 2, 'name': 'Linus'}}
4 get(2): {'id': 2, 'name': 'Linus'} | get(1): None`,
  },

  keyPoints: [
    "The wiring trio: `create_engine(...)`, `SessionLocal = sessionmaker(bind=engine)`, and a `get_db()` yield-dependency — open, `yield db`, `close()` in `finally` — for one session per request.",
    "Alias it once as `SessionDep = Annotated[Session, Depends(get_db)]` and every handler just declares `db: SessionDep`.",
    "CRUD verbs: `db.add` + `db.commit` + `db.refresh` (create), `db.get(User, pk)` (read by PK), `db.execute(select(User).offset().limit()).scalars().all()` (list), `db.delete` + `db.commit` (delete).",
    "Write 2.0 queries only: `select(...)` with `execute`/`scalars`. `session.query(...)` is the legacy 1.x API — recognise it in old code, don't produce it.",
    "Unit of work: `add()`/`delete()`/attribute changes are queued, not written. SQL runs at `commit()` (or `flush()`), inside one transaction — unlike Eloquent's `save()`, which fires immediately.",
    "Updates need no add or save: load with `db.get`, mutate attributes, `db.commit()` — the session tracks loaded objects automatically.",
  ],

  interview: [
    {
      q: "How do you manage database sessions in a FastAPI application?",
      a: "With a yield-dependency giving each request its own session: `get_db()` creates one from a `sessionmaker` factory, `yield`s it into the handler, and closes it in a `finally` block so cleanup happens even when the handler raises. I alias it as `SessionDep = Annotated[Session, Depends(get_db)]` so endpoints just declare `db: SessionDep`. The engine and its connection pool are process-wide singletons; only sessions are per-request — a session is cheap to create, and scoping it to the request gives you the same clean-slate-per-request guarantee PHP-FPM gives PHP, plus a natural transaction boundary. It also makes tests trivial: override `get_db` to yield a session bound to a test database.",
    },
    {
      q: "Explain the unit-of-work pattern and how it differs from what Eloquent does.",
      a: "Eloquent is Active Record: `$user->save()` issues its SQL immediately, so five saves are five statements — and atomicity across them requires remembering `DB::transaction()`. SQLAlchemy's Session is a unit of work: `db.add()` and `db.delete()` register intentions, and mutating attributes on loaded objects is tracked automatically — there's no save method at all. Nothing touches the database until `commit()` (or an explicit `flush()`), at which point all pending inserts, updates, and deletes execute inside one transaction; `rollback()` discards the lot. So multi-step operations are atomic by default, the session can batch and order statements efficiently, and an exception mid-handler means nothing was written. The practical corollary is `db.refresh(user)` after committing a create, to read back the database-generated primary key before serialising the response.",
    },
    {
      q: "What's the difference between session.query(User) and select(User) in SQLAlchemy?",
      a: "`session.query()` is the legacy 1.x ORM query API; `select()` is the 2.0 style that unified Core and ORM around one statement-building syntax. In 2.0 I build a statement — `select(User).where(User.active == True).offset(20).limit(10)` — and run it with `db.execute(stmt).scalars().all()` or the `db.scalars(stmt)` shorthand; `.scalars()` is what unwraps the result rows into model instances instead of Row tuples. By-primary-key lookup moved to `db.get(User, pk)`, which also checks the session's identity map before querying. `session.query()` still functions for backwards compatibility, so I read it fluently in older codebases, but new code should be select-based — it's the maintained, fully typed path.",
    },
    {
      q: "Walk me through your create endpoint — why add, commit, AND refresh?",
      a: "Three distinct steps because of the unit of work. `db.add(user)` only registers the new object with the session — no SQL yet. `db.commit()` flushes the pending work, so the INSERT runs there, inside a transaction, and the database assigns the auto-increment primary key. `db.refresh(user)` then re-reads the row so the in-memory object carries that generated `id` (and any server-side defaults) before FastAPI serialises it through the `response_model`. Skip refresh and, depending on expiration settings and what the driver returned, you risk responding without the very id the client needs to reference the resource.",
    },
  ],

  quiz: [
    {
      question:
        "In the get_db yield-dependency, why does db.close() live in a finally block?",
      options: [
        "finally makes the close run asynchronously for speed",
        "So the session closes even when the handler raises an exception",
        "Python requires finally after every yield",
        "To commit any pending changes automatically",
      ],
      answerIndex: 1,
      explain:
        "The code after yield is the teardown; wrapping it in try/finally guarantees the session is closed whether the handler returned normally or raised. Without it, exceptions would leak sessions (and their pooled connections). Note close() doesn't commit — uncommitted work is discarded.",
    },
    {
      question: "What SQL does db.add(user) execute?",
      options: [
        "An INSERT, immediately",
        "An INSERT inside a savepoint",
        "None — it registers the object; SQL runs at flush/commit",
        "A SELECT to check for duplicates first",
      ],
      answerIndex: 2,
      explain:
        "add() just puts the object into the session's unit of work. The INSERT executes when the session flushes — normally triggered by commit(). That's the core difference from Eloquent's save(), which writes immediately.",
    },
    {
      question:
        "Which is the correct SQLAlchemy 2.0 way to fetch a page of users?",
      options: [
        "db.query(User).offset(20).limit(10).all()",
        "db.execute(select(User).offset(20).limit(10)).scalars().all()",
        "User.paginate(page=3, per_page=10)",
        "db.fetch(User, offset=20, limit=10)",
      ],
      answerIndex: 1,
      explain:
        "2.0 style builds a select() statement and executes it on the session; .scalars() unwraps Row tuples into User instances. Option A is the legacy 1.x Query API; C is Eloquent-style Active Record thinking, which SQLAlchemy doesn't do.",
    },
    {
      question:
        "After db.add(user); db.commit(), why call db.refresh(user) before returning it?",
      options: [
        "To release the row lock the INSERT acquired",
        "To re-read the row so DB-generated values like the auto-increment id are on the object",
        "refresh() is what actually writes the row",
        "To convert the model into a Pydantic schema",
      ],
      answerIndex: 1,
      explain:
        "The database assigns the primary key (and any server defaults) during the INSERT at commit time. refresh() SELECTs the row back so user.id is populated on the in-memory object before the response is serialised.",
    },
  ],
};

export default lesson;
