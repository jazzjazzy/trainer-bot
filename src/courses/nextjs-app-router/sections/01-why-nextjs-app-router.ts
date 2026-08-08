import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-nextjs-app-router",
  title: "Why Next.js and the App Router",
  part: "Foundations",
  estMinutes: 10,
  summary:
    "Next.js 16 is the React framework the job listings ask for — and its App Router brings back the request → render-on-server → HTML model PHP developers never left.",

  concept: `
Open ten React job listings and count how many say **Next.js**. It is the
framework React's own documentation points you to, the one Vercel builds,
and the one most "full-stack React" roles actually mean. Learning React
without Next.js today is like learning PHP in 2010 without ever touching
a framework: possible, but not what interviews ask about.

### The model you never left

Here's the part nobody tells PHP developers: the JavaScript world spent a
decade moving rendering *into the browser* (SPAs, \`useEffect\`, loading
spinners, JSON APIs for everything) — and has now moved it **back to the
server**. The App Router's default unit, the **React Server Component**,
works the way a PHP page always has:

1. A request comes in for a URL.
2. Code on the server runs — it can query the database directly.
3. It produces HTML.
4. The HTML is sent, and the per-request work is thrown away.

That is \`index.php\` with types. The difference is *how the HTML is
composed*: instead of \`echo\` and \`include\`, you compose typed React
components — and when a piece of the page genuinely needs interactivity,
you opt that piece into client-side React instead of bolting jQuery onto
server-rendered markup.

\`\`\`tsx
// app/page.tsx — this runs ON THE SERVER, per request or at build
export default async function HomePage() {
  const posts = await db.posts.latest(); // yes, a direct DB call
  return <h1>{posts.length} posts</h1>;  // becomes HTML on the server
}
\`\`\`

### One deployable app

A classic LAMP app was one thing: Apache + PHP served your pages, your
form handlers, and your API endpoints from one codebase. Next.js restores
that shape for React. In a single app you get:

- **Pages** — Server Components rendered per request or at build.
- **API endpoints** — route handlers (\`route.ts\`), your controllers.
- **Form mutations** — Server Actions, typed POST handlers.
- **Request interception** — \`proxy.ts\`, the framework's middleware layer.
- **File-convention routing** — the folder tree under \`app/\` *is* the
  route table, like the old \`/about.php\` → \`/about.php\` days, but with a
  front controller you never have to write.

### The one Pages Router mention this course allows itself

Next.js has an older routing system, the **Pages Router**: a \`pages/\`
directory where data loading lived in exported functions like
\`getServerSideProps\` next to the component. It still works and both
routers can coexist during a migration, but it is the **legacy** system.
The current model is the **App Router**: an \`app/\` directory where
components are Server Components by default and data is fetched *inside*
the component with \`await\`. Interviewers may reference either — if you
hear \`getServerSideProps\`, you're hearing Pages Router vocabulary.
Everything from here on is App Router only.

### The verified baseline (say these numbers in interviews)

- **Next.js 16** is the current stable major; it requires **React 19**.
- **Turbopack** (the Rust bundler) is stable and the **default** for both
  \`next dev\` and \`next build\` — no \`--turbopack\` flag anymore.
- Since Next 15, \`fetch\` is **not cached by default** — caching is opt-in
  (a whole later part of this course).
- \`middleware.ts\` was renamed \`proxy.ts\` in 16.

These all changed across recent majors, so plenty of working developers
carry stale Next 13/14 facts. Knowing precisely *what changed and when*
is one of the cheapest ways to look senior in a Next.js interview.
`,

  comparisons: [
    {
      label: "A page that queries and renders",
      intro:
        "The same page in both worlds: fetch the latest posts, render a heading and a list. Both run on the server per request; both send finished HTML.",
      php: `<?php // public/index.php
$pdo = new PDO($dsn, $user, $pass);
$posts = $pdo->query(
  'SELECT slug, title FROM posts ORDER BY id DESC LIMIT 5'
)->fetchAll(PDO::FETCH_ASSOC);
?>
<h1>Latest posts</h1>
<ul>
<?php foreach ($posts as $post): ?>
  <li>
    <a href="/post.php?slug=<?= htmlspecialchars($post['slug']) ?>">
      <?= htmlspecialchars($post['title']) ?>
    </a>
  </li>
<?php endforeach; ?>
</ul>`,
      ts: `// app/page.tsx — a React Server Component (the default)
import { db } from "@/lib/db";

export default async function HomePage() {
  const posts = await db.query<{ slug: string; title: string }>(
    "SELECT slug, title FROM posts ORDER BY id DESC LIMIT 5"
  );

  return (
    <>
      <h1>Latest posts</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <a href={\`/blog/\${post.slug}\`}>{post.title}</a>
          </li>
        ))}
      </ul>
    </>
  );
}`,
      note: "Same request model — server code queries the DB and emits HTML — but the component is typed end to end, JSX escapes output automatically (no htmlspecialchars ritual), and none of this code is shipped to the browser.",
    },
    {
      label: "Routing: front controller vs file conventions",
      intro:
        "How a URL finds its code. In a framework-less PHP app you write the dispatch yourself; in Next.js the app/ folder tree IS the route table.",
      php: `<?php // public/index.php — hand-rolled front controller
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/') {
    require __DIR__ . '/../pages/home.php';
} elseif ($path === '/about') {
    require __DIR__ . '/../pages/about.php';
} elseif (preg_match('#^/blog/([\\w-]+)$#', $path, $m)) {
    $slug = $m[1];
    require __DIR__ . '/../pages/post.php';
} else {
    http_response_code(404);
    require __DIR__ . '/../pages/404.php';
}`,
      ts: `# The app/ directory — no dispatch code exists anywhere
app/
├── page.tsx              # GET /
├── about/
│   └── page.tsx          # GET /about
├── blog/
│   └── [slug]/
│       └── page.tsx      # GET /blog/:slug  (params.slug typed)
└── not-found.tsx         # the 404 branch`,
      note: "Folders define URL segments, [slug] declares a typed parameter, and the 404 case is a file — the router, the regex, and the require-dispatch all disappear into convention.",
      rightLang: "bash",
    },
    {
      label: "The one permitted Pages Router contrast",
      intro:
        "Legacy vs current Next.js. Same job — server-render a post — but the Pages Router splits data loading from the component, while the App Router fetches inside it.",
      php: `// pages/blog/[slug].tsx — Pages Router (LEGACY)
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const post = await getPost(ctx.params!.slug as string);
  return { props: { post } };
};

export default function PostPage({ post }: { post: Post }) {
  return <h1>{post.title}</h1>;
}`,
      ts: `// app/blog/[slug]/page.tsx — App Router (CURRENT)
export default async function PostPage(props: PageProps<"/blog/[slug]">) {
  const { slug } = await props.params; // params is a Promise in 16
  const post = await getPost(slug);
  return <h1>{post.title}</h1>;
}`,
      note: "If an interviewer says getServerSideProps, they're speaking Pages Router — the App Router equivalent is simply an async Server Component, with params awaited and typed by Next 16's PageProps helper.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "'React on the server', demystified in 30 lines: components are just functions that produce markup, and handling a request means calling them and sending the string. Predict the logged HTML, then run it.",
    code: `// A toy version of what Next.js does per request. No magic:
// request in → component functions run on the server → HTML out.

type Post = { slug: string; title: string };

// Stand-in for a real database query (in a Server Component: await db...)
async function getPosts(): Promise<Post[]> {
  return [
    { slug: "why-nextjs", title: "Why Next.js" },
    { slug: "rsc-vs-php", title: "Server Components vs PHP" },
  ];
}

// "Components": functions that return markup. Real RSCs return a
// component tree that React serializes — same idea, richer format.
function Layout(children: string): string {
  return \`<html><body><nav>My Blog</nav>\${children}</body></html>\`;
}

async function HomePage(): Promise<string> {
  const posts = await getPosts(); // data fetched INSIDE the component
  const items = posts
    .map((p) => \`<li><a href="/blog/\${p.slug}">\${p.title}</a></li>\`)
    .join("");
  return \`<main><h1>Latest posts</h1><ul>\${items}</ul></main>\`;
}

// The "framework": route the request, render the tree, send the HTML.
async function handleRequest(url: string): Promise<string> {
  console.log(\`GET \${url}\`);
  const page = await HomePage();
  return Layout(page);
}

const html = await handleRequest("/");
console.log(html);
console.log("(response sent — per-request work discarded, PHP-style)");`,
  },

  keyPoints: [
    "Next.js is the full-stack React framework job listings mean: pages, API endpoints, mutations, and middleware in one deployable app.",
    "React Server Components restore the PHP request model — server code queries data, renders HTML, and dies with the response — but composed from typed components instead of `echo` and `include`.",
    "The `app/` folder tree is the route table: folders are URL segments, so there is no front controller or route file to write.",
    "The Pages Router (`pages/` + `getServerSideProps`) is the legacy system; the App Router (`app/` + Server Components) is current. Interviews may reference both.",
    "Verified baseline: Next.js 16 (requires React 19), Turbopack default for both `next dev` and `next build`, and — since Next 15 — `fetch` is NOT cached by default.",
  ],

  interview: [
    {
      q: "Why would a team pick Next.js over plain React with Vite?",
      a: "Plain React is a view library — it renders components in the browser and nothing more. Next.js adds the rest of the application: file-based routing, server rendering with React Server Components, API endpoints via route handlers, form mutations via Server Actions, and a production build pipeline (Turbopack by default in 16). That matters for SEO and first-paint performance, because the server sends finished HTML instead of an empty div plus a JS bundle. Coming from PHP, I'd put it this way: plain React is like writing PHP with no framework and no server — Next.js is the full LAMP-shaped stack for React, in one deployable app.",
    },
    {
      q: "What's the difference between the Pages Router and the App Router?",
      a: "The Pages Router is the legacy system: routes live in `pages/`, every component is a client component, and server-side data loading happens in exported functions like `getServerSideProps` that pass props into the page. The App Router, current since Next 13 and the only model worth learning deeply now, uses an `app/` directory where components are React Server Components by default — data fetching moves inside the component as a plain `await`, layouts nest via the file system, and mutations use Server Actions. The two can coexist in one app during migration, but new work belongs in `app/`. If an interviewer asks about `getServerSideProps`, I'd identify it as Pages Router vocabulary and give the App Router equivalent: an async Server Component.",
    },
    {
      q: "How do React Server Components relate to how PHP renders pages?",
      a: "Very directly — that's why the App Router feels natural to server-side developers. A Server Component runs only on the server, per request or at build time: it can query the database directly, it renders markup, and its working state is discarded once the response is sent, exactly like a PHP script's request lifecycle. Nothing in it ships to the browser as JavaScript. The differences are the composition model — typed, reusable React components instead of includes and echo — and that interactivity is an opt-in per component boundary rather than a separate jQuery layer. The one nuance I'd add: unlike PHP, the Node process itself is long-lived, so the 'dies after the response' rule applies to the render, not to module-level state.",
    },
  ],

  quiz: [
    {
      question:
        "In Next.js 16, what is the default bundler for `next dev` and `next build`?",
      options: [
        "Webpack, with Turbopack available behind the --turbopack flag",
        "Turbopack, by default for both, with no flag needed",
        "Vite for dev and Webpack for production builds",
        "esbuild for both dev and build",
      ],
      answerIndex: 1,
      explain:
        "In Next.js 16 Turbopack is stable and the default for both commands — the --turbopack flag that Next 15 used is no longer needed, and turbopack config now lives at the top level of next.config.ts.",
    },
    {
      question:
        "Which statement about the Pages Router vs the App Router is accurate?",
      options: [
        "The App Router is experimental; production apps should use pages/",
        "The Pages Router uses app/ and the App Router uses pages/",
        "The Pages Router (pages/ + getServerSideProps) is legacy; the App Router (app/ + Server Components) is the current model",
        "They cannot exist in the same project, so migration requires a rewrite",
      ],
      answerIndex: 2,
      explain:
        "app/ with Server Components is the current model; pages/ with getServerSideProps is legacy but still supported, and both routers can coexist in one app during an incremental migration.",
    },
    {
      question:
        "What makes a React Server Component feel familiar to a PHP developer?",
      options: [
        "It stores session state between requests like $_SESSION",
        "It runs in the browser and manipulates the DOM directly",
        "It runs only on the server, can query the database directly, renders HTML, and its per-request work is discarded with the response",
        "It requires an XML template layer like early PHP frameworks",
      ],
      answerIndex: 2,
      explain:
        "That request → server render → HTML → discard lifecycle is exactly the PHP page model. The component ships zero JavaScript to the browser; only its rendered output travels.",
    },
  ],
};

export default lesson;
