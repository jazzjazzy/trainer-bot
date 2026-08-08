import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "tools-in-python",
  title: "Tool Use in Python",
  part: "Structured Output & Tools",
  estMinutes: 11,
  summary:
    "The tool loop is a wire protocol, not a language feature: the same ask-execute-return cycle in Python, plus the @beta_tool decorator that generates schemas from your type hints.",

  concept: `
The tool-use protocol is identical in every SDK because it lives on the wire,
not in the language: the model returns \`stop_reason == "tool_use"\` with
\`tool_use\` blocks, your code executes them, and you send back a user message
of \`tool_result\` blocks keyed by \`tool_use_id\`. If you have written the loop
in TypeScript, the Python version is the same choreography with Python idioms —
dicts instead of typed content blocks, \`**block["input"]\` instead of
destructuring.

### The manual loop

\`\`\`python
messages = [{"role": "user", "content": "Weather in Cairo?"}]

for _ in range(MAX_ITERATIONS):
    response = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=1024,
        tools=tools,
        messages=messages,
    )
    # 1. Append the FULL assistant content — text AND tool_use blocks.
    messages.append({"role": "assistant", "content": response.content})

    if response.stop_reason != "tool_use":
        break  # end_turn: done

    # 2. Execute every tool_use block; answer each by id.
    results = []
    for block in response.content:
        if block.type != "tool_use":
            continue
        output = TOOLS[block.name](**block.input)
        results.append({
            "type": "tool_result",
            "tool_use_id": block.id,  # must match the tool_use block
            "content": output,
        })

    # 3. Results go back as a USER message; loop to continue.
    messages.append({"role": "user", "content": results})
\`\`\`

The invariants carry over unchanged: append the assistant content verbatim,
answer every \`tool_use\` with a matching \`tool_result\`, return failures as
\`tool_result\` with \`"is_error": True\` (never raise past the loop), and cap
iterations so a confused model can't loop forever.

### The Pythonic win: @beta_tool

Writing an \`input_schema\` dict by hand is tedious and drifts from the function
it describes. The SDK's beta tool runner reads your **type hints and docstring**
and generates the schema for you:

\`\`\`python
from anthropic import beta_tool

@beta_tool
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return lookup(city)

runner = client.beta.messages.tool_runner(
    model="claude-sonnet-5",
    max_tokens=1024,
    tools=[get_weather],
    messages=[{"role": "user", "content": "Weather in Cairo?"}],
)
final = runner.until_done()
\`\`\`

The decorator turns \`city: str\` into a string property, the docstring into the
tool description, and \`tool_runner\` drives the whole ask-execute-return cycle —
calling \`get_weather\` when the model asks for it and looping until
\`end_turn\`. It is a genuinely Pythonic touch worth naming in an interview: the
schema is derived from the signature, the way a Pydantic model or a dataclass
derives structure from annotations, so there is one source of truth instead of
a hand-maintained dict beside every function.

Learn the manual loop first, though. The runner is a convenience; when a
tool call misbehaves in production you debug at the wire level — the
\`stop_reason\`, the block ids, the \`tool_result\` pairing — and that is the
same in Python and TypeScript alike.
`,

  comparisons: [
    {
      label: "Schema by hand vs @beta_tool",
      intro:
        "Both give the model a get_weather tool. The first hand-writes an input_schema dict that can drift from the function; the second derives it from the type hints and docstring.",
      php: `# first attempt: hand-written schema, kept in sync manually
def get_weather(city):
    return lookup(city)

# The dict must mirror the function — rename the param or
# add one and you have two places to update, easily skewed.
tools = [{
    "name": "get_weather",
    "description": "Get the current weather for a city.",
    "input_schema": {
        "type": "object",
        "properties": {
            "city": {"type": "string"},
        },
        "required": ["city"],
    },
}]

response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=1024,
    tools=tools,
    messages=messages,
)`,
      ts: `# production: the schema IS the signature
from anthropic import beta_tool

@beta_tool
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return lookup(city)

# tool_runner reads the type hints + docstring, generates the
# schema, and drives the loop — one source of truth.
runner = client.beta.messages.tool_runner(
    model="claude-sonnet-5",
    max_tokens=1024,
    tools=[get_weather],
    messages=messages,
)
final = runner.until_done()`,
      note:
        "@beta_tool derives the input_schema from city: str and the description from the docstring — no hand-written dict to keep in sync. The runner then executes get_weather and loops to completion.",
      leftLang: "python",
      rightLang: "python",
    },
    {
      label: "if-chain dispatch vs a registry",
      intro:
        "Both run the tool the model asked for. The first grows an if/elif chain you edit on every new tool; the second maps names to callables so adding a tool is one dict entry.",
      php: `# first attempt: a dispatcher that grows with every tool
for block in response.content:
    if block.type != "tool_use":
        continue
    if block.name == "get_weather":
        output = get_weather(**block.input)
    elif block.name == "get_time":
        output = get_time(**block.input)
    # KeyError-by-omission: a new tool the model can call but
    # this chain forgot silently falls through to no result,
    # orphaning the tool_use.
    results.append({
        "type": "tool_result",
        "tool_use_id": block.id,
        "content": output,
    })`,
      ts: `# production: a registry mapping name -> callable
TOOLS = {
    "get_weather": get_weather,
    "get_time": get_time,
}

for block in response.content:
    if block.type != "tool_use":
        continue
    fn = TOOLS[block.name]        # one lookup, all tools
    output = fn(**block.input)    # **input unpacks the JSON args
    results.append({
        "type": "tool_result",
        "tool_use_id": block.id,
        "content": output,
    })`,
      note:
        "The registry makes 'every tool_use gets a tool_result' structural: an unknown name raises a KeyError you can catch and return as is_error, instead of an if-chain that silently skips it.",
      leftLang: "python",
      rightLang: "python",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "The manual loop in stdlib Python: a tool registry maps names to callables, the model turns are scripted, and the transcript prints each iteration. Predict the two API calls and the final line.",
    code: `# A simulated tool-use loop in Python. The model turns are scripted, but
# every shape matches the real wire format: content blocks with
# type/id/name/input, a stop_reason, and tool_result blocks keyed by id.

# --- the tool registry: name -> callable ------------------------------
def get_weather(city):
    data = {"Melbourne": "14C, raining", "Cairo": "34C, sunny"}
    return data.get(city, "no data for " + city)


def get_time(city):
    data = {"Melbourne": "21:30", "Cairo": "13:30"}
    return data.get(city, "no data for " + city)


TOOLS = {"get_weather": get_weather, "get_time": get_time}

# --- scripted model turns (what messages.create would return) ---------
scripted = [
    {
        "stop_reason": "tool_use",
        "content": [
            {"type": "text", "text": "Let me look that up."},
            {"type": "tool_use", "id": "toolu_01",
             "name": "get_weather", "input": {"city": "Cairo"}},
        ],
    },
    {
        "stop_reason": "end_turn",
        "content": [{"type": "text", "text": "It's 34C and sunny in Cairo."}],
    },
]

calls = 0


def fake_create(messages):
    global calls
    resp = scripted[calls]
    calls += 1
    print(f"--- API call {calls} (history: {len(messages)} messages) ---")
    return resp


# --- the loop ---------------------------------------------------------
messages = [{"role": "user", "content": "What's the weather in Cairo?"}]
MAX_ITERATIONS = 5

for _ in range(MAX_ITERATIONS):
    response = fake_create(messages)
    # append the FULL assistant content verbatim
    messages.append({"role": "assistant", "content": response["content"]})

    if response["stop_reason"] != "tool_use":
        text = next(b["text"] for b in response["content"] if b["type"] == "text")
        print("FINAL:", text)
        break

    # one tool_result per tool_use, matched by id, dispatched via the registry
    results = []
    for block in response["content"]:
        if block["type"] != "tool_use":
            continue
        fn = TOOLS[block["name"]]
        output = fn(**block["input"])
        print(f'ran {block["name"]}({block["input"]}) -> {output}')
        results.append({
            "type": "tool_result",
            "tool_use_id": block["id"],
            "content": output,
        })
    messages.append({"role": "user", "content": results})

print("history is now", len(messages), "messages")`,
    output: `--- API call 1 (history: 1 messages) ---
ran get_weather({'city': 'Cairo'}) -> 34C, sunny
--- API call 2 (history: 3 messages) ---
FINAL: It's 34C and sunny in Cairo.
history is now 4 messages`,
  },

  keyPoints: [
    "The tool-use protocol is identical across SDKs — it is a wire format (stop_reason, tool_use/tool_result blocks, matching ids), so Python and TypeScript differ only in idiom.",
    "The manual loop in Python: append `response.content` verbatim, check `response.stop_reason == \"tool_use\"`, execute each `tool_use` block, and send back a user message of `tool_result` dicts keyed by `tool_use_id`.",
    "`from anthropic import beta_tool` + `@beta_tool` generates the `input_schema` from a function's type hints and docstring — one source of truth, no hand-written dict.",
    "`client.beta.messages.tool_runner(...).until_done()` drives the whole ask-execute-return cycle for you, calling your decorated functions until `end_turn`.",
    "Dispatch tools through a `{name: callable}` registry rather than an if/elif chain — adding a tool is one entry, and an unknown name raises instead of silently orphaning a `tool_use`.",
    "The same invariants apply: verbatim assistant content, one `tool_result` per `tool_use`, `is_error: True` on failure, and a hard iteration cap.",
  ],

  interview: [
    {
      q: "Is tool use different in Python versus TypeScript?",
      a: "Not in substance — the protocol is on the wire, so it is identical. In both, the model returns `stop_reason` of `tool_use` with `tool_use` blocks carrying an id, a name, and JSON input; I execute them and send back a user message of `tool_result` blocks keyed by `tool_use_id`, looping until `end_turn`. Only the idiom changes: Python uses dicts and `**block.input` to unpack the arguments, TypeScript uses typed content blocks and destructuring. Because it is the same protocol, the invariants are the same too — append the assistant content verbatim, answer every `tool_use`, return failures as `is_error`, and cap iterations.",
    },
    {
      q: "What does the @beta_tool decorator give you?",
      a: "It generates the tool's JSON schema from the function's type hints and docstring, so I don't hand-write and maintain an `input_schema` dict beside every function. `@beta_tool` turns `def get_weather(city: str) -> str` with a docstring into a tool whose input schema has a string `city` property and whose description is the docstring. Passed to `client.beta.messages.tool_runner(...)`, the runner then executes the function whenever the model calls it and loops to completion via `until_done()`. It is the Pythonic version of deriving structure from annotations, the same idea as a Pydantic model or dataclass — one source of truth instead of a schema that drifts from the code. It is a beta convenience; I still know the manual loop for debugging.",
    },
  ],

  quiz: [
    {
      question:
        "In the Python manual loop, how do you send a tool's output back to the model?",
      options: [
        "Return it from the tool function and the SDK forwards it automatically",
        "Append a user message whose content is a list of tool_result dicts, each with a tool_use_id matching a tool_use block",
        "Append an assistant message containing the tool output as text",
        "Pass it as the system parameter on the next messages.create call",
      ],
      answerIndex: 1,
      explain:
        "Tool results go back as a user message of tool_result blocks, each keyed to a tool_use_id from the assistant's tool_use blocks. That id pairing is the protocol — the same in Python and TypeScript. The manual loop does not auto-forward return values; that is what tool_runner does.",
    },
    {
      question: "What does @beta_tool generate for you?",
      options: [
        "Retry logic when the tool raises an exception",
        "The input_schema, derived from the function's type hints and docstring",
        "Automatic caching of tool results across requests",
        "A guarantee the model will always call the tool",
      ],
      answerIndex: 1,
      explain:
        "@beta_tool reads the function signature and docstring to build the input_schema and description, so there is no hand-written dict to keep in sync. Used with client.beta.messages.tool_runner, it also drives the execution loop — but its defining job is schema-from-signature.",
    },
    {
      question:
        "Why prefer a {name: callable} registry over an if/elif dispatcher for tools?",
      options: [
        "Registries run tools in parallel automatically",
        "An if-chain that forgets a tool silently skips it, orphaning the tool_use; a registry lookup raises on an unknown name so you can return is_error",
        "The API requires a dict-based dispatcher",
        "Registries avoid the need to append tool_result blocks",
      ],
      answerIndex: 1,
      explain:
        "The registry makes 'every tool_use gets a tool_result' structural: an unknown tool name is a KeyError you can catch and return as is_error, whereas an if/elif chain missing a branch falls through and orphans the tool_use — a protocol violation. It also scales: a new tool is one dict entry.",
    },
  ],
};

export default lesson;
