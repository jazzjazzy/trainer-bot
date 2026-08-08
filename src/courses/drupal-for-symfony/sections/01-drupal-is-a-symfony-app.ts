import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "drupal-is-a-symfony-app",
  title: "Drupal Is a Symfony App (and Where It Diverges)",
  part: "Foundations & Mental Model",
  estMinutes: 12,
  summary:
    "Drupal 10/11 runs on the same Symfony components you already know, but wraps them in an opinionated CMS product with its own entity, plugin, hook, and config layers you must learn.",

  concept: `
If you open a Drupal 10 or 11 codebase and run \`composer show\`, you will see
old friends: \`symfony/http-foundation\`, \`symfony/http-kernel\`,
\`symfony/routing\`, \`symfony/event-dispatcher\`,
\`symfony/dependency-injection\`, \`symfony/serializer\`,
\`symfony/validator\`, and \`symfony/console\`. Drupal did not reinvent the HTTP
stack — it **consumes the Symfony components**, the same ones that sit under a
Symfony application you would build by hand.

### Same engine, different vehicle

The mental shift is this: **Symfony is a framework you assemble; Drupal is a
finished product built on those components.** In Symfony you wire up your own
kernel, controllers, and services to build exactly the app you want. Drupal has
already made those decisions and shipped a content management system — you
extend it rather than assemble it.

- **Drupal 11** requires Symfony 7 components and PHP 8.3+.
- **Drupal 10** (10.3+) runs on Symfony 6.4 LTS and PHP 8.1+.

For everything in this course the two versions are effectively identical; I will
flag the rare differences.

### The request lifecycle you already know

Drupal's \`DrupalKernel\` implements Symfony's \`HttpKernelInterface\` and
delegates request handling to Symfony's \`HttpKernel\` (the \`http_kernel\`
service), which dispatches \`kernel.request\`/\`kernel.response\`. A request flows
the same way you expect:

1. \`index.php\` builds a \`Request\` from \`symfony/http-foundation\`.
2. The kernel dispatches \`kernel.request\`; Drupal's router (built on
   \`symfony/routing\`) matches a route from a module's \`*.routing.yml\`.
3. The matched \`_controller\` is invoked and returns either a Symfony
   \`Response\` **or** — the Drupal-specific twist — a **render array**, a
   nested PHP array describing the page that the theme layer turns into HTML.
4. \`kernel.response\` / \`kernel.terminate\` fire, exactly like Symfony.

Console commands are the one place tooling diverges: instead of
\`bin/console\`, Drupal developers use **Drush** (\`drush cr\`, \`drush cim\`),
which is itself a \`symfony/console\` application.

### What Drupal stacks on top

The Symfony components are the foundation; the CMS lives in the layers above
them, and these are what you actually spend your days learning:

- **Entities & Fields** — a structured content model (nodes, users, taxonomy)
  far richer than plain Doctrine entities.
- **Plugins** — Drupal's own swappable-component system with managers and
  discovery, overlapping conceptually with Symfony's tagged services.
- **Hooks** — a procedural extension mechanism (\`hook_form_alter\`) that has no
  Symfony equivalent; think "events, but by naming convention."
- **Configuration management** — YAML config with import/export
  (\`drush cim\`/\`cex\`), a layer above \`symfony/config\`.

### Why it matters

Because the plumbing is Symfony, your \`Request\`/\`Response\` knowledge,
dependency-injection instincts, and event-dispatcher mental model transfer
directly. But you cannot treat Drupal like a bare Symfony app: reaching for a
controller when Drupal expects a render array, or writing a service when the
task calls for a hook, is the classic ex-Symfony mistake. Learn the Symfony
underneath — then learn the four opinionated layers on top.
`,

  comparisons: [
    {
      label: "Composer dependencies: assembling vs. inheriting Symfony",
      intro:
        "A Symfony app pulls in the components you choose; a Drupal site inherits them transitively through drupal/core-recommended. The same package names appear in both vendor/ trees.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony 7 app — composer.json (you pick the components)
{
  "require": {
    "php": ">=8.2",
    "symfony/framework-bundle": "7.1.*",
    "symfony/http-foundation": "7.1.*",
    "symfony/routing": "7.1.*",
    "symfony/event-dispatcher": "7.1.*",
    "doctrine/orm": "^3.0"
  }
}`,
      ts: `# Drupal 11 site — composer.json (core pulls Symfony in for you)
{
  "require": {
    "php": ">=8.3",
    "drupal/core-recommended": "^11.0",
    "drush/drush": "^13.0"
  }
}
# vendor/symfony/ still contains http-foundation, http-kernel,
# routing, event-dispatcher, dependency-injection, serializer,
# validator and console — declared by drupal/core, not by you.`,
      note:
        "Drupal 11 requires Symfony 7 components; Drupal 10.3+ uses Symfony 6.4 LTS. You rarely name Symfony packages directly — core owns those version constraints.",
    },
    {
      label: "Defining a route: attributes/YAML controller vs. *.routing.yml",
      intro:
        "Both frameworks map a URL to a controller method. Symfony 7 favours PHP attributes on the controller; Drupal declares routes in a module's *.routing.yml and points at a controller class::method string.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony — config/routes or #[Route] attribute
# src/Controller/ReportController.php
#[Route('/report/{id}', name: 'app_report', methods: ['GET'])]
public function view(int $id): Response
{
    return new Response('Report ' . $id);
}
# Access control via #[IsGranted] or security.yaml`,
      ts: `# Drupal — my_module.routing.yml
my_module.report:
  path: '/report/{id}'
  defaults:
    _controller: '\\Drupal\\my_module\\Controller\\ReportController::view'
    _title: 'Report'
  requirements:
    _permission: 'access content'
  methods: [GET]`,
      note:
        "Drupal routing keys: `defaults._controller` (class::method), `defaults._title`, and `requirements._permission`/`_access`/`_custom_access` for authorization — the router is symfony/routing underneath.",
    },
    {
      label: "Dependency injection: services.yaml vs. *.services.yml + create()",
      intro:
        "Both use symfony/dependency-injection with a YAML service file. Symfony autowires constructors; Drupal supports autowiring too, but controllers classically inject via a static create() factory from the container.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony — config/services.yaml (autowire by default)
services:
  _defaults:
    autowire: true
    autoconfigure: true
  App\\:
    resource: '../src/'

# Controller just type-hints; Symfony injects:
public function __construct(
  private LoggerInterface $logger,
) {}`,
      ts: `# Drupal — my_module.services.yml
services:
  _defaults:
    autowire: true
    autoconfigure: true
  my_module.report_builder:
    class: Drupal\\my_module\\ReportBuilder
    arguments: ['@entity_type.manager', '@logger.factory']

# ControllerBase subclass, classic factory style:
public static function create(ContainerInterface $container) {
  return new static($container->get('my_module.report_builder'));
}`,
      note:
        "Autowiring landed in Drupal core services too, but core controllers/plugins still commonly use the explicit `create(ContainerInterface $container)` factory — the same container, a different idiom.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Drupal's DrupalKernel delegates to a Symfony HttpKernel that dispatches a kernel.request event before matching a route. This pure-PHP model wires three listeners to an event and resolves a controller — the exact shape of the real lifecycle, minus the site. Predict the printed order before running.",
    code: `<?php
// A miniature of Drupal's Symfony-based kernel: listeners fire on
// 'kernel.request' by priority (high first), then the router matches
// a route from a *.routing.yml-style array and calls its _controller.

class EventDispatcher {
    private array $listeners = [];
    public function on(string $event, callable $cb, int $priority = 0): void {
        $this->listeners[$event][] = ['cb' => $cb, 'p' => $priority];
    }
    public function dispatch(string $event, array &$ctx): void {
        $l = $this->listeners[$event] ?? [];
        usort($l, fn($a, $b) => $b['p'] <=> $a['p']); // high priority first
        foreach ($l as $entry) {
            ($entry['cb'])($ctx);
        }
    }
}

// Modules' *.routing.yml, modelled as a route table.
$routes = [
    'my_module.report' => [
        'path' => '/report',
        '_controller' => 'ReportController::view',
        '_permission' => 'access content',
    ],
];

$dispatcher = new EventDispatcher();
$dispatcher->on('kernel.request', function (&$ctx) {
    echo "listener: authentication\\n";
    $ctx['user'] = 'editor';
}, 300);
$dispatcher->on('kernel.request', function (&$ctx) use ($routes) {
    echo "listener: router matches '{\$ctx['path']}'\\n";
    foreach ($routes as $name => $r) {
        if ($r['path'] === $ctx['path']) {
            $ctx['route'] = $name;
            $ctx['_controller'] = $r['_controller'];
        }
    }
}, 200);
$dispatcher->on('kernel.request', function (&$ctx) {
    echo "listener: access check ({\$ctx['user']})\\n";
    $ctx['allowed'] = true;
}, 100);

// index.php builds a Request, kernel dispatches, controller returns
// a render array (a nested PHP array), theme layer echoes it.
$ctx = ['path' => '/report'];
$dispatcher->dispatch('kernel.request', $ctx);

echo "resolved route: {\$ctx['route']} -> {\$ctx['_controller']}\\n";

$renderArray = ['#markup' => 'Report for ' . $ctx['user']];
echo "response: " . $renderArray['#markup'] . "\\n";
`,
    output: `listener: authentication
listener: router matches '/report'
listener: access check (editor)
resolved route: my_module.report -> ReportController::view
response: Report for editor`,
  },

  keyPoints: [
    "Drupal 10/11 is built on the same Symfony components you know: HttpFoundation, HttpKernel, Routing, EventDispatcher, DependencyInjection, Serializer, Validator, and Console.",
    "DrupalKernel implements Symfony's HttpKernelInterface and delegates to Symfony's HttpKernel (the http_kernel service), so the kernel.request/response lifecycle and Request/Response objects transfer directly from Symfony.",
    "Mental model: Symfony is a framework you assemble; Drupal is a finished CMS product built on those components that you extend instead.",
    "Drupal 11 needs Symfony 7 + PHP 8.3; Drupal 10.3+ uses Symfony 6.4 LTS + PHP 8.1 — nearly identical for everything in this course.",
    "The Drupal-specific layers stacked on top — entities/fields, plugins, hooks, and configuration management — are what you actually spend your time learning.",
    "Controllers may return a Symfony Response or a Drupal render array; console tooling is Drush (a symfony/console app), not bin/console.",
  ],

  interview: [
    {
      q: "Is Drupal a Symfony application? How would you explain the relationship to a team lead?",
      a: "Drupal is not a Symfony application in the `symfony/framework-bundle` sense, but it is **built on Symfony components**. Core depends on `symfony/http-foundation`, `http-kernel`, `routing`, `event-dispatcher`, `dependency-injection`, `serializer`, `validator`, and `console`, and `DrupalKernel` implements Symfony's `HttpKernelInterface`, delegating request handling to Symfony's `HttpKernel` service. The distinction I'd draw is product-vs-framework: Symfony gives you parts to assemble your own app, whereas Drupal has already assembled those parts into an opinionated CMS with entities, plugins, hooks, and config management layered on top. So my Symfony knowledge of the request lifecycle and DI carries over, but the CMS layers are new surface area to learn.",
    },
    {
      q: "Trace what happens between the browser request and the response in Drupal, mapping it to Symfony.",
      a: "It's the Symfony `HttpKernel` flow. `index.php` builds a `Request` from `symfony/http-foundation`, then `DrupalKernel::handle()` delegates to the `http_kernel` service (Symfony's `HttpKernel`), which dispatches `kernel.request`. Listeners run by priority — authentication, then the router (`symfony/routing`) matching a route from a module's `*.routing.yml`, then access checks against the route's `_permission`/`_access` requirement. The matched `_controller` runs and returns either a Symfony `Response` or a **render array**, a nested PHP array the theme/render layer converts to HTML. Then `kernel.response` and `kernel.terminate` fire, identical to Symfony. The render array is the main divergence a Symfony dev needs to internalize.",
    },
    {
      q: "Which of your Symfony skills transfer to Drupal, and which Drupal-specific concepts must you still learn?",
      a: "Transferable: the `Request`/`Response` objects, the event dispatcher and kernel events, the service container and dependency injection (Drupal now supports autowiring in `*.services.yml`), YAML routing, and the validator/serializer components. What's genuinely new is the CMS layer: the **entity and field** content model, the **plugin** system with its managers and discovery (now often defined with PHP attributes since Drupal 10.2/11), **hooks** as a procedural alter mechanism with no Symfony analogue, and **configuration management** with `drush cim`/`cex`. Tooling shifts too — `drush` replaces `bin/console`, though Drush is itself a `symfony/console` app.",
    },
  ],

  quiz: [
    {
      question:
        "Which statement most accurately describes Drupal 11's relationship to Symfony?",
      options: [
        "Drupal reimplements the HTTP stack from scratch and shares no code with Symfony",
        "Drupal is generated by the Symfony framework-bundle skeleton with a CMS bundle installed",
        "Drupal consumes Symfony components (HttpKernel, Routing, EventDispatcher, DI, etc.) and layers a CMS on top of them",
        "Drupal only uses Symfony's Console component and nothing else",
      ],
      answerIndex: 2,
      explain:
        "Drupal core depends on many Symfony components and DrupalKernel delegates to Symfony's HttpKernel (the http_kernel service), but it is a finished CMS product built on top of them — not the framework-bundle skeleton and not a from-scratch reimplementation.",
    },
    {
      question:
        "In a Drupal module, where do you declare that the path /report maps to ReportController::view, and how is authorization expressed?",
      options: [
        "In config/routes.yaml, with access controlled by security.yaml firewalls",
        "In my_module.routing.yml, with defaults._controller and requirements._permission",
        "With a #[Route] attribute on the controller and #[IsGranted] for access",
        "In services.yml, tagging the controller as a route provider",
      ],
      answerIndex: 1,
      explain:
        "Drupal routes live in *.routing.yml. `defaults._controller` names the class::method (and `defaults._title` the page title), while `requirements._permission`/`_access`/`_custom_access` express authorization. The router itself is symfony/routing.",
    },
    {
      question:
        "A Symfony developer expects a controller to return a Response. What can a Drupal controller return instead, and what handles it?",
      options: [
        "Only a plain string, which Drupal wraps in a Response automatically",
        "A render array — a nested PHP array — which the theme/render layer turns into HTML",
        "A Twig template object that Symfony renders directly",
        "A Doctrine entity that is serialized to JSON by default",
      ],
      answerIndex: 1,
      explain:
        "Drupal controllers may return a Symfony Response, but idiomatically they return a render array: a nested associative array (e.g. with #markup or #theme keys) that Drupal's render pipeline converts to HTML. This is the main lifecycle divergence from a bare Symfony app.",
    },
  ],
};

export default lesson;
