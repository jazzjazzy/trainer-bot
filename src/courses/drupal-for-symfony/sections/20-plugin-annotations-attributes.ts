import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "plugin-annotations-attributes",
  title: "Plugin Annotations & PHP Attributes",
  part: "Extending Drupal",
  estMinutes: 11,
  summary:
    "How Drupal plugins declare their metadata — Doctrine-style @Block() annotations in older code, and the PHP 8 #[Block(...)] attributes of Drupal 10.2+/11 that mirror Symfony's #[Route]/#[AsCommand].",

  concept: `
As a Symfony developer you already write plugin-style metadata as **PHP
attributes**: \`#[Route(...)]\` on a controller, \`#[AsCommand(...)]\` on a command,
\`#[AsEventListener]\` on a listener. Symfony's DI/console layer reads those
attributes via reflection and builds a registry. Drupal's **plugin system** works
the same way conceptually — a *plugin manager* scans classes in a known
namespace, reads their metadata, and caches a definitions table — but for years
that metadata lived in a **docblock annotation**, not a real attribute.

### The old way: Doctrine-style annotations

Before Drupal 10.2, a block plugin declared itself with an \`@Block(...)\`
annotation parsed out of the class docblock — the same Doctrine annotation engine
Symfony used before it moved to native attributes:

\`\`\`php
/**
 * @Block(
 *   id = "hello_block",
 *   admin_label = @Translation("Hello block"),
 *   category = @Translation("Custom"),
 * )
 */
class HelloBlock extends BlockBase { /* ... */ }
\`\`\`

Note the quirks a Symfony dev will recognise from the pre-attribute era: \`=\` not
\`:\`, nested \`@Translation(...)\` pseudo-annotations, and the fact it is a
**comment** — invisible to the PHP engine, parsed by a separate library.

### The modern way: PHP 8 attributes

Drupal 10.2 added native attribute support for plugins, and Drupal 11 makes them
the default in generated code. The same block becomes:

\`\`\`php
use Drupal\\Core\\Block\\Attribute\\Block;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup;

#[Block(
  id: 'hello_block',
  admin_label: new TranslatableMarkup('Hello block'),
  category: new TranslatableMarkup('Custom'),
)]
class HelloBlock extends BlockBase { /* ... */ }
\`\`\`

This is exactly the ergonomics you know: named arguments with \`:\`, real objects
(\`new TranslatableMarkup(...)\` replaces \`@Translation(...)\`), and the metadata is
now part of the language, checked by your IDE and static analysers.

### What actually changed — and what didn't

Only the **transport of the metadata** changed. The plugin id, the discovery
namespace (\`Drupal\\my_module\\Plugin\\Block\`), the base class, and the manager
that collects definitions are all identical. Both forms are still supported in
Drupal 10.2–11, so a real codebase mixes them; contrib is migrating class by
class. Two practical notes:

- Each plugin **type** ships its own attribute class (\`Block\`,
  \`FieldType\`, \`FieldFormatter\`, \`QueueWorker\`, …) under that component's
  \`...\\Attribute\\\` namespace — import the right one.
- Attributes are **not** used for routing (that stays YAML) or for service
  definitions (\`*.services.yml\`); they replaced *plugin annotations* only.

The takeaway: when you see \`#[Block(...)]\`, read it as "the Symfony attribute
pattern, finally applied to Drupal's plugin discovery." You are already fluent.
`,

  comparisons: [
    {
      label: "The same Block plugin: annotation vs attribute",
      intro:
        "One block plugin, two declarations. The pre-10.2 form parses a Doctrine annotation out of the docblock; the 10.2+/11 form uses a native PHP 8 attribute. The class body is identical.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Drupal < 10.2 — Doctrine-style annotation (a docblock comment)
namespace Drupal\\my_module\\Plugin\\Block;

use Drupal\\Core\\Block\\BlockBase;

/**
 * @Block(
 *   id = "hello_block",
 *   admin_label = @Translation("Hello block"),
 *   category = @Translation("Custom"),
 * )
 */
final class HelloBlock extends BlockBase {
  public function build(): array {
    return ['#markup' => $this->t('Hello!')];
  }
}`,
      ts: `<?php
// Drupal 10.2+/11 — native PHP 8 attribute (the modern default)
namespace Drupal\\my_module\\Plugin\\Block;

use Drupal\\Core\\Block\\Attribute\\Block;
use Drupal\\Core\\Block\\BlockBase;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup;

#[Block(
  id: 'hello_block',
  admin_label: new TranslatableMarkup('Hello block'),
  category: new TranslatableMarkup('Custom'),
)]
final class HelloBlock extends BlockBase {
  public function build(): array {
    return ['#markup' => $this->t('Hello!')];
  }
}`,
      note:
        "@Translation(\"...\") becomes new TranslatableMarkup('...'); '=' becomes ':'; and you must import the specific attribute class Drupal\\Core\\Block\\Attribute\\Block.",
    },
    {
      label: "You already do this in Symfony",
      intro:
        "The Drupal attribute is the same reflection-driven metadata pattern Symfony uses for commands and routes. Recognising the shape is most of the learning.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony 6.4/7 — metadata as a native attribute on the class
namespace App\\Command;

use Symfony\\Component\\Console\\Attribute\\AsCommand;
use Symfony\\Component\\Console\\Command\\Command;

#[AsCommand(
  name: 'app:hello',
  description: 'Say hello',
)]
final class HelloCommand extends Command { /* ... */ }`,
      ts: `<?php
// Drupal 10.2+/11 — metadata as a native attribute on the plugin class
namespace Drupal\\my_module\\Plugin\\Block;

use Drupal\\Core\\Block\\Attribute\\Block;
use Drupal\\Core\\Block\\BlockBase;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup;

#[Block(
  id: 'hello_block',
  admin_label: new TranslatableMarkup('Hello block'),
)]
final class HelloBlock extends BlockBase { /* ... */ }`,
      note:
        "Same mechanism, different registry: Symfony's console/DI reads #[AsCommand]; Drupal's plugin manager reads #[Block]. Both are cached after discovery.",
    },
    {
      label: "A different plugin type = a different attribute class",
      intro:
        "There is no single generic attribute. Each plugin type defines its own attribute under that component's Attribute namespace — just as Symfony has distinct #[Route], #[AsCommand], #[AsEventListener].",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony — the attribute name tells you the extension point
use Symfony\\Component\\Routing\\Attribute\\Route;
use Symfony\\Component\\Console\\Attribute\\AsCommand;
use Symfony\\Component\\EventDispatcher\\Attribute\\AsEventListener;

// #[Route(...)], #[AsCommand(...)], #[AsEventListener(...)]`,
      ts: `<?php
// Drupal — one attribute class per plugin type, same idea
use Drupal\\Core\\Block\\Attribute\\Block;
use Drupal\\Core\\Field\\Attribute\\FieldType;
use Drupal\\Core\\Field\\Attribute\\FieldFormatter;
use Drupal\\Core\\Queue\\Attribute\\QueueWorker;

// #[Block(...)], #[FieldType(...)], #[FieldFormatter(...)], #[QueueWorker(...)]`,
      note:
        "Import the attribute that matches the plugin base class and Plugin/<Type> namespace you are extending. Mixing them up is the most common migration slip.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A tiny model of a Drupal plugin manager. In real Drupal it reads #[Block] attributes via reflection; here we hand it two plugin classes and let it build the cached definitions table, exactly as AttributedClassDiscovery would. Predict the printed table before revealing.",
    code: `<?php
declare(strict_types=1);

// Stand-in for the #[Block] attribute Drupal reads via reflection.
#[Attribute]
final class Block {
  public function __construct(
    public string $id,
    public string $admin_label,
    public string $category = 'Custom',
  ) {}
}

// Two plugin classes discovered in Drupal\\my_module\\Plugin\\Block.
#[Block(id: 'hello_block', admin_label: 'Hello block')]
final class HelloBlock {}

#[Block(id: 'clock_block', admin_label: 'Clock', category: 'System')]
final class ClockBlock {}

// The plugin manager: scan classes, read the attribute, cache definitions.
function buildDefinitions(array $classes): array {
  $definitions = [];
  foreach ($classes as $class) {
    $ref = new ReflectionClass($class);
    $attrs = $ref->getAttributes(Block::class);
    if ($attrs === []) {
      continue; // no #[Block] -> not a block plugin
    }
    $meta = $attrs[0]->newInstance();
    $definitions[$meta->id] = [
      'class' => $class,
      'admin_label' => $meta->admin_label,
      'category' => $meta->category,
    ];
  }
  return $definitions;
}

$defs = buildDefinitions([HelloBlock::class, ClockBlock::class]);

foreach ($defs as $id => $def) {
  echo $id . ' => ' . $def['admin_label'] . ' [' . $def['category'] . "]\\n";
}
echo 'Total plugins: ' . count($defs) . "\\n";`,
    output: `hello_block => Hello block [Custom]
clock_block => Clock [System]
Total plugins: 2`,
  },

  keyPoints: [
    "Drupal plugins carry metadata (id, admin_label, category) that a plugin manager discovers and caches — the same reflection-registry pattern behind Symfony's `#[Route]`/`#[AsCommand]`.",
    "Pre-10.2 Drupal used Doctrine-style `@Block(...)` docblock annotations with `=` and nested `@Translation(\"...\")`.",
    "Drupal 10.2 added native PHP 8 attributes for plugins; Drupal 11 generates them by default: `#[Block(id: '...', admin_label: new TranslatableMarkup('...'))]`.",
    "Migrating: `=` becomes `:`, `@Translation(\"x\")` becomes `new TranslatableMarkup('x')`, and you import the plugin type's attribute class.",
    "Each plugin type has its own attribute class (`Block`, `FieldType`, `FieldFormatter`, `QueueWorker`) under that component's `...\\Attribute\\` namespace.",
    "Attributes replaced plugin annotations only — routing stays in YAML and services stay in `*.services.yml`.",
  ],

  interview: [
    {
      q: "Explain Drupal's plugin annotations to attributes migration to someone coming from Symfony.",
      a: "Drupal plugins have always needed metadata — an \`id\`, a human label, a category — so a plugin manager can discover and cache them, much like Symfony builds a registry from \`#[Route]\` or \`#[AsCommand]\`. Historically that metadata lived in a Doctrine-style docblock annotation, \`@Block(id = \"...\", admin_label = @Translation(\"...\"))\`, parsed by the same annotation library Symfony used before native attributes. Drupal 10.2 added PHP 8 attribute support for plugins, and Drupal 11 emits them by default, so the same class now uses \`#[Block(id: '...', admin_label: new TranslatableMarkup('...'))]\`. Only the transport changed — the discovery namespace, base class, and manager are unchanged — so both forms coexist and contrib is converting incrementally.",
    },
    {
      q: "When converting a plugin from an annotation to an attribute, what concrete edits do you make?",
      a: "Swap the docblock \`@Block(...)\` for a real \`#[Block(...)]\` attribute above the class. Change every \`=\` to \`:\` for named arguments, and replace each nested \`@Translation(\"Label\")\` with \`new TranslatableMarkup('Label')\`. Add the imports: the plugin type's attribute class (for a block, \`use Drupal\\\\Core\\\\Block\\\\Attribute\\\\Block;\`) and \`use Drupal\\\\Core\\\\StringTranslation\\\\TranslatableMarkup;\`. The class body, namespace, and base class stay exactly the same, and you clear caches (\`drush cr\`) so the manager rebuilds its definitions table.",
    },
    {
      q: "Does Drupal use PHP attributes for routing and services too, now that it has them?",
      a: "No — and that is a useful distinction to state in an interview. Attributes in Drupal 10.2/11 replaced *plugin* annotations specifically: blocks, field types, field formatters, queue workers, and similar. Routing still lives in \`MODULE.routing.yml\` and service definitions still live in \`MODULE.services.yml\`, both as YAML. So unlike Symfony, where \`#[Route]\` sits on the controller, a Drupal route is never an attribute; the attribute pattern is scoped to the plugin system's discovery layer.",
    },
  ],

  quiz: [
    {
      question:
        "In a Drupal 11 block plugin using PHP attributes, what replaces the old `admin_label = @Translation(\"Hello\")`?",
      options: [
        "admin_label: t('Hello')",
        "admin_label: new TranslatableMarkup('Hello')",
        "admin_label = new Translation('Hello')",
        "admin_label: @Translation('Hello')",
      ],
      answerIndex: 1,
      explain:
        "Inside a native attribute you pass real objects, so the nested @Translation pseudo-annotation becomes new TranslatableMarkup('Hello'), and '=' becomes ':'. You also import Drupal\\Core\\StringTranslation\\TranslatableMarkup.",
    },
    {
      question:
        "From which Drupal version can plugins be declared with native PHP 8 attributes instead of annotations?",
      options: ["Drupal 8.0", "Drupal 9.4", "Drupal 10.2", "Drupal 11.1 only"],
      answerIndex: 2,
      explain:
        "Attribute-based plugin discovery landed in Drupal 10.2 and is the default in generated code from Drupal 11. Both annotations and attributes are supported in 10.2 through 11 so codebases can migrate gradually.",
    },
    {
      question:
        "A Symfony developer says: 'Great, so I can put #[Route] on my Drupal controller now.' What is the correct response?",
      options: [
        "Yes, routing attributes work exactly like Symfony since Drupal 10.2.",
        "No — attributes replaced plugin annotations only; routes stay in MODULE.routing.yml.",
        "No — Drupal removed attributes again in Drupal 11.",
        "Yes, but only if you also add the route to services.yml.",
      ],
      answerIndex: 1,
      explain:
        "Drupal's attribute support is scoped to the plugin system (blocks, field types, etc.). Routing remains YAML in MODULE.routing.yml and services remain YAML in MODULE.services.yml, so #[Route] on a controller is not a thing in Drupal.",
    },
  ],
};

export default lesson;
