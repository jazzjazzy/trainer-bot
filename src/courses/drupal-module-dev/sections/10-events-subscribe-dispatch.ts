import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "events-subscribe-dispatch",
  title: "Events: Subscribing & Dispatching Your Own",
  part: "Services, DI & Business Logic",
  estMinutes: 12,
  summary:
    "Make incident_tracker extensible with Symfony's own EventDispatcher: define IncidentReportedEvent, dispatch it from IncidentManager via the event_dispatcher service, and subscribe with an EventSubscriberInterface class tagged event_subscriber in services.yml.",

  concept: `
## The dispatcher you already own

\`IncidentManager\` (previous section) can now record an incident — but other code
needs to *react* when one lands: notify a channel, escalate criticals, reset a
dashboard cache. Instead of hard-coding those calls into the manager, we dispatch
an event. Drupal ships the same \`symfony/event-dispatcher\` your Symfony apps use,
registered under the service id \`event_dispatcher\`. Listeners, priorities,
\`stopPropagation()\` — all identical. What differs is only *registration*.

### Three pieces to build

**1. The event object** — \`src/Event/IncidentReportedEvent.php\` extends
\`Drupal\\Component\\EventDispatcher\\Event\`, core's thin subclass of
\`Symfony\\Contracts\\EventDispatcher\\Event\`. It carries what subscribers need
(severity, title) and — because every listener receives the *same instance* — it
can also carry results back: we give it an \`escalate()\` / \`isEscalated()\` pair
the caller inspects after dispatch.

**2. The names class** — a \`final class IncidentEvents\` holding
\`const NEW_REPORT = 'incident_tracker.new_report'\`. Same convention as
\`KernelEvents\` and \`ConfigEvents\`: a constant beats a magic string for
discoverability, and its docblock documents which event class subscribers get.

**3. The dispatch** — inject \`@event_dispatcher\` into \`IncidentManager\`
(typehint the Symfony \`EventDispatcherInterface\`) and fire after the save.
Modern signature — event object first, name second — and \`dispatch()\` returns
the event, so the caller can read what listeners did to it.

### Subscribing: tag by hand, or opt in to autoconfigure

The subscriber lives in \`src/EventSubscriber/\`, implements
\`Symfony\\Component\\EventDispatcher\\EventSubscriberInterface\`, and maps names to
methods in static \`getSubscribedEvents()\` (\`[method, priority]\` tuples; higher
priority runs first). Then the Drupal-specific part: **autoconfigure is off by
default, and \`#[AsEventListener]\` is never read** — no module gets a
\`_defaults\` block for free, and the container registers no listener attributes
even with autoconfigure on. So out of the box, implementing the interface isn't
enough. Either declare the service with \`tags: [{ name: event_subscriber }]\`
in \`incident_tracker.services.yml\` — doing by hand exactly what Symfony's
autoconfiguration does for you — or opt the file in with
\`_defaults: { autoconfigure: true }\` (supported since Drupal 10.2, where core
registers \`EventSubscriberInterface\` for autoconfiguration and applies the tag
automatically). Do neither and the subscriber silently never fires — no error,
just nothing.

### Core events worth subscribing to

The same class can listen to core's own events alongside yours:

\`\`\`php
public static function getSubscribedEvents(): array {
  return [
    ConfigEvents::SAVE => 'onConfigSave',
    KernelEvents::REQUEST => ['onRequest', 30],
  ];
}

public function onConfigSave(ConfigCrudEvent $event): void {
  if ($event->getConfig()->getName() === 'incident_tracker.settings'
      && $event->isChanged('escalation_threshold')) {
    // Admin changed the threshold — reset cached counters.
  }
}
\`\`\`

\`KernelEvents::REQUEST\` (\`RequestEvent\`) gives you early per-request logic —
the classic use is checking state and setting a response before routing work
happens. \`ConfigEvents::SAVE\` fires for *any* config save, including config
import on deploy, so it catches changes your settings form never sees.

### D10 vs D11

Nothing changes here — Symfony 6.4 vs 7 underneath makes no difference to this
API. And note the boundary: \`#[Hook]\` classes (11.1+) modernize *hooks*; events
remain the idiomatic channel for announcing "something happened in my module" to
other modules.
`,

  comparisons: [
    {
      label: "The event class + the names class",
      intro:
        "Two small files under src/Event/. The event object carries data out to listeners and results back; the final constants class replaces magic strings, exactly like KernelEvents.",
      leftLang: "php",
      rightLang: "php",
      php: `// src/Event/IncidentReportedEvent.php — Symfony 6.4/7
namespace App\\Event;

use Symfony\\Contracts\\EventDispatcher\\Event;

final class IncidentReportedEvent extends Event
{
    private bool $escalated = false;

    public function __construct(
        public readonly string $severity,
        public readonly string $title,
    ) {}

    public function escalate(): void { $this->escalated = true; }
    public function isEscalated(): bool { return $this->escalated; }
}

// src/Event/IncidentEvents.php
namespace App\\Event;

final class IncidentEvents
{
    public const NEW_REPORT = 'app.incident.new_report';
}`,
      ts: `// src/Event/IncidentReportedEvent.php — Drupal 10/11
namespace Drupal\\incident_tracker\\Event;

use Drupal\\Component\\EventDispatcher\\Event;

class IncidentReportedEvent extends Event {

  protected bool $escalated = FALSE;

  public function __construct(
    public readonly string $severity,
    public readonly string $title,
  ) {}

  public function escalate(): void {
    $this->escalated = TRUE;
  }

  public function isEscalated(): bool {
    return $this->escalated;
  }

}

// src/Event/IncidentEvents.php
namespace Drupal\\incident_tracker\\Event;

final class IncidentEvents {

  /**
   * Fired after a new incident report is saved.
   *
   * @Event
   *
   * @see \\Drupal\\incident_tracker\\Event\\IncidentReportedEvent
   */
  const NEW_REPORT = 'incident_tracker.new_report';

}`,
      note: "Drupal\\Component\\EventDispatcher\\Event is a thin subclass of the Symfony Contracts Event — extend it so your event matches core's own (ConfigCrudEvent does the same). The @Event docblock tag is how core documents dispatchable constants.",
    },
    {
      label: "Dispatching from IncidentManager",
      intro:
        "After saving a report, announce it. Symfony autowires the dispatcher; in Drupal you add '@event_dispatcher' to the service's arguments yourself. The dispatch call itself is identical: event object first, name second.",
      leftLang: "php",
      rightLang: "php",
      php: `// src/Incident/IncidentManager.php — autowired
namespace App\\Incident;

use App\\Event\\IncidentEvents;
use App\\Event\\IncidentReportedEvent;
use Symfony\\Contracts\\EventDispatcher\\EventDispatcherInterface;

final class IncidentManager
{
    public function __construct(
        private readonly EventDispatcherInterface $dispatcher,
    ) {}

    public function report(string $severity, string $title): void
    {
        // ... persist the incident ...

        $event = new IncidentReportedEvent($severity, $title);
        $this->dispatcher->dispatch($event, IncidentEvents::NEW_REPORT);

        if ($event->isEscalated()) {
            // A listener flagged this one for follow-up.
        }
    }
}`,
      ts: `// src/Service/IncidentManager.php
// incident_tracker.services.yml gains the argument:
//   incident_tracker.manager:
//     class: Drupal\\incident_tracker\\Service\\IncidentManager
//     arguments: ['@event_dispatcher']
namespace Drupal\\incident_tracker\\Service;

use Drupal\\incident_tracker\\Event\\IncidentEvents;
use Drupal\\incident_tracker\\Event\\IncidentReportedEvent;
use Symfony\\Contracts\\EventDispatcher\\EventDispatcherInterface;

class IncidentManager {

  public function __construct(
    protected readonly EventDispatcherInterface $eventDispatcher,
  ) {}

  public function report(string $severity, string $title): void {
    // ... persist the incident (Database API — Part 4) ...

    $event = new IncidentReportedEvent($severity, $title);
    $this->eventDispatcher->dispatch($event, IncidentEvents::NEW_REPORT);

    if ($event->isEscalated()) {
      // A subscriber flagged this one for follow-up.
    }
  }

}`,
      note: "Same Contracts typehint on both sides — the 'event_dispatcher' service satisfies it. dispatch() returns the (possibly mutated) event, which is the supported way for subscribers to hand data back to the dispatcher.",
    },
    {
      label: "The subscriber: no #[AsEventListener] in Drupal",
      intro:
        "Symfony's modern one-liner registration is an attribute the container autoconfigures. Drupal's container ignores that attribute entirely — you write the classic interface + static map.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony 6.4/7 — attribute is enough (autoconfigured)
namespace App\\EventListener;

use App\\Event\\IncidentEvents;
use App\\Event\\IncidentReportedEvent;
use Symfony\\Component\\EventDispatcher\\Attribute\\AsEventListener;

#[AsEventListener(
  event: IncidentEvents::NEW_REPORT,
  priority: 100,
)]
final class EscalationListener
{
    public function __invoke(IncidentReportedEvent $event): void
    {
        if ($event->severity === 'critical') {
            $event->escalate();
        }
    }
}`,
      ts: `// src/EventSubscriber/IncidentSubscriber.php — Drupal 10/11
