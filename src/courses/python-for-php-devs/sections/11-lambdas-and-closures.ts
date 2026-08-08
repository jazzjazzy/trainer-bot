import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "lambdas-and-closures",
  title: "Lambdas, Closures & sorted(key=...)",
  part: "Control Flow & Functions",
  estMinutes: 12,
  summary:
    "Python's lambda is PHP's arrow function with a single-expression limit, closures capture by name (late binding!), and sorting uses key extraction instead of comparators.",

  concept: `
PHP gives you three flavours of anonymous function: \`function () use (...) {}\`,
the arrow function \`fn() =>\`, and first-class callables \`strlen(...)\`. Python
has **one**: \`lambda\`, and it's deliberately weaker than all of them — plus a
culture that says "if it doesn't fit in a lambda, give it a name with \`def\`".

### lambda — an arrow function that can't grow up

\`\`\`python
double = lambda x: x * 2        # ≈ $double = fn($x) => $x * 2;
\`\`\`

A \`lambda\` is a **single expression** — no statements, no \`if:\` blocks, no
loops, no \`return\` (the expression's value *is* the return value). Where a PHP
dev would reach for a multi-line \`function () use (...) { ... }\`, Python says:
define a named function with \`def\` — even inline, inside another function.
\`def\` statements are expressions' equals: functions are first-class objects
you can pass around, exactly like a PHP \`Closure\`.

### Closures capture by *name*, not by value

This is the trap. PHP's \`use ($x)\` copies the value at creation time (unless
you ask for \`use (&$x)\`). A Python closure captures the **variable itself**,
and looks its value up **when the lambda runs** — late binding. Every PHP
instinct says the loop below yields \`0, 1, 2\`; Python says \`2, 2, 2\`:

\`\`\`python
callbacks = [lambda: i for i in range(3)]
[cb() for cb in callbacks]        # [2, 2, 2] — all see the final i!

callbacks = [lambda i=i: i for i in range(3)]
[cb() for cb in callbacks]        # [0, 1, 2] — default arg captures NOW
\`\`\`

The \`i=i\` default-argument idiom evaluates \`i\` at definition time, which is
exactly what PHP's \`use ($i)\` does implicitly.

### Sorting: extract a key, don't compare pairs

PHP's \`usort()\` wants a **comparator** — a function taking two items and
returning -1/0/1. Python inverted the model: \`sorted()\`, \`min()\`, \`max()\`
and \`list.sort()\` take \`key=\`, a function that extracts **one comparable
value per item**, and Python compares those:

\`\`\`python
sorted(words, key=len)                    # shortest first
sorted(users, key=lambda u: u["age"])     # usort by age
max(users, key=lambda u: u["age"])        # no PHP one-liner for this!
\`\`\`

The key function runs **once per item** (not once per comparison), which is
both faster and simpler. If you're porting an old comparator, wrap it with
\`functools.cmp_to_key(cmp)\` — but new code should think in keys. For "sort by
this field", the stdlib \`operator\` module has ready-made key factories:
\`itemgetter("age")\` for dicts/tuples and \`attrgetter("age")\` for objects.

### map/filter exist — comprehensions won

\`map(f, xs)\` and \`filter(f, xs)\` are Python's \`array_map\`/\`array_filter\`
(argument order flipped: function first). They return lazy iterators, not
lists. They work, but idiomatic Python prefers comprehensions:
\`[f(x) for x in xs if cond(x)]\` reads better than \`map\` + \`filter\` + \`lambda\`.

### Partial application

PHP 8.1's first-class callable syntax plus a wrapper, or a hand-rolled
\`fn($b) => add(10, $b)\`, becomes \`functools.partial\`:

\`\`\`python
from functools import partial
add10 = partial(add, 10)      # pre-fill leading (or keyword) args
\`\`\`
`,

  comparisons: [
    {
      label: "Anonymous function",
      intro:
        "Doubling each number in a list with an inline function. Both produce [2, 4, 6].",
      php: `<?php
// PHP 8.2 — arrow fn, auto-captures scope
$nums = [1, 2, 3];
$doubled = array_map(fn($n) => $n * 2, $nums);

// Multi-statement version needs use()
$doubled = array_map(function ($n) {
    $result = $n * 2;
    return $result;
}, $nums);`,
      ts: `# Python — lambda is expression-only
nums = [1, 2, 3]
doubled = list(map(lambda n: n * 2, nums))

# ...but the idiomatic spelling is a comprehension
doubled = [n * 2 for n in nums]

# need statements? def a named function — no multi-line lambda exists
def double(n):
    log = n * 2
    return log`,
      note:
        "lambda ≈ fn() => — one expression only. There is no Python equivalent of a multi-statement anonymous function; you def a named one instead.",
    },
    {
      label: "Closure capture: by value vs by name",
      intro:
        "Building three callbacks in a loop, each meant to remember its own loop index. PHP prints 0 1 2; naive Python prints 2 2 2.",
      php: `<?php
// use ($i) copies the value at creation time
$callbacks = [];
foreach ([0, 1, 2] as $i) {
    $callbacks[] = function () use ($i) {
        return $i;
    };
}
foreach ($callbacks as $cb) {
    echo $cb(), " ";   // 0 1 2
}`,
      ts: `# Python closures capture the NAME — late binding
callbacks = [lambda: i for i in range(3)]
print([cb() for cb in callbacks])   # [2, 2, 2]  (!)

# Fix: a default argument evaluates i right now
callbacks = [lambda i=i: i for i in range(3)]
print([cb() for cb in callbacks])   # [0, 1, 2]`,
      note:
        "PHP's use() snapshots the value; Python looks the variable up when the lambda is CALLED. The i=i default-arg idiom is Python's use($i).",
    },
    {
      label: "Sorting by a field",
      intro:
        "Sorting a list of user records by age, youngest first. Same result, opposite mental model: comparator vs key extraction.",
      php: `<?php
// usort: a pairwise comparator, called O(n log n) times
$users = [
    ['name' => 'Ada',  'age' => 36],
    ['name' => 'Bob',  'age' => 22],
];
usort($users, fn($a, $b) => $a['age'] <=> $b['age']);`,
      ts: `# sorted: a key extractor, called once per item
users = [
    {"name": "Ada", "age": 36},
    {"name": "Bob", "age": 22},
]
by_age = sorted(users, key=lambda u: u["age"])

# stdlib shortcut for "grab this field"
from operator import itemgetter
by_age = sorted(users, key=itemgetter("age"))

# porting an old comparator? functools.cmp_to_key
from functools import cmp_to_key`,
      note:
        "sorted() returns a NEW list (like a non-mutating usort); key= replaces the spaceship comparator, and min()/max() take key= too.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Predict all seven lines before running. The two callback lists are the heart of it: which one prints [2, 2, 2] and why?",
    code: `from functools import partial
from operator import itemgetter

double = lambda x: x * 2
print(double(21))

words = ["banana", "fig", "apple", "kiwi"]
print(sorted(words, key=len))
print(sorted(words, key=lambda w: w[-1]))

users = [("ada", 36), ("bob", 22), ("cleo", 29)]
print(max(users, key=itemgetter(1)))

# Late binding: every lambda sees the FINAL value of i
callbacks = [lambda: i for i in range(3)]
print([cb() for cb in callbacks])

# The default-argument fix captures the value NOW
callbacks = [lambda i=i: i for i in range(3)]
print([cb() for cb in callbacks])

def tag(name, text):
    return f"<{name}>{text}</{name}>"

bold = partial(tag, "b")
print(bold("hi"))`,
    output: `42
['fig', 'kiwi', 'apple', 'banana']
['banana', 'apple', 'fig', 'kiwi']
('ada', 36)
[2, 2, 2]
[0, 1, 2]
<b>hi</b>`,
  },

  keyPoints: [
    "`lambda x: x * 2` ≈ `fn($x) => $x * 2` — a single expression, never statements; anything bigger gets a `def`.",
    "Python closures capture variables by NAME with late binding — PHP's `use ($x)` copies the value. The loop-variable trap prints the final value; fix it with the `lambda i=i:` default-arg idiom.",
    "`sorted()`, `min()`, `max()` take `key=` — a one-item key extractor, not a two-item comparator like `usort()`. `functools.cmp_to_key` adapts old comparators.",
    "`operator.itemgetter('age')` / `attrgetter('age')` are ready-made key functions for dict/tuple fields and object attributes.",
    "`map()`/`filter()` exist (and return lazy iterators), but comprehensions are the idiomatic spelling.",
    "`functools.partial(f, arg)` pre-fills arguments — Python's stock answer to currying/partial application.",
  ],

  interview: [
    {
      q: "Why does building lambdas in a loop give you the same value from every one, and how do you fix it?",
      a: "Python closures capture the **variable**, not its value — the lambda body looks `i` up when it's *called*, and by then the loop has finished, so every callback sees the final value. Coming from PHP this is surprising because `use ($i)` snapshots the value at creation time. The standard fix is a default argument, `lambda i=i: ...`, because defaults are evaluated at definition time — that's effectively PHP's by-value `use()`. A factory function that takes `i` as a parameter works too.",
    },
    {
      q: "How does Python's sorting model differ from PHP's usort?",
      a: "`usort()` wants a pairwise comparator returning -1/0/1, called on every comparison. Python's `sorted()` (and `list.sort()`, `min()`, `max()`) instead take `key=`, a function that extracts one comparable value per item — it runs exactly once per element, then Python compares the keys. So 'sort users by age' is `sorted(users, key=itemgetter(\"age\"))` rather than a spaceship comparator. If you genuinely have an old-style comparator, `functools.cmp_to_key()` adapts it, but key extraction is both faster and clearer.",
    },
    {
      q: "When would you use lambda versus def?",
      a: "`lambda` only when the function is a throwaway single expression passed straight into something — a `key=` for `sorted`, a tiny predicate. The moment it needs a statement, a docstring, or reuse, I `def` a named function; unlike PHP, Python has no multi-statement anonymous function, and PEP 8 even says don't assign a lambda to a name (just use `def`). In practice I reach for comprehensions before `map`/`filter` + `lambda`, and for `operator.itemgetter`/`attrgetter` before trivial field-access lambdas.",
    },
  ],

  quiz: [
    {
      question: "What does `[cb() for cb in [lambda: i for i in range(3)]]` evaluate to?",
      options: ["[0, 1, 2]", "[2, 2, 2]", "[None, None, None]", "It raises a NameError"],
      answerIndex: 1,
      explain:
        "Each lambda closes over the variable `i` itself, not its current value. All three are called after the loop ends, when `i` is 2 — late binding. `lambda i=i: i` would capture per-iteration values, like PHP's use($i).",
    },
    {
      question: "You have `$cmp = fn($a, $b) => $a->age <=> $b->age` in PHP. What's the closest idiomatic Python for sorting a list of objects the same way?",
      options: [
        "sorted(people, cmp=lambda a, b: a.age - b.age)",
        "people.usort(lambda a, b: a.age - b.age)",
        "sorted(people, key=attrgetter('age'))",
        "sorted(people, lambda p: p.age)",
      ],
      answerIndex: 2,
      explain:
        "Python sorts by key extraction: key= takes a one-argument function returning the value to compare. operator.attrgetter('age') (or key=lambda p: p.age) is the idiom; there is no cmp= parameter in Python 3 — comparators must go through functools.cmp_to_key.",
    },
    {
      question: "Which of these is a VALID Python lambda?",
      options: [
        "lambda x: if x > 0: return x",
        "lambda x: { $total += x }",
        "lambda x: x * 2 if x > 0 else 0",
        "lambda (x) => x * 2",
      ],
      answerIndex: 2,
      explain:
        "A lambda body must be a single expression. `x * 2 if x > 0 else 0` is a conditional EXPRESSION (Python's ternary), so it's allowed; `if:` statements, assignments and `return` are statements and are not.",
    },
  ],
};

export default lesson;
