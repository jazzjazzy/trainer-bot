import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "rag-end-to-end",
  title: "RAG End to End",
  part: "Embeddings & RAG",
  estMinutes: 13,
  summary:
    "RAG is two phases: an offline ingest job (chunk → embed → store) and a fast query path (embed → retrieve → ground → generate → cite) — and knowing when NOT to use it is half the skill.",

  concept: `
Retrieval-Augmented Generation is not a single function — it's a **pipeline
with two clocks**. Ingestion runs offline and slowly; the query path runs
online and must be fast. Every earlier section in this part is one stage of
it:

\`\`\`text
INGEST (offline: cron / queue job)          QUERY (online: per request)
  documents                                   userQuestion
    -> chunk        (§ chunking)                -> embed         (§ embeddings)
    -> embed        (§ embeddings)              -> retrieve top-k (§ retrieval)
    -> store        (§ retrieval / pgvector)    -> ground prompt (§ grounding)
                                                -> call model    (claude-sonnet-5)
                                                -> validate/cite (§ grounding)
                                                -> respond
\`\`\`

### Why the two phases must be separate

Embedding a document is the expensive part — an API round-trip per chunk.
If you embed the corpus *inside* the request handler, every user question
re-embeds every document: slow, and you pay for the same vectors over and
over. Ingestion is therefore a **batch job** — a cron task, a queue worker,
or a step that runs on document upload — that writes vectors to a store
once. The query path then only embeds the *question* (one short string) and
reads pre-computed vectors back.

In PHP terms: ingestion is the migration that builds and indexes a table;
the query path is the read query that hits the index. You would never
rebuild the index on every page load, and you don't re-embed the corpus on
every question.

### The knobs, and which stage owns them

Each stage has one or two dials you tune against your own eval set:

- **chunk size** (ingest) — too big and a chunk mixes topics and dilutes its
  own embedding; too small and it loses the context that makes it answerable.
- **k** (retrieve) — how many chunks to keep, bounded by a token budget.
- **threshold** (retrieve) — the minimum similarity below which you return
  nothing rather than noise.
- **the grounded prompt** (generate) — numbered sources, "answer only from
  these", an explicit refusal path.

Changing chunk size means re-running ingestion; changing k, threshold, or
the prompt is a query-path change you can ship without touching the store.
That asymmetry is worth stating in an interview.

### When RAG is the WRONG tool

RAG earns its complexity when the corpus is large, changing, and shared. Two
common cases where it's over-engineering:

- **Small, stable corpus** (a handful of policy docs, a product manual): just
  put the whole thing in the prompt and lean on **prompt caching** — the
  cached prefix costs ~0.1x on reads, so a fixed 30K-token context is cheap
  and you skip the entire retrieval stack.
- **Per-user structured data** ("what did *I* order last month?"): that's a
  \`SELECT ... WHERE user_id = ?\`, not a similarity search. Query the
  database directly and hand the rows to the model. Embedding structured
  records to fuzzy-match them back is slower and less correct than the exact
  query you already know how to write.

Reaching for RAG reflexively is a classic tell. The strong answer names the
cheaper alternative first and uses RAG when the shape of the data actually
demands it.
`,

  comparisons: [
    {
      label: "Monolithic doEverything() vs separated ingest() and answer()",
      intro:
        "The left version embeds the entire corpus on every question — the single most common RAG mistake. The right splits the offline and online phases so vectors are computed once.",
      php: `// First attempt: one function does everything, every request
async function doEverything(question: string) {
  const docs = await db.query("SELECT body FROM documents");

  // Re-embeds the WHOLE corpus on every single question:
  // N API calls + cost, every time, for vectors that never change.
  const vectors = await Promise.all(
    docs.map((d) => embed(d.body)),
  );

  const queryVec = await embed(question);
  const scored = vectors
    .map((v, i) => ({ doc: docs[i], score: cosine(queryVec, v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return callModel(question, scored.map((s) => s.doc.body));
}`,
      ts: `// Production: ingest offline once, answer online from the store

// --- runs in a cron/queue job when documents change ---
async function ingest(docs: { id: string; body: string }[]) {
  for (const doc of docs) {
    for (const chunk of chunkText(doc.body)) {
      const vector = await embed(chunk);          // paid once
      await store.upsert({ docId: doc.id, chunk, vector });
    }
  }
}

// --- runs per request; embeds only the question ---
async function answer(question: string) {
  const queryVec = await embed(question);         // one short string
  const hits = await store.search(queryVec, 5, 0.7);
  if (hits.length === 0) return "I couldn't find that in the docs.";
  return callModel(buildGroundedPrompt(question, hits));
}`,
      note:
        "The store is the seam between the two clocks: ingest writes vectors slowly and rarely; answer reads them fast and often. Merging the two re-pays the embedding cost on every request.",
    },
    {
      label: "Stuffing the full corpus vs retrieval under a token budget",
      intro:
        "Same question, two ways to build context. The cost difference is computed inline — it's the number that justifies the retrieval stack.",
      php: `// First attempt: paste the entire corpus into context
const corpus = await db.query("SELECT body FROM documents");
const context = corpus.map((d) => d.body).join("\\n\\n");

// Say the corpus is 200,000 tokens. At $3 / MTok input:
//   200_000 / 1_000_000 * 3 = $0.60  PER QUESTION
// plus latency to process 200K tokens on every call.
const res = await callModel(context + "\\n\\nQ: " + question);`,
      ts: `// Production: retrieve a few chunks under a token budget
const queryVec = await embed(question);
const hits = await store.search(queryVec, 5, 0.7);
const context = hits.map((h, i) => "[" + (i + 1) + "] " + h.chunk).join("\\n\\n");

// ~2,000 tokens of the RELEVANT context instead of 200,000:
//   2_000 / 1_000_000 * 3 = $0.006  per question  (~100x cheaper)
// and the model answers better from a short, on-topic context.
const res = await callModel(buildGroundedPrompt(question, hits));`,
      note:
        "For a SMALL stable corpus the left side + prompt caching (~0.1x on cache reads) can be the right call — retrieval is the answer when the corpus is too big to cache economically.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A whole RAG pipeline in miniature: ingest 5 toy documents (chunk + toy-embed + store), then answer one query through retrieve → grounded-prompt → a canned grounded response. Every stage prints its artifact so you can see the data flow end to end.",
    code: `// End-to-end RAG on toy data. 4-D embeddings; the axes roughly mean
// [billing, shipping, account, misc]. No real API — the model turn is canned.

type Stored = { docId: string; chunk: string; vector: number[] };

// ---- INGEST (offline phase) --------------------------------------------
const documents = [
  { id: "billing", body: "Refunds go to the original payment method in 5 days." },
  { id: "shipping", body: "Orders placed before 2pm ship the same day." },
  { id: "shipping2", body: "Tracked courier delivery takes 2 to 3 business days." },
  { id: "account", body: "Reset your password from the account settings page." },
  { id: "about", body: "Our office dog is named Biscuit." },
];

// Toy embedder: score a string on each topic axis by keyword hits.
function toyEmbed(text: string): number[] {
  const t = text.toLowerCase();
  const has = (w: string) => (t.includes(w) ? 1 : 0);
  return [
    has("refund") + has("payment") + has("billing"),
    has("ship") + has("courier") + has("delivery") + has("order"),
    has("password") + has("account") + has("settings"),
    has("dog") + has("office"),
  ];
}

const store: Stored[] = [];
function ingest() {
  for (const doc of documents) {
    // Real ingest would chunk long bodies; these are one chunk each.
    store.push({ docId: doc.id, chunk: doc.body, vector: toyEmbed(doc.body) });
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  return ma && mb ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : 0;
}

// ---- QUERY (online phase) ----------------------------------------------
function retrieve(queryVec: number[], k: number, minScore: number) {
  return store
    .map((s) => ({ ...s, score: cosine(queryVec, s.vector) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

function buildGroundedPrompt(question: string, hits: { chunk: string }[]): string {
  const sources = hits.map((h, i) => "[" + (i + 1) + "] " + h.chunk).join("\\n");
  return "Answer using ONLY these sources; cite with [n]; if absent, say so.\\n\\n" +
    "Sources:\\n" + sources + "\\n\\nQuestion: " + question;
}

// ---- RUN IT ------------------------------------------------------------
ingest();
console.log("1. INGESTED " + store.length + " chunks into the store");

const question = "How long does shipping take?";
const queryVec = toyEmbed(question);
console.log("2. QUERY: " + question);
console.log("   query vector: [" + queryVec.join(", ") + "]");

const hits = retrieve(queryVec, 2, 0.4);
console.log("3. RETRIEVED " + hits.length + " chunk(s):");
hits.forEach((h, i) => console.log("   [" + (i + 1) + "] " + h.score.toFixed(2) + " " + h.chunk));

const prompt = buildGroundedPrompt(question, hits);
console.log("4. GROUNDED PROMPT:\\n" + prompt.split("\\n").map((l) => "   " + l).join("\\n"));

// 5. The model turn is canned here — in production this is callModel(prompt).
const cannedAnswer = "Same-day dispatch before 2pm [1], then 2 to 3 business days by courier [2].";
console.log("5. GROUNDED ANSWER: " + cannedAnswer);`,
  },

  keyPoints: [
    "RAG is two phases with different clocks: offline ingest (chunk → embed → store) and an online query path (embed → retrieve → ground → generate → cite).",
    "Ingestion is a batch job (cron/queue/on-upload) so vectors are computed once; the query path embeds only the short question and reads pre-computed vectors — never embed the corpus inside a request handler.",
    "The store is the seam between the phases — like a DB migration that builds an index (ingest) versus a read query that uses it (answer).",
    "Knobs by stage: chunk size (ingest, requires re-ingest to change), k + threshold (retrieve), grounded prompt (generate) — the last three ship without touching the store.",
    "Skip RAG for a small stable corpus (put it all in the prompt with caching) or per-user structured data (query the DB directly — that's a `WHERE user_id = ?`, not similarity search).",
    "Retrieval under a token budget is ~100x cheaper per question than stuffing a 200K-token corpus, and models answer better from short, on-topic context.",
  ],

  interview: [
    {
      q: "Walk me through the architecture of a RAG system you'd build.",
      a: "Two phases. Ingestion runs offline — a cron or queue job triggered when documents change: it chunks each document, embeds every chunk with an embedding model, and writes the vectors to a store like pgvector. The query path runs per request and must be fast: embed just the user's question, retrieve the top-k chunks above a similarity threshold, assemble a grounded prompt with numbered sources and a refusal path, call the model, then validate the citations before responding. The store is the boundary — ingest writes vectors slowly and rarely, the query path reads them quickly and often. The mistake I watch for is embedding the corpus inside the request handler, which re-pays the embedding cost on every question.",
    },
    {
      q: "A teammate wants to add RAG for the company's 12-page expense policy. What do you say?",
      a: "That's probably the wrong tool. RAG earns its complexity when the corpus is large, changing, and shared — 12 pages is maybe 15K tokens, small and stable. I'd put the whole policy in the prompt and use prompt caching: the cached prefix costs about a tenth of normal input tokens on reads, so it's cheap on every call, and we skip the entire retrieval stack — no chunking, no embeddings, no vector store, no threshold tuning. Retrieval also can't beat having the full document in context for a doc that small. I'd only reach for RAG here if the policy corpus grew to the point where caching the whole thing stopped being economical.",
    },
    {
      q: "Which RAG parameters can you tune without re-processing your documents?",
      a: "k, the similarity threshold, and the grounded prompt are all query-path changes — I can adjust how many chunks I keep, where the no-answer cutoff sits, or how the prompt is worded, and ship it without touching the store. Chunk size is different: it's an ingestion parameter, so changing it means re-chunking and re-embedding the whole corpus. That asymmetry shapes how I iterate — I tune k, threshold, and the prompt first against an eval set because they're cheap to change, and I only revisit chunking when retrieval quality problems trace back to chunks that are too big and topically muddled or too small to be answerable on their own.",
    },
  ],

  quiz: [
    {
      question:
        "Why is ingestion (chunk → embed → store) run as an offline job rather than inside the query handler?",
      options: [
        "Offline jobs have access to more memory",
        "Embedding is expensive per chunk; doing it in the handler re-embeds the whole corpus on every question",
        "The query handler can't call the embedding API",
        "Vector stores only accept writes from background jobs",
      ],
      answerIndex: 1,
      explain:
        "Embedding a document is an API round-trip per chunk. Ingesting offline computes those vectors once and stores them; the query path then only embeds the short question and reads pre-computed vectors. Embedding the corpus per request re-pays that cost every time and adds latency.",
    },
    {
      question:
        "A user asks 'what did I order last month?'. Why is RAG the wrong tool here?",
      options: [
        "The question is too short to embed",
        "RAG only works on PDF documents",
        "It's per-user structured data — a `SELECT ... WHERE user_id = ?`, not a similarity search",
        "Order history changes too fast to embed",
      ],
      answerIndex: 2,
      explain:
        "Per-user structured records are retrieved exactly by a database query keyed on the user. Embedding them to fuzzy-match later is slower and less correct than the precise query you already know how to write. RAG is for large, changing, shared corpora of unstructured text.",
    },
    {
      question:
        "You want to change how many chunks the model sees per question. Which stage does that touch, and does it require re-ingesting?",
      options: [
        "It changes chunk size — yes, re-ingest",
        "It changes k in the retrieve stage — no, it's a query-path change",
        "It changes the embedding model — yes, re-embed everything",
        "It changes the store schema — yes, re-index",
      ],
      answerIndex: 1,
      explain:
        "k is a retrieval-stage knob on the query path, so you can change it and ship without touching stored vectors. Only chunk size (and the embedding model) are ingestion parameters that force re-processing the corpus.",
    },
  ],
};

export default lesson;
