import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-and-interview",
  title: "Cheatsheet & Interview Playbook",
  part: "Production & Shipping",
  estMinutes: 14,
  summary:
    "The whole course on one page — the anatomy of a route, the version table that dates any codebase on sight, and crisp model answers to the questions a FastAPI hiring panel actually asks.",

  concept: `
Thirty sections compress into one route, one table, and ten answers. If you
can reproduce these from memory — and say *why* each line is what it is —
you can defend every topic in this course in front of a panel.

### The anatomy of a route (the whole framework in one signature)

\`\`\`python
@router.post(                          # APIRouter ≈ a Laravel route group
    "/orders",
    response_model=OrderOut,           # filter output to this schema
    status_code=status.HTTP_201_CREATED,
)
async def create_order(               # async def: runs on the event loop
    payload: OrderCreate,             # Pydantic model = body, validated
    db: Annotated[Session, Depends(get_db)],       # DI, yield = cleanup
    user: Annotated[User, Depends(get_current_user)],  # auth chain
    background_tasks: BackgroundTasks,             # respond now, work after
):
    order = create(db, payload, owner=user)
    background_tasks.add_task(send_receipt, user.email, order.id)
    return order                      # ORM object -> OrderOut via from_attributes
\`\`\`

Every argument is doing framework work, declared as a type. That's the
elevator line: **FastAPI turns the function signature into the routing,
validation, auth, documentation, and serialisation layers.**

### The version-awareness table

Reciting this dates any codebase — and any interviewer — on sight:

| Legacy (you'll see it) | Current (you write it) |
| --- | --- |
| \`.dict()\` / \`.json()\` / \`parse_obj()\` | \`model_dump()\` / \`model_dump_json()\` / \`model_validate()\` |
| \`class Config: orm_mode = True\` | \`model_config = ConfigDict(from_attributes=True)\` |
| \`@validator\` / \`@root_validator\` | \`@field_validator\` / \`@model_validator\` |
| \`from pydantic import BaseSettings\` | \`from pydantic_settings import BaseSettings\` |
| \`db: Session = Depends(get_db)\` | \`db: Annotated[Session, Depends(get_db)]\` (default since 0.95) |
| \`@app.on_event("startup")\` | \`lifespan\` async context manager |
| \`declarative_base()\`, \`session.query(User)\` | \`class Base(DeclarativeBase)\`, \`session.scalars(select(User))\` |
| \`Column(String, nullable=True)\` | \`Mapped[str \\| None] = mapped_column()\` |

(And say "current FastAPI" or "FastAPI 0.1xx" — the framework is still
pre-1.0; the 0.12x releases are current.)

### The interview playbook

The questions this course armed you for, one line each — expand any of them
on demand:

1. **async def vs def?** async runs on the event loop and must never block;
   def is pushed to a threadpool. Blocking inside async def stalls everyone.
2. **Depends vs middleware?** Middleware: every request, no route context.
   Depends: per-route, typed values, in OpenAPI, overridable in tests.
3. **401 vs 403?** 401 = not authenticated (send \`WWW-Authenticate\`);
   403 = authenticated but not allowed.
4. **Why is response_model a security feature?** Output is *filtered* to the
   declared schema — \`hashed_password\` on the ORM object never leaves.
5. **Active Record vs Data Mapper?** Eloquent models save themselves;
   SQLAlchemy maps plain classes and a Session flushes units of work.
6. **Celery or BackgroundTasks?** add_task = in-process, loseable,
   post-response. Retries/scheduling/CPU → a real broker-backed queue.
7. **Where do secrets live?** \`pydantic-settings\` \`BaseSettings\` reading
   env vars — validated at startup, injected via Depends, overridable in tests.
8. **How do you test auth?** \`TestClient\` + \`app.dependency_overrides[get_current_user]\`
   — no forged tokens; the JWT machinery gets its own tests.
9. **Pydantic v1 or v2 codebase?** Spot \`.dict()\`, \`class Config\`,
   \`@validator\` → v1. Know the renames; offer to migrate.
10. **Why FastAPI over Flask/Django for APIs?** Types drive validation,
    serialisation *and* docs from one declaration; async-native; the
    OpenAPI schema is a free, never-stale contract.

### The PHP dev's elevator pitch

Don't apologise for the PHP years — spend them: *"I've run production HTTP
APIs for 25 years — routing, validation, auth, queues, FPM pools — so
nothing in FastAPI is conceptually new to me. Depends is the DI container,
Pydantic is FormRequest plus the DTO, uvicorn workers are the FPM pool with
an event loop inside, TestClient is a feature test. What FastAPI adds is
that the type system does the wiring I used to do by convention — and I've
retrained specifically on the current idioms: Pydantic v2, SQLAlchemy 2.0,
Annotated dependencies, lifespan."*
`,

  comparisons: [
    {
      label: "The whole course in one endpoint",
      intro:
        "A create-order endpoint with everything switched on: validation, DI, auth, status codes, output filtering, background work. Reading right-to-left across your own PHP muscle memory is the final exam.",
      php: `<?php
// app/Http/Controllers/OrderController.php (Laravel)
class OrderController extends Controller
{
    public function store(
        StoreOrderRequest $request,   // FormRequest: validate + authorize
        OrderService $service         // container-injected
    ): JsonResponse {
        $order = $service->create(
            $request->validated(),
            $request->user()          // auth middleware upstream
        );

        SendReceipt::dispatch($order); // queued job

        return (new OrderResource($order))   // output shaping
            ->response()
            ->setStatusCode(201);
    }
}`,
      ts: `# app/routers/orders.py (FastAPI — one signature does all of it)
@router.post(
    "/orders",
    response_model=OrderOut,          # OrderResource
    status_code=status.HTTP_201_CREATED,
)
async def create_order(
    payload: OrderCreate,             # StoreOrderRequest (validate)
    db: SessionDep,                   # container injection
    user: CurrentUser,                # auth middleware + $request->user()
    background_tasks: BackgroundTasks,
):
    order = create_order_record(db, payload, owner=user)
    background_tasks.add_task(send_receipt, user.email, order.id)
    return order   # ORM obj -> OrderOut via from_attributes; extras filtered`,
      note:
        "Every Laravel concept maps to a typed parameter or decorator argument — and the FastAPI version also generated its own OpenAPI docs. SessionDep/CurrentUser are Annotated aliases: reusable, self-documenting dependency types.",
    },
    {
      label: "Date this codebase: legacy vs current",
      intro:
        "Two versions of the same model + endpoint. Spotting which is which — and naming every rename — is a one-question seniority test.",
      php: `# You open a repo and see this — date it:
from pydantic import BaseModel, validator
from sqlalchemy.orm import declarative_base

Base = declarative_base()                 # SQLAlchemy 1.x style

class UserOut(BaseModel):
    id: int
    email: str

    class Config:                         # Pydantic v1
        orm_mode = True

    @validator("email")                   # v1 decorator
    def check(cls, v): ...

@app.on_event("startup")                  # deprecated lifecycle
async def boot(): ...

user = session.query(User).get(1)         # 1.x query API
return UserOut.from_orm(user).dict()      # v1 methods`,
      ts: `# The same code, written today:
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase): ...          # SQLAlchemy 2.0 style

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # v2
    id: int
    email: str

    @field_validator("email")             # v2 decorator
    @classmethod
    def check(cls, v): ...

@asynccontextmanager
async def lifespan(app: FastAPI):         # modern lifecycle
    yield

user = session.get(User, 1)               # 2.0 API
return UserOut.model_validate(user).model_dump()  # v2 methods`,
      note:
        "Left column: Pydantic v1 + SQLAlchemy 1.x + deprecated on_event — a pre-2023 codebase. Being able to modernise it (and knowing from_orm -> model_validate needs from_attributes=True) is exactly the maintenance work teams hire for.",
      leftLang: "python",
      rightLang: "python",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Rapid-fire revision: six flashcards from the playbook, each self-checked against the keywords a strong answer must contain. Cover the answers, say yours out loud, then run to compare.",
    code: `# Rapid-fire flashcards: the course's interview answers, self-checked.
# Each model answer must mention its load-bearing keywords.

cards = [
    ("async def vs def endpoint?",
     "async def runs on the event loop and must never block; def runs in a threadpool",
     ["event loop", "threadpool"]),
    ("Depends vs middleware?",
     "middleware wraps every request with no route context; Depends gives per-route typed values",
     ["every request", "per-route"]),
    ("401 vs 403?",
     "401 means not authenticated (bring credentials); 403 means authenticated but not allowed",
     ["not authenticated", "not allowed"]),
    ("Why is response_model a security feature?",
     "it filters the output to the declared schema, so extra fields like hashed_password never leak",
     ["filters", "never leak"]),
    ("When Celery over BackgroundTasks?",
     "BackgroundTasks is in-process with no retries; use Celery for retries, scheduling, heavy CPU work",
     ["in-process", "retries"]),
    ("How do you date a codebase as Pydantic v1?",
     "it uses .dict(), class Config, orm_mode and @validator instead of model_dump and ConfigDict",
     ["class Config", "model_dump"]),
]

score = 0
for i, (question, answer, keywords) in enumerate(cards, 1):
    hit = all(kw in answer for kw in keywords)
    if hit:
        score += 1
    print(f"Q{i}: {question}")
    print(f"    {answer}")
    print(f"    {'OK' if hit else 'MISSING'}: {', '.join(keywords)}")

print(f"score: {score}/{len(cards)} — say each answer out loud before flipping")`,
    output: `Q1: async def vs def endpoint?
    async def runs on the event loop and must never block; def runs in a threadpool
    OK: event loop, threadpool
Q2: Depends vs middleware?
    middleware wraps every request with no route context; Depends gives per-route typed values
    OK: every request, per-route
Q3: 401 vs 403?
    401 means not authenticated (bring credentials); 403 means authenticated but not allowed
    OK: not authenticated, not allowed
Q4: Why is response_model a security feature?
    it filters the output to the declared schema, so extra fields like hashed_password never leak
    OK: filters, never leak
Q5: When Celery over BackgroundTasks?
    BackgroundTasks is in-process with no retries; use Celery for retries, scheduling, heavy CPU work
    OK: in-process, retries
Q6: How do you date a codebase as Pydantic v1?
    it uses .dict(), class Config, orm_mode and @validator instead of model_dump and ConfigDict
    OK: class Config, model_dump
score: 6/6 — say each answer out loud before flipping`,
  },

  keyPoints: [
    "The route signature IS the framework: decorator (path, `response_model`, `status_code`) + typed parameters (Pydantic body, `Annotated[..., Depends(...)]` chain, `BackgroundTasks`) = routing, validation, auth, docs, and serialisation from one declaration.",
    "Version table, Pydantic: `.dict()`→`model_dump()`, `parse_obj()`→`model_validate()`, `class Config`/`orm_mode`→`ConfigDict(from_attributes=True)`, `@validator`→`@field_validator`; `BaseSettings` moved to `pydantic-settings`.",
    "Version table, the rest: `= Depends(...)` default-value style → `Annotated` (default since 0.95); `on_event`→`lifespan`; `declarative_base()`/`session.query()`→`DeclarativeBase`/`session.scalars(select(...))` with `Mapped`/`mapped_column`.",
    "FastAPI is pre-1.0 — say 'current FastAPI' or 'FastAPI 0.1xx', never 'FastAPI 1.x'; naming the 0.12x line accurately is itself a credibility signal.",
    "The playbook's spine: async def vs def (event loop vs threadpool), Depends vs middleware (typed per-route vs route-blind global), 401 vs 403, response_model as output filter, Celery when you need retries/scheduling, dependency_overrides for testing auth.",
    "The elevator pitch: 25 years of routing/validation/auth/queues/FPM transfer one-to-one — FastAPI just makes the type system do the wiring; you've retrained on the current idioms (Pydantic v2, SQLAlchemy 2.0, Annotated, lifespan).",
  ],

  interview: [
    {
      q: "You're a career PHP developer — why should we trust you with our Python API?",
      a: "Because the hard parts of this job aren't language syntax — they're HTTP, data modelling, auth, failure modes, and operations, and I've run those in production for 25 years. Every FastAPI concept mapped onto something I've operated: Depends is the DI container resolving constructor arguments, Pydantic is FormRequest validation and the DTO in one class, APIRouter is a route group, middleware is PSR-15, uvicorn workers are a PHP-FPM pool — one process per core, except each worker multiplexes thousands of requests on an event loop. Where Python genuinely differs — the GIL, async/await discipline, long-lived processes needing lifespan cleanup — I've studied that deliberately rather than assuming. And I've learned the *current* stack: Pydantic v2, SQLAlchemy 2.0, Annotated dependencies — I can also read a v1-era codebase and migrate it, which is half the real work out there.",
    },
    {
      q: "Rapid fire: async def vs def — when do you use which, and what's the failure mode of getting it wrong?",
      a: "async def handlers run on the event loop: perfect when everything they await is async — httpx calls, async DB drivers. def handlers are run in a threadpool, so blocking code inside them is safe. The failure mode is blocking inside async def — a synchronous requests.get() or a sync SQLAlchemy session call there doesn't just slow that request, it freezes the entire event loop, so every concurrent request on that worker stalls. So my rule: async def only when the whole call chain is non-blocking; if I'm stuck with sync libraries, plain def and let the threadpool absorb it. It's the one place FastAPI gives you PHP-FPM's forgiveness back — at the cost of thread overhead.",
    },
    {
      q: "How would you explain what response_model does, and why you'd call it a security feature?",
      a: "response_model declares the output schema on the decorator, and FastAPI *filters* the returned object through it — only declared fields are serialised. That means I can return a SQLAlchemy User straight from the handler, and if UserOut doesn't declare hashed_password, it never leaves the process — even after someone adds a new sensitive column next year. In PHP I did this with API Resources or hand-built DTOs, and the failure mode was forgetting: `return response()->json($user)` leaks whatever the model holds. Here the filter is declarative, enforced on every response, and doubles as the documented schema in OpenAPI — the docs and the actual output physically cannot disagree.",
    },
    {
      q: "A prospective employer shows you a FastAPI file using @validator, class Config with orm_mode, and session.query(). What do you tell them?",
      a: "That it's a Pydantic v1 + SQLAlchemy 1.x-style codebase, roughly pre-2023, and it still runs — but it's accumulating deprecation debt. I'd name the migration precisely: @validator becomes @field_validator (plus @classmethod), class Config becomes model_config = ConfigDict(...), orm_mode is now from_attributes, .dict()/.json() become model_dump()/model_dump_json(), from_orm() becomes model_validate(). On the SQLAlchemy side, declarative_base() gives way to a DeclarativeBase class with Mapped[] annotations, and session.query(User) to session.scalars(select(User)) — the 2.0 style, which also plays properly with type checkers. If they use @app.on_event, that folds into a lifespan context manager. It's mechanical work, well-suited to incremental migration, and I'd sequence Pydantic first since v1 is where deprecations bite hardest.",
    },
  ],

  quiz: [
    {
      question:
        "Which set of methods marks a codebase as Pydantic v2 rather than v1?",
      options: [
        ".dict(), .json(), parse_obj(), from_orm()",
        "model_dump(), model_validate(), ConfigDict(from_attributes=True), @field_validator",
        "to_array(), fromArray(), Config::orm(), @validate",
        "serialize(), deserialize(), @root_validator, BaseSettings from pydantic",
      ],
      answerIndex: 1,
      explain:
        "The v2 renames are the model_* family plus ConfigDict and @field_validator/@model_validator. Option A is the v1 vocabulary — recognising both directions is what lets you date and migrate a codebase.",
    },
    {
      question:
        "In the anatomy of a route, which piece guarantees that a sensitive ORM column added next year can't leak from an existing endpoint?",
      options: [
        "The async def keyword",
        "The Depends chain",
        "response_model — output is filtered to the declared schema's fields",
        "status_code=201",
      ],
      answerIndex: 2,
      explain:
        "response_model is an allow-list on the way out: only fields declared on the schema are serialised, regardless of what the returned object carries. That future-proofing is why it's framed as a security feature, not just documentation.",
    },
    {
      question: "Which claim about FastAPI's versioning is correct in an interview today?",
      options: [
        "FastAPI 1.0 introduced the Annotated dependency style",
        "FastAPI is still pre-1.0; current releases are in the 0.12x line, and Annotated has been the documented default style since 0.95",
        "FastAPI 2.0 removed Depends in favour of middleware",
        "Versions below 1.0 mean the framework is not production-ready",
      ],
      answerIndex: 1,
      explain:
        "FastAPI has stayed pre-1.0 while being thoroughly production-proven; the 0.12x releases are current and Annotated dependencies became the documented default in 0.95.0. Claiming 'FastAPI 1.x' experience is a red flag interviewers notice.",
    },
    {
      question:
        "The strongest one-line framing of FastAPI for someone who knows Laravel is:",
      options: [
        "It's Flask with decorators",
        "It's Django without the ORM",
        "The function signature does the wiring: types drive routing, validation, DI, docs, and serialisation from one declaration",
        "It's Node.js for Python developers",
      ],
      answerIndex: 2,
      explain:
        "That's the thread tying the whole course together: FormRequest, the DI container, API Resources, and swagger-php annotations all collapse into typed parameters and decorator arguments — one declaration, five layers of behaviour.",
    },
  ],
};

export default lesson;
