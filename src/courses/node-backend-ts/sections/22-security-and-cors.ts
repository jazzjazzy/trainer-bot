import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "security-and-cors",
  title: "Security Headers, CORS, and Hardening",
  part: "Production Hardening",
  estMinutes: 12,
  summary:
    "Harden an Express API with helmet's security headers, an explicit CORS allowlist, rate limiting, and body-size limits — jobs that nginx or .htaccess used to do for your PHP apps, now done in your own middleware.",

  concept: `
In a classic PHP deployment, a lot of hardening lived *outside* your code:
nginx or \`.htaccess\` set the security headers, the web server enforced body
size limits and rate limits, and you sprinkled \`header()\` calls for the rest.
A Node API often faces traffic more directly — and even behind a proxy, the
convention is that the app owns its own hardening. It's a short checklist.

### Security headers in one line: helmet

\`\`\`ts
import helmet from "helmet";
app.use(helmet());
\`\`\`

That one \`app.use\` sets 13 security-related response headers, including
\`Content-Security-Policy\`, \`Strict-Transport-Security\` (HSTS),
\`X-Content-Type-Options: nosniff\`, and \`X-Frame-Options\` — each one a line
you'd previously have maintained as \`add_header\` in nginx or \`Header always
set\` in \`.htaccess\`. Helmet also *removes* \`X-Powered-By\`, the header
Express adds by default (the sibling of PHP's \`expose_php\`). If you don't use
helmet, at least call \`app.disable("x-powered-by")\` — advertising your stack
version is free reconnaissance for attackers.

### CORS: the browser is the bouncer

The single most misunderstood thing about CORS: **your server never blocks
anything**. \`curl\` and server-to-server calls ignore CORS completely. CORS is
the *browser* refusing to let JavaScript on \`https://evil.example\` read a
response from your API — unless your API's response headers explicitly allow
that origin. Your server's only job is to emit the right headers.

For requests that aren't "simple" (a \`PUT\`, or any request with an
\`Authorization\` header or JSON content type), the browser first sends a
**preflight**: an \`OPTIONS\` request asking "may \`https://app.example.com\`
send a \`PUT\` with these headers?" Your API answers with
\`Access-Control-Allow-Origin\`, \`-Allow-Methods\`, and \`-Allow-Headers\`; only
if they match does the real request follow.

The \`cors\` package does the header dance:

\`\`\`ts
import cors from "cors";

app.use(cors({
  origin: ["https://app.example.com", "https://admin.example.com"],
  credentials: true,   // allow cookies / Authorization to cross origins
  maxAge: 600,         // cache preflight results for 10 minutes
}));
\`\`\`

One hard rule: **never combine \`origin: "*"\` with \`credentials: true\`**. The
spec forbids it — a wildcard would let any site on the internet make
authenticated requests as your logged-in users. With credentials, you must
echo back one specific allowlisted origin per response.

### Rate limiting — and where the counter lives

Where nginx's \`limit_req\` once throttled your PHP endpoints, in Node it's
middleware:

\`\`\`ts
import { rateLimit } from "express-rate-limit";

app.use("/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,               // per IP per window
  standardHeaders: "draft-8",
  legacyHeaders: false,
}));
\`\`\`

The default store is **in-memory** — a counter inside your one process. That's
fine for a single instance, but the moment you run multiple processes or
replicas, each keeps its own counter and the real limit silently becomes
\`limit × instances\`. Shared state like this must eventually move to an
external store such as Redis — a theme that returns with force when we scale
out.

### Body-size limits: your heap is shared

PHP had \`post_max_size\` per request, and an oversized upload hurt only that
request's process. In Node, \`express.json()\` parses bodies **into the one
heap every concurrent user shares**. Its default limit is a sane \`100kb\`; be
deliberate when you raise it:

\`\`\`ts
app.use(express.json({ limit: "100kb" })); // explicit is better
\`\`\`

A single accepted 2 GB JSON body doesn't slow one request — it can take the
whole event loop hostage (parsing is synchronous!) and crash the process for
everyone. Small default limits, raised only on routes that need it, are cheap
insurance.
`,

  comparisons: [
    {
      label: "Security headers: nginx config vs helmet",
      intro:
        "The same hardening headers on every response — maintained by hand in the web server config for PHP, or set by one middleware line in Express.",
      php: `# /etc/nginx/sites-available/api.conf
server {
    listen 443 ssl;
    server_name api.example.com;

    add_header Strict-Transport-Security
        "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Content-Security-Policy
        "default-src 'self'" always;

    # hide the stack, like expose_php = Off
    server_tokens off;
    fastcgi_hide_header X-Powered-By;

    location / {
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }
}`,
      ts: `// src/app.ts
import express from "express";
import helmet from "helmet";

const app = express();

// One middleware sets 13 security headers:
// Content-Security-Policy, Strict-Transport-Security,
// X-Content-Type-Options: nosniff, X-Frame-Options,
// ... and removes X-Powered-By.
app.use(helmet());

// Belt and braces if you skip helmet:
app.disable("x-powered-by");

// Every header is tweakable per project:
app.use(helmet({
  contentSecurityPolicy: {
    directives: { "default-src": ["'self'"] },
  },
}));`,
      note: "Same headers, different owner: the PHP era delegated them to ops config; a Node API sets them itself, so they deploy, version, and code-review with the app.",
      leftLang: "bash",
    },
    {
      label: "CORS: hand-rolled header() block vs the cors package",
      intro:
        "Allow two known frontends to call the API with credentials, and answer preflight OPTIONS requests correctly.",
      php: `<?php
// api/bootstrap.php — the classic hand-rolled block
$allowed = [
    'https://app.example.com',
    'https://admin.example.com',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods:
        GET, POST, PUT, DELETE');
    header('Access-Control-Allow-Headers:
        Content-Type, Authorization');
    http_response_code(204);
    exit; // answer preflight, skip the app
}`,
      ts: `// src/app.ts
import cors from "cors";

app.use(cors({
  // echo back ONE allowlisted origin per response —
  // never "*" when credentials are true
  origin: [
    "https://app.example.com",
    "https://admin.example.com",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600, // browser caches the preflight verdict
}));

// Preflight OPTIONS requests are answered
// automatically by the middleware — no manual
// method check, no early exit() dance.`,
      note: "The logic is identical — allowlist check, echo the origin, answer OPTIONS early — but the package handles the preflight short-circuit and the Vary header so you can't forget them.",
    },
    {
      label: "Rate limiting: nginx limit_req vs express-rate-limit",
      intro:
        "Throttle the login endpoint to blunt credential-stuffing. In the PHP world the web server did it; in Node it's your middleware — with a catch about where the counter lives.",
      php: `# nginx: counters live in a shared memory zone,
# so every worker process sees the same counts
limit_req_zone $binary_remote_addr
    zone=login:10m rate=10r/m;

server {
    location /auth/login {
        limit_req zone=login burst=5 nodelay;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }
}`,
      ts: `// src/app.ts
import { rateLimit } from "express-rate-limit";

app.use("/auth", rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,                // per IP per window
  standardHeaders: "draft-8",
  legacyHeaders: false,      // no X-RateLimit-* legacy
}));

// Gotcha: the default MemoryStore is per-PROCESS.
// Run 4 replicas and the effective limit is 4x —
// production uses a shared store (e.g. Redis).`,
      note: "nginx counted in shared memory across all its workers for free; express-rate-limit's default store is inside one Node process, so multi-process deployments need an external store.",
      leftLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A simulation of what the cors middleware decides: checkCors() applies the allowlist, preflight() answers the browser's OPTIONS question. Predict which of the four scenarios get blocked — remember curl doesn't send an Origin at all.",
    code: `const allowlist = ["https://app.example.com", "https://admin.example.com"];
const allowedMethods = ["GET", "POST", "PUT", "DELETE"];
const allowedHeaders = ["content-type", "authorization"];

interface CorsDecision {
  allowed: boolean;
  headers: Record<string, string>;
}

// The core allowlist check the cors package performs on every request:
function checkCors(origin: string | undefined): CorsDecision {
  if (origin === undefined) {
    // curl / server-to-server: no Origin header, CORS not involved at all
    return { allowed: true, headers: {} };
  }
  if (!allowlist.includes(origin)) {
    // no ACAO header is emitted -> the BROWSER refuses to expose the response
    return { allowed: false, headers: {} };
  }
  return {
    allowed: true,
    headers: {
      // echo the single matching origin — never "*" with credentials
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    },
  };
}

// The browser's preflight: "may this origin send this method + headers?"
function preflight(origin: string, method: string, reqHeaders: string[]): string {
  const base = checkCors(origin);
  const methodOk = allowedMethods.includes(method);
  const headersOk = reqHeaders.every((h) => allowedHeaders.includes(h.toLowerCase()));

  if (!base.allowed || !methodOk || !headersOk) {
    const reason = !base.allowed ? "origin not allowlisted"
      : !methodOk ? \`method \${method} not allowed\`
      : "header not allowed";
    return \`BLOCKED (\${reason}) — browser never sends the real request\`;
  }
  const h = {
    ...base.headers,
    "Access-Control-Allow-Methods": allowedMethods.join(", "),
    "Access-Control-Allow-Headers": allowedHeaders.join(", "),
    "Access-Control-Max-Age": "600",
  };
  return "ALLOWED — 204 with " + Object.keys(h).length + " CORS headers, real request follows";
}

console.log("1. curl (no Origin):           ", checkCors(undefined).allowed ? "passes — CORS does not apply" : "blocked");
console.log("2. GET from app.example.com:   ", JSON.stringify(checkCors("https://app.example.com").headers));
console.log("3. preflight PUT from app:     ", preflight("https://app.example.com", "PUT", ["content-type", "authorization"]));
console.log("4. preflight PUT from evil:    ", preflight("https://evil.example", "PUT", ["content-type"]));`,
  },

  keyPoints: [
    "`app.use(helmet())` sets 13 security headers (CSP, HSTS, nosniff, frame protection) and removes `X-Powered-By` — the jobs your nginx `add_header` lines and `expose_php = Off` used to do.",
    "CORS is enforced by the BROWSER, not your server: your API only emits `Access-Control-*` headers, and curl or server-to-server calls bypass CORS entirely.",
    "Non-simple requests trigger a preflight `OPTIONS` asking permission for the method and headers; the `cors` package answers it automatically from your config.",
    "Never pair `origin: '*'` with `credentials: true` — with credentials you must echo back exactly one allowlisted origin (plus `Vary: Origin`).",
    "express-rate-limit's default MemoryStore counts inside one process — with N replicas your real limit is N x the configured one, so production needs a shared store like Redis.",
    "`express.json()` defaults to a 100kb body limit for good reason: bodies are parsed synchronously into the single heap all users share, so one huge JSON payload can stall or crash the whole process.",
  ],

  interview: [
    {
      q: "Explain CORS. Who enforces it, and what actually happens on a cross-origin PUT request?",
      a: "CORS is enforced entirely by the browser — the server just declares policy through response headers, and non-browser clients like curl ignore it completely. For a non-simple request like a PUT with an Authorization header, the browser first sends a preflight: an OPTIONS request carrying the Origin, the intended method, and the intended headers. The server answers with Access-Control-Allow-Origin, -Allow-Methods, and -Allow-Headers; if they cover the request, the browser sends the real PUT, otherwise it never leaves the browser. In Express I use the cors package with an explicit origin allowlist and credentials: true when cookies or auth headers must cross origins — and I'd flag that the spec forbids wildcard origin with credentials, precisely because that combination would let any website act as your logged-in users.",
    },
    {
      q: "What does helmet actually do, and why bother when nginx can set headers?",
      a: "helmet() is one middleware that sets 13 security response headers — Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options: nosniff, frame protection — and removes Express's X-Powered-By header, which is the same instinct as expose_php = Off in PHP. You can absolutely set these in nginx, and in my PHP years that's where they lived. The argument for doing it in the app is ownership: the headers version with the code, get code-reviewed, apply identically in every environment including local dev, and don't silently vanish when someone rewrites the proxy config. It also means the API is safe even when it's exposed directly, which is common in containerized deployments.",
    },
    {
      q: "Why is a request body size limit more important in Node than it was in PHP?",
      a: "In PHP, post_max_size protected a process that only served one request — an oversized body wasted one worker briefly, and FPM's other workers kept serving. In Node there's one process and one heap shared by every concurrent user, and express.json parses synchronously. Accepting a huge JSON body means allocating it in the shared heap and blocking the event loop while it parses — every user stalls, and a large enough body can OOM the process and drop all in-flight requests. That's why express.json defaults to 100kb and why I keep limits small globally and raise them only on the specific routes that genuinely need bigger payloads.",
    },
    {
      q: "You added express-rate-limit and it works in staging, but production abuse reports show clients exceeding the limit. What's the likely cause?",
      a: "Production is almost certainly running multiple processes or replicas — PM2 cluster mode, or several containers behind a load balancer — and express-rate-limit's default MemoryStore keeps its counters inside each process's own memory. With four replicas, a client's requests round-robin across four independent counters, so the effective limit is roughly four times what's configured. nginx never had this problem because limit_req counts in a shared memory zone. The fix is moving the counter out of the process into a shared store — the Redis-backed store is the standard answer — which is the same shared-nothing lesson that applies to sessions and caches in any multi-process Node deployment.",
    },
  ],

  quiz: [
    {
      question:
        "A developer tests your CORS-protected API with curl and is confused that requests from 'unauthorized origins' succeed. Why?",
      options: [
        "curl spoofs an allowlisted Origin header by default",
        "CORS is enforced by browsers; curl ignores CORS headers entirely, so the server responds normally",
        "The cors middleware only runs for OPTIONS requests",
        "The API is misconfigured — CORS should block curl",
      ],
      answerIndex: 1,
      explain:
        "CORS never blocks anything server-side: the server only emits Access-Control-* headers, and the browser decides whether JS may read the response. curl has no such policy, so it sees every response. CORS is not authentication — that's what tokens and cookies are for.",
    },
    {
      question:
        "Why must you not configure `origin: '*'` together with `credentials: true`?",
      options: [
        "It doubles the number of preflight requests",
        "Wildcard origins disable HTTPS",
        "It would allow any website to make authenticated requests as your logged-in users, so the spec forbids the combination",
        "The cors package throws a TypeError at startup",
      ],
      answerIndex: 2,
      explain:
        "Credentials mean cookies or auth headers ride along cross-origin. A wildcard would extend that to every origin on the internet — any page could silently call your API as the visiting user. Browsers reject the combination, so with credentials you must echo one specific allowlisted origin per response.",
    },
    {
      question:
        "Your API runs as 4 PM2 cluster workers with express-rate-limit configured at limit: 100. What limit does a client effectively face?",
      options: [
        "100 — the workers share the counter automatically",
        "25 — the limit is divided across workers",
        "Roughly 400 — each worker keeps its own in-memory counter",
        "Unlimited — rate limiting is disabled in cluster mode",
      ],
      answerIndex: 2,
      explain:
        "The default MemoryStore lives inside each process. Requests distributed across 4 workers increment 4 independent counters, so a client can reach about limit x workers before any single counter trips. A shared store (Redis) restores one global counter.",
    },
    {
      question:
        "What is the default body size limit of express.json(), and why does it exist?",
      options: [
        "1GB — Node streams bodies to disk automatically",
        "100kb — bodies are parsed synchronously into the single heap shared by all concurrent requests",
        "There is no default — you must always set one",
        "8MB — matching PHP's post_max_size default",
      ],
      answerIndex: 1,
      explain:
        "express.json() defaults to 100kb. Unlike PHP, where an oversized body burdened one throwaway process, a Node body is buffered and JSON.parse'd in the one long-running process — a huge payload blocks the event loop for everyone and can OOM the heap.",
    },
  ],
};

export default lesson;
