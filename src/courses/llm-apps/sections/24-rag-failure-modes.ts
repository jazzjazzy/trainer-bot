import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "rag-failure-modes",
  title: "RAG Failure Modes and Fixes",
  part: "Embeddings & RAG",
  estMinutes: 13,
  summary:
    "When a RAG answer is wrong, the skill is diagnosing WHERE — retrieval, grounding, or corpus — because each layer has a different fix, from query rewriting and hybrid search to reranking and best-first ordering.",

  concept: `
"The RAG bot gave a wrong answer" is not a bug report — it's three different
bugs wearing the same coat. The interview-differentiating skill is
**localising the failure** before touching anything, because each layer has a
completely different fix.

### The three failure layers

Ask one question at a time, in order:

1. **Retrieval failure** — *was the right chunk even fetched?* Pull the
   retrieved chunks and look. If the answer's chunk isn't among them, the
   generator never had a chance. Fixes live upstream: better **chunking**,
   **hybrid search** (add keyword matching so exact identifiers aren't lost),
   or **query rewriting** (below).
2. **Grounding failure** — the right chunk *was* retrieved, but the model
   ignored it, contradicted it, or blended in training data. Fixes live in
   the prompt: tighten "answer ONLY from the sources", require citations, and
   **shrink k** so the good chunk isn't buried under distractors.
3. **Corpus failure** — the answer simply isn't in the documents. No
   retrieval or prompt trick invents information you never stored. The only
   correct behaviour is "I couldn't find this" plus, ideally, an escalation
   path. Trying to "fix" this in the pipeline is how you build a confident
   liar.

You can only tell these apart by *looking at the retrieved chunks*. Logging
them per query is the single highest-value piece of RAG observability.

### Lost in the middle

Models attend most reliably to the **start and end** of a long context and
skimp on the middle. So a correct chunk sitting at position 11 of 20 can be
retrieved *and* effectively ignored — a grounding failure caused by
**ordering**. Two mitigations: keep the context short (small k), and place
the **strongest chunks first** (and optionally repeat the very best at the
end). Order is a lever, not just a byproduct of the similarity sort.

### Reranking

Vector similarity is a fast, coarse filter. A **reranker** — a cheaper,
more precise model pass — re-scores the top ~20 candidates for actual
relevance to the query, and you keep the top 5 of *those*. It's the classic
retrieve-wide-then-narrow pattern: cast a broad net with cheap vector search,
then spend a little compute sharpening the final few. Reranking plus
best-first ordering is what turns "the chunk was in there somewhere" into
"the chunk was chunk [1]".

### Query rewriting

In a conversation, the raw user turn is often unsearchable on its own.
"What about refunds?" has no subject; "and the second one?" is meaningless as
an embedding. Before retrieving, rewrite the turn into a **standalone search
query** using the conversation history — a cheap model call that turns "what
about refunds?" into "refund policy and timeline for orders". This also
closes **synonym gaps**: a user asking to "get my money back" never matches a
chunk that says "refund" until the rewrite introduces the word the corpus
actually uses. In PHP terms it's the same instinct as normalising a search
term before it hits the index — you don't query the index with raw, ambiguous
user input.
`,

  comparisons: [
    {
      label: "Raw user message as the query vs history-aware rewriting",
      intro:
        "A follow-up turn in a chat. The raw message is unsearchable on its own; rewriting it against the history produces a standalone query that actually retrieves.",
      php: `// First attempt: embed whatever the user just typed
const followUp = "what about the second one?";

// As a search query this is meaningless — no subject, no topic.
// The embedding lands nowhere near the relevant chunk, so
// retrieval misses and the model answers from thin air.
const queryVec = await embed(followUp);
const hits = await store.search(queryVec, 5, 0.7);`,
      ts: `// Production: rewrite into a standalone query using history
const history = [
  { role: "user", content: "Tell me about your two shipping tiers." },
  { role: "assistant", content: "We offer standard and express shipping." },
  { role: "user", content: "what about the second one?" },
];

// A cheap model call resolves the reference before retrieval:
const standalone = await rewriteQuery(history);
// -> "express shipping tier details, cost, and delivery time"

const queryVec = await embed(standalone);
const hits = await store.search(queryVec, 5, 0.7);`,
      note:
        "Retrieval quality is capped by query quality. Conversational turns must be resolved to self-contained queries (and synonyms bridged) before they touch the store.",
    },
    {
      label: "k=20 in similarity order vs reranked top-5, best-first",
      intro:
        "Both start from the same vector search. The left dumps 20 chunks in raw similarity order; the right reranks and keeps the best 5, strongest first, to beat lost-in-the-middle.",
      php: `// First attempt: more chunks = more chance, right?
const candidates = await store.search(queryVec, 20, 0.5);

// 20 chunks in raw cosine order. The best chunk might sit at
// position 11 — retrieved, but in the "middle" the model
// under-attends to. Plus 20 chunks of tokens, mostly noise.
const context = candidates
  .map((c, i) => "[" + (i + 1) + "] " + c.chunk)
  .join("\\n\\n");`,
      ts: `// Production: retrieve wide, rerank, keep few, order best-first
const candidates = await store.search(queryVec, 20, 0.5);

// A cheap reranker re-scores for true relevance to the query:
const ranked = await rerank(question, candidates);
const top = ranked.slice(0, 5);           // narrow to the best 5

// Strongest first (models attend to the start); tight context:
const context = top
  .map((c, i) => "[" + (i + 1) + "] " + c.chunk)
  .join("\\n\\n");`,
      note:
        "Retrieve-wide-then-narrow: cheap vector search casts the net, a reranker sharpens it, best-first ordering fights lost-in-the-middle. Fewer, better-ordered chunks beat more chunks.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A failure triage in code. A user asks to 'get my money back' — naive retrieval MISSES because the corpus says 'refund' (a synonym gap). Then query-rewrite + a hybrid keyword boost recover the right chunk. Watch the scores before and after.",
    code: `// Diagnosing and fixing a retrieval failure caused by a synonym gap.
// Toy 4-D embeddings; axes ~ [refund, shipping, account, misc].

type Chunk = { text: string; vector: number[]; source: string };

const store: Chunk[] = [
  { text: "Refunds are issued to the original payment method within 5 days.",
    vector: [1, 0, 0, 0], source: "billing.md" },
  { text: "Orders ship the same day if placed before 2pm.",
    vector: [0, 1, 0, 0], source: "shipping.md" },
  { text: "Reset your password from the account settings page.",
    vector: [0, 0, 1, 0], source: "account.md" },
];

// Toy embedder: keyword hits per topic axis.
function toyEmbed(text: string): number[] {
  const t = text.toLowerCase();
  const has = (w: string) => (t.includes(w) ? 1 : 0);
  return [
    has("refund"),
    has("ship") + has("order") + has("delivery"),
    has("password") + has("account"),
    has("dog"),
  ];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  return ma && mb ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : 0;
}

// Keyword score: fraction of query words present in the chunk (BM25 in spirit).
function keywordScore(query: string, chunk: string): number {
  const words = query.toLowerCase().split(/\\W+/).filter(Boolean);
  const body = chunk.toLowerCase();
  const hits = words.filter((w) => body.includes(w)).length;
  return words.length ? hits / words.length : 0;
}

function best(query: string, useHybrid: boolean) {
  const qv = toyEmbed(query);
  return store
    .map((c) => {
      const vec = cosine(qv, c.vector);
      const kw = useHybrid ? keywordScore(query, c.text) : 0;
      const combined = useHybrid ? 0.5 * vec + 0.5 * kw : vec;
      return { source: c.source, vec, kw, combined };
    })
    .sort((a, b) => b.combined - a.combined)[0];
}

// --- STAGE 1: naive retrieval on the raw user turn -----------------------
const raw = "how do I get my money back?";
const before = best(raw, false);
console.log("NAIVE  query: \\"" + raw + "\\"");
console.log("  best chunk: " + before.source +
  "  vectorScore=" + before.vec.toFixed(2));
console.log("  -> " + (before.vec >= 0.4 ? "hit" : "MISS: nothing clears threshold 0.40"));
console.log("  diagnosis: RETRIEVAL failure — 'money back' shares no words with 'refund'");

// --- STAGE 2: query rewrite (synonym) + hybrid keyword boost --------------
// A cheap model call rewrites the turn into the corpus's vocabulary:
const rewritten = "refund policy: getting money back to my payment method";
const after = best(rewritten, true);
console.log("\\nREWRITE+HYBRID query: \\"" + rewritten + "\\"");
console.log("  best chunk: " + after.source +
  "  vectorScore=" + after.vec.toFixed(2) +
  "  keywordScore=" + after.kw.toFixed(2) +
  "  combined=" + after.combined.toFixed(2));
console.log("  -> " + (after.combined >= 0.4 ? "HIT: the refund chunk is now recovered" : "still missing"));`,
  },

  keyPoints: [
    "A wrong RAG answer is three distinct bugs — localise it before fixing: retrieval failure (chunk never fetched), grounding failure (chunk fetched but ignored/contradicted), or corpus failure (answer isn't in the docs).",
    "You can only tell them apart by inspecting the retrieved chunks — logging them per query is the highest-value RAG observability.",
    "Retrieval fixes are upstream: better chunking, hybrid (keyword + vector) search, and query rewriting; grounding fixes are in the prompt: stricter 'answer only from sources', citations, and a smaller k.",
    "Corpus failure has exactly one correct fix — return 'not found' and escalate; no pipeline trick invents information you never stored.",
    "Lost-in-the-middle: models under-attend to the middle of long contexts, so keep k small and put the strongest chunks first (repeat the best at the end if needed).",
    "Reranking (retrieve ~20 wide, re-score with a cheap model, keep top 5) plus history-aware query rewriting are the two biggest retrieval-quality upgrades — rewriting also closes synonym gaps.",
  ],

  interview: [
    {
      q: "A RAG answer came back wrong. How do you debug it?",
      a: "I localise the failure to one of three layers before changing anything, and the first thing I do is look at the chunks that were actually retrieved — which is why I log them per query. If the right chunk wasn't retrieved at all, that's a retrieval failure and the fix is upstream: revisit chunking, add hybrid keyword search for exact identifiers, or rewrite the query. If the right chunk was retrieved but the model contradicted it or blended in training knowledge, that's a grounding failure — I tighten the 'answer only from the sources' instruction, enforce citations, and shrink k so the good chunk isn't buried. If the answer simply isn't in the corpus, that's a corpus failure and the only correct behaviour is 'not found' plus escalation. Each layer has a different fix, so guessing wastes time.",
    },
    {
      q: "What is 'lost in the middle' and how do you mitigate it?",
      a: "Models attend most reliably to the beginning and end of a long context and under-weight the middle. So you can retrieve the correct chunk, place it at position 11 of 20, and watch the model effectively ignore it — a grounding failure caused purely by ordering. I mitigate it two ways: keep the context short with a small k so there's no deep middle to get lost in, and order chunks best-first so the strongest evidence is where the model attends most, sometimes repeating the single best chunk at the very end. This is also why reranking matters — it's not just which chunks you keep, it's putting the most relevant one in position [1].",
    },
    {
      q: "Why rewrite the user's query before retrieval, and what problems does it solve?",
      a: "Because retrieval quality is capped by query quality, and raw conversational turns make poor queries. A follow-up like 'what about the second one?' has no subject — as an embedding it lands nowhere useful. Rewriting it against the conversation history into a standalone query, 'express shipping tier cost and delivery time', gives retrieval something to match. It also closes synonym gaps: a user asking to 'get my money back' won't match a chunk that says 'refund' until the rewrite introduces the corpus's actual vocabulary. It's a cheap extra model call before retrieval, and it's the same instinct as normalising a search term before it hits a full-text index rather than querying with raw, ambiguous input.",
    },
  ],

  quiz: [
    {
      question:
        "You inspect the retrieved chunks and the answer's chunk IS among them, but the model gave a contradicting answer. Which failure is this and where's the fix?",
      options: [
        "Retrieval failure — fix chunking",
        "Grounding failure — tighten the prompt and shrink k",
        "Corpus failure — return 'not found'",
        "An embedding-model bug — switch providers",
      ],
      answerIndex: 1,
      explain:
        "The right chunk was retrieved, so retrieval worked. The model ignoring or contradicting it is a grounding failure: strengthen 'answer only from the sources', require citations, and reduce k so the correct chunk isn't buried under distractors (and isn't lost in the middle).",
    },
    {
      question:
        "Why does placing the strongest chunk first (not just retrieving it) improve answer quality?",
      options: [
        "The API only reads the first chunk",
        "Models attend most reliably to the start and end of a long context and under-weight the middle",
        "Earlier chunks are cheaper to process",
        "Ordering changes the cosine similarity scores",
      ],
      answerIndex: 1,
      explain:
        "Lost-in-the-middle: a correct chunk buried in the middle of many can be retrieved yet effectively ignored. Best-first ordering (and small k) puts the strongest evidence where the model attends most, converting a retrieved-but-ignored chunk into one the model actually uses.",
    },
    {
      question:
        "A user asks to 'get my money back' and retrieval misses the chunk that says 'refunds are issued within 5 days'. What's the most direct fix?",
      options: [
        "Increase k to 50 so more chunks are returned",
        "Query rewriting / hybrid search to bridge the synonym gap between 'money back' and 'refund'",
        "Lower the similarity threshold to 0",
        "Switch the model to claude-opus-4-8",
      ],
      answerIndex: 1,
      explain:
        "This is a retrieval failure from a synonym gap: 'money back' shares no words or close semantics with 'refund' as stored. Rewriting the query into the corpus's vocabulary (and adding keyword/hybrid matching) recovers the chunk. Cranking k or dropping the threshold just returns more noise.",
    },
  ],
};

export default lesson;
