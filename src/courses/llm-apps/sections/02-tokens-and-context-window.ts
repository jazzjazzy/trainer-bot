import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "tokens-and-context-window",
  title: "Tokens and the Context Window",
  part: "The Mental Model",
  estMinutes: 11,
  summary:
    "Tokens are the unit of everything — pricing, limits, latency — and the context window is the hard cap on input plus output that your app must budget against.",

  concept: `
Every number that matters in LLM engineering is denominated in **tokens**:
what you pay, what fits, how long you wait. Before writing another line of
integration code, get fluent in the currency.

### What a token is

Models don't read characters or words — they read **tokens**, chunks produced
by a tokenizer. \`"hamburger"\` might split into \`ham\`/\`bur\`/\`ger\`; common
words are often one token; whitespace and punctuation count. For English prose
a decent rule of thumb is **~4 characters or ~0.75 words per token**, but it's
only a rule of thumb: code, JSON, non-English text, and unusual strings
tokenize much less predictably. A UUID can cost more tokens than a sentence.

### The context window: one budget for input AND output

Each model has a **context window** — the maximum tokens a single request can
involve, covering *everything*: system prompt, all messages, tool definitions,
and the response being generated. Input and output share the same pool.

| Model | Context window | Max output |
| --- | --- | --- |
| \`claude-sonnet-5\` | 1M tokens | 128K |
| \`claude-opus-4-8\` | 1M tokens | 128K |
| \`claude-haiku-4-5\` | 200K tokens | 64K |

A million tokens sounds infinite until you remember that a chat transcript is
*resent in full on every call* — a long support conversation plus a few pasted
documents adds up, and everything you send is billed as input every time.

### Tokens are the price sheet

Pricing is per million tokens (MTok), with output costing more than input —
generation is the expensive part:

| Model | Input / MTok | Output / MTok |
| --- | --- | --- |
| \`claude-sonnet-5\` | $3 | $15 |
| \`claude-opus-4-8\` | $5 | $25 |
| \`claude-haiku-4-5\` | $1 | $5 |

(Sonnet 5 has introductory pricing of $2/$10 through August 2026.) The ratios
matter more than the absolutes: output is 5× input, and Haiku is a third the
price of Sonnet. That's why production systems trim history, cap
\`max_tokens\`, and route easy tasks to cheaper models.

### Counting for real: \`countTokens\`, not tiktoken

Two tools give you real numbers instead of estimates:

\`\`\`ts
// Before sending: ask the API to count (free, no generation)
const count = await client.messages.countTokens({
  model: "claude-sonnet-5",
  messages: [{ role: "user", content: longPrompt }],
});
console.log(count.input_tokens);

// After sending: every response reports exact usage
console.log(response.usage); // { input_tokens: 2412, output_tokens: 388 }
\`\`\`

Two gotchas here. First, **tiktoken is OpenAI's tokenizer** — it does not
match Claude's tokenization, so counting Claude prompts with it gives you
confidently wrong numbers. Use \`client.messages.countTokens\` (Python:
\`count_tokens\`). Second, **\`usage\` arrives on every response for free** —
a team that isn't logging it has no cost dashboard and finds out about an
expensive prompt from the invoice.

### Latency is tokens too

Output tokens are generated one at a time, so response time scales roughly
with output length. A response capped at 300 tokens returns several times
faster than one allowed to ramble for 4,000. \`max_tokens\` isn't just a cost
control — it's a latency control, and when the model hits it you get
\`stop_reason: "max_tokens"\` and a truncated reply. Budgeting means choosing
that cap deliberately per feature, not copy-pasting 4096 everywhere.
`,

  comparisons: [
    {
      label: "Guessing size by string length vs. counting and budgeting",
      intro:
        "Both versions try to keep a prompt inside a limit before sending. The left one measures characters; the right one measures what the API actually measures.",
      php: `// First attempt: characters ≈ tokens, right?
const MAX_CHARS = 800_000; // "should be fine for 1M tokens"

async function ask(prompt: string) {
  if (prompt.length > MAX_CHARS) {
    throw new Error("Prompt too long");
  }
  // JSON, code, and non-English text can run closer to
  // 2-3 chars/token — this sails past the check and the
  // API rejects the request (or worse: it fits, but costs
  // triple what the estimate promised).
  return client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
}`,
      ts: `// Production: count with the API, then budget
const CONTEXT_WINDOW = 1_000_000;
const MAX_OUTPUT = 1_024;

async function ask(prompt: string) {
  const messages = [{ role: "user" as const, content: prompt }];

  const { input_tokens } = await client.messages.countTokens({
    model: "claude-sonnet-5",
    messages,
  });

  if (input_tokens + MAX_OUTPUT > CONTEXT_WINDOW) {
    throw new Error(
      \`Prompt is \${input_tokens} tokens; won't fit with \${MAX_OUTPUT} reserved for output\`
    );
  }

  return client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: MAX_OUTPUT,
    messages,
  });
}`,
      note:
        "countTokens uses Claude's real tokenizer server-side and costs nothing. Input and output share the window, so always reserve max_tokens in the budget.",
    },
    {
      label: "Ignoring usage vs. logging it per request",
      intro:
        "Every response carries exact token counts. One version throws them away; the other turns them into a cost line you can chart per feature.",
      php: `// First attempt: grab the text, discard the meter
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages,
});

return extractText(response);
// A month later: "why is the AI bill $4,000?"
// Nobody knows which feature, which prompt, or when.`,
      ts: `// Production: usage → structured log → dashboard
const PRICE = { inPerMTok: 3, outPerMTok: 15 }; // Sonnet 5

const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages,
});

const { input_tokens, output_tokens } = response.usage;
const costUsd =
  (input_tokens / 1e6) * PRICE.inPerMTok +
  (output_tokens / 1e6) * PRICE.outPerMTok;

logger.info("llm_call", {
  feature: "ticket-summarizer",
  model: response.model,
  input_tokens,
  output_tokens,
  costUsd,
});

return extractText(response);`,
      note:
        "usage is free data on every response. Tag it with the calling feature and you get a per-feature cost dashboard instead of a surprise invoice.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A chars/4 estimator pricing three real workloads at Sonnet 5 and Haiku 4.5 rates, then a pre-flight budget check that flags a request before it's sent. Predict which workload gets flagged, then run it.",
    code: `// Token budgeting in miniature. chars/4 is the ESTIMATE tier —
// real code confirms with client.messages.countTokens before sending.

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// $ per million tokens (MTok)
const PRICING = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
} as const;

type ModelName = keyof typeof PRICING;

function priceCall(
  model: ModelName,
  inputTokens: number,
  outputTokens: number
): number {
  const p = PRICING[model];
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}

// Three workloads: (chars in, expected tokens out)
const workloads = [
  { name: "chat turn", inputChars: 2_000, expectedOutput: 300 },
  { name: "doc summarize", inputChars: 120_000, expectedOutput: 1_000 },
  { name: "codebase Q&A", inputChars: 3_600_000, expectedOutput: 2_000 },
];

console.log("--- estimated cost per call ---");
for (const w of workloads) {
  const inTok = estimateTokens("x".repeat(w.inputChars));
  const sonnet = priceCall("claude-sonnet-5", inTok, w.expectedOutput);
  const haiku = priceCall("claude-haiku-4-5", inTok, w.expectedOutput);
  console.log(
    \`\${w.name}: ~\${inTok.toLocaleString()} tokens in | \` +
      \`Sonnet 5 $\${sonnet.toFixed(4)} | Haiku 4.5 $\${haiku.toFixed(4)}\`
  );
}

// Pre-flight check against Haiku's smaller window (200K context)
const HAIKU_CONTEXT = 200_000;

console.log("\\n--- pre-flight for claude-haiku-4-5 (200K window) ---");
for (const w of workloads) {
  const inTok = estimateTokens("x".repeat(w.inputChars));
  const needed = inTok + w.expectedOutput; // input + output share the window
  if (needed > HAIKU_CONTEXT) {
    console.log(
      \`BLOCKED \${w.name}: needs ~\${needed.toLocaleString()} tokens, window is \${HAIKU_CONTEXT.toLocaleString()}\`
    );
  } else {
    console.log(\`ok      \${w.name}: ~\${needed.toLocaleString()} tokens fits\`);
  }
}

// Try it: drop codebase Q&A's inputChars to 700_000 — it fits Haiku's
// window... but check what the Sonnet-vs-Haiku price gap does at that size.`,
  },

  keyPoints: [
    "Tokens are the unit of pricing, limits, and latency; ~4 characters per English token is an estimate only — code, JSON, and non-English text break the rule.",
    "The context window caps input AND output together: `claude-sonnet-5` and `claude-opus-4-8` give 1M context / 128K output; `claude-haiku-4-5` gives 200K / 64K.",
    "Use `client.messages.countTokens` for real counts — it's free and uses Claude's actual tokenizer. tiktoken is OpenAI's tokenizer and gives wrong numbers for Claude.",
    "Every response includes `usage` with exact input/output token counts — log it per feature or you have no cost visibility.",
    "Output tokens cost ~5× input tokens (Sonnet 5: $3/$15 per MTok; Haiku 4.5: $1/$5), and latency scales with output length — `max_tokens` controls both.",
    "Chat history is resent and re-billed as input on every turn, so long conversations get linearly more expensive per message.",
  ],

  interview: [
    {
      q: "How would you estimate and control the cost of an LLM feature before shipping it?",
      a: "Three layers. First, back-of-envelope: chars/4 for token estimates, times the model's per-MTok rates — Sonnet 5 is $3 in / $15 out, Haiku 4.5 is $1/$5 — times expected daily volume. That tells me whether the feature is even viable and whether a cheaper model tier fits. Second, pre-flight: for anything with variable-size input I call `client.messages.countTokens`, which is free and uses Claude's real tokenizer, and reject or trim prompts that blow the budget before sending. Third, observability: every response carries exact `usage` counts, so I log input/output tokens and computed cost per request, tagged by feature — that's the dashboard that catches a prompt regression before the invoice does.",
    },
    {
      q: "What is the context window, and what's a common mistake teams make with it?",
      a: "It's the hard cap on tokens a single request can involve — and critically, input and output share it, so a 1M-window model like Sonnet 5 with `max_tokens: 128000` really has ~872K for input. The classic mistake is treating it as a per-message limit rather than a per-request one: chat apps resend the whole transcript every turn, so history grows until it either hits the window or quietly makes every call slow and expensive. Production systems budget explicitly — reserve output space, trim or summarize old turns, and count with the API rather than guessing from string length, because tokenization of code and JSON is far denser than prose.",
    },
    {
      q: "Why shouldn't you use tiktoken to count tokens for Claude prompts?",
      a: "tiktoken implements OpenAI's tokenizers, and tokenization is model-family-specific — the same string maps to different token sequences under Claude's tokenizer, so tiktoken's counts are systematically wrong for Claude. It's a subtle bug because the numbers look plausible. The right tool is the API itself: `client.messages.countTokens` (or `count_tokens` in Python) counts a request server-side with the real tokenizer, costs nothing, and accepts the same shape as `messages.create` — so you can count exactly what you're about to send, including system prompts and tools.",
    },
  ],

  quiz: [
    {
      question:
        "You're sending a 950K-token document to claude-sonnet-5 (1M context window) with max_tokens: 128000. What happens?",
      options: [
        "It works and you get the full 128K of output — the document fits inside 1M",
        "The call succeeds but generation stops early with stop_reason 'model_context_window_exceeded' — input and output share the window, so only ~50K is left for output",
        "The API automatically trims the document to fit",
        "Output streams to a separate window, so there is no conflict",
      ],
      answerIndex: 1,
      explain:
        "Input and output share one context window: 950K in leaves ~50K of the 1M for output, not the 128K you asked for. On Claude 4.5-and-newer models the request is not rejected — the model generates until it hits the window and returns stop_reason: 'model_context_window_exceeded'. (Input that on its own exceeds the window is the different case: that's a 400 invalid_request_error.)",
    },
    {
      question:
        "What's the correct way to get an accurate token count for a Claude prompt before sending it?",
      options: [
        "prompt.length / 4",
        "Count words and multiply by 1.33",
        "Use the tiktoken library",
        "Call client.messages.countTokens with the same messages payload",
      ],
      answerIndex: 3,
      explain:
        "countTokens runs Claude's real tokenizer server-side, free of charge. chars/4 is only an estimate, and tiktoken implements OpenAI's tokenizers — plausible-looking but wrong numbers for Claude.",
    },
    {
      question:
        "A call to claude-sonnet-5 uses 200,000 input tokens and 1,000 output tokens at $3/$15 per MTok. Where does most of the cost come from?",
      options: [
        "Output — output tokens are 5× the price",
        "Input — 200K tokens at $3/MTok is $0.60 vs $0.015 for output",
        "They cost about the same",
        "Neither — the first million tokens per day are free",
      ],
      answerIndex: 1,
      explain:
        "Output is pricier per token, but volume wins: 200K input × $3/MTok = $0.60, while 1K output × $15/MTok = $0.015. This is the shape of most RAG and long-context calls — input dominates, which is why history trimming and caching matter.",
    },
  ],
};

export default lesson;
