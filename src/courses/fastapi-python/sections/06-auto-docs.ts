import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "auto-docs",
  title: "Automatic Docs: Swagger UI & ReDoc",
  part: "Foundations",
  estMinutes: 10,
  summary:
    "FastAPI serves interactive Swagger UI at /docs and ReDoc at /redoc, both rendered from an OpenAPI schema at /openapi.json that is generated entirely from your type hints — the docs cannot drift from the code because they ARE the code.",

  concept: `
Start any FastAPI app with uvicorn and open **\`/docs\`** in a browser. Without
writing a single line of documentation, you get Swagger UI: every endpoint
listed, every parameter with its type, every request body as a JSON schema,
and a **"Try it out"** button that sends real requests — no Postman, no curl
cheat-sheet. Prefer a calmer, read-only reference? The same app also serves
**ReDoc at \`/redoc\`**.

### Where the docs come from

Both UIs are thin viewers over one artifact: the **OpenAPI schema** served at
\`/openapi.json\`. FastAPI generates it by walking your routes — the same path
declarations, type hints, and Pydantic models the runtime uses for validation:

- \`item_id: int\` in the path → a required path parameter of type \`integer\`
- \`q: str | None = None\` → an optional query parameter
- a Pydantic model parameter → a JSON request-body schema, listed under
  \`components/schemas\` and referenced by every endpoint that uses it

This is the part worth saying out loud in an interview: **drift is
impossible**. In most PHP shops, OpenAPI means swagger-php attributes (or a
hand-edited YAML file) maintained *next to* the real code. Rename a field in
the controller, forget the annotation, and the docs now lie. In FastAPI there
is no second artifact to forget — the schema is derived from the declarations
that actually validate requests.

### Enriching the schema

The defaults are already useful; metadata makes them professional. Three
levels:

**App level** — arguments to \`FastAPI()\`:

\`\`\`python
app = FastAPI(
    title="Shop API",
    description="Orders, products, and stock. Supports **markdown**.",
    version="1.4.0",
)
\`\`\`

**Path-operation level** — arguments to the decorator:

\`\`\`python
@app.post("/orders", tags=["orders"], summary="Create an order",
          description="Reserves stock and returns the order with totals.")
async def create_order(order: OrderCreate): ...
\`\`\`

\`tags\` group endpoints into collapsible sections in Swagger UI — the closest
PHP analogue is route groups, except here the grouping is presentational.

**Model level** — Pydantic feeds the schema too:

\`\`\`python
class OrderCreate(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "examples": [{"product_id": 42, "qty": 2}],
    })
    product_id: int = Field(description="ID of an existing product")
    qty: int = Field(gt=0, description="Must be positive")
\`\`\`

\`Field(description=...)\` becomes per-property documentation;
\`json_schema_extra\` injects example payloads that pre-fill "Try it out".

### The schema is a contract, not just docs

Because \`/openapi.json\` is a machine-readable, always-accurate description of
your API, teams generate typed clients from it (\`openapi-typescript\`,
\`openapi-generator\`) — the frontend gets compile-time errors when the backend
changes. That "docs-as-contract" story is a strong hiring-panel answer.

For production, everything is configurable: \`FastAPI(docs_url=None,
redoc_url=None)\` disables the UIs, and \`openapi_url=None\` turns off the
schema (which disables both UIs too). Many teams leave \`/docs\` on internally
and off on the public edge.
`,

  comparisons: [
    {
      label: "Getting OpenAPI docs at all",
      intro:
        "Both sides want a documented GET endpoint. The PHP version documents it by hand with swagger-php attributes; the FastAPI version just writes the endpoint.",
      php: `<?php
// src/Controller/ItemController.php — swagger-php attributes,
// maintained by hand NEXT TO the real code
use OpenApi\\Attributes as OA;

class ItemController
{
    #[OA\\Get(
        path: '/items/{itemId}',
        summary: 'Read one item',
        parameters: [new OA\\Parameter(
            name: 'itemId', in: 'path', required: true,
            schema: new OA\\Schema(type: 'integer')
        )],
        responses: [new OA\\Response(response: 200, description: 'OK')]
    )]
    public function show(int $itemId): JsonResponse
    {
        // Rename $itemId or change its type and the
        // attribute above silently goes stale.
        return new JsonResponse(Item::find($itemId));
    }
}`,
      ts: `# main.py — the declaration IS the documentation
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/{item_id}", summary="Read one item")
async def read_item(item_id: int):
    return {"item_id": item_id}

# Run uvicorn and you already have:
#   /docs         -> Swagger UI (interactive, "Try it out")
#   /redoc        -> ReDoc (reference-style)
#   /openapi.json -> the machine-readable schema
# item_id shows up as a required integer path parameter
# because that is literally what the signature says.`,
      note: "The PHP attributes are a second source of truth that can drift; FastAPI has only one source — the function signature — so the docs are always right.",
    },
    {
      label: "App and endpoint metadata",
      intro:
        "Dress the docs up with a title, version, grouped endpoints, and per-endpoint summaries. Same goal on both sides — different amounts of ceremony.",
      php: `<?php
// swagger-php: app-level info is another attribute block,
// usually parked on some otherwise-empty class
use OpenApi\\Attributes as OA;

#[OA\\Info(
    title: 'Shop API',
    version: '1.4.0',
    description: 'Orders, products, and stock.'
)]
#[OA\\Tag(name: 'orders', description: 'Order management')]
class OpenApiSpec {}

// ...and every endpoint must repeat its tag by hand:
#[OA\\Post(path: '/orders', tags: ['orders'], summary: 'Create an order')]
public function store(StoreOrderRequest $request) { /* ... */ }`,
      ts: `# main.py
from fastapi import FastAPI

app = FastAPI(
    title="Shop API",
    version="1.4.0",
    description="Orders, products, and stock. Markdown works here.",
)

@app.post("/orders", tags=["orders"], summary="Create an order",
          description="Reserves stock and returns the order with totals.")
async def create_order(order: OrderCreate):
    ...

# tags group endpoints into collapsible sections in /docs;
# summary/description render on the operation itself.`,
      note: "Same OpenAPI output — but the FastAPI metadata lives on the real app object and the real route decorator, so there is nothing separate to keep in sync.",
    },
    {
      label: "Documenting the payload itself",
      intro:
        "Field-level descriptions and an example payload that pre-fills Swagger UI's 'Try it out' box.",
      php: `<?php
// The DTO and its documentation are two artifacts again:
use OpenApi\\Attributes as OA;

#[OA\\Schema(schema: 'OrderCreate')]
class OrderCreate
{
    #[OA\\Property(description: 'ID of an existing product', example: 42)]
    public int $productId;

    #[OA\\Property(description: 'Must be positive', example: 2)]
    public int $qty;

    // NOTE: nothing here actually VALIDATES qty > 0 —
    // that rule lives in a FormRequest somewhere else.
}`,
      ts: `# schemas.py — docs and validation are the SAME declaration
from pydantic import BaseModel, ConfigDict, Field

class OrderCreate(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "examples": [{"product_id": 42, "qty": 2}],
    })

    product_id: int = Field(description="ID of an existing product")
    qty: int = Field(gt=0, description="Must be positive")

# gt=0 both enforces the rule at runtime AND renders as
# "exclusiveMinimum: 0" in the JSON schema at /openapi.json.`,
      note: "Field(gt=0) is one declaration doing two jobs: runtime validation and schema documentation. In the PHP version the example, the description, and the actual rule live in three places.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "FastAPI's schema generator in miniature: a route table declares parameter TYPES, and the OpenAPI-ish JSON is derived from those types alone. Predict which parameters land in `parameters` vs `requestBody`, then run it.",
    code: `# FastAPI's docs pipeline in miniature: walk a route table where each
# route declares its parameter TYPES, and generate OpenAPI-ish JSON
# from those types alone. No annotations file, no drift — the schema
# is derived from the same declarations the runtime uses.
import json

TYPE_MAP = {int: "integer", str: "string", float: "number", bool: "boolean"}

# (path, method, summary, params) — params: name -> (type, location)
routes = [
    ("/items/{item_id}", "get", "Read one item",
     {"item_id": (int, "path"), "q": (str, "query")}),
    ("/items", "post", "Create an item",
     {"name": (str, "body"), "price": (float, "body")}),
]

def build_schema(routes):
    paths = {}
    for path, method, summary, params in routes:
        parameters = []
        body_props = {}
        for name, (ptype, location) in params.items():
            if location == "body":
                body_props[name] = {"type": TYPE_MAP[ptype]}
            else:
                parameters.append({
                    "name": name,
                    "in": location,
                    "required": location == "path",
                    "schema": {"type": TYPE_MAP[ptype]},
                })
        operation = {"summary": summary}
        if parameters:
            operation["parameters"] = parameters
        if body_props:
            operation["requestBody"] = {"content": {"application/json": {
                "schema": {"type": "object", "properties": body_props}}}}
        paths.setdefault(path, {})[method] = operation
    return {
        "openapi": "3.1.0",
        "info": {"title": "Mini API", "version": "0.1.0"},
        "paths": paths,
    }

print(json.dumps(build_schema(routes), indent=2))`,
    output: `{
  "openapi": "3.1.0",
  "info": {
    "title": "Mini API",
    "version": "0.1.0"
  },
  "paths": {
    "/items/{item_id}": {
      "get": {
        "summary": "Read one item",
        "parameters": [
          {
            "name": "item_id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            }
          },
          {
            "name": "q",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/items": {
      "post": {
        "summary": "Create an item",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": {
                    "type": "string"
                  },
                  "price": {
                    "type": "number"
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`,
  },

  keyPoints: [
    "Every FastAPI app serves Swagger UI at `/docs`, ReDoc at `/redoc`, and the raw OpenAPI schema at `/openapi.json` — all generated from your type hints, zero annotation work.",
    "Swagger UI's 'Try it out' sends real requests from the browser, replacing Postman for day-to-day endpoint testing.",
    "Drift is impossible: unlike swagger-php attributes maintained beside the code, the schema is derived from the same declarations that validate requests.",
    "Enrich docs at three levels: `FastAPI(title=, description=, version=)`, decorator `summary=`/`description=`/`tags=`, and model-level `Field(description=...)` plus `json_schema_extra` examples.",
    "`/openapi.json` is a contract — teams generate typed clients from it (openapi-typescript, openapi-generator), so backend changes surface as frontend compile errors.",
    "Disable for production edges with `FastAPI(docs_url=None, redoc_url=None)`; setting `openapi_url=None` removes the schema and both UIs.",
  ],

  interview: [
    {
      q: "How does FastAPI generate API documentation, and why is that better than annotation-based tools?",
      a: "FastAPI walks the route table and builds an OpenAPI schema directly from the code: path parameter types come from the function signature, query parameters from defaulted arguments, and request/response bodies from the Pydantic models. That schema is served at `/openapi.json`, and Swagger UI (`/docs`) and ReDoc (`/redoc`) are just viewers over it. The key advantage over annotation-based tooling like swagger-php is that there's no second artifact to maintain — the declarations that generate the docs are the same ones that validate requests at runtime, so the docs can't drift from reality. If I change a parameter's type, both the validation behaviour and the documentation change in the same edit.",
    },
    {
      q: "Your product team wants richer API docs — examples, descriptions, grouping. Where do you add that in FastAPI?",
      a: "Three levels. App-wide metadata goes on the constructor: `FastAPI(title=..., description=..., version=...)`, with `openapi_tags` for tag descriptions and ordering. Per-endpoint, the decorator takes `summary`, `description`, and `tags` — tags group operations into sections in Swagger UI. At the payload level, Pydantic does the work: `Field(description=...)` documents individual properties, and `json_schema_extra` with an `examples` list pre-fills the 'Try it out' request body. All of it lands in `/openapi.json`, so ReDoc and any generated clients see the same enrichment.",
    },
    {
      q: "Would you expose /docs in production?",
      a: "It depends on the audience. For a public API, interactive docs are a feature — Stripe-style reference material for free. For an internal service, I'd typically keep `/docs` reachable inside the network but disable it on the public edge with `docs_url=None` and `redoc_url=None`, or set `openapi_url=None` to remove the schema entirely, since the schema enumerates every route and parameter for an attacker. One caveat I'd raise: hiding docs is not security — the endpoints still need real auth regardless.",
    },
  ],

  quiz: [
    {
      question: "Where does the content of FastAPI's /docs page ultimately come from?",
      options: [
        "A docs.yaml file you maintain in the project root",
        "Docblock comments parsed from your route functions",
        "The OpenAPI schema at /openapi.json, generated from your type hints and Pydantic models",
        "A crawler that calls each endpoint once at startup and records the responses",
      ],
      answerIndex: 2,
      explain:
        "Swagger UI and ReDoc are both viewers over /openapi.json, which FastAPI generates from the route declarations, parameter type hints, and Pydantic models — the same declarations that drive runtime validation. That single source is why the docs can't drift.",
    },
    {
      question: "You want the endpoints in Swagger UI grouped into sections like 'orders' and 'users'. What do you use?",
      options: [
        "APIRouter(prefix=...) — the prefix becomes the group name",
        "The tags parameter on the path-operation decorator, e.g. @app.get('/orders', tags=['orders'])",
        "A Group() dependency injected into each endpoint",
        "Naming conventions — functions starting with orders_ are grouped automatically",
      ],
      answerIndex: 1,
      explain:
        "tags is presentational metadata for OpenAPI: operations sharing a tag are grouped into one collapsible section in Swagger UI. Routers can set a shared tags= for all their routes, but it's the tag, not the URL prefix, that drives grouping.",
    },
    {
      question: "What happens if you create your app with FastAPI(openapi_url=None)?",
      options: [
        "The schema moves to the default /openapi.json path",
        "Only ReDoc is disabled; Swagger UI keeps working",
        "Docs remain but 'Try it out' is disabled",
        "No OpenAPI schema is served, and both /docs and /redoc are disabled with it",
      ],
      answerIndex: 3,
      explain:
        "Both documentation UIs render from the schema, so removing the schema (openapi_url=None) disables /docs and /redoc too. To remove just one UI, set docs_url=None or redoc_url=None individually.",
    },
  ],
};

export default lesson;
