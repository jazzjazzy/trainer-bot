import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "route-groups",
  title: "Route Groups & Project Organization",
  part: "Routing & Navigation",
  estMinutes: 10,
  summary:
    "(group) folders organize app/ and scope layouts without appearing in the URL, _folders opt out of routing entirely, and colocation is safe because only page/route files are publicly reachable.",

  concept: `
In a classic PHP site the directory tree IS the URL space: put
\`admin/users.php\` on disk and \`/admin/users.php\` exists on the web —
including files you never meant to expose (every PHP developer has found a
\`test.php\` or \`db-backup.php\` reachable in production). Organizing code
*without* changing URLs took \`.htaccess\` gymnastics. The App Router
inverts this: the tree still drives routing, but you get explicit tools to
organize without leaking structure into URLs.

### Route groups: \`(folder)\`

Wrap a folder name in parentheses and it vanishes from the path:

\`\`\`
app/
├── (marketing)/
│   ├── layout.tsx        ← layout for the marketing pages
│   ├── page.tsx          → /
│   └── pricing/page.tsx  → /pricing
└── (shop)/
    ├── layout.tsx        ← different layout for the shop
    ├── cart/page.tsx     → /cart
    └── products/page.tsx → /products
\`\`\`

\`(marketing)\` and \`(shop)\` never appear in any URL — they exist so the
two halves of the site can have **different layouts** and live in tidy,
separate folders. Two rules: groups are purely organizational (no URL
effect at all), and two groups must not resolve the same path —
\`(marketing)/about/page.tsx\` plus \`(shop)/about/page.tsx\` both claim
\`/about\` and that's a build error.

Groups can even give sections **different root layouts**: omit the
top-level \`app/layout.tsx\` and give each group its own layout containing
\`<html>\` and \`<body>\`. Note the cost — navigating between pages under
different root layouts is a full page load, not a soft navigation.

### Private folders: \`_folder\`

Prefix a folder with an underscore and it — and everything under it — is
excluded from routing, even if a \`page.tsx\` sneaks in. Use it for the
"definitely never a route" signal: \`_components\`, \`_lib\`, \`_tests\`.

### Colocation is safe by default

Here's the mental shift from PHP: inside \`app/\`, only the special
filenames mean anything to the router at all — and of those, **only**
\`page\` and \`route\` make a URL publicly reachable.
A \`Chart.tsx\`, \`helpers.ts\`, or \`page.test.tsx\` sitting right next to
the page that uses it is invisible to the router. Colocating code with the
route it serves is encouraged — the \`test.php\`-in-production failure mode
is structurally impossible.

### Where does everything else go?

Two common conventions, both fine — pick one and be consistent:

- **\`src/\` or not**: \`create-next-app\` offers \`src/app\` (application
  code under \`src/\`, config files at the root). Most teams take it; the
  router behaves identically.
- **Shared code**: cross-cutting modules live *outside* the route tree —
  \`src/lib/\` for data access and utilities, \`src/components/\` for shared
  UI — while single-route helpers colocate next to (or in a \`_folder\`
  inside) the route that owns them. Rule of thumb: used by one route,
  colocate; used by many, lift it out.
`,

  comparisons: [
    {
      label: "Directory structure vs URL structure",
      intro:
        "Two file trees for the same site. In PHP the folders ARE the URLs, helpers included; in the App Router groups and private folders shape the tree without shaping the paths.",
      php: `# Classic PHP webroot — every file is a URL
htdocs/
├── index.php            # → /index.php
├── pricing.php          # → /pricing.php
├── shop/
│   ├── cart.php         # → /shop/cart.php
│   └── helpers.php      # → /shop/helpers.php  (oops — reachable!)
├── includes/
│   └── db.php           # reachable too, unless .htaccess denies it
└── test.php             # → /test.php  (the classic prod leak)

# Hiding structure needs config:
#   RewriteRule ^pricing$ /pricing.php [L]
#   <Files "helpers.php">Require all denied</Files>`,
      ts: `# Next.js app/ — only page/route files become URLs
app/
├── (marketing)/          # group: never in the URL
│   ├── layout.tsx        # marketing chrome
│   ├── page.tsx          # → /
│   └── pricing/page.tsx  # → /pricing
├── (shop)/               # group: never in the URL
│   ├── layout.tsx        # shop chrome
│   ├── cart/
│   │   ├── page.tsx      # → /cart
│   │   └── helpers.ts    # NOT routable — colocation is safe
│   └── _components/      # private: opted out of routing entirely
│       └── ProductCard.tsx
└── api/health/route.ts   # → /api/health`,
      note: "The PHP tree exposes by default and hides by configuration; the app/ tree hides by default and exposes only page and route files. (marketing) and (shop) exist purely to scope layouts and keep the tree tidy.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Two site chromes: include-switching vs two root layouts",
      intro:
        "Marketing pages get the glossy header; the app gets the dashboard shell. PHP branches inside a shared include; groups give each section its own layout file.",
      php: `<?php // header.php — one include, forever branching
$section = str_starts_with($_SERVER['REQUEST_URI'], '/app')
  ? 'app'
  : 'marketing';

if ($section === 'app') {
  require 'app-header.php';    // sidebar, user menu
} else {
  require 'marketing-header.php'; // hero nav, CTA button
}
// every new section = another branch in every include`,
      ts: `// app/(marketing)/layout.tsx — owns the glossy chrome
export default function MarketingLayout(
  { children }: { children: React.ReactNode }
) {
  return (
    <div>
      <nav>Home · Pricing · Sign up</nav>
      {children}
    </div>
  );
}

// app/(app)/layout.tsx — owns the dashboard shell
export default function AppLayout(
  { children }: { children: React.ReactNode }
) {
  return (
    <div className="with-sidebar">
      <aside>Projects · Settings</aside>
      {children}
    </div>
  );
}
// No branching: the folder a page lives in decides its chrome.`,
      note: "The 'which header do I include' switch disappears — membership in a group assigns the layout. Need entirely separate <html> shells? Drop the top-level layout and give each group a root layout, accepting full page loads across the divide.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The router's visibility rules as a pure function: given a file tree with groups and private folders, compute the public URL table. Predict which of the nine files produce URLs — two of the exclusions are the whole point of the lesson.",
    code: `// Route groups & private folders, in miniature:
// compute the public URL for each file in app/ (or why it has none).

function publicUrl(file: string): string {
  const segments = file.split('/');
  const leaf = segments.pop()!;

  if (leaf !== 'page.tsx' && leaf !== 'route.ts') {
    return '(not routable: only page/route files get URLs)';
  }

  const urlSegments = segments.slice(1); // drop the 'app' root

  if (urlSegments.some((s) => s.startsWith('_'))) {
    return '(not routable: inside a _private folder)';
  }

  const path = urlSegments
    .filter((s) => !(s.startsWith('(') && s.endsWith(')'))) // groups vanish
    .join('/');

  return '/' + path;
}

const files = [
  'app/(marketing)/page.tsx',
  'app/(marketing)/pricing/page.tsx',
  'app/(marketing)/testimonials.tsx',
  'app/(shop)/cart/page.tsx',
  'app/(shop)/cart/helpers.ts',
  'app/(shop)/products/[id]/page.tsx',
  'app/(shop)/_drafts/sale/page.tsx',
  'app/dashboard/settings/page.tsx',
  'app/api/health/route.ts',
];

for (const file of files) {
  console.log(file.padEnd(38) + publicUrl(file));
}

// Two things to notice:
// 1. (marketing) and (shop) never appear in a URL — they only scope layouts.
// 2. Even a page.tsx is unreachable inside _drafts — the underscore wins.`,
  },

  keyPoints: [
    "`(group)` folders vanish from the URL: `app/(marketing)/pricing/page.tsx` serves `/pricing` — groups exist to scope layouts and organize the tree.",
    "Two groups must not resolve to the same path — `(a)/about` and `(b)/about` both claiming `/about` is an error.",
    "Groups can carry different ROOT layouts (each with `<html>`/`<body>`) if you omit the top-level one — but navigating across root layouts is a full page load.",
    "`_folder` opts a subtree out of routing entirely, even if it contains a `page.tsx` — the explicit 'never a route' marker.",
    "Colocation is safe: only the special filenames mean anything to the router, and only `page` and `route` create a URL — so components, helpers, and tests can live next to the routes that use them.",
    "Convention: `src/app` for the route tree, `src/lib` and `src/components` for cross-cutting code; colocate anything used by exactly one route.",
  ],

  interview: [
    {
      q: "What are route groups for, and what do they NOT do?",
      a: "A route group is a folder wrapped in parentheses, like `(marketing)` — it's stripped from every URL, so it never affects paths. What it does do is scope layouts and organize the tree: put a `layout.tsx` inside `(marketing)` and every route in that group gets it, while `(shop)` routes get their own. Taken furthest, you can omit the top-level layout and give each group its own root layout with `<html>` and `<body>` — separate shells for a marketing site and an app — at the cost of a full page load when navigating between them. What groups don't do: change matching, add prefixes, or provide any isolation beyond layout scoping. And two groups must not resolve the same path — `(a)/about` and `(b)/about` is a conflict.",
    },
    {
      q: "Is it safe to put non-route files inside app/? How does that compare to a PHP webroot?",
      a: "Yes — and that's a deliberate inversion of the PHP model. In a PHP webroot, every file is reachable by default; you hide things with `.htaccess` rules or by moving them out of the docroot, and forgetting is how `test.php` ends up live in production. In `app/`, only the special filenames — `page`, `route`, `layout`, `loading`, `error`, and so on — mean anything to the router at all, and of those only `page` and `route` make a URL publicly reachable. A `Chart.tsx` or `helpers.ts` next to a page is invisible to the router, so colocating a route's components, helpers, and tests with the route is encouraged. For an explicit signal you can prefix a folder with an underscore: `_components` is excluded from routing entirely, even if someone drops a `page.tsx` inside it.",
    },
    {
      q: "How would you organize a Next.js project with a marketing site, an authenticated app, and shared code?",
      a: "I'd take the `src/` option from create-next-app and split `src/app` into route groups: `(marketing)` with its own layout for the public pages, and `(app)` — or `(dashboard)` — with the authenticated shell, so each section owns its chrome without URL prefixes. Cross-cutting code lives outside the route tree: `src/lib` for data access and utilities (with `import 'server-only'` on the sensitive ones) and `src/components` for shared UI. Code used by exactly one route colocates next to it, in a `_components` folder if I want the intent explicit. The rule of thumb I'd state: used by one route, colocate; used by many, lift it into `lib/` or `components/`.",
    },
  ],

  quiz: [
    {
      question: "What URL does app/(shop)/products/[id]/page.tsx serve?",
      options: [
        "/shop/products/[id]",
        "/(shop)/products/123",
        "/products/123",
        "It isn't routable because of the parentheses",
      ],
      answerIndex: 2,
      explain:
        "Route groups are stripped from the path entirely — (shop) organizes the tree and scopes a layout but never appears in a URL. The [id] segment matches dynamically, so /products/123 hits this page.",
    },
    {
      question:
        "A page.tsx exists at app/admin/_drafts/promo/page.tsx. Who can reach it?",
      options: [
        "Anyone, at /admin/_drafts/promo",
        "Anyone, at /admin/promo — the underscore folder is stripped like a group",
        "No one — folders prefixed with _ opt their whole subtree out of routing",
        "Only requests carrying a preview cookie",
      ],
      answerIndex: 2,
      explain:
        "Private folders (_folder) exclude themselves and everything beneath them from routing — even a page.tsx inside is unreachable. Unlike (group) folders, they don't vanish from URLs; they remove the URL altogether.",
    },
    {
      question:
        "You give (marketing) and (app) each their own root layout with <html> and <body>. What's the trade-off?",
      options: [
        "The build fails — an app can only have one <html> element",
        "Navigation between the two sections becomes a full page load instead of a soft navigation",
        "The (app) group loses access to Server Components",
        "Both groups must share the same metadata",
      ],
      answerIndex: 1,
      explain:
        "Multiple root layouts are supported (omit the top-level layout.tsx), giving each section a genuinely different document shell. But crossing between them requires replacing <html> itself, so Next.js does a full page load rather than a client-side transition.",
    },
  ],
};

export default lesson;
