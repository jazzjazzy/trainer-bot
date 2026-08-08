import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "shipping-llm-features",
  title: "Shipping LLM Features (Not Chatbots)",
  part: "Production Engineering",
  estMinutes: 13,
  summary:
    "Where LLMs actually fit a product: scoped features with measurable success and human-verifiable output, assembled behind the production checklist this course built.",

  concept: `
The instinct after learning this API is to bolt a chatbot onto everything. That
is almost always the wrong move. The features that ship and last are **narrow**:
one job, a measurable success metric, and output a human or a hard rule can
verify. This capstone ties the whole course into a way of deciding *what* to
build and a checklist for *how* to ship it.

### The fit heuristic

An LLM is a good fit when three things line up:

- **High value** — the task is worth doing and currently expensive or slow.
- **Tolerance for imperfection** — an occasional wrong answer is recoverable,
  not catastrophic.
- **Human-verifiable output** — someone (or a deterministic check) can confirm
  the result before it matters.

The anti-pattern is the opposite: an **irreversible action taken from raw model
output**. "The model said refund, so we refunded" mixes a probabilistic system
with real money and no checkpoint. Good features keep a human or a hard rule
between the model and anything you can't undo.

### The feature menu

Most valuable LLM features are one of a handful of shapes: **summarization**
(a thread, a document), **extraction** (pull structured fields from text),
**classification** (route, tag, triage), **draft generation** (a reply the user
edits before sending), **semantic search** (retrieval over embeddings), and
**support deflection with RAG** (answer from your docs with citations).
Notice what they share: the output is scoped and checkable, and the human stays
in the loop for anything consequential.

### The shipping checklist

Every earlier section was a line item here. Before an LLM feature launches:

- **Tiered model choice** — the cheapest model that does the job.
- **Streaming UX** — long output streams instead of hanging on a spinner.
- **Structured output with validation** — a schema, not "parse and pray".
- **Injection defenses** — untrusted text labelled, authorization in tool code.
- **A cost model** — known dollars per request at expected volume.
- **Evals** — a fixture suite that gates every prompt change.
- **Error handling** — typed retries, backoff, graceful degradation.

Treat the checklist as a **launch gate**, not a wish list — a feature that
fails a line ships broken in that dimension.

### Interview synthesis

When asked "design an AI feature for product X", answer in order:
**architecture** (which feature shape, which model tier, RAG or not, streaming),
then **cost** (tiering, caching, batch where it fits), then **safety** (injection
defenses, human-in-the-loop for irreversible actions, refusal handling). That
sequence — value and fit first, then the production concerns — is what a
candidate who has actually shipped an LLM feature sounds like.
`,

  comparisons: [
    {
      label: "\"Add an AI chatbot\" vs a scoped feature with a metric",
      intro:
        "Two ways to spec an AI feature. One is unbounded with no way to know if it works; the other is one job with a measurable outcome and a fallback.",
      php: `// First attempt: unbounded scope, no success metric
const feature = {
  name: "AI assistant",
  scope: "answers anything about the whole product",
  successMetric: undefined, // how would you even know it works?
  fallback: undefined,      // what happens when it's wrong?
};`,
      ts: `// Production: one job, one measurable outcome, a graceful fallback
const feature = {
  name: "Summarize this thread",
  scope: "one button on the ticket view; input is the thread, output is 3 bullets",
  successMetric: "agents accept the summary unedited > 70% of the time",
  fallback: "on error, show the raw thread — the feature is optional, not load-bearing",
};`,
      note:
        "Unbounded scope has no definition of done and no way to measure quality. A scoped feature with a success metric can be evaluated, improved, and safely turned off.",
    },
    {
      label: "Shipping on vibes vs the checklist as a launch gate",
      intro:
        "Decide whether a feature is ready to deploy. One version trusts a good demo; the other runs the production checklist as a hard gate.",
      php: `// First attempt: "looks good in the playground" -> deploy
if (looksGoodToMe) {
  deploy();
}`,
      ts: `// Production: the checklist is the launch gate
const gate = [
  spec.evals.passRate >= 0.9,   // evals
  spec.hasInjectionDefense,     // safety
  spec.costPerRequest <= budget, // cost model
  spec.handlesErrors,           // typed retries + degradation
  spec.outputIsHumanVerifiable, // fit heuristic
];

if (gate.every(Boolean)) deploy();
else block("not ready: " + gate.filter((ok) => !ok).length + " gate(s) failing");`,
      note:
        "A good demo proves the feature can work, not that it's ready. The checklist turns 'seems fine' into a set of hard conditions every launch has to clear.",
    },
    {
      label: "Irreversible action from raw output vs draft-then-commit",
      intro:
        "The model decides on a refund. One version acts on raw model text directly; the other keeps a human or a hard rule between the model and the money.",
      php: `// First attempt: model output triggers an irreversible action directly
const decision = await model(\`Refund this order? \${order}\`);
if (decision.includes("yes")) {
  await issueRefund(order); // string-matching model text -> real money moves
}`,
      ts: `// Production: the model drafts; a human or a hard rule commits
const draft = await classifyRefund(order); // structured: { recommend, reason }

if (draft.recommend && order.total < AUTO_LIMIT) {
  queueForReview(order, draft); // small, low-risk -> human confirms
} else {
  escalateToHuman(order, draft); // large or unsure -> never auto-acts
}
// Irreversible actions never fire straight from raw model output.`,
      note:
        "A probabilistic model plus an irreversible action with no checkpoint is the classic bad fit. Structure the output, gate on a hard rule, and keep a human in the loop for anything you can't undo.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A launch-gate scorer. Two feature specs are encoded as data; the scorer runs the production checklist this course assembled and prints what each is still missing. Predict which one ships and why the other doesn't.",
    code: `// A launch-gate scorer: encode a feature spec as data, run the checklist
// the whole course built up, and print what's still missing before it ships.

interface FeatureSpec {
  name: string;
  tieredModel: boolean;      // routes by difficulty, not Opus-for-everything
  streamingUX: boolean;      // streams long output instead of a spinner
  structuredOutput: boolean; // schema + validation, not "parse and pray"
  injectionDefense: boolean; // authz in tool code, untrusted text labelled
  costModel: boolean;        // known $ per request at expected volume
  evals: boolean;            // fixture suite gates prompt changes
  errorHandling: boolean;    // typed retries + graceful degradation
  humanVerifiable: boolean;  // output is checkable / reversible, not fire-and-forget
}

const GATES: { key: keyof FeatureSpec; label: string }[] = [
  { key: "tieredModel", label: "tiered model choice" },
  { key: "streamingUX", label: "streaming UX" },
  { key: "structuredOutput", label: "structured output + validation" },
  { key: "injectionDefense", label: "injection defenses" },
  { key: "costModel", label: "cost model" },
  { key: "evals", label: "evals" },
  { key: "errorHandling", label: "error handling" },
  { key: "humanVerifiable", label: "human-verifiable output" },
];

function readiness(spec: FeatureSpec): { missing: string[]; ready: boolean } {
  const missing = GATES.filter((g) => !spec[g.key]).map((g) => g.label);
  return { missing, ready: missing.length === 0 };
}

const specs: FeatureSpec[] = [
  {
    name: "Summarize this thread (a button)",
    tieredModel: true, streamingUX: true, structuredOutput: true,
    injectionDefense: true, costModel: true, evals: true,
    errorHandling: true, humanVerifiable: true,
  },
  {
    name: "Auto-refund chatbot (acts on raw model output)",
    tieredModel: false, streamingUX: true, structuredOutput: false,
    injectionDefense: false, costModel: false, evals: false,
    errorHandling: true, humanVerifiable: false,
  },
];

for (const spec of specs) {
  const r = readiness(spec);
  console.log(spec.name);
  console.log("  status: " + (r.ready ? "READY TO SHIP" : "NOT READY"));
  console.log("  passed " + (GATES.length - r.missing.length) + "/" + GATES.length + " gates");
  if (r.missing.length) console.log("  missing: " + r.missing.join(", "));
  console.log("");
}`,
  },

  keyPoints: [
    "LLMs fit best when value is high, imperfection is tolerable, and output is human-verifiable; the anti-pattern is an irreversible action taken from raw model output.",
    "Ship scoped features, not a chatbot on everything: one job, a measurable success metric, and a graceful fallback when the model is wrong.",
    "The valuable feature shapes — summarization, extraction, classification, draft generation, semantic search, RAG deflection — all have scoped, checkable output with a human in the loop for consequential actions.",
    "The launch checklist is the whole course: tiered model, streaming UX, structured output + validation, injection defenses, cost model, evals, error handling — treat it as a hard gate.",
    "Keep a human or a deterministic rule between the model and anything irreversible; the model drafts and recommends, it does not commit.",
    "In an interview 'design an AI feature' answer, go in order: architecture, then cost, then safety — value and fit first, production concerns second.",
  ],

  interview: [
    {
      q: "How do you decide whether a problem is a good fit for an LLM feature?",
      a: "I check three things. Is the value high — is this task worth doing and currently slow or expensive? Is there tolerance for imperfection — is an occasional wrong answer recoverable rather than catastrophic? And is the output human-verifiable — can a person or a deterministic check confirm it before it matters? When all three hold, like summarizing a support thread or drafting a reply the agent edits, it's a strong fit. The red flag is the opposite: an irreversible action taken straight from raw model output, like auto-issuing refunds off a model's yes/no. There I either keep a human in the loop or gate the action behind a hard rule, because you can't mix a probabilistic system with money and no checkpoint.",
    },
    {
      q: "Design an AI feature for a customer-support product. Walk me through it.",
      a: "I'd scope it tightly — say a 'summarize this thread' button and a RAG-backed answer suggester, not a general chatbot. Architecture first: summarization is a scoped task, so claude-haiku-4-5 or sonnet depending on quality needs, streaming the output so the agent isn't staring at a spinner, and structured output where I need fields back. For the answer suggester I'd add retrieval over our docs with citations so answers are grounded. Then cost: tier by difficulty, cache the stable system prompt and doc context, and batch anything offline like nightly re-summarization. Then safety: label retrieved chunks as untrusted data, enforce any data access in tool code scoped to the authenticated agent, keep the suggested reply a draft the human sends rather than an auto-send, and handle refusals gracefully. And I'd wire an eval suite from real tickets so every prompt change is measured before it ships.",
    },
    {
      q: "What's on your checklist before an LLM feature goes to production?",
      a: "Seven things, each of which is a place features usually break. Tiered model choice so I'm not paying Opus rates for classification. Streaming UX so long responses feel responsive. Structured output with schema validation so I'm not parsing free text and hoping. Injection defenses — untrusted text labelled, authorization enforced in tool code, not prompt rules. A cost model so I know dollars per request at expected volume before launch, not after the bill arrives. An eval suite that gates prompt changes so I can prove a change helped. And error handling — typed retries with backoff, and graceful degradation to a fallback or honest error instead of a blank screen. I treat it as a launch gate: if a line fails, the feature ships broken in that dimension.",
    },
  ],

  quiz: [
    {
      question:
        "Which feature is the clearest bad fit for an LLM as described?",
      options: [
        "A button that summarizes a support thread into three bullets the agent can read",
        "Auto-issuing refunds by string-matching 'yes' in raw model output, with no human or hard-rule checkpoint",
        "Suggesting a draft reply the agent edits before sending",
        "Classifying incoming tickets into categories for routing",
      ],
      answerIndex: 1,
      explain:
        "Auto-refunding on raw model text is an irreversible action with no verification between a probabilistic model and real money — the classic anti-pattern. The others are scoped, checkable, and keep a human or hard rule in the loop.",
    },
    {
      question:
        "What are the three conditions of the fit heuristic for LLM features?",
      options: [
        "Low cost, high speed, and a large model",
        "High value, tolerance for imperfection, and human-verifiable output",
        "Streaming, caching, and batching",
        "A chatbot UI, a big context window, and fine-tuning",
      ],
      answerIndex: 1,
      explain:
        "An LLM fits when the task is worth doing, an occasional wrong answer is recoverable, and the output can be verified before it matters. Those three together separate good features from risky ones.",
    },
    {
      question:
        "In an interview, you're asked to 'design an AI feature for product X'. What order should your answer follow?",
      options: [
        "Safety, then architecture, then cost",
        "Cost, then safety, then architecture",
        "Architecture, then cost, then safety",
        "Whatever you think of first — order doesn't matter",
      ],
      answerIndex: 2,
      explain:
        "Lead with architecture (feature shape, model tier, RAG, streaming), then cost (tiering, caching, batch), then safety (injection defenses, human-in-the-loop, refusals). Value and fit first, production concerns second — the sequence a shipped-it candidate uses.",
    },
  ],
};

export default lesson;
