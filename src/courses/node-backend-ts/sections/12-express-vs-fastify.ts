import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "express-vs-fastify",
  title: "Fastify: The Other Interview Answer",
  part: "Express Essentials",
  estMinutes: 11,
  summary:
    "Fastify 5 runs on the same event loop but flips the philosophy: routes declare full JSON Schemas that validate input and speed up output, plugins encapsulate instead of a flat middleware stack.",

  concept: `
When a job listing says "Node.js API experience", the framework behind it is
usually Express — but the second name you'll hear in interviews is **Fastify**.
Same runtime, same event loop, same one-long-running-process rules. What
changes is the philosophy: Express gives you a minimal pipe of middleware and
leaves validation, serialization, and structure to you; Fastify makes the
**route schema** the centre of everything.

### Schema-first routes

A Fastify route can declare a full JSON Schema for its body, params, query,
and responses. Fastify then does two jobs with it:

\`\`\`ts
// src/routes/users.ts
app.post("/users", {
  schema: {
    body: {
      type: "object",              // Fastify 5 requires the FULL schema —
      required: ["name", "email"], // shorthand without type: 'object' is gone
      properties: {
        name: { type: "string" },
        email: { type: "string" },
      },
    },
    response: {
      201: {
        type: "object",
        properties: { id: { type: "number" }, name: { type: "string" } },
      },
    },
  },
}, async (request, reply) => {
  const { name, email } = request.body as { name: string; email: string };
  return reply.code(201).send({ id: 1, name });
});
\`\`\`

**Validation**: a body that fails the schema never reaches your handler —
Fastify replies 400 with a structured error automatically. **Serialization**:
the \`response\` schema compiles to a specialised serializer that's much faster
than generic \`JSON.stringify\` and strips any properties you didn't declare
(accidentally leaking \`passwordHash\` becomes structurally impossible).

The \`as\` cast above is the manual escape hatch; in real projects a **type
provider** (\`@fastify/type-provider-json-schema-to-ts\` or TypeBox) infers
\`request.body\`'s TypeScript type directly from the schema, so types and
validation share one source of truth.

### Plugins and hooks instead of a flat stack

Express structure is one flat ordered list of \`(req, res, next)\` middleware.
Fastify composes **plugins**: each \`app.register(...)\` creates an encapsulated
scope, so a database decorator or auth hook registered inside one plugin is
invisible outside it — closer to how a Laravel service provider scopes
bindings than to a global middleware stack. Cross-cutting logic uses named
lifecycle **hooks** (\`onRequest\`, \`preHandler\`, \`onSend\`, ...) rather than
middleware position, and handlers reply with \`reply.send(...)\` (or just
\`return\` a value) instead of \`res.json(...)\`.

### The honest positioning

Express owns the job-listing mindshare, the tutorial ecosystem, and the
"every Node dev can read it" factor. Fastify wins on throughput (schema-compiled
serialization, faster routing), built-in validation, structured logging out of
the box (pino is its default logger), and encapsulation that keeps big
codebases modular. The interview gold is explaining **why a team picks each**:
Express for ubiquity and ecosystem familiarity; Fastify when performance,
input validation, and plugin structure are first-class requirements. Nobody
hires you for saying one is "better".
`,

  comparisons: [
    {
      label: "The same GET /users/:id in both frameworks",
      intro:
        "One endpoint, two philosophies: Express validates nothing until you add code; Fastify validates params against a schema before the handler runs.",
      php: `// Express 5
import express from "express";
const app = express();

app.get("/users/:id", async (req, res) => {
  // req.params.id is a string; nobody has checked it.
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "id must be a number" });
  }
  const user = await findUser(id);
  res.json(user);
});

app.listen(3000);`,
      ts: `// Fastify 5
import Fastify from "fastify";
const app = Fastify({ logger: true });

app.get("/users/:id", {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "number" } },
    },
  },
}, async (request, reply) => {
  // A non-numeric id was already rejected with a 400.
  const { id } = request.params as { id: number };
  const user = await findUser(id);
  return reply.send(user); // or just: return user
});

await app.listen({ port: 3000 });`,
      note: "Fastify coerces and validates :id against the schema before your handler runs; in Express that guard is hand-written per route (or delegated to a validation library like Zod).",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Declarative validation: FormRequest vs route schema",
      intro:
        "Both frameworks let you declare the rules and keep the handler clean: Laravel rejects with a 422 before the controller runs, Fastify with a 400 before the handler runs.",
      php: `<?php
// app/Http/Requests/StoreUserRequest.php (Laravel)
class StoreUserRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name'  => ['required', 'string'],
            'email' => ['required', 'email'],
        ];
    }
}

// Controller only ever sees valid input:
public function store(StoreUserRequest $request)
{
    $data = $request->validated();
    // ...
}`,
      ts: `// Fastify route schema — same idea, JSON Schema dialect
app.post("/users", {
  schema: {
    body: {
      type: "object",
      required: ["name", "email"],
      properties: {
        name: { type: "string" },
        // Fastify 5 bundles ajv-formats, so format checks work out of the box
        email: { type: "string", format: "email" },
      },
    },
  },
}, async (request, reply) => {
  // Handler only ever sees valid input:
  const body = request.body as { name: string; email: string };
  return reply.code(201).send({ id: 1, name: body.name });
});`,
      note: "Same separation of concerns as a FormRequest — but Fastify's schema also drives response serialization, and a type provider can derive the TS type of request.body from it.",
    },
    {
      label: "Middleware stack vs hooks and plugins",
      intro:
        "Cross-cutting auth logic in both: Express positions a middleware in the flat stack; Fastify registers a lifecycle hook inside an encapsulated plugin.",
      php: `// Express: order in the flat stack IS the architecture.
app.use(express.json());
app.use(requestLogger);
app.use("/admin", requireAuth); // applies to paths by prefix
app.get("/admin/stats", statsHandler);`,
      ts: `// Fastify: plugins encapsulate; hooks name their lifecycle point.
app.register(async (admin) => {
  // This hook exists ONLY inside this plugin's scope:
  admin.addHook("onRequest", requireAuth);
  admin.get("/stats", statsHandler);
}, { prefix: "/admin" });
// Routes registered outside the plugin are untouched —
// no accidental global middleware.`,
      note: "Encapsulation is the deep difference: an Express middleware leaks to everything registered after it, while a Fastify hook is scoped to its plugin unless you explicitly promote it.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "A Fastify 5 server has the POST /users route with the body schema requiring name and email (both strings). Predict the two responses: what does Fastify send when the body is missing email, and when it's valid?",
    code: `# The server declares this body schema on POST /users:
#   { type: 'object', required: ['name', 'email'],
#     properties: { name: { type: 'string' }, email: { type: 'string' } } }
# The handler replies 201 with { id, name, email }.

# 1. Invalid body — 'email' is missing:
curl -s -X POST http://localhost:3000/users \\
  -H 'content-type: application/json' \\
  -d '{"name":"Ada"}'

# 2. Valid body:
curl -s -X POST http://localhost:3000/users \\
  -H 'content-type: application/json' \\
  -d '{"name":"Ada","email":"ada@example.com"}'`,
    output: `$ curl -s -X POST http://localhost:3000/users \\
    -H 'content-type: application/json' -d '{"name":"Ada"}'
{"statusCode":400,"code":"FST_ERR_VALIDATION","error":"Bad Request","message":"body must have required property 'email'"}

$ curl -s -X POST http://localhost:3000/users \\
    -H 'content-type: application/json' \\
    -d '{"name":"Ada","email":"ada@example.com"}'
{"id":1,"name":"Ada","email":"ada@example.com"}

# The 400 came from Fastify itself — the handler never ran.
# No hand-written if-checks, no validation library wired in.`,
  },

  keyPoints: [
    "Fastify runs on the same event loop as Express — everything about one long-running process, shared state, and blocking still applies; only the framework philosophy differs.",
    "Fastify routes declare JSON Schemas for body/params/query/response; invalid input is rejected with an automatic 400 (`FST_ERR_VALIDATION`) before the handler runs.",
    "Fastify 5 requires full JSON Schemas including `type: 'object'` — the old property-only shorthand is gone.",
    "Response schemas do double duty: compiled serializers beat generic `JSON.stringify`, and undeclared properties are stripped — a leaked `passwordHash` can't survive serialization.",
    "Plugins (`app.register`) create encapsulated scopes and hooks (`onRequest`, `preHandler`) replace positional middleware — closer to Laravel service providers than to a flat stack.",
    "Interview positioning: Express wins on mindshare and ecosystem; Fastify wins on throughput, built-in validation, and structure — know why a team would choose each.",
  ],

  interview: [
    {
      q: "When would you choose Fastify over Express, and vice versa?",
      a: "I'd frame it as philosophy, not quality. Express is minimal and ubiquitous: every Node developer reads it fluently, the middleware ecosystem is enormous, and for a straightforward API that familiarity lowers risk. Fastify makes different guarantees: routes declare JSON Schemas, so validation happens before my handler runs and response serialization is compiled per-route — that's where its throughput advantage comes from — plus plugin encapsulation keeps large codebases modular and pino logging is built in. So for a high-traffic service where input validation and performance are first-class requirements, I'd lean Fastify; for a team of mixed experience or a codebase living in the Express ecosystem, Express 5 with Zod validation gets you to a similar place. Both run on the same event loop, so the fundamental Node concerns don't change.",
    },
    {
      q: "How does Fastify's validation differ from how you'd validate in Laravel?",
      a: "Conceptually they're close, which made Fastify feel natural coming from PHP. A Laravel FormRequest declares rules, the framework rejects invalid input with a 422 before the controller runs, and the controller trusts `$request->validated()`. Fastify does the same with JSON Schema on the route: invalid bodies get an automatic 400 with a structured error and the handler never executes. Two extras Laravel doesn't give you: the response schema also drives a compiled serializer that strips undeclared fields and speeds up output, and with a type provider like json-schema-to-ts the schema generates the TypeScript type of `request.body` — so the validation rules and the static types can't drift apart.",
    },
    {
      q: "What's the difference between Express middleware and Fastify's hooks and plugins?",
      a: "Express structure is one flat, ordered stack of `(req, res, next)` functions — position in the stack is the architecture, and anything you `app.use` applies to everything registered after it. Fastify splits that into two ideas. Hooks are named lifecycle points — `onRequest`, `preHandler`, `onSend` — so intent is explicit instead of positional. Plugins are encapsulated scopes: a hook or decorator registered inside `app.register(...)` only affects routes in that scope, so an auth hook on the admin plugin can't accidentally leak onto public routes. It reminds me of Laravel service providers scoping bindings versus stacking global HTTP middleware.",
    },
  ],

  quiz: [
    {
      question:
        "A request body fails a Fastify route's JSON Schema validation. What happens?",
      options: [
        "The handler runs with request.body set to undefined",
        "Fastify replies 400 with a structured error; the handler never runs",
        "The process crashes with an unhandled exception",
        "Fastify strips the invalid fields and calls the handler",
      ],
      answerIndex: 1,
      explain:
        "Schema validation runs before the handler: on failure Fastify sends a 400 with code FST_ERR_VALIDATION and a message describing the violation. Stripping undeclared fields is what the RESPONSE schema does during serialization — a different feature.",
    },
    {
      question: "What changed about schemas in Fastify 5?",
      options: [
        "Schemas are now optional only for GET routes",
        "Schemas must be written in TypeScript instead of JSON Schema",
        "Schemas must be full JSON Schema objects including type: 'object'",
        "Schemas now validate responses only, not requests",
      ],
      answerIndex: 2,
      explain:
        "Fastify 5 dropped the loose shorthand where you could list properties without declaring type: 'object'. Every schema must now be a complete, valid JSON Schema — which also makes them portable to other JSON Schema tooling like type providers.",
    },
    {
      question:
        "Why can a Fastify response schema make an endpoint faster AND safer?",
      options: [
        "It caches responses so handlers run less often",
        "It compiles a per-route serializer faster than JSON.stringify and strips undeclared properties",
        "It compresses the JSON body with gzip automatically",
        "It moves serialization onto a worker thread",
      ],
      answerIndex: 1,
      explain:
        "Fastify compiles the response schema into a specialised serializer (fast-json-stringify), which outperforms generic JSON.stringify — and because only declared properties are emitted, accidentally serializing a sensitive field like passwordHash is structurally impossible.",
    },
  ],
};

export default lesson;
