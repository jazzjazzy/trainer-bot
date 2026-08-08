import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "server-load",
  title: "Server-Only load: +page.server.ts",
  part: "Routing & Data",
  estMinutes: 12,
  summary:
    "+page.server.ts runs exclusively on the server — safe for databases and secrets, typed with PageServerLoad, but its data must survive serialisation.",

  concept: `
A universal load (\`+page.ts\`) ends up running in the browser, so it can never
hold a database handle or an API secret. When your data comes from somewhere
private, use a **server load** in \`+page.server.ts\`, typed with
\`PageServerLoad\` from the same generated \`'./$types'\`.

\`\`\`ts
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  const session = cookies.get('sessionid');
  const user = locals.user; // populated by your handle hook
  return { orders: await db.orders.forUser(user.id) };
};
\`\`\`

This is the closest thing SvelteKit has to a classic PHP controller action:
it always executes on the server, talks to the database directly, reads
cookies and per-request state, and hands the view its data. The code is never
shipped to the browser — importing from \`$lib/server/*\` or
\`$env/static/private\` here is fine, and SvelteKit will refuse to build if you
try it in client-reachable code.

### Extra powers of the server event

Beyond what universal load gets (\`params\`, \`url\`, \`fetch\`, \`parent\`...), the
\`ServerLoadEvent\` adds:

- **\`cookies\`** — typed get/set/delete for request cookies.
- **\`locals\`** — per-request state you populate in the \`handle\` hook
  (typically the authenticated user). You type it once in \`app.d.ts\` and every
  server load sees it.
- **\`request\`**, **\`clientAddress\`**, **\`platform\`** — the raw request and
  adapter-specific extras.

### The catch: data must be serialisable

The results of a server load have to travel over the network to the browser.
SvelteKit serialises them with **devalue**, which handles:

- everything JSON can represent,
- plus \`Date\`, \`Map\`, \`Set\`, \`RegExp\`, \`BigInt\`,
- plus repeated and cyclical references.

What it can **not** carry: **class instances** (your Doctrine-style entities!),
**functions**, and component constructors. Return a \`UserEntity\` and you get a
runtime error, not a silent downgrade. The pattern is old news to a PHP dev:
map entities to plain **DTO-shaped objects** at the boundary, exactly like
serialising an entity to JSON for an API response. Promises are also allowed —
SvelteKit streams them to the browser as they resolve.

### Universal or server?

- **Server load** when you need the DB, secrets, \`cookies\`/\`locals\` — or just
  want the code kept off the client. Default to this for private data.
- **Universal load** when calling public APIs from wherever the app is
  running, or when the page needs values that can't be serialised (a class
  instance, a component to render).
- Both exist? The server load runs first and its result arrives as the
  universal load's \`data\` property.

### The types still flow

Nothing changes for the page: \`let { data }: PageProps = $props()\` works
identically whether the data came from \`+page.ts\` or \`+page.server.ts\` — the
generated \`./$types\` merges it all, and renames still break the build.
`,

  comparisons: [
    {
      label: "A dashboard's server load",
      intro:
        "Load the signed-in user's orders from the database using the session cookie. This must never run in the browser — and one version proves who 'user' is.",
      php: `// src/routes/dashboard/+page.server.js
import { db } from '$lib/server/database';

export async function load({ locals, cookies }) {
  // locals is untyped: locals.usr is undefined and the
  // DB query quietly runs with user id undefined.
  const theme = cookies.get('theme');
  return {
    orders: await db.orders.forUser(locals.usr.id),
    theme
  };
}`,
      ts: `// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  // locals.user is typed via App.Locals in app.d.ts;
  // locals.usr is a compile error.
  const theme = cookies.get('theme'); // string | undefined
  return {
    orders: await db.orders.forUser(locals.user.id),
    theme: theme ?? 'light'
  };
};`,
      note:
        "PageServerLoad types the ServerLoadEvent — cookies, locals (via your App.Locals declaration), request — and the return type flows to the page exactly as with universal load.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "The serialisation boundary: entity vs DTO",
      intro:
        "Return the current user to the page. One version hands back a class instance and dies at the devalue boundary; the other maps to a plain typed shape first.",
      php: `// src/routes/profile/+page.server.js
import { userRepo } from '$lib/server/repo';

export async function load({ locals }) {
  const entity = await userRepo.find(locals.userId);
  // entity is a class instance with methods —
  // devalue cannot serialise it: runtime error
  // when the page is requested.
  return { user: entity };
}`,
      ts: `// src/routes/profile/+page.server.ts
import type { PageServerLoad } from './$types';
import { userRepo } from '$lib/server/repo';

interface UserDTO {
  id: number;
  displayName: string;
  joined: Date; // Date is fine — devalue handles it
}

export const load: PageServerLoad = async ({ locals }) => {
  const entity = await userRepo.find(locals.userId);
  const user: UserDTO = {
    id: entity.id,
    displayName: entity.displayName(),
    joined: entity.createdAt
  };
  return { user };
};`,
      note:
        "devalue carries JSON types plus Date, Map, Set, RegExp, BigInt and cyclic references — but not class instances or functions. Map entities to plain DTOs at the boundary, like serialising an entity for an API response in PHP.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Secrets stay typed and server-only",
      intro:
        "Call a third-party API with a private key. Both versions keep the key off the client — but only one is checked for existence and location.",
      php: `// src/routes/reports/+page.server.js
export async function load({ fetch }) {
  // process.env is stringly-typed: a missing var or a
  // typo (APIKEY vs API_KEY) becomes 'undefined' in the
  // Authorization header at runtime.
  const res = await fetch('https://api.example.com/reports', {
    headers: { Authorization: \`Bearer \${process.env.APIKEY}\` }
  });
  return { reports: await res.json() };
}`,
      ts: `// src/routes/reports/+page.server.ts
import type { PageServerLoad } from './$types';
import { API_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ fetch }) => {
  // $env/static/private is generated from your .env:
  // a misspelled or missing variable is a build error,
  // and importing it in client code refuses to compile.
  const res = await fetch('https://api.example.com/reports', {
    headers: { Authorization: \`Bearer \${API_KEY}\` }
  });
  return { reports: await res.json() };
};`,
      note:
        "$env/static/private only imports into server-only modules — SvelteKit fails the build if client-reachable code touches it — and each variable is a typed named export instead of an optional string on process.env.",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Why server-load data must be serialisable, in runnable form: watch what a JSON round-trip does to a class instance and a Date, then see the DTO pattern that survives the boundary. Predict all four logs.",
    code: `// A Doctrine-style entity: state + behaviour.
class UserEntity {
  constructor(
    public id: number,
    public email: string,
    public createdAt: Date
  ) {}
  displayName(): string {
    return this.email.split('@')[0];
  }
}

const entity = new UserEntity(7, 'ada@example.com', new Date('2026-01-01'));

// Naive serialisation (plain JSON) — what a network boundary does:
const wire = JSON.parse(JSON.stringify({ user: entity }));
console.log('method survived?', typeof wire.user.displayName); // gone
console.log('date survived?', typeof wire.user.createdAt);     // a string now

// SvelteKit uses devalue, which DOES keep Date/Map/Set/BigInt —
// but still rejects class instances and functions outright.
// The fix is the same one you used for PHP API responses:
// map the entity to a plain, typed DTO at the boundary.
interface UserDTO {
  id: number;
  displayName: string;
  joined: Date;
}

function toDTO(u: UserEntity): UserDTO {
  return { id: u.id, displayName: u.displayName(), joined: u.createdAt };
}

const data = { user: toDTO(entity) }; // safe to return from a server load
console.log('dto:', data.user.id, data.user.displayName);
console.log('joined is a real Date?', data.user.joined instanceof Date);`,
  },

  keyPoints: [
    "`+page.server.ts` exports a load typed `PageServerLoad` that runs **only** on the server — the right home for DB access, secrets and `$lib/server` imports.",
    "The server event adds `cookies` and `locals` (typed via `App.Locals` in `app.d.ts`), plus `request`, `clientAddress` and `platform`.",
    "Returned data is serialised with devalue: JSON types plus `Date`, `Map`, `Set`, `RegExp`, `BigInt` and cyclic references are fine; **class instances and functions are not** — map entities to plain DTOs.",
    "Server load may return promises, which SvelteKit streams to the browser as they resolve.",
    "Choose server load for anything private; universal load for public APIs or non-serialisable values. If both exist, server runs first and feeds the universal load's `data`.",
    "The page is oblivious to the difference: `let { data }: PageProps = $props()` types identically for either kind of load.",
  ],

  interview: [
    {
      q: "When do you use +page.server.ts instead of +page.ts?",
      a: "Whenever the data work must stay on the server: database queries, private environment variables, anything imported from `$lib/server`, or logic I simply don't want shipped to browsers. Server load also gets capabilities universal load doesn't — `cookies` and `locals` for session state, plus the raw `request`. I'd default to server load for private data and keep universal load for calling public APIs or returning values that can't be serialised, like class instances. When both exist, the server load runs first and its output arrives as the universal load's `data` property. It maps neatly to PHP: server load is the controller action that was always server-side anyway.",
    },
    {
      q: "What are the constraints on what a server load can return, and why?",
      a: "Its return value has to cross the network, so SvelteKit serialises it with devalue. That covers everything JSON does plus `Date`, `Map`, `Set`, `RegExp`, `BigInt`, and even repeated or cyclical references — but not class instances, functions or component constructors; those throw. So the discipline is the same as building a JSON API in PHP: flatten entities into plain DTO objects at the boundary. Notably you *can* return promises — SvelteKit streams the resolved values to the browser, which is handy for slow, non-critical data.",
    },
    {
      q: "What are locals, and how do they get typed?",
      a: "`locals` is per-request state on the server event — the SvelteKit equivalent of request attributes in a PSR-7 middleware stack. You populate it in the `handle` hook, typically with the authenticated user resolved from the session cookie, and every server load and API route on that request can read it. It's typed once, globally: you declare the shape in the `App.Locals` interface in `src/app.d.ts`, and from then on `locals.user` autocompletes in every `PageServerLoad` while `locals.usr` is a compile error.",
    },
  ],

  quiz: [
    {
      question: "Which of these can a +page.server.ts load safely return?",
      options: [
        "A UserEntity class instance with methods",
        "A function the page should call",
        "A Map of Dates keyed by id",
        "A Svelte component constructor",
      ],
      answerIndex: 2,
      explain:
        "devalue handles JSON types plus Date, Map, Set, RegExp, BigInt and cyclic references — so a Map of Dates is fine. Class instances, functions and component constructors can't be serialised; returning them from a server load throws.",
    },
    {
      question:
        "Where should the shape of `locals` (e.g. the authenticated user) be declared?",
      options: [
        "In every +page.server.ts that uses it",
        "In the App.Locals interface in src/app.d.ts",
        "In ./$types next to PageServerLoad",
        "It can't be typed — locals is always any",
      ],
      answerIndex: 1,
      explain:
        "app.d.ts declares the ambient App namespace; typing App.Locals once makes locals.user typed in every server load and endpoint. The generated ./$types picks it up automatically.",
    },
    {
      question:
        "A route has both +page.ts and +page.server.ts with load functions. What happens?",
      options: [
        "Build error — only one load per route",
        "The universal load wins and the server load is ignored",
        "The server load runs first; its result is the universal load's data property",
        "They run in parallel and their returns are merged automatically",
      ],
      answerIndex: 2,
      explain:
        "They compose: the server load's (serialisable) output is handed to the universal load as event.data, and whatever the universal load returns is what the page receives — useful for enriching server data with non-serialisable values.",
    },
    {
      question: "Why is importing $env/static/private inside +page.server.ts acceptable?",
      options: [
        "It isn't — env vars belong in hooks only",
        "Because server load code is never bundled for or executed in the browser",
        "Because devalue encrypts the values before sending them",
        "Because the browser strips private imports at runtime",
      ],
      answerIndex: 1,
      explain:
        "+page.server.ts is a server-only module: its code never reaches the client bundle, and SvelteKit fails the build if client-reachable code tries to import private env or $lib/server modules. The secret stays on the server unless you return it (don't).",
    },
  ],
};

export default lesson;
