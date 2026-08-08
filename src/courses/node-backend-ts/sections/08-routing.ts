import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "routing",
  title: "Routing: Params, Routers, and Express 5 Path Syntax",
  part: "Express Essentials",
  estMinutes: 13,
  summary:
    "Route params arrive as strings, routes match in registration order, express.Router() splits routes into modules — and Express 5's path-to-regexp v8 syntax makes most old Stack Overflow answers crash at startup.",

  concept: `
### Params are always strings

\`app.get('/users/:id', ...)\` captures \`req.params.id\` — **as a string**,
always, exactly like \`$_GET\`. \`/users/42\` gives you \`"42"\`; convert and
validate yourself (\`Number(req.params.id)\` plus a \`Number.isNaN\` check, or a
schema — the validation section makes this systematic). There is no
Laravel-style route-model binding: nobody fetches the User row or 404s for
you.

### req.query — a read-only getter in Express 5

\`/products?category=books&page=2\` gives \`req.query.category\` and
\`req.query.page\` (strings again). In Express 5 \`req.query\` is a **read-only
getter**, parsed lazily from the URL — assigning \`req.query = {...}\`, which
some Express 4 middleware did, now fails. Treat it as input, never a scratch
space.

### express.Router() — routes/web.php, as modules

Nobody lists forty routes in server.ts. A Router is a mountable mini-app:

\`\`\`ts
// src/routes/users.ts
import { Router } from 'express';

export const users = Router();

users.get('/', listUsers);      // paths are RELATIVE to the mount point
users.get('/:id', showUser);
users.post('/', createUser);
\`\`\`

\`\`\`ts
// src/server.ts
import { users } from './routes/users.js';
app.use('/users', users);       // the prefix lives here, like Route::prefix()
\`\`\`

This is Laravel's \`Route::prefix('users')->group(...)\` with the grouping done
by the module system instead of a fluent API.

### Ordering: first match wins

Express checks routes **in registration order** and dispatches to the first
match. Register \`/users/:id\` before \`/users/new\` and a request for
\`/users/new\` arrives with \`req.params.id === 'new'\` — no error, just wrong
behaviour. Rule: **static routes before parameterised ones, catch-alls last**.
PHP routers like Laravel's or FastRoute compile the whole route table up front
and can optimise matching; Express literally walks your registration list, so
the order you wrote is the contract.

### Express 5 path syntax — the #1 Stack Overflow trap

Express 5 upgraded its matcher to **path-to-regexp v8**, and the pattern
syntax changed. Old answers show Express 4 patterns that now **throw at
startup**:

- **Wildcards must be named.** Bare \`*\` is gone: use \`/*splat\` (one or more
  segments; \`req.params.splat\` is an *array* of segments) or \`/{*splat}\` if
  it may also match nothing.
- **Optional segments use braces.** \`/users/:id?\` becomes \`/users{/:id}\` —
  the whole braced group is optional.
- **No regex inside route strings.** \`/user/:id(\\\\d+)\` throws; match
  \`/user/:id\` and validate the format in the handler or a schema.

When a copied route pattern crashes with a path-to-regexp error, you've found
an Express 4 answer — translate the pattern before trusting the rest of it.
`,

  comparisons: [
    {
      label: "Route params: model binding vs raw strings",
      intro:
        "GET /users/42 returns the user as JSON, or 404. Laravel resolves the model from the URL for you; Express hands you a string and steps back.",
      php: `<?php
// routes/api.php — Laravel route-model binding
use App\\Models\\User;
use Illuminate\\Support\\Facades\\Route;

Route::get('/users/{user}', function (User $user) {
    // {user} was resolved to a User row; missing row = automatic 404
    return response()->json($user);
});`,
      ts: `// src/routes/users.ts
import { Router } from 'express';
import { findUser } from '../db.js';

export const users = Router();

users.get('/:id', async (req, res) => {
  const id = Number(req.params.id);          // params are ALWAYS strings
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  const user = await findUser(id);           // your query, your 404
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json(user);
});`,
      note: "No binding, no implicit 404, no type coercion — Express gives you the raw string and the three lines of handling Laravel hid are now visibly yours (validation middleware will tidy this up later).",
    },
    {
      label: "Grouping routes into modules",
      intro:
        "A users resource with list/show/create. Laravel groups with a fluent prefix; Express groups with a Router that the file system organises.",
      php: `<?php
// routes/api.php
use App\\Http\\Controllers\\UserController;
use Illuminate\\Support\\Facades\\Route;

Route::prefix('users')->group(function () {
    Route::get('/', [UserController::class, 'index']);
    Route::get('/{id}', [UserController::class, 'show']);
    Route::post('/', [UserController::class, 'store']);
});`,
      ts: `// src/routes/users.ts — one Router per resource
import { Router } from 'express';
import { listUsers, showUser, createUser } from '../handlers/users.js';

export const users = Router();
users.get('/', listUsers);
users.get('/:id', showUser);
users.post('/', createUser);

// src/server.ts — mounting supplies the prefix
import { users } from './routes/users.js';
app.use('/users', users);`,
      note: "A Router is a mini-app: it can carry its own middleware (auth for everything under /admin, say) and nests — app.use composes them the way Route::prefix()->group() nests closures.",
    },
    {
      label: "Express 4 answers vs Express 5 reality",
      intro:
        "Three patterns straight from highly-upvoted old answers, and what Express 5 (path-to-regexp v8) requires instead. The left column throws at startup on Express 5.",
      php: `// Express 4 — what old Stack Overflow answers still show
app.get('*', catchAll);              // bare wildcard
app.get('/users/:id?', showUser);    // ?-suffix optional param
app.get('/user/:id(\\\\d+)', byId);    // inline regex in the string

// On Express 5 every one of these throws at startup
// with a path-to-regexp error.`,
      ts: `// Express 5 — path-to-regexp v8 syntax
app.get('/{*splat}', catchAll);      // wildcards must be NAMED;
                                     // braces let it match '/' too;
                                     // req.params.splat is an ARRAY

app.get('/users{/:id}', showUser);   // optional SEGMENT via braces

app.get('/user/:id', byId);          // no regex in strings —
                                     // validate req.params.id in the
                                     // handler (or with a schema)`,
      note: "A path-to-regexp startup crash is your signal the answer you copied targets Express 4 — the fix is mechanical: name wildcards, brace optionals, move regex checks into code.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A router in 20 lines — the core of what Express does with '/users/:id'. Predict each logged line, especially the last one: what happens to /users/new once the registration order is flipped?",
    code: `// A router in 20 lines: how Express turns '/users/:id' into req.params.
function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const patParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    const pat = patParts[i];
    if (pat.startsWith(':')) {
      params[pat.slice(1)] = pathParts[i]; // captured — ALWAYS a string
    } else if (pat !== pathParts[i]) {
      return null; // static segment mismatch
    }
  }
  return params;
}

console.log(matchRoute('/users/:id', '/users/42'));
console.log(matchRoute('/users/:id/posts/:postId', '/users/7/posts/99'));
console.log(matchRoute('/users/:id', '/orders/42')); // static mismatch
console.log(matchRoute('/users/:id', '/users')); // length mismatch

// Dispatch = try routes IN REGISTRATION ORDER, first match wins:
const routes = ['/users/new', '/users/:id'];
function dispatch(path: string): string {
  for (const pattern of routes) {
    const params = matchRoute(pattern, path);
    if (params) return pattern + ' -> ' + JSON.stringify(params);
  }
  return '404';
}

console.log(dispatch('/users/new')); // the static route wins...
console.log(dispatch('/users/42')); // ...and :id catches the rest

// Flip the registration order and the trap springs:
routes.reverse();
console.log(dispatch('/users/new')); // now :id swallows it — id is "new"`,
  },

  keyPoints: [
    "`req.params` values are ALWAYS strings, like `$_GET` — convert with `Number()` and validate yourself; there is no route-model binding doing it for you.",
    "In Express 5 `req.query` is a read-only getter parsed lazily from the URL — code that assigned to `req.query` (an Express 4 habit) breaks.",
    "`express.Router()` is a mountable mini-app: define relative paths in `src/routes/users.ts`, then `app.use('/users', users)` supplies the prefix — Laravel's `Route::prefix()->group()` via the module system.",
    "Routes match in REGISTRATION ORDER, first match wins: static routes before parameterised ones, catch-alls last, or `/users/new` arrives as `id: 'new'`.",
    "Express 5 uses path-to-regexp v8: wildcards must be named (`/{*splat}`, params value is an array), optional segments use braces (`/users{/:id}`), and inline regex like `:id(\\\\d+)` is gone.",
    "Express 4 route patterns throw at startup on Express 5 — a path-to-regexp error means the Stack Overflow answer you copied is for the old major.",
  ],

  interview: [
    {
      q: "What actually changed in route path syntax between Express 4 and Express 5, and why does it matter day to day?",
      a: "Express 5 upgraded its matcher to path-to-regexp v8, which tightened the pattern language. Bare `*` wildcards must now be named — `/*splat`, or `/{*splat}` to also match the root — and the captured value is an array of segments. Optional parameters moved from the `?` suffix to brace groups: `/users/:id?` becomes `/users{/:id}`. And inline regex constraints like `/user/:id(\\\\d+)` are gone entirely — you match broadly and validate in the handler or a schema. It matters because a decade of tutorials and Stack Overflow answers show Express 4 patterns, and they don't degrade gracefully — they throw at startup. Recognising a path-to-regexp error as 'this answer is for Express 4' saves real debugging time.",
    },
    {
      q: "How do you structure routes in a non-trivial Express app?",
      a: "One express.Router() per resource, each in its own module — src/routes/users.ts exports a Router with paths relative to its mount, and server.ts composes them with app.use('/users', usersRouter). It's the same grouping instinct as Laravel's Route::prefix()->group() or separate route files, but the module system does the grouping. Routers are mini-apps, so cross-cutting concerns attach naturally: an admin Router can carry an auth middleware that guards everything mounted beneath it. Handlers themselves I keep in separate files so route wiring stays a readable table of contents.",
    },
    {
      q: "A request to /users/new is hitting your /users/:id handler with id 'new'. What happened?",
      a: "That's route ordering. Express matches in registration order and dispatches to the first hit, so if /users/:id was registered before /users/new, the parameterised route captures 'new' as the id — no error, just wrong dispatch, typically surfacing as a weird 400 or 404 from the id validation. The fix is to register static routes before parameterised ones and catch-alls last. It's a sharper edge than in Laravel, where the router also matches in definition order but conventions and resource controllers usually keep you out of trouble — in Express the registration list IS the routing table.",
    },
  ],

  quiz: [
    {
      question: "For app.get('/orders/:id', ...) with a request to /orders/42, what is req.params.id?",
      options: [
        "The number 42",
        "The string '42'",
        "An Order model instance",
        "undefined until express.json() runs",
      ],
      answerIndex: 1,
      explain:
        "Route params are captured from the URL, so they're always strings — same as $_GET. Number(req.params.id) plus validation is on you; Express has no route-model binding. express.json() is about request bodies, not params.",
    },
    {
      question: "Which route pattern is valid in Express 5?",
      options: [
        "app.get('*', handler)",
        "app.get('/users/:id?', handler)",
        "app.get('/user/:id(\\\\d+)', handler)",
        "app.get('/files/{*path}', handler)",
      ],
      answerIndex: 3,
      explain:
        "path-to-regexp v8 requires named wildcards ({*path} — the braces also let it match nothing), uses braces instead of ? for optional segments (/users{/:id}), and no longer supports inline regex. The other three are Express 4 syntax and throw at startup.",
    },
    {
      question:
        "You register app.get('/users/:id') and then app.get('/users/me'). What happens to GET /users/me?",
      options: [
        "Express picks /users/me because static routes have priority",
        "Express throws a duplicate-route error at startup",
        "The :id handler runs with req.params.id === 'me'",
        "Both handlers run in order",
      ],
      answerIndex: 2,
      explain:
        "Express walks routes in registration order and stops at the first match — there is no specificity ranking. /users/:id matches /users/me, so it wins and id is the string 'me'. Register static routes first; only middleware chains run multiple handlers, and only via next().",
    },
  ],
};

export default lesson;
