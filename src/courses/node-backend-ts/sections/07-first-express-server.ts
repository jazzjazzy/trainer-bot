import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "first-express-server",
  title: "Your First Express 5 Server",
  part: "Express Essentials",
  estMinutes: 12,
  summary:
    "Express 5 is a thin routing-and-middleware layer over node:http — your server.ts is a front controller that runs ONCE, and app.listen keeps the process alive to serve every request.",

  concept: `
Express is the most widely deployed Node web framework, and **Express 5 is the
current stable major** (5.x — the npm default since 2025). Calibrate your
expectations correctly: Express is closer to **Slim than Laravel**. It gives
you routing, middleware, and request/response helpers — no ORM, no templating
opinions, no auth scaffolding. You assemble the stack yourself from npm, which
is exactly how Node teams like it.

### Install: the package and its types

\`\`\`bash
npm install express
npm install -D @types/express typescript tsx
\`\`\`

Express itself ships as untyped JavaScript; \`@types/express\` supplies the
TypeScript surface as a dev dependency — the same split as \`require\` vs
\`require-dev\` in composer.json.

### The whole server

\`\`\`ts
// src/server.ts
import express from 'express';
import type { Request, Response } from 'express';

const app = express();
app.use(express.json()); // parse JSON bodies — nothing is parsed for free

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/users/:id', (req: Request, res: Response) => {
  res.json({ id: req.params.id, name: 'Ada' });
});

app.post('/users', (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  res.status(201).json({ id: 7, name });
});

app.listen(3000, () => {
  console.log('API listening on http://localhost:3000');
});
\`\`\`

Run it with \`npx tsx src/server.ts\` (or \`tsx watch\` for auto-restart in dev).

### This file runs ONCE — that's the whole shift

Squint and \`server.ts\` looks like a Slim \`public/index.php\`: create app,
register routes, run. But the lifecycle is inverted. PHP re-executes the front
controller **for every request** — bootstrap, route, respond, die.
\`server.ts\` executes **once, at boot**: the \`const app = ...\` line, the
route registrations, anything else at module level. Only the *handler
callbacks* run per request, invoked by the event loop.

Two consequences follow. Module-level state persists across requests — a
\`const cache = new Map()\` above your routes is a real in-memory cache
(feature) and a place where one user's data can leak to another if you're
careless (footgun). And startup cost is paid once — no per-request autoloading
or container rebuild, which is a big part of why Node APIs feel fast.

### app.listen: Node IS the server

In PHP, your code never owns port 80 — Apache or nginx does, handing requests
to FPM workers. \`app.listen(3000)\` means **this process opens the socket and
keeps running**; kill the process and the API is gone. In production you'll
still put a reverse proxy in front (TLS, static files — covered in the
deployment section), but requests terminate *inside this process*, and there
is no separate web server to configure in development at all.
`,

  comparisons: [
    {
      label: "Front controller vs entry point",
      intro:
        "A /health endpoint in Slim and in Express 5. The code shape is nearly identical — the process lifecycle underneath is the opposite.",
      php: `<?php
// public/index.php — nginx+FPM re-runs this file for EVERY request
require __DIR__ . '/../vendor/autoload.php';

use Psr\\Http\\Message\\ResponseInterface as Response;
use Psr\\Http\\Message\\ServerRequestInterface as Request;
use Slim\\Factory\\AppFactory;

$app = AppFactory::create();

$app->get('/health', function (Request $req, Response $res) {
    $res->getBody()->write(json_encode(['status' => 'ok']));
    return $res->withHeader('Content-Type', 'application/json');
});

$app->run(); // serve this ONE request, then the worker resets`,
      ts: `// src/server.ts — this file executes ONCE, at boot
import express from 'express';
import type { Request, Response } from 'express';

const app = express();
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' }); // handler runs per request
});

app.listen(3000, () => {
  console.log('API listening on http://localhost:3000');
});
// execution "ends" here, but the process stays alive:
// the event loop dispatches every future request to the callbacks above`,
      note: "Slim's $app->run() handles one request and the worker throws state away; app.listen() keeps one process alive forever — route setup happens once, only the callbacks re-run.",
    },
    {
      label: "Who owns the socket?",
      intro:
        "What has to exist before your code answers an HTTP request — the PHP stack's three moving parts vs Node's one.",
      php: `# PHP: three moving parts before index.php runs
# 1. nginx owns port 80/443 and speaks HTTP
# 2. it forwards matching requests to PHP-FPM over FastCGI
# 3. an FPM worker executes index.php, responds, and resets

sudo systemctl status nginx        # the web server
sudo systemctl status php8.3-fpm   # the pool running YOUR code
cat /etc/nginx/sites-enabled/api   # the vhost wiring them together`,
      ts: `# Node: one moving part — your process owns the port
npx tsx src/server.ts
# API listening on http://localhost:3000

# No vhost, no FPM pool, no separate web server in dev.
# In production a reverse proxy usually fronts it (TLS, static
# files, buffering) — but requests still terminate IN this process,
# and if this process dies, nothing is serving.`,
      note: "There's no supervisor built in either: FPM restarts crashed workers for free, but keeping a Node process alive is your job (process managers and orchestrators — later in the course).",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Installing the framework",
      intro: "Adding the framework and its development tooling to a fresh project.",
      php: `composer require slim/slim slim/psr7

# types come built in — PHP 8 signatures ship with the package
composer require --dev phpstan/phpstan`,
      ts: `npm install express

# Express is untyped JS; the types are a separate dev dependency
npm install -D @types/express typescript tsx`,
      note: "@types/express is the require-dev of the TS world: compile-time only, contributed via DefinitelyTyped, never shipped to production behaviour.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "The server from the lesson is running in terminal 1. Predict what each of the three curl calls in terminal 2 returns — pay attention to which terminal prints what, the status codes, and the TYPE of the id field in each JSON body.",
    code: `# Terminal 1 — start the process (it does not exit: it IS the server)
npx tsx src/server.ts

# Terminal 2 — three requests against the one running process
curl -i http://localhost:3000/health

curl http://localhost:3000/users/42

curl -X POST http://localhost:3000/users -H 'Content-Type: application/json' -d '{"name":"Ada"}'`,
    output: `# Terminal 1
API listening on http://localhost:3000
# (no further output — the process stays in the foreground, serving)

# Terminal 2
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 15
# (Date, ETag and keep-alive headers trimmed)

{"status":"ok"}

{"id":"42","name":"Ada"}

{"id":7,"name":"Ada"}

# Note: "42" is a STRING (route params always are); the POST's id 7 is a
# number because the handler chose it. Ctrl+C in terminal 1 kills the API.`,
  },

  keyPoints: [
    "Express 5 is the current stable major (5.x). It's a Slim-sized micro-framework: routing + middleware + req/res helpers — you assemble everything else from npm.",
    "`npm install express` plus `npm install -D @types/express` — the framework is untyped JS; the TypeScript surface is a dev dependency, like require-dev.",
    "`server.ts` runs ONCE at boot, not per request like index.php: module-level code is startup code, and only the handler callbacks execute per request.",
    "Module-level state persists across requests — a deliberate cache is a feature; accidentally shared per-request data is the classic Node bug PHP never let you write.",
    "`app.listen(3000)` means your process owns the socket: there is no Apache/nginx+FPM layer handing you requests, and if the process exits, nothing is serving.",
    "`express.json()` must be registered before JSON bodies appear on `req.body` — Express parses nothing for free, unlike `$_POST`.",
  ],

  interview: [
    {
      q: "How does an Express entry point differ from a PHP front controller like public/index.php?",
      a: "They look alike — both create an app, register routes, and start handling — but the lifecycle is inverted. PHP re-executes the front controller for every request: autoload, bootstrap, route, respond, and then the worker discards all state. An Express server.ts executes exactly once at boot; app.listen keeps the process alive and the event loop invokes only the registered handler callbacks per request. That means bootstrap cost is paid once, module-level state like caches and connection pools persists across requests, and by the same token any state you accidentally share between requests leaks — a bug class PHP's die-after-each-request model made impossible.",
    },
    {
      q: "Where does Express sit in the framework landscape compared to Laravel or Symfony?",
      a: "Express is a micro-framework — the analogy is Slim, not Laravel. It provides routing, a middleware pipeline, and request/response helpers, and deliberately nothing else: no ORM, no validation, no templating opinions, no CLI scaffolding. Teams compose the rest from npm — pg or an ORM for data, zod for validation, pino for logging. That's also why Express skills transfer well: the composition pattern is the norm across Node backends, and even Fastify or NestJS interviews assume you understand this middleware-pipeline model.",
    },
    {
      q: "If Node is the web server, why do production deployments still put nginx in front of it?",
      a: "app.listen makes the Node process a fully capable HTTP server, so nothing is required in front of it — in dev you run bare. In production a reverse proxy still earns its place for the things a proxy does better: TLS termination, serving static assets, response buffering against slow clients, and fanning out to multiple Node processes for load balancing. The key difference from PHP is the division of labour: nginx+FPM was executing my code via FastCGI, while nginx in front of Node is just forwarding HTTP to a process that was already a server — the request still terminates inside my process.",
    },
  ],

  quiz: [
    {
      question:
        "A developer puts `const requestCount = { n: 0 }` at module level in server.ts and increments it in a handler. What happens?",
      options: [
        "It resets to 0 on every request, like a PHP variable",
        "It accumulates across ALL requests for the life of the process",
        "It throws — module-level state is read-only after listen()",
        "Each concurrent user gets their own copy",
      ],
      answerIndex: 1,
      explain:
        "server.ts runs once, so module-level state lives as long as the process and is shared by every request. That's how in-memory caches and connection pools work — and why stashing per-request data at module level leaks it between users. In PHP the dying process reset this for you.",
    },
    {
      question: "Why does a fresh Express 5 app return undefined for req.body on a JSON POST?",
      options: [
        "The client forgot to URL-encode the body",
        "Express only supports form bodies, not JSON",
        "No body parser is registered — you must add app.use(express.json())",
        "req.body only works inside app.post, not middleware",
      ],
      answerIndex: 2,
      explain:
        "Unlike PHP, which populates $_POST before your code runs, Express parses nothing by default. express.json() is the built-in middleware that reads the body stream and populates req.body for application/json requests — without it, req.body stays undefined in Express 5.",
    },
    {
      question: "What does app.listen(3000) actually do?",
      options: [
        "Registers the app with the system's web server on port 3000",
        "Spawns a pool of worker processes like PHP-FPM",
        "Opens the TCP socket in THIS process, which stays alive serving requests until it exits",
        "Compiles the routes and exits; a daemon serves them",
      ],
      answerIndex: 2,
      explain:
        "Your Node process is the web server: listen() binds the port and the event loop dispatches incoming requests to your callbacks indefinitely. There's no Apache/FPM equivalent underneath — if the process crashes or exits, the API is down, which is why production setups add a process manager.",
    },
  ],
};

export default lesson;
