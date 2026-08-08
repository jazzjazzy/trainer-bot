import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "first-call-python",
  title: "Your First Call in Python",
  part: "The Mental Model",
  estMinutes: 10,
  summary:
    "The Python SDK is a deliberate mirror of the TypeScript one: pip install anthropic, client.messages.create with snake_case params, and the same typed response objects with attribute access.",

  concept: `
Most LLM job listings say "Python or TypeScript" — and the good news is that
Anthropic ships both SDKs as *deliberate mirrors*. Learn one and you've
learned 90% of the other. Here's the same first call, in Python.

### Install and authenticate

\`\`\`bash
pip install anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
\`\`\`

\`\`\`python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
\`\`\`

Same rule as TypeScript, same rule as PHP: the key lives in the environment
or a secrets manager, never in source.

### The call — spot the differences

\`\`\`python
response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Explain list comprehensions briefly."}
    ],
)
\`\`\`

Line up the two SDKs and the mapping is almost mechanical:

| TypeScript | Python |
| --- | --- |
| \`new Anthropic()\` | \`anthropic.Anthropic()\` |
| \`await client.messages.create({...})\` | \`client.messages.create(...)\` |
| object literal params | keyword arguments |
| \`camelCase\` helpers (\`countTokens\`) | \`snake_case\` (\`count_tokens\`) |
| \`response.usage.input_tokens\` | \`response.usage.input_tokens\` |

The *field names on the wire* — \`max_tokens\`, \`stop_reason\`,
\`input_tokens\` — are identical, because both SDKs are thin layers over the
same JSON. Only the language idioms change: Python's default client is
synchronous (there's an \`AsyncAnthropic\` when you want \`await\`), and
parameters are kwargs instead of an options object.

### Typed objects, not dicts

The response is **not a dict** — it's a typed object (Pydantic-backed), so you
use attribute access, and typos fail loudly:

\`\`\`python
response.content          # list of typed blocks
response.content[0].text  # attribute access, not ["content"][0]["text"]
response.stop_reason      # "end_turn" | "max_tokens" | ...
response.usage.input_tokens
\`\`\`

If you've been poking at \`json.loads\` output from hand-rolled \`requests\`
calls, this is the same upgrade PHP got moving from associative arrays to
typed DTOs: \`response.usage.input_tokns\` raises an \`AttributeError\`
immediately, while \`data["usage"]["input_tokns"]\` in dict-land raises a
\`KeyError\` only on the code path that happens to touch it.

### The same two disciplines carry over

Everything you learned reading the TypeScript response applies verbatim:

1. **\`content\` is a list of typed blocks.** Filter for
   \`block.type == "text"\` instead of trusting \`content[0]\`.
2. **Check \`stop_reason\`.** \`"max_tokens"\` means a truncated answer inside
   a successful HTTP response — guard it before passing text downstream.

That transfer is the real lesson: the skills are API skills, not language
skills. In an interview, being able to sketch the same integration in both
languages reads as "understands the API," not "memorized one SDK."
`,

  comparisons: [
    {
      label: "Hand-rolled requests + dict-poking vs. the typed SDK",
      intro:
        "Both fetch a completion and read the reply. The left one parses raw JSON into dicts and hopes the keys exist; the right gets typed objects with attribute access.",
      php: `# First attempt: requests + json.loads, dicts all the way down
import os, requests

resp = requests.post(
    "https://api.anthropic.com/v1/messages",
    headers={
        "x-api-key": os.environ["ANTHROPIC_API_KEY"],
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    },
    json={
        "model": "claude-sonnet-5",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": "Hello"}],
    },
)
data = resp.json()
# KeyError lottery: no types, no retries, and a 429
# gives data == {"type": "error", ...} — so this line
# explodes in a completely different way under load:
text = data["content"][0]["text"]`,
      ts: `# Production: the official SDK, typed end to end
import anthropic

client = anthropic.Anthropic()  # key from env, headers handled

response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
)

# Typed objects: attribute access, IDE completion,
# AttributeError on typos instead of silent Nones.
text = "".join(
    block.text for block in response.content if block.type == "text"
)
print(response.usage.input_tokens, response.usage.output_tokens)
# Rate limits and 5xx are retried automatically; failures
# raise typed exceptions like anthropic.RateLimitError.`,
      note:
        "The SDK response is a typed object, not a dict — and error responses become typed exceptions instead of a differently-shaped dict your happy path trips over.",
      leftLang: "python",
      rightLang: "python",
    },
    {
      label: "Ignoring stop_reason vs. guarding it",
      intro:
        "A summarizer that feeds model output into a downstream parser. One version passes truncated text along; the other refuses.",
      php: `# First attempt: grab text, ship it
response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=200,   # tight cap "to control cost"
    messages=[{"role": "user", "content": long_article}],
)

summary = response.content[0].text
save_summary(summary)
# Long articles hit the 200-token cap mid-sentence.
# HTTP 200, no exception — just quietly broken
# summaries in the database.`,
      ts: `# Production: stop_reason is part of the contract
response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=200,
    messages=[{"role": "user", "content": long_article}],
)

if response.stop_reason == "max_tokens":
    # Truncated: retry with a bigger budget, don't store junk
    raise TruncatedResponseError(
        f"summary cut off after "
        f"{response.usage.output_tokens} tokens"
    )

summary = "".join(
    b.text for b in response.content if b.type == "text"
)
save_summary(summary)`,
      note:
        "Truncation is not an exception — it's a successful response with stop_reason == 'max_tokens'. If you don't check, nothing else will.",
      leftLang: "python",
      rightLang: "python",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "The SDK's response modeled with stdlib dataclasses: typed blocks, attribute access, and a guard for truncation. Predict what each of the two responses prints, then check against the output.",
    code: `# The Python SDK's response objects, modeled in plain stdlib Python.
# Same shape as anthropic's Message: attribute access, typed blocks.

from dataclasses import dataclass


@dataclass
class TextBlock:
    text: str
    type: str = "text"


@dataclass
class Usage:
    input_tokens: int
    output_tokens: int


@dataclass
class Message:
    id: str
    model: str
    content: list
    stop_reason: str
    usage: Usage
    role: str = "assistant"


def extract_text(response):
    """Join the text blocks; refuse to return a truncated answer."""
    text = "".join(b.text for b in response.content if b.type == "text")
    if response.stop_reason == "max_tokens":
        raise ValueError(f"truncated reply ending in: {text[-14:]!r}")
    return text


complete = Message(
    id="msg_01aaa",
    model="claude-sonnet-5",
    content=[TextBlock(text="A generator yields values lazily, one at a time.")],
    stop_reason="end_turn",
    usage=Usage(input_tokens=17, output_tokens=13),
)

truncated = Message(
    id="msg_01bbb",
    model="claude-sonnet-5",
    content=[TextBlock(text="A generator yields values lazily, one at")],
    stop_reason="max_tokens",
    usage=Usage(input_tokens=17, output_tokens=10),
)

for response in (complete, truncated):
    print(f"--- {response.id} ({response.stop_reason}) ---")
    try:
        print("text:  " + extract_text(response))
    except ValueError as err:
        print(f"ERROR: {err}")
    u = response.usage
    print(f"usage: {u.input_tokens} in / {u.output_tokens} out")

# Mirror-image takeaway: this is the same wire shape the TS SDK returns.
# The idioms differ (snake_case, attribute access) — the model doesn't.`,
    output: `--- msg_01aaa (end_turn) ---
text:  A generator yields values lazily, one at a time.
usage: 17 in / 13 out
--- msg_01bbb (max_tokens) ---
ERROR: truncated reply ending in: 'lazily, one at'
usage: 17 in / 10 out`,
  },

  keyPoints: [
    "Setup mirrors TypeScript: `pip install anthropic`, key in `ANTHROPIC_API_KEY`, `client = anthropic.Anthropic()`.",
    "`client.messages.create(model=..., max_tokens=..., messages=[...])` — keyword arguments and snake_case helpers (`count_tokens`), but identical wire-level field names.",
    "Responses are typed objects with attribute access (`response.usage.input_tokens`), not dicts — typos raise `AttributeError` immediately instead of `KeyError` later.",
    "The default Python client is synchronous; `AsyncAnthropic` exists when you want `await` — unlike TS where everything is promise-based.",
    "The two response disciplines transfer verbatim: filter `content` blocks by `block.type == \"text\"`, and guard `stop_reason == \"max_tokens\"` before trusting the text.",
    "SDK skills are API skills: same JSON underneath, so being able to sketch the call in both languages shows you understand the API, not one wrapper.",
  ],

  interview: [
    {
      q: "You've built an LLM feature in TypeScript. How much carries over if the team is a Python shop?",
      a: "Almost everything — Anthropic ships the two SDKs as deliberate mirrors over the same REST API. In Python it's `pip install anthropic`, `client = anthropic.Anthropic()` reading the key from env, then `client.messages.create(model='claude-sonnet-5', max_tokens=1024, messages=[...])` with kwargs instead of an options object. The wire-level names — `max_tokens`, `stop_reason`, `usage.input_tokens` — are identical; only idioms change: snake_case helpers like `count_tokens`, a synchronous default client with `AsyncAnthropic` for async code, and Pydantic-backed typed responses with attribute access. The disciplines that matter — filtering content blocks by type, checking `stop_reason`, logging `usage` — are API-level and transfer verbatim.",
    },
    {
      q: "Why use the anthropic package instead of requests, which every Python codebase already has?",
      a: "For the same reason I stopped hand-rolling Guzzle wrappers in PHP once a decent vendor SDK existed. With `requests` I get back an untyped dict, so every access is a KeyError lottery, and error responses are a *differently shaped* dict that my happy-path parsing crashes on. The SDK gives me typed response objects with attribute access and IDE completion, typed exceptions like `anthropic.RateLimitError` instead of shape-shifting dicts, and automatic retries with backoff on 429s and 5xx — which I'd otherwise have to build and maintain myself. Hand-rolling the HTTP call is worth doing once to demystify the API; committing it to production is signing up to maintain a worse SDK.",
    },
    {
      q: "What's different about reading the response in Python vs TypeScript — and what's deliberately the same?",
      a: "Mechanically it's attribute access on typed objects — `response.content[0].text`, `response.usage.output_tokens` — rather than TS's interface-typed JSON, and Python raises `AttributeError` on typos where TS fails at compile time. But the structure is deliberately identical: `content` is a list of typed blocks, not a string, so I filter on `block.type == 'text'` rather than trusting index zero; `stop_reason` tells me whether the model finished (`end_turn`) or my `max_tokens` cap truncated it; and `usage` carries exact token counts for cost logging. Same wire shape, same failure modes, same guards — just different casing conventions on the helpers.",
    },
  ],

  quiz: [
    {
      question:
        "What does client.messages.create(...) return in the Python SDK?",
      options: [
        "A dict parsed from the response JSON",
        "A raw JSON string you must json.loads yourself",
        "A typed Message object with attribute access (response.content, response.usage.input_tokens)",
        "A coroutine you must await, even on the default client",
      ],
      answerIndex: 2,
      explain:
        "The SDK returns typed (Pydantic-backed) objects — attribute access, IDE completion, AttributeError on typos. The default Anthropic client is synchronous; only AsyncAnthropic returns awaitables.",
    },
    {
      question:
        "Which is a real difference between the Python and TypeScript SDKs?",
      options: [
        "Python uses a different REST endpoint",
        "Python names helpers in snake_case (count_tokens) and takes keyword arguments; the wire-level JSON fields are identical",
        "The Python response's content is a plain string, not blocks",
        "Python requires the API key as a create() argument on each call",
      ],
      answerIndex: 1,
      explain:
        "Both SDKs are thin mirrors over the same API: identical endpoint, identical field names like max_tokens and stop_reason. Only the language idioms differ — kwargs and snake_case in Python, options objects and camelCase in TS.",
    },
    {
      question:
        "In Python, your summarizer stores garbage half-sentences for long inputs but raises no exceptions. What's the likely cause?",
      options: [
        "The SDK silently retried and mixed two responses",
        "response.content needed json.loads first",
        "The model hit your max_tokens cap: stop_reason == 'max_tokens' on an otherwise successful response you never checked",
        "Pydantic truncated the text field at validation time",
      ],
      answerIndex: 2,
      explain:
        "Truncation is a successful response, not an error — the text simply stops where your cap cut it. The guard is one line: if response.stop_reason == 'max_tokens', retry with a bigger budget or fail loudly instead of storing junk.",
    },
  ],
};

export default lesson;
