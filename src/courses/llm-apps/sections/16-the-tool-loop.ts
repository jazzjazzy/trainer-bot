import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "the-tool-loop",
  title: "The Tool Loop: Ask, Execute, Return, Repeat",
  part: "Structured Output & Tools",
  estMinutes: 13,
  summary:
    "Tool use is a loop your code drives: call the API, execute what the model asked for, return results with matching ids, and call again until stop_reason is end_turn.",

  concept: `
The API never executes anything. When Claude decides to use a tool it emits a
\`tool_use\` content block, sets \`stop_reason: "tool_use"\`, and **stops**. Your
code runs the tool and reports back. That makes every tool-using feature —
including every "agent" you will ever build — a **loop**, and the loop lives in
your code, not Anthropic's.

If you've integrated Stripe webhooks in PHP, the choreography is familiar: the
provider says "here's an event, respond when you've handled it", you do the
work, you reply, and the flow continues. Here the "provider" is the model, and
the round-trip happens inside a single request handler instead of across HTTP.

### The loop

\`\`\`ts
const messages: Anthropic.MessageParam[] = [
  { role: "user", content: "What's the weather in Melbourne?" },
];

for (let i = 0; i < MAX_ITERATIONS; i++) {
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    tools,
    messages,
  });

  // 1. Append the FULL assistant content — text AND tool_use blocks.
  messages.push({ role: "assistant", content: response.content });

  if (response.stop_reason !== "tool_use") break; // end_turn: done

  // 2. Execute every tool_use block and answer each one by id.
  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const block of response.content) {
    if (block.type !== "tool_use") continue;
    const output = await execute(block.name, block.input);
    results.push({
      type: "tool_result",
      tool_use_id: block.id, // must match the tool_use block's id
      content: output,
    });
  }

  // 3. Results go back as a USER message; loop to let the model continue.
  messages.push({ role: "user", content: results });
}
\`\`\`

### The four invariants

1. **Append the assistant content verbatim.** The \`tool_use\` block carries the
   \`id\` the next message must answer. Rewriting the content to "just the text"
   breaks the pairing and the API rejects the request.
2. **Every \`tool_use\` gets a matching \`tool_result\`.** The very next user
   message must answer each id — an orphaned \`tool_use\` is a 400 error, not a
   silent degradation. If you also want to add text (extra instructions, say),
   put the \`tool_result\` blocks first in that message's content array.
3. **Failures are results, not exceptions.** If your executor throws, catch it
   and send \`{ type: "tool_result", tool_use_id, content: message, is_error: true }\`.
   The model can then retry with different arguments, pick another tool, or
   explain the problem to the user. Throwing past the loop kills all of that —
   and silently dropping the result violates invariant 2.
4. **Cap the iterations.** A confused model can request tools forever. A
   \`for\` loop with a \`MAX_ITERATIONS\` bound (and ideally a token/cost budget)
   turns "runaway agent" into "degraded answer".

### Exiting the loop

\`stop_reason: "end_turn"\` is the happy exit. Also handle \`max_tokens\` (the
turn was truncated — a \`tool_use\` block may be incomplete, so don't execute
it; retry with a larger budget) and \`pause_turn\` (a long-running turn paused —
send the content back as-is to let it resume).

### The SDK can run the loop for you (beta)

Once you understand the manual loop, the TypeScript SDK offers a convenience
wrapper: \`client.beta.messages.toolRunner()\` with tools defined via
\`betaZodTool\` (a Zod schema plus a \`run\` function). It executes the whole
ask-execute-return cycle and resolves with the final message. Use it for speed;
know the manual loop for debugging and interviews — production incidents
happen at the wire level, not inside the helper.
`,

  comparisons: [
    {
      label: "One call vs the loop",
      intro:
        "Both versions give Claude a get_weather tool and ask about Melbourne. The first treats messages.create like a one-shot function; the second drives the loop to completion.",
      php: `// One call: the model never gets to finish.
const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  tools,
  messages: [{ role: "user", content: "Weather in Melbourne?" }],
});

// stop_reason is "tool_use" — the model is mid-thought,
// waiting for a tool_result that never comes.
const text = response.content.find((b) => b.type === "text");
console.log(text?.text);
// Prints something like: "I'll check the weather for you."
// ...and that's the whole "answer" the user sees.`,
      ts: `// The loop: execute, return, call again until end_turn.
const messages: Anthropic.MessageParam[] = [
  { role: "user", content: "Weather in Melbourne?" },
];

for (let i = 0; i < 5; i++) {
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    tools,
    messages,
  });
  messages.push({ role: "assistant", content: response.content });
  if (response.stop_reason !== "tool_use") break;

  const results = [];
  for (const block of response.content) {
    if (block.type !== "tool_use") continue;
    results.push({
      type: "tool_result" as const,
      tool_use_id: block.id,
      content: await getWeather(block.input),
    });
  }
  messages.push({ role: "user", content: results });
}`,
      note:
        "stop_reason: \"tool_use\" means the turn is unfinished — a single create() call is only ever the first half of a tool conversation.",
    },
    {
      label: "Tool failure: throw vs is_error",
      intro:
        "The weather API is down. One version escalates the exception and the request dies; the other reports the failure to the model, which can adapt.",
      php: `// Executor throws -> whole loop (and request) crashes.
for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  // fetchWeather throws on a 503 from the upstream API…
  const output = await fetchWeather(block.input);
  results.push({
    type: "tool_result",
    tool_use_id: block.id,
    content: output,
  });
}
// User sees a 500 page. The model never learns the tool
// failed, and the conversation is unrecoverable.`,
      ts: `// Failure becomes a tool_result the model can react to.
for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  try {
    const output = await fetchWeather(block.input);
    results.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: output,
    });
  } catch (err) {
    results.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: "weather service unavailable (503)",
      is_error: true,
    });
  }
}
// Next turn, the model apologises, retries, or answers
// from what it already knows — gracefully.`,
      note:
        "is_error: true keeps invariant 2 intact (every tool_use answered) while telling the model the execution failed — never throw past the loop, never silently drop a result.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A complete simulated tool loop: the API responses are scripted, but every shape matches the real wire format. Follow the transcript — call 1 asks for a tool, your code executes it, call 2 delivers the final answer.",
    code: `// The whole tool loop, simulated. The "API" is scripted, but every
// shape — content blocks, ids, stop_reason — matches the real wire format.

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: { city: string } };

interface FakeResponse {
  stop_reason: "tool_use" | "end_turn";
  content: ContentBlock[];
}

// What client.messages.create() would return on each call:
const scriptedTurns: FakeResponse[] = [
  {
    stop_reason: "tool_use",
    content: [
      { type: "text", text: "I'll check the weather for you." },
      {
        type: "tool_use",
        id: "toolu_01",
        name: "get_weather",
        input: { city: "Melbourne" },
      },
    ],
  },
  {
    stop_reason: "end_turn",
    content: [
      { type: "text", text: "It's 14°C and raining in Melbourne — take a coat." },
    ],
  },
];

let calls = 0;
function fakeCreate(messages: unknown[]): FakeResponse {
  calls++;
  console.log("--- API call " + calls + " (sending " + messages.length + " messages) ---");
  return scriptedTurns[calls - 1];
}

// The executor — in production this part is still YOUR code.
function getWeather(city: string): string {
  const data: Record<string, string> = { Melbourne: "14°C, raining" };
  return data[city] ?? "no data for " + city;
}

// ── The loop ───────────────────────────────────────────────────────
const messages: { role: "user" | "assistant"; content: unknown }[] = [
  { role: "user", content: "What's the weather in Melbourne?" },
];

const MAX_ITERATIONS = 5; // invariant: never loop unbounded

for (let i = 0; i < MAX_ITERATIONS; i++) {
  const response = fakeCreate(messages);

  // Invariant: append the FULL assistant content verbatim.
  messages.push({ role: "assistant", content: response.content });

  if (response.stop_reason !== "tool_use") {
    const text = response.content.find((b) => b.type === "text");
    console.log("FINAL: " + (text && text.type === "text" ? text.text : ""));
    break;
  }

  // Invariant: one tool_result for every tool_use, matched by id.
  const results: { type: "tool_result"; tool_use_id: string; content: string }[] = [];
  for (const block of response.content) {
    if (block.type !== "tool_use") continue;
    console.log("model asked for " + block.name + "(" + JSON.stringify(block.input) + ")");
    const output = getWeather(block.input.city);
    console.log("executed locally -> " + output);
    results.push({ type: "tool_result", tool_use_id: block.id, content: output });
  }

  // Results go back as a USER message.
  messages.push({ role: "user", content: results });
}

console.log("history is now " + messages.length + " messages");`,
  },

  keyPoints: [
    "The API never executes tools — `stop_reason: \"tool_use\"` means the model has paused mid-turn, waiting for your code to run the tool and report back.",
    "Append the assistant's FULL content (text and `tool_use` blocks) to history verbatim — the block ids are what the next message must answer.",
    "Every `tool_use` needs a matching `tool_result` (by `tool_use_id`) in the very next user message; an orphaned tool_use is a 400 error.",
    "Failed executions return `tool_result` with `is_error: true` so the model can retry or adapt — never throw past the loop, never silently drop a result.",
    "Always cap iterations (and ideally cost) — a bounded `for` loop turns a runaway agent into a degraded answer.",
    "The beta `client.beta.messages.toolRunner()` with `betaZodTool` runs this loop for you; learn the manual version first because that's where you debug.",
  ],

  interview: [
    {
      q: "Walk me through what happens when Claude uses a tool.",
      a: "The request includes a `tools` array; the model replies with `stop_reason: \"tool_use\"` and one or more `tool_use` content blocks, each carrying an id, a tool name, and JSON input. My code appends that assistant content to history verbatim, executes the tool, and sends a user message containing a `tool_result` block whose `tool_use_id` matches the block's id. Then I call the API again with the grown history, and repeat until `stop_reason` is `end_turn`. The key mental model is that the API is stateless and never executes anything — the loop, the executor, and the safety bounds all live in my code, much like handling a webhook round-trip in PHP.",
    },
    {
      q: "How do you handle a tool that fails mid-loop?",
      a: "I catch the exception in the executor and return a `tool_result` with `is_error: true` and a short description instead of the output. Two reasons: first, the protocol requires every `tool_use` to be answered in the next user message — dropping the result or throwing past the loop produces a 400 or a dead conversation. Second, it turns the failure into information the model can act on: it can retry with corrected arguments, fall back to another tool, or tell the user honestly what happened. In production I also distinguish transient upstream errors (worth retrying myself) from bad arguments (worth sending back so the model self-corrects).",
    },
    {
      q: "How do you stop an agent loop from running away?",
      a: "Hard bounds, enforced by my code rather than the model's judgement. I cap the number of loop iterations, track cumulative token usage from each response's `usage` field against a per-request budget, and set timeouts on tool executions. When a bound trips, I exit the loop and either return the best partial answer or a clean failure. I also watch `stop_reason` values beyond `tool_use`: `max_tokens` means the turn was truncated (a tool_use block may be incomplete, so I don't execute it — I retry with a larger budget), and `pause_turn` means I should send the turn back to let it resume.",
    },
  ],

  quiz: [
    {
      question:
        "The response has stop_reason: \"tool_use\". What must your next API call include?",
      options: [
        "A new user message restating the original question",
        "The assistant content appended verbatim, then a user message with a tool_result for every tool_use id",
        "Just the tool output as a plain-text user message",
        "A system message containing the tool output",
      ],
      answerIndex: 1,
      explain:
        "The pairing is by id: the assistant turn (kept verbatim, tool_use blocks included) is followed by a user message whose tool_result blocks answer each tool_use_id. Plain text or a restated question breaks the pairing and the API rejects the request.",
    },
    {
      question: "Your tool executor throws because an upstream API returned 503. Best move?",
      options: [
        "Let the exception propagate so the request fails fast",
        "Skip that tool_result and answer the other tools only",
        "Return a tool_result with is_error: true describing the failure",
        "Retry the entire conversation from the first message",
      ],
      answerIndex: 2,
      explain:
        "is_error: true satisfies the every-tool_use-gets-a-tool_result rule AND gives the model a chance to adapt — retry, use another tool, or explain. Skipping the result is a protocol violation; crashing throws away a recoverable conversation.",
    },
    {
      question: "Why does the tool loop need a MAX_ITERATIONS cap?",
      options: [
        "The API rejects conversations longer than 10 turns",
        "Each iteration is an API call that costs tokens, and a confused model can request tools indefinitely",
        "tool_use ids are only unique for the first few turns",
        "The SDK's toolRunner requires it as a parameter",
      ],
      answerIndex: 1,
      explain:
        "Nothing in the protocol stops a model from asking for tools forever, and every lap costs money and latency. A bounded loop (plus a token budget) converts a runaway agent into a controlled, degraded answer. The API imposes no turn limit itself.",
    },
  ],
};

export default lesson;
