import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "streaming-to-browser",
  title: "Relaying Streams to the Browser",
  part: "Conversations & Streaming",
  estMinutes: 12,
  summary:
    "The browser must never hold your API key, so your server calls Anthropic and relays the deltas to the client — usually as an SSE response wrapped in a ReadableStream.",

  concept: `
Everything so far streamed to a terminal. Real products stream to a browser —
and that adds one hard constraint: **the API key can never reach the client**.
Anyone can open DevTools, read a key out of your bundle or a network request,
and burn your budget (or exfiltrate data) within the hour. The Anthropic SDK
even makes you type \`dangerouslyAllowBrowser: true\` to run client-side,
which is the SDK politely asking "are you sure you want to leak your key?"

### The relay pattern

So production streaming is a three-hop relay:

1. Browser POSTs the user's message to **your** endpoint.
2. Your server opens the Anthropic stream (key lives server-side, like DB
   credentials in PHP — they never went in the HTML either).
3. As each text delta arrives from Anthropic, your server forwards it to the
   browser immediately — no buffering — then sends a final "done" event with
   \`usage\` and \`stop_reason\`.

The usual wire format for hop 3 is **Server-Sent Events (SSE)** — the same
protocol Anthropic uses to talk to your server, so you are effectively
re-encoding one SSE stream into another. An SSE frame is plain text: an
optional \`event:\` line, a \`data:\` line, and a **blank line as the frame
terminator**:

\`\`\`text
data: {"text":"Hello"}

event: done
data: {"usage":{"output_tokens":42}}

\`\`\`

That trailing blank line (\`\\n\\n\`) is not cosmetic — it is how the browser
knows a frame is complete. Forget it and the client sees nothing.

### A SvelteKit relay endpoint

This is a \`+server.ts\` route returning a \`Response\` wrapping a
\`ReadableStream\` — exactly the shape you met in the SvelteKit course:

\`\`\`ts
// src/routes/api/chat/+server.ts
import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY } from "$env/static/private";

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export const POST = async ({ request }) => {
  const { message } = await request.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const upstream = client.messages.stream({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: message }],
      });
      upstream.on("text", (text) => {
        controller.enqueue(
          encoder.encode(\`data: \${JSON.stringify({ text })}\\n\\n\`)
        );
      });
      const final = await upstream.finalMessage();
      controller.enqueue(
        encoder.encode(
          \`event: done\\ndata: \${JSON.stringify({ usage: final.usage })}\\n\\n\`
        )
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
};
\`\`\`

Each delta is enqueued the moment it arrives — the platform flushes enqueued
chunks to the socket, so the browser paints tokens in real time. The same
pattern works in Express (\`res.write()\` per delta, \`res.flushHeaders()\`
first) or even PHP (echo each chunk, then \`ob_flush(); flush();\` — the
classic incantation for defeating PHP's output buffering).

### Reading it in the browser

\`EventSource\` is the built-in SSE client, but it only issues GET requests.
Chat UIs POST a message body, so the standard approach is \`fetch\` plus the
response body reader:

\`\`\`ts
const res = await fetch("/api/chat", { method: "POST", body: payload });
const reader = res.body!.getReader();
const decoder = new TextDecoder();
// read(), decode, split frames on "\\n\\n", JSON.parse each data: line
\`\`\`

### Beware of buffering middlemen

The relay only feels live if *nothing on the path buffers*. Common killers:
an \`await\` that collects all deltas into a string before responding (see the
comparison), nginx proxy buffering (send \`X-Accel-Buffering: no\` or disable
\`proxy_buffering\`), and compression middleware that waits for the full body.
Any one of these silently turns your streaming UI back into a spinner.
`,

  comparisons: [
    {
      label: "Where the API key lives",
      intro:
        "Both versions get tokens onto the screen. One hands your Anthropic key to every visitor; the other keeps it server-side and exposes only your own endpoint.",
      php: `// chat.ts — runs in the BROWSER (never do this)
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "sk-ant-api03-...", // in the bundle. Anyone can
  dangerouslyAllowBrowser: true, // read it in DevTools —
});                              // the flag name is the review

const stream = client.messages.stream({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: userInput }],
});
stream.on("text", (t) => appendToChat(t));`,
      ts: `// src/routes/api/chat/+server.ts — key stays on the server
import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY } from "$env/static/private";

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export const POST = async ({ request }) => {
  const { message } = await request.json();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const upstream = client.messages.stream({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: message }],
      });
      upstream.on("text", (text) =>
        controller.enqueue(
          encoder.encode(\`data: \${JSON.stringify({ text })}\\n\\n\`)
        )
      );
      await upstream.finalMessage();
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
};`,
      note: "A key in browser code is public the moment you deploy — the SDK's dangerouslyAllowBrowser flag exists precisely to make this hard to do by accident. The relay also gives you one place for auth, rate limiting, and usage logging.",
    },
    {
      label: "Buffer-then-respond vs pipe-as-you-go",
      intro:
        "Both endpoints call Anthropic server-side with the key safely hidden. One awaits the entire completion before responding — the user watches a spinner for the full generation time; the other forwards each delta as it lands.",
      php: `// +server.ts — "streaming" endpoint that doesn't stream
export const POST = async ({ request }) => {
  const { message } = await request.json();

  const upstream = client.messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: message }],
  });

  // Drains the WHOLE stream server-side first.
  // Time-to-first-byte = time-to-LAST-token.
  const final = await upstream.finalMessage();
  const text = final.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  return new Response(JSON.stringify({ text }), {
    headers: { "Content-Type": "application/json" },
  });
};`,
      ts: `// +server.ts — deltas flow through as they arrive
export const POST = async ({ request }) => {
  const { message } = await request.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const upstream = client.messages.stream({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: message }],
      });
      // Enqueue per delta: the browser paints tokens
      // while the model is still generating.
      upstream.on("text", (text) =>
        controller.enqueue(
          encoder.encode(\`data: \${JSON.stringify({ text })}\\n\\n\`)
        )
      );
      const final = await upstream.finalMessage();
      controller.enqueue(encoder.encode(
        \`event: done\\ndata: \${JSON.stringify({
          usage: final.usage,
          stop_reason: final.stop_reason,
        })}\\n\\n\`
      ));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
};`,
      note: "The left version streams from Anthropic but buffers before the browser — first paint waits for the last token. The right one keeps time-to-first-token at ~a second and closes with a done event carrying usage and stop_reason.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The relay in miniature: canned upstream deltas go through the SSE encoder, and JSON.stringify exposes the exact bytes — including the invisible \\n\\n frame terminators — that travel to the browser. Then the browser side parses them back.",
    code: `// The relay, simulated end to end.

// 1. What arrives from Anthropic (simplified upstream events):
type Delta =
  | { type: "text"; text: string }
  | { type: "done"; usage: { input_tokens: number; output_tokens: number } };

const upstream: Delta[] = [
  { type: "text", text: "PHP sessions " },
  { type: "text", text: "live on the server; " },
  { type: "text", text: "the cookie is just the key." },
  { type: "done", usage: { input_tokens: 21, output_tokens: 14 } },
];

// 2. The encoder: one SSE frame per event. The blank line
//    (\\n\\n) is the frame terminator — not optional.
function sseFrame(data: object, event?: string): string {
  const eventLine = event ? "event: " + event + "\\n" : "";
  return eventLine + "data: " + JSON.stringify(data) + "\\n\\n";
}

const wire: string[] = [];
for (const ev of upstream) {
  if (ev.type === "text") {
    wire.push(sseFrame({ text: ev.text }));
  } else {
    wire.push(sseFrame({ usage: ev.usage }, "done"));
  }
}

console.log("== exact bytes over the wire (one frame per line) ==");
for (const frame of wire) {
  // JSON.stringify makes the \\n\\n framing visible:
  console.log(JSON.stringify(frame));
}

// 3. The browser side: split on blank lines, parse data: lines.
const raw = wire.join("");
let reply = "";
let usage = "";
for (const frame of raw.split("\\n\\n")) {
  if (frame === "") continue;
  const isDone = frame.includes("event: done");
  const dataLine = frame
    .split("\\n")
    .find((line) => line.startsWith("data: "));
  if (!dataLine) continue;
  const payload = JSON.parse(dataLine.slice("data: ".length));
  if (isDone) {
    usage = payload.usage.input_tokens + " in / " +
      payload.usage.output_tokens + " out";
  } else {
    reply += payload.text; // appendToChat(payload.text) in real life
  }
}

console.log("");
console.log("== what the user sees, token by token ==");
console.log(reply);
console.log("usage: " + usage);`,
  },

  keyPoints: [
    "The API key must never reach the browser — the SDK's `dangerouslyAllowBrowser: true` flag is a warning label, not a feature. Treat the key like DB credentials in PHP: server-side only.",
    "Production streaming is a relay: browser → your endpoint → Anthropic, with your server re-encoding upstream deltas into an SSE response as they arrive.",
    "An SSE frame is `data: {json}` followed by a blank line — the `\\n\\n` terminator is how the browser detects frame boundaries.",
    "In SvelteKit, the relay is a `+server.ts` POST returning a `Response` wrapping a `ReadableStream`, with `Content-Type: text/event-stream` and `Cache-Control: no-cache`.",
    "Enqueue per delta; never `await finalMessage()` before responding — that turns time-to-first-byte into time-to-last-token. End with a `done` event carrying usage and stop_reason.",
    "Watch for buffering middlemen: nginx proxy buffering and compression middleware can silently de-stream your response. `EventSource` is GET-only, so chat UIs use `fetch` + `res.body.getReader()`.",
  ],

  interview: [
    {
      q: "How would you architect streaming LLM responses into a web front end?",
      a: "As a server relay, because the API key can never ship to the browser. The client POSTs the message to my endpoint; the server opens the Anthropic stream with the key from the environment and returns a `Response` wrapping a `ReadableStream` with `Content-Type: text/event-stream`. Every text delta is encoded as an SSE frame — `data: {json}` plus the blank-line terminator — and enqueued immediately, so time-to-first-token stays around a second. I finish with a `done` event carrying `usage` and `stop_reason` so the client knows the reply completed and I can log cost. The relay endpoint is also the natural choke point for auth, per-user rate limiting, and prompt assembly — none of which you can trust the client to do.",
    },
    {
      q: "Your streaming endpoint works locally but delivers everything in one burst in production. What do you check?",
      a: "Something on the path is buffering. First suspect is the reverse proxy — nginx buffers proxied responses by default, so I'd disable `proxy_buffering` for that route or send `X-Accel-Buffering: no`. Second, compression middleware, which typically waits for the whole body before compressing. Third, my own code — an accidental `await finalMessage()` before constructing the Response drains the stream server-side. The test I use: log a timestamp per enqueued chunk server-side and per received chunk client-side; where the timestamps diverge from arrival order is where the buffer lives. It's the same debugging story as streaming output from PHP through output buffers — find who is holding the bytes.",
    },
    {
      q: "Why use fetch with a stream reader instead of EventSource for a chat UI?",
      a: "`EventSource` is the purpose-built SSE client — automatic reconnect, built-in frame parsing — but it can only make GET requests with no body and no custom headers. A chat turn needs to POST the message, usually with an auth header, so the standard pattern is `fetch` with `res.body.getReader()`: read chunks, decode them, split frames on the blank line, and `JSON.parse` each `data:` payload. You give up automatic reconnection, which for a one-shot chat completion is fine — if the stream drops, you re-send the turn rather than resume mid-reply.",
    },
  ],

  quiz: [
    {
      question: "Why must the Anthropic API key stay off the browser?",
      options: [
        "The SDK cannot make HTTPS requests from browser contexts",
        "CORS blocks all requests from browsers to api.anthropic.com",
        "Anything in client-side code is readable by every visitor — a shipped key is a public key",
        "Browsers cannot parse SSE responses",
      ],
      answerIndex: 2,
      explain:
        "A key in the bundle or in a request header is visible in DevTools to anyone. The SDK will actually run in a browser if you set dangerouslyAllowBrowser: true — the flag exists to make the mistake explicit, not to make it safe. The relay keeps the key server-side like any other credential.",
    },
    {
      question: "In an SSE response, what marks the end of one event frame?",
      options: [
        "A null byte",
        "A blank line (\\n\\n after the data line)",
        "The string [DONE]",
        "A Content-Length header per frame",
      ],
      answerIndex: 1,
      explain:
        "SSE is a line-based text protocol: optional `event:` line, one or more `data:` lines, then an empty line terminating the frame. Forgetting the double newline is the classic bug where the server sends everything and the browser parses nothing.",
    },
    {
      question:
        "A relay endpoint calls `const final = await upstream.finalMessage()` and then returns `new Response(JSON.stringify(...))`. What's the consequence?",
      options: [
        "The response fails because finalMessage() cannot be awaited server-side",
        "Nothing — the browser still receives tokens progressively",
        "Usage data is lost from the response",
        "The server drains the whole upstream stream first, so the user's time-to-first-byte becomes the full generation time",
      ],
      answerIndex: 3,
      explain:
        "Awaiting finalMessage() before responding buffers the entire completion server-side. The upstream leg streamed, but the user-facing leg didn't — first paint now waits for the last token. Pipe deltas through a ReadableStream as they arrive instead.",
    },
  ],
};

export default lesson;
