import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "chunking",
  title: "Chunking: Preparing Documents for Retrieval",
  part: "Embeddings & RAG",
  estMinutes: 12,
  summary:
    "You can't embed a 200-page manual as one vector — chunking splits documents into retrieval-sized pieces, and chunk quality decides RAG quality more than any other knob.",

  concept: `
An embedding is one vector per input, so a 200-page manual embedded whole
becomes a single point — a blurry average of everything it contains, matching
every query weakly and none precisely. Retrieval needs the document broken into
**chunks**: pieces small enough to have a focused meaning, each embedded and
stored separately. Chunk quality decides RAG quality more than the model choice,
the prompt, or any other knob — retrieve the wrong slice and even a perfect
model answers from garbage.

### The size tradeoff

- **Chunks too small** are precise but context-starved. A chunk that's one
  sentence retrieves exactly on topic but may lack the surrounding detail
  needed to actually answer — the "who" is two sentences up, now in a different
  chunk.
- **Chunks too large** are the reverse: they match fuzzily (the vector averages
  several topics) and waste context-window budget when you paste them into the
  prompt.

There's no universal number, but a few hundred to ~1000 tokens is a common
starting range. You tune it against your own documents and queries.

### Baseline: fixed size with overlap

The simplest chunker slices every N characters. Done naively it cuts
mid-sentence, splitting "…within 30 days for a full refund." across two chunks
so neither embeds cleanly. Two fixes make it usable:

- **Overlap.** Each chunk repeats the last slice of the previous one (say
  10–20%), so a fact that straddles a boundary survives intact in at least one
  chunk.
- **Snap to boundaries.** Instead of cutting at an arbitrary character, end
  chunks at a paragraph or sentence break so each piece is a coherent unit.

### Upgrade: structure-aware splitting

Better still, split along the document's own structure. Markdown headings,
paragraphs, and list items are semantic boundaries the author already drew.
Chunking on them keeps each piece topically clean and lets you attach the
heading it came from — a "Returns" chunk never bleeds into "Shipping".

### Attach metadata to every chunk

A bare string chunk loses its provenance. Store each chunk as an object —
\`{ text, source, heading, position }\` — not a naked string. You need this
downstream: to **cite** ("this came from the Returns policy, section 2"), to
**filter** ("only search the current product's docs"), and to **rank** or
de-duplicate. Metadata is cheap to attach at chunk time and impossible to
reconstruct later. Think of it like storing a foreign key and a source column
beside the text rather than the text alone — the join you'll need at query time
only exists if you recorded it at ingest.
`,

  comparisons: [
    {
      label: "Blind slicing vs overlap + boundary snapping",
      intro:
        "Both split a policy document into chunks. The first cuts every 4000 characters wherever it lands; the second overlaps chunks and snaps to paragraph boundaries.",
      php: `// first attempt: slice every N chars, no overlap
function chunk(text: string, size = 4000): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size)); // cuts mid-word
  }
  return chunks;
}

// A sentence spanning the 4000-char boundary is torn in half:
// "...for a full re" | "fund within 30 days..."
// Neither half embeds cleanly, and a query about refund
// windows may match neither chunk well.`,
      ts: `// production: overlap + snap to paragraph boundaries
function chunk(text: string, size = 4000, overlap = 400): string[] {
  const paras = text.split(/\\n\\n+/); // author's own boundaries
  const chunks: string[] = [];
  let buf = "";
  for (const para of paras) {
    if (buf && (buf + "\\n\\n" + para).length > size) {
      chunks.push(buf);
      // carry the tail forward so straddling facts survive
      buf = buf.slice(-overlap);
    }
    buf += (buf ? "\\n\\n" : "") + para;
  }
  if (buf) chunks.push(buf);
  return chunks;
}`,
      note:
        "Splitting on paragraph boundaries keeps each chunk a coherent unit; overlap means a fact on a boundary appears whole in at least one chunk instead of being split across two.",
    },
    {
      label: "Bare strings vs chunks with metadata",
      intro:
        "Both produce chunks to embed. The first returns plain strings; the second carries source and heading so you can cite and filter later.",
      php: `// first attempt: the chunk is just text
const chunks: string[] = splitDocument(manual);

for (const text of chunks) {
  const vec = await embed(text);
  await db.save({ text, vec });
}
// At query time you retrieve text and a vector — but you
// can't say WHERE it came from. No citation, no way to
// filter to one product's docs, no section reference.`,
      ts: `// production: chunk carries its provenance
interface Chunk {
  text: string;
  source: string;   // "returns-policy.md"
  heading: string;  // "Returns"
  position: number; // order within the doc
}

const chunks: Chunk[] = splitDocument(manual); // returns objects

for (const c of chunks) {
  const vec = await embed(c.text);
  await db.save({ ...c, vec }); // text + metadata + vector
}
// Now retrieval can cite ("Returns policy, section 2"),
// filter by source, and order by position.`,
      note:
        "Metadata (source, heading, position) is cheap to record at chunk time and impossible to reconstruct later — it's what powers citations and filtering downstream.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A structure-aware chunker: it splits on markdown headings, packs paragraphs up to a size limit without breaking sentences, carries overlap forward, and tags each chunk with its heading. Predict how the paragraphs group and where the overlap appears.",
    code: `interface Chunk {
  index: number;
  heading: string;
  length: number;
  text: string;
}

const doc = [
  "# Shipping",
  "We ship worldwide in three days.",
  "Tracking is emailed to you.",
  "Express arrives the next day.",
  "# Returns",
  "Returns are accepted for 30 days.",
  "The item must be unused.",
].join("\\n");

// Split into { heading, paragraphs[] } sections on "# " lines.
function sections(text: string): { heading: string; paras: string[] }[] {
  const out: { heading: string; paras: string[] }[] = [];
  let current = { heading: "(none)", paras: [] as string[] };
  for (const line of text.split("\\n")) {
    if (line.startsWith("# ")) {
      if (current.paras.length) out.push(current);
      current = { heading: line.slice(2), paras: [] };
    } else if (line.trim()) {
      current.paras.push(line.trim());
    }
  }
  if (current.paras.length) out.push(current);
  return out;
}

// Pack paragraphs into <= size chunks, snapping at paragraph
// boundaries (never mid-sentence), carrying <= overlap chars forward.
function chunk(text: string, size: number, overlap: number): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  for (const sec of sections(text)) {
    let buf: string[] = [];
    const flush = () => {
      if (!buf.length) return;
      const joined = buf.join(" ");
      chunks.push({ index: index++, heading: sec.heading, length: joined.length, text: joined });
      // carry trailing paragraphs (up to overlap chars) into the next chunk
      const carried: string[] = [];
      let carriedLen = 0;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (carriedLen + buf[i].length > overlap) break;
        carried.unshift(buf[i]);
        carriedLen += buf[i].length;
      }
      buf = carried;
    };
    for (const para of sec.paras) {
      const projected = [...buf, para].join(" ").length;
      if (buf.length && projected > size) flush();
      buf.push(para);
    }
    flush();
    buf = []; // headings are hard boundaries — never span them
  }
  return chunks;
}

const chunks = chunk(doc, 65, 30);
console.log("chunk size <= 65 chars, overlap <= 30 chars");
console.log("");
for (const c of chunks) {
  console.log("[" + c.index + "] heading=" + c.heading + " len=" + c.length);
  console.log('    "' + c.text + '"');
}`,
    output: `chunk size <= 65 chars, overlap <= 30 chars

[0] heading=Shipping len=60
    "We ship worldwide in three days. Tracking is emailed to you."
[1] heading=Shipping len=57
    "Tracking is emailed to you. Express arrives the next day."
[2] heading=Returns len=58
    "Returns are accepted for 30 days. The item must be unused."`,
  },

  keyPoints: [
    "One embedding is one vector, so a whole document embeds to a blurry average — retrieval needs it split into focused chunks. Chunk quality drives RAG quality more than any other knob.",
    "The size tradeoff: too-small chunks are precise but context-starved; too-large chunks match fuzzily and waste context budget. A few hundred to ~1000 tokens is a common starting range to tune.",
    "Fixed-size-with-overlap is the baseline: overlap (10–20%) keeps facts that straddle a boundary intact, and snapping to sentence/paragraph breaks avoids cutting mid-thought.",
    "Structure-aware splitting is the upgrade: split on the document's own headings/paragraphs so each chunk stays topically clean and inherits its heading.",
    "Store chunks as objects with metadata — `{ text, source, heading, position }` — not bare strings. Metadata powers citations, filtering, and ordering downstream.",
    "Metadata is cheap to attach at chunk time and impossible to reconstruct later — record provenance at ingest, like storing a source column beside the text.",
  ],

  interview: [
    {
      q: "Why chunk documents for RAG, and how do you choose a chunk size?",
      a: "An embedding produces one vector per input, so embedding a long document whole gives you a single averaged point that matches everything weakly and nothing precisely — retrieval can't find the relevant passage because there's only one blurry vector. Chunking splits the document into pieces small enough to have focused meaning, each embedded separately. Size is a tradeoff: too small and a chunk is precise but context-starved, missing the surrounding detail needed to answer; too large and it matches fuzzily and eats context-window budget when you paste it into the prompt. There's no universal number — a few hundred to around a thousand tokens is a sane starting range that I tune against my actual documents and query patterns. Chunk quality tends to dominate RAG quality, more than the model or the prompt.",
    },
    {
      q: "What makes a good chunking strategy beyond just fixed size?",
      a: "Two upgrades over blind slicing. First, don't cut mid-sentence — snap chunk boundaries to paragraph or sentence breaks, and add overlap (10–20%) so a fact that straddles a boundary still appears whole in at least one chunk. Second, split along the document's own structure: markdown headings, paragraphs, list items are semantic boundaries the author already drew, so chunking on them keeps each piece topically clean and lets a 'Returns' chunk avoid bleeding into 'Shipping'. And I attach metadata to every chunk — source file, heading, position — as an object rather than a bare string. That provenance is what lets me cite the source, filter retrieval to the right document, and order results later; it's cheap at chunk time and impossible to reconstruct afterward.",
    },
  ],

  quiz: [
    {
      question: "Why can't you embed a 200-page manual as a single vector for retrieval?",
      options: [
        "The embedding API rejects inputs over a fixed length",
        "One vector is a blurry average of the whole document — it matches every query weakly and none precisely",
        "Cosine similarity only works on short text",
        "Large documents cost more to embed than the answer is worth",
      ],
      answerIndex: 1,
      explain:
        "An embedding is one vector per input, so a whole manual collapses to a single averaged point. Retrieval needs focused chunks, each with its own vector, so the relevant passage can be found and returned precisely.",
    },
    {
      question: "What problem does chunk overlap solve?",
      options: [
        "It reduces the total number of chunks to embed",
        "It guarantees every chunk is exactly the same length",
        "A fact that straddles a chunk boundary stays intact in at least one chunk instead of being split across two",
        "It removes the need to store metadata",
      ],
      answerIndex: 2,
      explain:
        "Without overlap, a sentence spanning a boundary is torn across two chunks so neither embeds cleanly. Repeating the tail of each chunk in the next (10–20%) keeps boundary-straddling facts whole in at least one piece.",
    },
    {
      question:
        "Why store each chunk as { text, source, heading, position } instead of a bare string?",
      options: [
        "Objects embed into more accurate vectors than strings",
        "The metadata enables citations, source filtering, and ordering, and can't be reconstructed after chunking",
        "The API requires chunks to be objects",
        "It makes cosine similarity run faster",
      ],
      answerIndex: 1,
      explain:
        "Provenance (source, heading, position) is what lets you cite where an answer came from, restrict retrieval to the right documents, and order results — all needed downstream. It's cheap to record at chunk time and impossible to recover from a naked string later.",
    },
  ],
};

export default lesson;
