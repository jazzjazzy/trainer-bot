import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "defining-services",
  title: "Defining Your Own Services",
  part: "Services, DI & Business Logic",
  estMinutes: 12,
  summary:
    "Register incident_tracker's first business-logic service — a SeverityCalculator — in incident_tracker.services.yml with explicit, ordered arguments, plus a dedicated logger channel built from parent: logger.channel_base.",

  concept: `
So far incident_tracker has routes, controllers and links. Now it gets a brain:
a \`SeverityCalculator\` service that decides how bad an incident is. In
Symfony you'd drop the class into \`src/\` and autowiring would register it. In
Drupal 10/11 you declare it by hand in **\`incident_tracker.services.yml\`** at
the module root:

\`\`\`yaml
services:
  logger.channel.incident_tracker:
    parent: logger.channel_base
    arguments: ['incident_tracker']

  incident_tracker.severity_calculator:
    class: Drupal\\incident_tracker\\Service\\SeverityCalculator
    arguments:
      - '@entity_type.manager'
      - '@config.factory'
      - '@logger.channel.incident_tracker'
\`\`\`

### No autowiring: every argument, in order

Drupal compiles the container with autowire and autoconfigure **off**. Each
constructor parameter must appear under \`arguments:\` as an \`'@service_id'\`
reference, positionally, in exactly the constructor's order. Get the order
wrong and you get a \`TypeError\` (or, worse, the wrong object silently doing
duty). Core has shipped interface aliases since 10.1 (and 10.2 turned
autowiring on throughout core.services.yml itself) so you *can* opt in with
\`autowire: true\` per service — but explicit arguments remain the convention
you'll see in core and contrib, so learn to read and write them.

### Service ids: MODULE.name

Ids are hand-authored strings namespaced by module machine name:
\`incident_tracker.severity_calculator\`, not an FQCN. That prevents collisions
across thousands of contrib modules and makes \`grep\` for consumers trivial.

### The logger channel pattern

Don't inject \`@logger.factory\` and call \`->get('incident_tracker')\` in every
class. Define the channel **once** as its own service. \`parent:
logger.channel_base\` inherits core's abstract definition — class
\`LoggerChannel\`, factory \`['@logger.factory', 'get']\` — so your single
argument becomes the channel name. The resulting service *is*
\`logger.factory->get('incident_tracker')\`, ready to inject anywhere as
\`'@logger.channel.incident_tracker'\`. Watchdog/dblog entries then show up
filed under the \`incident_tracker\` type. Core uses the identical trick for
\`logger.channel.cron\`, \`logger.channel.php\`, and friends.

### Design for later: interfaces, visibility, tags, lazy

- **Code against interfaces.** Type-hint \`EntityTypeManagerInterface\`,
  \`ConfigFactoryInterface\`, \`LoggerChannelInterface\` — and give your own
  service a \`SeverityCalculatorInterface\`. Because consumers depend on the id
  + interface, you can swap the class in YAML, decorate it, or override it
  from a ServiceProvider later without touching callers.
- **Public by default.** Drupal container services are public — anything can
  fetch them via \`\\Drupal::service()\`. Symfony 6.4/7 defaults services to
  private. Don't rely on that looseness; inject instead (next section).
- **Tags** are how Drupal collects services into subsystems (no
  autoconfigure): \`{ name: event_subscriber }\`, \`{ name: access_check }\`…
  We'll attach our first tag in the events section.
- **Lazy services** exist too: \`lazy: true\` plus a generated proxy (see
  \`core/scripts/generate-proxy-class.php\`) defers construction of heavy
  services until first use.

### The ritual: drush cr

The container is compiled and cached in the \`cache_container\` bin. Nothing
you change in services.yml exists until you run \`drush cr\`. Make it muscle
memory: edit YAML → \`drush cr\` → test.
`,

  comparisons: [
    {
      label: "Registering the service",
      intro:
        "Both apps need a SeverityCalculator with the entity layer, config, and a logger. Symfony's _defaults autowire it from type-hints; Drupal lists every dependency by id, in constructor order.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/services.yaml (Symfony 6.4 / 7)
services:
  _defaults:
    autowire: true
    autoconfigure: true

  App\\:
    resource: '../src/'

# Done. App\\Service\\SeverityCalculator is
# auto-registered; its id IS the FQCN and its
# constructor deps resolve from type-hints.`,
      ts: `# incident_tracker.services.yml (Drupal 10 / 11)
services:
  incident_tracker.severity_calculator:
    class: Drupal\\incident_tracker\\Service\\SeverityCalculator
    arguments:
      - '@entity_type.manager'
      - '@config.factory'
      - '@logger.channel.incident_tracker'
# id convention: MODULE.name
# args are POSITIONAL — same order as the
# constructor. No autowiring by default.`,
      note:
        "Drupal 10.1+ can do opt-in `autowire: true` per service (core ships interface aliases), but explicit arguments are still the idiom everywhere you'll read code.",
    },
    {
      label: "A dedicated logger channel",
      intro:
        "One log channel for the whole module. Symfony declares a monolog channel and autowires it by parameter name; Drupal defines a child service of core's abstract logger.channel_base.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/monolog.yaml (Symfony)
monolog:
  channels: ['incident']

# MonologBundle registers monolog.logger.incident
# and a named autowire alias, so any service can
# just type-hint:
#   LoggerInterface $incidentLogger
# and get the 'incident' channel injected.`,
      ts: `# incident_tracker.services.yml (Drupal)
services:
  logger.channel.incident_tracker:
    parent: logger.channel_base
    arguments: ['incident_tracker']

# core.services.yml provides the parent:
#   logger.channel_base:
#     abstract: true
#     class: Drupal\\Core\\Logger\\LoggerChannel
#     factory: ['@logger.factory', 'get']
# => your service IS
#    logger.factory->get('incident_tracker')`,
      note:
        "`parent:` copies class/factory from the abstract definition; your one argument becomes the channel name shown in dblog's Type column.",
    },
    {
      label: "The service class (interface-first)",
      intro:
        "The PHP both YAML files point at. Symfony's constructor is self-sufficient thanks to autowiring; Drupal's must mirror the YAML arguments list exactly — same dependencies, same order.",
      php: `<?php // src/Service/SeverityCalculator.php (Symfony)
namespace App\\Service;

use Doctrine\\ORM\\EntityManagerInterface;
use Psr\\Log\\LoggerInterface;
use Symfony\\Component\\DependencyInjection\\Attribute\\Autowire;

final class SeverityCalculator implements SeverityCalculatorInterface
{
    public function __construct(
        private EntityManagerInterface $em,
        #[Autowire(param: 'app.critical_threshold')]
        private int $criticalThreshold,
        private LoggerInterface $incidentLogger, // channel via arg name
    ) {}

    public function calculate(int $affectedUsers): string
    {
        $severity = $affectedUsers >= $this->criticalThreshold
            ? 'critical' : 'minor';
        $this->incidentLogger->notice('Severity '.$severity);
        return $severity;
    }
}`,
      ts: `<?php // src/Service/SeverityCalculator.php (Drupal)
namespace Drupal\\incident_tracker\\Service;

use Drupal\\Core\\Config\\ConfigFactoryInterface;
use Drupal\\Core\\Entity\\EntityTypeManagerInterface;
use Drupal\\Core\\Logger\\LoggerChannelInterface;

class SeverityCalculator implements SeverityCalculatorInterface {

  public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
    protected ConfigFactoryInterface $configFactory,
    protected LoggerChannelInterface $logger,
  ) {}

  public function calculate(int $affectedUsers): string {
    $threshold = (int) $this->configFactory
      ->get('incident_tracker.settings')
      ->get('critical_threshold');
    $severity = $affectedUsers >= $threshold ? 'critical' : 'minor';
    $this->logger->notice('Severity @s calculated.', ['@s' => $severity]);
    return $severity;
  }

}`,
      note:
        "Three constructor params ↔ three YAML arguments, in the same order. The interface (yours, one file up) is what lets you swap or decorate this service later.",
    },
    {
      label: "Making the container see it",
      intro:
        "Symfony's dev kernel rebuilds the container automatically; Drupal's compiled container is cached until you rebuild it yourself. Verify the wiring from the CLI.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: dev env rebuilds on change; force + inspect:
$ php bin/console cache:clear
$ php bin/console debug:container App\\\\Service\\\\SeverityCalculator
  Service ID   App\\Service\\SeverityCalculator
  Public       no
  Autowired    yes`,
      ts: `# Drupal: NO auto-rebuild — after every services.yml edit:
$ drush cr
 [success] Cache rebuild complete.

$ drush ev "var_dump(get_class(\\Drupal::service('incident_tracker.severity_calculator')));"
string(50) "Drupal\\incident_tracker\\Service\\SeverityCalculator"`,
      note:
        "Symfony's default service is private and autowired; Drupal's is public and hand-wired. And in Drupal, forgetting drush cr is the #1 'why is my service not found' cause.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A miniature compiled container wired straight from incident_tracker.services.yml: '@id' arguments resolve positionally, the logger channel takes a scalar channel-name argument, and — since nothing autowires — swapping two arguments blows up on the typed constructor. Predict the output.",
    code: `<?php
// incident_tracker.services.yml, parsed. Drupal wires EVERY argument
// explicitly — '@id' references resolved positionally, in YAML order.
$services = [
  'entity_type.manager' => ['class' => 'EntityTypeManager'],
  'config.factory'      => ['class' => 'ConfigFactory'],
  'logger.channel.incident_tracker' => [
    'class' => 'LoggerChannel',            // inherited via parent: logger.channel_base
    'arguments' => ['incident_tracker'],   // scalar arg = the channel name
  ],
  'incident_tracker.severity_calculator' => [
    'class' => 'SeverityCalculator',
    'arguments' => [
      '@entity_type.manager',
      '@config.factory',
      '@logger.channel.incident_tracker',
    ],
  ],
];

class EntityTypeManager {}
class ConfigFactory {
  public function get(string $name): array {
    // Stand-in for incident_tracker.settings config.
    return ['critical_threshold' => 100];
  }
}
class LoggerChannel {
  public function __construct(public string $channel) {}
  public function notice(string $message): void {
    echo "[{$this->channel}] {$message}\\n";
  }
}
class SeverityCalculator {
  public function __construct(
    private EntityTypeManager $entityTypeManager,
    private ConfigFactory $configFactory,
    private LoggerChannel $logger,
  ) {}
  public function calculate(int $affectedUsers): string {
    $threshold = $this->configFactory->get('incident_tracker.settings')['critical_threshold'];
    $severity = $affectedUsers >= $threshold ? 'critical' : 'minor';
    $this->logger->notice("severity={$severity} affected={$affectedUsers}");
    return $severity;
  }
}

$cache = [];
function service(string $id, array $services, array &$cache): object {
  if (isset($cache[$id])) return $cache[$id];   // compiled container = shared instances
  $def = $services[$id];
  $args = [];
  foreach ($def['arguments'] ?? [] as $a) {
    // NB: a foreach, not array_map(fn () => ...) — an arrow function would
    // capture $cache BY VALUE, so nested services would never be shared.
    $args[] = str_starts_with($a, '@')
      ? service(substr($a, 1), $services, $cache)
      : $a;
  }
  return $cache[$id] = new $def['class'](...$args);  // positional — YAML order!
}

$calc = service('incident_tracker.severity_calculator', $services, $cache);
echo $calc->calculate(250), "\\n";
echo $calc->calculate(12), "\\n";

// Order matters: swap two arguments and the typed constructor rejects it.
$services['incident_tracker.severity_calculator']['arguments'] = [
  '@config.factory',
  '@entity_type.manager',
  '@logger.channel.incident_tracker',
];
unset($cache['incident_tracker.severity_calculator']);
try {
  service('incident_tracker.severity_calculator', $services, $cache);
} catch (TypeError $e) {
  echo "TypeError: argument order must match the constructor\\n";
}`,
    output: `[incident_tracker] severity=critical affected=250
critical
[incident_tracker] severity=minor affected=12
minor
TypeError: argument order must match the constructor
`,
  },

  keyPoints: [
    "Custom services live in MODULE.services.yml at the module root; ids follow the MODULE.name convention — ours is `incident_tracker.severity_calculator`.",
    "Drupal 10/11 do NOT autowire by default: every constructor dependency is an explicit '@id' under `arguments:`, positional and in exact constructor order (opt-in `autowire: true` exists since core shipped interface aliases in 10.1, but explicit is the idiom).",
    "Define one logger channel per module: `logger.channel.incident_tracker` with `parent: logger.channel_base` and `arguments: ['incident_tracker']` — the parent supplies class + factory `['@logger.factory', 'get']`, your argument is the channel name.",
    "Type-hint interfaces (core's and your own `SeverityCalculatorInterface`) so the service can be swapped, decorated, or overridden later without touching consumers.",
    "Drupal services are public by default (reachable via `\\Drupal::service()`), unlike Symfony 6.4/7's private-by-default; tags replace autoconfigure, and `lazy: true` + a generated ProxyClass handles expensive services.",
    "The container is compiled and cached in the `cache_container` bin — every services.yml edit needs `drush cr` before it exists.",
  ],

  interview: [
    {
      q: "Walk me through adding a custom service to a Drupal module. What's different from registering one in Symfony?",
      a: "You create `MODULE.services.yml` in the module root and declare the service with an id following the `MODULE.name` convention, a `class`, and an `arguments:` list of `'@service_id'` references. Unlike Symfony, where `_defaults` turns on autowire/autoconfigure and the FQCN is the id, Drupal has no autowiring by default — the arguments are positional and must exactly match the constructor's parameter order, or the container hands your constructor the wrong objects. After any edit you run `drush cr` because the compiled container is cached and there's no dev rebuild watcher. Drupal 10.1+ technically allows `autowire: true` per service thanks to core's interface aliases, but core and contrib code overwhelmingly wire explicitly, so that's the style to follow.",
    },
    {
      q: "What does `parent: logger.channel_base` do in a services.yml, and why define a channel service instead of injecting logger.factory?",
      a: "Core defines `logger.channel_base` as an abstract service definition: class `LoggerChannel` with the factory `['@logger.factory', 'get']`. Declaring `logger.channel.incident_tracker` with that parent and `arguments: ['incident_tracker']` inherits the class and factory, so the container builds your service by calling `logger.factory->get('incident_tracker')` — a ready-made channel. That means consumers inject `'@logger.channel.incident_tracker'` and call `->notice()` directly, instead of every class injecting the factory and repeating the channel-name string. It centralizes the channel name, keeps constructors honest about what they actually use, and all entries land under the `incident_tracker` type in dblog/syslog — exactly how core wires `logger.channel.cron`.",
    },
    {
      q: "Why give a small service like SeverityCalculator its own interface, and what do 'public' and 'lazy' mean for Drupal services?",
      a: "The interface makes the service id + contract the public API and the class an implementation detail: later you can point the YAML at a different class, decorate the service, or override it from a module's ServiceProvider without touching any consumer — and unit tests can mock the interface cheaply. On visibility: Drupal services are public by default, so anything can fetch them with `\\Drupal::service()`, whereas modern Symfony defaults to private services that must be injected — good practice in Drupal is to behave as if they were private and inject anyway. `lazy: true` is Drupal's version of Symfony's lazy proxies: you generate a ProxyClass with `core/scripts/generate-proxy-class.php` so an expensive service isn't constructed until a method is first called.",
    },
  ],

  quiz: [
    {
      question:
        "In incident_tracker.services.yml the severity calculator lists '@entity_type.manager', '@config.factory', '@logger.channel.incident_tracker'. What happens if you list them in a different order than the constructor parameters?",
      options: [
        "Nothing — Drupal matches arguments to parameters by type-hint",
        "The container reorders them at compile time using reflection",
        "Each argument is passed positionally, so the constructor receives the wrong objects — typically a TypeError",
        "Drupal throws a YAML parse error when reading the file",
      ],
      answerIndex: 2,
      explain:
        "With no autowiring, `arguments:` is a plain positional list. The container passes them in YAML order, so a mismatch hands the constructor the wrong services — typed parameters fail with a TypeError, untyped ones fail later and more mysteriously.",
    },
    {
      question:
        "What does this definition actually produce?\n\nlogger.channel.incident_tracker:\n  parent: logger.channel_base\n  arguments: ['incident_tracker']",
      options: [
        "A subclass of LoggerChannel generated at runtime",
        "The object returned by logger.factory->get('incident_tracker') — a LoggerChannel bound to that channel name",
        "A new database table for incident_tracker log entries",
        "An alias of the logger.factory service",
      ],
      answerIndex: 1,
      explain:
        "`parent:` inherits the abstract logger.channel_base definition — class LoggerChannel, factory ['@logger.factory', 'get'] — and your argument becomes the factory's parameter. The container literally calls LoggerChannelFactory::get('incident_tracker') to build the service.",
    },
    {
      question:
        "You added incident_tracker.severity_calculator to services.yml, but \\Drupal::service() says the service does not exist. Most likely fix?",
      options: [
        "Add autowire: true so Drupal discovers the class",
        "Rename the file to services.yaml — .yml is not read",
        "Run drush cr — the compiled container in cache_container doesn't include your edit yet",
        "Move the definition into core.services.yml",
      ],
      answerIndex: 2,
      explain:
        "Drupal compiles the container once and caches it (cache_container bin, database-backed by default). There is no auto-rebuild on file change like Symfony's dev kernel, so new or edited service definitions are invisible until `drush cr`.",
    },
  ],
};

export default lesson;
