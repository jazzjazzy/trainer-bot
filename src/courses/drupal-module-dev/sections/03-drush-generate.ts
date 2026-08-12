import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "drush-generate",
  title: "Scaffolding with drush generate",
  part: "Module Anatomy & Scaffolding",
  estMinutes: 10,
  summary:
    "Use drush generate — Drupal's MakerBundle — to scaffold modules, controllers, forms, services, and block plugins, then read the generated code as a living style guide.",

  concept: `
In Symfony you scaffold with **MakerBundle**: \`make:controller\`,
\`make:form\`, \`make:command\`. Drupal's equivalent is **\`drush generate\`**,
powered by the standalone **Drupal Code Generator** (DCG) library that ships
inside Drush 12/13. Run \`drush generate\` with no arguments to list every
generator; run a named one and it walks you through interactive prompts, then
writes files into \`modules/custom/…\` (or wherever \`--destination\` points).

### The generators you will actually use

- \`drush generate module\` — asks for name, machine name, description,
  package, and dependencies, then offers to create the \`.info.yml\`,
  \`.module\`, \`.install\`, \`README.md\`, and more. This is how
  \`incident_tracker\` was born.
- \`drush generate controller\` — a controller class (optionally with injected
  services) **plus** the matching \`.routing.yml\` entry.
- \`drush generate form:simple\` / \`form:config\` / \`form:confirm\` — a
  \`FormBase\` or \`ConfigFormBase\` class with its route.
- \`drush generate service:custom\` — a class plus its \`.services.yml\`
  registration (autowiring is not assumed — you will see explicit arguments).
- \`drush generate plugin:block\` — a block plugin class. DCG 4 (bundled with
  Drush 13 on Drupal 11+) emits a PHP \`#[Block]\` **attribute**; DCG 3 — the
  only line composer can install on Drupal 10, even 10.2+ where core itself
  supports attribute discovery — still writes the legacy \`@Block\`
  annotation. The flip follows the generator (DCG) version, not a runtime
  check of your core.

Every generator accepts \`--answer\` (positional answers in prompt order, for
scripting/CI), \`--dry-run\` (print the code, write nothing), and
\`--destination\`.

### Generate, then READ what it wrote

Treat the scaffold as a teacher, not a black box. DCG templates are maintained
against current core, so the output *is* today's best practice: strict types,
\`final\` classes, constructor property promotion, the \`create()\` factory
pattern for dependency injection, attribute-based plugin discovery. When you
are unsure how modern Drupal wants something written, generating a throwaway
example with \`--dry-run\` is faster and more reliable than a blog post from
2019.

### Themes

Two options: \`drush generate theme\` (DCG again), or core's own starterkit
script — \`php core/scripts/drupal generate-theme my_theme\` — which clones
the Starterkit theme into a standalone theme you own. The core script is the
recommended way to begin a real theme since Drupal 10.

### When NOT to scaffold

A three-line \`hook_cron()\` does not need a generator — open the \`.module\`
file and type it (or, on Drupal 11.1+, add a \`#[Hook('cron')]\` method to a
hook class). Generators earn their keep on boilerplate-heavy artifacts:
plugins, forms, controllers with DI, install files. Also be careful running
generators inside a module that already has files — DCG asks before replacing
an existing file, but \`--dry-run\` first is the safe habit.
`,

  comparisons: [
    {
      label: "Scaffolding a controller from the CLI",
      intro:
        "Both tools interview you and then write files. MakerBundle takes the class name as an argument; drush generate prompts for the owning module, the class, optional DI, and the route — because Drupal routes live in YAML, not attributes.",
      php: `$ symfony console make:controller ReportController

 created: src/Controller/ReportController.php
 created: templates/report/index.html.twig

  Success!

 Next: Open your new controller class and add some pages!`,
      ts: `$ drush generate controller

 Welcome to controller generator!
––––––––––––––––––––––––––––––––

 Module machine name:
 ➤ incident_tracker

 Module name [Incident tracker]:
 ➤ Incident Tracker

 Class [IncidentTrackerController]:
 ➤ ReportController

 Would you like to inject dependencies? [No]:
 ➤ Yes

 Type the service name (press enter to continue):
 ➤ database

 Would you like to create a route for this controller? [Yes]:
 ➤ Yes

 Route name [incident_tracker.report]:
 ➤ incident_tracker.reports

 Route path [/incident-tracker/report]:
 ➤ /reports/incidents

 Route title [Report]:
 ➤ Incident reports

 Route permission [access content]:
 ➤ access content

 The following files have been created or updated:
 • incident_tracker/incident_tracker.routing.yml
 • incident_tracker/src/Controller/ReportController.php`,
      note:
        "drush generate wrote TWO files: the class and a routing.yml entry. MakerBundle writes none for routing because Symfony routes are attributes on the class itself.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "What the scaffold teaches: DI boilerplate",
      intro:
        "Read what each tool generated. Symfony's controller relies on autowiring; Drupal's shows the create() factory pattern, because Drupal controllers are not autowired — the scaffold hands you the exact idiom to copy.",
      php: `<?php
// src/Controller/ReportController.php — make:controller output
namespace App\\Controller;

use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;

class ReportController extends AbstractController
{
    #[Route('/report', name: 'app_report')]
    public function index(): Response
    {
        return $this->render('report/index.html.twig');
    }
}`,
      ts: `<?php
// src/Controller/ReportController.php — drush generate output
declare(strict_types=1);

namespace Drupal\\incident_tracker\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;
use Drupal\\Core\\Database\\Connection;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;

/**
 * Returns responses for Incident Tracker routes.
 */
final class ReportController extends ControllerBase {

  public function __construct(
    private readonly Connection $connection,
  ) {}

  public static function create(ContainerInterface $container): self {
    return new self(
      $container->get('database'),
    );
  }

  public function __invoke(): array {

    $build['content'] = [
      '#type' => 'item',
      '#markup' => $this->t('It works!'),
    ];

    return $build;
  }

}`,
      note:
        "The generated create() method is the canonical Drupal DI idiom (next part of the course). Two details worth copying exactly: the response method is __invoke(), because the route DCG wrote alongside it says `_controller: '\\Drupal\\incident_tracker\\Controller\\ReportController'` with no ::method suffix — Drupal only resolves that against __invoke(). And watch which service you inject: ControllerBase already declares protected $entityTypeManager, $configFactory, $currentUser, $moduleHandler, $formBuilder (plus $messenger via MessengerTrait), so promoting a readonly property with one of those names is a fatal 'Cannot redeclare non-readonly property … as readonly'. Inject `database` (as $connection here) and the collision disappears.",
    },
    {
      label: "Attribute plugins straight from the generator",
      intro:
        "Block plugins have no direct Symfony analogue — the closest feel is a Twig component. Note what drush generate plugin:block emits on Drupal 11 (Drush 13 / DCG 4): a PHP #[Block] attribute, not the legacy @Block annotation.",
      php: `<?php
// Symfony's closest analogue: make:twig-component
namespace App\\Twig\\Components;

use Symfony\\UX\\TwigComponent\\Attribute\\AsTwigComponent;

#[AsTwigComponent]
final class RecentIncidents
{
    public int $limit = 5;
}`,
      ts: `<?php
// drush generate plugin:block — Drupal 11 (Drush 13 / DCG 4) output
declare(strict_types=1);

namespace Drupal\\incident_tracker\\Plugin\\Block;

use Drupal\\Core\\Block\\Attribute\\Block;
use Drupal\\Core\\Block\\BlockBase;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup;

#[Block(
  id: 'incident_tracker_recent',
  admin_label: new TranslatableMarkup('Recent incidents'),
  category: new TranslatableMarkup('Incident Tracker'),
)]
final class RecentIncidentsBlock extends BlockBase {

  public function build(): array {
    return ['#markup' => $this->t('Latest incidents appear here.')];
  }

}`,
      note:
        "Attribute-based plugin discovery landed in core 10.2, but the generated code follows the DCG version, not a runtime core check: DCG 4 (bundled with Drush 13 on Drupal 11+) writes this attribute, while any Drupal 10 site — 10.2+ included — gets DCG 3, whose block template still emits a legacy @Block annotation in a docblock.",
    },
    {
      label: "Scripting the generator (CI, repeatability)",
      intro:
        "Both tools can run non-interactively. MakerBundle takes arguments and --no-interaction; drush generate takes repeated --answer flags matching the prompts in order, and --dry-run to preview without writing.",
      php: `# MakerBundle: name as argument, defaults for the rest
symfony console make:controller ReportController \\
  --no-interaction

# MakerBundle previews nothing — it writes immediately`,
      ts: `# DCG: positional --answer flags, one per prompt
drush generate controller \\
  --answer=incident_tracker \\
  --answer='Incident Tracker' \\
  --answer=ReportController \\
  --answer=no \\
  --answer=yes \\
  --answer=incident_tracker.reports \\
  --answer=/reports/incidents \\
  --answer='Incident reports' \\
  --answer='access content' \\
  --dry-run

# --dry-run prints the generated code, writes nothing
# --destination=web/modules/custom overrides the target dir`,
      note:
        "--answer values map to prompts in order, so run the generator interactively once to learn the sequence, then freeze it in a script. --dry-run is also the safe way to peek at best-practice boilerplate.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A miniature drush generate: prompts with defaults, positional answers standing in for --answer flags, and a code stub rendered with strtr() — the same interview-then-template flow Drupal Code Generator runs with Twig. Predict the console output, then reveal.",
    code: `<?php
// A miniature "drush generate": prompts with defaults, positional answers
// (like repeated --answer flags), then a stub rendered with strtr() —
// the same flow Drupal Code Generator runs with Twig templates.

function ask(string $prompt, string $default, string $answer): string {
    $value = $answer === '' ? $default : $answer;  // '' = user hit Enter
    echo " {$prompt} [{$default}]: {$value}\\n";
    return $value;
}

echo "Welcome to controller generator!\\n";
echo str_repeat('-', 32) . "\\n";

// Simulated --answer flags, in prompt order. '' accepts the default.
$answers = ['incident_tracker', 'ReportController', ''];

$module = ask('Module machine name', 'example', $answers[0]);
$class  = ask('Class', 'ExampleController', $answers[1]);
$di     = ask('Inject dependencies? (yes/no)', 'no', $answers[2]);

$stub = <<<'STUB'
namespace Drupal\\{module}\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;

final class {class} extends ControllerBase {

  public function __invoke(): array {

    $build['content'] = [
      '#type' => 'item',
      '#markup' => $this->t('It works!'),
    ];

    return $build;
  }

}
STUB;

echo "\\nThe following files have been created:\\n";
echo " • modules/custom/{$module}/src/Controller/{$class}.php\\n\\n";
echo strtr($stub, ['{module}' => $module, '{class}' => $class]) . "\\n";`,
    output: `Welcome to controller generator!
--------------------------------
 Module machine name [example]: incident_tracker
 Class [ExampleController]: ReportController
 Inject dependencies? (yes/no) [no]: no

The following files have been created:
 • modules/custom/incident_tracker/src/Controller/ReportController.php

namespace Drupal\\incident_tracker\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;

final class ReportController extends ControllerBase {

  public function __invoke(): array {

    $build['content'] = [
      '#type' => 'item',
      '#markup' => $this->t('It works!'),
    ];

    return $build;
  }

}
`,
  },

  keyPoints: [
    "`drush generate` is Drupal's MakerBundle, powered by the Drupal Code Generator (DCG) library bundled with Drush 12/13; run it bare to list every available generator.",
    "The workhorses: `drush generate module`, `controller` (class + routing.yml), `form:simple`/`form:config`/`form:confirm`, `service:custom` (class + services.yml), and `plugin:block`.",
    "Every generator supports `--answer` (positional, prompt order) for scripting, `--dry-run` to preview without writing, and `--destination` to pick the target directory.",
    "Generate, then READ: DCG output is current best practice — strict_types, final classes, the create() DI factory, and `#[Block]` attributes from DCG 4 (Drush 13 on Drupal 11+); DCG 3, the only line installable on Drupal 10, still emits `@Block` annotations even on 10.2+.",
    "For themes, prefer core's starterkit script `php core/scripts/drupal generate-theme my_theme`; `drush generate theme` also exists.",
    "Skip the generator for tiny hooks — type a three-line `hook_cron()` by hand (or a `#[Hook]` method on 11.1+); scaffold the boilerplate-heavy artifacts instead.",
  ],

  interview: [
    {
      q: "Coming from Symfony MakerBundle, how do you scaffold code in a Drupal project?",
      a: "With `drush generate`, which wraps the standalone Drupal Code Generator library that ships inside Drush 12/13. Running it bare lists all generators; a named one like `drush generate controller` interviews you — owning module, class name, services to inject, route path — and then writes the class *and* the `.routing.yml` entry, since Drupal routes live in YAML rather than attributes. The big generators mirror MakerBundle: `module`, `controller`, `form:simple`, `service:custom`, `plugin:block`. For automation there are `--answer` flags matching the prompts in order, plus `--dry-run` and `--destination`.",
    },
    {
      q: "Why would an experienced developer bother with generated boilerplate instead of writing it by hand?",
      a: "Because the scaffold encodes current best practice, which in Drupal moves with your toolchain. DCG's templates emit `declare(strict_types=1)`, final classes with promoted readonly constructor properties, the `create()` container-factory pattern for DI, and — with DCG 4, the version Drush 13 installs on Drupal 11+ — attribute-based plugins (`#[Block]`). On any Drupal 10 site composer resolves DCG 3, which still emits `@Block` annotations even though core 10.2+ supports attribute discovery — the output follows the generator version, not a runtime core check. Generating a throwaway example with `--dry-run` is the fastest way to see exactly what idiom your setup produces — more reliable than memory or an outdated tutorial. The habit is: generate, then read what it wrote.",
    },
    {
      q: "When would you NOT reach for drush generate?",
      a: "For anything smaller than its own boilerplate. A three-line `hook_cron()` implementation belongs directly in the `.module` file — or in a `#[Hook('cron')]` class method on Drupal 11.1+ — and running a generator for it is slower than typing it. Generators pay off on artifacts with real ceremony: plugins with attributes, forms with buildForm/validateForm/submitForm, controllers with `create()` DI, install files. I'd also run `--dry-run` before generating into a module that already has files, since some generators update shared files like `.routing.yml` or `.services.yml`.",
    },
  ],

  quiz: [
    {
      question: "What powers the `drush generate` command?",
      options: [
        "Symfony MakerBundle, bundled into Drupal core",
        "The Drupal Code Generator (DCG) library that ships with Drush",
        "Drupal Console, a separate global install",
        "A core module you must enable first",
      ],
      answerIndex: 1,
      explain:
        "`drush generate` wraps the standalone Drupal Code Generator library, which is a dependency of Drush 12/13. Drupal Console is an abandoned older tool; MakerBundle is Symfony-only.",
    },
    {
      question:
        "You run `drush generate controller` for incident_tracker and answer yes to creating a route. What gets written?",
      options: [
        "Only the controller class — routes are attributes on the class",
        "The controller class plus an entry in incident_tracker.routing.yml",
        "Only routing YAML; you write the class yourself",
        "A controller, a Twig template, and a CSS file",
      ],
      answerIndex: 1,
      explain:
        "Drupal routes live in `<module>.routing.yml`, not PHP attributes, so the generator writes (or updates) that YAML file alongside the controller class — unlike make:controller, which relies on a #[Route] attribute inside the class.",
    },
    {
      question:
        "On a Drupal 11 site running Drush 13 (DCG 4), `drush generate plugin:block` produces a class annotated how?",
      options: [
        "With an @Block annotation in the docblock",
        "With a #[Block] PHP attribute",
        "With no metadata — you register it in services.yml",
        "With a YAML plugin definition file",
      ],
      answerIndex: 1,
      explain:
        "Attribute-based plugin discovery arrived in core 10.2, but the generated code follows the DCG version: Drush 13 pulls DCG 4, whose block template emits a `#[Block]` attribute; a Drupal 11 site still pinned to Drush 12 gets DCG 3 and the legacy `@Block` annotation — the output tracks the generator, not core. On Drupal 10 — even 10.2+ — composer can only resolve DCG 3 (DCG 4 needs symfony/console ^7.1, while D10 pins ^6.4), so you always get the annotation there.",
    },
    {
      question:
        "Which flag previews everything a generator would write without touching the filesystem?",
      options: ["--simulate", "--preview", "--dry-run", "--answer"],
      answerIndex: 2,
      explain:
        "`--dry-run` prints the generated code without saving it — ideal for peeking at best-practice boilerplate or testing scripted `--answer` sequences. `--answer` supplies prompt responses, `--preview` doesn't exist, and Drush's global `--simulate` is not the generator's preview mechanism.",
    },
  ],
};

export default lesson;
