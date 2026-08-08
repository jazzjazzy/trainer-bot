import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "dynamic-routes",
  title: "Dynamic Route Segments",
  part: "Routing & Navigation",
  estMinutes: 12,
  summary:
    "[slug] folders declare URL parameters that arrive as an awaited params Promise, [...slug] and [[...slug]] catch variable-depth paths, and generateStaticParams prerenders the ones you know.",

  concept: `
Twenty years of PHP taught you two ways to get \`/blog/my-post\` working:
an \`.htaccess\` \`RewriteRule\` feeding \`$_GET['slug']\`, or a framework
route like \`/blog/{slug}\`. The App Router does it with a **folder name**:

\`\`\`
app/blog/[slug]/page.tsx   →   /blog/my-post, /blog/hello, ...
\`\`\`

The square brackets declare the parameter, the folder position declares
where it sits in the URL, and TypeScript knows its name and type. The
rewrite rule, the route table, and the parameter docs collapse into the
filesystem.

### \`params\` is a Promise — await it

The segment value arrives on the page's \`params\` prop. Since Next 15 that
prop is a **Promise**, and in Next 16 the old synchronous access is gone
entirely — \`await\` is the only way in:

\`\`\`tsx
// app/blog/[slug]/page.tsx
export default async function Post(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;
  return <h1>{slug}</h1>;
}
\`\`\`

Why a Promise? So Next.js can start rendering the parts of the tree that
don't need the params before the request is fully resolved. Next 16 also
generates **typed route helpers** — \`PageProps<'/blog/[slug]'>\` is
globally available and types both \`params\` and \`searchParams\` from the
literal route string, so you don't hand-write the Promise type. (In a
\`'use client'\` page you can't \`await\`; unwrap with React's \`use(props.params)\`.)

### Catch-all and optional catch-all

| Folder | Matches | \`params\` |
| --- | --- | --- |
| \`[slug]\` | \`/blog/a\` | \`{ slug: 'a' }\` — one segment, \`string\` |
| \`[...parts]\` | \`/docs/a/b/c\` | \`{ parts: ['a','b','c'] }\` — one or more, \`string[]\` |
| \`[[...parts]]\` | \`/docs\` AND \`/docs/a/b\` | \`string[]\` or \`undefined\` — zero or more |

Catch-alls replace the \`preg_match('#^/docs/(.+)$#', ...)\` routing you've
written by hand: variable-depth paths (docs trees, file browsers, CMS
pages) become one folder. The optional variant also owns the bare base
path, so \`/docs\` and \`/docs/getting-started/install\` share a page file.

### \`generateStaticParams\`: prerender the slugs you know

Dynamic segments render per request by default. If you can enumerate the
values at build time — blog posts, product pages — export
\`generateStaticParams\` and Next.js prerenders each one into static HTML:

\`\`\`tsx
export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map((post) => ({ slug: post.slug }));
}
\`\`\`

It's the modern version of that cron job you once wrote to bake popular
pages into static \`.html\` files — except it's declarative, typed, and
slugs you *didn't* list still render on demand (control that with the
\`dynamicParams\` segment option).
`,

  comparisons: [
    {
      label: "One pretty URL, three moving parts vs one folder",
      intro:
        "Serve /blog/my-first-post from a slug. PHP needs a rewrite rule plus untyped superglobal access; Next.js needs a folder name.",
      php: `<?php // blog-post.php
// Plus, in .htaccess (a SEPARATE file to keep in sync):
//   RewriteEngine On
//   RewriteRule ^blog/([a-z0-9-]+)$ /blog-post.php?slug=$1 [L]

$slug = $_GET['slug'] ?? null;   // mixed — hope the rewrite ran

if ($slug === null) {
  http_response_code(404);
  exit('Not found');
}

$post = getPostBySlug($slug);    // string juggling from here on
echo '<h1>' . htmlspecialchars($post['title']) . '</h1>';`,
      ts: `// app/blog/[slug]/page.tsx — the folder IS the route
import { notFound } from 'next/navigation';
import { getPostBySlug } from '@/lib/posts';

export default async function Post(props: PageProps<'/blog/[slug]'>) {
  // params is a Promise since Next 15 — await is mandatory in 16.
  const { slug } = await props.params;   // slug: string, typed from the folder

  const post = await getPostBySlug(slug);
  if (!post) notFound();

  return <h1>{post.title}</h1>;
}`,
      note: "The rewrite rule, the parameter name, and its type all live in one place — the folder. PageProps<'/blog/[slug]'> is a Next 16 generated helper: mistype the route string or the param name and the compiler objects.",
    },
    {
      label: "Variable-depth paths: regex route vs catch-all",
      intro:
        "A docs site serves /docs/app/routing/pages at any depth. PHP reaches for a regex and explode(); Next.js reaches for [...parts].",
      php: `<?php // index.php — a hand-rolled front controller
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (preg_match('#^/docs/(.+)$#', $uri, $m)) {
  $parts = explode('/', $m[1]);
  // $parts = ['app', 'routing', 'pages'] — array of strings,
  // but nothing enforces that; the regex is the contract.
  renderDocsPage($parts);
} else {
  http_response_code(404);
}`,
      ts: `// app/docs/[...parts]/page.tsx — matches /docs/a, /docs/a/b/c, ...
export default async function DocsPage(
  props: { params: Promise<{ parts: string[] }> }
) {
  const { parts } = await props.params;  // ['app', 'routing', 'pages']

  return (
    <nav>
      breadcrumb: docs / {parts.join(' / ')}
    </nav>
  );
}

// Want /docs itself handled by the SAME page?
// Rename the folder to [[...parts]] — params.parts
// becomes string[] | undefined and the bare path matches too.`,
      note: "[...parts] requires at least one segment; [[...parts]] (optional catch-all) also matches the bare /docs with params.parts === undefined. The regex-as-contract becomes a typed string[].",
    },
    {
      label: "Prerendering known slugs",
      intro:
        "Both sides bake known pages ahead of time so requests hit static files. One is a cron job and a wall of fwrite; the other is one exported function.",
      php: `<?php // build-static.php — run from cron nightly
$posts = getAllPosts();

foreach ($posts as $post) {
  ob_start();
  render_post($post);            // reuse the template
  $html = ob_get_clean();

  file_put_contents(
    __DIR__ . '/static/blog/' . $post['slug'] . '.html',
    $html
  );
}
// ...plus rewrite rules to serve /static first,
// plus remembering to rerun this when a post changes.`,
      ts: `// app/blog/[slug]/page.tsx
import { getAllPosts } from '@/lib/posts';

// Runs at BUILD time: each returned object becomes
// a prerendered page — /blog/hello, /blog/deep-dive, ...
export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function Post(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  // At runtime this renders from prebuilt static HTML;
  // slugs NOT listed still render on demand by default.
}`,
      note: "generateStaticParams is the declarative cron job: build-time prerendering with the same page component, and unknown slugs still work (opt out with `export const dynamicParams = false` to 404 them instead).",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of the App Router's segment matcher: patterns like '/blog/[slug]' and '/docs/[...parts]' against real URLs. Predict each extracted params object — especially which URLs the catch-all rejects but the optional catch-all accepts.",
    code: `// How [slug], [...parts] and [[...parts]] extract params, in miniature.

type Params = Record<string, string | string[]>;

function matchRoute(pattern: string, url: string): Params | null {
  const pSegs = pattern.split('/').filter(Boolean);
  const uSegs = url.split('/').filter(Boolean);
  const params: Params = {};

  for (let i = 0; i < pSegs.length; i++) {
    const seg = pSegs[i];

    if (seg.startsWith('[[...')) {          // optional catch-all
      const rest = uSegs.slice(i);
      if (rest.length > 0) params[seg.slice(5, -2)] = rest;
      return params;                        // matches even when empty
    }
    if (seg.startsWith('[...')) {           // catch-all
      const rest = uSegs.slice(i);
      if (rest.length === 0) return null;   // needs at least one segment
      params[seg.slice(4, -1)] = rest;
      return params;
    }
    if (seg.startsWith('[')) {              // dynamic segment
      if (uSegs[i] === undefined) return null;
      params[seg.slice(1, -1)] = uSegs[i];
      continue;
    }
    if (seg !== uSegs[i]) return null;      // static segment must match
  }
  return uSegs.length === pSegs.length ? params : null;
}

const cases: [string, string][] = [
  ['/blog/[slug]',          '/blog/server-components'],
  ['/blog/[slug]',          '/blog'],
  ['/shop/[category]/[id]', '/shop/beans/42'],
  ['/docs/[...parts]',      '/docs/app/routing/pages'],
  ['/docs/[...parts]',      '/docs'],
  ['/wiki/[[...path]]',     '/wiki'],
  ['/wiki/[[...path]]',     '/wiki/setup/linux'],
];

for (const [pattern, url] of cases) {
  const result = matchRoute(pattern, url);
  console.log(
    pattern.padEnd(24) + url.padEnd(26) +
    (result ? JSON.stringify(result) : 'NO MATCH')
  );
}

// Note the two NO MATCH lines: [slug] needs exactly one segment,
// [...parts] needs at least one. Only [[...path]] owns the bare path.`,
  },

  keyPoints: [
    "A `[slug]` folder declares a URL parameter; the folder's position in `app/` declares where it sits in the path — no rewrite rules, no route table.",
    "`params` has been a Promise since Next 15, and Next 16 removed synchronous access entirely: `const { slug } = await props.params;` in server pages, `use(props.params)` in client pages.",
    "Next 16 generates typed helpers — `PageProps<'/blog/[slug]'>` types `params` and `searchParams` straight from the route string.",
    "`[...parts]` (catch-all) matches one or more segments as `string[]`; `[[...parts]]` (optional catch-all) also matches the bare path with `undefined`.",
    "`generateStaticParams` returns the param objects to prerender at build time; unlisted values still render on demand unless `dynamicParams = false`.",
    "PHP anchor: `[slug]` replaces the RewriteRule + `$_GET` pair, catch-alls replace `preg_match` routing, and `generateStaticParams` replaces the static-HTML cron job.",
  ],

  interview: [
    {
      q: "How do dynamic routes work in the App Router, and what changed about params in recent versions?",
      a: "A bracketed folder name declares the parameter: `app/blog/[slug]/page.tsx` serves `/blog/anything`, and the value arrives on the page's `params` prop. The big recent change is that `params` (and `searchParams`) became a Promise in Next 15, and Next 16 removed synchronous access entirely — you must `await props.params` in an async Server Component, or unwrap with React's `use()` in a client page. The motivation is streaming: Next.js can start rendering parts of the tree that don't depend on request data before resolving it. Next 16 also ships generated route types, so `PageProps<'/blog/[slug]'>` gives you correctly typed params without writing the Promise type by hand — it's the folder-name-as-contract idea, the way a PHP framework's `{slug}` placeholder maps to a controller argument, but enforced by the compiler.",
    },
    {
      q: "What's the difference between [...slug] and [[...slug]]?",
      a: "Both are catch-alls that swallow multiple path segments into a `string[]`. `[...slug]` requires at least one segment: `app/docs/[...slug]` matches `/docs/a` and `/docs/a/b/c` but NOT `/docs` itself. The double-bracket optional variant `[[...slug]]` also matches the bare path, where `params.slug` is `undefined` — so one page file can serve a docs landing page and every nested article. TypeScript reflects the difference: `string[]` versus `string[] | undefined`, which forces you to handle the landing-page case. In PHP terms it's the difference between `preg_match('#^/docs/(.+)$#')` and `preg_match('#^/docs(?:/(.+))?$#')` — except the type system, not the regex, carries the contract.",
    },
    {
      q: "What does generateStaticParams do, and what happens to a slug you didn't return from it?",
      a: "It runs at build time and returns the list of param objects to prerender — for a blog, `posts.map(p => ({ slug: p.slug }))` — and Next.js renders each into static HTML using the same page component, so those requests are served like static files. By default, a slug you didn't list is not a 404: it renders dynamically on first request (`dynamicParams` defaults to true). If the list is genuinely exhaustive you set `export const dynamicParams = false` and unknown values 404 instead. It replaces the old pattern of a cron job baking popular pages to `.html` files — same performance win, but declarative and with a live fallback for everything else.",
    },
  ],

  quiz: [
    {
      question:
        "In Next.js 16, how does a Server Component page at app/blog/[slug]/page.tsx read the slug?",
      options: [
        "const { slug } = props.params — params is a plain object",
        "const { slug } = await props.params — params is a Promise",
        "const slug = useParams().slug inside the page",
        "const slug = props.searchParams.slug",
      ],
      answerIndex: 1,
      explain:
        "params became a Promise in Next 15 and the synchronous fallback was removed in 16, so awaiting is the only way in a Server Component (client pages unwrap with React's use()). useParams is a client-only hook, and searchParams is the query string, not the path segment.",
    },
    {
      question: "Which URL does app/docs/[[...parts]]/page.tsx match that app/docs/[...parts]/page.tsx does NOT?",
      options: [
        "/docs/a/b/c",
        "/docs/a",
        "/docs",
        "/docs?page=2",
      ],
      answerIndex: 2,
      explain:
        "The optional catch-all [[...parts]] additionally matches the bare base path, with params.parts === undefined. The required catch-all [...parts] needs at least one segment after /docs. (A query string doesn't affect segment matching.)",
    },
    {
      question:
        "generateStaticParams for a blog returns 50 slugs. A user requests /blog/brand-new-post, which wasn't in the list. By default, what happens?",
      options: [
        "A 404, because only listed slugs exist",
        "The page renders dynamically on request — unlisted params are allowed by default",
        "A build error the next time you deploy",
        "The request is redirected to the blog index",
      ],
      answerIndex: 1,
      explain:
        "dynamicParams defaults to true: generateStaticParams prerenders the known values, and anything else falls back to on-demand rendering with the same page component. Set export const dynamicParams = false to turn unlisted values into 404s.",
    },
  ],
};

export default lesson;
