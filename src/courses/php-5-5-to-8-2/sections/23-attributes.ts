import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "attributes",
  title: "Attributes: Real Metadata Instead of Magic Comments",
  part: "PHP 8.0: The Big Leap",
  estMinutes: 13,
  summary:
    "PHP 8.0 promotes metadata from string docblocks parsed by hand into first-class #[Attribute] syntax the engine understands and Reflection reads as real objects.",

  concept: `
For years, PHP's answer to "attach metadata to a class or method" was the
**docblock annotation**: a specially-formatted \`/** @Route(...) */\` comment that
the engine completely ignores, and that a library re-parses out of the *string*
at runtime. Doctrine, Symfony, and PHPUnit all did this. It worked, but the
"annotation" was just a comment — invisible to the engine, unchecked by any
tooling, and one stray \`*\` away from silently breaking.

PHP **8.0** made metadata a real language construct: **attributes**, written
with \`#[Attr(...)]\` immediately before the thing they decorate.

### Declaring and reading an attribute

An attribute class is just a normal class marked with the built-in
\`#[Attribute]\`. You attach it with \`#[...]\` and read it back via **Reflection**:

\`\`\`php
#[Attribute]
class Route {
    public function __construct(public string $path) {}
}

class UserController {
    #[Route('/users')]
    public function index() {}
}

$method = new ReflectionMethod(UserController::class, 'index');
foreach ($method->getAttributes(Route::class) as $attr) {
    $route = $attr->newInstance();   // a real Route object
    echo $route->path;               // "/users"
}
\`\`\`

\`getAttributes()\` returns lightweight \`ReflectionAttribute\` handles; nothing is
instantiated until you call \`newInstance()\`, which constructs the attribute
object with its arguments validated like any constructor.

### Why it matters

- **The engine parses it**, so \`#[Route('/x'\` is a syntax error you find
  immediately — a malformed \`@Route\` docblock just yields no annotation.
- Attributes take normal PHP arguments, including **named arguments** and
  constant expressions — no bespoke mini-language inside a comment.
- They power **routers, ORMs, validators, DI containers, and PHPUnit**
  (\`#[Test]\`, \`#[DataProvider]\`) — the same jobs annotations did, but typed.

### The gotcha

The syntax \`#[...]\` is forward-compatible: on PHP 7.x a line starting with \`#\`
is just a comment, so \`#[Route('/x')]\` is silently *ignored* rather than an
error. That means an accidental run on an old runtime drops your metadata with
no warning. Attributes are only *active* from **8.0**.
`,

  comparisons: [
    {
      label: "Declaring the metadata type",
      intro:
        "We want a reusable Route type so a method can later say which URL it handles. Here we define that metadata type itself, before attaching it anywhere.",
      php: `<?php
// PHP 5.5 — Doctrine-style annotation class
// read by parsing the docblock STRING at runtime
/**
 * @Annotation
 * @Target("METHOD")
 */
class Route {
    /** @var string */
    public $path;
}`,
      ts: `<?php
// PHP 8.0 — a plain class flagged as an attribute
#[Attribute(Attribute::TARGET_METHOD)]
class Route {
    public function __construct(
        public string $path
    ) {}
}`,
      note:
        "PHP 8.0 added the built-in #[Attribute] marker; targets are enum-like flags (Attribute::TARGET_METHOD) instead of a string inside a comment.",
    },
    {
      label: "Attaching metadata",
      intro:
        "Now we tag a controller's index method with the route '/users' so a router can map that URL to it. The goal is to record the path right on the method that serves it.",
      php: `<?php
// PHP 5.5 — metadata hidden in a docblock comment
class UserController {
    /**
     * @Route("/users", name="user_list")
     */
    public function index() {}
}`,
      ts: `<?php
// PHP 8.0 — real syntax the parser checks
class UserController {
    #[Route('/users', name: 'user_list')]
    public function index() {}
}`,
      note:
        "From 8.0 the decoration is a parsed expression: a typo like #[Route('/users' is a fatal parse error, and you can pass named arguments.",
    },
    {
      label: "Reading the metadata back",
      intro:
        "At runtime a router needs to recover the '/users' path that was attached to the index method. Here we use Reflection to fetch that metadata back out, ending up with the path string.",
      php: `<?php
// PHP 5.5 — pull the raw docblock and parse it yourself
$ref = new ReflectionMethod('UserController', 'index');
$doc = $ref->getDocComment();          // the literal comment string
preg_match('/@Route\\("([^"]+)"\\)/', $doc, $m);
$path = $m[1] ?? null;`,
      ts: `<?php
// PHP 8.0 — Reflection hands you typed objects
$ref = new ReflectionMethod(UserController::class, 'index');
foreach ($ref->getAttributes(Route::class) as $attr) {
    $route = $attr->newInstance();     // a Route instance
    $path  = $route->path;
}`,
      note:
        "PHP 8.0 added getAttributes()/newInstance() on the Reflection classes, replacing getDocComment() + regex/library parsing of the comment string.",
    },
    {
      label: "Inspecting arguments without constructing",
      intro:
        "Sometimes you just want to peek at the raw values passed to the route, such as its path and name, without building a full object. Here we read those arguments directly off the method's metadata.",
      php: `<?php
// PHP 5.5 — no notion of structured args;
// a library (e.g. Doctrine) tokenises the string for you
$reader = new \\Doctrine\\Common\\Annotations\\AnnotationReader();
$annotations = $reader->getMethodAnnotations($ref);
$path = $annotations[0]->path;`,
      ts: `<?php
// PHP 8.0 — arguments are available as a real array
$attr = $ref->getAttributes(Route::class)[0];
$args = $attr->getArguments();          // ['/users', 'name' => 'user_list']
$name = $attr->getName();               // 'Route'`,
      note:
        "PHP 8.0's ReflectionAttribute exposes getName()/getArguments() so you can read metadata without instantiating it — no third-party annotation reader required.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Declare an attribute, tag two methods with it, and discover the routes with Reflection. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

#[Attribute(Attribute::TARGET_METHOD)]
class Route {
    public function __construct(
        public string $path,
        public string $method = 'GET',
    ) {}
}

class BlogController {
    #[Route('/posts')]
    public function list(): void {}

    #[Route('/posts', method: 'POST')]
    public function create(): void {}

    public function helper(): void {}   // no attribute
}

$ref = new ReflectionClass(BlogController::class);

foreach ($ref->getMethods() as $m) {
    $attrs = $m->getAttributes(Route::class);
    if ($attrs === []) {
        continue;
    }
    $route = $attrs[0]->newInstance();
    echo "{$route->method} {$route->path} -> {$m->getName()}\\n";
}`,
    output: `GET /posts -> list
POST /posts -> create`,
  },

  keyPoints: [
    "Attributes (PHP **8.0**) replace docblock `@annotations` with real `#[Attr(...)]` syntax the engine parses.",
    "An attribute class is a normal class marked `#[Attribute]`; you can restrict where it applies with `Attribute::TARGET_*` flags.",
    "Read them with Reflection: `getAttributes(Name::class)` returns `ReflectionAttribute` handles, `->newInstance()` builds the object.",
    "Arguments are ordinary PHP — including **named arguments** and constant expressions — and a malformed attribute is a parse error, not a silent no-op.",
    "Routers, ORMs, validators, DI containers, and PHPUnit (`#[Test]`, `#[DataProvider]`) are all built on them.",
    "Gotcha: on PHP **7.x** `#[...]` is just a comment, so attributes are silently ignored — they're only active from 8.0.",
  ],

  interview: [
    {
      q: "How did metadata like routes or ORM mappings work before PHP 8.0, and what changed?",
      a: "Before 8.0 the only place to put it was a **docblock comment** — e.g. `/** @Route(\"/users\") */` — which the engine ignores entirely. A library (Doctrine's annotation reader, Symfony, PHPUnit) would call `ReflectionMethod::getDocComment()`, get the raw comment **string**, and tokenise/parse it at runtime. PHP **8.0** introduced **attributes** (`#[Route('/users')]`), which are part of the language grammar. The parser checks them, you read them with `getAttributes()` and get back real, typed objects via `newInstance()` — no string parsing and no third-party reader required.",
    },
    {
      q: "Walk me through declaring and reading a custom attribute.",
      a: "Declare a normal class and mark it with the built-in attribute: `#[Attribute] class Route { public function __construct(public string $path) {} }`. Attach it: `#[Route('/users')] public function index() {}`. Read it via Reflection:\n\n```php\n$ref = new ReflectionMethod(C::class, 'index');\nforeach ($ref->getAttributes(Route::class) as $a) {\n    $route = $a->newInstance(); // Route object\n}\n```\n\n`getAttributes()` returns `ReflectionAttribute` handles and instantiates **nothing** until you call `newInstance()`, which runs the constructor with the supplied (possibly named) arguments.",
    },
    {
      q: "What's a subtle danger when adding attributes to a codebase that might still touch PHP 7?",
      a: "The `#[...]` syntax was deliberately chosen to be backward-*compatible*: on PHP 7.x a line beginning with `#` is a **comment**, so `#[Route('/x')]` parses fine but is completely **ignored** — your metadata silently vanishes with no error. So if any environment, build step, or tool still runs 7.x, attribute-driven behaviour (routing, validation, DI) just won't fire. Attributes are only honoured from **8.0** onward; enforce a minimum platform in `composer.json`.",
    },
    {
      q: "Why call newInstance() instead of just reading the attribute's arguments?",
      a: "`ReflectionAttribute` gives you two paths. `getArguments()` returns the **raw arguments array** without constructing anything — cheap, and useful if you only need the values or want to avoid side effects. `newInstance()` actually **constructs the attribute object**, which runs its constructor: type coercion, defaults, validation, and any logic you put there all happen. Use `getArguments()` for a quick peek; use `newInstance()` when you want a validated, typed object to work with.",
    },
  ],

  quiz: [
    {
      question: "In which PHP version did native attributes (`#[Attr(...)]`) arrive?",
      options: ["PHP 5.6", "PHP 7.4", "PHP 8.0", "PHP 8.1"],
      answerIndex: 2,
      explain:
        "Attributes were introduced in PHP 8.0. Before that, the equivalent was docblock annotations parsed by libraries from the comment string.",
    },
    {
      question: "How do you turn the attributes on a method into usable objects?",
      options: [
        "Call $method->getDocComment() and regex the result",
        "Call $method->getAttributes(), then ->newInstance() on each",
        "Call $method->invokeAttributes() directly",
        "Read them from $method->attributes as a property",
      ],
      answerIndex: 1,
      explain:
        "ReflectionMethod::getAttributes() returns ReflectionAttribute handles; calling newInstance() on each constructs the actual attribute object with its (possibly named) arguments.",
    },
    {
      question: "What happens if a file using `#[Route('/x')]` is run on PHP 7.4?",
      options: [
        "A fatal parse error is raised",
        "The attribute is silently ignored as a comment",
        "It is automatically converted to a docblock annotation",
        "The Route object is still instantiated at startup",
      ],
      answerIndex: 1,
      explain:
        "On PHP 7.x a line starting with # is a comment, so the attribute is parsed as a comment and ignored — there's no error, and the metadata simply has no effect. Attributes are only active from PHP 8.0.",
    },
  ],
};

export default lesson;
