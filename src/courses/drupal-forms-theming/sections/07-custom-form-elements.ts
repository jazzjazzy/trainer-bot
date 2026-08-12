import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "custom-form-elements",
  title: "Custom Form Elements: FormElement & RenderElement Plugins",
  part: "Form API in Depth",
  estMinutes: 13,
  summary:
    "Package a reusable widget as a plugin in src/Element/ so '#type' => 'incident_severity' works in any form — getInfo() defaults, valueCallback(), a #process that builds children, and its own theme hook and template.",

  concept: `
You have been writing forms that assemble core's \`#type\`s by hand. The moment
the same three-element cluster appears in a second form, copy-paste starts. The
Drupal answer is the same as Symfony's: **make it a type of its own**. In
Symfony you write a \`FormType\` class; in Drupal you write a *render element
plugin* — a class in \`src/Element/\` that teaches the Render API a new
\`#type\`.

### The plugin

\`\`\`
incident_tracker/src/Element/IncidentSeverity.php
\`\`\`

Discovery is by directory + attribute, so there is no service, no tag, no YAML:

\`\`\`
#[FormElement('incident_severity')]
class IncidentSeverity extends FormElementBase { … }
\`\`\`

Two naming traps worth memorising for interviews. First, \`FormElement\` here is
the **attribute** \`Drupal\\Core\\Render\\Attribute\\FormElement\`, added in
Drupal 10.3 (on 10.0–10.2 use the \`@FormElement\` *annotation* in the docblock
instead). Second, that attribute collided by short name with the old base class
\`Drupal\\Core\\Render\\Element\\FormElement\`, which is exactly why Drupal 10.3
renamed the base classes to **\`FormElementBase\`** and **\`RenderElementBase\`**.
The old names still work in 10.3+/11 but are deprecated and go away in Drupal 12.

### FormElement vs RenderElement

\`RenderElementBase\` is for output-only types — \`container\`, \`html_tag\`,
\`link\`, your \`incident_badge\`. \`FormElementBase\` extends it and adds
\`#input => TRUE\` plus \`valueCallback()\`, meaning FormBuilder will collect
submitted input for it and put a value in \`$form_state\`. Choose the input base
only if the thing actually round-trips user data.

Do not guess from the name: core's \`table\` is \`#[FormElement('table')] class
Table extends FormElementBase\`, and \`Table::getInfo()\` sets \`'#input' =>
TRUE\` — because \`#tableselect\` puts real checkboxes in the first column, so
the table has to collect submitted values. Good interview detail.

### getInfo() is the element's defaults

\`getInfo()\` returns the array that \`element_info\` merges *underneath* every
usage — it is the union of the defaults, so anything the form author sets wins.
This is where you declare \`#input\`, \`#process\`, \`#element_validate\`,
\`#pre_render\`, \`#theme\`, \`#theme_wrappers\`, \`#tree\`, and any custom
property of your own (\`#require_ack_from\`). It is cached, so \`drush cr\` after
you change it.

### The order FormBuilder runs things

1. \`getInfo()\` defaults are unioned in.
2. \`handleInputElement()\` sets \`#name\` from \`#parents\`, then calls
   \`valueCallback(&$element, $input, $form_state)\` to turn raw input into
   \`#value\`. \`$input === FALSE\` means *nothing was submitted* — fall back to
   \`#default_value\`. Sanitise here: this is your only guard against forged POST
   keys.
3. \`#process\` callbacks run — with \`#value\` and \`#name\` already set — and
   build the child elements. That is why a composite element's children are
   created in \`processIncidentSeverity()\` and not in \`getInfo()\`.
4. On submit, \`#element_validate\` runs once on the composite, after the
   children validated. Use \`$form_state->setError($element['sla_ack'], …)\` and
   \`setValueForElement()\` to normalise what the parent form finally sees.

Element plugin classes satisfy \`RenderCallbackInterface\` through
\`ElementInterface\`, so their own methods are trusted callbacks — no
\`trustedCallbacks()\` boilerplate needed.

### Markup

Point \`#theme\` at a hook you register in \`hook_theme()\` with
\`'render element' => 'element'\`, add
\`templates/incident-severity.html.twig\`, and any theme — including
\`incident_theme\` — can override it. Now \`'#type' => 'incident_severity'\`
works anywhere: forms, blocks, even a bare render array.
`,

  comparisons: [
    {
      label: "The reusable widget class",
      intro:
        "Both sides package a severity level + an 'SLA acknowledged' checkbox as one reusable field with a configurable option. Symfony composes children on a builder and passes options through buildView(); Drupal declares defaults in getInfo() and builds children in a #process callback.",
      php: `<?php
// Symfony: src/Form/Type/IncidentSeverityType.php
namespace App\\Form\\Type;

use Symfony\\Component\\Form\\AbstractType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\CheckboxType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\ChoiceType;
use Symfony\\Component\\Form\\FormBuilderInterface;
use Symfony\\Component\\Form\\FormInterface;
use Symfony\\Component\\Form\\FormView;
use Symfony\\Component\\OptionsResolver\\OptionsResolver;

class IncidentSeverityType extends AbstractType
{
    // Children of a compound type.
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('level', ChoiceType::class, [
                'choices' => ['Low' => 'low', 'High' => 'high', 'Critical' => 'critical'],
            ])
            ->add('slaAck', CheckboxType::class, ['required' => false]);
    }

    // Extra variables for the Twig block.
    public function buildView(FormView $view, FormInterface $form, array $options): void
    {
        $view->vars['require_ack_from'] = $options['require_ack_from'];
        $view->vars['attr']['class'] = 'incident-severity';
    }

    // Declared defaults + option validation.
    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'compound' => true,
            'error_bubbling' => false,
            'require_ack_from' => 'critical',
        ]);
        $resolver->setAllowedTypes('require_ack_from', 'string');
    }

    // Names the Twig block: incident_severity_widget.
    public function getBlockPrefix(): string
    {
        return 'incident_severity';
    }
}`,
      ts: `<?php
// Drupal: incident_tracker/src/Element/IncidentSeverity.php
namespace Drupal\\incident_tracker\\Element;

use Drupal\\Core\\Form\\FormStateInterface;
use Drupal\\Core\\Render\\Attribute\\FormElement;
use Drupal\\Core\\Render\\Element\\FormElementBase;

/**
 * Provides a composite severity form element.
 *
 * @code
 * $form['severity'] = [
 *   '#type' => 'incident_severity',
 *   '#title' => $this->t('Severity'),
 *   '#default_value' => ['level' => 'high', 'sla_ack' => FALSE],
 * ];
 * @endcode
 */
#[FormElement('incident_severity')]
class IncidentSeverity extends FormElementBase {

  /**
   * Defaults merged UNDER every usage of '#type' => 'incident_severity'.
   */
  public function getInfo(): array {
    $class = static::class;
    return [
      // FormElementBase = an input. RenderElementBase would be output only.
      '#input' => TRUE,
      // Keep child values nested under the element's own key.
      '#tree' => TRUE,
      '#process' => [[$class, 'processIncidentSeverity']],
      '#element_validate' => [[$class, 'validateIncidentSeverity']],
      '#pre_render' => [[$class, 'preRenderIncidentSeverity']],
      '#theme' => 'incident_severity',
      '#theme_wrappers' => ['form_element'],
      '#default_value' => ['level' => 'low', 'sla_ack' => FALSE],
      // Your own property — the equivalent of a resolved option.
      '#require_ack_from' => 'critical',
    ];
  }

  /**
   * #process: runs after #name and #value exist, so children can use them.
   */
  public static function processIncidentSeverity(
    array &$element,
    FormStateInterface $form_state,
    array &$complete_form,
  ): array {
    $element['level'] = [
      '#type' => 'select',
      '#title' => t('Level'),
      '#options' => [
        'low' => t('Low'),
        'high' => t('High'),
        'critical' => t('Critical'),
      ],
      '#default_value' => $element['#value']['level'],
      '#required' => !empty($element['#required']),
    ];
    $element['sla_ack'] = [
      '#type' => 'checkbox',
      '#title' => t('SLA clock acknowledged'),
      '#default_value' => $element['#value']['sla_ack'],
      // #name is 'severity', so children post as severity[level] etc.
      '#states' => [
        'visible' => [
          ':input[name="' . $element['#name'] . '[level]"]' => [
            'value' => $element['#require_ack_from'],
          ],
        ],
      ],
    ];
    return $element;
  }

  /**
   * #element_validate: one rule across both children.
   */
  public static function validateIncidentSeverity(
    array &$element,
    FormStateInterface $form_state,
    array &$complete_form,
  ): void {
    $value = $form_state->getValue($element['#parents']);
    if ($value['level'] === $element['#require_ack_from'] && empty($value['sla_ack'])) {
      // setError() takes the child element, so the message lands on it.
      $form_state->setError(
        $element['sla_ack'],
        t('Critical incidents require the SLA clock to be acknowledged.'),
      );
    }
    // Normalise what the parent form finally reads.
    $form_state->setValueForElement($element, $value);
  }

  /**
   * #pre_render: last-moment markup concerns.
   */
  public static function preRenderIncidentSeverity(array $element): array {
    $element['#attributes']['class'][] = 'incident-severity';
    $element['#attributes']['class'][] = 'incident-severity--' . $element['#value']['level'];
    $element['#attached']['library'][] = 'incident_tracker/severity';
    return $element;
  }

}`,
      note: "configureOptions() ≈ getInfo(); buildForm() ≈ processIncidentSeverity(); buildView() ≈ preRenderIncidentSeverity(). Because ElementInterface extends RenderCallbackInterface, these static methods are already trusted callbacks — you do not implement trustedCallbacks().",
    },
    {
      label: "Mapping raw input to a value",
      intro:
        "The widget must survive a first GET (nothing submitted), a normal POST, and a hostile POST. Symfony uses data transformers between model and view; Drupal has one hook, valueCallback().",
      php: `<?php
// Symfony: transformers convert model <-> normalised <-> view data.
use Symfony\\Component\\Form\\CallbackTransformer;

public function buildForm(FormBuilderInterface $builder, array $options): void
{
    $builder
        ->add('level', ChoiceType::class, [
            // ChoiceType itself rejects values outside 'choices'.
            'choices' => ['Low' => 'low', 'High' => 'high', 'Critical' => 'critical'],
        ])
        ->add('slaAck', CheckboxType::class, ['required' => false]);

    $builder->addModelTransformer(new CallbackTransformer(
        // model -> form (rendering an empty/new object)
        fn (?Severity $s) => [
            'level' => $s?->level ?? 'low',
            'slaAck' => (bool) $s?->slaAck,
        ],
        // form -> model (submission)
        fn (array $data) => new Severity($data['level'], (bool) $data['slaAck']),
    ));
}`,
      ts: `<?php
// Drupal: one static hook does both directions.
use Drupal\\Core\\Form\\FormStateInterface;

/**
 * Determines how user input maps to this element's #value.
 *
 * @param array $element
 *   The element, already merged with getInfo() defaults.
 * @param mixed $input
 *   FALSE means "nothing was submitted for me" (a fresh GET).
 *   Anything else is the raw, untrusted value from the request.
 */
public static function valueCallback(
  &$element,
  $input,
  FormStateInterface $form_state,
) {
  // Note: FALSE, not NULL and not '' — an empty textfield posts ''.
  $source = ($input === FALSE)
    ? ($element['#default_value'] ?? [])
    : (is_array($input) ? $input : []);

  $levels = ['low', 'high', 'critical'];
  $level = $source['level'] ?? '';

  return [
    // Never trust the POST key: a select's options are not enforced here.
    'level' => in_array($level, $levels, TRUE) ? $level : 'low',
    'sla_ack' => !empty($source['sla_ack']),
  ];
}`,
      note: "Getting the FALSE check wrong is the classic bug: if you test `if (!$input)` an empty submitted value silently reverts to #default_value, so users can never clear the field.",
    },
    {
      label: "The widget's own markup",
      intro:
        "Both frameworks let a theme override how the widget renders. Symfony overrides a named form-theme block; Drupal overrides a Twig template registered against a theme hook.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# Symfony: templates/form/incident_severity.html.twig #}
{# Block name = getBlockPrefix() ~ '_widget'. #}
{% block incident_severity_widget %}
  <div class="incident-severity incident-severity--{{ form.level.vars.value }}">
    <div class="incident-severity__level">{{ form_row(form.level) }}</div>
    <div class="incident-severity__ack">{{ form_row(form.slaAck) }}</div>
    {% if form.level.vars.value == require_ack_from %}
      <p class="incident-severity__hint">SLA clock starts immediately.</p>
    {% endif %}
  </div>
{% endblock %}

{# Registered globally in config/packages/twig.yaml:
twig:
  form_themes:
    - 'form/incident_severity.html.twig'
#}`,
      ts: `{#
  Drupal: incident_tracker/templates/incident-severity.html.twig
  (copy into incident_theme/templates/ to override it)

  Available variables:
  - element: the whole render element, children included.
  - level, sla_ack, require_ack_from: lifted by the preprocess below.
  - attributes: from #attributes, set in preRenderIncidentSeverity().
#}
<div{{ attributes.addClass('incident-severity') }}>
  <div class="incident-severity__level">{{ level }}</div>
  <div class="incident-severity__ack">{{ sla_ack }}</div>
  {% if element['#value'].level == require_ack_from %}
    <p class="incident-severity__hint">{{ 'SLA clock starts immediately.'|t }}</p>
  {% endif %}
</div>

{# incident_tracker.module

function incident_tracker_theme(): array {
  return [
    'incident_severity' => [
      // The whole element arrives as one variable named 'element'.
      'render element' => 'element',
    ],
  ];
}

function incident_tracker_preprocess_incident_severity(array &$variables): void {
  $element = $variables['element'];
  $variables['attributes'] = $element['#attributes'] ?? [];
  $variables['require_ack_from'] = $element['#require_ack_from'];
  // Hand the child render arrays to Twig as friendly names.
  $variables['level'] = $element['level'];
  $variables['sla_ack'] = $element['sla_ack'];
}
#}`,
      note: "'render element' => 'element' means the template gets one variable holding the entire element (children and #-properties alike), so a preprocess that lifts what you need keeps the Twig readable. In Drupal 11.1+ hook_theme() can also live on a class method with #[Hook('theme')].",
    },
    {
      label: "Registering it, and using it",
      intro:
        "The payoff: how much ceremony stands between the class and using it in a form.",
      php: `<?php
// Symfony: the class IS the identity. Autoconfiguration tags it
// 'form.type'; nothing else to declare — but every consumer must
// import the FQCN.

use App\\Form\\Type\\IncidentSeverityType;

class IncidentType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('title', TextType::class)
            ->add('severity', IncidentSeverityType::class, [
                'label' => 'Severity',
                'require_ack_from' => 'critical',
            ]);
    }
}

// Rendering it in a controller template:
//   {{ form_row(form.severity) }}
// Unknown option => OptionsResolver throws at build time.`,
      ts: `<?php
// Drupal: the plugin ID is the identity. Discovery is by folder +
// attribute — no services.yml, no tag, no 'use' statement anywhere
// you consume it. Just clear caches: drush cr.

// In any form, block, controller or hook_form_alter():
$form['severity'] = [
  '#type' => 'incident_severity',
  '#title' => $this->t('Severity'),
  '#required' => TRUE,
  // getInfo() defaults are unioned UNDER these, so both of these win.
  '#default_value' => ['level' => 'high', 'sla_ack' => FALSE],
  '#require_ack_from' => 'high',
];

// Reading it back in submitForm() — #tree keeps the children nested:
$severity = $form_state->getValue('severity');
// ['level' => 'high', 'sla_ack' => TRUE]

// Output-only sibling: a badge with no input handling.
// #[RenderElement('incident_badge')]
// class IncidentBadge extends RenderElementBase { … }
// $build['badge'] = ['#type' => 'incident_badge', '#level' => 'critical'];

// Other modules can reshape your element globally:
// function other_module_element_info_alter(array &$info): void {
//   $info['incident_severity']['#theme_wrappers'] = [];
// }`,
      note: "Drupal trades compile-time option validation for global reach: an unknown '#property' is silently ignored rather than throwing, but any module can retune your element for the whole site via hook_element_info_alter().",
    },
  ],

  playground: {
    intro:
      "The Element-plugin pipeline in plain PHP: defaults, then valueCallback(), then #process, then #element_validate. Predict each of the four requests — especially the forged one.",
    lang: "php",
    code: `<?php
// The Element-plugin pipeline with no Drupal bootstrap: element_info defaults
// -> valueCallback() -> #process -> #element_validate. Same order, same rules
// FormBuilder uses for every '#type' on the page.

// ---- src/Element/IncidentSeverity.php, distilled ------------------------

function incident_severity_get_info(): array {
  return [
    '#input' => TRUE,
    '#tree' => TRUE,
    '#process' => ['process_incident_severity'],
    '#element_validate' => ['validate_incident_severity'],
    '#theme' => 'incident_severity',
    '#theme_wrappers' => ['form_element'],
    '#default_value' => ['level' => 'low', 'sla_ack' => FALSE],
    '#require_ack_from' => 'critical',
  ];
}

// valueCallback(): raw $input -> the element's #value.
function incident_severity_value_callback(array $element, $input): array {
  // FALSE (not NULL, not '') means "nothing was submitted for me".
  $source = ($input === FALSE) ? $element['#default_value'] : $input;
  $levels = ['low', 'high', 'critical'];
  return [
    'level' => in_array($source['level'] ?? '', $levels, TRUE) ? $source['level'] : 'low',
    'sla_ack' => !empty($source['sla_ack']),
  ];
}

// #process: build the children, now that #value and #name exist.
function process_incident_severity(array $element): array {
  $element['level'] = [
    '#type' => 'select',
    '#name' => $element['#name'] . '[level]',
    '#default_value' => $element['#value']['level'],
  ];
  $element['sla_ack'] = [
    '#type' => 'checkbox',
    '#name' => $element['#name'] . '[sla_ack]',
    '#default_value' => $element['#value']['sla_ack'],
  ];
  return $element;
}

// #element_validate: runs once, on the composite, after children are valid.
function validate_incident_severity(array $element, array &$errors): void {
  $value = $element['#value'];
  if ($value['level'] === $element['#require_ack_from'] && !$value['sla_ack']) {
    $errors[] = $element['#name'] . '[sla_ack]: acknowledge the SLA clock for a critical incident.';
  }
}

// ---- FormBuilder::doBuildForm(), distilled ------------------------------

function build_element(array $element, string $name, $input): array {
  // 1. element_info defaults are unioned in — anything you set wins.
  $element += incident_severity_get_info();
  // 2. handleInputElement(): #name from #parents, then #value from valueCallback.
  $element['#name'] = $name;
  $element['#value'] = incident_severity_value_callback($element, $input);
  // 3. #process callbacks, in order, with #value already populated.
  foreach ($element['#process'] as $callback) {
    $element = $callback($element);
  }
  return $element;
}

function children(array $element): array {
  return array_keys(array_filter(
    $element,
    fn (string $key) => !str_starts_with($key, '#'),
    ARRAY_FILTER_USE_KEY
  ));
}

function run(string $label, $input): void {
  // The form author writes only these three lines.
  $element = ['#type' => 'incident_severity', '#title' => 'Severity'];

  $element = build_element($element, 'severity', $input);
  $errors = [];
  foreach ($element['#element_validate'] as $callback) {
    $callback($element, $errors);
  }

  echo $label, "\\n";
  echo '  #value    : ', json_encode($element['#value']), "\\n";
  echo '  #theme    : ', $element['#theme'], ' (+ wrapper: ', $element['#theme_wrappers'][0], ")\\n";
  echo '  children  : ', implode(', ', children($element)), "\\n";
  echo '  input name: ', $element['level']['#name'], "\\n";
  echo '  errors    : ', $errors ? implode('; ', $errors) : 'none', "\\n\\n";
}

run('GET (no input yet -> #default_value)', FALSE);
run('POST critical, box unticked', ['level' => 'critical']);
run('POST critical, box ticked', ['level' => 'critical', 'sla_ack' => '1']);
run('POST with a forged level', ['level' => 'catastrophic', 'sla_ack' => '1']);`,
    output: `GET (no input yet -> #default_value)
  #value    : {"level":"low","sla_ack":false}
  #theme    : incident_severity (+ wrapper: form_element)
  children  : level, sla_ack
  input name: severity[level]
  errors    : none

POST critical, box unticked
  #value    : {"level":"critical","sla_ack":false}
  #theme    : incident_severity (+ wrapper: form_element)
  children  : level, sla_ack
  input name: severity[level]
  errors    : severity[sla_ack]: acknowledge the SLA clock for a critical incident.

POST critical, box ticked
  #value    : {"level":"critical","sla_ack":true}
  #theme    : incident_severity (+ wrapper: form_element)
  children  : level, sla_ack
  input name: severity[level]
  errors    : none

POST with a forged level
  #value    : {"level":"low","sla_ack":true}
  #theme    : incident_severity (+ wrapper: form_element)
  children  : level, sla_ack
  input name: severity[level]
  errors    : none

`,
  },

  keyPoints: [
    "A custom '#type' is a render element plugin: a class in src/Element/ discovered by directory + attribute — no services.yml, no tag, and no 'use' statement where you consume it.",
    "#[FormElement('id')] is Drupal\\Core\\Render\\Attribute\\FormElement (Drupal 10.3+; use the @FormElement annotation on 10.0–10.2); extend FormElementBase for inputs, RenderElementBase for output-only types — Drupal 10.3 renamed the old Element\\FormElement / Element\\RenderElement base classes because of that very name clash, and removes them in Drupal 12.",
    "getInfo() returns defaults merged UNDER each usage (#input, #process, #element_validate, #pre_render, #theme, #theme_wrappers, plus your own custom properties); it is cached, so run drush cr after editing it.",
    "Order matters: defaults -> handleInputElement() sets #name then calls valueCallback() -> #process builds children (with #value already set) -> #element_validate runs once on the composite.",
    "valueCallback() must test $input === FALSE for 'nothing submitted' and sanitise everything else — it is the only place a forged POST key gets rejected.",
    "Register the markup with hook_theme() using 'render element' => 'element', ship a Twig template, and any theme (incident_theme) can override it; other modules can retune the element site-wide with hook_element_info_alter().",
  ],

  interview: [
    {
      q: "You need the same three-field widget in five different forms. Walk me through how you'd package it in Drupal, and how that compares to a Symfony FormType.",
      a: "I'd write a render element plugin: a class in \`incident_tracker/src/Element/IncidentSeverity.php\` carrying \`#[FormElement('incident_severity')]\` and extending \`FormElementBase\`. \`getInfo()\` declares the defaults — \`#input\`, \`#tree\`, \`#process\`, \`#element_validate\`, \`#theme\` — which is the moral equivalent of \`configureOptions()\`. The children are built in a static \`#process\` callback rather than in \`getInfo()\`, because \`#process\` runs after FormBuilder has already set \`#name\` and \`#value\`, so the children can reference them; that maps onto \`buildForm()\` on a compound FormType. \`valueCallback()\` plays the role of a data transformer, and \`#pre_render\` plays the role of \`buildView()\`. The big practical difference is discovery: Symfony identifies the type by FQCN so every consumer imports the class, whereas Drupal identifies it by plugin ID, so after a \`drush cr\` any module can just write \`'#type' => 'incident_severity'\`.",
    },
    {
      q: "What is the difference between RenderElement and FormElement — and what changed about those class names recently?",
      a: "\`RenderElementBase\` is for output-only element types (\`container\`, \`html_tag\`, \`link\`, a status badge): they render, but FormBuilder never collects input for them. \`FormElementBase\` extends \`RenderElementBase\` and adds \`#input => TRUE\` plus \`valueCallback()\`, so the element participates in the submit cycle and gets a value in \`$form_state\`. The name is not a reliable guide — core's \`table\` is a \`FormElement\` extending \`FormElementBase\` with \`'#input' => TRUE\` in \`getInfo()\`, precisely so \`#tableselect\` checkboxes can round-trip. As for names: Drupal 10.3 introduced the PHP attributes \`Drupal\\Core\\Render\\Attribute\\RenderElement\` and \`...\\FormElement\`, which collided by short name with the existing base classes \`Drupal\\Core\\Render\\Element\\RenderElement\` and \`...\\FormElement\`. So the same release renamed the base classes to \`RenderElementBase\` and \`FormElementBase\`; the old names are deprecated and get removed in Drupal 12. On Drupal 10.0–10.2 you'd still be using the \`@FormElement\` annotation and the un-suffixed base class.",
    },
    {
      q: "Why build a composite element's children in #process rather than in getInfo()?",
      a: "\`getInfo()\` is static, cached defaults — it runs once per element type, not per usage, so it has no idea what \`#default_value\`, \`#name\`, or \`#required\` this particular instance got. \`#process\` runs per instance inside \`FormBuilder::doBuildForm()\`, *after* \`handleInputElement()\` has resolved \`#name\` from \`#parents\` and populated \`#value\` via \`valueCallback()\`. That is what lets the process callback seed each child's \`#default_value\` from the composite's \`#value\`, and build a \`#states\` selector like \`:input[name=\"severity[level]\"]\` from the real element name. Core does exactly this in \`Checkboxes::processCheckboxes()\` and \`PasswordConfirm::processPasswordConfirm()\`.",
    },
    {
      q: "What is valueCallback() for, and what is the classic bug people write in it?",
      a: "It maps the raw request value onto the element's \`#value\` — the single point where untrusted input becomes the element's state, so it is where you clamp a select to its allowed options and cast checkboxes to booleans. The signature is \`public static function valueCallback(&$element, $input, FormStateInterface $form_state)\`. The classic bug is the emptiness check: Drupal passes \`$input === FALSE\` to mean \"nothing was submitted for me\", but an empty textfield submits \`''\` and an unticked checkbox can arrive as \`NULL\` or \`0\`. If you write \`if (!$input) { return $element['#default_value']; }\` the element silently re-fills itself every time the user clears it, so the value can never be emptied. Always compare strictly against \`FALSE\`.",
    },
  ],

  quiz: [
    {
      question:
        "Where does an incident_tracker custom '#type' plugin live, and what registers it with Drupal?",
      options: [
        "src/Plugin/Element/, registered by a 'render.element' service tag in incident_tracker.services.yml",
        "src/Element/, discovered from the directory plus a #[FormElement] or #[RenderElement] attribute — no YAML at all",
        "templates/elements/, registered in incident_tracker.libraries.yml",
        "src/Form/, registered by a defaults._element key in the routing file",
      ],
      answerIndex: 1,
      explain:
        "Render element plugins use annotated/attributed class discovery from the module's src/Element/ directory. The attribute (Drupal\\Core\\Render\\Attribute\\FormElement in 10.3+, the @FormElement annotation before that) supplies the plugin ID, which becomes the '#type' string. There is no service, no tag and no YAML — just clear caches so the cached element_info picks it up.",
    },
    {
      question:
        "In Drupal 10.3 and 11, which class should a new input element extend, and why did the name change?",
      options: [
        "Drupal\\Core\\Render\\Element\\FormElement, because FormElementBase is only for output-only elements",
        "Drupal\\Core\\Form\\FormBase, because form elements and forms share a base class",
        "Drupal\\Core\\Render\\Element\\FormElementBase, because the old Element\\FormElement name clashed with the new Attribute\\FormElement",
        "Drupal\\Core\\Render\\Element\\RenderElementBase, because all elements are render elements",
      ],
      answerIndex: 2,
      explain:
        "Drupal 10.3 added the PHP attributes Drupal\\Core\\Render\\Attribute\\FormElement and \\RenderElement, whose short names collided with the existing base classes. The base classes were therefore renamed to FormElementBase and RenderElementBase; the old names are deprecated and removed in Drupal 12. FormElementBase extends RenderElementBase and is the right parent for anything that takes user input.",
    },
    {
      question:
        "FormBuilder is processing '#type' => 'incident_severity'. What order do these run in?",
      options: [
        "#process, then valueCallback(), then getInfo() defaults, then #element_validate",
        "getInfo() defaults, then #element_validate, then valueCallback(), then #process",
        "getInfo() defaults, then valueCallback() (after #name is set), then #process, then #element_validate on submit",
        "valueCallback(), then getInfo() defaults, then #pre_render, then #process",
      ],
      answerIndex: 2,
      explain:
        "element_info defaults from getInfo() are unioned in first, then handleInputElement() sets #name from #parents and calls valueCallback() to produce #value, then the #process callbacks run — which is why they can build children seeded from #value and #name. #element_validate runs later, on submit, once for the whole composite. #pre_render runs last, at render time.",
    },
    {
      question:
        "Your valueCallback() starts with `if (!$input) { return $element['#default_value']; }`. What breaks?",
      options: [
        "Nothing — that is the documented idiom",
        "The user can never clear the element: an empty submitted value is treated as 'nothing submitted' and reverts to the default",
        "The element throws a TypeError because #default_value is an array",
        "#process callbacks stop running because #value is not set",
      ],
      answerIndex: 1,
      explain:
        "Drupal signals 'nothing was submitted for this element' with the exact value FALSE. An empty textfield submits '', an unticked checkbox can arrive as NULL or 0 — all falsy. A loose check therefore re-applies #default_value on every submission where the user emptied the field, so the value is impossible to clear. Compare strictly: if ($input === FALSE).",
    },
  ],
};

export default lesson;
