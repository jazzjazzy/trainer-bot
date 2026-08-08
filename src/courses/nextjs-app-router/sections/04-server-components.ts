import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "server-components",
  title: "Server Components: The Default",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "Every component in app/ is a React Server Component unless it opts out: it runs only on the server, can await data directly, and ships zero JavaScript to the browser — the PHP request model, reborn with types.",

  concept: `
This is the thesis of the whole course: **every component under \`app/\`
is a React Server Component (RSC) by default.** No import, no directive,
no config — write a component in \`app/\`, and it runs *only on the
server*, either per request or once at build time. Its JavaScript is
never sent to the browser; only its rendered output travels.

If you've spent 25 years writing PHP, you already have the mental model
the React world spent five years rediscovering:

\`\`\`php
<?php
$stmt = $pdo->query('SELECT name, price FROM products');
foreach ($stmt as $row) {
    echo '<li>' . htmlspecialchars($row['name']) . '</li>';
}
// script ends, everything is gone, HTML is on the wire
\`\`\`

An RSC is that lifecycle, componentized:

\`\`\`tsx
// app/products/page.tsx — async is allowed, and idiomatic
export default async function ProductsPage() {
  const products = await db.query("SELECT name, price FROM products");
  return (
    <ul>
      {products.map((p) => <li key={p.name}>{p.name}</li>)}
    </ul>
  );
}
\`\`\`

### Async components: the useEffect detour is over

In classic client-side React, getting data into a component meant the
famous waterfall: render empty → \`useEffect\` fires → \`fetch\` an API →
set state → re-render. That's a browser round-trip to an API you had to
build, just to do what PHP does in line one of a script.

A Server Component simply **awaits its data in the function body**. No
\`useEffect\`, no loading-state boilerplate, no client-visible API
endpoint for your own page's data, no serializing to JSON and back. The
component *is* the controller and the view. And because it runs where
the database lives, secrets are safe: \`process.env.DATABASE_URL\`, an ORM
client, the filesystem — all fine, none of it reaches the browser.

### What Server Components cannot do

They render to output and are gone — so anything that requires *living
in the browser* is off the table:

- **No state or lifecycle**: \`useState\`, \`useReducer\`, \`useEffect\` are
  compile-time errors in an RSC.
- **No event handlers**: \`onClick={...}\` can't work — by the time the
  user clicks, the component's code no longer exists anywhere near them.
- **No browser APIs**: \`window\`, \`document\`, \`localStorage\` don't exist
  on the server.

If you need any of those, that piece of UI becomes a Client Component —
the next section. The skill of App Router development is keeping as much
as possible on the server side of that line.

### "Everything dies with the response" — with one honest caveat

The *render* is stateless, exactly like PHP: each request produces a
fresh render from fresh data, and nothing about it survives to the next
request. But there's one difference worth stating precisely, because it's
an interview trap: PHP tears down the entire process after each request,
while Next.js runs in a **long-lived Node.js process**. A module-level
variable in a Server Component file *does* persist across requests and is
*shared between users*. So the discipline PHP gave you for free —
never rely on cross-request memory — you now have to keep by convention:
per-request data lives in function scope, shared caches are deliberate,
and nothing user-specific ever sits at module level.

### Server-first is the default posture

Static content, data display, markup composition — Server Component.
Dashboards, tables, article pages, nav bars — Server Components. Zero
bundle cost, direct data access, HTML on first byte. You only reach for
the client when the browser genuinely has a job to do.
`,

  comparisons: [
    {
      label: "Query + render, both worlds",
      intro:
        "List products from the database. Both run on the server per request and send finished HTML; neither ships any of this code to the browser.",
      php: `<?php // products.php
$pdo = new PDO($dsn, $user, $pass);
$stmt = $pdo->query(
  'SELECT id, name, price_cents FROM products ORDER BY name'
);
?>
<main>
  <h1>Products</h1>
  <ul>
  <?php foreach ($stmt as $p): ?>
    <li>
      <?= htmlspecialchars($p['name']) ?> —
      $<?= number_format($p['price_cents'] / 100, 2) ?>
    </li>
  <?php endforeach; ?>
  </ul>
</main>`,
      ts: `// app/products/page.tsx — an async Server Component
import { db } from "@/lib/db";

type Product = { id: number; name: string; priceCents: number };

export default async function ProductsPage() {
  const products = await db.query<Product>(
    "SELECT id, name, price_cents FROM products ORDER BY name"
  );

  return (
    <main>
      <h1>Products</h1>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            {p.name} — \${(p.priceCents / 100).toFixed(2)}
          </li>
        ))}
      </ul>
    </main>
  );
}`,
      note: "Identical lifecycle — server queries, server renders, HTML ships — but the RSC is typed (Product flows into the JSX), escaping is automatic, and the markup is a reusable component, not a script.",
    },
    {
      label: "No useEffect detour",
      intro:
        "The old client-React pattern for the same page: render empty, fetch from an API you also had to build, re-render. The Server Component deletes the whole round trip.",
      php: `// The client-side React way (what RSCs replace)
"use client";
import { useEffect, useState } from "react";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")        // an endpoint you had to build
      .then((r) => r.json())      // types lost at the boundary
      .then((data) => { setProducts(data); setLoading(false); });
  }, []);

  if (loading) return <p>Loading…</p>;
  return <ul>{products.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}`,
      ts: `// app/products/page.tsx — the Server Component way
import { db } from "@/lib/db";

export default async function ProductsPage() {
  // one await, on the server, next to the database
  const products = await db.products.findMany();

  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}`,
      note: "The RSC needs no /api/products endpoint, no loading state, no JSON boundary — and sends zero component JavaScript to the browser, where the client version ships all of it.",
      leftLang: "tsx",
    },
    {
      label: "Statelessness: free in PHP, a discipline in Node",
      intro:
        "Both try to count requests in a 'global'. PHP resets every request by construction; the Node process is long-lived, so module scope silently persists and is shared across users.",
      php: `<?php // counter.php
$count = 0;      // fresh process, fresh variable — every request
$count++;

echo "Request #$count";
// prints "Request #1" for EVERY visitor, always.
// PHP's shared-nothing model makes cross-request
// state impossible without opting in (DB, redis, session).`,
      ts: `// app/counter/page.tsx
let count = 0; // module scope: LIVES ACROSS REQUESTS, shared by all users

export default async function CounterPage() {
  count++; // request 1 renders 1, request 2 renders 2...
  return <p>Request #{count}</p>;
}

// The render itself is stateless like PHP, but the Node process
// is not. Keep per-request data in function scope; never put
// user-specific values at module level.`,
      note: "The interview-grade nuance: RSC renders are per-request and disposable like PHP pages, but Node's long-lived process means module-level mutable state leaks across requests and users — a bug class PHP physically couldn't have.",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Read this async Server Component and predict the exact HTML it renders for a request. Note what does NOT happen: no useEffect, no fetch to an API route, no JS shipped for it.",
    code: `// app/products/page.tsx — a React Server Component (the default)

type Product = { id: number; name: string; priceCents: number };

// Stand-in for a real data source (a DB client works the same way here)
async function getProducts(): Promise<Product[]> {
  return [
    { id: 1, name: "Keyboard", priceCents: 12900 },
    { id: 2, name: "Mouse", priceCents: 4900 },
    { id: 3, name: "Monitor", priceCents: 34900 },
  ];
}

export default async function ProductsPage() {
  const products = await getProducts(); // awaited in the component body

  return (
    <main>
      <h1>Products ({products.length})</h1>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            {p.name} — \${(p.priceCents / 100).toFixed(2)}
          </li>
        ))}
      </ul>
    </main>
  );
}`,
    output: `<main>
  <h1>Products (3)</h1>
  <ul>
    <li>Keyboard — $129.00</li>
    <li>Mouse — $49.00</li>
    <li>Monitor — $349.00</li>
  </ul>
</main>

(rendered on the server; this component contributes 0 bytes of JS
to the browser bundle)`,
  },

  keyPoints: [
    "Every component under `app/` is a React Server Component by default: it runs only on the server (per request or at build) and ships zero JavaScript to the browser — only its rendered output travels.",
    "Server Components can be `async` and simply `await` their data in the function body — no `useEffect`, no loading-state boilerplate, no API endpoint for your own page's data.",
    "They run where the secrets live: direct DB queries, `process.env`, the filesystem — none of it can leak into a bundle because none of it is bundled.",
    "What they can't do: no `useState`/`useEffect`, no event handlers like `onClick`, no browser APIs — anything interactive becomes a Client Component.",
    "The render is stateless like a PHP page, but the Node process is long-lived: module-level mutable state persists across requests and users, so keep per-request data in function scope.",
    "Default posture: stay on the server; opt into the client only where the browser genuinely has a job to do.",
  ],

  interview: [
    {
      q: "What is a React Server Component, and what problem does it solve?",
      a: "It's a component that executes only on the server — per request or at build time — and whose code never ships to the browser; the client receives its rendered output. It solves the cost client-side React imposed on pages that were never interactive to begin with: with RSCs there's no bundle weight for display-only UI, no `useEffect`-then-`fetch` waterfall, and no need to build an API endpoint just to feed your own page. The component awaits the database directly and returns JSX. Coming from PHP I'd describe it as the PHP page model — run on the server, query, render, discard — finally available inside React's component system, with types flowing from the query to the markup.",
    },
    {
      q: "Why can't a Server Component use useState or an onClick handler?",
      a: "Because by the time the user could click anything, the component no longer exists. An RSC runs on the server during rendering, emits its output, and is done — like a PHP script after the response is sent. `useState` implies a component instance living in the browser across re-renders, and `onClick` needs a function present in the browser to invoke; a Server Component ships neither its code nor any instance to the client, so both are impossible by design — the framework rejects them rather than failing at runtime. The moment I need state, effects, event handlers, or browser APIs, I mark that piece of UI with `\"use client\"` and keep it as small as possible.",
    },
    {
      q: "Are Server Components stateless like PHP scripts?",
      a: "The render is: each request produces a fresh render from fresh data, and nothing about that render survives to the next request — the same shared-nothing feel as PHP. But the runtime differs in a way worth being precise about: PHP tears down the whole process per request, whereas Next.js serves many requests from one long-lived Node process. So a module-level variable in a Server Component file persists across requests and is shared between all users — a place for deliberate caches, and a serious bug if anything user-specific lands there. PHP made cross-request leaks physically impossible; in Next.js that's a discipline: per-request data stays in function scope.",
    },
    {
      q: "How does data fetching in a Server Component differ from classic client-side React?",
      a: "Classic client React renders an empty shell, then `useEffect` fires in the browser, fetches JSON from an API route you also had to build and secure, and re-renders — an extra network round trip, a loading state, and a type-erasing JSON boundary. A Server Component collapses all of that into one `await` in the component body, executed on the server next to the data source. The user gets meaningful HTML on the first byte, there's no client-visible endpoint for page data, and TypeScript types flow unbroken from the query result into the JSX. The old pattern still has a place for truly client-driven data, but it's no longer the default way a page gets its content.",
    },
  ],

  quiz: [
    {
      question:
        "A component in app/ has no directives at the top of its file. Where does it run?",
      options: [
        "In the browser after hydration",
        "On both server and browser, like all React components",
        "Only on the server (per request or at build) — it's a Server Component by default",
        "Wherever it's first imported from",
      ],
      answerIndex: 2,
      explain:
        "Server Components are the App Router default — no opt-in needed. The component executes on the server only, and none of its code is included in the browser bundle; opting OUT requires \"use client\".",
    },
    {
      question: "Which of these is allowed inside a Server Component?",
      options: [
        "useState to track a counter",
        "await db.query(...) directly in the component body",
        "onClick={() => setOpen(true)}",
        "reading window.location to get the current URL",
      ],
      answerIndex: 1,
      explain:
        "Async data access is exactly what RSCs are for — the component can await the database directly. State, event handlers, and browser APIs all require a living browser-side component, which an RSC is not.",
    },
    {
      question:
        "let visits = 0 sits at module level in a Server Component file, incremented on each render. What happens in production?",
      options: [
        "It resets to 0 on every request, like a PHP variable",
        "It causes a compile error — module state is forbidden in app/",
        "It persists across requests in the long-lived Node process and is shared between all users",
        "Each user gets their own copy, stored in their session",
      ],
      answerIndex: 2,
      explain:
        "Unlike PHP's shared-nothing processes, Node serves many requests from one process, so module scope survives across requests and users. The render is stateless; the process is not — keep per-request data in function scope.",
    },
  ],
};

export default lesson;
