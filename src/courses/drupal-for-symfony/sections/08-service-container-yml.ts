import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "service-container-yml",
  title: "The Service Container: my_module.services.yml vs services.yaml",
  part: "Routing, Controllers & Services",
  estMinutes: 12,
  summary:
    "Both frameworks use the Symfony DI container, but Drupal turns off autowire/autoconfigure and wires every service by hand with explicit @arguments and tags.",

  concept: `
Drupal *is* built on the Symfony DependencyInjection component — same
\`ContainerBuilder\`, same compiler passes, same YAML dialect. What changes is
the **conventions layered on top**. Everything you know about services.yaml
still applies mechanically; the defaults are just inverted.

### The one file you'll edit: MODULE.services.yml

In Symfony every bundle contributes services, but you mostly touch a single
\`config/services.yaml\` with a \`_defaults\` block that flips on autowiring for
the whole \`App\\\` namespace. In Drupal each module ships its own
\`my_module.services.yml\` (note: \`.yml\`, and prefixed with the machine name).
Drupal supports the same \`_defaults\`, \`autowire\` and \`autoconfigure\` keys
Symfony does — core's own \`announcements_feed.services.yml\` uses them — but
**none of them are on by default**, so idiomatic module code spells everything
out:

\`\`\`yaml
services:
  my_module.mailer:
    class: Drupal\\my_module\\Mailer
    arguments: ['@entity_type.manager', '@current_user']
\`\`\`

The container is compiled once and cached in the \`cache_container\` bin
(database-backed by default), exactly like Symfony's cached container — but
there's no \`dev\` rebuild-on-change watcher, so **after editing services.yml you
must rebuild the cache** with \`drush cr\`. (The \`sites/default/files/php\`
directory you may see is PhpStorage for compiled Twig and generated PHP, *not*
the service container.)

### Service IDs are strings, not class names

This is the biggest mental shift. Symfony's modern default uses the **FQCN as
the service id** (\`App\\Service\\Mailer\`) and autowires constructor params by
type-hint. Drupal ids are hand-authored **snake.dot strings** —
\`entity_type.manager\`, \`current_user\`, \`renderer\`, \`logger.factory\`. You
reference them with a leading \`@\` in \`arguments\`, and you retrieve them at
runtime with \`\\Drupal::service('entity_type.manager')\` or via injection. The
class is an implementation detail; the *id* is the contract.

### No autowire means arguments are mandatory

Because nothing infers dependencies from type-hints, the **order and contents
of \`arguments\` must exactly match your constructor signature**. Miss one and
you get a \`RuntimeException\` about too few arguments at build time. (Drupal
9.3+ *does* let you opt in per-service with \`autowire: true\`, and 10.2/11 add
PHP-attribute autowiring for some cases — but idiomatic module code, and every
example you'll read, wires arguments explicitly.)

### Tags replace autoconfigure

Symfony's \`autoconfigure: true\` inspects interfaces
(\`EventSubscriberInterface\`, \`Voter\`…) and applies tags for you. Drupal has the
same machinery — \`CoreServiceProvider\` calls
\`registerForAutoconfiguration(EventSubscriberInterface::class)\` — but it is off
unless your services file sets \`autoconfigure: true\`, so by default you **add
the tag by hand**. The common ones:

- \`{ name: event_subscriber }\` — register a \`Drupal\\Core\\...\\EventSubscriber\`
- \`{ name: access_check }\` — a route access checker
- \`{ name: plugin_manager_cache_clear }\` — flush plugin caches on rebuild
- \`{ name: cache.context }\`, \`{ name: theme_negotiator }\`, etc.

Tagged-service collection works through the same compiler-pass mechanism you'd
write in a Symfony \`CompilerPassInterface\`; Drupal core just ships those passes
for you. A plugin manager (next sections) is itself a tagged service that
gathers plugin definitions — same pattern, different vocabulary.
`,

  comparisons: [
    {
      label: "Declaring a service",
      intro:
        "Register a mailer that needs the entity manager and the current user. Symfony infers both from type-hints; Drupal lists them by id, in constructor order.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/services.yaml (Symfony 6.4 / 7)
services:
  _defaults:
    autowire: true        # infer args from type-hints
    autoconfigure: true   # infer tags from interfaces

  App\\:
    resource: '../src/'

  # Mailer is auto-registered; its id IS the FQCN,
  # EntityManager + Security injected by type-hint.`,
      ts: `# my_module.services.yml (Drupal 10 / 11)
services:
  my_module.mailer:
    class: Drupal\\my_module\\Mailer
    arguments:
      - '@entity_type.manager'
      - '@current_user'
    # no _defaults, no autowire, no autoconfigure —
    # id is a snake.dot string, args are explicit
    # and MUST match the constructor order.`,
      note:
        "Drupal's default is the inverse of Symfony's: wiring is manual. Every '@id' maps positionally to a constructor parameter.",
    },
    {
      label: "The constructor on the PHP side",
      intro:
        "The class both YAML files point at. Note that with Symfony autowiring the constructor is enough; with Drupal the YAML above is what actually supplies these.",
      php: `<?php // src/Service/Mailer.php (Symfony)
namespace App\\Service;

use Doctrine\\ORM\\EntityManagerInterface;
use Symfony\\Bundle\\SecurityBundle\\Security;

final class Mailer
{
    public function __construct(
        private EntityManagerInterface $em,
        private Security $security,
    ) {}
}`,
      ts: `<?php // src/Mailer.php (Drupal)
namespace Drupal\\my_module;

use Drupal\\Core\\Entity\\EntityTypeManagerInterface;
use Drupal\\Core\\Session\\AccountProxyInterface;

final class Mailer {
  public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
    protected AccountProxyInterface $currentUser,
  ) {}
}`,
      note:
        "Same PHP 8 constructor promotion. Difference is purely who supplies the arguments: Symfony's autowire vs Drupal's explicit `arguments:` list.",
    },
    {
      label: "Tags: an event subscriber",
      intro:
        "Register a subscriber for the kernel request event. Symfony tags it automatically because it implements EventSubscriberInterface; Drupal needs the tag written out.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: nothing to write.
# autoconfigure: true sees
# EventSubscriberInterface and adds
#   { name: kernel.event_subscriber }
# automatically. The class alone
# is enough to be registered.`,
      ts: `# my_module.services.yml (Drupal)
services:
  my_module.request_subscriber:
    class: Drupal\\my_module\\EventSubscriber\\RequestSubscriber
    arguments: ['@current_route_match']
    tags:
      - { name: event_subscriber }
# no autoconfigure — the tag is mandatory,
# or the subscriber is never invoked.`,
      note:
        "Forgetting the tag in Drupal fails silently: the class loads fine but is never wired into the dispatcher. Always add the tag by hand.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "This models Drupal's container the way it actually works: a registry of services keyed by snake.dot id, whose '@ref' arguments are resolved positionally into constructors — no type-hint autowiring anywhere. Predict the output.",
    code: `<?php
// A tiny stand-in for Drupal's compiled container.
// Definitions look just like my_module.services.yml entries.
$definitions = [
  'current_user'        => ['class' => 'CurrentUser', 'arguments' => []],
  'entity_type.manager' => ['class' => 'EntityTypeManager', 'arguments' => []],
  'my_module.mailer'    => [
    'class' => 'Mailer',
    'arguments' => ['@entity_type.manager', '@current_user'],
  ],
];

class CurrentUser { public function name() { return 'j/admin'; } }
class EntityTypeManager { public function label() { return 'nodes'; } }
class Mailer {
  public function __construct(public $etm, public $user) {}
  public function describe() {
    return "Mailer over {$this->etm->label()} as {$this->user->name()}";
  }
}

$instances = [];
function get_service($id, &$defs, &$cache) {
  if (isset($cache[$id])) return $cache[$id];   // container caches singletons
  $def = $defs[$id];
  $args = [];
  foreach ($def['arguments'] as $arg) {
    // A leading '@' means "resolve another service by id".
    if (is_string($arg) && $arg[0] === '@') {
      $args[] = get_service(substr($arg, 1), $defs, $cache);
    } else {
      $args[] = $arg;               // scalar / plain value
    }
  }
  // No autowiring: args are passed positionally, in YAML order.
  $obj = new $def['class'](...$args);
  return $cache[$id] = $obj;
}

$mailer = get_service('my_module.mailer', $definitions, $instances);
echo $mailer->describe(), "\\n";

// Same id twice returns the same instance (shared, like Drupal):
$a = get_service('current_user', $definitions, $instances);
$b = get_service('current_user', $definitions, $instances);
var_export($a === $b);
echo "\\n";
echo count($instances), " services instantiated\\n";`,
    output: `Mailer over nodes as j/admin
true
3 services instantiated`,
  },

  keyPoints: [
    "Drupal uses the Symfony DI container but ships defaults inverted: NO autowire and NO autoconfigure — you wire everything by hand in MODULE.services.yml.",
    "Service ids are snake.dot strings (`entity_type.manager`, `current_user`), not FQCNs; reference them as `'@id'` in `arguments:` and fetch via `\\Drupal::service('id')`.",
    "`arguments:` is an ordered, positional list that must match the constructor exactly — a mismatch fails at container-build time.",
    "Tags replace autoconfigure: add `{ name: event_subscriber }`, `{ name: access_check }`, etc. by hand or the service is never collected.",
    "Editing services.yml requires a cache rebuild (`drush cr`) — the compiled container is cached in the `cache_container` bin (database-backed by default), with no dev auto-rebuild.",
    "Drupal 9.3+ allows opt-in `autowire: true` per service, and 10.2/11 add attribute autowiring — but idiomatic module code still wires explicitly.",
  ],

  interview: [
    {
      q: "How does Drupal's service container differ from Symfony's, given they share the same DI component?",
      a: "It's the same `symfony/dependency-injection` component and the same YAML dialect, so the mechanics are identical. The difference is convention: Symfony's `services.yaml` ships a `_defaults` block with `autowire: true` and `autoconfigure: true`, so most services register themselves and infer dependencies from type-hints. Drupal 10/11 do neither by default — each module's `my_module.services.yml` declares services with an explicit `class`, an ordered `arguments` list of `'@id'` references, and hand-written `tags`. So in Drupal you're doing manually what Symfony's defaults automate.",
    },
    {
      q: "Why are Drupal service ids strings like `entity_type.manager` instead of class names?",
      a: "Modern Symfony uses the FQCN as the service id and autowires by type-hint, but Drupal predates that convention and treats the id as the stable public contract, decoupled from the implementing class. `entity_type.manager` might be swapped for a different class via a `ServiceProvider` or a compiler pass without any consumer changing its reference. You inject by id (`'@entity_type.manager'`) and can retrieve dynamically with `\\Drupal::service('entity_type.manager')`. The tradeoff is you must know the id, but it makes the container's public API explicit and overridable.",
    },
    {
      q: "You added an event subscriber class but its listener never fires. What's the likely cause in Drupal?",
      a: "You almost certainly forgot the `tags: [{ name: event_subscriber }]` entry in `my_module.services.yml`. In Symfony `autoconfigure` would detect `EventSubscriberInterface` and tag it for you, but Drupal leaves autoconfigure off unless the file opts in with `_defaults: { autoconfigure: true }`, so by default an untagged subscriber is just an unreferenced class — it loads but is never collected into the dispatcher. The second thing to check is that you rebuilt the cache with `drush cr`, since the container is compiled and cached (in the `cache_container` bin, database-backed by default) and won't pick up services.yml edits until you do.",
    },
  ],

  quiz: [
    {
      question:
        "In a default Drupal 10/11 module, how are a service's constructor dependencies supplied?",
      options: [
        "Autowired from the constructor's type-hints, like Symfony's defaults",
        "Listed explicitly and positionally in the `arguments:` key as '@id' references",
        "Injected via PHP attributes on each parameter, always",
        "Resolved at runtime by scanning the class for setters",
      ],
      answerIndex: 1,
      explain:
        "Drupal ships without autowire by default, so you list each dependency as an '@id' in `arguments:`, in the same order as the constructor parameters. Attribute/opt-in autowiring exists (9.3+/10.2+) but is not the default.",
    },
    {
      question:
        "What does Symfony's `autoconfigure: true` do that Drupal makes you do by hand?",
      options: [
        "Rebuild the container cache on every request",
        "Generate the services.yml file from your classes",
        "Apply tags (e.g. event_subscriber) by inspecting implemented interfaces",
        "Convert class names into snake.dot service ids",
      ],
      answerIndex: 2,
      explain:
        "autoconfigure inspects interfaces like EventSubscriberInterface and applies the matching tag automatically. Drupal has the same mechanism (core registers EventSubscriberInterface for autoconfiguration) but leaves it off by default, so unless your file sets `_defaults: { autoconfigure: true }` you must write `tags: [{ name: event_subscriber }]` yourself or the service is never collected.",
    },
    {
      question:
        "You edited my_module.services.yml to add an argument. Why is the change not taking effect?",
      options: [
        "YAML services are ignored; you must register in a PHP ServiceProvider",
        "The compiled container is cached to disk — run `drush cr` to rebuild it",
        "Drupal only reads services.yml during composer install",
        "Arguments must be objects, not '@id' strings, to be picked up",
      ],
      answerIndex: 1,
      explain:
        "Like Symfony's cached container, Drupal compiles and caches the container (in the `cache_container` bin, database-backed by default). There's no dev auto-rebuild watcher, so services.yml edits require a cache rebuild via `drush cr`.",
    },
  ],
};

export default lesson;
