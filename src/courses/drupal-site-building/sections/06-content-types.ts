import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "content-types",
  title: "Content Types: Modeling Without Classes",
  part: "Content Modeling in the UI",
  estMinutes: 12,
  summary:
    "One admin form — Structure > Content types > Add content type — replaces the entity class, CRUD controller, form type, publish flags, and revision table you would scaffold in Symfony, and everything it saves is exportable config.",

  concept: `
## Stop scaffolding: one form replaces the entity layer

Asked for an "Events" section, your Symfony reflex files five tickets: an
\`Event\` entity, a Doctrine migration, a CRUD controller, an \`EventType\` form
class, Twig templates — then publish flags and a revision table when the client
asks for them. In Drupal that entire stack is one admin form:
**Structure > Content types > Add content type**.

Recall the architecture course: there is one \`Drupal\\node\\Entity\\Node\` class,
and every content type is a **bundle** of it. Creating "Event" creates no PHP
class. It creates a \`node.type.event\` **config entity**, and Drupal derives the
machinery from that data.

### Name vs machine name

Type the name "Event" and Drupal proposes the machine name \`event\` (click
*Edit* next to it to adjust before saving). The label is decoration — rename it
to "Meetup" any day. The machine name is an identifier that gets baked in
everywhere:

- the config name \`node.type.event\` and every field instance (\`field.field.node.event.*\`)
- the add form path \`/node/add/event\`
- permission strings ("create event content", "edit any event content")
- template suggestions (\`node--event.html.twig\`)
- Views filters, Pathauto patterns, and any \`$node->bundle() === 'event'\` in code

There is **no rename UI** for machine names. The "fix" is a mini content
migration: build a new type, move the nodes, repoint everything, delete the old
type. So choose deliberately at creation time: short, singular, lowercase.

### The tabs, and where each click lands in config

- **Submission form settings** — *Title field label* lets you rename the
  mandatory Title (e.g. "Event name"); it exports as a **base field override**
  (\`core.base_field_override.node.event.title\`). *Preview before submitting*
  (Disabled / Optional / Required) becomes \`preview_mode: 0|1|2\`.
  *Explanation or submission guidelines* becomes the \`help\` key.
- **Publishing options** — *Published*, *Promoted to front page*, and *Sticky at
  top of lists* are default values for node **base fields**, so changing them
  exports as \`core.base_field_override.node.event.status|promote|sticky\`.
  Only *Create new revision* lives on the type itself: \`new_revision: true\`.
- **Display settings** — *Display author and date information* becomes
  \`display_submitted\`.
- **Menu settings** — which menus editors may place this content in, plus the
  default parent item; stored on the same YAML under
  \`third_party_settings.menu_ui\` (the menu_ui module hangs its settings on
  node.type).

### What you now own without writing it

Hit *Save*, and you have: \`/node/add/event\` with a working create form, edit
and delete forms, a complete revision history with per-revision authorship and
revert, published/unpublished as a real state (unpublished content hides from
visitors instead of being deleted), a per-type permission set ready for the
roles lesson, form and view display modes to configure in the next lessons —
and a \`node.type.event.yml\` ready for \`drush config:export\`, code review, and
deployment. The next two lessons attach fields and tune those displays: also
pure config.
`,

  comparisons: [
    {
      label: "The entity + CRUD stack vs one admin form",
      intro:
        "Everything a framework developer scaffolds for a new content section, Drupal derives from one small config entity created in the UI.",
      php: `<?php
// Symfony: an "Events" section is a mini-application you build.
#[ORM\\Entity]
class Event
{
    #[ORM\\Id, ORM\\GeneratedValue, ORM\\Column]
    private ?int $id = null;

    #[ORM\\Column(length: 255)]
    private string $title;

    #[ORM\\Column]
    private bool $published = false;
}

// ...plus the rest of the stack you now owe:
// - a Doctrine migration (and another for the revisions table)
// - EventController: list / new / edit / delete actions
// - EventType form class + templates/event/*.html.twig
// - publish/unpublish handling, permissions checks`,
      ts: `# Click: Structure > Content types > Add content type
#   Name: Event            (machine name auto-suggested: event)
#   Description: 'A scheduled happening with a date and venue.'
#   Save content type
# Then: drush config:export
#
# config/sync/node.type.event.yml — the WHOLE "entity layer":
langcode: en
status: true
dependencies: {  }
name: Event
type: event
description: 'A scheduled happening with a date and venue.'
help: ''
new_revision: true
preview_mode: 1
display_submitted: true
# Derived for free: /node/add/event, edit + delete forms,
# revisions, publish states, per-type permissions.`,
      note:
        "No class, no migration, no controller. One Node class serves every type; 'Event' is a bundle defined by this config entity.",
    },
    {
      label: "Publishing defaults: where the checkboxes land",
      intro:
        "Default published/promoted flags you would hard-code in the class are per-type default values in Drupal — and they export as base field overrides, not on node.type itself.",
      php: `<?php
// Doctrine: defaults are hard-coded in the class.
#[ORM\\Entity]
class Event
{
    #[ORM\\Column]
    private bool $published = true;   // default lives in code

    #[ORM\\Column]
    private bool $promoted = false;   // changing it = redeploy
}
// Plus lifecycle/workflow code for the publish state,
// and a revisions table if the client wants history.`,
      ts: `# Click: Structure > Content types > Event > Edit
#   Publishing options tab:
#     [x] Published   [ ] Promoted to front page   [ ] Sticky
#     [x] Create new revision
#
# 'Create new revision' is the only one stored on node.type:
#   node.type.event.yml -> new_revision: true
# Un-ticking 'Promoted' exports a base field OVERRIDE:
# config/sync/core.base_field_override.node.event.promote.yml
id: node.event.promote
field_name: promote
entity_type: node
bundle: event
label: 'Promoted to front page'
default_value:
  -
    value: 0
field_type: boolean
# (langcode/status/dependencies/settings keys trimmed)`,
      note:
        "Published/Promoted/Sticky are node BASE fields; the checkboxes set per-bundle defaults, so they export as core.base_field_override.* — a classic 'where did that click go?' answer.",
    },
    {
      label: "Renaming 'Title' and adding form guidance",
      intro:
        "Relabeling a field and adding help text is FormType work in Symfony. In Drupal it is the Submission form settings tab — and it exports as config too.",
      php: `<?php
// Symfony: relabel the field in the FormType, redeploy.
class EventType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder->add('title', TextType::class, [
            'label' => 'Event name',
            'help'  => 'Use the name from the official venue listing.',
        ]);
    }
}`,
      ts: `# Click: Structure > Content types > Event > Edit
#   Submission form settings tab:
#     Title field label: 'Event name'
#     Preview before submitting: Optional
#     Explanation or submission guidelines:
#       'Use the name from the official venue listing.'
#
# The label is another base field override:
# config/sync/core.base_field_override.node.event.title.yml
id: node.event.title
field_name: title
entity_type: node
bundle: event
label: 'Event name'
required: true
field_type: string
# The guidelines + preview mode land on node.type.event.yml:
#   help: 'Use the name from the official venue listing.'
#   preview_mode: 1   # 0 disabled / 1 optional / 2 required`,
      note:
        "Editors see 'Event name' on the node form immediately — no template, no FormType, and the change deploys as reviewable YAML.",
    },
    {
      label: "Machine names are forever-ish",
      intro:
        "In Symfony a rename is an annoying but mechanical refactor. In Drupal the machine name is load-bearing across config, permissions, and templates — and there is no rename button.",
      php: `# Symfony: rename Event -> Meetup, then:
bin/console make:migration
# generated migration: RENAME TABLE event TO meetup,
# update foreign keys; IDE refactors the class name.
# Annoying, but one deploy and it is done.`,
      ts: `# Drupal: there is NO UI to change a machine name.
# 'event' is baked into:
#   node.type.event.yml
#   field.field.node.event.field_date.yml        # every field
#   core.entity_form_display.node.event.default.yml
#   core.entity_view_display.node.event.default.yml
#   permissions: 'create event content', 'edit any event content'
#   twig suggestion: node--event.html.twig
#   any Views filter or Pathauto pattern targeting 'event'
#
# The escape hatch is a mini-migration:
#   create the new type, move nodes across, repoint config, drop the old one.
# So decide at creation time:
#   label  'Event' -> 'Meetup' : one click, any day
#   machine name 'event'       : short, singular, lowercase, forever`,
      note:
        "Labels are cheap; machine names are identifiers threaded through config, permissions, and theming. Spend thirty seconds choosing one.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A model of what 'Save content type' persists — one small config array plus two base field overrides — and the machinery Drupal derives from it. Predict the output, then reveal.",
    code: `<?php
declare(strict_types=1);

// You clicked Structure > Content types > Add content type and saved.
// This array is essentially ALL that was persisted (node.type.event.yml).
$nodeType = [
    'name'              => 'Event',
    'type'              => 'event',  // machine name: forever-ish
    'new_revision'      => true,     // Publishing options
    'preview_mode'      => 1,        // Submission form settings: Optional
    'display_submitted' => false,    // Display settings
];

// Un-ticking Promoted + renaming Title became base field OVERRIDES.
$overrides = [
    'title'   => ['label' => 'Event name'],
    'promote' => ['default_value' => 0],
];

// From that config alone, Drupal derives the machinery you'd hand-build.
echo "Config entity: node.type.{$nodeType['type']}\\n";
echo "Add form:      /node/add/{$nodeType['type']}\\n";
foreach (['create', 'edit own', 'edit any', 'delete own', 'delete any'] as $op) {
    echo "Permission:    {$op} {$nodeType['type']} content\\n";
}

// A new node starts from base field defaults, patched by the overrides.
$defaults = ['status' => 1, 'promote' => 1, 'sticky' => 0];
foreach ($overrides as $field => $override) {
    if (isset($override['default_value'])) {
        $defaults[$field] = $override['default_value'];
    }
}
$node = $defaults + ['type' => $nodeType['type'], 'title' => 'DrupalCon Lille'];
echo "\\nNew {$node['type']}: status={$node['status']} "
   . "promote={$node['promote']} sticky={$node['sticky']}\\n";
echo $nodeType['new_revision']
    ? "Every save creates a new revision (rollback for free)\\n"
    : "Revisions off by default\\n";`,
    output: `Config entity: node.type.event
Add form:      /node/add/event
Permission:    create event content
Permission:    edit own event content
Permission:    edit any event content
Permission:    delete own event content
Permission:    delete any event content

New event: status=1 promote=0 sticky=0
Every save creates a new revision (rollback for free)`,
  },

  keyPoints: [
    "**Structure > Content types > Add content type** creates a `node.type.X` config entity — no PHP class, no migration; one `Node` class serves every type (bundles).",
    "The **label** ('Event') can change any time; the **machine name** (`event`) is baked into config names, `/node/add/event`, permission strings, and `node--event.html.twig` template suggestions — there is no rename UI, so choose deliberately.",
    "Publishing checkboxes (Published / Promoted / Sticky) are per-type defaults for node **base fields** and export as `core.base_field_override.node.TYPE.*`; only *Create new revision* lives on `node.type` (`new_revision: true`).",
    "Submission form settings hold the Title field label (a base field override), the `preview_mode` (0/1/2), and the guidelines text (`help`); menu settings ride along as `third_party_settings.menu_ui`.",
    "Saving the type instantly grants create/edit/delete forms, revision history with revert, real published/unpublished states, and a granular per-type permission set.",
    "It deploys like all config: `drush config:export`, commit the YAML, `drush config:import` on the target — the type exists on production without deploying any code.",
  ],

  interview: [
    {
      q: "Walk me through adding a new 'Event' content type and getting it onto production.",
      a: "In the UI: **Structure > Content types > Add content type**, set the name (machine name `event` is auto-suggested — I check it before saving because it can't be renamed later), then work the tabs: Submission form settings for the Title label and preview mode, Publishing options for default published/promoted flags and *Create new revision*, Display and Menu settings as needed. Saving creates a `node.type.event` config entity, and Drupal immediately provides `/node/add/event`, edit/delete forms, revisioning, and per-type permissions. To deploy, I run `drush config:export`, commit `node.type.event.yml` (plus any `core.base_field_override.node.event.*` files), and `drush config:import` on production. No PHP class, no schema migration, no code deploy — which is exactly the point of Drupal site building.",
    },
    {
      q: "A stakeholder wants events unpublished by default and the Title field labeled 'Event name'. Where does that configuration actually live?",
      a: "Both are on the content type's edit form, but they export to different places — a distinction interviewers like. Un-ticking *Published* under Publishing options sets a per-bundle default for the node base field `status`, so it exports as `core.base_field_override.node.event.status.yml`, not as a key on `node.type.event.yml`. The Title label under Submission form settings works the same way: `core.base_field_override.node.event.title.yml` with `label: 'Event name'`. The only publishing checkbox stored on `node.type` itself is *Create new revision* (`new_revision`). Knowing that Published/Promoted/Sticky are base fields with per-bundle default overrides shows you understand how the UI maps to config.",
    },
    {
      q: "Why are machine names such a big deal in Drupal, and what's your naming approach?",
      a: "Because the machine name is a load-bearing identifier with no rename UI. `event` gets embedded in the config name (`node.type.event`), every field instance (`field.field.node.event.*`), form/view display config, permission strings ('create event content'), Twig template suggestions (`node--event.html.twig`), Views filters, and any custom code checking `$node->bundle()`. Changing it later means a mini-migration: create a new type, move the content, repoint dependent config, and delete the old type — real pain on a live site. So I treat it like a public API name: short, singular, lowercase, descriptive of the model rather than today's marketing label. The human-facing label can chase the marketing rename for free.",
    },
  ],

  quiz: [
    {
      question:
        "You create an 'Event' content type in the admin UI. What did Drupal actually create?",
      options: [
        "A generated Event PHP class extending Node, plus a node_event table",
        "A node.type.event config entity — forms, permissions, and revisioning are derived from it",
        "A custom module scaffolded into web/modules/custom/event",
        "Nothing until a developer runs a schema migration",
      ],
      answerIndex: 1,
      explain:
        "A content type is a config entity (node.type.event). One Node class serves all types; the add/edit forms, per-type permissions, publish states, and revisions come from core reading that config — no class, no migration.",
    },
    {
      question:
        "You un-tick 'Promoted to front page' on the Event type. Where does that setting appear in exported config?",
      options: [
        "node.type.event.yml as promote: false",
        "core.base_field_override.node.event.promote.yml with default_value 0",
        "system.site.yml under front-page settings",
        "It is content, not config, so it never exports",
      ],
      answerIndex: 1,
      explain:
        "Published/Promoted/Sticky are node base fields; the checkboxes set per-bundle defaults, which export as base field overrides. Of the publishing options, only 'Create new revision' (new_revision) is stored on node.type itself.",
    },
    {
      question:
        "Two years in, marketing wants 'Event' renamed to 'Meetup'. Which change is trivially safe?",
      options: [
        "Changing the machine name from event to meetup on the type's edit form",
        "Editing node.type.event.yml and renaming the file to node.type.meetup.yml",
        "Changing the label from Event to Meetup — the machine name stays event",
        "Running drush config:rename in the UI",
      ],
      answerIndex: 2,
      explain:
        "The label is decoration and can change any time. The machine name has no rename UI and is embedded in config names, field instances, permissions, and template suggestions — changing it requires a mini-migration of content and config.",
    },
  ],
};

export default lesson;
