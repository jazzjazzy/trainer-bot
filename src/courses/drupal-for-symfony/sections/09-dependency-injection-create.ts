import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "dependency-injection-create",
  title: "Dependency Injection: create() vs Constructor Autowiring",
  part: "Routing, Controllers & Services",
  estMinutes: 12,
  summary:
    "Drupal has the same Symfony container but no autowiring, so container-built classes implement a *Injection*/*FactoryPlugin* interface and pull services in a static create() that hands them to the constructor.",

  concept: `
Drupal runs the **same Symfony DependencyInjection container** you already know
— \`\\Symfony\\Component\\DependencyInjection\\ContainerInterface\`, tagged
services, compiler passes, the lot. What Drupal deliberately does **not** ship
is **autowiring**. In Symfony 6.4/7 you type-hint a constructor and the
container reads the parameter types to figure out what to inject. Drupal's
container is compiled once and cached to PHP; it never reflects on your
constructor. So *you* have to name every service explicitly.

### Why no autowiring?

Drupal classes that come from the container are mostly **plugins** — blocks,
field formatters, field widgets, EntityReference selection handlers — plus
controllers and forms. Plugins are **discovered, enabled and disabled at
runtime** and constructed by *plugin managers*, not by the service container
directly. A plugin instance is built with three positional plugin arguments
(\`\$configuration, \$plugin_id, \$plugin_definition\`) *before* any of your
services. Autowiring can't reconcile that mixed positional signature, so Drupal
uses an explicit factory method instead.

### The two interfaces

- **Controllers and forms** implement
  \`ContainerInjectionInterface\` — one method:
  \`public static function create(ContainerInterface \$container)\`.
- **Plugins** (blocks, formatters, widgets…) implement
  \`ContainerFactoryPluginInterface\` — the create() also receives the three
  plugin args:
  \`create(ContainerInterface \$container, array \$configuration, \$plugin_id, \$plugin_definition)\`.

Both do the same job: read services off \`\$container\`, then \`return new
static(...)\` handing them to the constructor, which stores them on
\`\$this\`. It is the manual, boilerplate version of Symfony autowiring.

### The boilerplate

\`\`\`php
final class ReportController extends ControllerBase implements ContainerInjectionInterface {
  public function __construct(
    protected EntityTypeManagerInterface \$entityTypeManager,
  ) {}

  public static function create(ContainerInterface \$container): static {
    return new static(
      \$container->get('entity_type.manager'),
    );
  }
}
\`\`\`

Compare Symfony, where the constructor *is* the wiring:

\`\`\`php
final class ReportController extends AbstractController {
  public function __construct(
    private EntityManagerInterface \$em, // autowired by type
  ) {}
}
\`\`\`

### Practical notes

- \`ControllerBase\` and \`FormBase\` **already implement**
  \`ContainerInjectionInterface\`, so a subclass only *overrides* create() — and
  since Drupal 10.2 they also use \`AutowireTrait\`, so a controller that omits
  create() has its constructor type-hints resolved from the container. Plugin
  bases such as \`BlockBase\` do **not** implement
  \`ContainerFactoryPluginInterface\` — you add it yourself and write create().
  Forgetting it on a plugin is the classic bug: create() is never called, your
  constructor runs with defaults, and no error is raised.
- Plugin constructors **must** call
  \`parent::__construct(\$configuration, \$plugin_id, \$plugin_definition)\`
  first — those three args are not yours to drop.
- \`return new static(...)\` (late static binding) not \`new self(...)\`, so
  subclasses instantiate correctly.
- Service **IDs are strings** (\`'entity_type.manager'\`, \`'current_user'\`),
  the same IDs you'd reference in a \`*.services.yml\`. There is no
  type-based lookup.
`,

  comparisons: [
    {
      label: "Controller: autowiring vs create()",
      intro:
        "Injecting the entity manager into a controller. Symfony reads the constructor type; Drupal needs an explicit create() factory because the compiled container never reflects on your class.",
      php: `<?php
// Symfony 6.4/7 — autowired by type-hint. No factory method.
namespace App\\Controller;

use Doctrine\\ORM\\EntityManagerInterface;
use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;

final class ReportController extends AbstractController
{
    public function __construct(
        private EntityManagerInterface $em, // container resolves this
    ) {}

    public function list(): Response
    {
        $nodes = $this->em->getRepository(Node::class)->findAll();
        // ...
    }
}`,
      ts: `<?php
// Drupal 10/11 — implement ContainerInjectionInterface + write create().
namespace Drupal\\my_module\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;
use Drupal\\Core\\DependencyInjection\\ContainerInjectionInterface;
use Drupal\\Core\\Entity\\EntityTypeManagerInterface;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;

final class ReportController extends ControllerBase implements ContainerInjectionInterface {

  public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('entity_type.manager'), // service ID string
    );
  }

  public function list(): array {
    $nodes = $this->entityTypeManager->getStorage('node')->loadMultiple();
    // ...
  }
}`,
      note: "Same container underneath — the only difference is Drupal makes YOU name the service ('entity_type.manager') in create() instead of inferring it from the type-hint.",
    },
    {
      label: "Plugin (Block): the four-arg create()",
      intro:
        "A block plugin needs current_user. Plugins are built by a plugin manager with three positional args BEFORE your services, which is exactly why autowiring can't be used here.",
      php: `<?php
// Symfony equivalent conceptually: a service that depends on Security.
// One constructor, autowired, instantiated once by the container.
final class GreetingProvider
{
    public function __construct(
        private Security $security, // autowired
    ) {}

    public function greeting(): string
    {
        $user = $this->security->getUser();
        return 'Hello ' . ($user?->getUserIdentifier() ?? 'guest');
    }
}`,
      ts: `<?php
// Drupal block plugin — ContainerFactoryPluginInterface.
namespace Drupal\\my_module\\Plugin\\Block;

use Drupal\\Core\\Block\\BlockBase;
use Drupal\\Core\\Plugin\\ContainerFactoryPluginInterface;
use Drupal\\Core\\Session\\AccountProxyInterface;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;

#[\\Drupal\\Core\\Block\\Attribute\\Block(
  id: 'greeting_block',
  admin_label: new \\Drupal\\Core\\StringTranslation\\TranslatableMarkup('Greeting'),
)]
final class GreetingBlock extends BlockBase implements ContainerFactoryPluginInterface {

  public function __construct(
    array $configuration, $plugin_id, $plugin_definition,
    protected AccountProxyInterface $currentUser,
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
  }

  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    return new static(
      $configuration, $plugin_id, $plugin_definition,
      $container->get('current_user'),
    );
  }

  public function build(): array {
    return ['#markup' => 'Hello ' . $this->currentUser->getAccountName()];
  }
}`,
      note: "The three plugin args ($configuration, $plugin_id, $plugin_definition) come first and MUST be forwarded to parent::__construct(); your services follow. That mixed positional signature is why plugins can't autowire.",
    },
    {
      label: "The interface is what wires it up",
      intro:
        "Both routing and block config just name the class. Nothing in these files injects anything — the create() factory (triggered by the interface) does. Forget the interface and create() is never called.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony — services.yaml (autowire on) + route attribute.
# services.yaml
services:
  _defaults:
    autowire: true
    autoconfigure: true
  App\\:
    resource: '../src/'

# The route just points at the method; the container builds the
# controller and injects the constructor by type. No factory needed.
# src/Controller/ReportController.php
#   #[Route('/report', name: 'app_report')]
#   public function list(): Response { ... }`,
      ts: `# Drupal — my_module.routing.yml just names the controller::method.
my_module.report:
  path: '/report'
  defaults:
    _controller: 'Drupal\\my_module\\Controller\\ReportController::list'
    _title: 'Report'
  requirements:
    _permission: 'access content'

# Nothing here injects anything. When Drupal builds the controller it
# checks: does the class implement ContainerInjectionInterface?
#   yes -> call ReportController::create($container)
#   no  -> call  new ReportController()   (no services!)
# The interface is the switch that turns create() on.`,
      note: "Routing/plugin config only NAMES the class. The *Injection* interface is the trigger telling Drupal to call create() instead of a bare `new`. Miss the interface and your services are silently null.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "This models Drupal's factory dispatch in plain PHP: a fake container, a plugin that implements the factory interface, and the 'builder' that decides between create() and a bare new — exactly the branch Drupal's plugin manager makes. Predict what prints for the wired vs unwired class.",
    code: `<?php
// A stand-in for Symfony/Drupal's container: service ID => instance.
final class Container {
  private array $services;
  public function __construct(array $services) { $this->services = $services; }
  public function get(string $id): object { return $this->services[$id]; }
}

// A service we want injected.
final class CurrentUser {
  public function name(): string { return 'ada'; }
}

// Drupal's marker interface: "call my static create() factory".
interface ContainerFactoryPluginInterface {
  public static function create(Container $c, array $configuration, string $plugin_id): object;
}

// A block that OPTS IN to injection by implementing the interface.
final class GreetingBlock implements ContainerFactoryPluginInterface {
  public function __construct(
    public array $configuration,
    public string $plugin_id,
    public ?CurrentUser $currentUser = null,
  ) {}
  public static function create(Container $c, array $configuration, string $plugin_id): object {
    return new static($configuration, $plugin_id, $c->get('current_user'));
  }
  public function build(): string {
    $who = $this->currentUser ? $this->currentUser->name() : 'NULL (never injected)';
    return "[{$this->plugin_id}] Hello " . $who;
  }
}

// A block that FORGOT the interface — no create(), so services stay null.
final class BrokenBlock {
  public function __construct(
    public array $configuration,
    public string $plugin_id,
    public ?CurrentUser $currentUser = null,
  ) {}
  public function build(): string {
    $who = $this->currentUser ? $this->currentUser->name() : 'NULL (never injected)';
    return "[{$this->plugin_id}] Hello " . $who;
  }
}

// The plugin manager: the SAME branch Drupal makes when building a plugin.
function buildPlugin(string $class, Container $c, array $config, string $id): object {
  if (is_subclass_of($class, ContainerFactoryPluginInterface::class)) {
    echo "-> {$class}: implements interface, calling create()\\n";
    return $class::create($c, $config, $id);
  }
  echo "-> {$class}: no interface, bare new (services skipped)\\n";
  return new $class($config, $id);
}

$container = new Container(['current_user' => new CurrentUser()]);

$good = buildPlugin(GreetingBlock::class, $container, [], 'greeting_block');
echo $good->build() . "\\n";

$bad = buildPlugin(BrokenBlock::class, $container, [], 'broken_block');
echo $bad->build() . "\\n";`,
    output: `-> GreetingBlock: implements interface, calling create()
[greeting_block] Hello ada
-> BrokenBlock: no interface, bare new (services skipped)
[broken_block] Hello NULL (never injected)`,
  },

  keyPoints: [
    "Drupal uses the same Symfony DI container but ships with autowiring OFF — the compiled container never reflects on your constructor, so you name every service explicitly.",
    "Controllers/forms implement `ContainerInjectionInterface` (create($container)); plugins (blocks, formatters, widgets) implement `ContainerFactoryPluginInterface` (create($container, $configuration, $plugin_id, $plugin_definition)).",
    "create() reads services by string ID off `$container` and does `return new static(...)`, handing them to the constructor, which stores them on `$this` — the manual form of Symfony autowiring.",
    "Plugin constructors take the three plugin args FIRST and must call `parent::__construct($configuration, $plugin_id, $plugin_definition)` before storing your own services.",
    "The interface is the switch: no `ContainerInjectionInterface`/`ContainerFactoryPluginInterface` means create() is never called and your services are silently null.",
    "Use `new static()` (late static binding), not `new self()`, so subclasses build correctly; PHP attribute plugins (D10.2+/D11) don't change any of the create() mechanics.",
  ],

  interview: [
    {
      q: "Coming from Symfony autowiring, why does Drupal make you write a static create() method instead of just type-hinting the constructor?",
      a: "Drupal uses the same Symfony `DependencyInjection` container but disables autowiring: the container is compiled to cached PHP once and never reflects on your constructor at build time, so it can't infer services from parameter types. On top of that, most injectable classes in Drupal are *plugins* — blocks, field formatters, widgets — which are discovered and enabled/disabled at runtime and built by a plugin manager that passes three positional args (`$configuration`, `$plugin_id`, `$plugin_definition`) before any services. That mixed positional signature can't be autowired, so Drupal standardises on an explicit `create($container)` factory that reads services by string ID and calls `new static(...)`. It's more boilerplate than Symfony, but it's deterministic and cache-friendly.",
    },
    {
      q: "What's the difference between ContainerInjectionInterface and ContainerFactoryPluginInterface?",
      a: "Both exist to trigger a static `create()` factory instead of a bare `new`, but they're used in different places. `ContainerInjectionInterface` is for classes the container builds directly — controllers and forms — and its create() takes just `create(ContainerInterface $container)`. `ContainerFactoryPluginInterface` is for plugins built by a plugin manager, so its create() also receives the plugin args: `create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition)`, and the constructor must forward those to `parent::__construct()`. Picking the wrong one for the context means the arguments won't line up.",
    },
    {
      q: "A junior added a service to a block's constructor but it's always null at runtime. What did they forget?",
      a: "Almost certainly the `implements ContainerFactoryPluginInterface` on the class, or they never added the matching `create()`. Drupal's plugin manager only calls create() when the class advertises the interface; otherwise it does a bare `new`, the constructor runs with default (null) values for the injected params, and no error is raised. The fix is to implement the interface and write a create() that pulls the service by ID from `$container` and passes it through — remembering the three plugin args come first and `parent::__construct()` must be called. It fails silently precisely because there's no autowiring to complain.",
    },
  ],

  quiz: [
    {
      question:
        "Why can't a Drupal block plugin rely on constructor autowiring the way a Symfony service can?",
      options: [
        "Drupal blocks are not registered as services at all",
        "Drupal ships the Symfony container but with autowiring disabled, and plugins are built by a plugin manager that passes positional args before any services",
        "Block plugins are instantiated by Twig, which has no container access",
        "Autowiring only works for interfaces, and blocks extend a base class",
      ],
      answerIndex: 1,
      explain:
        "Drupal uses the same Symfony DI container but leaves autowiring off, so it never infers services from type-hints. Plugins are also built by a plugin manager that supplies $configuration, $plugin_id and $plugin_definition positionally before your services — a signature autowiring can't resolve — so an explicit create() factory is required.",
    },
    {
      question:
        "What is the correct create() signature for a plugin implementing ContainerFactoryPluginInterface?",
      options: [
        "public static function create(ContainerInterface $container)",
        "public function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition)",
        "public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition)",
        "public static function create(array $configuration, ContainerInterface $container)",
      ],
      answerIndex: 2,
      explain:
        "Plugin create() must be static and take the container plus the three plugin args: create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition). The one-arg static form is ContainerInjectionInterface, used by controllers and forms, not plugins.",
    },
    {
      question:
        "In create() you write `return new static(...)` rather than `new self(...)`. Why?",
      options: [
        "self is not valid inside a static method",
        "static uses late static binding so a subclass instantiates itself, not the parent class",
        "new self() would bypass the container",
        "There is no practical difference; both are accepted by Drupal coding standards",
      ],
      answerIndex: 1,
      explain:
        "`new static()` resolves to the actual called class via late static binding, so a subclass of your plugin/controller is constructed correctly. `new self()` would hard-code the class where the method is defined, breaking inheritance.",
    },
  ],
};

export default lesson;
