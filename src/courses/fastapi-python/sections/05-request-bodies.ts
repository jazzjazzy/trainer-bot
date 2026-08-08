import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "request-bodies",
  title: "Request Bodies with Pydantic Models",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "Declare a Pydantic BaseModel parameter and FastAPI parses the JSON body, validates it, and hands your function a typed object — FormRequest, DTO, and json_decode in one artefact.",

  concept: `
### One class, three jobs

\`\`\`python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float
    quantity: int = 1
    description: str | None = None

@app.post("/items")
def create_item(item: Item):
    total = item.price * item.quantity   # real floats/ints, autocompleted
    return {"name": item.name, "total": total}
\`\`\`

Declaring \`item: Item\` makes FastAPI read the request body as JSON, validate
it against the model, and pass in a real object. Map it to your PHP toolkit:

- **FormRequest rules** — \`name: str\` and \`price: float\` are \`'name' => 'required|string'\` and \`'price' => 'required|numeric'\`. Fields with defaults (\`quantity\`, \`description\`) are optional in the payload.
- **The DTO class** — \`item.price\` is a typed attribute, not \`$data['price']\`. Your editor completes it; a typo is a visible error, not a silent \`null\`.
- **\`json_decode\`** — parsing already happened. Malformed JSON or a failing field is a structured 422 before your function runs, with every error reported at once (\`"type": "missing"\`, \`"float_parsing"\`, ... each with a \`loc\` like \`["body", "price"]\`).

Pydantic also **coerces** sensibly: \`"price": "19.99"\` (a string) becomes the
float \`19.99\`. It's strict about nonsense — \`"price": "cheap"\` is an error,
not \`0.0\` like PHP's \`(float) 'cheap'\`.

### Mixing path, query, and body in one signature

\`\`\`python
@app.put("/stores/{store_id}/items")
def upsert_item(store_id: int, item: Item, notify: bool = False):
    return {"store": store_id, "item": item.model_dump(), "notify": notify}
\`\`\`

FastAPI sorts the parameters by the standard rules: \`store_id\` matches a path
segment, \`item\` is a Pydantic model so it's the JSON body, and \`notify\` — a
scalar not in the path — is a query parameter. One signature describes the
whole request.

### Working with the model (Pydantic v2 idioms)

\`\`\`python
data = item.model_dump()          # -> plain dict
raw  = item.model_dump_json()     # -> JSON string (compact separators)

manual = Item.model_validate({"name": "Desk", "price": 10})  # parse by hand
\`\`\`

Use the v2 names: \`model_dump()\` not the old \`dict()\`, \`model_validate()\`
not \`parse_obj()\` — the v1 names are deprecated. \`model_validate()\` matters
when data arrives from somewhere other than a request: a queue message, a
fixture, an ORM row. (Part 2 of this course goes deep on Pydantic.)

### The schema shows up in /docs automatically

Because the model is declared in types, it's registered under
\`components/schemas\` in the generated OpenAPI document. \`/docs\` renders the
request body with field types, defaults, and required markers, plus a working
"Try it out" form — the API documentation your Laravel projects needed a
package and discipline for, produced as a side effect of the DTO you were
going to write anyway.
`,

  comparisons: [
    {
      label: "FormRequest + DTO + decode vs one model",
      intro:
        "Accept a JSON body to create an item, with validation and a typed object for the domain code. Count the artefacts on each side.",
      php: `<?php
// 1) app/Http/Requests/StoreItemRequest.php
class StoreItemRequest extends FormRequest {
    public function rules(): array {
        return [
            'name'     => 'required|string',
            'price'    => 'required|numeric',
            'quantity' => 'sometimes|integer',
        ];
    }
}

// 2) app/DTO/ItemData.php
final readonly class ItemData {
    public function __construct(
        public string $name,
        public float $price,
        public int $quantity = 1,
    ) {}
}

// 3) Controller: glue them together
public function store(StoreItemRequest $request) {
    $v = $request->validated();
    $item = new ItemData(
        $v['name'],
        (float) $v['price'],
        (int) ($v['quantity'] ?? 1),
    );
    return response()->json(['name' => $item->name]);
}`,
      ts: `# main.py -- one artefact does all three jobs
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float
    quantity: int = 1

@app.post("/items")
def create_item(item: Item):
    # validated, coerced, typed -- already
    return {"name": item.name,
            "total": item.price * item.quantity}`,
      note: "The BaseModel is the rules array, the readonly DTO, and the validated()-to-constructor glue in one place — and it lands in the OpenAPI schema without a fourth artefact.",
    },
    {
      label: "Array keys vs typed attributes",
      intro:
        "Read fields off the decoded payload. One side is stringly-typed at every access; the other is checked by the editor before the code ever runs.",
      php: `<?php
$data = json_decode(
    $request->getContent(), true
);

// Array keys: a typo is a null + notice
// at RUNTIME, in production, at 2am.
$name  = $data['name'] ?? null;
$price = (float) ($data['price'] ?? 0);
$total = $price * (int) ($data['quantity'] ?? 1);`,
      ts: `# item: Item -- parsing already happened.

name  = item.name        # str, autocompleted
total = item.price * item.quantity

# item.pricee -> editor error immediately,
# AttributeError if you somehow run it.
# No ?? fallbacks: absent-but-required
# fields already returned a 422.`,
      note: "The failure mode moves: PHP's missing key surfaces mid-request as a null; the Pydantic version rejects the request at the edge and makes field typos a development-time error.",
    },
    {
      label: "Path + query + body in one request",
      intro:
        "Update an item in a store, with a notify flag. Laravel spreads the three inputs across three APIs; FastAPI declares them side by side and infers the sources.",
      php: `<?php
// PUT /stores/12/items?notify=1
public function upsert(
    StoreItemRequest $request,
    string $storeId          // route param: string
) {
    $storeId = (int) $storeId;
    $notify  = $request->boolean('notify');
    $item    = $request->validated();  // array
    // three inputs, three access styles
    return response()->json([
        'store' => $storeId,
        'notify' => $notify,
    ]);
}`,
      ts: `# PUT /stores/12/items?notify=1
@app.put("/stores/{store_id}/items")
def upsert_item(
    store_id: int,        # in path template -> path
    item: Item,           # BaseModel -> JSON body
    notify: bool = False, # scalar, not in path -> query
):
    return {"store": store_id,
            "item": item.model_dump(),
            "notify": notify}`,
      note: "The inference rules (path segment / Pydantic model / leftover scalar) mean one signature documents the entire request — which is literally how the OpenAPI page for this route is produced.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Pydantic's job, hand-rolled: a dataclass Item plus a validate_item() that coerces types, applies defaults, and collects every error. Run a good payload (note price arrives as a string) and a bad one — predict all the printed lines.",
    code: `# What Pydantic does with a request body, hand-rolled:
# a typed class + a validator that coerces, defaults, and collects ALL errors.
from dataclasses import dataclass

@dataclass
class Item:
    name: str
    price: float
    quantity: int = 1          # default -> optional in the payload
    description: str | None = None

FIELDS = {"name": (str, ...), "price": (float, ...),
          "quantity": (int, 1), "description": (str, None)}

def validate_item(data: dict):
    values, errors = {}, []
    for name, (typ, default) in FIELDS.items():
        if name not in data:
            if default is ...:
                errors.append({"type": "missing", "loc": ["body", name],
                               "msg": "Field required"})
            else:
                values[name] = default
            continue
        raw = data[name]
        if raw is None and default is None:
            values[name] = None            # explicit null on an optional field
        else:
            try:
                values[name] = typ(raw)    # "19.99" -> 19.99, like Pydantic
            except (TypeError, ValueError):
                errors.append({"type": f"{typ.__name__}_parsing",
                               "loc": ["body", name],
                               "msg": f"Input should be a valid {typ.__name__}",
                               "input": raw})
    if errors:
        return None, errors
    return Item(**values), []

good = {"name": "Desk lamp", "price": "19.99"}        # price arrives as a string
item, errors = validate_item(good)
print(item)                     # a real object -- item.price, not item["price"]
print(f"total = {item.price * item.quantity}")

bad = {"price": "cheap", "quantity": "many"}
item, errors = validate_item(bad)
print(item)
for e in errors:                # every error reported at once, not one by one
    print(e)`,
    output: `Item(name='Desk lamp', price=19.99, quantity=1, description=None)
total = 19.99
None
{'type': 'missing', 'loc': ['body', 'name'], 'msg': 'Field required'}
{'type': 'float_parsing', 'loc': ['body', 'price'], 'msg': 'Input should be a valid float', 'input': 'cheap'}
{'type': 'int_parsing', 'loc': ['body', 'quantity'], 'msg': 'Input should be a valid int', 'input': 'many'}`,
  },

  keyPoints: [
    "Declare `item: Item` (a BaseModel subclass) on a POST/PUT handler and FastAPI parses the JSON body, validates it, and passes a typed object — no json_decode, no rules array, no DTO glue.",
    "Model fields with defaults are optional in the payload; fields without are required and produce a 422 `missing` entry if absent — all failures reported in one response.",
    "Pydantic coerces sensible inputs (`\"19.99\"` → 19.99) and rejects nonsense (`\"cheap\"` → `float_parsing` error), unlike PHP's silent `(float)` cast to 0.0.",
    "Mix inputs freely in one signature: path-template names are path params, BaseModel params are the body, leftover scalars are query params.",
    "Use Pydantic v2 names: `model_dump()` / `model_dump_json()` to serialise, `model_validate()` to parse manually — `dict()`, `json()`, and `parse_obj()` are deprecated v1 names.",
    "The model is auto-registered in the OpenAPI schema, so `/docs` shows the body's fields, types, and required markers with a working try-it form.",
  ],

  interview: [
    {
      q: "How does FastAPI handle request bodies, and what does that replace from a Laravel workflow?",
      a: "I define a Pydantic BaseModel with typed fields and declare it as a parameter of the path operation. FastAPI reads the JSON body, validates and coerces it against the model before my code runs, and rejects bad payloads with a structured 422 listing every failing field with its location and error type. That single class replaces three Laravel artefacts: the FormRequest rules array, the DTO I'd build from validated() output, and the json_decode step — plus the hand-written API docs, since the model is registered in the OpenAPI schema automatically. Inside the handler I work with real typed attributes like item.price, not array keys, so my editor catches typos.",
    },
    {
      q: "In one signature you have store_id, a Pydantic model, and a bool with a default. How does FastAPI route each to the right part of the request?",
      a: "By declaration rules, not by naming conventions. A parameter whose name matches a placeholder in the path template — store_id in /stores/{store_id} — is a path parameter. A parameter typed as a Pydantic BaseModel is expected as the JSON body. Remaining scalars like the bool become query parameters, with the default making it optional. If I need to override the inference — say a scalar that should come from the body, or a header — I add an explicit Body(), Query(), or Header() marker in Annotated metadata. The payoff is that the complete request contract lives in one signature, and it's the same information that generates the /docs page.",
    },
    {
      q: "What are the Pydantic v2 method names you'd use day to day, and why does it matter?",
      a: "Serialising: model_dump() for a plain dict and model_dump_json() for a JSON string. Parsing outside a request path — a queue message, a test fixture, an ORM object — Item.model_validate(data), or model_validate_json() straight from a JSON string. Config lives in model_config = ConfigDict(...) rather than a nested Config class. It matters because v2 was a breaking rewrite with a Rust core, and the v1 names — dict(), json(), parse_obj(), the Config class — are deprecated; using them in an interview or a code review signals stale knowledge. Current FastAPI runs on v2, so v2 idioms are the working vocabulary.",
    },
  ],

  quiz: [
    {
      question:
        "Item has `name: str`, `price: float`, `quantity: int = 1`. A client POSTs {\"name\": \"Desk\", \"price\": \"19.99\"}. What does the handler receive?",
      options: [
        "A 422, because price is a string in the JSON",
        "An Item with name='Desk', price=19.99 (coerced to float), quantity=1 (default applied)",
        "An Item with price as the string \"19.99\" — coercion is opt-in",
        "A dict, because partial payloads skip model construction",
      ],
      answerIndex: 1,
      explain:
        "Pydantic coerces the numeric string to a float and fills the missing quantity from its default. Only genuinely unparseable values (like \"cheap\") or missing required fields produce the 422.",
    },
    {
      question:
        "A payload omits the required `name` AND sends `price: \"cheap\"`. What does the client get back?",
      options: [
        "A 422 mentioning only the first error found",
        "Two separate 422 responses",
        "One 422 whose detail array contains both errors, each with its own type, loc, and input",
        "A 500, since multiple failures can't be aggregated",
      ],
      answerIndex: 2,
      explain:
        "Validation collects every failure in one pass — the detail list carries a `missing` entry for name and a parsing error for price. Clients fix everything in one round trip, unlike stop-at-first-error validators.",
    },
    {
      question: "Which is the current Pydantic v2 way to turn a model into a plain dict?",
      options: [
        "item.dict()",
        "item.toArray()",
        "dict(item)",
        "item.model_dump()",
      ],
      answerIndex: 3,
      explain:
        "v2 renamed the serialisation API: model_dump() for dicts, model_dump_json() for JSON strings, model_validate() for parsing. The v1 dict()/json()/parse_obj() names are deprecated and will trip you up in interviews.",
    },
  ],
};

export default lesson;
