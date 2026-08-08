import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "path-parameters",
  title: "Path Parameters & Type-Driven Validation",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "Declare {item_id} in the path and item_id: int in the signature — FastAPI converts, validates, and answers bad input with a structured 422 you never wrote.",

  concept: `
### The type hint does the work

\`\`\`python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/{item_id}")
def read_item(item_id: int):
    return {"item_id": item_id}
\`\`\`

The \`{item_id}\` in the path and the \`item_id: int\` parameter are matched by
name. Every URL segment arrives as a string — \`GET /items/5\` sends the text
\`"5"\` — but your function receives the **int** \`5\`. In PHP you'd write
\`(int) $id\` and hope; here the conversion *is* validation.

### The 422 you get for free

\`GET /items/abc\` never reaches your function. FastAPI answers:

\`\`\`json
{
  "detail": [
    {
      "type": "int_parsing",
      "loc": ["path", "item_id"],
      "msg": "Input should be a valid integer, unable to parse string as an integer",
      "input": "abc"
    }
  ]
}
\`\`\`

Learn this shape — it's the same for path, query, and body errors, and
interviewers like hearing you describe it: \`detail\` is a **list** (all
failures reported at once), each entry has a \`type\` (machine-readable error
code), \`loc\` (a path into the request: where + name), \`msg\` (human text),
and \`input\` (the offending value).

### Route order matters

Routes are matched in declaration order, so fixed paths must come **before**
dynamic ones:

\`\`\`python
@app.get("/users/me")          # declare FIRST
def read_current_user(): ...

@app.get("/users/{user_id}")   # then the catch-all
def read_user(user_id: int): ...
\`\`\`

Declared the other way round, \`/users/me\` would hit \`/users/{user_id}\` and
fail with a 422 ("me" isn't an int). Same discipline as ordering routes in a
Laravel routes file.

### Fixed choices: Enum path params

For a segment with a closed set of values, subclass \`str\` and \`Enum\`:

\`\`\`python
from enum import Enum

class Region(str, Enum):
    eu = "eu"
    us = "us"

@app.get("/stores/{region}")
def stores(region: Region):
    return {"region": region.value}
\`\`\`

\`GET /stores/apac\` is a 422 listing the permitted values, and \`/docs\` renders
a dropdown of them. Inheriting from \`str\` keeps the value JSON-friendly.

### Constraints beyond the type: Annotated + Path()

When \`int\` isn't strict enough, attach metadata with \`Annotated\`:

\`\`\`python
from typing import Annotated
from fastapi import Path

@app.get("/items/{item_id}")
def read_item(
    item_id: Annotated[int, Path(ge=1, title="Item ID")],
):
    return {"item_id": item_id}
\`\`\`

\`ge=1\` rejects zero and negatives (\`gt\`, \`le\`, \`lt\` also exist), and the
title lands in the OpenAPI docs. \`Annotated[int, Path(...)]\` reads as: "an
int, plus extra instructions for whoever processes it" — the type stays a
plain \`int\` for your editor.
`,

  comparisons: [
    {
      label: "A numeric ID segment",
      intro:
        "Fetch an item by numeric ID and reject junk like /items/abc. Laravel constrains the route and still hands you a string; FastAPI's signature does constraint, conversion, and the error response.",
      php: `<?php
// routes/api.php
Route::get('/items/{id}', [ItemController::class, 'show'])
    ->whereNumber('id');   // non-numeric -> 404

// app/Http/Controllers/ItemController.php
class ItemController extends Controller {
    public function show(string $id) {
        // Route params are strings; cast yourself.
        $id = (int) $id;
        return response()->json(['item_id' => $id]);
    }
}`,
      ts: `# main.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/{item_id}")
def read_item(item_id: int):
    # item_id is already an int here.
    return {"item_id": item_id}

# GET /items/abc -> 422 with a detail entry:
# type "int_parsing", loc ["path", "item_id"]`,
      note: "whereNumber() rejects with a bare 404 and still delivers a string; the type hint converts AND produces a machine-readable 422 explaining exactly what was wrong.",
    },
    {
      label: "A closed set of values in the path",
      intro:
        "Only 'eu' and 'us' are valid regions. Both frameworks can bind an enum — compare what the client sees on a bad value.",
      php: `<?php
enum Region: string {
    case Eu = 'eu';
    case Us = 'us';
}

// routes/api.php -- implicit enum binding:
// /stores/apac -> 404, no explanation
Route::get('/stores/{region}',
    function (Region $region) {
        return response()->json([
            'region' => $region->value,
        ]);
    });`,
      ts: `# main.py
from enum import Enum

class Region(str, Enum):
    eu = "eu"
    us = "us"

@app.get("/stores/{region}")
def stores(region: Region):
    return {"region": region.value}

# /stores/apac -> 422: "Input should be
# 'eu' or 'us'" -- and /docs shows a
# dropdown of the allowed values.`,
      note: "Both bind enums, but FastAPI's 422 names the permitted values and the OpenAPI schema documents them — Laravel's implicit binding answers with an unexplained 404.",
    },
    {
      label: "The validation error body",
      intro:
        "What the client actually receives on bad input — Laravel's validator shape next to FastAPI's. You'll be asked to describe one of these in an interview.",
      php: `{
  "message": "The id field must be a number.",
  "errors": {
    "id": [
      "The id field must be a number."
    ]
  }
}`,
      ts: `{
  "detail": [
    {
      "type": "int_parsing",
      "loc": ["path", "item_id"],
      "msg": "Input should be a valid integer, unable to parse string as an integer",
      "input": "abc"
    }
  ]
}`,
      note: "FastAPI's entries carry a machine-readable type code, a loc path saying WHERE in the request (path/query/body + name), and the offending input — richer than a keyed list of message strings.",
      leftLang: "json",
      rightLang: "json",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "FastAPI's matching + conversion layer in miniature: an ordered route table maps param names to types, and resolve() coerces URL segments or collects Pydantic-style error dicts. Predict all five lines — especially /users/me vs /users/abc.",
    code: `# FastAPI's path-matching + conversion layer, simulated.
# Routes are checked IN ORDER; each template maps param names to types.
ROUTES = [
    ("/users/me",        {}),               # literal BEFORE the dynamic route
    ("/users/{user_id}", {"user_id": int}),
    ("/items/{item_id}", {"item_id": int}),
]

def resolve(path):
    segments = path.strip("/").split("/")
    for template, types in ROUTES:
        parts = template.strip("/").split("/")
        if len(parts) != len(segments):
            continue
        params, errors, matched = {}, [], True
        for part, seg in zip(parts, segments):
            if part.startswith("{"):
                name = part[1:-1]
                try:
                    params[name] = types[name](seg)
                except ValueError:
                    errors.append({"type": "int_parsing",
                                   "loc": ["path", name],
                                   "msg": "Input should be a valid integer",
                                   "input": seg})
            elif part != seg:
                matched = False
                break
        if not matched:
            continue
        if errors:
            return 422, {"detail": errors}
        return 200, {"route": template, "params": params}
    return 404, {"detail": "Not Found"}

for path in ["/users/me", "/users/42", "/users/abc", "/items/7", "/nope"]:
    status, body = resolve(path)
    print(f"{path} -> {status} {body}")`,
    output: `/users/me -> 200 {'route': '/users/me', 'params': {}}
/users/42 -> 200 {'route': '/users/{user_id}', 'params': {'user_id': 42}}
/users/abc -> 422 {'detail': [{'type': 'int_parsing', 'loc': ['path', 'user_id'], 'msg': 'Input should be a valid integer', 'input': 'abc'}]}
/items/7 -> 200 {'route': '/items/{item_id}', 'params': {'item_id': 7}}
/nope -> 404 {'detail': 'Not Found'}`,
  },

  keyPoints: [
    "`{item_id}` in the path pairs with the same-named function parameter; the type hint converts the string segment and validates it in one step.",
    "Invalid values never reach your function — FastAPI returns a 422 whose `detail` entries carry `type`, `loc`, `msg`, and `input`.",
    "`loc` is a path into the request (`[\"path\", \"item_id\"]`, `[\"query\", ...]`, `[\"body\", ...]`) — the same error shape everywhere.",
    "Routes match in declaration order: put fixed paths like `/users/me` before dynamic ones like `/users/{user_id}`.",
    "For closed sets of values, use `class Region(str, Enum)` — bad values get a 422 naming the options, and /docs renders a dropdown.",
    "Add constraints and metadata with `Annotated[int, Path(ge=1)]` — numeric bounds (`gt`, `ge`, `lt`, `le`) validated at the edge and documented automatically.",
  ],

  interview: [
    {
      q: "Walk me through what happens when a request hits /items/abc but the handler declares item_id: int.",
      a: "Starlette's router matches the path template and captures the raw segment \"abc\". Before calling my function, FastAPI runs the captured value through Pydantic against the declared type. Parsing \"abc\" as an int fails, so the framework short-circuits with a 422 Unprocessable Entity — my handler never executes. The body is `{\"detail\": [...]}` where each entry has a machine-readable `type` like `int_parsing`, a `loc` of `[\"path\", \"item_id\"]` saying exactly where in the request the failure was, a human `msg`, and the offending `input`. Because `detail` is a list, multiple simultaneous failures are all reported in one response.",
    },
    {
      q: "How do you handle the /users/me vs /users/{user_id} conflict?",
      a: "Declaration order. FastAPI evaluates path operations in the order they're defined, so I declare the fixed `/users/me` route first and the dynamic `/users/{user_id}` after it. Reversed, a request for /users/me would be captured by the dynamic route and fail with a 422 because \"me\" doesn't parse as an int. It's the same rule as ordering routes in a Laravel routes file — specific before generic — just enforced by decorator order in the module.",
    },
    {
      q: "How would you constrain a path parameter to be a positive integer, and where does Annotated fit in?",
      a: "`item_id: Annotated[int, Path(ge=1)]`. `Annotated` is standard Python typing: the first argument is the real type, and the rest is metadata for tools that care. FastAPI reads the `Path(ge=1)` metadata and enforces greater-or-equal-1 at validation time — /items/0 becomes a 422 — while my editor still just sees an `int`. The same constraint also flows into the OpenAPI schema, so the docs advertise the rule. This Annotated style has been the documented default since FastAPI 0.95; the older pattern of putting `Path(...)` in the default value still works but reads as legacy.",
    },
  ],

  quiz: [
    {
      question:
        "With `@app.get(\"/items/{item_id}\")` and `def read_item(item_id: int)`, what does the function receive for GET /items/5?",
      options: [
        "The string \"5\", because URL segments are always strings",
        "The int 5 — FastAPI converts and validates using the type hint",
        "A Request object you extract the param from",
        "A Pydantic model wrapping the value",
      ],
      answerIndex: 1,
      explain:
        "The segment arrives as text, but FastAPI runs it through the declared type before calling your function — conversion and validation in one step. Only if parsing fails does the client get a 422 instead.",
    },
    {
      question:
        "Both /users/me and /users/{user_id} (user_id: int) exist. What happens to GET /users/me if the dynamic route is declared first?",
      options: [
        "FastAPI is smart enough to prefer the literal match",
        "Both handlers run in sequence",
        "The dynamic route captures it and returns a 422, since \"me\" isn't a valid int",
        "The server raises a route-conflict error at startup",
      ],
      answerIndex: 2,
      explain:
        "Matching is strictly in declaration order with no backtracking to a better match — the dynamic route wins, tries to parse \"me\" as int, and fails. Always declare fixed paths before dynamic ones.",
    },
    {
      question: "In a 422 body, what does `\"loc\": [\"path\", \"item_id\"]` tell you?",
      options: [
        "The file path and variable where the error was raised",
        "The failing value came from the URL path, in the parameter named item_id",
        "The route template that matched the request",
        "The location header the client should retry against",
      ],
      answerIndex: 1,
      explain:
        "loc is a path into the request: the first element says which part (path, query, body, header), the rest drill down to the field. It's what makes the error shape machine-actionable for clients and tests.",
    },
    {
      question: "Why declare an enum path param as `class Region(str, Enum)` rather than plain `Enum`?",
      options: [
        "Plain Enum is not allowed as a type hint",
        "Inheriting str makes the values string-comparable and JSON-serialisable, so responses and docs work cleanly",
        "str is required for the route to match at all",
        "It enables case-insensitive matching of the segment",
      ],
      answerIndex: 1,
      explain:
        "Mixing in str means each member IS a string — it serialises to JSON directly and compares naturally with incoming text, while the Enum side gives the closed set that validation and the /docs dropdown are built from.",
    },
  ],
};

export default lesson;
