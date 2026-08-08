import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "first-call-typescript",
  title: "Your First Call in TypeScript",
  part: "The Mental Model",
  estMinutes: 11,
  summary:
    "Install @anthropic-ai/sdk, read the key from env, call client.messages.create, and extract text by filtering typed content blocks — never by grabbing content[0] blindly.",

  concept: `
Time to write the canonical integration. Three steps: install, authenticate,
call. Then the part most first attempts get wrong: reading the response.

### Install and authenticate

\`\`\`bash
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY="sk-ant-..."
\`\`\`

\`\`\`ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
\`\`\`

The constructor reads \`ANTHROPIC_API_KEY\` from the environment by default.
**Never hardcode the key** — same rule as database credentials in PHP: env
vars or a secrets manager, never source control. And because the key is a
billing credential, it stays server-side; shipping it to a browser bundle is
handing your card to the internet.

### The call

\`\`\`ts
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Explain optimistic locking in two sentences." },
  ],
});
\`\`\`

Note what the SDK is doing for you versus hand-rolled \`fetch\`: it sets the
\`x-api-key\` and \`anthropic-version\` headers, serializes the body, gives the
request and response real TypeScript types, throws typed errors
(\`Anthropic.RateLimitError\` and friends), and automatically retries transient
failures. This is Guzzle-vs-official-SDK all over again — you *can* build it
from \`fetch\`, and it's worth seeing once so the SDK isn't magic, but
production code uses the SDK.

### Reading the response: content is an ARRAY of typed blocks

Here's the trap. \`response.content\` is not a string — it's an array of
blocks, each with a \`type\`. Today your response probably contains exactly one
\`text\` block, so \`response.content[0].text\` *appears* to work. Then you add
tool use, or the model returns multiple blocks, and \`content[0]\` is a
\`tool_use\` block with no \`.text\` — TypeScript even warns you, because the
block union only exposes \`.text\` after narrowing. The robust pattern:

\`\`\`ts
const text = response.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("");
\`\`\`

Narrowing on \`block.type === "text"\` is a discriminated-union check —
the same TS pattern you'd use for any tagged union, applied to the wire format.

### Always check \`stop_reason\`

The response tells you *why* generation stopped, and you should look:

- \`"end_turn"\` — the model finished naturally. The happy path.
- \`"max_tokens"\` — you cut it off mid-sentence. The text is **truncated**:
  incomplete JSON, half an explanation, a dangling code fence. Treat it as an
  incomplete result — retry with a bigger cap, or surface "response truncated"
  — don't silently pass it downstream.
- Others (\`"tool_use"\`, \`"stop_sequence"\`, \`"refusal"\`) arrive in later
  sections; the discipline of checking starts now.

A truncated response is not an error — HTTP 200, valid shape, usage billed.
If you don't check \`stop_reason\`, the failure mode is a *silently* broken
feature, which is the worst kind.
`,

  comparisons: [
    {
      label: "Hand-rolled fetch vs. the SDK client",
      intro:
        "The same call twice. The left version works, but every concern — headers, error handling, types, retries — is yours to maintain.",
      php: `// First attempt: raw fetch against the REST endpoint
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": process.env.ANTHROPIC_API_KEY!,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello, Claude" }],
  }),
});

if (!res.ok) {
  // 429? 529? overloaded? invalid request? All on you.
  throw new Error(\`API error \${res.status}\`);
}
const data = await res.json(); // data: any — hope the shape is right`,
      ts: `// Production: the official SDK
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // key from env, headers handled

const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello, Claude" }],
});
// response: Anthropic.Message — content blocks, stop_reason,
// usage all typed. Rate limits and 5xx errors are retried
// automatically (default max_retries: 2), and failures throw
// typed errors like Anthropic.RateLimitError.`,
      note:
        "Seeing the raw call once demystifies the SDK; using the SDK gets you types, auth, and retry behavior for free — the Guzzle-vs-vendor-SDK tradeoff, decided the same way.",
    },
    {
      label: "Assuming content[0] vs. filtering blocks by type",
      intro:
        "Both extract the reply text. The left works right up until the response contains a non-text block first — then it returns undefined or crashes.",
      php: `// First attempt: "the text is always first, right?"
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages,
});

// content[0] is a union — TS already complains that
// .text doesn't exist on every member. Casting "fixes" it:
const text = (response.content[0] as { text: string }).text;
// Works today. Add tools next sprint and content[0]
// becomes a tool_use block — text is undefined.`,
      ts: `// Production: narrow the union, handle truncation
function extractText(response: Anthropic.Message): string {
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (response.stop_reason === "max_tokens") {
    // Truncated mid-thought — incomplete JSON, half a sentence.
    throw new Error(\`Response truncated at max_tokens: \${text.slice(-50)}\`);
  }
  return text;
}`,
      note:
        "content is a discriminated union — filter on block.type and TS narrows to TextBlock. The cast in the left version silences the exact warning that was protecting you.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Two simulated SDK responses — one complete, one cut off by max_tokens — run through a robust extraction function. Predict which one throws and what the error says, then run it.",
    code: `// The response shapes the SDK returns, simulated — plus the
// extraction function you'll actually want in production.

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

interface Message {
  id: string;
  role: "assistant";
  model: string;
  content: ContentBlock[];
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  usage: { input_tokens: number; output_tokens: number };
}

function extractText(response: Message): string {
  // Narrow the union: only text blocks have .text
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      \`truncated after \${response.usage.output_tokens} output tokens: "...\${text.slice(-30)}"\`
    );
  }
  return text;
}

// Happy path: finished naturally
const complete: Message = {
  id: "msg_01aaa",
  role: "assistant",
  model: "claude-sonnet-5",
  content: [
    { type: "text", text: "Optimistic locking assumes conflicts are rare and checks a version column at write time." },
  ],
  stop_reason: "end_turn",
  usage: { input_tokens: 19, output_tokens: 22 },
};

// Truncated: hit the max_tokens cap mid-sentence
const truncated: Message = {
  id: "msg_01bbb",
  role: "assistant",
  model: "claude-sonnet-5",
  content: [
    { type: "text", text: "Optimistic locking assumes conflicts are rare and checks a vers" },
  ],
  stop_reason: "max_tokens",
  usage: { input_tokens: 19, output_tokens: 16 },
};

for (const response of [complete, truncated]) {
  try {
    console.log(\`\${response.id} (\${response.stop_reason}): \` + extractText(response));
  } catch (err) {
    console.log(\`\${response.id} (\${response.stop_reason}): ERROR — \${(err as Error).message}\`);
  }
}

// Try it: add a tool_use block BEFORE the text block in \`complete\` —
// extractText still works. content[0].text would not have.`,
  },

  keyPoints: [
    "Setup is three lines: `npm install @anthropic-ai/sdk`, export `ANTHROPIC_API_KEY`, `new Anthropic()` — the constructor reads the key from env, and it never belongs in source or a browser bundle.",
    "The core call is `await client.messages.create({ model, max_tokens, messages })` — `max_tokens` is required, `claude-sonnet-5` is the everyday default.",
    "`response.content` is an array of typed blocks: filter on `block.type === \"text\"` (discriminated-union narrowing) instead of assuming `content[0]` is text.",
    "Always check `stop_reason`: `end_turn` is the happy path; `max_tokens` means silent truncation — HTTP 200, valid shape, incomplete answer.",
    "The SDK handles headers (`x-api-key`, `anthropic-version`), typed errors, and automatic retries of 429/5xx (default `max_retries: 2`) — hand-rolled fetch means owning all of that yourself.",
  ],

  interview: [
    {
      q: "Walk me through making your first Claude API call in TypeScript, including the mistakes you'd avoid.",
      a: "Install `@anthropic-ai/sdk`, put the key in `ANTHROPIC_API_KEY`, and construct `new Anthropic()` — it reads the env var, so no hardcoded secrets and nothing client-side, since the key is a billing credential. Then `await client.messages.create({ model: 'claude-sonnet-5', max_tokens: 1024, messages: [{ role: 'user', content: ... }] })`. The two mistakes I'd avoid are both on the response side: first, `content` is an array of typed blocks, so I filter for `block.type === 'text'` rather than grabbing `content[0].text` — that assumption breaks the moment tool use enters the picture. Second, I check `stop_reason`: `max_tokens` means the reply was truncated mid-thought with a perfectly healthy HTTP 200, and passing truncated output downstream is a silent-failure factory.",
    },
    {
      q: "Would you call the REST endpoint directly with fetch, or use the SDK? Justify it.",
      a: "SDK, for the same reasons I'd pick a maintained vendor SDK over hand-rolled Guzzle calls in PHP. Raw fetch means I own the `x-api-key` and `anthropic-version` headers, response typing, error taxonomy, and retry logic; the SDK gives me typed request/response shapes, typed exceptions like `Anthropic.RateLimitError`, and automatic retries with backoff for rate limits and server errors out of the box. I'd still want to have made the raw call once — knowing it's a single stateless POST demystifies the whole thing and makes debugging with curl possible — but committing hand-rolled HTTP to a production codebase is just choosing to maintain a worse SDK.",
    },
    {
      q: "Your LLM feature returns malformed, cut-off answers intermittently. Where do you look first?",
      a: "`stop_reason`. Intermittent truncation is the signature of hitting the `max_tokens` cap: long inputs produce long answers, the cap cuts them mid-sentence, and everything still returns HTTP 200 with `stop_reason: 'max_tokens'`. I'd confirm by logging `stop_reason` and `usage.output_tokens` per call — if truncated calls show output tokens exactly at the cap, that's it. The fix is to raise `max_tokens` to fit the real distribution of answers, or constrain the task to produce shorter output. The broader lesson I'd mention: LLM APIs have failure modes that aren't HTTP errors, so response metadata needs the same logging discipline as status codes.",
    },
  ],

  quiz: [
    {
      question:
        "Why is `response.content[0].text` a fragile way to read a Claude response?",
      options: [
        "content[0] is always the system prompt echo",
        "content is an array of typed blocks — the first block isn't guaranteed to be a text block, especially once tools are involved",
        "The SDK returns content as a base64 string",
        "It works but is slower than filtering",
      ],
      answerIndex: 1,
      explain:
        "content is a discriminated union of block types. With plain chat you'll usually get one text block, but tool_use blocks (and others) can appear — filter on block.type === 'text' and TypeScript narrows the type safely.",
    },
    {
      question:
        "A response comes back with stop_reason: 'max_tokens'. What does that mean?",
      options: [
        "The request was rejected for being too long",
        "The model finished its answer exactly at the limit",
        "Generation was cut off by your max_tokens cap — the text is likely incomplete, but the request succeeded and was billed",
        "You've hit your rate limit for the minute",
      ],
      answerIndex: 2,
      explain:
        "max_tokens truncation is a successful response (HTTP 200) containing an incomplete answer — half-finished sentences or broken JSON. Code must check stop_reason and handle it; rate limits are a different thing entirely (HTTP 429).",
    },
    {
      question: "Where should the ANTHROPIC_API_KEY live?",
      options: [
        "In a constant in the source file, for reproducibility",
        "In server-side environment variables or a secrets manager — never in code or browser bundles",
        "In localStorage so the frontend can call the API directly",
        "In the messages array of each request",
      ],
      answerIndex: 1,
      explain:
        "The key is a billing credential. new Anthropic() reads it from ANTHROPIC_API_KEY by default, so env vars are the natural home — same discipline as DB credentials in PHP. A key in a browser bundle is public within hours.",
    },
  ],
};

export default lesson;
