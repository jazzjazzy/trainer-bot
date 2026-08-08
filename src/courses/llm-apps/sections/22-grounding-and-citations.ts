import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "grounding-and-citations",
  title: "Grounding and Citations",
  part: "Embeddings & RAG",
  estMinutes: 11,
  summary:
    "Retrieved chunks only help if the prompt forces the model to answer from them — numbered sources, an explicit refusal path, and [n] citations turn a hallucination generator into a support tool.",

  concept: `
Retrieval hands you the right chunks. That is *half* the job. If you paste
them into the prompt with "here's some context, use it if helpful", the model
treats them as a suggestion: it will blend chunk facts with its training
data, answer confidently past what the chunks say, and you're back to
hallucinations — now with extra token cost. The fix is the **grounded-answer
prompt**, and it's the highest-leverage prompt template in all of RAG.

### The grounded-answer template

Three ingredients, all mandatory:

\`\`\`text
Answer the question using ONLY the numbered sources below.

Sources:
[1] Refunds are issued to the original payment method within 5 days.
[2] Orders placed before 2pm ship the same day.

Rules:
- Use only facts stated in the sources. Do not add outside knowledge.
- Cite every claim with its source number, like [1].
- If the sources do not contain the answer, reply exactly:
  "I couldn't find this in the documentation."

Question: How long do refunds take?
\`\`\`

1. **Numbered sources.** Numbering gives the model an address for each fact,
   which makes citations possible and makes "which chunk did this come from?"
   auditable.
2. **"ONLY from the sources."** This flips the model's default. Without it,
   the chunks *compete* with training data; with it, they replace it.
3. **A refusal path.** "I don't know" must be an explicitly *permitted*
   output. Models are tuned to be helpful — if the prompt offers no
   acceptable way to decline, the model will improvise an answer rather than
   fail. Giving it exact wording for the miss case is what makes "not in the
   docs" an easy, legal move.

### Why citations matter beyond looking professional

Citations are a *verification hook*. If every claim carries \`[n]\`, then a
human — or a validation step in your code — can check each claim against a
specific chunk. An uncited claim is a red flag your pipeline can detect
mechanically: flag it, strip it, or regenerate. Without markers you can only
verify the whole answer at once, which in practice means you don't.

### Two ways to get citations

**The portable pattern** is what you just saw: ask for \`[n]\` markers in the
prompt, then resolve them in your code with a small parser. It works on any
model from any provider, and you control the rendering (footnotes, links,
hover cards).

**The first-class API feature**: Anthropic supports citations natively. You
send your source as a \`document\` content block with citations enabled:

\`\`\`ts
messages: [{
  role: "user",
  content: [
    {
      type: "document",
      source: { type: "text", media_type: "text/plain", data: chunkText },
      title: "Billing FAQ",
      citations: { enabled: true },
    },
    { type: "text", text: "How long do refunds take?" },
  ],
}]
\`\`\`

The response then interleaves text blocks with **structured citation spans**
— machine-readable objects pointing at the exact passage in the document
that supports each claim, no regex parsing and no risk of the model
inventing a \`[7]\` that doesn't exist. Use the API feature when you're
all-in on Anthropic and want precision; keep the prompt-marker pattern in
your toolkit because it's provider-portable and interview-expected.

### The PHP frame

This is output escaping, in reverse. You never trusted user input on the way
*in*; grounding means not trusting model output on the way *out* unless each
claim points at evidence you supplied. The numbered-source prompt is the
contract; citations are the receipt.
`,

  comparisons: [
    {
      label: "\"Use this if helpful\" vs the strict grounded template",
      intro:
        "Both prompts include the same retrieved chunks. Only one constrains the model to actually answer from them — and gives it a legal way out when they don't contain the answer.",
      php: `// First attempt: context as a polite suggestion
const prompt =
  "Here is some context that might be helpful:\\n" +
  chunks.join("\\n") +
  "\\n\\nQuestion: " + question;

// The model treats the chunks as optional seasoning:
// it blends them with training data, answers questions
// the chunks don't cover, and cites nothing.`,
      ts: `// Production: numbered sources, hard scope, refusal path
const sources = chunks
  .map((c, i) => "[" + (i + 1) + "] " + c.text)
  .join("\\n");

const prompt =
  "Answer the question using ONLY the numbered sources below.\\n\\n" +
  "Sources:\\n" + sources + "\\n\\n" +
  "Rules:\\n" +
  "- Use only facts stated in the sources.\\n" +
  "- Cite every claim with its source number, like [1].\\n" +
  "- If the sources do not contain the answer, reply exactly:\\n" +
  '  "I couldn\\'t find this in the documentation."\\n\\n' +
  "Question: " + question;`,
      note:
        "The refusal line is the part teams forget: without an explicitly permitted 'not found' output, a helpfulness-tuned model will invent an answer rather than decline.",
    },
    {
      label: "Hand-parsed [n] markers vs API structured citations",
      intro:
        "Two ways to know which source backs each claim: parse markers out of the answer text yourself, or let the API return machine-readable citation spans on document blocks.",
      php: `// Portable: ask for [n] in the prompt, parse it yourself
const answer = res.content[0].type === "text" ? res.content[0].text : "";
const cited = new Set<number>();
for (const m of answer.matchAll(/\\[(\\d+)\\]/g)) {
  const n = Number(m[1]);
  if (n < 1 || n > sources.length) {
    console.warn("Model invented source [" + n + "]");
  } else {
    cited.add(n);
  }
}
// Works with any provider; you own rendering and validation.`,
      ts: `// Anthropic-native: document blocks with citations enabled
const res = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{
    role: "user",
    content: [
      {
        type: "document",
        source: { type: "text", media_type: "text/plain", data: chunkText },
        title: "Billing FAQ",
        citations: { enabled: true },
      },
      { type: "text", text: question },
    ],
  }],
});
// Response text blocks carry structured citation objects that
// point at the exact supporting passage — nothing to regex.`,
      note:
        "Structured citations can't reference a nonexistent source and pinpoint exact passages; the [n] pattern is cruder but works on every provider — know both.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Build a grounded prompt from retrieved chunks, then resolve a simulated cited answer back to its sources. The second (bad) answer shows why validating markers matters: the model cites a source that doesn't exist.",
    code: `// Grounded prompt assembly + citation resolution, end to end.

type Source = { title: string; text: string };

const sources: Source[] = [
  { title: "Billing FAQ",
    text: "Refunds are issued to the original payment method within 5 business days." },
  { title: "Shipping policy",
    text: "Orders placed before 2pm ship the same day via tracked courier." },
];

function buildGroundedPrompt(question: string, srcs: Source[]): string {
  const numbered = srcs
    .map((s, i) => "[" + (i + 1) + "] (" + s.title + ") " + s.text)
    .join("\\n");
  return [
    "Answer the question using ONLY the numbered sources below.",
    "",
    "Sources:",
    numbered,
    "",
    "Rules:",
    "- Use only facts stated in the sources.",
    "- Cite every claim with its source number, like [1].",
    "- If the sources do not contain the answer, reply exactly:",
    '  "I couldn\\'t find this in the documentation."',
    "",
    "Question: " + question,
  ].join("\\n");
}

// Resolve [n] markers: collect used sources, flag invented ones.
function resolveCitations(answer: string, srcs: Source[]) {
  const used = new Set<number>();
  const invalid = new Set<number>();
  for (const m of answer.matchAll(/\\[(\\d+)\\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= srcs.length) used.add(n);
    else invalid.add(n);
  }
  const sourceList = [...used]
    .sort((a, b) => a - b)
    .map((n) => "  [" + n + "] " + srcs[n - 1].title);
  return { sourceList, invalid: [...invalid] };
}

console.log("=== The assembled prompt ===");
console.log(buildGroundedPrompt("How long do refunds take?", sources));

// What a grounded model turn looks like (canned for the playground):
const goodAnswer =
  "Refunds go back to the original payment method [1] and arrive " +
  "within 5 business days [1]. Orders placed before 2pm ship the " +
  "same day [2].";

console.log("\\n=== Rendered answer ===");
console.log(goodAnswer);
const good = resolveCitations(goodAnswer, sources);
console.log("Sources:");
good.sourceList.forEach((s) => console.log(s));

// A bad answer citing a source that was never provided:
const badAnswer = "Refunds are instant for premium accounts [3].";
const bad = resolveCitations(badAnswer, sources);
console.log("\\n=== Validating a suspect answer ===");
console.log(badAnswer);
console.log("Invented citations detected: [" + bad.invalid.join(", ") + "]" +
  " -> flag or regenerate instead of showing the user.");`,
  },

  keyPoints: [
    "Retrieved chunks pasted as 'context, use if helpful' get blended with training data — grounding requires 'answer ONLY from the sources' plus numbered sources.",
    "'I don't know' must be an explicitly permitted output with exact wording; helpfulness-tuned models invent answers when the prompt offers no legal way to decline.",
    "Number the sources `[1]`, `[2]`… and require a citation per claim — markers give every claim an auditable address.",
    "Validate markers in code: a citation outside `1..sources.length` means the model invented a source — flag, strip, or regenerate.",
    "Anthropic's native citations (`citations: { enabled: true }` on `document` content blocks) return structured citation spans pointing at exact passages — no parsing, no invented source numbers.",
    "Know both patterns: prompt-level `[n]` markers are provider-portable; API citations are more precise when you're building on Anthropic.",
  ],

  interview: [
    {
      q: "You've built retrieval and the model still hallucinates. What's your grounding strategy?",
      a: "Retrieval alone just puts facts *near* the model — the prompt has to force their use. I use a grounded-answer template: sources numbered `[1]`, `[2]`…, an instruction to answer *only* from those sources, a requirement to cite each claim with its source number, and — critically — an explicit refusal path with exact wording, like 'I couldn't find this in the documentation'. That last part matters because models are tuned toward helpfulness; if declining isn't a permitted output, the model improvises. Then I validate in code: every `[n]` must map to a real source, and uncited or invalidly-cited claims get flagged or regenerated rather than shown to users.",
    },
    {
      q: "How would you implement citations — prompt markers or the API feature?",
      a: "Both exist and I'd choose per project. The portable pattern is prompt-level: ask for `[n]` markers, then a small parser maps them back to source titles and validates that every number corresponds to a provided source. It works on any provider and I control the rendering. Anthropic also has first-class support: you send sources as `document` content blocks with `citations: { enabled: true }`, and the response carries structured citation spans tied to exact passages in the document — machine-readable, and the model can't cite a source that doesn't exist. On an Anthropic-only stack I'd use the native feature for precision; in a provider-agnostic codebase I'd keep the marker pattern.",
    },
    {
      q: "Why is a 'no answer' response considered a success case in a RAG system?",
      a: "Because the alternative is a confident wrong answer, which is the worst outcome a support or docs tool can produce — it erodes trust and creates liability. If retrieval returns nothing above the similarity threshold, or the retrieved sources don't contain the answer, the correct behaviour is a clean 'not found' plus perhaps an escalation path to a human. I design for it explicitly at two layers: the retrieval layer returns empty below threshold, and the prompt layer permits the model to decline with exact wording. In evals I score the no-answer cases separately, because a system that never says 'I don't know' is failing silently.",
    },
  ],

  quiz: [
    {
      question:
        "Why must the grounded-answer prompt explicitly permit an 'I don't know' response?",
      options: [
        "It reduces token usage on failed queries",
        "Helpfulness-tuned models will invent an answer if the prompt offers no acceptable way to decline",
        "The API rejects prompts without a refusal clause",
        "It disables the model's training data entirely",
      ],
      answerIndex: 1,
      explain:
        "Models are optimised to be helpful. If every permitted output is 'an answer', the model produces one even when the sources don't support it. Giving exact refusal wording makes declining an easy, legal move — that's what turns retrieval misses into honest 'not found' responses instead of hallucinations.",
    },
    {
      question:
        "How does Anthropic's first-class citations feature differ from asking for [n] markers in the prompt?",
      options: [
        "It's enabled per-model instead of per-request",
        "It only works with claude-opus-4-8",
        "Sources go in as document content blocks with citations enabled, and the response carries structured citation spans tied to exact passages",
        "It automatically retrieves documents from your vector store",
      ],
      answerIndex: 2,
      explain:
        "With `citations: { enabled: true }` on a `document` content block, the response interleaves text with machine-readable citation objects pointing at the supporting passage — no regex parsing, and no invented source numbers. The [n] marker pattern remains useful because it's provider-portable.",
    },
    {
      question:
        "Your citation resolver finds a [4] marker but you only supplied three sources. What does that indicate?",
      options: [
        "An off-by-one error in your numbering",
        "The API silently added a source",
        "Nothing — models number sources from zero",
        "The model fabricated a citation — the claim it backs is unverified and should be flagged or regenerated",
      ],
      answerIndex: 3,
      explain:
        "A marker outside the range of supplied sources is mechanical proof the model invented evidence. That's the point of numbered citations: they turn 'is this claim grounded?' into a check your code can run, so bad answers get caught before a user sees them.",
    },
  ],
};

export default lesson;
