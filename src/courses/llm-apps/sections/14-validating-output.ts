import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "validating-output",
  title: "Validate at the Boundary: Schemas and Retries",
  part: "Structured Output & Tools",
  estMinutes: 11,
  summary:
    "Structured output guarantees shape, not meaning — treat model output like a form POST: validate at the boundary, retry once with the error fed back, then fail closed.",

  concept: `
Structured output guarantees the **shape** of the JSON — types, required
fields, enums, no invented keys. It does not guarantee the **meaning**. A
schema can promise \`severity\` is an integer; it cannot promise the integer
is between 1 and 5, that \`sku\` refers to a product that exists, or that
\`assignee\` is a real user. Model output is input from a source you don't
control, and the rule you already know from PHP applies unchanged: **never
trust input at the boundary — validate it before it touches your database
or your UI.** It is the \`$_POST\` you check before the \`INSERT\`, not a
value you can assume is clean.

### Two layers: schema, then semantics

Split validation into what the schema *can* express and what it can't:

- **Structural** — types, required fields, enums, "no extra keys". The API
  enforces most of this when you pass a JSON schema. One gap worth
  remembering: **numeric \`minimum\`/\`maximum\` are not enforced
  server-side**, so a \`severity\` of 47 can still come back from a raw
  \`json_schema\`. (In TypeScript, \`zodOutputFormat\` re-checks ranges
  client-side; a hand-written schema won't.)
- **Semantic** — the rules only your system knows: this SKU exists, this
  date is in the future, this enum value maps to a real workflow state,
  these two fields agree with each other. No schema expresses "the ID
  refers to a real row" — that is a lookup, and it is always your job.

\`\`\`ts
import { z } from "zod";

const Ticket = z.object({
  sku: z.string(),
  category: z.enum(["billing", "bug", "feature", "other"]),
  severity: z.number().int().min(1).max(5),
});

const parsed = Ticket.safeParse(rawObject); // structural
if (!parsed.success) reject(parsed.error.issues);
if (!(await skuExists(parsed.data.sku))) reject("unknown SKU"); // semantic
\`\`\`

### The validate-or-retry loop

The model that produced a bad field will usually fix it if you tell it
exactly what broke. So the production pattern is not "crash on the first
bad output" and not "loop until it works" — it is **one guided retry**:
parse, validate, and on failure re-prompt once with the concrete
validation error appended to the conversation, then give up. This is the
same idea as Guzzle middleware that retries a flaky call once with better
information, not an infinite loop.

\`\`\`ts
for (let attempt = 0; attempt < 2; attempt++) {
  const out = await callModel(messages);
  const check = Ticket.safeParse(out);
  if (check.success) return check.data;
  messages.push({ role: "assistant", content: out });
  messages.push({
    role: "user",
    content: "That failed validation: " + summarise(check.error) +
             ". Return corrected JSON.",
  });
}
throw new Error("no valid output after one retry — failing closed");
\`\`\`

### Fail closed, and keep the rejects

When the retry also fails, **fail closed** — return an error, queue the
item for a human, do *not* write half-valid data. And log every reject:
the raw model output plus the validation error is the highest-signal
material you have for improving the prompt and building an eval set later.
Today's rejected payload is tomorrow's regression test.
`,

  comparisons: [
    {
      label: "Straight into the INSERT vs validate at the boundary",
      intro:
        "Both take the model's parsed JSON and record a support ticket. One trusts the parse and writes it; the other treats it like a form POST — structural check, then a semantic lookup — before anything hits the database.",
      php: `// first attempt: it parsed, so ship it
const data = JSON.parse(msg.content[0].text);

// straight into the database, trusting the model like it's
// trusted input. category might be "billing issue" (not a real
// enum), severity might be 7 on a 1-5 scale, sku might not exist.
// The INSERT is where you find out — or worse, you don't.
await db.query(
  "INSERT INTO tickets (sku, category, severity) VALUES (?, ?, ?)",
  [data.sku, data.category, data.severity],
);`,
      ts: `// production: validate at the boundary, like a form POST
import { z } from "zod";

const Ticket = z.object({
  sku: z.string(),
  category: z.enum(["billing", "bug", "feature", "other"]),
  severity: z.number().int().min(1).max(5),
});

// Layer 1 — structure (types, enum, range):
const parsed = Ticket.safeParse(JSON.parse(msg.content[0].text));
if (!parsed.success) {
  throw new BoundaryError(parsed.error.issues);
}

// Layer 2 — semantics the schema can't express:
if (!(await skuExists(parsed.data.sku))) {
  throw new BoundaryError([{ field: "sku", message: "unknown SKU" }]);
}

await insertTicket(parsed.data); // nothing unvalidated reaches here`,
      note: "Zod re-checks the enum and the 1-5 range (which the API doesn't enforce server-side); the SKU lookup is a rule no schema can express. The boundary, not the INSERT, is where bad data stops.",
    },
    {
      label: "Crash on first bad output vs one guided retry",
      intro:
        "A classifier turns a review into a Ticket. The left version parses once and throws on any bad field; the right re-prompts once with the exact validation error, then fails closed.",
      php: `// first attempt: one shot, no recovery
const data = Ticket.parse(JSON.parse(msg.content[0].text));

// If the model returned severity: 7, .parse() throws and the
// whole request 500s. One fixable field = a failed feature —
// even though the model would correct it if you just told it
// what broke.
return data;`,
      ts: `// production: validate, and on failure re-prompt ONCE
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

async function classify(review: string) {
  const messages = [{ role: "user", content: review }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await client.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages,
      output_config: { format: zodOutputFormat(Ticket) },
    });

    const check = Ticket.safeParse(msg.parsed_output);
    if (check.success) return check.data;

    // Feed the concrete error back; let the model correct itself.
    messages.push({ role: "assistant", content: msg.content });
    messages.push({
      role: "user",
      content:
        "That failed validation: " +
        JSON.stringify(check.error.issues) +
        ". Return corrected JSON.",
    });
    logReject(review, msg.parsed_output, check.error); // future eval data
  }

  throw new Error("no valid output after one retry — failing closed");
}`,
      note: "One retry with the specific error usually fixes a fixable mistake; after that, fail closed rather than loop forever or write bad data. Every reject is logged as tomorrow's regression test.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The validate -> re-prompt -> accept cycle, made concrete. A scripted model returns the right SHAPE but breaks the business rules on the first call, then corrects once it's told exactly what failed. Predict how many attempts it takes and whether the row is ever written.",
    code: `// Model output is untrusted input. A schema can guarantee the SHAPE;
// business rules (known SKU, valid category, severity in range) are
// yours to enforce at the boundary — like validating a form POST
// before an INSERT.

type Reject = { field: string; problem: string };

const KNOWN_SKUS = ["KB-101", "MON-27", "USB-9"];
const CATEGORIES = ["billing", "bug", "feature", "other"];

// The semantic layer no JSON schema can express server-side:
function validate(obj: { sku: unknown; category: unknown; severity: unknown }): Reject[] {
  const rejects: Reject[] = [];
  if (typeof obj.sku !== "string" || !KNOWN_SKUS.includes(obj.sku)) {
    rejects.push({ field: "sku", problem: "unknown SKU " + JSON.stringify(obj.sku) });
  }
  if (typeof obj.category !== "string" || !CATEGORIES.includes(obj.category)) {
    rejects.push({ field: "category", problem: "not one of " + CATEGORIES.join("/") });
  }
  if (typeof obj.severity !== "number" || obj.severity < 1 || obj.severity > 5) {
    rejects.push({ field: "severity", problem: "must be 1-5, got " + obj.severity });
  }
  return rejects;
}

// A scripted model: wrong on the first call (right shape, wrong
// meaning), corrected once the re-prompt carries the errors.
function fakeModel(rePromptHasErrors: boolean) {
  if (!rePromptHasErrors) {
    return { sku: "KB-101", category: "billing issue", severity: 7 };
  }
  return { sku: "KB-101", category: "billing", severity: 3 };
}

function classifyTicket() {
  const MAX_ATTEMPTS = 2;
  let errors: Reject[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const carryErrors = errors.length > 0;
    console.log("attempt " + attempt + ": re-prompt carries errors? " + carryErrors);

    const out = fakeModel(carryErrors);
    console.log("  model returned: " + JSON.stringify(out));

    errors = validate(out);
    if (errors.length === 0) {
      console.log("  validated OK -> safe to INSERT");
      return out;
    }

    console.log("  REJECTED:");
    for (const r of errors) {
      console.log("    - " + r.field + ": " + r.problem);
    }
    // In production you'd also logReject(out, errors) here as eval data.
  }

  console.log("  failed closed after " + MAX_ATTEMPTS + " attempts");
  return null;
}

const row = classifyTicket();
console.log("");
console.log("final: " + (row ? JSON.stringify(row) : "null (nothing written)"));`,
  },

  keyPoints: [
    "Structured output guarantees shape (types, required fields, enums); it does not guarantee meaning — treat model output like an untrusted form POST and validate before it touches your DB or UI.",
    "Numeric `minimum`/`maximum` are not enforced server-side; in TypeScript `zodOutputFormat` re-checks ranges client-side, but a raw `json_schema` won't — so range checks stay your responsibility.",
    "Semantic rules — this ID exists, this date is in range, these fields agree — are lookups no schema can express. They are always yours to run.",
    "The production pattern is validate-or-retry: parse, validate, and on failure re-prompt ONCE with the concrete error appended, then stop.",
    "When the retry also fails, fail closed — error out or queue for a human; never write half-valid data or loop forever.",
    "Log every reject (raw output + validation error): it's the highest-signal material for improving the prompt and building an eval set.",
  ],

  interview: [
    {
      q: "You're using the API's structured output, so the JSON always parses. Why still validate it?",
      a: "Because structured output guarantees shape, not meaning. It enforces types, required fields, and enums, and blocks invented keys — but it doesn't enforce numeric ranges server-side, and it can't know that a `sku` refers to a real product, that an `assignee` is a real user, or that two fields agree. That's semantic validation, and it's the same reason I never trust a `$_POST` straight into an `INSERT` in PHP: the data came from outside my system. So I validate at the boundary in two layers — structural with a schema like Zod or Pydantic, then semantic with the lookups and cross-field checks only my system can do — before anything reaches the database or the UI.",
    },
    {
      q: "How do you handle a model that returns output failing your validation?",
      a: "One guided retry, then fail closed. The model that produced a bad field will usually fix it if I tell it precisely what was wrong, so on a validation failure I append the assistant turn plus a user message containing the exact validation error and ask for corrected JSON — one time. If that still fails, I stop: return an error, queue the item for a human, and never write partially-valid data. I deliberately avoid an unbounded loop, because that just burns tokens on an output the model can't produce. And I log every reject — the raw output and the error — because that's the best raw material I have for tightening the prompt and building an eval set.",
    },
    {
      q: "What kinds of validation can a JSON schema never do for you?",
      a: "Anything that depends on the state of my system rather than the structure of the payload. Referential integrity — does this order ID, SKU, or user ID actually exist — is a database lookup, not a schema constraint. Cross-field logic — end date after start date, total equals the sum of line items — the schema can't express. Business-state rules — is 'refunded' a legal next status from 'pending' — live in my domain logic. And even some structural-looking constraints, like numeric min/max, aren't enforced server-side. So the schema does the cheap, universal checks and I layer my own validation on top for everything that requires knowing what the data means.",
    },
  ],

  quiz: [
    {
      question:
        "Your response uses output_config with a JSON schema that declares severity as an integer with minimum 1 and maximum 5. Which is true?",
      options: [
        "The API rejects any response where severity is outside 1-5",
        "The API guarantees severity is an integer, but the 1-5 range is not enforced server-side — you must check it yourself",
        "The schema's minimum/maximum are enforced only for the first request, then cached",
        "Numeric ranges are enforced, but only when strict: true is set",
      ],
      answerIndex: 1,
      explain:
        "Structured output enforces types, required fields, and enums, but numeric minimum/maximum are not enforced server-side — a severity of 47 can still come back. In TypeScript zodOutputFormat re-checks ranges client-side; a raw json_schema does not. Range validation belongs in your own boundary layer.",
    },
    {
      question: "What is the recommended response to model output that fails validation?",
      options: [
        "Retry in a loop until the output validates",
        "Silently drop the invalid fields and insert the rest",
        "Re-prompt once with the exact validation error appended, then fail closed if it still fails",
        "Lower the temperature and try again",
      ],
      answerIndex: 2,
      explain:
        "One guided retry — feeding the concrete validation error back so the model can correct itself — fixes most fixable mistakes. After that, fail closed rather than loop forever or write bad data. (Note also that temperature isn't a tunable knob on current Claude models.)",
    },
    {
      question:
        "Which check can a JSON schema NOT perform, no matter how it's written?",
      options: [
        "That a field is one of a fixed set of enum values",
        "That a required field is present",
        "That a field is an integer",
        "That an order_id refers to a row that actually exists in your database",
      ],
      answerIndex: 3,
      explain:
        "Referential integrity — 'does this ID refer to a real row' — depends on your system's state, not the payload's structure, so no schema can express it. That's semantic validation: a lookup you run at the boundary after the structural check passes.",
    },
  ],
};

export default lesson;