namespace Drupal\\incident_tracker\\EventSubscriber;

use Drupal\\incident_tracker\\Event\\IncidentEvents;
use Drupal\\incident_tracker\\Event\\IncidentReportedEvent;
use Symfony\\Component\\EventDispatcher\\EventSubscriberInterface;

class IncidentSubscriber implements EventSubscriberInterface {

  public static function getSubscribedEvents(): array {
    return [
      IncidentEvents::NEW_REPORT => ['onNewReport', 100],
    ];
  }

  public function onNewReport(IncidentReportedEvent $event): void {
    if ($event->severity === 'critical') {
      $event->escalate();
    }
  }

}`,
      note: "Adding #[AsEventListener] to a class in a Drupal module does nothing — no error, no registration. EventSubscriberInterface + getSubscribedEvents() is the only listener contract Drupal's container knows.",
    },
    {
      label: "Registration: autoconfigure vs the event_subscriber tag",
      intro:
        "Where the defaults diverge. A Symfony skeleton ships with autoconfigure on, so the class is discovered and tagged for you; a Drupal module gets no _defaults block at all, so you hand-write the event_subscriber tag — or opt the file in with _defaults: autoconfigure: true (Drupal 10.2+).",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/services.yaml — Symfony 6.4/7
services:
  _defaults:
    autowire: true
    autoconfigure: true   # implements EventSubscriberInterface -> tagged,
                          # #[AsEventListener] attributes -> registered

  App\\:
    resource: '../src/'

# Nothing subscriber-specific to write at all.`,
      ts: `# incident_tracker.services.yml — Drupal 10/11
services:
  # Opt-in alternative (Drupal 10.2+) — uncomment and drop the tag:
  # _defaults:
  #   autoconfigure: true   # auto-tags EventSubscriberInterface classes

  incident_tracker.incident_subscriber:
    class: Drupal\\incident_tracker\\EventSubscriber\\IncidentSubscriber
    tags:
      - { name: event_subscriber }   # required without the _defaults opt-in

  # Subscriber dependencies are explicit too, e.g.:
  #   arguments: ['@logger.channel.incident_tracker', '@state']`,
      note: "Without the tag (or the autoconfigure opt-in) getSubscribedEvents() is never read: the subscriber exists but nothing fires. Either way, rebuild the container (drush cr) — the listener map is compiled in.",
    },
  ],

  playground: {
    intro:
      "This pure-PHP model shows the whole round trip: 'tagged' subscriber classes are collected, their static getSubscribedEvents() maps are compiled into a listener table (what the event_subscriber tag triggers at container build), then IncidentEvents::NEW_REPORT dispatches by priority and the caller reads the escalation result back off the event object.",
    lang: "php",
    code: `<?php

// ── The event object: carries data out to listeners, results back in. ──
class IncidentReportedEvent {
  public bool $escalated = false;
  public array $log = [];
  public function __construct(
    public readonly string $severity,
    public readonly string $title,
  ) {}
}

// ── The names class: constants instead of magic strings. ──
final class IncidentEvents {
  const NEW_REPORT = 'incident_tracker.new_report';
}

// ── Two subscribers declaring interest the Symfony way. ──
class SlackNotifySubscriber {
  public static function getSubscribedEvents(): array {
    return [IncidentEvents::NEW_REPORT => ['onNewReport', 100]];
  }
  public function onNewReport(IncidentReportedEvent $e): void {
    $e->log[] = "slack: #ops notified about '{$e->title}'";
  }
}

class EscalationSubscriber {
  public static function getSubscribedEvents(): array {
    return [IncidentEvents::NEW_REPORT => ['onNewReport', 0]];
  }
  public function onNewReport(IncidentReportedEvent $e): void {
    if ($e->severity === 'critical') {
      $e->escalated = true;
      $e->log[] = 'escalation: paged the on-call engineer';
    }
  }
}

// ── What the event_subscriber tag triggers at container compile time:
//    collect tagged classes, read their static getSubscribedEvents(). ──
$tagged = [SlackNotifySubscriber::class, EscalationSubscriber::class];
$listeners = [];
foreach ($tagged as $class) {
  foreach ($class::getSubscribedEvents() as $name => [$method, $priority]) {
    $listeners[$name][] = ['call' => [new $class(), $method], 'priority' => $priority];
  }
}

// ── The dispatcher: sort by priority (high first), call each, return event. ──
function dispatch(array $listeners, object $event, string $eventName): object {
  $subs = $listeners[$eventName] ?? [];
  usort($subs, fn($a, $b) => $b['priority'] <=> $a['priority']);
  foreach ($subs as $s) {
    ($s['call'])($event);
  }
  return $event;
}

// ── What IncidentManager::report() does right after saving. ──
$event = dispatch(
  $listeners,
  new IncidentReportedEvent('critical', 'DB replica lag'),
  IncidentEvents::NEW_REPORT,
);

foreach ($event->log as $line) {
  echo $line, "\\n";
}
echo 'escalated: ', var_export($event->escalated, true), "\\n";`,
    output: `slack: #ops notified about 'DB replica lag'
escalation: paged the on-call engineer
escalated: true`,
  },

  keyPoints: [
    "Custom events are three pieces: an event class extending Drupal\\Component\\EventDispatcher\\Event (a thin subclass of Symfony Contracts' Event), a final IncidentEvents class with string constants, and a dispatch call.",
    "Dispatch with the injected event_dispatcher service: $this->eventDispatcher->dispatch($event, IncidentEvents::NEW_REPORT) — event object first, name second; dispatch() returns the same event so callers can read results subscribers wrote onto it.",
    "Subscribers implement Symfony's EventSubscriberInterface with static getSubscribedEvents(); [method, priority] tuples order them, higher priority first — identical to Symfony.",
    "Registration is the Drupal difference: modules get no autoconfigure by default, so you hand-write the { name: event_subscriber } tag in *.services.yml — or opt in per file with _defaults: autoconfigure: true (Drupal 10.2+). #[AsEventListener] is silently ignored either way.",
    "Core events worth knowing: KernelEvents::REQUEST (RequestEvent, early per-request logic) and ConfigEvents::SAVE (ConfigCrudEvent — check getConfig()->getName() and isChanged('key')), which also fires on config import.",
    "Dispatching your own event is how incident_tracker becomes extensible: other modules react to NEW_REPORT with their own tagged subscribers, no hooks required.",
  ],

  interview: [
    {
      q: "Walk me through making a custom Drupal module extensible with events — what do you actually write?",
      a: "Three things. First an event class in \`src/Event/\` extending \`Drupal\\Component\\EventDispatcher\\Event\` (core's subclass of the Symfony Contracts \`Event\`) that carries the payload — and, since all listeners share the instance, any result flags the dispatcher wants back. Second, a \`final\` names class like \`IncidentEvents\` with \`const NEW_REPORT = 'incident_tracker.new_report'\`, mirroring core's \`KernelEvents\`/\`ConfigEvents\` convention. Third, inject the \`event_dispatcher\` service (typehint \`EventDispatcherInterface\`) into the service that owns the state change and call \`dispatch($event, IncidentEvents::NEW_REPORT)\` after the save. Any module — yours or a third party's — can now react by registering a tagged \`event_subscriber\` service, which is exactly how you make a module extensible without inventing a hook.",
    },
    {
      q: "You added #[AsEventListener] to a listener class in your Drupal module and it never fires. What happened?",
      a: "Nothing is broken in the class — Drupal's container simply never looks at that attribute. Symfony registers attribute listeners through its autoconfiguration pass; Drupal registers no attribute autoconfiguration at all, and a module's services.yml doesn't even get autoconfigure enabled unless you opt in. The fix is the classic contract: implement \`EventSubscriberInterface\`, return the event map from static \`getSubscribedEvents()\`, then either declare the service in \`mymodule.services.yml\` with \`tags: - { name: event_subscriber }\` or add \`_defaults: autoconfigure: true\` to the file (Drupal 10.2+ auto-tags EventSubscriberInterface implementations), and rebuild the container with \`drush cr\`. The hand-written tag does manually what autoconfigure does when enabled; with neither, the subscriber is just an unused class.",
    },
    {
      q: "How would your module react when an administrator changes its settings — and why is subscribing to ConfigEvents::SAVE better than putting that logic in the settings form's submit handler?",
      a: "Subscribe to \`ConfigEvents::SAVE\`. The listener receives a \`ConfigCrudEvent\`; guard with \`$event->getConfig()->getName() === 'incident_tracker.settings'\` and use \`$event->isChanged('escalation_threshold')\` to react only to the key you care about. The reason it beats submit-handler logic: config can change through paths that never touch your form — \`drush config:set\`, and crucially config import during deployment — and the event fires for all of them. It's the reliable place for cache resets or recalculations that must track the setting itself, not the UI.",
    },
    {
      q: "Your module needs to announce 'a new incident was reported'. Event or hook?",
      a: "Dispatch an event. Events are the Symfony-native mechanism: a typed event object, subscribers that are real services with dependency injection, and priorities from the shared \`symfony/event-dispatcher\` — all testable in isolation. A hook (\`ModuleHandler::invokeAll('incident_new_report')\`) reaches modules too, and some contrib modules expose both for audience reach, but for new code the event is the idiomatic choice, and it's what core does for its Symfony-derived subsystems (config, routing, kernel). Note that \`#[Hook]\` attribute classes in Drupal 11.1+ modernize how hooks are *implemented*, but they don't change this design decision about what your module should *emit*.",
    },
  ],

  quiz: [
    {
      question:
        "Your IncidentSubscriber implements EventSubscriberInterface with a correct getSubscribedEvents(), but never runs in Drupal. Most likely cause?",
      options: [
        "The class must also add the #[AsEventListener] attribute",
        "The service is missing the { name: event_subscriber } tag in incident_tracker.services.yml",
        "getSubscribedEvents() must be an instance method in Drupal",
        "Custom event names must be declared in incident_tracker.info.yml",
      ],
      answerIndex: 1,
      explain:
        "Modules get no autoconfigure by default, so in a services.yml without the _defaults: autoconfigure: true opt-in (Drupal 10.2+) implementing the interface isn't enough — the YAML tag is what registers the class with the dispatcher (then drush cr recompiles the container). #[AsEventListener] is ignored by Drupal either way, the static method is required by the shared Symfony interface, and info.yml has nothing to do with events.",
    },
    {
      question:
        "Which is the correct Drupal 10/11 dispatch call for the incident_tracker custom event?",
      options: [
        "$this->eventDispatcher->dispatch(IncidentEvents::NEW_REPORT, $event);",
        "$this->eventDispatcher->dispatch($event, IncidentEvents::NEW_REPORT);",
        "\\Drupal::moduleHandler()->invokeAll(IncidentEvents::NEW_REPORT, [$event]);",
        "$event->dispatch('incident_tracker.new_report');",
      ],
      answerIndex: 1,
      explain:
        "The modern Symfony signature — shared by Drupal 10/11 — takes the event object first and the name second, and returns the event. Name-first is the removed legacy order, invokeAll() is the hook system, and events don't dispatch themselves.",
    },
    {
      question:
        "A subscriber should reset cached counters only when the escalation_threshold key of incident_tracker.settings changes. What do you subscribe to and check?",
      options: [
        "KernelEvents::REQUEST, comparing config on every page load",
        "hook_form_alter on the settings form's submit button",
        "ConfigEvents::SAVE, then $event->getConfig()->getName() plus $event->isChanged('escalation_threshold')",
        "IncidentEvents::NEW_REPORT, since settings changes create incidents",
      ],
      answerIndex: 2,
      explain:
        "ConfigEvents::SAVE fires for every config save — form submits, drush config:set, and config import on deploy — and hands you a ConfigCrudEvent with getConfig() and isChanged() for exactly this guard. Checking per-request wastes work, and a form-only approach misses non-form config changes.",
    },
  ],
};

export default lesson;
