import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "pythonic-idioms-and-gotchas",
  title: "Pythonic Idioms & the Gotchas That Bite PHP Devs",
  part: "Real-World Python",
  estMinutes: 14,
  summary:
    "The idioms that make code read as Python rather than translated PHP — and the eight traps where a correct PHP instinct produces a wrong Python program.",

  concept: `
Run \`import this\` in a REPL and Python prints its design manifesto, the *Zen
of Python*. Two lines do most of the work: **"Explicit is better than
implicit"** (no type juggling, no magic globals) and **"Flat is better than
nested"** (early returns and guard clauses over arrow-shaped ifs). Add the
cultural preference for **EAFP** — *easier to ask forgiveness than permission*:
try the operation and catch the exception, instead of PHP's isset-everything
look-before-you-leap.

### Idioms: what "Pythonic" means in practice

- **Tuple unpacking everywhere**: \`a, b = b, a\` swaps without a temp;
  \`first, *rest = items\` splits a list (≈ list()/array destructuring).
- **\`sep.join(parts)\`** not string concatenation in a loop (≈ \`implode\`).
- **Comprehensions** over build-a-list loops: \`[u.email for u in users if u.active]\`
  says *what*, not *how*.
- **\`with\`** over manual cleanup: files, locks and connections close
  themselves even on exceptions — no \`finally { fclose(...) }\`.
- **\`enumerate(items)\`** over a manual \`i += 1\` counter; \`for i, item in enumerate(items):\`.
- **Truthiness checks**: \`if items:\` not \`if len(items) > 0:\`; \`if name:\` not
  \`if name != "":\`.

### The gotcha list — where PHP instincts betray you

1. **Assignment never copies.** \`b = a\` makes \`b\` a second name for the *same*
   list — mutate one, you've mutated "both". PHP arrays copy on assignment, so
   this is the single most disorienting difference. Copy explicitly:
   \`list(a)\`, \`a.copy()\`, or \`copy.deepcopy(a)\` for nested structures.
2. **Mutable default arguments.** \`def f(tags=[])\` evaluates \`[]\` **once, at
   def time** — every call shares one list that accumulates forever. PHP
   evaluates defaults per call, so the habit feels safe. Use
   \`tags=None\` then \`tags = tags if tags is not None else []\`.
3. **Late-binding closures.** Lambdas in a loop capture the *variable* \`i\`,
   not its value — after the loop, all of them see the final value. PHP made
   you bind explicitly with \`use ($i)\` (by value!), which dodged this. Fix:
   the default-argument trick \`lambda i=i: ...\` or \`functools.partial\`.
4. **\`is\` vs \`==\`.** \`==\` compares values; \`is\` compares identity (same
   object). \`x is None\` is correct; \`a is b\` for ints/strings only *seems* to
   work because CPython caches small ints — don't trust it. There is no
   \`===\`; Python \`==\` never type-juggles, so it already does what \`===\` did.
5. **Class attributes are shared.** Assign a mutable default on the class body
   (\`items = []\`) and every instance mutates the same list — it's closer to a
   \`static\` property than a PHP instance property default. Initialise per
   instance in \`__init__\` (or use dataclass \`field(default_factory=list)\`).
6. **Don't mutate a list you're iterating.** \`remove()\` inside \`for x in items:\`
   skips elements (and mutating a dict mid-iteration raises \`RuntimeError\`).
   PHP's \`foreach\` iterates a copy, so the habit was harmless there. Build a
   new list with a comprehension, or iterate a copy: \`for x in items[:]:\`.
7. **\`"0"\` is truthy.** Any non-empty string is truthy in Python — only \`""\`
   is falsy. PHP treats \`"0"\` as falsy; that instinct silently inverts logic
   on form input and CSV fields.
8. **\`/\` is always float division.** \`7 / 2 == 3.5\` even for two ints; floor
   division is the separate operator \`7 // 2 == 3\` — and it floors toward
   negative infinity, so \`-7 // 2 == -4\`, not \`-3\` (PHP's \`intdiv()\`
   truncates toward zero).

None of these are exotic — each one is a *correct PHP habit* applied where
Python's object model (names bind to shared objects; defaults and class bodies
evaluate once) makes it wrong. Learn the eight and you've defused most of the
"Python is weird" moments.
`,

  comparisons: [
    {
      label: "Gotcha #1: assignment copies in PHP, aliases in Python",
      intro:
        "Copy a 'template' array/list, then modify the copy. In PHP the original survives; in Python — unless you copy explicitly — you've corrupted the template.",
      php: `<?php
// PHP arrays COPY on assignment (copy-on-write)
$template = ['status' => 'new', 'tags' => []];
$order = $template;          // independent copy
$order['status'] = 'paid';

var_dump($template['status']); // string(3) "new"  — untouched`,
      ts: `# Python names ALIAS — b = a is the same object
template = {"status": "new", "tags": []}
order = template             # NOT a copy: two names, one dict
order["status"] = "paid"
print(template["status"])    # 'paid'  — template corrupted!

order = dict(template)       # shallow copy: top level independent
import copy
order = copy.deepcopy(template)  # nested structures too`,
      note:
        "In Python, assignment never copies any object — dict(a)/list(a)/.copy() copy one level, copy.deepcopy() copies the whole tree. This is the #1 source of 'impossible' bugs for PHP devs.",
    },
    {
      label: "Gotcha #2: default arguments evaluate once, not per call",
      intro:
        "A function with a default-empty collection parameter, called twice. PHP gives each call a fresh array; Python shares one list across all calls.",
      php: `<?php
// PHP evaluates the default on EVERY call
function addTag(string $tag, array $tags = []): array {
    $tags[] = $tag;
    return $tags;
}

print_r(addTag('php'));    // ['php']
print_r(addTag('python')); // ['python']  — fresh array each call`,
      ts: `# Python evaluates the default ONCE, at def time
def add_tag(tag, tags=[]):        # one shared list, forever
    tags.append(tag)
    return tags

print(add_tag("php"))     # ['php']
print(add_tag("python"))  # ['php', 'python']  — surprise!

def add_tag_ok(tag, tags=None):   # the standard fix
    tags = tags if tags is not None else []
    tags.append(tag)
    return tags`,
      note:
        "Defaults are evaluated when def runs and stored on the function object — safe for immutables (None, numbers, strings), a trap for lists/dicts. The None-sentinel pattern is the universal fix.",
    },
    {
      label: "Idioms: translated PHP vs Pythonic Python",
      intro:
        "Format the active users as a numbered comma-separated line. Both versions work; one reads like PHP wearing a Python costume.",
      php: `<?php
// The PHP shape: counter, guard by count(), concat in a loop
$names = [];
$i = 0;
foreach ($users as $user) {
    if ($user->active) {
        $i++;
        $names[] = $i . '. ' . $user->name;
    }
}
if (count($names) > 0) {
    echo implode(', ', $names), "\\n";
}`,
      ts: `# Pythonic: comprehension + enumerate + join + truthiness
active = [u.name for u in users if u.active]
names = [f"{i}. {name}" for i, name in enumerate(active, start=1)]

if names:                     # not: if len(names) > 0
    print(", ".join(names))`,
      note:
        "enumerate() replaces manual counters, comprehensions replace build-up loops, join replaces loop concatenation, and bare `if names:` is the idiomatic emptiness check.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Five gotchas in one script: aliasing vs copying, the mutable default, late-binding lambdas, '0' truthiness, and division. Predict all nine printed lines — your PHP instincts will get at least one wrong.",
    code: `# gotchas.py — five traps for a PHP brain. Predict every line before running.

# 1. Assignment NEVER copies (PHP arrays copy on assign!)
a = [1, 2, 3]
b = a          # alias, not a copy
b.append(4)
print("a is b:", a is b, "| a =", a)
c = list(a)    # THIS is the copy
c.append(5)
print("a after copying c:", a)

# 2. Mutable default argument — evaluated once, at def time
def add_tag(tag, tags=[]):
    tags.append(tag)
    return tags
print(add_tag("php"))
print(add_tag("python"))   # same list as last call!

# 3. Late-binding closures — like PHP's use ($i) NOT being there
fns = [lambda: i for i in range(3)]
print([f() for f in fns])          # all see the final i
fixed = [lambda i=i: i for i in range(3)]
print([f() for f in fixed])

# 4. Truthiness: the string "0" is truthy in Python
print(bool("0"), bool(0), bool([]))

# 5. / is ALWAYS float division; // floors
print(7 / 2, 7 // 2, -7 // 2)`,
    output: `a is b: True | a = [1, 2, 3, 4]
a after copying c: [1, 2, 3, 4]
['php']
['php', 'python']
[2, 2, 2]
[0, 1, 2]
True False False
3.5 3 -4`,
  },

  keyPoints: [
    "`b = a` never copies in Python — both names point at the same object (PHP arrays copy on assignment). Copy explicitly with `list(a)` / `.copy()` / `copy.deepcopy()`.",
    "Default arguments evaluate once at `def` time: `def f(tags=[])` shares one list across all calls — use the `tags=None` sentinel pattern.",
    "Closures late-bind loop variables (all lambdas see the final value); PHP's `use ($i)` captured by value. Fix with `lambda i=i:` or `functools.partial`.",
    "`==` compares values (and never type-juggles, so it plays the role of `===`); `is` compares identity and is only for `None` and sentinels — small-int caching makes `is` on numbers *look* reliable, it isn't.",
    "Mutable class-body attributes are shared by all instances (think `static`), and mutating a list/dict while iterating it misbehaves — PHP's foreach-on-a-copy hid both.",
    "`\"0\"` is truthy (only `\"\"` is falsy among strings), and `/` always yields float — `//` floor-divides, flooring `-7 // 2` to `-4`.",
  ],

  interview: [
    {
      q: "What does 'Pythonic' mean, and what would you change in Python code that was clearly written by a PHP developer?",
      a: "Pythonic code uses the language's own idioms instead of transliterating another language's — the Zen of Python ('explicit is better than implicit', 'flat is better than nested') plus community convention. The tells I'd fix: manual index counters instead of `enumerate()`, building lists with append-loops instead of comprehensions, `if len(items) > 0:` instead of `if items:`, string concatenation in loops instead of `\", \".join()`, look-before-you-leap key checks instead of EAFP `try/except` or `dict.get()`, and manual close/cleanup instead of `with`. None of these are correctness issues — they're fluency signals, and interviewers read them exactly the way you'd read `if ($x == true)` in PHP.",
    },
    {
      q: "PHP arrays copy on assignment. What happens with Python lists, and how do you copy properly?",
      a: "Assignment in Python only binds a name to an object — `b = a` gives you two names for one list, so `b.append(...)` visibly changes `a`. That's the sharpest behavioural difference from PHP, where `$b = $a` gives an independent array (copy-on-write). To actually copy: `list(a)`, `a[:]` or `a.copy()` make a *shallow* copy — a new outer list still sharing the inner objects — and `copy.deepcopy(a)` recursively copies nested structures. The same applies to dicts and to function arguments: passing a list into a function passes the object itself, so in-place mutations are visible to the caller.",
    },
    {
      q: "Explain the mutable default argument bug and why PHP developers hit it.",
      a: "In Python, a function's default values are evaluated exactly once — when the `def` statement executes — and stored on the function object. So `def add(tag, tags=[])` creates one list that every default-using call shares; it accumulates values across calls. PHP evaluates parameter defaults on every call, so `array $tags = []` there is always fresh, and the habit transfers badly. The idiom is a `None` sentinel: default to `None`, then `tags = tags if tags is not None else []` inside the body — or `field(default_factory=list)` in dataclasses, which exists precisely because of this rule.",
    },
    {
      q: "How do `is` and `==` differ, and where does PHP's `===` fit?",
      a: "`==` asks 'equal values?' and `is` asks 'the very same object in memory?'. The correct uses of `is` are `None` checks (`if x is None:`) and sentinel objects. It sometimes *appears* to work for numbers because CPython caches small integers (-5 to 256) and interns some strings, so `a is b` can be True for 100 and False for 1000 — an implementation detail, never rely on it. PHP's `===` guarded against type-juggling (`\"1\" == \"01\"` is still true in PHP 8); Python's `==` doesn't juggle types in the first place — `0 == \"0\"` is simply `False` — so plain `==` already gives you `===` semantics, and `is` is *not* its equivalent.",
    },
  ],

  quiz: [
    {
      question: "After `a = [1, 2]` then `b = a` then `b.append(3)`, what is `a`?",
      options: [
        "[1, 2] — b got its own copy, like a PHP array",
        "[1, 2, 3] — a and b are two names for the same list",
        "[1, 2] — but only because append returns a new list",
        "It raises an error: a is read-only while b exists",
      ],
      answerIndex: 1,
      explain:
        "Assignment binds a name to an object; it never copies. a and b reference one list, so mutation through either name is visible through both. PHP arrays copy on assignment, which is why this trips PHP developers first.",
    },
    {
      question: "Why is `def f(items=[])` dangerous?",
      options: [
        "Empty lists are not allowed as defaults",
        "The default is re-created on every call, wasting memory",
        "The [] is evaluated once at def time, so all calls share one growing list",
        "It shadows the built-in list type",
      ],
      answerIndex: 2,
      explain:
        "Defaults are evaluated when def executes and stored on the function, so every call that omits the argument mutates the same list. PHP evaluates defaults per call, making the pattern safe there. Use items=None plus a check inside.",
    },
    {
      question: "Which check is correct and idiomatic for 'x has no value' in Python?",
      options: [
        "if x == None:",
        "if x is None:",
        "if !x:",
        "if x === None:",
      ],
      answerIndex: 1,
      explain:
        "None is a singleton, so identity (`is None`) is the idiomatic and reliable test; `== None` can be fooled by objects overriding __eq__, `!x` isn't Python syntax (it's `not x`, which also catches 0/\"\"/[]), and === doesn't exist.",
    },
    {
      question: "What does `print(bool(\"0\"), 7 / 2, -7 // 2)` output?",
      options: [
        "False 3.5 -3",
        "True 3 -3",
        "True 3.5 -4",
        "False 3 -4",
      ],
      answerIndex: 2,
      explain:
        "Any non-empty string is truthy in Python — including \"0\" (falsy in PHP). / always returns a float (3.5), and // floors toward negative infinity, so -7 // 2 is -4, not the -3 you'd get from truncation like PHP's intdiv().",
    },
  ],
};

export default lesson;
