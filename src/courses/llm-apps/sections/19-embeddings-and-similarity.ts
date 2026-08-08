import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "embeddings-and-similarity",
  title: "Embeddings and Similarity",
  part: "Embeddings & RAG",
  estMinutes: 11,
  summary:
    "Embeddings turn text into vectors where meaning becomes geometry — so 'give me my money back' matches a 'refund' query that LIKE '%refund%' would never find. (Anthropic has no embeddings endpoint; you pair Claude with a dedicated provider.)",

  concept: `
Every search feature you built in PHP eventually hit the same wall:
\`WHERE body LIKE '%refund%'\` finds the word "refund" and nothing else. A
customer who writes "give me my money back" gets zero results, because keyword
search matches *strings*, not *meaning*. \`FULLTEXT\` indexes help with stemming
and word order but still fundamentally match tokens.

**Embeddings** dissolve that wall. An embedding model maps a piece of text to a
vector — a list of numbers, often hundreds or thousands of dimensions — such
that texts with similar *meaning* land near each other in that space. "Refund",
"money back", and "return my payment" cluster together even though they share
no keywords. Semantic similarity becomes geometric closeness.

### Cosine similarity

To ask "how close are these two meanings?" you compare their vectors. The
standard measure is **cosine similarity**: the cosine of the angle between them,
which ignores length and looks only at direction.

\`\`\`ts
function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
\`\`\`

It ranges from 1 (identical direction — same meaning) through 0 (unrelated) to
-1 (opposite). Semantic search is then: embed the query, compute cosine against
every document's embedding, and return the highest scorers.

### Dimensions

Real embeddings have hundreds to a few thousand dimensions — each one a learned
axis of meaning you can't name individually. More dimensions capture more
nuance at the cost of storage and compute. The toy vectors in the playground
use six so you can read them; the mechanism is identical at 1024.

### The operational fact interviewers probe: Anthropic has no embeddings endpoint

Claude generates text and uses tools; it does **not** produce embeddings. There
is no \`client.embeddings.create\`. A production RAG stack therefore pairs Claude
with a **separate** embeddings provider — a dedicated API such as **Voyage AI**,
or an open-source model you host yourself (e.g. a sentence-transformer). You
embed with that provider and generate with Claude. Saying this plainly in an
interview signals you've actually built retrieval, not just read about it.

### Embed once, at ingest — not on every query

Embedding costs money and latency. Documents don't change between reads, so
embed them **once at ingest time** and store the vectors alongside the text.
At query time you embed only the query (one short call) and compare against the
stored document vectors. Re-embedding the whole corpus on every search is the
classic wasteful first cut — it's the difference between indexing a column once
and running a full table scan on every request.
`,

  comparisons: [
    {
      label: "Keyword LIKE vs embed-and-rank",
      intro:
        "A user asks for their money back without using the word 'refund'. The SQL keyword search returns nothing; the embedding search ranks the paraphrase first.",
      php: `-- first attempt: keyword match
SELECT id, body
FROM tickets
WHERE body LIKE '%refund%';

-- The query "give me my money back" contains no "refund",
-- so this returns ZERO rows — even though a refund ticket
-- is exactly what the user means. FULLTEXT helps with
-- stemming and ranking but still matches tokens, not meaning.`,
      ts: `// production: rank by semantic closeness
const queryVec = await embed("give me my money back"); // 3rd-party provider

const ranked = tickets
  .map((t) => ({ ...t, score: cosine(queryVec, t.vec) }))
  .sort((a, b) => b.score - a.score);

// "I want a refund for my order" scores ~0.98 against the
// query even though the two share no keywords — because
// their meanings, not their words, are close.
return ranked.slice(0, 5);`,
      note:
        "LIKE matches strings; cosine matches meaning. The paraphrase with zero shared keywords is the top hit — the exact case keyword search silently misses.",
      leftLang: "sql",
      rightLang: "ts",
    },
    {
      label: "Embed per query vs embed once at ingest",
      intro:
        "Both answer a search query. The first re-embeds the entire corpus on every request; the second embeds documents once at ingest and only embeds the query at search time.",
      php: `// first attempt: re-embed everything, every search
async function search(query: string, docs: Doc[]) {
  const queryVec = await embed(query);
  const scored = [];
  for (const doc of docs) {
    const docVec = await embed(doc.text); // N API calls PER SEARCH
    scored.push({ doc, score: cosine(queryVec, docVec) });
  }
  return scored.sort((a, b) => b.score - a.score);
}
// A 10k-doc corpus = 10k embedding calls on every query.
// Slow, expensive, and the doc vectors never changed.`,
      ts: `// production: embed docs once, store the vectors
// --- at ingest time (once per document) ---
async function ingest(doc: Doc) {
  const vec = await embed(doc.text);
  await db.save({ ...doc, vec }); // store text + vector
}

// --- at query time (one embed call) ---
async function search(query: string) {
  const queryVec = await embed(query);        // 1 call
  const docs = await db.loadAllWithVectors();  // vectors precomputed
  return docs
    .map((d) => ({ d, score: cosine(queryVec, d.vec) }))
    .sort((a, b) => b.score - a.score);
}`,
      note:
        "Document vectors are stable — compute them once at ingest and store them. Query time then embeds only the query, turning N calls per search into one.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Semantic search with hand-made 6-dimensional 'toy embeddings'. The query never contains the word 'refund' — predict which documents rank highest before you run it.",
    code: `// 6 hand-made dimensions, each a rough "semantic feature":
// [ refund, shipping, account, payment, greeting, praise ]
// Real embeddings have hundreds/thousands of these; 6 is readable.
type Vec = [number, number, number, number, number, number];

const docs: { text: string; vec: Vec }[] = [
  { text: "I want a refund for my order", vec: [0.9, 0.1, 0.0, 0.4, 0.0, 0.0] },
  { text: "Give me my money back please", vec: [0.85, 0.0, 0.1, 0.45, 0.0, 0.0] },
  { text: "Where is my package?", vec: [0.0, 0.95, 0.0, 0.0, 0.0, 0.0] },
  { text: "How do I reset my password?", vec: [0.0, 0.0, 0.9, 0.0, 0.1, 0.0] },
  { text: "Thanks, great service!", vec: [0.0, 0.0, 0.0, 0.0, 0.3, 0.9] },
];

// The query is about getting money returned — but never says "refund".
const query = {
  text: "how do I get my money returned",
  vec: [0.8, 0.0, 0.1, 0.5, 0.0, 0.0] as Vec,
};

function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function magnitude(a: Vec): number {
  return Math.sqrt(dot(a, a));
}
function cosine(a: Vec, b: Vec): number {
  return dot(a, b) / (magnitude(a) * magnitude(b));
}

const ranked = docs
  .map((d) => ({ text: d.text, score: cosine(query.vec, d.vec) }))
  .sort((a, b) => b.score - a.score);

console.log('query: "' + query.text + '"');
console.log("(note: the word \\"refund\\" never appears in the query)");
console.log("");
console.log("rank  score   document");
ranked.forEach((r, i) => {
  console.log(
    String(i + 1).padEnd(6) + r.score.toFixed(3).padEnd(8) + r.text,
  );
});`,
    output: `query: "how do I get my money returned"
(note: the word "refund" never appears in the query)

rank  score   document
1     0.997   Give me my money back please
2     0.980   I want a refund for my order
3     0.105   How do I reset my password?
4     0.000   Where is my package?
5     0.000   Thanks, great service!`,
  },

  keyPoints: [
    "Embeddings map text to vectors so that similar *meaning* becomes geometric closeness — the fix for keyword search missing paraphrases like 'give me my money back' for a refund query.",
    "Cosine similarity measures the angle between two vectors: 1 = same direction/meaning, 0 = unrelated, -1 = opposite. Semantic search embeds the query and ranks documents by cosine.",
    "Embedding dimensions are learned axes of meaning — real models use hundreds to thousands; more dimensions capture more nuance at higher storage/compute cost.",
    "Anthropic has NO embeddings endpoint — there is no `client.embeddings.create`. Production pairs Claude (generation) with a dedicated embeddings provider like Voyage AI or a self-hosted open-source model.",
    "Embed documents ONCE at ingest and store the vectors; at query time embed only the query. Re-embedding the corpus per search is the wasteful first cut.",
    "Cosine ignores vector length and compares direction only, so document length doesn't distort relevance the way raw term counts do.",
  ],

  interview: [
    {
      q: "Why use embeddings instead of keyword search, and how does similarity work?",
      a: "Keyword search — `LIKE` or even `FULLTEXT` — matches tokens, so a user who writes 'give me my money back' gets nothing from a `%refund%` query even though that's exactly their intent. Embeddings fix this by mapping text to vectors where semantic similarity is geometric closeness: paraphrases with no shared words still land near each other. To rank results I compute cosine similarity — the cosine of the angle between the query vector and each document vector, ranging from 1 for the same meaning down to -1 for the opposite. Semantic search is then: embed the query, cosine it against the stored document embeddings, and return the top scorers. It's the natural evolution of the full-text search problem I hit constantly in PHP.",
    },
    {
      q: "Does Anthropic provide an embeddings endpoint? How do you build RAG on Claude?",
      a: "No — Claude generates text and uses tools, but there is no embeddings endpoint and no `client.embeddings.create`. So a RAG stack on Claude is two providers: I embed with a dedicated embeddings API such as Voyage AI, or a self-hosted open-source sentence-transformer, and I generate the answer with Claude. At ingest I embed each document once and store the vector next to the text, usually in a vector database or a Postgres column with a vector index. At query time I embed just the query, retrieve the nearest documents by cosine, and pass them to Claude as context. Being explicit that Anthropic has no embeddings endpoint is the tell that you've actually wired up retrieval rather than assumed one API does everything.",
    },
    {
      q: "Where do you compute embeddings — per query or ahead of time?",
      a: "Documents get embedded once, at ingest, and the vectors are stored alongside the text; the query gets embedded at search time. Document content doesn't change between reads, so re-embedding the whole corpus on every search is pure waste — it's the equivalent of a full table scan when you could have indexed the column once. The per-query cost then collapses to a single embedding call for the query plus a vector comparison against the precomputed store. When documents do change, I re-embed just those on update, the same way you'd reindex a changed row.",
    },
  ],

  quiz: [
    {
      question:
        "A user searches 'give me my money back' and your LIKE '%refund%' query returns nothing. What do embeddings change?",
      options: [
        "They add synonyms to the SQL query automatically",
        "They map text to vectors so the paraphrase is geometrically close to refund documents despite sharing no keywords",
        "They make the database case-insensitive",
        "They translate the query into the documents' language",
      ],
      answerIndex: 1,
      explain:
        "Embeddings encode meaning as position in vector space, so 'give me my money back' lands near refund content even with zero shared words. Keyword search matches strings; embedding search matches meaning via cosine similarity.",
    },
    {
      question:
        "You're building semantic search on Claude. Which statement is correct?",
      options: [
        "Call client.embeddings.create on the Anthropic API to embed documents",
        "Anthropic has no embeddings endpoint — pair Claude with a provider like Voyage AI or a self-hosted model",
        "Claude returns an embedding vector in every message response's usage field",
        "Embeddings are generated by setting output_config.format to 'embedding'",
      ],
      answerIndex: 1,
      explain:
        "Anthropic does not offer an embeddings endpoint. Production RAG uses a dedicated embeddings provider (e.g. Voyage AI) or an open-source model for the vectors, and Claude for generation — two separate systems.",
    },
    {
      question: "What does cosine similarity of two embedding vectors measure?",
      options: [
        "The number of words the two texts share",
        "The Euclidean distance between the vectors",
        "The cosine of the angle between them — direction, ignoring length — from 1 (same meaning) to -1 (opposite)",
        "How many dimensions the two vectors have in common",
      ],
      answerIndex: 2,
      explain:
        "Cosine similarity is the cosine of the angle between the vectors, comparing direction and ignoring magnitude. 1 means the same direction (same meaning), 0 unrelated, -1 opposite — which is why it ranks paraphrases highly regardless of text length.",
    },
  ],
};

export default lesson;
