import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "api-integration-tests",
  title: "API Integration Tests in Node",
  part: "Integration & E2E",
  estMinutes: 12,
  summary:
    "Integration tests call your real HTTP handler in-process — request(app).get('/users').expect(200) — exercising routing, middleware, validation, and serialization together, with no server to start and no curl in sight.",

  concept: `
Unit tests told you your functions work. They said nothing about whether \`GET /users\`
actually returns users — whether the route is wired, the middleware runs, the validation
fires, and the JSON comes out shaped right. That's the next layer of the pyramid:
**API integration tests**, which exercise the real HTTP handler *in-process*.

### The old workflow, named honestly

For years the PHP answer was: change the controller, alt-tab, \`curl localhost\` (or refresh
Postman), eyeball the JSON, move on. That *is* an integration test — executed by hand, with
you as the assertion library, and thrown away the moment you look elsewhere. Everything in
this section is that workflow, kept.

### supertest: hand the app to the test

The classic Node tool is **supertest**. You import your Express (or similar) \`app\` — the
object, not a running server — and make requests against it:

\`\`\`ts
// tests/users.integration.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app";

describe("GET /users", () => {
  it("returns the user list as JSON", async () => {
    const res = await request(app)
      .get("/users")
      .expect(200)
      .expect("Content-Type", /json/);

    expect(res.body).toHaveLength(2);
  });
});
\`\`\`

You never start or manage a server — supertest spins the app up on an ephemeral port
behind the scenes and tears it down. No port collisions between test files, no "is the
dev server running?" step, and the router is the **real** router: nothing between the
test and your app is mocked.

\`.expect(status)\` and \`.expect(header, value)\` assert on the raw HTTP response;
after \`await\`, the resolved response gives you \`res.body\` (parsed JSON), \`res.status\`,
and \`res.headers\` for your normal Vitest assertions.

### What this layer buys over unit tests

One integration test crosses every seam a unit test deliberately avoids:

- **Routing** — is the path actually registered, with the right method?
- **Middleware** — auth guards, body parsing, error handlers, in real order.
- **Validation** — does a bad payload produce the 4xx you promised?
- **Serialization** — does the response JSON have the shape clients depend on?

A whole class of production bugs — "the function was right but nobody routed to it" —
lives only at this layer.

### Think in contracts, not payloads

The most important habit at this layer: **assert the response contract, not every
incidental byte**. If the test pins the entire body with \`toEqual\`, it breaks every time
someone adds a harmless field. Assert what clients actually rely on:

\`\`\`ts
expect(res.status).toBe(201);
expect(res.body).toMatchObject({ name: "Ada" });
expect(typeof res.body.id).toBe("number");   // exists and is a number; value is the DB's business
\`\`\`

\`toMatchObject\` checks that the listed fields are present and correct while tolerating
extras — the code equivalent of "the contract says at least this". That mindset — the
response schema is a promise to clients, tests enforce the promise — is what interviewers
mean by contract testing at the API layer.

The unresolved thread here is the database: these tests still hit whatever data layer the
app is wired to. Faking it versus using a real test database is section 21's problem.
`,

  comparisons: [
    {
      label: "Manual QA transcript vs an integration test",
      intro:
        "Verifying that GET /users returns the list. The left side is the loop you have run thousands of times; the right side is the same check, kept forever and run in milliseconds.",
      php: `# The manual 'integration test', PHP-era edition
$ curl -s http://localhost:8080/users | jq
[
  { "id": 1, "name": "Ada" },
  { "id": 2, "name": "Grace" }
]
# Looks right. *marks ticket done*
#
# ...two weeks later a middleware change breaks
# the route. Nobody curls it. Production finds out.`,
      ts: `// tests/users.integration.test.ts
import { it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app";

it("GET /users returns the user list", async () => {
  const res = await request(app)
    .get("/users")
    .expect(200)
    .expect("Content-Type", /json/);

  expect(res.body).toHaveLength(2);
  expect(res.body[0]).toMatchObject({ name: "Ada" });
});`,
      note: "Same check, but the test imports the app object directly — no server to start, no port to remember — and it reruns on every commit instead of only when someone remembers to curl.",
      leftLang: "bash",
      rightLang: "ts",
    },
    {
      label: "Validation failure: promised, then enforced",
      intro:
        "The API promises a 422 with an error message when the payload has no name. One codebase documents that promise in a comment; the other enforces it.",
      php: `<?php
// src/Controller/UserController.php
public function store(Request $request): JsonResponse
{
    $name = $request->get('name');
    // Should 422 on a missing name.
    // Verified once, by hand, in Postman,
    // the week this was written.
    if (!$name) {
        return new JsonResponse(
            ['error' => 'name is required'], 422
        );
    }
    return new JsonResponse(
        $this->users->create($name), 201
    );
}`,
      ts: `// tests/users.integration.test.ts
it("rejects a payload without a name", async () => {
  const res = await request(app)
    .post("/users")
    .send({})                    // JSON body, empty
    .expect(422);

  expect(res.body.error).toBe("name is required");
});

it("creates a user from a valid payload", async () => {
  const res = await request(app)
    .post("/users")
    .send({ name: "Hedy" })
    .expect(201);

  expect(res.body).toMatchObject({ name: "Hedy" });
});`,
      note: "The 422 path is exactly the branch manual QA stops re-checking once the happy path works — an integration test pins both branches through the real router and body-parsing middleware.",
      rightLang: "ts",
    },
    {
      label: "Pinning the payload vs asserting the contract",
      intro:
        "Two ways to assert on the same 201 response. The first is a naive first-draft test that fails for the wrong reasons; the second asserts what clients actually depend on.",
      php: `// A brittle first draft
it("creates a user", async () => {
  const res = await request(app)
    .post("/users")
    .send({ name: "Hedy" });

  // Pins EVERY field. Adding createdAt, avatarUrl,
  // or changing id allocation breaks this test —
  // with zero real regressions.
  expect(res.body).toEqual({
    id: 3,
    name: "Hedy",
  });
});`,
      ts: `// The contract-minded version
it("creates a user", async () => {
  const res = await request(app)
    .post("/users")
    .send({ name: "Hedy" })
    .expect(201);

  // The promise to clients: a name we set,
  // and a numeric id. Extra fields welcome.
  expect(res.body).toMatchObject({ name: "Hedy" });
  expect(typeof res.body.id).toBe("number");
});`,
      note: "toEqual pins incidental fields and exact ids; toMatchObject asserts the schema clients rely on while tolerating additions — tests should fail for broken promises, not for new features.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "An integration test in miniature: a tiny router of pure functions stands in for the Express app, and the tests fire whole requests at it — happy path, 404, and validation failure — asserting on status and body exactly as supertest tests do. Predict the five result lines, then run it.",
    code: `// --- mini test harness (what vitest provides) ---
function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected)
        throw new Error(\`expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`);
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) throw new Error(\`expected \${e}, got \${a}\`);
    },
  };
}
function test(name: string, fn: () => void) {
  try { fn(); console.log(\`PASS \${name}\`); }
  catch (err) { console.log(\`FAIL \${name}: \${(err as Error).message}\`); }
}

// --- the "app": a real router, in miniature (what you'd import) ---
interface Req { method: string; path: string; body?: unknown }
interface Res { status: number; body: unknown }

const users = [{ id: 1, name: "Ada" }, { id: 2, name: "Grace" }];

function handle(req: Req): Res {
  if (req.method === "GET" && req.path === "/users") {
    return { status: 200, body: users };
  }
  if (req.method === "GET" && req.path.startsWith("/users/")) {
    const id = Number(req.path.slice("/users/".length));
    const user = users.find((u) => u.id === id);
    return user
      ? { status: 200, body: user }
      : { status: 404, body: { error: "user not found" } };
  }
  if (req.method === "POST" && req.path === "/users") {
    const b = req.body as { name?: unknown };
    if (typeof b?.name !== "string" || b.name.trim() === "") {
      return { status: 422, body: { error: "name is required" } };
    }
    return { status: 201, body: { id: users.length + 1, name: b.name } };
  }
  return { status: 404, body: { error: "no such route" } };
}

// --- the integration tests: whole request in, whole response asserted ---
test("GET /users returns the list", () => {
  const res = handle({ method: "GET", path: "/users" });
  expect(res.status).toBe(200);
  expect((res.body as unknown[]).length).toBe(2);
});

test("GET /users/2 returns one user", () => {
  const res = handle({ method: "GET", path: "/users/2" });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ id: 2, name: "Grace" });
});

test("GET /users/99 is a 404 with an error body", () => {
  const res = handle({ method: "GET", path: "/users/99" });
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: "user not found" });
});

test("POST /users without a name is a 422", () => {
  const res = handle({ method: "POST", path: "/users", body: {} });
  expect(res.status).toBe(422);
  expect(res.body).toEqual({ error: "name is required" });
});

test("POST /users with a name creates (contract: name + numeric id)", () => {
  const res = handle({ method: "POST", path: "/users", body: { name: "Hedy" } });
  expect(res.status).toBe(201);
  const body = res.body as { id: number; name: string };
  expect(body.name).toBe("Hedy");
  expect(typeof body.id).toBe("number");
});`,
  },

  keyPoints: [
    "API integration tests call the real HTTP handler in-process: `request(app).get('/users').expect(200)` — you import the app object, and supertest handles the ephemeral server for you.",
    "One integration test exercises routing, middleware, validation, and serialization together — the seams unit tests deliberately avoid, where 'the function was right but nothing routed to it' bugs live.",
    "Chain `.expect(status)` / `.expect('Content-Type', /json/)` for raw HTTP assertions, then use normal Vitest matchers on `res.body`.",
    "Test the sad paths — 404s and validation 4xxs — because those are exactly the branches manual QA stops re-checking after the happy path works.",
    "Assert the response contract, not the whole payload: `toMatchObject` for promised fields plus a type check on generated ones; `toEqual` on the full body breaks whenever anyone adds a field.",
    "This layer is the automated, permanent version of curl-ing localhost after every change — same check, kept forever, run on every commit.",
  ],

  interview: [
    {
      q: "What does an API integration test cover that unit tests don't?",
      a: "The wiring. A unit test proves a handler function transforms input to output correctly; an integration test proves the whole HTTP slice works: the route is actually registered for that method and path, middleware runs in the right order — auth, body parsing, error handling — validation rejects bad payloads with the promised status codes, and the response serializes to the JSON shape clients depend on. With supertest I import the app object and make requests in-process, so nothing between the test and my code is mocked. There's a whole category of production bugs — misregistered routes, middleware ordering, serializer changes — that only exists at this layer, which is why the pyramid has a middle.",
    },
    {
      q: "How do you keep integration tests from becoming brittle?",
      a: "By asserting the contract instead of the payload. If I `toEqual` the entire response body, the test fails every time someone adds a harmless field or the id allocator changes — failures with no regression behind them, which trains the team to ignore red. Instead I assert what clients actually rely on: the status code, `toMatchObject` for the promised fields, and type-level checks on generated values — `typeof res.body.id === 'number'` rather than `id === 3`. The response schema is a promise to API consumers; the test should break exactly when that promise breaks, and never otherwise.",
    },
    {
      q: "Why is request(app) better than testing against a running dev server?",
      a: "Because it removes an entire class of environmental failure. Handing supertest the app object means the test doesn't depend on a server someone remembered to start, a hardcoded port that might collide, or the network at all — supertest binds an ephemeral port internally and tears it down per test. That makes the tests runnable in parallel and trivially portable to CI: no docker-compose choreography just to check a route returns 200. It's the difference between 'works on my machine, when the server's up' and a self-contained check — while still exercising the genuine router and middleware stack rather than mocks of them.",
    },
  ],

  quiz: [
    {
      question:
        "In `await request(app).get('/users').expect(200)`, what is `app`?",
      options: [
        "A URL pointing at the locally running dev server",
        "The imported application object itself — supertest runs it on an ephemeral port for the test",
        "A mock of the router with predefined responses",
        "A Playwright browser context",
      ],
      answerIndex: 1,
      explain:
        "supertest takes the app object (e.g. your Express app), not a URL. It spins the app up on an ephemeral port behind the scenes, so the real routing and middleware run, with no dev server to manage and no port conflicts.",
    },
    {
      question:
        "Why prefer toMatchObject over toEqual when asserting an API response body?",
      options: [
        "toMatchObject is faster because it skips fields",
        "toEqual cannot compare nested objects",
        "toMatchObject checks the promised fields while tolerating additions, so the test fails only when the contract breaks",
        "toMatchObject performs runtime schema validation with detailed errors",
      ],
      answerIndex: 2,
      explain:
        "toEqual pins every field of the body, so adding a harmless createdAt breaks the test with no real regression. toMatchObject asserts the fields clients depend on and ignores extras — the test tracks the contract, not the incidental payload.",
    },
    {
      question:
        "Which failure would an API integration test catch that a unit test on the handler function would miss?",
      options: [
        "An off-by-one error inside the handler's business logic",
        "The route was accidentally registered as POST instead of GET, so requests never reach the handler",
        "A wrong constant in a pure utility function",
        "A CSS regression on the users page",
      ],
      answerIndex: 1,
      explain:
        "Unit tests call the handler directly, bypassing routing entirely — a misregistered method or path is invisible to them. The integration test issues a real GET through the real router, so the wiring itself is under test. (The off-by-one is caught at either layer; CSS needs the browser.)",
    },
  ],
};

export default lesson;
