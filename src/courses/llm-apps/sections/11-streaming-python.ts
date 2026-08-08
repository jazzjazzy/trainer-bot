import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "streaming-python",
  title: "Streaming in Python",
  part: "Conversations & Streaming",
  estMinutes: 10,
  summary:
    "Python streams with a context manager and an iterator — `with client.messages.stream(...) as stream:` then `for text in stream.text_stream:` — the same wire events as TypeScript, wrapped in a different idiom.",

  concept: `
The wire protocol does not change when you switch languages. Anthropic still
sends the same SSE events — \`message_start\`, \`content_block_delta\` carrying
\`text_delta\` chunks, \`message_delta\`, \`message_stop\`. What changes is the
idiom the SDK wraps around them. TypeScript gives you an **event emitter**
(\`stream.on("text", ...)\`); Python gives you a **context manager wrapping an
iterator**. Same events, two local dialects.

### The canonical shape

\`\`\`python
# stream_demo.py
from anthropic import Anthropic

client = Anthropic()  # reads ANTHROPIC_API_KEY from the environment

with client.messages.stream(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Explain HTTP keep-alive briefly."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    print()
    final = stream.get_final_message()

print(final.stop_reason, final.usage.output_tokens)
\`\`\`

Three pieces to notice, each doing one job:

- **\`with ... as stream:\`** — the context manager. An open stream is a live
  HTTP connection; \`with\` guarantees it gets closed even if your loop body
  raises. It is the same guarantee you would build in PHP with
  \`try/finally { fclose($fh); }\` — except the language enforces it.
- **\`stream.text_stream\`** — a generator that yields *only* the text deltas,
  already unwrapped to plain strings. You never touch event types.
- **\`stream.get_final_message()\`** — after the loop, the fully accumulated
  \`Message\`: content blocks, \`stop_reason\`, \`usage\`. Identical shape to a
  non-streaming response, so the rest of your code doesn't care which path
  produced it.

### text_stream vs iterating raw events

If you iterate the stream object itself (\`for event in stream:\`) you get
every event — raw wire events plus SDK conveniences like \`event.type ==
"text"\`. That is the right tool when you need \`content_block_stop\` or
tool-use blocks. For plain text replies, \`text_stream\` removes a whole class
of bugs: no event-type checks to get wrong, no chunks silently dropped
because you tested for the wrong \`delta.type\`. There is also
\`stream.get_final_text()\` (all text blocks concatenated) and
\`stream.until_done()\` (block until the stream is fully read).

### flush=True, or your stream looks frozen

Python buffers stdout. On an interactive terminal it is line-buffered, so
\`print(text, end="")\` — which never emits a newline until the loop ends —
can sit invisible in the buffer. Piped, or inside a Docker container shipping
logs, stdout is *block*-buffered: nothing appears until ~8KB accumulates or
the process exits. The result looks exactly like a hung request. PHP
developers have met this before as the \`ob_flush(); flush();\` dance when
streaming output past PHP's own buffers. The fix is one argument:
\`print(text, end="", flush=True)\`. (Process-wide alternatives:
\`python -u\` or \`PYTHONUNBUFFERED=1\`, which is worth setting in Docker
images anyway.)

### The final message still matters

Streaming is a UX device, not a different API. You still need
\`stop_reason\` (was the reply cut off at \`max_tokens\`?) and \`usage\` (what
did this request cost?), and they only exist on the accumulated message.
Call \`get_final_message()\` after the loop — it works even just outside the
\`with\` block, as long as the stream was fully consumed inside it. If you
return early without consuming everything, the accumulated message is
incomplete; that is the price of the iterator idiom, and the reason the
production pattern always drains \`text_stream\` before doing anything else.

### The async variant

Under \`asyncio\` the same code gains two keywords: \`async with
client.messages.stream(...)\` and \`async for text in stream.text_stream\`,
using \`AsyncAnthropic\`. Shapes and method names are otherwise identical.
`,

  comparisons: [
    {
      label: "Accumulating a streamed reply",
      intro:
        "Both versions stream a ticket summary to the terminal and want the final text plus usage afterwards. One hand-rolls event filtering and accumulation; the other lets the SDK helpers do it.",
      php: `# first_try.py — manual event filtering
from anthropic import Anthropic

client = Anthropic()
reply = ""

with client.messages.stream(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Summarise this ticket."}],
) as stream:
    for event in stream:
        # Guess the event taxonomy by hand. Test for the
        # wrong delta type and chunks vanish silently.
        if event.type == "content_block_delta":
            if event.delta.type == "text_delta":
                reply += event.delta.text
                print(event.delta.text, end="", flush=True)

# stop_reason? usage? Never captured — you were only
# watching one event type.`,
      ts: `# production.py — the SDK accumulates for you
from anthropic import Anthropic

client = Anthropic()

with client.messages.stream(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Summarise this ticket."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    print()
    final = stream.get_final_message()

# Full accumulated Message, same shape as non-streaming:
print(final.stop_reason)          # e.g. "end_turn"
print(final.usage.output_tokens)  # log cost per request
if final.stop_reason == "max_tokens":
    pass  # reply was truncated — handle it, don't ship it`,
      note: "text_stream yields plain strings (no event-type checks to get wrong), and get_final_message() returns the accumulated Message with stop_reason and usage — no hand-rolled string concat.",
      leftLang: "python",
      rightLang: "python",
    },
    {
      label: "The stream that looks frozen",
      intro:
        "Identical streaming loop; the only difference is output buffering. Run the left version piped or in a container and the user stares at a blank screen until the process exits.",
      php: `# looks_frozen.py
with client.messages.stream(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Write a haiku."}],
) as stream:
    for text in stream.text_stream:
        # No newline is ever printed, so line buffering
        # never triggers. Piped or in Docker, stdout is
        # block-buffered: NOTHING appears until ~8KB or
        # process exit. The stream works; the display lies.
        print(text, end="")`,
      ts: `# flushed.py
with client.messages.stream(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Write a haiku."}],
) as stream:
    for text in stream.text_stream:
        # Push every delta through the buffer immediately.
        print(text, end="", flush=True)
    print()

# Belt and braces for containers: run with \`python -u\`
# or set PYTHONUNBUFFERED=1 in the image.`,
      note: "flush=True forces each delta out of Python's stdout buffer the moment it arrives — the whole point of streaming is perceived latency, and buffering silently destroys it.",
      leftLang: "python",
      rightLang: "python",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "The Python streaming helper in miniature: a generator stands in for the SSE wire, and a tiny class reproduces text_stream and get_final_message(). Predict what prints — including what the context manager does on exit — then run it.",
    code: `# The Python streaming helper, reduced to its bones. A generator
# stands in for the SSE wire; the class plays client.messages.stream.

CHUNKS = ["Sessions", " live", " on", " the", " server;",
          " the", " cookie", " is", " just", " a", " key", "."]

def sse_events():
    """The events Anthropic actually sends, canned."""
    yield {"type": "message_start"}
    for chunk in CHUNKS:
        yield {
            "type": "content_block_delta",
            "delta": {"type": "text_delta", "text": chunk},
        }
    yield {
        "type": "message_delta",
        "delta": {"stop_reason": "end_turn"},
        "usage": {"output_tokens": 12},
    }
    yield {"type": "message_stop"}

class FakeMessageStream:
    """What client.messages.stream(...) hands you."""

    def __init__(self, events):
        self._events = events
        self._parts = []
        self._stop_reason = None
        self._usage = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        # The real SDK closes the HTTP connection here —
        # guaranteed, even if the loop body raised.
        print("[connection closed by the context manager]")
        return False

    @property
    def text_stream(self):
        for event in self._events:
            if event["type"] == "content_block_delta":
                self._parts.append(event["delta"]["text"])
                yield event["delta"]["text"]
            elif event["type"] == "message_delta":
                self._stop_reason = event["delta"]["stop_reason"]
                self._usage = event["usage"]

    def get_final_message(self):
        return {
            "role": "assistant",
            "content": [{"type": "text", "text": "".join(self._parts)}],
            "stop_reason": self._stop_reason,
            "usage": self._usage,
        }

# The idiom, exactly as with the real SDK:
with FakeMessageStream(sse_events()) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    print()
    final = stream.get_final_message()

print("stop_reason:", final["stop_reason"])
print("output_tokens:", final["usage"]["output_tokens"])`,
    output: `Sessions live on the server; the cookie is just a key.
[connection closed by the context manager]
stop_reason: end_turn
output_tokens: 12`,
  },

  keyPoints: [
    "Python's idiom: `with client.messages.stream(...) as stream:` then `for text in stream.text_stream:` — a context manager wrapping an iterator, versus TypeScript's event emitter. Same SSE events underneath.",
    "The context manager guarantees the HTTP connection closes even if your loop raises — the enforced version of PHP's `try/finally { fclose(...); }`.",
    "`stream.text_stream` yields only unwrapped text deltas; iterate the stream object itself when you need other event types (tool use, content_block_stop).",
    "Always `print(text, end=\"\", flush=True)` — without flush, piped or containerised stdout is block-buffered and the stream looks frozen.",
    "`stream.get_final_message()` after the loop returns the accumulated Message — same shape as a non-streaming response — so you can check `stop_reason` and log `usage`.",
    "The async variant is the same code with `AsyncAnthropic`, `async with`, and `async for`.",
  ],

  interview: [
    {
      q: "You've used both the TypeScript and Python Anthropic SDKs. How does streaming differ between them?",
      a: "The wire protocol is identical — the same SSE events: `message_start`, `content_block_delta` with `text_delta` chunks, `message_delta`, `message_stop`. What differs is the local idiom. TypeScript is event-based: `client.messages.stream(...)` returns an object you attach handlers to, like `stream.on(\"text\", cb)`, then `await stream.finalMessage()`. Python is iterator-based: `with client.messages.stream(...) as stream:` gives a context manager, `for text in stream.text_stream:` yields deltas, and `stream.get_final_message()` returns the accumulated message. I like that both SDKs hand back a final message with the same shape as a non-streaming response — downstream code doesn't care which path produced it.",
    },
    {
      q: "A teammate reports the Python streaming demo 'hangs' in Docker but works fine on their laptop. What's your first suspicion?",
      a: "Output buffering, not the API. Streaming loops print with `end=\"\"`, so no newline ever reaches stdout — and in a container stdout isn't a TTY, so Python block-buffers it: nothing shows until roughly 8KB accumulates or the process exits. The request is streaming fine; the display is lying. Fix is `flush=True` on the print, and I'd also set `PYTHONUNBUFFERED=1` in the image so logs are honest everywhere. It's the same class of problem as PHP's output buffering, where you needed `ob_flush()` and `flush()` to stream anything to the client.",
    },
    {
      q: "Why call get_final_message() if you've already printed every chunk?",
      a: "Because the chunks are only the text. The accumulated `Message` carries the metadata production code needs: `stop_reason` tells me whether the reply completed (`end_turn`) or was truncated at `max_tokens` — a truncated reply usually shouldn't be saved or acted on — and `usage` gives the real token counts I log for cost tracking. It also returns content as proper blocks, which matters once tool use enters the picture. One caveat: it's only valid after the stream has been fully consumed, so the pattern is drain `text_stream` first, then call it.",
    },
  ],

  quiz: [
    {
      question:
        "What is the idiomatic way to stream just the text of a reply in the Python SDK?",
      options: [
        "for event in client.messages.create(stream=True): print(event)",
        "with client.messages.stream(...) as stream: then for text in stream.text_stream: print(text, end=\"\", flush=True)",
        "stream.on(\"text\", lambda t: print(t)) inside a callback",
        "print(client.messages.stream(...).text)",
      ],
      answerIndex: 1,
      explain:
        "Python wraps streaming in a context manager (guaranteed connection cleanup) and exposes text deltas as the text_stream iterator. The .on(...) callback style is the TypeScript SDK's idiom, not Python's.",
    },
    {
      question:
        "Your streaming script shows nothing for 20 seconds, then the whole reply at once — but only when output is piped to a file. Why?",
      options: [
        "The API batches deltas when it detects a non-interactive client",
        "text_stream only yields after message_stop arrives",
        "Python block-buffers stdout when it isn't a TTY, and print(text, end=\"\") never triggers a flush",
        "The context manager holds output until __exit__ runs",
      ],
      answerIndex: 2,
      explain:
        "The deltas arrive in real time, but with no newline and no flush they sit in Python's stdout buffer, which is block-buffered when piped. flush=True per print (or python -u / PYTHONUNBUFFERED=1) fixes it. The API and the SDK are doing their jobs.",
    },
    {
      question: "After the text_stream loop finishes, stream.get_final_message() returns…",
      options: [
        "Only the metadata — you must keep the concatenated text yourself",
        "The full accumulated Message: content blocks, stop_reason, and usage, same shape as a non-streaming response",
        "A coroutine that re-requests the message from the API",
        "The raw SSE event log as a list",
      ],
      answerIndex: 1,
      explain:
        "The SDK accumulates every delta as you consume the stream, so get_final_message() hands back a complete Message — including stop_reason (was it truncated?) and usage (what did it cost?) — without a second API call.",
    },
  ],
};

export default lesson;
