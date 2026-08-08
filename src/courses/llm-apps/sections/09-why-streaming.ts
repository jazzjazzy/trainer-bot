import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "why-streaming",
  title: "Why Streaming: Latency and UX",
  part: "Conversations & Streaming",
  estMinutes: 10,
  summary:
    "A full completion takes many seconds; streaming sends tokens as they are generated over server-sent events, so the user sees output immediately instead of staring at a spinner.",

  concept: `
Generation is not instant. The model produces one token at a time, and a
long answer can take ten, twenty, thirty seconds to finish. If you
\`await\` the whole thing before rendering, the user watches a spinner for
that entire time. Streaming changes *when* the bytes arrive, not what they
are: instead of one response at the end, you get a sequence of small events
as the model writes, delivered over **server-sent events (SSE)**.

### Time-to-first-token vs total time

Two clocks matter. **Total time** is how long the full answer takes —
streaming doesn't change it. **Time-to-first-token (TTFT)** is how long
until the *first* visible character appears, and streaming collapses it from
"the whole generation" to "a few hundred milliseconds". Users tolerate a
slow total if something is happening; they abandon a blank screen. That gap
is why every serious chat UI — ChatGPT, Claude.ai, your product — streams.

### The SSE wire format

Under the hood, a streaming request keeps one HTTP response open and writes
a series of named events to it. The shape is fixed:

\`\`\`
event: message_start
data: {"type":"message_start","message":{"usage":{"input_tokens":42,...}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}

event: message_stop
data: {"type":"message_stop"}
\`\`\`

The text you render lives in \`content_block_delta\` events whose
\`delta.type\` is \`"text_delta"\` — you concatenate those \`text\` fields
in order to rebuild the message. The bookends (\`message_start\`,
\`message_stop\`) carry metadata: \`message_start\` has the input token count,
and \`message_delta\` near the end carries \`stop_reason\` and the final
\`output_tokens\`. This is the same server-sent-events mechanism you used
for streamed responses in SvelteKit — one long-lived response, many chunks.

### Large outputs essentially require streaming

There's a hard operational reason too, not just UX. A big \`max_tokens\`
(the 128K ceiling on Sonnet 5, or even tens of thousands) can take long
enough that a non-streaming request trips the SDK's HTTP timeout and dies
with nothing to show. A streaming request never idles — bytes keep flowing —
so it sidesteps the timeout entirely. The rule of thumb: stream anything
with a large \`max_tokens\` or a long expected answer. The SDKs even scale
their default timeouts differently for the two modes because of this.
`,

  comparisons: [
    {
      label: "Spinner for 20 seconds vs progressive rendering",
      intro:
        "The same long answer, delivered two ways. One blocks until the whole message is ready; the other paints tokens as they arrive.",
      php: `// First attempt - await the whole thing, then render
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 4096,
  messages: [{ role: "user", content: "Explain OAuth in detail." }],
});

// The UI showed a spinner for the full generation time.
// TTFT == total time: nothing appears until the last token.
render(response.content[0].text);`,
      ts: `// Production - stream deltas and render as they land
const stream = client.messages.stream({
  model: "claude-sonnet-5",
  max_tokens: 4096,
  messages: [{ role: "user", content: "Explain OAuth in detail." }],
});

// First characters appear in a few hundred ms; the answer
// grows on screen while the model is still writing.
stream.on("text", (delta) => appendToUI(delta));
const final = await stream.finalMessage();`,
      note:
        "Streaming doesn't make total generation faster — it makes time-to-first-token tiny, which is the number users actually feel.",
    },
    {
      label: "Raw SSE frames vs SDK events",
      intro:
        "The same streamed reply as raw server-sent-event frames on the wire, and as the typed events the SDK hands you. The SDK parses the frames so you don't.",
      php: `event: message_start
data: {"type":"message_start","message":{"usage":{"input_tokens":42}}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,
       "delta":{"type":"text_delta","text":"Hel"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,
       "delta":{"type":"text_delta","text":"lo"}}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},
       "usage":{"output_tokens":2}}

event: message_stop
data: {"type":"message_stop"}`,
      ts: `// The SDK turns those frames into typed events you iterate.
const stream = client.messages.stream({ model, max_tokens, messages });

for await (const event of stream) {
  if (
    event.type === "content_block_delta" &&
    event.delta.type === "text_delta"
  ) {
    process.stdout.write(event.delta.text); // "Hel", then "lo"
  }
}`,
      note:
        "You rarely touch raw SSE — the SDK reassembles frames into events. But knowing the wire shape (text_delta carries the tokens; message_delta carries stop_reason/usage) is what interviewers probe.",
      leftLang: "bash",
    },
    {
      label: "Large max_tokens: timeout vs safe",
      intro:
        "Requesting a very large output. The non-streaming call risks dying on an HTTP timeout with nothing to show; the streaming call keeps bytes flowing.",
      php: `// First attempt - big non-streaming request
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 64000, // a full-length report
  messages: [{ role: "user", content: "Write the full spec..." }],
});
// Generation can outlast the SDK's HTTP timeout; the
// request fails and you get NOTHING back for your tokens.`,
      ts: `// Production - stream large outputs
const stream = client.messages.stream({
  model: "claude-sonnet-5",
  max_tokens: 64000,
  messages: [{ role: "user", content: "Write the full spec..." }],
});
// The connection never idles, so it won't time out.
// finalMessage() collects the whole thing when done.
const message = await stream.finalMessage();`,
      note:
        "Above roughly 16K max_tokens, stream. A non-streaming request that generates for a long time can trip the HTTP timeout; a streaming one keeps the socket busy.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A simulated stream: an array of SSE-shaped event objects, iterated in order. Watch the message assemble delta by delta, then see the stop_reason and usage that arrive on the closing events.",
    code: `// Simulate what the SDK receives on the wire and how you rebuild
// the message from it. Only text_delta events carry visible tokens.

type TextDelta = { type: 'text_delta'; text: string };
type Usage = { input_tokens: number; output_tokens: number };

type StreamEvent =
  | { type: 'message_start'; message: { usage: Usage } }
  | { type: 'content_block_start'; index: number }
  | { type: 'content_block_delta'; index: number; delta: TextDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string }; usage: { output_tokens: number } }
  | { type: 'message_stop' };

// A canned stream for: "Streaming feels instant."
const wire: StreamEvent[] = [
  { type: 'message_start', message: { usage: { input_tokens: 9, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0 },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Streaming' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' feels' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' instant.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
  { type: 'message_stop' },
];

let text = '';
let stopReason = '';
const usage: Usage = { input_tokens: 0, output_tokens: 0 };

for (const event of wire) {
  if (event.type === 'message_start') {
    usage.input_tokens = event.message.usage.input_tokens;
    console.log('[message_start] input_tokens=' + usage.input_tokens);
  } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    text += event.delta.text; // rebuild the message, token by token
    console.log('  +delta ' + JSON.stringify(event.delta.text) + ' -> "' + text + '"');
  } else if (event.type === 'message_delta') {
    stopReason = event.delta.stop_reason;
    usage.output_tokens = event.usage.output_tokens;
  } else if (event.type === 'message_stop') {
    console.log('[message_stop]');
  }
}

console.log('\\nassembled message: ' + JSON.stringify(text));
console.log('stop_reason: ' + stopReason);
console.log('usage: input=' + usage.input_tokens + ' output=' + usage.output_tokens);

// Try it: add another text_delta before content_block_stop and watch
// the running text grow. Notice the closing events carry no text at all -
// they carry the metadata (stop_reason, output_tokens) instead.`,
  },

  keyPoints: [
    "Streaming sends the answer as it is generated over server-sent events; it doesn't change total time, it collapses time-to-first-token — the number users actually feel.",
    "The SSE wire format is fixed: `message_start` → `content_block_start` → many `content_block_delta` → `content_block_stop` → `message_delta` → `message_stop`.",
    "Visible tokens arrive as `content_block_delta` events with `delta.type: \"text_delta\"`; you concatenate the `text` fields in order to rebuild the message.",
    "Metadata rides the bookends: `message_start` carries input tokens, `message_delta` carries `stop_reason` and final `output_tokens`.",
    "Large `max_tokens` (or any long answer) should stream — a non-streaming request can outlast the SDK's HTTP timeout and return nothing.",
    "It's the same server-sent-events mechanism as SvelteKit streaming: one long-lived HTTP response delivering many chunks.",
  ],

  interview: [
    {
      q: "Why do production chat UIs stream responses instead of awaiting the full completion?",
      a: "Because of time-to-first-token. A long answer can take tens of seconds to generate, and streaming doesn't make that total time shorter — but it makes the first visible character appear in a few hundred milliseconds instead of at the very end. Users tolerate a slow total if they can see progress; they abandon a blank spinner. So every serious chat UI streams: the model writes tokens, they arrive as server-sent events, and I render each delta as it lands. There's an operational reason too — a large max_tokens request can take long enough to trip the SDK's HTTP timeout when non-streaming, whereas a stream keeps the socket busy and never idles out.",
    },
    {
      q: "Walk me through the streaming wire format. Where does the text actually come from?",
      a: "It's server-sent events over one long-lived HTTP response. The sequence is message_start, then content_block_start, then a run of content_block_delta events, then content_block_stop, then message_delta, then message_stop. The visible text lives only in the content_block_delta events whose delta.type is text_delta — each carries a small text fragment, and I concatenate them in order to reconstruct the message. The framing events carry metadata rather than content: message_start has the input token usage, and message_delta near the end carries stop_reason and the final output_tokens. In practice the SDK parses those frames into typed events for me, but knowing the shape matters for debugging and for questions like where usage comes from.",
    },
    {
      q: "When is streaming not just a nice-to-have but effectively required?",
      a: "When max_tokens is large or the answer is expected to be long. A non-streaming request holds the connection open with no traffic until the whole generation finishes, and a long generation can exceed the SDK's default HTTP timeout — the request fails and you've paid for tokens you never received. A streaming request keeps bytes flowing the entire time, so it doesn't time out. The SDKs even scale their default timeouts differently for streaming versus non-streaming for exactly this reason. My rule is to stream anything above roughly 16K max_tokens, and to stream user-facing chat regardless, for the UX.",
    },
  ],

  quiz: [
    {
      question:
        "Which stream event type carries the visible text tokens of the response?",
      options: [
        "message_start",
        "content_block_delta with delta.type 'text_delta'",
        "message_delta",
        "message_stop",
      ],
      answerIndex: 1,
      explain:
        "Text arrives as content_block_delta events whose delta.type is text_delta; you concatenate their text fields in order. message_start/message_delta/message_stop carry metadata (usage, stop_reason), not the answer text.",
    },
    {
      question:
        "What does streaming actually improve compared to awaiting the full response?",
      options: [
        "Total generation time — streamed answers finish sooner",
        "Time-to-first-token — the first characters appear almost immediately, even though total time is unchanged",
        "The cost per token, which is lower when streaming",
        "The quality of the model's output",
      ],
      answerIndex: 1,
      explain:
        "Streaming changes when bytes arrive, not how many or how fast overall. Total time is the same; TTFT drops from 'the whole generation' to a few hundred milliseconds, which is what users perceive as responsiveness.",
    },
    {
      question:
        "Why is streaming effectively required for a request with a very large max_tokens?",
      options: [
        "Non-streaming requests are capped at 4096 tokens",
        "A long non-streaming generation can exceed the SDK's HTTP timeout and fail with nothing returned; a stream keeps the connection active",
        "The API rejects large max_tokens unless stream is true",
        "Streaming doubles the effective max_tokens limit",
      ],
      answerIndex: 1,
      explain:
        "A big output can take long enough that a non-streaming request trips the HTTP timeout and dies. Streaming keeps the socket busy the whole time, so it sidesteps the timeout — which is why the SDKs scale timeouts differently for the two modes.",
    },
  ],
};

export default lesson;
