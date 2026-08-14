import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "inheritance-and-duck-typing",
  title: "Inheritance, Duck Typing & Protocols",
  part: "OOP the Python Way",
  estMinutes: 13,
  summary:
    "How Python spells extends and interfaces — multiple inheritance, mixins, ABCs, Protocols — and why most Python code just calls the method and trusts the duck.",

  concept: `
PHP gives you single inheritance plus \`interface\` and \`trait\` to fill the gaps.
Python collapses all three into one mechanism — **classes, possibly several of
them** — and then adds a cultural twist: much of the time it doesn't check types
at all. If the object has the method, Python calls it.

### extends → parentheses

\`class Child extends Parent\` becomes \`class Child(Parent):\`. Calling the parent
constructor is \`super().__init__(...)\` instead of \`parent::__construct(...)\` —
and exactly as in PHP, the parent's \`__init__\` is **not** called automatically
if you define your own, so forgetting \`super().__init__()\` is a classic bug.

\`\`\`python
class AdminUser(User):
    def __init__(self, name: str, level: int):
        super().__init__(name)   # parent::__construct($name)
        self.level = level
\`\`\`

### Multiple inheritance and mixins ≈ traits

Python allows \`class StripeGateway(LoggerMixin, PaymentGateway):\` — more than
one base class. The idiomatic use is **mixins**: small classes that bundle
reusable methods, playing the role PHP traits play. When two bases define the
same method, Python resolves it with the **MRO** (method resolution order),
computed by the **C3 linearisation** algorithm — a deterministic left-to-right
ordering you can inspect with \`ClassName.__mro__\`. This is also why you call
\`super()\` rather than naming the parent class: \`super()\` follows the MRO, so
every class in a diamond gets called exactly once, even when a later subclass
rearranges the hierarchy.

### Duck typing: no \`implements\` required

Python has no \`implements\` keyword. A function that calls \`gateway.charge(500)\`
works with **any** object that has a \`charge\` method — no shared parent, no
interface declaration. "If it walks like a duck and quacks like a duck, it's a
duck." This is why so much Python code passes plain objects around where a PHP
codebase would define an interface first.

### When you do want an interface: two answers

- **ABCs** (\`abc.ABC\` + \`@abstractmethod\`) — the nominal, runtime-enforced
  option. Instantiating a class that hasn't implemented every abstract method
  raises \`TypeError\` **at instantiation time** (PHP fails at class-definition
  parse time; Python waits until you call the constructor).
- **\`typing.Protocol\`** (3.8) — the structural option, and the closest thing to
  a TypeScript interface: any class with matching methods satisfies it
  **without inheriting from it**. Protocols are checked by static type checkers
  (mypy, pyright), not by the interpreter — unless you add
  \`@runtime_checkable\`, plain \`isinstance()\` against a Protocol fails.

### Checking types: isinstance and EAFP

\`isinstance($x, Foo::class)\` → \`isinstance(x, Foo)\`; \`is_subclass_of\` →
\`issubclass(Child, Parent)\`. But idiomatic Python often skips the check
entirely — **EAFP** (easier to ask forgiveness than permission): just call the
method and let \`AttributeError\` surface if the object can't do it. Reserve
\`isinstance\` for genuine branching on type, and reach for Protocols when you
want the checker to verify shapes without coupling classes together.

### Composition over inheritance

Python culture leans hard on composition: inject collaborators (as you would
with PHP DI containers) rather than building deep class trees. Mixins are for
small, orthogonal behaviours; two levels of inheritance is usually the sensible
maximum.
`,

  comparisons: [
    {
      label: "Extending a class and calling the parent constructor",
      intro:
        "A child class that adds one field on top of its parent's constructor. Both versions must run the parent's initialisation first.",
      php: `<?php
class User {
    public function __construct(
        protected string $name,
    ) {}
}

class AdminUser extends User {
    public function __construct(string $name, private int $level) {
        parent::__construct($name);
    }
}`,
      ts: `# models.py
class User:
    def __init__(self, name: str):
        self.name = name

class AdminUser(User):
    def __init__(self, name: str, level: int):
        super().__init__(name)   # NOT automatic if you define __init__
        self.level = level`,
      note:
        "Python never auto-calls the parent __init__ when the child defines its own — super().__init__() is on you, and super() follows the MRO rather than hard-coding the parent name.",
    },
    {
      label: "Interface → ABC (runtime-enforced)",
      intro:
        "A payment-gateway contract with one required method, and a concrete implementation. Both versions guarantee that an incomplete implementation blows up.",
      php: `<?php
interface PaymentGateway {
    public function charge(int $cents): string;
}

class StripeGateway implements PaymentGateway {
    public function charge(int $cents): string {
        return "stripe:" . $cents;
    }
}
// Missing charge() = fatal error when the class is parsed`,
      ts: `# gateways.py
from abc import ABC, abstractmethod

class PaymentGateway(ABC):
    @abstractmethod
    def charge(self, cents: int) -> str: ...

class StripeGateway(PaymentGateway):
    def charge(self, cents: int) -> str:
        return f"stripe:{cents}"

# Missing charge() = TypeError, but only when you INSTANTIATE`,
      note:
        "PHP fails at parse time; an ABC fails at instantiation time — a class with unimplemented abstract methods defines fine and only raises TypeError when constructed.",
    },
    {
      label: "Interface → Protocol (structural, checker-only)",
      intro:
        "The same contract expressed structurally: any class with a matching charge() satisfies it, with no implements clause anywhere.",
      php: `<?php
interface Chargeable {
    public function charge(int $cents): string;
}

// PHP is nominal: FakeGateway MUST declare the interface
class FakeGateway implements Chargeable {
    public function charge(int $cents): string {
        return "fake:" . $cents;
    }
}`,
      ts: `# protocols.py
from typing import Protocol

class Chargeable(Protocol):
    def charge(self, cents: int) -> str: ...

class FakeGateway:              # no implements, no inheritance
    def charge(self, cents: int) -> str:
        return f"fake:{cents}"

def bill(gateway: Chargeable, cents: int) -> str:
    return gateway.charge(cents)

bill(FakeGateway(), 500)        # mypy/pyright: OK — shape matches`,
      note:
        "Protocol (3.8) is structural like a TypeScript interface: matching methods are enough. Only static checkers verify it — the interpreter ignores it unless you add @runtime_checkable.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A mixin, an ABC, and a duck-typed class with no inheritance at all. Predict the MRO list, which isinstance checks pass, and what instantiating the ABC does.",
    code: `from abc import ABC, abstractmethod

class LoggerMixin:
    def log(self, msg: str) -> None:
        print(f"[{type(self).__name__}] {msg}")

class PaymentGateway(ABC):
    @abstractmethod
    def charge(self, cents: int) -> str: ...

class StripeGateway(LoggerMixin, PaymentGateway):
    def charge(self, cents: int) -> str:
        self.log(f"charging {cents}")
        return f"stripe:{cents}"

class FakeGateway:  # inherits from nothing relevant
    def charge(self, cents: int) -> str:
        return f"fake:{cents}"

g = StripeGateway()
print(g.charge(500))
print(isinstance(g, PaymentGateway))

f = FakeGateway()
print(f.charge(500))
print(isinstance(f, PaymentGateway))

print([c.__name__ for c in StripeGateway.__mro__])

try:
    PaymentGateway()
except TypeError as e:
    print(f"TypeError: {e}")`,
    output: `[StripeGateway] charging 500
stripe:500
True
fake:500
False
['StripeGateway', 'LoggerMixin', 'PaymentGateway', 'ABC', 'object']
TypeError: Can't instantiate abstract class PaymentGateway without an implementation for abstract method 'charge'`,
  },

  keyPoints: [
    "`class Child(Parent):` + `super().__init__()` replace `extends` + `parent::__construct()` — and the parent `__init__` is never called automatically once you define your own.",
    "Python has multiple inheritance; mixins fill the role of PHP traits, and the MRO (C3 linearisation, visible via `__mro__`) decides which method wins.",
    "Call `super()` instead of naming the parent class — it follows the MRO, so diamond hierarchies call each class exactly once.",
    "Duck typing means no `implements`: if the object has the method, the call works. Idiomatic code often just calls it (EAFP) instead of type-checking first.",
    "PHP interfaces map to two tools: `abc.ABC` + `@abstractmethod` (enforced with a TypeError at instantiation) and `typing.Protocol` (structural, verified by mypy/pyright only).",
    "Culture check: prefer composition and shallow hierarchies; `isinstance()`/`issubclass()` exist but are a last resort, not the default.",
  ],

  interview: [
    {
      q: "PHP has interfaces and traits. What are the Python equivalents?",
      a: "Traits map to **mixins** — ordinary small classes you add as extra base classes, since Python supports multiple inheritance and resolves clashes deterministically via the MRO. Interfaces have two Python answers depending on what you want enforced. An **ABC** (`abc.ABC` with `@abstractmethod`) is nominal like a PHP interface and enforced at runtime: instantiating an incomplete implementation raises `TypeError`. A **`typing.Protocol`** is structural — any class with matching methods satisfies it without declaring anything, like a TypeScript interface — but it's only checked by static tools like mypy or pyright, not by the interpreter. In practice a lot of Python skips both and relies on duck typing: just call the method.",
    },
    {
      q: "Why does Python code use super() instead of naming the parent class directly?",
      a: "Because `super()` doesn't mean 'my parent' — it means 'the **next class in the MRO**', the C3-linearised order Python computes for the whole hierarchy. With single inheritance the two are identical, but in a diamond (`class D(B, C)` where both inherit from `A`), hard-coding `A.__init__(self)` in both `B` and `C` would run `A`'s constructor twice, while a `super()` chain visits each class exactly once in MRO order. It also survives refactoring: if you rename or re-parent a class, `super()` still points at the right next step. It's the same reason PHP uses `parent::` over the literal class name, taken one step further.",
    },
    {
      q: "When would you actually use isinstance() in Python, given the duck-typing culture?",
      a: "Sparingly — for genuine branching on kind, like handling `str` vs `bytes` input, or in `except`-style boundary code validating untrusted data. The EAFP idiom usually wins: call `gateway.charge(500)` and let it fail if the object can't, rather than gatekeeping with checks the way `instanceof` guards sometimes litter PHP code. When I want a guarantee without runtime checks, I annotate the parameter with a `Protocol` and let mypy enforce the shape in CI. And if I need `isinstance()` to work against a Protocol at runtime, it has to be decorated with `@runtime_checkable` — otherwise the check raises.",
    },
  ],

  quiz: [
    {
      question:
        "A class defines its own __init__ and forgets to call super().__init__(). What happens?",
      options: [
        "Python calls the parent __init__ automatically, like PHP constructors",
        "The parent's __init__ never runs, so its attributes are simply missing",
        "A TypeError is raised at instantiation",
        "The class fails to compile",
      ],
      answerIndex: 1,
      explain:
        "Defining __init__ fully overrides the parent's. Nothing calls the parent version for you, so any attributes it would have set never exist — usually surfacing later as AttributeError. PHP behaves the same with __construct, but PHP devs coming via frameworks often expect auto-chaining.",
    },
    {
      question:
        "What is the key difference between abc.ABC and typing.Protocol as interface replacements?",
      options: [
        "ABCs are checker-only; Protocols are enforced at runtime",
        "ABCs allow multiple inheritance; Protocols do not",
        "ABCs are nominal and enforced at instantiation; Protocols are structural and checked by static type checkers",
        "Protocols require @abstractmethod; ABCs do not",
      ],
      answerIndex: 2,
      explain:
        "An ABC works like a PHP interface: implementations subclass it, and missing abstract methods raise TypeError when you instantiate. A Protocol is satisfied by shape alone — no inheritance needed — and only mypy/pyright verify it (isinstance needs @runtime_checkable).",
    },
    {
      question: "Given class StripeGateway(LoggerMixin, PaymentGateway), what decides which base's method is used on a name clash?",
      options: [
        "The alphabetically first class",
        "The MRO — C3 linearisation, roughly left-to-right through the base list",
        "Whichever class was defined last in the file",
        "Python raises an error on any clash",
      ],
      answerIndex: 1,
      explain:
        "Python computes a single method resolution order via C3 linearisation (inspect it with ClassName.__mro__). Bases listed earlier win, and super() walks that same order — which is why mixins go on the left.",
    },
  ],
};

export default lesson;
