import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "component-test-patterns",
  title: "Component Test Patterns",
  part: "Components & Python",
  estMinutes: 12,
  summary:
    "The four patterns real component suites run on — validation via findByRole('alert'), loading-then-data with a mocked fetch, absence via queryBy, and callback props asserted with vi.fn() — plus why snapshots are not a substitute.",

  concept: `
Queries and user-event are the vocabulary; this section is the phrasebook —
the handful of patterns that cover most of what a production component suite
does. Examples use \`@testing-library/svelte\`; remember that \`render()\` is
the only line that would change for React or Vue.

### Pattern 1: validation messages via \`findByRole("alert")\`

Submit an invalid form, then wait for the message to *appear* — validation is
often async (a tick, a debounce, a server round trip), so \`findBy\` is the
right variant, and \`role="alert"\` is how the message should reach users:

\`\`\`ts
const user = userEvent.setup();
render(SignupForm);

await user.click(screen.getByRole("button", { name: "Sign up" }));

expect(await screen.findByRole("alert"))
  .toHaveTextContent("Email is required");
\`\`\`

### Pattern 2: loading → data with a mocked fetch

Components that fetch have three observable moments: spinner up, data in,
spinner gone. Mock the network boundary (a vendor/global you don't control —
the module-mock rule), then assert all three:

\`\`\`ts
vi.spyOn(globalThis, "fetch").mockResolvedValue(
  new Response(JSON.stringify([{ id: 1, name: "Ada" }])),
);

render(UserList);
expect(screen.getByText("Loading…")).toBeInTheDocument(); // now
expect(await screen.findByRole("listitem")).toHaveTextContent("Ada"); // soon
expect(screen.queryByText("Loading…")).toBeNull(); // gone
\`\`\`

That one test uses all three query variants for exactly their intended jobs.

### Pattern 3: asserting something is GONE

\`queryBy\` + \`toBeNull()\` (or jest-dom's \`.not.toBeInTheDocument()\`).
Dismissing a dialog, deleting a row, hiding a spinner — the pattern is
always: perform the action, wait for the new state, then \`queryBy\` the
thing that must have vanished.

### Pattern 4: callback props with \`vi.fn()\`

Components report upward through callback props (Svelte 5 made this the
norm — no more event dispatcher). The test passes a \`vi.fn()\` and asserts
the component *called it with the right payload*. This is the component-test
equivalent of a Mockery \`shouldReceive(...)->with(...)\`:

\`\`\`ts
const onSignup = vi.fn();
render(SignupForm, { props: { onSignup } });

await user.type(screen.getByLabelText("Email"), "ada@example.com");
await user.click(screen.getByRole("button", { name: "Sign up" }));

expect(onSignup).toHaveBeenCalledWith("ada@example.com");
expect(onSignup).toHaveBeenCalledTimes(1);
\`\`\`

You're testing the component's **contract**: given this input, it emits this
output. Parent components are not rendered; they're represented by the fake.

### Anti-pattern: the wall-of-snapshot test

\`expect(container).toMatchSnapshot()\` on a whole component feels like
coverage — one line, everything "asserted". In practice it asserts nothing
*specific*: the snapshot fails on every harmless markup change, nobody reads
a 300-line diff, and within weeks the team reflexively regenerates snapshots
on every failure — at which point the test guards nothing. Snapshots have
niches (small, stable serialisations — an error object, a generated class
string). As a substitute for behavioural assertions on components, they're
the modern equivalent of asserting an entire rendered PHP template against a
fixture file — you probably lived through why that fails.
`,

  comparisons: [
    {
      label: "Wall-of-snapshot vs targeted behavioural assertions",
      intro:
        "Both test a signup form. One snapshots the entire DOM; the other asserts the behaviour that must survive: valid input enables submission and the value is reported upward.",
      php: `// renders… something. Asserts… everything and nothing.
it("renders", () => {
  const { container } = render(SignupForm);
  expect(container).toMatchSnapshot();
});

// six weeks later: 47 snapshot failures after a
// CSS refactor. Everyone runs \`vitest -u\` without
// reading the diffs. The suite now guards nothing.`,
      ts: `// asserts the CONTRACT, ignores the markup
it("reports the email upward on submit", async () => {
  const user = userEvent.setup();
  const onSignup = vi.fn();
  render(SignupForm, { props: { onSignup } });

  await user.type(
    screen.getByLabelText("Email"),
    "ada@example.com",
  );
  await user.click(
    screen.getByRole("button", { name: "Sign up" }),
  );

  expect(onSignup)
    .toHaveBeenCalledWith("ada@example.com");
});`,
      note: "A snapshot fails on every harmless change and no specific one; the behavioural test fails only when the contract breaks — which is the failure you actually want to hear about.",
      leftLang: "js",
    },
    {
      label: "Loading-then-data: sleep-and-grope vs findBy",
      intro:
        "A list component fetches users on mount. The left test guesses how long the network takes and gropes the DOM with CSS; the right one mocks fetch and awaits appearance.",
      php: `it("shows users", async () => {
  render(UserList); // hits the REAL fetch…

  // guess how long the network takes:
  await new Promise((r) => setTimeout(r, 1000));

  expect(document.querySelector(".user-row"))
    .not.toBe(null);
  // slow every run, flaky on CI, and green even
  // if the row is an empty shell
});`,
      ts: `it("shows a spinner, then the users", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify([{ id: 1, name: "Ada" }])),
  );

  render(UserList);

  expect(screen.getByText("Loading…"))
    .toBeInTheDocument();
  expect(await screen.findByRole("listitem"))
    .toHaveTextContent("Ada");
  expect(screen.queryByText("Loading…")).toBeNull();
});`,
      note: "getBy for the now, findBy for the soon, queryBy for the gone — one test, all three variants, zero sleeps, and the network boundary mocked instead of trusted.",
      leftLang: "js",
    },
    {
      label: "Callback props: poking internals vs vi.fn()",
      intro:
        "Asserting a form tells its parent about a submission. One test reaches into the component instance; the other treats the component as a black box with a contract.",
      php: `// welded to framework internals
it("submits", async () => {
  const { component } = render(SignupForm);

  // dig out the handler and call it directly:
  component.handleSubmit(
    { email: "ada@example.com" },
  );

  // breaks on any rename or framework upgrade,
  // and never proves a USER could trigger it
});`,
      ts: `// the contract: user acts, component reports up
it("submits", async () => {
  const user = userEvent.setup();
  const onSignup = vi.fn();
  render(SignupForm, { props: { onSignup } });

  await user.type(
    screen.getByLabelText("Email"),
    "ada@example.com",
  );
  await user.click(
    screen.getByRole("button", { name: "Sign up" }),
  );

  expect(onSignup).toHaveBeenCalledTimes(1);
});`,
      note: "The vi.fn() prop is Mockery's shouldReceive()->with() for components: assert what the component emits, driven by real user interaction, with no parent rendered.",
      leftLang: "js",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The loading-then-data pattern in miniature: loadUsers() drives a state object through loading → success, and a hand-rolled findBy polls until the state it wants appears — exactly what screen.findByRole does against the DOM. Predict the three results.",
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
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(\`expected \${b} but got \${a}\`);
    },
  };
}
const tests: Array<[string, () => Promise<void>]> = [];
function test(name: string, fn: () => Promise<void>) {
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

// ── an async "component": state driven by a fetch ──────────
type Status = "idle" | "loading" | "success" | "error";
interface State {
  status: Status;
  users: string[];
  error: string | null;
}

function createUserList(fetchUsers: () => Promise<string[]>) {
  const state: State = { status: "idle", users: [], error: null };
  async function load() {
    state.status = "loading"; // the spinner moment
    try {
      state.users = await fetchUsers();
      state.status = "success"; // the data moment
    } catch (e) {
      state.error = (e as Error).message;
      state.status = "error";
    }
  }
  return { state, load };
}

// ── findBy in miniature: retry until it appears ────────────
async function findBy<T>(get: () => T | null, tries = 50): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const value = get();
    if (value !== null) return value;
    await Promise.resolve(); // yield, let pending async work run
  }
  throw new Error("findBy timed out");
}

// ── the tests ──────────────────────────────────────────────
test("shows loading, then the users", async () => {
  const cmp = createUserList(async () => ["Ada", "Grace"]);

  const pending = cmp.load(); // do NOT await yet…
  expect(cmp.state.status).toBe("loading"); // …assert the NOW

  // await the SOON, like screen.findByRole:
  const users = await findBy(() =>
    cmp.state.status === "success" ? cmp.state.users : null,
  );
  expect(users).toEqual(["Ada", "Grace"]);
  await pending;
});

test("the spinner is GONE after success", async () => {
  const cmp = createUserList(async () => ["Ada"]);
  await cmp.load();

  // queryBy in miniature: null instead of an error
  const spinner = cmp.state.status === "loading" ? "spinner" : null;
  expect(spinner).toBe(null);
});

test("the error path carries the message", async () => {
  const cmp = createUserList(async () => {
    throw new Error("HTTP 500");
  });
  await cmp.load();

  expect(cmp.state.status).toBe("error");
  expect(cmp.state.error).toBe("HTTP 500");
});

await run();

// Try it: in the first test, await cmp.load() before the
// 'loading' assertion — you'll have missed the moment, exactly
// like asserting a spinner after the data already rendered.`,
  },

  keyPoints: [
    "Validation messages: submit, then `await screen.findByRole('alert')` — findBy because validation is often async, alert because that's how users are told.",
    "Loading-then-data: mock the fetch boundary, then getBy the spinner (now), `await findBy` the data (soon), queryBy the spinner (gone).",
    "Assert disappearance with `queryBy... + toBeNull()` / `.not.toBeInTheDocument()` — never a sleep.",
    "Callback props: pass `vi.fn()` as the prop, drive the UI with user-event, assert `toHaveBeenCalledWith(payload)` — the component's outward contract.",
    "`render()` from @testing-library/svelte is the only framework-specific line — the patterns transfer to React/Vue unchanged.",
    "Whole-component snapshots are an anti-pattern: they fail on every harmless change and train the team to regenerate without reading.",
  ],

  interview: [
    {
      q: "How do you test a component that fetches data on mount?",
      a: "Mock the network boundary — vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(...)) or an MSW handler — because the network is a boundary I don't control, which is where mocking belongs. Then assert the three observable moments in one test: getByText for the spinner immediately after render, await findByRole for the data (findBy retries until it appears, so there are no sleeps), and queryBy + toBeNull to prove the spinner is gone. It's satisfying that the three query variants map one-to-one onto the three moments: now, soon, gone. I'd also add a second test for the rejection path — mock fetch to reject and findByRole('alert') for the error message — since the sad path is where untested components usually rot.",
    },
    {
      q: "How do you verify a component notifies its parent correctly, without rendering the parent?",
      a: "Pass a vi.fn() as the callback prop, drive the component through real interactions with user-event, and assert the fake was called with the right payload — toHaveBeenCalledWith('ada@example.com'), toHaveBeenCalledTimes(1). It's the same idea as Mockery's shouldReceive()->with() in PHP: the collaborator is faked, the contract is asserted. Crucially, the interaction should come through the UI — user.type and user.click — not by digging the handler out of the component instance and invoking it, because that would prove the function works while saying nothing about whether a user can actually trigger it. The component stays a black box: props in, DOM and callbacks out.",
    },
    {
      q: "Are snapshot tests bad? When would you use one?",
      a: "They're a tool with a narrow niche that gets misused as a substitute for assertions. A whole-component snapshot fails on every markup change, harmless or not, and it can't tell you which behaviour broke — so teams quickly start regenerating snapshots on red without reading the diff, and from that day the test guards nothing. I saw the same failure mode in PHP with golden-file template tests. Where snapshots earn their place: small, stable, deliberately-designed serialisations — an error payload, a generated config, a formatted string — where any change really is significant and the diff is a few lines a human will read. For components, targeted role-based assertions on behaviour beat a snapshot every time.",
    },
  ],

  quiz: [
    {
      question:
        "A form shows 'Email is required' (role=alert) shortly after an invalid submit. Which assertion is correct?",
      options: [
        "expect(screen.getByRole('alert')).toHaveTextContent('Email is required') immediately after the click",
        "expect(await screen.findByRole('alert')).toHaveTextContent('Email is required')",
        "expect(screen.queryByRole('alert')).toBeNull()",
        "expect(container.querySelector('.error')).toMatchSnapshot()",
      ],
      answerIndex: 1,
      explain:
        "The message appears asynchronously, so findBy — which retries until the element shows up — is the right variant; getBy would throw if it checks a tick too early. queryBy asserts absence, and the snapshot asserts nothing specific.",
    },
    {
      question:
        "What is the standard way to assert a component calls its onSave prop with the edited value?",
      options: [
        "Render the real parent and check its state afterwards",
        "Call component.handleSave() directly and spy on the result",
        "Pass onSave: vi.fn() as the prop, interact via user-event, then expect(onSave).toHaveBeenCalledWith(value)",
        "Snapshot the component before and after saving",
      ],
      answerIndex: 2,
      explain:
        "The vi.fn() prop stands in for the parent, keeping the test focused on this component's contract, and driving the UI with user-event proves a real user can trigger the callback. Calling handlers directly tests a function, not the component.",
    },
    {
      question:
        "Why do whole-component snapshot tests lose their protective value over time?",
      options: [
        "Snapshots slow the suite down until it times out",
        "They fail on every harmless markup change, so teams learn to regenerate them without reading the diff",
        "Vitest limits each suite to ten snapshots",
        "Snapshots cannot capture dynamic content at all",
      ],
      answerIndex: 1,
      explain:
        "A giant snapshot can't distinguish meaningful changes from noise — every refactor turns it red. Once regenerating on failure becomes reflex, the test approves whatever the code currently does, which is no protection at all.",
    },
  ],
};

export default lesson;
