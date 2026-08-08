import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "testing",
  title: "Testing a TS SvelteKit App",
  part: "Patterns & Shipping",
  estMinutes: 12,
  summary:
    "Vitest runs TypeScript tests through the same Vite pipeline as your app, Testing Library renders Svelte 5 components, and load functions and actions are just typed functions you can call with mock events.",

  concept: `
Coming from PHPUnit, the shape of testing here will feel familiar: a runner,
\`expect\`-style assertions, arrange–act–assert. What's different is how little
configuration TypeScript costs you — and that the type checker itself is your
first, cheapest test layer.

### Layer 0: the type checker IS a test suite

Before any test runs, \`svelte-check\` (which type-checks \`.svelte\` files) and
\`tsc --noEmit\` (for plain \`.ts\`) verify every prop, every \`load\` return
type, every \`./$types\` contract across the whole app. Put both in CI as the
first job: they're faster than any test suite and catch the class of bug —
renamed field, changed return shape — that unit tests often miss. Everything
this course has typed compounds here.

### Vitest: Vite-native, TypeScript out of the box

**Vitest** is the default test runner for Vite projects, and SvelteKit *is* a
Vite project. Your tests run through the same transform pipeline as your app:
TypeScript, \`$lib\` aliases, and Svelte components all just work — no Babel,
no \`ts-jest\`, no parallel config to keep in sync. The API is Jest-compatible
(\`describe\`, \`it\`, \`expect\`), so knowledge transfers both ways.

Pure functions in \`$lib\` are the easy 80%: import, call, assert. Because the
test file is TypeScript, calling a function with the wrong argument shape is a
compile error — a whole category of "test the garbage input" tests PHP needs
simply can't be written here.

### Components: @testing-library/svelte

For components, \`@testing-library/svelte\` (v5+ supports Svelte 5 and runes)
renders into a jsdom DOM and queries it the way a user would:

\`\`\`ts
render(Greeting, { name: 'World' });   // props are type-checked
const user = userEvent.setup();
await user.click(screen.getByRole('button', { name: 'Greet' }));
expect(screen.getByText('Hello World')).toBeInTheDocument();
\`\`\`

Add the \`svelteTesting()\` plugin from \`@testing-library/svelte/vite\` to your
Vite config (it selects the browser build of Svelte and auto-cleans up between
tests), set the test environment to \`jsdom\`, and always \`await\` events —
\`fireEvent\` and \`userEvent\` return promises so Svelte can flush updates.

### Load functions and actions: just call them

This is the payoff of SvelteKit's design: a \`load\` function or an action is a
plain exported function. No HTTP server needed — build a mock event object and
call it. TypeScript keeps the mock honest: \`Parameters<typeof load>[0]\` is
the exact event type, so if the real function starts using \`locals\`, your
incomplete mock becomes a compile-time conversation rather than a mystery
failure.

### End-to-end: Playwright

Unit and component tests can't prove the full request cycle — form posts,
redirects, cookies, progressive enhancement with JS disabled. **Playwright**
drives a real browser against your actual built app (\`npx sv create\` offers
to set it up). E2E tests are slow and need maintenance, so keep a small set
covering the critical flows — signup, login, checkout — and let the type
checker, Vitest and Testing Library carry the volume underneath.
`,

  comparisons: [
    {
      label: "Unit-testing $lib code with Vitest",
      intro:
        "A test for a slugify helper. Both use Vitest's Jest-style API — but the TypeScript test file type-checks the code under test as it exercises it.",
      php: `// src/lib/slugify.test.js
import { expect, it } from 'vitest';
import { slugify } from './slugify';

it('hyphenates a title', () => {
  expect(slugify('Hello World!')).toBe('hello-world');
});

it('handles arrays too... right?', () => {
  // wrong input shape — the test itself is the first
  // place you find out, at runtime
  expect(slugify(['Hello', 'World'])).toBe('hello-world');
});`,
      ts: `// src/lib/slugify.test.ts
import { expect, it } from 'vitest';
import { slugify } from '$lib/slugify';

it('hyphenates a title', () => {
  expect(slugify('Hello World!')).toBe('hello-world');
});

it('strips leading and trailing separators', () => {
  expect(slugify('  Hello,  World!  ')).toBe('hello-world');
});

// slugify(['Hello', 'World'])
//        ^ compile error: string[] is not assignable to string.
// The "garbage input" test can't even be written — the compiler
// already proved it impossible for typed callers.`,
      note:
        "Vitest runs .ts test files through the same Vite pipeline as the app (including the $lib alias) with zero transpiler config — and the types eliminate a whole category of defensive tests.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Component test with @testing-library/svelte",
      intro:
        "Testing that a Greeting component shows its message after a click. render() mounts a real Svelte 5 component into jsdom; queries find elements the way a user would.",
      php: `// src/lib/Greeting.test.js
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import Greeting from './Greeting.svelte';

test('greets after click', async () => {
  // typo in the prop name — renders undefined, test
  // fails later with an unhelpful "text not found"
  render(Greeting, { nmae: 'World' });

  await fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Hello World')).toBeInTheDocument();
});`,
      ts: `// src/lib/Greeting.test.ts
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import Greeting from './Greeting.svelte';

test('greets after click', async () => {
  const user = userEvent.setup();

  // props are checked against the component's $props() type:
  // { nmae: 'World' } would be a compile error here
  render(Greeting, { name: 'World' });

  await user.click(screen.getByRole('button', { name: 'Greet' }));
  expect(screen.getByText('Hello World')).toBeInTheDocument();
});`,
      note:
        "@testing-library/svelte v5+ supports Svelte 5 components; render()'s props are typed from the component itself. Always await fireEvent/userEvent so Svelte flushes state updates before you assert.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Testing a load function with a mock event",
      intro:
        "A server load function is just an exported function — call it directly with a mock event instead of spinning up HTTP. The typed version keeps the mock in sync with what the function really uses.",
      php: `// src/routes/blog/[slug]/page.server.test.js
import { expect, it } from 'vitest';
import { load } from './+page.server';

it('loads the post for the slug', async () => {
  // an ad-hoc object: if load() starts reading
  // locals or url, this mock silently goes stale
  const result = await load({ params: { slug: 'hello-world' } });

  expect(result.post.slug).toBe('hello-world');
});`,
      ts: `// src/routes/blog/[slug]/page.server.test.ts
import { expect, it } from 'vitest';
import { load } from './+page.server';

it('loads the post for the slug', async () => {
  // Parameters<typeof load>[0] is the REAL event type from
  // ./$types — params is checked, and if load() starts using
  // event.locals, this cast site is where TS asks for it.
  const event = {
    params: { slug: 'hello-world' },
  } as Parameters<typeof load>[0];

  const result = await load(event);

  expect(result.post.slug).toBe('hello-world'); // result is typed too
});`,
      note:
        "load functions and actions need no HTTP server to test — they're typed functions. Deriving the mock's type from the function keeps tests honest as the implementation grows.",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A twenty-line test runner to demystify what Vitest does: register tests, run them, report. One test is deliberately broken — predict which, and what the summary line says.",
    code: `// A miniature Vitest: test(), expectEqual(), and a runner.
type TestCase = { name: string; fn: () => void };
const tests: TestCase[] = [];

function test(name: string, fn: () => void): void {
  tests.push({ name, fn });
}

function expectEqual<T>(actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error("expected " + e + " but got " + a);
  }
}

// ---- the code under test: a $lib helper and a load function ----
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// a load function is just a typed function — call it with a mock event
function load(event: { params: { slug: string } }) {
  return { post: { slug: event.params.slug, words: 1200 } };
}

// ---- the tests ----
test("slugify lowercases and hyphenates", () => {
  expectEqual(slugify("Hello World!"), "hello-world");
});

test("slugify strips edge separators", () => {
  expectEqual(slugify("  TypeScript & SvelteKit  "), "typescript-sveltekit");
});

test("load returns the post for the slug", () => {
  const result = load({ params: { slug: "typed-testing" } });
  expectEqual(result.post.slug, "typed-testing");
});

test("a deliberately broken expectation", () => {
  expectEqual(slugify("Hello"), "HELLO"); // slugify lowercases — this fails
});

// ---- the runner ----
let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log("PASS  " + t.name);
  } catch (e) {
    failed++;
    console.log("FAIL  " + t.name + " — " + (e as Error).message);
  }
}
console.log(passed + " passed, " + failed + " failed");`,
  },

  keyPoints: [
    "Cheapest test layer first: `svelte-check` + `tsc --noEmit` in CI verify every prop, `load` contract and `./$types` boundary before a single test runs.",
    "Vitest is Vite-native: tests use the same pipeline as the app — TypeScript, `$lib` aliases and Svelte components work with no extra transpiler config.",
    "Component tests use `@testing-library/svelte` (v5+ for Svelte 5): `render(Component, { props })` is type-checked, query via `screen`, and always `await` `fireEvent`/`userEvent`.",
    "Add the `svelteTesting()` plugin from `@testing-library/svelte/vite` and a `jsdom` environment so the browser build of Svelte is used and cleanup is automatic.",
    "`load` functions and actions are plain typed functions — test them by calling them with a mock event typed as `Parameters<typeof load>[0]`, no HTTP server required.",
    "Keep Playwright e2e for a handful of critical real-browser flows (forms, redirects, no-JS fallbacks); let types and Vitest carry the volume.",
  ],

  interview: [
    {
      q: "How do you structure testing for a SvelteKit app?",
      a: "As a pyramid with the type checker at the bottom: `svelte-check` and `tsc --noEmit` run first in CI, because they verify every component prop and `load`/action contract across the app in seconds. Above that, Vitest unit tests for `$lib` logic — it's Vite-native, so TypeScript and aliases need zero config. Then `@testing-library/svelte` for component behaviour: render, query like a user, fire events. `load` functions and actions I test as plain functions with typed mock events — no server needed. Finally a thin Playwright layer for true end-to-end flows like login and checkout. Coming from PHPUnit, the biggest shift is how much the compiler covers before any test executes.",
    },
    {
      q: "Why Vitest rather than Jest for SvelteKit?",
      a: "SvelteKit is a Vite project, and Vitest reuses the exact same Vite config and transform pipeline — so TypeScript, the `$lib` alias, `$env` modules and `.svelte` component imports behave identically in tests and in the app. With Jest I'd maintain a parallel Babel/ts-jest setup and mappings that drift out of sync. The assertion API is Jest-compatible anyway (`describe`/`it`/`expect`), so there's no knowledge lost, and it's fast because it leans on Vite's on-demand transforms.",
    },
    {
      q: "How do you test a server load function without spinning up a server?",
      a: "A `load` function is just an exported, typed function — SvelteKit calls it with an event object, and in a test I can do the same. I build a minimal mock and cast it with `as Parameters<typeof load>[0]`, which is the real event type derived from `./$types`. That keeps the mock honest: if the function starts reading `event.locals` or `event.url`, the types tell me my mock needs updating. Dependencies like the database live behind `locals` or `$lib/server` modules, so they're straightforward to stub. It's the same instinct as testing a Laravel controller method directly instead of through an HTTP kernel — but here the event contract is machine-checked.",
    },
  ],

  quiz: [
    {
      question: "Why is Vitest the natural test runner for SvelteKit?",
      options: [
        "It's the only runner that can execute TypeScript",
        "It reuses the project's Vite pipeline, so TS, $lib aliases and Svelte components work in tests with no extra config",
        "It includes a built-in browser for e2e testing",
        "SvelteKit refuses to build without it",
      ],
      answerIndex: 1,
      explain:
        "SvelteKit is built on Vite, and Vitest runs tests through the same transforms as the app itself. Jest can be made to work, but needs a parallel transpiler and alias config that must be kept in sync by hand.",
    },
    {
      question: "In a component test, why must you `await fireEvent.click(button)`?",
      options: [
        "fireEvent is network-based",
        "jsdom requires all DOM APIs to be awaited",
        "fireEvent returns a promise that resolves after Svelte has flushed state updates — assert too early and the DOM is stale",
        "It's optional; the await is stylistic",
      ],
      answerIndex: 2,
      explain:
        "Svelte batches reactive updates. @testing-library/svelte's fireEvent (and userEvent) return promises that settle once the component has re-rendered, so awaiting them guarantees your assertions see the updated DOM.",
    },
    {
      question: "What's the recommended way to type a mock event when testing a load function?",
      options: [
        "as any — it's only a test",
        "Write the event interface by hand in the test file",
        "Import RequestEvent from @sveltejs/kit and fill in all 15 fields",
        "Cast the minimal mock as Parameters<typeof load>[0], deriving the exact event type from the function itself",
      ],
      answerIndex: 3,
      explain:
        "Parameters<typeof load>[0] is the precise, generated event type for that route. The mock stays minimal, but when the load function starts using new event fields, the derived type is where TypeScript points you to update the test.",
    },
    {
      question: "What role do svelte-check and `tsc --noEmit` play in CI?",
      options: [
        "They run the unit tests in parallel",
        "They're the cheapest verification layer: whole-app type checking that catches contract breakage before any test executes",
        "They generate the ./$types files",
        "They replace the need for e2e tests",
      ],
      answerIndex: 1,
      explain:
        "svelte-check type-checks .svelte files (props, markup expressions) and tsc covers plain .ts. Together they verify every typed contract in the codebase in seconds — a renamed data field fails CI even if no test exercised it. ($types generation is done by the sync step, not by these checkers.)",
    },
  ],
};

export default lesson;
