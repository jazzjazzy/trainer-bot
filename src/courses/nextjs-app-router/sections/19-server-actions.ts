import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "server-actions",
  title: "Server Actions: Mutations Without an API",
  part: "Mutations & APIs",
  estMinutes: 13,
  summary:
    "An async function marked 'use server' becomes a POST endpoint automatically — bind it to <form action={...}> and you have PHP's form-posts-to-handler model back, typed and progressively enhanced.",

  concept: `
For twenty years your mutation architecture was: a \`<form>\` posts to a PHP
script, the script reads \`$_POST\`, validates, writes to the database,
redirects. Then SPAs arrived and the same feature became a JSON API route,
a fetch call, client-side state, loading flags, and error plumbing. **Server
Actions give you the PHP model back.**

### 'use server': a function that is an endpoint

\`\`\`ts
// app/posts/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';

export async function createPost(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;

  await db.post.create({ data: { title } });
  revalidatePath('/posts');
}
\`\`\`

The \`'use server'\` directive at the top of the file marks **every export**
as a Server Action. The framework generates a POST endpoint for each one,
with an unguessable ID — you never write the route, the fetch call, or the
JSON serialization. Alternatively, define one inline inside a Server
Component by putting \`'use server'\` as the *first line of the function
body* — handy for one-off actions that belong to a single page.

### Binding to a form

\`\`\`tsx
// app/posts/page.tsx (Server Component)
import { createPost } from './actions';

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" />
      <button type="submit">Publish</button>
    </form>
  );
}
\`\`\`

React's \`action\` prop accepts the function directly. Submitting the form
POSTs to the generated endpoint; the action receives the native
\`FormData\` — \`formData.get('title')\` is your \`$_POST['title']\`, typed as
\`FormDataEntryValue | null\`, so TypeScript forces the null-check PHP never
did.

### Progressive enhancement: it works before JS

Because the binding compiles down to a real \`<form method="post">\`, the
form works **before the JavaScript bundle loads — or with JS disabled
entirely**: the browser does a classic full-page POST, exactly like your PHP
forms. Once hydrated, React upgrades it to a fetch that re-renders the page
in place, no full reload. You write one code path and get both behaviours.

### Calling actions from client components

A client component can't *define* an action inline (its code ships to the
browser), but it can **import and call** one:

\`\`\`tsx
'use client';
import { deletePost } from './actions';

export function DeleteButton({ id }: { id: string }) {
  return <button onClick={() => deletePost(id)}>Delete</button>;
}
\`\`\`

Actions aren't limited to forms — any client event handler can invoke one,
and it's still a typed POST under the hood.

### Security: every action is a public endpoint

This is the part interviewers probe. That generated POST endpoint is
reachable by **anyone with an HTTP client** — the form is just one caller.
So inside *every* action, exactly as in every PHP POST handler you've ever
written: **authenticate, authorize, and validate the input**. Never trust
that "only my form calls this". Next mitigates the surface (dead-code
elimination of unused actions, non-deterministic IDs), but the rule stands:
an action is \`process.php\` on the open internet.

### After the mutation: revalidate and redirect

The PHP Post/Redirect/Get pattern maps directly: call
\`revalidatePath\`/\`revalidateTag\` so cached pages reflect the write, then
\`redirect('/posts')\` from \`next/navigation\`. One gotcha: \`redirect\`
works by **throwing** a special error — call it outside \`try/catch\`, or
rethrow, or your redirect gets swallowed.
`,

  comparisons: [
    {
      label: "process.php vs actions.ts",
      intro:
        "The handler side of a comment form: read the submitted fields, validate, insert, refresh what the user sees. Same responsibilities, twenty years apart.",
      php: `<?php // process.php — the classic POST target
session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  exit;
}

$title = trim($_POST['title'] ?? '');
if ($title === '') {
  header('Location: /posts/new?error=title');
  exit;
}

$pdo->prepare('INSERT INTO posts (title) VALUES (?)')
    ->execute([$title]);

header('Location: /posts');
exit;`,
      ts: `// app/posts/actions.ts — 'use server' = POST endpoint
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';

export async function createPost(formData: FormData) {
  // FormData is your $_POST — typed as
  // FormDataEntryValue | null, so the ?? is forced:
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;

  await db.post.create({ data: { title } });

  revalidatePath('/posts'); // purge the cached list
  redirect('/posts');       // throws — keep out of try/catch
}`,
      note:
        "The framework generates the POST route, method check, and body parsing that process.php did by hand. What does NOT change: this is a public endpoint, so validation and authorization belong inside it — same as ever.",
      rightLang: "ts",
    },
    {
      label: "The form: action attribute then and now",
      intro:
        "The page with the form. PHP points action at a URL; Next passes the function itself — and still renders a real form that works without JavaScript.",
      php: `<!-- new-post.php -->
<form action="/process.php" method="post">
  <input type="hidden" name="csrf"
         value="<?= htmlspecialchars($_SESSION['csrf']) ?>">
  <input name="title" placeholder="Post title">
  <button type="submit">Publish</button>
</form>
<!-- Submit = full page reload, always -->`,
      ts: `// app/posts/new/page.tsx (Server Component)
import { createPost } from '../actions';

export default function NewPostPage() {
  return (
    <form action={createPost}>
      <input name="title" placeholder="Post title" />
      <button type="submit">Publish</button>
    </form>
  );
}

// Before hydration: real <form method="post"> —
// full-page POST, like PHP. After hydration: the
// same submit becomes a fetch + in-place re-render.`,
      note:
        "action={fn} serializes to a reference to the generated endpoint, so progressive enhancement is free: the form works with JS disabled. React's action plumbing also covers the CSRF-token ritual the PHP version hand-rolls.",
    },
    {
      label: "Post/Redirect/Get vs revalidate + redirect",
      intro:
        "After a successful write, both stacks want the same thing: the user lands on a fresh GET of the updated page, and refresh doesn't resubmit.",
      php: `<?php // end of process.php — the PRG pattern
$pdo->prepare('INSERT INTO posts (title) VALUES (?)')
    ->execute([$title]);

// Bust your cache layer by hand…
apcu_delete('page:/posts');

// …then redirect so F5 can't double-submit:
header('Location: /posts', true, 303);
exit;`,
      ts: `// app/posts/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createPost(formData: FormData) {
  await db.post.create({
    data: { title: String(formData.get('title') ?? '') },
  });

  revalidatePath('/posts'); // fresh data for the target
  redirect('/posts');       // ends the action, like exit;
}`,
      note:
        "redirect() plays the role of header('Location: …'); exit; — it throws internally to stop execution, so never wrap it in a try/catch that swallows errors. revalidatePath is the framework-native apcu_delete.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "A guestbook page with a form bound to a Server Action. Read both files, then predict the full round trip: what renders first, what happens on submit, and what the user sees after — the output traces it.",
    code: `// app/guestbook/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';

export async function signGuestbook(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return; // public endpoint: validate here, always

  await db.guestbook.create({ data: { name } });
  revalidatePath('/guestbook');
}

// app/guestbook/page.tsx
import { signGuestbook } from './actions';
import { db } from '@/lib/db';

export default async function GuestbookPage() {
  const entries = await db.guestbook.findMany();

  return (
    <main>
      <h1>Guestbook ({entries.length})</h1>
      <form action={signGuestbook}>
        <input name="name" placeholder="Your name" />
        <button type="submit">Sign</button>
      </form>
      <ul>
        {entries.map((e) => (
          <li key={e.id}>{e.name}</li>
        ))}
      </ul>
    </main>
  );
}`,
    output: `Initial GET /guestbook (2 rows in the table):
  <h1>Guestbook (2)</h1>
  <form> <input name="name"> <button>Sign</button> </form>
  <ul><li>Ada</li><li>Bjarne</li></ul>

User types "Rasmus", clicks Sign:
  → POST to the action's generated endpoint, body: name=Rasmus
  → signGuestbook runs ON THE SERVER: validate → INSERT
  → revalidatePath('/guestbook') purges the cached page
  → the same response streams back the re-rendered page:
  <h1>Guestbook (3)</h1>
  <ul><li>Ada</li><li>Bjarne</li><li>Rasmus</li></ul>
  (in-place update — no full page reload)

Same submit with JavaScript disabled:
  classic full-page form POST, then the updated page —
  the PHP behaviour, as progressive-enhancement fallback.`,
  },

  keyPoints: [
    "`'use server'` at the top of a file makes every export a Server Action; as the first line of a function body it marks just that inline function (Server Components only).",
    "The framework generates a POST endpoint per action — `<form action={createPost}>` wires the form to it with no route file, fetch call, or JSON layer.",
    "Actions receive native `FormData`: `formData.get('title')` is `$_POST['title']`, typed `FormDataEntryValue | null` so the missing-field case must be handled.",
    "Progressive enhancement is built in: before hydration (or with JS off) the form does a classic full-page POST; after hydration the same submit becomes an in-place re-render.",
    "Every action is a public HTTP endpoint — authenticate, authorize, and validate inside each one, exactly like any PHP POST handler; never assume only your form calls it.",
    "Finish mutations with `revalidatePath`/`revalidateTag` plus `redirect()` — the Post/Redirect/Get pattern; `redirect` throws internally, so keep it out of try/catch.",
  ],

  interview: [
    {
      q: "What is a Server Action and how does it compare to building a JSON API route for mutations?",
      a: "A Server Action is an async server-side function marked with `'use server'` that Next automatically exposes as a POST endpoint. Instead of writing a route handler, a fetch wrapper, JSON serialization, and client state for a mutation, I pass the function to `<form action={...}>` or call it from an event handler; the framework handles transport. It's the old PHP model — form posts to handler — with types across the boundary and progressive enhancement built in: the form works as a classic POST before JavaScript loads. I'd still build route handlers for genuine APIs consumed by third parties or mobile apps, but for my own app's mutations, actions remove a whole tier of plumbing.",
    },
    {
      q: "What are the security implications of Server Actions?",
      a: "The key realization is that every Server Action is a public HTTP endpoint — the generated POST route is reachable by anyone with curl, not just my form. So each action must do what every PHP POST handler must do: authenticate the caller, authorize the specific operation, and validate every input, treating FormData exactly like `$_POST` — hostile until proven otherwise. Next reduces the attack surface with dead-code elimination of unreferenced actions and unguessable, non-deterministic action IDs, and React's plumbing covers the CSRF-token ritual, but none of that replaces in-action auth checks. 'Only my UI calls this' has never been a security boundary in PHP and it isn't here.",
    },
    {
      q: "Where can 'use server' appear, and what's the difference between the placements?",
      a: "Two placements. At the top of a file — conventionally `actions.ts` — it marks every exported async function as a Server Action; that's the shareable form, and it's the only way client components can use actions, since they must import them rather than define them. Alternatively, `'use server'` as the first line of a function body defines an inline action inside a Server Component, which suits one-off, page-specific mutations and can close over server-side values in scope. One trap worth naming: `'use server'` does not mean 'this code is secret' — it means 'expose this function as an endpoint'. Keeping code server-only is a different tool (the server-only package).",
    },
    {
      q: "How do you redirect after a successful Server Action, and what's the classic mistake?",
      a: "The same Post/Redirect/Get I've done in PHP forever: after the write, call `revalidatePath` or `revalidateTag` so cached pages reflect the change, then `redirect('/posts')` from `next/navigation` — the framework equivalent of `header('Location: /posts'); exit;`. The classic mistake is wrapping `redirect` in a try/catch: it works by throwing a special control-flow error that Next catches upstream, so a broad catch block swallows it and the redirect silently never happens. Call it outside the try, or rethrow anything that isn't an application error.",
    },
  ],

  quiz: [
    {
      question: "What does putting 'use server' at the top of actions.ts actually do?",
      options: [
        "Keeps the file's code out of the client bundle but has no runtime effect",
        "Marks every exported async function as a Server Action, each exposed as a generated POST endpoint",
        "Runs the file once at server startup, like a bootstrap include",
        "Restricts the file to being imported only by Server Components",
      ],
      answerIndex: 1,
      explain:
        "'use server' marks exports as Server Actions — callable functions the framework backs with real POST endpoints. It's about exposing entry points, not hiding code (that's the server-only package), and client components may import these actions precisely because only a reference crosses the boundary.",
    },
    {
      question:
        "A user with JavaScript disabled submits <form action={createPost}>. What happens?",
      options: [
        "Nothing — Server Actions require the React runtime",
        "The browser performs a classic full-page POST and the action still runs — progressive enhancement",
        "A hydration error is shown",
        "The form falls back to a GET request with query parameters",
      ],
      answerIndex: 1,
      explain:
        "The action binding renders a real <form method=\"post\"> targeting the generated endpoint, so the no-JS path is a classic PHP-style form POST followed by a full page response. With JS, React upgrades the same submit to an in-place re-render. One code path, both behaviours.",
    },
    {
      question:
        "Why must every Server Action validate and authorize internally, even if only one form uses it?",
      options: [
        "Because TypeScript can't type-check FormData",
        "Because actions run on every page render and might receive stale data",
        "Because each action is a public POST endpoint — anyone with an HTTP client can invoke it, bypassing your UI entirely",
        "Because Next.js retries failed actions automatically",
      ],
      answerIndex: 2,
      explain:
        "The form is just one caller of the generated endpoint; curl is another. Exactly like a PHP script reading $_POST, the action itself is the security boundary — authenticate, authorize, validate inside it. Unguessable action IDs reduce discoverability but are not access control.",
    },
    {
      question: "What's the correct way to use redirect() in a Server Action?",
      options: [
        "Inside try/catch, since it can fail on slow networks",
        "Outside try/catch (or rethrown), because redirect works by throwing a control-flow error",
        "Only in client components after the action resolves",
        "Return redirect('/posts') as the action's value",
      ],
      answerIndex: 1,
      explain:
        "redirect() throws a special error that Next catches to perform the navigation — the functional twin of PHP's header('Location: …'); exit;. A catch-all try/catch around it swallows that error and kills the redirect, which is the classic gotcha.",
    },
  ],
};

export default lesson;
