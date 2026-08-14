import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "project-structure",
  title: "Structuring a Node Backend",
  part: "Scaling & Shipping",
  estMinutes: 11,
  summary:
    "Routes → services → repositories: the same Controller/Service/Repository layering you know from Laravel, wired with module imports instead of a DI container.",

  concept: `
Every tutorial Node app is one \`index.ts\` with routes, queries, and business
logic interleaved. Nobody hires for that. The good news: the layout that reads
as "professional Node" is the **same layering you already know** from Laravel
and Symfony — Controller / Service / Repository. Only the wiring differs.

### The three layers, translated

- **Routes** (≈ controllers): HTTP in, HTTP out. Parse and validate the
  request, call a service, pick a status code. Nothing else.
- **Services**: business logic. Framework-free — no \`express\` import, no
  \`req\`/\`res\` anywhere. A service takes plain typed values and returns
  plain typed values.
- **Repositories** (data access): the only layer that writes SQL and the only
  layer allowed to touch the \`pg\` Pool.

The dependency rule is one-directional: routes → services → repositories.
A service importing from \`routes/\` is the same smell as a Laravel Model
calling a Controller.

### A concrete tree

\`\`\`
src/
├── server.ts        # entry: listen() + graceful shutdown
├── app.ts           # builds & EXPORTS the Express app — no listen()
├── db.ts            # pg Pool singleton
├── routes/          # users.routes.ts — Router wiring
├── schemas/         # users.schema.ts — zod schemas + z.infer types
├── services/        # users.service.ts — framework-free logic
├── repositories/    # users.repo.ts — SQL lives here
└── middleware/      # auth, request logging, error handler
\`\`\`

The **app/server split** matters more than it looks: \`app.ts\` builds and
exports the Express app without calling \`listen()\`; \`server.ts\` imports it,
listens, and owns shutdown. Tests then import the app and drive it with
supertest, which starts it on an ephemeral port of its own — no port to pick,
no boot script. This one habit pays for itself the first time you write an
integration test.

**Zod schemas get their own home** (\`schemas/\` or next to the route) because
two layers need them: routes validate with \`schema.parse()\`, and services
type their parameters with \`z.infer<typeof schema>\`. One definition, both
jobs — the schema is the shared contract.

### Where did the DI container go?

Mostly: it's the \`import\` statement. ESM modules are evaluated once and
cached, so \`export const pool = new Pool()\` in \`db.ts\` is a singleton —
every importer gets the same instance. That's what Laravel's
\`singleton()\` binding did, minus the config file. Reach for constructor
injection (a \`makeUserService(repo)\` factory) only where testing demands
swapping the dependency — usually services that need a fake repository.
Full DI frameworks (NestJS's container, tsyringe) exist, but plain Express
codebases overwhelmingly wire by import.

### One footgun: barrel files

A "barrel" is an \`index.ts\` that re-exports a folder's modules. Convenient,
but it's the classic source of **circular imports**: \`a.ts\` imports from the
barrel, the barrel imports \`b.ts\`, \`b.ts\` imports \`a.ts\` — and one of them
sees a half-initialized module (\`undefined\` where a function should be).
Prefer direct file imports between siblings; if you keep barrels, keep them
for consumers *outside* the folder, never within it.
`,

  comparisons: [
    {
      label: "Laravel app/ tree vs Node src/ tree",
      intro:
        "The same application, laid out in each ecosystem's conventional shape. Match the layers: every Laravel directory has a direct counterpart.",
      php: `app/                              # Laravel
├── Http/
│   ├── Controllers/
│   │   └── UserController.php    # HTTP in/out
│   └── Requests/
│       └── StoreUserRequest.php  # validation rules
├── Services/
│   └── UserService.php           # business logic
├── Repositories/
│   └── UserRepository.php        # DB queries
└── Providers/
    └── AppServiceProvider.php    # DI container bindings
routes/
└── api.php                       # route definitions
bootstrap/ + public/index.php     # entry, rebuilt every request`,
      ts: `src/                              # Node + TS
├── server.ts                     # entry: listen + shutdown (boots ONCE)
├── app.ts                        # express app, exported for tests
├── routes/
│   └── users.routes.ts           # Router: HTTP in/out
├── schemas/
│   └── users.schema.ts           # zod: validation + inferred types
├── services/
│   └── users.service.ts          # business logic, framework-free
├── repositories/
│   └── users.repo.ts             # pg queries
├── middleware/
│   └── auth.ts
└── db.ts                         # pg Pool singleton ("container binding")`,
      note: "Same layers, two differences: module singletons replace most AppServiceProvider bindings, and the entry file boots once for the process's lifetime instead of once per request.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Controller + service pair",
      intro:
        "Creating a user: a thin HTTP layer delegating to framework-free business logic. Note who resolves the service in each version.",
      php: `<?php // app/Http/Controllers/UserController.php
class UserController extends Controller
{
    // the container injects the service (binding in a provider)
    public function __construct(private UserService $users) {}

    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = $this->users->register($request->validated());
        return response()->json($user, 201);
    }
}

// app/Services/UserService.php
class UserService
{
    public function __construct(private UserRepository $repo) {}

    public function register(array $data): User
    {
        // business rules here — no Request/Response in sight
        return $this->repo->create($data);
    }
}`,
      ts: `// src/routes/users.routes.ts — thin: HTTP concerns only
import { Router } from "express";
import { createUserSchema } from "../schemas/users.schema.js";
import * as users from "../services/users.service.js";

export const usersRouter = Router();

usersRouter.post("/", async (req, res) => {
  const input = createUserSchema.parse(req.body); // throws → error mw → 400
  const user = await users.register(input);
  res.status(201).json(user);
});

// src/services/users.service.ts — no express import anywhere
import * as repo from "../repositories/users.repo.js";
import type { CreateUser } from "../schemas/users.schema.js";

export async function register(input: CreateUser) {
  // business rules here; repo is a module singleton (cached import)
  return repo.insertUser(input);
}`,
      note: "The import statement IS the container binding: ESM caches the module after first evaluation, so every importer shares one service — what Laravel's singleton() gave you, without the provider.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Read the annotated tree, then predict the dependency rule before revealing: for each layer, which other layers is it allowed to import from? Run to check your answer.",
    code: `$ tree src
src
├── server.ts              # entry: listen(), graceful shutdown
├── app.ts                 # builds & exports the Express app
├── db.ts                  # pg Pool singleton
├── routes/
│   └── users.routes.ts    # HTTP wiring: parse, validate, status codes
├── services/
│   └── users.service.ts   # business logic — framework-free, no req/res
├── repositories/
│   └── users.repo.ts      # SQL lives here
├── schemas/
│   └── users.schema.ts    # zod schemas + z.infer types
└── middleware/
    └── auth.ts            # request-scoped concerns

6 directories, 8 files`,
    output: `The dependency rule — imports point one way only:

server.ts       → app.ts, db.ts           (listen + shutdown, nothing else)
app.ts          → routes/, middleware/    (mounts routers, error handler last)
routes/*        → services/, schemas/     (NEVER repositories/ or db.ts)
services/*      → repositories/, schemas/ (NEVER express — no req/res)
repositories/*  → db.ts, schemas/         (the ONLY layer that writes SQL)
schemas/*       → (nothing — a leaf; safe to import from anywhere)

Violations to catch in review:
  - a route importing db.ts        → SQL is leaking into the HTTP layer
  - a service importing express    → business logic is now untestable
                                     without HTTP
  - services/index.ts barrel used  → circular-import risk between
    by its own siblings              sibling services`,
  },

  keyPoints: [
    "Layer like Laravel: routes ≈ controllers (HTTP only), services = framework-free business logic, repositories = the only layer that touches SQL and the pg Pool.",
    "The dependency rule is one-way: routes → services → repositories; a service must never import express or see `req`/`res`.",
    "Split `app.ts` (builds and exports the app, no `listen()`) from `server.ts` (listens, owns shutdown) — supertest then starts the exported app on its own ephemeral port per test, so no fixed port is ever bound.",
    "Zod schemas live in one place and serve two layers: routes call `schema.parse()`, services type parameters with `z.infer<typeof schema>`.",
    "ESM module caching makes `export const pool = new Pool()` a singleton — the import statement replaces most of Laravel's DI container; use factory-function injection only where tests need to swap a dependency.",
    "Barrel `index.ts` files re-exporting a folder invite circular imports that surface as `undefined` exports at runtime — prefer direct imports between siblings.",
  ],

  interview: [
    {
      q: "How do you structure an Express + TypeScript API, and where did the DI container go?",
      a: "Three layers with a one-way dependency rule: routes handle HTTP — parse, validate with zod, pick status codes — and call services; services hold business logic and are framework-free, no req/res in their signatures; repositories are the only layer that writes SQL against the pg Pool. It's the Controller/Service/Repository layering from Laravel, so the pattern transfers directly. The container is mostly replaced by module semantics: ESM evaluates a module once and caches it, so exporting a constructed Pool or service object gives you a singleton for free — the import statement is the binding. I use explicit constructor or factory injection only where testing needs to swap a dependency, typically a service taking its repository so unit tests can pass a fake.",
    },
    {
      q: "Why split app.ts from server.ts when they could be one file?",
      a: "Because the split separates 'what the app is' from 'the process running it'. app.ts builds and exports the Express app — middleware, routers, error handler — but never calls listen(). server.ts imports it, binds the port, and owns process concerns: graceful shutdown on SIGTERM, closing the pg Pool. The payoff is testing: supertest can drive the exported app directly with request(app).get('/users') — no port conflicts, no boot scripts, tests run in parallel. It also keeps process lifecycle code out of the thing you're testing. It's a two-line change that every serious Node codebase makes.",
    },
    {
      q: "Why do you insist services never import Express?",
      a: "Three reasons. Testability: a function taking (input: CreateUser) and returning a User can be unit-tested with plain values; one taking (req, res) needs HTTP mocking for every test. Reusability: the same service can be called from an HTTP route, a queue worker, a cron script, or a WebSocket handler — the moment it reads req.query it's welded to one transport. And clarity of contract: with zod-inferred types on the service boundary, the compiler documents exactly what the business logic needs, instead of 'whatever happens to be on the request'. In PHP terms it's the same discipline as keeping business logic out of controllers — the framework should be a delivery mechanism, not a dependency of your domain.",
    },
  ],

  quiz: [
    {
      question:
        "In the routes → services → repositories layering, which import is a violation?",
      options: [
        "A route importing a zod schema",
        "A repository importing the pg Pool from db.ts",
        "A service importing Router from express to build its response",
        "A route importing a service",
      ],
      answerIndex: 2,
      explain:
        "Services must stay framework-free: no express import, no req/res. That keeps them unit-testable with plain values and reusable from non-HTTP entry points (queue workers, cron). Routes importing schemas and services, and repositories importing the Pool, are exactly the allowed directions.",
    },
    {
      question:
        "What does `export const pool = new Pool()` in db.ts give you when five files import it?",
      options: [
        "Five separate pools, one per importing file",
        "One shared Pool instance — ESM evaluates a module once and caches it, so it behaves like a container singleton",
        "A new pool per incoming HTTP request",
        "A compile error — TypeScript forbids exporting class instances",
      ],
      answerIndex: 1,
      explain:
        "Module caching is the mechanism that replaces most of the DI container: the module body runs once, and every importer receives the same exports. Combined with Node's long-lived process, that one Pool serves every request — the behavior Laravel's singleton() binding simulated per-request.",
    },
    {
      question: "Why does app.ts export the Express app without calling listen()?",
      options: [
        "Calling listen() twice in one process is a syntax error",
        "Express 5 removed the listen() method from apps",
        "So tests can import the app and drive it with supertest — which binds an ephemeral port of its own — while server.ts owns listen() and shutdown",
        "To prevent the app from starting before the database is ready",
      ],
      answerIndex: 2,
      explain:
        "The app/server split separates the testable artifact (the app: routes, middleware, error handling) from process concerns (port, SIGTERM handling, pool cleanup). supertest starts the exported app on an ephemeral port for the duration of each request and closes it again, which is why integration tests never need a server you booted yourself.",
    },
    {
      question: "What is the characteristic failure mode of barrel-file (index.ts) circular imports?",
      options: [
        "A clear compile error naming both files",
        "One module sees a half-initialized import — undefined where a function should be — often only at runtime",
        "Node refuses to start and prints the full cycle",
        "Imports silently resolve to an empty object and stay that way permanently",
      ],
      answerIndex: 1,
      explain:
        "ESM resolves cycles by handing one side a module record that isn't fully evaluated yet. TypeScript often can't flag it, so the bug appears at runtime as 'x is not a function'. Direct sibling imports — keeping barrels only for external consumers — avoid the cycle entirely.",
    },
  ],
};

export default lesson;
