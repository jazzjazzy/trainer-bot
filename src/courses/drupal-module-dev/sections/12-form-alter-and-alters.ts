import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "form-alter-and-alters",
  title: "The Alter System: hook_form_alter & Friends",
  part: "Services, DI & Business Logic",
  estMinutes: 12,
  summary:
    "How any module can mutate any other module's forms, render arrays, and data by reference through the alter-hook family — and the discipline (thin alters, safe appends, explicit ordering) that keeps it maintainable.",

  concept: `
## Mutation, not decoration

Symfony's extension points are **opt-in and typed**: a form event listener you register,
a type extension you declare, a service you decorate. Drupal adds a blunter, broader
instrument: **alter hooks**. Right before a data structure is used, core hands it to
*every installed module* by reference and lets each one mutate it. There is no
interface to implement and no registration beyond the naming convention — under the
hood \`ModuleHandlerInterface::alter('form', $form, ...)\` calls every
\`MODULE_form_alter()\` it can find (this was \`drupal_alter()\` in old Drupal).

### The form_alter family

Three levels of specificity; for the incident node form they are:

- \`hook_form_alter(&$form, FormStateInterface $form_state, $form_id)\` — fires for
  **every form** on the site.
- \`hook_form_BASE_FORM_ID_alter\` — \`incident_tracker_form_node_form_alter()\` fires
  for every node form, any bundle, add *and* edit.
- \`hook_form_FORM_ID_alter\` — \`incident_tracker_form_node_incident_form_alter()\`
  fires only for the incident **add** form; the edit form's id is
  \`node_incident_edit_form\`.

\`$form\` is the same render array the form class built, passed **by reference**. The
three safe moves:

- **Add** an element: \`$form['it_page_oncall'] = ['#type' => 'checkbox', ...]\`.
- **Hide** an element: \`$form['field_legacy_ref']['#access'] = FALSE\` — removed from
  processing and display, not just CSS-hidden.
- **Append** behavior: \`$form['#validate'][] = 'my_callback'\`. Always \`[]=\`, never
  \`=\` — assigning the whole array wipes every other module's callbacks. (On node
  forms, *submit* handlers live on the button:
  \`$form['actions']['submit']['#submit'][]\`.)

### Friends of form_alter

The same pattern covers nearly everything: \`hook_ENTITY_TYPE_view_alter\` mutates a
node's render array before display, \`hook_page_attachments_alter\` edits page-wide
meta tags and libraries, plus \`hook_local_tasks_alter\`, \`hook_views_query_alter\`,
and dozens more. Your module can publish its own seam too: call
\`$this->moduleHandler->alter('incident_tracker_summary', $summary, $context)\` and
any module may implement \`MODULE_incident_tracker_summary_alter()\`.

### Discipline

Alter reach is the power *and* the danger — untyped arrays, mutated by anyone, in an
order you don't control by default. Three rules keep it sane:

1. **Keep alters thin.** The hook should sniff the condition and delegate to a
   service (\`\\Drupal::service('incident_tracker.reporter')\`); services are unit
   testable, \`.module\` functions are not.
2. **Mind the order.** Implementations run by module weight, then alphabetically. If
   another module undoes your change, implement \`hook_module_implements_alter()\` to
   move yourself last — always \`isset()\`-guard your key first, because
   \`$implementations\` holds only modules that implement the concrete \`$hook\` being
   built, and re-adding a key for a function you don't have throws a
   \`RuntimeException\`. That hook is **removed in Drupal 12**: on 11.2+ prefer
   \`order:\` on \`#[Hook]\`, and if you must keep the procedural function for pre-11.2
   support, mark it \`#[\\Drupal\\Core\\Hook\\Attribute\\LegacyModuleImplementsAlter]\` so
   it is skipped once attribute ordering is available.
3. **Know the modern form.** Drupal 11.1+ lets you write hooks as methods on classes
   in \`src/Hook\` marked \`#[Hook('form_alter')]\` (auto-registered, autowired
   services); 11.2 adds \`order: Order::Last\` on the attribute so ordering is
   declarative. Procedural \`.module\` hooks still work in D10 and D11.
`,

  comparisons: [
    {
      label: "Adding a field to a form you don't own",
      intro:
        "Both frameworks can extend a form defined elsewhere. Symfony uses a registered type extension; Drupal lets any module implement a naming-convention hook and mutate the form array directly.",
      php: `<?php
// Symfony — a form type extension targets IncidentType everywhere.
use Symfony\\Component\\Form\\AbstractTypeExtension;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\CheckboxType;
use Symfony\\Component\\Form\\FormBuilderInterface;

class PageOnCallExtension extends AbstractTypeExtension
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder->add('pageOnCall', CheckboxType::class, [
            'mapped' => false,
            'required' => false,
            'label' => 'Page the on-call engineer?',
        ]);
    }

    public static function getExtendedTypes(): iterable
    {
        return [IncidentType::class];   // opt-in, typed, registered
    }
}`,
      ts: `<?php
// incident_tracker.module — Drupal 10/11.
use Drupal\\Core\\Form\\FormStateInterface;

/**
 * Implements hook_form_FORM_ID_alter() for node_incident_form.
 */
function incident_tracker_form_node_incident_form_alter(array &$form, FormStateInterface $form_state, $form_id): void {
  // $form is a render array passed BY REFERENCE: mutate it in place.
  $form['it_page_oncall'] = [
    '#type' => 'checkbox',
    '#title' => t('Page the on-call engineer?'),
    '#weight' => 90,
  ];

  // Hide an element another module added — gone from processing, not just CSS.
  $form['field_legacy_ref']['#access'] = FALSE;
}`,
      note: "FORM_ID variant hits only the incident ADD form (edit is node_incident_edit_form); use incident_tracker_form_node_form_alter() (BASE_FORM_ID) to cover every node form, add and edit.",
    },
    {
      label: "Appending validation to someone else's form",
      intro:
        "Cross-field business rule: a critical incident must page on-call. Symfony attaches a form event listener; Drupal APPENDS a callback to the form's #validate pipeline.",
      php: `<?php
// Symfony — POST_SUBMIT listener added in the extension/type.
use Symfony\\Component\\Form\\FormError;
use Symfony\\Component\\Form\\FormEvent;
use Symfony\\Component\\Form\\FormEvents;

$builder->addEventListener(FormEvents::POST_SUBMIT, function (FormEvent $event): void {
    $form = $event->getForm();
    $incident = $event->getData();

    if ($incident->getSeverity() === 'critical'
        && !$form->get('pageOnCall')->getData()) {
        $form->get('pageOnCall')->addError(
            new FormError('Critical incidents must page the on-call engineer.')
        );
    }
});`,
      ts: `<?php
// incident_tracker.module — append to #validate in the alter...
function incident_tracker_form_node_incident_form_alter(array &$form, FormStateInterface $form_state, $form_id): void {
  $form['#validate'][] = 'incident_tracker_oncall_validate';  // []= not =
}

// ...and the callback gets ($form, $form_state) like any Form API validator.
function incident_tracker_oncall_validate(array &$form, FormStateInterface $form_state): void {
  $severity = $form_state->getValue(['field_severity', 0, 'value']);
  if ($severity === 'critical' && !$form_state->getValue('it_page_oncall')) {
    $form_state->setErrorByName('it_page_oncall',
      t('Critical incidents must page the on-call engineer.'));
  }
}`,
      note: "Assigning $form['#validate'] = [...] would erase other modules' validators — always append. Submit handlers on node forms go on $form['actions']['submit']['#submit'].",
    },
    {
      label: "Publishing your own alterable seam",
      intro:
        "Making incident_tracker itself extensible. Symfony's answer is service decoration; Drupal's is firing your own alter hook so any module can massage your data.",
      php: `<?php
// Symfony — a decorator wraps and replaces the original service.
use Symfony\\Component\\DependencyInjection\\Attribute\\AsDecorator;

#[AsDecorator(decorates: IncidentSummary::class)]
class SlaAwareSummary implements IncidentSummaryInterface
{
    public function __construct(private IncidentSummaryInterface $inner) {}

    public function build(string $range): array
    {
        $summary = $this->inner->build($range);   // delegate...
        $summary['sla_breaches'] = $this->countBreaches($range);
        return $summary;                          // ...then extend
    }
}`,
      ts: `<?php
// Drupal — IncidentReporter::buildSummary() offers the data to everyone.
$summary = ['open' => $open, 'critical' => $critical];
$context = ['range' => $range];
// Invokes every MODULE_incident_tracker_summary_alter() implementation.
$this->moduleHandler->alter('incident_tracker_summary', $summary, $context);
return $summary;

// Any other module (ops_dashboard.module) can now join in:
function ops_dashboard_incident_tracker_summary_alter(array &$summary, array $context): void {
  $summary['sla_breaches'] = \\Drupal::service('ops_dashboard.sla')
    ->countBreaches($context['range']);
}`,
      note: "Decoration replaces ONE service with ONE typed wrapper; alter() invites EVERY module to mutate an untyped array. Broader reach, weaker contract — document what your alter data means.",
    },
    {
      label: "Controlling who alters last",
      intro:
        "When two extensions touch the same thing, order decides the winner. Symfony uses listener priorities; Drupal orders hooks by module weight and lets you reshuffle — or, on Drupal 11.2+, declare order on the #[Hook] attribute.",
      php: `<?php
// Symfony — numeric priority on the listener (higher runs first).
use Symfony\\Component\\EventDispatcher\\Attribute\\AsEventListener;
use Symfony\\Component\\HttpKernel\\Event\\ResponseEvent;

class LateResponseListener
{
    // priority -255: run after nearly everyone else.
    #[AsEventListener(event: 'kernel.response', priority: -255)]
    public function onResponse(ResponseEvent $event): void
    {
        $event->getResponse()->headers->set('X-Incident-Tracker', 'on');
    }
}`,
      ts: `<?php
// Drupal 10/11 procedural — reshuffle the implementation list.
/**
 * Implements hook_module_implements_alter().
 */
function incident_tracker_module_implements_alter(array &$implementations, string $hook): void {
  // $hook is the CONCRETE hook name: core builds one list per hook name
  // ('form_alter', 'form_node_form_alter', 'form_node_incident_form_alter'),
  // and $implementations only ever contains modules that really implement it.
  // The pass that orders the whole form_alter family is the 'form_alter' one —
  // but we implement only the FORM_ID variant, so ALWAYS isset() first.
  if ($hook === 'form_alter' && isset($implementations['incident_tracker'])) {
    // Move us to the END so nobody undoes our changes.
    $group = $implementations['incident_tracker'];
    unset($implementations['incident_tracker']);
    $implementations['incident_tracker'] = $group;
  }
}

// Drupal 11.2+ OOP — declare it on the attribute instead:
// use Drupal\\Core\\Hook\\Attribute\\Hook;
// use Drupal\\Core\\Hook\\Order\\Order;
// #[Hook('form_alter', order: Order::Last)]
// public function formAlter(array &$form, FormStateInterface $form_state, string $form_id): void {}`,
      note: "Default hook order is module weight, then alphabetical. Never touch $implementations['your_module'] unguarded: core builds the list per concrete hook name and only includes modules that implement it, so on Drupal 10 re-adding a key for a function you don't have makes buildImplementationInfo() throw \"An invalid implementation incident_tracker_form_alter was added by hook_module_implements_alter()\" on every form build — 11.1+ dropped buildImplementationInfo() along with that guard, so the bogus key is silently ignored instead. Also note hook_module_implements_alter() is removed in Drupal 12 — on 11.2+ prefer order: on #[Hook], and if you must keep the procedural function for pre-11.2 support, mark it #[\\Drupal\\Core\\Hook\\Attribute\\LegacyModuleImplementsAlter] so it is skipped once attribute ordering is available.",
    },
  ],

  playground: {
    intro:
      "The alter pipeline in miniature: a dispatcher walks the module list, calls each MODULE_form_alter() by naming convention, and every one mutates the SAME $form array by reference. Predict the element list, the #validate chain, and which validator fires on a bad submission.",
    lang: "php",
    code: `<?php
// Drupal's alter pipeline in miniature: the "module handler" walks the
// installed modules and calls MODULE_form_alter() on each, passing the
// SAME $form array by reference. Mutation, not decoration.

$form = [
  'title' => ['#type' => 'textfield', '#title' => 'Title'],
  'field_severity' => ['#type' => 'select', '#title' => 'Severity'],
  'actions' => ['#type' => 'actions'],
  '#validate' => ['node_form_validate'],
];

// honeypot.module — adds a hidden bot-trap field to EVERY form.
function honeypot_form_alter(array &$form, string $form_id): void {
  $form['url'] = ['#type' => 'textfield', '#access' => false];
  $form['#validate'][] = 'honeypot_validate';
}

// incident_tracker.module — only cares about the incident node form.
function incident_tracker_form_alter(array &$form, string $form_id): void {
  if ($form_id !== 'node_incident_form') {
    return;
  }
  $form['it_page_oncall'] = ['#type' => 'checkbox', '#title' => 'Page on-call?'];
  $form['#validate'][] = 'incident_tracker_oncall_validate';   // APPEND, never replace
}

// The dispatch: order = module weight, then alphabetical.
// (hook_module_implements_alter could reorder this list.)
$implementations = ['honeypot', 'incident_tracker'];
foreach ($implementations as $module) {
  $fn = $module . '_form_alter';
  if (function_exists($fn)) {
    $fn($form, 'node_incident_form');    // by reference: each module mutates it
  }
}

$children = array_filter(array_keys($form), fn ($k) => $k[0] !== '#');
echo 'elements:  ' . implode(', ', $children) . "\\n";
echo 'validate:  ' . implode(' -> ', $form['#validate']) . "\\n\\n";

// Now submit a critical incident WITHOUT paging on-call and run the
// #validate pipeline that the alters assembled.
function node_form_validate(array $v, array &$errors): void {
  if ($v['title'] === '') { $errors['title'] = 'Title is required.'; }
}
function honeypot_validate(array $v, array &$errors): void {
  if ($v['url'] !== '') { $errors['url'] = 'Spam detected.'; }
}
function incident_tracker_oncall_validate(array $v, array &$errors): void {
  if ($v['field_severity'] === 'critical' && !$v['it_page_oncall']) {
    $errors['it_page_oncall'] = 'Critical incidents must page on-call.';
  }
}

$values = ['title' => 'DB down', 'field_severity' => 'critical', 'it_page_oncall' => 0, 'url' => ''];
$errors = [];
foreach ($form['#validate'] as $callback) {
  $callback($values, $errors);
}
print_r($errors);`,
    output: `elements:  title, field_severity, actions, url, it_page_oncall
validate:  node_form_validate -> honeypot_validate -> incident_tracker_oncall_validate

Array
(
    [it_page_oncall] => Critical incidents must page on-call.
)
`,
  },

  keyPoints: [
    "Alter hooks are Drupal's 'modify anyone's stuff' mechanism: ModuleHandler::alter('form', ...) passes the same array BY REFERENCE to every MODULE_form_alter() — mutation, not Symfony-style typed decoration.",
    "Specificity ladder: hook_form_alter (every form) → hook_form_BASE_FORM_ID_alter (e.g. node_form: all node forms) → hook_form_FORM_ID_alter (e.g. node_incident_form: one form).",
    "Safe moves inside an alter: add elements, hide with '#access' => FALSE, and APPEND callbacks ($form['#validate'][] = ...; node-form submit handlers on $form['actions']['submit']['#submit']). Never assign over the whole array.",
    "The pattern generalizes: hook_ENTITY_TYPE_view_alter, hook_page_attachments_alter, hook_views_query_alter — and you can fire your own with $moduleHandler->alter('incident_tracker_summary', $data, $context).",
    "Keep alters thin: sniff the condition in the hook, delegate the real logic to a service so it stays unit-testable.",
    "Order is module weight then alphabetical; reshuffle with hook_module_implements_alter, or on Drupal 11.2+ declare #[Hook('form_alter', order: Order::Last)] on an OOP hook class.",
  ],

  interview: [
    {
      q: "How does Drupal's hook_form_alter compare to Symfony's form events and type extensions?",
      a: "They solve the same problem — extending a form you don't own — with opposite philosophies. Symfony is **opt-in and typed**: you register a listener for \`FormEvents::PRE_SET_DATA\`/\`POST_SUBMIT\` or declare an \`AbstractTypeExtension\` with \`getExtendedTypes()\`, and you work through the builder/form API. Drupal is **universal and by-reference**: core invokes every \`MODULE_form_alter()\` implementation by naming convention and hands each one the raw \`$form\` render array to mutate directly. Drupal's reach is broader (any module, any form, no registration), but the contract is weaker — untyped arrays and no compile-time guarantees — which is why discipline around thin alters and safe appends matters so much.",
    },
    {
      q: "You need to enforce a business rule on the incident node form, which is core's form, not yours. Walk me through it.",
      a: "Implement \`incident_tracker_form_node_incident_form_alter()\` (the FORM_ID variant, or \`_form_node_form_alter\` to also cover the edit form, whose id is \`node_incident_edit_form\`) and **append** a callback: \`$form['#validate'][] = 'incident_tracker_oncall_validate';\`. The callback receives \`(array &$form, FormStateInterface $form_state)\`, reads values with \`$form_state->getValue(['field_severity', 0, 'value'])\`, and raises errors with \`$form_state->setErrorByName()\`. Two gotchas: assign with \`[]=\` because overwriting \`#validate\` erases every other module's validators, and if you need a *submit* handler on a node form, append to \`$form['actions']['submit']['#submit']\` since node forms attach submit handlers to the button. Keep the hook itself thin and push the actual rule into a service so you can unit test it.",
    },
    {
      q: "Another contrib module's form_alter runs after yours and reverts your change. How do you win?",
      a: "Hook order is module weight (from the \`system\` module list) then alphabetical, so the fix is to make your implementation run last. The classic tool is \`hook_module_implements_alter(&$implementations, $hook)\`: guard with \`if ($hook === 'form_alter' && isset($implementations['incident_tracker']))\`, then unset your module's entry and re-add it, which moves it to the end of the invocation list. The \`isset()\` matters — \`$hook\` is the concrete hook name and \`$implementations\` contains only modules that implement *that* hook, so if you only implement the FORM_ID variant the key may be absent; on Drupal 10, re-adding a key whose function doesn't exist makes core throw \`An invalid implementation incident_tracker_form_alter was added by hook_module_implements_alter()\` on every form build (11.1+ replaced that code path with HookCollectorPass and no longer validates the list, so the bogus key is just ignored). That hook is also removed in Drupal 12, so on 11.2+ with OOP hook classes declare it instead: \`#[Hook('form_alter', order: Order::Last)]\` (with before/after variants for targeting a specific module), and mark any procedural fallback you keep for pre-11.2 sites \`#[\\Drupal\\Core\\Hook\\Attribute\\LegacyModuleImplementsAlter]\`. Whichever you use, leave a comment — ordering fights are exactly the kind of invisible coupling that bites the next developer.",
    },
    {
      q: "How would you make incident_tracker itself extensible by other modules, Drupal-style?",
      a: "Fire your own alter hook at the seam: in the service, build the data, then call \`$this->moduleHandler->alter('incident_tracker_summary', $summary, $context);\` (inject \`module_handler\`; this is the modern replacement for D7's \`drupal_alter()\`). Any module can then implement \`MODULE_incident_tracker_summary_alter(array &$summary, array $context)\` and mutate the data by reference. It's the array-mutation analogue of Symfony service decoration — broader reach, but an untyped contract, so document the shape of \`$summary\` in an \`incident_tracker.api.php\` file like core modules do. For richer contracts, dispatching an event object (previous section) is the typed alternative; many modules offer both.",
    },
  ],

  quiz: [
    {
      question: "Inside hook_form_alter you write $form['#validate'] = ['my_validate']; What's wrong?",
      options: [
        "Nothing — that is the documented way to add a validator",
        "Assignment replaces the whole pipeline, wiping the form's own validators and every other module's appended callbacks; you must append with $form['#validate'][]",
        "#validate does not exist on forms; validators are services tagged form.validator",
        "It fails because $form is passed by value and the change is lost",
      ],
      answerIndex: 1,
      explain:
        "$form is by reference, so the assignment sticks — that's the problem. You just deleted every previously registered validate callback. The alter contract is cooperative mutation: append with []=, never overwrite shared arrays like #validate, #submit, or #attached.",
    },
    {
      question: "Which implementation fires ONLY when a user creates a new incident node (not when editing one)?",
      options: [
        "incident_tracker_form_alter()",
        "incident_tracker_form_node_form_alter()",
        "incident_tracker_form_node_incident_form_alter()",
        "incident_tracker_node_incident_alter()",
      ],
      answerIndex: 2,
      explain:
        "The add form's id is node_incident_form, so the hook_form_FORM_ID_alter variant matches only it — the edit form is node_incident_edit_form. The BASE_FORM_ID variant (node_form) covers all node forms, and plain hook_form_alter covers every form on the site.",
    },
    {
      question: "Two modules alter the same form and yours must run last. What determines the default order, and how do you change it?",
      options: [
        "Order is random per request; add a priority integer to the hook name",
        "Order is module weight then alphabetical; implement hook_module_implements_alter (or Order::Last on a D11.2 #[Hook] attribute) to move yourself last",
        "Order follows the .info.yml dependencies list; add the other module as a dependency",
        "Alters cannot be reordered; you must patch the other module",
      ],
      answerIndex: 1,
      explain:
        "Implementations run by module weight, then alphabetically by module name. hook_module_implements_alter lets you reshuffle the list for a given hook (unset + re-add moves you last); Drupal 11.2's OOP hooks make it declarative with order: Order::First/Order::Last and before/after variants.",
    },
    {
      question: "What does \\Drupal::moduleHandler()->alter('incident_tracker_summary', $summary, $context) do?",
      options: [
        "Renders the summary through the incident_tracker theme layer",
        "Dispatches a typed event object to registered event subscribers",
        "Invokes every module's MODULE_incident_tracker_summary_alter() implementation, passing $summary and $context by reference so each may mutate them",
        "Validates $summary against the module's config schema",
      ],
      answerIndex: 2,
      explain:
        "alter($type, &$data, &$context) is the generic engine behind every alter hook: it resolves implementations of hook_TYPE_alter by naming convention and calls each with the data by reference. It's how your own module publishes an extension seam — the mutation-based sibling of dispatching an event.",
    },
  ],
};

export default lesson;
