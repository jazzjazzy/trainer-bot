import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "tool-use-basics",
  title: "Tool Use: Giving the Model Functions",
  part: "Structured Output & Tools",
  estMinutes: 12,
  summary:
    "You declare functions in the tools param; the model replies with stop_reason \"tool_use\" and a structured request to call one — it never runs anything, YOU do — like a webhook asking your server to act.",

  concept: `
Everything so far has been text in, text out. **Tool use** inverts that. You
hand the model a list of functions it may call — each with a name, a
description, and a JSON Schema for its inputs — and instead of answering in
prose, the model can reply with a **structured request** to call one:
\`stop_reason: "tool_use"\` and a \`tool_use\` content block carrying an
\`id\`, the \`name\` of the function, and a validated \`input\` object.

The crucial thing to internalise: **the model never executes anything.** It
does not call your API, hit your database, or send your email. It emits a
typed request and stops. *You* run the code and hand the result back. If
you know PHP, this is a webhook round-trip: an external party POSTs your
server "please do X with these parameters", your server does X and
responds. The model is the caller; your handler is the endpoint.

### The tool definition is API design

\`\`\`ts
const getWeather = {
  name: "get_weather",
  description:
    "Get the current weather for a city. Call this whenever the user " +
    "asks about weather, temperature, or conditions in a named place.",
  input_schema: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name, e.g. 'Sydney'" },
      unit: { type: "string", enum: ["celsius", "fahrenheit"] },
    },
    required: ["city"],
    additionalProperties: false,
  },
};
\`\`\`

The model reads the **description** to decide *whether* and *when* to call
the tool — so write it like documentation for a junior engineer, and be
prescriptive about the trigger, not just the behaviour. "Get the weather"
is weak; "Call this whenever the user asks about weather... in a named
place" tells the model when to reach for it. Recent models reach for tools
conservatively, so a description that states the *when* measurably raises
the should-call rate. Describe every parameter, and use \`enum\` to pin
fields to a fixed set of values.

### tool_choice: who decides

The \`tool_choice\` param controls the model's freedom:

- \`{ type: "auto" }\` — the model decides whether to use a tool (default).
- \`{ type: "any" }\` — it must call *some* tool.
- \`{ type: "tool", name: "get_weather" }\` — it must call *that* tool.
- \`{ type: "none" }\` — it may not use tools this turn.

### strict: true for guaranteed-valid inputs

Add \`strict: true\` **on the tool definition itself** — a sibling of
\`name\`/\`description\`/\`input_schema\`, *not* on \`tool_choice\` — and the
API constrains generation so \`tool_use.input\` conforms to your schema
exactly. It requires \`additionalProperties: false\` and a \`required\`
list. Without it you can still get a malformed \`input\`; with it, the
inputs you dispatch on are structurally trustworthy.

### Reading the response

A tool-use turn is a mix of blocks — often a line of text, then the
\`tool_use\` block. Branch on \`stop_reason === "tool_use"\`, then on
\`block.name\`, and run the matching handler with \`block.input\`. Sending
the result *back* so the model can turn it into a final answer is the
**tool loop** — the next section. Here the point is the shape: a declared
tool and a typed request beat scraping intent out of prose.
`,

  comparisons: [
    {
      label: "Scraping intent from prose vs a declared tool",
      intro:
        "The user asks for the weather. Without tools you can only parse the model's sentence and guess; with a tool the model hands you a typed call you dispatch directly.",
      php: `// first attempt: no tools — mine the prose for intent
const msg = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "What's the weather in Sydney?" }],
});

// The reply is a sentence like:
//   "I'll look up the weather for Sydney for you."
// Now regex the city out of free text and hope the phrasing
// never changes. There is no id, no schema, no guarantee.
const text = msg.content[0].text;
const city = /weather (?:in|for) (\\w+)/i.exec(text)?.[1]; // fragile`,
      ts: `// production: declare the tool, get a typed request back
const msg = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  tools: [getWeather],
  messages: [{ role: "user", content: "What's the weather in Sydney?" }],
});

// stop_reason tells you the model wants to act:
if (msg.stop_reason === "tool_use") {
  const call = msg.content.find((b) => b.type === "tool_use");
  // call.name  -> "get_weather"
  // call.input -> { city: "Sydney" }  (validated against the schema)
  const result = await runWeather(call.input);
  // ...hand result back to the model (next section: the tool loop)
}`,
      note: "The prose version has no structure to rely on — the model \"saying\" it will search is not a call. tool_use gives you a stable id, a name to dispatch on, and a schema-shaped input.",
    },
    {
      label: "A vague description vs a prescriptive one",
      intro:
        "Same function, two definitions. The model only sees the description and schema — so those decide whether it calls the tool at the right moment and with valid arguments.",
      php: `// first attempt: the model has to guess when and how
const searchOrders = {
  name: "search_orders",
  description: "Search orders.", // when? by what? which statuses?
  input_schema: {
    type: "object",
    properties: {
      q: { type: "string" }, // q of what? free text?
      status: { type: "string" }, // any string at all
    },
  },
};
// Result: over- or under-triggers, and status arrives as
// "kinda shipped" or "DONE" or whatever the model invents.`,
      ts: `// production: the description is documentation; enums pin values
const searchOrders = {
  name: "search_orders",
  description:
    "Look up a customer's orders by email or order number. Call this " +
    "whenever the user asks about the status, contents, or history of " +
    "an order. Do NOT call it for product questions unrelated to an " +
    "existing order.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "An email address or an order number like 'ORD-4021'",
      },
      status: {
        type: "string",
        enum: ["pending", "shipped", "delivered", "cancelled"],
        description: "Optional filter by fulfilment status",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  strict: true, // input is now guaranteed to match the schema
};`,
      note: "The prescriptive description states WHEN to call (and when not to); enums + strict make status one of four legal values instead of whatever the model invents. Tool definitions are an API contract, not a hint.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Two canned assistant turns in the exact wire shape the API returns for tool use. Watch how you branch on stop_reason, then dispatch on block.name with the typed input — the model requested the calls; your handlers run them.",
    code: `// Tool use inverts control: you declare functions, the model emits a
// STRUCTURED REQUEST to call one (it never runs anything), and you
// dispatch to the matching handler — like a webhook asking your
// server to act.

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

type ModelResponse = { stop_reason: string; content: ContentBlock[] };

// What client.messages.create(...) returns when the model wants tools.
// (Two turns here, one per tool, to show dispatch picking each handler.)
const responses: ModelResponse[] = [
  {
    stop_reason: "tool_use",
    content: [
      { type: "text", text: "Let me check that for you." },
      {
        type: "tool_use",
        id: "toolu_01A",
        name: "get_weather",
        input: { city: "Sydney", unit: "celsius" },
      },
    ],
  },
  {
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "toolu_02B",
        name: "create_ticket",
        input: { title: "Payment page 500s", severity: 2 },
      },
    ],
  },
];

// Your handlers — the code the model asked you to run.
function getWeather(input: { city: string; unit?: string }): string {
  return "18 degrees " + (input.unit ?? "celsius") + " in " + input.city;
}
function createTicket(input: { title: string; severity: number }): string {
  return "ticket #4021 opened (sev " + input.severity + "): " + input.title;
}

for (const response of responses) {
  if (response.stop_reason !== "tool_use") continue;

  for (const block of response.content) {
    if (block.type !== "tool_use") continue; // skip the text block

    console.log("model requested tool: " + block.name);
    console.log("  id:    " + block.id);
    console.log("  input: " + JSON.stringify(block.input));

    let result: string;
    switch (block.name) {
      case "get_weather":
        result = getWeather(block.input as { city: string; unit?: string });
        break;
      case "create_ticket":
        result = createTicket(block.input as { title: string; severity: number });
        break;
      default:
        result = "unknown tool: " + block.name;
    }

    console.log("  you run it -> " + result);
    // Next section: send this back as a tool_result so the model
    // can turn it into a final, natural-language answer.
  }
}`,
  },

  keyPoints: [
    "Tool use inverts the flow: you declare functions in the `tools` param, and the model replies with `stop_reason: \"tool_use\"` and a `tool_use` block containing an `id`, `name`, and validated `input`.",
    "The model never executes anything — it emits a structured request and stops. YOU run the code and return the result, exactly like handling a webhook round-trip.",
    "Write the tool `description` like API docs: be prescriptive about WHEN to call it (recent models reach for tools conservatively), describe every parameter, and use `enum` for fixed value sets.",
    "`tool_choice` controls freedom: `auto` (default, model decides), `any` (must use some tool), `{ type: \"tool\", name }` (must use that one), `none` (no tools this turn).",
    "`strict: true` goes ON THE TOOL DEFINITION (a sibling of name/description/input_schema), not on `tool_choice`, and needs `additionalProperties: false` + `required` — it guarantees `input` matches your schema.",
    "Dispatch by branching on `stop_reason === \"tool_use\"`, then on `block.name`; sending the result back to the model is the tool loop (the next section).",
  ],

  interview: [
    {
      q: "Explain how tool use works with the Claude API — who runs the tool?",
      a: "You declare tools in the `tools` parameter: each has a `name`, a `description`, and a JSON Schema `input_schema`. When the model decides a tool is needed, it doesn't run anything — it returns `stop_reason: \"tool_use\"` and a `tool_use` content block with an `id`, the tool's `name`, and an `input` object matching the schema. My code executes the actual function and sends the output back as a `tool_result` so the model can produce a final answer. The mental model I use is a webhook round-trip: the model is the caller asking my server to perform an action with specific parameters, and my handler is the endpoint. The model proposes; my code disposes.",
    },
    {
      q: "What makes a good tool definition?",
      a: "Treat it as API design, because the model only sees the name, description, and schema. The description is the highest-leverage part: I write it like docs for a junior engineer and I'm prescriptive about *when* to call the tool, not just what it does — 'Call this whenever the user asks about the status of an existing order' rather than 'Search orders'. Recent models are conservative about reaching for tools, so stating the trigger condition measurably raises the should-call rate. I describe every parameter, use `enum` to pin fields to legal values, mark the truly required ones in `required`, and add `strict: true` with `additionalProperties: false` so the inputs I dispatch on are guaranteed to match the schema.",
    },
    {
      q: "What are the tool_choice options and when would you force a specific tool?",
      a: "`auto` is the default — the model decides whether to use a tool at all. `any` forces it to call some tool but leaves the choice to the model. `{ type: \"tool\", name }` forces one specific tool. `none` forbids tools for that turn. I'd force a specific tool when the turn's whole purpose is that action — say an extraction step where I always want `extract_fields` called, so I don't want the model chatting instead. `any` is useful for a router that must dispatch to *some* handler. Most conversational features stay on `auto`, because part of the value is the model knowing when a tool isn't needed. One gotcha worth naming: `strict` is not a `tool_choice` option — it lives on the tool definition.",
    },
  ],

  quiz: [
    {
      question: "When the model wants to use a tool, what actually happens?",
      options: [
        "The API executes the function on Anthropic's servers and returns the result",
        "The response has stop_reason \"tool_use\" and a tool_use block with id/name/input; your code runs the function",
        "The model returns a sentence describing what it would do, which you parse",
        "The SDK automatically calls your local function and hides the round-trip",
      ],
      answerIndex: 1,
      explain:
        "The model never executes your tool. It returns stop_reason \"tool_use\" with a tool_use content block (id, name, validated input); your code runs the actual function and sends the result back — a webhook-style round-trip, with the model as caller and your handler as endpoint.",
    },
    {
      question: "Where does strict: true belong, and what does it require?",
      options: [
        "On tool_choice, and it requires temperature: 0",
        "On the tool definition (beside name/description/input_schema), and it requires additionalProperties: false plus required",
        "On the request's top-level params, and it requires streaming",
        "On each property in input_schema, and it requires an enum",
      ],
      answerIndex: 1,
      explain:
        "strict: true is a field on the tool definition itself — not on tool_choice — and needs additionalProperties: false and a required list. With it, the model's tool_use.input is guaranteed to conform to your schema.",
    },
    {
      question:
        "The model keeps NOT calling a tool that it clearly should. Which change most directly helps?",
      options: [
        "Rename the tool to something shorter",
        "Set tool_choice to none so the model reconsiders",
        "Make the description prescriptive about WHEN to call it, e.g. 'Call this whenever the user asks about X'",
        "Add more properties to the input_schema",
      ],
      answerIndex: 2,
      explain:
        "The model decides from the description. Recent models reach for tools conservatively, so a description that states the trigger condition ('Call this whenever…') rather than only what the tool does gives a measurable lift in the should-call rate. tool_choice: none would forbid the tool entirely.",
    },
  ],
};

export default lesson;
