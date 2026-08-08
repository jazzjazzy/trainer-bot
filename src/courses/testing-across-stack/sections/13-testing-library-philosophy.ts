import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "testing-library-philosophy",
  title: "Testing Library: Test Behaviour, Not Implementation",
  part: "Components & Python",
  estMinutes: 10,
  summary:
    "Testing Library's rule — query the rendered page the way a user perceives it, by role and label, never by CSS class or component internals — is what makes component tests survive refactors.",

  concept: `
Testing Library is built around one sentence, printed at the top of its docs:
**"The more your tests resemble the way your software is used, the more
confidence they give you."** A user doesn't know your component has a
\`.form-error.text-red\` div or a \`handleSubmit\` method. They see a button
labelled *Sign in* and an error message that gets announced. So that —
and only that — is what the test is allowed to touch.

### One core, thin wrappers

The library is a family. \`@testing-library/dom\` holds every query and
assertion helper; \`@testing-library/svelte\`, \`@testing-library/react\`,
\`@testing-library/vue\` are thin wrappers that only know how to *render* their
framework's components into a DOM. The query API is **identical** across all
of them. You know Svelte 5 from the previous course, so the examples here use
\`@testing-library/svelte\` — but when a job interview is about React, every
line except \`render(...)\` transfers verbatim. Say that in the interview;
it's exactly the kind of framework-agnostic understanding panels reward.

\`\`\`ts
import { render, screen } from "@testing-library/svelte";
import LoginForm from "./LoginForm.svelte";

it("shows the sign-in button", () => {
  render(LoginForm);
  expect(
    screen.getByRole("button", { name: "Sign in" }),
  ).toBeInTheDocument();
});
\`\`\`

\`render\` mounts the component into a document; \`screen\` exposes the queries
against it; \`toBeInTheDocument\` comes from **jest-dom**, a matcher package
that speaks DOM (\`toHaveTextContent\`, \`toBeDisabled\`, \`toBeVisible\`, ...).

### The query priority ladder

Not all queries are equal. The docs define a priority order, and it's really
an accessibility argument:

1. **\`getByRole\`** — how assistive technology sees the page:
   \`getByRole("button", { name: "Sign in" })\`, \`getByRole("alert")\`,
   \`getByRole("heading", { name: "Welcome" })\`. If you can't find an element
   by role, a screen-reader user probably can't either — that's a product
   bug your test just caught for free.
2. **\`getByLabelText\`** — form fields, found the way users find them: by
   their label.
3. **\`getByText\`** — non-interactive content.
4. **\`getByTestId\`** — the escape hatch. A \`data-testid\` attribute is
   invisible to users, so a test built on it proves nothing about usability.
   Last resort only.

What's *not* on the ladder at all: CSS classes, tag structure, \`innerHTML\`,
component instance internals. Those are implementation. A designer renaming
\`btn-primary\` to \`button-cta\` must not break a single test.

### Why this beats the PHP-era habit

The old reflex — you've written it — is asserting on the HTML string:
\`assertStringContainsString('<div class="err">', $html)\`. That test is
**brittle** (any markup change breaks it) and **weak** (it passes even if the
error div is hidden behind \`display: none\`). Role-based queries invert both
properties: they survive any refactor that keeps the behaviour, and they fail
on any change that breaks what the user perceives. That's the definition of
a good test.
`,

  comparisons: [
    {
      label: "Class-selector test vs role-based test",
      intro:
        "Both tests check that a login form shows its validation error. A designer then renames the CSS classes and wraps the message in an icon span — behaviour unchanged.",
      php: `// breaks the moment the markup is touched
it("shows the error", () => {
  const { container } = render(LoginForm, {
    props: { error: "Invalid email" },
  });

  const div = container.querySelector(
    ".form-error.text-red",
  );
  expect(div.innerHTML).toBe("Invalid email");
  // fails after the redesign: selector matches
  // nothing, innerHTML now has an <svg> in it
});`,
      ts: `// survives any refactor that keeps the behaviour
import { render, screen } from "@testing-library/svelte";
import LoginForm from "./LoginForm.svelte";

it("announces the error to the user", () => {
  render(LoginForm, {
    props: { error: "Invalid email" },
  });

  expect(screen.getByRole("alert"))
    .toHaveTextContent("Invalid email");
});`,
      note: "role='alert' is what a screen reader announces — the test asserts what users perceive, so renamed classes and added icons can't break it, but deleting the error can.",
      leftLang: "js",
    },
    {
      label: "Asserting on an HTML string vs querying a rendered DOM",
      intro:
        "The 25-year habit: render to a string and grep it. The modern test renders to a real DOM and asks it questions the way a user would.",
      php: `<?php
// ProfileViewTest.php — string-grepping markup
public function testShowsWelcome(): void
{
    $html = (new ProfileView($this->user))->render();

    $this->assertStringContainsString(
        '<h2 class="welcome-hdr">Welcome, Ada</h2>',
        $html
    );
    // passes even if CSS hides the heading;
    // fails if the class or tag ever changes
}`,
      ts: `// Profile.test.ts — ask the DOM what users see
import { render, screen } from "@testing-library/svelte";
import Profile from "./Profile.svelte";

it("greets the user by name", () => {
  render(Profile, { props: { user: { name: "Ada" } } });

  expect(
    screen.getByRole("heading", { name: "Welcome, Ada" }),
  ).toBeInTheDocument();
});`,
      note: "getByRole('heading', { name }) matches any h1–h6 with that accessible name — tag level, classes, and attribute order are free to change.",
    },
    {
      label: "testid-first vs the priority ladder",
      intro:
        "Both tests find a signup form's controls. One tattoos test hooks onto everything; the other uses the queries users effectively 'use' themselves.",
      php: `// data-testid as the FIRST resort
it("renders the form", () => {
  render(SignupForm);
  expect(screen.getByTestId("email-input"))
    .toBeTruthy();
  expect(screen.getByTestId("submit-btn"))
    .toBeTruthy();
  // proves the testids exist — not that a human
  // could find, read, or use either control
});`,
      ts: `// the ladder: role first, label for fields
it("renders a usable form", () => {
  render(SignupForm);

  expect(screen.getByLabelText("Email address"))
    .toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Create account" }),
  ).toBeEnabled();
  // fails if the input loses its label or the
  // button loses its accessible name — real bugs
});`,
      note: "getByTestId is legitimate as a last resort (no role, no label, no stable text) — the smell is reaching for it first.",
      leftLang: "js",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "getByRole in miniature: a tiny 'DOM' as an array of nodes, one query by CSS class and one by role+name, then the same tests run against the original markup and a redesigned version. Predict which of the four tests fail.",
    code: `// ── mini test harness ──────────────────────────────────────
function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(
          \`expected \${JSON.stringify(expected)} but got \${JSON.stringify(actual)}\`,
        );
      }
    },
  };
}
const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void) {
  tests.push([name, fn]);
}
function run() {
  for (const [name, fn] of tests) {
    try {
      fn();
      console.log("PASS " + name);
    } catch (e) {
      console.log("FAIL " + name + ": " + (e as Error).message);
    }
  }
}

// ── a miniature rendered DOM ───────────────────────────────
interface DomNode {
  role: string; // what assistive tech perceives
  name: string; // the accessible name
  className: string; // implementation detail
}

// v1 markup
const original: DomNode[] = [
  { role: "textbox", name: "Email", className: "input email-field" },
  { role: "button", name: "Sign in", className: "btn btn-primary" },
];

// after the redesign: classes renamed, order changed —
// but roles and names (the BEHAVIOUR) are identical
const refactored: DomNode[] = [
  { role: "button", name: "Sign in", className: "button-cta" },
  { role: "textbox", name: "Email", className: "form-control" },
];

// ── two ways to query it ───────────────────────────────────
function queryByClass(dom: DomNode[], cls: string): DomNode | null {
  return dom.find((n) => n.className === cls) ?? null;
}

function getByRole(
  dom: DomNode[],
  role: string,
  opts: { name: string },
): DomNode {
  const hits = dom.filter((n) => n.role === role && n.name === opts.name);
  if (hits.length === 0) {
    throw new Error(\`no element with role "\${role}" and name "\${opts.name}"\`);
  }
  if (hits.length > 1) throw new Error(\`multiple elements match "\${role}"\`);
  return hits[0];
}

// ── the same two tests, against both versions ──────────────
const versions: Array<[string, DomNode[]]> = [
  ["original", original],
  ["refactored", refactored],
];

for (const [label, dom] of versions) {
  test(label + ": class selector finds the button", () => {
    const btn = queryByClass(dom, "btn btn-primary");
    if (btn === null) throw new Error('".btn.btn-primary" matched nothing');
    expect(btn.name).toBe("Sign in");
  });

  test(label + ": getByRole finds the button", () => {
    const btn = getByRole(dom, "button", { name: "Sign in" });
    expect(btn.name).toBe("Sign in");
  });
}

run();

// The refactor broke the class-based test but not the role-based
// one — and no behaviour changed. That asymmetry is the whole
// Testing Library philosophy.`,
  },

  keyPoints: [
    "Guiding principle: the more a test resembles real usage, the more confidence it gives — query what users perceive, never internals.",
    "@testing-library/dom is the core; svelte/react/vue wrappers only change `render()` — the query API is identical across frameworks.",
    "Priority ladder: `getByRole` first (with accessible name), then `getByLabelText`/`getByText`, with `getByTestId` strictly last resort.",
    "CSS classes, innerHTML, and component internals are off-limits — a design refactor must never break a behavioural test.",
    "jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`, `toBeDisabled`) make DOM assertions readable.",
    "Role-based queries double as accessibility checks: if getByRole can't find it, a screen reader probably can't either.",
  ],

  interview: [
    {
      q: "What is Testing Library's core philosophy, and how does it change what a component test looks like?",
      a: "The guiding principle is 'the more your tests resemble the way your software is used, the more confidence they give you.' Practically, the test only touches what a user (or screen reader) perceives: it finds a button by its role and accessible name, a field by its label, a message by its alert role — never by CSS class, DOM structure, or component internals. That gives two properties at once: refactors that preserve behaviour can't break tests, and changes that break what users experience always do. It also bakes in an accessibility check, because getByRole queries the accessibility tree. Compared to the old habit of asserting substrings of rendered HTML, it's both less brittle and more meaningful.",
    },
    {
      q: "You learned component testing with Svelte — how does that transfer to a React job?",
      a: "Almost entirely, and I'd say so explicitly: Testing Library is one core package, @testing-library/dom, with thin per-framework wrappers. @testing-library/svelte and @testing-library/react share the identical query API — getByRole, getByLabelText, findBy, queryBy — and the same user-event package for interactions. The only line that changes is render(): the Svelte wrapper mounts a Svelte component, the React one calls its renderer. The philosophy, the query priority, the async patterns, and the jest-dom matchers are framework-agnostic, which is precisely the point of testing behaviour instead of implementation — the framework is an implementation detail too.",
    },
    {
      q: "When is getByTestId acceptable, and why is it ranked last?",
      a: "It's ranked last because a data-testid is invisible to users — a test built on it proves the attribute exists, not that anyone can find or use the element. It also silently excuses inaccessible markup: if the only way to locate a button is a testid, that button probably has no accessible name, which is a real defect the test is now papering over. That said, it's a legitimate escape hatch for elements with no role, no label, and no stable text — a dynamic container, a third-party widget wrapper, highly repeated structures. My rule: reach the bottom of the ladder before using it, and treat every getByTestId in review as a prompt to ask whether the markup itself should improve.",
    },
  ],

  quiz: [
    {
      question:
        "According to Testing Library's query priority, what is the FIRST choice for finding a submit button?",
      options: [
        "container.querySelector('.btn-primary')",
        "screen.getByTestId('submit-btn')",
        "screen.getByRole('button', { name: 'Sign in' })",
        "screen.getByText('Sign in')",
      ],
      answerIndex: 2,
      explain:
        "getByRole with the accessible name is top of the ladder: it queries the accessibility tree, exactly how assistive technology perceives the page. getByText is for non-interactive content, testid is the last resort, and CSS selectors aren't on the ladder at all.",
    },
    {
      question:
        "A designer renames every CSS class in a component without changing behaviour. What should happen to a well-written Testing Library suite?",
      options: [
        "Every test fails until selectors are updated",
        "Nothing — the tests query roles, labels, and text, none of which changed",
        "Only snapshot tests keep passing",
        "The tests must be regenerated with a codemod",
      ],
      answerIndex: 1,
      explain:
        "Behavioural tests are coupled to what users perceive (roles, accessible names, visible text), not to implementation details like class names. Surviving this exact refactor is the point of the philosophy.",
    },
    {
      question:
        "What is the relationship between @testing-library/dom and @testing-library/svelte?",
      options: [
        "They are competing libraries with different query APIs",
        "svelte re-implements the dom package with Svelte-specific queries",
        "dom is the core with all queries; svelte is a thin wrapper that adds Svelte rendering, sharing the identical query API",
        "dom is deprecated in favour of the framework packages",
      ],
      answerIndex: 2,
      explain:
        "All queries live in @testing-library/dom. Framework packages (svelte, react, vue) only know how to render their components into a document — everything after render() is the same code, which is why skills transfer across frameworks.",
    },
  ],
};

export default lesson;
