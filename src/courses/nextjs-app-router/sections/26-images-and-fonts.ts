import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "images-and-fonts",
  title: "Optimizing Images & Fonts",
  part: "Production & Interview Prep",
  estMinutes: 11,
  summary:
    "next/image gives you a full resize-and-modern-format pipeline behind a component, and next/font self-hosts Google fonts at build time — both exist because Core Web Vitals are ranking factors.",

  concept: `
Next.js ships two components that look cosmetic but exist for a hard commercial
reason: **Core Web Vitals** — Google's user-experience metrics, especially
**LCP** (Largest Contentful Paint) and **CLS** (Cumulative Layout Shift) — are
search ranking factors, and unoptimized images and web fonts are the two
biggest causes of bad scores. If you've ever hand-rolled a \`thumb.php\` with GD
or Imagick and a \`cache/thumbs/\` directory, you already understand the
problem \`next/image\` solves; it just solves it inside the framework.

### \`<Image>\`: an \`<img>\` with a pipeline behind it

\`\`\`tsx
// app/products/page.tsx
import Image from 'next/image';

<Image src="/beans.jpg" alt="House blend" width={400} height={300} />
\`\`\`

Rendered, that becomes an \`<img>\` whose \`src\` points at Next's optimizer
endpoint (\`/_next/image?url=...&w=...&q=...\`). The optimizer:

- **resizes on demand** to a set of device widths and emits a \`srcset\`, so a
  phone never downloads a 2400px hero;
- **serves modern formats** — WebP or AVIF — when the browser's \`Accept\`
  header says it can take them, falling back to the original otherwise;
- **caches the results** (your GD script's \`cache/thumbs/\`, managed for you);
- **lazy-loads by default** (\`loading="lazy"\`), so below-the-fold images
  don't compete with the content the user actually sees first.

### Why \`width\` and \`height\` are required

CLS happens when an image finishes loading and shoves the page around because
the browser didn't know how big it would be. \`next/image\` refuses to let that
happen: you must give it \`width\` and \`height\` (used to reserve the correct
aspect-ratio box), or use \`fill\` to make the image absolutely fill a
\`position: relative\` parent whose size is set by CSS. Forgetting both is a
runtime error, not a silent layout shift.

For the one image that IS above the fold — the LCP candidate — add
\`preload\`: it switches off lazy loading and injects a
\`<link rel="preload" as="image">\` into the \`<head>\`, so the browser starts
fetching it immediately. (\`priority\` was the old name for this prop; Next 16
deprecated it in favour of \`preload\`. Neither one puts \`fetchpriority="high"\`
on the \`<img>\` — the hint lives in the preload link.)

### Static imports: dimensions for free

\`\`\`tsx
import hero from './hero.jpg';   // build-time: Next reads the file
<Image src={hero} alt="Roastery" preload placeholder="blur" />
\`\`\`

Because the file exists at build time, Next already knows its width and height
(no props needed) and can generate a tiny blurred placeholder to paint while
the real image loads.

### Remote images must be allow-listed

For \`src="https://cdn.example.com/..."\` you must register the host under
\`images.remotePatterns\` in \`next.config.ts\`. Without an allow-list your
optimizer would be an open proxy — anyone could make YOUR server download and
resize arbitrary images from the internet. Remote files also can't be measured
at build time, so \`width\`/\`height\` (or \`fill\`) are on you.

### \`next/font\`: fonts as build artifacts

The classic move — \`<link href="https://fonts.googleapis.com/...">\` in the
\`<head>\` — costs a third-party DNS lookup + connection on every visit, risks
flash-of-invisible-text, and leaks every visitor's IP to Google (a German
court ruled in 2022 that this violates the GDPR). \`next/font/google\` fixes
all three: the CSS and \`.woff2\` files are **downloaded once at build time**
and self-hosted with your static assets. **Zero requests reach Google at
runtime.** You get back an object exposing a \`className\` (apply it directly)
or, with the \`variable\` option, a CSS custom property like \`--font-inter\`
for use in stylesheets. Next also auto-tunes a fallback font's metrics so the
swap from fallback to web font doesn't shift the layout. Own font files? Same
API via \`next/font/local\`.
`,

  comparisons: [
    {
      label: "The thumbnail pipeline you no longer write",
      intro:
        "Serve a product photo resized for the page. The PHP version is a hand-rolled GD script with its own cache directory; the Next version is a component and the framework owns the pipeline.",
      php: `<?php // thumb.php?f=beans.jpg&w=400
$file = basename($_GET['f']);
$w    = min((int) $_GET['w'], 1600);
$out  = "cache/thumbs/{\$w}-{\$file}";

if (!file_exists($out)) {
    $src = imagecreatefromjpeg("img/$file");
    $h   = (int) ($w * imagesy($src) / imagesx($src));
    $dst = imagescale($src, $w, $h);
    imagejpeg($dst, $out, 75);
}
header('Content-Type: image/jpeg');
readfile($out);
// No srcset, no WebP/AVIF, no lazy loading,
// and the <img> tag reserves no space (CLS).`,
      ts: `// app/products/page.tsx
import Image from 'next/image';

export default function ProductsPage() {
  return (
    <Image
      src="/img/beans.jpg"
      alt="House blend beans"
      width={400}
      height={300}
      // lazy by default; srcset + WebP/AVIF automatic
    />
  );
}`,
      note: "next/image is your thumb.php generalized: on-demand resize, format negotiation (WebP/AVIF), caching, srcset, and lazy loading — plus required dimensions so the layout never shifts.",
    },
    {
      label: "Allow-listing remote image hosts",
      intro:
        "Both pipelines will fetch and resize images from another host, so both must restrict which hosts — otherwise the resizer is an open proxy for the whole internet.",
      php: `<?php // thumb.php — resizing remote URLs
$allowed = ['cdn.example.com'];
$url     = $_GET['url'];
$host    = parse_url($url, PHP_URL_HOST);

if (!in_array($host, $allowed, true)) {
    http_response_code(403);
    exit('Host not allowed');
}
// ...download, resize, cache, serve...`,
      ts: `// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.example.com',
        pathname: '/catalog/**',
      },
    ],
  },
};

export default nextConfig;`,
      note: "Same security instinct, declarative form: an unlisted host makes <Image> throw at request time instead of quietly proxying strangers' images through your server.",
      rightLang: "ts",
    },
    {
      label: "Google Fonts: runtime link vs build-time self-hosting",
      intro:
        "Load the Inter font for the whole site. The PHP template points every visitor's browser at Google; the Next layout ships the font files from your own domain.",
      php: `<?php // header.php — every page includes this ?>
<head>
  <!-- Every visitor's browser contacts Google:
       extra DNS + TLS handshake, and their IP
       is sent to a third party (GDPR risk). -->
  <link rel="preconnect"
        href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap"
        rel="stylesheet">
</head>`,
      ts: `// app/layout.tsx
import { Inter } from 'next/font/google';

// Font CSS + .woff2 downloaded ONCE, at build time,
// then served from YOUR domain like any static asset.
const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}`,
      note: "next/font moves the Google request from every visitor's browser to your build machine: faster first paint, no third-party leak, and metric-adjusted fallbacks that avoid font-swap layout shift.",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Read the page and predict the rendered HTML: which <img> gets loading=\"lazy\", which one is preloaded instead, where the src URLs point, and what the font's className does. Then compare with the output.",
    code: `// app/page.tsx
import Image from 'next/image';
import { Inter } from 'next/font/google';
import hero from './hero.jpg'; // static import — 1600x900, read at build time

const inter = Inter({ subsets: ['latin'] });

export default function Page() {
  return (
    <main className={inter.className}>
      <h1>Fresh from the roastery</h1>

      {/* Above the fold — the LCP candidate */}
      <Image src={hero} alt="Roastery floor" preload />

      {/* Below the fold */}
      <Image src="/beans.jpg" alt="House blend" width={400} height={300} />
    </main>
  );
}`,
    output: `<!-- Rendered HTML (attributes abridged) -->
<main class="__className_a1b2c3">   <!-- next/font's generated class: font-family: Inter + tuned fallback -->
  <h1>Fresh from the roastery</h1>

  <!-- static import: width/height inferred at build;
       preload => not lazy, plus a <link rel="preload" as="image"> in the <head> -->
  <img alt="Roastery floor" width="1600" height="900"
       decoding="async"
       srcset="/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fhero.9f21c0.jpg&w=1920&q=75 1x,
               /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fhero.9f21c0.jpg&w=3840&q=75 2x"
       src="/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fhero.9f21c0.jpg&w=3840&q=75">

  <!-- explicit width/height reserve a 4:3 box (no CLS); lazy is the default -->
  <img alt="House blend" loading="lazy" width="400" height="300"
       decoding="async"
       srcset="/_next/image?url=%2Fbeans.jpg&w=640&q=75 1x,
               /_next/image?url=%2Fbeans.jpg&w=828&q=75 2x"
       src="/_next/image?url=%2Fbeans.jpg&w=828&q=75">
</main>

<!-- Both src URLs hit the optimizer endpoint: it resizes, caches, and serves
     WebP or AVIF when the browser's Accept header allows it — the .jpg in the
     URL may well arrive as AVIF bytes. -->`,
  },

  keyPoints: [
    "`next/image` routes the `src` through `/_next/image`: on-demand resizing with `srcset`, WebP/AVIF via `Accept`-header negotiation, result caching, and `loading=\"lazy\"` by default.",
    "`width`/`height` (or `fill` inside a `position: relative` parent) are REQUIRED so the box is reserved before the bytes arrive — that's the CLS fix; omitting both is an error.",
    "Statically imported images (`import hero from './hero.jpg'`) get dimensions for free at build time and can use `placeholder=\"blur\"`; remote URLs need explicit dimensions AND a `remotePatterns` entry in `next.config.ts`.",
    "Add `preload` — Next 16's rename of the now-deprecated `priority` — to the above-the-fold LCP image: it disables lazy loading and injects a `<link rel=\"preload\" as=\"image\">` into the head. It does NOT set `fetchpriority` on the `<img>`.",
    "`next/font/google` downloads font CSS and `.woff2` files at BUILD time and self-hosts them — zero runtime requests to Google (faster, and GDPR-safe), applied via `className` or a CSS `variable`.",
    "Interview framing: both components exist because Core Web Vitals (LCP, CLS) are Google ranking factors — images and fonts are the usual culprits.",
  ],

  interview: [
    {
      q: "What does next/image actually do, and why does it insist on width and height?",
      a: "It renders an `<img>` whose src points at Next's image optimizer, which resizes the source to device-appropriate widths with a generated `srcset`, converts to WebP or AVIF based on the browser's `Accept` header, caches results, and lazy-loads by default. It's the thumbnail-script-plus-cache-directory every PHP shop has written, absorbed into the framework. Width and height are mandatory (or `fill` inside a sized relative parent) because that's how it prevents Cumulative Layout Shift — the browser reserves the correct aspect-ratio box before a single byte of image arrives. For the above-the-fold hero I'd add `preload` — Next 16's rename of the old `priority` prop — so it skips lazy loading and gets a preload link in the head, since that image is usually the LCP element.",
    },
    {
      q: "Why does next/font exist when a <link> to Google Fonts is one line?",
      a: "Three reasons. Performance: the `<link>` costs every visitor a third-party DNS lookup and TLS handshake before text can render in the right font; `next/font` downloads the CSS and woff2 files at build time and serves them from your own domain as static assets. Privacy: no visitor request ever reaches Google — relevant since a 2022 German court ruling found that runtime Google Fonts embedding violates the GDPR. Stability: it auto-adjusts the fallback font's metrics so the swap to the web font doesn't shift the layout, protecting CLS. You use it by calling the font loader — `const inter = Inter({ subsets: ['latin'] })` — and applying `inter.className`, or exposing a CSS variable with the `variable` option.",
    },
    {
      q: "You add a remote CMS image to <Image> and get an error. What's going on?",
      a: "Two separate requirements for remote images. First, the hostname must be allow-listed under `images.remotePatterns` in `next.config.ts` — otherwise the optimizer would be an open proxy that anyone could use to funnel arbitrary internet images through my server, so Next refuses unlisted hosts. Second, Next can't read a remote file at build time, so I must supply `width` and `height` myself (they only need the right aspect ratio) or use `fill`. It's the same allow-list discipline I'd apply to a PHP resize script that accepts a `?url=` parameter, just enforced by the framework.",
    },
  ],

  quiz: [
    {
      question:
        "Why does next/image require width and height (or fill) on every image?",
      options: [
        "To decide which image format (WebP vs AVIF) to serve",
        "So the browser can reserve the correct box before the image loads, preventing Cumulative Layout Shift",
        "Because the optimizer can't resize without exact target pixels",
        "To calculate the lazy-loading threshold",
      ],
      answerIndex: 1,
      explain:
        "The dimensions establish the aspect ratio so space is reserved in the layout before the bytes arrive — that's the CLS fix. Format choice comes from the Accept header, and the optimizer generates multiple widths for the srcset regardless.",
    },
    {
      question:
        "What happens at runtime when a page uses a font from next/font/google?",
      options: [
        "The browser fetches the font CSS from fonts.googleapis.com with a preconnect hint",
        "The font is fetched from Google only on the first visit, then cached by a service worker",
        "Nothing reaches Google — the font files were downloaded at build time and are served from your own domain",
        "The server proxies each font request to Google to hide the visitor's IP",
      ],
      answerIndex: 2,
      explain:
        "next/font downloads the CSS and .woff2 files during the build and self-hosts them alongside your static assets, so at runtime the browser never contacts Google — faster, and GDPR-friendly.",
    },
    {
      question:
        "Why must remote image hosts be listed in images.remotePatterns?",
      options: [
        "So Next can read their dimensions at build time",
        "To enable AVIF, which is only supported for allow-listed hosts",
        "Because remote images can't be lazy-loaded otherwise",
        "Without an allow-list the optimizer would be an open proxy anyone could use to resize arbitrary images through your server",
      ],
      answerIndex: 3,
      explain:
        "The optimizer downloads and processes whatever URL the <Image> src names. An allow-list stops third parties from abusing your compute and bandwidth. Dimensions are a separate concern — you must pass width/height for remote images regardless.",
    },
  ],
};

export default lesson;
