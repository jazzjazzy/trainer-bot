import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "everyday-services",
  title: "Services You Will Actually Use",
  part: "Extending Drupal",
  estMinutes: 13,
  summary:
    "A practical tour of the ten or so core services you reach for daily — entity_type.manager, current_user, config.factory, messenger, the logger, route match, request_stack and friends — and how to inject each properly instead of reaching for \\Drupal::service().",

  concept: `
By now you know Drupal runs the Symfony container but with autowiring off by
default — core services and controllers list arguments explicitly, so you name
services by **string ID** in a static \`create()\`. (You *can* opt in per service
with \`autowire: true\` since Drupal 9.2, but the convention is to name every
argument.) This section is the cheat-sheet: the handful of core services you'll
type from memory within a week, and their Symfony counterparts.

### The two ways to get a service

There is a static shortcut, \`\\Drupal::service('id')\`, and there is proper
constructor injection. The rule mirrors Symfony exactly: **inject in classes,
use the static helper only in procedural code** (\`.module\` hooks, \`.install\`
files) where you have no container-built object to inject into. Reaching for
\`\\Drupal::service()\` inside a controller or plugin is the Drupal equivalent of
calling a global \`$container\` in a Symfony service — it works, it's untestable,
and reviewers will flag it.

### The daily ten

| Service ID | Interface | Symfony analogue |
|---|---|---|
| \`entity_type.manager\` | EntityTypeManagerInterface | Doctrine EntityManager / repositories |
| \`current_user\` | AccountProxyInterface | Security / \`getUser()\` |
| \`config.factory\` | ConfigFactoryInterface | bound params / \`ParameterBagInterface\` |
| \`messenger\` | MessengerInterface | \`addFlash()\` on AbstractController |
| \`logger.factory\` | LoggerChannelFactoryInterface | \`LoggerInterface\` (Monolog) |
| \`current_route_match\` | RouteMatchInterface | \`Request->attributes\` / \`_route\` |
| \`request_stack\` | RequestStack (Symfony!) | the identical Symfony service |
| \`date.formatter\` | DateFormatterInterface | IntlDateFormatter / Twig \`date\` |
| \`cache.default\` | CacheBackendInterface | \`CacheInterface\` (PSR-6/Contracts) |
| \`module_handler\` | ModuleHandlerInterface | \`Kernel::getBundles()\` + events |
| \`string_translation\` | TranslationInterface | \`TranslatorInterface\` |

A few notes that trip up Symfony developers:

- **\`current_user\` is an AccountProxy, not a User entity.** It answers
  \`id()\`, \`getAccountName()\`, \`hasPermission('...')\` and \`isAnonymous()\`.
  To get the full user entity you load it:
  \`\$entityTypeManager->getStorage('user')->load(\$account->id())\`.
- **\`logger.factory\` is a factory.** You call \`->get('my_module')\` to get a
  PSR-3 channel, then log with placeholders:
  \`\$logger->error('No node @id', ['@id' => \$id])\`. In a service you usually
  inject \`logger.channel.my_module\` directly instead of the factory.
- **\`request_stack\` is literally the Symfony service.** Drupal registers
  \`Symfony\\Component\\HttpFoundation\\RequestStack\` under that ID; call
  \`->getCurrentRequest()\`. Prefer \`current_route_match\` for reading upcasted
  route parameters — it returns the loaded entity, not a raw string.
- **\`string_translation\` is rarely injected by hand.** Use the
  \`StringTranslationTrait\` and call \`\$this->t('Hello')\`; the trait pulls the
  service for you, the same way \`AbstractController\` gives you helpers in
  Symfony.

### Injecting them

The mechanics are identical for every service: type-hint the constructor, then
list the ID in \`create()\`. The only skill is memorising the IDs — the table
above covers the vast majority of real modules.
`,

  comparisons: [
    {
      label: "Static shortcut vs injection",
      intro:
        "Grabbing the current user two ways. Both compile, but the static call hides the dependency and can't be mocked — exactly like calling a global container in Symfony.",
      php: `<?php
// Symfony — you would NEVER reach for a global container in a service.
// The type-hinted constructor IS the dependency; the container fills it.
final class ProfileService
{
    public function __construct(
        private Security $security, // injected, mockable in tests
    ) {}

    public function greeting(): string
    {
        $user = $this->security->getUser();
        return 'Hi ' . ($user?->getUserIdentifier() ?? 'guest');
    }
}`,
      ts: `<?php
// Drupal — the discouraged static shortcut...
namespace Drupal\\my_module\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;

final class ProfileController extends ControllerBase {
  public function page(): array {
    // \\Drupal::currentUser() wraps \\Drupal::service('current_user').
    // Works, but hidden dependency + untestable. Avoid inside classes.
    $account = \\Drupal::currentUser();
    return ['#markup' => 'Hi ' . $account->getAccountName()];
  }
}`,
      note: "\\Drupal::service()/\\Drupal::currentUser() is only acceptable in procedural code (.module, .install). Inside a class it's the anti-pattern equivalent of a Symfony service pulling from a global container.",
    },
    {
      label: "Injecting the daily services",
      intro:
        "Proper DI in a controller: entity storage, current user, config and messenger, all named by string ID in create(). This is the shape you'll copy into almost every class.",
      php: `<?php
// Symfony — all autowired by type-hint.
final class DashboardController extends AbstractController
{
    public function __construct(
        private EntityManagerInterface $em,
        private Security $security,
        private ParameterBagInterface $params,
    ) {}

    public function index(): Response
    {
        $limit = $this->params->get('dashboard.limit');
        $this->addFlash('status', 'Loaded');
        // ...
    }
}`,
      ts: `<?php
namespace Drupal\\my_module\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;
use Drupal\\Core\\Config\\ConfigFactoryInterface;
use Drupal\\Core\\Entity\\EntityTypeManagerInterface;
use Drupal\\Core\\Messenger\\MessengerInterface;
use Drupal\\Core\\Session\\AccountProxyInterface;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;

final class DashboardController extends ControllerBase {

  public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
    protected AccountProxyInterface $currentUser,
    protected ConfigFactoryInterface $configFactory,
    protected MessengerInterface $messenger,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('entity_type.manager'),
      $container->get('current_user'),
      $container->get('config.factory'),
      $container->get('messenger'),
    );
  }

  public function index(): array {
    $limit = $this->configFactory->get('my_module.settings')->get('limit');
    $nodes = $this->entityTypeManager->getStorage('node')
      ->loadByProperties(['status' => 1]);
    $this->messenger->addStatus($this->t('Loaded @n items', ['@n' => count($nodes)]));
    return ['#markup' => 'Hi ' . $this->currentUser->getAccountName()];
  }
}`,
      note: "config.factory->get('x.settings')->get('key') replaces Symfony bound parameters; messenger->addStatus() is addFlash('status', ...); current_user is an AccountProxy, so getAccountName()/hasPermission(), not a User entity.",
    },
    {
      label: "Logging and reading the request",
      intro:
        "The logger is a factory you call ->get(channel) on, and request_stack is the very same Symfony service. For route params, prefer current_route_match — it hands you the upcasted entity.",
      php: `<?php
// Symfony — a PSR-3 LoggerInterface and RequestStack, both autowired.
final class OrderController extends AbstractController
{
    public function __construct(
        private LoggerInterface $logger,
        private RequestStack $requestStack,
    ) {}

    public function show(Order $order): Response // upcast by ParamConverter
    {
        $ref = $this->requestStack->getCurrentRequest()->query->get('ref');
        $this->logger->info('Viewing order {id}', ['id' => $order->getId()]);
        // ...
    }
}`,
      ts: `<?php
namespace Drupal\\my_module\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;
use Drupal\\Core\\Routing\\RouteMatchInterface;
use Psr\\Log\\LoggerInterface;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;
use Symfony\\Component\\HttpFoundation\\RequestStack;

final class OrderController extends ControllerBase {

  public function __construct(
    protected LoggerInterface $logger,          // a channel, not the factory
    protected RequestStack $requestStack,       // Symfony's own service
    protected RouteMatchInterface $routeMatch,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      // ->get('logger.factory')->get('my_module') is the factory form;
      // 'logger.channel.my_module' would need a services.yml declaration.
      $container->get('logger.factory')->get('my_module'),
      $container->get('request_stack'),
      $container->get('current_route_match'),
    );
  }

  public function show(): array {
    // Upcasted param: the loaded Node entity, not a raw '42' string.
    $node = $this->routeMatch->getParameter('node');
    $ref = $this->requestStack->getCurrentRequest()->query->get('ref');
    $this->logger->info('Viewing node @id', ['@id' => $node->id()]);
    return ['#markup' => 'ref=' . $ref];
  }
}`,
      note: "Drupal log placeholders use @/%/: (@id), not {curly} like Monolog. request_stack is byte-for-byte the Symfony service; current_route_match->getParameter() returns the upcasted entity, so reach for it over raw request attributes.",
    },
    {
      label: "Declaring your own service that uses these",
      intro:
        "When you write a *.services.yml service (not a controller), you list arguments by ID with a leading @ — the YAML equivalent of Symfony's arguments, just with autowiring off by default so, by convention, every arg is explicit.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony services.yaml — autowire fills these in by type.
services:
  _defaults:
    autowire: true
  App\\Report\\ReportBuilder:
    # No arguments needed; EntityManager + LoggerInterface
    # are resolved from the constructor type-hints.
    ~`,
      ts: `# Drupal my_module.services.yml — every argument named explicitly.
services:
  my_module.report_builder:
    class: Drupal\\my_module\\ReportBuilder
    arguments:
      - '@entity_type.manager'
      - '@config.factory'
      - '@date.formatter'
      - '@cache.default'
      - '@module_handler'
    # logger.channel.my_module is auto-created if you add:
  logger.channel.my_module:
    parent: logger.channel_base
    arguments: ['my_module']`,
      note: "Autowiring off by default means you list '@service.id' for every constructor arg, in order (you could set autowire: true per service since Drupal 9.2, but the convention is explicit args). The logger.channel_base parent trick registers a dedicated PSR-3 channel you can then inject as '@logger.channel.my_module'.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "This models Drupal's container + the \\Drupal::service() static shortcut in plain PHP, then shows the daily services answering. Predict the printed lines: note that current_user is an AccountProxy (a name + permission check), not a full user entity, and the logger takes @-placeholders.",
    code: `<?php
// Minimal stand-in for the Symfony/Drupal container: ID => instance.
final class Container {
  public function __construct(private array $services) {}
  public function get(string $id): object { return $this->services[$id]; }
}

// \\Drupal's static shortcut wraps a single global container.
final class Drupal {
  private static Container $container;
  public static function setContainer(Container $c): void { self::$container = $c; }
  public static function service(string $id): object { return self::$container->get($id); }
  public static function currentUser(): object { return self::service('current_user'); }
}

// current_user: an AccountProxy — identity + permissions, NOT a User entity.
final class AccountProxy {
  public function __construct(private int $uid, private string $name, private array $perms) {}
  public function id(): int { return $this->uid; }
  public function getAccountName(): string { return $this->name; }
  public function hasPermission(string $p): bool { return in_array($p, $this->perms, true); }
}

// logger.factory: call ->get(channel) to get a PSR-3-ish logger.
final class LoggerFactory {
  public function get(string $channel): object {
    return new class($channel) {
      public function __construct(private string $channel) {}
      public function info(string $msg, array $ctx = []): void {
        // Drupal replaces @placeholders (not Monolog's {curly}).
        $out = strtr($msg, $ctx);
        echo "[{$this->channel}] {$out}\\n";
      }
    };
  }
}

// config.factory: ->get('name')->get('key').
final class ConfigFactory {
  public function __construct(private array $store) {}
  public function get(string $name): object {
    $data = $this->store[$name] ?? [];
    return new class($data) {
      public function __construct(private array $data) {}
      public function get(string $key) { return $this->data[$key] ?? null; }
    };
  }
}

Drupal::setContainer(new Container([
  'current_user'  => new AccountProxy(7, 'ada', ['view reports']),
  'logger.factory'=> new LoggerFactory(),
  'config.factory'=> new ConfigFactory(['my_module.settings' => ['limit' => 25]]),
]));

// Discouraged-in-classes static shortcut (fine in .module procedural code):
$account = Drupal::currentUser();
echo "user #{$account->id()} = {$account->getAccountName()}\\n";
echo 'can view reports? ' . ($account->hasPermission('view reports') ? 'yes' : 'no') . "\\n";
echo 'can delete? ' . ($account->hasPermission('delete any node') ? 'yes' : 'no') . "\\n";

$limit = Drupal::service('config.factory')->get('my_module.settings')->get('limit');
echo "config limit = {$limit}\\n";

$logger = Drupal::service('logger.factory')->get('my_module');
$logger->info('Report viewed by @user', ['@user' => $account->getAccountName()]);`,
    output: `user #7 = ada
can view reports? yes
can delete? no
config limit = 25
[my_module] Report viewed by ada`,
  },

  keyPoints: [
    "The rule for `\\Drupal::service()` mirrors Symfony: inject in classes (controllers, plugins, services), use the static shortcut only in procedural `.module`/`.install` code where there's no object to inject into.",
    "`current_user` is an AccountProxy (id(), getAccountName(), hasPermission(), isAnonymous()), NOT a User entity — load the entity via `entity_type.manager` if you need fields.",
    "`config.factory->get('my_module.settings')->get('key')` replaces Symfony bound parameters; `messenger->addStatus()/addError()` is Symfony's `addFlash()`.",
    "`logger.factory` is a factory — call `->get('channel')` for a PSR-3 logger, and use Drupal's @/%/: placeholders, not Monolog's {curly} syntax.",
    "`request_stack` is the exact Symfony service; for route parameters prefer `current_route_match->getParameter('node')`, which returns the upcasted entity rather than a raw string.",
    "In a `*.services.yml` you list every constructor argument explicitly as `'@service.id'` — autowiring is off by default, so Drupal core services and controllers name each argument; you can opt in per service with `autowire: true` (since Drupal 9.2), but the convention is to be explicit.",
  ],

  interview: [
    {
      q: "When is it acceptable to call \\Drupal::service() instead of injecting a dependency?",
      a: "Only in procedural code that the container never builds — `hook_*` implementations in a `.module` file, `.install` update hooks, or a `settings.php`-level callback — because there's no object for `create()` to inject into. In any container-built class (controller, form, plugin, service, event subscriber) you inject: type-hint the constructor and name the ID in `create()` or in `*.services.yml`. Calling `\\Drupal::service()` inside a class is the direct equivalent of a Symfony service pulling from a global container: it hides the dependency, breaks unit testing, and every reviewer and coding-standards checker will flag it. The static helpers exist for the procedural corners of Drupal, not as a shortcut to skip DI.",
    },
    {
      q: "A colleague injected current_user and is surprised it has no getEmail() or field values. Explain.",
      a: "`current_user` resolves to an `AccountProxyInterface` — an AccountProxy, which is a lightweight session/identity object, not the full User content entity. It answers `id()`, `getAccountName()`, `isAnonymous()`, `getRoles()` and `hasPermission()`, which is all most access checks need. To read email or custom user fields you load the entity: `$this->entityTypeManager->getStorage('user')->load($this->currentUser->id())`, which returns a `User` object with `getEmail()` and field accessors. It's the same split Symfony has between the token's `UserInterface` identity and a fully hydrated Doctrine user — Drupal just makes the proxy the default injection.",
    },
    {
      q: "How do you get a logger in Drupal, and how does it differ from injecting LoggerInterface in Symfony?",
      a: "The service `logger.factory` is a `LoggerChannelFactoryInterface`; you call `->get('my_module')` to obtain a PSR-3 channel scoped to your module, which then works like any Monolog logger (`->error()`, `->info()`, etc.). Inside a class you can inject the factory and call get() in `create()`, or better, declare a dedicated `logger.channel.my_module` service (parent `logger.channel_base`) and inject that directly as a `Psr\\Log\\LoggerInterface`. The one gotcha versus Symfony/Monolog: Drupal's message placeholders use `@name`, `%name` or `:name` and a context array like `['@id' => $id]`, not Monolog's `{curly}` tokens. Otherwise it's the same PSR-3 contract you already know.",
    },
    {
      q: "You need the current node from the URL inside a service. request_stack or current_route_match?",
      a: "`current_route_match`. Drupal upcasts route parameters just like a Symfony ParamConverter, so `current_route_match->getParameter('node')` returns the fully loaded `Node` entity, not a raw ID string. `request_stack` — which in Drupal is literally the Symfony `RequestStack` service — only gives you the raw request, where the attribute may be an unconverted value and you'd have to reload it yourself. Use `request_stack->getCurrentRequest()` for genuinely request-level data (query string, headers, method) and `current_route_match` for anything that came through the route, especially upcasted entities.",
    },
  ],

  quiz: [
    {
      question:
        "In a Drupal controller class, what's the preferred way to access the messenger service?",
      options: [
        "Call \\Drupal::messenger() directly in the method",
        "Type-hint MessengerInterface in the constructor and list '@messenger' (via 'messenger' ID) in create()",
        "Read it from the global $GLOBALS array",
        "Autowire it by type-hint alone; Drupal resolves it automatically",
      ],
      answerIndex: 1,
      explain:
        "Autowiring is off by default in Drupal, so core services and controllers inject explicitly: type-hint MessengerInterface and name the 'messenger' ID in create(). \\Drupal::messenger() works but is the discouraged static shortcut, reserved for procedural code. (You can opt in per service with autowire: true since Drupal 9.2, but the convention is explicit arguments.)",
    },
    {
      question: "What does the current_user service return?",
      options: [
        "A fully loaded User content entity with all fields",
        "An AccountProxy exposing id(), getAccountName(), hasPermission() and isAnonymous()",
        "The Symfony Security service",
        "A Doctrine user repository",
      ],
      answerIndex: 1,
      explain:
        "current_user is an AccountProxyInterface — a lightweight identity/permission object, not the User entity. To read email or custom fields, load the entity via entity_type.manager's user storage using $currentUser->id().",
    },
    {
      question:
        "You inject logger.factory and want to log an error for module 'shop'. Which is correct?",
      options: [
        "$this->loggerFactory->error('shop', 'Boom')",
        "$this->loggerFactory->get('shop')->error('Order @id failed', ['@id' => $id])",
        "$this->loggerFactory->error('Order {id} failed', ['id' => $id])",
        "$this->loggerFactory->channel('shop')->log('Boom')",
      ],
      answerIndex: 1,
      explain:
        "logger.factory is a factory: call ->get('shop') to obtain a PSR-3 channel, then ->error() on it. Drupal placeholders are @/%/: with a context array (['@id' => $id]) — not Monolog's {curly} tokens.",
    },
    {
      question:
        "To read the upcasted node entity from the current URL inside a service, which service should you inject?",
      options: [
        "request_stack, then parse getCurrentRequest()->attributes",
        "current_route_match, then getParameter('node')",
        "entity_type.manager only",
        "current_user",
      ],
      answerIndex: 1,
      explain:
        "current_route_match->getParameter('node') returns the fully loaded, upcasted Node entity. request_stack (the Symfony service) gives the raw request where the value may be unconverted; use it for query/header/method data, not upcasted route entities.",
    },
  ],
};

export default lesson;
