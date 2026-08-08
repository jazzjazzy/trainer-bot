import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "streaming-typescript",
  title: "Streaming with the TypeScript SDK",
  part: "Conversations & Streaming",
  estMinutes: 11,
  summary:
    "client.messages.stream() returns a MessageStream: async-iterate it for typed events, subscribe with stream.on('text') for just the deltas, and await stream.finalMessage() for the complete Message with stop_reason and usage.",

  concept: `
The SDK gives you a purpose-built helper for streaming so you never have to
parse raw SSE frames yourself. \`client.messages.stream(params)\` returns a
\`MessageStream\` object, and it exposes the response three complementary
ways — pick whichever fits the code you're writing.

### Three ways to consume one stream

\`\`\`ts
const stream = client.messages.stream({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Say hello." }],
});
\`\`\`

**1. Subscribe to just the text.** The most common need — render deltas as
they arrive — is a one-liner:

\`\`\`ts
stream.on("text", (delta) => process.stdout.write(delta));
\`\`\`

**2. Async-iterate the typed events.** When you need more than text (tool
input, block boundaries), loop over the raw events and narrow by \`type\`:

\`\`\`ts
for await (const event of stream) {
  if (
    event.type === "content_block_delta" &&
    event.delta.type === "text_delta"
  ) {
    process.stdout.write(event.delta.text);
  }
}
\`\`\`

Note the two-level narrowing: first \`event.type === "content_block_delta"\`,
then \`event.delta.type === "text_delta"\`. TypeScript needs both before it
will let you read \`event.delta.text\` — the events and deltas are
discriminated unions.

**3. Await the finished message.** When the stream ends, get the complete
\`Message\` — the same object a non-streaming \`create()\` would have
returned — with its assembled content, \`stop_reason\`, and \`usage\`:

\`\`\`ts
const final = await stream.finalMessage();
console.log(final.stop_reason, final.usage.output_tokens);
\`\`\`

### Don't hand-roll a Promise around .on events

The tempting anti-pattern is to wire up \`.on("text", ...)\`, buffer the
chunks yourself, and wrap the whole thing in \`new Promise\` that resolves on
some "done" event. Don't. \`finalMessage()\` already does exactly that —
including error and abort handling — and it returns the fully-typed
\`Message\`. Subscribe for live rendering, \`await finalMessage()\` for the
result. The two compose: fire \`on("text")\` for the UI, then
\`await finalMessage()\` to persist and inspect.

### Why finalMessage matters

If you only read the deltas, you lose the metadata that lives on the message,
not the text — \`stop_reason\` (was it \`end_turn\`, or \`max_tokens\` cutting
you off?) and \`usage\` (the token counts you log for cost). And when you're
building a chat, \`finalMessage()\` gives you the exact \`response.content\`
block array to append back into your history — the append-the-blocks
discipline from multi-turn state works identically whether you streamed or
not.
`,

  comparisons: [
    {
      label: "Nested-if event filtering vs on('text') + finalMessage()",
      intro:
        "Render the reply live and get the finished message. The left hand-filters every raw event; the right uses the two helpers the SDK provides.",
      php: `// First attempt - manually filter every event, and
// hand-roll a Promise to collect the final message.
const stream = client.messages.stream({ model, max_tokens, messages });
let text = "";

const done = new Promise((resolve) => {
  stream.on("streamEvent", (event) => {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      text += event.delta.text;
      render(text);
    }
    // ...and now reimplement stop_reason/usage/error
    // handling by hand. This is what the SDK already does.
  });
});
await done;`,
      ts: `// Production - subscribe for deltas, await the message
const stream = client.messages.stream({ model, max_tokens, messages });

// Live rendering: just the text deltas.
stream.on("text", (delta) => render(delta));

// The finished, fully-typed Message - content, stop_reason, usage.
const final = await stream.finalMessage();
console.log("stop_reason:", final.stop_reason);
console.log("output_tokens:", final.usage.output_tokens);`,
      note:
        "on('text') hands you just the delta string; finalMessage() handles completion/error/abort and returns the complete Message. Wrapping .on in new Promise reimplements what finalMessage already does.",
    },
    {
      label: "Reading deltas only vs accumulate-then-inspect",
      intro:
        "Both stream the answer. One prints deltas and stops there; the other also captures the message so it can check the stop reason and store history.",
      php: `// First attempt - deltas only, then throw the stream away
const stream = client.messages.stream({ model, max_tokens, messages });
for await (const event of stream) {
  if (
    event.type === "content_block_delta" &&
    event.delta.type === "text_delta"
  ) {
    process.stdout.write(event.delta.text);
  }
}
// No stop_reason (did max_tokens truncate it?), no usage
// (what did this cost?), and nothing to append to history.`,
      ts: `// Production - stream live, then inspect the final Message
const stream = client.messages.stream({ model, max_tokens, messages });
for await (const event of stream) {
  if (
    event.type === "content_block_delta" &&
    event.delta.type === "text_delta"
  ) {
    process.stdout.write(event.delta.text);
  }
}

const final = await stream.finalMessage();
if (final.stop_reason === "max_tokens") warnTruncated();
logCost(final.usage);
messages.push({ role: "assistant", content: final.content }); // append blocks`,
      note:
        "finalMessage() is not optional bookkeeping: stop_reason tells you whether the answer was cut off, usage is your cost signal, and final.content is exactly what you append back into history.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A mini MessageStream over canned wire events, exposing on('text') and finalMessage() like the real SDK. Register a text handler, drive it, and watch the deltas fire before the assembled Message and its usage.",
    code: `// A tiny stand-in for the SDK's MessageStream. It fires 'text'
// events as deltas arrive and assembles the final Message.

type TextDelta = { type: 'text_delta'; text: string };
type Usage = { input_tokens: number; output_tokens: number };

type StreamEvent =
  | { type: 'message_start'; message: { usage: Usage } }
  | { type: 'content_block_delta'; index: number; delta: TextDelta }
  | { type: 'message_delta'; delta: { stop_reason: string }; usage: { output_tokens: number } }
  | { type: 'message_stop' };

type FinalMessage = {
  content: { type: 'text'; text: string }[];
  stop_reason: string;
  usage: Usage;
};

class MiniMessageStream {
  private text = '';
  private stopReason = '';
  private usage: Usage = { input_tokens: 0, output_tokens: 0 };
  private textHandlers: ((delta: string) => void)[] = [];

  constructor(private events: StreamEvent[]) {}

  // Mirrors stream.on('text', cb): subscribe to delta strings.
  on(event: 'text', handler: (delta: string) => void): this {
    if (event === 'text') this.textHandlers.push(handler);
    return this;
  }

  // Mirrors await stream.finalMessage(): drive to completion,
  // firing handlers, then return the assembled Message.
  async finalMessage(): Promise<FinalMessage> {
    for (const event of this.events) {
      if (event.type === 'message_start') {
        this.usage.input_tokens = event.message.usage.input_tokens;
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        this.text += event.delta.text;
        for (const h of this.textHandlers) h(event.delta.text);
      } else if (event.type === 'message_delta') {
        this.stopReason = event.delta.stop_reason;
        this.usage.output_tokens = event.usage.output_tokens;
      }
    }
    return {
      content: [{ type: 'text', text: this.text }],
      stop_reason: this.stopReason,
      usage: this.usage,
    };
  }
}

const wire: StreamEvent[] = [
  { type: 'message_start', message: { usage: { input_tokens: 7, output_tokens: 0 } } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The SDK' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' does' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' the parsing.' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } },
  { type: 'message_stop' },
];

const stream = new MiniMessageStream(wire);

// 1. Subscribe for live deltas (what a chat UI renders).
stream.on('text', (delta) => console.log('delta -> ' + JSON.stringify(delta)));

// 2. Await the finished Message (what you persist and inspect).
const final = await stream.finalMessage();

console.log('\\nassembled: ' + JSON.stringify(final.content[0].text));
console.log('stop_reason: ' + final.stop_reason);
console.log('usage: input=' + final.usage.input_tokens +
  ' output=' + final.usage.output_tokens);

// Try it: register a SECOND on('text') handler that counts deltas -
// both fire per token, just like multiple subscribers on the real stream.`,
  },

  keyPoints: [
    "`client.messages.stream(params)` returns a `MessageStream`; consume it via `on('text')`, async iteration, or `finalMessage()` — often more than one together.",
    "`stream.on('text', cb)` delivers just the delta strings — the simplest path for rendering tokens as they arrive.",
    "Async-iterating requires two-level narrowing: `event.type === 'content_block_delta'` then `event.delta.type === 'text_delta'` before you can read `event.delta.text`.",
    "`await stream.finalMessage()` returns the complete `Message` — assembled content, `stop_reason`, and `usage` — the same object a non-streaming `create()` returns.",
    "Never wrap `.on()` events in `new Promise` to collect the result — `finalMessage()` already handles completion, errors, and abort.",
    "Read `finalMessage()` even when streaming: `stop_reason` reveals truncation, `usage` is your cost signal, and `final.content` is what you append back into chat history.",
  ],

  interview: [
    {
      q: "How do you stream a response with the TypeScript SDK, and how do you get the complete message at the end?",
      a: "I call client.messages.stream(params), which returns a MessageStream. For live rendering I subscribe with stream.on('text', delta => ...) — that fires with just the delta string per token, ideal for painting the UI. When the stream finishes I await stream.finalMessage(), which returns the full Message object: the assembled content blocks, stop_reason, and usage — the same shape a non-streaming create() would return. The two compose naturally: on('text') for the incremental render, finalMessage() for the result I persist and inspect. If I need more than text — like streamed tool input — I async-iterate the stream instead and narrow the event types.",
    },
    {
      q: "A colleague wraps stream.on('text') in a new Promise that resolves on the final event to get the complete message. What's your feedback?",
      a: "That reimplements finalMessage() by hand, and worse than the SDK does it — the SDK's finalMessage() already accumulates the message and handles error and abort states internally, returning a fully-typed Message. The hand-rolled Promise typically only handles the happy path: it forgets rejection on stream errors, doesn't surface stop_reason or usage, and loses the typed content blocks. My feedback is to delete the Promise wrapper and just await stream.finalMessage(), keeping on('text') purely for live rendering. Use the SDK helper; don't rebuild it.",
    },
    {
      q: "When you async-iterate a stream, why does TypeScript stop you from reading event.delta.text directly?",
      a: "Because the stream events are a discriminated union, and so are the deltas within them. event could be message_start, content_block_delta, message_delta, and so on — only content_block_delta has a delta at all. And even within content_block_delta, delta could be a text_delta or, say, an input_json_delta for tool arguments. So I have to narrow twice: first event.type === 'content_block_delta', then event.delta.type === 'text_delta'. Only after both checks does the compiler know event.delta has a text field. That double-narrow is the SDK giving me type safety over the wire format rather than making me cast.",
    },
  ],

  quiz: [
    {
      question:
        "What does client.messages.stream(...) return, and how do you get the completed message from it?",
      options: [
        "A plain Promise<Message> you simply await",
        "A MessageStream — subscribe/iterate for deltas, and await stream.finalMessage() for the complete Message",
        "An async generator of strings; the last string is the full message",
        "A ReadableStream you must parse with a TextDecoder",
      ],
      answerIndex: 1,
      explain:
        "stream() returns a MessageStream helper. You render deltas via on('text') or async iteration, and call await stream.finalMessage() to get the assembled Message with stop_reason and usage — no manual SSE parsing.",
    },
    {
      question:
        "Async-iterating the stream, which condition lets you safely read a text token?",
      options: [
        "event.type === 'text_delta'",
        "event.type === 'content_block_delta' && event.delta.type === 'text_delta'",
        "event.delta !== undefined",
        "event.type === 'message_delta'",
      ],
      answerIndex: 1,
      explain:
        "Events and deltas are discriminated unions, so you narrow twice: the event must be a content_block_delta, and its delta must be a text_delta. Only then does the compiler expose event.delta.text.",
    },
    {
      question:
        "Why call stream.finalMessage() instead of just reading the text deltas as they arrive?",
      options: [
        "It re-runs the request to double-check the output",
        "The deltas are unreliable and often arrive out of order",
        "It returns the complete Message — with stop_reason (truncation), usage (cost), and the content blocks to append to history",
        "Without it, streaming costs twice as much",
      ],
      answerIndex: 2,
      explain:
        "The deltas are only the text. finalMessage() gives you the metadata that lives on the message: stop_reason (was it end_turn or max_tokens?), usage for cost logging, and the content block array you push back into your conversation history.",
    },
  ],
};

export default lesson;
