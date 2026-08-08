import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "truthiness-and-none",
  title: "Truthiness, Comparisons & None",
  part: "Control Flow & Functions",
  estMinutes: 11,
  summary:
    "Python has no ==/=== split, a shorter falsy list with one nasty difference, and `is None` where you'd write === null.",

  concept: `
Twenty-plus years of PHP have trained you to fear \`==\`. Good news: Python's
\`==\` is what PHP's \`===\` should have been all along. There is no type
juggling — \`1 == "1"\` is simply \`False\`, no coercion, no juggling tables to
memorise, and consequently **no \`===\` operator at all**.

### The falsy list

Python's falsy values: \`False\`, \`None\`, \`0\`, \`0.0\`, \`""\`, and **empty
containers** — \`[]\`, \`{}\`, \`set()\`, \`()\`. Everything else is truthy.
Two deltas from PHP's list to burn in:

- **\`"0"\` (the string) is truthy in Python.** PHP treats \`"0"\` as falsy — the
  classic PHP trap runs the *other way* here. Any non-empty string is truthy.
- Empty containers being falsy matches PHP (\`[] == false\`), so
  \`if not items:\` reads like \`if (empty($items))\` — and is the idiomatic
  emptiness check. Nobody writes \`if len(items) == 0:\`.

Need an explicit boolean? \`bool(x)\` is your \`(bool) $x\` cast.

### \`is\` — identity, and only for None

Python has an \`is\` operator that checks *identity* (same object in memory,
like comparing object handles in PHP). Its everyday job is one thing:
**\`x is None\`** — the exact equivalent of \`$x === null\`. \`None\` is a
singleton, so identity is the correct, idiomatic test, and \`is not None\`
reads naturally.

Do **not** use \`is\` for numbers or strings. CPython caches small ints and
some strings, so \`x is 257\` can be \`True\` on one machine and \`False\` on
another — the interpreter even warns you. \`is\` is for \`None\`, \`True\`/\`False\`
in rare cases, and sentinels; \`==\` for everything else.

### Chained comparisons

A genuinely nicer spelling than PHP's:

\`\`\`python
if 0 <= age < 100: ...        # PHP: if ($age >= 0 && $age < 100)
if lo < x <= hi: ...
\`\`\`

Each operand is evaluated once; the chain expands to \`0 <= age and age < 100\`.

### and/or return operands — your \`?:\` patterns still work

Like PHP's \`?:\` idioms, \`and\`/\`or\` return one of their **operands**, not a
boolean:

\`\`\`python
display = name or "guest"     # ≈ $name ?: 'guest'
\`\`\`

Same power, same trap: if \`0\` or \`""\` is a *legitimate* value, \`or\` steamrolls
it. \`count or 10\` gives you \`10\` when count is legitimately zero. When "only
replace if missing" means \`None\` specifically, be explicit:

\`\`\`python
timeout = user_timeout if user_timeout is not None else 30
\`\`\`

That \`a if cond else b\` conditional expression is Python's ternary — note the
value comes **first**.

### No nullsafe chain

PHP 8 gave you \`$user?->address?->city\`. Python has no \`?.\`/\`?->\` operator.
Your options: a conditional expression, a \`try\`/\`except AttributeError\`, or
\`getattr(obj, "attr", default)\` for a single dynamic hop. Mostly, Python code
avoids long nullable chains in the first place.

### Walrus \`:=\` — assignment in a condition (3.8)

PHP has always allowed \`if ($row = fetch())\`. Python historically banned
assignment inside expressions; Python 3.8's walrus operator restored it with
distinct syntax so it can't be a typo'd \`==\`:

\`\`\`python
if (n := len(data)) > 10:
    print(f"too big: {n}")

while chunk := f.read(8192):
    process(chunk)
\`\`\`

Use it where it removes a duplicate call; skip it where it hurts readability.
`,

  comparisons: [
    {
      label: "Loose vs strict — the split that isn't",
      intro:
        "Compare an int to a numeric string, then check a variable against null. Python needs no === because == never coerces.",
      php: `<?php
var_dump(1 == "1");    // bool(true)  - juggling
var_dump(1 === "1");   // bool(false) - strict

$x = null;
var_dump($x === null); // bool(true)
var_dump(is_null($x)); // bool(true)`,
      ts: `print(1 == "1")    # False - == is already strict
# there is no === operator to reach for

x = None
print(x is None)   # True - THE null check
print(x == None)   # works, but unidiomatic`,
      note:
        "Python's == compares by value with no coercion, so the ==/=== split disappears; the one PHP-=== habit that survives is the null check, spelled `x is None`.",
    },
    {
      label: "The \"0\" string trap — reversed",
      intro:
        "Feed the string '0' through an if. PHP and Python disagree — this is the single truthiness difference most likely to bite a PHP developer.",
      php: `<?php
$val = "0";

if ($val) {
    echo "truthy\\n";
} else {
    echo "falsy\\n";   // <-- PHP prints this
}
// PHP's falsy strings: "" AND "0"`,
      ts: `val = "0"

if val:
    print("truthy")   # <-- Python prints this
else:
    print("falsy")

# Python: ANY non-empty string is truthy`,
      note:
        "PHP singles out \"0\" as falsy; Python only cares whether the string is empty. Code ported from PHP that truthiness-tests numeric strings changes behaviour silently.",
    },
    {
      label: "Fallback values with or",
      intro:
        "Default a display name to 'guest', then default a port where 0 would be a valid value. The second case shows why `or` needs care.",
      php: `<?php
$display = $name ?: 'guest';     // falsy-based
$display = $name ?? 'guest';     // null/unset only

// 0 is falsy, so ?: would wrongly replace it;
// ?? keeps it because 0 is not null
$port = $port ?? 8080;`,
      ts: `display = name or "guest"       # falsy-based, like ?:

# no ?? operator - spell the None test out:
port = port if port is not None else 8080

# 'port or 8080' would turn a real 0 into 8080`,
      note:
        "`or` behaves like PHP's ?: (falsy-triggered); Python has no ?? — when only None should trigger the default, write the `is not None` conditional expression.",
    },
    {
      label: "Assignment inside a condition",
      intro:
        "Read chunks until exhausted, keeping the read-and-test in one line. PHP always allowed this; Python gained a dedicated operator in 3.8.",
      php: `<?php
// = in a condition has always been legal PHP
while ($chunk = fread($fh, 8192)) {
    process($chunk);
}`,
      ts: `# walrus := (Python 3.8) - assignment expression
while chunk := f.read(8192):
    process(chunk)

# plain = inside a condition is a SyntaxError,
# which is why := looks deliberately different`,
      note:
        "Python forbids bare = in expressions (killing the classic if ($x = 1) typo class) and provides := when you genuinely want assign-and-test.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Predict each line before running — especially the '0' string, what `name or \"guest\"` returns, and what happens when count is 0.",
    code: `values = [0, 0.0, "", "0", [], {}, None, "false"]
for v in values:
    print(f"{v!r:>7} -> {bool(v)}")

# No type juggling: == never coerces
print(1 == "1")

# or/and return an operand, like PHP's ?:
name = ""
print(name or "guest")

count = 0
print(count or 10)  # trap: 0 is a real value but falsy

# identity: reserve \`is\` for None
x = None
print(x is None)

# chained comparison - one expression, no &&
age = 25
print(0 <= age < 100)

# walrus := (3.8) assigns inside an expression
if (n := len("hello")) > 3:
    print(f"long word: {n} letters")`,
    output: `      0 -> False
    0.0 -> False
     '' -> False
    '0' -> True
     [] -> False
     {} -> False
   None -> False
'false' -> True
False
guest
10
True
True
long word: 5 letters`,
  },

  keyPoints: [
    "Falsy: `False`, `None`, `0`, `0.0`, `\"\"`, and empty containers (`[]`, `{}`, `set()`, `()`); everything else is truthy.",
    "The string `\"0\"` is **truthy** in Python but falsy in PHP — the one truthiness difference that silently flips behaviour.",
    "Python `==` never coerces (`1 == \"1\"` is `False`), so there is no `===`; use `x is None` as your `$x === null`.",
    "`is` checks identity — correct for `None` and sentinels, wrong for numbers/strings (interning makes results unreliable).",
    "`and`/`or` return operands: `name or \"guest\"` ≈ `$name ?: 'guest'`, but a valid `0`/`\"\"` gets replaced — use `x if x is not None else d` for `??` semantics.",
    "Chained comparisons (`0 <= x < 10`) and the walrus `:=` (3.8) are the two condition-writing upgrades to adopt on day one.",
  ],

  interview: [
    {
      q: "Coming from PHP, how do Python's equality semantics differ, and where does `is` fit in?",
      a: "PHP needs `===` because `==` juggles types — `0 == \"a\"` history, `\"1\" == \"01\"`, all of it. Python's `==` compares values with no coercion at all, so `1 == \"1\"` is just `False` and the strict/loose split doesn't exist. `is` is a different question entirely: object identity, like asking whether two variables reference the same instance. Its idiomatic use is nearly exclusive to `x is None` (the equivalent of `$x === null`, safe because `None` is a singleton) and custom sentinels. Using `is` on ints or strings is a bug even when it appears to work, because CPython's caching of small ints and interned strings makes the result an implementation detail.",
    },
    {
      q: "What would you watch for when porting PHP truthiness checks to Python?",
      a: "The lists mostly agree — empty string, zero, empty array/list are falsy in both — with one landmine: PHP treats the *string* `\"0\"` as falsy and Python doesn't, so any code truthiness-testing numeric strings (form input, CSV fields, query params) changes behaviour silently. The second thing is fallback idioms: `name or \"guest\"` is PHP's `?:`, but Python has no `??`, so when `0` or `\"\"` are legitimate values you must write `x if x is not None else default` rather than `or`. Finally, `if not items:` is the idiomatic `empty()` check for containers — reviewers will flag `len(items) == 0`.",
    },
    {
      q: "PHP 8 has the nullsafe operator ?->. What's the Python equivalent for optional chains?",
      a: "There isn't one — no `?.` exists in Python. In practice you handle it three ways: a conditional expression for one hop (`city = user.address.city if user.address else None`); `try`/`except AttributeError` when a whole chain may break, which fits Python's ask-forgiveness style; or `getattr(obj, \"attr\", default)` when the attribute name is dynamic or genuinely optional. The deeper answer is that idiomatic Python avoids long nullable chains — you reach for defaults early or model the absence explicitly — so the operator is missed less than a PHP developer expects.",
    },
  ],

  quiz: [
    {
      question: "Which of these is truthy in Python but falsy in PHP?",
      options: ["0.0", "The string \"0\"", "An empty list/array", "The empty string \"\""],
      answerIndex: 1,
      explain:
        "Python only treats the *empty* string as falsy; any other string — including \"0\" — is truthy. PHP specifically defines \"0\" as falsy, so this check flips when porting code.",
    },
    {
      question: "What is the idiomatic Python spelling of PHP's `$x === null`?",
      options: ["x == None", "x === None", "x is None", "isset(x) == False"],
      answerIndex: 2,
      explain:
        "`None` is a singleton, so the identity check `x is None` is the canonical test (PEP 8 mandates it). `x == None` usually works but can be fooled by custom `__eq__`, and `===` doesn't exist in Python.",
    },
    {
      question: "With `count = 0`, what does `count or 10` evaluate to?",
      options: ["0", "10", "True", "False"],
      answerIndex: 1,
      explain:
        "`or` returns its first truthy operand — and 0 is falsy, so you get 10 even though 0 was a real value. Exactly the `?:` trap from PHP; when only None should trigger the fallback, write `count if count is not None else 10`.",
    },
    {
      question: "What does the walrus operator `:=` (Python 3.8) let you do?",
      options: [
        "Compare without type coercion",
        "Assign a value inside an expression, e.g. `while chunk := f.read():`",
        "Declare a constant",
        "Merge two dicts",
      ],
      answerIndex: 1,
      explain:
        "`:=` is an assignment *expression* — it binds a name and yields the value, enabling assign-and-test conditions PHP has always allowed with plain `=`. Bare `=` inside a Python condition remains a SyntaxError.",
    },
  ],
};

export default lesson;
