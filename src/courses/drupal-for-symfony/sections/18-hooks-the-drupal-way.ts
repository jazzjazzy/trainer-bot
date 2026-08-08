import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "hooks-the-drupal-way",
  title: "Hooks: The Extension Mechanism Symfony Lacks",
  part: "Extending Drupal",
  estMinutes: 12,
  summary:
    "Hooks are Drupal's oldest and most pervasive extension point — a module implements hook_NAME by defining a specially-named function that core discovers and invokes on every module, a convention Symfony has no direct equivalent for.",

  concept: `
Symfony has no hooks. When you want to influence code you don't own in Symfony,
you dispatch or subscribe to an **event**, decorate a **service**, or tag a
listener. Drupal has events too (you met them in the last part), but its original
and still-dominant extension mechanism is the **hook** — and there is nothing
quite like it in the Symfony world.

### What a hook actually is

A hook is a **naming convention**, not an interface or a base class. Core (or any
module) declares that a hook called \`hook_NAME\` exists. Any module can
*implement* it by defining a plain function named \`\${module}_\${NAME}\` in its
\`mymodule.module\` file. When core reaches the relevant point, it asks the module
handler to call **every** implementation across **every** enabled module, in
module-weight order. There is no registration step, no tag, no service — the
function's *name* is the wiring.

\`\`\`php
// In mymodule.module — this fires because of its NAME alone.
function mymodule_cron() {
  \\Drupal::logger('mymodule')->info('Cron ran.');
}
\`\`\`

### The module_invoke_all mental model

The classic core call was \`module_invoke_all('cron')\`, which looped over enabled
modules, built each candidate function name, and called it if
\`function_exists()\`. Modern Drupal wraps this in the \`module_handler\` service
(\`$handler->invokeAll('cron')\`), but the mental model is unchanged: **collect
every \`*_cron\` function and call them all**. Compare that to a Symfony event
dispatch — same "notify everyone who cares" idea, but keyed on a function-name
pattern instead of a subscriber registry.

### The hooks you will meet constantly

- **hook_form_alter / hook_form_FORM_ID_alter** — mutate any form's render array
  by reference before it renders. The Symfony instinct (a form event) exists, but
  Drupal reaches for the alter hook.
- **hook_entity_presave / hook_entity_insert / hook_entity_update** — the entity
  CRUD lifecycle, roughly where you'd use Doctrine \`prePersist\`/\`preUpdate\`
  listeners.
- **hook_theme** — declare theme hooks (template + variables) your module provides.
- **hook_cron** — run periodic work when Drupal's cron fires.

### Alter hooks: the by-reference twist

A whole family — \`hook_form_alter\`, \`hook_entity_type_alter\`,
\`hook_theme_registry_alter\` — takes its main argument **by reference** (\`&$form\`)
so every module can layer mutations onto the same structure. That mutable,
everyone-gets-a-turn pipeline is the most un-Symfony thing here.

### Drupal 11.1+: OOP #[Hook] attributes

Drupal 11.1 lets you skip the \`.module\` file and write hooks
as methods on a class in the \`Drupal\\mymodule\\Hook\` namespace, tagged with the
\`#[Hook('form_alter')]\` attribute. A compiler pass discovers them, registers the
class as an autowired service, and you finally get **constructor dependency
injection** in a hook — closing much of the gap with Symfony's event subscribers.
The procedural \`.module\` style still works everywhere and remains the common form
in D10.
`,

  comparisons: [
    {
      label: "Reacting to a save: listener vs hook",
      intro:
        "Run logic just before an entity is written. In Symfony you register a Doctrine lifecycle listener/subscriber; in Drupal you name a function and core calls it.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony + Doctrine — a tagged lifecycle listener
namespace App\\EventListener;

use App\\Entity\\Article;
use Doctrine\\Bundle\\DoctrineBundle\\Attribute\\AsEntityListener;
use Doctrine\\ORM\\Events;

#[AsEntityListener(event: Events::prePersist, entity: Article::class)]
final class ArticleListener
{
    public function prePersist(Article $article): void
    {
        if (!$article->getSlug()) {
            $article->setSlug(strtolower($article->getTitle()));
        }
    }
}`,
      ts: `// Drupal — a hook, wired by function NAME in mymodule.module
use Drupal\\Core\\Entity\\EntityInterface;

/**
 * Implements hook_entity_presave().
 */
function mymodule_entity_presave(EntityInterface $entity) {
  if ($entity->getEntityTypeId() !== 'node') {
    return;
  }
  if ($entity->bundle() === 'article' && $entity->get('field_slug')->isEmpty()) {
    $entity->set('field_slug', strtolower($entity->label()));
  }
}`,
      note: "No attribute, no registration: the name mymodule_entity_presave IS the wiring. Note the hook fires for ALL entity types, so you filter by getEntityTypeId()/bundle() yourself.",
    },
    {
      label: "Altering something you don't own",
      intro:
        "Add a field to a form defined by another module. Symfony has no first-class 'alter someone else's form' hook — you'd use a form event; Drupal makes altering a core mechanism.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony — react to form building via an event on YOUR form type
namespace App\\Form;

use Symfony\\Component\\Form\\FormBuilderInterface;
use Symfony\\Component\\Form\\FormEvent;
use Symfony\\Component\\Form\\FormEvents;

$builder->addEventListener(FormEvents::PRE_SET_DATA, function (FormEvent $event) {
    $form = $event->getForm();
    $form->add('newsletterOptIn', CheckboxType::class, ['mapped' => false]);
});
// Reaching into a DIFFERENT bundle's form is not idiomatic Symfony.`,
      ts: `// Drupal — alter ANY module's form by its form_id, by reference
use Drupal\\Core\\Form\\FormStateInterface;

/**
 * Implements hook_form_FORM_ID_alter().
 */
function mymodule_form_user_register_form_alter(
  array &$form,
  FormStateInterface $form_state,
  string $form_id
) {
  $form['newsletter_opt_in'] = [
    '#type' => 'checkbox',
    '#title' => t('Email me occasional updates'),
    '#weight' => 50,
  ];
}`,
      note: "&$form is passed BY REFERENCE — every module gets to layer changes onto the same render array. The FORM_ID suffix targets one form; drop it (hook_form_alter) to see them all.",
    },
    {
      label: "The modern OOP hook (Drupal 11.1+)",
      intro:
        "The #[Hook] attribute lets a hook live on a service class with constructor injection — much closer to a Symfony EventSubscriber than a procedural function.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony — an EventSubscriber with injected dependencies
final class SlugSubscriber implements EventSubscriberInterface
{
    public function __construct(private LoggerInterface $logger) {}

    public function onPreWrite(ArticleEvent $event): void
    {
        $this->logger->info('slugging');
    }

    public static function getSubscribedEvents(): array
    {
        return [ArticleEvents::PRE_WRITE => 'onPreWrite'];
    }
}`,
      ts: `// Drupal 11 — a #[Hook] method, autowired, DI in the constructor
namespace Drupal\\mymodule\\Hook;

use Drupal\\Core\\Hook\\Attribute\\Hook;
use Drupal\\Core\\Entity\\EntityInterface;
use Psr\\Log\\LoggerInterface;

final class EntityHooks {

  public function __construct(private LoggerInterface $logger) {}

  #[Hook('entity_presave')]
  public function presave(EntityInterface $entity): void {
    $this->logger->info('slugging @id', ['@id' => $entity->id()]);
  }

}`,
      note: "Class lives in Drupal\\mymodule\\Hook; a compiler pass finds #[Hook('entity_presave')] and registers it as an autowired service. Same behaviour as the procedural function, but with real dependency injection.",
    },
  ],

  playground: {
    intro:
      "This pure-PHP snippet models module_invoke_all(): register enabled modules, then invoke a hook by building each candidate function name (\\${module}_\\${hook}) and calling every one that exists — exactly how Drupal collects hook implementations.",
    lang: "php",
    code: `<?php

// Modules define hook implementations as functions named {module}_{hook}.
function alpha_cron()  { echo "  alpha_cron: cleared 3 temp files\\n"; }
function beta_cron()   { echo "  beta_cron: sent 1 digest email\\n"; }
function beta_entity_presave($label) {
  echo "  beta_entity_presave: slug = " . strtolower($label) . "\\n";
}
// alpha has NO entity_presave — so it must be skipped, not errored.

// A tiny stand-in for Drupal's module handler.
class MiniModuleHandler {
  public function __construct(private array $modules) {}

  // Mirrors module_invoke_all(): call every {module}_{hook} that exists.
  public function invokeAll(string $hook, array $args = []): void {
    echo "invokeAll('{$hook}'):\\n";
    foreach ($this->modules as $module) {
      $fn = "{$module}_{$hook}";
      if (function_exists($fn)) {
        $fn(...$args);
      }
    }
  }
}

// Module weight/order matters: alpha before beta.
$handler = new MiniModuleHandler(['alpha', 'beta']);

$handler->invokeAll('cron');
$handler->invokeAll('entity_presave', ['Hello World']);
echo "done\\n";`,
    output: `invokeAll('cron'):
  alpha_cron: cleared 3 temp files
  beta_cron: sent 1 digest email
invokeAll('entity_presave'):
  beta_entity_presave: slug = hello world
done`,
  },

  keyPoints: [
    "A hook is a naming convention, not an interface: define mymodule_NAME() in mymodule.module and core discovers and calls it — no registration, no tag, no service.",
    "The mental model is module_invoke_all / $module_handler->invokeAll('NAME'): core collects EVERY *_NAME function across enabled modules and calls them all, in module-weight order.",
    "Alter hooks (hook_form_alter, hook_entity_type_alter) take their subject BY REFERENCE so every module can layer mutations onto one shared structure — the most un-Symfony pattern here.",
    "Lifecycle hooks (hook_entity_presave/insert/update) fire for ALL entity types, so you filter by getEntityTypeId()/bundle() inside the implementation.",
    "hook_form_FORM_ID_alter targets one form by id; hook_form_alter sees every form. hook_theme declares templates; hook_cron runs periodic work.",
    "Drupal 11.1+ adds OOP #[Hook('name')] methods in the Drupal\\\\mymodule\\\\Hook namespace with constructor DI — the closest hooks get to a Symfony EventSubscriber.",
  ],

  interview: [
    {
      q: "Coming from Symfony, how would you explain what a Drupal hook is and how it differs from an event subscriber?",
      a: "A hook is a **naming convention** rather than a registered service. You implement one by defining a function named \`\${module}_\${hookname}\` in your \`.module\` file, and Drupal discovers it by name — there is no tag, no interface, and no explicit registration like Symfony's \`event_subscriber\` tag. Where a Symfony subscriber declares which events it wants via \`getSubscribedEvents()\`, a hook is invoked because core calls \`module_invoke_all('hookname')\` (now \`$module_handler->invokeAll()\`), which builds every candidate function name and calls the ones that exist. The intent is the same 'notify everyone who cares', but the wiring is the function's name, not a service definition.",
    },
    {
      q: "What is hook_form_alter, and why does it feel foreign to a Symfony developer?",
      a: "\`hook_form_alter()\` (and the more targeted \`hook_form_FORM_ID_alter()\`) lets any module modify **any** form built by any other module, receiving the form render array **by reference** (\`&$form\`) so it can add, hide, or reorder fields before rendering. It feels foreign because Symfony has no idiomatic way to reach into a form type you don't own — you'd normally add a \`FormEvents\` listener on your *own* form. Drupal deliberately makes cross-module alteration a first-class, everyone-gets-a-turn pipeline: many modules can alter the same form in sequence. That mutable, by-reference, chain-of-modules model is the key mental shift.",
    },
    {
      q: "Drupal 11 introduced #[Hook] attribute classes. What problem do they solve?",
      a: "Procedural hooks live in a \`.module\` file as plain functions, so they can't use constructor dependency injection — you fall back to \`\\Drupal::service()\` static calls, which are hard to test. The \`#[Hook('form_alter')]\` attribute lets you put the implementation on a **method of a class** in the \`Drupal\\mymodule\\Hook\` namespace; a compiler pass discovers it and registers the class as an **autowired service**, so you get proper DI in the constructor. It brings hooks much closer to a Symfony \`EventSubscriber\` in ergonomics. It's available from Drupal 11.1 onward, with core progressively converting its own hooks to this form; the procedural .module form still works.",
    },
  ],

  quiz: [
    {
      question:
        "You add a function mymodule_cron() to mymodule.module. What makes Drupal call it?",
      options: [
        "You must tag it as a cron listener in mymodule.services.yml",
        "Nothing extra — its NAME matches the hook_cron pattern, so the module handler invokes it",
        "It must implement a CronHookInterface",
        "You must register it in a compiler pass",
      ],
      answerIndex: 1,
      explain:
        "Hooks are wired by naming convention. When cron runs, the module handler builds '{module}_cron' for each enabled module and calls every one that exists — no tag, interface, or service needed for the procedural form.",
    },
    {
      question:
        "Why does hook_form_alter receive its form argument as &$form (by reference)?",
      options: [
        "For performance, to avoid copying a large array",
        "So multiple modules can each layer mutations onto the same shared form render array",
        "Because Drupal forms are immutable otherwise",
        "It's a historical accident with no real effect",
      ],
      answerIndex: 1,
      explain:
        "Every enabled module's alter implementation is called in turn on the same form structure. Passing by reference lets each one add, hide, or reorder fields, building up a cumulative result — the everyone-gets-a-turn pipeline that has no direct Symfony equivalent.",
    },
    {
      question:
        "Which statement about the D11 #[Hook] attribute is correct?",
      options: [
        "It replaces events and removes the .module file entirely from all modules",
        "It lets a hook live on an autowired service class with constructor DI, discovered by a compiler pass",
        "It only works for hook_cron",
        "It requires registering the class manually in mymodule.services.yml",
      ],
      answerIndex: 1,
      explain:
        "The #[Hook('name')] attribute on a method in the Drupal\\mymodule\\Hook namespace is discovered by HookCollectorPass, which registers the class as an autowired service — giving hooks constructor dependency injection. Procedural .module hooks still work alongside it.",
    },
  ],
};

export default lesson;
