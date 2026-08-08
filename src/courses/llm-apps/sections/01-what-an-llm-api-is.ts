import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "what-an-llm-api-is",
  title: "What an LLM API Actually Is",
  part: "The Mental Model",
  estMinutes: 10,
  summary:
    "An LLM API is a stateless HTTPS endpoint: you send the whole conversation as data, it returns a completion, and it remembers nothing — exactly like a fresh PHP request with no $_SESSION.",

  concept: `
Strip away the hype and an LLM API is one HTTPS endpoint. For Anthropic it's
\`POST https://api.anthropic.com/v1/messages\`. You send JSON in, you get JSON
back. No WebSocket, no persistent connection, no server-side conversation
object. If you can call a REST API from PHP with Guzzle, you already have the
mechanical skills — what's new is the *mental model*.

### Stateless, like every PHP request you've ever handled

Twenty-five years of PHP taught you that each request starts from zero: the
script boots, handles one request, and dies. Anything that needs to persist —
the logged-in user, the shopping cart — lives in \`$_SESSION\` or the database,
and *your code* loads it back in on the next request.

The Claude API works exactly the same way. **Every call is a cold start.** The
model has no memory of your previous call, no session, no user record. When a
chatbot "remembers" that your name is Jason, that's not the model remembering —
it's the *application* resending the earlier messages ("My name is Jason" and
the reply) inside the next request. The conversation history is your
\`$_SESSION\`: state that you store and you replay.

This has a sharp consequence: the model also doesn't *learn* from your calls.
Sending it your codebase a thousand times doesn't train it. Each request is
evaluated against frozen weights, produces a response, and is forgotten.

### The request, conceptually

Three fields matter on day one:

\`\`\`json
{
  "model": "claude-sonnet-5",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "Explain HTTP caching in one paragraph." }
  ]
}
\`\`\`

- **\`model\`** — which model handles the request. \`claude-sonnet-5\` is the
  everyday workhorse; there are cheaper (\`claude-haiku-4-5\`) and more capable
  (\`claude-opus-4-8\`) tiers you pick per use case, like choosing an instance size.
- **\`max_tokens\`** — a hard cap on how long the *response* may be. Required.
- **\`messages\`** — the entire conversation so far, as an array of
  \`{ role, content }\` turns. This is the model's whole world: if it isn't in
  \`messages\` (or the \`system\` prompt), the model does not know it.

### The response, conceptually

\`\`\`json
{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-5",
  "content": [ { "type": "text", "text": "HTTP caching lets..." } ],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 18, "output_tokens": 96 }
}
\`\`\`

- **\`content\`** is an *array of typed blocks*, not a string. Today it holds one
  text block; once tools arrive it can hold several blocks of different types.
- **\`stop_reason\`** says *why* generation stopped: \`end_turn\` (finished
  naturally), \`max_tokens\` (you cut it off), and a few others you'll meet later.
- **\`usage\`** reports the exact tokens consumed — this is your billing meter,
  attached to every single response.

### "Predicting tokens" vs "thinking"

Under the hood the model does one thing: given the text so far, it repeatedly
picks the most plausible next *token* (a word fragment) until it decides to
stop. That's why it can be confidently wrong — plausible-sounding is what it
optimizes for — and why everything is billed in tokens. You don't need the
internals for interviews, but you do need this framing: the API is a **pure
function over the transcript you send**. Same transcript in, statistically
similar completion out. All engineering around LLMs — history management,
retrieval, tools — is fundamentally about *deciding what goes into that
transcript*.
`,

  comparisons: [
    {
      label: "Imagined stateful service vs. pure function over the transcript",
      intro:
        "A follow-up question ('make it shorter') only works if the model can see what 'it' refers to. The left code assumes the API remembers the previous exchange; the right resends it.",
      php: `// First attempt: assumes the API keeps a session
const first = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Summarize this release note: ..." }],
});

// Later — a follow-up, sent alone:
const followUp = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  // The model has NEVER seen the release note or its own
  // summary. "it" refers to nothing.
  messages: [{ role: "user", content: "Make it shorter." }],
});`,
      ts: `// Production: the app owns the history and replays it
const history: Array<{ role: "user" | "assistant"; content: string }> = [];

history.push({ role: "user", content: "Summarize this release note: ..." });
const first = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: history,
});
history.push({ role: "assistant", content: firstText(first) });

// The follow-up carries the whole transcript:
history.push({ role: "user", content: "Make it shorter." });
const followUp = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: history, // 3 turns — now "it" means something
});`,
      note:
        "There is no session on the server. Conversation memory is data your app stores and resends — the LLM equivalent of $_SESSION.",
    },
    {
      label: "Raw curl vs. the SDK call",
      intro:
        "The same request twice: once as the bare HTTP call (auth header, version header, JSON body), once through the official SDK. Seeing the raw form proves there's no magic underneath.",
      php: `# Raw HTTP — what actually goes over the wire
curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: \$ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "claude-sonnet-5",
    "max_tokens": 1024,
    "messages": [
      { "role": "user", "content": "Hello, Claude" }
    ]
  }'`,
      ts: `// Same request via @anthropic-ai/sdk
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const message = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello, Claude" }],
});

console.log(message.content); // typed content blocks
console.log(message.usage);   // { input_tokens, output_tokens }`,
      note:
        "The SDK adds types, retries, and auth handling — but it's the same single POST. Guzzle-vs-official-SDK, all over again.",
      leftLang: "bash",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A fake callModel() that returns a response in the real wire shape. Read the extraction code at the bottom first and predict the four logged lines — then run it and study the shape you'll be parsing for the rest of this course.",
    code: `// The Messages API wire shape, simulated. No SDK, no network —
// just the exact JSON structure a real call returns.

interface TextBlock {
  type: "text";
  text: string;
}

interface ModelResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: TextBlock[];
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  usage: { input_tokens: number; output_tokens: number };
}

interface ModelRequest {
  model: string;
  max_tokens: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

// Stateless fake endpoint: everything it "knows" is in the request.
function callModel(request: ModelRequest): ModelResponse {
  const lastUserTurn = request.messages[request.messages.length - 1];
  return {
    id: "msg_01FakeButRealisticId000001",
    type: "message",
    role: "assistant",
    model: request.model,
    content: [
      {
        type: "text",
        text: \`You asked: "\${lastUserTurn.content}" — here is a reply.\`,
      },
    ],
    stop_reason: "end_turn",
    usage: { input_tokens: 21, output_tokens: 14 },
  };
}

const response = callModel({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "What is a context window?" }],
});

// Walk the parts of the response — this is the anatomy to memorize:
console.log("model:       " + response.model);
console.log("stop_reason: " + response.stop_reason);
console.log("text:        " + response.content[0].text);
console.log(
  \`usage:       \${response.usage.input_tokens} in / \${response.usage.output_tokens} out\`
);

// Try it: add a second user message to the array and see that ONLY
// what you send exists for the model — nothing is remembered.`,
  },

  keyPoints: [
    "The Claude API is a single stateless endpoint: `POST /v1/messages`. Every call starts from zero, like a fresh PHP request with no `$_SESSION`.",
    "Anything the model 'remembers' is data your application stored and resent in the `messages` array — conversation history is state YOU manage.",
    "A request needs three things: `model` (e.g. `claude-sonnet-5`), `max_tokens` (required cap on the reply), and `messages` (the whole conversation so far).",
    "The response's `content` is an array of typed blocks — not a plain string — plus `stop_reason` (why it stopped) and `usage` (your billing meter).",
    "The model predicts plausible next tokens over the transcript you send; it doesn't learn from your calls, and it can be confidently wrong.",
    "Think of the API as a pure function over the transcript: all LLM engineering is deciding what goes into that transcript.",
  ],

  interview: [
    {
      q: "Is the Claude API stateful? How do chat apps remember earlier messages?",
      a: "It's completely stateless — every call to `/v1/messages` is independent, with no server-side session or conversation object. Chat memory is an application concern: my app appends each user turn and each assistant reply to a transcript it stores (in memory, Redis, or a database), and sends the *entire* transcript with every new request. It's exactly the PHP request-cycle model — the model is the script that dies after each request, and the message history plays the role of `$_SESSION`. The practical consequences are that input token cost grows with conversation length, and that trimming or summarizing history is my job, not the API's.",
    },
    {
      q: "Walk me through what's in a Messages API request and response.",
      a: "The request is a JSON POST with three core fields: `model` (say `claude-sonnet-5`), a required `max_tokens` cap on the response length, and `messages` — an array of `{role, content}` turns representing the whole conversation, starting with a user turn. A system prompt goes in a separate top-level `system` field, not as a message. The response comes back with `content` as an array of typed blocks (I never assume it's a single string — with tools it can contain multiple block types), `stop_reason` telling me whether the model finished naturally (`end_turn`) or hit my `max_tokens` cap, and `usage` with exact input and output token counts, which I log for cost tracking.",
    },
    {
      q: "Does the model learn from the requests your product sends it?",
      a: "No. The model's weights are frozen at training time; inference just runs the transcript through them and returns a completion. Sending our data a million times doesn't teach it anything — the next call starts as ignorant as the first. If a product needs the model to 'know' our data, that knowledge has to travel inside the request: pasted into the prompt, injected via retrieval (RAG), or exposed through tools. That distinction — model weights vs. request context — is the foundation for basically every architecture decision in LLM apps.",
    },
  ],

  quiz: [
    {
      question:
        "A user sends 'make it shorter' as their second message in your chat app. What must your backend do for the model to understand the request?",
      options: [
        "Nothing — the API keeps a session per API key",
        "Send a session_id parameter referencing the earlier exchange",
        "Resend the earlier user message and assistant reply in the messages array, followed by the new turn",
        "Fine-tune the model on the previous conversation first",
      ],
      answerIndex: 2,
      explain:
        "The API is stateless: the messages array you send is the model's entire world. There is no session_id, no server-side memory. Your app stores the transcript and replays it — that's the $_SESSION of LLM apps.",
    },
    {
      question: "What is the `content` field of a Messages API response?",
      options: [
        "A plain string containing the model's reply",
        "An array of typed blocks, e.g. [{ type: 'text', text: '...' }]",
        "A base64-encoded blob you must decode",
        "A URL where the completed response can be fetched",
      ],
      answerIndex: 1,
      explain:
        "content is always an array of typed blocks. For a simple reply it's one text block, but tool use adds other block types — so robust code inspects block.type instead of assuming a string.",
    },
    {
      question:
        "Which statement about how the model 'remembers' and 'learns' is accurate?",
      options: [
        "It remembers your conversations and gradually learns your domain",
        "It remembers within one API key's calls but doesn't learn",
        "It neither remembers between calls nor learns from your requests — its weights are frozen",
        "It learns only when you set a training flag on the request",
      ],
      answerIndex: 2,
      explain:
        "Each request runs against frozen weights and is forgotten. Memory is history your app resends; knowledge is context your app injects. No amount of API traffic trains the model.",
    },
  ],
};

export default lesson;
