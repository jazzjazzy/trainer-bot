import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "env-and-config",
  title: "Environment Variables & Configuration",
  part: "Production & Interview Prep",
  estMinutes: 10,
  summary:
    "Server code reads process.env like PHP reads getenv(), but anything prefixed NEXT_PUBLIC_ is inlined into the client bundle at build time — a genuinely new hazard for a PHP developer.",

  concept: `
In PHP, environment config is almost boring: \`vlucas/phpdotenv\` loads
\`.env\`, you call \`getenv()\` or read \`$_ENV\`, and **nothing ever reaches
the browser unless you explicitly echo it**. Next.js keeps half of that model
and adds one sharp edge you must respect: some variables are compiled into
JavaScript that ships to every visitor.

### The .env family — loaded automatically

No dotenv package, no bootstrap require. Next loads these itself, in priority
order (first match wins):

\`\`\`
.env.development.local   # or .env.production.local, per mode
.env.local               # your machine's secrets — gitignored by default
.env.development         # or .env.production, committed per-mode defaults
.env                     # committed defaults for every mode
\`\`\`

\`next dev\` runs in \`development\` mode, \`next build\` + \`next start\` in
\`production\` — so \`.env.development\` and \`.env.production\` let you commit
different defaults per mode, while \`.env.local\` holds real credentials and
stays out of git.

### Server code: business as usual

In Server Components, route handlers, Server Actions, and \`proxy.ts\`,
\`process.env.DATABASE_URL\` is a **runtime lookup on the server**, exactly
like \`getenv('DATABASE_URL')\`. Change the value, restart the process, new
value. Secrets are safe here by default.

### The sharp edge: \`NEXT_PUBLIC_\` is build-time inlining

Client components run in the browser, and the browser has no \`process.env\`.
So Next makes a deal: any variable prefixed \`NEXT_PUBLIC_\` is **inlined into
the client JavaScript bundle during \`next build\`** — a literal find-and-replace
of the text \`process.env.NEXT_PUBLIC_X\` with the value as a string literal.
It is *not* a runtime lookup. Three consequences:

- **The prefix means "publish this."** A secret named
  \`NEXT_PUBLIC_STRIPE_SECRET_KEY\` ships, in plain text, inside a public JS
  file to every visitor. The prefix is a promise, not a namespace.
- **Changing a public value requires a rebuild.** Editing the env var on the
  server and restarting changes nothing — the old string is already baked into
  the compiled bundle.
- **Dynamic access doesn't work.** The bundler replaces the literal text
  \`process.env.NEXT_PUBLIC_API_BASE\`; an expression like
  \`process.env['NEXT_PUBLIC_' + name]\` matches nothing and evaluates to
  \`undefined\` in the browser.

### \`server-only\`: make leaks a build error

A module that touches secrets should never be importable from client code.
Install the \`server-only\` package and add one import at the top:

\`\`\`ts
// lib/db.ts
import 'server-only';
export const db = connect(process.env.DATABASE_URL!);
\`\`\`

If any \`'use client'\` file ever imports this module — directly or through a
chain — the **build fails**. That turns a silent secret leak into a compile
error, the same class of upgrade TypeScript gave your function signatures.

### \`next.config.ts\` in one glance

Framework configuration lives in a typed config file — think \`config.php\`,
but the framework consumes it:

- \`NextConfig\` type gives you autocomplete for every option.
- In Next 16, Turbopack is the default bundler and its options sit at the
  **top level** (\`turbopack: { ... }\`) — in 15 they were experimental.
- \`redirects()\` / \`rewrites()\` replace a pile of \`.htaccess\` rules.
- Plus everything you've met already: \`images.remotePatterns\`,
  \`output: 'standalone'\`, \`cacheComponents\`.
`,

  comparisons: [
    {
      label: "Reading a secret on the server",
      intro:
        "Connect to the database using credentials from the environment. Both are runtime lookups on the server — the Next version just loads .env files itself and can make client-side imports of this module impossible.",
      php: `<?php // bootstrap.php
require 'vendor/autoload.php';
Dotenv\\Dotenv::createImmutable(__DIR__)->load();

// db.php — a runtime lookup, server-side only.
// Nothing here can reach the browser unless echoed.
$pdo = new PDO(
    getenv('DATABASE_DSN'),
    getenv('DATABASE_USER'),
    getenv('DATABASE_PASSWORD')
);`,
      ts: `// lib/db.ts
import 'server-only'; // any client import chain => BUILD ERROR

import { Pool } from 'pg';

// .env.local etc. are loaded by Next automatically —
// no dotenv package, no bootstrap file.
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});`,
      note: "Same runtime-lookup model as getenv() — but because Next also has a client bundle, the server-only import exists to guarantee this module can never be compiled into it.",
      rightLang: "ts",
    },
    {
      label: "Getting a value to the browser",
      intro:
        "The frontend needs the public API base URL. PHP must explicitly print it into the page; Next bakes it into the compiled JavaScript at build time.",
      php: `<?php // footer.php
// Explicit and visible: the ONLY way a value
// reaches the browser is you echoing it.
$public = ['apiBase' => getenv('API_BASE')];
?>
<script>
  window.CONFIG = <?= json_encode($public) ?>;
</script>`,
      ts: `// components/api-status.tsx
'use client';

// At BUILD time the bundler rewrites this line to:
//   const base = "https://api.example.com";
// It is a string literal in a public JS file now —
// changing the env var later does nothing without
// a rebuild.
const base = process.env.NEXT_PUBLIC_API_BASE;

export function ApiStatus() {
  return <p>API endpoint: {base}</p>;
}`,
      note: "PHP's exposure is explicit (an echo you can grep for); Next's is a naming convention — the NEXT_PUBLIC_ prefix IS the echo, which is why a mis-prefixed secret is the classic Next.js leak.",
    },
    {
      label: "config.php vs next.config.ts",
      intro:
        "App-level configuration: redirects and an allowed asset host. The PHP array is consumed by your own code; NextConfig is typed and consumed by the framework itself.",
      php: `<?php // config.php
return [
    'redirects' => [
        '/old-shop' => '/shop',
    ],
    'cdn_host' => 'cdn.example.com',
];
// ...and somewhere in YOUR front controller:
// if (isset($config['redirects'][$path])) {
//     header('Location: ...', true, 301);
// }`,
      ts: `// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack is the default bundler in 16;
  // its options are top-level (not experimental):
  turbopack: {
    resolveAlias: { underscore: 'lodash' },
  },
  async redirects() {
    return [
      { source: '/old-shop', destination: '/shop', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.example.com' },
    ],
  },
};

export default nextConfig;`,
      note: "The NextConfig type autocompletes every option, and the framework executes the file — redirects become real 301/308 responses without you writing the header() call.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of the build-time inliner: it does a static text replacement on process.env.NEXT_PUBLIC_* and nothing else. Predict what each of the four source lines becomes in the client bundle, then run it.",
    code: `// The NEXT_PUBLIC_ inliner in miniature. At BUILD time, the bundler
// find-and-replaces the literal text process.env.NEXT_PUBLIC_X in
// client code. It is not a runtime lookup.

const buildEnv: Record<string, string | undefined> = {
  DATABASE_URL: 'mysql://app:hunter2@db.internal/prod',
  STRIPE_SECRET_KEY: 'sk_live_51Abc...',
  NEXT_PUBLIC_API_BASE: 'https://api.coffeedirect.example',
  NEXT_PUBLIC_APP_NAME: 'CoffeeDirect',
};

const clientSource = [
  "const base = process.env.NEXT_PUBLIC_API_BASE;",
  "const name = process.env.NEXT_PUBLIC_APP_NAME;",
  "const db   = process.env.DATABASE_URL;",
  "const dyn  = process.env['NEXT_PUBLIC_' + 'API_BASE'];",
];

function inlineForClient(line: string): string {
  return line.replace(/process\\.env\\.([A-Z0-9_]+)/g, (_m, name: string) =>
    name.startsWith('NEXT_PUBLIC_')
      ? JSON.stringify(buildEnv[name]) // baked in as a string literal
      : 'undefined'                    // server vars don't exist in the browser
  );
}

console.log('--- client bundle after next build ---');
for (const line of clientSource) {
  console.log(inlineForClient(line));
}

console.log('');
console.log('--- what happened ---');
console.log('1+2: NEXT_PUBLIC_* values are now literals in a PUBLIC js file.');
console.log('3:   DATABASE_URL stayed on the server; the reference is undefined.');
console.log('4:   dynamic access matched nothing -> left as-is, and the');
console.log('     browser has no real process.env, so it fails at runtime.');`,
  },

  keyPoints: [
    "Next loads `.env` files itself, most-specific first: `.env.{mode}.local` → `.env.local` → `.env.{mode}` → `.env`; `.env.local` holds real secrets and is gitignored.",
    "Server code (Server Components, route handlers, Server Actions, proxy.ts) reads `process.env.SECRET` as a runtime lookup — same model as `getenv()` in PHP.",
    "`NEXT_PUBLIC_`-prefixed variables are INLINED into the client bundle at build time — a static text replacement, so the prefix means 'publish this to every visitor.'",
    "Because the value is baked in at build, changing a `NEXT_PUBLIC_` var requires a REBUILD, and dynamic access like `process.env['NEXT_PUBLIC_' + x]` silently yields undefined.",
    "`import 'server-only'` at the top of a secret-touching module turns any client-side import of it into a build error.",
    "`next.config.ts` exports a typed `NextConfig`: top-level `turbopack` options (Next 16), `redirects()`/`rewrites()` in place of .htaccess rules, `images`, `output`, and friends.",
  ],

  interview: [
    {
      q: "How do environment variables differ between server and client code in Next.js?",
      a: "On the server they work like PHP's getenv(): `process.env.DATABASE_URL` is a runtime lookup in Server Components, route handlers, Server Actions, and proxy.ts, with `.env.local` and per-mode files loaded automatically. Client code is different in kind: browsers have no process.env, so only variables prefixed `NEXT_PUBLIC_` are available — and they're inlined into the JavaScript bundle at build time as a literal text replacement. That has two traps: a secret with that prefix ships in plain text to every visitor, and changing a public value needs a rebuild, not a restart, because the old string is already compiled in. Coming from PHP, that inlining is the genuinely new hazard — in PHP nothing reaches the browser unless you echo it.",
    },
    {
      q: "You updated NEXT_PUBLIC_API_BASE on the production server and restarted the app, but the browser still uses the old URL. Why?",
      a: "Because `NEXT_PUBLIC_` variables aren't read at runtime — during `next build` the bundler replaced every occurrence of `process.env.NEXT_PUBLIC_API_BASE` in client code with the value as a string literal. The compiled bundle physically contains the old URL, so restarting the Node process changes nothing; I need to rebuild (and on Vercel, redeploy) for the new value to be baked in. If a value genuinely must change without rebuilds, it shouldn't be a NEXT_PUBLIC_ inline at all — I'd have the client fetch it from a route handler or pass it down from a Server Component, where env reads are runtime lookups.",
    },
    {
      q: "How do you guarantee a module that touches secrets is never shipped to the browser?",
      a: "Add `import 'server-only'` at the top of the module — for example lib/db.ts or a data-access file reading process.env credentials. The package is a build-time tripwire: if any `'use client'` component ends up importing that module, directly or through a dependency chain, the build fails with a clear error instead of silently bundling server code. It converts an accidental secret leak into a compile error, which is exactly the fail-fast behavior I'd want. The complement is discipline with prefixes: secrets never get NEXT_PUBLIC_, so even their values can't be inlined.",
    },
  ],

  quiz: [
    {
      question:
        "What actually happens to process.env.NEXT_PUBLIC_ANALYTICS_ID in a client component?",
      options: [
        "The browser reads it from process.env at runtime",
        "Next.js injects it into a cookie the client reads",
        "The build replaces the expression with the value as a string literal inside the client bundle",
        "The server sends it in a response header on every request",
      ],
      answerIndex: 2,
      explain:
        "It's a build-time text replacement — the compiled JS file literally contains the value. That's why the prefix publishes the value to everyone and why changes require a rebuild.",
    },
    {
      question:
        "Which statement about a variable named NEXT_PUBLIC_STRIPE_SECRET_KEY is true?",
      options: [
        "It's safe because Next encrypts NEXT_PUBLIC_ values in the bundle",
        "Its value ships in plain text inside public JavaScript to every visitor",
        "It's only exposed in development mode",
        "Next.js refuses to build when a variable name contains SECRET",
      ],
      answerIndex: 1,
      explain:
        "The NEXT_PUBLIC_ prefix is an instruction to inline the value into the client bundle. Next does no scanning of names and no encryption — the prefix is a promise to publish, so secrets must never carry it.",
    },
    {
      question: "What does `import 'server-only'` in lib/dal.ts achieve?",
      options: [
        "It makes the module run in a separate worker thread",
        "It strips the module from production builds",
        "It marks every export as async server functions",
        "Any import of the module from client-component code fails the build",
      ],
      answerIndex: 3,
      explain:
        "server-only is a guard package: it errors at build time if the module lands in the client graph, turning an accidental leak of secret-touching code into a compile failure instead of a shipped vulnerability.",
    },
  ],
};

export default lesson;
