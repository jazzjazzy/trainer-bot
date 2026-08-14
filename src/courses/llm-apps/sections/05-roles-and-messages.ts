import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "roles-and-messages",
  title: "Roles and the Messages Array",
  part: "The Mental Model",
  estMinutes: 11,
  summary:
    "The messages array IS the conversation: alternating user/assistant turns that you construct — including assistant turns you write yourself as few-shot examples.",

  concept: `
Everything the model knows about a conversation arrives in one field:
\`messages\`. Mastering its shape — roles, turn order, content forms — is
mastering the API's core data structure.

### Two roles, strict choreography

\`\`\`ts
const messages: Anthropic.MessageParam[] = [
  { role: "user", content: "What does PSR-4 specify?" },
  { role: "assistant", content: "PSR-4 is the autoloading standard..." },
  { role: "user", content: "How does Composer implement it?" },
];
\`\`\`

The rules:

- Roles are \`"user"\` and \`"assistant"\`, and the **first message must be
  \`user\`** — the model completes a conversation, so it needs someone to
  respond to.
- The **system prompt is not a message.** Instructions about *how to behave*
  ("You are a terse senior engineer...") go in the top-level \`system\`
  parameter, separate from the turn-taking. (A mid-conversation
  \`role: "system"\` message is a separate, model-gated feature — Claude
  Opus 5, Opus 4.8, Fable 5 and Mythos 5 accept one, Sonnet 5 does not —
  and it is not how you set the system prompt.)
- The model's reply is the *next* assistant turn. It never sees your
  variable names or your database — the transcript is its entire reality.

### The liberating part: you write history

Nothing says the assistant turns must be things the model actually said.
The transcript is just data you construct — so you can *script* past
exchanges to show the model exactly what you want. That's **few-shot
prompting**:

\`\`\`ts
const messages: Anthropic.MessageParam[] = [
  // Scripted example 1 — you wrote both sides:
  { role: "user", content: "Categorize: 'App crashes on login'" },
  { role: "assistant", content: "bug/authentication" },
  // Scripted example 2:
  { role: "user", content: "Categorize: 'Please add dark mode'" },
  { role: "assistant", content: "feature-request/ui" },
  // The real input:
  { role: "user", content: "Categorize: 'Password reset email never arrives'" },
];
\`\`\`

Demonstrated format beats described format: two worked examples steer output
shape more reliably than a paragraph of instructions. If you've ever seeded
\`$_SESSION\` with fixture data in a test, same move — the consumer can't
tell scripted history from real history.

One retired trick to know for interviews: ending \`messages\` with a partial
*assistant* turn ("prefill") used to force the model to continue from your
text — e.g. starting it off with \`{\`. **On current models that returns a
400.** The replacement is structured outputs, which constrain the response
properly; prefill questions still come up because older codebases used it
heavily.

### Content: a string, or an array of blocks

Every \`content\` you've written so far was a string. That's shorthand.
The full form is an array of typed blocks:

\`\`\`ts
// These two are equivalent:
{ role: "user", content: "Hello" }
{ role: "user", content: [{ type: "text", text: "Hello" }] }
\`\`\`

Why care? Because the block form is where the API grows. A user turn can
carry an image block next to its text. An assistant turn can contain
\`tool_use\` blocks. A user turn can carry \`tool_result\` blocks and
document blocks. The string form is a convenience for the simplest case —
the *real* type of \`content\` is \`string | ContentBlock[]\`, and code that
assumes "content is a string" breaks the day tools arrive.

### The consequence: prompt construction is data assembly

Put the pieces together and a "prompt" stops being a string you concatenate
and becomes a **data structure you assemble**: a system parameter, scripted
example turns, real history, and a final user turn — each part in its slot.
The PHP analogy is prepared statements: you stopped concatenating SQL and
started binding parameters into a structure. Same maturity step here, and
it pays off identically — clearer code, fewer injection-shaped surprises,
easier to test.
`,

  comparisons: [
    {
      label: "One giant string vs. structured few-shot turns",
      intro:
        "A ticket classifier that must output exactly 'category/subcategory'. The left crams instructions and examples into one user string; the right scripts the examples as real turns.",
      php: `// First attempt: everything in one string blob
const prompt = \`You are a ticket classifier.
Output format: category/subcategory

Here are some examples:
Input: "App crashes on login"
Output: bug/authentication
Input: "Please add dark mode"
Output: feature-request/ui

Now classify this: "\${ticketText}"
Remember, ONLY output the category!\`;

await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 50,
  // Instructions, examples, and data all mashed into one
  // turn — the model often replies "Sure! The category is:
  // bug/authentication" despite the ALL-CAPS pleading.
  messages: [{ role: "user", content: prompt }],
});`,
      ts: `// Production: each part of the prompt in its slot
await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 50,
  // Behavior → system parameter
  system:
    "You are a ticket classifier. Reply with only category/subcategory.",
  messages: [
    // Format → demonstrated via scripted turns
    { role: "user", content: 'Classify: "App crashes on login"' },
    { role: "assistant", content: "bug/authentication" },
    { role: "user", content: 'Classify: "Please add dark mode"' },
    { role: "assistant", content: "feature-request/ui" },
    // Data → the final user turn
    { role: "user", content: \`Classify: "\${ticketText}"\` },
  ],
});`,
      note:
        "Scripted assistant turns are indistinguishable from real ones — the model pattern-matches 'my previous replies were bare categories' far more reliably than it obeys shouted instructions.",
    },
    {
      label: "Raw JSON payload vs. typed MessageParam array",
      intro:
        "The same few-shot transcript as it travels on the wire, and as you build it in TypeScript. Same data — one version has a compiler watching.",
      php: `{
  "model": "claude-sonnet-5",
  "max_tokens": 50,
  "system": "Reply with only category/subcategory.",
  "messages": [
    { "role": "user", "content": "Classify: \\"App crashes on login\\"" },
    { "role": "assistant", "content": "bug/authentication" },
    { "role": "user", "content": [
      { "type": "text", "text": "Classify: \\"No sound on iOS\\"" }
    ] }
  ]
}`,
      ts: `// Building the same payload with SDK types
import Anthropic from "@anthropic-ai/sdk";

const messages: Anthropic.MessageParam[] = [
  { role: "user", content: 'Classify: "App crashes on login"' },
  { role: "assistant", content: "bug/authentication" },
  // String and block-array content are interchangeable:
  {
    role: "user",
    content: [{ type: "text", text: 'Classify: "No sound on iOS"' }],
  },
];

// role: "operator" → compile error; content: 42 → compile
// error; a system message in the array → compile error.
await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 50,
  system: "Reply with only category/subcategory.",
  messages,
});`,
      note:
        "Note what the JSON shows: system sits OUTSIDE messages, and content can be a plain string or a block array per turn. MessageParam encodes all of that so invalid shapes never reach the wire.",
      leftLang: "json",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A transcript builder that assembles few-shot examples plus live turns, then renders exactly what the model would see. Predict the rendered output — including which turns the model 'said' versus which were scripted.",
    code: `// The messages array as a data structure you assemble.
// render() shows the model's ENTIRE reality for the next call.

type Role = "user" | "assistant";

interface Turn {
  role: Role;
  content: string;
  scripted?: boolean; // our bookkeeping — NOT part of the wire format
}

const transcript: Turn[] = [];

function append(role: Role, content: string, scripted = false): void {
  if (transcript.length === 0 && role !== "user") {
    throw new Error("First message must have role 'user'");
  }
  transcript.push({ role, content, scripted });
}

// Few-shot: we write BOTH sides of two example exchanges
append("user", 'Classify: "App crashes on login"', true);
append("assistant", "bug/authentication", true);
append("user", 'Classify: "Please add dark mode"', true);
append("assistant", "feature-request/ui", true);

// The live conversation
append("user", 'Classify: "Password reset email never arrives"');
append("assistant", "bug/email"); // the model's actual reply, stored by us
append("user", 'Classify: "Export to CSV please"');

function render(turns: Turn[]): void {
  console.log("system: Reply with only category/subcategory.");
  console.log("---");
  for (const turn of turns) {
    const tag = turn.scripted ? " (scripted by us)" : "";
    console.log(\`\${turn.role}\${tag}: \${turn.content}\`);
  }
  console.log("---");
  console.log(
    \`\${turns.length} messages; model will now write the next assistant turn\`
  );
}

render(transcript);

// Try it: move the append("assistant", ...) lines around so the
// transcript STARTS with an assistant turn — the guard throws, just
// like the real API's 400. Then try deleting the two scripted
// exchanges and ask yourself: what format guidance is left?`,
  },

  keyPoints: [
    "`messages` is an array of `{role, content}` turns with roles `user` and `assistant` — and the first message must be `user`.",
    "The system prompt is the top-level `system` parameter, not a message role — behavior in `system`, conversation in `messages`.",
    "You construct the transcript, including assistant turns the model never said — scripted exchanges are few-shot examples, and demonstrated format beats described format.",
    "`content` is `string | ContentBlock[]` — the string is shorthand for one text block, and the array form is where images, tool_use, and tool_result live later.",
    "Assistant-turn prefill (ending messages with a partial assistant turn) returns 400 on current models — structured outputs replaced that trick.",
    "Treat prompt construction as data assembly, not string concatenation — the same maturity step as moving from concatenated SQL to prepared statements.",
  ],

  interview: [
    {
      q: "What is few-shot prompting, and how do you implement it with the Messages API?",
      a: "Few-shot prompting steers the model by showing worked examples instead of (or alongside) describing what you want. With the Messages API the implementation is structural: since I construct the entire messages array, I script fake exchanges — a user turn with a sample input, an assistant turn with the exactly-formatted output I want — for two or three examples, then append the real input as the final user turn. The model can't distinguish scripted history from real history, and it pattern-matches 'my previous replies looked like X' far more reliably than it follows written instructions. In production I keep behavioral rules in the `system` parameter and format demonstration in scripted turns — each concern in its slot.",
    },
    {
      q: "Where does the system prompt go in an Anthropic API call, and why does the placement matter?",
      a: "It's the top-level `system` parameter — a sibling of `model` and `messages`, not a message with a system role. The separation is deliberate: `messages` models the turn-taking of a conversation (starting with a user turn), while `system` is standing instruction that frames all of it — persona, rules, tone. Practically it matters for history management: as a conversation grows I trim or summarize old *turns*, but the system prompt persists untouched on every call. There's a mid-conversation `role: 'system'` capability on Claude Opus 5, Opus 4.8, Fable 5 and Mythos 5 — notably not Sonnet 5 — but I wouldn't design a general integration around a feature that isn't available on every model.",
    },
    {
      q: "A teammate's code ends the messages array with a partial assistant turn to force the reply to start with '{'. Review it.",
      a: "That's prefill — a legitimate classic, but it's retired: on current models a trailing assistant turn returns a 400, so that code fails outright against Sonnet 5 or Opus 4.8. The intent — forcing JSON output — is now served properly by structured outputs: `output_config` with a JSON schema (or `client.messages.parse()` with a Zod schema in TS), which constrains the response shape instead of just nudging its first character. My review would be: replace the prefill with a schema-constrained request, and add a test that asserts the response parses — which the schema approach makes reliable rather than probabilistic.",
    },
  ],

  quiz: [
    {
      question:
        "Where do behavioral instructions like 'You are a terse senior engineer' belong in a Messages API request?",
      options: [
        "As the first message with role 'system'",
        "In the top-level system parameter, alongside model and messages",
        "Prepended to every user message",
        "In a metadata field on the client constructor",
      ],
      answerIndex: 1,
      explain:
        "The system prompt is a top-level request parameter, not a message role. The messages array holds only user/assistant turn-taking — and must start with a user turn.",
    },
    {
      question:
        "Why can you include assistant messages the model never actually produced?",
      options: [
        "You can't — the API validates assistant turns against its logs",
        "The transcript is just data you send; scripted assistant turns work as few-shot examples showing the exact output format you want",
        "It's allowed but the model ignores assistant turns when generating",
        "Only if you set an allow_synthetic flag on the request",
      ],
      answerIndex: 1,
      explain:
        "The API is stateless — it has no record of what was 'really' said. Every turn is just data you assembled, so scripting example exchanges is the standard few-shot technique: demonstrated format beats described format.",
    },
    {
      question:
        "What is the full type of a message's content field, and why does it matter?",
      options: [
        "Always a string — blocks only appear in responses",
        "string | ContentBlock[] — the string is shorthand for one text block, and the array form carries images, tool_use, and tool_result blocks later",
        "An array of strings, one per paragraph",
        "A string in requests and an object in responses",
      ],
      answerIndex: 1,
      explain:
        "String content is sugar for [{type: 'text', text: ...}]. Code written against the block-array form keeps working when multimodal input and tool use arrive; code assuming strings breaks.",
    },
    {
      question:
        "What happens if you end the messages array with a partial assistant turn (prefill) on claude-sonnet-5?",
      options: [
        "The model continues from your partial text",
        "The turn is silently dropped",
        "The request fails with a 400 — use structured outputs to constrain the response instead",
        "It works only when temperature is 0",
      ],
      answerIndex: 2,
      explain:
        "Prefill was a real technique on older models but current models reject a trailing assistant turn with a 400. Structured outputs (output_config with a JSON schema, or messages.parse with Zod) are the supported replacement — and current frontier models don't accept temperature at all.",
    },
  ],
};

export default lesson;
