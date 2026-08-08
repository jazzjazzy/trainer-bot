import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "cost-and-latency",
  title: "Cost and Latency Engineering",
  part: "Production Engineering",
  estMinutes: 12,
  summary:
    "Route by task difficulty, cache the stable prefix, and batch the non-urgent work — three levers that turn an eye-watering LLM bill into a viable feature.",

  concept: `
A working demo and a shippable feature differ by a spreadsheet. The demo runs
every request on the biggest model with a fresh prompt each time; the feature
routes cheap work to a cheap model, reuses a cached prefix, and pushes bulk
jobs onto a discounted queue. None of it changes what the user sees — it
changes whether the unit economics survive contact with real traffic.

### Model tiering: pay for the intelligence you need

Anthropic's current tiers span a wide price range (USD per **million** tokens,
input / output):

- **\`claude-haiku-4-5\`** — $1 / $5. Classification, extraction, short
  summaries, routing.
- **\`claude-sonnet-5\`** — $3 / $15 (intro $2 / $10 through 2026-08-31). The
  workhorse for most product features.
- **\`claude-opus-4-8\`** — $5 / $25. The hardest reasoning and long-horizon
  agentic work.

A single big model for everything is like running every query through your
slowest, most expensive stored procedure. Put a cheap **classifier** in front
that routes by difficulty — a Haiku call that labels the task, then dispatches
to the right tier — and the blended cost drops sharply because most real
traffic is easy.

### Prompt caching: stop re-billing the same 8 KB

Caching is a **prefix match**. Mark stable content — the system prompt,
retrieved docs, tool definitions — with \`cache_control: {type: "ephemeral"}\`
and subsequent requests that share that exact byte-for-byte prefix read it at
roughly **0.1x** the input price. The first write costs ~1.25x (5-minute TTL),
so it pays off after the second hit.

The catch is that *any* byte change in the prefix invalidates everything after
it. A \`Current time: ...\` line at the top of your system prompt silently
kills caching forever — every request looks new. Keep timestamps, request IDs,
and per-user data **out** of the cached prefix; inject them later, in the user
turn. Verify with \`usage.cache_read_input_tokens\` — if it's zero across
repeated calls, something is busting the cache.

### Batch API: half price for work that can wait

For non-urgent jobs — overnight summarization, back-filling embeddings,
re-scoring a dataset — \`client.messages.batches\` runs requests
asynchronously at **50%** of standard price. It's the LLM version of moving
work off the request path into a background job queue. Two rules: results come
back **unordered**, so key every request by \`custom_id\`; and it's not for
anything a user is waiting on (most finish within an hour, but the SLA is 24h).

### Latency is its own budget

Cost and latency trade off. A smaller model is faster *and* cheaper; caching
cuts time-to-first-token because the prefix is already processed; streaming
hides latency by showing output as it generates. Tier and cache first — they
usually improve both bills at once.
`,

  comparisons: [
    {
      label: "A cache-busting system prompt vs a frozen one",
      intro:
        "Both requests put an 8 KB policy document in the system prompt. Only one of them ever gets a cache hit.",
      php: `// First attempt: a "helpful" timestamp at the front of the prefix
const system = [{
  type: "text",
  text: \`You are a support agent. Current time: \${new Date().toISOString()}.
Company policies: ...(8 KB of stable text)...\`,
  cache_control: { type: "ephemeral" },
}];

// Every request has a new timestamp at the START of the prefix, so the
// cache never matches: usage.cache_read_input_tokens is always 0, and
// you pay full input price for all 8 KB on every single call.`,
      ts: `// Production: freeze the prefix, inject volatile data AFTER it
const system = [{
  type: "text",
  text: "You are a support agent.\\nCompany policies: ...(8 KB of stable text)...",
  cache_control: { type: "ephemeral" },
}];

// The timestamp moves into the user turn, past the cache breakpoint:
const messages = [
  { role: "user", content: \`Current time: \${now}. \${question}\` },
];

// The 8 KB prefix is now byte-identical every call ->
// cache_read_input_tokens > 0, billed at ~0.1x.`,
      note:
        "Caching is a prefix match — one changed byte near the front invalidates the whole cache. Anything that varies per request belongs after the last cache_control breakpoint.",
    },
    {
      label: "One big model vs a classifier-then-router",
      intro:
        "Handle a stream of mixed tasks. One version pays Opus rates to classify a ticket; the other routes each task to the cheapest model that can do it.",
      php: `// First attempt: Opus for everything, including trivial work
async function handle(task: Task) {
  return client.messages.create({
    model: "claude-opus-4-8", // $5 / $25 per MTok — even to label a ticket
    max_tokens: 1024,
    messages: [{ role: "user", content: task.text }],
  });
}`,
      ts: `// Production: route by difficulty; most traffic is easy and cheap
function pickModel(task: Task): string {
  if (task.kind === "classify" || task.kind === "extract")
    return "claude-haiku-4-5"; // $1 / $5
  if (task.kind === "hard-reasoning")
    return "claude-opus-4-8";   // $5 / $25
  return "claude-sonnet-5";     // $3 / $15 — the workhorse default
}

async function handle(task: Task) {
  return client.messages.create({
    model: pickModel(task),
    max_tokens: 1024,
    messages: [{ role: "user", content: task.text }],
  });
}`,
      note:
        "The router itself can be a cheap Haiku call. Because the easy tier is both cheaper per token and the bulk of traffic, the blended bill falls by multiples.",
    },
    {
      label: "A synchronous overnight loop vs a batch submission",
      intro:
        "Summarize 10,000 documents that nobody is waiting on tonight. One version loops synchronously at full price; the other submits a batch.",
      php: `// First attempt: fire 10,000 requests serially, full price
for (const doc of documents) {
  const res = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    messages: [{ role: "user", content: \`Summarize:\\n\${doc.text}\` }],
  });
  await save(doc.id, res.content);
}
// Full price, strictly serial, and one unhandled 529 mid-run can
// strand the whole job.`,
      ts: `// Production: submit as a batch — 50% price, runs async
const batch = await client.messages.batches.create({
  requests: documents.map((doc) => ({
    custom_id: doc.id, // results come back UNORDERED — key by this
    params: {
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [{ role: "user", content: \`Summarize:\\n\${doc.text}\` }],
    },
  })),
});

// Poll batch.processing_status until "ended", then stream the results
// and match each one back to its document by custom_id.`,
      note:
        "Batch is for work off the request path — most batches finish within an hour but the SLA is 24h. Never batch anything a user is actively waiting on.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A monthly cost model over a realistic request profile. Predict which architecture wins and by how much, then run it: the naive column bills everything on Opus with a cache-busting prompt; the production column tiers and caches.",
    code: `// Monthly cost model: naive (all Opus, cache-busting prompt) vs
// tiered routing with a frozen, cached prefix. Prices are USD per MTok.

type Rates = { in: number; out: number };
const PRICES: Record<string, Rates> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
};

// One job type the product runs each month.
interface Job {
  name: string;
  requests: number;
  prefixTokens: number;   // system prompt + docs — identical every call
  variableTokens: number; // the per-request question
  outTokens: number;
  tier: "classify" | "workhorse" | "hard";
}

const profile: Job[] = [
  { name: "classify ticket",    requests: 200000, prefixTokens: 4000, variableTokens: 200,  outTokens: 20,   tier: "classify" },
  { name: "summarize thread",   requests: 50000,  prefixTokens: 4000, variableTokens: 1500, outTokens: 300,  tier: "workhorse" },
  { name: "resolve escalation", requests: 5000,   prefixTokens: 4000, variableTokens: 3000, outTokens: 1200, tier: "hard" },
];

const MTOK = 1000000;

// Naive: every job on Opus, and a timestamp in the system prompt busts the
// cache, so the full prefix is billed at input price on every call.
function naiveCost(job: Job): number {
  const r = PRICES["claude-opus-4-8"];
  const inTok = job.prefixTokens + job.variableTokens;
  return (
    (job.requests * inTok / MTOK) * r.in +
    (job.requests * job.outTokens / MTOK) * r.out
  );
}

// Production: route by difficulty, freeze the prefix so it caches at ~0.1x.
const TIER_MODEL: Record<Job["tier"], string> = {
  classify: "claude-haiku-4-5",
  workhorse: "claude-sonnet-5",
  hard: "claude-opus-4-8",
};

function tieredCost(job: Job): number {
  const r = PRICES[TIER_MODEL[job.tier]];
  const cachedIn = (job.requests * job.prefixTokens / MTOK) * r.in * 0.1;
  const freshIn = (job.requests * job.variableTokens / MTOK) * r.in;
  const out = (job.requests * job.outTokens / MTOK) * r.out;
  return cachedIn + freshIn + out;
}

const money = (n: number) => "$" + n.toFixed(2);

let naiveTotal = 0;
let prodTotal = 0;
console.log("job".padEnd(20) + "naive".padStart(12) + "production".padStart(14));
for (const job of profile) {
  const n = naiveCost(job);
  const p = tieredCost(job);
  naiveTotal += n;
  prodTotal += p;
  console.log(job.name.padEnd(20) + money(n).padStart(12) + money(p).padStart(14));
}
console.log("".padEnd(46, "-"));
console.log("TOTAL".padEnd(20) + money(naiveTotal).padStart(12) + money(prodTotal).padStart(14));
console.log("");
console.log("production is " + (naiveTotal / prodTotal).toFixed(1) + "x cheaper per month");`,
  },

  keyPoints: [
    "Tier by difficulty: claude-haiku-4-5 ($1/$5) for classify/extract/summarize, claude-sonnet-5 ($3/$15) as the workhorse, claude-opus-4-8 ($5/$25) for the hardest reasoning — a cheap classifier can do the routing.",
    "Prompt caching (`cache_control: {type: \"ephemeral\"}`) reads a stable prefix at ~0.1x; the first write is ~1.25x, so it pays off from the second hit.",
    "Caching is a prefix match — a timestamp or per-user field near the front of the system prompt silently invalidates the whole cache. Keep volatile content after the last breakpoint.",
    "Verify caching worked with `usage.cache_read_input_tokens`; zero across repeated calls means something is busting the prefix.",
    "The Batch API (`client.messages.batches`) runs non-urgent jobs at 50% price; results are unordered, so key every request by `custom_id`.",
    "Cost and latency usually move together — smaller models and cache hits are both cheaper and faster, so tier and cache before micro-optimizing anything else.",
  ],

  interview: [
    {
      q: "An LLM feature's API bill is too high. What are the first levers you reach for?",
      a: "Three, in order. First, model tiering — I check whether every request really needs the top model. Most traffic is classification, extraction, or short summaries that claude-haiku-4-5 handles at a fifth of Opus's price, so I put a cheap classifier in front that routes by difficulty and reserve claude-opus-4-8 for genuinely hard reasoning. Second, prompt caching — if there's a large stable prefix like a system prompt or retrieved docs, I mark it with cache_control so repeat requests read it at about a tenth of input price, and I make sure nothing volatile like a timestamp sits in the prefix busting the cache. Third, the Batch API for anything non-urgent, at half price. Tiering and caching usually cut the bill by multiples before I touch anything else.",
    },
    {
      q: "Why does putting the current time in your system prompt wreck prompt caching?",
      a: "Caching works by matching a prefix of the request byte-for-byte up to the cache breakpoint. A timestamp near the top of the system prompt means the prefix is different on every request, so the cache never matches and you pay full input price for the entire prompt every time — the cache_read_input_tokens field stays at zero. The fix is to keep the prompt frozen and inject anything that varies — time, user ID, request ID — later, in the user turn, past the last cache_control breakpoint. That way the expensive stable part caches and only the small variable part is billed fresh.",
    },
    {
      q: "When would you use the Batch API, and what's the one gotcha you design around?",
      a: "For any workload that isn't on the user's request path — overnight summarization, back-filling embeddings, re-scoring a dataset after a prompt change. It's 50% cheaper, which matters at volume. The gotcha is that results come back unordered and asynchronously, so I never rely on position — I set a custom_id on every request and key the results back to my records by that ID. I also don't use it for anything latency-sensitive: most batches finish within an hour but the guarantee is 24 hours, so a user waiting on a response should get a normal synchronous call.",
    },
  ],

  quiz: [
    {
      question:
        "You add cache_control to your 8 KB system prompt but usage.cache_read_input_tokens stays 0 across identical repeated requests. What's the most likely cause?",
      options: [
        "Caching only works on the Batch API",
        "Something volatile (a timestamp, request ID, or per-user field) sits inside the cached prefix, changing its bytes every request",
        "You must call a separate cache-warming endpoint first",
        "claude-sonnet-5 does not support prompt caching",
      ],
      answerIndex: 1,
      explain:
        "Caching is a prefix match: any byte change before the breakpoint invalidates the cache. A timestamp or user ID interpolated into the system prompt makes every request look new. Move volatile content after the last cache_control breakpoint.",
    },
    {
      question:
        "You're processing 100,000 documents overnight for a report due tomorrow morning. Which approach fits best?",
      options: [
        "A synchronous for-loop on claude-opus-4-8 for maximum quality",
        "The Batch API at 50% price, keying each result back by custom_id",
        "100,000 parallel synchronous requests to finish fastest",
        "Prompt caching alone, with no change to how requests are sent",
      ],
      answerIndex: 1,
      explain:
        "Nobody is waiting in real time, so batch is ideal: half price and asynchronous. Because batch results are unordered, you match each one to its document by the custom_id you set on the request.",
    },
    {
      question:
        "What's the core idea behind model tiering for cost control?",
      options: [
        "Always use the cheapest model and accept lower quality everywhere",
        "Route each task to the cheapest model that can do it, using a cheap classifier to decide — reserving the expensive model for hard tasks",
        "Randomly split traffic across all three tiers to average the cost",
        "Use Opus for input and Haiku for output within the same request",
      ],
      answerIndex: 1,
      explain:
        "Most real traffic is easy (classify, extract, summarize), which a cheap model handles well. A classifier-then-router sends only genuinely hard reasoning to Opus, so the blended cost drops sharply without hurting quality where it matters.",
    },
  ],
};

export default lesson;
