import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "syntax-and-variables",
  title: "Syntax Shock: Indentation, Variables & None",
  part: "First Contact",
  estMinutes: 11,
  summary:
    "How Python spells blocks, variables, null and constants — the mechanical translations your fingers need before anything else.",

  concept: `
Everything in this section is something your fingers already do in PHP — it
just has a different spelling in Python, and a couple of the spellings carry
different semantics.

### Blocks: colon + indentation, nothing else

Where PHP uses \`{ }\`, Python uses a \`:\` to open a block and **indentation**
to define it. Dedenting ends the block. No braces, no semicolons, no
\`endif;\`-style closers:

\`\`\`python
def ship(order):
    if order.paid:
        print("shipping")
        notify(order.customer)
    else:
        print("awaiting payment")
    print("checked")   # dedent: outside the if/else, still inside ship()
\`\`\`

The convention (and effectively the law — linters and teammates enforce it) is
**4 spaces per level**. Mixing tabs and spaces in the same block isn't just
ugly, it's fatal: Python refuses to guess how wide a tab is next to spaces and
raises \`TabError: inconsistent use of tabs and spaces in indentation\`.
Configure your editor to insert spaces and you'll never see it.

### Variables: bare names, no declaration

No \`$\`, no \`var\`, no type keyword — assignment *is* declaration:

\`\`\`python
total = 0
name = "Ada"
name = 42        # legal: dynamic typing, same spirit as PHP
\`\`\`

Python is dynamically typed like PHP, but the mental model is sharper: a
variable is a **name bound to an object**. Assignment never copies the object;
it points the name at it. Rebinding \`name = 42\` doesn't change the string —
it just makes the name refer to a different object. (This matters enormously
for mutable objects like lists — later section.)

### Multiple assignment and the swap

Python unpacks tuples across names in one statement — PHP needed \`list()\`
(or \`[$a, $b] = ...\`) and the classic swap needed a temp variable until
short-hands arrived:

\`\`\`python
low, high = 3, 9
low, high = high, low    # swap, no temp var
\`\`\`

### None, True, False — capitalised

PHP's \`null\` is Python's \`None\` — **capital N**, and likewise \`True\` and
\`False\` (lowercase \`true\` is simply an undefined name — a \`NameError\`).
Idiomatic null-checks use identity, not equality:

\`\`\`python
if middle_name is None: ...
if middle_name is not None: ...
\`\`\`

\`is None\` is the Python spelling of \`=== null\` — there's exactly one \`None\`
object, so identity comparison is both correct and idiomatic.

### Constants: a convention, not a keyword

There is no \`const\` and no \`define()\`. A "constant" is just a module-level
variable in \`UPPER_CASE\`, and nothing but code review stops someone
reassigning it:

\`\`\`python
MAX_RETRIES = 3     # everyone treats this as constant; nothing enforces it
\`\`\`

(Type checkers can enforce it via \`Final\` — covered with type hints later.)

### Comments

Only \`#\`. No \`//\`, no \`/* ... */\`. Multi-line "comments" are just stacked
\`#\` lines (docstrings — triple-quoted strings under a def — serve the
documentation role of docblocks).

### Naming recap

snake_case for variables/functions (\`due_date\`, \`send_invoice\`), PascalCase
for classes (\`InvoiceMailer\` — same as PHP), UPPER_CASE for constants.
`,

  comparisons: [
    {
      label: "A block, both spellings",
      intro:
        "The same guard clause and loop. Compare the punctuation load: PHP closes everything explicitly; Python's structure is the indentation itself.",
      php: `<?php
function label_scores(array $scores): void {
    foreach ($scores as $s) {
        if ($s >= 90) {
            echo "{$s}: excellent\\n";
        } else {
            echo "{$s}: ok\\n";
        }
    }
}
label_scores([95, 70]);`,
      ts: `def label_scores(scores):
    for s in scores:
        if s >= 90:
            print(f"{s}: excellent")
        else:
            print(f"{s}: ok")


label_scores([95, 70])`,
      note:
        "Every { becomes a :, every } becomes a dedent. Use 4 spaces per level; mixing tabs and spaces in one block raises TabError.",
    },
    {
      label: "null vs None",
      intro:
        "Checking whether an optional value is missing. Both snippets print the fallback when the value is absent.",
      php: `<?php
$middleName = null;

if ($middleName === null) {
    echo "no middle name\\n";
}

// PHP is lowercase: null, true, false
$flags = [true, false, null];`,
      ts: `middle_name = None

if middle_name is None:
    print("no middle name")

# Python capitalises all three:
flags = [True, False, None]
# 'is None' ≈ '=== null' — identity check
# against the single None object`,
      note:
        "None/True/False are capitalised — lowercase none/true/false are NameErrors. Test for None with `is`, not `==`.",
    },
    {
      label: "Swap and multiple assignment",
      intro:
        "Swapping two variables and unpacking a pair into two names. Both end with low=1, high=9 and the coordinates split into x and y.",
      php: `<?php
// PHP: list()/short array syntax
$low = 9; $high = 1;
[$low, $high] = [$high, $low];

$coords = [3, 7];
[$x, $y] = $coords;
echo "$low $high / $x $y\\n"; // 1 9 / 3 7`,
      ts: `low, high = 9, 1
low, high = high, low     # tuple packing/unpacking

coords = (3, 7)
x, y = coords

print(low, high, "/", x, y)   # 1 9 / 3 7`,
      note:
        "The right-hand side is packed into a tuple, then unpacked into the names — evaluated fully before assignment, which is why the swap needs no temp variable.",
    },
    {
      label: "Constants",
      intro:
        "Declaring a retry limit that the rest of the codebase should treat as fixed. PHP enforces it; Python trusts you.",
      php: `<?php
class Mailer {
    public const MAX_RETRIES = 3;
}

const APP_ENV = 'prod';

// Reassigning either is a fatal error.`,
      ts: `# config.py
MAX_RETRIES = 3          # convention: UPPER_CASE = constant
APP_ENV = "prod"

MAX_RETRIES = 5          # ...but nothing stops this
# (typing.Final + a type checker can, statically)`,
      note:
        "Python has no const keyword — UPPER_CASE is a social contract, enforced by review and optionally by type checkers, never by the runtime.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Rebinding, swapping, None, capitalised booleans and a fake constant. Predict all eight printed lines — watch the swap and the type of None.",
    code: `# rebinding.py — variables are names bound to objects
count = 1            # no $, no 'var', no type keyword
count = "one"        # rebinding to a different type is legal (same as PHP)
print(count)

# Multiple assignment and the classic swap:
low, high = 3, 9
low, high = high, low
print(low, high)

# None is Python's null — capitalised, and compared with 'is':
middle_name = None
print(middle_name is None)
print(type(middle_name).__name__)

# Booleans are capitalised too:
is_admin = True
print(is_admin, not is_admin)

# "Constants" are a naming convention, not enforced:
MAX_RETRIES = 3
MAX_RETRIES = 5      # nothing stops this — no const keyword
print(MAX_RETRIES)

if MAX_RETRIES > 3:
    label = "generous"     # this line belongs to the if — 4 spaces say so
    print(f"retries are {label}")
print("done")              # back at column 0: outside the if`,
    output: `one
9 3
True
NoneType
True False
5
retries are generous
done`,
  },

  keyPoints: [
    "Blocks: `:` opens, indentation defines, dedent closes. 4 spaces per level; mixing tabs and spaces raises `TabError`.",
    "Variables are bare snake_case names — no `$`, no declaration keyword; assignment binds a name to an object.",
    "`a, b = b, a` swaps via tuple packing/unpacking — no temp variable, and it generalises to any unpacking (`x, y = coords`).",
    "`None`, `True`, `False` are capitalised; test for None with `is None` (the `=== null` of Python).",
    "Constants are convention only: UPPER_CASE names with no runtime enforcement — there is no `const` or `define()`.",
    "Comments are `#` only — no `//` or `/* */`. PascalCase classes, snake_case everything else.",
  ],

  interview: [
    {
      q: "Python uses significant whitespace. Is that a real problem in practice?",
      a: "It sounds alarming after decades of braces, but in practice it changes nothing: I was already indenting every block correctly in PHP, and my formatter enforced it. Python just deletes the braces that duplicated that information. The only genuine failure mode is mixing tabs and spaces, which raises a TabError rather than silently misbehaving — and any editor configured for 4-space indents (plus a formatter like Black or Ruff) makes it a non-issue. The payoff is that code can't lie about its structure the way a mis-indented-but-braced PHP block can.",
    },
    {
      q: "How do Python variables differ from PHP variables under the hood?",
      a: "PHP variables are named slots holding values (with copy-on-write for arrays); Python variables are **names bound to objects**. Assignment never copies — `b = a` makes both names point at the same object, and rebinding one name later doesn't affect the other. For immutable things (ints, strings, tuples) the distinction is invisible, but for mutable objects like lists it's crucial: mutate through one name and every other name bound to that object sees the change. That's the single mental-model upgrade worth making early.",
    },
    {
      q: "Why is `is None` preferred over `== None`?",
      a: "`None` is a singleton — there is exactly one None object in the interpreter — so an identity check (`is`) is the precise question: 'is this name bound to *the* None object?'. It's the moral equivalent of PHP's `=== null`. `== None` invokes the equality protocol, which a class can override to return anything, so it can both lie and be slower. PEP 8 codifies it: comparisons to singletons like None should always use `is` or `is not`.",
    },
  ],

  quiz: [
    {
      question: "What happens if one block mixes tabs and spaces for indentation?",
      options: [
        "Python normalises tabs to 4 spaces and continues",
        "It raises TabError: inconsistent use of tabs and spaces in indentation",
        "It works but emits a DeprecationWarning",
        "The block is silently treated as ending at the first tab",
      ],
      answerIndex: 1,
      explain:
        "Python 3 refuses to guess a tab's width relative to spaces in the same block and raises TabError at parse time. Consistent 4-space indentation avoids it entirely.",
    },
    {
      question: "After `a, b = 1, 2` then `a, b = b, a`, what are a and b?",
      options: [
        "a=1, b=2 — the swap needs a temp variable",
        "a=2, b=1 — the right side is packed into a tuple before assignment",
        "It raises a SyntaxError",
        "a=2, b=2 — b is assigned first, then copied to a",
      ],
      answerIndex: 1,
      explain:
        "The whole right-hand side (b, a) is evaluated into a tuple first, then unpacked into the left-hand names — so the swap is atomic and needs no temporary.",
    },
    {
      question: "Which is the correct Python spelling of PHP's `$x === null` check?",
      options: ["x === null", "x == none", "x is None", "isset(x) === false"],
      answerIndex: 2,
      explain:
        "Python's null is the capitalised singleton None, and identity comparison with `is` is the idiomatic (PEP 8) way to test for it. There is no === operator in Python.",
    },
    {
      question: "How do you declare a true, engine-enforced constant in Python?",
      options: [
        "const MAX = 3",
        "define('MAX', 3)",
        "final MAX = 3",
        "You can't — UPPER_CASE naming is a convention; only type checkers (via Final) can enforce it",
      ],
      answerIndex: 3,
      explain:
        "Python has no const mechanism at runtime. UPPER_CASE signals intent, and typing.Final lets static type checkers flag reassignment — but the interpreter will never stop it.",
    },
  ],
};

export default lesson;
