import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "custom-form-formbase",
  title: "A Custom Form with FormBase",
  part: "Forms & Config",
  estMinutes: 12,
  summary:
    "Build incident_tracker's report form with FormBase — element arrays instead of a FormType, a _form route instead of a controller, setErrorByName() validation, and array values with no data_class binding.",

  concept: `
In Symfony the **controller** owns the form lifecycle: you
\`createForm(IncidentType::class, $incident)\`, call \`handleRequest($request)\`,
branch on \`isSubmitted() && isValid()\`, persist, redirect. Drupal inverts the
ownership. \`FormBuilder\` runs the lifecycle, and your class —
\`IncidentReportForm extends Drupal\\Core\\Form\\FormBase\` — just supplies the
four methods it calls: \`getFormId()\`, \`buildForm()\`, \`validateForm()\`,
\`submitForm()\`. There is no controller *you* write: the route's \`defaults\` uses
\`_form\` instead of \`_controller\`, pointing straight at the class, and at request
time a route enhancer swaps that for core's generic
\`HtmlFormController\` (\`controller.form:getContentResult\`), which instantiates
your class and hands it to \`FormBuilder\` to run the lifecycle. One route
serves both the GET (render) and the POST (validate/submit), and the Form API
here is identical in Drupal 10 and 11.

### Elements are render arrays

\`buildForm(array $form, FormStateInterface $form_state)\` returns the same kind
of nested \`#\`-keyed arrays you return from controllers, using form-specific
\`#type\`s: \`textfield\`, \`select\`, \`textarea\`, \`details\` (a collapsible
group), \`submit\`. Properties like \`#title\`, \`#required\`, \`#default_value\`,
and \`#options\` replace the options array you pass to \`$builder->add()\`. Where
Symfony composes typed \`FormType\` classes fluently, Drupal describes the whole
form declaratively as data — which is exactly what lets other modules reshape it
later with \`hook_form_alter()\`.

### No data_class: values come out as arrays

The biggest mental shift: Form API has no data binding. There is no
\`data_class\`, no hydrated object from \`getData()\`. Submitted input arrives as
a plain array — \`$form_state->getValue('title')\` for one element,
\`$form_state->getValues()\` for all of them — and mapping values onto storage
(an entity, a custom table, config) is your job inside \`submitForm()\`. (Entity
forms *do* bind, but that is \`EntityForm\`, a different base class, later.)

### Validate, then submit

\`validateForm()\` is imperative: inspect values and attach an error to a
specific element with \`$form_state->setErrorByName('description', $this->t('…'))\`.
\`#required\` is enforced by FormBuilder before your method even runs. If any
error was set, submit handlers are skipped and the form re-renders with inline
errors; otherwise \`submitForm()\` runs. Finish with Drupal's flash + PRG:
\`$this->messenger()->addStatus(…)\` (FormBase wires the messenger service in for
you) and \`$form_state->setRedirect('incident_tracker.list')\` — by route name,
just like \`redirectToRoute()\`.

### #states: conditional UI without writing JS

Form API can also wire client-side behavior declaratively. Give an element a
\`#states\` property and core's \`drupal.states\` library toggles it in the
browser:

\`\`\`
'#states' => [
  'visible' => [
    ':input[name="severity"]' => ['value' => 'critical'],
  ],
],
\`\`\`

Our "steps to reproduce" textarea appears only when severity is *critical* — no
custom JavaScript written. It is UX only, though: a hidden element's value still
posts, so keep real rules in \`validateForm()\`.
`,

  comparisons: [
    {
      label: "Defining the form: FormType vs FormBase",
      intro:
        "Both sides declare the incident-report fields. Symfony composes typed field classes onto a builder and binds them to a data_class; Drupal returns one declarative array of '#'-keyed elements.",
      php: `<?php
// Symfony: src/Form/IncidentType.php
namespace App\\Form;

use App\\Entity\\Incident;
use Symfony\\Component\\Form\\AbstractType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\ChoiceType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\TextareaType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\TextType;
use Symfony\\Component\\Form\\FormBuilderInterface;
use Symfony\\Component\\OptionsResolver\\OptionsResolver;

class IncidentType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('title', TextType::class)
            ->add('severity', ChoiceType::class, [
                'choices' => ['Low' => 'low', 'High' => 'high', 'Critical' => 'critical'],
            ])
            ->add('description', TextareaType::class, ['required' => false]);
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        // Submitted data is mapped onto this object.
        $resolver->setDefaults(['data_class' => Incident::class]);
    }
}`,
      ts: `<?php
// Drupal: src/Form/IncidentReportForm.php (module: incident_tracker)
namespace Drupal\\incident_tracker\\Form;

use Drupal\\Core\\Form\\FormBase;
use Drupal\\Core\\Form\\FormStateInterface;

class IncidentReportForm extends FormBase {

  public function getFormId(): string {
    return 'incident_tracker_report';
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    $form['title'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Title'),
      '#required' => TRUE,
      '#maxlength' => 120,
    ];
    $form['severity'] = [
      '#type' => 'select',
      '#title' => $this->t('Severity'),
      '#options' => [
        'low' => $this->t('Low'),
        'high' => $this->t('High'),
        'critical' => $this->t('Critical'),
      ],
      '#default_value' => 'low',
      '#required' => TRUE,
    ];
    $form['description'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Description'),
      '#rows' => 4,
    ];
    $form['diagnostics'] = [
      '#type' => 'details',
      '#title' => $this->t('Diagnostics'),
      '#open' => FALSE,
    ];
    $form['diagnostics']['steps'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Steps to reproduce'),
      '#states' => [
        'visible' => [
          ':input[name="severity"]' => ['value' => 'critical'],
        ],
      ],
    ];
    $form['actions'] = ['#type' => 'actions'];
    $form['actions']['submit'] = [
      '#type' => 'submit',
      '#value' => $this->t('Save incident'),
    ];
    return $form;
  }

  // validateForm() / submitForm(): next comparisons.
}`,
      note: "One class does the job of FormType + controller glue. Children of the 'details' group are flattened into top-level values by default (no #tree), so getValue('steps') works.",
    },
    {
      label: "Wiring it to a URL",
      intro:
        "Symfony needs a controller action to drive createForm/handleRequest. Drupal needs only a routing entry: _form (instead of _controller) points at the class and FormBuilder does the driving.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony: the controller owns the lifecycle.
#[Route('/incidents/report', name: 'incident_report')]
public function report(Request $request, EntityManagerInterface $em): Response
{
    $incident = new Incident();
    $form = $this->createForm(IncidentType::class, $incident);

    $form->handleRequest($request);
    if ($form->isSubmitted() && $form->isValid()) {
        // $incident is already populated (data_class binding).
        $em->persist($incident);
        $em->flush();
        $this->addFlash('success', 'Incident logged.');
        return $this->redirectToRoute('incident_list');
    }

    return $this->render('incident/report.html.twig', [
        'form' => $form,
    ]);
}`,
      ts: `# Drupal: incident_tracker.routing.yml — no controller class of yours anywhere.
incident_tracker.report:
  path: '/incidents/report'
  defaults:
    _form: '\\Drupal\\incident_tracker\\Form\\IncidentReportForm'
    _title: 'Report an incident'
  requirements:
    _permission: 'access content'

# A route enhancer rewrites _form into core's generic
# HtmlFormController, which builds your form object and hands
# it to FormBuilder: it calls buildForm(), detects the POST,
# runs validate/submit, and re-renders on errors. GET and POST
# share this single route.`,
      note: "_form replaces _controller in the YAML you write; core fills _controller in for you (HtmlFormController). Everything the Symfony action does by hand (handleRequest, isSubmitted, re-render) is FormBuilder's job in Drupal.",
    },
    {
      label: "Validation: constraints vs validateForm()",
      intro:
        "Same business rule — a critical incident needs a real description. Symfony expresses rules as declarative constraints on the data class; Drupal writes an imperative validateForm() that pins errors to elements by name.",
      php: `<?php
// Symfony: constraints on the data class (or in the FormType).
use Symfony\\Component\\Validator\\Constraints as Assert;

class Incident
{
    #[Assert\\NotBlank]
    #[Assert\\Length(max: 120)]
    public ?string $title = null;

    #[Assert\\Choice(['low', 'high', 'critical'])]
    public ?string $severity = null;

    #[Assert\\Expression(
        "this.severity !== 'critical' or this.description matches '/.{10,}/'",
        message: 'Critical incidents need a real description.',
    )]
    public ?string $description = null;
}

// $form->isValid() runs the Validator; violations are mapped
// onto child forms and render next to each widget.`,
      ts: `<?php
// Drupal: imperative validateForm() on the same class.
use Drupal\\Core\\Form\\FormStateInterface;

public function validateForm(array &$form, FormStateInterface $form_state): void {
  // #required is already enforced by FormBuilder before this runs.
  $severity = $form_state->getValue('severity');
  $description = (string) $form_state->getValue('description');

  if ($severity === 'critical' && mb_strlen(trim($description)) < 10) {
    // Attach the error to a specific element by its name.
    $form_state->setErrorByName(
      'description',
      $this->t('Critical incidents need a description of at least 10 characters.'),
    );
  }
}`,
      note: "setErrorByName('description', …) is the manual version of Symfony's violation-to-field mapping. Any error set here blocks submitForm() and re-renders the form with inline messages.",
    },
    {
      label: "Submission: getData() object vs getValues() array",
      intro:
        "After a valid POST, Symfony hands you a hydrated object; Drupal hands you an array. Both finish with a flash message and a redirect-by-route-name.",
      php: `<?php
// Symfony: data_class means getData() returns your object.
if ($form->isSubmitted() && $form->isValid()) {
    /** @var Incident $incident */
    $incident = $form->getData();

    $em->persist($incident);
    $em->flush();

    $this->addFlash('success', sprintf(
        'Incident "%s" logged.',
        $incident->title,
    ));
    return $this->redirectToRoute('incident_list');
}`,
      ts: `<?php
// Drupal: submitForm() runs only when validation passed.
public function submitForm(array &$form, FormStateInterface $form_state): void {
  // No data_class — values come out as a plain array.
  $title = $form_state->getValue('title');
  $values = $form_state->getValues(); // title, severity, description, steps…

  // Persisting (entity / custom table / service) comes in later sections.

  // messenger() = the flash bag; FormBase provides the getter.
  $this->messenger()->addStatus($this->t('Incident %title logged.', [
    '%title' => $title,
  ]));

  // PRG redirect by route name, like redirectToRoute().
  $form_state->setRedirect('incident_tracker.list');
}`,
      note: "getValue()/getValues() replace getData(): you map array values to storage yourself. setRedirect() takes a route name (plus optional params), not a URL string.",
    },
  ],

  playground: {
    intro:
      "FormBuilder's whole job in ~60 lines: build the element array, enforce #required, run your validate callback, and either re-render with errors or run submit + redirect. Predict what each POST prints.",
    lang: "php",
    code: `<?php
// A miniature Form API lifecycle: build -> validate -> (re-render | submit).
// Drupal's FormBuilder runs exactly this dance around your FormBase class.

function build_form(): array {
  return [
    'title' => ['#type' => 'textfield', '#title' => 'Title', '#required' => true],
    'severity' => [
      '#type' => 'select',
      '#title' => 'Severity',
      '#options' => ['low' => 'Low', 'high' => 'High', 'critical' => 'Critical'],
      '#required' => true,
    ],
    'description' => ['#type' => 'textarea', '#title' => 'Description'],
    'actions' => ['submit' => ['#type' => 'submit', '#value' => 'Save incident']],
  ];
}

function set_error_by_name(array &$form_state, string $name, string $msg): void {
  $form_state['errors'][$name] = $msg;
}

function validate_form(array $form, array &$form_state): void {
  $values = $form_state['values'];
  // FormBuilder enforces #required before your validateForm() even runs.
  foreach ($form as $name => $el) {
    if (($el['#required'] ?? false) && ($values[$name] ?? '') === '') {
      set_error_by_name($form_state, $name, "{$el['#title']} field is required.");
    }
  }
  // Your custom rule — IncidentReportForm::validateForm().
  if (($values['severity'] ?? '') === 'critical' && strlen($values['description'] ?? '') < 10) {
    set_error_by_name($form_state, 'description', 'Critical incidents need a real description.');
  }
}

function submit_form(array &$form_state): void {
  // submitForm(): read values, act, message, redirect.
  $title = $form_state['values']['title'];
  echo "messenger: Incident \\"{$title}\\" logged.\\n";
  $form_state['redirect'] = 'incident_tracker.list';
}

function handle(array $post): void {
  $form = build_form();
  $form_state = ['values' => $post, 'errors' => [], 'redirect' => null];
  validate_form($form, $form_state);
  if ($form_state['errors'] !== []) {
    foreach ($form_state['errors'] as $name => $msg) {
      echo "error[{$name}]: {$msg}\\n";
    }
    echo "=> form re-rendered with errors, submitForm() never runs\\n";
    return;
  }
  submit_form($form_state);
  echo "=> redirect to route: {$form_state['redirect']}\\n";
}

echo "POST #1 (empty title, critical with a thin description)\\n";
handle(['title' => '', 'severity' => 'critical', 'description' => 'db down']);

echo "\\nPOST #2 (valid)\\n";
handle([
  'title' => 'DB outage',
  'severity' => 'critical',
  'description' => 'Primary DB unreachable since 09:14.',
]);`,
    output: `POST #1 (empty title, critical with a thin description)
error[title]: Title field is required.
error[description]: Critical incidents need a real description.
=> form re-rendered with errors, submitForm() never runs

POST #2 (valid)
messenger: Incident "DB outage" logged.
=> redirect to route: incident_tracker.list
`,
  },

  keyPoints: [
    "FormBase forms supply four methods — getFormId(), buildForm(), validateForm(), submitForm() — and FormBuilder owns the lifecycle that Symfony's controller drives by hand.",
    "The route uses defaults._form pointing at the class (no _controller key, no controller class of yours — a route enhancer swaps in core's HtmlFormController); one route handles both GET render and POST submit.",
    "buildForm() returns render-array elements: '#type' => 'textfield'/'select'/'textarea'/'details'/'submit' with #title, #required, #default_value, #options.",
    "There is no data_class: submitted values are plain arrays read via $form_state->getValue('name') / getValues(), and mapping them to storage is submitForm()'s job.",
    "validateForm() attaches errors with $form_state->setErrorByName('element', $this->t(...)); any error blocks submit and re-renders the form with inline messages.",
    "Finish submits with $this->messenger()->addStatus() (the flash bag) and $form_state->setRedirect('route.name'); #states gives declarative conditional visibility with no custom JS.",
  ],

  interview: [
    {
      q: "Walk me through the lifecycle of a Drupal form built on FormBase, and contrast it with a Symfony FormType.",
      a: "In Symfony the controller drives everything: \`createForm()\`, \`handleRequest()\`, \`isSubmitted() && isValid()\`, persist, redirect. In Drupal you write no controller — the route's \`_form\` default points at the class, a route enhancer swaps it for core's generic \`HtmlFormController\` (\`controller.form:getContentResult\`), which resolves your form class and hands it to \`FormBuilder\`. \`FormBuilder\` then calls your methods in order: \`buildForm()\` to get the element array, then on POST it enforces \`#required\`, calls \`validateForm()\`, and only if no errors were set calls \`submitForm()\`. On validation failure it automatically re-renders the form with inline errors, which is the part you'd otherwise write by hand in the Symfony action. The trade: Symfony gives you typed, reusable field classes and object binding; Drupal gives you a declarative array any module can alter with \`hook_form_alter()\`.",
    },
    {
      q: "A Symfony developer asks: where's the data_class? How do you get the submitted data out of a Drupal form?",
      a: "There isn't one — plain Form API has no data binding at all. Submitted input comes out of \`FormStateInterface\` as arrays: \`$form_state->getValue('title')\` for a single element, \`$form_state->getValues()\` for everything. Whatever mapping Symfony's data_class does automatically, you do explicitly in \`submitForm()\`: build an entity, write to a table, save config. The exception is entity forms (\`EntityForm\` and friends), which do bind form input onto an entity object — but that's a different base class from \`FormBase\`.",
    },
    {
      q: "How do you report a validation error against a specific field in Drupal, and when does your validation code actually run?",
      a: "Implement \`validateForm(array &$form, FormStateInterface $form_state)\` and call \`$form_state->setErrorByName('description', $this->t('...'))\` — the first argument is the element's name, so the error message renders attached to that widget, like Symfony mapping a constraint violation onto a child form. FormBuilder enforces \`#required\` before your method runs, so you only write the business rules. If any error is set, all submit handlers are skipped and the form re-renders; \`submitForm()\` only ever runs on a fully valid submission.",
    },
    {
      q: "What does #states do, and what is its limitation?",
      a: "\`#states\` declares conditional client-side behavior on an element — visible/invisible, enabled/disabled, checked, required — keyed by a jQuery-ish selector and a condition, e.g. show the 'steps' textarea only when \`:input[name=\\\"severity\\\"]\` has the value \`critical\`. Core's \`drupal.states\` JS library implements it, so you get dynamic UX without writing any JavaScript. The limitation: it's purely client-side. A hidden element still submits its value and a \`#states\`-required flag isn't enforced server-side, so any rule that matters must also live in \`validateForm()\`.",
    },
  ],

  quiz: [
    {
      question: "How does a URL get wired to IncidentReportForm in incident_tracker.routing.yml?",
      options: [
        "defaults._controller points at IncidentReportForm::buildForm",
        "defaults._form points at the fully-qualified form class name",
        "A #[Route] attribute on the form class",
        "You must write a controller that calls \\Drupal::formBuilder()",
      ],
      answerIndex: 1,
      explain:
        "Form routes use defaults: { _form: '\\Drupal\\incident_tracker\\Form\\IncidentReportForm' } — no controller class of your own. A route enhancer rewrites _form into _controller: 'controller.form:getContentResult', so core's HtmlFormController + FormBuilder act as the generic controller, handling GET rendering and POST validate/submit on the same route. (Calling \\Drupal::formBuilder()->getForm() from a controller works but is unnecessary for a normal form page.)",
    },
    {
      question: "In submitForm(), how do you read what the user typed into the 'title' textfield?",
      options: [
        "$form['title']['#value'] — the element holds the submitted value",
        "$form->getData()->title, hydrated via data_class",
        "$form_state->getValue('title') — values are plain array entries",
        "$_POST['title'], since Drupal forms are raw HTML forms",
      ],
      answerIndex: 2,
      explain:
        "FormStateInterface carries the submitted values as arrays: getValue('title') for one element, getValues() for all. There is no data_class in plain Form API — unlike Symfony, no object is hydrated for you, and you never touch $_POST directly (FormBuilder has already processed and validated the request).",
    },
    {
      question: "What happens if validateForm() calls $form_state->setErrorByName() at least once?",
      options: [
        "An exception is thrown and the user sees a 500 page",
        "submitForm() still runs, but the messenger shows the errors afterwards",
        "Submit handlers are skipped and the form re-renders with the errors attached to their elements",
        "The user is redirected back to the form route with a flash message",
      ],
      answerIndex: 2,
      explain:
        "Any error registered during validation blocks all submit handlers. FormBuilder re-renders the same form with each error message displayed against the element named in setErrorByName() — the automatic version of the re-render branch you write yourself in a Symfony controller action.",
    },
    {
      question: "What does the #states property on the 'steps' textarea actually enforce?",
      options: [
        "Server-side visibility: Drupal strips the value unless severity is critical",
        "Client-side behavior only: core JS toggles visibility, but server rules still belong in validateForm()",
        "A validation constraint equivalent to Symfony's Assert\\Expression",
        "An access check equivalent to _permission on the route",
      ],
      answerIndex: 1,
      explain:
        "#states is rendered into data attributes that core's drupal.states JavaScript library reads to show/hide (or enable/disable, etc.) the element in the browser. It's pure UX — the element's value still submits and nothing is enforced server-side, so real business rules must be duplicated in validateForm().",
    },
  ],
};

export default lesson;
