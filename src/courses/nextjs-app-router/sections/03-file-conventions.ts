import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "file-conventions",
  title: "The app/ Directory & File Conventions",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "In app/, folders define URL segments and a handful of special filenames define behavior — page.tsx is the UI, layout.tsx the persistent shell, and only page.tsx or route.ts makes a URL exist.",

  concept: `
The entire App Router runtime is driven by two conventions:

1. **Folders define URL segments.** \`app/blog/archive/\` is \`/blog/archive\`.
2. **Special filenames define behavior** at that segment.

That's it. There is no route registry, no annotations, no
\`routes/web.php\`. If you remember the \`/about.php\` → \`example.com/about.php\`
days, this is that idea grown up: the file system is the router, but each
file is a typed component instead of a script in the docroot.

### The special files

| File | Role |
| --- | --- |
| \`page.tsx\` | The UI for this URL — makes the segment **publicly reachable** |
| \`layout.tsx\` | Persistent shell wrapping this segment and everything below |
| \`loading.tsx\` | Instant fallback shown while the segment's data loads |
| \`error.tsx\` | Error boundary for this segment |
| \`not-found.tsx\` | Rendered for 404s in this subtree |
| \`route.ts\` | An API endpoint (GET/POST/...) instead of a page |

Two rules carry most of the weight:

**Only \`page.tsx\` and \`route.ts\` create a public URL.** A folder with
just a \`layout.tsx\` — or full of components, tests, and SQL helpers — is
not reachable. You can colocate freely: \`app/blog/components/PostCard.tsx\`
sits next to the code that uses it and no URL ever exposes it. Contrast
that with a classic PHP docroot, where every \`.php\` file you drop in is
one guessed URL away from executing.

**A segment can't have both** \`page.tsx\` and \`route.ts\` — a URL is a page
or an endpoint, never both.

### Layouts: header.php/footer.php, solved properly

Every PHP app converged on the same shell pattern:

\`\`\`php
<?php require 'header.php'; ?>
  ...page content...
<?php require 'footer.php'; ?>
\`\`\`

A \`layout.tsx\` is that pattern as a single component — it receives the
page as \`children\` and wraps it, so the shell can't be half-included or
mismatched:

\`\`\`tsx
// app/layout.tsx — the ROOT layout: required, owns <html> and <body>
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav>My Site</nav>
        {children}
      </body>
    </html>
  );
}
\`\`\`

Layouts **nest**: a request for \`/blog/hello\` renders
\`app/layout.tsx\` → \`app/blog/layout.tsx\` (if present) → the page. And
they **persist across navigation** — moving between two blog posts
re-renders the page, not the shells around it, so layout state (an open
sidebar, a playing video) survives. \`require 'header.php'\` never did that.

### 404s: a file, not an if-branch

Throw a URL at the router that matches nothing and the nearest
\`not-found.tsx\` renders with a real 404 status. For the "row doesn't
exist" case, call \`notFound()\` from \`next/navigation\` inside a page —
it aborts rendering and hands off to the same file. No
\`http_response_code(404); include '404.php'; exit;\` choreography.

### Reading a real tree

\`\`\`
app/
├── layout.tsx            # root shell (html/body) — required
├── page.tsx              # /
├── blog/
│   ├── layout.tsx        # extra shell for everything under /blog
│   ├── page.tsx          # /blog
│   ├── components/       # colocated — creates NO routes
│   │   └── PostCard.tsx
│   └── [slug]/
│       └── page.tsx      # /blog/:slug
├── api/
│   └── health/
│       └── route.ts      # GET /api/health — endpoint, not a page
└── dashboard/
    └── layout.tsx        # no page.tsx → /dashboard is NOT reachable
\`\`\`

Train yourself to read trees like this fluently — "walk me through this
app/ directory" is a genuine interview exercise.
`,

  comparisons: [
    {
      label: "The page shell: includes vs layout",
      intro:
        "A site-wide shell (nav + footer) around per-page content. PHP splices it in with includes at both ends; Next.js wraps the page in a layout component.",
      php: `<?php // about.php
require __DIR__ . '/partials/header.php';
// header.php opened <html>, <body>, and printed the <nav>.
// Forget the footer require below and you ship broken HTML.
?>
<main>
  <h1>About us</h1>
  <p>25 years of PHP and counting.</p>
</main>
<?php require __DIR__ . '/partials/footer.php'; ?>`,
      ts: `// app/layout.tsx — one component owns the whole shell
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav>My Site</nav>
        <main>{children}</main>
        <footer>© 2026</footer>
      </body>
    </html>
  );
}

// app/about/page.tsx — the page is ONLY its own content
export default function AboutPage() {
  return (
    <>
      <h1>About us</h1>
      <p>25 years of PHP and counting.</p>
    </>
  );
}`,
      note: "The layout is one component with children in the middle, so the shell can never be half-included — and unlike includes, it persists across client-side navigation instead of re-rendering on every page.",
    },
    {
      label: "The 404 branch",
      intro:
        "A post lookup that misses. PHP hand-codes the status, the include, and the exit; Next.js has a notFound() function and a not-found.tsx file.",
      php: `<?php // post.php
$post = $repo->findBySlug($_GET['slug'] ?? '');

if ($post === null) {
    http_response_code(404);
    require __DIR__ . '/404.php';
    exit; // forget this and the page renders anyway
}
?>
<h1><?= htmlspecialchars($post['title']) ?></h1>`,
      ts: `// app/blog/[slug]/page.tsx
import { notFound } from "next/navigation";
import { getPost } from "@/lib/posts";

export default async function PostPage(props: PageProps<"/blog/[slug]">) {
  const { slug } = await props.params;
  const post = await getPost(slug);
  if (!post) notFound(); // aborts rendering, 404 status

  return <h1>{post.title}</h1>;
}

// app/blog/not-found.tsx — what the visitor sees
export default function NotFound() {
  return <h1>No such post.</h1>;
}`,
      note: "notFound() throws internally, so rendering genuinely stops — no exit to forget — and the nearest not-found.tsx up the tree supplies the UI with a proper 404 status code.",
    },
    {
      label: "What's reachable: docroot vs conventions",
      intro:
        "Both trees contain helper code next to page code. In a PHP docroot every file is a URL; in app/ only the conventional files are.",
      php: `# Classic PHP docroot — EVERYTHING here is a URL
public_html/
├── index.php          # /index.php
├── blog.php           # /blog.php
├── db-helpers.php     # /db-helpers.php  ← also reachable!
├── PostCard.php       # /PostCard.php    ← also reachable!
└── old-backup.php     # /old-backup.php  ← the classic incident`,
      ts: `# app/ — only page.tsx and route.ts create URLs
app/
├── page.tsx               # /
├── blog/
│   ├── page.tsx           # /blog
│   ├── PostCard.tsx       # no URL — safe colocation
│   └── queries.ts         # no URL — safe colocation
└── api/health/route.ts    # /api/health (endpoint)`,
      note: "Colocation is safe by design: helpers, components, and tests can live inside app/ next to the routes that use them, because only the special filenames are ever exposed.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of the App Router's resolver: given a list of files under app/, work out which URLs exist and which layout chain wraps each. Predict the output — especially which folders produce NO route — then run it.",
    code: `// The file tree IS the route table. This resolver applies the two
// rules: folders = URL segments; only page.tsx / route.ts are reachable.

const files = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/about/page.tsx",
  "app/blog/layout.tsx",
  "app/blog/page.tsx",
  "app/blog/[slug]/page.tsx",
  "app/blog/components/PostCard.tsx", // colocated component
  "app/api/health/route.ts",
  "app/dashboard/layout.tsx", // layout but no page!
];

const layoutDirs = new Set(
  files
    .filter((f) => f.endsWith("/layout.tsx"))
    .map((f) => f.slice(0, -"/layout.tsx".length)),
);

function toUrl(dir: string): string {
  const path = dir.slice("app".length); // strip the app prefix
  return path === "" ? "/" : path;
}

function layoutChain(dir: string): string[] {
  const chain: string[] = [];
  const segments = dir.split("/"); // e.g. ["app", "blog", "[slug]"]
  for (let i = 1; i <= segments.length; i++) {
    const ancestor = segments.slice(0, i).join("/");
    if (layoutDirs.has(ancestor)) chain.push(ancestor + "/layout.tsx");
  }
  return chain;
}

for (const file of files) {
  const isPage = file.endsWith("/page.tsx");
  const isRoute = file.endsWith("/route.ts");
  if (!isPage && !isRoute) {
    console.log(\`(no URL)  \${file}\`);
    continue;
  }
  const dir = file.slice(0, file.lastIndexOf("/"));
  const kind = isPage ? "PAGE    " : "ENDPOINT";
  console.log(\`\${kind}  \${toUrl(dir)}  wrapped by: \${layoutChain(dir).join(" > ") || "(none)"}\`);
}

console.log("note: app/dashboard has a layout but no page — /dashboard does not exist");`,
  },

  keyPoints: [
    "Folders under `app/` define URL segments; special filenames (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`) define behavior at each segment.",
    "Only `page.tsx` and `route.ts` make a segment publicly reachable — everything else (components, helpers, tests) colocates safely, unlike a PHP docroot where every file is a URL.",
    "`layout.tsx` is `header.php`/`footer.php` as one component: it wraps the page via `children`, layouts nest down the tree, and they persist across navigation instead of re-rendering.",
    "The root `app/layout.tsx` is required and must render `<html>` and `<body>`.",
    "For missing data, call `notFound()` from `next/navigation` — it aborts rendering and the nearest `not-found.tsx` renders with a real 404 status.",
    "A segment is a page or an endpoint, never both: `page.tsx` and `route.ts` can't share a folder.",
  ],

  interview: [
    {
      q: "In the App Router, what makes a URL actually exist?",
      a: "A segment is only publicly reachable if its folder contains a `page.tsx` (UI) or a `route.ts` (API endpoint) — and it must be one or the other, not both. Folders alone just define URL segments, and every other file is invisible to the router, which is what makes colocation safe: I can keep `PostCard.tsx` or a `queries.ts` right inside `app/blog/` and no URL will ever expose them. That's a deliberate inversion of the classic PHP docroot model, where anything you dropped into `public_html/` was one guessed URL away from executing. A folder with only a `layout.tsx` is a common gotcha — `/dashboard` with just a layout returns 404 until a page exists.",
    },
    {
      q: "How do layouts in the App Router differ from PHP-style header/footer includes?",
      a: "Structurally, a layout is one component that receives the page as `children`, so the shell is atomic — you can't forget the footer half the way you could forget a `require 'footer.php'`. They also nest by convention: `/blog/hello` renders the root layout, then `app/blog/layout.tsx` if it exists, then the page, with each layer typed. The biggest behavioral difference is persistence: on client-side navigation between two blog posts, only the page re-renders — the layouts and their state (an expanded sidebar, a scroll position, form input in the shell) survive. Includes re-execute top to bottom on every request, so they could never do that.",
    },
    {
      q: "Walk me through how a 404 happens in an App Router application.",
      a: "Two paths. If the URL matches no segment at all, Next.js renders the nearest `not-found.tsx` — the root one by default — with an actual 404 status code. If the URL matches but the data doesn't exist — say `/blog/[slug]` with a slug that's not in the database — the page calls `notFound()` from `next/navigation` after the failed lookup. That function throws internally, so rendering stops immediately (no `exit` to forget, unlike the PHP `http_response_code(404); include; exit;` ritual), and the closest `not-found.tsx` up the tree renders. Scoping works like error boundaries: a `not-found.tsx` inside `app/blog/` handles misses in that subtree with blog-appropriate UI.",
    },
  ],

  quiz: [
    {
      question:
        "app/dashboard/ contains only layout.tsx and a Chart.tsx component. What happens when a user visits /dashboard?",
      options: [
        "The layout renders with empty content",
        "Chart.tsx renders inside the layout",
        "404 — a segment without page.tsx or route.ts is not publicly reachable",
        "Next.js throws a build error for an incomplete route",
      ],
      answerIndex: 2,
      explain:
        "Only page.tsx and route.ts make a segment reachable. A layout alone wraps nothing routable, and colocated files like Chart.tsx never create URLs — the request falls through to not-found handling.",
    },
    {
      question:
        "What is the key behavioral difference between layout.tsx and a PHP header.php/footer.php include pair?",
      options: [
        "Layouts can't contain navigation markup",
        "Layouts persist across client-side navigation instead of re-rendering on every page change",
        "Layouts run in the browser only, includes run on the server only",
        "There is no difference beyond syntax",
      ],
      answerIndex: 1,
      explain:
        "Because the layout stays mounted while pages change under it, layout state survives navigation. PHP includes re-execute on every request. (Layouts also can't be 'half-included' since the shell is a single component.)",
    },
    {
      question:
        "Inside app/blog/[slug]/page.tsx the post lookup returns null. What's the idiomatic App Router response?",
      options: [
        "return <h1>404</h1> with http_response_code(404)",
        "throw new Error('not found') and let error.tsx render",
        "redirect the user to /blog",
        "call notFound() from next/navigation so the nearest not-found.tsx renders with a 404 status",
      ],
      answerIndex: 3,
      explain:
        "notFound() aborts rendering by throwing internally and delegates to the closest not-found.tsx up the tree, with a proper 404 status. error.tsx is for unexpected failures, not missing resources.",
    },
  ],
};

export default lesson;
