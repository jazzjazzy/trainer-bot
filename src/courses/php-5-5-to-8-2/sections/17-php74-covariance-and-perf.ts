import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "php74-covariance-and-perf",
  title: "PHP 7.4: Covariant Returns, Contravariant Params & the Performance Toolbox",
  part: "PHP 7.1–7.4: Refinements",
  estMinutes: 12,
  summary:
    "How PHP 7.4 loosened the rules for overriding typed methods, and the trio of low-level features — preloading, FFI, and weak references — that arrived alongside it.",

  concept: `
PHP 7.4 was the last 7.x release, and it quietly fixed one of the most annoying
limitations of PHP's young type system: **invariant** method signatures. Before
7.4, an override had to repeat its parent's types *exactly*. After 7.4, you can
**narrow a return type** and **widen a parameter type** — the variance rules
every typed language eventually grows into.

### The old rule: invariance

In PHP 5.5 there were no scalar/return type hints to violate, but as soon as
7.0–7.3 gave you typed signatures, the engine demanded that an overriding method
match the parent **exactly**. A child factory couldn't promise to return a more
specific type than its parent declared.

### Covariant return types (PHP 7.4)

A child may return a **more specific** (narrower) type than the parent:

\`\`\`php
class AnimalShelter {
    public function adopt(): Animal { /* ... */ }
}
class CatShelter extends AnimalShelter {
    public function adopt(): Cat { /* Cat extends Animal — allowed in 7.4+ */ }
}
\`\`\`

### Contravariant parameter types (PHP 7.4)

A child may accept a **more general** (wider) parameter than the parent — it
still honours every call the parent could:

\`\`\`php
class Feeder {
    public function feed(Cat $c): void {}
}
class SuperFeeder extends Feeder {
    public function feed(Animal $a): void {} // wider — allowed in 7.4+
}
\`\`\`

This is the **Liskov Substitution Principle** in the type system: returns get
narrower down the hierarchy, parameters get wider. Get the direction backwards
and you get a fatal \`Declaration must be compatible\` error.

### The performance & interop toolbox

7.4 also shipped three lower-level features worth knowing:

- **Preloading** (\`opcache.preload\`) — point OPcache at a PHP script run once at
  server start; the listed files are compiled and **kept in memory for every
  request**, skipping per-request compilation. A modest startup win for big
  frameworks.
- **FFI** (Foreign Function Interface) — call C libraries directly from PHP with
  \`FFI::cdef()\`, no extension to compile. Powerful, but slow per-call and meant
  for glue code, not hot loops.
- **WeakReference** — hold a reference to an object **without** stopping the
  garbage collector from freeing it. Ideal for caches and metadata maps that
  must not keep objects alive on their own.
`,

  comparisons: [
    {
      label: "Narrowing a return type in a subclass",
      intro:
        "A CatShelter subclass of AnimalShelter wants its adopt method to promise it always hands back a Cat, not just any Animal. The goal is for callers to rely on the more specific Cat type without an extra cast.",
      php: `<?php
// PHP 5.5 — no return types exist, so "covariance"
// is just an unenforced docblock promise.
class AnimalShelter {
    /** @return Animal */
    public function adopt() { /* ... */ }
}
class CatShelter extends AnimalShelter {
    /** @return Cat */
    public function adopt() { /* engine checks nothing */ }
}`,
      ts: `<?php
// PHP 7.4 — real, enforced covariant return type.
class AnimalShelter {
    public function adopt(): Animal { /* ... */ }
}
class CatShelter extends AnimalShelter {
    public function adopt(): Cat { /* Cat extends Animal */ }
}`,
      note:
        "Covariant return types arrived in PHP 7.4; before that a typed override had to repeat the parent's return type exactly (invariance).",
    },
    {
      label: "Widening a parameter type in a subclass",
      intro:
        "A SuperFeeder subclass overrides a feed method so it can accept any Animal instead of only the Cat its parent took. The aim is to broaden what the override handles while still satisfying every call the parent supported.",
      php: `<?php
// PHP 5.5 — params are untyped, so widening is invisible.
class Feeder {
    public function feed($cat) { /* ... */ }
}
class SuperFeeder extends Feeder {
    public function feed($animal) { /* anything goes */ }
}`,
      ts: `<?php
// PHP 7.4 — enforced contravariant parameter type.
class Feeder {
    public function feed(Cat $c): void { /* ... */ }
}
class SuperFeeder extends Feeder {
    public function feed(Animal $a): void { /* Animal :> Cat */ }
}`,
      note:
        "Contravariant (wider) parameter types arrived in PHP 7.4; in 7.0–7.3 a typed parameter had to match the parent's type exactly.",
    },
    {
      label: "A cache that must not keep its entry alive",
      intro:
        "A small metadata cache stores one object and lets you read it back later. The goal is for the cache to remember the object only while something else still uses it, so the cache itself never blocks garbage collection.",
      php: `<?php
// PHP 5.5 — a plain property is a strong reference;
// the cached object can never be garbage collected
// while the cache lives.
class MetaCache {
    private $obj;
    public function set($obj) { $this->obj = $obj; }
    public function get() { return $this->obj; }
}`,
      ts: `<?php
// PHP 7.4 — WeakReference lets the GC reclaim the
// object even though the cache still "holds" it.
class MetaCache {
    private ?WeakReference $ref = null;
    public function set(object $obj): void {
        $this->ref = WeakReference::create($obj);
    }
    public function get(): ?object {
        return $this->ref?->get();
    }
}`,
      note:
        "WeakReference arrived in PHP 7.4 (the ?-> nullsafe operator shown here is PHP 8.0); a WeakReference does not stop the object it points at from being collected.",
    },
    {
      label: "Avoiding per-request compilation",
      intro:
        "We want a large app's core files to be compiled just once when the server starts rather than wired up on every incoming request. The payoff is lower per-request startup cost, configured entirely through php.ini and a preload script.",
      php: `<?php
// PHP 5.5 — OPcache (bundled from 5.5) caches compiled
// bytecode, but classes are still wired up per request.
// php.ini:
//   opcache.enable=1`,
      ts: `<?php
// PHP 7.4 — preloading compiles chosen files once at
// startup and keeps them resident for every request.
// php.ini:
//   opcache.preload=/app/preload.php
//
// preload.php:
opcache_compile_file(__DIR__ . '/vendor/autoload.php');`,
      note:
        "opcache.preload arrived in PHP 7.4, building on the OPcache bytecode cache that has shipped (and been on by default) since PHP 5.5.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Covariant returns and contravariant params in action. Read it, predict the output, then reveal.",
    code: `<?php
declare(strict_types=1);

class Animal {
    public function __construct(public string $name) {}
}
class Cat extends Animal {}

class AnimalShelter {
    // Parent promises an Animal.
    public function adopt(): Animal {
        return new Animal('generic');
    }
}

class CatShelter extends AnimalShelter {
    // Covariant return (7.4): narrower than Animal.
    public function adopt(): Cat {
        return new Cat('Whiskers');
    }
}

class Feeder {
    public function feed(Cat $c): string {
        return "fed {$c->name}";
    }
}

class SuperFeeder extends Feeder {
    // Contravariant param (7.4): wider than Cat.
    public function feed(Animal $a): string {
        return "served {$a->name}";
    }
}

$pet = (new CatShelter())->adopt();
echo $pet->name . "\\n";
echo ($pet instanceof Cat ? 'is a Cat' : 'not a Cat') . "\\n";
echo (new SuperFeeder())->feed($pet) . "\\n";`,
    output: `Whiskers
is a Cat
served Whiskers`,
  },

  keyPoints: [
    "**PHP 7.4** introduced covariant return types and contravariant parameter types — overrides no longer have to match the parent's types exactly (invariance).",
    "**Covariant return**: a child may return a *narrower* (more specific) type. **Contravariant param**: a child may accept a *wider* (more general) type. This is the Liskov Substitution Principle.",
    "Reverse the direction (widen a return or narrow a param) and you get a fatal `Declaration must be compatible` error.",
    "**Preloading** (`opcache.preload`, 7.4) compiles chosen files once at startup and keeps them in memory for every request — built on OPcache, which has shipped since 5.5.",
    "**FFI** (7.4) calls C libraries directly via `FFI::cdef()`; great for glue, poor for hot loops.",
    "**WeakReference** (7.4) references an object without keeping it alive — perfect for caches and metadata maps.",
  ],

  interview: [
    {
      q: "Before PHP 7.4, why couldn't a subclass return a more specific type than its parent?",
      a: "Because method signatures were **invariant**: from PHP 7.0 through 7.3 a typed override had to repeat the parent's return and parameter types *exactly*. Even though returning a `Cat` where the parent promised an `Animal` is perfectly sound (a `Cat` *is* an `Animal`), the engine rejected it with a `Declaration must be compatible` error. PHP 7.4 relaxed this to allow **covariant returns** and **contravariant parameters**. In PHP 5.5 the question doesn't even arise — there were no return or scalar parameter types to vary.",
    },
    {
      q: "Explain covariance vs contravariance and which direction each goes.",
      a: "**Covariant return types** mean a child can return a *narrower* (more derived) type than the parent — returns get more specific as you go down the hierarchy. **Contravariant parameter types** mean a child can accept a *wider* (more general) type than the parent — parameters get more general going down. Both preserve the **Liskov Substitution Principle**: any caller written against the parent still works against the child, because the child returns something at least as specific and accepts everything the parent accepted. Both arrived in **PHP 7.4**.",
    },
    {
      q: "What is opcache.preload and how does it differ from ordinary OPcache?",
      a: "Ordinary **OPcache** (bundled and on by default since 5.5) caches the *compiled bytecode* of each file so it isn't recompiled from source on every request — but classes and functions are still linked into each fresh request. **Preloading** (`opcache.preload`, PHP 7.4) goes further: a script runs once at server startup and the files it compiles stay **resident in memory and globally available to every request** without any per-request include or autoload. It's a startup-time win mainly for large frameworks; the trade-off is that changing preloaded files requires a server restart.",
    },
    {
      q: "When would you reach for WeakReference, and what problem does it solve?",
      a: "A normal property is a **strong reference** — it keeps the object alive for as long as the holder lives, so a cache or metadata map can leak memory by pinning objects that nothing else needs. `WeakReference` (PHP 7.4) lets you *point at* an object without stopping the garbage collector from freeing it: once the last strong reference goes away, the object is collected and `WeakReference::get()` returns `null`. It's ideal for side-tables that associate data with objects (caches, observers, identity maps) that must not extend those objects' lifetimes.",
    },
    {
      q: "What is FFI good and bad at?",
      a: "**FFI** (Foreign Function Interface, PHP 7.4) lets you call into shared C libraries directly from PHP via `FFI::cdef()` / `FFI::load()`, with no need to write and compile a C extension. It's great as **glue** for reusing an existing native library. The catch is that each FFI call carries real overhead, so it's a poor fit for tight, hot loops where a purpose-built extension (or pure PHP) would win. Treat it as a convenience for occasional native calls, not a performance accelerator.",
    },
  ],

  quiz: [
    {
      question: "Which PHP version first allowed a subclass method to return a more specific type than its parent?",
      options: ["PHP 5.6", "PHP 7.0", "PHP 7.4", "PHP 8.0"],
      answerIndex: 2,
      explain:
        "Covariant return types (and contravariant parameter types) were introduced in PHP 7.4. From 7.0 through 7.3, typed signatures were invariant and had to match the parent exactly.",
    },
    {
      question: "Which override is allowed under PHP 7.4's variance rules, given `Cat extends Animal`?",
      options: [
        "Parent returns `Cat`; child overrides to return `Animal`",
        "Parent param is `Animal`; child narrows the param to `Cat`",
        "Parent returns `Animal`; child overrides to return `Cat`",
        "Both narrowing a parameter and widening a return type",
      ],
      answerIndex: 2,
      explain:
        "Returns may be made narrower (covariant) and parameters may be made wider (contravariant). Returning a Cat where the parent returned an Animal is covariant and allowed; narrowing a parameter or widening a return is not.",
    },
    {
      question: "What does `WeakReference` (PHP 7.4) let you do?",
      options: [
        "Compile files once at startup so they persist across requests",
        "Reference an object without preventing it from being garbage collected",
        "Call C library functions directly from PHP",
        "Make a property immutable after construction",
      ],
      answerIndex: 1,
      explain:
        "A WeakReference points at an object without holding it alive; once the last strong reference is gone the GC may free it and get() returns null. Preloading is opcache.preload, native calls are FFI, and immutability is readonly (8.1).",
    },
  ],
};

export default lesson;
