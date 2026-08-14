import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "json-reliability",
  title: "Structured Output: Getting Reliable JSON",
  part: "Structured Output & Tools",
  estMinutes: 11,
  summary:
    "Prompt-only 'reply with JSON' breaks in production — the current fix is output_config with a JSON schema (or client.messages.parse with a Zod schema), which guarantees parseable, shape-conforming output.",

  concept: `
Sooner or later every LLM feature needs machine-readable output: extract
fields from an email, classify a ticket, produce rows for a table. The first
instinct — add "reply with valid JSON only" to the prompt and call
\`JSON.parse\` — works in the demo and then fails in production, in at least
four distinct ways:

- **Preamble**: \`Sure! Here is the JSON you asked for: {...}\`
- **Markdown fences**: \`\\\`\\\`\\\`json ... \\\`\\\`\\\`\` — models are heavily
  trained to fence code, and JSON is code.
- **Trailing commentary**: \`{...} Let me know if you need anything else!\`
- **Schema drift**: valid JSON, wrong shape — invented fields, \`"sentiment":
  "pretty positive overall"\` where you wanted an enum, a string where you
  wanted a number.

The first three are parse failures; the fourth is worse because it parses
fine and corrupts data downstream. Teams historically fought this with
regex fence-stripping, "find the first \`{\` and last \`}\`" extractors, and
assistant-turn prefills (seeding the reply with \`{\` so the model had to
continue JSON). That last trick is now dead: **prefilling the assistant turn
returns a 400 on current models**. The platform replaced the hacks with a
first-class feature.

### The current fix: output_config

Pass a JSON Schema and the API constrains generation so the response text
**is** the JSON — no preamble, no fences, guaranteed parseable, guaranteed
to match the schema:

\`\`\`ts
const msg = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: reviewText }],
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          sku: { type: "string" },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
          score: { type: "integer" },
        },
        required: ["sku", "sentiment", "score"],
        additionalProperties: false,
      },
    },
  },
});
const data = JSON.parse(msg.content[0].text); // safe: text IS the JSON
\`\`\`

Note the shape: \`output_config.format\`, with \`type: "json_schema"\`. (You
may still see a top-level \`output_format\` param in older code — it is
deprecated; use \`output_config\`.)

### The TypeScript convenience: parse() + Zod

If you already model your types with Zod, the SDK closes the loop —
\`client.messages.parse()\` sends the schema *and* gives you a typed,
already-parsed result:

\`\`\`ts
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const Review = z.object({
  sku: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  score: z.number(),
});

const msg = await client.messages.parse({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: reviewText }],
  output_config: { format: zodOutputFormat(Review) },
});
msg.parsed_output; // typed as z.infer<typeof Review> | null
\`\`\`

Think of the schema like a **prepared statement** in PHP: instead of
concatenating strings and hoping the result is well-formed, you declare the
structure and let the machinery guarantee it.

### What the schema does and doesn't guarantee

Two rules interviewers like to probe:

- \`additionalProperties: false\` is **required** on objects — the API rejects
  schemas without it. This is what kills invented fields.
- Structural constraints are enforced; **numeric ranges can't even be
  expressed**. Types, required fields, and enums are guaranteed, but numeric
  keywords like \`minimum\`/\`maximum\` are outside the JSON Schema subset
  structured outputs supports — a hand-written schema containing them is
  rejected with a 400. (The SDK helpers hide that: \`zodOutputFormat\` strips
  the range keywords from the wire schema and re-checks them locally after
  the response.) Either way generation never guarantees the range, so a
  \`score\` of 47 on a 1–5 scale is only caught by your own validation.
  Business-rule validation stays your job — that is the next section.

One more edge: check \`stop_reason\`. A response truncated at \`max_tokens\`
can end mid-JSON even with structured output — truncation beats formatting.
`,

  comparisons: [
    {
      label: "Extracting review data as JSON",
      intro:
        "Both calls turn a product review into {sku, sentiment, score}. The left one asks nicely and hopes; the right one declares a schema and the API guarantees conformance.",
      php: `// first attempt: prompt-and-pray
const msg = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{
    role: "user",
    content:
      "Extract sku, sentiment (positive/neutral/negative) " +
      "and score 1-5 from this review. " +
      "Reply with valid JSON only, no other text.\\n\\n" +
      reviewText,
  }],
});

// Works in the demo. In production this throws on
// fences/preamble, or parses with invented fields.
const data = JSON.parse(msg.content[0].text);`,
      ts: `// production: the schema is part of the request
const msg = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: reviewText }],
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          sku: { type: "string" },
          sentiment: {
            type: "string",
            enum: ["positive", "neutral", "negative"],
          },
          score: { type: "integer" },
        },
        required: ["sku", "sentiment", "score"],
        additionalProperties: false,
      },
    },
  },
});

// Guaranteed parseable, guaranteed shape:
const data = JSON.parse(msg.content[0].text);`,
      note: "With output_config the response text IS the JSON — no preamble, no fences, no invented fields (additionalProperties: false is required). 'Reply with JSON only' is a request; the schema is a contract.",
    },
    {
      label: "The fence-stripping arms race vs parse()",
      intro:
        "The left side is real code from real codebases: layers of string surgery to salvage JSON from prose. The right side deletes all of it with messages.parse and a Zod schema.",
      php: `// utils/extract-json.ts — the arms race
function extractJson(raw: string): unknown {
  let text = raw.trim();

  // Strip \\\`\\\`\\\`json fences (today's failure)
  text = text.replace(/^\\\`\\\`\\\`(?:json)?\\s*/i, "");
  text = text.replace(/\\\`\\\`\\\`\\s*$/, "");

  // Strip preamble (last week's failure)
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("no JSON found in: " + raw);
  }

  // Next week's failure: not written yet
  return JSON.parse(text.slice(start, end + 1));
}`,
      ts: `// production: no string surgery to maintain
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const Review = z.object({
  sku: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  score: z.number(),
});

const msg = await client.messages.parse({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: reviewText }],
  output_config: { format: zodOutputFormat(Review) },
});

// Typed as z.infer<typeof Review> | null — the SDK
// parsed and validated before you touch it.
if (msg.parsed_output) {
  saveReview(msg.parsed_output);
}`,
      note: "Every tolerant extractor is a catalogue of failures already seen, with no defence against the next one. parse() + zodOutputFormat moves the contract into the request and gives you a typed parsed_output.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Three replies you will actually get from prompt-only 'reply with JSON', run through a naive JSON.parse and then a tolerant extractor — followed by the structured-output world where none of that machinery exists. Predict which replies survive naive parsing.",
    code: `// Three real-world replies to "reply with valid JSON only":
const replies = [
  '{"sku":"KB-101","sentiment":"positive","score":4}',
  '\\\`\\\`\\\`json\\n{"sku":"KB-101","sentiment":"positive","score":4}\\n\\\`\\\`\\\`',
  'Sure! Here is the JSON:\\n\\n{"sku":"KB-101","sentiment":"positive","score":4}\\n\\nLet me know if you need anything else!',
];
const labels = ["clean JSON", "fenced JSON", "preamble + outro"];

function naiveParse(raw: string): string {
  try {
    JSON.parse(raw);
    return "parsed OK";
  } catch {
    return "THROWS SyntaxError";
  }
}

// The tolerant extractor teams end up writing:
function tolerantExtract(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return "no JSON found";
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    return "salvaged: score=" + obj.score;
  } catch {
    return "salvage failed";
  }
}

console.log("== prompt-only world ==");
for (let i = 0; i < replies.length; i++) {
  console.log(labels[i] + ":");
  console.log("  naive JSON.parse -> " + naiveParse(replies[i]));
  console.log("  tolerant extract -> " + tolerantExtract(replies[i]));
}

// == structured output world ==
// With output_config: {format: {type: "json_schema", schema}},
// the API constrains generation: the text IS the JSON.
const enforced = {
  stop_reason: "end_turn",
  content: [
    {
      type: "text",
      text: '{"sku":"KB-101","sentiment":"positive","score":4}',
    },
  ],
  usage: { input_tokens: 88, output_tokens: 19 },
};

console.log("");
console.log("== structured output world ==");
const data = JSON.parse(enforced.content[0].text); // always safe
console.log("sku: " + data.sku);
console.log("sentiment: " + data.sentiment);
console.log("score: " + data.score);
console.log("(no fences, no preamble, no extractor to maintain)");`,
  },

  keyPoints: [
    "'Reply with JSON only' fails four ways in production: preamble text, markdown fences, trailing commentary, and schema drift (valid JSON, wrong shape).",
    "The current fix is `output_config: { format: { type: \"json_schema\", schema } }` on messages.create — the response text is guaranteed parseable and schema-conforming. The old top-level `output_format` param is deprecated.",
    "In TypeScript, `client.messages.parse()` with `zodOutputFormat(YourSchema)` sends the schema and returns a typed `parsed_output` — no manual JSON.parse.",
    "Object schemas must set `additionalProperties: false` — that is what prevents invented fields.",
    "Structure is enforced; business rules are not: numeric keywords like `minimum`/`maximum` are outside the supported JSON Schema subset (a raw schema containing them returns a 400), so range checks stay in your code.",
    "Assistant-turn prefill (seeding the reply with `{`) was the legacy trick — it now returns 400 on current models. Also still check `stop_reason`: a reply truncated at max_tokens can end mid-JSON.",
  ],

  interview: [
    {
      q: "How do you get reliable JSON out of an LLM in production?",
      a: "Not with prompting alone — 'reply with JSON only' degrades in production into fenced output, preamble text, and invented fields. The Anthropic API has structured output as a first-class feature: you pass `output_config` with `format: { type: \"json_schema\", schema }` and the API constrains generation so the response text is guaranteed to parse and match the schema — `additionalProperties: false` is required, which is what kills invented fields. In TypeScript I use `client.messages.parse()` with `zodOutputFormat`, so the Zod schema I already use for my domain types becomes the output contract and I get a typed `parsed_output`. I still validate business rules afterwards, because structural guarantees don't cover things like numeric ranges — those keywords aren't even in the supported schema subset.",
    },
    {
      q: "What does structured output guarantee, and what does it not?",
      a: "It guarantees syntax and structure: the output parses as JSON, required fields are present, types match, enums contain only the listed values, and no extra fields appear. It does not guarantee semantics: numeric keywords like `minimum`/`maximum` aren't part of the supported schema subset — a raw schema containing them returns a 400, and the SDK helpers strip them and re-check locally — so a score of 47 on a 1–5 scale is only caught by my own validation; nothing checks that an ID refers to a real row or that a date is in a sensible range. And truncation trumps formatting — if the reply hits `max_tokens`, you can get cut-off JSON, so I check `stop_reason` before parsing. So the pattern is: schema for shape, then my own validation layer for meaning.",
    },
    {
      q: "You see a codebase with a 'stripMarkdownFences' helper around every LLM call. What do you tell the team?",
      a: "That helper is a symptom: they're using prompt-level JSON and patching each failure mode as it appears — fences today, preambles tomorrow, truncated arrays next month. Each patch handles a failure already seen and none prevents the next. I'd move the contract into the request with `output_config` and a JSON schema — then the response text is the JSON by construction, and the whole extraction layer gets deleted rather than maintained. It's the prepared-statement lesson from PHP: don't sanitize the output of string concatenation, use the mechanism that makes malformed output impossible. The one thing I'd keep from the old layer is validation of business rules, which no schema enforces.",
    },
  ],

  quiz: [
    {
      question:
        "What is the current way to request schema-enforced JSON from the Messages API?",
      options: [
        "Set output_config: { format: { type: \"json_schema\", schema } } on the request",
        "Prefill the assistant turn with '{' so the model must continue JSON",
        "Set the top-level output_format param",
        "Append 'You MUST reply with valid JSON' to the system prompt",
      ],
      answerIndex: 0,
      explain:
        "output_config.format with type \"json_schema\" is the current parameter; the old top-level output_format is deprecated. Assistant prefill now returns a 400 on current models, and prompt-level instructions are requests, not guarantees.",
    },
    {
      question:
        "With structured output enforcing your schema, which failure can STILL reach your code?",
      options: [
        "A reply wrapped in markdown fences",
        "An invented field not in the schema",
        "A number outside the range your business rules require",
        "'Here is the JSON:' preamble before the object",
      ],
      answerIndex: 2,
      explain:
        "Structured output guarantees parseability, required fields, types, and enums, and additionalProperties: false blocks invented fields. Numeric range keywords aren't in the supported schema subset at all (a raw schema containing them returns a 400), so nothing in generation bounds the value — range checks belong in your own validation layer.",
    },
    {
      question:
        "In the TypeScript SDK, what does client.messages.parse() with zodOutputFormat(Review) give you beyond messages.create()?",
      options: [
        "Lower latency, since parsing happens on Anthropic's servers",
        "It sends the schema as output_config AND returns parsed_output already parsed and typed as the Zod schema's type",
        "Automatic retries when the model returns invalid JSON",
        "It removes the need for max_tokens",
      ],
      answerIndex: 1,
      explain:
        "parse() is a convenience wrapper: zodOutputFormat converts the Zod schema into the json_schema format, and the response's parsed_output is validated and typed as z.infer of your schema — no manual JSON.parse and no hand-written type assertion.",
    },
  ],
};

export default lesson;
