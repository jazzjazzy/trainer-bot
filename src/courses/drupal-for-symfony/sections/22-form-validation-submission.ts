import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "form-validation-submission",
  title: "Validation & Submission Handlers",
  part: "Extending Drupal",
  estMinutes: 12,
  summary:
    "A Drupal form class bundles build, validate and submit into one object: validateForm() reads $form_state->getValue() and flags problems with setErrorByName(), submitForm() does the work — the equivalent of Symfony's isSubmitted()/isValid() plus a handler, with entity-level Validator constraints available on top.",

  concept: `
In Symfony a form is really three collaborators: a **FormType** (the shape), a
**data class** carrying \`#[Assert\\...]\` constraints, and a **controller**
that calls \`\$form->handleRequest(\$request)\` then branches on
\`\$form->isSubmitted() && \$form->isValid()\`. Validation lives on the model
via the Validator component; the "what happens on success" lives in the
controller.

Drupal folds all of that into **one class** implementing \`FormInterface\`
(usually via \`FormBase\`). The same object exposes three lifecycle methods the
form builder calls in order:

- \`buildForm(array \$form, FormStateInterface \$form_state)\` — returns the render
  array (covered in the previous section).
- \`validateForm(array &\$form, FormStateInterface \$form_state)\` — inspect
  submitted values, flag problems.
- \`submitForm(array &\$form, FormStateInterface \$form_state)\` — runs **only if
  validation produced no errors**; this is your success handler.

### Reading values and flagging errors

There is no bound data object. Submitted values live in **\`\$form_state\`**, and
you pull them by the key you gave the element in buildForm:

\`\`\`php
public function validateForm(array &\$form, FormStateInterface \$form_state) {
  \$email = \$form_state->getValue('email');
  if (!\\Drupal::service('email.validator')->isValid(\$email)) {
    \$form_state->setErrorByName('email', \$this->t('Enter a valid email.'));
  }
}
\`\`\`

\`setErrorByName('email', ...)\` is the equivalent of adding a constraint
violation to a specific field: it marks that element invalid (highlighted in the
UI), records the message, and — because there is now an error — **prevents
submitForm() from running**. \`setError(\$element, ...)\` is the same thing given
the element array instead of its name. That is the whole contract: no errors set
means submit proceeds.

\`\`\`php
public function submitForm(array &\$form, FormStateInterface \$form_state) {
  \$node = \\Drupal\\node\\Entity\\Node::create([
    'type' => 'article',
    'title' => \$form_state->getValue('title'),
  ]);
  \$node->save();
  \$this->messenger()->addStatus(\$this->t('Saved.'));
}
\`\`\`

### Constraints still exist — at the entity level

Per-field \`#required\`, \`#pattern\` and \`'#element_validate'\` callbacks handle
form-shaped rules. But Drupal also has a full **Symfony Validator** layer for
**Typed Data / entities**: base fields declare constraints
(\`->addConstraint('UniqueField')\`), custom constraints are \`#[Constraint]\`
plugins with a validator class, and you run them with
\`\$violations = \$entity->validate()\` returning an
\`EntityConstraintViolationListInterface\`. This is the direct analogue of
\`\$validator->validate(\$dto)\` in Symfony — the same component underneath.
Reusable business rules belong here; form-only rules belong in validateForm().

### AJAX handlers

An element can carry an \`'#ajax'\` array (\`callback\`, \`wrapper\`) whose callback
returns a render-array fragment or an \`AjaxResponse\`. It fires on that element's
default event without a full page submit — think Symfony UX / a controller
returning a Turbo/JSON fragment, but wired declaratively in the render array.
`,

  comparisons: [
    {
      label: "The whole lifecycle: three methods vs FormType + controller",
      intro:
        "Symfony splits shape, validation and success across a FormType, a constrained DTO and a controller. Drupal puts all three lifecycle hooks on one class; validateForm gates submitForm automatically.",
      php: `<?php
// Symfony 6.4/7 — constraints on the DTO, branch in the controller.
namespace App\\Dto;

use Symfony\\Component\\Validator\\Constraints as Assert;

final class Signup
{
    #[Assert\\NotBlank]
    #[Assert\\Email]
    public string $email = '';
}

// Controller
public function signup(Request $request): Response
{
    $dto = new Signup();
    $form = $this->createForm(SignupType::class, $dto);
    $form->handleRequest($request);

    if ($form->isSubmitted() && $form->isValid()) {
        // success handler lives here
        $this->em->persist(User::fromSignup($dto));
        $this->em->flush();
        return $this->redirectToRoute('done');
    }
    return $this->render('signup.html.twig', ['form' => $form]);
}`,
      ts: `<?php
// Drupal 10/11 — one FormBase class, three lifecycle methods.
namespace Drupal\\my_module\\Form;

use Drupal\\Core\\Form\\FormBase;
use Drupal\\Core\\Form\\FormStateInterface;

final class SignupForm extends FormBase {

  public function getFormId(): string {
    return 'my_module_signup';
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    $form['email'] = ['#type' => 'email', '#title' => $this->t('Email'), '#required' => TRUE];
    $form['actions']['submit'] = ['#type' => 'submit', '#value' => $this->t('Sign up')];
    return $form;
  }

  public function validateForm(array &$form, FormStateInterface $form_state): void {
    $email = $form_state->getValue('email');
    if (!\\Drupal::service('email.validator')->isValid($email)) {
      // Marks 'email' invalid AND blocks submitForm() from running.
      $form_state->setErrorByName('email', $this->t('Enter a valid email.'));
    }
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    // Runs only when validateForm() set no errors.
    $this->messenger()->addStatus($this->t('Signed up @e', ['@e' => $form_state->getValue('email')]));
  }
}`,
      note: "Symfony: isValid() is something YOU check, then YOU call the handler. Drupal: setting an error is what gates submit — submitForm() simply isn't called if any error was set, so there is no isValid() branch to write.",
    },
    {
      label: "Field-specific errors",
      intro:
        "Attaching a message to one field so the UI highlights it. Symfony adds a violation to a property path; Drupal names the form element.",
      php: `<?php
// Symfony — add a violation against a specific property path.
$builder->add('email')->addEventListener(
    FormEvents::POST_SUBMIT,
    function (FormEvent $event) {
        $form = $event->getForm();
        if (/* taken */ false) {
            $form->get('email')->addError(
                new FormError('That email is already registered.')
            );
        }
    }
);`,
      ts: `<?php
// Drupal — setErrorByName() targets the element key; setError() takes the element.
public function validateForm(array &$form, FormStateInterface $form_state): void {
  $email = $form_state->getValue('email');

  $exists = (bool) \\Drupal::entityQuery('user')
    ->accessCheck(FALSE)
    ->condition('mail', $email)
    ->count()
    ->execute();

  if ($exists) {
    // Equivalent: $form_state->setError($form['email'], $this->t('...'));
    $form_state->setErrorByName('email', $this->t('That email is already registered.'));
  }
}`,
      note: "setErrorByName('email', ...) both records the message and flags $form['email'] as invalid for theming. Any error set here means submitForm() is skipped this request.",
    },
    {
      label: "Entity-level constraints (the real Validator component)",
      intro:
        "Reusable, form-independent rules belong on the data, not the form. Both frameworks use the SAME Symfony Validator here — Drupal just runs it over Typed Data / entities.",
      php: `<?php
// Symfony — constraint on the class, validate the object anywhere.
use Symfony\\Component\\Validator\\Validator\\ValidatorInterface;

final class Product
{
    #[Assert\\NotBlank]
    #[Assert\\Length(min: 3)]
    public string $sku = '';
}

$violations = $validator->validate($product); // ConstraintViolationList
if (count($violations) > 0) {
    foreach ($violations as $v) {
        // $v->getPropertyPath(), $v->getMessage()
    }
}`,
      ts: `<?php
// Drupal — constraints on the field definition; validate the entity.
// In hook_entity_base_field_info() or a field's baseFieldDefinitions():
$fields['sku'] = \\Drupal\\Core\\Field\\BaseFieldDefinition::create('string')
  ->setLabel(t('SKU'))
  ->setRequired(TRUE)
  ->addConstraint('UniqueField')        // a #[Constraint] plugin
  ->addConstraint('Length', ['min' => 3]);

// Anywhere you hold the entity (e.g. inside submitForm or a service):
$violations = $product->validate();      // EntityConstraintViolationListInterface
if ($violations->count() > 0) {
  foreach ($violations as $v) {
    // $v->getPropertyPath(), $v->getMessage()
  }
}`,
      note: "Same Validator component underneath. Custom rules are #[Constraint] plugins (Constraint + ConstraintValidator classes, like Symfony) attached to Typed Data — reusable across forms, REST, migrations. validateForm() is for form-only concerns.",
    },
    {
      label: "AJAX without a full submit",
      intro:
        "Update part of the form in place. Symfony leans on a UX/Turbo controller returning a fragment; Drupal wires it declaratively via '#ajax' in the render array.",
      php: `<?php
// Symfony — a controller action returning an HTML fragment for Turbo/UX.
#[Route('/check-email', name: 'check_email')]
public function checkEmail(Request $request): Response
{
    $taken = $this->users->emailTaken($request->query->get('email'));
    return $this->render('_email_status.html.twig', ['taken' => $taken]);
    // JS (Turbo/Stimulus) swaps the fragment into the DOM.
}`,
      ts: `<?php
// Drupal — declarative #ajax on the element; callback returns a fragment.
public function buildForm(array $form, FormStateInterface $form_state): array {
  $form['email'] = [
    '#type' => 'email',
    '#title' => $this->t('Email'),
    '#ajax' => [
      'callback' => '::checkEmail',
      'wrapper' => 'email-status',
      // 'method' => 'replaceWith'  (was 'replace' before Drupal 10.3)
    ],
    '#suffix' => '<div id="email-status"></div>',
  ];
  return $form;
}

public function checkEmail(array &$form, FormStateInterface $form_state): array {
  // Return a render-array fragment (or an AjaxResponse) — no full page submit.
  return $form['email'];
}`,
      note: "'#ajax' fires on the element's default event and hits your callback, which returns a render fragment (or AjaxResponse). No controller route to declare — the render array IS the wiring.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "This models Drupal's form lifecycle in plain PHP: a $form_state holding values plus an error bag, a validateForm() that calls setErrorByName(), and a builder that runs submitForm() ONLY when the error bag is empty — exactly Drupal's gate. Predict the output for a bad email and a good one.",
    code: `<?php
// A tiny stand-in for FormStateInterface.
final class FormState {
  private array $values;
  private array $errors = [];
  public function __construct(array $values) { $this->values = $values; }
  public function getValue(string $key) { return $this->values[$key] ?? null; }
  public function setErrorByName(string $name, string $message): void {
    $this->errors[$name] = $message;   // record + flag element invalid
  }
  public function hasErrors(): bool { return $this->errors !== []; }
  public function getErrors(): array { return $this->errors; }
}

final class SignupForm {
  public function validateForm(FormState $form_state): void {
    $email = (string) $form_state->getValue('email');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
      $form_state->setErrorByName('email', 'Enter a valid email.');
    }
  }
  public function submitForm(FormState $form_state): void {
    echo "submitForm: saved " . $form_state->getValue('email') . "\\n";
  }
}

// The form builder: validate, then submit ONLY if no errors (Drupal's gate).
function processForm(SignupForm $form, FormState $form_state): void {
  $form->validateForm($form_state);
  if ($form_state->hasErrors()) {
    foreach ($form_state->getErrors() as $name => $msg) {
      echo "error on [{$name}]: {$msg}\\n";
    }
    echo "submitForm: SKIPPED (errors present)\\n";
    return;
  }
  $form->submitForm($form_state);
}

$form = new SignupForm();

echo "--- bad input ---\\n";
processForm($form, new FormState(['email' => 'not-an-email']));

echo "--- good input ---\\n";
processForm($form, new FormState(['email' => 'ada@example.com']));`,
    output: `--- bad input ---
error on [email]: Enter a valid email.
submitForm: SKIPPED (errors present)
--- good input ---
submitForm: saved ada@example.com`,
  },

  keyPoints: [
    "One Drupal form class implements FormInterface (via FormBase) and exposes buildForm(), validateForm() and submitForm() — the roles Symfony splits across a FormType, a constrained DTO and a controller.",
    "Submitted values live on $form_state, not a bound object: read them with $form_state->getValue('key') using the key you set in buildForm().",
    "validateForm() flags problems with $form_state->setErrorByName('field', $msg) (or setError($element, $msg)); setting any error automatically prevents submitForm() from running — there is no isValid() branch to write.",
    "submitForm() is the success handler and runs only when validation set no errors — the equivalent of Symfony's `if ($form->isSubmitted() && $form->isValid())` block.",
    "Reusable, form-independent rules belong as Typed Data / entity constraints (->addConstraint(), custom #[Constraint] plugins) validated with $entity->validate() — the same Symfony Validator component underneath.",
    "An element's '#ajax' array (callback + wrapper) updates part of the form without a full submit; the callback returns a render fragment or AjaxResponse (note 'method' => 'replace' became 'replaceWith' in Drupal 10.3).",
  ],

  interview: [
    {
      q: "In Symfony you check `$form->isValid()` and then call your success logic. Where does that split go in Drupal?",
      a: "Drupal moves both halves onto the form class as separate lifecycle methods that the form builder calls in order: `validateForm()` then `submitForm()`. You never call `isValid()` yourself — instead, validation communicates by *setting errors* via `$form_state->setErrorByName()`. If any error was set, the form builder skips `submitForm()` entirely; if none were set, `submitForm()` runs and is your success handler. So the Symfony `if ($form->isSubmitted() && $form->isValid()) { ... }` branch becomes: put the guard logic in `validateForm()` and the body in `submitForm()`, and let the framework gate between them.",
    },
    {
      q: "There are no `#[Assert]` attributes on a data class here. How do you do reusable, model-level validation in Drupal?",
      a: "Drupal ships the same Symfony Validator component, but it runs over **Typed Data** — fields and entities — rather than arbitrary DTOs. You attach constraints to a field definition with `->addConstraint('UniqueField')` (or in `baseFieldDefinitions()`), write custom rules as `#[Constraint]` plugins with a paired `ConstraintValidator` class exactly like Symfony, and validate with `$entity->validate()`, which returns an `EntityConstraintViolationListInterface`. That layer is reusable across forms, REST, JSON:API and migrations. `validateForm()` is reserved for form-only concerns like cross-field checks that don't make sense on the entity itself.",
    },
    {
      q: "How do you attach an error to one specific field so the UI highlights it, and what side effect does that have?",
      a: "Call `$form_state->setErrorByName('email', $this->t('...'))` inside `validateForm()`, passing the element key you used in `buildForm()`; `setError($form['email'], ...)` does the same given the element array. This records the message, marks that element invalid so it's themed as an error, and — crucially — because an error now exists, it prevents `submitForm()` from running on this request. It's the direct analogue of adding a `FormError`/constraint violation against a property path in Symfony, but with the added contract that any error automatically blocks submission.",
    },
    {
      q: "How does AJAX validation/behaviour in a Drupal form compare to how you'd do it in Symfony?",
      a: "In Symfony you'd typically expose a controller route that returns an HTML fragment or JSON, then let Stimulus/Turbo (or your own JS) swap it into the DOM. Drupal wires it declaratively: you add an `'#ajax'` array to the element with a `callback` and a `wrapper` id, and Drupal's built-in AJAX framework fires the callback on that element's default event, replacing the wrapper with whatever render fragment (or `AjaxResponse`) the callback returns. There's no separate route to declare — the render array is the wiring. One version note: the `#ajax` `method` value `'replace'` was renamed `'replaceWith'` as of Drupal 10.3.",
    },
  ],

  quiz: [
    {
      question:
        "In a Drupal form class, what causes submitForm() NOT to run?",
      options: [
        "Returning FALSE from validateForm()",
        "Any call to $form_state->setErrorByName() (or setError()) during validation",
        "Calling $form_state->setRebuild() in buildForm()",
        "Throwing an exception from getFormId()",
      ],
      answerIndex: 1,
      explain:
        "Validation communicates by setting errors on $form_state. If any error was set during validateForm(), the form builder treats the submission as invalid and skips submitForm(). validateForm() has no meaningful return value; setting an error is the signal.",
    },
    {
      question:
        "You need a 'SKU must be unique across all products' rule reusable by forms, JSON:API and migrations. Where does it belong?",
      options: [
        "In validateForm() of every form that edits a product",
        "As a Typed Data / entity constraint (e.g. a #[Constraint] plugin) validated via $entity->validate()",
        "As a #pattern regex on the form element",
        "In buildForm() using $form_state->set()",
      ],
      answerIndex: 1,
      explain:
        "Reusable, model-level rules belong on the data as entity/Typed Data constraints, run by the Symfony Validator via $entity->validate(). That makes the rule apply everywhere the entity is saved — forms, REST, JSON:API, migrations — instead of duplicating it in each validateForm().",
    },
    {
      question:
        "Where do submitted values come from inside validateForm() and submitForm()?",
      options: [
        "From a bound data object passed to the constructor",
        "From the global $_POST superglobal directly",
        "From $form_state, e.g. $form_state->getValue('email')",
        "From $this->request->request->get('email')",
      ],
      answerIndex: 2,
      explain:
        "Drupal forms aren't bound to a data object the way a Symfony FormType is. Processed, validated submitted values live on $form_state and are read by the element key with $form_state->getValue('email').",
    },
  ],
};

export default lesson;
