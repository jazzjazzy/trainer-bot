import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "lists-and-tuples",
  title: "Lists & Tuples: Half of PHP's array",
  part: "First Contact",
  estMinutes: 12,
  summary:
    "PHP's do-everything array splits apart in Python — lists cover the ordered/numeric half, tuples cover fixed shapes, and slicing does things PHP never could.",

  concept: `
PHP has one collection type — \`array\` — that moonlights as a numeric list, a
hash map, a queue, a record, and a return-multiple-values hack. Python splits
those jobs across dedicated types. This section covers the first two:

- **list** — ordered, mutable, grow/shrink at will ≈ your numeric PHP array.
- **tuple** — ordered, **immutable**, fixed shape ≈ the "these three things
  belong together" arrays you return from functions.

(Dicts and sets — the associative half — get their own section.)

### Lists: the numeric array you know

\`\`\`python
scores = [72, 88, 95]        # ≈ $scores = [72, 88, 95];
scores.append(100)           # ≈ $scores[] = 100;   (array_push)
scores.insert(0, 50)         # ≈ array_unshift($scores, 50)
scores.extend([1, 2])        # ≈ array_merge / array_push with several
scores.remove(88)            # deletes first matching VALUE
last = scores.pop()          # ≈ array_pop($scores)
first = scores.pop(0)        # ≈ array_shift($scores)
\`\`\`

Counting is a builtin, not a method: \`len(scores)\`, never \`count()\` or
\`scores.length\`. Membership is an operator: \`88 in scores\` replaces
\`in_array(88, $scores)\` (and reads the right way round).

### Negative indexing

\`scores[-1]\` is the last element, \`scores[-2]\` the second-last — the ergonomic
version of \`$scores[count($scores) - 1]\` or \`end($scores)\`.

### Slicing — the superpower PHP never had

\`list[start:stop:step]\` returns a **new list** (stop is exclusive):

\`\`\`python
scores[1:3]     # elements 1 and 2         ≈ array_slice($scores, 1, 2)
scores[:2]      # first two
scores[2:]      # from index 2 to the end
scores[-2:]     # last two
scores[::-1]    # reversed copy            ≈ array_reverse($scores)
scores[::2]     # every second element
\`\`\`

One compact syntax covers \`array_slice\`, \`array_reverse\` and half your
\`for\`-loop bookkeeping. It works on strings too: \`"hello"[::-1]\` →
\`"olleh"\`.

### Sorting: in place vs copy

Python makes PHP's sort-by-reference explicit by giving you both spellings:

- \`scores.sort()\` — **mutates** the list, returns \`None\` (like PHP's
  \`sort($arr)\` mutating through the reference).
- \`sorted(scores)\` — returns a **new** sorted list, original untouched — the
  non-destructive version PHP never shipped.

Both take \`reverse=True\` and \`key=\` (a callable extracting the sort key —
where you'd reach for \`usort()\` with a comparator).

### Tuples: the fixed shape

A tuple is an immutable sequence, written with parentheses: \`(3, 7)\`. Use it
when the *positions mean something* — a pair of coordinates, a (low, high)
range — and mutation would be a bug. Its killer app is **multiple return
values**, where PHP returns an array and destructures with \`list()\` / \`[...]\`:

\`\`\`python
def min_max(values):
    return min(values), max(values)   # packs a tuple — parens optional

low, high = min_max(scores)           # unpacks into names
\`\`\`

Tuples can be indexed and sliced like lists, but item assignment raises
\`TypeError\`, and \`append\`/\`sort\` raise \`AttributeError\` because a tuple
has no such methods — the shape is sealed, like a readonly value object
versus an entity.

### The single-element trap

Parentheses don't make tuples — the **comma** does. \`(1)\` is just the integer
1 in brackets; \`(1,)\` is a one-element tuple. You'll hit this the first time
you write a one-item tuple and wonder why it behaves like a number.
`,

  comparisons: [
    {
      label: "Everyday list surgery",
      intro:
        "Push, pop, count and membership on a task queue. Both end with the same two tasks and the same answers.",
      php: `<?php
$tasks = ['build', 'test'];

$tasks[] = 'deploy';            // push
array_unshift($tasks, 'lint');  // prepend
$last = array_pop($tasks);      // pop

echo count($tasks), "\\n";               // 3
var_dump(in_array('test', $tasks));      // true
echo end($tasks), "\\n";                 // test`,
      ts: `tasks = ["build", "test"]

tasks.append("deploy")     # push
tasks.insert(0, "lint")    # prepend
last = tasks.pop()         # pop

print(len(tasks))          # 3
print("test" in tasks)     # True
print(tasks[-1])           # test`,
      note:
        "len() is a builtin (never .count/.length), membership is the `in` operator, and negative indexes replace end()/count()-1 arithmetic.",
    },
    {
      label: "Slicing vs array_slice/array_reverse",
      intro:
        "Taking the first three items, the last two, and a reversed copy of a list. PHP needs three different functions; Python needs one syntax.",
      php: `<?php
$nums = [10, 20, 30, 40, 50];

$firstThree = array_slice($nums, 0, 3);
$lastTwo    = array_slice($nums, -2);
$reversed   = array_reverse($nums);

print_r($firstThree); // [10, 20, 30]
print_r($lastTwo);    // [40, 50]
print_r($reversed);   // [50, 40, 30, 20, 10]`,
      ts: `nums = [10, 20, 30, 40, 50]

first_three = nums[:3]
last_two    = nums[-2:]
reversed_   = nums[::-1]

print(first_three)   # [10, 20, 30]
print(last_two)      # [40, 50]
print(reversed_)     # [50, 40, 30, 20, 10]

# strings slice too: "hello"[::-1] == "olleh"`,
      note:
        "list[start:stop:step] always returns a new list; stop is exclusive. There's no PHP equivalent short of chaining array_slice/array_reverse calls.",
    },
    {
      label: "Sorting: mutate or copy",
      intro:
        "Sorting scores descending while keeping the original order available. PHP's sort() mutates and that's your only built-in mode; Python offers both explicitly.",
      php: `<?php
$scores = [72, 95, 61];

// sort() mutates via reference — original gone:
$copy = $scores;      // manual copy first
sort($copy);
print_r($copy);       // [61, 72, 95]

// custom order: usort with a comparator
usort($copy, fn($a, $b) => $b <=> $a);
print_r($copy);       // [95, 72, 61]`,
      ts: `scores = [72, 95, 61]

print(sorted(scores))            # [61, 72, 95] — new list
print(scores)                    # [72, 95, 61] — untouched

scores.sort(reverse=True)        # in place, returns None
print(scores)                    # [95, 72, 61]

# custom key ≈ usort, but you give the KEY, not a comparator:
words = ["pear", "fig", "banana"]
print(sorted(words, key=len))    # ['fig', 'pear', 'banana']`,
      note:
        "sorted() copies, .sort() mutates (and returns None — assigning x = x.sort() is the classic bug). key= takes an extractor function, not a two-argument comparator.",
    },
    {
      label: "Multiple return values",
      intro:
        "A function returning both the minimum and maximum. PHP returns an array and destructures; Python returns a tuple that unpacks directly — same idea, first-class syntax.",
      php: `<?php
function minMax(array $values): array {
    return [min($values), max($values)];
}

[$low, $high] = minMax([5, 9, 2]);
echo "$low $high\\n";   // 2 9`,
      ts: `def min_max(values):
    return min(values), max(values)   # a tuple — parens optional

low, high = min_max([5, 9, 2])
print(low, high)    # 2 9

# the shape is sealed:
pair = (2, 9)
# pair[0] = 3   ->  TypeError
single = (2,)    # comma makes the tuple; (2) is just an int`,
      note:
        "return a, b packs a tuple; low, high = ... unpacks it. Tuples are immutable — and a one-element tuple needs the trailing comma: (2,) not (2).",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "List surgery, negative indexes, three slices, both sort spellings, and tuple unpacking. Predict all twelve lines — the sorted-vs-.sort() pair and the last line are the traps.",
    code: `# lists_tuples.py
scores = [72, 88, 95, 61]

scores.append(100)           # $scores[] = 100;
last = scores.pop()          # array_pop($scores)
print(scores, "popped:", last)

print(len(scores))           # count($scores)
print(scores[-1])            # end($scores) / $scores[count($scores)-1]

# Slicing — no PHP equivalent this terse:
print(scores[1:3])           # array_slice($scores, 1, 2)
print(scores[:2])            # first two
print(scores[::-1])          # array_reverse($scores)

print(88 in scores)          # in_array(88, $scores)

# sorted() returns a copy; .sort() mutates in place:
print(sorted(scores))
print(scores)                # original untouched
scores.sort(reverse=True)
print(scores)                # now mutated

# Tuples: fixed shape, immutable — great for multiple return values
def min_max(values):
    return min(values), max(values)   # returns a tuple

low, high = min_max(scores)           # unpacks straight into names
print(f"range: {low}..{high}")

single = (61,)               # the trailing comma makes it a tuple
print(type(single).__name__, type((61)).__name__)`,
    output: `[72, 88, 95, 61] popped: 100
4
61
[88, 95]
[72, 88]
[61, 95, 88, 72]
True
[61, 72, 88, 95]
[72, 88, 95, 61]
[95, 88, 72, 61]
range: 61..95
tuple int`,
  },

  keyPoints: [
    "PHP's one `array` splits: **list** = ordered + mutable (the numeric half), **tuple** = immutable fixed shape; dicts cover the associative half (separate section).",
    "`append`/`insert`/`extend`/`remove`/`pop` replace `$arr[] =`, `array_unshift`, `array_merge`, `array_pop`/`array_shift`; size is `len(x)`, never `count()`.",
    "Negative indexing: `arr[-1]` is the last element — goodbye `end()` and `count()-1` arithmetic.",
    "Slicing `arr[1:3]`, `arr[:2]`, `arr[-2:]`, `arr[::-1]` replaces array_slice/array_reverse with one syntax (stop is exclusive; always a new list).",
    "`x in arr` replaces `in_array($x, $arr)`; `.sort()` mutates and returns None, `sorted(arr)` returns a sorted copy — both take `key=` and `reverse=True`.",
    "Functions return tuples for multiple values (`low, high = min_max(xs)`); one-element tuples need the comma: `(1,)` — `(1)` is just an int.",
  ],

  interview: [
    {
      q: "PHP has one array type. How does that map onto Python, and when do you choose a list vs a tuple?",
      a: "PHP's array is really three data structures in a trenchcoat; Python separates them. A **list** is the ordered, mutable, homogeneous-ish collection — your numeric array. A **tuple** is immutable with a fixed shape, where each position has meaning — a coordinate pair, a (host, port), a function's multiple return values. The associative half of PHP arrays becomes a dict. My rule: if I'd loop over it and add/remove items, list; if it's a small fixed record I'd never mutate — the readonly value object of sequences — tuple. Immutability also makes tuples hashable, so they can be dict keys, which lists can't.",
    },
    {
      q: "Explain Python slicing to someone who knows array_slice().",
      a: "`arr[start:stop:step]` generalises array_slice into syntax: `arr[1:3]` is `array_slice($arr, 1, 2)` — note stop is an exclusive index, not a length. Omitted parts default sensibly: `arr[:2]` is the first two, `arr[2:]` the rest, `arr[-2:]` the last two. The step gives you things PHP has no operator for: `arr[::2]` is every second element and `arr[::-1]` is a reversed copy, replacing array_reverse. Every slice is a new list — the original is never touched — and the same syntax works on strings and tuples.",
    },
    {
      q: "What's the difference between `.sort()` and `sorted()`, and what's the classic bug?",
      a: "`list.sort()` sorts **in place** and returns `None`; `sorted(iterable)` leaves the input alone and returns a **new** sorted list. The classic bug is `scores = scores.sort()` — you've just assigned None to scores, because in-place mutators in Python deliberately return None to stop you chaining them. Both accept `reverse=True` and a `key=` function; note key is an *extractor* (like `key=len` or `key=lambda u: u.age`), not the two-argument comparator `usort()` taught you — Python compares the extracted keys itself.",
    },
    {
      q: "Why does `(1)` not create a tuple, and what does?",
      a: "Because parentheses are just grouping — `(1)` is the integer 1, exactly as `(1 + 2)` is 3. What makes a tuple is the **comma**: `(1,)` is a one-element tuple, and even `1,` without parentheses is too. That's consistent with multiple returns: `return a, b` packs a tuple with no parentheses in sight. It bites PHP developers in places expecting a sequence — passing `(\"item\")` where a tuple of strings is wanted quietly passes a single string instead.",
    },
  ],

  quiz: [
    {
      question: "How do you get the last element of a Python list `xs`?",
      options: ["xs[count(xs) - 1]", "end(xs)", "xs[-1]", "xs.last()"],
      answerIndex: 2,
      explain:
        "Negative indexes count from the end: xs[-1] is the last element, xs[-2] the second-last. count()/end() are PHP; Python lists have no .last() method.",
    },
    {
      question: "What does `nums[1:3]` return for `nums = [10, 20, 30, 40]`?",
      options: [
        "[20, 30, 40] — from index 1, length 3",
        "[20, 30] — indexes 1 and 2; the stop index is exclusive",
        "[10, 20, 30] — the first three",
        "[20, 30, 40, 10] — a rotation",
      ],
      answerIndex: 1,
      explain:
        "Slices run from start up to but NOT including stop, so 1:3 yields indexes 1 and 2. That's the key difference from array_slice($nums, 1, 3), whose third argument is a length.",
    },
    {
      question: "What is the value of `result` after `result = scores.sort()`?",
      options: [
        "A sorted copy of scores",
        "The same list object, sorted",
        "None — .sort() mutates in place and returns None",
        "A TypeError is raised",
      ],
      answerIndex: 2,
      explain:
        "In-place mutators like .sort() return None by design, so chaining or assigning them is a bug. scores itself IS now sorted; use sorted(scores) when you want a sorted copy back.",
    },
    {
      question: "Which expression creates a one-element tuple?",
      options: ["(1)", "tuple(1)", "(1,)", "[1]"],
      answerIndex: 2,
      explain:
        "The comma makes the tuple: (1,) — parentheses alone are just grouping, so (1) is the int 1. tuple(1) raises TypeError (int isn't iterable) and [1] is a list.",
    },
  ],
};

export default lesson;
