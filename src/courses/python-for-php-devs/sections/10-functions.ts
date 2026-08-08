import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "functions",
  title: "Functions: def, Keyword Args & *args",
  part: "Control Flow & Functions",
  estMinutes: 14,
  summary:
    "def instead of function, every argument callable by keyword, *args/**kwargs variadics — and the mutable-default gotcha PHP never prepared you for.",

  concept: `
Where PHP writes \`function\`, Python writes \`def\` — colon, indent, no braces:

\`\`\`python
def greet(name, greeting="Hello"):
    """Return a friendly greeting."""
    return f"{greeting}, {name}!"
\`\`\`

Type hints exist (covered elsewhere) but even when present they're **not
enforced at runtime** — there is no \`declare(strict_types=1)\` equivalent; a
declared return type is documentation plus tooling, not a runtime contract.
A function without a \`return\` (or a bare \`return\`) returns **\`None\`** — the
implicit \`void\`. The triple-quoted string on the first line is a
**docstring**: it's the docblock, but it lives *inside* the function as a real
runtime value (\`help(greet)\` reads it).

### Every argument accepts a keyword

PHP 8.0 gave you named arguments; Python has had them forever, and they're
universal — any parameter can be passed by name, in any order:

\`\`\`python
greet("Ada")                          # positional
greet(name="Ada", greeting="Hi")      # keyword, any order
\`\`\`

Idiomatic Python leans on this hard: booleans and options are passed by
keyword (\`sorted(xs, reverse=True)\`) so call sites stay readable. You can
also enforce the style: parameters after a bare \`*\` are **keyword-only**, and
parameters before a \`/\` are **positional-only** (3.8):

\`\`\`python
def move(src, dst, /, *, overwrite=False): ...
move("a", "b", overwrite=True)   # the only legal shape
\`\`\`

### THE gotcha: mutable default values

In PHP, a parameter default is re-evaluated on **every call** — \`function
f(array \$items = [])\` hands each call a fresh array. Python evaluates
defaults **once, at \`def\` time**, and every call shares that one object:

\`\`\`python
def broken(item, items=[]):     # ONE list, created at def time
    items.append(item)
    return items

broken("a")   # ['a']
broken("b")   # ['a', 'b']  <- surprise: same list!
\`\`\`

Fine for immutable defaults (\`0\`, \`"x"\`, \`None\`, tuples); a bug factory for
lists/dicts/sets. The universal fix is the **None-sentinel idiom**:

\`\`\`python
def fixed(item, items=None):
    if items is None:
        items = []              # fresh list per call, like PHP
    items.append(item)
    return items
\`\`\`

Every Python codebase uses this; linters flag \`=[]\` and \`={}\` defaults on sight.

### Variadics: *args and **kwargs

\`*args\` collects extra positional arguments into a **tuple** — exactly PHP's
\`...\$args\`. \`**kwargs\` collects extra *keyword* arguments into a **dict**,
and PHP has no true equivalent — the closest habit is an \`\$options\` array:

\`\`\`python
def log(*args, **kwargs):
    print(args)      # (1, 2)
    print(kwargs)    # {'level': 'warn'}

log(1, 2, level="warn")
\`\`\`

The same stars work at the **call site** as spread — PHP's \`...\$arr\`:

\`\`\`python
args = [3, 4]
opts = {"level": "info"}
log(*args, **opts)               # log(3, 4, level="info")
\`\`\`

### Functions are objects

Like PHP 8.1's first-class callable syntax (\`strlen(...)\`) — but with zero
ceremony, because a function *is already* a value. Assign it, stash it in a
dict, pass it around; add \`()\` only when calling:

\`\`\`python
handler = greet                  # no quotes, no Closure::fromCallable
handlers = {"hi": greet}
handlers["hi"]("Ada")
\`\`\`

### Scoping: no use clause

A PHP closure sees nothing unless you \`use (\$var)\` it. Python is the
opposite: inner functions **read** enclosing variables automatically
(lookup order LEGB — Local, Enclosing, Global, Built-in). Only *assignment*
needs a declaration: \`nonlocal x\` to rebind an enclosing variable,
\`global x\` for a module-level one — a mirror image of PHP, where functions
are sealed by default and \`global\` pulls things in for reading too.

\`\`\`python
def counter():
    count = 0
    def bump():
        nonlocal count           # writing needs this; reading wouldn't
        count += 1
        return count
    return bump
\`\`\`
`,

  comparisons: [
    {
      label: "Defaults and named arguments",
      intro:
        "A greeting function with a default, called positionally and by name. Python's keyword calls look like PHP 8 named arguments — but work on every function ever written.",
      php: `<?php
function greet(string $name, string $greeting = 'Hello'): string
{
    return "{$greeting}, {$name}!";
}

echo greet('Ada');                           // Hello, Ada!
// named arguments since PHP 8.0:
echo greet(name: 'Ada', greeting: 'Hi');     // Hi, Ada!`,
      ts: `def greet(name, greeting="Hello"):
    """Return a friendly greeting."""    # docstring
    return f"{greeting}, {name}!"

print(greet("Ada"))                        # Hello, Ada!
# keywords always worked, any order:
print(greet(greeting="Hi", name="Ada"))    # Hi, Ada!`,
      note:
        "Same shape, but Python type hints aren't runtime-enforced (no strict_types), the docblock moves inside as a docstring, and keyword calling is universal rather than a PHP 8 feature.",
    },
    {
      label: "The mutable default trap",
      intro:
        "An accumulator with a default empty list. PHP re-creates the default on every call; Python creates it ONCE — watch the second call.",
      php: `<?php
function addItem(string $item, array $items = []): array
{
    $items[] = $item;
    return $items;
}

print_r(addItem('a'));   // ['a']
print_r(addItem('b'));   // ['b']  - fresh array each call`,
      ts: `def add_item(item, items=[]):    # evaluated ONCE, at def
    items.append(item)
    return items

print(add_item("a"))   # ['a']
print(add_item("b"))   # ['a', 'b'] - the SAME list!

def add_item_fixed(item, items=None):
    if items is None:
        items = []               # fresh per call, like PHP
    items.append(item)
    return items`,
      note:
        "Python evaluates defaults once at def time, so a mutable default is shared across all calls — the None-sentinel idiom restores PHP's per-call behaviour and is mandatory style.",
    },
    {
      label: "Variadics and spread",
      intro:
        "Sum any number of values, then call it by spreading an existing list. *args is ...$args; **kwargs goes beyond anything PHP offers.",
      php: `<?php
function total(int ...$nums): int
{
    return array_sum($nums);
}

echo total(1, 2, 3);        // 6
$vals = [4, 5, 6];
echo total(...$vals);       // 15 - spread

// extra "named" options? PHP falls back to an array:
function connect(string $dsn, array $options = []) {}`,
      ts: `def total(*nums):            # nums arrives as a tuple
    return sum(nums)

print(total(1, 2, 3))        # 6
vals = [4, 5, 6]
print(total(*vals))          # 15 - spread

# **kwargs: arbitrary keyword args as a dict
def connect(dsn, **options):
    timeout = options.get("timeout", 30)

connect("db://x", timeout=5, retries=2)`,
      note:
        "*args maps 1:1 to ...$args (tuple instead of array); **kwargs captures arbitrary named arguments into a dict — PHP's nearest habit is a manually-documented $options array.",
    },
    {
      label: "Closures and outer variables",
      intro:
        "A counter factory whose inner function updates state from the enclosing scope. PHP imports by hand; Python reads automatically and declares only writes.",
      php: `<?php
function counter(): Closure
{
    $count = 0;
    // must import by reference to see AND write it
    return function () use (&$count): int {
        return ++$count;
    };
}

$bump = counter();
echo $bump();   // 1
echo $bump();   // 2`,
      ts: `def counter():
    count = 0
    def bump():
        nonlocal count    # only WRITING needs this
        count += 1
        return count
    return bump           # a function is a value

bump = counter()
print(bump())   # 1
print(bump())   # 2`,
      note:
        "No use() clause: Python inner functions read enclosing names automatically (LEGB); assignment alone requires nonlocal (or global for module scope) — the exact inverse of PHP's sealed-by-default closures.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Keyword calls, the mutable-default trap and its fix, *args/**kwargs with spread, and a function passed as a value. The two broken_append lines are the ones to predict carefully.",
    code: `def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

print(greet("Ada"))
print(greet("Linus", greeting="G'day"))
print(greet(greeting="Hi", name="Guido"))  # ANY arg works by keyword

# THE classic gotcha: the default [] is created ONCE
def broken_append(item, items=[]):
    items.append(item)
    return items

print(broken_append("a"))
print(broken_append("b"))  # same list as last call!

# the None-sentinel fix
def fixed_append(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items

print(fixed_append("a"))
print(fixed_append("b"))

# *args = ...$args; **kwargs has no PHP equivalent
def report(*args, **kwargs):
    print(args, kwargs)

report(1, 2, mode="fast")

# unpacking at the call site = ...$arr spread
pair = [3, 4]
opts = {"mode": "slow"}
report(*pair, **opts)

# functions are plain objects
shout = greet
print(shout("world"))`,
    output: `Hello, Ada!
G'day, Linus!
Hi, Guido!
['a']
['a', 'b']
['a']
['b']
(1, 2) {'mode': 'fast'}
(3, 4) {'mode': 'slow'}
Hello, world!`,
  },

  keyPoints: [
    "`def name(params):` + indent replaces `function name() {}`; no `return` means the function returns `None` (the implicit void).",
    "Defaults are evaluated **once at def time** — `items=[]` shares one list across calls (PHP re-evaluates per call); use the `items=None` sentinel idiom.",
    "Every argument is passable by keyword — PHP 8 named arguments, but universal; a bare `*` forces keyword-only params, `/` (3.8) forces positional-only.",
    "`*args` = `...$args` (a tuple); `**kwargs` collects arbitrary keyword args into a dict — PHP's nearest analogue is an `$options` array.",
    "Call-site stars are spread: `f(*a_list, **a_dict)` ≈ `f(...$arr)` plus named-argument unpacking.",
    "Functions are objects (assign/pass/store without PHP 8.1's `f(...)` syntax), and closures read outer scopes automatically — `nonlocal`/`global` are needed only to *write*.",
  ],

  interview: [
    {
      q: "Explain Python's mutable default argument gotcha and how you avoid it.",
      a: "Python evaluates a parameter's default expression exactly once, when the `def` executes — not on each call like PHP. So `def add(item, items=[])` creates one list at definition time and every call that omits `items` appends to that same shared object: call it with 'a' then 'b' and the second call returns `['a', 'b']`. It bites PHP developers precisely because PHP re-evaluates `array $items = []` per call, so the habit feels safe. The fix is the None-sentinel idiom: default to `None`, then `if items is None: items = []` inside the body, restoring fresh-per-call semantics. Immutable defaults (numbers, strings, None, tuples) are fine since sharing them is harmless, and linters flag mutable ones automatically.",
    },
    {
      q: "How do *args and **kwargs map to PHP, and what do the / and * markers in a signature mean?",
      a: "`*args` is PHP's `...$args` — surplus positional arguments collected into a tuple rather than an array. `**kwargs` has no real PHP counterpart: it captures any *keyword* arguments not matched by named parameters into a dict, giving you a typed-by-convention version of the `$options` array pattern, and it's how decorators and wrappers forward arbitrary signatures (`f(*args, **kwargs)`). The same stars invert at the call site as spread: `f(*a_list, **a_dict)` is `f(...$arr)` plus unpacking a map into named arguments. In a signature, parameters before `/` (3.8) are positional-only — callers can't use their names — and parameters after a bare `*` are keyword-only, forcing readable call sites like `move(src, dst, overwrite=True)`.",
    },
    {
      q: "How does variable scoping inside nested functions differ from PHP closures?",
      a: "They're mirror images. A PHP closure is sealed: it sees nothing from the defining scope unless you import it with `use ($var)` — and by-reference `use (&$var)` if you want writes to stick. Python inner functions *read* enclosing variables automatically via the LEGB lookup chain (Local, Enclosing, Global, Built-in) — no capture list exists. The declaration burden only appears on *assignment*: rebinding an enclosing variable requires `nonlocal`, and a module-level one requires `global`, because a bare assignment would otherwise create a new local shadowing the outer name. So in PHP you declare to read; in Python you declare only to write.",
    },
    {
      q: "Are Python type hints on functions enforced like declare(strict_types=1)?",
      a: "No — and that's a genuine mindset shift. Annotations like `def add(a: int, b: int) -> int:` are stored as metadata and completely ignored by the interpreter at call time; passing strings raises no error until something downstream breaks. There's no strict_types switch. Enforcement lives in tooling: static checkers (mypy, pyright) run in CI the way PHPStan/Psalm do — except in PHP they supplement a runtime check, while in Python they *are* the check. Runtime validation, where it matters (API boundaries), comes from libraries like pydantic. In practice a well-tooled Python codebase feels as type-safe as strict PHP, but the guarantee comes from CI, not the engine.",
    },
  ],

  quiz: [
    {
      question: "What does the second call print?\n`def f(item, items=[]): items.append(item); return items` — after `f(\"a\")` then `f(\"b\")`?",
      options: ["['b']", "['a', 'b']", "['b', 'a']", "A TypeError"],
      answerIndex: 1,
      explain:
        "The default list is created once, at def time, and shared by every call that omits `items` — so 'b' lands in the same list already holding 'a'. PHP re-evaluates defaults per call, which is why this surprises PHP developers; the fix is `items=None` plus `if items is None: items = []`.",
    },
    {
      question: "What is `**kwargs` in a function signature?",
      options: [
        "A pointer to the arguments array, like &$args",
        "Extra positional arguments as a tuple",
        "Extra keyword arguments collected into a dict",
        "A required options dict the caller must pass",
      ],
      answerIndex: 2,
      explain:
        "One star collects surplus positional args (a tuple, ≈ ...$args); two stars collect surplus *keyword* args into a dict — a construct PHP lacks, whose nearest analogue is a conventional $options array.",
    },
    {
      question: "Inside a nested function, what do you need to READ a variable from the enclosing function?",
      options: [
        "A use ($var) clause on the inner def",
        "Nothing — enclosing names are visible automatically (LEGB)",
        "A nonlocal declaration",
        "A global declaration",
      ],
      answerIndex: 1,
      explain:
        "Python resolves names through Local, Enclosing, Global, Built-in scopes automatically — no capture list. `nonlocal` is only required to *assign* to an enclosing variable (and `global` for module scope); PHP's use() clause is needed even for reading.",
    },
    {
      question: "A function ends without hitting any `return` statement. What does calling it evaluate to?",
      options: ["0", "An empty string", "None", "It raises a MissingReturnError"],
      answerIndex: 2,
      explain:
        "Every Python function returns something; with no return (or a bare `return`) that something is `None` — the equivalent of a void PHP function, except you can actually capture and test the None.",
    },
  ],
};

export default lesson;
