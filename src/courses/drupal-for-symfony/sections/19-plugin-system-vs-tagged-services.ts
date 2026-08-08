import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "plugin-system-vs-tagged-services",
  title: "The Plugin System vs Tagged Services",
  part: "Extending Drupal",
  estMinutes: 13,
  summary:
    "Drupal's Plugin API is a formalised, self-discovering version of Symfony's tagged-services-plus-locator pattern — a plugin manager finds classes by attribute/annotation and interface, then instantiates them lazily on demand.",

  concept: `
In Symfony, when you want many interchangeable pieces of one kind — payment
gateways, export formats, notification channels — you tag services and collect
them with \`!tagged_iterator\` or a service locator, then loop or pick one by key.
Drupal generalises exactly that idea into a first-class subsystem: the **Plugin
API**. Blocks, field types, field widgets and formatters, Views handlers, and
Migrate process steps are all plugins. If you understand tagged services, you
already understand 80% of plugins — Drupal just standardises the discovery,
metadata, and instantiation so every plugin type works the same way.

### The three moving parts

A Drupal plugin type is defined by three things:

- A **plugin manager** service (usually extending \`DefaultPluginManager\`) that
  discovers and instantiates plugins. This is the analogue of your Symfony
  service locator / tagged iterator, but it is a real service you inject.
- An **interface + base class** every plugin implements (e.g. \`BlockPluginInterface\`
  / \`BlockBase\`) — the contract, like the interface you'd \`AutoconfigureTag\` on
  in Symfony.
- A **discovery mechanism**: a PHP attribute (\`#[Block(...)]\`, Drupal 10.2+/11) or
  the older annotation (\`@Block(...)\`) placed on the class, which lives in a
  conventional namespace like \`Drupal\\mymodule\\Plugin\\Block\`.

You don't register a plugin in \`*.services.yml\`. You drop a class in the right
\`Plugin/\` folder with the right attribute and interface, and the manager finds
it by scanning — no tag, no wiring. That is the big shift from Symfony: discovery
is convention-driven, not container-declared.

### Why Drupal formalises it

Symfony's tagged services are deliberately minimal. Drupal adds three things a
CMS needs:

- **Metadata**: the attribute carries an id, admin label, category, etc., so the
  UI can list plugins to a non-developer without instantiating them.
- **Lazy instantiation**: definitions are cached and discovered cheaply; the
  class is only constructed when \`createInstance($id)\` is called.
- **Derivatives**: one plugin class can advertise *many* runtime instances (e.g.
  a "menu block" plugin that yields one block per menu) via a deriver — there is
  no clean Symfony equivalent.

### The mental mapping

\`\`\`text
Symfony                         Drupal
-----------------------------   -----------------------------
#[AutoconfigureTag('app.x')]    interface + #[Block(...)] attribute
!tagged_iterator app.x          the plugin manager service
locator->get($key)              $manager->createInstance($id)
the tagged class                the plugin class in Plugin/Block/
\`\`\`

Injecting a plugin manager is ordinary DI: \`@plugin.manager.block\` is a service
id you reference in \`*.services.yml\` (or fetch via \`\\Drupal::service()\` in
legacy code). From there, \`getDefinitions()\` lists everything discovered and
\`createInstance($id, $config)\` builds one — the same two operations you perform
on a Symfony tagged collection, just with richer metadata behind them.
`,

  comparisons: [
    {
      label: "Declaring one member of a family",
      intro:
        "In Symfony you tag a service so a collector can find it. In Drupal you place a class in Plugin/Block with a #[Block] attribute — no service entry, the manager discovers it by scanning.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony 6.4/7 — a tagged service
namespace App\\Export;

use Symfony\\Component\\DependencyInjection\\Attribute\\AutoconfigureTag;

#[AutoconfigureTag('app.exporter')]
interface ExporterInterface
{
    public function format(): string;
    public function export(array $rows): string;
}

final class CsvExporter implements ExporterInterface
{
    public function format(): string { return 'csv'; }
    public function export(array $rows): string { /* ... */ return ''; }
}`,
      ts: `// Drupal 10.2+/11 — a Block plugin (PHP attribute)
namespace Drupal\\mymodule\\Plugin\\Block;

use Drupal\\Core\\Block\\Attribute\\Block;
use Drupal\\Core\\Block\\BlockBase;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup;

#[Block(
  id: "hello_block",
  admin_label: new TranslatableMarkup("Hello block"),
  category: new TranslatableMarkup("Custom"),
)]
final class HelloBlock extends BlockBase {

  public function build(): array {
    return ['#markup' => $this->t('Hello, world!')];
  }
}`,
      note: "No *.services.yml entry for the plugin itself. Discovery is by namespace (Plugin/Block) + attribute + base class, not by container tag.",
    },
    {
      label: "Annotation vs attribute (Drupal 10 vs 10.2+/11)",
      intro:
        "Drupal is migrating plugin discovery from Doctrine-style annotations to native PHP attributes. Both are supported; new code should use attributes.",
      leftLang: "php",
      rightLang: "php",
      php: `// Older Drupal 10 style — annotation in a docblock
