import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "classes-basics",
  title: "Classes: __init__, self & Attributes",
  part: "OOP the Python Way",
  estMinutes: 12,
  summary:
    "__init__ is your constructor, self is an explicit $this, attributes appear on assignment, there's no `new` — and no private keyword, only conventions.",

  concept: `
Python classes will feel loose to a PHP 8 developer: no property declarations,
no visibility keywords, no \`new\`. The mechanics underneath are simple and
consistent once you see that **methods are just functions** stored on a class.

### The constructor and the explicit self

\`\`\`python
class Point:
    def __init__(self, x, y):    # ≈ __construct
        self.x = x               # ≈ $this->x = $x;
        self.y = y

p = Point(1, 2)                  # no 'new' — the class IS the factory
print(p.x)                       # dot, not ->
\`\`\`

\`__init__\` is \`__construct\` (technically it *initialises* an already-created
object rather than building it, hence the name). \`self\` is \`$this\` — but you
must **declare it as the first parameter** of every method. Why? Because a
method is literally a function that lives on the class; \`p.move(3)\` is just
sugar for \`Point.move(p, 3)\`. Python passes the instance in explicitly instead
of injecting a magic \`$this\`. You'll forget \`self\` in week one; the error
(\`takes 1 positional argument but 2 were given\`) is your reminder.

Calling a class object *is* instantiation — \`Point(1, 2)\`, never
\`new Point(1, 2)\`. Classes are ordinary objects you can pass around, store in
dicts, alias, and call.

### Attributes spring into existence

There is no property declaration list. \`self.x = x\` inside \`__init__\` (or any
method, or even from outside the object) **creates** the attribute at
assignment time. Coming from PHP typed properties this feels lawless — and
it's why the convention is strong: *assign every attribute in \`__init__\`* so
readers (and type checkers) can see the object's shape in one place. Later
sections cover \`dataclasses\` and type hints, which restore the declared-shape
feel of PHP 8.

### Class attributes vs instance attributes

\`\`\`python
class Counter:
    total = 0            # CLASS attribute — one shared value, like static

    def __init__(self):
        self.count = 0   # INSTANCE attribute — per object
\`\`\`

A name assigned in the class body (outside methods) belongs to the class —
roughly PHP's \`public static $total\` crossed with a default value. Reads fall
through: \`self.total\` finds the class attribute if the instance has none. The
classic trap is a **mutable** class attribute: \`items = []\` in the class body
gives every instance the *same* list, so one object's \`append\` shows up in all
of them. Per-instance mutable state must be created in \`__init__\`.

### No private keyword — conventions instead

Python has no \`public\`/\`private\`/\`protected\`. The culture ("we're all
consenting adults here") uses naming:

- \`name\` — public API.
- \`_name\` — single underscore: "internal, don't touch" — a documented hint,
  nothing enforced. Roughly your \`protected\`/\`private\` intent.
- \`__name\` — double underscore triggers **name mangling**: inside \`class Point\`
  it's rewritten to \`_Point__name\`. That prevents accidental clashes in
  subclasses; it is *not* security — \`p._Point__name\` reads it fine.

So where PHP's engine throws on \`$p->secret\`, Python trusts the reader.
Tooling and code review carry the weight the compiler carries in PHP.

### Everything is an object

Ints, strings, functions, modules — and classes themselves — are objects with
attributes. \`(42).bit_length()\` works. This uniformity is why \`self\` is
explicit, why you can attach attributes to (almost) anything, and why passing
a class to a function is unremarkable Python.
`,

  comparisons: [
    {
      label: "A basic class",
      intro:
        "The same Point class both ways: constructor takes x and y, stores them, exposes a move method. Note what Python simply doesn't write.",
      php: `<?php
class Point
{
    public function __construct(
        private int $x,
        private int $y,
    ) {}

    public function move(int $dx, int $dy): void
    {
        $this->x += $dx;
        $this->y += $dy;
    }
}

$p = new Point(1, 2);
$p->move(3, 4);`,
      ts: `class Point:
    def __init__(self, x, y):
        self.x = x        # attribute created right here
        self.y = y

    def move(self, dx, dy):   # self = explicit $this
        self.x += dx
        self.y += dy

p = Point(1, 2)   # no 'new' — call the class
p.move(3, 4)
print(p.x)        # dot, not -> ... and nothing is private`,
      note:
        "No new, no visibility keywords, no property declarations — self.x = x in __init__ both declares and assigns, and self must be listed as the first parameter.",
    },
    {
      label: "Class attribute vs instance attribute",
      intro:
        "A shared counter across all instances next to per-instance state — PHP's static property vs Python's class attribute.",
      php: `<?php
class Job
{
    public static int $created = 0;   // shared
    public array $tags = [];          // per instance

    public function __construct()
    {
        self::$created++;
    }
}

new Job(); new Job();
echo Job::$created;   // 2`,
      ts: `class Job:
    created = 0        # class attribute — shared, like static

    def __init__(self):
        Job.created += 1
        self.tags = []   # per-instance: create mutables HERE

    # TRAP: tags = [] in the class body would be ONE
    # list shared by every Job — not a fresh default.

Job(); Job()
print(Job.created)   # 2`,
      note:
        "Class-body assignments are shared like static properties; a mutable one ([], {}) is shared STATE, not a per-object default — always create mutables in __init__.",
    },
    {
      label: "Visibility: enforced vs convention",
      intro:
        "Marking internals. PHP's engine blocks outside access; Python signals intent with underscores and trusts you.",
      php: `<?php
class Account
{
    private int $balance = 0;

    public function deposit(int $cents): void
    {
        $this->balance += $cents;
    }
}

$a = new Account();
$a->deposit(100);
echo $a->balance;
// Fatal error: Cannot access private property`,
      ts: `class Account:
    def __init__(self):
        self._balance = 0      # "_ = internal" — a hint only
        self.__audit = []      # mangled to _Account__audit

    def deposit(self, cents):
        self._balance += cents

a = Account()
a.deposit(100)
print(a._balance)          # 100 — nothing stops you
print(a._Account__audit)   # [] — mangling isn't privacy`,
      note:
        "_single underscore is a documented 'internal' hint; __double is name mangling to avoid subclass clashes — neither is enforced privacy like PHP's private.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Predict the counter line first (which numbers are per-instance, which shared?), then the visibility lines at the bottom — does anything actually error?",
    code: `class Counter:
    total = 0  # class attribute: shared by ALL instances

    def __init__(self, name):
        self.name = name   # instance attributes spring into existence
        self.count = 0

    def bump(self):
        self.count += 1
        Counter.total += 1

a = Counter("a")
b = Counter("b")
a.bump()
a.bump()
b.bump()
print(a.count, b.count, Counter.total)

a.nickname = "alpha"       # add an attribute any time, to one object
print(a.nickname)
print(hasattr(b, "nickname"))

class Point:
    def __init__(self, x, y):
        self.x = x
        self._internal = "convention only"
        self.__secret = x + y   # name-mangled, not private

p = Point(1, 2)
print(p.x)
print(p._internal)          # nothing stops you
print(p._Point__secret)     # the mangled name is reachable too
print(Point.__init__ is p.__init__.__func__)  # methods are functions`,
    output: `2 1 3
alpha
False
1
convention only
3
True`,
  },

  keyPoints: [
    "`__init__(self, ...)` is `__construct`; instantiate by CALLING the class — `p = Point(1, 2)`, no `new`.",
    "`self` is `$this` but EXPLICIT: it's the first parameter of every method, because `obj.method(x)` is really `Class.method(obj, x)`.",
    "`self.x = x` creates the attribute on assignment — no declaration list; convention says assign everything in `__init__` so the object's shape is visible.",
    "Class-body assignments are class attributes (shared, like `static`); the mutable class attribute (`items = []`) is shared state across ALL instances — create mutables in `__init__`.",
    "No `public`/`private`/`protected`: `_name` means 'internal' by convention, `__name` gets mangled to `_Class__name` (clash protection, not privacy).",
    "Everything is an object — ints, functions, classes themselves — and attribute access is always the dot, never `->` or `::`.",
  ],

  interview: [
    {
      q: "Why does Python make `self` explicit when PHP gives you `$this` for free?",
      a: "Because Python methods are plain functions stored as class attributes — there's no separate 'method' construct in the language core. `p.move(3)` is sugar for `Point.move(p, 3)`, so the instance has to be a real parameter, and Python chose to make that visible rather than inject a hidden `$this`. It also falls out of 'explicit is better than implicit': you can grab `Point.move` as a first-class function, pass it around, and call it with any instance. The cost is typing `self` a lot; the payoff is that the object model has no magic to memorise.",
    },
    {
      q: "What's the mutable class attribute trap?",
      a: "Anything assigned in the class body is a class attribute — one object shared by every instance, like a PHP static property. Writing `items = []` there as if it were a PHP property default means every instance sees the *same list*: one instance's `append` appears in all of them, because `self.items.append(x)` finds the shared class attribute and mutates it. It works 'fine' for immutables like `0` or `\"\"` (rebinding `self.total = ...` creates an instance attribute that shadows the class one), which is why the bug hides. Rule: per-instance mutable state is created in `__init__`, full stop.",
    },
    {
      q: "How do you express private/protected in Python, coming from enforced visibility in PHP?",
      a: "You don't enforce it — you signal it. A single leading underscore (`_balance`) is the universal 'internal, not part of the API' marker; linters, IDEs, and `from module import *` respect it, but the interpreter doesn't. A double underscore (`__balance`) triggers name mangling to `_Account__balance`, whose purpose is preventing accidental attribute clashes in subclasses — it's trivially bypassed, so it's not access control. The philosophy is 'consenting adults': PHP's engine-level guarantees are replaced by convention, review, and type-checker tooling. In practice it works because *accidental* misuse is what visibility mostly prevents, and the underscore prevents that socially.",
    },
  ],

  quiz: [
    {
      question: "How do you instantiate `class Point:` in Python?",
      options: [
        "p = new Point(1, 2)",
        "p = Point.new(1, 2)",
        "p = Point(1, 2)",
        "p = Point::create(1, 2)",
      ],
      answerIndex: 2,
      explain:
        "There is no `new` keyword — classes are callable objects, and calling one constructs an instance (running __init__ to initialise it). new/:: are PHP-isms.",
    },
    {
      question: "A class body contains `tags = []`. Two instances are created and one runs `self.tags.append('x')`. What does the other instance's `tags` hold?",
      options: [
        "[] — each instance got its own copy",
        "['x'] — the list is a single shared class attribute",
        "None — tags was never set on it",
        "It raises AttributeError",
      ],
      answerIndex: 1,
      explain:
        "Class-body assignments create ONE shared class attribute. self.tags.append mutates that shared list (lookup falls through to the class), so every instance sees ['x']. Per-instance lists must be created in __init__ with self.tags = [].",
    },
    {
      question: "What does the double underscore in `self.__secret` actually do?",
      options: [
        "Makes the attribute private, enforced at runtime like PHP's private",
        "Renames it to _ClassName__secret (name mangling) — a clash guard, not privacy",
        "Hides it from dir() and debuggers completely",
        "Marks it readonly after __init__",
      ],
      answerIndex: 1,
      explain:
        "__name in a class body is compiled to _ClassName__name. That protects subclasses from accidentally overriding it, but anyone can still read obj._ClassName__secret — Python has no enforced private.",
    },
    {
      question: "Why must every Python method declare `self` as its first parameter?",
      options: [
        "It's legacy syntax kept for Python 2 compatibility",
        "Methods are just functions on the class; obj.method(x) is Class.method(obj, x), so the instance arrives as a real argument",
        "self is a keyword the parser requires, like $this",
        "Only methods that mutate state need self",
      ],
      answerIndex: 1,
      explain:
        "There's no hidden $this: attribute lookup binds the instance as the first argument of the underlying function. self isn't even a keyword — it's a convention (you could name it anything, but never do).",
    },
  ],
};

export default lesson;
