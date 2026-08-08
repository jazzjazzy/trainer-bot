import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "context-budgeting",
  title: "Context Budgeting: Trimming and Summarizing History",
  part: "Conversations & Streaming",
  estMinutes: 12,
  summary:
    "Resending the whole transcript can't go on forever — production chats enforce a token budget before every send with structure-aware trimming and cheap-model summarization.",

  concept: `
The append loop has a built-in failure mode: the array only ever grows. Long
before you hit the context window (1M tokens on Claude Sonnet 5), you hit
the *economic* window — every turn resends everything, so a chat that idles
along at 50K tokens of history pays for those 50K tokens on every single
send. Production chat code therefore treats history like a cache with an
eviction policy, not an append-only log.

### Strategy 1: sliding window

Keep the system prompt plus the most recent turns, drop the oldest. Simple
and often enough — recent context matters most in support-style chats. The
naive version, \`messages.slice(-10)\`, has two sharp edges:

- **It can orphan a tool exchange.** A \`tool_use\` block in an assistant
  message must be immediately followed by its \`tool_result\` in the next
  user message. Slice between them and the API rejects the request. Trim in
  whole user/assistant *pairs*, never at arbitrary indexes.
- **It loses pinned facts.** The user's name, their allergy, the order
  number from turn 1 — gone the moment turn 1 scrolls off. Anything that
  must survive belongs in the system prompt or a pinned summary message,
  outside the eviction zone.

### Strategy 2: summarize, then drop

Instead of deleting old turns, compress them. When history crosses a
threshold, send the old turns to a cheap, fast model — this is exactly what
\`claude-haiku-4-5\` ($1/$5 per MTok vs Sonnet 5's $3/$15) is for — with a
prompt like "summarize this conversation, preserving names, decisions, and
open questions". Replace the old turns with one short summary message and
keep the recent turns verbatim. You trade a small Haiku bill for a large
Sonnet saving, and the "memory" degrades gracefully instead of falling off
a cliff.

### Enforce the budget before every send

Whatever the strategy, the enforcement point is the same: right before
\`messages.create\`, measure and trim.

\`\`\`ts
const budgeted = trimToBudget(messages, MAX_INPUT_TOKENS);
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  system,
  messages: budgeted,
});
\`\`\`

For measuring, a chars/4 estimate is fine for rough budgeting in a loop; for
accuracy the API has a real endpoint — \`client.messages.countTokens({ model,
system, messages })\` — which is authoritative and free. (Never use tiktoken
for Claude: it's OpenAI's tokenizer and miscounts Claude tokens.)

### The managed alternatives

The platform is growing server-side versions of this: a **compaction** beta
summarizes old context automatically when a conversation approaches limits,
and **context editing** can clear stale tool results. Good to name-drop in
an interview — but they're betas, and the portable skill that transfers to
any LLM provider is client-side budgeting: you own the history, so you own
the eviction policy.
`,

  comparisons: [
    {
      label: "Unbounded growth vs a budget gate",
      intro:
        "Two chat loops. One appends forever and discovers the problem in the bill (or a 400); the other measures and trims before every send.",
      php: `// First attempt - the array only grows
async function chatTurn(userInput: string) {
  messages.push({ role: "user", content: userInput });

  // Turn 300 of a long-running support thread:
  // input costs dwarf output costs, latency climbs,
  // and eventually the request dies with a 400
  // ("prompt is too long") at the context limit.
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system,
    messages,
  });

  messages.push({ role: "assistant", content: response.content });
}`,
      ts: `// Production - enforce a token budget at the send site
const MAX_INPUT_TOKENS = 8_000;

async function chatTurn(userInput: string) {
  messages.push({ role: "user", content: userInput });

  // Estimate (chars/4) or measure (countTokens), then trim
  // oldest-first until the transcript fits the budget.
  const budgeted = trimToBudget(messages, MAX_INPUT_TOKENS);

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system,
    messages: budgeted,
  });

  messages.push({ role: "assistant", content: response.content });
}`,
      note:
        "The full transcript stays in your store; what you SEND is capped. Budget enforcement lives at the send site, so no code path can sneak an oversized prompt past it.",
    },
    {
      label: "Naive slice vs structure-aware trimming",
      intro:
        "Both versions cap history at recent turns. The naive one cuts at an arbitrary index; the structure-aware one protects the things a cut can break.",
      php: `// First attempt - keep the last 10 messages
const trimmed = messages.slice(-10);

// Two failure modes:
// 1. If message -11 was an assistant turn with a
//    tool_use block and message -10 holds its
//    tool_result, the pair is split -> the API
//    rejects the request as invalid.
// 2. The user said "I'm allergic to penicillin"
//    in turn 2. It just scrolled out of existence.
await client.messages.create({
  model: "claude-sonnet-5", max_tokens: 1024,
  system, messages: trimmed,
});`,
      ts: `// Production - trim whole pairs, pin what must survive
// System prompt is a separate param - never trimmed.
// Pinned facts live in a summary message kept at index 0.
const pinned = messages[0]; // "Summary: user Alice, penicillin allergy..."

const kept: Anthropic.MessageParam[] = [];
let budget = MAX_INPUT_TOKENS - estimate(pinned);
// Walk backwards two-at-a-time: user+assistant pairs stay
// together, so a tool_use is never split from its tool_result.
for (let i = messages.length - 1; i >= 2; i -= 2) {
  const cost = estimate(messages[i - 1]) + estimate(messages[i]);
  if (cost > budget) break;
  budget -= cost;
  kept.unshift(messages[i - 1], messages[i]);
}

await client.messages.create({
  model: "claude-sonnet-5", max_tokens: 1024,
  system, messages: [pinned, ...kept],
});`,
      note:
        "Trim in whole user/assistant pairs (tool_use and its tool_result must stay adjacent), keep the system prompt out of the eviction zone, and pin must-survive facts in a summary message.",
    },
    {
      label: "Silent deletion vs summarize-then-drop",
      intro:
        "History has outgrown the budget. One version just deletes old turns; the other compresses them with a cheap model first.",
      php: `// First attempt - old turns simply vanish
if (estimateAll(messages) > THRESHOLD) {
  // Everything the user established early - name,
  // preferences, decisions made - is deleted.
  // The bot visibly "gets dumber" mid-conversation.
  messages = messages.slice(-6);
}`,
      ts: `// Production - compress old turns with claude-haiku-4-5
if (estimateAll(messages) > THRESHOLD) {
  const old = messages.slice(0, -6);
  const recent = messages.slice(-6);

  const summary = await client.messages.create({
    model: "claude-haiku-4-5", // $1/$5/MTok - built for this
    max_tokens: 512,
    system: "Summarize this conversation. Preserve names, " +
      "decisions, constraints, and open questions.",
    messages: [...old, { role: "user",
      content: "Summarize the conversation so far." }],
  });

  messages = [
    { role: "user", content: "Context from earlier: " +
      summary.content.filter((b) => b.type === "text")
        .map((b) => b.text).join("") },
    ...recent,
  ];
}`,
      note:
        "A tiered-model pattern: Haiku compresses at 1/3 the input price of Sonnet, so memory degrades gracefully instead of dropping off a cliff. The API also has a server-side compaction beta, but client-side budgeting is the portable skill.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "trimToBudget over a fabricated 12-message history (6 user/assistant pairs, oldest first, growing in size). Predict which pairs survive a 500-token budget, then run it.",
    code: `// Structure-aware trimming: keep the system prompt, walk backwards
// in whole user/assistant pairs, stop when the budget is spent.

type Msg = { role: 'user' | 'assistant'; content: string };

const estTokens = (text: string) => Math.ceil(text.length / 4);

const system =
  'You are a travel-planning assistant. The user is planning a trip to Japan.';

// Fabricate 6 pairs; later turns are longer (like real chats).
const history: Msg[] = [];
for (let i = 1; i <= 6; i++) {
  history.push({ role: 'user', content: 'Question ' + i + ': ' + 'x'.repeat(i * 40) });
  history.push({ role: 'assistant', content: 'Answer ' + i + ': ' + 'y'.repeat(i * 80) });
}

function trimToBudget(msgs: Msg[], maxTokens: number): Msg[] {
  const kept: Msg[] = [];
  let budget = maxTokens - estTokens(system); // system is always sent
  // newest pair first; never split a pair (tool_use/tool_result safety)
  for (let i = msgs.length - 1; i > 0; i -= 2) {
    const pairCost = estTokens(msgs[i - 1].content) + estTokens(msgs[i].content);
    if (pairCost > budget) break;
    budget -= pairCost;
    kept.unshift(msgs[i - 1], msgs[i]);
  }
  return kept;
}

const BUDGET = 500;
console.log('system: ~' + estTokens(system) + ' tokens (always kept)');
for (let i = 0; i < history.length; i += 2) {
  const cost = estTokens(history[i].content) + estTokens(history[i + 1].content);
  console.log('pair ' + (i / 2 + 1) + ': ~' + cost + ' tokens');
}

const kept = trimToBudget(history, BUDGET);
const keptCost = kept.reduce((n, m) => n + estTokens(m.content), 0);

console.log('\\nbudget: ' + BUDGET + ' tokens');
console.log('kept ' + kept.length + ' of ' + history.length + ' messages (~' +
  (keptCost + estTokens(system)) + ' tokens with system):');
for (const m of kept) {
  console.log('  ' + m.role + ': ' + m.content.slice(0, 14) + '...');
}
console.log('\\ndropped: the ' + (history.length - kept.length) +
  ' oldest messages - pin anything from them that must survive.');

// Try it: raise BUDGET to 700, or make pair 6 huge so even the
// newest pair alone busts the budget.`,
  },

  keyPoints: [
    "Unbounded history fails economically long before it fails technically — every turn resends everything, so cap what you SEND while keeping the full transcript in your store.",
    "Sliding window trimming must be structure-aware: trim whole user/assistant pairs (a split tool_use/tool_result pair makes the request invalid) and never trim the system prompt.",
    "Facts that must survive eviction — names, constraints, decisions — belong in the system prompt or a pinned summary message, outside the eviction zone.",
    "Summarize-then-drop uses a cheap model (`claude-haiku-4-5`, $1/$5 per MTok) to compress old turns into one message, so memory degrades gracefully.",
    "Enforce the budget at the send site: rough chars/4 for loop logic, `client.messages.countTokens` for accuracy (never tiktoken — wrong tokenizer for Claude).",
    "Server-side compaction and context-editing betas exist, but client-side budgeting is the portable, provider-agnostic skill.",
  ],

  interview: [
    {
      q: "How do you keep a long-running chat from blowing up in cost or overflowing the context window?",
      a: "I enforce a token budget at the send site: before every `messages.create`, a `trimToBudget` function measures the transcript — chars/4 for a fast estimate, the `countTokens` endpoint when accuracy matters — and evicts oldest-first until it fits. Two structural rules: trim in whole user/assistant pairs so a tool_use block is never separated from its tool_result (that's a 400), and keep the system prompt plus a pinned summary of must-survive facts outside the eviction zone. Past a threshold I switch from dropping to summarizing: claude-haiku-4-5 compresses the old turns into one context message at a fraction of Sonnet pricing. The full transcript still lives in the database — the budget only governs what each request sends.",
    },
    {
      q: "What's wrong with messages.slice(-10) as a trimming strategy?",
      a: "Three things. It cuts at an arbitrary index, so it can split a tool exchange — a tool_use in the assistant message at position -11 with its tool_result at -10 — which the API rejects as an invalid transcript. It silently loses pinned facts: the allergy mentioned in turn 2 vanishes and the bot 'gets dumber' mid-conversation. And it counts messages, not tokens — ten short turns and ten document-pasting turns have wildly different real sizes, so it neither guarantees the budget nor uses it well. The fix is trimming whole pairs backwards against a token budget, with durable facts pinned in the system prompt or a summary message.",
    },
    {
      q: "The API has compaction features server-side. Why still implement client-side budgeting?",
      a: "I'd mention both in a design discussion. Server-side compaction and context editing are attractive — the API summarizes or clears old context automatically — but they're beta features on one provider. Client-side budgeting is portable: the same trimToBudget and summarize-with-a-cheap-model logic works against any LLM API, survives provider migrations, and gives me control over *what* survives — I decide that the user's constraints are pinned and the small talk is expendable. In practice I'd treat server-side compaction as an optimization to layer on later, with client-side budgeting as the foundation the product logic relies on.",
    },
  ],

  quiz: [
    {
      question:
        "Why can 'keep the last 10 messages' produce a request the API rejects outright?",
      options: [
        "Ten messages always exceeds the rate limit",
        "The slice can separate a tool_use block from its tool_result, leaving an invalid transcript",
        "Trimmed conversations must be re-encoded as base64",
        "The API requires at least 20 messages of context",
      ],
      answerIndex: 1,
      explain:
        "A tool_use block in an assistant message must be immediately followed by its tool_result in the next user message. An index-based slice can cut between them — so production trimming works in whole user/assistant pairs.",
    },
    {
      question:
        "In summarize-then-drop, why is claude-haiku-4-5 the natural choice for the summarization call?",
      options: [
        "It has a larger context window than Sonnet 5",
        "Summaries are a low-stakes, high-volume task and Haiku costs $1/$5 per MTok — a fraction of Sonnet 5's price",
        "Only Haiku models are allowed to summarize conversations",
        "It's the only model that supports the system parameter",
      ],
      answerIndex: 1,
      explain:
        "Compression is exactly the fast-and-cheap tier's job: you spend a small Haiku bill to shrink what the expensive model must reread every turn. (Haiku's context is actually smaller — 200K — which is fine for this.)",
    },
    {
      question:
        "What's the right tool for an accurate token count of a pending request?",
      options: [
        "tiktoken, the standard tokenizer library",
        "content.length / 4 — it's exact for English",
        "client.messages.countTokens with the same model, system, and messages",
        "Counting words and multiplying by 1.3",
      ],
      answerIndex: 2,
      explain:
        "The countTokens endpoint is authoritative because it uses the actual model's tokenizer. tiktoken is OpenAI's tokenizer and miscounts Claude tokens; chars/4 is only a rough in-loop estimate.",
    },
  ],
};

export default lesson;
