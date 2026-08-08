import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "mutation-patterns",
  title: "Validation, Redirects & Mutation Patterns",
  part: "Mutations & APIs",
  estMinutes: 12,
  summary:
    "The production-grade Server Action recipe: authorize, validate with Zod, return typed field errors, then revalidate and redirect — with redirect() kept outside try/catch because it works by throwing.",

  concept: `
You have written a Server Action that saves a record. Production needs more:
what happens with bad input, an unauthenticated caller, or a database failure?
Twenty-five years of PHP gave you the answer already — check the session,
validate \`$_POST\`, save, then \`header('Location: ...')\` so a refresh doesn't
double-submit. The App Router recipe is the same five steps, in the same order:

**authorize → validate → mutate → revalidate → redirect**

### Validate with Zod, not by hand

You *could* build an errors array manually, PHP-style. Zod (the ecosystem's
standard validator) does it declaratively — and derives the TypeScript type
from the schema, so validation and typing are one artifact:

\`\`\`ts
import { z } from 'zod';

const PostSchema = z.object({
  title: z.string().min(3, { error: 'Title needs at least 3 characters' }),
  authorEmail: z.email({ error: 'Enter a valid email' }),
});

type PostInput = z.infer<typeof PostSchema>;
// { title: string; authorEmail: string } — derived, never hand-written
\`\`\`

In an action, call \`schema.safeParse(...)\` — it never throws; it returns a
discriminated union: \`{ success: true, data }\` or \`{ success: false, error }\`.
To turn the error into something a form can render, Zod 4 uses the top-level
\`z.flattenError(result.error)\`, which yields \`{ formErrors, fieldErrors }\` —
\`fieldErrors\` maps each field name to an array of messages. (The older
\`result.error.flatten()\` method and \`z.string().email()\` are deprecated
spellings; interviewers may still write them.)

### Return errors, throw nothing

Validation failure is not exceptional — it's a normal outcome the UI must
render. So the action *returns* a typed state object instead of throwing:

\`\`\`ts
export interface FormState {
  fieldErrors?: Record<string, string[]>;
  message?: string;
}
\`\`\`

The client's \`useActionState\` hook receives whatever the action returns, and
the form shows the messages next to the fields. Exactly like re-rendering a
PHP form with an \`$errors\` array — except the shape of \`$errors\` is a
compile-time contract shared by server and client.

### The redirect() gotcha: it throws on purpose

\`redirect()\` from \`next/navigation\` does not return — it **throws** a special
\`NEXT_REDIRECT\` error that Next catches higher up to perform the navigation.
Consequence: if you call \`redirect()\` inside a \`try\` block, your own \`catch\`
swallows the control-flow error and the redirect silently never happens. The
rule: wrap **only the fallible mutation** in \`try/catch\`, and call
\`redirect()\` after the block. Same for \`notFound()\` — it throws too.

The ordering matters as well: call \`revalidatePath('/posts')\` (or
\`revalidateTag(...)\`) *before* \`redirect('/posts')\`, so the page you land on
is rebuilt with fresh data rather than served from a stale cache — the
App Router's POST-redirect-GET.

### Authorize at the top of every action

A Server Action compiles to a public HTTP endpoint. The fact that only your
dashboard renders the form is no protection — anyone can POST to it. So the
first line of every mutating action verifies the session, exactly like the
\`if (empty($_SESSION['user'])) { http_response_code(403); exit; }\` guard at
the top of a PHP handler. Auth in a layout or in \`proxy.ts\` does not cover
this: the check must live in the action itself, next to the data it protects.
`,

  comparisons: [
    {
      label: "Manual validation vs a Zod schema",
      intro:
        "Validate a new-post form: title of at least 3 characters, valid author email. PHP builds an errors array by hand; Zod declares the rules once and derives the TypeScript type from them.",
      php: `<?php // create-post.php
$errors = [];

$title = trim($_POST['title'] ?? '');
if (strlen($title) < 3) {
    $errors['title'][] = 'Title needs at least 3 characters';
}

$email = trim($_POST['author_email'] ?? '');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['author_email'][] = 'Enter a valid email';
}

if ($errors) {
    // re-render the form with $errors
    require 'post-form.php';
    exit;
}
// $title and $email are "probably fine" — nothing enforces it`,
      ts: `// app/posts/actions.ts
'use server';
import { z } from 'zod';

const PostSchema = z.object({
  title: z.string().min(3, { error: 'Title needs at least 3 characters' }),
  authorEmail: z.email({ error: 'Enter a valid email' }),
});

export async function createPost(prev: FormState, formData: FormData) {
  const parsed = PostSchema.safeParse({
    title: formData.get('title'),
    authorEmail: formData.get('authorEmail'),
  });

  if (!parsed.success) {
    // { title?: string[], authorEmail?: string[] }
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  // parsed.data: { title: string; authorEmail: string } — typed
  await savePost(parsed.data);
}`,
      note:
        "safeParse never throws — it returns a discriminated union, and after the success check parsed.data is fully typed. Zod 4 spells flattening as the top-level z.flattenError(); .flatten() on the error is the deprecated Zod 3 method.",
      rightLang: "ts",
    },
    {
      label: "POST-redirect-GET, App Router edition",
      intro:
        "After a successful save, send the user to the list page so a refresh cannot double-submit. PHP calls header('Location: ...'); the action revalidates the cached list first, then redirects.",
      php: `<?php // create-post.php (after validation)
try {
    $stmt = $pdo->prepare(
        'INSERT INTO posts (title, body) VALUES (?, ?)'
    );
    $stmt->execute([$title, $body]);
} catch (PDOException $e) {
    $errors['form'][] = 'Database error - post not saved';
    require 'post-form.php';
    exit;
}

// POST-redirect-GET: refresh won't re-submit
header('Location: /posts.php');
exit;`,
      ts: `// app/posts/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createPost(prev: FormState, formData: FormData) {
  // ...authorize + validate above...

  try {
    await db.post.create({ data: parsed.data });
  } catch {
    return { message: 'Database error - post not saved' };
  }

  // OUTSIDE the try/catch: redirect() throws NEXT_REDIRECT
  revalidatePath('/posts');   // rebuild the cached list first
  redirect('/posts');         // then navigate - never returns
}`,
      note:
        "redirect() works by throwing, so a catch block around it would swallow the navigation. Wrap only the database call, then revalidate before redirecting so the destination renders fresh data.",
      rightLang: "ts",
    },
    {
      label: "Authorize inside the handler itself",
      intro:
        "Both mutation endpoints are publicly reachable, so both check the session before touching data — the form being hidden in the UI protects nothing.",
      php: `<?php // delete-post.php
session_start();

if (empty($_SESSION['user_id'])) {
    http_response_code(403);
    exit('Forbidden');
}

$stmt = $pdo->prepare('DELETE FROM posts WHERE id = ?');
$stmt->execute([(int) $_POST['id']]);

header('Location: /posts.php');
exit;`,
      ts: `// app/posts/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';

export async function deletePost(formData: FormData) {
  // First line of EVERY mutating action:
  const session = await verifySession();
  if (!session) redirect('/login');

  await db.post.delete({
    where: { id: String(formData.get('id')) },
  });

  revalidatePath('/posts');
  redirect('/posts');
}`,
      note:
        "A Server Action compiles to a public HTTP endpoint. Checks in a layout or in proxy.ts don't guard it — the authorization belongs in the action, adjacent to the data access, just like the session guard atop a PHP handler.",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A miniature of Zod's safeParse + flattenError in plain TypeScript: three rule kinds (required, minLength, email), a validator that returns a discriminated union, and a flattened fieldErrors object. Predict both printed results, then run it.",
    code: `// Mini Zod: declarative rules -> safeParse -> flattened fieldErrors.

type Rule =
  | { kind: 'required' }
  | { kind: 'minLength'; min: number }
  | { kind: 'email' };

type Schema = Record<string, Rule[]>;

type ParseResult =
  | { success: true; data: Record<string, string> }
  | { success: false; fieldErrors: Record<string, string[]> };

function safeParse(schema: Schema, input: Record<string, string>): ParseResult {
  const fieldErrors: Record<string, string[]> = {};

  for (const [field, rules] of Object.entries(schema)) {
    const value = (input[field] ?? '').trim();
    const errors: string[] = [];

    for (const rule of rules) {
      if (rule.kind === 'required' && value === '')
        errors.push('Required');
      if (rule.kind === 'minLength' && value.length < rule.min)
        errors.push(\`Must be at least \${rule.min} characters\`);
      if (rule.kind === 'email' && value !== '' && !/^\\S+@\\S+\\.\\S+$/.test(value))
        errors.push('Invalid email address');
    }
    if (errors.length > 0) fieldErrors[field] = errors;
  }

  if (Object.keys(fieldErrors).length > 0) return { success: false, fieldErrors };
  return { success: true, data: input };
}

// The "schema" - like z.object({ title: z.string().min(3), ... })
const postSchema: Schema = {
  title: [{ kind: 'required' }, { kind: 'minLength', min: 3 }],
  authorEmail: [{ kind: 'required' }, { kind: 'email' }],
};

// A bad payload: what the action returns to the form
const bad = safeParse(postSchema, { title: 'Hi', authorEmail: 'not-an-email' });
if (!bad.success) {
  console.log('fieldErrors:', JSON.stringify(bad.fieldErrors, null, 2));
}

// A good payload: the action proceeds to mutate + revalidate + redirect
const good = safeParse(postSchema, {
  title: 'Server Actions in production',
  authorEmail: 'jason@example.com',
});
if (good.success) {
  console.log('success - saving:', good.data.title);
  console.log('then: revalidatePath("/posts") -> redirect("/posts")');
}`,
  },

  keyPoints: [
    "The production action recipe runs in a fixed order: authorize, validate, mutate, revalidate, redirect — the same shape as a hardened PHP POST handler.",
    "Zod's `safeParse` never throws; it returns `{ success: true, data }` or `{ success: false, error }`, and `z.infer<typeof Schema>` derives the TypeScript type from the schema.",
    "Zod 4 flattens errors with the top-level `z.flattenError(error)` → `{ formErrors, fieldErrors }`; the `.flatten()` method and `z.string().email()` are deprecated spellings.",
    "Validation failures are returned as typed state (consumed by `useActionState`), not thrown — bad input is a normal outcome the form must render.",
    "`redirect()` and `notFound()` work by throwing, so they must be called OUTSIDE any try/catch; wrap only the fallible mutation.",
    "Call `revalidatePath`/`revalidateTag` before `redirect` so the destination page renders fresh data, and verify the session at the top of every action — actions are public HTTP endpoints.",
  ],

  interview: [
    {
      q: "Why must redirect() be called outside a try/catch block in a Server Action?",
      a: "Because `redirect()` doesn't return a response — it throws a special `NEXT_REDIRECT` error that Next.js catches further up the stack and turns into the actual navigation. If my own `catch` block wraps the call, I intercept that control-flow error, the framework never sees it, and the user silently stays on the page. So I keep the try/catch tight around the genuinely fallible code — the database write — return a typed error state from `catch`, and call `revalidatePath` and `redirect` after the block. `notFound()` behaves the same way for the same reason.",
    },
    {
      q: "Walk me through validating a form submission in a Server Action.",
      a: "I define a Zod schema — say `z.object({ title: z.string().min(3), authorEmail: z.email() })` — which also gives me the TypeScript type for free via `z.infer`. In the action I pull the values out of `FormData` and run `schema.safeParse`, which returns a discriminated union instead of throwing. On failure I call `z.flattenError(result.error)` and return its `fieldErrors` — a map of field name to messages — as typed state that `useActionState` hands to the form for inline rendering. On success, `result.data` is fully typed and I proceed to the mutation. It's the same flow as a PHP handler building an `$errors` array with `filter_var`, except the validator and the type system are the same artifact, and I always re-validate on the server because client-side checks are just UX.",
    },
    {
      q: "Where do authorization checks belong in an App Router app, and why isn't the UI hiding a form enough?",
      a: "Every Server Action compiles to a publicly reachable HTTP endpoint, so hiding the button or the form is purely cosmetic — anyone can craft the POST. The authoritative check belongs at the top of every mutating action (and next to data reads too): verify the session first, bail with a redirect or error state if it fails. `proxy.ts` can add an optimistic redirect for whole route sections and layouts can tailor the UI, but neither guards the action endpoint itself. It's the same discipline as the `$_SESSION` guard at the top of every protected PHP script — the check lives with the code that touches the data.",
    },
  ],

  quiz: [
    {
      question:
        "A Server Action wraps its whole body — including redirect('/posts') — in try/catch. What happens after a successful save?",
      options: [
        "The redirect works normally; try/catch has no effect on it",
        "The catch block swallows the NEXT_REDIRECT error and the user never navigates",
        "Next.js throws a build error because redirect() inside try is forbidden syntax",
        "The redirect happens but the revalidation is skipped",
      ],
      answerIndex: 1,
      explain:
        "redirect() performs navigation by throwing a NEXT_REDIRECT control-flow error for the framework to catch. A user-level catch intercepts it first, so the navigation silently never happens. Keep try/catch around the mutation only, and call redirect() after the block.",
    },
    {
      question:
        "In Zod 4, what is the current way to turn a failed safeParse result into per-field error messages for a form?",
      options: [
        "result.error.flatten().fieldErrors",
        "z.flattenError(result.error).fieldErrors",
        "result.error.messages",
        "JSON.parse(result.error.toString())",
      ],
      answerIndex: 1,
      explain:
        "Zod 4 moved error formatting to top-level functions: z.flattenError(error) returns { formErrors, fieldErrors }. The .flatten() method on the error object still exists but is deprecated Zod 3 spelling.",
    },
    {
      question:
        "Why call revalidatePath('/posts') before redirect('/posts') rather than after?",
      options: [
        "revalidatePath only works inside try/catch blocks",
        "redirect() never returns — code after it is unreachable, and the destination should be rebuilt before the user lands on it",
        "The order doesn't matter; Next.js batches both calls",
        "revalidatePath must always be the last statement in an action",
      ],
      answerIndex: 1,
      explain:
        "redirect() throws, so nothing after it executes — revalidation placed after the redirect simply never runs. Revalidating first marks the cached /posts data stale, so the navigation renders fresh content: the App Router's POST-redirect-GET.",
    },
  ],
};

export default lesson;
