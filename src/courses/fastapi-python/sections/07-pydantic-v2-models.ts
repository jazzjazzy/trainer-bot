import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "pydantic-v2-models",
  title: "Pydantic v2 Deep Dive: Field, ConfigDict, model_*",
  part: "Pydantic & Responses",
  estMinutes: 12,
  summary:
    "Pydantic v2 is the data layer of every FastAPI app: Field() declares constraints and metadata, ConfigDict sets model-wide behaviour, and the model_* method family (model_validate, model_dump, ...) replaces the deprecated v1 names.",

  concept: `
Every request body, every response, every settings object in a FastAPI app is
a Pydantic model. It's worth knowing Pydantic v2 properly, not just as "the
thing FastAPI uses" — interviewers probe it directly, and v2 (a ground-up
rewrite with a Rust core) renamed almost the entire API.

### One model, three jobs

In a PHP codebase you'd typically split these concerns: a FormRequest for
validation, a DTO/value object for typed data, a \`jsonSerialize()\` or
transformer for output. A Pydantic model is all three:

\`\`\`python
from pydantic import BaseModel, ConfigDict, Field

class Product(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    price: float = Field(gt=0, description="Unit price, excl. tax")
    stock: int = 0
    sku: str | None = None
\`\`\`

### Field(): constraints and metadata per field

\`Field()\` is where per-field rules live: numeric bounds (\`gt\`, \`ge\`, \`lt\`,
\`le\`), string rules (\`min_length\`, \`max_length\`, \`pattern\`), plus
documentation (\`description\`, \`examples\`) and wire-name mapping
(\`alias="productName"\` when the JSON uses camelCase but your Python doesn't).
Constraint violations don't throw one-at-a-time like constructor guards —
Pydantic collects **all** failures and reports them together, each with a
\`loc\`, \`msg\`, and \`type\`.

### ConfigDict: model-wide behaviour

\`model_config = ConfigDict(...)\` sets policy for the whole model:
\`extra="forbid"\` rejects unknown keys (catches client typos like \`pricee\`),
\`str_max_length=1000\` caps every string field at once,
\`frozen=True\` makes instances immutable, and \`from_attributes=True\` lets a
model read from object attributes (how ORM rows become responses). In v1 this
was an inner \`class Config\` — if you see that, you're reading old code.

### The model_* method family

v2 prefixed every method with \`model_\` to end name collisions with your own
fields. The four you use daily:

| v2 (current) | v1 (deprecated) | What it does |
|---|---|---|
| \`Product.model_validate(data)\` | \`parse_obj\` | dict → validated instance |
| \`Product.model_validate_json(raw)\` | \`parse_raw\` | JSON string → instance |
| \`p.model_dump()\` | \`.dict()\` | instance → plain dict |
| \`p.model_dump_json()\` | \`.json()\` | instance → JSON string |

Also renamed: \`model_copy()\`, \`model_construct()\` (skip validation — trusted
data only), and \`model_fields\` for introspection. Two details worth
volunteering in an interview: **\`model_dump_json()\` emits compact JSON** — no
spaces after separators (\`{"a":["x","y"]}\`) — unlike \`json.dumps\` defaults;
and validation is **coercing by default** (\`"123"\` becomes \`123\` for an
\`int\` field), with \`strict=True\` available when you don't want that.

### Why the renames matter to you

Tutorials, Stack Overflow answers, and real codebases mix v1 and v2 freely.
The v1 names still *run* (with deprecation warnings) because Pydantic ships a
compatibility layer, so nothing forces old code to update. Being able to say
"\`.dict()\` is the deprecated v1 spelling of \`model_dump()\`, and
\`class Config\` became \`ConfigDict\`" marks you as current — and being able to
read both marks you as employable on legacy code.
`,

  comparisons: [
    {
      label: "A guarded value object vs a model",
      intro:
        "Both sides want a Product that can't exist in an invalid state. PHP does it with constructor guards that fail one at a time; Pydantic declares the rules and collects every failure.",
      php: `<?php
// src/Dto/Product.php — manual guards, first failure wins
final class Product
{
    public function __construct(
        public readonly string $name,
        public readonly float $price,
        public readonly int $stock = 0,
        public readonly ?string $sku = null,
    ) {
        if (mb_strlen($name) < 1 || mb_strlen($name) > 120) {
            throw new InvalidArgumentException('name length invalid');
        }
        if ($price <= 0) {
            // The client never learns about a bad stock value
            // in the same response — we already threw.
            throw new InvalidArgumentException('price must be > 0');
        }
    }
}`,
      ts: `# schemas.py — declarative, all failures collected
from pydantic import BaseModel, ConfigDict, Field

class Product(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    price: float = Field(gt=0)
    stock: int = 0
    sku: str | None = None

# Product.model_validate({"name": "", "price": -1})
# -> ValidationError with BOTH errors, each carrying
#    loc, msg, and type — FastAPI turns this into a 422.`,
      note: "Constructor guards throw on the first problem; Pydantic reports every violation at once in a structured list — which is exactly what an API client needs to render a form's errors.",
    },
    {
      label: "Parsing untrusted JSON input",
      intro:
        "Turn a raw JSON request body into typed data you can trust. PHP decodes to a shapeless array and checks by hand; Pydantic validates and types in one call.",
      php: `<?php
// json_decode gives you an array of maybes
$data = json_decode($request->getContent(), true);

if (!is_string($data['name'] ?? null)) {
    return new JsonResponse(['error' => 'name required'], 422);
}
if (!is_numeric($data['price'] ?? null) || $data['price'] <= 0) {
    return new JsonResponse(['error' => 'bad price'], 422);
}
// $data is STILL just an array — nothing stops
// $data['pricee'] from being read later.
$product = new Product($data['name'], (float) $data['price']);`,
      ts: `# One call: parse + coerce + validate + type
from pydantic import ValidationError

raw = '{"name": "Keyboard", "price": "49.5", "stock": "12"}'

try:
    product = Product.model_validate_json(raw)
except ValidationError as e:
    print(e.errors())  # [{loc, msg, type, ...}, ...]

product.price  # 49.5 (float) — "49.5" was coerced
product.stock  # 12 (int)    — "12" was coerced
# product.pricee -> AttributeError, and your editor
# flags it before you even run.`,
      note: "model_validate_json goes straight from bytes to a typed object — and lax-mode coercion turns '49.5' into a float, which strict=True disables if you'd rather reject.",
    },
    {
      label: "Serialising back out",
      intro:
        "Get a dict for further processing and a JSON string for the wire. PHP hand-rolls toArray()/jsonSerialize(); v2 models ship model_dump()/model_dump_json().",
      php: `<?php
final class Product implements JsonSerializable
{
    // ...constructor as before...

    /** Hand-maintained: add a field, update this too */
    public function jsonSerialize(): array
    {
        return [
            'name'  => $this->name,
            'price' => $this->price,
            'stock' => $this->stock,
            'sku'   => $this->sku,
        ];
    }
}

echo json_encode($product);
// {"name":"Keyboard","price":49.5,"stock":12,"sku":null}`,
      ts: `p = Product(name="Keyboard", price=49.5, stock=12)

p.model_dump()
# {'name': 'Keyboard', 'price': 49.5, 'stock': 12, 'sku': None}

p.model_dump_json()
# '{"name":"Keyboard","price":49.5,"stock":12,"sku":null}'
# NOTE: compact — no spaces after : or ,

# Both take exclude/include/exclude_none, so partial
# output needs no hand-written transformer:
p.model_dump(exclude_none=True)
# {'name': 'Keyboard', 'price': 49.5, 'stock': 12}`,
      note: "model_dump/model_dump_json are generated from the field definitions, so they can never miss a field — and model_dump_json's output is compact JSON, a v1→v2 behaviour change worth knowing.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Pydantic v2's method family hand-rolled on a dataclass so you can see each job separately: coercion, constraint checks, extra-key rejection, dumping, and a JSON round-trip. Predict all seven lines, then run.",
    code: `# Pydantic v2's method family, hand-rolled on a dataclass so the
# mechanics are visible: validate (with coercion), reject extras,
# dump to dict/JSON, and round-trip.
import json
from dataclasses import dataclass, fields

@dataclass
class Product:
    name: str
    price: float
    stock: int = 0

    def __post_init__(self):
        # Coercion pass — Pydantic does this per-type in Rust core.
        if isinstance(self.stock, str) and self.stock.isdigit():
            self.stock = int(self.stock)
        # Constraint pass — like Field(min_length=1) / Field(gt=0).
        errors = []
        if not isinstance(self.name, str) or len(self.name) < 1:
            errors.append({"loc": ["name"], "type": "string_too_short"})
        if not isinstance(self.price, (int, float)) or self.price <= 0:
            errors.append({"loc": ["price"], "type": "greater_than"})
        if errors:
            raise ValueError(errors)

    @classmethod
    def model_validate(cls, data):
        extra = set(data) - {f.name for f in fields(cls)}
        if extra:  # ConfigDict(extra="forbid")
            raise ValueError([{"loc": sorted(extra), "type": "extra_forbidden"}])
        return cls(**data)

    @classmethod
    def model_validate_json(cls, raw):
        return cls.model_validate(json.loads(raw))

    def model_dump(self):
        return {f.name: getattr(self, f.name) for f in fields(self)}

    def model_dump_json(self):
        # v2 emits COMPACT JSON — no spaces after separators.
        return json.dumps(self.model_dump(), separators=(",", ":"))

p = Product.model_validate({"name": "Keyboard", "price": 49.5, "stock": "12"})
print("coerced stock:", repr(p.stock))
print("model_dump:     ", p.model_dump())
print("model_dump_json:", p.model_dump_json())

clone = Product.model_validate_json(p.model_dump_json())
print("round-trip equal:", clone == p)

try:
    Product.model_validate({"name": "Mouse", "price": 25, "color": "red"})
except ValueError as e:
    print("extra key ->", e)

try:
    Product.model_validate({"name": "", "price": -1})
except ValueError as e:
    print("bad values ->", e)`,
    output: `coerced stock: 12
model_dump:      {'name': 'Keyboard', 'price': 49.5, 'stock': 12}
model_dump_json: {"name":"Keyboard","price":49.5,"stock":12}
round-trip equal: True
extra key -> [{'loc': ['color'], 'type': 'extra_forbidden'}]
bad values -> [{'loc': ['name'], 'type': 'string_too_short'}, {'loc': ['price'], 'type': 'greater_than'}]`,
  },

  keyPoints: [
    "A Pydantic model is a PHP FormRequest + DTO + transformer in one declaration: validation rules, typed data, and serialisation all come from the field definitions.",
    "`Field()` holds per-field constraints (`gt`, `ge`, `min_length`, `max_length`, `pattern`), documentation (`description`, `examples`), and wire aliases (`alias=`).",
    "`model_config = ConfigDict(...)` sets model-wide policy: `extra='forbid'` to reject unknown keys, `str_max_length` for a global string cap, `from_attributes=True` for ORM objects — `class Config` is the deprecated v1 spelling.",
    "The v2 method family: `model_validate()` (was `parse_obj`), `model_validate_json()` (was `parse_raw`), `model_dump()` (was `.dict()`), `model_dump_json()` (was `.json()`).",
    "`model_dump_json()` produces compact JSON — no spaces after separators — unlike `json.dumps` defaults.",
    "Validation coerces by default (`'123'` → `123` for an `int` field) and collects ALL errors into one structured list rather than failing on the first.",
  ],

  interview: [
    {
      q: "You're reviewing a codebase that calls .dict() and parse_obj() on Pydantic models. What do you make of that?",
      a: "Those are Pydantic v1 names — the code either predates v2 or was written from old tutorials. In v2, every method got a `model_` prefix to avoid colliding with user-defined field names: `parse_obj` became `model_validate`, `parse_raw` became `model_validate_json`, `.dict()` became `model_dump`, and `.json()` became `model_dump_json`. Config moved from an inner `class Config` to `model_config = ConfigDict(...)`, and `orm_mode` became `from_attributes`. The v1 names still run through a deprecation shim, so the code works, but I'd migrate it — partly for warnings hygiene, partly because behaviour changed subtly too, e.g. `model_dump_json()` emits compact JSON where v1's `.json()` didn't.",
    },
    {
      q: "How would you make a Pydantic model reject unexpected fields in the request body, and why bother?",
      a: "Set `model_config = ConfigDict(extra='forbid')` on the model. By default Pydantic ignores unknown keys, which means a client sending `pricee` instead of `price` silently gets the default value — a bug that surfaces as wrong data, not as an error. With `extra='forbid'` the request fails validation with an `extra_forbidden` error naming the offending key, and FastAPI returns it in the 422 body. It's the same motivation as strict input validation in a Laravel FormRequest, but it's one line of model-wide policy instead of a rule per field.",
    },
    {
      q: "What's the difference between model_validate and model_construct?",
      a: "`model_validate` is the front door: it takes untrusted data, runs coercion and every field constraint, and raises a `ValidationError` with a structured error list if anything fails. `model_construct` skips validation entirely and just sets attributes — it exists for performance on data you already trust, like rows you just read from your own database. The rule of thumb I use: anything that crossed a process boundary goes through `model_validate`; `model_construct` is an optimisation you reach for deliberately, never a default, because it will happily build an invalid instance.",
    },
  ],

  quiz: [
    {
      question: "Which is the current Pydantic v2 way to turn a dict into a validated model instance?",
      options: [
        "Product.parse_obj(data)",
        "Product.model_validate(data)",
        "Product.from_dict(data)",
        "Product.validate_model(data)",
      ],
      answerIndex: 1,
      explain:
        "model_validate() is the v2 name; parse_obj() is its deprecated v1 predecessor (kept working by a compatibility shim). from_dict and validate_model don't exist in Pydantic.",
    },
    {
      question: "What does ConfigDict(extra='forbid') change about a model?",
      options: [
        "Fields can no longer have default values",
        "The model becomes immutable after creation",
        "Unknown keys in the input raise a validation error instead of being silently ignored",
        "Extra fields are accepted but stripped from model_dump() output",
      ],
      answerIndex: 2,
      explain:
        "By default Pydantic ignores unrecognised keys. extra='forbid' turns them into extra_forbidden validation errors — catching client typos like 'pricee'. Immutability is frozen=True; stripping-but-accepting is the default 'ignore' behaviour.",
    },
    {
      question: "A v2 model has a: list[str] = ['x', 'y']. What does model_dump_json() return?",
      options: [
        '\'{"a": ["x", "y"]}\' — same as json.dumps',
        '\'{"a":["x","y"]}\' — compact, no spaces after separators',
        "A Python dict",
        "Pretty-printed JSON with 2-space indentation",
      ],
      answerIndex: 1,
      explain:
        "model_dump_json() serialises to a compact JSON string with no spaces after ':' or ',' — a documented v1→v2 change. model_dump() (no _json) is the one that returns a dict.",
    },
    {
      question: "By default (lax mode), what does Pydantic do with {'stock': '12'} for a field declared stock: int?",
      options: [
        "Raises a ValidationError — strings are never accepted for int fields",
        "Stores the string '12' unchanged",
        "Coerces it to the integer 12",
        "Rounds it to the nearest float",
      ],
      answerIndex: 2,
      explain:
        "Default validation is lax: a numeric string is coerced to int. If you want '12' rejected for an int field, enable strict mode (ConfigDict(strict=True) or Field(strict=True)).",
    },
  ],
};

export default lesson;
