import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "composition-patterns",
  title: "Composing Server & Client Components",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "The three boundary rules — serializable props only, no importing server into client, pass Server Components through as children — plus server-only as the build-time tripwire.",

  concept: `
A Next.js app is one codebase but **two runtime worlds**: the server module
graph (Server Components, database access, secrets) and the client bundle
(Client Components, hooks, event handlers). Everything that travels from the
first world to the second crosses one wire — the RSC payload. Three rules
govern that wire, and they generate most App Router interview questions.

### Rule 1: props that cross the boundary must be serializable

When a Server Component renders \`<LikeButton likes={post.likes} />\` and
\`LikeButton\` is a Client Component, those props are encoded on the server
and decoded in the browser. React's wire format is richer than \`JSON\` — it
handles \`Date\`, \`Map\`, \`Set\`, \`BigInt\`, Promises, and JSX — but two
things never cross:

- **Functions.** A closure can't be turned into text and rebuilt in another
  process. (The one exception: Server Actions — functions marked
  \`'use server'\` — cross as *references* the client can call back.)
- **Class instances.** An ORM entity or a \`Money\` value object arrives as a
  husk: the data may survive, the prototype and methods do not.

You've lived with this boundary for years. Every time you rendered
\`data-product="<?= htmlspecialchars(json_encode($product)) ?>"\` for some
frontend JS to pick up, you were deciding what you were willing to
serialize for the browser. \`json_encode\` throws on closures and mangles
objects — same wall. Next.js just types it and moves the error to build/dev
time instead of a blank attribute in production.

### Rule 2: a Client Component cannot import a Server Component

\`'use client'\` marks a **boundary**, not just one file: everything a client
module imports gets pulled into the client bundle too. So importing a Server
Component from a Client Component doesn't "keep it on the server" — it
drags it into the browser, where its async data access and server-only APIs
can't run. Next.js errors instead of letting that happen.

### Rule 3: …but it CAN receive one as \`children\`

The escape hatch is composition. A Client Component may accept
\`children: React.ReactNode\` (or any JSX-typed prop) and render it without
ever importing it:

\`\`\`tsx
// app/page.tsx — a Server Component wires the two together
<Modal>          {/* client: owns open/close state */}
  <Cart />       {/* server: reads the DB, renders on the server */}
</Modal>
\`\`\`

\`<Cart />\` renders **on the server**; its finished output travels through
\`Modal\` as an opaque slot. The client shell never inspects it — it just
places it. This "slot pattern" is the answer to "how do I put server data
inside an interactive widget?": interactive shell as the Client Component,
data-laden Server Component passed through as children.

### The tripwire: \`server-only\`

Rule 2 is enforced by the bundler, but your own helper modules aren't
components — nothing stops a teammate importing \`lib/data.ts\` (with its DB
credentials) into a \`'use client'\` file. The \`server-only\` package makes
that a build error: add \`import 'server-only'\` at the top of any module
that must never reach the browser. It's the PHP instinct of keeping
includes outside the webroot, enforced by the compiler instead of by hope.
`,

  comparisons: [
    {
      label: "What you can hand to the frontend",
      intro:
        "Both sides render on the server and hand structured data to browser-side code. Both hit the same wall: data crosses, behavior doesn't.",
      php: `<?php // product.php — server renders, JS reads data-*
$product = [
  'name'  => 'Espresso beans',
  'price' => 14.5,
  // json_encode(new DateTime(...)) => "{}" unless you
  // convert it yourself — silently wrong in production.
  'added' => (new DateTime('2026-07-07'))->format(DATE_ATOM),
];

// $product['onSale'] = fn () => true;
// ^ json_encode: "Cannot encode Closure" — runtime failure.

echo '<button id="buy" data-product="'
  . htmlspecialchars(json_encode($product))
  . '">Buy</button>';`,
      ts: `// app/products/[id]/page.tsx — a Server Component
import { BuyButton } from './buy-button'; // 'use client' file
import { getProduct } from '@/lib/data';

export default async function Page(
  props: PageProps<'/products/[id]'>
) {
  const { id } = await props.params;
  const product = await getProduct(id);

  return (
    <BuyButton
      name={product.name}       // string      — crosses
      price={product.price}     // number      — crosses
      addedAt={product.addedAt} // Date        — crosses (RSC wire > JSON)
      // onBuy={() => track(id)}
      // ^ function prop: error — behavior can't be serialized
    />
  );
}`,
      note: "React's wire format is richer than JSON (Date, Map, Set survive intact), but functions and class instances never cross — the json_encode instinct you already have, with compile-time errors instead of silent {}.",
    },
    {
      label: "The slot pattern: interactive shell, server-rendered filling",
      intro:
        "A cart panel needs client-side open/close state, but its contents come from the database. The wrapper stays dumb about what it wraps.",
      php: `<?php // modal.php — shell wraps content it never inspects
function render_modal(string $content): string
{
  return '<div class="modal" data-toggle>'
    . $content
    . '</div>';
}

ob_start();
require 'cart.php';        // heavy server-side rendering
$cartHtml = ob_get_clean();

echo render_modal($cartHtml);`,
      ts: `// app/ui/modal.tsx — the interactive shell
'use client';
import { useState } from 'react';

export function Modal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)}>Cart</button>
      {open && <div className="modal">{children}</div>}
    </div>
  );
}

// app/page.tsx — a Server Component composes them:
//   <Modal><Cart /></Modal>
// Cart never gets imported by Modal, so it STAYS a Server
// Component — it renders on the server and passes through
// Modal's children slot as finished output.`,
      note: "Same idea as ob_start() + include: the shell receives rendered content as an opaque value. The composition happens in a Server Component; Modal only ever sees ReactNode.",
    },
    {
      label: "Keeping server code out of the browser",
      intro:
        "A data-access module holds credentials and must never be reachable from browser code. PHP guards at runtime; Next.js can fail the build.",
      php: `<?php // lib/db.php — runtime guard against direct access
defined('APP_ENTRY') or die('No direct access');

$pdo = new PDO(
  $_ENV['DSN'],
  $_ENV['DB_USER'],
  $_ENV['DB_PASS']
);

function getUserByEmail(PDO $pdo, string $email): ?array
{
  $stmt = $pdo->prepare(
    'SELECT * FROM users WHERE email = ?'
  );
  $stmt->execute([$email]);
  return $stmt->fetch() ?: null;
}`,
      ts: `// lib/data.ts — build-time guard against client import
import 'server-only';

import { db } from './db';

export async function getUserByEmail(email: string) {
  return db.user.findUnique({ where: { email } });
}

// If ANY 'use client' module imports this file — even
// transitively — the build fails with a clear error.
// The connection string can never ship to a browser.`,
      note: "The PHP guard fires at runtime, per request, if you remembered it. import 'server-only' fires once, at build time, for the whole module graph.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "React's server→client prop check, in miniature. Seven props try to cross the boundary — predict which PASS and which FAIL before running, and note WHY the Date makes it but the class instance doesn't.",
    code: `// A miniature of the RSC serialization check: a prop crosses the
// server→client boundary only if the wire format can encode it.

type Verdict = { pass: boolean; why: string };

function canCross(value: unknown): Verdict {
  if (value === null) return { pass: true, why: 'null — primitive' };
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'undefined')
    return { pass: true, why: t + ' — primitive' };
  if (t === 'function')
    return { pass: false, why: 'function — behavior cannot be serialized' };
  if (value instanceof Date)
    return { pass: true, why: 'Date — RSC wire format encodes it (JSON would not)' };
  if (value instanceof Map || value instanceof Set)
    return { pass: true, why: 'Map/Set — RSC wire format encodes them' };
  if (Array.isArray(value)) {
    const bad = value.map(canCross).find((v) => !v.pass);
    return bad ?? { pass: true, why: 'array of serializable values' };
  }
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const bad = Object.values(value as object).map(canCross).find((v) => !v.pass);
    return bad ?? { pass: true, why: 'plain object of serializable values' };
  }
  const name = (value as object).constructor.name;
  return { pass: false, why: 'class instance (' + name + ') — prototype/methods are lost' };
}

class ShoppingCart {
  items = ['espresso'];
  total() { return 14.5; }
}

const props: [string, unknown][] = [
  ['title', 'Server Components'],
  ['likes', 42],
  ['tags', ['react', 'nextjs']],
  ['author', { name: 'Ada', joined: new Date('2020-01-01') }],
  ['publishedAt', new Date('2026-07-07')],
  ['onBuy', () => 'clicked'],
  ['cart', new ShoppingCart()],
];

for (const [name, value] of props) {
  const v = canCross(value);
  console.log((v.pass ? 'PASS' : 'FAIL') + '  ' + name.padEnd(12) + v.why);
}

// Try it: wrap the function as { __serverAction: true } and extend
// canCross to let tagged "Server Action references" through.`,
  },

  keyPoints: [
    "Props crossing from a Server to a Client Component must be serializable: plain objects, arrays, primitives, `Date`/`Map`/`Set` are fine; functions and class instances are not.",
    "The one function that CAN cross is a Server Action (`'use server'`) — it travels as a reference the client invokes, not as code.",
    "`'use client'` marks a boundary: everything a client module imports joins the client bundle, so a Client Component can never import a Server Component.",
    "The slot pattern gets around that: a client shell accepts `children: React.ReactNode`, and a Server Component composes `<ClientShell><ServerContent /></ClientShell>`.",
    "`import 'server-only'` at the top of a module makes any client-side import of it a build error — use it on every data-access/secrets file.",
    "PHP anchor: the boundary is `json_encode` into a `data-*` attribute — you always chose what to serialize for the browser; Next.js types that choice.",
  ],

  interview: [
    {
      q: "What are the rules for passing props from a Server Component to a Client Component?",
      a: "Props cross the boundary in the RSC payload, so they must be serializable by React's wire format. That format is richer than JSON — `Date`, `Map`, `Set`, `BigInt`, Promises, and JSX all survive — but functions and class instances don't: a closure can't be rebuilt in the browser, and an ORM entity loses its prototype and methods. The exception is a Server Action, which crosses as a callable reference rather than code. Coming from PHP, it's the same discipline as deciding what you're willing to `json_encode` into a `data-*` attribute — except Next.js surfaces violations at dev/build time instead of failing silently in production.",
    },
    {
      q: "A Client Component can't import a Server Component — so how do you render server-fetched content inside an interactive client widget?",
      a: "Composition instead of importation. `'use client'` defines a bundle boundary: anything a client module imports is compiled into the client bundle, so importing a Server Component would drag its server-side code into the browser. Instead, the Client Component accepts `children: React.ReactNode`, and a Server Component higher up composes them: `<Modal><Cart /></Modal>`. `Cart` renders on the server and its finished output flows through `Modal`'s slot; `Modal` handles the interactivity without ever knowing what it wraps. That 'client shell, server filling' pattern is the standard answer for modals, tabs, accordions, and carousels holding server data.",
    },
    {
      q: "How do you guarantee that database or secret-handling code never ends up in the browser bundle?",
      a: "Two layers. Structurally, keep data access in dedicated modules (like `lib/data.ts`) that only Server Components import. Mechanically, put `import 'server-only'` at the top of each of those modules — if any `'use client'` file imports one, even transitively, the build fails immediately with a clear error. It's the compile-time version of the old PHP habit of keeping sensitive includes outside the webroot or guarding them with `defined('APP_ENTRY') or die`: the difference is the guarantee holds for the entire module graph and fires before deploy, not at runtime.",
    },
  ],

  quiz: [
    {
      question:
        "A Server Component passes props to a Client Component. Which prop causes an error?",
      options: [
        "publishedAt: new Date('2026-07-07')",
        "tags: ['react', 'nextjs']",
        "formatPrice: (n: number) => `$${n.toFixed(2)}`",
        "meta: { views: 120, pinned: true }",
      ],
      answerIndex: 2,
      explain:
        "Plain functions can't be serialized into the RSC payload — only Server Action references cross the boundary. Dates, arrays, and plain objects are all fine; React's wire format handles more than plain JSON.",
    },
    {
      question:
        "You need a client-side modal (open/close state) that displays a server-rendered <Cart /> reading from the database. What's the correct structure?",
      options: [
        "Import Cart inside the 'use client' Modal file and render it there",
        "Add 'use server' to the Modal so it can import Cart",
        "Have a Server Component render <Modal><Cart /></Modal>, with Modal accepting children",
        "Convert Cart to a Client Component and fetch the cart data in useEffect",
      ],
      answerIndex: 2,
      explain:
        "A client module importing Cart would pull it into the client bundle, where its server-side data access can't run. Passing it through as children keeps Cart on the server: its rendered output flows through the client shell's slot. Option D works but throws away the Server Component benefits for no reason.",
    },
    {
      question: "What does `import 'server-only'` in lib/data.ts actually do?",
      options: [
        "Encrypts the module's exports before they reach the client",
        "Makes the build fail if any client-side module imports lib/data.ts, even transitively",
        "Restricts the file to running in proxy.ts and route handlers only",
        "Strips the module from the server bundle after the first request",
      ],
      answerIndex: 1,
      explain:
        "server-only is a marker package: in the server (react-server) environment it resolves to a no-op, but in a client bundle it throws — so the build breaks the moment the module leaks across the boundary. It's a compile-time tripwire, not encryption or a runtime restriction.",
    },
  ],
};

export default lesson;
