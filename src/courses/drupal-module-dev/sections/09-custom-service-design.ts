import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "custom-service-design",
  title: "Designing a Business-Logic Service",
  part: "Services, DI & Business Logic",
  estMinutes: 13,
  summary:
    "Refactor section 07's SeverityCalculator into IncidentSeverityCalculator, built the way you'd build any Symfony service — interface + implementation, injected dependencies, pure methods returning readonly value objects — registered with an interface alias and open to decoration by other modules.",

  concept: `
Section 07 gave incident_tracker its first service —
\`Drupal\\incident_tracker\\Service\\SeverityCalculator\`, whose
\`calculate()\` reached for \`@entity_type.manager\` and \`@config.factory\`.
This section **refactors it**. The service id
\`incident_tracker.severity_calculator\` stays exactly as it was, but the class
becomes \`Drupal\\incident_tracker\\IncidentSeverityCalculator\` at the root of
\`src/\` (Symfony side: \`App\\Service\\SeverityCalculator\` becomes
\`App\\Incident\\IncidentSeverityCalculator\`), and the entity/config
dependencies give way to scalars in and a value object out. The rename is
deliberate: swap the \`class:\` line in \`incident_tracker.services.yml\`,
delete the old file, and every consumer that asked for the id keeps working —
which is the whole payoff of depending on an id and an interface rather than a
class. Here's the good news up front: **your Symfony instincts are exactly
right in this section**. Same container, same design rules, same payoffs.

### Interface + implementation

Ship two files in \`src/\`: \`IncidentSeverityCalculatorInterface.php\` (the
contract) and \`IncidentSeverityCalculator.php\` (the implementation).
Consumers — controllers, forms, hooks — type-hint the **interface**, never the
class. In \`incident_tracker.services.yml\` you register the id
\`incident_tracker.severity_calculator\` pointing at the class, then add one
extra line: an **alias from the interface FQCN to the id**. Drupal's
YamlFileLoader supports the same \`Some\\Interface: '@service.id'\` shorthand
Symfony does, and core itself ships such aliases since 10.1 — it's what makes
\`autowire: true\` resolve your service from a type-hint (and what controllers'
autowired \`create()\` via \`AutowireTrait\`, added in 10.2, relies on).

### Return value objects, not arrays

Drupal 10 requires PHP 8.1+ and Drupal 11 requires 8.3, so **enums and
readonly properties are always available in custom module code**, and
\`readonly class\` (a PHP 8.2 feature) works on any Drupal 11 site — and on
any Drupal 10 site running PHP 8.2+. Instead of
returning \`['severity' => 'high', 'score' => 50]\`, return a
\`SeverityAssessment\` readonly object carrying a \`Severity\` backed enum.
You get IDE completion, type errors instead of typo bugs, and immutability —
no caller can mutate a shared result.

### Keep the core pure: pass values in, not entities

The tempting signature is \`assess(IncidentInterface \$incident)\`. Resist it.
The moment the calculator reads fields off an entity, unit tests need mocked
field items and half the entity API. Instead the method takes **plain values**
(\`int \$affectedUsers\`, \`bool \$production\`, …) and the *caller* extracts
them from the entity. Constructor dependencies stay thin — \`datetime.time\`
for "now", a logger channel — both trivially mockable. The result: a test in
\`tests/src/Unit\` extending \`Drupal\\Tests\\UnitTestCase\` (plain PHPUnit plus
some helpers) that runs in milliseconds with **no database, no container, no
site install**.

### Decoration works, because it's the same container

Because you exposed an interface and a service id, another module —
say \`incident_sla\` — can **decorate** your calculator with the exact keys
Symfony uses: \`decorates:\`, \`decoration_priority:\`,
\`decoration_inner_name:\`. The decorator implements your interface, receives
the original as \`@incident_sla.severity_calculator.inner\`, and wraps it —
every consumer of \`incident_tracker.severity_calculator\` (or the interface
alias) transparently gets the decorated version. That's the polite,
wrap-don't-replace alternative to overriding the class via a
\`ServiceProvider\`, and it only works cleanly because the contract is an
interface.

Nothing here changes between Drupal 10 and 11 — this is plain Symfony DI
plus modern PHP, which is precisely the point: business logic should be the
most boring, most portable code in your module.
`,

  comparisons: [
    {
      label: "Registering the service + interface alias",
      intro:
        "Symfony's autodiscovery registers the class as its own id and binds the interface automatically. Drupal spells out the id, class, and arguments — and you add the interface alias yourself.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/services.yaml (Symfony 6.4 / 7)
services:
  _defaults:
    autowire: true
    autoconfigure: true

  App\\:
    resource: '../src/'

# Nothing else to write. The class is its own id,
# and since IncidentSeverityCalculator is the only
# implementation of its interface, type-hinting
# the interface injects it automatically.`,
      ts: `# incident_tracker.services.yml (Drupal 10/11)
services:
  logger.channel.incident_tracker:
    parent: logger.channel_base
    arguments: ['incident_tracker']

  incident_tracker.severity_calculator:
    class: Drupal\\incident_tracker\\IncidentSeverityCalculator
    arguments:
      - '@datetime.time'
      - '@logger.channel.incident_tracker'

  # Alias interface -> id (same trick core uses since
  # 10.1): consumers can type-hint the interface and
  # autowiring resolves it.
  Drupal\\incident_tracker\\IncidentSeverityCalculatorInterface: '@incident_tracker.severity_calculator'`,
      note:
        "The snake.dot id stays the public contract for '@...' wiring; the FQCN alias is what lets `autowire: true` (and controllers' autowired create()) find your service by type-hint.",
    },
    {
      label: "The service class: injected deps, pure logic, value object out",
      intro:
        "The implementation is byte-for-byte the same design in both frameworks — only the type-hints for 'clock' and 'logger' change. Note what it does NOT take: an entity.",
      php: `<?php // src/Incident/IncidentSeverityCalculator.php
declare(strict_types=1);

namespace App\\Incident;

use Psr\\Clock\\ClockInterface;
use Psr\\Log\\LoggerInterface;

final class IncidentSeverityCalculator implements
  IncidentSeverityCalculatorInterface
{
    public function __construct(
        private readonly ClockInterface $clock,
        private readonly LoggerInterface $logger,
    ) {}

    public function assess(
        int $affectedUsers,
        bool $production,
        bool $dataLoss,
        int $reportedAt,
    ): SeverityAssessment {
        $score = ($affectedUsers >= 1000 ? 40
                : ($affectedUsers >= 100 ? 20 : 0))
            + ($production ? 30 : 0)
            + ($dataLoss ? 30 : 0);
        $openMinutes = intdiv(max(0,
            $this->clock->now()->getTimestamp()
            - $reportedAt), 60);

        $severity = match (true) {
            $score >= 80 => Severity::Critical,
            $score >= 50 => Severity::High,
            $score >= 20 => Severity::Medium,
            default => Severity::Low,
        };

        return new SeverityAssessment(
            $severity, $score, $openMinutes);
    }
}`,
      ts: `<?php // src/IncidentSeverityCalculator.php
declare(strict_types=1);

namespace Drupal\\incident_tracker;

use Drupal\\Component\\Datetime\\TimeInterface;
use Drupal\\Core\\Logger\\LoggerChannelInterface;

final class IncidentSeverityCalculator implements
  IncidentSeverityCalculatorInterface {

  public function __construct(
    private readonly TimeInterface $time,
    private readonly LoggerChannelInterface $logger,
  ) {}

  public function assess(
    int $affectedUsers,
    bool $production,
    bool $dataLoss,
    int $reportedAt,
  ): SeverityAssessment {
    $score = ($affectedUsers >= 1000 ? 40
            : ($affectedUsers >= 100 ? 20 : 0))
      + ($production ? 30 : 0)
      + ($dataLoss ? 30 : 0);
    $openMinutes = intdiv(max(0,
      $this->time->getCurrentTime()
      - $reportedAt), 60);

    $severity = match (TRUE) {
      $score >= 80 => Severity::Critical,
      $score >= 50 => Severity::High,
      $score >= 20 => Severity::Medium,
      default => Severity::Low,
    };

    return new SeverityAssessment(
      $severity, $score, $openMinutes);
  }

}`,
      note:
        "Scalars in, readonly SeverityAssessment out. The caller (controller/form/hook) reads fields off the incident entity and passes plain values — the calculator never touches the entity API.",
    },
    {
      label: "Another module decorates the calculator",
      intro:
        "A second module, incident_sla, wants to escalate long-open incidents without patching incident_tracker. Both containers support decoration with the same YAML keys.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/services.yaml (Symfony)
services:
  App\\Sla\\EscalatingSeverityCalculator:
    decorates: App\\Incident\\IncidentSeverityCalculator
    arguments:
      - '@.inner'   # shorthand for the wrapped service

# Every consumer of the interface now transparently
# receives EscalatingSeverityCalculator.`,
      ts: `# incident_sla/incident_sla.services.yml (Drupal)
services:
  incident_sla.severity_calculator:
    class: Drupal\\incident_sla\\EscalatingSeverityCalculator
    decorates: incident_tracker.severity_calculator
    decoration_priority: 0
    arguments:
      # decorated original is renamed '<decorator id>.inner'
      - '@incident_sla.severity_calculator.inner'

# Consumers keep asking for
# '@incident_tracker.severity_calculator' (or the
# interface alias) and get the decorator. drush cr!`,
      note:
        "Drupal's YamlFileLoader supports decorates / decoration_inner_name / decoration_priority exactly like Symfony. Decoration wraps; a ServiceProvider class-swap replaces — prefer wrapping.",
    },
    {
      label: "Unit test with zero framework bootstrap",
      intro:
        "Because the calculator takes values and two mockable constructor deps, both tests are plain PHPUnit. The Drupal one needs no site install and no database.",
      php: `<?php // tests/Unit/IncidentSeverityCalculatorTest.php
namespace App\\Tests\\Unit;

use App\\Incident\\IncidentSeverityCalculator;
use App\\Incident\\Severity;
use PHPUnit\\Framework\\TestCase;
use Psr\\Log\\NullLogger;
use Symfony\\Component\\Clock\\MockClock;

final class IncidentSeverityCalculatorTest extends TestCase
{
    public function testProdIncidentIsHigh(): void
    {
        $calc = new IncidentSeverityCalculator(
            new MockClock('2026-08-08 10:00:00'),
            new NullLogger(),
        );
        $result = $calc->assess(
            affectedUsers: 250,
            production: true,
            dataLoss: false,
            reportedAt: 0,
        );
        self::assertSame(Severity::High, $result->severity);
    }
}`,
      ts: `<?php // tests/src/Unit/IncidentSeverityCalculatorTest.php
namespace Drupal\\Tests\\incident_tracker\\Unit;

use Drupal\\Component\\Datetime\\TimeInterface;
use Drupal\\Core\\Logger\\LoggerChannelInterface;
use Drupal\\incident_tracker\\IncidentSeverityCalculator;
use Drupal\\incident_tracker\\Severity;
use Drupal\\Tests\\UnitTestCase;

final class IncidentSeverityCalculatorTest extends UnitTestCase {

  public function testProdIncidentIsHigh(): void {
    $time = $this->createMock(TimeInterface::class);
    $time->method('getCurrentTime')->willReturn(1754640000);

    $calc = new IncidentSeverityCalculator(
      $time,
      $this->createMock(LoggerChannelInterface::class),
    );
    $result = $calc->assess(
      affectedUsers: 250,
      production: TRUE,
      dataLoss: FALSE,
      reportedAt: 1754636400,
    );
    $this->assertSame(Severity::High, $result->severity);
  }

}
// Run it from the project root (no Drupal install needed):
// vendor/bin/phpunit -c web/core \\
//   web/modules/custom/incident_tracker/tests/src/Unit
// Paths assume the Composer layout (vendor/ above the
// web/ docroot); on a legacy install drop the 'web/'.`,
      note:
        "Drupal\\Tests\\<module>\\Unit + UnitTestCase = plain PHPUnit with a few helpers. If you find yourself mocking FieldItemListInterface here, your service is coupled to entities — push that extraction up to the caller.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A pure-PHP model of the whole section: enum + readonly value object + interface + implementation + a decorator standing in for the incident_sla module. Predict all four lines before running.",
    code: `<?php
// incident_tracker's severity service, modeled without any Drupal API —
// which is exactly why it unit-tests for free.

enum Severity: int
{
  case Low = 1;
  case Medium = 2;
  case High = 3;
  case Critical = 4;

  public function escalate(): self
  {
    return self::from(min(self::Critical->value, $this->value + 1));
  }
}

final readonly class SeverityAssessment
{
  public function __construct(
    public Severity $severity,
    public int $score,
    public array $reasons,
  ) {}
}

interface SeverityCalculatorInterface
{
  public function assess(int $affectedUsers, bool $production, bool $dataLoss): SeverityAssessment;
}

final class IncidentSeverityCalculator implements SeverityCalculatorInterface
{
  public function assess(int $affectedUsers, bool $production, bool $dataLoss): SeverityAssessment
  {
    $score = 0;
    $reasons = [];
    if ($affectedUsers >= 1000)    { $score += 40; $reasons[] = '1000+ users'; }
    elseif ($affectedUsers >= 100) { $score += 20; $reasons[] = '100+ users'; }
    if ($production) { $score += 30; $reasons[] = 'production'; }
    if ($dataLoss)   { $score += 30; $reasons[] = 'data loss'; }

    $severity = match (true) {
      $score >= 80 => Severity::Critical,
      $score >= 50 => Severity::High,
      $score >= 20 => Severity::Medium,
      default      => Severity::Low,
    };
    return new SeverityAssessment($severity, $score, $reasons);
  }
}

// What the incident_sla module's decorator does: same interface, wraps
// the original ('@incident_sla.severity_calculator.inner') and adjusts.
final class SlaEscalatedCalculator implements SeverityCalculatorInterface
{
  public function __construct(
    private SeverityCalculatorInterface $inner,
    private int $openMinutes,
  ) {}

  public function assess(int $affectedUsers, bool $production, bool $dataLoss): SeverityAssessment
  {
    $result = $this->inner->assess($affectedUsers, $production, $dataLoss);
    if ($this->openMinutes > 60 && $result->severity !== Severity::Critical) {
      return new SeverityAssessment(
        $result->severity->escalate(),
        $result->score,
        [...$result->reasons, 'SLA breach >60min'],
      );
    }
    return $result;
  }
}

$inner     = new IncidentSeverityCalculator();
$decorated = new SlaEscalatedCalculator($inner, openMinutes: 95);

// The same incident through both container wirings:
foreach (['inner service' => $inner, 'decorated' => $decorated] as $label => $calc) {
  $a = $calc->assess(affectedUsers: 250, production: true, dataLoss: false);
  printf("%-13s => %-8s score=%d (%s)\\n",
    $label, $a->severity->name, $a->score, implode(', ', $a->reasons));
}

// Already Critical: the decorator passes it through untouched.
$big = $decorated->assess(affectedUsers: 1200, production: true, dataLoss: true);
printf("%-13s => %-8s score=%d (%s)\\n",
  'big outage', $big->severity->name, $big->score, implode(', ', $big->reasons));

// Value objects are readonly — a consumer cannot corrupt shared results:
try {
  $big->score = 0;
} catch (Error $e) {
  echo 'readonly guard: ' . $e->getMessage() . "\\n";
}`,
    output: `inner service => High     score=50 (100+ users, production)
decorated     => Critical score=50 (100+ users, production, SLA breach >60min)
big outage    => Critical score=100 (1000+ users, production, data loss)
readonly guard: Cannot modify readonly property SeverityAssessment::$score
`,
  },

  keyPoints: [
    "Design Drupal services exactly like Symfony services: interface + implementation, constructor-injected dependencies, small pure methods — your instincts transfer 1:1.",
    "Register the snake.dot id pointing at the class, then alias the interface FQCN to it (`Drupal\\...\\FooInterface: '@my.id'`) so autowiring and type-hinting the interface work, like core does since 10.1.",
    "Return readonly value objects and backed enums (enums/readonly properties need PHP 8.1+, `readonly class` needs 8.2+) instead of associative arrays — typed, immutable, IDE-friendly results.",
    "Keep business logic pure: accept scalars/enums, never entities — callers extract field values, and the service stays unit-testable with `Drupal\\Tests\\UnitTestCase` (no database, no container, no install).",
    "Other modules can decorate your service with `decorates:` / `decoration_priority:` in their services.yml, receiving the original as `<decorator_id>.inner` — same mechanics as Symfony, and safer than class-swapping via a ServiceProvider.",
    "After any services.yml change — including adding a decorator — rebuild the container with `drush cr`.",
  ],

  interview: [
    {
      q: "How do you design a Drupal service so it can be unit-tested without a Drupal bootstrap?",
      a: "Keep the business logic pure: the service's methods accept plain values (ints, bools, enums) rather than entity objects, and its constructor takes a small set of interface-typed dependencies like `Drupal\\Component\\Datetime\\TimeInterface` or a logger channel. Callers — controllers, form submit handlers, hooks — are responsible for pulling field values off entities before calling in. The test then lives in `tests/src/Unit`, extends `Drupal\\Tests\\UnitTestCase` (which is essentially plain PHPUnit with helpers), and mocks the two constructor dependencies with `createMock()`. No database, no container build, no installed site — it runs in milliseconds with `vendor/bin/phpunit -c web/core web/modules/custom/incident_tracker/tests/src/Unit` from the project root (that's the Composer layout, where `vendor/` sits above the `web/` docroot; on a legacy install drop the `web/` prefix). The smell to watch for is mocking `FieldItemListInterface` in a unit test: that means entity access leaked into the logic layer.",
    },
    {
      q: "Another module needs to change how incident severity is computed without forking your module. What are its options?",
      a: "The clean option is service decoration, which works in Drupal exactly as in Symfony: the other module registers its own service with `decorates: incident_tracker.severity_calculator`, implements the same interface, and receives the original as `@<decorator_id>.inner` (with `decoration_priority` controlling stacking order when several modules decorate). Every consumer transparently gets the wrapper. The blunter alternative is a `ServiceProvider`/`ServiceModifier` class that alters the definition and swaps the class outright — that replaces rather than wraps, and two modules doing it will fight. Decoration is only safe because the service exposes an interface; that's a big reason to publish one even for internal logic.",
    },
    {
      q: "Why add a line like `Drupal\\incident_tracker\\IncidentSeverityCalculatorInterface: '@incident_tracker.severity_calculator'` to your services.yml?",
      a: "That's an alias mapping the interface FQCN to the service id — the same shorthand Symfony's YAML supports, and Drupal core ships aliases like this for its own services since 10.1. It's what makes autowiring work: with `autowire: true` on a consumer, or a controller relying on the autowired `create()` from `AutowireTrait` (added in 10.2), a constructor type-hint of the interface resolves to your concrete service without an explicit `arguments:` entry. It also encodes good design: consumers depend on the contract, so a decorator or replacement implementation slots in without touching any consumer. The snake.dot id remains the canonical reference for classic `'@id'` wiring.",
    },
  ],

  quiz: [
    {
      question:
        "Why does IncidentSeverityCalculator::assess() take ints and bools instead of the incident entity object?",
      options: [
        "Entities cannot be passed between services in Drupal's container",
        "It keeps the logic pure and unit-testable — callers extract field values, so tests need no entity mocks, database, or bootstrap",
        "Type-hinting entities in services causes a circular dependency with entity_type.manager",
        "Scalar arguments are required for services that will be decorated",
      ],
      answerIndex: 1,
      explain:
        "Passing values in (not entities) isolates business logic from the entity API. The service becomes plain PHP: a unit test mocks only the small constructor deps (time, logger) and asserts on the returned value object. Entities CAN technically be passed — it's just a design choice that ruins cheap testability.",
    },
    {
      question:
        "In incident_sla.services.yml, a service declares `decorates: incident_tracker.severity_calculator`. How does the decorator get access to the original calculator?",
      options: [
        "It calls \\Drupal::service('incident_tracker.severity_calculator') at runtime",
        "It receives it via the argument '@incident_sla.severity_calculator.inner' — the decorated service is renamed to '<decorator id>.inner'",
        "It must extend the original class and call parent methods",
        "It re-registers the original under a new id in hook_install()",
      ],
      answerIndex: 1,
      explain:
        "Exactly like Symfony: the container renames the decorated definition to '<decorator id>.inner' (unless decoration_inner_name overrides it), and the decorator injects that. Fetching the id via \\Drupal::service() would return the decorator itself — infinite recursion. Extending the class defeats the point of the interface.",
    },
    {
      question:
        "What does the services.yml line `Drupal\\incident_tracker\\IncidentSeverityCalculatorInterface: '@incident_tracker.severity_calculator'` accomplish?",
      options: [
        "It registers a second, independent instance of the calculator",
        "It marks the interface as the only allowed implementation",
        "It creates an alias so consumers type-hinting the interface get the service via autowiring",
        "It is required for the service to be decoratable",
      ],
      answerIndex: 2,
      explain:
        "A string value starting with '@' defines an alias, not a new service. With the alias in place, `autowire: true` consumers (and autowired controller create() methods) can type-hint the interface and receive the calculator — the pattern core itself uses since Drupal 10.1. Decoration works with or without the alias.",
    },
  ],
};

export default lesson;
