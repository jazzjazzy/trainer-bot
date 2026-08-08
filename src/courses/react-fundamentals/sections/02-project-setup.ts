import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "project-setup",
  title: "Project Setup with Vite and TypeScript",
  part: "Thinking in React",
  estMinutes: 9,
  summary:
    "Scaffold a React 19 + TypeScript app with Vite, tour the generated files, and learn what createRoot, StrictMode, and the dev server actually do.",

  concept: `
Standing up a PHP project can be as simple as dropping a file into a web root.
React needs one build tool between your \`.tsx\` files and the browser — and in
2026 that tool is **Vite**. One command scaffolds everything:

\`\`\`bash
npm create vite@latest my-app -- --template react-ts
\`\`\`

If you learned React from older tutorials: **Create React App is dead** —
deprecated and unmaintained. Vite is the standard client-side starter; don't
reach for CRA.

### The tour: what you actually got

\`\`\`
my-app/
├── index.html        ← the ONE page the server ever sends
├── package.json      ← composer.json, in npm form
├── tsconfig.json     ← TypeScript compiler settings
├── vite.config.ts    ← build/dev-server config (react plugin)
└── src/
    ├── main.tsx      ← the entry: mounts <App /> into the DOM
    └── App.tsx       ← your root component
\`\`\`

The PHP mapping: \`index.html\` plus the JS bundle is your **front
controller**. Where a PHP app has \`about.php\` and \`contact.php\` (or routes
dispatched by \`index.php\`), a React SPA has exactly one HTML file containing
\`<div id="root"></div>\` and a \`<script type="module">\` tag — every "page"
from then on is a component rendered into that div.

### main.tsx: mounting once, not per request

\`\`\`tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
\`\`\`

\`createRoot\` claims a DOM node and \`render\` mounts your component tree
into it — **once per browser tab**, not once per request. After this line,
React owns everything inside \`#root\` and updates it as state changes. (The
\`!\` is TypeScript: \`getElementById\` returns \`HTMLElement | null\`, and we
assert the div exists because we wrote the HTML.)

### StrictMode: the dev-only smoke detector

\`<StrictMode>\` adds no UI and does nothing in production. In development it
deliberately **runs your component functions twice** (also \`useState\`
initializers and updaters), using one result and discarding the other. Why?
React assumes rendering is pure — same inputs, same JSX, no side effects.
Double-invoking makes impure renders visibly misbehave *on your machine*
instead of subtly in production. When you later see a log line appear twice in
dev, that's StrictMode doing its job, not a bug. It also stress-tests effects
by running an extra setup/cleanup cycle — relevant once you meet \`useEffect\`.

### The dev loop: HMR replaces save-and-F5

\`npm run dev\` starts Vite's dev server (typically \`localhost:5173\`). It
serves your modules on demand, transpiled in milliseconds, and **hot module
replacement** pushes edits into the running page — usually preserving
component state — so you rarely even press F5. One important honesty note:
Vite only *strips* the types for speed; it does **not** type-check. Your
editor checks as you type, and \`tsc\` runs as part of \`npm run build\`, which
type-checks and then emits an optimized static \`dist/\` folder you can host
on any static file server — no PHP-style runtime required.
`,

  comparisons: [
    {
      label: "How code reaches the browser",
      intro:
        "The entry point of each architecture. PHP runs your script top-to-bottom on every request and the process ends; a React app mounts once and stays resident.",
      php: `<?php // index.php — executed fresh for EVERY request
require 'vendor/autoload.php';

$route = $_GET['page'] ?? 'home';
$html  = render_page($route); // build the full HTML string
echo $html;                   // send it — then the process ends`,
      ts: `// src/main.tsx — runs ONCE per browser tab, then stays alive
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
// From here on, React updates #root as state changes —
// no further page loads.`,
      note:
        "PHP's lifecycle is per-request and stateless; createRoot mounts a persistent component tree, so 'navigation' and 'updates' become in-memory renders instead of new requests.",
    },
    {
      label: "Many entry files vs one index.html",
      intro:
        "How a URL becomes a page. Classic PHP has one file (or route) per page; a Vite React app serves the same skeleton HTML for every URL and renders the right component.",
      php: `<!-- about.php — one file per page, assembled from includes -->
<?php include 'header.php'; ?>
<main>
  <h1>About us</h1>
</main>
<?php include 'footer.php'; ?>`,
      ts: `<!-- index.html — the ONLY page Vite ever serves -->
<!doctype html>
<html lang="en">
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
<!-- every "page" is a component rendered into #root -->`,
      note:
        "index.html + the bundle is the front controller: one entry, all views are components — which is why SPAs need a client-side router (later in your stack) rather than the filesystem mapping URLs to files.",
      rightLang: "html",
    },
    {
      label: "'Just works' vs compiled and type-checked",
      intro:
        "Both snippets contain the same typo'd variable name. PHP discovers it in the browser at runtime; TSX never gets that far.",
      php: `<?php // hello.php — save, refresh, it runs immediately
$greeting = 'Hello';
echo $greetting;
// Warning: Undefined variable $greetting
// ...discovered at runtime, in the browser or the logs`,
      ts: `// Hello.tsx — must be transpiled; checked before it runs
const greeting = 'Hello';

export function Hello() {
  return <p>{greetting}</p>;
  //         ~~~~~~~~~
  // TS2552: Cannot find name 'greetting'.
  //         Did you mean 'greeting'?
  // The bug never reaches a browser.
}`,
      note:
        "The build step PHP never needed is the price of admission — and the payoff: the whole class of undefined-variable/typo bugs moves from production logs to red squiggles.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "The full scaffold-to-dev-server transcript. Read each command and predict what it produces before checking the output.",
    code: `# 1. Scaffold — the template flag means zero interactive prompts
npm create vite@latest my-app -- --template react-ts

# 2. Install dependencies and start the dev server
cd my-app
npm install
npm run dev

# 3. In a second terminal: what did we actually get?
ls my-app/ my-app/src/`,
    output: `$ npm create vite@latest my-app -- --template react-ts

Scaffolding project in /home/jason/my-app...

Done. Now run:

  cd my-app
  npm install
  npm run dev

$ npm install
added ~180 packages in 9s

$ npm run dev

  VITE  ready in 320 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h + enter to show help

$ ls my-app/ my-app/src/
my-app/:
eslint.config.js  index.html  package.json  public  README.md
src  tsconfig.app.json  tsconfig.json  tsconfig.node.json  vite.config.ts

my-app/src/:
App.css  App.tsx  assets  index.css  main.tsx  vite-env.d.ts

# index.html is the single entry (front controller);
# main.tsx mounts <App /> into <div id="root"> exactly once.`,
  },

  keyPoints: [
    "`npm create vite@latest my-app -- --template react-ts` is the standard React 19 + TypeScript scaffold; Create React App is deprecated — don't use it.",
    "`index.html` + the JS bundle ≈ a front controller: one entry page with `<div id=\"root\">`, and every 'page' is a component rendered into it.",
    "`createRoot(el).render(<App />)` in `main.tsx` mounts the tree once per browser tab — not once per request.",
    "StrictMode is dev-only: it double-invokes component functions (and useState initializers/updaters) to surface impure renders — duplicate dev logs are it working, not a bug.",
    "Vite's dev server transpiles on demand and hot-swaps edits into the running page (HMR), usually preserving state — but it does NOT type-check; your editor and `npm run build` do.",
    "`npm run build` type-checks then emits a static `dist/` — deployable to any static host, no runtime server like PHP needs.",
  ],

  interview: [
    {
      q: "How would you start a new React project today, and why not Create React App?",
      a: "For a client-rendered app I'd scaffold with Vite: `npm create vite@latest my-app -- --template react-ts`, which gives me React 19, TypeScript, and a fast dev server out of the box. Create React App is deprecated and unmaintained — it was built on webpack with slow cold starts and rebuilds, and the React team no longer recommends it. Vite serves source files as native ES modules in dev with esbuild transpilation, so startup is near-instant and HMR is fast regardless of app size. If the project needed server rendering or file-based routing from day one, I'd reach for a framework like Next.js instead, but Vite is the right default for learning and for SPAs.",
    },
    {
      q: "What does StrictMode do, and why does my component log twice in development?",
      a: "StrictMode is a development-only wrapper that adds no UI and has zero effect in production builds. Its main trick is deliberately double-invoking functions that must be pure — the component function body, useState initializers, and updater functions — using one result and discarding the other. If a render has a side effect or mutates something it shouldn't, running it twice makes the bug loud in development instead of subtle in production. It also runs an extra effect setup/cleanup cycle to catch effects missing cleanup. So a doubled console.log in dev is StrictMode verifying purity — the fix is never to remove StrictMode, it's to make the render pure.",
    },
    {
      q: "Does Vite type-check your TypeScript? Walk me through where types are enforced.",
      a: "No — in dev Vite only strips types using esbuild, because transpile-only is what makes it fast. Type errors surface in two places: the editor's TypeScript language server as you type, and `tsc` run as part of `npm run build`, so a type error fails the production build rather than the dev loop. That separation is deliberate: checking is a whole-program analysis and would slow HMR down. In CI you'd typically run `tsc --noEmit` (or the build) so nothing unchecked ships. Coming from PHP it's the biggest workflow change: there's a compile gate between saving a file and shipping it.",
    },
  ],

  quiz: [
    {
      question: "What is the current standard way to scaffold a client-side React + TypeScript project?",
      options: [
        "npx create-react-app my-app --template typescript",
        "npm create vite@latest my-app -- --template react-ts",
        "composer create-project react/react my-app",
        "npm install react && manually write a webpack config",
      ],
      answerIndex: 1,
      explain:
        "Vite is the standard starter for client-only React; the react-ts template wires up React 19 + TypeScript. Create React App is deprecated — recognizing that is itself interview signal.",
    },
    {
      question: "In development, StrictMode causes your component function to run twice. Why?",
      options: [
        "To warm up the JIT compiler for faster subsequent renders",
        "Because HMR always renders twice after a file change",
        "To expose impure renders — code with side effects behaves visibly wrong when run twice",
        "To pre-render the next likely state of the UI",
      ],
      answerIndex: 2,
      explain:
        "React requires render purity, so StrictMode double-invokes render-phase functions in dev and discards one result. Pure code is unaffected; impure code misbehaves where you can see it. It does nothing in production.",
    },
    {
      question: "Which statement about Vite's dev server is true?",
      options: [
        "It type-checks every file before serving it",
        "It transpiles TypeScript (stripping types) but leaves type-checking to your editor and the build",
        "It requires a full rebundle of the app after each edit",
        "It serves a pre-built dist/ folder and watches for changes",
      ],
      answerIndex: 1,
      explain:
        "Vite serves modules on demand and strips types with esbuild for speed — no checking, no full rebundles. Type enforcement happens in the editor and via tsc during `npm run build`.",
    },
    {
      question: "How does a Vite React SPA's entry model differ from a classic PHP site?",
      options: [
        "Each React view gets its own generated HTML file, like about.php",
        "The server renders each component to HTML per request",
        "There is one index.html with a root div; main.tsx mounts the component tree into it once, and all views are components",
        "index.html is regenerated by the dev server on every navigation",
      ],
      answerIndex: 2,
      explain:
        "The SPA serves the same skeleton HTML for every URL; createRoot mounts <App /> once per tab and everything after that is client-side rendering — index.html plus the bundle acts as the front controller.",
    },
  ],
};

export default lesson;
