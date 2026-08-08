import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "route-handlers",
  title: "Route Handlers: Your API Layer",
  part: "Mutations & APIs",
  estMinutes: 11,
  summary:
    "route.ts files export HTTP-method functions built on standard Request/Response — this is the App Router's API controller, and the PHP developer's home turf.",

  concept: `
Not every consumer of your backend is your own React UI. Mobile apps, webhook
senders (Stripe, GitHub), cron jobs, and third-party integrations all need
plain HTTP endpoints that return JSON. In the App Router that's a **route
handler**: a \`route.ts\` file that exports one function per HTTP method. If
you have ever written an \`api.php\` that switches on \`$_SERVER['REQUEST_METHOD']\`,
this is that — with the switch dissolved into named exports.

### One export per method

\`\`\`ts
// app/api/posts/route.ts
export async function GET(request: Request) {
  const posts = await db.post.findMany();
  return Response.json(posts);            // 200, application/json
}

export async function POST(request: Request) {
  const body = await request.json();      // like reading php://input
  const post = await db.post.create({ data: body });
  return Response.json(post, { status: 201 });
}
\`\`\`

The supported exports are \`GET\`, \`POST\`, \`PUT\`, \`PATCH\`, \`DELETE\`, \`HEAD\`,
and \`OPTIONS\`. A method you didn't export gets an automatic **405 Method Not
Allowed** — no manual guard clause. One rule of cohabitation: \`route.ts\`
cannot sit at the same path segment as a \`page.tsx\`, because both would claim
the same URL.

### Web-standard Request/Response, plus Next's extensions

Handlers are built on the standard \`Request\` and \`Response\` — the same
objects \`fetch\` uses. Next also offers \`NextRequest\` and \`NextResponse\`
with conveniences: \`request.nextUrl.searchParams\` for parsed query strings
(your \`$_GET\`), \`request.cookies\` for typed cookie access, and
\`NextResponse.json()\` which can carry a typed payload. Use the standard
types until you need the extras.

Dynamic segments follow the exact same rule as pages — \`params\` is a
**Promise** you await:

\`\`\`ts
// app/api/posts/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = await db.post.findUnique({ where: { id } });
  if (!post) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(post);
}
\`\`\`

### Caching: uncached by default

Since Next 15, \`GET\` route handlers are **not cached by default** — every
request runs your function, per-request like PHP. That's almost always what
an API wants. You can opt a handler into static behavior with
\`export const dynamic = 'force-static'\` (paired with \`revalidate\` for
periodic refresh), but the default is dynamic. Never repeat the Next 13/14-era
claim that GET handlers are cached automatically.

### Route handlers vs Server Actions — the interview question

Both run server code. Choose by **who calls it**:

- **Server Actions** — your own app's mutations, invoked from your forms and
  components. Next manages the endpoint, serialization, and the revalidate/
  redirect dance. No URL you'd ever document.
- **Route handlers** — anything *outside* your React tree: webhook receivers,
  a mobile client, a public API, OAuth callbacks, file downloads, anything
  needing explicit status codes and headers on a stable, documented URL.

A useful heuristic: if you would have written it as a controller in Laravel or
Symfony (or an \`api/*.php\` endpoint), it's a route handler. If it's a form
your own pages submit, it's an action.
`,

  comparisons: [
    {
      label: "A JSON list endpoint",
      intro:
        "GET /api/posts returns the post list as JSON. PHP sets the header and echoes; the route handler returns a Response object from an exported GET function.",
      php: `<?php // api/posts.php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$stmt = $pdo->query(
    'SELECT id, title FROM posts ORDER BY id DESC'
);
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));`,
      ts: `// app/api/posts/route.ts
import { db } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? 20);

  const posts = await db.post.findMany({
    orderBy: { id: 'desc' },
    take: limit,
  });

  // Sets Content-Type: application/json and status 200
  return Response.json(posts);
}

// No POST export here -> POST /api/posts returns 405 automatically`,
      note:
        "The URL comes from the file path (app/api/posts/route.ts -> /api/posts), the method comes from the export name, and unexported methods 405 for free — three things the PHP version handles by hand.",
      rightLang: "ts",
    },
    {
      label: "Reading a POST body",
      intro:
        "Accept a JSON payload and create a record, replying 201 with the new resource. PHP reads the raw php://input stream; the handler awaits request.json().",
      php: `<?php // api/posts.php (POST branch)
header('Content-Type: application/json');

$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);

if (!is_array($body) || empty($body['title'])) {
    http_response_code(400);
    echo json_encode(['error' => 'title is required']);
    exit;
}

$stmt = $pdo->prepare('INSERT INTO posts (title) VALUES (?)');
$stmt->execute([$body['title']]);

http_response_code(201);
echo json_encode(['id' => $pdo->lastInsertId()]);`,
      ts: `// app/api/posts/route.ts
import { z } from 'zod';
import { PostSchema } from '@/lib/schemas';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  const body: unknown = await request.json();

  const parsed = PostSchema.safeParse(body); // Zod, as ever
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const post = await db.post.create({ data: parsed.data });
  return Response.json(post, { status: 201 });
}`,
      note:
        "await request.json() is the typed-world php://input + json_decode. The body arrives as unknown — validating it with the same Zod schema you use in actions keeps one source of truth for the shape.",
      rightLang: "ts",
    },
    {
      label: "A dynamic segment: /api/posts/[id]",
      intro:
        "Fetch one post by id from the URL path. PHP parses the path (or reads ?id=); the handler receives params as a Promise — the same async rule as pages.",
      php: `<?php // api/post.php  (via /api/post.php?id=42)
header('Content-Type: application/json');

$id = (int) ($_GET['id'] ?? 0);

$stmt = $pdo->prepare('SELECT * FROM posts WHERE id = ?');
$stmt->execute([$id]);
$post = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$post) {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
    exit;
}
echo json_encode($post);`,
      ts: `// app/api/posts/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;   // same Promise rule as page params

  const post = await db.post.findUnique({ where: { id } });

  if (!post) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return Response.json(post);
}`,
      note:
        "The [id] folder gives you a real path (/api/posts/42) instead of a query string, and params is a Promise in Next 16 — await it, exactly as in page components.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A route-handler dispatcher in miniature: (method, path) maps onto handler functions, unmatched methods get 405 and unmatched paths 404 — predict the four printed responses, then run it.",
    code: `// How Next dispatches to route.ts exports, in miniature.

interface ApiResponse {
  status: number;
  json: unknown;
}

type Handler = (body?: unknown) => ApiResponse;

const posts = [
  { id: 1, title: 'Server Components' },
  { id: 2, title: 'Route Handlers' },
];

// Each entry plays the role of one exported function in a route.ts:
const routes: Record<string, Record<string, Handler>> = {
  '/api/posts': {
    GET: () => ({ status: 200, json: posts }),
    POST: (body) => {
      const title = (body as { title?: string })?.title;
      if (!title) return { status: 400, json: { error: 'title is required' } };
      const post = { id: posts.length + 1, title };
      posts.push(post);
      return { status: 201, json: post };
    },
  },
  '/api/health': {
    GET: () => ({ status: 200, json: { ok: true } }),
  },
};

function dispatch(method: string, path: string, body?: unknown): ApiResponse {
  const route = routes[path];
  if (!route) return { status: 404, json: { error: 'Not found' } };

  const handler = route[method];
  // Next does this for you: method exists on other verbs -> 405
  if (!handler) return { status: 405, json: { error: 'Method not allowed' } };

  return handler(body);
}

const requests: Array<[string, string, unknown?]> = [
  ['GET', '/api/posts'],
  ['POST', '/api/posts', { title: 'Caching' }],
  ['DELETE', '/api/posts'],          // no DELETE export
  ['GET', '/api/users'],             // no such route.ts
];

for (const [method, path, body] of requests) {
  const res = dispatch(method, path, body);
  console.log(\`\${method} \${path} -> \${res.status} \${JSON.stringify(res.json)}\`);
}`,
  },

  keyPoints: [
    "A `route.ts` file exports one async function per HTTP method (`GET`, `POST`, `PATCH`, ...); the file's folder path is the URL, and unexported methods answer 405 automatically.",
    "Handlers speak web-standard `Request`/`Response` — `await request.json()` reads the body (the typed `php://input`), `Response.json(data, { status: 201 })` replies.",
    "`NextRequest`/`NextResponse` add conveniences like `nextUrl.searchParams` and typed cookies — reach for them when the standard objects fall short.",
    "Dynamic segments pass `params` as a Promise, same as pages: `const { id } = await params`.",
    "GET route handlers are NOT cached by default since Next 15 — every request executes, per-request like PHP; opt into static with `export const dynamic = 'force-static'`.",
    "Choose by caller: Server Actions for your own app's form mutations, route handlers for external consumers — webhooks, mobile clients, public APIs, anything needing a documented URL and explicit status codes.",
  ],

  interview: [
    {
      q: "When would you use a route handler instead of a Server Action?",
      a: "I decide by who the caller is. Server Actions are for my own application's mutations — forms and components inside my React tree — where Next manages the endpoint and I get progressive enhancement plus the revalidate/redirect flow. Route handlers are for everything outside that tree: webhook receivers for Stripe or GitHub, a mobile app consuming JSON, OAuth callbacks, file streaming, any public API where I need a stable documented URL, explicit status codes, and control of headers. Coming from PHP: if I'd have built it as an API controller or an api.php endpoint, it's a route handler; if it's my own page's form POST, it's an action.",
    },
    {
      q: "Describe the anatomy of a route handler file and how a request reaches it.",
      a: "It's a `route.ts` file whose folder determines the URL — `app/api/posts/[id]/route.ts` serves `/api/posts/42` — and it exports one async function per HTTP method: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. Each receives a web-standard `Request` (Next's `NextRequest` adds `nextUrl.searchParams` and typed cookies) and, for dynamic routes, a context object whose `params` is a Promise I await — the same async rule as pages in Next 16. I return a `Response`, usually via `Response.json(data, { status })`. Methods I don't export get a 405 automatically, and a `route.ts` can't share a segment with a `page.tsx` since both would claim the URL.",
    },
    {
      q: "Are GET route handlers cached? Answer for the current version of Next.js.",
      a: "No — since Next 15, GET route handlers are dynamic by default: every request executes the function, which is what APIs almost always want and matches PHP's per-request model. This is a deliberate reversal of Next 13/14, where GET handlers were cached unless you used the request object or opted out — a common source of stale-API bugs. Today caching is opt-in: `export const dynamic = 'force-static'` makes the handler static, and pairing it with `revalidate` gives periodic regeneration. In an interview I'd flag the version difference explicitly, since teams on 14 still live with the old behavior.",
    },
  ],

  quiz: [
    {
      question:
        "A route.ts exports only GET. What does a POST request to that URL receive?",
      options: [
        "200 with an empty body",
        "The GET handler's response — methods fall through",
        "An automatic 405 Method Not Allowed",
        "A 404 Not Found",
      ],
      answerIndex: 2,
      explain:
        "Next maps each HTTP method to its exported function and answers 405 for any method the file doesn't export — the guard clause PHP endpoints write by hand against $_SERVER['REQUEST_METHOD'].",
    },
    {
      question: "How does a route handler read a JSON POST body?",
      options: [
        "const body = request.body — it's already parsed",
        "const body = await request.json()",
        "file_get_contents('php://input') via a Node shim",
        "Route handlers only accept FormData, not JSON",
      ],
      answerIndex: 1,
      explain:
        "Handlers use the web-standard Request, so the body is read asynchronously with await request.json() — the equivalent of json_decode(file_get_contents('php://input'), true). The result is unknown-shaped, so validate it before use.",
    },
    {
      question:
        "In Next.js 16, what is the default caching behavior of a GET route handler?",
      options: [
        "Cached indefinitely until revalidatePath is called",
        "Cached for 60 seconds",
        "Not cached — the function runs on every request",
        "Cached only in production builds",
      ],
      answerIndex: 2,
      explain:
        "Since Next 15, GET handlers are dynamic by default — per-request execution, like PHP. Automatic caching of GET handlers was Next 13/14 behavior; today you opt in with export const dynamic = 'force-static'.",
    },
  ],
};

export default lesson;
