import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "parallel-and-intercepting",
  title: "Parallel & Intercepting Routes",
  part: "Routing & Navigation",
  estMinutes: 10,
  summary:
    "Two advanced folder conventions worth recognizing on sight: @slot folders render multiple independent pages inside one layout, and (.)folder interceptors render another route in place — the pattern behind every photo-in-a-modal UI.",

  concept: `
This is a survey section. Nobody expects you to hand-build these in a
whiteboard interview — but "do you know what an \`@folder\` or a \`(.)folder\`
means, and when you'd reach for them?" is a genuine screening question, because
they're the App Router features that have **no equivalent anywhere else**.

### Parallel routes: @slot folders

A dashboard usually isn't one page — it's several independent panels. In PHP
you'd compose it: one page script includes a couple of widget templates, each
backed by its own query. Parallel routes are that composition, expressed as
folders:

\`\`\`text
app/dashboard/
├── layout.tsx        ← receives children + one prop per slot
├── page.tsx          → the children prop
├── @analytics/
│   ├── page.tsx      → the analytics prop
│   ├── loading.tsx   ← its own skeleton…
│   └── error.tsx     ← …and its own error boundary
└── @team/
    ├── page.tsx      → the team prop
    └── default.tsx   ← fallback (more below)
\`\`\`

The layout receives each slot as a **named prop** and decides where everything
goes:

\`\`\`tsx
// app/dashboard/layout.tsx
export default function Layout({
  children,
  analytics,
  team,
}: {
  children: React.ReactNode;
  analytics: React.ReactNode;
  team: React.ReactNode;
}) {
  return (
    <div className="grid">
      {children}
      <aside>{analytics}</aside>
      <aside>{team}</aside>
    </div>
  );
}
\`\`\`

Two facts to keep straight:

- **Slots are not URL segments.** \`/dashboard\` renders all three; there is no
  \`/dashboard/@analytics\` URL. (\`children\` is itself an implicit slot.)
- **Each slot is independent**: its own \`loading.tsx\` and \`error.tsx\`, its own
  streaming. A crashed analytics panel shows its error card while the team
  panel keeps working — sub-controllers with isolated failure, for free.

**\`default.tsx\`** is the fallback a slot renders when the current URL has no
match for it — most importantly on a **hard navigation** (full page load),
where Next can't reuse what a slot was previously showing. No match and no
\`default.tsx\` means a 404 for the whole route.

### Intercepting routes: (.)folder

The canonical demo: a photo grid. Click a photo and a modal opens **over the
grid** — but the URL becomes \`/photo/42\`, so refreshing, or opening the link
in a new tab, shows the full standalone photo page. One route, two renderings,
picked by *how you arrived*:

- **Soft navigation** (a \`<Link>\` click within the app) → the interceptor
  renders: modal over the current layout.
- **Hard navigation** (refresh, direct visit, shared link) → the real
  \`/photo/[id]/page.tsx\` renders.

The convention names the folder after the route it intercepts, prefixed by a
relative-path marker: \`(.)\` same level, \`(..)\` one level up, \`(..)(..)\` two
up, \`(...)\` from the app root. In practice it's combined with a parallel slot:

\`\`\`text
app/
├── layout.tsx                  ← renders {children} and {modal}
├── @modal/
│   ├── default.tsx             ← renders null when no modal is open
│   └── (.)photo/[id]/page.tsx  ← the INTERCEPTED render (the modal)
├── photo/[id]/page.tsx         ← the real page (hard navigations)
└── page.tsx                    ← the photo grid
\`\`\`

One subtlety: the matcher counts **route segments**, not folders — \`@modal\` is
a slot, not a segment, so from inside it, \`photo\` is still a sibling and gets
\`(.)\`.

Your PHP instinct for this pattern was \`?modal=photo&id=42\` — a query-param
flag every page had to check, with no way to make a refresh show a *different,
full* page. Interception gives you shareable, refreshable URLs where the modal
is a progressive enhancement.

### What to say in an interview

"Parallel routes render multiple pages in one layout via \`@slot\` folders that
arrive as layout props, each with independent loading/error states, with
\`default.tsx\` as the unmatched fallback. Intercepting routes render another
route inside the current layout on soft navigation — combined with a slot,
that's the photo-modal pattern." That paragraph is the expected depth.
`,

  comparisons: [
    {
      label: "Dashboard panels: widget includes vs layout slots",
      intro:
        "One dashboard, three independent panels. PHP composes with includes inside the page; Next.js composes with folders, and the layout receives each panel as a prop.",
      php: `<?php // dashboard.php
// Composition by include — each widget runs its own query.
// One fatal error in a widget kills the entire page,
// and the page renders only when ALL queries finish.
require 'widgets/main.php';

echo '<aside>';
require 'widgets/analytics.php';
echo '</aside>';

echo '<aside>';
require 'widgets/team.php';
echo '</aside>';`,
      ts: `// app/dashboard/layout.tsx
// Slots come from @analytics/ and @team/ folders.
// Each streams independently and has its OWN
// loading.tsx and error.tsx.
export default function Layout({
  children,
  analytics,
  team,
}: {
  children: React.ReactNode;
  analytics: React.ReactNode;
  team: React.ReactNode;
}) {
  return (
    <div className="grid">
      {children}
      <aside>{analytics}</aside>
      <aside>{team}</aside>
    </div>
  );
}`,
      note: "Same composition idea, but the slots fail and load independently: a slow analytics query shows its own skeleton and a crash shows its own error card while the rest of the dashboard works.",
    },
    {
      label: "Photo modal: query-param hack vs interception",
      intro:
        "Click a photo in a grid, see it in a modal, and have the URL be shareable. PHP fakes it with a query param; Next.js gives the modal and the standalone page different renders of the same URL.",
      php: `<?php // gallery.php
// /gallery.php?modal=photo&id=42 — every render of the
// grid must ALSO check the flag and paint the overlay.
// A refresh re-renders grid + overlay; there is no
// standalone photo page unless you build a second one.
require 'grid.php';

if (($_GET['modal'] ?? '') === 'photo') {
    $photo = load_photo((int) $_GET['id']);
    require 'photo-overlay.php';
}`,
      ts: `// app/@modal/(.)photo/[id]/page.tsx
// Renders ONLY on soft navigation from within the app:
// the modal, over whatever layout you were viewing.
import { Modal } from '@/ui/modal';
import { Photo } from '@/ui/photo';

export default async function PhotoModal({
  params,
}: PageProps<'/photo/[id]'>) {
  const { id } = await params;
  return (
    <Modal>
      <Photo id={id} />
    </Modal>
  );
}

// app/photo/[id]/page.tsx — the SAME URL on refresh or
// direct visit renders this full standalone page instead.`,
      note: "The URL /photo/42 is real and shareable: a Link click intercepts it into the modal, while a hard refresh or new tab renders the full page — behavior a query-param flag can't express.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature route resolver for a tree with a @modal slot and a (.)photo interceptor. Predict the slot-to-file mapping for each navigation — especially how /photo/42 differs between a Link click and a hard refresh — then run it.",
    code: `// The route tree, as data. In the real App Router the folder
// names ARE this table.
const tree = {
  pages: {
    '/': 'app/page.tsx',
    '/photo/[id]': 'app/photo/[id]/page.tsx',
  },
  slots: {
    '@modal': {
      interceptors: { '/photo/[id]': 'app/@modal/(.)photo/[id]/page.tsx' },
      defaultFile: 'app/@modal/default.tsx',
    },
  },
};

function matchPattern(url: string): string | undefined {
  if (url in tree.pages) return url;
  if (/^\\/photo\\/[^/]+$/.test(url)) return '/photo/[id]';
  return undefined;
}

// The layout renders { children, modal } — resolve what fills each
// slot for a given URL and navigation type.
function resolve(url: string, nav: 'soft' | 'hard') {
  const pattern = matchPattern(url);
  if (!pattern) return { children: '404', modal: '404' };

  const modalSlot = tree.slots['@modal'];
  const interceptor = modalSlot.interceptors[pattern];

  if (nav === 'soft' && interceptor) {
    // Intercepted: current page stays as children, modal fills.
    return { children: '(previous page, e.g. app/page.tsx)', modal: interceptor };
  }
  // Hard navigation (or nothing to intercept): the real page renders
  // and the slot falls back to its default.tsx.
  return { children: tree.pages[pattern], modal: modalSlot.defaultFile };
}

const cases: Array<[string, 'soft' | 'hard']> = [
  ['/', 'hard'],           // initial load of the grid
  ['/photo/42', 'soft'],   // user clicks a <Link> in the grid
  ['/photo/42', 'hard'],   // user hits refresh on the modal
];

for (const [url, nav] of cases) {
  const r = resolve(url, nav);
  console.log(\`\${nav.toUpperCase().padEnd(4)} \${url}\`);
  console.log(\`  children → \${r.children}\`);
  console.log(\`  @modal   → \${r.modal}\`);
}`,
  },

  keyPoints: [
    "Parallel routes: `@analytics`, `@team` folders become **named props on the layout** — multiple pages rendered in one layout, composed like PHP widget includes but with independent streaming.",
    "Slots are not URL segments: `/dashboard` renders all its slots; there is no `/dashboard/@analytics` URL, and `children` is itself an implicit slot.",
    "Each slot carries its own `loading.tsx` and `error.tsx`, so one panel can skeleton or crash without touching the others.",
    "`default.tsx` is a slot's fallback when the URL doesn't match it (critically on hard navigations); a missing default for an unmatched slot 404s the route.",
    "Intercepting routes — `(.)` same level, `(..)` one up, `(...)` from root — render another route inside the current layout on soft navigation; a hard refresh renders the target's real page.",
    "The photo-modal pattern = `@modal` slot + `(.)photo/[id]` interceptor + a real `/photo/[id]` page: same shareable URL, modal on click, full page on refresh.",
  ],

  interview: [
    {
      q: "What are parallel routes in the App Router, and when would you use them?",
      a: "Parallel routes let one layout render multiple pages simultaneously. You create folders prefixed with `@` — say `@analytics` and `@team` inside `app/dashboard` — and the dashboard layout receives each as a named prop alongside `children`, placing them wherever it wants. The win over ordinary components is that each slot is a full route subtree: its own `loading.tsx`, its own `error.tsx`, independent streaming, even its own sub-navigation. I'd reach for them on dashboard-style screens where panels load at different speeds and shouldn't share a failure domain — in PHP terms, widget includes, but where one widget's fatal error can't take down the page. `default.tsx` provides each slot's fallback when the current URL has nothing for it.",
    },
    {
      q: "Explain the photo-modal pattern with intercepting routes.",
      a: "You have a real route, `/photo/[id]`, plus an interceptor at `app/@modal/(.)photo/[id]/page.tsx`. When the user soft-navigates — clicks a `<Link>` from the grid — Next intercepts the navigation and renders the interceptor's page into the `@modal` slot, so a modal appears over the grid while the URL updates to `/photo/42`. If the user refreshes, shares the link, or opens it in a new tab, that's a hard navigation: no interception, and the real standalone page renders. One URL, two presentations, chosen by how you arrived. The `(.)`, `(..)`, and `(...)` prefixes say where the intercepted route lives relative to the interceptor — counted in route segments, so slots like `@modal` don't count as a level.",
    },
    {
      q: "What is default.tsx for in a parallel-route setup?",
      a: "It's the fallback content for a slot that has no match for the current URL. The classic case is a hard navigation: on a client-side navigation Next can keep showing whatever a slot showed before, but on a full page load there's no previous state — so each unmatched slot renders its `default.tsx` instead. If a slot is unmatched and has no `default.tsx`, the whole route 404s. In the modal pattern, `@modal/default.tsx` just returns `null` — 'no modal open' is the default state.",
    },
  ],

  quiz: [
    {
      question: "In app/dashboard/@analytics/page.tsx, what URL does the @analytics content render under?",
      options: [
        "/dashboard/@analytics",
        "/dashboard/analytics",
        "/dashboard — slots are layout props, not URL segments",
        "/analytics",
      ],
      answerIndex: 2,
      explain:
        "The @folder convention creates a slot passed to the parent layout as a prop; it does not create a route segment. Visiting /dashboard renders the page plus every matched slot in the positions the layout chooses.",
    },
    {
      question: "A user has the photo modal open at /photo/42 (opened via a Link click) and hits refresh. What renders?",
      options: [
        "The modal again — the URL determines the UI",
        "The full standalone app/photo/[id]/page.tsx — hard navigations are not intercepted",
        "A 404, because interceptor URLs aren't real routes",
        "The photo grid without any modal",
      ],
      answerIndex: 1,
      explain:
        "Interception only applies to soft (client-side) navigations. On a refresh or direct visit, the router matches the real route, so the standalone photo page renders — which is exactly why the pattern produces shareable URLs.",
    },
    {
      question: "Why does the modal interceptor use (.) in app/@modal/(.)photo/[id] even though @modal is a folder level above photo?",
      options: [
        "It's a typo tolerated by the compiler",
        "Interceptor prefixes count route segments, and @modal is a slot, not a segment — so photo is same-level",
        "(.) always means 'from the app root'",
        "Because [id] is dynamic, only (.) is allowed",
      ],
      answerIndex: 1,
      explain:
        "The (.)/(..) markers are resolved against the route hierarchy, not the file system. Slot folders like @modal don't create segments, so from the interceptor's point of view /photo/[id] is one level, matching (.).",
    },
    {
      question: "What happens on a hard navigation if a parallel slot has no match for the URL and no default.tsx?",
      options: [
        "The slot silently renders nothing",
        "The slot keeps its previous content",
        "The entire route renders a 404",
        "Next.js falls back to the slot's loading.tsx",
      ],
      answerIndex: 2,
      explain:
        "On a hard load there is no previous slot state to keep, so Next needs a fallback; default.tsx provides it. Without one for an unmatched slot, Next can't render the route and returns a 404 — which is why @modal/default.tsx returning null is essential to the modal pattern.",
    },
  ],
};

export default lesson;
