import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "typing-the-real-world",
  title: "Typing the Real World",
  part: "Ecosystem & Interview",
  estMinutes: 15,
  summary:
    "Compile-time types vanish at runtime, so any data crossing into your program from outside must be validated at the boundary — exactly the discipline you already apply to user input in PHP.",

  concept: `
By now you trust the type checker. Inside your own code that trust is earned: every
value was created by typed code, so its type is real. But the moment data comes from
**outside your program** — an HTTP response, a JSON body, a query string, an env var,
a file — that trust evaporates. TypeScript checked your *source*, not the bytes a
server actually sent.

### The trust boundary

Two functions hand you values that TypeScript refuses to vouch for:

\`\`\`typescript
const data = JSON.parse(raw);        // type: any
const res = await fetch("/api/user");
const user = await res.json();        // type: any (Promise<any>)
\`\`\`

\`JSON.parse\` returns \`any\` and \`res.json()\` returns \`Promise<any>\`. \`any\` is a
trapdoor: it disables checking entirely, so \`user.naem.toUpperCase()\` compiles fine
and explodes at runtime. The honest type for "I don't know what this is yet" is
\`unknown\` — like \`any\`, it can hold anything, but unlike \`any\` it forces you to
*prove* the shape before you touch it.

> Remember section 1: **types are erased**. There is no \`int $a\` check waiting at
> runtime like PHP's \`strict_types\`. If you want a runtime guarantee, you must write
> a runtime check.

### Validate at the boundary

This is not new to you. In PHP you never trust \`$_POST\` — you run \`filter_var\`,
check \`json_decode\` for \`null\`, verify keys exist. Same job here. Two approaches:

**Hand-written type guards** — a function returning \`x is SomeType\`:

\`\`\`typescript
type User = { id: number; name: string };
function isUser(x: unknown): x is User {
  return (
    typeof x === "object" && x !== null &&
    typeof (x as Record<string, unknown>).id === "number" &&
    typeof (x as Record<string, unknown>).name === "string"
  );
}
\`\`\`

After \`if (isUser(data))\`, TypeScript narrows \`data\` to \`User\` inside the block.

**A validation library — zod** — declare the schema once, derive the type from it:

\`\`\`typescript
import { z } from "zod";
const User = z.object({ id: z.number(), name: z.string() });
type User = z.infer<typeof User>;        // type derived from the schema
const user = User.parse(data);            // throws if data is the wrong shape
\`\`\`

One source of truth: the schema *is* both the runtime check and the static type.

### Env, config, props, handlers

The same boundary thinking applies everywhere external data enters:

- **Env vars** are \`string | undefined\` — validate and coerce (\`Number(process.env.PORT)\`).
- **React props** are typed with an \`interface\`, but data fetched *inside* the
  component still needs validating.
- A **Node request handler** receives an untyped \`req.body\` — narrow it before use.
`,

  comparisons: [
    {
      label: "Parsing JSON safely",
      intro:
        "A raw JSON string has arrived from the network and we need to turn it into a trusted User object. The goal is to decode it and reject the request unless it actually has the fields we expect.",
      php: `<?php
$data = json_decode($raw, true);
if (!is_array($data) || !isset($data['id'], $data['name'])) {
    throw new RuntimeException('Bad payload');
}
// $data is now trusted`,
      ts: `const data: unknown = JSON.parse(raw);
if (!isUser(data)) {
  throw new Error("Bad payload");
}
// data is now narrowed to User`,
      note:
        "Both decode then check. PHP's json_decode returns null on failure; JS's JSON.parse throws — but in both, the result is untrusted until verified.",
    },
    {
      label: "Validating a scalar from outside",
      intro:
        "A submitted form gives us an email field whose value we cannot trust. We want to confirm it is a non-empty string that looks like an email and bail out otherwise, ending with a value the type system treats as a clean string.",
      php: `<?php
$email = filter_var($_POST['email'] ?? '', FILTER_VALIDATE_EMAIL);
if ($email === false) {
    throw new InvalidArgumentException('Invalid email');
}`,
      ts: `const raw: unknown = body.email;
if (typeof raw !== "string" || !raw.includes("@")) {
  throw new Error("Invalid email");
}
const email: string = raw; // narrowed`,
      note:
        "PHP's filter_var both validates and returns the clean value. In TS a type guard narrows the variable so the compiler trusts it afterwards.",
    },
    {
      label: "Schema-first validation",
      intro:
        "Instead of scattering manual checks, we declare the rules for a User (numeric id, non-empty name) in one schema. The result is a single definition that both validates incoming data and supplies the static type.",
      php: `<?php
// Symfony Validator: constraints declared on a DTO
class UserDto {
    #[Assert\\Type('integer')]
    public int $id;
    #[Assert\\NotBlank]
    public string $name;
}`,
      ts: `import { z } from "zod";
const User = z.object({
  id: z.number(),
  name: z.string().min(1),
});
type User = z.infer<typeof User>; // type from schema`,
      note:
        "Both centralise rules in one place. zod's bonus: z.infer derives the static TypeScript type from the same schema, so there is no separate type to drift.",
    },
    {
      label: "Reading config / env",
      intro:
        "We need a numeric PORT from the environment, falling back to 3000 when it is absent. The goal is to coerce the raw string into a valid positive number and fail loudly if it is garbage.",
      php: `<?php
$port = getenv('PORT');
$port = $port !== false ? (int) $port : 3000;
if ($port <= 0) {
    throw new RuntimeException('Bad PORT');
}`,
      ts: `const raw = process.env.PORT; // string | undefined
const port = raw ? Number(raw) : 3000;
if (Number.isNaN(port) || port <= 0) {
  throw new Error("Bad PORT");
}`,
      note:
        "Env vars are always strings (or absent) in both worlds. TS types it honestly as string | undefined, forcing you to handle the missing case.",
    },
  ],

  playground: {
    intro:
      "A realistic boundary: a JSON string arrives, we parse it into unknown, then a hand-written type guard proves its shape before we dare use it. Try corrupting the JSON (rename \"name\" to \"naem\") and re-run.",
    code: `// The expected shape of trusted data.
interface User {
  id: number;
  name: string;
  active: boolean;
}

// A type guard: returns "x is User", so TS narrows after it.
function isUser(x: unknown): x is User {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "number" &&
    typeof o.name === "string" &&
    typeof o.active === "boolean"
  );
}

// Imagine this string came from fetch() or a request body.
const raw = '{"id": 7, "name": "Ada", "active": true}';

// JSON.parse is effectively untyped — treat the result as unknown.
const parsed: unknown = JSON.parse(raw);

if (isUser(parsed)) {
  // Inside this block, parsed is a real User.
  console.log("Valid user:", parsed.name, "(#" + parsed.id + ")");
  console.log("Active?", parsed.active);
} else {
  console.log("Rejected: payload did not match the User shape");
}

// Now a bad payload — missing 'active', wrong type for 'id':
const bad: unknown = JSON.parse('{"id": "7", "name": "Ada"}');
console.log("Second payload valid?", isUser(bad));`,
  },

  keyPoints: [
    "Data from outside your program (`JSON.parse`, `fetch().json()`, env, files) arrives as `any`/`unknown` — TypeScript never validated the actual bytes.",
    "Prefer `unknown` over `any` for external data: it forces you to prove the shape before use, instead of silently disabling all checks.",
    "**Types are erased at runtime**, so compile-time types give *zero* runtime protection. Validate at the boundary, just like you sanitise `$_POST` in PHP.",
    "Hand-written **type guards** (`x is T`) narrow `unknown` to a concrete type after a runtime check.",
    "Libraries like **zod** declare a schema once and derive the static type with `z.infer`, keeping validation and types in one source of truth.",
    "Env vars are `string | undefined` — coerce and validate them explicitly.",
  ],

  interview: [
    {
      q: "JSON.parse returns a value — why can't you just trust its type?",
      a: "Because `JSON.parse` is typed to return `any`. TypeScript has no idea what JSON string you'll actually pass at runtime, so it can't know the shape. `any` then disables checking on that value entirely, letting typos like `user.naem` compile and crash in production. The safe habit is to assign the result to `unknown` and validate it before use — the same reason you never trust `json_decode($_POST['body'])` in PHP without checking the result.",
    },
    {
      q: "What's the difference between `any` and `unknown`, and which should external data get?",
      a: "Both can hold any value, but `any` *turns off* type checking — you can call any method or access any property with no complaint. `unknown` is the safe counterpart: you can hold anything, but you can't *do* anything with it until you narrow it (via `typeof`, a type guard, etc.). External data should always be `unknown`, because it forces you to prove the shape before trusting it.",
    },
    {
      q: "If TypeScript checks types, why do I still need runtime validation?",
      a: "Because types are **erased** during compilation — the running JavaScript has no type information and performs no checks (unlike PHP's `declare(strict_types=1)`, which checks at runtime). The compiler only verified your source code, not the data a server actually sends. So anything crossing the trust boundary — API responses, request bodies, query params, env vars — must be validated at runtime with a type guard or a library like zod.",
    },
    {
      q: "How does zod improve on hand-written type guards?",
      a: "A hand-written guard means maintaining two things that can drift: the `interface User` and the `isUser` function. With zod you declare a schema once (`z.object({...})`), call `.parse()`/`.safeParse()` for the runtime check, and derive the static type with `type User = z.infer<typeof User>`. One source of truth covers both runtime and compile time, and you get rich, composable validators (email, min length, enums) for free.",
    },
    {
      q: "What type does `process.env.SOME_VAR` have, and what does that force you to do?",
      a: "`string | undefined`. The variable might not be set, and even when it is, it's always a string — never a number or boolean. TypeScript types this honestly, so you're forced to handle the `undefined` case and coerce (`Number(...)`, comparing to `\"true\"`, etc.) plus validate the result. It's the same defensive parsing you'd do around `getenv()` in PHP, but the compiler now insists on it.",
    },
  ],

  quiz: [
    {
      question: "What is the type of the value returned by `JSON.parse(raw)`?",
      options: [
        "`unknown` — you must narrow it before use",
        "`any` — checking is effectively disabled on it",
        "The exact shape inferred from the JSON string",
        "`object`, always",
      ],
      answerIndex: 1,
      explain:
        "JSON.parse is declared to return `any`, which disables type checking on the result. Best practice is to assign it to `unknown` yourself and validate before use.",
    },
    {
      question:
        "Why must you validate API responses at runtime even though your code is fully typed?",
      options: [
        "TypeScript validation is too slow for network code",
        "Types are erased at compile time, so nothing checks the actual data at runtime",
        "fetch() corrupts the response unless you validate it",
        "You don't — the compiler guarantees the response shape",
      ],
      answerIndex: 1,
      explain:
        "TypeScript types exist only at compile time and are erased before the code runs. The compiler never sees the real network data, so runtime validation at the boundary is required.",
    },
    {
      question:
        "What does a type guard function like `function isUser(x: unknown): x is User` do for the compiler?",
      options: [
        "It converts x into a User at runtime by adding missing fields",
        "Nothing — `x is User` is only documentation",
        "It narrows x to `User` in the branch where the guard returns true",
        "It throws automatically when x is not a User",
      ],
      answerIndex: 2,
      explain:
        "The `x is User` return type is a type predicate. When the guard returns true, TypeScript narrows the argument to `User` within that branch; it does not modify or coerce the value.",
    },
  ],
};

export default lesson;
