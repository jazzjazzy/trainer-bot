import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "nested-models",
  title: "Nested Models & Collections",
  part: "Pydantic & Responses",
  estMinutes: 12,
  summary:
    "Real payloads are trees — models containing lists of models — and Pydantic validates the whole graph in one pass, reporting failures with a loc path that pinpoints the exact failing leaf.",

  concept: `
Nobody ships an API of flat payloads. An order has items, each item has a
product, the customer has an address. In Pydantic, nesting is just... using a
model as a type:

\`\`\`python
from pydantic import BaseModel, Field

class Product(BaseModel):
    sku: str
    unit_price: float = Field(gt=0)

class OrderItem(BaseModel):
    product: Product              # model inside a model
    qty: int = Field(gt=0)

class Order(BaseModel):
    id: int
    items: list[OrderItem]        # list of models
    tags: list[str] = []          # plain collections work too
    discounts: dict[str, float] = {}
\`\`\`

Post a JSON order and one \`model_validate\` pass walks the entire tree: every
item, every product inside every item, every string in \`tags\`, every value in
\`discounts\`. You receive a fully typed object graph —
\`order.items[0].product.unit_price\` is a \`float\`, and your editor completes
every step of that chain.

### Compare the PHP workflow

Laravel validates nested input with dotted wildcard rules —
\`'items.*.qty' => 'required|integer|min:1'\` — which works, but notice what
you're left holding afterwards: **still an array**. You then either walk
\`$validated['items']\` as untyped arrays or write a second layer of hydration
into DTOs. Pydantic collapses "validate" and "hydrate" into one step: the
output of validation *is* the typed graph.

### Errors carry a path to the leaf

When something deep in the tree fails, the 422 body's \`loc\` walks the route
to it — field names for objects, indexes for lists:

\`\`\`json
{"detail": [{
  "loc": ["body", "items", 1, "product", "unit_price"],
  "msg": "Input should be greater than 0",
  "type": "greater_than"
}]}
\`\`\`

Read it inside-out: body → \`items\` → index 1 → \`product\` → \`unit_price\`. A
frontend can attach that message to the exact form row. It's Laravel's
\`items.1.product.unit_price\` error-bag key, but as a structured array rather
than a string you have to split on dots — and it's generated for *any* depth
without you writing wildcard rules per level.

### Nesting in the OpenAPI schema

Each model becomes one reusable schema under \`components/schemas\`, and
nesting becomes \`$ref\` links between them (\`Order\` → \`OrderItem\` →
\`Product\`). Define \`Product\` once, and every endpoint that mentions it —
inside an order, alone, in a list — references the same component. Serialising
back out is equally recursive: \`order.model_dump()\` returns nested dicts and
lists, ready for the wire.

### Self-referencing models

The interview curiosity: a model can reference itself, for trees like nested
categories:

\`\`\`python
class Category(BaseModel):
    name: str
    children: list["Category"] = []   # forward reference to itself
\`\`\`

The quoted \`"Category"\` is a forward reference — the name isn't defined yet
on that line; Pydantic resolves it once the class exists. Validation then
handles arbitrary depth: a category tree five levels deep validates in the
same single call.
`,

  comparisons: [
    {
      label: "Validating an order with line items",
      intro:
        "An order arrives with a list of items, each holding a product and a quantity. Laravel validates with dotted wildcards and leaves you an array; Pydantic leaves you a typed graph.",
      php: `<?php
// app/Http/Requests/StoreOrderRequest.php
public function rules(): array
{
    return [
        'id'                          => 'required|integer',
        'items'                       => 'required|array|min:1',
        'items.*.qty'                 => 'required|integer|min:1',
        'items.*.product.sku'         => 'required|string',
        'items.*.product.unit_price'  => 'required|numeric|gt:0',
    ];
}

// Controller: validation passed, but it's STILL arrays:
$total = 0;
foreach ($request->validated()['items'] as $item) {
    // ['product']['unit_price'] — typo-prone string keys,
    // no autocomplete, hydrating DTOs is a second step.
    $total += $item['qty'] * $item['product']['unit_price'];
}`,
      ts: `# schemas.py — the nesting IS the rule set
from pydantic import BaseModel, Field

class Product(BaseModel):
    sku: str
    unit_price: float = Field(gt=0)

class OrderItem(BaseModel):
    product: Product
    qty: int = Field(gt=0)

class Order(BaseModel):
    id: int
    items: list[OrderItem] = Field(min_length=1)

# main.py — validated AND hydrated in one step
@app.post("/orders")
async def create_order(order: Order):
    total = sum(i.qty * i.product.unit_price for i in order.items)
    return {"order_id": order.id, "total": total}`,
      note: "The dotted wildcard rules describe the tree; the Pydantic models ARE the tree. And after validation, PHP holds arrays while the handler holds typed objects with autocomplete on every level.",
    },
    {
      label: "Where exactly did it fail?",
      intro:
        "The second item's product has a negative price. Both frameworks point at it — compare the shapes a client has to parse.",
      php: `// Laravel 422 body: dotted STRING keys
{
  "message": "The items.1.product.unit_price must be greater than 0.",
  "errors": {
    "items.1.product.unit_price": [
      "The items.1.product.unit_price must be greater than 0."
    ]
  }
}
// The client splits "items.1.product.unit_price" on dots
// (and hopes no field name ever contains a dot).`,
      ts: `// FastAPI 422 body: loc is a structured PATH array
{
  "detail": [
    {
      "type": "greater_than",
      "loc": ["body", "items", 1, "product", "unit_price"],
      "msg": "Input should be greater than 0",
      "gt": 0
    }
  ]
}
// Field names and list indexes are separate elements —
// no string parsing, and "type" is machine-matchable.`,
      note: "Same information, but loc as an array of names-and-indexes needs no string splitting, distinguishes the key '1' from the index 1, and comes with a stable machine-readable type code.",
      leftLang: "json",
      rightLang: "json",
    },
    {
      label: "A self-referencing tree",
      intro:
        "Categories contain child categories to any depth. PHP validates recursively by hand (or gives up at a fixed depth); Pydantic takes a forward reference.",
      php: `<?php
// Wildcard rules only reach the depth you spell out:
public function rules(): array
{
    return [
        'name'                        => 'required|string',
        'children'                    => 'array',
        'children.*.name'             => 'required|string',
        'children.*.children'         => 'array',
        'children.*.children.*.name'  => 'required|string',
        // ...level 4? level 5? You either enumerate levels
        // or write a custom recursive validator.
    ];
}`,
      ts: `# schemas.py — arbitrary depth from one forward reference
from pydantic import BaseModel

class Category(BaseModel):
    name: str
    children: list["Category"] = []

data = {"name": "Electronics", "children": [
    {"name": "Audio", "children": [
        {"name": "Headphones", "children": []},
    ]},
]}
tree = Category.model_validate(data)
tree.children[0].children[0].name  # "Headphones", fully typed
# An invalid name 3 levels down reports
# loc: ["children", 0, "children", 0, "name"]`,
      note: "The quoted \"Category\" is a forward reference Pydantic resolves after the class is defined — one line handles any depth, in validation, serialisation, and the OpenAPI schema alike.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Nested validation in miniature: from_dict functions recurse through order → items → product, prefixing each error with its location, exactly how a 422 loc is built. Predict the valid order's total and the two error paths, then run.",
    code: `# Nested validation, Pydantic-style: from_dict recurses through the
# tree, and every error carries the FULL PATH to the failing leaf —
# exactly how a 422 body pinpoints ("items", 0, "qty").
from dataclasses import dataclass

@dataclass
class Product:
    sku: str
    unit_price: float

@dataclass
class OrderItem:
    product: Product
    qty: int

@dataclass
class Order:
    id: int
    items: list

def product_from_dict(data, loc, errors):
    price = data.get("unit_price")
    if not isinstance(price, (int, float)) or price <= 0:
        errors.append({"loc": loc + ("unit_price",), "type": "greater_than"})
        price = 0
    return Product(sku=str(data.get("sku", "")), unit_price=float(price))

def item_from_dict(data, loc, errors):
    qty = data.get("qty")
    if isinstance(qty, str) and qty.isdigit():
        qty = int(qty)  # coercion, like Pydantic's lax mode
    if not isinstance(qty, int) or qty <= 0:
        errors.append({"loc": loc + ("qty",), "type": "greater_than"})
        qty = 0
    product = product_from_dict(data.get("product", {}),
                                loc + ("product",), errors)
    return OrderItem(product=product, qty=qty)

def order_from_dict(data):
    errors = []
    items = [item_from_dict(raw, ("items", i), errors)
             for i, raw in enumerate(data.get("items", []))]
    return Order(id=int(data.get("id", 0)), items=items), errors

valid = {"id": 1001, "items": [
    {"product": {"sku": "KB-01", "unit_price": 49.5}, "qty": "2"},
    {"product": {"sku": "MS-02", "unit_price": 25.0}, "qty": 1},
]}
order, errors = order_from_dict(valid)
total = sum(i.qty * i.product.unit_price for i in order.items)
print("order", order.id, "validated, total:", total)
print("errors:", errors)

invalid = {"id": 1002, "items": [
    {"product": {"sku": "KB-01", "unit_price": 49.5}, "qty": 0},
    {"product": {"sku": "MS-02", "unit_price": -5}, "qty": 3},
]}
_, errors = order_from_dict(invalid)
print("invalid order, error paths:")
for err in errors:
    print(" ", err["loc"], "->", err["type"])`,
    output: `order 1001 validated, total: 124.0
errors: []
invalid order, error paths:
  ('items', 0, 'qty') -> greater_than
  ('items', 1, 'product', 'unit_price') -> greater_than`,
  },

  keyPoints: [
    "Nesting is just typing: a field annotated with another model (`product: Product`) or a collection of models (`items: list[OrderItem]`) validates the whole subtree in one pass.",
    "Validation and hydration are one step — unlike PHP's dotted `items.*.qty` rules that still leave you holding raw arrays, `model_validate` returns a fully typed object graph.",
    "Deep failures report a structured `loc` path — `[\"body\", \"items\", 1, \"product\", \"unit_price\"]` — mixing field names and list indexes, so clients pinpoint the failing leaf without string parsing.",
    "Plain collections work as field types too: `list[str]`, `dict[str, float]`, with element-level validation and per-element error locations.",
    "Each model becomes one reusable `components/schemas` entry in OpenAPI, and nesting becomes `$ref` links — define `Product` once, reference it everywhere.",
    "Self-referencing models use a quoted forward reference — `children: list[\"Category\"] = []` — and then validate trees of arbitrary depth.",
  ],

  interview: [
    {
      q: "How does Pydantic handle a deeply nested request body, and how does a client find out exactly which field failed?",
      a: "Nesting is expressed with types: an `Order` model has `items: list[OrderItem]`, and `OrderItem` has `product: Product`. One `model_validate` call walks the whole tree — every item, every product, every element of plain collections like `list[str]` — and returns a fully typed object graph. On failure, each error in the 422 body carries a `loc` array that is the literal path to the failing leaf: `[\"body\", \"items\", 1, \"product\", \"unit_price\"]`, mixing field names and list indexes. Coming from Laravel, it's the dotted `items.1.product.unit_price` error key, but structured instead of stringly-typed, and it works at any depth without writing wildcard rules per level.",
    },
    {
      q: "What's the difference between validating nested input in Laravel and in FastAPI, once validation has passed?",
      a: "In Laravel, dotted wildcard rules like `'items.*.qty' => 'integer|min:1'` validate the shape, but `$request->validated()` still hands back nested arrays — typed access requires a second hydration step into DTOs that you write and maintain yourself. In FastAPI, the Pydantic models are simultaneously the rules and the target types, so the handler receives `order.items[0].product.unit_price` as a real `float` with editor autocomplete the moment validation passes. That also means the structure is documented: each model becomes a reusable schema component in `/openapi.json`, with nesting expressed as `$ref` links.",
    },
    {
      q: "Can a Pydantic model reference itself — say, for a category tree?",
      a: "Yes, with a forward reference: `children: list[\"Category\"] = []` inside `class Category`. The quotes are needed because the name doesn't exist yet while the class body executes; Pydantic resolves the reference once the class is built. After that, validation, serialisation via `model_dump()`, and the OpenAPI schema all handle arbitrary depth — a five-level tree validates in one call, and an error three levels down still gets a precise `loc` like `[\"children\", 0, \"children\", 2, \"name\"]`. The practical caveat I'd mention: unbounded depth on a public endpoint deserves a size limit, since a hostile client can post a very deep tree.",
    },
  ],

  quiz: [
    {
      question: "A 422 response contains loc: [\"body\", \"items\", 1, \"product\", \"unit_price\"]. What failed?",
      options: [
        "The unit_price of the product on the second item (index 1) in the items list",
        "The first item's product — 1 is a count, not an index",
        "A field literally named 'items.1.product.unit_price'",
        "The whole items list — everything after 'items' is metadata",
      ],
      answerIndex: 0,
      explain:
        "loc is a path from the request body to the failing leaf: the items field, list index 1 (second element), its product, that product's unit_price. Integers in loc are list indexes; strings are field names.",
    },
    {
      question: "What does declaring items: list[OrderItem] on an Order model give you that 'items' => 'array' plus dotted rules doesn't?",
      options: [
        "Faster JSON parsing only — validation behaviour is identical",
        "Validation AND hydration in one step: after model_validate you hold typed OrderItem objects, not raw arrays",
        "Nothing — Pydantic also returns dicts for nested data",
        "It skips validating list elements for performance",
      ],
      answerIndex: 1,
      explain:
        "Pydantic validates every element against OrderItem and constructs real instances, so order.items[0].qty is a typed attribute with autocomplete. Laravel's validated() output remains nested arrays needing a separate DTO-hydration layer.",
    },
    {
      question: "How do you declare a self-referencing Category model with children of the same type?",
      options: [
        "children: list[Category] = [] — Python resolves the name lazily",
        "children: list[\"Category\"] = [] — a quoted forward reference resolved after the class is defined",
        "children: list[Self] = [] using typing.Self",
        "You can't — Pydantic forbids recursive models",
      ],
      answerIndex: 1,
      explain:
        "Inside the class body the name Category doesn't exist yet, so an unquoted reference raises NameError. The quoted string is a forward reference that Pydantic resolves once the class is built, enabling trees of arbitrary depth.",
    },
  ],
};

export default lesson;
