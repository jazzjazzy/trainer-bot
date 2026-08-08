import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "type-hints",
  title: "Type Hints: Docblocks That Tools Can Check",
  part: "Batteries Included",
  estMinutes: 13,
  summary:
    "Python annotations look like PHP type declarations but the enforcement is inverted: the interpreter ignores them, and mypy/pyright catch errors statically instead.",

  concept: `
Here is the inversion that trips every PHP developer. In PHP, a declared type
is **runtime-enforced**: with \`strict_types=1\`, passing a string to
\`function f(int $n)\` throws \`TypeError\` at call time. In Python, annotations
are **runtime-IGNORED**: \`def f(n: int)\` accepts anything without complaint.
Python hints are what docblocks were in PHP 5 — documentation — except they're
part of the syntax, machine-readable, and a static checker (**mypy** or
**pyright**) can verify your whole codebase against them before it runs. Think
PHPStan/Psalm, but as *the* type system rather than an add-on parsing comments.

### The syntax

\`\`\`python
def greet(name: str) -> str:        # function f(string $name): string
    return f"Hello, {name}"

count: int = 0                      # typed property/variable
\`\`\`

A bare variable annotation (\`threshold: float\` with no \`=\`) records the type in
\`__annotations__\` but creates **no variable** — reading \`threshold\` still
raises \`NameError\`.

### Modern spellings (3.12 baseline)

- \`list[str]\`, \`dict[str, int]\` — builtin generics (3.9+); no more importing
  \`List\` from typing.
- \`int | None\` (3.10+) — PHP's \`?int\`. You'll still meet the older
  \`Optional[int]\` spelling, which means exactly the same thing.
- \`int | str\` — union types, same idea as PHP 8's \`int|string\`.
- \`Any\` — the escape hatch, PHP's \`mixed\`: compatible with everything, checked
  as nothing.
- \`Callable[[int], str]\` — PHP's \`callable\`, but with the signature spelled out.
- \`Literal["asc", "desc"]\` — only these exact values; the poor-PHP-man's
  version was a docblock or an enum.
- \`TypedDict\` — a dict with a declared shape (\`class Row(TypedDict): id: int\`),
  the equivalent of the \`array{id: int, ...}\` array-shape docblocks PHPStan
  reads. A loose dict is \`dict[str, Any]\`.
- \`type\` statement (3.12) for aliases: \`type UserId = int\`,
  \`type Rows = list[dict[str, str]]\`.

### The exception: annotations ARE readable at runtime

"Ignored" means the interpreter doesn't *enforce* them — but it does *store*
them, in \`__annotations__\`. That's the hook the interesting libraries use:
\`@dataclass\` generates constructors from field annotations, and
Pydantic/FastAPI read parameter annotations to validate requests and generate
OpenAPI schemas. So hints are simultaneously inert (no TypeError) and
load-bearing (frameworks build on them) — an attribute-and-reflection trick, in
PHP terms.

### Culture: gradual typing

Nothing forces hints anywhere, and real codebases type gradually: public
functions and module boundaries first, internals as they're touched. The
discipline equivalent to "PHPStan level 8 in CI" is **mypy (or pyright) in
CI**, often with \`--strict\` on new code. The interpreter never being the
enforcer means an unchecked annotation can silently rot — if you write hints,
run a checker.
`,

  comparisons: [
    {
      label: "The enforcement inversion",
      intro:
        "The same wrongly-typed call in both languages. PHP explodes at runtime; Python runs it happily and leaves detection to a static checker.",
      php: `<?php
declare(strict_types=1);

function double(int $n): int {
    return $n * 2;
}

echo double("7");
// PHP Fatal error: Uncaught TypeError:
// double(): Argument #1 ($n) must be of type int, string given`,
      ts: `# double.py
def double(n: int) -> int:
    return n * 2

print(double("7"))   # runs! prints "77" (string repetition)

# The interpreter never checks hints. A static checker does:
#   $ mypy double.py
#   error: Argument 1 to "double" has incompatible
#   type "str"; expected "int"`,
      note:
        "Exactly inverted: PHP types are enforced at call time and invisible to most tooling; Python types are invisible at call time and enforced by tooling (mypy/pyright) — like docblocks PHPStan can read, promoted to syntax.",
    },
    {
      label: "Nullable and union types",
      intro:
        "A finder that returns a user or null, and a parameter accepting two types. Modern Python spells both with the | operator, like PHP 8.",
      php: `<?php
declare(strict_types=1);

function findUser(int $id): ?User {
    return $id === 1 ? new User('Ada') : null;
}

function format(int|string $id): string {
    return "id:" . $id;
}`,
      ts: `# users.py
def find_user(user_id: int) -> User | None:   # 3.10+; older: Optional[User]
    return User("Ada") if user_id == 1 else None

def format_id(user_id: int | str) -> str:
    return f"id:{user_id}"

# Builtin generics since 3.9 — no imports needed:
def names(users: list[User]) -> dict[int, str]: ...`,
      note:
        "X | None replaces ?X, and Optional[X] is only the older spelling of the same union. list[str]/dict[str, int] (3.9+) killed the typing.List imports you'll still see in older code.",
    },
    {
      label: "Array shapes → TypedDict",
      intro:
        "Describing the shape of an associative-array-like structure so tools can check key access. PHPStan reads a docblock; Python declares a TypedDict.",
      php: `<?php
/**
 * @return array{id: int, name: string, active: bool}
 */
function fetchRow(): array {
    return ['id' => 1, 'name' => 'Ada', 'active' => true];
}
// PHPStan flags $row['nmae'] as an unknown key`,
      ts: `# rows.py
from typing import TypedDict

class Row(TypedDict):
    id: int
    name: str
    active: bool

def fetch_row() -> Row:
    return {"id": 1, "name": "Ada", "active": True}

# mypy flags row["nmae"] and a missing key.
# An unconstrained dict is dict[str, Any] — PHP's plain array.`,
      note:
        "TypedDict is the array-shape docblock made first-class: still a plain dict at runtime, but checkers verify keys and value types. Runtime enforcement needs Pydantic or manual validation.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Wrong types passed to hinted functions, plus a peek at __annotations__. Predict: does anything raise? What does label(42, \"many\") print? What does a bare annotation do to globals()?",
    code: `def label(code: str, retries: int = 3) -> str:
    return f"{code} (retries={retries})"

# Hints are enforced by NOTHING at runtime:
print(label("A1"))
print(label(42, "many"))  # wrong types, runs anyway

print(label.__annotations__)

def find_user(user_id: int) -> dict[str, str] | None:
    if user_id == 1:
        return {"name": "Ada"}
    return None

u = find_user(1)
print(u)
print(find_user(2))

port: int = 8080
threshold: float  # annotation only -- no variable created!
print(__annotations__)
print("threshold" in globals())`,
    output: `A1 (retries=3)
42 (retries=many)
{'code': <class 'str'>, 'retries': <class 'int'>, 'return': <class 'str'>}
{'name': 'Ada'}
None
{'port': <class 'int'>, 'threshold': <class 'float'>}
False`,
  },

  keyPoints: [
    "The inversion: PHP type declarations throw `TypeError` at call time; Python annotations are ignored by the interpreter — mypy/pyright catch mismatches statically, like PHPStan reading docblocks.",
    "Syntax: `def greet(name: str) -> str:` and `x: int = 0`. A bare `x: int` records the annotation but creates no variable.",
    "Modern spellings: `list[str]` / `dict[str, int]` (3.9+), `int | None` (3.10+) for `?int` — `Optional[X]` is the older identical spelling; `Any` ≈ `mixed`; `type UserId = int` (3.12) for aliases.",
    "`TypedDict` is the checked version of `array{...}` shape docblocks; `Literal[...]` pins exact values; `Callable[[int], str]` types a callable's full signature.",
    "Annotations are stored in `__annotations__` — that's how dataclasses, Pydantic and FastAPI use them at runtime despite the interpreter not enforcing them.",
    "Gradual-typing culture: hint public APIs first, run mypy or pyright in CI — unchecked hints rot silently because nothing at runtime ever validates them.",
  ],

  interview: [
    {
      q: "PHP enforces types at runtime; Python doesn't. How do you get type safety in Python, then?",
      a: "Statically. Annotations are syntax the interpreter stores but never checks — `double(\"7\")` with an `int` hint runs fine. The safety net is a checker: **mypy** or **pyright** analyses the codebase against the hints before it ships, the same job PHPStan/Psalm do for PHP but as the primary mechanism rather than a bolt-on. So the workflow is: annotate, run the checker in CI (ideally strict on new code), and treat checker errors like compile errors. Where runtime validation genuinely matters — untrusted input at API boundaries — you add a library like Pydantic that reads the same annotations and enforces them, which is exactly what FastAPI does per request.",
    },
    {
      q: "If the interpreter ignores annotations, how can FastAPI or dataclasses possibly use them?",
      a: "Ignored means *unenforced*, not *discarded*. Every annotated function, class and module carries an `__annotations__` dict mapping names to type objects, available through plain attribute access or `typing.get_type_hints()`. `@dataclass` reads class-level annotations to generate `__init__`; Pydantic reads field annotations to build runtime validators; FastAPI reads parameter annotations to parse, coerce and validate each request and to emit OpenAPI schemas. In PHP terms it's reflection over attributes: metadata the engine doesn't act on, but frameworks introspect and build behaviour from.",
    },
    {
      q: "Translate PHP's ?int, int|string, mixed and an array{id:int} docblock into modern Python hints.",
      a: "`?int` becomes `int | None` (3.10+ syntax; you'll still see the equivalent `Optional[int]` in older code). `int|string` is directly `int | str`. `mixed` is `Any` — compatible with everything and checked as nothing, so used just as sparingly. The `array{id: int, name: string}` shape docblock becomes a `TypedDict` subclass with those annotated keys — still a plain dict at runtime, but mypy validates key names and value types. And where PHPDoc had `@return int[]`, Python writes `list[int]` inline, builtin generics having replaced `typing.List` since 3.9.",
    },
  ],

  quiz: [
    {
      question:
        "With def double(n: int) -> int, what does double(\"7\") do in plain CPython?",
      options: [
        "Raises TypeError at call time, like PHP strict_types",
        "Coerces \"7\" to 7 and returns 14",
        "Runs without complaint — the hint is not enforced, so it returns \"77\"",
        "Raises a SyntaxError",
      ],
      answerIndex: 2,
      explain:
        "The interpreter never checks annotations, so the call proceeds and \"7\" * 2 is string repetition: \"77\". Only a static checker (mypy/pyright) — or a validation library reading the hints — would flag it. This is the exact inversion of PHP's runtime TypeError.",
    },
    {
      question: "What is the modern (3.10+) Python spelling of PHP's ?int?",
      options: ["Optional[int] only", "int | None", "?int", "Nullable[int]"],
      answerIndex: 1,
      explain:
        "int | None is the current union syntax; Optional[int] is the older, still-valid spelling of the same type. Python has no leading-? syntax.",
    },
    {
      question: "Which Python construct corresponds to PHPStan's array{id: int, name: string} shape docblock?",
      options: ["dict[str, Any]", "NamedTuple", "TypedDict", "Literal"],
      answerIndex: 2,
      explain:
        "TypedDict declares required keys and value types for what is still a plain dict at runtime, letting checkers validate key access — exactly the job of an array-shape docblock. dict[str, Any] is the opposite: an unconstrained associative array.",
    },
    {
      question: "How do dataclasses and Pydantic use annotations if the runtime ignores them?",
      options: [
        "They patch the interpreter to enforce types",
        "They read the stored __annotations__ metadata and generate code or validators from it",
        "They only work when mypy is installed",
        "They convert annotations to docblocks",
      ],
      answerIndex: 1,
      explain:
        "Annotations are stored (in __annotations__) even though they're not enforced. Libraries introspect that metadata — dataclasses to generate __init__, Pydantic/FastAPI to build runtime validators and API schemas — the reflection-over-attributes pattern from PHP.",
    },
  ],
};

export default lesson;
