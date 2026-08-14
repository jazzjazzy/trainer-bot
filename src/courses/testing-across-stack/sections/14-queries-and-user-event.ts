import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "queries-and-user-event",
  title: "Queries & user-event",
  part: "Components & Python",
  estMinutes: 11,
  summary:
    "getBy throws, queryBy returns null (for asserting absence), findBy awaits appearance — and user-event simulates the full event sequence a real user generates, so every call must be awaited.",

  concept: `
Two vocabularies make up day-to-day Testing Library work: the **query
variants** that fetch elements, and **user-event** that interacts with them.

### getBy, queryBy, findBy

Every query (\`ByRole\`, \`ByLabelText\`, \`ByText\`, ...) comes in three
variants that differ only in how they handle "not there":

- **\`getBy...\`** — returns the element or **throws** immediately. Use it
  when the element must exist right now; the thrown error prints the
  rendered DOM, which is your debugging view.
- **\`queryBy...\`** — returns the element or **\`null\`**. This exists for
  exactly one job: **asserting absence**.
  \`expect(screen.queryByText("Loading…")).toBeNull()\` — you can't do that
  with \`getBy\`, which would throw before the assertion runs.
- **\`findBy...\`** — returns a **promise** and retries until the element
  appears (or times out). It's \`getBy\` + \`waitFor\` fused together — the
  tool for anything that shows up after a fetch, a debounce, or a state
  transition: \`await screen.findByRole("alert")\`.

Each has an \`All\` variant (\`getAllByRole\`, \`queryAllByText\`,
\`findAllByRole\`) returning arrays. The decision table is worth memorising:
*must exist now* → get, *must NOT exist* → query, *will exist soon* → find.
In PHPUnit terms: \`getBy\` is an assertion and a fetch in one, like
\`$this->assertInstanceOf\` followed by use; \`queryBy\` is the null-safe
lookup you'd write with \`?->\`.

### user-event: interactions the way a browser does them

The naive way to "type" in a test is to reach in and set \`input.value\`.
Real users don't set values — they click, which fires \`pointerdown\`,
\`focus\`, \`pointerup\`, \`click\`; they type, which fires \`keydown\`,
\`input\`, \`keyup\` *per character*. Components listen to all of those
(validation on keydown, character counters on input, formatting on blur).
\`@testing-library/user-event\` (v14) simulates the full sequence:

\`\`\`ts
import userEvent from "@testing-library/user-event";

it("enables submit once the form is valid", async () => {
  const user = userEvent.setup(); // one session per test
  render(SignupForm);

  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.click(screen.getByRole("button", { name: "Sign up" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Country" }),
    "AU",
  );
});
\`\`\`

Three rules:

1. **Start with \`userEvent.setup()\`** and use the returned \`user\` for
   every interaction in the test — the session keeps state (pointer
   position, held modifier keys) consistent between calls.
2. **Every call returns a promise: always \`await\`.** An un-awaited
   \`user.click\` is the same silent-lie bug as an un-awaited assertion —
   the test finishes before the interaction does.
3. **Prefer user-event over \`fireEvent\`.** \`fireEvent.change(input,
   { target: { value: "x" } })\` teleports a value in with a single synthetic
   event — no focus, no keydown, no per-character input events. Components
   that react to those events pass the fake test and fail with real fingers
   on real keyboards.
`,

  comparisons: [
    {
      label: "fireEvent.change vs await user.type",
      intro:
        "Both tests fill an email field. The component validates on keydown and shows a character counter on input — behaviour only one test actually exercises.",
      php: `// stuff the value in with one synthetic event
it("accepts an email", () => {
  render(SignupForm);
  const input = screen.getByLabelText("Email");

  fireEvent.change(input, {
    target: { value: "ada@example.com" },
  });
  // fired: change. That's it.
  // never fired: focus, keydown, input ×15, keyup
  // the keydown validator and the counter never ran
});`,
      ts: `// simulate what fingers actually do
import userEvent from "@testing-library/user-event";

it("accepts an email", async () => {
  const user = userEvent.setup();
  render(SignupForm);

  await user.type(
    screen.getByLabelText("Email"),
    "ada@example.com",
  );
  // fires focus, then keydown → input → keyup
  // for every character — the component's real diet
});`,
      note: "user-event 14: setup() once per test, then await every call — each interaction is async and replays the browser's full event sequence.",
      leftLang: "js",
    },
    {
      label: "Asserting absence: try/catch vs queryBy",
      intro:
        "After data loads, the spinner must be gone. getBy throws on a missing element, so the naive test wraps it in try/catch — queryBy exists to make this a one-liner.",
      php: `// getBy throws, so… catch it? (and sleep first?)
it("hides the spinner after load", async () => {
  render(UserList);
  await new Promise((r) => setTimeout(r, 500));

  let spinner = null;
  try {
    spinner = screen.getByText("Loading…");
  } catch (e) {
    // hopefully this means it's gone…
  }
  expect(spinner).toBe(null);
});`,
      ts: `// find the data, then assert the spinner is GONE
it("hides the spinner after load", async () => {
  render(UserList);

  // findBy waits for the list to appear…
  await screen.findByRole("list");

  // …then queryBy returns null instead of throwing
  expect(screen.queryByText("Loading…")).toBeNull();
});`,
      note: "The decision table in action: 'will exist soon' → findBy (awaited), 'must not exist' → queryBy + toBeNull. No sleeps, no try/catch.",
      leftLang: "js",
    },
    {
      label: "Selecting an option like a user",
      intro:
        "Choosing a country from a dropdown. One test mutates the select's value; the other operates the control through its accessible name.",
      php: `// set the value, hope the component noticed
fireEvent.change(screen.getByTestId("country"), {
  target: { value: "AU" },
});
// no pointer events, no focus, and the test is
// welded to a data-testid instead of the label`,
      ts: `const user = userEvent.setup();

await user.selectOptions(
  screen.getByRole("combobox", { name: "Country" }),
  "AU",
);

expect(
  screen.getByRole("option", { name: "Australia" })
    .selected,
).toBe(true);`,
      note: "selectOptions fires the pointer/focus/change sequence a real selection produces, and the combobox is found by role + label — the way a user finds it.",
      leftLang: "js",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of user.type vs fireEvent.change: typeInto fires focus, then keydown → input → keyup per character against a tiny form 'component' whose submit button enables only on valid input. Predict all three results before running.",
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

// ── a tiny form "component" ────────────────────────────────
// It only trusts input it SAW being typed: validation runs on
// each input event, like a real keydown/input listener would.
interface Form {
  email: string;
  submitEnabled: boolean;
  log: string[];
}

function createForm(): Form {
  return { email: "", submitEnabled: false, log: [] };
}

function fireInputEvent(form: Form, value: string) {
  form.email = value;
  form.log.push("input:" + value);
  // the component's validation listener:
  form.submitEnabled = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(value);
}

// user.type in miniature — the full per-character sequence
function typeInto(form: Form, text: string) {
  form.log.push("focus");
  let value = form.email;
  for (const ch of text) {
    form.log.push("keydown:" + ch);
    value += ch;
    fireInputEvent(form, value);
    form.log.push("keyup:" + ch);
  }
}

// fireEvent.change in miniature — teleport the value in,
// one synthetic event, no input listener involved
function changeValue(form: Form, value: string) {
  form.email = value;
  form.log.push("change:" + value);
}

// ── the tests ──────────────────────────────────────────────
test("submit enables only once the address is valid", () => {
  const form = createForm();
  typeInto(form, "ada@example");
  expect(form.submitEnabled).toBe(false); // no TLD yet
  typeInto(form, ".com");
  expect(form.submitEnabled).toBe(true);
});

test("typeInto fires the events a real user generates", () => {
  const form = createForm();
  typeInto(form, "hi");
  expect(form.log).toEqual([
    "focus",
    "keydown:h", "input:h", "keyup:h",
    "keydown:i", "input:hi", "keyup:i",
  ]);
});

test("changeValue sets the value but the validator never ran", () => {
  const form = createForm();
  changeValue(form, "ada@example.com");
  expect(form.email).toBe("ada@example.com");
  // valid address — but submit is still disabled, because
  // no input event ever reached the validation listener:
  expect(form.submitEnabled).toBe(false);
});

run();

// That last test is the fireEvent trap inverted: in a real
// suite, fireEvent-based tests often PASS while the component
// fails for real users. Simulate the full sequence instead.`,
  },

  keyPoints: [
    "getBy throws when missing (element must exist NOW), queryBy returns null (assert absence), findBy returns a retrying promise (element appears LATER).",
    "Asserting absence is queryBy's only job: `expect(screen.queryByText('Loading…')).toBeNull()` — getBy would throw first.",
    "`await screen.findByRole(...)` replaces sleeps and waitFor-wrapped getBys for anything that appears after async work.",
    "user-event 14: `const user = userEvent.setup()` once per test, then interact through that session.",
    "Every user-event call returns a promise — always `await user.click(...)`, `await user.type(...)`, `await user.selectOptions(...)`.",
    "Prefer user-event over fireEvent: it replays the full realistic sequence (pointer, focus, per-character keydown/input/keyup) that components actually listen to.",
  ],

  interview: [
    {
      q: "Explain the difference between getBy, queryBy, and findBy — and when you'd use each.",
      a: "They're the same queries with three policies for a missing element. getBy throws immediately with a dump of the rendered DOM — use it when the element must exist right now, so the failure is loud and informative. queryBy returns null instead of throwing, and its single legitimate purpose is asserting absence: expect(queryByText('Loading…')).toBeNull(). findBy returns a promise that retries until the element appears or times out — it's getBy fused with waitFor, and it's the correct tool for anything appearing after async work, replacing every sleep you'd be tempted to write. Each has an All variant returning arrays. My mnemonic: must exist now → get, must not exist → query, will exist soon → await find.",
    },
    {
      q: "Why is user-event preferred over fireEvent?",
      a: "fireEvent dispatches one synthetic event: fireEvent.change teleports a value into an input without focus, without a single keydown, without per-character input events. Real components hang behaviour off exactly those events — validation on keydown, counters on input, formatting on blur — so a fireEvent test can pass while the component is broken for actual users, and vice versa. user-event simulates the interaction the way a browser produces it: user.click fires the pointer sequence plus focus, user.type fires keydown/input/keyup per character. The v14 idiom is userEvent.setup() once per test for a stateful session, then await every call, because each interaction is asynchronous. It's the Testing Library philosophy applied to input: resemble real usage.",
    },
    {
      q: "How do you test that an element has disappeared, and why is it awkward with getBy?",
      a: "getBy throws when it finds nothing, so you can't write expect(getByText('Loading…')) to be null — the throw happens before your assertion. That's what queryBy is for: it returns null on a miss, so expect(screen.queryByText('Loading…')).toBeNull() (or .not.toBeInTheDocument() with jest-dom) reads exactly like the requirement. The usual full pattern is two steps: first await screen.findByRole('list') — wait for the state that implies the spinner should be gone — then queryBy for the spinner. If the disappearance itself is the async event, Testing Library also has waitForElementToBeRemoved. What you never do is sleep and hope, which is where flaky tests come from.",
    },
  ],

  quiz: [
    {
      question: "Which query is correct for asserting a spinner is NOT in the DOM?",
      options: [
        "expect(screen.getByText('Loading…')).toBeNull()",
        "expect(screen.queryByText('Loading…')).toBeNull()",
        "expect(await screen.findByText('Loading…')).toBeNull()",
        "expect(screen.getAllByText('Loading…').length).toBe(0)",
      ],
      answerIndex: 1,
      explain:
        "queryBy returns null on a miss, which is exactly what absence assertions need. getBy and getAllBy throw when nothing matches (so the assertion never runs), and findBy would wait for the spinner to APPEAR, then time out.",
    },
    {
      question:
        "In user-event 14, what's the correct way to click a button in a test?",
      options: [
        "userEvent.click(button) — no await needed since v14",
        "const user = userEvent.setup(); await user.click(button)",
        "fireEvent.click(button) — user-event is only for typing",
        "await userEvent.setup().click.call(button)",
      ],
      answerIndex: 1,
      explain:
        "The v14 idiom is one setup() session per test and an await on every interaction — all user-event APIs return promises. Skipping the await lets the test finish before the interaction's event sequence has run.",
    },
    {
      question:
        "A component validates its input on keydown. Which test technique can catch a bug in that validator?",
      options: [
        "fireEvent.change(input, { target: { value: 'abc' } })",
        "Setting input.value = 'abc' directly and asserting",
        "await user.type(input, 'abc') — it fires keydown, input, and keyup per character",
        "A snapshot test of the rendered input",
      ],
      answerIndex: 2,
      explain:
        "Only user.type replays the per-character event sequence the validator actually listens to. fireEvent.change and direct value assignment skip keydown entirely, so the validator never runs and the test proves nothing about it.",
    },
  ],
};

export default lesson;