/**
 * @Block(
 *   id = "hello_block",
 *   admin_label = @Translation("Hello block"),
 *   category = @Translation("Custom"),
 * )
 */
final class HelloBlock extends BlockBase {
  public function build(): array {
    return ['#markup' => $this->t('Hello, world!')];
  }
}`,
      ts: `// Drupal 10.2+/11 — native PHP attribute
#[Block(
  id: "hello_block",
  admin_label: new TranslatableMarkup("Hello block"),
  category: new TranslatableMarkup("Custom"),
)]
final class HelloBlock extends BlockBase {
  public function build(): array {
    return ['#markup' => $this->t('Hello, world!')];
  }
}`,
      note: "@Translation() in annotations becomes new TranslatableMarkup(...) in attributes — attributes can't call the t() helper, so you pass the object directly.",
    },
    {
      label: "Consuming the collection",
      intro:
        "Symfony injects a tagged iterator or locator and you loop/select. Drupal injects the plugin manager and calls getDefinitions()/createInstance().",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony — inject the tagged iterator
final class ExportService
{
    /** @param iterable<ExporterInterface> $exporters */
    public function __construct(
        #[TaggedIterator('app.exporter')]
        private iterable $exporters,
    ) {}

    public function run(string $format, array $rows): string
    {
        foreach ($this->exporters as $e) {
            if ($e->format() === $format) {
                return $e->export($rows);
            }
        }
        throw new \\RuntimeException("No exporter for $format");
    }
}`,
      ts: `// Drupal — inject the plugin manager service
use Drupal\\Core\\Block\\BlockManagerInterface;

final class BlockLister {

  public function __construct(
    private readonly BlockManagerInterface $blockManager,
  ) {}

  public function listAndBuild(string $id): array {
    // getDefinitions() = the discovered metadata (cheap, cached).
    $all = $this->blockManager->getDefinitions();
    // createInstance() lazily constructs the plugin object.
    $plugin = $this->blockManager->createInstance($id, []);
    return $plugin->build();
  }
}`,
      note: "@plugin.manager.block is the injectable service id. getDefinitions() mirrors iterating the tagged set; createInstance() is the lazy build step Symfony's locator->get() gives you.",
    },
    {
      label: "Wiring a consumer in services.yml",
      intro:
        "Both frameworks reference the collection/manager as a service argument. Symfony can autowire; Drupal wires the manager by explicit id.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/services.yaml — Symfony
services:
  _defaults:
    autowire: true
    autoconfigure: true   # tags ExporterInterface implementors

  App\\Export\\ExportService: ~
  # #[TaggedIterator] on the constructor supplies the collection.`,
      ts: `# mymodule.services.yml — Drupal
services:
  mymodule.block_lister:
    class: Drupal\\mymodule\\BlockLister
    arguments:
      - '@plugin.manager.block'   # the block plugin manager
  # The block PLUGINS themselves are never listed here —
  # the manager discovers them from Plugin/Block by scanning.`,
      note: "You wire the manager, not the plugins. That inversion — plugins are found, not declared — is the defining difference from Symfony tagged services.",
    },
  ],

  playground: {
    intro:
      "This pure-PHP snippet models a plugin manager: it 'discovers' plugin definitions from attribute-like metadata, caches them, and instantiates one lazily via createInstance() — exactly what DefaultPluginManager does for Blocks in Drupal.",
    lang: "php",
    code: `<?php

// The base class/interface every plugin shares (like BlockBase).
interface BlockPlugin {
  public function build(): string;
}

// Two plugin classes, each carrying attribute-like metadata.
class HelloBlock implements BlockPlugin {
  public const DEF = ['id' => 'hello', 'admin_label' => 'Hello block'];
  public function build(): string { return 'Hello, world!'; }
}
class TimeBlock implements BlockPlugin {
  public const DEF = ['id' => 'time', 'admin_label' => 'Time block'];
  public function build(): string { return 'It is 09:00'; }
}

// A stand-in for DefaultPluginManager.
class BlockPluginManager {
  private array $definitions = [];   // cached, cheap metadata

  // "Discovery": scan classes and read their metadata (the attribute).
  public function discover(array $classes): void {
    foreach ($classes as $class) {
      $def = $class::DEF;
      $def['class'] = $class;
      $this->definitions[$def['id']] = $def;
    }
  }

  // Like getDefinitions(): list without instantiating anything.
  public function getDefinitions(): array {
    return $this->definitions;
  }

  // Like createInstance($id): lazily construct the plugin object.
  public function createInstance(string $id): BlockPlugin {
    $class = $this->definitions[$id]['class'];
    return new $class();
  }
}

$manager = new BlockPluginManager();
$manager->discover([HelloBlock::class, TimeBlock::class]);

echo "Discovered plugins:\\n";
foreach ($manager->getDefinitions() as $id => $def) {
  echo "  - $id => {$def['admin_label']}\\n";
}

$plugin = $manager->createInstance('hello');
echo "Built 'hello': " . $plugin->build() . "\\n";`,
    output: `Discovered plugins:
  - hello => Hello block
  - time => Time block
Built 'hello': Hello, world!`,
  },

  keyPoints: [
    "Drupal's Plugin API is a formalised tagged-services pattern: Blocks, field types, widgets/formatters, Views handlers, and Migrate process steps are all plugins.",
    "A plugin type = a manager service (like DefaultPluginManager) + an interface/base class + a discovery attribute/annotation in a conventional Plugin/ namespace.",
    "Plugins are DISCOVERED, not declared: you don't list a plugin in *.services.yml — you drop a class in Plugin/Block with #[Block(...)] and the manager scans for it.",
    "Symfony !tagged_iterator/locator maps to the plugin manager; loop-and-select maps to getDefinitions() + createInstance($id).",
    "Drupal 10.2+/11 use native PHP attributes (#[Block]); older Drupal 10 uses @Block annotations — @Translation becomes new TranslatableMarkup().",
    "Drupal adds metadata for the UI, lazy instantiation, and derivatives (one class advertising many instances) on top of the bare Symfony tag concept.",
  ],

  interview: [
    {
      q: "How would you explain Drupal's Plugin API to a Symfony developer in one breath?",
      a: "It's Symfony's tagged-services-plus-locator pattern, formalised into a reusable subsystem. Instead of tagging a service and collecting it with \`!tagged_iterator\`, you write a class implementing a plugin interface (e.g. \`BlockPluginInterface\`), decorate it with a \`#[Block(...)]\` attribute, and place it in a conventional namespace like \`Plugin/Block\`. A **plugin manager** service — the analogue of your Symfony locator — discovers it by scanning, caches the metadata, and instantiates it lazily via \`createInstance($id)\`. The key mental shift is that plugins are *discovered by convention*, not *declared in the container*.",
    },
    {
      q: "Why doesn't a Block plugin need an entry in *.services.yml, when a Symfony tagged service does?",
      a: "Because discovery is convention-driven rather than container-driven. Drupal's plugin managers scan known namespaces (like \`Drupal\\mymodule\\Plugin\\Block\`) for classes carrying the right attribute/annotation and implementing the right interface, then cache those definitions. You only declare the *manager* as a service (\`@plugin.manager.block\`) and inject that. In Symfony the container has no such scanning convention, so you must tag each implementation — via \`#[AutoconfigureTag]\` or an explicit tag — for the collector to find it.",
    },
    {
      q: "What can Drupal plugins do that Symfony tagged services can't easily?",
      a: "Two things stand out. First, **rich cached metadata**: the attribute carries an id, admin label, and category, so the UI can present plugins to a site builder without instantiating any of them. Second, **derivatives** — a single plugin class can advertise many runtime instances through a deriver, for example one menu-block plugin yielding a block per menu, which has no clean Symfony equivalent. Drupal also standardises lazy instantiation and configuration (\`createInstance($id, $config)\`) across every plugin type, whereas in Symfony each tagged collection is bespoke.",
    },
  ],

  quiz: [
    {
      question:
        "In Drupal, how does the block plugin manager find your custom Block class?",
      options: [
        "You register it in mymodule.services.yml with a 'block' tag",
        "It scans the Plugin/Block namespace for classes with the #[Block] attribute (or @Block annotation) implementing the block interface",
        "You add it to a plugins array in mymodule.info.yml",
        "It reads a compiler pass you wrote",
      ],
      answerIndex: 1,
      explain:
        "Plugins are discovered by convention: the manager scans the conventional Plugin/Block namespace for classes carrying the attribute/annotation and implementing the interface. Unlike Symfony tagged services, the plugin itself is not declared in *.services.yml.",
    },
    {
      question:
        "What is the closest Symfony analogue to a Drupal plugin manager's createInstance($id)?",
      options: [
        "Autowiring a constructor argument by type",
        "A service locator's get($key) call that lazily returns the chosen service",
        "The kernel.request event",
        "A Doctrine repository's find()",
      ],
      answerIndex: 1,
      explain:
        "createInstance($id) lazily builds the one plugin you asked for by its id — exactly what a Symfony service locator's get($key) does for a keyed collection of tagged services.",
    },
    {
      question:
        "You're writing a Block on Drupal 11 and want the modern discovery style. Which is correct?",
      options: [
        "A @Block annotation with admin_label = @Translation(\"...\")",
        "A #[Block(...)] PHP attribute with admin_label: new TranslatableMarkup(\"...\")",
        "A 'block:' key in mymodule.services.yml",
        "A getSubscribedEvents() method returning the block id",
      ],
      answerIndex: 1,
      explain:
        "Drupal 10.2+/11 use native PHP attributes. Because an attribute can't call the t() helper, the translatable admin_label is passed as a new TranslatableMarkup(...) object rather than @Translation(...).",
    },
  ],
};

export default lesson;
