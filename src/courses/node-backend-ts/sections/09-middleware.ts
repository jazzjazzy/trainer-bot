import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "middleware",
  title: "Middleware: The Pipeline You Already Know",
  part: "Express Essentials",
  estMinutes: 12,
  summary:
    "Express middleware is PSR-15 with different spelling: (req, res, next) functions run in registration order, mutate req instead of rebuilding it, and a forgotten next() hangs the request forever.",

  concept: `
If you've written PSR-15 middleware, you already understand Express. Same
onion: a request passes through a stack of handlers, each of which can act
before passing control on, act after control returns, or end the response
early. Only the spelling differs.

### The signature

\`\`\`ts
import type { Request, Response, NextFunction } from 'express';

function requestTimer(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  next();  // = $handler->handle($request) — run the rest of the stack
  console.log(\`\${req.method} \${req.url} took \${Date.now() - start}ms\`);
}
\`\`\`

PSR-15's \`process($request, $handler)\` *returns* a response up the chain;
Express middleware returns nothing — the response is built by mutating the
shared \`res\` object, and \`next()\` is how you yield to the rest of the stack.

### Registering: three scopes, one rule

\`\`\`ts
app.use(requestTimer);               // global — every request
app.use('/admin', requireAdmin);     // path-mounted — /admin and below
app.get('/profile', requireAuth, showProfile);  // route-level, before the handler
\`\`\`

The one rule: **registration order is execution order**. Register your body
parser after the routes that need it and they never see a parsed body. There's
no Laravel-style \`$middleware\` config array with priorities — the source
order of \`app.use\` calls is the pipeline.

### Mutating req: the req.user pattern

PSR-15 requests are immutable — \`withAttribute()\` returns a new object.
Express goes the other way: middleware **mutates \`req\` directly**, and the
convention for auth is to attach the current user as \`req.user\`. Out of the
box TypeScript rejects that (no such property), and the fix is a genuinely
useful trick — **declaration merging** onto Express's types:

\`\`\`ts
// src/types/express.d.ts
declare global {
  namespace Express {
    interface Request {
      user?: { id: number; email: string };
    }
  }
}

export {};  // keep this file a module
\`\`\`

Now \`req.user\` is typed in every handler — and it's optional, so TypeScript
still forces you to handle the not-logged-in case.

### The cardinal sin: forgetting next()

Every code path through a middleware must either call \`next()\` **or** send a
response — exactly once. A path that does neither leaves the request hanging:
no response, no error, no log. And here PHP instincts betray you — there's no
\`max_execution_time\` to kill the stragglers. The event loop is perfectly
happy; the client waits until *it* gives up. Calling \`next()\` *and* also
responding is the mirror bug — the next handler runs and double-responds.

One Express 5 upgrade worth knowing now: \`async\` middleware that throws (or
rejects) is automatically forwarded to your error middleware — no manual
\`.catch(next)\` wrapper, which Express 4 required. Error handling gets its own
section.
`,

  comparisons: [
    {
      label: "PSR-15 process() vs (req, res, next)",
      intro:
        "An auth check: reject unauthenticated requests with a 401, otherwise attach the user and continue. Immutable-and-return vs mutate-and-next.",
      php: `<?php
final class AuthMiddleware implements MiddlewareInterface
{
    public function process(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler
    ): ResponseInterface {
        $token = $request->getHeaderLine('Authorization');
        if ($token === '') {
            return new JsonResponse(['error' => 'unauthenticated'], 401);
        }
        // immutable: withAttribute returns a NEW request object
        $request = $request->withAttribute('user', $this->fromToken($token));
        return $handler->handle($request);
    }
}`,
      ts: `import type { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization; // header keys are lowercased
  if (!token) {
    return res.status(401).json({ error: 'unauthenticated' });
    // responding WITHOUT calling next() ends the pipeline here
  }
  req.user = userFromToken(token); // mutate req directly — typed via
  next();                          // declaration merging on Express.Request
}`,
      note: "PSR-15 returns responses up an immutable chain; Express mutates shared req/res and signals with next() — less ceremony, but nothing stops you calling next() twice or not at all, so discipline replaces the type system here.",
    },
    {
      label: "Registration and ordering",
      intro:
        "Wiring CORS, auth, and a route-specific check. Watch who controls execution order in each framework.",
      php: `<?php
// Slim 4 — middleware wraps the app LIFO:
// the LAST one added runs FIRST
$app->add(new AuthMiddleware());  // runs second
$app->add(new CorsMiddleware()); // added last, runs first

// per-route middleware
$app->get('/profile', ShowProfileAction::class)
    ->add(new RequireLogin());`,
      ts: `// Express — registration order IS execution order, top to bottom
app.use(cors());        // runs first
app.use(requireAuth);   // runs second

// path-scoped: only /admin/* passes through this
app.use('/admin', requireAdmin);

// route-level: runs after the globals, before the handler
app.get('/profile', requireLogin, showProfile);`,
      note: "Slim wraps LIFO (last added = outermost layer); Express dispatches in source order. Either way the ordering rule is the first thing to check when auth 'mysteriously' doesn't run.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The Express pipeline in ~15 lines: runPipeline is essentially what app.use builds. Predict the log order for both requests — note how logger prints AFTER the handler (the onion), and what never happens in request 2.",
    code: `// The Express pipeline in miniature: each middleware gets (req, res, next).
type Req = { path: string; token?: string; user?: string };
type Res = { status: number; body: string; sent: boolean };
type Middleware = (req: Req, res: Res, next: () => void) => void;

function runPipeline(stack: Middleware[], req: Req, res: Res): void {
  let i = 0;
  const next = (): void => {
    const mw = stack[i++];
    if (mw) mw(req, res, next);
  };
  next();
}

const logger: Middleware = (req, res, next) => {
  console.log('-> logger: ' + req.path);
  next(); // hand off to the rest of the stack...
  console.log('<- logger: ' + res.status + ' ' + res.body); // ...then finish
};

const auth: Middleware = (req, res, next) => {
  console.log('-> auth');
  if (!req.token) {
    res.status = 401;
    res.body = '{"error":"unauthenticated"}';
    res.sent = true;
    console.log('<- auth: responded early, next() never called');
    return; // short-circuit: the handler below never runs
  }
  req.user = 'user-' + req.token; // the req.user pattern
  next();
};

const handler: Middleware = (req, res) => {
  console.log('   handler runs as ' + req.user);
  res.status = 200;
  res.body = '{"hello":"' + req.user + '"}';
  res.sent = true;
  // a handler that neither responds nor calls next() = request hangs forever
};

console.log('--- request 1: valid token ---');
runPipeline([logger, auth, handler], { path: '/profile', token: 'abc' }, { status: 0, body: '', sent: false });

console.log('--- request 2: no token ---');
runPipeline([logger, auth, handler], { path: '/profile' }, { status: 0, body: '', sent: false });`,
  },

  keyPoints: [
    "Express middleware is PSR-15 respelled: `(req, res, next)` instead of `process($request, $handler)` — `next()` is `$handler->handle()`, and code after `next()` runs on the way back out of the onion.",
    "Three scopes: `app.use(fn)` for every request, `app.use('/admin', fn)` for a path subtree, and `app.get('/x', fn, handler)` for one route — all executed in REGISTRATION order.",
    "PSR-15 requests are immutable (`withAttribute` returns a copy); Express middleware mutates `req` directly — `req.user` is the standard place for the authenticated user.",
    "Type `req.user` once via declaration merging: a `.d.ts` file with `declare global { namespace Express { interface Request { user?: ... } } }` makes it available (and optional) everywhere.",
    "Every path through a middleware must call `next()` or send a response — exactly once. Neither = the request hangs forever (no `max_execution_time` will save you); both = a double-response error.",
    "In Express 5, a rejected async middleware is automatically forwarded to error middleware — the `.catch(next)` boilerplate is an Express 4 legacy.",
  ],

  interview: [
    {
      q: "You know PSR-15 from PHP — how does Express middleware compare?",
      a: "Conceptually identical: an ordered pipeline where each element can act before and after the rest of the chain, or short-circuit with an early response — auth, CORS, logging live in the same layer in both worlds. Mechanically they differ in two ways. PSR-15 is immutable and return-based: process() receives a request, may derive a new one with withAttribute(), and returns a ResponseInterface up the chain. Express is mutation-based: middleware mutates the shared req and res objects, signals continuation by calling next(), and returns nothing. That makes Express middleware terser but less protected — nothing in the types stops you from forgetting next() or calling it after already responding, so the discipline the PSR-15 interfaces enforced becomes a code-review concern.",
    },
    {
      q: "How do you make req.user type-safe in an Express + TypeScript codebase?",
      a: "With declaration merging. The @types/express types expose a global Express namespace precisely so applications can extend it: in a .d.ts file I declare `namespace Express { interface Request { user?: AuthUser } }` inside `declare global`, and TypeScript merges that property into every Request in the project. I keep the property optional — middleware populates it, but handlers on unauthenticated routes see `user?: AuthUser` and are forced to handle absence. It's the typed equivalent of PSR-7's getAttribute('user'), except the compiler knows about it instead of it being a stringly-typed bag.",
    },
    {
      q: "What happens if a middleware neither calls next() nor sends a response — and how is that worse than the PHP equivalent?",
      a: "The request simply hangs: the pipeline stops, no response is written, and Express raises no error because from its perspective the middleware might still be doing async work. The client waits until its own timeout gives up. In PHP an equivalent stall gets killed by max_execution_time and at least produces a 500 and a log line; Node has no per-request execution limit, so the failure is silent — you typically discover it as mounting 'pending' requests or a client-side timeout spike. The discipline is that every branch calls next() or responds, exactly once; server-side timeout middleware can act as a safety net.",
    },
  ],

  quiz: [
    {
      question: "In Express middleware, what is the equivalent of PSR-15's $handler->handle($request)?",
      options: [
        "return res",
        "Calling next()",
        "app.next(req)",
        "Returning the modified req object",
      ],
      answerIndex: 1,
      explain:
        "next() hands control to the remaining middleware and route handler — the rest of the onion. Unlike PSR-15 you don't get the response back as a return value, but code placed after next() still runs once the inner layers finish, which is how response-time loggers work.",
    },
    {
      question:
        "A middleware has a branch that logs a message but neither calls next() nor sends a response. What does the client see?",
      options: [
        "A 500 after Express's default 30-second timeout",
        "An empty 200 response",
        "Nothing — the request hangs until the client itself times out",
        "The process crashes with an unhandled error",
      ],
      answerIndex: 2,
      explain:
        "Express can't distinguish 'forgot to continue' from 'still awaiting something', so it waits forever — there is no built-in request timeout and no max_execution_time to kill the request. The process stays healthy; only that request is stuck. Every branch must next() or respond.",
    },
    {
      question: "Why does TypeScript reject req.user = currentUser in a fresh Express project, and what's the idiomatic fix?",
      options: [
        "req is frozen at runtime; store the user in res.locals instead",
        "The Request type doesn't declare user; extend it via declaration merging on the global Express namespace",
        "You must cast: (req as any).user — there is no typed solution",
        "user is reserved by Express for its session integration",
      ],
      answerIndex: 1,
      explain:
        "req is a plain mutable object at runtime — the block is purely type-level, since @types/express doesn't know your app attaches user. Declaring `namespace Express { interface Request { user?: ... } }` in a global .d.ts merges the property in project-wide; the any-cast works but forfeits exactly the safety you added TypeScript for.",
    },
  ],
};

export default lesson;
