import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "running-typescript",
  title: "Running TypeScript on Node",
  part: "The Runtime Shift",
  estMinutes: 11,
  summary:
    "Node 24 LTS runs .ts files natively by stripping types, tsx gives you the friction-free dev loop, and tsc is the type checker that catches at build time what PHP only catches in production.",

  concept: `
PHP has no compile step: edit \`index.php\`, hit refresh, done. TypeScript on
Node introduces one — and the honest framing is that it's a *cost you pay to
move errors left*. A PHP \`TypeError\` detonates in production at 2 a.m.; the
same bug in TypeScript fails \`tsc\` before it ever ships. This section is the
toolchain that makes the cost nearly invisible.

### Three tools, three jobs

- **\`node\` itself** — Node 22+ can run TypeScript directly, and as of Node
  24.12.0 (the current LTS line) **native type stripping is stable**: \`node
  app.ts\` just works, no flags. Node doesn't *check* your types — it strips
  them and runs the JavaScript underneath.
- **\`tsx\`** — the de-facto dev runner: \`tsx watch src/server.ts\` re-runs
  your server on every save, handles any TS syntax, zero config. This is your
  \`php artisan serve\` feeling.
- **\`tsc\`** — the actual TypeScript compiler. In dev it's your type checker
  (\`tsc --noEmit\`); for production it's your build step, emitting plain
  \`.js\` to \`dist/\`.

The key mental split: **running and type-checking are separate operations**.
Both \`node\` and \`tsx\` execute happily past type errors — only \`tsc\`
enforces them. Teams wire \`tsc --noEmit\` into CI so a type error fails the
pipeline, not the customer.

### Type stripping's one rule: erasable syntax only

Node's native runner deletes type annotations and runs what's left — so it
only accepts syntax that *can* be deleted without changing runtime behavior.
Interfaces, type aliases, generics, unions: all fine. But \`enum\`,
\`namespace\`, and legacy decorators *generate JavaScript code*, so stripped
Node rejects them. A few tsconfig options keep you inside the lines:

\`\`\`jsonc
// tsconfig.json — a minimal Node backend config
{
  "compilerOptions": {
    "module": "nodenext",           // resolve imports the way Node does
    "target": "esnext",
    "strict": true,                  // the whole point of TS
    "erasableSyntaxOnly": true,      // ban enum/namespace — stays strippable
    "verbatimModuleSyntax": true,    // type imports must say "import type"
    "rewriteRelativeImportExtensions": true, // allow import "./x.ts"
    "outDir": "dist"
  }
}
\`\`\`

\`erasableSyntaxOnly\` makes \`tsc\` reject the non-strippable constructs;
\`verbatimModuleSyntax\` forces \`import type\` for type-only imports so the
runtime never chokes on an import that was "really" just a type. And because
Node runs your \`.ts\` files as-is, imports between your own files carry the
real \`.ts\` extension — \`rewriteRelativeImportExtensions\` lets \`tsc\`
accept that and rewrite the paths to \`.js\` when it builds \`dist/\`.

### The scripts that tie it together

\`\`\`json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
\`\`\`

Dev loop: \`npm run dev\` and save files — instant restarts. Before pushing:
\`npm run typecheck\`. Production: \`npm run build\` emits JavaScript once, and
the server runs plain \`node\` with no TS tooling installed at all. Bonus
that replaces a PHP habit: \`node --env-file=.env app.js\` loads env vars
natively — no dotenv package needed.
`,

  comparisons: [
    {
      label: "The dev loop: refresh vs watch",
      intro:
        "Getting a server running and picking up code changes as you edit. PHP's built-in server re-reads files per request; tsx restarts the Node process on save — remember, Node loads modules once, so a restart is required.",
      php: `# PHP: no compile step, no process to restart.
# Every request re-reads your files from disk anyway.
php -S localhost:8000 -t public/

# or, Laravel:
php artisan serve

# Edit a file → refresh the browser. Done.
# (This is the ergonomic bar Node tooling has to meet.)`,
      ts: `# Node: the process loads code ONCE, so dev tooling
# must restart it on change. tsx does exactly that,
# running TypeScript directly with zero config:
npx tsx watch src/server.ts

# → API listening on :3000
# (edit + save any imported file)
# → [tsx] change in ./src/server.ts Restarting...
# → API listening on :3000

# Fast, but note what it is NOT doing: type-checking.`,
      note:
        "PHP gets live reload for free from its die-per-request model; Node needs a watcher precisely because the process is long-running. tsx (or stable node --watch app.ts on 22+) fills the gap.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "The same bug: 2 a.m. page vs failed build",
      intro:
        "A function expects an options array/object, and a caller passes a bare string. PHP finds out when that code path runs in production; tsc finds out before deploy.",
      php: `<?php
declare(strict_types=1);

function sendInvoice(array $options): void {
    $email = $options['email'];
    // ... send ...
}

// Deployed on Friday. Monday, a rarely-hit path calls:
sendInvoice('billing@example.com');
// PHP Fatal error: Uncaught TypeError: sendInvoice():
// Argument #1 ($options) must be of type array,
// string given — IN PRODUCTION, at runtime.`,
      ts: `// TypeScript: identical bug, different fate.
interface InvoiceOptions {
  email: string;
  amountCents: number;
}

function sendInvoice(options: InvoiceOptions): void {
  const email = options.email;
  // ... send ...
}

sendInvoice("billing@example.com");
// $ npm run typecheck
// error TS2345: Argument of type 'string' is not
// assignable to parameter of type 'InvoiceOptions'.
// The deploy never happens. Nobody gets paged.`,
      note:
        "This is the payoff for the new compile step: PHP's strict_types throws at CALL time on the unlucky request; tsc rejects every call site at BUILD time, including the paths your tests never exercise.",
    },
    {
      label: "Production: what actually ships",
      intro:
        "What lands on the server. PHP deploys source; a typical Node TS app builds once and ships plain JavaScript that any Node runs.",
      php: `# PHP deploy: the source IS the artifact.
rsync -a src/ user@server:/var/www/app/
ssh user@server 'cd /var/www/app && composer install --no-dev'

# Opcache compiles to bytecode on first hit.
# No build step — also no pre-deploy type gate.`,
      ts: `# Node deploy: check, build, ship the OUTPUT.
npm run typecheck        # gate: tsc --noEmit must pass
npm run build            # tsc emits plain JS into dist/
node dist/server.js      # prod runs vanilla JavaScript

# Alternative on Node 24 LTS: skip the build and run
# node src/server.ts directly — types are stripped
# natively. Still run tsc in CI: stripping ≠ checking.`,
      note:
        "Either way, tsc is the gatekeeper. Native type stripping (stable since Node 24.12.0) removes the build step if you keep to erasable syntax — set erasableSyntaxOnly so tsc enforces that boundary for you.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "A real terminal session: tsx watch happily re-runs code with a type error in it, and tsc is what actually catches the bug. Read the three commands and predict what each prints — especially whether the buggy save keeps the server running.",
    code: `# Terminal 1 — the dev loop:
npx tsx watch src/server.ts

# ...now edit src/server.ts and save this bug:
#   function greet(name: string) { return "hi " + name; }
#   greet(42);   // number, not string!

# Terminal 2 — the type gate:
npx tsc --noEmit
echo "tsc exit code: $?"`,
    output: `$ npx tsx watch src/server.ts
API listening on http://localhost:3000

[tsx] change in ./src/server.ts Restarting...
API listening on http://localhost:3000
# ^ tsx re-ran the BUGGY code without complaint —
#   it strips types, it never checks them.

$ npx tsc --noEmit
src/server.ts:9:7 - error TS2345: Argument of type 'number'
is not assignable to parameter of type 'string'.

9 greet(42);
        ~~

Found 1 error in src/server.ts:9

$ echo "tsc exit code: $?"
tsc exit code: 2
# Non-zero exit = CI fails = the bug never deploys.`,
  },

  keyPoints: [
    "Running and type-checking are separate: `node` and `tsx` execute past type errors; only `tsc` enforces them — wire `tsc --noEmit` into CI.",
    "Node 24 LTS runs `node app.ts` natively via type stripping, stable as of 24.12.0 — annotations are deleted, never checked, at execution time.",
    "Type stripping handles only erasable syntax: no `enum`, `namespace`, or legacy decorators. Set `erasableSyntaxOnly: true` and `verbatimModuleSyntax: true` so tsc polices the boundary.",
    "`tsx watch src/server.ts` is the friction-free dev loop — Node needs a restart-on-save watcher because the process loads modules once, unlike PHP's re-read-per-request.",
    "Minimal backend tsconfig: `module: \"nodenext\"`, `target: \"esnext\"`, `strict: true`, the two erasable-syntax options, and `rewriteRelativeImportExtensions` so your `.ts`-extension imports also survive a `tsc` build.",
    "The compile step is the price for moving PHP's runtime `TypeError`s to build time — and `node --env-file=.env` replaces the dotenv package while you're at it.",
  ],

  interview: [
    {
      q: "How do you run TypeScript on Node in development and in production?",
      a: "In development I use tsx watch, which runs the .ts entrypoint directly and restarts the process on every save — Node loads modules once per process, so unlike PHP a restart is genuinely needed to pick up changes. On Node 24 LTS I can also run node app.ts natively, since type stripping is stable there, as long as I stick to erasable syntax. For production the classic path is a build: tsc emits plain JavaScript to dist/ and the server runs node dist/server.js with no TS tooling at all; the newer path is shipping .ts and letting Node strip types at startup. Crucially, none of those runners check types — tsc --noEmit runs in CI as the gate, because executing TypeScript and validating it are separate operations.",
    },
    {
      q: "Node can strip types natively — so what's the catch, and how do you configure around it?",
      a: "Stripping means deleting annotations and running the JavaScript left behind, so it only works for syntax that's erasable — constructs with no runtime footprint. Interfaces, type aliases, generics, and unions all vanish cleanly, but enum, namespace, and legacy decorators compile into real JavaScript, so stripped Node rejects them. I set erasableSyntaxOnly: true in tsconfig so tsc flags those constructs at check time rather than letting them explode at run time, and verbatimModuleSyntax: true so type-only imports must be written as import type and never leak into runtime import statements. The other catch is that stripping is not checking — a file full of type errors runs fine under node app.ts, which is why tsc --noEmit stays in the pipeline regardless.",
    },
    {
      q: "Coming from PHP, which has no build step — is TypeScript's compile step worth it, and how do you keep it from hurting DX?",
      a: "It's worth it because it relocates a whole class of failures. In PHP, a wrong argument type with strict_types throws a TypeError at call time — meaning in production, on whatever unlucky request first hits that path. tsc rejects every incorrect call site before deploy, including paths no test covers. The DX cost is nearly zero with the right split: tsx watch gives me a save-and-it's-running loop as fast as php artisan serve, type errors show live in the editor via the language server, and the actual tsc run happens in CI where I don't feel it. So day-to-day it feels like scripting, while the pipeline enforces what PHP could only hope for at runtime.",
    },
  ],

  quiz: [
    {
      question:
        "Your file has a clear type error. What happens when you run it with `tsx watch` or `node app.ts` on Node 24?",
      options: [
        "Both refuse to start until the error is fixed",
        "Both run it anyway — types are stripped, not checked; only tsc reports the error",
        "tsx runs it but node rejects it",
        "It runs, but Node prints a type warning to stderr",
      ],
      answerIndex: 1,
      explain:
        "Runners strip annotations and execute the remaining JavaScript — neither tsx nor Node's native stripping performs type checking. That's tsc's job (`tsc --noEmit`), which is why it belongs in CI as the gate.",
    },
    {
      question:
        "Which construct will Node's native type stripping refuse to run?",
      options: [
        "A generic function like `function first<T>(xs: T[]): T`",
        "An interface with optional properties",
        "An `enum Color { Red, Green }`",
        "A union type alias like `type Id = string | number`",
      ],
      answerIndex: 2,
      explain:
        "enum (like namespace and legacy decorators) generates runtime JavaScript, so it can't simply be erased. Generics, interfaces, and type aliases are pure compile-time constructs that strip away cleanly. `erasableSyntaxOnly: true` makes tsc ban the non-strippable ones up front.",
    },
    {
      question:
        "Why does Node development need a watcher like `tsx watch` when PHP development needs nothing?",
      options: [
        "TypeScript files are cached by the OS",
        "PHP re-reads your source on every request; Node loads modules once per process, so only a restart picks up changes",
        "Node forbids editing files while the server runs",
        "tsx watch is what performs the type checking",
      ],
      answerIndex: 1,
      explain:
        "This is the runtime-shift again: PHP's die-per-request model means the next request naturally sees new code, while Node's long-running process holds the old modules in memory until restarted. tsx watch automates that restart — and does zero type checking while doing so.",
    },
  ],
};

export default lesson;
