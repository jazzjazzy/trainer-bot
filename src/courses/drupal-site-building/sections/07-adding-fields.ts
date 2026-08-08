import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "adding-fields",
  title: "Fields in the UI: Types, Storage & Instance Settings",
  part: "Content Modeling in the UI",
  estMinutes: 12,
  summary:
    "Every field you add on the Manage fields tab is saved in two layers — shared, hard-to-change STORAGE config (type, cardinality) and per-bundle, always-editable INSTANCE config (label, required, help) — and understanding that split is what makes field decisions safe.",

  concept: `
You have clicked together the Article content type; now it needs data. The
**Manage fields** tab (*Structure > Content types > Article > Manage fields*) is
where a site builder does what you would do with Doctrine attributes: pick a
type, name it, constrain it. Core ships the types you would otherwise model by
hand: plain vs formatted text (short and long variants), number, boolean, date,
link, email, entity reference, image and file. In Drupal 10.2+ and 11 the
*Create a new field* button presents them as cards grouped by category; older
10.x used a single *Add field* form.

### One field, two layers

Every configurable field is saved as **two** config entities, and this split is
the most important idea on the page:

- **Storage** — \`field.storage.node.field_subtitle.yml\`. The field type, its
  type-level settings (max length, reference target type, date type) and
  **cardinality** (allowed number of values). Defined once per *entity type*
  and shared by every bundle that uses the field. This is your
  \`#[ORM\\Column]\`.
- **Instance** — \`field.field.node.article.field_subtitle.yml\`. Label,
  required, help text, default value, per-bundle settings such as which
  vocabularies a reference may target. One per *bundle*. This is your FormType
  options plus validation constraints.

The 10.2+ form shows both layers on one settings page, but they save
separately — and they age very differently.

### Storage locks; instances never do

The moment real rows exist, storage hardens. The field *type* can never change,
and type-level settings such as a string's max length are simply rendered
disabled. The storage form warns you up front: *"These settings apply to the
%field field everywhere it is used. Some also impact the way that data is
stored and cannot be changed once data has been created."* Cardinality is the
one storage setting with wiggle room:
you can raise it any time, and lower it only if no entity holds more values
than the new limit. Instance settings — label, required, help text, default —
stay editable forever. All the design pressure is on the storage decision,
exactly like choosing a column type.

### Unlimited values, zero migrations

Set *Allowed number of values* to Unlimited and the exported YAML records
\`cardinality: -1\`. Nothing else happens — no join table, no migration. Every
configurable field already lives in its own dedicated tables
(\`node__field_tags\`, \`node_revision__field_tags\`) keyed by entity id plus a
\`delta\` column, so one value and forty values are the same schema. Compare
Doctrine, where "an article has many tags" means a new join table and a
deploy-time migration before the first tag can be saved.

### Re-use, and the field_ prefix

Because storage belongs to the entity type, a second bundle can attach the
*same* field: *Manage fields > Re-use an existing field*. That creates only a
new instance YAML — same machine name, same table, its own label and
requiredness. One shared storage means one Views filter or aggregation that
spans Articles and Pages. New machine names get the \`field_\` prefix
automatically (the prefix is set in \`field_ui.settings\`), and like bundle IDs
they are permanent: the label is cosmetic, the machine name is schema.
`,

  comparisons: [
    {
      label: "A required Subtitle field: three code artifacts vs two YAML layers",
      intro:
        "Add a short required 'Subtitle' to articles. In Symfony that is a column, a migration, and a FormType. In Drupal the column half becomes storage config and the form half becomes instance config — both produced by one click-path.",
      php: `<?php
// Symfony: the same feature is three artifacts you write and deploy.

// 1) The column (the "storage" layer):
#[ORM\\Column(type: 'string', length: 255)]
private string $subtitle = '';

// 2) The migration:
//    php bin/console doctrine:migrations:diff
//    php bin/console doctrine:migrations:migrate

// 3) The form + validation (the "instance" layer):
$builder->add('subtitle', TextType::class, [
    'label'    => 'Subtitle',
    'required' => true,
    'help'     => 'Shown under the title on listing cards.',
]);`,
      ts: `# CLICK PATH (Drupal 10.2+ / 11):
# Structure > Content types > Article > Manage fields
#   > Create a new field ("Add field" in early 10.x)
#   > Plain text > Text (plain), label "Subtitle" > Continue
#   > Allowed number of values: 1, Required, help text > Save
# Then export:  drush config:export

# config/sync/field.storage.node.field_subtitle.yml   <- LAYER 1
id: node.field_subtitle
field_name: field_subtitle
entity_type: node
type: string            # locked forever once data exists
settings:
  max_length: 255       # frozen once rows exist
cardinality: 1
---
# config/sync/field.field.node.article.field_subtitle.yml  <- LAYER 2
id: node.article.field_subtitle
field_name: field_subtitle
entity_type: node
bundle: article
label: Subtitle
description: 'Shown under the title on listing cards.'
required: true          # instance settings stay editable forever
field_type: string`,
      note:
        "Storage YAML maps to the ORM column, instance YAML to the FormType options — but here both are clicks, and 'deploying the migration' is just importing the YAML.",
    },
    {
      label: "Unlimited values without a join-table migration",
      intro:
        "An article should hold any number of tags. Doctrine needs a new join table created by a migration before one tag can be saved. Drupal flips a cardinality setting — the per-field delta table already exists.",
      php: `<?php
// "An article has many tags" in Doctrine: a relation plus a join
// table you must migrate into existence.
#[ORM\\ManyToMany(targetEntity: Tag::class)]
#[ORM\\JoinTable(name: 'article_tag')]
private Collection $tags;

// migrations/Version20260807103000.php (generated, then run):
public function up(Schema $schema): void
{
    $this->addSql('CREATE TABLE article_tag (
      article_id INT NOT NULL,
      tag_id INT NOT NULL,
      PRIMARY KEY (article_id, tag_id))');
}`,
      ts: `# CLICK PATH:
# Structure > Content types > Article > Manage fields
#   > Create a new field > Reference > Taxonomy term
#   > label "Tags" > Allowed number of values: Unlimited > Save

# config/sync/field.storage.node.field_tags.yml
id: node.field_tags
field_name: field_tags
entity_type: node
type: entity_reference
settings:
  target_type: taxonomy_term
cardinality: -1          # -1 = unlimited

# No migration follows. Every configurable field already lives in
# dedicated tables (node__field_tags, node_revision__field_tags)
# keyed by (entity_id, delta) - 1 value or 40 is the same schema.`,
      note:
        "Cardinality can be raised any time; it can only be lowered if no entity holds more values than the new limit. The schema never changes either way.",
    },
    {
      label: "Sharing one field across two content types",
      intro:
        "Pages should be taggable with the same vocabulary as articles. In Symfony you share the code with a trait but still duplicate the schema. In Drupal, 'Re-use an existing field' attaches the same storage to a second bundle.",
      php: `<?php
// Symfony: a trait shares the code, but each entity still gets its
// own join table via another migration - and cross-type queries
// need a UNION or separate joins.
trait HasTags
{
    #[ORM\\ManyToMany(targetEntity: Tag::class)]
    private Collection $tags;
}

class Article { use HasTags; }
class Page    { use HasTags; }

// doctrine:migrations:diff now generates BOTH article_tag
// and page_tag join tables.`,
      ts: `# CLICK PATH:
# Structure > Content types > Basic page > Manage fields
#   > Re-use an existing field > field_tags
# Only a SECOND INSTANCE is created - the storage is shared:

# config/sync/field.field.node.page.field_tags.yml
dependencies:
  config:
    - field.storage.node.field_tags   # the shared layer-1 storage
    - node.type.page
id: node.page.field_tags
field_name: field_tags
entity_type: node
bundle: page
label: Keywords            # per-bundle label
required: false            # per-bundle requiredness
settings:
  handler: default:taxonomy_term
  handler_settings:
    target_bundles:
      tags: tags
field_type: entity_reference`,
      note:
        "Same machine name, same table, different label per bundle — one Views filter on field_tags now spans Articles and Pages. The trade-off: all bundles share the storage's type and cardinality.",
    },
  ],

  playground: {
    intro:
      "Plain PHP model of the two-layer save: storage definitions shared per entity type, instances per bundle, dedicated delta tables, and the lock that lands once rows exist. Predict the output before revealing it.",
    lang: "php",
    code: `<?php
// Drupal's two-layer field save, modeled without a Drupal bootstrap.
// Layer 1: STORAGE (field.storage.node.*)          - per entity type.
// Layer 2: INSTANCE (field.field.node.<bundle>.*)  - per bundle.

$storage = [
  'field_subtitle' => ['type' => 'string',           'cardinality' => 1,  'settings' => ['max_length' => 255]],
  'field_tags'     => ['type' => 'entity_reference', 'cardinality' => -1, 'settings' => ['target_type' => 'taxonomy_term']],
];

$instances = [
  ['bundle' => 'article', 'field' => 'field_subtitle', 'label' => 'Subtitle', 'required' => true],
  ['bundle' => 'article', 'field' => 'field_tags',     'label' => 'Tags',     'required' => false],
  // "Re-use an existing field": same storage, a new per-bundle instance.
  ['bundle' => 'page',    'field' => 'field_tags',     'label' => 'Keywords', 'required' => false],
];

echo "What each bundle's node form gets:\\n";
foreach ($instances as $i) {
  $s    = $storage[$i['field']];
  $card = $s['cardinality'] === -1 ? 'unlimited' : (string) $s['cardinality'];
  echo str_pad($i['bundle'] . '.' . $i['field'], 24)
    . str_pad($s['type'], 18)
    . str_pad('values:' . $card, 18)
    . 'label="' . $i['label'] . '"'
    . ($i['required'] ? '  REQUIRED' : '') . "\\n";
}

// Every configurable field gets its own delta table, so a cardinality
// change never alters the schema - no join-table migration, ever.
echo "\\nTables the field system provisioned:\\n";
foreach ($storage as $name => $s) {
  $col = $s['type'] === 'entity_reference' ? $name . '_target_id' : $name . '_value';
  echo "  node__$name (entity_id, delta, $col)\\n";
}

// Storage settings freeze once rows exist; instance settings never do.
$rows = ['field_subtitle' => 12, 'field_tags' => 0];
echo "\\n";
foreach ($storage as $name => $s) {
  echo $rows[$name] > 0
    ? "$name: storage LOCKED ($rows[$name] rows) - type & settings frozen\\n"
    : "$name: storage still editable - no data yet\\n";
}`,
    output: `What each bundle's node form gets:
article.field_subtitle  string            values:1          label="Subtitle"  REQUIRED
article.field_tags      entity_reference  values:unlimited  label="Tags"
page.field_tags         entity_reference  values:unlimited  label="Keywords"

Tables the field system provisioned:
  node__field_subtitle (entity_id, delta, field_subtitle_value)
  node__field_tags (entity_id, delta, field_tags_target_id)

field_subtitle: storage LOCKED (12 rows) - type & settings frozen
field_tags: storage still editable - no data yet`,
  },

  keyPoints: [
    "Every UI-added field becomes two config entities: \`field.storage.<entity_type>.<name>\` (type, type settings, cardinality — shared per entity type) and \`field.field.<entity_type>.<bundle>.<name>\` (label, required, help, default — per bundle).",
    "Think storage ≈ \`#[ORM\\Column]\`, instance ≈ FormType options — except both are clicks that export to YAML, and importing the YAML *is* the deployment.",
    "Storage hardens once data exists: the type can never change and type settings like max length freeze; cardinality may be raised any time but lowered only if no entity exceeds the new limit.",
    "Instance settings (label, required, help text, default value) remain editable forever — put your design effort into the storage decision.",
    "\`cardinality: -1\` means unlimited, and switching to it needs no schema change: each configurable field already stores values in dedicated delta tables (\`node__field_X\`), unlike Doctrine's new-join-table migration.",
    "'Re-use an existing field' attaches shared storage to another bundle with its own instance settings; machine names take the \`field_\` prefix (from \`field_ui.settings\`) and are permanent.",
  ],

  interview: [
    {
      q: "A field in Drupal is saved as two config objects. What are they, and why does the split matter?",
      a: "Field **storage** config (\`field.storage.node.field_x\`) holds the field type, type-level settings, and cardinality; it belongs to the entity type and is shared by every bundle using the field. Field **instance** config (\`field.field.node.article.field_x\`) holds the per-bundle label, required flag, help text, and default value. The split matters because the two layers have different lifecycles: storage effectively locks once data exists, while instances stay freely editable, and re-using a field on another bundle only adds an instance. For a Symfony developer the mapping is storage ≈ the ORM column attribute, instance ≈ the FormType options — but in Drupal both are exportable YAML, so a content-model change deploys as \`drush config:import\`, not a migration.",
    },
    {
      q: "A client asks you to change a single-value field to allow unlimited values on a live site full of content. What is involved?",
      a: "Very little — that is the point of Drupal's field storage design. Cardinality is a storage setting you can raise at any time, and setting it to unlimited writes \`cardinality: -1\` into \`field.storage.*\` config; no schema change happens because every configurable field already lives in its own dedicated tables keyed by entity id and a \`delta\` column. Contrast Doctrine, where going from one-to-one to many would mean a new join table and a migration. The restrictions run the other way: you can only *lower* cardinality if no entity holds more values than the new limit, and the field's type and settings like max length are frozen once rows exist.",
    },
    {
      q: "When would you re-use an existing field across content types instead of creating a new one, and what is the trade-off?",
      a: "Re-use ('Re-use an existing field' on Manage fields) shares one storage — same machine name, same database table — across bundles, while each bundle keeps its own instance config for label and requiredness. That is exactly what you want when the data is semantically the same thing, because a single Views filter, sort, or aggregation on \`field_tags\` then spans every bundle that carries it. The trade-off is that storage settings are shared: every bundle gets the same field type, target type, and cardinality, and you cannot diverge later without creating a separate field and migrating data. So re-use for shared semantics, create fresh when bundles merely happen to look similar today.",
    },
  ],

  quiz: [
    {
      question:
        "You want to make the 'Subtitle' field required on Articles but optional on Pages. Which config layer holds the 'required' setting?",
      options: [
        "field.storage.node.field_subtitle — storage is where constraints live",
        "field.field.node.<bundle>.field_subtitle — required is a per-bundle instance setting",
        "node.type.article — the content type config",
        "core.entity_form_display — the form display config",
      ],
      answerIndex: 1,
      explain:
        "Required, label, help text, and default value are instance settings in field.field.node.<bundle>.field_subtitle, so each bundle sharing the storage can set them independently. Storage only holds the type, type settings, and cardinality.",
    },
    {
      question:
        "A text field already has 5,000 rows of data. Which change can you still make in the UI?",
      options: [
        "Switch its type from Text (plain) to Number",
        "Reduce its max length from 255 to 100",
        "Edit its label, help text, and required flag",
        "Rename its machine name from field_subtitle to field_deck",
      ],
      answerIndex: 2,
      explain:
        "Once data exists, the type can never change and type-level storage settings like max length are rendered disabled — the form warns that some settings 'cannot be changed once data has been created'. Machine names are permanent from creation. Instance settings — label, help, required, default — stay editable forever.",
    },
    {
      question: "What does 'Re-use an existing field' on the Manage fields page actually create?",
      options: [
        "A duplicated field.storage config with a new machine name",
        "Only a new field.field instance config that depends on the shared field.storage",
        "A new database table for the second bundle",
        "A base field definition in a custom module",
      ],
      answerIndex: 1,
      explain:
        "Re-use attaches the existing storage (and its table) to another bundle by creating just the per-bundle instance YAML, which lists field.storage.node.field_x as a config dependency. The bundle gets its own label and required setting, but shares type, cardinality, and data storage.",
    },
    {
      question: "In field.storage YAML, what does 'cardinality: -1' mean, and what schema change does saving it trigger?",
      options: [
        "Unlimited values; none — the field's dedicated delta table already handles any number of values",
        "Unlimited values; Drupal generates and runs a join-table migration",
        "The field is disabled; its table is dropped",
        "One value; a NOT NULL constraint is added",
      ],
      answerIndex: 0,
      explain:
        "-1 is the 'unlimited' cardinality constant. Because every configurable field stores values in its own table keyed by (entity_id, delta), moving between 1, 5, and unlimited values is pure config — the schema never changes, unlike adding a Doctrine join table.",
    },
  ],
};

export default lesson;
