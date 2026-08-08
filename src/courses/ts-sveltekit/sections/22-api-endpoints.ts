import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "api-endpoints",
  title: "API Endpoints: +server.ts & RequestHandler",
  part: "Server & Forms",
  estMinutes: 11,
  summary:
    "Build JSON APIs with +server.ts files: typed RequestHandler exports, the json() helper, and why you must narrow whatever request.json() gives you.",

  concept: `
Pages aren't the only thing a route can serve. Drop a **\`+server.ts\`** file
into a route folder and it becomes an API endpoint — the SvelteKit equivalent
of a PHP API controller that returns a \`JsonResponse\` instead of a view.
\`src/routes/api/todos/+server.ts\` answers \`/api/todos\`.

### One export per HTTP verb

You export a function named after the method: \`GET\`, \`POST\`, \`PUT\`,
\`PATCH\`, \`DELETE\`, \`OPTIONS\`, \`HEAD\`. Each receives the request event and
must return a standard \`Response\`:

\`\`\`ts
// src/routes/api/todos/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const todo = await db.getTodo(params.id); // params.id: string — typed per route
  if (!todo) error(404, 'Not found');
  return json(todo);
};
\`\`\`

The \`RequestHandler\` type comes from the **generated \`./$types\`**, so
\`params\` is typed for *this* route — \`params.id\` exists because the folder
is \`[id]\`; \`params.slug\` would be a compile error. Same trick as
\`PageServerLoad\`, applied to endpoints.

### Helpers: json() and text()

Returning raw \`new Response(JSON.stringify(data), { headers: ... })\` gets old
fast. \`json(data, init?)\` and \`text(body, init?)\` from \`@sveltejs/kit\`
build the \`Response\` with the right \`Content-Type\` for you. Pass
\`{ status: 201 }\` as the second argument when you need more than a 200.

### Incoming JSON is not typed — narrow it

Here's the boundary lesson again: \`await request.json()\` is typed as
\`any\` (really: "whatever the client felt like sending"). The wire is
untrusted, exactly like \`$_POST\` or \`json_decode(file_get_contents('php://input'))\`
in PHP. Assigning it straight to your interface is a lie the compiler can't
catch:

\`\`\`ts
const body = (await request.json()) as CreateTodo; // hope-driven development
\`\`\`

Treat it as \`unknown\`, then **validate and narrow** — a hand-written type
guard for small cases, or a schema library (Zod et al., covered in the
validation section) for real apps. Fail with \`error(400, ...)\` or
\`json({ message }, { status: 422 })\` when the shape is wrong.

### The rest of the event

Endpoints get the same \`RequestEvent\` goodies as server \`load\`:
\`cookies.get/set\`, \`setHeaders({ 'cache-control': 'max-age=60' })\`,
\`url.searchParams\`, \`locals\` (your typed per-request state), and \`fetch\`.

### Consuming your own endpoint

From a component, call it with \`fetch\` — and remember \`response.json()\`
gives you \`any\` on this side too, so annotate or validate:

\`\`\`ts
const res = await fetch('/api/todos');
const todos: Todo[] = await res.json(); // fine if you own both ends; validate if not
\`\`\`

If a page just needs data on load, prefer a \`load\` function — endpoints are
for JSON consumed by client-side code, webhooks, or other services.
`,

  comparisons: [
    {
      label: "A GET endpoint",
      intro:
        "An endpoint at /api/todos that returns a filtered list as JSON, reading an optional ?done= query parameter. Both versions produce the same response.",
      leftLang: "js",
      rightLang: "ts",
      php: `// src/routes/api/todos/+server.js (untyped)
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function GET({ url }) {
  // url, params, cookies — all inferred as broad types;
  // rename the route folder and nothing complains
  const done = url.searchParams.get('done');
  const todos = await db.listTodos({
    done: done === null ? undefined : done === 'true'
  });
  return json(todos);
}`,
      ts: `// src/routes/api/todos/+server.ts
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, setHeaders }) => {
  const done = url.searchParams.get('done'); // string | null
  const todos = await db.listTodos({
    done: done === null ? undefined : done === 'true'
  });

  setHeaders({ 'cache-control': 'public, max-age=60' });
  return json(todos); // Response with content-type: application/json
};`,
      note:
        "RequestHandler comes from the generated ./$types, so the event — including route-specific params — is typed for this exact route; json() builds the Response and headers for you.",
    },
    {
      label: "A POST endpoint that trusts nothing",
      intro:
        "Creating a todo from a JSON body. The untyped version trusts the wire; the typed version treats request.json() as unknown and narrows before touching the database.",
      leftLang: "js",
      rightLang: "ts",
      php: `// src/routes/api/todos/+server.js (untyped)
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function POST({ request }) {
  const body = await request.json();

  // body.title could be a number, missing, or a
  // 2MB string — nothing checks until the DB throws
  const todo = await db.createTodo({
    title: body.title,
    done: body.done
  });
  return json(todo, { status: 201 });
}`,
      ts: `// src/routes/api/todos/+server.ts
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

interface CreateTodo { title: string; done: boolean; }

function isCreateTodo(v: unknown): v is CreateTodo {
  return (
    typeof v === 'object' && v !== null &&
    'title' in v && typeof (v as { title: unknown }).title === 'string' &&
    'done' in v && typeof (v as { done: unknown }).done === 'boolean'
  );
}

export const POST: RequestHandler = async ({ request }) => {
  const body: unknown = await request.json(); // the wire is untrusted

  if (!isCreateTodo(body)) error(400, 'Expected { title: string, done: boolean }');

  const todo = await db.createTodo(body); // body: CreateTodo — narrowed
  return json(todo, { status: 201 });
};`,
      note:
        "request.json() resolves to any — annotate it as unknown and narrow with a guard (or a schema library) so the compiler forces validation at the boundary, just like you'd never trust raw $_POST.",
    },
    {
      label: "Consuming the endpoint from a page",
      intro:
        "A component that fetches /api/todos on a button click and renders the list. The typed version annotates the parsed JSON so everything downstream is checked.",
      php: `<!-- src/routes/todos/+page.svelte (untyped) -->
<script>
  let todos = $state([]);

  async function refresh() {
    const res = await fetch('/api/todos');
    todos = await res.json(); // any[] in disguise
  }
</script>

<button onclick={refresh}>Refresh</button>
<ul>
  {#each todos as todo}
    <li>{todo.titel}</li> <!-- typo renders blank, forever -->
  {/each}
</ul>`,
      ts: `<!-- src/routes/todos/+page.svelte -->
<script lang="ts">
  interface Todo { id: number; title: string; done: boolean; }

  let todos = $state<Todo[]>([]);

  async function refresh(): Promise<void> {
    const res = await fetch('/api/todos');
    if (!res.ok) return;
    todos = (await res.json()) as Todo[]; // we own both ends
  }
</script>

<button onclick={refresh}>Refresh</button>
<ul>
  {#each todos as todo}
    <li class:done={todo.done}>{todo.title}</li> <!-- typo would not compile -->
  {/each}
</ul>`,
      note:
        "An `as Todo[]` assertion is acceptable when you wrote the endpoint yourself; for third-party APIs, validate instead — the assertion is a promise to the compiler, not a check.",
    },
  ],

  playground: {
    intro:
      "The POST-body problem in miniature: parse JSON into unknown, then narrow with a type guard before using it. Predict which payloads pass — then try removing the guard and using body.title directly.",
    lang: "typescript",
    code: `interface CreateTodo {
  title: string;
  done: boolean;
}

// A user-defined type guard: the runtime check the wire demands,
// expressed so the compiler can use it to narrow.
function isCreateTodo(v: unknown): v is CreateTodo {
  return (
    typeof v === "object" && v !== null &&
    "title" in v && typeof (v as { title: unknown }).title === "string" &&
    "done" in v && typeof (v as { done: unknown }).done === "boolean"
  );
}

// Simulates: const body: unknown = await request.json();
function handlePost(rawBody: string): string {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return "400 Bad Request: not JSON at all";
  }

  if (!isCreateTodo(body)) {
    return "400 Bad Request: expected { title: string, done: boolean }";
  }

  // body is CreateTodo from here on — .title autocompletes, typos won't compile
  return "201 Created: " + body.title + (body.done ? " (done)" : " (open)");
}

console.log(handlePost('{"title":"Write the API section","done":true}'));
console.log(handlePost('{"title":"Ship it","done":false}'));
console.log(handlePost('{"title":42,"done":false}'));      // wrong type
console.log(handlePost('{"done":true}'));                   // missing field
console.log(handlePost('not even json'));                    // parse failure`,
  },

  keyPoints: [
    "A `+server.ts` file turns a route into an endpoint: export `GET` / `POST` / `PUT` / `DELETE` functions that return a `Response` — the PHP-framework analogue of an API controller returning `JsonResponse`.",
    "Type each handler as `RequestHandler` from `./$types` — `params` is then typed per route folder, like every other generated type.",
    "`json(data, { status })` and `text(body)` from `@sveltejs/kit` build the `Response` with correct headers.",
    "`await request.json()` is effectively untyped — assign it to `unknown` and narrow with a guard or schema before use. The wire is `$_POST` all over again.",
    "The event also gives you `cookies`, `setHeaders`, `url.searchParams`, and typed `locals` — same surface as server `load`.",
    "Pages that just need data on load should use `load`, not fetch their own endpoint — endpoints are for client-side calls, webhooks, and external consumers.",
  ],

  interview: [
    {
      q: "How do you build a JSON API in SvelteKit, and how does it stay type-safe?",
      a: "You add a `+server.ts` to a route folder and export a function per HTTP verb — `GET`, `POST`, and so on — each typed as `RequestHandler` imported from the generated `./$types`. That gives you a typed event: `params` matches the route's dynamic segments, plus `cookies`, `url`, `setHeaders`, and my typed `locals`. Responses go through the `json()` helper. The one place types can't help automatically is the incoming body: `request.json()` is `any`, so I treat it as `unknown` and validate — a type guard for simple shapes, a schema library for anything real. It maps cleanly to a PHP API controller: route file ≈ controller, verb export ≈ action method, `json()` ≈ `JsonResponse`.",
    },
    {
      q: "Why shouldn't you just write `const body = await request.json() as MyDto`?",
      a: "Because `as` is an assertion, not a check — it changes what the compiler believes without changing what arrives at runtime. Any client can POST anything, so the body is untrusted input, the same as `$_POST` in PHP. If the shape is wrong you get `undefined`s and type errors deep inside your business logic or database layer, far from the actual bug. The disciplined pattern is: annotate the parsed body as `unknown`, then narrow via a user-defined type guard or schema validation, and return a 400 immediately when it fails. Then everything downstream is genuinely, not nominally, typed.",
    },
    {
      q: "When do you reach for a +server.ts endpoint versus a load function or form action?",
      a: "`load` is for data a page needs at render time — it's typed end-to-end into the component and works with SSR, so it's the default. Form actions are for mutations driven by HTML forms, because they work without JS and integrate with `use:enhance`. Endpoints are for everything else: JSON consumed by client-side code after the page is up (search-as-you-type, polling), webhooks from third parties, or serving other clients like a mobile app. If I find a page fetching its own endpoint just to render, that's usually a sign it should have been a `load` function.",
    },
  ],

  quiz: [
    {
      question: "In `src/routes/api/users/[id]/+server.ts`, what does typing GET as `RequestHandler` from './$types' buy you?",
      options: [
        "It validates the request body automatically",
        "params is typed for this route — params.id: string exists, params.slug is a compile error",
        "It converts the return value to JSON automatically",
        "It makes the endpoint work without JavaScript",
      ],
      answerIndex: 1,
      explain:
        "The generated ./$types knows this route's dynamic segments, so the event's `params` is exactly `{ id: string }`. Body validation and JSON serialisation remain your job (via narrowing and json()).",
    },
    {
      question: "What is the type of `await request.json()`, and what should you do about it?",
      options: [
        "It's typed from your route's generated types — nothing to do",
        "It's `string` — call JSON.parse on it yourself",
        "It's effectively `any` — treat it as `unknown` and validate/narrow before use",
        "It throws if the body doesn't match your interface",
      ],
      answerIndex: 2,
      explain:
        "The platform can't know what a client will send, so request.json() resolves to any. Assigning to `unknown` forces you to narrow (type guard or schema) before touching fields — validation at the boundary, like sanitising $_POST.",
    },
    {
      question: "Which helper returns a Response with `content-type: application/json` and a 201 status?",
      options: [
        "return { status: 201, body: data }",
        "return json(data, { status: 201 })",
        "return new JsonResponse(data, 201)",
        "return text(JSON.stringify(data))",
      ],
      answerIndex: 1,
      explain:
        "json(data, init) from '@sveltejs/kit' serialises the data and sets the header; the optional init lets you set status and extra headers. Returning a plain object from an endpoint is not supported — handlers must return a Response.",
    },
  ],
};

export default lesson;
