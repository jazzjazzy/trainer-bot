import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "iterators-and-generators",
  title: "Iterators & Generators",
  part: "Batteries Included",
  estMinutes: 13,
  summary:
    "Python's iteration protocol is a leaner Iterator interface, generators are the yield you know from PHP 5.5 — plus itertools, one-shot exhaustion, and lazy pipelines.",

  concept: `
You already know generators: PHP added \`yield\` in 5.5 and \`yield from\` in 7.0.
Python's are the same idea with the same keyword — what changes is how deeply
iteration is woven into the language, and one behavioural trap.

### The iteration protocol ≈ Iterator, leaner

PHP's \`Iterator\` interface needs five methods (\`current\`, \`key\`, \`next\`,
\`rewind\`, \`valid\`). Python's protocol needs two: \`__iter__()\` returns an
iterator, and the iterator's \`__next__()\` returns the next value — or raises
\`StopIteration\` when done. That's it; end-of-sequence is an exception, not a
\`valid()\` poll. \`for\` loops, \`list()\`, \`sum()\`, unpacking, \`in\` — everything
speaks this protocol.

And *everything* iterable implements it. In PHP, \`foreach\` handles arrays and
\`Traversable\`; in Python, \`for\` works over lists, tuples, dicts (keys), sets,
strings, **open files (line by line)**, \`range\`, generators, and anything you
write with an \`__iter__\`.

### Generators: same yield, same laziness

\`\`\`python
def read_orders():
    yield 101
    yield 102
\`\`\`

Calling \`read_orders()\` runs **no code** — it returns a generator object, and
the body executes lazily as you iterate, pausing at each \`yield\`. Identical to
PHP: a function containing \`yield\` returns a \`Generator\` you can \`foreach\`.
Python also has \`yield from subgen\` to delegate to another generator — PHP 7's
\`yield from\`, same name, same job.

### Generator expressions

A comprehension with parentheses is a **lazy** pipeline, no list built:

\`\`\`python
total = sum(x * x for x in xs)      # no intermediate list
first = next(u for u in users if u.active)
\`\`\`

PHP has no literal for this — you'd chain \`array_map\`/\`array_filter\` (eager,
building arrays) or write a generator function by hand.

### Infinite sequences and itertools

Because nothing runs until pulled, infinite generators are normal —
\`itertools.count(1)\` yields 1, 2, 3, … forever, and you clip with
\`itertools.islice(gen, 5)\`. The \`itertools\` module is a toolbox of lazy
combinators: \`count\` (infinite counter), \`chain\` (concatenate iterables
lazily, ≈ a lazy \`array_merge\`), \`islice\` (lazy slicing — generators can't be
\`[0:5]\` sliced), \`pairwise\` (3.10 — successive overlapping pairs, ideal for
deltas between readings).

### The trap: generators are one-shot

A generator is an iterator, and iterators **exhaust**. Iterate it twice and the
second pass yields nothing — silently. PHP arrays never did this to you (and
even PHP generators throw "Cannot rewind" rather than silently yielding
nothing). If you need multiple passes, materialise with \`list(gen)\` first.

### Memory: the whole point

\`for line in open("huge.log"):\` streams a multi-gigabyte file one line at a
time — the file object is itself a lazy iterator. The same shape as reading
with \`fgets()\` in a while loop, but it composes with \`sum()\`, comprehensions
and itertools. Rule of thumb: **small data → list** (re-iterable, indexable,
has \`len()\`); **streams, large data, or one-pass pipelines → generator**.
`,

  comparisons: [
    {
      label: "The iteration protocol",
      intro:
        "A countdown you can foreach over. PHP implements five Iterator methods; Python implements two and signals the end with an exception.",
      php: `<?php
class Countdown implements Iterator {
    private int $i;
    public function __construct(private int $start) { $this->i = $start; }
    public function current(): mixed { return $this->i; }
    public function key(): mixed     { return $this->start - $this->i; }
    public function next(): void     { $this->i--; }
    public function rewind(): void   { $this->i = $this->start; }
    public function valid(): bool    { return $this->i > 0; }
}
foreach (new Countdown(3) as $n) { echo $n, "\\n"; }`,
      ts: `# countdown.py
class Countdown:
    def __init__(self, start: int):
        self.i = start

    def __iter__(self):
        return self

    def __next__(self) -> int:
        if self.i <= 0:
            raise StopIteration
        self.i -= 1
        return self.i + 1

for n in Countdown(3):
    print(n)`,
      note:
        "Two dunder methods instead of five interface methods, and StopIteration replaces valid() — the for loop catches it for you. (In practice you'd write this as a three-line generator instead.)",
    },
    {
      label: "Generators: same keyword, same laziness",
      intro:
        "Streaming a range of ids without building an array, with delegation to a sub-generator. The two languages are strikingly close here.",
      php: `<?php
function ids(int $n): Generator {          // PHP 5.5
    for ($i = 1; $i <= $n; $i++) {
        yield $i;
    }
}
function all(): Generator {
    yield 0;
    yield from ids(3);                     // PHP 7.0
}
foreach (all() as $id) { echo $id, "\\n"; }  // 0 1 2 3`,
      ts: `# ids.py
from collections.abc import Iterator

def ids(n: int) -> Iterator[int]:
    for i in range(1, n + 1):
        yield i

def all_ids() -> Iterator[int]:
    yield 0
    yield from ids(3)          # same construct, same name

for i in all_ids():
    print(i)                   # 0 1 2 3`,
      note:
        "Near-identical: a function containing yield returns a generator object and its body runs lazily. Even yield from matches PHP 7's. The big divergence is below — re-iteration.",
    },
    {
      label: "The re-iteration trap",
      intro:
        "Looping over the same data twice. A PHP array shrugs; an exhausted Python generator silently yields nothing.",
      php: `<?php
$squares = array_map(fn($x) => $x * $x, [1, 2, 3]);

// Arrays are re-iterable forever:
echo array_sum($squares), "\\n";   // 14
echo array_sum($squares), "\\n";   // 14 again
echo count($squares), "\\n";       // 3`,
      ts: `# squares.py
squares = (x * x for x in [1, 2, 3])   # generator expression: lazy

print(sum(squares))   # 14 — consumes the generator
print(sum(squares))   # 0  — exhausted! no error, just empty
# print(len(squares)) # TypeError: generators have no len()

nums = [x * x for x in [1, 2, 3]]      # brackets = eager list
print(sum(nums), sum(nums))            # 14 14 — re-iterable`,
      note:
        "Generators are one-shot iterators: the second sum() gets an empty sequence with NO warning. Need multiple passes, len() or indexing? Use a list (square brackets) or materialise with list(gen).",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A generator with print statements marking execution, an infinite generator clipped by islice, and pairwise deltas. Predict: when does \"opening the source\" print — at the call or in the loop? And what does the second iteration yield?",
    code: `import itertools

def read_orders():
    print("opening the source")
    yield 101
    yield 102
    print("source exhausted")

g = read_orders()
print(type(g).__name__)   # nothing has run yet

for order in g:
    print("order", order)

print(list(g))            # one-shot: already exhausted

squares = (n * n for n in itertools.count(1))  # infinite!
print(list(itertools.islice(squares, 5)))

print(sum(x * x for x in range(4)))

for prev, cur in itertools.pairwise([3, 7, 12]):
    print(cur - prev)`,
    output: `generator
opening the source
order 101
order 102
source exhausted
[]
[1, 4, 9, 16, 25]
14
4
5`,
  },

  keyPoints: [
    "The protocol is `__iter__()` + `__next__()` + `StopIteration` — PHP's five-method `Iterator` interface distilled to two methods and an exception.",
    "`for` iterates ANY iterable: lists, dicts, sets, strings, `range`, generators, and open files line by line — not just arrays plus `Traversable`.",
    "A function containing `yield` returns a lazy generator, exactly like PHP 5.5's; `yield from` delegates like PHP 7's. The body runs nothing until iterated.",
    "Generator expressions `(x * x for x in xs)` are lazy pipelines with no intermediate list — `sum(x * x for x in xs)` streams; square brackets would build the list eagerly.",
    "Generators are one-shot: once exhausted they silently yield nothing on re-iteration (no error). Materialise with `list()` when you need multiple passes, `len()` or indexing.",
    "`itertools` composes lazily: `count` (infinite), `chain` (lazy concat), `islice` (slice a stream), `pairwise` (3.10, successive pairs). Small data → list; streams and big data → generators.",
  ],

  interview: [
    {
      q: "You know PHP generators. What's actually different about Python's?",
      a: "Mechanically, almost nothing — `yield` makes a lazy generator (PHP 5.5), `yield from` delegates (PHP 7.0), and neither runs any body code until iterated. The differences are around the edges. First, reach: Python's whole language speaks the iteration protocol, so generators plug straight into `sum()`, unpacking, comprehensions and itertools, and even open files iterate lazily line by line. Second, generator *expressions* give a literal syntax — `sum(x*x for x in xs)` — where PHP needs a function. Third, the trap: an exhausted Python generator silently yields nothing on a second pass, whereas PHP at least throws 'Cannot traverse an already closed generator'. Silent emptiness is the bug to watch for.",
    },
    {
      q: "When do you return a generator instead of a list?",
      a: "When the data is large, unbounded, or consumed exactly once. Processing a multi-gigabyte log is the canonical case: `for line in f:` streams one line at a time in constant memory, where building a list of lines would be the same mistake as `file()` on a huge file in PHP. Generators also shine in pipelines — filter, transform, aggregate — where intermediate lists are pure waste, and they're the only option for infinite sequences like `itertools.count()`. But for small data a list is usually better: it's re-iterable, sliceable, has `len()`, and is far easier to debug. My rule: return lists from ordinary functions; return generators when the caller streams.",
    },
    {
      q: "How does Python signal the end of iteration, and how does that compare with PHP's Iterator?",
      a: "With an exception: the iterator's `__next__()` raises `StopIteration`, and the `for` loop catches it and terminates cleanly — you never see it in normal code. PHP instead polls: `foreach` calls `valid()` before each `current()`/`next()` cycle, so the iterator answers 'am I done?' repeatedly. Python's design needs just two methods (`__iter__`, `__next__`) against PHP's five, and it removes the invalid-state problem of calling `current()` after the end. The one place you meet `StopIteration` directly is manual `next()` calls, where you can pass a default — `next(gen, None)` — much like a guarded `->current()`.",
    },
  ],

  quiz: [
    {
      question: "What does calling a function whose body contains yield actually do?",
      options: [
        "Runs the body up to the first yield and pauses",
        "Runs the whole body eagerly and returns a list",
        "Runs no body code at all — it returns a generator object that executes lazily during iteration",
        "Raises StopIteration immediately",
      ],
      answerIndex: 2,
      explain:
        "Exactly like PHP: the call constructs a generator without executing anything. Code before the first yield only runs when iteration begins (the first next()) — which is why the playground printed 'opening the source' inside the loop, not at the call.",
    },
    {
      question: "A generator is passed to sum() twice. What does the second call return?",
      options: [
        "The same total again",
        "0 — the generator is exhausted and silently yields nothing",
        "An exception, like PHP's 'Cannot rewind' error",
        "It depends on whether yield from was used",
      ],
      answerIndex: 1,
      explain:
        "Generators are one-shot iterators; after exhaustion they just raise StopIteration immediately, so the second sum() sees an empty sequence and returns 0 with no warning. PHP arrays re-iterate freely and PHP generators at least throw on rewind — this silent behaviour is the classic Python trap.",
    },
    {
      question: "How would you take the first 5 items of the infinite itertools.count(1)?",
      options: [
        "list(itertools.count(1))[:5]",
        "itertools.count(1)[0:5]",
        "list(itertools.islice(itertools.count(1), 5))",
        "itertools.count(1, stop=5)",
      ],
      answerIndex: 2,
      explain:
        "islice lazily slices any iterable, pulling only 5 values from the infinite stream. list() on count(1) would loop forever, and generators don't support [] slicing at all.",
    },
    {
      question: "Which pair correctly maps the protocols?",
      options: [
        "__iter__/__next__/StopIteration ↔ current/key/next/rewind/valid",
        "__loop__/__stop__ ↔ Traversable",
        "yield ↔ ArrayAccess",
        "__next__ alone ↔ IteratorAggregate",
      ],
      answerIndex: 0,
      explain:
        "Python's iteration protocol is __iter__() returning an iterator whose __next__() yields values until raising StopIteration — the lean counterpart of PHP's five-method Iterator interface, with an exception replacing the valid() poll.",
    },
  ],
};

export default lesson;
