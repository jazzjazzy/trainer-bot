import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "fibers-and-first-class-callables",
  title: "First-Class Callables, `never`, and a Look at Fibers",
  part: "PHP 8.1–8.2: Modern PHP",
  estMinutes: 12,
  summary:
    "Turn any function or method into a Closure with the (...) syntax, mark functions that never return, and understand the Fibers that power modern async PHP.",

  concept: `
In 5.5 you passed callables around as **strings** (\`'strlen'\`), **arrays**
(\`[$obj, 'method']\`), or \`Closure\`s. The string/array forms are stringly-typed:
no IDE autocompletion, no static analysis, and a typo only blows up at call time.
PHP 8.1 fixed this with **first-class callable syntax** and added the **\`never\`**
return type — plus **Fibers**, the low-level primitive behind async runtimes.

### First-class callable syntax (PHP 8.1)

Append \`(...)\` to a function, method, or static method reference and you get a
real \`Closure\` — type-checked, IDE-aware, and bound to scope:

\`\`\`php
$fn  = strlen(...);              // free function
$fn  = $obj->method(...);        // instance method, bound to \$obj
$fn  = Foo::bar(...);            // static method
\`\`\`

The \`...\` is literal — it is **not** a placeholder for arguments. It means
"capture this callable as-is", equivalent to \`Closure::fromCallable('strlen')\`
(7.1) but resolved at compile time and far more readable.

### The \`never\` return type (PHP 8.1)

\`never\` declares that a function **always** throws or exits — it never returns
control and never produces a value. It is the "bottom type", stricter than
\`void\` (which returns \`null\`):

\`\`\`php
function fail(string $msg): never {
    throw new RuntimeException($msg);
}
\`\`\`

Static analysers use it to know code after a \`never\` call is unreachable.

### Fibers (PHP 8.1) — cooperative concurrency

A **Fiber** is a block of code you can **pause** mid-execution with
\`Fiber::suspend()\` and **resume** later with \`->resume()\`. It is *cooperative*
(the fiber yields control voluntarily) and *single-threaded* — nothing runs in
parallel. You rarely write \`Fiber\` directly; it's the plumbing that lets event
loops like **ReactPHP** and **Amp** suspend a coroutine waiting on I/O and run
other work in the meantime, without the \`yield\`-based generator gymnastics 5.5
forced on you.

- **5.5 callables:** \`'strlen'\`, \`[$obj, 'm']\` — error-prone, opaque to tooling.
- **8.1 first-class:** \`strlen(...)\`, \`$obj->m(...)\` — type-safe \`Closure\`s.
- **8.1 \`never\`:** documents and enforces "this exits/throws".
- **8.1 Fibers:** make true async libraries possible without callback hell.
`,

  comparisons: [
    {
      label: "Referencing a free function as a callable",
      intro:
        "We want to map the built-in strlen over a list and also store a reference to it in a variable to call later. Both should give us the lengths of the strings without invoking the function up front.",
      php: `<?php
// PHP 5.5 — a string the engine resolves at call time
$lengths = array_map('strlen', ['hi', 'world']);

// Passing it around stays stringly-typed:
$fn = 'strlen';
echo $fn('hello');`,
      ts: `<?php
// PHP 8.1 — first-class callable: a real Closure
$lengths = array_map(strlen(...), ['hi', 'world']);

$fn = strlen(...);
echo $fn('hello');`,
      note:
        "First-class callable syntax (PHP 8.1) turns strlen(...) into a type-checked Closure with IDE/static-analysis support, replacing the 'strlen' string.",
    },
    {
      label: "Capturing an instance method",
      intro:
        "Here we grab the write method off a particular logger object so we can hand it around and call it later. Calling the captured reference should log the message through that same logger instance.",
      php: `<?php
// PHP 5.5 — the [\$object, 'method'] array form
$cb = [$logger, 'write'];
call_user_func($cb, 'hello');`,
      ts: `<?php
// PHP 8.1 — bound to \$logger, no array, no call_user_func
$cb = $logger->write(...);
$cb('hello');`,
      note:
        "PHP 8.1: $logger->write(...) yields a Closure already bound to $logger; the [$obj, 'method'] array (5.5) had no type info and was easy to mistype.",
    },
    {
      label: "Pre-8.1 way to build a Closure from a callable",
      intro:
        "The goal is to turn the strlen function into a proper Closure object that we can store and invoke. Either approach should leave us with a callable that returns 5 for the word hello.",
      php: `<?php
// PHP 7.1 — the closest you had before first-class syntax
$fn = Closure::fromCallable('strlen');
echo $fn('hello');`,
      ts: `<?php
// PHP 8.1 — same result, compile-time and readable
$fn = strlen(...);
echo $fn('hello');`,
      note:
        "Closure::fromCallable() arrived in 7.1; the (...) syntax (8.1) is equivalent but resolved at compile time and far terser.",
    },
    {
      label: "A function that always throws",
      intro:
        "We are writing a small helper whose only job is to raise an exception, so control never flows back to the caller. We want the signature to make that 'never returns' contract explicit.",
      php: `<?php
// PHP 5.5 — no way to say "never returns"; void didn't exist either
function fail($msg) {
    throw new RuntimeException($msg);
}`,
      ts: `<?php
// PHP 8.1 — the never return type documents and enforces it
function fail(string $msg): never {
    throw new RuntimeException($msg);
}`,
      note:
        "never (PHP 8.1) marks a function that always throws or exits; it's stricter than void (7.1), which returns null, and lets analysers treat following code as unreachable.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "First-class callables in action: capture a function and a method as Closures, then use them. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

class Greeter {
    public function __construct(private string $prefix) {}
    public function greet(string $name): string {
        return "{$this->prefix}, {$name}!";
    }
}

// Free function captured as a first-class callable (8.1):
$len = strlen(...);
echo $len('hello'), "\\n";

// Instance method captured, bound to the object (8.1):
$g = new Greeter('Hi');
$greet = $g->greet(...);
echo $greet('Ada'), "\\n";

// Works anywhere a callable is expected:
$names = ['ann', 'bo', 'cleo'];
$lengths = array_map(strlen(...), $names);
echo implode(',', $lengths), "\\n";

print_r(array_map($greet, ['Sam', 'Lin']));`,
    output: `5
Hi, Ada!
3,2,4
Array
(
    [0] => Hi, Sam!
    [1] => Hi, Lin!
)
`,
  },

  keyPoints: [
    "First-class callable syntax `fn(...)` (PHP 8.1) turns any function, method, or static method into a real `Closure`.",
    "The `...` is literal — it captures the callable, it is **not** an argument placeholder.",
    "It replaces error-prone `'strlen'` strings and `[$obj, 'method']` arrays with type-safe, IDE-friendly closures.",
    "`$obj->method(...)` binds the closure to `$obj`; `Class::method(...)` captures a static method.",
    "`never` (PHP 8.1) marks functions that always throw or exit — stricter than `void`, which returns `null`.",
    "Fibers (PHP 8.1) provide cooperative, single-threaded pausing/resuming — the foundation of async runtimes like Amp and ReactPHP.",
  ],

  interview: [
    {
      q: "What does the `(...)` in `strlen(...)` mean, and how is it different from calling the function?",
      a: "It's **first-class callable syntax** (PHP 8.1). The `...` is literal and means *capture this callable as a `Closure`* rather than invoke it. `strlen('x')` calls the function; `strlen(...)` produces a `Closure` you can store and pass around. It's equivalent to `Closure::fromCallable('strlen')` (7.1) but resolved at compile time, type-checked, and visible to your IDE and static analyser.",
    },
    {
      q: "Coming from 5.5, how did you pass callables, and why is the new syntax better?",
      a: "In 5.5 you used **strings** like `'strlen'`, **arrays** like `[$obj, 'method']` or `['Class', 'staticMethod']`, or hand-built `Closure`s. Those forms are *stringly-typed*: a typo isn't caught until call time, and tooling can't follow them. `strlen(...)`, `$obj->method(...)`, and `Class::method(...)` give you real `Closure`s that are validated at compile time, autocomplete in the IDE, and — for instance methods — come pre-bound to the object.",
    },
    {
      q: "When would you use the `never` return type instead of `void`?",
      a: "Use `never` when a function **always** throws or terminates the script (`exit`/`die`) and so never returns control to the caller — for example a `fail()` helper or a redirect-and-exit. `void` (7.1) means the function returns, just with no value (it yields `null`). `never` (8.1) is the bottom type: returning a value or even falling off the end is a `TypeError`, and analysers know code after a `never` call is unreachable.",
    },
    {
      q: "What is a Fiber, and do you write them by hand?",
      a: "A **Fiber** (PHP 8.1) is a unit of code you can pause with `Fiber::suspend()` and later resume with `->resume()`. It's *cooperative* (it yields control voluntarily) and *single-threaded* — it is **not** parallelism or threads. You almost never use the `Fiber` class directly; it's the low-level primitive that async frameworks like **Amp** and **ReactPHP** build on to suspend a coroutine while it waits on I/O and run other work meanwhile, replacing the awkward generator/`yield` coroutines used before 8.1.",
    },
    {
      q: "Is `strlen(...)` the same as `[$obj, 'method']` for an instance method?",
      a: "Conceptually similar but better. `$obj->method(...)` produces a `Closure` **bound to `$obj`**, validated at compile time, with full type information. The `[$obj, 'method']` array form (still valid in 8.1) carries no type info, isn't followed by tooling, and a misspelled method name only fails when the callable is actually invoked.",
    },
  ],

  quiz: [
    {
      question: "What does `strlen(...)` evaluate to?",
      options: [
        "The integer length of an empty string",
        "A `Closure` that wraps the `strlen` function",
        "A syntax error — `...` needs arguments before it",
        "The string `'strlen'`",
      ],
      answerIndex: 1,
      explain:
        "First-class callable syntax (PHP 8.1) captures the function as a Closure. The `...` is literal and does not call the function, so the result is a Closure equivalent to Closure::fromCallable('strlen').",
    },
    {
      question: "How does the `never` return type differ from `void`?",
      options: [
        "`never` returns `null`; `void` returns `false`",
        "They are aliases for the same thing",
        "`void` means the function returns nothing (null); `never` means it always throws or exits and never returns at all",
        "`never` is only allowed on methods, `void` only on functions",
      ],
      answerIndex: 2,
      explain:
        "void (PHP 7.1) means the function returns control with no value (null). never (PHP 8.1) is the bottom type: the function always throws or exits, so it never returns — and analysers treat code after it as unreachable.",
    },
    {
      question: "Which statement about Fibers (PHP 8.1) is correct?",
      options: [
        "They run code in parallel across multiple OS threads",
        "They are cooperative, single-threaded units you can suspend and resume, used by async runtimes",
        "They replace `array_map` for callable handling",
        "They were available since PHP 5.5 as `yield`",
      ],
      answerIndex: 1,
      explain:
        "Fibers provide cooperative, single-threaded pausing (Fiber::suspend()) and resuming (->resume()). They are not threads or parallelism; libraries like Amp and ReactPHP use them to power async I/O.",
    },
  ],
};

export default lesson;
