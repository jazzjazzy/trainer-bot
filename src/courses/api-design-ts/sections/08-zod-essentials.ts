import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "zod-essentials",
  title: "Zod Essentials",
  part: "Contracts & Validation",
  estMinutes: 12,
  summary:
    "TypeScript types vanish at runtime, so the boundary needs a validator — zod schemas check the payload at runtime AND generate the static type, one source of truth for both.",

  concept: `
TypeScript's dirty secret for API work: **every type is erased before the
code runs**. \`interface CreateUser\` compiles to nothing. When a client POSTs
\`{"age": "banana"}\` at 2am, no interface will object. In PHP you never had
this illusion — you *knew* \`$_POST\` was untrusted, so you wrote
\`filter_var\` calls and \`is_string\` checks. TypeScript developers have to
re-learn that honesty: at the boundary, you need runtime validation, and the
standard tool is **zod** (v4 is current).

### One schema, two artifacts

\`\`\`ts
import { z } from "zod";

const CreateUser = z.object({
  name: z.string().min(2),
  email: z.email(),
  age: z.number().int().min(13).optional(),
});

// The static type is DERIVED from the schema:
type CreateUser = z.infer<typeof CreateUser>;
// { name: string; email: string; age?: number }
\`\`\`

This is the trick that makes zod the default choice: the schema is the
**runtime validator**, and \`z.infer\` derives the **compile-time type** from
it. With hand-written interfaces plus hand-written checks (the \`filter_var\`
approach), the two inevitably drift; here they physically cannot.

### parse vs safeParse

\`\`\`ts
// parse: returns typed data or THROWS a ZodError
const user = CreateUser.parse(req.body);

// safeParse: never throws — returns a discriminated union
const result = CreateUser.safeParse(req.body);
if (!result.success) {
  for (const issue of result.error.issues) {
    console.log(issue.path.join("."), issue.message);
  }
} else {
  result.data; // typed as CreateUser
}
\`\`\`

Use \`safeParse\` when *this code path* decides what happens on failure (a
handler building a 422 response). Use \`parse\` when failure should propagate
to a central error handler — or when failure is a bug, like config validation.
Failures carry \`error.issues\`: an array of \`{ path, code, message }\`
objects, exactly what you need for field-level API error responses.

### Zod 4 string formats are top-level

In zod 4, format validators moved from methods on \`z.string()\` to top-level
functions — terser and tree-shakable:

\`\`\`ts
z.email();          // NOT z.string().email() — that's deprecated v3 style
z.uuid();
z.url();
z.ipv4();
z.iso.datetime();   // ISO 8601 timestamp
z.iso.date();       // "2026-07-07"
\`\`\`

The old method forms still run, but they're deprecated — writing
\`z.string().email()\` in an interview code exercise quietly dates you.

### Custom messages: one \`error\` param

Zod 4 unified all of v3's error-customisation params (\`message\`,
\`invalid_type_error\`, \`required_error\`, \`errorMap\`) into a single
\`error\`:

\`\`\`ts
z.string().min(5, { error: "Too short." });

// Or a function for conditional messages:
z.string({
  error: (issue) =>
    issue.input === undefined ? "This field is required" : "Not a string",
});
\`\`\`

### The PHP mapping

A zod schema is your \`filter_var\` + \`isset\` + \`is_string\` block done
properly: declarative instead of imperative, composable, reusable, and with
the static type generated for free. One schema replaces the 40-line check
block *and* the doc comment describing the expected shape *and* the interface
— because it *is* all three.
`,

  comparisons: [
    {
      label: "The manual check block vs one declarative schema",
      intro:
        "Validate a create-user payload: name (2+ chars), valid email, optional integer age of 13+. The logic is identical; the maintenance story is not.",
      php: `<?php // create_user.php
$body = json_decode(file_get_contents('php://input'), true);
$errors = [];

if (!is_array($body)) {
    $errors[] = 'body must be a JSON object';
}
if (!isset($body['name']) || !is_string($body['name'])
    || mb_strlen($body['name']) < 2) {
    $errors['name'] = 'name must be a string of 2+ chars';
}
if (!isset($body['email'])
    || !filter_var($body['email'], FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'valid email required';
}
if (array_key_exists('age', $body)) {
    if (!is_int($body['age']) || $body['age'] < 13) {
        $errors['age'] = 'age must be an integer >= 13';
    }
}
if ($errors) {
    http_response_code(422);
    echo json_encode(['errors' => $errors]);
    exit;
}
// ...and the "expected shape" lives only in your head`,
      ts: `// schemas/user.ts
import { z } from "zod";

export const CreateUser = z.object({
  name: z.string().min(2),
  email: z.email(),
  age: z.number().int().min(13).optional(),
});
export type CreateUser = z.infer<typeof CreateUser>;

// handlers/createUser.ts
const result = CreateUser.safeParse(req.body);
if (!result.success) {
  return send422(res, result.error.issues);
}
const user: CreateUser = result.data; // fully typed`,
      note: "The schema is simultaneously the validation logic, the documentation of the expected shape, and (via z.infer) the static type — three artifacts that can't drift because they're one declaration.",
    },
    {
      label: "Zod 3 habits vs Zod 4 APIs",
      intro:
        "The same schema written in deprecated v3 style and in current v4 style. Both still run today — only one is what you should write (and say in interviews).",
      php: `// v3 style — deprecated, still widely seen in old code
const Signup = z.object({
  email: z.string().email({ message: "Invalid email" }),
  website: z.string().url(),
  joined: z.string().datetime(),
  nickname: z.string().min(3, { message: "Too short." }),
  plan: z.string({
    required_error: "plan is required",
    invalid_type_error: "plan must be a string",
  }),
});`,
      ts: `// v4 style — top-level formats, unified error param
const Signup = z.object({
  email: z.email({ error: "Invalid email" }),
  website: z.url(),
  joined: z.iso.datetime(),
  nickname: z.string().min(3, { error: "Too short." }),
  plan: z.string({
    error: (issue) =>
      issue.input === undefined
        ? "plan is required"
        : "plan must be a string",
  }),
});`,
      note: "Two v4 changes to internalise: string formats are top-level functions (z.email, z.url, z.iso.datetime), and message/required_error/invalid_type_error/errorMap all collapsed into one `error` param that takes a string or a function.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "parse vs safeParse — pick by who handles failure",
      intro:
        "Two boundaries, two failure policies: a request handler that must build a 422 itself, and boot-time config where failure should crash loudly.",
      php: `// handlers/createUser.ts — THIS code owns the failure
const result = CreateUser.safeParse(req.body);
if (!result.success) {
  // turn issues into a 422 response body
  const errors = result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
  return sendProblem(res, 422, errors);
}
createUser(result.data);`,
      ts: `// config.ts — failure here is a deploy bug: crash NOW
const Env = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int(),
});

// parse throws ZodError -> process exits at boot,
// not at the first request that touches the config
export const config = Env.parse(process.env);`,
      note: "safeParse where the caller turns failure into a response; parse where failure should propagate or crash. Same schema machinery, different failure ownership.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Imports don't run here, so this is a hand-rolled miniature of zod's API shape — safeParse returning a success/issues union, and parse that throws. Predict which payloads pass. In real code, z.object({...}) plus z.infer gives you ALL of this from one declaration.",
    code: `// A hand-rolled miniature of zod's API shape. In real code,
// z.object({...}) gives you all of this for free — plus the
// static type via z.infer<typeof CreateUser>.

interface Issue {
  path: string;
  message: string;
}
type SafeResult<T> =
  | { success: true; data: T }
  | { success: false; issues: Issue[] };

interface CreateUser {
  name: string;
  email: string;
  age?: number;
}

const emailRe = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/;

const CreateUserSchema = {
  safeParse(input: unknown): SafeResult<CreateUser> {
    if (typeof input !== "object" || input === null) {
      return {
        success: false,
        issues: [{ path: "(root)", message: "Expected object" }],
      };
    }
    const o = input as Record<string, unknown>;
    const issues: Issue[] = [];
    if (typeof o.name !== "string" || o.name.length < 2) {
      issues.push({ path: "name", message: "Expected string, 2+ chars" });
    }
    if (typeof o.email !== "string" || !emailRe.test(o.email)) {
      issues.push({ path: "email", message: "Invalid email address" });
    }
    if (o.age !== undefined && (!Number.isInteger(o.age) || (o.age as number) < 13)) {
      issues.push({ path: "age", message: "Expected integer >= 13" });
    }
    if (issues.length > 0) return { success: false, issues };
    return {
      success: true,
      data: {
        name: o.name as string,
        email: o.email as string,
        age: o.age as number | undefined,
      },
    };
  },
  // parse = safeParse that throws instead of returning the failure:
  parse(input: unknown): CreateUser {
    const result = this.safeParse(input);
    if (!result.success) {
      throw new Error(result.issues.map((i) => i.path + ": " + i.message).join("; "));
    }
    return result.data;
  },
};

const payloads: unknown[] = [
  { name: "Ada", email: "ada@example.com", age: 36 },
  { name: "A", email: "not-an-email" },
  "just a string",
];

for (const p of payloads) {
  const result = CreateUserSchema.safeParse(p);
  if (result.success) {
    console.log("OK   " + JSON.stringify(result.data));
  } else {
    console.log("FAIL " + result.issues.map((i) => i.path + " (" + i.message + ")").join(", "));
  }
}

// parse() throws — this is what you catch and turn into a 422:
try {
  CreateUserSchema.parse({ name: "Ada" });
} catch (err) {
  console.log("threw: " + (err as Error).message);
}`,
  },

  keyPoints: [
    "TypeScript types are erased at runtime — an interface validates nothing, so every API boundary needs a runtime validator. Zod is that validator.",
    "One schema yields both artifacts: runtime validation AND the static type via `z.infer<typeof Schema>` — hand-written interfaces and hand-written checks drift; a derived type can't.",
    "`parse` throws a ZodError (let a central handler or boot crash deal with it); `safeParse` returns a `{ success, data | error }` union for code that owns the failure response.",
    "Validation failures expose `error.issues` — an array of `{ path, code, message }` — the raw material for field-level 422 responses.",
    "Zod 4 formats are top-level: `z.email()`, `z.uuid()`, `z.url()`, `z.iso.datetime()`. The `z.string().email()` method forms are deprecated v3 style.",
    "Zod 4 unified error customisation into a single `error` param (string or function), replacing v3's `message`, `required_error`, `invalid_type_error`, and `errorMap`.",
  ],

  interview: [
    {
      q: "TypeScript already has static types — why do you need zod at an API boundary?",
      a: "Because static types are erased before the code runs. `interface CreateUser` compiles to nothing; at runtime `req.body` is whatever bytes the client sent, and a cast like `as CreateUser` is an unchecked assertion. Coming from PHP, I'd put it this way: TypeScript gives you the discipline PHP never had *inside* your codebase, but the network boundary is still PHP-style untrusted input, and needs the equivalent of `filter_var` checks. Zod does that at runtime — and crucially, `z.infer` derives the static type from the same schema, so the runtime check and the compile-time type are one declaration that can't drift apart. Validate at the edge, and everything inward operates on genuinely trustworthy typed data.",
    },
    {
      q: "When do you use parse versus safeParse?",
      a: "I choose by who owns the failure. `safeParse` returns a discriminated union — `{ success: false, error }` instead of throwing — so I use it where the local code decides the outcome, typically a request handler that turns `error.issues` into a 422 response with field-level detail. `parse` throws a ZodError, so I use it where failure should propagate: to centralised error middleware that formats all validation failures uniformly, or at boot when validating config — there a throw is exactly right because a misconfigured process should crash immediately rather than limp along. Same validation, different failure-handling ergonomics.",
    },
    {
      q: "What changed in zod 4 that someone maintaining zod 3 code should know?",
      a: "Two headline API changes. First, string formats moved to top-level functions: `z.email()`, `z.uuid()`, `z.url()`, `z.iso.datetime()` replace the deprecated `z.string().email()` method chains — terser and better for tree-shaking. Second, error customisation was unified: v3's four overlapping params — `message`, `required_error`, `invalid_type_error`, and `errorMap` — collapsed into a single `error` param that accepts a string or a function receiving the issue, so conditional messages like 'required vs wrong type' are one small function. The deprecated forms still work, which makes migration incremental, but new code should be written v4-style. The core workflow — `z.object`, `parse`/`safeParse`, `z.infer` — is unchanged.",
    },
  ],

  quiz: [
    {
      question: "What does `type CreateUser = z.infer<typeof CreateUser>` give you?",
      options: [
        "A runtime copy of the schema for faster validation",
        "The static TypeScript type derived from the schema, so the type can never drift from the validator",
        "A JSON Schema document for the OpenAPI spec",
        "Nothing — z.infer only works on primitive schemas",
      ],
      answerIndex: 1,
      explain:
        "z.infer extracts the compile-time type that the schema validates at runtime. Because the type is derived rather than hand-written, updating the schema automatically updates the type — the classic failure mode of interface-plus-manual-checks (silent drift) becomes impossible.",
    },
    {
      question: "Which is the correct current (zod 4) way to validate an email field with a custom message?",
      options: [
        'z.string().email({ message: "Invalid email" })',
        'z.email({ error: "Invalid email" })',
        'z.string({ invalid_type_error: "Invalid email" }).email()',
        'z.format("email", "Invalid email")',
      ],
      answerIndex: 1,
      explain:
        "Zod 4 moved string formats to top-level functions (z.email, z.uuid, z.url, z.iso.datetime) and unified all message customisation into the single `error` param. Options using z.string().email() or message/invalid_type_error are deprecated v3 style — they still run, but they're not what you should write.",
    },
    {
      question: "A request handler needs to return a 422 listing every invalid field. Which call and property fit?",
      options: [
        "parse(), then read err.fields in the catch block",
        "safeParse(), then iterate result.error.issues for path and message on failure",
        "safeParse(), then read result.data — it contains the errors",
        "validate(), which returns a boolean",
      ],
      answerIndex: 1,
      explain:
        "safeParse never throws; on failure it returns { success: false, error }, and error.issues is the array of { path, code, message } objects — one per problem — that maps directly onto a field-level 422 body. result.data only exists on success, and zod has no boolean validate() method.",
    },
  ],
};

export default lesson;
