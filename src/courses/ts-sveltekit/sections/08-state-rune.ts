import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "state-rune",
  title: "Typed State: $state & $state.raw",
  part: "Typed Components",
  estMinutes: 12,
  summary:
    "Declare reactive state with the right type up front, choose deep proxies or raw immutable state, and hand plain objects to the outside world with $state.snapshot.",

  concept: `
\`$state\` is how a Svelte 5 component owns data that changes. Reassign it —
or mutate it, if it's an object or array — and everything that reads it
updates. TypeScript's job is to pin down *what* that data is allowed to be,
and \`$state\` gives you two ways to say so.

### Inference vs an explicit type argument

For simple initial values, inference does the right thing:

\`\`\`ts
let count = $state(0);          // number
let name = $state("Ada");       // string
\`\`\`

But two very common cases need an explicit type argument, because the initial
value doesn't reveal the eventual type:

\`\`\`ts
let todos = $state<Todo[]>([]);            // [] alone would infer never[]
let selected = $state<string | null>(null); // null alone would infer null
\`\`\`

This is the classic TypeScript rule you already know from ordinary variables:
when the initial value is *narrower* than the intended type, state the type.
\`$state<T>(...)\` is just that rule wearing a rune.

### Deep reactivity: proxies

Give \`$state\` an object or array and Svelte wraps it in a **proxy**,
recursively. Mutation *is* the update mechanism:

\`\`\`ts
let todos = $state<Todo[]>([]);
todos.push({ id: 1, text: "learn runes", done: false }); // UI updates
todos[0].done = true;                                    // so does this
\`\`\`

No \`setState\`, no spread-to-replace — the proxy notices reads and writes at
any depth. Objects pushed into reactive arrays are proxified too.

### \`$state.raw\` — reassign, don't mutate

For large or immutable data (a big API payload, thousands of chart points),
proxying every level costs memory and time you don't need to spend.
\`$state.raw\` skips the proxy: the value is **not deeply reactive**, and
updates happen only by **reassignment**:

\`\`\`ts
let points = $state.raw<readonly Point[]>([]);
points.push(p);              // no effect — raw state can't be mutated
points = [...points, p];     // works: a fresh array, one reactive write
\`\`\`

Typing raw state as \`readonly\` is a nice trick: the compiler then *bans*
the mutations that Svelte would silently ignore.

### \`$state.snapshot\` — plain data for the outside world

Because deep state is a proxy, handing it to non-Svelte code can misbehave:
\`console.log\` shows \`Proxy { ... }\`, and APIs like \`structuredClone\` or
IndexedDB may reject it. \`$state.snapshot(todos)\` returns a **static, plain
copy** — use it whenever state leaves Svelte-land (logging, POSTing,
third-party libraries).

### Classes with \`$state\` fields

State isn't confined to component tops. Class fields can be reactive too,
which is the idiomatic way to share typed, reactive logic in a
\`.svelte.ts\` file:

\`\`\`ts
// src/lib/cart.svelte.ts
export class Cart {
  items = $state<CartItem[]>([]);
  get total(): number {
    return this.items.reduce((sum, i) => sum + i.price, 0);
  }
}
\`\`\`

Every instance gets independently reactive, fully typed fields — a typed,
reactive service object, if you want the PHP mental model.
`,

  comparisons: [
    {
      label: "Typing state the initial value can't reveal",
      intro:
        "A todo list starts empty and a selection starts as null. Both versions run; only one knows what the values will eventually hold.",
      php: `<!-- src/lib/components/TodoList.svelte -->
<script>
  // What goes in todos? Strings? Objects? Nobody knows yet.
  let todos = $state([]);
  let selectedId = $state(null);

  function add(text) {
    // Nothing stops { txt: text } or a bare string slipping in.
    todos.push({ text, done: false });
  }
</script>

<p>{todos.filter((t) => !t.done).length} open</p>`,
      ts: `<!-- src/lib/components/TodoList.svelte -->
<script lang="ts">
  interface Todo {
    id: number;
    text: string;
    done: boolean;
  }

  // [] would infer never[]; null would infer null — so say what you mean.
  let todos = $state<Todo[]>([]);
  let selectedId = $state<number | null>(null);

  function add(text: string) {
    todos.push({ id: todos.length + 1, text, done: false });
    // todos.push({ txt: text })  ← compile error
  }
</script>

<p>{todos.filter((t) => !t.done).length} open</p>`,
      note:
        "Use the explicit form `$state<T>(initial)` whenever the initial value is narrower than the real type — empty arrays and null starts are the two classic cases.",
    },
    {
      label: "Deep state vs $state.raw",
      intro:
        "A dashboard keeps a large array of readings that is replaced wholesale on each poll — never edited in place. Deep proxies buy nothing here; raw state skips their cost.",
      php: `<!-- src/lib/components/Chart.svelte -->
<script>
  // Deep proxy over thousands of points — every level
  // wrapped, though we never mutate any of it.
  let readings = $state([]);

  async function poll() {
    const next = await fetch("/api/readings").then((r) => r.json());
    readings = next;
  }

  // Someone later "optimises" with readings.push(x)…
  // it works, and now update styles are mixed.
</script>`,
      ts: `<!-- src/lib/components/Chart.svelte -->
<script lang="ts">
  interface Reading {
    at: string;
    value: number;
  }

  // Not deeply reactive: cheap, and updated only by reassignment.
  let readings = $state.raw<readonly Reading[]>([]);

  async function poll(): Promise<void> {
    const next: Reading[] = await fetch("/api/readings").then((r) => r.json());
    readings = next;               // one reactive write
    // readings.push(next[0]);     ← Svelte would ignore it —
    //                               and readonly makes it a compile error
  }
</script>`,
      note:
        "$state.raw trades mutation for performance: reassignment is the only update. Typing it readonly turns silently-ignored mutations into compile errors.",
    },
    {
      label: "Handing state to non-Svelte code",
      intro:
        "Saving the current todos to localStorage and logging them. Deep state is a proxy, and proxies leak into places that expect plain objects.",
      php: `<!-- src/lib/components/SaveButton.svelte -->
<script>
  let todos = $state([{ text: "ship it", done: false }]);

  function save() {
    // Logs "Proxy { ... }" — confusing in devtools.
    console.log(todos);
    // structuredClone(todos) can throw on proxies.
    localStorage.setItem("todos", JSON.stringify(todos));
  }
</script>

<button onclick={save}>Save</button>`,
      ts: `<!-- src/lib/components/SaveButton.svelte -->
<script lang="ts">
  interface Todo {
    text: string;
    done: boolean;
  }
  let todos = $state<Todo[]>([{ text: "ship it", done: false }]);

  function save(): void {
    // A static, plain copy — typed Todo[], safe everywhere.
    const plain = $state.snapshot(todos);
    console.log(plain);                    // { ... } not Proxy { ... }
    localStorage.setItem("todos", JSON.stringify(plain));
  }
</script>

<button onclick={save}>Save</button>`,
      note:
        "Reach for $state.snapshot whenever state crosses the boundary to logging, storage, fetch bodies, or third-party libraries that don't expect proxies.",
    },
  ],

  playground: {
    lang: "svelte",
    intro:
      "All three tools in one component: deep typed state (mutate it), raw state (reassign it), and a snapshot for clean logging. Predict what each button does before reading the output.",
    code: `<!-- src/lib/components/StateDemo.svelte -->
<script lang="ts">
  interface Todo {
    id: number;
    text: string;
    done: boolean;
  }

  // Deep: mutation updates the UI.
  let todos = $state<Todo[]>([]);

  // Raw: not deeply reactive — update by reassignment only.
  let log = $state.raw<readonly string[]>([]);

  function add(): void {
    const todo: Todo = { id: todos.length + 1, text: "task " + (todos.length + 1), done: false };
    todos.push(todo);                        // fine: todos is a deep proxy
    log = [...log, "added " + todo.text];    // fine: fresh array for raw state
    // log.push(...)                         ← readonly: compile error
  }

  function inspect(): void {
    console.log($state.snapshot(todos));     // plain objects, not Proxy
  }
</script>

<button onclick={add}>Add todo</button>
<button onclick={inspect}>Inspect</button>

<p>{todos.length} todos, {log.length} log entries</p>
<ul>
  {#each todos as t (t.id)}
    <li>
      <label><input type="checkbox" bind:checked={t.done} /> {t.text}</label>
    </li>
  {/each}
</ul>`,
    output: `Initially: "0 todos, 0 log entries" and an empty list.
Click "Add todo" twice: "2 todos, 2 log entries" with checkboxes for task 1 and task 2.
Ticking a checkbox mutates t.done through the deep proxy — the UI stays in sync.
Click "Inspect": the console logs [{ id: 1, ... }, { id: 2, ... }] as plain objects
(no "Proxy" wrapper), because $state.snapshot returned a static copy.`,
  },

  keyPoints: [
    "`$state(0)` infers fine, but empty or null starts need the explicit form: `$state<Todo[]>([])`, `$state<string | null>(null)`.",
    "Objects and arrays in `$state` become deep proxies — mutation at any depth (`todos.push(...)`, `todos[0].done = true`) is the update mechanism.",
    "`$state.raw` skips the proxy for large/immutable data: it can only be updated by reassignment; mutations are silently ignored.",
    "Type raw state as `readonly T[]` so the compiler forbids the mutations Svelte would ignore.",
    "`$state.snapshot(x)` returns a static plain copy — use it before logging, `structuredClone`, storage, or any non-Svelte API.",
    "Class fields can be `$state` too (great in `.svelte.ts` files) — typed, reactive, shareable logic outside components.",
  ],

  interview: [
    {
      q: "When do you give $state an explicit type argument?",
      a: "Whenever the initial value is narrower than the intended type, exactly like ordinary variable declarations. The two everyday cases are empty collections — `$state([])` infers `never[]`, so I write `$state<Todo[]>([])` — and nullable starts, where `$state(null)` infers `null`, so I write `$state<string | null>(null)`. With a representative initial value like `$state(0)` I let inference do it. The rune doesn't change TypeScript's rules; it just applies them to reactive state.",
    },
    {
      q: "What's the difference between $state and $state.raw, and when would you choose raw?",
      a: "`$state` wraps objects and arrays in deep proxies, so mutating at any depth triggers updates. `$state.raw` skips the proxy: the value isn't deeply reactive and the only way to update it is reassignment — mutations are silently ignored. I choose raw for large data I treat as immutable anyway, like a big API payload or chart series that gets replaced wholesale, because proxying thousands of nested objects costs memory and time for reactivity I'll never use. I also type raw state `readonly` so the compiler bans the mutations Svelte would ignore.",
    },
    {
      q: "Why does $state.snapshot exist? Give a concrete scenario.",
      a: "Deep state is a Proxy, and code outside Svelte often can't handle proxies: `console.log` prints `Proxy { ... }`, and APIs like `structuredClone`, IndexedDB, or postMessage can choke on them. `$state.snapshot(state)` produces a static plain copy. Concrete case: serialising a reactive `todos` array into `localStorage` or a fetch body — I snapshot first, then stringify, so what leaves the component is ordinary data with the same TypeScript type.",
    },
  ],

  quiz: [
    {
      question: "What does `let todos = $state([])` infer in TypeScript, and what's the fix?",
      options: [
        "unknown[] — fix with a cast: $state([]) as Todo[]",
        "any[] — no fix needed",
        "never[] — fix with an explicit type argument: $state<Todo[]>([])",
        "Todo[] — Svelte infers it from later pushes",
      ],
      answerIndex: 2,
      explain:
        "An empty array literal gives TypeScript nothing to infer from, so you get `never[]` and every push fails. `$state<Todo[]>([])` states the eventual element type up front — the same rule as `const todos: Todo[] = []` for ordinary variables.",
    },
    {
      question: "You write `points.push(p)` where `points = $state.raw([])`. What happens?",
      options: [
        "The UI updates as usual — raw only affects nested objects",
        "Nothing reactive happens — raw state can't be mutated, only reassigned",
        "A runtime error is thrown immediately",
        "The push is queued until the next reassignment",
      ],
      answerIndex: 1,
      explain:
        "Raw state has no proxy, so mutations have no reactive effect — the update simply doesn't reach the UI. The correct move is reassignment (`points = [...points, p]`), and typing raw state as `readonly Point[]` makes the bad push a compile error instead of a silent no-op.",
    },
    {
      question: "Which is the right use of $state.snapshot?",
      options: [
        "Wrapping every read in the template for performance",
        "Making a deep state object immutable",
        "Creating a second reactive copy to edit safely",
        "Getting a plain, static copy before passing state to structuredClone or logging it",
      ],
      answerIndex: 3,
      explain:
        "Snapshot exists for the boundary with non-Svelte code: it converts the reactive proxy into ordinary plain data for logging, cloning, storage, or third-party libraries. It's not reactive, not needed in templates, and doesn't affect the original state.",
    },
  ],
};

export default lesson;
