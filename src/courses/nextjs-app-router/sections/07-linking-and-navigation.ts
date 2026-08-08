import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "linking-and-navigation",
  title: "Linking & Navigation",
  part: "Routing & Navigation",
  estMinutes: 11,
  summary:
    "<Link> gives you prefetched, layout-preserving soft navigation; useRouter, usePathname, and useSearchParams (all from next/navigation) cover programmatic cases; redirect() handles the server side.",

  concept: `
In a classic PHP app every \`<a href>\` is a demolition job: the browser tears
down the page, the server rebuilds everything — header, nav, sidebar, the
lot — and ships it back. Next.js keeps the building standing and swaps one
room: layouts stay mounted, client state survives, and only the changed
route segment is fetched and rendered. That's **soft navigation**, and
\`<Link>\` is how you get it.

### \`<Link>\`: the default way to navigate

\`\`\`tsx
import Link from 'next/link';

<Link href="/blog/server-components">Read the post</Link>
\`\`\`

It renders a real \`<a>\` (middle-click, open-in-new-tab, and crawlers all
work), but intercepts normal clicks and performs a client-side transition.
Two behaviors to name in an interview:

- **Prefetching.** In production, when a \`<Link>\` scrolls into the
  viewport, Next.js prefetches the target route in the background — so the
  click feels instant. It's automatic; disable per-link with
  \`prefetch={false}\`.
- **Soft navigation.** Shared layouts don't re-render or lose state. Only
  the segments below the changed one are replaced.

### Programmatic navigation: \`useRouter\`

For "navigate after this async thing succeeds" you need the hook — and it
**must** come from \`next/navigation\`. There is an older \`useRouter\` in
\`next/router\`; that's the Pages Router API with a different shape, and
importing it in the App Router is a classic interview trap and runtime error.

\`\`\`tsx
'use client';
import { useRouter } from 'next/navigation';

const router = useRouter();
router.push('/dashboard');     // adds a history entry
router.replace('/login');      // swaps the current entry (no Back to it)
router.back();                 // history back
router.refresh();              // re-runs Server Components, keeps client state
\`\`\`

\`router.refresh()\` deserves special attention: it re-fetches the current
route's server-rendered payload **without** a full browser reload — React
state, focus, and scroll survive while server data updates. It's your
"the data changed, re-pull it" tool after a mutation.

### Reading the current URL

In Client Components: \`usePathname()\` returns the path
(\`'/blog/hello'\`), and \`useSearchParams()\` returns a read-only
\`URLSearchParams\` — the typed replacement for \`$_GET\`. In a **page**
Server Component, the query string arrives as the \`searchParams\` prop
instead — a Promise in Next 16, so \`await props.searchParams\`.

### Redirecting on the server

\`redirect('/login')\` from \`next/navigation\` is the App Router's
\`header('Location: ...'); exit;\` — usable in Server Components, Server
Actions, and route handlers. It works by **throwing**, so code after it
never runs and you don't need the \`exit\` discipline PHP drilled into you.
\`permanentRedirect()\` issues the 308 variant for moved-forever URLs.

One rule ties it together: \`<Link>\` for anything the user clicks,
\`useRouter\` for navigation triggered by code on the client, \`redirect()\`
for navigation decided on the server.
`,

  comparisons: [
    {
      label: "A link between pages",
      intro:
        "Navigate from a blog index to a post. In PHP the whole page is rebuilt; in Next.js the layout stays mounted and only the page segment swaps.",
      php: `<?php // blog.php — every click is a full round trip
require 'header.php';   // re-executed on EVERY navigation
?>

<a href="/post.php?slug=server-components">
  Read the post
</a>

<?php
// Click → browser unloads the page, server re-runs
// header.php, nav state and scroll position are gone.
require 'footer.php';`,
      ts: `// app/blog/page.tsx — a Server Component
import Link from 'next/link';

export default function BlogIndex() {
  return (
    <ul>
      <li>
        <Link href="/blog/server-components">
          Read the post
        </Link>
      </li>
    </ul>
  );
}

// Renders a real <a>. In production the route is prefetched
// when the link enters the viewport; on click, the layout
// stays mounted and only the page segment is replaced.`,
      note: "Both render an anchor tag — but <Link> intercepts the click for a soft navigation: no teardown, persistent layouts, and viewport prefetching that makes the transition feel instant.",
    },
    {
      label: "Redirecting when a check fails",
      intro:
        "An account page bounces anonymous visitors to /login. Same intent, same HTTP mechanism underneath — different ergonomics.",
      php: `<?php // account.php
session_start();

if (!isset($_SESSION['user_id'])) {
  header('Location: /login');
  exit; // forget this and the page body
        // still executes and leaks below
}

echo 'Welcome back, user #'
  . $_SESSION['user_id'];`,
      ts: `// app/account/page.tsx — a Server Component
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function AccountPage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
    // no exit needed: redirect() THROWS,
    // so nothing below ever runs
  }

  return <h1>Welcome back, user #{session.userId}</h1>;
}`,
      note: "redirect() throws a special error Next.js catches and turns into the redirect response — the 'header() then exit' pair collapses into one call you can't get wrong. Never wrap it in a try/catch that swallows it.",
    },
    {
      label: "Reading the query string",
      intro:
        "A search page reads ?q= and renders the term. $_GET becomes useSearchParams in client code — or the searchParams prop (a Promise) in a page.",
      php: `<?php // search.php
// $_GET is a raw array of strings —
// missing keys are warnings, everything untyped.
$q    = $_GET['q']    ?? '';
$page = (int) ($_GET['page'] ?? 1);

echo 'Results for: '
  . htmlspecialchars($q)
  . ' (page ' . $page . ')';`,
      ts: `// app/search/search-box.tsx
'use client';
import { useSearchParams } from 'next/navigation';

export function SearchBox() {
  const params = useSearchParams();      // ReadonlyURLSearchParams
  const q = params.get('q') ?? '';       // string | null — typed!
  const page = Number(params.get('page') ?? '1');

  return <p>Results for: {q} (page {page})</p>;
}

// In a page Server Component, use the prop instead:
//   const { q } = await props.searchParams;   // Promise in 16`,
      note: "useSearchParams returns a read-only URLSearchParams whose .get() is string | null — the missing-parameter case is in the type, not in your error log. Server pages get searchParams as an awaited prop instead.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "useRouter semantics as a plain history stack. [brackets] mark the current entry. Predict the stack after each operation — especially what replace() does to the Back button, and what push() does to 'forward' entries.",
    code: `// A mini history-stack simulator mirroring useRouter semantics:
// push = new entry, replace = swap current entry, back = step back.

const stack: string[] = ['/'];
let index = 0;

function print(op: string) {
  const rendered = stack
    .map((path, i) => (i === index ? '[' + path + ']' : path))
    .join('  ->  ');
  console.log(op.padEnd(50) + rendered);
}

function push(path: string) {
  stack.splice(index + 1);      // a new entry drops any "forward" history
  stack.push(path);
  index = stack.length - 1;
  print("router.push('" + path + "')");
}

function replace(path: string) {
  stack[index] = path;          // current entry swapped — no new entry
  print("router.replace('" + path + "')");
}

function back() {
  if (index > 0) index--;
  print('router.back()');
}

print('initial load');
push('/blog');
push('/blog/hello-world');
replace('/blog/hello-world?tab=comments'); // e.g. tab state: Back should skip it
back();                                    // lands on /blog, not the pre-replace URL
push('/about');                            // forward entry is gone

// Note what replace() bought us: Back from the post did NOT stop at
// the tab-less URL first. Use replace for login redirects and URL-held
// UI state; use push for real navigations the user expects to Back out of.`,
  },

  keyPoints: [
    "`<Link>` renders a real `<a>` but performs soft navigation: layouts stay mounted, client state survives, and in production the route is prefetched when the link enters the viewport.",
    "`useRouter` comes from `next/navigation` — `next/router` is the Pages Router API and will not work in the App Router.",
    "`router.push()` adds a history entry; `router.replace()` swaps the current one — use replace for redirects and URL-held UI state you don't want on the Back stack.",
    "`router.refresh()` re-runs the current route's Server Components and refetches data without a full reload — client state, focus, and scroll survive.",
    "Read the URL with `usePathname()` / `useSearchParams()` in Client Components, or `await props.searchParams` in a page Server Component.",
    "`redirect()` (and `permanentRedirect()`) is the server-side tool — it throws, so unlike `header('Location: ...')` there's no `exit` to forget.",
  ],

  interview: [
    {
      q: "What actually happens when a user clicks a <Link> in the App Router, compared to a plain <a>?",
      a: "A plain `<a>` triggers a full document navigation — the browser unloads the page and the server rebuilds everything, exactly like every PHP page load. `<Link>` renders a real anchor for accessibility and SEO, but intercepts the click and performs a soft navigation: Next.js fetches just the RSC payload for the changed route segments, swaps them in, and leaves shared layouts mounted with their state intact. On top of that, in production builds Next.js prefetches routes for links as they enter the viewport, so the payload is often already cached when the click happens. The result is PHP's simple anchor mental model with SPA-grade transitions for free.",
    },
    {
      q: "When do you reach for router.refresh(), and how is it different from a full reload?",
      a: "`router.refresh()` tells Next.js to re-run the current route's Server Components on the server and merge the fresh payload in — without a browser reload. Client component state, focus, and scroll position all survive; only the server-rendered data updates. The classic use is after a mutation: I call an API or Server Action that changes data, then `router.refresh()` so the page reflects it. (Server Actions that call `revalidatePath` often make even that unnecessary.) A full reload, by contrast, tears down the whole React tree and re-bootstraps the app — the thing the App Router exists to avoid.",
    },
    {
      q: "How do you redirect a user on the server in the App Router, and what's the gotcha with try/catch?",
      a: "`redirect('/login')` from `next/navigation`, usable in Server Components, Server Actions, and route handlers — it's the equivalent of PHP's `header('Location: ...'); exit;` in one call. It works by throwing a special control-flow error that Next.js catches and converts into the redirect response, which means code after it is provably unreachable — no forgotten `exit` leaking half a page. The gotcha: because it throws, a broad `try { ... } catch (e) { ... }` around it will swallow the redirect and the user never moves. Call it outside try blocks, or rethrow anything you didn't expect. `permanentRedirect()` does the same with a 308 for permanently moved URLs.",
    },
  ],

  quiz: [
    {
      question:
        "In an App Router client component you write `import { useRouter } from 'next/router'`. What happens?",
      options: [
        "It works — both packages export the same hook",
        "It fails — next/router is the Pages Router API; the App Router hook lives in next/navigation",
        "It works but disables prefetching for that component",
        "It only fails in production builds",
      ],
      answerIndex: 1,
      explain:
        "next/router is the legacy Pages Router module with a different API (router.query, events, etc.). App Router components must import useRouter — plus usePathname and useSearchParams — from next/navigation. Mixing them up is a favorite interview trap because the names are identical.",
    },
    {
      question:
        "After a user saves a form via an API call, you want the page's server-rendered data to update without losing the state of other client components on screen. What do you call?",
      options: [
        "window.location.reload()",
        "router.push(pathname) to the same URL",
        "router.refresh()",
        "router.back() followed by router.forward()",
      ],
      answerIndex: 2,
      explain:
        "router.refresh() re-executes the Server Components for the current route and merges the result in, preserving client-side state — precisely the 'refetch server data without a full reload' tool. reload() would tear everything down; pushing the same URL doesn't guarantee fresh server data.",
    },
    {
      question:
        "Why does redirect() in a Server Component not need PHP's `exit` after `header('Location: ...')`?",
      options: [
        "Next.js buffers all output, so trailing code is harmless",
        "redirect() throws a control-flow error Next.js converts to the redirect, so following code never executes",
        "The compiler strips all statements after redirect() at build time",
        "redirect() is asynchronous and resolves after the response is sent",
      ],
      answerIndex: 1,
      explain:
        "redirect() throws internally; Next.js catches that specific error and issues the redirect response. Unreachability is enforced by the throw itself — which is also why wrapping redirect() in a broad try/catch can accidentally swallow the navigation.",
    },
  ],
};

export default lesson;
