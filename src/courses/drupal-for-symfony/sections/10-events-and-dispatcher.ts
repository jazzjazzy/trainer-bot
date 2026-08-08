import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "events-and-dispatcher",
  title: "Events & the Dispatcher (Shared Symfony Component)",
  part: "Routing, Controllers & Services",
  estMinutes: 11,
  summary:
    "Drupal ships the very same symfony/event-dispatcher you already know — EventSubscriberInterface, getSubscribedEvents(), and the event_subscriber tag — so this is the one Drupal subsystem you can use on day one without relearning anything.",

  concept: `
Of everything in Drupal, this is the part you already know. Drupal 10/11 depends
on the identical \`symfony/event-dispatcher\` package your Symfony 6.4/7 app uses.
Same \`EventDispatcherInterface\`, same \`EventSubscriberInterface\`, same
\`getSubscribedEvents()\` contract, same \`KernelEvents::REQUEST\`,
\`KernelEvents::RESPONSE\` and \`KernelEvents::EXCEPTION\` firing on the HttpKernel
pass. If you can write a subscriber in Symfony, you can write one in Drupal —
the class is essentially copy-paste.

### What is actually shared

Drupal's kernel is Symfony's \`HttpKernel\`. When a request comes in, the same
lifecycle events dispatch in the same order, and a subscriber listening on
\`KernelEvents::REQUEST\` can short-circuit the response with
\`$event->setResponse(...)\` exactly as in Symfony. The dispatcher lives in the
container under the \`event_dispatcher\` service id, and you inject it the same way.

Note the modern dispatch signature both frameworks now share: the **event object
comes first, the event name second** — \`$dispatcher->dispatch($event, MyEvents::THING)\`.

### The one real difference: no autoconfigure

In Symfony, \`autoconfigure: true\` is on by default, so merely implementing
\`EventSubscriberInterface\` is enough — the container tags it for you. **Drupal
does not enable autoconfigure.** You must declare the service in your module's
\`*.services.yml\` and add the tag by hand:

\`\`\`yaml
tags:
  - { name: event_subscriber }
\`\`\`

Forget the tag and your subscriber silently never fires — the single most common
"why isn't my event running" bug for Symfony developers arriving at Drupal.

### Drupal's own events

Beyond the kernel events, Drupal core dispatches its own: \`ConfigEvents::SAVE\`
and \`ConfigEvents::DELETE\` when configuration changes, \`RoutingEvents::ALTER\`
while the route collection is built, plus events from modules. You subscribe to
these with the same class you'd write for a kernel event — only the constant and
the event object type change.

### Events vs hooks — the coming fork in the road

Drupal has **two** extension mechanisms. Events are the modern, Symfony-native
one. Hooks (\`hook_form_alter()\`, \`hook_entity_presave()\`) are the older
Drupal-specific procedural system you'll meet in the next part — a magic function
named \`\${module}_\${hook}\` that Drupal discovers and calls. As a rule of thumb:
if a subsystem is Symfony-derived (routing, the kernel, config) it emits
**events**; if it is classic Drupal (forms, entity CRUD, node access) it uses
**hooks**. Recent Drupal (11, backported to 10.x) even lets you write hooks as
OOP methods with a \`#[Hook]\` attribute — but that is still the hook system, not
the dispatcher. Reach for events when the API offers them; they are typed,
injectable, and exactly what your Symfony instincts expect.
`,

  comparisons: [
    {
      label: "The subscriber class",
      intro:
        "Redirect every request when the site is in maintenance mode. The class is nearly identical — same interface, same RequestEvent, same setResponse().",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony 6.4/7
namespace App\\EventSubscriber;

use Symfony\\Component\\EventDispatcher\\EventSubscriberInterface;
use Symfony\\Component\\HttpFoundation\\RedirectResponse;
use Symfony\\Component\\HttpKernel\\Event\\RequestEvent;
use Symfony\\Component\\HttpKernel\\KernelEvents;

final class MaintenanceSubscriber implements EventSubscriberInterface
{
    public function onKernelRequest(RequestEvent $event): void
    {
        $event->setResponse(new RedirectResponse('/down'));
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::REQUEST => 'onKernelRequest'];
    }
}`,
      ts: `// Drupal 10/11
namespace Drupal\\mymodule\\EventSubscriber;

use Symfony\\Component\\EventDispatcher\\EventSubscriberInterface;
use Symfony\\Component\\HttpKernel\\Event\\RequestEvent;
use Symfony\\Component\\HttpKernel\\KernelEvents;
use Drupal\\Core\\Routing\\TrustedRedirectResponse;

final class MaintenanceSubscriber implements EventSubscriberInterface {

  public function onKernelRequest(RequestEvent $event): void {
    $event->setResponse(new TrustedRedirectResponse('/down'));
  }

  public static function getSubscribedEvents(): array {
    return [KernelEvents::REQUEST => 'onKernelRequest'];
  }
}`,
      note: "Same interface and event object. Drupal prefers TrustedRedirectResponse for external URLs so its cache layer allows the redirect.",
    },
    {
      label: "Wiring it up",
      intro:
        "Registration is where the frameworks diverge. Symfony autoconfigures the tag; Drupal makes you write it.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/services.yaml — Symfony
services:
  _defaults:
    autowire: true
    autoconfigure: true   # <-- tags EventSubscriberInterface for you

  App\\EventSubscriber\\MaintenanceSubscriber: ~
  # No explicit tag needed; implementing the interface is enough.`,
      ts: `# mymodule.services.yml — Drupal
services:
  mymodule.maintenance_subscriber:
    class: Drupal\\mymodule\\EventSubscriber\\MaintenanceSubscriber
    tags:
      - { name: event_subscriber }
    # arguments: ['@state']  # Drupal wires by explicit reference, not autowire`,
      note: "No autoconfigure in Drupal: the event_subscriber tag is mandatory, and dependencies are injected by explicit '@service' arguments, not autowiring.",
    },
    {
      label: "Priorities & multiple methods",
      intro:
        "The getSubscribedEvents() return shape is byte-for-byte the same in both frameworks: a bare method name, or [method, priority] tuples for ordering.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony — higher priority runs first
public static function getSubscribedEvents(): array
{
    return [
        KernelEvents::REQUEST => [
            ['checkAuth', 100],
            ['logHit', 0],
        ],
    ];
}`,
      ts: `// Drupal — identical shape
public static function getSubscribedEvents(): array {
  return [
    KernelEvents::REQUEST => [
      ['checkAuth', 100],
      ['logHit', 0],
    ],
  ];
}`,
      note: "Higher priority number = earlier execution in both. This contract is provided by the shared symfony/event-dispatcher, so it can't differ.",
    },
    {
      label: "Dispatching your own event",
      intro:
        "Emitting a custom event uses the modern signature (event object first, name second) in both frameworks.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony — inject EventDispatcherInterface
use Symfony\\Contracts\\EventDispatcher\\EventDispatcherInterface;

$event = new IncidentReportEvent($type, $report);
$this->dispatcher->dispatch($event, IncidentEvents::NEW_REPORT);`,
      ts: `// Drupal — inject the 'event_dispatcher' service
use Symfony\\Contracts\\EventDispatcher\\EventDispatcherInterface;

$event = new IncidentReportEvent($type, $report);
$this->eventDispatcher->dispatch($event, IncidentEvents::NEW_REPORT);`,
      note: "The event class extends Symfony\\Contracts\\EventDispatcher\\Event in Symfony 6.4/7 (the old Symfony\\Component\\EventDispatcher\\Event was removed in Symfony 5.0); Drupal's events extend Drupal\\Component\\EventDispatcher\\Event, which itself extends the Contracts Event. Constants like IncidentEvents::NEW_REPORT are just string names.",
    },
  ],

  playground: {
    intro:
      "This pure-PHP snippet models the dispatcher: register subscribers by event name, honour numeric priority (high first), and let an early listener stop propagation — exactly what symfony/event-dispatcher does inside Drupal.",
    lang: "php",
    code: `<?php

// A tiny stand-in for symfony/event-dispatcher as Drupal uses it.
class MiniDispatcher {
  private array $listeners = [];

  // Register [callable, priority] under an event name.
  public function subscribe(string $event, callable $fn, int $priority = 0): void {
    $this->listeners[$event][] = ['fn' => $fn, 'priority' => $priority];
  }

  public function dispatch(string $event, object $payload): object {
    $subs = $this->listeners[$event] ?? [];
    // Higher priority runs first — same rule as Symfony/Drupal.
    usort($subs, fn($a, $b) => $b['priority'] <=> $a['priority']);
    foreach ($subs as $s) {
      if ($payload->stopped) {
        echo "  (propagation stopped; skipping a listener)\\n";
        continue;
      }
      ($s['fn'])($payload);
    }
    return $payload;
  }
}

// A minimal event object, like a Symfony Event.
$event = new class {
  public bool $stopped = false;
  public string $log = '';
};

$d = new MiniDispatcher();

// Mirrors getSubscribedEvents(): KernelEvents::REQUEST => [[m,100],[m,0]]
$d->subscribe('kernel.request', function ($e) {
  echo "checkAuth (prio 100)\\n";
  $e->stopped = true;           // deny the request early
}, 100);

$d->subscribe('kernel.request', function ($e) {
  echo "logHit (prio 0)\\n";     // never reached: propagation stopped
}, 0);

$d->dispatch('kernel.request', $event);
echo "done\\n";`,
    output: `checkAuth (prio 100)
  (propagation stopped; skipping a listener)
done`,
  },

  keyPoints: [
    "Drupal uses the exact same symfony/event-dispatcher — EventSubscriberInterface, getSubscribedEvents(), KernelEvents::REQUEST/RESPONSE/EXCEPTION all work unchanged.",
    "The subscriber class is essentially copy-paste from Symfony; only the registration differs.",
    "Drupal does NOT autoconfigure — you must add tags: [{ name: event_subscriber }] in *.services.yml or the subscriber silently never fires.",
    "getSubscribedEvents() return shape (bare method, or [method, priority] tuples, higher-first) is identical because the shared package defines it.",
    "Modern dispatch signature is event-object-first: dispatch($event, EventName::CONST).",
    "Symfony-derived subsystems (kernel, routing, config) emit events; classic Drupal subsystems (forms, entity CRUD) use hooks — that's the next part.",
  ],

  interview: [
    {
      q: "A colleague says their Drupal event subscriber 'just isn't running.' Coming from Symfony, what's your first guess?",
      a: "The missing \`event_subscriber\` tag. In Symfony, \`autoconfigure: true\` is on by default, so implementing \`EventSubscriberInterface\` is enough for the container to tag the service. Drupal ships with autoconfigure off, so you must declare the service in \`mymodule.services.yml\` and add \`tags: - { name: event_subscriber }\` explicitly. Without it the class is never registered with the dispatcher and no method fires — no error, just silence.",
    },
    {
      q: "When should you reach for an event versus a hook in Drupal?",
      a: "If the subsystem is Symfony-derived — the HTTP kernel, routing, configuration — it dispatches **events**, and you write a normal \`EventSubscriberInterface\` class, which is the idiomatic, testable, injectable choice. If it's classic Drupal territory — \`hook_form_alter()\`, entity CRUD like \`hook_entity_presave()\`, node access — the extension point is a **hook**, a specially-named function (or, in recent Drupal, a \`#[Hook]\`-attributed method). Prefer events where the API offers them because they carry a typed event object and support dependency injection. As a Symfony dev you'll find events immediately familiar; hooks are the Drupal-specific concept to learn next.",
    },
    {
      q: "How do you order two subscribers that listen on the same event, and does it differ from Symfony?",
      a: "It doesn't differ at all — the ordering contract comes from the shared \`symfony/event-dispatcher\`. In \`getSubscribedEvents()\` you return \`[EventName => [['methodA', 100], ['methodB', 0]]]\`, where the second element of each tuple is the priority. **Higher numbers run first**, so \`methodA\` at 100 executes before \`methodB\` at 0. A listener can also call \`$event->stopPropagation()\` to prevent later, lower-priority listeners from running.",
    },
  ],

  quiz: [
    {
      question:
        "Your Drupal subscriber implements EventSubscriberInterface correctly but never runs. Most likely cause?",
      options: [
        "Drupal doesn't support Symfony events",
        "You forgot the '{ name: event_subscriber }' tag in *.services.yml (Drupal has no autoconfigure)",
        "getSubscribedEvents() must be non-static in Drupal",
        "KernelEvents::REQUEST doesn't fire in Drupal",
      ],
      answerIndex: 1,
      explain:
        "Drupal doesn't enable autoconfigure, so implementing the interface isn't enough — you must tag the service as event_subscriber by hand. The interface, the static method, and the kernel events are all identical to Symfony.",
    },
    {
      question:
        "In getSubscribedEvents(), you register ['onRequest', 100] and ['onLog', 10] for the same event. Which runs first?",
      options: [
        "onLog — lower priority runs first",
        "onRequest — higher priority runs first",
        "Undefined order",
        "Both run simultaneously",
      ],
      answerIndex: 1,
      explain:
        "Higher priority numbers execute first, in Drupal exactly as in Symfony, because both use the same symfony/event-dispatcher package that defines this rule.",
    },
    {
      question:
        "Which of these is dispatched as an EVENT in Drupal rather than exposed as a hook?",
      options: [
        "hook_form_alter (altering a form)",
        "hook_entity_presave (before an entity is saved)",
        "ConfigEvents::SAVE (configuration was saved)",
        "hook_node_access (node access checks)",
      ],
      answerIndex: 2,
      explain:
        "Configuration is a Symfony-derived subsystem, so it dispatches ConfigEvents::SAVE / ConfigEvents::DELETE. Forms, entity CRUD, and node access are classic Drupal extension points exposed as hooks — the subject of the next part.",
    },
  ],
};

export default lesson;
