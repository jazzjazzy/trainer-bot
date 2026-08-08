import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "request-response",
  title: "Request In, Response Out",
  part: "Express Essentials",
  estMinutes: 12,
  summary:
    "req replaces the superglobals (but parses nothing for free) and res replaces header()+echo with a chainable API — and double-responding throws ERR_HTTP_HEADERS_SENT instead of a quiet PHP warning.",

  concept: `
### The request: superglobals, minus the magic

PHP populates \`$_GET\`, \`$_POST\`, \`$_FILES\`, and \`$_SERVER\` before your
first line runs. Express populates almost nothing:

- **\`req.body\`** exists only after a body parser runs. \`express.json()\`
  handles \`application/json\`; \`express.urlencoded({ extended: true })\`
  handles classic form posts (that one is your actual \`$_POST\`). In Express 5,
  with no parser matched, \`req.body\` is \`undefined\` — not \`{}\`.
- **\`req.query\`** and **\`req.params\`** are parsed for you — all values
  strings, like the superglobals.
- **\`req.headers\`** has **lowercased keys**: \`req.headers.authorization\`,
  \`req.headers['content-type']\`. No \`HTTP_\`-prefixed \`$_SERVER\` gymnastics,
  but \`req.headers['Content-Type']\` is silently \`undefined\` — the classic
  header typo.

### The response: header() + echo, unified and chainable

In PHP a response is side effects: \`header()\` calls, \`http_response_code()\`,
then \`echo\`. Express wraps it in one fluent object:

\`\`\`ts
res.status(201)
   .set('Location', \`/users/\${user.id}\`)
   .json(user);         // serialises, sets Content-Type, SENDS
\`\`\`

\`status()\` and \`set()\` return \`res\` for chaining; \`res.json()\` is
\`json_encode\` + \`Content-Type: application/json\` + send, in one call — and it
**ends** the response, more like \`echo json_encode(...); exit;\` than a bare
\`echo\`. Also in the toolbox: \`res.send()\` for strings/buffers,
\`res.redirect(303, '/login')\`, \`res.sendStatus(204)\` for status-only replies.

### ERR_HTTP_HEADERS_SENT: 'headers already sent', but loud

PHP's "headers already sent" is a warning — the script limps on and the client
gets mangled output. Node throws. Respond twice and the second attempt raises
\`ERR_HTTP_HEADERS_SENT\`, because the first response already went out on the
wire. The bug is almost always a missing \`return\`:

\`\`\`ts
app.get('/users/:id', async (req, res) => {
  const user = await findUser(Number(req.params.id));
  if (!user) {
    res.status(404).json({ error: 'not found' });  // sent... but no return
  }
  res.json(user);  // throws ERR_HTTP_HEADERS_SENT on the 404 path
});
\`\`\`

The habit that prevents it: **\`return res.status(404).json(...)\` in every
branch**. Express ignores the return value, so returning the \`res\` call is
free — it's purely there to stop execution, like the \`exit\` after a PHP
redirect.

### Typing bodies: generics, honestly assessed

\`Request\` takes type arguments — \`Request<Params, ResBody, ReqBody>\`:

\`\`\`ts
interface CreateUserBody { name: string; email: string; }

app.post('/users', (req: Request<{}, User, CreateUserBody>, res: Response<User>) => {
  req.body.name;   // typed as string
  res.json(user);  // must match User
});
\`\`\`

Know the honest limit: this is a **compile-time assertion, not a runtime
check**. The network can send anything; \`req.body.name\` might still be a
number at 3am. That's why most teams validate bodies with a schema library at
the boundary and *derive* the types from the schema — the validation section
covers exactly that.
`,

  comparisons: [
    {
      label: "Reading a JSON request body",
      intro:
        "A POST with a JSON payload: extract name or reject with 422. PHP makes you fetch the raw body yourself; Express makes you opt in to parsing — then both validate by hand (for now).",
      php: `<?php
// $_POST only covers form posts — JSON means reading the raw body:
$raw  = file_get_contents('php://input');
$body = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

$name = $body['name'] ?? null;
if (!is_string($name) || $name === '') {
    http_response_code(422);
    echo json_encode(['error' => 'name required']);
    exit;
}
echo json_encode(['id' => 7, 'name' => $name]);`,
      ts: `// once, at startup — the opt-in that replaces php://input plumbing:
app.use(express.json());

app.post('/users', (req: Request, res: Response) => {
  // Express 5: req.body is undefined if no parser matched the request
  const { name } = (req.body ?? {}) as { name?: unknown };
  if (typeof name !== 'string' || name === '') {
    return res.status(422).json({ error: 'name required' });
  }
  res.status(201).json({ id: 7, name });
});`,
      note: "express.json() only parses requests with a JSON Content-Type — a client that forgets the header leaves req.body undefined in Express 5, so guard (or validate) before destructuring.",
    },
    {
      label: "header() + echo vs the res chain",
      intro:
        "A 201 with a Location header and a JSON body. Scattered side effects vs one fluent chain that ends the response.",
      php: `<?php
http_response_code(201);
header('Content-Type: application/json');
header('Location: /users/7');
echo json_encode(['id' => 7, 'name' => 'Ada']);
// nothing stops later code from echoing MORE bytes
// into this same response body`,
      ts: `res.status(201)
   .set('Location', '/users/7')
   .json({ id: 7, name: 'Ada' });
// json() serialises, sets Content-Type,
// and ENDS the response — closer to
// echo json_encode(...); exit;`,
      note: "status() and set() return res (that's all 'chainable' means); json() is the terminal call. Order matters the same way it does in PHP — status and headers must be set before the body goes out.",
    },
    {
      label: "Double output: warning vs thrown error",
      intro:
        "The same missing-return bug in both worlds: the 404 branch responds, then execution falls through and responds again.",
      php: `<?php
if ($user === null) {
    http_response_code(404);
    echo json_encode(['error' => 'not found']);
    // forgot exit; — execution continues...
}
// PHP: "Warning: Cannot modify header information -
// headers already sent" ... and the extra body is
// APPENDED — the client gets corrupted JSON, silently
echo json_encode($user);`,
      ts: `app.get('/users/:id', async (req, res) => {
  const user = await findUser(Number(req.params.id));
  if (!user) {
    res.status(404).json({ error: 'not found' });
    // forgot return — execution continues...
  }
  res.json(user); // throws ERR_HTTP_HEADERS_SENT: loud, logged,
});               // and the 404 body is NOT corrupted

// the habit: return res.status(404).json(...) in every branch`,
      note: "Same bug, opposite failure mode: PHP corrupts the response quietly; Node throws where you can see it. Either way the cure is returning the moment you respond.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "res.status(...).json(...) demystified: a tiny response object where chainable just means 'return this'. Predict the printed response — then predict what the second json() call at the bottom does.",
    code: `// Demystify the fluent res API: status()/set() return \`this\`, json() sends.
class MiniResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = '';
  private sent = false;

  status(code: number): this {
    this.statusCode = code;
    return this; // <- this is all "chainable" means
  }

  set(name: string, value: string): this {
    if (this.sent) throw new Error('ERR_HTTP_HEADERS_SENT');
    this.headers[name.toLowerCase()] = value; // header names are lowercased
    return this;
  }

  json(data: unknown): this {
    if (this.sent) throw new Error('ERR_HTTP_HEADERS_SENT');
    this.headers['content-type'] = 'application/json; charset=utf-8';
    this.body = JSON.stringify(data);
    this.sent = true; // json() SENDS — like echo + exit, not just echo
    return this;
  }
}

// The chain you write in every Express handler:
const res = new MiniResponse();
res.status(201).set('Location', '/users/7').json({ id: 7, name: 'Ada' });

console.log('HTTP ' + res.statusCode);
for (const [name, value] of Object.entries(res.headers)) {
  console.log(name + ': ' + value);
}
console.log('');
console.log(res.body);
console.log('');

// The double-send bug: a branch that forgot to \`return\` after responding.
try {
  res.status(500).json({ error: 'oops' });
} catch (err) {
  console.log('caught: ' + (err as Error).message);
}`,
  },

  keyPoints: [
    "Nothing is parsed for free: `req.body` requires `express.json()` (or `express.urlencoded()` — that one is your `$_POST`), and in Express 5 it's `undefined` when no parser matched.",
    "`req.headers` keys are lowercased — `req.headers.authorization` works, `req.headers['Authorization']` is silently `undefined`.",
    "`res.status(201).set(...).json(data)` replaces `http_response_code` + `header()` + `echo json_encode` — `json()` serialises, sets Content-Type, and ENDS the response.",
    "Double-responding throws `ERR_HTTP_HEADERS_SENT` — Node's loud version of PHP's quiet 'headers already sent' warning. Habit: `return res.json(...)` in every branch.",
    "`Request<Params, ResBody, ReqBody>` types the body at compile time only — the network can still send anything, which is why teams validate at the boundary and derive types from schemas (coming up in the validation section).",
    "Also on res: `send()` for strings/buffers, `redirect(303, '/login')`, `sendStatus(204)` for status-only replies.",
  ],

  interview: [
    {
      q: "Coming from PHP's $_POST, what surprises people about request bodies in Express?",
      a: "That there's no equivalent of PHP's pre-populated superglobals — Express parses nothing until you register middleware. express.json() handles JSON payloads and express.urlencoded() handles form posts, and they only act when the request's Content-Type matches, so a client that sends JSON without the header leaves req.body undefined — which is Express 5's explicit behaviour for 'no parser ran', replacing the old default of an empty object. The second surprise is that even a parsed body is untrusted: unlike $_POST there's a temptation to trust the TypeScript type on req.body, but that's a compile-time claim about bytes from the network. Parse, then validate at the boundary.",
    },
    {
      q: "What is ERR_HTTP_HEADERS_SENT and how do you prevent it?",
      a: "It's Node's version of PHP's 'headers already sent', thrown rather than warned: once a response has gone out on the wire, any second attempt to set status, headers, or send a body throws. In Express code it almost always traces to a missing return in a guard branch — you send a 404, execution falls through, and the success-path res.json() fires too. Prevention is the habit of returning whenever you respond: `return res.status(404).json(...)`. Express ignores the handler's return value, so the return exists purely to stop execution — the same role exit played after header('Location: ...') in PHP. Compared to PHP, it's actually the better failure mode: PHP appends the junk output and corrupts the response silently; Node fails loudly where your error handler and logs can see it.",
    },
    {
      q: "Is typing req.body with Request generics enough to trust the data?",
      a: "No — and saying so clearly is important. Request<Params, ResBody, ReqBody> gives editor support and catches mistakes inside my own code, but it's erased at runtime; the actual body is whatever the client sent. If I declare `{ name: string }` and the client posts `{ name: 42 }`, TypeScript is happy and my code breaks. So generics are documentation-grade typing; trust comes from runtime validation at the boundary — a schema library like zod that parses the body, rejects bad shapes with a 4xx, and lets me derive the TypeScript type from the schema so the compile-time and runtime contracts can't drift apart. That's the pattern I'd reach for on any production endpoint.",
    },
  ],

  quiz: [
    {
      question:
        "A client POSTs valid JSON but forgets the Content-Type: application/json header. With app.use(express.json()) registered, what is req.body in Express 5?",
      options: [
        "The parsed object — Express sniffs the payload",
        "The raw JSON string",
        "undefined — express.json() only parses matching Content-Types",
        "An empty object {}",
      ],
      answerIndex: 2,
      explain:
        "Body parsers are Content-Type-gated: express.json() skips requests that don't declare JSON, and Express 5 leaves req.body undefined when nothing parsed it (Express 4 defaulted to {}). PHP's php://input always gave you the raw bytes; here the parse simply never happened.",
    },
    {
      question: "Which reliably reads the Authorization header in Express?",
      options: [
        "req.headers.Authorization",
        "req.headers.authorization",
        "req.headers['HTTP_AUTHORIZATION']",
        "req.getHeaderLine('Authorization')",
      ],
      answerIndex: 1,
      explain:
        "Node lowercases incoming header names, so the lowercase key is the one that exists — req.headers.Authorization is undefined, no error. The HTTP_ prefix is $_SERVER's convention and getHeaderLine() is PSR-7; neither exists here.",
    },
    {
      question: "In res.status(201).set('Location', '/users/7').json(user), what makes the chain work — and which call ends it?",
      options: [
        "Express queues the calls and flushes them on handler return; nothing ends early",
        "status() and set() return res; json() serialises, sets Content-Type, and sends the response",
        "Each call sends immediately, in three separate writes",
        "json() returns res so you can keep adding headers after it",
      ],
      answerIndex: 1,
      explain:
        "Chainability is just methods returning res. json() is the terminal step — like echo json_encode(...) plus exit in one call. Setting headers after it raises ERR_HTTP_HEADERS_SENT, which is why status and headers go before the body, same as PHP.",
    },
  ],
};

export default lesson;
