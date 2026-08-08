import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "form-api-vs-symfony-forms",
  title: "Form API vs the Symfony Form Component",
  part: "Extending Drupal",
  estMinutes: 12,
  summary:
    "In Symfony a form is a FormType that builds field objects and binds to a data class; in Drupal a form is a class whose buildForm() returns a render array of #type elements, with all state flowing through a FormStateInterface and no data-object binding by default.",

  concept: `
In Symfony a form is an object graph. You write a \`FormType\`, call
\`\$builder->add('email', EmailType::class)\`, optionally bind it to a data class
via \`configureOptions()\`, then in the controller \`\$form->handleRequest(\$request)\`
and \`\$form->isSubmitted() && \$form->isValid()\`. Validation lives in constraints
(attributes on the DTO or a \`validation.yaml\`), and \`\$form->getData()\` hands you a
populated object.

Drupal's Form API predates that model and is **array-first**. A form is a class
implementing \`FormInterface\` — almost always by extending \`FormBase\` (or
\`ConfigFormBase\` for settings pages). It has four moving parts:

- \`getFormId()\` returns a unique machine string. There is no route-derived id;
  you name it.
- \`buildForm(array \$form, FormStateInterface \$form_state)\` returns a **render
  array** — a nested associative array of \`#type\` elements. \`textfield\`,
  \`email\`, \`select\`, \`textarea\`, \`checkbox\`, \`submit\` are element plugin ids,
  the rough analogue of Symfony's \`*Type\` classes, but you express them as array
  keys, not objects.
- \`validateForm(array &\$form, FormStateInterface \$form_state)\` runs after the
  values are collected; you call \`\$form_state->setErrorByName('email', ...)\` to
  flag problems.
- \`submitForm(array &\$form, FormStateInterface \$form_state)\` runs only when
  validation passed.

### FormStateInterface replaces the form object

Symfony threads submitted data through the form object and a bound entity/DTO.
Drupal threads **everything** through \`\$form_state\`. Submitted values are read
with \`\$form_state->getValue('email')\`; there is no data-class binding by default,
so a plain contact form just pulls scalars out of the state. (Content *entity*
forms are a separate subclass, \`ContentEntityForm\`, that does bind to an entity —
that is the exception, not the rule.)

### Wiring, rendering, and security

You never \`new\` a form. A controller returns
\`\$this->formBuilder()->getForm(MyForm::class)\`, or a route points straight at the
form class with \`_form: '\\\\Drupal\\\\my_module\\\\Form\\\\ContactForm'\`. The theme
layer renders the render array to HTML — you don't write the \`<form>\` markup, much
like Symfony's form themes but driven by the array structure.

Two things come **for free**, matching Symfony's built-ins: every Form-API form
carries a CSRF token automatically (no \`csrf_protection\` config needed), and text
values are sanitized on output by Twig auto-escaping. To show a "message saved"
notice after submit, you inject the \`messenger\` service and call
\`\$this->messenger()->addStatus(...)\` — the equivalent of a Symfony flash.

### The mental shift

Stop thinking "a form is an object I bind to a DTO". Think "a form is a
declarative array I return, and Drupal walks it to render, collect, validate, and
submit — with \`\$form_state\` as the single source of truth."
`,

  comparisons: [
    {
      label: "Defining the form",
      intro:
        "A simple contact form (name, email, message). In Symfony you build field objects onto a builder; in Drupal you return a render array of #type elements from buildForm().",
      php: `<?php
// src/Form/ContactType.php (Symfony)
namespace App\\Form;

use Symfony\\Component\\Form\\AbstractType;
use Symfony\\Component\\Form\\FormBuilderInterface;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\{
    TextType, EmailType, TextareaType, SubmitType
};

class ContactType extends AbstractType
{
    public function buildForm(FormBuilderInterface \$builder, array \$options): void
    {
        \$builder
            ->add('name', TextType::class)
            ->add('email', EmailType::class)
            ->add('message', TextareaType::class)
            ->add('send', SubmitType::class);
    }
}`,
      ts: `<?php
// src/Form/ContactForm.php (Drupal)
namespace Drupal\\my_module\\Form;

use Drupal\\Core\\Form\\FormBase;
use Drupal\\Core\\Form\\FormStateInterface;

class ContactForm extends FormBase {

  public function getFormId(): string {
    return 'my_module_contact';
  }

  public function buildForm(array \$form, FormStateInterface \$form_state): array {
    \$form['name'] = ['#type' => 'textfield', '#title' => \$this->t('Name')];
    \$form['email'] = ['#type' => 'email', '#title' => \$this->t('Email')];
    \$form['message'] = ['#type' => 'textarea', '#title' => \$this->t('Message')];
    \$form['send'] = ['#type' => 'submit', '#value' => \$this->t('Send')];
    return \$form;
  }
  // validateForm() + submitForm() below.
}`,
      note:
        "Symfony field objects become Drupal render-array keys. #type ids (textfield, email, textarea, submit) are the analogue of the *Type classes.",
    },
    {
      label: "Validation",
      intro:
        "Reject a message under 10 characters. Symfony leans on constraints declared on the data class; Drupal validates imperatively inside validateForm() by setting errors on the form state.",
      php: `<?php
// Constraints on the bound DTO (Symfony)
namespace App\\Dto;

use Symfony\\Component\\Validator\\Constraints as Assert;

class ContactDto
{
    #[Assert\\NotBlank]
    public string \$name = '';

    #[Assert\\Email]
    public string \$email = '';

    #[Assert\\Length(min: 10)]
    public string \$message = '';
}
// Controller: if (\$form->isSubmitted() && \$form->isValid()) { ... }`,
      ts: `<?php
// Imperative validation on the form state (Drupal)
public function validateForm(
  array &\$form,
  FormStateInterface \$form_state,
): void {
  if (mb_strlen(\$form_state->getValue('message')) < 10) {
    \$form_state->setErrorByName(
      'message',
      \$this->t('Message must be at least 10 characters.'),
    );
  }
}`,
      note:
        "No constraint attributes and no data class by default: you read values from \$form_state and call setErrorByName(). submitForm() only runs if no errors were set.",
    },
    {
      label: "Handling the submit",
      intro:
        "On success, do the work and show a confirmation. Symfony reads getData() off the form and adds a flash; Drupal reads values off the form state and uses the messenger service.",
      php: `<?php
// Controller action (Symfony)
public function contact(Request \$request): Response
{
    \$dto  = new ContactDto();
    \$form = \$this->createForm(ContactType::class, \$dto);
    \$form->handleRequest(\$request);

    if (\$form->isSubmitted() && \$form->isValid()) {
        \$this->mailer->sendContact(\$dto);      // \$dto is populated
        \$this->addFlash('success', 'Thanks!');
        return \$this->redirectToRoute('home');
    }
    return \$this->render('contact.html.twig', ['form' => \$form]);
}`,
      ts: `<?php
// submitForm() on the form class (Drupal)
public function submitForm(
  array &\$form,
  FormStateInterface \$form_state,
): void {
  \$email = \$form_state->getValue('email');
  \$message = \$form_state->getValue('message');
  // ... send the mail via an injected service ...

  \$this->messenger()->addStatus(\$this->t('Thanks!'));
  \$form_state->setRedirect('<front>');
}`,
      note:
        "getData() -> \$form_state->getValue(); addFlash() -> messenger()->addStatus(); redirectToRoute() -> \$form_state->setRedirect(). The form class owns submit, not a controller.",
    },
    {
      label: "Wiring the form to a URL",
      intro:
        "Symfony routes to a controller that builds the form. Drupal can route straight at the form class with the _form default — the form builder instantiates and processes it for you.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/routes.yaml (Symfony)
contact:
  path: /contact
  controller: App\\Controller\\ContactController::contact
  methods: [GET, POST]
# The controller calls \$this->createForm(ContactType::class, ...).`,
      ts: `# my_module.routing.yml (Drupal)
my_module.contact:
  path: '/contact'
  defaults:
    _form: '\\Drupal\\my_module\\Form\\ContactForm'
    _title: 'Contact us'
  requirements:
    _permission: 'access content'
# No controller needed: _form points at the class; the
# form builder handles GET render + POST validate/submit.`,
      note:
        "_form replaces a controller for form pages. GET and POST are both handled by the form builder; _permission gates access the way a Symfony security voter / access_control rule would.",
    },
  ],

  playground: {
    intro:
      "This models Drupal's form lifecycle in plain PHP: buildForm() returns a render array, the 'form builder' collects submitted values into a form_state, then validateForm() and (only if clean) submitForm() run. No Drupal bootstrap — just the mechanism.",
    lang: "php",
    code: `<?php
// A tiny stand-in for Drupal's Form API lifecycle.

// buildForm(): return a render array of #type elements.
function buildForm(): array {
  return [
    'name'    => ['#type' => 'textfield', '#title' => 'Name'],
    'email'   => ['#type' => 'email',     '#title' => 'Email'],
    'message' => ['#type' => 'textarea',  '#title' => 'Message'],
    'send'    => ['#type' => 'submit',    '#value' => 'Send'],
  ];
}

// FormState: the single source of truth for values + errors.
class FormState {
  private array \$values;
  private array \$errors = [];
  public function __construct(array \$values) { \$this->values = \$values; }
  public function getValue(string \$k): string { return \$this->values[\$k] ?? ''; }
  public function setErrorByName(string \$k, string \$m): void { \$this->errors[\$k] = \$m; }
  public function getErrors(): array { return \$this->errors; }
}

function validateForm(FormState \$s): void {
  if (mb_strlen(\$s->getValue('message')) < 10) {
    \$s->setErrorByName('message', 'Message must be at least 10 characters.');
  }
}

function submitForm(FormState \$s): void {
  echo "SUBMIT: mailing {\$s->getValue('email')}\\n";
  echo "STATUS: Thanks!\\n";
}

// The form builder walks the array, then runs the lifecycle.
\$form = buildForm();
echo "Render array elements: " . implode(', ', array_keys(\$form)) . "\\n";

\$state = new FormState(['name' => 'Ada', 'email' => 'ada@x.io', 'message' => 'Hi']);
validateForm(\$state);

if (\$state->getErrors()) {
  foreach (\$state->getErrors() as \$field => \$msg) {
    echo "ERROR on {\$field}: {\$msg}\\n";
  }
} else {
  submitForm(\$state);
}`,
    output: `Render array elements: name, email, message, send
ERROR on message: Message must be at least 10 characters.`,
  },

  keyPoints: [
    "A Drupal form is a class extending \`FormBase\` with \`getFormId()\`, \`buildForm()\`, \`validateForm()\`, and \`submitForm()\` — not a Symfony \`FormType\` bound to a data class.",
    "\`buildForm()\` returns a **render array** of \`#type\` elements (textfield, email, select, textarea, submit); those \`#type\` ids are the analogue of Symfony's \`*Type\` classes.",
    "All state flows through \`FormStateInterface\`: read submitted values with \`\$form_state->getValue()\`, flag problems with \`setErrorByName()\`, redirect with \`setRedirect()\`.",
    "There is **no data-class binding** by default — a plain form pulls scalars from the form state; only entity forms (\`ContentEntityForm\`) bind to an object.",
    "Validation is imperative inside \`validateForm()\`, not declarative constraint attributes; \`submitForm()\` runs only when no errors were set.",
    "Route a form directly with the \`_form\` default (no controller); CSRF protection and output escaping are automatic, and \`messenger()->addStatus()\` is the flash-message equivalent.",
  ],

  interview: [
    {
      q: "How does Drupal's Form API differ structurally from a Symfony FormType?",
      a: "A Symfony form is an object: a \`FormType\` builds field objects on a \`FormBuilderInterface\` and typically binds to a data class, and the controller drives \`handleRequest\`/\`isValid\`. A Drupal form is a class implementing \`FormInterface\` (usually via \`FormBase\`) whose \`buildForm()\` returns a **render array** of \`#type\` elements, and it owns its own \`validateForm()\` and \`submitForm()\` methods. There is no bound DTO by default — data is read from \`\$form_state\` as scalars. So the biggest shift is array-first and state-first instead of object-first.",
    },
    {
      q: "Where does submitted data live in a Drupal form, and how do you read it?",
      a: "It lives in the \`FormStateInterface\` object passed to every lifecycle method. You read a field with \`\$form_state->getValue('email')\` and the whole set with \`getValues()\`. This replaces Symfony's \`\$form->getData()\` returning a populated object — Drupal does not bind to a data class for ordinary forms, so you deal in the raw values keyed by element name. Redirects, rebuild flags, and stored temporary values also live on the form state.",
    },
    {
      q: "How is validation done differently, and does Drupal give you CSRF protection like Symfony?",
      a: "Drupal validation is imperative: in \`validateForm()\` you inspect \`\$form_state\` and call \`\$form_state->setErrorByName('field', \$this->t('...'))\` for anything invalid, and \`submitForm()\` only fires if no errors were set. That contrasts with Symfony's declarative constraints (\`#[Assert\\...]\`) on the data class. As for CSRF: yes — every Form-API form automatically includes and validates a CSRF token, so you don't configure \`csrf_protection\` the way you might in Symfony; it is on by default.",
    },
  ],

  quiz: [
    {
      question: "What does a Drupal form's buildForm() method return?",
      options: [
        "A configured FormBuilderInterface object",
        "A Response object with rendered HTML",
        "A render array of #type elements",
        "A bound data-transfer object",
      ],
      answerIndex: 2,
      explain:
        "buildForm() returns a nested associative render array; each element declares a #type (textfield, email, submit, ...). The theme layer renders it to HTML — you don't return a Response or write the markup yourself.",
    },
    {
      question:
        "In a plain (non-entity) Drupal form, how do you read the value a user submitted for the 'email' field?",
      options: [
        "$form->getData()->getEmail()",
        "$form_state->getValue('email')",
        "$request->request->get('email')",
        "$this->get('email')",
      ],
      answerIndex: 1,
      explain:
        "All submitted data flows through the FormStateInterface. You read a single field with $form_state->getValue('email'); there is no bound data object for a plain form, unlike Symfony's $form->getData().",
    },
    {
      question:
        "How do you make an invalid field block submission in Drupal's Form API?",
      options: [
        "Add a #[Assert\\NotBlank] attribute to the element",
        "Throw a ValidationException from buildForm()",
        "Call $form_state->setErrorByName('field', $message) in validateForm()",
        "Return false from submitForm()",
      ],
      answerIndex: 2,
      explain:
        "Validation is imperative: in validateForm() you call $form_state->setErrorByName(). If any error is set, submitForm() does not run. Constraint attributes on a DTO are the Symfony approach, not Drupal's.",
    },
  ],
};

export default lesson;
