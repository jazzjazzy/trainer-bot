import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "php7-grab-bag",
  title: "The PHP 7.0 Grab Bag: Small Wins That Add Up",
  part: "PHP 7.0: Types & the Engine",
  estMinutes: 12,
  summary:
    "Anonymous classes, group use, yield from, intdiv() and friends — the smaller PHP 7.0 features that quietly delete boilerplate you've been writing since 5.5.",

  concept: `
PHP 7.0 is famous for scalar types, return types and the engine rewrite. But it
also shipped a fistful of **smaller features** that, individually, each save you
a few lines — and collectively make 5.5 code look dated. Here are the ones worth
reaching for.

### Anonymous classes

In 5.5, a one-off implementation of an interface meant a named class somewhere
in a file. PHP 7.0 lets you write \`new class { ... }\` inline — perfect for a
throwaway logger, a stub in a test, or a tiny callback object.

\`\`\`php
$logger = new class implements LoggerInterface {
    public function log(string $msg): void { echo $msg; }
};
\`\`\`

The class can take constructor arguments (\`new class(\$dep) { ... }\`), implement
interfaces, extend a parent, and use traits — it just has no name you can refer
to elsewhere.

### Group use declarations

A file pulling several classes from one namespace used to need a \`use\` line per
class. PHP 7.0 lets you **group** them with braces, so the common prefix is
written once:

\`\`\`php
use App\\Model\\{User, Post, Comment};
\`\`\`

You can even mix in \`function\` and \`const\` imports inside the same group.

### Generator delegation: \`yield from\`

Before 7.0, composing generators meant manually \`foreach\`-ing one generator to
re-yield its values. \`yield from\` delegates to any inner iterable in one line,
forwards keys, and even passes through the inner generator's **return value**.

### Integer division and other small tools

- \`intdiv(\$a, \$b)\` returns the integer quotient without the \`(int) (\$a / \$b)\`
  dance — and throws on divide-by-zero instead of warning.
- \`define()\` can now create **constant arrays**: \`define('SIZES', ['s', 'm'])\`,
  which previously only \`const\` could do.
- **Uniform variable syntax** made expressions like \`\$obj->\$method(...)\` and
  \`(\$callable)()\` parse consistently left-to-right — fixing decade-old edge cases.
- \`Closure::call(\$object)\` binds a closure to an object **and** invokes it in one
  step, handy for poking at private state in tests.

None of these is headline material, but together they remove a lot of the little
ceremonies you've been typing on autopilot since 5.5.
`,

  comparisons: [
    {
      label: "A one-off interface implementation",
      intro:
        "You need a single throwaway logger object that satisfies LoggerInterface and just echoes its messages. The result is the same logger either way, but watch how much scaffolding it takes to get one.",
      php: `<?php
// PHP 5.5 — you need a named class, declared somewhere
class EchoLogger implements LoggerInterface {
    public function log($msg) {
        echo $msg;
    }
}

$logger = new EchoLogger();`,
      ts: `<?php
// PHP 7.0 — anonymous class, defined right where it's used
$logger = new class implements LoggerInterface {
    public function log(string $msg): void {
        echo $msg;
    }
};`,
      note:
        "Anonymous classes (new class {}) arrived in PHP 7.0, letting you implement an interface inline without polluting the namespace with a single-use name.",
    },
    {
      label: "Importing several classes from one namespace",
      intro:
        "A file uses three classes that all live in the App\\Model namespace, so it needs to import each one. Both versions bring in the same three names; the question is how many lines it takes.",
      php: `<?php
// PHP 5.5 — one use statement per class
use App\\Model\\User;
use App\\Model\\Post;
use App\\Model\\Comment;`,
      ts: `<?php
// PHP 7.0 — group use, common prefix written once
use App\\Model\\{User, Post, Comment};`,
      note:
        "Group use declarations (PHP 7.0) collapse repeated namespace prefixes into a single braced list; you can mix in function/const imports too.",
    },
    {
      label: "Composing generators",
      intro:
        "An outer generator wants to yield everything from an inner generator (1 and 2) and then add its own value (3), producing the sequence 1, 2, 3. The two versions do this with different amounts of plumbing.",
      php: `<?php
// PHP 5.5 — manually re-yield the inner generator
function inner() {
    yield 1;
    yield 2;
}
function outer() {
    foreach (inner() as $v) {
        yield $v;
    }
    yield 3;
}`,
      ts: `<?php
// PHP 7.0 — delegate with yield from
function inner() {
    yield 1;
    yield 2;
}
function outer() {
    yield from inner();
    yield 3;
}`,
      note:
        "yield from (PHP 7.0) delegates to an inner iterable, forwarding its keys and return value — replacing the hand-written foreach-and-re-yield loop.",
    },
    {
      label: "Integer division",
      intro:
        "You are dividing a total item count by a per-page size to get a whole number of pages. Both versions compute the same page count, but they behave very differently when the divisor happens to be zero.",
      php: `<?php
// PHP 5.5 — float divide, then cast back to int
$pages = (int) ($total / $perPage);
// and divide-by-zero only raises a warning, returns false`,
      ts: `<?php
// PHP 7.0 — purpose-built integer division
$pages = intdiv($total, $perPage);
// divide-by-zero throws DivisionByZeroError, not a silent false`,
      note:
        "intdiv() (PHP 7.0) returns a true integer quotient and throws DivisionByZeroError on a zero divisor, replacing the (int)(\$a / \$b) idiom.",
    },
    {
      label: "A constant array",
      intro:
        "You want a constant named SIZES that holds a list of size labels. Both versions define the same array constant, but they reach it through different mechanisms with different version histories.",
      php: `<?php
// PHP 5.6 — only the const keyword can hold an array
const SIZES = ['small', 'medium', 'large'];
// (in 5.5 even this was unavailable, and define('SIZES', [...]) only
// raised a warning: Constants may only evaluate to scalar values)`,
      ts: `<?php
// PHP 7.0 — define() now accepts arrays too
define('SIZES', ['small', 'medium', 'large']);`,
      note:
        "define() gained support for array values in PHP 7.0. Array constants via the const keyword arrived earlier, in PHP 5.6 — in 5.5 you couldn't declare a constant array at all.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A handful of PHP 7.0 conveniences in one script. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

// Anonymous class implementing an interface inline:
interface Greeter {
    public function greet(string $name): string;
}

$greeter = new class implements Greeter {
    public function greet(string $name): string {
        return "Hi {$name}";
    }
};

echo $greeter->greet('Ada'), "\\n";

// yield from delegates to an inner generator:
function letters() {
    yield 'a';
    yield 'b';
}
function sequence() {
    yield from letters();
    yield 'c';
}
echo implode('', iterator_to_array(sequence(), false)), "\\n";

// intdiv() vs the old float-cast idiom:
echo intdiv(17, 5), "\\n";

// Closure::call() binds and invokes in one step:
class Box { private $secret = 42; }
$peek = function () { return $this->secret; };
echo $peek->call(new Box()), "\\n";`,
    output: `Hi Ada
abc
3
42`,
  },

  keyPoints: [
    "Anonymous classes (`new class {}`, PHP 7.0) implement an interface inline — ideal for stubs and one-off objects.",
    "Group `use` (PHP 7.0) writes a shared namespace prefix once: `use App\\Model\\{User, Post};`.",
    "`yield from` (PHP 7.0) delegates to an inner iterable, forwarding keys and the inner generator's return value.",
    "`intdiv()` (PHP 7.0) gives a true integer quotient and throws `DivisionByZeroError` instead of returning `false`.",
    "`define()` can now hold **array** constants; `Closure::call()` binds and calls a closure in one step.",
    "Uniform variable syntax (7.0) made chained expressions like `$obj->$method()` parse consistently left-to-right.",
  ],

  interview: [
    {
      q: "What problem do anonymous classes solve, and when would you avoid them?",
      a: "They let you create a one-off object implementing an interface or extending a class **inline**, without giving it a name you'll never reuse — great for a quick test double, a throwaway strategy object, or an inline `LoggerInterface`. Introduced in **PHP 7.0**. Avoid them when the class is non-trivial or reused: a named class is more discoverable, easier to test in isolation, and each `new class {}` is technically a *distinct* type, so you can't share or `instanceof`-match the anonymous class itself across call sites.",
    },
    {
      q: "What does `yield from` do that a manual foreach loop didn't?",
      a: "`yield from` (PHP 7.0) delegates iteration to any inner `Traversable` or array, re-yielding its values. Beyond brevity, it **preserves the inner generator's keys** and — crucially — exposes the inner generator's `return` value as the result of the `yield from` expression, which a hand-written `foreach (\\$inner as \\$v) { yield \\$v; }` loop silently discards. It also forwards values sent in via `->send()` to the inner generator.",
    },
    {
      q: "Why prefer `intdiv($a, $b)` over `(int) ($a / $b)`?",
      a: "Two reasons. First, intent: `intdiv` says 'integer division' directly. Second, correctness at the edges — `(int) (\\$a / \\$b)` computes a float first, so very large operands can lose precision before the cast, and a zero divisor only raises a warning and yields `false`. `intdiv` (PHP 7.0) works in integer space throughout and throws `DivisionByZeroError`, so the failure is loud and catchable rather than a silent `false` propagating through your code.",
    },
    {
      q: "What changed about `define()` between 5.5 and 7.0?",
      a: "In 5.5, `define()` could only take scalar (and resource) values — passing an array raised `Warning: Constants may only evaluate to scalar values` and left the constant undefined, so array constants had to use the `const` keyword (which can't be conditional or computed at runtime). **PHP 7.0** let `define()` accept arrays, so you can now create a constant array dynamically, e.g. inside an `if` or built from a function call: `define('SIZES', ['s', 'm', 'l']);`.",
    },
  ],

  quiz: [
    {
      question: "Which statement about anonymous classes (`new class {}`) is correct?",
      options: [
        "They were available in PHP 5.5 as `new class`",
        "They were added in PHP 7.0 and can implement interfaces, extend a class, and take constructor arguments",
        "They cannot implement interfaces",
        "Each one shares the same type, so you can `instanceof` them by name",
      ],
      answerIndex: 1,
      explain:
        "Anonymous classes arrived in PHP 7.0. They support implementing interfaces, extending a parent, using traits, and constructor arguments — but each declaration is a distinct, unnameable type.",
    },
    {
      question: "What is the value of `intdiv(7, 0)` in PHP 7.0?",
      options: [
        "It returns 0",
        "It returns false with a warning",
        "It throws a DivisionByZeroError",
        "It returns INF",
      ],
      answerIndex: 2,
      explain:
        "Unlike the old `(int)($a / $b)` idiom — which warned and produced false on a zero divisor — intdiv() throws DivisionByZeroError, making the failure explicit and catchable.",
    },
    {
      question: "What advantage does `yield from inner()` have over a manual `foreach` re-yield loop?",
      options: [
        "It runs the inner generator eagerly instead of lazily",
        "It preserves the inner generator's keys and exposes its return value",
        "It is the only way to yield more than one value",
        "It converts the generator into a plain array",
      ],
      answerIndex: 1,
      explain:
        "yield from (PHP 7.0) forwards the inner iterable's keys and makes the inner generator's `return` value the result of the `yield from` expression — both of which a hand-written foreach loop discards. It stays lazy.",
    },
  ],
};

export default lesson;
