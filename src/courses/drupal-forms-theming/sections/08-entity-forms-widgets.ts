import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "entity-forms-widgets",
  title: "Entity Forms, Form Modes & Widget Plugins",
  part: "Form API in Depth",
  estMinutes: 13,
  summary:
    "How ContentEntityForm assembles a node edit form from field config and the entity_form_display for the active form mode — and the three ways you customise it: form modes, alter hooks keyed on base form id, and your own FieldWidget plugin.",

  concept: `
## The form nobody wrote

Every form so far in this course was a class you authored. The node add/edit form is
not. Nothing in core says "the incident form has a title, a severity and a downtime
field" — \`ContentEntityForm\` reads the entity's **field definitions** and then reads a
config entity, \`core.entity_form_display.node.incident.default\`, which says: for each
field, which **widget plugin** renders it, with which settings, at which \`#weight\`, and
which fields are hidden entirely. Site builders edit that config on *Manage form
display*; you never touch a \`buildForm()\`.

So the mental flip from Symfony is: **you do not write the form, you configure and
alter it.** Three levers, in escalating cost.

### Lever 1 — form modes

A **form mode** is an alternate \`entity_form_display\` for the same bundle. Create
\`core.entity_form_mode.node.slim\`, enable it under *Custom display settings* on the
bundle's form-display page, and you get a second field layout at
\`/admin/structure/types/manage/incident/form-display/slim\` — a triage form with three
fields instead of twenty. Core does not route to it for you: add the operation with
\`hook_entity_type_alter()\` and render it via \`entity.form_builder\`. Note what that does
to the ids — the operation lands in the form id (\`node_incident_slim_form\`), but the
base form id stays \`node_form\`.

### Lever 2 — alter hooks, and why base form ids matter

Entity forms are the one place where the distinction really bites:

- \`hook_form_node_form_alter()\` — the **BASE_FORM_ID** variant. Fires for every node
  form: every bundle, add *and* edit, every form mode.
- \`hook_form_node_incident_edit_form_alter()\` — the **FORM_ID** variant. Incident
  bundle, edit operation only. The add form is \`node_incident_form\`.

\`EntityForm::getFormId()\` builds *entity type + bundle + operation*; \`getBaseFormId()\`
returns just *entity type + "_form"*. Target the base id when the rule is "all node
forms", the full id when you mean one bundle and one operation.

### Lever 3 — a FieldWidget plugin

When the change is about *how a field is edited* rather than one form, write a widget.
Drop a class in \`src/Plugin/Field/FieldWidget/\`, attribute it with
\`#[FieldWidget(id: ..., field_types: ['integer'])]\`, extend \`WidgetBase\`, and it appears
in the widget dropdown for every integer field on the site. The four methods that
matter:

- \`formElement()\` — returns the render array for **one delta**. Whatever you nest here
  is the widget's private shape.
- \`massageFormValues()\` — converts that raw shape back into field-item arrays
  (\`['value' => 195]\`) before \`setValue()\`. Composite widgets live or die here.
- \`settingsForm()\` / \`settingsSummary()\` — the per-instance settings a site builder
  configures, stored in the display config, read back with \`getSetting()\`.
- \`isApplicable()\` — optional gate, e.g. single-cardinality fields only.

**Versions:** PHP attributes for field plugins (\`#[FieldWidget]\`, \`#[FieldFormatter]\`,
\`#[FieldType]\`) landed in Drupal **10.3** — the same wave as \`#[FormElement]\` /
\`#[RenderElement]\`. (10.2 added attribute discovery, but only for Action and Block.)
Attributes are the norm in 11; \`@FieldWidget\` annotation discovery still works there —
\`WidgetPluginManager\` still passes the annotation class alongside the attribute class —
but it is the legacy path, slated for removal.
\`drush generate plugin:field:widget\` scaffolds the class.
`,

  comparisons: [
    {
      label: "Who decides which fields are on the form",
      intro:
        "Symfony: you hand-build a FormType against the entity's properties, in code, in one place. Drupal: nobody writes the form — a config entity per bundle per form mode lists the fields, their widget plugin, settings and weight.",
      php: `<?php
// Symfony — src/Form/IncidentType.php. The form IS this file.
use Symfony\\Component\\Form\\AbstractType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\{TextType, ChoiceType, IntegerType};

class IncidentType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('title', TextType::class, ['attr' => ['size' => 80]])
            ->add('severity', ChoiceType::class, [
                'choices' => ['Low' => 'low', 'High' => 'high', 'Critical' => 'critical'],
                'expanded' => true,          // radios
            ])
            ->add('downtimeMinutes', IntegerType::class);
        // Reorder a field? Edit this file. Hide one? Edit this file.
    }
}`,
      ts: `# core.entity_form_display.node.incident.default.yml
langcode: en
status: true
dependencies:
  config:
    - field.field.node.incident.field_severity
    - node.type.incident
id: node.incident.default
targetEntityType: node
bundle: incident
mode: default
content:
  title:
    type: string_textfield
    weight: 0
    region: content
    settings: { size: 80, placeholder: '' }
    third_party_settings: {  }
  field_severity:
    type: options_buttons
    weight: 5
    region: content
    settings: {  }
  field_downtime:
    type: incident_duration      # <- our custom widget plugin id
    weight: 10
    region: content
    settings: { step: 5, max_hours: 72 }
hidden:
  created: true
  promote: true`,
      note: "The Drupal side is site config, not code: a builder can reorder or swap widgets in the UI, then export the YAML. Your module ships it under config/install (or config/optional if the field may not exist).",
      rightLang: "yaml",
    },
    {
      label: "Customising a form you did not author",
      intro:
        "Add a cross-field business rule to the incident node form. Symfony registers a typed extension against the form class; Drupal names a function after the form id — and here the choice between the base form id and the full form id is the whole decision.",
      php: `<?php
// Symfony — a type extension is registered against ONE form class,
// so it applies wherever IncidentType is used. No id string games.
use Symfony\\Component\\Form\\AbstractTypeExtension;

class OnCallExtension extends AbstractTypeExtension
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder->add('pageOnCall', CheckboxType::class, [
            'mapped' => false,
            'label' => 'Page the on-call engineer?',
        ]);
    }

    public static function getExtendedTypes(): iterable
    {
        return [IncidentType::class];
    }
}`,
      ts: `<?php
// incident_tracker.module

/**
 * Implements hook_form_BASE_FORM_ID_alter() for node_form.
 *
 * EVERY node form: every bundle, add + edit, every form mode.
 * Use this for site-wide editorial chrome.
 */
function incident_tracker_form_node_form_alter(array &$form, FormStateInterface $form_state, string $form_id): void {
  // The form object knows the entity — always ask it, never parse $form_id.
  $node = $form_state->getFormObject()->getEntity();
  $form['revision_information']['#group'] = 'advanced';
  if ($node->bundle() !== 'incident') {
    return;
  }
  $form['it_page_oncall'] = [
    '#type' => 'checkbox',
    '#title' => t('Page the on-call engineer?'),
    '#weight' => 90,
  ];
  $form['actions']['submit']['#submit'][] = 'incident_tracker_page_oncall_submit';
}

/**
 * Implements hook_form_FORM_ID_alter() for node_incident_edit_form.
 *
 * Incident bundle, EDIT only. The add form is node_incident_form;
 * the slim form mode (below) is node_incident_slim_form.
 */
function incident_tracker_form_node_incident_edit_form_alter(array &$form, FormStateInterface $form_state, string $form_id): void {
  $form['field_root_cause']['#required'] = TRUE;
}`,
      note: "EntityForm::getFormId() = entity type + bundle + operation; getBaseFormId() = entity type only. Both alters fire for the incident edit form, base form id first.",
    },
    {
      label: "A reusable input control",
      intro:
        "One integer field, edited as hours + minutes. In Symfony that is a custom form type plus a Twig widget block; in Drupal it is a FieldWidget plugin that any site builder can then select on Manage form display for any integer field.",
      php: `<?php
// Symfony — a compound type + DataTransformer, wired per-field.
class DurationType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('hours', IntegerType::class, ['label' => 'Hours'])
            ->add('minutes', IntegerType::class, ['label' => 'Minutes'])
            ->addModelTransformer(new CallbackTransformer(
                fn(?int $total) => ['hours' => intdiv((int) $total, 60),
                                    'minutes' => (int) $total % 60],
                fn(array $v) => ((int) $v['hours'] * 60) + (int) $v['minutes'],
            ));
    }
}
// Used by explicitly adding DurationType to a form class.
// Twig: {% block duration_widget %}...{% endblock %} in form_theme.html.twig`,
      ts: `<?php
// incident_tracker/src/Plugin/Field/FieldWidget/IncidentDurationWidget.php
namespace Drupal\\incident_tracker\\Plugin\\Field\\FieldWidget;

use Drupal\\Core\\Field\\Attribute\\FieldWidget;
use Drupal\\Core\\Field\\FieldItemListInterface;
use Drupal\\Core\\Field\\WidgetBase;
use Drupal\\Core\\Form\\FormStateInterface;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup;

#[FieldWidget(
  id: 'incident_duration',
  label: new TranslatableMarkup('Downtime (hours + minutes)'),
  description: new TranslatableMarkup('Two number inputs stored as one integer.'),
  field_types: ['integer'],
)]
final class IncidentDurationWidget extends WidgetBase {

  public static function defaultSettings(): array {
    return ['step' => 5, 'max_hours' => 72] + parent::defaultSettings();
  }

  /** Render array for ONE delta. Nest freely — massage() undoes it. */
  public function formElement(FieldItemListInterface $items, $delta, array $element, array &$form, FormStateInterface $form_state): array {
    $total = (int) ($items[$delta]->value ?? 0);
    $element['#type'] = 'fieldset';
    $element['hours'] = [
      '#type' => 'number',
      '#title' => $this->t('Hours'),
      '#default_value' => intdiv($total, 60),
      '#min' => 0,
      '#max' => $this->getSetting('max_hours'),
    ];
    $element['minutes'] = [
      '#type' => 'number',
      '#title' => $this->t('Minutes'),
      '#default_value' => $total % 60,
      '#step' => $this->getSetting('step'),
      '#min' => 0,
      '#max' => 59,
    ];
    return $element;
  }

  /** Raw widget shape -> field item arrays, before setValue(). */
  public function massageFormValues(array $values, array $form, FormStateInterface $form_state): array {
    foreach ($values as $delta => $value) {
      $values[$delta] = ['value' => ((int) $value['hours'] * 60) + (int) $value['minutes']];
    }
    return $values;
  }

  /** Shown on Manage form display when the cog is opened. */
  public function settingsForm(array $form, FormStateInterface $form_state): array {
    return [
      'step' => [
        '#type' => 'number', '#title' => $this->t('Minute step'),
        '#default_value' => $this->getSetting('step'), '#min' => 1, '#max' => 60,
      ],
      'max_hours' => [
        '#type' => 'number', '#title' => $this->t('Maximum hours'),
        '#default_value' => $this->getSetting('max_hours'), '#min' => 1,
      ],
    ];
  }

  public function settingsSummary(): array {
    return [$this->t('Steps of @s min, up to @h h', [
      '@s' => $this->getSetting('step'),
      '@h' => $this->getSetting('max_hours'),
    ])];
  }

}`,
      note: "Symfony's type is opt-in per form class; the widget plugin is discovered and offered for EVERY integer field on the site — override isApplicable(FieldDefinitionInterface $fd) to narrow that.",
    },
    {
      label: "A slim editorial form mode",
      intro:
        "Give the on-call responder a three-field triage form instead of the full node edit form. Symfony: a second FormType (or validation groups). Drupal: a form mode config entity, a second display config, and a two-line hook to expose it as an operation.",
      php: `<?php
// Symfony — a second, narrower form type over the same entity.
class IncidentTriageType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('severity', ChoiceType::class, [...])
            ->add('downtimeMinutes', IntegerType::class)
            ->add('status', CheckboxType::class);
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => Incident::class,
            'validation_groups' => ['triage'],
        ]);
    }
}

// Controller: $this->createForm(IncidentTriageType::class, $incident);`,
      ts: `<?php
// 1. config/install/core.entity_form_mode.node.slim.yml
//      id: node.slim
//      label: 'Slim triage'
//      targetEntityType: node
//      cache: true
// 2. Enable it under "Custom display settings" at
//      /admin/structure/types/manage/incident/form-display
//    then configure /admin/structure/types/manage/incident/form-display/slim
//    which saves core.entity_form_display.node.incident.slim (mode: slim).

// 3. Core does not create a route for a form mode. Register the operation:
/**
 * Implements hook_entity_type_alter().
 */
function incident_tracker_entity_type_alter(array &$entity_types): void {
  // Reuse NodeForm; only the form display differs.
  $entity_types['node']->setFormClass('slim', $entity_types['node']->getFormClass('edit'));
}

// 4. Build it from a controller (route: /incident/{node}/triage).
$form = \\Drupal::service('entity.form_builder')->getForm($node, 'slim');
// ContentEntityForm::init() calls
//   EntityFormDisplay::collectRenderDisplay($node, 'slim')
// which falls back to the 'default' display if 'slim' is not enabled.
// Form id is now node_incident_slim_form; base form id is still node_form.`,
      note: "Fields hidden in a form mode are not edited, not wiped — the entity is loaded whole, only the displayed components are written back, so unlisted values survive the save.",
    },
  ],

  playground: {
    intro:
      "No Drupal bootstrap — just the mechanism. A fake widget registry plus a fake entity_form_display for the 'slim' form mode: sort components by weight, dispatch each field to its widget's formElement(), skip the hidden ones, then run the submitted values back through massageFormValues(). Predict the downtime defaults and the massaged integer before you run it.",
    lang: "php",
    code: `<?php
// A miniature ContentEntityForm: the entity_form_display for the ACTIVE FORM
// MODE decides which fields appear, in what order, through which widget.

// --- The plugin manager: three FieldWidget plugins. ---------------------
$widgets = [
  'string_textfield' => [
    'field_types' => ['string'],
    'element' => fn(array $item, array $s): array => [
      '#type' => 'textfield',
      '#default_value' => $item['value'] ?? '',
      '#size' => $s['size'] ?? 60,
    ],
    'massage' => fn(array $v): array => ['value' => trim($v['value'])],
  ],
  'options_buttons' => [
    'field_types' => ['list_string'],
    'element' => fn(array $item, array $s): array => [
      '#type' => 'radios',
      '#default_value' => $item['value'] ?? NULL,
    ],
    'massage' => fn(array $v): array => ['value' => $v['value']],
  ],
  // Our custom widget: two number boxes in, one integer out.
  'incident_duration' => [
    'field_types' => ['integer'],
    'element' => fn(array $item, array $s): array => [
      '#type' => 'fieldset',
      'hours' => ['#type' => 'number', '#default_value' => intdiv((int) ($item['value'] ?? 0), 60)],
      'minutes' => ['#type' => 'number', '#default_value' => ((int) ($item['value'] ?? 0)) % 60, '#step' => $s['step']],
    ],
    'massage' => fn(array $v): array => ['value' => ((int) $v['hours'] * 60) + (int) $v['minutes']],
  ],
];

// --- core.entity_form_display.node.incident.slim.yml, as PHP. -----------
$display = [
  'mode' => 'slim',
  'content' => [
    'title' => ['type' => 'string_textfield', 'weight' => 0, 'settings' => ['size' => 80]],
    'field_downtime' => ['type' => 'incident_duration', 'weight' => 10, 'settings' => ['step' => 5]],
    'field_severity' => ['type' => 'options_buttons', 'weight' => 5, 'settings' => []],
  ],
  'hidden' => ['field_postmortem' => TRUE, 'created' => TRUE],
];

$field_types = [
  'title' => 'string',
  'field_severity' => 'list_string',
  'field_downtime' => 'integer',
];
$stored = [
  'title' => [['value' => 'DB failover']],
  'field_severity' => [['value' => 'critical']],
  'field_downtime' => [['value' => 135]],
];

// --- buildForm(): sort by weight, delegate each field to its widget. ----
uasort($display['content'], fn(array $a, array $b): int => $a['weight'] <=> $b['weight']);

echo "form mode: {$display['mode']}\\n";
foreach ($display['content'] as $name => $component) {
  $plugin = $widgets[$component['type']];
  $applies = in_array($field_types[$name], $plugin['field_types'], TRUE) ? 'applies' : 'MISMATCH';
  echo "  {$name} (#weight {$component['weight']}) -> {$component['type']} [{$applies}]\\n";
  $element = $plugin['element']($stored[$name][0] ?? [], $component['settings']);
  echo "      #type: {$element['#type']}\\n";
  foreach ($element as $key => $child) {
    if ($key[0] === '#') {
      continue;
    }
    echo "        {$key}: {$child['#type']} default=" . var_export($child['#default_value'], TRUE) . "\\n";
  }
}
foreach (array_keys($display['hidden']) as $name) {
  echo "  {$name} -> hidden: no widget built, stored value untouched on save\\n";
}

// --- Submit: massageFormValues() turns raw input into field items. ------
$raw = [
  'title' => [['value' => '  DB failover  ']],
  'field_severity' => [['value' => 'high']],
  'field_downtime' => [['hours' => '3', 'minutes' => '15']],
];
echo "\\nmassageFormValues():\\n";
foreach ($raw as $name => $deltas) {
  $plugin = $widgets[$display['content'][$name]['type']];
  echo "  {$name} = " . json_encode(array_map($plugin['massage'], $deltas)) . "\\n";
}
`,
    output: `form mode: slim
  title (#weight 0) -> string_textfield [applies]
      #type: textfield
  field_severity (#weight 5) -> options_buttons [applies]
      #type: radios
  field_downtime (#weight 10) -> incident_duration [applies]
      #type: fieldset
        hours: number default=2
        minutes: number default=15
  field_postmortem -> hidden: no widget built, stored value untouched on save
  created -> hidden: no widget built, stored value untouched on save

massageFormValues():
  title = [{"value":"DB failover"}]
  field_severity = [{"value":"high"}]
  field_downtime = [{"value":195}]
`,
  },

  keyPoints: [
    "ContentEntityForm builds nothing itself: field definitions say what exists, and core.entity_form_display.ENTITY.BUNDLE.MODE says which widget plugin renders each field, with what settings and #weight, and which are hidden.",
    "Base form id vs form id: EntityForm::getBaseFormId() is entity type only (node_form), getFormId() adds bundle and operation (node_incident_form, node_incident_edit_form, node_incident_slim_form) — pick the alter that matches your scope.",
    "A form mode is just a second entity_form_display; enable it under Custom display settings, and expose it as an operation with hook_entity_type_alter() plus entity.form_builder — collectRenderDisplay() falls back to default if it is not enabled.",
    "A FieldWidget plugin is the reusable unit: #[FieldWidget(id:..., field_types:[...])] on a WidgetBase subclass in src/Plugin/Field/FieldWidget/, and it appears in the widget dropdown for every matching field on the site.",
    "formElement() is free to nest anything for one delta; massageFormValues() is what converts that shape back into field-item arrays, and settingsForm()/settingsSummary() expose per-instance options stored in the display config.",
    "PHP attributes for field plugins arrived in Drupal 10.3 (10.2 only covered Action and Block) and are the norm in 11; @FieldWidget annotation discovery still works in 11 but is the legacy path, slated for removal. drush generate plugin:field:widget scaffolds the class.",
  ],

  interview: [
    {
      q: "Coming from Symfony, how would you explain how Drupal builds the node edit form?",
      a: "In Symfony I'd write an `IncidentType` that explicitly `->add()`s every field — the form class *is* the definition. Drupal inverts that: `ContentEntityForm` iterates the bundle's field definitions and, for each one, looks up a config entity — `core.entity_form_display.node.incident.default` — that names the **widget plugin**, its settings, its `#weight` and whether the field is hidden. The widget's `formElement()` returns the render array for one delta, and `WidgetBase::form()` wraps it in the multi-value container. So there is no form class to edit: to change the form you change config (Manage form display), swap in a different widget plugin, or alter the assembled array. That is why a Drupal task that would be a `buildForm()` edit in Symfony is usually a config export plus a small alter here.",
    },
    {
      q: "When would you use hook_form_BASE_FORM_ID_alter instead of hook_form_FORM_ID_alter on a node form?",
      a: "Use the base form id, `hook_form_node_form_alter()`, when the rule is about node forms *in general* — editorial chrome, grouping revision info, attaching a library — because it fires for every bundle, both the add and edit operations, and every form mode. Use the specific `hook_form_node_incident_edit_form_alter()` when you genuinely mean one bundle and one operation; note the add form is `node_incident_form`, so a rule written only against the edit id silently misses node creation, which is a classic bug. `EntityForm::getFormId()` composes entity type + bundle + operation while `getBaseFormId()` returns just entity type + `_form`. Both alters run for a matching form, base first, and inside either one you should get the entity from `$form_state->getFormObject()->getEntity()` rather than parsing the form id string.",
    },
    {
      q: "A site builder wants a hours/minutes control for an integer field. Walk me through building that in Drupal.",
      a: "I'd write a **FieldWidget plugin**, not a form: a class in `incident_tracker/src/Plugin/Field/FieldWidget/` extending `WidgetBase`, annotated `#[FieldWidget(id: 'incident_duration', label: new TranslatableMarkup('Downtime'), field_types: ['integer'])]` (attributes since 10.3; `@FieldWidget` annotations in 10.2 and earlier, and still functional in 11). `formElement()` returns a fieldset with two `number` elements seeded from `$items[$delta]->value`; `massageFormValues()` collapses `['hours' => 3, 'minutes' => 15]` back to `['value' => 195]` before the field item is set. `defaultSettings()`, `settingsForm()` and `settingsSummary()` expose a minute step and max hours, which get stored in the form display config and read via `getSetting()`. `drush generate plugin:field:widget` scaffolds it. The payoff over a bespoke form element is that it now shows in the widget dropdown for *every* integer field, so site builders can adopt it without a developer — override `isApplicable()` if you need to restrict it.",
    },
    {
      q: "If a form mode hides a field, does saving that form wipe the field's stored value?",
      a: "No. The entity is loaded in full, and `ContentEntityForm::copyFormValuesToEntity()` writes back only the components present in the active form display; anything under `hidden:` is never built and never written, so its stored value survives. That is what makes form modes safe for slim editorial workflows — a triage form with three fields will not blank out the body or the postmortem. The caveats are validation and access, not data loss — and the validation one runs the opposite way to what people expect: `EntityFormDisplay::flagWidgetsErrorsFromViolations()` only flags a violation `if ($widget = $this->getRenderer($field_name))`, i.e. only for fields with a component in the *active* display, so a NotNull violation on a field hidden from the mode is silently discarded and the entity saves anyway — a genuine trap on an add form using a slim mode that hides a required field with no default. The exception is entity-level constraints: `ContentEntityForm::flagViolations()` walks `$violations->getEntityViolations()` and flags them with `setErrorByName()` on the form root, so those *can* block the save, with a message attached to no element. And hiding a field is not an access control — use `#access` or field-level permissions if the point is that the user must not see it.",
    },
  ],

  quiz: [
    {
      question:
        "Which alter hook fires when an editor CREATES a new incident node, an editor EDITS one, and an editor uses the slim form mode?",
      options: [
        "incident_tracker_form_node_incident_edit_form_alter()",
        "incident_tracker_form_node_form_alter()",
        "incident_tracker_form_node_incident_form_alter()",
        "incident_tracker_entity_form_alter()",
      ],
      answerIndex: 1,
      explain:
        "node_form is the BASE form id returned by EntityForm::getBaseFormId() — entity type only — so it matches every node form regardless of bundle, operation or form mode. The three full form ids here are node_incident_form (add), node_incident_edit_form (edit) and node_incident_slim_form (the slim operation); each FORM_ID alter matches exactly one of them.",
    },
    {
      question:
        "Your widget's formElement() returns a fieldset with 'hours' and 'minutes' number elements. On save, Drupal throws because the integer field got an array. What is missing?",
      options: [
        "A #element_validate callback converting the value",
        "massageFormValues(), which converts the widget's raw form shape back into field-item arrays like ['value' => 195]",
        "A DataTransformer service registered in incident_tracker.services.yml",
        "The field_types key on the #[FieldWidget] attribute",
      ],
      answerIndex: 1,
      explain:
        "WidgetBase::extractFormValues() pulls the raw submitted array for the field and passes it to massageFormValues() before calling setValue(). Whatever nesting formElement() invents is the widget's private business — massageFormValues() is the contract that turns it back into the field type's item structure. #element_validate is for validation, not shape conversion, and Drupal has no DataTransformer equivalent here.",
    },
    {
      question:
        "You created core.entity_form_mode.node.slim and configured its form display, but \\Drupal::service('entity.form_builder')->getForm($node, 'slim') throws an InvalidPluginDefinitionException. Why?",
      options: [
        "Form modes only work on config entities, not content entities",
        "The form mode must be added to the node type's info.yml",
        "No form handler is registered for the 'slim' operation — add it with hook_entity_type_alter(), e.g. $entity_types['node']->setFormClass('slim', ...)",
        "The mode id must be 'node.slim.default'",
      ],
      answerIndex: 2,
      explain:
        "A form mode only provides the display config. EntityTypeManager::getFormObject() still needs a form class registered for that operation, so core throws until you map it — usually reusing NodeForm via hook_entity_type_alter(). Once registered, ContentEntityForm::init() calls EntityFormDisplay::collectRenderDisplay($node, 'slim'), which falls back to the default display if the slim one is not enabled for the bundle.",
    },
    {
      question:
        "Where are a widget's per-field settings (like your 'step' => 5) stored?",
      options: [
        "In the field storage config, field.storage.node.field_downtime",
        "In the module's settings config created by a ConfigFormBase",
        "In State, because they are runtime values",
        "In the entity form display config, under content.field_downtime.settings, editable via settingsForm() on Manage form display",
      ],
      answerIndex: 3,
      explain:
        "defaultSettings() seeds them, settingsForm() renders the cog UI on Manage form display, and the values are saved into core.entity_form_display.<entity>.<bundle>.<mode> under that component's settings key — so they are per bundle AND per form mode, and travel with a config export. getSetting('step') reads them back inside formElement().",
    },
  ],
};

export default lesson;
