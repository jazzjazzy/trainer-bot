import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "return-types",
  title: "Return Type Declarations: From @return to Enforced Contracts",
  part: "PHP 7.0: Types & the Engine",
  estMinutes: 11,

  summary:
    "PHP 7.0 turned the @return docblock into a real, engine-enforced contract — and 7.1+ added :void, :self, and :static to describe exactly what a method gives back.",

  concept: `
In PHP 5.5 a function's return type lived in a **docblock comment** that only
your IDE read. The engine never checked it, so a function annotated
\`@return int\` could happily \`return null;\` or \`return 'oops';\` and you'd only
find out at the call site — usually as a confusing bug three frames away.

### Return types become real (7.0)

PHP 7.0 added **return type declarations**: a type after the parameter list,
introduced by a colon.

\`\`\`php
function sum(int $a, int $b): int {
    return $a + $b;
}
\`\`\`

Now the engine enforces it. In **coercive mode** (the default) a returned
\`"42"\` is coerced to \`int(42)\`; under \`declare(strict_types=1)\` a wrong type
throws a \`TypeError\` immediately, at the function that broke the contract.

### void, self, and static (7.1+)

- **\`: void\`** (PHP **7.1**) means "returns nothing". The body may \`return;\`
  with no value, or omit \`return\` entirely — but \`return $x;\` is a fatal error.
  Don't confuse it with \`null\`: a \`void\` function isn't allowed to *return*
  null, it just falls off the end.
- **\`: self\`** (available since 7.0) means "an instance of *this* class" — handy
  for fluent setters and named constructors.
- **\`: static\`** (PHP **8.0** as a return type) means "an instance of the
  *called* class", so subclasses get the right type back from a fluent chain.
  Late static binding, finally expressible in the signature.

### Nullable returns

A function that may return a value *or* null uses the nullable prefix
\`?Type\` (PHP **7.1**):

\`\`\`php
function find(int $id): ?User { ... }   // User or null
\`\`\`

### Why it matters

The docblock could lie; the declaration cannot. Combined with parameter and
property types, return types let the engine catch a whole class of "wrong shape"
bugs at the boundary instead of deep in your call stack. Your old \`@return\` tags
still document generics like \`@return User[]\` that the engine can't express —
but for everything else, the real type now carries the weight.
`,

  comparisons: [
    {
      label: "Declaring what a function returns",
      intro:
        "An area function multiplies width by height and should always hand back an integer. Here we promise that integer result two ways: as a comment, then as something the engine actually checks.",
      php: `<?php
// PHP 5.5 — return type is a comment the engine ignores
/**
 * @return int
 */
function area($w, $h) {
    return $w * $h;
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 7.0 — enforced return type
function area(int $w, int $h): int {
    return $w * $h;
}`,
      note:
        "Return type declarations arrived in PHP 7.0; under strict_types a wrong return throws TypeError at the function, not at the caller.",
    },
    {
      label: "A method that returns nothing",
      intro:
        "A Logger's log method writes a message to a file purely for its side effect and never produces a result for the caller to use. We want a way to make that no-return intent explicit and enforceable.",
      php: `<?php
// PHP 5.5 — only a docblock signals "no return value"
class Logger {
    /**
     * @return void
     */
    public function log($msg) {
        file_put_contents('app.log', $msg, FILE_APPEND);
    }
}`,
      ts: `<?php
// PHP 7.1 — : void is enforced; returning a value is a fatal error
class Logger {
    public function log(string $msg): void {
        file_put_contents('app.log', $msg, FILE_APPEND);
    }
}`,
      note:
        "The : void return type was added in PHP 7.1; the body may use a bare `return;` but never `return $value;`.",
    },
    {
      label: "Fluent setters / named constructors",
      intro:
        "A Query builder's where method returns $this so calls can be chained fluently. The goal is for the declared return type to stay accurate even when a subclass inherits this method.",
      php: `<?php
// PHP 5.5 — @return guesses the type; subclasses are wrong
class Query {
    /**
     * @return Query
     */
    public function where($c) {
        // ...
        return $this;
    }
}`,
      ts: `<?php
// PHP 8.0 — : static gives subclasses the correct type back
class Query {
    public function where(string $c): static {
        // ...
        return $this;
    }
}`,
      note:
        "self has been usable as a return type since 7.0, but : static (PHP 8.0) returns the called class — so a subclass chain stays typed as the subclass.",
    },
    {
      label: "May return a value or null",
      intro:
        "A findUser lookup returns a User when the id matches and null when nothing is found. We want the signature itself to advertise that it can legitimately hand back null.",
      php: `<?php
// PHP 5.5 — nullability lives only in the docblock
/**
 * @return User|null
 */
function findUser($id) {
    return $id === 1 ? new User() : null;
}`,
      ts: `<?php
declare(strict_types=1);

// PHP 7.1 — nullable return type, enforced
function findUser(int $id): ?User {
    return $id === 1 ? new User() : null;
}`,
      note:
        "Nullable return types (?Type) arrived in PHP 7.1; before that you'd widen to no type hint because plain : User would reject null.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Enforced return types in action — coercion, void, and nullable. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

function half(int $n): float {
    return $n / 2;            // int / int yields float unless exact; an
                              // exact int result is widened by the type
}

function greet(string $name): ?string {
    return $name === '' ? null : "Hi, {$name}";
}

class Counter {
    private int $n = 0;
    public function tick(): static {   // 8.0: returns the called class
        $this->n++;
        return $this;
    }
    public function value(): int {
        return $this->n;
    }
}

var_dump(half(5));
var_dump(greet(''));
var_dump(greet('Ada'));
echo (new Counter())->tick()->tick()->tick()->value(), "\\n";`,
    output: `float(2.5)
NULL
string(7) "Hi, Ada"
3`,
  },

  keyPoints: [
    "Return type declarations (`function f(): int`) arrived in **PHP 7.0** and are enforced by the engine — unlike the `@return` docblock the engine ignored in 5.5.",
    "Under `declare(strict_types=1)` a wrong return throws `TypeError` at the offending function; in coercive mode compatible scalars are converted.",
    "**`: void`** (PHP 7.1) means returns nothing — `return;` is fine, `return $x;` is a fatal error. It is *not* the same as returning null.",
    "**`: self`** (since 7.0) is an instance of the declaring class; **`: static`** (PHP 8.0) is an instance of the *called* class — correct for fluent subclass chains.",
    "Nullable returns use `?Type` (PHP 7.1); a plain `: User` rejects null.",
    "Keep `@return` only where the engine can't help — e.g. `@return User[]` for array element types.",
  ],

  interview: [
    {
      q: "What's the practical difference between `@return int` in PHP 5.5 and `: int` in PHP 7.0?",
      a: "`@return int` is **documentation** — a comment the engine never reads, so the function can return anything and the only consequence is a misleading IDE hint. `: int` is a **contract the engine enforces**: in coercive mode a compatible scalar like `\"42\"` is converted to `int(42)`, and under `declare(strict_types=1)` a non-int return throws a `TypeError` right at the function that broke the promise — instead of surfacing as a weird bug at some distant call site.",
    },
    {
      q: "How does `: void` differ from returning `null`?",
      a: "`: void` (PHP **7.1**) declares the function returns **no value at all**. The body may use a bare `return;` to exit early or just fall off the end, but `return null;` or `return $x;` is a fatal error. A function typed `: ?SomeType` *does* return a value that happens to be null. So `void` is about the **absence** of a return value, not a value that is null — and you can't use a `void` call's result in an expression.",
    },
    {
      q: "When would you use `: static` instead of `: self`?",
      a: "Both name the current class, but `: self` is resolved at **declaration** time to the class that wrote the method, while `: static` (as a return type, PHP **8.0**) uses **late static binding** and resolves to the **called** class. For a fluent API, if `Base::where(): self` is inherited by `Child`, a `(new Child)->where()` chain is typed as `Base` — losing `Child`'s methods to the type checker. Declaring `: static` keeps the chain typed as `Child`. Use `static` for fluent setters and named constructors on classes meant to be extended.",
    },
    {
      q: "We added `: int` to an existing 5.5 function and it now throws `TypeError`. Why, and how do you roll it out safely?",
      a: "The function was probably returning the *wrong* type all along — e.g. `null` on a 'not found' path, or a numeric string — and the docblock hid it. Adding the real type exposed the latent bug. Roll out by adding return types **incrementally**, starting in coercive mode (no `strict_types`) so compatible scalars are coerced rather than rejected, lean on your test suite, and use **Rector**/**PHPStan** to surface mismatches before they hit production. If a path legitimately returns null, declare it `: ?Type` rather than dropping the type.",
    },
  ],

  quiz: [
    {
      question: "Which PHP version first allowed an enforced return type on a function, e.g. `function f(): int`?",
      options: ["PHP 5.6", "PHP 7.0", "PHP 7.1", "PHP 8.0"],
      answerIndex: 1,
      explain:
        "Return type declarations were introduced in PHP 7.0. The `: void` type came later in 7.1, and `: static` as a return type in 8.0.",
    },
    {
      question: "Inside a function declared `function run(): void`, which statement is legal?",
      options: [
        "`return null;`",
        "`return 0;`",
        "`return;`",
        "`return false;`",
      ],
      answerIndex: 2,
      explain:
        "`: void` (PHP 7.1) forbids returning any value. A bare `return;` to exit early is allowed; `return null;`, `return 0;`, and `return false;` all return a value and cause a fatal error.",
    },
    {
      question: "A base class declares `public function self(): self` and `public function stat(): static`, both `return $this;`. A subclass `Child` inherits them. What does the type checker infer for `(new Child)->self()` and `(new Child)->stat()`?",
      options: [
        "Both are typed as `Child`",
        "`self()` is `Base`, `stat()` is `Child`",
        "`self()` is `Child`, `stat()` is `Base`",
        "Both are typed as `Base`",
      ],
      answerIndex: 1,
      explain:
        "`self` resolves at declaration time to the declaring class (`Base`), so the inherited method is typed `Base`. `static` (PHP 8.0 as a return type) uses late static binding and resolves to the called class, so it is typed `Child`.",
    },
  ],
};

export default lesson;
