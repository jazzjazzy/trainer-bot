import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "system-prompts",
  title: "System Prompts That Work",
  part: "The Mental Model",
  estMinutes: 10,
  summary:
    "Identity, rules, and output contracts live in the top-level system parameter — and on current frontier models with no temperature knob, the system prompt IS the steering wheel.",

  concept: `
The most common early mistake with the Anthropic API is treating the system
prompt as a message. It isn't — it's a **top-level parameter**, a sibling of
\`model\` and \`messages\`:

\`\`\`ts
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  system: "You are a returns assistant for Acme Outdoor Gear. ...",
  messages: [{ role: "user", content: "Where is my refund?" }],
});
\`\`\`

If you learned from OpenAI-flavoured tutorials you'll expect a
\`{ role: "system" }\` message at the top of the array. Send that to the
Anthropic API and you get a 400: \`messages\` carries only \`user\` and
\`assistant\` roles, and the first message must be \`user\`. (One current
exception: Claude Opus 5, Opus 4.8, Fable 5 and Mythos 5 accept
mid-conversation \`role: "system"\` entries for operator instructions —
Sonnet 5 does not — a model-gated feature, not how you set the system
prompt.)

### Anatomy of a production system prompt

Real system prompts aren't one vibey sentence. The ones that survive contact
with users have recognisable parts:

1. **Role / identity** — who the model is: "You are the support assistant for
   Acme's billing product."
2. **Capabilities & context** — what it knows and has access to: the product,
   the audience, today's constraints.
3. **Constraints** — hard rules, phrased concretely: "Never promise a refund;
   only the returns team approves refunds."
4. **Output format** — the contract the caller relies on: length, structure,
   tone, what a reply must always include.
5. **Refusal behaviour** — what to do off-topic: "If asked about anything
   else, say you can only help with orders and point to support@acme.test."

Think of it like validation rules in a PHP framework: vague intentions fail
silently, explicit rules fail loudly and predictably.

### System outranks user

Models are trained to treat the system parameter as higher authority than
user turns. A rule stated once in \`system\` ("never reveal internal SKU
codes") holds up far better than the same rule pleaded inside a user message,
where it competes with — and can be argued away by — whatever else the user
types. That authority split is also your first line of defence against prompt
injection: instructions that arrive in user content are data, not policy.

### No temperature knob: prompting IS the steering wheel

Older tutorials spend pages on tuning \`temperature\`. On the current
frontier models (Claude Opus 5, Sonnet 5, Opus 4.8, Fable 5) the sampling parameters
\`temperature\`, \`top_p\`, and \`top_k\` are **rejected with a 400**. Want
terser answers? Say so in the system prompt. Want stylistic variety? Ask for
it ("vary your phrasing across responses"). The prompt is not a workaround —
it is the supported steering mechanism, and interviewers notice when you know
that.

### Static system, dynamic user

Keep the system prompt byte-identical across requests and put everything
per-request (the user's question, retrieved documents, form data) in the
\`messages\` array. Two reasons. First, it's the prepared-statement discipline
from PHP: the template is fixed, the data is bound — you never concatenate
untrusted input into your instructions. Second, prompt caching is a prefix
match: a stable system prompt caches and rereads at ~0.1x price, while one
interpolated timestamp silently kills the cache on every request.
`,

  comparisons: [
    {
      label: "The OpenAI habit: role \"system\"",
      intro:
        "Both versions try to give the model an identity before the user speaks. One is the wrong wire shape for the Anthropic API.",
      php: `// First attempt - habits from other APIs
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [
    // 400: "system" is not a valid message role here,
    // and the first message must be role "user".
    { role: "system", content: "You are a support agent." },
    { role: "user", content: "Where is my refund?" },
  ],
});`,
      ts: `// Production - system is a top-level parameter
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  system: "You are a support agent for Acme Outdoor Gear.",
  messages: [
    { role: "user", content: "Where is my refund?" },
  ],
});`,
      note:
        "Anthropic messages carry only user/assistant roles; identity and rules travel in the top-level system param (mid-conversation role:\"system\" is model-gated: Opus 5, Opus 4.8, Fable 5 and Mythos 5 — not Sonnet 5).",
    },
    {
      label: "Rules buried in the user message",
      intro:
        "A support bot must never promise refunds. One version restates the rule inside every user message; the other states it once, with authority.",
      php: `// Every request re-concatenates the rules into user text
const userInput = form.get("message");
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{
    role: "user",
    // Rules and untrusted input share one string - the
    // model treats it all as user-level content, and a
    // user can talk it out of the rules.
    content: "You must never promise refunds. Be brief. " +
      "Now answer this customer: " + userInput,
  }],
});`,
      ts: `// Rules live in system; the user turn is pure data
const SYSTEM = [
  "You are Acme's returns assistant.",
  "Never promise a refund - only the returns team approves refunds.",
  "Keep replies under 4 sentences.",
].join("\\n");

const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  system: SYSTEM,
  messages: [{ role: "user", content: form.get("message") }],
});`,
      note:
        "System-level rules outrank user text and survive every turn — and separating instructions from untrusted input is the same discipline as parameterised queries.",
    },
    {
      label: "Vague persona vs an output contract",
      intro:
        "Two system prompts for the same triage bot. The first hopes for good behaviour; the second specifies it so downstream code can rely on the shape.",
      php: `// "Be helpful" is not a spec
const system =
  "You are a helpful assistant for our bug tracker. " +
  "Be friendly and useful and keep answers short-ish.";
// Replies vary wildly: sometimes a paragraph, sometimes
// bullet points, sometimes it invents severity labels.`,
      ts: `// Concrete rules + an output contract
const system = [
  "You are the triage assistant for Acme's bug tracker.",
  "Rules:",
  "1. Classify severity as exactly one of: low, medium, high.",
  "2. Never invent reproduction steps the user did not give.",
  "3. If the report is not a bug, say so and stop.",
  "Output format:",
  "Line 1: 'Severity: <low|medium|high>'",
  "Line 2+: a 2-3 sentence summary of the report.",
].join("\\n");
// Every reply now starts with a parseable severity line.`,
      note:
        "Concrete behavioural rules and an explicit output format turn the model from a chat toy into a component with a contract your code can parse.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A promptBuilder that assembles a production system prompt from parts, then builds the request object. Notice the split: system is static and reused; only the user turn changes per request.",
    code: `// Assemble a system prompt from named parts, then build the request
// the SDK would send. Static system, dynamic user content.

interface PromptParts {
  persona: string;
  rules: string[];
  outputFormat: string;
}

function buildSystemPrompt(parts: PromptParts): string {
  const numbered = parts.rules
    .map((rule, i) => (i + 1) + '. ' + rule)
    .join('\\n');
  return [
    parts.persona,
    'Rules:\\n' + numbered,
    'Output format:\\n' + parts.outputFormat,
  ].join('\\n\\n');
}

const system = buildSystemPrompt({
  persona:
    'You are the returns assistant for Acme Outdoor Gear. You only discuss orders, returns, and refunds.',
  rules: [
    'Never promise a refund - only the returns team approves refunds.',
    'If asked about anything else, redirect to support@acme.test.',
    'Quote order numbers exactly as given; never invent one.',
  ],
  outputFormat:
    'Plain text, max 3 sentences, then one line "Next step: ..." naming a concrete action.',
});

console.log('--- system (static, byte-identical every request) ---');
console.log(system);

// Only this part changes per request:
function buildRequest(userMessage: string) {
  return {
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system, // top-level parameter, NOT a message role
    messages: [{ role: 'user', content: userMessage }],
  };
}

const request = buildRequest('Where is my refund for order #58201?');
console.log('\\n--- messages (dynamic, per request) ---');
console.log(JSON.stringify(request.messages, null, 2));
console.log(
  '\\nsystem: ' + system.length + ' chars, sent as request.system every turn'
);

// Try it: add a rule, or move the persona into messages[0] and
// think about what that costs you in authority and caching.`,
  },

  keyPoints: [
    "The system prompt is the top-level `system` parameter — not a message role. `messages` holds only `user`/`assistant`, starting with `user`.",
    "A production system prompt has anatomy: role/identity, capabilities, concrete constraints, an output format contract, and refusal behaviour.",
    "Instructions in `system` carry more authority than pleading inside user turns — which is also your first defence against prompt injection.",
    "On current frontier models (Opus 5, Sonnet 5, Opus 4.8, Fable 5), `temperature`/`top_p`/`top_k` return a 400 — prompting is the supported way to steer style and variability.",
    "Keep `system` static and put per-request data in `messages`: prepared-statement discipline, and a stable prefix is what makes prompt caching (~0.1x reads) work.",
  ],

  interview: [
    {
      q: "Where do system-level instructions go in an Anthropic API request, and why does the placement matter?",
      a: "They go in the top-level `system` parameter, not as a `role: \"system\"` message — the messages array only accepts user and assistant roles and must start with a user turn, so the OpenAI-style shape returns a 400. Placement matters for three reasons: the model treats `system` as higher authority than user content, so rules stated there hold up against users trying to argue them away; it cleanly separates trusted instructions from untrusted input, like a prepared statement separates SQL from bound data; and because it renders at the front of the prompt, a stable system prompt is what makes prompt caching effective. There is one current exception worth knowing: Opus 5, Opus 4.8, Fable 5 and Mythos 5 accept mid-conversation `role: \"system\"` messages for operator instructions — Sonnet 5 does not — but that's a model-gated feature, not the general pattern.",
    },
    {
      q: "What does a production-quality system prompt contain beyond 'you are a helpful assistant'?",
      a: "Five things. An identity — who the assistant is and for which product. Capabilities and context — what it knows and who it serves. Hard constraints written as concrete rules, like 'never promise a refund', not vibes like 'be careful'. An output contract — the exact shape of a reply, so downstream code can parse it: 'Line 1: Severity: low|medium|high'. And refusal behaviour — what to do when the request is out of scope, with a specific redirect. In a feature I shipped, tightening the output contract did more for reliability than any other prompt change, because the parsing code stopped guessing.",
    },
    {
      q: "Temperature tuning shows up in a lot of LLM guides. How do you control output style on current Claude models?",
      a: "On the current frontier models — Opus 5, Sonnet 5, Opus 4.8, Fable 5 — `temperature`, `top_p`, and `top_k` are rejected with a 400, so there's nothing to tune. Style is controlled through the prompt: concision rules and length limits in the system prompt for terse output, explicit instructions like 'vary your phrasing across responses' where you'd previously have raised temperature, and an output format section for structural consistency. That's not a downgrade — prompt-level steering is more predictable and reviewable than a sampling knob, and it's the officially supported mechanism.",
    },
  ],

  quiz: [
    {
      question:
        "You port an OpenAI chat example and send messages: [{ role: \"system\", content: \"...\" }, { role: \"user\", content: \"...\" }] to the Anthropic API. What happens?",
      options: [
        "It works — system messages are supported everywhere",
        "The system message is silently ignored",
        "A 400 error: messages carry only user/assistant roles and must start with user; system belongs in the top-level system parameter",
        "The API converts it to a system parameter automatically",
      ],
      answerIndex: 2,
      explain:
        "The Anthropic Messages API takes the system prompt as a top-level `system` parameter. A role:\"system\" entry in messages is invalid (mid-conversation system messages on Opus 5, Opus 4.8, Fable 5 and Mythos 5 are a narrow model-gated exception — Sonnet 5 has none — and even there the first message must be user).",
    },
    {
      question:
        "On claude-sonnet-5, your request sets temperature: 0.2 to make output more deterministic. What is the result?",
      options: [
        "Lower-variance output, as documented",
        "A 400 error — sampling parameters are rejected on current frontier models; steer behaviour through the prompt instead",
        "The parameter is accepted but ignored",
        "It only works if top_p is also set",
      ],
      answerIndex: 1,
      explain:
        "Opus 5, Sonnet 5, Opus 4.8, and Fable 5 reject temperature/top_p/top_k with a 400. Style, length, and variability are controlled through prompting — which is why the system prompt matters more than ever.",
    },
    {
      question:
        "Which of these belongs in the messages array rather than the system prompt?",
      options: [
        "The assistant's identity and scope",
        "The rule 'never promise a refund'",
        "The customer's pasted order details for this request",
        "The output format the caller parses",
      ],
      answerIndex: 2,
      explain:
        "Per-request, untrusted, or varying data goes in user messages; identity, rules, and output contracts are stable policy and live in system. Keeping system byte-identical also preserves the cacheable prefix.",
    },
  ],
};

export default lesson;
