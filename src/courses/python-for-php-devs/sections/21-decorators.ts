import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "decorators",
  title: "Decorators: Middleware for Functions",
  part: "Batteries Included",
  estMinutes: 12,
  summary:
    "Python's @decorator syntax looks like PHP 8 attributes but behaves like middleware: a decorator executes, wrapping your function in a replacement.",

  concept: `
Seeing \`@something\` above a Python function, your PHP brain says *attribute* —
\`#[Route('/users')]\` metadata that sits there inertly until reflection reads it.
That instinct is the one thing you must unlearn: a Python **decorator is not
metadata**. It is a plain function that **runs at definition time**, receives
your function as an argument, and its return value **replaces** your function.

### The mental model: f = decorator(f)

\`\`\`python
@timing
def slow_report():
    ...
\`\`\`

is *exactly* sugar for:

\`\`\`python
def slow_report():
    ...
slow_report = timing(slow_report)
\`\`\`

If you've written Laravel route middleware — a callable that receives the
handler, does work before/after, and passes the request through — you already
understand decorators. They're middleware for functions, applied at the
definition site instead of in a kernel config.

### Writing one

A decorator is a function that takes a function and returns a wrapper:

\`\`\`python
import functools

def timing(fn):
    @functools.wraps(fn)          # keeps fn's __name__ and docstring
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = fn(*args, **kwargs)
        print(f"{fn.__name__} took {time.perf_counter() - start:.3f}s")
        return result
    return wrapper
\`\`\`

\`*args, **kwargs\` is Python's "forward whatever arguments arrive" — the
equivalent of \`...func_get_args()\` forwarding, but first-class. Always add
\`@functools.wraps(fn)\`: without it the wrapped function reports its name as
\`wrapper\`, which wrecks debugging, logging and API docs.

### Decorators with arguments

\`@retry(times=3)\` needs one more layer: a function that takes the arguments
and *returns a decorator*. Three levels of \`def\` — the outer takes config, the
middle takes the function, the inner is the wrapper. Write it once, copy it
forever.

### Stacking

\`\`\`python
@logged
@cached
def lookup(key): ...
\`\`\`

applies **bottom-up**: \`lookup = logged(cached(lookup))\`. The decorator nearest
the function wraps first, the top one wraps last — same as middleware layers,
where the first listed is the outermost.

### You've been using them all along

\`@property\`, \`@staticmethod\` and \`@classmethod\` are decorators. \`@dataclass\`
is a **class decorator** (they work on classes too). In the wild you'll meet
\`@app.get("/users")\` in FastAPI, \`@app.route\` in Flask, \`@pytest.fixture\`, and
\`@functools.cache\` — memoisation for free, one line above any pure function.
`,

  comparisons: [
    {
      label: "PHP 8 attribute vs Python decorator",
      intro:
        "Both snippets put an @/#[ marker above a function to attach cross-cutting behaviour — but only one of them actually does anything by itself.",
      php: `<?php
// src/Controller/UserController.php
// The attribute is INERT metadata. Nothing happens
// unless a framework reflects over it later.
#[Route('/users', methods: ['GET'])]
function listUsers(): array {
    return ['ada', 'grace'];
}

// Something must do this, or the attribute is ignored:
$ref = new ReflectionFunction('listUsers');
$attrs = $ref->getAttributes(Route::class);`,
      ts: `# routes.py
# The decorator EXECUTES at definition time:
# list_users = route("/users")(list_users)
def route(path):
    def register(fn):
        print(f"registering {path} -> {fn.__name__}")
        return fn
    return register

@route("/users")
def list_users():
    return ["ada", "grace"]
# prints: registering /users -> list_users`,
      note:
        "PHP attributes are data waiting for reflection; a Python decorator is code that runs immediately and can replace the function entirely.",
    },
    {
      label: "Timing middleware around a function",
      intro:
        "Wrap a slow function so every call logs its duration. In PHP you'd decorate manually with a closure; Python bakes the wiring into syntax.",
      php: `<?php
// timing.php — manual wrapping with a closure
function timed(callable $fn): callable {
    return function (...$args) use ($fn) {
        $start = microtime(true);
        $result = $fn(...$args);
        $ms = (microtime(true) - $start) * 1000;
        printf("took %.1fms\\n", $ms);
        return $result;
    };
}

$report = timed('buildReport');
$report(2026);   // must remember to call the wrapped one`,
      ts: `# timing.py — the wrapping is applied at the def site
import functools, time

def timed(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = fn(*args, **kwargs)
        print(f"took {(time.perf_counter() - start) * 1000:.1f}ms")
        return result
    return wrapper

@timed
def build_report(year):
    return f"report {year}"

build_report(2026)   # callers can't forget the wrapper`,
      note:
        "Same higher-order-function idea, but @timed rebinds the name at definition, so every caller gets the wrapped version automatically.",
    },
    {
      label: "Memoisation: hand-rolled static cache vs @functools.cache",
      intro:
        "Cache the results of an expensive pure function. PHP needs a static array and an isset check; Python is one decorator line.",
      php: `<?php
// fib.php — the classic static-cache dance
function fib(int $n): int {
    static $cache = [];
    if (isset($cache[$n])) {
        return $cache[$n];
    }
    return $cache[$n] = $n < 2
        ? $n
        : fib($n - 1) + fib($n - 2);
}`,
      ts: `# fib.py — memoisation is a stdlib decorator (3.9+)
import functools

@functools.cache
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)`,
      note:
        "@functools.cache (Python 3.9) wraps the function in an unbounded argument-keyed cache — the whole static-array pattern disappears.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Two hand-written decorators stacked bottom-up, functools.wraps preserving the name, and @functools.cache collapsing 21,891 naive fib calls. Predict the order of the log lines and the call count.",
    code: `import functools

def logged(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        print(f"-> calling {fn.__name__}{args}")
        result = fn(*args, **kwargs)
        print(f"<- {fn.__name__} returned {result!r}")
        return result
    return wrapper

def shout(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs).upper()
    return wrapper

@logged
@shout
def greet(name):
    return f"hello, {name}"

greet("ada")
print(f"name survives wrapping: {greet.__name__}")

calls = 0

@functools.cache
def fib(n):
    global calls
    calls += 1
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print(f"fib(20) = {fib(20)}")
print(f"function body ran {calls} times, not 21891")`,
    output: `-> calling greet('ada',)
<- greet returned 'HELLO, ADA'
name survives wrapping: greet
fib(20) = 6765
function body ran 21 times, not 21891`,
  },

  keyPoints: [
    "`@decorator` looks like a PHP 8 attribute but is the opposite: attributes are inert metadata read via reflection; decorators execute and replace the function.",
    "The whole feature is `f = decorator(f)` — a decorator receives the function and returns whatever should stand in its place, usually a wrapper.",
    "Always apply `@functools.wraps(fn)` inside your wrapper so `__name__` and the docstring survive; forgetting it breaks logs, debuggers and framework introspection.",
    "Decorators with arguments (`@retry(times=3)`) need a third layer: config → decorator → wrapper.",
    "Stacked decorators apply bottom-up — the one closest to `def` wraps first, like innermost middleware.",
    "You meet decorators everywhere: `@property`, `@dataclass` (a class decorator), `@app.get` in FastAPI, `@pytest.fixture`, and free memoisation via `@functools.cache` (3.9+).",
  ],

  interview: [
    {
      q: "PHP 8 attributes and Python decorators look identical. How do they differ?",
      a: "They solve different problems. A PHP attribute like `#[Route('/users')]` is pure metadata — it does nothing until a framework reflects over the class and reads it. A Python decorator is executable code: at definition time Python calls `decorator(fn)` and binds the function's name to whatever comes back, usually a wrapper closure. So an attribute *describes* behaviour someone else must implement, while a decorator *is* the behaviour. The nearest PHP mental model is Laravel middleware wrapping a handler, not attributes.",
    },
    {
      q: "Walk me through writing a decorator that logs a function's arguments.",
      a: "Define `def logged(fn):` and inside it a `def wrapper(*args, **kwargs):` that prints, calls `fn(*args, **kwargs)`, and returns the result; return `wrapper`. The `*args, **kwargs` pair forwards any signature untouched — like `...\$args` spreading in PHP. Two details make it production-quality: decorate the wrapper with `@functools.wraps(fn)` so the wrapped function keeps its real `__name__` and docstring, and remember to return `fn`'s result — swallowing it is the classic first-decorator bug.",
    },
    {
      q: "What does @functools.wraps do and why does it matter?",
      a: "Without it, every decorated function reports its name as `wrapper` and loses its docstring, because the wrapper closure genuinely replaced it. `@functools.wraps(fn)` copies `__name__`, `__doc__`, `__module__` and friends from the original onto the wrapper. That matters beyond aesthetics: logging, tracebacks, `help()`, and framework machinery that introspects handlers (FastAPI's docs generation, pytest's fixture resolution) all read those attributes.",
    },
    {
      q: "If a function has @a above @b, which applies first?",
      a: "Bottom-up: `f = a(b(f))`. The decorator nearest the `def` wraps the raw function; the top one wraps the result and is therefore outermost at call time — exactly like middleware layers, where the first in the list sees the request first and the response last. Order can matter a lot, e.g. `@logged` above `@cached` logs every call including cache hits, while the reverse logs only cache misses.",
    },
  ],

  quiz: [
    {
      question: "What is `@timing` above `def report(): ...` exactly equivalent to?",
      options: [
        "Attaching metadata that frameworks can read via reflection",
        "report = timing(report) executed at definition time",
        "Registering report to run automatically when the module loads",
        "A type annotation checked by the interpreter",
      ],
      answerIndex: 1,
      explain:
        "Decorator syntax is sugar for calling the decorator with the function and rebinding the name to the result. It executes immediately at definition time — unlike a PHP attribute, which is inert metadata.",
    },
    {
      question: "Why put @functools.wraps(fn) on your wrapper function?",
      options: [
        "It makes the wrapper run faster by caching results",
        "It is required syntax — decorators fail without it",
        "It copies the original function's __name__ and docstring onto the wrapper",
        "It forwards *args and **kwargs automatically",
      ],
      answerIndex: 2,
      explain:
        "The wrapper is a different function object, so without wraps everything reports as 'wrapper'. functools.wraps copies identity metadata across; argument forwarding is your *args/**kwargs, and caching is a different decorator entirely (functools.cache).",
    },
    {
      question: "Given @logged above @cached above def lookup(), what call order results?",
      options: [
        "lookup = cached(logged(lookup)) — logged wraps first",
        "lookup = logged(cached(lookup)) — cached wraps first",
        "Both decorators receive the raw function independently",
        "The order is undefined and interpreter-dependent",
      ],
      answerIndex: 1,
      explain:
        "Decorators apply bottom-up: the one nearest def (cached) wraps the raw function, then logged wraps that result. So logged is outermost and sees every call, including cache hits.",
    },
    {
      question: "Which statement about @functools.cache is true?",
      options: [
        "It only works on methods of classes",
        "It memoises by argument, added to the stdlib in Python 3.9",
        "It writes cached values to disk between runs",
        "It is Flask-specific route caching",
      ],
      answerIndex: 1,
      explain:
        "functools.cache (3.9) wraps a function in an unbounded in-memory cache keyed by its arguments — the one-line replacement for PHP's static-array memoisation pattern. It's process-local, not persistent.",
    },
  ],
};

export default lesson;
