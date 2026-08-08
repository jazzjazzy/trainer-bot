import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "properties-and-methods",
  title: "Properties, classmethod & staticmethod",
  part: "OOP the Python Way",
  estMinutes: 12,
  summary:
    "@property kills getter/setter boilerplate, @classmethod is the idiomatic named-constructor pattern, and @staticmethod is your public static function.",

  concept: `
Twenty years of PHP taught you to write \`getX()\`/\`setX()\` pairs "just in
case" — because turning a public property into a method later breaks every
caller. Python solved that problem decades before PHP 8.4's property hooks:
\`@property\` lets a plain attribute become computed **without changing the
call site**.

### @property — a method wearing an attribute's clothes

\`\`\`python
class Order:
    def __init__(self, items):
        self.items = items

    @property
    def total(self):              # called as: order.total  (no parens!)
        return sum(i.price for i in self.items)
\`\`\`

\`order.total\` looks like attribute access but runs the method. That's PHP
8.4's \`public int \$total { get => ...; }\` — except Python has had it since
the early 2000s, so the whole ecosystem is built around it. Add validation on
assignment with a setter:

\`\`\`python
    @total.setter
    def total(self, value):
        raise AttributeError("total is computed")   # or validate & store
\`\`\`

With no setter defined, assignment raises \`AttributeError\` — a free
\`readonly\`-ish computed property.

### The pythonic consequence: no preemptive getters

Because you can retrofit \`@property\` **without breaking callers**, the rule
is: *start with plain public attributes*. \`user.name\`, not
\`user.get_name()\`. If validation or computation becomes necessary later,
rename the storage to \`_name\` and add a property — every existing
\`user.name\` read and \`user.name = x\` write keeps working. The
encapsulation-by-default reflex that PHP forces on you is simply unnecessary
here, and getter/setter pairs in Python code are a review-comment offence.

### @staticmethod and @classmethod

\`\`\`python
class Temperature:
    @staticmethod
    def is_freezing(c):           # ≈ public static function — no self
        return c <= 0

    @classmethod
    def from_fahrenheit(cls, f):  # receives the CLASS as cls
        return cls((f - 32) * 5 / 9)
\`\`\`

\`@staticmethod\` is exactly PHP's \`public static function\`: no instance, no
class, just a function namespaced inside the class. \`@classmethod\` has no
direct PHP keyword: it receives the **class itself** as \`cls\` — the analogue
of PHP's late static binding \`static::\`. It's the idiomatic **alternative
constructor** pattern: \`datetime.fromtimestamp(...)\`, \`dict.fromkeys(...)\`,
your own \`User.from_dict(row)\` / \`Config.from_json(text)\`. Because it builds
via \`cls(...)\` rather than a hard-coded class name, subclasses inherit the
factory and get instances of *themselves* — same reason you use
\`new static()\` instead of \`new self()\` in PHP.

### These are decorators

The \`@\` lines are **decorators** — functions that wrap or replace the thing
defined below them. \`@property\` takes your method and returns a descriptor
object that intercepts attribute access. A later section unpacks the
mechanics; for now, treat \`@property\`, \`@x.setter\`, \`@classmethod\` and
\`@staticmethod\` as syntax you apply, like PHP attributes that actually *do*
something at definition time.

### One insight to keep: methods resolve through the class

\`obj.method()\` is \`type(obj).method(obj)\` — binding \`self\` is the only
magic. That's also why \`@property\` can exist at all: attribute access on an
instance consults the class first, and property objects hook that lookup.
`,

  comparisons: [
    {
      label: "Computed property vs getter method",
      intro:
        "An order total derived from its items. PHP pre-8.4 needs a method call at every use site; Python (and PHP 8.4 hooks) keep attribute syntax.",
      php: `<?php
// Classic PHP — the getter is forever in the API
class Order
{
    public function __construct(private array $items) {}

    public function getTotal(): int
    {
        return array_sum(
            array_map(fn($i) => $i->price, $this->items)
        );
    }
}

echo $order->getTotal();   // parentheses at every call site

// PHP 8.4 finally added hooks:
// public int $total { get => ...; }`,
      ts: `# Python — @property, callers use attribute syntax
class Order:
    def __init__(self, items):
        self.items = items

    @property
    def total(self):
        return sum(i.price for i in self.items)

print(order.total)    # no parens — looks like a field

# No setter defined, so this raises AttributeError:
# order.total = 0`,
      note:
        "order.total runs the method through attribute access — what PHP only got with 8.4 property hooks. A property without a setter is effectively read-only.",
    },
    {
      label: "Evolving a plain attribute — no callers break",
      intro:
        "A User starts with a public name attribute; months later you need validation. The upgrade path is why Python skips preemptive getters.",
      php: `<?php
// Pre-8.4 PHP: going from public property to
// validated access = breaking change, so you
// defensively write accessors from day one.
class User
{
    private string $name;

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): void
    {
        if ($name === '') {
            throw new InvalidArgumentException('empty');
        }
        $this->name = $name;
    }
}`,
      ts: `# Day 1 — just a plain attribute. Ship it.
class User:
    def __init__(self, name):
        self.name = name

# Month 6 — validation needed. Same public API:
class User:
    def __init__(self, name):
        self.name = name          # goes through the setter

    @property
    def name(self):
        return self._name

    @name.setter
    def name(self, value):
        if not value:
            raise ValueError("empty")
        self._name = value

# user.name and user.name = "Ada" still work unchanged`,
      note:
        "Retrofit a property whenever needed — reads and writes at call sites are untouched. That's why idiomatic Python starts with bare attributes, never get_/set_ pairs.",
    },
    {
      label: "Static factory / alternative constructor",
      intro:
        "Building a User from a database row via a named constructor, in a way that subclasses inherit correctly.",
      php: `<?php
class User
{
    public function __construct(
        public readonly string $name,
        public readonly string $email,
    ) {}

    // static:: = late static binding, so
    // AdminUser::fromRow() yields an AdminUser
    public static function fromRow(array $row): static
    {
        return new static($row['name'], $row['email']);
    }
}

$u = User::fromRow($row);`,
      ts: `class User:
    def __init__(self, name, email):
        self.name = name
        self.email = email

    @classmethod
    def from_row(cls, row):
        # cls is whatever class was called on —
        # Admin.from_row(...) returns an Admin
        return cls(row["name"], row["email"])

    @staticmethod
    def valid_email(s):          # plain static: no cls, no self
        return "@" in s

u = User.from_row(row)`,
      note:
        "@classmethod's cls parameter is PHP's late-static-binding static:: — subclasses inherit factories that build instances of themselves. @staticmethod is a plain static function.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A Temperature class using all three decorators. Note that __init__ assigns self.celsius — which setter does that trigger? Predict all six lines including the rejected assignment.",
    code: `class Temperature:
    def __init__(self, celsius):
        self.celsius = celsius   # runs the setter below

    @property
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError("below absolute zero")
        self._celsius = value

    @property
    def fahrenheit(self):        # computed, read-only
        return self._celsius * 9 / 5 + 32

    @classmethod
    def from_fahrenheit(cls, f):
        return cls((f - 32) * 5 / 9)

    @staticmethod
    def is_freezing(celsius):
        return celsius <= 0

t = Temperature(25)
print(t.celsius)
print(t.fahrenheit)

t.celsius = 100                  # plain assignment, validated
print(t.fahrenheit)

boiling = Temperature.from_fahrenheit(212)
print(boiling.celsius)
print(Temperature.is_freezing(-5))

try:
    t.celsius = -300
except ValueError as e:
    print(f"rejected: {e}")`,
    output: `25
77.0
212.0
100.0
True
rejected: below absolute zero`,
  },

  keyPoints: [
    "`@property` makes a method readable as an attribute — `order.total`, no parens. PHP only got this with 8.4 property hooks; Python has had it for decades.",
    "`@name.setter` validates plain assignments (`t.celsius = 100`); with no setter, assignment raises `AttributeError` — a read-only computed property.",
    "Start with plain public attributes — you can retrofit `@property` later WITHOUT breaking callers, so preemptive `get_x()`/`set_x()` pairs are un-pythonic.",
    "`@staticmethod` ≈ `public static function`: no `self`, no `cls`, just a namespaced function.",
    "`@classmethod` receives `cls` — PHP's `static::` late static binding — and is THE idiomatic alternative-constructor pattern (`from_dict`, `from_json`, `datetime.fromtimestamp`).",
    "These are decorators (mechanics come later); underneath, `obj.method()` is just `type(obj).method(obj)` — attribute lookup through the class is the only magic.",
  ],

  interview: [
    {
      q: "Why does idiomatic Python avoid getters and setters when PHP code is full of them?",
      a: "Because Python can convert a plain attribute into managed access *after the fact*. In pre-8.4 PHP, changing `$user->name` to validated access means introducing `getName()`/`setName()` and touching every caller, so you defensively write accessors up front. In Python you ship `self.name`, and if validation is ever needed you rename storage to `_name` and add `@property`/`@name.setter` — every existing `user.name` read and write keeps working. Uniform access without breaking changes removes the entire reason preemptive getters exist. PHP 8.4's property hooks are precisely this feature arriving in PHP.",
    },
    {
      q: "When do you choose @classmethod over @staticmethod?",
      a: "`@staticmethod` when the function merely lives in the class's namespace and touches neither instance nor class — a `public static function`. `@classmethod` when you need the class itself, which almost always means an **alternative constructor**: `User.from_row(row)` calls `cls(...)`, so a subclass calling `Admin.from_row(row)` gets an `Admin` back — the exact reason PHP uses `new static()` over `new self()`. If I see a `@staticmethod` that hard-codes its own class name to construct instances, that's a bug waiting for the first subclass; it should be a classmethod.",
    },
    {
      q: "How does @property interact with __init__ in the validated-setter pattern?",
      a: "The trick is that `__init__` assigns to the *public* name: `self.celsius = celsius`. Attribute assignment is resolved through the class, finds the property's setter, and runs the validation — so construction goes through the same guard as later assignments, with zero duplicated checks. The setter then stores to a differently-named private slot, conventionally `self._celsius`, which the getter reads. Storing to `self.celsius` inside the setter would recurse into the setter forever, which is the classic first-week mistake.",
    },
  ],

  quiz: [
    {
      question: "A class defines `@property def total(self): ...` with no setter. What happens on `order.total = 0`?",
      options: [
        "The value 0 shadows the property on the instance",
        "It raises AttributeError — the property is effectively read-only",
        "Python auto-generates a setter storing to _total",
        "It works, but only outside the class body",
      ],
      answerIndex: 1,
      explain:
        "A property without a setter rejects assignment with AttributeError (\"...has no setter\" in 3.11+ wording). Properties are data descriptors on the class, so they intercept the write — instance shadowing doesn't apply.",
    },
    {
      question: "What is the closest PHP analogue of @classmethod's `cls` parameter?",
      options: [
        "$this inside a static method",
        "self:: — early static binding",
        "static:: — late static binding, so subclasses build themselves",
        "parent::",
      ],
      answerIndex: 2,
      explain:
        "cls is bound to the class the method was called on, not the class where it's defined — Admin.from_row() gets cls=Admin. That's late static binding: return cls(...) ≈ return new static(...).",
    },
    {
      question: "Why is starting with a plain public attribute considered safe in Python but risky in pre-8.4 PHP?",
      options: [
        "Python attributes are immutable by default",
        "You can later replace the attribute with @property without changing any caller's syntax",
        "Python has no public attributes — everything is private",
        "PHP properties are slower than methods",
      ],
      answerIndex: 1,
      explain:
        "Uniform access: obj.name works identically whether it's a stored attribute or a property method. Retrofitting validation/computation is invisible to callers, so encapsulation boilerplate 'just in case' buys nothing. PHP 8.4 property hooks finally give PHP the same escape hatch.",
    },
  ],
};

export default lesson;
