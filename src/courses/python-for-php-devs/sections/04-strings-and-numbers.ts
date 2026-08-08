import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "strings-and-numbers",
  title: "Strings, Numbers & f-strings",
  part: "First Contact",
  estMinutes: 12,
  summary:
    "f-strings, string methods instead of PHP's function soup, why Python refuses to type-juggle, and the number rules that differ from PHP.",

  concept: `
Strings are where a PHP veteran feels the biggest everyday difference: PHP
gives you 100+ global \`str_*\` functions; Python gives you **methods on the
string object**. And PHP's famous type juggling? Python refuses to play.

### f-strings: interpolation, upgraded

PHP interpolates variables in double quotes: \`"Hello $name"\` or
\`"Hello {$user->name}"\`. Python's equivalent is the **f-string** (3.6+, so
universal) — prefix the literal with \`f\` and put *any expression* in braces:

\`\`\`python
name = "ada"
print(f"Hello {name}")            # variables
print(f"Hello {name.title()}")    # full expressions — method calls, math, anything
\`\`\`

Format specs after a colon replace \`number_format()\`/\`sprintf()\`:

\`\`\`python
f"{price:.2f}"      # 2 decimals            ≈ number_format($price, 2)
f"{n:05d}"          # zero-padded to 5      ≈ sprintf('%05d', $n)
f"{ratio:.1%}"      # as a percentage
\`\`\`

A plain \`"Hello {name}"\` without the \`f\` does **no** interpolation — the
braces are just characters. Forgetting the \`f\` is the classic first-week bug.

### Methods, not function soup

PHP strings are passive values you pass *to* functions; Python strings are
objects you call methods *on*. The translation table your fingers need:

| PHP | Python |
| --- | --- |
| \`strtoupper($x)\` | \`x.upper()\` |
| \`strtolower($x)\` | \`x.lower()\` |
| \`trim($x)\` | \`x.strip()\` |
| \`str_replace('a', 'b', $x)\` | \`x.replace("a", "b")\` |
| \`explode(',', $x)\` | \`x.split(",")\` |
| \`implode(', ', $arr)\` | \`", ".join(items)\` |
| \`strlen($x)\` | \`len(x)\` |
| \`str_contains($x, 'y')\` | \`"y" in x\` |

Two gotchas hide in that table. First, **join is a method on the separator**,
not the list: \`", ".join(names)\`. It reads backwards for about a day, then
becomes natural. Second, strings are **immutable** — every method returns a
*new* string; \`x.upper()\` doesn't change \`x\`, and \`x[0] = "A"\` is a
\`TypeError\`.

### Concatenation: + and no juggling

Concatenation is \`+\` (not \`.\` — the dot is for methods/attributes now). And
Python will not coerce between numbers and strings:

\`\`\`python
"items: " + 3         # TypeError: can only concatenate str (not "int") to str
"items: " + str(3)    # fine
f"items: {3}"         # better — f-strings convert for you
\`\`\`

Where PHP juggles (\`"5" + 3 == 8\`), Python raises. After 25 years of
defensive casting, an interpreter that refuses instead of guessing is a gift.

### Numbers: four rules that differ from PHP

1. **\`int\` is arbitrary precision.** No \`PHP_INT_MAX\`, no silent overflow to
   float — \`2 ** 200\` is an exact integer.
2. **\`/\` always returns a float**, even \`10 / 2\` → \`5.0\`. PHP's \`/\` returns
   int when it divides evenly; Python's never does.
3. **\`//\` is floor division** (\`7 // 2\` → \`3\`) — the \`intdiv()\` you always
   wanted as an operator. Note it *floors*: \`-7 // 2\` → \`-4\`.
4. **\`**\` is power** (same as modern PHP), and \`divmod(a, b)\` returns the
   \`(quotient, remainder)\` pair in one call.

### Multiline strings

PHP's heredoc becomes triple quotes — \`"""..."""\` — which also interpolate if
you add the \`f\` prefix:

\`\`\`python
body = f"""Dear {name},

Your invoice is attached.
"""
\`\`\`
`,

  comparisons: [
    {
      label: "Interpolation and formatting",
      intro:
        "Building a one-line order summary: a name, a price to two decimals, and a zero-padded order number. Both print the identical line.",
      php: `<?php
$name = 'Ada';
$price = 1999.5;
$orderNo = 42;

echo "Thanks {$name}: total "
    . number_format($price, 2)
    . sprintf(" (order #%05d)\\n", $orderNo);
// Thanks Ada: total 1,999.50 (order #00042)`,
      ts: `name = "Ada"
price = 1999.5
order_no = 42

print(f"Thanks {name}: total {price:,.2f} (order #{order_no:05d})")
# Thanks Ada: total 1,999.50 (order #00042)`,
      note:
        "One f-string replaces interpolation + number_format() + sprintf(). The {value:spec} colon syntax handles decimals, padding, thousands separators and percentages.",
    },
    {
      label: "Function soup → methods",
      intro:
        "Cleaning a CSV-ish string: trim it, split it, upper-case each part, join it back. Same pipeline, opposite direction of the calls.",
      php: `<?php
$raw = '  red,green,blue  ';

$parts = explode(',', trim($raw));
$parts = array_map('strtoupper', $parts);
echo implode(' | ', $parts), "\\n";
// RED | GREEN | BLUE`,
      ts: `raw = "  red,green,blue  "

parts = raw.strip().split(",")
parts = [p.upper() for p in parts]
print(" | ".join(parts))
# RED | GREEN | BLUE`,
      note:
        "Methods chain left-to-right instead of nesting inside-out — and join() lives on the SEPARATOR string, not the list. Strings are immutable: every call returns a new string.",
    },
    {
      label: "Type juggling vs TypeError",
      intro:
        "Gluing a number onto a label. PHP happily coerces; Python demands you say what you mean.",
      php: `<?php
$count = 3;

// PHP juggles int -> string silently:
echo 'items: ' . $count, "\\n";   // items: 3

// ...and string -> int the other way:
var_dump('5' + 3);                // int(8)`,
      ts: `count = 3

# "items: " + count           # TypeError!
print("items: " + str(count))  # explicit cast
print(f"items: {count}")       # or let the f-string convert

# "5" + 3 is also a TypeError — never 8.
# int("5") + 3 is how you'd spell that.`,
      note:
        "Python never coerces between str and int: + with mixed types raises TypeError: can only concatenate str (not \"int\") to str. Convert explicitly with str()/int(), or use an f-string.",
    },
    {
      label: "Division and big ints",
      intro:
        "Splitting 7 items between 2 people, and computing a number bigger than a 64-bit integer. Watch what each language returns.",
      php: `<?php
var_dump(7 / 2);        // float(3.5)
var_dump(6 / 2);        // int(3) — int when even!
var_dump(intdiv(7, 2)); // int(3)

// Ints overflow into floats silently:
var_dump(PHP_INT_MAX + 1);
// float(9.2233720368548E+18) — precision lost`,
      ts: `print(7 / 2)      # 3.5
print(6 / 2)      # 3.0  — / is ALWAYS float
print(7 // 2)     # 3    — floor division
print(divmod(7, 2))  # (3, 1)

# ints never overflow — arbitrary precision:
print(2 ** 100)
# 1267650600228229401496703205376 — exact`,
      note:
        "Python's / always yields float (even 6/2), // floors, and int has no maximum — no PHP_INT_MAX, no silent drift into float precision loss.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "f-strings, the method pipeline, the join-on-separator gotcha, the refusal to juggle, and the four number rules. Predict every line — the division ones catch everyone.",
    code: `# strings_numbers.py
name = "ada lovelace"
price = 1999.5

# f-strings take full expressions and format specs:
print(f"Hello, {name.title()}!")
print(f"total: {price:.2f}")
print(f"padded: {42:05d} | percent: {0.173:.1%}")

# Methods live ON the string (immutable — they return new strings):
raw = "  Widget,Gadget,Gizmo  "
parts = raw.strip().split(",")
print(parts)
print(" + ".join(parts))          # join is on the SEPARATOR

# No type juggling — concatenation refuses mixed types:
count = 3
print("items: " + str(count))     # str() required; + with int raises TypeError

# Numbers: / is ALWAYS float division, // floors, ** is power
print(7 / 2)
print(7 // 2)
print(2 ** 10)
print(divmod(17, 5))

# ints never overflow to float:
print(2 ** 64 + 1)`,
    output: `Hello, Ada Lovelace!
total: 1999.50
padded: 00042 | percent: 17.3%
['Widget', 'Gadget', 'Gizmo']
Widget + Gadget + Gizmo
items: 3
3.5
3
1024
(3, 2)
18446744073709551617`,
  },

  keyPoints: [
    "f-strings (`f\"Hello {name}\"`) replace PHP interpolation and take full expressions plus format specs: `f\"{price:.2f}\"` ≈ `number_format`/`sprintf`.",
    "Strings are immutable objects with methods: `strtoupper→.upper()`, `trim→.strip()`, `str_replace→.replace()`, `explode→.split()`, `implode→\", \".join(list)`.",
    "`join()` is called on the SEPARATOR, not the list — `\", \".join(names)` — the classic first-week gotcha.",
    "Concatenation is `+`, and Python never juggles: `\"x\" + 3` is a TypeError — use `str(3)` or an f-string.",
    "`/` always returns float (even `6 / 2` → `3.0`); `//` floors; `**` is power; `divmod(a, b)` gives (quotient, remainder).",
    "`int` is arbitrary precision — no PHP_INT_MAX, no silent overflow to float. Triple-quoted strings replace heredoc.",
  ],

  interview: [
    {
      q: "PHP has strtoupper(), trim(), explode()... how does Python organise string operations, and which trip up PHP developers?",
      a: "Everything is a method on the string object: `x.upper()`, `x.strip()`, `x.split(\",\")`, `x.replace(a, b)` — so pipelines chain left-to-right instead of nesting like `implode(array_map(...))`. Two things reliably trip PHP hands: `join` is a method on the *separator* (`\", \".join(items)`), and strings are immutable, so every method returns a new string — `name.upper()` on its own line does nothing unless you assign it. The exception proving the rule is `len(x)`, which is a builtin function rather than a method.",
    },
    {
      q: "How does Python handle the string/number coercion PHP is famous for?",
      a: "It doesn't — it raises. `\"5\" + 3` is a `TypeError` in Python, never 8, because `+` between str and int is undefined; you must convert explicitly with `int(\"5\")` or `str(3)`, or interpolate through an f-string which stringifies for you. Python is still dynamically typed, but it's *strongly* typed: types don't shift under you at runtime. Coming from PHP, it's the same safety win as `declare(strict_types=1)`, applied everywhere by default.",
    },
    {
      q: "What should a PHP developer know about Python's division and integer behaviour?",
      a: "Three rules. `/` is true division and always returns a float — even `6 / 2` gives `3.0`, unlike PHP where `/` returns int when it divides evenly. `//` is floor division, the operator version of `intdiv()` — but note it floors, so `-7 // 2` is `-4`, not `-3`. And `int` is arbitrary precision: there's no `PHP_INT_MAX`, so large integer maths never silently degrades into float precision loss the way `PHP_INT_MAX + 1` does. `divmod(a, b)` returns quotient and remainder together when you need both.",
    },
  ],

  quiz: [
    {
      question: "How do you write PHP's `implode(', ', $names)` in Python?",
      options: [
        "names.join(', ')",
        "join(names, ', ')",
        "', '.join(names)",
        "names.implode(', ')",
      ],
      answerIndex: 2,
      explain:
        "join() is a method on the separator string, taking the iterable as its argument. names.join(...) fails because lists have no join method — the classic gotcha in reverse.",
    },
    {
      question: "What does `\"5\" + 3` evaluate to in Python?",
      options: [
        "8, via type juggling like PHP",
        "\"53\", string concatenation wins",
        "A TypeError — str and int can't be concatenated",
        "5.3",
      ],
      answerIndex: 2,
      explain:
        "Python never coerces between str and int for +. You must be explicit: int(\"5\") + 3 == 8, or \"5\" + str(3) == \"53\".",
    },
    {
      question: "What does `6 / 2` return in Python 3?",
      options: [
        "int 3, like PHP when division is even",
        "float 3.0 — / always returns a float",
        "It depends on the operand types",
        "A Fraction object",
      ],
      answerIndex: 1,
      explain:
        "True division / always produces a float in Python 3, regardless of divisibility. Use // when you want an integer result (it floors), e.g. 7 // 2 == 3.",
    },
    {
      question: "What happens when a Python int exceeds 64 bits, e.g. `2 ** 100`?",
      options: [
        "It overflows to a float, losing precision, like PHP_INT_MAX + 1",
        "It raises an OverflowError",
        "It wraps around to a negative number",
        "Nothing special — int is arbitrary precision and stays exact",
      ],
      answerIndex: 3,
      explain:
        "Python ints grow to any size, limited only by memory. 2 ** 100 is the exact 31-digit integer — there is no PHP_INT_MAX equivalent and no silent conversion to float.",
    },
  ],
};

export default lesson;
