import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "form-state-deep",
  title: "FormStateInterface in Depth: Values, Storage & Rebuild",
  part: "Form API in Depth",
  estMinutes: 13,
  summary:
    "FormState is the mutable object FormBuilder threads through build/validate/submit and — unlike a Symfony Form — persists in the form cache, which is what makes setRebuild(TRUE), multi-step wizards and #ajax possible at all.",

  concept: `
## The object Symfony does not have

A Symfony \`Form\` is born in the controller, hydrated by \`handleRequest()\`,
read once, and garbage-collected. Nothing survives the response. Drupal's
\`FormStateInterface\` is the same idea plus a lifetime: FormBuilder can
serialise it into the **form cache** (the \`form_state\` key-value-expirable
collection, keyed by the hidden \`form_build_id\` in the markup, six hours by
default) and hand the very same object back to \`buildForm()\` on the next POST.
Wizards, AJAX and confirm-forms are all just that one capability being used.

### Three ways to read input

- \`getValue('severity')\` / \`getValues()\` — the processed values, after
  \`#element_validate\`, value callbacks and type coercion. This is what you use
  in \`submitForm()\`. Both return **by reference**, so
  \`$values = &$form_state->getValues()\` is legal and mutating it mutates the
  state.
- \`setValue('severity', 'high')\` / \`setValues([...])\` — write back, typically
  from \`validateForm()\` when you normalise input (trim an ID, resolve an
  autocomplete string to an entity ID) so \`submitForm()\` sees clean data.
- \`getUserInput()\` — the **raw** submitted array, straight from the request,
  unvalidated and untrusted. Reach for it only when you genuinely need what the
  browser sent, most often during a rebuild.

### Your own bag: get() / set()

\`$form_state->set('incident_draft', $data)\` and \`get('incident_draft')\` write
into \`$storage\` — arbitrary data that is **not** form values and travels with
the cached state. It takes a nested path too:
\`set(['wizard', 'step'], 2)\`. Anything you put there must be serialisable:
store an entity ID, never a service. \`getStorage()\`/\`setStorage()\` expose the
whole array.

### setRebuild(TRUE): stay on the form

Call it in a submit handler and FormBuilder skips the redirect, re-enters
\`buildForm()\` with the same \`$form_state\`, and caches the result. That is the
wizard engine: keep a step counter in storage, branch on it in \`buildForm()\`,
and bump it in the submit handler. The classic trap — on a rebuild, changing an
element's \`#default_value\` appears to do nothing, because user input wins over
defaults. Clear the key first:

\`\`\`php
$input = $form_state->getUserInput();
unset($input['severity']);
$form_state->setUserInput($input);
\`\`\`

### Which button fired?

\`getTriggeringElement()\` returns the render array of the element that submitted
the form — indispensable once a form has Next / Back / Add another / Delete.
Branch on \`$trigger['#name']\` or \`end($trigger['#parents'])\`. Pair it with
per-button \`#submit\` callbacks and \`#limit_validation_errors\` so a Back button
does not trip validation on fields the user has not reached.

### Cache and lifecycle flags

\`setCached(TRUE)\` forces persistence even without a rebuild — it throws a
\`LogicException\` on GET forms, since caching a safe request is a side effect.
\`disableCache()\` opts out. \`isSubmitted()\`, \`isValidationComplete()\`,
\`isExecuted()\` and \`isRebuilding()\` let shared code tell where in the lifecycle
it is. \`isProgrammed()\` is TRUE when the form was submitted from PHP via
\`FormBuilder::submitForm()\` rather than the browser — the Drupal equivalent of
Symfony's \`$form->submit($data)\`, useful in tests and migrations. Behaviour is
identical across Drupal 10 and 11.
`,

  comparisons: [
    {
      label: "Carrying a multi-step form between requests",
      intro:
        "A three-step incident wizard. Symfony has to park the partial data somewhere itself (session, or a flow bundle); Drupal parks it in FormState and re-enters buildForm.",
      php: `<?php
// Symfony: the Form object dies with the request, so YOU own the state.
#[Route('/incident/report/{step}', name: 'incident_report')]
public function report(Request $request, int $step = 1): Response
{
    $session = $request->getSession();
    $draft = $session->get('incident_draft', []);

    $form = $this->createForm(self::STEPS[$step], $draft);
    $form->handleRequest($request);

    if ($form->isSubmitted() && $form->isValid()) {
        $draft = array_merge($draft, $form->getData());
        $session->set('incident_draft', $draft);

        if ($step < 3) {
            // A real redirect per step: new request, new Form object.
            return $this->redirectToRoute('incident_report', ['step' => $step + 1]);
        }
        $session->remove('incident_draft');
        return $this->redirectToRoute('incident_list');
    }

    return $this->render('incident/report.html.twig', [
        'form' => $form->createView(),
    ]);
}`,
      ts: `<?php
// Drupal: one route, one form class. FormState IS the session.
namespace Drupal\\incident_tracker\\Form;

use Drupal\\Core\\Form\\FormBase;
use Drupal\\Core\\Form\\FormStateInterface;

class IncidentWizardForm extends FormBase {

  public function getFormId() {
    return 'incident_tracker_wizard';
  }

  public function buildForm(array $form, FormStateInterface $form_state) {
    // Step and draft both live in FormState storage, not in the URL and not
    // in the values array — they are yours, and they survive every rebuild.
    $step = $form_state->get('step') ?? 1;
    $data = $form_state->get('data') ?? [];

    if ($step === 1) {
      $form['title'] = [
        '#type' => 'textfield',
        '#title' => $this->t('Title'),
        '#required' => TRUE,
        '#default_value' => $data['title'] ?? '',
      ];
      $form['severity'] = [
        '#type' => 'select',
        '#title' => $this->t('Severity'),
        '#options' => [
          'low' => $this->t('Low'),
          'high' => $this->t('High'),
          'critical' => $this->t('Critical'),
        ],
        '#default_value' => $data['severity'] ?? 'low',
      ];
    }
    elseif ($step === 2) {
      $form['impact'] = [
        '#type' => 'textarea',
        '#title' => $this->t('Customer impact'),
        '#required' => TRUE,
        '#default_value' => $data['impact'] ?? '',
      ];
    }
    else {
      // Nothing new to collect: just play back what storage accumulated.
      $form['review'] = [
        '#theme' => 'item_list',
        '#items' => array_map(
          fn ($k, $v) => $k . ': ' . $v,
          array_keys($data),
          $data,
        ),
      ];
    }

    $form['actions']['#type'] = 'actions';
    $form['actions']['submit'] = [
      '#type' => 'submit',
      '#value' => $step < 3 ? $this->t('Next') : $this->t('File incident'),
    ];
    return $form;
  }

  public function submitForm(array &$form, FormStateInterface $form_state) {
    $step = $form_state->get('step') ?? 1;
    // Merge this step's values into the arbitrary storage bag. cleanValues()
    // strips the internals first — form_build_id, form_token, op — so the
    // draft holds only real fields.
    $form_state->set('data', array_merge(
      $form_state->get('data') ?? [],
      $form_state->cleanValues()->getValues()
    ));

    if ($step < 3) {
      $form_state->set('step', $step + 1);
      // Do not redirect: re-enter buildForm() with this same FormState,
      // and cache it so the next POST finds it again.
      $form_state->setRebuild(TRUE);
      return;
    }

    $this->messenger()->addStatus($this->t('Incident filed.'));
    $form_state->setRedirect('incident_tracker.list');
  }

}`,
      note: "No session juggling and no per-step route: setRebuild(TRUE) tells FormBuilder to skip the redirect, re-run buildForm() with the live FormState, and write it to the form cache under a fresh form_build_id.",
    },
    {
      label: "Which button was pressed",
      intro:
        "The form has Back, Next and 'Add affected system'. Both frameworks can tell you which button submitted — but only Drupal lets that button also scope validation.",
      php: `<?php
// Symfony: named submit buttons, then ask the form which one was clicked.
$form = $this->createFormBuilder($draft)
    ->add('severity', ChoiceType::class, ['choices' => $choices])
    ->add('back', SubmitType::class, [
        'label' => 'Back',
        // Skip validation entirely for this button.
        'validation_groups' => false,
    ])
    ->add('next', SubmitType::class, ['label' => 'Next'])
    ->getForm();

$form->handleRequest($request);

if ($form->isSubmitted()) {
    $clicked = $form->getClickedButton()?->getName(); // 'back' | 'next'
    if ($clicked === 'back') {
        return $this->redirectToRoute('incident_report', ['step' => $step - 1]);
    }
}

// Note: validation_groups => false is all-or-nothing. Scoping validation to a
// SUBSET of fields means custom groups on every constraint.`,
      ts: `<?php
// Drupal: buttons carry their own #submit, and can narrow validation.
public function buildForm(array $form, FormStateInterface $form_state) {
  // ... elements ...
  $form['actions']['back'] = [
    '#type' => 'submit',
    '#value' => $this->t('Back'),
    '#submit' => ['::stepBack'],
    // Validate nothing at all: [] means "no element trees".
    '#limit_validation_errors' => [],
  ];
  $form['actions']['add_system'] = [
    '#type' => 'submit',
    '#value' => $this->t('Add affected system'),
    '#submit' => ['::addSystem'],
    // Only validate this subtree, so empty later fields do not block it.
    '#limit_validation_errors' => [['systems']],
  ];
  $form['actions']['next'] = ['#type' => 'submit', '#value' => $this->t('Next')];
  return $form;
}

public function stepBack(array &$form, FormStateInterface $form_state) {
  $form_state->set('step', $form_state->get('step') - 1);
  $form_state->setRebuild(TRUE);
}

// A shared handler that has to work out its own context:
public function submitForm(array &$form, FormStateInterface $form_state) {
  $trigger = $form_state->getTriggeringElement();

  // Two reliable identifiers on the triggering element:
  //   $trigger['#name']            -> 'op' for a plain submit, or the button name
  //   end($trigger['#parents'])    -> the element key, e.g. 'next'
  if (end($trigger['#parents']) === 'next') {
    $form_state->set('step', ($form_state->get('step') ?? 1) + 1);
    $form_state->setRebuild(TRUE);
  }
}`,
      note: "getTriggeringElement() returns the whole render array of the clicked button (or the #ajax-triggering element), so #parents, #name and any custom key you added are all available. #limit_validation_errors is the piece Symfony has no direct answer for.",
    },
    {
      label: "Processed values vs raw user input",
      intro:
        "Why the same data has two accessors, and the rebuild gotcha every Drupal developer hits once: changing #default_value on a rebuild seems to do nothing.",
      php: `<?php
// Symfony keeps the two worlds clearly separated.
// Raw request payload:
$raw = $request->request->all('incident');   // ['severity' => 'critical', ...]

// Normalised, type-mapped object graph:
$incident = $form->getData();                // App\\Dto\\IncidentDraft

// Mutating between the two is an event listener, not an accessor:
$builder->addEventListener(FormEvents::PRE_SUBMIT, function (PreSubmitEvent $e) {
    $data = $e->getData();
    $data['reference'] = strtoupper(trim($data['reference'] ?? ''));
    $e->setData($data);
});

// Re-rendering after a submit builds a NEW Form from the data you pass it,
// so changing the underlying value simply shows up. No caching involved.`,
      ts: `<?php
// Drupal exposes both on the one FormState object.
public function validateForm(array &$form, FormStateInterface $form_state) {
  // Processed values — what submitForm() will see.
  $ref = $form_state->getValue('reference');
  // Normalise once, here, so every submit handler gets clean data.
  $form_state->setValue('reference', strtoupper(trim($ref)));

  // Raw input, exactly as the browser posted it. Unvalidated: treat as tainted.
  $raw = $form_state->getUserInput();
  if (isset($raw['severity']) && $raw['severity'] === '_none') {
    $form_state->setErrorByName('severity', $this->t('Pick a severity.'));
  }
}

public function submitForm(array &$form, FormStateInterface $form_state) {
  // THE REBUILD GOTCHA: on a rebuilt form each element takes its #value from
  // user input, so this alone will NOT change what the select shows — it only
  // changes what later handlers read out of getValues():
  $form_state->setValue('severity', 'high');

  // To actually move the widget, write the new value INTO the raw input:
  $input = $form_state->getUserInput();
  $input['severity'] = 'high';
  $form_state->setUserInput($input);

  // The other variant of the trick is unset($input['severity']) — but that
  // does NOT surface the setValue() value. With the key gone the element
  // falls through to $element['#default_value'], i.e. whatever buildForm()
  // computes on the rebuild (typically from $form_state->get(...) storage).

  $form_state->setRebuild(TRUE);
}`,
      note: "getValues() is post-validation and safe; getUserInput() is the raw request array. On a rebuild FormBuilder derives each element's #value from user input first, so setValue() on its own never moves the widget: either write the value into getUserInput()/setUserInput(), or unset the key and let the element fall back to the #default_value buildForm() computes.",
    },
    {
      label: "Submitting a form from code",
      intro:
        "Firing a form without a browser — for a migration, a Drush command or a kernel test.",
      php: `<?php
// Symfony: build the form, hand it an array, ask if it validated.
$form = $this->formFactory->create(IncidentType::class, new IncidentDraft());
$form->submit([
    'title' => 'Payments API down',
    'severity' => 'critical',
]);

if (!$form->isValid()) {
    foreach ($form->getErrors(true) as $error) {
        $this->logger->error($error->getMessage());
    }
}
$draft = $form->getData();

// $form->isSubmitted() is now TRUE; there is no flag distinguishing a
// programmatic submit from a real POST.`,
      ts: `<?php
// Drupal: FormBuilder::submitForm() runs the full build/validate/submit cycle.
use Drupal\\Core\\Form\\FormState;
use Drupal\\incident_tracker\\Form\\IncidentReportForm;

$form_state = new FormState();
$form_state->setValues([
  'title' => 'Payments API down',
  'severity' => 'critical',
]);

// Accepts a class name or an instantiated form object — nothing else.
// FormBuilder::getFormId() only resolves a string that passes class_exists();
// a bare service ID throws InvalidArgumentException.
\\Drupal::formBuilder()->submitForm(IncidentReportForm::class, $form_state);

if ($errors = $form_state->getErrors()) {
  foreach ($errors as $name => $message) {
    \\Drupal::logger('incident_tracker')->error('@field: @msg', [
      '@field' => $name,
      '@msg' => (string) $message,
    ]);
  }
}

// Inside the form you can branch on how it was invoked:
//   $form_state->isProgrammed()  -> TRUE, set by submitForm()
//   $form_state->isSubmitted()   -> TRUE, programmed forms always submit
//   $form_state->isExecuted()    -> TRUE once submit handlers have run
// Access checks on #access are bypassed unless you call
//   $form_state->setProgrammedBypassAccessCheck(FALSE);`,
      note: "submitForm() copies your values into user input, marks the state programmed and submitted, then runs validation and submit handlers — redirects are ignored, so read the outcome from $form_state, not from a Response.",
    },
  ],

  playground: {
    intro:
      "A miniature FormState + FormBuilder driving a three-step wizard. Predict what storage holds after the Back button, and what the final redirect collects.",
    lang: "php",
    code: `<?php
// A miniature FormState + FormBuilder: what actually survives between the
// POSTs of a three-step incident wizard.

final class MiniFormState {
  public array $input = [];      // getUserInput(): raw, exactly as posted.
  public array $values = [];     // getValues(): processed by #element_validate.
  private array $storage = [];   // get()/set(): your arbitrary bag.
  private bool $rebuild = FALSE;
  private ?array $trigger = NULL;
  private ?string $redirect = NULL;

  public function getValue(string $k, $default = NULL) {
    return $this->values[$k] ?? $default;
  }
  public function get(string $p) { return $this->storage[$p] ?? NULL; }
  public function set(string $p, $v): void { $this->storage[$p] = $v; }
  public function getStorage(): array { return $this->storage; }
  public function setRebuild(bool $r = TRUE): void { $this->rebuild = $r; }
  public function isRebuilding(): bool { return $this->rebuild; }
  public function setTriggeringElement(array $e): void { $this->trigger = $e; }
  public function getTriggeringElement(): array { return $this->trigger; }
  public function setRedirect(string $route): void { $this->redirect = $route; }
  public function getRedirect(): ?string { return $this->redirect; }
}

// buildForm(): the step is read from storage, not from the request.
function build_form(MiniFormState $fs): array {
  $step = $fs->get('step') ?? 1;
  $fields = [1 => ['title'], 2 => ['severity', 'systems'], 3 => ['summary']];
  return ['#step' => $step, '#fields' => $fields[$step]];
}

// submitForm(): decide via the triggering element, then rebuild or redirect.
function submit_form(MiniFormState $fs): void {
  $step = $fs->get('step') ?? 1;
  $button = $fs->getTriggeringElement()['#name'];

  if ($button === 'back') {
    $fs->set('step', $step - 1);
    $fs->setRebuild();
    return;
  }
  // Real Drupal writes $form_state->cleanValues()->getValues() here, so
  // form_build_id / form_token / op never reach the draft.
  $fs->set('data', array_merge($fs->get('data') ?? [], $fs->values));
  if ($step < 3) {
    $fs->set('step', $step + 1);
    $fs->setRebuild();
    return;
  }
  $fs->setRedirect('incident_tracker.list');
}

// FormBuilder::processForm() in miniature.
function post(MiniFormState $fs, string $button, array $input): void {
  $fs->input = $input;
  // Validation copies raw input into values; here: trim + drop the buttons.
  $fs->values = array_map('trim', $input);
  $fs->setTriggeringElement(['#name' => $button, '#parents' => [$button]]);
  $fs->setRebuild(FALSE);

  submit_form($fs);

  echo rtrim("POST  button=" . $button . "  raw input keys: " . implode(',', array_keys($fs->input))) . "\\n";
  if ($fs->isRebuilding()) {
    $form = build_form($fs);
    echo "  rebuild -> buildForm() step " . $form['#step']
      . ", fields: " . implode(', ', $form['#fields']) . "\\n";
    echo "  form cached, storage = " . json_encode($fs->getStorage()) . "\\n";
  }
  else {
    echo "  no rebuild -> redirect to " . $fs->getRedirect() . "\\n";
    echo "  collected = " . json_encode($fs->get('data')) . "\\n";
  }
}

$fs = new MiniFormState();
$fs->set('step', 1);
echo "GET   step 1, fields: " . implode(', ', build_form($fs)['#fields']) . "\\n";

post($fs, 'next', ['title' => '  Payments API down ']);
post($fs, 'next', ['severity' => 'critical', 'systems' => 'checkout, invoicing']);
post($fs, 'back', []);
post($fs, 'next', ['severity' => 'high', 'systems' => 'checkout']);
post($fs, 'finish', ['summary' => 'Rolled back release 4.2.1.']);`,
    output: `GET   step 1, fields: title
POST  button=next  raw input keys: title
  rebuild -> buildForm() step 2, fields: severity, systems
  form cached, storage = {"step":2,"data":{"title":"Payments API down"}}
POST  button=next  raw input keys: severity,systems
  rebuild -> buildForm() step 3, fields: summary
  form cached, storage = {"step":3,"data":{"title":"Payments API down","severity":"critical","systems":"checkout, invoicing"}}
POST  button=back  raw input keys:
  rebuild -> buildForm() step 2, fields: severity, systems
  form cached, storage = {"step":2,"data":{"title":"Payments API down","severity":"critical","systems":"checkout, invoicing"}}
POST  button=next  raw input keys: severity,systems
  rebuild -> buildForm() step 3, fields: summary
  form cached, storage = {"step":3,"data":{"title":"Payments API down","severity":"high","systems":"checkout"}}
POST  button=finish  raw input keys: summary
  no rebuild -> redirect to incident_tracker.list
  collected = {"title":"Payments API down","severity":"high","systems":"checkout","summary":"Rolled back release 4.2.1."}
`,
  },

  keyPoints: [
    "FormState is the one object threaded through buildForm/validateForm/submitForm, and unlike a Symfony Form it can outlive the request in the form cache, keyed by the hidden form_build_id — that persistence is what wizards and #ajax are built on.",
    "getValues()/getValue() are the processed, post-validation values (returned by reference); getUserInput() is the raw request array — untrusted, and the thing that overrides #default_value when a form is rebuilt.",
    "set()/get() (backed by getStorage()/setStorage()) are your arbitrary, serialisable bag for wizard steps, draft entities and IDs — never store services or unserialisable objects there.",
    "setRebuild(TRUE) in a submit handler suppresses the redirect and re-enters buildForm() with the same FormState; setRedirect('route.name', [...]) / setRedirectUrl(Url) end the flow instead.",
    "getTriggeringElement() tells you which button submitted (branch on #name or end(#parents)); combine with per-button #submit and #limit_validation_errors so Back and Add-another buttons do not trip full validation.",
    "setCached(TRUE) forces state persistence (and throws a LogicException on GET forms), disableCache() opts out; isSubmitted(), isValidationComplete(), isExecuted(), isRebuilding() and isProgrammed() report where in the lifecycle you are — isProgrammed() being TRUE for FormBuilder::submitForm() calls from PHP.",
  ],

  interview: [
    {
      q: "A Symfony developer asks why Drupal needs FormStateInterface at all — isn't it just the Form object?",
      a: "They overlap on the read side, but the lifetime is the real difference. A Symfony `Form` is created per request, hydrated by `handleRequest()`, and discarded; carrying a multi-step flow means you store partial data yourself in the session or reach for a flow bundle. Drupal's `FormState` can be serialised into the form cache — the `form_state` key-value-expirable collection, keyed by the hidden `form_build_id` field in the rendered markup — and handed back to `buildForm()` on the next POST. That is why `setRebuild(TRUE)` can say \"do not redirect, re-enter buildForm with everything I know\", and why `#ajax` can replace a fragment of a form that the server still fully understands. It also carries things a Symfony `Form` never does: the triggering element, redirect intent, error state, and an arbitrary storage bag via `set()`/`get()`.",
    },
    {
      q: "Walk me through building a three-step wizard in a single Drupal form class.",
      a: "One route, one `FormBase` subclass. Keep the current step in FormState storage — `$form_state->get('step') ?? 1` — and branch on it in `buildForm()` so each step returns only its own elements. In `submitForm()`, merge `$form_state->cleanValues()->getValues()` into a draft you keep with `$form_state->set('data', ...)` — `cleanValues()` first strips the form internals, so `form_build_id`, `form_token` and `op` never leak into your stored draft — increment the step, and call `$form_state->setRebuild(TRUE)` instead of redirecting; FormBuilder then re-runs `buildForm()` with the same state and caches it under a fresh build ID. A Back button gets `'#submit' => ['::stepBack']` plus `'#limit_validation_errors' => []` so it does not validate fields the user has not filled in, and `getTriggeringElement()` lets a shared handler tell the buttons apart. Only the final step calls `$form_state->setRedirect('incident_tracker.list')`. Two caveats worth mentioning: everything in storage must be serialisable, and if you want an element to show a value different from what the user typed you must clear the key from `getUserInput()`, not just call `setValue()`.",
    },
    {
      q: "What is the difference between getValue() and getUserInput(), and when would you use the raw one?",
      a: "`getValue()`/`getValues()` return the processed values — after element value callbacks, `#element_validate` and any `setValue()` normalisation you did — and are what `submitForm()` should read. `getUserInput()` returns the raw submitted array straight off the request, unvalidated and unfiltered, so treat it as tainted; there are no guarantees about types or that the keys correspond to real elements. You legitimately need it in two places: inspecting exactly what a browser sent (for example distinguishing an empty string from a missing key on an AJAX partial submit), and fixing the rebuild gotcha, where user input takes precedence over `#default_value`, so you `unset()` the key from the input array and call `setUserInput()` before rebuilding. Symfony draws the same line between `$request->request->all()` and `$form->getData()`, except there you mutate between them in a `PRE_SUBMIT` listener rather than through accessors.",
    },
    {
      q: "How would you submit a Drupal form from code, and how does that differ from a browser POST?",
      a: "Create a `FormState`, call `setValues([...])` with the data, then pass the form class name or an instance of the form object to `\\Drupal::formBuilder()->submitForm(IncidentReportForm::class, $form_state)` — those are the only two values `FormBuilderInterface` documents, and a bare service ID throws an `InvalidArgumentException` because `getFormId()` refuses to hand arbitrary strings to the class resolver — inject `form_builder` properly rather than using the static in real code. FormBuilder copies your values into user input, marks the state programmed and submitted, and runs the full build/validate/submit cycle, so your `validateForm()` and `submitForm()` both fire. The differences: there is no HTTP response, so any `setRedirect()` is ignored and you read the outcome from `$form_state->getErrors()` and whatever the handler wrote; and programmed forms bypass `#access` checks by default unless you call `setProgrammedBypassAccessCheck(FALSE)`. Inside the form, `$form_state->isProgrammed()` lets you branch — skipping messenger output during a migration, for instance. Symfony's nearest equivalent is `$form->submit($data)`, but it has no programmed flag at all.",
    },
  ],

  quiz: [
    {
      question:
        "In submitForm() you call $form_state->setRebuild(TRUE) and set nothing else. What does FormBuilder do next?",
      options: [
        "Redirects back to the same route, so buildForm() runs against a fresh, empty FormState",
        "Skips the redirect, re-enters buildForm() with the same FormState, and caches it under a new form_build_id",
        "Throws a LogicException, because a submit handler must always set a redirect",
        "Re-runs validateForm() and submitForm() a second time with the same values",
      ],
      answerIndex: 1,
      explain:
        "setRebuild(TRUE) suppresses the redirect that normally ends a submission. FormBuilder calls buildForm() again with the live FormState — values, storage and errors intact — renders the result, and writes the state into the form cache under a fresh form_build_id so the next POST can pick it up. That single call is the whole mechanism behind multi-step wizards and most #ajax rebuilds.",
    },
    {
      question:
        "On a rebuilt form you call $form_state->setValue('severity', 'high'), but the select still shows the user's original 'critical'. Why?",
      options: [
        "setValue() only works inside validateForm(), never in a submit handler",
        "The select's #options no longer contain 'high' after the rebuild",
        "When rebuilding, FormBuilder populates elements from getUserInput() first, and raw input beats both #default_value and setValue()",
        "The form cache is stale; you need to call disableCache() before setting the value",
      ],
      answerIndex: 2,
      explain:
        "During a rebuild each element's #value is re-derived from FormState's user input, which still holds 'critical'. setValue() writes to the processed values array, not to that raw input, so the widget renders the old choice. The fix is to write the new value into the raw array — getUserInput(), $input['severity'] = 'high', setUserInput() — before rebuilding. Unsetting the key instead does not surface the setValue() value: with no input for the key the element falls back to whatever #default_value buildForm() computes.",
    },
    {
      question:
        "A wizard has Back, 'Add affected system' and Next buttons. What is the correct way for a shared submit handler to tell them apart?",
      options: [
        "Inspect $_POST['op'] for the button's translated label",
        "Compare $form_state->getValue('submit') against each button's #value",
        "Use $form_state->getTriggeringElement() and branch on #name or end(#parents)",
        "Give each button a different #weight and read $form_state->get('weight')",
      ],
      answerIndex: 2,
      explain:
        "getTriggeringElement() returns the full render array of the element that submitted the form, so #name, #parents and any custom key you added are available — and it works for #ajax-triggering elements too, not just submit buttons. Matching on the translated #value/op string is fragile and breaks under translation. In practice you also give each button its own '#submit' callback plus '#limit_validation_errors' so Back and Add-another do not trip validation on unreached fields.",
    },
    {
      question:
        "Which statement about the form cache and FormState persistence is correct in Drupal 10/11?",
      options: [
        "Every form is cached automatically, on GET and POST alike",
        "setCached(TRUE) throws a LogicException on a GET form, because persisting state during a safe request is a side effect",
        "FormState is stored in the PHP session, so it disappears when the user logs out",
        "disableCache() deletes the form_build_id field from the rendered markup",
      ],
      answerIndex: 1,
      explain:
        "FormState::setCached() refuses to run when the form's method is GET — caching state on a safe HTTP method is a side effect Drupal disallows. Storage is the 'form' and 'form_state' key-value-expirable collections (about six hours), keyed by form_build_id, not the session; anonymous users get cached state too. disableCache() simply opts a form out of that persistence.",
    },
  ],
};

export default lesson;
