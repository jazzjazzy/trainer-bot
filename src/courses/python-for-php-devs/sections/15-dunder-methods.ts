import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "dunder-methods",
  title: "Dunder Methods: __str__, __eq__ & Operator Overloading",
  part: "OOP the Python Way",
  estMinutes: 14,
  summary:
    "Python's magic methods are pervasive and respectable: __str__/__repr__, __eq__/__hash__, __len__/__getitem__, and real operator overloading PHP has never had.",

  concept: `
You know magic methods — \`__toString\`, \`__get\`, \`__invoke\` — as PHP's
slightly shameful escape hatches. Python's **dunder** (double-underscore)
methods are the same idea promoted to the core design of the language: *every*
built-in operation — \`print\`, \`==\`, \`len()\`, \`in\`, \`[]\`, \`+\` — is
defined by a dunder, and implementing them on your own classes is normal,
encouraged engineering.

### __repr__ and __str__ — the split PHP lacks

PHP has one string conversion, \`__toString\`. Python has two:

- \`__repr__\` — the **developer** view: unambiguous, ideally valid code to
  recreate the object, e.g. \`Money(500, 'AUD')\`. Used by the REPL, debuggers,
  and — crucially — when the object sits **inside a container**:
  \`print([m])\` shows reprs.
- \`__str__\` — the **user** view: \`5.00 AUD\`. Used by \`print()\` and
  \`f"{m}"\`. If you don't define it, \`str()\` falls back to \`__repr__\`.

Rule of thumb: always define \`__repr__\`; add \`__str__\` only when a friendly
display differs. (\`f"{m!r}"\` forces the repr inside an f-string.)

### __eq__ and the identity default

Big gotcha, opposite of PHP: PHP's \`==\` on two objects compares class +
properties out of the box. Python's default \`==\` is **identity** — the same
as PHP's \`===\` — until you define \`__eq__\`:

\`\`\`python
def __eq__(self, other):
    if not isinstance(other, Money):
        return NotImplemented        # let the other side try
    return (self.cents, self.currency) == (other.cents, other.currency)
\`\`\`

Returning \`NotImplemented\` (a special value, not an exception) for foreign
types lets Python ask the other operand — that's how mixed-type comparisons
stay symmetric.

And the coupled fact: defining \`__eq__\` sets \`__hash__\` to \`None\`, making
instances **unhashable** — unusable as dict keys or set members — unless you
also define \`__hash__\` over the same fields. Equal objects must hash equal;
that's the contract dicts rely on.

### The protocol dunders — duck typing's plumbing

- \`__len__\` → \`len(obj)\` (≈ what \`Countable::count()\` enables).
- \`__contains__\` → \`x in obj\` (falls back to iteration if absent).
- \`__getitem__\` / \`__setitem__\` → \`obj[key]\` — PHP's \`ArrayAccess\`, minus
  the interface: no \`implements\` needed, the method's existence IS the contract.
- \`__iter__\` → \`for x in obj\` (≈ \`IteratorAggregate\`).
- \`__call__\` → \`obj(...)\` — PHP's \`__invoke\`.
- \`__getattr__\` → fallback for *missing* attributes — PHP's \`__get\` (Python
  also has \`__getattribute__\`, which intercepts *every* access; rarely touched).

### Operator overloading — PHP has none

PHP never let userland define \`+\` on objects. Python does, per operator:
\`__add__\` (\`+\`), \`__sub__\`, \`__mul__\`, \`__lt__\`/\`__le__\`/\`__gt__\`/\`__ge__\`
(comparisons), and friends. \`a + b\` calls \`a.__add__(b)\`; if that returns
\`NotImplemented\`, Python tries the reflected \`b.__radd__(a)\`. Define
\`__eq__\` plus **one** ordering method and the \`@functools.total_ordering\`
class decorator fills in the rest.

This is why value objects shine in Python: \`Money(500) + Money(250)\`,
\`sorted(prices)\`, \`Decimal\`, \`datetime - datetime\`, \`Path / "sub" / "file.txt"\`
— all dunders. Used on genuine value types it's expressive; overloading \`+\`
to mean "send an email" is the same abuse it would be anywhere.

### Respectability

In PHP, heavy magic-method use raises eyebrows. In Python, a class WITHOUT
\`__repr__\` and \`__eq__\` is the code smell. Dunders are called *by the
interpreter*, not by you — you write \`len(x)\`, never \`x.__len__()\`.
`,

  comparisons: [
    {
      label: "String conversion: one method vs two",
      intro:
        "Making a Money object printable. Python splits the friendly display from the debugging display; PHP has a single __toString.",
      php: `<?php
class Money
{
    public function __construct(
        public readonly int $cents,
        public readonly string $currency,
    ) {}

    public function __toString(): string
    {
        return sprintf(
            '%.2f %s', $this->cents / 100, $this->currency
        );
    }
}

echo new Money(500, 'AUD');       // 5.00 AUD
var_dump([new Money(500, 'AUD')]); // verbose object dump`,
      ts: `class Money:
    def __init__(self, cents, currency):
        self.cents = cents
        self.currency = currency

    def __repr__(self):                     # for developers
        return f"Money({self.cents}, {self.currency!r})"

    def __str__(self):                      # for users
        return f"{self.cents / 100:.2f} {self.currency}"

m = Money(500, "AUD")
print(m)         # 5.00 AUD            (__str__)
print([m])       # [Money(500, 'AUD')] (__repr__!)
print(f"{m!r}")  # Money(500, 'AUD')`,
      note:
        "print() and f-strings use __str__, but containers, the REPL and debuggers show __repr__ — define __repr__ first; str() falls back to it.",
    },
    {
      label: "Equality: opposite defaults",
      intro:
        "Comparing two objects holding identical data. PHP's == already compares properties; Python compares identity until you implement __eq__.",
      php: `<?php
class Point
{
    public function __construct(
        public int $x,
        public int $y,
    ) {}
}

$a = new Point(1, 2);
$b = new Point(1, 2);
var_dump($a == $b);    // true  — same class & properties
var_dump($a === $b);   // false — different instances`,
      ts: `class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

a = Point(1, 2)
b = Point(1, 2)
print(a == b)   # False! default == is identity (PHP's ===)

class Point2(Point):
    def __eq__(self, other):
        if not isinstance(other, Point2):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)

    def __hash__(self):   # defining __eq__ disabled hashing
        return hash((self.x, self.y))

print(Point2(1, 2) == Point2(1, 2))   # True`,
      note:
        "Python's default == is identity, not a property-by-property compare — and defining __eq__ sets __hash__ to None, so add __hash__ if instances go in dicts/sets.",
    },
    {
      label: "Container protocol vs ArrayAccess",
      intro:
        "A Basket usable with [], len()/count() and in/isset — PHP declares interfaces; Python just implements the dunders.",
      php: `<?php
class Basket implements ArrayAccess, Countable
{
    private array $items = [];

    public function offsetGet(mixed $k): mixed
    {
        return $this->items[$k];
    }
    public function offsetSet(mixed $k, mixed $v): void
    {
        $this->items[$k] = $v;
    }
    public function offsetExists(mixed $k): bool
    {
        return isset($this->items[$k]);
    }
    public function offsetUnset(mixed $k): void
    {
        unset($this->items[$k]);
    }
    public function count(): int
    {
        return count($this->items);
    }
}`,
      ts: `class Basket:
    def __init__(self):
        self._items = {}

    def __getitem__(self, key):          # basket[key]
        return self._items[key]

    def __setitem__(self, key, value):   # basket[key] = v
        self._items[key] = value

    def __contains__(self, key):         # key in basket
        return key in self._items

    def __len__(self):                   # len(basket)
        return len(self._items)

b = Basket()
b["apple"] = 3
print(b["apple"], "apple" in b, len(b))   # 3 True 1`,
      note:
        "No interface declaration — implementing the dunders IS the contract (duck typing). __getitem__/__setitem__ ≈ ArrayAccess, __len__ ≈ Countable, __contains__ powers in.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A Money value object exercising six dunders. Predict each line — especially print(a) vs print([b]) (str or repr?), == vs is, and whether the dict lookup with a NEW Money object finds the key.",
    code: `class Money:
    def __init__(self, cents, currency):
        self.cents = cents
        self.currency = currency

    def __repr__(self):
        return f"Money({self.cents}, {self.currency!r})"

    def __str__(self):
        return f"{self.cents / 100:.2f} {self.currency}"

    def __eq__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return (self.cents, self.currency) == (other.cents, other.currency)

    def __hash__(self):
        return hash((self.cents, self.currency))

    def __add__(self, other):
        if self.currency != other.currency:
            raise ValueError("currency mismatch")
        return Money(self.cents + other.cents, self.currency)

    def __lt__(self, other):
        return self.cents < other.cents

a = Money(1999, "AUD")
b = Money(500, "AUD")

print(a)                         # print() uses __str__
print(repr(b))                   # debugging view
print(a + b)                     # __add__
print(a == Money(1999, "AUD"))   # __eq__, value equality
print(a is Money(1999, "AUD"))   # identity: different objects
print(min(a, b))                 # __lt__ powers min/sorted
print([b])                       # containers display the repr

prices = {a: "keyboard"}         # __hash__ makes Money dict-keyable
print(prices[Money(1999, "AUD")])`,
    output: `19.99 AUD
Money(500, 'AUD')
24.99 AUD
True
False
5.00 AUD
[Money(500, 'AUD')]
keyboard`,
  },

  keyPoints: [
    "Dunders are PHP magic methods made pervasive and respectable — every builtin operation (`print`, `==`, `len`, `in`, `[]`, `+`) dispatches to one.",
    "`__str__` ≈ `__toString` (user-facing, used by `print`/f-strings); `__repr__` is the debugging view — containers and the REPL show it, and `str()` falls back to it. Define `__repr__` on every class.",
    "Python's default `==` is IDENTITY (PHP's `===`) — the opposite of PHP's property-comparing `==`. Define `__eq__` for value equality, return `NotImplemented` for foreign types.",
    "Defining `__eq__` sets `__hash__ = None`: add a matching `__hash__` (over the same fields) or instances can't be dict keys / set members.",
    "`__len__` → `len()`, `__contains__` → `in`, `__getitem__` → `obj[key]` (≈ ArrayAccess), `__call__` → `obj()` (≈ __invoke), `__getattr__` → missing-attribute fallback (≈ __get).",
    "Real operator overloading — `__add__`, `__lt__`, etc. — which PHP has never had; `@functools.total_ordering` derives the remaining comparisons from `__eq__` + one ordering method.",
  ],

  interview: [
    {
      q: "What's the difference between __str__ and __repr__, and which should every class define?",
      a: "`__str__` is the user-facing display — what `print()` and f-strings use — the analogue of PHP's `__toString`. `__repr__` is the unambiguous developer view, ideally valid code to reconstruct the object (`Money(500, 'AUD')`); the REPL, debuggers, error messages, and *elements inside containers* all show the repr. Every class should define `__repr__`: `str()` falls back to it when `__str__` is absent, but nothing falls back the other way, so a class with only `__str__` still prints as `<Money object at 0x...>` inside a list. Add `__str__` only when the human display genuinely differs.",
    },
    {
      q: "How does object equality in Python differ from PHP, and what's the __hash__ trap?",
      a: "It's inverted: PHP's `==` on objects compares class and properties by default, but Python's default `==` is identity — effectively PHP's `===` — so two `Point(1, 2)` instances are unequal until you implement `__eq__`. The trap: as soon as you define `__eq__`, Python sets `__hash__` to `None`, making instances unhashable — they can no longer be dict keys or live in sets. You must define `__hash__` over the same fields as `__eq__` so that equal objects hash equal; hashing a tuple of the fields, `hash((self.x, self.y))`, is the standard move. `@dataclass(eq=True, frozen=True)` generates the consistent pair for you.",
    },
    {
      q: "Python lets you overload operators like + and <. When is that good design, given PHP survives fine without it?",
      a: "For genuine value types with obvious algebra: `Money + Money`, `Vector * scalar`, `datetime - datetime`, `Path / 'subdir'`. There the operator is *more* readable than `->add()` because it matches the domain notation, and it composes with the language — `__lt__` makes `sorted(prices)` and `min()` just work, no `usort` comparator. `@functools.total_ordering` keeps the boilerplate down: define `__eq__` plus one of `__lt__`/`__le__`/`__gt__`/`__ge__` and it derives the rest. The discipline is the same one PHP's absence of the feature enforces for you: never give an operator a meaning a reader couldn't guess — `report + email` meaning 'send' is abuse, not API design.",
    },
    {
      q: "Map Python's protocol dunders to the PHP interfaces you know.",
      a: "`__getitem__`/`__setitem__` are `ArrayAccess::offsetGet/offsetSet` (with `__contains__` playing `offsetExists` for the `in` operator); `__len__` is `Countable::count()` powering `len()`; `__iter__` covers `IteratorAggregate`; `__call__` is `__invoke`; `__getattr__` is `__get` — a fallback that only fires when normal attribute lookup fails. The key difference: no `implements` declaration. Duck typing means defining the method *is* joining the protocol — any object with `__getitem__` can be subscripted, and `collections.abc` provides optional base classes when you want isinstance checks and mixin methods.",
    },
  ],

  quiz: [
    {
      question: "With both __str__ and __repr__ defined on Money, what does `print([Money(500, 'AUD')])` show for the element?",
      options: [
        "The __str__ result — print always uses str",
        "The __repr__ result — containers format their elements with repr",
        "A memory address like <Money object at 0x...>",
        "It raises TypeError: list contains non-string",
      ],
      answerIndex: 1,
      explain:
        "print(list) calls str() on the LIST, but the list's own formatting shows each element's repr — that's why debug output stays unambiguous. Only a direct print(m) or f\"{m}\" uses __str__.",
    },
    {
      question: "Two instances hold identical data and define no dunders. What does `a == b` give in Python vs `$a == $b` in PHP?",
      options: [
        "Both true — value comparison in both languages",
        "Python True, PHP false",
        "Python False (default == is identity), PHP true (== compares properties)",
        "Both false — objects always compare by reference",
      ],
      answerIndex: 2,
      explain:
        "The defaults are opposite: PHP's loose == compares class + property values, while Python's default __eq__ is identity (like PHP's ===). You must implement __eq__ to get value semantics in Python.",
    },
    {
      question: "You add __eq__ to a class and suddenly `{obj: 1}` raises `TypeError: unhashable type`. Why?",
      options: [
        "Dict keys must be strings or ints in Python",
        "Defining __eq__ sets __hash__ to None; you must define a matching __hash__ too",
        "__eq__ must return NotImplemented for dicts to work",
        "You also need __contains__ for dict membership",
      ],
      answerIndex: 1,
      explain:
        "The hash/eq contract requires equal objects to hash equal. Since your custom __eq__ breaks the default identity hash's guarantee, Python disables hashing until you supply __hash__ — typically hash() of the same field tuple __eq__ compares.",
    },
    {
      question: "Which pairing is WRONG?",
      options: [
        "__call__ ≈ PHP __invoke",
        "__getitem__ ≈ PHP ArrayAccess::offsetGet",
        "__getattr__ ≈ PHP __get (missing-property fallback)",
        "__len__ ≈ PHP __toString",
      ],
      answerIndex: 3,
      explain:
        "__len__ powers len(obj) — the analogue of Countable::count(). String conversion is __str__ (≈ __toString), with __repr__ as the debugging counterpart PHP doesn't have.",
    },
  ],
};

export default lesson;
