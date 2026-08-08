import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "layouts-and-templates",
  title: "Layouts & Templates",
  part: "Routing & Navigation",
  estMinutes: 12,
  summary:
    "Layouts nest automatically down the folder tree and — unlike PHP includes — persist across navigation without re-rendering; template.tsx is the opt-in escape hatch that remounts per navigation.",

  concept: `
Every PHP app you've maintained had the same skeleton: \`header.php\` at the
top of each page, \`footer.php\` at the bottom, maybe an
\`admin/header.php\` for the back office. The App Router's \`layout.tsx\` is
that idea made structural — but with one behavioral difference that changes
how you think about shared UI.

### The root layout owns the document

Exactly one thing in the app renders \`<html>\` and \`<body>\`: the root
\`app/layout.tsx\`. It's required, it wraps every route, and it's where the
global chrome lives:

\`\`\`tsx
// app/layout.tsx
export default function RootLayout(
  { children }: { children: React.ReactNode }
) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
\`\`\`

### Layouts nest by folder

Add \`app/dashboard/layout.tsx\` and every route under \`/dashboard\` renders
inside it — which itself renders inside the root layout. Nothing is wired
up manually; nesting follows the folders:

\`\`\`
RootLayout → DashboardLayout → page
\`\`\`

For \`/dashboard/settings\`, the settings page is handed to the dashboard
layout as \`children\`, whose output is handed to the root layout as
\`children\`. It's \`require 'header.php'\` turned inside out: pages don't
pull the chrome in; the chrome wraps the pages.

### The key difference: layouts PERSIST

\`header.php\` re-executes on every request — its "state" dies with the
response. A layout does not. Navigating from \`/dashboard/settings\` to
\`/dashboard/billing\` **does not re-render** \`DashboardLayout\` or the root
layout: they stay mounted, and any client components inside them keep their
state. The open sidebar stays open, the search box keeps its text, the
video keeps playing. Only the segment that changed — the page — is swapped.
This is what "soft navigation" preserves, and it's the single most
interview-quotable fact about layouts.

### \`template.tsx\`: opt back into remounting

Sometimes you *want* per-navigation resets — clear a form, re-run a
\`useEffect\`, replay an enter animation. A \`template.tsx\` sits between a
layout and its children and gets a **new key whenever the active segment
at its level changes**, so it (and everything inside) remounts: client
state resets, effects re-synchronize, DOM is recreated. Two boundary
cases: navigations within *deeper* segments don't remount higher-level
templates, and search-param changes never trigger a remount. Layout =
persistent shell; template = fresh-per-navigation wrapper. Reach for
\`template\` only when you need the reset — persistence is the better
default.

### Layouts can't pass data down

A layout receives \`children\` as an already-decided slot — there's no prop
channel from a layout to its page (they render independently; pages can
even stream in before or after the layout finishes). Coming from PHP, where
\`header.php\` could set \`$user\` for the page body to use, this feels like
a loss. The idiom instead: **fetch in both places**. If the layout and the
page both call \`getUser()\`, React's request memoization dedupes identical
\`fetch\` calls within one render pass — two call sites, one real request.
No globals, no prop drilling, no double query.
`,

  comparisons: [
    {
      label: "Shared chrome: includes vs nested layouts",
      intro:
        "A dashboard shell around every dashboard page. The PHP include re-runs top to bottom on each request; the layout mounts once and stays.",
      php: `<?php // dashboard/settings.php
require '../header.php';        // re-executed EVERY request
require 'dashboard-nav.php';    // sidebar rebuilt from zero;
                                // its collapsed/expanded state
                                // lives in a cookie, if anywhere
?>

<h1>Settings</h1>

<?php
require '../footer.php';
// dashboard/billing.php repeats all four lines —
// forget one and that page has no chrome.`,
      ts: `// app/dashboard/layout.tsx — wraps EVERY /dashboard/* page
import { Sidebar } from './sidebar'; // a client component

export default function DashboardLayout(
  { children }: { children: React.ReactNode }
) {
  return (
    <div className="shell">
      <Sidebar />   {/* keeps its open/closed state across pages */}
      <main>{children}</main>
    </div>
  );
}

// app/dashboard/settings/page.tsx — just the page
export default function SettingsPage() {
  return <h1>Settings</h1>;
}
// Navigating settings → billing swaps only <main>'s contents;
// the layout and Sidebar never re-render.`,
      note: "The include re-executes per request and pages must remember to pull it in; the layout wraps pages automatically and PERSISTS across navigation — client state in the shell survives page changes.",
    },
    {
      label: "Per-navigation reset: free in PHP, opt-in via template.tsx",
      intro:
        "A feedback form should start blank on every page you visit. PHP gets that for free (everything resets); Next.js layouts deliberately don't — template.tsx brings it back.",
      php: `<?php // any-page.php
// Nothing to do: every request is a clean slate.
// The form below is empty on every page load because
// the whole page — chrome included — was rebuilt.
require 'header.php';
?>

<form method="post" action="/feedback.php">
  <textarea name="message"></textarea>
  <button>Send feedback</button>
</form>`,
      ts: `// app/(support)/template.tsx — remounts as you move between
// the support pages (its child segment changes each time)
export default function SupportTemplate(
  { children }: { children: React.ReactNode }
) {
  return <div className="fade-in">{children}</div>;
}

// Next.js renders it as:
//   <Layout><Template key={routeParam}>{children}</Template></Layout>
// The fresh key per navigation means everything inside remounts:
// client state resets (the form clears), useEffect re-runs,
// enter animations replay. A layout.tsx here would keep the
// half-typed message as you moved between support pages.`,
      note: "PHP resets everything by default and persistence is the extra work; Next.js persists by default and template.tsx is the opt-in reset — same needs, inverted defaults.",
    },
    {
      label: "Sharing data between chrome and page",
      intro:
        "Both the shell and the page need the current user. PHP shares it through include scope; a layout can't pass props to its page — so both fetch, and memoization dedupes.",
      php: `<?php // header.php
$user = getUserFromSession($pdo); // one query...
echo '<nav>Hi, '
  . htmlspecialchars($user['name'])
  . '</nav>';

// profile.php
require 'header.php';
// ...shared via include scope: $user just
// exists here. Convenient — and the reason
// renaming it breaks 40 files.
echo '<h1>' . $user['email'] . '</h1>';`,
      ts: `// lib/user.ts
import 'server-only';

export async function getUser() {
  // Identical fetch calls in one render pass are
  // memoized by React — called twice, requested once.
  const res = await fetch('https://api.example.com/me');
  return res.json() as Promise<{ name: string; email: string }>;
}

// app/dashboard/layout.tsx
//   const user = await getUser();   // call #1
// app/dashboard/profile/page.tsx
//   const user = await getUser();   // call #2 — deduped

// No prop channel exists from layout to page — they render
// independently. Fetch where you need the data instead.`,
      note: "PHP's include-scope sharing is implicit coupling; the App Router forbids it and compensates with request memoization — same render pass, same fetch, one network call. (DB queries can get the same behavior via React's cache().)",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Three files, one request. Compose the tree for /dashboard/settings in your head — which component wraps which, and where does the page land? — then check the rendered HTML. Then ask: navigating to /dashboard/billing, which parts re-render?",
    code: `// app/layout.tsx — the root layout: owns <html> and <body>
export default function RootLayout(
  { children }: { children: React.ReactNode }
) {
  return (
    <html lang="en">
      <body>
        <header>Acme Inc</header>
        {children}
      </body>
    </html>
  );
}

// app/dashboard/layout.tsx — nests automatically inside the root
export default function DashboardLayout(
  { children }: { children: React.ReactNode }
) {
  return (
    <section className="dashboard">
      <nav>Overview | Settings | Billing</nav>
      {children}
    </section>
  );
}

// app/dashboard/settings/page.tsx — the leaf for /dashboard/settings
export default function SettingsPage() {
  return <h1>Settings</h1>;
}`,
    output: `<!-- Rendered HTML for GET /dashboard/settings -->
<html lang="en">
  <body>
    <header>Acme Inc</header>
    <section class="dashboard">
      <nav>Overview | Settings | Billing</nav>
      <h1>Settings</h1>
    </section>
  </body>
</html>

<!-- Navigating to /dashboard/billing swaps ONLY the <h1> slot:
     both layouts (and any client state inside them) stay mounted. -->`,
  },

  keyPoints: [
    "Exactly one root layout (`app/layout.tsx`) renders `<html>` and `<body>`; it's required and wraps every route.",
    "Layouts nest automatically by folder: `/dashboard/settings` renders as RootLayout → DashboardLayout → page, each receiving the next as `children`.",
    "Layouts PERSIST across navigation — they don't re-render, and client components inside them keep their state; only the changed segments swap.",
    "`template.tsx` sits between a layout and its children and gets a new key when its segment changes, remounting its subtree: state resets, effects re-run, animations replay (deeper-segment navigations and search-param changes don't remount it).",
    "Layouts cannot pass data to their pages — fetch in both places and let request memoization dedupe identical `fetch` calls within a render pass.",
    "PHP anchor: `layout.tsx` is `header.php`/`footer.php` turned inside out — the chrome wraps pages instead of pages including chrome — and it survives navigation instead of re-executing.",
  ],

  interview: [
    {
      q: "What's the difference between a layout and a template in the App Router?",
      a: "Both wrap a segment's children, but they differ in lifecycle. A layout mounts once and persists across navigation within its segment: moving from `/dashboard/settings` to `/dashboard/billing` doesn't re-render the dashboard layout, and client components inside it — an expanded sidebar, a search box — keep their state. A template is rendered between the layout and the children with a key tied to its segment, so when the active segment at its level changes — navigating between sibling pages, or a dynamic param changing — its subtree remounts: client state resets, `useEffect` re-synchronizes, DOM is recreated. (Navigations in deeper segments don't remount higher-level templates, and search-param changes never do.) I default to layouts and reach for `template.tsx` only when I explicitly need per-navigation behavior — clearing forms, replaying enter animations, re-running effects. Coming from PHP it's an inversion: includes reset everything each request by default, while Next.js persists by default and makes the reset opt-in.",
    },
    {
      q: "Your layout fetched the current user. How does the page below it get that data?",
      a: "It doesn't get it from the layout — there is no prop channel from a layout to its page. They render independently (and can stream independently), and the layout just receives the page's output as `children`. The idiom is to fetch in both places: the layout calls `getUser()`, the page calls `getUser()`, and React's request memoization deduplicates identical `fetch` calls within a single render pass, so two call sites cost one network request. For non-fetch data sources like direct database queries, wrapping the function in React's `cache()` gives the same per-request memoization. It replaces PHP's include-scope sharing — where `header.php` sets `$user` and every page silently depends on it — with explicit calls that are safe to add or remove per file.",
    },
    {
      q: "Why does the root layout have to render <html> and <body>, and what happens on navigation to those elements?",
      a: "The App Router doesn't have a separate document wrapper — the root layout IS the document. It's the one required layout, it defines `<html>` and `<body>`, and everything else in the app renders into its `children`. Because layouts persist, the document shell is created once and then never torn down during client-side navigation: Next.js swaps only the route segments that changed beneath it. That's what makes soft navigation possible — global providers, analytics scripts, and theme state in the root layout survive every page change. The exception is multiple root layouts via route groups: crossing from one root layout to another must replace `<html>` itself, so that navigation is a full page load.",
    },
  ],

  quiz: [
    {
      question:
        "A user navigates from /dashboard/settings to /dashboard/billing. What happens to app/dashboard/layout.tsx?",
      options: [
        "It re-renders, like every parent of a changed route",
        "It stays mounted and does not re-render; only the page segment swaps",
        "It remounts, resetting any client state inside it",
        "It re-renders only if it contains client components",
      ],
      answerIndex: 1,
      explain:
        "Persistence is the defining layout behavior: on soft navigation, layouts above the changed segment stay mounted with their state intact, and only the segments below the change are replaced. Remount-on-navigation is what template.tsx opts into.",
    },
    {
      question:
        "You want a search input inside a shared wrapper to CLEAR every time the user navigates between results pages. Which file convention gives you that?",
      options: [
        "layout.tsx — layouts re-render on each navigation",
        "template.tsx — it receives a new key when its segment changes, remounting its subtree",
        "page.tsx with export const dynamic = 'force-dynamic'",
        "loading.tsx wrapping the search input",
      ],
      answerIndex: 1,
      explain:
        "A template's key tracks the active segment at its level, so moving between sibling results pages changes the key and everything inside remounts: client state (the input's text) resets and effects re-run. A layout would preserve the text — that's exactly its job. dynamic and loading control rendering and pending UI, not remounting.",
    },
    {
      question:
        "Both a layout and its page call the same getUser() helper that fetches /api/me. How many network requests happen during one render pass?",
      options: [
        "Two — each component fetches independently",
        "One — React's request memoization dedupes identical fetch calls in a render pass",
        "Zero — layouts pass fetched data to pages automatically",
        "Two, unless you enable cacheComponents in next.config.ts",
      ],
      answerIndex: 1,
      explain:
        "Identical fetch calls (same URL and options) within a single render pass are memoized, so fetching in both the layout and the page is the recommended pattern — there's no layout-to-page prop channel. This is per-render deduplication, unrelated to the persistent caching that cacheComponents/'use cache' governs.",
    },
  ],
};

export default lesson;
