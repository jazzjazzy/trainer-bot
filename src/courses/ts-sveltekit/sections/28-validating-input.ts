import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "validating-input",
  title: "Validating Input at the Boundary",
  part: "Patterns & Shipping",
  estMinutes: 12,
  summary:
    "TypeScript types vanish at runtime, so every piece of user input — form fields, JSON bodies, URL params — must be validated where it enters, ideally with a schema that also generates the types.",

  concept: `
Here's the uncomfortable truth about everything this course has typed so far:
**TypeScript types are erased at compile time**. At runtime your beautifully
typed action receives whatever the network sent. You've lived this before —
a PHP 5 docblock saying \`@param int $age\` documented an intention the engine
never checked. A TS \`interface\` is exactly that for runtime data: great for
your own code talking to your own code, worthless against a user's \`curl\`.

### Where the type system goes blind

- **\`FormData\`** — \`data.get('email')\` returns \`FormDataEntryValue | null\`, i.e. \`string | File | null\`. Never plain \`string\`.
- **\`request.json()\`** — returns \`Promise<any>\`. Writing \`await request.json() as Signup\` is a *claim*, not a check.
- **URL params and query strings** — always strings: \`params.id\` is \`"42"\`, \`url.searchParams.get('page')\` is \`string | null\`.

Inside the boundary, generated \`$types\` flow real types everywhere. **At** the
boundary, only runtime code can establish them.

### Level 1: manual narrowing

For one or two fields, a helper is enough:

\`\`\`ts
function asString(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
\`\`\`

This is honest — the return type admits failure — but it doesn't scale:
every field needs its own checks, error messages, and a hand-maintained
interface that can drift out of sync with the checks.

### Level 2: schema validation with Zod

A schema library moves the rules into a **runtime object** that TypeScript can
also read:

\`\`\`ts
import { z } from 'zod';

const signupSchema = z.object({
  email: z.email(),
  age: z.coerce.number().min(18),
});

type Signup = z.infer<typeof signupSchema>; // { email: string; age: number }
\`\`\`

Three things matter here:

- \`safeParse(input)\` returns a **discriminated union**: \`{ success: true; data: T }\` or \`{ success: false; error: ZodError }\` — no exceptions, and narrowing on \`success\` gives you typed \`data\`.
- \`z.infer<typeof schema>\` derives the static type **from** the schema. One source of truth: change a rule, the type updates, the compiler flags every consumer.
- \`z.coerce.number()\` handles the everything-is-a-string reality of forms and URLs.

### Wiring it into a form action

\`\`\`ts
const parsed = signupSchema.safeParse(Object.fromEntries(await request.formData()));
if (!parsed.success) {
  return fail(400, { errors: z.flattenError(parsed.error).fieldErrors });
}
// parsed.data is Signup — fully typed from here on
\`\`\`

\`z.flattenError(error)\` produces \`{ formErrors, fieldErrors }\` — per-field
message arrays your page can render next to each input. (Zod 4 **deprecated**
the older \`.flatten()\` method on \`ZodError\` in favour of this tree-shakeable
top-level helper; \`.flatten()\` still runs, but new code should use
\`z.flattenError\`.)

### The PHP mapping

This is Laravel's \`$request->validate(['email' => 'required|email'])\` or a
Symfony constraint set: declarative rules, executed at runtime, at the edge of
your app. The upgrade is that in TypeScript the same declaration *also*
produces the static type — PHP validation never fed the type checker.
Validate at every trust boundary: form actions, \`+server.ts\` bodies, URL
params, and even third-party API responses.
`,

  comparisons: [
    {
      label: "Trusting FormData vs narrowing it",
      intro:
        "A signup action reads email and age from the submitted form and creates a user. Both compile; only one survives a request where a field is missing.",
      php: `// src/routes/signup/+page.server.js
import { createUser } from '$lib/server/users';

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();

    // get() returns string | File | null — this "works"
    // until a field is missing or a file is uploaded.
    const email = data.get('email');
    const age = Number(data.get('age'));

    await createUser(email.toLowerCase(), age); // TypeError if null
    return { success: true };
  },
};`,
      ts: `// src/routes/signup/+page.server.ts
import { fail } from '@sveltejs/kit';
import { createUser } from '$lib/server/users';
import type { Actions } from './$types';

function asString(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();

    const email = asString(data.get('email'));
    const age = Number(asString(data.get('age')) ?? NaN);

    if (!email || !email.includes('@') || Number.isNaN(age)) {
      return fail(400, { message: 'valid email and numeric age required' });
    }

    await createUser(email.toLowerCase(), age); // email: string here
    return { success: true };
  },
} satisfies Actions;`,
      note:
        "FormData.get() is typed string | File | null for a reason — the narrowing helper forces you to handle the null/File cases the JS version crashes on.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Hand-rolled rules vs a Zod schema",
      intro:
        "The validation rules for a signup payload. The left version maintains checks and a mental model of the type separately; the right derives the TypeScript type from the schema itself.",
      php: `// src/lib/validation/signup.js
// Rules and 'the shape' live only in your head — nothing
// tells consumers what valid data looks like.
export function validateSignup(input) {
  const errors = {};
  if (typeof input.email !== 'string' || !input.email.includes('@')) {
    errors.email = ['a valid email is required'];
  }
  const age = Number(input.age);
  if (Number.isNaN(age) || age < 18) {
    errors.age = ['must be a number, 18 or over'];
  }
  return Object.keys(errors).length > 0
    ? { success: false, errors }
    : { success: true, data: { email: input.email, age } };
}`,
      ts: `// src/lib/validation/signup.ts
import { z } from 'zod';

export const signupSchema = z.object({
  email: z.email(),
  age: z.coerce.number().min(18), // forms send strings — coerce
});

// The static type is derived FROM the schema: one source of truth.
// Change a rule above and every consumer re-typechecks.
export type Signup = z.infer<typeof signupSchema>;
// => { email: string; age: number }`,
      note:
        "z.infer<typeof schema> means the runtime rules and the compile-time type can never drift apart — the schema IS the type definition.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "The full action: safeParse + fail(400)",
      intro:
        "Wiring the schema into a form action so invalid submissions return per-field errors the page can render, and valid ones proceed with fully typed data.",
      php: `// src/routes/signup/+page.server.js
import { fail } from '@sveltejs/kit';
import { createUser } from '$lib/server/users';

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const email = data.get('email');
    const age = data.get('age');

    // ad-hoc checks, ad-hoc error shape — every action
    // in the app invents its own version of this
    if (!email || !String(email).includes('@')) {
      return fail(400, { error: 'bad email' });
    }
    if (!age || Number.isNaN(Number(age))) {
      return fail(400, { error: 'bad age' });
    }

    await createUser(String(email), Number(age));
    return { success: true };
  },
};`,
      ts: `// src/routes/signup/+page.server.ts
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { createUser } from '$lib/server/users';
import { signupSchema } from '$lib/validation/signup';
import type { Actions } from './$types';

export const actions = {
  default: async ({ request }) => {
    const raw = Object.fromEntries(await request.formData());
    const parsed = signupSchema.safeParse(raw);

    if (!parsed.success) {
      // { email?: string[]; age?: string[] } — render next to inputs
      return fail(400, { errors: z.flattenError(parsed.error).fieldErrors });
    }

    // narrowing on success: parsed.data is Signup — typed, coerced
    await createUser(parsed.data.email, parsed.data.age);
    return { success: true };
  },
} satisfies Actions;`,
      note:
        "safeParse returns a discriminated union, so one if-statement both handles the failure path (structured fieldErrors for the UI) and narrows parsed.data to the schema's inferred type.",
      leftLang: "js",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A hand-rolled miniature of Zod — no imports needed. object() builds a schema whose safeParse returns a discriminated union, and Infer extracts the static type from it. Predict both parse results before running.",
    code: `// A mini schema validator, shaped like Zod.
type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string };
type FieldParser<T> = (value: unknown) => FieldResult<T>;

type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

interface MiniSchema<T> {
  safeParse(input: unknown): SafeParseResult<T>;
}

// Extract the static type FROM a schema — our z.infer:
type Infer<S> = S extends MiniSchema<infer T> ? T : never;

const str = (min = 1): FieldParser<string> => (v) =>
  typeof v === "string" && v.length >= min
    ? { ok: true, value: v }
    : { ok: false, message: "expected a string of at least " + min + " chars" };

const num = (minValue = 0): FieldParser<number> => (v) => {
  const n = typeof v === "string" ? Number(v) : v; // coerce, like forms need
  return typeof n === "number" && !Number.isNaN(n) && n >= minValue
    ? { ok: true, value: n }
    : { ok: false, message: "expected a number >= " + minValue };
};

type Shape = Record<string, FieldParser<unknown>>;
type InferShape<S extends Shape> = {
  [K in keyof S]: S[K] extends FieldParser<infer T> ? T : never;
};

function object<S extends Shape>(shape: S): MiniSchema<InferShape<S>> {
  return {
    safeParse(input) {
      if (typeof input !== "object" || input === null) {
        return { success: false, errors: { _form: ["expected an object"] } };
      }
      const record = input as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      const errors: Record<string, string[]> = {};
      for (const key of Object.keys(shape)) {
        const result = shape[key](record[key]);
        if (result.ok) data[key] = result.value;
        else errors[key] = [result.message];
      }
      return Object.keys(errors).length > 0
        ? { success: false, errors }
        : { success: true, data: data as InferShape<S> };
    },
  };
}

// ---- usage, exactly like Zod ----
const signupSchema = object({ email: str(3), age: num(18) });
type Signup = Infer<typeof signupSchema>; // { email: string; age: number }

const good = signupSchema.safeParse({ email: "ada@example.com", age: "36" });
if (good.success) {
  const user: Signup = good.data; // typed AND runtime-checked
  console.log("valid:", user.email, "age", user.age);
}

const bad = signupSchema.safeParse({ email: "x", age: "seventeen" });
if (!bad.success) {
  console.log("invalid:", JSON.stringify(bad.errors));
}`,
  },

  keyPoints: [
    "TypeScript types are **erased at runtime** — like PHP docblocks, they describe intent but check nothing about data arriving over the network.",
    "The blind spots: `FormData.get()` is `string | File | null`, `request.json()` is `Promise<any>`, and URL params/search params are always strings.",
    "`safeParse` returns a discriminated union — `{ success: true; data: T } | { success: false; error }` — so one `if` handles errors and narrows `data` to the validated type.",
    "`z.infer<typeof schema>` derives the static type from the runtime schema: one source of truth, so rules and types can never drift apart.",
    "In a form action: `safeParse(Object.fromEntries(await request.formData()))`, then `fail(400, { errors: z.flattenError(parsed.error).fieldErrors })` gives the page per-field errors to render (Zod 4 deprecated the `.flatten()` method in favour of this top-level helper).",
    "PHP mapping: this is Laravel's `$request->validate([...])` — declarative runtime rules at the boundary — except the schema also feeds the type checker.",
  ],

  interview: [
    {
      q: "Your SvelteKit action is fully typed — why do you still need runtime validation?",
      a: "Because TypeScript is compile-time only: every type is erased before the code runs, so at runtime the action receives whatever the client actually sent — which I don't control. `await request.json() as Signup` is an unchecked assertion, and `FormData.get()` is honestly typed as `string | File | null` precisely because that's all HTTP guarantees. I compare it to PHP docblocks before real type declarations: documentation, not enforcement. So types keep my own modules consistent, and runtime validation — narrowing helpers or a schema library — establishes those types at the trust boundary where data enters.",
    },
    {
      q: "Why use a schema library like Zod instead of hand-written checks?",
      a: "Three reasons. First, `z.infer<typeof schema>` derives the TypeScript type from the schema, so the rules and the type are a single source of truth that can't drift — with manual checks I'd maintain an interface and an if-chain separately. Second, `safeParse` returns a discriminated union rather than throwing, which composes perfectly with SvelteKit's `fail()`: one branch returns `fail(400, { errors: z.flattenError(parsed.error).fieldErrors })`, the other proceeds with typed data. Third, coercion — `z.coerce.number()` handles the fact that forms and URLs only ever transmit strings. It's the same idea as Laravel's request validation rules, but the declaration also generates the static type.",
    },
    {
      q: "Where exactly do you put validation in a SvelteKit app?",
      a: "At every trust boundary, on the server: form actions (parse the `FormData` before touching it), `+server.ts` endpoints (validate the JSON body — `request.json()` is `any`), route params and search params (always strings, and `[id]` matching doesn't mean it's a valid ID), and responses from third-party APIs I don't control. Client-side validation is a UX nicety, never a security boundary — anyone can bypass the form with `curl`, exactly as with PHP. Once validated, the inferred types flow through the rest of the app via `load` return types and `./$types`, so I only pay the runtime cost once, at the edge.",
    },
  ],

  quiz: [
    {
      question: "What is the actual return type of `formData.get('email')`?",
      options: [
        "string",
        "string | null",
        "FormDataEntryValue | null — i.e. string | File | null",
        "unknown",
      ],
      answerIndex: 2,
      explain:
        "Form fields can be text or file uploads, and the key may be absent — so the DOM types say string | File | null. That honest type is why TypeScript forces a narrowing step before you can call string methods on it.",
    },
    {
      question: "Why is `const body = await request.json() as Signup;` dangerous?",
      options: [
        "request.json() can only return strings",
        "as performs an unchecked compile-time assertion — the runtime value can be anything the client sent",
        "It throws if the body doesn't match Signup",
        "json() is not available in form actions",
      ],
      answerIndex: 1,
      explain:
        "Type assertions are erased at compile time; nothing checks the actual payload. Like a PHP docblock, it documents a hope. A schema's safeParse actually inspects the value and returns typed data only on success.",
    },
    {
      question: "What does Zod's `safeParse` return?",
      options: [
        "The parsed data, throwing a ZodError on failure",
        "A boolean",
        "A Promise of the validated data",
        "A discriminated union: { success: true; data: T } or { success: false; error: ZodError }",
      ],
      answerIndex: 3,
      explain:
        "Unlike parse() (which throws), safeParse returns a result object. Narrowing on the success discriminant gives you typed data in one branch and a structured error — e.g. z.flattenError(error).fieldErrors for fail(400, ...) — in the other.",
    },
    {
      question: "What is the main benefit of `z.infer<typeof signupSchema>` over writing an interface by hand?",
      options: [
        "It makes parsing faster",
        "The type is derived from the runtime rules, so schema and type can never fall out of sync",
        "It generates client-side validation automatically",
        "It removes the need for safeParse",
      ],
      answerIndex: 1,
      explain:
        "The schema is the single source of truth: add a field or change a rule, and the inferred type updates immediately, re-typechecking every consumer. A hand-written interface next to hand-written checks drifts silently.",
    },
  ],
};

export default lesson;
