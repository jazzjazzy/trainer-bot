import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "parallel-and-multi-tool",
  title: "Parallel Calls and Multi-Tool Design",
  part: "Structured Output & Tools",
  estMinutes: 12,
  summary:
    "Current models emit several tool_use blocks in one turn — execute them concurrently and return ALL results in a SINGLE user message — and the shape of your tool surface decides how well the model uses it.",

  concept: `
A single assistant turn can contain **multiple** \`tool_use\` blocks. Current
Claude models do this by default: asked for the weather in three cities, the
model emits three \`tool_use\` blocks at once rather than one per round-trip.
This is a feature — it collapses three sequential API calls into one — but it
breaks code written for the one-tool-at-a-time case.

### Handle all of them, return one message

Two rules, and both matter:

1. **Execute every \`tool_use\` block**, ideally concurrently. Independent
   read-only calls (three weather lookups, two database reads) are a natural
   \`Promise.all\` — you're already waiting on I/O.
2. **Return all \`tool_result\` blocks in a SINGLE user message.** The tempting
   mistake is to answer each tool in its own message. That is a protocol
   violation and, worse, a *silent* one: the model reads it as "parallel calls
   are expensive here" and stops parallelizing on future turns. One assistant
   turn of \`tool_use\` blocks maps to exactly one user turn of \`tool_result\`
   blocks.

\`\`\`ts
// The model's turn held several tool_use blocks.
const toolUses = response.content.filter((b) => b.type === "tool_use");

// Execute concurrently — they're independent I/O.
const results = await Promise.all(
  toolUses.map(async (block) => ({
    type: "tool_result" as const,
    tool_use_id: block.id,
    content: await execute(block.name, block.input),
  })),
);

// ALL results, ONE user message.
messages.push({ role: "user", content: results });
\`\`\`

A failed tool still returns its \`tool_result\` (with \`is_error: true\`) in that
same message — you never drop one, even when a sibling succeeds.

### Designing the tool surface

How well the model uses tools depends less on the loop than on the *set* of
tools you expose. The failure mode is death by a thousand micro-tools:
\`get_user_email\`, \`get_user_name\`, \`get_user_plan\`, \`get_user_signup_date\`…
Ten overlapping tools with fuzzy boundaries make the model hesitate and
mis-pick. A few focused tools with clear descriptions win:

- **Few, well-described tools beat many overlapping ones.** Prefer one
  \`get_user(id, fields)\` over ten single-field getters. The description is
  what the model reads to choose — be prescriptive about *when* to call it,
  not just what it does.
- **Enums for fixed choices.** A \`unit\` parameter with
  \`enum: ["celsius", "fahrenheit"]\` can't come back as \`"C"\` or
  \`"metric"\`.
- **Force a tool when you must.** \`tool_choice: { type: "tool", name: "..." }\`
  makes the model call that specific tool; \`{ type: "any" }\` forces *some*
  tool. Use these for "you must extract structured data now" moments.
- **Disable parallelism when order matters.** Set
  \`disable_parallel_tool_use: true\` inside \`tool_choice\` when steps have
  dependencies (write-then-read, transfer-then-confirm) and must be serialized.

The default — auto tool choice, parallelism on — is right for most read-heavy
work. Reach for the overrides deliberately, not reflexively.
`,

  comparisons: [
    {
      label: "Dropping siblings vs one combined message",
      intro:
        "The assistant turn holds two tool_use blocks. The first version handles the first block and returns, ignoring the second; the second collects every result into one user message.",
      php: `// first attempt: handle the first tool_use, return.
for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  const output = await execute(block.name, block.input);
  messages.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: block.id, content: output }],
  });
  break; // <-- only the first block; the rest are orphaned
}
// The second tool_use is never answered -> 400 on the next
// call. And splitting each result into its own message
// teaches the model to stop making parallel calls.`,
      ts: `// production: execute all, return one user message.
const toolUses = response.content.filter(
  (b) => b.type === "tool_use",
);

const results = await Promise.all(
  toolUses.map(async (block) => ({
    type: "tool_result" as const,
    tool_use_id: block.id,
    content: await execute(block.name, block.input),
  })),
);

// ALL results in a SINGLE user message.
messages.push({ role: "user", content: results });`,
      note:
        "One assistant turn of tool_use blocks -> one user turn of tool_result blocks. Splitting results across messages orphans tool_use ids and quietly suppresses future parallelism.",
    },
    {
      label: "Ten micro-tools vs three focused ones",
      intro:
        "Both expose the same user data to the model. The first splinters it into single-field getters with fuzzy overlap; the second offers focused tools with clear descriptions and an enum.",
      php: `// first attempt: a getter per field
const tools = [
  { name: "get_user_email", description: "email", input_schema: {} },
  { name: "get_user_name", description: "name", input_schema: {} },
  { name: "get_user_plan", description: "plan", input_schema: {} },
  { name: "get_user_signup", description: "signup date", input_schema: {} },
  { name: "get_user_status", description: "status", input_schema: {} },
  // ...and five more. Overlapping, terse descriptions.
];
// The model burns turns picking between near-identical tools
// and sometimes calls the wrong one.`,
      ts: `// production: few tools, clear descriptions, enums
const tools = [
  {
    name: "get_user",
    description:
      "Fetch a user record. Call when you need any profile " +
      "field (email, name, plan, signup date, status).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: ["email", "name", "plan", "signup", "status"],
          },
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  // + search_users, update_user — three tools, no overlap.
];`,
      note:
        "One get_user(id, fields) with an enum beats ten single-field getters: the model chooses faster and more accurately, and the enum keeps field names from drifting.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A parallel tool turn end to end: one assistant turn with two tool_use blocks, both executed with Promise.all, then assembled into the single user message you send back. Predict the printed message shape — how many results, in one message or two?",
    code: `// The model returned ONE assistant turn holding TWO tool_use blocks.
// Goal: execute both concurrently, return both results in ONE user message.

type ToolUse = {
  type: "tool_use";
  id: string;
  name: string;
  input: { city: string };
};
type ToolResult = { type: "tool_result"; tool_use_id: string; content: string };

const assistantTurn: {
  stop_reason: string;
  content: ({ type: "text"; text: string } | ToolUse)[];
} = {
  stop_reason: "tool_use",
  content: [
    { type: "text", text: "I'll check both cities." },
    { type: "tool_use", id: "toolu_A", name: "get_weather", input: { city: "Cairo" } },
    { type: "tool_use", id: "toolu_B", name: "get_weather", input: { city: "Oslo" } },
  ],
};

// A fake async tool — real ones await network/db I/O.
async function getWeather(city: string): Promise<string> {
  const data: Record<string, string> = { Cairo: "34°C sunny", Oslo: "2°C snow" };
  await Promise.resolve();
  return data[city] ?? "no data";
}

// 1. Pull every tool_use block out of the assistant turn.
const toolUses = assistantTurn.content.filter(
  (b): b is ToolUse => b.type === "tool_use",
);
console.log("assistant turn has " + toolUses.length + " tool_use blocks");

// 2. Execute them concurrently. Promise.all keeps array order,
//    so results line up with toolUses regardless of finish time.
const results: ToolResult[] = await Promise.all(
  toolUses.map(async (block) => {
    const output = await getWeather(block.input.city);
    console.log("ran " + block.name + "(" + block.input.city + ") -> " + output);
    return {
      type: "tool_result" as const,
      tool_use_id: block.id,
      content: output,
    };
  }),
);

// 3. ALL results go back in a SINGLE user message.
const userMessage = { role: "user" as const, content: results };

console.log("");
console.log("ONE user message, BOTH results:");
console.log(JSON.stringify(userMessage, null, 2));`,
    output: `assistant turn has 2 tool_use blocks
ran get_weather(Cairo) -> 34°C sunny
ran get_weather(Oslo) -> 2°C snow

ONE user message, BOTH results:
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_A",
      "content": "34°C sunny"
    },
    {
      "type": "tool_result",
      "tool_use_id": "toolu_B",
      "content": "2°C snow"
    }
  ]
}`,
  },

  keyPoints: [
    "Current models emit multiple `tool_use` blocks in one assistant turn by default — your loop must handle all of them, not just the first.",
    "Execute independent tool calls concurrently (e.g. `Promise.all`) — they are usually I/O-bound and safe to parallelize.",
    "Return ALL `tool_result` blocks in a SINGLE user message; splitting them across messages orphans ids AND silently trains the model to stop parallelizing.",
    "A failed tool still returns its `tool_result` (with `is_error: true`) in that same combined message — never drop one because a sibling succeeded.",
    "Design a small, focused tool surface: few well-described tools beat many overlapping micro-tools, and `enum` pins fixed-choice parameters.",
    "Override the defaults deliberately: `tool_choice: { type: \"tool\", name }` forces a specific tool, and `disable_parallel_tool_use: true` serializes calls when order matters.",
  ],

  interview: [
    {
      q: "How do you handle an assistant turn with several tool_use blocks?",
      a: "I collect every `tool_use` block from the response, execute them — concurrently with `Promise.all` when they're independent I/O, which they usually are — and return all the `tool_result` blocks in one user message. The single-message rule matters twice: mechanically, every `tool_use` id must be answered or the next call 400s; behaviorally, splitting the results across multiple user messages teaches the model that parallel calls are costly here, so it stops batching them on later turns. A failed call still gets its `tool_result` with `is_error: true` in that same combined message — I never drop one just because a sibling succeeded.",
    },
    {
      q: "How do you decide what tools to expose to a model?",
      a: "Few, focused, well-described. The model picks tools by reading their descriptions, so overlapping micro-tools — ten single-field getters — make it hesitate and mis-select; one `get_user(id, fields)` with an enum of allowed fields is faster and more accurate. I use `enum` for any fixed-choice parameter so values can't drift, and I write descriptions that say *when* to call the tool, not just what it does. For control I reach for `tool_choice: { type: \"tool\", name }` to force a specific tool when I need structured data now, and `disable_parallel_tool_use: true` when steps have ordering dependencies. But those are deliberate overrides — the default of auto choice with parallelism on is right for most read-heavy work.",
    },
    {
      q: "When would you disable parallel tool use?",
      a: "When the tool calls have dependencies and must run in order. Parallelism is safe for independent reads — several lookups that don't affect each other — but not when one call's effect is a precondition for the next: transfer funds then confirm the balance, write a record then read it back, create a resource then reference its id. Firing those concurrently races them. Setting `disable_parallel_tool_use: true` inside `tool_choice` forces at most one tool per turn, so the model sees each result before deciding the next step. I keep parallelism on by default and only serialize the flows that genuinely need it.",
    },
  ],

  quiz: [
    {
      question:
        "The assistant turn contains three tool_use blocks. How do you return the results?",
      options: [
        "Three separate user messages, one tool_result each",
        "One user message containing all three tool_result blocks",
        "One assistant message containing the three tool_result blocks",
        "A single tool_result summarizing all three outputs",
      ],
      answerIndex: 1,
      explain:
        "One assistant turn of tool_use blocks maps to exactly one user turn of tool_result blocks. Splitting results across messages orphans ids and silently signals the model to stop parallelizing; results are always user-role, never assistant.",
    },
    {
      question:
        "What is the downside of splitting parallel tool_result blocks across multiple user messages (beyond a possible 400)?",
      options: [
        "The model runs slower on subsequent calls",
        "It teaches the model that parallel calls are expensive, so it stops batching them",
        "The tool_use ids expire between messages",
        "Prompt caching is disabled for the conversation",
      ],
      answerIndex: 1,
      explain:
        "Beyond the protocol risk of orphaned ids, splitting results is read by the model as a signal that parallelism isn't wanted here — it degrades to one tool per turn on future turns, losing the round-trip savings.",
    },
    {
      question:
        "You have ten overlapping single-field getters and the model keeps picking the wrong one. Best fix?",
      options: [
        "Add 'CRITICAL: choose the correct tool' to every description",
        "Force tool_choice: any so it always calls something",
        "Consolidate into a few focused tools with clear descriptions and enums for fixed choices",
        "Lower max_tokens so the model deliberates less",
      ],
      answerIndex: 2,
      explain:
        "Tool selection quality comes from a small, well-described surface. Consolidating ten fuzzy getters into a few focused tools (with enums pinning fixed-choice params) removes the ambiguity the model was struggling with — far more effective than aggressive prompt language or forcing a tool.",
    },
  ],
};

export default lesson;
