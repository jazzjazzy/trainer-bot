import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "retrieval",
  title: "Retrieval: Finding the Right Chunks",
  part: "Embeddings & RAG",
  estMinutes: 12,
  summary:
    "Retrieval is embed-the-query, score-against-stored-vectors, take-top-k — a vector database is just that loop with an index, and production adds thresholds and keyword hybrid search.",

  concept: `
You have a pile of chunks, each with an embedding vector. Retrieval is the
step that answers: *given a user's question, which chunks are relevant?* The
whole algorithm fits in three lines of pseudocode:

\`\`\`text
queryVec = embed(userQuestion)        // SAME embedding model as the chunks
scores   = chunks.map(c => cosine(queryVec, c.vector))
results  = top k chunks by score, above a minimum threshold
\`\`\`

That's it. Everything else — vector databases, ANN indexes, hybrid search —
is engineering around this loop, not a different idea.

### A "vector database" is this loop plus an index

For a few thousand chunks, a linear scan over an in-memory array is
genuinely fine — cosine over small vectors is fast. The scan only becomes a
problem at scale (millions of vectors), and the fix is an **approximate
nearest neighbour (ANN) index** like HNSW: a data structure that finds the
closest vectors without comparing against every row, trading a little recall
for a lot of speed. Same trade a B-tree makes for \`WHERE\` clauses.

You don't need new infrastructure to get one. **pgvector** adds a vector
column type and distance operators to the Postgres you already run:

\`\`\`sql
CREATE TABLE chunks (
  id bigserial PRIMARY KEY,
  source text,
  body text,
  embedding vector(1024)
);
-- <=> is cosine distance; the HNSW index makes it fast
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
\`\`\`

Dedicated vector stores (Pinecone, Qdrant, Weaviate…) earn their place at
serious scale or when you want managed ops — but "we used pgvector because
the data was already in Postgres" is a strong, defensible interview answer.

### top-k is a knob, not a constant

\`k\` (how many chunks you keep) trades recall against cost and noise. Too
small and the answer's chunk gets cut; too large and you pay for tokens the
model ignores — and irrelevant chunks actively *dilute* the good ones.
Typical production values are 3–8 chunks, chosen to fit a **token budget**
for the context section of your prompt, not plucked from the air.

### Thresholds: returning nothing beats returning garbage

Cosine similarity always produces a ranking. Ask your product-docs store
"what's a good lasagne recipe?" and some chunk still comes out on top — it's
just the *least irrelevant* one. If you pass it to the model anyway, you get
a confident answer grounded in noise.

So production retrieval sets a **minimum similarity score**. Nothing clears
the bar → return an empty result, and let the app take a no-answer path
("I couldn't find that in the docs") instead of hallucinating. Where exactly
the bar sits depends on the embedding model — you calibrate it by scoring a
handful of known-good and known-bad query/chunk pairs.

### Hybrid search: vectors miss exact identifiers

Embeddings capture *meaning*, and that's their blind spot: an error code
like \`ERR_PAYMENT_1042\`, a SKU, a function name, or a version string has
almost no semantic content. A keyword index matches it exactly; an embedding
may rank a chunk about a *different* error code just as high.

The production default is **hybrid search**: run a keyword search (Postgres
full-text / BM25) *and* a vector search, then merge the rankings — either a
weighted sum of normalised scores or Reciprocal Rank Fusion (RRF), which
combines the two by rank position. You lived this evolution in PHP already:
\`LIKE '%term%'\` → \`MATCH ... AGAINST\` full-text → and now vectors. Hybrid
just refuses to throw away the earlier steps, because they still catch what
vectors can't.
`,

  comparisons: [
    {
      label: "Dump everything vs top-k under a budget",
      intro:
        "Answering a docs question. The left version pastes the entire corpus into every request; the right retrieves only the best few chunks.",
      php: `// First attempt: the whole corpus rides along on EVERY call
const allDocs = await db.query("SELECT body FROM chunks");
const context = allDocs.map((d) => d.body).join("\\n\\n");
// 200K tokens of context @ $3/MTok = ~$0.60 per question,
// slow to process, and mostly irrelevant to this question.
const res = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{
    role: "user",
    content: context + "\\n\\nQuestion: " + question,
  }],
});`,
      ts: `// Production: embed the query, keep the top-k relevant chunks
const queryVec = await embed(question);      // same model as ingest
const hits = search(queryVec, /* k */ 5, /* minScore */ 0.7);

if (hits.length === 0) {
  return "I couldn't find that in the documentation.";
}
// ~2K tokens of context — the parts that actually matter
const context = hits
  .map((h, i) => "[" + (i + 1) + "] " + h.text)
  .join("\\n\\n");
const res = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: context + "\\n\\nQuestion: " + question }],
});`,
      note:
        "2K tokens instead of 200K is ~100x cheaper per question and faster — and models answer better from a short, relevant context than from a haystack.",
    },
    {
      label: "Trusting the top hit vs a similarity threshold",
      intro:
        "An off-topic question still produces a 'best match' — cosine always ranks something first. Only one version notices the match is bad.",
      php: `// First attempt: whatever ranks first must be relevant, right?
const ranked = store
  .map((c) => ({ ...c, score: cosine(queryVec, c.vector) }))
  .sort((a, b) => b.score - a.score);

// Query: "best lasagne recipe?" against product docs.
// Top hit: the pricing page at score 0.31 — pure noise,
// but it gets sent to the model as "context" anyway.
const context = ranked[0].text;`,
      ts: `// Production: a floor score plus an explicit no-answer path
const MIN_SCORE = 0.7; // calibrated against known query/chunk pairs

const hits = store
  .map((c) => ({ ...c, score: cosine(queryVec, c.vector) }))
  .filter((c) => c.score >= MIN_SCORE)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

if (hits.length === 0) {
  // Returning nothing is a FEATURE: the app says "not found"
  // instead of the model hallucinating from irrelevant text.
  return { answer: null, reason: "no_relevant_sources" };
}`,
      note:
        "Similarity is relative, not absolute — a ranking proves nothing about relevance. The threshold turns 'least irrelevant' into 'actually relevant or nothing'.",
    },
    {
      label: "The in-memory loop vs the same loop in Postgres",
      intro:
        "These are the same algorithm. pgvector moves the scoring loop into the database and backs it with an ANN index — that is all a 'vector database' is.",
      php: `// In-memory linear scan — correct, fine up to ~10^5 chunks
function search(queryVec: number[], k: number) {
  return store
    .map((c) => ({ ...c, score: cosine(queryVec, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}`,
      ts: `-- pgvector: same top-k, indexed, in the Postgres you already run
SELECT id, source, body,
       1 - (embedding <=> $1) AS score  -- <=> is cosine distance
FROM chunks
ORDER BY embedding <=> $1
LIMIT 5;`,
      note:
        "Left is O(n) per query; the HNSW index behind the right makes it roughly O(log n) with slightly approximate results — the classic index trade-off.",
      leftLang: "ts",
      rightLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A complete in-memory vector store: toy 4-dimension embeddings, cosine scoring, and a search(queryVec, k, minScore) with a no-answer path. Watch the off-topic query — it still has a 'best' match, and the threshold is what rejects it.",
    code: `// An in-memory vector store — the whole idea of retrieval in ~40 lines.
// Toy 4-D embeddings; dimensions roughly mean [billing, auth, shipping, misc].

type Chunk = { text: string; vector: number[]; source: string };

const store: Chunk[] = [
  { text: "Refunds are issued to the original payment method within 5 days.",
    vector: [0.9, 0.05, 0.1, 0.1], source: "billing.md" },
  { text: "Invoices are emailed on the 1st of each month.",
    vector: [0.8, 0.1, 0.05, 0.2], source: "billing.md" },
  { text: "Reset your password from the account settings page.",
    vector: [0.05, 0.9, 0.05, 0.15], source: "auth.md" },
  { text: "Orders ship within 2 business days via tracked courier.",
    vector: [0.1, 0.05, 0.9, 0.1], source: "shipping.md" },
  { text: "Our office dog is named Biscuit.",
    vector: [0.05, 0.05, 0.05, 0.9], source: "about.md" },
];

function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function search(queryVec: number[], k: number, minScore: number) {
  return store
    .map((c) => ({ ...c, score: cosine(queryVec, c.vector) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

function report(label: string, queryVec: number[]) {
  console.log("QUERY: " + label);
  // Show the raw ranking first — cosine ALWAYS ranks something on top:
  const ranked = store
    .map((c) => ({ ...c, score: cosine(queryVec, c.vector) }))
    .sort((a, b) => b.score - a.score);
  console.log("  best raw score: " + ranked[0].score.toFixed(3) +
    " (" + ranked[0].source + ")");

  const hits = search(queryVec, 2, 0.7);
  if (hits.length === 0) {
    console.log("  -> no chunk above 0.7: return \\"not found\\", call no model");
  } else {
    hits.forEach((h, i) => {
      console.log("  " + (i + 1) + ". [" + h.score.toFixed(3) + "] " +
        h.source + " — " + h.text);
    });
  }
  console.log("");
}

// A good query: "how do refunds work?" — embeds near the billing axis.
report("how do refunds work?", [0.85, 0.1, 0.05, 0.1]);

// An off-topic query: "best pizza in town?" — embeds near nothing.
// It STILL has a best match (~0.69) — only the threshold saves us.
report("best pizza in town?", [0.25, 0.25, 0.25, 0.25]);`,
  },

  keyPoints: [
    "Retrieval = embed the query with the *same* model as the chunks, cosine-score it against every stored vector, keep the top-k above a threshold.",
    "A vector database is that loop plus an ANN index (e.g. HNSW) for scale — pgvector gives you one inside Postgres with `ORDER BY embedding <=> $1 LIMIT k`.",
    "`k` is a knob tied to a token budget (typically 3–8 chunks): too few misses the answer, too many wastes money and dilutes the context.",
    "Always set a minimum similarity score with a no-answer path — cosine ranks *something* first for every query, including garbage.",
    "Pure vector search misses exact identifiers (error codes, SKUs, function names); hybrid search merges keyword and vector rankings (weighted scores or RRF) and is the production default.",
    "The PHP arc is `LIKE` → `FULLTEXT` → embeddings — hybrid search keeps the earlier steps because they still catch what vectors can't.",
  ],

  interview: [
    {
      q: "What is a vector database, really — and do you always need one?",
      a: "Conceptually it's an array of embeddings plus a scoring loop: embed the query, rank stored vectors by cosine similarity, return the top-k. A dedicated vector database adds an approximate-nearest-neighbour index like HNSW so that lookup doesn't scan every row — the same job a B-tree does for a `WHERE` clause. You don't always need a new system: a linear scan is fine for thousands of chunks, and pgvector puts an indexed vector column inside Postgres, which is what I'd reach for first if the app already runs Postgres. I'd move to a dedicated store for very large corpora or when I want managed scaling, not by default.",
    },
    {
      q: "Why would you apply a minimum-similarity threshold instead of just taking the top hit?",
      a: "Because cosine similarity is relative: every query produces a ranking, so an off-topic question still gets a 'best match' — it's just the least irrelevant chunk, at a low absolute score. If I forward that to the model as context, I get a confident answer grounded in noise, which is worse than no answer. With a threshold, nothing clearing the bar means retrieval returns empty and the app takes an explicit no-answer path — 'I couldn't find that in the docs'. I'd calibrate the threshold empirically by scoring known-relevant and known-irrelevant query/chunk pairs for the specific embedding model, since the right value differs between models.",
    },
    {
      q: "What is hybrid search and why is it the production default?",
      a: "It runs a keyword search (full-text/BM25) and a vector search in parallel and merges the rankings — either a weighted combination of normalised scores or Reciprocal Rank Fusion, which merges by rank position. The reason: embeddings capture meaning, so they're weak on tokens with no semantic content — error codes, SKUs, config keys, version numbers. A user searching `ERR_PAYMENT_1042` needs an exact match, and a keyword index nails it while an embedding might rank a chunk about a different error just as high. Vectors catch paraphrases the keyword side misses; keywords catch identifiers the vector side misses — so production systems use both.",
    },
  ],

  quiz: [
    {
      question:
        "A user asks your product-docs RAG system an off-topic question. What does pure top-k vector retrieval (no threshold) return?",
      options: [
        "An empty result set, because nothing is relevant",
        "An error from the vector store",
        "The k least-irrelevant chunks — cosine always produces a ranking",
        "A random sample of k chunks",
      ],
      answerIndex: 2,
      explain:
        "Similarity scoring is relative: every query yields a ranking, so top-k always returns something. That's exactly why production retrieval adds a minimum-score threshold with a no-answer path — returning nothing beats grounding the model in noise.",
    },
    {
      question:
        "Why does pure vector search struggle with a query like `ERR_PAYMENT_1042`?",
      options: [
        "Error codes are filtered out during embedding",
        "The code carries almost no semantic meaning, so its embedding doesn't reliably distinguish it from similar-looking codes",
        "Vector stores can't index strings containing digits",
        "Embedding models refuse technical tokens",
      ],
      answerIndex: 1,
      explain:
        "Embeddings encode meaning, and an opaque identifier has very little of it — chunks about different error codes can land equally close. A keyword/BM25 search matches the literal token exactly, which is why hybrid search (merging both rankings) is the production default.",
    },
    {
      question: "What does pgvector's HNSW index actually buy you?",
      options: [
        "Exact nearest-neighbour search with no trade-offs",
        "Automatic embedding of new rows",
        "Compression of vectors to save disk space",
        "Approximate nearest-neighbour lookup that avoids scanning every vector, trading a little recall for speed",
      ],
      answerIndex: 3,
      explain:
        "Without an index, each query is a linear scan over all vectors. HNSW finds close vectors without comparing against every row — much faster at scale, at the cost of occasionally missing a true nearest neighbour. It's the classic index trade-off, applied to similarity search.",
    },
  ],
};

export default lesson;
