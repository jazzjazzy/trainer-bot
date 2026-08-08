import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "metadata-and-seo",
  title: "Metadata & SEO",
  part: "Production & Interview Prep",
  estMinutes: 11,
  summary:
    "Typed metadata exports, generateMetadata for dynamic routes, and file conventions like sitemap.ts — Next gives crawlers real HTML plus a typed API for everything in <head>.",

  concept: `
One thing your PHP sites always did right: a crawler requesting a page got
finished HTML — title, meta description, content — in the response body. A
classic client-rendered SPA sends an empty \`<div id="root">\` and hopes the
bot executes JavaScript. Next restores the PHP guarantee (server-rendered
HTML on first byte) and replaces the \`header.php\` variable-echoing with a
**typed metadata API**.

### Static metadata: an export, not echoes

Any layout or page can export a \`metadata\` object:

\`\`\`tsx
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { template: '%s | Acme', default: 'Acme' },
  description: 'Project tools for small teams.',
  openGraph: { siteName: 'Acme', type: 'website' },
};
\`\`\`

The \`title.template\` is the trick you used to do with
\`<title><?= $pageTitle ?> | Acme</title>\`: any *child* segment that sets
\`title: 'Pricing'\` renders as \`Pricing | Acme\`. The \`default\` covers pages
that set nothing. Because \`Metadata\` is a type, a misspelled field is a
compile error, not an invisible SEO bug.

### Dynamic metadata: generateMetadata

When the title depends on data — a blog post, a product — export an async
\`generateMetadata\` instead. It follows the exact same rules as the page:
\`params\` is a **Promise** you await:

\`\`\`tsx
// app/blog/[slug]/page.tsx
import type { Metadata } from 'next';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);   // deduplicated with the page's fetch
  return {
    title: post.title,                // template applies: "... | Acme"
    description: post.excerpt,
    openGraph: { title: post.title, type: 'article', images: [post.ogImage] },
  };
}
\`\`\`

Next deduplicates fetches between \`generateMetadata\` and the page render, so
this doesn't double your data cost. An optional second argument (\`parent:
ResolvingMetadata\`) lets you await and *extend* the parent's metadata — e.g.
appending to its Open Graph images instead of replacing them.

### How metadata merges down the tree

Evaluation runs root layout → nested layouts → page, and for each top-level
field the **nearest (deepest) definition wins**. Two subtleties:

- The merge is **shallow, per top-level field**. If your root layout defines
  \`openGraph\` with three fields and a page defines \`openGraph\` with one,
  the page's object *replaces* the layout's entirely — the other two fields
  are gone, not inherited. Share defaults via a spread from a common constant
  (or extend \`parent\` in \`generateMetadata\`) if you want real merging.
- \`title.template\` applies to **children's** titles, not to the segment that
  defines it (that segment uses \`default\`).

### The file conventions: SEO by filename

Some head/SEO artifacts are whole files, discovered by convention:

- \`app/sitemap.ts\` — default-exports a function returning
  \`MetadataRoute.Sitemap\` (an array of \`{ url, lastModified, ... }\`); Next
  serves it as XML at \`/sitemap.xml\`. Your \`sitemap.php\` loop, typed.
- \`app/robots.ts\` — returns \`MetadataRoute.Robots\`; served at \`/robots.txt\`.
- \`app/favicon.ico\`, \`icon.png\` — picked up automatically as icon tags.
- \`opengraph-image.png\` (or \`.tsx\` to *render* the image with JSX) in any
  route segment — becomes that segment's \`og:image\`, the preview card shown
  when the URL is shared on social platforms.

No plugin, no manual \`<link>\` tags: put the file in the tree, Next emits the
markup and serves the route. In an interview, this section is your closing
argument for Next over a plain SPA: crawlers get real HTML *and* the entire
head is typed, colocated, and derived from data.
`,

  comparisons: [
    {
      label: "header.php variables vs the metadata export",
      intro:
        "Every page needs its own title and description over a shared template. PHP sets variables before including header.php; Next exports a typed object and the framework renders <head>.",
      php: `<?php // pricing.php
$pageTitle = 'Pricing';
$metaDescription = 'Simple plans for every team size.';
require 'header.php';
?>
<h1>Pricing</h1>

<?php /* header.php */ ?>
<!DOCTYPE html>
<html>
<head>
  <title><?= htmlspecialchars($pageTitle ?? 'Acme') ?> | Acme</title>
  <meta name="description"
        content="<?= htmlspecialchars($metaDescription ?? '') ?>">
</head>
<body>`,
      ts: `// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { template: '%s | Acme', default: 'Acme' },
  description: 'Project tools for small teams.',
};

// app/pricing/page.tsx
export const metadata: Metadata = {
  title: 'Pricing',   // rendered as "Pricing | Acme"
  description: 'Simple plans for every team size.',
};

export default function PricingPage() {
  return <h1>Pricing</h1>;
}`,
      note:
        "The layout's title.template plays the role of the ' | Acme' suffix in header.php, and the page contributes only its own piece. Metadata is a typed export — a misspelled field fails the build instead of silently shipping an empty tag.",
    },
    {
      label: "Dynamic titles from data: generateMetadata",
      intro:
        "A blog post's title and social preview come from the database. PHP fetches the row before emitting the head; Next exports an async generateMetadata that awaits params.",
      php: `<?php // post.php?slug=app-router
$stmt = $pdo->prepare('SELECT * FROM posts WHERE slug = ?');
$stmt->execute([$_GET['slug'] ?? '']);
$post = $stmt->fetch(PDO::FETCH_ASSOC);
?>
<head>
  <title><?= htmlspecialchars($post['title']) ?> | Acme</title>
  <meta name="description"
        content="<?= htmlspecialchars($post['excerpt']) ?>">
  <meta property="og:title"
        content="<?= htmlspecialchars($post['title']) ?>">
  <meta property="og:image"
        content="<?= htmlspecialchars($post['og_image']) ?>">
</head>`,
      ts: `// app/blog/[slug]/page.tsx
import type { Metadata } from 'next';
import { getPost } from '@/lib/data';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;   // params is a Promise - Next 16 rule
  const post = await getPost(slug);

  return {
    title: post.title,             // "... | Acme" via the layout template
    description: post.excerpt,
    openGraph: {
      title: post.title,
      type: 'article',
      images: [post.ogImage],
    },
  };
}

export default async function PostPage(/* ... */) { /* render */ }`,
      note:
        "generateMetadata awaits params exactly like the page does, and Next deduplicates the getPost call between metadata and render — the data is fetched once, unlike naively querying twice in PHP.",
    },
    {
      label: "sitemap.php vs a typed sitemap.ts",
      intro:
        "Emit a sitemap for crawlers. PHP prints XML strings by hand; sitemap.ts returns a typed array and Next serves it at /sitemap.xml.",
      php: `<?php // sitemap.php
header('Content-Type: application/xml');
echo '<?xml version="1.0" encoding="UTF-8"?>';
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

$rows = $pdo->query('SELECT slug, updated_at FROM posts');
foreach ($rows as $row) {
    echo '<url>';
    echo '<loc>https://acme.com/blog/' . $row['slug'] . '</loc>';
    echo '<lastmod>' .
        date('Y-m-d', strtotime($row['updated_at'])) . '</lastmod>';
    echo '</url>';
}
echo '</urlset>';`,
      ts: `// app/sitemap.ts  -> served at /sitemap.xml
import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/data';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();

  return [
    { url: 'https://acme.com', changeFrequency: 'yearly', priority: 1 },
    ...posts.map((post) => ({
      url: \`https://acme.com/blog/\${post.slug}\`,
      lastModified: post.updatedAt,
      changeFrequency: 'weekly' as const,
    })),
  ];
}`,
      note:
        "The return type MetadataRoute.Sitemap validates every entry at compile time — a typo'd changeFrequency value is a build error, not a malformed XML tag a crawler quietly ignores. robots.ts works the same way for /robots.txt.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Metadata merging in miniature: a root layout with a title template, one page that sets nothing, one that overrides — including the shallow-merge gotcha where the page's openGraph replaces the layout's entirely. Predict both resolved heads, then run it.",
    code: `// How metadata resolves down the layout tree, in miniature.

interface Meta {
  title?: string | { template: string; default: string };
  description?: string;
  openGraph?: { title?: string; type?: string; image?: string };
}

// app/layout.tsx
const rootLayout: Meta = {
  title: { template: '%s | Acme', default: 'Acme' },
  description: 'Project tools for small teams.',
  openGraph: { title: 'Acme', type: 'website', image: '/og-default.png' },
};

// app/blog/[slug]/page.tsx - overrides title, description, openGraph
const postPage: Meta = {
  title: 'Understanding the App Router',
  description: 'Layouts, metadata, and SEO.',
  openGraph: { title: 'Understanding the App Router', image: '/og-post.png' },
  // note: no 'type' - and openGraph merges SHALLOWLY
};

function resolveHead(chain: Meta[]): string[] {
  let template: string | null = null;
  let title = '';
  let description: string | undefined;
  let og: Meta['openGraph'];

  for (const meta of chain) {          // root -> leaf: nearest wins
    if (meta.title !== undefined) {
      if (typeof meta.title === 'string') {
        // a child's plain title flows through the ancestor's template
        title = template ? template.replace('%s', meta.title) : meta.title;
      } else {
        title = meta.title.default;      // template never applies to itself
        template = meta.title.template;  // ...only to children below
      }
    }
    if (meta.description !== undefined) description = meta.description;
    if (meta.openGraph !== undefined) og = meta.openGraph; // REPLACES whole object
  }

  const tags = [\`<title>\${title}</title>\`];
  if (description) tags.push(\`<meta name="description" content="\${description}">\`);
  if (og?.title) tags.push(\`<meta property="og:title" content="\${og.title}">\`);
  tags.push(\`<meta property="og:type" content="\${og?.type ?? '(gone - page openGraph replaced the layout one)'}">\`);
  if (og?.image) tags.push(\`<meta property="og:image" content="\${og.image}">\`);
  return tags;
}

console.log('--- / (page defines no metadata) ---');
for (const tag of resolveHead([rootLayout, {}])) console.log(tag);

console.log('--- /blog/app-router ---');
for (const tag of resolveHead([rootLayout, postPage])) console.log(tag);`,
  },

  keyPoints: [
    "Export `const metadata: Metadata` from any layout or page for static head tags; the type catches misspelled fields at build time — no more silently empty meta tags.",
    "`title: { template: '%s | Acme', default: 'Acme' }` in a layout formats children's titles; the template applies to child segments, not to the layout that defines it.",
    "For data-driven heads, export async `generateMetadata({ params })` — `params` is a Promise you await (same Next 16 rule as pages), and its fetches are deduplicated with the page render.",
    "Metadata merges root → page with the nearest definition winning, but SHALLOWLY per top-level field: a page's `openGraph` replaces the layout's whole `openGraph` object.",
    "File conventions cover the rest: `sitemap.ts` (typed `MetadataRoute.Sitemap`, served at /sitemap.xml), `robots.ts`, `favicon.ico`/`icon.png`, and per-segment `opengraph-image` for social preview cards.",
    "The interview framing: Next gives crawlers finished HTML like PHP always did — plus a typed, colocated head API that SPAs and header.php both lack.",
  ],

  interview: [
    {
      q: "How does metadata work in the App Router, and how does it merge across layouts?",
      a: "Each layout and page can contribute: a static `export const metadata: Metadata` object, or an async `generateMetadata({ params })` when the values come from data — params being a Promise I await, like everywhere in Next 16. Next evaluates from the root layout down to the page, and for each top-level field the deepest definition wins. The key subtlety is that merging is shallow per field: if the root layout defines `openGraph` with siteName, type, and images, and my page defines `openGraph` with just a title, the page's object replaces the layout's wholesale — the other fields don't survive. If I need genuine extension I either spread a shared constant into both, or use `generateMetadata`'s second `parent` argument to await and append to the parent's resolved metadata.",
    },
    {
      q: "Why is Next.js better for SEO than a classic client-rendered React SPA?",
      a: "A classic SPA responds with a nearly empty HTML shell and builds the page in the browser, so crawlers and link-preview bots either have to execute JavaScript or see nothing — titles, descriptions, and content all arrive late. Next renders on the server, so the first response is complete HTML with the real content, exactly what PHP delivered for thirty years. On top of that the head itself is a first-class typed API: title templates, per-route `generateMetadata` from data, Open Graph images as file conventions, `sitemap.ts` and `robots.ts` generated from the same data layer as the pages. So it isn't just 'crawlable again' — the SEO surface is type-checked and colocated with each route instead of hand-echoed in a header include.",
    },
    {
      q: "You need a sitemap and per-post social preview images. Where does that code live?",
      a: "Both are file conventions. `app/sitemap.ts` default-exports an async function returning `MetadataRoute.Sitemap` — an array of `{ url, lastModified, changeFrequency, priority }` — and Next serves it as XML at /sitemap.xml; it can query the same data layer as my pages, so it's my old sitemap.php loop with compile-time validation. For social previews, I drop an `opengraph-image.png` into a route segment, or an `opengraph-image.tsx` that renders the image dynamically with JSX — that becomes the segment's og:image, which is the card shown when someone shares the URL on social platforms. For a per-post image I'd generate it from the post title in the `[slug]` segment. `robots.ts` rounds it out for /robots.txt.",
    },
  ],

  quiz: [
    {
      question:
        "The root layout exports title: { template: '%s | Acme', default: 'Acme' }. A page exports title: 'Pricing'. What does the browser tab show on that page?",
      options: [
        "Pricing",
        "Pricing | Acme",
        "Acme",
        "%s | Acme",
      ],
      answerIndex: 1,
      explain:
        "A layout's title.template formats the titles of child segments: the page's 'Pricing' is substituted for %s, giving 'Pricing | Acme'. The default ('Acme') is only used by pages that set no title at all.",
    },
    {
      question:
        "The root layout defines openGraph: { siteName: 'Acme', type: 'website', images: [...] }. A page defines openGraph: { title: 'My Post' }. What openGraph data does the page emit?",
      options: [
        "All four fields, deep-merged",
        "Only { title: 'My Post' } — the page's object replaced the layout's entirely",
        "Only the layout's three fields — pages can't override openGraph",
        "A build error: openGraph may only be defined once per app",
      ],
      answerIndex: 1,
      explain:
        "Metadata merges shallowly per top-level field: the nearest definition of openGraph wins as a whole object. To keep shared fields, spread a common constant into both definitions or extend the parent via generateMetadata's second argument.",
    },
    {
      question: "How do you serve /sitemap.xml in the App Router?",
      options: [
        "Create app/sitemap.ts default-exporting a function that returns MetadataRoute.Sitemap",
        "Add a sitemap field to next.config.ts",
        "Write app/sitemap.xml/route.ts and hand-build the XML string",
        "Sitemaps require an external package like next-sitemap",
      ],
      answerIndex: 0,
      explain:
        "sitemap.ts is a metadata file convention: default-export a (possibly async) function returning a typed MetadataRoute.Sitemap array, and Next generates and serves the XML at /sitemap.xml. Hand-building XML in a route handler works but throws away the typed convention.",
    },
  ],
};

export default lesson;
