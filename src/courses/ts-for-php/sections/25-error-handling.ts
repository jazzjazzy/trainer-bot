import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "error-handling",
  title: "Error Handling & Exceptions",
  part: "Modern Runtime & Async",
  estMinutes: 14,
  summary:
    "How throw/try/catch/finally maps almost one-to-one from PHP, with two key twists: the caught value is typed unknown, and you can't catch-by-class in the clause.",

  concept: `
This is one of the most comfortable topics for a PHP developer, because the
keywords are identical: \`throw\`, \`try\`, \`catch\`, \`finally\`. The mechanics are the
same too — an exception unwinds the stack until something catches it. There are
exactly **two** things that will trip you up, and both come straight from
TypeScript's type system.

### throw / try / catch / finally

\`\`\`ts
try {
  doRiskyThing();
} catch (err) {
  console.error("it blew up:", err);
} finally {
  cleanup(); // always runs — like PHP's finally
}
\`\`\`

Just like PHP, \`finally\` runs whether or not an exception was thrown, and even if
you \`return\` from inside the \`try\`. Nothing surprising here.

### The Error class and custom subclasses

JavaScript ships a built-in \`Error\` class (plus \`TypeError\`, \`RangeError\`, etc.).
You subclass it exactly like you'd extend \`\\Exception\` in PHP:

\`\`\`ts
class NotFoundError extends Error {
  constructor(public readonly id: string) {
    super(\`No record with id \${id}\`);
    this.name = "NotFoundError";
  }
}
\`\`\`

Technically you can \`throw\` *any* value in JS (a string, a number, an object) —
but **always throw an \`Error\` instance**. In every real runtime, only \`Error\` instances get a populated stack trace.

### Twist #1 — the caught value is \`unknown\`

Since TypeScript 4.4, the variable in \`catch (err)\` is typed **\`unknown\`**, not
\`any\`. The compiler refuses to assume it's an \`Error\`, because *anything* can be
thrown. You must **narrow** it before you can use it:

\`\`\`ts
catch (err) {
  if (err instanceof Error) console.log(err.message); // safe
  else console.log("unknown throw:", err);
}
\`\`\`

### Twist #2 — you can't catch by type in the clause

In PHP you write \`catch (NotFoundError $e)\` and the runtime routes by class. In TS
there is **one** \`catch\` block — you branch *inside* it with \`instanceof\`:

\`\`\`ts
catch (err) {
  if (err instanceof NotFoundError) return handle404(err);
  if (err instanceof Error) return logAndRethrow(err);
  throw err; // re-throw anything you don't recognise
}
\`\`\`

### Errors as values — the Result pattern

A popular alternative avoids exceptions for *expected* failures. You return a
discriminated union — a \`Result\`/\`Either\` type — so the caller is forced by the
compiler to handle both outcomes:

\`\`\`ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
\`\`\`

Reserve \`throw\` for truly *exceptional* situations; use \`Result\` for failures you
expect (validation, "not found", parse errors).
`,

  comparisons: [
    {
      label: "try / catch / finally",
      intro:
        "Wrap a risky data fetch so that any failure is logged and the connection is closed no matter what. The expected result is identical control flow in both languages.",
      php: `<?php
try {
    $data = fetchData();
} catch (\\Throwable $e) {
    error_log($e->getMessage());
} finally {
    closeConnection();
}`,
      ts: `try {
  const data = fetchData();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
} finally {
  closeConnection();
}`,
      note:
        "Same keywords and same finally semantics. The catch difference: TS gives you `unknown`, so you narrow before reading `.message`.",
    },
    {
      label: "Defining a custom exception",
      intro:
        "Create a dedicated NotFoundError type that carries the missing record id and a readable message. The goal is a reusable error class you can later catch and inspect.",
      php: `<?php
class NotFoundError extends \\Exception
{
    public function __construct(
        public readonly string $id
    ) {
        parent::__construct("No record with id $id");
    }
}`,
      ts: `class NotFoundError extends Error {
  constructor(public readonly id: string) {
    super(\`No record with id \${id}\`);
    this.name = "NotFoundError";
  }
}`,
      note:
        "Almost identical. In JS you set `this.name` yourself; the message goes to `super(...)`.",
    },
    {
      label: "Catching by type",
      intro:
        "Load a user and react differently depending on the failure: render a 404 when the record is missing, or a 500 for anything else. The result is type-specific handling driven off the thrown error.",
      php: `<?php
try {
    $u = loadUser($id);
} catch (NotFoundError $e) {
    return render404();
} catch (\\Throwable $e) {
    return render500($e);
}`,
      ts: `try {
  const u = loadUser(id);
} catch (err) {
  if (err instanceof NotFoundError) return render404();
  if (err instanceof Error) return render500(err);
  throw err;
}`,
      note:
        "PHP routes by class in the clause. TS has one catch block — you branch with `instanceof` inside it.",
    },
    {
      label: "Errors as values (Result pattern)",
      intro:
        "Parse a string into an age without throwing, returning a tagged value that says whether it succeeded. The caller then inspects that value to decide what to do.",
      php: `<?php
// PHP usually just throws, but you can return a tagged result:
function parseAge(string $s): array {
    if (!ctype_digit($s)) {
        return ['ok' => false, 'error' => 'not a number'];
    }
    return ['ok' => true, 'value' => (int) $s];
}`,
      ts: `type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function parseAge(s: string): Result<number, string> {
  const n = Number(s);
  return Number.isInteger(n)
    ? { ok: true, value: n }
    : { ok: false, error: "not a number" };
}`,
      note:
        "TS's discriminated union makes the compiler force the caller to check `ok` before reading `value` — far safer than a loose PHP array.",
    },
  ],

  playground: {
    intro:
      "A custom Error subclass thrown, caught, narrowed with instanceof, and logged cleanly. Try changing the id to '42' to take the happy path.",
    code: `// A custom error type — extends the built-in Error, just like PHP extends Exception.
class NotFoundError extends Error {
  constructor(public readonly id: string) {
    super(\`No record with id \${id}\`);
    this.name = "NotFoundError";
  }
}

function loadUser(id: string): string {
  if (id !== "42") {
    throw new NotFoundError(id);
  }
  return "Ada Lovelace";
}

try {
  const user = loadUser("99");
  console.log("Loaded:", user);
} catch (err) {
  // The caught value is 'unknown' in TS — narrow it before use.
  if (err instanceof NotFoundError) {
    console.log(\`Handled 404 for id=\${err.id}: \${err.message}\`);
  } else if (err instanceof Error) {
    console.log("Unexpected error:", err.message);
  } else {
    console.log("Something non-Error was thrown:", err);
  }
} finally {
  console.log("finally always runs (closing resources)");
}`,
  },

  keyPoints: [
    "`throw` / `try` / `catch` / `finally` work just like PHP — same keywords, same `finally` guarantees.",
    "Subclass the built-in `Error` for custom exceptions; remember to set `this.name`.",
    "Since TS 4.4 the caught value is typed **`unknown`** — you must narrow it (usually with `instanceof Error`) before reading `.message`.",
    "There is no catch-by-class clause: use **one** `catch` block and branch with `instanceof` inside it.",
    "Always throw `Error` instances — in every real runtime, only they get a populated stack trace.",
    "For *expected* failures, prefer the **Result/Either** pattern (errors as values) so the compiler forces the caller to handle them.",
  ],

  interview: [
    {
      q: "Why is the variable in a TypeScript catch block typed `unknown`, and how do you handle it?",
      a: "Because JavaScript lets you `throw` literally any value — a string, a number, an object, not just an `Error`. The compiler can't assume the caught thing is an `Error`, so since TS 4.4 it types it as `unknown`. You **narrow** before using it, typically `if (err instanceof Error) { ...err.message... }`, falling back to a generic branch for anything else. (You can force the old behaviour with `useUnknownInCatchVariables: false`, but `unknown` is the safe default.)",
    },
    {
      q: "How do you catch different exception types, given there's no `catch (NotFoundError $e)` syntax?",
      a: "TypeScript/JavaScript has a single `catch` block per `try`. You branch inside it with `instanceof`:\n\n```ts\ncatch (err) {\n  if (err instanceof NotFoundError) return handle404(err);\n  if (err instanceof Error) return log(err);\n  throw err; // re-throw what you don't recognise\n}\n```\n\nThe key habit coming from PHP: explicitly **re-throw** anything you didn't mean to swallow, instead of relying on the runtime to skip to the next clause.",
    },
    {
      q: "When would you use the Result pattern instead of throwing?",
      a: "Use `throw` for *exceptional, unexpected* conditions (programmer errors, lost connections). Use a **`Result<T, E>`** discriminated union for *expected* failures that are part of normal flow — validation, parsing, 'not found'. The win is that a `Result` is a value the compiler tracks: the caller can't read `.value` without first checking `ok`, so failures can't be silently ignored. Exceptions are invisible to the type system — a function's signature doesn't tell you what it throws.",
    },
    {
      q: "What's the right way to define a custom error in TypeScript?",
      a: "Extend the built-in `Error`, pass the message to `super(...)`, and set `this.name` so logs and stack traces show the right label:\n\n```ts\nclass ValidationError extends Error {\n  constructor(public readonly field: string) {\n    super(`Invalid value for ${field}`);\n    this.name = \"ValidationError\";\n  }\n}\n```\n\nThis mirrors extending `\\Exception` in PHP. Attach any structured data (like `field`) as readonly properties so `catch` handlers can use it after an `instanceof` check.",
    },
  ],

  quiz: [
    {
      question: "In modern TypeScript (4.4+), what is the type of `err` in `catch (err)`?",
      options: ["any", "Error", "unknown", "Throwable"],
      answerIndex: 2,
      explain:
        "Because any value can be thrown, TS types the caught variable as `unknown`, forcing you to narrow (e.g. with `instanceof Error`) before using it.",
    },
    {
      question: "How do you catch a specific error subclass in TypeScript?",
      options: [
        "catch (e: NotFoundError) { ... }",
        "Use one catch block and check `e instanceof NotFoundError` inside it",
        "Add multiple catch clauses, one per type, like PHP",
        "Annotate the try block with the expected error type",
      ],
      answerIndex: 1,
      explain:
        "There is a single catch block. You branch on the error type inside it using `instanceof`, and re-throw anything you don't handle.",
    },
    {
      question: "What is the main advantage of the Result/Either pattern over throwing?",
      options: [
        "It runs faster because it skips the stack trace",
        "The compiler forces the caller to handle the failure case before using the value",
        "It automatically logs errors to the console",
        "It lets you catch errors by class in the catch clause",
      ],
      answerIndex: 1,
      explain:
        "A `Result<T, E>` is a value tracked by the type system: the caller must check `ok` (narrowing the union) before reading `value`, so expected failures can't be silently ignored.",
    },
  ],
};

export default lesson;
