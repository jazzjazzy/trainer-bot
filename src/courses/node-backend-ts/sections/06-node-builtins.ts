import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "node-builtins",
  title: "The Standard Library: http, fs, path, URL",
  part: "The Runtime Shift",
  estMinutes: 12,
  summary:
    "Node's standard library is a small set of namespaced modules — node:http, node:fs/promises, node:path, URL, node:crypto — instead of PHP's thousands of global functions, and npm fills in the rest.",

  concept: `
PHP's standard library is enormous: thousands of functions sitting in the global
namespace — \`str_replace\`, \`array_map\`, \`file_get_contents\`, \`json_encode\` —
always available, never imported. Node takes the opposite bet: a **small** core
organised into namespaced modules you import explicitly, with npm supplying
everything else. Since Node 18 the convention is to import builtins with the
\`node:\` prefix — it makes \`node:fs\` unmistakably the runtime's module rather
than something from \`node_modules\`, and it fails fast on typos.

### node:http — the thing Express wraps

This is the payoff of the tour. A working JSON API with **zero dependencies**:

\`\`\`ts
// server.ts
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(3000);
\`\`\`

Notice what is *missing*: no \`$_GET\`, no \`$_POST\`, no routing. \`req\` is a
readable **stream** (a POST body arrives in chunks you must collect yourself)
and \`res\` is a writable stream. \`req.url\` is the raw string \`/health?x=1\` —
nobody has parsed it for you. Every framework you'll meet — Express, Fastify —
is a layer over exactly this callback. Once you've seen it raw, Express stops
being magic.

### node:fs/promises — file_get_contents, the async way

\`\`\`ts
import { readFile, writeFile } from 'node:fs/promises';

const raw = await readFile('./config.json', 'utf8'); // string, thanks to 'utf8'
await writeFile('./out.txt', 'hello');
\`\`\`

Without the \`'utf8'\` encoding argument you get a \`Buffer\` (raw bytes), not a
string — the classic first-week bug. A synchronous twin exists
(\`readFileSync\` from \`node:fs\`), and here the runtime shift bites: in PHP a
blocking read delays *one request in one worker*. In Node's single event-loop
process, a sync read in a request handler stalls **every concurrent user**.
Sync calls are fine at boot (loading config before \`listen\`), never per-request.

### node:path — and where did __dirname go?

Build paths with \`path.join\` / \`path.resolve\` instead of string concatenation.
The CJS globals \`__dirname\`/\`__filename\` don't exist in ESM; the modern
equivalent of PHP's \`__DIR__\` is \`import.meta.dirname\` (Node 20.11+ — fine on
our Node 22+ baseline). Older code derives it from \`import.meta.url\` via
\`fileURLToPath\`.

\`\`\`ts
import path from 'node:path';

const config = path.join(import.meta.dirname, 'config.json'); // __DIR__ . '/config.json'
path.resolve('uploads'); // absolute path, resolved from the CWD
\`\`\`

### URL and URLSearchParams — parse_url and $_GET, objectified

\`URL\` and \`URLSearchParams\` are **globals** (no import; the same classes exist
in browsers). Where \`parse_url()\` hands you a dumb array of parts, \`new URL()\`
gives a live object: read \`.pathname\`, mutate \`.searchParams\`, and
\`.toString()\` re-serialises it. \`url.searchParams.get('page')\` returns
\`string | null\` — your \`$_GET['page'] ?? null\`, with the null visible to the
type checker.

### node:crypto — no composer require needed

\`randomUUID()\` replaces reaching for \`ramsey/uuid\`; the module also covers
\`createHash('sha256')\`, \`randomBytes\`, and \`timingSafeEqual\` for
constant-time comparisons.

That's the shape of the whole standard library: a dozen modules a backend dev
actually touches, and npm for the rest.
`,

  comparisons: [
    {
      label: "Reading and parsing a JSON file",
      intro:
        "Load config.json (sitting next to the source file) and print the DB host. Same job, but one runtime blocks a single worker while the other must not block anyone.",
      php: `<?php
// config.php
$raw = file_get_contents(__DIR__ . '/config.json');
if ($raw === false) {
    throw new RuntimeException('cannot read config');
}
$config = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

echo $config['db']['host'];`,
      ts: `// config.ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const file = path.join(import.meta.dirname, 'config.json');
const raw = await readFile(file, 'utf8'); // rejects on failure — no === false check
const config = JSON.parse(raw) as { db: { host: string } };

console.log(config.db.host);`,
      note: "Forget the 'utf8' argument and readFile resolves to a Buffer, not a string — JSON.parse coerces it, but string methods won't exist. import.meta.dirname is the ESM __DIR__.",
    },
    {
      label: "$_GET vs URL + URLSearchParams",
      intro:
        "Read ?category and ?page for /products, then build the link to the next page. PHP parsed the query string before your code ran; in raw Node, nobody has.",
      php: `<?php
// /products?category=books&page=2 — PHP filled $_GET for you
$category = $_GET['category'] ?? 'all';
$page     = (int) ($_GET['page'] ?? 1);

$qs = http_build_query(['category' => $category, 'page' => $page + 1]);
echo '/products?' . $qs;`,
      ts: `// inside a node:http handler — req.url is a RAW string like
// '/products?category=books&page=2'; parse it yourself:
const url = new URL(req.url ?? '/', 'http://localhost');

const category = url.searchParams.get('category') ?? 'all'; // string | null
const page = Number(url.searchParams.get('page') ?? '1');

const next = new URLSearchParams({ category, page: String(page + 1) });
console.log('/products?' + next.toString());`,
      note: "There are no superglobals — the raw request line is all Node gives you, which is precisely the parsing Express does on your behalf.",
    },
    {
      label: "A JSON endpoint with zero dependencies",
      intro:
        "A /health endpoint. The PHP file assumes a web server exists around it; the Node file IS the web server.",
      php: `<?php
// index.php — executed by nginx + PHP-FPM; the server lives OUTSIDE PHP
header('Content-Type: application/json');

if (($_SERVER['REQUEST_URI'] ?? '/') === '/health') {
    echo json_encode(['status' => 'ok']);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'not found']);`,
      ts: `// server.ts — node server.ts and port 3000 is answering HTTP
import { createServer } from 'node:http';

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}).listen(3000);`,
      note: "One long-running process owns the socket and handles every request through that single callback — no FPM pool, no per-request teardown, and no routing until you write (or install) some.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "URL and URLSearchParams are globals in Node and the browser, so this runs right here. Predict all eight lines — especially what get() returns for a missing key and what the rebuilt URL looks like after set/delete/append.",
    code: `// PHP: parse_url() + parse_str() + $_GET. Node: one URL class — a global,
// no import needed (the same class exists in browsers).
const raw = 'https://shop.example.com/products?category=books&page=2&tag=php&tag=node';
const url = new URL(raw);

console.log('host:     ' + url.hostname);
console.log('path:     ' + url.pathname);

// searchParams is your $_GET — but it is an API, not a magic array:
const q = url.searchParams;
console.log('category: ' + q.get('category'));
console.log('page:     ' + Number(q.get('page') ?? '1'));
console.log('tags:     ' + q.getAll('tag').join(', '));
console.log('missing:  ' + q.get('sort')); // null — no notice, no isset()

// It is mutable, and the URL re-serialises itself:
q.set('page', '3');
q.delete('tag');
q.append('sort', 'price');
console.log('rebuilt:  ' + url.toString());

// Relative resolution — no dirname()/rtrim('/') string surgery:
console.log('next:     ' + new URL('../checkout', url).pathname);`,
  },

  keyPoints: [
    "PHP ships thousands of global functions; Node ships a small set of modules you import with the `node:` prefix (`node:http`, `node:fs/promises`, `node:path`, `node:crypto`) — npm covers the rest.",
    "`node:http`'s `createServer` gives you one callback per request with `req`/`res` as raw streams — no routing, no parsed query, no body handling. Express is a layer over exactly this.",
    "`readFile(path, 'utf8')` from `node:fs/promises` is the async `file_get_contents`; without `'utf8'` you get a `Buffer`. Sync variants (`readFileSync`) block every concurrent request — boot-time only.",
    "ESM has no `__dirname`; use `import.meta.dirname` (Node 20.11+) as your `__DIR__`, and build paths with `path.join`/`path.resolve`, never string concatenation.",
    "`URL` and `URLSearchParams` are globals replacing `parse_url`/`parse_str`/`$_GET`: `searchParams.get()` returns `string | null`, `getAll()` handles repeated keys, and mutations re-serialise via `toString()`.",
    "`randomUUID()` from `node:crypto` covers what needed a Composer package in PHP — plus `createHash`, `randomBytes`, and `timingSafeEqual`.",
  ],

  interview: [
    {
      q: "How does Node's standard library philosophy differ from PHP's, and what's the node: prefix about?",
      a: "PHP puts thousands of functions in the global namespace — file, string, array, JSON helpers are just there. Node keeps the core deliberately small and organised into modules you import explicitly: `node:http`, `node:fs`, `node:path`, `node:crypto` — and the ecosystem expects npm to provide higher-level tools like frameworks and ORMs. The `node:` prefix marks an import as a runtime builtin rather than an npm package: it always resolves to the built-in and bypasses the require cache, and it fails fast on a typo — `node:fsx` throws `ERR_UNKNOWN_BUILTIN_MODULE` immediately instead of hunting through node_modules. It's also mandatory for newer core modules like `node:test`, `node:sqlite`, and `node:sea`, which are the ones a same-named npm package could otherwise take over; long-standing builtins like `fs` win resolution either way, since Node checks core modules before node_modules. Modern code uses the prefix for every builtin.",
    },
    {
      q: "Why is fs.readFileSync dangerous in a Node request handler when the equivalent blocking read is normal in PHP?",
      a: "In PHP-FPM each request has its own worker process, so a blocking `file_get_contents` delays only that one request while other workers keep serving. Node runs one event-loop process handling all concurrent requests, so a synchronous file read freezes the loop — every in-flight request stalls until the disk I/O finishes. The async version, `readFile` from `node:fs/promises`, hands the I/O to the OS and lets the loop keep serving others. Sync calls are acceptable at startup, before the server starts listening, because there's no concurrent traffic yet to block.",
    },
    {
      q: "You need the directory of the current file in an ESM module — __dirname is undefined. What do you do?",
      a: "`__dirname` and `__filename` are CommonJS injections; ESM modules don't get them. The modern answer is `import.meta.dirname` (and `import.meta.filename`), available since Node 20.11 — the direct equivalent of PHP's `__DIR__`. In older codebases you'll see the long form: `path.dirname(fileURLToPath(import.meta.url))` using `node:url` and `node:path`. Either way, combine it with `path.join` rather than concatenating strings so separators stay portable.",
    },
  ],

  quiz: [
    {
      question:
        "In a raw node:http server, what has Node done with the query string of an incoming request?",
      options: [
        "Parsed it into req.query, like $_GET",
        "Parsed it into a URLSearchParams on req.params",
        "Nothing — req.url is the raw string, and you parse it yourself (e.g. with new URL())",
        "Stripped it off; query strings require Express",
      ],
      answerIndex: 2,
      explain:
        "node:http hands you the raw request: req.url is the unparsed path-plus-query string. There are no superglobals — parsing it (new URL(req.url, base)) is your job, and doing that job for you is a large part of why Express exists.",
    },
    {
      question:
        "What does readFile('./notes.txt') from node:fs/promises resolve to when you omit the encoding argument?",
      options: [
        "A string, like file_get_contents",
        "A Buffer of raw bytes",
        "false on failure, a string on success",
        "An array of lines",
      ],
      answerIndex: 1,
      explain:
        "Without an encoding, readFile resolves to a Buffer (raw bytes). Pass 'utf8' to get a string. Failure is a rejected promise, not a false return — Node throws where file_get_contents returns false with a warning.",
    },
    {
      question:
        "Which is the correct modern way to get the current file's directory in an ESM module on Node 22?",
      options: [
        "__dirname — it works everywhere",
        "process.cwd()",
        "import.meta.dirname",
        "path.dirname(module.filename)",
      ],
      answerIndex: 2,
      explain:
        "import.meta.dirname (Node 20.11+) is the ESM equivalent of __DIR__. __dirname and module are CommonJS-only, and process.cwd() is the directory the process was launched from — it changes with how you start the app, like PHP's getcwd() vs __DIR__.",
    },
  ],
};

export default lesson;
