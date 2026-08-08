import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "request-validation",
  title: "Validating Input with Zod",
  part: "Async, Data & Validation",
  estMinutes: 13,
  summary:
    "req.body is `any` until proven otherwise — Zod 4 validates at the edge and hands back a value whose TypeScript type is derived from the schema, so validation and types can never drift apart.",

  concept: `
TypeScript's types are erased at runtime, and HTTP doesn't care about your
interfaces. Whatever a client POSTs, \`req.body\` arrives as \`any\` — a string
where you expect a number, a missing field, an extra \`"isAdmin": true\` some
joker added. The discipline that fixes this is the **boundary rule**: validate
at the edge of the system, so everything inside works with honest, typed data.

That's Laravel FormRequest thinking, and it transfers directly. What PHP never
gave you is the second half: the validator *producing the static type*.

### A schema is both validator and type

Zod 4 (\`npm install zod\`, import from \`"zod"\`) turns one schema definition
into both jobs:

\`\`\`ts
// src/schemas/user.ts
import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.email(),          // Zod 4: top-level formats, not z.string().email()
  age: z.number().int().positive().optional(),
});

export type CreateUser = z.infer<typeof createUserSchema>;
// -> { name: string; email: string; age?: number }
\`\`\`

\`z.infer\` is the superpower PHP docblocks never had: the TypeScript type is
**derived from** the runtime validator. Change the schema and every handler
using \`CreateUser\` re-typechecks. Laravel's \`rules()\` array and your
\`@param array{name: string, ...}\` docblock could always silently disagree;
here there is only one source of truth.

### parse vs safeParse

- \`schema.parse(data)\` returns the typed value or **throws** a \`ZodError\` —
  pair it with error middleware that maps \`ZodError\` to a 400.
- \`schema.safeParse(data)\` never throws; it returns a discriminated union:
  \`{ success: true, data }\` or \`{ success: false, error }\`. TypeScript forces
  you to check \`success\` before touching \`data\` — the missing-input case
  becomes unrepresentable, not just unlikely.

Field-level details live in \`result.error.issues\` (path, message per failure)
— that's your 400 response body.

### Query strings: everything is a string

\`?page=2&active=true\` arrives as strings, exactly like \`$_GET\`. Where PHP
reaches for \`filter_var($page, FILTER_VALIDATE_INT)\` — returning a value or
\`false\`, and you get a \`mixed\` back — Zod coerces *and* types:

\`\`\`ts
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  active: z.stringbool().optional(), // "true"/"false" strings -> boolean
});
// listQuery.parse(req.query).page is a NUMBER, guaranteed and typed.
\`\`\`

One trap: don't reach for \`z.coerce.boolean()\` here — it runs JavaScript's
\`Boolean()\`, so the string \`"false"\` coerces to \`true\`. Zod 4's
\`z.stringbool()\` exists precisely for query-string booleans.

### A validate() middleware factory

One higher-order function gives every route FormRequest-style ergonomics:

\`\`\`ts
// src/middleware/validate.ts
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

export const validate =
  (schema: z.ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.issues });
    }
    req.body = result.data; // parsed: coerced, defaulted, stripped
    next();
  };

// usage:
app.post("/users", validate(createUserSchema), createUserHandler);
\`\`\`

Note it assigns \`result.data\` back — the *parsed* value (with coercions and
defaults applied), not the raw input, is what the handler receives.
`,

  comparisons: [
    {
      label: "Declaring the rules: FormRequest vs Zod schema",
      intro:
        "The same create-user rules in both worlds. Laravel's rules are strings interpreted at runtime; Zod's schema is code that also generates the static type.",
      php: `<?php
// app/Http/Requests/StoreUserRequest.php (Laravel)
class StoreUserRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name'  => ['required', 'string', 'min:1'],
            'email' => ['required', 'email'],
            'age'   => ['nullable', 'integer', 'min:1'],
        ];
    }
}
// The rules array and any @param docblock describing
// the validated shape can silently drift apart.`,
      ts: `// src/schemas/user.ts
import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.email(),        // Zod 4 top-level format
  age: z.number().int().positive().optional(),
});

// The type is DERIVED from the validator — one source of truth:
export type CreateUser = z.infer<typeof createUserSchema>;
// -> { name: string; email: string; age?: number }`,
      note: "Same declarative intent as a FormRequest — but z.infer means changing a rule changes the static type everywhere, at compile time. Laravel rules can't feed the type system.",
    },
    {
      label: "Consuming validated input in the handler",
      intro:
        "Both handlers only ever see input that passed the rules. Laravel injects the FormRequest; the Express handler runs after a validate(schema) middleware.",
      php: `<?php
// Laravel controller — validation already ran (or the
// framework already sent a 422 response).
public function store(StoreUserRequest $request)
{
    $data = $request->validated();
    // $data is array<string, mixed> — the SHAPE is only
    // in your head (or a docblock).
    $user = User::create($data);
    return response()->json($user, 201);
}`,
      ts: `// src/routes/users.ts — after validate(createUserSchema)
app.post("/users", validate(createUserSchema), async (req, res) => {
  // safeParse succeeded upstream; the middleware wrote the
  // PARSED value back, and the type comes from the schema:
  const data = req.body as CreateUser;

  const user = await insertUser(data); // data.age: number | undefined
  res.status(201).json(user);
});
// Invalid requests never get here — they got a 400 with
// result.error.issues as the body.`,
      note: "$request->validated() gives you clean data as a mixed array; the Zod pipeline gives you clean data AND its exact TypeScript type — data.agee is a compile error.",
    },
    {
      label: "Query strings: filter_var vs z.coerce",
      intro:
        "Read ?page= from the query string, where every value arrives as a string. Both coerce; only one returns something the type system understands.",
      php: `<?php
// PHP: filter_var validates and coerces...
$page = filter_var(
    $_GET['page'] ?? '1',
    FILTER_VALIDATE_INT,
    ['options' => ['min_range' => 1]]
);
// ...but returns int|false, and static analysis can't
// see the constraint — you re-check by hand:
if ($page === false) {
    $page = 1;
}`,
      ts: `// Zod: coerce, constrain, default — typed end to end.
import { z } from "zod";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

app.get("/users", (req, res) => {
  const { page } = listQuery.parse(req.query);
  // page: number — never a string, never false, never NaN.
  res.json({ page });
});`,
      note: "z.coerce runs Number() before validating — built for query strings and form posts where everything is a string, the same job filter_var did with a clumsier return type.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Zod in miniature, hand-rolled with zero imports: a 'schema' of field checkers, a safeParse that collects errors, and an Infer type that derives the output type from the schema — run it against a good and a bad payload.",
    code: `// What Zod automates, demystified: checkers return a typed
// value or an error, and the schema's TS type is DERIVED.

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type Checker<T> = (input: unknown) => Result<T>;

const isString: Checker<string> = (input) =>
  typeof input === "string"
    ? { ok: true, value: input }
    : { ok: false, error: "expected string, got " + typeof input };

const isEmail: Checker<string> = (input) => {
  const s = isString(input);
  if (!s.ok) return s;
  return s.value.includes("@")
    ? s
    : { ok: false, error: "not a valid email address" };
};

// Like z.coerce.number(): query strings arrive as strings.
const coerceNumber: Checker<number> = (input) => {
  const n = Number(input);
  return Number.isFinite(n)
    ? { ok: true, value: n }
    : { ok: false, error: "expected a number, got " + JSON.stringify(input) };
};

// A "schema" is just an object of checkers...
const createUserSchema = {
  name: isString,
  email: isEmail,
  age: coerceNumber,
};

// ...and the output type is DERIVED from it — z.infer in miniature:
type Infer<S extends Record<string, Checker<unknown>>> = {
  [K in keyof S]: S[K] extends Checker<infer T> ? T : never;
};
type CreateUser = Infer<typeof createUserSchema>;
// -> { name: string; email: string; age: number }

function safeParse<S extends Record<string, Checker<unknown>>>(
  schema: S,
  input: Record<string, unknown>
): { success: true; data: Infer<S> } | { success: false; errors: Record<string, string> } {
  const data: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const checkers = schema as Record<string, Checker<unknown>>;
  for (const key of Object.keys(schema)) {
    const result = checkers[key](input[key]);
    if (result.ok) data[key] = result.value;
    else errors[key] = result.error;
  }
  return Object.keys(errors).length === 0
    ? { success: true, data: data as Infer<S> }
    : { success: false, errors };
}

// req.body is untrusted 'unknown' until proven otherwise:
const good = safeParse(createUserSchema, {
  name: "Ada", email: "ada@example.com", age: "36", // age: string, coerced
});
const bad = safeParse(createUserSchema, {
  name: 42, email: "not-an-email", age: "old",
});

if (good.success) {
  const user: CreateUser = good.data; // fully typed
  console.log("201:", JSON.stringify(user));
  console.log("     age was coerced: typeof age =", typeof user.age);
}
if (!bad.success) {
  console.log("400:", JSON.stringify({ errors: bad.errors }));
}`,
  },

  keyPoints: [
    "The boundary rule: `req.body` is `any` no matter what your interfaces say — validate at the edge so everything inside the handler works with honest, typed data.",
    "One Zod schema does two jobs: runtime validation AND the static type via `z.infer<typeof schema>` — validation rules and types share one source of truth and cannot drift.",
    "Zod 4 uses top-level string formats: `z.email()`, `z.uuid()`, `z.url()` — the chained `z.string().email()` form is deprecated.",
    "`parse` throws a `ZodError` (pair with error middleware); `safeParse` returns a discriminated union that forces you to handle the failure branch before touching `data`.",
    "`z.coerce.number()` is the `filter_var` of the query string — everything in `req.query` arrives as a string, and coercion plus constraints plus defaults gives you a real typed number.",
    "A `validate(schema)` middleware factory gives Express routes FormRequest ergonomics: invalid input gets a 400 with `error.issues`, and the handler receives the parsed (coerced, defaulted) value.",
  ],

  interview: [
    {
      q: "TypeScript already types your code — why do you still need a runtime validator like Zod?",
      a: "Because TypeScript's types are erased at compile time and HTTP input arrives at runtime — `req.body` is `any` regardless of what interface I write for it. A client can send a string where I expect a number, omit fields, or add hostile extras, and no interface will stop that. Zod closes the gap: the schema validates at runtime, and `z.infer` derives the static type from that same schema, so the boundary check and the type system describe one truth. Coming from Laravel, it's FormRequest thinking — validate at the edge, trust everything inside — with the addition PHP couldn't offer: `$request->validated()` returns a mixed array whose shape lives in your head, while a Zod `safeParse` returns a value whose exact type the compiler enforces everywhere downstream.",
    },
    {
      q: "When do you use parse versus safeParse?",
      a: "They're the same validation with different failure ergonomics. `safeParse` never throws — it returns a discriminated union, `{ success: true, data }` or `{ success: false, error }` — so TypeScript forces the failure branch to be handled before `data` is touchable. I use it where the failure is an expected outcome I respond to locally, like a validate middleware returning a 400 with `error.issues`. `parse` returns the typed value or throws a `ZodError`, which reads cleaner when a central error middleware maps `ZodError` to a 400 anyway — throw at the edge, translate in one place. In Express 5 that's especially tidy since rejected async handlers are forwarded to error middleware automatically. Either way the handler receives the parsed value — coerced and defaulted — not the raw input.",
    },
    {
      q: "How do you handle query-string parameters, where every value arrives as a string?",
      a: "Same problem as PHP's `$_GET`, better tooling. In PHP I'd run `filter_var($_GET['page'], FILTER_VALIDATE_INT)` and then hand-check the `int|false` result, and static analysis never learned anything from it. With Zod I declare `z.coerce.number().int().min(1).default(1)` in an object schema for the query: `z.coerce` runs the JavaScript coercion before validating, then applies constraints and defaults, and the parsed result is a genuine `number` in the type system. So `?page=2` becomes `2`, a missing param becomes the default, and `?page=banana` fails validation with a field-level issue I can return as a 400 — no `false` sentinel, no manual re-checking.",
    },
  ],

  quiz: [
    {
      question: "What does z.infer<typeof createUserSchema> give you?",
      options: [
        "A runtime function that validates faster than safeParse",
        "The TypeScript type derived from the schema, so types and validation can't drift",
        "A JSON Schema document for API documentation",
        "A mocked instance of the schema for tests",
      ],
      answerIndex: 1,
      explain:
        "z.infer is a type-level operator: it extracts the static TypeScript type that a schema produces. Because the type is derived from the runtime validator, changing a rule updates the type everywhere at compile time — the one-source-of-truth guarantee Laravel rules arrays plus docblocks never had.",
    },
    {
      question:
        "Your handler reads req.query.page and needs a number that's at least 1, defaulting to 1. Which Zod schema is right?",
      options: [
        "z.number().int().min(1).default(1)",
        "z.string().min(1).default('1')",
        "z.coerce.number().int().min(1).default(1)",
        "z.infer<number>().min(1)",
      ],
      answerIndex: 2,
      explain:
        "Query-string values always arrive as strings, so plain z.number() rejects '2' before any constraint runs. z.coerce.number() converts first, then validates the int/min constraints and applies the default — the typed successor to filter_var with FILTER_VALIDATE_INT.",
    },
    {
      question: "How does safeParse report failure?",
      options: [
        "It throws a ZodError you catch in error middleware",
        "It returns { success: false, error } — a discriminated union you must check before using data",
        "It returns null, and the errors go to a global Zod registry",
        "It returns the original input unchanged",
      ],
      answerIndex: 1,
      explain:
        "safeParse never throws: it returns { success: true, data } or { success: false, error }, and TypeScript's narrowing means data simply doesn't exist until you've checked success. Throwing a ZodError is parse's behaviour — useful when a central error handler translates it to a 400.",
    },
    {
      question:
        "In a validate(schema) middleware, why assign result.data back to req.body instead of leaving the original body?",
      options: [
        "It's required or Express discards the request",
        "result.data is the parsed value — coerced, defaulted, and validated — not the raw input",
        "It encrypts the body for downstream middleware",
        "It converts the body back to a JSON string for logging",
      ],
      answerIndex: 1,
      explain:
        "Zod doesn't just approve the input, it transforms it: coercions applied, defaults filled, and the value matching the schema's inferred type. Handlers should consume that parsed value, not the raw payload — otherwise a defaulted or coerced field silently differs from what the type claims.",
    },
  ],
};

export default lesson;
