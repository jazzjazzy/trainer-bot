import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "module-mocks-and-di",
  title: "vi.mock vs Dependency Injection",
  part: "Vitest Fundamentals",
  estMinutes: 12,
  summary:
    "vi.mock can replace any imported module — but if you need it everywhere, your design is fighting you; inject dependencies for your own code and save module mocks for boundaries you don't control.",

  concept: `
Sometimes the function you want to test imports its collaborators directly:
it calls \`findUser\` from \`./db\`, which talks to a real database. You can't
pass a fake in — there's no parameter to pass it through. Vitest's answer is
**module mocking**: replace the whole module before the test file even
imports it.

### \`vi.mock\` with a factory

\`\`\`ts
import { expect, it, vi } from "vitest";
import { buildReport } from "./report";
import { findUser } from "./db";

vi.mock("./db", () => ({
  findUser: vi.fn().mockResolvedValue({ id: 1, name: "Ada", plan: "pro" }),
}));

it("formats the report line", async () => {
  expect(await buildReport(1)).toBe("#1 Ada (pro)");
  expect(vi.mocked(findUser)).toHaveBeenCalledWith(1);
});
\`\`\`

The factory (second argument) returns what the module's exports should be.
Every file that imports \`./db\` in this test file's world now gets your fake.
\`vi.mocked(findUser)\` is a typed cast: \`findUser\` still has its real
signature to the compiler, so \`vi.mocked()\` wraps it in the mock type and
gives you \`.mockResolvedValue\`, \`.mock.calls\` and friends without \`as any\`.
There's also a lighter option: \`vi.mock("./db", { spy: true })\` keeps the
real implementations but wraps every export in a spy, so you can assert calls
without changing behaviour.

### Hoisting: why the call jumps to the top

\`vi.mock\` looks like a normal function call, but it isn't executed where you
wrote it. Vitest rewrites the file so every \`vi.mock\` call runs **before all
imports** — otherwise \`./report\` would import the *real* \`./db\` before your
mock existed. That has a famous consequence: the factory cannot reference
variables declared in the file, because at factory time those lines haven't
run yet. The escape hatch is \`vi.hoisted\`, which hoists your setup code
along with the mock:

\`\`\`ts
const mocks = vi.hoisted(() => ({ findUser: vi.fn() }));

vi.mock("./db", () => ({ findUser: mocks.findUser }));

// later, per test:
mocks.findUser.mockResolvedValue({ id: 2, name: "Grace", plan: "free" });
\`\`\`

If you ever used Mockery's \`overload:\` or PHPUnit's class-level mocking to
stub a hard-coded \`new\` inside legacy PHP, this is the same move: powerful,
magic, and a little smelly.

### The honest counterpoint

Here's the part interviewers actually want to hear. If your test file opens
with five \`vi.mock\` calls, the tests aren't telling you the code works —
they're telling you the code is **welded to its collaborators**. Module mocks
are stringly-typed (a path that silently breaks when the file moves), they
reach around the type system, and they couple the test to the module graph
instead of to behaviour. Twenty-five years of PHP already taught you the
cleaner fix: **constructor injection**. Accept the dependency as a parameter
— a function, an interface, a small object — and the test just passes a fake.
No hoisting rules, no magic, full type checking, and the production code gets
more flexible for free.

### The decision rule

- **Your own code** → design for injection. A \`UserRepo\` interface with a
  fake in tests beats \`vi.mock("./db")\` every time.
- **Boundaries you don't control** → \`vi.mock\`. Node built-ins
  (\`node:fs/promises\`), a vendor SDK (Stripe, AWS), a heavyweight client you
  can't wrap yet. You can't add a constructor parameter to \`node:fs\`.

Being able to argue *both* sides — "mocking everything is a design smell,
but module mocks earn their keep at real boundaries" — is exactly the
senior-level answer a hiring panel is fishing for.
`,

  comparisons: [
    {
      label: "Mock-everything vs a fake passed in",
      intro:
        "The same report logic tested two ways: module-mocking every collaborator, versus injecting a repository the test can fake with a plain object.",
      php: `// report.test.ts — vi.mock for every collaborator
import { expect, it, vi } from "vitest";
import { buildReport } from "./report";
import { findUser } from "./db";

vi.mock("./db", () => ({
  findUser: vi.fn().mockResolvedValue(
    { id: 1, name: "Ada", plan: "pro" },
  ),
}));
vi.mock("./mailer", () => ({ sendMail: vi.fn() }));
vi.mock("./logger", () => ({ log: vi.fn() }));

it("builds a report line", async () => {
  expect(await buildReport(1)).toBe("#1 Ada (pro)");
  expect(vi.mocked(findUser)).toHaveBeenCalledWith(1);
});`,
      ts: `// report.ts — the dependency is a constructor parameter
interface UserRepo {
  findUser(id: number): Promise<User>;
}

export class ReportService {
  constructor(private repo: UserRepo) {}
  async buildReport(id: number): Promise<string> {
    const u = await this.repo.findUser(id);
    return \`#\${u.id} \${u.name} (\${u.plan})\`;
  }
}

// report.test.ts — a plain fake, zero mocking machinery
it("builds a report line", async () => {
  const fakeRepo: UserRepo = {
    findUser: async () => ({ id: 1, name: "Ada", plan: "pro" }),
  };
  const svc = new ReportService(fakeRepo);
  expect(await svc.buildReport(1)).toBe("#1 Ada (pro)");
});`,
      note: "The right side is shorter, fully type-checked, and survives the db module being renamed — vi.mock('./db') breaks silently the day someone moves the file.",
      leftLang: "ts",
    },
    {
      label: "The hoisting trap and vi.hoisted",
      intro:
        "Both tests define a fake before mocking. The left one crashes at runtime because vi.mock is hoisted above the const; the right one hoists the setup too.",
      php: `// looks fine, crashes: "Cannot access 'fakeUser'
// before initialization"
const fakeUser = { id: 1, name: "Ada" };

vi.mock("./db", () => ({
  // vi.mock runs BEFORE the const above —
  // fakeUser does not exist yet at factory time
  findUser: vi.fn().mockResolvedValue(fakeUser),
}));`,
      ts: `import { expect, it, vi } from "vitest";
import { findUser } from "./db";

// vi.hoisted runs before imports, alongside vi.mock
const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
}));

vi.mock("./db", () => ({ findUser: mocks.findUser }));

it("returns the stubbed user", async () => {
  mocks.findUser.mockResolvedValue({ id: 1, name: "Ada" });
  expect(await findUser(1)).toEqual({ id: 1, name: "Ada" });
  expect(findUser).toBe(mocks.findUser); // same function
});`,
      note: "Vitest rewrites the file so vi.mock executes before all imports; vi.hoisted moves your setup into that early phase so the factory can reference it.",
      leftLang: "ts",
    },
    {
      label: "Where vi.mock earns its keep: boundaries you don't own",
      intro:
        "Testing config-loading code that reads from disk. The PHP habit touches the real filesystem; the modern test mocks the node:fs boundary — a module you cannot inject into.",
      php: `<?php
// ConfigLoaderTest.php — touches the real disk
public function testLoadsConfig(): void
{
    file_put_contents('/tmp/app.json', '{"debug":true}');

    $config = (new ConfigLoader())->load('/tmp/app.json');

    $this->assertTrue($config['debug']);
    unlink('/tmp/app.json'); // cleanup… hopefully
}`,
      ts: `// config.test.ts — mock the built-in, not your own code
import { expect, it, vi } from "vitest";
import { loadConfig } from "./config";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue('{"debug":true}'),
}));

it("parses the config file", async () => {
  const config = await loadConfig("/etc/app.json");
  expect(config.debug).toBe(true);
  // no disk touched, no cleanup, runs anywhere
});`,
      note: "You can't add a constructor parameter to node:fs — a built-in or vendor SDK is exactly the boundary module mocks were made for.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The DI refactor in miniature: buildReport takes its fetchUser dependency as a parameter, so the test passes a plain fake async function — no vi.mock, no hoisting rules. The ~20 lines of harness at the top are what Vitest's expect/test give you for free.",
    code: `// ── mini test harness (the part vitest does for you) ──────────
function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(
          \`expected \${JSON.stringify(expected)} but got \${JSON.stringify(actual)}\`,
        );
      }
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(\`expected \${b} but got \${a}\`);
    },
  };
}
const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>) {
  tests.push([name, fn]);
}
async function run() {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log("PASS " + name);
    } catch (e) {
      console.log("FAIL " + name + ": " + (e as Error).message);
    }
  }
}

// ── production code: the dependency is a PARAMETER ────────────
interface User {
  id: number;
  name: string;
  plan: "free" | "pro";
}
type FetchUser = (id: number) => Promise<User>;

async function buildReport(fetchUser: FetchUser, ids: number[]) {
  const lines: string[] = [];
  for (const id of ids) {
    const u = await fetchUser(id);
    lines.push(\`#\${u.id} \${u.name} (\${u.plan})\`);
  }
  return lines;
}

// ── the tests: a plain fake, no mocking library needed ────────
const fakeUsers: Record<number, User> = {
  1: { id: 1, name: "Ada", plan: "pro" },
  2: { id: 2, name: "Linus", plan: "free" },
};
let calls = 0;
const fakeFetchUser: FetchUser = async (id) => {
  calls++;
  return fakeUsers[id];
};

test("formats one line per user", async () => {
  const report = await buildReport(fakeFetchUser, [1, 2]);
  expect(report).toEqual(["#1 Ada (pro)", "#2 Linus (free)"]);
});

test("hits the data source once per id", async () => {
  calls = 0;
  await buildReport(fakeFetchUser, [1, 2, 1]);
  expect(calls).toBe(3);
});

await run();

// Try it: make buildReport cache repeat ids so the second
// test expects 2 calls — the fake's counter catches it.`,
  },

  keyPoints: [
    "`vi.mock('./db', factory)` replaces a module's exports for the whole test file — the factory returns the fake exports.",
    "`vi.mock` calls are hoisted above all imports, so factories can't reference file-level variables; wrap shared setup in `vi.hoisted(() => ...)`.",
    "`vi.mocked(fn)` is the typed view of a mocked import — mock methods like `.mockResolvedValue` without casting.",
    "`vi.mock('./db', { spy: true })` keeps real implementations but records calls — assertion without substitution.",
    "A test file full of vi.mock calls is a design smell: for your own code, inject the dependency and pass a plain fake.",
    "Decision rule: DI for code you own; module mocks for boundaries you don't control (node built-ins, vendor SDKs).",
  ],

  interview: [
    {
      q: "When do you reach for vi.mock versus dependency injection?",
      a: "For code I own, I prefer dependency injection: accept the collaborator as a constructor or function parameter typed by an interface, and pass a plain fake in tests. That's type-safe, has no hoisting magic, and improves the production design. I reserve `vi.mock` for boundaries I don't control — node built-ins like `node:fs`, vendor SDKs, heavyweight clients — where there's no seam to inject through. My rule of thumb is that a pile of vi.mock calls at the top of a test file is feedback about the design, not a testing technique: the code is welded to its collaborators. It's the same lesson PHP taught with constructor injection and container-managed services — Mockery's `overload:` existed for legacy code, not as the default.",
    },
    {
      q: "Why does a vi.mock factory throw when it references a variable defined earlier in the file?",
      a: "Because `vi.mock` is hoisted. Vitest rewrites the test file so every `vi.mock` call executes before all static imports — that's the only way the module under test can receive the fake instead of the real module. So even though the variable is written above the `vi.mock` call, at factory-execution time that line hasn't run yet and you get a reference error. The fix is `vi.hoisted(() => ...)`: its callback is hoisted into the same early phase, so anything it returns — typically an object of `vi.fn()`s — is safely available inside the factory and in the tests afterwards.",
    },
    {
      q: "Isn't mocking your database module exactly what makes a unit test fast? What's the downside?",
      a: "Speed isn't the issue — a fake injected through a constructor is exactly as fast. The downsides of the module mock are structural: it's addressed by a string path that breaks silently on refactor, it bypasses the type system unless you remember `vi.mocked`, and it couples the test to the import graph rather than to behaviour, so tests break when internals move even though behaviour didn't change. Injection gives the same isolation with compile-time checking and a better production design. The strong answer in an interview is to acknowledge both: mock-everything is a smell, but module mocks are the right tool at genuine third-party boundaries.",
    },
  ],

  quiz: [
    {
      question:
        "What does Vitest do with a vi.mock('./db', factory) call written in the middle of a test file?",
      options: [
        "Executes it exactly where it's written, mocking only later imports",
        "Hoists it above all imports so every import of './db' in the file gets the fake",
        "Defers it until the first test that touches './db' runs",
        "Ignores it unless the file also calls vi.hoisted",
      ],
      answerIndex: 1,
      explain:
        "vi.mock is hoisted to run before all static imports — otherwise the module under test would already have grabbed the real './db'. That's also why the factory can't see file-level variables (use vi.hoisted for those). vi.doMock is the non-hoisted variant that only affects subsequent dynamic imports.",
    },
    {
      question:
        "Your test file starts with six vi.mock calls to mock the code's own service modules. What's the senior-level take?",
      options: [
        "Perfect — every unit test should mock every import",
        "Fine, but switch them all to { spy: true } for speed",
        "It's a design smell: those services should be injected so tests can pass plain fakes",
        "Replace vi.mock with vi.doMock to avoid the hoisting overhead",
      ],
      answerIndex: 2,
      explain:
        "Needing to module-mock your own collaborators everywhere means the code is welded to them. Constructor/function injection gives the same isolation with type safety and no path-string coupling. Module mocks belong at boundaries you can't inject into — built-ins and vendor SDKs.",
    },
    {
      question: "What does vi.mocked(findUser) actually do?",
      options: [
        "Creates a new mock that shadows the real findUser",
        "Returns findUser with its type widened to the mock type, exposing .mockResolvedValue etc.",
        "Verifies findUser was mocked and throws if it wasn't",
        "Restores findUser to its original implementation",
      ],
      answerIndex: 1,
      explain:
        "vi.mocked is a type helper: at runtime it returns the same function, but typed as a mock so TypeScript lets you call mock methods and inspect .mock.calls without casting. The actual mocking was done by vi.mock — vi.mocked just fixes the types.",
    },
  ],
};

export default lesson;
