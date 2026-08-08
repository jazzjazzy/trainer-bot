import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "dataclasses",
  title: "Dataclasses: Value Objects Without Boilerplate",
  part: "OOP the Python Way",
  estMinutes: 12,
  summary:
    "@dataclass generates __init__, __repr__ and __eq__ from annotations — constructor property promotion taken further, with frozen=True as your readonly class.",

  concept: `
PHP 8's constructor property promotion collapsed the declare-then-assign
constructor into the signature. Python's \`@dataclass\` decorator goes one step
further: you write **only the annotated fields**, and the decorator generates
\`__init__\`, \`__repr__\` and \`__eq__\` for you.

\`\`\`python
from dataclasses import dataclass

@dataclass
class Money:
    amount: int
    currency: str = "AUD"
\`\`\`

That's a class with a two-argument constructor, a readable
\`Money(amount=500, currency='AUD')\` repr, and value-based equality —
\`Money(500) == Money(500)\` is \`True\`, where two separate plain-class instances
(like two PHP objects compared with \`===\`) would not be.

### Defaults and the mutable-default trap, again

Field defaults look like ordinary assignments — but a **mutable** default
(list, dict, set) would be shared across every instance, the same trap as
mutable default *arguments*. Dataclasses refuse to let you write it and make
you use a factory:

\`\`\`python
from dataclasses import dataclass, field

@dataclass
class Cart:
    items: list = field(default_factory=list)  # fresh list per instance
\`\`\`

### frozen=True ≈ readonly class (PHP 8.2)

\`@dataclass(frozen=True)\` makes every field immutable: assigning after
construction raises \`FrozenInstanceError\`. Frozen instances are also
**hashable**, so they work as dict keys and set members — the classic immutable
value object. \`order=True\` additionally generates \`__lt__\`/\`__le__\`/etc.
comparing fields in declaration order, so \`sorted()\`, \`min()\` and \`max()\` just
work.

### Useful extras

- \`asdict(obj)\` converts an instance (recursively) to a plain dict — handy for
  JSON serialisation, roughly your \`toArray()\` method for free.
- \`kw_only=True\` (3.10) makes all generated \`__init__\` parameters keyword-only,
  so call sites read like named arguments in PHP 8.
- Annotations drive the code generation, but they are still **not
  runtime-enforced types**: \`Money("lots")\` constructs happily. The decorator
  reads the annotations; it does not validate against them.

### NamedTuple: the tuple-flavoured alternative

\`typing.NamedTuple\` looks similar — annotated fields, auto-generated
constructor — but instances **are tuples**: immutable by nature, unpackable
(\`x, y = point\`), indexable, and equal to plain tuples with the same values.
Choose \`NamedTuple\` for tiny, naturally tuple-ish records (a coordinate, a
(key, value) pair with names); choose \`@dataclass\` when you want mutability
options, \`field()\` features, methods and post-init logic, or to avoid the
sometimes-surprising tuple behaviours.

### A taste of the ecosystem: Pydantic

Dataclasses generate structure but never validate. **Pydantic** models (the
backbone of FastAPI) look nearly identical yet **enforce and coerce types at
runtime**, raising validation errors for bad input — closer to a PHP DTO with
validator attributes. Stdlib dataclasses for internal value objects; Pydantic
at the edges where untrusted data enters.
`,

  comparisons: [
    {
      label: "A value object",
      intro:
        "An immutable Money type holding an amount and a currency with a default. Both versions give you a constructor and read-only fields in a handful of lines.",
      php: `<?php
// PHP 8.2 — promotion + readonly class
readonly class Money {
    public function __construct(
        public int $amount,
        public string $currency = 'AUD',
    ) {}
}

$m = new Money(500);
// $m->amount = 600;  // Error: cannot modify readonly property`,
      ts: `# money.py
from dataclasses import dataclass

@dataclass(frozen=True)
class Money:
    amount: int
    currency: str = "AUD"

m = Money(500)
# m.amount = 600  # FrozenInstanceError
print(m)          # Money(amount=500, currency='AUD')`,
      note:
        "Even less typing than promotion: no constructor at all. And unlike PHP objects, you also get __eq__ and __repr__ generated — Money(500) == Money(500) is True out of the box.",
    },
    {
      label: "A mutable collection field",
      intro:
        "A Cart that starts with an empty item list per instance. The Python version must dodge the shared-mutable-default trap.",
      php: `<?php
class Cart {
    /** @var Money[] */
    public array $items = [];

    public function __construct(
        public string $owner,
    ) {}
}
// Every Cart gets its own empty array — PHP copies arrays by value`,
      ts: `# cart.py
from dataclasses import dataclass, field

@dataclass
class Cart:
    owner: str
    items: list = field(default_factory=list)

# items: list = []  would be REJECTED by @dataclass:
# a shared list would leak between instances`,
      note:
        "PHP arrays are value types so a [] default is safe; Python lists are shared references, so dataclasses ban mutable defaults outright and make you pass a factory.",
    },
    {
      label: "Dataclass vs NamedTuple",
      intro:
        "The same Point record twice on the Python side — once as a dataclass, once tuple-backed and unpackable. (PHP has one spelling; Python makes you choose.)",
      php: `<?php
// PHP: one obvious spelling
readonly class Point {
    public function __construct(
        public float $x,
        public float $y,
    ) {}
}
$p = new Point(1.0, 2.0);
$x = $p->x;`,
      ts: `# point.py
from dataclasses import dataclass
from typing import NamedTuple

@dataclass(frozen=True)
class PointDC:
    x: float
    y: float

class PointNT(NamedTuple):
    x: float
    y: float

x, y = PointNT(1.0, 2.0)       # unpacks like a tuple
# x, y = PointDC(1.0, 2.0)     # TypeError: not iterable`,
      note:
        "NamedTuple instances ARE tuples — unpackable, indexable, equal to (1.0, 2.0). Dataclasses are richer (field(), kw_only, mutability) but don't unpack.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A frozen, ordered Money and a Cart with a default_factory list. Predict the repr, the equality result, what min() picks, whether the carts share a list, and what mutating a frozen instance raises.",
    code: `from dataclasses import dataclass, field, asdict

@dataclass(frozen=True, order=True)
class Money:
    amount: int
    currency: str = "AUD"

@dataclass
class Cart:
    owner: str
    items: list[Money] = field(default_factory=list)

a = Money(500)
b = Money(500)
print(a)
print(a == b)

prices = [Money(900), Money(150), Money(300)]
print(min(prices))

c1 = Cart("ada")
c2 = Cart("bob")
c1.items.append(Money(999))
print(len(c1.items), len(c2.items))

print(asdict(c1))

try:
    a.amount = 600
except Exception as e:
    print(type(e).__name__)`,
    output: `Money(amount=500, currency='AUD')
True
Money(amount=150, currency='AUD')
1 0
{'owner': 'ada', 'items': [{'amount': 999, 'currency': 'AUD'}]}
FrozenInstanceError`,
  },

  keyPoints: [
    "`@dataclass` generates `__init__`, `__repr__` and `__eq__` from class-level annotations — constructor property promotion with even less code, plus value equality for free.",
    "Mutable defaults (list/dict/set) are rejected; use `field(default_factory=list)` to get a fresh object per instance — the mutable-default trap again.",
    "`frozen=True` ≈ a PHP 8.2 `readonly` class: assignment raises `FrozenInstanceError`, and frozen instances are hashable (usable as dict keys).",
    "`order=True` generates `__lt__` etc. comparing fields in declaration order; `asdict()` recursively converts to a plain dict; `kw_only=True` (3.10) forces keyword-only construction.",
    "`typing.NamedTuple` is the tuple-backed sibling: immutable and unpackable — pick it for tiny record types, `@dataclass` for everything richer.",
    "Annotations drive the generation but are not enforced: `Money(\"lots\")` constructs fine. For runtime validation of untrusted data, the ecosystem answer is Pydantic.",
  ],

  interview: [
    {
      q: "How do Python dataclasses compare with PHP 8's constructor property promotion?",
      a: "Same problem, one step further. Promotion moves property declarations into the constructor signature; `@dataclass` removes the constructor entirely — you list annotated fields and the decorator generates `__init__`, plus `__repr__` and `__eq__`, which PHP never gives you (object comparison in PHP is identity or property-by-property `==`; dataclasses give clean value equality by default). `frozen=True` is the analogue of a `readonly` class and additionally makes instances hashable. The main gotcha coming from PHP: field annotations aren't enforced at runtime, and mutable defaults must go through `field(default_factory=...)` because Python lists are shared references, unlike PHP's copy-on-write arrays.",
    },
    {
      q: "When would you pick NamedTuple over a dataclass, or Pydantic over both?",
      a: "`NamedTuple` for tiny, naturally tuple-shaped records — a coordinate, an (id, score) pair — where unpacking (`x, y = point`) and tuple compatibility are assets and immutability is inherent. `@dataclass` for real domain objects: it supports mutability when needed, `field()` defaults and factories, `kw_only`, ordering, and post-init logic. Neither validates anything at runtime — `Money(\"lots\")` is accepted. Pydantic models enforce and coerce the annotated types when data is untrusted, which is why FastAPI is built on them; the usual split is stdlib dataclasses internally, Pydantic at API boundaries.",
    },
    {
      q: "Why does @dataclass reject items: list = [] as a field default?",
      a: "Because that single list object would be created once, at class-definition time, and shared by every instance that doesn't pass its own — one cart's `items.append()` would show up in all carts. It's the same class of bug as mutable default arguments. PHP developers rarely hit this because PHP arrays are value types with copy-on-write semantics; a `[]` property default is genuinely per-instance there. Dataclasses turn the foot-gun into an immediate `ValueError` at class definition and make you write `field(default_factory=list)`, which calls the factory per instance.",
    },
  ],

  quiz: [
    {
      question: "Which methods does a bare @dataclass generate by default?",
      options: [
        "__init__ only",
        "__init__, __repr__ and __eq__",
        "__init__, __eq__ and __lt__",
        "__init__, __repr__, __eq__ and __hash__ on every class",
      ],
      answerIndex: 1,
      explain:
        "By default @dataclass generates __init__, __repr__ and __eq__. Ordering methods need order=True, and hashability comes with frozen=True (or unsafe_hash) — a mutable dataclass is deliberately unhashable.",
    },
    {
      question: "What is the closest PHP analogue of @dataclass(frozen=True)?",
      options: [
        "An abstract class",
        "A class using __set magic to log writes",
        "A readonly class (PHP 8.2) — immutable after construction",
        "An enum",
      ],
      answerIndex: 2,
      explain:
        "frozen=True blocks all field assignment after __init__, raising FrozenInstanceError — the same contract as a PHP 8.2 readonly class, with the bonus that frozen instances are hashable.",
    },
    {
      question: "Why must a list field use field(default_factory=list) instead of = []?",
      options: [
        "Lists cannot be dataclass fields at all",
        "= [] would be one shared list across all instances, so dataclasses reject it",
        "default_factory is faster",
        "It is only a style preference enforced by linters",
      ],
      answerIndex: 1,
      explain:
        "A class-level [] default is evaluated once and would be shared by reference across instances — the mutable-default trap. @dataclass raises a ValueError for mutable defaults; default_factory runs per instance and hands each object a fresh list.",
    },
    {
      question: "Money(amount=int annotated) is constructed as Money(\"lots\"). What happens with a stdlib dataclass?",
      options: [
        "TypeError at construction, like PHP strict types",
        "The string is coerced to an int",
        "It constructs fine — annotations are not enforced at runtime",
        "mypy raises an exception at runtime",
      ],
      answerIndex: 2,
      explain:
        "The decorator uses annotations to generate code, not to validate values — the interpreter never checks them. Static checkers flag the call, and Pydantic-style libraries add runtime validation, but stdlib dataclasses accept whatever you pass.",
    },
  ],
};

export default lesson;
