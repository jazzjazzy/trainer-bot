import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "client-components",
  title: 'Client Components & "use client"',
  part: "Foundations",
  estMinutes: 12,
  summary:
    "\"use client\" marks the boundary where server-rendered React hands off to browser React: that file and everything it imports joins the client bundle, still server-renders its initial HTML, then hydrates.",

  concept: `
Server Components can't respond to a click. The moment a piece of UI
needs **state, effects, event handlers, or browser APIs**, it has to live
in the browser — and you say so with one line at the top of the file:

\`\`\`tsx
// components/Counter.tsx
"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
}
\`\`\`

PHP developers have drawn this exact line for decades: the server renders
the page, and the interactive bits get a sprinkle of jQuery or Alpine on
top. \`"use client"\` is that line made explicit and typed — except now
both sides are React, sharing one component model instead of two
disconnected worlds.

### It's a boundary, not a label

The most misunderstood fact in Next.js: \`"use client"\` does **not** mark
one component. It marks a **module boundary**. The file that declares it
— *and every module it imports, transitively* — becomes client-bundle
territory. Nothing below the boundary needs (or should repeat) the
directive; it's already on the client side of the line.

That has a sharp consequence: put \`"use client"\` at the top of a page
and you've dragged the entire page, every component it imports, and every
helper *they* import into the browser bundle — and given up direct data
access for all of it. The discipline is to **push the directive to the
leaves**: keep pages and layouts as Server Components, and carve out the
smallest interactive islands (\`Counter\`, \`SearchBox\`, \`ThemeToggle\`)
as client files.

\`\`\`tsx
// app/page.tsx — stays a Server Component
import { Counter } from "@/components/Counter"; // a "use client" file

export default async function HomePage() {
  const stats = await db.stats(); // still allowed here
  return (
    <main>
      <h1>Visitors: {stats.visitors}</h1>
      <Counter /> {/* the island of interactivity */}
    </main>
  );
}
\`\`\`

A Server Component can render a Client Component freely. The reverse
import is the one that doesn't work: a client file importing a server
file would pull server code into the browser bundle. (The escape hatch —
passing Server Components *as children* into client ones — is a later
section's topic.)

### Client Components still render on the server first

"Client" does not mean "browser-only". On the initial request, a Client
Component **renders to HTML on the server** along with everything else —
the user sees a fully-formed page immediately. The browser then downloads
the component's JS and **hydrates** it: React attaches event handlers and
state to the existing markup, and from that moment it's live. So the
\`Counter\` above arrives as \`<button>Count: 0</button>\` in the initial
HTML, and becomes clickable a moment later.

Two practical consequences:

- The first render runs in Node, so \`window\` isn't available even in a
  Client Component during SSR — touch browser APIs inside \`useEffect\`
  (which only runs after hydration, in the browser).
- Props crossing from server to client must be **serializable** — plain
  data, not class instances or functions (Server Actions excepted).
  It's the same rule as any server-to-browser handoff, and PHP developers
  know it from designing JSON payloads.

### The cost model

Every module behind a \`"use client"\` boundary is JavaScript the user
downloads, parses, and executes. Server Components cost the user nothing.
That's the whole performance argument of the App Router, and interviewers
probe it: the question is never "server or client?" but "how little
client can this page get away with?"
`,

  comparisons: [
    {
      label: "The interactivity sprinkle",
      intro:
        "A server-rendered page with one interactive counter. PHP bolts a script tag onto its HTML; Next.js imports a client component into a Server Component.",
      php: `<?php // page.php — server HTML + a jQuery sprinkle
$visitors = $pdo->query('SELECT COUNT(*) FROM visits')->fetchColumn();
?>
<h1>Visitors: <?= (int) $visitors ?></h1>
<button id="counter" data-count="0">Count: 0</button>

<script>
  // a second, disconnected world: no types, no shared code
  $('#counter').on('click', function () {
    var n = parseInt($(this).data('count'), 10) + 1;
    $(this).data('count', n).text('Count: ' + n);
  });
</script>`,
      ts: `// components/Counter.tsx
"use client";
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>Count: {count}</button>
  );
}

// app/page.tsx — still a Server Component
import { Counter } from "@/components/Counter";
import { db } from "@/lib/db";

export default async function HomePage() {
  const visitors = await db.visits.count();
  return (
    <main>
      <h1>Visitors: {visitors}</h1>
      <Counter />
    </main>
  );
}`,
      note: "Same architecture — server page, interactive island — but both sides are typed React sharing one component model, instead of PHP templates plus an untyped jQuery layer that can drift out of sync.",
    },
    {
      label: "Anti-pattern: hoisting \"use client\" to the page",
      intro:
        "One search box needs state, so the whole page gets the directive. Left: the anti-pattern. Right: push the boundary to the leaf and keep the page on the server.",
      php: `// app/products/page.tsx — ANTI-PATTERN
"use client"; // one input needed state, now EVERYTHING is client

import { useState, useEffect } from "react";
import { ProductList } from "@/components/ProductList";

export default function ProductsPage() {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    // lost direct DB access — back to fetching an API
    fetch("/api/products").then((r) => r.json()).then(setProducts);
  }, []);

  return (
    <main>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <ProductList products={products} filter={query} />
    </main>
  );
}`,
      ts: `// components/SearchBox.tsx — the ONLY client file
"use client";
import { useState } from "react";

export function SearchBox({ names }: { names: string[] }) {
  const [query, setQuery] = useState("");
  const hits = names.filter((n) =>
    n.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul>{hits.map((n) => <li key={n}>{n}</li>)}</ul>
    </>
  );
}

// app/products/page.tsx — Server Component, direct data access kept
import { SearchBox } from "@/components/SearchBox";
import { db } from "@/lib/db";

export default async function ProductsPage() {
  const products = await db.products.findMany();
  return (
    <main>
      <h1>Products</h1>
      <SearchBox names={products.map((p) => p.name)} />
    </main>
  );
}`,
      note: "Hoisting the directive costs you twice: the whole page's code joins the browser bundle, and the page loses server powers like direct DB access. Push \"use client\" to the smallest leaf that needs it, passing serializable props across the boundary.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The boundary rule as an algorithm: one file declares \"use client\", and everything reachable through its imports joins the client bundle. Predict which of the six modules end up in the browser bundle, then run it.",
    code: `// "use client" marks a BOUNDARY: the declaring file plus everything
// it imports (transitively) becomes part of the client bundle.

type Mod = { file: string; imports: string[]; useClient?: boolean };

const graph: Mod[] = [
  { file: "app/page.tsx", imports: ["components/Hero.tsx", "components/Counter.tsx"] },
  { file: "components/Hero.tsx", imports: ["lib/format.ts"] },
  { file: "components/Counter.tsx", imports: ["components/Button.tsx"], useClient: true },
  { file: "components/Button.tsx", imports: ["lib/format.ts"] },
  { file: "lib/format.ts", imports: [] },
  { file: "lib/db.ts", imports: [] }, // imported by nobody here
];

const byFile = new Map(graph.map((m) => [m.file, m]));

// Start from every file that declares "use client"...
const clientBundle = new Set<string>();
const queue = graph.filter((m) => m.useClient).map((m) => m.file);

// ...and flood-fill through its imports.
while (queue.length > 0) {
  const file = queue.shift()!;
  if (clientBundle.has(file)) continue;
  clientBundle.add(file);
  queue.push(...(byFile.get(file)?.imports ?? []));
}

for (const m of graph) {
  const side = clientBundle.has(m.file) ? "CLIENT bundle" : "server only  ";
  const mark = m.useClient ? '  <- declares "use client"' : "";
  console.log(\`\${side}  \${m.file}\${mark}\`);
}

console.log("---");
console.log("Note: Button.tsx never says 'use client' — Counter imported it");
console.log("across the boundary. format.ts is shared: bundled for the client");
console.log("AND still usable on the server (Hero imports it there).");`,
  },

  keyPoints: [
    "`\"use client\"` at the top of a file opts into the browser: that component may use `useState`, `useEffect`, event handlers, and browser APIs.",
    "It marks a module BOUNDARY, not one component: the declaring file plus everything it imports, transitively, joins the client bundle — files below the boundary don't repeat the directive.",
    "Client Components still render their initial HTML on the server, then hydrate in the browser — so `window` is unavailable during that first render; touch browser APIs inside `useEffect`.",
    "Server Components can import and render Client Components; the reverse import would drag server code into the bundle and doesn't work.",
    "Props crossing the server → client boundary must be serializable plain data — the same rule as designing a JSON payload in PHP.",
    "Push `\"use client\"` to the leaves: keep pages and layouts on the server and carve interactivity into the smallest possible islands — every client module is JS the user downloads.",
  ],

  interview: [
    {
      q: "What exactly does \"use client\" do?",
      a: "It declares a boundary in the module graph between server and client React. The file carrying the directive — and every module it imports, transitively — is compiled into the browser bundle, which is what allows state, effects, event handlers, and browser APIs there. It doesn't mark a single component, and files below the boundary don't need to repeat it: anything a client file imports is client territory automatically. That's why placement is an architectural decision — the directive at a page's root drags the whole subtree's code into the bundle, while the same directive on a leaf `Counter.tsx` costs a few kilobytes. I think of it as the typed version of the line PHP apps always had between server-rendered HTML and the jQuery sprinkled on top.",
    },
    {
      q: "Do Client Components skip server rendering?",
      a: "No — that's a common misconception the name invites. On the initial request, Client Components render to HTML on the server along with the Server Components, so the user gets a complete page on first byte. The browser then loads the component's JavaScript and hydrates: React attaches state and event handlers to the markup that's already on screen. Two things follow. First, code in a Client Component's render path still executes in Node during SSR, so `window` or `localStorage` there will crash the server render — browser APIs belong in `useEffect`, which only runs after hydration. Second, the pre-hydration page is visible but not yet interactive, which is why keeping client bundles small matters for time-to-interactive.",
    },
    {
      q: "A page needs one stateful search box. Where does \"use client\" go, and why?",
      a: "On the search box's own file — never on the page. The page stays a Server Component: it keeps direct data access, can stay async, and contributes nothing to the browser bundle. It fetches the data and passes what the search box needs as serializable props across the boundary. If I instead put `\"use client\"` at the top of the page, every component the page imports becomes client code: the bundle grows, and the page loses server capabilities — suddenly I'm back to fetching my own API from `useEffect` for data I could have awaited directly. The rule of thumb I'd give: Server Components by default, `\"use client\"` pushed to the smallest leaf that genuinely needs the browser.",
    },
  ],

  quiz: [
    {
      question:
        "Counter.tsx declares \"use client\" and imports Button.tsx, which has no directive. Where does Button.tsx's code run?",
      options: [
        "Server only — it never declared \"use client\"",
        "It's a build error: Button.tsx must also declare \"use client\"",
        "It joins the client bundle — imports from a client file are client territory automatically",
        "It runs on the server but its HTML is hydrated separately",
      ],
      answerIndex: 2,
      explain:
        "\"use client\" marks a boundary in the module graph: everything a client file imports, transitively, is compiled for the browser. Files below the boundary never repeat the directive.",
    },
    {
      question:
        "What happens to a Client Component on the very first page request?",
      options: [
        "The server sends an empty placeholder and the browser renders it from scratch",
        "It renders to HTML on the server, then hydrates in the browser where React attaches state and handlers",
        "It's skipped until the user first interacts with it",
        "It renders twice in the browser, once for HTML and once for events",
      ],
      answerIndex: 1,
      explain:
        "Client Components still SSR their initial HTML — 'client' means 'also runs in the browser', not 'browser-only'. Hydration then makes the existing markup interactive. That's also why window is unavailable during the first render.",
    },
    {
      question:
        "Why is putting \"use client\" at the top of a page component usually a mistake?",
      options: [
        "Pages are not allowed to carry the directive, so the build fails",
        "It disables server-side rendering for the whole site",
        "The page and its entire import tree join the browser bundle, and the page loses server powers like direct data access",
        "It forces every child component to repeat the directive",
      ],
      answerIndex: 2,
      explain:
        "The directive at the root claims the whole subtree for the client: more JS shipped, and no more async/await-the-database in the page. Push it to the leaf components that actually need interactivity.",
    },
  ],
};

export default lesson;
