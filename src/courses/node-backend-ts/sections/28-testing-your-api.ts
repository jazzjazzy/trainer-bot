import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "testing-your-api",
  title: "Testing the API",
  part: "Scaling & Shipping",
  estMinutes: 12,
  summary:
    "node:test is the built-in, zero-dependency PHPUnit: describe/it, node:assert/strict, mock.fn for test doubles — plus supertest driving your exported app over an ephemeral port it opens and closes for you.",

  concept: `
You know exactly what a test suite should look like — you've written PHPUnit
for two decades. The Node translation is direct, with one pleasant surprise:
the test runner **ships with the runtime**. No \`composer require --dev
phpunit/phpunit\`, no config file. \`node --test\` discovers \`*.test.ts\`
files (on Node 24 LTS, type stripping runs TypeScript tests directly) and
runs them.

\`\`\`ts
// src/services/invite.service.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("inviteService", () => {
  it("filters by domain", async () => {
    assert.equal(1 + 1, 2);            // assertSame
    assert.deepEqual({ a: 1 }, { a: 1 }); // assertEquals (structural)
  });
});
\`\`\`

\`node:assert/strict\` gives you \`assert.equal\` (≈ \`assertSame\` — strict
\`===\`), \`assert.deepEqual\` (≈ \`assertEquals\` on arrays/objects),
\`assert.rejects\` for async failures, and \`assert.throws\`. **Vitest** is the
popular third-party alternative — Jest-compatible \`expect()\` API, watch
mode, great DX — but interviewers increasingly expect you to know the
zero-dependency baseline first.

### Unit tests: the section-27 layering pays off

Because services take their repository as a parameter instead of importing it,
the unit test passes a fake — no database, no network:

\`\`\`ts
import { mock } from "node:test";

const findEmails = mock.fn(async () => ["a@acme.dev", "b@other.io"]);
const service = makeInviteService({ findEmails });

const result = await service.invite("acme.dev");
assert.deepEqual(result, ["a@acme.dev"]);
assert.equal(findEmails.mock.callCount(), 1); // ≈ expects($this->once())
\`\`\`

\`mock.fn()\` is \`createMock\` and \`expects()\` rolled into one: it records
every call (\`mock.calls[0].arguments\`, \`callCount()\`), and you assert
afterwards instead of declaring expectations up front. \`mock.method(obj,
'name')\` spies on an existing object's method — take it off the test context
(\`it("...", (t) => { t.mock.method(obj, 'name') })\`) and the runner restores
the original automatically when the test ends. The top-level \`mock\` from
\`node:test\` is NOT reset for you: its stubs leak into later tests unless you
call \`mock.restoreAll()\` yourself.

### Integration tests: supertest against the exported app

The app/server split exists for this moment. \`supertest\` takes the exported
Express app, starts it on an ephemeral port for you (\`app.listen(0)\`), and
closes it again when the response arrives — so you never pick or manage a port:

\`\`\`ts
import request from "supertest";
import { app } from "./app.js";

const res = await request(app)
  .post("/api/users")
  .send({ email: "a@b.dev" })
  .expect(201);
\`\`\`

That's Laravel's \`$this->postJson('/api/users', [...])->assertStatus(201)\`,
except nothing framework-magic is happening: supertest makes a real HTTP
request to a throwaway localhost server it started in the test process.

### The async gotchas

Two rules keep async tests honest. **Always await**: an un-awaited assertion
inside a promise runs after the test already "passed" — the runner can't see
it. **Rejections fail tests**: \`node --test\` fails any test whose returned
promise rejects, so \`async () => { await service.boom(); }\` fails correctly
— but only because it was awaited. When you expect the failure, assert it:
\`await assert.rejects(service.boom(), /not found/)\`.

### And the database?

One honest paragraph: real confidence in repositories needs a real Postgres.
The common approaches are Testcontainers (spin up a throwaway Postgres in
Docker per suite) or a dedicated test database with per-test truncation —
both out of scope here, but name them in interviews rather than pretending
mocks cover SQL.
`,

  comparisons: [
    {
      label: "PHPUnit createMock vs node:test mock.fn",
      intro:
        "Unit-testing a service against a fake repository: assert the result and that the repository was called exactly once.",
      php: `<?php // tests/Unit/UserServiceTest.php
use PHPUnit\\Framework\\TestCase;

final class UserServiceTest extends TestCase
{
    public function testRegisterSavesUser(): void
    {
        $repo = $this->createMock(UserRepository::class);
        $repo->expects($this->once())          // expectation declared
             ->method('insert')                 // BEFORE the action
             ->willReturn(new User(1, 'a@b.dev'));

        $service = new UserService($repo);
        $user = $service->register('a@b.dev', 'secret');

        $this->assertSame(1, $user->id);
    }
}
// $ vendor/bin/phpunit   (installed via composer require --dev)`,
      ts: `// src/services/users.service.test.ts
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { makeUserService } from "./users.service.js";

describe("UserService", () => {
  it("saves the user on register", async () => {
    const insert = mock.fn(async () => ({ id: 1, email: "a@b.dev" }));
    const service = makeUserService({ insert });

    const user = await service.register("a@b.dev", "secret");

    assert.equal(user.id, 1);
    assert.equal(insert.mock.callCount(), 1);  // inspected AFTER
    assert.deepEqual(insert.mock.calls[0].arguments[0].email, "a@b.dev");
  });
});
// $ node --test   (nothing installed — the runner ships with Node)`,
      note: "Same test, inverted style: PHPUnit declares expectations before acting; mock.fn records everything and you assert afterwards — and the runner itself is a Node builtin, not a dev dependency.",
    },
    {
      label: "Laravel HTTP test vs supertest",
      intro:
        "An end-to-end request through routing, middleware, validation, and the handler — without either framework making you pick a port.",
      php: `<?php // tests/Feature/UsersApiTest.php
final class UsersApiTest extends TestCase
{
    public function testCreatesUser(): void
    {
        $response = $this->postJson('/api/users', [
            'email'    => 'a@b.dev',
            'password' => 'secret123',
        ]);

        $response->assertStatus(201)
                 ->assertJsonPath('email', 'a@b.dev');
    }

    public function testRejectsBadEmail(): void
    {
        $this->postJson('/api/users', ['email' => 'nope'])
             ->assertStatus(422);
    }
}`,
      ts: `// src/routes/users.routes.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../app.js";   // the EXPORTED app — no listen()

describe("POST /api/users", () => {
  it("creates a user", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ email: "a@b.dev", password: "secret123" })
      .expect(201);

    assert.equal(res.body.email, "a@b.dev");
  });

  it("rejects a bad email", async () => {
    await request(app)
      .post("/api/users")
      .send({ email: "nope" })
      .expect(400);   // zod parse → error middleware
  });
});`,
      note: "request(app) is $this->postJson(): both drive the full stack in-process. It only works because app.ts exports the app without calling listen() — the whole reason for the app/server split.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A test framework is not magic — here is one in 40 lines: expect().toBe/.toEqual that throw on mismatch, and a runner that awaits each test and prints a PHPUnit-style summary. One test fails on purpose: predict the final summary line, then fix the test.",
    code: `// A PHPUnit-flavoured micro test framework: expect() + a runner.

let assertions = 0;

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      assertions++;
      if (actual !== expected) {
        throw new Error(\`expected \${JSON.stringify(expected)} but got \${JSON.stringify(actual)}\`);
      }
    },
    toEqual(expected: unknown) {
      assertions++;
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(\`expected \${b} but got \${a}\`);
      }
    },
  };
}

interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

async function runTests(tests: TestCase[]) {
  let failures = 0;
  for (const t of tests) {
    try {
      await t.fn(); // ALWAYS await — a rejected promise must fail the test
      console.log(\`  ok    \${t.name}\`);
    } catch (err) {
      failures++;
      console.log(\`  FAIL  \${t.name}\`);
      console.log(\`        \${(err as Error).message}\`);
    }
  }
  const verdict = failures === 0 ? "OK" : "FAILURES!";
  console.log(\`\${verdict} Tests: \${tests.length}, Assertions: \${assertions}, Failures: \${failures}.\`);
}

// The unit under test: a service with an injected repository.
interface UserRepo {
  findEmails(): Promise<string[]>;
}

function makeInviteService(repo: UserRepo) {
  return {
    async invite(domain: string) {
      const emails = await repo.findEmails();
      return emails.filter((e) => e.endsWith("@" + domain));
    },
  };
}

// No database anywhere near this test — the fake stands in for pg.
const fakeRepo: UserRepo = {
  findEmails: async () => ["ana@acme.dev", "bo@acme.dev", "cy@other.io"],
};
const service = makeInviteService(fakeRepo);

await runTests([
  {
    name: "invites only the matching domain",
    fn: async () => {
      const invited = await service.invite("acme.dev");
      expect(invited.length).toBe(2);
      expect(invited).toEqual(["ana@acme.dev", "bo@acme.dev"]);
    },
  },
  {
    name: "returns empty for an unknown domain",
    fn: async () => {
      expect(await service.invite("nowhere.net")).toEqual([]);
    },
  },
  {
    name: "wrong on purpose — make it pass",
    fn: async () => {
      const invited = await service.invite("other.io");
      expect(invited.length).toBe(2); // other.io has only one user
    },
  },
]);`,
  },

  keyPoints: [
    "`node --test` is the built-in runner — `describe`/`it` from `node:test`, assertions from `node:assert/strict` (`equal` ≈ assertSame, `deepEqual` ≈ assertEquals) — zero dev dependencies; Vitest is the popular Jest-flavoured alternative.",
    "`mock.fn()` creates a recording test double (assert `callCount()` and `calls[n].arguments` after the fact); `mock.method(obj, 'name')` spies on an existing method — together they cover PHPUnit's `createMock` + `expects()`. Prefer the test-context form `t.mock.method(...)`, which the runner restores automatically; the top-level `mock` leaves its stubs in place until you call `mock.restoreAll()`.",
    "Unit-test services by injecting a fake repository — possible only because section-27 services take dependencies as parameters instead of importing them.",
    "Integration-test HTTP with supertest against the exported app: `request(app).post('/api/users').send(body).expect(201)` ≈ Laravel's `$this->postJson(...)->assertStatus(201)` — supertest opens and closes an ephemeral port itself, so you never pick one.",
    "Async discipline: always `await` inside tests (un-awaited assertions run after the verdict), and use `await assert.rejects(promise, /msg/)` when the failure is the expectation.",
    "Mocks don't validate SQL — for repository confidence name Testcontainers or a dedicated test database with truncation, even though both are beyond this course.",
  ],

  interview: [
    {
      q: "How do you test a Node/Express API without a testing framework installed?",
      a: "Node ships one: the node:test module with a describe/it API, run via node --test, with assertions from node:assert/strict — on current Node, TypeScript test files run directly thanks to type stripping. For unit tests I inject fake repositories into services — my services take their data access as a parameter precisely so tests can hand them a mock.fn() and assert callCount and arguments afterwards. For HTTP integration tests I use supertest against my exported Express app: request(app).post('/api/users').expect(201) drives routing, middleware, validation, and the handler against a throwaway server supertest starts on an ephemeral port and closes again, which is why I keep listen() out of app.ts. Vitest is a fine alternative with Jest-style expect(), but the built-in runner means the baseline needs zero dev dependencies — quite a contrast to pulling in PHPUnit via Composer.",
    },
    {
      q: "How does node:test's mocking compare to PHPUnit's createMock?",
      a: "Same job, inverted ergonomics. PHPUnit declares expectations up front — $repo->expects($this->once())->method('insert')->willReturn(...) — and fails at teardown if they weren't met. node:test's mock.fn() just records: you give it an optional implementation, run the code, then assert on the recording — mock.callCount(), mock.calls[0].arguments, even each call's result or thrown error. mock.method(obj, 'name') spies on an existing object's method — and if I take it off the test context as t.mock.method(...), the runner restores the original automatically when the test finishes, whereas the top-level mock tracker keeps the stub in place until I call mock.restoreAll() myself. Because services receive dependencies as plain typed parameters, I usually don't even need mock.method — a hand-written object literal satisfying the repository interface is often clearer, with mock.fn reserved for when I need to assert call details.",
    },
    {
      q: "What async mistakes make Node test suites lie, and how do you prevent them?",
      a: "The classic is the missing await: if a test calls an async function without awaiting it, the test returns — and passes — before the promise settles, so a failing assertion inside it either vanishes or explodes later as an unhandled rejection attributed to nothing. The rule is that every promise created in a test gets awaited, so the test's own returned promise reflects reality; node --test then correctly fails any test whose promise rejects. When the rejection is what I'm testing, I use await assert.rejects(fn(), /message/) rather than try/catch, which also fails if the promise unexpectedly resolves. It's the async equivalent of PHPUnit's expectException — declared intent instead of accidental success.",
    },
  ],

  quiz: [
    {
      question: "What does running `node --test` require you to install first?",
      options: [
        "The @nodejs/test package from npm",
        "Nothing — the test runner, describe/it, and node:assert ship with the Node runtime",
        "Vitest, which node --test wraps",
        "A jest.config.ts file at the project root",
      ],
      answerIndex: 1,
      explain:
        "node:test and node:assert are builtins — the zero-dependency counterpart to composer-requiring PHPUnit. Vitest is a separate, popular alternative, not a requirement. On modern Node, --test even picks up TypeScript test files directly via type stripping.",
    },
    {
      question:
        "In node:test, how do you verify a fake repository was called exactly once — the equivalent of PHPUnit's $repo->expects($this->once())?",
      options: [
        "mock.fn() records calls; assert.equal(fake.mock.callCount(), 1) after running the code",
        "Pass { expects: 'once' } as an option to mock.fn()",
        "Wrap the call in assert.calledOnce(fake)",
        "It's automatic — mocks fail the test if called more than once",
      ],
      answerIndex: 0,
      explain:
        "node:test mocks are recorders, not expectation machines: run the code, then inspect fake.mock.callCount() and fake.mock.calls[n].arguments. PHPUnit declares intent before the action; node:test asserts on the recording afterwards.",
    },
    {
      question: "Why does supertest need the Express app exported from app.ts rather than server.ts?",
      options: [
        "server.ts files cannot be imported by tests under ESM rules",
        "supertest starts the exported app on an ephemeral port it manages itself — importing a file that calls listen() would bind your configured port on every test run",
        "supertest only supports apps created in files named app.ts",
        "Express apps stop accepting requests after listen() is called",
      ],
      answerIndex: 1,
      explain:
        "request(app) calls app.listen(0) itself, drives the request against that ephemeral port, then closes the server — so tests are parallel-safe and port-conflict-free. If the imported module called listen() as a side effect, every test file would try to occupy the same fixed port — the exact problem the app/server split removes.",
    },
    {
      question:
        "A test calls `service.invite('x')` (async) without await; the assertion inside its .then() would fail. What does the runner report?",
      options: [
        "The test fails with the assertion message",
        "The test passes — it returned before the promise settled, and the failure surfaces (if at all) as a stray unhandled rejection",
        "The runner blocks until all promises settle, then fails the test",
        "A TypeScript compile error prevents the run",
      ],
      answerIndex: 1,
      explain:
        "The runner can only judge what the test's returned promise reflects. An un-awaited promise is invisible to it, so the test 'passes' and the late failure is orphaned. Always await — and when the rejection is expected, assert it with await assert.rejects().",
    },
  ],
};

export default lesson;
