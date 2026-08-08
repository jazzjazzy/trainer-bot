import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "multi-turn-state",
  title: "Multi-Turn Conversations: You Keep the State",
  part: "Conversations & Streaming",
  estMinutes: 10,
  summary:
    "The API remembers nothing between calls — to build a chat you store the transcript yourself and resend all of it every turn, exactly like $_SESSION carrying state across stateless PHP requests.",

  concept: `
Every call to \`client.messages.create()\` is a complete, self-contained
transaction. The API processes the request, returns a response, and forgets
you exist. There is no \`conversation_id\`, no server-side chat session, no
"continue where we left off". If that sounds familiar, it should: it's the
PHP request/response cycle. HTTP forgot your user between page loads too —
so you stored their state in \`$_SESSION\` and rehydrated it on every
request. A Claude chat is the same pattern with one twist: instead of
rehydrating state *for your own code*, you resend the entire transcript *to
the model* on every turn.

### The append loop

A chat is an array you own, growing by two entries per turn:

\`\`\`ts
const messages: Anthropic.MessageParam[] = [];

// each turn:
messages.push({ role: "user", content: userInput });

const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  system: SYSTEM_PROMPT,
  messages, // the WHOLE history, every time
});

messages.push({ role: "assistant", content: response.content });
\`\`\`

Three rules keep the array valid: the first message must be \`user\`, roles
should alternate user/assistant, and — the one everyone gets wrong —
**append \`response.content\`, the whole block array, not the extracted
text**.

### Why the whole content array?

\`response.content\` is an array of typed blocks. Today it's usually one
\`{ type: "text", text: "..." }\` block, and it's tempting to push just the
string. That works — until it doesn't. The moment you add tools, responses
contain \`tool_use\` blocks that MUST be echoed back intact for the next
request to be valid; with extended thinking, \`thinking\` blocks have the
same requirement. Appending \`response.content\` verbatim costs nothing now
and means your chat loop doesn't need surgery later. Extract text for
*display*; append blocks for *state*.

### Costs grow with the transcript

Because you resend everything, turn N's input includes turns 1 through N-1.
Input tokens grow roughly linearly per turn, so the total tokens billed over
a conversation grow roughly quadratically. A 50-turn support chat where each
turn resends 4,000 tokens of history costs real money — which is why the
next section is about trimming, and why production systems lean on prompt
caching (the unchanged history prefix rereads at ~0.1x price).

### What "the model forgot" actually means

When a user complains the bot "forgot" their name, the model didn't forget
anything — it never knew. Either the turn that contained the name was
dropped from the array you sent, or you started a fresh array. Memory is
not a model feature; it's your data layer. Where you keep it is a boring,
familiar decision: an in-memory Map for a prototype, a \`conversations\`
table with a JSON column in production — the same choices you've made for
PHP session storage for two decades.
`,

  comparisons: [
    {
      label: "Expecting the API to remember",
      intro:
        "Turn two of a chat. The first version assumes the server kept turn one; the second resends it.",
      php: `// First attempt - "surely it has a session"
// Turn 1
await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hi, I'm Alice." }],
});

// Turn 2 - sends ONLY the new message. There is no
// conversation_id parameter; the model sees a brand-new
// one-message chat and has no idea who Alice is.
await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "What's my name?" }],
});`,
      ts: `// Production - you are the session store
const messages: Anthropic.MessageParam[] = [];

messages.push({ role: "user", content: "Hi, I'm Alice." });
const r1 = await client.messages.create({
  model: "claude-sonnet-5", max_tokens: 1024, messages,
});
messages.push({ role: "assistant", content: r1.content });

messages.push({ role: "user", content: "What's my name?" });
const r2 = await client.messages.create({
  model: "claude-sonnet-5", max_tokens: 1024, messages,
});
// r2 can answer "Alice" - because YOU resent turn 1.
messages.push({ role: "assistant", content: r2.content });`,
      note:
        "The API is stateless like a PHP request: no conversation_id exists. History lives in your array/DB and is resent in full every turn — that's the entire memory mechanism.",
    },
    {
      label: "Appending text vs appending content blocks",
      intro:
        "Both loops store the assistant's reply back into history. One stores a string it extracted; the other stores the response content verbatim.",
      php: `// First attempt - extract the text, store the text
const response = await client.messages.create({
  model: "claude-sonnet-5", max_tokens: 1024, messages,
});

const text = response.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("");

// Legal today. But once tools are enabled, responses
// contain tool_use blocks - dropping them makes the
// next request invalid (orphaned tool_result) and
// silently discards thinking blocks too.
messages.push({ role: "assistant", content: text });`,
      ts: `// Production - blocks for state, text for display
const response = await client.messages.create({
  model: "claude-sonnet-5", max_tokens: 1024, messages,
});

// State: echo the whole content array back verbatim.
messages.push({ role: "assistant", content: response.content });

// Display: extract text separately, only for the UI.
const display = response.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("");
render(display);`,
      note:
        "response.content is an array of typed blocks. Appending it whole is forwards-compatible with tool_use and thinking blocks; appending extracted text is a time bomb that detonates the day you add tools.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A fake 3-turn chat with canned model replies. Watch the messages array grow by two per turn, and the token estimate — what you'd pay to send — climb with it.",
    code: `// The append pattern with a canned "API". The state handling is
// exactly what you'd write against the real SDK.

type ContentBlock = { type: 'text'; text: string };
type Message = { role: 'user' | 'assistant'; content: ContentBlock[] };

const cannedReplies = [
  "Hi Alice! Try the Pipe Track - about 6km, gentle, great views.",
  'For a morning on the Pipe Track, 1.5 litres of water is plenty.',
  'Your name is Alice - you told me in your first message.',
];

// Rough chars/4 estimator (real code: client.messages.countTokens).
function estimateTokens(msgs: Message[]): number {
  let chars = 0;
  for (const m of msgs) {
    for (const block of m.content) chars += block.text.length;
  }
  return Math.ceil(chars / 4);
}

// Stand-in for client.messages.create({ ..., messages: history })
function fakeCreate(history: Message[], turn: number) {
  return { content: [{ type: 'text', text: cannedReplies[turn] } as ContentBlock] };
}

const messages: Message[] = [];
const userTurns = [
  "Hi, I'm Alice. Recommend an easy day hike near Cape Town.",
  'How much water should I bring?',
  "What's my name?",
];

userTurns.forEach((text, turn) => {
  // 1. push the user turn
  messages.push({ role: 'user', content: [{ type: 'text', text }] });

  // 2. call the API with the FULL history
  const response = fakeCreate(messages, turn);

  // 3. push the whole content array back - not just extracted text
  messages.push({ role: 'assistant', content: response.content });

  console.log(
    'turn ' + (turn + 1) + ': array has ' + messages.length +
    ' messages, ~' + estimateTokens(messages) + ' tokens resent next call'
  );
});

console.log('\\nroles: ' + messages.map((m) => m.role).join(' -> '));
console.log('last reply: ' + messages[messages.length - 1].content[0].text);

// Try it: comment out step 1 for turn 3 and see why the model
// could never answer "What's my name?" - you dropped the state.`,
  },

  keyPoints: [
    "Every `messages.create()` call is stateless — there is no conversation_id or server-side session. History is your job, exactly like `$_SESSION` over stateless HTTP.",
    "The append loop: push the user turn, call the API with the full array, push `response.content` back — two entries per turn, first message always `user`.",
    "Append the whole `response.content` block array, not extracted text — tool_use and thinking blocks must survive the round trip once you use those features.",
    "Costs grow with the transcript: each turn resends all prior turns, so total tokens over a conversation grow roughly quadratically — prompt caching and trimming are the countermeasures.",
    "'The model forgot' always means 'my code dropped it from the array' — memory is a data-layer decision (Map, DB row, JSON column), not a model feature.",
  ],

  interview: [
    {
      q: "The Anthropic API has no conversation ID. How do you build a multi-turn chat on top of it?",
      a: "You own the state. I keep a messages array per conversation — in production, a conversations table with the transcript in a JSON column — and every turn I push the user's message, call `messages.create` with the entire array, then push the assistant's `response.content` back. The API is stateless like a PHP request cycle, and my history store plays the role `$_SESSION` always did. Two invariants: the first message is always role user, and I append the full content block array rather than extracted text, so the loop keeps working when tool_use or thinking blocks show up. The trade-off is cost: the whole transcript is resent every turn, so long chats need prompt caching and a trimming strategy.",
    },
    {
      q: "Why should you append response.content back into history instead of the reply text?",
      a: "Because content is an array of typed blocks, and text is only one block type. If I extract the string and store that, everything works until the feature set grows: tool calls put tool_use blocks in the response that must be echoed back intact — the follow-up request pairs them with tool_result blocks and is invalid without them — and extended thinking has similar block-preservation rules. Appending `response.content` verbatim is free insurance. The rule I use: blocks are state, text is presentation — extract text for the UI, never for the transcript.",
    },
    {
      q: "A user reports the chatbot 'forgot' what they said five minutes ago. Where do you look first?",
      a: "In my own state handling, not the model. 'Forgot' almost always means the turn never made it into the messages array for the later request: the session/DB row wasn't loaded, a new conversation was started on page refresh, or a trimming step dropped the turn that held the fact. I'd log exactly what messages array was sent with the failing request — if the information isn't in it, the model never had a chance. The mental model that makes debugging fast is that the model has no memory at all; it only ever sees what this one request contains.",
    },
  ],

  quiz: [
    {
      question:
        "How does the Claude API 'remember' earlier turns of a conversation?",
      options: [
        "It doesn't — your application resends the full message history with every request",
        "Via the conversation_id parameter on messages.create",
        "The SDK caches history in the client object automatically",
        "The model retains context for 5 minutes per API key",
      ],
      answerIndex: 0,
      explain:
        "The API is stateless. There is no conversation_id and the SDK stores nothing — the only 'memory' is the messages array you build, persist, and resend, like $_SESSION data over stateless HTTP.",
    },
    {
      question:
        "After a successful call, what should your chat loop append to the messages array?",
      options: [
        "Nothing — the next request only needs the new user message",
        "The extracted reply string, to keep the array small",
        "{ role: 'assistant', content: response.content } — the full block array",
        "The response's usage object, for cost tracking",
      ],
      answerIndex: 2,
      explain:
        "Push the whole content array back. Extracted text happens to work for plain chat but breaks the transcript the moment responses include tool_use (or thinking) blocks, which must be echoed back intact.",
    },
    {
      question:
        "Why do long conversations get progressively more expensive per turn?",
      options: [
        "The API charges a per-turn surcharge after 10 turns",
        "Every turn resends all previous turns as input tokens, so input size grows with the transcript",
        "Output tokens double each turn",
        "They don't — only output length affects cost",
      ],
      answerIndex: 1,
      explain:
        "Turn N's request contains turns 1..N-1, so input tokens grow each turn and total spend grows roughly quadratically over the conversation. Prompt caching (cheap rereads of the unchanged prefix) and history trimming are the standard mitigations.",
    },
  ],
};

export default lesson;
