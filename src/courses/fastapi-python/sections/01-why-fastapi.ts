import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-fastapi",
  title: "Why FastAPI: One Source of Truth",
  part: "Foundations",
  estMinutes: 10,
  summary:
    "In FastAPI a single Python type hint drives editor support, runtime validation, serialisation, and the OpenAPI docs — four artefacts you maintain separately in PHP.",

  concept: `
Think about what it takes to add one endpoint to a mature Laravel API. You
write the route, a controller action, a **FormRequest** with validation rules,
maybe a DTO so the rest of the code isn't passing arrays around, an **API
Resource** to shape the JSON output, and — if the team documents its API — an
OpenAPI annotation block that you must remember to update by hand. That's four
or five artefacts describing the *same* contract, and nothing stops them
drifting apart.

FastAPI's core idea is that **the function signature is the contract**:

\`\`\`python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float
    tags: list[str] = []

@app.post("/items/{store_id}")
def create_item(store_id: int, item: Item) -> Item:
    return item
\`\`\`

From those type hints alone, FastAPI derives:

- **Editor support** — \`item.price\` autocompletes as a \`float\`; typos are caught before you run anything.
- **Runtime validation** — \`store_id\` must parse as an int, \`item\` must match the model, or the client gets a structured \`422\` you never wrote.
- **Serialisation** — the return value is filtered and converted to JSON through the declared type.
- **Documentation** — interactive Swagger UI at \`/docs\` (and ReDoc at \`/redoc\`), generated from the same hints. Change the model, the docs change.

One declaration, four outputs. When the code changes, everything changes with
it — there is no stale swagger.yaml because there is no swagger.yaml.

### What's underneath

FastAPI is a thin, clever layer over two libraries you'll be asked about in
interviews. **Starlette** is the ASGI toolkit that handles routing, requests,
responses, middleware, and WebSockets — it's why FastAPI benchmarks among the
fastest Python frameworks. **Pydantic** (v2, with a Rust-powered core) does
the validation and serialisation. FastAPI's own contribution is the dependency
injection system and the machinery that reads your type hints and wires
Starlette and Pydantic together, plus the OpenAPI generation.

### Why job posts ask for it

FastAPI has become the default choice for new Python API services: data/ML
teams expose models with it, and backend teams pick it over Flask for the
built-in validation and docs, and over Django REST Framework when they don't
need Django's ORM and admin. Async support is native, not bolted on.

One honest caveat to know: FastAPI is still **pre-1.0** — current releases are
in the 0.1xx line. In practice it's stable and thoroughly production-proven
(the 0.x numbering is a versioning choice, not a maturity warning), but a
strong candidate knows the version story: say "current FastAPI, the 0.1xx
releases", not "FastAPI 1.x".
`,

  comparisons: [
    {
      label: "One endpoint: the full stack of artefacts",
      intro:
        "Create an item via POST and return it as JSON with validation. Laravel needs a FormRequest plus a Resource plus the controller; FastAPI does all three jobs in one path operation.",
      php: `<?php
// app/Http/Requests/StoreItemRequest.php
class StoreItemRequest extends FormRequest {
    public function rules(): array {
        return [
            'name'  => 'required|string',
            'price' => 'required|numeric',
        ];
    }
}

// app/Http/Resources/ItemResource.php
class ItemResource extends JsonResource {
    public function toArray($request): array {
        return [
            'name'  => $this->name,
            'price' => $this->price,
        ];
    }
}

// app/Http/Controllers/ItemController.php
class ItemController extends Controller {
    public function store(StoreItemRequest $request) {
        $data = $request->validated();
        return new ItemResource(Item::create($data));
    }
}`,
      ts: `# main.py
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float

@app.post("/items")
def create_item(item: Item) -> Item:
    # item is already validated and typed:
    # item.price is a float, guaranteed.
    return item

# The Item model IS the validation rules,
# the DTO, and the response shape -- and it
# appears in /docs automatically.`,
      note: "The Pydantic model plays the role of FormRequest rules, DTO, and API Resource at once — and unlike the Laravel trio, its three roles can never drift out of sync.",
    },
    {
      label: "API documentation: hand-written vs generated",
      intro:
        "Document the endpoint for consumers. In PHP you annotate by hand (swagger-php attributes) and regenerate; FastAPI emits the OpenAPI schema from the code itself.",
      php: `<?php
// Hand-maintained swagger-php attributes --
// nothing checks they match the real code.
#[OA\\Post(
    path: '/items',
    requestBody: new OA\\RequestBody(
        content: new OA\\JsonContent(
            required: ['name', 'price'],
            properties: [
                new OA\\Property(property: 'name',
                    type: 'string'),
                new OA\\Property(property: 'price',
                    type: 'number'),
            ]
        )
    ),
    responses: [new OA\\Response(response: 201,
        description: 'Created')]
)]
public function store(StoreItemRequest $request) { /* ... */ }`,
      ts: `{
  "paths": {
    "/items": {
      "post": {
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/Item"
              }
            }
          }
        }
      }
    }
  }
}`,
      note: "The right side is a fragment of the openapi.json FastAPI serves at runtime, generated from the Item model — rename a field in code and the docs update on the next request.",
      rightLang: "json",
    },
    {
      label: "Who writes the validation error response?",
      intro:
        "A client sends a price that isn't a number. In Laravel you rely on the framework's validator wiring you configured; in FastAPI the 422 falls out of the type hint with no validation code at all.",
      php: `<?php
// Without a FormRequest you validate manually:
public function store(Request $request) {
    $validator = Validator::make($request->all(), [
        'price' => 'required|numeric',
    ]);
    if ($validator->fails()) {
        return response()->json(
            ['errors' => $validator->errors()],
            422
        );
    }
    $price = (float) $request->input('price');
    // ...
}`,
      ts: `# No validation code. The hint is the rule.
@app.post("/items")
def create_item(item: Item) -> Item:
    return item

# POST {"name": "Desk", "price": "cheap"}
# -> 422 with a machine-readable body:
# {"detail": [{"type": "float_parsing",
#   "loc": ["body", "price"],
#   "msg": "Input should be a valid number,
#           unable to parse string as a number",
#   "input": "cheap"}]}`,
      note: "FastAPI's 422 pinpoints each failure with a loc path into the request — clients and tests can rely on that shape, and you never wrote an if.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A mini-FastAPI in ~40 lines of stdlib Python: a decorator registers routes, and typing.get_type_hints reads the signature to generate 'docs' AND coerce/validate a fake request. Predict the three printed lines, then run it.",
    code: `# A mini-FastAPI in 40 lines: the function SIGNATURE is the contract.
# One type hint drives docs, coercion, and validation -- nothing else does.
from typing import get_type_hints

routes = {}

def get(path):                      # our @app.get("/...")
    def decorator(func):
        routes[path] = func
        return func
    return decorator

@get("/items/{item_id}")
def read_item(item_id: int, q: str = ""):
    return {"item_id": item_id, "q": q, "double": item_id * 2}

# 1. The hints generate the "docs" -- no annotations, no swagger.yaml.
for path, func in routes.items():
    hints = get_type_hints(func)
    params = " ".join(f"{n}:{t.__name__}" for n, t in hints.items())
    print(f"GET {path}  ({params})")

# 2. The SAME hints drive coercion + validation of a raw request.
def handle(path, raw_params):
    func = routes[path]
    hints = get_type_hints(func)
    kwargs, errors = {}, []
    for name, raw in raw_params.items():
        try:
            kwargs[name] = hints.get(name, str)(raw)   # "5" -> 5
        except ValueError:
            errors.append({"type": "int_parsing", "loc": ["path", name],
                           "msg": "Input should be a valid integer", "input": raw})
    if errors:
        return 422, {"detail": errors}
    return 200, func(**kwargs)      # handler gets REAL ints, not strings

print(handle("/items/{item_id}", {"item_id": "5", "q": "chair"}))
print(handle("/items/{item_id}", {"item_id": "abc"}))`,
    output: `GET /items/{item_id}  (item_id:int q:str)
(200, {'item_id': 5, 'q': 'chair', 'double': 10})
(422, {'detail': [{'type': 'int_parsing', 'loc': ['path', 'item_id'], 'msg': 'Input should be a valid integer', 'input': 'abc'}]})`,
  },

  keyPoints: [
    "FastAPI's core idea: the path operation's type hints are a single source of truth for editor support, runtime validation, serialisation, and OpenAPI docs.",
    "In PHP those are separate artefacts — FormRequest rules, DTOs, API Resources, swagger annotations — that can silently drift apart; in FastAPI they cannot.",
    "FastAPI = Starlette (ASGI routing/requests/middleware, the speed) + Pydantic v2 (Rust-core validation/serialisation) + FastAPI's own DI and OpenAPI machinery.",
    "Interactive docs come free: Swagger UI at `/docs`, ReDoc at `/redoc`, raw schema at `/openapi.json` — all generated at runtime from the code.",
    "Validation failures return a structured 422 with `detail` entries (`type`, `loc`, `msg`, `input`) that you never have to write.",
    "FastAPI is still pre-1.0 (the 0.1xx release line) yet is a production standard — know that framing for interviews.",
  ],

  interview: [
    {
      q: "Why has FastAPI become so popular, and what is it built on?",
      a: "It solves a real maintenance problem: in most frameworks the validation rules, the serialisation layer, and the API documentation are separate artefacts that drift apart. FastAPI derives all of them from the Python type hints on each path operation, so the contract is defined once, in code. Under the hood it's a thin layer over Starlette — the ASGI toolkit providing routing, requests, and middleware, which is where the performance comes from — and Pydantic v2, whose Rust core does validation and serialisation. FastAPI adds the dependency injection system and the OpenAPI generation. Native async support and the free Swagger UI at /docs sealed its position as the default for new Python API services.",
    },
    {
      q: "FastAPI hasn't reached version 1.0. Would you use it in production?",
      a: "Yes, and most of the Python industry does. Current releases are in the 0.1xx line, but the 0.x numbering reflects the maintainer's versioning approach rather than instability — the framework is years old, extremely widely deployed, and its core APIs have been stable for a long time. The practical implication is that you pin your versions and read release notes when upgrading, since minor releases can carry behavioural changes — which is good discipline for any dependency. I'd contrast that with, say, Pydantic v1 to v2, which was a genuinely breaking migration that the ecosystem has now completed.",
    },
    {
      q: "Coming from Laravel, what replaces FormRequests, API Resources, and swagger annotations?",
      a: "One thing: the Pydantic model plus the path operation signature. Declaring `item: Item` on a POST handler gives me FormRequest-style validation with a structured 422 on failure, a typed DTO — `item.price` is a real float attribute, not an array key — and, via the return type, the response shape that an API Resource would define. The same model is registered in the generated OpenAPI schema, so there are no swagger annotations to maintain. The mental shift is that in Laravel I describe the contract in several places and keep them in sync by discipline; in FastAPI the signature is the contract and everything else is derived.",
    },
  ],

  quiz: [
    {
      question:
        "What does FastAPI derive from the type hints on a path operation?",
      options: [
        "Only editor autocompletion — validation still needs explicit rules",
        "Runtime validation, serialisation, OpenAPI docs, and editor support",
        "Only the OpenAPI documentation",
        "Database schema migrations for the declared models",
      ],
      answerIndex: 1,
      explain:
        "The hints are the single source of truth: FastAPI validates and coerces incoming data against them, serialises responses through them, generates /docs from them, and your editor uses them for completion. Databases are out of scope — that's SQLAlchemy's job later in the course.",
    },
    {
      question: "Which two libraries does FastAPI build on, and for what?",
      options: [
        "Flask for routing and Marshmallow for validation",
        "Django for the ORM and Jinja2 for templates",
        "Starlette for ASGI routing/requests and Pydantic for validation/serialisation",
        "Uvicorn for validation and Pydantic for routing",
      ],
      answerIndex: 2,
      explain:
        "Starlette is the ASGI toolkit underneath (routing, middleware, WebSockets — the performance layer); Pydantic v2 handles validation and serialisation with its Rust core. Uvicorn is the server that runs the app, not part of the framework itself.",
    },
    {
      question:
        "A client POSTs {\"price\": \"cheap\"} to an endpoint expecting Item(price: float). What happens with no extra code?",
      options: [
        "A 500 error with a Python traceback",
        "The handler runs and item.price is the string 'cheap'",
        "A 400 error with an empty body",
        "A 422 response with a detail array pinpointing the field, error type, and offending input",
      ],
      answerIndex: 3,
      explain:
        "FastAPI validates the body against the model before your function runs. Failures short-circuit into a structured 422 whose detail entries carry type, loc (a path like ['body', 'price']), msg, and input — a contract clients and tests can rely on.",
    },
  ],
};

export default lesson;
