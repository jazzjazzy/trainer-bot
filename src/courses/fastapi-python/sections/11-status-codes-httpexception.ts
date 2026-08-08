import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "status-codes-httpexception",
  title: "Status Codes & HTTPException",
  part: "Pydantic & Responses",
  estMinutes: 10,
  summary:
    "Declare success codes on the decorator with status_code=status.HTTP_201_CREATED, and raise HTTPException for error paths — it short-circuits from any depth and returns clean JSON.",

  concept: `
HTTP semantics are part of your API's contract: a create should answer **201**,
a missing resource **404**, a validation failure **422**. FastAPI splits this
cleanly in two: the *success* status code is **declared** on the decorator, and
*error* codes are **raised** as exceptions.

### Declaring the success code

\`\`\`python
from fastapi import FastAPI, status

app = FastAPI()

@app.post("/items/", status_code=status.HTTP_201_CREATED)
async def create_item(name: str):
    return {"name": name}
\`\`\`

The \`status\` module is just named constants (\`status.HTTP_201_CREATED == 201\`)
— use them because \`HTTP_204_NO_CONTENT\` is self-documenting in a way a bare
\`204\` never is, and your editor autocompletes them. Because the code sits on
the decorator, it also lands in the generated OpenAPI docs: Swagger UI shows
201 as this operation's success response without you writing a line of docs.

### Raising errors: HTTPException

For error paths you **raise**, you don't return:

\`\`\`python
from fastapi import HTTPException

items = {"plumbus": {"name": "Plumbus"}}

@app.get("/items/{item_id}")
async def read_item(item_id: str):
    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")
    return items[item_id]
\`\`\`

The client gets \`404\` with body \`{"detail": "Item not found"}\`. \`detail\` isn't
limited to strings — a dict or list is serialised as-is, so structured error
payloads work too.

### Why raise instead of return?

Because exceptions **short-circuit from any depth**. If the not-found check
lives three helpers down, or inside a dependency, a \`return\` would have to be
passed back up through every layer by hand — that's the PHP 4 style of
threading \`false\` return values up a call chain. A raised \`HTTPException\`
aborts the whole request wherever it happens, and FastAPI's built-in handler
turns it into the JSON response. This is exactly Laravel's
\`abort(404, 'Item not found')\`, which also throws under the hood.

### Headers on the error

Some status codes require headers — \`401\` should send \`WWW-Authenticate\`:

\`\`\`python
raise HTTPException(
    status_code=401,
    detail="Invalid credentials",
    headers={"WWW-Authenticate": "Bearer"},
)
\`\`\`

### Telling the docs about your error shapes

Declared success codes appear in OpenAPI automatically, and every endpoint
with request validation gets a **422** entry for free (that's Pydantic's
automatic validation error). Raised \`HTTPException\`s, though, are invisible to
the schema — FastAPI can't know a 404 is possible without running your code.
Document them with \`responses=\`:

\`\`\`python
@app.get(
    "/items/{item_id}",
    responses={404: {"description": "Item not found"}},
)
async def read_item(item_id: str): ...
\`\`\`

You can attach a \`model\` per status code to document the exact error body.
Custom exception *handlers* (turning your own domain exceptions into responses
app-wide) come later in the course — day to day, \`raise HTTPException\` is the
workflow.
`,

  comparisons: [
    {
      label: "Returning 404 for a missing record",
      intro:
        "Both versions answer a lookup for an item that may not exist. The PHP side is Laravel's abort(); vanilla PHP would be http_response_code(404) plus a manual echo and exit.",
      php: `<?php
// Laravel controller
public function show(string $id)
{
    $item = Item::find($id);
    if (! $item) {
        // throws Symfony's NotFoundHttpException under the hood
        abort(404, 'Item not found');
    }
    return response()->json($item);
}

// Vanilla PHP equivalent: do everything yourself
// http_response_code(404);
// header('Content-Type: application/json');
// echo json_encode(['detail' => 'Item not found']);
// exit;`,
      ts: `# app/main.py
from fastapi import FastAPI, HTTPException

app = FastAPI()
items = {"plumbus": {"name": "Plumbus", "price": 3.99}}

@app.get("/items/{item_id}")
async def read_item(item_id: str):
    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")
    return items[item_id]`,
      note:
        "Same idea as abort(): raising ends the request from any depth, and the framework's handler formats the JSON body ({\"detail\": ...}) — no manual header/echo/exit dance.",
    },
    {
      label: "201 Created on the decorator",
      intro:
        "A create endpoint that must answer 201, not 200. Laravel sets the code on the response object; FastAPI declares it as route metadata.",
      php: `<?php
// Laravel controller
public function store(StoreItemRequest $request)
{
    $item = Item::create($request->validated());

    // status set imperatively, per response
    return response()->json($item, 201);
}`,
      ts: `# app/main.py
from fastapi import FastAPI, status
from pydantic import BaseModel

app = FastAPI()

class ItemIn(BaseModel):
    name: str
    price: float

@app.post("/items/", status_code=status.HTTP_201_CREATED)
async def create_item(item: ItemIn):
    return item  # sent with 201, and OpenAPI documents 201`,
      note:
        "Declaring status_code on the decorator means the docs know about it too — Swagger UI shows 201 as the success response. In Laravel that knowledge lives only in the code path.",
    },
    {
      label: "401 with a WWW-Authenticate header, documented in OpenAPI",
      intro:
        "An auth failure that must carry a header, plus telling the schema this endpoint can 404. PHP does both imperatively; FastAPI attaches them to the exception and the decorator.",
      php: `<?php
// Laravel: header goes on the thrown response
public function me(Request $request)
{
    if (! $request->user()) {
        return response()->json(
            ['detail' => 'Invalid credentials'],
            401,
            ['WWW-Authenticate' => 'Bearer']
        );
    }
    return $request->user();
    // The 401/404 possibilities live nowhere machine-readable —
    // your OpenAPI docs (if any) are maintained by hand.
}`,
      ts: `# app/main.py
from fastapi import FastAPI, HTTPException

app = FastAPI()

@app.get(
    "/users/me",
    responses={401: {"description": "Not authenticated"}},
)
async def read_me(token: str = ""):
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"user": "jason"}`,
      note:
        "headers= rides on the exception itself, and responses= puts the error in the generated OpenAPI schema — raised HTTPExceptions are otherwise invisible to the docs.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "HTTPException in miniature: the raise happens two levels below the 'endpoint', yet the wrapper still turns it into a clean status + JSON body. Predict the three response lines, then run it.",
    code: `import json

# A mini HTTPException plus the wrapper FastAPI puts around every
# path operation: raise anywhere in the call stack, get clean JSON.

class HTTPException(Exception):
    def __init__(self, status_code, detail=None, headers=None):
        self.status_code = status_code
        self.detail = detail
        self.headers = headers or {}

FAKE_DB = {
    "plumbus": {"name": "Plumbus", "price": 3.99},
    "portal-gun": {"name": "Portal Gun", "price": 899.0},
}

# A helper two levels below the "endpoint" -- raising here still
# produces the right response, because exceptions travel UP.
def get_item_or_404(item_id):
    if item_id not in FAKE_DB:
        raise HTTPException(status_code=404, detail="Item not found")
    return FAKE_DB[item_id]

# The "path operation" -- never mentions 404 at all.
def read_item(item_id):
    item = get_item_or_404(item_id)
    return {"item_id": item_id, **item}

# What the framework does around your function.
def handle(path):
    item_id = path.rsplit("/", 1)[-1]
    try:
        body = read_item(item_id)
        return 200, json.dumps(body)
    except HTTPException as exc:
        return exc.status_code, json.dumps({"detail": exc.detail})

for path in ("/items/plumbus", "/items/flux-capacitor", "/items/portal-gun"):
    status, body = handle(path)
    print(f"GET {path} -> {status} {body}")`,
    output: `GET /items/plumbus -> 200 {"item_id": "plumbus", "name": "Plumbus", "price": 3.99}
GET /items/flux-capacitor -> 404 {"detail": "Item not found"}
GET /items/portal-gun -> 200 {"item_id": "portal-gun", "name": "Portal Gun", "price": 899.0}`,
  },

  keyPoints: [
    "Success codes are declared on the decorator: `status_code=status.HTTP_201_CREATED` — the `status` constants are self-documenting and flow into the OpenAPI docs.",
    "Error paths **raise** `HTTPException(status_code=404, detail=\"...\")` — the client gets that status with a `{\"detail\": ...}` JSON body; `detail` can be a string, dict, or list.",
    "Raise, don't return: an exception short-circuits from any depth — helpers, services, even dependencies — exactly like Laravel's `abort()` throwing under the hood.",
    "`HTTPException` accepts `headers=`, which you need for codes like 401 (`WWW-Authenticate: Bearer`).",
    "OpenAPI shows the declared success code and the automatic 422 (validation) for free; raised errors must be documented explicitly via `responses={404: {...}}` on the decorator.",
    "Custom app-wide exception handlers exist for domain exceptions, but the everyday workflow is a plain `raise HTTPException`.",
  ],

  interview: [
    {
      q: "How do you return an error like a 404 from a FastAPI endpoint, and why is it raised rather than returned?",
      a: "You `raise HTTPException(status_code=404, detail=\"Item not found\")`, and FastAPI's built-in handler converts it to a response with that status and a JSON body under a `detail` key. Raising matters because it short-circuits: the exception can come from a helper three calls deep or from a dependency, and the request still ends immediately with the right response — no threading error returns back up the stack. It's the same mechanism as Laravel's `abort(404)`, which throws an `HttpException` internally. You can also attach `headers=` to the exception, which is how a 401 carries its `WWW-Authenticate` header.",
    },
    {
      q: "Where does the success status code of a FastAPI endpoint come from, and why put it on the decorator?",
      a: "From the `status_code` parameter of the path-operation decorator, e.g. `@app.post(\"/items/\", status_code=status.HTTP_201_CREATED)`. Putting it there rather than on each response object does two things: every successful return from that function automatically uses the right code, and the code becomes route metadata, so the generated OpenAPI schema and Swagger UI document 201 as the success response. In Laravel I'd write `response()->json($item, 201)` per return, and the docs wouldn't know about it unless I maintained them separately.",
    },
    {
      q: "Your endpoint can raise a 404, but Swagger UI only shows 200 and 422. Why, and how do you fix it?",
      a: "The 200 comes from the decorator's declared success code and the 422 is added automatically for any endpoint with validated input — but a raised `HTTPException` is a runtime code path, so FastAPI can't discover it statically. You declare it with the `responses` parameter: `responses={404: {\"description\": \"Item not found\"}}`, optionally with a `model` to document the exact error body shape. That merges the error into the OpenAPI schema so clients and generated SDKs know the endpoint can 404.",
    },
  ],

  quiz: [
    {
      question:
        "A helper function deep inside your service layer raises HTTPException(status_code=404). What happens to the in-flight request?",
      options: [
        "The exception must be caught in the endpoint and converted to a return value",
        "FastAPI returns a 500 because exceptions from helpers are unhandled",
        "The request ends immediately with a 404 and a {\"detail\": ...} JSON body",
        "Nothing until the endpoint function also returns",
      ],
      answerIndex: 2,
      explain:
        "HTTPException propagates up like any exception and FastAPI's built-in handler converts it into the response — that short-circuit-from-any-depth behaviour is exactly why you raise instead of return, and it works from dependencies too.",
    },
    {
      question:
        "How do you make a POST endpoint respond with 201 Created on success?",
      options: [
        "return response(item, 201) from the function",
        "Set status_code=status.HTTP_201_CREATED in the @app.post() decorator",
        "raise HTTPException(status_code=201, detail=item)",
        "FastAPI infers 201 automatically for all POST routes",
      ],
      answerIndex: 1,
      explain:
        "The success code is declarative route metadata: @app.post(\"/items/\", status_code=status.HTTP_201_CREATED). POST routes default to 200 like everything else; HTTPException is for error paths, not success.",
    },
    {
      question:
        "Which statement about documenting error responses in the OpenAPI docs is true?",
      options: [
        "Raised HTTPExceptions are detected and documented automatically",
        "The 422 validation response must be declared manually on every route",
        "responses={404: {\"description\": ...}} on the decorator adds the error to the schema",
        "Errors cannot appear in the generated schema at all",
      ],
      answerIndex: 2,
      explain:
        "FastAPI documents the declared success code and adds 422 automatically for validated input, but it can't statically see what you might raise — the responses= parameter is how you declare those error shapes, optionally with a model for the body.",
    },
  ],
};

export default lesson;
