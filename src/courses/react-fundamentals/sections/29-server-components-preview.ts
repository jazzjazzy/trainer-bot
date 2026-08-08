import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "server-components-preview",
  title: "Server Components: What Next.js Adds",
  part: "Patterns & Production",
  estMinutes: 11,
  summary:
    "React Server Components run only on the server, can await the database directly, and ship zero JS — a model startlingly close to a PHP page, now composable with client interactivity.",

  concept: `
This is a read-level preview, and it needs framing before anything else:
**Server Components are not part of a Vite single-page app.** They're what a
full-stack framework — Next.js (App Router) is the big one — layers on top
of React. Everything you've learned in this course is *client-component*
React, and all of it still applies inside any framework. This section is
about the new layer, because job listings and interviews mention it
constantly.

### What a Server Component is

A React Server Component (RSC) runs **only on the server** — at request
time or build time. That single fact produces everything else:

- It can be an \`async\` function and \`await\` the database **directly** — no API route, no fetch-from-the-client, no loading state for its own data.
- It ships **zero JavaScript** for itself. The client receives its rendered output, not its code.
- It **cannot** use state, effects, or event handlers. \`useState\` in a Server Component is an error — there's no living component on the client to hold state or receive clicks.

\`\`\`tsx
// A Server Component (in RSC frameworks, server is the default)
async function NoteList({ userId }: { userId: string }) {
  const notes = await db.notes.forUser(userId); // yes, directly
  return <ul>{notes.map((n) => <li key={n.id}>{n.title}</li>)}</ul>;
}
\`\`\`

### The part that should feel familiar

Read that component again as a 25-year PHP developer: **fetch data, render
markup, send the result**. That's a PHP page. After a decade of "move
everything to the client, fetch over JSON APIs", the industry partially
circled back to the model you already know — because for content that isn't
interactive, render-on-the-server-and-send-HTML was never wrong. The
difference from PHP is what it composes with: an RSC returns JSX, is typed
end to end, and can render *interactive client components inside itself*.

### \`'use client'\`: the boundary

The directive \`'use client'\` at the top of a file marks the door from the
server world into the client world. That module — and everything it imports
— becomes part of the client bundle: it hydrates in the browser and may use
every hook in this course. Server Components render the static shell;
client components are **islands of interactivity** inside it (a buy button,
a search box, a like toggle). Props crossing the boundary must be
serializable — you can pass strings, numbers, objects, arrays, even
promises, but not arbitrary functions.

\`'use client'\` does *not* mean "renders only on the client" — client
components are still server-rendered to HTML for the first paint; the
directive means their code *also* ships to the browser and hydrates.

### Server actions, in one paragraph

The reverse direction exists too: \`'use server'\` marks functions the
client can call — pass one to \`<form action={saveNote}>\` and submitting
the form invokes \`saveNote\` on the server, with \`useActionState\` managing
pending/error state. It's typed RPC with progressive enhancement — the form
even works before JavaScript loads. File it under "know it exists"; a
Next.js course would drill it.

### What stays true from sections 1–28

Every interactive part of an RSC app is a client component, which means:
all of it. State, effects, refs, context, reducers, custom hooks, TanStack
Query, error boundaries — that's the material you now know, running inside
\`'use client'\` files. And in a plain Vite SPA there are no Server
Components at all. Nothing you learned is superseded; RSC adds a server
layer *around* it.
`,

  comparisons: [
    {
      label: "A PHP page vs an async Server Component",
      intro:
        "Render a product page from the database. Query, build markup, send it — the shape of the code is almost the same twenty-five years apart.",
      php: `<?php // product.php — fetch, render, send
$stmt = $pdo->prepare(
  'SELECT name, blurb, price_cents FROM products WHERE id = ?'
);
$stmt->execute([$_GET['id']]);
$product = $stmt->fetch();
?>
<article>
  <h1><?= htmlspecialchars($product['name']) ?></h1>
  <p><?= htmlspecialchars($product['blurb']) ?></p>
  <strong>
    $<?= number_format($product['price_cents'] / 100, 2) ?>
  </strong>
</article>`,
      ts: `// ProductPage.tsx — a React Server Component
// (async, server-only, ships zero JS for itself)
import { db } from './lib/db';

export default async function ProductPage({ id }: { id: string }) {
  const product = await db.products.find(id); // direct DB access

  return (
    <article>
      <h1>{product.name}</h1>
      <p>{product.blurb}</p>
      <strong>\${(product.priceCents / 100).toFixed(2)}</strong>
    </article>
  );
}`,
      note:
        "Same model — fetch, render, send — but the RSC is typed end to end, escapes output automatically, and can nest interactive client components inside its markup, which a PHP echo never could.",
    },
    {
      label: "Client-side fetching vs server rendering with a client island",
      intro:
        "The same product page in client-only React versus RSC. The left version ships code, renders a spinner, then fetches; the right sends finished HTML and hydrates only the button.",
      php: `// ProductPage.tsx — client component: fetch after mount
'use client';
import { useState, useEffect } from 'react';

function ProductPage({ id }: { id: string }) {
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    // browser loads JS -> renders spinner -> THEN asks the
    // server for data it already had when it served the page
    fetch(\`/api/products/\${id}\`)
      .then((r) => r.json())
      .then(setProduct);
  }, [id]);

  if (!product) return <Spinner />;
  return (
    <article>
      <h1>{product.name}</h1>
      <AddToCart productId={product.id} />
    </article>
  );
}`,
      ts: `// ProductPage.tsx — Server Component + one client island
import { db } from './lib/db';
import { AddToCart } from './AddToCart';

export default async function ProductPage({ id }: { id: string }) {
  const product = await db.products.find(id); // no API route needed
  return (
    <article>
      <h1>{product.name}</h1>
      <AddToCart productId={product.id} /> {/* the only JS shipped */}
    </article>
  );
}

// AddToCart.tsx — the interactive island
'use client';
import { useState } from 'react';

export function AddToCart({ productId }: { productId: string }) {
  const [added, setAdded] = useState(false);
  return (
    <button onClick={() => setAdded(true)}>
      {added ? 'In cart' : 'Add to cart'}
    </button>
  );
}`,
      note:
        "The client version pays for a JS bundle, a spinner, and a round-trip to an API you had to build; the RSC version sends finished HTML and hydrates only the button — data fetching moved back where the data lives.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "An async Server Component composing a 'use client' button. Predict: which parts become plain HTML, which part ships JavaScript, and what happens on click?",
    code: `// ProductPage.tsx — Server Component (no directive: server is the default
// in an RSC framework like Next.js App Router)
import { db } from './lib/db';
import { AddToCart } from './AddToCart';

export default async function ProductPage({ id }: { id: string }) {
  const product = await db.products.find(id); // suspends on the server

  return (
    <article>
      <h1>{product.name}</h1>
      <p>{product.blurb}</p>
      <strong>\${(product.priceCents / 100).toFixed(2)}</strong>
      <AddToCart productId={product.id} />
    </article>
  );
}

// AddToCart.tsx — Client Component: it needs state and a click handler
'use client';
import { useState } from 'react';

export function AddToCart({ productId }: { productId: string }) {
  const [added, setAdded] = useState(false);
  return (
    <button onClick={() => setAdded(true)}>
      {added ? 'In cart' : 'Add to cart'}
    </button>
  );
}`,
    output: `What the browser receives for /products/42 (say, "Trail Kettle", $49.00):

  <article>
    <h1>Trail Kettle</h1>
    <p>1.2 L titanium kettle for camp stoves.</p>
    <strong>$49.00</strong>
    <button>Add to cart</button>   <- already rendered to HTML too
  </article>

- ProductPage ran ONLY on the server: it awaited the DB, produced markup,
  and ships ZERO JavaScript. Its code never reaches the browser.
- AddToCart's code DOES ship (it's behind 'use client'); React hydrates
  just that button, attaching the onClick and its useState.
- Clicking the button: setAdded(true) re-renders the island in the browser
  -> label becomes "In cart". No server involved in the click.
- If ProductPage tried useState or onClick itself, the framework would
  error: Server Components can't use interactive APIs.`,
  },

  keyPoints: [
    "Server Components are a framework feature (Next.js App Router et al.) layered on top of React — a Vite SPA has none, and everything from sections 1–28 is client-component React that still applies everywhere.",
    "An RSC runs only on the server: it can be `async` and `await` the database directly, and it ships zero JavaScript for itself — the client gets its rendered output.",
    "Server Components cannot use state, effects, or event handlers — there is no live instance in the browser to hold state or receive clicks.",
    "`'use client'` marks the boundary file where the client bundle begins; those components hydrate in the browser and may use every hook. It means 'also runs on the client', not 'client only' — they still server-render to HTML for first paint.",
    "Props crossing the server-to-client boundary must be serializable (plain data, even promises — not arbitrary functions).",
    "For a PHP developer this is the payoff: fetch data, render markup, send the result — the industry partially circled back to your model, now typed and composable with client interactivity islands.",
  ],

  interview: [
    {
      q: "What is a React Server Component, and what can't it do?",
      a: "A Server Component runs exclusively on the server — at request or build time — in an RSC framework like Next.js App Router. Because it runs where the data lives, it can be an async function that awaits the database or filesystem directly, with no API route in between, and it ships zero JavaScript for itself: the browser receives its rendered output, not its code. The trade is that it can't do anything interactive — no useState, no useEffect, no event handlers — because there's no live instance in the browser. For interactivity you compose in client components: a file marked 'use client' becomes part of the client bundle and can use every hook. Coming from PHP, the mental model is familiar — fetch, render, send — except the result composes with stateful client islands in one typed tree.",
    },
    {
      q: "What does the 'use client' directive actually do?",
      a: "It marks the boundary where the client bundle starts. Put 'use client' at the top of a file and that module — plus everything it imports — is compiled into JavaScript that ships to the browser and hydrates, so those components can use state, effects, and event handlers. Two common misconceptions to correct: first, it doesn't mean 'renders only in the browser' — client components are still server-rendered to HTML for the first paint, then hydrated; second, you don't mark every interactive component — you mark entry points, and their imports come along implicitly. Props passed from a server component into that boundary must be serializable, so plain data and even promises are fine but arbitrary callbacks are not.",
    },
    {
      q: "Does React Server Components make the client-side React you know obsolete?",
      a: "No — it reframes where it runs. Every interactive part of an RSC app is a client component, which is exactly the React from the rest of this course: useState, effects, refs, context, custom hooks, error boundaries, TanStack Query if you need client-side server state. Server Components take over the non-interactive work — data fetching and static markup — so you ship less JavaScript, and 'use client' islands handle the rest. And plenty of real apps are still client-only Vite SPAs with no server components at all, especially dashboards behind a login where SEO and first-paint don't dominate. In an interview I'd frame RSC as an additional layer with a per-project trade-off, not a replacement.",
    },
  ],

  quiz: [
    {
      question: "Why can a Server Component be written as `async function` and await a database call directly?",
      options: [
        "React 19 made all components async by default",
        "It runs only on the server, so it can suspend on server-side resources and ships only its rendered output",
        "The browser now supports SQL connections",
        "Because it is wrapped in useEffect automatically",
      ],
      answerIndex: 1,
      explain:
        "The component executes where the data lives and never runs in the browser, so awaiting the DB is just server code — no API route, no client fetch, no loading state for its own data. Client components can't do this; they'd fetch or receive a promise to read with use().",
    },
    {
      question: "A component needs `useState` and an `onClick`. In an RSC framework, what must be true?",
      options: [
        "It must be defined in the same file as the page",
        "It (or a file that imports it into the tree) must be marked with 'use client'",
        "It must be marked with 'use server'",
        "Nothing — hooks work in Server Components too",
      ],
      answerIndex: 1,
      explain:
        "State and event handlers require a live component in the browser, so the component must be inside the client bundle — which begins at a 'use client' boundary file. 'use server' is the opposite direction: it exposes server functions (actions) for the client to call.",
    },
    {
      question: "What does 'use client' NOT mean?",
      options: [
        "The file's components can use hooks like useState",
        "The file and its imports are included in the client JavaScript bundle",
        "The component skips server rendering entirely and renders only in the browser",
        "Event handlers in the file will work after hydration",
      ],
      answerIndex: 2,
      explain:
        "Client components still server-render to HTML for the first paint — 'use client' means the code also ships to the browser and hydrates there, adding interactivity. It's a bundling boundary, not an instruction to skip SSR.",
    },
  ],
};

export default lesson;
