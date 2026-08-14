import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "injecting-services",
  title: "Injecting Services: The create() Pattern in Practice",
  part: "Services, DI & Business Logic",
  estMinutes: 12,
  summary:
    "Drill the ContainerInjectionInterface pattern into muscle memory: promoted-property constructors plus a static create() whose arguments must line up with the constructor, in incident_tracker's controller and form.",

  concept: `
You know *why* Drupal needs \`create()\` — the compiled container never reflects
on your constructor. This section is the *drill*: wiring incident_tracker's
controller and form exactly the way core does it in D10/11, and learning the
two mistakes that cost real debugging hours.

### The shape, always the same

\`ControllerBase\` and \`FormBase\` **already implement**
\`ContainerInjectionInterface\`, so for classes extending them you never re-add
the interface — you **override create()** and write a constructor. Their
default \`create()\`s depend on the core version, though: \`ControllerBase\` has
used \`AutowireTrait\` since **10.2** and \`FormBase\` since **11.4**; on
10.x–11.3 \`FormBase::create()\` was the bare \`return new static();\`. The
\`create()\` inherited from \`AutowireTrait\` reflects on your constructor and
tries to autowire each parameter by type-hint or \`#[Autowire]\` attribute —
succeeding where an interface alias or class-name service ID exists (core
aliases \`TimeInterface\` to \`datetime.time\`, for example) and throwing an
autowiring error otherwise. Writing an explicit \`create()\` remains the
universal, recommended drill:

\`\`\`php
public function __construct(
  protected IncidentRepository \$repository,   // promoted properties —
  protected TimeInterface \$time,              // core's D10/11 house style
) {}

public static function create(ContainerInterface \$container): static {
  return new static(
    \$container->get('incident_tracker.repository'),
    \$container->get('datetime.time'),
  );
}
\`\`\`

PHP 8 constructor property promotion collapses the old declare-assign-repeat
boilerplate; \`new static()\` (late static binding) keeps subclasses working.

### The order contract

\`create()\` feeds the constructor **positionally**. Two failure modes:

- **Cross-type swap** (a logger where the clock belongs): the typed parameter
  throws a \`TypeError\` — but at *runtime*, on the first request that builds
  the class, not at deploy time.
- **Same-interface swap** (two logger channels, two storages, two queues):
  **no error, ever**. Audit entries quietly land in the cron log.

Discipline: one \`\$container->get()\` per line, same order as the constructor,
and when you add a dependency you add it to *both* ends in the same commit.

### ControllerBase shortcuts vs. explicit injection

\`\$this->entityTypeManager()\`, \`\$this->currentUser()\`, \`\$this->config()\`
lazily fetch from the **global** container on first use. Convenient while
prototyping — but the dependencies become invisible, and a unit test now needs
\`\\Drupal::setContainer()\` bootstrapping. With explicit injection the test is
just \`new IncidentListController(\$mockRepo, \$mockTime)\`: no Drupal at all.

### The \\Drupal:: rule

\`\\Drupal::service()\` is a static service locator for code with **no object
lifecycle**: procedural hooks in \`.module\`, \`hook_update_N()\` in
\`.install\`, \`settings.php\` glue. Inside anything the container or a plugin
manager builds — controllers, forms, services, blocks, queue workers — it is a
code smell that hides dependencies and blocks unit testing. In **D11.1+**, even
hooks move into \`#[Hook]\` classes that are registered as *autowired services*,
so constructor injection reaches hooks too and the legitimate surface for
\`\\Drupal::\` keeps shrinking.

### Version note: autowiring is creeping in

The pieces arrived in stages: since **9.3** your module's \`services.yml\` can
set \`autowire: true\`; **10.1** added core's interface aliases for many
services (which is what makes autowiring practical); and **10.2** added
\`AutowireTrait\` — a generic \`create()\` that resolves promoted constructor
params by type or an \`#[Autowire(service: ...)]\` attribute — plus autowired
controllers. Nice DX — but the explicit \`create()\` you drill here works on
every 10.x/11.x site and is what you will read in nearly all contrib and
client code.
`,

  comparisons: [
    {
      label: "Controller DI: autowired constructor vs create()",
      intro:
        "Both controllers need the incident repository plus a clock. Symfony's container reads the type-hints; Drupal's ControllerBase gives you the interface for free but you still write the create() factory yourself.",
      php: `<?php
// Symfony 6.4/7 — constructor type-hints ARE the wiring.
namespace App\\Controller;

use App\\Repository\\IncidentRepository;
use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\Clock\\ClockInterface;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;

final class IncidentListController extends AbstractController
{
    public function __construct(
        private readonly IncidentRepository $repository, // autowired
        private readonly ClockInterface $clock,          // autowired
    ) {}

    #[Route('/incidents', name: 'incident_list')]
    public function __invoke(): Response
    {
        return $this->render('incident/list.html.twig', [
            'incidents' => $this->repository->findOpen(),
            'generated' => $this->clock->now(),
        ]);
    }
}`,
      ts: `<?php
// Drupal 10/11 — src/Controller/IncidentListController.php.
namespace Drupal\\incident_tracker\\Controller;

use Drupal\\Component\\Datetime\\TimeInterface;
use Drupal\\Core\\Controller\\ControllerBase;
use Drupal\\incident_tracker\\IncidentRepository;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;

// ControllerBase ALREADY implements ContainerInjectionInterface —
// don't re-add it. Override create() instead.
final class IncidentListController extends ControllerBase {

  public function __construct(
    protected IncidentRepository $repository,
    protected TimeInterface $time,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('incident_tracker.repository'), // 1st ctor arg
      $container->get('datetime.time'),               // 2nd ctor arg
    );
  }

  public function list(): array {
    return [
      '#theme' => 'item_list',
      '#title' => $this->t('Open incidents'),
      '#items' => array_map(
        fn ($incident) => $incident->label(),
        $this->repository->findOpen(),
      ),
    ];
  }
}`,
      note: "Same promoted-property constructor on both sides — Drupal just makes you write the factory that Symfony's autowiring generates invisibly. The get() lines must mirror the constructor order exactly.",
    },
    {
      label: "Form DI: form-type service vs FormBase::create()",
      intro:
        "The incident report form saves through the repository and timestamps with the time service. Symfony form types are autowired services; Drupal forms are built via ClassResolver, which calls the create() you provide.",
      php: `<?php
// Symfony 6.4/7 — form types are services; constructor is autowired.
namespace App\\Form;

use App\\Service\\SeverityProvider;
use Symfony\\Component\\Form\\AbstractType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\ChoiceType;
use Symfony\\Component\\Form\\FormBuilderInterface;

final class IncidentType extends AbstractType
{
    public function __construct(
        private readonly SeverityProvider $severities, // autowired
    ) {}

    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('title')
            ->add('severity', ChoiceType::class, [
                'choices' => $this->severities->choices(),
            ]);
    }
}`,
      ts: `<?php
// Drupal 10/11 — src/Form/IncidentReportForm.php.
namespace Drupal\\incident_tracker\\Form;

use Drupal\\Component\\Datetime\\TimeInterface;
use Drupal\\Core\\Form\\FormBase;
use Drupal\\Core\\Form\\FormStateInterface;
use Drupal\\incident_tracker\\IncidentRepository;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;

// FormBase already implements ContainerInjectionInterface too.
final class IncidentReportForm extends FormBase {

  public function __construct(
    protected IncidentRepository $repository,
    protected TimeInterface $time,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('incident_tracker.repository'),
      $container->get('datetime.time'),
    );
  }

  public function getFormId(): string {
    return 'incident_tracker_report_form';
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    $form['title'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Incident title'),
      '#required' => TRUE,
    ];
    $form['actions']['submit'] = [
      '#type' => 'submit',
      '#value' => $this->t('Log incident'),
    ];
    return $form;
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $this->repository->log(
      $form_state->getValue('title'),
      $this->time->getRequestTime(),
    );
    $this->messenger()->addStatus($this->t('Incident logged.'));
  }
}`,
      note: "Forget to override create() on Drupal 10.x–11.3 and FormBase's default `return new static();` runs — with required constructor params that's a loud ArgumentCountError the moment the form is built. Since 11.4 FormBase uses AutowireTrait too, so the inherited create() autowires the constructor instead and only errors when a parameter can't be resolved.",
    },
    {
      label: "The order pitfall: same interface, two services",
      intro:
        "Both sides need TWO logger channels (audit + cron). Symfony resolves each parameter independently by name or attribute; Drupal's create() is purely positional — swapping two same-interface lines produces no error at all.",
      php: `<?php
// Symfony 6.4/7 — each parameter resolved on its own.
namespace App\\Service;

use Psr\\Log\\LoggerInterface;
use Symfony\\Component\\DependencyInjection\\Attribute\\Autowire;

final class IncidentNotifier
{
    public function __construct(
        // MonologBundle binds by PARAMETER NAME to the channel
        // ("auditLogger" -> monolog channel "audit")...
        private readonly LoggerInterface $auditLogger,
        // ...or you pin the exact service explicitly:
        #[Autowire(service: 'monolog.logger.cron')]
        private readonly LoggerInterface $cronLogger,
    ) {}
}
// Order can't silently break: the container matches each
// parameter by name/attribute, not by position.`,
      ts: `<?php
// Drupal 10/11 — src/IncidentNotifier.php. create() is POSITIONAL.
// incident_tracker.services.yml declares both CHANNELS as services:
//   logger.channel.incident_tracker  (audit trail)
//   logger.channel.incident_cron     (cron runs)
namespace Drupal\\incident_tracker;

use Drupal\\Core\\DependencyInjection\\ContainerInjectionInterface;
use Psr\\Log\\LoggerInterface;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;

// NOT a ControllerBase/FormBase subclass, so declare the interface
// yourself — that is the only thing that makes Drupal call create():
//   \\Drupal::classResolver(IncidentNotifier::class)
final class IncidentNotifier implements ContainerInjectionInterface {

  public function __construct(
    protected LoggerInterface $auditLog,
    protected LoggerInterface $cronLog,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      // Swap these two lines and the module still "works" —
      // audit entries just land in the cron channel. No error.
      $container->get('logger.channel.incident_tracker'),
      $container->get('logger.channel.incident_cron'),
    );
  }
}

// Register the class in services.yml instead and create() is never
// called — the container builds it from the arguments: list, where
// the identical swap is just as silent (section 07):
//   incident_tracker.notifier:
//     class: Drupal\\incident_tracker\\IncidentNotifier
//     arguments:
//       - '@logger.channel.incident_tracker'
//       - '@logger.channel.incident_cron'`,
      note: "Two mechanisms, one trap: ClassResolver-built classes need ContainerInjectionInterface for create() to run at all, services.yml classes are built from arguments: — both purely positional. Cross-TYPE swaps at least throw a runtime TypeError; same-interface swaps are silent. One get() (or one '@id') per line, in constructor order, reviewed as a pair.",
    },
    {
      label: "Where static service lookup is (and isn't) allowed",
      intro:
        "Symfony simply has no blessed static container access — injection is the only way. Drupal keeps \\Drupal::service() for procedural code that no container builds, and ONLY there.",
      php: `<?php
// Symfony 6.4/7 — there is no \\Symfony::service(). Ever.
// If code needs a service, the code becomes a service and injects it.
namespace App\\Service;

use App\\Repository\\IncidentRepository;

final class IncidentPurger
{
    public function __construct(
        private readonly IncidentRepository $repository,
    ) {}

    public function purge(): int
    {
        return $this->repository->deleteResolvedOlderThan('-30 days');
    }
}`,
      ts: `<?php
// Drupal — incident_tracker.module: procedural hook, no object
// context, nothing calls create(). \\Drupal:: is the accepted tool.
use Drupal\\Core\\Session\\AccountInterface;

function incident_tracker_user_login(AccountInterface $account): void {
  \\Drupal::service('incident_tracker.repository')
    ->logLogin((int) $account->id());
}

// Inside a controller/form/service/plugin this is a code smell:
//   $repo = \\Drupal::service('incident_tracker.repository'); // NO
// — it hides the dependency and forces unit tests to bootstrap a
// global container. Use the constructor + create() drill instead.

// D11.1+: hooks can live in #[Hook] classes under src/Hook/, which
// core registers as AUTOWIRED services — so constructor injection
// reaches hooks too, and \\Drupal:: shrinks to .install/settings glue.`,
      note: "Rule of thumb: if the class has (or could have) a create() or lives in services.yml, \\Drupal:: is banned inside it. Procedural .module / .install code is the exception, and D11.1's #[Hook] classes shrink even that.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Plain PHP model of the create() order contract: a fake container, the interface, one controller wired correctly, one with two same-interface loggers swapped, and one cross-type mistake. Predict all three outcomes before running.",
    code: `<?php
// Minimal stand-in for the Drupal/Symfony container: service ID => object.
final class Container {
  public function __construct(private array $services) {}
  public function get(string $id): object { return $this->services[$id]; }
}

// Two services that share ONE interface — the type system cannot tell
// them apart, which is exactly where create() ordering bugs hide.
interface LoggerChannelInterface { public function log(string $msg): void; }
final class LoggerChannel implements LoggerChannelInterface {
  public function __construct(private string $channel) {}
  public function log(string $msg): void { echo "[{$this->channel}] {$msg}\\n"; }
}
final class Clock { public function now(): string { return '2026-08-08 10:00'; } }

// Drupal's contract: a static factory that receives the container.
interface ContainerInjectionInterface {
  public static function create(Container $container): static;
}

// CORRECT: create() args line up 1:1 with the promoted-property constructor.
class IncidentController implements ContainerInjectionInterface {
  public function __construct(
    protected Clock $time,
    protected LoggerChannelInterface $auditLog, // channel: incident_tracker
    protected LoggerChannelInterface $cronLog,  // channel: cron
  ) {}
  public static function create(Container $container): static {
    return new static(
      $container->get('datetime.time'),
      $container->get('logger.channel.incident_tracker'),
      $container->get('logger.channel.cron'),
    );
  }
  public function report(): void {
    $this->auditLog->log('Incident logged at ' . $this->time->now());
  }
}

// BUG: same constructor, but create() swaps the two logger channels.
// Both satisfy LoggerChannelInterface, so PHP raises no error at all.
class SwappedController extends IncidentController {
  public static function create(Container $container): static {
    return new static(
      $container->get('datetime.time'),
      $container->get('logger.channel.cron'),             // wrong slot!
      $container->get('logger.channel.incident_tracker'), // wrong slot!
    );
  }
}

$container = new Container([
  'datetime.time' => new Clock(),
  'logger.channel.incident_tracker' => new LoggerChannel('incident_tracker'),
  'logger.channel.cron' => new LoggerChannel('cron'),
]);

echo "-- IncidentController::create() --\\n";
IncidentController::create($container)->report();

echo "-- SwappedController::create(), loggers swapped --\\n";
SwappedController::create($container)->report();

// Cross-TYPE mistakes DO fail loudly — promoted typed params catch them:
echo "-- Passing a logger where the Clock belongs --\\n";
try {
  new IncidentController(
    $container->get('logger.channel.cron'), // not a Clock
    $container->get('logger.channel.incident_tracker'),
    $container->get('logger.channel.cron'),
  );
} catch (TypeError) {
  echo "TypeError: constructor rejected the mis-ordered service\\n";
}`,
    output: `-- IncidentController::create() --
[incident_tracker] Incident logged at 2026-08-08 10:00
-- SwappedController::create(), loggers swapped --
[cron] Incident logged at 2026-08-08 10:00
-- Passing a logger where the Clock belongs --
TypeError: constructor rejected the mis-ordered service
`,
  },

  keyPoints: [
    "ControllerBase and FormBase already implement ContainerInjectionInterface — you override create(), you never re-declare the interface. Both now inherit AutowireTrait's create(), which tries to autowire constructor type-hints and throws an autowiring error when it can't — ControllerBase since 10.2, FormBase only since 11.4; on 10.x–11.3 FormBase's default create() was a bare `return new static();`.",
    "The drill is always the same: promoted-property constructor listing dependencies, static create() reading services by string ID, `return new static(...)` in the exact constructor order.",
    "create() is positional: cross-type swaps throw a runtime TypeError on the first request; same-interface swaps (two logger channels, two storages) fail silently — one get() per line, reviewed against the constructor.",
    "ControllerBase shortcuts like $this->entityTypeManager() lazily pull from the global container — fine for prototypes, but explicit injection lets unit tests do `new Controller($mock, ...)` with no Drupal bootstrap.",
    "\\Drupal::service() belongs only in procedural code (.module hooks, hook_update_N in .install) — never inside container-built classes; D11.1+ #[Hook] classes are autowired services, shrinking that surface further.",
    "Autowiring arrived in stages — services.yml `autowire: true` since 9.3, core's interface aliases in 10.1, AutowireTrait plus autowired controllers in 10.2 — but explicit create() remains the universal pattern across 10.x/11.x and contrib.",
  ],

  interview: [
    {
      q: "In Symfony you just type-hint a constructor. Walk me through the full wiring for a Drupal form that needs a custom service.",
      a: "The form class extends `FormBase`, which already implements `ContainerInjectionInterface`, so the form builder (via ClassResolver) knows to call a static `create(ContainerInterface $container)` instead of a bare `new`. You override create() to read each service by its string ID — e.g. `$container->get('incident_tracker.repository')` — and `return new static(...)`, passing them to a promoted-property constructor in the same order. From there `buildForm()`/`submitForm()` use `$this->repository` like any injected dependency. It's exactly what Symfony autowiring does for a form-type service, just written out by hand because Drupal's compiled container never reflects on constructors.",
    },
    {
      q: "What can go wrong with the create()/constructor ordering, and how do you defend against it?",
      a: "The arguments are purely positional, so there are two failure modes. Passing the wrong *type* (a logger where the clock belongs) throws a `TypeError` — but only at runtime, on the first request that builds the class, so it can sail through a sloppy deploy. Worse, swapping two services that share an interface — two logger channels, two entity storages — produces no error at all: audit messages just land in the cron log. Defenses are discipline (one `$container->get()` per line, mirroring constructor order, and reviewing both blocks as a pair), kernel/functional test coverage that actually builds the class, and where the site is D10.2+, `AutowireTrait` or `#[Autowire]` attributes that resolve by type instead of position.",
    },
    {
      q: "ControllerBase already gives you $this->entityTypeManager(). Why bother writing create() at all?",
      a: "Those helpers lazily fetch the service from the *global* container the first time they're called, which means the class's dependencies are invisible in its API and any unit test has to bootstrap a container with `\\Drupal::setContainer()`. With explicit constructor injection the dependencies are declared, and a unit test is just `new IncidentListController($mockRepo, $mockTime)` — no Drupal at all. The helpers are fine for a quick prototype or a one-liner controller, but production module code should inject explicitly; that's also the pattern core itself follows with promoted-property constructors in D10/11.",
    },
    {
      q: "Why is \\Drupal::service() acceptable in a .module file but banned in a controller?",
      a: "A `.module` file holds procedural hook functions — plain functions with no object lifecycle, so nothing ever calls a `create()` factory for them; the static locator is the only practical way to reach the container there (same for `hook_update_N()` in `.install`). A controller, by contrast, *is* built by the container via `ContainerInjectionInterface`, so using `\\Drupal::service()` inside it hides a dependency the class could have declared, couples it to global state, and breaks unit testing. Worth adding in an interview: since Drupal 11.1 hooks can live in `#[Hook]` classes that core registers as autowired services, so even hook code gets constructor injection and the legitimate uses of `\\Drupal::` keep shrinking.",
    },
  ],

  quiz: [
    {
      question:
        "On a Drupal 10.x–11.3 site, your IncidentReportForm extends FormBase with a promoted-property constructor requiring IncidentRepository — but you forget to override create(). What happens when the form loads?",
      options: [
        "The repository property is silently null",
        "FormBase's default create() runs `new static()` with no arguments, so PHP throws an ArgumentCountError",
        "Drupal autowires the constructor from the type-hint",
        "The form renders but submitForm() is never called",
      ],
      answerIndex: 1,
      explain:
        "Through Drupal 11.3, FormBase implemented ContainerInjectionInterface with a default create() that returns `new static();` (unlike ControllerBase, which has autowired via AutowireTrait since 10.2). With a required constructor parameter, that no-arg instantiation throws ArgumentCountError as soon as the form is built — a loud failure, unlike the silent null you'd get from a bare class that never implemented the interface at all. Drupal 11.4 added AutowireTrait to FormBase as well, so on 11.4+ the inherited create() autowires the constructor instead.",
    },
    {
      question:
        "In create() you accidentally swap the lines fetching 'logger.channel.incident_tracker' and 'logger.channel.incident_cron' — both typed LoggerInterface in the constructor. What happens?",
      options: [
        "A TypeError on the first request",
        "A container compile error at cache rebuild",
        "Nothing visible — code runs fine, but log entries go to the wrong channels",
        "Drupal detects the mismatch by parameter name and corrects it",
      ],
      answerIndex: 2,
      explain:
        "create() arguments are positional and both services satisfy LoggerInterface, so PHP's type checks pass and nothing errors. Messages simply land in the wrong channel. Only cross-TYPE swaps (a logger where a Clock belongs) throw a TypeError — and even that only at runtime, when the class is first built.",
    },
    {
      question: "Where is \\Drupal::service() an acceptable pattern?",
      options: [
        "Anywhere, as long as you add a @todo to inject it later",
        "In procedural code with no object context: .module hooks, hook_update_N() in .install",
        "Inside create(), instead of $container->get()",
        "In controllers, but only for core services",
      ],
      answerIndex: 1,
      explain:
        "\\Drupal:: is a static service locator for code that nothing constructs via the container — procedural hooks and install/update functions. Inside any container-built class (controller, form, service, plugin) you inject via create()/constructor instead. In D11.1+ even hooks can move into #[Hook] classes that are autowired services, shrinking the procedural surface further.",
    },
    {
      question:
        "Which statement about autowiring in modern Drupal (10.2+/11) is TRUE?",
      options: [
        "Drupal still has no autowiring support of any kind",
        "Your module's services.yml can set `autowire: true`, and core's AutowireTrait can generate create() from constructor type-hints",
        "Autowiring replaces create() everywhere, so ContainerInjectionInterface is deprecated",
        "Autowiring works for controllers but never for services",
      ],
      answerIndex: 1,
      explain:
        "Drupal's YamlFileLoader has honored `autowire: true` since 9.3; core added interface aliases for common services in 10.1, which is what makes it practical; and 10.2 added AutowireTrait — a generic create() that resolves promoted constructor params by type or #[Autowire] attribute — plus autowired controllers. But ContainerInjectionInterface is not deprecated — explicit create() remains the dominant, always-works pattern in core and contrib.",
    },
  ],
};

export default lesson;
