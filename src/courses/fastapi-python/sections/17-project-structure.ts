import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "project-structure",
  title: "Project Structure That Scales",
  part: "Dependencies & Architecture",
  estMinutes: 10,
  summary:
    "FastAPI doesn't impose a layout, so employers ask you for one: the docs' file-type structure for small apps, a domain structure for big ones, with schemas, models, and services kept one-directional to avoid circular imports.",

  concept: `
FastAPI is deliberately unopinionated about layout — there's no \`artisan make:controller\`
scaffolding a blessed tree for you. That makes "how do you structure a FastAPI
project?" one of the most common interview questions, because the answer
reveals whether you've built anything bigger than a tutorial.

### The docs' layout: grouped by file type

The official "Bigger Applications" tutorial uses a single package with one
directory per *kind* of thing:

\`\`\`text
app/
├── __init__.py          # makes "app" a package
├── main.py              # FastAPI() + include_router calls
├── dependencies.py      # shared Depends() functions
├── routers/
│   ├── __init__.py
│   ├── users.py         # APIRouter for /users
│   └── items.py
└── internal/
    └── admin.py
\`\`\`

This works well up to a dozen routers. In PHP terms: \`routers/\` is your
\`Http/Controllers/\`, \`dependencies.py\` plays the role of service providers
plus shared middleware.

### The domain layout: grouped by feature

Larger codebases usually flip the axis — one package per domain, each with
the same internal files:

\`\`\`text
app/
├── main.py
├── users/
│   ├── router.py        # path operations
│   ├── schemas.py       # Pydantic models (wire formats)
│   ├── models.py        # SQLAlchemy models (DB tables)
│   └── service.py       # business logic / CRUD
└── items/
    └── ...same shape...
\`\`\`

Everything about users lives in one folder — the modular-monolith idea you may
know from Laravel modules or Symfony bundles.

### Schemas vs models vs services

The naming trips people up, so fix it now:

- **schemas.py** — Pydantic classes: what crosses the wire. Validation in,
  serialisation out. ≈ FormRequest + API Resource in one.
- **models.py** — SQLAlchemy classes: what lives in the database. ≈ Eloquent
  models, minus the querying (that's the session's job).
- **service.py** — plain functions/classes holding business logic, called by
  the router. ≈ your service classes; keeps routers thin like thin controllers.

### Imports: packages and one-directional layers

A directory becomes a package by carrying an \`__init__.py\` file (even
empty); since Python 3.3 a directory without one still imports as an implicit
*namespace package*, but real projects mark theirs. Python favours
**absolute imports**:
\`from app.routers import users\`, not fragile relative dot-hopping. There is
no PSR-4 autoloader — the package tree *is* the namespace.

The classic failure is the **circular import**: \`schemas.py\` imports
\`models.py\` for a converter, \`models.py\` imports \`schemas.py\` for a type
hint, and Python dies at import time with a half-initialised module. The fix
is a rule, not a trick: dependencies point **one way**.

\`\`\`text
router → service → models
   └────→ schemas      (schemas import nothing of yours)
\`\`\`

Schemas sit at the bottom and import nothing from your app; models know
nothing about schemas; services import both; routers import services and
schemas. If two modules genuinely need each other, that's a sign a third
module wants to exist.
`,

  comparisons: [
    {
      label: "Framework-imposed vs chosen structure",
      intro:
        "Laravel ships a fixed tree and artisan generators fill it in. FastAPI gives you main.py and a blank page — the docs' layout is convention, not enforcement.",
      php: `# Laravel: the framework decides
app/
├── Http/
│   ├── Controllers/UserController.php
│   ├── Requests/StoreUserRequest.php
│   └── Resources/UserResource.php
├── Models/User.php
├── Services/UserService.php
└── Providers/AppServiceProvider.php
routes/
└── api.php

# php artisan make:controller UserController`,
      ts: `# FastAPI: you decide (docs' recommendation)
app/
├── __init__.py
├── main.py            # app = FastAPI(); include_router(...)
├── dependencies.py    # shared Depends() functions
├── routers/
│   ├── __init__.py
│   ├── users.py       # router + handlers together
│   └── items.py
└── internal/
    └── admin.py

# no generator - you create files by hand`,
      note:
        "Same roles, different enforcement: Laravel's structure is scaffolded and assumed by the framework; FastAPI's is a documented convention you must apply (and defend in interviews) yourself.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Three PHP classes, three Python files",
      intro:
        "Handling 'create a user' touches validation, persistence, and output shaping. Map where each concern lives on both sides.",
      php: `<?php
// app/Http/Requests/StoreUserRequest.php  (validation in)
class StoreUserRequest extends FormRequest {
    public function rules(): array {
        return ['email' => 'required|email',
                'name'  => 'required|min:2'];
    }
}

// app/Models/User.php                     (DB row)
class User extends Model {
    protected $fillable = ['email', 'name'];
}

// app/Http/Resources/UserResource.php     (output shape)
class UserResource extends JsonResource {
    public function toArray($request): array {
        return ['id' => $this->id, 'name' => $this->name];
    }
}`,
      ts: `# app/users/schemas.py - wire formats (in AND out)
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2)

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str

# app/users/models.py - the DB table
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str]
    name: Mapped[str]`,
      note:
        "FormRequest and Resource collapse into one schemas.py (Pydantic does both directions); the SQLAlchemy model stays persistence-only because querying belongs to the session, not the model.",
    },
    {
      label: "PSR-4 autoloading vs Python packages",
      intro:
        "How a class/module in one file becomes usable in another. PHP maps namespaces to paths via composer; Python's directory tree IS the namespace.",
      php: `<?php
// composer.json
// "autoload": { "psr-4": { "App\\\\": "app/" } }

// Any file, anywhere:
use App\\Services\\UserService;
use App\\Models\\User;

// composer dump-autoload wires it up;
// no per-directory marker files needed.
$service = new UserService();`,
      ts: `# Mark every package directory with __init__.py (even empty):
#   app/__init__.py
#   app/users/__init__.py

# app/users/router.py - absolute imports from the package root
from app.users import schemas, service
from app.users.models import User

# Run from the project root so "app" is importable:
#   uvicorn app.main:app --reload
# Relative form (works, but easy to break when files move):
#   from . import schemas`,
      note:
        "No autoloader and no dump-autoload step: the package tree is the namespace, __init__.py marks packages, and absolute imports (from app.users import ...) survive refactors better than relative dots.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Read the tree of the domain layout and match each file to its role before revealing the annotated output. This section is about shape, not execution — make sure you could reproduce this tree on a whiteboard.",
    code: `# From the project root of a domain-structured FastAPI app:
tree app

# Before you reveal: name the role of each file.
#  - which files hold Pydantic classes?
#  - which hold SQLAlchemy classes?
#  - which layer is allowed to import which?`,
    output: `app
├── __init__.py          # marks "app" as a package
├── main.py              # FastAPI(); includes every domain router
├── database.py          # engine, SessionLocal, Base
├── dependencies.py      # shared Depends(): get_db, get_current_user
├── settings.py          # pydantic-settings Settings class
├── users
│   ├── __init__.py
│   ├── router.py        # APIRouter -> calls service, returns schemas
│   ├── schemas.py       # Pydantic: UserCreate in, UserOut out
│   ├── models.py        # SQLAlchemy: the users table
│   └── service.py       # business logic: create_user, get_users
└── items
    ├── __init__.py
    ├── router.py
    ├── schemas.py
    ├── models.py
    └── service.py

# Import direction (one way, never back):
# router -> service -> models
# router -> schemas (schemas import nothing from app)`,
  },

  keyPoints: [
    "FastAPI imposes no layout — knowing and defending one is on you, and interviewers ask precisely because the framework doesn't answer it.",
    "Docs' layout for small apps: `app/main.py` + `app/routers/` + `app/dependencies.py`, everything grouped by file type.",
    "Domain layout for bigger apps: `app/users/{router,schemas,models,service}.py` — every feature is self-contained, like a modular monolith.",
    "Vocabulary matters: **schemas** = Pydantic (wire), **models** = SQLAlchemy (database), **service** = business logic. ≈ FormRequest+Resource, Eloquent model, service class.",
    "Python packaging: mark each package directory with `__init__.py` (a directory without one still imports as a PEP 420 namespace package, but real projects mark theirs), prefer absolute imports (`from app.users import schemas`), and run uvicorn from the project root.",
    "Kill circular imports with one-directional layers: router → service → models, schemas at the bottom importing nothing of yours.",
  ],

  interview: [
    {
      q: "How do you structure a production FastAPI project?",
      a: "For a small service I follow the official docs: a single `app` package with `main.py` creating the app and including routers, a `routers/` directory with one `APIRouter` module per resource, and `dependencies.py` for shared dependencies. Once the app grows, I switch to a domain layout: `app/users/`, `app/items/`, each containing `router.py`, `schemas.py` for Pydantic wire models, `models.py` for SQLAlchemy tables, and `service.py` for business logic, so a feature lives in one folder. The key discipline either way is one-directional imports — routers call services, services use models, schemas import nothing from the app — which keeps the layers testable and prevents circular imports.",
    },
    {
      q: "What's the difference between schemas.py and models.py, and why keep both?",
      a: "`schemas.py` holds Pydantic classes — the API contract: what requests must look like and what responses will look like. `models.py` holds SQLAlchemy classes — the database tables. They often look similar but serve different masters: the schema omits `hashed_password` from responses and can rename or reshape fields for clients, while the model tracks persistence concerns like indexes and relationships. In Laravel terms, schemas are FormRequest plus API Resource in one class, and models are Eloquent models. Collapsing them into one class couples your public API to your table structure, so a column rename becomes a breaking API change.",
    },
    {
      q: "You hit an ImportError: 'cannot import name X from partially initialized module'. What happened and how do you fix it?",
      a: "That's a circular import: module A imports B while B is still importing A, so one of them is only half-initialised when the lookup happens. Typically it's schemas importing models for a converter while models imports schemas for a type hint. The real fix is architectural, not mechanical: make the dependency graph one-directional — schemas at the bottom importing nothing from the app, models above them, services importing both, routers on top. If two modules genuinely need each other's names, I extract the shared piece into a third module they both import. Tricks like function-level imports or `TYPE_CHECKING` guards work, but I treat them as a smell that the layering is wrong.",
    },
  ],

  quiz: [
    {
      question:
        "In the conventional FastAPI domain layout, which file contains the Pydantic classes?",
      options: ["models.py", "schemas.py", "router.py", "service.py"],
      answerIndex: 1,
      explain:
        "By convention schemas.py holds Pydantic models (the wire formats — request bodies in, responses out), while models.py holds SQLAlchemy table classes. Mixing the vocabulary up in an interview signals tutorial-level experience.",
    },
    {
      question:
        "Why does the recommended structure keep imports one-directional (router → service → models, schemas at the bottom)?",
      options: [
        "Python forbids two modules importing each other under any circumstances",
        "It prevents circular imports that fail at import time with partially initialised modules",
        "It's required for uvicorn's --reload flag to work",
        "One-directional imports make requests measurably faster",
      ],
      answerIndex: 1,
      explain:
        "Python executes modules top-to-bottom on first import; if A imports B while B is importing A, one side sees a half-initialised module and crashes. A one-way layering rule makes that impossible by construction. (Mutual imports can sometimes work depending on timing — which is exactly why they're a trap.)",
    },
    {
      question:
        "What role does __init__.py play in a FastAPI project like app/routers/?",
      options: [
        "It runs automatically on every request, like Laravel's bootstrap",
        "It marks the directory as an importable Python package",
        "It replaces composer.json for dependency management",
        "It's where you must register every router",
      ],
      answerIndex: 1,
      explain:
        "An __init__.py file (even empty) makes the directory a package so `from app.routers import users` resolves. Python has no PSR-4 autoloader mapping namespaces to paths — the directory tree itself is the namespace.",
    },
  ],
};

export default lesson;
