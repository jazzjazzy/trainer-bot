import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "form-display-widgets",
  title: "Form Display: Widgets Without FormTypes",
  part: "Content Modeling in the UI",
  estMinutes: 12,
  summary:
    "The edit form for every content type is generated from config: each field gets a widget on the Manage form display tab — no FormType class, and multiple form modes per bundle.",

  concept: `
## Where did the FormType go?

In Symfony, an entity's edit screen means a \`FormType\` class: you list the
fields, pick a form field type for each (\`TextType\`, \`TextareaType\`,
\`EntityType\`), tune options, and keep the class in sync with the entity
forever. Drupal never asks you to write that class. When you added fields to a
content type, Drupal already knew how to build the edit form — the missing
piece is the **Manage form display** tab, where you decide *how* each field is
edited.

For an Event content type it lives at
\`/admin/structure/types/manage/event/form-display\`
(Structure > Content types > Event > Manage form display).

## Widgets: one decision per field

Each field type offers a set of **widgets** — the editing UI for that field:

- **Text (plain)** → single-line textfield (\`string_textfield\`)
- **Text (formatted, with summary)** → textarea plus a text-format selector
  (\`text_textarea_with_summary\`)
- **Entity reference** → your pick of **Select list**, **Check boxes/radio
  buttons**, **Autocomplete**, or **Autocomplete (Tags style)**
- **Date** → a date/time picker (\`datetime_default\`)
- **Media reference** → the **Media library** widget (browse/reuse instead of a
  raw upload); a plain **Image** field gets the **Image** upload widget
  (\`image_image\`)

The row's gear icon opens **widget settings**: textarea \`rows\`, a
\`placeholder\`, textfield \`size\`, and for autocomplete the matching rule
(*Starts with* vs *Contains*) and result limit. These are the knobs you'd have
passed as FormType options — here they're stored settings.

Two more moves, zero code:

- **Drag rows** to reorder the form.
- **Drag a field into the Disabled region** to remove it from the form
  entirely. The field and its data survive; only the widget disappears.

Widgets are the *input* half. The *output* half — formatters on the Manage
display tab — is the next lesson's topic. Same field, two independent panels.

## Form modes: several forms for one entity

Symfony's answer to "registration form vs admin edit form" is two FormType
classes. Drupal's answer is **form modes** — multiple form displays for the
same bundle:

1. Create the mode under **Structure > Display modes > Form modes**
   (\`/admin/structure/display-modes/form\`) and pick the entity type. Core
   already ships a **Register** form mode for users.
2. On the bundle's Manage form display tab, expand **Custom display settings**
   and check the mode. A new sub-tab appears with its own widget grid —
   hide the heavy fields on your slim registration form, keep everything on
   the default (admin) form.

## What it exports

Every form display is one config object:
\`core.entity_form_display.{entity_type}.{bundle}.{mode}\` — e.g.
\`core.entity_form_display.node.event.default\`. Inside: a \`content:\` map
(widget \`type\`, \`weight\`, \`region\`, \`settings\`) and a \`hidden:\` map for
disabled fields. A custom form mode adds a tiny
\`core.entity_form_mode.*\` entity alongside it. \`drush cex\`, commit, \`cim\`
on deploy — your "form code" is reviewable YAML in git.
`,

  comparisons: [
    {
      label: "The FormType you don't write",
      intro:
        "An Event needs an edit form: title, date, body with placeholder and 9 rows, and an internal-notes field editors should not see. In Symfony that is a class; in Drupal it is the Manage form display tab.",
      php: `// Symfony: the edit form is a class you author and keep in sync.
use Symfony\\Component\\Form\\AbstractType;
use Symfony\\Component\\Form\\FormBuilderInterface;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\DateTimeType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\TextareaType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\TextType;

class EventType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('title', TextType::class, ['attr' => ['size' => 60]])
            ->add('date', DateTimeType::class, ['widget' => 'single_text'])
            ->add('body', TextareaType::class, ['attr' => [
                'rows' => 9,
                'placeholder' => 'What happens at this event?',
            ]]);
        // internalNotes: simply not added — invisible knowledge.
    }
}`,
      ts: `# Structure > Content types > Event > Manage form display
#   (/admin/structure/types/manage/event/form-display)
# Drag to reorder; gear icon = widget settings; drag a row into
# "Disabled" to hide it. Then drush cex exports (trimmed):
# core.entity_form_display.node.event.default.yml
id: node.event.default
targetEntityType: node
bundle: event
mode: default
content:
  title:
    type: string_textfield
    weight: 0
    region: content
    settings:
      size: 60
      placeholder: ''
  field_date:
    type: datetime_default
    weight: 1
    region: content
    settings: {}
  field_body:
    type: text_textarea_with_summary
    weight: 2
    region: content
    settings:
      rows: 9
      placeholder: 'What happens at this event?'
hidden:
  field_internal_notes: true`,
      note:
        "The form is generated from field config plus widget choices. Hiding a field is a drag into Disabled — it lands under hidden:, explicit and reviewable, instead of being silently absent from a class.",
    },
    {
      label: "Picking the widget for an entity reference",
      intro:
        "Tags on an Event: should editors get a select box, checkboxes, or an autocomplete? In Symfony that is EntityType options (plus a UX package for autocomplete); in Drupal it is the widget dropdown.",
      php: `// Symfony: each editing style is form-config you write.
$builder->add('tags', EntityType::class, [
    'class' => Tag::class,
    'choice_label' => 'name',
    'multiple' => true,
    'expanded' => false,     // select box; true => checkboxes
    // Autocomplete? composer require symfony/ux-autocomplete, then:
    'autocomplete' => true,
]);`,
      ts: `# Same decision = the Widget dropdown on Manage form display.
# For an entity_reference field the choices are:
#   Select list                  -> options_select
#   Check boxes/radio buttons    -> options_buttons
#   Autocomplete                 -> entity_reference_autocomplete
#   Autocomplete (Tags style)    -> entity_reference_autocomplete_tags
# Gear icon: matching rule, result limit, placeholder.
# Exported component inside the form display YAML:
field_tags:
  type: entity_reference_autocomplete_tags
  weight: 3
  region: content
  settings:
    match_operator: CONTAINS   # or STARTS_WITH
    match_limit: 10
    size: 60
    placeholder: 'Start typing a tag…'
  third_party_settings: {}`,
      note:
        "Swapping select → checkboxes → autocomplete is a dropdown change and a config diff. Stored field data never changes — the widget is purely the editing UI.",
    },
    {
      label: "A second form for the same entity: form modes",
      intro:
        "You need a slim public registration form and a full admin edit form for users. Symfony: two FormType classes. Drupal: one entity, two form modes, each with its own widget grid.",
      php: `// Symfony: two classes to keep in sync with the User entity.
class RegistrationFormType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder->add('email')->add('plainPassword')->add('fullName');
    }
}

class UserAdminType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder->add('email')->add('fullName')->add('department')
            ->add('bio')->add('timezone')->add('roles');
    }
}`,
      ts: `# Drupal: one entity, several FORM MODES.
# 1. Structure > Display modes > Form modes > Add form mode
#    (core already ships the user "Register" mode)
# 2. Configuration > People > Account settings > Manage form
#    display > Custom display settings > enable "Register"
# 3. A Register sub-tab appears: its own widgets/order/hidden.
# Exports the mode + one display per enabled mode:
#   core.entity_form_mode.user.register.yml
#   core.entity_form_display.user.user.register.yml:
id: user.user.register
targetEntityType: user
bundle: user
mode: register
content:
  account:              # username/email/password block (weight only)
    weight: -10
  field_full_name:
    type: string_textfield
    weight: 0
    region: content
    settings:
      size: 60
      placeholder: ''
hidden:
  field_bio: true
  field_department: true
  timezone: true`,
      note:
        "Core wires the user Register mode to the sign-up page automatically. Custom modes on nodes need a caller (a module or contrib route) — the display config is clicks, choosing when it is used can still be code.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate Drupal's form builder: it reads the exported form display config, sorts components by weight (your drag order), applies widget settings, and skips the Disabled region. Predict the form it prints, then run.",
    code: `<?php
// Drupal has no FormType class for the Event edit form. It BUILDS the form
// from exported config: core.entity_form_display.node.event.default.yml.
// This simulates that: config in, rendered form out.

$formDisplay = [
    'id' => 'node.event.default',
    'content' => [
        'field_body' => [
            'type' => 'text_textarea_with_summary',
            'weight' => 2,
            'settings' => ['rows' => 9, 'placeholder' => 'What happens at this event?'],
        ],
        'title' => [
            'type' => 'string_textfield',
            'weight' => 0,
            'settings' => ['size' => 60],
        ],
        'field_tags' => [
            'type' => 'entity_reference_autocomplete_tags',
            'weight' => 3,
            'settings' => ['match_operator' => 'CONTAINS', 'match_limit' => 10],
        ],
        'field_date' => [
            'type' => 'datetime_default',
            'weight' => 1,
            'settings' => [],
        ],
    ],
    // Dragged to the "Disabled" region in the UI: field exists, form hides it.
    'hidden' => ['field_internal_notes' => true],
];

// The widget plugin decides which form element each field becomes.
$widgetElements = [
    'string_textfield' => 'single-line text input',
    'text_textarea_with_summary' => 'textarea + text-format select',
    'entity_reference_autocomplete_tags' => 'autocomplete (comma-separated)',
    'datetime_default' => 'date + time picker',
];

// Drupal sorts components by weight — the order you made by dragging rows.
uasort($formDisplay['content'], fn ($a, $b) => $a['weight'] <=> $b['weight']);

echo "Building form for " . $formDisplay['id'] . "\\n\\n";
foreach ($formDisplay['content'] as $fieldName => $component) {
    echo "[" . $component['weight'] . "] " . $fieldName . "\\n";
    echo "    widget:  " . $component['type'] . "\\n";
    echo "    renders: " . $widgetElements[$component['type']] . "\\n";
    foreach ($component['settings'] as $key => $value) {
        echo "    setting: " . $key . " = " . $value . "\\n";
    }
}

echo "\\nNot on the form (Disabled region):\\n";
foreach (array_keys($formDisplay['hidden']) as $fieldName) {
    echo "  - " . $fieldName . " (data kept, widget suppressed)\\n";
}

echo "\\nFormType classes written: 0\\n";`,
    output: `Building form for node.event.default

[0] title
    widget:  string_textfield
    renders: single-line text input
    setting: size = 60
[1] field_date
    widget:  datetime_default
    renders: date + time picker
[2] field_body
    widget:  text_textarea_with_summary
    renders: textarea + text-format select
    setting: rows = 9
    setting: placeholder = What happens at this event?
[3] field_tags
    widget:  entity_reference_autocomplete_tags
    renders: autocomplete (comma-separated)
    setting: match_operator = CONTAINS
    setting: match_limit = 10

Not on the form (Disabled region):
  - field_internal_notes (data kept, widget suppressed)

FormType classes written: 0`,
  },

  keyPoints: [
    "The entity edit form is generated from field config + the Manage form display tab — there is no FormType class to write or keep in sync.",
    "Each field gets a WIDGET (how it is edited): textfield, textarea + format, date picker, media library, and for entity references a choice of select / checkboxes / autocomplete / tags-style autocomplete.",
    "The gear icon holds widget settings (rows, size, placeholder, autocomplete match operator and limit) — the knobs you would have passed as FormType options.",
    "Drag rows to reorder; drag into the Disabled region to remove a field from the form without touching the field or its data — it exports under hidden:.",
    "Form modes give one bundle several forms (e.g. a slim user Register form vs the full admin form): create under Structure > Display modes > Form modes, enable via Custom display settings on Manage form display.",
    "Everything exports as core.entity_form_display.{entity_type}.{bundle}.{mode} (plus core.entity_form_mode.* for custom modes) and deploys with drush cex / cim.",
  ],

  interview: [
    {
      q: "In Symfony I'd write a FormType for every entity. How does Drupal produce the node edit form without one?",
      a: "Drupal derives the form from data: the field definitions on the bundle say *what* can be edited, and the form display config (the Manage form display tab) says *how* — which widget renders each field, in what order, with what settings. The form builder walks that config at runtime and assembles the form, so adding a field to a content type automatically adds it to the form with a sensible default widget. The whole arrangement is one config entity, `core.entity_form_display.node.article.default`, exported as YAML and deployed like any other config. You only reach for PHP (`hook_form_alter`, `#states`) for behavior the widget grid cannot express, such as conditional visibility between fields.",
    },
    {
      q: "What is the difference between a widget and a formatter in Drupal?",
      a: "They are the two halves of a field's UI, configured on two separate tabs. A **widget** controls how a field is *edited* on the entity form — chosen on Manage form display and stored in `core.entity_form_display.*` (e.g. an entity reference edited via autocomplete vs checkboxes). A **formatter** controls how the field is *rendered* to visitors — chosen on Manage display and stored in `core.entity_view_display.*`. Changing either never touches stored field data, which is why swapping a widget is a safe, reviewable config diff rather than a migration.",
    },
    {
      q: "How would you build a slim registration form for users that hides most profile fields, without forking the user form in code?",
      a: "Use a form mode. Core already ships a **Register** form mode for the user entity; under Configuration > People > Account settings > Manage form display you expand Custom display settings and enable it, which creates a second form display (`core.entity_form_display.user.user.register`). On its sub-tab you drag the heavy profile fields into Disabled so sign-up shows only the essentials, while the default form display keeps everything for admins. Both displays export as config, so the two forms deploy through git with `drush cex`/`cim`. In Symfony the equivalent is maintaining a second FormType class by hand.",
    },
  ],

  quiz: [
    {
      question:
        "An editor should no longer see field_internal_notes on the Event form, but existing data must be kept. What is the site-builder move?",
      options: [
        "Delete the field from Manage fields",
        "Drag the field into the Disabled region on Manage form display",
        "Write a hook_form_alter() that unsets the element",
        "Set the field's cardinality to 0",
      ],
      answerIndex: 1,
      explain:
        "Dragging the field to Disabled on the Manage form display tab removes its widget from the form while leaving the field definition and all stored data intact. It exports under hidden: in core.entity_form_display.node.event.default. Deleting the field destroys data; a form alter is code for something the UI already does.",
    },
    {
      question:
        "Where do widget settings like a textarea's rows or an autocomplete's 'Contains' matching end up after drush cex?",
      options: [
        "In field.storage.node.field_body.yml, next to the field's schema",
        "In the settings: of that field's component inside core.entity_form_display.*",
        "In a compiled FormType class in the module's src/Form directory",
        "They are content, so they stay in the database only",
      ],
      answerIndex: 1,
      explain:
        "Widget settings belong to the form display, not to the field itself: each component under content: in core.entity_form_display.{entity}.{bundle}.{mode} records its widget type, weight, region, and settings map (rows, placeholder, match_operator, ...). The field storage YAML only defines the data schema, and none of this is a PHP class.",
    },
    {
      question:
        "What does creating and enabling a 'registration' form mode for a bundle export?",
      options: [
        "One file: an override inside the bundle's node.type.* config",
        "A new PHP form class scaffolded into a custom module",
        "core.entity_form_mode.* for the mode, plus core.entity_form_display.*.*.registration for the bundle's widget grid",
        "Nothing — form modes are content and live only in the database",
      ],
      answerIndex: 2,
      explain:
        "A form mode is itself a small config entity (core.entity_form_mode.{entity_type}.registration, created under Structure > Display modes > Form modes). Enabling it for a bundle under Custom display settings creates a second form display config, core.entity_form_display.{entity_type}.{bundle}.registration, with its own widgets, order, and hidden fields. Both are plain YAML in git.",
    },
  ],
};

export default lesson;
