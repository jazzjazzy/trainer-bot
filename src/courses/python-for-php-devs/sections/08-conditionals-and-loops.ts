import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "conditionals-and-loops",
  title: "if/elif, for-in & while",
  part: "Control Flow & Functions",
  estMinutes: 12,
  summary:
    "Python's for IS foreach, range() replaces the C-style counter loop, and if/elif/match cover branching — plus the for/else clause PHP never had.",

  concept: `
Control flow is where Python feels most familiar and most alien at once: every
construct you know exists, but one you use daily — the C-style \`for (;;)\` —
simply **does not exist**.

### if / elif / else

\`\`\`python
if status == "active":
    enable()
elif status == "trial":     # elif, not elseif/else if
    remind()
else:
    disable()
\`\`\`

No parentheses required around the condition, no braces — the colon and
indentation do the work. \`&&\`/\`||\`/\`!\` become the words \`and\`/\`or\`/\`not\`.

### The ternary — value first

PHP: \`$label = $n % 2 === 0 ? 'even' : 'odd';\`. Python reverses the order —
the *result* leads, the test sits in the middle:

\`\`\`python
label = "even" if n % 2 == 0 else "odd"
\`\`\`

Read it aloud: "even, if n is even, else odd." There's no \`?:\` short form;
\`x if x else d\` is spelled \`x or d\`.

### match — like PHP 8's match, then some

Python 3.10's \`match\` statement will remind you of PHP 8.0's \`match\`
expression, with two twists. First, it's a *statement* (each \`case\` holds a
block, and doesn't return a value). Second, it's **structural**: beyond
comparing values, a case pattern can destructure the subject and bind names.

\`\`\`python
match point:
    case (0, 0):
        print("origin")
    case (x, 0):              # binds x from the tuple!
        print(f"on the x-axis at {x}")
    case 404 | 410:           # alternatives, like match's comma
        print("gone")
    case _:                   # the default arm
        print("elsewhere")
\`\`\`

PHP's \`match\` compares with \`===\` and stops there; Python's takes the shape
of your data apart. Full pattern matching is a topic of its own — for now,
know it exists and reaches further than PHP's.

### for-in is foreach — and it's the only for

\`\`\`python
for user in users:           # foreach ($users as $user)
    print(user)

for k, v in prices.items():  # foreach ($prices as $k => $v)
    print(k, v)
\`\`\`

There is **no** \`for ($i = 0; $i < $n; $i++)\`. Counting loops iterate a
\`range\`:

\`\`\`python
for i in range(5):           # 0,1,2,3,4 - end is exclusive
for i in range(1, 6):        # 1..5
for i in range(10, 0, -2):   # 10,8,6,4,2
\`\`\`

Need the index *and* the element? Don't loop \`range(len(xs))\` — that's a
PHP accent. Use \`enumerate\`:

\`\`\`python
for i, user in enumerate(users, start=1):   # foreach with an index
\`\`\`

And to walk two lists in lockstep, \`zip(names, scores)\` pairs them up — the
job PHP gives to \`array_map(null, $names, $scores)\` or manual indexing.

### while — minus do-while

\`while\` works exactly as in PHP; \`break\` and \`continue\` are identical. But
there is **no do-while**. The idiom for "run at least once" is:

\`\`\`python
while True:
    line = input("> ")
    if line == "quit":
        break
\`\`\`

That \`while True:\` + \`break\` shape looks suspicious to a PHP eye and is
completely idiomatic Python.

### for/else — the clause PHP never had

Both \`for\` and \`while\` accept an \`else\` block that runs **only when the loop
finished without \`break\`**. It replaces PHP's found-flag pattern:

\`\`\`python
for user in users:
    if user.name == target:
        print("found")
        break
else:
    print("not found")       # ran the whole loop, no break
\`\`\`

Think of it as "else: nothing broke out". Misreading it as "runs when the loop
was empty" is the classic mistake — an empty loop *also* never breaks, so the
else runs then too.
`,

  comparisons: [
    {
      label: "Counting loop: for(;;) vs range()",
      intro:
        "Print the numbers 0 through 4. PHP counts with a three-part for; Python iterates a range object — there is no other for loop to fall back on.",
      php: `<?php
for ($i = 0; $i < 5; $i++) {
    echo $i . "\\n";
}

// counting down by 2
for ($i = 10; $i > 0; $i -= 2) {
    echo $i . "\\n";
}`,
      ts: `for i in range(5):        # 0..4, end exclusive
    print(i)

# counting down by 2
for i in range(10, 0, -2):   # 10, 8, 6, 4, 2
    print(i)`,
      note:
        "range(start, stop, step) covers every counting pattern; the stop value is always exclusive, matching the `< $n` habit rather than `<= $n`.",
    },
    {
      label: "foreach with index and key => value",
      intro:
        "Print a numbered list, then a dict as key/value pairs. enumerate() and .items() are the two foreach flavours.",
      php: `<?php
$langs = ['php', 'python', 'go'];
foreach ($langs as $i => $lang) {
    echo ($i + 1) . ". {$lang}\\n";
}

$versions = ['php' => 8.3, 'python' => 3.12];
foreach ($versions as $name => $ver) {
    echo "{$name} {$ver}\\n";
}`,
      ts: `langs = ["php", "python", "go"]
for i, lang in enumerate(langs, start=1):
    print(f"{i}. {lang}")

versions = {"php": 8.3, "python": 3.12}
for name, ver in versions.items():
    print(f"{name} {ver}")`,
      note:
        "enumerate() hands you (index, element) pairs — with a start offset, so no $i + 1 arithmetic — and .items() is the $k => $v form; looping range(len(xs)) is the tell of a PHP accent.",
    },
    {
      label: "match: value comparison vs structural patterns",
      intro:
        "Route an HTTP status, then destructure a coordinate pair. PHP's match handles the first; only Python's handles the second.",
      php: `<?php
// PHP 8.0 match: strict value comparison, returns a value
$msg = match ($status) {
    200, 204 => 'ok',
    404, 410 => 'gone',
    default  => 'unknown',
};

// destructuring a pair needs separate code
[$x, $y] = $point;`,
      ts: `# Python 3.10 match: a statement, and structural
match status:
    case 200 | 204:
        msg = "ok"
    case 404 | 410:
        msg = "gone"
    case _:
        msg = "unknown"

match point:
    case (0, 0):
        print("origin")
    case (x, 0):      # matches AND binds x
        print(f"x-axis at {x}")`,
      note:
        "PHP match is an expression comparing with ===; Python's match is a statement whose case patterns can take data structures apart and bind variables — closer to destructuring than to switch.",
    },
    {
      label: "Search with a found-flag vs for/else",
      intro:
        "Look for an admin in a list and report if none exists. PHP tracks a boolean; Python's for/else eliminates it.",
      php: `<?php
$found = false;
foreach ($users as $user) {
    if ($user->isAdmin()) {
        echo "admin: {$user->name}\\n";
        $found = true;
        break;
    }
}
if (!$found) {
    echo "no admins\\n";
}`,
      ts: `for user in users:
    if user.is_admin:
        print(f"admin: {user.name}")
        break
else:
    print("no admins")   # only if no break fired

# also works on while loops`,
      note:
        "The loop-else runs exactly when the loop completed without break — the found-flag pattern built into the syntax. No PHP equivalent exists; read it as 'else: nothing broke out'.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Every loop and branch flavour in one script. Predict the ternary's result, which match arm fires, and whether the for/else prints — then check the do-while stand-in at the end.",
    code: `langs = ["php", "python", "go"]

# for-in IS foreach - there is no for (;;) in Python
for lang in langs:
    print(lang.upper())

# range() replaces for ($i = 0; $i < 3; $i++)
print(list(range(3)))

# enumerate = foreach with an index
for i, lang in enumerate(langs, start=1):
    print(f"{i}. {lang}")

# dict iteration = foreach ($versions as $name => $ver)
versions = {"php": 8.3, "python": 3.12}
for name, ver in versions.items():
    print(f"{name} {ver}")

# conditional expression: VALUE first, then the test
n = 7
print("even" if n % 2 == 0 else "odd")

# match (3.10): patterns, with | for alternatives
status = 404
match status:
    case 200:
        print("ok")
    case 404 | 410:
        print("gone")
    case _:
        print("unknown")

# for/else: else runs only if the loop never hit break
for lang in langs:
    if lang == "rust":
        break
else:
    print("no rust here")

# no do-while: the while True + break idiom
attempts = 0
while True:
    attempts += 1
    if attempts == 3:
        break
print(f"stopped after {attempts}")`,
    output: `PHP
PYTHON
GO
[0, 1, 2]
1. php
2. python
3. go
php 8.3
python 3.12
odd
gone
no rust here
stopped after 3`,
  },

  keyPoints: [
    "`elif` (not `elseif`), no parentheses needed, colon + indent instead of braces; `&&`/`||`/`!` are the words `and`/`or`/`not`.",
    "The ternary reverses PHP's order: `\"even\" if n % 2 == 0 else \"odd\"` — value, condition, fallback.",
    "Python has NO C-style `for(;;)`: `for x in xs` is `foreach`, and `range(a, b, step)` (end-exclusive) covers counting.",
    "`enumerate(xs, start=1)` = foreach with an index; `zip(a, b)` walks lists in lockstep; `for k, v in d.items()` = `foreach $k => $v`.",
    "No do-while — `while True:` + `break` is the idiom; `break`/`continue` behave exactly as in PHP.",
    "`for`/`else` and `while`/`else` run the else only when no `break` fired — a built-in found-flag with no PHP equivalent.",
    "`match` (3.10) resembles PHP 8's `match` but is structural: case patterns destructure data and bind names.",
  ],

  interview: [
    {
      q: "Python has no C-style for loop. How do you cover PHP's for/foreach patterns idiomatically?",
      a: "Everything is `for ... in` over an iterable. Plain `foreach ($xs as $x)` maps directly to `for x in xs`; a counting loop becomes `for i in range(n)` with `range(start, stop, step)` handling offsets and countdowns — stop is exclusive, like writing `< $n`. When I need the index too, the idiom is `enumerate(xs)` (optionally `start=1`) rather than looping `range(len(xs))` and indexing, which reviewers read as a C/PHP accent. `foreach ($d as $k => $v)` is `for k, v in d.items()`, and walking two sequences in lockstep is `zip(a, b)`. The absence of `for(;;)` sounds limiting but in practice range/enumerate/zip cover every case more readably.",
    },
    {
      q: "How does Python's match compare to PHP 8's match expression?",
      a: "Superficially similar, fundamentally different. PHP's `match` is an *expression*: it strictly (`===`) compares the subject against scalar arms and returns a value, with mandatory exhaustiveness via `UnhandledMatchError`. Python's `match` (3.10, PEP 634) is a *statement* doing structural pattern matching: a case can be a literal, but it can also be a tuple/list/dict/class pattern that destructures the subject and binds variables — `case (x, 0):` both matches any pair ending in zero and captures `x`. Alternatives use `|` where PHP uses commas, `case _:` is the default, and there's no error if nothing matches — it just falls through. So I'd describe it as PHP's match plus destructuring, at the cost of not being an expression.",
    },
    {
      q: "Explain the for/else clause — when does the else run?",
      a: "The `else` block runs when the loop terminated *normally* — i.e. it exhausted the iterable (or the while condition went false) without hitting `break`. It exists to replace the found-flag pattern: search a collection, `break` on a hit, and put the not-found handling in the `else` instead of testing a boolean afterwards. The common misreading is thinking it runs when the loop body never executed; an empty iterable also never breaks, so the else runs in that case too — the only thing that skips it is `break` (or an exception). It's a Python-only construct with no PHP analogue, and because the keyword choice confuses people, some teams avoid it; I use it for short search loops where it clearly deletes a flag variable.",
    },
  ],

  quiz: [
    {
      question: "How do you write PHP's `for ($i = 0; $i < 10; $i += 2)` in Python?",
      options: [
        "for (i = 0; i < 10; i += 2):",
        "for i in range(0, 10, 2):",
        "for i in range(0, 10, step=2):",
        "while i < 10: i += 2",
      ],
      answerIndex: 1,
      explain:
        "Python has no three-part for; counting loops iterate `range(start, stop, step)` — here 0, 2, 4, 6, 8, with the stop value excluded. (range takes step positionally, not as a keyword.)",
    },
    {
      question: "When does the `else` block of a `for` loop execute?",
      options: [
        "When the iterable was empty",
        "When the loop finished without hitting break",
        "After every iteration",
        "Only when break was hit",
      ],
      answerIndex: 1,
      explain:
        "The loop-else fires on normal completion — no `break`. An empty iterable also completes without breaking, so the else runs then as well; the mnemonic is 'else: nothing broke out'.",
    },
    {
      question: "Which is the correct Python spelling of PHP's `$label = $n > 5 ? 'big' : 'small';`?",
      options: [
        "label = n > 5 ? \"big\" : \"small\"",
        "label = if n > 5: \"big\" else: \"small\"",
        "label = \"big\" if n > 5 else \"small\"",
        "label = (n > 5) and \"big\" or \"small\"",
      ],
      answerIndex: 2,
      explain:
        "Python's conditional expression puts the value first: result-if-true, `if` condition, `else` fallback. There's no `?:` operator, and the and/or trick (option 4) breaks when the true-value is falsy.",
    },
    {
      question: "Python has no do-while loop. What's the idiomatic replacement?",
      options: [
        "do: ... while cond",
        "repeat: ... until cond",
        "A while True: loop with a break when done",
        "Recursion — loops can't guarantee one execution",
      ],
      answerIndex: 2,
      explain:
        "`while True:` with an explicit `break` runs the body at least once and exits mid-loop when the condition is met — standard, idiomatic Python despite looking like an infinite loop to PHP eyes.",
    },
  ],
};

export default lesson;
