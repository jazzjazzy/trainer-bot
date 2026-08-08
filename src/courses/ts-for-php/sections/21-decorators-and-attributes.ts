import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "decorators-and-attributes",
  title: "Decorators & PHP 8 Attributes",
  part: "Object-Oriented TypeScript",
  estMinutes: 14,
  summary:
    "TypeScript decorators look exactly like PHP 8 attributes, but where attributes are passive metadata you read via Reflection, decorators actually run and can rewrite the thing they annotate.",

  concept: `
PHP 8 gave you **attributes** — \`#[Route('/users')]\` above a method, read later
via the Reflection API. TypeScript's **decorators** use the near-identical
\`@Route('/users')\` syntax, so they *feel* familiar. The trap is assuming they
behave the same. They don't: attributes are inert until something reflects on
them; decorators are **functions that execute** and can wrap, replace, or augment
their target.

### What a decorator is

A decorator is just a function you attach with \`@\` to a **class, method,
accessor, getter/setter, or property (field)**. At the moment the class is
defined, the runtime *calls* your decorator function, handing it the target.
Your function can log, register, validate, or even return a **replacement**.
(Note: the TC39 *standard* decorators shown here do **not** support **parameter**
decorators — those exist only under the experimental/legacy flavour.)

\`\`\`typescript
// Real decorator syntax (needs compiler config to run):
function logged(target: any, ctx: ClassMethodDecoratorContext) {
  return function (this: any, ...args: any[]) {
    console.log(\`calling \${String(ctx.name)}\`);
    return target.apply(this, args);
  };
}

class Api {
  @logged
  fetchUser(id: number) { return { id }; }
}
\`\`\`

### Where you'll meet them

You rarely *write* decorators early on — you *consume* framework ones:

- **NestJS** — \`@Controller()\`, \`@Get()\`, \`@Injectable()\` (very Symfony-like).
- **Angular** — \`@Component()\`, \`@Input()\`.
- **TypeORM / MikroORM** — \`@Entity()\`, \`@Column()\` (like Doctrine attributes).

### Two flavours — know which one you're in

- **Experimental (legacy) decorators**: the original design, enabled with
  \`"experimentalDecorators": true\`. NestJS, Angular and TypeORM still rely on
  these, usually paired with \`reflect-metadata\`.
- **TC39 standard decorators**: the official ECMAScript proposal, default in
  TypeScript 5+. Different signature (a \`context\` object), no \`reflect-metadata\`.

> Both need a build step that understands decorators — they are **not** plain
> JavaScript yet. That's why the playground below uses a plain higher-order
> function instead.
`,

  comparisons: [
    {
      label: "The syntax: attribute vs decorator",
      intro:
        "Annotate a controller method so it answers GET /users. Both sides put the routing info right above the method, and at first glance the two look interchangeable.",
      php: `<?php
#[Route('/users', methods: ['GET'])]
public function index(): Response { /* ... */ }`,
      ts: `@Get('/users')
index(): Response { /* ... */ }`,
      note:
        "Visually twins. But #[Route] just sits there as metadata; @Get is a function that runs when the class is defined.",
    },
    {
      label: "Passive metadata vs active execution",
      intro:
        "Trace when the route annotation actually does something. Watch where the work happens: the PHP version only reacts when you reflect on it, while the TS version fires on its own as the class is defined.",
      php: `<?php
// PHP: nothing happens until YOU reflect on it.
$ref = new ReflectionMethod($controller, 'index');
$attrs = $ref->getAttributes(Route::class);
$route = $attrs[0]->newInstance(); // built on demand`,
      ts: `// TS: the decorator runs automatically at class definition.
function Get(path: string) {
  return function (target: any, ctx: ClassMethodDecoratorContext) {
    console.log(\`registered route \${path}\`); // runs immediately
  };
}`,
      note:
        "PHP attributes are inert data you opt to read. TS decorators self-execute the moment the class loads.",
    },
    {
      label: "Wrapping / replacing the target",
      intro:
        "Cache an expensive report method by annotating it. The goal is for repeat calls to skip the work, and the two sides differ on whether the annotation alone can deliver that.",
      php: `<?php
// A PHP attribute CANNOT change the method it sits on.
#[Cached(ttl: 60)]
public function report(): array { /* ... */ }
// Caching only happens if a framework reads the attribute
// and builds a wrapper proxy itself.`,
      ts: `// A TS decorator CAN return a replacement function.
function cached(ttl: number) {
  return function (orig: any, _ctx: ClassMethodDecoratorContext) {
    let store: any;
    return function (this: any, ...args: any[]) {
      return store ??= orig.apply(this, args); // wraps in place
    };
  };
}`,
      note:
        "This is the real power gap: a decorator can swap out the target; an attribute is powerless on its own.",
    },
    {
      label: "Class-level annotation",
      intro:
        "Map a User class to a database table the way an ORM expects, stacking entity, table, and column annotations. Both Doctrine and TypeORM let you describe the schema this way, so the markup lines up almost one-to-one.",
      php: `<?php
#[Entity]
#[Table('users')]
class User {
    #[Column(type: 'string')]
    public string $name;
}`,
      ts: `@Entity()
@Table('users')
class User {
  @Column({ type: 'string' })
  name!: string;
}`,
      note:
        "Same stacking style. Doctrine reads the attributes via Reflection; TypeORM's decorators register the schema as they execute.",
    },
  ],

  playground: {
    intro:
      "Real @decorator syntax needs compiler config, so here is the pattern WITHOUT magic: a higher-order function that wraps another function to add logging. This is exactly what a method decorator does under the hood — and it runs right now.",
    code: `// A "decorator" is just a function that takes a function
// and returns an enhanced version of it.
function withLogging<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => R,
): (...args: A) => R {
  return (...args: A): R => {
    console.log(\`-> \${name}(\${args.join(", ")})\`);
    const result = fn(...args);
    console.log(\`<- \${name} returned \${JSON.stringify(result)}\`);
    return result;
  };
}

// The original, undecorated function:
function add(a: number, b: number): number {
  return a + b;
}

// "Decorate" it — wrap to add behaviour without touching add():
const loggedAdd = withLogging("add", add);

console.log("Result:", loggedAdd(2, 3));

// Same trick on another function — fully reusable:
const loggedGreet = withLogging("greet", (name: string) => \`Hi \${name}\`);
console.log("Result:", loggedGreet("Ada"));`,
  },

  keyPoints: [
    "TS decorators and PHP 8 attributes share the `@`/`#[]` look but differ in **power**.",
    "PHP attributes are **passive metadata** — inert until read via the **Reflection API**.",
    "TS decorators are **functions that execute** at class-definition time and can **wrap or replace** the target.",
    "You mostly **consume** decorators from frameworks: NestJS, Angular, TypeORM.",
    "Two flavours: **experimental** (`experimentalDecorators`, used by NestJS/Angular/TypeORM) vs **TC39 standard** (default in TS 5+).",
    "Decorators need a **build step** — they are not yet plain runnable JavaScript.",
  ],

  interview: [
    {
      q: "PHP 8 has attributes and TypeScript has decorators. Are they the same thing?",
      a: "They share syntax and intent — annotating code — but differ fundamentally. **PHP attributes are passive metadata**: `#[Route('/x')]` does nothing on its own; a framework must read it via the **Reflection API** (`getAttributes()`, `newInstance()`) and act on it. **TypeScript decorators are active functions**: `@Route('/x')` *runs* when the class is defined and can register routes, validate, or even **return a replacement** for the method it decorates. Same look, more power — and more potential for surprising side effects.",
    },
    {
      q: "What's the difference between experimental decorators and the new standard decorators?",
      a: "**Experimental (legacy) decorators** are the original TypeScript design, enabled with `\"experimentalDecorators\": true` in `tsconfig.json`, usually paired with the `reflect-metadata` package so the decorator can inspect parameter types. NestJS, Angular and TypeORM are built on these. **TC39 standard decorators** are the official ECMAScript proposal, the default in TypeScript 5+. They use a different signature — the decorator receives a `context` object describing the target (its `kind`, `name`, `addInitializer`) — and don't depend on `reflect-metadata`. Migration matters because the two are not source-compatible.",
    },
    {
      q: "Can a decorator change the behaviour of the method it's attached to?",
      a: "Yes — that's the headline difference from PHP attributes. A method decorator receives the original function and can **return a new function** that wraps it: add logging, memoisation, access checks, retries, then call (or skip) the original. The class ends up using the returned version. A PHP attribute can't do this; the method only changes if separate framework code reads the attribute and builds a proxy itself.",
    },
    {
      q: "Where would an ex-PHP developer realistically encounter decorators first?",
      a: "Almost certainly in a **framework**, not hand-written. **NestJS** will feel like Symfony: `@Controller('users')`, `@Get(':id')`, `@Injectable()` for dependency injection. **TypeORM** mirrors Doctrine: `@Entity()`, `@Column()`, `@ManyToOne()`. **Angular** uses `@Component()` and `@Input()`. You consume these long before you write your own, just as you used Doctrine attributes before authoring custom ones.",
    },
  ],

  quiz: [
    {
      question:
        "What is the key behavioural difference between a PHP 8 attribute and a TypeScript decorator?",
      options: [
        "They are identical; only the syntax (#[] vs @) differs",
        "PHP attributes run automatically; TS decorators must be read via Reflection",
        "PHP attributes are passive metadata; TS decorators are functions that execute and can modify the target",
        "TS decorators only work on classes, while PHP attributes work anywhere",
      ],
      answerIndex: 2,
      explain:
        "PHP attributes are inert until read via the Reflection API. TS decorators are functions that run at class-definition time and can wrap or replace what they annotate.",
    },
    {
      question:
        "Which setting enables the original (legacy) decorators that NestJS, Angular and TypeORM rely on?",
      options: [
        '"experimentalDecorators": true',
        '"strict": true',
        '"useDefineForClassFields": false',
        '"target": "ES2022"',
      ],
      answerIndex: 0,
      explain:
        '"experimentalDecorators": true turns on the legacy decorator design, typically alongside reflect-metadata. TC39 standard decorators are the default in TS 5+ and need no such flag.',
    },
    {
      question:
        "In the playground, what does withLogging('add', add) return?",
      options: [
        "The result of calling add immediately",
        "A new function that logs around add and returns add's result when called",
        "Nothing — it only logs as a side effect",
        "The string 'add'",
      ],
      answerIndex: 1,
      explain:
        "withLogging is a higher-order function: it returns a wrapper function. Calling that wrapper logs the inputs, invokes the original add, logs the output, and returns the result — exactly how a method decorator augments behaviour.",
    },
  ],
};

export default lesson;
